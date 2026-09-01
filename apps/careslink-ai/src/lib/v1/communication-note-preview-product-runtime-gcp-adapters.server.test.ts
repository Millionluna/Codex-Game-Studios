import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as gcpAdapters from "./communication-note-preview-product-runtime-gcp-adapters.server";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const NOW = "2026-09-01T12:00:00.000Z";
const OBSERVED_AT = "2026-09-01T11:59:00.000Z";
const EXPIRES_AT = "2026-09-01T12:04:00.000Z";
const WIF_EXPIRES_AT = "2026-09-01T13:00:00.000Z";
const SOURCE_REVISION_SHA256 = sha256("m1u-source-revision");
const SOURCE_MANIFEST_SHA256 = sha256("m1u-source-manifest");
const CA_BYTES = new TextEncoder().encode(
  `-----BEGIN CERTIFICATE-----
MIIDJjCCAg6gAwIBAgIJAPceARGbgTXaMA0GCSqGSIb3DQEBCwUAMEAxIDAeBgNV
BAMMF0NhcmVzbGluayBNMXUgVGVzdCBSb290MRwwGgYDVQQKDBNDYXJlc2xpbmsg
VGVzdCBPbmx5MB4XDTI2MDkwMTA0MjU1OVoXDTM2MDgyOTA0MjU1OVowQDEgMB4G
A1UEAwwXQ2FyZXNsaW5rIE0xdSBUZXN0IFJvb3QxHDAaBgNVBAoME0NhcmVzbGlu
ayBUZXN0IE9ubHkwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDCwszq
tOGFf2n8oAK6TJSAEKsM/LVHppKQWcBCmj3J9V96aNdNXMb7ZC8Mu+Mso/f8PfYt
UrGKNQgYRbwLg9kxyU2K7qzDqhy5zfhNx+ALn6maSLSbo8Yl/mGrDcmGNU0GR2XU
YHZErI5E5RPN+ynBpW5W5+jzCI72BZDvYjtfdQfLPL+OEizvntJ0Q05bJzTA9gPQ
LWvvep7gzPgXP8eXGxSJhSQUlA4+UsSGbYhnZA+8AdLLTEczNvHgQkF7jcMQZY8u
AZn427hcAAEwcezY7wtIQaXpPslg3n6ch5n/IKHvqM4pkqKfVLRNfth0CdGSK11Z
+mkCarrf579cno6vAgMBAAGjIzAhMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/
BAQDAgEGMA0GCSqGSIb3DQEBCwUAA4IBAQAT3I4MSubdEbHIevzJTvjK9hIHFJD/
i4575IaYmd91V6MfYqc5BkllmP6aLp0X7zbimoGUBr+JwuGGGcukxbvVXOPe202I
4fOzTXtq+PjuUp/1FDuOmmRTQqV1TjfxZOZmSat9RvGln6pbbWyGWjUE9grMBd+Z
f4RMFfKz5aqGlf4Z/ljV3IYF6+yf1oJEZqzKnRyYt8ej13uidy8odsQWMnO8Hj7P
Dj2FdMox6uYFcXmcpyn5M3q08EGnnIn9NE+RD54lCBU7F6/nWmRKO6Sp8looirL7
R0JUx84ZQ1gZSZMVDUzAmObHpnp/W+GSroKSeNP9CSXY3LDhgLNXKoAW
-----END CERTIFICATE-----
`,
);
const CA_SHA256 = sha256(CA_BYTES);
const TARGET_PROJECT_REF = "abcdefghijklmnopqrst";
const TEAM_ID = "team_cFWfAk6zAa0b7X5bc1ONT4SA";
const PROJECT_ID = "prj_AtdTukVr39wrGH9PYgKusfku2gvS";
const GCP_PROJECT = "careslink-m1u-security";
const GCP_PROJECT_NUMBER = "288554824534";
const LOCATION = "australia-southeast1";
const WIF_EXTERNAL_AUDIENCE =
  `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`;
const WIF_SUBJECT_TOKEN_AUDIENCE =
  `https://iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`;
const SOURCE_MANIFEST_KEY =
  `projects/${GCP_PROJECT}/locations/${LOCATION}/keyRings/careslink-preview-m1u/cryptoKeys/hmac-source-manifest-v1/cryptoKeyVersions/1`;
const MANAGEMENT_SECRET =
  `projects/${GCP_PROJECT}/locations/${LOCATION}/secrets/supabase-management-oauth-credential/versions/1`;
const CA_SECRET =
  `projects/${GCP_PROJECT}/locations/${LOCATION}/secrets/supabase-preview-pinned-ca-pem/versions/1`;
const DATABASE_SECRET =
  `projects/${GCP_PROJECT}/locations/${LOCATION}/secrets/supabase-preview-branch-admin-password/versions/1`;
const MANAGEMENT_ACCESS_TOKEN = "m1u-oauth-access-token-test-only";
const OAUTH_APP_REFERENCE_SHA256 = sha256("m1u-oauth-app");
const OAUTH_GRANT_REFERENCE_SHA256 = sha256("m1u-oauth-grant");
const DEPLOYMENT_EVIDENCE_SHA256 = sha256("m1u-deployment-evidence");
const CONTROL_PLANE_EVIDENCE_SHA256 = sha256("m1u-control-plane-evidence");
const DATABASE_PASSWORD = "M1uDatabasePasswordTestOnly_123456";
const MANIFEST_MAC = createHash("sha256")
  .update("m1u-source-manifest-mac")
  .digest();
const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message: "Communication Note preview GCP provider adapters are unavailable",
});

describe("Communication Note M1u GCP provider adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the formal provider fixed-off with exact pinned Sydney resources", async () => {
    expect(Object.keys(gcpAdapters).sort()).toEqual([
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY_DIGEST",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_READY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_VERSION",
      "createCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters",
      "createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters",
    ]);
    expect(
      gcpAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_READY,
    ).toBe(false);
    expect(
      gcpAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS,
    ).toBeUndefined();
    expect(
      gcpAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY_DIGEST,
    ).toBe(
      "5a0b358626f1864cd13584e4abadf79254e5d365911b28586666e58a76c76c36",
    );
    expect(
      gcpAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY,
    ).toMatchObject({
      status: "SOURCE_GCP_PROVIDER_ADAPTERS_NOT_ACTIVATED",
      ready: false,
      provider: "GOOGLE_CLOUD",
      projectId: GCP_PROJECT,
      projectNumber: GCP_PROJECT_NUMBER,
      location: LOCATION,
      secretManagerEndpoint:
        "secretmanager.australia-southeast1.rep.googleapis.com",
      productionAllowed: false,
      applicationDefaultCredentialsAllowed: false,
      serviceAccountJsonAllowed: false,
      vercelTeamId: TEAM_ID,
      vercelProjectId: PROJECT_ID,
      vercelEnvironment: "preview",
      wifExternalAccountAudience: WIF_EXTERNAL_AUDIENCE,
      wifSubjectTokenAllowedAudience: WIF_SUBJECT_TOKEN_AUDIENCE,
      supabaseManagementOAuthScope: "environment:read",
      supabaseManagementAuthorizationModel:
        "SUPABASE_OAUTH_APP_SCOPE",
      supabaseManagementScopeAttestationSource:
        "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
      supabaseManagementEndpointAllowlistEnforced: true,
      supabaseFineGrainedPermissionClaimed: false,
      supabaseManagementHttpsPortImplemented: false,
      m1tDirectCompositionSupported: false,
      concreteGoogleSdkClientsWired: false,
      liveEvidencePresent: false,
      deploymentApproved: false,
      activationApproved: false,
    });
    expect(
      Object.values(
        gcpAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY
          .kmsVersions,
      ),
    ).toHaveLength(4);
    expect(
      Object.values(
        gcpAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY
          .kmsVersions,
      ).every((name) => name.endsWith("/cryptoKeyVersions/1")),
    ).toBe(true);
    expect(
      Object.values(
        gcpAdapters.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY
          .secretVersions,
      ).every(
        (name) =>
          name.includes(`/locations/${LOCATION}/`) &&
          name.endsWith("/versions/1") &&
          !name.includes("latest"),
      ),
    ).toBe(true);

    let traps = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          traps += 1;
          return "M1U_SECRET_SENTINEL";
        },
        ownKeys() {
          traps += 1;
          return [];
        },
      },
    );
    await expect(
      gcpAdapters.createCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
        hostile,
        hostile,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(traps).toBe(0);

    const source = readFileSync(
      new URL(
        "./communication-note-preview-product-runtime-gcp-adapters.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|GOOGLE_APPLICATION_CREDENTIALS|private_key|client_email|fromJSON\s*\(|GoogleAuth\s*\(|cryptoKeyVersions\/latest|versions\/latest|console\.|\blogger\b/i,
    );
  });

  it("cryptographically gates all secrets behind exact Preview WIF and the independent manifest MAC", async () => {
    const harness = validHarness();
    const bundle = await compose(harness);

    await expect(
      bundle.supabaseManagementCredentialPort.consume(
        { sourceRevisionSha256: SOURCE_REVISION_SHA256 },
        harness.context,
        vi.fn(),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.accessSecretVersion).not.toHaveBeenCalled();

    const verified = await bundle.workloadIdentityVerifierPort.verify(
      workloadRequest(),
      harness.context,
    );

    expect(harness.events).toEqual(["oidc", "wif", "manifest"]);
    expect(harness.getToken).toHaveBeenCalledWith({
      team: "millionlunas-projects",
      project: "careslink-ai",
      audience: WIF_SUBJECT_TOKEN_AUDIENCE,
    });
    expect(harness.verifyAndExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        token: harness.oidcToken,
        audience: WIF_EXTERNAL_AUDIENCE,
        expectedAudience: WIF_SUBJECT_TOKEN_AUDIENCE,
        expectedIssuer: "https://oidc.vercel.com/millionlunas-projects",
        expectedSubject:
          "owner:millionlunas-projects:project:careslink-ai:environment:preview",
        expectedOwnerId: TEAM_ID,
        expectedProjectId: PROJECT_ID,
        expectedEnvironment: "preview",
      }),
      harness.context,
    );
    expect(harness.macVerify).toHaveBeenCalledTimes(1);
    const manifestRequest = harness.macVerify.mock.calls[0]?.[0] as {
      name: string;
      data: Uint8Array;
      dataCrc32c: number;
      mac: Uint8Array;
      macCrc32c: number;
    };
    expect(manifestRequest.name).toBe(SOURCE_MANIFEST_KEY);
    expect(manifestRequest.dataCrc32c).toBe(
      crc32c.calculate(manifestRequest.data),
    );
    expect(manifestRequest.macCrc32c).toBe(
      crc32c.calculate(manifestRequest.mac),
    );
    expect(verified).toMatchObject({
      status:
        "VERIFIED_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST_NOT_APPROVED",
      source: "VERCEL_OIDC_WITH_MANAGED_SOURCE_MANIFEST",
      vercelTeamIdSha256: sha256(TEAM_ID),
      vercelProjectIdSha256: sha256(PROJECT_ID),
      vercelEnvironment: "preview",
      sourceRevisionSha256: SOURCE_REVISION_SHA256,
      sourceManifestSha256: SOURCE_MANIFEST_SHA256,
      postgresMajor: 17,
      connectionMode: "DIRECT",
      expiresAt: "2026-09-01T12:05:00.000Z",
      rawIdentityCredentialMaterialPresent: false,
    });
    expect(JSON.stringify(verified)).not.toContain(harness.oidcToken);

    const callback = vi.fn(
      async (credential: unknown, attestation: unknown) => {
        void credential;
        void attestation;
      },
    );
    await bundle.supabaseManagementCredentialPort.consume(
      managementSecretRequest(verified),
      harness.context,
      callback,
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      MANAGEMENT_ACCESS_TOKEN,
      expect.objectContaining({
        status:
          "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED",
        source: "MANAGED_SECRET_CUSTODY",
        authorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
        oauthScope: "environment:read",
        oauthAppReferenceSha256: OAUTH_APP_REFERENCE_SHA256,
        oauthGrantReferenceSha256: OAUTH_GRANT_REFERENCE_SHA256,
        scopeAttestationSource:
          "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
        endpointAllowlistEnforced: true,
        rawCredentialMaterialPresent: false,
      }),
    );
    expect(JSON.stringify(callback.mock.calls[0]?.[1])).not.toContain(
      MANAGEMENT_ACCESS_TOKEN,
    );
  });

  it("uses purpose-separated numeric KMS versions and validates request/response CRC32C", async () => {
    const harness = validHarness();
    const bundle = await compose(harness);
    await bundle.workloadIdentityVerifierPort.verify(
      workloadRequest(),
      harness.context,
    );

    for (const purpose of [
      "VERCEL_WORKLOAD_IDENTITY_BINDING",
      "VERCEL_DEPLOYMENT_SOURCE_TARGET_BINDING",
      "SUPABASE_PROJECT_REF_BINDING",
    ] as const) {
      const result = await bundle.managedHmacPort.hmac(
        {
          purpose,
          algorithm: "HMAC-SHA256",
          version:
            "mac.communication-note.preview.platform.2026-09-01.m1t.v1",
          sourceRevisionSha256: SOURCE_REVISION_SHA256,
          bindingSha256: sha256(purpose),
        },
        harness.context,
      );
      expect(result).toMatchObject({
        status: "MANAGED_HMAC_SHA256_NOT_APPROVED",
        purpose,
        rawKeyMaterialPresent: false,
      });
    }

    expect(harness.macSign).toHaveBeenCalledTimes(3);
    const requests = harness.macSign.mock.calls.map(
      (call) => call[0] as { name: string; data: Uint8Array; dataCrc32c: number },
    );
    expect(new Set(requests.map(({ name }) => name)).size).toBe(3);
    for (const request of requests) {
      expect(request.name).toMatch(/\/cryptoKeyVersions\/1$/);
      expect(request.name).not.toBe(SOURCE_MANIFEST_KEY);
      expect(request.dataCrc32c).toBe(crc32c.calculate(request.data));
    }

    harness.badMacCrc = true;
    await expect(
      bundle.managedHmacPort.hmac(
        {
          purpose: "SUPABASE_PROJECT_REF_BINDING",
          algorithm: "HMAC-SHA256",
          version:
            "mac.communication-note.preview.platform.2026-09-01.m1t.v1",
          sourceRevisionSha256: SOURCE_REVISION_SHA256,
          bindingSha256: sha256("bad-crc"),
        },
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
  });

  it("validates regional Secret Manager CRC and delivers CA/password through bounded outputs once", async () => {
    const harness = validHarness();
    const bundle = await compose(harness);
    await bundle.workloadIdentityVerifierPort.verify(
      workloadRequest(),
      harness.context,
    );

    const ca = await bundle.pinnedCaCustodyPort.load(
      {
        purpose: "LOAD_PINNED_SUPABASE_DATABASE_ROOT_CA",
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        tlsRootCertificateSha256: CA_SHA256,
        deploymentIdentityEvidenceSha256: DEPLOYMENT_EVIDENCE_SHA256,
        controlPlaneEvidenceSha256: CONTROL_PLANE_EVIDENCE_SHA256,
      },
      harness.context,
    );
    expect(ca).toMatchObject({ rawCredentialMaterialPresent: false });
    expect((ca as { tlsRootCertificate: Uint8Array }).tlsRootCertificate).toEqual(
      CA_BYTES,
    );

    const passwordConsumer = vi.fn(async () => undefined);
    await bundle.databaseCredentialCustodyPort.consume(
      {
        purpose: "CONSUME_STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
        targetDescriptorSha256: sha256("m1u-target-descriptor"),
        tlsRootCertificateSha256: CA_SHA256,
        user: "postgres",
        applicationName:
          "careslink-preview-runtime-credential-broker-management",
        credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
        sourceExpiresAt: null,
        sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
        deliveryNonce: sha256("m1u-delivery-nonce"),
        deliveryExpiresNoLaterThan: EXPIRES_AT,
        maximumDeliveryLifetimeMs: 60_000,
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        deploymentIdentityEvidenceSha256: DEPLOYMENT_EVIDENCE_SHA256,
        controlPlaneEvidenceSha256: CONTROL_PLANE_EVIDENCE_SHA256,
        revalidatedBranchSnapshotSha256: sha256("m1u-revalidated-branch"),
      },
      harness.context,
      passwordConsumer,
    );
    expect(passwordConsumer).toHaveBeenCalledTimes(1);
    expect(passwordConsumer).toHaveBeenCalledWith(DATABASE_PASSWORD);
    expect(harness.accessSecretVersion.mock.calls.map(([request]) => request)).toEqual([
      { name: CA_SECRET },
      { name: DATABASE_SECRET },
    ]);

    harness.badSecretCrc = true;
    await expect(
      bundle.pinnedCaCustodyPort.load(
        {
          sourceRevisionSha256: SOURCE_REVISION_SHA256,
          tlsRootCertificateSha256: CA_SHA256,
          purpose: "LOAD_PINNED_SUPABASE_DATABASE_ROOT_CA",
          deploymentIdentityEvidenceSha256: DEPLOYMENT_EVIDENCE_SHA256,
          controlPlaneEvidenceSha256: CONTROL_PLANE_EVIDENCE_SHA256,
        },
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
  });

  it("fails closed before Secret Manager on wrong OIDC, WIF, manifest or production-like input", async () => {
    const nowSeconds = Math.floor(Date.parse(NOW) / 1_000);
    const invalidOidcTokens = [
      oidcToken({ iss: "https://oidc.vercel.com/another-team" }),
      oidcToken({ sub: "owner:another-team:project:careslink-ai:environment:preview" }),
      oidcToken({ owner_id: "team_wrong" }),
      oidcToken({ owner: "another-team" }),
      oidcToken({ project_id: "prj_wrong" }),
      oidcToken({ project: "another-project" }),
      oidcToken({ environment: "production" }),
      oidcToken({ aud: "https://vercel.com/millionlunas-projects" }),
      oidcToken({ aud: [WIF_SUBJECT_TOKEN_AUDIENCE, "another-audience"] }),
      oidcToken({ iat: nowSeconds - 301 }),
      oidcToken({ iat: nowSeconds + 31 }),
      oidcToken({ nbf: nowSeconds + 31 }),
      oidcToken({ exp: nowSeconds }),
      oidcToken({ exp: nowSeconds + 3_901 }),
      oidcToken({ iat: nowSeconds + 1, exp: nowSeconds }),
      oidcToken({ jti: "" }),
      oidcToken({ iat: nowSeconds - 1.5 }),
      oidcToken({}, { alg: "none" }),
      oidcToken({}, { typ: "JOSE" }),
      oidcToken({}, { kid: "" }),
    ];
    for (const token of invalidOidcTokens) {
      const harness = validHarness();
      harness.oidcToken = token;
      const bundle = await compose(harness);
      await expect(
        bundle.workloadIdentityVerifierPort.verify(
          workloadRequest(),
          harness.context,
        ),
      ).rejects.toMatchObject(FIXED_FAILURE);
      expect(harness.verifyAndExchange).not.toHaveBeenCalled();
      expect(harness.macVerify).not.toHaveBeenCalled();
      expect(harness.accessSecretVersion).not.toHaveBeenCalled();
    }

    for (const failure of [
      "wif",
      "manifest",
      "manifest-integrity",
    ] as const) {
      const harness = validHarness();
      if (failure === "wif") harness.wifAccepted = false;
      if (failure === "manifest") harness.manifestAccepted = false;
      if (failure === "manifest-integrity") {
        harness.manifestSuccessIntegrity = false;
      }
      const bundle = await compose(harness);
      await expect(
        bundle.workloadIdentityVerifierPort.verify(
          workloadRequest(),
          harness.context,
        ),
      ).rejects.toMatchObject(FIXED_FAILURE);
      expect(harness.accessSecretVersion).not.toHaveBeenCalled();
      if (failure === "wif") expect(harness.macVerify).not.toHaveBeenCalled();
    }

    const productionHarness = validHarness("adocsnwnslxhxcjgbyee");
    await expect(compose(productionHarness)).rejects.toMatchObject(
      FIXED_FAILURE,
    );
    expect(productionHarness.getToken).not.toHaveBeenCalled();
    expect(productionHarness.verifyAndExchange).not.toHaveBeenCalled();
    expect(productionHarness.macVerify).not.toHaveBeenCalled();
    expect(productionHarness.accessSecretVersion).not.toHaveBeenCalled();

    const secretHarness = validHarness();
    const secretBundle = await compose(secretHarness);
    const secretVerified = await secretBundle.workloadIdentityVerifierPort.verify(
      workloadRequest(),
      secretHarness.context,
    );
    await expect(
      secretBundle.supabaseManagementCredentialPort.consume(
        {
          ...managementSecretRequest(secretVerified),
          targetProjectRef: "adocsnwnslxhxcjgbyee",
        },
        secretHarness.context,
        vi.fn(),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(secretHarness.accessSecretVersion).not.toHaveBeenCalled();
  });

  it("maps hostile and secret-bearing failures to one non-secret error", async () => {
    const harness = validHarness();
    const bundle = await compose(harness);
    const verified = await bundle.workloadIdentityVerifierPort.verify(
      workloadRequest(),
      harness.context,
    );
    harness.accessSecretVersion.mockRejectedValueOnce(
      new Error(`provider leaked ${MANAGEMENT_ACCESS_TOKEN}`),
    );
    const error = await captureRejection(
      bundle.supabaseManagementCredentialPort.consume(
        managementSecretRequest(verified),
        harness.context,
        vi.fn(),
      ),
    );
    expect(error).toMatchObject(FIXED_FAILURE);
    expect(JSON.stringify(error)).not.toContain(MANAGEMENT_ACCESS_TOKEN);
  });

  it("rejects accessors, symbol keys, Proxy signals and aliased callables without invoking them", async () => {
    const harness = validHarness();
    let traps = 0;
    const accessorOptions = { ...harness.options };
    Object.defineProperty(accessorOptions, "capability", {
      enumerable: true,
      get() {
        traps += 1;
        return "TEST_ONLY_M1U_GCP_PROVIDER_ADAPTERS";
      },
    });
    await expect(
      gcpAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
        accessorOptions,
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(traps).toBe(0);

    const symbolOptions = { ...harness.options };
    Object.defineProperty(symbolOptions, Symbol("hostile"), {
      enumerable: true,
      value: "M1U_SECRET_SENTINEL_MUST_NEVER_ESCAPE",
    });
    await expect(
      gcpAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
        symbolOptions,
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);

    const proxySignal = new Proxy(harness.context.signal, {
      get() {
        traps += 1;
        return undefined;
      },
    });
    await expect(
      gcpAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
        harness.options,
        Object.freeze({ signal: proxySignal }),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(traps).toBe(0);

    const sharedKmsCallable = vi.fn(async () => []);
    await expect(
      gcpAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
        {
          ...harness.options,
          kmsClient: Object.freeze({
            macSign: sharedKmsCallable,
            macVerify: sharedKmsCallable,
          }),
        },
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(sharedKmsCallable).not.toHaveBeenCalled();

    const responseHarness = validHarness();
    const responseBundle = await compose(responseHarness);
    await responseBundle.workloadIdentityVerifierPort.verify(
      workloadRequest(),
      responseHarness.context,
    );
    const hostileResponse = {
      name: SOURCE_MANIFEST_KEY,
      mac: Buffer.from(MANIFEST_MAC),
      macCrc32c: crc32c.calculate(MANIFEST_MAC),
      verifiedDataCrc32c: true as const,
      protectionLevel: "SOFTWARE" as const,
    };
    Object.defineProperty(hostileResponse, "name", {
      enumerable: true,
      get() {
        traps += 1;
        return SOURCE_MANIFEST_KEY;
      },
    });
    responseHarness.macSign.mockResolvedValueOnce([hostileResponse]);
    await expect(
      responseBundle.managedHmacPort.hmac(
        {
          purpose: "SUPABASE_PROJECT_REF_BINDING",
          algorithm: "HMAC-SHA256",
          version:
            "mac.communication-note.preview.platform.2026-09-01.m1t.v1",
          sourceRevisionSha256: SOURCE_REVISION_SHA256,
          bindingSha256: sha256("hostile-provider-response"),
        },
        responseHarness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(traps).toBe(0);

    responseHarness.macSign.mockResolvedValueOnce([
      Object.freeze({
        name: SOURCE_MANIFEST_KEY,
        mac: Buffer.from(MANIFEST_MAC),
        macCrc32c: crc32c.calculate(MANIFEST_MAC),
        verifiedDataCrc32c: true as const,
        protectionLevel: "SOFTWARE" as const,
        extraProviderField: true,
      }),
    ] as never);
    await expect(
      responseBundle.managedHmacPort.hmac(
        {
          purpose: "SUPABASE_PROJECT_REF_BINDING",
          algorithm: "HMAC-SHA256",
          version:
            "mac.communication-note.preview.platform.2026-09-01.m1t.v1",
          sourceRevisionSha256: SOURCE_REVISION_SHA256,
          bindingSha256: sha256("extra-provider-field"),
        },
        responseHarness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
  });

  it("rejects clock rollback, stale OAuth evidence and non-CA/private-key PEM", async () => {
    const rollbackHarness = validHarness();
    rollbackHarness.clockValues = [
      NOW,
      NOW,
      "2026-09-01T11:59:59.999Z",
    ];
    const rollbackBundle = await compose(rollbackHarness);
    await expect(
      rollbackBundle.workloadIdentityVerifierPort.verify(
        workloadRequest(),
        rollbackHarness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(rollbackHarness.accessSecretVersion).not.toHaveBeenCalled();

    const invalidTimestampHarness = validHarness();
    invalidTimestampHarness.clockValues = [
      "2026-02-31T12:00:00.000Z",
    ];
    const invalidTimestampBundle = await compose(invalidTimestampHarness);
    await expect(
      invalidTimestampBundle.workloadIdentityVerifierPort.verify(
        workloadRequest(),
        invalidTimestampHarness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(invalidTimestampHarness.verifyAndExchange).not.toHaveBeenCalled();

    const staleHarness = validHarness();
    const staleBundle = await compose(staleHarness);
    const verified = await staleBundle.workloadIdentityVerifierPort.verify(
      workloadRequest(),
      staleHarness.context,
    );
    staleHarness.secretValues.set(
      MANAGEMENT_SECRET,
      managementCredentialBytes({
        observedAt: "2026-09-01T11:54:59.999Z",
      }),
    );
    await expect(
      staleBundle.supabaseManagementCredentialPort.consume(
        managementSecretRequest(verified),
        staleHarness.context,
        vi.fn(),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);

    for (const invalidCa of [
      new TextEncoder().encode(
        "-----BEGIN CERTIFICATE-----\nnot-an-x509-ca\n-----END CERTIFICATE-----\n",
      ),
      new TextEncoder().encode(
        `${new TextDecoder().decode(CA_BYTES)}-----BEGIN PRIVATE KEY-----\nforbidden\n-----END PRIVATE KEY-----\n`,
      ),
    ]) {
      const caHarness = validHarness(TARGET_PROJECT_REF, invalidCa);
      const caBundle = await compose(caHarness);
      const caSha256 = sha256(invalidCa);
      await caBundle.workloadIdentityVerifierPort.verify(
        workloadRequest(caSha256),
        caHarness.context,
      );
      await expect(
        caBundle.pinnedCaCustodyPort.load(
          {
            purpose: "LOAD_PINNED_SUPABASE_DATABASE_ROOT_CA",
            sourceRevisionSha256: SOURCE_REVISION_SHA256,
            tlsRootCertificateSha256: caSha256,
            deploymentIdentityEvidenceSha256: DEPLOYMENT_EVIDENCE_SHA256,
            controlPlaneEvidenceSha256: CONTROL_PLANE_EVIDENCE_SHA256,
          },
          caHarness.context,
        ),
      ).rejects.toMatchObject(FIXED_FAILURE);
    }
  });
});

type Harness = ReturnType<typeof validHarness>;

function validHarness(
  targetProjectRef = TARGET_PROJECT_REF,
  pinnedCaBytes = CA_BYTES,
) {
  const events: string[] = [];
  const context = Object.freeze({ signal: new AbortController().signal });
  const state = {
    oidcToken: oidcToken(),
    wifAccepted: true,
    manifestAccepted: true,
    manifestSuccessIntegrity: true,
    badMacCrc: false,
    badSecretCrc: false,
    clockValues: [] as string[],
  };
  const getToken = vi.fn(async () => {
    events.push("oidc");
    return state.oidcToken;
  });
  const verifyAndExchange = vi.fn(async () => {
    events.push("wif");
    if (!state.wifAccepted) throw new Error("secret-bearing WIF failure");
    return Object.freeze({
      status: "GCP_WIF_TOKEN_VERIFIED_AND_IMPERSONATED" as const,
      principal:
        "careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com",
      expiresAt: WIF_EXPIRES_AT,
      rawAccessTokenMaterialPresent: false as const,
    });
  });
  const macVerify = vi.fn(async (requestValue: unknown) => {
    events.push("manifest");
    const request = requestValue as {
      name: string;
      data: Uint8Array;
      dataCrc32c: number;
      mac: Uint8Array;
      macCrc32c: number;
    };
    expect(request.dataCrc32c).toBe(crc32c.calculate(request.data));
    expect(request.macCrc32c).toBe(crc32c.calculate(request.mac));
    return [
      Object.freeze({
        name: request.name,
        success: state.manifestAccepted,
        verifiedDataCrc32c: true,
        verifiedMacCrc32c: true,
        verifiedSuccessIntegrity: state.manifestSuccessIntegrity,
        protectionLevel: "SOFTWARE",
      }),
    ];
  });
  const macSign = vi.fn(async (requestValue: unknown) => {
    const request = requestValue as { name: string; data: Uint8Array };
    const mac = createHash("sha256").update(request.data).digest();
    return [
      Object.freeze({
        name: request.name,
        mac,
        macCrc32c: state.badMacCrc ? -1 : crc32c.calculate(mac),
        verifiedDataCrc32c: true,
        protectionLevel: "SOFTWARE",
      }),
    ];
  });
  const secretValues = new Map<string, Uint8Array>([
    [
      MANAGEMENT_SECRET,
      managementCredentialBytes(),
    ],
    [CA_SECRET, pinnedCaBytes],
    [DATABASE_SECRET, new TextEncoder().encode(DATABASE_PASSWORD)],
  ]);
  const accessSecretVersion = vi.fn(async (requestValue: unknown) => {
    const request = requestValue as { name: string };
    const data = secretValues.get(request.name);
    if (!data) throw new Error("unknown secret");
    return [
      Object.freeze({
        name: request.name,
        payload: Object.freeze({
          data,
          dataCrc32c: state.badSecretCrc ? -1 : crc32c.calculate(data),
        }),
      }),
    ];
  });
  const clock = Object.freeze({
    now: vi.fn(() => state.clockValues.shift() ?? NOW),
  });
  const options = {
    capability: "TEST_ONLY_M1U_GCP_PROVIDER_ADAPTERS",
    workloadIdentityClient: Object.freeze({ verifyAndExchange }),
    kmsClient: Object.freeze({ macSign, macVerify }),
    secretManagerClient: Object.freeze({ accessSecretVersion }),
    vercelOidcTokenSource: Object.freeze({ getToken }),
    sourceManifestAttestation: deepFreezeFixture({
      binding: {
        schemaVersion:
          "source-manifest.communication-note.preview.2026-09-01.m1u.v1",
        sourceRevisionSha256: SOURCE_REVISION_SHA256,
        sourceManifestSha256: SOURCE_MANIFEST_SHA256,
        targetProjectRef,
        tlsRootCertificateSha256: sha256(pinnedCaBytes),
        vercelTeamId: TEAM_ID,
        vercelProjectId: PROJECT_ID,
        vercelEnvironment: "preview",
        postgresMajor: 17,
        connectionMode: "DIRECT",
        keyVersion: SOURCE_MANIFEST_KEY,
      },
      mac: Uint8Array.from(MANIFEST_MAC),
    }),
    clock,
  };
  return {
    options,
    context,
    events,
    getToken,
    verifyAndExchange,
    macVerify,
    macSign,
    accessSecretVersion,
    secretValues,
    get oidcToken() {
      return state.oidcToken;
    },
    set oidcToken(value: string) {
      state.oidcToken = value;
    },
    get wifAccepted() {
      return state.wifAccepted;
    },
    set wifAccepted(value: boolean) {
      state.wifAccepted = value;
    },
    get manifestAccepted() {
      return state.manifestAccepted;
    },
    set manifestAccepted(value: boolean) {
      state.manifestAccepted = value;
    },
    get manifestSuccessIntegrity() {
      return state.manifestSuccessIntegrity;
    },
    set manifestSuccessIntegrity(value: boolean) {
      state.manifestSuccessIntegrity = value;
    },
    get badMacCrc() {
      return state.badMacCrc;
    },
    set badMacCrc(value: boolean) {
      state.badMacCrc = value;
    },
    get badSecretCrc() {
      return state.badSecretCrc;
    },
    set badSecretCrc(value: boolean) {
      state.badSecretCrc = value;
    },
    get clockValues() {
      return state.clockValues;
    },
    set clockValues(value: string[]) {
      state.clockValues = [...value];
    },
  };
}

async function compose(harness: Harness) {
  return gcpAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
    harness.options,
    harness.context,
  );
}

function workloadRequest(tlsRootCertificateSha256 = CA_SHA256) {
  return Object.freeze({
    purpose: "VERIFY_VERCEL_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST",
    audience: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME",
    environmentClass: "NON_PRODUCTION_PREVIEW",
    vercelEnvironment: "preview",
    vercelTeamIdSha256: sha256(TEAM_ID),
    vercelProjectIdSha256: sha256(PROJECT_ID),
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    sourceManifestSha256: SOURCE_MANIFEST_SHA256,
    postgresMajor: 17,
    connectionMode: "DIRECT",
    targetProjectRef: TARGET_PROJECT_REF,
    tlsRootCertificateSha256,
  });
}

function managementSecretRequest(verifiedValue: unknown) {
  const verified = verifiedValue as {
    sourceManifestEvidenceSha256: string;
  };
  return Object.freeze({
    purpose: "CONSUME_SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN",
    managementApiOrigin: "https://api.supabase.com",
    authorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
    oauthScope: "environment:read",
    oauthAppReferenceSha256: OAUTH_APP_REFERENCE_SHA256,
    oauthGrantReferenceSha256: OAUTH_GRANT_REFERENCE_SHA256,
    scopeAttestationSource:
      "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
    endpointAllowlistEnforced: true,
    productionProjectRef: "adocsnwnslxhxcjgbyee",
    targetProjectRef: TARGET_PROJECT_REF,
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    deploymentIdentityEvidenceSha256: DEPLOYMENT_EVIDENCE_SHA256,
    sourceManifestEvidenceSha256:
      verified.sourceManifestEvidenceSha256,
  });
}

function managementCredentialBytes(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return new TextEncoder().encode(
    JSON.stringify({
      authorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
      oauthScope: "environment:read",
      oauthAppReferenceSha256: OAUTH_APP_REFERENCE_SHA256,
      oauthGrantReferenceSha256: OAUTH_GRANT_REFERENCE_SHA256,
      scopeAttestationSource:
        "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
      endpointAllowlistEnforced: true,
      accessToken: MANAGEMENT_ACCESS_TOKEN,
      principalReferenceSha256: sha256("management-principal"),
      credentialReferenceSha256: sha256("management-credential"),
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
      ...overrides,
    }),
  );
}

function oidcToken(
  overrides: Readonly<Record<string, unknown>> = {},
  headerOverrides: Readonly<Record<string, unknown>> = {},
) {
  const nowSeconds = Math.floor(Date.parse(NOW) / 1_000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: "m1u-test-only-kid",
    ...headerOverrides,
  };
  const payload = {
    iss: "https://oidc.vercel.com/millionlunas-projects",
    aud: WIF_SUBJECT_TOKEN_AUDIENCE,
    sub: "owner:millionlunas-projects:project:careslink-ai:environment:preview",
    owner_id: TEAM_ID,
    owner: "millionlunas-projects",
    project_id: PROJECT_ID,
    project: "careslink-ai",
    environment: "preview",
    iat: nowSeconds - 60,
    nbf: nowSeconds - 1_800,
    exp: nowSeconds + 3_600,
    jti: "m1u-test-only-jti",
    ...overrides,
  };
  return `${base64url(header)}.${base64url(payload)}.${base64url("signature")}`;
}

function base64url(value: unknown) {
  return Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value),
    "utf8",
  ).toString("base64url");
}

async function captureRejection(value: PromiseLike<unknown>) {
  try {
    await value;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreezeFixture<T>(value: T): T {
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Uint8Array) &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeFixture(child);
    }
  }
  return value;
}
