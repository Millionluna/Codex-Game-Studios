import "server-only";
import { parseCommunicationNoteDraftCursor, parseCommunicationNoteSavedDrafts } from "./communication-note-saved-drafts";
import type { CaresLinkV1ListDocumentsRequest, CaresLinkV1ListDocumentsResponse } from "./v1/transport-contract";

/** The injected Product API has already resolved a fresh cookie principal and
 * validates the RPC metadata. No owner, page size, SQL or body comes from UI.
 * One bounded RPC page: filtering never discards its continuation cursor. */
export async function readCommunicationNoteDraftCatalog(
  list: (page: CaresLinkV1ListDocumentsRequest) => Promise<CaresLinkV1ListDocumentsResponse>,
  after: string | null = null,
) {
  const cursor = parseCommunicationNoteDraftCursor(after);
  const page = await list({ limit: 20, ...(cursor ? { cursor } : {}) });
  const next = parseCommunicationNoteDraftCursor(page.nextCursor);
  if (page.documents.length > 20 || typeof page.hasMore !== "boolean" || page.hasMore !== (next !== null) ||
    (next && (page.documents.length !== 20 || next !== "document.v1:" + page.documents.at(-1)!.canonicalId)) ||
    page.documents.some((d, i) => (cursor && d.canonicalId <= cursor.slice(12)) ||
      (i > 0 && d.canonicalId <= page.documents[i - 1].canonicalId))) throw new Error("Draft catalog unavailable");
  const documents = page.documents.filter(d => d.noteType === "communication" && d.deletedAt === null &&
    !["TOMBSTONED", "PURGED"].includes(d.lifecycleStatus) && d.currentRevisionId !== null)
    .map(d => ({ canonicalId: d.canonicalId, revisionNumber: d.currentRevisionNumber, sourceLocale: d.sourceLocale, updatedAt: d.updatedAt }));
  const parsed = parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", documents, documentsCursor: next,
    taskPage: { tasks: [], nextCursor: null } }, "MULTI", null, cursor);
  if (parsed.status !== "AVAILABLE") throw new Error("Draft catalog unavailable");
  return Object.freeze({ documents: parsed.documents, documentsCursor: next });
}
