import "server-only";

import { createHash, X509Certificate } from "node:crypto";
import { createRequire } from "node:module";
import { types as nodeTypes } from "node:util";

import { decodeJwt, decodeProtectedHeader } from "jose";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const PROJECT_ID = "careslink-m1u-security" as const;
const PROJECT_NUMBER = "288554824534" as const;
const LOCATION = "australia-southeast1" as const;
const VERCEL_TEAM_SLUG = "millionlunas-projects" as const;
const VERCEL_TEAM_ID = "team_cFWfAk6zAa0b7X5bc1ONT4SA" as const;
const VERCEL_PROJECT_NAME = "careslink-ai" as const;
const VERCEL_PROJECT_ID = "prj_AtdTukVr39wrGH9PYgKusfku2gvS" as const;
const VERCEL_ISSUER =
  `https://oidc.vercel.com/${VERCEL_TEAM_SLUG}` as const;
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
const KEY_RING = "careslink-preview-m1u" as const;
const SECRET_MANAGER_ENDPOINT =
  `secretmanager.${LOCATION}.rep.googleapis.com` as const;
const MAXIMUM_IDENTITY_AGE_SECONDS = 5 * 60;
const MAXIMUM_IDENTITY_REMAINING_SECONDS = 5 * 60;
const MAXIMUM_OIDC_REMAINING_SECONDS = 65 * 60;
const MAXIMUM_SECRET_BYTES = 64 * 1_024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const PRODUCTION_PROJECT_REF = "adocsnwnslxhxcjgbyee" as const;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const HMAC_KEYS = deepFreeze({
  VERCEL_WORKLOAD_IDENTITY_BINDING: kmsVersion(
    "hmac-workload-identity-v1",
  ),
  VERCEL_DEPLOYMENT_SOURCE_TARGET_BINDING: kmsVersion(
    "hmac-deployment-source-target-v1",
  ),
  SUPABASE_PROJECT_REF_BINDING: kmsVersion(
    "hmac-supabase-project-ref-v1",
  ),
  SOURCE_MANIFEST_ATTESTATION: kmsVersion("hmac-source-manifest-v1"),
} as const);

const SECRETS = deepFreeze({
  managementOAuth: secretVersion(
    "supabase-management-oauth-credential",
  ),
  pinnedCa: secretVersion("supabase-preview-pinned-ca-pem"),
  databasePassword: secretVersion(
    "supabase-preview-branch-admin-password",
  ),
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_VERSION =
  "gcp-adapters.communication.openai.synthetic-preview.2026-09-01.m1u.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_READY =
  false as const;

const GCP_ADAPTERS_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_VERSION,
  status: "SOURCE_GCP_PROVIDER_ADAPTERS_NOT_ACTIVATED",
  ready: false,
  sourceOnly: true,
  nodeRuntimeRequired: true,
  edgeRuntimeSupported: false,
  provider: "GOOGLE_CLOUD",
  projectId: PROJECT_ID,
  projectNumber: PROJECT_NUMBER,
  location: LOCATION,
  productionAllowed: false,
  applicationDefaultCredentialsAllowed: false,
  serviceAccountJsonAllowed: false,
  workloadIdentityFederationRequired: true,
  wifProviderResource: WIF_PROVIDER_RESOURCE,
  runtimeServiceAccount: RUNTIME_SERVICE_ACCOUNT,
  runtimeServiceAccountImpersonationUrl:
    RUNTIME_SERVICE_ACCOUNT_IMPERSONATION_URL,
  vercelIssuer: VERCEL_ISSUER,
  wifExternalAccountAudience: WIF_PROVIDER_RESOURCE,
  wifSubjectTokenAllowedAudience: WIF_SUBJECT_TOKEN_AUDIENCE,
  vercelSubject: VERCEL_SUBJECT,
  vercelTeamId: VERCEL_TEAM_ID,
  vercelProjectId: VERCEL_PROJECT_ID,
  vercelEnvironment: "preview",
  oidcCryptographicVerificationRequired: true,
  oidcOnlySourceRevisionAttestationAllowed: false,
  sourceManifestIndependentKmsVerificationRequired: true,
  sourceManifestVerifiedBeforeSecretAccess: true,
  kmsProtectionLevel: "SOFTWARE",
  kmsAlgorithm: "HMAC_SHA256",
  kmsVersions: HMAC_KEYS,
  secretManagerEndpoint: SECRET_MANAGER_ENDPOINT,
  secretVersions: SECRETS,
  numericSecretVersionsRequired: true,
  latestSecretVersionAllowed: false,
  kmsRequestAndResponseCrc32cRequired: true,
  secretPayloadCrc32cRequired: true,
  supabaseManagementCredentialClass:
    "SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN",
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
  credentialCallbacksExactlyOncePerInvocation: true,
  rawIdentityTokenReturned: false,
  rawHmacKeyMaterialReturned: false,
  rawSecretMaterialReturned: false,
  providerClientsInjectableTestOnly: true,
  liveEvidencePresent: false,
  productRouteImporterPresent: false,
  deploymentApproved: false,
  activationApproved: false,
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY_DIGEST =
  "5a0b358626f1864cd13584e4abadf79254e5d365911b28586666e58a76c76c36" as const;

if (
  canonicalSha256(GCP_ADAPTERS_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY =
  deepFreeze({
    ...GCP_ADAPTERS_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS_POLICY_DIGEST,
  });

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_GCP_ADAPTERS =
  undefined as GcpProviderPortBundle | undefined;

export async function createCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
  _value: unknown,
  _context: unknown,
): Promise<never> {
  void _value;
  void _context;
  throw unavailable();
}

/**
 * Source-only GCP provider implementation. The formal factory is deliberately
 * disabled. This test-only seam accepts already-constructed external clients;
 * it never discovers ADC, reads environment variables or accepts a service
 * account key. A later reviewed bridge may connect this bundle to M1t.
 */
export async function createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
  value: unknown,
  contextValue: unknown,
): Promise<GcpProviderPortBundle> {
  try {
    const options = exactDataRecord(value, [
      "capability",
      "workloadIdentityClient",
      "kmsClient",
      "secretManagerClient",
      "vercelOidcTokenSource",
      "sourceManifestAttestation",
      "clock",
    ]);
    if (options.capability !== "TEST_ONLY_M1U_GCP_PROVIDER_ADAPTERS") {
      throw unavailable();
    }
    const context = validateContext(contextValue);
    const verifyAndExchange = validateFrozenCallablePort<
      WorkloadIdentityClient["verifyAndExchange"]
    >(options.workloadIdentityClient, "verifyAndExchange");
    const macSign = validateFrozenCallablePort<KmsClient["macSign"]>(
      options.kmsClient,
      "macSign",
      ["macSign", "macVerify"],
    );
    const macVerify = validateFrozenCallablePort<KmsClient["macVerify"]>(
      options.kmsClient,
      "macVerify",
      ["macSign", "macVerify"],
    );
    const accessSecretVersion = validateFrozenCallablePort<
      SecretManagerClient["accessSecretVersion"]
    >(options.secretManagerClient, "accessSecretVersion");
    const getToken = validateFrozenCallablePort<
      VercelOidcTokenSource["getToken"]
    >(options.vercelOidcTokenSource, "getToken");
    const nowSource = validateFrozenCallablePort<Clock["now"]>(
      options.clock,
      "now",
    );
    requireIndependentPorts(
      [
        options.workloadIdentityClient,
        options.kmsClient,
        options.secretManagerClient,
        options.vercelOidcTokenSource,
        options.clock,
      ],
      [
        verifyAndExchange,
        macSign,
        macVerify,
        accessSecretVersion,
        getToken,
        nowSource,
      ],
    );
    let previousClockMilliseconds = Number.NEGATIVE_INFINITY;
    const now: Clock["now"] = () => {
      const timestamp = requireTimestamp(nowSource());
      const milliseconds = Date.parse(timestamp);
      if (milliseconds < previousClockMilliseconds) throw unavailable();
      previousClockMilliseconds = milliseconds;
      return timestamp;
    };
    const sourceManifestAttestation = validateSourceManifestAttestation(
      options.sourceManifestAttestation,
    );
    let verifiedWorkload: VerifiedWorkload | undefined;
    let verificationStarted = false;

    const workloadIdentityVerifierPort = Object.freeze({
      async verify(requestValue: unknown, callContextValue: unknown) {
        try {
          if (verificationStarted || verifiedWorkload) throw unavailable();
          verificationStarted = true;
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          requireNotAborted(callContext.signal);
          const request = validateWorkloadVerificationRequest(requestValue);
          requireManifestMatchesRequest(sourceManifestAttestation, request);
          const token = await getToken(
            Object.freeze({
              team: VERCEL_TEAM_SLUG,
              project: VERCEL_PROJECT_NAME,
              audience: WIF_SUBJECT_TOKEN_AUDIENCE,
            }),
          );
          requireNotAborted(callContext.signal);
          const claims = validateUntrustedOidcStructure(token, readClock(now));
          const exchange = exactDataRecord(
            await verifyAndExchange(
              Object.freeze({
                token,
                audience: WIF_PROVIDER_RESOURCE,
                subjectTokenType:
                  "urn:ietf:params:oauth:token-type:jwt" as const,
                serviceAccountImpersonationUrl:
                  RUNTIME_SERVICE_ACCOUNT_IMPERSONATION_URL,
                expectedIssuer: VERCEL_ISSUER,
                expectedAudience: WIF_SUBJECT_TOKEN_AUDIENCE,
                expectedSubject: VERCEL_SUBJECT,
                expectedOwnerId: VERCEL_TEAM_ID,
                expectedProjectId: VERCEL_PROJECT_ID,
                expectedEnvironment: "preview" as const,
              }),
              callContext,
            ),
            [
              "status",
              "principal",
              "expiresAt",
              "rawAccessTokenMaterialPresent",
            ],
          );
          requireNotAborted(callContext.signal);
          if (
            exchange.status !== "GCP_WIF_TOKEN_VERIFIED_AND_IMPERSONATED" ||
            exchange.principal !== RUNTIME_SERVICE_ACCOUNT ||
            exchange.rawAccessTokenMaterialPresent !== false
          ) {
            throw unavailable();
          }
          const exchangeExpiresAt = requireTimestamp(exchange.expiresAt);
          requireFreshExpiry(exchangeExpiresAt, readClock(now));
          await verifySourceManifest(
            macVerify,
            sourceManifestAttestation,
            callContext,
          );
          requireNotAborted(callContext.signal);
          const observedAt = readClock(now);
          const expiresAt = earliestExpiry(
            exchangeExpiresAt,
            new Date(claims.exp * 1_000).toISOString(),
            new Date(
              Date.parse(observedAt) +
                MAXIMUM_IDENTITY_REMAINING_SECONDS * 1_000,
            ).toISOString(),
          );
          if (Date.parse(expiresAt) <= Date.parse(observedAt)) {
            throw unavailable();
          }
          const result = Object.freeze({
            status:
              "VERIFIED_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST_NOT_APPROVED" as const,
            source: "VERCEL_OIDC_WITH_MANAGED_SOURCE_MANIFEST" as const,
            vercelTeamIdSha256: sha256(VERCEL_TEAM_ID),
            vercelProjectIdSha256: sha256(VERCEL_PROJECT_ID),
            vercelEnvironment: "preview" as const,
            sourceRevisionSha256: request.sourceRevisionSha256,
            sourceManifestSha256: request.sourceManifestSha256,
            postgresMajor: 17 as const,
            connectionMode: "DIRECT" as const,
            workloadPrincipalReferenceSha256: canonicalSha256({
              domain: "careslink.communication-note.preview.gcp-wif-principal.m1u.v1",
              provider: WIF_PROVIDER_RESOURCE,
              principal: RUNTIME_SERVICE_ACCOUNT,
              subject: VERCEL_SUBJECT,
            }),
            deploymentReferenceSha256: canonicalSha256({
              domain: "careslink.communication-note.preview.vercel-deployment.m1u.v1",
              issuer: VERCEL_ISSUER,
              subject: VERCEL_SUBJECT,
              jti: claims.jti,
            }),
            sourceManifestEvidenceSha256: canonicalSha256({
              domain: "careslink.communication-note.preview.source-manifest-evidence.m1u.v1",
              keyVersion: HMAC_KEYS.SOURCE_MANIFEST_ATTESTATION,
              binding: sourceManifestAttestation.binding,
              macSha256: sha256(sourceManifestAttestation.mac),
            }),
            observedAt,
            expiresAt,
            rawIdentityCredentialMaterialPresent: false as const,
          });
          verifiedWorkload = Object.freeze({
            sourceRevisionSha256: request.sourceRevisionSha256,
            sourceManifestEvidenceSha256:
              result.sourceManifestEvidenceSha256,
            targetProjectRef: request.targetProjectRef,
            tlsRootCertificateSha256:
              request.tlsRootCertificateSha256,
            expiresAt,
          });
          return result;
        } catch {
          throw unavailable();
        }
      },
    });

    const managedHmacPort = Object.freeze({
      async hmac(requestValue: unknown, callContextValue: unknown) {
        try {
          const workload = requireVerifiedWorkload(verifiedWorkload, now);
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          requireNotAborted(callContext.signal);
          const request = validateHmacRequest(
            requestValue,
            workload.sourceRevisionSha256,
          );
          const keyVersion = HMAC_KEYS[request.purpose];
          const data = encodeCanonical({
            domain: "careslink.communication-note.preview.gcp-managed-hmac.m1u.v1",
            ...request,
          });
          const requestCrc32c = crc32c.calculate(data);
          const response = exactDataRecord(
            firstRpcResponse(
              await macSign(
                Object.freeze({
                  name: keyVersion,
                  data,
                  dataCrc32c: requestCrc32c,
                }),
                callContext,
              ),
            ),
            [
              "name",
              "mac",
              "macCrc32c",
              "verifiedDataCrc32c",
              "protectionLevel",
            ],
          );
          requireNotAborted(callContext.signal);
          const mac = requireBytes(response.mac, 32);
          if (
            response.name !== keyVersion ||
            response.verifiedDataCrc32c !== true ||
            response.protectionLevel !== "SOFTWARE" ||
            requireCrc32c(response.macCrc32c) !== crc32c.calculate(mac)
          ) {
            throw unavailable();
          }
          return Object.freeze({
            status: "MANAGED_HMAC_SHA256_NOT_APPROVED" as const,
            purpose: request.purpose,
            macSha256: sha256(mac),
            keyReferenceSha256: sha256(keyVersionBeforeNumericVersion(keyVersion)),
            keyVersionSha256: sha256(keyVersion),
            rawKeyMaterialPresent: false as const,
          });
        } catch {
          throw unavailable();
        }
      },
    });

    const supabaseManagementCredentialPort = Object.freeze({
      async consume(
        requestValue: unknown,
        callContextValue: unknown,
        consumerValue: unknown,
      ): Promise<void> {
        try {
          const workload = requireVerifiedWorkload(verifiedWorkload, now);
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          const request = validateManagementSecretRequest(
            requestValue,
            workload,
          );
          const consumer = requireConsumer(consumerValue);
          const bytes = await accessSecret(
            accessSecretVersion,
            SECRETS.managementOAuth,
            callContext,
          );
          const credential = validateManagementCredential(
            bytes,
            request,
            readClock(now),
          );
          let callbackCount = 0;
          await consumer(
            credential.accessToken,
            Object.freeze({
              status:
                "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED" as const,
              source: "MANAGED_SECRET_CUSTODY" as const,
              credentialClass:
                "SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" as const,
              authorizationModel:
                "SUPABASE_OAUTH_APP_SCOPE" as const,
              oauthScope: "environment:read" as const,
              oauthAppReferenceSha256:
                credential.oauthAppReferenceSha256,
              oauthGrantReferenceSha256:
                credential.oauthGrantReferenceSha256,
              scopeAttestationSource:
                "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" as const,
              endpointAllowlistEnforced: true as const,
              principalReferenceSha256:
                credential.principalReferenceSha256,
              credentialReferenceSha256:
                credential.credentialReferenceSha256,
              observedAt: credential.observedAt,
              expiresAt: credential.expiresAt,
              rawCredentialMaterialPresent: false as const,
            }),
          );
          callbackCount += 1;
          if (callbackCount !== 1) throw unavailable();
          requireNotAborted(callContext.signal);
        } catch {
          throw unavailable();
        }
      },
    });

    const pinnedCaCustodyPort = Object.freeze({
      async load(requestValue: unknown, callContextValue: unknown) {
        try {
          const workload = requireVerifiedWorkload(verifiedWorkload, now);
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          const request = validatePinnedCaRequest(
            requestValue,
            workload,
          );
          const bytes = await accessSecret(
            accessSecretVersion,
            SECRETS.pinnedCa,
            callContext,
          );
          if (sha256(bytes) !== request.tlsRootCertificateSha256) {
            throw unavailable();
          }
          validatePinnedCaPem(bytes);
          return Object.freeze({
            tlsRootCertificate: Uint8Array.from(bytes),
            custodyReferenceSha256: sha256(SECRETS.pinnedCa),
            rawCredentialMaterialPresent: false as const,
          });
        } catch {
          throw unavailable();
        }
      },
    });

    const databaseCredentialCustodyPort = Object.freeze({
      async consume(
        requestValue: unknown,
        callContextValue: unknown,
        consumerValue: unknown,
      ): Promise<void> {
        try {
          const workload = requireVerifiedWorkload(verifiedWorkload, now);
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          validateDatabaseCredentialRequest(
            requestValue,
            workload,
          );
          const consumer = requireConsumer(consumerValue);
          const bytes = await accessSecret(
            accessSecretVersion,
            SECRETS.databasePassword,
            callContext,
          );
          const password = decodeSecretText(bytes, 1_024);
          if (password.length < 16 || /[\r\n\0]/.test(password)) {
            throw unavailable();
          }
          let callbackCount = 0;
          await consumer(password);
          callbackCount += 1;
          if (callbackCount !== 1) throw unavailable();
          requireNotAborted(callContext.signal);
        } catch {
          throw unavailable();
        }
      },
    });

    return Object.freeze({
      status: "TEST_ONLY_GCP_PROVIDER_PORT_BUNDLE_NOT_APPROVED" as const,
      workloadIdentityVerifierPort,
      managedHmacPort,
      supabaseManagementCredentialPort,
      pinnedCaCustodyPort,
      databaseCredentialCustodyPort,
      rawCredentialMaterialPresent: false as const,
    });
  } catch {
    throw unavailable();
  }
}

type CallContext = Readonly<{ signal: AbortSignal }>;
type Clock = Readonly<{ now(): string }>;
type WorkloadIdentityClient = Readonly<{
  verifyAndExchange(
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ): PromiseLike<unknown>;
}>;
type KmsClient = Readonly<{
  macSign(
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ): PromiseLike<unknown>;
  macVerify(
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ): PromiseLike<unknown>;
}>;
type SecretManagerClient = Readonly<{
  accessSecretVersion(
    request: Readonly<{ name: string }>,
    context: CallContext,
  ): PromiseLike<unknown>;
}>;
type VercelOidcTokenSource = Readonly<{
  getToken(request: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}>;
type ManifestBinding = Readonly<{
  schemaVersion: "source-manifest.communication-note.preview.2026-09-01.m1u.v1";
  sourceRevisionSha256: string;
  sourceManifestSha256: string;
  targetProjectRef: string;
  tlsRootCertificateSha256: string;
  vercelTeamId: typeof VERCEL_TEAM_ID;
  vercelProjectId: typeof VERCEL_PROJECT_ID;
  vercelEnvironment: "preview";
  postgresMajor: 17;
  connectionMode: "DIRECT";
  keyVersion: typeof HMAC_KEYS.SOURCE_MANIFEST_ATTESTATION;
}>;
type SourceManifestAttestation = Readonly<{
  binding: ManifestBinding;
  mac: Uint8Array;
}>;
type VerifiedWorkload = Readonly<{
  sourceRevisionSha256: string;
  sourceManifestEvidenceSha256: string;
  targetProjectRef: string;
  tlsRootCertificateSha256: string;
  expiresAt: string;
}>;
type GcpProviderPortBundle = Readonly<{
  status: "TEST_ONLY_GCP_PROVIDER_PORT_BUNDLE_NOT_APPROVED";
  workloadIdentityVerifierPort: Readonly<{
    verify(request: unknown, context: unknown): Promise<unknown>;
  }>;
  managedHmacPort: Readonly<{
    hmac(request: unknown, context: unknown): Promise<unknown>;
  }>;
  supabaseManagementCredentialPort: Readonly<{
    consume(
      request: unknown,
      context: unknown,
      consumer: unknown,
    ): Promise<void>;
  }>;
  pinnedCaCustodyPort: Readonly<{
    load(request: unknown, context: unknown): Promise<unknown>;
  }>;
  databaseCredentialCustodyPort: Readonly<{
    consume(
      request: unknown,
      context: unknown,
      consumer: unknown,
    ): Promise<void>;
  }>;
  rawCredentialMaterialPresent: false;
}>;

function validateWorkloadVerificationRequest(value: unknown) {
  const object = exactDataRecord(value, [
    "purpose",
    "audience",
    "environmentClass",
    "vercelEnvironment",
    "vercelTeamIdSha256",
    "vercelProjectIdSha256",
    "sourceRevisionSha256",
    "sourceManifestSha256",
    "postgresMajor",
    "connectionMode",
    "targetProjectRef",
    "tlsRootCertificateSha256",
  ]);
  if (
    object.purpose !== "VERIFY_VERCEL_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST" ||
    object.audience !== "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME" ||
    object.environmentClass !== "NON_PRODUCTION_PREVIEW" ||
    object.vercelEnvironment !== "preview" ||
    object.vercelTeamIdSha256 !== sha256(VERCEL_TEAM_ID) ||
    object.vercelProjectIdSha256 !== sha256(VERCEL_PROJECT_ID) ||
    object.postgresMajor !== 17 ||
    object.connectionMode !== "DIRECT" ||
    typeof object.targetProjectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(object.targetProjectRef) ||
    object.targetProjectRef === PRODUCTION_PROJECT_REF
  ) {
    throw unavailable();
  }
  return Object.freeze({
    sourceRevisionSha256: requireSha256(object.sourceRevisionSha256),
    sourceManifestSha256: requireSha256(object.sourceManifestSha256),
    targetProjectRef: object.targetProjectRef,
    tlsRootCertificateSha256: requireSha256(
      object.tlsRootCertificateSha256,
    ),
  });
}

function validateSourceManifestAttestation(
  value: unknown,
): SourceManifestAttestation {
  const object = exactDataRecord(value, ["binding", "mac"]);
  const binding = exactDataRecord(object.binding, [
    "schemaVersion",
    "sourceRevisionSha256",
    "sourceManifestSha256",
    "targetProjectRef",
    "tlsRootCertificateSha256",
    "vercelTeamId",
    "vercelProjectId",
    "vercelEnvironment",
    "postgresMajor",
    "connectionMode",
    "keyVersion",
  ]);
  if (
    binding.schemaVersion !==
      "source-manifest.communication-note.preview.2026-09-01.m1u.v1" ||
    binding.vercelTeamId !== VERCEL_TEAM_ID ||
    binding.vercelProjectId !== VERCEL_PROJECT_ID ||
    binding.vercelEnvironment !== "preview" ||
    binding.postgresMajor !== 17 ||
    binding.connectionMode !== "DIRECT" ||
    binding.keyVersion !== HMAC_KEYS.SOURCE_MANIFEST_ATTESTATION ||
    typeof binding.targetProjectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(binding.targetProjectRef) ||
    binding.targetProjectRef === PRODUCTION_PROJECT_REF
  ) {
    throw unavailable();
  }
  const result = Object.freeze({
    binding: Object.freeze({
      schemaVersion: binding.schemaVersion,
      sourceRevisionSha256: requireSha256(binding.sourceRevisionSha256),
      sourceManifestSha256: requireSha256(binding.sourceManifestSha256),
      targetProjectRef: binding.targetProjectRef,
      tlsRootCertificateSha256: requireSha256(
        binding.tlsRootCertificateSha256,
      ),
      vercelTeamId: VERCEL_TEAM_ID,
      vercelProjectId: VERCEL_PROJECT_ID,
      vercelEnvironment: "preview" as const,
      postgresMajor: 17 as const,
      connectionMode: "DIRECT" as const,
      keyVersion: HMAC_KEYS.SOURCE_MANIFEST_ATTESTATION,
    }),
    mac: Uint8Array.from(requireBytes(object.mac, 32)),
  });
  return result;
}

function requireManifestMatchesRequest(
  attestation: SourceManifestAttestation,
  request: ReturnType<typeof validateWorkloadVerificationRequest>,
) {
  if (
    attestation.binding.sourceRevisionSha256 !==
      request.sourceRevisionSha256 ||
    attestation.binding.sourceManifestSha256 !==
      request.sourceManifestSha256 ||
    attestation.binding.targetProjectRef !== request.targetProjectRef ||
    attestation.binding.tlsRootCertificateSha256 !==
      request.tlsRootCertificateSha256
  ) {
    throw unavailable();
  }
}

function validateUntrustedOidcStructure(value: unknown, now: string) {
  if (typeof value !== "string" || value.length < 64 || value.length > 16_384) {
    throw unavailable();
  }
  const header = decodeProtectedHeader(value);
  const claims = decodeJwt(value);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const nowSeconds = Math.floor(Date.parse(now) / 1_000);
  const { exp, iat, nbf } = claims;
  if (
    header.alg !== "RS256" ||
    header.typ !== "JWT" ||
    typeof header.kid !== "string" ||
    header.kid.length === 0 ||
    claims.iss !== VERCEL_ISSUER ||
    claims.sub !== VERCEL_SUBJECT ||
    audience.length !== 1 ||
    audience[0] !== WIF_SUBJECT_TOKEN_AUDIENCE ||
    claims.owner_id !== VERCEL_TEAM_ID ||
    claims.owner !== VERCEL_TEAM_SLUG ||
    claims.project_id !== VERCEL_PROJECT_ID ||
    claims.project !== VERCEL_PROJECT_NAME ||
    claims.environment !== "preview" ||
    typeof nbf !== "number" ||
    !Number.isInteger(nbf) ||
    typeof iat !== "number" ||
    !Number.isInteger(iat) ||
    typeof exp !== "number" ||
    !Number.isInteger(exp) ||
    typeof claims.jti !== "string" ||
    claims.jti.length === 0 ||
    iat > nowSeconds + 30 ||
    iat < nowSeconds - MAXIMUM_IDENTITY_AGE_SECONDS ||
    nbf > nowSeconds + 30 ||
    nbf > exp ||
    iat > exp ||
    exp <= nowSeconds ||
    exp > nowSeconds + MAXIMUM_OIDC_REMAINING_SECONDS
  ) {
    throw unavailable();
  }
  return Object.freeze({ exp, jti: claims.jti });
}

async function verifySourceManifest(
  macVerify: KmsClient["macVerify"],
  attestation: SourceManifestAttestation,
  context: CallContext,
) {
  const data = encodeCanonical({
    domain: "careslink.communication-note.preview.source-manifest.m1u.v1",
    binding: attestation.binding,
  });
  const dataCrc32c = crc32c.calculate(data);
  const macCrc32c = crc32c.calculate(attestation.mac);
  const response = exactDataRecord(
    firstRpcResponse(
      await macVerify(
        Object.freeze({
          name: HMAC_KEYS.SOURCE_MANIFEST_ATTESTATION,
          data,
          dataCrc32c,
          mac: Uint8Array.from(attestation.mac),
          macCrc32c,
        }),
        context,
      ),
    ),
    [
      "name",
      "success",
      "verifiedDataCrc32c",
      "verifiedMacCrc32c",
      "verifiedSuccessIntegrity",
      "protectionLevel",
    ],
  );
  if (
    response.name !== HMAC_KEYS.SOURCE_MANIFEST_ATTESTATION ||
    response.success !== true ||
    response.verifiedDataCrc32c !== true ||
    response.verifiedMacCrc32c !== true ||
    response.verifiedSuccessIntegrity !== true ||
    response.protectionLevel !== "SOFTWARE"
  ) {
    throw unavailable();
  }
}

function validateHmacRequest(value: unknown, sourceRevisionSha256: string) {
  const object = exactDataRecord(value, [
    "purpose",
    "algorithm",
    "version",
    "sourceRevisionSha256",
    "bindingSha256",
  ]);
  if (
    (object.purpose !== "VERCEL_WORKLOAD_IDENTITY_BINDING" &&
      object.purpose !== "VERCEL_DEPLOYMENT_SOURCE_TARGET_BINDING" &&
      object.purpose !== "SUPABASE_PROJECT_REF_BINDING") ||
    object.algorithm !== "HMAC-SHA256" ||
    object.version !==
      "mac.communication-note.preview.platform.2026-09-01.m1t.v1" ||
    object.sourceRevisionSha256 !== sourceRevisionSha256
  ) {
    throw unavailable();
  }
  return Object.freeze({
    purpose: object.purpose,
    algorithm: "HMAC-SHA256" as const,
    version:
      "mac.communication-note.preview.platform.2026-09-01.m1t.v1" as const,
    sourceRevisionSha256,
    bindingSha256: requireSha256(object.bindingSha256),
  });
}

function validateManagementSecretRequest(
  value: unknown,
  workload: VerifiedWorkload,
) {
  const object = exactDataRecord(value, [
    "purpose",
    "managementApiOrigin",
    "authorizationModel",
    "oauthScope",
    "oauthAppReferenceSha256",
    "oauthGrantReferenceSha256",
    "scopeAttestationSource",
    "endpointAllowlistEnforced",
    "productionProjectRef",
    "targetProjectRef",
    "sourceRevisionSha256",
    "deploymentIdentityEvidenceSha256",
    "sourceManifestEvidenceSha256",
  ]);
  if (
    object.purpose !==
      "CONSUME_SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" ||
    object.managementApiOrigin !== "https://api.supabase.com" ||
    object.authorizationModel !== "SUPABASE_OAUTH_APP_SCOPE" ||
    object.oauthScope !== "environment:read" ||
    object.scopeAttestationSource !==
      "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" ||
    object.endpointAllowlistEnforced !== true ||
    object.productionProjectRef !== PRODUCTION_PROJECT_REF ||
    object.targetProjectRef !== workload.targetProjectRef ||
    object.targetProjectRef === PRODUCTION_PROJECT_REF ||
    object.sourceRevisionSha256 !== workload.sourceRevisionSha256 ||
    object.sourceManifestEvidenceSha256 !==
      workload.sourceManifestEvidenceSha256
  ) {
    throw unavailable();
  }
  const oauthAppReferenceSha256 = requireSha256(
    object.oauthAppReferenceSha256,
  );
  const oauthGrantReferenceSha256 = requireSha256(
    object.oauthGrantReferenceSha256,
  );
  const deploymentIdentityEvidenceSha256 = requireSha256(
    object.deploymentIdentityEvidenceSha256,
  );
  if (
    new Set([
      oauthAppReferenceSha256,
      oauthGrantReferenceSha256,
      deploymentIdentityEvidenceSha256,
      workload.sourceManifestEvidenceSha256,
    ]).size !== 4
  ) {
    throw unavailable();
  }
  return Object.freeze({
    oauthAppReferenceSha256,
    oauthGrantReferenceSha256,
  });
}

function validatePinnedCaRequest(value: unknown, workload: VerifiedWorkload) {
  const object = exactDataRecord(value, [
    "purpose",
    "tlsRootCertificateSha256",
    "sourceRevisionSha256",
    "deploymentIdentityEvidenceSha256",
    "controlPlaneEvidenceSha256",
  ]);
  if (
    object.purpose !== "LOAD_PINNED_SUPABASE_DATABASE_ROOT_CA" ||
    object.sourceRevisionSha256 !== workload.sourceRevisionSha256 ||
    object.tlsRootCertificateSha256 !==
      workload.tlsRootCertificateSha256 ||
    workload.targetProjectRef === PRODUCTION_PROJECT_REF
  ) {
    throw unavailable();
  }
  requireSha256(object.deploymentIdentityEvidenceSha256);
  requireSha256(object.controlPlaneEvidenceSha256);
  return Object.freeze({
    tlsRootCertificateSha256: requireSha256(
      object.tlsRootCertificateSha256,
    ),
  });
}

function validateDatabaseCredentialRequest(
  value: unknown,
  workload: VerifiedWorkload,
) {
  const object = exactDataRecord(value, [
    "purpose",
    "targetDescriptorSha256",
    "tlsRootCertificateSha256",
    "user",
    "applicationName",
    "credentialClass",
    "sourceExpiresAt",
    "sourceRevocation",
    "deliveryNonce",
    "deliveryExpiresNoLaterThan",
    "maximumDeliveryLifetimeMs",
    "sourceRevisionSha256",
    "deploymentIdentityEvidenceSha256",
    "controlPlaneEvidenceSha256",
    "revalidatedBranchSnapshotSha256",
  ]);
  if (
    object.purpose !== "CONSUME_STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" ||
    object.user !== "postgres" ||
    object.applicationName !==
      "careslink-preview-runtime-credential-broker-management" ||
    object.credentialClass !== "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" ||
    object.sourceExpiresAt !== null ||
    object.sourceRevocation !== "BRANCH_DELETE_OR_PASSWORD_RESET" ||
    object.maximumDeliveryLifetimeMs !== 60_000 ||
    object.sourceRevisionSha256 !== workload.sourceRevisionSha256 ||
    object.tlsRootCertificateSha256 !==
      workload.tlsRootCertificateSha256 ||
    workload.targetProjectRef === PRODUCTION_PROJECT_REF
  ) {
    throw unavailable();
  }
  requireSha256(object.targetDescriptorSha256);
  requireSha256(object.deliveryNonce);
  requireTimestamp(object.deliveryExpiresNoLaterThan);
  requireSha256(object.deploymentIdentityEvidenceSha256);
  requireSha256(object.controlPlaneEvidenceSha256);
  requireSha256(object.revalidatedBranchSnapshotSha256);
}

async function accessSecret(
  accessSecretVersion: SecretManagerClient["accessSecretVersion"],
  name: string,
  context: CallContext,
) {
  requireNotAborted(context.signal);
  if (!name.endsWith("/versions/1")) {
    throw unavailable();
  }
  const response = exactDataRecord(
    firstRpcResponse(
      await accessSecretVersion(Object.freeze({ name }), context),
    ),
    ["name", "payload"],
  );
  requireNotAborted(context.signal);
  if (response.name !== name) throw unavailable();
  const payload = exactDataRecord(response.payload, ["data", "dataCrc32c"]);
  const bytes = requireBytes(payload.data, MAXIMUM_SECRET_BYTES);
  if (requireCrc32c(payload.dataCrc32c) !== crc32c.calculate(bytes)) {
    throw unavailable();
  }
  return Uint8Array.from(bytes);
}

function validateManagementCredential(
  value: Uint8Array,
  request: Readonly<{
    oauthAppReferenceSha256: string;
    oauthGrantReferenceSha256: string;
  }>,
  now: string,
) {
  const parsed = JSON.parse(decodeSecretText(value, 16_384)) as unknown;
  const object = exactDataRecord(parsed, [
    "authorizationModel",
    "oauthScope",
    "oauthAppReferenceSha256",
    "oauthGrantReferenceSha256",
    "scopeAttestationSource",
    "endpointAllowlistEnforced",
    "accessToken",
    "principalReferenceSha256",
    "credentialReferenceSha256",
    "observedAt",
    "expiresAt",
  ]);
  if (
    object.authorizationModel !== "SUPABASE_OAUTH_APP_SCOPE" ||
    object.oauthScope !== "environment:read" ||
    object.oauthAppReferenceSha256 !== request.oauthAppReferenceSha256 ||
    object.oauthGrantReferenceSha256 !==
      request.oauthGrantReferenceSha256 ||
    object.scopeAttestationSource !==
      "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" ||
    object.endpointAllowlistEnforced !== true ||
    typeof object.accessToken !== "string" ||
    object.accessToken.length < 16 ||
    object.accessToken.length > 8_192 ||
    /[\r\n\0]/.test(object.accessToken)
  ) {
    throw unavailable();
  }
  const observedAt = requireTimestamp(object.observedAt);
  const expiresAt = requireTimestamp(object.expiresAt);
  const nowMilliseconds = Date.parse(now);
  const observedMilliseconds = Date.parse(observedAt);
  const expiresMilliseconds = Date.parse(expiresAt);
  if (
    observedMilliseconds > nowMilliseconds ||
    nowMilliseconds - observedMilliseconds >
      MAXIMUM_IDENTITY_AGE_SECONDS * 1_000 ||
    expiresMilliseconds <= observedMilliseconds ||
    expiresMilliseconds <= nowMilliseconds ||
    expiresMilliseconds >
      nowMilliseconds + MAXIMUM_IDENTITY_REMAINING_SECONDS * 1_000
  ) {
    throw unavailable();
  }
  return Object.freeze({
    accessToken: object.accessToken,
    oauthAppReferenceSha256: request.oauthAppReferenceSha256,
    oauthGrantReferenceSha256: request.oauthGrantReferenceSha256,
    principalReferenceSha256: requireSha256(
      object.principalReferenceSha256,
    ),
    credentialReferenceSha256: requireSha256(
      object.credentialReferenceSha256,
    ),
    observedAt,
    expiresAt,
  });
}

function requireVerifiedWorkload(
  value: VerifiedWorkload | undefined,
  now: Clock["now"],
) {
  if (!value || Date.parse(value.expiresAt) <= Date.parse(readClock(now))) {
    throw unavailable();
  }
  return value;
}

function validateContext(value: unknown): CallContext {
  const object = exactDataRecord(value, ["signal"]);
  if (
    nodeTypes.isProxy(object.signal) ||
    !(object.signal instanceof AbortSignal)
  ) {
    throw unavailable();
  }
  return Object.freeze({ signal: object.signal });
}

function requireSameContext(value: unknown, signal: AbortSignal) {
  const context = validateContext(value);
  if (context.signal !== signal) throw unavailable();
  requireNotAborted(signal);
  return context;
}

function validateFrozenCallablePort<T extends (...args: never[]) => unknown>(
  value: unknown,
  method: string,
  keys: readonly string[] = [method],
): T {
  const object = exactFrozenDataRecord(value, keys);
  const callable = object[method];
  if (typeof callable !== "function" || nodeTypes.isProxy(callable)) {
    throw unavailable();
  }
  return callable as T;
}

function requireIndependentPorts(
  objects: readonly unknown[],
  callables: readonly unknown[],
) {
  if (
    objects.some((object) => !Object.isFrozen(object)) ||
    new Set(objects).size !== objects.length ||
    new Set(callables).size !== callables.length
  ) {
    throw unavailable();
  }
}

function requireConsumer(value: unknown) {
  if (typeof value !== "function" || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  return value as (...args: unknown[]) => PromiseLike<void>;
}

function firstRpcResponse(value: unknown) {
  if (nodeTypes.isProxy(value) || !Array.isArray(value) || value.length === 0) {
    throw unavailable();
  }
  const first = Object.getOwnPropertyDescriptor(value, "0");
  if (!first || !("value" in first)) throw unavailable();
  return requirePlainDataRecord(first.value);
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

function exactFrozenDataRecord(value: unknown, keys: readonly string[]) {
  const object = exactDataRecord(value, keys);
  if (!Object.isFrozen(object)) throw unavailable();
  return object;
}

function requirePlainRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw unavailable();
  }
  return value as Record<string, unknown>;
}

function requirePlainDataRecord(value: unknown): Record<string, unknown> {
  const object = requirePlainRecord(value);
  if (Object.getOwnPropertySymbols(object).length !== 0) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(object);
  if (
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    throw unavailable();
  }
  return object;
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

function requireCrc32c(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffff_ffff
  ) {
    return value;
  }
  throw unavailable();
}

function validatePinnedCaPem(value: Uint8Array) {
  const pem = decodeSecretText(value, MAXIMUM_SECRET_BYTES);
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(pem)) {
    throw unavailable();
  }
  const certificates = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  if (
    !certificates ||
    certificates.length === 0 ||
    !certificates.some((certificate) => new X509Certificate(certificate).ca)
  ) {
    throw unavailable();
  }
}

function decodeSecretText(value: Uint8Array, maximumBytes: number) {
  if (value.byteLength > maximumBytes) throw unavailable();
  const text = new TextDecoder("utf-8", { fatal: true }).decode(value);
  if (new TextEncoder().encode(text).byteLength !== value.byteLength) {
    throw unavailable();
  }
  return text;
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : NaN;
  if (
    typeof value !== "string" ||
    !TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw unavailable();
  }
  return value;
}

function requireFreshExpiry(expiresAt: string, now: string) {
  const remaining = Date.parse(expiresAt) - Date.parse(now);
  if (
    remaining <= 0 ||
    remaining > MAXIMUM_OIDC_REMAINING_SECONDS * 1_000
  ) {
    throw unavailable();
  }
}

function earliestExpiry(...values: readonly string[]) {
  return values.reduce((earliest, value) =>
    Date.parse(value) < Date.parse(earliest) ? value : earliest,
  );
}

function readClock(now: Clock["now"]) {
  return requireTimestamp(now());
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

function kmsVersion(key: string) {
  return `projects/${PROJECT_ID}/locations/${LOCATION}/keyRings/${KEY_RING}/cryptoKeys/${key}/cryptoKeyVersions/1` as const;
}

function secretVersion(secret: string) {
  return `projects/${PROJECT_ID}/locations/${LOCATION}/secrets/${secret}/versions/1` as const;
}

function keyVersionBeforeNumericVersion(value: string) {
  const suffix = "/cryptoKeyVersions/1";
  if (!value.endsWith(suffix)) throw unavailable();
  return value.slice(0, -suffix.length);
}

function encodeCanonical(value: unknown) {
  return new TextEncoder().encode(canonicalJson(value));
}

function canonicalSha256(value: unknown) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
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
      "Communication Note preview GCP provider adapters are unavailable" as const,
  });
}
