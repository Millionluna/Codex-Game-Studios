import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";

const captured = vi.hoisted(() => {
  class FakePgClient {
    static constructed = 0;

    constructor() {
      FakePgClient.constructed += 1;
    }

    async connect() {}

    async query() {
      return { rows: [] };
    }

    async end() {}

    on() {
      return this;
    }
  }

  const runtimeBundle = Object.freeze({
    status: "OPAQUE_TEST_ONLY_M1T_RUNTIME_BUNDLE" as const,
    databaseTarget: Object.freeze({ status: "OPAQUE_TEST_TARGET" }),
    runtimePort: Object.freeze({ status: "OPAQUE_TEST_RUNTIME_PORT" }),
  });

  return {
    FakePgClient,
    runtimeBundle,
    identitiesFactory: vi.fn(async () => runtimeBundle),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Client: captured.FakePgClient }));
vi.mock(
  "./communication-note-preview-product-runtime-identities.server",
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import("./communication-note-preview-product-runtime-identities.server")
    >();
    return {
      ...original,
      createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities:
        captured.identitiesFactory,
    };
  },
);

import * as platformAdapters from "./communication-note-preview-product-runtime-platform-adapters.server";

const NOW = "2026-09-01T12:00:00.000Z";
const OBSERVED_AT = "2026-09-01T11:58:00.000Z";
const EXPIRES_AT = "2026-09-01T12:04:00.000Z";
const TARGET_PROJECT_REF = "abcdefghijklmnopqrst";
const PRODUCTION_PROJECT_REF = "adocsnwnslxhxcjgbyee";
const SOURCE_REVISION_SHA256 = sha256("m1t-source-revision");
const SOURCE_MANIFEST_SHA256 = sha256("m1t-source-manifest");
const VERCEL_TEAM_ID_SHA256 = sha256("m1t-vercel-team");
const VERCEL_PROJECT_ID_SHA256 = sha256("m1t-vercel-project");
const WORKLOAD_PRINCIPAL_SHA256 = sha256("m1t-workload-principal");
const DEPLOYMENT_REFERENCE_SHA256 = sha256("m1t-deployment-reference");
const SOURCE_MANIFEST_EVIDENCE_SHA256 = sha256(
  "m1t-source-manifest-evidence",
);
const MANAGEMENT_PRINCIPAL_SHA256 = sha256("m1t-management-principal");
const MANAGEMENT_CREDENTIAL_SHA256 = sha256("m1t-management-credential");
const MANAGEMENT_OAUTH_APP_REFERENCE_SHA256 = sha256(
  "m1t-management-oauth-app",
);
const MANAGEMENT_OAUTH_GRANT_REFERENCE_SHA256 = sha256(
  "m1t-management-oauth-grant",
);
const M1S_DEPLOYMENT_EVIDENCE_SHA256 = sha256(
  "m1s-deployment-identity-evidence",
);
const PROJECT_HMAC_KEY_REFERENCE_SHA256 = sha256(
  "m1t-project-hmac-key-reference",
);
const CA_CUSTODY_REFERENCE_SHA256 = sha256("m1t-ca-custody-reference");
const CA_BYTES = new TextEncoder().encode(
  "M1t source-only pinned root certificate fixture",
);
const CA_SHA256 = sha256(CA_BYTES);
const MANAGEMENT_ACCESS_TOKEN =
  "m1t-management-oauth2-access-token-test-only";
const DATABASE_PASSWORD = "M1tDatabasePasswordTestOnly_123456";
const SECRET_SENTINEL = "M1T_SECRET_SENTINEL_MUST_NEVER_ESCAPE";
const BRANCH_ID = "11111111-1111-4111-8111-111111111111";
const DRIFTED_BRANCH_ID = "22222222-2222-4222-8222-222222222222";
const MANAGEMENT_URL =
  `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/branches`;

const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message:
    "Communication Note preview product runtime platform adapters are unavailable",
});

type CallContext = Readonly<{ signal: AbortSignal }>;

type ManagementResponseFixture = Readonly<{
  status: number;
  contentType: string;
  redirected: boolean;
  responseUrl: string;
  body: Uint8Array;
  rawCredentialMaterialPresent: boolean;
}>;

type CapturedM1sOptions = Readonly<{
  deploymentIdentityAttestationPort: Readonly<{
    attest(request: unknown, context: unknown): Promise<unknown>;
  }>;
  authenticatedControlPlaneObservationPort: Readonly<{
    observe(request: unknown, context: unknown): Promise<unknown>;
  }>;
  projectRefHmacPort: Readonly<{
    hmac(request: unknown, context: unknown): Promise<unknown>;
  }>;
  pinnedCaLoader: Readonly<{
    load(request: unknown, context: unknown): Promise<unknown>;
  }>;
  managementCredentialCustodyPort: Readonly<{
    consume(
      request: unknown,
      context: unknown,
      consumer: (credential: unknown) => PromiseLike<void>,
    ): Promise<void>;
  }>;
}>;

describe("Communication Note M1t product runtime platform adapters", () => {
  beforeEach(() => {
    captured.FakePgClient.constructed = 0;
    captured.identitiesFactory.mockReset();
    captured.identitiesFactory.mockImplementation(
      async () => captured.runtimeBundle,
    );
  });

  it("has exactly seven runtime exports and keeps the formal source boundary fixed-off", async () => {
    expect(Object.keys(platformAdapters).sort()).toEqual([
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_DIGEST",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_READY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_VERSION",
      "createCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters",
      "createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters",
    ]);
    expect(
      platformAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_VERSION,
    ).toBe(
      "platform-adapters.communication.openai.synthetic-preview.2026-09-01.m1t.v2",
    );
    expect(
      platformAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_READY,
    ).toBe(false);
    expect(
      platformAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS,
    ).toBeUndefined();
    expect(
      platformAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_DIGEST,
    ).toBe(
      "d1cbf263a7c6704f8cf24e58555c24ae2c45f4450b00b37d0f0897ecded76a6d",
    );
    expect(
      canonicalSha256(
        withoutPolicyDigest(
          platformAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY,
        ),
      ),
    ).toBe(
      platformAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_DIGEST,
    );
    expect(
      platformAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY,
    ).toMatchObject({
      status: "SOURCE_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_NOT_ACTIVATED",
      ready: false,
      sourceOnly: true,
      nodeRuntimeRequired: true,
      edgeRuntimeSupported: false,
      protocolImplementationPresent: true,
      cloudProviderSelected: false,
      workloadIdentityConfigured: false,
      kmsConfigured: false,
      secretManagerConfigured: false,
      liveEvidencePresent: false,
      supabaseManagementApiOrigin: "https://api.supabase.com",
      supabaseManagementApiAllowedMethod: "GET",
      supabaseManagementApiAllowedPath:
        "/v1/projects/{production_ref}/branches",
      supabaseBranchConfigPathAllowed: false,
      supabaseManagementAuthorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
      supabaseManagementOAuthScope: "environment:read",
      supabaseManagementScopeAttestationSource:
        "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
      supabaseManagementOAuthAppReferenceRequired: true,
      supabaseManagementOAuthGrantReferenceRequired: true,
      supabaseManagementEndpointAllowlistEnforced: true,
      supabaseManagementFineGrainedTokenPermissionClaimed: false,
      supabaseManagementPatAllowed: false,
      supabaseManagementMaximumResponseBytes: 131_072,
      supabaseManagementTimeoutMs: 5_000,
      supabaseManagementRedirectsAllowed: false,
      supabaseManagementAutomaticRetries: 0,
      controlPlaneConsistency:
        "EXACT_SAFE_BRANCH_SNAPSHOT_RECHECK_BEFORE_DATABASE_CREDENTIAL_RELEASE",
      underlyingDatabaseCredentialShortLived: false,
      databaseCredentialSourceExpiresAt: null,
      productRouteImporterPresent: false,
      deploymentApproved: false,
      activationApproved: false,
    });
    expect(
      Object.isFrozen(
        platformAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY,
      ),
    ).toBe(true);

    let traps = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          traps += 1;
          return SECRET_SENTINEL;
        },
        getOwnPropertyDescriptor() {
          traps += 1;
          return undefined;
        },
        getPrototypeOf() {
          traps += 1;
          return Object.prototype;
        },
        ownKeys() {
          traps += 1;
          return [];
        },
      },
    );
    await expect(
      platformAdapters.createCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters(
        hostile,
        hostile,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(traps).toBe(0);
    expect(captured.identitiesFactory).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);

    const source = readFileSync(
      new URL(
        "./communication-note-preview-product-runtime-platform-adapters.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|Deno\.env|Bun\.env|fetch\s*\(|@supabase\/|@vercel\/|node:(?:http|https|net|tls)|SUPABASE_(?:ACCESS_TOKEN|SECRET_KEY|SERVICE_ROLE_KEY)|DATABASE_URL|connectionString\s*:|console\.(?:debug|error|info|log|warn)|\blogger\b/i,
    );
  });

  it("issues only the exact safe branch-list GET request with redirect, timeout and body caps", async () => {
    const composed = await composeCaptured();
    await attestWorkload(composed);
    const envelope = await observeBranch(composed);

    expect(composed.harness.workloadVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "VERIFY_VERCEL_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST",
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        sourceManifestSha256: SOURCE_MANIFEST_SHA256,
        postgresMajor: 17,
        connectionMode: "DIRECT",
        targetProjectRef: TARGET_PROJECT_REF,
      }),
      composed.context,
    );
    expect(composed.harness.managementCredentialConsume).toHaveBeenCalledTimes(
      1,
    );
    expect(
      composed.harness.managementCredentialConsume.mock.calls[0]?.[0],
    ).toEqual({
      purpose: "CONSUME_SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN",
      managementApiOrigin: "https://api.supabase.com",
      authorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
      oauthScope: "environment:read",
      oauthAppReferenceSha256: MANAGEMENT_OAUTH_APP_REFERENCE_SHA256,
      oauthGrantReferenceSha256:
        MANAGEMENT_OAUTH_GRANT_REFERENCE_SHA256,
      scopeAttestationSource:
        "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
      endpointAllowlistEnforced: true,
      productionProjectRef: PRODUCTION_PROJECT_REF,
      targetProjectRef: TARGET_PROJECT_REF,
      sourceRevisionSha256: SOURCE_REVISION_SHA256,
      deploymentIdentityEvidenceSha256:
        M1S_DEPLOYMENT_EVIDENCE_SHA256,
      sourceManifestEvidenceSha256: SOURCE_MANIFEST_EVIDENCE_SHA256,
    });
    expect(composed.harness.managementRequest).toHaveBeenCalledTimes(1);
    expect(composed.harness.managementRequest).toHaveBeenCalledWith(
      {
        method: "GET",
        url: MANAGEMENT_URL,
        headers: { accept: "application/json" },
        redirect: "ERROR",
        timeoutMs: 5_000,
        maximumResponseBytes: 131_072,
      },
      MANAGEMENT_ACCESS_TOKEN,
      composed.context,
    );
    expect(envelope).toMatchObject({
      identity: {
        source: "SUPABASE_MANAGEMENT_API",
        authorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
        oauthScope: "environment:read",
        oauthAppReferenceSha256: MANAGEMENT_OAUTH_APP_REFERENCE_SHA256,
        oauthGrantReferenceSha256:
          MANAGEMENT_OAUTH_GRANT_REFERENCE_SHA256,
        scopeAttestationSource:
          "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
        endpointAllowlistEnforced: true,
        rawCredentialMaterialPresent: false,
      },
      observation: {
        targetProjectRef: TARGET_PROJECT_REF,
        parentProjectRef: PRODUCTION_PROJECT_REF,
        defaultBranch: false,
        persistent: false,
        withData: false,
        postgresMajor: 17,
        projectStatus: "ACTIVE_HEALTHY",
        endpoint: {
          connectionMode: "DIRECT",
          hostname: `db.${TARGET_PROJECT_REF}.supabase.co`,
          port: 5432,
          database: "postgres",
        },
        rawCredentialMaterialPresent: false,
      },
    });
    expect(JSON.stringify(envelope)).not.toContain(MANAGEMENT_ACCESS_TOKEN);
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("accepts a safe official branch record when deprecated and optional fields are omitted", async () => {
    const harness = validHarness();
    harness.managementRequest.mockResolvedValueOnce(
      validManagementResponse({
        body: encodeJson([
          {
            id: BRANCH_ID,
            project_ref: TARGET_PROJECT_REF,
            parent_project_ref: PRODUCTION_PROJECT_REF,
            is_default: false,
            persistent: false,
            with_data: false,
            preview_project_status: "ACTIVE_HEALTHY",
          },
        ]),
      }),
    );
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);

    const envelope = await observeBranch(composed);

    expect(envelope.observation).toMatchObject({
      targetProjectRef: TARGET_PROJECT_REF,
      parentProjectRef: PRODUCTION_PROJECT_REF,
      defaultBranch: false,
      persistent: false,
      withData: false,
      projectStatus: "ACTIVE_HEALTHY",
    });
    expect(harness.managementRequest).toHaveBeenCalledTimes(1);
    expect(harness.pinnedCaLoad).not.toHaveBeenCalled();
    expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it.each([
    ["wrong authorization model", { authorizationModel: "FINE_GRAINED_TOKEN" }],
    ["wrong OAuth scope", { oauthScope: "environment:write" }],
    [
      "wrong OAuth app reference",
      { oauthAppReferenceSha256: sha256("wrong-oauth-app") },
    ],
    [
      "wrong OAuth grant reference",
      { oauthGrantReferenceSha256: sha256("wrong-oauth-grant") },
    ],
    [
      "reused OAuth grant reference",
      { oauthGrantReferenceSha256: MANAGEMENT_OAUTH_APP_REFERENCE_SHA256 },
    ],
    [
      "wrong scope attestation source",
      { scopeAttestationSource: "TOKEN_SELF_ASSERTION" },
    ],
    ["disabled endpoint allowlist", { endpointAllowlistEnforced: false }],
    [
      "fine-grained token permission claim",
      { permission: "BRANCHING_DEVELOPMENT_READ" },
    ],
  ])("rejects a Management OAuth attestation with %s", async (
    _label,
    mutation,
  ) => {
    const harness = validHarness();
    harness.managementCredentialConsume.mockImplementationOnce(
      async (_request, _context, consumer) => {
        await consumer(
          MANAGEMENT_ACCESS_TOKEN,
          Object.freeze({
            ...validManagementAttestation(),
            ...mutation,
          }),
        );
      },
    );
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);

    const error = await captureRejection(observeBranch(composed));

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(harness.managementRequest).not.toHaveBeenCalled();
    expect(harness.pinnedCaLoad).not.toHaveBeenCalled();
    expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("rejects reused OAuth app/grant references before external authority", async () => {
    const harness = validHarness();
    const error = await captureRejection(
      platformAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters(
        {
          ...harness.options,
          platformRequest: Object.freeze({
            ...harness.options.platformRequest,
            managementOAuthGrantReferenceSha256:
              MANAGEMENT_OAUTH_APP_REFERENCE_SHA256,
          }),
        },
        Object.freeze({ signal: new AbortController().signal }),
      ),
    );

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(harness.workloadVerify).not.toHaveBeenCalled();
    expect(harness.managementCredentialConsume).not.toHaveBeenCalled();
    expect(harness.managementRequest).not.toHaveBeenCalled();
    expect(captured.identitiesFactory).not.toHaveBeenCalled();
  });

  it.each([
    [
      "redirect",
      (response: ReturnType<typeof validManagementResponse>) => ({
        ...response,
        redirected: true,
      }),
    ],
    [
      "response URL drift",
      (response: ReturnType<typeof validManagementResponse>) => ({
        ...response,
        responseUrl: "https://attacker.invalid/branches",
      }),
    ],
    [
      "non-JSON content type",
      (response: ReturnType<typeof validManagementResponse>) => ({
        ...response,
        contentType: "text/html",
      }),
    ],
    [
      "oversized body",
      (response: ReturnType<typeof validManagementResponse>) => ({
        ...response,
        body: new Uint8Array(131_073),
      }),
    ],
  ])("rejects a branch-list response with %s", async (_label, mutate) => {
    const harness = validHarness();
    harness.managementRequest.mockResolvedValueOnce(
      mutate(validManagementResponse()),
    );
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);

    const error = await captureRejection(observeBranch(composed));

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
    expect(harness.managedHmac).toHaveBeenCalledTimes(2);
    expect(harness.pinnedCaLoad).not.toHaveBeenCalled();
    expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it.each([
    ["HTTP 429", validManagementResponse({ status: 429 })],
    ["HTTP 500", validManagementResponse({ status: 500 })],
    [
      "missing target",
      validManagementResponse({ body: encodeJson([]) }),
    ],
    [
      "duplicate target",
      validManagementResponse({
        body: encodeJson([
          validBranch(),
          validBranch({ id: DRIFTED_BRANCH_ID }),
        ]),
      }),
    ],
    [
      "unknown field",
      validManagementResponse({
        body: encodeJson([validBranch({ unexpected_field: "denied" })]),
      }),
    ],
    [
      "malformed JSON",
      validManagementResponse({ body: encodeText('[{"id":') }),
    ],
    [
      "duplicate JSON key",
      validManagementResponse({ body: duplicateProjectRefBody() }),
    ],
  ])("rejects a branch-list response with %s", async (_label, response) => {
    const harness = validHarness();
    harness.managementRequest.mockResolvedValueOnce(response);
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);

    const error = await captureRejection(observeBranch(composed));

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(harness.managementRequest).toHaveBeenCalledTimes(1);
    expect(harness.pinnedCaLoad).not.toHaveBeenCalled();
    expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it.each([
    ["future", { observedAt: "2026-09-01T12:01:00.000Z" }],
    ["expired", { expiresAt: "2026-09-01T11:59:00.000Z" }],
    ["wrong PostgreSQL major", { postgresMajor: 16 }],
    ["wrong source manifest", { sourceManifestSha256: sha256("wrong") }],
  ])("rejects %s workload evidence before any control-plane call", async (
    _label,
    overrides,
  ) => {
    const harness = validHarness();
    harness.workloadVerify.mockResolvedValueOnce(
      validWorkloadIdentity(overrides),
    );
    const composed = await composeCaptured(harness);

    const error = await captureRejection(attestWorkload(composed));

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(harness.managedHmac).not.toHaveBeenCalled();
    expect(harness.managementCredentialConsume).not.toHaveBeenCalled();
    expect(harness.managementRequest).not.toHaveBeenCalled();
  });

  it("rejects clock rollback before reusing workload evidence", async () => {
    const harness = validHarness();
    harness.options.clock.now
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce("2026-09-01T11:59:59.999Z");
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);

    const error = await captureRejection(observeBranch(composed));

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(harness.managementCredentialConsume).not.toHaveBeenCalled();
    expect(harness.managementRequest).not.toHaveBeenCalled();
  });

  it("rejects a managed-HMAC purpose substitution", async () => {
    const harness = validHarness();
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);
    const envelope = await observeBranch(composed);
    harness.managedHmac.mockResolvedValueOnce(
      Object.freeze({
        status: "MANAGED_HMAC_SHA256_NOT_APPROVED" as const,
        purpose: "VERCEL_WORKLOAD_IDENTITY_BINDING" as const,
        macSha256: sha256("substituted-mac"),
        keyReferenceSha256: PROJECT_HMAC_KEY_REFERENCE_SHA256,
        keyVersionSha256: sha256("substituted-key-version"),
        rawKeyMaterialPresent: false as const,
      }),
    );

    const error = await captureRejection(
      composed.identityOptions.projectRefHmacPort.hmac(
        projectRefHmacRequest(envelope),
        composed.context,
      ),
    );

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it.each([
    ["digest mismatch", new TextEncoder().encode("wrong-ca")],
    ["oversized bytes", new Uint8Array(65_537)],
  ])("rejects pinned CA %s", async (_label, bytes) => {
    const harness = validHarness();
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);
    const envelope = await observeBranch(composed);
    harness.pinnedCaLoad.mockResolvedValueOnce(
      Object.freeze({
        tlsRootCertificate: bytes,
        custodyReferenceSha256: CA_CUSTODY_REFERENCE_SHA256,
        rawCredentialMaterialPresent: false as const,
      }),
    );

    const error = await captureRejection(
      composed.identityOptions.pinnedCaLoader.load(
        pinnedCaRequest(envelope),
        composed.context,
      ),
    );

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it.each(["proxy", "accessor"])(
    "rejects a %s managed-HMAC port before external authority",
    async (kind) => {
      const harness = validHarness();
      let traps = 0;
      let invalidPort: object;
      if (kind === "proxy") {
        invalidPort = new Proxy(
          {},
          {
            get() {
              traps += 1;
              return harness.managedHmac;
            },
            getOwnPropertyDescriptor() {
              traps += 1;
              return undefined;
            },
            getPrototypeOf() {
              traps += 1;
              return Object.prototype;
            },
            ownKeys() {
              traps += 1;
              return ["hmac"];
            },
          },
        );
      } else {
        invalidPort = {};
        Object.defineProperty(invalidPort, "hmac", {
          enumerable: true,
          get() {
            traps += 1;
            return harness.managedHmac;
          },
        });
        Object.freeze(invalidPort);
      }

      const error = await captureRejection(
        platformAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters(
          { ...harness.options, managedHmacPort: invalidPort },
          Object.freeze({ signal: new AbortController().signal }),
        ),
      );

      expect(error).toMatchObject(FIXED_FAILURE);
      expect(traps).toBe(0);
      expect(harness.workloadVerify).not.toHaveBeenCalled();
      expect(captured.identitiesFactory).not.toHaveBeenCalled();
    },
  );

  it("rejects a secret-bearing Management API body without leaking it", async () => {
    const harness = validHarness();
    harness.managementRequest.mockResolvedValueOnce(
      validManagementResponse({
        body: encodeJson([
          {
            ...validBranch(),
            database_password: SECRET_SENTINEL,
          },
        ]),
      }),
    );
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);

    const error = await captureRejection(observeBranch(composed));

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
    expect(harness.pinnedCaLoad).not.toHaveBeenCalled();
    expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("rejects a double Management credential callback after one bounded HTTPS request", async () => {
    const harness = validHarness();
    harness.managementCredentialConsume.mockImplementationOnce(
      async (_request, _context, consumer) => {
        await consumer(MANAGEMENT_ACCESS_TOKEN, validManagementAttestation());
        await consumer(SECRET_SENTINEL, validManagementAttestation());
      },
    );
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);

    const error = await captureRejection(observeBranch(composed));

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
    expect(harness.managementRequest).toHaveBeenCalledTimes(1);
    expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("rechecks the exact safe branch snapshot before releasing one database credential", async () => {
    const events: string[] = [];
    const harness = validHarness();
    harness.managementCredentialConsume.mockImplementation(
      async (_request, _context, consumer) => {
        events.push("management-credential");
        await consumer(MANAGEMENT_ACCESS_TOKEN, validManagementAttestation());
      },
    );
    harness.managementRequest.mockImplementation(async () => {
      events.push("management-http");
      return validManagementResponse();
    });
    harness.databaseCredentialConsume.mockImplementation(
      async (_request, _context, consumer) => {
        events.push("database-custody");
        await consumer(DATABASE_PASSWORD);
      },
    );
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);
    const envelope = await observeBranch(composed);
    events.length = 0;
    const delivered: unknown[] = [];

    await composed.identityOptions.managementCredentialCustodyPort.consume(
      databaseCredentialRequest(envelope),
      composed.context,
      async (credential) => {
        events.push("database-consumer");
        delivered.push(credential);
      },
    );

    expect(events).toEqual([
      "management-credential",
      "management-http",
      "database-custody",
      "database-consumer",
    ]);
    expect(harness.managementCredentialConsume).toHaveBeenCalledTimes(2);
    expect(harness.managementRequest).toHaveBeenCalledTimes(2);
    expect(harness.databaseCredentialConsume).toHaveBeenCalledTimes(1);
    expect(harness.databaseCredentialConsume.mock.calls[0]?.[0]).toMatchObject({
      purpose: "CONSUME_STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
      sourceRevisionSha256: SOURCE_REVISION_SHA256,
      deploymentIdentityEvidenceSha256:
        M1S_DEPLOYMENT_EVIDENCE_SHA256,
      controlPlaneEvidenceSha256: m1sControlPlaneEvidence(envelope),
      revalidatedBranchSnapshotSha256: expect.stringMatching(
        /^[a-f0-9]{64}$/,
      ),
    });
    expect(JSON.stringify(harness.databaseCredentialConsume.mock.calls[0]?.[0]))
      .not.toContain(DATABASE_PASSWORD);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
      sourceExpiresAt: null,
      sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
      deliveryOneUse: true,
      rawDsnPresent: false,
      password: DATABASE_PASSWORD,
    });
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("denies a changed branch snapshot before database custody can run", async () => {
    const harness = validHarness();
    harness.managementRequest
      .mockResolvedValueOnce(validManagementResponse())
      .mockResolvedValueOnce(
        validManagementResponse({
          body: encodeJson([
            validBranch({ id: DRIFTED_BRANCH_ID }),
          ]),
        }),
      );
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);
    const envelope = await observeBranch(composed);

    const error = await captureRejection(
      composed.identityOptions.managementCredentialCustodyPort.consume(
        databaseCredentialRequest(envelope),
        composed.context,
        vi.fn(async () => undefined),
      ),
    );

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(harness.managementRequest).toHaveBeenCalledTimes(2);
    expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("rejects a double database-secret callback and never delivers twice", async () => {
    const harness = validHarness();
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);
    const envelope = await observeBranch(composed);
    harness.databaseCredentialConsume.mockImplementationOnce(
      async (_request, _context, consumer) => {
        await consumer(DATABASE_PASSWORD);
        await consumer(`${SECRET_SENTINEL}_database_password`);
      },
    );
    const downstreamConsumer = vi.fn(async () => undefined);

    const error = await captureRejection(
      composed.identityOptions.managementCredentialCustodyPort.consume(
        databaseCredentialRequest(envelope),
        composed.context,
        downstreamConsumer,
      ),
    );

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
    expect(downstreamConsumer).toHaveBeenCalledTimes(1);
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("rejects a duplicate database callback while the first delivery is pending", async () => {
    const harness = validHarness();
    let releaseDelivery!: () => void;
    const pendingDelivery = new Promise<void>((resolve) => {
      releaseDelivery = resolve;
    });
    harness.databaseCredentialConsume.mockImplementationOnce(
      async (_request, _context, consumer) => {
        const first = consumer(DATABASE_PASSWORD);
        const duplicate = consumer(`${DATABASE_PASSWORD}_duplicate`);
        releaseDelivery();
        await first;
        await Promise.resolve(duplicate).catch(() => undefined);
      },
    );
    const composed = await composeCaptured(harness);
    await attestWorkload(composed);
    const envelope = await observeBranch(composed);
    const downstreamConsumer = vi.fn(async () => pendingDelivery);

    const error = await captureRejection(
      composed.identityOptions.managementCredentialCustodyPort.consume(
        databaseCredentialRequest(envelope),
        composed.context,
        downstreamConsumer,
      ),
    );

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(downstreamConsumer).toHaveBeenCalledTimes(1);
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("denies database credential delivery when the call aborts inside custody", async () => {
    const controller = new AbortController();
    const harness = validHarness();
    harness.databaseCredentialConsume.mockImplementationOnce(
      async (_request, _context, consumer) => {
        controller.abort();
        await consumer(DATABASE_PASSWORD);
      },
    );
    const composed = await composeCaptured(harness, controller);
    await attestWorkload(composed);
    const envelope = await observeBranch(composed);
    const downstreamConsumer = vi.fn(async () => undefined);

    const error = await captureRejection(
      composed.identityOptions.managementCredentialCustodyPort.consume(
        databaseCredentialRequest(envelope),
        composed.context,
        downstreamConsumer,
      ),
    );

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(downstreamConsumer).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("normalizes a hostile low-level failure to one fixed non-leaking error", async () => {
    const harness = validHarness();
    harness.workloadVerify.mockRejectedValueOnce(
      new Error(`${SECRET_SENTINEL}:workload-token`),
    );
    const composed = await composeCaptured(harness);

    const error = await captureRejection(attestWorkload(composed));

    expect(error).toMatchObject(FIXED_FAILURE);
    expect(JSON.stringify(error)).not.toContain(SECRET_SENTINEL);
    expect(harness.managementCredentialConsume).not.toHaveBeenCalled();
    expect(harness.managementRequest).not.toHaveBeenCalled();
    expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
    expect(captured.FakePgClient.constructed).toBe(0);
  });

  it("composes through the genuine M1t to M1s, M1r and M1m chain without constructing pg", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NOW);
      vi.doUnmock(
        "./communication-note-preview-product-runtime-identities.server",
      );
      vi.resetModules();
      const actualPlatformAdapters =
        await import("./communication-note-preview-product-runtime-platform-adapters.server");
      const { createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver } =
        await import("./communication-note-preview-runner-terminal-resolved-runtime-binding.server");
      const harness = validHarness();
      const custodyResolver =
        createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver(
          {
            capability: "TEST_ONLY_RUNNER_TERMINAL_CUSTODY_RESOLVER",
            resolve: vi.fn(),
          },
        );
      const verifiedAuthorization = deepFreezeFixture({
        statement: {
          runIdHash: sha256("m1t-genuine-run-id"),
          expiresAt: "2026-09-01T12:04:30.000Z",
        },
        authorizationDigest: sha256("m1t-genuine-authorization"),
        signature: "opaque-m1t-genuine-test-signature",
        signatureSha256: sha256("m1t-genuine-signature"),
        authenticity: "EXTERNAL_OWNER_ED25519_VERIFIED",
        verifiedAt: NOW,
      });
      const genuineOptions = {
        ...harness.options,
        custodyResolver,
        verifiedAuthorization,
      };

      const result =
        await actualPlatformAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters(
          genuineOptions,
          Object.freeze({ signal: new AbortController().signal }),
        );

      expect(result).toMatchObject({
        status: "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTER_BUNDLE_NOT_ACTIVATED",
        databaseTarget: {
          status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",
          targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
          productionExcluded: true,
          rawCredentialMaterialPresent: false,
        },
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(harness.workloadVerify).toHaveBeenCalledTimes(1);
      expect(harness.managementCredentialConsume).toHaveBeenCalledTimes(1);
      expect(harness.managementRequest).toHaveBeenCalledTimes(1);
      expect(harness.managedHmac).toHaveBeenCalledTimes(4);
      expect(harness.pinnedCaLoad).toHaveBeenCalledTimes(1);
      expect(harness.databaseCredentialConsume).not.toHaveBeenCalled();
      expect(captured.FakePgClient.constructed).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

function validHarness() {
  const workloadVerify = vi.fn(async () => validWorkloadIdentity());
  const managementCredentialConsume = vi.fn(
    async (
      _request: unknown,
      _context: unknown,
      consumer: (
        credential: unknown,
        attestation: unknown,
      ) => PromiseLike<void>,
    ) => {
      await consumer(MANAGEMENT_ACCESS_TOKEN, validManagementAttestation());
    },
  );
  const managementRequest = vi.fn(async () => validManagementResponse());
  const managedHmac = vi.fn(async (requestValue: unknown) => {
    const request = requestValue as {
      purpose: string;
      bindingSha256: string;
    };
    const projectPurpose = request.purpose === "SUPABASE_PROJECT_REF_BINDING";
    return Object.freeze({
      status: "MANAGED_HMAC_SHA256_NOT_APPROVED" as const,
      purpose: request.purpose,
      macSha256: sha256(
        `m1t-managed-mac:${request.purpose}:${request.bindingSha256}`,
      ),
      keyReferenceSha256: projectPurpose
        ? PROJECT_HMAC_KEY_REFERENCE_SHA256
        : sha256(`m1t-managed-key:${request.purpose}`),
      keyVersionSha256: projectPurpose
        ? sha256("m1t-project-hmac-key-version")
        : sha256(`m1t-managed-key-version:${request.purpose}`),
      rawKeyMaterialPresent: false as const,
    });
  });
  const pinnedCaLoad = vi.fn(async () =>
    Object.freeze({
      tlsRootCertificate: Uint8Array.from(CA_BYTES),
      custodyReferenceSha256: CA_CUSTODY_REFERENCE_SHA256,
      rawCredentialMaterialPresent: false as const,
    }),
  );
  const databaseCredentialConsume = vi.fn(
    async (
      _request: unknown,
      _context: unknown,
      consumer: (credential: unknown) => PromiseLike<void>,
    ) => {
      await consumer(DATABASE_PASSWORD);
    },
  );
  const options = {
    capability: "TEST_ONLY_M1T_PRODUCT_RUNTIME_PLATFORM_ADAPTERS",
    expectedSourceRevisionSha256: SOURCE_REVISION_SHA256,
    platformRequest: Object.freeze({
      vercelTeamIdSha256: VERCEL_TEAM_ID_SHA256,
      vercelProjectIdSha256: VERCEL_PROJECT_ID_SHA256,
      sourceManifestSha256: SOURCE_MANIFEST_SHA256,
      vercelEnvironment: "preview" as const,
      postgresMajor: 17 as const,
      connectionMode: "DIRECT" as const,
      managementCredentialClass:
        "SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" as const,
      managementAuthorizationModel: "SUPABASE_OAUTH_APP_SCOPE" as const,
      managementOAuthScope: "environment:read" as const,
      managementOAuthAppReferenceSha256:
        MANAGEMENT_OAUTH_APP_REFERENCE_SHA256,
      managementOAuthGrantReferenceSha256:
        MANAGEMENT_OAUTH_GRANT_REFERENCE_SHA256,
      managementScopeAttestationSource:
        "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" as const,
      managementEndpointAllowlistEnforced: true as const,
    }),
    targetRequest: Object.freeze({
      targetProjectRef: TARGET_PROJECT_REF,
      tlsRootCertificateSha256: CA_SHA256,
    }),
    workloadIdentityVerifierPort: Object.freeze({ verify: workloadVerify }),
    supabaseManagementCredentialPort: Object.freeze({
      consume: managementCredentialConsume,
    }),
    supabaseManagementHttpsPort: Object.freeze({
      request: managementRequest,
    }),
    managedHmacPort: Object.freeze({ hmac: managedHmac }),
    pinnedCaCustodyPort: Object.freeze({ load: pinnedCaLoad }),
    databaseCredentialCustodyPort: Object.freeze({
      consume: databaseCredentialConsume,
    }),
    verifiedAuthorization: deepFreezeFixture({
      status: "OPAQUE_VERIFIED_AUTHORIZATION",
      rawCredentialMaterialPresent: false,
    }),
    custodyResolver: Object.freeze({ resolve: vi.fn() }),
    clock: Object.freeze({ now: vi.fn(() => NOW) }),
    entropy: Object.freeze({
      bytes: vi.fn((length: number) => new Uint8Array(length).fill(11)),
    }),
  };
  return {
    options,
    workloadVerify,
    managementCredentialConsume,
    managementRequest,
    managedHmac,
    pinnedCaLoad,
    databaseCredentialConsume,
  };
}

async function composeCaptured(
  harness = validHarness(),
  controller = new AbortController(),
) {
  const context = Object.freeze({
    signal: controller.signal,
  });
  const result =
    await platformAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters(
      harness.options,
      context,
    );
  expect(result).toBe(captured.runtimeBundle);
  expect(captured.identitiesFactory).toHaveBeenCalledTimes(1);
  const [identityOptions, identityContext] =
    captured.identitiesFactory.mock.calls[0] as unknown as [
      CapturedM1sOptions,
      CallContext,
    ];
  expect(Object.keys(identityOptions)).toEqual([
    "capability",
    "expectedSourceRevisionSha256",
    "deploymentIdentityAttestationPort",
    "authenticatedControlPlaneObservationPort",
    "projectRefHmacPort",
    "pinnedCaLoader",
    "managementCredentialCustodyPort",
    "targetRequest",
    "verifiedAuthorization",
    "custodyResolver",
    "clock",
    "entropy",
  ]);
  expect(identityContext).toEqual({ signal: context.signal });
  expect(Object.isFrozen(identityContext)).toBe(true);
  return {
    harness,
    identityOptions,
    context: identityContext,
  };
}

async function attestWorkload(
  composed: Awaited<ReturnType<typeof composeCaptured>>,
) {
  return composed.identityOptions.deploymentIdentityAttestationPort.attest(
    {
      purpose: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME_IDENTITY",
      audience: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME",
      environmentClass: "NON_PRODUCTION_PREVIEW",
      sourceRevisionSha256: SOURCE_REVISION_SHA256,
      targetProjectRef: TARGET_PROJECT_REF,
      tlsRootCertificateSha256: CA_SHA256,
    },
    composed.context,
  );
}

async function observeBranch(
  composed: Awaited<ReturnType<typeof composeCaptured>>,
) {
  return composed.identityOptions.authenticatedControlPlaneObservationPort.observe(
    {
      purpose:
        "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHENTICATED_TARGET_OBSERVATION",
      source: "SUPABASE_MANAGEMENT_API",
      targetProjectRef: TARGET_PROJECT_REF,
      sourceRevisionSha256: SOURCE_REVISION_SHA256,
      deploymentIdentityEvidenceSha256:
        M1S_DEPLOYMENT_EVIDENCE_SHA256,
    },
    composed.context,
  ) as Promise<{
    identity: Readonly<Record<string, unknown>>;
    observation: Readonly<Record<string, unknown>>;
  }>;
}

function databaseCredentialRequest(envelope: {
  identity: Readonly<Record<string, unknown>>;
  observation: Readonly<Record<string, unknown>>;
}) {
  return Object.freeze({
    purpose: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANAGEMENT_SESSION",
    targetDescriptorSha256: sha256("m1t-database-target-descriptor"),
    tlsRootCertificateSha256: CA_SHA256,
    user: "postgres",
    applicationName:
      "careslink-preview-runtime-credential-broker-management",
    credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
    sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
    deliveryNonce: sha256("m1t-database-delivery-nonce"),
    deliveryExpiresNoLaterThan: EXPIRES_AT,
    maximumDeliveryLifetimeMs: 60_000,
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    deploymentIdentityEvidenceSha256:
      M1S_DEPLOYMENT_EVIDENCE_SHA256,
    controlPlaneEvidenceSha256: m1sControlPlaneEvidence(envelope),
  });
}

function projectRefHmacRequest(envelope: {
  identity: Readonly<Record<string, unknown>>;
  observation: Readonly<Record<string, unknown>>;
}) {
  return Object.freeze({
    purpose: "SUPABASE_PROJECT_REF_BINDING",
    projectRef: TARGET_PROJECT_REF,
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    deploymentIdentityEvidenceSha256:
      M1S_DEPLOYMENT_EVIDENCE_SHA256,
    controlPlaneEvidenceSha256: m1sControlPlaneEvidence(envelope),
  });
}

function pinnedCaRequest(envelope: {
  identity: Readonly<Record<string, unknown>>;
  observation: Readonly<Record<string, unknown>>;
}) {
  return Object.freeze({
    tlsRootCertificateSha256: CA_SHA256,
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    deploymentIdentityEvidenceSha256:
      M1S_DEPLOYMENT_EVIDENCE_SHA256,
    controlPlaneEvidenceSha256: m1sControlPlaneEvidence(envelope),
  });
}

function m1sControlPlaneEvidence(envelope: {
  identity: Readonly<Record<string, unknown>>;
  observation: Readonly<Record<string, unknown>>;
}) {
  return canonicalSha256({
    domain:
      "careslink.communication-note.preview.authenticated-control-plane-evidence.m1s.v2",
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    deploymentIdentityEvidenceSha256:
      M1S_DEPLOYMENT_EVIDENCE_SHA256,
    identity: envelope.identity,
    observation: envelope.observation,
  });
}

function validWorkloadIdentity(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return Object.freeze({
    status:
      "VERIFIED_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST_NOT_APPROVED" as const,
    source: "VERCEL_OIDC_WITH_MANAGED_SOURCE_MANIFEST" as const,
    vercelTeamIdSha256: VERCEL_TEAM_ID_SHA256,
    vercelProjectIdSha256: VERCEL_PROJECT_ID_SHA256,
    vercelEnvironment: "preview" as const,
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    sourceManifestSha256: SOURCE_MANIFEST_SHA256,
    postgresMajor: 17 as const,
    connectionMode: "DIRECT" as const,
    workloadPrincipalReferenceSha256: WORKLOAD_PRINCIPAL_SHA256,
    deploymentReferenceSha256: DEPLOYMENT_REFERENCE_SHA256,
    sourceManifestEvidenceSha256: SOURCE_MANIFEST_EVIDENCE_SHA256,
    observedAt: OBSERVED_AT,
    expiresAt: EXPIRES_AT,
    rawIdentityCredentialMaterialPresent: false as const,
    ...overrides,
  });
}

function validManagementAttestation() {
  return Object.freeze({
    status:
      "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED" as const,
    source: "MANAGED_SECRET_CUSTODY" as const,
    credentialClass:
      "SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" as const,
    authorizationModel: "SUPABASE_OAUTH_APP_SCOPE" as const,
    oauthScope: "environment:read" as const,
    oauthAppReferenceSha256: MANAGEMENT_OAUTH_APP_REFERENCE_SHA256,
    oauthGrantReferenceSha256:
      MANAGEMENT_OAUTH_GRANT_REFERENCE_SHA256,
    scopeAttestationSource:
      "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" as const,
    endpointAllowlistEnforced: true as const,
    principalReferenceSha256: MANAGEMENT_PRINCIPAL_SHA256,
    credentialReferenceSha256: MANAGEMENT_CREDENTIAL_SHA256,
    observedAt: OBSERVED_AT,
    expiresAt: EXPIRES_AT,
    rawCredentialMaterialPresent: false as const,
  });
}

function validBranch(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: BRANCH_ID,
    name: "m1t-disposable-preview",
    project_ref: TARGET_PROJECT_REF,
    parent_project_ref: PRODUCTION_PROJECT_REF,
    is_default: false,
    git_branch: null,
    pr_number: null,
    latest_check_run_id: null,
    persistent: false,
    status: "MIGRATIONS_PASSED",
    created_at: OBSERVED_AT,
    updated_at: NOW,
    review_requested_at: null,
    with_data: false,
    notify_url: null,
    deletion_scheduled_at: null,
    preview_project_status: "ACTIVE_HEALTHY",
    ...overrides,
  };
}

function validManagementResponse(
  overrides: Readonly<Record<string, unknown>> = {},
): ManagementResponseFixture {
  return Object.freeze({
    status: 200,
    contentType: "application/json",
    redirected: false,
    responseUrl: MANAGEMENT_URL,
    body: encodeJson([validBranch()]),
    rawCredentialMaterialPresent: false,
    ...overrides,
  });
}

function encodeJson(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function encodeText(value: string) {
  return new TextEncoder().encode(value);
}

function duplicateProjectRefBody() {
  const source = JSON.stringify(validBranch());
  return encodeText(
    `[${source.replace(
      `"project_ref":"${TARGET_PROJECT_REF}"`,
      `"project_ref":"${TARGET_PROJECT_REF}","project_ref":"${TARGET_PROJECT_REF}"`,
    )}]`,
  );
}

async function captureRejection(promise: PromiseLike<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}

function withoutPolicyDigest(value: Readonly<Record<string, unknown>>) {
  const core = { ...value };
  delete core.policyDigest;
  return core;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreezeFixture<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeFixture(child);
    }
  }
  return value;
}
