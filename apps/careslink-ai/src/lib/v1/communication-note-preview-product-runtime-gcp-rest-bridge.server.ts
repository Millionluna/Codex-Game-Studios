import "server-only";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { request as nodeHttpsRequest } from "node:https";
import { types as nodeTypes } from "node:util";

import { getVercelOidcTokenSync } from "@vercel/oidc";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const PROJECT_ID = "careslink-m1u-security" as const;
const PROJECT_NUMBER = "288554824534" as const;
const LOCATION = "australia-southeast1" as const;
const VERCEL_TEAM_SLUG = "millionlunas-projects" as const;
const VERCEL_PROJECT_NAME = "careslink-ai" as const;
const WIF_POOL = "vercel-careslink-preview" as const;
const WIF_PROVIDER = "vercel-team-preview" as const;
const WIF_PROVIDER_RESOURCE =
  `//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}` as const;
const WIF_SUBJECT_TOKEN_AUDIENCE =
  `https://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}` as const;
const RUNTIME_SERVICE_ACCOUNT =
  `careslink-preview-runtime@${PROJECT_ID}.iam.gserviceaccount.com` as const;
const RUNTIME_SERVICE_ACCOUNT_IMPERSONATION_URL =
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${RUNTIME_SERVICE_ACCOUNT}:generateAccessToken` as const;
const VERCEL_TOKEN_EXCHANGE_URL = "https://oidc.vercel.com/~token" as const;
const STS_TOKEN_EXCHANGE_URL = "https://sts.googleapis.com/v1/token" as const;
const KMS_ORIGIN = "https://cloudkms.googleapis.com" as const;
const SECRET_MANAGER_ORIGIN =
  `https://secretmanager.${LOCATION}.rep.googleapis.com` as const;
const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform" as const;
const SUBJECT_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:jwt" as const;
const TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange" as const;
const ACCESS_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:access_token" as const;
const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_RESPONSE_MAXIMUM_BYTES = 16 * 1_024;
const KMS_RESPONSE_MAXIMUM_BYTES = 64 * 1_024;
const SECRET_RESPONSE_MAXIMUM_BYTES = 96 * 1_024;
const REQUEST_BODY_MAXIMUM_BYTES = 96 * 1_024;
const MAXIMUM_TOKEN_BYTES = 16 * 1_024;
const MAXIMUM_SECRET_BYTES = 64 * 1_024;
const HMAC_SHA256_MAC_BYTES = 32;
const MAXIMUM_ACCESS_TOKEN_LIFETIME_SECONDS = 3_600;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const GOOGLE_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}|\d{6}|\d{9}))?Z$/;

const KMS_MAC_SIGN_KEY_VERSIONS = Object.freeze([
  kmsVersion("hmac-workload-identity-v1"),
  kmsVersion("hmac-deployment-source-target-v1"),
  kmsVersion("hmac-supabase-project-ref-v1"),
]);
const KMS_MAC_VERIFY_KEY_VERSIONS = Object.freeze([
  kmsVersion("hmac-source-manifest-v1"),
]);
const KMS_MAC_SIGN_KEY_VERSION_SET = new Set(KMS_MAC_SIGN_KEY_VERSIONS);
const KMS_MAC_VERIFY_KEY_VERSION_SET = new Set(KMS_MAC_VERIFY_KEY_VERSIONS);
const SECRET_VERSIONS = Object.freeze([
  secretVersion("supabase-management-oauth-credential"),
  secretVersion("supabase-preview-pinned-ca-pem"),
  secretVersion("supabase-preview-branch-admin-password"),
]);
const SECRET_VERSION_SET = new Set(SECRET_VERSIONS);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_VERSION =
  "gcp-rest-bridge.communication.openai.synthetic-preview.2026-09-01.m1v.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_READY =
  false as const;

const GCP_REST_BRIDGE_POLICY_CORE = deepFreeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_VERSION,
    status: "SOURCE_GCP_REST_BRIDGE_NOT_ACTIVATED",
    ready: false,
    sourceOnly: true,
    nodeRuntimeRequired: true,
    edgeRuntimeSupported: false,
    directRest: true,
    zeroRetry: true,
    sameRootAbortSignal: true,
    productionAllowed: false,
    formalFactoryEnabled: false,
    testOnlyCapabilityRequired: true,
    applicationDefaultCredentialsAllowed: false,
    serviceAccountJsonAllowed: false,
    vercelBaseTokenSource: "@vercel/oidc.getVercelOidcTokenSync",
    vercelCustomAudienceExchangeUrl: VERCEL_TOKEN_EXCHANGE_URL,
    wifExternalAccountAudience: WIF_PROVIDER_RESOURCE,
    wifSubjectTokenAudience: WIF_SUBJECT_TOKEN_AUDIENCE,
    stsTokenExchangeUrl: STS_TOKEN_EXCHANGE_URL,
    runtimeServiceAccount: RUNTIME_SERVICE_ACCOUNT,
    runtimeServiceAccountImpersonationUrl:
      RUNTIME_SERVICE_ACCOUNT_IMPERSONATION_URL,
    kmsOrigin: KMS_ORIGIN,
    kmsMacSignKeyVersions: KMS_MAC_SIGN_KEY_VERSIONS,
    kmsMacVerifyKeyVersions: KMS_MAC_VERIFY_KEY_VERSIONS,
    secretManagerOrigin: SECRET_MANAGER_ORIGIN,
    secretVersions: SECRET_VERSIONS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    absoluteWallClockDeadlineRequired: true,
    requestBodyMaximumBytes: REQUEST_BODY_MAXIMUM_BYTES,
    tokenResponseMaximumBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
    kmsResponseMaximumBytes: KMS_RESPONSE_MAXIMUM_BYTES,
    secretResponseMaximumBytes: SECRET_RESPONSE_MAXIMUM_BYTES,
    accessTokenMaximumBytes: MAXIMUM_TOKEN_BYTES,
    secretMaximumBytes: MAXIMUM_SECRET_BYTES,
    hmacSha256MacBytes: HMAC_SHA256_MAC_BYTES,
    accessTokenMaximumLifetimeSeconds:
      MAXIMUM_ACCESS_TOKEN_LIFETIME_SECONDS,
    googleTimestampFractionalDigitsAllowed: [0, 3, 6, 9],
    redirectsAllowed: false,
    automaticRetries: 0,
    rootAbortSignalRequired: true,
    crc32cNormalizationRequired: true,
    responseByteCapsRequired: true,
    rawAccessTokenReturned: false,
    rawSecretMaterialLogged: false,
    supabaseManagementHttpsImplemented: false,
    liveEvidencePresent: false,
    deploymentApproved: false,
    activationApproved: false,
  } as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_POLICY_DIGEST =
  "c116c449fb025ecaca156e952d37b812c7dd272258120f677c8cef1e202326e3" as const;

if (
  canonicalSha256(GCP_REST_BRIDGE_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_POLICY =
  deepFreeze({
    ...GCP_REST_BRIDGE_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE_POLICY_DIGEST,
  });

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_REST_BRIDGE =
  undefined as GcpRestBridgeBundle | undefined;

export async function createCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
  _value: unknown,
  _context: unknown,
): Promise<never> {
  void _value;
  void _context;
  throw unavailable();
}

/**
 * Source-only bridge from the existing M1u low-level client seam to bounded
 * Google Cloud REST calls. The formal factory remains disabled. This seam is
 * test-only and never reads ADC or accepts a service-account key.
 */
export function createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
  value: unknown,
  contextValue: unknown,
): GcpRestBridgeBundle {
  try {
    const options = exactDataRecord(value, ["capability", "httpsTransport"]);
    if (options.capability !== "TEST_ONLY_M1V_GCP_REST_BRIDGE") {
      throw unavailable();
    }
    const context = validateContext(contextValue);
    const httpsTransport =
      options.httpsTransport === undefined
        ? NODE_HTTPS_TRANSPORT
        : validateHttpsTransport(options.httpsTransport);

    let vercelExchangeStarted = false;
    let workloadExchangeStarted = false;
    let impersonatedCredential:
      | Readonly<{ accessToken: string; expiresAt: string }>
      | undefined;

    const vercelOidcTokenSource = Object.freeze({
      async getToken(requestValue: unknown) {
        try {
          if (vercelExchangeStarted) throw unavailable();
          vercelExchangeStarted = true;
          requireNotAborted(context.signal);
          const request = exactDataRecord(requestValue, [
            "team",
            "project",
            "audience",
          ]);
          if (
            request.team !== VERCEL_TEAM_SLUG ||
            request.project !== VERCEL_PROJECT_NAME ||
            request.audience !== WIF_SUBJECT_TOKEN_AUDIENCE
          ) {
            throw unavailable();
          }
          const baseToken = requireJwt(getVercelOidcTokenSync());
          const response = await requestJson(
            httpsTransport,
            Object.freeze({
              method: "POST" as const,
              url: VERCEL_TOKEN_EXCHANGE_URL,
              headers: Object.freeze({
                accept: "application/json",
                "content-type": "application/json",
                "user-agent":
                  "careslink-ai-m1v-gcp-rest-bridge/2026-09-01",
              }),
              body: encodeJson({
                token: baseToken,
                aud: WIF_SUBJECT_TOKEN_AUDIENCE,
              }),
              redirect: "ERROR" as const,
              automaticRetries: 0 as const,
              timeoutMs: REQUEST_TIMEOUT_MS,
              maximumResponseBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
              signal: context.signal,
            }),
          );
          const object = allowedDataRecord(response, ["token", "expiry"]);
          const token = requireJwt(object.token);
          if (
            object.expiry !== undefined &&
            (!Number.isInteger(object.expiry) ||
              (object.expiry as number) <= Math.floor(Date.now() / 1_000))
          ) {
            throw unavailable();
          }
          requireNotAborted(context.signal);
          return token;
        } catch {
          throw unavailable();
        }
      },
    });

    const workloadIdentityClient = Object.freeze({
      async verifyAndExchange(
        requestValue: unknown,
        callContextValue: unknown,
      ) {
        try {
          if (workloadExchangeStarted || impersonatedCredential) {
            throw unavailable();
          }
          workloadExchangeStarted = true;
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          const request = validateWorkloadExchangeRequest(requestValue);
          const subjectToken = requireJwt(request.token);

          const stsBody = new URLSearchParams([
            ["audience", WIF_PROVIDER_RESOURCE],
            ["grant_type", TOKEN_EXCHANGE_GRANT_TYPE],
            ["requested_token_type", ACCESS_TOKEN_TYPE],
            ["scope", CLOUD_PLATFORM_SCOPE],
            ["subject_token", subjectToken],
            ["subject_token_type", SUBJECT_TOKEN_TYPE],
          ]);
          const stsResponse = await requestJson(
            httpsTransport,
            Object.freeze({
              method: "POST" as const,
              url: STS_TOKEN_EXCHANGE_URL,
              headers: Object.freeze({
                accept: "application/json",
                "content-type": "application/x-www-form-urlencoded",
              }),
              body: new TextEncoder().encode(stsBody.toString()),
              redirect: "ERROR" as const,
              automaticRetries: 0 as const,
              timeoutMs: REQUEST_TIMEOUT_MS,
              maximumResponseBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
              signal: callContext.signal,
            }),
          );
          const sts = allowedDataRecord(stsResponse, [
            "access_token",
            "issued_token_type",
            "token_type",
            "expires_in",
            "scope",
          ]);
          const federatedAccessToken = requireAccessToken(sts.access_token);
          if (
            sts.issued_token_type !== ACCESS_TOKEN_TYPE ||
            sts.token_type !== "Bearer" ||
            typeof sts.expires_in !== "number" ||
            !Number.isInteger(sts.expires_in) ||
            sts.expires_in <= 0 ||
            sts.expires_in > MAXIMUM_ACCESS_TOKEN_LIFETIME_SECONDS ||
            (sts.scope !== undefined && sts.scope !== CLOUD_PLATFORM_SCOPE)
          ) {
            throw unavailable();
          }

          const impersonationResponse = await requestJson(
            httpsTransport,
            Object.freeze({
              method: "POST" as const,
              url: RUNTIME_SERVICE_ACCOUNT_IMPERSONATION_URL,
              headers: Object.freeze({
                accept: "application/json",
                authorization: `Bearer ${federatedAccessToken}`,
                "content-type": "application/json",
              }),
              body: encodeJson({
                scope: [CLOUD_PLATFORM_SCOPE],
                lifetime: `${MAXIMUM_ACCESS_TOKEN_LIFETIME_SECONDS}s`,
              }),
              redirect: "ERROR" as const,
              automaticRetries: 0 as const,
              timeoutMs: REQUEST_TIMEOUT_MS,
              maximumResponseBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
              signal: callContext.signal,
            }),
          );
          const impersonation = exactDataRecord(impersonationResponse, [
            "accessToken",
            "expireTime",
          ]);
          const accessToken = requireAccessToken(impersonation.accessToken);
          const expiresAt = requireFutureTimestamp(impersonation.expireTime);
          impersonatedCredential = Object.freeze({ accessToken, expiresAt });
          requireNotAborted(callContext.signal);
          return Object.freeze({
            status: "GCP_WIF_TOKEN_VERIFIED_AND_IMPERSONATED" as const,
            principal: RUNTIME_SERVICE_ACCOUNT,
            expiresAt,
            rawAccessTokenMaterialPresent: false as const,
          });
        } catch {
          throw unavailable();
        }
      },
    });

    const kmsClient = Object.freeze({
      async macSign(requestValue: unknown, callContextValue: unknown) {
        try {
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          const credential = requireCredential(impersonatedCredential);
          const request = exactDataRecord(requestValue, [
            "name",
            "data",
            "dataCrc32c",
          ]);
          const name = requireKmsKeyVersion(
            request.name,
            KMS_MAC_SIGN_KEY_VERSION_SET,
          );
          const data = requireBytes(request.data, REQUEST_BODY_MAXIMUM_BYTES);
          const dataCrc32c = requireMatchingCrc32c(
            request.dataCrc32c,
            data,
          );
          const response = await authorizedJsonRequest(
            httpsTransport,
            credential,
            callContext,
            Object.freeze({
              method: "POST" as const,
              url: `${KMS_ORIGIN}/v1/${name}:macSign`,
              body: encodeJson({
                data: encodeBase64(data),
                dataCrc32c: String(dataCrc32c),
              }),
              maximumResponseBytes: KMS_RESPONSE_MAXIMUM_BYTES,
            }),
          );
          const object = exactDataRecord(response, [
            "name",
            "mac",
            "macCrc32c",
            "verifiedDataCrc32c",
            "protectionLevel",
          ]);
          const mac = decodeBase64(
            object.mac,
            HMAC_SHA256_MAC_BYTES,
            HMAC_SHA256_MAC_BYTES,
          );
          const macCrc32c = requireMatchingCrc32c(
            object.macCrc32c,
            mac,
          );
          if (
            object.name !== name ||
            object.verifiedDataCrc32c !== true ||
            object.protectionLevel !== "SOFTWARE"
          ) {
            throw unavailable();
          }
          requireNotAborted(callContext.signal);
          return Object.freeze([
            Object.freeze({
              name,
              mac,
              macCrc32c,
              verifiedDataCrc32c: true as const,
              protectionLevel: "SOFTWARE" as const,
            }),
          ]);
        } catch {
          throw unavailable();
        }
      },

      async macVerify(requestValue: unknown, callContextValue: unknown) {
        try {
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          const credential = requireCredential(impersonatedCredential);
          const request = exactDataRecord(requestValue, [
            "name",
            "data",
            "dataCrc32c",
            "mac",
            "macCrc32c",
          ]);
          const name = requireKmsKeyVersion(
            request.name,
            KMS_MAC_VERIFY_KEY_VERSION_SET,
          );
          const data = requireBytes(request.data, REQUEST_BODY_MAXIMUM_BYTES);
          const mac = requireExactBytes(
            request.mac,
            HMAC_SHA256_MAC_BYTES,
          );
          const dataCrc32c = requireMatchingCrc32c(
            request.dataCrc32c,
            data,
          );
          const macCrc32c = requireMatchingCrc32c(
            request.macCrc32c,
            mac,
          );
          const response = await authorizedJsonRequest(
            httpsTransport,
            credential,
            callContext,
            Object.freeze({
              method: "POST" as const,
              url: `${KMS_ORIGIN}/v1/${name}:macVerify`,
              body: encodeJson({
                data: encodeBase64(data),
                dataCrc32c: String(dataCrc32c),
                mac: encodeBase64(mac),
                macCrc32c: String(macCrc32c),
              }),
              maximumResponseBytes: KMS_RESPONSE_MAXIMUM_BYTES,
            }),
          );
          const object = exactDataRecord(response, [
            "name",
            "success",
            "verifiedDataCrc32c",
            "verifiedMacCrc32c",
            "verifiedSuccessIntegrity",
            "protectionLevel",
          ]);
          if (
            object.name !== name ||
            typeof object.success !== "boolean" ||
            object.verifiedDataCrc32c !== true ||
            object.verifiedMacCrc32c !== true ||
            object.verifiedSuccessIntegrity !== true ||
            object.protectionLevel !== "SOFTWARE"
          ) {
            throw unavailable();
          }
          requireNotAborted(callContext.signal);
          return Object.freeze([
            Object.freeze({
              name,
              success: object.success,
              verifiedDataCrc32c: true as const,
              verifiedMacCrc32c: true as const,
              verifiedSuccessIntegrity: true as const,
              protectionLevel: "SOFTWARE" as const,
            }),
          ]);
        } catch {
          throw unavailable();
        }
      },
    });

    const secretManagerClient = Object.freeze({
      async accessSecretVersion(
        requestValue: unknown,
        callContextValue: unknown,
      ) {
        try {
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          const credential = requireCredential(impersonatedCredential);
          const request = exactDataRecord(requestValue, ["name"]);
          const name = requireSecretVersion(request.name);
          const response = await authorizedJsonRequest(
            httpsTransport,
            credential,
            callContext,
            Object.freeze({
              method: "GET" as const,
              url: `${SECRET_MANAGER_ORIGIN}/v1/${name}:access`,
              body: new Uint8Array(),
              maximumResponseBytes: SECRET_RESPONSE_MAXIMUM_BYTES,
            }),
          );
          const object = exactDataRecord(response, ["name", "payload"]);
          const payload = exactDataRecord(object.payload, [
            "data",
            "dataCrc32c",
          ]);
          const data = decodeBase64(payload.data, MAXIMUM_SECRET_BYTES);
          const dataCrc32c = requireMatchingCrc32c(
            payload.dataCrc32c,
            data,
          );
          if (object.name !== name) throw unavailable();
          requireNotAborted(callContext.signal);
          return Object.freeze([
            Object.freeze({
              name,
              payload: Object.freeze({ data, dataCrc32c }),
            }),
          ]);
        } catch {
          throw unavailable();
        }
      },
    });

    return Object.freeze({
      workloadIdentityClient,
      kmsClient,
      secretManagerClient,
      vercelOidcTokenSource,
    });
  } catch {
    throw unavailable();
  }
}

type CallContext = Readonly<{ signal: AbortSignal }>;
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
type HttpsResponse = Readonly<{
  status: number;
  contentType: string;
  responseUrl: string;
  redirected: false;
  body: Uint8Array;
}>;
type HttpsTransport = Readonly<{
  request(request: HttpsRequest): PromiseLike<unknown>;
}>;
type GcpRestBridgeBundle = Readonly<{
  workloadIdentityClient: Readonly<{
    verifyAndExchange(
      request: Readonly<Record<string, unknown>>,
      context: CallContext,
    ): PromiseLike<unknown>;
  }>;
  kmsClient: Readonly<{
    macSign(
      request: Readonly<Record<string, unknown>>,
      context: CallContext,
    ): PromiseLike<unknown>;
    macVerify(
      request: Readonly<Record<string, unknown>>,
      context: CallContext,
    ): PromiseLike<unknown>;
  }>;
  secretManagerClient: Readonly<{
    accessSecretVersion(
      request: Readonly<{ name: string }>,
      context: CallContext,
    ): PromiseLike<unknown>;
  }>;
  vercelOidcTokenSource: Readonly<{
    getToken(request: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
  }>;
}>;

const NODE_HTTPS_TRANSPORT: HttpsTransport = Object.freeze({
  request: performNodeHttpsRequest,
});

async function performNodeHttpsRequest(
  request: HttpsRequest,
): Promise<HttpsResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, response?: HttpsResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) reject(error);
      else if (response) resolve(response);
      else reject(unavailable());
    };
    const clientRequest = nodeHttpsRequest(
      new URL(request.url),
      {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
        timeout: request.timeoutMs,
      },
      (response) => {
        const chunks: Uint8Array[] = [];
        let byteLength = 0;
        response.on("data", (chunk: Buffer | string) => {
          const bytes =
            typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
          byteLength += bytes.byteLength;
          if (byteLength > request.maximumResponseBytes) {
            response.destroy(new Error("Response limit exceeded"));
            return;
          }
          chunks.push(bytes);
        });
        response.once("aborted", () =>
          finish(new Error("Response aborted")),
        );
        response.once("error", (error) => finish(error));
        response.once("end", () => {
          const contentType = response.headers["content-type"];
          finish(undefined, {
            status: response.statusCode ?? 0,
            contentType:
              typeof contentType === "string" ? contentType : "",
            responseUrl: request.url,
            redirected: false,
            body: Uint8Array.from(Buffer.concat(chunks, byteLength)),
          });
        });
      },
    );
    const deadline = setTimeout(
      () => clientRequest.destroy(new Error("Request deadline exceeded")),
      request.timeoutMs,
    );
    deadline.unref?.();
    clientRequest.once("timeout", () =>
      clientRequest.destroy(new Error("Request timeout")),
    );
    clientRequest.once("error", (error) => finish(error));
    if (request.body.byteLength > 0) {
      clientRequest.write(Buffer.from(request.body));
    }
    clientRequest.end();
  });
}

function validateHttpsTransport(value: unknown): HttpsTransport {
  const object = exactDataRecord(value, ["request"]);
  if (
    !Object.isFrozen(object) ||
    typeof object.request !== "function" ||
    nodeTypes.isProxy(object.request)
  ) {
    throw unavailable();
  }
  return object as HttpsTransport;
}

async function requestJson(
  transport: HttpsTransport,
  request: HttpsRequest,
): Promise<Record<string, unknown>> {
  requireNotAborted(request.signal);
  if (
    request.timeoutMs !== REQUEST_TIMEOUT_MS ||
    request.automaticRetries !== 0 ||
    request.redirect !== "ERROR" ||
    request.body.byteLength > REQUEST_BODY_MAXIMUM_BYTES
  ) {
    throw unavailable();
  }
  const response = exactDataRecord(await transport.request(request), [
    "status",
    "contentType",
    "responseUrl",
    "redirected",
    "body",
  ]);
  requireNotAborted(request.signal);
  if (
    response.status !== 200 ||
    response.responseUrl !== request.url ||
    response.redirected !== false ||
    typeof response.contentType !== "string" ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      response.contentType,
    )
  ) {
    throw unavailable();
  }
  const body = requireBytes(
    response.body,
    request.maximumResponseBytes,
    false,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw unavailable();
  }
  return requirePlainDataRecord(parsed);
}

async function authorizedJsonRequest(
  transport: HttpsTransport,
  credential: Readonly<{ accessToken: string; expiresAt: string }>,
  context: CallContext,
  request: Readonly<{
    method: "GET" | "POST";
    url: string;
    body: Uint8Array;
    maximumResponseBytes: number;
  }>,
) {
  if (Date.parse(credential.expiresAt) <= Date.now()) throw unavailable();
  return requestJson(
    transport,
    Object.freeze({
      method: request.method,
      url: request.url,
      headers: Object.freeze({
        accept: "application/json",
        authorization: `Bearer ${credential.accessToken}`,
        ...(request.method === "POST"
          ? { "content-type": "application/json" }
          : {}),
      }),
      body: request.body,
      redirect: "ERROR" as const,
      automaticRetries: 0 as const,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maximumResponseBytes: request.maximumResponseBytes,
      signal: context.signal,
    }),
  );
}

function validateWorkloadExchangeRequest(value: unknown) {
  const object = exactDataRecord(value, [
    "token",
    "audience",
    "subjectTokenType",
    "serviceAccountImpersonationUrl",
    "expectedIssuer",
    "expectedAudience",
    "expectedSubject",
    "expectedOwnerId",
    "expectedProjectId",
    "expectedEnvironment",
  ]);
  if (
    object.audience !== WIF_PROVIDER_RESOURCE ||
    object.subjectTokenType !== SUBJECT_TOKEN_TYPE ||
    object.serviceAccountImpersonationUrl !==
      RUNTIME_SERVICE_ACCOUNT_IMPERSONATION_URL ||
    object.expectedIssuer !==
      `https://oidc.vercel.com/${VERCEL_TEAM_SLUG}` ||
    object.expectedAudience !== WIF_SUBJECT_TOKEN_AUDIENCE ||
    object.expectedSubject !==
      `owner:${VERCEL_TEAM_SLUG}:project:${VERCEL_PROJECT_NAME}:environment:preview` ||
    object.expectedOwnerId !== "team_cFWfAk6zAa0b7X5bc1ONT4SA" ||
    object.expectedProjectId !== "prj_AtdTukVr39wrGH9PYgKusfku2gvS" ||
    object.expectedEnvironment !== "preview"
  ) {
    throw unavailable();
  }
  return object;
}

function validateContext(value: unknown): CallContext {
  const object = exactDataRecord(value, ["signal"]);
  if (
    nodeTypes.isProxy(object.signal) ||
    !(object.signal instanceof AbortSignal)
  ) {
    throw unavailable();
  }
  requireNotAborted(object.signal);
  return Object.freeze({ signal: object.signal });
}

function requireSameContext(value: unknown, signal: AbortSignal) {
  const context = validateContext(value);
  if (context.signal !== signal) throw unavailable();
  return context;
}

function requireCredential(
  value: Readonly<{ accessToken: string; expiresAt: string }> | undefined,
) {
  if (!value || Date.parse(value.expiresAt) <= Date.now()) throw unavailable();
  return value;
}

function requireJwt(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    Buffer.byteLength(value, "utf8") > MAXIMUM_TOKEN_BYTES ||
    !JWT_PATTERN.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireAccessToken(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    Buffer.byteLength(value, "utf8") > MAXIMUM_TOKEN_BYTES ||
    /[\r\n\0]/.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireFutureTimestamp(value: unknown) {
  const match =
    typeof value === "string"
      ? GOOGLE_TIMESTAMP_PATTERN.exec(value)
      : null;
  const milliseconds = match ? Date.parse(value as string) : NaN;
  const normalized = match
    ? `${match[1]}.${(match[2] ?? "000").slice(0, 3)}Z`
    : "";
  if (
    !match ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== normalized ||
    milliseconds <= Date.now() ||
    milliseconds >
      Date.now() + (MAXIMUM_ACCESS_TOKEN_LIFETIME_SECONDS + 60) * 1_000
  ) {
    throw unavailable();
  }
  return normalized;
}

function requireKmsKeyVersion(
  value: unknown,
  allowedVersions: ReadonlySet<string>,
) {
  if (typeof value !== "string" || !allowedVersions.has(value)) {
    throw unavailable();
  }
  return value;
}

function requireSecretVersion(value: unknown) {
  if (
    typeof value !== "string" ||
    !SECRET_VERSION_SET.has(value) ||
    value.includes("/versions/latest")
  ) {
    throw unavailable();
  }
  return value;
}

function requireMatchingCrc32c(value: unknown, data: Uint8Array) {
  const normalized = normalizeCrc32c(value);
  if (normalized !== crc32c.calculate(data)) throw unavailable();
  return normalized;
}

function normalizeCrc32c(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffff_ffff
  ) {
    return value;
  }
  if (typeof value === "string" && /^(0|[1-9]\d{0,9})$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed <= 0xffff_ffff) return parsed;
  }
  throw unavailable();
}

function requireBytes(
  value: unknown,
  maximumBytes: number,
  allowEmpty = false,
) {
  if (
    nodeTypes.isProxy(value) ||
    !(value instanceof Uint8Array) ||
    (!allowEmpty && value.byteLength === 0) ||
    value.byteLength > maximumBytes
  ) {
    throw unavailable();
  }
  return Uint8Array.from(value);
}

function requireExactBytes(value: unknown, exactBytes: number) {
  const bytes = requireBytes(value, exactBytes);
  if (bytes.byteLength !== exactBytes) throw unavailable();
  return bytes;
}

function encodeJson(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > REQUEST_BODY_MAXIMUM_BYTES) throw unavailable();
  return bytes;
}

function encodeBase64(value: Uint8Array) {
  return Buffer.from(value).toString("base64");
}

function decodeBase64(
  value: unknown,
  maximumBytes: number,
  minimumBytes = 1,
) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(maximumBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw unavailable();
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.byteLength < minimumBytes ||
    decoded.byteLength > maximumBytes ||
    decoded.toString("base64") !== value
  ) {
    throw unavailable();
  }
  return Uint8Array.from(decoded);
}

function allowedDataRecord(value: unknown, allowedKeys: readonly string[]) {
  const object = requirePlainDataRecord(value);
  const keys = Object.getOwnPropertyNames(object);
  if (
    !keys.includes(allowedKeys[0] as string) ||
    keys.some((key) => !allowedKeys.includes(key))
  ) {
    throw unavailable();
  }
  return object;
}

function exactDataRecord(value: unknown, keys: readonly string[]) {
  const object = requirePlainDataRecord(value);
  const actualKeys = Object.getOwnPropertyNames(object);
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !actualKeys.includes(key))
  ) {
    throw unavailable();
  }
  return object;
}

function requirePlainDataRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    throw unavailable();
  }
  return value as Record<string, unknown>;
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

function kmsVersion(key: string) {
  return `projects/${PROJECT_ID}/locations/${LOCATION}/keyRings/careslink-preview-m1u/cryptoKeys/${key}/cryptoKeyVersions/1`;
}

function secretVersion(secret: string) {
  return `projects/${PROJECT_ID}/locations/${LOCATION}/secrets/${secret}/versions/1`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (
    typeof value === "object" &&
    !nodeTypes.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw unavailable();
}

function unavailable() {
  return Object.freeze({
    code: "PRODUCT_API_DISABLED" as const,
    message:
      "Communication Note preview GCP REST bridge is unavailable" as const,
  });
}
