import { SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";
import { buildExportHistoryHref, EXPORT_HISTORY_HTTP, parseExportHistoryList, parseExportHistoryReceipt, parseExportHistoryReport,
  type ExportHistoryList, type ExportHistoryReceipt, type ExportHistoryReport,
} from "./communication-note-export-history-contract";
type Fetcher = (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;
type Scope = Readonly<{ canonicalId: string; signal: AbortSignal; fetcher?: Fetcher }>;
const unavailable = { status: "UNAVAILABLE" } as const;

export async function recordExportHistory(input: Scope & Readonly<{ attemptId: string; report: ExportHistoryReport }>): Promise<ExportHistoryReceipt> {
  const report = parseExportHistoryReport(input.report);
  if (!report || !UUID.test(input.canonicalId) || !UUID.test(input.attemptId)) return { status: "INVALID_REQUEST" };
  return bounded(input.signal, async signal => {
    const response = await (input.fetcher ?? fetch)(buildExportHistoryHref(input.canonicalId), {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": input.attemptId },
      body: JSON.stringify(report),
    });
    const result = parseExportHistoryReceipt(await response.json(), { ...input, report });
    return result && response.status === EXPORT_HISTORY_HTTP[result.status] ? result : unavailable;
  });
}
export async function loadExportHistory(input: Scope & Readonly<{ revisionId: string }>): Promise<ExportHistoryList> {
  if (!UUID.test(input.canonicalId) || !UUID.test(input.revisionId)) return { status: "INVALID_REQUEST" };
  return bounded(input.signal, async signal => {
    const response = await (input.fetcher ?? fetch)(buildExportHistoryHref(input.canonicalId, input.revisionId), {
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal,
      headers: { Accept: "application/json" },
    });
    const result = parseExportHistoryList(await response.json(), input);
    return result && response.status === EXPORT_HISTORY_HTTP[result.status] ? result : unavailable;
  });
}
// Logging is a bounded side effect: never leave the export buttons busy forever,
// never retry/re-export automatically, and ignore late responses after access loss.
async function bounded<T>(parent: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T | typeof unavailable> {
  if (parent.aborted) return unavailable;
  const controller = new AbortController();
  const abort = () => controller.abort(); parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 5000);
  let abortListener: (() => void) | undefined;
  try {
    const cancelled = new Promise<typeof unavailable>(resolve => {
      abortListener = () => resolve(unavailable); controller.signal.addEventListener("abort", abortListener, { once: true });
    });
    const result = await Promise.race([run(controller.signal), cancelled]);
    return controller.signal.aborted || parent.aborted ? unavailable : result;
  } catch { return unavailable; }
  finally {
    clearTimeout(timer); parent.removeEventListener("abort", abort);
    if (abortListener) controller.signal.removeEventListener("abort", abortListener);
  }
}
