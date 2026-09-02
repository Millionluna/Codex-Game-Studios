import "server-only";

import {
  isCaresLinkV1ProductApiEnabled,
  resolveCaresLinkV1ProductApiAuth,
  type CaresLinkV1ProductApiAuthClient,
  type CaresLinkV1ProductApiAuthFailureReason,
  type CaresLinkV1ProductApiEnv,
  type CaresLinkV1SessionStatusResolver,
  type CaresLinkV1SessionValidationStatus,
} from "./v1/product-api-auth.server";
import {
  createCaresLinkV1SessionStatusResolver,
  type CaresLinkV1SessionStatusRpcClient,
} from "./v1/product-api-session-status.server";
import type { CaresLinkV1AuthenticatedPrincipal } from "./v1/transport-contract";

export type CommunicationNoteGenerationProviderPrincipal = Readonly<
  CaresLinkV1AuthenticatedPrincipal & { transport: "COOKIE" }
>;

export type CommunicationNoteGenerationPrincipalFailureReason =
  | "auth_required"
  | "forbidden_transport"
  | "session_revoked"
  | "unavailable";

export type CommunicationNoteGenerationPrincipalResolution =
  | Readonly<{
      ok: true;
      principal: CommunicationNoteGenerationProviderPrincipal;
    }>
  | Readonly<{
      ok: false;
      reason: CommunicationNoteGenerationPrincipalFailureReason;
      status: 401 | 403 | 503;
    }>;

export type CommunicationNoteGenerationPrincipalResolver = (
  request: Request,
) => Promise<CommunicationNoteGenerationPrincipalResolution>;

export type CommunicationNoteGenerationPrincipalResolverOptions = Readonly<{
  env: CaresLinkV1ProductApiEnv;
  createCookieAuthClient(): Promise<
    CaresLinkV1ProductApiAuthClient | undefined
  >;
  createSessionStatusClient():
    | CaresLinkV1SessionStatusRpcClient
    | undefined
    | Promise<CaresLinkV1SessionStatusRpcClient | undefined>;
}>;

/**
 * Formal composition remains absent until a database-level least-privilege
 * session-status capability and the rest of the durable admission chain are
 * approved. The separate source-only wrapper still uses a
 * service-role-equivalent secret, so it cannot become reachable from the
 * product route by changing environment variables alone.
 */
export const COMMUNICATION_NOTE_GENERATION_PRINCIPAL_RESOLVER = undefined as
  | CommunicationNoteGenerationPrincipalResolver
  | undefined;

/**
 * Creates the strict Cookie principal boundary from explicit server-owned
 * ports. The supplied session resolver is expected to prove the exact Auth
 * session and trusted provider eligibility; this function never infers a role
 * from user-editable metadata and never accepts identity from the request body.
 */
export function createCommunicationNoteGenerationPrincipalResolver(
  options: CommunicationNoteGenerationPrincipalResolverOptions,
): CommunicationNoteGenerationPrincipalResolver {
  if (
    !options ||
    typeof options.createCookieAuthClient !== "function" ||
    typeof options.createSessionStatusClient !== "function"
  ) {
    throw new Error(
      "Communication Note generation principal resolver is unavailable",
    );
  }
  const env = options.env;
  const createCookieAuthClient = options.createCookieAuthClient;
  const createSessionStatusClient = options.createSessionStatusClient;

  // The privileged client is deliberately resolved inside this callback.
  // Product Auth calls it only after getClaims has produced canonical subject
  // and session UUIDs, so invalid credentials cannot construct that client.
  const resolveSessionStatus: CaresLinkV1SessionStatusResolver = async (
    identity,
  ): Promise<CaresLinkV1SessionValidationStatus> => {
    let client: CaresLinkV1SessionStatusRpcClient | undefined;
    try {
      client = await createSessionStatusClient();
    } catch {
      return "UNAVAILABLE";
    }
    if (!client || typeof client.rpc !== "function") {
      return "UNAVAILABLE";
    }
    return createCaresLinkV1SessionStatusResolver(client)(identity);
  };

  return async (request: Request) => {
    try {
      if (!isCaresLinkV1ProductApiEnabled(env)) {
        return failure("unavailable", 503);
      }

      // This Web mutation is Cookie-only. Reject every Authorization header
      // before the shared Product API resolver can inspect or verify a bearer.
      if (request.headers.has("authorization")) {
        return failure("forbidden_transport", 403);
      }
    } catch {
      return failure("unavailable", 503);
    }

    try {
      const auth = await resolveCaresLinkV1ProductApiAuth(request, {
        env,
        createCookieAuthClient,
        resolveSessionStatus,
      });

      if (!auth.ok) {
        return mapAuthFailure(auth.reason);
      }
      if (auth.identity.source !== "cookie") {
        return failure("forbidden_transport", 403);
      }

      return Object.freeze({
        ok: true as const,
        principal: Object.freeze({
          userId: auth.identity.userId,
          sessionId: auth.identity.sessionId,
          transport: "COOKIE" as const,
        }),
      });
    } catch {
      return failure("unavailable", 503);
    }
  };
}

function mapAuthFailure(
  reason: CaresLinkV1ProductApiAuthFailureReason,
): CommunicationNoteGenerationPrincipalResolution {
  switch (reason) {
    case "auth_required":
    case "invalid_session":
      return failure("auth_required", 401);
    case "session_revoked":
      return failure("session_revoked", 401);
    case "feature_disabled":
    case "auth_unavailable":
    case "session_validation_unavailable":
      return failure("unavailable", 503);
  }
}

function failure(
  reason: CommunicationNoteGenerationPrincipalFailureReason,
  status: 401 | 403 | 503,
): CommunicationNoteGenerationPrincipalResolution {
  return Object.freeze({ ok: false, reason, status });
}
