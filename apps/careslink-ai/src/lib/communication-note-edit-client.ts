import { buildCommunicationNoteEditHref, EDIT_HTTP_STATUS, parseCommunicationNoteEditRequest, parseCommunicationNoteEditResult,
  type CommunicationNoteEditRequest, type CommunicationNoteEditResult } from "./communication-note-edit-contract";
import { SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";

export async function saveCommunicationNoteEdit(input: Readonly<{
  canonicalId: string; baseRevisionNumber: number; mutationId: string; request: CommunicationNoteEditRequest;
  signal: AbortSignal; fetcher?: (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;
}>): Promise<CommunicationNoteEditResult> {
  const body = parseCommunicationNoteEditRequest(input.request);
  if (!body || !UUID.test(input.canonicalId) || !UUID.test(input.mutationId) ||
      !Number.isSafeInteger(input.baseRevisionNumber) || input.baseRevisionNumber < 1) return { status: "INVALID_REQUEST" };
  try {
    if (input.signal.aborted) return { status: "UNAVAILABLE" };
    const response = await (input.fetcher ?? fetch)(buildCommunicationNoteEditHref(input.canonicalId), {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: input.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": input.mutationId }, body: JSON.stringify(body),
    });
    const result = parseCommunicationNoteEditResult(await response.json(), { ...input, baseRevisionId: body.baseRevisionId });
    if (input.signal.aborted || !result || response.status !== EDIT_HTTP_STATUS[result.status]) return { status: "UNAVAILABLE" };
    return result;
  } catch { return { status: "UNAVAILABLE" }; } // No automatic write retry or optimistic save.
}
