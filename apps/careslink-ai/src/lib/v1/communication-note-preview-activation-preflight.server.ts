import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  type CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
} from "./communication-note-preview-execution-authority.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  type CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
} from "./communication-note-preview-key-custody.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
} from "./communication-note-preview-runner-terminal-policy.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION =
  "preflight.communication.openai.synthetic-preview.2026-08-29.m1g-i.v5" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAXIMUM_EVIDENCE_AGE_MS = 5 * 60 * 1_000;
const MAXIMUM_CANDIDATE_LIFETIME_MS = 15 * 60 * 1_000;
const CLOCK_SKEW_MS = 0;
const MAXIMUM_PLAIN_DATA_ARRAY_LENGTH = 256;
const MAXIMUM_PLAIN_DATA_OBJECT_KEY_COUNT = 256;
const MAXIMUM_PLAIN_DATA_DEPTH = 32;
const MAXIMUM_PLAIN_DATA_NODE_COUNT = 4_096;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION =
  "hmac.communication-note.preview-database-project-ref.2026-08-28.m1g-d.v1" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS =
  deepFreeze([
    "EXTERNAL_PROVENANCE_NOT_AUTHENTICATED",
    "RUNTIME_IDENTITIES_NOT_PROVISIONED",
    "KEY_RESOLVERS_AND_TRANSPORT_ABSENT",
    "HUMAN_REVIEW_NOT_COMPLETED",
    "FINAL_RUN_APPROVAL_ABSENT",
  ] as const);

export type CaresLinkV1CommunicationNotePreviewActivationBlockedReason =
  (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS)[number];

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS =
  deepFreeze({
    migrationCount: 39,
    orderedMigrationBasenamesSha256:
      "2bd2f029c86e1f4231b9a3bee7ee8681cb086dcd29eaaaceff21efcc1fec1fda",
    orderedMigrationEntriesSha256:
      "a0ad14e88a2c10400c4d2e86ee8ca4c67768ee094f8002687dd33c333c045fa2",
    authorityMigrationSha256:
      "94f83498ea04053e7238a95bb9be0bb8a38ad0a76fa0e751390419800da51f7f",
    custodyMigrationSha256:
      "e6b77e76406d8db1d68ad6e8da0d9d2dd88521c713047c0415aa60d29243d432",
    authorityAssertionSha256:
      "9b1e0088e7e39b81e248815e8ce6e939f29220830feda2d177ffd230892b39db",
    custodyAssertionSha256:
      "7fa7fa9d4c9667005b36c1f72c95aaf2418131d05037b5ea347f83e0bfcf16d2",
    runnerTerminalMigrationSha256:
      "09e69476de4b5b1b925a281f2943ef541e289aab6bef60ad92aace14d0c6d432",
    signedRunnerTerminalMigrationSha256:
      "4c13bf50d7866a4b948475b598bb1c103fb625e59824be98c4e272c659da283f",
    runnerTerminalAcceptedUsageMigrationSha256:
      "3d2cc53df3cf17ea21a4f93aaf673f8e911fcc9a35b5309cf7c633c6802e448e",
    runnerTerminalAssertionSha256:
      "addcc0524c5ae1a20ab0797ae5d005cff846105da61b4100d0db2a60c9e5c1e6",
  } as const);

const ACTIVATION_PREFLIGHT_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION,
  status: "SOURCE_CONTRACT_ONLY_NO_ACTIVATION_AUTHORITY",
  capability: "TEST_ONLY_CANDIDATE_VALIDATION",
  activationReady: false,
  maximumEvidenceAgeMs: MAXIMUM_EVIDENCE_AGE_MS,
  maximumCandidateLifetimeMs: MAXIMUM_CANDIDATE_LIFETIME_MS,
  clockSkewMs: CLOCK_SKEW_MS,
  evidenceObservation: "SHARED_EXACT_TIMESTAMP",
  sourceBindings: {
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    keyCustodyPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    runnerTerminalPolicyVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
    runnerTerminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    authoritySourceBindings:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
    databaseEvidencePins:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS,
  },
  provider: {
    projectStatus: "ACTIVE",
    region: "AUSTRALIA",
    retention: "ZERO_DATA_RETENTION",
    maximumCalls: 6,
    maximumAttemptsPerSlot: 1,
    automaticRetry: false,
    fallbackModel: null,
    maximumRunCostMicroUsd: 250_000,
    providerMonthlyHardSpendLimitCents: 25,
    providerMonthlyHardSpendLimitInterval: "MONTH",
    providerMonthlyHardSpendLimitEnforcementStatus: "ENFORCING",
    providerMonthlyLimitNature:
      "DEFENCE_IN_DEPTH_NOT_PER_RUN_BUDGET_AUTHORITY",
    providerEnforcedCredentialExpiry: "ABSENT",
    credentialLifetimeNature:
      "CARESLINK_OPERATIONAL_REVOCATION_WINDOW_ONLY",
  },
  database: {
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
    schema: "careslink_v1_generation",
    projectRefHmacAlgorithm: "HMAC-SHA256",
    projectRefHmacPurpose: "CARESLINK_PREVIEW_DATABASE_PROJECT_REF",
    projectRefHmacVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION,
    commonProjectRefHmacKeyRequired: true,
    callerCount: 5,
    callerMappings:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
    apiRoleExecute: false,
    executorMembership: false,
    privilegedRoleAttributes: false,
    directObjectPrivileges: false,
    additionalCallerShellMemberships: false,
    runnerTerminalContract: "SIGNED_SOURCE_ONLY_DEFAULT_OFF",
    runnerTerminalExecutorRole:
      "careslink_v1_preview_runner_terminal_executor",
    runnerTerminalCallerPresent: true,
    runnerTerminalCallerExecuteGranted: true,
    runnerTerminalRuntimeIdentityPresent: false,
    runnerTerminalRuntimeMembershipPresent: false,
    runnerTerminalCredentialResolverPresent: false,
    runnerTerminalRuntimeExecute: false,
    zeroFixtureRows: true,
    zeroActiveBackendsBeforeRun: true,
  },
  humanReview: {
    requiredReviewCount: 18,
    attributionRequired: true,
    sourceRunnerCallbackIsFinalReviewEvidence: false,
    finalRunApprovalRequiredSeparately: true,
  },
  blockedReasons:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS,
} as const);

export type CaresLinkV1CommunicationNotePreviewActivationPreflightPolicy =
  typeof ACTIVATION_PREFLIGHT_POLICY_CORE &
    Readonly<{ policyDigest: string }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST =
  "0e2582040995753efe95baa071fee4e0b58fa105c79db8bfa673abd66e2d01a1" as const;

if (
  createCanonicalSha256(ACTIVATION_PREFLIGHT_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY =
  deepFreeze({
    ...ACTIVATION_PREFLIGHT_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
  }) satisfies CaresLinkV1CommunicationNotePreviewActivationPreflightPolicy;

type CandidateCallerBinding = Readonly<{
  purpose:
    (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS)[number]["purpose"];
  callerShellRole:
    (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS)[number]["callerRole"];
  executorRole:
    (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS)[number]["executorRole"];
  rpcNames: readonly string[];
  loginIdentityHmac: string;
  loginCapability: true;
  rawCredentialMaterialPresent: false;
  roleInherit: false;
  superuser: false;
  createRole: false;
  createDb: false;
  replication: false;
  bypassRls: false;
  callerMembershipAdmin: false;
  callerMembershipInherit: false;
  callerMembershipSet: true;
  executorMembership: false;
  apiRoleMembership: false;
  otherCallerShellMemberships: false;
  directTablePrivileges: false;
  directSequencePrivileges: false;
  directFunctionPrivileges: false;
  activeBackendCount: 0;
}>;

export type CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate =
  Readonly<{
    version:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION;
    policyDigest:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST;
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED";
    observedAt: string;
    expiresAt: string;
    authorization: Readonly<{
      authorizationDigest: string;
      signatureSha256: string;
    }>;
    custody: Readonly<{
      snapshotDigest: string;
    }>;
    ownerTrust: Readonly<{
      registrySnapshotSha256: string;
      fetchedRegistryBytesSha256: string;
      registryReferenceSha256: string;
      registryObservedAt: string;
      authenticatedDeliveryEvidenceSha256: string;
      completeRevocationEvidenceSha256: string;
      signingCeremonyAttributionEvidenceSha256: string;
    }>;
    receiptCustody: Readonly<{
      observedAt: string;
      custodyReferenceSha256: string;
      keyIdHash: string;
      publicKeySha256: string;
      status: "NON_EXPORTABLE_ACTIVE_CANDIDATE";
      privateKeyMaterialPresent: false;
      exportAllowed: false;
      accessLogEvidenceSha256: string;
      rotationAndRevocationEvidenceSha256: string;
      teardownPlanSha256: string;
    }>;
    runnerTerminalCustody: Readonly<{
      observedAt: string;
      custodyReferenceSha256: string;
      keyIdHash: string;
      publicKeySha256: string;
      status: "NON_EXPORTABLE_ACTIVE_CANDIDATE";
      privateKeyMaterialPresent: false;
      exportAllowed: false;
      accessLogEvidenceSha256: string;
      rotationAndRevocationEvidenceSha256: string;
      teardownPlanSha256: string;
    }>;
    provider: Readonly<{
      observedAt: string;
      projectIdHmac: string;
      projectStatus: "ACTIVE";
      region: "AUSTRALIA";
      regionEvidenceSha256: string;
      retention: "ZERO_DATA_RETENTION";
      retentionEvidenceSha256: string;
      modifiedRetentionAmendmentSha256: string;
      ownerProcessingAcknowledgementSha256: string;
      modelId:
        typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS.modelId;
      modelAndPricingEvidenceSha256: string;
      monthlyHardSpendLimit: Readonly<{
        currency: "USD";
        amountCents: 25;
        interval: "MONTH";
        enforcementStatus: "ENFORCING";
        nature: "DEFENCE_IN_DEPTH_NOT_PER_RUN_BUDGET_AUTHORITY";
        evidenceSha256: string;
      }>;
      perRunBudget: Readonly<{
        maximumCalls: 6;
        maximumAttemptsPerSlot: 1;
        automaticRetry: false;
        fallbackModel: null;
        maximumCostMicroUsd: 250_000;
        enforcement: "APPLICATION_SIX_SLOT_RESERVATION_NO_RETRY";
      }>;
      serviceAccount: Readonly<{
        credentialReferenceSha256: string;
        scopesEvidenceSha256: string;
        administrationAllowed: false;
        providerEnforcedExpiry: "ABSENT";
        operationalExpiresAt: string;
        teardownBy: string;
        deleteAndAbsencePlanSha256: string;
      }>;
    }>;
    database: Readonly<{
      observedAt: string;
      targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW";
      projectRefHmacAlgorithm: "HMAC-SHA256";
      projectRefHmacPurpose: "CARESLINK_PREVIEW_DATABASE_PROJECT_REF";
      projectRefHmacVersion:
        typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION;
      projectRefHmacKeyReferenceSha256: string;
      targetProjectRefHmac: string;
      productionProjectRefHmac: string;
      defaultBranch: false;
      persistent: false;
      withData: false;
      productionExcluded: true;
      migrationCount: 39;
      orderedMigrationBasenamesSha256: string;
      orderedMigrationEntriesSha256: string;
      authorityMigrationSha256: string;
      custodyMigrationSha256: string;
      authorityAssertionSha256: string;
      custodyAssertionSha256: string;
      runnerTerminalMigrationSha256: string;
      signedRunnerTerminalMigrationSha256: string;
      runnerTerminalAcceptedUsageMigrationSha256: string;
      runnerTerminalAssertionSha256: string;
      runnerTerminalContract: "SIGNED_SOURCE_ONLY_DEFAULT_OFF";
      runnerTerminalExecutorRole:
        "careslink_v1_preview_runner_terminal_executor";
      runnerTerminalCallerPresent: true;
      runnerTerminalCallerExecuteGranted: true;
      runnerTerminalRuntimeIdentityPresent: false;
      runnerTerminalRuntimeMembershipPresent: false;
      runnerTerminalCredentialResolverPresent: false;
      runnerTerminalRuntimeExecute: false;
      apiRoleExecute: false;
      fixtureRowCount: 0;
      callerBindings: readonly CandidateCallerBinding[];
      sessionConfinementEvidenceSha256: string;
      credentialRotationEvidenceSha256: string;
      membershipTeardownEvidenceSha256: string;
      zeroBackendAbsenceEvidenceSha256: string;
    }>;
    humanReview: Readonly<{
      observedAt: string;
      requiredReviewCount: 18;
      attributionRequired: true;
      planSha256: string;
      reviewerAssignmentSha256: string;
      resultsStatus: "NOT_STARTED";
      finalRunApproval: "ABSENT";
    }>;
  }>;

export type CaresLinkV1CommunicationNotePreviewActivationPreflightResult =
  Readonly<{
    candidate:
      CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate;
    candidateDigest: string;
    activationReady: false;
    blockedReasons:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS;
  }>;

/**
 * Validates a content-free candidate assembled by trusted test code. It does
 * not authenticate external evidence, resolve a key, authorize a database
 * caller or produce any dispatch capability.
 */
export function validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
  candidate: unknown,
  options: Readonly<{
    now: string;
    verifiedAuthorization:
      CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
    custodySnapshot:
      CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot;
  }>,
): CaresLinkV1CommunicationNotePreviewActivationPreflightResult {
  try {
    assertPlainDataTree(candidate);
    assertPlainDataTree(options);
    return validateCandidate(candidate, options);
  } catch {
    throw unavailable();
  }
}

/** Paid/hosted activation remains unavailable in source. */
export function createCaresLinkV1CommunicationNotePreviewActivationPreflight(): never {
  throw unavailable();
}

function validateCandidate(
  value: unknown,
  options: Readonly<{
    now: string;
    verifiedAuthorization:
      CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
    custodySnapshot:
      CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot;
  }>,
): CaresLinkV1CommunicationNotePreviewActivationPreflightResult {
  const optionRecord = exactDataRecord(options, [
    "now",
    "verifiedAuthorization",
    "custodySnapshot",
  ]);
  const now = requireTimestamp(optionRecord.now);
  const verifiedAuthorization = optionRecord.verifiedAuthorization as
    CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
  const custodySnapshot =
    validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
      optionRecord.custodySnapshot,
      { now, verifiedAuthorization },
    );
  const object = exactDataRecord(value, [
    "version",
    "policyDigest",
    "status",
    "observedAt",
    "expiresAt",
    "authorization",
    "custody",
    "ownerTrust",
    "receiptCustody",
    "runnerTerminalCustody",
    "provider",
    "database",
    "humanReview",
  ]);
  if (
    object.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION ||
    object.policyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST ||
    object.status !== "TEST_ONLY_CANDIDATE_NOT_APPROVED"
  ) {
    throw unavailable();
  }

  const observedAt = requireTimestamp(object.observedAt);
  const expiresAt = requireTimestamp(object.expiresAt);
  validateFreshWindow({
    observedAt,
    expiresAt,
    now,
    authorizationIssuedAt: verifiedAuthorization.statement.issuedAt,
    authorizationNotBefore: verifiedAuthorization.statement.notBefore,
    authorizationExpiresAt: verifiedAuthorization.statement.expiresAt,
    providerCredentialIssuedAt:
      custodySnapshot.providerCredential.issuedAt,
  });

  const authorization = validateAuthorizationBinding(
    object.authorization,
    verifiedAuthorization,
  );
  const custody = validateCustodyBinding(object.custody, custodySnapshot);
  const ownerTrust = validateOwnerTrust(
    object.ownerTrust,
    custodySnapshot,
    observedAt,
    now,
  );
  const receiptCustody = validateReceiptCustody(
    object.receiptCustody,
    custodySnapshot,
    observedAt,
  );
  const runnerTerminalCustody = validateRunnerTerminalCustody(
    object.runnerTerminalCustody,
    custodySnapshot,
    observedAt,
  );
  const provider = validateProvider(
    object.provider,
    verifiedAuthorization,
    custodySnapshot,
    expiresAt,
    observedAt,
  );
  const database = validateDatabase(
    object.database,
    custodySnapshot,
    observedAt,
  );
  const humanReview = validateHumanReview(
    object.humanReview,
    observedAt,
  );

  validatePurposeSeparation({
    authorization,
    custody,
    ownerTrust,
    receiptCustody,
    runnerTerminalCustody,
    provider,
    database,
    humanReview,
    custodySnapshot,
  });

  const candidate = deepFreeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED" as const,
    observedAt,
    expiresAt,
    authorization,
    custody,
    ownerTrust,
    receiptCustody,
    runnerTerminalCustody,
    provider,
    database,
    humanReview,
  });
  return deepFreeze({
    candidate,
    candidateDigest: createCanonicalSha256(candidate),
    activationReady: false as const,
    blockedReasons:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS,
  });
}

function validateAuthorizationBinding(
  value: unknown,
  verifiedAuthorization:
    CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
) {
  const object = exactDataRecord(value, [
    "authorizationDigest",
    "signatureSha256",
  ]);
  const authorizationDigest = requireSha256(object.authorizationDigest);
  const signatureSha256 = requireSha256(object.signatureSha256);
  if (
    authorizationDigest !== verifiedAuthorization.authorizationDigest ||
    signatureSha256 !== verifiedAuthorization.signatureSha256
  ) {
    throw unavailable();
  }
  return deepFreeze({ authorizationDigest, signatureSha256 });
}

function validateCustodyBinding(
  value: unknown,
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
) {
  const object = exactDataRecord(value, ["snapshotDigest"]);
  const snapshotDigest = requireSha256(object.snapshotDigest);
  if (snapshotDigest !== createCanonicalSha256(custodySnapshot)) {
    throw unavailable();
  }
  return deepFreeze({ snapshotDigest });
}

function validateOwnerTrust(
  value: unknown,
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  observedAt: string,
  now: string,
) {
  const object = exactDataRecord(value, [
    "registrySnapshotSha256",
    "fetchedRegistryBytesSha256",
    "registryReferenceSha256",
    "registryObservedAt",
    "authenticatedDeliveryEvidenceSha256",
    "completeRevocationEvidenceSha256",
    "signingCeremonyAttributionEvidenceSha256",
  ]);
  const registrySnapshotSha256 = requireSha256(
    object.registrySnapshotSha256,
  );
  const fetchedRegistryBytesSha256 = requireSha256(
    object.fetchedRegistryBytesSha256,
  );
  const registryReferenceSha256 = requireSha256(
    object.registryReferenceSha256,
  );
  const registryObservedAt = requireTimestamp(object.registryObservedAt);
  if (
    registrySnapshotSha256 !==
      custodySnapshot.ownerTrustRegistry.registrySnapshotSha256 ||
    fetchedRegistryBytesSha256 !== registrySnapshotSha256 ||
    registryReferenceSha256 !==
      custodySnapshot.ownerTrustRegistry.registryReferenceSha256 ||
    registryObservedAt !==
      custodySnapshot.ownerTrustRegistry.observedAt ||
    registryObservedAt !== observedAt ||
    Date.parse(now) - Date.parse(registryObservedAt) >
      MAXIMUM_EVIDENCE_AGE_MS
  ) {
    throw unavailable();
  }
  return deepFreeze({
    registrySnapshotSha256,
    fetchedRegistryBytesSha256,
    registryReferenceSha256,
    registryObservedAt,
    authenticatedDeliveryEvidenceSha256: requireSha256(
      object.authenticatedDeliveryEvidenceSha256,
    ),
    completeRevocationEvidenceSha256: requireSha256(
      object.completeRevocationEvidenceSha256,
    ),
    signingCeremonyAttributionEvidenceSha256: requireSha256(
      object.signingCeremonyAttributionEvidenceSha256,
    ),
  });
}

function validateReceiptCustody(
  value: unknown,
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  candidateObservedAt: string,
) {
  const object = exactDataRecord(value, [
    "observedAt",
    "custodyReferenceSha256",
    "keyIdHash",
    "publicKeySha256",
    "status",
    "privateKeyMaterialPresent",
    "exportAllowed",
    "accessLogEvidenceSha256",
    "rotationAndRevocationEvidenceSha256",
    "teardownPlanSha256",
  ]);
  const custodyReferenceSha256 = requireSha256(
    object.custodyReferenceSha256,
  );
  const keyIdHash = requireSha256(object.keyIdHash);
  const publicKeySha256 = requireSha256(object.publicKeySha256);
  if (
    custodyReferenceSha256 !==
      custodySnapshot.receiptSigner.custodyReferenceSha256 ||
    keyIdHash !== custodySnapshot.receiptSigner.keyIdHash ||
    publicKeySha256 !== custodySnapshot.receiptSigner.publicKeySha256 ||
    object.status !== "NON_EXPORTABLE_ACTIVE_CANDIDATE" ||
    object.privateKeyMaterialPresent !== false ||
    object.exportAllowed !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    observedAt: requireMatchingTimestamp(
      object.observedAt,
      candidateObservedAt,
    ),
    custodyReferenceSha256,
    keyIdHash,
    publicKeySha256,
    status: "NON_EXPORTABLE_ACTIVE_CANDIDATE" as const,
    privateKeyMaterialPresent: false as const,
    exportAllowed: false as const,
    accessLogEvidenceSha256: requireSha256(
      object.accessLogEvidenceSha256,
    ),
    rotationAndRevocationEvidenceSha256: requireSha256(
      object.rotationAndRevocationEvidenceSha256,
    ),
    teardownPlanSha256: requireSha256(object.teardownPlanSha256),
  });
}

function validateRunnerTerminalCustody(
  value: unknown,
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  candidateObservedAt: string,
) {
  const object = exactDataRecord(value, [
    "observedAt",
    "custodyReferenceSha256",
    "keyIdHash",
    "publicKeySha256",
    "status",
    "privateKeyMaterialPresent",
    "exportAllowed",
    "accessLogEvidenceSha256",
    "rotationAndRevocationEvidenceSha256",
    "teardownPlanSha256",
  ]);
  const custodyReferenceSha256 = requireSha256(
    object.custodyReferenceSha256,
  );
  const keyIdHash = requireSha256(object.keyIdHash);
  const publicKeySha256 = requireSha256(object.publicKeySha256);
  if (
    custodyReferenceSha256 !==
      custodySnapshot.runnerTerminalSigner.custodyReferenceSha256 ||
    keyIdHash !== custodySnapshot.runnerTerminalSigner.keyIdHash ||
    publicKeySha256 !==
      custodySnapshot.runnerTerminalSigner.publicKeySha256 ||
    object.status !== "NON_EXPORTABLE_ACTIVE_CANDIDATE" ||
    object.privateKeyMaterialPresent !== false ||
    object.exportAllowed !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    observedAt: requireMatchingTimestamp(
      object.observedAt,
      candidateObservedAt,
    ),
    custodyReferenceSha256,
    keyIdHash,
    publicKeySha256,
    status: "NON_EXPORTABLE_ACTIVE_CANDIDATE" as const,
    privateKeyMaterialPresent: false as const,
    exportAllowed: false as const,
    accessLogEvidenceSha256: requireSha256(
      object.accessLogEvidenceSha256,
    ),
    rotationAndRevocationEvidenceSha256: requireSha256(
      object.rotationAndRevocationEvidenceSha256,
    ),
    teardownPlanSha256: requireSha256(object.teardownPlanSha256),
  });
}

function validateProvider(
  value: unknown,
  verifiedAuthorization:
    CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  candidateExpiresAt: string,
  candidateObservedAt: string,
) {
  const object = exactDataRecord(value, [
    "observedAt",
    "projectIdHmac",
    "projectStatus",
    "region",
    "regionEvidenceSha256",
    "retention",
    "retentionEvidenceSha256",
    "modifiedRetentionAmendmentSha256",
    "ownerProcessingAcknowledgementSha256",
    "modelId",
    "modelAndPricingEvidenceSha256",
    "monthlyHardSpendLimit",
    "perRunBudget",
    "serviceAccount",
  ]);
  const environmentEvidence =
    verifiedAuthorization.statement.environmentEvidence;
  const projectIdHmac = requireSha256(object.projectIdHmac);
  if (
    projectIdHmac !== environmentEvidence.openAiProjectIdHmac ||
    projectIdHmac !==
      custodySnapshot.authorizationBinding.openAiProjectIdHmac ||
    object.projectStatus !== "ACTIVE" ||
    object.region !== "AUSTRALIA" ||
    object.retention !== "ZERO_DATA_RETENTION" ||
    object.modelId !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS.modelId
  ) {
    throw unavailable();
  }
  const regionEvidenceSha256 = requireExpectedSha256(
    object.regionEvidenceSha256,
    environmentEvidence.australiaProjectConfigurationSha256,
  );
  const retentionEvidenceSha256 = requireExpectedSha256(
    object.retentionEvidenceSha256,
    environmentEvidence.zeroDataRetentionConfigurationSha256,
  );
  const modifiedRetentionAmendmentSha256 = requireExpectedSha256(
    object.modifiedRetentionAmendmentSha256,
    environmentEvidence.modifiedRetentionAmendmentSha256,
  );
  const ownerProcessingAcknowledgementSha256 = requireExpectedSha256(
    object.ownerProcessingAcknowledgementSha256,
    environmentEvidence.ownerProcessingAcknowledgementSha256,
  );
  const modelAndPricingEvidenceSha256 = requireExpectedSha256(
    object.modelAndPricingEvidenceSha256,
    environmentEvidence.pricingAndModelAvailabilitySha256,
  );
  const monthlyHardSpendLimit = validateMonthlyHardSpendLimit(
    object.monthlyHardSpendLimit,
    environmentEvidence.providerSpendLimitSha256,
  );
  const perRunBudget = validatePerRunBudget(object.perRunBudget);
  const serviceAccount = validateServiceAccount(
    object.serviceAccount,
    environmentEvidence.temporaryCredentialReferenceSha256,
    custodySnapshot,
    candidateExpiresAt,
  );
  requirePairwiseDistinct([
    regionEvidenceSha256,
    retentionEvidenceSha256,
    modifiedRetentionAmendmentSha256,
    ownerProcessingAcknowledgementSha256,
    modelAndPricingEvidenceSha256,
    monthlyHardSpendLimit.evidenceSha256,
  ]);
  return deepFreeze({
    observedAt: requireMatchingTimestamp(
      object.observedAt,
      candidateObservedAt,
    ),
    projectIdHmac,
    projectStatus: "ACTIVE" as const,
    region: "AUSTRALIA" as const,
    regionEvidenceSha256,
    retention: "ZERO_DATA_RETENTION" as const,
    retentionEvidenceSha256,
    modifiedRetentionAmendmentSha256,
    ownerProcessingAcknowledgementSha256,
    modelId:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS.modelId,
    modelAndPricingEvidenceSha256,
    monthlyHardSpendLimit,
    perRunBudget,
    serviceAccount,
  });
}

function validateMonthlyHardSpendLimit(
  value: unknown,
  expectedEvidenceSha256: string,
) {
  const object = exactDataRecord(value, [
    "currency",
    "amountCents",
    "interval",
    "enforcementStatus",
    "nature",
    "evidenceSha256",
  ]);
  if (
    object.currency !== "USD" ||
    object.amountCents !== 25 ||
    object.interval !== "MONTH" ||
    object.enforcementStatus !== "ENFORCING" ||
    object.nature !==
      "DEFENCE_IN_DEPTH_NOT_PER_RUN_BUDGET_AUTHORITY"
  ) {
    throw unavailable();
  }
  return deepFreeze({
    currency: "USD" as const,
    amountCents: 25 as const,
    interval: "MONTH" as const,
    enforcementStatus: "ENFORCING" as const,
    nature: "DEFENCE_IN_DEPTH_NOT_PER_RUN_BUDGET_AUTHORITY" as const,
    evidenceSha256: requireExpectedSha256(
      object.evidenceSha256,
      expectedEvidenceSha256,
    ),
  });
}

function validatePerRunBudget(value: unknown) {
  const object = exactDataRecord(value, [
    "maximumCalls",
    "maximumAttemptsPerSlot",
    "automaticRetry",
    "fallbackModel",
    "maximumCostMicroUsd",
    "enforcement",
  ]);
  if (
    object.maximumCalls !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY.budget
        .maximumCalls ||
    object.maximumAttemptsPerSlot !== 1 ||
    object.automaticRetry !== false ||
    object.fallbackModel !== null ||
    object.maximumCostMicroUsd !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY.budget
        .maximumCostMicroUsd ||
    object.enforcement !==
      "APPLICATION_SIX_SLOT_RESERVATION_NO_RETRY"
  ) {
    throw unavailable();
  }
  return deepFreeze({
    maximumCalls: 6 as const,
    maximumAttemptsPerSlot: 1 as const,
    automaticRetry: false as const,
    fallbackModel: null,
    maximumCostMicroUsd: 250_000 as const,
    enforcement: "APPLICATION_SIX_SLOT_RESERVATION_NO_RETRY" as const,
  });
}

function validateServiceAccount(
  value: unknown,
  expectedCredentialReferenceSha256: string,
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  candidateExpiresAt: string,
) {
  const object = exactDataRecord(value, [
    "credentialReferenceSha256",
    "scopesEvidenceSha256",
    "administrationAllowed",
    "providerEnforcedExpiry",
    "operationalExpiresAt",
    "teardownBy",
    "deleteAndAbsencePlanSha256",
  ]);
  const credentialReferenceSha256 = requireExpectedSha256(
    object.credentialReferenceSha256,
    expectedCredentialReferenceSha256,
  );
  if (
    credentialReferenceSha256 !==
      custodySnapshot.providerCredential.credentialReferenceSha256 ||
    object.administrationAllowed !== false ||
    object.providerEnforcedExpiry !== "ABSENT"
  ) {
    throw unavailable();
  }
  const operationalExpiresAt = requireTimestamp(
    object.operationalExpiresAt,
  );
  const teardownBy = requireTimestamp(object.teardownBy);
  if (
    operationalExpiresAt !== custodySnapshot.providerCredential.expiresAt ||
    teardownBy !== custodySnapshot.providerCredential.revokeBy ||
    Date.parse(candidateExpiresAt) > Date.parse(operationalExpiresAt) ||
    Date.parse(teardownBy) < Date.parse(operationalExpiresAt)
  ) {
    throw unavailable();
  }
  return deepFreeze({
    credentialReferenceSha256,
    scopesEvidenceSha256: requireExpectedSha256(
      object.scopesEvidenceSha256,
      custodySnapshot.providerCredential.scopesEvidenceSha256,
    ),
    administrationAllowed: false as const,
    providerEnforcedExpiry: "ABSENT" as const,
    operationalExpiresAt,
    teardownBy,
    deleteAndAbsencePlanSha256: requireSha256(
      object.deleteAndAbsencePlanSha256,
    ),
  });
}

function validateDatabase(
  value: unknown,
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  candidateObservedAt: string,
) {
  const object = exactDataRecord(value, [
    "observedAt",
    "targetClass",
    "projectRefHmacAlgorithm",
    "projectRefHmacPurpose",
    "projectRefHmacVersion",
    "projectRefHmacKeyReferenceSha256",
    "targetProjectRefHmac",
    "productionProjectRefHmac",
    "defaultBranch",
    "persistent",
    "withData",
    "productionExcluded",
    "migrationCount",
    "orderedMigrationBasenamesSha256",
    "orderedMigrationEntriesSha256",
    "authorityMigrationSha256",
    "custodyMigrationSha256",
    "authorityAssertionSha256",
    "custodyAssertionSha256",
    "runnerTerminalMigrationSha256",
    "signedRunnerTerminalMigrationSha256",
    "runnerTerminalAcceptedUsageMigrationSha256",
    "runnerTerminalAssertionSha256",
    "runnerTerminalContract",
    "runnerTerminalExecutorRole",
    "runnerTerminalCallerPresent",
    "runnerTerminalCallerExecuteGranted",
    "runnerTerminalRuntimeIdentityPresent",
    "runnerTerminalRuntimeMembershipPresent",
    "runnerTerminalCredentialResolverPresent",
    "runnerTerminalRuntimeExecute",
    "apiRoleExecute",
    "fixtureRowCount",
    "callerBindings",
    "sessionConfinementEvidenceSha256",
    "credentialRotationEvidenceSha256",
    "membershipTeardownEvidenceSha256",
    "zeroBackendAbsenceEvidenceSha256",
  ]);
  if (
    object.projectRefHmacAlgorithm !== "HMAC-SHA256" ||
    object.projectRefHmacPurpose !==
      "CARESLINK_PREVIEW_DATABASE_PROJECT_REF" ||
    object.projectRefHmacVersion !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION ||
    object.targetClass !==
      "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" ||
    object.defaultBranch !== false ||
    object.persistent !== false ||
    object.withData !== false ||
    object.productionExcluded !== true ||
    object.migrationCount !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS
        .migrationCount ||
    object.apiRoleExecute !== false ||
    object.fixtureRowCount !== 0 ||
    object.runnerTerminalContract !== "SIGNED_SOURCE_ONLY_DEFAULT_OFF" ||
    object.runnerTerminalExecutorRole !==
      "careslink_v1_preview_runner_terminal_executor" ||
    object.runnerTerminalCallerPresent !== true ||
    object.runnerTerminalCallerExecuteGranted !== true ||
    object.runnerTerminalRuntimeIdentityPresent !== false ||
    object.runnerTerminalRuntimeMembershipPresent !== false ||
    object.runnerTerminalCredentialResolverPresent !== false ||
    object.runnerTerminalRuntimeExecute !== false
  ) {
    throw unavailable();
  }
  const targetProjectRefHmac = requireSha256(object.targetProjectRefHmac);
  const productionProjectRefHmac = requireSha256(
    object.productionProjectRefHmac,
  );
  const projectRefHmacKeyReferenceSha256 = requireSha256(
    object.projectRefHmacKeyReferenceSha256,
  );
  if (
    targetProjectRefHmac === productionProjectRefHmac ||
    new Set([
      projectRefHmacKeyReferenceSha256,
      custodySnapshot.hmacDomains.callerIdentity.keyReferenceSha256,
      custodySnapshot.hmacDomains.providerCorrelation.keyReferenceSha256,
    ]).size !== 3
  ) {
    throw unavailable();
  }
  const callerBindings = validateCallerBindings(
    object.callerBindings,
    custodySnapshot,
  );
  return deepFreeze({
    observedAt: requireMatchingTimestamp(
      object.observedAt,
      candidateObservedAt,
    ),
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" as const,
    projectRefHmacAlgorithm: "HMAC-SHA256" as const,
    projectRefHmacPurpose:
      "CARESLINK_PREVIEW_DATABASE_PROJECT_REF" as const,
    projectRefHmacVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION,
    projectRefHmacKeyReferenceSha256,
    targetProjectRefHmac,
    productionProjectRefHmac,
    defaultBranch: false as const,
    persistent: false as const,
    withData: false as const,
    productionExcluded: true as const,
    migrationCount: 39 as const,
    orderedMigrationBasenamesSha256: requireEvidencePin(
      object.orderedMigrationBasenamesSha256,
      "orderedMigrationBasenamesSha256",
    ),
    orderedMigrationEntriesSha256: requireEvidencePin(
      object.orderedMigrationEntriesSha256,
      "orderedMigrationEntriesSha256",
    ),
    authorityMigrationSha256: requireEvidencePin(
      object.authorityMigrationSha256,
      "authorityMigrationSha256",
    ),
    custodyMigrationSha256: requireEvidencePin(
      object.custodyMigrationSha256,
      "custodyMigrationSha256",
    ),
    authorityAssertionSha256: requireEvidencePin(
      object.authorityAssertionSha256,
      "authorityAssertionSha256",
    ),
    custodyAssertionSha256: requireEvidencePin(
      object.custodyAssertionSha256,
      "custodyAssertionSha256",
    ),
    runnerTerminalMigrationSha256: requireEvidencePin(
      object.runnerTerminalMigrationSha256,
      "runnerTerminalMigrationSha256",
    ),
    signedRunnerTerminalMigrationSha256: requireEvidencePin(
      object.signedRunnerTerminalMigrationSha256,
      "signedRunnerTerminalMigrationSha256",
    ),
    runnerTerminalAcceptedUsageMigrationSha256: requireEvidencePin(
      object.runnerTerminalAcceptedUsageMigrationSha256,
      "runnerTerminalAcceptedUsageMigrationSha256",
    ),
    runnerTerminalAssertionSha256: requireEvidencePin(
      object.runnerTerminalAssertionSha256,
      "runnerTerminalAssertionSha256",
    ),
    runnerTerminalContract: "SIGNED_SOURCE_ONLY_DEFAULT_OFF" as const,
    runnerTerminalExecutorRole:
      "careslink_v1_preview_runner_terminal_executor" as const,
    runnerTerminalCallerPresent: true as const,
    runnerTerminalCallerExecuteGranted: true as const,
    runnerTerminalRuntimeIdentityPresent: false as const,
    runnerTerminalRuntimeMembershipPresent: false as const,
    runnerTerminalCredentialResolverPresent: false as const,
    runnerTerminalRuntimeExecute: false as const,
    apiRoleExecute: false as const,
    fixtureRowCount: 0 as const,
    callerBindings,
    sessionConfinementEvidenceSha256: requireSha256(
      object.sessionConfinementEvidenceSha256,
    ),
    credentialRotationEvidenceSha256: requireSha256(
      object.credentialRotationEvidenceSha256,
    ),
    membershipTeardownEvidenceSha256: requireSha256(
      object.membershipTeardownEvidenceSha256,
    ),
    zeroBackendAbsenceEvidenceSha256: requireSha256(
      object.zeroBackendAbsenceEvidenceSha256,
    ),
  });
}

function validateCallerBindings(
  value: unknown,
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.length
  ) {
    throw unavailable();
  }
  const identityHmacs: string[] = [];
  const callers: CandidateCallerBinding[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const expected =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS[index];
    const object = exactDataRecord(entry, [
      "purpose",
      "callerShellRole",
      "executorRole",
      "rpcNames",
      "loginIdentityHmac",
      "loginCapability",
      "rawCredentialMaterialPresent",
      "roleInherit",
      "superuser",
      "createRole",
      "createDb",
      "replication",
      "bypassRls",
      "callerMembershipAdmin",
      "callerMembershipInherit",
      "callerMembershipSet",
      "executorMembership",
      "apiRoleMembership",
      "otherCallerShellMemberships",
      "directTablePrivileges",
      "directSequencePrivileges",
      "directFunctionPrivileges",
      "activeBackendCount",
    ]);
    if (
      object.purpose !== expected.purpose ||
      object.callerShellRole !== expected.callerRole ||
      object.executorRole !== expected.executorRole ||
      !exactStringArray(object.rpcNames, expected.rpcNames) ||
      object.loginCapability !== true ||
      object.rawCredentialMaterialPresent !== false ||
      object.roleInherit !== false ||
      object.superuser !== false ||
      object.createRole !== false ||
      object.createDb !== false ||
      object.replication !== false ||
      object.bypassRls !== false ||
      object.callerMembershipAdmin !== false ||
      object.callerMembershipInherit !== false ||
      object.callerMembershipSet !== true ||
      object.executorMembership !== false ||
      object.apiRoleMembership !== false ||
      object.otherCallerShellMemberships !== false ||
      object.directTablePrivileges !== false ||
      object.directSequencePrivileges !== false ||
      object.directFunctionPrivileges !== false ||
      object.activeBackendCount !== 0
    ) {
      throw unavailable();
    }
    const loginIdentityHmac = requireSha256(object.loginIdentityHmac);
    if (
      loginIdentityHmac !== custodySnapshot.callers[index].identityHmac
    ) {
      throw unavailable();
    }
    identityHmacs.push(loginIdentityHmac);
    callers.push(deepFreeze({
      purpose: expected.purpose,
      callerShellRole: expected.callerRole,
      executorRole: expected.executorRole,
      rpcNames: deepFreeze([...expected.rpcNames]),
      loginIdentityHmac,
      loginCapability: true as const,
      rawCredentialMaterialPresent: false as const,
      roleInherit: false as const,
      superuser: false as const,
      createRole: false as const,
      createDb: false as const,
      replication: false as const,
      bypassRls: false as const,
      callerMembershipAdmin: false as const,
      callerMembershipInherit: false as const,
      callerMembershipSet: true as const,
      executorMembership: false as const,
      apiRoleMembership: false as const,
      otherCallerShellMemberships: false as const,
      directTablePrivileges: false as const,
      directSequencePrivileges: false as const,
      directFunctionPrivileges: false as const,
      activeBackendCount: 0 as const,
    }));
  }
  requirePairwiseDistinct(identityHmacs);
  return deepFreeze(callers);
}

function validateHumanReview(
  value: unknown,
  candidateObservedAt: string,
) {
  const object = exactDataRecord(value, [
    "observedAt",
    "requiredReviewCount",
    "attributionRequired",
    "planSha256",
    "reviewerAssignmentSha256",
    "resultsStatus",
    "finalRunApproval",
  ]);
  if (
    object.requiredReviewCount !== 18 ||
    object.attributionRequired !== true ||
    object.resultsStatus !== "NOT_STARTED" ||
    object.finalRunApproval !== "ABSENT"
  ) {
    throw unavailable();
  }
  return deepFreeze({
    observedAt: requireMatchingTimestamp(
      object.observedAt,
      candidateObservedAt,
    ),
    requiredReviewCount: 18 as const,
    attributionRequired: true as const,
    planSha256: requireSha256(object.planSha256),
    reviewerAssignmentSha256: requireSha256(
      object.reviewerAssignmentSha256,
    ),
    resultsStatus: "NOT_STARTED" as const,
    finalRunApproval: "ABSENT" as const,
  });
}

function validatePurposeSeparation(input: Readonly<{
  authorization:
    CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate["authorization"];
  custody:
    CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate["custody"];
  ownerTrust:
    CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate["ownerTrust"];
  receiptCustody:
    CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate["receiptCustody"];
  runnerTerminalCustody:
    CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate["runnerTerminalCustody"];
  provider:
    CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate["provider"];
  database:
    CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate["database"];
  humanReview:
    CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate["humanReview"];
  custodySnapshot:
    CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot;
}>): void {
  requirePairwiseDistinct([
    input.authorization.authorizationDigest,
    input.authorization.signatureSha256,
    input.custody.snapshotDigest,
    // fetchedRegistryBytesSha256 intentionally equals this snapshot digest.
    input.ownerTrust.registrySnapshotSha256,
    input.ownerTrust.registryReferenceSha256,
    input.ownerTrust.authenticatedDeliveryEvidenceSha256,
    input.ownerTrust.completeRevocationEvidenceSha256,
    input.ownerTrust.signingCeremonyAttributionEvidenceSha256,
    input.receiptCustody.custodyReferenceSha256,
    input.receiptCustody.keyIdHash,
    input.receiptCustody.publicKeySha256,
    input.receiptCustody.accessLogEvidenceSha256,
    input.receiptCustody.rotationAndRevocationEvidenceSha256,
    input.receiptCustody.teardownPlanSha256,
    input.runnerTerminalCustody.custodyReferenceSha256,
    input.runnerTerminalCustody.keyIdHash,
    input.runnerTerminalCustody.publicKeySha256,
    input.runnerTerminalCustody.accessLogEvidenceSha256,
    input.runnerTerminalCustody.rotationAndRevocationEvidenceSha256,
    input.runnerTerminalCustody.teardownPlanSha256,
    input.provider.projectIdHmac,
    input.provider.regionEvidenceSha256,
    input.provider.retentionEvidenceSha256,
    input.provider.modifiedRetentionAmendmentSha256,
    input.provider.ownerProcessingAcknowledgementSha256,
    input.provider.modelAndPricingEvidenceSha256,
    input.provider.monthlyHardSpendLimit.evidenceSha256,
    input.provider.serviceAccount.credentialReferenceSha256,
    input.provider.serviceAccount.scopesEvidenceSha256,
    input.provider.serviceAccount.deleteAndAbsencePlanSha256,
    input.database.projectRefHmacKeyReferenceSha256,
    input.database.targetProjectRefHmac,
    input.database.productionProjectRefHmac,
    input.database.orderedMigrationBasenamesSha256,
    input.database.orderedMigrationEntriesSha256,
    input.database.authorityMigrationSha256,
    input.database.custodyMigrationSha256,
    input.database.authorityAssertionSha256,
    input.database.custodyAssertionSha256,
    input.database.runnerTerminalMigrationSha256,
    input.database.signedRunnerTerminalMigrationSha256,
    input.database.runnerTerminalAcceptedUsageMigrationSha256,
    input.database.runnerTerminalAssertionSha256,
    ...input.database.callerBindings.map(
      (caller) => caller.loginIdentityHmac,
    ),
    input.database.sessionConfinementEvidenceSha256,
    input.database.credentialRotationEvidenceSha256,
    input.database.membershipTeardownEvidenceSha256,
    input.database.zeroBackendAbsenceEvidenceSha256,
    input.humanReview.planSha256,
    input.humanReview.reviewerAssignmentSha256,
    input.custodySnapshot.hmacDomains.callerIdentity.keyReferenceSha256,
    input.custodySnapshot.hmacDomains.providerCorrelation.keyReferenceSha256,
    input.custodySnapshot.providerCredential.serviceAccountIdHmac,
    input.custodySnapshot.providerCredential.apiKeyIdHmac,
    ...input.custodySnapshot.callers.map(
      (caller) => caller.credentialReferenceSha256,
    ),
  ]);
}

function validateFreshWindow(input: Readonly<{
  observedAt: string;
  expiresAt: string;
  now: string;
  authorizationIssuedAt: string;
  authorizationNotBefore: string;
  authorizationExpiresAt: string;
  providerCredentialIssuedAt: string;
}>) {
  const observedMs = Date.parse(input.observedAt);
  const expiresMs = Date.parse(input.expiresAt);
  const nowMs = Date.parse(input.now);
  if (
    observedMs > nowMs + CLOCK_SKEW_MS ||
    nowMs - observedMs > MAXIMUM_EVIDENCE_AGE_MS ||
    observedMs < Date.parse(input.authorizationIssuedAt) ||
    observedMs < Date.parse(input.authorizationNotBefore) ||
    observedMs < Date.parse(input.providerCredentialIssuedAt) ||
    expiresMs <= nowMs ||
    expiresMs <= observedMs ||
    expiresMs - observedMs > MAXIMUM_CANDIDATE_LIFETIME_MS ||
    expiresMs > Date.parse(input.authorizationExpiresAt)
  ) {
    throw unavailable();
  }
}

function requireEvidencePin(
  value: unknown,
  key: keyof typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS,
) {
  const digest = requireSha256(value);
  if (
    digest !==
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS[key]
  ) {
    throw unavailable();
  }
  return digest;
}

function requireExpectedSha256(value: unknown, expected: string) {
  const digest = requireSha256(value);
  if (digest !== expected) throw unavailable();
  return digest;
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
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw unavailable();
  }
  return value;
}

function requireMatchingTimestamp(value: unknown, expected: string) {
  const timestamp = requireTimestamp(value);
  if (timestamp !== expected) throw unavailable();
  return timestamp;
}

function requirePairwiseDistinct(values: readonly string[]) {
  if (new Set(values).size !== values.length) throw unavailable();
}

function exactStringArray(
  value: unknown,
  expected: readonly string[],
) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== expected.length
  ) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (value[index] !== expected[index]) return false;
  }
  return true;
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
  ) {
    throw unavailable();
  }
  const copy: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      throw unavailable();
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function assertPlainDataTree(value: unknown): void {
  assertPlainDataNode(
    value,
    { seen: new Set<object>(), nodeCount: 0 },
    0,
  );
}

function assertPlainDataNode(
  value: unknown,
  state: { seen: Set<object>; nodeCount: number },
  depth: number,
): void {
  if (value === null || typeof value !== "object") return;
  state.nodeCount += 1;
  if (
    depth > MAXIMUM_PLAIN_DATA_DEPTH ||
    state.nodeCount > MAXIMUM_PLAIN_DATA_NODE_COUNT ||
    nodeTypes.isProxy(value) ||
    state.seen.has(value)
  ) {
    throw unavailable();
  }
  state.seen.add(value);
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > MAXIMUM_PLAIN_DATA_ARRAY_LENGTH
    ) {
      throw unavailable();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const expectedKeys = [
      ...Array.from({ length: value.length }, (_, index) => String(index)),
      "length",
    ];
    if (
      keys.some((key) => typeof key !== "string") ||
      keys.length !== expectedKeys.length ||
      expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
    ) {
      throw unavailable();
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        throw unavailable();
      }
      assertPlainDataNode(descriptor.value, state, depth + 1);
    }
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > MAXIMUM_PLAIN_DATA_OBJECT_KEY_COUNT) {
    throw unavailable();
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") throw unavailable();
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || !descriptor.enumerable) {
      throw unavailable();
    }
    assertPlainDataNode(descriptor.value, state, depth + 1);
  }
}

function createCanonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "VALIDATION_ERROR",
    "Communication Note preview activation preflight is unavailable",
  );
}
