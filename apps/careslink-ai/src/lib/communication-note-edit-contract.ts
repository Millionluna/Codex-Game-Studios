import { COMMUNICATION_NOTE_DOCUMENT_API_PATH } from "./communication-note-document-contract";
import { hasExactSelfReviewKeys as exact, SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";

export const COMMUNICATION_NOTE_EDIT_TEXT_LIMIT = 8000;
export type CommunicationNoteEditRequest = Readonly<{
  baseRevisionId: string;
  englishDraft: string;
  reviewVersions: Readonly<{ "zh-Hans": string; "zh-Hant": string }>;
  wordingConfirmed: true;
}>;
export type CommunicationNoteEditResult =
  | Readonly<{ status: "SAVED"; canonicalId: string; baseRevisionId: string; revisionId: string;
      revisionNumber: number; mutationId: string; saveState: "SERVER_ACKNOWLEDGED";
      selfReviewStatus: "REQUIRED"; draftNotice: "Draft – review required" }>
  | Readonly<{ status: "AUTH_REQUIRED" | "NOT_FOUND" | "STALE_REVISION" | "INVALID_REQUEST" | "PRIVACY_REVIEW_REQUIRED" | "UNAVAILABLE" }>;
export const EDIT_HTTP_STATUS = { SAVED: 200, AUTH_REQUIRED: 401, NOT_FOUND: 404, STALE_REVISION: 409,
  INVALID_REQUEST: 400, PRIVACY_REVIEW_REQUIRED: 422, UNAVAILABLE: 503 } as const;
export const buildCommunicationNoteEditHref = (id: string) => `${COMMUNICATION_NOTE_DOCUMENT_API_PATH}/${encodeURIComponent(id)}/revisions`;

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= COMMUNICATION_NOTE_EDIT_TEXT_LIMIT &&
    new TextEncoder().encode(value).byteLength <= 16000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}
export function parseCommunicationNoteEditRequest(value: unknown): CommunicationNoteEditRequest | undefined {
  if (!exact(value, ["baseRevisionId", "englishDraft", "reviewVersions", "wordingConfirmed"]) ||
      typeof value.baseRevisionId !== "string" || !UUID.test(value.baseRevisionId) || !validText(value.englishDraft) ||
      !exact(value.reviewVersions, ["zh-Hans", "zh-Hant"]) || !validText(value.reviewVersions["zh-Hans"]) ||
      !validText(value.reviewVersions["zh-Hant"]) || value.wordingConfirmed !== true) return;
  return { baseRevisionId: value.baseRevisionId, englishDraft: value.englishDraft,
    reviewVersions: { "zh-Hans": value.reviewVersions["zh-Hans"], "zh-Hant": value.reviewVersions["zh-Hant"] }, wordingConfirmed: true };
}
export function parseCommunicationNoteEditResult(value: unknown, expected: Readonly<{
  canonicalId: string; baseRevisionId: string; mutationId: string; baseRevisionNumber: number;
}>): CommunicationNoteEditResult | undefined {
  if (exact(value, ["status"]) && typeof value.status === "string" && value.status !== "SAVED" &&
      Object.hasOwn(EDIT_HTTP_STATUS, value.status)) return { status: value.status } as CommunicationNoteEditResult;
  if (!exact(value, ["status", "canonicalId", "baseRevisionId", "revisionId", "revisionNumber", "mutationId", "saveState", "selfReviewStatus", "draftNotice"]) ||
      value.status !== "SAVED" || value.canonicalId !== expected.canonicalId || value.baseRevisionId !== expected.baseRevisionId ||
      value.mutationId !== expected.mutationId || typeof value.revisionId !== "string" || !UUID.test(value.revisionId) ||
      value.revisionId === expected.baseRevisionId || value.revisionNumber !== expected.baseRevisionNumber + 1 ||
      !Number.isSafeInteger(value.revisionNumber) || value.saveState !== "SERVER_ACKNOWLEDGED" ||
      value.selfReviewStatus !== "REQUIRED" || value.draftNotice !== "Draft – review required") return;
  return { status: "SAVED", canonicalId: expected.canonicalId, baseRevisionId: expected.baseRevisionId,
    mutationId: expected.mutationId, revisionId: value.revisionId, revisionNumber: value.revisionNumber as number,
    saveState: "SERVER_ACKNOWLEDGED", selfReviewStatus: "REQUIRED", draftNotice: "Draft – review required" };
}
