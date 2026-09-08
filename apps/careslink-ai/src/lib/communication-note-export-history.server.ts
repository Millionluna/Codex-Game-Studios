import "server-only";
import { SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";
import { buildExportHistoryHref, EXPORT_HISTORY_HTTP, parseExportHistoryList, parseExportHistoryReceipt,
  parseExportHistoryReport, type ExportHistoryList, type ExportHistoryReceipt, type ExportHistoryReport,
} from "./communication-note-export-history-contract";

/** Dedicated trusted port, not DOCUMENT_DETAIL write authority. A durable
 * installation MUST recheck active provider Cookie session, owner, type and
 * non-deleted lifecycle inside its transaction on EVERY read/write/replay.
 * Writes additionally require the exact current reviewed revision. Scope
 * idempotency to owner + attemptId and reject any changed report. Assign version,
 * template and recordedAt server-side. No body bytes, filenames or raw errors.
 * Read only this owner's selected revision, newest 20 (server time + ID desc).
 * No binding or process-global fallback is installed by the formal route. */
export type ExportHistoryBinding = Readonly<{
  record: (input: Readonly<{ request: Request; canonicalId: string; attemptId: string; report: ExportHistoryReport }>) => Promise<ExportHistoryReceipt>;
  list: (input: Readonly<{ request: Request; canonicalId: string; revisionId: string }>) => Promise<ExportHistoryList>;
  localFixtureOrigin?: "http://127.0.0.1:3395";
}>;
export async function handleExportHistory(request: Request, canonicalId: string, binding?: ExportHistoryBinding) {
  if (!binding) return reply({ status: "UNAVAILABLE" });
  try {
    const url = new URL(request.url);
    const fixture = url.origin === binding.localFixtureOrigin &&
      process.env.CARESLINK_LOCAL_BROWSER_FIXTURE === "SYNTHETIC_LOOPBACK_ONLY" &&
      /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/.test(process.cwd()) && !process.env.VERCEL;
    if (!UUID.test(canonicalId) || url.pathname !== buildExportHistoryHref(canonicalId) ||
        (url.protocol !== "https:" && !fixture) || request.headers.get("sec-fetch-site") !== "same-origin" ||
        (request.headers.has("origin") && request.headers.get("origin") !== url.origin)) return reply({ status: "INVALID_REQUEST" });
    if (request.headers.has("authorization")) return reply({ status: "AUTH_REQUIRED" });
    if (request.signal.aborted) return reply({ status: "UNAVAILABLE" });
    if (request.method === "GET") {
      const revisionId = url.searchParams.get("revisionId") ?? "";
      if (!UUID.test(revisionId) || [...url.searchParams.keys()].length !== 1) return reply({ status: "INVALID_REQUEST" });
      const result = parseExportHistoryList(await binding.list({ request, canonicalId, revisionId }), { canonicalId, revisionId });
      return reply(request.signal.aborted ? { status: "UNAVAILABLE" } : result ?? { status: "UNAVAILABLE" });
    }
    if (request.method !== "POST" || url.search || request.headers.get("origin") !== url.origin ||
        !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return reply({ status: "INVALID_REQUEST" });
    const attemptId = request.headers.get("idempotency-key") ?? "";
    if (!UUID.test(attemptId)) return reply({ status: "INVALID_REQUEST" });
    const report = parseExportHistoryReport(await readBoundedJson(request));
    if (!report) return reply({ status: "INVALID_REQUEST" });
    if (request.signal.aborted) return reply({ status: "UNAVAILABLE" });
    const result = parseExportHistoryReceipt(await binding.record({ request, canonicalId, attemptId, report }), { canonicalId, attemptId, report });
    return reply(request.signal.aborted ? { status: "UNAVAILABLE" } : result ?? { status: "UNAVAILABLE" });
  } catch { return reply({ status: "UNAVAILABLE" }); }
}
async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) return;
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1024 || request.signal.aborted) { await reader.cancel(); return; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { return; } finally { reader.releaseLock(); }
}
function reply(result: ExportHistoryList | ExportHistoryReceipt) {
  return Response.json(result, { status: EXPORT_HISTORY_HTTP[result.status], headers: {
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
}
