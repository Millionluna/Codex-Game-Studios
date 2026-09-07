import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mode: "succeeded" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.mode }) }) }));
import { DOC, JOB, REV, readFixtureJob, readFixtureDocument } from "./communication-note-recovery.fixture";

const runner = readFileSync(new URL("./communication-note-recovery.mjs", import.meta.url), "utf8");
const request = (id = JOB) => new Request(`http://127.0.0.1:3395/api/ai-documents/communication-note/jobs/${id}`);
beforeEach(() => {
  state.mode = "succeeded";
  vi.spyOn(process, "cwd").mockReturnValue("/private/tmp/cl-job-browser-abc123");
  vi.stubEnv("CARESLINK_LOCAL_BROWSER_FIXTURE", "SYNTHETIC_LOOPBACK_ONLY"); vi.stubEnv("VERCEL", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("isolated real-browser fixture preflight", () => {
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
  it("stages only an owned copy with fixed loopback binding, no ambient env and exit-checked cleanup", () => {
    expect(runner).toContain('const port = 3395, host = "127.0.0.1"');
    expect(runner).toContain('root = await mkdtemp(prefix)');
    expect(runner).toContain('src/app/fixture-control/set/route.ts'); // Not a Next private _folder.
    expect(runner).toContain('getSupabasePublicAuthConfig');
    expect(runner).not.toMatch(/\.\.\.process\.env|copy\(["']\.env|spawn\(["'](?:npm|npx)|0\.0\.0\.0/);
    expect(runner).toContain('Browser fixture denies outbound fetch');
    expect(runner).toContain('sourceUnchanged: true');
  });
});
