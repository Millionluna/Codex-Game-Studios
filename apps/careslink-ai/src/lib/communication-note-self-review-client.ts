import {
  buildCommunicationNoteSelfReviewHref, parseCommunicationNoteSelfReviewRequest,
  parseCommunicationNoteSelfReviewResult, SELF_REVIEW_HTTP_STATUS, SELF_REVIEW_UUID,
  type CommunicationNoteSelfReviewRequest, type CommunicationNoteSelfReviewResult,
} from "./communication-note-self-review-contract";

export async function confirmCommunicationNoteSelfReview(input: Readonly<{
  canonicalId: string;
  mutationId: string;
  request: CommunicationNoteSelfReviewRequest;
  signal: AbortSignal;
  fetcher?: (url: string, init: RequestInit) => Promise<Pick<Response, "json" | "status">>;
}>): Promise<CommunicationNoteSelfReviewResult> {
  const request = parseCommunicationNoteSelfReviewRequest(input.request);
  if (!request || !SELF_REVIEW_UUID.test(input.canonicalId) || !SELF_REVIEW_UUID.test(input.mutationId)) {
    return { status: "INVALID_REQUEST" };
  }
  try {
    if (input.signal.aborted) return { status: "UNAVAILABLE" };
    const response = await (input.fetcher ?? fetch)(buildCommunicationNoteSelfReviewHref(input.canonicalId), {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": input.mutationId },
      body: JSON.stringify(request), signal: input.signal,
    });
    const result = parseCommunicationNoteSelfReviewResult(await response.json(), {
      canonicalId: input.canonicalId, revisionId: request.revisionId, mutationId: input.mutationId,
    });
    if (input.signal.aborted || !result || response.status !== SELF_REVIEW_HTTP_STATUS[result.status]) return { status: "UNAVAILABLE" };
    return result;
  } catch {
    // A failed/lost response is not proof that the server did not commit.
    return { status: "UNAVAILABLE" };
  }
}
