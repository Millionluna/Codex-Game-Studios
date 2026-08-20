import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  parseCaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationWorkerPolicy,
} from "./note-generation-worker-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  getCaresLinkV1Rate,
  type CaresLinkV1JsonObject,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1Rate,
  type CaresLinkV1ServiceCode,
} from "./shared-contracts";

/**
 * Provider-neutral contract evidence only. No provider, model, network adapter,
 * environment fallback or runtime capability is configured by this module.
 */
export const CARESLINK_V1_NOTE_PROVIDER_READY = false as const;

export const CARESLINK_V1_CURRENT_NOTE_PROVIDER_POLICY = undefined as
  | CaresLinkV1NoteProviderPolicySnapshot
  | undefined;

export const CARESLINK_V1_CURRENT_NOTE_PROVIDER_POLICIES = Object.freeze({}) as
  Readonly<Partial<Record<CaresLinkV1NoteTypeCode, CaresLinkV1NoteProviderPolicySnapshot>>>;

export const CARESLINK_V1_NOTE_PROVIDER_FINISH_REASONS = [
  "COMPLETED",
  "OUTPUT_LIMIT",
  "CONTENT_FILTERED",
  "TIMEOUT",
  "CANCELLED",
  "PROVIDER_ERROR",
  "UNKNOWN",
] as const;

export type CaresLinkV1NoteProviderFinishReason =
  (typeof CARESLINK_V1_NOTE_PROVIDER_FINISH_REASONS)[number];

export const CARESLINK_V1_NOTE_PROVIDER_USAGE_SOURCES = [
  "PROVIDER",
  "GATEWAY",
] as const;
export type CaresLinkV1NoteProviderUsageSource =
  (typeof CARESLINK_V1_NOTE_PROVIDER_USAGE_SOURCES)[number];

export const CARESLINK_V1_NOTE_PROVIDER_COST_SOURCES = [
  "PROVIDER",
  "GATEWAY",
  "SERVER_PRICING_CATALOG",
] as const;
export type CaresLinkV1NoteProviderCostSource =
  (typeof CARESLINK_V1_NOTE_PROVIDER_COST_SOURCES)[number];

export type CaresLinkV1NoteProviderPolicyCore = Readonly<{
  noteType: CaresLinkV1NoteTypeCode;
  serviceCode: CaresLinkV1ServiceCode;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  rateCatalogVersion: typeof CARESLINK_V1_RATE_CATALOG_VERSION;
  providerId: string;
  modelId: string;
  /**
   * Exact immutable provider revision when exposed. It may be null only when
   * modelRevisionAvailability is PROVIDER_NOT_EXPOSED; null is never a fallback.
   */
  modelRevision: string | null;
  modelRevisionAvailability: "EXACT" | "PROVIDER_NOT_EXPOSED";
  policyVersion: string;
  promptTemplateVersion: string;
  goldenSetVersion: string;
  parserVersion: string;
  timeoutMs: number;
}>;

export type CaresLinkV1NoteProviderPolicySnapshot =
  CaresLinkV1NoteProviderPolicyCore &
    Readonly<{
      /** SHA-256 of UTF-8 canonical JSON for all policy core fields. */
      policyDigest: string;
    }>;

export type CaresLinkV1NoteProviderUsage =
  | Readonly<{
      status: "UNAVAILABLE";
      source: "UNAVAILABLE";
    }>
  | Readonly<{
      status: "REPORTED";
      source: CaresLinkV1NoteProviderUsageSource;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      cachedInputTokens?: number;
      reasoningTokens?: number;
    }>;

export type CaresLinkV1NoteProviderCost =
  | Readonly<{
      status: "UNAVAILABLE";
      source: "UNAVAILABLE";
    }>
  | Readonly<{
      status: "REPORTED" | "CALCULATED";
      source: CaresLinkV1NoteProviderCostSource;
      currency: string;
      /** Canonical, non-negative decimal string; never a floating-point value. */
      decimalAmount: string;
      pricingVersion: string;
    }>;

declare const providerDeadlineAtBrand: unique symbol;
export type CaresLinkV1NoteProviderDeadlineAt = string &
  Readonly<{ [providerDeadlineAtBrand]: true }>;

export type CaresLinkV1NoteProviderWorkerPolicyBinding = Readonly<{
  providerPolicyDigest: string;
  workerPolicyDigest: string;
  /** Worker policy is the single runtime authority for this duration. */
  providerDeadlineMs: number;
  startedAt: string;
  deadlineAt: CaresLinkV1NoteProviderDeadlineAt;
}>;

/** Server-private and content-free. Never serialize into an owner-facing ACK. */
export type CaresLinkV1NoteProviderAttemptEvidence = Readonly<{
  policyDigest: string;
  providerId: string;
  modelId: string;
  modelRevision: string | null;
  modelRevisionAvailability: "EXACT" | "PROVIDER_NOT_EXPOSED";
  policyVersion: string;
  promptTemplateVersion: string;
  goldenSetVersion: string;
  parserVersion: string;
  serviceCode: CaresLinkV1ServiceCode;
  rateCatalogVersion: typeof CARESLINK_V1_RATE_CATALOG_VERSION;
  timeoutMs: number;
  workerPolicyDigest: string;
  deadlineAt: CaresLinkV1NoteProviderDeadlineAt;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  finishReason: CaresLinkV1NoteProviderFinishReason;
  /** Hash only. The raw provider request ID must not be persisted. */
  providerRequestIdHash: string | null;
  usage: CaresLinkV1NoteProviderUsage;
  cost: CaresLinkV1NoteProviderCost;
  /** Digest of provider candidate JSON, never the candidate itself. */
  candidateDigest: string;
}>;

export type CaresLinkV1NoteProviderPort = Readonly<{
  generate(input: Readonly<{
    /** Opaque worker-private correlation; adapters must not send it upstream. */
    workerPrivateCorrelation: string;
    noteType: CaresLinkV1NoteTypeCode;
    sourceLocale: CaresLinkV1Locale;
    contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    /** Ephemeral, privacy-authorized payload; never generation job metadata. */
    cleanedFacts: CaresLinkV1JsonObject;
    /** Exact approved provider/worker policy pair and server-owned deadline. */
    workerPolicyBinding: CaresLinkV1NoteProviderWorkerPolicyBinding;
    /** Full approved policy used to verify the binding digest at runtime. */
    workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
    signal: AbortSignal;
    policySnapshot: CaresLinkV1NoteProviderPolicySnapshot;
  }>): Promise<Readonly<{
    /** Untrusted until the shared canonical output validator accepts it. */
    candidate: unknown;
    evidence: CaresLinkV1NoteProviderAttemptEvidence;
  }>>;
}>;

const POLICY_CORE_KEYS = [
  "noteType",
  "serviceCode",
  "contractVersion",
  "schemaVersion",
  "rateCatalogVersion",
  "providerId",
  "modelId",
  "modelRevision",
  "modelRevisionAvailability",
  "policyVersion",
  "promptTemplateVersion",
  "goldenSetVersion",
  "parserVersion",
  "timeoutMs",
] as const;

const POLICY_SNAPSHOT_KEYS = [...POLICY_CORE_KEYS, "policyDigest"] as const;

const WORKER_POLICY_BINDING_KEYS = [
  "providerPolicyDigest",
  "workerPolicyDigest",
  "providerDeadlineMs",
  "startedAt",
  "deadlineAt",
] as const;

const EVIDENCE_KEYS = [
  "policyDigest",
  "providerId",
  "modelId",
  "modelRevision",
  "modelRevisionAvailability",
  "policyVersion",
  "promptTemplateVersion",
  "goldenSetVersion",
  "parserVersion",
  "serviceCode",
  "rateCatalogVersion",
  "timeoutMs",
  "workerPolicyDigest",
  "deadlineAt",
  "startedAt",
  "finishedAt",
  "durationMs",
  "finishReason",
  "providerRequestIdHash",
  "usage",
  "cost",
  "candidateDigest",
] as const;

const REPORTED_USAGE_KEYS = [
  "status",
  "source",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedInputTokens",
  "reasoningTokens",
] as const;

const UNAVAILABLE_KEYS = ["status", "source"] as const;
const AVAILABLE_COST_KEYS = [
  "status",
  "source",
  "currency",
  "decimalAmount",
  "pricingVersion",
] as const;

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;
const CANONICAL_SERVER_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TOKEN_COUNT_KEYS = [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedInputTokens",
  "reasoningTokens",
] as const;
const SAFE_SENSITIVE_METADATA_KEYS = new Set<string>([
  ...TOKEN_COUNT_KEYS,
  "promptTemplateVersion",
]);
const FORBIDDEN_EVIDENCE_KEY =
  /(prompt|facts|output|error|token|owner|session|proof|key)/i;

export function createCaresLinkV1NoteProviderPolicySnapshot(
  value: unknown,
): CaresLinkV1NoteProviderPolicySnapshot {
  const core = validatePolicyCore(value);
  return Object.freeze({
    ...core,
    policyDigest: canonicalDigest(core, "Provider policy is not canonical JSON"),
  });
}

export function validateCaresLinkV1NoteProviderPolicySnapshot(
  value: unknown,
): CaresLinkV1NoteProviderPolicySnapshot {
  const object = requireObject(value, "Provider policy snapshot must be an object");
  assertExactKeys(object, POLICY_SNAPSHOT_KEYS, "Provider policy snapshot shape is invalid");
  const core = validatePolicyCore(project(object, POLICY_CORE_KEYS));
  const policyDigest = requireSha256(
    object.policyDigest,
    "Provider policy digest is invalid",
  );
  if (canonicalDigest(core, "Provider policy is not canonical JSON") !== policyDigest) {
    throw invalid("Provider policy digest does not match the snapshot");
  }
  return Object.freeze({ ...core, policyDigest });
}

/**
 * Resolves the approved shadow Points rate by catalog identity only. Provider
 * usage and monetary cost are deliberately absent and cannot alter the quote.
 */
export function getCaresLinkV1NoteProviderPointRate(
  value: unknown,
): CaresLinkV1Rate {
  const policy = validateCaresLinkV1NoteProviderPolicySnapshot(value);
  return getCaresLinkV1Rate(policy.serviceCode);
}

/**
 * Binds provider configuration to the already-approved worker deadline. The
 * worker policy is authoritative; a duplicate provider timeout may only attest
 * exact equality and can never override it.
 */
export function createCaresLinkV1NoteProviderWorkerPolicyBinding(input: Readonly<{
  policySnapshot: CaresLinkV1NoteProviderPolicySnapshot;
  workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  startedAt: string;
}>): CaresLinkV1NoteProviderWorkerPolicyBinding {
  const policy = validateCaresLinkV1NoteProviderPolicySnapshot(
    input.policySnapshot,
  );
  const workerPolicy = parseCaresLinkV1NoteGenerationWorkerPolicy(
    input.workerPolicy,
  );
  if (workerPolicy.status !== "APPROVED") {
    throw invalid("Provider execution requires an approved worker policy");
  }
  if (policy.timeoutMs !== workerPolicy.providerDeadlineMs) {
    throw invalid("Provider timeout does not match the worker deadline");
  }
  const startedAt = requireServerTime(
    input.startedAt,
    "Provider start time is invalid",
  );
  const deadlineMs = Date.parse(startedAt) + workerPolicy.providerDeadlineMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw invalid("Provider deadline is outside the supported time range");
  }
  let deadlineAt: string;
  try {
    deadlineAt = new Date(deadlineMs).toISOString();
  } catch {
    throw invalid("Provider deadline is outside the supported time range");
  }
  return Object.freeze({
    providerPolicyDigest: policy.policyDigest,
    workerPolicyDigest: workerPolicy.digest,
    providerDeadlineMs: workerPolicy.providerDeadlineMs,
    startedAt,
    deadlineAt: deadlineAt as CaresLinkV1NoteProviderDeadlineAt,
  });
}

export function validateCaresLinkV1NoteProviderWorkerPolicyBinding(
  value: unknown,
  policySnapshot: CaresLinkV1NoteProviderPolicySnapshot,
  workerPolicySnapshot: CaresLinkV1NoteGenerationWorkerPolicy,
): CaresLinkV1NoteProviderWorkerPolicyBinding {
  const object = requireObject(
    value,
    "Provider worker-policy binding must be an object",
  );
  assertExactKeys(
    object,
    WORKER_POLICY_BINDING_KEYS,
    "Provider worker-policy binding shape is invalid",
  );
  const policy = validateCaresLinkV1NoteProviderPolicySnapshot(policySnapshot);
  const workerPolicy = parseCaresLinkV1NoteGenerationWorkerPolicy(
    workerPolicySnapshot,
  );
  if (workerPolicy.status !== "APPROVED") {
    throw invalid("Provider execution requires an approved worker policy");
  }
  const providerPolicyDigest = requireSha256(
    object.providerPolicyDigest,
    "Provider policy binding digest is invalid",
  );
  const workerPolicyDigest = requireSha256(
    object.workerPolicyDigest,
    "Worker policy binding digest is invalid",
  );
  const providerDeadlineMs = requirePositiveSafeInteger(
    object.providerDeadlineMs,
    "Provider deadline duration is invalid",
  );
  const startedAt = requireServerTime(
    object.startedAt,
    "Provider start time is invalid",
  );
  const deadlineAt = requireServerTime(
    object.deadlineAt,
    "Provider deadline is invalid",
  );
  if (
    providerPolicyDigest !== policy.policyDigest ||
    workerPolicyDigest !== workerPolicy.digest ||
    providerDeadlineMs !== policy.timeoutMs ||
    providerDeadlineMs !== workerPolicy.providerDeadlineMs ||
    Date.parse(deadlineAt) - Date.parse(startedAt) !== providerDeadlineMs
  ) {
    throw invalid("Provider worker-policy binding does not match the policy");
  }
  return Object.freeze({
    providerPolicyDigest,
    workerPolicyDigest,
    providerDeadlineMs,
    startedAt,
    deadlineAt: deadlineAt as CaresLinkV1NoteProviderDeadlineAt,
  });
}

export function createCaresLinkV1NoteProviderCandidateDigest(
  candidate: unknown,
): string {
  return canonicalDigest(candidate, "Provider candidate is not canonical JSON");
}

export function createCaresLinkV1NoteProviderAttemptEvidence(input: Readonly<{
  policySnapshot: CaresLinkV1NoteProviderPolicySnapshot;
  workerPolicyBinding: CaresLinkV1NoteProviderWorkerPolicyBinding;
  workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  candidate: unknown;
  finishedAt: string;
  finishReason: CaresLinkV1NoteProviderFinishReason;
  providerRequestId?: string;
  usage: unknown;
  cost: unknown;
}>): CaresLinkV1NoteProviderAttemptEvidence {
  const policy = validateCaresLinkV1NoteProviderPolicySnapshot(
    input.policySnapshot,
  );
  const workerBinding = validateCaresLinkV1NoteProviderWorkerPolicyBinding(
    input.workerPolicyBinding,
    policy,
    input.workerPolicy,
  );
  const startedAt = workerBinding.startedAt;
  const finishedAt = requireServerTime(
    input.finishedAt,
    "Provider finish time is invalid",
  );
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  if (finishedMs < startedMs) {
    throw invalid("Provider finish time cannot precede start time");
  }
  if (finishedMs - startedMs > policy.timeoutMs) {
    throw invalid("Provider duration exceeds the approved timeout");
  }
  if (!CARESLINK_V1_NOTE_PROVIDER_FINISH_REASONS.includes(input.finishReason)) {
    throw invalid("Provider finish reason is invalid");
  }

  const providerRequestIdHash =
    input.providerRequestId === undefined
      ? null
      : hashProviderRequestId(input.providerRequestId);

  return Object.freeze({
    policyDigest: policy.policyDigest,
    providerId: policy.providerId,
    modelId: policy.modelId,
    modelRevision: policy.modelRevision,
    modelRevisionAvailability: policy.modelRevisionAvailability,
    policyVersion: policy.policyVersion,
    promptTemplateVersion: policy.promptTemplateVersion,
    goldenSetVersion: policy.goldenSetVersion,
    parserVersion: policy.parserVersion,
    serviceCode: policy.serviceCode,
    rateCatalogVersion: policy.rateCatalogVersion,
    timeoutMs: policy.timeoutMs,
    workerPolicyDigest: workerBinding.workerPolicyDigest,
    deadlineAt: workerBinding.deadlineAt,
    startedAt,
    finishedAt,
    durationMs: finishedMs - startedMs,
    finishReason: input.finishReason,
    providerRequestIdHash,
    usage: validateUsage(input.usage),
    cost: validateCost(input.cost),
    candidateDigest: createCaresLinkV1NoteProviderCandidateDigest(
      input.candidate,
    ),
  });
}

export function validateCaresLinkV1NoteProviderAttemptEvidence(
  value: unknown,
  binding: Readonly<{
    policySnapshot: CaresLinkV1NoteProviderPolicySnapshot;
    workerPolicyBinding: CaresLinkV1NoteProviderWorkerPolicyBinding;
    workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
    candidate: unknown;
  }>,
): CaresLinkV1NoteProviderAttemptEvidence {
  assertNoSensitiveEvidenceKeys(value);
  const object = requireObject(value, "Provider attempt evidence must be an object");
  assertExactKeys(object, EVIDENCE_KEYS, "Provider attempt evidence shape is invalid");
  const policy = validateCaresLinkV1NoteProviderPolicySnapshot(
    binding.policySnapshot,
  );
  const workerBinding = validateCaresLinkV1NoteProviderWorkerPolicyBinding(
    binding.workerPolicyBinding,
    policy,
    binding.workerPolicy,
  );
  const startedAt = requireServerTime(object.startedAt, "Provider start time is invalid");
  const finishedAt = requireServerTime(
    object.finishedAt,
    "Provider finish time is invalid",
  );
  const durationMs = requireNonNegativeSafeInteger(
    object.durationMs,
    "Provider duration is invalid",
  );
  if (Date.parse(finishedAt) - Date.parse(startedAt) !== durationMs) {
    throw invalid("Provider duration does not match timestamps");
  }
  if (durationMs > policy.timeoutMs) {
    throw invalid("Provider duration exceeds the approved timeout");
  }
  if (
    typeof object.finishReason !== "string" ||
    !CARESLINK_V1_NOTE_PROVIDER_FINISH_REASONS.includes(
      object.finishReason as CaresLinkV1NoteProviderFinishReason,
    )
  ) {
    throw invalid("Provider finish reason is invalid");
  }
  const providerRequestIdHash =
    object.providerRequestIdHash === null
      ? null
      : requireSha256(
          object.providerRequestIdHash,
          "Provider request ID hash is invalid",
        );
  const candidateDigest = requireSha256(
    object.candidateDigest,
    "Provider candidate digest is invalid",
  );
  if (
    candidateDigest !==
    createCaresLinkV1NoteProviderCandidateDigest(binding.candidate)
  ) {
    throw invalid("Provider candidate digest does not match the candidate");
  }
  if (
    object.policyDigest !== policy.policyDigest ||
    object.providerId !== policy.providerId ||
    object.modelId !== policy.modelId ||
    object.modelRevision !== policy.modelRevision ||
    object.modelRevisionAvailability !== policy.modelRevisionAvailability ||
    object.policyVersion !== policy.policyVersion ||
    object.promptTemplateVersion !== policy.promptTemplateVersion ||
    object.goldenSetVersion !== policy.goldenSetVersion ||
    object.parserVersion !== policy.parserVersion ||
    object.serviceCode !== policy.serviceCode ||
    object.rateCatalogVersion !== policy.rateCatalogVersion ||
    object.timeoutMs !== policy.timeoutMs ||
    object.workerPolicyDigest !== workerBinding.workerPolicyDigest ||
    object.deadlineAt !== workerBinding.deadlineAt ||
    startedAt !== workerBinding.startedAt
  ) {
    throw invalid("Provider evidence does not match the policy snapshot");
  }

  return Object.freeze({
    policyDigest: policy.policyDigest,
    providerId: policy.providerId,
    modelId: policy.modelId,
    modelRevision: policy.modelRevision,
    modelRevisionAvailability: policy.modelRevisionAvailability,
    policyVersion: policy.policyVersion,
    promptTemplateVersion: policy.promptTemplateVersion,
    goldenSetVersion: policy.goldenSetVersion,
    parserVersion: policy.parserVersion,
    serviceCode: policy.serviceCode,
    rateCatalogVersion: policy.rateCatalogVersion,
    timeoutMs: policy.timeoutMs,
    workerPolicyDigest: workerBinding.workerPolicyDigest,
    deadlineAt: workerBinding.deadlineAt,
    startedAt,
    finishedAt,
    durationMs,
    finishReason: object.finishReason as CaresLinkV1NoteProviderFinishReason,
    providerRequestIdHash,
    usage: validateUsage(object.usage),
    cost: validateCost(object.cost),
    candidateDigest,
  });
}

function validatePolicyCore(value: unknown): CaresLinkV1NoteProviderPolicyCore {
  const object = requireObject(value, "Provider policy must be an object");
  assertExactKeys(object, POLICY_CORE_KEYS, "Provider policy shape is invalid");
  if (
    typeof object.noteType !== "string" ||
    !CARESLINK_V1_NOTE_TYPE_CODES.includes(
      object.noteType as CaresLinkV1NoteTypeCode,
    )
  ) {
    throw invalid("Provider policy Note type is invalid");
  }
  const noteType = object.noteType as CaresLinkV1NoteTypeCode;
  const definition = getCaresLinkV1NoteType(noteType);
  if (object.serviceCode !== definition.generationServiceCode) {
    throw invalid("Provider policy service code does not match the Note type");
  }
  if (
    object.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
    object.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION ||
    object.rateCatalogVersion !== CARESLINK_V1_RATE_CATALOG_VERSION
  ) {
    throw invalid("Provider policy version binding is invalid");
  }
  const providerId = requireIdentifier(object.providerId, "Provider ID is invalid");
  const modelId = requireIdentifier(object.modelId, "Model ID is invalid");
  const modelRevisionAvailability = object.modelRevisionAvailability;
  let modelRevision: string | null;
  if (modelRevisionAvailability === "EXACT") {
    modelRevision = requireIdentifier(
      object.modelRevision,
      "Exact model revision is required",
    );
  } else if (modelRevisionAvailability === "PROVIDER_NOT_EXPOSED") {
    if (object.modelRevision !== null) {
      throw invalid("Model revision must be null when the provider does not expose it");
    }
    modelRevision = null;
  } else {
    throw invalid("Model revision availability is invalid");
  }
  const timeoutMs = requirePositiveSafeInteger(
    object.timeoutMs,
    "Provider timeout is invalid",
  );

  return Object.freeze({
    noteType,
    serviceCode: definition.generationServiceCode,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    rateCatalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    providerId,
    modelId,
    modelRevision,
    modelRevisionAvailability,
    policyVersion: requireIdentifier(
      object.policyVersion,
      "Provider policy version is invalid",
    ),
    promptTemplateVersion: requireIdentifier(
      object.promptTemplateVersion,
      "Prompt template version is invalid",
    ),
    goldenSetVersion: requireIdentifier(
      object.goldenSetVersion,
      "Golden set version is invalid",
    ),
    parserVersion: requireIdentifier(
      object.parserVersion,
      "Parser version is invalid",
    ),
    timeoutMs,
  });
}

function validateUsage(value: unknown): CaresLinkV1NoteProviderUsage {
  const object = requireObject(value, "Provider usage must be an object");
  if (object.status === "UNAVAILABLE") {
    assertExactKeys(object, UNAVAILABLE_KEYS, "Unavailable usage shape is invalid");
    if (object.source !== "UNAVAILABLE") {
      throw invalid("Unavailable usage source is invalid");
    }
    return Object.freeze({ status: "UNAVAILABLE", source: "UNAVAILABLE" });
  }
  if (object.status !== "REPORTED") {
    throw invalid("Provider usage status is invalid");
  }
  assertAllowedKeys(object, REPORTED_USAGE_KEYS, "Reported usage shape is invalid");
  if (
    typeof object.source !== "string" ||
    !CARESLINK_V1_NOTE_PROVIDER_USAGE_SOURCES.includes(
      object.source as CaresLinkV1NoteProviderUsageSource,
    )
  ) {
    throw invalid("Reported usage source is invalid");
  }

  const counts: Partial<Record<(typeof TOKEN_COUNT_KEYS)[number], number>> = {};
  for (const key of TOKEN_COUNT_KEYS) {
    if (Object.hasOwn(object, key)) {
      counts[key] = requireNonNegativeSafeInteger(
        object[key],
        "Provider token count is invalid",
      );
    }
  }
  if (Object.keys(counts).length === 0) {
    throw invalid("Reported usage must contain at least one token count");
  }
  if (
    counts.totalTokens !== undefined &&
    ((counts.inputTokens !== undefined &&
      counts.totalTokens < counts.inputTokens) ||
      (counts.outputTokens !== undefined &&
        counts.totalTokens < counts.outputTokens) ||
      (counts.inputTokens !== undefined &&
        counts.outputTokens !== undefined &&
        counts.totalTokens < counts.inputTokens + counts.outputTokens))
  ) {
    throw invalid("Reported total token count is inconsistent");
  }

  return Object.freeze({
    status: "REPORTED",
    source: object.source as CaresLinkV1NoteProviderUsageSource,
    ...counts,
  });
}

function validateCost(value: unknown): CaresLinkV1NoteProviderCost {
  const object = requireObject(value, "Provider cost must be an object");
  if (object.status === "UNAVAILABLE") {
    assertExactKeys(object, UNAVAILABLE_KEYS, "Unavailable cost shape is invalid");
    if (object.source !== "UNAVAILABLE") {
      throw invalid("Unavailable cost source is invalid");
    }
    return Object.freeze({ status: "UNAVAILABLE", source: "UNAVAILABLE" });
  }
  if (object.status !== "REPORTED" && object.status !== "CALCULATED") {
    throw invalid("Provider cost status is invalid");
  }
  assertExactKeys(object, AVAILABLE_COST_KEYS, "Available cost shape is invalid");
  if (
    typeof object.source !== "string" ||
    !CARESLINK_V1_NOTE_PROVIDER_COST_SOURCES.includes(
      object.source as CaresLinkV1NoteProviderCostSource,
    ) ||
    (object.status === "CALCULATED" &&
      object.source !== "SERVER_PRICING_CATALOG") ||
    (object.status === "REPORTED" &&
      object.source === "SERVER_PRICING_CATALOG")
  ) {
    throw invalid("Provider cost source is invalid");
  }
  if (typeof object.currency !== "string" || !/^[A-Z]{3}$/.test(object.currency)) {
    throw invalid("Provider cost currency is invalid");
  }
  if (
    typeof object.decimalAmount !== "string" ||
    object.decimalAmount.length > 64 ||
    !CANONICAL_DECIMAL.test(object.decimalAmount)
  ) {
    throw invalid("Provider cost decimal amount is invalid");
  }

  return Object.freeze({
    status: object.status,
    source: object.source as CaresLinkV1NoteProviderCostSource,
    currency: object.currency,
    decimalAmount: object.decimalAmount,
    pricingVersion: requireIdentifier(
      object.pricingVersion,
      "Provider pricing version is invalid",
    ),
  });
}

function hashProviderRequestId(value: unknown) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.length > 512
  ) {
    throw invalid("Provider request ID is invalid");
  }
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalDigest(value: unknown, message: string) {
  try {
    return createHash("sha256")
      .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
      .digest("hex");
  } catch {
    throw invalid(message);
  }
}

function assertNoSensitiveEvidenceKeys(value: unknown) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) assertNoSensitiveEvidenceKeys(entry);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      FORBIDDEN_EVIDENCE_KEY.test(key) &&
      !SAFE_SENSITIVE_METADATA_KEYS.has(key)
    ) {
      throw invalid("Provider attempt evidence contains a forbidden field");
    }
    assertNoSensitiveEvidenceKeys(child);
  }
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid(message);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  object: Record<string, unknown>,
  expected: readonly string[],
  message: string,
) {
  const keys = Object.keys(object);
  if (
    keys.length !== expected.length ||
    expected.some((key) => !Object.hasOwn(object, key))
  ) {
    throw invalid(message);
  }
}

function assertAllowedKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  message: string,
) {
  if (Object.keys(object).some((key) => !allowed.includes(key))) {
    throw invalid(message);
  }
}

function project(
  object: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}

function requireIdentifier(value: unknown, message: string) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    throw invalid(message);
  }
  return value;
}

function requireSha256(value: unknown, message: string) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw invalid(message);
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, message: string) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
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

function requireServerTime(value: unknown, message: string) {
  if (
    typeof value !== "string" ||
    !CANONICAL_SERVER_TIME.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw invalid(message);
  }
  return value;
}

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}
