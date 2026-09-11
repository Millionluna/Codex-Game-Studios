import { createHash, generateKeyPairSync, sign as signBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import type { RequestOptions } from "node:https";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { rootCertificates, type PeerCertificate } from "node:tls";
import { decodeJwt } from "jose";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ cookie: vi.fn(), http: vi.fn(), pg: [] as FakePg[],
  query: undefined as undefined | ((sql: string, values?: unknown[]) => Promise<unknown>) }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase-server", () => ({ createCareslinkServerSupabaseClient: io.cookie }));
vi.mock("node:https", () => ({ request: io.http }));
vi.mock("pg", () => ({ Client: class { constructor(config: Record<string, unknown>) { return new FakePg(config); } } }));
import { createCommunicationNoteWorkspaceTaskClientRuntime as compose, COMMUNICATION_NOTE_WORKSPACE_TASK_CLIENT_READY,
  type CommunicationNoteWorkspaceTaskClientBinding as Binding } from "./communication-note-workspace-task-client.server";
import { createCommunicationNoteWorkspaceHandler } from "./communication-note-workspace.server";
import { createCommunicationNoteTaskPreviewService as createService } from "./communication-note-task-preview-service.server";
import { createTaskPreviewAuthenticatedEndpoint as createEndpoint } from "./communication-note-task-preview-transport.server";
import type { TaskPreviewSignerOptions } from "./communication-note-task-preview-signer.server";
import type { TaskPreviewIssuerBroker } from "./communication-note-task-preview-issuer.server";
import { TASK_PREVIEW_TRANSPORT_PATHS as PATHS, type TaskPreviewCommand } from "./communication-note-task-preview-protocol.server";
import type { CommunicationNoteTaskLeaseScope as Scope } from "./communication-note-workspace-task-lease.server";
import type { CommunicationNoteWorkspaceDurableEnv } from "./communication-note-workspace-durable.server";
import { COMMUNICATION_NOTE_JOB_LIST_SQL as SQL } from "./v1/communication-note-job-list-repository.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PROD } from "./v1/ndis-shadow-guard";

const REF = "abcdefghijklmnopqrst", PROJECT = "prj_1234567890abcdef", ORIGIN = "https://task-preview.invalid";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", OTHER_SESSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BASE = Date.parse("2026-09-11T12:00:00.000Z"), TIME = "2026-09-11T11:00:00.000000Z";
const CALLER = "careslink_v1_generation_job_list_caller";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const serviceKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ca = Buffer.from(rootCertificates[0]), pubkey = serviceKey.publicKey.export({ format: "der", type: "spki" });
const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const identity = { origin: ORIGIN, issuer: "https://task-backend.invalid/", subject: "task-workspace-backend", keyId: "task-key-v1",
  publicKeyPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString() };
const request = (init: RequestInit = {}, query = "") => new Request(
  "https://app.invalid/api/ai-documents/communication-note/documents" + query,
  { headers: { "sec-fetch-site": "same-origin", cookie: "synthetic" }, ...init });
const services: ReturnType<typeof createService>[] = [], endpoints: ReturnType<typeof createEndpoint>[] = [];
const controllers: AbortController[] = [];
function control() { const c = new AbortController(); controllers.push(c); return c; }
async function until(test: () => boolean) {
  for (let i = 0; i < 1000; i++) { if (test()) return; await new Promise(resolve => setImmediate(resolve)); }
  throw new Error("Expected pipeline stage not reached");
}
function env(): CommunicationNoteWorkspaceDurableEnv {
  return { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "true", CARESLINK_V1_PRODUCT_API_ENABLED: "true",
    CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF: REF,
    CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_VERCEL_PROJECT_ID: PROJECT,
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: PROJECT,
    SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef" };
}
function cookie(userId = USER, sessionId = SESSION) {
  const state = { userId, sessionId, active: true };
  const claims = vi.fn(async () => ({ data: { claims: { sub: state.userId, session_id: state.sessionId } }, error: null }));
  const user = vi.fn(async () => ({ data: { user: { id: state.userId } }, error: null }));
  const session = vi.fn(async () => ({ data: state.active ? "ACTIVE" : "REVOKED", error: null }));
  const documents = vi.fn(async () => ({ data: { documents: [], nextCursor: null, hasMore: false }, error: null }));
  const rpc = vi.fn((name: string, args?: unknown) => {
    if (name === "resolve_v1_current_session_status" && args === undefined) return session();
    if (name === "list_v1_shadow_documents") return documents();
    throw new Error("Unexpected Cookie capability");
  });
  return { state, claims, user, session, documents, auth: { getClaims: claims, getUser: user }, rpc };
}
// Auth, HTTPS events and SQL replies are the only simulated boundaries. The
// handler, auth/session resolver, signer, client, service/issuer, lease and PG
// lifecycle implementations execute normally. This is not live TLS/SQL evidence.
class FakePg {
  password: unknown; connectionParameters: { password: unknown };
  calls: { sql: string; values?: unknown[] }[] = [];
  connection = { stream: { encrypted: true, authorized: true, destroy: vi.fn() } };
  end = vi.fn(async () => {}); on = vi.fn(() => this);
  constructor(public config: Record<string, unknown>) {
    this.password = config.password; this.connectionParameters = { password: config.password }; io.pg.push(this);
  }
  async connect() {}
  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    const replacement = await io.query?.(sql, values); if (replacement !== undefined) return replacement;
    if (sql.includes("as safe")) return { rows: [{ login: this.config.user, current: this.config.user,
      pid: 100 + io.pg.indexOf(this), start: TIME, major: 17, database: "postgres", safe: true }] };
    if (sql === `set role ${CALLER}`) return { rows: [] };
    if (sql === "select current_user::text as role") return { rows: [{ role: CALLER }] };
    if (sql === SQL) return { rows: [{ data: { tasks: [{ jobId: values![0], status: "QUEUED", createdAt: TIME, updatedAt: TIME }], nextCursor: null } }] };
    if (sql.includes("pg_terminate_backend")) return { rows: [] };
    if (sql.includes("as remaining")) return { rows: [{ remaining: 0 }] };
    throw new Error("Unexpected database capability");
  }
}
function harness() {
  type Lease = { scope: Scope; state: string; role: string | null; expiresAt: string | null; roleCount: number; sessionCount: number; membershipCount: number };
  const leases = new Map<string, Lease>(); let epoch: unknown;
  const broker = vi.fn<TaskPreviewIssuerBroker["call"]>(async (op, data) => {
    if (op === "start") { epoch = data.epoch; return { projectRef: REF, epoch, ready: false }; }
    if (["inventory", "ready", "issue"].includes(op) && data.epoch !== epoch) throw new Error("STALE");
    if (op === "inventory") return { projectRef: REF, epoch, leases: [...leases.values()].filter(l => l.state !== "REVOKED")
      .map(({ scope, state, expiresAt }) => ({ scope, state, expiresAt })) };
    if (op === "ready") return { projectRef: REF, epoch, ready: true };
    const scope = data.scope as Scope; let l = leases.get(scope.requestId);
    if (l && JSON.stringify(l.scope) !== JSON.stringify(scope)) throw new Error("WRONG_SCOPE");
    if (op === "issue") { if (l) throw new Error("DUPLICATE"); l = { scope, state: "ISSUED", role: data.role as string,
      expiresAt: data.expiresAt as string, roleCount: 1, sessionCount: 0, membershipCount: 2 }; leases.set(scope.requestId, l); }
    if (op === "fence") {
      if (!l) { l = { scope, state: "REVOKED", role: null, expiresAt: null, roleCount: 0, sessionCount: 0, membershipCount: 0 }; leases.set(scope.requestId, l); }
      else if (l.state === "ISSUED") l.state = "FENCED";
    }
    if (op === "finalize") { if (!l || l.state === "ISSUED") throw new Error("FENCE_FIRST");
      Object.assign(l, { state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 }); }
    return { ...l };
  });
  const service = createService({ projectRef: REF, broker: { call: broker } }); services.push(service);
  const endpoint = createEndpoint({ projectRef: REF, ...identity, service }); endpoints.push(endpoint);
  const wire: { command: TaskPreviewCommand; body: Buffer; signal: AbortSignal }[] = [];
  const mode = { revokeFailure: false };
  io.http.mockImplementation((url: string, options: RequestOptions, receive: (r: EventEmitter) => void) => {
    let destroyed = false;
    const socket = Object.assign(new EventEmitter(), { encrypted: true, authorized: true, alpnProtocol: "http/1.1",
      isSessionReused: () => false, getProtocol: () => "TLSv1.3", getPeerCertificate: () => certificate });
    const certificate = { subjectaltname: "DNS:task-preview.invalid", subject: { CN: "task-preview.invalid" }, pubkey } as PeerCertificate;
    const client = Object.assign(new EventEmitter(), { destroy: () => { destroyed = true; }, end: (body: Buffer) => {
      const command = decodeJwt(body.toString()) as unknown as TaskPreviewCommand;
      wire.push({ command, body, signal: options.signal! });
      void (async () => {
        const r = mode.revokeFailure && command.path === PATHS.revoke ? new Response("{}", { status: 503 }) :
          await endpoint.handle(new Request(url, { method: "POST", headers: options.headers as Record<string, string>, body: body.toString(), signal: options.signal }));
        const bytes = Buffer.from(await r.text()); if (destroyed) return;
        const response = Object.assign(new EventEmitter(), { statusCode: r.status, headers: Object.fromEntries(r.headers),
          socket, complete: true, destroy: vi.fn() });
        receive(response); if (destroyed) return;
        response.emit("data", bytes); response.emit("end");
      })().catch(() => { if (!destroyed) client.emit("error", new Error("SIMULATED_HTTP_FAILURE")); });
    } });
    queueMicrotask(() => {
      if (destroyed) return; client.emit("socket", socket);
      const error = options.checkServerIdentity!("task-preview.invalid", certificate);
      if (error) client.emit("error", error); else socket.emit("secureConnect");
    });
    return client;
  });
  const sign = vi.fn<TaskPreviewSignerOptions["consumeSignature"]>(async (input, ctx, deliver) => {
    expect(ctx.signal.aborted).toBe(false);
    const signature = signBytes("RSA-SHA256", input.signingInput, keys.privateKey);
    try { await deliver(signature); } finally { signature.fill(0); }
  });
  const binding: Binding = { projectRef: REF, vercelProjectId: PROJECT, ca: Buffer.from("synthetic-PG-CA"),
    caSha256: sha(Buffer.from("synthetic-PG-CA")), identity: { ...identity }, instanceId: endpoint.instanceId,
    serviceCa: Buffer.from(ca), serviceCaSha256: sha(ca), serviceSpkiSha256: sha(pubkey), consumeSignature: sign };
  const environment = env(), auth = cookie(); io.cookie.mockResolvedValue(auth);
  const runtime = compose({ env: environment, binding })!;
  const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime });
  return { env: environment, binding, auth, runtime, handle, sign, wire, mode, leases, service, broker };
}
function cleaned(h: ReturnType<typeof harness>, count: number) {
  expect(h.leases.size).toBe(count);
  for (const l of h.leases.values()) expect(l).toMatchObject({ state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 });
  for (const c of io.pg) {
    expect(c.end).toHaveBeenCalledOnce(); expect(c.connection.stream.destroy).toHaveBeenCalledOnce();
    expect(c.password).toBeUndefined(); expect(c.config.password).toBeUndefined(); expect(c.connectionParameters.password).toBeUndefined();
  }
  expect(h.wire.every(w => w.body.every(b => b === 0))).toBe(true);
  expect(h.sign.mock.calls.every(([input]) => input.signingInput.every(b => b === 0))).toBe(true);
}
beforeEach(() => {
  vi.clearAllMocks(); io.pg.length = 0; io.query = undefined;
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }); vi.setSystemTime(BASE);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - BASE);
});
afterEach(async () => {
  controllers.splice(0).forEach(c => c.abort()); endpoints.splice(0).forEach(e => e.close());
  const stopped = services.splice(0).map(s => s.stop()); await vi.advanceTimersByTimeAsync(40000); await Promise.all(stopped);
  expect(vi.getTimerCount()).toBe(0); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers();
});

it("constructs without identity/signing/IO and remains uninstalled", () => {
  const h = harness(); expect(COMMUNICATION_NOTE_WORKSPACE_TASK_CLIENT_READY).toBe(false);
  expect(Object.keys(h.runtime)).toEqual(["resolvePrincipal", "createReaders"]);
  expect(io.cookie).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled(); expect(h.sign).not.toHaveBeenCalled(); expect(io.pg).toHaveLength(0);
});
it.each(["refresh", "concurrent"])("uses fresh one-lease signer/client pairs for %s reads", async mode => {
  const h = harness(); await h.service.start(); const other = cookie(OTHER, OTHER_SESSION);
  io.cookie.mockResolvedValueOnce(h.auth).mockResolvedValueOnce(mode === "refresh" ? h.auth : other);
  const responses = mode === "refresh" ? [await h.handle(request()), await h.handle(request())] : await Promise.all([h.handle(request()), h.handle(request())]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  const pages = await Promise.all(responses.map(r => r.json()));
  expect(pages.map(p => p.taskPage.tasks[0].jobId)).toEqual([USER, mode === "refresh" ? USER : OTHER]);
  const issues = h.wire.filter(w => w.command.path === PATHS.issue).map(w => w.command);
  expect(new Set(issues.map(c => c.scope.requestId)).size).toBe(2); expect(new Set(h.wire.map(w => w.command.jti)).size).toBe(4);
  expect(issues.map(c => c.scope.principal).sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([{ userId: USER, sessionId: SESSION, transport: "COOKIE" },
    { userId: mode === "refresh" ? USER : OTHER, sessionId: mode === "refresh" ? SESSION : OTHER_SESSION, transport: "COOKIE" }]);
  expect(h.sign).toHaveBeenCalledTimes(4); expect(io.cookie).toHaveBeenCalledTimes(2); expect(io.pg).toHaveLength(4); cleaned(h, 2);
});
it.each(["missing", "revoked", "changed-user", "changed-session"])("does not sign for %s authentication", async mode => {
  const h = harness(); await h.service.start();
  if (mode === "missing") io.cookie.mockResolvedValue(undefined);
  if (mode === "revoked") h.auth.state.active = false;
  if (mode.startsWith("changed")) h.auth.documents.mockImplementation(async () => {
    if (mode === "changed-user") h.auth.state.userId = OTHER; else h.auth.state.sessionId = OTHER_SESSION;
    return { data: { documents: [], nextCursor: null, hasMore: false }, error: null };
  });
  const r = await h.handle(request()); expect(r.status).toBe(mode === "missing" ? 503 : 401);
  expect(h.sign).not.toHaveBeenCalled(); expect(h.wire).toHaveLength(0); expect(io.pg).toHaveLength(0);
});
it("does not accept a principal-shaped object without the request's authentication context", async () => {
  const h = harness(), r = request(), principal = { userId: USER, sessionId: SESSION, transport: "COOKIE" as const };
  expect(() => h.runtime.createReaders({ request: r, principal })).toThrow();
  await h.runtime.resolvePrincipal(r);
  expect(() => h.runtime.createReaders({ request: request(), principal })).toThrow();
  expect(() => h.runtime.createReaders({ request: r, principal: { ...principal, userId: OTHER } })).toThrow();
  expect(h.sign).not.toHaveBeenCalled();
});
it.each(["bearer", "cross-site", "injected-owner"])("rejects %s at the workspace boundary", async mode => {
  const h = harness();
  const r = await h.handle(mode === "injected-owner" ? request({}, "?owner=" + OTHER) : request({ headers: mode === "bearer" ?
    { "sec-fetch-site": "same-origin", authorization: "Bearer synthetic" } : { "sec-fetch-site": "cross-site" } }));
  expect(r.status).toBe(503); expect(h.sign).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled();
});
it.each(["logout", "session-switch", "cancel", "env-drift"])("withholds metadata and still revokes after %s during PG read", async mode => {
  const h = harness(), c = control(); await h.service.start();
  io.query = async sql => {
    if (sql !== SQL) return;
    if (mode === "logout") h.auth.state.active = false;
    if (mode === "session-switch") h.auth.state.sessionId = OTHER_SESSION;
    if (mode === "cancel") c.abort();
    if (mode === "env-drift") h.env.VERCEL_ENV = "production";
  };
  const r = await h.handle(request({ signal: c.signal })); expect(r.status).toBe(mode === "logout" || mode === "session-switch" ? 401 : 503);
  expect(await r.json()).not.toHaveProperty("taskPage");
  await until(() => [...h.leases.values()].every(l => l.state === "REVOKED") && h.wire.length === 2);
  expect(h.wire.map(w => w.command.path)).toEqual([PATHS.issue, PATHS.revoke]);
  await until(() => h.wire.every(w => w.body.every(b => b === 0)) && h.sign.mock.calls.every(([input]) => input.signingInput.every(b => b === 0))); cleaned(h, 1);
});
it.each(["failure", "cancel", "timeout"])("retains cleanup authority after signing %s", async mode => {
  const h = harness(), c = control(); await h.service.start();
  h.sign.mockImplementationOnce(async () => {
    if (mode === "cancel") c.abort();
    if (mode === "timeout") await new Promise(() => {});
    throw new Error("PRIVATE_SIGNING_FAILURE");
  });
  const pending = h.handle(request({ signal: c.signal })); await until(() => h.sign.mock.calls.length >= 1);
  if (mode === "timeout") await vi.advanceTimersByTimeAsync(2000);
  const r = await pending; expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "UNAVAILABLE" });
  await until(() => h.wire.length === 1 && [...h.leases.values()].some(l => l.state === "REVOKED"));
  await until(() => h.wire.every(w => w.body.every(b => b === 0)) && h.sign.mock.calls.every(([input]) => input.signingInput.every(b => b === 0)));
  expect(h.wire[0].command.path).toBe(PATHS.revoke); expect(io.pg).toHaveLength(0); cleaned(h, 1);
});
it("withholds successful data when terminal revoke fails", async () => {
  const h = harness(); await h.service.start(); h.mode.revokeFailure = true;
  const r = await h.handle(request()); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "UNAVAILABLE" });
  expect(h.wire.map(w => w.command.path)).toEqual([PATHS.issue, PATHS.revoke]); expect(h.sign).toHaveBeenCalledTimes(2);
  expect([...h.leases.values()][0].state).toBe("ISSUED"); // No false physical-cleanup claim; independent service stop cleans later.
  expect(io.pg.every(c => c.end.mock.calls.length === 1)).toBe(true);
});
it("snapshots service identity, both CAs and signing dependency for later reads", async () => {
  const h = harness(); await h.service.start(); const trap = vi.fn();
  h.binding.ca.fill(0); h.binding.serviceCa.fill(0); (h.binding.identity as { origin: string }).origin = "https://other.invalid";
  Object.assign(h.binding, { consumeSignature: trap, instanceId: "2".repeat(64) });
  expect((await h.handle(request())).status).toBe(200); expect(trap).not.toHaveBeenCalled();
  expect((io.pg[0].config.ssl as { ca: Buffer }).ca).toEqual(Buffer.from("synthetic-PG-CA")); cleaned(h, 1);
});
it.each(["production", "project", "vercel", "key", "http", "instance", "service-ca", "service-pin", "pg-ca", "signer", "extra-principal", "proxy", "getter"])(
  "rejects invalid trusted binding %s without Auth, signing or network IO", mode => {
    const h = harness(), b = { ...h.binding }, trap = vi.fn();
    if (mode === "production") b.projectRef = PROD;
    if (mode === "project") b.projectRef = "b".repeat(20);
    if (mode === "vercel") b.vercelProjectId = "prj_other000000000000";
    if (mode === "key") b.identity = { ...identity, publicKeyPem: "not-a-public-key" };
    if (mode === "http") b.identity = { ...identity, origin: "http://task-preview.invalid" };
    if (mode === "instance") b.instanceId = "short";
    if (mode === "service-ca") b.serviceCa = Buffer.from("invalid");
    if (mode === "service-pin") b.serviceSpkiSha256 = "short";
    if (mode === "pg-ca") b.caSha256 = "f".repeat(64);
    if (mode === "signer") b.consumeSignature = new Proxy(h.sign, { apply: trap });
    if (mode === "extra-principal") Object.assign(b, { principal: { userId: USER, sessionId: SESSION, transport: "COOKIE" } });
    if (mode === "getter") Object.defineProperty(b, "consumeSignature", { get: trap, enumerable: true });
    expect(compose({ env: h.env, binding: mode === "proxy" ? new Proxy(b, { ownKeys: trap }) : b })).toBeUndefined();
    expect(io.cookie).not.toHaveBeenCalled(); expect(h.sign).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled(); expect(trap).not.toHaveBeenCalled();
  });
it("keeps absent bindings and the formal route inert even with all Preview flags enabled", async () => {
  const trap = vi.fn(); const absent = {}; Object.defineProperty(absent, "env", { get: trap });
  expect(compose(absent as Parameters<typeof compose>[0])).toBeUndefined(); expect(trap).not.toHaveBeenCalled();
  for (const [key, value] of Object.entries(env())) vi.stubEnv(key, value);
  vi.resetModules();
  const runtime = await import("./communication-note-workspace-runtime.server");
  const route = await import("../app/api/ai-documents/communication-note/documents/route");
  expect(runtime.COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined(); expect((await route.GET(request())).status).toBe(503);
  expect(io.cookie).not.toHaveBeenCalled(); expect(io.http).not.toHaveBeenCalled(); expect(io.pg).toHaveLength(0);
});
it("has no production importer, arbitrary principal port, key discovery or client exposure", () => {
  const name = "communication-note-workspace-task-client", walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual([]);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.env|fetch\s*\(|createPrivateKey|generateKeyPair|console\.|from ["'](?:pg|node:https|@google-cloud\/)/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain("COMMUNICATION_NOTE_WORKSPACE_TASK_CLIENT_READY");
});
