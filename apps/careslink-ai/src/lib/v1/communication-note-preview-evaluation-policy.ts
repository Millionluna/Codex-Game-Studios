import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PROMPT_TEMPLATE_VERSION,
  CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_EVALUATION_MODEL_ID,
  CARESLINK_V1_OPENAI_RESPONSES_PROVIDER_ID,
  createCaresLinkV1CommunicationNoteProviderPolicyCandidate,
} from "./communication-note-provider-policy";
import { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES } from "./communication-note-golden";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_VERSION,
} from "./communication-note-openai-request-template";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST_PIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_VERSION,
} from "./communication-note-preview-evaluation-manifest";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_POLICY_VERSION =
  "evaluation.communication.openai.synthetic-preview.2026-08-27.m1f.v2" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY =
  false as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION =
  undefined as CaresLinkV1CommunicationNotePreviewEvaluationPlan | undefined;

export const CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_ENDPOINT_PROFILE =
  "OPENAI_AU_STORAGE_RESPONSES_V1" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_RESPONSES_URL =
  "https://au.api.openai.com/v1/responses" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_REASONING_EFFORT =
  "none" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_MAX_OUTPUT_TOKENS = 2_400 as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVAL_REQUIREMENTS =
  deepFreeze([
    "OWNER_PAID_PREVIEW_APPROVAL",
    "OPENAI_PROJECT_ZDR_ATTESTATION",
    "OPENAI_AU_PROJECT_DATA_RESIDENCY_ATTESTATION",
    "OPENAI_AU_STORAGE_ONLY_PROCESSING_LIMIT_ACKNOWLEDGEMENT",
    "OPENAI_MODIFIED_RETENTION_AMENDMENT_ATTESTATION",
    "TEMPORARY_KEY_AND_TEARDOWN_PLAN",
    "PRICING_RECONFIRMATION",
    "APPROVED_RUNNER_BUDGET_AND_REPORT_BINDING",
  ] as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_CRITICAL_EVALUATION_CHECKS =
  deepFreeze([
    "STRICT_SCHEMA",
    "SHARED_OUTPUT_PRIVACY",
    "DATE_TIME_PARITY",
    "NUMERIC_PARITY",
    "DECISION_LANGUAGE",
    "REFUSAL_ABSENT",
    "HUMAN_SEMANTIC_GROUNDEDNESS",
  ] as const);

type EvaluationPlanCore = Readonly<{
  policyVersion: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_POLICY_VERSION;
  status: "FROZEN_AWAITING_EXPLICIT_PAID_PREVIEW_APPROVAL";
  capability: "DISPOSABLE_SYNTHETIC_DEIDENTIFIED_PREVIEW_ONLY";
  providerPolicyDigest: string;
  providerId: typeof CARESLINK_V1_OPENAI_RESPONSES_PROVIDER_ID;
  model: Readonly<{
    id: typeof CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_EVALUATION_MODEL_ID;
    revision: null;
    revisionAvailability: "PROVIDER_NOT_EXPOSED";
    selectionBasis: "IMMUTABLE_MODEL_ID_SNAPSHOT";
    fallbackModel: null;
  }>;
  request: Readonly<{
    endpointProfile: typeof CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_ENDPOINT_PROFILE;
    endpointUrl: typeof CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_RESPONSES_URL;
    api: "RESPONSES_V1";
    serviceTier: "default";
    reasoningEffort: typeof CARESLINK_V1_COMMUNICATION_NOTE_REASONING_EFFORT;
    store: false;
    background: false;
    toolsEnabled: false;
    automaticRetry: false;
    maxOutputTokens: typeof CARESLINK_V1_COMMUNICATION_NOTE_MAX_OUTPUT_TOKENS;
    requestTemplateVersion: typeof CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_VERSION;
    requestTemplateDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST;
  }>;
  dataHandling: Readonly<{
    dataset: "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY";
    realCareDataAllowed: false;
    projectRegion: "AUSTRALIA";
    projectRegionVerification: "NOT_ATTESTED";
    regionalStorage: "SUPPORTED";
    regionalProcessing: "NOT_SUPPORTED";
    structuredOutputSchemaResidency: "NOT_COVERED_SYSTEM_DATA";
    structuredOutputSchemaCustomerDataAllowed: false;
    requiredRetentionControl: "ZERO_DATA_RETENTION";
    retentionControlVerification: "NOT_ATTESTED";
    modifiedRetentionAmendmentVerification: "NOT_ATTESTED";
    outOfRegionProcessingAcknowledgement: "REQUIRED";
  }>;
  budget: Readonly<{
    currency: "USD";
    pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1";
    maxCalls: 6;
    maxInputTokensPerCall: 10_000;
    inputTokenPreflight: "REQUIRED";
    maxOutputTokensPerCall: 2_400;
    maxCostMicroUsd: 250_000;
    maxProjectedCostMicroUsdPerCall: 20_130;
    maxProjectedCostMicroUsd: 120_780;
    reservationCachedInputTokens: 0;
    baseInputMicroUsdPerMillionTokens: 750_000;
    baseCachedInputMicroUsdPerMillionTokens: 75_000;
    baseOutputMicroUsdPerMillionTokens: 4_500_000;
    regionalResidencyUpliftBasisPoints: 1_000;
    pricingReviewedOn: "2026-08-27";
    calculation: "BIGINT_CEILING_MICRO_USD";
    enforcement: "SOURCE_RUNNER_CONTRACT_IMPLEMENTED_NOT_APPROVED";
  }>;
  acceptance: Readonly<{
    goldenSetVersion: typeof CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION;
    promptTemplateVersion: typeof CARESLINK_V1_COMMUNICATION_NOTE_PROMPT_TEMPLATE_VERSION;
    fixtureIds: readonly string[];
    goldenFixtureSetDigest: string;
    manifestVersion: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_VERSION;
    manifestDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST;
    runsPerFixture: 2;
    requiredCandidateCount: 6;
    requiredLanguageDraftReviewCount: 18;
    everyCriticalCheckMustPassForEveryCandidate: true;
    criticalChecks: typeof CARESLINK_V1_COMMUNICATION_NOTE_CRITICAL_EVALUATION_CHECKS;
    contentFreeEvidenceOnly: true;
    executionReportBinding: "SOURCE_RUNNER_CONTRACT_IMPLEMENTED_NOT_APPROVED";
  }>;
  approvalRequirements: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVAL_REQUIREMENTS;
}>;

export type CaresLinkV1CommunicationNotePreviewEvaluationPlan =
  EvaluationPlanCore &
    Readonly<{
      /** SHA-256 of UTF-8 canonical JSON for all evaluation-plan core fields. */
      evaluationPlanDigest: string;
    }>;

const providerPolicy =
  createCaresLinkV1CommunicationNoteProviderPolicyCandidate();

const computedGoldenFixtureSetDigest =
  createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest(
    CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES,
  );

export const CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST =
  "432cfda8c51e76ec517a4c4d39769c3c3a67d7a273ebe3b1662d3e4826449e17" as const;

if (
  computedGoldenFixtureSetDigest !==
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST
) {
  throw invalid(
    "Communication Note golden fixtures changed without a reviewed digest pin",
  );
}

if (
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST !==
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST_PIN
) {
  throw invalid("Communication Note golden fixture digest pins disagree");
}

const PLAN_CORE: EvaluationPlanCore = deepFreeze({
  policyVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_POLICY_VERSION,
  status: "FROZEN_AWAITING_EXPLICIT_PAID_PREVIEW_APPROVAL",
  capability: "DISPOSABLE_SYNTHETIC_DEIDENTIFIED_PREVIEW_ONLY",
  providerPolicyDigest: providerPolicy.policyDigest,
  providerId: CARESLINK_V1_OPENAI_RESPONSES_PROVIDER_ID,
  model: {
    id: CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_EVALUATION_MODEL_ID,
    revision: null,
    revisionAvailability: "PROVIDER_NOT_EXPOSED",
    selectionBasis: "IMMUTABLE_MODEL_ID_SNAPSHOT",
    fallbackModel: null,
  },
  request: {
    endpointProfile:
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_ENDPOINT_PROFILE,
    endpointUrl: CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_RESPONSES_URL,
    api: "RESPONSES_V1",
    serviceTier: "default",
    reasoningEffort: CARESLINK_V1_COMMUNICATION_NOTE_REASONING_EFFORT,
    store: false,
    background: false,
    toolsEnabled: false,
    automaticRetry: false,
    maxOutputTokens: CARESLINK_V1_COMMUNICATION_NOTE_MAX_OUTPUT_TOKENS,
    requestTemplateVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_VERSION,
    requestTemplateDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST,
  },
  dataHandling: {
    dataset: "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY",
    realCareDataAllowed: false,
    projectRegion: "AUSTRALIA",
    projectRegionVerification: "NOT_ATTESTED",
    regionalStorage: "SUPPORTED",
    regionalProcessing: "NOT_SUPPORTED",
    structuredOutputSchemaResidency: "NOT_COVERED_SYSTEM_DATA",
    structuredOutputSchemaCustomerDataAllowed: false,
    requiredRetentionControl: "ZERO_DATA_RETENTION",
    retentionControlVerification: "NOT_ATTESTED",
    modifiedRetentionAmendmentVerification: "NOT_ATTESTED",
    outOfRegionProcessingAcknowledgement: "REQUIRED",
  },
  budget: {
    currency: "USD",
    pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1",
    maxCalls: 6,
    maxInputTokensPerCall: 10_000,
    inputTokenPreflight: "REQUIRED",
    maxOutputTokensPerCall: 2_400,
    maxCostMicroUsd: 250_000,
    maxProjectedCostMicroUsdPerCall: 20_130,
    maxProjectedCostMicroUsd: 120_780,
    reservationCachedInputTokens: 0,
    baseInputMicroUsdPerMillionTokens: 750_000,
    baseCachedInputMicroUsdPerMillionTokens: 75_000,
    baseOutputMicroUsdPerMillionTokens: 4_500_000,
    regionalResidencyUpliftBasisPoints: 1_000,
    pricingReviewedOn: "2026-08-27",
    calculation: "BIGINT_CEILING_MICRO_USD",
    enforcement: "SOURCE_RUNNER_CONTRACT_IMPLEMENTED_NOT_APPROVED",
  },
  acceptance: {
    goldenSetVersion: CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION,
    promptTemplateVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PROMPT_TEMPLATE_VERSION,
    fixtureIds: CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.map(
      ({ id }) => id,
    ),
    goldenFixtureSetDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST,
    manifestVersion: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_VERSION,
    manifestDigest: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
    runsPerFixture: 2,
    requiredCandidateCount: 6,
    requiredLanguageDraftReviewCount: 18,
    everyCriticalCheckMustPassForEveryCandidate: true,
    criticalChecks:
      CARESLINK_V1_COMMUNICATION_NOTE_CRITICAL_EVALUATION_CHECKS,
    contentFreeEvidenceOnly: true,
    executionReportBinding:
      "SOURCE_RUNNER_CONTRACT_IMPLEMENTED_NOT_APPROVED",
  },
  approvalRequirements:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVAL_REQUIREMENTS,
});

const computedEvaluationPlanDigest =
  createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest(PLAN_CORE);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST =
  "b89b03ba248bb4c615470a82c7c4ca6220cc009839f9d9c7dd6aaf772fee9dcd" as const;

if (
  computedEvaluationPlanDigest !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST
) {
  throw invalid(
    "Communication Note evaluation plan changed without a reviewed digest pin",
  );
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN =
  deepFreeze({
    ...PLAN_CORE,
    evaluationPlanDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST,
  }) satisfies CaresLinkV1CommunicationNotePreviewEvaluationPlan;

export function createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest(
  value: unknown,
) {
  let canonical: string;
  try {
    canonical = stringifyCaresLinkV1CanonicalJson(value);
  } catch {
    throw invalid("Communication Note evaluation plan is not canonical JSON");
  }
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Accepts only the one source-frozen M1f plan. A caller cannot substitute a
 * model alias, endpoint, data posture, budget, fixture set or threshold.
 */
export function validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewEvaluationPlan {
  let actual: string;
  let expected: string;
  try {
    actual = stringifyCaresLinkV1CanonicalJson(value);
    expected = stringifyCaresLinkV1CanonicalJson(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
    );
  } catch {
    throw invalid("Communication Note evaluation plan is invalid");
  }
  if (actual !== expected) {
    throw invalid("Communication Note evaluation plan does not match M1f");
  }
  return CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN;
}

/** Closed endpoint profile: arbitrary URLs and environment overrides cannot enter. */
export function resolveCaresLinkV1CommunicationNoteOpenAiResponsesUrl(
  endpointProfile: unknown,
) {
  if (
    endpointProfile !==
    CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_ENDPOINT_PROFILE
  ) {
    throw invalid("Communication Note OpenAI endpoint profile is unavailable");
  }
  return CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_RESPONSES_URL;
}

function deepFreeze<const T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}
