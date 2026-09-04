import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { getVercelOidcTokenSync } from "@vercel/oidc";
import { decodeJwt, decodeProtectedHeader } from "jose";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import type {
  CaresLinkV1NoteGenerationGcsAuthorizedHttpsPort,
  CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest,
  CaresLinkV1NoteGenerationGcsAuthorizedOperation,
  CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer,
  CaresLinkV1NoteGenerationGcsAuthorizedOperationPort,
  CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest,
} from "./note-generation-encrypted-payload-gcs-private-object-store.server";
import {
  createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d,
} from "./note-generation-google-cloud-gcs-https-transport-m2d.server";
import {
  createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
  type CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b,
  type CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
} from "./note-generation-google-cloud-provider-https-transport-m2b.server";

const PROJECT_ID = "careslink-m1u-security" as const;
const PROJECT_NUMBER = "288554824534" as const;
const LOCATION = "australia-southeast1" as const;
const VERCEL_TEAM_SLUG = "millionlunas-projects" as const;
const VERCEL_TEAM_ID = "team_cFWfAk6zAa0b7X5bc1ONT4SA" as const;
const VERCEL_PROJECT_NAME = "careslink-ai" as const;
const VERCEL_PROJECT_ID = "prj_AtdTukVr39wrGH9PYgKusfku2gvS" as const;
const VERCEL_ISSUER =
  `https://oidc.vercel.com/${VERCEL_TEAM_SLUG}` as const;
const VERCEL_DEFAULT_AUDIENCE =
  `https://vercel.com/${VERCEL_TEAM_SLUG}` as const;
const VERCEL_SUBJECT =
  `owner:${VERCEL_TEAM_SLUG}:project:${VERCEL_PROJECT_NAME}:environment:preview` as const;
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
const GCS_ORIGIN = "https://storage.googleapis.com" as const;
const GCS_AUDIENCE = "https://storage.googleapis.com/" as const;
const GCS_SCOPE =
  "https://www.googleapis.com/auth/devstorage.read_write" as const;
const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform" as const;
const SUBJECT_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:jwt" as const;
const TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange" as const;
const ACCESS_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:access_token" as const;
const AUTHORITY_OPERATION_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_OPERATION" as const;
const CREDENTIAL_PERMISSION_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_GCS_CREDENTIAL_PERMISSIONS" as const;
const PREPARATION_CAPABILITY =
  "TEST_ONLY_M2D_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY" as const;
const REQUEST_TIMEOUT_MS = 5_000 as const;
const OPERATION_TIMEOUT_MS = 30_000 as const;
const SCHEDULING_MARGIN_MS = 5_000 as const;
const MINIMUM_OPERATION_CREDENTIAL_REMAINING_MS =
  OPERATION_TIMEOUT_MS + SCHEDULING_MARGIN_MS;
const PREPARATION_TIMEOUT_MS = 30_000;
const REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS = 300;
const ACCESS_TOKEN_MAXIMUM_REMAINING_MS =
  (REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS + 60) * 1_000;
const BASE_OIDC_MAXIMUM_AGE_SECONDS = 95 * 60;
const BASE_OIDC_MAXIMUM_REMAINING_SECONDS = 125 * 60;
const CUSTOM_OIDC_MAXIMUM_AGE_SECONDS = 60;
const TOKEN_RESPONSE_MAXIMUM_BYTES = 16 * 1_024;
const PROVIDER_REQUEST_BODY_MAXIMUM_BYTES = 96 * 1_024;
const GCS_REQUEST_BODY_MAXIMUM_BYTES = 264 * 1_024;
const GCS_RESPONSE_MAXIMUM_BYTES = 256 * 1_024;
const ACCESS_TOKEN_MAXIMUM_BYTES = 16 * 1_024;
const REQUIRED_PERMISSIONS = Object.freeze([
  "storage.objects.create",
  "storage.objects.delete",
  "storage.objects.get",
] as const);
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]{16,16384}={0,2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BUCKET_PATTERN =
  /^(?=.{3,63}$)[a-z0-9](?:[a-z0-9._-]*[a-z0-9])$/;
const OBJECT_PREFIX_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]{0,62})(?:\/[a-z0-9](?:[a-z0-9._-]{0,62}))*$/;
const GOOGLE_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}|\d{6}|\d{9}))?Z$/;

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_VERSION =
  "google-cloud-gcs-private-authority.communication-note.2026-09-04.m2d.v1" as const;
export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_READY =
  false as const;

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_SOURCE_POLICY =
  deepFreeze({
    version:
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_VERSION,
    status: "SOURCE_GCS_PRIVATE_AUTHORITY_NOT_COMPOSED",
    ready: false,
    sourceOnly: true,
    serverOnly: true,
    formalSingletonEnabled: false,
    formalFactoryEnabled: false,
    testOnlyCapabilityRequired: true,
    productionAllowed: false,
    exactProjectId: PROJECT_ID,
    exactProjectNumber: PROJECT_NUMBER,
    exactLocation: LOCATION,
    exactRuntimeServiceAccount: RUNTIME_SERVICE_ACCOUNT,
    exactVercelIssuer: VERCEL_ISSUER,
    exactVercelSubject: VERCEL_SUBJECT,
    exactWifProviderResource: WIF_PROVIDER_RESOURCE,
    exactGcsAudience: GCS_AUDIENCE,
    exactGcsScope: GCS_SCOPE,
    requestedAccessTokenLifetimeSeconds:
      REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS,
    operationCredentialMinimumRemainingMs:
      MINIMUM_OPERATION_CREDENTIAL_REMAINING_MS,
    credentialAcquiredBeforeSynchronousHandoff: true,
    independentFromKmsOperationCredential: true,
    authorityHandoffSynchronous: true,
    authorityHandoffDirectReturn: true,
    authorityOpaqueOperationInspected: false,
    authorityHandleOneUse: true,
    authorityPortOneUse: true,
    rawCredentialMaterialReturned: false,
    rawAuthorizationHeaderReturned: false,
    applicationDefaultCredentialsAllowed: false,
    serviceAccountJsonAllowed: false,
    genericEndpointAllowed: false,
    redirectsAllowed: false,
    automaticRetries: 0,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    operationTimeoutMs: OPERATION_TIMEOUT_MS,
    cloudResourcesCreated: false,
    liveEvidencePresent: false,
    deploymentApproved: false,
    activationApproved: false,
  } as const);

export type CaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d =
  Readonly<{
    version: typeof CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_VERSION;
    status: "PREPARED_EXACT_GCS_PRIVATE_AUTHORITY_NOT_ACTIVATED";
    projectId: typeof PROJECT_ID;
    bucketLocation: typeof LOCATION;
    runtimePrincipal: typeof RUNTIME_SERVICE_ACCOUNT;
    bucket: string;
    objectPrefix: string;
    requiredPermissionSetHash: string;
    issuedAt: string;
    expiresAt: string;
    workloadIdentityReferenceSha256: string;
    runtimePrincipalReferenceSha256: string;
    rawCredentialMaterialPresent: false;
    rawAuthorizationHeaderPresent: false;
  }>;

/** Default-off: importing this module installs no credential authority. */
export const CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D =
  undefined as CaresLinkV1NoteGenerationGcsAuthorizedOperationPort | undefined;

type GcsHttpsTransport = ReturnType<
  typeof createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d
>;

type AccessToken = Readonly<{
  accessToken: string;
  issuedAt: string;
  expiresAt: string;
}>;

type WorkloadIdentityExchange = Readonly<{
  federatedAccessToken: string;
  validUntil: string;
  workloadIdentityReferenceSha256: string;
}>;

type CredentialState = Readonly<{
  expiresAt: string;
  canBeginOperation(): boolean;
  beginOperation(): boolean;
  use<T>(consumer: (accessToken: string) => T): T;
  discard(): void;
}>;

type PreparedAuthorityInternals = Readonly<{
  credentialState: CredentialState;
  gcsTransport: GcsHttpsTransport;
  rootAbortSignal: AbortSignal;
  bucket: string;
  objectPrefix: string;
  requiredPermissionSetHash: string;
}>;

type JsonResponse = Readonly<{
  value: Record<string, unknown>;
  bodySha256: string;
}>;

type Deadline = Readonly<{
  signal: AbortSignal;
  close(): void;
}>;

type ParsedGcsRequest = Readonly<{
  method: "GET" | "POST";
  url: string;
  accept: "application/json";
  contentType: string | undefined;
  contentLength: string | undefined;
  body: Uint8Array;
  maximumResponseBytes: number;
  signal: AbortSignal;
}>;

const PREPARED_AUTHORITIES = new WeakMap<
  object,
  PreparedAuthorityInternals
>();

export async function prepareCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
  _value: unknown,
): Promise<never> {
  void _value;
  throw unavailable();
}

/**
 * Source-only seam. It privately acquires one independent, GCS-scoped service
 * account credential before returning an opaque one-use authority handle.
 */
export async function prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
  value: unknown,
): Promise<CaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d> {
  let deadline: Deadline | undefined;
  let exchange: WorkloadIdentityExchange | undefined;
  let credential: AccessToken | undefined;
  let credentialState: CredentialState | undefined;
  try {
    const options = parsePrepareOptions(value);
    deadline = createDeadline(
      [options.rootAbortSignal],
      PREPARATION_TIMEOUT_MS,
    );
    const providerTransport =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
    exchange = await exchangeVercelWorkloadIdentity(
      providerTransport,
      deadline.signal,
    );
    credential = await impersonateRuntimeServiceAccountForGcs(
      providerTransport,
      deadline.signal,
      exchange.federatedAccessToken,
      exchange.validUntil,
    );
    requireNotAborted(deadline.signal);
    const gcsTransport =
      createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d(
        Object.freeze({
          bucket: options.bucket,
          objectPrefix: options.objectPrefix,
        }),
      );
    const requiredPermissionSetHash = createRequiredPermissionSetHash(
      options.bucket,
    );
    credentialState = createCredentialState(
      credential,
      options.rootAbortSignal,
    );
    const authority = Object.freeze({
      version:
        CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_VERSION,
      status:
        "PREPARED_EXACT_GCS_PRIVATE_AUTHORITY_NOT_ACTIVATED" as const,
      projectId: PROJECT_ID,
      bucketLocation: LOCATION,
      runtimePrincipal: RUNTIME_SERVICE_ACCOUNT,
      bucket: options.bucket,
      objectPrefix: options.objectPrefix,
      requiredPermissionSetHash,
      issuedAt: credential.issuedAt,
      expiresAt: credential.expiresAt,
      workloadIdentityReferenceSha256:
        exchange.workloadIdentityReferenceSha256,
      runtimePrincipalReferenceSha256: canonicalSha256({
        domain:
          "careslink.communication-note.google-cloud-gcs-runtime-principal.m2d.v1",
        principal: RUNTIME_SERVICE_ACCOUNT,
      }),
      rawCredentialMaterialPresent: false as const,
      rawAuthorizationHeaderPresent: false as const,
    });
    PREPARED_AUTHORITIES.set(
      authority,
      Object.freeze({
        credentialState,
        gcsTransport,
        rootAbortSignal: options.rootAbortSignal,
        bucket: options.bucket,
        objectPrefix: options.objectPrefix,
        requiredPermissionSetHash,
      }),
    );
    credentialState = undefined;
    credential = undefined;
    exchange = undefined;
    return authority;
  } catch {
    throw unavailable();
  } finally {
    deadline?.close();
    credentialState?.discard();
    credential = undefined;
    exchange = undefined;
  }
}

/**
 * Consumes the exact prepared handle and returns the one-use synchronous port
 * accepted by the M2c private-object-store adapter.
 */
export function createCaresLinkV1NoteGenerationGoogleCloudGcsAuthorizedOperationPortM2d(
  value: unknown,
): CaresLinkV1NoteGenerationGcsAuthorizedOperationPort {
  let internals: PreparedAuthorityInternals | undefined;
  try {
    const options = exactFrozenDataRecord(value, [
      "providerAuthority",
      "rootAbortSignal",
    ]);
    const authority = requirePreparedAuthority(options.providerAuthority);
    internals = PREPARED_AUTHORITIES.get(authority);
    if (internals !== undefined) PREPARED_AUTHORITIES.delete(authority);
    if (
      internals === undefined ||
      options.rootAbortSignal !== internals.rootAbortSignal ||
      !isNativeAbortSignal(options.rootAbortSignal) ||
      options.rootAbortSignal.aborted ||
      !internals.credentialState.canBeginOperation()
    ) {
      throw unavailable();
    }
    return createOneUseAuthorizedOperationPort(internals);
  } catch {
    internals?.credentialState.discard();
    throw unavailable();
  }
}

export function discardCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
  value: unknown,
): void {
  try {
    const authority = requirePreparedAuthority(value);
    const internals = PREPARED_AUTHORITIES.get(authority);
    if (internals === undefined) throw unavailable();
    PREPARED_AUTHORITIES.delete(authority);
    internals.credentialState.discard();
  } catch {
    throw unavailable();
  }
}

function createOneUseAuthorizedOperationPort(
  internals: PreparedAuthorityInternals,
): CaresLinkV1NoteGenerationGcsAuthorizedOperationPort {
  let unused = true;
  const port = Object.freeze({
    consumeAuthorizedOperation(
      requestValue: CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest,
      consumer: CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer,
    ): CaresLinkV1NoteGenerationGcsAuthorizedOperation {
      if (!unused) throw unavailable();
      unused = false;
      let operationSignal: AbortSignal | undefined;
      let operationDeadline: Deadline | undefined;
      let close: (() => void) | undefined;
      try {
        const request = parseAuthorityRequest(requestValue, internals);
        operationSignal = request.signal;
        if (
          typeof consumer !== "function" ||
          nodeTypes.isProxy(consumer) ||
          !internals.credentialState.beginOperation()
        ) {
          throw unavailable();
        }
        operationDeadline = createDeadline(
          [internals.rootAbortSignal, operationSignal],
          OPERATION_TIMEOUT_MS,
        );
        const authorityOperationSignal = operationDeadline.signal;
        let active = true;
        close = () => {
          if (!active) return;
          active = false;
          authorityOperationSignal.removeEventListener("abort", close as () => void);
          operationDeadline?.close();
          internals.credentialState.discard();
        };
        authorityOperationSignal.addEventListener("abort", close, {
          once: true,
        });
        if (authorityOperationSignal.aborted) throw unavailable();

        const authorizedRequest: CaresLinkV1NoteGenerationGcsAuthorizedHttpsPort["request"] =
          (requestInput) =>
            performAuthorizedGcsRequest(
              requestInput,
              internals,
              authorityOperationSignal,
              () => active,
            );
        const session = Object.freeze({ request: authorizedRequest });
        return consumer(session);
      } catch {
        close?.();
        internals.credentialState.discard();
        throw unavailable();
      }
    },
  });
  return port;
}

function parsePrepareOptions(value: unknown) {
  const options = exactFrozenDataRecord(value, [
    "capability",
    "bucket",
    "objectPrefix",
    "rootAbortSignal",
  ]);
  if (
    options.capability !== PREPARATION_CAPABILITY ||
    !isNativeAbortSignal(options.rootAbortSignal) ||
    options.rootAbortSignal.aborted
  ) {
    throw unavailable();
  }
  return Object.freeze({
    bucket: requireBucket(options.bucket),
    objectPrefix: requireObjectPrefix(options.objectPrefix),
    rootAbortSignal: options.rootAbortSignal,
  });
}

function parseAuthorityRequest(
  value: unknown,
  internals: PreparedAuthorityInternals,
): CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest {
  const request = exactFrozenDataRecord(value, [
    "purpose",
    "projectId",
    "bucketLocation",
    "runtimePrincipal",
    "audience",
    "scope",
    "bucket",
    "requiredPermissionSetHash",
    "operationTimeoutMs",
    "requestTimeoutMs",
    "signal",
  ]);
  if (
    request.purpose !== AUTHORITY_OPERATION_PURPOSE ||
    request.projectId !== PROJECT_ID ||
    request.bucketLocation !== LOCATION ||
    request.runtimePrincipal !== RUNTIME_SERVICE_ACCOUNT ||
    request.audience !== GCS_AUDIENCE ||
    request.scope !== GCS_SCOPE ||
    request.bucket !== internals.bucket ||
    request.requiredPermissionSetHash !== internals.requiredPermissionSetHash ||
    request.operationTimeoutMs !== OPERATION_TIMEOUT_MS ||
    request.requestTimeoutMs !== REQUEST_TIMEOUT_MS ||
    !isNativeAbortSignal(request.signal) ||
    request.signal.aborted ||
    internals.rootAbortSignal.aborted
  ) {
    throw unavailable();
  }
  return request as CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest;
}

async function performAuthorizedGcsRequest(
  value: CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest,
  internals: PreparedAuthorityInternals,
  operationSignal: AbortSignal,
  isActive: () => boolean,
): Promise<unknown> {
  let request: ParsedGcsRequest | undefined;
  let deadline: Deadline | undefined;
  let authorization: string | undefined;
  let responseValue: unknown;
  try {
    if (!isActive() || operationSignal.aborted) throw unavailable();
    request = parseGcsRequest(value);
    deadline = createDeadline(
      [
        internals.rootAbortSignal,
        operationSignal,
        request.signal,
      ],
      REQUEST_TIMEOUT_MS,
    );
    authorization = internals.credentialState.use(
      (accessToken) => `Bearer ${accessToken}`,
    );
    responseValue = await settleBeforeAbort(
      internals.gcsTransport.request(
        Object.freeze({
          method: request.method,
          url: request.url,
          headers: Object.freeze({
            accept: request.accept,
            authorization,
            "accept-encoding": "identity",
            ...(request.contentType === undefined
              ? {}
              : {
                  "content-type": request.contentType,
                  "content-length": request.contentLength as string,
                }),
          }),
          body: request.body,
          redirect: "ERROR" as const,
          automaticRetries: 0 as const,
          timeoutMs: REQUEST_TIMEOUT_MS,
          maximumResponseBytes: request.maximumResponseBytes,
          signal: deadline.signal,
        }),
      ),
      deadline.signal,
      scrubResponseBodyBestEffort,
    );
    requireNotAborted(deadline.signal);
    const response = responseValue;
    responseValue = undefined;
    return response;
  } catch {
    scrubResponseBodyBestEffort(responseValue);
    throw unavailable();
  } finally {
    deadline?.close();
    request?.body.fill(0);
    authorization = undefined;
  }
}

function parseGcsRequest(value: unknown): ParsedGcsRequest {
  let body: Uint8Array | undefined;
  try {
    const record = requirePlainDataRecord(value);
    if (!Object.isFrozen(record)) throw unavailable();
    const hasContentType = Object.hasOwn(record, "contentType");
    const hasContentLength = Object.hasOwn(record, "contentLength");
    if (hasContentType !== hasContentLength) throw unavailable();
    const expectedKeys = [
      "method",
      "url",
      "accept",
      ...(hasContentType ? ["contentType", "contentLength"] : []),
      "body",
      "redirect",
      "automaticRetries",
      "timeoutMs",
      "maximumResponseBytes",
      "signal",
    ];
    const request = exactDataRecord(record, expectedKeys);
    if (
      (request.method !== "GET" && request.method !== "POST") ||
      typeof request.url !== "string" ||
      request.accept !== "application/json" ||
      request.redirect !== "ERROR" ||
      request.automaticRetries !== 0 ||
      request.timeoutMs !== REQUEST_TIMEOUT_MS ||
      !Number.isInteger(request.maximumResponseBytes) ||
      (request.maximumResponseBytes as number) < 1 ||
      (request.maximumResponseBytes as number) > GCS_RESPONSE_MAXIMUM_BYTES ||
      !isNativeAbortSignal(request.signal) ||
      request.signal.aborted
    ) {
      throw unavailable();
    }
    const url = new URL(request.url);
    if (
      url.protocol !== "https:" ||
      url.origin !== GCS_ORIGIN ||
      url.href !== request.url ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      url.port !== ""
    ) {
      throw unavailable();
    }
    body = requireBytes(request.body, GCS_REQUEST_BODY_MAXIMUM_BYTES, true);
    let contentType: string | undefined;
    let contentLength: string | undefined;
    if (hasContentType) {
      if (
        request.method !== "POST" ||
        typeof request.contentType !== "string" ||
        request.contentType.length === 0 ||
        request.contentType.length > 256 ||
        typeof request.contentLength !== "string" ||
        !/^[1-9][0-9]{0,15}$/.test(request.contentLength) ||
        request.contentLength !== String(body.byteLength) ||
        body.byteLength === 0
      ) {
        throw unavailable();
      }
      contentType = request.contentType;
      contentLength = request.contentLength;
    } else if (request.method !== "GET" || body.byteLength !== 0) {
      throw unavailable();
    }
    const parsed = Object.freeze({
      method: request.method as "GET" | "POST",
      url: request.url,
      accept: "application/json" as const,
      contentType,
      contentLength,
      body,
      maximumResponseBytes: request.maximumResponseBytes as number,
      signal: request.signal as AbortSignal,
    });
    body = undefined;
    return parsed;
  } catch {
    body?.fill(0);
    throw unavailable();
  }
}

async function exchangeVercelWorkloadIdentity(
  transport: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
  signal: AbortSignal,
): Promise<WorkloadIdentityExchange> {
  let baseToken: string | undefined;
  let customToken: string | undefined;
  let federatedAccessToken: string | undefined;
  try {
    requireNotAborted(signal);
    baseToken = requireJwt(getVercelOidcTokenSync());
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const baseClaims = parseExpectedVercelJwtClaims(
      baseToken,
      VERCEL_DEFAULT_AUDIENCE,
      nowSeconds,
      BASE_OIDC_MAXIMUM_AGE_SECONDS,
      BASE_OIDC_MAXIMUM_REMAINING_SECONDS,
    );
    const exchangeJti = randomUUID();
    const customResponse = await requestProviderJson(
      transport,
      createProviderRequest({
        method: "POST",
        url: VERCEL_TOKEN_EXCHANGE_URL,
        headers: Object.freeze({
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "careslink-ai-m2d-gcs-private-authority/2026-09-04",
        }),
        body: encodeJson({
          token: baseToken,
          aud: WIF_SUBJECT_TOKEN_AUDIENCE,
          jti: exchangeJti,
        }),
        maximumResponseBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
        signal,
      }),
    );
    const custom = allowedDataRecord(
      customResponse.value,
      ["token", "expiry"],
      ["token"],
    );
    customToken = requireJwt(custom.token);
    const customClaims = parseExpectedVercelJwtClaims(
      customToken,
      WIF_SUBJECT_TOKEN_AUDIENCE,
      Math.floor(Date.now() / 1_000),
      CUSTOM_OIDC_MAXIMUM_AGE_SECONDS,
      BASE_OIDC_MAXIMUM_REMAINING_SECONDS,
    );
    const actor = exactDataRecord(customClaims.act, ["aud", "iat"]);
    if (
      customClaims.jti !== exchangeJti ||
      customClaims.exp !== baseClaims.exp ||
      customClaims.nbf !== baseClaims.nbf ||
      actor.aud !== VERCEL_DEFAULT_AUDIENCE ||
      actor.iat !== baseClaims.iat ||
      (Object.hasOwn(custom, "expiry") && custom.expiry !== customClaims.exp)
    ) {
      throw unavailable();
    }

    const stsBody = new TextEncoder().encode(
      new URLSearchParams([
        ["audience", WIF_PROVIDER_RESOURCE],
        ["grant_type", TOKEN_EXCHANGE_GRANT_TYPE],
        ["requested_token_type", ACCESS_TOKEN_TYPE],
        ["scope", CLOUD_PLATFORM_SCOPE],
        ["subject_token", customToken],
        ["subject_token_type", SUBJECT_TOKEN_TYPE],
      ]).toString(),
    );
    const stsResponse = await requestProviderJson(
      transport,
      createProviderRequest({
        method: "POST",
        url: STS_TOKEN_EXCHANGE_URL,
        headers: Object.freeze({
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        }),
        body: stsBody,
        maximumResponseBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
        signal,
      }),
    );
    const sts = allowedDataRecord(
      stsResponse.value,
      [
        "access_token",
        "issued_token_type",
        "token_type",
        "expires_in",
        "scope",
      ],
      ["access_token", "issued_token_type", "token_type", "expires_in"],
    );
    federatedAccessToken = requireAccessToken(sts.access_token);
    if (
      sts.issued_token_type !== ACCESS_TOKEN_TYPE ||
      sts.token_type !== "Bearer" ||
      typeof sts.expires_in !== "number" ||
      !Number.isSafeInteger(sts.expires_in) ||
      sts.expires_in < Math.ceil(
        MINIMUM_OPERATION_CREDENTIAL_REMAINING_MS / 1_000,
      ) ||
      sts.expires_in > 3_600 ||
      (Object.hasOwn(sts, "scope") && sts.scope !== CLOUD_PLATFORM_SCOPE)
    ) {
      throw unavailable();
    }
    const validUntil = new Date(
      Math.min(
        customClaims.exp * 1_000,
        Date.now() + sts.expires_in * 1_000,
      ),
    ).toISOString();
    if (
      Date.parse(validUntil) <=
      Date.now() + MINIMUM_OPERATION_CREDENTIAL_REMAINING_MS
    ) {
      throw unavailable();
    }
    requireNotAborted(signal);
    return Object.freeze({
      federatedAccessToken,
      validUntil,
      workloadIdentityReferenceSha256: canonicalSha256({
        domain:
          "careslink.communication-note.vercel-google-wif-exchange.m2d.v1",
        provider: WIF_PROVIDER_RESOURCE,
        issuer: VERCEL_ISSUER,
        subject: VERCEL_SUBJECT,
        customAudience: WIF_SUBJECT_TOKEN_AUDIENCE,
        customTokenJtiSha256: sha256(exchangeJti),
        customTokenResponseSha256: customResponse.bodySha256,
        stsResponseSha256: stsResponse.bodySha256,
      }),
    });
  } catch {
    throw unavailable();
  } finally {
    baseToken = undefined;
    customToken = undefined;
  }
}

async function impersonateRuntimeServiceAccountForGcs(
  transport: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
  signal: AbortSignal,
  federatedAccessToken: string,
  upstreamValidUntil: string,
): Promise<AccessToken> {
  try {
    requireNotAborted(signal);
    const issuedAt = new Date().toISOString();
    const response = await requestProviderJson(
      transport,
      createProviderRequest({
        method: "POST",
        url: RUNTIME_SERVICE_ACCOUNT_IMPERSONATION_URL,
        headers: Object.freeze({
          accept: "application/json",
          authorization: `Bearer ${requireAccessToken(federatedAccessToken)}`,
          "content-type": "application/json",
        }),
        body: encodeJson({
          scope: [GCS_SCOPE],
          lifetime: `${REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS}s`,
        }),
        maximumResponseBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
        signal,
      }),
    );
    const result = exactDataRecord(response.value, [
      "accessToken",
      "expireTime",
    ]);
    const accessToken = requireAccessToken(result.accessToken);
    const expiresAt = requireGoogleFutureTimestamp(result.expireTime);
    const receivedAtMs = Date.now();
    const remaining = Date.parse(expiresAt) - receivedAtMs;
    if (
      remaining <= MINIMUM_OPERATION_CREDENTIAL_REMAINING_MS ||
      remaining > ACCESS_TOKEN_MAXIMUM_REMAINING_MS ||
      Date.parse(expiresAt) > Date.parse(upstreamValidUntil) ||
      Date.parse(expiresAt) >
        receivedAtMs + REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS * 1_000
    ) {
      throw unavailable();
    }
    requireNotAborted(signal);
    return Object.freeze({ accessToken, issuedAt, expiresAt });
  } catch {
    throw unavailable();
  }
}

function createCredentialState(
  credentialValue: AccessToken,
  rootAbortSignal: AbortSignal,
): CredentialState {
  let credential: AccessToken | undefined = credentialValue;
  let open = true;
  let unusedCutoffTimer: ReturnType<typeof setTimeout> | undefined;
  const discard = () => {
    if (!open) return;
    open = false;
    credential = undefined;
    if (unusedCutoffTimer !== undefined) {
      clearTimeout(unusedCutoffTimer);
      unusedCutoffTimer = undefined;
    }
    rootAbortSignal.removeEventListener("abort", discard);
  };
  unusedCutoffTimer = setTimeout(
    discard,
    Math.max(
      0,
      Date.parse(credentialValue.expiresAt) -
        Date.now() -
        MINIMUM_OPERATION_CREDENTIAL_REMAINING_MS,
    ),
  );
  unusedCutoffTimer.unref?.();
  rootAbortSignal.addEventListener("abort", discard, { once: true });
  if (rootAbortSignal.aborted) discard();
  const canBeginOperation = () =>
    open &&
    credential !== undefined &&
    !rootAbortSignal.aborted &&
    Date.parse(credential.expiresAt) >
      Date.now() + MINIMUM_OPERATION_CREDENTIAL_REMAINING_MS;
  return Object.freeze({
    expiresAt: credentialValue.expiresAt,
    canBeginOperation,
    beginOperation() {
      if (!canBeginOperation()) return false;
      if (unusedCutoffTimer !== undefined) {
        clearTimeout(unusedCutoffTimer);
        unusedCutoffTimer = undefined;
      }
      return true;
    },
    use<T>(consumer: (accessToken: string) => T): T {
      if (
        !open ||
        credential === undefined ||
        rootAbortSignal.aborted ||
        Date.parse(credential.expiresAt) <= Date.now() + REQUEST_TIMEOUT_MS ||
        typeof consumer !== "function" ||
        nodeTypes.isProxy(consumer)
      ) {
        throw unavailable();
      }
      return consumer(credential.accessToken);
    },
    discard,
  });
}

function createProviderRequest(
  value: Omit<
    CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b,
    "redirect" | "automaticRetries" | "timeoutMs"
  >,
): CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b {
  if (
    nodeTypes.isProxy(value.body) ||
    !(value.body instanceof Uint8Array) ||
    value.body.byteLength === 0 ||
    value.body.byteLength > PROVIDER_REQUEST_BODY_MAXIMUM_BYTES
  ) {
    scrubBytesBestEffort(value.body);
    throw unavailable();
  }
  return Object.freeze({
    ...value,
    redirect: "ERROR" as const,
    automaticRetries: 0 as const,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
}

async function requestProviderJson(
  transport: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
  request: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b,
): Promise<JsonResponse> {
  let responseValue: unknown;
  let body: Uint8Array | undefined;
  try {
    requireNotAborted(request.signal);
    responseValue = await settleBeforeAbort(
      transport.request(request),
      request.signal,
      scrubResponseBodyBestEffort,
    );
    const response = exactDataRecord(responseValue, [
      "status",
      "contentType",
      "responseUrl",
      "redirected",
      "body",
    ]);
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
    body = requireBytes(response.body, request.maximumResponseBytes, false);
    const bodySha256 = sha256(body);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
    const parsed = requirePlainDataRecord(JSON.parse(decoded));
    requireNotAborted(request.signal);
    return Object.freeze({ value: parsed, bodySha256 });
  } catch {
    throw unavailable();
  } finally {
    scrubBytesBestEffort(request.body);
    scrubBytesBestEffort(body);
    scrubResponseBodyBestEffort(responseValue);
  }
}

function parseExpectedVercelJwtClaims(
  token: string,
  expectedAudience: string,
  nowSeconds: number,
  maximumAgeSeconds: number,
  maximumRemainingSeconds: number,
) {
  const header = decodeProtectedHeader(token);
  const claims = decodeJwt(token);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const { exp, iat, nbf } = claims;
  if (
    header.alg !== "RS256" ||
    typeof header.typ !== "string" ||
    header.typ.toUpperCase() !== "JWT" ||
    typeof header.kid !== "string" ||
    header.kid.length === 0 ||
    header.kid.length > 256 ||
    claims.iss !== VERCEL_ISSUER ||
    claims.sub !== VERCEL_SUBJECT ||
    audience.length !== 1 ||
    audience[0] !== expectedAudience ||
    claims.owner_id !== VERCEL_TEAM_ID ||
    claims.owner !== VERCEL_TEAM_SLUG ||
    claims.project_id !== VERCEL_PROJECT_ID ||
    claims.project !== VERCEL_PROJECT_NAME ||
    claims.environment !== "preview" ||
    typeof nbf !== "number" ||
    !Number.isSafeInteger(nbf) ||
    typeof iat !== "number" ||
    !Number.isSafeInteger(iat) ||
    typeof exp !== "number" ||
    !Number.isSafeInteger(exp) ||
    iat > nowSeconds + 30 ||
    iat < nowSeconds - maximumAgeSeconds ||
    nbf > nowSeconds + 30 ||
    nbf > exp ||
    iat > exp ||
    exp <= nowSeconds ||
    exp > nowSeconds + maximumRemainingSeconds
  ) {
    throw unavailable();
  }
  return claims as Readonly<{
    exp: number;
    iat: number;
    nbf: number;
    jti?: unknown;
    act?: unknown;
  }>;
}

function requirePreparedAuthority(
  value: unknown,
): CaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeTypes.isProxy(value) ||
    !Object.isFrozen(value) ||
    !PREPARED_AUTHORITIES.has(value)
  ) {
    throw unavailable();
  }
  const authority = exactDataRecord(value, [
    "version",
    "status",
    "projectId",
    "bucketLocation",
    "runtimePrincipal",
    "bucket",
    "objectPrefix",
    "requiredPermissionSetHash",
    "issuedAt",
    "expiresAt",
    "workloadIdentityReferenceSha256",
    "runtimePrincipalReferenceSha256",
    "rawCredentialMaterialPresent",
    "rawAuthorizationHeaderPresent",
  ]);
  if (
    authority.version !==
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_VERSION ||
    authority.status !==
      "PREPARED_EXACT_GCS_PRIVATE_AUTHORITY_NOT_ACTIVATED" ||
    authority.projectId !== PROJECT_ID ||
    authority.bucketLocation !== LOCATION ||
    authority.runtimePrincipal !== RUNTIME_SERVICE_ACCOUNT ||
    typeof authority.bucket !== "string" ||
    typeof authority.objectPrefix !== "string" ||
    !isSha256(authority.requiredPermissionSetHash) ||
    !isCanonicalTimestamp(authority.issuedAt) ||
    !isCanonicalTimestamp(authority.expiresAt) ||
    !isSha256(authority.workloadIdentityReferenceSha256) ||
    !isSha256(authority.runtimePrincipalReferenceSha256) ||
    authority.rawCredentialMaterialPresent !== false ||
    authority.rawAuthorizationHeaderPresent !== false
  ) {
    throw unavailable();
  }
  return value as CaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d;
}

function createRequiredPermissionSetHash(bucket: string) {
  return canonicalSha256({
    purpose: CREDENTIAL_PERMISSION_PURPOSE,
    projectId: PROJECT_ID,
    origin: GCS_ORIGIN,
    bucket,
    runtimePrincipal: RUNTIME_SERVICE_ACCOUNT,
    permissions: REQUIRED_PERMISSIONS,
  });
}

function requireBucket(value: unknown) {
  if (
    typeof value !== "string" ||
    !BUCKET_PATTERN.test(value) ||
    value.includes("..") ||
    value.startsWith("goog") ||
    value.includes("google")
  ) {
    throw unavailable();
  }
  return value;
}

function requireObjectPrefix(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !OBJECT_PREFIX_PATTERN.test(value) ||
    value.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw unavailable();
  }
  return value;
}

function encodeJson(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > PROVIDER_REQUEST_BODY_MAXIMUM_BYTES
  ) {
    scrubBytesBestEffort(bytes);
    throw unavailable();
  }
  return bytes;
}

function requireJwt(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 64 ||
    Buffer.byteLength(value, "utf8") > ACCESS_TOKEN_MAXIMUM_BYTES ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireAccessToken(value: unknown) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > ACCESS_TOKEN_MAXIMUM_BYTES ||
    !ACCESS_TOKEN_PATTERN.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireGoogleFutureTimestamp(value: unknown) {
  const match =
    typeof value === "string" ? GOOGLE_TIMESTAMP_PATTERN.exec(value) : null;
  const milliseconds = match ? Date.parse(value as string) : Number.NaN;
  const normalized = match
    ? `${match[1]}.${(match[2] ?? "000").slice(0, 3)}Z`
    : "";
  if (
    !match ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== normalized
  ) {
    throw unavailable();
  }
  return normalized;
}

function exactFrozenDataRecord(value: unknown, keys: readonly string[]) {
  const record = exactDataRecord(value, keys);
  if (!Object.isFrozen(record)) throw unavailable();
  return record;
}

function allowedDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
) {
  const record = requirePlainDataRecord(value);
  const actualKeys = Object.getOwnPropertyNames(record);
  if (
    requiredKeys.some((key) => !actualKeys.includes(key)) ||
    actualKeys.some((key) => !allowedKeys.includes(key))
  ) {
    throw unavailable();
  }
  return record;
}

function exactDataRecord(value: unknown, keys: readonly string[]) {
  const record = requirePlainDataRecord(value);
  const actualKeys = Object.getOwnPropertyNames(record);
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !actualKeys.includes(key))
  ) {
    throw unavailable();
  }
  return record;
}

function requirePlainDataRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
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

function requireBytes(
  value: unknown,
  maximumBytes: number,
  allowEmpty: boolean,
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

function createDeadline(
  rootSignals: readonly AbortSignal[],
  timeoutMs: number,
): Deadline {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  for (const signal of rootSignals) {
    if (!isNativeAbortSignal(signal)) throw unavailable();
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  const timeout = setTimeout(abort, timeoutMs);
  timeout.unref?.();
  let open = true;
  return Object.freeze({
    signal: controller.signal,
    close() {
      if (!open) return;
      open = false;
      clearTimeout(timeout);
      for (const signal of rootSignals) {
        signal.removeEventListener("abort", abort);
      }
      abort();
    },
  });
}

async function settleBeforeAbort<T>(
  operation: PromiseLike<T>,
  signal: AbortSignal,
  onLateSuccess?: (result: T) => void,
): Promise<T> {
  requireNotAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, result?: T) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (error !== undefined) reject(error);
      else resolve(result as T);
    };
    const onAbort = () => finish(unavailable());
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (result) => {
        if (settled) {
          try {
            onLateSuccess?.(result);
          } catch {
            // Late cleanup never replaces the fixed public result.
          }
          return;
        }
        finish(undefined, result);
      },
      () => finish(unavailable()),
    );
    if (signal.aborted) onAbort();
  });
}

function isNativeAbortSignal(value: unknown): value is AbortSignal {
  return value instanceof AbortSignal && !nodeTypes.isProxy(value);
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  const milliseconds =
    typeof value === "string" ? Date.parse(value) : Number.NaN;
  return (
    typeof value === "string" &&
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function scrubBytesBestEffort(value: unknown) {
  try {
    if (!nodeTypes.isProxy(value) && value instanceof Uint8Array) {
      Uint8Array.prototype.fill.call(value, 0);
    }
  } catch {
    // Cleanup must not inspect provider-controlled accessors or replace errors.
  }
}

function scrubResponseBodyBestEffort(value: unknown) {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      nodeTypes.isProxy(value)
    ) {
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, "body");
    if (descriptor && "value" in descriptor) {
      scrubBytesBestEffort(descriptor.value);
    }
  } catch {
    // Cleanup remains best effort after the public boundary fails closed.
  }
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

function unavailable() {
  return Object.freeze({
    code: "PRODUCT_API_DISABLED" as const,
    message:
      "Communication Note Google Cloud GCS private authority is unavailable" as const,
  });
}
