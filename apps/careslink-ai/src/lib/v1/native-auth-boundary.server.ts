import "server-only";

import { randomUUID } from "node:crypto";

import {
  CARESLINK_PRODUCTION_SUPABASE_REF,
  getSupabaseProjectRef,
} from "./ndis-shadow-guard";
import { CARESLINK_V1_CONTRACT_VERSION } from "./shared-contracts";
import {
  CARESLINK_V1_AUTH_BOUNDARIES,
  CARESLINK_V1_HEADER_NAMES,
  CARESLINK_V1_MINIMUM_CLIENT_VERSION,
  createCaresLinkV1TransportError,
} from "./transport-contract";

export const CARESLINK_V1_NATIVE_AUTH_FEATURE_FLAG =
  "CARESLINK_V1_NATIVE_AUTH_ENABLED" as const;
export const CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF_FLAG =
  "CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF" as const;

/**
 * This compile-time latch deliberately has no environment override. The five
 * native-auth routes may describe their boundary and return 501, but no code in
 * this module can exchange a PKCE code, enumerate sessions/devices, or revoke a
 * session until a later reviewed implementation changes this constant.
 */
export const CARESLINK_V1_NATIVE_AUTH_IMPLEMENTATION_READY = false as const;

export const CARESLINK_V1_NATIVE_AUTH_SECURITY_POLICY = {
  accessTokenTransport: "AUTHORIZATION_BEARER_HEADER_ONLY",
  refreshTokenTransport: "SUPABASE_NATIVE_SDK_ONLY",
  authorizationCodeReceipt: "NATIVE_DEEP_LINK_CALLBACK_MEMORY_ONLY",
  authorizationCodeForwarding: "SUPABASE_NATIVE_SDK_ONLY",
  authorizationCodeUse: "SINGLE_USE",
  codeVerifierStorage: "SECURESTORE_EPHEMERAL_ONLY",
  accessOrRefreshTokenInUrl: "FORBIDDEN",
  accessOrRefreshTokenInBody: "FORBIDDEN",
  credentialLoggingOrAnalytics: "FORBIDDEN",
  credentialDraftOrOutboxPersistence: "FORBIDDEN",
  credentialErrorReflection: "FORBIDDEN",
  revokeCleanup: "CURRENT_SESSION_ONLY_SIGN_OUT_WIPE_REBUILD",
} as const;

/**
 * The M0 protocol draft is versioned in native-auth-contract.ts. These are
 * remaining implementation/evidence gates; none can be satisfied by
 * environment values.
 */
export const CARESLINK_V1_NATIVE_AUTH_IMPLEMENTATION_BLOCKERS = {
  providerConfiguration: "PREVIEW_FIXTURES_NOT_PROVEN",
  redirectUriRegistration: "PREVIEW_ALLOWLIST_NOT_PROVEN",
  stateAndReplayEvidence: "PREVIEW_E2E_NOT_RUN",
  secureStoreHandoff: "MOBILE_E2E_NOT_RUN",
  sessionInventoryAndRevocation: "NOT_IMPLEMENTED",
} as const;

export const CARESLINK_V1_NATIVE_AUTH_ENDPOINT_DESIGN = {
  nativePkceCallback: {
    path: CARESLINK_V1_AUTH_BOUNDARIES.nativePkceCallback.path,
    method: "POST",
    authentication: "NONE_DISABLED_BOUNDARY",
    request: "NO_M0_PRODUCT_API_REQUEST",
    response: "NOT_IMPLEMENTED_ERROR_ENVELOPE_ONLY",
    successResponse: "NONE_M0_USES_SUPABASE_NATIVE_SDK",
    capability: false,
  },
  sessions: {
    path: CARESLINK_V1_AUTH_BOUNDARIES.sessions.path,
    method: "GET",
    authentication: "BEARER_HEADER_ONLY",
    request: "NO_BODY",
    response: "CaresLinkV1NativeSessionsResponse",
    capability: false,
  },
  devices: {
    path: CARESLINK_V1_AUTH_BOUNDARIES.devices.path,
    method: "GET",
    authentication: "BEARER_HEADER_ONLY",
    request: "NO_BODY",
    response: "CaresLinkV1NativeDevicesResponse",
    capability: false,
  },
  revokeSession: {
    path: CARESLINK_V1_AUTH_BOUNDARIES.revokeSession.path,
    method: "POST",
    authentication: "BEARER_HEADER_ONLY",
    request: "SESSION_ID_PATH_ONLY_NO_BODY",
    response: "CaresLinkV1NativeRevokeSessionResponse",
    capability: false,
  },
  revokeAllSessions: {
    path: CARESLINK_V1_AUTH_BOUNDARIES.revokeAllSessions.path,
    method: "POST",
    authentication: "BEARER_HEADER_ONLY",
    request: "NO_BODY",
    response: "CaresLinkV1NativeRevokeAllSessionsResponse",
    capability: false,
  },
} as const;

export type CaresLinkV1NativePlatform = "ios" | "android";

export type CaresLinkV1NativeSessionSummary = Readonly<{
  sessionId: string;
  deviceId: string | null;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
}>;

export type CaresLinkV1NativeSessionsResponse = Readonly<{
  sessions: readonly CaresLinkV1NativeSessionSummary[];
}>;

export type CaresLinkV1NativeDeviceSummary = Readonly<{
  deviceId: string;
  platform: CaresLinkV1NativePlatform;
  displayName: string | null;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
}>;

export type CaresLinkV1NativeDevicesResponse = Readonly<{
  devices: readonly CaresLinkV1NativeDeviceSummary[];
}>;

type CaresLinkV1NativeRevokeSessionResponseBase = Readonly<{
  sessionId: string;
  status: "REVOKED";
  revokedAt: string;
}>;

export type CaresLinkV1NativeRevokeSessionResponse =
  | (CaresLinkV1NativeRevokeSessionResponseBase &
      Readonly<{
        revokedCurrentSession: true;
        clientCleanup: "SIGN_OUT_WIPE_REBUILD";
      }>)
  | (CaresLinkV1NativeRevokeSessionResponseBase &
      Readonly<{
        revokedCurrentSession: false;
        clientCleanup: "NONE";
      }>);

export type CaresLinkV1NativeRevokeAllSessionsResponse = Readonly<{
  scope: "ALL";
  status: "REVOKED";
  revokedAt: string;
  revokedCurrentSession: true;
  clientCleanup: "SIGN_OUT_WIPE_REBUILD";
}>;

export type CaresLinkV1NativeAuthPreviewEnv = Readonly<{
  VERCEL_ENV?: string;
  CARESLINK_V1_NATIVE_AUTH_ENABLED?: string;
  CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF?: string;
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
}>;

export type CaresLinkV1NativeAuthPreviewGuard = Readonly<{
  enabled: false;
  configurationReady: boolean;
  targetSupabaseRef?: string;
  reason:
    | "production_environment"
    | "non_preview_environment"
    | "feature_disabled"
    | "target_unverified"
    | "production_target_denied"
    | "implementation_not_ready";
}>;

/**
 * Resolves future Preview eligibility without enabling the capability. Even a
 * fully matching configuration stops at `implementation_not_ready` because
 * the compile-time implementation latch is false.
 */
export function resolveCaresLinkV1NativeAuthPreviewGuard(
  env: CaresLinkV1NativeAuthPreviewEnv =
    process.env as CaresLinkV1NativeAuthPreviewEnv,
): CaresLinkV1NativeAuthPreviewGuard {
  if (env.VERCEL_ENV === "production") {
    return disabledGuard("production_environment");
  }
  if (env.VERCEL_ENV !== "preview") {
    return disabledGuard("non_preview_environment");
  }
  if (env.CARESLINK_V1_NATIVE_AUTH_ENABLED !== "true") {
    return disabledGuard("feature_disabled");
  }

  const targetSupabaseRef = getSupabaseProjectRef(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const expectedSupabaseRef = normalizeExpectedProjectRef(
    env.CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF,
  );
  if (
    !targetSupabaseRef ||
    !expectedSupabaseRef ||
    targetSupabaseRef !== expectedSupabaseRef
  ) {
    return disabledGuard("target_unverified", targetSupabaseRef);
  }
  if (targetSupabaseRef === CARESLINK_PRODUCTION_SUPABASE_REF) {
    return disabledGuard("production_target_denied", targetSupabaseRef);
  }

  return {
    enabled: CARESLINK_V1_NATIVE_AUTH_IMPLEMENTATION_READY,
    configurationReady: true,
    targetSupabaseRef,
    reason: "implementation_not_ready",
  };
}

export type CaresLinkV1NativeAuthBoundaryDependencies = Readonly<{
  createCorrelationId?: () => string;
}>;

/**
 * Uniform fail-closed response for every native-auth Route Handler. The
 * request is intentionally opaque: no URL, body, cookie, Authorization value,
 * session id, PKCE code, or verifier is read or reflected.
 */
export function handleCaresLinkV1NativeAuthDisabledBoundary(
  request: Request,
  dependencies: CaresLinkV1NativeAuthBoundaryDependencies = {},
) {
  void request;
  const correlationId = createSafeCorrelationId(
    dependencies.createCorrelationId ?? randomUUID,
  );
  const headers = new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    [CARESLINK_V1_HEADER_NAMES.contractVersion]: CARESLINK_V1_CONTRACT_VERSION,
    [CARESLINK_V1_HEADER_NAMES.minimumClientVersion]:
      CARESLINK_V1_MINIMUM_CLIENT_VERSION,
    [CARESLINK_V1_HEADER_NAMES.correlationId]: correlationId,
  });

  return new Response(
    JSON.stringify(
      createCaresLinkV1TransportError({
        code: "NOT_IMPLEMENTED",
        message: "Native authentication management is not implemented",
        correlationId,
      }),
    ),
    { status: 501, headers },
  );
}

function disabledGuard(
  reason: Exclude<
    CaresLinkV1NativeAuthPreviewGuard["reason"],
    "implementation_not_ready"
  >,
  targetSupabaseRef?: string,
): CaresLinkV1NativeAuthPreviewGuard {
  return {
    enabled: false,
    configurationReady: false,
    targetSupabaseRef,
    reason,
  };
}

function normalizeExpectedProjectRef(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z0-9]{8,32}$/.test(normalized)
    ? normalized
    : undefined;
}

function createSafeCorrelationId(createCorrelationId: () => string) {
  try {
    const correlationId = createCorrelationId();
    if (/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(correlationId)) {
      return correlationId;
    }
  } catch {
    // Fall through to a server-generated identifier without exposing details.
  }
  return randomUUID();
}
