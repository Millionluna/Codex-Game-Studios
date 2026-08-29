import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES } from "./communication-note-golden";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight,
  type CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate,
} from "./communication-note-preview-activation-preflight.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt,
  type CaresLinkV1CommunicationNotePreviewDispatchReceiptEnvelope,
  type CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement,
  type CaresLinkV1CommunicationNotePreviewReceiptOutcome,
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

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_VERSION =
  "coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-i.v4" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAXIMUM_PLAIN_DATA_ARRAY_LENGTH = 256;
const MAXIMUM_PLAIN_DATA_OBJECT_KEY_COUNT = 256;
const MAXIMUM_PLAIN_DATA_DEPTH = 32;
const MAXIMUM_PLAIN_DATA_NODE_COUNT = 4_096;
const RUNNER_CRITICAL_CHECK_KEYS = [
  "STRICT_SCHEMA",
  "SHARED_OUTPUT_PRIVACY",
  "DATE_TIME_PARITY",
  "NUMERIC_PARITY",
  "DECISION_LANGUAGE",
  "REFUSAL_ABSENT",
  "HUMAN_SEMANTIC_GROUNDEDNESS",
] as const;
const RUNNER_HUMAN_REVIEW_LOCALES = ["en", "zh-Hans", "zh-Hant"] as const;
const RUNNER_POST_RECEIPT_FAILURE_REASONS = [
  "CANCELLED",
  "PROVIDER_EVIDENCE_INVALID",
  "GOLDEN_EVALUATION_FAILED",
  "HUMAN_REVIEW_FAILED",
  "REPORT_INVALID",
] as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_BLOCKED_REASONS =
  deepFreeze([
    "ACTIVATION_PREFLIGHT_REMAINS_BLOCKED",
    "PRE_RUN_DISPATCH_APPROVAL_ABSENT",
    "PURPOSE_SCOPED_RUNTIME_IDENTITY_NOT_ACTIVATED",
    "DATABASE_ATTESTED_RESERVED_AT_ABSENT",
    "DURABLE_RUNNER_TERMINAL_STATE_ABSENT",
  ] as const);

const COORDINATOR_POLICY_CORE = deepFreeze({
  version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_VERSION,
  status: "SOURCE_CONTRACT_ONLY_NO_EXECUTION_CAPABILITY",
  capability: "TEST_ONLY_TRANSCRIPT_VALIDATION",
  coordinatorReady: false,
  activationReady: false,
  dispatchCapability: "ABSENT",
  preRunDispatchApproved: false,
  postRunEvaluationAccepted: false,
  databaseContract: {
    reservationResultReservedAt:
      "PRESENT_SOURCE_ONLY_NOT_RUNTIME_EVIDENCE",
    runnerTerminalLedger:
      "PRESENT_SIGNED_SOURCE_CONTRACT_CALLER_SHELL_NO_RUNTIME_IDENTITY",
    runnerTerminalPolicyVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
    runnerTerminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  },
  sourceBindings: {
    activationPreflightPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    keyCustodyPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  },
  stateMachine: {
    ordering: "SERIAL_SLOT_INDEX_ASCENDING",
    claim: "FRESH_DURABLE_INSERT_REQUIRED_TOKEN_NEVER_REISSUED",
    runnerPreflight:
      "ALL_SIX_SLOT_INPUT_COUNTS_AND_WORST_CASE_BUDGET_BEFORE_CLAIM",
    reservation: "FRESH_DURABLE_INSERT_REQUIRED_BEFORE_TRANSPORT",
    transportLatch: "ENTERED_IS_IRREVERSIBLE",
    receipt: "SIGNATURE_VERIFIED_THEN_DURABLY_RECORDED",
    receiptPersistenceReplay: "EXACT_ONLY_NEVER_DISPATCH_AUTHORITY",
    continuation:
      "ONLY_RECORDED_COMPLETED_RECEIPT_AND_DURABLE_ACCEPTED_RUNNER_TERMINAL",
    runnerContinuation:
      "ONLY_AFTER_RUN_RECEIPT_BOUND_SLOT_EVIDENCE_AND_THREE_LANGUAGE_REVIEWS",
    runnerFailure:
      "PROVIDER_COMPLETED_RUNNER_FAILURE_IS_TERMINAL_AND_NO_RETRY",
    automaticRetry: false,
    maximumAttemptsPerSlot: 1,
    maximumSlots: 6,
    replayAuthority: "ABSENT",
    responseLossAuthority: "ABSENT",
    revocationLinearization:
      "FUTURE_LIVE_RESERVE_RPC_LOCKED_RECHECK_ONLY",
    freshnessAuthority:
      "TRANSCRIPT_VALIDATION_CLOCK_ONLY_NOT_LIVE_DISPATCH_AUTHORITY",
  },
  runnerAcceptance: {
    reportStatus: "PASS",
    providerDeadlineMs: 30_000,
    providerDeadlineEvidence:
      "APPLICATION_TRANSCRIPT_TIMESTAMP_CANDIDATE_ONLY",
    exactCriticalChecks: RUNNER_CRITICAL_CHECK_KEYS,
    exactHumanReviewLocales: RUNNER_HUMAN_REVIEW_LOCALES,
    receiptBindingFields: [
      "authorizationDigest",
      "runIdHash",
      "claimId",
      "reservationId",
      "receiptDigest",
      "receiptSignatureSha256",
    ],
    providerCorrelation: "UNATTESTED_NO_SHARED_IDENTIFIER",
    postReceiptFailureReasons: RUNNER_POST_RECEIPT_FAILURE_REASONS,
    durableTerminalState: "ABSENT",
    usageReconciliation: {
      assumedZeroRequiresZero: true,
      unavailableReasoningRequiresNull: true,
      reportedReasoningRequiresValue: true,
    },
  },
  transcriptEvidence: {
    databaseAttestation: "ABSENT",
    providerAttestation: "ABSENT",
    wireBytesAuthority: "ABSENT",
    claimToken: "PROHIBITED_FROM_TRANSCRIPT",
    databaseReservedAt:
      "CANDIDATE_ONLY_RUNTIME_RPC_RESULT_NOT_OBTAINED",
    receiptSignature:
      "CRYPTOGRAPHICALLY_VERIFIED_AGAINST_TEST_ONLY_CUSTODY_SNAPSHOT",
    runnerTerminalSignature:
      "SOURCE_PORT_PRESENT_NO_VERIFIED_RUNTIME_ENVELOPE",
    runnerProviderCorrelation:
      "UNATTESTED_NO_SHARED_IDENTIFIER_WITH_RECEIPT_HMAC",
  },
  purposeSeparation: {
    roles: [
      "STATIC_SOURCE_AND_PREFLIGHT_EVIDENCE",
      "CLIENT_REQUEST_HMAC",
      "TRANSPORT_CORRELATION_HMAC",
      "RUNNER_PROVIDER_REQUEST_HASH",
      "RUNNER_CANDIDATE_DIGEST",
      "RECEIPT_DIGEST_OR_SIGNATURE_HASH",
      "RUNNER_TERMINAL_DIGEST_OR_SIGNATURE_HASH",
      "FIXTURE_DIGEST",
    ],
    crossRoleReuse: "PROHIBITED",
    globallyUniqueRoles: [
      "CLIENT_REQUEST_HMAC",
      "TRANSPORT_CORRELATION_HMAC",
      "RUNNER_PROVIDER_REQUEST_HASH",
      "RECEIPT_DIGEST_OR_SIGNATURE_HASH",
    ],
    providerRequestHashReuse: "PROHIBITED",
    candidateDigestSameRoleReuse: "ALLOWED",
    fixtureDigestSameRoleReuse: "ALLOWED",
  },
  databaseCallerMappings:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
  budget: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY.budget,
  activationBlockedReasons:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS,
  coordinatorBlockedReasons:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_BLOCKED_REASONS,
} as const);

export type CaresLinkV1CommunicationNotePreviewCoordinatorPolicy =
  typeof COORDINATOR_POLICY_CORE & Readonly<{ policyDigest: string }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY_DIGEST =
  "6a26e2104ebd8cecc55c638cdb2d9ec15b097630e90c0e19573addaa76fc5b2a" as const;

if (
  createCanonicalSha256(COORDINATOR_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY =
  deepFreeze({
    ...COORDINATOR_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY_DIGEST,
  }) satisfies CaresLinkV1CommunicationNotePreviewCoordinatorPolicy;

type SanitizedReservation = Readonly<{
  state: "RESERVATION_GRANTED_TEST_CANDIDATE_NOT_DB_ATTESTED";
  observedAt: string;
  databaseReservedAtCandidate: string;
  reservationId: string;
  claimId: string;
  authorizationDigest: string;
  runIdHash: string;
  slotIndex: number;
  fixtureId: string;
  runOrdinal: number;
  requestBodySha256: string;
  requestBodyUtf8ByteLength: number;
  semanticCanonicalRequestSha256: string;
  clientRequestIdHmac: string;
  attemptNumber: 1;
  automaticRetry: false;
  evidence: "UNATTESTED_TEST_ONLY";
}>;

type SanitizedRunnerPreflight = Readonly<{
  state: "RUNNER_PREFLIGHT_ACCEPTED_TEST_CANDIDATE";
  observedAt: string;
  runnerPolicyDigest: string;
  requestBodyPinBundleDigest: string;
  projectedCostMicroUsdPerCall: 20_130;
  projectedCostMicroUsd: 120_780;
  maximumRunCostMicroUsd: 250_000;
  slots: readonly Readonly<{
    slotIndex: number;
    fixtureId: string;
    runOrdinal: number;
    requestBodySha256: string;
    requestBodyUtf8ByteLength: number;
    semanticCanonicalRequestSha256: string;
    preflightInputTokens: number;
  }>[];
  evidence: "UNATTESTED_TEST_ONLY";
}>;

type SanitizedTransport = Readonly<{
  state: "TRANSPORT_ENTERED_TEST_CANDIDATE";
  observedAt: string;
  reservationId: string;
  slotIndex: number;
  requestBodySha256: string;
  requestBodyUtf8ByteLength: number;
  clientRequestIdHmac: string;
  wireBytesAuthority: "ABSENT_SOURCE_ONLY";
}>;

type SanitizedReceiptVerification = Readonly<{
  state: "RECEIPT_SIGNATURE_VERIFIED_TEST_CANDIDATE";
  observedAt: string;
  receiptDigest: string;
  signatureSha256: string;
  outcome: CaresLinkV1CommunicationNotePreviewReceiptOutcome;
  calculatedCostUpperBoundMicroUsd: number | null;
  authenticity: "CARESLINK_ED25519_DISPATCH_OBSERVATION_VERIFIED";
  providerAttestation: "ABSENT";
  databaseReservationBinding:
    "CANDIDATE_TIMESTAMP_NOT_DURABLY_ATTESTED";
}>;

type SanitizedReceiptPersistence = Readonly<{
  state: "RECEIPT_RECORDED_TEST_CANDIDATE_NOT_DB_ATTESTED";
  observedAt: string;
  receiptDigest: string;
  signatureSha256: string;
  outcome: CaresLinkV1CommunicationNotePreviewReceiptOutcome;
  callerIdentityHmac: string;
  writeDisposition:
    | "FIRST_INSERT_TEST_CANDIDATE"
    | "EXACT_REPLAY_TEST_CANDIDATE";
  evidence: "UNATTESTED_TEST_ONLY";
}>;

type SanitizedRunnerAcceptance = Readonly<{
  state: "RUNNER_SLOT_ACCEPTED_TEST_CANDIDATE";
  observedAt: string;
  authorizationDigest: string;
  runIdHash: string;
  claimId: string;
  reservationId: string;
  receiptDigest: string;
  receiptSignatureSha256: string;
  slotIndex: number;
  fixtureId: string;
  runOrdinal: number;
  fixtureDigest: string;
  requestBodySha256: string;
  requestBodyUtf8ByteLength: number;
  semanticCanonicalRequestSha256: string;
  preflightInputTokens: number;
  providerRequestIdHash: string;
  candidateDigest: string;
  usage: Readonly<{
    source: "PROVIDER";
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalTokensReconciliation: "REPORTED" | "CALCULATED";
    cachedInputTokens: number;
    cachedInputTokensReconciliation: "REPORTED" | "ASSUMED_ZERO";
    reasoningTokens: number | null;
    reasoningTokensReconciliation: "REPORTED" | "UNAVAILABLE";
  }>;
  calculatedCostUpperBoundMicroUsd: number;
  criticalChecks: Readonly<Record<(typeof RUNNER_CRITICAL_CHECK_KEYS)[number], true>>;
  humanReviews: readonly Readonly<{
    locale: (typeof RUNNER_HUMAN_REVIEW_LOCALES)[number];
    passed: true;
  }>[];
  receiptProviderCorrelation: "UNATTESTED_NO_SHARED_IDENTIFIER";
  evidence: "UNATTESTED_TEST_ONLY";
}>;

type SanitizedRunnerFailure = Readonly<{
  state: "RUNNER_SLOT_FAILED_TEST_CANDIDATE";
  observedAt: string;
  authorizationDigest: string;
  runIdHash: string;
  claimId: string;
  reservationId: string;
  receiptDigest: string;
  receiptSignatureSha256: string;
  slotIndex: number;
  fixtureId: string;
  runOrdinal: number;
  reason: (typeof RUNNER_POST_RECEIPT_FAILURE_REASONS)[number];
  noRetry: true;
  durableTerminalState: "ABSENT_TEST_CANDIDATE_ONLY";
  evidence: "UNATTESTED_TEST_ONLY";
}>;

export type CaresLinkV1CommunicationNotePreviewCoordinatorTranscript =
  Readonly<{
    version:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_VERSION;
    policyDigest: string;
    status: "TEST_ONLY_TRANSCRIPT_NOT_EXECUTABLE";
    observedAt: string;
    sourceBindings: Readonly<{
      activationPreflightPolicyDigest: string;
      activationPreflightCandidateDigest: string;
      authorityPolicyDigest: string;
      keyCustodyPolicyDigest: string;
      custodySnapshotDigest: string;
      requestBodyPinBundleDigest: string;
      runnerPolicyDigest: string;
      evaluationPlanDigest: string;
      requestTemplateDigest: string;
      manifestDigest: string;
      goldenFixtureSetDigest: string;
      workerPolicyDigest: string;
      providerId: string;
      modelId: string;
      endpointProfile: string;
      endpointUrlSha256: string;
      authorizationDigest: string;
      runIdHash: string;
    }>;
    authorizationRegistration: Readonly<{
      state: "AUTHORIZATION_REGISTERED_TEST_CANDIDATE_NOT_DB_ATTESTED";
      observedAt: string;
      authorizationDigest: string;
      authorizationSignatureSha256: string;
      runIdHash: string;
      callerIdentityHmac: string;
      evidence: "UNATTESTED_TEST_ONLY";
    }>;
    runnerPreflight: SanitizedRunnerPreflight;
    claim: Readonly<{
      state: "CLAIM_GRANTED_TEST_CANDIDATE_NOT_DB_ATTESTED";
      observedAt: string;
      claimId: string;
      executorIdentityHmac: string;
      authorizationDigest: string;
      runIdHash: string;
      authorityPolicyDigest: string;
      requestBodyPinBundleDigest: string;
      runnerPolicyDigest: string;
      evidence: "UNATTESTED_TEST_ONLY";
    }>;
    slots: readonly Readonly<{
      reservation: SanitizedReservation;
      transport: SanitizedTransport | null;
      receiptVerification: SanitizedReceiptVerification;
      receiptPersistence: SanitizedReceiptPersistence;
      runnerAcceptance: SanitizedRunnerAcceptance | null;
      runnerFailure: SanitizedRunnerFailure | null;
    }>[];
    terminalState:
      | "TEST_TRANSCRIPT_COMPLETE_NOT_ACTIVATION_AUTHORITY"
      | "TEST_TRANSCRIPT_TERMINAL_NO_RETRY";
  }>;

export type CaresLinkV1CommunicationNotePreviewCoordinatorTranscriptResult =
  Readonly<{
    transcript: CaresLinkV1CommunicationNotePreviewCoordinatorTranscript;
    transcriptDigest: string;
    authenticity: "UNATTESTED_INJECTED_TEST_TRANSCRIPT";
    coordinatorReady: false;
    activationReady: false;
    dispatchCapability: "ABSENT";
    preRunDispatchApproved: false;
    postRunEvaluationAccepted: false;
    activationBlockedReasons:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS;
    coordinatorBlockedReasons:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_BLOCKED_REASONS;
  }>;

/**
 * Validates a content-free, non-executable candidate transcript. It performs
 * no database, network, signing, key-resolution or environment operation and
 * returns no claim token, request body or dispatch capability.
 */
export function validateTestOnlyCaresLinkV1CommunicationNotePreviewCoordinatorTranscript(
  value: unknown,
  options: Readonly<{
    now: string;
    preflightCandidate:
      CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate;
    verifiedAuthorization:
      CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
    custodySnapshot:
      CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot;
  }>,
): CaresLinkV1CommunicationNotePreviewCoordinatorTranscriptResult {
  try {
    assertPlainDataTree(value);
    assertPlainDataTree(options);
    return validateTranscript(value, options);
  } catch {
    throw unavailable();
  }
}

/** Paid/hosted execution remains deliberately unavailable in source. */
export function createCaresLinkV1CommunicationNotePreviewReserveBeforeDispatchCoordinator(): never {
  throw unavailable();
}

function validateTranscript(
  value: unknown,
  options: Readonly<{
    now: string;
    preflightCandidate:
      CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate;
    verifiedAuthorization:
      CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
    custodySnapshot:
      CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot;
  }>,
): CaresLinkV1CommunicationNotePreviewCoordinatorTranscriptResult {
  const optionRecord = exactDataRecord(options, [
    "now",
    "preflightCandidate",
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
  const preflight =
    validateTestOnlyCaresLinkV1CommunicationNotePreviewActivationPreflight(
      optionRecord.preflightCandidate,
      { now, verifiedAuthorization, custodySnapshot },
    );
  if (preflight.activationReady !== false) throw unavailable();

  const object = exactDataRecord(value, [
    "version",
    "policyDigest",
    "status",
    "observedAt",
    "sourceBindings",
    "authorizationRegistration",
    "runnerPreflight",
    "claim",
    "slots",
    "terminalState",
  ]);
  if (
    object.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_VERSION ||
    object.policyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY_DIGEST ||
    object.status !== "TEST_ONLY_TRANSCRIPT_NOT_EXECUTABLE"
  ) {
    throw unavailable();
  }
  const observedAt = requireTimestamp(object.observedAt);
  if (observedAt !== now) throw unavailable();

  const sourceBindings = validateSourceBindings(
    object.sourceBindings,
    preflight.candidateDigest,
    custodySnapshot,
    verifiedAuthorization,
  );
  const registrationCaller = custodySnapshot.callers.find(
    (caller) => caller.purpose === "AUTHORIZATION_REGISTRATION",
  );
  const dispatchCaller = custodySnapshot.callers.find(
    (caller) => caller.purpose === "DISPATCH",
  );
  const receiptCaller = custodySnapshot.callers.find(
    (caller) => caller.purpose === "RECEIPT_PERSISTENCE",
  );
  if (!registrationCaller || !dispatchCaller || !receiptCaller) {
    throw unavailable();
  }
  const authorizationRegistration = validateAuthorizationRegistration(
    object.authorizationRegistration,
    sourceBindings.authorizationDigest,
    verifiedAuthorization.signatureSha256,
    sourceBindings.runIdHash,
    registrationCaller.identityHmac,
    preflight.candidate.observedAt,
    observedAt,
  );
  const runnerPreflight = validateRunnerPreflight(
    object.runnerPreflight,
    authorizationRegistration.observedAt,
    observedAt,
  );
  const claim = validateClaim(
    object.claim,
    {
      expectedExecutorIdentityHmac: dispatchCaller.identityHmac,
      authorizationDigest: sourceBindings.authorizationDigest,
      runIdHash: sourceBindings.runIdHash,
      authorityPolicyDigest: sourceBindings.authorityPolicyDigest,
      requestBodyPinBundleDigest:
        sourceBindings.requestBodyPinBundleDigest,
      runnerPolicyDigest: sourceBindings.runnerPolicyDigest,
      authorizationExpiresAt: verifiedAuthorization.statement.expiresAt,
      firstAllowedAt: runnerPreflight.observedAt,
      now: observedAt,
    },
  );
  const slots = validateSlots(
    object.slots,
    {
      now: observedAt,
      firstAllowedAt: claim.observedAt,
      authorizationDigest: sourceBindings.authorizationDigest,
      runIdHash: sourceBindings.runIdHash,
      claimId: claim.claimId,
      runnerPreflight,
      receiptCallerIdentityHmac: receiptCaller.identityHmac,
      forbiddenCorrelationHmacs: Array.from(
        collectSha256Strings([
          sourceBindings,
          preflight.candidate,
          verifiedAuthorization,
          custodySnapshot,
        ]),
      ),
      custodySnapshot,
    },
  );
  const lastOutcome =
    slots[slots.length - 1]?.receiptVerification.outcome;
  const lastRunnerAccepted =
    slots[slots.length - 1]?.runnerAcceptance !== null;
  const expectedTerminalState:
    CaresLinkV1CommunicationNotePreviewCoordinatorTranscript["terminalState"] =
    slots.length === CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS.length &&
    lastOutcome === "COMPLETED" &&
    lastRunnerAccepted
      ? "TEST_TRANSCRIPT_COMPLETE_NOT_ACTIVATION_AUTHORITY"
      : "TEST_TRANSCRIPT_TERMINAL_NO_RETRY";
  if (object.terminalState !== expectedTerminalState) throw unavailable();

  const transcript = deepFreeze({
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY_DIGEST,
    status: "TEST_ONLY_TRANSCRIPT_NOT_EXECUTABLE" as const,
    observedAt,
    sourceBindings,
    authorizationRegistration,
    runnerPreflight,
    claim,
    slots,
    terminalState: expectedTerminalState,
  });
  return deepFreeze({
    transcript,
    transcriptDigest: createCanonicalSha256(transcript),
    authenticity: "UNATTESTED_INJECTED_TEST_TRANSCRIPT" as const,
    coordinatorReady: false as const,
    activationReady: false as const,
    dispatchCapability: "ABSENT" as const,
    preRunDispatchApproved: false as const,
    postRunEvaluationAccepted: false as const,
    activationBlockedReasons:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_BLOCKED_REASONS,
    coordinatorBlockedReasons:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_BLOCKED_REASONS,
  });
}

function validateSourceBindings(
  value: unknown,
  preflightCandidateDigest: string,
  custodySnapshot: CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  verifiedAuthorization:
    CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
) {
  const object = exactDataRecord(value, [
    "activationPreflightPolicyDigest",
    "activationPreflightCandidateDigest",
    "authorityPolicyDigest",
    "keyCustodyPolicyDigest",
    "custodySnapshotDigest",
    "requestBodyPinBundleDigest",
    "runnerPolicyDigest",
    "evaluationPlanDigest",
    "requestTemplateDigest",
    "manifestDigest",
    "goldenFixtureSetDigest",
    "workerPolicyDigest",
    "providerId",
    "modelId",
    "endpointProfile",
    "endpointUrlSha256",
    "authorizationDigest",
    "runIdHash",
  ]);
  const expected = {
    activationPreflightPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
    activationPreflightCandidateDigest: preflightCandidateDigest,
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    keyCustodyPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    custodySnapshotDigest: createCanonicalSha256(custodySnapshot),
    ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
    authorizationDigest: verifiedAuthorization.authorizationDigest,
    runIdHash: verifiedAuthorization.statement.runIdHash,
  } as const;
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (object[key] !== expectedValue) throw unavailable();
  }
  return deepFreeze(expected);
}

function validateAuthorizationRegistration(
  value: unknown,
  authorizationDigest: string,
  authorizationSignatureSha256: string,
  runIdHash: string,
  expectedCallerIdentityHmac: string,
  firstAllowedAt: string,
  now: string,
) {
  const object = exactDataRecord(value, [
    "state",
    "observedAt",
    "authorizationDigest",
    "authorizationSignatureSha256",
    "runIdHash",
    "callerIdentityHmac",
    "evidence",
  ]);
  if (
    object.state !==
      "AUTHORIZATION_REGISTERED_TEST_CANDIDATE_NOT_DB_ATTESTED" ||
    object.authorizationDigest !== authorizationDigest ||
    object.authorizationSignatureSha256 !== authorizationSignatureSha256 ||
    object.runIdHash !== runIdHash ||
    object.callerIdentityHmac !== expectedCallerIdentityHmac ||
    object.evidence !== "UNATTESTED_TEST_ONLY"
  ) {
    throw unavailable();
  }
  return deepFreeze({
    state:
      "AUTHORIZATION_REGISTERED_TEST_CANDIDATE_NOT_DB_ATTESTED" as const,
    observedAt: requireOrderedTimestamp(
      object.observedAt,
      firstAllowedAt,
      now,
    ),
    authorizationDigest,
    authorizationSignatureSha256: requireSha256(
      authorizationSignatureSha256,
    ),
    runIdHash: requireSha256(runIdHash),
    callerIdentityHmac: requireSha256(expectedCallerIdentityHmac),
    evidence: "UNATTESTED_TEST_ONLY" as const,
  });
}

function validateRunnerPreflight(
  value: unknown,
  firstAllowedAt: string,
  now: string,
): SanitizedRunnerPreflight {
  const object = exactDataRecord(value, [
    "state",
    "observedAt",
    "runnerPolicyDigest",
    "requestBodyPinBundleDigest",
    "projectedCostMicroUsdPerCall",
    "projectedCostMicroUsd",
    "maximumRunCostMicroUsd",
    "slots",
    "evidence",
  ]);
  if (
    object.state !== "RUNNER_PREFLIGHT_ACCEPTED_TEST_CANDIDATE" ||
    object.runnerPolicyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
        .runnerPolicyDigest ||
    object.requestBodyPinBundleDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
        .requestBodyPinBundleDigest ||
    object.projectedCostMicroUsdPerCall !== 20_130 ||
    object.projectedCostMicroUsd !== 120_780 ||
    object.maximumRunCostMicroUsd !== 250_000 ||
    object.evidence !== "UNATTESTED_TEST_ONLY" ||
    !Array.isArray(object.slots) ||
    object.slots.length !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS.length
  ) {
    throw unavailable();
  }
  const slots = object.slots.map((candidate, slotIndex) => {
    const slot = CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS[
      slotIndex
    ];
    const record = exactDataRecord(candidate, [
      "slotIndex",
      "fixtureId",
      "runOrdinal",
      "requestBodySha256",
      "requestBodyUtf8ByteLength",
      "semanticCanonicalRequestSha256",
      "preflightInputTokens",
    ]);
    if (
      !slot ||
      record.slotIndex !== slot.slotIndex ||
      record.fixtureId !== slot.fixtureId ||
      record.runOrdinal !== slot.runOrdinal ||
      record.requestBodySha256 !== slot.requestBodySha256 ||
      record.requestBodyUtf8ByteLength !== slot.requestBodyUtf8ByteLength ||
      record.semanticCanonicalRequestSha256 !==
        slot.semanticCanonicalRequestSha256 ||
      !Number.isSafeInteger(record.preflightInputTokens) ||
      (record.preflightInputTokens as number) < 1 ||
      (record.preflightInputTokens as number) > 10_000
    ) {
      throw unavailable();
    }
    return deepFreeze({
      ...slot,
      preflightInputTokens: record.preflightInputTokens as number,
    });
  });
  return deepFreeze({
    state: "RUNNER_PREFLIGHT_ACCEPTED_TEST_CANDIDATE" as const,
    observedAt: requireOrderedTimestamp(
      object.observedAt,
      firstAllowedAt,
      now,
    ),
    runnerPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
        .runnerPolicyDigest,
    requestBodyPinBundleDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
        .requestBodyPinBundleDigest,
    projectedCostMicroUsdPerCall: 20_130 as const,
    projectedCostMicroUsd: 120_780 as const,
    maximumRunCostMicroUsd: 250_000 as const,
    slots,
    evidence: "UNATTESTED_TEST_ONLY" as const,
  });
}

function validateClaim(
  value: unknown,
  options: Readonly<{
    expectedExecutorIdentityHmac: string;
    authorizationDigest: string;
    runIdHash: string;
    authorityPolicyDigest: string;
    requestBodyPinBundleDigest: string;
    runnerPolicyDigest: string;
    authorizationExpiresAt: string;
    firstAllowedAt: string;
    now: string;
  }>,
) {
  const object = exactDataRecord(value, [
    "state",
    "observedAt",
    "claimId",
    "executorIdentityHmac",
    "authorizationDigest",
    "runIdHash",
    "authorityPolicyDigest",
    "requestBodyPinBundleDigest",
    "runnerPolicyDigest",
    "evidence",
  ]);
  if (
    object.state !== "CLAIM_GRANTED_TEST_CANDIDATE_NOT_DB_ATTESTED" ||
    object.executorIdentityHmac !== options.expectedExecutorIdentityHmac ||
    object.authorizationDigest !== options.authorizationDigest ||
    object.runIdHash !== options.runIdHash ||
    object.authorityPolicyDigest !== options.authorityPolicyDigest ||
    object.requestBodyPinBundleDigest !==
      options.requestBodyPinBundleDigest ||
    object.runnerPolicyDigest !== options.runnerPolicyDigest ||
    object.evidence !== "UNATTESTED_TEST_ONLY"
  ) {
    throw unavailable();
  }
  const observedAt = requireOrderedTimestamp(
    object.observedAt,
    options.firstAllowedAt,
    options.now,
  );
  if (
    Date.parse(options.authorizationExpiresAt) - Date.parse(observedAt) <
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY.authorization
      .minimumRemainingAtClaimMs
  ) {
    throw unavailable();
  }
  return deepFreeze({
    state: "CLAIM_GRANTED_TEST_CANDIDATE_NOT_DB_ATTESTED" as const,
    observedAt,
    claimId: requireUuid(object.claimId),
    executorIdentityHmac: requireSha256(object.executorIdentityHmac),
    authorizationDigest: options.authorizationDigest,
    runIdHash: options.runIdHash,
    authorityPolicyDigest: options.authorityPolicyDigest,
    requestBodyPinBundleDigest: options.requestBodyPinBundleDigest,
    runnerPolicyDigest: options.runnerPolicyDigest,
    evidence: "UNATTESTED_TEST_ONLY" as const,
  });
}

function validateSlots(
  value: unknown,
  options: Readonly<{
    now: string;
    firstAllowedAt: string;
    authorizationDigest: string;
    runIdHash: string;
    claimId: string;
    runnerPreflight: SanitizedRunnerPreflight;
    receiptCallerIdentityHmac: string;
    forbiddenCorrelationHmacs: readonly string[];
    custodySnapshot:
      CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot;
  }>,
) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length >
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS.length
  ) {
    throw unavailable();
  }
  const reservationIds = new Set<string>();
  const clientRequestIdHmacs = new Set<string>();
  const correlationHmacs = new Set<string>();
  const providerRequestIdHashes = new Set<string>();
  const runnerCandidateDigests = new Set<string>();
  const receiptEvidenceDigests = new Set<string>();
  const fixtureDigests = new Set(
    CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.map((fixture) =>
      createCanonicalSha256(fixture),
    ),
  );
  const forbiddenCorrelationHmacs = new Set(
    options.forbiddenCorrelationHmacs,
  );
  const sanitizedSlots: Array<{
    reservation: SanitizedReservation;
    transport: SanitizedTransport | null;
    receiptVerification: SanitizedReceiptVerification;
    receiptPersistence: SanitizedReceiptPersistence;
    runnerAcceptance: SanitizedRunnerAcceptance | null;
    runnerFailure: SanitizedRunnerFailure | null;
  }> = [];
  let firstAllowedAt = options.firstAllowedAt;
  let terminated = false;
  let actualCompletedCostMicroUsd = 0;

  for (let slotIndex = 0; slotIndex < value.length; slotIndex += 1) {
    if (terminated) throw unavailable();
    const record = exactDataRecord(value[slotIndex], [
      "reservation",
      "transport",
      "receiptVerification",
      "receiptPersistence",
      "runnerAcceptance",
      "runnerFailure",
    ]);
    const reservation = validateReservation(
      record.reservation,
      slotIndex,
      firstAllowedAt,
      options.now,
      {
        claimId: options.claimId,
        authorizationDigest: options.authorizationDigest,
        runIdHash: options.runIdHash,
      },
    );
    if (
      reservationIds.has(reservation.reservationId) ||
      reservation.reservationId === options.claimId ||
      clientRequestIdHmacs.has(reservation.clientRequestIdHmac) ||
      forbiddenCorrelationHmacs.has(reservation.clientRequestIdHmac) ||
      providerRequestIdHashes.has(reservation.clientRequestIdHmac) ||
      runnerCandidateDigests.has(reservation.clientRequestIdHmac) ||
      receiptEvidenceDigests.has(reservation.clientRequestIdHmac) ||
      fixtureDigests.has(reservation.clientRequestIdHmac)
    ) {
      throw unavailable();
    }
    reservationIds.add(reservation.reservationId);
    clientRequestIdHmacs.add(reservation.clientRequestIdHmac);
    correlationHmacs.add(reservation.clientRequestIdHmac);

    const receiptInput = exactDataRecord(record.receiptVerification, [
      "state",
      "observedAt",
      "databaseReservedAtCandidate",
      "envelope",
      "evidence",
    ]);
    if (
      receiptInput.state !== "RECEIPT_SIGNATURE_VERIFIED_TEST_CANDIDATE" ||
      receiptInput.databaseReservedAtCandidate !==
        reservation.databaseReservedAtCandidate ||
      receiptInput.evidence !== "TEST_ONLY_SIGNATURE_CHECK_NOT_DB_ATTESTATION"
    ) {
      throw unavailable();
    }
    const receiptVerificationObservedAt = requireOrderedTimestamp(
      receiptInput.observedAt,
      reservation.observedAt,
      options.now,
    );
    const envelope = receiptInput.envelope as
      CaresLinkV1CommunicationNotePreviewDispatchReceiptEnvelope;
    const verifiedReceipt =
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        envelope,
        {
          trustedKeySnapshot:
            options.custodySnapshot.receiptSigner.trustedSigningKey,
          now: receiptVerificationObservedAt,
          expected: {
            authorizationDigest: options.authorizationDigest,
            claimId: options.claimId,
            runIdHash: options.runIdHash,
            reservationId: reservation.reservationId,
            slotIndex: reservation.slotIndex,
            fixtureId: reservation.fixtureId,
            runOrdinal: reservation.runOrdinal,
            requestBodySha256: reservation.requestBodySha256,
            requestBodyUtf8ByteLength:
              reservation.requestBodyUtf8ByteLength,
            semanticCanonicalRequestSha256:
              reservation.semanticCanonicalRequestSha256,
            clientRequestIdHmac: reservation.clientRequestIdHmac,
            reservedAt: reservation.databaseReservedAtCandidate,
          },
        },
      );

    const outcome = verifiedReceipt.statement.outcome;
    const currentReceiptEvidenceDigests = [
      verifiedReceipt.receiptDigest,
      verifiedReceipt.signatureSha256,
    ];
    if (
      new Set(currentReceiptEvidenceDigests).size !==
      currentReceiptEvidenceDigests.length
    ) {
      throw unavailable();
    }
    for (const digest of currentReceiptEvidenceDigests) {
      if (
        receiptEvidenceDigests.has(digest) ||
        forbiddenCorrelationHmacs.has(digest) ||
        correlationHmacs.has(digest) ||
        providerRequestIdHashes.has(digest) ||
        runnerCandidateDigests.has(digest) ||
        fixtureDigests.has(digest)
      ) {
        throw unavailable();
      }
    }
    for (const correlationHmac of [
      verifiedReceipt.statement.transport.openAiRequestIdHmac,
      verifiedReceipt.statement.transport.openAiResponseIdHmac,
    ]) {
      if (correlationHmac === null) continue;
      if (
        correlationHmacs.has(correlationHmac) ||
        forbiddenCorrelationHmacs.has(correlationHmac) ||
        providerRequestIdHashes.has(correlationHmac) ||
        runnerCandidateDigests.has(correlationHmac) ||
        receiptEvidenceDigests.has(correlationHmac) ||
        currentReceiptEvidenceDigests.includes(correlationHmac) ||
        fixtureDigests.has(correlationHmac)
      ) {
        throw unavailable();
      }
      correlationHmacs.add(correlationHmac);
    }
    for (const digest of currentReceiptEvidenceDigests) {
      receiptEvidenceDigests.add(digest);
    }
    const transport = validateTransportEvent(
      record.transport,
      reservation,
      outcome,
      options.now,
    );
    const receiptLowerBound = transport?.observedAt ?? reservation.observedAt;
    if (
      Date.parse(verifiedReceipt.statement.observedAt) <
        Date.parse(receiptLowerBound) ||
      Date.parse(receiptVerificationObservedAt) <
        Date.parse(verifiedReceipt.statement.observedAt) ||
      (transport !== null &&
        (outcome === "COMPLETED" || outcome === "PROVIDER_HTTP_ERROR") &&
        Date.parse(verifiedReceipt.statement.observedAt) -
          Date.parse(transport.observedAt) >
          COORDINATOR_POLICY_CORE.runnerAcceptance.providerDeadlineMs)
    ) {
      throw unavailable();
    }
    const receiptVerification = deepFreeze({
      state: "RECEIPT_SIGNATURE_VERIFIED_TEST_CANDIDATE" as const,
      observedAt: receiptVerificationObservedAt,
      receiptDigest: verifiedReceipt.receiptDigest,
      signatureSha256: verifiedReceipt.signatureSha256,
      outcome,
      calculatedCostUpperBoundMicroUsd:
        verifiedReceipt.statement.calculatedCostUpperBoundMicroUsd,
      authenticity:
        "CARESLINK_ED25519_DISPATCH_OBSERVATION_VERIFIED" as const,
      providerAttestation: "ABSENT" as const,
      databaseReservationBinding:
        "CANDIDATE_TIMESTAMP_NOT_DURABLY_ATTESTED" as const,
    });
    const receiptPersistence = validateReceiptPersistence(
      record.receiptPersistence,
      receiptVerification,
      options.receiptCallerIdentityHmac,
      options.now,
    );
    let runnerAcceptance: SanitizedRunnerAcceptance | null = null;
    let runnerFailure: SanitizedRunnerFailure | null = null;
    if (outcome === "COMPLETED") {
      if (
        (record.runnerAcceptance === null) ===
        (record.runnerFailure === null)
      ) {
        throw unavailable();
      }
      if (record.runnerAcceptance !== null) {
        runnerAcceptance = validateRunnerAcceptance(
          record.runnerAcceptance,
          {
            now: options.now,
            firstAllowedAt: receiptPersistence.observedAt,
            reservation,
            preflightInputTokens:
              options.runnerPreflight.slots[slotIndex]
                .preflightInputTokens,
            receipt: verifiedReceipt.statement,
            receiptVerification,
            forbiddenDigests: forbiddenCorrelationHmacs,
            usedCorrelationHmacs: correlationHmacs,
            receiptEvidenceDigests,
            fixtureDigests,
            providerRequestIdHashes,
            runnerCandidateDigests,
          },
        );
      } else {
        runnerFailure = validateRunnerFailure(record.runnerFailure, {
          now: options.now,
          firstAllowedAt: receiptPersistence.observedAt,
          reservation,
          receiptVerification,
        });
      }
    } else {
      runnerAcceptance = requireNullRunnerAcceptance(
        record.runnerAcceptance,
      );
      runnerFailure = requireNullRunnerFailure(record.runnerFailure);
    }
    if (outcome === "COMPLETED") {
      actualCompletedCostMicroUsd +=
        receiptVerification.calculatedCostUpperBoundMicroUsd ?? 0;
      if (
        actualCompletedCostMicroUsd >
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY.budget
          .maximumCostMicroUsd
      ) {
        throw unavailable();
      }
      if (runnerFailure !== null) {
        terminated = true;
        if (slotIndex !== value.length - 1) throw unavailable();
      } else {
        const remainingWorstCaseCost =
          (CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS.length -
            slotIndex -
            1) * 20_130;
        if (
          actualCompletedCostMicroUsd + remainingWorstCaseCost >
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY.budget
            .maximumCostMicroUsd
        ) {
          throw unavailable();
        }
      }
    } else {
      terminated = true;
      if (slotIndex !== value.length - 1) throw unavailable();
    }
    sanitizedSlots.push(
      deepFreeze({
        reservation,
        transport,
        receiptVerification,
        receiptPersistence,
        runnerAcceptance,
        runnerFailure,
      }),
    );
    firstAllowedAt = runnerAcceptance?.observedAt ??
      runnerFailure?.observedAt ?? receiptPersistence.observedAt;
  }

  if (!terminated && sanitizedSlots.length !== 6) throw unavailable();
  return deepFreeze(sanitizedSlots);
}

function validateReservation(
  value: unknown,
  expectedSlotIndex: number,
  firstAllowedAt: string,
  now: string,
  bindings: Readonly<{
    claimId: string;
    authorizationDigest: string;
    runIdHash: string;
  }>,
): SanitizedReservation {
  const object = exactDataRecord(value, [
    "state",
    "observedAt",
    "databaseReservedAtCandidate",
    "reservationId",
    "claimId",
    "authorizationDigest",
    "runIdHash",
    "slotIndex",
    "fixtureId",
    "runOrdinal",
    "requestBodySha256",
    "requestBodyUtf8ByteLength",
    "semanticCanonicalRequestSha256",
    "clientRequestIdHmac",
    "attemptNumber",
    "automaticRetry",
    "evidence",
  ]);
  const slot =
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS[
      expectedSlotIndex
    ];
  if (
    !slot ||
    object.state !==
      "RESERVATION_GRANTED_TEST_CANDIDATE_NOT_DB_ATTESTED" ||
    object.claimId !== bindings.claimId ||
    object.authorizationDigest !== bindings.authorizationDigest ||
    object.runIdHash !== bindings.runIdHash ||
    object.slotIndex !== slot.slotIndex ||
    object.fixtureId !== slot.fixtureId ||
    object.runOrdinal !== slot.runOrdinal ||
    object.requestBodySha256 !== slot.requestBodySha256 ||
    object.requestBodyUtf8ByteLength !== slot.requestBodyUtf8ByteLength ||
    object.semanticCanonicalRequestSha256 !==
      slot.semanticCanonicalRequestSha256 ||
    object.attemptNumber !== 1 ||
    object.automaticRetry !== false ||
    object.evidence !== "UNATTESTED_TEST_ONLY"
  ) {
    throw unavailable();
  }
  const databaseReservedAtCandidate = requireOrderedTimestamp(
    object.databaseReservedAtCandidate,
    firstAllowedAt,
    now,
  );
  const observedAt = requireOrderedTimestamp(
    object.observedAt,
    databaseReservedAtCandidate,
    now,
  );
  return deepFreeze({
    state: "RESERVATION_GRANTED_TEST_CANDIDATE_NOT_DB_ATTESTED" as const,
    observedAt,
    databaseReservedAtCandidate,
    reservationId: requireUuid(object.reservationId),
    claimId: bindings.claimId,
    authorizationDigest: bindings.authorizationDigest,
    runIdHash: bindings.runIdHash,
    slotIndex: slot.slotIndex,
    fixtureId: slot.fixtureId,
    runOrdinal: slot.runOrdinal,
    requestBodySha256: slot.requestBodySha256,
    requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
    semanticCanonicalRequestSha256:
      slot.semanticCanonicalRequestSha256,
    clientRequestIdHmac: requireSha256(object.clientRequestIdHmac),
    attemptNumber: 1 as const,
    automaticRetry: false as const,
    evidence: "UNATTESTED_TEST_ONLY" as const,
  });
}

function validateTransportEvent(
  value: unknown,
  reservation: SanitizedReservation,
  outcome: CaresLinkV1CommunicationNotePreviewReceiptOutcome,
  now: string,
): SanitizedTransport | null {
  if (outcome === "LOCAL_PRE_DISPATCH_ABORTED") {
    if (value !== null) throw unavailable();
    return null;
  }
  const object = exactDataRecord(value, [
    "state",
    "observedAt",
    "reservationId",
    "slotIndex",
    "requestBodySha256",
    "requestBodyUtf8ByteLength",
    "clientRequestIdHmac",
    "wireBytesAuthority",
  ]);
  if (
    object.state !== "TRANSPORT_ENTERED_TEST_CANDIDATE" ||
    object.reservationId !== reservation.reservationId ||
    object.slotIndex !== reservation.slotIndex ||
    object.requestBodySha256 !== reservation.requestBodySha256 ||
    object.requestBodyUtf8ByteLength !==
      reservation.requestBodyUtf8ByteLength ||
    object.clientRequestIdHmac !== reservation.clientRequestIdHmac ||
    object.wireBytesAuthority !== "ABSENT_SOURCE_ONLY"
  ) {
    throw unavailable();
  }
  return deepFreeze({
    state: "TRANSPORT_ENTERED_TEST_CANDIDATE" as const,
    observedAt: requireOrderedTimestamp(
      object.observedAt,
      reservation.observedAt,
      now,
    ),
    reservationId: reservation.reservationId,
    slotIndex: reservation.slotIndex,
    requestBodySha256: reservation.requestBodySha256,
    requestBodyUtf8ByteLength: reservation.requestBodyUtf8ByteLength,
    clientRequestIdHmac: reservation.clientRequestIdHmac,
    wireBytesAuthority: "ABSENT_SOURCE_ONLY" as const,
  });
}

function validateRunnerAcceptance(
  value: unknown,
  options: Readonly<{
    now: string;
    firstAllowedAt: string;
    reservation: SanitizedReservation;
    preflightInputTokens: number;
    receipt: CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement;
    receiptVerification: SanitizedReceiptVerification;
    forbiddenDigests: ReadonlySet<string>;
    usedCorrelationHmacs: ReadonlySet<string>;
    receiptEvidenceDigests: ReadonlySet<string>;
    fixtureDigests: ReadonlySet<string>;
    providerRequestIdHashes: Set<string>;
    runnerCandidateDigests: Set<string>;
  }>,
): SanitizedRunnerAcceptance {
  const object = exactDataRecord(value, [
    "state",
    "observedAt",
    "authorizationDigest",
    "runIdHash",
    "claimId",
    "reservationId",
    "receiptDigest",
    "receiptSignatureSha256",
    "slotIndex",
    "fixtureId",
    "runOrdinal",
    "fixtureDigest",
    "requestBodySha256",
    "requestBodyUtf8ByteLength",
    "semanticCanonicalRequestSha256",
    "preflightInputTokens",
    "providerRequestIdHash",
    "candidateDigest",
    "usage",
    "calculatedCostUpperBoundMicroUsd",
    "criticalChecks",
    "humanReviews",
    "receiptProviderCorrelation",
    "evidence",
  ]);
  const fixture = CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.find(
    (candidate) => candidate.id === options.reservation.fixtureId,
  );
  const fixtureDigest = requireSha256(object.fixtureDigest);
  const providerRequestIdHash = requireSha256(object.providerRequestIdHash);
  const candidateDigest = requireSha256(object.candidateDigest);
  if (
    !fixture ||
    object.state !== "RUNNER_SLOT_ACCEPTED_TEST_CANDIDATE" ||
    object.authorizationDigest !== options.reservation.authorizationDigest ||
    object.runIdHash !== options.reservation.runIdHash ||
    object.claimId !== options.reservation.claimId ||
    object.reservationId !== options.reservation.reservationId ||
    object.receiptDigest !== options.receiptVerification.receiptDigest ||
    object.receiptSignatureSha256 !==
      options.receiptVerification.signatureSha256 ||
    object.slotIndex !== options.reservation.slotIndex ||
    object.fixtureId !== options.reservation.fixtureId ||
    object.runOrdinal !== options.reservation.runOrdinal ||
    fixtureDigest !== createCanonicalSha256(fixture) ||
    object.requestBodySha256 !== options.reservation.requestBodySha256 ||
    object.requestBodyUtf8ByteLength !==
      options.reservation.requestBodyUtf8ByteLength ||
    object.semanticCanonicalRequestSha256 !==
      options.reservation.semanticCanonicalRequestSha256 ||
    object.preflightInputTokens !== options.preflightInputTokens ||
    options.providerRequestIdHashes.has(providerRequestIdHash) ||
    options.forbiddenDigests.has(providerRequestIdHash) ||
    options.usedCorrelationHmacs.has(providerRequestIdHash) ||
    options.receiptEvidenceDigests.has(providerRequestIdHash) ||
    options.fixtureDigests.has(providerRequestIdHash) ||
    options.runnerCandidateDigests.has(providerRequestIdHash) ||
    options.forbiddenDigests.has(candidateDigest) ||
    options.usedCorrelationHmacs.has(candidateDigest) ||
    options.receiptEvidenceDigests.has(candidateDigest) ||
    options.fixtureDigests.has(candidateDigest) ||
    options.providerRequestIdHashes.has(candidateDigest) ||
    providerRequestIdHash === candidateDigest ||
    object.calculatedCostUpperBoundMicroUsd !==
      options.receipt.calculatedCostUpperBoundMicroUsd ||
    object.receiptProviderCorrelation !==
      "UNATTESTED_NO_SHARED_IDENTIFIER" ||
    object.evidence !== "UNATTESTED_TEST_ONLY"
  ) {
    throw unavailable();
  }
  options.providerRequestIdHashes.add(providerRequestIdHash);
  options.runnerCandidateDigests.add(candidateDigest);
  const usage = validateRunnerUsage(
    object.usage,
    options.preflightInputTokens,
    options.receipt,
  );
  const criticalChecks = validateRunnerCriticalChecks(
    object.criticalChecks,
  );
  const humanReviews = validateRunnerHumanReviews(object.humanReviews);
  return deepFreeze({
    state: "RUNNER_SLOT_ACCEPTED_TEST_CANDIDATE" as const,
    observedAt: requireOrderedTimestamp(
      object.observedAt,
      options.firstAllowedAt,
      options.now,
    ),
    authorizationDigest: options.reservation.authorizationDigest,
    runIdHash: options.reservation.runIdHash,
    claimId: options.reservation.claimId,
    reservationId: options.reservation.reservationId,
    receiptDigest: options.receiptVerification.receiptDigest,
    receiptSignatureSha256: options.receiptVerification.signatureSha256,
    slotIndex: options.reservation.slotIndex,
    fixtureId: options.reservation.fixtureId,
    runOrdinal: options.reservation.runOrdinal,
    fixtureDigest,
    requestBodySha256: options.reservation.requestBodySha256,
    requestBodyUtf8ByteLength:
      options.reservation.requestBodyUtf8ByteLength,
    semanticCanonicalRequestSha256:
      options.reservation.semanticCanonicalRequestSha256,
    preflightInputTokens: options.preflightInputTokens,
    providerRequestIdHash,
    candidateDigest,
    usage,
    calculatedCostUpperBoundMicroUsd:
      options.receipt.calculatedCostUpperBoundMicroUsd as number,
    criticalChecks,
    humanReviews,
    receiptProviderCorrelation:
      "UNATTESTED_NO_SHARED_IDENTIFIER" as const,
    evidence: "UNATTESTED_TEST_ONLY" as const,
  });
}

function validateRunnerFailure(
  value: unknown,
  options: Readonly<{
    now: string;
    firstAllowedAt: string;
    reservation: SanitizedReservation;
    receiptVerification: SanitizedReceiptVerification;
  }>,
): SanitizedRunnerFailure {
  const object = exactDataRecord(value, [
    "state",
    "observedAt",
    "authorizationDigest",
    "runIdHash",
    "claimId",
    "reservationId",
    "receiptDigest",
    "receiptSignatureSha256",
    "slotIndex",
    "fixtureId",
    "runOrdinal",
    "reason",
    "noRetry",
    "durableTerminalState",
    "evidence",
  ]);
  if (
    object.state !== "RUNNER_SLOT_FAILED_TEST_CANDIDATE" ||
    object.authorizationDigest !== options.reservation.authorizationDigest ||
    object.runIdHash !== options.reservation.runIdHash ||
    object.claimId !== options.reservation.claimId ||
    object.reservationId !== options.reservation.reservationId ||
    object.receiptDigest !== options.receiptVerification.receiptDigest ||
    object.receiptSignatureSha256 !==
      options.receiptVerification.signatureSha256 ||
    object.slotIndex !== options.reservation.slotIndex ||
    object.fixtureId !== options.reservation.fixtureId ||
    object.runOrdinal !== options.reservation.runOrdinal ||
    !RUNNER_POST_RECEIPT_FAILURE_REASONS.includes(
      object.reason as (typeof RUNNER_POST_RECEIPT_FAILURE_REASONS)[number],
    ) ||
    object.noRetry !== true ||
    object.durableTerminalState !== "ABSENT_TEST_CANDIDATE_ONLY" ||
    object.evidence !== "UNATTESTED_TEST_ONLY"
  ) {
    throw unavailable();
  }
  return deepFreeze({
    state: "RUNNER_SLOT_FAILED_TEST_CANDIDATE" as const,
    observedAt: requireOrderedTimestamp(
      object.observedAt,
      options.firstAllowedAt,
      options.now,
    ),
    authorizationDigest: options.reservation.authorizationDigest,
    runIdHash: options.reservation.runIdHash,
    claimId: options.reservation.claimId,
    reservationId: options.reservation.reservationId,
    receiptDigest: options.receiptVerification.receiptDigest,
    receiptSignatureSha256: options.receiptVerification.signatureSha256,
    slotIndex: options.reservation.slotIndex,
    fixtureId: options.reservation.fixtureId,
    runOrdinal: options.reservation.runOrdinal,
    reason:
      object.reason as (typeof RUNNER_POST_RECEIPT_FAILURE_REASONS)[number],
    noRetry: true as const,
    durableTerminalState: "ABSENT_TEST_CANDIDATE_ONLY" as const,
    evidence: "UNATTESTED_TEST_ONLY" as const,
  });
}

function validateRunnerUsage(
  value: unknown,
  preflightInputTokens: number,
  receipt: CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement,
) {
  const receiptUsage = receipt.usage;
  if (receipt.outcome !== "COMPLETED" || receiptUsage === null) {
    throw unavailable();
  }
  const object = exactDataRecord(value, [
    "source",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "totalTokensReconciliation",
    "cachedInputTokens",
    "cachedInputTokensReconciliation",
    "reasoningTokens",
    "reasoningTokensReconciliation",
  ]);
  if (
    object.source !== "PROVIDER" ||
    object.inputTokens !== receiptUsage.inputTokens ||
    object.outputTokens !== receiptUsage.outputTokens ||
    object.totalTokens !== receiptUsage.totalTokens ||
    (object.totalTokensReconciliation !== "REPORTED" &&
      object.totalTokensReconciliation !== "CALCULATED") ||
    object.cachedInputTokens !== receiptUsage.cachedInputTokens ||
    (object.cachedInputTokensReconciliation !== "REPORTED" &&
      object.cachedInputTokensReconciliation !== "ASSUMED_ZERO") ||
    (object.cachedInputTokensReconciliation === "ASSUMED_ZERO" &&
      receiptUsage.cachedInputTokens !== 0) ||
    object.reasoningTokens !== receiptUsage.reasoningTokens ||
    (object.reasoningTokensReconciliation !== "REPORTED" &&
      object.reasoningTokensReconciliation !== "UNAVAILABLE") ||
    (object.reasoningTokensReconciliation === "UNAVAILABLE" &&
      receiptUsage.reasoningTokens !== null) ||
    (object.reasoningTokensReconciliation === "REPORTED" &&
      receiptUsage.reasoningTokens === null) ||
    receiptUsage.inputTokens > preflightInputTokens
  ) {
    throw unavailable();
  }
  return deepFreeze({
    source: "PROVIDER" as const,
    inputTokens: receiptUsage.inputTokens,
    outputTokens: receiptUsage.outputTokens,
    totalTokens: receiptUsage.totalTokens,
    totalTokensReconciliation: object.totalTokensReconciliation as
      | "REPORTED"
      | "CALCULATED",
    cachedInputTokens: receiptUsage.cachedInputTokens,
    cachedInputTokensReconciliation:
      object.cachedInputTokensReconciliation as
        | "REPORTED"
        | "ASSUMED_ZERO",
    reasoningTokens: receiptUsage.reasoningTokens,
    reasoningTokensReconciliation: object.reasoningTokensReconciliation as
      | "REPORTED"
      | "UNAVAILABLE",
  });
}

function validateRunnerCriticalChecks(value: unknown) {
  const object = exactDataRecord(value, RUNNER_CRITICAL_CHECK_KEYS);
  const result = {} as Record<
    (typeof RUNNER_CRITICAL_CHECK_KEYS)[number],
    true
  >;
  for (const key of RUNNER_CRITICAL_CHECK_KEYS) {
    if (object[key] !== true) throw unavailable();
    result[key] = true;
  }
  return deepFreeze(result);
}

function validateRunnerHumanReviews(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length !== RUNNER_HUMAN_REVIEW_LOCALES.length
  ) {
    throw unavailable();
  }
  return deepFreeze(
    value.map((candidate, index) => {
      const object = exactDataRecord(candidate, ["locale", "passed"]);
      const locale = RUNNER_HUMAN_REVIEW_LOCALES[index];
      if (object.locale !== locale || object.passed !== true) {
        throw unavailable();
      }
      return deepFreeze({ locale, passed: true as const });
    }),
  );
}

function requireNullRunnerAcceptance(value: unknown): null {
  if (value !== null) throw unavailable();
  return null;
}

function requireNullRunnerFailure(value: unknown): null {
  if (value !== null) throw unavailable();
  return null;
}

function validateReceiptPersistence(
  value: unknown,
  receipt: SanitizedReceiptVerification,
  expectedCallerIdentityHmac: string,
  now: string,
): SanitizedReceiptPersistence {
  const object = exactDataRecord(value, [
    "state",
    "observedAt",
    "receiptDigest",
    "signatureSha256",
    "outcome",
    "callerIdentityHmac",
    "writeDisposition",
    "evidence",
  ]);
  if (
    object.state !==
      "RECEIPT_RECORDED_TEST_CANDIDATE_NOT_DB_ATTESTED" ||
    object.receiptDigest !== receipt.receiptDigest ||
    object.signatureSha256 !== receipt.signatureSha256 ||
    object.outcome !== receipt.outcome ||
    object.callerIdentityHmac !== expectedCallerIdentityHmac ||
    (object.writeDisposition !== "FIRST_INSERT_TEST_CANDIDATE" &&
      object.writeDisposition !== "EXACT_REPLAY_TEST_CANDIDATE") ||
    object.evidence !== "UNATTESTED_TEST_ONLY"
  ) {
    throw unavailable();
  }
  return deepFreeze({
    state:
      "RECEIPT_RECORDED_TEST_CANDIDATE_NOT_DB_ATTESTED" as const,
    observedAt: requireOrderedTimestamp(
      object.observedAt,
      receipt.observedAt,
      now,
    ),
    receiptDigest: receipt.receiptDigest,
    signatureSha256: receipt.signatureSha256,
    outcome: receipt.outcome,
    callerIdentityHmac: requireSha256(expectedCallerIdentityHmac),
    writeDisposition: object.writeDisposition,
    evidence: "UNATTESTED_TEST_ONLY" as const,
  });
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
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

function requireOrderedTimestamp(
  value: unknown,
  lowerBound: string,
  upperBound: string,
) {
  const timestamp = requireTimestamp(value);
  if (
    Date.parse(timestamp) < Date.parse(lowerBound) ||
    Date.parse(timestamp) > Date.parse(upperBound)
  ) {
    throw unavailable();
  }
  return timestamp;
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
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
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
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
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

function collectSha256Strings(
  value: unknown,
  result = new Set<string>(),
  seen = new Set<object>(),
): Set<string> {
  if (typeof value === "string") {
    if (SHA256_PATTERN.test(value)) result.add(value);
    return result;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return result;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    collectSha256Strings(child, result, seen);
  }
  return result;
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
    "Communication Note preview reserve-before-dispatch coordinator is unavailable",
  );
}
