import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  getVercelOidcTokenSync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcTokenSync: providerMocks.getVercelOidcTokenSync,
}));
vi.mock(
  "./note-generation-google-cloud-provider-https-transport-m2b.server",
  () => ({
    createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b:
      providerMocks.createTransport,
  }),
);

import {
  createCaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation,
} from "./note-generation-google-cloud-kms-wrap-adapter.server";
import {
  CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_PROVIDER_TRUST_M2B,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_READY,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_SOURCE_POLICY,
  createCaresLinkV1NoteGenerationAuthenticatedGoogleCloudKmsWrapAdapterM2b,
  discardCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b,
  prepareCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b,
  prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b,
} from "./note-generation-google-cloud-provider-trust-m2b.server";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NOW = new Date("2026-09-03T10:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const VERCEL_ISSUER = "https://oidc.vercel.com/millionlunas-projects";
const VERCEL_DEFAULT_AUDIENCE =
  "https://vercel.com/millionlunas-projects";
const VERCEL_CUSTOM_AUDIENCE =
  "https://iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview";
const VERCEL_SUBJECT =
  "owner:millionlunas-projects:project:careslink-ai:environment:preview";
const WIF_PROVIDER_RESOURCE =
  "//iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview";
const KMS_KEY_RESOURCE =
  "projects/careslink-m1u-security/locations/australia-southeast1/keyRings/careslink-preview/cryptoKeys/payload-envelope";
const KMS_KEY_VERSION_RESOURCE = `${KMS_KEY_RESOURCE}/cryptoKeyVersions/7`;
const IAM_URL =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com:generateAccessToken";
const POSTURE_ACCESS_TOKEN = "posture-access-token-000000000001";
const OPERATION_ACCESS_TOKEN = "operation-access-token-0000000002";
const FEDERATED_ACCESS_TOKEN = "federated-access-token-0000000002";
const DEK = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const AAD = encoder.encode("careslink-test-only-aad");
const CIPHERTEXT = Uint8Array.from({ length: 48 }, (_, index) => index + 11);
const INITIALIZATION_VECTOR = Uint8Array.from(
  { length: 12 },
  (_, index) => index + 31,
);
const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message: "Communication Note Google Cloud provider trust is unavailable",
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  providerMocks.createTransport.mockReset();
  providerMocks.getVercelOidcTokenSync.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Communication Note authenticated Google Cloud provider trust M2b", () => {
  it("is server-only and default-off without token, timer or transport work at import", async () => {
    vi.resetModules();
    await import("./note-generation-google-cloud-provider-trust-m2b.server");
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_PROVIDER_TRUST_M2B,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_SOURCE_POLICY,
    ).toMatchObject({
      ready: false,
      sourceOnly: true,
      productionAllowed: false,
      formalFactoryEnabled: false,
      testOnlyCapabilityRequired: true,
      applicationDefaultCredentialsAllowed: false,
      serviceAccountJsonAllowed: false,
      vercelCustomAudienceHelperAllowed: false,
      vercelCustomAudienceCacheAllowed: false,
      vercelPlatformOidcAccessor:
        "@vercel/oidc#getVercelOidcTokenSync",
      vercelPlatformOidcEnvironmentInjectionAccepted: true,
      callerConfiguredEnvironmentCredentialAllowed: false,
      gcpEnvironmentCredentialDiscoveryAllowed: false,
      localVercelJwtSignatureVerification: false,
      workloadIdentityAuthenticationAuthority: "GOOGLE_STS_SUCCESS",
      separatePostureAndOperationAccessTokenRequestsRequired: true,
      callerSuppliedM2aPostureAccepted: false,
      rawCredentialMaterialReturned: false,
      liveEvidencePresent: false,
      deploymentApproved: false,
      activationApproved: false,
    });
    expect(providerMocks.getVercelOidcTokenSync).not.toHaveBeenCalled();
    expect(providerMocks.createTransport).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    const source = readFileSync(
      new URL(
        "./note-generation-google-cloud-provider-trust-m2b.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).toContain("getVercelOidcTokenSync");
    expect(source).not.toMatch(
      /exchangeVercelOidcToken|getVercelOidcToken\s*\(|globalThis\.fetch|window\.fetch|process\.env|GOOGLE_APPLICATION_CREDENTIALS|google-auth-library|@google-cloud|console\.|\blogger\b/i,
    );
  });

  it("keeps the formal factory closed and quarantines the M2a bypass seam", async () => {
    await expect(
      prepareCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b(
        Object.freeze({}),
      ),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(providerMocks.getVercelOidcTokenSync).not.toHaveBeenCalled();
    expect(providerMocks.createTransport).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    const sourceFiles = walkSourceFiles(join(process.cwd(), "src"));
    const m2aRuntimeImporters = sourceFiles
      .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "note-generation-google-cloud-kms-wrap-adapter.server",
        ),
      )
      .map((path) => relative(process.cwd(), path));
    expect(m2aRuntimeImporters).toEqual([
      "src/lib/v1/note-generation-google-cloud-provider-trust-m2b.server.ts",
    ]);
    const transportRuntimeImporters = sourceFiles
      .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "note-generation-google-cloud-provider-https-transport-m2b.server",
        ),
      )
      .map((path) => relative(process.cwd(), path));
    expect(transportRuntimeImporters).toEqual([
      "src/lib/v1/note-generation-google-cloud-provider-trust-m2b.server.ts",
    ]);
    const m2bRuntimeImporters = sourceFiles
      .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
      .filter((path) =>
        readFileSync(path, "utf8").includes(
          "note-generation-google-cloud-provider-trust-m2b.server",
        ),
      );
    expect(m2bRuntimeImporters).toEqual([]);
  });

  it("authenticates the exact key/version and performs one one-use rawEncrypt", async () => {
    const harness = installProviderHarness();
    const root = new AbortController();
    const trust = await prepare(root.signal);

    expect(Object.isFrozen(trust)).toBe(true);
    expect(trust).toMatchObject({
      status: "AUTHENTICATED_EXACT_KMS_PROVIDER_TRUST_NOT_ACTIVATED",
      kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
      rawCredentialMaterialPresent: false,
    });
    expect(trust.controlPlaneEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(trust.workloadIdentityReferenceSha256).toMatch(/^[a-f0-9]{64}$/);
    const projectedTrust = JSON.stringify(trust);
    for (const secret of [
      POSTURE_ACCESS_TOKEN,
      OPERATION_ACCESS_TOKEN,
      FEDERATED_ACCESS_TOKEN,
    ]) {
      expect(projectedTrust).not.toContain(secret);
    }

    expect(() =>
      createAdapter(structuredClone(trust), root.signal),
    ).toThrowError(FIXED_FAILURE);
    expect(() => createAdapter({ ...trust }, root.signal)).toThrowError(
      FIXED_FAILURE,
    );

    const adapter = createAdapter(trust, root.signal);
    expect(() => createAdapter(trust, root.signal)).toThrowError(FIXED_FAILURE);
    const result = await adapter.wrapDataEncryptionKey({
      kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
      plaintextDataEncryptionKey: DEK,
      additionalAuthenticatedData: AAD,
    });

    expect(result.kmsKeyVersionResource).toBe(KMS_KEY_VERSION_RESOURCE);
    expect(result.wrappedDataEncryptionKey).toBeInstanceOf(Uint8Array);
    expect(decoder.decode(result.wrappedDataEncryptionKey)).not.toContain(
      OPERATION_ACCESS_TOKEN,
    );
    await expect(
      adapter.wrapDataEncryptionKey({
        kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
        plaintextDataEncryptionKey: DEK,
        additionalAuthenticatedData: AAD,
      }),
    ).rejects.toEqual(FIXED_FAILURE);

    expect(harness.requests.map((request) => request.url)).toEqual([
      "https://oidc.vercel.com/~token",
      "https://sts.googleapis.com/v1/token",
      IAM_URL,
      `https://cloudkms.googleapis.com/v1/${KMS_KEY_RESOURCE}`,
      `https://cloudkms.googleapis.com/v1/${KMS_KEY_VERSION_RESOURCE}`,
      IAM_URL,
      `https://cloudkms.googleapis.com/v1/${KMS_KEY_VERSION_RESOURCE}:rawEncrypt`,
    ]);
    expect(harness.requests[2].headers.authorization).toBe(
      `Bearer ${FEDERATED_ACCESS_TOKEN}`,
    );
    expect(harness.requests[3].headers.authorization).toBe(
      `Bearer ${POSTURE_ACCESS_TOKEN}`,
    );
    expect(harness.requests[4].headers.authorization).toBe(
      `Bearer ${POSTURE_ACCESS_TOKEN}`,
    );
    expect(harness.requests[6].headers.authorization).toBe(
      `Bearer ${OPERATION_ACCESS_TOKEN}`,
    );
    expect(JSON.parse(decoder.decode(harness.requests[0].body))).toMatchObject({
      token: harness.baseToken,
      aud: VERCEL_CUSTOM_AUDIENCE,
      jti: expect.any(String),
    });
    expect(
      Object.fromEntries(
        new URLSearchParams(decoder.decode(harness.requests[1].body)),
      ),
    ).toMatchObject({
      audience: WIF_PROVIDER_RESOURCE,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    });
    expect(JSON.parse(decoder.decode(harness.requests[2].body))).toEqual({
      scope: ["https://www.googleapis.com/auth/cloud-platform"],
      lifetime: "300s",
    });
    expect(harness.retainedRequestBodies).toSatisfy((bodies: Uint8Array[]) =>
      bodies.every((body) => body.every((byte) => byte === 0)),
    );
    expect(harness.responseBodies).toSatisfy((bodies: Uint8Array[]) =>
      bodies.every((body) => body.every((byte) => byte === 0)),
    );
  });

  it("admits only one of two simultaneous wrap attempts", async () => {
    const harness = installProviderHarness();
    const root = new AbortController();
    const trust = await prepare(root.signal);
    const adapter = createAdapter(trust, root.signal);

    const outcomes = await Promise.allSettled([
      adapter.wrapDataEncryptionKey({
        kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
        plaintextDataEncryptionKey: Uint8Array.from(DEK),
        additionalAuthenticatedData: Uint8Array.from(AAD),
      }),
      adapter.wrapDataEncryptionKey({
        kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
        plaintextDataEncryptionKey: Uint8Array.from(DEK),
        additionalAuthenticatedData: Uint8Array.from(AAD),
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(
      harness.requests.filter((request) => request.url.endsWith(":rawEncrypt")),
    ).toHaveLength(1);
  });

  it("does not admit a public M2a self-attestation or accessor-shaped impostor", () => {
    const root = new AbortController();
    const selfAttested =
      createCaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation(
        Object.freeze({
          attestationVersion:
            "google-cloud-kms-key-version-posture.communication-note.2026-09-03.m2a.v1",
          status:
            "VERIFIED_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_NOT_APPROVED",
          kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
          purpose: "RAW_ENCRYPT_DECRYPT",
          algorithm: "AES_256_GCM",
          protectionLevel: "SOFTWARE",
          state: "ENABLED",
          observedAt: NOW.toISOString(),
          expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
          controlPlaneEvidenceSha256: "a".repeat(64),
          rawKeyMaterialPresent: false,
        }),
      );
    expect(() => createAdapter(selfAttested, root.signal)).toThrowError(
      FIXED_FAILURE,
    );

    let getterCalls = 0;
    const accessor = Object.freeze(
      Object.defineProperty({}, "version", {
        enumerable: true,
        get() {
          getterCalls += 1;
          return "forged";
        },
      }),
    );
    expect(() => createAdapter(accessor, root.signal)).toThrowError(
      FIXED_FAILURE,
    );
    expect(getterCalls).toBe(0);
  });

  it("rejects invalid base identity claims before any provider request", async () => {
    const harness = installProviderHarness({
      baseClaims: { environment: "production" },
    });

    await expect(prepare(new AbortController().signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(harness.requests).toHaveLength(0);
  });

  it("rejects a custom token whose exchange jti is not the requested jti", async () => {
    const harness = installProviderHarness({
      customClaims: { jti: "wrong-exchange-jti" },
    });

    await expect(prepare(new AbortController().signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(harness.requests).toHaveLength(1);
  });

  it("rejects non-exact STS output before service-account impersonation", async () => {
    const harness = installProviderHarness({
      stsResponse: { provider_secret: "must-not-project" },
    });

    await expect(prepare(new AbortController().signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(harness.requests).toHaveLength(2);
    expect(JSON.stringify(FIXED_FAILURE)).not.toContain("provider_secret");
  });

  it("rejects an STS scope that widens the exact cloud-platform response", async () => {
    const harness = installProviderHarness({
      stsResponse: { scope: "https://www.googleapis.com/auth/drive" },
    });

    await expect(prepare(new AbortController().signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(harness.requests).toHaveLength(2);
  });

  it.each([
    "PENDING_GENERATION",
    "PENDING_IMPORT",
    "IMPORT_FAILED",
    "DISABLED",
    "DESTROY_SCHEDULED",
    "DESTROYED",
  ])("rejects unsafe KMS version state %s without operation credential", async (state) => {
    const harness = installProviderHarness({ versionResponse: { state } });

    await expect(prepare(new AbortController().signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(harness.requests).toHaveLength(5);
    expect(harness.requests.filter((request) => request.url === IAM_URL)).toHaveLength(1);
  });

  it("rejects primary/unknown control-plane posture fields fail closed", async () => {
    const harness = installProviderHarness({
      keyResponse: {
        primary: { name: KMS_KEY_VERSION_RESOURCE },
      },
      versionResponse: { futureProviderField: true },
    });

    await expect(prepare(new AbortController().signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(harness.requests).toHaveLength(5);
  });

  it.each([
    ["wrong parent name", { keyResponse: { name: `${KMS_KEY_RESOURCE}-other` } }],
    ["wrong parent purpose", { keyResponse: { purpose: "ENCRYPT_DECRYPT" } }],
    [
      "wrong parent algorithm",
      {
        keyResponse: {
          versionTemplate: {
            protectionLevel: "SOFTWARE",
            algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION",
          },
        },
      },
    ],
    [
      "wrong parent protection",
      {
        keyResponse: {
          versionTemplate: {
            protectionLevel: "HSM",
            algorithm: "AES_256_GCM",
          },
        },
      },
    ],
    [
      "wrong version name",
      { versionResponse: { name: `${KMS_KEY_VERSION_RESOURCE}0` } },
    ],
    [
      "wrong version algorithm",
      { versionResponse: { algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION" } },
    ],
    ["wrong version protection", { versionResponse: { protectionLevel: "HSM" } }],
  ])("rejects %s before requesting an operation credential", async (_label, options) => {
    const harness = installProviderHarness(options);

    await expect(prepare(new AbortController().signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(harness.requests).toHaveLength(5);
    expect(harness.requests.filter((request) => request.url === IAM_URL)).toHaveLength(1);
  });

  it("keeps two credential requests without assuming token uniqueness and rejects upstream-expiry widening", async () => {
    const repeatedMaterial = installProviderHarness({
      operationAccessToken: POSTURE_ACCESS_TOKEN,
    });
    const repeatedRoot = new AbortController();
    const trust = await prepare(repeatedRoot.signal);
    expect(
      repeatedMaterial.requests.filter((request) => request.url === IAM_URL),
    ).toHaveLength(2);
    discardCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b(trust);

    const widened = installProviderHarness({
      baseClaims: { exp: NOW_SECONDS + 60 },
      customExpiresAtSeconds: NOW_SECONDS + 60,
      impersonatedExpiresAt: new Date(NOW.getTime() + 299_000).toISOString(),
    });
    await expect(prepare(new AbortController().signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(widened.requests).toHaveLength(3);
  });

  it("binds a prepared handle to the exact root signal and abort invalidates it", async () => {
    installProviderHarness();
    const wrongSignalRoot = new AbortController();
    const wrongSignalTrust = await prepare(wrongSignalRoot.signal);

    expect(() =>
      createAdapter(wrongSignalTrust, new AbortController().signal),
    ).toThrowError(FIXED_FAILURE);

    const abortedRoot = new AbortController();
    const abortedTrust = await prepare(abortedRoot.signal);
    abortedRoot.abort();
    expect(() =>
      createAdapter(abortedTrust, abortedRoot.signal),
    ).toThrowError(FIXED_FAILURE);
  });

  it("stops the chain on root abort and scrubs the in-flight request body", async () => {
    installProviderHarness();
    const retainedBodies: Uint8Array[] = [];
    const request = vi.fn((value: ProviderRequest) => {
      retainedBodies.push(value.body);
      return new Promise<never>(() => undefined);
    });
    providerMocks.createTransport.mockReturnValue(Object.freeze({ request }));
    const root = new AbortController();
    const operation = prepare(root.signal);
    const assertion = expect(operation).rejects.toEqual(FIXED_FAILURE);
    await Promise.resolve();
    root.abort();
    await assertion;

    expect(request).toHaveBeenCalledTimes(1);
    expect(retainedBodies).toSatisfy((bodies: Uint8Array[]) =>
      bodies.every((body) => body.every((byte) => byte === 0)),
    );
  });

  it("enforces the 30-second whole-chain deadline and scrubs the pending request", async () => {
    installProviderHarness();
    const retainedBodies: Uint8Array[] = [];
    const request = vi.fn((value: ProviderRequest) => {
      retainedBodies.push(value.body);
      return new Promise<never>(() => undefined);
    });
    providerMocks.createTransport.mockReturnValue(Object.freeze({ request }));
    const operation = prepare(new AbortController().signal);
    const assertion = expect(operation).rejects.toEqual(FIXED_FAILURE);

    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;

    expect(request).toHaveBeenCalledTimes(1);
    expect(retainedBodies[0].every((byte) => byte === 0)).toBe(true);
  });

  it("evicts an unused credential five seconds before the trust expires", async () => {
    installProviderHarness();
    const root = new AbortController();
    const trust = await prepare(root.signal);
    const evictionDelay = Date.parse(trust.expiresAt) - Date.now() - 5_000;

    await vi.advanceTimersByTimeAsync(evictionDelay);

    expect(() => createAdapter(trust, root.signal)).toThrowError(FIXED_FAILURE);
  });

  it("scrubs a sensitive provider response that fulfills after root abort", async () => {
    installProviderHarness();
    const lateBody = encoder.encode('{"token":"late-sensitive-token"}');
    let releaseLateResponse: (() => void) | undefined;
    const request = vi.fn(
      (value: ProviderRequest) =>
        new Promise((resolve) => {
          releaseLateResponse = () =>
            resolve(
              Object.freeze({
                status: 200,
                contentType: "application/json",
                responseUrl: value.url,
                redirected: false as const,
                body: lateBody,
              }),
            );
        }),
    );
    providerMocks.createTransport.mockReturnValue(Object.freeze({ request }));
    const root = new AbortController();
    const operation = prepare(root.signal);
    const assertion = expect(operation).rejects.toEqual(FIXED_FAILURE);

    await Promise.resolve();
    root.abort();
    await assertion;
    releaseLateResponse?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(1);
    expect(lateBody.every((byte) => byte === 0)).toBe(true);
  });

  it("explicitly discards an unused one-use handle", async () => {
    installProviderHarness();
    const root = new AbortController();
    const trust = await prepare(root.signal);

    discardCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b(trust);
    expect(() => createAdapter(trust, root.signal)).toThrowError(FIXED_FAILURE);
    expect(() =>
      discardCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b(trust),
    ).toThrowError(FIXED_FAILURE);
  });
});

type ProviderRequest = Readonly<{
  method: "GET" | "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  responseUrl?: string;
  signal: AbortSignal;
}>;

type HarnessOptions = Readonly<{
  baseClaims?: Readonly<Record<string, unknown>>;
  customClaims?: Readonly<Record<string, unknown>>;
  stsResponse?: Readonly<Record<string, unknown>>;
  keyResponse?: Readonly<Record<string, unknown>>;
  versionResponse?: Readonly<Record<string, unknown>>;
  operationAccessToken?: string;
  customExpiresAtSeconds?: number;
  impersonatedExpiresAt?: string;
}>;

function installProviderHarness(options: HarnessOptions = {}) {
  const baseClaims = {
    iss: VERCEL_ISSUER,
    aud: VERCEL_DEFAULT_AUDIENCE,
    sub: VERCEL_SUBJECT,
    iat: NOW_SECONDS - 600,
    nbf: NOW_SECONDS - 600,
    exp: NOW_SECONDS + 7_200,
    owner_id: "team_cFWfAk6zAa0b7X5bc1ONT4SA",
    owner: "millionlunas-projects",
    project_id: "prj_AtdTukVr39wrGH9PYgKusfku2gvS",
    project: "careslink-ai",
    environment: "preview",
    ...options.baseClaims,
  };
  const baseToken = jwt(baseClaims);
  const requests: ProviderRequest[] = [];
  const retainedRequestBodies: Uint8Array[] = [];
  const responseBodies: Uint8Array[] = [];
  let impersonationCount = 0;
  providerMocks.getVercelOidcTokenSync.mockReturnValue(baseToken);
  const request = vi.fn(async (requestValue: ProviderRequest) => {
    retainedRequestBodies.push(requestValue.body);
    const captured = Object.freeze({
      ...requestValue,
      headers: Object.freeze({ ...requestValue.headers }),
      body: Uint8Array.from(requestValue.body),
    });
    requests.push(captured);
    if (requestValue.url === "https://oidc.vercel.com/~token") {
      const exchange = JSON.parse(decoder.decode(captured.body)) as {
        jti: string;
      };
      const customExpiresAtSeconds =
        options.customExpiresAtSeconds ?? (baseClaims.exp as number);
      return response(requestValue, responseBodies, {
        token: jwt({
          ...baseClaims,
          aud: VERCEL_CUSTOM_AUDIENCE,
          iat: NOW_SECONDS,
          exp: customExpiresAtSeconds,
          jti: exchange.jti,
          act: {
            aud: VERCEL_DEFAULT_AUDIENCE,
            iat: baseClaims.iat,
          },
          ...options.customClaims,
        }),
        expiry: customExpiresAtSeconds,
      });
    }
    if (requestValue.url === "https://sts.googleapis.com/v1/token") {
      return response(requestValue, responseBodies, {
        access_token: FEDERATED_ACCESS_TOKEN,
        issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
        token_type: "Bearer",
        expires_in: 3_600,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        ...options.stsResponse,
      });
    }
    if (requestValue.url === IAM_URL) {
      impersonationCount += 1;
      return response(requestValue, responseBodies, {
        accessToken:
          impersonationCount === 1
            ? POSTURE_ACCESS_TOKEN
            : (options.operationAccessToken ?? OPERATION_ACCESS_TOKEN),
        expireTime:
          options.impersonatedExpiresAt ??
          new Date(NOW.getTime() + 299_000).toISOString(),
      });
    }
    if (
      requestValue.method === "GET" &&
      requestValue.url === `https://cloudkms.googleapis.com/v1/${KMS_KEY_RESOURCE}`
    ) {
      return response(requestValue, responseBodies, {
        name: KMS_KEY_RESOURCE,
        purpose: "RAW_ENCRYPT_DECRYPT",
        versionTemplate: {
          protectionLevel: "SOFTWARE",
          algorithm: "AES_256_GCM",
        },
        importOnly: false,
        ...options.keyResponse,
      });
    }
    if (
      requestValue.method === "GET" &&
      requestValue.url ===
        `https://cloudkms.googleapis.com/v1/${KMS_KEY_VERSION_RESOURCE}`
    ) {
      return response(requestValue, responseBodies, {
        name: KMS_KEY_VERSION_RESOURCE,
        state: "ENABLED",
        protectionLevel: "SOFTWARE",
        algorithm: "AES_256_GCM",
        ...options.versionResponse,
      });
    }
    if (
      requestValue.method === "POST" &&
      requestValue.url ===
        `https://cloudkms.googleapis.com/v1/${KMS_KEY_VERSION_RESOURCE}:rawEncrypt`
    ) {
      return response(requestValue, responseBodies, {
        ciphertext: Buffer.from(CIPHERTEXT).toString("base64"),
        initializationVector: Buffer.from(INITIALIZATION_VECTOR).toString(
          "base64",
        ),
        tagLength: 16,
        ciphertextCrc32c: String(crc32c.calculate(CIPHERTEXT)),
        initializationVectorCrc32c: String(
          crc32c.calculate(INITIALIZATION_VECTOR),
        ),
        verifiedPlaintextCrc32c: true,
        verifiedAdditionalAuthenticatedDataCrc32c: true,
        name: KMS_KEY_VERSION_RESOURCE,
        protectionLevel: "SOFTWARE",
      });
    }
    throw new Error("Unexpected test-only provider request");
  });
  providerMocks.createTransport.mockReturnValue(Object.freeze({ request }));
  return { baseToken, requests, retainedRequestBodies, responseBodies };
}

function response(
  request: ProviderRequest,
  retainedBodies: Uint8Array[],
  value: unknown,
) {
  const body = encoder.encode(JSON.stringify(value));
  retainedBodies.push(body);
  return Object.freeze({
    status: 200,
    contentType: "application/json",
    responseUrl: request.url,
    redirected: false as const,
    body,
  });
}

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function jwt(claims: Readonly<Record<string, unknown>>) {
  return `${base64url({ alg: "RS256", typ: "JWT", kid: "test-key" })}.${base64url(claims)}.${Buffer.from("test-only-signature-material").toString("base64url")}`;
}

function prepare(rootAbortSignal: AbortSignal) {
  return prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b(
    Object.freeze({
      capability: "TEST_ONLY_M2B_GOOGLE_CLOUD_PROVIDER_TRUST",
      expectedKmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
      rootAbortSignal,
    }),
  );
}

function walkSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function createAdapter(providerTrust: unknown, rootAbortSignal: AbortSignal) {
  return createCaresLinkV1NoteGenerationAuthenticatedGoogleCloudKmsWrapAdapterM2b(
    Object.freeze({ providerTrust, rootAbortSignal }),
  );
}
