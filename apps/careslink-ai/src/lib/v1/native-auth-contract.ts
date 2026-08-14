import { CARESLINK_V1_CONTRACT_VERSION } from "./shared-contracts";

/**
 * Machine-readable native authentication contract draft for the Mobile SDK.
 * It versions the M0 protocol without making any native-auth HTTP capability
 * available. Runtime activation remains a separate Preview-only gate.
 */
export const CARESLINK_V1_NATIVE_AUTH_CONTRACT_VERSION =
  "2026-08-14.preview.1" as const;

export const CARESLINK_V1_NATIVE_AUTH_CONTRACT_STATUS =
  "VERSIONED_DRAFT_RUNTIME_DISABLED" as const;

export const CARESLINK_V1_NATIVE_AUTH_PROVIDERS = [
  "email",
  "google",
  "microsoft",
  "apple",
] as const;
export type CaresLinkV1NativeAuthProvider =
  (typeof CARESLINK_V1_NATIVE_AUTH_PROVIDERS)[number];

export const CARESLINK_V1_NATIVE_AUTH_PROVIDER_MAPPING = {
  email: {
    supabaseProvider: "email",
    flow: "EMAIL_PASSWORD_SESSION",
    pkceRequired: false,
  },
  google: {
    supabaseProvider: "google",
    flow: "OAUTH_PKCE_S256",
    pkceRequired: true,
  },
  microsoft: {
    supabaseProvider: "azure",
    flow: "OAUTH_PKCE_S256",
    pkceRequired: true,
  },
  apple: {
    supabaseProvider: "apple",
    flow: "OAUTH_PKCE_S256",
    pkceRequired: true,
  },
} as const satisfies Record<
  CaresLinkV1NativeAuthProvider,
  {
    supabaseProvider: "email" | "google" | "azure" | "apple";
    flow: "EMAIL_PASSWORD_SESSION" | "OAUTH_PKCE_S256";
    pkceRequired: boolean;
  }
>;

export const CARESLINK_V1_NATIVE_REDIRECT_URI_ALLOWLIST = {
  preview: {
    ios: [] as const,
    android: [] as const,
  },
  production: [] as const,
} as const;

export const CARESLINK_V1_NATIVE_REDIRECT_ALLOWLIST_STATUS =
  "MOBILE_REDIRECT_URIS_UNCONFIRMED" as const;

export const CARESLINK_V1_NATIVE_PKCE_POLICY = {
  method: "S256",
  verifierPattern: "^[A-Za-z0-9._~-]{43,128}$",
  statePattern: "^[A-Za-z0-9._~-]{43,128}$",
  stateEntropyBitsMinimum: 128,
  attemptTtlSeconds: 600,
  maximumPendingAttemptsPerInstallation: 1,
  replacementInvalidatesPriorAttempt: true,
  callbackAllowedQueryKeys: ["code", "state", "error", "error_code"] as const,
  callbackForbiddenQueryKeys: [
    "access_token",
    "refresh_token",
    "provider_token",
    "provider_refresh_token",
  ] as const,
  authorizationCodeSingleUse: true,
  stateSingleUse: true,
  authorizationCodeStorage: "MEMORY_ONLY",
  verifierStorage: "SECURESTORE_EPHEMERAL_ONLY",
  attemptStorageForbidden: [
    "SQLCIPHER",
    "OUTBOX",
    "DRAFT",
    "LOG",
    "ANALYTICS",
  ] as const,
  exchangeOwner: "SUPABASE_NATIVE_SDK",
  productApiCallbackEndpoint: "RESERVED_DISABLED_NOT_USED_BY_M0",
} as const;

export const CARESLINK_V1_NATIVE_SESSION_POLICY = {
  sessionSource: "SUPABASE_AUTH_VERIFIED_SESSION",
  accessTokenTransport: "AUTHORIZATION_BEARER_HEADER_ONLY",
  accessTokenPersistence: "SECURESTORE_ONLY",
  refreshTokenTransport: "SUPABASE_NATIVE_SDK_ONLY",
  refreshTokenPersistence: "SECURESTORE_ONLY",
  refreshMode: "SUPABASE_ROTATING_REFRESH_TOKEN",
  tokenInUrl: "FORBIDDEN",
  tokenInProductApiBody: "FORBIDDEN",
  tokenInLogAnalyticsDraftOutbox: "FORBIDDEN",
  identityProofEndpoint: "/v1/me",
  identityProofMethod: "GET",
  requiredProofMatches: ["userId", "sessionId"] as const,
  serverEligibilitySources: ["auth.users", "auth.sessions"] as const,
  forbiddenEligibilitySources: [
    "raw_user_metadata",
    "jwt_user_metadata",
    "request_body_owner",
  ] as const,
  refreshFailureAction: "SIGN_OUT_WIPE_REBUILD",
  accountChangeAction: "SIGN_OUT_WIPE_REBUILD",
} as const;

export const CARESLINK_V1_NATIVE_IDENTITY_POLICY = {
  accountAnchor: "SUPABASE_AUTH_USER_UUID",
  linkingAuthority: "auth.identities",
  automaticEmailMerge: false,
  clientSelectedOwnerId: false,
  rawUserMetadataAuthorization: false,
  linkingAvailability: "DISABLED_M0",
  linkingRequirements: [
    "CURRENT_SESSION_FRESH_REAUTH",
    "PROVIDER_VERIFIED_IDENTITY",
    "IDENTITY_NOT_LINKED_TO_ANOTHER_USER",
    "SERVER_DERIVED_CURRENT_USER",
  ] as const,
  conflictErrorCode: "IDENTITY_LINK_CONFLICT",
  applePrivateRelayRule: "NEVER_MERGE_BY_EMAIL_ALONE",
  unlinkLastIdentity: "FORBIDDEN",
} as const;

export const CARESLINK_V1_NATIVE_ME_IDENTITY_PROOF_UPGRADE = {
  availability: "BLOCKED_REQUIRES_PRODUCT_CONTRACT_VERSION_BUMP",
  currentProductContractVersion: CARESLINK_V1_CONTRACT_VERSION,
  requiredServerFields: [
    "userId",
    "sessionId",
    "accessTokenExpiresAt",
    "sessionNotAfter",
    "provider",
    "linkedProviders",
    "refreshMode",
    "nativeAuthContractVersion",
    "capabilities",
  ] as const,
  authoritativeSources: [
    "verified_access_token_claims",
    "auth.users",
    "auth.sessions",
    "auth.identities",
  ] as const,
  currentMeResponseSatisfiesUpgrade: false,
} as const;

export const CARESLINK_V1_NATIVE_SESSION_ENDPOINTS = {
  list: {
    method: "GET",
    path: "/v1/auth/sessions",
    availability: "DISABLED_M0",
  },
  revokeOne: {
    method: "POST",
    path: "/v1/auth/sessions/{sessionId}/revoke",
    availability: "DISABLED_M0",
  },
  revokeAll: {
    method: "POST",
    path: "/v1/auth/sessions/revoke-all",
    availability: "DISABLED_M0",
  },
} as const;

export const CARESLINK_V1_NATIVE_M0_READ_SEQUENCE = [
  "SUPABASE_PKCE_OR_EMAIL_SESSION",
  "SECURESTORE_SESSION",
  "GET_V1_ME_IDENTITY_PROOF",
  "GET_V1_DOCUMENTS",
  "GET_V1_SYNC_PULL",
] as const;

/**
 * Exact join to every dot capability id in the Product OpenAPI. A consumer may
 * generate only `read`; every entry remains default-off, and `disabled` must
 * never become callable merely because it is present in the contract.
 */
export const CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST = {
  openApiOperationCount: 20,
  defaultEnabled: false,
  read: ["identity.me.read", "documents.list.read", "sync.pull.read"],
  disabled: [
    "native.auth.callback.disabled",
    "native.session.list.disabled",
    "native.device.list.disabled",
    "native.session.revoke-one.disabled",
    "native.session.revoke-all.disabled",
    "notes.catalog.read.disabled",
    "documents.create.write.disabled",
    "documents.detail.read.disabled",
    "documents.revision.write.disabled",
    "documents.tombstone.write.disabled",
    "documents.checkpoint.write.disabled",
    "sync.push.write.disabled",
    "privacy.review.write.disabled",
    "points.quote.disabled",
    "points.reserve.disabled",
    "points.commit.disabled",
    "points.release.disabled",
  ],
} as const;

export const CARESLINK_V1_NATIVE_PREVIEW_ACTIVATION_GATES = [
  "EXACT_NON_PRODUCTION_SUPABASE_REF",
  "MOBILE_IOS_AND_ANDROID_REDIRECT_URIS_CONFIRMED",
  "EXACT_PREVIEW_REDIRECT_ALLOWLIST",
  "EMAIL_GOOGLE_MICROSOFT_APPLE_PROVIDER_FIXTURES",
  "PKCE_STATE_MISMATCH_REJECTED",
  "PKCE_CODE_REPLAY_REJECTED",
  "CALLBACK_TOKEN_QUERY_REJECTED",
  "SECURESTORE_ONLY_TOKEN_ASSERTION",
  "ME_USER_AND_SESSION_MATCH",
  "FRESH_AUTH_USERS_AND_SESSIONS_ELIGIBILITY",
  "REVOKED_SESSION_DENIED",
  "OWNER_A_B_READ_ISOLATION",
  "DOCUMENT_LIST_AND_SYNC_PULL_READ_ONLY",
  "CLEANUP_RETURNS_TEST_USERS_SESSIONS_AND_ROWS_TO_ZERO",
] as const;

/**
 * Draft subset only. This is not the future `/v1/me` identity-proof DTO; the
 * explicit upgrade blocker above lists the still-missing server-owned fields.
 */
export type CaresLinkV1NativeIdentityProofDraftSubset = Readonly<{
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  nativeAuthContractVersion: typeof CARESLINK_V1_NATIVE_AUTH_CONTRACT_VERSION;
  userId: string;
  sessionId: string;
  accessTokenExpiresAt: string;
  provider: CaresLinkV1NativeAuthProvider;
  refreshMode: typeof CARESLINK_V1_NATIVE_SESSION_POLICY.refreshMode;
}>;

export type CaresLinkV1NativeSessionRevocationResult = Readonly<{
  scope: "ONE" | "ALL";
  sessionId: string | null;
  revokedCurrentSession: boolean;
  revokedAt: string;
  clientCleanup: "NONE" | "SIGN_OUT_WIPE_REBUILD";
}>;
