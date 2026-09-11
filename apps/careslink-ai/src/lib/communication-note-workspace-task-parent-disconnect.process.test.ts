import { execFileSync, fork, spawn, type ChildProcess } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign as signBytes, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { connect as tcpConnect } from "node:net";
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

/** Test-local diagnostic only. The existing successor/recovery guards and
 * original TLS suites stay unchanged. No successor can be launched here. */
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type Tracked = { child: ChildProcess; exited: Promise<Exit>; closed: Promise<Exit>;
  didExit: boolean; didClose: boolean; output: Buffer[]; errors: Error[] };
type Streams = { end: boolean; close: boolean; bytes: number };
type Snapshot = { disconnect: boolean; exit: boolean; code: number | null; signal: string | null;
  closeCount: number; closeCode: number | null; closeSignal: string | null; controlInvalid: boolean;
  stdout: Streams; stderr: Streams; control: Streams };
type RpcGate = { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred>; used: boolean;
  replay?: () => Promise<void> };
type Fixture = { parent: Tracked; nonce: string; pid: number; sequence: number; box: ReturnType<typeof mailbox>;
  ipc: ReturnType<typeof mailbox>; control: ReturnType<typeof mailbox>; watcher?: ReturnType<typeof observe>;
  rpc: Set<Promise<void>>; gate?: RpcGate; retired: boolean; disconnected: boolean; released: boolean; done: boolean;
  invalid: boolean; beforeAlive: boolean; afterAlive: boolean; side?: string; mode: string; dropped: number;
  runtime?: { node: string; platform: string; arch: string }; snapshot?: Snapshot; snapshotSeq?: number;
  port?: number; instanceId?: string };
const isolated = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" } as const;
const CLOSE_WINDOW_MS = 250;
const fixtures: Fixture[] = [], processes: Tracked[] = [], requests: Promise<Response>[] = [];
let allResourcesClosed = true;
function track(child: ChildProcess): Tracked {
  const p = { child, didExit: false, didClose: false, output: [] as Buffer[], errors: [] as Error[] } as Tracked;
  p.exited = new Promise(r => child.once("exit", (code, signal) => { p.didExit = true; r({ code, signal }); }));
  p.closed = new Promise(r => child.once("close", (code, signal) => { p.didClose = true; r({ code, signal }); }));
  child.on("error", e => p.errors.push(e)); child.stderr!.on("data", b => p.output.push(Buffer.from(b)));
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
    async wait(type: string, after = 0, match: (m: Message) => boolean = () => true) {
      let check!: () => void;
      try { return await bound(new Promise<Message>((resolve, reject) => {
        check = () => {
          const found = messages.slice(after).find(m => m.type === type && match(m));
          if (failed) reject(new Error("DIAGNOSTIC_CHANNEL_INVALID"));
          else if (found) resolve(found); else if (ended) reject(new Error("DIAGNOSTIC_CHANNEL_ENDED: " + type));
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
      const i = text.indexOf("\n");
      try { box.push(JSON.parse(text.slice(0, i))); } catch { box.fail(); }
      text = text.slice(i + 1);
    }
  });
  stream.on("error", () => box.fail()); stream.on("end", () => { if (text) box.fail(); box.end(); });
  return box;
}
function observe(f: Fixture, timeoutMs = 15000) {
  const p = track(spawn("/usr/bin/python3", ["-I", "-B", resolve("scripts/preview-e2e/communication-note-task-process-observer.py")],
    { env: isolated, stdio: ["pipe", "pipe", "pipe"] }));
  const box = lines(p.child.stdout!);
  p.child.stdin!.on("error", () => box.fail()); p.child.stdin!.end(JSON.stringify({ pid: f.pid, nonce: f.nonce, timeoutMs }) + "\n");
  return { process: p, box, attested: false };
}
async function send(f: Fixture, fields: Record<string, unknown>) {
  await bound(new Promise<void>((resolve, reject) => {
    f.parent.child.send({ ...fields, nonce: f.nonce }, error => error ? reject(new Error("LOCAL_LAUNCHER_SEND_FAILED")) : resolve());
  }));
}
async function command(f: Fixture, type: string) {
  const challenge = randomBytes(16).toString("hex"); await send(f, { type, challenge }); return challenge;
}
async function controlCommand(f: Fixture, action: string) {
  const challenge = randomBytes(16).toString("hex"); await send(f, { type: "control", action, challenge }); return challenge;
}
async function pingParent(f: Fixture) {
  const challenge = await command(f, "ping-launcher");
  const alive = await f.box.wait("launcher-alive", 0, m => m.challenge === challenge);
  expect(alive).toMatchObject({ nonce: f.nonce, pid: f.parent.child.pid, servicePid: f.pid });
  expect(f.parent.didExit).toBe(false); return true;
}
async function pingService(f: Fixture) {
  const challenge = await controlCommand(f, "ping");
  expect(await f.control.wait("alive-control", 0, m => m.challenge === challenge)).toMatchObject({ nonce: f.nonce, pid: f.pid });
}
function rpc(f: Fixture, m: Message) {
  const work = (async () => {
    if (f.retired) { f.dropped++; return; }
    let value: unknown, failed = false;
    try { value = protocol(m.op as string, m.data as Record<string, unknown>); } catch { failed = true; }
    const reply = { type: "protocol-reply", id: m.id, value, failed };
    if (m.op === "issue" && f.gate && !f.gate.used) {
      f.gate.used = true;
      // Retains only the ORIGINAL launcher and nonce; this exercises its
      // retired-service guard even while the launcher itself stays connected.
      f.gate.replay = () => send(f, reply);
      f.gate.entered.resolve(); await f.gate.release.promise;
    }
    if (f.retired) { f.dropped++; return; }
    await send(f, reply);
  })();
  f.rpc.add(work); void work.then(() => f.rpc.delete(work), () => { f.rpc.delete(work); f.box.fail(); });
}
async function start(options: { mode?: string; timeoutMs?: number; gate?: RpcGate } = {}) {
  const parent = track(fork(join(root, "child.cjs"), ["launcher"], { env: isolated, execArgv: [], serialization: "advanced",
    stdio: ["ignore", "pipe", "pipe", "ipc"] }));
  parent.child.stdout!.on("data", b => parent.output.push(Buffer.from(b)));
  const f: Fixture = { parent, nonce: randomBytes(16).toString("hex"), pid: 0, sequence: 0,
    box: mailbox(), ipc: mailbox(), control: mailbox(), rpc: new Set(), gate: options.gate, mode: options.mode ?? "NORMAL",
    retired: false, disconnected: false, released: false, done: false, invalid: false, beforeAlive: false, afterAlive: false, dropped: 0 };
  fixtures.push(f); // Includes construction and identity failures.
  parent.child.once("disconnect", () => { f.box.end(); f.ipc.end(); f.control.end(); });
  parent.child.on("message", (m: Message) => {
    if (m?.nonce !== f.nonce || m.pid !== parent.child.pid || m.seq !== f.sequence + 1) return f.box.fail();
    f.sequence++;
    if (m.type === "spawned") {
      if (!Number.isSafeInteger(m.servicePid) || (m.servicePid as number) <= 1 || m.servicePid === parent.child.pid) return f.box.fail();
      f.pid = m.servicePid as number;
    } else if (m.servicePid !== f.pid) return f.box.fail();
    if (m.type === "native-disconnect") { f.retired = true; f.disconnected = true; }
    if (m.type === "evidence-error") f.invalid = true;
    if (["service-ipc", "service-control"].includes(m.type)) {
      const value = m.message as Message;
      if (!value || value.nonce !== f.nonce || value.pid !== f.pid) return f.box.fail();
      (m.type === "service-ipc" ? f.ipc : f.control).push(value);
    }
    f.box.push(m); if (m.type === "protocol-call") rpc(f, m);
  });
  await send(f, { type: "init", mode: f.mode, cert, key, publicKeyPem: identity.publicKeyPem });
  const spawned = await f.box.wait("spawned");
  f.runtime = { node: spawned.node as string, platform: spawned.platform as string, arch: spawned.arch as string };
  expect(f.runtime).toEqual({ node: process.version, platform: process.platform, arch: process.arch });
  expect(await f.ipc.wait("constructed")).toMatchObject({ pid: f.pid, parentPid: parent.child.pid, address: null });
  f.watcher = observe(f, options.timeoutMs);
  expect(await f.watcher.box.wait("armed")).toMatchObject({ pid: f.pid, nonce: f.nonce, observerPid: f.watcher.process.child.pid });
  const challenge = await command(f, "ping-service");
  expect(await f.ipc.wait("alive", 0, m => m.challenge === challenge)).toMatchObject({ pid: f.pid, parentPid: parent.child.pid, nonce: f.nonce });
  f.watcher.attested = true;
  await controlCommand(f, "begin");
  const ready = await f.control.wait("ready"), address = ready.address as { host: string; port: number };
  expect(address.host).toBe("127.0.0.1"); expect(address.port).toBeGreaterThan(0); expect(ready.instanceId).toMatch(/^[a-f0-9]{64}$/);
  f.port = address.port; f.instanceId = ready.instanceId as string; return f;
}
function read(f: Fixture, h: Awaited<ReturnType<typeof harness>>) {
  expect(f.port).toBeDefined(); const work = h.handle(request()); requests.push(work); return work;
}
async function joinWire() { await bound(Promise.all(wire.map(w => w.closed))); }
async function disconnect(f: Fixture, side: "parent" | "child" = "parent") {
  f.beforeAlive = await pingParent(f); f.retired = true; f.side = side;
  const challenge = await command(f, "disconnect-" + side);
  expect(await f.box.wait("trigger", 0, m => m.challenge === challenge)).toMatchObject({ side: "disconnect-" + side });
  await f.box.wait("native-disconnect"); await f.control.wait("ipc-lost");
}
async function stopped(f: Fixture) {
  const outcome = await f.control.wait("owner-finished");
  expect(outcome).toMatchObject({ state: "FAILED", cleanupConfirmed: false });
  await listenerClosed(f.port!); return outcome;
}
function verified(f: Fixture, w = f.watcher) {
  if (!w?.attested || !w.process.didClose || w.process.errors.length || w.box.failed ||
      w.process.child.exitCode !== 0 || w.process.child.signalCode !== null || w.box.messages.some(m => m.type === "unverified")) return false;
  const events = w.box.messages.filter(m => m.type === "kernel-exit");
  return events.length === 1 && events[0].nonce === f.nonce && events[0].pid === f.pid && events[0].observerPid === w.process.child.pid;
}
function streamsClosed(s?: Snapshot) { return !!s && [s.stdout, s.stderr, s.control].every(p => p.end && p.close); }
function report(f: Fixture) {
  const s = f.snapshot, outcome = f.control.messages.find(m => m.type === "owner-finished");
  const exit = verified(f), valid = exit && !f.invalid && !f.box.failed && !f.parent.errors.length &&
    f.beforeAlive && f.afterAlive && streamsClosed(s) && !!s?.exit && f.control.messages.some(m => m.type === "exit-released");
  return { ...f.runtime, mode: f.mode, side: f.side, diagnosticEvidence: valid ? "VERIFIED" : "UNVERIFIED",
    parentAliveAtDisconnect: f.beforeAlive, parentAliveAfterServiceExit: f.afterAlive,
    serviceExitEvidence: exit ? "VERIFIED" : "UNVERIFIED", serviceExitCode: s?.code ?? null, serviceExitSignal: s?.signal ?? null,
    serviceNodeClose: !s ? "UNVERIFIED" : s.closeCount ? "OBSERVED" : "NOT_OBSERVED_IN_WINDOW",
    closeCount: s?.closeCount ?? null, closeWindowMs: s ? CLOSE_WINDOW_MS : null, serviceStreamsClosed: streamsClosed(s),
    ownerOutcome: outcome?.state ?? "UNVERIFIED", cleanupConfirmed: outcome?.cleanupConfirmed === true,
    controlEvidence: f.invalid ? "UNVERIFIED" : "VALID", teardownEvidence: f.done ? "CONFIRMED" : "NOT_COMPLETED" };
}
async function observeExit(f: Fixture, watcher = f.watcher!) {
  await stopped(f);
  if (!f.released) { f.released = true; await controlCommand(f, "release-exit"); }
  await f.control.wait("exit-released");
  expect(await watcher.box.wait("kernel-exit")).toMatchObject({ pid: f.pid, nonce: f.nonce, observerPid: watcher.process.child.pid });
  expect(await bound(watcher.process.closed)).toEqual({ code: 0, signal: null }); expect(verified(f, watcher)).toBe(true);
  expect(await f.box.wait("native-exit")).toMatchObject({ code: 1, signal: null });
  for (const stream of ["stdout", "stderr", "control"]) {
    await f.box.wait("stream-end", 0, m => m.stream === stream); await f.box.wait("stream-close", 0, m => m.stream === stream);
  }
  await joinWire(); f.afterAlive = await pingParent(f);
  // A bounded observation window, never a synthetic close or disposal proof.
  const until = performance.now() + CLOSE_WINDOW_MS;
  while (performance.now() < until) await new Promise(r => setTimeout(r, Math.max(1, Math.ceil(until - performance.now()))));
  const challenge = await command(f, "snapshot"), snapshot = await f.box.wait("snapshot", 0, m => m.challenge === challenge);
  f.snapshot = snapshot.observed as Snapshot; f.snapshotSeq = snapshot.seq as number;
  expect(f.snapshot).toMatchObject({ disconnect: true, exit: true, code: 1, signal: null });
  expect(streamsClosed(f.snapshot)).toBe(true); expect(f.snapshot.stdout.bytes + f.snapshot.stderr.bytes).toBe(0);
  const closes = f.box.messages.filter(m => m.type === "native-close" && (m.seq as number) < f.snapshotSeq!);
  expect(f.snapshot.closeCount).toBe(closes.length); expect(closes.length).toBeLessThanOrEqual(1);
  if (closes.length) {
    expect(f.snapshot).toMatchObject({ closeCode: 1, closeSignal: null });
    expect(closes[0].seq as number).toBeGreaterThan(f.box.messages.find(m => m.type === "native-exit")!.seq as number);
  }
}
async function cleanup(f: Fixture) {
  if (f.done) return;
  if (!f.pid) throw new Error("UNKNOWN_SERVICE_IDENTITY");
  if (!f.disconnected) await disconnect(f);
  if (!f.snapshot) {
    let w = f.watcher;
    if (!w || (w.process.didClose && !verified(f, w))) {
      w = observe(f); expect(await w.box.wait("armed")).toMatchObject({ pid: f.pid, nonce: f.nonce, observerPid: w.process.child.pid });
      await pingService(f); w.attested = true; // teardown only; f.watcher is unchanged
    }
    await observeExit(f, w);
  }
  expect(streamsClosed(f.snapshot)).toBe(true); expect(f.rpc.size).toBe(0);
  await command(f, "exit-launcher"); await f.box.wait("launcher-released");
  expect(await bound(f.parent.closed)).toEqual({ code: 0, signal: null }); f.done = true;
}
function pgClosed() {
  for (const c of io.pg) {
    expect(c.end).toHaveBeenCalledOnce(); expect(c.connection.stream.destroy).toHaveBeenCalledOnce();
    expect(c.password).toBeUndefined(); expect(c.config.password).toBeUndefined(); expect(c.connectionParameters.password).toBeUndefined();
  }
}

describe.skipIf(process.platform !== "darwin")("live parent IPC disconnect diagnostic (Auth/SQL/ledger simulated)", { timeout: 25000 }, () => {
  beforeAll(async () => {
    root = mkdtempSync("/private/tmp/cl-task-disconnect-"); expect(realpathSync(root)).toBe(root);
    const privatePem = () => generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
    writeFileSync(join(root, "ca.key"), privatePem(), { mode: 0o600 }); writeFileSync(join(root, "leaf.key"), privatePem(), { mode: 0o600 });
    writeFileSync(join(root, "ca.conf"), "[req]\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\n[ca]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,keyCertSign,cRLSign\n");
    writeFileSync(join(root, "leaf.conf"), "basicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:" + HOST + "\n");
    const openssl = (args: string[]) => execFileSync("/usr/bin/openssl", args, { cwd: root, stdio: "ignore", timeout: 10000 });
    openssl(["req", "-new", "-x509", "-key", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=Task Disconnect Test CA", "-config", "ca.conf"]);
    openssl(["req", "-new", "-key", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=" + HOST]);
    openssl(["x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-set_serial", "1", "-out", "leaf.pem", "-days", "1", "-extfile", "leaf.conf"]);
    ca = readFileSync(join(root, "ca.pem")); cert = readFileSync(join(root, "leaf.pem")); key = readFileSync(join(root, "leaf.key"));
    pin = sha(new X509Certificate(cert).publicKey.export({ format: "der", type: "spki" }));
    await build({ entryPoints: ["scripts/preview-e2e/communication-note-task-parent-disconnect-local-child.mjs"], outfile: join(root, "child.cjs"),
      bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "silent", external: ["pg-native"],
      alias: { "server-only": require.resolve("next/dist/compiled/server-only/empty.js") } });
  });
  beforeEach(() => { vi.clearAllMocks(); io.pg.length = 0; io.query = undefined; leases.clear(); calls.length = 0; epoch = undefined; ledgerReady = false; });
  afterEach(async () => {
    const failures: unknown[] = [];
    fixtures.forEach(f => f.gate?.release.resolve());
    controllers.splice(0).forEach(c => c.abort()); wire.forEach(w => w.client.destroy());
    try { await bound(Promise.allSettled(requests.splice(0))); await joinWire(); } catch (error) { failures.push(error); allResourcesClosed = false; }
    for (const f of fixtures.splice(0)) {
      try { await bound(Promise.all([...f.rpc])); await cleanup(f);
        console.info("LOCAL_DISCONNECT_DIAGNOSTIC", JSON.stringify(report(f))); }
      catch (error) { failures.push(error); allResourcesClosed = false; }
    }
    for (const p of processes.splice(0)) {
      if (!p.didExit) p.child.kill("SIGTERM");
      try { await bound(p.closed); expect(p.errors).toEqual([]); expect(Buffer.concat(p.output).length).toBe(0); }
      catch (error) { failures.push(error); allResourcesClosed = false; }
    }
    wire.length = 0; vi.unstubAllEnvs(); vi.restoreAllMocks();
    if (failures.length) throw failures[0];
  }, 25000);
  afterAll(() => {
    key?.fill(0); expect(allResourcesClosed).toBe(true);
    if (root) { expect(root).toMatch(/^\/private\/tmp\/cl-task-disconnect-[A-Za-z0-9]{6}$/);
      expect(realpathSync(root)).toBe(root); rmSync(root, { recursive: true }); }
  });

  it.each(["parent", "child"] as const)("records actual %s disconnect with a live launcher and independent close evidence", async side => {
    const f = await start(); await disconnect(f, side); await observeExit(f);
    const r = report(f);
    expect(r).toMatchObject({ diagnosticEvidence: "VERIFIED", serviceExitEvidence: "VERIFIED", serviceStreamsClosed: true,
      parentAliveAtDisconnect: true, parentAliveAfterServiceExit: true, ownerOutcome: "FAILED", cleanupConfirmed: false, closeWindowMs: 250 });
    if (side === "child") expect(r).toMatchObject({ serviceNodeClose: "OBSERVED", closeCount: 1 });
    else expect(["OBSERVED", "NOT_OBSERVED_IN_WINDOW"]).toContain(r.serviceNodeClose);
    expect(leases.size).toBe(0);
  });
  it.each(["ISSUE_COMMITTED", "FENCE_COMMITTED"])("retains the actual request's %s lease after parent disconnect", async mode => {
    const f = await start({ mode }), h = await harness(f), pending = read(f, h);
    await f.control.wait("checkpoint"); const oldEpoch = epoch; await disconnect(f);
    const response = await pending; expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
    await joinWire(); await observeExit(f);
    expect([...leases.values()].map(l => l.state)).toEqual([mode === "ISSUE_COMMITTED" ? "ISSUED" : "FENCED"]);
    expect(epoch).toBe(oldEpoch); expect(calls.filter(c => c.op === "start")).toHaveLength(1);
    expect(report(f)).toMatchObject({ diagnosticEvidence: "VERIFIED", cleanupConfirmed: false });
    expect(h.sign).toHaveBeenCalled(); expect(wire.some(w => w.path === PATHS.issue && w.secure)).toBe(true); pgClosed();
  });
  it("keeps kernel exit unverified while the stopped service is still alive behind the exit barrier", async () => {
    const f = await start(), h = await harness(f), custody = h.custody();
    const lease = await custody.client.issue(custody.scope, { signal: control().signal });
    (lease.credential as { password: string }).password = "";
    await disconnect(f); await stopped(f); await joinWire(); await pingService(f);
    expect(f.box.messages.some(m => m.type === "native-exit")).toBe(false);
    expect(f.watcher!.box.messages.some(m => m.type === "kernel-exit")).toBe(false);
    expect(report(f)).toMatchObject({ serviceExitEvidence: "UNVERIFIED", serviceNodeClose: "UNVERIFIED" });
    await observeExit(f); expect(report(f).serviceExitEvidence).toBe("VERIFIED"); expect(leases.size).toBe(1);
  });
  it.each(["timeout", "SIGKILL"])("preserves the original observer's %s failure after verified resource teardown", async mode => {
    const f = await start({ timeoutMs: mode === "timeout" ? 0 : 15000 });
    if (mode === "timeout") expect(await f.watcher!.box.wait("unverified")).toMatchObject({ reason: "EXIT_UNCONFIRMED" });
    else expect(f.watcher!.process.child.kill("SIGKILL")).toBe(true);
    expect(await bound(f.watcher!.process.closed)).toEqual(mode === "timeout" ? { code: 2, signal: null } : { code: null, signal: "SIGKILL" });
    const original = f.watcher; await disconnect(f); await cleanup(f);
    expect(f.watcher).toBe(original);
    expect(report(f)).toMatchObject({ diagnosticEvidence: "UNVERIFIED", serviceExitEvidence: "UNVERIFIED", serviceStreamsClosed: true, teardownEvidence: "CONFIRMED" });
  });
  it("preserves malformed real control evidence after valid owner outcome and kernel exit", async () => {
    const f = await start({ mode: "CORRUPT_CONTROL" }); await disconnect(f); await observeExit(f);
    expect(f.invalid).toBe(true); expect(f.snapshot!.controlInvalid).toBe(true);
    expect(report(f)).toMatchObject({ diagnosticEvidence: "UNVERIFIED", serviceExitEvidence: "VERIFIED", controlEvidence: "UNVERIFIED", cleanupConfirmed: false });
  });
  it("settles and drops an old committed reply while its launcher stays alive after disconnect", async () => {
    const gate: RpcGate = { entered: deferred(), release: deferred(), used: false };
    const f = await start({ gate }), h = await harness(f), pending = read(f, h); await bound(gate.entered.promise);
    expect([...leases.values()][0].state).toBe("ISSUED"); const state = JSON.stringify([...leases]), oldEpoch = epoch;
    await disconnect(f); const response = await pending;
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("taskPage");
    await joinWire(); await observeExit(f); expect(f.rpc.size).toBe(1);
    gate.release.resolve(); await bound(Promise.all([...f.rpc])); expect(f.dropped).toBe(1);
    const index = f.box.messages.length, operations = calls.length; await gate.replay!(); await f.box.wait("protocol-dropped", index);
    expect(await pingParent(f)).toBe(true); expect(calls.length).toBe(operations); expect(epoch).toBe(oldEpoch);
    expect(JSON.stringify([...leases])).toBe(state); expect(f.rpc.size).toBe(0);
  });
  it("keeps the diagnostic and observer outside the disabled formal product runtime", async () => {
    for (const [k, v] of Object.entries(env())) vi.stubEnv(k, v);
    const runtime = await import("./communication-note-workspace-runtime.server");
    const route = await import("../app/api/ai-documents/communication-note/documents/route");
    expect(runtime.COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined(); expect((await route.GET(request())).status).toBe(503);
    expect(io.cookie).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled(); expect(io.pg).toHaveLength(0);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
    expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") &&
      /task-parent-disconnect-local-child|task-process-observer/.test(readFileSync(p, "utf8")))).toEqual([]);
    expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toContain("HOSTED_WORKSPACE_READ_BINDING = undefined");
  });
});
