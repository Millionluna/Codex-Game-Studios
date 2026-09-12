import { execFileSync, fork, spawn, type ChildProcess } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign as signBytes, X509Certificate } from "node:crypto";
import { statSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { connect as tcpConnect, createServer, type Server, type Socket } from "node:net";
import type { TLSSocket } from "node:tls";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ cookie: vi.fn(), http: vi.fn(), pg: [] as FakePg[],
  query: undefined as undefined | ((sql: string, values?: unknown[]) => Promise<unknown>) }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase-server", () => ({ createCareslinkServerSupabaseClient: io.cookie }));
vi.mock("pg", () => ({ Client: class { constructor(config: Record<string, unknown>) { return new FakePg(config); } } }));
// Replace only fixed test-address resolution. Every request, socket, TLS check,
// HTTP frame and response event below comes from actual Node HTTPS.
vi.mock("node:https", async original => ({ ...await original<typeof import("node:https")>(), request: io.http }));
import { createCommunicationNoteWorkspaceTaskClientRuntime as compose,
  type CommunicationNoteWorkspaceTaskClientBinding as Binding } from "./communication-note-workspace-task-client.server";
import { createCommunicationNoteWorkspaceHandler } from "./communication-note-workspace.server";
import { createTaskPreviewHttpCustody } from "./communication-note-task-preview-client.server";
import { createTaskPreviewAssertionProvider } from "./communication-note-task-preview-signer.server";
import { TASK_PREVIEW_TRANSPORT_PATHS as PATHS, type TaskPreviewCommand } from "./communication-note-task-preview-protocol.server";
import type { CommunicationNoteTaskLeaseScope as Scope } from "./communication-note-workspace-task-lease.server";
import { COMMUNICATION_NOTE_JOB_LIST_SQL as SQL } from "./v1/communication-note-job-list-repository.server";

const REF = "abcdefghijklmnopqrst", PROJECT = "prj_1234567890abcdef", HOST = "task-preview.invalid", ORIGIN = "https://" + HOST;
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TIME = "2026-09-11T01:00:00.000000Z", CALLER = "careslink_v1_generation_job_list_caller";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }), require = createRequire(import.meta.url);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const identity = { origin: ORIGIN, issuer: "https://task-backend.invalid/", subject: "task-workspace-backend", keyId: "task-key-v1",
  publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString() };
type Lease = { scope: Scope; state: string; role: string | null; expiresAt: string | null;
  roleCount: number; sessionCount: number; membershipCount: number };
type Message = { type: string; [key: string]: unknown };
type Wire = { path: string; signal: AbortSignal; startedAborted: boolean; client: ClientRequest; secure: boolean; closed: Promise<void>; didClose: boolean };
const leases = new Map<string, Lease>(), calls: { op: string; scope?: Scope }[] = [], wire: Wire[] = [];
const controllers: AbortController[] = [];
let epoch: unknown, ledgerReady = false, root: string, ca: Buffer, cert: Buffer, key: Buffer, pin: string;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function bound<T>(work: Promise<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LOCAL_HTTPS_PROCESS_TIMEOUT")), ms); })]); }
  finally { clearTimeout(timer); }
}
function control() { const c = new AbortController(); controllers.push(c); return c; }
function scope(userId = USER, sessionId = SESSION): Scope { return { requestId: randomBytes(16).toString("hex"), projectRef: REF,
  purpose: "COMMUNICATION_NOTE_JOB_LIST_READ", callerRole: CALLER, principal: { userId, sessionId, transport: "COOKIE" } }; }
function protocol(op: string, data: Record<string, unknown>) {
  if (!["start", "inventory", "ready", "issue", "fence", "finalize"].includes(op)) throw new Error("UNEXPECTED_PROTOCOL_OPERATION");
  calls.push({ op, scope: data.scope as Scope | undefined });
  if (op === "start") { epoch = data.epoch; ledgerReady = false; return { projectRef: REF, epoch, ready: false }; }
  if (["inventory", "ready", "issue"].includes(op) && data.epoch !== epoch) throw new Error("STALE_EPOCH");
  if (op === "inventory") return { projectRef: REF, epoch, leases: [...leases.values()].filter(l => l.state !== "REVOKED")
    .map(({ scope, state, expiresAt }) => ({ scope, state, expiresAt })) };
  if (op === "ready") { if ([...leases.values()].some(l => l.state !== "REVOKED")) throw new Error("RECOVER_FIRST");
    ledgerReady = true; return { projectRef: REF, epoch, ready: true }; }
  const s = data.scope as Scope; let l = leases.get(s.requestId);
  if (l && JSON.stringify(l.scope) !== JSON.stringify(s)) throw new Error("WRONG_SCOPE");
  if (op === "issue") { if (!ledgerReady || l) throw new Error("NO_ISSUE");
    l = { scope: s, state: "ISSUED", role: data.role as string, expiresAt: data.expiresAt as string,
      roleCount: 1, sessionCount: 0, membershipCount: 2 }; leases.set(s.requestId, l); }
  if (op === "fence") {
    if (!l) { l = { scope: s, state: "REVOKED", role: null, expiresAt: null, roleCount: 0, sessionCount: 0, membershipCount: 0 }; leases.set(s.requestId, l); }
    else if (l.state === "ISSUED") l.state = "FENCED";
  }
  if (op === "finalize") { if (!l || l.state === "ISSUED") throw new Error("FENCE_FIRST");
    Object.assign(l, { state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 }); }
  return { ...l };
}
async function listenerClosed(port: number) {
  const socket = tcpConnect({ host: "127.0.0.1", port });
  try { await bound(new Promise<void>((resolve, reject) => {
    socket.once("connect", () => { socket.destroy(); reject(new Error("LOCAL_LISTENER_REMAINS")); });
    socket.once("error", (e: NodeJS.ErrnoException) => { socket.destroy(); if (e.code === "ECONNREFUSED") resolve(); else reject(e); });
  })); } finally { socket.destroy(); }
}
function cookie(userId = USER, sessionId = SESSION) {
  const state = { userId, sessionId, active: true };
  return { state, auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: state.userId, session_id: state.sessionId } }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: { id: state.userId } }, error: null })) },
  rpc: vi.fn(async (name: string) => {
    if (name === "resolve_v1_current_session_status") return { data: state.active ? "ACTIVE" : "REVOKED", error: null };
    if (name === "list_v1_shadow_documents") return { data: { documents: [], nextCursor: null, hasMore: false }, error: null };
    throw new Error("Unexpected Cookie capability");
  }) };
}
// Only the external PG replies are simulated. The actual task PG reader owns
// its fixed queries, transaction/session lifecycle and credential disposal.
class FakePg {
  password: unknown; connectionParameters: { password: unknown };
  connection = { stream: { encrypted: true, authorized: true, destroy: vi.fn() } };
  end = vi.fn(async () => {}); on = vi.fn(() => this);
  constructor(public config: Record<string, unknown>) { this.password = config.password; this.connectionParameters = { password: config.password }; io.pg.push(this); }
  async connect() {}
  async query(sql: string, values?: unknown[]) {
    const replacement = await io.query?.(sql, values); if (replacement !== undefined) return replacement;
    if (sql.includes("as safe")) return { rows: [{ login: this.config.user, current: this.config.user, pid: 100 + io.pg.indexOf(this), start: TIME,
      major: 17, database: "postgres", safe: true }] };
    if (sql === `set role ${CALLER}`) return { rows: [] };
    if (sql === "select current_user::text as role") return { rows: [{ role: CALLER }] };
    if (sql === SQL) return { rows: [{ data: { tasks: [{ jobId: values![0], status: "QUEUED", createdAt: TIME, updatedAt: TIME }], nextCursor: null } }] };
    if (sql.includes("pg_terminate_backend")) return { rows: [] };
    if (sql.includes("as remaining")) return { rows: [{ remaining: 0 }] };
    throw new Error("Unexpected database capability");
  }
}
function env() { return { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "true", CARESLINK_V1_PRODUCT_API_ENABLED: "true",
  CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF: REF, CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_VERCEL_PROJECT_ID: PROJECT,
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: PROJECT,
  SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef" }; }
const request = (signal?: AbortSignal) => new Request("https://app.invalid/api/ai-documents/communication-note/documents",
  { signal, headers: { "sec-fetch-site": "same-origin", cookie: "synthetic" } });
async function harness(h: { port?: number; instanceId?: string; wires?: Wire[] }, changes: Partial<Binding> = {}) {
  const native = await vi.importActual<typeof import("node:https")>("node:https");
  io.http.mockImplementation((url: string, options: RequestOptions, receive: (r: IncomingMessage) => void) => {
    const u = new URL(url);
    if (u.origin !== ORIGIN || u.port || !h.port || !Object.values(PATHS).includes(u.pathname as typeof PATHS.issue))
      throw new Error("LOCAL_FIXED_ADDRESS_REQUIRED");
    const client = native.request(url, { ...options, port: h.port,
      lookup: (_host, opts, cb) => { if (_host !== HOST) throw new Error("LOCAL_FIXED_ADDRESS_REQUIRED");
        if (opts.all) cb(null, [{ address: "127.0.0.1", family: 4 }]); else cb(null, "127.0.0.1", 4); },
      headers: { ...options.headers, host: HOST } }, receive);
    const entry: Wire = { path: u.pathname, signal: options.signal!, startedAborted: options.signal!.aborted, client, secure: false,
      didClose: false, closed: new Promise(resolve => client.once("close", () => { entry.didClose = true; resolve(); })) };
    wire.push(entry); h.wires?.push(entry);
    client.on("socket", socket => socket.once("secureConnect", () => {
      const tls = socket as TLSSocket;
      entry.secure = tls.encrypted && tls.authorized && tls.alpnProtocol === "http/1.1" && !tls.isSessionReused() &&
        ["TLSv1.2", "TLSv1.3"].includes(tls.getProtocol() ?? "");
    })); return client;
  });
  const commands: TaskPreviewCommand[] = [];
  const sign = vi.fn<Binding["consumeSignature"]>(async (input, _ctx, deliver) => {
    const bytes = signBytes("RSA-SHA256", input.signingInput, keys.privateKey);
    try { await deliver(bytes); } finally { bytes.fill(0); }
  });
  const binding: Binding = { projectRef: REF, vercelProjectId: PROJECT, ca: Buffer.from("synthetic-PG-CA"),
    caSha256: sha(Buffer.from("synthetic-PG-CA")), identity, instanceId: h.instanceId!,
    serviceCa: Buffer.from(ca), serviceCaSha256: sha(ca), serviceSpkiSha256: pin, consumeSignature: sign, ...changes };
  const auth = cookie(); io.cookie.mockResolvedValue(auth);
  const runtime = compose({ env: env(), binding }); expect(runtime).toBeDefined();
  const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime: runtime! });
  const custody = (s = scope()) => {
    const signer = createTaskPreviewAssertionProvider({ projectRef: REF, identity: binding.identity, instanceId: binding.instanceId,
      principal: s.principal, consumeSignature: sign });
    return { scope: s, client: createTaskPreviewHttpCustody({ projectRef: binding.projectRef, identity: binding.identity, instanceId: binding.instanceId,
      serviceCa: binding.serviceCa, serviceCaSha256: binding.serviceCaSha256, serviceSpkiSha256: binding.serviceSpkiSha256, principal: s.principal,
      consumeAssertion: (command, ctx, use) => { commands.push(command); return signer.consumeAssertion(command, ctx, use); } }) };
  };
  return { binding, auth, runtime: runtime!, handle, sign, custody, commands };
}

/** Local recovery admission only. Old failed cleanup and unavailable native
 * descendant events never become successful evidence through a new generation. */
type Role = "controller" | "launcher" | "service";
type Descendant = Exclude<Role, "controller">;
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type Tracked = { child: ChildProcess; exited: Promise<Exit>; closed: Promise<Exit>;
  didExit: boolean; didClose: boolean; output: Buffer[]; errors: Error[] };
type Audit = { server: Server; ready: Promise<void>; closed: Promise<void>; didClose: boolean;
  socket?: Socket; streams: { socket: Socket; closed: Promise<void>; end: boolean; close: boolean }[];
  box: ReturnType<typeof mailbox>; invalid: boolean; sequence: number; reportedPid: number; role: Descendant; path: string };
type Watcher = { process: Tracked; box: ReturnType<typeof mailbox>; pid: number; attested: boolean };
type Gate = { op: string; afterCommit: boolean; entered: ReturnType<typeof deferred>;
  release: ReturnType<typeof deferred>; used: boolean; replay?: () => Promise<void>;
  nonce?: string; target?: Scope; seen?: { nonce: string; id: number; scope?: Scope }; work?: Promise<void> };
type RpcTrace = { nonce: string; id: number; op: string; scope: Scope | null;
  before: ReturnType<typeof ledgerRows>; after: ReturnType<typeof ledgerRows>;
  committed: boolean; failed: boolean; fault?: string; inventory?: unknown };
type OperationFault = { op: "fence" | "finalize"; target: Scope; phase: "BEFORE_COMMIT" | "AFTER_COMMIT" };
type InventoryFault = "DUPLICATE" | "FIVE" | "WRONG_EPOCH";
type StartOptions = { mode?: string; launcherTimeout?: number; gates?: Gate[]; failOp?: string;
  waitReady?: boolean; fromNonce?: string; caseId?: string; fault?: OperationFault; inventoryFault?: InventoryFault };
type Fixture = { controller: Tracked; nonce: string; index: number; pids: Record<Role, number>; sequences: Record<Role, number>;
  box: ReturnType<typeof mailbox>; audits: Record<Descendant, Audit>; watchers: Partial<Record<Descendant, Watcher>>;
  teardown: Partial<Record<Descendant, Watcher>>; gates: Gate[]; rpc: Set<Promise<void>>; dropped: number;
  retired: boolean; mode: string; death?: "normal" | "SIGKILL"; releaseChallenge?: string; listenerClosed: boolean; done: boolean;
  port?: number; instanceId?: string; identityConfirmed: boolean; failOp?: string; fromNonce?: string;
  consumed: boolean; admissions: { allowed: boolean; reason: string | null }[]; ops: string[];
  wires: Wire[]; requests: Set<Promise<Response>>; responses: number[]; neverOpened: boolean;
  startup: "STARTING" | "READY" | "FAILED"; shutdownOrder?: "CONTROLLER_FIRST" | "FAILED_STARTUP_SERVICE_FIRST";
  inspections: { phase: string; state: unknown; listening: unknown; address: unknown }[];
  ledgers: { phase: string; epoch: unknown; brokerReady: boolean; leases: ReturnType<typeof ledgerRows> }[];
  caseId?: string; trace: RpcTrace[];
  interruption?: { op: string; afterCommit: boolean; nonce: string; id: number; scope: Scope | null };
  replays?: { sourceNonce: string; id: number; op: string; scope: Scope; droppedBefore: number; droppedAfter: number }[];
  fault?: OperationFault & { nonce: string; used: boolean }; inventoryFault?: InventoryFault };
const gate = (op: string, afterCommit = false): Gate => ({ op, afterCommit, entered: deferred(), release: deferred(), used: false });
const isolated = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" } as const;
const descendants = ["launcher", "service"] as const;
const fixtures: Fixture[] = [], processes: Tracked[] = [], audits: Audit[] = [], requests: Promise<Response>[] = [];
let allResourcesClosed = true, generation = 0;
function track(child: ChildProcess): Tracked {
  const p = { child, didExit: false, didClose: false, output: [] as Buffer[], errors: [] as Error[] } as Tracked;
  p.exited = new Promise(r => child.once("exit", (code, signal) => { p.didExit = true; r({ code, signal }); }));
  p.closed = new Promise(r => child.once("close", (code, signal) => { p.didClose = true; r({ code, signal }); }));
  child.on("error", e => p.errors.push(e));
  child.stderr!.on("data", b => { if (p.output.reduce((n, v) => n + v.length, 0) < 8192) p.output.push(Buffer.from(b)); });
  processes.push(p); return p;
}
function mailbox() {
  const messages: Message[] = [], listeners = new Set<() => void>(); let failed = false, ended = false;
  const notify = () => listeners.forEach(f => f());
  return { messages, get failed() { return failed; },
    push(raw: unknown) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as Message).type !== "string") failed = true;
      else messages.push(raw as Message);
      notify();
    },
    fail() { failed = true; notify(); }, end() { ended = true; notify(); },
    async wait(type: string, match: (m: Message) => boolean = () => true) {
      let check!: () => void;
      try { return await bound(new Promise<Message>((resolve, reject) => {
        check = () => {
          const found = messages.find(m => m.type === type && match(m));
          if (failed) reject(new Error("CONTROLLER_EVIDENCE_INVALID"));
          else if (found) resolve(found); else if (ended) reject(new Error("CONTROLLER_CHANNEL_ENDED: " + type));
        }; listeners.add(check); check();
      })); } finally { listeners.delete(check); }
    },
  };
}
function lines(stream: NodeJS.ReadableStream) {
  const box = mailbox(); let input = "";
  stream.on("data", chunk => {
    input += chunk.toString(); if (input.length > 8192) { box.fail(); input = ""; return; }
    while (input.includes("\n")) {
      const i = input.indexOf("\n");
      try { box.push(JSON.parse(input.slice(0, i))); } catch { box.fail(); }
      input = input.slice(i + 1);
    }
  });
  stream.on("error", () => box.fail()); stream.on("end", () => { if (input) box.fail(); box.end(); }); return box;
}
const exact = (m: Message, fields: string[]) =>
  Object.keys(m).sort().join("|") === ["type", "nonce", "role", "pid", "seq", ...fields].sort().join("|");
const auditFields: Record<string, string[]> = {
  hello: ["parentPid"], alive: ["challenge"], ready: ["address", "instanceId"], "startup-failed": [], "fixture-failed": ["reason"],
  checkpoint: ["operation"], "owner-finished": ["state", "cleanupConfirmed"], "ipc-lost": [],
  "broker-send-failed": ["id"],
  inspection: ["challenge", "health", "address", "listening"], "exit-released": ["challenge"],
  "child-exit": ["childRole", "childPid", "code", "signal"], "child-close": ["childRole", "childPid", "code", "signal"],
};
function audit(path: string, role: Descendant, nonce: string): Audit {
  const a = { role, path, streams: [], box: mailbox(), invalid: false, sequence: 0, reportedPid: 0, didClose: false } as unknown as Audit;
  a.server = createServer(socket => {
    const stream = { socket, end: false, close: false, closed: Promise.resolve() };
    stream.closed = new Promise(r => socket.once("close", () => { stream.close = true; r(); })); a.streams.push(stream);
    socket.on("error", () => { a.invalid = true; });
    if (a.socket) { a.invalid = true; socket.destroy(); return; }
    a.socket = socket; let input = ""; socket.setEncoding("utf8");
    socket.on("data", chunk => {
      input += chunk;
      if (input.length > 8192) { a.invalid = true; input = ""; return; }
      while (input.includes("\n")) {
        const i = input.indexOf("\n"), line = input.slice(0, i); input = input.slice(i + 1);
        try {
          const m = JSON.parse(line) as Message, fields = auditFields[m.type];
          if (!fields || !exact(m, fields) || m.nonce !== nonce || m.role !== role ||
            !Number.isSafeInteger(m.pid) || (m.pid as number) <= 1 || m.pid === process.pid ||
            m.seq !== a.sequence + 1 || (a.reportedPid && m.pid !== a.reportedPid) ||
            (!a.reportedPid && m.type !== "hello") ||
            (role === "launcher" && !["hello", "alive", "child-exit", "child-close"].includes(m.type))) throw new Error("INVALID_AUDIT");
          a.sequence++; a.reportedPid = m.pid as number; a.box.push(m);
        } catch { a.invalid = true; } // Sticky failure; valid release evidence remains usable for teardown only.
      }
    });
    socket.on("end", () => { stream.end = true; if (input) a.invalid = true; a.box.end(); socket.end(); });
  });
  a.closed = new Promise(r => a.server.once("close", () => { a.didClose = true; r(); }));
  a.server.on("error", () => { a.invalid = true; a.box.fail(); });
  a.ready = new Promise((resolve, reject) => { a.server.once("error", reject); a.server.listen(path, resolve); });
  audits.push(a); return a;
}
function observe(f: Fixture, role: Descendant, timeoutMs = 15000): Watcher {
  const p = track(spawn("/usr/bin/python3", ["-I", "-B", resolve("scripts/preview-e2e/communication-note-task-process-observer.py")],
    { env: isolated, stdio: ["pipe", "pipe", "pipe"] }));
  const box = lines(p.child.stdout!);
  p.child.stdin!.on("error", () => box.fail());
  p.child.stdin!.end(JSON.stringify({ pid: f.pids[role], nonce: f.nonce, timeoutMs }) + "\n");
  return { process: p, box, pid: f.pids[role], attested: false };
}
async function send(f: Fixture, fields: Record<string, unknown>) {
  await bound(new Promise<void>((resolve, reject) => {
    f.controller.child.send({ ...fields, nonce: f.nonce }, error => error ? reject(new Error("CONTROLLER_SEND_FAILED")) : resolve());
  }));
}
async function pingIpc(f: Fixture, target: Role) {
  const challenge = randomBytes(16).toString("hex"); await send(f, { type: "ping", target, challenge });
  const parentPid = target === "controller" ? process.pid : f.pids[target === "launcher" ? "controller" : "launcher"];
  expect(await f.box.wait("alive", m => m.role === target && m.challenge === challenge))
    .toMatchObject({ nonce: f.nonce, pid: f.pids[target], parentPid });
}
async function auditCommand(f: Fixture, role: Descendant, type: string) {
  const challenge = randomBytes(16).toString("hex");
  await bound(new Promise<void>((resolve, reject) => {
    f.audits[role].socket!.write(JSON.stringify({ type, nonce: f.nonce, challenge }) + "\n", error => error ? reject(error) : resolve());
  })); return challenge;
}
async function pingAudit(f: Fixture, role: Descendant) {
  const challenge = await auditCommand(f, role, "ping");
  expect(await f.audits[role].box.wait("alive", m => m.challenge === challenge)).toMatchObject({ nonce: f.nonce, pid: f.pids[role], role });
}
async function reply(f: Fixture, fields: Record<string, unknown>) {
  if (f.retired || !f.controller.child.connected) { f.dropped++; return; }
  try { await send(f, fields); } catch (error) {
    if (f.retired || !f.controller.child.connected) f.dropped++; else throw error;
  }
}
function matchesGate(f: Fixture, m: Message, g: Gate) {
  if (g.used || g.op !== m.op || (g.nonce && g.nonce !== f.nonce)) return false;
  return !g.target || JSON.stringify(g.target) === JSON.stringify((m.data as Message).scope);
}
function operationFault(f: Fixture, m: Message) {
  const fault = f.fault;
  if (!fault || fault.used || fault.nonce !== f.nonce || fault.op !== m.op ||
    JSON.stringify(fault.target) !== JSON.stringify((m.data as Message).scope)) return undefined;
  fault.used = true; return fault.phase;
}
// Corrupt only the broker's reply copy. No invented inventory row enters the Map.
function inventoryReply(value: unknown, fault: InventoryFault) {
  const copy = structuredClone(value) as { epoch: string; leases: { scope: Scope; state: string; expiresAt: string | null }[] };
  if (fault === "DUPLICATE") copy.leases.push(structuredClone(copy.leases[0]));
  if (fault === "FIVE") {
    while (copy.leases.length < 5) copy.leases.push({ ...structuredClone(copy.leases[0]), scope: scope() });
    expect(new Set(copy.leases.map(l => l.scope.requestId)).size).toBe(5);
  }
  if (fault === "WRONG_EPOCH") copy.epoch = copy.epoch === "0".repeat(32) ? "1".repeat(32) : "0".repeat(32);
  return copy;
}
function executeProtocol(f: Fixture, m: Message) {
  const data = m.data as Record<string, unknown>, before = ledgerRows();
  const fault = operationFault(f, m), corrupt = m.op === "inventory" ? f.inventoryFault : undefined;
  let value: unknown, failed = false, committed = false;
  f.ops.push(m.op as string);
  try {
    if (m.op === f.failOp || fault === "BEFORE_COMMIT") throw new Error("RECOVERY_INJECTED_FAILURE");
    value = protocol(m.op as string, data); committed = true;
    if (fault === "AFTER_COMMIT") throw new Error("RECOVERY_ACK_LOST");
    if (corrupt) value = inventoryReply(value, corrupt);
  } catch { failed = true; value = undefined; }
  if (f.caseId) f.trace.push({ nonce: f.nonce, id: m.id as number, op: m.op as string,
    scope: data.scope ? structuredClone(data.scope as Scope) : null,
    before, after: ledgerRows(), committed, failed, ...(fault || corrupt ? { fault: fault ?? corrupt } : {}),
    ...(m.op === "inventory" ? { inventory: structuredClone(value) } : {}) });
  return { type: "protocol-reply", id: m.id, value, failed };
}
function rpc(f: Fixture, m: Message) {
  const pause = f.gates.find(g => matchesGate(f, m, g));
  if (pause) {
    pause.used = true;
    pause.seen = { nonce: f.nonce, id: m.id as number, scope: structuredClone((m.data as Message).scope as Scope | undefined) };
  }
  const work = (async () => {
    if (pause && !pause.afterCommit) { pause.entered.resolve(); await pause.release.promise; }
    // Recheck AFTER an uncommitted gate: retired work cannot mutate the Map.
    if (f.retired) { f.dropped++; return; }
    const fields = executeProtocol(f, m);
    if (pause?.afterCommit) {
      pause.replay = () => reply(f, fields); // Captures only this original R and nonce.
      pause.entered.resolve(); await pause.release.promise;
    }
    await reply(f, fields);
  })();
  if (pause) pause.work = work;
  f.rpc.add(work); void work.then(() => f.rpc.delete(work), () => { f.rpc.delete(work); f.box.fail(); });
}
function receive(f: Fixture, m: Message, role: Role) {
  if (!m || m.nonce !== f.nonce || m.role !== role || m.pid !== f.pids[role] || m.seq !== f.sequences[role] + 1)
    throw new Error("INVALID_IPC_IDENTITY");
  f.sequences[role]++;
  if (m.type === "child-spawned") {
    const next = role === "controller" ? "launcher" : "service";
    if (role === "service" || !exact(m, ["childRole", "childPid"]) || m.childRole !== next ||
      !Number.isSafeInteger(m.childPid) || (m.childPid as number) <= 1 || Object.values(f.pids).includes(m.childPid as number) ||
      m.childPid === process.pid || f.pids[next]) throw new Error("INVALID_CHILD_IDENTITY");
    f.pids[next] = m.childPid as number;
  } else if (m.type === "forward") {
    if (role === "service" || !exact(m, ["message"])) throw new Error("INVALID_FORWARD");
    receive(f, m.message as Message, role === "controller" ? "launcher" : "service"); return;
  } else {
    const fields: Record<string, string[]> = { constructed: ["parentPid", "node", "platform", "arch"],
      alive: ["parentPid", "challenge"], "protocol-call": ["id", "op", "data"],
      "child-exit": ["childRole", "childPid", "code", "signal"], "child-close": ["childRole", "childPid", "code", "signal"] };
    if (!fields[m.type] || !exact(m, fields[m.type])) throw new Error("INVALID_IPC");
    if (m.type === "protocol-call") {
      if (role !== "service" || !Number.isSafeInteger(m.id) || (m.id as number) < 1) throw new Error("INVALID_CALL");
      rpc(f, m);
    }
  }
  f.box.push(m);
}
async function start(options: StartOptions = {}) {
  const nonce = randomBytes(16).toString("hex"), index = ++generation;
  const pair = { launcher: audit(join(root, index + "-l.sock"), "launcher", nonce), service: audit(join(root, index + "-s.sock"), "service", nonce) };
  await bound(Promise.all(descendants.map(role => pair[role].ready)));
  const controller = track(fork(join(root, "child.cjs"), ["controller"], { env: isolated, execArgv: [], serialization: "advanced",
    stdio: ["ignore", "pipe", "pipe", "ipc"] }));
  controller.child.stdout!.on("data", b => controller.output.push(Buffer.from(b)));
  const f: Fixture = { controller, nonce, index, pids: { controller: controller.child.pid!, launcher: 0, service: 0 },
    sequences: { controller: 0, launcher: 0, service: 0 }, box: mailbox(), audits: pair, watchers: {}, teardown: {},
    rpc: new Set(), gates: options.gates ?? [], dropped: 0, retired: false, mode: options.mode ?? "NORMAL",
    listenerClosed: false, done: false, identityConfirmed: false, failOp: options.failOp, fromNonce: options.fromNonce,
    consumed: false, admissions: [], ops: [], wires: [], requests: new Set(), responses: [], neverOpened: false,
    startup: "STARTING", inspections: [], ledgers: [], caseId: options.caseId, trace: [],
    fault: options.fault && { ...structuredClone(options.fault), nonce, used: false }, inventoryFault: options.inventoryFault };
  fixtures.push(f); // Includes initialization, identity and observer startup failures.
  controller.child.once("disconnect", () => { f.retired = true; f.box.end(); });
  controller.child.once("exit", () => { f.retired = true; });
  controller.child.on("message", (m: Message) => { try { receive(f, m, "controller"); } catch { f.box.fail(); } });
  await send(f, { type: "init", mode: f.mode, cert, key, publicKeyPem: identity.publicKeyPem,
    auditPaths: { launcher: pair.launcher.path, service: pair.service.path } });
  for (const role of ["controller", ...descendants] as const) {
    const parentPid = role === "controller" ? process.pid : f.pids[role === "launcher" ? "controller" : "launcher"];
    expect(await f.box.wait("constructed", m => m.role === role)).toMatchObject({
      pid: f.pids[role], parentPid, node: process.version, platform: process.platform, arch: process.arch });
  }
  for (const role of descendants) {
    expect(await pair[role].box.wait("hello")).toMatchObject({ pid: f.pids[role], nonce, role,
      parentPid: f.pids[role === "launcher" ? "controller" : "launcher"] });
    expect(pair[role].invalid).toBe(false);
    const w = observe(f, role, role === "launcher" ? options.launcherTimeout : undefined); f.watchers[role] = w;
    expect(await w.box.wait("armed")).toMatchObject({ pid: f.pids[role], nonce, observerPid: w.process.child.pid });
    await pingIpc(f, role); await pingAudit(f, role); w.attested = true;
  }
  await pingIpc(f, "controller"); f.identityConfirmed = true;
  await auditCommand(f, "service", "begin");
  if (options.waitReady !== false) await ready(f);
  return f;
}
async function ready(f: Fixture) {
  const message = await f.audits.service.box.wait("ready"), address = message.address as { host: string; port: number };
  expect(address.host).toBe("127.0.0.1"); expect(address.port).toBeGreaterThan(0);
  expect(message.instanceId).toMatch(/^[a-f0-9]{64}$/);
  f.port = address.port; f.instanceId = message.instanceId as string; f.startup = "READY";
}
async function inspect(f: Fixture, phase: string) {
  const challenge = await auditCommand(f, "service", "inspect");
  const message = await f.audits.service.box.wait("inspection", m => m.challenge === challenge);
  f.inspections.push({ phase, state: (message.health as Message).state, listening: message.listening, address: message.address });
  return message;
}
async function noListener(f: Fixture, phase: string) {
  expect(await inspect(f, phase)).toMatchObject({ address: null, listening: false, health: { state: "STARTING", cleanupConfirmed: false } });
  expect(f.port).toBeUndefined(); expect(f.instanceId).toBeUndefined();
  expect(f.audits.service.box.messages.some(m => m.type === "ready")).toBe(false);
  expect(f.ops).not.toContain("issue"); snapshot(f, phase);
}
function verified(f: Fixture, w?: Watcher) {
  if (!w?.attested || !w.process.didClose || w.process.errors.length || w.box.failed ||
    w.process.child.exitCode !== 0 || w.process.child.signalCode !== null || w.box.messages.some(m => m.type === "unverified")) return false;
  const events = w.box.messages.filter(m => m.type === "kernel-exit");
  return events.length === 1 && events[0].nonce === f.nonce && events[0].pid === w.pid && events[0].observerPid === w.process.child.pid;
}
async function joinWatcher(f: Fixture, w: Watcher) {
  expect(await w.box.wait("kernel-exit")).toMatchObject({ pid: w.pid, nonce: f.nonce, observerPid: w.process.child.pid });
  expect(await bound(w.process.closed)).toEqual({ code: 0, signal: null }); expect(verified(f, w)).toBe(true);
}
async function teardownWatcher(f: Fixture, role: Descendant) {
  expect(f.controller.didExit).toBe(false);
  const w = observe(f, role); f.teardown[role] = w;
  expect(await w.box.wait("armed")).toMatchObject({ pid: f.pids[role], nonce: f.nonce, observerPid: w.process.child.pid });
  await pingIpc(f, role); await pingAudit(f, role); w.attested = true;
}
async function terminate(f: Fixture, death: "normal" | "SIGKILL") {
  expect(f.death).toBeUndefined(); expect(f.identityConfirmed).toBe(true); await pingIpc(f, "controller"); f.death = death;
  f.shutdownOrder ??= "CONTROLLER_FIRST";
  if (death === "normal") await send(f, { type: "exit-controller", challenge: randomBytes(16).toString("hex") });
  else expect(f.controller.child.kill("SIGKILL")).toBe(true);
  const expected = death === "normal" ? { code: 0, signal: null } : { code: null, signal: "SIGKILL" };
  expect(await bound(f.controller.exited)).toEqual(expected);
  expect(await bound(f.controller.closed)).toEqual(expected); expect(f.retired).toBe(true);
}
async function stopped(f: Fixture) {
  try { expect(await f.audits.service.box.wait("owner-finished")).toMatchObject({ state: "FAILED", cleanupConfirmed: false }); }
  catch (error) {
    console.info("LOCAL_CONTROLLER_FAILURE", JSON.stringify({ mode: f.mode, death: f.death,
      frames: f.audits.service.box.messages.map(m => ({ type: m.type, reason: m.reason })),
      kernelExit: verified(f, f.watchers.service) })); throw error;
  }
  if (f.port !== undefined) { await listenerClosed(f.port); f.listenerClosed = true; }
  else if (!f.neverOpened) {
    await f.audits.service.box.wait("startup-failed");
    expect(await inspect(f, "failed-startup")).toMatchObject({ address: null, listening: false, health: { state: "FAILED" } });
    expect(f.audits.service.box.messages.some(m => m.type === "ready")).toBe(false);
    expect(f.instanceId).toBeUndefined(); f.neverOpened = true; f.startup = "FAILED";
  }
}
function streamsClosed(a: Audit) { return a.streams.length === 1 && a.streams.every(s => s.end && s.close); }
async function releaseService(f: Fixture) {
  if (!f.releaseChallenge) f.releaseChallenge = await auditCommand(f, "service", "release-exit");
  await f.audits.service.box.wait("exit-released", m => m.challenge === f.releaseChallenge);
  await joinWatcher(f, f.teardown.service ?? f.watchers.service!);
}
async function finish(f: Fixture) {
  await stopped(f); await joinWatcher(f, f.teardown.launcher ?? f.watchers.launcher!);
  await releaseService(f);
  for (const role of descendants) {
    await bound(Promise.all(f.audits[role].streams.map(s => s.closed))); expect(streamsClosed(f.audits[role])).toBe(true);
  }
  await bound(Promise.all(f.wires.map(w => w.closed)));
}
function nativeDescendant(f: Fixture, role: Descendant) {
  const source = role === "launcher" ? f.box : f.audits.launcher.box;
  const owner = role === "launcher" ? "controller" : "launcher";
  const matching = (type: string) => source.messages.filter(m => m.type === type && m.role === owner &&
    m.childRole === role && m.childPid === f.pids[role]);
  const exit = matching("child-exit"), close = matching("child-close");
  expect(exit.length).toBeLessThanOrEqual(1); expect(close.length).toBeLessThanOrEqual(1);
  return { exitEvidence: exit.length ? "OBSERVED" : "UNVERIFIED", code: exit[0]?.code ?? null, signal: exit[0]?.signal ?? null,
    closeEvidence: close.length ? "OBSERVED" : "UNVERIFIED", reason: close.length ? null : "ORIGINAL_OWNER_EXITED" };
}
function report(f: Fixture) {
  const owner = f.audits.service.box.messages.find(m => m.type === "owner-finished");
  const controllerExit = { code: f.controller.child.exitCode, signal: f.controller.child.signalCode };
  const auditClosed = descendants.every(role => streamsClosed(f.audits[role]));
  const exit = descendants.every(role => verified(f, f.watchers[role]));
  const valid = exit && f.identityConfirmed && !!f.death && f.controller.didClose && !f.controller.errors.length &&
    !f.box.failed && descendants.every(role => !f.audits[role].invalid) && auditClosed && (f.listenerClosed || f.neverOpened) &&
    !f.audits.service.box.messages.some(m => m.type === "fixture-failed") &&
    owner?.state === "FAILED" && owner.cleanupConfirmed === false &&
    f.audits.service.box.messages.some(m => m.type === "exit-released" && m.challenge === f.releaseChallenge);
  return { node: process.version, platform: process.platform, arch: process.arch, generation: f.index, nonce: f.nonce,
    fromNonce: f.fromNonce ?? null, mode: f.mode, death: f.death, shutdownOrder: f.shutdownOrder,
    diagnosticEvidence: valid ? "VERIFIED" : "UNVERIFIED", controllerExit, controllerClose: f.controller.didClose,
    launcherExitEvidence: verified(f, f.watchers.launcher) ? "VERIFIED" : "UNVERIFIED",
    serviceExitEvidence: verified(f, f.watchers.service) ? "VERIFIED" : "UNVERIFIED",
    launcherNative: nativeDescendant(f, "launcher"), serviceNative: nativeDescendant(f, "service"),
    ownerOutcome: owner?.state ?? "UNVERIFIED", cleanupConfirmed: owner?.cleanupConfirmed === true,
    brokerSendFailures: f.audits.service.box.messages.filter(m => m.type === "broker-send-failed").length,
    listenerClosed: f.listenerClosed, auditChannelsClosed: auditClosed,
    auditEvidence: descendants.some(role => f.audits[role].invalid) ? "UNVERIFIED" : "VALID",
    listenerEvidence: f.neverOpened ? "NEVER_OPENED" : f.listenerClosed ? "CLOSED" : "UNVERIFIED",
    recoveryOutcome: f.fromNonce ? f.startup : "NOT_STARTED", consumed: f.consumed, admissions: f.admissions,
    operations: f.ops, inspections: f.inspections, ledgers: f.ledgers, responses: f.responses,
    caseId: f.caseId ?? null, trace: f.trace, interruption: f.interruption ?? null, replays: f.replays ?? [],
    pendingRpc: f.rpc.size, pendingRequests: f.requests.size, requestStreamsClosed: f.wires.every(w => w.didClose),
    teardownEvidence: f.done ? "CONFIRMED" : "NOT_COMPLETED" };
}
async function closeAudits(f: Fixture) {
  for (const role of descendants) {
    const a = f.audits[role];
    if (!a.didClose) a.server.close();
    await bound(a.closed); expect(a.didClose).toBe(true);
    expect((await bound(f.watchers[role]!.process.closed)).code).not.toBeUndefined();
  }
}
async function cleanup(f: Fixture) {
  if (f.done) return;
  if (!f.controller.didExit && f.fromNonce && f.audits.service.box.messages.some(m => m.type === "startup-failed")) {
    // The completed owner has removed SIGTERM handlers. Release this FAILED
    // service before L's normal parent-loss policy can signal it again.
    await stopped(f); expect(f.neverOpened).toBe(true);
    f.shutdownOrder = "FAILED_STARTUP_SERVICE_FIRST";
    await releaseService(f);
    expect(await f.audits.launcher.box.wait("child-close", m => m.childPid === f.pids.service))
      .toMatchObject({ childRole: "service", code: 1, signal: null });
  }
  if (!f.controller.didExit) {
    for (const role of descendants) {
      if (!f.watchers[role]?.attested || (f.watchers[role]!.process.didClose && !verified(f, f.watchers[role])))
        if (!f.teardown[role]) await teardownWatcher(f, role);
    }
    await terminate(f, "normal");
  }
  await finish(f); await closeAudits(f);
  expect(f.rpc.size).toBe(0); expect(f.requests.size).toBe(0);
  expect(f.audits.service.box.messages.filter(m => m.type === "fixture-failed")).toEqual([]);
  f.done = true;
}
function controllerExited(f: Fixture) {
  const expected = f.death === "normal" ? { code: 0, signal: null } : { code: null, signal: "SIGKILL" };
  return !!f.death && f.identityConfirmed && f.retired && f.controller.didExit && f.controller.didClose &&
    f.controller.child.pid === f.pids.controller && f.controller.child.exitCode === expected.code &&
    f.controller.child.signalCode === expected.signal && !f.controller.errors.length && !f.box.failed;
}
function ownerEvidence(f: Fixture) {
  const messages = f.audits.service.box.messages;
  const outcomes = messages.filter(m => m.type === "owner-finished");
  const releases = messages.filter(m => m.type === "exit-released");
  return outcomes.length === 1 && outcomes[0].state === "FAILED" && outcomes[0].cleanupConfirmed === false &&
    outcomes[0].pid === f.pids.service && outcomes[0].nonce === f.nonce &&
    !!f.releaseChallenge && releases.length === 1 && releases[0].challenge === f.releaseChallenge &&
    !messages.some(m => m.type === "fixture-failed");
}
function recoveryBlock(f: Fixture): string | undefined {
  if (f.consumed) return "ADMISSION_USED";
  if (!controllerExited(f)) return "CONTROLLER_EXIT_UNVERIFIED";
  if (!descendants.every(role => verified(f, f.watchers[role]))) return "DESCENDANT_EXIT_UNVERIFIED";
  if (descendants.some(role => f.audits[role].invalid || f.audits[role].box.failed ||
    f.audits[role].reportedPid !== f.pids[role])) return "AUDIT_EVIDENCE_INVALID";
  if (!descendants.every(role => streamsClosed(f.audits[role]) && f.audits[role].didClose)) return "AUDIT_CHANNEL_OPEN";
  if (!ownerEvidence(f)) return "OWNER_EVIDENCE_UNVERIFIED";
  if (!f.listenerClosed) return "LISTENER_UNVERIFIED";
  if (f.rpc.size || f.requests.size || f.wires.some(w => !w.didClose)) return "OLD_WORK_PENDING";
}
/** Starts recovery only; never re-labels old cleanup or grants request readiness.
 * Consume before the first async construction step, including failed starts. */
function startControllerRecovery(f: Fixture, options: Pick<StartOptions, "gates" | "failOp" | "fault" | "inventoryFault"> = {}) {
  const reason = recoveryBlock(f);
  f.admissions.push({ allowed: !reason, reason: reason ?? null });
  if (reason) throw new Error("CONTROLLER_RECOVERY_UNVERIFIED:" + reason);
  f.consumed = true;
  return start({ ...options, fromNonce: f.nonce, caseId: f.caseId, waitReady: false });
}
function resources() {
  return { generations: generation, fixtures: fixtures.length, processes: processes.length, sockets: audits.length,
    starts: calls.filter(c => c.op === "start").length };
}
async function refused(f: Fixture, reason: string) {
  const before = resources(); let unexpected: Promise<Fixture> | undefined;
  try {
    expect(() => { unexpected = startControllerRecovery(f); }).toThrow("CONTROLLER_RECOVERY_UNVERIFIED:" + reason);
    expect(resources()).toEqual(before);
  } finally { if (unexpected) await unexpected.catch(() => {}); } // Still own an accidentally started child.
}
function ledgerRows() {
  return [...leases].map(([requestId, l]) => ({ requestId, scope: structuredClone(l.scope), state: l.state, roleCount: l.roleCount,
    sessionCount: l.sessionCount, membershipCount: l.membershipCount }));
}
function snapshot(f: Fixture, phase: string) { f.ledgers.push({ phase, epoch, brokerReady: ledgerReady, leases: ledgerRows() }); }
function cleaned(count: number) {
  expect(leases.size).toBe(count);
  for (const l of leases.values()) expect(l).toMatchObject({ state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 });
}
function pgClosed() {
  for (const c of io.pg) {
    expect(c.end).toHaveBeenCalledOnce(); expect(c.connection.stream.destroy).toHaveBeenCalledOnce();
    expect(c.password).toBeUndefined(); expect(c.config.password).toBeUndefined(); expect(c.connectionParameters.password).toBeUndefined();
  }
}
function read(f: Fixture, h: Awaited<ReturnType<typeof harness>>) {
  expect(f.port).toBeDefined(); const work = h.handle(request()); requests.push(work); f.requests.add(work);
  void work.then(r => { f.requests.delete(work); f.responses.push(r.status); }, () => f.requests.delete(work));
  return work;
}
type PendingLease = { scope: Scope; state: "ISSUED" | "FENCED"; held: Gate; response: Promise<Response> };
function scopedGate(f: Fixture, op: string, target?: Scope) {
  const g = gate(op, true); g.nonce = f.nonce; g.target = target && structuredClone(target);
  f.gates.push(g); return g;
}
async function releaseGate(g: Gate) { g.release.resolve(); await bound(g.work!); }
async function pendingLease(f: Fixture, h: Awaited<ReturnType<typeof harness>>, state: PendingLease["state"]) {
  const issued = scopedGate(f, "issue"), response = read(f, h);
  await bound(issued.entered.promise);
  const target = issued.seen!.scope!;
  expect(target.requestId).toMatch(/^[a-f0-9]{32}$/);
  expect(target).toMatchObject({ projectRef: REF, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ", callerRole: CALLER,
    principal: { userId: USER, sessionId: SESSION, transport: "COOKIE" } });
  let held = issued;
  if (state === "FENCED") {
    held = scopedGate(f, "fence", target); await releaseGate(issued); await bound(held.entered.promise);
    expect(held.seen).toMatchObject({ nonce: f.nonce, scope: target });
  }
  expect(leases.get(target.requestId)).toMatchObject({ scope: target, state });
  return { scope: target, state, held, response };
}
function batchStates(items: PendingLease[], states: string[]) {
  expect(new Set(items.map(i => i.scope.requestId)).size).toBe(items.length);
  expect(items.map(i => leases.get(i.scope.requestId)?.state)).toEqual(states);
  for (const [index, item] of items.entries()) {
    const revoked = states[index] === "REVOKED";
    expect(leases.get(item.scope.requestId)).toMatchObject({ scope: item.scope,
      roleCount: revoked ? 0 : 1, sessionCount: 0, membershipCount: revoked ? 0 : 2 });
  }
}
async function loseBatch(f: Fixture, items: PendingLease[], death: "normal" | "SIGKILL") {
  const originalMap = leases, originalRows = ledgerRows(), originalEpoch = epoch;
  await terminate(f, death);
  for (const item of items) {
    const response = await item.response;
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
  }
  await finish(f); await closeAudits(f);
  expect(f.requests.size).toBe(0); expect(f.rpc.size).toBe(items.length);
  await refused(f, "OLD_WORK_PENDING");
  await releaseGate(items[0].held); expect(f.rpc.size).toBe(items.length - 1);
  await refused(f, "OLD_WORK_PENDING");
  for (const item of items.slice(1)) await releaseGate(item.held);
  await cleanup(f);
  expect(f.dropped).toBeGreaterThanOrEqual(items.length);
  expect(leases).toBe(originalMap); expect(ledgerRows()).toEqual(originalRows); expect(epoch).toBe(originalEpoch);
  batchStates(items, items.map(i => i.state)); pgClosed(); snapshot(f, "multi-before-recovery");
  return { originalMap, originalRows, originalEpoch };
}
function rowOperations(f: Fixture) {
  return f.trace.filter(t => t.op === "fence" || t.op === "finalize").map(t => ({ op: t.op, scope: t.scope }));
}
async function recoveredBatch(f: Fixture, items: PendingLease[], beforeInventory?: (next: Fixture) => Promise<void>) {
  const inventory = gate("inventory"), first = gate("finalize", true), last = gate("finalize", true), readyReply = gate("ready", true);
  first.target = structuredClone(items[0].scope); last.target = structuredClone(items.at(-1)!.scope);
  const oldEpoch = epoch, oldMap = leases;
  const constructing = startControllerRecovery(f, { gates: [inventory, first, last, readyReply] });
  await refused(f, "ADMISSION_USED"); const next = await constructing;
  await bound(inventory.entered.promise); await noListener(next, "multi-inventory-before");
  expect(epoch).not.toBe(oldEpoch); expect(leases).toBe(oldMap); batchStates(items, items.map(i => i.state));
  if (beforeInventory) await beforeInventory(next);
  inventory.release.resolve(); await bound(first.entered.promise);
  batchStates(items, ["REVOKED", ...items.slice(1).map(i => i.state)]);
  await noListener(next, "multi-first-finalize-held");
  expect(rowOperations(next)).toEqual([{ op: "fence", scope: items[0].scope }, { op: "finalize", scope: items[0].scope }]);
  await releaseGate(first); await bound(last.entered.promise); batchStates(items, items.map(() => "REVOKED"));
  await noListener(next, "multi-last-finalize-held"); expect(next.ops).not.toContain("ready");
  await releaseGate(last); await bound(readyReply.entered.promise); await noListener(next, "multi-ready-reply-held");
  await releaseGate(readyReply); await ready(next);
  expect((await inspect(next, "multi-ready")).listening).toBe(true);
  expect(next.trace.find(t => t.op === "inventory")!.inventory).toMatchObject({ epoch,
    leases: items.map(i => ({ scope: i.scope, state: i.state })) });
  expect(rowOperations(next)).toEqual(items.flatMap(i => [{ op: "fence", scope: i.scope }, { op: "finalize", scope: i.scope }]));
  expect(next.ops).toEqual(["start", "inventory", ...items.flatMap(() => ["fence", "finalize"]), "ready"]);
  expect(leases).toBe(oldMap); snapshot(next, "multi-recovered"); return next;
}
async function freshAfterBatch(f: Fixture, next: Fixture, retained: number) {
  const issues = calls.filter(c => c.op === "issue").length, pg = io.pg.length, beforeWire = wire.length;
  const stale = await harness(next, { instanceId: f.instanceId! }), rejected = await read(next, stale);
  expect(rejected.status).toBe(503); expect(await rejected.json()).not.toHaveProperty("taskPage");
  expect(calls.filter(c => c.op === "issue")).toHaveLength(issues); expect(io.pg).toHaveLength(pg);
  expect(wire.slice(beforeWire).map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]);
  const revokeReply = scopedGate(next, "finalize"), h = await harness(next); let returned = false;
  const pending = read(next, h).then(r => { returned = true; return r; });
  await bound(revokeReply.entered.promise); expect(returned).toBe(false); cleaned(retained + 1);
  await releaseGate(revokeReply); const response = await pending;
  expect(response.status).toBe(200); expect((await response.json()).taskPage.tasks[0].jobId).toBe(USER);
  expect(wire.slice(beforeWire).every(w => w.secure)).toBe(true); pgClosed(); snapshot(next, "multi-fresh-request-revoked");
  expect(report(f).cleanupConfirmed).toBe(false);
}
async function prepareBatch(caseId: string, states: PendingLease["state"][]) {
  const f = await start({ caseId }), h = await harness(f), items: PendingLease[] = [];
  for (const state of states) items.push(await pendingLease(f, h, state));
  expect(f.requests.size).toBe(items.length);
  const retained = await loseBatch(f, items, "SIGKILL"); return { f, items, ...retained };
}
async function failedBatch(f: Fixture, options: Pick<StartOptions, "fault" | "inventoryFault">) {
  const pg = io.pg.length, oldMap = leases;
  const constructing = startControllerRecovery(f, options);
  await refused(f, "ADMISSION_USED"); const next = await constructing;
  await next.audits.service.box.wait("startup-failed"); await stopped(next);
  expect(next.neverOpened).toBe(true); expect(next.port).toBeUndefined(); expect(next.instanceId).toBeUndefined();
  expect(next.audits.service.box.messages.some(m => m.type === "ready")).toBe(false);
  expect(next.ops).not.toContain("ready"); expect(next.ops).not.toContain("issue"); expect(io.pg).toHaveLength(pg);
  expect(leases).toBe(oldMap); snapshot(next, "multi-recovery-failed");
  await cleanup(next); await refused(f, "ADMISSION_USED"); await refused(next, "LISTENER_UNVERIFIED");
  expect(fixtures).toHaveLength(2); expect(calls.filter(c => c.op === "start")).toHaveLength(2);
  expect(report(next)).toMatchObject({ recoveryOutcome: "FAILED", listenerEvidence: "NEVER_OPENED",
    shutdownOrder: "FAILED_STARTUP_SERVICE_FIRST", ownerOutcome: "FAILED", cleanupConfirmed: false, teardownEvidence: "CONFIRMED" });
  expect(report(next).serviceNative).toEqual({ exitEvidence: "OBSERVED", code: 1, signal: null, closeEvidence: "OBSERVED", reason: null });
  return next;
}
function partialFailure(next: Fixture, items: PendingLease[], op: OperationFault["op"], phase: OperationFault["phase"]) {
  const expected = [{ op: "fence", scope: items[0].scope }, { op: "finalize", scope: items[0].scope },
    { op: "fence", scope: items[1].scope }, ...(op === "finalize" ? [{ op, scope: items[1].scope }] : [])];
  expect(rowOperations(next)).toEqual(expected);
  expect(next.ops).toEqual(["start", "inventory", ...expected.map(e => e.op)]);
  expect(next.fault).toMatchObject({ nonce: next.nonce, target: items[1].scope, used: true, op, phase });
  expect(next.trace.filter(t => t.failed)).toHaveLength(1);
  expect(next.trace.at(-1)).toMatchObject({ scope: items[1].scope, fault: phase, committed: phase === "AFTER_COMMIT", failed: true });
  const final = op === "fence" ? "ISSUED" : phase === "AFTER_COMMIT" ? "REVOKED" : "FENCED";
  batchStates(items, ["REVOKED", final, "ISSUED"]);
}
type RecoveryPoint = "inventory" | "fence" | "finalize" | "ready";
function interruptedLedger(next: Fixture, items: PendingLease[], point: RecoveryPoint) {
  const operations = items.flatMap(i => [{ op: "fence", scope: i.scope }, { op: "finalize", scope: i.scope }]);
  const completed = { inventory: 0, fence: 1, finalize: 2, ready: 4 }[point];
  expect(rowOperations(next)).toEqual(operations.slice(0, completed));
  expect(next.ops).toEqual(["start", ...(point === "inventory" ? [] : ["inventory"]),
    ...operations.slice(0, completed).map(o => o.op), ...(point === "ready" ? ["ready"] : [])]);
  const states = { inventory: ["ISSUED", "ISSUED"], fence: ["FENCED", "ISSUED"],
    finalize: ["REVOKED", "ISSUED"], ready: ["REVOKED", "REVOKED"] }[point];
  batchStates(items, states); expect(leases.size).toBe(2); expect(ledgerReady).toBe(point === "ready");
  expect(next.trace.every(t => t.committed && !t.failed && !t.fault && t.nonce === next.nonce)).toBe(true);
  if (point !== "inventory") expect(next.trace.find(t => t.op === "inventory")!.inventory).toMatchObject({ epoch,
    leases: items.map(i => ({ scope: i.scope, state: "ISSUED" })) });
}
async function holdRecovery(f: Fixture, items: PendingLease[], point: RecoveryPoint) {
  const inventory = gate("inventory"), held = point === "inventory" ? inventory : gate(point, true);
  if (point === "fence" || point === "finalize") held.target = structuredClone(items[0].scope);
  const oldEpoch = epoch, oldMap = leases;
  const constructing = startControllerRecovery(f, { gates: held === inventory ? [held] : [inventory, held] });
  await refused(f, "ADMISSION_USED"); const next = await constructing;
  inventory.nonce = next.nonce; held.nonce = next.nonce;
  expect(next.controller.child).not.toBe(f.controller.child); expect(next.nonce).not.toBe(f.nonce);
  for (const role of descendants) {
    expect(next.audits[role].path).not.toBe(f.audits[role].path);
    expect(next.watchers[role]).not.toBe(f.watchers[role]);
  }
  await bound(inventory.entered.promise); await noListener(next, "interruption-inventory-before");
  expect(epoch).not.toBe(oldEpoch); expect(leases).toBe(oldMap); batchStates(items, ["ISSUED", "ISSUED"]);
  if (held !== inventory) { await releaseGate(inventory); await bound(held.entered.promise); }
  expect(held.seen).toMatchObject({ nonce: next.nonce });
  expect(held.seen!.scope).toEqual(held.target);
  expect(next.box.messages.some(m => m.type === "protocol-call" && m.id === held.seen!.id && m.op === point)).toBe(true);
  next.interruption = { op: point, afterCommit: held.afterCommit, nonce: held.seen!.nonce,
    id: held.seen!.id, scope: held.seen!.scope ?? null };
  const executed = next.trace.filter(t => t.id === held.seen!.id);
  expect(executed).toHaveLength(held.afterCommit ? 1 : 0);
  if (held.afterCommit) expect(executed[0]).toMatchObject({ op: point, nonce: next.nonce,
    scope: held.target ?? null, committed: true, failed: false });
  await noListener(next, "interruption-" + point + "-held"); interruptedLedger(next, items, point);
  expect(next.rpc.size).toBe(1); expect(next.startup).toBe("STARTING");
  expect(next.audits.service.box.messages.some(m => m.type === "startup-failed")).toBe(false);
  return { next, held };
}
function recoveryState(f: Fixture) {
  return { epoch, brokerReady: ledgerReady, rows: ledgerRows(), operations: [...f.ops], trace: structuredClone(f.trace),
    calls: calls.length, pg: io.pg.length, wires: wire.length };
}
async function interruptRecovery(f: Fixture, next: Fixture, held: Gate, death: "normal" | "SIGKILL") {
  const before = recoveryState(next), originalMap = leases, dropped = next.dropped;
  await terminate(next, death); await stopped(next);
  expect(recoveryState(next)).toEqual(before); snapshot(next, "interruption-controller-exited");
  await finish(next); await closeAudits(next);
  expect(next.rpc.size).toBe(1); expect(next.done).toBe(false);
  await releaseGate(held); expect(next.rpc.size).toBe(0); expect(next.dropped).toBe(dropped + 1);
  expect(recoveryState(next)).toEqual(before); snapshot(next, "interruption-rpc-settled");
  if (held.afterCommit) {
    expect(held.replay).toBeTypeOf("function"); await held.replay!();
    expect(next.dropped).toBe(dropped + 2); expect(recoveryState(next)).toEqual(before);
    snapshot(next, "interruption-reply-replayed");
  } else expect(held.replay).toBeUndefined();
  await cleanup(next); await refused(f, "ADMISSION_USED"); await refused(next, "LISTENER_UNVERIFIED");
  expect(next.consumed).toBe(false); expect(fixtures).toHaveLength(2);
  expect(calls.filter(c => c.op === "start")).toHaveLength(2); expect(leases).toBe(originalMap);
  expect(next.port).toBeUndefined(); expect(next.instanceId).toBeUndefined();
  expect(next.wires).toEqual([]); expect(next.responses).toEqual([]); expect(next.requests.size).toBe(0);
  expect(next.audits.service.box.messages.some(m => m.type === "ready")).toBe(false);
  expect(next.ops).not.toContain("issue"); pgClosed();
  expect(report(next)).toMatchObject({ recoveryOutcome: "FAILED", listenerEvidence: "NEVER_OPENED",
    shutdownOrder: "CONTROLLER_FIRST", diagnosticEvidence: "VERIFIED", ownerOutcome: "FAILED",
    cleanupConfirmed: false, teardownEvidence: "CONFIRMED", pendingRpc: 0, pendingRequests: 0 });
  expect(report(f).cleanupConfirmed).toBe(false);
}
type RetiredReply = { fixture: Fixture; held: Gate };
async function replayGenerations(next: Fixture, sources: RetiredReply[]) {
  const chain = [...sources.map(s => s.fixture), next], before = chain.map(recoveryState);
  expect(next.rpc.size).toBe(1); expect(next.ops).toEqual(["start"]); expect(ledgerReady).toBe(false);
  for (const { fixture: old, held } of sources) {
    expect(old.retired && old.done).toBe(true); expect(old.rpc.size).toBe(0);
    expect(held.seen).toMatchObject({ nonce: old.nonce }); expect(held.seen!.scope).toBeDefined();
    expect(old.trace.filter(t => t.id === held.seen!.id)).toEqual([expect.objectContaining({
      nonce: old.nonce, op: held.op, scope: held.seen!.scope, committed: true, failed: false })]);
    const droppedBefore = old.dropped;
    expect(held.replay).toBeTypeOf("function"); await held.replay!();
    expect(old.dropped).toBe(droppedBefore + 1); expect(chain.map(recoveryState)).toEqual(before);
    (next.replays ??= []).push({ sourceNonce: old.nonce, id: held.seen!.id, op: held.op,
      scope: structuredClone(held.seen!.scope!), droppedBefore, droppedAfter: old.dropped });
    await noListener(next, "successive-replayed-" + old.nonce);
  }
  expect(next.replays).toHaveLength(2); expect(next.rpc.size).toBe(1);
}
function retainedRows(expected: ReturnType<typeof ledgerRows>) {
  const ids = new Set(expected.map(r => r.requestId));
  expect(ledgerRows().filter(r => ids.has(r.requestId))).toEqual(expected);
}
function successiveIdentity(chain: Fixture[], epochs: unknown[]) {
  expect(fixtures).toEqual(chain); expect(chain).toHaveLength(3);
  expect(new Set(epochs).size).toBe(3); epochs.forEach(value => expect(value).toMatch(/^[a-f0-9]{32}$/));
  expect(new Set(chain.map(f => f.nonce)).size).toBe(3);
  expect(new Set(chain.map(f => f.instanceId)).size).toBe(3);
  expect(new Set(chain.map(f => f.controller.child)).size).toBe(3);
  expect(chain.map(f => f.fromNonce)).toEqual([undefined, chain[0].nonce, chain[1].nonce]);
  expect(chain.map(f => f.consumed)).toEqual([true, true, false]);
  expect(chain.map(f => f.startup)).toEqual(["READY", "READY", "READY"]);
  expect(ledgerReady).toBe(true);
  for (const role of descendants) {
    expect(new Set(chain.map(f => f.audits[role].path)).size).toBe(3);
    expect(new Set(chain.map(f => f.watchers[role])).size).toBe(3);
  }
  expect(calls.filter(c => c.op === "start")).toHaveLength(3);
  expect(chain.flatMap(f => f.admissions).filter(a => a.allowed)).toHaveLength(2);
  snapshot(chain[2], "successive-all-ready");
}
async function rejectOldInstances(next: Fixture, old: Fixture[]) {
  for (const source of old) {
    const rows = ledgerRows(), count = calls.length, pg = io.pg.length, wires = wire.length;
    const stale = await harness(next, { instanceId: source.instanceId! });
    const response = await read(next, stale);
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
    expect(ledgerRows()).toEqual(rows); expect(calls).toHaveLength(count); expect(io.pg).toHaveLength(pg);
    expect(wire.slice(wires).map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]);
    expect(wire.slice(wires).every(w => w.secure)).toBe(true);
    snapshot(next, "successive-rejected-instance-" + source.nonce);
  }
}
async function completedRequest(f: Fixture, retained: number) {
  const held = scopedGate(f, "finalize"), h = await harness(f), wires = wire.length;
  let returned = false;
  const pending = read(f, h).then(response => { returned = true; return response; });
  await bound(held.entered.promise); expect(returned).toBe(false); cleaned(retained + 1);
  expect(held.seen).toMatchObject({ nonce: f.nonce }); expect(held.seen!.scope).toBeDefined();
  await releaseGate(held); const response = await pending;
  expect(response.status).toBe(200); expect((await response.json()).taskPage.tasks[0].jobId).toBe(USER);
  expect(wire.slice(wires).map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]);
  expect(wire.slice(wires).every(w => w.secure)).toBe(true); pgClosed();
  snapshot(f, "successive-request-completed"); return held;
}
async function stopCompleted(f: Fixture, death: "normal" | "SIGKILL") {
  const before = recoveryState(f);
  expect(f.rpc.size).toBe(0); expect(f.requests.size).toBe(0);
  await terminate(f, death); await joinWatcher(f, f.watchers.launcher!); await stopped(f);
  await pingAudit(f, "service");
  expect(await inspect(f, "successive-live-exit-barrier"))
    .toMatchObject({ address: null, listening: false, health: { state: "FAILED" } });
  expect(f.watchers.service!.box.messages.some(m => m.type === "kernel-exit")).toBe(false);
  await refused(f, "DESCENDANT_EXIT_UNVERIFIED"); await cleanup(f);
  expect(recoveryState(f)).toEqual(before); snapshot(f, "successive-empty-before-recovery");
}
async function recoveredEmpty(f: Fixture, sources: RetiredReply[]) {
  const inventory = gate("inventory"), readyReply = gate("ready", true);
  const oldEpoch = epoch, oldMap = leases, rows = ledgerRows();
  expect(rows.every(row => row.state === "REVOKED")).toBe(true);
  const constructing = startControllerRecovery(f, { gates: [inventory, readyReply] });
  await refused(f, "ADMISSION_USED"); const next = await constructing;
  await bound(inventory.entered.promise); await noListener(next, "successive-empty-inventory-before");
  expect(epoch).not.toBe(oldEpoch); expect(leases).toBe(oldMap); expect(ledgerRows()).toEqual(rows);
  await replayGenerations(next, sources); await releaseGate(inventory);
  await bound(readyReply.entered.promise); await noListener(next, "successive-empty-ready-held");
  expect(ledgerReady).toBe(true); expect(next.ops).toEqual(["start", "inventory", "ready"]);
  expect(next.trace.find(t => t.op === "inventory")!.inventory).toEqual({ projectRef: REF, epoch, leases: [] });
  expect(rowOperations(next)).toEqual([]); expect(ledgerRows()).toEqual(rows);
  await releaseGate(readyReply); await ready(next);
  expect((await inspect(next, "successive-empty-ready")).listening).toBe(true);
  expect(next.ops).toEqual(["start", "inventory", "ready"]);
  expect(leases).toBe(oldMap); expect(ledgerRows()).toEqual(rows); snapshot(next, "successive-empty-recovered");
  return next;
}
async function finishSuccessive(chain: Fixture[], rows: ReturnType<typeof ledgerRows>) {
  await cleanup(chain[2]); await refused(chain[0], "ADMISSION_USED"); await refused(chain[1], "ADMISSION_USED");
  expect(fixtures).toEqual(chain); expect(chain[2].consumed).toBe(false); expect(ledgerRows()).toEqual(rows);
  expect(calls.filter(c => c.op === "start")).toHaveLength(3);
  expect(chain.map(f => report(f).recoveryOutcome)).toEqual(["NOT_STARTED", "READY", "READY"]);
  for (const f of chain) {
    expect(report(f)).toMatchObject({ diagnosticEvidence: "VERIFIED", ownerOutcome: "FAILED", cleanupConfirmed: false,
      listenerEvidence: "CLOSED", shutdownOrder: "CONTROLLER_FIRST", teardownEvidence: "CONFIRMED",
      pendingRpc: 0, pendingRequests: 0, requestStreamsClosed: true, auditChannelsClosed: true });
    expect(f.audits.service.box.messages.some(m => m.type === "startup-failed")).toBe(false);
    expect(f.trace.every(t => t.nonce === f.nonce && t.committed && !t.failed && !t.fault)).toBe(true);
  }
  pgClosed(); snapshot(chain[2], "successive-all-closed");
}
describe.skipIf(process.platform !== "darwin")("controller recovery with actual Workspace/TLS (Auth/SQL/ledger simulated)", { timeout: 25000 }, () => {
  beforeAll(async () => {
    root = mkdtempSync("/private/tmp/cl-task-controller-"); expect(realpathSync(root)).toBe(root); expect(statSync(root).mode & 0o777).toBe(0o700);
    const privatePem = () => generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    writeFileSync(join(root, "ca.key"), privatePem(), { mode: 0o600 }); writeFileSync(join(root, "leaf.key"), privatePem(), { mode: 0o600 });
    writeFileSync(join(root, "ca.conf"), "[req]\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\n[ca]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,keyCertSign,cRLSign\n");
    writeFileSync(join(root, "leaf.conf"), "basicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:" + HOST + "\n");
    const openssl = (args: string[]) => execFileSync("/usr/bin/openssl", args, { cwd: root, stdio: "ignore", timeout: 10000 });
    openssl(["req", "-new", "-x509", "-key", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=Task Controller Test CA", "-config", "ca.conf"]);
    openssl(["req", "-new", "-key", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=" + HOST]);
    openssl(["x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-set_serial", "1", "-out", "leaf.pem", "-days", "1", "-extfile", "leaf.conf"]);
    ca = readFileSync(join(root, "ca.pem")); cert = readFileSync(join(root, "leaf.pem")); key = readFileSync(join(root, "leaf.key"));
    pin = sha(new X509Certificate(cert).publicKey.export({ format: "der", type: "spki" }));
    await build({ entryPoints: ["scripts/preview-e2e/communication-note-task-controller-exit-local-child.mjs"], outfile: join(root, "child.cjs"),
      bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "silent", external: ["pg-native"],
      alias: { "server-only": require.resolve("next/dist/compiled/server-only/empty.js") } });
  });
  beforeEach(() => { vi.clearAllMocks(); io.pg.length = 0; io.query = undefined; leases.clear(); calls.length = 0; epoch = undefined; ledgerReady = false; });
  afterEach(async () => {
    const failures: unknown[] = [];
    fixtures.forEach(f => f.gates.forEach(g => g.release.resolve()));
    controllers.splice(0).forEach(c => c.abort()); wire.forEach(w => w.client.destroy());
    const batch = fixtures.splice(0);
    for (const f of batch) {
      try {
        await bound(Promise.all([...f.rpc])); await cleanup(f);
        console.info("LOCAL_CONTROLLER_RECOVERY_DIAGNOSTIC", JSON.stringify(report(f)));
      } catch (error) { failures.push(error); allResourcesClosed = false; }
    }
    try { await bound(Promise.allSettled(requests.splice(0))); await bound(Promise.all(wire.map(w => w.closed))); }
    catch (error) { failures.push(error); allResourcesClosed = false; }
    for (const p of processes.splice(0)) {
      if (!p.didExit) p.child.kill("SIGTERM");
      try { await bound(p.closed); expect(p.errors).toEqual([]); expect(Buffer.concat(p.output).length).toBe(0); }
      catch (error) { failures.push(error); allResourcesClosed = false; }
    }
    for (const a of audits.splice(0)) {
      try {
        a.streams.forEach(s => { if (!s.close) s.socket.destroy(); });
        await bound(Promise.all(a.streams.map(s => s.closed)));
        if (!a.didClose) a.server.close(); await bound(a.closed);
      } catch (error) { failures.push(error); allResourcesClosed = false; }
    }
    if (failures.length) for (const f of batch) console.info("LOCAL_CONTROLLER_RECOVERY_FAILED_TEARDOWN", JSON.stringify({
      root, nonce: f.nonce, pids: f.pids, report: report(f),
      observerExits: descendants.map(role => ({ role, code: f.watchers[role]?.process.child.exitCode,
        signal: f.watchers[role]?.process.child.signalCode, closed: f.watchers[role]?.process.didClose })),
      fixtureFailures: f.audits.service.box.messages.filter(m => m.type === "fixture-failed").map(m => m.reason),
    }));
    wire.length = 0; vi.unstubAllEnvs(); vi.restoreAllMocks();
    if (failures.length) throw failures[0];
  }, 25000);
  afterAll(() => {
    key?.fill(0); expect(allResourcesClosed).toBe(true);
    if (root) { expect(root).toMatch(/^\/private\/tmp\/cl-task-controller-[A-Za-z0-9]{6}$/);
      expect(realpathSync(root)).toBe(root); rmSync(root, { recursive: true }); }
  });
  async function loseLease(mode = "ISSUE_COMMITTED", death: "normal" | "SIGKILL" = "SIGKILL") {
    const f = await start({ mode }), h = await harness(f), pending = read(f, h);
    await f.audits.service.box.wait("checkpoint");
    const oldEpoch = epoch, oldMap = leases, ids = [...leases.keys()];
    await terminate(f, death);
    const response = await pending; expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
    await cleanup(f);
    expect(leases).toBe(oldMap); expect([...leases.keys()]).toEqual(ids);
    expect([...leases.values()].map(l => l.state)).toEqual([mode === "ISSUE_COMMITTED" ? "ISSUED" : "FENCED"]);
    expect(epoch).toBe(oldEpoch); snapshot(f, "before-recovery");
    expect(io.pg).toHaveLength(mode === "ISSUE_COMMITTED" ? 0 : 2); pgClosed();
    return { f, oldEpoch, oldMap, ids };
  }
  it.each([
    ["normal", "ISSUE_COMMITTED"], ["normal", "FENCE_COMMITTED"],
    ["SIGKILL", "ISSUE_COMMITTED"], ["SIGKILL", "FENCE_COMMITTED"],
  ] as const)("CR-01 %s %s recovers before new Workspace requests", async (death, mode) => {
    const { f, oldEpoch, oldMap, ids } = await loseLease(mode, death);
    const inventory = gate("inventory"), finalize = gate("finalize", true), readyReply = gate("ready", true);
    const constructing = startControllerRecovery(f, { gates: [inventory, finalize, readyReply] });
    // Concurrent second call is rejected even while the first start is awaiting sockets.
    await refused(f, "ADMISSION_USED");
    const next = await constructing;
    expect(next.controller.child).not.toBe(f.controller.child); expect(next.nonce).not.toBe(f.nonce);
    for (const role of descendants) {
      expect(next.audits[role].path).not.toBe(f.audits[role].path);
      expect(next.watchers[role]).not.toBe(f.watchers[role]);
    }
    await bound(inventory.entered.promise); await noListener(next, "inventory-before");
    expect(epoch).not.toBe(oldEpoch); expect(leases).toBe(oldMap); expect([...leases.keys()]).toEqual(ids);
    inventory.release.resolve(); await bound(finalize.entered.promise);
    cleaned(1); await noListener(next, "finalize-committed"); expect(next.ops).not.toContain("ready");
    finalize.release.resolve(); await bound(readyReply.entered.promise);
    cleaned(1); await noListener(next, "ready-reply-held");
    readyReply.release.resolve(); await ready(next);
    expect(next.ops).toEqual(["start", "inventory", "fence", "finalize", "ready"]);
    expect((await inspect(next, "ready")).listening).toBe(true);
    expect(next.instanceId).not.toBe(f.instanceId); snapshot(next, "recovered");
    const beforeIssues = calls.filter(c => c.op === "issue").length, beforePg = io.pg.length, beforeWire = wire.length;
    const stale = await harness(next, { instanceId: f.instanceId! }), rejected = await read(next, stale);
    expect(rejected.status).toBe(503); expect(await rejected.json()).not.toHaveProperty("taskPage");
    expect(calls.filter(c => c.op === "issue")).toHaveLength(beforeIssues); expect(io.pg).toHaveLength(beforePg);
    expect(wire.slice(beforeWire).map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]);
    expect(wire.slice(beforeWire).every(w => w.secure)).toBe(true); cleaned(1);
    const revokeReply = gate("finalize", true); next.gates.push(revokeReply);
    const fresh = await harness(next); let returned = false;
    const pending = read(next, fresh).then(r => { returned = true; return r; });
    await bound(revokeReply.entered.promise); expect(returned).toBe(false); cleaned(2);
    revokeReply.release.resolve(); const response = await pending;
    expect(response.status).toBe(200); expect((await response.json()).taskPage.tasks[0].jobId).toBe(USER);
    expect(wire.slice(-2).map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]);
    expect(wire.slice(-2).every(w => w.secure)).toBe(true); pgClosed(); snapshot(next, "fresh-request-revoked");
    expect(leases).toBe(oldMap); expect(ids.every(id => leases.has(id))).toBe(true); cleaned(2);
    expect(report(f).cleanupConfirmed).toBe(false);
  });
  it("CR-02 refuses recovery while the stopped service still answers its exit barrier", async () => {
    const f = await start(), h = await harness(f), custody = h.custody();
    const lease = await custody.client.issue(custody.scope, { signal: control().signal });
    (lease.credential as { password: string }).password = "";
    await refused(f, "CONTROLLER_EXIT_UNVERIFIED");
    await terminate(f, "SIGKILL"); await joinWatcher(f, f.watchers.launcher!); await stopped(f);
    await pingAudit(f, "service");
    expect(await inspect(f, "live-exit-barrier")).toMatchObject({ address: null, listening: false });
    expect(f.watchers.service!.box.messages.some(m => m.type === "kernel-exit")).toBe(false);
    await refused(f, "DESCENDANT_EXIT_UNVERIFIED");
    await cleanup(f); snapshot(f, "barrier-released");
    const next = await startControllerRecovery(f); await ready(next); cleaned(1); snapshot(next, "recovered");
  });
  it.each(["launcher-timeout", "service-SIGKILL"] as const)("CR-03 retains original %s failure despite verified teardown", async fault => {
    const role = fault === "launcher-timeout" ? "launcher" : "service";
    const f = await start({ launcherTimeout: role === "launcher" ? 0 : undefined }), original = f.watchers[role]!;
    if (role === "launcher") expect(await original.box.wait("unverified")).toMatchObject({ reason: "EXIT_UNCONFIRMED" });
    else expect(original.process.child.kill("SIGKILL")).toBe(true);
    expect(await bound(original.process.closed)).toEqual(role === "launcher" ? { code: 2, signal: null } : { code: null, signal: "SIGKILL" });
    await teardownWatcher(f, role); await terminate(f, "SIGKILL"); await cleanup(f);
    expect(f.watchers[role]).toBe(original); expect(verified(f, f.teardown[role])).toBe(true);
    await refused(f, "DESCENDANT_EXIT_UNVERIFIED");
    expect(f.consumed).toBe(false); expect(fixtures).toHaveLength(1);
    expect(report(f)).toMatchObject({ diagnosticEvidence: "UNVERIFIED", teardownEvidence: "CONFIRMED" });
  });
  it.each(["BAD_NONCE", "BAD_SEQUENCE"])("CR-04 rejects %s audit evidence after actual descendant exit", async mode => {
    const f = await start({ mode }); await terminate(f, "SIGKILL"); await cleanup(f);
    expect(f.audits.service.invalid).toBe(true);
    expect(descendants.every(role => verified(f, f.watchers[role]))).toBe(true);
    await refused(f, "AUDIT_EVIDENCE_INVALID");
    expect(f.consumed).toBe(false); expect(fixtures).toHaveLength(1);
    expect(report(f)).toMatchObject({ diagnosticEvidence: "UNVERIFIED", auditEvidence: "UNVERIFIED", teardownEvidence: "CONFIRMED" });
  });
  it.each(["inventory", "finalize", "ready"])("CR-05 never opens a listener after recovery %s failure", async failOp => {
    const { f, oldMap, ids } = await loseLease();
    const next = await startControllerRecovery(f, { failOp });
    await next.audits.service.box.wait("startup-failed"); await stopped(next);
    expect(next.neverOpened).toBe(true); expect(next.port).toBeUndefined(); expect(next.instanceId).toBeUndefined();
    expect(next.audits.service.box.messages.some(m => m.type === "ready")).toBe(false);
    expect(next.ops).toEqual(failOp === "inventory" ? ["start", "inventory"] :
      failOp === "finalize" ? ["start", "inventory", "fence", "finalize"] : ["start", "inventory", "fence", "finalize", "ready"]);
    expect(next.ops).not.toContain("issue"); expect(io.pg).toHaveLength(0);
    expect(leases).toBe(oldMap); expect([...leases.keys()]).toEqual(ids);
    expect([...leases.values()].map(l => l.state)).toEqual([failOp === "inventory" ? "ISSUED" : failOp === "finalize" ? "FENCED" : "REVOKED"]);
    if (failOp === "ready") cleaned(1);
    else expect([...leases.values()][0]).toMatchObject({ roleCount: 1, sessionCount: 0, membershipCount: 2 });
    snapshot(next, "recovery-" + failOp + "-failed");
    await refused(f, "ADMISSION_USED"); await cleanup(next); await refused(f, "ADMISSION_USED");
    await refused(next, "LISTENER_UNVERIFIED");
    expect(fixtures).toHaveLength(2); expect(calls.filter(c => c.op === "start")).toHaveLength(2);
    expect(report(next)).toMatchObject({ recoveryOutcome: "FAILED", listenerEvidence: "NEVER_OPENED",
      ownerOutcome: "FAILED", cleanupConfirmed: false, teardownEvidence: "CONFIRMED" });
  });
  it("CR-06 joins the old held reply before admission and isolates its replay during new recovery", async () => {
    const held = gate("issue", true), f = await start({ gates: [held] }), h = await harness(f), pending = read(f, h);
    await bound(held.entered.promise); const oldMap = leases, oldEpoch = epoch;
    expect([...leases.values()][0].state).toBe("ISSUED");
    await terminate(f, "SIGKILL"); const response = await pending;
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
    await finish(f); await closeAudits(f); snapshot(f, "old-reply-held");
    expect(f.rpc.size).toBe(1); await refused(f, "OLD_WORK_PENDING");
    held.release.resolve(); await bound(Promise.all([...f.rpc])); expect(f.dropped).toBe(1); await cleanup(f);
    const inventory = gate("inventory"), next = await startControllerRecovery(f, { gates: [inventory] });
    await bound(inventory.entered.promise); await noListener(next, "replay-during-inventory");
    const newEpoch = epoch, beforeRows = JSON.stringify(ledgerRows()), beforeOps = [...next.ops], beforeCalls = calls.length;
    expect(newEpoch).not.toBe(oldEpoch); expect(next.rpc.size).toBe(1);
    await held.replay!();
    expect(f.dropped).toBe(2); expect(f.controller.child.connected).toBe(false);
    expect(epoch).toBe(newEpoch); expect(leases).toBe(oldMap); expect(JSON.stringify(ledgerRows())).toBe(beforeRows);
    expect(next.ops).toEqual(beforeOps); expect(calls).toHaveLength(beforeCalls); expect(next.rpc.size).toBe(1);
    await noListener(next, "old-reply-discarded");
    inventory.release.resolve(); await ready(next); cleaned(1); snapshot(next, "recovered");
    const fresh = await harness(next), result = await read(next, fresh);
    expect(result.status).toBe(200); expect((await result.json()).taskPage.tasks[0].jobId).toBe(USER);
    cleaned(2); pgClosed(); snapshot(next, "fresh-request-revoked");
    expect(report(f).cleanupConfirmed).toBe(false);
  });
  it.each(["normal", "SIGKILL"] as const)("MR-01 %s recovers mixed unfinished leases", async death => {
    const f = await start({ caseId: "MR-01 " + death }), h = await harness(f);
    const items = [await pendingLease(f, h, "ISSUED"), await pendingLease(f, h, "FENCED")];
    expect(f.requests.size).toBe(2); expect(f.rpc.size).toBe(2);
    const { originalMap } = await loseBatch(f, items, death);
    const next = await recoveredBatch(f, items); cleaned(2);
    await freshAfterBatch(f, next, 2); expect(leases).toBe(originalMap); batchStates(items, ["REVOKED", "REVOKED"]);
  });
  it("MR-02 recovers four genuine unfinished leases at the inventory limit", async () => {
    const { f, items, originalMap } = await prepareBatch("MR-02", ["ISSUED", "FENCED", "ISSUED", "FENCED"]);
    const next = await recoveredBatch(f, items); cleaned(4);
    expect(next.trace.filter(t => t.op === "finalize")).toHaveLength(4);
    expect(leases).toBe(originalMap); await freshAfterBatch(f, next, 4);
    batchStates(items, items.map(() => "REVOKED"));
  });
  it.each(["fence", "finalize"] as const)("MR-03 preserves partial recovery when the second %s fails before commit", async op => {
    const { f, items } = await prepareBatch("MR-03 " + op, ["ISSUED", "ISSUED", "ISSUED"]);
    const next = await failedBatch(f, { fault: { op, target: items[1].scope, phase: "BEFORE_COMMIT" } });
    partialFailure(next, items, op, "BEFORE_COMMIT");
    const last = next.trace.at(-1)!; expect(last.before).toEqual(last.after);
  });
  it("MR-04 preserves committed rows after the second finalize acknowledgement is lost", async () => {
    const { f, items } = await prepareBatch("MR-04", ["ISSUED", "ISSUED", "ISSUED"]);
    const next = await failedBatch(f, { fault: { op: "finalize", target: items[1].scope, phase: "AFTER_COMMIT" } });
    partialFailure(next, items, "finalize", "AFTER_COMMIT");
    const last = next.trace.at(-1)!;
    expect(last.before.map(l => l.state)).toEqual(["REVOKED", "FENCED", "ISSUED"]);
    expect(last.after.map(l => l.state)).toEqual(["REVOKED", "REVOKED", "ISSUED"]);
    expect(next.trace.filter(t => t.op === "finalize" && t.scope?.requestId === items[1].scope.requestId)).toHaveLength(1);
  });
  it.each(["DUPLICATE", "FIVE", "WRONG_EPOCH"] as const)("MR-05 rejects %s inventory before touching any old lease", async inventoryFault => {
    const { f, items, originalRows } = await prepareBatch("MR-05 " + inventoryFault, ["ISSUED", "FENCED", "ISSUED"]);
    const next = await failedBatch(f, { inventoryFault });
    expect(next.ops).toEqual(["start", "inventory"]); expect(rowOperations(next)).toEqual([]);
    expect(ledgerRows()).toEqual(originalRows); batchStates(items, items.map(i => i.state));
    const trace = next.trace.at(-1)!;
    expect(trace).toMatchObject({ op: "inventory", committed: true, failed: false, fault: inventoryFault });
    expect(trace.before).toEqual(trace.after);
    const delivered = trace.inventory as { epoch: string; leases: { scope: Scope }[] };
    if (inventoryFault === "DUPLICATE") {
      expect(delivered.leases).toHaveLength(4); expect(delivered.leases[3].scope).toEqual(items[0].scope);
    } else if (inventoryFault === "FIVE") {
      expect(delivered.leases).toHaveLength(5); expect(new Set(delivered.leases.map(l => l.scope.requestId)).size).toBe(5);
      expect(leases.size).toBe(3);
    } else expect(delivered.epoch).not.toBe(epoch);
  });
  it("MR-06 retains a completed request tombstone without recovering it again", async () => {
    const f = await start({ caseId: "MR-06" }), h = await harness(f), completed = await read(f, h);
    expect(completed.status).toBe(200); cleaned(1); pgClosed();
    const tombstone = ledgerRows()[0];
    const items = [await pendingLease(f, h, "ISSUED"), await pendingLease(f, h, "FENCED")];
    const { originalMap } = await loseBatch(f, items, "SIGKILL");
    const next = await recoveredBatch(f, items); cleaned(3);
    expect(next.trace.some(t => t.scope?.requestId === tombstone.requestId)).toBe(false);
    expect(ledgerRows().find(l => l.requestId === tombstone.requestId)).toEqual(tombstone);
    await freshAfterBatch(f, next, 3);
    expect(leases).toBe(originalMap); expect(ledgerRows().find(l => l.requestId === tombstone.requestId)).toEqual(tombstone);
  });
  it.each([
    ["RI-01", "normal", "inventory"], ["RI-01", "SIGKILL", "inventory"],
    ["RI-02", "normal", "fence"], ["RI-02", "SIGKILL", "fence"],
    ["RI-03", "normal", "finalize"], ["RI-03", "SIGKILL", "finalize"],
    ["RI-04", "normal", "ready"], ["RI-04", "SIGKILL", "ready"],
  ] as const)("%s %s interrupts recovery at the held %s RPC", async (id, death, point) => {
    const { f, items, originalMap } = await prepareBatch(id + " " + death, ["ISSUED", "ISSUED"]);
    const { next, held } = await holdRecovery(f, items, point);
    await interruptRecovery(f, next, held, death);
    expect(leases).toBe(originalMap); interruptedLedger(next, items, point);
  });
  it.each(["normal", "SIGKILL"] as const)("SR-01 %s recovers a second unfinished batch across three generations", async death => {
    const { f, items, originalMap, originalEpoch } = await prepareBatch("SR-01 " + death, ["ISSUED", "FENCED"]);
    const second = await recoveredBatch(f, items), secondEpoch = epoch, tombstones = ledgerRows(); cleaned(2);
    await refused(second, "CONTROLLER_EXIT_UNVERIFIED");
    const h = await harness(second), batch = [await pendingLease(second, h, "ISSUED"), await pendingLease(second, h, "FENCED")];
    expect(second.requests.size).toBe(2); expect(second.rpc.size).toBe(2); expect(leases.size).toBe(4);
    retainedRows(tombstones); snapshot(second, "successive-second-active");
    await loseBatch(second, batch, death); retainedRows(tombstones);
    const third = await recoveredBatch(second, batch, next => replayGenerations(next,
      [{ fixture: f, held: items[0].held }, { fixture: second, held: batch[0].held }]));
    successiveIdentity([f, second, third], [originalEpoch, secondEpoch, epoch]);
    retainedRows(tombstones); cleaned(4); const recovered = ledgerRows();
    await rejectOldInstances(third, [f, second]); await completedRequest(third, 4);
    retainedRows(recovered); cleaned(5); expect(leases).toBe(originalMap);
    await finishSuccessive([f, second, third], ledgerRows());
  });
  it.each(["normal", "SIGKILL"] as const)("SR-02 %s recovers an empty inventory after the second generation completed its request", async death => {
    const { f, items, originalMap, originalEpoch } = await prepareBatch("SR-02 " + death, ["ISSUED", "FENCED"]);
    const second = await recoveredBatch(f, items), secondEpoch = epoch, tombstones = ledgerRows(); cleaned(2);
    await refused(second, "CONTROLLER_EXIT_UNVERIFIED");
    const completed = await completedRequest(second, 2); retainedRows(tombstones); cleaned(3);
    const retained = ledgerRows(); await stopCompleted(second, death);
    const third = await recoveredEmpty(second,
      [{ fixture: f, held: items[0].held }, { fixture: second, held: completed }]);
    successiveIdentity([f, second, third], [originalEpoch, secondEpoch, epoch]);
    expect(ledgerRows()).toEqual(retained); cleaned(3);
    await rejectOldInstances(third, [f, second]); await completedRequest(third, 3);
    retainedRows(retained); cleaned(4); expect(leases).toBe(originalMap);
    await finishSuccessive([f, second, third], ledgerRows());
  });
  it("CR-07 keeps recovery diagnostics outside the disabled formal runtime", async () => {
    for (const [k, v] of Object.entries(env())) vi.stubEnv(k, v);
    const runtime = await import("./communication-note-workspace-runtime.server");
    const route = await import("../app/api/ai-documents/communication-note/documents/route");
    expect(runtime.COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined(); expect((await route.GET(request())).status).toBe(503);
    expect(io.cookie).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled(); expect(io.pg).toHaveLength(0);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
    expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") &&
      /task-controller-recovery|task-controller-exit-local-child|task-process-observer/.test(readFileSync(p, "utf8")))).toEqual([]);
    expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toContain("HOSTED_WORKSPACE_READ_BINDING = undefined");
    expect(fixtures).toHaveLength(0); expect(processes).toHaveLength(0); expect(audits).toHaveLength(0);
  });
});
