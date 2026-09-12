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
type Wire = { path: string; signal: AbortSignal; startedAborted: boolean; client: ClientRequest; secure: boolean; closed: Promise<void> };
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
async function harness(h: { port?: number; instanceId?: string }, changes: Partial<Binding> = {}) {
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
      closed: new Promise(resolve => client.once("close", resolve)) }; wire.push(entry);
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

/** Test-only T/R/L/S diagnostic. Native descendant close remains unknown when
 * its original owner dies. Kernel/audit evidence never authorizes a successor. */
type Role = "controller" | "launcher" | "service";
type Descendant = Exclude<Role, "controller">;
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type Tracked = { child: ChildProcess; exited: Promise<Exit>; closed: Promise<Exit>;
  didExit: boolean; didClose: boolean; output: Buffer[]; errors: Error[] };
type Audit = { server: Server; ready: Promise<void>; closed: Promise<void>; didClose: boolean;
  socket?: Socket; streams: { socket: Socket; closed: Promise<void>; end: boolean; close: boolean }[];
  box: ReturnType<typeof mailbox>; invalid: boolean; sequence: number; reportedPid: number; role: Descendant; path: string };
type Watcher = { process: Tracked; box: ReturnType<typeof mailbox>; pid: number; attested: boolean };
type Gate = { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred>; used: boolean; replay?: () => Promise<void> };
type Fixture = { controller: Tracked; nonce: string; pids: Record<Role, number>; sequences: Record<Role, number>;
  box: ReturnType<typeof mailbox>; audits: Record<Descendant, Audit>; watchers: Partial<Record<Descendant, Watcher>>;
  teardown: Partial<Record<Descendant, Watcher>>; gate?: Gate; rpc: Set<Promise<void>>; dropped: number;
  retired: boolean; mode: string; death?: "normal" | "SIGKILL"; releaseChallenge?: string; listenerClosed: boolean; done: boolean;
  port?: number; instanceId?: string; identityConfirmed: boolean };
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
function rpc(f: Fixture, m: Message) {
  const work = (async () => {
    if (f.retired) { f.dropped++; return; }
    let value: unknown, failed = false;
    try { value = protocol(m.op as string, m.data as Record<string, unknown>); } catch { failed = true; }
    const fields = { type: "protocol-reply", id: m.id, value, failed };
    if (m.op === "issue" && f.gate && !f.gate.used) {
      f.gate.used = true; f.gate.replay = () => reply(f, fields);
      f.gate.entered.resolve(); await f.gate.release.promise;
    }
    await reply(f, fields);
  })();
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
async function start(options: { mode?: string; launcherTimeout?: number; gate?: Gate } = {}) {
  const nonce = randomBytes(16).toString("hex"), index = ++generation;
  const pair = { launcher: audit(join(root, index + "-l.sock"), "launcher", nonce), service: audit(join(root, index + "-s.sock"), "service", nonce) };
  await bound(Promise.all(descendants.map(role => pair[role].ready)));
  const controller = track(fork(join(root, "child.cjs"), ["controller"], { env: isolated, execArgv: [], serialization: "advanced",
    stdio: ["ignore", "pipe", "pipe", "ipc"] }));
  controller.child.stdout!.on("data", b => controller.output.push(Buffer.from(b)));
  const f: Fixture = { controller, nonce, pids: { controller: controller.child.pid!, launcher: 0, service: 0 },
    sequences: { controller: 0, launcher: 0, service: 0 }, box: mailbox(), audits: pair, watchers: {}, teardown: {},
    rpc: new Set(), gate: options.gate, dropped: 0, retired: false, mode: options.mode ?? "NORMAL", listenerClosed: false, done: false, identityConfirmed: false };
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
  const ready = await pair.service.box.wait("ready"), address = ready.address as { host: string; port: number };
  expect(address.host).toBe("127.0.0.1"); expect(address.port).toBeGreaterThan(0); expect(ready.instanceId).toMatch(/^[a-f0-9]{64}$/);
  f.port = address.port; f.instanceId = ready.instanceId as string; return f;
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
  await listenerClosed(f.port!); f.listenerClosed = true;
}
function streamsClosed(a: Audit) { return a.streams.length === 1 && a.streams.every(s => s.end && s.close); }
async function finish(f: Fixture) {
  await stopped(f); await joinWatcher(f, f.teardown.launcher ?? f.watchers.launcher!);
  if (!f.releaseChallenge) f.releaseChallenge = await auditCommand(f, "service", "release-exit");
  await f.audits.service.box.wait("exit-released", m => m.challenge === f.releaseChallenge);
  await joinWatcher(f, f.teardown.service ?? f.watchers.service!);
  for (const role of descendants) {
    await bound(Promise.all(f.audits[role].streams.map(s => s.closed))); expect(streamsClosed(f.audits[role])).toBe(true);
  }
  await bound(Promise.all(wire.map(w => w.closed)));
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
    !f.box.failed && descendants.every(role => !f.audits[role].invalid) && auditClosed && f.listenerClosed &&
    !f.audits.service.box.messages.some(m => m.type === "fixture-failed") &&
    owner?.state === "FAILED" && owner.cleanupConfirmed === false &&
    f.audits.service.box.messages.some(m => m.type === "exit-released" && m.challenge === f.releaseChallenge);
  return { node: process.version, platform: process.platform, arch: process.arch, mode: f.mode, death: f.death,
    diagnosticEvidence: valid ? "VERIFIED" : "UNVERIFIED", controllerExit, controllerClose: f.controller.didClose,
    launcherExitEvidence: verified(f, f.watchers.launcher) ? "VERIFIED" : "UNVERIFIED",
    serviceExitEvidence: verified(f, f.watchers.service) ? "VERIFIED" : "UNVERIFIED",
    launcherNative: nativeDescendant(f, "launcher"), serviceNative: nativeDescendant(f, "service"),
    ownerOutcome: owner?.state ?? "UNVERIFIED", cleanupConfirmed: owner?.cleanupConfirmed === true,
    brokerSendFailures: f.audits.service.box.messages.filter(m => m.type === "broker-send-failed").length,
    listenerClosed: f.listenerClosed, auditChannelsClosed: auditClosed,
    auditEvidence: descendants.some(role => f.audits[role].invalid) ? "UNVERIFIED" : "VALID",
    teardownEvidence: f.done ? "CONFIRMED" : "NOT_COMPLETED" };
}
async function cleanup(f: Fixture) {
  if (f.done) return;
  if (!f.controller.didExit) {
    for (const role of descendants) {
      if (!f.watchers[role]?.attested || (f.watchers[role]!.process.didClose && !verified(f, f.watchers[role])))
        if (!f.teardown[role]) await teardownWatcher(f, role);
    }
    await terminate(f, "normal");
  }
  await finish(f); expect(f.rpc.size).toBe(0);
  expect(f.audits.service.box.messages.filter(m => m.type === "fixture-failed")).toEqual([]);
  for (const role of descendants) {
    const a = f.audits[role]; a.server.close(); await bound(a.closed); expect(a.didClose).toBe(true);
    expect((await bound(f.watchers[role]!.process.closed)).code).not.toBeUndefined();
  }
  f.done = true;
}
function pgClosed() {
  for (const c of io.pg) {
    expect(c.end).toHaveBeenCalledOnce(); expect(c.connection.stream.destroy).toHaveBeenCalledOnce();
    expect(c.password).toBeUndefined(); expect(c.config.password).toBeUndefined(); expect(c.connectionParameters.password).toBeUndefined();
  }
}
function read(f: Fixture, h: Awaited<ReturnType<typeof harness>>) {
  expect(f.port).toBeDefined(); const work = h.handle(request()); requests.push(work); return work;
}
describe.skipIf(process.platform !== "darwin")("controller death with actual Workspace/TLS (Auth/SQL/ledger simulated)", { timeout: 25000 }, () => {
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
    fixtures.forEach(f => f.gate?.release.resolve());
    controllers.splice(0).forEach(c => c.abort()); wire.forEach(w => w.client.destroy());
    const batch = fixtures.splice(0);
    for (const f of batch) {
      try {
        await bound(Promise.all([...f.rpc])); await cleanup(f);
        console.info("LOCAL_CONTROLLER_DIAGNOSTIC", JSON.stringify(report(f)));
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
    if (failures.length) for (const f of batch) console.info("LOCAL_CONTROLLER_FAILED_TEARDOWN", JSON.stringify({
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
  it.each(["normal", "SIGKILL"] as const)("CE-01 observes actual %s controller death and each descendant separately", async death => {
    const f = await start(); await terminate(f, death); await finish(f);
    expect(report(f)).toMatchObject({ diagnosticEvidence: "VERIFIED", controllerClose: true, launcherExitEvidence: "VERIFIED",
      serviceExitEvidence: "VERIFIED", ownerOutcome: "FAILED", cleanupConfirmed: false, auditChannelsClosed: true });
    expect(leases.size).toBe(0);
  });
  it.each([
    ["ISSUE_COMMITTED", "normal"], ["ISSUE_COMMITTED", "SIGKILL"], ["FENCE_COMMITTED", "normal"], ["FENCE_COMMITTED", "SIGKILL"],
  ] as const)("CE-02 preserves %s after %s controller death during an actual Workspace request", async (mode, death) => {
    const f = await start({ mode }), h = await harness(f), pending = read(f, h);
    await f.audits.service.box.wait("checkpoint"); const oldEpoch = epoch; await terminate(f, death);
    const response = await pending; expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
    await finish(f);
    expect([...leases.values()].map(l => l.state)).toEqual([mode === "ISSUE_COMMITTED" ? "ISSUED" : "FENCED"]);
    expect(epoch).toBe(oldEpoch); expect(calls.filter(c => c.op === "start")).toHaveLength(1);
    expect(report(f).diagnosticEvidence).toBe("VERIFIED"); expect(h.sign).toHaveBeenCalled();
    expect(wire.some(w => w.path === PATHS.issue && w.secure)).toBe(true);
    expect(io.pg).toHaveLength(mode === "ISSUE_COMMITTED" ? 0 : 2); pgClosed();
  });
  it("CE-03 keeps service exit unknown behind a live barrier after controller and launcher exit", async () => {
    const f = await start(), h = await harness(f), custody = h.custody();
    const lease = await custody.client.issue(custody.scope, { signal: control().signal }); (lease.credential as { password: string }).password = "";
    await terminate(f, "SIGKILL"); await joinWatcher(f, f.watchers.launcher!); await stopped(f); await pingAudit(f, "service");
    const challenge = await auditCommand(f, "service", "inspect");
    expect(await f.audits.service.box.wait("inspection", m => m.challenge === challenge)).toMatchObject({ address: null, listening: false });
    expect(f.watchers.service!.box.messages.some(m => m.type === "kernel-exit")).toBe(false);
    expect(report(f)).toMatchObject({ launcherExitEvidence: "VERIFIED", serviceExitEvidence: "UNVERIFIED" });
    await finish(f); expect(report(f).serviceExitEvidence).toBe("VERIFIED"); expect(leases.size).toBe(1);
  });
  it.each(["launcher-timeout", "service-SIGKILL"] as const)("CE-04 preserves original %s evidence after independent teardown", async fault => {
    const role = fault === "launcher-timeout" ? "launcher" : "service";
    const f = await start({ launcherTimeout: role === "launcher" ? 0 : undefined }), original = f.watchers[role]!;
    if (role === "launcher") expect(await original.box.wait("unverified")).toMatchObject({ reason: "EXIT_UNCONFIRMED" });
    else expect(original.process.child.kill("SIGKILL")).toBe(true);
    expect(await bound(original.process.closed)).toEqual(role === "launcher" ? { code: 2, signal: null } : { code: null, signal: "SIGKILL" });
    await teardownWatcher(f, role); await terminate(f, "SIGKILL"); await cleanup(f);
    expect(f.watchers[role]).toBe(original);
    expect(report(f)).toMatchObject({ diagnosticEvidence: "UNVERIFIED", teardownEvidence: "CONFIRMED",
      [role === "launcher" ? "launcherExitEvidence" : "serviceExitEvidence"]: "UNVERIFIED" });
  });
  it.each(["BAD_NONCE", "BAD_SEQUENCE"])("CE-05 preserves %s from the real audit socket after valid exit release", async mode => {
    const f = await start({ mode }); await terminate(f, "SIGKILL"); await finish(f);
    expect(f.audits.service.invalid).toBe(true);
    expect(report(f)).toMatchObject({ diagnosticEvidence: "UNVERIFIED", auditEvidence: "UNVERIFIED",
      launcherExitEvidence: "VERIFIED", serviceExitEvidence: "VERIFIED", cleanupConfirmed: false });
  });
  it("CE-06 retires a held committed reply with its original dead controller and nonce", async () => {
    const gate: Gate = { entered: deferred(), release: deferred(), used: false };
    const f = await start({ gate }), h = await harness(f), pending = read(f, h); await bound(gate.entered.promise);
    expect([...leases.values()][0].state).toBe("ISSUED"); const state = JSON.stringify([...leases]), oldEpoch = epoch;
    await terminate(f, "SIGKILL"); const response = await pending;
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage"); await finish(f);
    expect(f.rpc.size).toBe(1); const operations = calls.length;
    gate.release.resolve(); await bound(Promise.all([...f.rpc])); expect(f.dropped).toBe(1);
    await gate.replay!(); expect(f.dropped).toBe(2); expect(f.controller.child.connected).toBe(false);
    expect(calls.length).toBe(operations); expect(epoch).toBe(oldEpoch); expect(JSON.stringify([...leases])).toBe(state); expect(f.rpc.size).toBe(0);
  });
  it("CE-07 keeps controller diagnostics outside the disabled formal product runtime", async () => {
    for (const [k, v] of Object.entries(env())) vi.stubEnv(k, v);
    const runtime = await import("./communication-note-workspace-runtime.server");
    const route = await import("../app/api/ai-documents/communication-note/documents/route");
    expect(runtime.COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined(); expect((await route.GET(request())).status).toBe(503);
    expect(io.cookie).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled(); expect(io.pg).toHaveLength(0);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
    expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") &&
      /task-controller-exit-local-child|task-process-observer/.test(readFileSync(p, "utf8")))).toEqual([]);
    expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toContain("HOSTED_WORKSPACE_READ_BINDING = undefined");
  });
});
