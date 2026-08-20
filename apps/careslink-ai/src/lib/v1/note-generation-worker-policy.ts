import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CaresLinkV1ContractError } from "./shared-contracts";

/**
 * Source-only policy schema. No approved runtime values, worker, route,
 * repository or database adapter are configured by this module.
 */
export const CARESLINK_V1_NOTE_GENERATION_WORKER_POLICY_READY = false as const;

export const CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES = [
  "LEASE_EXPIRED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_TRANSIENT",
] as const;

export type CaresLinkV1NoteGenerationRetryableOutcome =
  (typeof CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES)[number];

export type CaresLinkV1NoteGenerationWorkerPolicyStatus =
  | "DRAFT"
  | "APPROVED";

export type CaresLinkV1NoteGenerationWorkerPolicyJitter =
  | Readonly<{ mode: "NONE" }>
  | Readonly<{
      mode: "APPROVED_BOUNDED";
      /** Additive upper bound. A runtime must persist the selected delay. */
      maxMs: number;
    }>;

/**
 * Every operational number is required. There are intentionally no optional
 * durations, attempt counts, fallbacks or environment-derived defaults.
 */
export type CaresLinkV1NoteGenerationWorkerPolicyDefinition = Readonly<{
  version: string;
  status: CaresLinkV1NoteGenerationWorkerPolicyStatus;
  maxQueueAgeMs: number;
  minimumPayloadRemainingAtClaimMs: number;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  heartbeatSafetyMarginMs: number;
  attemptDeadlineMs: number;
  providerDeadlineMs: number;
  commitSafetyMarginMs: number;
  maxAttempts: number;
  retryDelayMsAfterAttempt: readonly number[];
  retryableOutcomes: readonly CaresLinkV1NoteGenerationRetryableOutcome[];
  recoveryBatchLimit: number;
  jitter: CaresLinkV1NoteGenerationWorkerPolicyJitter;
}>;

export type CaresLinkV1NoteGenerationWorkerPolicy =
  CaresLinkV1NoteGenerationWorkerPolicyDefinition &
    Readonly<{
      /** SHA-256 of the complete canonical policy definition. */
      digest: string;
    }>;

export type CaresLinkV1NoteGenerationWorkerPolicyCatalog = Readonly<{
  policies: readonly CaresLinkV1NoteGenerationWorkerPolicy[];
  get(
    version: string,
  ): CaresLinkV1NoteGenerationWorkerPolicy | undefined;
  requireApproved(version: string): CaresLinkV1NoteGenerationWorkerPolicy;
}>;

/**
 * The runtime catalog is intentionally empty. A future production scheduler
 * must resolve an immutable, approved, job-bound policy on the server. Its
 * claim/heartbeat/recovery APIs must not accept caller-controlled clocks,
 * durations, retry budgets or backoff timestamps.
 */
export const CARESLINK_V1_NOTE_GENERATION_WORKER_POLICY_CATALOG = Object.freeze(
  [] as CaresLinkV1NoteGenerationWorkerPolicy[],
);

const POLICY_FIELDS = [
  "version",
  "status",
  "maxQueueAgeMs",
  "minimumPayloadRemainingAtClaimMs",
  "leaseDurationMs",
  "heartbeatIntervalMs",
  "heartbeatSafetyMarginMs",
  "attemptDeadlineMs",
  "providerDeadlineMs",
  "commitSafetyMarginMs",
  "maxAttempts",
  "retryDelayMsAfterAttempt",
  "retryableOutcomes",
  "recoveryBatchLimit",
  "jitter",
] as const;

const DIGEST_BOUND_POLICY_FIELDS = [...POLICY_FIELDS, "digest"] as const;

export function createCaresLinkV1NoteGenerationWorkerPolicyDigest(
  input: CaresLinkV1NoteGenerationWorkerPolicyDefinition,
): string {
  const policy = normalizeDefinition(input);
  const canonicalDefinition = {
    kind: "careslink.v1.note-generation-worker-policy",
    version: policy.version,
    status: policy.status,
    maxQueueAgeMs: policy.maxQueueAgeMs,
    minimumPayloadRemainingAtClaimMs:
      policy.minimumPayloadRemainingAtClaimMs,
    leaseDurationMs: policy.leaseDurationMs,
    heartbeatIntervalMs: policy.heartbeatIntervalMs,
    heartbeatSafetyMarginMs: policy.heartbeatSafetyMarginMs,
    attemptDeadlineMs: policy.attemptDeadlineMs,
    providerDeadlineMs: policy.providerDeadlineMs,
    commitSafetyMarginMs: policy.commitSafetyMarginMs,
    maxAttempts: policy.maxAttempts,
    retryDelayMsAfterAttempt: policy.retryDelayMsAfterAttempt,
    retryableOutcomes: policy.retryableOutcomes,
    recoveryBatchLimit: policy.recoveryBatchLimit,
    jitter: policy.jitter,
  };
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(canonicalDefinition))
    .digest("hex");
}

export function parseCaresLinkV1NoteGenerationWorkerPolicy(
  input: unknown,
): CaresLinkV1NoteGenerationWorkerPolicy {
  const record = requireExactRecord(
    input,
    DIGEST_BOUND_POLICY_FIELDS,
    "Worker policy",
  );
  const definition = normalizeDefinition(
    Object.fromEntries(POLICY_FIELDS.map((field) => [field, record[field]])),
  );
  const digest = requireSha256(record.digest, "Worker policy digest");
  if (
    digest !== createCaresLinkV1NoteGenerationWorkerPolicyDigest(definition)
  ) {
    throw validationError("Worker policy digest does not match its definition");
  }
  return Object.freeze({ ...definition, digest });
}

/**
 * Explicit local-test catalog only. It performs no scheduling and has no
 * durable-store, route, database, provider or Points authority.
 */
export function createTestOnlyCaresLinkV1NoteGenerationWorkerPolicyCatalog(
  input: Readonly<{
    capability: "TEST_ONLY";
    policies: readonly unknown[];
  }>,
): CaresLinkV1NoteGenerationWorkerPolicyCatalog {
  if (!isRecord(input)) {
    throw validationError("Test worker policy catalog is invalid");
  }
  requireExactRecord(
    input,
    ["capability", "policies"],
    "Test worker policy catalog",
  );
  if (input.capability !== "TEST_ONLY" || !Array.isArray(input.policies)) {
    throw validationError("Test worker policy catalog is invalid");
  }

  const byVersion = new Map<
    string,
    CaresLinkV1NoteGenerationWorkerPolicy
  >();
  for (const rawPolicy of input.policies) {
    const policy = parseCaresLinkV1NoteGenerationWorkerPolicy(rawPolicy);
    const existing = byVersion.get(policy.version);
    if (!existing) {
      byVersion.set(policy.version, policy);
      continue;
    }
    if (
      existing.digest !== policy.digest ||
      existing.status !== policy.status
    ) {
      throw new CaresLinkV1ContractError(
        "IDEMPOTENCY_CONFLICT",
        "Worker policy version was reused for different content",
      );
    }
  }

  const policies = Object.freeze([...byVersion.values()]);
  return Object.freeze({
    policies,
    get(version: string) {
      requireVersion(version);
      return byVersion.get(version);
    },
    requireApproved(version: string) {
      requireVersion(version);
      const policy = byVersion.get(version);
      if (!policy || policy.status !== "APPROVED") {
        throw new CaresLinkV1ContractError(
          "GENERATION_FAILED",
          "An approved worker policy is unavailable",
        );
      }
      return policy;
    },
  });
}

function normalizeDefinition(
  input: unknown,
): CaresLinkV1NoteGenerationWorkerPolicyDefinition {
  const record = requireExactRecord(input, POLICY_FIELDS, "Worker policy");
  const version = requireVersion(record.version);
  const status = requireStatus(record.status);
  const maxQueueAgeMs = requirePositiveInteger(
    record.maxQueueAgeMs,
    "Maximum queue age",
  );
  const minimumPayloadRemainingAtClaimMs = requirePositiveInteger(
    record.minimumPayloadRemainingAtClaimMs,
    "Minimum payload lifetime at claim",
  );
  const leaseDurationMs = requirePositiveInteger(
    record.leaseDurationMs,
    "Lease duration",
  );
  const heartbeatIntervalMs = requirePositiveInteger(
    record.heartbeatIntervalMs,
    "Heartbeat interval",
  );
  const heartbeatSafetyMarginMs = requirePositiveInteger(
    record.heartbeatSafetyMarginMs,
    "Heartbeat safety margin",
  );
  const attemptDeadlineMs = requirePositiveInteger(
    record.attemptDeadlineMs,
    "Attempt deadline",
  );
  const providerDeadlineMs = requirePositiveInteger(
    record.providerDeadlineMs,
    "Provider deadline",
  );
  const commitSafetyMarginMs = requirePositiveInteger(
    record.commitSafetyMarginMs,
    "Commit safety margin",
  );
  const maxAttempts = requirePositiveInteger(
    record.maxAttempts,
    "Maximum attempts",
  );
  const recoveryBatchLimit = requirePositiveInteger(
    record.recoveryBatchLimit,
    "Recovery batch limit",
  );
  const retryDelayMsAfterAttempt = requirePositiveIntegerArray(
    record.retryDelayMsAfterAttempt,
    "Retry delay",
  );
  const retryableOutcomes = requireRetryableOutcomes(record.retryableOutcomes);
  const jitter = requireJitter(record.jitter);

  if (
    heartbeatIntervalMs + heartbeatSafetyMarginMs >=
    leaseDurationMs
  ) {
    throw validationError(
      "Heartbeat interval and safety margin must be shorter than the lease",
    );
  }
  if (leaseDurationMs > attemptDeadlineMs) {
    throw validationError("Lease duration cannot exceed the attempt deadline");
  }
  if (providerDeadlineMs + commitSafetyMarginMs > attemptDeadlineMs) {
    throw validationError(
      "Provider deadline must leave the approved commit safety margin",
    );
  }
  if (minimumPayloadRemainingAtClaimMs < attemptDeadlineMs) {
    throw validationError(
      "Claim requires enough payload lifetime for the attempt deadline",
    );
  }
  if (retryDelayMsAfterAttempt.length !== maxAttempts - 1) {
    throw validationError(
      "Retry delay vector must contain one delay for every possible retry",
    );
  }
  if (maxAttempts === 1 && retryableOutcomes.length !== 0) {
    throw validationError(
      "A no-retry policy cannot declare retryable outcomes",
    );
  }
  if (maxAttempts > 1 && retryableOutcomes.length === 0) {
    throw validationError(
      "A retry policy must explicitly declare retryable outcomes",
    );
  }

  return Object.freeze({
    version,
    status,
    maxQueueAgeMs,
    minimumPayloadRemainingAtClaimMs,
    leaseDurationMs,
    heartbeatIntervalMs,
    heartbeatSafetyMarginMs,
    attemptDeadlineMs,
    providerDeadlineMs,
    commitSafetyMarginMs,
    maxAttempts,
    retryDelayMsAfterAttempt,
    retryableOutcomes,
    recoveryBatchLimit,
    jitter,
  });
}

function requireVersion(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw validationError("Worker policy version is invalid");
  }
  return value;
}

function requireStatus(
  value: unknown,
): CaresLinkV1NoteGenerationWorkerPolicyStatus {
  if (value !== "DRAFT" && value !== "APPROVED") {
    throw validationError("Worker policy status is invalid");
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw validationError(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function requirePositiveIntegerArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw validationError(`${label} vector is invalid`);
  }
  return Object.freeze(
    Array.from(value, (entry) => requirePositiveInteger(entry, label)),
  );
}

function requireRetryableOutcomes(value: unknown) {
  if (!Array.isArray(value)) {
    throw validationError("Retryable outcomes are invalid");
  }
  const outcomes = Array.from(value, (entry) => {
    if (
      typeof entry !== "string" ||
      !(CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES as readonly string[]).includes(
        entry,
      )
    ) {
      throw validationError("Retryable outcome is not allowlisted");
    }
    return entry as CaresLinkV1NoteGenerationRetryableOutcome;
  });
  if (new Set(outcomes).size !== outcomes.length) {
    throw validationError("Retryable outcomes must be unique");
  }
  return Object.freeze(outcomes);
}

function requireJitter(
  value: unknown,
): CaresLinkV1NoteGenerationWorkerPolicyJitter {
  if (!isRecord(value) || typeof value.mode !== "string") {
    throw validationError("Retry jitter policy is invalid");
  }
  if (value.mode === "NONE") {
    requireExactRecord(value, ["mode"], "Retry jitter policy");
    return Object.freeze({ mode: "NONE" });
  }
  if (value.mode === "APPROVED_BOUNDED") {
    requireExactRecord(value, ["mode", "maxMs"], "Retry jitter policy");
    return Object.freeze({
      mode: "APPROVED_BOUNDED",
      maxMs: requirePositiveInteger(value.maxMs, "Retry jitter maximum"),
    });
  }
  throw validationError("Retry jitter mode is invalid");
}

function requireSha256(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw validationError(`${label} is invalid`);
  }
  return value;
}

function requireExactRecord<const Field extends string>(
  value: unknown,
  fields: readonly Field[],
  label: string,
): Record<Field, unknown> {
  if (!isRecord(value)) throw validationError(`${label} is invalid`);
  const expected = [...fields].sort();
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw validationError(`${label} fields are invalid`);
  }
  return value as Record<Field, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validationError(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}
