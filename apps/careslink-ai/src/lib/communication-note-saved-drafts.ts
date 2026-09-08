/** Metadata only. No document text, review approval, Points or write commands. */
export const COMMUNICATION_NOTE_SAVED_DRAFTS_API = "/api/ai-documents/communication-note/documents";
export type CommunicationNoteSavedDraft = Readonly<{
  canonicalId: string;
  revisionNumber: number;
  sourceLocale: "en" | "zh-Hans" | "zh-Hant";
  updatedAt: string;
}>;
export type CommunicationNoteSavedDraftsResult =
  | Readonly<{ status: "AVAILABLE"; documents: readonly CommunicationNoteSavedDraft[] }>
  | Readonly<{ status: "AUTH_REQUIRED" }>
  | Readonly<{ status: "UNAVAILABLE" }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const invalid = () => new Error("Saved draft list unavailable");
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw invalid();
  return value as Record<string, unknown>;
}
export function parseCommunicationNoteSavedDrafts(httpStatus: number, value: unknown): CommunicationNoteSavedDraftsResult {
  if (!value || typeof value !== "object" || !("status" in value)) throw invalid();
  if (value.status === "AUTH_REQUIRED" || value.status === "UNAVAILABLE") {
    record(value, ["status"]);
    if (httpStatus !== (value.status === "AUTH_REQUIRED" ? 401 : 503)) throw invalid();
    return Object.freeze({ status: value.status });
  }
  const data = record(value, ["status", "documents"]);
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
  return Object.freeze({ status: "AVAILABLE", documents: Object.freeze(documents) });
}

export async function loadCommunicationNoteSavedDrafts(signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<CommunicationNoteSavedDraftsResult> {
  const response = await fetcher(COMMUNICATION_NOTE_SAVED_DRAFTS_API, {
    method: "GET", credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json" }, signal,
  });
  return parseCommunicationNoteSavedDrafts(response.status, await response.json());
}
