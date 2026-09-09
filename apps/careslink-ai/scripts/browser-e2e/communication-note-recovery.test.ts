import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mode: "succeeded" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.mode }) }) }));
import { DOC, JOB, REV, readFixtureJob, readFixtureDocument, observeFixtureNetwork, confirmFixtureReview } from "./communication-note-recovery.fixture";

const runner = readFileSync(new URL("./communication-note-recovery.mjs", import.meta.url), "utf8");
const request = (id = JOB) => new Request(`http://127.0.0.1:3395/api/ai-documents/communication-note/jobs/${id}`);
beforeEach(() => {
  state.mode = "succeeded";
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("careslink.synthetic.browser.review")];
  vi.spyOn(process, "cwd").mockReturnValue("/private/tmp/cl-job-browser-abc123");
  vi.stubEnv("CARESLINK_LOCAL_BROWSER_FIXTURE", "SYNTHETIC_LOOPBACK_ONLY"); vi.stubEnv("VERCEL", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("isolated real-browser fixture preflight", () => {
  const KEY = "11111111-1111-4111-8111-111111111111";
  const confirm = (revisionId = REV) => confirmFixtureReview(new Request(`http://127.0.0.1:3395/api/ai-documents/communication-note/documents/${DOC}/self-review`, {
    method: "POST", headers: { host: "127.0.0.1:3395", origin: "http://127.0.0.1:3395", "sec-fetch-site": "same-origin", "content-type": "application/json", "idempotency-key": KEY },
    body: JSON.stringify({ revisionId, factsConfirmed: true, wordingConfirmed: true, missingFactsReviewed: true }),
  }), DOC);
  it("records only one synthetic process-memory confirmation and exposes it to the reader", async () => {
    const first = await confirm(), replay = await confirm();
    expect(first.status).toBe(200); expect(await replay.json()).toEqual(await first.json());
    const read = await readFixtureDocument(new Request(`http://127.0.0.1:3395/api/ai-documents/communication-note/documents/${DOC}?revisionId=${REV}`), DOC);
    expect(await read.json()).toMatchObject({ selfReviewStatus: "CONFIRMED", draftNotice: "Draft – review required" });
    expect(vi.mocked(console.log).mock.calls.filter(([line]) => JSON.parse(line).fixture === "self-review")).toHaveLength(1);
  });
  it.each([["anonymous", 401], ["revoked", 401], ["foreign", 404], ["unavailable", 503]] as const)("does not acknowledge a %s review", async (mode, status) => {
    state.mode = mode; expect((await confirm()).status).toBe(status);
  });
  it("rejects another revision even after an acknowledged command with the same key", async () => {
    expect((await confirm()).status).toBe(200);
    expect((await confirm(KEY)).status).toBe(409);
    state.mode = "revoked";
    expect((await confirm()).status).toBe(401);
  });
  it("normalizes only the owned fixture's fixed Host, without accepting a foreign Origin", async () => {
    const wire = (host: string, origin: string) => new Request(`http://localhost:3395/api/ai-documents/communication-note/documents/${DOC}/self-review`, {
      method: "POST", headers: { host, origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "idempotency-key": KEY },
      body: JSON.stringify({ revisionId: REV, factsConfirmed: true, wordingConfirmed: true, missingFactsReviewed: true }),
    });
    expect((await confirmFixtureReview(wire("127.0.0.1:3395", "http://127.0.0.1:3395"), DOC)).status).toBe(200);
    expect((await confirmFixtureReview(wire("other.invalid", "http://127.0.0.1:3395"), DOC)).status).toBe(400);
    expect((await confirmFixtureReview(wire("127.0.0.1:3395", "https://other.invalid"), DOC)).status).toBe(400);
  });
  it.each(["queued", "running", "succeeded", "failed", "cancelled"])("feeds %s through the real HTTP composition and repository", async mode => {
    state.mode = mode; const response = await readFixtureJob(request(), JOB);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    const data = await response.json(); expect(data).toMatchObject({ status: "AVAILABLE", job: { jobId: JOB, status: mode.toUpperCase() } });
    if (mode === "succeeded") expect(data.job.result).toMatchObject({ canonicalId: DOC, revisionId: REV });
  });
  it.each([["anonymous", 401], ["revoked", 401], ["foreign", 404], ["unavailable", 503]] as const)("denies %s with %s", async (mode, status) => {
    state.mode = mode; expect((await readFixtureJob(request(), JOB)).status).toBe(status);
  });
  it("folds foreign and missing identifiers into identical replies", async () => {
    state.mode = "foreign"; const foreign = await (await readFixtureJob(request(), JOB)).json();
    state.mode = "succeeded"; const id = "77777777-7777-4777-8777-777777777777";
    const missing = await readFixtureJob(request(id), id); expect(missing.status).toBe(404); expect(await missing.json()).toEqual(foreign);
  });
  it("projects the saved synthetic revision through the real document reader", async () => {
    const response = await readFixtureDocument(new Request(`http://127.0.0.1:3395/api/ai-documents/communication-note/documents/${DOC}?revisionId=${REV}`), DOC);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: "AVAILABLE", canonicalId: DOC,
      revision: { revisionId: REV, content: { englishDraft: expect.stringContaining("SYNTHETIC TEST DRAFT") } }, selfReviewStatus: "REQUIRED" });
  });
  it("refuses the fixture outside its owned temporary root", async () => {
    vi.mocked(process.cwd).mockReturnValue("/private/tmp/careslink-ai-points-ui-v1/apps/careslink-ai");
    await expect(readFixtureJob(request(), JOB)).rejects.toThrow("Local browser fixture unavailable");
  });
  it("classifies a cancelled request without calling the synthetic database", async () => {
    const controller = new AbortController(); controller.abort();
    const response = await readFixtureJob(new Request(request(), { signal: controller.signal }), JOB);
    expect(response.status).toBe(503);
    expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0])).toMatchObject({
      failure: "CLIENT_ABORTED", requestAborted: true, acquired: false, queried: false,
    });
  });
  it("keeps repeated concurrent successful reads out of the unclassified 503 bucket", async () => {
    for (let batch = 0; batch < 10; batch += 1) {
      const responses = await Promise.all(Array.from({ length: 30 }, () => readFixtureJob(request(), JOB)));
      expect(responses.map(response => response.status)).toEqual(Array(30).fill(200));
    }
  });
  const observation = (change: Record<string, string> = {}, headers = { host: "127.0.0.1:3395", "sec-fetch-site": "same-origin" }) =>
    new Request("http://127.0.0.1:3395/fixture-control/observation?" + new URLSearchParams({
      page: "11111111-1111-4111-8111-111111111111", sequence: "1", kind: "OFFLINE", online: "false", trusted: "true", ...change,
    }), { headers });
  it("records only bounded content-free browser observations", () => {
    expect(observeFixtureNetwork(observation()).status).toBe(204);
    expect(JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0])).toEqual({ fixture: "browser-network",
      page: "11111111-1111-4111-8111-111111111111", sequence: 1, kind: "OFFLINE", online: false, trusted: true });
  });
  it.each<Record<string, string>>([{ kind: "SECRET" }, { sequence: "65" }, { online: "maybe" }, { trusted: "1" },
    { page: "not-a-page-id" }, { body: "not accepted" }])("rejects malformed observer input %j", change => {
    expect(observeFixtureNetwork(observation(change)).status).toBe(400);
    expect(console.log).not.toHaveBeenCalled();
  });
  it("denies cross-site and non-loopback observations", () => {
    expect(observeFixtureNetwork(observation({}, { host: "127.0.0.1:3395", "sec-fetch-site": "cross-site" })).status).toBe(400);
    expect(observeFixtureNetwork(observation({}, { host: "example.com", "sec-fetch-site": "same-origin" })).status).toBe(400);
  });
  it("stages only an owned copy with fixed loopback binding, no ambient env and exit-checked cleanup", () => {
    expect(runner).toContain('const port = 3395, host = "127.0.0.1"');
    expect(runner).toContain('root = await mkdtemp(prefix)');
    expect(runner).toContain('src/app/fixture-control/set/route.ts'); // Not a Next private _folder.
    expect(runner).toContain('getSupabasePublicAuthConfig');
    expect(runner).not.toMatch(/\.\.\.process\.env|copy\(["']\.env|spawn\(["'](?:npm|npx)|0\.0\.0\.0/);
    expect(runner).toContain('Browser fixture denies outbound fetch');
    expect(runner).toContain('sourceUnchanged: true');
    expect(runner).toContain('launch(["build", "--webpack"])');
    expect(runner).toContain('built ? ["start"] : ["dev", "--webpack"]');
    expect(runner).not.toContain("ignoreBuildErrors");
    const observer = readFileSync(new URL("./communication-note-network-observer.js", import.meta.url), "utf8");
    expect(observer).toContain('event.isTrusted');
    expect(observer).toContain('sequence >= 64');
    expect(observer).not.toMatch(/dispatchEvent|localStorage|sessionStorage|document\.cookie|innerHTML|globalThis\.fetch\s*=/);
  });
  it("exercises the actual Points page with only the UI flag, not a synthetic wallet binding", () => {
    expect(runner).toContain('await copy("src/app/plan-and-usage/page.tsx", "src/app/plan-and-usage/page.tsx")');
    expect(runner).toContain('CARESLINK_V1_POINTS_UI_ENABLED: "true"');
    expect(runner).not.toContain('CARESLINK_V1_PRODUCT_API_POINTS_READ_ENABLED: "true"');
    expect(runner).not.toMatch(/emit\("src\/lib\/v1\/(?:points-page-data|product-api-runtime)\.server\.ts/);
    expect(runner).toContain('"src/lib/communication-note-points-navigation.ts"');
  });
});
