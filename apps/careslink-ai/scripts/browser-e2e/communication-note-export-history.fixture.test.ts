import { describe, expect, it, vi } from "vitest";
import { createEditFixtureHistoryBinding, createEditFixtureState, EDIT_DOC as DOC, EDIT_REV as REV } from "./communication-note-edit.fixture";
import type { CaresLinkV1ProductApiRuntime } from "../../src/lib/v1/product-api-runtime.server";
import { parseExportHistoryList, type ExportHistoryReport } from "../../src/lib/communication-note-export-history-contract";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
const KEY = "77777777-7777-4777-8777-777777777777", FOREIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const report: ExportHistoryReport = { revisionId: REV, format: "TXT", outcome: "DOWNLOAD_INITIATED", startedAt: "2026-09-08T01:00:00.000Z" };
async function setup() {
  const state = await createEditFixtureState();
  const control = { auth: "owner", reviewed: true };
  const source: CaresLinkV1ProductApiRuntime = {
    resolveAuth: async () => control.auth === "revoked" ? { ok: false, status: 401, reason: "session_revoked" }
      : { ok: true, identity: { source: "cookie", sessionId: state.principal.sessionId,
        userId: control.auth === "foreign" ? FOREIGN : state.principal.userId } },
    getProductApi: async principal => {
      const api = state.store.forPrincipal(principal);
      return { ...api, getDocument: async id => ({ ...await api.getDocument(id), selfReviewStatus: control.reviewed ? "CONFIRMED" : "REQUIRED" }) };
    },
  };
  const port = createEditFixtureHistoryBinding(state, source), request = new Request("https://example.test/");
  const write = (attemptId = KEY, value = report) => port.record({ request, canonicalId: DOC, attemptId, report: value });
  const list = () => port.list({ request, canonicalId: DOC, revisionId: REV });
  return { state, control, port, request, write, list };
}
describe("synthetic export history server roundtrip (not durable storage)", () => {
  it("records once, replays the same receipt and independently reads minimal metadata", async () => {
    const s = await setup(); const first = await s.write();
    expect(first.status).toBe("RECORDED"); expect(await s.write()).toEqual(first);
    expect(s.state.exportHistory.size).toBe(1);
    const list = await s.list(); expect(parseExportHistoryList(list, { canonicalId: DOC, revisionId: REV })).toEqual(list);
    expect(JSON.stringify(list)).not.toMatch(/englishDraft|factsSummary|ownerUserId|SYNTHETIC TEST DRAFT|Phone/);
    expect(list).toMatchObject({ storage: "PROCESS_MEMORY_ONLY", entries: [{ ...report, revisionNumber: 1 }] });
  });
  it.each([{ ...report, format: "PDF" as const }, { ...report, outcome: "FAILED" as const },
    { ...report, startedAt: "2026-09-08T02:00:00.000Z" }])("rejects altered replay without changing the first record %j", async changed => {
    const s = await setup(); const first = await s.write();
    expect(await s.write(KEY, changed)).toEqual({ status: "INVALID_REQUEST" });
    expect(await s.write()).toEqual(first); expect(s.state.exportHistory.size).toBe(1);
  });
  it.each(["foreign", "revoked"])("rechecks %s before replay and list, without exposing old rows", async auth => {
    const s = await setup(); await s.write(); s.control.auth = auth;
    const denied = { status: auth === "foreign" ? "NOT_FOUND" : "AUTH_REQUIRED" };
    expect(await s.write()).toEqual(denied); expect(await s.list()).toEqual(denied);
    expect(s.state.exportHistory.size).toBe(1);
  });
  it("rejects a review reset even on replay while historical metadata remains readable", async () => {
    const s = await setup(); await s.write(); s.control.reviewed = false;
    expect(await s.write()).toEqual({ status: "REVIEW_REQUIRED" });
    expect((await s.list()).status).toBe("AVAILABLE");
  });
  it("does not return records for a different document or revision", async () => {
    const s = await setup(); await s.write();
    expect(await s.port.list({ request: s.request, canonicalId: FOREIGN, revisionId: REV })).toEqual({ status: "NOT_FOUND" });
    expect(await s.port.list({ request: s.request, canonicalId: DOC, revisionId: FOREIGN })).toEqual({ status: "NOT_FOUND" });
  });
  it("stops serving history after the synthetic document is tombstoned", async () => {
    const s = await setup(); await s.write();
    await s.state.store.forPrincipal(s.state.principal).tombstoneDocument(DOC, { baseRevisionId: REV }, { idempotencyKey: "synthetic:history:delete:0001" });
    expect(await s.list()).toEqual({ status: "NOT_FOUND" }); expect(await s.write()).toEqual({ status: "NOT_FOUND" });
  });
  it("caps the test store and returns only the newest 20, without silently evicting replay evidence", async () => {
    const s = await setup();
    for (let i = 1; i <= 128; i++) expect((await s.write(`77777777-7777-4777-8777-${String(i).padStart(12, "0")}`)).status).toBe("RECORDED");
    expect(await s.write()).toEqual({ status: "UNAVAILABLE" });
    expect((await s.write("77777777-7777-4777-8777-000000000001")).status).toBe("RECORDED");
    const list = await s.list(); expect(list).toMatchObject({ status: "AVAILABLE", hasMore: true });
    if (list.status !== "AVAILABLE") throw Error("Expected list");
    expect(list.entries).toHaveLength(20); expect(parseExportHistoryList(list, { canonicalId: DOC, revisionId: REV })).toEqual(list);
  });
});
