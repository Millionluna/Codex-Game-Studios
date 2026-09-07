import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const state = vi.hoisted(() => ({ mode: "succeeded", query: vi.fn(), connect: vi.fn(), end: vi.fn(), config: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.mode }) }) }));
vi.mock("node:fs/promises", () => ({ realpath: async (path: string) => path }));
vi.mock("pg", () => ({ Client: class {
  constructor(config: unknown) { state.config(config); }
  on() {} query = state.query; connect = state.connect; end = state.end;
} }));
import { assertReviewDatabaseFixture, reviewFixtureRpcCommand, createReviewDatabaseAuthClient,
  confirmReviewDatabaseDocument, saveEditDatabaseDocument, REVIEW_DOC } from "./communication-note-self-review.fixture";
const ROOT = "/private/tmp/cl-job-browser-abc123", REV = "22222222-2222-4222-8222-222222222222";
const KEY = "66666666-6666-4666-8666-666666666666";
const ack = { status: "CONFIRMED", canonicalId: REVIEW_DOC, revisionId: REV, mutationId: KEY,
  saveState: "SERVER_ACKNOWLEDGED", draftNotice: "Draft – review required" };
const target = { role: "cl_review_browser_runtime", unix_only: true, cluster: "careslink-review-browser-pg16", socket: ROOT + "/pg/socket" };
beforeEach(() => {
  vi.clearAllMocks(); state.mode = "succeeded";
  vi.spyOn(process, "cwd").mockReturnValue(ROOT);
  vi.stubEnv("CARESLINK_LOCAL_BROWSER_FIXTURE", "SYNTHETIC_LOOPBACK_ONLY"); vi.stubEnv("VERCEL", "");
  vi.stubEnv("CARESLINK_LOCAL_REVIEW_DATABASE", "OWNED_UNIX_SOCKET_ONLY"); vi.stubEnv("CARESLINK_LOCAL_REVIEW_PASSWORD", "a".repeat(64));
  vi.stubEnv("CARESLINK_LOCAL_EDIT_DATABASE", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  state.connect.mockResolvedValue(undefined); state.end.mockResolvedValue(undefined);
  state.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith("select current_user") ? [target]
    : sql.includes("resolve_v1_current_session_status") ? [{ data: "ACTIVE" }]
    : sql.includes("confirm_communication_note_self_review") ? [{ data: ack }] : [] }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("owned database browser adapter", () => {
  it("keeps the narrow edit RPC unavailable in the review-only fixture", async () => {
    expect(() => reviewFixtureRpcCommand("save_communication_note_wording", { p_document_id: REVIEW_DOC,p_mutation_id: KEY,p_command: {} })).toThrow();
    expect((await saveEditDatabaseDocument(new Request("http://127.0.0.1:3395"),REVIEW_DOC)).status).toBe(503);
    expect(state.connect).not.toHaveBeenCalled();
  });
  it("allows only the exact three edit RPC parameters under the extra local guard", () => {
    vi.stubEnv("CARESLINK_LOCAL_EDIT_DATABASE", "OWNED_UNIX_SOCKET_ONLY");
    const args={p_document_id: REVIEW_DOC,p_mutation_id: KEY,p_command:{englishDraft:"Synthetic '; -- text"}};
    const command=reviewFixtureRpcCommand("save_communication_note_wording",args);
    expect(command).toEqual({sql:"select public.save_communication_note_wording($1,$2,$3::jsonb) as data",parameters:[REVIEW_DOC,KEY,args.p_command]});
    expect(() => reviewFixtureRpcCommand("save_communication_note_wording",{...args,owner:KEY})).toThrow();
    expect(() => reviewFixtureRpcCommand("append_v1_shadow_document_revision",args)).toThrow();
    vi.mocked(process.cwd).mockReturnValue("/private/tmp");expect(() => reviewFixtureRpcCommand("save_communication_note_wording",args)).toThrow();
  });
  it("rejects an edit Host mismatch before opening a database client", async () => {
    vi.stubEnv("CARESLINK_LOCAL_EDIT_DATABASE", "OWNED_UNIX_SOCKET_ONLY");
    expect((await saveEditDatabaseDocument(new Request("http://127.0.0.1:3395",{headers:{host:"foreign.test"}}),REVIEW_DOC)).status).toBe(400);
    expect(state.connect).not.toHaveBeenCalled();
  });
  it("runs the edit RPC in an isolated transaction and never prints text", async () => {
    vi.stubEnv("CARESLINK_LOCAL_EDIT_DATABASE", "OWNED_UNIX_SOCKET_ONLY");
    const client=await createReviewDatabaseAuthClient(),args={p_document_id:REVIEW_DOC,p_mutation_id:KEY,p_command:{englishDraft:"SYNTHETIC_PRIVATE_WORDING"}};
    state.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith("select current_user")?[target]:[{data:{status:"SAVED"}}] }));
    expect(await client.rpc("save_communication_note_wording",args)).toMatchObject({data:{status:"SAVED"},error:null});
    expect(state.query).toHaveBeenCalledWith("select public.save_communication_note_wording($1,$2,$3::jsonb) as data",[REVIEW_DOC,KEY,args.p_command]);
    expect(state.query).toHaveBeenCalledWith("commit");expect(state.end).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("SYNTHETIC_PRIVATE_WORDING");
  });
  it("preserves privacy rejections and rolls back the edit transaction", async () => {
    vi.stubEnv("CARESLINK_LOCAL_EDIT_DATABASE", "OWNED_UNIX_SOCKET_ONLY");
    state.query.mockImplementation(async (sql: string) => {
      if(sql.includes("save_communication_note_wording")) throw Object.assign(new Error("PRIVACY_REVIEW_REQUIRED"),{code:"P0001"});
      return {rows:sql.startsWith("select current_user")?[target]:[]};
    });
    const client=await createReviewDatabaseAuthClient();
    expect(await client.rpc("save_communication_note_wording",{p_document_id:REVIEW_DOC,p_mutation_id:KEY,p_command:{}}))
      .toEqual({data:null,error:{code:"P0001",message:"PRIVACY_REVIEW_REQUIRED"}});
    expect(state.query).toHaveBeenCalledWith("rollback");expect(state.end).toHaveBeenCalledTimes(1);
  });
  it.each(["/private/tmp", "/private/tmp/careslink-ai-points-ui-v1", "/Users/test/project"])("rejects non-owned cwd %s", cwd => {
    vi.mocked(process.cwd).mockReturnValue(cwd); expect(assertReviewDatabaseFixture).toThrow(); expect(state.connect).not.toHaveBeenCalled();
  });
  it.each([["VERCEL", "1"], ["CARESLINK_LOCAL_BROWSER_FIXTURE", ""], ["CARESLINK_LOCAL_REVIEW_DATABASE", ""], ["CARESLINK_LOCAL_REVIEW_PASSWORD", ""]])("rejects missing/mismatched guard %s", (key, value) => {
    vi.stubEnv(key, value); expect(assertReviewDatabaseFixture).toThrow();
  });
  it.each(["get_v1_points_wallet", "drop table public.self_review_events", "__proto__", "constructor"])("does not expose arbitrary RPC %s", name => {
    expect(() => reviewFixtureRpcCommand(name)).toThrow("Fixture RPC denied");
  });
  it("rejects extra owner/identity or missing arguments and parameterizes allowed inputs", () => {
    expect(() => reviewFixtureRpcCommand("get_v1_shadow_document", { p_document_id: REVIEW_DOC, owner: KEY })).toThrow();
    expect(() => reviewFixtureRpcCommand("get_v1_shadow_document")).toThrow();
    const value = "injection'; drop schema public cascade;";
    const command = reviewFixtureRpcCommand("get_v1_shadow_document", { p_document_id: value });
    expect(command.sql).toBe("select public.get_v1_shadow_document($1) as data"); expect(command.parameters).toEqual([value]);
  });
  it("uses a private Unix socket and transaction-local claims with a non-admin LOGIN", async () => {
    const client = await createReviewDatabaseAuthClient();
    expect(await client.rpc("resolve_v1_current_session_status")).toEqual({ data: "ACTIVE", error: null });
    expect(state.config).toHaveBeenCalledWith(expect.objectContaining({ host: ROOT + "/pg/socket", user: "cl_review_browser_runtime", ssl: false }));
    expect(state.query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining("select current_user"), "begin", "set local role authenticated",
      "select set_config('request.jwt.claims',$1,true)", "select public.resolve_v1_current_session_status() as data", "commit",
    ]);
    expect(state.end).toHaveBeenCalledTimes(1);
    expect(state.query.mock.calls.some(([sql]) => sql.includes("unix_socket_directories") || sql.includes("pg_read_all_settings"))).toBe(false);
  });
  it("fails before claims/RPC when target attestation is wrong", async () => {
    state.query.mockResolvedValue({ rows: [{ ...target, unix_only: false }] });
    const client = await createReviewDatabaseAuthClient();
    expect(await client.rpc("resolve_v1_current_session_status")).toMatchObject({ data: null, error: { message: "UNAVAILABLE" } });
    expect(state.query.mock.calls.map(([sql]) => sql)).not.toContain("set local role authenticated"); expect(state.end).toHaveBeenCalledTimes(1);
  });
  it("rolls back failures, omits backend details and closes the connection", async () => {
    state.query.mockImplementation(async (sql: string) => {
      if (sql.includes("resolve_v1_current_session_status")) throw Object.assign(new Error("private SQL detail"), { code: "XX999" });
      return { rows: sql.startsWith("select current_user") ? [target] : [] };
    });
    const client = await createReviewDatabaseAuthClient();
    expect(await client.rpc("resolve_v1_current_session_status")).toEqual({ data: null, error: { code: "P0001", message: "UNAVAILABLE" } });
    expect(state.query).toHaveBeenCalledWith("rollback"); expect(state.end).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("private SQL detail");
  });
  it("routes the browser confirmation through the real durable writer and exact SQL", async () => {
    const response = await confirmReviewDatabaseDocument(new Request(`http://localhost:3395/api/ai-documents/communication-note/documents/${REVIEW_DOC}/self-review`, {
      method: "POST", headers: { host: "127.0.0.1:3395", origin: "http://127.0.0.1:3395", "sec-fetch-site": "same-origin", "content-type": "application/json", "idempotency-key": KEY },
      body: JSON.stringify({ revisionId: REV, factsConfirmed: true, wordingConfirmed: true, missingFactsReviewed: true }),
    }), REVIEW_DOC);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(ack);
    expect(state.query).toHaveBeenCalledWith("select public.confirm_communication_note_self_review($1,$2,$3,$4,$5,$6) as data", [REVIEW_DOC, REV, KEY, true, true, true]);
  });
  it("preserves the formal unbound route and makes DB opt-in/built-only in the runner", () => {
    const route = readFileSync(new URL("../../src/app/api/ai-documents/communication-note/documents/[documentId]/self-review/route.ts", import.meta.url), "utf8");
    expect(route).not.toMatch(/fixture|Durable|process.env/);
    const runner = readFileSync(new URL("./communication-note-recovery.mjs", import.meta.url), "utf8");
    expect(runner).toContain('const databaseReview = args[0] === "--database-review"');
    expect(runner).toContain('const built = args[0] === "--built" || databaseReview');
    expect(runner.indexOf("await reviewDatabase?.stop()")).toBeLessThan(runner.indexOf("await rm(root"));
  });
});
