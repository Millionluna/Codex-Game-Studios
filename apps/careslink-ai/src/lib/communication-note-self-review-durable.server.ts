import "server-only";
import { createCareslinkServerSupabaseClient } from "./supabase-server";
import {
  createCommunicationNoteGenerationCurrentSessionStatusResolver,
  type CommunicationNoteGenerationAuthenticatedClient,
} from "./communication-note-generation-current-session.server";
import {
  parseCommunicationNoteSelfReviewRequest, parseCommunicationNoteSelfReviewResult, SELF_REVIEW_UUID,
} from "./communication-note-self-review-contract";
import type { CommunicationNoteSelfReviewWriter } from "./communication-note-self-review.server";
import { isCaresLinkV1ProductApiEnabled, resolveCaresLinkV1ProductApiAuth } from "./v1/product-api-auth.server";
import {
  isCaresLinkV1DurableProductApiEnabled, isCaresLinkV1ProductApiPreviewTargetAllowed,
  type CaresLinkV1ProductApiRuntimeEnv,
} from "./v1/product-api-runtime.server";
import type { CaresLinkV1SessionScopedSupabaseRpcClient } from "./v1/product-api-supabase.server";

export const COMMUNICATION_NOTE_SELF_REVIEW_RPC = "confirm_communication_note_self_review" as const;
export type CommunicationNoteSelfReviewEnv = CaresLinkV1ProductApiRuntimeEnv & {
  CARESLINK_COMMUNICATION_NOTE_SELF_REVIEW_ENABLED?: string;
};
type Client = CommunicationNoteGenerationAuthenticatedClient & CaresLinkV1SessionScopedSupabaseRpcClient;

/** Local, durable binding candidate. The formal POST route deliberately does
 * not install this factory yet. No default memory adapter, service-role client,
 * bearer path, text payload or owner/session argument is accepted here. */
export function createCommunicationNoteDurableSelfReviewWriter(options: Readonly<{
  env?: CommunicationNoteSelfReviewEnv;
  createCookieClient?: () => Promise<Client | undefined>;
}> = {}): CommunicationNoteSelfReviewWriter {
  const env = options.env ?? process.env as CommunicationNoteSelfReviewEnv;
  return async ({ request, canonicalId, mutationId, confirmation }) => {
    const unavailable = { status: "UNAVAILABLE" } as const;
    if (env.CARESLINK_COMMUNICATION_NOTE_SELF_REVIEW_ENABLED !== "true" ||
        !isCaresLinkV1ProductApiEnabled(env) || !isCaresLinkV1DurableProductApiEnabled(env) ||
        !isCaresLinkV1ProductApiPreviewTargetAllowed(env) || request.signal.aborted) return unavailable;
    if (request.headers.has("authorization")) return { status: "AUTH_REQUIRED" };
    if (!SELF_REVIEW_UUID.test(canonicalId) || !SELF_REVIEW_UUID.test(mutationId) ||
        !parseCommunicationNoteSelfReviewRequest(confirmation)) return { status: "INVALID_REQUEST" };
    try {
      // Use one request-scoped Cookie client for verified identity, current
      // session proof and the mutation; never mix principals across clients.
      const client = options.createCookieClient
        ? await options.createCookieClient()
        : await createCareslinkServerSupabaseClient({ env }) as unknown as Client | undefined;
      if (!client || request.signal.aborted) return unavailable;
      const resolveSessionStatus = createCommunicationNoteGenerationCurrentSessionStatusResolver(client);
      const auth = await resolveCaresLinkV1ProductApiAuth(request, {
        env, createCookieAuthClient: async () => client, resolveSessionStatus,
      });
      if (!auth.ok) return { status: auth.status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE" };
      if (auth.identity.source !== "cookie") return { status: "AUTH_REQUIRED" };
      if (request.signal.aborted) return unavailable;
      const result = await client.rpc(COMMUNICATION_NOTE_SELF_REVIEW_RPC, {
        p_document_id: canonicalId, p_revision_id: confirmation.revisionId, p_mutation_id: mutationId,
        p_facts_confirmed: true, p_wording_confirmed: true, p_missing_facts_reviewed: true,
      });
      // Abort/lost ACK is uncertain even if the transaction committed. The
      // browser must read back; neither layer automatically retries this POST.
      if (request.signal.aborted || !result || typeof result !== "object") return unavailable;
      if (result.error !== null) {
        const error = result.error;
        if (error?.code === "P0001" && (
          error.message === "AUTH_REQUIRED" || error.message === "NOT_FOUND" ||
          error.message === "STALE_REVISION" || error.message === "INVALID_REQUEST"
        )) return { status: error.message };
        return unavailable;
      }
      return parseCommunicationNoteSelfReviewResult(result.data, {
        canonicalId, revisionId: confirmation.revisionId, mutationId,
      }) ?? unavailable;
    } catch { return unavailable; }
  };
}
