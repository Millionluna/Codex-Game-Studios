import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES,
  evaluateCaresLinkV1CommunicationNoteGoldenCandidate,
  type CaresLinkV1CommunicationNoteGoldenFixture,
} from "./communication-note-golden";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_CRITICAL_EVALUATION_CHECKS,
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST,
  validateCaresLinkV1CommunicationNotePreviewEvaluationPlan,
} from "./communication-note-preview-evaluation-policy";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
  validateCaresLinkV1CommunicationNotePreviewManifest,
} from "./communication-note-preview-evaluation-manifest";
import { CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST } from "./communication-note-openai-request-template";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST,
  renderCaresLinkV1CommunicationNotePinnedPreviewRequestBody,
  requireCaresLinkV1CommunicationNotePreviewRequestBodyPinSlot,
} from "./communication-note-preview-request-body-pin";
import { createCaresLinkV1CommunicationNoteProviderPolicyCandidate } from "./communication-note-provider-policy";
import {
  buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest,
  requireCaresLinkV1OpenAiCommunicationNotePinnedContractTestProvider,
  type CaresLinkV1OpenAiCommunicationNotePinnedContractTestProvider,
  type CaresLinkV1OpenAiCommunicationNoteRequestBodyEvidence,
} from "./openai-communication-note-provider.server";
import {
  createCaresLinkV1NoteProviderCandidateDigest,
  createCaresLinkV1NoteProviderWorkerPolicyBinding,
  validateCaresLinkV1NoteProviderAttemptEvidence,
} from "./note-generation-provider-policy";
import {
  createCaresLinkV1NoteGenerationWorkerPolicyDigest,
  parseCaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationWorkerPolicyDefinition,
} from "./note-generation-worker-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
} from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_VERSION =
  "runner.communication.openai.synthetic-preview.2026-08-27.m1g-a.v2" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_READY =
  false as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_RUNNER_POLICY =
  undefined as CaresLinkV1CommunicationNotePreviewRunnerPolicy | undefined;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_VERSION =
  "worker.communication.synthetic-preview.2026-08-27.v1" as const;

const PREVIEW_WORKER_POLICY_DEFINITION = deepFreeze({
  version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_VERSION,
  status: "APPROVED",
  maxQueueAgeMs: 60_000,
  minimumPayloadRemainingAtClaimMs: 40_000,
  leaseDurationMs: 30_000,
  heartbeatIntervalMs: 10_000,
  heartbeatSafetyMarginMs: 5_000,
  attemptDeadlineMs: 40_000,
  providerDeadlineMs: 30_000,
  commitSafetyMarginMs: 10_000,
  maxAttempts: 1,
  retryDelayMsAfterAttempt: [],
  retryableOutcomes: [],
  recoveryBatchLimit: 1,
  jitter: { mode: "NONE" },
} as const satisfies CaresLinkV1NoteGenerationWorkerPolicyDefinition);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST =
  "5b91823e2d9e842f2e64e12f9a79610291f9219cd220ec5ac7bea3cd686200f2" as const;

const computedWorkerPolicyDigest =
  createCaresLinkV1NoteGenerationWorkerPolicyDigest(
    PREVIEW_WORKER_POLICY_DEFINITION,
  );
if (
  computedWorkerPolicyDigest !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST
) {
  throw invalid(
    "Communication Note preview worker policy changed without a reviewed digest pin",
  );
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY =
  parseCaresLinkV1NoteGenerationWorkerPolicy({
    ...PREVIEW_WORKER_POLICY_DEFINITION,
    digest: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST,
  });

const providerPolicy =
  createCaresLinkV1CommunicationNoteProviderPolicyCandidate();
const evaluationPlan =
  validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
  );
const manifest = validateCaresLinkV1CommunicationNotePreviewManifest(
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST,
);

const RUNNER_POLICY_CORE = deepFreeze({
  version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_VERSION,
  status: "SOURCE_ONLY_AWAITING_EXPLICIT_PAID_PREVIEW_APPROVAL",
  capability: "SOURCE_CONTRACT_ONLY",
  evaluationPlanDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST,
  providerPolicyDigest: providerPolicy.policyDigest,
  requestTemplateDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST,
  manifestDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
  goldenFixtureSetDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST,
  requestBodyPinBundleDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST,
  workerPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST,
  requestBodyPin: {
    status: "SOURCE_PINNED_REVIEW_CANDIDATE_NOT_EXECUTION_AUTHORIZATION",
    scope: "OPENAI_RESPONSES_JSON_REQUEST_BODY_ONLY",
    transportScope: "APPLICATION_HTTP_ENVELOPE_NOT_TRANSPORT_BYTES",
    authenticity: "UNATTESTED_SOURCE_PIN_ONLY",
    executionAuthority: "NOT_EXECUTION_AUTHORITY",
    externalOwnerApproval: "ABSENT",
    dispatchAttestation: "ABSENT",
  },
  execution: {
    ordering: "SERIAL_MANIFEST_ORDER",
    maximumCalls: 6,
    automaticRetry: false,
    terminalFailure: true,
    sameRunIdReplay: "RETURN_SAME_TERMINAL_PROMISE",
    differentRunIdReplay: "REJECT",
    approvalStorage: "NOT_IMPLEMENTED",
    providerTransport: "PINNED_REQUEST_BODY_MOCK_INJECTION_ONLY",
    requestBodyDispatch:
      "PROVIDER_VALIDATES_THEN_SENDS_SAME_JSON_STRING_WITHOUT_RESERIALIZATION",
    injectedCallbackDeadlineMs: 5_000,
    injectedCallbacksSecurityBoundary:
      "TRUSTED_TEST_CODE_NOT_A_SECURITY_BOUNDARY",
  },
  preflight: {
    inputTokenCounter: "INJECTED_MOCK_ONLY",
    maxInputTokensPerCall: 10_000,
    maxOutputTokensPerCall: 2_400,
    reservationCachedInputTokens: 0,
    projectedCostMicroUsdPerCall: 20_130,
    projectedCostMicroUsd: 120_780,
  },
  budget: {
    currency: "USD",
    maxCostMicroUsd: 250_000,
    pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1",
    baseInputMicroUsdPerMillionTokens: 750_000,
    baseCachedInputMicroUsdPerMillionTokens: 75_000,
    baseOutputMicroUsdPerMillionTokens: 4_500_000,
    regionalResidencyUpliftBasisPoints: 1_000,
    pricingNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE",
  },
  report: {
    contentFree: true,
    authenticity: "UNATTESTED_TEST_CONTRACT_ONLY",
    requiredCandidateCount: 6,
    requiredLanguageDraftReviewCount: 18,
    humanReviewMode: "INJECTED_MOCK_CONTRACT_ONLY",
    criticalChecks:
      CARESLINK_V1_COMMUNICATION_NOTE_CRITICAL_EVALUATION_CHECKS,
  },
} as const);

export type CaresLinkV1CommunicationNotePreviewRunnerPolicy =
  typeof RUNNER_POLICY_CORE & Readonly<{ runnerPolicyDigest: string }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST =
  "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4" as const;

const computedRunnerPolicyDigest = createRunnerDigest(RUNNER_POLICY_CORE);
if (
  computedRunnerPolicyDigest !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST
) {
  throw invalid(
    "Communication Note preview runner policy changed without a reviewed digest pin",
  );
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY =
  deepFreeze({
    ...RUNNER_POLICY_CORE,
    runnerPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST,
  }) satisfies CaresLinkV1CommunicationNotePreviewRunnerPolicy;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_FAILURE_REASONS =
  deepFreeze([
    "RUN_INPUT_INVALID",
    "RUN_CONFLICT",
    "CANCELLED",
    "INPUT_TOKEN_PREFLIGHT_FAILED",
    "REQUEST_BODY_PIN_MISMATCH",
    "BUDGET_EXCEEDED",
    "PROVIDER_FAILED",
    "PROVIDER_EVIDENCE_INVALID",
    "GOLDEN_EVALUATION_FAILED",
    "HUMAN_REVIEW_FAILED",
    "REPORT_INVALID",
  ] as const);

export type CaresLinkV1CommunicationNotePreviewRunnerFailureReason =
  (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_FAILURE_REASONS)[number];

export class CaresLinkV1CommunicationNotePreviewRunnerError extends Error {
  readonly reason: CaresLinkV1CommunicationNotePreviewRunnerFailureReason;

  constructor(reason: CaresLinkV1CommunicationNotePreviewRunnerFailureReason) {
    super("Communication Note preview evaluation failed");
    this.name = "CaresLinkV1CommunicationNotePreviewRunnerError";
    this.reason = reason;
  }
}

const HUMAN_REVIEW_LOCALES = deepFreeze([
  "en",
  "zh-Hans",
  "zh-Hant",
] as const);

const PASSED_CRITICAL_CHECKS = deepFreeze({
  STRICT_SCHEMA: true,
  SHARED_OUTPUT_PRIVACY: true,
  DATE_TIME_PARITY: true,
  NUMERIC_PARITY: true,
  DECISION_LANGUAGE: true,
  REFUSAL_ABSENT: true,
  HUMAN_SEMANTIC_GROUNDEDNESS: true,
} as const);

export type CaresLinkV1CommunicationNotePreviewHumanReview = Readonly<{
  locale: (typeof HUMAN_REVIEW_LOCALES)[number];
  passed: true;
}>;

type PreviewRequest = ReturnType<
  typeof buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest
>;

type RunnerClock = Readonly<{ now(): string }>;

type ContractTestRunnerOptions = Readonly<{
  capability: "MOCKED_CONTRACT_TEST_ONLY";
  provider: CaresLinkV1OpenAiCommunicationNotePinnedContractTestProvider;
  countInputTokens(request: PreviewRequest): number | Promise<number>;
  reviewCandidate(input: Readonly<{
    fixtureId: string;
    runOrdinal: number;
    candidate: unknown;
    requiredLocales: typeof HUMAN_REVIEW_LOCALES;
  }>):
    | readonly CaresLinkV1CommunicationNotePreviewHumanReview[]
    | Promise<readonly CaresLinkV1CommunicationNotePreviewHumanReview[]>;
  clock: RunnerClock;
}>;

export type CaresLinkV1CommunicationNotePreviewEvaluationRunInput = Readonly<{
  runId: string;
  signal: AbortSignal;
}>;

export type CaresLinkV1CommunicationNotePreviewEvaluationSlotEvidence =
  Readonly<{
    fixtureId: string;
    runOrdinal: number;
    fixtureDigest: string;
    semanticCanonicalRequestSha256: string;
    requestBodySha256: string;
    requestBodyUtf8ByteLength: number;
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
    criticalChecks: typeof PASSED_CRITICAL_CHECKS;
    humanReviews: readonly CaresLinkV1CommunicationNotePreviewHumanReview[];
  }>;

type EvaluationReportCore = Readonly<{
  version: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_VERSION;
  status: "PASS";
  runnerPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST;
  evaluationPlanDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST;
  providerPolicyDigest: string;
  requestTemplateDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST;
  manifestDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST;
  goldenFixtureSetDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST;
  requestBodyPinBundleDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST;
  workerPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST;
  runIdHash: string;
  startedAt: string;
  completedAt: string;
  currency: "USD";
  pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1";
  costNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE";
  authenticity: "UNATTESTED_TEST_CONTRACT_ONLY";
  requestBodyPinAuthenticity: "UNATTESTED_SOURCE_PIN_ONLY";
  requestBodyPinExecutionAuthority: "NOT_EXECUTION_AUTHORITY";
  requestBodyPinDispatchAttestation: "ABSENT";
  callsDispatched: 6;
  candidatesAccepted: 6;
  languageDraftReviewsPassed: 18;
  projectedCostMicroUsd: 120_780;
  calculatedCostUpperBoundMicroUsd: number;
  slots: readonly CaresLinkV1CommunicationNotePreviewEvaluationSlotEvidence[];
}>;

export type CaresLinkV1CommunicationNotePreviewEvaluationReport =
  EvaluationReportCore & Readonly<{ reportDigest: string }>;

export type CaresLinkV1CommunicationNotePreviewEvaluationRunner =
  Readonly<{
    run(
      input: CaresLinkV1CommunicationNotePreviewEvaluationRunInput,
    ): Promise<CaresLinkV1CommunicationNotePreviewEvaluationReport>;
  }>;

/**
 * Paid execution remains unavailable. The source-frozen plan and runner policy
 * are evidence, not an approval token, credential source or durable run claim.
 */
export function createCaresLinkV1CommunicationNotePreviewEvaluationRunner(
  options: Readonly<{
    capability: "DISPOSABLE_SYNTHETIC_DEIDENTIFIED_PREVIEW_ONLY";
    evaluationPlanSnapshot: unknown;
    runnerPolicySnapshot: unknown;
    clock: RunnerClock;
  }>,
): CaresLinkV1CommunicationNotePreviewEvaluationRunner {
  if (!isPlainObject(options)) throw unavailable();
  assertExactKeys(
    options,
    [
      "capability",
      "evaluationPlanSnapshot",
      "runnerPolicySnapshot",
      "clock",
    ],
    unavailable,
  );
  if (
    options.capability !==
      "DISPOSABLE_SYNTHETIC_DEIDENTIFIED_PREVIEW_ONLY" ||
    !options.clock ||
    typeof options.clock.now !== "function"
  ) {
    throw unavailable();
  }
  validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(
    options.evaluationPlanSnapshot,
  );
  validateCaresLinkV1CommunicationNotePreviewRunnerPolicy(
    options.runnerPolicySnapshot,
  );
  if (
    !Boolean(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_READY) ||
    CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_RUNNER_POLICY ===
      undefined
  ) {
    throw unavailable();
  }
  throw unavailable();
}

/**
 * Executable only with the provider adapter's branded test instance and
 * explicitly trusted test callbacks. The module has no built-in key or HTTPS
 * path; injected callbacks are arbitrary code and are not a security boundary.
 */
export function createCaresLinkV1CommunicationNotePreviewEvaluationContractTestRunner(
  options: ContractTestRunnerOptions,
): CaresLinkV1CommunicationNotePreviewEvaluationRunner {
  if (!isPlainObject(options)) throw unavailable();
  assertExactKeys(
    options,
    [
      "capability",
      "provider",
      "countInputTokens",
      "reviewCandidate",
      "clock",
    ],
    unavailable,
  );
  if (
    options.capability !== "MOCKED_CONTRACT_TEST_ONLY" ||
    typeof options.countInputTokens !== "function" ||
    typeof options.reviewCandidate !== "function" ||
    !options.clock ||
    typeof options.clock.now !== "function"
  ) {
    throw unavailable();
  }
  const provider =
    requireCaresLinkV1OpenAiCommunicationNotePinnedContractTestProvider(
      options.provider,
    );
  let claimedRunIdHash: string | undefined;
  let terminalPromise:
    | Promise<CaresLinkV1CommunicationNotePreviewEvaluationReport>
    | undefined;

  return Object.freeze({
    run(input) {
      let validated: ReturnType<typeof validateRunInput>;
      try {
        validated = validateRunInput(input);
      } catch {
        throw runnerError("RUN_INPUT_INVALID");
      }
      const runIdHash = hashRunId(validated.runId);
      if (terminalPromise) {
        if (claimedRunIdHash !== runIdHash) {
          throw runnerError("RUN_CONFLICT");
        }
        return terminalPromise;
      }
      claimedRunIdHash = runIdHash;
      terminalPromise = Promise.resolve().then(() =>
        executeContractTestRun({
          runIdHash,
          signal: validated.signal,
          provider,
          countInputTokens: options.countInputTokens,
          reviewCandidate: options.reviewCandidate,
          clock: options.clock,
        }),
      );
      return terminalPromise;
    },
  });
}

export function createCaresLinkV1CommunicationNotePreviewRunnerPolicyDigest(
  value: unknown,
) {
  return createRunnerDigest(value);
}

export function validateCaresLinkV1CommunicationNotePreviewRunnerPolicy(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerPolicy {
  let actual: string;
  let expected: string;
  try {
    actual = stringifyCaresLinkV1CanonicalJson(value);
    expected = stringifyCaresLinkV1CanonicalJson(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY,
    );
  } catch {
    throw invalid("Communication Note preview runner policy is invalid");
  }
  if (actual !== expected) {
    throw invalid("Communication Note preview runner policy does not match M1g-a");
  }
  return CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY;
}

export function calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd(
  value: unknown,
): number {
  const object = requireObject(
    value,
    "Communication Note preview token usage is invalid",
  );
  assertExactKeys(
    object,
    ["inputTokens", "cachedInputTokens", "outputTokens"],
    () => invalid("Communication Note preview token usage is invalid"),
  );
  const inputTokens = requireNonNegativeSafeInteger(
    object.inputTokens,
    "Communication Note preview input token count is invalid",
  );
  const cachedInputTokens = requireNonNegativeSafeInteger(
    object.cachedInputTokens,
    "Communication Note preview cached input token count is invalid",
  );
  const outputTokens = requireNonNegativeSafeInteger(
    object.outputTokens,
    "Communication Note preview output token count is invalid",
  );
  if (cachedInputTokens > inputTokens) {
    throw invalid(
      "Communication Note preview cached input tokens exceed input tokens",
    );
  }

  const uncachedInputTokens = BigInt(inputTokens - cachedInputTokens);
  const numerator =
    (uncachedInputTokens *
      BigInt(
        RUNNER_POLICY_CORE.budget.baseInputMicroUsdPerMillionTokens,
      ) +
      BigInt(cachedInputTokens) *
        BigInt(
          RUNNER_POLICY_CORE.budget.baseCachedInputMicroUsdPerMillionTokens,
        ) +
      BigInt(outputTokens) *
        BigInt(
          RUNNER_POLICY_CORE.budget.baseOutputMicroUsdPerMillionTokens,
        )) *
    BigInt(
      10_000 +
        RUNNER_POLICY_CORE.budget.regionalResidencyUpliftBasisPoints,
    );
  const denominator = BigInt(1_000_000) * BigInt(10_000);
  const microUsd = ceilDivide(numerator, denominator);
  if (microUsd > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw invalid("Communication Note preview calculated cost is invalid");
  }
  return Number(microUsd);
}

export function validateCaresLinkV1CommunicationNotePreviewEvaluationReport(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewEvaluationReport {
  try {
    const object = requireObject(
      value,
      "Communication Note preview evaluation report is invalid",
    );
    assertExactKeys(
      object,
      [
        "version",
        "status",
        "runnerPolicyDigest",
        "evaluationPlanDigest",
        "providerPolicyDigest",
        "requestTemplateDigest",
        "manifestDigest",
        "goldenFixtureSetDigest",
        "requestBodyPinBundleDigest",
        "workerPolicyDigest",
        "runIdHash",
        "startedAt",
        "completedAt",
        "currency",
        "pricingVersion",
        "costNature",
        "authenticity",
        "requestBodyPinAuthenticity",
        "requestBodyPinExecutionAuthority",
        "requestBodyPinDispatchAttestation",
        "callsDispatched",
        "candidatesAccepted",
        "languageDraftReviewsPassed",
        "projectedCostMicroUsd",
        "calculatedCostUpperBoundMicroUsd",
        "slots",
        "reportDigest",
      ],
      () => invalid("Communication Note preview evaluation report is invalid"),
    );
    assertStaticReportFields(object);
    const runIdHash = requireSha256(
      object.runIdHash,
      "Communication Note preview run ID hash is invalid",
    );
    const startedAt = requireServerTime(
      object.startedAt,
      "Communication Note preview start time is invalid",
    );
    const completedAt = requireServerTime(
      object.completedAt,
      "Communication Note preview completion time is invalid",
    );
    if (Date.parse(completedAt) < Date.parse(startedAt)) {
      throw invalid(
        "Communication Note preview completion precedes its start",
      );
    }
    if (!Array.isArray(object.slots) || object.slots.length !== 6) {
      throw invalid("Communication Note preview slot evidence is invalid");
    }
    const slots = object.slots.map((slot, index) =>
      validateSlotEvidence(slot, index),
    );
    if (
      new Set(slots.map(({ providerRequestIdHash }) => providerRequestIdHash))
        .size !== slots.length
    ) {
      throw invalid(
        "Communication Note preview provider request hashes are not unique",
      );
    }
    const calculatedCostUpperBoundMicroUsd =
      requireNonNegativeSafeInteger(
        object.calculatedCostUpperBoundMicroUsd,
        "Communication Note preview aggregate cost is invalid",
      );
    const sum = slots.reduce(
      (total, slot) => total + slot.calculatedCostUpperBoundMicroUsd,
      0,
    );
    if (
      calculatedCostUpperBoundMicroUsd !== sum ||
      calculatedCostUpperBoundMicroUsd >
        RUNNER_POLICY_CORE.budget.maxCostMicroUsd
    ) {
      throw invalid("Communication Note preview aggregate cost is invalid");
    }

    const core: EvaluationReportCore = {
      version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_VERSION,
      status: "PASS",
      runnerPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST,
      evaluationPlanDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST,
      providerPolicyDigest: providerPolicy.policyDigest,
      requestTemplateDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST,
      manifestDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
      goldenFixtureSetDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST,
      requestBodyPinBundleDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST,
      workerPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST,
      runIdHash,
      startedAt,
      completedAt,
      currency: "USD",
      pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1",
      costNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE",
      authenticity: "UNATTESTED_TEST_CONTRACT_ONLY",
      requestBodyPinAuthenticity: "UNATTESTED_SOURCE_PIN_ONLY",
      requestBodyPinExecutionAuthority: "NOT_EXECUTION_AUTHORITY",
      requestBodyPinDispatchAttestation: "ABSENT",
      callsDispatched: 6,
      candidatesAccepted: 6,
      languageDraftReviewsPassed: 18,
      projectedCostMicroUsd: 120_780,
      calculatedCostUpperBoundMicroUsd,
      slots,
    };
    const reportDigest = requireSha256(
      object.reportDigest,
      "Communication Note preview report digest is invalid",
    );
    if (createReportDigest(core) !== reportDigest) {
      throw invalid(
        "Communication Note preview report digest does not match the report",
      );
    }
    return deepFreeze({ ...core, reportDigest });
  } catch (error) {
    if (error instanceof CaresLinkV1ContractError) throw error;
    throw invalid("Communication Note preview evaluation report is invalid");
  }
}

async function executeContractTestRun(input: Readonly<{
  runIdHash: string;
  signal: AbortSignal;
  provider: CaresLinkV1OpenAiCommunicationNotePinnedContractTestProvider;
  countInputTokens: ContractTestRunnerOptions["countInputTokens"];
  reviewCandidate: ContractTestRunnerOptions["reviewCandidate"];
  clock: RunnerClock;
}>): Promise<CaresLinkV1CommunicationNotePreviewEvaluationReport> {
  const startedAt = runnerTime(input.clock, "RUN_INPUT_INVALID");
  if (input.signal.aborted) throw runnerError("CANCELLED");
  assertStaticRunnerBindings();

  const preflightSlots = [] as Array<Readonly<{
    fixture: CaresLinkV1CommunicationNoteGoldenFixture;
    fixtureId: string;
    runOrdinal: number;
    fixtureDigest: string;
    request: PreviewRequest;
    semanticCanonicalRequestSha256: string;
    requestBodySha256: string;
    requestBodyUtf8ByteLength: number;
    preflightInputTokens: number;
  }>>;

  for (const [slotIndex, slot] of manifest.slots.entries()) {
    if (input.signal.aborted) throw runnerError("CANCELLED");
    const fixture = requireManifestFixture(slot.fixtureId);
    const request = deepFreeze(
      buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest({
        policySnapshot: providerPolicy,
        evaluationPlanSnapshot: evaluationPlan,
        sourceLocale: fixture.sourceLocale,
        cleanedFacts: fixture.cleanedFacts,
      }),
    );
    let pinnedRequestBody: ReturnType<
      typeof renderCaresLinkV1CommunicationNotePinnedPreviewRequestBody
    >;
    try {
      pinnedRequestBody =
        renderCaresLinkV1CommunicationNotePinnedPreviewRequestBody({
          slotIndex,
          fixtureId: fixture.id,
          runOrdinal: slot.runOrdinal,
          request,
        });
    } catch {
      throw runnerError("REQUEST_BODY_PIN_MISMATCH");
    }
    const semanticCanonicalRequestSha256 =
      pinnedRequestBody.semanticCanonicalSha256;
    const preflightInputTokens = await awaitTrustedTestCallback({
      signal: input.signal,
      failureReason: "INPUT_TOKEN_PREFLIGHT_FAILED",
      invoke: () => input.countInputTokens(request),
    });
    if (
      !Number.isSafeInteger(preflightInputTokens) ||
      (preflightInputTokens as number) < 1 ||
      (preflightInputTokens as number) >
        RUNNER_POLICY_CORE.preflight.maxInputTokensPerCall
    ) {
      throw runnerError("INPUT_TOKEN_PREFLIGHT_FAILED");
    }
    preflightSlots.push(
      Object.freeze({
        fixture,
        fixtureId: fixture.id,
        runOrdinal: slot.runOrdinal,
        fixtureDigest: canonicalDigest(fixture),
        request,
        semanticCanonicalRequestSha256,
        requestBodySha256: pinnedRequestBody.bodySha256,
        requestBodyUtf8ByteLength: pinnedRequestBody.bodyUtf8ByteLength,
        preflightInputTokens,
      }),
    );
  }

  if (
    preflightSlots.length !== RUNNER_POLICY_CORE.execution.maximumCalls ||
    projectedCostPerCall() !==
      RUNNER_POLICY_CORE.preflight.projectedCostMicroUsdPerCall ||
    projectedCostPerCall() * preflightSlots.length !==
      RUNNER_POLICY_CORE.preflight.projectedCostMicroUsd ||
    RUNNER_POLICY_CORE.preflight.projectedCostMicroUsd >
      RUNNER_POLICY_CORE.budget.maxCostMicroUsd
  ) {
    throw runnerError("BUDGET_EXCEEDED");
  }

  const slots: CaresLinkV1CommunicationNotePreviewEvaluationSlotEvidence[] =
    [];
  let callsDispatched = 0;
  let calculatedCostUpperBoundMicroUsd = 0;
  let latestCompletedEventMs = Date.parse(startedAt);
  const providerRequestIdHashes = new Set<string>();

  for (const [index, slot] of preflightSlots.entries()) {
    if (input.signal.aborted) throw runnerError("CANCELLED");
    const reservedCostAfterDispatch =
      calculatedCostUpperBoundMicroUsd +
      (preflightSlots.length - index) * projectedCostPerCall();
    if (reservedCostAfterDispatch > RUNNER_POLICY_CORE.budget.maxCostMicroUsd) {
      throw runnerError("BUDGET_EXCEEDED");
    }

    const providerStartedAt = runnerTime(input.clock, "PROVIDER_FAILED");
    if (Date.parse(providerStartedAt) < latestCompletedEventMs) {
      throw runnerError("REPORT_INVALID");
    }
    const workerPolicyBinding =
      createCaresLinkV1NoteProviderWorkerPolicyBinding({
        policySnapshot: providerPolicy,
        workerPolicy: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY,
        startedAt: providerStartedAt,
      });
    callsDispatched += 1;

    let result: Awaited<
      ReturnType<
        CaresLinkV1OpenAiCommunicationNotePinnedContractTestProvider["generate"]
      >
    >;
    try {
      result = await callProviderOnce({
        provider: input.provider,
        signal: input.signal,
        providerInput: {
          workerPrivateCorrelation: `${input.runIdHash}:${index + 1}`,
          noteType: "communication",
          sourceLocale: slot.fixture.sourceLocale,
          contractVersion: CARESLINK_V1_CONTRACT_VERSION,
          schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
          cleanedFacts: slot.fixture.cleanedFacts,
          workerPolicyBinding,
          workerPolicy:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY,
          signal: input.signal,
          policySnapshot: providerPolicy,
          requestBodyPinSlot: {
            slotIndex: index,
            fixtureId: slot.fixtureId,
            runOrdinal: slot.runOrdinal,
          },
        },
      });
    } catch {
      throw runnerError(input.signal.aborted ? "CANCELLED" : "PROVIDER_FAILED");
    }
    if (callsDispatched !== index + 1) {
      throw runnerError("PROVIDER_FAILED");
    }

    validateProviderRequestBodyEvidence(result.requestBodyEvidence, {
      slotIndex: index,
      fixtureId: slot.fixtureId,
      runOrdinal: slot.runOrdinal,
      bodySha256: slot.requestBodySha256,
      bodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
      semanticCanonicalSha256: slot.semanticCanonicalRequestSha256,
    });

    const candidate = deepFreeze(result.candidate);
    let evidence: ReturnType<
      typeof validateCaresLinkV1NoteProviderAttemptEvidence
    >;
    try {
      evidence = validateCaresLinkV1NoteProviderAttemptEvidence(
        result.evidence,
        {
          policySnapshot: providerPolicy,
          workerPolicyBinding,
          workerPolicy:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY,
          candidate,
        },
      );
    } catch {
      throw runnerError("PROVIDER_EVIDENCE_INVALID");
    }
    latestCompletedEventMs = Date.parse(evidence.finishedAt);
    if (
      evidence.providerRequestIdHash === null ||
      providerRequestIdHashes.has(evidence.providerRequestIdHash)
    ) {
      throw runnerError("PROVIDER_EVIDENCE_INVALID");
    }
    providerRequestIdHashes.add(evidence.providerRequestIdHash);

    try {
      evaluateCaresLinkV1CommunicationNoteGoldenCandidate(
        slot.fixture,
        candidate,
      );
    } catch {
      throw runnerError("GOLDEN_EVALUATION_FAILED");
    }

    const usage = reconcileUsage(evidence.usage, slot.preflightInputTokens);
    const calculatedSlotCost =
      calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
      });
    if (
      calculatedSlotCost >
      RUNNER_POLICY_CORE.preflight.projectedCostMicroUsdPerCall
    ) {
      throw runnerError("BUDGET_EXCEEDED");
    }
    const nextCalculatedCost =
      calculatedCostUpperBoundMicroUsd + calculatedSlotCost;
    const remainingProjection =
      (preflightSlots.length - index - 1) * projectedCostPerCall();
    if (
      nextCalculatedCost + remainingProjection >
      RUNNER_POLICY_CORE.budget.maxCostMicroUsd
    ) {
      throw runnerError("BUDGET_EXCEEDED");
    }

    let reviews: readonly CaresLinkV1CommunicationNotePreviewHumanReview[];
    try {
      reviews = validateHumanReviews(
        await awaitTrustedTestCallback({
          signal: input.signal,
          failureReason: "HUMAN_REVIEW_FAILED",
          invoke: () =>
            input.reviewCandidate({
              fixtureId: slot.fixtureId,
              runOrdinal: slot.runOrdinal,
              candidate,
              requiredLocales: HUMAN_REVIEW_LOCALES,
            }),
        }),
      );
    } catch (error) {
      if (
        error instanceof CaresLinkV1CommunicationNotePreviewRunnerError &&
        error.reason === "CANCELLED"
      ) {
        throw error;
      }
      throw runnerError("HUMAN_REVIEW_FAILED");
    }
    if (
      createCaresLinkV1NoteProviderCandidateDigest(candidate) !==
      evidence.candidateDigest
    ) {
      throw runnerError("HUMAN_REVIEW_FAILED");
    }

    calculatedCostUpperBoundMicroUsd = nextCalculatedCost;
    slots.push(
      deepFreeze({
        fixtureId: slot.fixtureId,
        runOrdinal: slot.runOrdinal,
        fixtureDigest: slot.fixtureDigest,
        semanticCanonicalRequestSha256:
          slot.semanticCanonicalRequestSha256,
        requestBodySha256: slot.requestBodySha256,
        requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
        preflightInputTokens: slot.preflightInputTokens,
        providerRequestIdHash: evidence.providerRequestIdHash,
        candidateDigest: evidence.candidateDigest,
        usage,
        calculatedCostUpperBoundMicroUsd: calculatedSlotCost,
        criticalChecks: PASSED_CRITICAL_CHECKS,
        humanReviews: reviews,
      }),
    );
  }

  if (
    callsDispatched !== 6 ||
    slots.length !== 6 ||
    slots.reduce((sum, slot) => sum + slot.humanReviews.length, 0) !== 18
  ) {
    throw runnerError("REPORT_INVALID");
  }

  if (input.signal.aborted) throw runnerError("CANCELLED");
  const completedAt = runnerTime(input.clock, "REPORT_INVALID");
  if (input.signal.aborted) throw runnerError("CANCELLED");
  if (Date.parse(completedAt) < latestCompletedEventMs) {
    throw runnerError("REPORT_INVALID");
  }
  const core: EvaluationReportCore = {
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_VERSION,
    status: "PASS",
    runnerPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST,
    evaluationPlanDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST,
    providerPolicyDigest: providerPolicy.policyDigest,
    requestTemplateDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST,
    manifestDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
    goldenFixtureSetDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST,
    requestBodyPinBundleDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST,
    workerPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST,
    runIdHash: input.runIdHash,
    startedAt,
    completedAt,
    currency: "USD",
    pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1",
    costNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE",
    authenticity: "UNATTESTED_TEST_CONTRACT_ONLY",
    requestBodyPinAuthenticity: "UNATTESTED_SOURCE_PIN_ONLY",
    requestBodyPinExecutionAuthority: "NOT_EXECUTION_AUTHORITY",
    requestBodyPinDispatchAttestation: "ABSENT",
    callsDispatched: 6,
    candidatesAccepted: 6,
    languageDraftReviewsPassed: 18,
    projectedCostMicroUsd: 120_780,
    calculatedCostUpperBoundMicroUsd,
    slots,
  };
  const report = deepFreeze({
    ...core,
    reportDigest: createReportDigest(core),
  });
  try {
    const validatedReport =
      validateCaresLinkV1CommunicationNotePreviewEvaluationReport(report);
    if (input.signal.aborted) throw runnerError("CANCELLED");
    return validatedReport;
  } catch {
    if (input.signal.aborted) throw runnerError("CANCELLED");
    throw runnerError("REPORT_INVALID");
  }
}

async function awaitTrustedTestCallback<T>(input: Readonly<{
  signal: AbortSignal;
  failureReason: CaresLinkV1CommunicationNotePreviewRunnerFailureReason;
  invoke: () => T | Promise<T>;
}>): Promise<T> {
  let rejectControl: ((error: Error) => void) | undefined;
  const control = new Promise<never>((_resolve, reject) => {
    rejectControl = reject;
  });
  const abortFromCaller = () => {
    rejectControl?.(runnerError("CANCELLED"));
  };
  input.signal.addEventListener("abort", abortFromCaller, { once: true });
  if (input.signal.aborted) {
    input.signal.removeEventListener("abort", abortFromCaller);
    throw runnerError("CANCELLED");
  }
  const timer = setTimeout(() => {
    rejectControl?.(runnerError(input.failureReason));
  }, RUNNER_POLICY_CORE.execution.injectedCallbackDeadlineMs);
  try {
    const result = await Promise.race([
      Promise.resolve().then(input.invoke),
      control,
    ]);
    if (input.signal.aborted) throw runnerError("CANCELLED");
    return result;
  } catch (error) {
    if (input.signal.aborted) throw runnerError("CANCELLED");
    if (
      error instanceof CaresLinkV1CommunicationNotePreviewRunnerError &&
      error.reason === input.failureReason
    ) {
      throw error;
    }
    throw runnerError(input.failureReason);
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", abortFromCaller);
  }
}

async function callProviderOnce(input: Readonly<{
  provider: CaresLinkV1OpenAiCommunicationNotePinnedContractTestProvider;
  signal: AbortSignal;
  providerInput: Parameters<
    CaresLinkV1OpenAiCommunicationNotePinnedContractTestProvider["generate"]
  >[0];
}>) {
  const controller = new AbortController();
  let rejectControl: ((error: Error) => void) | undefined;
  const control = new Promise<never>((_resolve, reject) => {
    rejectControl = reject;
  });
  const abortFromCaller = () => {
    controller.abort();
    rejectControl?.(runnerError("CANCELLED"));
  };
  input.signal.addEventListener("abort", abortFromCaller, { once: true });
  if (input.signal.aborted) {
    input.signal.removeEventListener("abort", abortFromCaller);
    throw runnerError("CANCELLED");
  }
  const timer = setTimeout(() => {
    controller.abort();
    rejectControl?.(runnerError("PROVIDER_FAILED"));
  }, CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY.providerDeadlineMs);
  try {
    return await Promise.race([
      input.provider.generate({
        ...input.providerInput,
        signal: controller.signal,
      }),
      control,
    ]);
  } catch {
    if (input.signal.aborted) throw runnerError("CANCELLED");
    throw runnerError("PROVIDER_FAILED");
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", abortFromCaller);
  }
}

function validateProviderRequestBodyEvidence(
  value: unknown,
  expected: Readonly<{
    slotIndex: number;
    fixtureId: string;
    runOrdinal: number;
    bodySha256: string;
    bodyUtf8ByteLength: number;
    semanticCanonicalSha256: string;
  }>,
): CaresLinkV1OpenAiCommunicationNoteRequestBodyEvidence {
  if (!isPlainObject(value)) {
    throw runnerError("PROVIDER_EVIDENCE_INVALID");
  }
  assertExactKeys(
    value,
    [
      "bodyPinBundleDigest",
      "slotIndex",
      "fixtureId",
      "runOrdinal",
      "bodyUtf8ByteLength",
      "bodySha256",
      "semanticCanonicalSha256",
    ],
    () => runnerError("PROVIDER_EVIDENCE_INVALID"),
  );
  if (
    value.bodyPinBundleDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST ||
    value.slotIndex !== expected.slotIndex ||
    value.fixtureId !== expected.fixtureId ||
    value.runOrdinal !== expected.runOrdinal ||
    value.bodyUtf8ByteLength !== expected.bodyUtf8ByteLength ||
    value.bodySha256 !== expected.bodySha256 ||
    value.semanticCanonicalSha256 !== expected.semanticCanonicalSha256
  ) {
    throw runnerError("PROVIDER_EVIDENCE_INVALID");
  }
  return value as CaresLinkV1OpenAiCommunicationNoteRequestBodyEvidence;
}

function reconcileUsage(
  value: ReturnType<
    typeof validateCaresLinkV1NoteProviderAttemptEvidence
  >["usage"],
  preflightInputTokens: number,
) {
  if (
    value.status !== "REPORTED" ||
    value.source !== "PROVIDER" ||
    value.inputTokens === undefined ||
    value.outputTokens === undefined
  ) {
    throw runnerError("PROVIDER_EVIDENCE_INVALID");
  }
  const inputTokens = value.inputTokens;
  const outputTokens = value.outputTokens;
  const totalTokens = value.totalTokens ?? inputTokens + outputTokens;
  const cachedInputTokens = value.cachedInputTokens ?? 0;
  const reasoningTokens = value.reasoningTokens ?? null;
  if (
    inputTokens < 1 ||
    outputTokens < 1 ||
    inputTokens > preflightInputTokens ||
    inputTokens > RUNNER_POLICY_CORE.preflight.maxInputTokensPerCall ||
    outputTokens > RUNNER_POLICY_CORE.preflight.maxOutputTokensPerCall ||
    totalTokens !== inputTokens + outputTokens ||
    cachedInputTokens > inputTokens ||
    (reasoningTokens !== null && reasoningTokens > outputTokens)
  ) {
    throw runnerError("PROVIDER_EVIDENCE_INVALID");
  }
  return deepFreeze({
    source: "PROVIDER" as const,
    inputTokens,
    outputTokens,
    totalTokens,
    totalTokensReconciliation:
      value.totalTokens === undefined
        ? ("CALCULATED" as const)
        : ("REPORTED" as const),
    cachedInputTokens,
    cachedInputTokensReconciliation:
      value.cachedInputTokens === undefined
        ? ("ASSUMED_ZERO" as const)
        : ("REPORTED" as const),
    reasoningTokens,
    reasoningTokensReconciliation:
      value.reasoningTokens === undefined
        ? ("UNAVAILABLE" as const)
        : ("REPORTED" as const),
  });
}

function validateHumanReviews(
  value: unknown,
): readonly CaresLinkV1CommunicationNotePreviewHumanReview[] {
  if (!Array.isArray(value) || value.length !== HUMAN_REVIEW_LOCALES.length) {
    throw invalid("Communication Note preview human reviews are invalid");
  }
  const reviews = value.map((review, index) => {
    const object = requireObject(
      review,
      "Communication Note preview human review is invalid",
    );
    assertExactKeys(
      object,
      ["locale", "passed"],
      () => invalid("Communication Note preview human review is invalid"),
    );
    if (
      object.locale !== HUMAN_REVIEW_LOCALES[index] ||
      object.passed !== true
    ) {
      throw invalid("Communication Note preview human review is invalid");
    }
    return Object.freeze({
      locale: HUMAN_REVIEW_LOCALES[index],
      passed: true as const,
    });
  });
  return Object.freeze(reviews);
}

function validateSlotEvidence(
  value: unknown,
  index: number,
): CaresLinkV1CommunicationNotePreviewEvaluationSlotEvidence {
  const object = requireObject(
    value,
    "Communication Note preview slot evidence is invalid",
  );
  assertExactKeys(
    object,
    [
      "fixtureId",
      "runOrdinal",
      "fixtureDigest",
      "semanticCanonicalRequestSha256",
      "requestBodySha256",
      "requestBodyUtf8ByteLength",
      "preflightInputTokens",
      "providerRequestIdHash",
      "candidateDigest",
      "usage",
      "calculatedCostUpperBoundMicroUsd",
      "criticalChecks",
      "humanReviews",
    ],
    () => invalid("Communication Note preview slot evidence is invalid"),
  );
  const manifestSlot = manifest.slots[index];
  if (
    !manifestSlot ||
    object.fixtureId !== manifestSlot.fixtureId ||
    object.runOrdinal !== manifestSlot.runOrdinal
  ) {
    throw invalid("Communication Note preview slot order is invalid");
  }
  const fixture = requireManifestFixture(manifestSlot.fixtureId);
  const fixtureDigest = requireSha256(
    object.fixtureDigest,
    "Communication Note preview fixture digest is invalid",
  );
  if (fixtureDigest !== canonicalDigest(fixture)) {
    throw invalid("Communication Note preview fixture digest does not match");
  }
  const semanticCanonicalRequestSha256 = requireSha256(
    object.semanticCanonicalRequestSha256,
    "Communication Note preview request digest is invalid",
  );
  const bodyPinSlot =
    requireCaresLinkV1CommunicationNotePreviewRequestBodyPinSlot(index);
  if (
    bodyPinSlot.fixtureId !== manifestSlot.fixtureId ||
    bodyPinSlot.runOrdinal !== manifestSlot.runOrdinal ||
    semanticCanonicalRequestSha256 !== bodyPinSlot.semanticCanonicalSha256
  ) {
    throw invalid("Communication Note preview request digest does not match");
  }
  const requestBodySha256 = requireSha256(
    object.requestBodySha256,
    "Communication Note preview request body digest is invalid",
  );
  const requestBodyUtf8ByteLength = requirePositiveSafeInteger(
    object.requestBodyUtf8ByteLength,
    "Communication Note preview request body byte length is invalid",
  );
  if (
    requestBodySha256 !== bodyPinSlot.bodySha256 ||
    requestBodyUtf8ByteLength !== bodyPinSlot.bodyUtf8ByteLength
  ) {
    throw invalid("Communication Note preview request body pin does not match");
  }
  const preflightInputTokens = requirePositiveSafeInteger(
    object.preflightInputTokens,
    "Communication Note preview preflight token count is invalid",
  );
  if (
    preflightInputTokens > RUNNER_POLICY_CORE.preflight.maxInputTokensPerCall
  ) {
    throw invalid("Communication Note preview preflight token count is invalid");
  }
  const providerRequestIdHash = requireSha256(
    object.providerRequestIdHash,
    "Communication Note preview provider request hash is invalid",
  );
  const candidateDigest = requireSha256(
    object.candidateDigest,
    "Communication Note preview candidate digest is invalid",
  );
  const usage = validateReportUsage(object.usage, preflightInputTokens);
  const calculatedCostUpperBoundMicroUsd = requireNonNegativeSafeInteger(
    object.calculatedCostUpperBoundMicroUsd,
    "Communication Note preview slot cost is invalid",
  );
  if (
    calculatedCostUpperBoundMicroUsd !==
      calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
      }) ||
    calculatedCostUpperBoundMicroUsd >
      RUNNER_POLICY_CORE.preflight.projectedCostMicroUsdPerCall
  ) {
    throw invalid("Communication Note preview slot cost is invalid");
  }
  if (
    stringifyCaresLinkV1CanonicalJson(object.criticalChecks) !==
    stringifyCaresLinkV1CanonicalJson(PASSED_CRITICAL_CHECKS)
  ) {
    throw invalid("Communication Note preview critical checks are invalid");
  }
  const humanReviews = validateHumanReviews(object.humanReviews);
  return deepFreeze({
    fixtureId: manifestSlot.fixtureId,
    runOrdinal: manifestSlot.runOrdinal,
    fixtureDigest,
    semanticCanonicalRequestSha256,
    requestBodySha256,
    requestBodyUtf8ByteLength,
    preflightInputTokens,
    providerRequestIdHash,
    candidateDigest,
    usage,
    calculatedCostUpperBoundMicroUsd,
    criticalChecks: PASSED_CRITICAL_CHECKS,
    humanReviews,
  });
}

function validateReportUsage(value: unknown, preflightInputTokens: number) {
  const object = requireObject(
    value,
    "Communication Note preview report usage is invalid",
  );
  assertExactKeys(
    object,
    [
      "source",
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "totalTokensReconciliation",
      "cachedInputTokens",
      "cachedInputTokensReconciliation",
      "reasoningTokens",
      "reasoningTokensReconciliation",
    ],
    () => invalid("Communication Note preview report usage is invalid"),
  );
  if (object.source !== "PROVIDER") {
    throw invalid("Communication Note preview report usage is invalid");
  }
  const inputTokens = requireNonNegativeSafeInteger(
    object.inputTokens,
    "Communication Note preview report input tokens are invalid",
  );
  const outputTokens = requireNonNegativeSafeInteger(
    object.outputTokens,
    "Communication Note preview report output tokens are invalid",
  );
  const totalTokens = requireNonNegativeSafeInteger(
    object.totalTokens,
    "Communication Note preview report total tokens are invalid",
  );
  const cachedInputTokens = requireNonNegativeSafeInteger(
    object.cachedInputTokens,
    "Communication Note preview report cached tokens are invalid",
  );
  const reasoningTokens =
    object.reasoningTokens === null
      ? null
      : requireNonNegativeSafeInteger(
          object.reasoningTokens,
          "Communication Note preview report reasoning tokens are invalid",
        );
  if (
    inputTokens < 1 ||
    outputTokens < 1 ||
    inputTokens > preflightInputTokens ||
    inputTokens > RUNNER_POLICY_CORE.preflight.maxInputTokensPerCall ||
    outputTokens > RUNNER_POLICY_CORE.preflight.maxOutputTokensPerCall ||
    totalTokens !== inputTokens + outputTokens ||
    cachedInputTokens > inputTokens ||
    (reasoningTokens !== null && reasoningTokens > outputTokens) ||
    !["REPORTED", "CALCULATED"].includes(
      object.totalTokensReconciliation as string,
    ) ||
    !["REPORTED", "ASSUMED_ZERO"].includes(
      object.cachedInputTokensReconciliation as string,
    ) ||
    !["REPORTED", "UNAVAILABLE"].includes(
      object.reasoningTokensReconciliation as string,
    ) ||
    (object.cachedInputTokensReconciliation === "ASSUMED_ZERO" &&
      cachedInputTokens !== 0) ||
    (object.reasoningTokensReconciliation === "UNAVAILABLE" &&
      reasoningTokens !== null) ||
    (object.reasoningTokensReconciliation === "REPORTED" &&
      reasoningTokens === null)
  ) {
    throw invalid("Communication Note preview report usage is invalid");
  }
  return deepFreeze({
    source: "PROVIDER" as const,
    inputTokens,
    outputTokens,
    totalTokens,
    totalTokensReconciliation: object.totalTokensReconciliation as
      | "REPORTED"
      | "CALCULATED",
    cachedInputTokens,
    cachedInputTokensReconciliation:
      object.cachedInputTokensReconciliation as
        | "REPORTED"
        | "ASSUMED_ZERO",
    reasoningTokens,
    reasoningTokensReconciliation: object.reasoningTokensReconciliation as
      | "REPORTED"
      | "UNAVAILABLE",
  });
}

function assertStaticReportFields(object: Record<string, unknown>) {
  if (
    object.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_VERSION ||
    object.status !== "PASS" ||
    object.runnerPolicyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST ||
    object.evaluationPlanDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST ||
    object.providerPolicyDigest !== providerPolicy.policyDigest ||
    object.requestTemplateDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST ||
    object.manifestDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST ||
    object.goldenFixtureSetDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST ||
    object.requestBodyPinBundleDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE_DIGEST ||
    object.workerPolicyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST ||
    object.currency !== "USD" ||
    object.pricingVersion !==
      "openai.gpt-5.4-mini.au.2026-08-27.v1" ||
    object.costNature !== "CALCULATED_UPPER_BOUND_NOT_INVOICE" ||
    object.authenticity !== "UNATTESTED_TEST_CONTRACT_ONLY" ||
    object.requestBodyPinAuthenticity !== "UNATTESTED_SOURCE_PIN_ONLY" ||
    object.requestBodyPinExecutionAuthority !== "NOT_EXECUTION_AUTHORITY" ||
    object.requestBodyPinDispatchAttestation !== "ABSENT" ||
    object.callsDispatched !== 6 ||
    object.candidatesAccepted !== 6 ||
    object.languageDraftReviewsPassed !== 18 ||
    object.projectedCostMicroUsd !== 120_780
  ) {
    throw invalid("Communication Note preview report binding is invalid");
  }
}

function assertStaticRunnerBindings() {
  if (
    evaluationPlan.evaluationPlanDigest !==
      RUNNER_POLICY_CORE.evaluationPlanDigest ||
    evaluationPlan.providerPolicyDigest !==
      RUNNER_POLICY_CORE.providerPolicyDigest ||
    evaluationPlan.request.requestTemplateDigest !==
      RUNNER_POLICY_CORE.requestTemplateDigest ||
    evaluationPlan.acceptance.manifestDigest !==
      RUNNER_POLICY_CORE.manifestDigest ||
    evaluationPlan.acceptance.goldenFixtureSetDigest !==
      RUNNER_POLICY_CORE.goldenFixtureSetDigest ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .bodyPinBundleDigest !== RUNNER_POLICY_CORE.requestBodyPinBundleDigest ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE.status !==
      RUNNER_POLICY_CORE.requestBodyPin.status ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE.scope !==
      RUNNER_POLICY_CORE.requestBodyPin.scope ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .transportScope !== RUNNER_POLICY_CORE.requestBodyPin.transportScope ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .authenticity !== RUNNER_POLICY_CORE.requestBodyPin.authenticity ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .executionAuthority !==
      RUNNER_POLICY_CORE.requestBodyPin.executionAuthority ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .externalOwnerApproval !==
      RUNNER_POLICY_CORE.requestBodyPin.externalOwnerApproval ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .dispatchAttestation !==
      RUNNER_POLICY_CORE.requestBodyPin.dispatchAttestation ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .sourceBindings.evaluationPlanDigest !==
      RUNNER_POLICY_CORE.evaluationPlanDigest ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .sourceBindings.requestTemplateDigest !==
      RUNNER_POLICY_CORE.requestTemplateDigest ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .sourceBindings.manifestDigest !== RUNNER_POLICY_CORE.manifestDigest ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .sourceBindings.goldenFixtureSetDigest !==
      RUNNER_POLICY_CORE.goldenFixtureSetDigest ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .applicationEnvelope.endpointUrl !== evaluationPlan.request.endpointUrl ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_BUNDLE
      .orderedSlotCount !== RUNNER_POLICY_CORE.execution.maximumCalls ||
    evaluationPlan.budget.maxCalls !==
      RUNNER_POLICY_CORE.execution.maximumCalls ||
    evaluationPlan.budget.maxInputTokensPerCall !==
      RUNNER_POLICY_CORE.preflight.maxInputTokensPerCall ||
    evaluationPlan.budget.maxOutputTokensPerCall !==
      RUNNER_POLICY_CORE.preflight.maxOutputTokensPerCall ||
    evaluationPlan.budget.maxCostMicroUsd !==
      RUNNER_POLICY_CORE.budget.maxCostMicroUsd ||
    evaluationPlan.budget.maxProjectedCostMicroUsdPerCall !==
      RUNNER_POLICY_CORE.preflight.projectedCostMicroUsdPerCall ||
    evaluationPlan.budget.maxProjectedCostMicroUsd !==
      RUNNER_POLICY_CORE.preflight.projectedCostMicroUsd ||
    manifest.slots.length !== RUNNER_POLICY_CORE.execution.maximumCalls ||
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY.providerDeadlineMs !==
      providerPolicy.timeoutMs
  ) {
    throw runnerError("REPORT_INVALID");
  }
}

function projectedCostPerCall() {
  return calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
    inputTokens: RUNNER_POLICY_CORE.preflight.maxInputTokensPerCall,
    cachedInputTokens:
      RUNNER_POLICY_CORE.preflight.reservationCachedInputTokens,
    outputTokens: RUNNER_POLICY_CORE.preflight.maxOutputTokensPerCall,
  });
}

function requireManifestFixture(fixtureId: string) {
  const fixture = CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.find(
    ({ id }) => id === fixtureId,
  );
  if (!fixture) throw runnerError("REPORT_INVALID");
  return fixture;
}

function validateRunInput(value: unknown) {
  const object = requireObject(
    value,
    "Communication Note preview run input is invalid",
  );
  assertExactKeys(
    object,
    ["runId", "signal"],
    () => invalid("Communication Note preview run input is invalid"),
  );
  if (
    typeof object.runId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(object.runId) ||
    !(object.signal instanceof AbortSignal)
  ) {
    throw invalid("Communication Note preview run input is invalid");
  }
  return Object.freeze({
    runId: object.runId,
    signal: object.signal,
  });
}

function runnerTime(
  clock: RunnerClock,
  reason: CaresLinkV1CommunicationNotePreviewRunnerFailureReason,
) {
  try {
    return requireServerTime(
      clock.now(),
      "Communication Note preview clock is invalid",
    );
  } catch {
    throw runnerError(reason);
  }
}

function createRunnerDigest(value: unknown) {
  return canonicalDigest(value);
}

function createReportDigest(value: unknown) {
  return canonicalDigest(value);
}

function canonicalDigest(value: unknown) {
  let canonical: string;
  try {
    canonical = stringifyCaresLinkV1CanonicalJson(value);
  } catch {
    throw invalid("Communication Note preview evidence is not canonical JSON");
  }
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function hashRunId(runId: string) {
  return createHash("sha256")
    .update("careslink.v1.communication-note-preview-run\0", "utf8")
    .update(runId, "utf8")
    .digest("hex");
}

function ceilDivide(value: bigint, denominator: bigint) {
  return (value + denominator - BigInt(1)) / denominator;
}

function requireObject(value: unknown, message: string) {
  if (!isPlainObject(value)) throw invalid(message);
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  errorFactory: () => Error,
) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw errorFactory();
  }
}

function requireSha256(value: unknown, message: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw invalid(message);
  }
  return value;
}

function requireServerTime(value: unknown, message: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw invalid(message);
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, message: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw invalid(message);
  }
  return value as number;
}

function requireNonNegativeSafeInteger(value: unknown, message: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalid(message);
  }
  return value as number;
}

function deepFreeze<const T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function runnerError(
  reason: CaresLinkV1CommunicationNotePreviewRunnerFailureReason,
) {
  return new CaresLinkV1CommunicationNotePreviewRunnerError(reason);
}

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}

function unavailable() {
  return new Error(
    "Communication Note preview evaluation runner is unavailable",
  );
}
