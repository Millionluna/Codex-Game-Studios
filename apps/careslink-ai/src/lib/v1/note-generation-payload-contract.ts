import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { scanCaresLinkV1CleanedFacts } from "./privacy-review-scanner.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CaresLinkV1ContractError,
  isCaresLinkV1Locale,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1CleanedFacts,
  type CaresLinkV1JsonObject,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";
import type {
  CaresLinkV1AuthenticatedPrincipal,
  CaresLinkV1AuthTransport,
} from "./transport-contract";

/**
 * Source-only policy contract. No payload backend, encryption profile,
 * retention duration, route, worker or database adapter is configured.
 */
export const CARESLINK_V1_NOTE_GENERATION_PAYLOAD_RETENTION_READY =
  false as const;

/**
 * Deliberately undefined: a caller may not inherit a guessed TTL, key system,
 * region, backup disposition or provider from this source-only module.
 */
export const CARESLINK_V1_NOTE_GENERATION_PAYLOAD_CURRENT_POLICY:
  | CaresLinkV1NoteGenerationPayloadPolicy
  | undefined = undefined;

export const CARESLINK_V1_NOTE_GENERATION_PAYLOAD_ACTIVATION_BLOCKERS = [
  "RETENTION_VALUES_NOT_APPROVED",
  "VAULT_AND_KEY_MANAGEMENT_NOT_CONFIGURED",
  "PURGE_AND_BACKUP_NON_RESURRECTION_NOT_VERIFIED",
  "ACCOUNT_DELETION_FANOUT_NOT_IMPLEMENTED",
  "FRESH_SESSION_PRIVACY_GRANT_NOT_VERIFIED",
  "PURGE_OPERATOR_AUTHORIZATION_NOT_IMPLEMENTED",
] as const;

export type CaresLinkV1NoteGenerationPayloadPolicy = Readonly<{
  /** Versioned product/security decision. This module defines no value. */
  policyVersion: string;
  /** Provider-neutral encryption profile identifier; no algorithm is guessed. */
  encryptionProfileVersion: string;
  /** Provider-neutral backup/deletion disposition; no backend is selected. */
  backupDispositionVersion: string;
}>;

export const CARESLINK_V1_NOTE_GENERATION_PAYLOAD_STATES = [
  "STAGED",
  "AVAILABLE",
  "REVOKED",
  "PURGE_PENDING",
  "PURGED",
  "PURGE_FAILED",
] as const;

export type CaresLinkV1NoteGenerationPayloadState =
  (typeof CARESLINK_V1_NOTE_GENERATION_PAYLOAD_STATES)[number];

export const CARESLINK_V1_NOTE_GENERATION_PAYLOAD_GRANT_STATUSES = [
  "ISSUED",
  "CONSUMED",
  "REVOKED",
  "EXPIRED",
] as const;

export type CaresLinkV1NoteGenerationPayloadGrantStatus =
  (typeof CARESLINK_V1_NOTE_GENERATION_PAYLOAD_GRANT_STATUSES)[number];

export const CARESLINK_V1_NOTE_GENERATION_PAYLOAD_REVOKE_REASONS = [
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "LEASE_EXHAUSTED",
  "EXPIRED",
  "ACCOUNT_DELETION",
  "ORPHAN",
  "CORRUPT_PAYLOAD",
] as const;

export type CaresLinkV1NoteGenerationPayloadRevokeReason =
  (typeof CARESLINK_V1_NOTE_GENERATION_PAYLOAD_REVOKE_REASONS)[number];

export type CaresLinkV1NoteGenerationPayloadMetadata = Readonly<{
  payloadId: string;
  jobId: string;
  ownerUserId: string;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  privacyReviewId: string;
  privacyProofExpiresAt: string;
  cleanedFactsHash: string;
  requestHash: string;
  policyVersion: string;
  encryptionProfileVersion: string;
  backupDispositionVersion: string;
  /**
   * Digest of the immutable policy identifiers. Absolute payload/proof expiry
   * remains separately persisted and request-fingerprint-bound so one approved
   * worker registration can process multiple jobs without weakening expiry.
   */
  policySnapshotHash: string;
  /** Digest only. The locator is private to the vault implementation. */
  payloadHandleHash: string;
  state: CaresLinkV1NoteGenerationPayloadState;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  availableAt?: string;
  revokedAt?: string;
  revokeReason?: CaresLinkV1NoteGenerationPayloadRevokeReason;
  purgeRequestedAt?: string;
  purgedAt?: string;
  purgeAttemptCount: number;
  shadowOnly: true;
}>;

export type CaresLinkV1NoteGenerationPayloadGrantRecord = Readonly<{
  grantId: string;
  payloadId: string;
  jobId: string;
  ownerUserId: string;
  attemptId: string;
  leaseTokenHash: string;
  requestHash: string;
  status: CaresLinkV1NoteGenerationPayloadGrantStatus;
  authorizedAt: string;
  expiresAt: string;
  consumedAt?: string;
  revokedAt?: string;
}>;

/** Safe worker result. It contains neither facts nor a vault locator. */
export type CaresLinkV1NoteGenerationPayloadGrant = Readonly<{
  grantId: string;
  expiresAt: string;
}>;

/** Owner-safe status: no owner, proof, digest, locator, lease or grant data. */
export type CaresLinkV1NoteGenerationPayloadOwnerView = Readonly<{
  jobId: string;
  availability: "PENDING" | "UNAVAILABLE";
  updatedAt: string;
}>;

export type CaresLinkV1NoteGenerationPayloadPurgeOutcome =
  | "PENDING"
  | "RETRY_REQUIRED"
  | "PURGED";

/** Content-free purge evidence. Raw IDs and backend errors are excluded. */
export type CaresLinkV1NoteGenerationPayloadPurgeReceipt = Readonly<{
  eventReferenceHash: string;
  payloadReferenceHash: string;
  policyVersion: string;
  reason: CaresLinkV1NoteGenerationPayloadRevokeReason;
  requestedAt: string;
  outcome: CaresLinkV1NoteGenerationPayloadPurgeOutcome;
  attemptCount: number;
  completedAt?: string;
}>;

export type CaresLinkV1NoteGenerationPayloadStageInput = Readonly<{
  payloadId: string;
  jobId: string;
  ownerUserId: string;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  privacyReviewId: string;
  privacyProofExpiresAt: string;
  cleanedFacts: unknown;
  cleanedFactsHash: string;
  requestHash: string;
  /** Explicit TEST_ONLY snapshot; no current policy is defined by this module. */
  policy: CaresLinkV1NoteGenerationPayloadPolicy;
  /**
   * Deterministic fake input only. A future adapter must derive this from an
   * approved server-owned policy and the database clock, never a request body.
   */
  expiresAt: string;
  now: string;
}>;

export type CaresLinkV1NoteGenerationPayloadJobBinding = Readonly<{
  jobId: string;
  ownerUserId: string;
  admissionSessionId: string;
  admissionTransport: CaresLinkV1AuthTransport;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  privacyReviewId: string;
  cleanedFactsHash: string;
  requestHash: string;
  status: "RUNNING";
  activeAttemptId: string;
  activeLeaseTokenHash: string;
  leaseExpiresAt: string;
}>;

export type CaresLinkV1NoteGenerationPayloadAttemptBinding = Readonly<{
  attemptId: string;
  jobId: string;
  ownerUserId: string;
  status: "RUNNING";
  leaseTokenHash: string;
  leaseExpiresAt: string;
}>;

export type CaresLinkV1NoteGenerationPayloadSessionBinding = Readonly<{
  principal: CaresLinkV1AuthenticatedPrincipal;
  checkedAt: string;
}>;

export type CaresLinkV1NoteGenerationPayloadPrivacyBinding = Readonly<{
  ownerUserId: string;
  privacyReviewId: string;
  noteType: CaresLinkV1NoteTypeCode;
  cleanedFactsHash: string;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  status: "CONFIRMED";
  expiresAt: string;
  checkedAt: string;
}>;

export type CaresLinkV1NoteGenerationPayloadRepository = Readonly<{
  stageCanonicalFacts(
    input: CaresLinkV1NoteGenerationPayloadStageInput,
  ): Promise<Readonly<{
    metadata: CaresLinkV1NoteGenerationPayloadMetadata;
    created: boolean;
  }>>;
  activate(input: Readonly<{
    payloadId: string;
    jobId: string;
    ownerUserId: string;
    requestHash: string;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadMetadata>;
  abortOrphan(input: Readonly<{
    payloadId: string;
    jobId: string;
    ownerUserId: string;
    requestHash: string;
    purgeEventId: string;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadPurgeReceipt>;
  authorizeAttempt(input: Readonly<{
    payloadId: string;
    leaseToken: string;
    job: CaresLinkV1NoteGenerationPayloadJobBinding;
    attempt: CaresLinkV1NoteGenerationPayloadAttemptBinding;
    session: CaresLinkV1NoteGenerationPayloadSessionBinding;
    privacy: CaresLinkV1NoteGenerationPayloadPrivacyBinding;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadGrant>;
  consumeAttemptGrant(input: Readonly<{
    grantId: string;
    payloadId: string;
    leaseToken: string;
    job: CaresLinkV1NoteGenerationPayloadJobBinding;
    attempt: CaresLinkV1NoteGenerationPayloadAttemptBinding;
    /**
     * A future durable adapter must live-read these bindings inside the short
     * payload-release transaction. The memory fake proves shape only.
     */
    session: CaresLinkV1NoteGenerationPayloadSessionBinding;
    privacy: CaresLinkV1NoteGenerationPayloadPrivacyBinding;
    now: string;
  }>): Promise<CaresLinkV1CleanedFacts>;
  revoke(input: Readonly<{
    payloadId: string;
    ownerUserId: string;
    reason: CaresLinkV1NoteGenerationPayloadRevokeReason;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadMetadata>;
  requestPurge(input: Readonly<{
    payloadId: string;
    ownerUserId: string;
    reason: CaresLinkV1NoteGenerationPayloadRevokeReason;
    purgeEventId: string;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadPurgeReceipt>;
  purge(input: Readonly<{
    payloadId: string;
    ownerUserId: string;
    reason: CaresLinkV1NoteGenerationPayloadRevokeReason;
    purgeEventId: string;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadPurgeReceipt>;
  getPrivate(input: Readonly<{
    payloadId: string;
    ownerUserId: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadMetadata>;
  getGrantPrivate(input: Readonly<{
    grantId: string;
    ownerUserId: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadGrantRecord>;
  getOwnerView(input: Readonly<{
    jobId: string;
    ownerUserId: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadOwnerView>;
  /**
   * Server-internal operator lookup only. A future route or worker adapter must
   * add an explicitly reviewed service-actor authorization boundary.
   */
  getPurgeReceipt(input: Readonly<{
    purgeEventId: string;
  }>): Promise<CaresLinkV1NoteGenerationPayloadPurgeReceipt | undefined>;
}>;

/** Additional fault injection exists only on the explicitly TEST_ONLY fake. */
export type CaresLinkV1NoteGenerationPayloadTestRepository =
  CaresLinkV1NoteGenerationPayloadRepository &
    Readonly<{
      TEST_ONLY_corruptStoredFacts(input: Readonly<{
        payloadId: string;
        ownerUserId: string;
        cleanedFacts: unknown;
      }>): Promise<void>;
    }>;

/**
 * Plain in-memory behavioral fake. It is not encrypted, durable, backed up or
 * suitable for Preview/Production. The explicit capability prevents fallback.
 */
export function createTestOnlyMemoryCaresLinkV1NoteGenerationPayloadRepository(
  options: Readonly<{
    capability: "TEST_ONLY";
    createId?: () => string;
    createHandle?: () => string;
    shouldFailPurgeAttempt?: (input: Readonly<{
      payloadId: string;
      attemptCount: number;
    }>) => boolean;
  }>,
): CaresLinkV1NoteGenerationPayloadTestRepository {
  if (options.capability !== "TEST_ONLY") throw unavailable();
  return createMemoryRepository(options);
}

type StoredPayload = {
  metadata: CaresLinkV1NoteGenerationPayloadMetadata;
  cleanedFacts?: CaresLinkV1CleanedFacts;
  handle?: string;
  stageFingerprint: string;
};

type StoredPurge = {
  payloadId: string;
  ownerUserId: string;
  reason: CaresLinkV1NoteGenerationPayloadRevokeReason;
  receipt: CaresLinkV1NoteGenerationPayloadPurgeReceipt;
};

function createMemoryRepository({
  createId = randomUUID,
  createHandle = randomUUID,
  shouldFailPurgeAttempt = () => false,
}: Readonly<{
  capability: "TEST_ONLY";
  createId?: () => string;
  createHandle?: () => string;
  shouldFailPurgeAttempt?: (input: Readonly<{
    payloadId: string;
    attemptCount: number;
  }>) => boolean;
}>): CaresLinkV1NoteGenerationPayloadTestRepository {
  const payloads = new Map<string, StoredPayload>();
  const payloadIdByJob = new Map<string, string>();
  const grants = new Map<string, CaresLinkV1NoteGenerationPayloadGrantRecord>();
  const grantIdByAttempt = new Map<string, string>();
  const purges = new Map<string, StoredPurge>();

  const repository: CaresLinkV1NoteGenerationPayloadTestRepository = {
    async stageCanonicalFacts(input) {
      const prepared = prepareStage(input);
      const existing = payloads.get(input.payloadId);
      const existingJobPayloadId = payloadIdByJob.get(input.jobId);
      if (existing || existingJobPayloadId) {
        const replay = existing ?? payloads.get(existingJobPayloadId ?? "");
        if (
          !replay ||
          replay.metadata.payloadId !== input.payloadId ||
          replay.stageFingerprint !== prepared.stageFingerprint
        ) {
          throw idempotencyConflict();
        }
        assertNotBefore(input.now, replay.metadata.updatedAt);
        return { metadata: clone(replay.metadata), created: false };
      }

      const handle = createHandle();
      assertOpaqueNonUrl(handle, "Payload locator");
      const metadata: CaresLinkV1NoteGenerationPayloadMetadata = {
        payloadId: input.payloadId,
        jobId: input.jobId,
        ownerUserId: input.ownerUserId,
        noteType: input.noteType,
        sourceLocale: input.sourceLocale,
        contractVersion: input.contractVersion,
        schemaVersion: input.schemaVersion,
        privacyReviewId: input.privacyReviewId,
        privacyProofExpiresAt: input.privacyProofExpiresAt,
        cleanedFactsHash: prepared.cleanedFactsHash,
        requestHash: input.requestHash,
        policyVersion: input.policy.policyVersion,
        encryptionProfileVersion: input.policy.encryptionProfileVersion,
        backupDispositionVersion: input.policy.backupDispositionVersion,
        policySnapshotHash: prepared.policySnapshotHash,
        payloadHandleHash: sha256(handle),
        state: "STAGED",
        createdAt: input.now,
        updatedAt: input.now,
        expiresAt: input.expiresAt,
        purgeAttemptCount: 0,
        shadowOnly: true,
      };
      payloads.set(input.payloadId, {
        metadata,
        cleanedFacts: clone(prepared.cleanedFacts),
        handle,
        stageFingerprint: prepared.stageFingerprint,
      });
      payloadIdByJob.set(input.jobId, input.payloadId);
      return { metadata: clone(metadata), created: true };
    },

    async activate({ payloadId, jobId, ownerUserId, requestHash, now }) {
      assertTimestamp(now, "Activation time");
      const stored = requireOwnedPayload(payloads, payloadId, ownerUserId);
      assertExactPayloadBinding(stored.metadata, { jobId, requestHash });
      assertNotBefore(now, stored.metadata.updatedAt);
      if (stored.metadata.state === "AVAILABLE") return clone(stored.metadata);
      if (stored.metadata.state !== "STAGED") throw invalidTransition();
      assertUsableBeforeExpiry(stored.metadata, now);
      stored.metadata = {
        ...stored.metadata,
        state: "AVAILABLE",
        availableAt: now,
        updatedAt: now,
      };
      return clone(stored.metadata);
    },

    async abortOrphan({
      payloadId,
      jobId,
      ownerUserId,
      requestHash,
      purgeEventId,
      now,
    }) {
      const stored = requireOwnedPayload(payloads, payloadId, ownerUserId);
      assertExactPayloadBinding(stored.metadata, { jobId, requestHash });
      if (stored.metadata.state === "AVAILABLE") throw invalidTransition();
      await repository.revoke({
        payloadId,
        ownerUserId,
        reason: "ORPHAN",
        now,
      });
      return repository.requestPurge({
        payloadId,
        ownerUserId,
        reason: "ORPHAN",
        purgeEventId,
        now,
      });
    },

    async authorizeAttempt({
      payloadId,
      leaseToken,
      job,
      attempt,
      session,
      privacy,
      now,
    }) {
      assertTimestamp(now, "Payload authorization time");
      assertOpaqueNonUrl(leaseToken, "Lease token");
      const stored = requirePayload(payloads, payloadId);
      assertNotBefore(now, stored.metadata.updatedAt);
      if (stored.metadata.state !== "AVAILABLE") throw unavailable();
      assertUsableBeforeExpiry(stored.metadata, now);
      assertAuthorizationBindings({
        metadata: stored.metadata,
        leaseToken,
        job,
        attempt,
        session,
        privacy,
        now,
      });

      const requestHash = sha256(
        stringifyCaresLinkV1CanonicalJson({
          payloadId,
          jobId: job.jobId,
          ownerUserId: job.ownerUserId,
          attemptId: attempt.attemptId,
          leaseTokenHash: sha256(leaseToken),
        }),
      );
      const attemptKey = `${payloadId}:${attempt.attemptId}`;
      const existingGrantId = grantIdByAttempt.get(attemptKey);
      if (existingGrantId) {
        const existing = requireGrant(grants, existingGrantId);
        if (existing.requestHash !== requestHash) throw idempotencyConflict();
        if (existing.status !== "ISSUED") throw unavailable();
        if (Date.parse(existing.expiresAt) <= Date.parse(now)) {
          grants.set(existing.grantId, { ...existing, status: "EXPIRED" });
          throw unavailable();
        }
        return { grantId: existing.grantId, expiresAt: existing.expiresAt };
      }

      for (const [grantId, grant] of grants) {
        if (grant.payloadId === payloadId && grant.status === "ISSUED") {
          grants.set(grantId, { ...grant, status: "REVOKED", revokedAt: now });
        }
      }

      const grantId = createId();
      assertUuid(grantId, "Payload grant ID");
      if (grants.has(grantId)) throw storageInvariant();
      const expiresAt = earliestTimestamp(
        stored.metadata.expiresAt,
        stored.metadata.privacyProofExpiresAt,
        job.leaseExpiresAt,
        attempt.leaseExpiresAt,
        privacy.expiresAt,
      );
      const grant: CaresLinkV1NoteGenerationPayloadGrantRecord = {
        grantId,
        payloadId,
        jobId: job.jobId,
        ownerUserId: job.ownerUserId,
        attemptId: attempt.attemptId,
        leaseTokenHash: sha256(leaseToken),
        requestHash,
        status: "ISSUED",
        authorizedAt: now,
        expiresAt,
      };
      grants.set(grantId, grant);
      grantIdByAttempt.set(attemptKey, grantId);
      return { grantId, expiresAt };
    },

    async consumeAttemptGrant({
      grantId,
      payloadId,
      leaseToken,
      job,
      attempt,
      session,
      privacy,
      now,
    }) {
      assertTimestamp(now, "Payload consumption time");
      assertOpaqueNonUrl(leaseToken, "Lease token");
      const grant = requireGrant(grants, grantId);
      if (
        grant.payloadId !== payloadId ||
        grant.jobId !== job.jobId ||
        grant.ownerUserId !== job.ownerUserId ||
        grant.attemptId !== attempt.attemptId ||
        grant.leaseTokenHash !== sha256(leaseToken)
      ) {
        throw unavailable();
      }
      assertNotBefore(now, grant.authorizedAt);
      if (
        grant.status !== "ISSUED" ||
        Date.parse(grant.expiresAt) <= Date.parse(now)
      ) {
        if (grant.status === "ISSUED") {
          grants.set(grantId, { ...grant, status: "EXPIRED" });
        }
        throw unavailable();
      }

      const stored = requireOwnedPayload(payloads, payloadId, job.ownerUserId);
      if (
        stored.metadata.jobId !== job.jobId ||
        stored.metadata.state !== "AVAILABLE"
      ) {
        throw unavailable();
      }
      assertUsableBeforeExpiry(stored.metadata, now);
      // Binding evidence only in this fake. A durable adapter must obtain the
      // session/privacy rows live in the same short release transaction.
      assertAuthorizationBindings({
        metadata: stored.metadata,
        leaseToken,
        job,
        attempt,
        session,
        privacy,
        now,
      });

      // Mark consumed before returning so two concurrent callers cannot both
      // obtain facts. A response-loss retry fails closed; a new attempt must
      // repeat fresh session/privacy authorization.
      grants.set(grantId, { ...grant, status: "CONSUMED", consumedAt: now });

      try {
        const cleanedFacts = validateCaresLinkV1CleanedFacts(
          stored.metadata.noteType,
          stored.cleanedFacts,
        );
        const scanned = scanCaresLinkV1CleanedFacts(
          cleanedFacts as CaresLinkV1JsonObject,
        );
        if (scanned.cleanedFactsHash !== stored.metadata.cleanedFactsHash) {
          throw unavailable();
        }
        return clone(cleanedFacts);
      } catch {
        stored.metadata = logicalRevoke(
          stored.metadata,
          "CORRUPT_PAYLOAD",
          now,
        );
        revokeIssuedGrants(grants, payloadId, now);
        throw unavailable();
      }
    },

    async revoke({ payloadId, ownerUserId, reason, now }) {
      assertTimestamp(now, "Payload revocation time");
      assertRevokeReason(reason);
      const stored = requireOwnedPayload(payloads, payloadId, ownerUserId);
      assertNotBefore(now, stored.metadata.updatedAt);
      if (
        ["REVOKED", "PURGE_PENDING", "PURGE_FAILED", "PURGED"].includes(
          stored.metadata.state,
        )
      ) {
        if (stored.metadata.revokeReason !== reason) throw idempotencyConflict();
        return clone(stored.metadata);
      }
      stored.metadata = logicalRevoke(stored.metadata, reason, now);
      revokeIssuedGrants(grants, payloadId, now);
      return clone(stored.metadata);
    },

    async requestPurge({
      payloadId,
      ownerUserId,
      reason,
      purgeEventId,
      now,
    }) {
      assertTimestamp(now, "Purge request time");
      assertOpaqueNonUrl(purgeEventId, "Purge event ID");
      const stored = requireOwnedPayload(payloads, payloadId, ownerUserId);
      assertNotBefore(now, stored.metadata.updatedAt);
      if (stored.metadata.revokeReason !== reason) throw idempotencyConflict();
      if (
        !["REVOKED", "PURGE_PENDING", "PURGE_FAILED", "PURGED"].includes(
          stored.metadata.state,
        )
      ) {
        throw invalidTransition();
      }
      const existing = purges.get(purgeEventId);
      if (existing) {
        assertPurgeBinding(existing, payloadId, ownerUserId, reason);
        return clone(existing.receipt);
      }
      const receipt: CaresLinkV1NoteGenerationPayloadPurgeReceipt = {
        eventReferenceHash: sha256(purgeEventId),
        payloadReferenceHash: sha256(payloadId),
        policyVersion: stored.metadata.policyVersion,
        reason,
        requestedAt: now,
        outcome: stored.metadata.state === "PURGED" ? "PURGED" : "PENDING",
        attemptCount: stored.metadata.purgeAttemptCount,
        ...(stored.metadata.purgedAt
          ? { completedAt: stored.metadata.purgedAt }
          : {}),
      };
      purges.set(purgeEventId, {
        payloadId,
        ownerUserId,
        reason,
        receipt,
      });
      if (stored.metadata.state !== "PURGED") {
        stored.metadata = {
          ...stored.metadata,
          state: "PURGE_PENDING",
          purgeRequestedAt: stored.metadata.purgeRequestedAt ?? now,
          updatedAt: now,
        };
      }
      return clone(receipt);
    },

    async purge({ payloadId, ownerUserId, reason, purgeEventId, now }) {
      assertTimestamp(now, "Purge time");
      assertOpaqueNonUrl(purgeEventId, "Purge event ID");
      const stored = requireOwnedPayload(payloads, payloadId, ownerUserId);
      assertNotBefore(now, stored.metadata.updatedAt);
      const purge = purges.get(purgeEventId);
      if (!purge) throw invalidTransition();
      assertPurgeBinding(purge, payloadId, ownerUserId, reason);
      if (purge.receipt.outcome === "PURGED") return clone(purge.receipt);
      if (
        stored.metadata.state !== "PURGE_PENDING" &&
        stored.metadata.state !== "PURGE_FAILED"
      ) {
        throw invalidTransition();
      }

      const attemptCount = stored.metadata.purgeAttemptCount + 1;
      if (shouldFailPurgeAttempt({ payloadId, attemptCount })) {
        stored.metadata = {
          ...stored.metadata,
          state: "PURGE_FAILED",
          purgeAttemptCount: attemptCount,
          updatedAt: now,
        };
        purge.receipt = {
          ...purge.receipt,
          outcome: "RETRY_REQUIRED",
          attemptCount,
        };
        return clone(purge.receipt);
      }

      stored.cleanedFacts = undefined;
      stored.handle = undefined;
      stored.metadata = {
        ...stored.metadata,
        state: "PURGED",
        purgeAttemptCount: attemptCount,
        purgedAt: now,
        updatedAt: now,
      };
      purge.receipt = {
        ...purge.receipt,
        outcome: "PURGED",
        attemptCount,
        completedAt: now,
      };
      return clone(purge.receipt);
    },

    async getPrivate({ payloadId, ownerUserId }) {
      return clone(requireOwnedPayload(payloads, payloadId, ownerUserId).metadata);
    },

    async getGrantPrivate({ grantId, ownerUserId }) {
      const grant = requireGrant(grants, grantId);
      if (grant.ownerUserId !== ownerUserId) throw notFound();
      return clone(grant);
    },

    async getOwnerView({ jobId, ownerUserId }) {
      assertUuid(jobId, "Generation job ID");
      assertUuid(ownerUserId, "Owner user ID");
      const payloadId = payloadIdByJob.get(jobId);
      const stored = payloadId ? payloads.get(payloadId) : undefined;
      if (!stored || stored.metadata.ownerUserId !== ownerUserId) throw notFound();
      return {
        jobId,
        availability:
          stored.metadata.state === "STAGED" ||
          stored.metadata.state === "AVAILABLE"
            ? "PENDING"
            : "UNAVAILABLE",
        updatedAt: stored.metadata.updatedAt,
      };
    },

    async getPurgeReceipt({ purgeEventId }) {
      assertOpaqueNonUrl(purgeEventId, "Purge event ID");
      return cloneOptional(purges.get(purgeEventId)?.receipt);
    },

    async TEST_ONLY_corruptStoredFacts({
      payloadId,
      ownerUserId,
      cleanedFacts,
    }) {
      const stored = requireOwnedPayload(payloads, payloadId, ownerUserId);
      // Fault injection only: intentionally bypasses validation to prove the
      // consume boundary revalidates and fails closed.
      stored.cleanedFacts = clone(cleanedFacts as CaresLinkV1CleanedFacts);
    },
  };

  return repository;
}

function prepareStage(input: CaresLinkV1NoteGenerationPayloadStageInput) {
  assertUuid(input.payloadId, "Payload ID");
  assertUuid(input.jobId, "Generation job ID");
  assertUuid(input.ownerUserId, "Owner user ID");
  assertUuid(input.privacyReviewId, "Privacy review ID");
  if (
    !(CARESLINK_V1_NOTE_TYPE_CODES as readonly string[]).includes(
      input.noteType,
    )
  ) {
    throw validation("Note type is unsupported");
  }
  if (!isCaresLinkV1Locale(input.sourceLocale)) {
    throw validation("Source locale is unsupported");
  }
  if (input.contractVersion !== CARESLINK_V1_CONTRACT_VERSION) {
    throw validation("Contract version is unsupported");
  }
  if (input.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION) {
    throw validation("Schema version is unsupported");
  }
  assertSha256(input.cleanedFactsHash, "Cleaned facts hash");
  assertSha256(input.requestHash, "Request hash");
  assertPolicy(input.policy);
  assertTimestamp(input.now, "Stage time");
  assertTimestamp(input.expiresAt, "Payload expiry");
  assertTimestamp(input.privacyProofExpiresAt, "Privacy proof expiry");
  if (
    Date.parse(input.expiresAt) <= Date.parse(input.now) ||
    Date.parse(input.privacyProofExpiresAt) <= Date.parse(input.now) ||
    Date.parse(input.expiresAt) > Date.parse(input.privacyProofExpiresAt)
  ) {
    throw validation("Payload expiry is outside the privacy-proof boundary");
  }

  const cleanedFacts = validateCaresLinkV1CleanedFacts(
    input.noteType,
    input.cleanedFacts,
  );
  const scanned = scanCaresLinkV1CleanedFacts(
    cleanedFacts as CaresLinkV1JsonObject,
  );
  if (scanned.cleanedFactsHash !== input.cleanedFactsHash) {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_STALE",
      "Payload facts do not match the reviewed facts",
    );
  }
  const stageFingerprint = sha256(
    stringifyCaresLinkV1CanonicalJson({
      payloadId: input.payloadId,
      jobId: input.jobId,
      ownerUserId: input.ownerUserId,
      noteType: input.noteType,
      sourceLocale: input.sourceLocale,
      contractVersion: input.contractVersion,
      schemaVersion: input.schemaVersion,
      privacyReviewId: input.privacyReviewId,
      privacyProofExpiresAt: input.privacyProofExpiresAt,
      cleanedFactsHash: input.cleanedFactsHash,
      requestHash: input.requestHash,
      policyVersion: input.policy.policyVersion,
      encryptionProfileVersion: input.policy.encryptionProfileVersion,
      backupDispositionVersion: input.policy.backupDispositionVersion,
      expiresAt: input.expiresAt,
    }),
  );
  const policySnapshotHash = sha256(
    stringifyCaresLinkV1CanonicalJson({
      policyVersion: input.policy.policyVersion,
      encryptionProfileVersion: input.policy.encryptionProfileVersion,
      backupDispositionVersion: input.policy.backupDispositionVersion,
    }),
  );
  return {
    cleanedFacts,
    cleanedFactsHash: scanned.cleanedFactsHash,
    stageFingerprint,
    policySnapshotHash,
  };
}

function assertAuthorizationBindings(input: Readonly<{
  metadata: CaresLinkV1NoteGenerationPayloadMetadata;
  leaseToken: string;
  job: CaresLinkV1NoteGenerationPayloadJobBinding;
  attempt: CaresLinkV1NoteGenerationPayloadAttemptBinding;
  session: CaresLinkV1NoteGenerationPayloadSessionBinding;
  privacy: CaresLinkV1NoteGenerationPayloadPrivacyBinding;
  now: string;
}>) {
  const { metadata, leaseToken, job, attempt, session, privacy, now } = input;
  assertUuid(job.admissionSessionId, "Admission session ID");
  assertUuid(job.activeAttemptId, "Active attempt ID");
  assertUuid(attempt.attemptId, "Attempt ID");
  assertSha256(job.activeLeaseTokenHash, "Active lease hash");
  assertSha256(attempt.leaseTokenHash, "Attempt lease hash");
  assertTimestamp(job.leaseExpiresAt, "Job lease expiry");
  assertTimestamp(attempt.leaseExpiresAt, "Attempt lease expiry");
  assertTimestamp(session.checkedAt, "Session check time");
  assertTimestamp(privacy.checkedAt, "Privacy check time");
  assertTimestamp(privacy.expiresAt, "Privacy proof expiry");
  const leaseHash = sha256(leaseToken);

  if (
    job.jobId !== metadata.jobId ||
    job.ownerUserId !== metadata.ownerUserId ||
    job.noteType !== metadata.noteType ||
    job.sourceLocale !== metadata.sourceLocale ||
    job.contractVersion !== metadata.contractVersion ||
    job.schemaVersion !== metadata.schemaVersion ||
    job.privacyReviewId !== metadata.privacyReviewId ||
    job.cleanedFactsHash !== metadata.cleanedFactsHash ||
    job.requestHash !== metadata.requestHash ||
    job.status !== "RUNNING" ||
    job.activeAttemptId !== attempt.attemptId ||
    job.activeLeaseTokenHash !== leaseHash ||
    attempt.jobId !== job.jobId ||
    attempt.ownerUserId !== job.ownerUserId ||
    attempt.status !== "RUNNING" ||
    attempt.leaseTokenHash !== leaseHash ||
    attempt.leaseExpiresAt !== job.leaseExpiresAt ||
    Date.parse(job.leaseExpiresAt) <= Date.parse(now)
  ) {
    throw unavailable();
  }

  if (
    session.principal.userId !== metadata.ownerUserId ||
    session.principal.sessionId !== job.admissionSessionId ||
    session.principal.transport !== job.admissionTransport ||
    session.checkedAt !== now
  ) {
    throw new CaresLinkV1ContractError(
      "SESSION_REVOKED",
      "Payload session authority is unavailable",
    );
  }

  if (
    privacy.ownerUserId !== metadata.ownerUserId ||
    privacy.privacyReviewId !== metadata.privacyReviewId ||
    privacy.noteType !== metadata.noteType ||
    privacy.cleanedFactsHash !== metadata.cleanedFactsHash ||
    privacy.contractVersion !== metadata.contractVersion ||
    privacy.schemaVersion !== metadata.schemaVersion ||
    privacy.status !== "CONFIRMED" ||
    privacy.expiresAt !== metadata.privacyProofExpiresAt ||
    privacy.checkedAt !== now ||
    Date.parse(privacy.expiresAt) <= Date.parse(now)
  ) {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_STALE",
      "Payload privacy authority is unavailable",
    );
  }
}

function logicalRevoke(
  metadata: CaresLinkV1NoteGenerationPayloadMetadata,
  reason: CaresLinkV1NoteGenerationPayloadRevokeReason,
  now: string,
): CaresLinkV1NoteGenerationPayloadMetadata {
  return {
    ...metadata,
    state: "REVOKED",
    revokedAt: metadata.revokedAt ?? now,
    revokeReason: reason,
    updatedAt: now,
  };
}

function revokeIssuedGrants(
  grants: Map<string, CaresLinkV1NoteGenerationPayloadGrantRecord>,
  payloadId: string,
  now: string,
) {
  for (const [grantId, grant] of grants) {
    if (grant.payloadId === payloadId && grant.status === "ISSUED") {
      grants.set(grantId, { ...grant, status: "REVOKED", revokedAt: now });
    }
  }
}

function assertPurgeBinding(
  stored: StoredPurge,
  payloadId: string,
  ownerUserId: string,
  reason: CaresLinkV1NoteGenerationPayloadRevokeReason,
) {
  if (
    stored.payloadId !== payloadId ||
    stored.ownerUserId !== ownerUserId ||
    stored.reason !== reason
  ) {
    throw idempotencyConflict();
  }
}

function assertExactPayloadBinding(
  metadata: CaresLinkV1NoteGenerationPayloadMetadata,
  input: Readonly<{ jobId: string; requestHash: string }>,
) {
  assertUuid(input.jobId, "Generation job ID");
  assertSha256(input.requestHash, "Request hash");
  if (
    metadata.jobId !== input.jobId ||
    metadata.requestHash !== input.requestHash
  ) {
    throw idempotencyConflict();
  }
}

function assertUsableBeforeExpiry(
  metadata: CaresLinkV1NoteGenerationPayloadMetadata,
  now: string,
) {
  if (
    Date.parse(metadata.expiresAt) <= Date.parse(now) ||
    Date.parse(metadata.privacyProofExpiresAt) <= Date.parse(now)
  ) {
    throw unavailable();
  }
}

function requireOwnedPayload(
  payloads: Map<string, StoredPayload>,
  payloadId: string,
  ownerUserId: string,
) {
  assertUuid(payloadId, "Payload ID");
  assertUuid(ownerUserId, "Owner user ID");
  const stored = payloads.get(payloadId);
  if (!stored || stored.metadata.ownerUserId !== ownerUserId) throw notFound();
  return stored;
}

function requirePayload(payloads: Map<string, StoredPayload>, payloadId: string) {
  assertUuid(payloadId, "Payload ID");
  const stored = payloads.get(payloadId);
  if (!stored) throw unavailable();
  return stored;
}

function requireGrant(
  grants: Map<string, CaresLinkV1NoteGenerationPayloadGrantRecord>,
  grantId: string,
) {
  assertUuid(grantId, "Payload grant ID");
  const grant = grants.get(grantId);
  if (!grant) throw unavailable();
  return grant;
}

function assertPolicy(policy: CaresLinkV1NoteGenerationPayloadPolicy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw validation("Policy is invalid");
  }
  const expectedKeys = [
    "policyVersion",
    "encryptionProfileVersion",
    "backupDispositionVersion",
  ] as const;
  const actualKeys = Object.keys(policy);
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(policy, key)) ||
    actualKeys.some(
      (key) => !(expectedKeys as readonly string[]).includes(key),
    )
  ) {
    throw validation("Policy shape is invalid");
  }
  assertSafeVersion(policy.policyVersion, "Policy version");
  assertSafeVersion(policy.encryptionProfileVersion, "Encryption profile");
  assertSafeVersion(policy.backupDispositionVersion, "Backup disposition");
}

function assertSafeVersion(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw validation(`${label} is invalid`);
  }
}

function assertUuid(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw validation(`${label} is invalid`);
  }
}

function assertSha256(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw validation(`${label} is invalid`);
  }
}

function assertTimestamp(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw validation(`${label} is invalid`);
  }
}

function assertNotBefore(now: string, ...earlier: (string | undefined)[]) {
  const nowMs = Date.parse(now);
  if (earlier.some((value) => value && Date.parse(value) > nowMs)) {
    throw validation("Transaction time cannot move backwards");
  }
}

function assertOpaqueNonUrl(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/.test(value) ||
    /(?:https?:\/\/|bearer|authorization)/i.test(value)
  ) {
    throw validation(`${label} is invalid`);
  }
}

function assertRevokeReason(value: string) {
  if (
    !(CARESLINK_V1_NOTE_GENERATION_PAYLOAD_REVOKE_REASONS as readonly string[]).includes(
      value,
    )
  ) {
    throw validation("Payload revocation reason is invalid");
  }
}

function earliestTimestamp(first: string, ...rest: string[]) {
  return [first, ...rest].reduce((earliest, value) =>
    Date.parse(value) < Date.parse(earliest) ? value : earliest,
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validation(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Generation payload is unavailable",
  );
}

function notFound() {
  return new CaresLinkV1ContractError(
    "NOT_FOUND",
    "Generation payload was not found",
  );
}

function invalidTransition() {
  return new CaresLinkV1ContractError(
    "INVALID_STATE_TRANSITION",
    "Generation payload state does not allow this operation",
  );
}

function idempotencyConflict() {
  return new CaresLinkV1ContractError(
    "IDEMPOTENCY_CONFLICT",
    "Generation payload identity was used for different input",
  );
}

function storageInvariant() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Generation payload storage is unavailable",
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : clone(value);
}
