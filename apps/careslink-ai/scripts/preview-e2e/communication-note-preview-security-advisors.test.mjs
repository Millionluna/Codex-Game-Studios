import { afterEach, describe, expect, it, vi } from "vitest";
import { collectCommunicationNotePreviewSecurityAdvisors as collect, parseCommunicationNotePreviewSecurityAdvisors as parse }
  from "./communication-note-preview-security-advisors.mjs";
const parent = "adocsnwnslxhxcjgbyee", ref = "abcdefghijklmnopqrst", id = "11111111-1111-4111-8111-111111111111";
const selection = { expectedName: "synthetic-preview", productionProjectRef: parent, lockedId: id, lockedRef: ref };
const target = { id, name: selection.expectedName, project_ref: ref, parent_project_ref: parent, is_default: false,
  persistent: false, with_data: false, status: "FUNCTIONS_DEPLOYED", preview_project_status: "ACTIVE_HEALTHY",
  created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" };
const main = { ...target, id: "22222222-2222-4222-8222-222222222222", name: "main", project_ref: parent, is_default: true };
const branchList = (override = {}) => JSON.stringify([main, { ...target, ...override }]);
const finding = { name: "rls_disabled_in_public", level: "ERROR", detail: "PRIVATE_TABLE_NAME", metadata: { secret: "PRIVATE" },
  remediation: "https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public" };
const mcp = body => JSON.stringify({ isError: false, content: [{ type: "text", text: JSON.stringify(body) }] });
afterEach(() => vi.useRealTimers());
describe("read-only Preview security advisor collection", () => {
  it("rechecks exact target and preserves a real empty lints response", async () => {
    const readBranches = vi.fn(async () => branchList()), readAdvisors = vi.fn(async () => mcp({ lints: [] }));
    expect(await collect({ selection, readBranches, readAdvisors })).toEqual({ ok: true, stage: "complete", findingCount: 0, findings: [], securityReviewPassed: true });
    expect(readAdvisors).toHaveBeenCalledExactlyOnceWith({ project_id: ref, type: "security" }); expect(readBranches).toHaveBeenCalledTimes(2);
  });
  it("does not mistake successful collection with findings for a review pass", () => {
    const result = parse(mcp({ lints: [finding] }));
    expect(result).toMatchObject({ findingCount: 1, securityReviewPassed: false });
    expect(result.findings[0].remediation).toBe(finding.remediation);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|metadata|detail/);
  });
  it.each(["", "null", "[]", "{}", '{"results":[]}', '{"lints":null}', '{"lints":[],"error":"PRIVATE"}',
    JSON.stringify({ isError: true, content: [{ type: "text", text: '{"lints":[]}' }] })])("rejects absent/CLI/error output %s, never treating it as no findings", raw => {
    expect(() => parse(raw)).toThrow();
  });
  it.each(["https://evil.invalid/?lint=0013_rls_disabled_in_public", "https://supabase.com@evil.invalid/docs",
    "https://user@supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public",
    finding.remediation + "&token=PRIVATE", finding.remediation + "#PRIVATE"])("rejects untrusted remediation URL %s", remediation => {
    expect(() => parse(JSON.stringify({ lints: [{ ...finding, remediation }] }))).toThrow();
  });
  it.each([{ name: "PRIVATE.name" }, { level: "UNKNOWN" }, { remediation: null }])("rejects malformed finding %j", override => {
    expect(() => parse(JSON.stringify({ lints: [{ ...finding, ...override }] }))).toThrow();
  });
  it.each(["target-before", "collect", "target-after", "parse"])("reports fixed %s failure without retry or raw errors", async stage => {
    const readBranches = vi.fn(async () => branchList()), readAdvisors = vi.fn(async () => mcp({ lints: [] }));
    if (stage === "target-before") readBranches.mockResolvedValue(branchList({ with_data: true }));
    if (stage === "target-after") readBranches.mockResolvedValueOnce(branchList()).mockResolvedValueOnce(branchList({ project_ref: parent }));
    if (stage === "collect") readAdvisors.mockRejectedValue(new Error("PRIVATE_SECRET"));
    if (stage === "parse") readAdvisors.mockResolvedValue("PRIVATE");
    expect(await collect({ selection, readBranches, readAdvisors })).toEqual({ ok: false, stage, securityReviewPassed: false });
    expect(readAdvisors).toHaveBeenCalledTimes(stage === "target-before" ? 0 : 1);
  });
  it("bounds report collection and never resumes after late completion", async () => {
    vi.useFakeTimers(); let settle;
    const readBranches = vi.fn(async () => branchList());
    const readAdvisors = vi.fn(() => new Promise(resolve => { settle = resolve; }));
    const pending = collect({ selection, readBranches, readAdvisors });
    await vi.advanceTimersByTimeAsync(30000);
    expect(await pending).toEqual({ ok: false, stage: "collect", securityReviewPassed: false });
    settle(mcp({ lints: [] })); await vi.runAllTimersAsync(); expect(readBranches).toHaveBeenCalledOnce();
  });
});
