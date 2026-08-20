import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  buildCaresLinkV1CanonicalNoteContent,
  type CaresLinkV1NoteProviderCandidate,
} from "./note-generation-output";
import {
  type CaresLinkV1NoteGenerationCanonicalSnapshot,
  type CaresLinkV1NoteGenerationFailureCode,
  type CaresLinkV1NoteGenerationPrivacyCommitBinding,
  type CaresLinkV1NoteGenerationResult,
  type CaresLinkV1NoteGenerationSessionCommitBinding,
} from "./note-generation-job";
import { scanCaresLinkV1CleanedFacts } from "./privacy-review-scanner.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  isCaresLinkV1Locale,
  type CaresLinkV1GenerationStatus,
  type CaresLinkV1JsonObject,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1ServiceCode,
} from "./shared-contracts";
import type { CaresLinkV1AuthTransport } from "./transport-contract";

/**
 * Source-only contract evidence. This repository is not wired to a route,
 * database, provider, scheduler, Points service or Production capability.
 */
export const CARESLINK_V1_NOTE_GENERATION_DURABLE_READY = false as const;

/**
 * Retention and secure payload-vault policy are not frozen. Production code
 * must not enable payload storage based on this in-memory reference adapter.
 */
export const CARESLINK_V1_NOTE_GENERATION_PAYLOAD_RETENTION_READY =
  false as const;

export const CARESLINK_V1_NOTE_GENERATION_DURABLE_ACTIVATION_BLOCKERS = [
  "DATABASE_SCHEMA_AND_RLS_NOT_APPLIED",
  "ATOMIC_CANONICAL_RPC_NOT_VERIFIED",
  "PAYLOAD_VAULT_AND_RETENTION_NOT_CONFIGURED",
  "FRESH_SESSION_PRIVACY_PAYLOAD_GATE_NOT_VERIFIED",
  "LEASE_TIMEOUT_AND_RETRY_POLICY_NOT_APPROVED",
  "REAL_PROVIDER_POLICY_NOT_CONFIGURED",
  "POINTS_NOT_INTEGRATED",
] as const;

export type CaresLinkV1NoteGenerationAttemptStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "LEASE_EXPIRED";

/**
 * Server-private metadata. Never serialize this record into an owner-facing
 * ACK: the initiating session UUID exists only for a fresh auth.sessions check.
 * Raw facts, provider output, access/refresh tokens and lease tokens are absent.
 */
export type CaresLinkV1NoteGenerationDurableJobRecord = Readonly<{
  id: string;
  ownerUserId: string;
  admissionSessionId: string;
  admissionTransport: CaresLinkV1AuthTransport;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  serviceCode: CaresLinkV1ServiceCode;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  cleanedFactsHash: string;
  privacyReviewId: string;
  idempotencyHash: string;
  requestHash: string;
  payloadHandleHash?: string;
  payloadExpiresAt?: string;
  status: CaresLinkV1GenerationStatus;
  attemptCount: number;
  nextEligibleAt?: string;
  activeAttemptId?: string;
  activeLeaseTokenHash?: string;
  leaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  failureCode?: CaresLinkV1NoteGenerationFailureCode;
  result?: CaresLinkV1NoteGenerationResult;
}>;

/** Content-free attempt metadata. Provider errors and generated text stay out. */
export type CaresLinkV1NoteGenerationDurableAttemptRecord = Readonly<{
  id: string;
  jobId: string;
  ownerUserId: string;
  ordinal: number;
  workerIdHash: string;
  leaseTokenHash: string;
  status: CaresLinkV1NoteGenerationAttemptStatus;
  acquiredAt: string;
  renewedAt: string;
  leaseExpiresAt: string;
  /** Metadata-only evidence that this exact attempt passed payload release. */
  payloadAuthorizedAt?: string;
  finishedAt?: string;
  failureCode?: CaresLinkV1NoteGenerationFailureCode;
}>;

/** Owner-safe view: no session, proof, hashes, payload, lease or worker data. */
export type CaresLinkV1NoteGenerationDurableOwnerView = Readonly<{
  jobId: string;
  status: CaresLinkV1GenerationStatus;
  noteType: CaresLinkV1NoteTypeCode;
  serviceCode: CaresLinkV1ServiceCode;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  failureCode?: CaresLinkV1NoteGenerationFailureCode;
  result?: CaresLinkV1NoteGenerationResult;
}>;

export type CaresLinkV1NoteGenerationDurableEnqueueInput = Readonly<{
  jobId: string;
  ownerUserId: string;
  admissionSessionId: string;
  admissionTransport: CaresLinkV1AuthTransport;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  serviceCode: CaresLinkV1ServiceCode;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  cleanedFactsHash: string;
  privacyReviewId: string;
  idempotencyHash: string;
  requestHash: string;
  /**
   * Opaque reference into a future encrypted, retention-bounded payload vault.
   * The memory adapter rejects this unless TEST_ONLY capability is explicit.
   */
  payload?: Readonly<{
    handle: string;
    expiresAt: string;
  }>;
  now: string;
}>;

export type CaresLinkV1NoteGenerationDurableLeaseClaim = Readonly<{
  job: CaresLinkV1NoteGenerationDurableJobRecord;
  attempt: CaresLinkV1NoteGenerationDurableAttemptRecord;
  /** Worker-only credential. Persist only its SHA-256 hash. */
  leaseToken: string;
}>;

/** Worker-private result. Never serialize any field into an owner response. */
export type CaresLinkV1NoteGenerationDurableAuthorizedPayloadUse = Readonly<{
  job: CaresLinkV1NoteGenerationDurableJobRecord;
  attempt: CaresLinkV1NoteGenerationDurableAttemptRecord;
  /** Worker-only opaque vault reference. It is never part of job metadata. */
  payloadHandle: string;
}>;

export type CaresLinkV1NoteGenerationDurableRecovery = Readonly<{
  jobId: string;
  expiredAttemptId: string;
  outcome: "REQUEUED" | "FAILED";
}>;

/**
 * Server-internal repository surface. Only `getOwnerView` is safe to serialize.
 * Production implementations must derive `now` from the database transaction
 * clock; the explicit timestamps below exist solely for deterministic fakes.
 */
export type CaresLinkV1NoteGenerationDurableRepository = Readonly<{
  enqueue(
    input: CaresLinkV1NoteGenerationDurableEnqueueInput,
  ): Promise<Readonly<{
    job: CaresLinkV1NoteGenerationDurableJobRecord;
    created: boolean;
  }>>;
  findPrivateByIdempotency(input: Readonly<{
    ownerUserId: string;
    idempotencyHash: string;
  }>): Promise<CaresLinkV1NoteGenerationDurableJobRecord | undefined>;
  getPrivate(input: Readonly<{
    ownerUserId: string;
    jobId: string;
  }>): Promise<CaresLinkV1NoteGenerationDurableJobRecord>;
  getOwnerView(input: Readonly<{
    ownerUserId: string;
    jobId: string;
  }>): Promise<CaresLinkV1NoteGenerationDurableOwnerView>;
  listAttemptsPrivate(input: Readonly<{
    ownerUserId: string;
    jobId: string;
  }>): Promise<readonly CaresLinkV1NoteGenerationDurableAttemptRecord[]>;
  claimNext(input: Readonly<{
    workerId: string;
    now: string;
    leaseDurationMs: number;
  }>): Promise<CaresLinkV1NoteGenerationDurableLeaseClaim | undefined>;
  renewLease(input: Readonly<{
    jobId: string;
    attemptId: string;
    leaseToken: string;
    now: string;
    leaseDurationMs: number;
  }>): Promise<CaresLinkV1NoteGenerationDurableLeaseClaim>;
  /**
   * The only operation that releases an opaque payload handle to a worker.
   * A real repository must fresh-read auth.users/auth.sessions eligibility and
   * the exact privacy proof, and write attempt authorization evidence, in the
   * same short transaction as this release.
   * Memory bindings are source-only evidence, not proof of live revocation.
   */
  authorizePayloadUse(input: Readonly<{
    jobId: string;
    attemptId: string;
    leaseToken: string;
    privacyBinding: CaresLinkV1NoteGenerationPrivacyCommitBinding;
    sessionBinding: CaresLinkV1NoteGenerationSessionCommitBinding;
    contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationDurableAuthorizedPayloadUse>;
  failAttempt(input: Readonly<{
    jobId: string;
    attemptId: string;
    leaseToken: string;
    failureCode: CaresLinkV1NoteGenerationFailureCode;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationDurableJobRecord>;
  cancel(input: Readonly<{
    ownerUserId: string;
    jobId: string;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationDurableJobRecord>;
  /**
   * Expired work is never silently retried forever. The caller supplies the
   * approved maximum; exhaustion becomes content-free GENERATION_FAILED.
   */
  recoverExpired(input: Readonly<{
    now: string;
    requeueAt: string;
    maxAttempts: number;
  }>): Promise<readonly CaresLinkV1NoteGenerationDurableRecovery[]>;
  /**
   * Production must implement this as one database transaction: validate the
   * active lease and fresh authorities, insert document/revision 1, transition
   * attempt/job to success, then make the payload handle unusable.
   */
  commitCanonicalSuccess(input: Readonly<{
    jobId: string;
    attemptId: string;
    leaseToken: string;
    privacyBinding: CaresLinkV1NoteGenerationPrivacyCommitBinding;
    sessionBinding: CaresLinkV1NoteGenerationSessionCommitBinding;
    contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    snapshot: CaresLinkV1NoteGenerationCanonicalSnapshot;
    result: CaresLinkV1NoteGenerationResult;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationDurableJobRecord>;
  getCanonicalSnapshot(input: Readonly<{
    ownerUserId: string;
    canonicalId: string;
  }>): Promise<CaresLinkV1NoteGenerationCanonicalSnapshot | undefined>;
}>;

/**
 * Test evidence only. Opaque handles are rejected by default; tests must opt in
 * explicitly and still receive no real storage, provider or runtime wiring.
 */
export function createMemoryCaresLinkV1NoteGenerationDurableRepository(
  options: Readonly<{
    payloadCapability?: "DISABLED" | "TEST_ONLY";
    createId?: () => string;
    createLeaseToken?: () => string;
  }> = {},
): CaresLinkV1NoteGenerationDurableRepository {
  return createMemoryRepository(options);
}

function createMemoryRepository({
  payloadCapability = "DISABLED",
  createId = randomUUID,
  createLeaseToken = randomUUID,
}: Readonly<{
  payloadCapability?: "DISABLED" | "TEST_ONLY";
  createId?: () => string;
  createLeaseToken?: () => string;
}>): CaresLinkV1NoteGenerationDurableRepository {
  const jobs = new Map<string, CaresLinkV1NoteGenerationDurableJobRecord>();
  const attempts = new Map<
    string,
    CaresLinkV1NoteGenerationDurableAttemptRecord
  >();
  const attemptIdsByJob = new Map<string, string[]>();
  const idempotencyIndex = new Map<string, string>();
  const payloadVault = new Map<string, string>();
  const canonicalSnapshots = new Map<
    string,
    CaresLinkV1NoteGenerationCanonicalSnapshot
  >();
  const revisionIds = new Set<string>();

  return {
    async enqueue(input) {
      validateEnqueue(input);
      if (input.payload && payloadCapability !== "TEST_ONLY") {
        throw storageUnavailable();
      }

      const indexKey = idempotencyKey(
        input.ownerUserId,
        input.idempotencyHash,
      );
      const existingId = idempotencyIndex.get(indexKey);
      if (existingId) {
        const existing = requireJob(jobs, existingId);
        if (existing.requestHash !== input.requestHash) {
          throw idempotencyConflict();
        }
        assertNotBefore(input.now, existing.updatedAt);
        return { job: clone(existing), created: false };
      }
      if (jobs.has(input.jobId)) throw idempotencyConflict();

      const job: CaresLinkV1NoteGenerationDurableJobRecord = {
        id: input.jobId,
        ownerUserId: input.ownerUserId,
        admissionSessionId: input.admissionSessionId,
        admissionTransport: input.admissionTransport,
        noteType: input.noteType,
        sourceLocale: input.sourceLocale,
        serviceCode: input.serviceCode,
        contractVersion: input.contractVersion,
        schemaVersion: input.schemaVersion,
        cleanedFactsHash: input.cleanedFactsHash,
        privacyReviewId: input.privacyReviewId,
        idempotencyHash: input.idempotencyHash,
        requestHash: input.requestHash,
        ...(input.payload
          ? {
              payloadHandleHash: sha256(input.payload.handle),
              payloadExpiresAt: input.payload.expiresAt,
            }
          : {}),
        status: "QUEUED",
        attemptCount: 0,
        createdAt: input.now,
        updatedAt: input.now,
      };
      jobs.set(job.id, job);
      attemptIdsByJob.set(job.id, []);
      idempotencyIndex.set(indexKey, job.id);
      if (input.payload) payloadVault.set(job.id, input.payload.handle);
      return { job: clone(job), created: true };
    },

    async findPrivateByIdempotency({ ownerUserId, idempotencyHash }) {
      assertUuid(ownerUserId, "Owner user ID");
      assertSha256(idempotencyHash, "Idempotency hash");
      const jobId = idempotencyIndex.get(
        idempotencyKey(ownerUserId, idempotencyHash),
      );
      return jobId ? clone(requireJob(jobs, jobId)) : undefined;
    },

    async getPrivate({ ownerUserId, jobId }) {
      return clone(requireOwnedJob(jobs, ownerUserId, jobId));
    },

    async getOwnerView({ ownerUserId, jobId }) {
      return toOwnerView(requireOwnedJob(jobs, ownerUserId, jobId));
    },

    async listAttemptsPrivate({ ownerUserId, jobId }) {
      requireOwnedJob(jobs, ownerUserId, jobId);
      return (attemptIdsByJob.get(jobId) ?? []).map((attemptId) =>
        clone(requireAttempt(attempts, attemptId)),
      );
    },

    async claimNext({ workerId, now, leaseDurationMs }) {
      assertSafeWorkerId(workerId);
      assertTimestamp(now, "Claim time");
      assertDuration(leaseDurationMs);
      const claimTime = Date.parse(now);
      const eligible = [...jobs.values()]
        .filter(
          (job) =>
            job.status === "QUEUED" &&
            (!job.nextEligibleAt || Date.parse(job.nextEligibleAt) <= claimTime),
        )
        .sort(compareJobs)[0];
      if (!eligible) return undefined;
      assertNotBefore(now, eligible.createdAt, eligible.updatedAt);

      const payloadHandle = payloadVault.get(eligible.id);
      if (
        payloadCapability !== "TEST_ONLY" ||
        !payloadHandle ||
        !eligible.payloadHandleHash ||
        sha256(payloadHandle) !== eligible.payloadHandleHash ||
        !eligible.payloadExpiresAt ||
        Date.parse(eligible.payloadExpiresAt) <= claimTime
      ) {
        const failed = terminalFailure(eligible, "GENERATION_FAILED", now);
        jobs.set(failed.id, failed);
        payloadVault.delete(failed.id);
        return undefined;
      }

      const attemptId = createId();
      const leaseToken = createLeaseToken();
      assertUuid(attemptId, "Attempt ID");
      assertOpaqueCredential(leaseToken, "Lease token");
      if (attempts.has(attemptId)) throw storageInvariant();
      const leaseExpiresAt = earlierTimestamp(
        addMilliseconds(now, leaseDurationMs),
        eligible.payloadExpiresAt,
      );
      const attempt: CaresLinkV1NoteGenerationDurableAttemptRecord = {
        id: attemptId,
        jobId: eligible.id,
        ownerUserId: eligible.ownerUserId,
        ordinal: eligible.attemptCount + 1,
        workerIdHash: sha256(workerId),
        leaseTokenHash: sha256(leaseToken),
        status: "RUNNING",
        acquiredAt: now,
        renewedAt: now,
        leaseExpiresAt,
      };
      const running: CaresLinkV1NoteGenerationDurableJobRecord = {
        ...eligible,
        status: "RUNNING",
        attemptCount: attempt.ordinal,
        activeAttemptId: attempt.id,
        activeLeaseTokenHash: attempt.leaseTokenHash,
        leaseExpiresAt,
        startedAt: eligible.startedAt ?? now,
        updatedAt: now,
        nextEligibleAt: undefined,
      };
      attempts.set(attempt.id, attempt);
      attemptIdsByJob.get(eligible.id)?.push(attempt.id);
      jobs.set(eligible.id, running);
      return {
        job: clone(running),
        attempt: clone(attempt),
        leaseToken,
      };
    },

    async renewLease({
      jobId,
      attemptId,
      leaseToken,
      now,
      leaseDurationMs,
    }) {
      assertTimestamp(now, "Lease renewal time");
      assertDuration(leaseDurationMs);
      const { job, attempt } = requireActiveLease({
        jobs,
        attempts,
        payloadVault,
        jobId,
        attemptId,
        leaseToken,
        now,
      });
      const leaseExpiresAt = earlierTimestamp(
        addMilliseconds(now, leaseDurationMs),
        job.payloadExpiresAt,
      );
      const renewedAttempt: CaresLinkV1NoteGenerationDurableAttemptRecord = {
        ...attempt,
        renewedAt: now,
        leaseExpiresAt,
      };
      const renewedJob: CaresLinkV1NoteGenerationDurableJobRecord = {
        ...job,
        leaseExpiresAt,
        updatedAt: now,
      };
      attempts.set(attempt.id, renewedAttempt);
      jobs.set(job.id, renewedJob);
      return {
        job: clone(renewedJob),
        attempt: clone(renewedAttempt),
        leaseToken,
      };
    },

    async authorizePayloadUse({
      jobId,
      attemptId,
      leaseToken,
      privacyBinding,
      sessionBinding,
      contractVersion,
      schemaVersion,
      now,
    }) {
      assertTimestamp(now, "Payload authorization time");
      const { job, attempt, payloadHandle } = requireActiveLease({
        jobs,
        attempts,
        payloadVault,
        jobId,
        attemptId,
        leaseToken,
        now,
      });
      try {
        assertExactAuthority({
          job,
          privacyBinding,
          sessionBinding,
          contractVersion,
          schemaVersion,
          now,
        });
      } catch (error) {
        const failureCode = authorityFailureCode(error);
        const failedAttempt: CaresLinkV1NoteGenerationDurableAttemptRecord = {
          ...attempt,
          status: "FAILED",
          finishedAt: now,
          failureCode,
        };
        const failedJob = terminalFailure(job, failureCode, now);
        attempts.set(attempt.id, failedAttempt);
        jobs.set(job.id, failedJob);
        payloadVault.delete(job.id);
        throw error;
      }
      const authorizedAttempt: CaresLinkV1NoteGenerationDurableAttemptRecord = {
        ...attempt,
        payloadAuthorizedAt: now,
      };
      attempts.set(attempt.id, authorizedAttempt);
      return {
        job: clone(job),
        attempt: clone(authorizedAttempt),
        payloadHandle,
      };
    },

    async failAttempt({
      jobId,
      attemptId,
      leaseToken,
      failureCode,
      now,
    }) {
      assertTimestamp(now, "Attempt failure time");
      assertFailureCode(failureCode);
      const { job, attempt } = requireActiveLease({
        jobs,
        attempts,
        payloadVault,
        jobId,
        attemptId,
        leaseToken,
        now,
      });
      const failedAttempt: CaresLinkV1NoteGenerationDurableAttemptRecord = {
        ...attempt,
        status: "FAILED",
        finishedAt: now,
        failureCode,
      };
      const failedJob = terminalFailure(job, failureCode, now);
      attempts.set(attempt.id, failedAttempt);
      jobs.set(job.id, failedJob);
      payloadVault.delete(job.id);
      return clone(failedJob);
    },

    async cancel({ ownerUserId, jobId, now }) {
      assertTimestamp(now, "Cancellation time");
      const current = requireOwnedJob(jobs, ownerUserId, jobId);
      const activeAttempt = current.activeAttemptId
        ? requireAttempt(attempts, current.activeAttemptId)
        : undefined;
      assertNotBefore(
        now,
        current.updatedAt,
        activeAttempt?.acquiredAt,
        activeAttempt?.renewedAt,
        activeAttempt?.payloadAuthorizedAt,
      );
      if (current.status === "CANCELLED") return clone(current);
      if (current.status === "SUCCEEDED" || current.status === "FAILED") {
        throw invalidTransition("Completed generation jobs cannot be cancelled");
      }
      if (activeAttempt) {
        attempts.set(activeAttempt.id, {
          ...activeAttempt,
          status: "CANCELLED",
          finishedAt: now,
        });
      }
      const cancelled: CaresLinkV1NoteGenerationDurableJobRecord = {
        ...clearLease(current),
        status: "CANCELLED",
        updatedAt: now,
        finishedAt: now,
      };
      jobs.set(current.id, cancelled);
      payloadVault.delete(current.id);
      return clone(cancelled);
    },

    async recoverExpired({ now, requeueAt, maxAttempts }) {
      assertTimestamp(now, "Recovery time");
      assertTimestamp(requeueAt, "Recovery eligibility time");
      if (Date.parse(requeueAt) < Date.parse(now)) {
        throw validationError("Recovery eligibility cannot precede recovery");
      }
      if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
        throw validationError("Maximum attempts must be a positive integer");
      }
      const recoveryTime = Date.parse(now);
      const recovered: CaresLinkV1NoteGenerationDurableRecovery[] = [];
      for (const current of jobs.values()) {
        if (
          current.status !== "RUNNING" ||
          !current.activeAttemptId ||
          !current.leaseExpiresAt ||
          Date.parse(current.leaseExpiresAt) > recoveryTime
        ) {
          continue;
        }
        assertNotBefore(now, current.updatedAt);
        const attempt = requireAttempt(attempts, current.activeAttemptId);
        attempts.set(attempt.id, {
          ...attempt,
          status: "LEASE_EXPIRED",
          finishedAt: now,
        });
        const payloadHandle = payloadVault.get(current.id);
        const payloadReusable = Boolean(
          payloadHandle &&
            current.payloadHandleHash &&
            sha256(payloadHandle) === current.payloadHandleHash &&
            current.payloadExpiresAt &&
            Date.parse(current.payloadExpiresAt) > Date.parse(requeueAt),
        );
        const exhausted =
          current.attemptCount >= maxAttempts || !payloadReusable;
        const next = exhausted
          ? terminalFailure(current, "GENERATION_FAILED", now)
          : {
              ...clearLease(current),
              status: "QUEUED" as const,
              updatedAt: now,
              nextEligibleAt: requeueAt,
            };
        jobs.set(current.id, next);
        if (exhausted) payloadVault.delete(current.id);
        recovered.push({
          jobId: current.id,
          expiredAttemptId: attempt.id,
          outcome: exhausted ? "FAILED" : "REQUEUED",
        });
      }
      return clone(recovered);
    },

    async commitCanonicalSuccess({
      jobId,
      attemptId,
      leaseToken,
      privacyBinding,
      sessionBinding,
      contractVersion,
      schemaVersion,
      snapshot,
      result,
      now,
    }) {
      assertTimestamp(now, "Canonical commit time");
      const existing = requireJob(jobs, jobId);
      if (existing.status === "SUCCEEDED") {
        const attempt = requireAttempt(attempts, attemptId);
        assertSuccessfulReplay({
          existing,
          attempt,
          leaseToken,
          privacyBinding,
          sessionBinding,
          contractVersion,
          schemaVersion,
          snapshot,
          result,
          now,
          canonicalSnapshots,
        });
        return clone(existing);
      }
      const { job, attempt } = requireActiveLease({
        jobs,
        attempts,
        payloadVault,
        jobId,
        attemptId,
        leaseToken,
        now,
      });
      if (!attempt.payloadAuthorizedAt) {
        throw new CaresLinkV1ContractError(
          "GENERATION_FAILED",
          "Generation payload use was not authorized",
        );
      }
      assertExactAuthority({
        job,
        privacyBinding,
        sessionBinding,
        contractVersion,
        schemaVersion,
        now,
      });
      assertCanonicalResult(job, snapshot, result);
      if (
        canonicalSnapshots.has(result.canonicalId) ||
        revisionIds.has(result.revisionId)
      ) {
        throw idempotencyConflict();
      }

      const succeededAttempt: CaresLinkV1NoteGenerationDurableAttemptRecord = {
        ...attempt,
        status: "SUCCEEDED",
        finishedAt: now,
      };
      const succeededJob: CaresLinkV1NoteGenerationDurableJobRecord = {
        ...clearLease(job),
        status: "SUCCEEDED",
        result: clone(result),
        updatedAt: now,
        finishedAt: now,
      };

      // This synchronous mutation region models one transaction: canonical
      // document + revision 1 + attempt + job become visible together.
      canonicalSnapshots.set(result.canonicalId, clone(snapshot));
      revisionIds.add(result.revisionId);
      attempts.set(attempt.id, succeededAttempt);
      jobs.set(job.id, succeededJob);
      payloadVault.delete(job.id);
      return clone(succeededJob);
    },

    async getCanonicalSnapshot({ ownerUserId, canonicalId }) {
      assertUuid(ownerUserId, "Owner user ID");
      assertUuid(canonicalId, "Canonical document ID");
      const snapshot = canonicalSnapshots.get(canonicalId);
      if (!snapshot || snapshot.document.ownerUserId !== ownerUserId) {
        return undefined;
      }
      return clone(snapshot);
    },
  };
}

function validateEnqueue(input: CaresLinkV1NoteGenerationDurableEnqueueInput) {
  assertUuid(input.jobId, "Generation job ID");
  assertUuid(input.ownerUserId, "Owner user ID");
  assertUuid(input.admissionSessionId, "Admission session ID");
  assertUuid(input.privacyReviewId, "Privacy review ID");
  if (
    input.admissionTransport !== "BEARER" &&
    input.admissionTransport !== "COOKIE"
  ) {
    throw validationError("Admission transport is invalid");
  }
  if (input.contractVersion !== CARESLINK_V1_CONTRACT_VERSION) {
    throw validationError("Contract version is unsupported");
  }
  if (input.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION) {
    throw validationError("Note schema version is unsupported");
  }
  if (!isCaresLinkV1Locale(input.sourceLocale)) {
    throw validationError("Source locale is unsupported");
  }
  if (
    !(CARESLINK_V1_NOTE_TYPE_CODES as readonly string[]).includes(
      input.noteType,
    )
  ) {
    throw validationError("Note type is unsupported");
  }
  const noteType = getCaresLinkV1NoteType(input.noteType);
  if (noteType.generationServiceCode !== input.serviceCode) {
    throw validationError("Generation service does not match the Note type");
  }
  assertSha256(input.cleanedFactsHash, "Cleaned facts hash");
  assertSha256(input.idempotencyHash, "Idempotency hash");
  assertSha256(input.requestHash, "Request hash");
  assertTimestamp(input.now, "Enqueue time");
  if (input.payload) {
    assertOpaqueCredential(input.payload.handle, "Payload handle");
    assertTimestamp(input.payload.expiresAt, "Payload expiry");
    if (Date.parse(input.payload.expiresAt) <= Date.parse(input.now)) {
      throw validationError("Payload must expire after enqueue time");
    }
  }
}

function requireActiveLease(input: Readonly<{
  jobs: Map<string, CaresLinkV1NoteGenerationDurableJobRecord>;
  attempts: Map<string, CaresLinkV1NoteGenerationDurableAttemptRecord>;
  payloadVault: Map<string, string>;
  jobId: string;
  attemptId: string;
  leaseToken: string;
  now: string;
}>) {
  assertUuid(input.jobId, "Generation job ID");
  assertUuid(input.attemptId, "Attempt ID");
  assertOpaqueCredential(input.leaseToken, "Lease token");
  const job = requireJob(input.jobs, input.jobId);
  const attempt = requireAttempt(input.attempts, input.attemptId);
  assertNotBefore(
    input.now,
    job.updatedAt,
    attempt.acquiredAt,
    attempt.renewedAt,
    attempt.payloadAuthorizedAt,
  );
  const leaseTokenHash = sha256(input.leaseToken);
  if (
    job.status !== "RUNNING" ||
    attempt.status !== "RUNNING" ||
    job.activeAttemptId !== attempt.id ||
    job.activeLeaseTokenHash !== leaseTokenHash ||
    attempt.leaseTokenHash !== leaseTokenHash ||
    attempt.jobId !== job.id ||
    attempt.ownerUserId !== job.ownerUserId ||
    !job.leaseExpiresAt ||
    job.leaseExpiresAt !== attempt.leaseExpiresAt ||
    Date.parse(job.leaseExpiresAt) <= Date.parse(input.now) ||
    !job.payloadExpiresAt ||
    Date.parse(job.payloadExpiresAt) <= Date.parse(input.now)
  ) {
    throw leaseLost();
  }
  const payloadHandle = input.payloadVault.get(job.id);
  if (
    !payloadHandle ||
    !job.payloadHandleHash ||
    sha256(payloadHandle) !== job.payloadHandleHash
  ) {
    throw storageUnavailable();
  }
  return { job, attempt, payloadHandle };
}

function assertExactAuthority(input: Readonly<{
  job: CaresLinkV1NoteGenerationDurableJobRecord;
  privacyBinding: CaresLinkV1NoteGenerationPrivacyCommitBinding;
  sessionBinding: CaresLinkV1NoteGenerationSessionCommitBinding;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  now: string;
}>) {
  const { job, privacyBinding, sessionBinding } = input;
  if (
    sessionBinding.principal.userId !== job.ownerUserId ||
    sessionBinding.principal.sessionId !== job.admissionSessionId ||
    sessionBinding.principal.transport !== job.admissionTransport
  ) {
    throw new CaresLinkV1ContractError(
      "SESSION_REVOKED",
      "Session commit authority does not match the generation job",
    );
  }
  if (
    input.contractVersion !== job.contractVersion ||
    input.schemaVersion !== job.schemaVersion ||
    privacyBinding.ownerUserId !== job.ownerUserId ||
    privacyBinding.privacyReviewId !== job.privacyReviewId ||
    privacyBinding.noteType !== job.noteType ||
    privacyBinding.cleanedFactsHash !== job.cleanedFactsHash ||
    privacyBinding.schemaVersion !== job.schemaVersion ||
    sessionBinding.checkedAt !== privacyBinding.checkedAt ||
    sessionBinding.checkedAt !== input.now
  ) {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_STALE",
      "Commit authority does not match the generation job",
    );
  }
}

function authorityFailureCode(
  error: unknown,
): Extract<
  CaresLinkV1NoteGenerationFailureCode,
  "SESSION_REVOKED" | "PRIVACY_REVIEW_STALE"
> {
  return error instanceof CaresLinkV1ContractError &&
    error.code === "SESSION_REVOKED"
    ? "SESSION_REVOKED"
    : "PRIVACY_REVIEW_STALE";
}

function assertCanonicalResult(
  job: CaresLinkV1NoteGenerationDurableJobRecord,
  snapshot: CaresLinkV1NoteGenerationCanonicalSnapshot,
  result: CaresLinkV1NoteGenerationResult,
) {
  assertUuid(result.canonicalId, "Canonical document ID");
  assertUuid(result.revisionId, "Document revision ID");
  assertSha256(result.contentHash, "Canonical content hash");
  const { document, revision } = snapshot;
  if (
    result.revisionNumber !== 1 ||
    result.baseRevisionId !== null ||
    result.saveState !== "SERVER_ACKNOWLEDGED" ||
    document.id !== result.canonicalId ||
    document.currentRevisionId !== result.revisionId ||
    document.currentRevisionNumber !== 1 ||
    document.lifecycleStatus !== "IN_PROGRESS" ||
    document.ownerUserId !== job.ownerUserId ||
    document.noteType !== job.noteType ||
    document.sourceLocale !== job.sourceLocale ||
    document.contractVersion !== job.contractVersion ||
    document.schemaVersion !== job.schemaVersion ||
    revision.id !== result.revisionId ||
    revision.documentId !== result.canonicalId ||
    revision.ownerUserId !== job.ownerUserId ||
    revision.revisionNumber !== 1 ||
    Object.hasOwn(revision, "baseRevisionId") ||
    revision.privacyReviewId !== job.privacyReviewId ||
    revision.contentHash !== result.contentHash ||
    revision.mutationId !== `note-generation:${sha256(job.id)}` ||
    revision.contractVersion !== job.contractVersion ||
    revision.schemaVersion !== job.schemaVersion
  ) {
    throw validationError("Canonical result does not match the generation job");
  }
  if (
    scanCaresLinkV1CleanedFacts(
      revision.content.factsSummary as CaresLinkV1JsonObject,
    ).cleanedFactsHash !== job.cleanedFactsHash
  ) {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_STALE",
      "Canonical facts do not match the reviewed facts",
    );
  }
  const candidate: CaresLinkV1NoteProviderCandidate = {
    englishDraft: revision.content.englishDraft,
    reviewVersions: revision.content.reviewVersions,
    missingFacts: revision.content.missingFacts,
    neutralWordingChecks: revision.content.neutralWordingChecks,
    followUpPrompts: revision.content.followUpPrompts,
  };
  const rebuilt = buildCaresLinkV1CanonicalNoteContent(
    job.noteType,
    revision.content.factsSummary,
    candidate,
  );
  if (
    rebuilt.contentHash !== result.contentHash ||
    stringifyCaresLinkV1CanonicalJson(rebuilt.content) !==
      stringifyCaresLinkV1CanonicalJson(revision.content)
  ) {
    throw validationError("Canonical content is invalid");
  }
}

function assertSuccessfulReplay(input: Readonly<{
  existing: CaresLinkV1NoteGenerationDurableJobRecord;
  attempt: CaresLinkV1NoteGenerationDurableAttemptRecord;
  leaseToken: string;
  privacyBinding: CaresLinkV1NoteGenerationPrivacyCommitBinding;
  sessionBinding: CaresLinkV1NoteGenerationSessionCommitBinding;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  snapshot: CaresLinkV1NoteGenerationCanonicalSnapshot;
  result: CaresLinkV1NoteGenerationResult;
  now: string;
  canonicalSnapshots: Map<
    string,
    CaresLinkV1NoteGenerationCanonicalSnapshot
  >;
}>) {
  assertOpaqueCredential(input.leaseToken, "Lease token");
  const result = input.existing.result;
  const storedSnapshot = result
    ? input.canonicalSnapshots.get(result.canonicalId)
    : undefined;
  if (
    input.attempt.jobId !== input.existing.id ||
    input.attempt.ownerUserId !== input.existing.ownerUserId ||
    input.attempt.status !== "SUCCEEDED" ||
    !input.attempt.payloadAuthorizedAt ||
    input.attempt.leaseTokenHash !== sha256(input.leaseToken) ||
    !result ||
    !storedSnapshot
  ) {
    throw idempotencyConflict();
  }
  if (
    stringifyCaresLinkV1CanonicalJson(result) !==
      stringifyCaresLinkV1CanonicalJson(input.result) ||
    stringifyCaresLinkV1CanonicalJson(storedSnapshot) !==
      stringifyCaresLinkV1CanonicalJson(input.snapshot)
  ) {
    throw idempotencyConflict();
  }
  assertNotBefore(
    input.now,
    input.existing.updatedAt,
    input.existing.finishedAt,
    input.attempt.renewedAt,
    input.attempt.finishedAt,
  );
  assertExactAuthority({
    job: input.existing,
    privacyBinding: input.privacyBinding,
    sessionBinding: input.sessionBinding,
    contractVersion: input.contractVersion,
    schemaVersion: input.schemaVersion,
    now: input.now,
  });
  assertCanonicalResult(input.existing, input.snapshot, input.result);
}

function toOwnerView(
  job: CaresLinkV1NoteGenerationDurableJobRecord,
): CaresLinkV1NoteGenerationDurableOwnerView {
  return clone({
    jobId: job.id,
    status: job.status,
    noteType: job.noteType,
    serviceCode: job.serviceCode,
    attemptCount: job.attemptCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    ...(job.failureCode ? { failureCode: job.failureCode } : {}),
    ...(job.result ? { result: job.result } : {}),
  });
}

function terminalFailure(
  job: CaresLinkV1NoteGenerationDurableJobRecord,
  failureCode: CaresLinkV1NoteGenerationFailureCode,
  now: string,
): CaresLinkV1NoteGenerationDurableJobRecord {
  return {
    ...clearLease(job),
    status: "FAILED",
    failureCode,
    updatedAt: now,
    finishedAt: now,
  };
}

function clearLease(
  job: CaresLinkV1NoteGenerationDurableJobRecord,
): CaresLinkV1NoteGenerationDurableJobRecord {
  const next = { ...job } as {
    -readonly [K in keyof CaresLinkV1NoteGenerationDurableJobRecord]:
      CaresLinkV1NoteGenerationDurableJobRecord[K];
  };
  delete next.activeAttemptId;
  delete next.activeLeaseTokenHash;
  delete next.leaseExpiresAt;
  return next;
}

function requireOwnedJob(
  jobs: Map<string, CaresLinkV1NoteGenerationDurableJobRecord>,
  ownerUserId: string,
  jobId: string,
) {
  assertUuid(ownerUserId, "Owner user ID");
  assertUuid(jobId, "Generation job ID");
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== ownerUserId) {
    throw new CaresLinkV1ContractError(
      "NOT_FOUND",
      "The requested generation job was not found",
    );
  }
  return job;
}

function requireJob(
  jobs: Map<string, CaresLinkV1NoteGenerationDurableJobRecord>,
  jobId: string,
) {
  const job = jobs.get(jobId);
  if (!job) throw storageInvariant();
  return job;
}

function requireAttempt(
  attempts: Map<string, CaresLinkV1NoteGenerationDurableAttemptRecord>,
  attemptId: string,
) {
  const attempt = attempts.get(attemptId);
  if (!attempt) throw leaseLost();
  return attempt;
}

function compareJobs(
  left: CaresLinkV1NoteGenerationDurableJobRecord,
  right: CaresLinkV1NoteGenerationDurableJobRecord,
) {
  return (
    Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function assertUuid(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw validationError(`${label} is invalid`);
  }
}

function assertSha256(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw validationError(`${label} is invalid`);
  }
}

function assertTimestamp(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw validationError(`${label} is invalid`);
  }
}

function assertNotBefore(now: string, ...earlier: (string | undefined)[]) {
  const nowMs = Date.parse(now);
  if (earlier.some((value) => value && Date.parse(value) > nowMs)) {
    throw validationError("Transaction time cannot move backwards");
  }
}

function assertDuration(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw validationError("Lease duration must be a positive integer");
  }
}

function assertSafeWorkerId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw validationError("Worker ID is invalid");
  }
}

function assertOpaqueCredential(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/.test(value)
  ) {
    throw validationError(`${label} is invalid`);
  }
}

function assertFailureCode(value: CaresLinkV1NoteGenerationFailureCode) {
  if (
    ![
      "AUTH_REQUIRED",
      "SESSION_REVOKED",
      "PRIVACY_REVIEW_REQUIRED",
      "PRIVACY_REVIEW_STALE",
      "MINIMUM_FACTS_REQUIRED",
      "GENERATION_FAILED",
    ].includes(value)
  ) {
    throw validationError("Generation failure code is invalid");
  }
}

function addMilliseconds(timestamp: string, durationMs: number) {
  const result = Date.parse(timestamp) + durationMs;
  if (!Number.isFinite(result)) throw validationError("Lease expiry is invalid");
  return new Date(result).toISOString();
}

function earlierTimestamp(left: string, right: string | undefined) {
  return right && Date.parse(right) < Date.parse(left) ? right : left;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function idempotencyKey(ownerUserId: string, idempotencyHash: string) {
  return `${ownerUserId}:${idempotencyHash}`;
}

function validationError(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}

function invalidTransition(message: string) {
  return new CaresLinkV1ContractError("INVALID_STATE_TRANSITION", message);
}

function idempotencyConflict() {
  return new CaresLinkV1ContractError(
    "IDEMPOTENCY_CONFLICT",
    "Generation identity was already used for different input",
  );
}

function leaseLost() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Generation lease is no longer active",
  );
}

function storageUnavailable() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Generation payload storage is unavailable",
  );
}

function storageInvariant() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Generation storage is unavailable",
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
