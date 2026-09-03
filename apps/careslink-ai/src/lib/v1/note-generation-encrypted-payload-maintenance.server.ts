import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CaresLinkV1ContractError } from "./shared-contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const POLICY_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{31,255}$/;
const CANDIDATE_BINDING_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_ENCRYPTED_PAYLOAD_MAINTENANCE_CANDIDATE" as const;

export const CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_MAINTENANCE_MAX_BATCH_SIZE =
  100 as const;

export type CaresLinkV1EncryptedPayloadMaintenanceCandidateBinding =
  Readonly<{
    candidateReferenceHash: string;
    ownerUserIdHash: string;
    idempotencyHash: string;
    jobId: string;
    payloadId: string;
    requestHash: string;
    payloadHandleHash: string;
    payloadExpiresAt: string;
    payloadPolicyVersion: string;
    payloadPolicySnapshotHash: string;
    encryptionProfileVersion: string;
    kmsKeyVersionResourceHash: string;
    backupDispositionVersion: string;
    deleteBindingHash: string;
  }>;

export type CaresLinkV1EncryptedPayloadMaintenanceCandidate =
  CaresLinkV1EncryptedPayloadMaintenanceCandidateBinding &
    Readonly<{
      claimToken: string;
      candidateBindingHash: string;
    }>;

export type CaresLinkV1EncryptedPayloadMaintenanceSummary = Readonly<{
  claimedCount: number;
  retainedCount: number;
  deferredCount: number;
  deletedCount: number;
  quarantinedCount: number;
  retryRequiredCount: number;
}>;

export type CaresLinkV1EncryptedPayloadMaintenanceCandidatePort = Readonly<{
  /** Must atomically lease at most `limit` distinct staged candidates. */
  claimStaged(input: Readonly<{
    limit: number;
    now: string;
  }>): Promise<unknown>;
  /**
   * Must atomically lease at most `limit` distinct candidates whose persisted
   * payloadExpiresAt is at or before `now`, including previously RETAINED ones.
   */
  claimExpired(input: Readonly<{
    limit: number;
    now: string;
  }>): Promise<unknown>;
  /**
   * Persists the disposition under the exact claim and candidate binding.
   * RETAINED must remain discoverable by claimExpired at payload expiry.
   * RETRY_REQUIRED must release or eventually expire the lease for replay.
   */
  settle(input: CaresLinkV1EncryptedPayloadMaintenanceSettlement): Promise<unknown>;
}>;

export type CaresLinkV1EncryptedPayloadAdmissionLookupPort = Readonly<{
  /**
   * Returns ACCEPTED/REJECTED only after comparing every supplied binding to
   * one durable admission transaction. MISSING and AMBIGUOUS are not proof of
   * rejection; BINDING_MISMATCH is a quarantine signal.
   */
  lookupExact(
    input: CaresLinkV1EncryptedPayloadMaintenanceCandidateBinding &
      Readonly<{ candidateBindingHash: string }>,
  ): Promise<unknown>;
}>;

export type CaresLinkV1EncryptedPayloadExactDeletePort = Readonly<{
  /**
   * ALREADY_DELETED is valid only for a durable tombstone with the same exact
   * deleteBindingHash. A bare backend 404 must return NOT_FOUND.
   */
  deleteIfBindingMatches(input: Readonly<{
    namespace: Readonly<{
      ownerUserIdHash: string;
      idempotencyHash: string;
    }>;
    deleteBindingHash: string;
  }>): Promise<unknown>;
}>;

export type CaresLinkV1EncryptedPayloadMaintenanceDisposition =
  | "RETAINED"
  | "DEFERRED"
  | "DELETED"
  | "QUARANTINED"
  | "RETRY_REQUIRED";

export type CaresLinkV1EncryptedPayloadMaintenanceReason =
  | "ADMISSION_ACCEPTED"
  | "ADMISSION_UNCERTAIN_BEFORE_EXPIRY"
  | "ADMISSION_REJECTED"
  | "ADMISSION_UNCERTAIN_EXPIRED"
  | "RETENTION_EXPIRED"
  | "CANDIDATE_BINDING_MISMATCH"
  | "ADMISSION_BINDING_MISMATCH"
  | "DELETE_BINDING_MISMATCH"
  | "OBJECT_NOT_FOUND"
  | "INVALID_EXPIRY_CANDIDATE"
  | "ADMISSION_LOOKUP_FAILED"
  | "DELETE_RESULT_UNKNOWN";

export type CaresLinkV1EncryptedPayloadMaintenanceSettlement = Readonly<{
  candidateReferenceHash: string;
  claimToken: string;
  candidateBindingHash: string;
  disposition: CaresLinkV1EncryptedPayloadMaintenanceDisposition;
  reason: CaresLinkV1EncryptedPayloadMaintenanceReason;
  now: string;
  nextEligibleAt: string | null;
}>;

export type CaresLinkV1NoteGenerationEncryptedPayloadMaintenance = Readonly<{
  reconcileStaged(
    limit: number,
    now: string,
  ): Promise<CaresLinkV1EncryptedPayloadMaintenanceSummary>;
  sweepExpired(
    limit: number,
    now: string,
  ): Promise<CaresLinkV1EncryptedPayloadMaintenanceSummary>;
}>;

export type CaresLinkV1NoteGenerationEncryptedPayloadMaintenanceOptions =
  Readonly<{
    candidatePort: CaresLinkV1EncryptedPayloadMaintenanceCandidatePort;
    admissionLookupPort: CaresLinkV1EncryptedPayloadAdmissionLookupPort;
    exactDeletePort: CaresLinkV1EncryptedPayloadExactDeletePort;
  }>;

/** No scheduler or product runtime installs this source-only core. */
export const CARESLINK_V1_NOTE_GENERATION_FORMAL_ENCRYPTED_PAYLOAD_MAINTENANCE =
  undefined as
    | CaresLinkV1NoteGenerationEncryptedPayloadMaintenance
    | undefined;

export function createCaresLinkV1NoteGenerationEncryptedPayloadMaintenance(
  value: unknown,
): CaresLinkV1NoteGenerationEncryptedPayloadMaintenance {
  const options = parseOptions(value);
  return Object.freeze({
    async reconcileStaged(limitValue, nowValue) {
      return runBatch("RECONCILE", limitValue, nowValue, options);
    },
    async sweepExpired(limitValue, nowValue) {
      return runBatch("SWEEP_EXPIRED", limitValue, nowValue, options);
    },
  });
}

export function createCaresLinkV1EncryptedPayloadMaintenanceCandidateBindingHash(
  value: unknown,
) {
  const binding = parseCandidateBinding(value);
  return hashCandidateBinding(binding);
}

type ParsedOptions = Readonly<{
  candidatePort: CaresLinkV1EncryptedPayloadMaintenanceCandidatePort;
  admissionLookupPort: CaresLinkV1EncryptedPayloadAdmissionLookupPort;
  exactDeletePort: CaresLinkV1EncryptedPayloadExactDeletePort;
}>;

type ParsedCandidate = CaresLinkV1EncryptedPayloadMaintenanceCandidate &
  Readonly<{ bindingMatches: boolean }>;

type MutableSummary = {
  claimedCount: number;
  retainedCount: number;
  deferredCount: number;
  deletedCount: number;
  quarantinedCount: number;
  retryRequiredCount: number;
};

type SettlementKind = Readonly<{
  disposition: CaresLinkV1EncryptedPayloadMaintenanceDisposition;
  reason: CaresLinkV1EncryptedPayloadMaintenanceReason;
  nextEligibleAt: string | null;
  counter:
    | "retainedCount"
    | "deferredCount"
    | "deletedCount"
    | "quarantinedCount"
    | "retryRequiredCount";
}>;

function parseOptions(value: unknown): ParsedOptions {
  try {
    const options = exactDataRecord(value, [
      "candidatePort",
      "admissionLookupPort",
      "exactDeletePort",
    ]);
    return Object.freeze({
      candidatePort:
        requireFrozenPort<CaresLinkV1EncryptedPayloadMaintenanceCandidatePort>(
          options.candidatePort,
          ["claimStaged", "claimExpired", "settle"],
        ),
      admissionLookupPort:
        requireFrozenPort<CaresLinkV1EncryptedPayloadAdmissionLookupPort>(
          options.admissionLookupPort,
          ["lookupExact"],
        ),
      exactDeletePort:
        requireFrozenPort<CaresLinkV1EncryptedPayloadExactDeletePort>(
          options.exactDeletePort,
          ["deleteIfBindingMatches"],
        ),
    });
  } catch {
    throw unavailable();
  }
}

async function runBatch(
  mode: "RECONCILE" | "SWEEP_EXPIRED",
  limitValue: unknown,
  nowValue: unknown,
  options: ParsedOptions,
): Promise<CaresLinkV1EncryptedPayloadMaintenanceSummary> {
  try {
    const limit = parseLimit(limitValue);
    const now = parseTimestamp(nowValue);
    const candidates = await claimCandidates(mode, limit, now, options);
    const summary: MutableSummary = {
      claimedCount: candidates.length,
      retainedCount: 0,
      deferredCount: 0,
      deletedCount: 0,
      quarantinedCount: 0,
      retryRequiredCount: 0,
    };
    for (const candidate of candidates) {
      if (mode === "RECONCILE") {
        await reconcileCandidate(candidate, now, options, summary);
      } else {
        await sweepCandidate(candidate, now, options, summary);
      }
    }
    return Object.freeze({ ...summary });
  } catch (error) {
    if (error instanceof SafeMaintenanceError) throw error;
    throw unavailable();
  }
}

async function claimCandidates(
  mode: "RECONCILE" | "SWEEP_EXPIRED",
  limit: number,
  now: string,
  options: ParsedOptions,
) {
  let value: unknown;
  try {
    const request = Object.freeze({ limit, now });
    value =
      mode === "RECONCILE"
        ? await options.candidatePort.claimStaged(request)
        : await options.candidatePort.claimExpired(request);
  } catch {
    throw unavailable();
  }
  const result = exactDataRecord(value, ["candidates"]);
  const candidateValues = exactArray(result.candidates, limit);
  const candidates = candidateValues.map(parseCandidate);
  requireUnique(
    candidates.map(({ candidateReferenceHash }) => candidateReferenceHash),
  );
  requireUnique(candidates.map(({ claimToken }) => claimToken));
  requireUnique(
    candidates.map(
      ({ ownerUserIdHash, idempotencyHash }) =>
        `${ownerUserIdHash}:${idempotencyHash}`,
    ),
  );
  return candidates;
}

async function reconcileCandidate(
  candidate: ParsedCandidate,
  now: string,
  options: ParsedOptions,
  summary: MutableSummary,
) {
  if (!candidate.bindingMatches) {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "QUARANTINED",
      reason: "CANDIDATE_BINDING_MISMATCH",
      nextEligibleAt: null,
      counter: "quarantinedCount",
    });
    return;
  }

  const admission = await lookupAdmission(candidate, options);
  if (admission === "LOOKUP_FAILED") {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "RETRY_REQUIRED",
      reason: "ADMISSION_LOOKUP_FAILED",
      nextEligibleAt: null,
      counter: "retryRequiredCount",
    });
    return;
  }
  if (admission === "BINDING_MISMATCH") {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "QUARANTINED",
      reason: "ADMISSION_BINDING_MISMATCH",
      nextEligibleAt: null,
      counter: "quarantinedCount",
    });
    return;
  }
  if (admission === "ACCEPTED") {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "RETAINED",
      reason: "ADMISSION_ACCEPTED",
      nextEligibleAt: null,
      counter: "retainedCount",
    });
    return;
  }
  if (admission === "REJECTED") {
    await deleteAndSettle(
      candidate,
      now,
      options,
      summary,
      "ADMISSION_REJECTED",
    );
    return;
  }

  if (Date.parse(now) < Date.parse(candidate.payloadExpiresAt)) {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "DEFERRED",
      reason: "ADMISSION_UNCERTAIN_BEFORE_EXPIRY",
      nextEligibleAt: candidate.payloadExpiresAt,
      counter: "deferredCount",
    });
    return;
  }
  await deleteAndSettle(
    candidate,
    now,
    options,
    summary,
    "ADMISSION_UNCERTAIN_EXPIRED",
  );
}

async function sweepCandidate(
  candidate: ParsedCandidate,
  now: string,
  options: ParsedOptions,
  summary: MutableSummary,
) {
  if (!candidate.bindingMatches) {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "QUARANTINED",
      reason: "CANDIDATE_BINDING_MISMATCH",
      nextEligibleAt: null,
      counter: "quarantinedCount",
    });
    return;
  }
  if (Date.parse(candidate.payloadExpiresAt) > Date.parse(now)) {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "QUARANTINED",
      reason: "INVALID_EXPIRY_CANDIDATE",
      nextEligibleAt: null,
      counter: "quarantinedCount",
    });
    return;
  }
  await deleteAndSettle(
    candidate,
    now,
    options,
    summary,
    "RETENTION_EXPIRED",
  );
}

async function deleteAndSettle(
  candidate: ParsedCandidate,
  now: string,
  options: ParsedOptions,
  summary: MutableSummary,
  successReason:
    | "ADMISSION_REJECTED"
    | "ADMISSION_UNCERTAIN_EXPIRED"
    | "RETENTION_EXPIRED",
) {
  const deletion = await deleteExact(candidate, options);
  if (deletion === "DELETED" || deletion === "ALREADY_DELETED") {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "DELETED",
      reason: successReason,
      nextEligibleAt: null,
      counter: "deletedCount",
    });
    return;
  }
  if (deletion === "BINDING_MISMATCH") {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "QUARANTINED",
      reason: "DELETE_BINDING_MISMATCH",
      nextEligibleAt: null,
      counter: "quarantinedCount",
    });
    return;
  }
  if (deletion === "NOT_FOUND") {
    await settleAndCount(candidate, now, options, summary, {
      disposition: "QUARANTINED",
      reason: "OBJECT_NOT_FOUND",
      nextEligibleAt: null,
      counter: "quarantinedCount",
    });
    return;
  }
  await settleAndCount(candidate, now, options, summary, {
    disposition: "RETRY_REQUIRED",
    reason: "DELETE_RESULT_UNKNOWN",
    nextEligibleAt: null,
    counter: "retryRequiredCount",
  });
}

async function lookupAdmission(
  candidate: ParsedCandidate,
  options: ParsedOptions,
): Promise<
  | "ACCEPTED"
  | "REJECTED"
  | "MISSING"
  | "AMBIGUOUS"
  | "BINDING_MISMATCH"
  | "LOOKUP_FAILED"
> {
  let value: unknown;
  try {
    value = await options.admissionLookupPort.lookupExact(
      Object.freeze({
        ...candidateBinding(candidate),
        candidateBindingHash: candidate.candidateBindingHash,
      }),
    );
    const result = exactDataRecordWithVariant(value, "status", {
      ACCEPTED: ["candidateBindingHash"],
      REJECTED: ["candidateBindingHash"],
      MISSING: [],
      AMBIGUOUS: [],
      BINDING_MISMATCH: [],
    });
    if (
      (result.status === "ACCEPTED" || result.status === "REJECTED") &&
      result.candidateBindingHash !== candidate.candidateBindingHash
    ) {
      return "BINDING_MISMATCH";
    }
    return result.status;
  } catch {
    return "LOOKUP_FAILED";
  }
}

async function deleteExact(
  candidate: ParsedCandidate,
  options: ParsedOptions,
): Promise<
  | "DELETED"
  | "ALREADY_DELETED"
  | "BINDING_MISMATCH"
  | "NOT_FOUND"
  | "RESULT_UNKNOWN"
> {
  try {
    const value = await options.exactDeletePort.deleteIfBindingMatches(
      Object.freeze({
        namespace: Object.freeze({
          ownerUserIdHash: candidate.ownerUserIdHash,
          idempotencyHash: candidate.idempotencyHash,
        }),
        deleteBindingHash: candidate.deleteBindingHash,
      }),
    );
    const result = exactDataRecord(value, ["status"]);
    if (
      result.status === "DELETED" ||
      result.status === "ALREADY_DELETED" ||
      result.status === "BINDING_MISMATCH" ||
      result.status === "NOT_FOUND"
    ) {
      return result.status;
    }
    return "RESULT_UNKNOWN";
  } catch {
    return "RESULT_UNKNOWN";
  }
}

async function settleAndCount(
  candidate: ParsedCandidate,
  now: string,
  options: ParsedOptions,
  summary: MutableSummary,
  settlement: SettlementKind,
) {
  let value: unknown;
  try {
    value = await options.candidatePort.settle(
      Object.freeze({
        candidateReferenceHash: candidate.candidateReferenceHash,
        claimToken: candidate.claimToken,
        candidateBindingHash: candidate.candidateBindingHash,
        disposition: settlement.disposition,
        reason: settlement.reason,
        now,
        nextEligibleAt: settlement.nextEligibleAt,
      }),
    );
  } catch {
    throw unavailable();
  }
  const result = exactDataRecord(value, [
    "status",
    "candidateBindingHash",
    "disposition",
  ]);
  if (
    (result.status !== "SETTLED" && result.status !== "ALREADY_SETTLED") ||
    result.candidateBindingHash !== candidate.candidateBindingHash ||
    result.disposition !== settlement.disposition
  ) {
    throw unavailable();
  }
  summary[settlement.counter] += 1;
}

function parseCandidate(value: unknown): ParsedCandidate {
  const candidate = exactDataRecord(value, [
    "candidateReferenceHash",
    "ownerUserIdHash",
    "idempotencyHash",
    "jobId",
    "payloadId",
    "requestHash",
    "payloadHandleHash",
    "payloadExpiresAt",
    "payloadPolicyVersion",
    "payloadPolicySnapshotHash",
    "encryptionProfileVersion",
    "kmsKeyVersionResourceHash",
    "backupDispositionVersion",
    "deleteBindingHash",
    "claimToken",
    "candidateBindingHash",
  ]);
  const binding = parseCandidateBinding({
    candidateReferenceHash: candidate.candidateReferenceHash,
    ownerUserIdHash: candidate.ownerUserIdHash,
    idempotencyHash: candidate.idempotencyHash,
    jobId: candidate.jobId,
    payloadId: candidate.payloadId,
    requestHash: candidate.requestHash,
    payloadHandleHash: candidate.payloadHandleHash,
    payloadExpiresAt: candidate.payloadExpiresAt,
    payloadPolicyVersion: candidate.payloadPolicyVersion,
    payloadPolicySnapshotHash: candidate.payloadPolicySnapshotHash,
    encryptionProfileVersion: candidate.encryptionProfileVersion,
    kmsKeyVersionResourceHash: candidate.kmsKeyVersionResourceHash,
    backupDispositionVersion: candidate.backupDispositionVersion,
    deleteBindingHash: candidate.deleteBindingHash,
  });
  const claimToken = parseClaimToken(candidate.claimToken);
  const candidateBindingHash = requireSha256(candidate.candidateBindingHash);
  return Object.freeze({
    ...binding,
    claimToken,
    candidateBindingHash,
    bindingMatches: candidateBindingHash === hashCandidateBinding(binding),
  });
}

function parseCandidateBinding(
  value: unknown,
): CaresLinkV1EncryptedPayloadMaintenanceCandidateBinding {
  const binding = exactDataRecord(value, [
    "candidateReferenceHash",
    "ownerUserIdHash",
    "idempotencyHash",
    "jobId",
    "payloadId",
    "requestHash",
    "payloadHandleHash",
    "payloadExpiresAt",
    "payloadPolicyVersion",
    "payloadPolicySnapshotHash",
    "encryptionProfileVersion",
    "kmsKeyVersionResourceHash",
    "backupDispositionVersion",
    "deleteBindingHash",
  ]);
  return Object.freeze({
    candidateReferenceHash: requireSha256(binding.candidateReferenceHash),
    ownerUserIdHash: requireSha256(binding.ownerUserIdHash),
    idempotencyHash: requireSha256(binding.idempotencyHash),
    jobId: requireUuid(binding.jobId),
    payloadId: requireUuid(binding.payloadId),
    requestHash: requireSha256(binding.requestHash),
    payloadHandleHash: requireSha256(binding.payloadHandleHash),
    payloadExpiresAt: parseTimestamp(binding.payloadExpiresAt),
    payloadPolicyVersion: requirePolicyIdentifier(
      binding.payloadPolicyVersion,
    ),
    payloadPolicySnapshotHash: requireSha256(
      binding.payloadPolicySnapshotHash,
    ),
    encryptionProfileVersion: requirePolicyIdentifier(
      binding.encryptionProfileVersion,
    ),
    kmsKeyVersionResourceHash: requireSha256(
      binding.kmsKeyVersionResourceHash,
    ),
    backupDispositionVersion: requirePolicyIdentifier(
      binding.backupDispositionVersion,
    ),
    deleteBindingHash: requireSha256(binding.deleteBindingHash),
  });
}

function candidateBinding(
  candidate: CaresLinkV1EncryptedPayloadMaintenanceCandidateBinding,
) {
  return Object.freeze({
    candidateReferenceHash: candidate.candidateReferenceHash,
    ownerUserIdHash: candidate.ownerUserIdHash,
    idempotencyHash: candidate.idempotencyHash,
    jobId: candidate.jobId,
    payloadId: candidate.payloadId,
    requestHash: candidate.requestHash,
    payloadHandleHash: candidate.payloadHandleHash,
    payloadExpiresAt: candidate.payloadExpiresAt,
    payloadPolicyVersion: candidate.payloadPolicyVersion,
    payloadPolicySnapshotHash: candidate.payloadPolicySnapshotHash,
    encryptionProfileVersion: candidate.encryptionProfileVersion,
    kmsKeyVersionResourceHash: candidate.kmsKeyVersionResourceHash,
    backupDispositionVersion: candidate.backupDispositionVersion,
    deleteBindingHash: candidate.deleteBindingHash,
  });
}

function hashCandidateBinding(
  binding: CaresLinkV1EncryptedPayloadMaintenanceCandidateBinding,
) {
  return canonicalSha256({
    purpose: CANDIDATE_BINDING_PURPOSE,
    ...candidateBinding(binding),
  });
}

function exactArray(value: unknown, maximumLength: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximumLength
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
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw unavailable();
    }
    return descriptor.value;
  });
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
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw unavailable();
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function exactDataRecordWithVariant<
  const Variants extends Readonly<Record<string, readonly string[]>>,
>(
  value: unknown,
  discriminant: string,
  variants: Variants,
): Readonly<Record<string, unknown>> & {
  status: keyof Variants & string;
} {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const statusDescriptor = descriptors[discriminant];
  if (!statusDescriptor || !("value" in statusDescriptor)) {
    throw unavailable();
  }
  const status = statusDescriptor.value;
  if (typeof status !== "string" || !Object.hasOwn(variants, status)) {
    throw unavailable();
  }
  return exactDataRecord(value, [discriminant, ...variants[status]]) as
    Readonly<Record<string, unknown>> & {
      status: keyof Variants & string;
    };
}

function requireFrozenPort<T>(value: unknown, methods: readonly string[]): T {
  const port = exactDataRecord(value, methods);
  if (!Object.isFrozen(value)) throw unavailable();
  for (const method of methods) {
    if (typeof port[method] !== "function" || nodeTypes.isProxy(port[method])) {
      throw unavailable();
    }
  }
  return value as T;
}

function requireUnique(values: readonly string[]) {
  if (new Set(values).size !== values.length) throw unavailable();
}

function parseLimit(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value >
      CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_MAINTENANCE_MAX_BATCH_SIZE
  ) {
    throw validation();
  }
  return value;
}

function parseTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw validation();
  }
  return value;
}

function requireUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw validation();
  }
  return value.toLowerCase();
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw validation();
  }
  return value;
}

function requirePolicyIdentifier(value: unknown) {
  if (
    typeof value !== "string" ||
    !POLICY_IDENTIFIER_PATTERN.test(value) ||
    /(?:https?:\/\/|bearer|authorization)/i.test(value)
  ) {
    throw validation();
  }
  return value;
}

function parseClaimToken(value: unknown) {
  if (
    typeof value !== "string" ||
    !CLAIM_TOKEN_PATTERN.test(value) ||
    /(?:https?:\/\/|bearer|authorization)/i.test(value)
  ) {
    throw validation();
  }
  return value;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

class SafeMaintenanceError extends CaresLinkV1ContractError {}

function validation() {
  return new SafeMaintenanceError(
    "VALIDATION_ERROR",
    "Encrypted payload maintenance input is invalid",
  );
}

function unavailable() {
  return new SafeMaintenanceError(
    "GENERATION_FAILED",
    "Encrypted payload maintenance is unavailable",
  );
}
