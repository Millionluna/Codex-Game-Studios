import { buildCommunicationNoteEditHref, EDIT_HTTP_STATUS, parseCommunicationNoteEditRequest, parseCommunicationNoteEditResult,
  type CommunicationNoteEditRequest, type CommunicationNoteEditResult } from "./communication-note-edit-contract";
import { SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";
import { withCommunicationNoteRequestDeadline } from "./communication-note-request-deadline";

export async function saveCommunicationNoteEdit(input: Readonly<{
  canonicalId: string; baseRevisionNumber: number; mutationId: string; request: CommunicationNoteEditRequest;
  signal: AbortSignal; fetcher?: (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;
}>): Promise<CommunicationNoteEditResult> {
  const body = parseCommunicationNoteEditRequest(input.request);
  if (!body || !UUID.test(input.canonicalId) || !UUID.test(input.mutationId) ||
      !Number.isSafeInteger(input.baseRevisionNumber) || input.baseRevisionNumber < 1) return { status: "INVALID_REQUEST" };
  try {
    return await withCommunicationNoteRequestDeadline(input.signal, async (signal): Promise<CommunicationNoteEditResult> => {
      const response = await (input.fetcher ?? fetch)(buildCommunicationNoteEditHref(input.canonicalId), {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal,
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": input.mutationId }, body: JSON.stringify(body),
      });
      if (signal.aborted) return { status: "UNAVAILABLE" };
      const payload = await response.json();
      if (signal.aborted) return { status: "UNAVAILABLE" };
      const result = parseCommunicationNoteEditResult(payload, { ...input, baseRevisionId: body.baseRevisionId });
      if (!result || response.status !== EDIT_HTTP_STATUS[result.status]) return { status: "UNAVAILABLE" };
      return result;
    });
  } catch { return { status: "UNAVAILABLE" }; } // No automatic write retry or optimistic save.
}
