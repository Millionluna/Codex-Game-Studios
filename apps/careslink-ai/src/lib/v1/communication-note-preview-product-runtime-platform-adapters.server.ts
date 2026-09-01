import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY_DIGEST,
  createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities,
} from "./communication-note-preview-product-runtime-identities.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";
import { CaresLinkV1ContractError } from "./shared-contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MANAGEMENT_API_ORIGIN = "https://api.supabase.com" as const;
const MANAGEMENT_API_TIMEOUT_MS = 5_000;
const MAXIMUM_MANAGEMENT_API_RESPONSE_BYTES = 128 * 1_024;
const MAXIMUM_IDENTITY_AGE_MS = 5 * 60 * 1_000;
const MAXIMUM_IDENTITY_REMAINING_MS = 5 * 60 * 1_000;
const MAXIMUM_DELIVERY_LIFETIME_MS = 60_000;
const MAXIMUM_CA_BYTES = 64 * 1_024;
const MAXIMUM_JSON_DEPTH = 32;
const MAXIMUM_JSON_NODES = 4_096;
const MAXIMUM_JSON_CONTAINER_ENTRIES = 1_024;
const MAXIMUM_JSON_STRING_LENGTH = 8_192;
const BRANCH_WORKFLOW_STATUSES = new Set([
  "CREATING_PROJECT",
  "RUNNING_MIGRATIONS",
  "MIGRATIONS_PASSED",
  "MIGRATIONS_FAILED",
  "FUNCTIONS_DEPLOYED",
  "FUNCTIONS_FAILED",
]);
const BRANCH_RESPONSE_KEYS = [
  "id",
  "name",
  "project_ref",
  "parent_project_ref",
  "is_default",
  "git_branch",
  "pr_number",
  "latest_check_run_id",
  "persistent",
  "status",
  "created_at",
  "updated_at",
  "review_requested_at",
  "with_data",
  "notify_url",
  "deletion_scheduled_at",
  "preview_project_status",
] as const;

const RUNTIME_IDENTITY_AUDIENCE =
  "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME" as const;
const RUNTIME_ENVIRONMENT_CLASS = "NON_PRODUCTION_PREVIEW" as const;
const MANAGEMENT_PERMISSION = "BRANCHING_DEVELOPMENT_READ" as const;
const MANAGEMENT_OAUTH_SCOPE = "environment:read" as const;
const MANAGEMENT_CREDENTIAL_CLASS =
  "SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" as const;

const WORKLOAD_HMAC_PURPOSE =
  "VERCEL_WORKLOAD_IDENTITY_BINDING" as const;
const DEPLOYMENT_HMAC_PURPOSE =
  "VERCEL_DEPLOYMENT_SOURCE_TARGET_BINDING" as const;
const PROJECT_REF_HMAC_PURPOSE =
  "SUPABASE_PROJECT_REF_BINDING" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_VERSION =
  "platform-adapters.communication.openai.synthetic-preview.2026-09-01.m1t.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_READY =
  false as const;

const PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_VERSION,
  status: "SOURCE_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_NOT_ACTIVATED",
  ready: false,
  sourceOnly: true,
  nodeRuntimeRequired: true,
  edgeRuntimeSupported: false,
  productRuntimeIdentitiesPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY_DIGEST,
  protocolImplementationPresent: true,
  cloudProviderSelected: false,
  workloadIdentityConfigured: false,
  kmsConfigured: false,
  secretManagerConfigured: false,
  liveEvidencePresent: false,
  platformProtocolPortsInjectedTestOnly: true,
  workloadProtocol:
    "VERCEL_OIDC_PLUS_MANAGED_SOURCE_MANIFEST_ATTESTATION",
  workloadEnvironment: "preview",
  workloadIdentityMaximumAgeMs: MAXIMUM_IDENTITY_AGE_MS,
  workloadIdentityMaximumRemainingMs: MAXIMUM_IDENTITY_REMAINING_MS,
  sourceRevisionClaimedByVercelOidc: false,
  sourceRevisionBinding:
    "MANAGED_SOURCE_MANIFEST_ATTESTATION_REQUIRED_IN_ADDITION_TO_OIDC",
  supabaseManagementApiOrigin: MANAGEMENT_API_ORIGIN,
  supabaseManagementApiAllowedMethod: "GET",
  supabaseManagementApiAllowedPath:
    "/v1/projects/{production_ref}/branches",
  supabaseBranchConfigPathAllowed: false,
  supabaseBranchConfigPathReason:
    "OFFICIAL_RESPONSE_CONTAINS_DB_PASS_AND_JWT_SECRET",
  supabaseManagementOAuthScope: MANAGEMENT_OAUTH_SCOPE,
  supabaseManagementRequiredPermission: MANAGEMENT_PERMISSION,
  supabaseManagementPatAllowed: false,
  supabaseManagementMaximumResponseBytes:
    MAXIMUM_MANAGEMENT_API_RESPONSE_BYTES,
  supabaseManagementTimeoutMs: MANAGEMENT_API_TIMEOUT_MS,
  supabaseManagementRedirectsAllowed: false,
  supabaseManagementAutomaticRetries: 0,
  controlPlaneConsistency:
    "EXACT_SAFE_BRANCH_SNAPSHOT_RECHECK_BEFORE_DATABASE_CREDENTIAL_RELEASE",
  postgresMajor: 17,
  postgresMajorSource:
    "DEPLOYMENT_ATTESTED_SOURCE_PIN_AND_DATABASE_SESSION_RECHECK",
  allowedConnectionModes: ["DIRECT"],
  directEndpointDerivation: "db.{child_ref}.supabase.co:5432/postgres",
  projectRefMac:
    "PURPOSE_SEPARATED_MANAGED_HMAC_SHA256_OVER_CANONICAL_BINDING",
  pinnedCaCustody: "DIGEST_BOUND_CALLBACK_FREE_BYTE_LOAD",
  databaseCredentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
  underlyingDatabaseCredentialShortLived: false,
  databaseCredentialSourceExpiresAt: null,
  databaseCredentialSourceRevocation:
    "BRANCH_DELETE_OR_PASSWORD_RESET",
  databaseCredentialDeliveryEnvelopeSingleUse: true,
  databaseCredentialMaximumDeliveryLifetimeMs:
    MAXIMUM_DELIVERY_LIFETIME_MS,
  processMemoryZeroizationAttested: false,
  rawIdentityTokenReturned: false,
  rawManagementTokenReturned: false,
  rawDatabaseCredentialReturned: false,
  rawControlPlaneResponseReturned: false,
  productRouteImporterPresent: false,
  productionTargetAllowed: false,
  productionMigrationApproved: false,
  deploymentApproved: false,
  activationApproved: false,
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_DIGEST =
  "0ff4bcf1c82575d037793c344c9679d10b6c8018abd3b0b050d040860100624c" as const;

const actualPolicyDigest = canonicalSha256(
  PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_CORE,
);
if (
  actualPolicyDigest !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY =
  deepFreeze({
    ...PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_POLICY_DIGEST,
  });

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_PLATFORM_ADAPTERS =
  undefined as
    | Awaited<
        ReturnType<
          typeof createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities
        >
      >
    | undefined;

export async function createCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters(
  _value: unknown,
  _context: unknown,
): Promise<never> {
  void _value;
  void _context;
  throw unavailable();
}

/**
 * Source-only platform protocol composition. Provider SDKs and cloud resources
 * remain outside this module. The only usable path accepts explicit low-level
 * ports, implements their bounded protocol wrappers and delegates to M1s.
 */
export async function createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters(
  value: unknown,
  contextValue: unknown,
): ReturnType<
  typeof createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities
> {
  try {
    const options = exactDataRecord(value, [
      "capability",
      "expectedSourceRevisionSha256",
      "platformRequest",
      "targetRequest",
      "workloadIdentityVerifierPort",
      "supabaseManagementCredentialPort",
      "supabaseManagementHttpsPort",
      "managedHmacPort",
      "pinnedCaCustodyPort",
      "databaseCredentialCustodyPort",
      "verifiedAuthorization",
      "custodyResolver",
      "clock",
      "entropy",
    ]);
    if (
      options.capability !==
      "TEST_ONLY_M1T_PRODUCT_RUNTIME_PLATFORM_ADAPTERS"
    ) {
      throw unavailable();
    }

    const expectedSourceRevisionSha256 = requireSha256(
      options.expectedSourceRevisionSha256,
    );
    const platformRequest = validatePlatformRequest(options.platformRequest);
    const targetRequest = validateTargetRequest(options.targetRequest);
    const verifyWorkloadIdentity = validateFrozenCallablePort<
      WorkloadIdentityVerifierPort["verify"]
    >(options.workloadIdentityVerifierPort, "verify");
    const consumeManagementCredential = validateFrozenCallablePort<
      SupabaseManagementCredentialPort["consume"]
    >(options.supabaseManagementCredentialPort, "consume");
    const requestManagementApi = validateFrozenCallablePort<
      SupabaseManagementHttpsPort["request"]
    >(options.supabaseManagementHttpsPort, "request");
    const managedHmac = validateFrozenCallablePort<ManagedHmacPort["hmac"]>(
      options.managedHmacPort,
      "hmac",
    );
    const loadPinnedCa = validateFrozenCallablePort<
      PinnedCaCustodyPort["load"]
    >(options.pinnedCaCustodyPort, "load");
    const consumeDatabaseCredential = validateFrozenCallablePort<
      DatabaseCredentialCustodyPort["consume"]
    >(options.databaseCredentialCustodyPort, "consume");
    const verifiedAuthorization = options.verifiedAuthorization;
    const custodyResolver = options.custodyResolver;
    const custodyResolve = validateFrozenCallablePort<
      (request: unknown, context: CallContext) => PromiseLike<unknown>
    >(custodyResolver, "resolve");
    const clock = validateClock(options.clock);
    const entropy = options.entropy;
    const entropyBytes = validateFrozenCallablePort<
      (length: number) => Uint8Array
    >(entropy, "bytes");
    requireIndependentPorts(
      [
        options.workloadIdentityVerifierPort,
        options.supabaseManagementCredentialPort,
        options.supabaseManagementHttpsPort,
        options.managedHmacPort,
        options.pinnedCaCustodyPort,
        options.databaseCredentialCustodyPort,
        custodyResolver,
        options.clock,
        entropy,
      ],
      [
        verifyWorkloadIdentity,
        consumeManagementCredential,
        requestManagementApi,
        managedHmac,
        loadPinnedCa,
        consumeDatabaseCredential,
        custodyResolve,
        clock.source,
        entropyBytes,
      ],
    );
    if (
      new Set([
        expectedSourceRevisionSha256,
        platformRequest.sourceManifestSha256,
        platformRequest.vercelTeamIdSha256,
        platformRequest.vercelProjectIdSha256,
        targetRequest.tlsRootCertificateSha256,
      ]).size !== 5
    ) {
      throw unavailable();
    }

    const context = validateContext(contextValue);
    let workloadBinding: WorkloadBinding | undefined;
    let workloadStarted = false;
    let controlPlaneBinding: ControlPlaneBinding | undefined;
    let controlPlaneStarted = false;
    let projectRefKeyReferenceSha256: string | undefined;

    const deploymentIdentityAttestationPort = Object.freeze({
      async attest(requestValue: unknown, callContextValue: unknown) {
        try {
          if (workloadBinding || workloadStarted) throw unavailable();
          workloadStarted = true;
          const request = validateM1sDeploymentIdentityRequest(
            requestValue,
            expectedSourceRevisionSha256,
            targetRequest,
          );
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          requireNotAborted(callContext.signal);
          const verified = validateVerifiedWorkloadIdentity(
            await verifyWorkloadIdentity(
              Object.freeze({
                purpose:
                  "VERIFY_VERCEL_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST" as const,
                audience: RUNTIME_IDENTITY_AUDIENCE,
                environmentClass: RUNTIME_ENVIRONMENT_CLASS,
                vercelEnvironment: "preview" as const,
                vercelTeamIdSha256:
                  platformRequest.vercelTeamIdSha256,
                vercelProjectIdSha256:
                  platformRequest.vercelProjectIdSha256,
                sourceRevisionSha256: expectedSourceRevisionSha256,
                sourceManifestSha256:
                  platformRequest.sourceManifestSha256,
                postgresMajor: platformRequest.postgresMajor,
                connectionMode: platformRequest.connectionMode,
                targetProjectRef: targetRequest.targetProjectRef,
                tlsRootCertificateSha256:
                  targetRequest.tlsRootCertificateSha256,
              }),
              callContext,
            ),
            platformRequest,
            expectedSourceRevisionSha256,
            readClock(clock),
          );
          requireNotAborted(callContext.signal);

          const workloadMac = await invokeManagedHmac(
            managedHmac,
            WORKLOAD_HMAC_PURPOSE,
            canonicalSha256({
              domain:
                "careslink.communication-note.preview.vercel-workload.m1t.v1",
              request,
              verified,
            }),
            expectedSourceRevisionSha256,
            callContext,
          );
          requireNotAborted(callContext.signal);
          const deploymentMac = await invokeManagedHmac(
            managedHmac,
            DEPLOYMENT_HMAC_PURPOSE,
            canonicalSha256({
              domain:
                "careslink.communication-note.preview.deployment-source-target.m1t.v1",
              request,
              sourceManifestEvidenceSha256:
                verified.sourceManifestEvidenceSha256,
              workloadPrincipalReferenceSha256:
                verified.workloadPrincipalReferenceSha256,
              deploymentReferenceSha256:
                verified.deploymentReferenceSha256,
            }),
            expectedSourceRevisionSha256,
            callContext,
          );
          requireNotAborted(callContext.signal);
          if (
            workloadMac.macSha256 === deploymentMac.macSha256 ||
            workloadMac.keyReferenceSha256 ===
              deploymentMac.keyReferenceSha256
          ) {
            throw unavailable();
          }
          const attestationEvidenceSha256 = canonicalSha256({
            domain:
              "careslink.communication-note.preview.platform-deployment-attestation.m1t.v1",
            request,
            verified,
            workloadMac,
            deploymentMac,
          });
          const observedAt = readClock(clock);
          requireIdentityFreshness(
            verified.observedAt,
            verified.expiresAt,
            observedAt,
          );
          workloadBinding = Object.freeze({
            verified,
            attestationEvidenceSha256,
            expiresAt: verified.expiresAt,
          });
          return Object.freeze({
            status:
              "ATTESTED_DEPLOYMENT_IDENTITY_NOT_APPROVED" as const,
            source: "INJECTED_WORKLOAD_IDENTITY_ATTESTATION" as const,
            audience: RUNTIME_IDENTITY_AUDIENCE,
            environmentClass: RUNTIME_ENVIRONMENT_CLASS,
            sourceRevisionSha256: expectedSourceRevisionSha256,
            workloadIdentityHmacSha256: workloadMac.macSha256,
            deploymentHmacSha256: deploymentMac.macSha256,
            attestationEvidenceSha256,
            observedAt,
            expiresAt: verified.expiresAt,
            rawCredentialMaterialPresent: false as const,
          });
        } catch {
          throw unavailable();
        }
      },
    });

    const authenticatedControlPlaneObservationPort = Object.freeze({
      async observe(requestValue: unknown, callContextValue: unknown) {
        try {
          if (controlPlaneBinding || controlPlaneStarted) throw unavailable();
          controlPlaneStarted = true;
          const binding = requireWorkloadBinding(workloadBinding, clock);
          const request = validateM1sControlPlaneRequest(
            requestValue,
            expectedSourceRevisionSha256,
            targetRequest.targetProjectRef,
          );
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          const result = await observeSafeBranch({
            consumeManagementCredential,
            requestManagementApi,
            request,
            platformRequest,
            targetRequest,
            sourceManifestEvidenceSha256:
              binding.verified.sourceManifestEvidenceSha256,
            clock,
            context: callContext,
          });
          requireNotAborted(callContext.signal);
          const expiresAt = minimumTimestamp([
            result.credential.expiresAt,
            binding.expiresAt,
            new Date(
              Date.parse(result.observedAt) + MAXIMUM_IDENTITY_REMAINING_MS,
            ).toISOString(),
          ]);
          if (Date.parse(expiresAt) <= Date.parse(result.observedAt)) {
            throw unavailable();
          }
          const observationEvidenceSha256 = canonicalSha256({
            domain:
              "careslink.communication-note.preview.safe-supabase-branch-observation.m1t.v1",
            sourceRevisionSha256: expectedSourceRevisionSha256,
            deploymentIdentityEvidenceSha256:
              request.deploymentIdentityEvidenceSha256,
            sourceManifestEvidenceSha256:
              binding.verified.sourceManifestEvidenceSha256,
            managementRequest: result.managementRequest,
            credential: result.credential,
            branch: result.branch,
            postgresMajorSource:
              "DEPLOYMENT_ATTESTED_SOURCE_PIN_AND_DATABASE_SESSION_RECHECK",
          });
          const identity = Object.freeze({
            status:
              "AUTHENTICATED_CONTROL_PLANE_IDENTITY_NOT_APPROVED" as const,
            source: "SUPABASE_MANAGEMENT_API" as const,
            audience: "SUPABASE_MANAGEMENT_API" as const,
            permission: MANAGEMENT_PERMISSION,
            principalReferenceSha256:
              result.credential.principalReferenceSha256,
            credentialReferenceSha256:
              result.credential.credentialReferenceSha256,
            issuedAt: result.observedAt,
            expiresAt,
            rawCredentialMaterialPresent: false as const,
          });
          const observation = Object.freeze({
            source: "SUPABASE_CONTROL_PLANE" as const,
            targetProjectRef: targetRequest.targetProjectRef,
            parentProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
            defaultBranch: false as const,
            persistent: false as const,
            withData: false as const,
            postgresMajor: 17 as const,
            projectStatus: "ACTIVE_HEALTHY" as const,
            observedAt: result.observedAt,
            expiresAt,
            observationEvidenceSha256,
            tlsRootCertificateSha256:
              targetRequest.tlsRootCertificateSha256,
            endpoint: Object.freeze({
              connectionMode: "DIRECT" as const,
              hostname:
                `db.${targetRequest.targetProjectRef}.supabase.co`,
              port: 5432 as const,
              database: "postgres" as const,
              usernameProjectRefSuffix: null,
            }),
            rawCredentialMaterialPresent: false as const,
          });
          const m1sControlPlaneEvidenceSha256 = canonicalSha256({
            domain:
              "careslink.communication-note.preview.authenticated-control-plane-evidence.m1s.v1",
            sourceRevisionSha256: expectedSourceRevisionSha256,
            deploymentIdentityEvidenceSha256:
              request.deploymentIdentityEvidenceSha256,
            identity,
            observation,
          });
          controlPlaneBinding = Object.freeze({
            deploymentIdentityEvidenceSha256:
              request.deploymentIdentityEvidenceSha256,
            snapshotSha256: result.snapshotSha256,
            principalReferenceSha256:
              result.credential.principalReferenceSha256,
            observationEvidenceSha256,
            m1sControlPlaneEvidenceSha256,
            observedAt: result.observedAt,
            expiresAt,
          });
          return Object.freeze({
            identity,
            observation,
          });
        } catch {
          throw unavailable();
        }
      },
    });

    const projectRefHmacPort = Object.freeze({
      async hmac(requestValue: unknown, callContextValue: unknown) {
        try {
          const workload = requireWorkloadBinding(workloadBinding, clock);
          const control = requireControlPlaneBinding(
            controlPlaneBinding,
            workload,
            clock,
          );
          const request = validateM1sProjectRefHmacRequest(
            requestValue,
            expectedSourceRevisionSha256,
            control,
          );
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          if (
            request.projectRef !== targetRequest.targetProjectRef &&
            request.projectRef !== CARESLINK_PRODUCTION_SUPABASE_REF
          ) {
            throw unavailable();
          }
          const result = await invokeManagedHmac(
            managedHmac,
            PROJECT_REF_HMAC_PURPOSE,
            canonicalSha256({
              domain:
                "careslink.communication-note.preview.supabase-project-ref.m1t.v1",
              request,
            }),
            expectedSourceRevisionSha256,
            callContext,
          );
          requireNotAborted(callContext.signal);
          if (
            projectRefKeyReferenceSha256 &&
            projectRefKeyReferenceSha256 !== result.keyReferenceSha256
          ) {
            throw unavailable();
          }
          projectRefKeyReferenceSha256 = result.keyReferenceSha256;
          return Object.freeze({
            projectRefHmac: result.macSha256,
            keyReferenceSha256: result.keyReferenceSha256,
            rawKeyMaterialPresent: false as const,
          });
        } catch {
          throw unavailable();
        }
      },
    });

    const pinnedCaLoader = Object.freeze({
      async load(requestValue: unknown, callContextValue: unknown) {
        try {
          const workload = requireWorkloadBinding(workloadBinding, clock);
          const control = requireControlPlaneBinding(
            controlPlaneBinding,
            workload,
            clock,
          );
          const request = validateM1sPinnedCaRequest(
            requestValue,
            expectedSourceRevisionSha256,
            targetRequest,
            control,
          );
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          requireNotAborted(callContext.signal);
          const result = exactDataRecord(
            await loadPinnedCa(
              Object.freeze({
                purpose:
                  "LOAD_PINNED_SUPABASE_DATABASE_ROOT_CA" as const,
                ...request,
              }),
              callContext,
            ),
            [
              "tlsRootCertificate",
              "custodyReferenceSha256",
              "rawCredentialMaterialPresent",
            ],
          );
          requireNotAborted(callContext.signal);
          if (
            result.rawCredentialMaterialPresent !== false ||
            !(result.tlsRootCertificate instanceof Uint8Array) ||
            nodeTypes.isProxy(result.tlsRootCertificate) ||
            result.tlsRootCertificate.byteLength === 0 ||
            result.tlsRootCertificate.byteLength > MAXIMUM_CA_BYTES ||
            bytesSha256(result.tlsRootCertificate) !==
              targetRequest.tlsRootCertificateSha256
          ) {
            throw unavailable();
          }
          requireSha256(result.custodyReferenceSha256);
          return Object.freeze({
            tlsRootCertificate: Uint8Array.from(
              result.tlsRootCertificate,
            ),
            rawCredentialMaterialPresent: false as const,
          });
        } catch {
          throw unavailable();
        }
      },
    });

    const managementCredentialCustodyPort = Object.freeze({
      async consume(
        requestValue: unknown,
        callContextValue: unknown,
        consumerValue: unknown,
      ) {
        try {
          const workload = requireWorkloadBinding(workloadBinding, clock);
          const control = requireControlPlaneBinding(
            controlPlaneBinding,
            workload,
            clock,
          );
          const request = validateM1sDatabaseCredentialRequest(
            requestValue,
            expectedSourceRevisionSha256,
            targetRequest,
            control,
          );
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          if (
            typeof consumerValue !== "function" ||
            nodeTypes.isProxy(consumerValue)
          ) {
            throw unavailable();
          }
          const consumer = consumerValue as (
            value: unknown,
          ) => PromiseLike<void>;

          const recheck = await observeSafeBranch({
            consumeManagementCredential,
            requestManagementApi,
            request: Object.freeze({
              purpose:
                "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHENTICATED_TARGET_OBSERVATION" as const,
              source: "SUPABASE_MANAGEMENT_API" as const,
              targetProjectRef: targetRequest.targetProjectRef,
              sourceRevisionSha256: expectedSourceRevisionSha256,
              deploymentIdentityEvidenceSha256:
                control.deploymentIdentityEvidenceSha256,
            }),
            platformRequest,
            targetRequest,
            sourceManifestEvidenceSha256:
              workload.verified.sourceManifestEvidenceSha256,
            clock,
            context: callContext,
          });
          requireNotAborted(callContext.signal);
          if (
            recheck.snapshotSha256 !== control.snapshotSha256 ||
            recheck.credential.principalReferenceSha256 !==
              control.principalReferenceSha256
          ) {
            throw unavailable();
          }

          let callbackCount = 0;
          let callbackOpen = true;
          let callbackViolation = false;
          let callbackPromise: Promise<void> | undefined;
          const secretConsumer = (secretValue: unknown): Promise<void> => {
            if (!callbackOpen || callbackCount !== 0) {
              callbackViolation = true;
              const denied = Promise.reject(unavailable());
              void denied.catch(() => undefined);
              return denied;
            }
            callbackCount += 1;
            const operation = (async () => {
              requireNotAborted(callContext.signal);
              let password: string | undefined = requireDatabasePassword(
                secretValue,
              );
              try {
                const deliveryIssuedAt = readClock(clock);
                const deliveryExpiresAt = new Date(
                  Math.min(
                    Date.parse(deliveryIssuedAt) +
                      MAXIMUM_DELIVERY_LIFETIME_MS,
                    Date.parse(request.deliveryExpiresNoLaterThan),
                  ),
                ).toISOString();
                if (
                  Date.parse(deliveryExpiresAt) <=
                  Date.parse(deliveryIssuedAt)
                ) {
                  throw unavailable();
                }
                requireNotAborted(callContext.signal);
                await consumer(
                  Object.freeze({
                    targetDescriptorSha256:
                      request.targetDescriptorSha256,
                    tlsRootCertificateSha256:
                      request.tlsRootCertificateSha256,
                    user: request.user,
                    applicationName: request.applicationName,
                    credentialClass: request.credentialClass,
                    sourceExpiresAt: null,
                    sourceRevocation: request.sourceRevocation,
                    deliveryNonce: request.deliveryNonce,
                    password,
                    deliveryIssuedAt,
                    deliveryExpiresAt,
                    deliveryOneUse: true as const,
                    rawDsnPresent: false as const,
                  }),
                );
                requireNotAborted(callContext.signal);
              } finally {
                password = undefined;
              }
            })();
            callbackPromise = operation;
            void operation.catch(() => undefined);
            return operation;
          };
          let result: unknown;
          try {
            result = await consumeDatabaseCredential(
              Object.freeze({
                ...request,
                purpose:
                  "CONSUME_STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" as const,
                revalidatedBranchSnapshotSha256: recheck.snapshotSha256,
              }),
              callContext,
              secretConsumer,
            );
          } finally {
            callbackOpen = false;
          }
          if (
            callbackViolation ||
            result !== undefined ||
            callbackCount !== 1 ||
            !callbackPromise
          ) {
            throw unavailable();
          }
          await callbackPromise;
          if (callbackViolation || callbackCount !== 1) {
            throw unavailable();
          }
          requireNotAborted(callContext.signal);
        } catch {
          throw unavailable();
        }
      },
    });

    return await createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
      {
        capability: "TEST_ONLY_M1S_PRODUCT_RUNTIME_IDENTITIES",
        expectedSourceRevisionSha256,
        deploymentIdentityAttestationPort,
        authenticatedControlPlaneObservationPort,
        projectRefHmacPort,
        pinnedCaLoader,
        managementCredentialCustodyPort,
        targetRequest,
        verifiedAuthorization,
        custodyResolver,
        clock: Object.freeze({ now: clock.now }),
        entropy,
      },
      context,
    );
  } catch {
    throw unavailable();
  }
}

type CallContext = Readonly<{ signal: AbortSignal }>;
type Clock = Readonly<{
  source: () => string;
  now: () => string;
}>;
type PlatformRequest = Readonly<{
  vercelTeamIdSha256: string;
  vercelProjectIdSha256: string;
  sourceManifestSha256: string;
  vercelEnvironment: "preview";
  postgresMajor: 17;
  connectionMode: "DIRECT";
  managementCredentialClass: typeof MANAGEMENT_CREDENTIAL_CLASS;
  managementOAuthScope: typeof MANAGEMENT_OAUTH_SCOPE;
  managementPermission: typeof MANAGEMENT_PERMISSION;
}>;
type TargetRequest = Readonly<{
  targetProjectRef: string;
  tlsRootCertificateSha256: string;
}>;
type VerifiedWorkloadIdentity = Readonly<{
  status:
    "VERIFIED_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST_NOT_APPROVED";
  source: "VERCEL_OIDC_WITH_MANAGED_SOURCE_MANIFEST";
  vercelTeamIdSha256: string;
  vercelProjectIdSha256: string;
  vercelEnvironment: "preview";
  sourceRevisionSha256: string;
  sourceManifestSha256: string;
  postgresMajor: 17;
  connectionMode: "DIRECT";
  workloadPrincipalReferenceSha256: string;
  deploymentReferenceSha256: string;
  sourceManifestEvidenceSha256: string;
  observedAt: string;
  expiresAt: string;
  rawIdentityCredentialMaterialPresent: false;
}>;
type WorkloadBinding = Readonly<{
  verified: VerifiedWorkloadIdentity;
  attestationEvidenceSha256: string;
  expiresAt: string;
}>;
type ControlPlaneBinding = Readonly<{
  deploymentIdentityEvidenceSha256: string;
  snapshotSha256: string;
  principalReferenceSha256: string;
  observationEvidenceSha256: string;
  m1sControlPlaneEvidenceSha256: string;
  observedAt: string;
  expiresAt: string;
}>;
type ManagementCredentialAttestation = Readonly<{
  status: "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED";
  source: "MANAGED_SECRET_CUSTODY";
  credentialClass: typeof MANAGEMENT_CREDENTIAL_CLASS;
  oauthScope: typeof MANAGEMENT_OAUTH_SCOPE;
  permission: typeof MANAGEMENT_PERMISSION;
  principalReferenceSha256: string;
  credentialReferenceSha256: string;
  observedAt: string;
  expiresAt: string;
  rawCredentialMaterialPresent: false;
}>;
type SafeBranchSnapshot = Readonly<{
  id: string;
  projectRef: string;
  parentProjectRef: string;
  defaultBranch: false;
  persistent: false;
  withData: false;
  status: "ACTIVE_HEALTHY";
}>;
type WorkloadIdentityVerifierPort = Readonly<{
  verify: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ) => PromiseLike<unknown>;
}>;
type SupabaseManagementCredentialPort = Readonly<{
  consume: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
    consumer: (
      credential: unknown,
      attestation: unknown,
    ) => PromiseLike<void>,
  ) => PromiseLike<unknown>;
}>;
type SupabaseManagementHttpsPort = Readonly<{
  request: (
    request: Readonly<Record<string, unknown>>,
    accessToken: string,
    context: CallContext,
  ) => PromiseLike<unknown>;
}>;
type ManagedHmacPort = Readonly<{
  hmac: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ) => PromiseLike<unknown>;
}>;
type PinnedCaCustodyPort = Readonly<{
  load: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ) => PromiseLike<unknown>;
}>;
type DatabaseCredentialCustodyPort = Readonly<{
  consume: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
    consumer: (credential: unknown) => PromiseLike<void>,
  ) => PromiseLike<unknown>;
}>;

function validatePlatformRequest(value: unknown): PlatformRequest {
  const object = exactFrozenDataRecord(value, [
    "vercelTeamIdSha256",
    "vercelProjectIdSha256",
    "sourceManifestSha256",
    "vercelEnvironment",
    "postgresMajor",
    "connectionMode",
    "managementCredentialClass",
    "managementOAuthScope",
    "managementPermission",
  ]);
  if (
    object.vercelEnvironment !== "preview" ||
    object.postgresMajor !== 17 ||
    object.connectionMode !== "DIRECT" ||
    object.managementCredentialClass !== MANAGEMENT_CREDENTIAL_CLASS ||
    object.managementOAuthScope !== MANAGEMENT_OAUTH_SCOPE ||
    object.managementPermission !== MANAGEMENT_PERMISSION
  ) {
    throw unavailable();
  }
  return Object.freeze({
    vercelTeamIdSha256: requireSha256(object.vercelTeamIdSha256),
    vercelProjectIdSha256: requireSha256(object.vercelProjectIdSha256),
    sourceManifestSha256: requireSha256(object.sourceManifestSha256),
    vercelEnvironment: "preview" as const,
    postgresMajor: 17 as const,
    connectionMode: "DIRECT" as const,
    managementCredentialClass: MANAGEMENT_CREDENTIAL_CLASS,
    managementOAuthScope: MANAGEMENT_OAUTH_SCOPE,
    managementPermission: MANAGEMENT_PERMISSION,
  });
}

function validateTargetRequest(value: unknown): TargetRequest {
  const object = exactFrozenDataRecord(value, [
    "targetProjectRef",
    "tlsRootCertificateSha256",
  ]);
  if (
    typeof object.targetProjectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(object.targetProjectRef) ||
    object.targetProjectRef === CARESLINK_PRODUCTION_SUPABASE_REF
  ) {
    throw unavailable();
  }
  return Object.freeze({
    targetProjectRef: object.targetProjectRef,
    tlsRootCertificateSha256: requireSha256(
      object.tlsRootCertificateSha256,
    ),
  });
}

function validateM1sDeploymentIdentityRequest(
  value: unknown,
  sourceRevisionSha256: string,
  targetRequest: TargetRequest,
) {
  const object = exactDataRecord(value, [
    "purpose",
    "audience",
    "environmentClass",
    "sourceRevisionSha256",
    "targetProjectRef",
    "tlsRootCertificateSha256",
  ]);
  if (
    object.purpose !==
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME_IDENTITY" ||
    object.audience !== RUNTIME_IDENTITY_AUDIENCE ||
    object.environmentClass !== RUNTIME_ENVIRONMENT_CLASS ||
    object.sourceRevisionSha256 !== sourceRevisionSha256 ||
    object.targetProjectRef !== targetRequest.targetProjectRef ||
    object.tlsRootCertificateSha256 !==
      targetRequest.tlsRootCertificateSha256
  ) {
    throw unavailable();
  }
  return Object.freeze({
    purpose:
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME_IDENTITY" as const,
    audience: RUNTIME_IDENTITY_AUDIENCE,
    environmentClass: RUNTIME_ENVIRONMENT_CLASS,
    sourceRevisionSha256,
    targetProjectRef: targetRequest.targetProjectRef,
    tlsRootCertificateSha256:
      targetRequest.tlsRootCertificateSha256,
  });
}

function validateVerifiedWorkloadIdentity(
  value: unknown,
  platformRequest: PlatformRequest,
  sourceRevisionSha256: string,
  now: string,
): VerifiedWorkloadIdentity {
  const object = exactDataRecord(value, [
    "status",
    "source",
    "vercelTeamIdSha256",
    "vercelProjectIdSha256",
    "vercelEnvironment",
    "sourceRevisionSha256",
    "sourceManifestSha256",
    "postgresMajor",
    "connectionMode",
    "workloadPrincipalReferenceSha256",
    "deploymentReferenceSha256",
    "sourceManifestEvidenceSha256",
    "observedAt",
    "expiresAt",
    "rawIdentityCredentialMaterialPresent",
  ]);
  if (
    object.status !==
      "VERIFIED_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST_NOT_APPROVED" ||
    object.source !== "VERCEL_OIDC_WITH_MANAGED_SOURCE_MANIFEST" ||
    object.vercelTeamIdSha256 !== platformRequest.vercelTeamIdSha256 ||
    object.vercelProjectIdSha256 !==
      platformRequest.vercelProjectIdSha256 ||
    object.vercelEnvironment !== "preview" ||
    object.sourceRevisionSha256 !== sourceRevisionSha256 ||
    object.sourceManifestSha256 !== platformRequest.sourceManifestSha256 ||
    object.postgresMajor !== platformRequest.postgresMajor ||
    object.connectionMode !== platformRequest.connectionMode ||
    object.rawIdentityCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const observedAt = requireTimestamp(object.observedAt);
  const expiresAt = requireTimestamp(object.expiresAt);
  requireIdentityFreshness(observedAt, expiresAt, now);
  const result = Object.freeze({
    status:
      "VERIFIED_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST_NOT_APPROVED" as const,
    source: "VERCEL_OIDC_WITH_MANAGED_SOURCE_MANIFEST" as const,
    vercelTeamIdSha256: platformRequest.vercelTeamIdSha256,
    vercelProjectIdSha256: platformRequest.vercelProjectIdSha256,
    vercelEnvironment: "preview" as const,
    sourceRevisionSha256,
    sourceManifestSha256: platformRequest.sourceManifestSha256,
    postgresMajor: 17 as const,
    connectionMode: "DIRECT" as const,
    workloadPrincipalReferenceSha256: requireSha256(
      object.workloadPrincipalReferenceSha256,
    ),
    deploymentReferenceSha256: requireSha256(
      object.deploymentReferenceSha256,
    ),
    sourceManifestEvidenceSha256: requireSha256(
      object.sourceManifestEvidenceSha256,
    ),
    observedAt,
    expiresAt,
    rawIdentityCredentialMaterialPresent: false as const,
  });
  if (new Set(Object.values(result).filter(isSha256)).size !== 7) {
    throw unavailable();
  }
  return result;
}

async function invokeManagedHmac(
  hmac: ManagedHmacPort["hmac"],
  purpose:
    | typeof WORKLOAD_HMAC_PURPOSE
    | typeof DEPLOYMENT_HMAC_PURPOSE
    | typeof PROJECT_REF_HMAC_PURPOSE,
  bindingSha256: string,
  sourceRevisionSha256: string,
  context: CallContext,
) {
  requireNotAborted(context.signal);
  const object = exactDataRecord(
    await hmac(
      Object.freeze({
        purpose,
        algorithm: "HMAC-SHA256" as const,
        version:
          "mac.communication-note.preview.platform.2026-09-01.m1t.v1" as const,
        sourceRevisionSha256,
        bindingSha256,
      }),
      context,
    ),
    [
      "status",
      "purpose",
      "macSha256",
      "keyReferenceSha256",
      "keyVersionSha256",
      "rawKeyMaterialPresent",
    ],
  );
  requireNotAborted(context.signal);
  if (
    object.status !== "MANAGED_HMAC_SHA256_NOT_APPROVED" ||
    object.purpose !== purpose ||
    object.rawKeyMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const result = Object.freeze({
    purpose,
    macSha256: requireSha256(object.macSha256),
    keyReferenceSha256: requireSha256(object.keyReferenceSha256),
    keyVersionSha256: requireSha256(object.keyVersionSha256),
    rawKeyMaterialPresent: false as const,
  });
  if (
    new Set([
      result.macSha256,
      result.keyReferenceSha256,
      result.keyVersionSha256,
      bindingSha256,
      sourceRevisionSha256,
    ]).size !== 5
  ) {
    throw unavailable();
  }
  return result;
}

function validateM1sControlPlaneRequest(
  value: unknown,
  sourceRevisionSha256: string,
  targetProjectRef: string,
) {
  const object = exactDataRecord(value, [
    "purpose",
    "source",
    "targetProjectRef",
    "sourceRevisionSha256",
    "deploymentIdentityEvidenceSha256",
  ]);
  if (
    object.purpose !==
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHENTICATED_TARGET_OBSERVATION" ||
    object.source !== "SUPABASE_MANAGEMENT_API" ||
    object.targetProjectRef !== targetProjectRef ||
    object.sourceRevisionSha256 !== sourceRevisionSha256
  ) {
    throw unavailable();
  }
  return Object.freeze({
    purpose:
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHENTICATED_TARGET_OBSERVATION" as const,
    source: "SUPABASE_MANAGEMENT_API" as const,
    targetProjectRef,
    sourceRevisionSha256,
    deploymentIdentityEvidenceSha256: requireSha256(
      object.deploymentIdentityEvidenceSha256,
    ),
  });
}

async function observeSafeBranch(input: {
  consumeManagementCredential: SupabaseManagementCredentialPort["consume"];
  requestManagementApi: SupabaseManagementHttpsPort["request"];
  request: Readonly<Record<string, unknown>>;
  platformRequest: PlatformRequest;
  targetRequest: TargetRequest;
  sourceManifestEvidenceSha256: string;
  clock: Clock;
  context: CallContext;
}) {
  const managementRequest = Object.freeze({
    method: "GET" as const,
    url:
      `${MANAGEMENT_API_ORIGIN}/v1/projects/${CARESLINK_PRODUCTION_SUPABASE_REF}/branches`,
    headers: Object.freeze({ accept: "application/json" as const }),
    redirect: "ERROR" as const,
    timeoutMs: MANAGEMENT_API_TIMEOUT_MS,
    maximumResponseBytes: MAXIMUM_MANAGEMENT_API_RESPONSE_BYTES,
  });
  const credentialRequest = Object.freeze({
    purpose:
      "CONSUME_SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" as const,
    managementApiOrigin: MANAGEMENT_API_ORIGIN,
    oauthScope: MANAGEMENT_OAUTH_SCOPE,
    permission: MANAGEMENT_PERMISSION,
    productionProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
    targetProjectRef: input.targetRequest.targetProjectRef,
    sourceRevisionSha256: input.request.sourceRevisionSha256,
    deploymentIdentityEvidenceSha256:
      input.request.deploymentIdentityEvidenceSha256,
    sourceManifestEvidenceSha256:
      input.sourceManifestEvidenceSha256,
  });
  let callbackCount = 0;
  let callbackOpen = true;
  let callbackViolation = false;
  let callbackPromise:
    | Promise<{
        credential: ManagementCredentialAttestation;
        branch: SafeBranchSnapshot;
        snapshotSha256: string;
        observedAt: string;
      }>
    | undefined;
  const consumer = (
    credentialValue: unknown,
    attestationValue: unknown,
  ): Promise<void> => {
    if (!callbackOpen || callbackCount !== 0) {
      callbackViolation = true;
      const denied = Promise.reject(unavailable());
      void denied.catch(() => undefined);
      return denied;
    }
    callbackCount += 1;
    const operation = (async () => {
      let accessToken: string | undefined = requireAccessToken(
        credentialValue,
      );
      try {
        const credential = validateManagementCredentialAttestation(
          attestationValue,
          input.clock,
        );
        requireNotAborted(input.context.signal);
        const response = await input.requestManagementApi(
          managementRequest,
          accessToken,
          input.context,
        );
        requireNotAborted(input.context.signal);
        const branch = validateManagementApiResponse(
          response,
          managementRequest.url,
          input.targetRequest.targetProjectRef,
        );
        const observedAt = readClock(input.clock);
        requireIdentityFreshness(
          credential.observedAt,
          credential.expiresAt,
          observedAt,
        );
        const snapshotSha256 = canonicalSha256({
          domain:
            "careslink.communication-note.preview.safe-branch-snapshot.m1t.v1",
          branch,
          sourceRevisionSha256: input.request.sourceRevisionSha256,
          sourceManifestEvidenceSha256:
            input.sourceManifestEvidenceSha256,
          postgresMajor: input.platformRequest.postgresMajor,
          connectionMode: input.platformRequest.connectionMode,
        });
        return Object.freeze({
          credential,
          branch,
          snapshotSha256,
          observedAt,
        });
      } finally {
        accessToken = undefined;
      }
    })();
    callbackPromise = operation;
    void operation.catch(() => undefined);
    return operation.then(() => undefined);
  };
  requireNotAborted(input.context.signal);
  let result: unknown;
  try {
    result = await input.consumeManagementCredential(
      credentialRequest,
      input.context,
      consumer,
    );
  } finally {
    callbackOpen = false;
  }
  if (
    callbackViolation ||
    result !== undefined ||
    callbackCount !== 1 ||
    !callbackPromise
  ) {
    throw unavailable();
  }
  const observation = await callbackPromise;
  if (callbackViolation || callbackCount !== 1) {
    throw unavailable();
  }
  requireNotAborted(input.context.signal);
  return Object.freeze({
    ...observation,
    managementRequest,
  });
}

function validateManagementCredentialAttestation(
  value: unknown,
  clock: Clock,
): ManagementCredentialAttestation {
  const object = exactDataRecord(value, [
    "status",
    "source",
    "credentialClass",
    "oauthScope",
    "permission",
    "principalReferenceSha256",
    "credentialReferenceSha256",
    "observedAt",
    "expiresAt",
    "rawCredentialMaterialPresent",
  ]);
  if (
    object.status !==
      "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED" ||
    object.source !== "MANAGED_SECRET_CUSTODY" ||
    object.credentialClass !== MANAGEMENT_CREDENTIAL_CLASS ||
    object.oauthScope !== MANAGEMENT_OAUTH_SCOPE ||
    object.permission !== MANAGEMENT_PERMISSION ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const observedAt = requireTimestamp(object.observedAt);
  const expiresAt = requireTimestamp(object.expiresAt);
  requireIdentityFreshness(observedAt, expiresAt, readClock(clock));
  const principalReferenceSha256 = requireSha256(
    object.principalReferenceSha256,
  );
  const credentialReferenceSha256 = requireSha256(
    object.credentialReferenceSha256,
  );
  if (principalReferenceSha256 === credentialReferenceSha256) {
    throw unavailable();
  }
  return Object.freeze({
    status:
      "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED" as const,
    source: "MANAGED_SECRET_CUSTODY" as const,
    credentialClass: MANAGEMENT_CREDENTIAL_CLASS,
    oauthScope: MANAGEMENT_OAUTH_SCOPE,
    permission: MANAGEMENT_PERMISSION,
    principalReferenceSha256,
    credentialReferenceSha256,
    observedAt,
    expiresAt,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateManagementApiResponse(
  value: unknown,
  expectedUrl: string,
  targetProjectRef: string,
): SafeBranchSnapshot {
  let body: Uint8Array | undefined;
  try {
    const object = exactDataRecord(value, [
      "status",
      "contentType",
      "redirected",
      "responseUrl",
      "body",
      "rawCredentialMaterialPresent",
    ]);
    if (
      object.status !== 200 ||
      (object.contentType !== "application/json" &&
        object.contentType !== "application/json; charset=utf-8") ||
      object.redirected !== false ||
      object.responseUrl !== expectedUrl ||
      object.rawCredentialMaterialPresent !== false ||
      !(object.body instanceof Uint8Array) ||
      nodeTypes.isProxy(object.body) ||
      object.body.byteLength === 0 ||
      object.body.byteLength > MAXIMUM_MANAGEMENT_API_RESPONSE_BYTES
    ) {
      throw unavailable();
    }
    body = Uint8Array.from(object.body);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    const parsed = parseStrictJson(text);
    rejectSecretBearingKeys(parsed);
    if (!Array.isArray(parsed) || parsed.length > 256) throw unavailable();
    const matches = parsed.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw unavailable();
      }
      const record = allowedDataRecord(entry, BRANCH_RESPONSE_KEYS);
      validateGeneralBranchRecord(record);
      return record.project_ref === targetProjectRef;
    });
    if (matches.length !== 1) throw unavailable();
    const target = matches[0] as Record<string, unknown>;
    if (
      typeof target.id !== "string" ||
      !UUID_PATTERN.test(target.id) ||
      target.project_ref !== targetProjectRef ||
      target.parent_project_ref !== CARESLINK_PRODUCTION_SUPABASE_REF ||
      target.is_default !== false ||
      target.persistent !== false ||
      target.with_data !== false ||
      target.preview_project_status !== "ACTIVE_HEALTHY"
    ) {
      throw unavailable();
    }
    return Object.freeze({
      id: target.id,
      projectRef: targetProjectRef,
      parentProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
      defaultBranch: false as const,
      persistent: false as const,
      withData: false as const,
      status: "ACTIVE_HEALTHY" as const,
    });
  } catch {
    throw unavailable();
  } finally {
    body?.fill(0);
    body = undefined;
  }
}

function validateGeneralBranchRecord(value: Record<string, unknown>) {
  if (
    (value.id !== undefined &&
      (typeof value.id !== "string" || !UUID_PATTERN.test(value.id))) ||
    (value.name !== undefined &&
      (typeof value.name !== "string" ||
        value.name.length === 0 ||
        value.name.length > 128)) ||
    (value.project_ref !== undefined &&
      (typeof value.project_ref !== "string" ||
        !PROJECT_REF_PATTERN.test(value.project_ref))) ||
    (value.parent_project_ref !== undefined &&
      value.parent_project_ref !== null &&
      (typeof value.parent_project_ref !== "string" ||
        !PROJECT_REF_PATTERN.test(value.parent_project_ref))) ||
    (value.is_default !== undefined &&
      typeof value.is_default !== "boolean") ||
    (value.git_branch !== undefined &&
      value.git_branch !== null &&
      typeof value.git_branch !== "string") ||
    (value.pr_number !== undefined &&
      value.pr_number !== null &&
      !Number.isSafeInteger(value.pr_number)) ||
    (value.latest_check_run_id !== undefined &&
      value.latest_check_run_id !== null &&
      (typeof value.latest_check_run_id !== "number" ||
        !Number.isFinite(value.latest_check_run_id))) ||
    (value.persistent !== undefined &&
      typeof value.persistent !== "boolean") ||
    (value.status !== undefined &&
      (typeof value.status !== "string" ||
        !BRANCH_WORKFLOW_STATUSES.has(value.status))) ||
    (value.created_at !== undefined &&
      typeof value.created_at !== "string") ||
    (value.updated_at !== undefined &&
      typeof value.updated_at !== "string") ||
    (value.review_requested_at !== undefined &&
      value.review_requested_at !== null &&
      typeof value.review_requested_at !== "string") ||
    (value.with_data !== undefined &&
      typeof value.with_data !== "boolean") ||
    (value.notify_url !== undefined &&
      value.notify_url !== null &&
      typeof value.notify_url !== "string") ||
    (value.deletion_scheduled_at !== undefined &&
      value.deletion_scheduled_at !== null &&
      typeof value.deletion_scheduled_at !== "string") ||
    (value.preview_project_status !== undefined &&
      typeof value.preview_project_status !== "string")
  ) {
    throw unavailable();
  }
}

function validateM1sProjectRefHmacRequest(
  value: unknown,
  sourceRevisionSha256: string,
  control: ControlPlaneBinding,
) {
  const object = exactDataRecord(value, [
    "purpose",
    "projectRef",
    "sourceRevisionSha256",
    "deploymentIdentityEvidenceSha256",
    "controlPlaneEvidenceSha256",
  ]);
  if (
    object.purpose !== PROJECT_REF_HMAC_PURPOSE ||
    typeof object.projectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(object.projectRef) ||
    object.sourceRevisionSha256 !== sourceRevisionSha256 ||
    object.deploymentIdentityEvidenceSha256 !==
      control.deploymentIdentityEvidenceSha256 ||
    object.controlPlaneEvidenceSha256 !==
      control.m1sControlPlaneEvidenceSha256
  ) {
    throw unavailable();
  }
  return Object.freeze({
    purpose: PROJECT_REF_HMAC_PURPOSE,
    projectRef: object.projectRef,
    sourceRevisionSha256,
    deploymentIdentityEvidenceSha256:
      control.deploymentIdentityEvidenceSha256,
    controlPlaneEvidenceSha256:
      control.m1sControlPlaneEvidenceSha256,
  });
}

function validateM1sPinnedCaRequest(
  value: unknown,
  sourceRevisionSha256: string,
  targetRequest: TargetRequest,
  control: ControlPlaneBinding,
) {
  const object = exactDataRecord(value, [
    "tlsRootCertificateSha256",
    "sourceRevisionSha256",
    "deploymentIdentityEvidenceSha256",
    "controlPlaneEvidenceSha256",
  ]);
  if (
    object.tlsRootCertificateSha256 !==
      targetRequest.tlsRootCertificateSha256 ||
    object.sourceRevisionSha256 !== sourceRevisionSha256 ||
    object.deploymentIdentityEvidenceSha256 !==
      control.deploymentIdentityEvidenceSha256 ||
    object.controlPlaneEvidenceSha256 !==
      control.m1sControlPlaneEvidenceSha256
  ) {
    throw unavailable();
  }
  return Object.freeze({
    tlsRootCertificateSha256:
      targetRequest.tlsRootCertificateSha256,
    sourceRevisionSha256,
    deploymentIdentityEvidenceSha256:
      control.deploymentIdentityEvidenceSha256,
    controlPlaneEvidenceSha256:
      control.m1sControlPlaneEvidenceSha256,
  });
}

function validateM1sDatabaseCredentialRequest(
  value: unknown,
  sourceRevisionSha256: string,
  targetRequest: TargetRequest,
  control: ControlPlaneBinding,
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
  ]);
  if (
    object.purpose !==
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANAGEMENT_SESSION" ||
    object.tlsRootCertificateSha256 !==
      targetRequest.tlsRootCertificateSha256 ||
    object.user !== "postgres" ||
    object.applicationName !==
      "careslink-preview-runtime-credential-broker-management" ||
    object.credentialClass !==
      "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" ||
    object.sourceExpiresAt !== null ||
    object.sourceRevocation !== "BRANCH_DELETE_OR_PASSWORD_RESET" ||
    object.maximumDeliveryLifetimeMs !== MAXIMUM_DELIVERY_LIFETIME_MS ||
    object.sourceRevisionSha256 !== sourceRevisionSha256 ||
    object.deploymentIdentityEvidenceSha256 !==
      control.deploymentIdentityEvidenceSha256 ||
    object.controlPlaneEvidenceSha256 !==
      control.m1sControlPlaneEvidenceSha256
  ) {
    throw unavailable();
  }
  return Object.freeze({
    purpose:
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANAGEMENT_SESSION" as const,
    targetDescriptorSha256: requireSha256(
      object.targetDescriptorSha256,
    ),
    tlsRootCertificateSha256:
      targetRequest.tlsRootCertificateSha256,
    user: "postgres" as const,
    applicationName:
      "careslink-preview-runtime-credential-broker-management" as const,
    credentialClass:
      "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" as const,
    sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" as const,
    deliveryNonce: requireSha256(object.deliveryNonce),
    deliveryExpiresNoLaterThan: requireTimestamp(
      object.deliveryExpiresNoLaterThan,
    ),
    maximumDeliveryLifetimeMs: MAXIMUM_DELIVERY_LIFETIME_MS,
    sourceRevisionSha256,
    deploymentIdentityEvidenceSha256:
      control.deploymentIdentityEvidenceSha256,
    controlPlaneEvidenceSha256:
      control.m1sControlPlaneEvidenceSha256,
  });
}

function requireWorkloadBinding(
  value: WorkloadBinding | undefined,
  clock: Clock,
) {
  if (!value) throw unavailable();
  requireIdentityFreshness(
    value.verified.observedAt,
    value.expiresAt,
    readClock(clock),
  );
  return value;
}

function requireControlPlaneBinding(
  value: ControlPlaneBinding | undefined,
  workload: WorkloadBinding,
  clock: Clock,
) {
  if (!value) throw unavailable();
  const now = readClock(clock);
  requireIdentityFreshness(
    workload.verified.observedAt,
    workload.expiresAt,
    now,
  );
  requireIdentityFreshness(value.observedAt, value.expiresAt, now);
  return value;
}

function validateClock(value: unknown): Clock {
  const source = validateFrozenCallablePort<() => string>(value, "now");
  let last = Number.NEGATIVE_INFINITY;
  const now = () => {
    const result = requireTimestamp(source());
    const milliseconds = Date.parse(result);
    if (milliseconds < last) throw unavailable();
    last = milliseconds;
    return result;
  };
  return Object.freeze({ source, now });
}

function readClock(clock: Clock) {
  try {
    return clock.now();
  } catch {
    throw unavailable();
  }
}

function validateContext(value: unknown): CallContext {
  const object = exactDataRecord(value, ["signal"]);
  if (
    !(object.signal instanceof AbortSignal) ||
    nodeTypes.isProxy(object.signal)
  ) {
    throw unavailable();
  }
  return Object.freeze({ signal: object.signal });
}

function requireSameContext(value: unknown, signal: AbortSignal) {
  const context = validateContext(value);
  if (context.signal !== signal) throw unavailable();
  return context;
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

function requireIdentityFreshness(
  observedAt: string,
  expiresAt: string,
  now: string,
) {
  const observedAtMs = Date.parse(observedAt);
  const expiresAtMs = Date.parse(expiresAt);
  const nowMs = Date.parse(now);
  if (
    observedAtMs > nowMs ||
    nowMs - observedAtMs > MAXIMUM_IDENTITY_AGE_MS ||
    expiresAtMs <= nowMs ||
    expiresAtMs - nowMs > MAXIMUM_IDENTITY_REMAINING_MS ||
    expiresAtMs <= observedAtMs
  ) {
    throw unavailable();
  }
}

function minimumTimestamp(values: readonly string[]) {
  return new Date(Math.min(...values.map((value) => Date.parse(value))))
    .toISOString();
}

function validateFrozenCallablePort<T extends (...args: never[]) => unknown>(
  value: unknown,
  method: string,
): T {
  const object = exactFrozenDataRecord(value, [method]);
  const candidate = object[method];
  if (typeof candidate !== "function" || nodeTypes.isProxy(candidate)) {
    throw unavailable();
  }
  return candidate as T;
}

function requireIndependentPorts(
  ports: readonly unknown[],
  functions: readonly unknown[],
) {
  if (
    ports.some((port) => !Object.isFrozen(port)) ||
    new Set(ports).size !== ports.length ||
    new Set(functions).size !== functions.length
  ) {
    throw unavailable();
  }
}

function requireAccessToken(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 20 ||
    value.length > 4_096 ||
    /\s|\u0000/.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireDatabasePassword(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 1_024 ||
    value.includes("\u0000") ||
    /^postgres(?:ql)?:\/\//i.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function requireTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw unavailable();
  }
  return value;
}

function rejectSecretBearingKeys(value: unknown) {
  const stack: unknown[] = [value];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > MAXIMUM_JSON_NODES) throw unavailable();
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(
      current as Record<string, unknown>,
    )) {
      if (
        /(?:pass(?:word)?|secret|token|jwt|authorization|connection_?string|dsn|api_?key)/i.test(
          key,
        )
      ) {
        throw unavailable();
      }
      stack.push(child);
    }
  }
}

function parseStrictJson(source: string): unknown {
  try {
    return new StrictJsonParser(source).parse();
  } catch {
    throw unavailable();
  }
}

class StrictJsonParser {
  private index = 0;
  private nodes = 0;

  constructor(private readonly source: string) {}

  parse() {
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.index !== this.source.length) throw unavailable();
    return value;
  }

  private parseValue(depth: number): unknown {
    if (depth > MAXIMUM_JSON_DEPTH) throw unavailable();
    this.nodes += 1;
    if (this.nodes > MAXIMUM_JSON_NODES) throw unavailable();
    this.skipWhitespace();
    const character = this.source[this.index];
    if (character === "{") return this.parseObject(depth + 1);
    if (character === "[") return this.parseArray(depth + 1);
    if (character === '"') return this.parseString();
    if (character === "t" && this.consumeLiteral("true")) return true;
    if (character === "f" && this.consumeLiteral("false")) return false;
    if (character === "n" && this.consumeLiteral("null")) return null;
    return this.parseNumber();
  }

  private parseObject(depth: number) {
    this.index += 1;
    const result: Record<string, unknown> = {};
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return result;
    }
    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') throw unavailable();
      const key = this.parseString();
      if (keys.has(key) || keys.size >= MAXIMUM_JSON_CONTAINER_ENTRIES) {
        throw unavailable();
      }
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ":") throw unavailable();
      this.index += 1;
      result[key] = this.parseValue(depth);
      this.skipWhitespace();
      const delimiter = this.source[this.index];
      if (delimiter === "}") {
        this.index += 1;
        return result;
      }
      if (delimiter !== ",") throw unavailable();
      this.index += 1;
    }
  }

  private parseArray(depth: number) {
    this.index += 1;
    const result: unknown[] = [];
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return result;
    }
    while (true) {
      if (result.length >= MAXIMUM_JSON_CONTAINER_ENTRIES) {
        throw unavailable();
      }
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      const delimiter = this.source[this.index];
      if (delimiter === "]") {
        this.index += 1;
        return result;
      }
      if (delimiter !== ",") throw unavailable();
      this.index += 1;
    }
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      this.index += 1;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') {
        const result = JSON.parse(
          this.source.slice(start, this.index),
        ) as unknown;
        if (
          typeof result !== "string" ||
          result.length > MAXIMUM_JSON_STRING_LENGTH
        ) {
          throw unavailable();
        }
        return result;
      }
    }
    throw unavailable();
  }

  private parseNumber() {
    const match = this.source.slice(this.index).match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/,
    );
    if (!match) throw unavailable();
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw unavailable();
    return value;
  }

  private consumeLiteral(value: string) {
    if (!this.source.startsWith(value, this.index)) return false;
    this.index += value.length;
    return true;
  }

  private skipWhitespace() {
    while (
      this.source[this.index] === " " ||
      this.source[this.index] === "\t" ||
      this.source[this.index] === "\r" ||
      this.source[this.index] === "\n"
    ) {
      this.index += 1;
    }
  }
}

function exactFrozenDataRecord(
  value: unknown,
  exactKeys: readonly string[],
) {
  const object = exactDataRecord(value, exactKeys);
  if (!Object.isFrozen(value)) throw unavailable();
  return object;
}

function allowedDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const names = Object.getOwnPropertyNames(value);
  if (names.some((key) => !allowedKeys.includes(key))) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    names.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !descriptor.enumerable || !("value" in descriptor);
    })
  ) {
    throw unavailable();
  }
  return value as Record<string, unknown>;
}

function exactDataRecord(
  value: unknown,
  exactKeys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const names = Object.getOwnPropertyNames(value);
  if (
    names.length !== exactKeys.length ||
    exactKeys.some((key) => !names.includes(key))
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    exactKeys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !descriptor.enumerable || !("value" in descriptor);
    })
  ) {
    throw unavailable();
  }
  return value as Record<string, unknown>;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function bytesSha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
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
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note preview product runtime platform adapters are unavailable",
  );
}
