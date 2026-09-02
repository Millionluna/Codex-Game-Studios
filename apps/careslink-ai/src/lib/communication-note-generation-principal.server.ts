import "server-only";

import {
  isCaresLinkV1ProductApiEnabled,
  resolveCaresLinkV1ProductApiAuth,
  type CaresLinkV1ProductApiAuthFailureReason,
  type CaresLinkV1ProductApiEnv,
  type CaresLinkV1SessionStatusResolver,
} from "./v1/product-api-auth.server";
import {
  createCommunicationNoteGenerationCurrentSessionStatusResolver,
  type CommunicationNoteGenerationAuthenticatedClient,
} from "./communication-note-generation-current-session.server";
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
    CommunicationNoteGenerationAuthenticatedClient | undefined
  >;
  validateCurrentSessionAuthority(): boolean;
}>;

/**
 * Formal composition remains absent until the authenticated current-session
 * database capability is installed and the rest of the durable admission
 * chain is approved. This source-only resolver cannot become reachable from
 * the product route by changing environment variables alone.
 */
export const COMMUNICATION_NOTE_GENERATION_PRINCIPAL_RESOLVER = undefined as
  | CommunicationNoteGenerationPrincipalResolver
  | undefined;

/**
 * Creates the strict Cookie principal boundary from explicit server-owned
 * ports. The request's authenticated client proves its own exact Auth session
 * and trusted provider eligibility through a zero-argument database RPC. This
 * function never infers a role from user-editable metadata and never accepts
 * identity from the request body.
 */
export function createCommunicationNoteGenerationPrincipalResolver(
  options: CommunicationNoteGenerationPrincipalResolverOptions,
): CommunicationNoteGenerationPrincipalResolver {
  if (
    !options ||
    typeof options.createCookieAuthClient !== "function" ||
    typeof options.validateCurrentSessionAuthority !== "function"
  ) {
    throw new Error(
      "Communication Note generation principal resolver is unavailable",
    );
  }
  const env = options.env;
  const createCookieAuthClient = options.createCookieAuthClient;
  const validateCurrentSessionAuthority =
    options.validateCurrentSessionAuthority;

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
      // This client is request-local by construction. Product Auth uses the
      // same exact Cookie-backed instance for getClaims and getUser, while the
      // callback below uses it for the intervening zero-argument RPC.
      let requestClient:
        | CommunicationNoteGenerationAuthenticatedClient
        | undefined;
      const createRequestCookieAuthClient = async () => {
        const client = await createCookieAuthClient();
        requestClient = client;
        return client;
      };
      const resolveSessionStatus: CaresLinkV1SessionStatusResolver = async () => {
        const client = requestClient;
        if (!client) {
          return "UNAVAILABLE";
        }
        try {
          if (!validateCurrentSessionAuthority()) {
            return "UNAVAILABLE";
          }
        } catch {
          return "UNAVAILABLE";
        }
        return createCommunicationNoteGenerationCurrentSessionStatusResolver(
          client,
        )();
      };

      const auth = await resolveCaresLinkV1ProductApiAuth(request, {
        env,
        createCookieAuthClient: createRequestCookieAuthClient,
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
