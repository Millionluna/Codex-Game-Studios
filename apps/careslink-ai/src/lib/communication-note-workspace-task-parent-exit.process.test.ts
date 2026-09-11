import { execFileSync, fork, spawn, type ChildProcess } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign as signBytes, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { connect as tcpConnect, type Socket } from "node:net";
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
function cleaned(count: number) {
  expect(leases.size).toBe(count);
  for (const l of leases.values()) expect(l).toMatchObject({ state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 });
  for (const c of io.pg) { expect(c.end).toHaveBeenCalledOnce(); expect(c.connection.stream.destroy).toHaveBeenCalledOnce();
    expect(c.password).toBeUndefined(); expect(c.config.password).toBeUndefined(); expect(c.connectionParameters.password).toBeUndefined(); }
}


// Independent parent-exit orchestration is local to this suite. The original
// 25 TLS tests and the PR #46 strict successor guard are unchanged.

type Exit = { code: number | null; signal: NodeJS.Signals | null };
type Tracked = { child: ChildProcess; exited: Promise<Exit>; closed: Promise<Exit>;
  didExit: boolean; didClose: boolean; output: Buffer[]; errors: Error[] };
type RpcGate = { op: string; afterCommit: boolean; entered: ReturnType<typeof deferred>;
  release: ReturnType<typeof deferred>; used: boolean; replay?: () => boolean };
type Generation = { parent: Tracked; nonce: string; pid: number; ipc: ReturnType<typeof mailbox>;
  events: ReturnType<typeof mailbox>; control: Socket; controlClosed: boolean; closed: Promise<void>;
  watcher?: ReturnType<typeof observe>; rpc: Set<Promise<void>>; requests: Set<Promise<Response>>;
  gates: RpcGate[]; ops: string[]; retired: boolean; released: boolean; done: boolean; successorStarted: boolean;
  dropped: number; failOp?: string; port?: number; instanceId?: string };
const isolated = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" } as const;
const generations: Generation[] = [], processes: Tracked[] = [], requests: Promise<Response>[] = [];
const closedWires = new WeakSet<Wire>();
let allServicesExited = true;
const gate = (op: string, afterCommit = false): RpcGate => ({ op, afterCommit, entered: deferred(), release: deferred(), used: false });
function track(child: ChildProcess): Tracked {
  const p = { child, didExit: false, didClose: false, output: [] as Buffer[], errors: [] as Error[] } as Tracked;
  p.exited = new Promise(r => child.once("exit", (code, signal) => { p.didExit = true; r({ code, signal }); }));
  p.closed = new Promise(r => child.once("close", (code, signal) => { p.didClose = true; r({ code, signal }); }));
  child.on("error", error => p.errors.push(error)); child.stderr!.on("data", b => p.output.push(Buffer.from(b)));
  processes.push(p); return p;
}
function mailbox() {
  const messages: Message[] = [], listeners = new Set<() => void>();
  let failed = false, ended = false;
  const notify = () => listeners.forEach(f => f());
  return { messages, get failed() { return failed; },
    push(raw: unknown) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as Message).type !== "string") failed = true;
      else messages.push(raw as Message);
      notify();
    },
    fail() { failed = true; notify(); }, end() { ended = true; notify(); },
    async wait(type: string, after = 0) {
      let check!: () => void;
      try { return await bound(new Promise<Message>((resolve, reject) => {
        check = () => {
          const found = messages.slice(after).find(m => m.type === type);
          if (failed) reject(new Error("EVIDENCE_CHANNEL_INVALID")); else if (found) resolve(found);
          else if (ended) reject(new Error("EVIDENCE_CHANNEL_ENDED: " + type));
        };
        listeners.add(check); check();
      })); } finally { listeners.delete(check); }
    },
  };
}
function lines(stream: NodeJS.ReadableStream) {
  const box = mailbox(); let text = "";
  stream.on("data", chunk => {
    text += chunk.toString(); if (text.length > 8192) return box.fail();
    while (text.includes("\n")) {
      const index = text.indexOf("\n");
      try { box.push(JSON.parse(text.slice(0, index))); } catch { box.fail(); }
      text = text.slice(index + 1);
    }
  });
  stream.on("error", () => box.fail());
  stream.on("end", () => { if (text) box.fail(); box.end(); }); return box;
}
function observe(pid: number, nonce: string, timeoutMs = 15000) {
  const p = track(spawn("/usr/bin/python3", ["-I", "-B", resolve("scripts/preview-e2e/communication-note-task-process-observer.py")],
    { env: isolated, stdio: ["pipe", "pipe", "pipe"] }));
  const box = lines(p.child.stdout!);
  p.child.stdin!.on("error", () => box.fail()); p.child.stdin!.end(JSON.stringify({ pid, nonce, timeoutMs }) + "\n");
  return { process: p, box };
}
function command(f: Generation, type: string) { f.control.write(JSON.stringify({ type, nonce: f.nonce }) + "\n"); }
function rpc(f: Generation, m: Message) {
  const work = (async () => {
    const pause = f.gates.find(g => g.op === m.op && !g.used);
    if (pause) pause.used = true;
    if (pause && !pause.afterCommit) { pause.entered.resolve(); await pause.release.promise; }
    if (f.retired) { f.dropped++; return; }
    let value: unknown, failed = false;
    try {
      f.ops.push(m.op as string);
      if (m.op === f.failOp) throw new Error("RECOVERY_INJECTED_FAILURE");
      value = protocol(m.op as string, m.data as Record<string, unknown>);
    } catch { failed = true; }
    // This closure retains the old handle/nonce. It cannot target a new launcher.
    const deliver = () => {
      if (f.retired || !f.parent.child.connected) { f.dropped++; return false; }
      f.parent.child.send({ type: "protocol-reply", nonce: f.nonce, id: m.id, value, failed }, error => { if (error) f.ipc.fail(); });
      return true;
    };
    if (pause?.afterCommit) { pause.replay = deliver; pause.entered.resolve(); await pause.release.promise; }
    deliver();
  })();
  f.rpc.add(work); void work.then(() => f.rpc.delete(work), () => { f.rpc.delete(work); f.ipc.fail(); });
}
async function start(options: { mode?: string; waitReady?: boolean; timeoutMs?: number; gates?: RpcGate[]; failOp?: string } = {}) {
  const parent = track(fork(join(root, "child.cjs"), ["launcher"], { env: isolated, execArgv: [], serialization: "advanced",
    stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"] }));
  parent.child.stdout!.on("data", b => parent.output.push(Buffer.from(b)));
  const control = parent.child.stdio[4] as Socket;
  const f: Generation = { parent, control, nonce: randomBytes(16).toString("hex"), pid: 0,
    ipc: mailbox(), events: lines(control), controlClosed: false, closed: Promise.resolve(), rpc: new Set(), requests: new Set(),
    gates: options.gates ?? [], failOp: options.failOp, ops: [], retired: false, released: false, done: false, successorStarted: false, dropped: 0 };
  generations.push(f); // Register immediately, including before identity/startup failures.
  f.closed = new Promise(r => control.once("close", () => { f.controlClosed = true; r(); }));
  control.on("end", () => control.end());
  void parent.exited.then(() => { f.retired = true; });
  parent.child.on("message", (m: Message) => {
    if (m?.nonce !== f.nonce) return f.ipc.fail();
    if (m.type === "spawned") {
      if (m.pid !== parent.child.pid || !Number.isSafeInteger(m.servicePid) || (m.servicePid as number) <= 1) return f.ipc.fail();
      f.pid = m.servicePid as number;
    } else if (m.pid !== f.pid) return f.ipc.fail();
    if (m.type === "protocol-call") rpc(f, m); else f.ipc.push(m);
  });
  parent.child.once("disconnect", () => f.ipc.end());
  parent.child.send({ type: "init", nonce: f.nonce, mode: options.mode ?? "NORMAL", cert, key, publicKeyPem: identity.publicKeyPem });
  await f.ipc.wait("spawned");
  expect(await f.ipc.wait("constructed")).toMatchObject({ pid: f.pid, parentPid: parent.child.pid, address: null });
  f.watcher = observe(f.pid, f.nonce, options.timeoutMs);
  expect(await f.watcher.box.wait("armed")).toMatchObject({ pid: f.pid, nonce: f.nonce, observerPid: f.watcher.process.child.pid });
  parent.child.send({ type: "ping", nonce: f.nonce });
  expect(await f.ipc.wait("alive")).toMatchObject({ pid: f.pid, parentPid: parent.child.pid, nonce: f.nonce });
  command(f, "begin");
  if (options.waitReady !== false) await ready(f);
  return f;
}
async function ready(f: Generation) {
  const r = await f.events.wait("ready"), address = r.address as { host: string; port: number };
  expect(r).toMatchObject({ nonce: f.nonce, pid: f.pid }); expect(address.host).toBe("127.0.0.1");
  expect(address.port).toBeGreaterThan(0); expect(r.instanceId).toMatch(/^[a-f0-9]{64}$/);
  f.port = address.port; f.instanceId = r.instanceId as string; return f;
}
function read(f: Generation, h: Awaited<ReturnType<typeof harness>>) {
  const work = h.handle(request()); f.requests.add(work); requests.push(work);
  void work.then(() => f.requests.delete(work), () => f.requests.delete(work)); return work;
}
async function joinWire() {
  await bound(Promise.all(wire.map(async w => { await w.closed; closedWires.add(w); })));
}
async function inspect(f: Generation) {
  const index = f.events.messages.length; command(f, "inspect"); return f.events.wait("inspection", index);
}
async function stopParent(f: Generation, signal?: "SIGKILL") {
  if (signal) expect(f.parent.child.kill(signal)).toBe(true);
  else f.parent.child.send({ type: "exit-parent", nonce: f.nonce });
  expect(await bound(f.parent.exited)).toEqual(signal ? { code: null, signal } : { code: 0, signal: null });
  expect(await f.events.wait("ipc-lost")).toMatchObject({ nonce: f.nonce, pid: f.pid });
}
async function release(f: Generation, watcher = f.watcher!) {
  const outcome = f.events.messages.find(m => m.type === "owner-finished") ?? await f.events.wait("owner-finished");
  if (!f.released) { f.released = true; command(f, "release-exit"); }
  expect(await watcher.box.wait("kernel-exit")).toMatchObject({ pid: f.pid, nonce: f.nonce, observerPid: watcher.process.child.pid });
  expect(await bound(watcher.process.closed)).toEqual({ code: 0, signal: null });
  await bound(Promise.all([f.parent.closed, f.closed])); f.done = true; return outcome;
}
function startRecovery(f: Generation, options: Parameters<typeof start>[0] = {}) {
  const watcher = f.watcher, kernel = watcher?.box.messages.find(m => m.type === "kernel-exit");
  const released = f.events.messages.find(m => m.type === "exit-released");
  if (!watcher || f.successorStarted || !f.retired || !f.parent.didClose || !f.controlClosed ||
      f.rpc.size || f.requests.size || wire.some(w => !closedWires.has(w)) ||
      f.ipc.failed || f.events.failed || watcher.box.failed || f.parent.errors.length || watcher.process.errors.length ||
      !watcher.process.didClose || watcher.process.child.exitCode !== 0 || watcher.process.child.signalCode !== null ||
      watcher.box.messages.some(m => m.type === "unverified") ||
      kernel?.pid !== f.pid || kernel?.nonce !== f.nonce || kernel?.observerPid !== watcher.process.child.pid ||
      released?.pid !== f.pid || released?.nonce !== f.nonce) throw new Error("RECOVERY_PROCESS_UNVERIFIED");
  // Only permission to run recovery. Old cleanup stays unknown; the ACTUAL
  // issuer/service/HTTPS start path must complete recovery before it listens.
  f.successorStarted = true; return start({ ...options, waitReady: false });
}
async function cleanup(f: Generation) {
  if (f.done) return;
  if (!f.pid) throw new Error("UNKNOWN_SERVICE_IDENTITY");
  let watcher = f.watcher;
  if (!watcher || (watcher.process.didClose && !watcher.box.messages.some(m => m.type === "kernel-exit"))) {
    watcher = observe(f.pid, f.nonce);
    expect(await watcher.box.wait("armed")).toMatchObject({ pid: f.pid, nonce: f.nonce });
    const index = f.events.messages.length; command(f, "ping");
    expect(await f.events.wait("alive-control", index)).toMatchObject({ pid: f.pid, nonce: f.nonce });
  }
  if (!f.parent.didExit) await stopParent(f);
  await release(f, watcher); // Never replace f.watcher with teardown evidence.
}

describe.skipIf(process.platform !== "darwin")("Workspace TLS after launcher death (Auth/SQL/ledger simulated)", { timeout: 25000 }, () => {
  beforeAll(async () => {
    root = mkdtempSync("/private/tmp/cl-task-parent-"); expect(realpathSync(root)).toBe(root);
    const privatePem = () => generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    writeFileSync(join(root, "ca.key"), privatePem(), { mode: 0o600 }); writeFileSync(join(root, "leaf.key"), privatePem(), { mode: 0o600 });
    writeFileSync(join(root, "ca.conf"), "[req]\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\n[ca]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,keyCertSign,cRLSign\n");
    writeFileSync(join(root, "leaf.conf"), "basicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:" + HOST + "\n");
    const openssl = (args: string[]) => execFileSync("/usr/bin/openssl", args, { cwd: root, stdio: "ignore", timeout: 10000 });
    openssl(["req", "-new", "-x509", "-key", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=Task Chain Test CA", "-config", "ca.conf"]);
    openssl(["req", "-new", "-key", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=" + HOST]);
    openssl(["x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-set_serial", "1", "-out", "leaf.pem", "-days", "1", "-extfile", "leaf.conf"]);
    ca = readFileSync(join(root, "ca.pem")); cert = readFileSync(join(root, "leaf.pem")); key = readFileSync(join(root, "leaf.key"));
    pin = sha(new X509Certificate(cert).publicKey.export({ type: "spki", format: "der" }));
    await build({ entryPoints: ["scripts/preview-e2e/communication-note-task-parent-exit-local-child.mjs"], outfile: join(root, "child.cjs"),
      bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "silent", external: ["pg-native"],
      alias: { "server-only": require.resolve("next/dist/compiled/server-only/empty.js") } });
  });
  beforeEach(() => { vi.clearAllMocks(); io.pg.length = 0; io.query = undefined; leases.clear(); calls.length = 0; epoch = undefined; ledgerReady = false; });
  afterEach(async () => {
    const failures: unknown[] = [];
    generations.forEach(f => f.gates.forEach(g => g.release.resolve()));
    controllers.splice(0).forEach(c => c.abort()); wire.forEach(w => w.client.destroy());
    try { await bound(Promise.allSettled(requests.splice(0))); await joinWire(); } catch (error) { failures.push(error); }
    for (const f of generations.splice(0)) {
      try { await bound(Promise.all([...f.rpc])); await cleanup(f); }
      catch (error) { allServicesExited = false; failures.push(error); }
    }
    for (const p of processes.splice(0)) {
      if (!p.didExit) p.child.kill("SIGTERM");
      try { await bound(p.closed); expect(p.errors).toEqual([]); expect(Buffer.concat(p.output).length).toBe(0); }
      catch (error) { failures.push(error); }
    }
    wire.length = 0; vi.unstubAllEnvs(); vi.restoreAllMocks();
    if (failures.length) throw failures[0];
  }, 25000);
  afterAll(() => {
    key?.fill(0); expect(allServicesExited).toBe(true);
    if (root) { expect(root).toMatch(/^\/private\/tmp\/cl-task-parent-[A-Za-z0-9]{6}$/);
      expect(realpathSync(root)).toBe(root); rmSync(root, { recursive: true }); }
  });

  async function loseLease(mode = "ISSUE_COMMITTED", signal?: "SIGKILL") {
    const f = await start({ mode }), h = await harness(f), pending = read(f, h);
    await f.events.wait("checkpoint"); const oldEpoch = epoch;
    await stopParent(f, signal);
    const response = await pending; expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
    await joinWire();
    // Native disconnect is the trigger, not completion of HTTPS listener close.
    expect(await f.events.wait("owner-finished")).toMatchObject({ state: "FAILED", cleanupConfirmed: false });
    await listenerClosed(f.port!);
    expect([...leases.values()].map(l => l.state)).toEqual([mode === "ISSUE_COMMITTED" ? "ISSUED" : "FENCED"]);
    expect(await release(f)).toMatchObject({ state: "FAILED", cleanupConfirmed: false });
    expect(epoch).toBe(oldEpoch); return { f, oldEpoch };
  }
  async function noListener(f: Generation) {
    expect(await inspect(f)).toMatchObject({ address: null, listening: false, health: { state: "STARTING", cleanupConfirmed: false } });
    expect(f.events.messages.some(m => m.type === "ready")).toBe(false); expect(f.ops).not.toContain("issue");
  }
  it.each([
    ["normal", "ISSUE_COMMITTED"], ["normal", "FENCE_COMMITTED"],
    ["SIGKILL", "ISSUE_COMMITTED"], ["SIGKILL", "FENCE_COMMITTED"],
  ])("recovers nonempty state after %s launcher death at %s before admitting new TLS requests", async (death, mode) => {
    const { f, oldEpoch } = await loseLease(mode, death === "SIGKILL" ? "SIGKILL" : undefined);
    const inventory = gate("inventory"), finalize = gate("finalize", true);
    const next = await startRecovery(f, { gates: [inventory, finalize] });
    expect(() => startRecovery(f)).toThrow("RECOVERY_PROCESS_UNVERIFIED");
    await bound(inventory.entered.promise); await noListener(next);
    expect(epoch).not.toBe(oldEpoch); expect(leases.size).toBe(1);
    inventory.release.resolve(); await bound(finalize.entered.promise);
    cleaned(1); await noListener(next); expect(next.ops).not.toContain("ready");
    finalize.release.resolve(); await ready(next);
    expect(next.ops).toEqual(["start", "inventory", "fence", "finalize", "ready"]);
    expect((await inspect(next)).listening).toBe(true); expect(next.instanceId).not.toBe(f.instanceId);
    const issues = calls.filter(c => c.op === "issue").length, before = wire.length;
    const stale = await harness(next, { instanceId: f.instanceId! }), rejected = await read(next, stale);
    expect(rejected.status).toBe(503); expect(await rejected.json()).not.toHaveProperty("taskPage");
    expect(stale.sign).toHaveBeenCalledTimes(2); expect(wire.slice(before).map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]);
    expect(wire.slice(before).every(w => w.secure)).toBe(true);
    expect(calls.filter(c => c.op === "issue")).toHaveLength(issues); cleaned(1);
    const cleanupReply = gate("finalize", true); next.gates.push(cleanupReply);
    const fresh = await harness(next); let returned = false;
    const pending = read(next, fresh).then(r => { returned = true; return r; });
    await bound(cleanupReply.entered.promise); expect(returned).toBe(false); cleaned(2);
    cleanupReply.release.resolve(); const response = await pending;
    expect(response.status).toBe(200); expect((await response.json()).taskPage.tasks[0].jobId).toBe(USER);
    expect(wire.slice(-2).map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]);
    expect(wire.slice(-2).every(w => w.secure)).toBe(true); cleaned(2); await joinWire();
    expect(f.events.messages.find(m => m.type === "owner-finished")?.cleanupConfirmed).toBe(false);
  });
  it("does not substitute IPC loss, closed listener or owner outcome for kernel exit", async () => {
    const f = await start(), h = await harness(f), s = h.custody();
    const d = await s.client.issue(s.scope, { signal: control().signal }); (d.credential as { password: string }).password = "";
    expect(() => startRecovery(f)).toThrow("RECOVERY_PROCESS_UNVERIFIED");
    await stopParent(f);
    expect(await f.events.wait("owner-finished")).toMatchObject({ cleanupConfirmed: false });
    await listenerClosed(f.port!); await joinWire();
    const index = f.events.messages.length; command(f, "ping");
    expect(await f.events.wait("alive-control", index)).toMatchObject({ pid: f.pid, nonce: f.nonce });
    expect(f.watcher!.box.messages.some(m => m.type === "kernel-exit")).toBe(false);
    expect(() => startRecovery(f)).toThrow("RECOVERY_PROCESS_UNVERIFIED"); await release(f);
    const next = await startRecovery(f); await ready(next); cleaned(1);
  });
  it.each(["timeout", "SIGKILL"])("keeps original %s observer failure after successful teardown observation", async mode => {
    const f = await start({ timeoutMs: mode === "timeout" ? 0 : 15000 });
    if (mode === "timeout") expect(await f.watcher!.box.wait("unverified")).toMatchObject({ reason: "EXIT_UNCONFIRMED" });
    else expect(f.watcher!.process.child.kill("SIGKILL")).toBe(true);
    expect(await bound(f.watcher!.process.closed)).toEqual(mode === "timeout" ? { code: 2, signal: null } : { code: null, signal: "SIGKILL" });
    await cleanup(f); expect(f.done && f.controlClosed && f.parent.didClose).toBe(true);
    expect(() => startRecovery(f)).toThrow("RECOVERY_PROCESS_UNVERIFIED");
    expect(generations).toHaveLength(1); expect(calls.filter(c => c.op === "start")).toHaveLength(1);
  });
  it("rejects corrupted real completion evidence even after verified kernel exit", async () => {
    const f = await start({ mode: "CORRUPT_CONTROL" }); await stopParent(f); await release(f);
    expect(f.events.failed).toBe(true); expect(() => startRecovery(f)).toThrow("RECOVERY_PROCESS_UNVERIFIED");
    expect(generations).toHaveLength(1);
  });
  it.each(["inventory", "finalize", "ready"])("never listens after successor %s recovery failure", async failOp => {
    const { f } = await loseLease(); const next = await startRecovery(f, { failOp });
    await next.events.wait("startup-failed");
    expect(await next.events.wait("owner-finished")).toMatchObject({ state: "FAILED", cleanupConfirmed: false });
    expect(await inspect(next)).toMatchObject({ address: null, listening: false });
    expect(next.events.messages.some(m => m.type === "ready")).toBe(false);
    expect(next.ops).not.toContain("issue"); expect(leases.size).toBe(1);
    expect(generations).toHaveLength(2);
  });
  it("settles the retired generation before recovery and drops its delayed reply afterward", async () => {
    const delayed = gate("issue", true), f = await start({ gates: [delayed] });
    const h = await harness(f), pending = read(f, h); await bound(delayed.entered.promise);
    expect([...leases.values()][0].state).toBe("ISSUED"); await stopParent(f);
    const response = await pending; expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
    await joinWire(); await release(f);
    expect(f.rpc.size).toBe(1); expect(() => startRecovery(f)).toThrow("RECOVERY_PROCESS_UNVERIFIED");
    delayed.release.resolve(); await bound(Promise.all([...f.rpc])); expect(f.dropped).toBe(1);
    const inventory = gate("inventory"), next = await startRecovery(f, { gates: [inventory] });
    await bound(inventory.entered.promise); const nextEpoch = epoch, ops = [...next.ops];
    expect(delayed.replay!()).toBe(false); expect(f.dropped).toBe(2);
    expect(epoch).toBe(nextEpoch); expect(next.ops).toEqual(ops); await noListener(next);
    inventory.release.resolve(); await ready(next); cleaned(1);
    const fresh = await harness(next); expect((await read(next, fresh)).status).toBe(200); cleaned(2);
  });
  it("keeps the formal route and all fixture imports outside the disabled product runtime", async () => {
    for (const [k, v] of Object.entries(env())) vi.stubEnv(k, v);
    const runtime = await import("./communication-note-workspace-runtime.server");
    const route = await import("../app/api/ai-documents/communication-note/documents/route");
    expect(runtime.COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined(); expect((await route.GET(request())).status).toBe(503);
    expect(io.cookie).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled(); expect(io.pg).toHaveLength(0);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
    expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") &&
      /task-parent-exit-local-child|task-process-observer/.test(readFileSync(p, "utf8")))).toEqual([]);
    expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toContain("HOSTED_WORKSPACE_READ_BINDING = undefined");
  });
});
