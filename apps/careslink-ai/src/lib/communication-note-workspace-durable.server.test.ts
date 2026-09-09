import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const defaultCookie = vi.hoisted(() => vi.fn());
vi.mock("./supabase-server", () => ({ createCareslinkServerSupabaseClient: defaultCookie }));
import { createCommunicationNoteWorkspaceDurableRuntime as compose, COMMUNICATION_NOTE_WORKSPACE_TASK_CALLER as CALLER,
  COMMUNICATION_NOTE_WORKSPACE_TASK_PURPOSE as PURPOSE, type CommunicationNoteWorkspaceDurableEnv } from "./communication-note-workspace-durable.server";
import { createCommunicationNoteWorkspaceHandler, COMMUNICATION_NOTE_WORKSPACE_READ_TIMEOUT_MS as TIMEOUT } from "./communication-note-workspace.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import { GET } from "../app/api/ai-documents/communication-note/documents/route";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FOREIGN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", DOC = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222", JOB = "33333333-3333-4333-8333-333333333333";
const REF = "abcdefghijklmnopqrst", TIME = "2026-09-08T01:00:00.000000Z";
const identity = { userId: USER, sessionId: SESSION, transport: "COOKIE" as const };
const task = { jobId: JOB, status: "QUEUED", createdAt: TIME, updatedAt: TIME };
const document = { canonicalId: DOC, noteType: "communication", sourceLocale: "en", lifecycleStatus: "IN_PROGRESS",
  currentRevisionId: REV, currentRevisionNumber: 1, contractVersion: "1.0.0-shadow.1", schemaVersion: "2026-08-09.v1-shadow",
  createdAt: TIME, updatedAt: TIME, deletedAt: null };
const request = (query = "", init: RequestInit = {}) => new Request("https://app.example.invalid/api/ai-documents/communication-note/documents" + query,
  { headers: { "sec-fetch-site": "same-origin", cookie: "opaque" }, ...init });
function environment(): CommunicationNoteWorkspaceDurableEnv {
  return { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "true", CARESLINK_V1_PRODUCT_API_ENABLED: "true",
    CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF: REF,
    CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_VERCEL_PROJECT_ID: "prj_1234567890abcdef",
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: "prj_1234567890abcdef",
    SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef" };
}
function harness() {
  const events: string[] = [], env = environment();
  const claims = vi.fn(async () => { events.push("claims"); return { data: { claims: { sub: USER, session_id: SESSION } }, error: null }; });
  const user = vi.fn(async () => { events.push("user"); return { data: { user: { id: USER } }, error: null }; });
  const session = vi.fn(async (): Promise<{ data: unknown; error: null }> => { events.push("session"); return { data: "ACTIVE", error: null }; });
  const documents = vi.fn(async (): Promise<{ data: unknown; error: null | { code: string; message: string } }> => {
    events.push("documents"); return { data: { documents: [document], nextCursor: null, hasMore: false }, error: null };
  });
  const client = { auth: { getClaims: claims, getUser: user }, rpc: vi.fn((name: string, args?: Readonly<Record<string, unknown>>) => {
    if (name === "resolve_v1_current_session_status" && args === undefined) return session();
    if (name === "list_v1_shadow_documents") return documents();
    throw new Error("Unexpected capability");
  }) };
  const execute = vi.fn(async (_values: readonly unknown[], _context: { signal: AbortSignal }) => {
    expect(_values).toHaveLength(7); expect(_context.signal.aborted).toBe(false);
    events.push("tasks"); return { rows: [{ data: { tasks: [task], nextCursor: null } }] };
  });
  const port = { projectRef: REF, purpose: PURPOSE, callerRole: CALLER, execute };
  const resolveTaskRead = vi.fn(async () => { events.push("port"); return port; });
  const createCookieClient = vi.fn(async () => { events.push("cookie"); return client; });
  const options = { env, resolveTaskRead, createCookieClient };
  const runtime = compose(options)!;
  const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime });
  return { options, env, runtime, handle, events, client, claims, user, session, documents, execute, port, resolveTaskRead, createCookieClient };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("default-off workspace durable adapter", () => {
  it("composes real principal, document parser and fixed task repository with one Cookie client", async () => {
    const h = harness(); expect(h.events).toEqual([]);
    const r = await h.handle(request()); expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "AVAILABLE", documents: [{ canonicalId: DOC, revisionNumber: 1, sourceLocale: "en", updatedAt: TIME }],
      documentsCursor: null, taskPage: { tasks: [task], nextCursor: null } });
    expect(h.createCookieClient).toHaveBeenCalledOnce();
    expect(h.events).toEqual(["cookie", "claims", "session", "user", "claims", "session", "user", "documents",
      "claims", "session", "user", "port", "tasks", "claims", "session", "user"]);
    expect(h.execute).toHaveBeenCalledWith([USER, SESSION, null, null, 20, "1.0.0-shadow.1", "2026-08-09.v1-shadow"], { signal: expect.any(AbortSignal) });
    expect(h.execute.mock.calls[0][1].signal.aborted).toBe(true);
    expect(h.resolveTaskRead).toHaveBeenCalledWith({ projectRef: REF, purpose: PURPOSE, callerRole: CALLER, principal: identity, signal: expect.any(AbortSignal) });
    expect(h.client.rpc).toHaveBeenCalledWith("list_v1_shadow_documents", { p_after_document_id: null, p_limit: 20 });
    expect(defaultCookie).not.toHaveBeenCalled();
  });
  it.each([
    { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: undefined }, { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "TRUE" },
    { CARESLINK_V1_PRODUCT_API_ENABLED: "false" }, { VERCEL: undefined }, { VERCEL_ENV: "production" }, { VERCEL_TARGET_ENV: "production" },
    { VERCEL_PROJECT_ID: "prj_other000000000000" }, { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF: CARESLINK_PRODUCTION_SUPABASE_REF },
    { SUPABASE_URL: `https://${REF}.supabase.co/` }, { NEXT_PUBLIC_SUPABASE_URL: "https://elsewhere.invalid" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" }, { SUPABASE_PUBLISHABLE_KEY: undefined },
  ])("rejects configuration %# without client/port initialization", override => {
    const h = harness(); Object.assign(h.env, override); expect(compose(h.options)).toBeUndefined(); expect(h.events).toEqual([]);
  });
  it("does not consult service keys, generation, Points or write gates", async () => {
    const h = harness(); Object.assign(h.env, { CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED: "false", CARESLINK_POINTS_UI_ENABLED: "false" });
    Object.defineProperty(h.env, "SUPABASE_SERVICE_ROLE_KEY", { get: () => { throw new Error("Forbidden credential access"); } });
    expect((await h.handle(request())).status).toBe(200);
  });
  it("uses the same safe target snapshot for the default SSR Cookie factory", async () => {
    const h = harness(); defaultCookie.mockResolvedValue(h.client);
    const runtime = compose({ env: h.env, resolveTaskRead: h.options.resolveTaskRead });
    expect((await createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime })(request())).status).toBe(200);
    expect(defaultCookie).toHaveBeenCalledWith({ env: { SUPABASE_URL: h.env.SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL: h.env.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: h.env.SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: h.env.SUPABASE_PUBLISHABLE_KEY } });
  });
  it.each(["?owner=other", "?limit=100", "?before=private", "?draftAfter=private", "?before=&before=bad"])("rejects %s after auth, before both metadata ports", async query => {
    const h = harness(); expect((await h.handle(request(query))).status).toBe(503); expect(h.session).toHaveBeenCalledOnce();
    expect(h.documents).not.toHaveBeenCalled(); expect(h.resolveTaskRead).not.toHaveBeenCalled();
  });
  it.each<RequestInit>([{ method: "POST" }, { headers: { "sec-fetch-site": "cross-site" } }, { headers: { "sec-fetch-site": "same-origin", authorization: "Bearer private" } },
    { headers: { "sec-fetch-site": "same-origin", origin: "https://other.invalid" } }, { signal: AbortSignal.abort() }])("denies transport %# before all IO", async init => {
    const h = harness(); expect((await h.handle(request("", init))).status).toBe(503); expect(h.events).toEqual([]);
  });
  it("keeps owner/session fixed with independent cursor positions", async () => {
    const h = harness(); h.documents.mockResolvedValue({ data: { documents: [], nextCursor: null, hasMore: false }, error: null });
    h.execute.mockResolvedValue({ rows: [{ data: { tasks: [], nextCursor: null } }] });
    expect((await h.handle(request(`?draftAfter=document.v1:${DOC}&before=${encodeURIComponent(TIME + "~" + JOB)}`))).status).toBe(200);
    expect(h.client.rpc).toHaveBeenCalledWith("list_v1_shadow_documents", { p_after_document_id: DOC, p_limit: 20 });
    expect(h.execute.mock.calls[0][0].slice(0, 5)).toEqual([USER, SESSION, TIME, JOB, 20]);
  });
  it.each([1, 2, 3, 4])("withholds metadata when reauthorization #%i is revoked", async pass => {
    const h = harness(); let count = 0; h.session.mockImplementation(async () => ({ data: ++count === pass ? "REVOKED" : "ACTIVE", error: null }));
    const r = await h.handle(request()); expect(r.status).toBe(401); expect(await r.json()).toEqual({ status: "AUTH_REQUIRED" });
    expect(h.execute).toHaveBeenCalledTimes(pass === 4 ? 1 : 0);
  });
  it.each(["owner", "session"])("rejects changed %s between document and task reads", async field => {
    const h = harness(); h.documents.mockImplementation(async () => {
      h.claims.mockResolvedValue({ data: { claims: { sub: field === "owner" ? FOREIGN : USER, session_id: field === "session" ? FOREIGN : SESSION } }, error: null });
      h.user.mockResolvedValue({ data: { user: { id: field === "owner" ? FOREIGN : USER } }, error: null });
      return { data: { documents: [document], nextCursor: null, hasMore: false }, error: null };
    });
    expect((await h.handle(request())).status).toBe(401); expect(h.resolveTaskRead).not.toHaveBeenCalled();
  });
  it.each(["cookie", "documents", "port", "tasks"])("denies target drift during %s", async stage => {
    const h = harness(); const change = () => { h.env.VERCEL_ENV = "production"; };
    if (stage === "cookie") h.createCookieClient.mockImplementation(async () => { change(); return h.client; });
    if (stage === "documents") h.documents.mockImplementation(async () => { change(); return { data: { documents: [document], nextCursor: null, hasMore: false }, error: null }; });
    if (stage === "port") h.resolveTaskRead.mockImplementation(async () => { change(); return h.port; });
    if (stage === "tasks") h.execute.mockImplementation(async () => { change(); return { rows: [{ data: { tasks: [task], nextCursor: null } }] }; });
    const r = await h.handle(request()); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "UNAVAILABLE" });
    expect(h.execute).toHaveBeenCalledTimes(stage === "tasks" ? 1 : 0);
  });
  it.each([{ projectRef: "bcdefghijklmnopqrstuv" }, { purpose: "COMMUNICATION_NOTE_JOB_STATUS_READ" },
    { callerRole: "careslink_v1_generation_points_admission_caller" }, { query: () => {} }, { password: "private" }])("rejects substituted or excessive task port %#", async override => {
    const h = harness(); h.resolveTaskRead.mockResolvedValue({ ...h.port, ...override } as typeof h.port);
    expect((await h.handle(request())).status).toBe(503); expect(h.execute).not.toHaveBeenCalled();
  });
  it("rejects task-port accessors/proxies without invoking their traps", async () => {
    const h = harness(), trap = vi.fn();
    const port = { ...h.port }; Object.defineProperty(port, "execute", { get: trap, enumerable: true });
    h.resolveTaskRead.mockResolvedValue(port); expect((await h.handle(request())).status).toBe(503); expect(trap).not.toHaveBeenCalled();
    h.resolveTaskRead.mockResolvedValue(new Proxy(h.port, { ownKeys: trap }));
    expect((await h.handle(request())).status).toBe(503); expect(trap).not.toHaveBeenCalled();
  });
  it.each(["SESSION_REVOKED", "PRIVATE_DRIVER_MESSAGE"])("normalizes task SQL error %s", async message => {
    const h = harness(); h.execute.mockRejectedValue(Object.assign(new Error(message), { code: "P0001" }));
    const r = await h.handle(request()); expect(r.status).toBe(message === "SESSION_REVOKED" ? 401 : 503);
    expect(JSON.stringify(await r.json())).not.toContain("PRIVATE_DRIVER_MESSAGE");
  });
  it("rejects raw document text or owner data before opening a task port", async () => {
    const h = harness(); h.documents.mockResolvedValue({ data: { documents: [{ ...document, cleanedFacts: "private" }], nextCursor: null, hasMore: false }, error: null });
    expect((await h.handle(request())).status).toBe(503); expect(h.resolveTaskRead).not.toHaveBeenCalled();
  });
  it("never reuses an authenticated context across requests or repeated reader factories", async () => {
    const h = harness(), r = request(); await h.runtime.resolvePrincipal(r);
    expect(() => h.runtime.createReaders({ request: request(), principal: identity })).toThrow();
    const readers = await h.runtime.createReaders({ request: r, principal: identity });
    expect(Object.keys(readers)).toEqual(["listDocuments", "listTasks"]);
    expect(() => h.runtime.createReaders({ request: r, principal: identity })).toThrow();
    await expect(readers.listTasks(null)).rejects.toThrow();
    await readers.listDocuments({ limit: 20 });
    await expect(readers.listDocuments({ limit: 20 })).rejects.toThrow();
    expect(h.createCookieClient).toHaveBeenCalledOnce();
  });
  it.each(["cookie", "port", "tasks"])("bounds a hanging %s stage; late settlement cannot continue the read", async stage => {
    vi.useFakeTimers(); const h = harness(); let settle!: () => void;
    if (stage === "cookie") h.createCookieClient.mockImplementation(() => new Promise(resolve => { settle = () => resolve(h.client); }));
    if (stage === "port") h.resolveTaskRead.mockImplementation(() => new Promise(resolve => { settle = () => resolve(h.port); }));
    if (stage === "tasks") h.execute.mockImplementation(() => new Promise(resolve => { settle = () => resolve({ rows: [{ data: { tasks: [task], nextCursor: null } }] }); }));
    const pending = h.handle(request()); await vi.advanceTimersByTimeAsync(TIMEOUT);
    expect((await pending).status).toBe(503); settle(); await vi.runAllTimersAsync();
    expect(h.execute).toHaveBeenCalledTimes(stage === "tasks" ? 1 : 0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("propagates request abort to task execution and discards late results", async () => {
    const h = harness(), controller = new AbortController(); let settle!: () => void;
    h.execute.mockImplementation(() => new Promise(resolve => { settle = () => resolve({ rows: [{ data: { tasks: [task], nextCursor: null } }] }); }));
    const pending = h.handle(request("", { headers: { "sec-fetch-site": "same-origin" }, signal: controller.signal }));
    await vi.waitFor(() => expect(h.execute).toHaveBeenCalled()); controller.abort();
    expect((await pending).status).toBe(503); expect(h.execute.mock.calls[0][1].signal.aborted).toBe(true); settle();
  });
  it("still leaves the actual formal GET unbound even with all local flags enabled", async () => {
    for (const [key, value] of Object.entries(environment())) vi.stubEnv(key, value);
    expect((await GET(request())).status).toBe(503); expect(defaultCookie).not.toHaveBeenCalled();
    const source = readFileSync(new URL("./communication-note-workspace-durable.server.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/process\.env|new Client|globalThis|\.from\(|\.select\(|createCaresLinkV1ProductApiRuntime|localStorage|console\./);
  });
});
