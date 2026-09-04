import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARESLINK_V1_NATIVE_AUTH_CONTRACT_STATUS,
  CARESLINK_V1_NATIVE_AUTH_CONTRACT_VERSION,
  CARESLINK_V1_NATIVE_AUTH_PROVIDER_MAPPING,
  CARESLINK_V1_NATIVE_AUTH_PROVIDERS,
  CARESLINK_V1_NATIVE_IDENTITY_POLICY,
  CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST,
  CARESLINK_V1_NATIVE_M0_READ_SEQUENCE,
  CARESLINK_V1_NATIVE_ME_IDENTITY_PROOF_UPGRADE,
  CARESLINK_V1_NATIVE_PKCE_POLICY,
  CARESLINK_V1_NATIVE_PREVIEW_ACTIVATION_GATES,
  CARESLINK_V1_NATIVE_REDIRECT_URI_ALLOWLIST,
  CARESLINK_V1_NATIVE_REDIRECT_ALLOWLIST_STATUS,
  CARESLINK_V1_NATIVE_SESSION_ENDPOINTS,
  CARESLINK_V1_NATIVE_SESSION_POLICY,
  type CaresLinkV1NativeIdentityProofDraftSubset,
} from "./native-auth-contract";
import { CARESLINK_V1_CONTRACT_VERSION } from "./shared-contracts";

describe("CaresLink V1 native-auth M0 contract", () => {
  it("publishes a machine-readable package aligned with the TypeScript SDK", () => {
    const packageContract = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "contracts/careslink-v1-native-auth.preview.json",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;

    expect(packageContract).toMatchObject({
      kind: "CARESLINK_NATIVE_AUTH_MANIFEST",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      nativeAuthContractVersion: CARESLINK_V1_NATIVE_AUTH_CONTRACT_VERSION,
      status: CARESLINK_V1_NATIVE_AUTH_CONTRACT_STATUS,
      providers: CARESLINK_V1_NATIVE_AUTH_PROVIDER_MAPPING,
      redirectAllowlist: CARESLINK_V1_NATIVE_REDIRECT_URI_ALLOWLIST,
      sessionEndpoints: CARESLINK_V1_NATIVE_SESSION_ENDPOINTS,
      m0ReadSequence: CARESLINK_V1_NATIVE_M0_READ_SEQUENCE,
      m0Capabilities: CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST,
      redirectAllowlistStatus: CARESLINK_V1_NATIVE_REDIRECT_ALLOWLIST_STATUS,
      previewActivationGates: CARESLINK_V1_NATIVE_PREVIEW_ACTIVATION_GATES,
    });
    expect(packageContract).not.toHaveProperty("$schema");
    expect(packageContract.pkce).toEqual(CARESLINK_V1_NATIVE_PKCE_POLICY);
    expect(packageContract.session).toEqual(CARESLINK_V1_NATIVE_SESSION_POLICY);
    expect(packageContract.identityLinking).toEqual(
      CARESLINK_V1_NATIVE_IDENTITY_POLICY,
    );
    expect(packageContract.meIdentityProofUpgrade).toEqual(
      CARESLINK_V1_NATIVE_ME_IDENTITY_PROOF_UPGRADE,
    );
  });

  it("versions the draft contract without enabling runtime", () => {
    expect(CARESLINK_V1_NATIVE_AUTH_CONTRACT_VERSION).toBe(
      "2026-08-14.preview.1",
    );
    expect(CARESLINK_V1_NATIVE_AUTH_CONTRACT_STATUS).toBe(
      "VERSIONED_DRAFT_RUNTIME_DISABLED",
    );
    expect(CARESLINK_V1_NATIVE_AUTH_PROVIDERS).toEqual([
      "email",
      "google",
      "microsoft",
      "apple",
    ]);
    expect(CARESLINK_V1_NATIVE_AUTH_PROVIDER_MAPPING.microsoft).toEqual({
      supabaseProvider: "azure",
      flow: "OAUTH_PKCE_S256",
      pkceRequired: true,
    });
  });

  it("freezes S256 and replay rules while leaving redirects fail-closed", () => {
    expect(CARESLINK_V1_NATIVE_REDIRECT_URI_ALLOWLIST).toEqual({
      preview: {
        ios: [],
        android: [],
      },
      production: [],
    });
    expect(CARESLINK_V1_NATIVE_REDIRECT_ALLOWLIST_STATUS).toBe(
      "MOBILE_REDIRECT_URIS_UNCONFIRMED",
    );
    expect(CARESLINK_V1_NATIVE_PKCE_POLICY).toMatchObject({
      method: "S256",
      stateEntropyBitsMinimum: 128,
      attemptTtlSeconds: 600,
      maximumPendingAttemptsPerInstallation: 1,
      authorizationCodeSingleUse: true,
      stateSingleUse: true,
      exchangeOwner: "SUPABASE_NATIVE_SDK",
      productApiCallbackEndpoint: "RESERVED_DISABLED_NOT_USED_BY_M0",
    });
    expect(
      new RegExp(CARESLINK_V1_NATIVE_PKCE_POLICY.verifierPattern).test(
        "a".repeat(43),
      ),
    ).toBe(true);
    expect(
      new RegExp(CARESLINK_V1_NATIVE_PKCE_POLICY.statePattern).test(
        "b".repeat(43),
      ),
    ).toBe(true);
    expect(CARESLINK_V1_NATIVE_PKCE_POLICY.callbackForbiddenQueryKeys).toEqual(
      expect.arrayContaining(["access_token", "refresh_token"]),
    );
  });

  it("keeps token material in the native SDK and SecureStore only", () => {
    expect(CARESLINK_V1_NATIVE_SESSION_POLICY).toMatchObject({
      accessTokenTransport: "AUTHORIZATION_BEARER_HEADER_ONLY",
      accessTokenPersistence: "SECURESTORE_ONLY",
      refreshTokenTransport: "SUPABASE_NATIVE_SDK_ONLY",
      refreshTokenPersistence: "SECURESTORE_ONLY",
      tokenInUrl: "FORBIDDEN",
      tokenInProductApiBody: "FORBIDDEN",
      identityProofEndpoint: "/v1/me",
      requiredProofMatches: ["userId", "sessionId"],
      refreshFailureAction: "SIGN_OUT_WIPE_REBUILD",
    });
    expect(CARESLINK_V1_NATIVE_SESSION_POLICY.serverEligibilitySources).toEqual([
      "auth.users",
      "auth.sessions",
    ]);
    expect(CARESLINK_V1_NATIVE_SESSION_POLICY.forbiddenEligibilitySources).toEqual(
      expect.arrayContaining(["raw_user_metadata", "jwt_user_metadata"]),
    );
  });

  it("makes the expanded me identity proof an explicit version-bump blocker", () => {
    expect(CARESLINK_V1_NATIVE_ME_IDENTITY_PROOF_UPGRADE).toMatchObject({
      availability: "BLOCKED_REQUIRES_PRODUCT_CONTRACT_VERSION_BUMP",
      currentProductContractVersion: CARESLINK_V1_CONTRACT_VERSION,
      currentMeResponseSatisfiesUpgrade: false,
      requiredServerFields: expect.arrayContaining([
        "userId",
        "sessionId",
        "accessTokenExpiresAt",
        "sessionNotAfter",
        "provider",
        "linkedProviders",
        "refreshMode",
        "capabilities",
      ]),
      authoritativeSources: expect.arrayContaining([
        "auth.users",
        "auth.sessions",
        "auth.identities",
      ]),
    });
  });

  it("never merges identities by email and keeps linking disabled in M0", () => {
    expect(CARESLINK_V1_NATIVE_IDENTITY_POLICY).toMatchObject({
      accountAnchor: "SUPABASE_AUTH_USER_UUID",
      automaticEmailMerge: false,
      clientSelectedOwnerId: false,
      rawUserMetadataAuthorization: false,
      linkingAvailability: "DISABLED_M0",
      conflictErrorCode: "IDENTITY_LINK_CONFLICT",
      applePrivateRelayRule: "NEVER_MERGE_BY_EMAIL_ALONE",
      unlinkLastIdentity: "FORBIDDEN",
    });
  });

  it("freezes revoke-one/all shapes while keeping both unavailable", () => {
    expect(CARESLINK_V1_NATIVE_SESSION_ENDPOINTS).toEqual({
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
    });
  });

  it("allows only identity proof and read APIs after a verified session", () => {
    expect(CARESLINK_V1_NATIVE_M0_READ_SEQUENCE).toEqual([
      "SUPABASE_PKCE_OR_EMAIL_SESSION",
      "SECURESTORE_SESSION",
      "GET_V1_ME_IDENTITY_PROOF",
      "GET_V1_DOCUMENTS",
      "GET_V1_SYNC_PULL",
    ]);
    expect(CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST).toMatchObject({
      openApiOperationCount: 21,
      defaultEnabled: false,
      read: ["identity.me.read", "documents.list.read", "sync.pull.read"],
    });
    expect(CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST.disabled).toEqual(
      expect.arrayContaining([
        "documents.create.write.disabled",
        "documents.detail.read.disabled",
        "documents.revision.write.disabled",
        "documents.checkpoint.write.disabled",
        "documents.tombstone.write.disabled",
        "privacy.review.write.disabled",
        "sync.push.write.disabled",
        "notes.catalog.read.disabled",
        "points.wallet.read.disabled",
      ]),
    );
  });

  it("joins every M0 capability exactly to all 21 OpenAPI operations", () => {
    const openApi = readFileSync(
      join(process.cwd(), "contracts/careslink-v1-shadow.openapi.yaml"),
      "utf8",
    );
    const openApiCapabilityIds = [
      ...openApi.matchAll(
        /^[ \t]+x-careslink-capability-id:[ \t]+([^\s]+)[ \t]*$/gm,
      ),
    ].map((match) => match[1]);
    const manifestCapabilityIds = [
      ...CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST.read,
      ...CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST.disabled,
    ];

    expect(openApiCapabilityIds).toHaveLength(
      CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST.openApiOperationCount,
    );
    expect(new Set(openApiCapabilityIds).size).toBe(openApiCapabilityIds.length);
    expect(new Set(manifestCapabilityIds).size).toBe(manifestCapabilityIds.length);
    expect([...manifestCapabilityIds].sort()).toEqual(
      [...openApiCapabilityIds].sort(),
    );

    for (const capabilityId of CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST.read) {
      const block = getOpenApiCapabilityBlock(openApi, capabilityId);
      expect(block).toContain("x-careslink-sdk-target: mobile-m0");
      expect(block).toContain("x-careslink-default-enabled: false");
    }
    for (const capabilityId of
      CARESLINK_V1_NATIVE_M0_CAPABILITY_MANIFEST.disabled) {
      const block = getOpenApiCapabilityBlock(openApi, capabilityId);
      expect(block).toContain("x-careslink-sdk-target: disabled-boundary");
      expect(block).toContain("x-careslink-default-enabled: false");
    }
  });

  it("requires Preview provider, replay, identity and cleanup evidence", () => {
    expect(CARESLINK_V1_NATIVE_PREVIEW_ACTIVATION_GATES).toEqual(
      expect.arrayContaining([
        "EMAIL_GOOGLE_MICROSOFT_APPLE_PROVIDER_FIXTURES",
        "MOBILE_IOS_AND_ANDROID_REDIRECT_URIS_CONFIRMED",
        "PKCE_STATE_MISMATCH_REJECTED",
        "PKCE_CODE_REPLAY_REJECTED",
        "ME_USER_AND_SESSION_MATCH",
        "FRESH_AUTH_USERS_AND_SESSIONS_ELIGIBILITY",
        "REVOKED_SESSION_DENIED",
        "OWNER_A_B_READ_ISOLATION",
      ]),
    );
  });

  it("defines a draft identity-proof subset without exposing either token", () => {
    const session: CaresLinkV1NativeIdentityProofDraftSubset = {
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      nativeAuthContractVersion: CARESLINK_V1_NATIVE_AUTH_CONTRACT_VERSION,
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      accessTokenExpiresAt: "2026-08-14T12:00:00.000Z",
      provider: "google",
      refreshMode: "SUPABASE_ROTATING_REFRESH_TOKEN",
    };

    expect(session).not.toHaveProperty("accessToken");
    expect(session).not.toHaveProperty("refreshToken");
  });
});

function getOpenApiCapabilityBlock(openApi: string, capabilityId: string) {
  const marker = `      x-careslink-capability-id: ${capabilityId}\n`;
  const start = openApi.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const remainder = openApi.slice(start + marker.length);
  const nextOperation = remainder.search(/^      operationId:/m);
  const nextPath = remainder.search(/^  \/v1\//m);
  const candidates = [nextOperation, nextPath].filter((value) => value >= 0);
  const end = candidates.length === 0 ? remainder.length : Math.min(...candidates);
  return openApi.slice(start, start + marker.length + end);
}
