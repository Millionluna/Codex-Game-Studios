import "server-only";
import { createCareslinkServerSupabaseClient } from "./supabase-server";
import { createCommunicationNoteGenerationCurrentSessionStatusResolver,
  type CommunicationNoteGenerationAuthenticatedClient } from "./communication-note-generation-current-session.server";
import { parseCommunicationNoteEditRequest, parseCommunicationNoteEditResult,
  type CommunicationNoteEditRequest, type CommunicationNoteEditResult } from "./communication-note-edit-contract";
import { SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";
import { scanCaresLinkV1CleanedFacts } from "./v1/privacy-review-scanner.server";
import { isCaresLinkV1ProductApiEnabled, resolveCaresLinkV1ProductApiAuth } from "./v1/product-api-auth.server";
import { isCaresLinkV1DurableProductApiEnabled, isCaresLinkV1ProductApiPreviewTargetAllowed,
  type CaresLinkV1ProductApiRuntimeEnv } from "./v1/product-api-runtime.server";
import type { CaresLinkV1SessionScopedSupabaseRpcClient } from "./v1/product-api-supabase.server";

export const COMMUNICATION_NOTE_EDIT_RPC = "save_communication_note_wording" as const;
export type CommunicationNoteEditEnv = CaresLinkV1ProductApiRuntimeEnv & {
  CARESLINK_COMMUNICATION_NOTE_EDIT_ENABLED?: string;
};
type Client = CommunicationNoteGenerationAuthenticatedClient & CaresLinkV1SessionScopedSupabaseRpcClient;
export type CommunicationNoteDurableEditInput = Readonly<{
  request: Request; canonicalId: string; mutationId: string;
  command: CommunicationNoteEditRequest; baseRevisionNumber: number;
}>;

/** Uninstalled candidate: no formal route binding, service-role fallback,
 * automatic retry, or generic append RPC. The SQL derives facts/proof/owner and
 * atomically revalidates them after locks. Only the exact Cookie client writes. */
export function createCommunicationNoteDurableEditWriter(options: Readonly<{
  env?: CommunicationNoteEditEnv; createCookieClient?: () => Promise<Client | undefined>;
}> = {}) {
  const env = options.env ?? process.env as CommunicationNoteEditEnv;
  return async ({ request, canonicalId, mutationId, command, baseRevisionNumber }: CommunicationNoteDurableEditInput): Promise<CommunicationNoteEditResult> => {
    const unavailable = { status: "UNAVAILABLE" } as const;
    if (env.CARESLINK_COMMUNICATION_NOTE_EDIT_ENABLED !== "true" ||
        env.CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED !== "true" ||
        !isCaresLinkV1ProductApiEnabled(env) || !isCaresLinkV1DurableProductApiEnabled(env) ||
        !isCaresLinkV1ProductApiPreviewTargetAllowed(env) || request.signal.aborted) return unavailable;
    if (request.headers.has("authorization")) return { status: "AUTH_REQUIRED" };
    const parsed = parseCommunicationNoteEditRequest(command);
    if (!UUID.test(canonicalId) || !UUID.test(mutationId) || !parsed ||
        !Number.isSafeInteger(baseRevisionNumber) || baseRevisionNumber < 1 || baseRevisionNumber >= 2147483647)
      return { status: "INVALID_REQUEST" };
    try {
      const client = options.createCookieClient ? await options.createCookieClient()
        : await createCareslinkServerSupabaseClient({ env }) as unknown as Client | undefined;
      if (!client || request.signal.aborted) return unavailable;
      const auth = await resolveCaresLinkV1ProductApiAuth(request, { env,
        createCookieAuthClient: async () => client,
        resolveSessionStatus: createCommunicationNoteGenerationCurrentSessionStatusResolver(client) });
      if (!auth.ok) return { status: auth.status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE" };
      if (auth.identity.source !== "cookie") return { status: "AUTH_REQUIRED" };
      if (scanCaresLinkV1CleanedFacts({ englishDraft: parsed.englishDraft, ...parsed.reviewVersions }).findings.length)
        return { status: "PRIVACY_REVIEW_REQUIRED" };
      if (request.signal.aborted) return unavailable;
      const result = await client.rpc(COMMUNICATION_NOTE_EDIT_RPC, {
        p_document_id: canonicalId, p_mutation_id: mutationId, p_command: parsed,
      });
      if (request.signal.aborted || !result || typeof result !== "object") return unavailable;
      if (result.error !== null) {
        const error = result.error;
        if (error?.code === "P0001" && (error.message === "AUTH_REQUIRED" || error.message === "NOT_FOUND" ||
            error.message === "STALE_REVISION" || error.message === "INVALID_REQUEST" || error.message === "PRIVACY_REVIEW_REQUIRED"))
          return { status: error.message };
        return unavailable;
      }
      return parseCommunicationNoteEditResult(result.data, {
        canonicalId, mutationId, baseRevisionId: parsed.baseRevisionId, baseRevisionNumber,
      }) ?? unavailable;
    } catch { return unavailable; }
  };
}
