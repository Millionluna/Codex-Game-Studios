import { COMMUNICATION_NOTE_DOCUMENT_API_PATH } from "./communication-note-document-contract";
import { COMMUNICATION_NOTE_TEXT_TEMPLATE } from "./communication-note-export";
import { hasExactSelfReviewKeys as exactKeys, SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";

// Browser observations, deliberately NOT the legacy artifact lifecycle's
// DOWNLOADED/SHARED states. None is a saved-file receipt or clinical approval.
export type ExportHistoryFormat = "COPY" | "TXT" | "DOCX" | "PDF";
export type ExportHistoryOutcome = "COPY_REPORTED" | "DOWNLOAD_INITIATED" | "FAILED";
export type ExportHistoryReport = Readonly<{
  revisionId: string; format: ExportHistoryFormat; outcome: ExportHistoryOutcome;
  startedAt: string; // Untrusted device time, labelled as such in the UI.
}>;
export type ExportHistoryEntry = ExportHistoryReport & Readonly<{
  attemptId: string; revisionNumber: number; recordedAt: string;
  templateVersion: typeof COMMUNICATION_NOTE_TEXT_TEMPLATE; profile: "RECORD_COPY";
}>;
export type ExportHistoryStorage = "PROCESS_MEMORY_ONLY" | "DURABLE";
export type ExportHistoryFailure = Readonly<{ status:
  "AUTH_REQUIRED" | "NOT_FOUND" | "STALE_REVISION" | "REVIEW_REQUIRED" | "INVALID_REQUEST" | "UNAVAILABLE" }>;
export type ExportHistoryReceipt = ExportHistoryFailure | Readonly<{
  status: "RECORDED"; canonicalId: string; storage: ExportHistoryStorage; entry: ExportHistoryEntry;
}>;
export type ExportHistoryList = ExportHistoryFailure | Readonly<{
  status: "AVAILABLE"; canonicalId: string; revisionId: string; storage: ExportHistoryStorage;
  entries: readonly ExportHistoryEntry[]; hasMore: boolean;
}>;
export const EXPORT_HISTORY_LIMIT = 20;
export const EXPORT_HISTORY_HTTP = {
  RECORDED: 200, AVAILABLE: 200, AUTH_REQUIRED: 401, NOT_FOUND: 404,
  STALE_REVISION: 409, REVIEW_REQUIRED: 409, INVALID_REQUEST: 400, UNAVAILABLE: 503,
} as const;
export function buildExportHistoryHref(canonicalId: string, revisionId?: string) {
  const path = `${COMMUNICATION_NOTE_DOCUMENT_API_PATH}/${encodeURIComponent(canonicalId)}/export-history`;
  return revisionId ? `${path}?revisionId=${encodeURIComponent(revisionId)}` : path;
}
function iso(value: unknown): value is string {
  return typeof value === "string" && /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function reportFields(value: Record<string, unknown>): ExportHistoryReport | undefined {
  if (typeof value.revisionId !== "string" || !UUID.test(value.revisionId) || !iso(value.startedAt) ||
      typeof value.format !== "string" || !["COPY", "TXT", "DOCX", "PDF"].includes(value.format) ||
      !(value.outcome === "FAILED" || (value.format === "COPY" ? value.outcome === "COPY_REPORTED" : value.outcome === "DOWNLOAD_INITIATED"))) return;
  return { revisionId: value.revisionId, format: value.format as ExportHistoryFormat,
    outcome: value.outcome as ExportHistoryOutcome, startedAt: value.startedAt };
}
export function parseExportHistoryReport(value: unknown): ExportHistoryReport | undefined {
  return exactKeys(value, ["revisionId", "format", "outcome", "startedAt"]) ? reportFields(value) : undefined;
}
function entry(value: unknown, revisionId: string): ExportHistoryEntry | undefined {
  if (!exactKeys(value, ["revisionId", "format", "outcome", "startedAt", "attemptId", "revisionNumber", "recordedAt", "templateVersion", "profile"])) return;
  const report = reportFields(value);
  if (!report || report.revisionId !== revisionId || typeof value.attemptId !== "string" || !UUID.test(value.attemptId) ||
      !Number.isSafeInteger(value.revisionNumber) || Number(value.revisionNumber) < 1 || Number(value.revisionNumber) > 2147483647 ||
      !iso(value.recordedAt) || value.templateVersion !== COMMUNICATION_NOTE_TEXT_TEMPLATE || value.profile !== "RECORD_COPY") return;
  return { ...report, attemptId: value.attemptId, revisionNumber: value.revisionNumber as number,
    recordedAt: value.recordedAt, templateVersion: COMMUNICATION_NOTE_TEXT_TEMPLATE, profile: "RECORD_COPY" };
}
function failure(value: unknown): ExportHistoryFailure | undefined {
  if (exactKeys(value, ["status"]) && typeof value.status === "string" &&
      ["AUTH_REQUIRED", "NOT_FOUND", "STALE_REVISION", "REVIEW_REQUIRED", "INVALID_REQUEST", "UNAVAILABLE"].includes(value.status)) {
    return { status: value.status as ExportHistoryFailure["status"] };
  }
}
function storage(value: unknown): value is ExportHistoryStorage { return value === "PROCESS_MEMORY_ONLY" || value === "DURABLE"; }
export function parseExportHistoryReceipt(value: unknown, expected: Readonly<{
  canonicalId: string; attemptId: string; report: ExportHistoryReport;
}>): ExportHistoryReceipt | undefined {
  const denied = failure(value); if (denied) return denied;
  if (!exactKeys(value, ["status", "canonicalId", "storage", "entry"]) || value.status !== "RECORDED" ||
      value.canonicalId !== expected.canonicalId || !storage(value.storage)) return;
  const item = entry(value.entry, expected.report.revisionId);
  if (!item || item.attemptId !== expected.attemptId || item.format !== expected.report.format ||
      item.outcome !== expected.report.outcome || item.startedAt !== expected.report.startedAt) return;
  return { status: "RECORDED", canonicalId: expected.canonicalId, storage: value.storage, entry: item };
}
export function parseExportHistoryList(value: unknown, expected: Readonly<{ canonicalId: string; revisionId: string }>): ExportHistoryList | undefined {
  const denied = failure(value); if (denied) return denied;
  if (!exactKeys(value, ["status", "canonicalId", "revisionId", "storage", "entries", "hasMore"]) ||
      value.status !== "AVAILABLE" || value.canonicalId !== expected.canonicalId || value.revisionId !== expected.revisionId ||
      !storage(value.storage) || !Array.isArray(value.entries) || value.entries.length > EXPORT_HISTORY_LIMIT ||
      typeof value.hasMore !== "boolean" || (value.hasMore && value.entries.length !== EXPORT_HISTORY_LIMIT)) return;
  const items: ExportHistoryEntry[] = [];
  for (const candidate of value.entries) {
    const item = entry(candidate, expected.revisionId);
    const previous = items.at(-1);
    if (!item || items.some(old => old.attemptId === item.attemptId) || (previous &&
        (item.revisionNumber !== previous.revisionNumber || item.recordedAt > previous.recordedAt ||
          (item.recordedAt === previous.recordedAt && item.attemptId > previous.attemptId)))) return;
    items.push(item);
  }
  return { status: "AVAILABLE", canonicalId: expected.canonicalId, revisionId: expected.revisionId,
    storage: value.storage, entries: items, hasMore: value.hasMore };
}
