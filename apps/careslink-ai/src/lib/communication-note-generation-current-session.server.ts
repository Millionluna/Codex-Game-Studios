import "server-only";

import type {
  CaresLinkV1ProductApiAuthClient,
  CaresLinkV1SessionValidationStatus,
} from "./v1/product-api-auth.server";

export const COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC =
  "resolve_v1_current_session_status" as const;

export type CommunicationNoteGenerationAuthenticatedClient =
  CaresLinkV1ProductApiAuthClient &
    Readonly<{
      rpc(
        functionName: typeof COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
      ): PromiseLike<unknown>;
    }>;

export type CommunicationNoteGenerationCurrentSessionStatusResolver =
  () => Promise<CaresLinkV1SessionValidationStatus>;

/**
 * Resolves only the session represented by the authenticated Cookie client's
 * JWT. The database function accepts no identity arguments, so the browser or
 * server cannot substitute an owner or session UUID in this call.
 */
export function createCommunicationNoteGenerationCurrentSessionStatusResolver(
  client: CommunicationNoteGenerationAuthenticatedClient,
): CommunicationNoteGenerationCurrentSessionStatusResolver {
  return async () => {
    if (!client || typeof client.rpc !== "function") {
      return "UNAVAILABLE";
    }

    try {
      const result = await client.rpc(
        COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
      );
      if (!isRpcResult(result) || result.error !== null) {
        return "UNAVAILABLE";
      }
      return result.data === "ACTIVE" || result.data === "REVOKED"
        ? result.data
        : "UNAVAILABLE";
    } catch {
      return "UNAVAILABLE";
    }
  };
}

function isRpcResult(
  value: unknown,
): value is Readonly<{ data: unknown; error: unknown | null }> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "data" in value &&
      "error" in value,
  );
}
