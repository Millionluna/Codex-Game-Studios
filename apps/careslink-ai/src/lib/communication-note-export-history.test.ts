import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleExportHistory, type ExportHistoryBinding } from "./communication-note-export-history.server";
import { loadExportHistory, recordExportHistory } from "./communication-note-export-history-client";
import { buildExportHistoryHref, parseExportHistoryList, parseExportHistoryReceipt, parseExportHistoryReport,
  type ExportHistoryEntry, type ExportHistoryReport,
} from "./communication-note-export-history-contract";
import { COMMUNICATION_NOTE_TEXT_TEMPLATE } from "./communication-note-export";
vi.mock("server-only", () => ({}));
const DOC = "44444444-4444-4444-8444-444444444444", REV = "55555555-5555-4555-8555-555555555555";
const KEY = "11111111-1111-4111-8111-111111111111", NOW = "2026-09-08T01:00:00.000Z";
const report: ExportHistoryReport = { revisionId: REV, format: "TXT", outcome: "DOWNLOAD_INITIATED", startedAt: NOW };
const entry: ExportHistoryEntry = { ...report, attemptId: KEY, revisionNumber: 1, recordedAt: NOW,
  templateVersion: COMMUNICATION_NOTE_TEXT_TEMPLATE, profile: "RECORD_COPY" };
const receipt = { status: "RECORDED", canonicalId: DOC, storage: "PROCESS_MEMORY_ONLY", entry } as const;
const list = { status: "AVAILABLE", canonicalId: DOC, revisionId: REV, storage: "PROCESS_MEMORY_ONLY", entries: [entry], hasMore: false } as const;
const scope = { canonicalId: DOC, revisionId: REV };
const expected = { canonicalId: DOC, attemptId: KEY, report };
const binding = (): ExportHistoryBinding => ({ record: vi.fn(async () => receipt), list: vi.fn(async () => list) });
function request(method = "POST", payload: unknown = report, headers: Record<string, string> = {}, suffix?: string) {
  return new Request(`https://example.test${buildExportHistoryHref(DOC)}${suffix ?? (method === "GET" ? `?revisionId=${REV}` : "")}`, {
    method, ...(method === "GET" ? {} : { body: JSON.stringify(payload) }),
    headers: { origin: "https://example.test", "sec-fetch-site": "same-origin", "content-type": "application/json", "idempotency-key": KEY, ...headers },
  });
}
afterEach(() => vi.useRealTimers());
describe("minimal export history contract", () => {
  it.each(["TXT", "DOCX", "PDF"] as const)("accepts %s initiated and failed, never saved", format => {
    expect(parseExportHistoryReport({ ...report, format })).toBeDefined();
    expect(parseExportHistoryReport({ ...report, format, outcome: "FAILED" })).toBeDefined();
    expect(parseExportHistoryReport({ ...report, format, outcome: "DOWNLOADED" })).toBeUndefined();
  });
  it("distinguishes clipboard reports from download initiation", () => {
    expect(parseExportHistoryReport({ ...report, format: "COPY", outcome: "COPY_REPORTED" })).toBeDefined();
    expect(parseExportHistoryReport({ ...report, format: "COPY" })).toBeUndefined();
    expect(parseExportHistoryReport({ ...report, outcome: "COPY_REPORTED" })).toBeUndefined();
  });
  it.each([null, [], {}, { ...report, ownerUserId: KEY }, { ...report, text: "private" },
    { ...report, filename: "patient.docx" }, { ...report, error: "raw DB message" },
    { ...report, revisionId: "bad" }, { ...report, format: { toString: () => "TXT" } },
    { ...report, startedAt: "2026-02-30T00:00:00.000Z" }, { ...report, startedAt: "2026-09-08" },
    { ...report, startedAt: "2026-09-08T00:00:00+10:00" }, { ...report, outcome: "SHARED" },
  ])("rejects malformed or body-bearing reports %j", value => expect(parseExportHistoryReport(value)).toBeUndefined());
  it.each([
    { ...receipt, canonicalId: REV }, { ...receipt, storage: "LOCAL_STORAGE" }, { ...receipt, extra: "private" },
    ...[{ ...entry, revisionId: KEY }, { ...entry, attemptId: REV }, { ...entry, revisionNumber: 0 },
      { ...entry, revisionNumber: 1.5 }, { ...entry, revisionNumber: 2147483648 }, { ...entry, text: "secret" },
      { ...entry, recordedAt: "invalid" }, { ...entry, format: "PDF" }, { ...entry, startedAt: "2026-09-08T02:00:00.000Z" },
      { ...entry, outcome: "FAILED" }, { ...entry, templateVersion: "other" }].map(entry => ({ ...receipt, entry })),
  ])("binds and sanitizes receipts %j", value => expect(parseExportHistoryReceipt(value, expected)).toBeUndefined());
  it("accepts a bound minimal receipt and a copied list without leaking objects", () => {
    expect(parseExportHistoryReceipt(receipt, expected)).toEqual(receipt);
    expect(parseExportHistoryList(list, scope)).toEqual(list);
    expect(parseExportHistoryList(list, scope)).not.toBe(list);
  });
  it.each([
    { ...list, canonicalId: REV }, { ...list, revisionId: KEY }, { ...list, owner: KEY },
    { ...list, entries: [entry, entry] }, { ...list, hasMore: true },
    { ...list, entries: Array(21).fill(entry) }, { ...list, entries: [{ ...entry, revisionId: KEY }] },
    { ...list, entries: [entry, { ...entry, attemptId: REV }] },
    { ...list, entries: [entry, { ...entry, attemptId: REV, recordedAt: "2026-09-08T02:00:00.000Z" }] },
  ])("rejects mismatched, duplicate, oversized or unordered lists %j", value => expect(parseExportHistoryList(value, scope)).toBeUndefined());
});
describe("export history guarded HTTP port", () => {
  it.each(["GET", "POST"])("keeps formal %s default-off before any operation", async method => {
    const req = request(method); const response = await handleExportHistory(req, DOC);
    expect(response.status).toBe(503); expect(req.bodyUsed).toBe(false);
    const source = readFileSync(new URL("../app/api/ai-documents/communication-note/documents/[documentId]/export-history/route.ts", import.meta.url), "utf8");
    expect(source.match(/handleExportHistory\(request, \(await context.params\).documentId\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/fixture|process\.env|service.role|createMemory/);
  });
  it("passes only the fixed request to record and returns private no-store metadata", async () => {
    const port = binding(), req = request(); const response = await handleExportHistory(req, DOC, port);
    expect(port.record).toHaveBeenCalledExactlyOnceWith({ request: req, ...expected });
    expect(await response.json()).toEqual(receipt);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(port.list).not.toHaveBeenCalled();
  });
  it("reads only the requested version; same-origin GET need not have Origin", async () => {
    const port = binding(), req = request("GET"); req.headers.delete("origin");
    const response = await handleExportHistory(req, DOC, port);
    expect(await response.json()).toEqual(list);
    expect(port.list).toHaveBeenCalledExactlyOnceWith({ request: req, ...scope });
    expect(port.record).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ origin: "https://evil.test" }, { origin: "null" }, { origin: "" },
    { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "" }, { "content-type": "text/plain" }, { "idempotency-key": "" },
  ])("rejects unsafe POST headers %j", async headers => {
    const port = binding(); expect((await handleExportHistory(request("POST", report, headers), DOC, port)).status).toBe(400);
    expect(port.record).not.toHaveBeenCalled();
  });
  it.each(["", `?revisionId=${REV}&revisionId=${REV}`, `?revisionId=${REV}&owner=${KEY}`, "?owner=other"])("rejects ambiguous list queries %s", async suffix => {
    const port = binding(); expect((await handleExportHistory(request("GET", report, {}, suffix), DOC, port)).status).toBe(400);
    expect(port.list).not.toHaveBeenCalled();
  });
  it("rejects bearer auth, HTTP, wrong paths, query injection and streamed oversized JSON", async () => {
    const port = binding();
    expect((await handleExportHistory(request("POST", report, { authorization: "Bearer secret" }), DOC, port)).status).toBe(401);
    for (const req of [new Request(request().url.replace("https:", "http:"), request()),
      new Request(request().url + "/extra", request()), request("POST", report, {}, "?owner=x"),
      request("POST", { ...report, private: "x".repeat(2000) })]) {
      expect((await handleExportHistory(req, DOC, port)).status).toBe(400);
    }
    expect(port.record).not.toHaveBeenCalled();
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND", "STALE_REVISION", "REVIEW_REQUIRED", "INVALID_REQUEST", "UNAVAILABLE"] as const)("preserves content-free denial %s", async status => {
    const response = await handleExportHistory(request(), DOC, { ...binding(), record: async () => ({ status }) });
    expect(await response.json()).toEqual({ status });
  });
  it("sanitizes unexpected results, backend errors and aborted completion", async () => {
    for (const port of [{ ...binding(), record: async () => ({ ...receipt, secret: "private" }) },
      { ...binding(), record: async () => { throw new Error("private credential"); } }]) {
      expect(await (await handleExportHistory(request(), DOC, port)).json()).toEqual({ status: "UNAVAILABLE" });
    }
    const c = new AbortController();
    expect(await (await handleExportHistory(new Request(request(), { signal: c.signal }), DOC, {
      ...binding(), record: async () => { c.abort(); return receipt; },
    })).json()).toEqual({ status: "UNAVAILABLE" });
  });
});
describe("export history private client", () => {
  const input = () => ({ ...expected, signal: new AbortController().signal });
  it("writes one body-free report without retry and reads one scoped list", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, json: async () => receipt }));
    expect(await recordExportHistory({ ...input(), fetcher })).toEqual(receipt);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(buildExportHistoryHref(DOC), expect.objectContaining({
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", body: JSON.stringify(report),
      headers: expect.objectContaining({ "Idempotency-Key": KEY }),
    }));
    const reader = vi.fn(async () => ({ status: 200, json: async () => list }));
    expect(await loadExportHistory({ ...scope, signal: input().signal, fetcher: reader })).toEqual(list);
    expect(reader).toHaveBeenCalledExactlyOnceWith(buildExportHistoryHref(DOC, REV), expect.objectContaining({ method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error" }));
  });
  it.each([201, 401, 503])("rejects a receipt delivered with HTTP %i", async status => {
    expect(await recordExportHistory({ ...input(), fetcher: async () => ({ status, json: async () => receipt }) })).toEqual({ status: "UNAVAILABLE" });
  });
  it("rejects extra response fields and never retries a lost write receipt", async () => {
    const fetcher = vi.fn(async () => { throw new Error("connection lost after commit"); });
    expect(await recordExportHistory({ ...input(), fetcher })).toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await loadExportHistory({ ...scope, signal: input().signal, fetcher: async () => ({ status: 200, json: async () => ({ ...list, secret: "x" }) }) })).toEqual({ status: "UNAVAILABLE" });
  });
  it("bounds a stuck sidecar request at five seconds and ignores late success", async () => {
    vi.useFakeTimers(); let resolve!: (r: { status: number; json: () => Promise<typeof receipt> }) => void;
    const fetcher = vi.fn(() => new Promise<{ status: number; json: () => Promise<typeof receipt> }>(r => { resolve = r; }));
    const pending = recordExportHistory({ ...input(), fetcher });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ status: "UNAVAILABLE" });
    resolve({ status: 200, json: async () => receipt });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("stops on access abort and never fetches pre-aborted input", async () => {
    const c = new AbortController(), fetcher = vi.fn(() => new Promise<never>(() => {}));
    const pending = loadExportHistory({ ...scope, signal: c.signal, fetcher }); c.abort();
    expect(await pending).toEqual({ status: "UNAVAILABLE" });
    expect(await recordExportHistory({ ...input(), signal: c.signal, fetcher })).toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
