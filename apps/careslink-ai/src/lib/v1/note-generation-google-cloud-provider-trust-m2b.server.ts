import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { getVercelOidcTokenSync } from "@vercel/oidc";
import { decodeJwt, decodeProtectedHeader } from "jose";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION,
  createCaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation,
  createCaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapter,
  type CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential,
  type CaresLinkV1NoteGenerationGoogleCloudKmsCredentialPort,
  type CaresLinkV1NoteGenerationGoogleCloudKmsFetchPort,
  type CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation,
  type CaresLinkV1NoteGenerationGoogleCloudKmsWrapInput,
  type CaresLinkV1NoteGenerationGoogleCloudKmsWrappedResult,
} from "./note-generation-google-cloud-kms-wrap-adapter.server";
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
const KMS_ORIGIN = "https://cloudkms.googleapis.com" as const;
const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform" as const;
const SUBJECT_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:jwt" as const;
const TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange" as const;
const ACCESS_TOKEN_TYPE =
  "urn:ietf:params:oauth:token-type:access_token" as const;
const KMS_WRAP_CREDENTIAL_PURPOSE =
  "CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAP" as const;
const REQUEST_TIMEOUT_MS = 5_000 as const;
const PREPARATION_TIMEOUT_MS = 30_000;
const TOKEN_RESPONSE_MAXIMUM_BYTES = 16 * 1_024;
const KMS_RESPONSE_MAXIMUM_BYTES = 64 * 1_024;
const REQUEST_BODY_MAXIMUM_BYTES = 96 * 1_024;
const ACCESS_TOKEN_MAXIMUM_BYTES = 16 * 1_024;
const REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS = 300;
const ACCESS_TOKEN_MINIMUM_REMAINING_MS = 10_000;
const ACCESS_TOKEN_MAXIMUM_REMAINING_MS =
  (REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS + 60) * 1_000;
const BASE_OIDC_MAXIMUM_AGE_SECONDS = 95 * 60;
const BASE_OIDC_MAXIMUM_REMAINING_SECONDS = 125 * 60;
const CUSTOM_OIDC_MAXIMUM_AGE_SECONDS = 60;
const POSTURE_ATTESTATION_LIFETIME_MS = 30_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]{16,16384}={0,2}$/;
const NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN =
  /^projects\/careslink-m1u-security\/locations\/australia-southeast1\/keyRings\/[A-Za-z0-9_-]{1,63}\/cryptoKeys\/[A-Za-z0-9_-]{1,63}\/cryptoKeyVersions\/[1-9][0-9]{0,18}$/;
const GOOGLE_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}|\d{6}|\d{9}))?Z$/;

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_VERSION =
  "google-cloud-provider-trust.communication-note.2026-09-03.m2b.v1" as const;
export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_READY =
  false as const;

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_SOURCE_POLICY =
  deepFreeze({
    version:
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_VERSION,
    status: "SOURCE_PROVIDER_TRUST_NOT_COMPOSED",
    ready: false,
    sourceOnly: true,
    formalSingletonEnabled: false,
    formalFactoryEnabled: false,
    testOnlyCapabilityRequired: true,
    nodeRuntimeRequired: true,
    productionAllowed: false,
    exactProjectId: PROJECT_ID,
    exactProjectNumber: PROJECT_NUMBER,
    exactLocation: LOCATION,
    exactVercelIssuer: VERCEL_ISSUER,
    exactVercelSubject: VERCEL_SUBJECT,
    exactWifProviderResource: WIF_PROVIDER_RESOURCE,
    exactRuntimeServiceAccount: RUNTIME_SERVICE_ACCOUNT,
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
    directRestOnly: true,
    redirectsAllowed: false,
    automaticRetries: 0,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    preparationTimeoutMs: PREPARATION_TIMEOUT_MS,
    requestedAccessTokenLifetimeSeconds:
      REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS,
    separatePostureAndOperationAccessTokenRequestsRequired: true,
    retainedOperationCredentialBoundToTrustWindow: true,
    exactCryptoKeyPurpose: "RAW_ENCRYPT_DECRYPT",
    exactCryptoKeyVersionAlgorithm: "AES_256_GCM",
    exactCryptoKeyVersionProtectionLevel: "SOFTWARE",
    exactCryptoKeyVersionState: "ENABLED",
    authenticatedTrustHandle: "PRIVATE_WEAK_MAP_ONE_USE",
    callerSuppliedM2aPostureAccepted: false,
    rawCredentialMaterialReturned: false,
    cloudResourcesCreated: false,
    liveEvidencePresent: false,
    deploymentApproved: false,
    activationApproved: false,
  } as const);

export type CaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b = Readonly<{
  version: typeof CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_VERSION;
  status: "AUTHENTICATED_EXACT_KMS_PROVIDER_TRUST_NOT_ACTIVATED";
  kmsKeyVersionResource: string;
  observedAt: string;
  expiresAt: string;
  controlPlaneEvidenceSha256: string;
  workloadIdentityReferenceSha256: string;
  runtimePrincipalReferenceSha256: string;
  rawCredentialMaterialPresent: false;
}>;

export type CaresLinkV1NoteGenerationAuthenticatedGoogleCloudKmsWrapAdapterM2b =
  Readonly<{
    wrapDataEncryptionKey(
      input: CaresLinkV1NoteGenerationGoogleCloudKmsWrapInput,
    ): Promise<CaresLinkV1NoteGenerationGoogleCloudKmsWrappedResult>;
    discard(): void;
  }>;

/** Default-off: importing this module installs no credential or transport. */
export const CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_PROVIDER_TRUST_M2B =
  undefined as CaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b | undefined;

type PreparedTrustInternals = Readonly<{
  credentialState: PreparedCredentialState;
  fetchPort: CaresLinkV1NoteGenerationGoogleCloudKmsFetchPort;
  postureAttestation: CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation;
  rootAbortSignal: AbortSignal;
}>;

type PreparedCredentialState = Readonly<{
  port: CaresLinkV1NoteGenerationGoogleCloudKmsCredentialPort;
  discard(): void;
}>;

type AccessToken = Readonly<{
  accessToken: string;
  issuedAt: string;
  expiresAt: string;
}>;

type JsonResponse = Readonly<{
  value: Record<string, unknown>;
  bodySha256: string;
}>;

type Deadline = Readonly<{
  signal: AbortSignal;
  close(): void;
}>;

const PREPARED_TRUST = new WeakMap<object, PreparedTrustInternals>();

export async function prepareCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b(
  _value: unknown,
): Promise<never> {
  void _value;
  throw unavailable();
}

/**
 * Source-only, explicitly test-scoped seam. Executes the pinned Vercel
 * custom-audience -> Google STS -> service-account impersonation chain,
 * authenticates the exact parent CryptoKey and numeric CryptoKeyVersion, then
 * retains the result of a second independent short-lived access-token request
 * only behind an opaque one-use handle. No caller-supplied credential,
 * transport or M2a posture is accepted.
 */
export async function prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b(
  value: unknown,
): Promise<CaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b> {
  let deadline: Deadline | undefined;
  let credentialState: PreparedCredentialState | undefined;
  try {
    const options = parsePrepareOptions(value);
    deadline = createDeadline(
      options.rootAbortSignal,
      PREPARATION_TIMEOUT_MS,
    );
    const transport =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
    const exchange = await exchangeVercelWorkloadIdentity(
      transport,
      deadline.signal,
    );
    const postureCredential = await impersonateRuntimeServiceAccount(
      transport,
      deadline.signal,
      exchange.federatedAccessToken,
      exchange.validUntil,
    );
    const posture = await issueAuthenticatedKmsPosture(
      transport,
      deadline.signal,
      options.expectedKmsKeyVersionResource,
      postureCredential,
      exchange.workloadIdentityReferenceSha256,
    );
    const operationCredential = await impersonateRuntimeServiceAccount(
      transport,
      deadline.signal,
      exchange.federatedAccessToken,
      exchange.validUntil,
    );
    requireNotAborted(deadline.signal);
    credentialState = createPreparedKmsWrapCredentialState(
      operationCredential,
      posture.expiresAt,
      options.rootAbortSignal,
    );
    const fetchPort = createPrivateKmsFetchPort(transport);
    const trust = Object.freeze({
      version:
        CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_VERSION,
      status:
        "AUTHENTICATED_EXACT_KMS_PROVIDER_TRUST_NOT_ACTIVATED" as const,
      kmsKeyVersionResource: options.expectedKmsKeyVersionResource,
      observedAt: posture.observedAt,
      expiresAt: posture.expiresAt,
      controlPlaneEvidenceSha256: posture.controlPlaneEvidenceSha256,
      workloadIdentityReferenceSha256:
        exchange.workloadIdentityReferenceSha256,
      runtimePrincipalReferenceSha256: canonicalSha256({
        domain:
          "careslink.communication-note.google-cloud-runtime-principal.m2b.v1",
        principal: RUNTIME_SERVICE_ACCOUNT,
      }),
      rawCredentialMaterialPresent: false as const,
    });
    PREPARED_TRUST.set(
      trust,
      Object.freeze({
        credentialState,
        fetchPort,
        postureAttestation: posture.attestation,
        rootAbortSignal: options.rootAbortSignal,
      }),
    );
    credentialState = undefined;
    return trust;
  } catch {
    throw unavailable();
  } finally {
    deadline?.close();
    credentialState?.discard();
  }
}

/**
 * Consumes one authenticated M2b trust handle and constructs the lower-level
 * M2a exact-version adapter without exposing its credential or transport.
 */
export function createCaresLinkV1NoteGenerationAuthenticatedGoogleCloudKmsWrapAdapterM2b(
  value: unknown,
): CaresLinkV1NoteGenerationAuthenticatedGoogleCloudKmsWrapAdapterM2b {
  let internals: PreparedTrustInternals | undefined;
  try {
    const options = exactFrozenDataRecord(value, [
      "providerTrust",
      "rootAbortSignal",
    ]);
    const trust = requirePreparedTrust(options.providerTrust);
    internals = PREPARED_TRUST.get(trust);
    if (internals !== undefined) PREPARED_TRUST.delete(trust);
    if (
      internals === undefined ||
      options.rootAbortSignal !== internals.rootAbortSignal ||
      nodeTypes.isProxy(options.rootAbortSignal) ||
      !(options.rootAbortSignal instanceof AbortSignal) ||
      options.rootAbortSignal.aborted ||
      Date.parse(trust.expiresAt) <= Date.now() + REQUEST_TIMEOUT_MS
    ) {
      throw unavailable();
    }
    const credentialState = internals.credentialState;
    const adapter = createCaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapter(
      Object.freeze({
        fetchPort: internals.fetchPort,
        credentialPort: credentialState.port,
        expectedKmsKeyVersionResource: trust.kmsKeyVersionResource,
        keyVersionPostureAttestation: internals.postureAttestation,
        rootAbortSignal: internals.rootAbortSignal,
      }),
    );
    let open = true;
    return Object.freeze({
      async wrapDataEncryptionKey(input) {
        if (!open) throw unavailable();
        open = false;
        try {
          return await adapter.wrapDataEncryptionKey(input);
        } catch {
          throw unavailable();
        } finally {
          credentialState.discard();
        }
      },
      discard() {
        if (!open) return;
        open = false;
        credentialState.discard();
      },
    });
  } catch {
    internals?.credentialState.discard();
    throw unavailable();
  }
}

/** Discards an unused trust handle and its retained short-lived token. */
export function discardCaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b(
  value: unknown,
): void {
  try {
    const trust = requirePreparedTrust(value);
    const internals = PREPARED_TRUST.get(trust);
    if (internals === undefined) throw unavailable();
    PREPARED_TRUST.delete(trust);
    internals.credentialState.discard();
  } catch {
    throw unavailable();
  }
}

function parsePrepareOptions(value: unknown) {
  const options = exactFrozenDataRecord(value, [
    "capability",
    "expectedKmsKeyVersionResource",
    "rootAbortSignal",
  ]);
  if (
    options.capability !== "TEST_ONLY_M2B_GOOGLE_CLOUD_PROVIDER_TRUST" ||
    typeof options.expectedKmsKeyVersionResource !== "string" ||
    !NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN.test(
      options.expectedKmsKeyVersionResource,
    ) ||
    nodeTypes.isProxy(options.rootAbortSignal) ||
    !(options.rootAbortSignal instanceof AbortSignal) ||
    options.rootAbortSignal.aborted
  ) {
    throw unavailable();
  }
  return Object.freeze({
    expectedKmsKeyVersionResource: options.expectedKmsKeyVersionResource,
    rootAbortSignal: options.rootAbortSignal,
  });
}

async function exchangeVercelWorkloadIdentity(
  transport: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
  signal: AbortSignal,
) {
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
    const customResponse = await requestJson(
      transport,
      createRequest({
        method: "POST",
        url: VERCEL_TOKEN_EXCHANGE_URL,
        headers: Object.freeze({
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "careslink-ai-m2b-provider-trust/2026-09-03",
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
      (Object.hasOwn(custom, "expiry") &&
        custom.expiry !== customClaims.exp)
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
    const stsResponse = await requestJson(
      transport,
      createRequest({
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
      sts.expires_in < 30 ||
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
    if (Date.parse(validUntil) <= Date.now() + ACCESS_TOKEN_MINIMUM_REMAINING_MS) {
      throw unavailable();
    }
    requireNotAborted(signal);
    return Object.freeze({
      federatedAccessToken,
      validUntil,
      workloadIdentityReferenceSha256: canonicalSha256({
        domain:
          "careslink.communication-note.vercel-google-wif-exchange.m2b.v1",
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

async function impersonateRuntimeServiceAccount(
  transport: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
  signal: AbortSignal,
  federatedAccessToken: string,
  upstreamValidUntil: string,
): Promise<AccessToken> {
  try {
    requireNotAborted(signal);
    const issuedAt = new Date().toISOString();
    const response = await requestJson(
      transport,
      createRequest({
        method: "POST",
        url: RUNTIME_SERVICE_ACCOUNT_IMPERSONATION_URL,
        headers: Object.freeze({
          accept: "application/json",
          authorization: `Bearer ${requireAccessToken(federatedAccessToken)}`,
          "content-type": "application/json",
        }),
        body: encodeJson({
          scope: [CLOUD_PLATFORM_SCOPE],
          lifetime: `${REQUESTED_ACCESS_TOKEN_LIFETIME_SECONDS}s`,
        }),
        maximumResponseBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
        signal,
      }),
    );
    const credential = exactDataRecord(response.value, [
      "accessToken",
      "expireTime",
    ]);
    const accessToken = requireAccessToken(credential.accessToken);
    const expiresAt = requireGoogleFutureTimestamp(credential.expireTime);
    const receivedAtMs = Date.now();
    const remaining = Date.parse(expiresAt) - receivedAtMs;
    if (
      remaining <= ACCESS_TOKEN_MINIMUM_REMAINING_MS ||
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

async function issueAuthenticatedKmsPosture(
  transport: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
  signal: AbortSignal,
  kmsKeyVersionResource: string,
  credential: AccessToken,
  workloadIdentityReferenceSha256: string,
) {
  try {
    const cryptoKeyResource = kmsKeyVersionResource.replace(
      /\/cryptoKeyVersions\/[1-9][0-9]{0,18}$/,
      "",
    );
    const authorization = `Bearer ${credential.accessToken}`;
    const [keyResponse, versionResponse] = await Promise.all([
      requestJson(
        transport,
        createRequest({
          method: "GET",
          url: `${KMS_ORIGIN}/v1/${cryptoKeyResource}`,
          headers: Object.freeze({
            accept: "application/json",
            authorization,
          }),
          body: new Uint8Array(),
          maximumResponseBytes: KMS_RESPONSE_MAXIMUM_BYTES,
          signal,
        }),
      ),
      requestJson(
        transport,
        createRequest({
          method: "GET",
          url: `${KMS_ORIGIN}/v1/${kmsKeyVersionResource}`,
          headers: Object.freeze({
            accept: "application/json",
            authorization,
          }),
          body: new Uint8Array(),
          maximumResponseBytes: KMS_RESPONSE_MAXIMUM_BYTES,
          signal,
        }),
      ),
    ]);
    validateExactCryptoKey(keyResponse.value, cryptoKeyResource);
    validateExactCryptoKeyVersion(
      versionResponse.value,
      kmsKeyVersionResource,
    );
    requireNotAborted(signal);
    const observedAt = new Date().toISOString();
    const expiresAt = new Date(
      Math.min(
        Date.parse(credential.expiresAt),
        Date.parse(observedAt) + POSTURE_ATTESTATION_LIFETIME_MS,
      ),
    ).toISOString();
    if (Date.parse(expiresAt) <= Date.now() + REQUEST_TIMEOUT_MS) {
      throw unavailable();
    }
    const controlPlaneEvidenceSha256 = canonicalSha256({
      domain:
        "careslink.communication-note.google-cloud-kms-posture.m2b.v1",
      policyVersion:
        CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_VERSION,
      runtimePrincipal: RUNTIME_SERVICE_ACCOUNT,
      workloadIdentityReferenceSha256,
      cryptoKeyResource,
      kmsKeyVersionResource,
      cryptoKeyRequest: {
        method: "GET",
        url: `${KMS_ORIGIN}/v1/${cryptoKeyResource}`,
      },
      cryptoKeyVersionRequest: {
        method: "GET",
        url: `${KMS_ORIGIN}/v1/${kmsKeyVersionResource}`,
      },
      purpose: "RAW_ENCRYPT_DECRYPT",
      algorithm: "AES_256_GCM",
      protectionLevel: "SOFTWARE",
      state: "ENABLED",
      cryptoKeyResponseSha256: keyResponse.bodySha256,
      cryptoKeyVersionResponseSha256: versionResponse.bodySha256,
      observedAt,
      expiresAt,
    });
    const attestation =
      createCaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation(
        Object.freeze({
          attestationVersion:
            CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION,
          status:
            "VERIFIED_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_NOT_APPROVED" as const,
          kmsKeyVersionResource,
          purpose: "RAW_ENCRYPT_DECRYPT" as const,
          algorithm: "AES_256_GCM" as const,
          protectionLevel: "SOFTWARE" as const,
          state: "ENABLED" as const,
          observedAt,
          expiresAt,
          controlPlaneEvidenceSha256,
          rawKeyMaterialPresent: false as const,
        }),
      );
    return Object.freeze({
      observedAt,
      expiresAt,
      controlPlaneEvidenceSha256,
      attestation,
    });
  } catch {
    throw unavailable();
  }
}

function validateExactCryptoKey(
  value: Record<string, unknown>,
  expectedResource: string,
) {
  const key = allowedDataRecord(
    value,
    [
      "name",
      "primary",
      "purpose",
      "createTime",
      "nextRotationTime",
      "rotationPeriod",
      "versionTemplate",
      "labels",
      "importOnly",
      "destroyScheduledDuration",
      "cryptoKeyBackend",
      "keyAccessJustificationsPolicy",
    ],
    ["name", "purpose", "versionTemplate"],
  );
  const versionTemplate = exactDataRecord(key.versionTemplate, [
    "protectionLevel",
    "algorithm",
  ]);
  if (
    key.name !== expectedResource ||
    key.purpose !== "RAW_ENCRYPT_DECRYPT" ||
    versionTemplate.protectionLevel !== "SOFTWARE" ||
    versionTemplate.algorithm !== "AES_256_GCM" ||
    (Object.hasOwn(key, "importOnly") && key.importOnly !== false) ||
    Object.hasOwn(key, "primary") ||
    Object.hasOwn(key, "nextRotationTime") ||
    Object.hasOwn(key, "rotationPeriod") ||
    Object.hasOwn(key, "cryptoKeyBackend")
  ) {
    throw unavailable();
  }
}

function validateExactCryptoKeyVersion(
  value: Record<string, unknown>,
  expectedResource: string,
) {
  const version = allowedDataRecord(
    value,
    [
      "name",
      "state",
      "protectionLevel",
      "algorithm",
      "attestation",
      "createTime",
      "generateTime",
      "destroyTime",
      "destroyEventTime",
      "importJob",
      "importTime",
      "importFailureReason",
      "generationFailureReason",
      "externalDestructionFailureReason",
      "externalProtectionLevelOptions",
      "reimportEligible",
    ],
    ["name", "state", "protectionLevel", "algorithm"],
  );
  if (
    version.name !== expectedResource ||
    version.state !== "ENABLED" ||
    version.protectionLevel !== "SOFTWARE" ||
    version.algorithm !== "AES_256_GCM" ||
    Object.hasOwn(version, "attestation") ||
    Object.hasOwn(version, "destroyTime") ||
    Object.hasOwn(version, "destroyEventTime") ||
    Object.hasOwn(version, "importJob") ||
    Object.hasOwn(version, "importTime") ||
    Object.hasOwn(version, "importFailureReason") ||
    Object.hasOwn(version, "generationFailureReason") ||
    Object.hasOwn(version, "externalDestructionFailureReason") ||
    Object.hasOwn(version, "externalProtectionLevelOptions") ||
    (Object.hasOwn(version, "reimportEligible") &&
      version.reimportEligible !== false)
  ) {
    throw unavailable();
  }
}

function createPreparedKmsWrapCredentialState(
  credentialValue: AccessToken,
  trustExpiresAt: string,
  rootAbortSignal: AbortSignal,
): PreparedCredentialState {
  let credential: AccessToken | undefined = credentialValue;
  let open = true;
  const discard = () => {
    if (!open) return;
    open = false;
    credential = undefined;
    clearTimeout(expiryTimer);
    rootAbortSignal.removeEventListener("abort", discard);
  };
  const expiryDelay = Math.max(
    0,
    Math.min(
      Date.parse(credential.expiresAt),
      Date.parse(trustExpiresAt),
    ) -
      Date.now() -
      REQUEST_TIMEOUT_MS,
  );
  const expiryTimer = setTimeout(discard, expiryDelay);
  expiryTimer.unref?.();
  rootAbortSignal.addEventListener("abort", discard, { once: true });
  if (rootAbortSignal.aborted) discard();
  const port: CaresLinkV1NoteGenerationGoogleCloudKmsCredentialPort =
    Object.freeze({
      consumeAccessToken(requestValue, consumer) {
        if (!open || credential === undefined) throw unavailable();
        const candidate = credential;
        discard();
        const request = exactFrozenDataRecord(requestValue, [
          "purpose",
          "audience",
          "scope",
          "expectedPrincipal",
          "timeoutMs",
          "signal",
        ]);
        if (
          request.purpose !== KMS_WRAP_CREDENTIAL_PURPOSE ||
          request.audience !== `${KMS_ORIGIN}/` ||
          request.scope !== CLOUD_PLATFORM_SCOPE ||
          request.expectedPrincipal !== RUNTIME_SERVICE_ACCOUNT ||
          request.timeoutMs !== REQUEST_TIMEOUT_MS ||
          nodeTypes.isProxy(request.signal) ||
          !(request.signal instanceof AbortSignal) ||
          request.signal.aborted ||
          rootAbortSignal.aborted ||
          Date.parse(candidate.expiresAt) <= Date.now() + REQUEST_TIMEOUT_MS ||
          typeof consumer !== "function" ||
          nodeTypes.isProxy(consumer)
        ) {
          throw unavailable();
        }
        const supplied: CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential =
          Object.freeze({
            accessToken: candidate.accessToken,
            expiresAt: candidate.expiresAt,
            principal: RUNTIME_SERVICE_ACCOUNT,
          });
        return consumer(supplied);
      },
    });
  return Object.freeze({ port, discard });
}

function createPrivateKmsFetchPort(
  transport: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
): CaresLinkV1NoteGenerationGoogleCloudKmsFetchPort {
  return Object.freeze({
    fetch(request) {
      return transport.request(
        request as CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b,
      );
    },
  });
}

function createRequest(
  value: Omit<
    CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b,
    "redirect" | "automaticRetries" | "timeoutMs"
  >,
): CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b {
  if (value.body.byteLength > REQUEST_BODY_MAXIMUM_BYTES) {
    scrubBytes(value.body);
    throw unavailable();
  }
  return Object.freeze({
    ...value,
    redirect: "ERROR" as const,
    automaticRetries: 0 as const,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
}

async function requestJson(
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
    body = requireBytes(response.body, request.maximumResponseBytes);
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

function requirePreparedTrust(
  value: unknown,
): CaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeTypes.isProxy(value) ||
    !Object.isFrozen(value) ||
    !PREPARED_TRUST.has(value)
  ) {
    throw unavailable();
  }
  const trust = exactDataRecord(value, [
    "version",
    "status",
    "kmsKeyVersionResource",
    "observedAt",
    "expiresAt",
    "controlPlaneEvidenceSha256",
    "workloadIdentityReferenceSha256",
    "runtimePrincipalReferenceSha256",
    "rawCredentialMaterialPresent",
  ]);
  if (
    trust.version !==
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_TRUST_M2B_VERSION ||
    trust.status !==
      "AUTHENTICATED_EXACT_KMS_PROVIDER_TRUST_NOT_ACTIVATED" ||
    typeof trust.kmsKeyVersionResource !== "string" ||
    !NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN.test(
      trust.kmsKeyVersionResource,
    ) ||
    !isCanonicalTimestamp(trust.observedAt) ||
    !isCanonicalTimestamp(trust.expiresAt) ||
    !isSha256(trust.controlPlaneEvidenceSha256) ||
    !isSha256(trust.workloadIdentityReferenceSha256) ||
    !isSha256(trust.runtimePrincipalReferenceSha256) ||
    trust.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return value as CaresLinkV1NoteGenerationGoogleCloudProviderTrustM2b;
}

function encodeJson(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > REQUEST_BODY_MAXIMUM_BYTES
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
  const object = exactDataRecord(value, keys);
  if (!Object.isFrozen(object)) throw unavailable();
  return object;
}

function allowedDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
) {
  const object = requirePlainDataRecord(value);
  const actualKeys = Object.getOwnPropertyNames(object);
  if (
    requiredKeys.some((key) => !actualKeys.includes(key)) ||
    actualKeys.some((key) => !allowedKeys.includes(key))
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

function requireBytes(value: unknown, maximumBytes: number) {
  if (
    nodeTypes.isProxy(value) ||
    !(value instanceof Uint8Array) ||
    value.byteLength === 0 ||
    value.byteLength > maximumBytes
  ) {
    throw unavailable();
  }
  return Uint8Array.from(value);
}

function createDeadline(rootSignal: AbortSignal, timeoutMs: number): Deadline {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  if (rootSignal.aborted) abort();
  else rootSignal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  timeout.unref?.();
  let open = true;
  return Object.freeze({
    signal: controller.signal,
    close() {
      if (!open) return;
      open = false;
      clearTimeout(timeout);
      rootSignal.removeEventListener("abort", abort);
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
            // Late cleanup cannot change the already-fixed public outcome.
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

function scrubBytes(value: Uint8Array) {
  Uint8Array.prototype.fill.call(value, 0);
}

function scrubBytesBestEffort(value: unknown) {
  try {
    if (
      !nodeTypes.isProxy(value) &&
      value instanceof Uint8Array
    ) {
      scrubBytes(value);
    }
  } catch {
    // Cleanup must not surface provider data or create a secondary failure.
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
    // A rejected response is never projected; cleanup remains best effort.
  }
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
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
      "Communication Note Google Cloud provider trust is unavailable" as const,
  });
}
