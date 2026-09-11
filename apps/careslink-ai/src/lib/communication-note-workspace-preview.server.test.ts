import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const io = vi.hoisted(() => ({
  cookie: vi.fn(), clients: [] as FakeClient[], events: [] as string[],
  query: undefined as undefined | ((sql: string, values?: unknown[]) => Promise<unknown>),
  connect: undefined as undefined | ((client: FakeClient) => void),
}));
vi.mock("./supabase-server", () => ({ createCareslinkServerSupabaseClient: io.cookie }));
vi.mock("pg", () => ({ Client: class { constructor(config: Record<string, unknown>) { return new FakeClient(config); } } }));
import { createCommunicationNoteWorkspacePreviewRuntime as compose, type CommunicationNoteWorkspacePreviewBinding } from "./communication-note-workspace-preview.server";
import { createCommunicationNoteWorkspaceHandler } from "./communication-note-workspace.server";
import type { CommunicationNoteWorkspaceDurableEnv } from "./communication-note-workspace-durable.server";
import type { CommunicationNoteTaskLeaseScope } from "./communication-note-workspace-task-lease.server";
import { COMMUNICATION_NOTE_JOB_LIST_SQL } from "./v1/communication-note-job-list-repository.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import { COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME } from "./communication-note-workspace-runtime.server";
import { GET } from "../app/api/ai-documents/communication-note/documents/route";

const REF = "abcdefghijklmnopqrst", PROJECT = "prj_1234567890abcdef";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", OTHER_SESSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC = "11111111-1111-4111-8111-111111111111", REV = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333", TIME = "2026-09-08T01:00:00.000000Z";
const CALLER = "careslink_v1_generation_job_list_caller", PURPOSE = "COMMUNICATION_NOTE_JOB_LIST_READ";
const task = { jobId: JOB, status: "QUEUED", createdAt: TIME, updatedAt: TIME };
const rows = { rows: [{ data: { tasks: [task], nextCursor: null } }] };
const request = (query = "", init: RequestInit = {}) => new Request(
  "https://app.example.invalid/api/ai-documents/communication-note/documents" + query,
  { headers: { "sec-fetch-site": "same-origin", cookie: "synthetic-opaque" }, ...init });
const receipt = (scope: CommunicationNoteTaskLeaseScope) => ({ ...scope, status: "REVOKED" as const });
const delivery = (scope: CommunicationNoteTaskLeaseScope, index = 1) => ({ ...scope, credential: {
  role: `careslink_v1_job_list_runtime_${index.toString(16).padStart(16, "0")}`, password: "p".repeat(43),
  deliveryExpiresAt: new Date(Date.now() + 60000).toISOString(),
} });

// Only external IO is replaced. The HTTP handler, current-session resolver,
// document parser, lease, fixed SQL reader and physical cleanup code are real.
// Synthetic CA/PG responses are NOT live TLS/SQL/custody verification.
class FakeClient {
  password: unknown; connectionParameters: { password: unknown };
  calls: { sql: string; values?: unknown[] }[] = [];
  connection = { stream: { encrypted: true, authorized: true, destroy: vi.fn() } };
  end = vi.fn(async () => { io.events.push("close"); });
  on = vi.fn(() => this);
  constructor(public config: Record<string, unknown>) {
    this.password = config.password; this.connectionParameters = { password: config.password }; io.clients.push(this);
  }
  async connect() { io.events.push("connect"); io.connect?.(this); }
  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (io.query) { const replacement = await io.query(sql, values); if (replacement !== undefined) return replacement; }
    if (sql.includes("as safe")) return { rows: [{ login: this.config.user, current: this.config.user,
      pid: 100 + io.clients.indexOf(this), start: TIME, major: 17, database: "postgres", safe: true }] };
    if (sql === `set role ${CALLER}`) return { rows: [] };
    if (sql === "select current_user::text as role") return { rows: [{ role: CALLER }] };
    if (sql === COMMUNICATION_NOTE_JOB_LIST_SQL) { io.events.push("tasks"); return rows; }
    if (sql.includes("pg_terminate_backend")) { io.events.push("terminate"); return { rows: [] }; }
    if (sql.includes("as remaining")) { io.events.push("residue"); return { rows: [{ remaining: 0 }] }; }
    throw new Error("Unexpected database capability");
  }
}
function environment(): CommunicationNoteWorkspaceDurableEnv {
  return { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "true", CARESLINK_V1_PRODUCT_API_ENABLED: "true",
    CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF: REF,
    CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_VERCEL_PROJECT_ID: PROJECT,
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: PROJECT,
    SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef" };
}
function cookie(userId = USER, sessionId = SESSION) {
  const claims = vi.fn(async () => ({ data: { claims: { sub: userId, session_id: sessionId } }, error: null }));
  const user = vi.fn(async () => ({ data: { user: { id: userId } }, error: null }));
  const session = vi.fn(async (): Promise<{ data: unknown; error: null }> => ({ data: "ACTIVE", error: null }));
  const documents = vi.fn(async (): Promise<{ data: unknown; error: null }> => {
    io.events.push("documents");
    return { data: { documents: [{ canonicalId: DOC, noteType: "communication", sourceLocale: "en", lifecycleStatus: "IN_PROGRESS",
      currentRevisionId: REV, currentRevisionNumber: 1, contractVersion: "1.0.0-shadow.1", schemaVersion: "2026-08-09.v1-shadow",
      createdAt: TIME, updatedAt: TIME, deletedAt: null }], nextCursor: null, hasMore: false }, error: null };
  });
  const rpc = vi.fn((name: string, args?: unknown) => {
    if (name === "resolve_v1_current_session_status" && args === undefined) return session();
    if (name === "list_v1_shadow_documents") return documents();
    throw new Error("Unexpected Cookie capability");
  });
  return { auth: { getClaims: claims, getUser: user }, rpc, claims, user, session, documents };
}
function harness() {
  const env = environment(), client = cookie(); io.cookie.mockResolvedValue(client);
  const issue = vi.fn(async (scope: CommunicationNoteTaskLeaseScope, _context: { signal: AbortSignal }) => {
    void _context; io.events.push("issue"); return delivery(scope, issue.mock.calls.length);
  });
  const revoke = vi.fn(async (scope: CommunicationNoteTaskLeaseScope, _context: { signal: AbortSignal }) => {
    void _context; io.events.push("revoke"); return receipt(scope);
  });
  const binding: CommunicationNoteWorkspacePreviewBinding = { projectRef: REF, vercelProjectId: PROJECT,
    ca: Buffer.from("synthetic-CA"), caSha256: createHash("sha256").update("synthetic-CA").digest("hex"), custody: { issue, revoke } };
  const options = { env, binding }, runtime = compose(options);
  const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime });
  return { options, binding, env, client, issue, revoke, runtime, handle };
}
function closed() {
  for (const c of io.clients) {
    expect(c.end).toHaveBeenCalledOnce(); expect(c.connection.stream.destroy).toHaveBeenCalledOnce();
    expect(c.password).toBeUndefined(); expect(c.config.password).toBeUndefined(); expect(c.connectionParameters.password).toBeUndefined();
  }
}
async function until(test: () => boolean) {
  for (let i = 0; i < 500; i++) { if (test()) return; await Promise.resolve(); }
  throw new Error("Expected test stage not reached");
}
beforeEach(() => { vi.clearAllMocks(); io.clients.length = 0; io.events.length = 0; io.query = undefined; io.connect = undefined; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("Preview workspace read-only composition", () => {
  it("runs the full lazy read pipeline and withholds output until physical cleanup and revoke", async () => {
    const h = harness(); expect(h.runtime).toBeDefined(); expect(Object.keys(h.runtime!)).toEqual(["resolvePrincipal", "createReaders"]);
    expect(io.cookie).not.toHaveBeenCalled(); expect(io.clients).toHaveLength(0); expect(h.issue).not.toHaveBeenCalled();
    let release!: () => void;
    h.revoke.mockImplementation(scope => new Promise(resolve => { release = () => resolve(receipt(scope)); }));
    let returned = false; const pending = h.handle(request()).then(r => { returned = true; return r; });
    await until(() => h.revoke.mock.calls.length === 1); expect(returned).toBe(false); closed(); release();
    const r = await pending; expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "AVAILABLE", documents: [{ canonicalId: DOC, revisionNumber: 1, sourceLocale: "en", updatedAt: TIME }],
      documentsCursor: null, taskPage: { tasks: [task], nextCursor: null } });
    expect(r.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(h.client.session).toHaveBeenCalledTimes(4); expect(io.cookie).toHaveBeenCalledOnce(); expect(io.clients).toHaveLength(2);
    expect(h.issue.mock.calls[0][0]).toMatchObject({ projectRef: REF, purpose: PURPOSE, callerRole: CALLER,
      principal: { userId: USER, sessionId: SESSION, transport: "COOKIE" } });
    expect(h.revoke.mock.calls[0][0]).toBe(h.issue.mock.calls[0][0]);
    for (const c of io.clients) expect(c.config).toMatchObject({ host: `db.${REF}.supabase.co`, port: 5432, database: "postgres",
      user: "careslink_v1_job_list_runtime_0000000000000001", ssl: { ca: Buffer.from("synthetic-CA"), rejectUnauthorized: true } });
    expect(io.clients[1].calls.find(c => c.sql === COMMUNICATION_NOTE_JOB_LIST_SQL)?.values)
      .toEqual([USER, SESSION, null, null, 20, "1.0.0-shadow.1", "2026-08-09.v1-shadow"]);
    expect(io.clients.flatMap(c => c.calls).some(c => /\b(?:insert|update|delete|grant|create role)\b/i.test(c.sql))).toBe(false);
  });
  it.each([undefined, null, false, "enabled"])("has no environment/credential discovery when binding is %s", binding => {
    const trap = vi.fn(() => { throw new Error("NEVER_READ"); });
    const options = { binding }; Object.defineProperty(options, "env", { get: trap, enumerable: true });
    expect(compose(options as unknown as Parameters<typeof compose>[0])).toBeUndefined(); expect(trap).not.toHaveBeenCalled();
    expect(io.cookie).not.toHaveBeenCalled(); expect(io.clients).toHaveLength(0);
  });
  it("rejects accessor/proxy installation options and does not inspect an omitted binding", () => {
    const h = harness(), trap = vi.fn();
    const omitted = {}; Object.defineProperty(omitted, "env", { get: trap });
    expect(compose(omitted as Parameters<typeof compose>[0])).toBeUndefined();
    const accessor = { ...h.options }; Object.defineProperty(accessor, "binding", { get: trap, enumerable: true });
    expect(compose(accessor)).toBeUndefined();
    expect(compose(new Proxy(h.options, { getOwnPropertyDescriptor: trap }))).toBeUndefined();
    expect(trap).not.toHaveBeenCalled(); expect(io.cookie).not.toHaveBeenCalled();
  });
  it.each([
    { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "false" }, { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "TRUE" },
    { CARESLINK_V1_PRODUCT_API_ENABLED: "false" }, { VERCEL: undefined }, { VERCEL_ENV: "production" }, { VERCEL_TARGET_ENV: "production" },
    { VERCEL_PROJECT_ID: "prj_other000000000000" }, { SUPABASE_URL: `https://${REF}.supabase.co/` },
    { NEXT_PUBLIC_SUPABASE_URL: "https://other.invalid" }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" },
    { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF: CARESLINK_PRODUCTION_SUPABASE_REF },
  ])("rejects invalid Preview configuration %# without IO", override => {
    const h = harness(); Object.assign(h.env, override); expect(compose(h.options)).toBeUndefined();
    expect(io.cookie).not.toHaveBeenCalled(); expect(h.issue).not.toHaveBeenCalled(); expect(io.clients).toHaveLength(0);
  });
  it.each(["project", "vercel", "ca", "ca-empty", "ca-large", "digest", "extra", "custody-extra", "issue", "revoke", "accessor", "proxy", "ca-proxy", "function-proxy"])(
    "rejects invalid installation %s without invoking callbacks or traps", kind => {
      const h = harness(), binding = { ...h.binding, custody: { ...h.binding.custody } }, trap = vi.fn();
      if (kind === "project") binding.projectRef = "bcdefghijklmnopqrstuv";
      if (kind === "vercel") binding.vercelProjectId = "prj_other000000000000";
      if (kind === "ca") binding.ca = Buffer.from("different");
      if (kind === "ca-empty") binding.ca = Buffer.alloc(0);
      if (kind === "ca-large") binding.ca = Buffer.alloc(65537);
      if (kind === "digest") binding.caSha256 = "not-a-digest";
      if (kind === "extra") Object.assign(binding, { open: trap });
      if (kind === "custody-extra") Object.assign(binding.custody, { password: "private" });
      if (kind === "issue" || kind === "revoke") Object.assign(binding.custody, { [kind]: undefined });
      if (kind === "accessor") Object.defineProperty(binding, "custody", { get: trap, enumerable: true });
      if (kind === "ca-proxy") binding.ca = new Proxy(binding.ca, { getPrototypeOf: trap });
      if (kind === "function-proxy") binding.custody.issue = new Proxy(h.issue, { apply: trap });
      expect(compose({ env: h.env, binding: kind === "proxy" ? new Proxy(binding, { ownKeys: trap }) : binding })).toBeUndefined();
      expect(trap).not.toHaveBeenCalled(); expect(h.issue).not.toHaveBeenCalled(); expect(io.cookie).not.toHaveBeenCalled();
    });
  it("snapshots CA bytes and custody callbacks without reading ambient privileged credentials", async () => {
    const h = harness(), trap = vi.fn(); h.binding.ca.fill(0);
    Object.assign(h.binding.custody, { issue: trap, revoke: trap });
    for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "PGPASSWORD", "DATABASE_URL"])
      Object.defineProperty(h.env, key, { get: trap });
    expect((await h.handle(request())).status).toBe(200); expect(trap).not.toHaveBeenCalled();
    expect(h.issue).toHaveBeenCalledOnce(); expect(h.revoke).toHaveBeenCalledOnce();
    expect((io.clients[0].config.ssl as { ca: Buffer }).ca).toEqual(Buffer.from("synthetic-CA")); closed();
  });
  it.each(["?owner=other", "?limit=100", "?before=invalid", "?draftAfter=invalid"])("rejects cursor/identity injection %s before issuance", async query => {
    const h = harness(); expect((await h.handle(request(query))).status).toBe(503);
    expect(h.issue).not.toHaveBeenCalled(); expect(io.clients).toHaveLength(0);
  });
  it.each<RequestInit>([{ method: "POST" }, { headers: { "sec-fetch-site": "cross-site" } },
    { headers: { "sec-fetch-site": "same-origin", authorization: "Bearer private" } }, { signal: AbortSignal.abort() }])(
    "denies invalid transport %# before IO", async init => {
      const h = harness(); expect((await h.handle(request("", init))).status).toBe(503);
      expect(io.cookie).not.toHaveBeenCalled(); expect(h.issue).not.toHaveBeenCalled();
    });
  it("makes distinct owner/session-bound leases and connections for concurrent requests", async () => {
    const h = harness(), other = cookie(OTHER, OTHER_SESSION);
    io.cookie.mockResolvedValueOnce(h.client).mockResolvedValueOnce(other);
    const responses = await Promise.all([h.handle(request()), h.handle(request())]);
    expect(responses.map(r => r.status)).toEqual([200, 200]); expect(h.issue).toHaveBeenCalledTimes(2); expect(h.revoke).toHaveBeenCalledTimes(2);
    const scopes = h.issue.mock.calls.map(([scope]) => scope);
    expect(new Set(scopes.map(s => s.requestId)).size).toBe(2);
    expect(scopes.map(s => s.principal)).toEqual([{ userId: USER, sessionId: SESSION, transport: "COOKIE" },
      { userId: OTHER, sessionId: OTHER_SESSION, transport: "COOKIE" }]);
    expect(io.clients).toHaveLength(4); expect(new Set(io.clients.map(c => c.config.user)).size).toBe(2);
    const queries = io.clients.flatMap(c => c.calls).filter(c => c.sql === COMMUNICATION_NOTE_JOB_LIST_SQL);
    expect(queries.map(q => q.values?.slice(0, 2))).toEqual([[USER, SESSION], [OTHER, OTHER_SESSION]]); closed();
  });
  it("invokes a snapshotted custody factory only after verifying the request's current session", async () => {
    const h = harness(), { custody, ...base } = h.binding;
    const create = vi.fn(() => ({ ...custody })), trap = vi.fn(), binding = { ...base, createCustody: create };
    const runtime = compose({ env: h.env, binding }); binding.createCustody = trap;
    const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime });
    expect(create).not.toHaveBeenCalled();
    h.client.session.mockResolvedValueOnce({ data: "REVOKED", error: null });
    expect((await handle(request())).status).toBe(401); expect(create).not.toHaveBeenCalled();
    expect((await handle(request())).status).toBe(200);
    expect(create).toHaveBeenCalledWith({ userId: USER, sessionId: SESSION, transport: "COOKIE" });
    expect(trap).not.toHaveBeenCalled(); closed();
  });
  it("refuses a reused single-lease custody object before a second issuance", async () => {
    const h = harness(), { custody, ...base } = h.binding;
    const runtime = compose({ env: h.env, binding: { ...base, createCustody: () => custody } });
    const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime });
    expect((await handle(request())).status).toBe(200); expect((await handle(request())).status).toBe(503);
    expect(h.issue).toHaveBeenCalledOnce(); expect(h.revoke).toHaveBeenCalledOnce(); closed();
  });
  it.each(["both", "invalid", "proxy", "accessor"])("rejects an invalid factory binding: %s", kind => {
    const h = harness(), { custody, ...base } = h.binding, trap = vi.fn(() => custody);
    const binding = { ...base, createCustody: trap };
    if (kind === "both") Object.assign(binding, { custody });
    if (kind === "invalid") Object.assign(binding, { createCustody: "invalid" });
    if (kind === "proxy") binding.createCustody = new Proxy(trap, { apply: trap });
    if (kind === "accessor") Object.defineProperty(binding, "createCustody", { get: trap, enumerable: true });
    expect(compose({ env: h.env, binding })).toBeUndefined(); expect(trap).not.toHaveBeenCalled(); expect(io.cookie).not.toHaveBeenCalled();
  });
  it.each([undefined, {}, { issue: "invalid", revoke: "invalid" }])("rejects an invalid factory result before credential IO: %#", async value => {
    const h = harness(), { custody, ...base } = h.binding; void custody;
    const runtime = compose({ env: h.env, binding: { ...base, createCustody: () => value as never } });
    const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime });
    expect((await handle(request())).status).toBe(503); expect(h.issue).not.toHaveBeenCalled(); expect(io.clients).toHaveLength(0);
  });
  it("rechecks configuration after a custody factory returns", async () => {
    const h = harness(), { custody, ...base } = h.binding;
    const runtime = compose({ env: h.env, binding: { ...base, createCustody: () => { h.env.VERCEL_ENV = "production"; return custody; } } });
    const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime });
    expect((await handle(request())).status).toBe(503); expect(h.issue).not.toHaveBeenCalled(); expect(io.clients).toHaveLength(0);
  });
  it.each([1, 4])("suppresses both lists when current-session check %i is revoked", async check => {
    const h = harness(); let count = 0;
    h.client.session.mockImplementation(async () => ({ data: ++count === check ? "REVOKED" : "ACTIVE", error: null }));
    const r = await h.handle(request()); expect(r.status).toBe(401); expect(await r.json()).toEqual({ status: "AUTH_REQUIRED" });
    expect(h.issue).toHaveBeenCalledTimes(check === 4 ? 1 : 0); expect(h.revoke).toHaveBeenCalledTimes(check === 4 ? 1 : 0); closed();
  });
  it.each(["documents", "issue", "read", "revoke"])("denies environment drift during %s without blocking cleanup", async stage => {
    const h = harness(), drift = () => { h.env.VERCEL_ENV = "production"; };
    if (stage === "documents") h.client.documents.mockImplementation(async () => { drift(); return { data: { documents: [], nextCursor: null, hasMore: false }, error: null }; });
    if (stage === "issue") h.issue.mockImplementation(async scope => { drift(); return delivery(scope); });
    if (stage === "read") io.query = async sql => { if (sql === COMMUNICATION_NOTE_JOB_LIST_SQL) drift(); };
    if (stage === "revoke") h.revoke.mockImplementation(async scope => { drift(); return receipt(scope); });
    const r = await h.handle(request()); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "UNAVAILABLE" });
    expect(h.revoke).toHaveBeenCalledTimes(stage === "documents" ? 0 : 1);
    expect(io.clients).toHaveLength(stage === "documents" || stage === "issue" ? 0 : 2); closed();
  });
  it.each(["issue", "revoke", "wrong-role", "wrong-receipt", "TLS", "residue"])("fails closed after %s failure and still requests revocation", async kind => {
    const h = harness();
    if (kind === "issue") h.issue.mockRejectedValue(new Error("PRIVATE_ISSUER_MESSAGE"));
    if (kind === "revoke") h.revoke.mockRejectedValue(new Error("PRIVATE_REVOKE_MESSAGE"));
    if (kind === "wrong-role") h.issue.mockImplementation(async scope => ({ ...delivery(scope), credential: { ...delivery(scope).credential, role: "postgres" } }));
    if (kind === "wrong-receipt") h.revoke.mockImplementation(async scope => ({ ...receipt(scope), projectRef: "bcdefghijklmnopqrstuv" }));
    if (kind === "TLS") io.connect = c => { c.connection.stream.authorized = false; };
    if (kind === "residue") io.query = async sql => sql.includes("as remaining") ? { rows: [{ remaining: 1 }] } : undefined;
    const r = await h.handle(request()); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "UNAVAILABLE" });
    expect(h.revoke).toHaveBeenCalledOnce(); closed();
  });
  it.each(["issue", "revoke"])("bounds stalled %s and ignores its late receipt", async stage => {
    vi.useFakeTimers(); const h = harness(); let settle!: () => void;
    if (stage === "issue") h.issue.mockImplementation(scope => new Promise(resolve => { settle = () => resolve(delivery(scope)); }));
    else h.revoke.mockImplementation(scope => new Promise(resolve => { settle = () => resolve(receipt(scope)); }));
    const pending = h.handle(request()); await vi.advanceTimersByTimeAsync(8000);
    const r = await pending; expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "UNAVAILABLE" });
    expect(h.revoke).toHaveBeenCalledOnce(); settle(); await vi.runAllTimersAsync();
    expect(io.clients).toHaveLength(stage === "issue" ? 0 : 2); expect(vi.getTimerCount()).toBe(0); closed();
  });
  it("bounds an uncooperative driver read, discards late data and completes late physical cleanup", async () => {
    vi.useFakeTimers(); const h = harness(); let settle!: () => void;
    io.query = async sql => sql === COMMUNICATION_NOTE_JOB_LIST_SQL ?
      new Promise(resolve => { settle = () => resolve(rows); }) : undefined;
    const pending = h.handle(request()); await vi.advanceTimersByTimeAsync(15000);
    const r = await pending; expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "UNAVAILABLE" });
    expect(h.revoke).toHaveBeenCalledOnce(); expect(h.client.session).toHaveBeenCalledTimes(3);
    // The independent custody provider still owns the terminal fence while
    // this deliberately non-cooperating fake driver has not settled.
    settle(); await vi.runAllTimersAsync(); closed(); expect(vi.getTimerCount()).toBe(0);
    expect(h.client.session).toHaveBeenCalledTimes(3);
  });
  it("maps database session revocation to auth-required only after cleanup", async () => {
    const h = harness(); io.query = async sql => {
      if (sql === COMMUNICATION_NOTE_JOB_LIST_SQL) throw Object.assign(new Error("SESSION_REVOKED"), { code: "P0001" });
    };
    const r = await h.handle(request()); expect(r.status).toBe(401); expect(await r.json()).toEqual({ status: "AUTH_REQUIRED" });
    expect(h.revoke).toHaveBeenCalledOnce(); closed();
  });
  it("abort while issuing still revokes on an independent signal; late issuance cannot open PG", async () => {
    const h = harness(), controller = new AbortController(); let settle!: () => void;
    h.issue.mockImplementation(scope => new Promise(resolve => { settle = () => resolve(delivery(scope)); }));
    const pending = h.handle(request("", { signal: controller.signal })); await until(() => h.issue.mock.calls.length === 1); controller.abort();
    expect((await pending).status).toBe(503); await until(() => h.revoke.mock.calls.length === 1);
    expect(h.issue.mock.calls[0][1].signal.aborted).toBe(true); expect(h.revoke.mock.calls[0][1].signal.aborted).toBe(false);
    settle(); await until(() => h.revoke.mock.results[0].type === "return"); expect(io.clients).toHaveLength(0);
  });
  it("keeps the actual route unbound even with all Preview flags enabled", async () => {
    const h = harness(); for (const [key, value] of Object.entries(h.env)) vi.stubEnv(key, value);
    expect(COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined();
    expect((await GET(request())).status).toBe(503); expect(io.cookie).not.toHaveBeenCalled(); expect(h.issue).not.toHaveBeenCalled();
    expect(io.clients).toHaveLength(0);
    // Re-import under the enabled environment, not just after an off-state import.
    vi.resetModules();
    const fresh = await import("./communication-note-workspace-runtime.server");
    const route = await import("../app/api/ai-documents/communication-note/documents/route");
    expect(fresh.COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined();
    expect((await route.GET(request())).status).toBe(503); expect(io.cookie).not.toHaveBeenCalled(); expect(io.clients).toHaveLength(0);
  });
});
