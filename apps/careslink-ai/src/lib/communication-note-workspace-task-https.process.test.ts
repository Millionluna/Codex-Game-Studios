import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign as signBytes, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
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
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", OTHER_SESSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TIME = "2026-09-11T01:00:00.000000Z", CALLER = "careslink_v1_generation_job_list_caller";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }), require = createRequire(import.meta.url);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const identity = { origin: ORIGIN, issuer: "https://task-backend.invalid/", subject: "task-workspace-backend", keyId: "task-key-v1",
  publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString() };
type Lease = { scope: Scope; state: string; role: string | null; expiresAt: string | null;
  roleCount: number; sessionCount: number; membershipCount: number };
type Message = { type: string; [key: string]: unknown };
type Wire = { path: string; signal: AbortSignal; startedAborted: boolean; client: ClientRequest; secure: boolean; closed: Promise<void> };
const children: { child: ChildProcess; closed: Promise<{ code: number | null; signal: string | null }>; output: Buffer[] }[] = [];
const leases = new Map<string, Lease>(), calls: { op: string; scope?: Scope }[] = [], wire: Wire[] = [];
const controllers: AbortController[] = [];
let epoch: unknown, ledgerReady = false, root: string, ca: Buffer, cert: Buffer, key: Buffer, pin: string;
let allChildrenClosed = true;
let inventoryGate: ReturnType<typeof deferred> | undefined;
let replyGate: { op: string; entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function bound<T>(work: Promise<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LOCAL_HTTPS_PROCESS_TIMEOUT")), ms); })]); }
  finally { clearTimeout(timer); }
}
async function until(check: () => boolean) {
  const deadline = performance.now() + 4000;
  while (!check()) {
    if (performance.now() >= deadline) throw new Error("LOCAL_HTTPS_PROCESS_TIMEOUT");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
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
async function start(mode = "NORMAL", waitReady = true) {
  const child = fork(join(root, "child.cjs"), [], { env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" },
    execArgv: [], serialization: "advanced", stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const output: Buffer[] = [], messages: Message[] = [], listeners = new Set<() => void>();
  child.stdout!.on("data", b => output.push(Buffer.from(b))); child.stderr!.on("data", b => output.push(Buffer.from(b)));
  const closed = new Promise<{ code: number | null; signal: string | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  children.push({ child, closed, output }); child.on("error", () => {});
  child.on("message", raw => {
    const m = raw as Message;
    if (m.type === "protocol-call") {
      void (async () => {
        if (m.op === "inventory" && inventoryGate) await inventoryGate.promise;
        if (!child.connected) return;
        try { const value = protocol(m.op as string, m.data as Record<string, unknown>);
          const gate = replyGate;
          if (gate && gate.op === m.op) { gate.entered.resolve(); await gate.release.promise; }
          if (child.connected) child.send({ type: "protocol-reply", id: m.id, value }, () => {}); }
        catch { if (child.connected) child.send({ type: "protocol-reply", id: m.id, failed: true }, () => {}); }
      })();
    } else { messages.push(m); listeners.forEach(f => f()); }
  });
  const wait = async (type: string) => {
    let changed!: () => void;
    try { return await bound(new Promise<Message>(resolve => {
      changed = () => { const i = messages.findIndex(m => m.type === type); if (i >= 0) resolve(messages.splice(i, 1)[0]); };
      listeners.add(changed); changed();
    })); } finally { listeners.delete(changed); }
  };
  child.send({ type: "init", mode, cert, key, publicKeyPem: identity.publicKeyPem });
  expect((await wait("constructed")).address).toBeNull();
  const ready = async () => {
    const r = await wait("ready"), address = r.address as { host: string; port: number };
    expect(address.host).toBe("127.0.0.1"); expect(address.port).toBeGreaterThan(0); expect(r.instanceId).toMatch(/^[a-f0-9]{64}$/);
    return { port: address.port, instanceId: r.instanceId as string };
  };
  const binding = waitReady ? await ready() : undefined;
  return { child, closed, wait, ready, messages, ...binding };
}
async function kill(h: Awaited<ReturnType<typeof start>>, signal: NodeJS.Signals) {
  expect(h.child.kill(signal)).toBe(true); return bound(h.closed);
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

describe.skipIf(process.platform === "win32")("workspace through actual TLS and child process (Auth/SQL simulated)", { timeout: 15000 }, () => {
  beforeAll(async () => {
    root = mkdtempSync("/private/tmp/cl-task-chain-"); expect(realpathSync(root)).toBe(root);
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
    await build({ entryPoints: ["scripts/preview-e2e/communication-note-task-https-local-child.mjs"], outfile: join(root, "child.cjs"),
      bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "silent", external: ["pg-native"],
      alias: { "server-only": require.resolve("next/dist/compiled/server-only/empty.js") } });
  });
  beforeEach(() => { vi.clearAllMocks(); io.pg.length = 0; io.query = undefined; leases.clear(); calls.length = 0; epoch = undefined; ledgerReady = false; });
  afterEach(async () => {
    inventoryGate?.resolve(); inventoryGate = undefined; replyGate?.release.resolve(); replyGate = undefined;
    controllers.splice(0).forEach(c => c.abort());
    wire.forEach(w => w.client.destroy());
    const outcomes = await Promise.allSettled([bound(Promise.all(wire.splice(0).map(w => w.closed)), 3000), ...children.splice(0).map(async h => {
      if (h.child.exitCode === null && h.child.signalCode === null) h.child.kill("SIGTERM");
      try { await bound(h.closed, 3000); }
      catch (e) {
        h.child.kill("SIGKILL");
        try { await bound(h.closed, 3000); } catch { allChildrenClosed = false; }
        throw e;
      }
      expect(Buffer.concat(h.output).length).toBe(0);
    })]);
    vi.unstubAllEnvs(); vi.restoreAllMocks();
    for (const r of outcomes) if (r.status === "rejected") throw r.reason;
  });
  afterAll(() => { key?.fill(0); expect(allChildrenClosed).toBe(true);
    if (root) { expect(root).toMatch(/^\/private\/tmp\/cl-task-chain-[A-Za-z0-9]{6}$/);
    expect(realpathSync(root)).toBe(root); rmSync(root, { recursive: true }); } });

  it.each(["refresh", "concurrent"])("joins authenticated %s reads to real TLS issue/revoke", async mode => {
    const child = await start(), h = await harness(child), other = cookie(OTHER, OTHER_SESSION);
    io.cookie.mockResolvedValueOnce(h.auth).mockResolvedValueOnce(mode === "refresh" ? h.auth : other);
    const responses = mode === "refresh" ? [await h.handle(request()), await h.handle(request())] : await Promise.all([h.handle(request()), h.handle(request())]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect((await Promise.all(responses.map(r => r.json()))).map(p => p.taskPage.tasks[0].jobId)).toEqual([USER, mode === "refresh" ? USER : OTHER]);
    expect(wire).toHaveLength(4); expect(wire.every(w => w.secure)).toBe(true); expect(h.sign).toHaveBeenCalledTimes(4);
    const issues = calls.filter(c => c.op === "issue").map(c => c.scope!);
    expect(new Set(issues.map(s => s.requestId)).size).toBe(2);
    expect(issues.map(s => s.principal).sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
      { userId: USER, sessionId: SESSION, transport: "COOKIE" },
      { userId: mode === "refresh" ? USER : OTHER, sessionId: mode === "refresh" ? SESSION : OTHER_SESSION, transport: "COOKIE" },
    ]);
    cleaned(2); expect(io.pg).toHaveLength(4);
  });
  it.each(["logout", "cancel", "session-switch"])("withholds metadata and independently revokes after %s", async mode => {
    const child = await start(), h = await harness(child), c = control();
    io.query = async sql => { if (sql === SQL) {
      if (mode === "logout") h.auth.state.active = false;
      if (mode === "cancel") c.abort();
      if (mode === "session-switch") h.auth.state.sessionId = OTHER_SESSION;
    } };
    const r = await h.handle(request(c.signal)); expect(r.status).toBe(mode === "cancel" ? 503 : 401);
    expect(await r.json()).not.toHaveProperty("taskPage");
    await until(() => [...leases.values()].some(l => l.state === "REVOKED")); cleaned(1);
    expect(wire).toHaveLength(2); expect(wire.every(w => w.secure)).toBe(true);
    expect(wire.map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]); expect(wire[1].startedAborted).toBe(false);
  });
  it("withholds successful metadata until the real HTTPS revoke reply confirms cleanup", async () => {
    const child = await start(), h = await harness(child);
    replyGate = { op: "finalize", entered: deferred(), release: deferred() };
    let returned = false; const pending = h.handle(request()).then(r => { returned = true; return r; });
    await bound(replyGate.entered.promise); expect(returned).toBe(false);
    expect(wire.map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]); cleaned(1);
    replyGate.release.resolve(); expect((await pending).status).toBe(200);
  });
  it.each(["missing", "revoked"])("does not sign or open a TLS request for %s authentication", async mode => {
    const child = await start(), h = await harness(child);
    if (mode === "missing") io.cookie.mockResolvedValue(undefined); else h.auth.state.active = false;
    const r = await h.handle(request()); expect(r.status).toBe(mode === "missing" ? 503 : 401);
    expect(h.sign).not.toHaveBeenCalled(); expect(wire).toHaveLength(0); expect(leases.size).toBe(0);
  });
  it("rejects a different principal before issuing or revoking another user's lease", async () => {
    const child = await start(), h = await harness(child), a = h.custody();
    const d = await a.client.issue(a.scope, { signal: control().signal }); (d.credential as { password: string }).password = "";
    const other = h.custody(scope(OTHER, OTHER_SESSION));
    await expect(other.client.revoke(a.scope, { signal: control().signal })).rejects.toThrow();
    expect(wire).toHaveLength(1); expect(leases.get(a.scope.requestId)?.state).toBe("ISSUED");
    await a.client.revoke(a.scope, { signal: control().signal }); cleaned(1);
  });
  it("retains real TLS cleanup after an issue-signing failure", async () => {
    const child = await start(), h = await harness(child);
    h.sign.mockImplementationOnce(async () => { throw new Error("LOCAL_SIGNING_FAILURE"); });
    const r = await h.handle(request()); expect(r.status).toBe(503); expect(await r.json()).not.toHaveProperty("taskPage");
    expect(wire.map(w => w.path)).toEqual([PATHS.revoke]); expect(wire[0].secure).toBe(true); cleaned(1);
  });
  it.each(["SIGTERM", "SIGINT"] as const)("closes real listener and drains an issued lease before %s exit", async signal => {
    const child = await start(), h = await harness(child), s = h.custody();
    const delivery = await s.client.issue(s.scope, { signal: control().signal }); (delivery.credential as { password: string }).password = "";
    expect(leases.get(s.scope.requestId)?.state).toBe("ISSUED");
    expect(await kill(child, signal)).toEqual({ code: 0, signal: null }); cleaned(1); await listenerClosed(child.port!);
  });
  it("closes the listener promptly but waits for drain acknowledgment before process close", async () => {
    const child = await start(), h = await harness(child), s = h.custody();
    const d = await s.client.issue(s.scope, { signal: control().signal }); (d.credential as { password: string }).password = "";
    replyGate = { op: "finalize", entered: deferred(), release: deferred() };
    let closed = false; void child.closed.then(() => { closed = true; }); expect(child.child.kill("SIGTERM")).toBe(true);
    await bound(replyGate.entered.promise); await listenerClosed(child.port!); expect(closed).toBe(false);
    replyGate.release.resolve(); expect(await bound(child.closed)).toEqual({ code: 0, signal: null }); cleaned(1);
  });
  it.each(["ISSUE_COMMITTED", "FENCE_COMMITTED"])("recovers the retained ledger before HTTPS readiness after SIGKILL at %s", async mode => {
    const child = await start(mode), h = await harness(child);
    const pending = h.handle(request()); await child.wait("checkpoint");
    expect(await kill(child, "SIGKILL")).toEqual({ code: null, signal: "SIGKILL" }); await listenerClosed(child.port!);
    const r = await pending; expect(r.status).toBe(503); expect(await r.json()).not.toHaveProperty("taskPage");
    expect([...leases.values()][0].state).toBe(mode === "ISSUE_COMMITTED" ? "ISSUED" : "FENCED");
    inventoryGate = deferred(); const successor = await start("NORMAL", false);
    successor.child.send({ type: "inspect" }); const inspection = await successor.wait("inspection");
    expect(inspection.address).toBeNull(); expect(inspection.listening).toBe(false);
    expect(inspection.health).toMatchObject({ state: "STARTING", cleanupConfirmed: false });
    inventoryGate.resolve(); inventoryGate = undefined; const target = await successor.ready(); cleaned(1);
    successor.child.send({ type: "inspect" }); expect((await successor.wait("inspection")).listening).toBe(true);
    expect(target.instanceId).not.toBe(child.instanceId);
    const fresh = await harness(target); expect((await fresh.handle(request())).status).toBe(200); cleaned(2);
  });
  it("treats lost issue response as failure while independent service drain recovers", async () => {
    const child = await start("ISSUE_COMMITTED"), h = await harness(child);
    const pending = h.handle(request()); await child.wait("checkpoint"); wire[0].client.destroy();
    const r = await pending; expect(r.status).toBe(503); expect(await r.json()).not.toHaveProperty("taskPage");
    expect(h.sign).toHaveBeenCalledTimes(2); expect(wire).toHaveLength(2);
    expect(await bound(child.closed)).toEqual({ code: 1, signal: null }); cleaned(1); await listenerClosed(child.port!);
  });
  it.each(["STOP_UNCONFIRMED", "REVOKE_FAILED"])("does not acknowledge cleanup on %s and permits a successor to recover", async mode => {
    const child = await start(mode), h = await harness(child);
    if (mode === "STOP_UNCONFIRMED") {
      const s = h.custody(); const d = await s.client.issue(s.scope, { signal: control().signal }); (d.credential as { password: string }).password = "";
      expect(await kill(child, "SIGTERM")).toEqual({ code: 1, signal: null });
    } else { const r = await h.handle(request()); expect(r.status).toBe(503); expect(await r.json()).not.toHaveProperty("taskPage");
      expect(await bound(child.closed)).toEqual({ code: 1, signal: null }); }
    expect([...leases.values()][0].state).toBe("ISSUED"); await listenerClosed(child.port!);
    const successor = await start(); cleaned(1); expect(await kill(successor, "SIGTERM")).toEqual({ code: 0, signal: null });
  });
  it("fails closed on actual child-initiated IPC loss without claiming an independent SQL connection", async () => {
    const child = await start(), h = await harness(child), s = h.custody();
    const d = await s.client.issue(s.scope, { signal: control().signal }); (d.credential as { password: string }).password = "";
    // Node 22 parent disconnect() can suppress ChildProcess close (#65646).
    // Child-initiated EOF preserves the real close event; no fabricated event,
    // exit-only fallback or claim of actual parent death is made here.
    child.child.send({ type: "drop-ipc" }); expect(await bound(child.closed)).toEqual({ code: 1, signal: null });
    expect(leases.get(s.scope.requestId)?.state).toBe("ISSUED"); await listenerClosed(child.port!);
    const successor = await start(); cleaned(1); expect(await kill(successor, "SIGTERM")).toEqual({ code: 0, signal: null });
  });
  it("never reports ready after failed startup recovery", async () => {
    const child = await start("RECOVERY_FAILED", false);
    expect(await bound(child.closed)).toEqual({ code: 1, signal: null }); expect(child.messages.some(m => m.type === "ready")).toBe(false);
    expect(calls.some(c => c.op === "issue")).toBe(false);
  });
  it("rejects a correctly signed old-instance request over real TLS after replacement", async () => {
    const child = await start(); expect(await kill(child, "SIGTERM")).toEqual({ code: 0, signal: null });
    const successor = await start(), h = await harness(successor, { instanceId: child.instanceId! });
    const r = await h.handle(request()); expect(r.status).toBe(503); expect(await r.json()).not.toHaveProperty("taskPage");
    expect(h.sign).toHaveBeenCalledTimes(2); expect(wire.map(w => w.path)).toEqual([PATHS.issue, PATHS.revoke]);
    expect(wire.every(w => w.secure)).toBe(true); expect(leases.size).toBe(0);
    const fresh = await harness(successor); expect((await fresh.handle(request())).status).toBe(200); cleaned(1);
  });
  it.each(["pin", "ca", "address"])("rejects valid assertions at the actual %s boundary", async mode => {
    const child = await start(); let changes: Partial<Binding> = {};
    if (mode === "pin") changes = { serviceSpkiSha256: "f".repeat(64) };
    if (mode === "ca") { const { rootCertificates } = await import("node:tls"); const other = Buffer.from(rootCertificates[0]);
      changes = { serviceCa: other, serviceCaSha256: sha(other) }; }
    const h = await harness(mode === "address" ? { ...child, port: undefined } : child, changes);
    const r = await h.handle(request()); expect(r.status).toBe(503); expect(await r.json()).not.toHaveProperty("taskPage");
    expect(h.sign).toHaveBeenCalledTimes(2); expect(leases.size).toBe(0);
    expect(wire.map(w => w.path)).toEqual(mode === "address" ? [] : [PATHS.issue, PATHS.revoke]);
    expect(wire.every(w => !w.secure)).toBe(true);
    const fresh = await harness(child); expect((await fresh.handle(request())).status).toBe(200); cleaned(1);
  });
  it("keeps the formal route uninstalled with Preview flags enabled", async () => {
    for (const [k, v] of Object.entries(env())) vi.stubEnv(k, v);
    const runtime = await import("./communication-note-workspace-runtime.server");
    const route = await import("../app/api/ai-documents/communication-note/documents/route");
    expect(runtime.COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined(); expect((await route.GET(request())).status).toBe(503);
    expect(io.cookie).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled(); expect(io.pg).toHaveLength(0);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
    expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && readFileSync(p, "utf8").includes("task-https-local-child"))).toEqual([]);
    expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toContain("HOSTED_WORKSPACE_READ_BINDING = undefined");
  });
});
