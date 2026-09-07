import type { CommunicationNoteAvailableDocument } from "./communication-note-document-contract";
import { loadCommunicationNoteDocument } from "./communication-note-document-client";

export const COMMUNICATION_NOTE_TEXT_TEMPLATE = "communication-record-text.2026-09-08.1";
export type CommunicationNoteTextExport = Readonly<{
  text: string; filename: string; templateVersion: typeof COMMUNICATION_NOTE_TEXT_TEMPLATE;
  profile: "RECORD_COPY";
}>;
export type CommunicationNoteExportErrorCode =
  | "AUTH_REQUIRED" | "NOT_FOUND" | "STALE_REVISION" | "REVIEW_REQUIRED"
  | "UNAVAILABLE" | "PLAIN_TEXT_REQUIRED" | "COPY_FAILED" | "DOWNLOAD_FAILED" | "PDF_UNSUPPORTED_TEXT" | "PDF_TOO_LARGE";
export class CommunicationNoteExportError extends Error {
  constructor(readonly code: CommunicationNoteExportErrorCode) {
    super(code); this.name = "CommunicationNoteExportError";
  }
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** Shared Record copy renderer. Explicit fields only, never serialize a snapshot.
 * No bilingual/internal-review profile, storage, telemetry, Points or AI calls. */
export function renderCommunicationNoteRecordCopy(
  saved: CommunicationNoteAvailableDocument, exportedAt: string,
): CommunicationNoteTextExport {
  if (!saved.isCurrentRevision) throw new CommunicationNoteExportError("STALE_REVISION");
  if (saved.selfReviewStatus !== "CONFIRMED") throw new CommunicationNoteExportError("REVIEW_REQUIRED");
  if (saved.status !== "AVAILABLE" || saved.noteType !== "communication" ||
      saved.saveState !== "SERVER_ACKNOWLEDGED" || saved.draftNotice !== "Draft – review required" ||
      !UUID.test(saved.canonicalId) || !UUID.test(saved.revision.revisionId) ||
      saved.currentRevisionId !== saved.revision.revisionId ||
      !Number.isSafeInteger(saved.revision.revisionNumber) || saved.revision.revisionNumber < 1 ||
      saved.revision.revisionNumber > 2147483647) throw new CommunicationNoteExportError("UNAVAILABLE");
  const created = isoDate(saved.revision.createdAt), exported = isoDate(exportedAt);
  const draft = saved.revision.content.englishDraft;
  // Do not silently rewrite saved wording to remove formatting. Formatted or
  // control-bearing source must be edited and reviewed before this plain profile.
  if (typeof draft !== "string" || !draft.trim() || new TextEncoder().encode(draft).length > 64 * 1024 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff\ufffe\uffff\u202a-\u202e\u2066-\u2069]/u.test(draft) ||
      /`|~~|^\s{0,3}#{1,6}\s|\*\*|__|(^|\W)(?:\*[^*\n]+\*|_[^_\n]+_)(?=\W|$)|!?\[[^\]\n]*\]\([^\n]*\)|<\/?[a-z][^>]*>/imu.test(draft)) {
    throw new CommunicationNoteExportError("PLAIN_TEXT_REQUIRED");
  }
  const version = saved.revision.revisionNumber;
  return Object.freeze({
    templateVersion: COMMUNICATION_NOTE_TEXT_TEMPLATE, profile: "RECORD_COPY",
    filename: `communication-note_${created.slice(0, 10)}_${saved.canonicalId.slice(0, 8)}_v${version}.txt`,
    text: ["CaresLink AI", "Communication Note", "Draft – review required", `Version: ${version}`,
      `Revision saved (UTC): ${created}`, `Exported (device time, UTC): ${exported}`, "Language: English",
      "Self-review: confirmed by the document owner. This is not approval by CaresLink.", "", draft, "",
      "Static copy: changes to this copy do not sync to CaresLink. External copies cannot be recalled.",
      "Check this draft before using it in your organisation's authorised record system.", ""].join("\n"),
  });
}

/** One fresh, exact-revision Cookie read for each user action. No stale fallback. */
export async function prepareCommunicationNoteRecordCopy(input: Readonly<{
  saved: CommunicationNoteAvailableDocument; signal: AbortSignal;
  load?: typeof loadCommunicationNoteDocument; now?: () => string;
}>): Promise<CommunicationNoteTextExport> {
  assertExportActive(input.signal);
  const { saved } = input;
  if (!saved.isCurrentRevision) throw new CommunicationNoteExportError("STALE_REVISION");
  if (saved.selfReviewStatus !== "CONFIRMED") throw new CommunicationNoteExportError("REVIEW_REQUIRED");
  try {
    const fresh = await (input.load ?? loadCommunicationNoteDocument)({
      canonicalId: saved.canonicalId, revisionId: saved.revision.revisionId, signal: input.signal,
    });
    assertExportActive(input.signal);
    if (fresh.status === "AUTH_REQUIRED" || fresh.status === "NOT_FOUND") throw new CommunicationNoteExportError(fresh.status);
    if (fresh.status !== "AVAILABLE") throw new CommunicationNoteExportError("UNAVAILABLE");
    if (!fresh.isCurrentRevision) throw new CommunicationNoteExportError("STALE_REVISION");
    if (fresh.canonicalId !== saved.canonicalId || fresh.revision.revisionId !== saved.revision.revisionId ||
        fresh.revision.revisionNumber !== saved.revision.revisionNumber ||
        fresh.revision.contentHash !== saved.revision.contentHash ||
        fresh.revision.content.englishDraft !== saved.revision.content.englishDraft) {
      throw new CommunicationNoteExportError("UNAVAILABLE");
    }
    return renderCommunicationNoteRecordCopy(fresh, (input.now ?? (() => new Date().toISOString()))());
  } catch (error) {
    if (error instanceof CommunicationNoteExportError) throw error;
    throw new CommunicationNoteExportError("UNAVAILABLE");
  }
}

export function assertExportActive(signal: AbortSignal) {
  if (signal.aborted) throw new CommunicationNoteExportError("UNAVAILABLE");
}
function isoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new CommunicationNoteExportError("UNAVAILABLE");
  return new Date(value).toISOString();
}
