import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver,
} from "./communication-note-preview-approved-runtime-target.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY_DIGEST,
  createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition,
} from "./communication-note-preview-product-runtime-composition.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MANAGEMENT_USER_PATTERN = /^postgres(?:\.[a-z0-9]{20})?$/;
const MAXIMUM_IDENTITY_AGE_MS = 5 * 60 * 1_000;
const MAXIMUM_IDENTITY_REMAINING_MS = 5 * 60 * 1_000;
const MAXIMUM_DATA_TREE_DEPTH = 32;
const MAXIMUM_DATA_TREE_ENTRIES = 1_024;
const MAXIMUM_DATA_TREE_NODES = 4_096;
const MAXIMUM_DATA_TREE_TOTAL_ENTRIES = 16_384;

const DEPLOYMENT_IDENTITY_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME_IDENTITY" as const;
const RUNTIME_IDENTITY_AUDIENCE =
  "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME" as const;
const RUNTIME_ENVIRONMENT_CLASS = "NON_PRODUCTION_PREVIEW" as const;
const AUTHENTICATED_TARGET_OBSERVATION_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHENTICATED_TARGET_OBSERVATION" as const;
const CONTROL_PLANE_SOURCE = "SUPABASE_MANAGEMENT_API" as const;
const CONTROL_PLANE_AUTHORIZATION_MODEL =
  "SUPABASE_OAUTH_APP_SCOPE" as const;
const CONTROL_PLANE_OAUTH_SCOPE = "environment:read" as const;
const CONTROL_PLANE_SCOPE_ATTESTATION_SOURCE =
  "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" as const;
const MANAGEMENT_CREDENTIAL_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANAGEMENT_SESSION" as const;
const MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-management" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_VERSION =
  "identities.communication.openai.synthetic-preview.2026-09-01.m1s.v2" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_READY =
  false as const;

const PRODUCT_RUNTIME_IDENTITIES_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_VERSION,
  status: "SOURCE_PRODUCT_RUNTIME_IDENTITIES_NOT_ACTIVATED",
  ready: false,
  sourceOnly: true,
  nodeRuntimeRequired: true,
  edgeRuntimeSupported: false,
  productRuntimeCompositionPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY_DIGEST,
  approvedRuntimeTargetPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST,
  targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
  approvedTargetResolverPresent: false,
  injectedDeploymentIdentityAttestationContractPresent: true,
  deploymentIdentityImplementationPresent: false,
  authenticatedControlPlaneObservationContractPresent: true,
  controlPlaneIdentityImplementationPresent: false,
  credentialCustodyContractPresent: true,
  credentialTransportImplementationPresent: false,
  secretManagerImplementationPresent: false,
  identityAudience: RUNTIME_IDENTITY_AUDIENCE,
  identityEnvironmentClass: RUNTIME_ENVIRONMENT_CLASS,
  maximumIdentityAgeMs: MAXIMUM_IDENTITY_AGE_MS,
  maximumIdentityRemainingMs: MAXIMUM_IDENTITY_REMAINING_MS,
  controlPlaneSource: CONTROL_PLANE_SOURCE,
  controlPlaneAuthorizationModel: CONTROL_PLANE_AUTHORIZATION_MODEL,
  requiredControlPlaneOAuthScope: CONTROL_PLANE_OAUTH_SCOPE,
  controlPlaneScopeAttestationSource:
    CONTROL_PLANE_SCOPE_ATTESTATION_SOURCE,
  controlPlaneOAuthAppReferenceRequired: true,
  controlPlaneOAuthGrantReferenceRequired: true,
  controlPlaneEndpointAllowlistEnforced: true,
  fineGrainedTokenPermissionClaimed: false,
  productionControlPlaneAuthorizationAllowed: false,
  identityBinding:
    "CANONICAL_SHA256_ATTESTATION_AND_ATOMIC_CONTROL_PLANE_OBSERVATION",
  sourceRevisionBinding:
    "CALLER_PIN_AND_INJECTED_IDENTITY_ATTESTATION_EXACT_MATCH",
  sourceRevisionAttestedByModule: false,
  credentialCustodyBindingFields: [
    "sourceRevisionSha256",
    "deploymentIdentityEvidenceSha256",
    "controlPlaneEvidenceSha256",
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
  ],
  underlyingCredentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
  underlyingCredentialShortLived: false,
  sourceCredentialSingleUse: false,
  sourceExpiresAt: null,
  sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
  deliveryEnvelopeSingleUse: true,
  maximumDeliveryEnvelopeLifetimeMs: 60_000,
  processMemoryZeroizationAttested: false,
  rawCredentialMaterialAcceptedAtComposition: false,
  rawCredentialMaterialReturned: false,
  controlPlaneCredentialExported: false,
  deploymentIdentityExported: false,
  productRouteImporterPresent: false,
  productionTargetAllowed: false,
  providerModelEvaluationApproved: false,
  productionMigrationApproved: false,
  deploymentApproved: false,
  activationApproved: false,
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY_DIGEST =
  "98a25545a0d2998b136453d1703dea747467cd1ebf2f1ba443121125f27df08a" as const;

if (
  canonicalSha256(PRODUCT_RUNTIME_IDENTITIES_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY =
  deepFreeze({
    ...PRODUCT_RUNTIME_IDENTITIES_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES_POLICY_DIGEST,
  });

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_IDENTITIES =
  undefined as
    | Awaited<
        ReturnType<
          typeof createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition
        >
      >
    | undefined;

export async function createCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
  _value: unknown,
  _context: unknown,
): Promise<never> {
  void _value;
  void _context;
  throw unavailable();
}

/**
 * Source-only TestOnly composition. All authority and custody operations remain
 * injected. This module neither discovers credentials nor implements a cloud,
 * Supabase, secret-manager, deployment or network adapter.
 */
export async function createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeIdentities(
  value: unknown,
  contextValue: unknown,
): ReturnType<
  typeof createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition
> {
  try {
    const options = exactDataRecord(value, [
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
    if (
      options.capability !== "TEST_ONLY_M1S_PRODUCT_RUNTIME_IDENTITIES"
    ) {
      throw unavailable();
    }

    const expectedSourceRevisionSha256 = requireSha256(
      options.expectedSourceRevisionSha256,
    );
    const targetRequest = validateTargetRequest(options.targetRequest);
    const deploymentIdentityAttestationPort = validateCallablePort<
      DeploymentIdentityAttestationPort["attest"]
    >(options.deploymentIdentityAttestationPort, "attest");
    const authenticatedControlPlaneObservationPort = validateCallablePort<
      AuthenticatedControlPlaneObservationPort["observe"]
    >(options.authenticatedControlPlaneObservationPort, "observe");
    const projectRefHmacPort = validateCallablePort<
      BoundProjectRefHmacPort["hmac"]
    >(options.projectRefHmacPort, "hmac");
    const pinnedCaLoader = validateCallablePort<BoundPinnedCaLoader["load"]>(
      options.pinnedCaLoader,
      "load",
    );
    const managementCredentialCustodyPort = validateCallablePort<
      BoundManagementCredentialCustodyPort["consume"]
    >(options.managementCredentialCustodyPort, "consume");
    const verifiedAuthorization = options.verifiedAuthorization;
    const custodyResolver = options.custodyResolver;
    const custodyResolve = validateCallablePort<
      (request: unknown, context: CallContext) => PromiseLike<unknown>
    >(custodyResolver, "resolve");
    if (!Object.isFrozen(custodyResolver)) throw unavailable();
    const clock = validateClock(options.clock);
    const entropy = validateEntropy(options.entropy);
    assertDataTree(verifiedAuthorization);
    if (
      !verifiedAuthorization ||
      typeof verifiedAuthorization !== "object" ||
      Array.isArray(verifiedAuthorization)
    ) {
      throw unavailable();
    }
    requireIndependentPorts(
      [
        options.deploymentIdentityAttestationPort,
        options.authenticatedControlPlaneObservationPort,
        options.projectRefHmacPort,
        options.pinnedCaLoader,
        options.managementCredentialCustodyPort,
        custodyResolver,
        options.clock,
        options.entropy,
      ],
      [
        deploymentIdentityAttestationPort,
        authenticatedControlPlaneObservationPort,
        projectRefHmacPort,
        pinnedCaLoader,
        managementCredentialCustodyPort,
        custodyResolve,
        clock.source,
        entropy.source,
      ],
    );

    const context = validateContext(contextValue);
    const identityRequest = Object.freeze({
      purpose: DEPLOYMENT_IDENTITY_PURPOSE,
      audience: RUNTIME_IDENTITY_AUDIENCE,
      environmentClass: RUNTIME_ENVIRONMENT_CLASS,
      sourceRevisionSha256: expectedSourceRevisionSha256,
      targetProjectRef: targetRequest.targetProjectRef,
      tlsRootCertificateSha256:
        targetRequest.tlsRootCertificateSha256,
    });
    const identityRequestStartedAt = readClock(clock);
    requireNotAborted(context.signal);
    const rawDeploymentIdentity =
      await deploymentIdentityAttestationPort(identityRequest, context);
    requireNotAborted(context.signal);
    const identityValidatedAt = readClock(clock);
    if (identityValidatedAt < identityRequestStartedAt) throw unavailable();
    const deploymentIdentity = validateDeploymentIdentity(
      rawDeploymentIdentity,
      expectedSourceRevisionSha256,
      targetRequest.tlsRootCertificateSha256,
      identityValidatedAt,
    );
    const deploymentIdentityEvidenceSha256 = canonicalSha256({
      domain:
        "careslink.communication-note.preview.deployment-identity.m1s.v2",
      request: identityRequest,
      identity: deploymentIdentity,
    });

    let controlPlaneBinding: ControlPlaneBinding | undefined;
    let controlPlaneObservationStarted = false;
    const targetResolver =
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver(
        {
          capability: "TEST_ONLY_APPROVED_RUNTIME_TARGET_RESOLVER",
          controlPlaneObservationPort: Object.freeze({
            async observe(requestValue: unknown, callContext: CallContext) {
              try {
                if (
                  controlPlaneBinding ||
                  controlPlaneObservationStarted
                ) {
                  throw unavailable();
                }
                controlPlaneObservationStarted = true;
                const request = exactDataRecord(requestValue, [
                  "source",
                  "targetProjectRef",
                ]);
                if (
                  request.source !== "SUPABASE_CONTROL_PLANE" ||
                  request.targetProjectRef !== targetRequest.targetProjectRef
                ) {
                  throw unavailable();
                }
                const boundedContext = requireCompositionContext(
                  callContext,
                  context.signal,
                );
                requireIdentityFreshness(
                  deploymentIdentity.observedAt,
                  deploymentIdentity.expiresAt,
                  readClock(clock),
                );
                requireNotAborted(boundedContext.signal);
                const rawEnvelope =
                  await authenticatedControlPlaneObservationPort(
                    Object.freeze({
                      purpose: AUTHENTICATED_TARGET_OBSERVATION_PURPOSE,
                      source: CONTROL_PLANE_SOURCE,
                      targetProjectRef: targetRequest.targetProjectRef,
                      sourceRevisionSha256:
                        expectedSourceRevisionSha256,
                      deploymentIdentityEvidenceSha256,
                    }),
                    boundedContext,
                  );
                requireNotAborted(boundedContext.signal);
                const observedAt = readClock(clock);
                const envelope = validateAuthenticatedControlPlaneEnvelope(
                  rawEnvelope,
                  targetRequest,
                  deploymentIdentity,
                  expectedSourceRevisionSha256,
                  deploymentIdentityEvidenceSha256,
                  observedAt,
                );
                controlPlaneBinding = Object.freeze({
                  evidenceSha256: envelope.controlPlaneEvidenceSha256,
                  identityIssuedAt: envelope.identityIssuedAt,
                  expiresAt: envelope.effectiveExpiresAt,
                });
                return envelope.observation;
              } catch {
                throw unavailable();
              }
            },
          }),
          projectRefHmacPort: Object.freeze({
            async hmac(requestValue: unknown, callContext: CallContext) {
              try {
                const binding = requireControlPlaneBinding(
                  controlPlaneBinding,
                  clock,
                  deploymentIdentity,
                );
                const request = exactDataRecord(requestValue, [
                  "purpose",
                  "projectRef",
                ]);
                if (
                  request.purpose !== "SUPABASE_PROJECT_REF_BINDING" ||
                  typeof request.projectRef !== "string" ||
                  !PROJECT_REF_PATTERN.test(request.projectRef)
                ) {
                  throw unavailable();
                }
                const boundedContext = requireCompositionContext(
                  callContext,
                  context.signal,
                );
                requireNotAborted(boundedContext.signal);
                const result = await projectRefHmacPort(
                  Object.freeze({
                    purpose: "SUPABASE_PROJECT_REF_BINDING" as const,
                    projectRef: request.projectRef,
                    sourceRevisionSha256:
                      expectedSourceRevisionSha256,
                    deploymentIdentityEvidenceSha256,
                    controlPlaneEvidenceSha256: binding.evidenceSha256,
                  }),
                  boundedContext,
                );
                requireNotAborted(boundedContext.signal);
                return result;
              } catch {
                throw unavailable();
              }
            },
          }),
          pinnedCaLoader: Object.freeze({
            async load(requestValue: unknown, callContext: CallContext) {
              try {
                const binding = requireControlPlaneBinding(
                  controlPlaneBinding,
                  clock,
                  deploymentIdentity,
                );
                const request = exactDataRecord(requestValue, [
                  "tlsRootCertificateSha256",
                ]);
                if (
                  request.tlsRootCertificateSha256 !==
                  targetRequest.tlsRootCertificateSha256
                ) {
                  throw unavailable();
                }
                const boundedContext = requireCompositionContext(
                  callContext,
                  context.signal,
                );
                requireNotAborted(boundedContext.signal);
                const result = await pinnedCaLoader(
                  Object.freeze({
                    tlsRootCertificateSha256:
                      targetRequest.tlsRootCertificateSha256,
                    sourceRevisionSha256:
                      expectedSourceRevisionSha256,
                    deploymentIdentityEvidenceSha256,
                    controlPlaneEvidenceSha256: binding.evidenceSha256,
                  }),
                  boundedContext,
                );
                requireNotAborted(boundedContext.signal);
                return result;
              } catch {
                throw unavailable();
              }
            },
          }),
          clock: Object.freeze({ now: clock.now }),
        },
      );

    return await createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition(
      {
        capability: "TEST_ONLY_M1R_PRODUCT_RUNTIME_COMPOSITION",
        targetResolver,
        targetRequest,
        verifiedAuthorization,
        custodyResolver,
        managementCredentialTransport: Object.freeze({
          async consume(
            requestValue: unknown,
            callContext: CallContext,
            consumer: ManagementCredentialConsumer,
          ) {
            try {
              const binding = requireControlPlaneBinding(
                controlPlaneBinding,
                clock,
                deploymentIdentity,
              );
              const request = validateManagementCredentialRequest(
                requestValue,
                targetRequest,
                binding,
              );
              const boundedContext = validateContext(callContext);
              requireNotAborted(boundedContext.signal);
              if (
                typeof consumer !== "function" ||
                nodeTypes.isProxy(consumer)
              ) {
                throw unavailable();
              }
              const result = await managementCredentialCustodyPort(
                Object.freeze({
                  ...request,
                  sourceRevisionSha256:
                    expectedSourceRevisionSha256,
                  deploymentIdentityEvidenceSha256,
                  controlPlaneEvidenceSha256: binding.evidenceSha256,
                }),
                boundedContext,
                consumer,
              );
              requireNotAborted(boundedContext.signal);
              requireControlPlaneBinding(
                controlPlaneBinding,
                clock,
                deploymentIdentity,
              );
              if (result !== undefined) throw unavailable();
            } catch {
              throw unavailable();
            }
          },
        }),
        clock: Object.freeze({ now: clock.now }),
        entropy: Object.freeze({ bytes: entropy.bytes }),
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
type Entropy = Readonly<{
  source: (length: number) => Uint8Array;
  bytes: (length: number) => Uint8Array;
}>;
type TargetRequest = Readonly<{
  targetProjectRef: string;
  tlsRootCertificateSha256: string;
}>;
type DeploymentIdentity = Readonly<{
  status: "ATTESTED_DEPLOYMENT_IDENTITY_NOT_APPROVED";
  source: "INJECTED_WORKLOAD_IDENTITY_ATTESTATION";
  audience: typeof RUNTIME_IDENTITY_AUDIENCE;
  environmentClass: typeof RUNTIME_ENVIRONMENT_CLASS;
  sourceRevisionSha256: string;
  workloadIdentityHmacSha256: string;
  deploymentHmacSha256: string;
  attestationEvidenceSha256: string;
  observedAt: string;
  expiresAt: string;
  rawCredentialMaterialPresent: false;
}>;
type ControlPlaneBinding = Readonly<{
  evidenceSha256: string;
  identityIssuedAt: string;
  expiresAt: string;
}>;
type DeploymentIdentityAttestationPort = Readonly<{
  attest: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ) => PromiseLike<unknown>;
}>;
type AuthenticatedControlPlaneObservationPort = Readonly<{
  observe: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ) => PromiseLike<unknown>;
}>;
type BoundProjectRefHmacPort = Readonly<{
  hmac: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ) => PromiseLike<unknown>;
}>;
type BoundPinnedCaLoader = Readonly<{
  load: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ) => PromiseLike<unknown>;
}>;
type ManagementCredentialConsumer = (
  credential: unknown,
) => PromiseLike<void>;
type BoundManagementCredentialCustodyPort = Readonly<{
  consume: (
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
    consumer: ManagementCredentialConsumer,
  ) => PromiseLike<unknown>;
}>;

function validateTargetRequest(value: unknown): TargetRequest {
  const object = exactDataRecord(value, [
    "targetProjectRef",
    "tlsRootCertificateSha256",
  ]);
  if (
    typeof object.targetProjectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(object.targetProjectRef)
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

function validateDeploymentIdentity(
  value: unknown,
  expectedSourceRevisionSha256: string,
  expectedTlsRootCertificateSha256: string,
  now: string,
): DeploymentIdentity {
  const object = exactDataRecord(value, [
    "status",
    "source",
    "audience",
    "environmentClass",
    "sourceRevisionSha256",
    "workloadIdentityHmacSha256",
    "deploymentHmacSha256",
    "attestationEvidenceSha256",
    "observedAt",
    "expiresAt",
    "rawCredentialMaterialPresent",
  ]);
  if (
    object.status !== "ATTESTED_DEPLOYMENT_IDENTITY_NOT_APPROVED" ||
    object.source !== "INJECTED_WORKLOAD_IDENTITY_ATTESTATION" ||
    object.audience !== RUNTIME_IDENTITY_AUDIENCE ||
    object.environmentClass !== RUNTIME_ENVIRONMENT_CLASS ||
    object.sourceRevisionSha256 !== expectedSourceRevisionSha256 ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const workloadIdentityHmacSha256 = requireSha256(
    object.workloadIdentityHmacSha256,
  );
  const deploymentHmacSha256 = requireSha256(
    object.deploymentHmacSha256,
  );
  const attestationEvidenceSha256 = requireSha256(
    object.attestationEvidenceSha256,
  );
  if (
    new Set([
      expectedSourceRevisionSha256,
      expectedTlsRootCertificateSha256,
      workloadIdentityHmacSha256,
      deploymentHmacSha256,
      attestationEvidenceSha256,
    ]).size !== 5
  ) {
    throw unavailable();
  }
  const observedAt = requireTimestamp(object.observedAt);
  const expiresAt = requireTimestamp(object.expiresAt);
  requireIdentityFreshness(observedAt, expiresAt, now);
  return Object.freeze({
    status: "ATTESTED_DEPLOYMENT_IDENTITY_NOT_APPROVED" as const,
    source: "INJECTED_WORKLOAD_IDENTITY_ATTESTATION" as const,
    audience: RUNTIME_IDENTITY_AUDIENCE,
    environmentClass: RUNTIME_ENVIRONMENT_CLASS,
    sourceRevisionSha256: expectedSourceRevisionSha256,
    workloadIdentityHmacSha256,
    deploymentHmacSha256,
    attestationEvidenceSha256,
    observedAt,
    expiresAt,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateAuthenticatedControlPlaneEnvelope(
  value: unknown,
  targetRequest: TargetRequest,
  deploymentIdentity: DeploymentIdentity,
  sourceRevisionSha256: string,
  deploymentIdentityEvidenceSha256: string,
  now: string,
) {
  const envelope = exactDataRecord(value, ["identity", "observation"]);
  const identityValue = exactDataRecord(envelope.identity, [
    "status",
    "source",
    "audience",
    "authorizationModel",
    "oauthScope",
    "oauthAppReferenceSha256",
    "oauthGrantReferenceSha256",
    "scopeAttestationSource",
    "endpointAllowlistEnforced",
    "principalReferenceSha256",
    "credentialReferenceSha256",
    "issuedAt",
    "expiresAt",
    "rawCredentialMaterialPresent",
  ]);
  if (
    identityValue.status !==
      "AUTHENTICATED_CONTROL_PLANE_IDENTITY_NOT_APPROVED" ||
    identityValue.source !== CONTROL_PLANE_SOURCE ||
    identityValue.audience !== CONTROL_PLANE_SOURCE ||
    identityValue.authorizationModel !==
      CONTROL_PLANE_AUTHORIZATION_MODEL ||
    identityValue.oauthScope !== CONTROL_PLANE_OAUTH_SCOPE ||
    identityValue.scopeAttestationSource !==
      CONTROL_PLANE_SCOPE_ATTESTATION_SOURCE ||
    identityValue.endpointAllowlistEnforced !== true ||
    identityValue.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const oauthAppReferenceSha256 = requireSha256(
    identityValue.oauthAppReferenceSha256,
  );
  const oauthGrantReferenceSha256 = requireSha256(
    identityValue.oauthGrantReferenceSha256,
  );
  const principalReferenceSha256 = requireSha256(
    identityValue.principalReferenceSha256,
  );
  const credentialReferenceSha256 = requireSha256(
    identityValue.credentialReferenceSha256,
  );
  const issuedAt = requireTimestamp(identityValue.issuedAt);
  const identityExpiresAt = requireTimestamp(identityValue.expiresAt);
  requireIdentityFreshness(issuedAt, identityExpiresAt, now);

  const observationValue = exactDataRecord(envelope.observation, [
    "source",
    "targetProjectRef",
    "parentProjectRef",
    "defaultBranch",
    "persistent",
    "withData",
    "postgresMajor",
    "projectStatus",
    "observedAt",
    "expiresAt",
    "observationEvidenceSha256",
    "tlsRootCertificateSha256",
    "endpoint",
    "rawCredentialMaterialPresent",
  ]);
  if (
    observationValue.source !== "SUPABASE_CONTROL_PLANE" ||
    observationValue.targetProjectRef !== targetRequest.targetProjectRef ||
    observationValue.tlsRootCertificateSha256 !==
      targetRequest.tlsRootCertificateSha256 ||
    observationValue.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const endpointValue = exactDataRecord(observationValue.endpoint, [
    "connectionMode",
    "hostname",
    "port",
    "database",
    "usernameProjectRefSuffix",
  ]);
  if (
    typeof endpointValue.hostname !== "string" ||
    ![
      "DIRECT",
      "SUPAVISOR_SESSION",
    ].includes(String(endpointValue.connectionMode)) ||
    endpointValue.port !== 5432 ||
    endpointValue.database !== "postgres" ||
    (endpointValue.usernameProjectRefSuffix !== null &&
      typeof endpointValue.usernameProjectRefSuffix !== "string")
  ) {
    throw unavailable();
  }
  const observationEvidenceSha256 = requireSha256(
    observationValue.observationEvidenceSha256,
  );
  const observationObservedAt = requireTimestamp(
    observationValue.observedAt,
  );
  const observationExpiresAt = requireTimestamp(
    observationValue.expiresAt,
  );
  requireIdentityFreshness(
    observationObservedAt,
    observationExpiresAt,
    now,
  );
  if (
    new Set([
      sourceRevisionSha256,
      deploymentIdentityEvidenceSha256,
      deploymentIdentity.workloadIdentityHmacSha256,
      deploymentIdentity.deploymentHmacSha256,
      deploymentIdentity.attestationEvidenceSha256,
      oauthAppReferenceSha256,
      oauthGrantReferenceSha256,
      principalReferenceSha256,
      credentialReferenceSha256,
      observationEvidenceSha256,
      targetRequest.tlsRootCertificateSha256,
    ]).size !== 11
  ) {
    throw unavailable();
  }

  const identity = Object.freeze({
    status:
      "AUTHENTICATED_CONTROL_PLANE_IDENTITY_NOT_APPROVED" as const,
    source: CONTROL_PLANE_SOURCE,
    audience: CONTROL_PLANE_SOURCE,
    authorizationModel: CONTROL_PLANE_AUTHORIZATION_MODEL,
    oauthScope: CONTROL_PLANE_OAUTH_SCOPE,
    oauthAppReferenceSha256,
    oauthGrantReferenceSha256,
    scopeAttestationSource: CONTROL_PLANE_SCOPE_ATTESTATION_SOURCE,
    endpointAllowlistEnforced: true as const,
    principalReferenceSha256,
    credentialReferenceSha256,
    issuedAt,
    expiresAt: identityExpiresAt,
    rawCredentialMaterialPresent: false as const,
  });
  const endpoint = Object.freeze({
    connectionMode: endpointValue.connectionMode,
    hostname: endpointValue.hostname,
    port: 5432 as const,
    database: "postgres" as const,
    usernameProjectRefSuffix: endpointValue.usernameProjectRefSuffix,
  });
  const normalizedObservation = Object.freeze({
    source: "SUPABASE_CONTROL_PLANE" as const,
    targetProjectRef: observationValue.targetProjectRef,
    parentProjectRef: observationValue.parentProjectRef,
    defaultBranch: observationValue.defaultBranch,
    persistent: observationValue.persistent,
    withData: observationValue.withData,
    postgresMajor: observationValue.postgresMajor,
    projectStatus: observationValue.projectStatus,
    observedAt: observationObservedAt,
    expiresAt: observationExpiresAt,
    observationEvidenceSha256,
    tlsRootCertificateSha256:
      targetRequest.tlsRootCertificateSha256,
    endpoint,
    rawCredentialMaterialPresent: false as const,
  });
  const effectiveExpiresAt = new Date(
    Math.min(
      Date.parse(deploymentIdentity.expiresAt),
      Date.parse(identityExpiresAt),
      Date.parse(observationExpiresAt),
    ),
  ).toISOString();
  if (Date.parse(effectiveExpiresAt) <= Date.parse(observationObservedAt)) {
    throw unavailable();
  }
  const controlPlaneEvidenceSha256 = canonicalSha256({
    domain:
      "careslink.communication-note.preview.authenticated-control-plane-evidence.m1s.v2",
    sourceRevisionSha256,
    deploymentIdentityEvidenceSha256,
    identity,
    observation: normalizedObservation,
  });
  return Object.freeze({
    controlPlaneEvidenceSha256,
    identityIssuedAt: issuedAt,
    effectiveExpiresAt,
    observation: Object.freeze({
      source: normalizedObservation.source,
      targetProjectRef: normalizedObservation.targetProjectRef,
      parentProjectRef: normalizedObservation.parentProjectRef,
      defaultBranch: normalizedObservation.defaultBranch,
      persistent: normalizedObservation.persistent,
      withData: normalizedObservation.withData,
      postgresMajor: normalizedObservation.postgresMajor,
      projectStatus: normalizedObservation.projectStatus,
      observedAt: normalizedObservation.observedAt,
      expiresAt: effectiveExpiresAt,
      controlPlaneEvidenceSha256,
      tlsRootCertificateSha256:
        normalizedObservation.tlsRootCertificateSha256,
      endpoint: normalizedObservation.endpoint,
      rawCredentialMaterialPresent: false as const,
    }),
  });
}

function validateManagementCredentialRequest(
  value: unknown,
  targetRequest: TargetRequest,
  binding: ControlPlaneBinding,
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
  ]);
  if (
    object.purpose !== MANAGEMENT_CREDENTIAL_PURPOSE ||
    object.tlsRootCertificateSha256 !==
      targetRequest.tlsRootCertificateSha256 ||
    typeof object.user !== "string" ||
    !MANAGEMENT_USER_PATTERN.test(object.user) ||
    (object.user !== "postgres" &&
      object.user !== `postgres.${targetRequest.targetProjectRef}`) ||
    object.applicationName !== MANAGEMENT_APPLICATION_NAME ||
    object.credentialClass !== "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" ||
    object.sourceExpiresAt !== null ||
    object.sourceRevocation !== "BRANCH_DELETE_OR_PASSWORD_RESET" ||
    object.deliveryExpiresNoLaterThan !== binding.expiresAt ||
    object.maximumDeliveryLifetimeMs !== 60_000
  ) {
    throw unavailable();
  }
  return Object.freeze({
    purpose: MANAGEMENT_CREDENTIAL_PURPOSE,
    targetDescriptorSha256: requireSha256(
      object.targetDescriptorSha256,
    ),
    tlsRootCertificateSha256:
      targetRequest.tlsRootCertificateSha256,
    user: object.user,
    applicationName: MANAGEMENT_APPLICATION_NAME,
    credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" as const,
    sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" as const,
    deliveryNonce: requireSha256(object.deliveryNonce),
    deliveryExpiresNoLaterThan: requireTimestamp(
      object.deliveryExpiresNoLaterThan,
    ),
    maximumDeliveryLifetimeMs: 60_000 as const,
  });
}

function requireControlPlaneBinding(
  binding: ControlPlaneBinding | undefined,
  clock: Clock,
  deploymentIdentity: DeploymentIdentity,
) {
  if (!binding) throw unavailable();
  const now = readClock(clock);
  requireIdentityFreshness(
    deploymentIdentity.observedAt,
    deploymentIdentity.expiresAt,
    now,
  );
  requireIdentityFreshness(
    binding.identityIssuedAt,
    binding.expiresAt,
    now,
  );
  return binding;
}

function validateClock(value: unknown): Clock {
  const source = validateCallablePort<() => string>(value, "now");
  let last = Number.NEGATIVE_INFINITY;
  const now = () => {
    const normalized = requireTimestamp(source());
    const current = Date.parse(normalized);
    if (current < last) throw unavailable();
    last = current;
    return normalized;
  };
  return Object.freeze({ source, now });
}

function validateEntropy(value: unknown): Entropy {
  const source = validateCallablePort<(length: number) => Uint8Array>(
    value,
    "bytes",
  );
  return Object.freeze({ source, bytes: source });
}

function readClock(clock: Clock) {
  try {
    return clock.now();
  } catch {
    throw unavailable();
  }
}

function validateCallablePort<T extends (...args: never[]) => unknown>(
  value: unknown,
  method: string,
): T {
  const object = exactDataRecord(value, [method]);
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
    new Set(ports).size !== ports.length ||
    new Set(functions).size !== functions.length
  ) {
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

function requireCompositionContext(
  value: unknown,
  expectedSignal: AbortSignal,
) {
  const context = validateContext(value);
  if (context.signal !== expectedSignal) throw unavailable();
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

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
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

function assertDataTree(value: unknown) {
  validateDataTree(
    value,
    {
      active: new WeakSet<object>(),
      validated: new WeakSet<object>(),
      remainingNodes: MAXIMUM_DATA_TREE_NODES,
      remainingEntries: MAXIMUM_DATA_TREE_TOTAL_ENTRIES,
    },
    0,
  );
}

type DataTreeBudget = {
  active: WeakSet<object>;
  validated: WeakSet<object>;
  remainingNodes: number;
  remainingEntries: number;
};

function validateDataTree(
  value: unknown,
  budget: DataTreeBudget,
  depth: number,
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (!value || typeof value !== "object" || depth > MAXIMUM_DATA_TREE_DEPTH) {
    throw unavailable();
  }
  if (nodeTypes.isProxy(value) || budget.active.has(value)) {
    throw unavailable();
  }
  if (budget.validated.has(value)) return;
  budget.remainingNodes -= 1;
  if (budget.remainingNodes < 0 || !Object.isFrozen(value)) {
    throw unavailable();
  }
  budget.active.add(value);
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const names = Object.getOwnPropertyNames(value);
  budget.remainingEntries -= names.length;
  if (
    names.length > MAXIMUM_DATA_TREE_ENTRIES ||
    budget.remainingEntries < 0
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      names.length !== value.length + 1 ||
      names.at(-1) !== "length"
    ) {
      throw unavailable();
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw unavailable();
      }
      validateDataTree(descriptor.value, budget, depth + 1);
    }
    budget.active.delete(value);
    budget.validated.add(value);
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw unavailable();
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw unavailable();
    }
    validateDataTree(descriptor.value, budget, depth + 1);
  }
  budget.active.delete(value);
  budget.validated.add(value);
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
    "Communication Note preview product runtime identities are unavailable",
  );
}
