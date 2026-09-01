import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const oidcMocks = vi.hoisted(() => ({
  getVercelOidcTokenSync: vi.fn(),
}));
const nodeHttpsMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcTokenSync: oidcMocks.getVercelOidcTokenSync,
}));
vi.mock("node:https", () => ({ request: nodeHttpsMocks.request }));

import * as bridgeModule from "./communication-note-preview-product-runtime-gcp-rest-bridge.server";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PROJECT_ID = "careslink-m1u-security";
const PROJECT_NUMBER = "288554824534";
const LOCATION = "australia-southeast1";
const WIF_PROVIDER_RESOURCE =
  `//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`;
const WIF_SUBJECT_TOKEN_AUDIENCE =
  `https://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`;
const RUNTIME_SERVICE_ACCOUNT =
  `careslink-preview-runtime@${PROJECT_ID}.iam.gserviceaccount.com`;
const IMPERSONATION_URL =
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${RUNTIME_SERVICE_ACCOUNT}:generateAccessToken`;
const KMS_SIGN_KEY =
  `projects/${PROJECT_ID}/locations/${LOCATION}/keyRings/careslink-preview-m1u/cryptoKeys/hmac-workload-identity-v1/cryptoKeyVersions/1`;
const KMS_DEPLOYMENT_SIGN_KEY =
  `projects/${PROJECT_ID}/locations/${LOCATION}/keyRings/careslink-preview-m1u/cryptoKeys/hmac-deployment-source-target-v1/cryptoKeyVersions/1`;
const KMS_PROJECT_REF_SIGN_KEY =
  `projects/${PROJECT_ID}/locations/${LOCATION}/keyRings/careslink-preview-m1u/cryptoKeys/hmac-supabase-project-ref-v1/cryptoKeyVersions/1`;
const KMS_VERIFY_KEY =
  `projects/${PROJECT_ID}/locations/${LOCATION}/keyRings/careslink-preview-m1u/cryptoKeys/hmac-source-manifest-v1/cryptoKeyVersions/1`;
const SECRET_VERSION =
  `projects/${PROJECT_ID}/locations/${LOCATION}/secrets/supabase-preview-pinned-ca-pem/versions/1`;
const BASE_TOKEN = jwt("base-token");
const CUSTOM_TOKEN = jwt("custom-audience-token");
const FEDERATED_ACCESS_TOKEN = "federated-access-token-test-only";
const IMPERSONATED_ACCESS_TOKEN = "impersonated-access-token-test-only";
const MAC = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SECRET = encoder.encode("m1v-secret-payload-test-only");
const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message: "Communication Note preview GCP REST bridge is unavailable",
});

describe("Communication Note M1v GCP REST bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oidcMocks.getVercelOidcTokenSync.mockReturnValue(BASE_TOKEN);
  });

  it("keeps the formal bridge fixed-off and pins the source-only direct REST boundary", async () => {
    expect(Object.keys(bridgeModule).sort()).toEqual([
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_POLICY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_POLICY_DIGEST",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_READY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_VERSION",
      "createCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge",
      "createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge",
    ]);
    expect(
      bridgeModule.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_READY,
    ).toBe(false);
    expect(
      bridgeModule.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE,
    ).toBeUndefined();
    expect(
      bridgeModule.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_POLICY_DIGEST,
    ).toBe(
      "c116c449fb025ecaca156e952d37b812c7dd272258120f677c8cef1e202326e3",
    );
    expect(
      bridgeModule.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_POLICY,
    ).toMatchObject({
      status: "SOURCE_GCP_REST_BRIDGE_NOT_ACTIVATED",
      ready: false,
      directRest: true,
      zeroRetry: true,
      requestTimeoutMs: 5_000,
      sameRootAbortSignal: true,
      redirectsAllowed: false,
      automaticRetries: 0,
      absoluteWallClockDeadlineRequired: true,
      requestBodyMaximumBytes: 96 * 1_024,
      tokenResponseMaximumBytes: 16 * 1_024,
      kmsResponseMaximumBytes: 64 * 1_024,
      secretResponseMaximumBytes: 96 * 1_024,
      hmacSha256MacBytes: 32,
      kmsMacSignKeyVersions: [
        KMS_SIGN_KEY,
        KMS_DEPLOYMENT_SIGN_KEY,
        KMS_PROJECT_REF_SIGN_KEY,
      ],
      kmsMacVerifyKeyVersions: [KMS_VERIFY_KEY],
      supabaseManagementHttpsImplemented: false,
      liveEvidencePresent: false,
      deploymentApproved: false,
      activationApproved: false,
    });

    let traps = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          traps += 1;
          return "RAW_SECRET_SENTINEL";
        },
        ownKeys() {
          traps += 1;
          return [];
        },
      },
    );
    await expect(
      bridgeModule.createCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
        hostile,
        hostile,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(traps).toBe(0);

    const source = readFileSync(
      new URL(
        "./communication-note-preview-product-runtime-gcp-rest-bridge.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toMatch(/getVercelOidcTokenSync/);
    expect(source).toMatch(/node:https/);
    expect(source).not.toMatch(
      /\bfetch\s*\(|process\.env|import\.meta\.env|GOOGLE_APPLICATION_CREDENTIALS|private_key|client_email|fromJSON\s*\(|GoogleAuth\s*\(|console\.|\blogger\b|api\.supabase\.com\/v1\/projects/i,
    );
  });

  it("performs one custom-audience exchange, STS exchange and impersonation with the same root signal", async () => {
    const harness = createHarness();
    const customToken = await harness.bundle.vercelOidcTokenSource.getToken(
      tokenRequest(),
    );
    expect(customToken).toBe(CUSTOM_TOKEN);

    const exchange = await harness.bundle.workloadIdentityClient.verifyAndExchange(
      workloadRequest(CUSTOM_TOKEN),
      harness.context,
    );
    expect(exchange).toEqual({
      status: "GCP_WIF_TOKEN_VERIFIED_AND_IMPERSONATED",
      principal: RUNTIME_SERVICE_ACCOUNT,
      expiresAt: harness.expiresAt,
      rawAccessTokenMaterialPresent: false,
    });
    expect(JSON.stringify(exchange)).not.toContain(BASE_TOKEN);
    expect(JSON.stringify(exchange)).not.toContain(CUSTOM_TOKEN);
    expect(JSON.stringify(exchange)).not.toContain(FEDERATED_ACCESS_TOKEN);
    expect(JSON.stringify(exchange)).not.toContain(IMPERSONATED_ACCESS_TOKEN);

    expect(oidcMocks.getVercelOidcTokenSync).toHaveBeenCalledTimes(1);
    expect(harness.request).toHaveBeenCalledTimes(3);
    const [vercel, sts, impersonation] = harness.requests;
    expectRequestBoundary(vercel, harness.context.signal, 16 * 1_024);
    expect(vercel).toMatchObject({
      method: "POST",
      url: "https://oidc.vercel.com/~token",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "careslink-ai-m1v-gcp-rest-bridge/2026-09-01",
      },
    });
    expect(readJson(vercel.body)).toEqual({
      token: BASE_TOKEN,
      aud: WIF_SUBJECT_TOKEN_AUDIENCE,
    });

    expectRequestBoundary(sts, harness.context.signal, 16 * 1_024);
    expect(sts).toMatchObject({
      method: "POST",
      url: "https://sts.googleapis.com/v1/token",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
    });
    expect(Object.fromEntries(new URLSearchParams(decoder.decode(sts.body)))).toEqual({
      audience: WIF_PROVIDER_RESOURCE,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subject_token: CUSTOM_TOKEN,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    });

    expectRequestBoundary(impersonation, harness.context.signal, 16 * 1_024);
    expect(impersonation).toMatchObject({
      method: "POST",
      url: IMPERSONATION_URL,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${FEDERATED_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
    });
    expect(readJson(impersonation.body)).toEqual({
      scope: ["https://www.googleapis.com/auth/cloud-platform"],
      lifetime: "3600s",
    });

    await expect(
      harness.bundle.vercelOidcTokenSource.getToken(tokenRequest()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await expect(
      harness.bundle.workloadIdentityClient.verifyAndExchange(
        workloadRequest(CUSTOM_TOKEN),
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.request).toHaveBeenCalledTimes(3);
  });

  it("accepts and conservatively normalizes Google Timestamp fractional precision", async () => {
    const canonical = new Date(Date.now() + 30 * 60 * 1_000).toISOString();
    const second = canonical.slice(0, 19);
    const milliseconds = canonical.slice(20, 23);
    for (const expireTime of [
      `${second}Z`,
      `${second}.${milliseconds}Z`,
      `${second}.${milliseconds}456Z`,
      `${second}.${milliseconds}456789Z`,
    ]) {
      const harness = createHarness({ expireTime });
      const token = await harness.bundle.vercelOidcTokenSource.getToken(
        tokenRequest(),
      );
      await expect(
        harness.bundle.workloadIdentityClient.verifyAndExchange(
          workloadRequest(token),
          harness.context,
        ),
      ).resolves.toMatchObject({
        expiresAt: new Date(Date.parse(expireTime)).toISOString(),
      });
    }

    const invalid = createHarness({
      expireTime: `${second}.${milliseconds}4Z`,
    });
    const token = await invalid.bundle.vercelOidcTokenSource.getToken(
      tokenRequest(),
    );
    await expect(
      invalid.bundle.workloadIdentityClient.verifyAndExchange(
        workloadRequest(token),
        invalid.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
  });

  it("enforces a five-second wall-clock deadline on the concrete Node HTTPS transport", async () => {
    vi.useFakeTimers();
    try {
      const request = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      };
      request.write = vi.fn();
      request.end = vi.fn();
      request.destroy = vi.fn((error: unknown) => {
        request.emit("error", error);
      });
      nodeHttpsMocks.request.mockReturnValue(request);
      const controller = new AbortController();
      const bundle =
        bridgeModule.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
          Object.freeze({
            capability: "TEST_ONLY_M1V_GCP_REST_BRIDGE",
            httpsTransport: undefined,
          }),
          Object.freeze({ signal: controller.signal }),
        );
      const pending = expect(
        bundle.vercelOidcTokenSource.getToken(tokenRequest()),
      ).rejects.toMatchObject(FIXED_FAILURE);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(request.destroy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await pending;

      expect(request.write).toHaveBeenCalledTimes(1);
      expect(request.end).toHaveBeenCalledTimes(1);
      expect(request.destroy).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("normalizes KMS macSign and macVerify CRC32C values over one HTTPS request each", async () => {
    const harness = createHarness();
    await authorize(harness);
    const data = encoder.encode("m1v-kms-binding");
    const dataCrc32c = crc32c.calculate(data);
    const macCrc32c = crc32c.calculate(MAC);

    const signed = await harness.bundle.kmsClient.macSign(
      Object.freeze({ name: KMS_SIGN_KEY, data, dataCrc32c }),
      harness.context,
    );
    expect(signed).toEqual([
      {
        name: KMS_SIGN_KEY,
        mac: MAC,
        macCrc32c,
        verifiedDataCrc32c: true,
        protectionLevel: "SOFTWARE",
      },
    ]);

    const verified = await harness.bundle.kmsClient.macVerify(
      Object.freeze({
        name: KMS_VERIFY_KEY,
        data,
        dataCrc32c,
        mac: MAC,
        macCrc32c,
      }),
      harness.context,
    );
    expect(verified).toEqual([
      {
        name: KMS_VERIFY_KEY,
        success: true,
        verifiedDataCrc32c: true,
        verifiedMacCrc32c: true,
        verifiedSuccessIntegrity: true,
        protectionLevel: "SOFTWARE",
      },
    ]);

    const signRequest = harness.requests[3];
    const verifyRequest = harness.requests[4];
    expectRequestBoundary(signRequest, harness.context.signal, 64 * 1_024);
    expect(signRequest).toMatchObject({
      method: "POST",
      url: `https://cloudkms.googleapis.com/v1/${KMS_SIGN_KEY}:macSign`,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${IMPERSONATED_ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
    });
    expect(readJson(signRequest.body)).toEqual({
      data: Buffer.from(data).toString("base64"),
      dataCrc32c: String(dataCrc32c),
    });
    expectRequestBoundary(verifyRequest, harness.context.signal, 64 * 1_024);
    expect(verifyRequest.url).toBe(
      `https://cloudkms.googleapis.com/v1/${KMS_VERIFY_KEY}:macVerify`,
    );
    expect(readJson(verifyRequest.body)).toEqual({
      data: Buffer.from(data).toString("base64"),
      dataCrc32c: String(dataCrc32c),
      mac: Buffer.from(MAC).toString("base64"),
      macCrc32c: String(macCrc32c),
    });
    expect(harness.request).toHaveBeenCalledTimes(5);
  });

  it("accesses only a numeric Sydney regional secret version and validates its CRC32C", async () => {
    const harness = createHarness();
    await authorize(harness);
    const response = await harness.bundle.secretManagerClient.accessSecretVersion(
      Object.freeze({ name: SECRET_VERSION }),
      harness.context,
    );
    expect(response).toEqual([
      {
        name: SECRET_VERSION,
        payload: { data: SECRET, dataCrc32c: crc32c.calculate(SECRET) },
      },
    ]);
    const request = harness.requests[3];
    expectRequestBoundary(request, harness.context.signal, 96 * 1_024);
    expect(request).toMatchObject({
      method: "GET",
      url: `https://secretmanager.${LOCATION}.rep.googleapis.com/v1/${SECRET_VERSION}:access`,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${IMPERSONATED_ACCESS_TOKEN}`,
      },
    });
    expect(Object.keys(request.headers).sort()).toEqual([
      "accept",
      "authorization",
    ]);
    expect(request.body).toEqual(new Uint8Array());
    expect(harness.request).toHaveBeenCalledTimes(4);
  });

  it("fails closed before I/O for wrong capability, signal, resource or CRC", async () => {
    const controller = new AbortController();
    const request = vi.fn();
    const transport = Object.freeze({ request });
    expect(() =>
      bridgeModule.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
        Object.freeze({ capability: "WRONG", httpsTransport: transport }),
        Object.freeze({ signal: controller.signal }),
      ),
    ).toThrowError(FIXED_FAILURE);
    expect(request).not.toHaveBeenCalled();

    const harness = createHarness();
    await authorize(harness);
    const callsAfterAuthorization = harness.request.mock.calls.length;
    const wrongContext = Object.freeze({
      signal: new AbortController().signal,
    });
    await expect(
      harness.bundle.kmsClient.macSign(
        Object.freeze({
          name: KMS_SIGN_KEY,
          data: encoder.encode("binding"),
          dataCrc32c: 0,
        }),
        wrongContext,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await expect(
      harness.bundle.secretManagerClient.accessSecretVersion(
        Object.freeze({
          name: SECRET_VERSION.replace("/versions/1", "/versions/latest"),
        }),
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await expect(
      harness.bundle.kmsClient.macSign(
        Object.freeze({
          name: KMS_SIGN_KEY,
          data: encoder.encode("binding"),
          dataCrc32c: 0,
        }),
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    const validData = encoder.encode("purpose-separated-key");
    const validDataCrc32c = crc32c.calculate(validData);
    await expect(
      harness.bundle.kmsClient.macSign(
        Object.freeze({
          name: KMS_VERIFY_KEY,
          data: validData,
          dataCrc32c: validDataCrc32c,
        }),
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await expect(
      harness.bundle.kmsClient.macVerify(
        Object.freeze({
          name: KMS_SIGN_KEY,
          data: validData,
          dataCrc32c: validDataCrc32c,
          mac: MAC,
          macCrc32c: crc32c.calculate(MAC),
        }),
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    const shortMac = MAC.slice(0, 31);
    await expect(
      harness.bundle.kmsClient.macVerify(
        Object.freeze({
          name: KMS_VERIFY_KEY,
          data: validData,
          dataCrc32c: validDataCrc32c,
          mac: shortMac,
          macCrc32c: crc32c.calculate(shortMac),
        }),
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.request).toHaveBeenCalledTimes(callsAfterAuthorization);

    const shortResponseHarness = createHarness({ mac: shortMac });
    await authorize(shortResponseHarness);
    const shortResponseCalls = shortResponseHarness.request.mock.calls.length;
    await expect(
      shortResponseHarness.bundle.kmsClient.macSign(
        Object.freeze({
          name: KMS_SIGN_KEY,
          data: validData,
          dataCrc32c: validDataCrc32c,
        }),
        shortResponseHarness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(shortResponseHarness.request).toHaveBeenCalledTimes(
      shortResponseCalls + 1,
    );
  });

  it("caps responses and sanitizes provider errors without leaking credential material", async () => {
    const controller = new AbortController();
    const rawProviderFailure = `provider rejected ${BASE_TOKEN}`;
    const throwingTransport = Object.freeze({
      request: vi.fn(async () => {
        throw new Error(rawProviderFailure);
      }),
    });
    const throwingBundle =
      bridgeModule.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
        Object.freeze({
          capability: "TEST_ONLY_M1V_GCP_REST_BRIDGE",
          httpsTransport: throwingTransport,
        }),
        Object.freeze({ signal: controller.signal }),
      );
    let failure: unknown;
    try {
      await throwingBundle.vercelOidcTokenSource.getToken(tokenRequest());
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(FIXED_FAILURE);
    expect(JSON.stringify(failure)).not.toContain(BASE_TOKEN);
    expect(JSON.stringify(failure)).not.toContain(rawProviderFailure);
    expect(throwingTransport.request).toHaveBeenCalledTimes(1);

    oidcMocks.getVercelOidcTokenSync.mockReturnValue(BASE_TOKEN);
    const oversizedTransport = Object.freeze({
      request: vi.fn(async (requestValue: HttpsRequest) =>
        Object.freeze({
          status: 200,
          contentType: "application/json",
          responseUrl: requestValue.url,
          redirected: false as const,
          body: new Uint8Array(requestValue.maximumResponseBytes + 1),
        }),
      ),
    });
    const oversizedBundle =
      bridgeModule.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
        Object.freeze({
          capability: "TEST_ONLY_M1V_GCP_REST_BRIDGE",
          httpsTransport: oversizedTransport,
        }),
        Object.freeze({ signal: new AbortController().signal }),
      );
    await expect(
      oversizedBundle.vercelOidcTokenSource.getToken(tokenRequest()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(oversizedTransport.request).toHaveBeenCalledTimes(1);
  });
});

type HttpsRequest = Readonly<{
  method: "GET" | "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  redirect: "ERROR";
  automaticRetries: 0;
  timeoutMs: 5_000;
  maximumResponseBytes: number;
  signal: AbortSignal;
}>;

function createHarness(
  options: { expireTime?: string; mac?: Uint8Array } = {},
) {
  const controller = new AbortController();
  const context = Object.freeze({ signal: controller.signal });
  const requests: HttpsRequest[] = [];
  const providerExpireTime =
    options.expireTime ??
    new Date(Date.now() + 55 * 60 * 1_000).toISOString();
  const expiresAt = new Date(Date.parse(providerExpireTime)).toISOString();
  const request = vi.fn(async (requestValue: HttpsRequest) => {
    requests.push(requestValue);
    switch (requestValue.url) {
      case "https://oidc.vercel.com/~token":
        return jsonResponse(requestValue.url, {
          token: CUSTOM_TOKEN,
          expiry: Math.floor(Date.now() / 1_000) + 3_600,
        });
      case "https://sts.googleapis.com/v1/token":
        return jsonResponse(requestValue.url, {
          access_token: FEDERATED_ACCESS_TOKEN,
          issued_token_type:
            "urn:ietf:params:oauth:token-type:access_token",
          token_type: "Bearer",
          expires_in: 3_600,
          scope: "https://www.googleapis.com/auth/cloud-platform",
        });
      case IMPERSONATION_URL:
        return jsonResponse(requestValue.url, {
          accessToken: IMPERSONATED_ACCESS_TOKEN,
          expireTime: providerExpireTime,
        });
      case `https://cloudkms.googleapis.com/v1/${KMS_SIGN_KEY}:macSign`: {
        const mac = options.mac ?? MAC;
        return jsonResponse(requestValue.url, {
          name: KMS_SIGN_KEY,
          mac: Buffer.from(mac).toString("base64"),
          macCrc32c: String(crc32c.calculate(mac)),
          verifiedDataCrc32c: true,
          protectionLevel: "SOFTWARE",
        });
      }
      case `https://cloudkms.googleapis.com/v1/${KMS_VERIFY_KEY}:macVerify`:
        return jsonResponse(requestValue.url, {
          name: KMS_VERIFY_KEY,
          success: true,
          verifiedDataCrc32c: true,
          verifiedMacCrc32c: true,
          verifiedSuccessIntegrity: true,
          protectionLevel: "SOFTWARE",
        });
      case `https://secretmanager.${LOCATION}.rep.googleapis.com/v1/${SECRET_VERSION}:access`:
        return jsonResponse(requestValue.url, {
          name: SECRET_VERSION,
          payload: {
            data: Buffer.from(SECRET).toString("base64"),
            dataCrc32c: String(crc32c.calculate(SECRET)),
          },
        });
      default:
        throw new Error("unexpected request");
    }
  });
  const transport = Object.freeze({ request });
  const bundle =
    bridgeModule.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
      Object.freeze({
        capability: "TEST_ONLY_M1V_GCP_REST_BRIDGE",
        httpsTransport: transport,
      }),
      context,
    );
  expect(Object.isFrozen(bundle)).toBe(true);
  expect(Object.values(bundle).every(Object.isFrozen)).toBe(true);
  return { bundle, context, controller, request, requests, expiresAt };
}

async function authorize(harness: ReturnType<typeof createHarness>) {
  const token = await harness.bundle.vercelOidcTokenSource.getToken(
    tokenRequest(),
  );
  await harness.bundle.workloadIdentityClient.verifyAndExchange(
    workloadRequest(token),
    harness.context,
  );
}

function tokenRequest() {
  return Object.freeze({
    team: "millionlunas-projects",
    project: "careslink-ai",
    audience: WIF_SUBJECT_TOKEN_AUDIENCE,
  });
}

function workloadRequest(token: unknown) {
  return Object.freeze({
    token,
    audience: WIF_PROVIDER_RESOURCE,
    subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
    serviceAccountImpersonationUrl: IMPERSONATION_URL,
    expectedIssuer: "https://oidc.vercel.com/millionlunas-projects",
    expectedAudience: WIF_SUBJECT_TOKEN_AUDIENCE,
    expectedSubject:
      "owner:millionlunas-projects:project:careslink-ai:environment:preview",
    expectedOwnerId: "team_cFWfAk6zAa0b7X5bc1ONT4SA",
    expectedProjectId: "prj_AtdTukVr39wrGH9PYgKusfku2gvS",
    expectedEnvironment: "preview",
  });
}

function expectRequestBoundary(
  request: HttpsRequest,
  signal: AbortSignal,
  maximumResponseBytes: number,
) {
  expect(request.signal).toBe(signal);
  expect(request.timeoutMs).toBe(5_000);
  expect(request.maximumResponseBytes).toBe(maximumResponseBytes);
  expect(request.redirect).toBe("ERROR");
  expect(request.automaticRetries).toBe(0);
}

function jsonResponse(url: string, value: unknown) {
  return Object.freeze({
    status: 200,
    contentType: "application/json; charset=utf-8",
    responseUrl: url,
    redirected: false as const,
    body: encoder.encode(JSON.stringify(value)),
  });
}

function readJson(value: Uint8Array) {
  return JSON.parse(decoder.decode(value)) as unknown;
}

function jwt(label: string) {
  const encode = (value: string) => Buffer.from(value).toString("base64url");
  return `${encode('{"alg":"RS256"}')}.${encode(`{"label":"${label}"}`)}.${encode(
    `signature-${label}`,
  )}`;
}
