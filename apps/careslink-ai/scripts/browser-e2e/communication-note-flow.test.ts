import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mode: "owner", read: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./communication-note-self-review.fixture", async importOriginal => ({
  ...await importOriginal<typeof import("./communication-note-self-review.fixture")>(),
  createReviewDatabaseAuthClient: async () => {
    const userId = state.mode === "foreign" ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    return { auth: {
      getClaims: async () => ({ data: { claims: state.mode === "anonymous" ? null : { sub: userId,
        session_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "authenticated", is_anonymous: false, exp: Date.now() / 1000 + 3600 } }, error: null }),
      getUser: async () => ({ data: { user: { id: userId, app_metadata: { role: "provider" } } }, error: null }),
    }, rpc: state.rpc };
  },
  readReviewDatabaseDocument: state.read,
}));
import { assertFlowFixture, FLOW_FACTS, FLOW_JOB, FLOW_POINTS, FLOW_REV, submitFlowTask, readFlowTask, flowResultBoundary } from "./communication-note-flow.fixture";
const DOC = "11111111-1111-4111-8111-111111111111", KEY = "66666666-6666-4666-8666-666666666666";
const API = "http://localhost:3395/api/ai-documents/communication-note", NOW = new Date("2026-09-08T03:00:00.000Z");
const headers = { host: "127.0.0.1:3395", origin: "http://127.0.0.1:3395", "sec-fetch-site": "same-origin",
  "content-type": "application/json", "idempotency-key": KEY };
const body = () => ({ sourceLocale: "en", cleanedFacts: structuredClone(FLOW_FACTS),
  privacyReview: { reviewedNoIdentifiers: true, processingAuthorityConfirmed: true } });
const post = (value: unknown = body(), changes: Record<string, string> = {}) => new Request(API + "/generate", {
  method: "POST", headers: { ...headers, ...changes }, body: JSON.stringify(value),
});
const get = (id = FLOW_JOB) => new Request(API + "/jobs/" + id, { headers });
const document = () => ({ status: "AVAILABLE", canonicalId: DOC, noteType: "communication", sourceLocale: "en", currentRevisionId: FLOW_REV,
  revision: { revisionId: FLOW_REV, revisionNumber: 1, contentHash: "a".repeat(64), createdAt: NOW.toISOString(),
    content: { englishDraft: "Synthetic review test only.", reviewVersions: { "zh-Hans": "合成测试。", "zh-Hant": "合成測試。" },
      factsSummary: structuredClone(FLOW_FACTS), missingFacts: [], neutralWordingChecks: [], followUpPrompts: [], disclaimer: "Draft – review required" } },
  versions: [{ revisionId: FLOW_REV, revisionNumber: 1, createdAt: NOW.toISOString() }], isCurrentRevision: true,
  selfReviewStatus: "REQUIRED", draftNotice: "Draft – review required", saveState: "SERVER_ACKNOWLEDGED" });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW); state.mode = "owner";
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("careslink.synthetic.browser.flow")];
  vi.spyOn(process, "cwd").mockReturnValue("/private/tmp/cl-job-browser-abc123"); vi.spyOn(console, "log").mockImplementation(() => {});
  for (const [key, value] of Object.entries({ VERCEL: "", CARESLINK_LOCAL_BROWSER_FIXTURE: "SYNTHETIC_LOOPBACK_ONLY",
    CARESLINK_LOCAL_REVIEW_DATABASE: "OWNED_UNIX_SOCKET_ONLY", CARESLINK_LOCAL_REVIEW_PASSWORD: "a".repeat(64),
    CARESLINK_LOCAL_HISTORY_DATABASE: "OWNED_UNIX_SOCKET_ONLY", CARESLINK_LOCAL_EDIT_DATABASE: "OWNED_UNIX_SOCKET_ONLY",
    CARESLINK_LOCAL_FLOW_FIXTURE: "FIXED_SYNTHETIC_ONLY" })) vi.stubEnv(key, value);
  state.rpc.mockImplementation(async () => ({ data: state.mode === "revoked" ? "REVOKED" : "ACTIVE", error: null }));
  state.read.mockImplementation(async () => Response.json(document()));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("fixed synthetic full-flow bridge", () => {
  it.each(["CARESLINK_LOCAL_FLOW_FIXTURE", "CARESLINK_LOCAL_HISTORY_DATABASE", "CARESLINK_LOCAL_EDIT_DATABASE", "CARESLINK_LOCAL_REVIEW_DATABASE"])("requires the independent owned guard %s", key => {
    vi.stubEnv(key, ""); expect(assertFlowFixture).toThrow(); expect(state.read).not.toHaveBeenCalled();
  });
  it("refuses a normal checkout or Hosted runtime", () => {
    vi.stubEnv("VERCEL", "1"); expect(assertFlowFixture).toThrow(); vi.stubEnv("VERCEL", "");
    vi.mocked(process.cwd).mockReturnValue("/private/tmp/careslink-ai-points-ui-v1"); expect(assertFlowFixture).toThrow();
  });
  it.each<Record<string, string>>([{ host: "foreign.invalid" }, { origin: "https://foreign.invalid" }, { "sec-fetch-site": "cross-site" },
    { authorization: "Bearer synthetic" }])("rejects external transport before auth/body storage: %j", async changes => {
    expect((await submitFlowTask(post(body(), changes))).status).toBe(403); expect(state.rpc).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled();
  });
  it.each(["anonymous", "revoked", "foreign"])("denies %s without admitting a task", async mode => {
    state.mode = mode; const response = await submitFlowTask(post());
    expect(response.status).toBe(mode === "foreign" ? 404 : 401); expect(state.read).not.toHaveBeenCalled();
    state.mode = "owner"; expect((await readFlowTask(get(), FLOW_JOB)).status).toBe(404);
  });
  it.each([
    () => ({ ...body(), sourceLocale: "zh-Hans" }),
    () => ({ ...body(), ownerUserId: DOC }),
    () => ({ ...body(), cleanedFacts: { ...FLOW_FACTS, observable_facts: "Different synthetic event." } }),
    () => ({ ...body(), privacyReview: { reviewedNoIdentifiers: false, processingAuthorityConfirmed: true } }),
    () => ({ ...body(), cleanedFacts: { ...FLOW_FACTS, contact_channel: "test@example.invalid" } }),
  ])("keeps real validation/scanning and fixed-fact rejection", async value => {
    const response = await submitFlowTask(post(value())); expect(response.status).toBeGreaterThanOrEqual(400);
    expect(state.read).not.toHaveBeenCalled(); expect((await readFlowTask(get(), FLOW_JOB)).status).toBe(404);
  });
  it("acknowledges one queued task and replays it without duplicating or changing the Points display", async () => {
    const responses = await Promise.all([submitFlowTask(post()), submitFlowTask(post())]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 202]);
    const acks = await Promise.all(responses.map(r => r.json()));
    expect(acks[0].job).toEqual(acks[1].job); expect(acks[0].job).toMatchObject({ jobId: FLOW_JOB, status: "QUEUED", attemptCount: 0 });
    expect((await submitFlowTask(post(body(), { "idempotency-key": "77777777-7777-4777-8777-777777777777" }))).status).toBe(409);
    expect(FLOW_POINTS).toMatchObject({ availablePoints: 100, reservedPoints: 0, generationCostPoints: 20 });
    expect(state.rpc.mock.calls.every(([name]) => name === "resolve_v1_current_session_status")).toBe(true);
    const logs = JSON.stringify(vi.mocked(console.log).mock.calls);
    for (const secret of [KEY, "Synthetic call occurred.", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "cleanedFacts"]) expect(logs).not.toContain(secret);
  });
  it("moves through queued/running/succeeded with one exact pre-seeded result and no GET writes", async () => {
    await submitFlowTask(post());
    const read = async () => { const response = await readFlowTask(get(), FLOW_JOB); expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store"); return response.json(); };
    expect(await read()).toMatchObject({ job: { status: "QUEUED" } });
    vi.setSystemTime(NOW.getTime() + 8000); expect(await read()).toMatchObject({ job: { status: "RUNNING" } });
    vi.setSystemTime(NOW.getTime() + 16000); const result = await read();
    expect(result).toMatchObject({ job: { status: "SUCCEEDED", result: { canonicalId: DOC, revisionId: FLOW_REV, contentHash: "a".repeat(64) } } });
    expect(await read()).toEqual(result); expect(JSON.stringify(result)).not.toContain("facts");
    expect(vi.mocked(console.log).mock.calls.filter(([s]) => JSON.parse(s).created === true)).toHaveLength(1);
  });
  it("does not reveal result/review/export routes before admission and task completion", async () => {
    const handle = vi.fn(async () => Response.json({ ok: true })), request = new Request(API + "/documents/" + DOC, { headers });
    expect((await flowResultBoundary(request, DOC, handle)).status).toBe(404); await submitFlowTask(post());
    expect((await flowResultBoundary(request, DOC, handle)).status).toBe(404);
    vi.setSystemTime(NOW.getTime() + 16000); expect((await flowResultBoundary(request, DOC, handle)).status).toBe(200);
    state.mode = "revoked"; expect((await flowResultBoundary(request, DOC, handle)).status).toBe(401);
    expect(handle).toHaveBeenCalledTimes(1);
  });
  it("rechecks session/owner and saved-result binding for task read and admission replay", async () => {
    await submitFlowTask(post()); state.mode = "revoked";
    expect((await submitFlowTask(post())).status).toBe(401); expect((await readFlowTask(get(), FLOW_JOB)).status).toBe(401);
    state.mode = "foreign"; expect((await readFlowTask(get(), FLOW_JOB)).status).toBe(404);
    state.mode = "owner"; expect((await readFlowTask(get(DOC), DOC)).status).toBe(404);
    state.read.mockResolvedValue(Response.json({ status: "NOT_FOUND" }, { status: 404 }));
    expect((await readFlowTask(get(), FLOW_JOB)).status).toBe(404);
  });
  it("refuses pre-seeded facts that do not match submitted facts", async () => {
    const result = { ...document(), revision: { ...document().revision, content: { ...document().revision.content,
      factsSummary: { ...FLOW_FACTS, action_taken: "Different synthetic wording." } } } };
    state.read.mockImplementation(async () => Response.json(result)); expect((await submitFlowTask(post())).status).toBe(503);
    expect((await readFlowTask(get(), FLOW_JOB)).status).toBe(404);
  });
  it("leaves formal source hard-off and never copies credentials or changes product components", () => {
    for (const path of ["src/app/api/ai-documents/communication-note/generate/route.ts", "src/app/ai-documents/communication-note/page.tsx",
      "src/app/ai-documents/communication-note/communication-note-composer.tsx"]) {
      expect(readFileSync(new URL("../../" + path, import.meta.url), "utf8")).not.toContain("flow.fixture");
    }
    const runner = readFileSync(new URL("./communication-note-recovery.mjs", import.meta.url), "utf8");
    expect(runner).toContain('const flow = args[0] === "--flow"'); expect(runner).toContain('if (flow) {');
    expect(runner).toContain("Task progress is simulated"); expect(runner).toContain("generationAvailable={locale===\"en\"}");
    expect(runner).not.toMatch(/\.\.\.process\.env|copy\(["']\.env/);
  });
});
