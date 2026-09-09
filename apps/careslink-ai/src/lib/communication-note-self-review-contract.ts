import { COMMUNICATION_NOTE_DOCUMENT_API_PATH } from "./communication-note-document-contract";

export const SELF_REVIEW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type CommunicationNoteSelfReviewRequest = Readonly<{
  revisionId: string;
  factsConfirmed: true;
  wordingConfirmed: true;
  missingFactsReviewed: true;
}>;
export type CommunicationNoteSelfReviewResult =
  | Readonly<{
      status: "CONFIRMED";
      canonicalId: string;
      revisionId: string;
      mutationId: string;
      saveState: "SERVER_ACKNOWLEDGED";
      draftNotice: "Draft – review required";
    }>
  | Readonly<{ status: "AUTH_REQUIRED" | "NOT_FOUND" | "STALE_REVISION" | "INVALID_REQUEST" | "UNAVAILABLE" }>;

export const SELF_REVIEW_HTTP_STATUS = {
  CONFIRMED: 200, AUTH_REQUIRED: 401, NOT_FOUND: 404,
  STALE_REVISION: 409, INVALID_REQUEST: 400, UNAVAILABLE: 503,
} as const;

export function buildCommunicationNoteSelfReviewHref(canonicalId: string) {
  return `${COMMUNICATION_NOTE_DOCUMENT_API_PATH}/${encodeURIComponent(canonicalId)}/self-review`;
}

export function hasExactSelfReviewKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function parseCommunicationNoteSelfReviewRequest(value: unknown): CommunicationNoteSelfReviewRequest | undefined {
  if (!hasExactSelfReviewKeys(value, ["revisionId", "factsConfirmed", "wordingConfirmed", "missingFactsReviewed"]) ||
      typeof value.revisionId !== "string" || !SELF_REVIEW_UUID.test(value.revisionId) ||
      value.factsConfirmed !== true || value.wordingConfirmed !== true || value.missingFactsReviewed !== true) return;
  return { revisionId: value.revisionId, factsConfirmed: true, wordingConfirmed: true, missingFactsReviewed: true };
}

/** Reject extra fields and bind the receipt to this exact user-triggered write. */
export function parseCommunicationNoteSelfReviewResult(value: unknown, expected: Readonly<{
  canonicalId: string; revisionId: string; mutationId: string;
}>): CommunicationNoteSelfReviewResult | undefined {
  if (hasExactSelfReviewKeys(value, ["status"]) && typeof value.status === "string" &&
      ["AUTH_REQUIRED", "NOT_FOUND", "STALE_REVISION", "INVALID_REQUEST", "UNAVAILABLE"].includes(value.status)) {
    return { status: value.status } as Exclude<CommunicationNoteSelfReviewResult, { status: "CONFIRMED" }>;
  }
  if (!hasExactSelfReviewKeys(value, ["status", "canonicalId", "revisionId", "mutationId", "saveState", "draftNotice"]) ||
      value.status !== "CONFIRMED" || value.canonicalId !== expected.canonicalId ||
      value.revisionId !== expected.revisionId || value.mutationId !== expected.mutationId ||
      value.saveState !== "SERVER_ACKNOWLEDGED" || value.draftNotice !== "Draft – review required") return;
  return { status: "CONFIRMED", ...expected, saveState: "SERVER_ACKNOWLEDGED", draftNotice: "Draft – review required" };
}
