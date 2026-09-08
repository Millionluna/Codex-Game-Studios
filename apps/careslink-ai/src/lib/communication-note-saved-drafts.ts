import { encodeCommunicationNoteTaskCursor, parseCommunicationNoteTaskPage, type CommunicationNoteTaskCursor,
  type CommunicationNoteTaskPage, taskListRecord } from "./communication-note-task-list";
/** Metadata only. No document text, review approval, Points or write commands. */
export const COMMUNICATION_NOTE_SAVED_DRAFTS_API = "/api/ai-documents/communication-note/documents";
export type CommunicationNoteSavedDraft = Readonly<{
  canonicalId: string;
  revisionNumber: number;
  sourceLocale: "en" | "zh-Hans" | "zh-Hant";
  updatedAt: string;
}>;
export type CommunicationNoteWorkspaceTask = Readonly<{
  jobId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}>;
export type CommunicationNoteSavedDraftsResult =
  | Readonly<{ status: "AVAILABLE"; documents: readonly CommunicationNoteSavedDraft[]; documentsCursor?: string | null; task?: CommunicationNoteWorkspaceTask | null; taskPage?: CommunicationNoteTaskPage }>
  | Readonly<{ status: "AUTH_REQUIRED" }>
  | Readonly<{ status: "UNAVAILABLE" }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const invalid = () => new Error("Saved draft list unavailable");
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return taskListRecord(value, keys);
}
/** Position only, not a document owner or a permission. */
export function parseCommunicationNoteDraftCursor(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.startsWith("document.v1:") || !UUID.test(value.slice(12))) throw invalid();
  return value;
}
export function parseCommunicationNoteSavedDrafts(httpStatus: number, value: unknown, includeTask: boolean | "MULTI" = false,
  before: CommunicationNoteTaskCursor | null = null, draftAfter: string | null = null): CommunicationNoteSavedDraftsResult {
  if (!value || typeof value !== "object" || !("status" in value)) throw invalid();
  if (value.status === "AUTH_REQUIRED" || value.status === "UNAVAILABLE") {
    record(value, ["status"]);
    if (httpStatus !== (value.status === "AUTH_REQUIRED" ? 401 : 503)) throw invalid();
    return Object.freeze({ status: value.status });
  }
  const data = record(value, includeTask === "MULTI" ? ["status", "documents", "documentsCursor", "taskPage"] : includeTask ? ["status", "documents", "task"] : ["status", "documents"]);
  if (httpStatus !== 200 || data.status !== "AVAILABLE" || !Array.isArray(data.documents) || data.documents.length > (includeTask === "MULTI" ? 20 : 100) ||
    Reflect.ownKeys(data.documents).length !== data.documents.length + 1) throw invalid();
  const documents = Array.from({ length: data.documents.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(data.documents, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw invalid();
    const value = descriptor.value;
    const d = record(value, ["canonicalId", "revisionNumber", "sourceLocale", "updatedAt"]);
    if (typeof d.canonicalId !== "string" || !UUID.test(d.canonicalId) ||
        !Number.isSafeInteger(d.revisionNumber) || Number(d.revisionNumber) < 1 ||
        typeof d.sourceLocale !== "string" || !["en", "zh-Hans", "zh-Hant"].includes(d.sourceLocale) ||
        typeof d.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(d.updatedAt) ||
        !Number.isFinite(Date.parse(d.updatedAt))) throw invalid();
    return Object.freeze({ canonicalId: d.canonicalId, revisionNumber: Number(d.revisionNumber),
      sourceLocale: d.sourceLocale as CommunicationNoteSavedDraft["sourceLocale"], updatedAt: d.updatedAt });
  });
  if (new Set(documents.map(d => d.canonicalId)).size !== documents.length) throw invalid();
  let documentsCursor: string | null = null;
  if (includeTask === "MULTI") {
    const afterId = parseCommunicationNoteDraftCursor(draftAfter)?.slice(12);
    documentsCursor = parseCommunicationNoteDraftCursor(data.documentsCursor);
    const nextId = documentsCursor?.slice(12);
    // A filtered page may be sparse or empty; the server cursor still moves
    // across the underlying metadata page (including other note types).
    if (documents.some((d, i) => (afterId && d.canonicalId <= afterId) ||
      (i > 0 && d.canonicalId <= documents[i - 1].canonicalId) || (nextId && d.canonicalId > nextId)) ||
      (nextId && afterId && nextId <= afterId)) throw invalid();
  } else if (draftAfter !== null) throw invalid();
  let task: CommunicationNoteWorkspaceTask | null = null;
  if (includeTask === true && data.task !== null) {
    const t = record(data.task, ["jobId", "status", "createdAt", "updatedAt"]);
    if (typeof t.jobId !== "string" || !UUID.test(t.jobId) || typeof t.status !== "string" ||
        !["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"].includes(t.status) ||
        [t.createdAt, t.updatedAt].some(time => typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(time) || !Number.isFinite(Date.parse(time))) ||
        Date.parse(String(t.updatedAt)) < Date.parse(String(t.createdAt))) throw invalid();
    task = Object.freeze({ jobId: t.jobId, status: t.status as CommunicationNoteWorkspaceTask["status"],
      createdAt: String(t.createdAt), updatedAt: String(t.updatedAt) });
  }
  return Object.freeze({ status: "AVAILABLE", documents: Object.freeze(documents),
    ...(includeTask === "MULTI" ? { documentsCursor, taskPage: parseCommunicationNoteTaskPage(data.taskPage, before) } : includeTask ? { task } : {}) });
}

export async function loadCommunicationNoteSavedDrafts(signal: AbortSignal,
  fetcher: typeof fetch = fetch, includeTask: boolean | "MULTI" = false,
  before: CommunicationNoteTaskCursor | null = null, draftAfter: string | null = null): Promise<CommunicationNoteSavedDraftsResult> {
  if ((before !== null || draftAfter !== null) && includeTask !== "MULTI") throw invalid();
  const query = new URLSearchParams();
  if (before) query.set("before", encodeCommunicationNoteTaskCursor(before));
  if (draftAfter !== null) query.set("draftAfter", parseCommunicationNoteDraftCursor(draftAfter)!);
  const response = await fetcher(COMMUNICATION_NOTE_SAVED_DRAFTS_API + (query.size ? "?" + query : ""), {
    method: "GET", credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json" }, signal,
  });
  return parseCommunicationNoteSavedDrafts(response.status, await response.json(), includeTask, before, draftAfter);
}
