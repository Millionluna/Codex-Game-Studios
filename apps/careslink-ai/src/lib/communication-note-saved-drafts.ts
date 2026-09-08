import { encodeCommunicationNoteTaskCursor, parseCommunicationNoteTaskPage, type CommunicationNoteTaskCursor,
  type CommunicationNoteTaskPage } from "./communication-note-task-list";
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
  | Readonly<{ status: "AVAILABLE"; documents: readonly CommunicationNoteSavedDraft[]; task?: CommunicationNoteWorkspaceTask | null; taskPage?: CommunicationNoteTaskPage }>
  | Readonly<{ status: "AUTH_REQUIRED" }>
  | Readonly<{ status: "UNAVAILABLE" }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const invalid = () => new Error("Saved draft list unavailable");
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw invalid();
  return value as Record<string, unknown>;
}
export function parseCommunicationNoteSavedDrafts(httpStatus: number, value: unknown, includeTask: boolean | "MULTI" = false,
  before: CommunicationNoteTaskCursor | null = null): CommunicationNoteSavedDraftsResult {
  if (!value || typeof value !== "object" || !("status" in value)) throw invalid();
  if (value.status === "AUTH_REQUIRED" || value.status === "UNAVAILABLE") {
    record(value, ["status"]);
    if (httpStatus !== (value.status === "AUTH_REQUIRED" ? 401 : 503)) throw invalid();
    return Object.freeze({ status: value.status });
  }
  const data = record(value, includeTask === "MULTI" ? ["status", "documents", "taskPage"] : includeTask ? ["status", "documents", "task"] : ["status", "documents"]);
  if (httpStatus !== 200 || data.status !== "AVAILABLE" || !Array.isArray(data.documents) || data.documents.length > 100) throw invalid();
  const documents = data.documents.map(value => {
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
    ...(includeTask === "MULTI" ? { taskPage: parseCommunicationNoteTaskPage(data.taskPage, before) } : includeTask ? { task } : {}) });
}

export async function loadCommunicationNoteSavedDrafts(signal: AbortSignal,
  fetcher: typeof fetch = fetch, includeTask: boolean | "MULTI" = false,
  before: CommunicationNoteTaskCursor | null = null): Promise<CommunicationNoteSavedDraftsResult> {
  if (before !== null && includeTask !== "MULTI") throw invalid();
  const response = await fetcher(COMMUNICATION_NOTE_SAVED_DRAFTS_API + (before ? "?before=" + encodeURIComponent(encodeCommunicationNoteTaskCursor(before)) : ""), {
    method: "GET", credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json" }, signal,
  });
  return parseCommunicationNoteSavedDrafts(response.status, await response.json(), includeTask, before);
}
