import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  buildCaresLinkV1CanonicalNoteContent,
  validateCaresLinkV1NoteProviderCandidate,
} from "./note-generation-output";
import {
  createCaresLinkV1NoteProviderWorkerPolicyBinding,
  validateCaresLinkV1NoteProviderAttemptEvidence,
  validateCaresLinkV1NoteProviderPolicySnapshot,
  type CaresLinkV1NoteProviderAttemptEvidence,
  type CaresLinkV1NoteProviderPolicySnapshot,
  type CaresLinkV1NoteProviderPort,
} from "./note-generation-provider-policy";
import {
  parseCaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationRetryableOutcome,
  type CaresLinkV1NoteGenerationWorkerPolicy,
} from "./note-generation-worker-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  isCaresLinkV1Locale,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1JsonObject,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteContent,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1ServiceCode,
} from "./shared-contracts";

/**
 * Source-only orchestration contract. The runtime registry is deliberately
 * empty and the sole factory is explicitly TEST_ONLY.
 */
export const CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_READY =
  false as const;

export const CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_REGISTRY =
  Object.freeze([] as CaresLinkV1NoteGenerationWorkerRegistration[]);

export const CARESLINK_V1_REGISTERED_WORKER_SETTLE_REASONS = [
  "LEASE_EXPIRED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_TRANSIENT",
  "PROVIDER_PERMANENT",
  "PROVIDER_OUTPUT_INVALID",
  "PAYLOAD_UNAVAILABLE",
  "SESSION_REVOKED",
  "PRIVACY_REVIEW_STALE",
  "CANCELLED",
  "POLICY_MISMATCH",
  "INTERNAL_FAILURE",
] as const;

export type CaresLinkV1RegisteredWorkerSettleReason =
  (typeof CARESLINK_V1_REGISTERED_WORKER_SETTLE_REASONS)[number];

export type CaresLinkV1NoteGenerationWorkerRegistrationCore = Readonly<{
  registrationVersion: string;
  status: "APPROVED";
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  workerIdentityVersion: string;
  workerIdentityHash: string;
  workerPolicyVersion: string;
  workerPolicyDigest: string;
  payloadPolicyVersion: string;
  payloadPolicySnapshotHash: string;
  providerPolicies: readonly Readonly<{
    noteType: CaresLinkV1NoteTypeCode;
    policyVersion: string;
    policyDigest: string;
  }>[];
}>;

export type CaresLinkV1NoteGenerationWorkerRegistration =
  CaresLinkV1NoteGenerationWorkerRegistrationCore &
    Readonly<{ registrationDigest: string }>;

/** Metadata-only job binding returned by the private store. */
export type CaresLinkV1RegisteredWorkerJob = Readonly<{
  jobId: string;
  payloadId: string;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  serviceCode: CaresLinkV1ServiceCode;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  workerPolicyVersion: string;
  workerPolicyDigest: string;
  providerPolicyVersion: string;
  providerPolicyDigest: string;
  payloadPolicyVersion: string;
  payloadPolicySnapshotHash: string;
  status: "RUNNING";
}>;

export type CaresLinkV1RegisteredWorkerAttempt = Readonly<{
  attemptId: string;
  ordinal: number;
  status: "RUNNING";
  leaseTokenHash: string;
  workerIdentityHash: string;
  registrationDigest: string;
}>;

export type CaresLinkV1RegisteredWorkerClaim = Readonly<{
  job: CaresLinkV1RegisteredWorkerJob;
  attempt: CaresLinkV1RegisteredWorkerAttempt;
  /** Worker-only capability. Stores must persist only its digest. */
  leaseToken: string;
}>;

export type CaresLinkV1RegisteredWorkerFence = Readonly<{
  fenceId: string;
  fenceDigest: string;
  expiresAt: string;
}>;

export type CaresLinkV1RegisteredWorkerSuccess = Readonly<{
  canonicalId: string;
  revisionId: string;
  contentHash: string;
  revisionNumber: 1;
  baseRevisionId: null;
}>;

export type CaresLinkV1RegisteredWorkerFailureSettlement = Readonly<{
  disposition: "RETRY_SCHEDULED" | "FAILED" | "CANCELLED";
  reason: CaresLinkV1RegisteredWorkerSettleReason;
  /** Terminal settlements must atomically revoke and enqueue payload purge. */
  payloadDisposition: "RETAINED_FOR_RETRY" | "REVOKED_PURGE_ENQUEUED";
  /** Exact persisted retry choice; terminal settlements contain only nulls. */
  baseDelayMs: number | null;
  jitterMs: number | null;
  retryDelayMs: number | null;
}>;

export type CaresLinkV1RegisteredWorkerPersistedOutcome =
  | Readonly<{ status: "RUNNING" }>
  | Readonly<{
      status: "SUCCEEDED";
      result: CaresLinkV1RegisteredWorkerSuccess;
    }>
  | Readonly<{
      status: "RETRY_SCHEDULED" | "FAILED" | "CANCELLED";
      settlement: CaresLinkV1RegisteredWorkerFailureSettlement;
    }>;

export type CaresLinkV1RegisteredWorkerRecoverySummary = Readonly<{
  recovered: number;
  requeued: number;
  failed: number;
}>;

/**
 * High-level v2 store. Implementations own transaction time, retry delay and
 * bounded jitter. No public/caller clock, duration or attempt budget exists.
 */
export type CaresLinkV1NoteGenerationRegisteredWorkerStore = Readonly<{
  claimNext(input: Readonly<{
    workerIdentityHash: string;
    registration: CaresLinkV1NoteGenerationWorkerRegistration;
    workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  }>): Promise<CaresLinkV1RegisteredWorkerClaim | undefined>;
  heartbeat(input: Readonly<{
    claim: CaresLinkV1RegisteredWorkerClaim;
    registration: CaresLinkV1NoteGenerationWorkerRegistration;
    workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  }>): Promise<void>;
  fenceAttempt(input: Readonly<{
    claim: CaresLinkV1RegisteredWorkerClaim;
    registration: CaresLinkV1NoteGenerationWorkerRegistration;
    workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  }>): Promise<CaresLinkV1RegisteredWorkerFence>;
  /**
   * One transaction must consume the fence, recheck the active lease and fresh
   * authority, persist canonical document + revision 1 + provider evidence,
   * transition job/attempt, append the sync change and mutation receipt, and
   * logically revoke/enqueue purge for the payload.
   */
  commitCanonicalSuccess(input: Readonly<{
    claim: CaresLinkV1RegisteredWorkerClaim;
    fence: CaresLinkV1RegisteredWorkerFence;
    registration: CaresLinkV1NoteGenerationWorkerRegistration;
    content: CaresLinkV1NoteContent;
    contentHash: string;
    providerEvidence: CaresLinkV1NoteProviderAttemptEvidence;
  }>): Promise<CaresLinkV1RegisteredWorkerSuccess>;
  /** Store applies the frozen policy; the worker supplies no retry timestamp. */
  settleFailure(input: Readonly<{
    claim: CaresLinkV1RegisteredWorkerClaim;
    registration: CaresLinkV1NoteGenerationWorkerRegistration;
    workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
    reason: CaresLinkV1RegisteredWorkerSettleReason;
    providerEvidence?: CaresLinkV1NoteProviderAttemptEvidence;
  }>): Promise<CaresLinkV1RegisteredWorkerFailureSettlement>;
  /** Resolves commit/settle response loss without repeating either mutation. */
  resolveAttemptOutcome(input: Readonly<{
    claim: CaresLinkV1RegisteredWorkerClaim;
    registration: CaresLinkV1NoteGenerationWorkerRegistration;
    expectedContentHash: string | null;
  }>): Promise<CaresLinkV1RegisteredWorkerPersistedOutcome>;
  /** Store owns time, recovery batch size, max attempts, delay and jitter. */
  recoverExpired(input: Readonly<{
    workerIdentityHash: string;
    registration: CaresLinkV1NoteGenerationWorkerRegistration;
    workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  }>): Promise<CaresLinkV1RegisteredWorkerRecoverySummary>;
}>;

/**
 * High-level v2 payload gate. Implementations fresh-read session/privacy/job
 * state themselves; raw bindings and clocks cannot be supplied by the worker.
 */
export type CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort = Readonly<{
  authorizeAttempt(input: Readonly<{
    jobId: string;
    payloadId: string;
    attemptId: string;
    leaseToken: string;
    registrationDigest: string;
  }>): Promise<Readonly<{ grantId: string; expiresAt: string }>>;
  consumeAttemptGrant(input: Readonly<{
    jobId: string;
    payloadId: string;
    attemptId: string;
    leaseToken: string;
    registrationDigest: string;
    grantId: string;
  }>): Promise<unknown>;
}>;

export type CaresLinkV1RegisteredWorkerClock = Readonly<{
  now(): string;
}>;

export type CaresLinkV1RegisteredWorkerTimer = Readonly<{
  schedule(input: Readonly<{
    delayMs: number;
    onElapsed: () => void;
  }>): Readonly<{ cancel(): void }>;
}>;

export type CaresLinkV1RegisteredWorkerRunOutcome =
  | Readonly<{ status: "IDLE"; registrationDigest: string }>
  | Readonly<{
      status: "SUCCEEDED";
      registrationDigest: string;
      jobId: string;
      attemptId: string;
      result: CaresLinkV1RegisteredWorkerSuccess;
    }>
  | Readonly<{
      status: "RETRY_SCHEDULED" | "FAILED" | "CANCELLED";
      registrationDigest: string;
      jobId: string;
      attemptId: string;
      reason: CaresLinkV1RegisteredWorkerSettleReason;
    }>;

export type CaresLinkV1NoteGenerationRegisteredWorker = Readonly<{
  /** Deliberately parameterless: identity, clock and policies are frozen. */
  runNext(): Promise<CaresLinkV1RegisteredWorkerRunOutcome>;
  /** Deliberately parameterless: the store applies the frozen recovery policy. */
  recoverExpired(): Promise<CaresLinkV1RegisteredWorkerRecoverySummary>;
}>;

export class CaresLinkV1RegisteredWorkerExecutionError extends Error {
  readonly reason: CaresLinkV1RegisteredWorkerSettleReason;

  constructor(reason: CaresLinkV1RegisteredWorkerSettleReason) {
    super("Registered Note worker execution failed");
    this.name = "CaresLinkV1RegisteredWorkerExecutionError";
    this.reason = reason;
  }
}

class UnresolvedWorkerMutationError extends Error {}

const REGISTRATION_CORE_KEYS = [
  "registrationVersion",
  "status",
  "contractVersion",
  "schemaVersion",
  "workerIdentityVersion",
  "workerIdentityHash",
  "workerPolicyVersion",
  "workerPolicyDigest",
  "payloadPolicyVersion",
  "payloadPolicySnapshotHash",
  "providerPolicies",
] as const;

const REGISTRATION_KEYS = [
  ...REGISTRATION_CORE_KEYS,
  "registrationDigest",
] as const;

const CLAIM_KEYS = ["job", "attempt", "leaseToken"] as const;
const CLAIM_JOB_KEYS = [
  "jobId",
  "payloadId",
  "noteType",
  "sourceLocale",
  "serviceCode",
  "contractVersion",
  "schemaVersion",
  "workerPolicyVersion",
  "workerPolicyDigest",
  "providerPolicyVersion",
  "providerPolicyDigest",
  "payloadPolicyVersion",
  "payloadPolicySnapshotHash",
  "status",
] as const;
const CLAIM_ATTEMPT_KEYS = [
  "attemptId",
  "ordinal",
  "status",
  "leaseTokenHash",
  "workerIdentityHash",
  "registrationDigest",
] as const;

export function createCaresLinkV1RegisteredWorkerIdentityHash(input: Readonly<{
  identityVersion: string;
  workerId: string;
}>): string {
  const identityVersion = requireIdentifier(
    input.identityVersion,
    "Worker identity version",
  );
  const workerId = requireOpaque(input.workerId, "Worker identity");
  return sha256(
    stringifyCaresLinkV1CanonicalJson({
      kind: "careslink.v1.note-generation-worker-identity",
      identityVersion,
      workerId,
    }),
  );
}

export function createCaresLinkV1NoteGenerationWorkerRegistration(
  value: unknown,
): CaresLinkV1NoteGenerationWorkerRegistration {
  const core = validateRegistrationCore(value);
  return Object.freeze({
    ...core,
    registrationDigest: registrationDigest(core),
  });
}

export function validateCaresLinkV1NoteGenerationWorkerRegistration(
  value: unknown,
): CaresLinkV1NoteGenerationWorkerRegistration {
  const object = requireExactObject(value, REGISTRATION_KEYS, "Registration");
  const core = validateRegistrationCore(
    Object.fromEntries(
      REGISTRATION_CORE_KEYS.map((key) => [key, object[key]]),
    ),
  );
  const digest = requireSha256(
    object.registrationDigest,
    "Registration digest",
  );
  if (digest !== registrationDigest(core)) {
    throw invalid("Registration digest does not match its definition");
  }
  return Object.freeze({ ...core, registrationDigest: digest });
}

/**
 * Behavioral factory only. It creates no route, queue, database, provider,
 * environment lookup, Points authority or production registration.
 */
export function createTestOnlyCaresLinkV1NoteGenerationRegisteredWorker(
  options: Readonly<{
    capability: "TEST_ONLY";
    identity: Readonly<{ identityVersion: string; workerId: string }>;
    registration: unknown;
    workerPolicy: unknown;
    payloadPolicyBinding: Readonly<{
      policyVersion: string;
      policySnapshotHash: string;
    }>;
    approvedProviderPolicies: readonly unknown[];
    store: CaresLinkV1NoteGenerationRegisteredWorkerStore;
    payload: CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort;
    provider: CaresLinkV1NoteProviderPort;
    clock: CaresLinkV1RegisteredWorkerClock;
    timer: CaresLinkV1RegisteredWorkerTimer;
  }>,
): CaresLinkV1NoteGenerationRegisteredWorker {
  if (options.capability !== "TEST_ONLY") throw unavailable();

  const identity = Object.freeze({
    identityVersion: requireIdentifier(
      options.identity.identityVersion,
      "Worker identity version",
    ),
    workerId: requireOpaque(options.identity.workerId, "Worker identity"),
  });
  const workerIdentityHash = createCaresLinkV1RegisteredWorkerIdentityHash(
    identity,
  );
  const registration = validateCaresLinkV1NoteGenerationWorkerRegistration(
    options.registration,
  );
  const workerPolicy = parseCaresLinkV1NoteGenerationWorkerPolicy(
    options.workerPolicy,
  );
  if (workerPolicy.status !== "APPROVED") {
    throw invalid("Registered worker requires an approved worker policy");
  }
  const providerPolicies = freezeProviderPolicies(
    options.approvedProviderPolicies,
  );
  const payloadPolicyBinding = Object.freeze({
    policyVersion: requireIdentifier(
      options.payloadPolicyBinding.policyVersion,
      "Payload policy version",
    ),
    policySnapshotHash: requireSha256(
      options.payloadPolicyBinding.policySnapshotHash,
      "Payload policy snapshot hash",
    ),
  });
  assertRegistrationBindings({
    registration,
    identityVersion: identity.identityVersion,
    workerIdentityHash,
    workerPolicy,
    providerPolicies,
    payloadPolicyBinding,
  });

  const clock = Object.freeze({ now: options.clock.now.bind(options.clock) });
  const timer = Object.freeze({
    schedule: options.timer.schedule.bind(options.timer),
  });
  const store = freezeStore(options.store);
  const payload = freezePayload(options.payload);
  const provider = Object.freeze({
    generate: options.provider.generate.bind(options.provider),
  });

  async function settle(
    claim: CaresLinkV1RegisteredWorkerClaim,
    reason: CaresLinkV1RegisteredWorkerSettleReason,
    providerEvidence?: CaresLinkV1NoteProviderAttemptEvidence,
  ): Promise<CaresLinkV1RegisteredWorkerRunOutcome> {
    let settlement: CaresLinkV1RegisteredWorkerFailureSettlement;
    try {
      settlement = await store.settleFailure({
        claim,
        registration,
        workerPolicy,
        reason,
        ...(providerEvidence ? { providerEvidence } : {}),
      });
    } catch {
      let persisted: CaresLinkV1RegisteredWorkerPersistedOutcome;
      try {
        persisted = await store.resolveAttemptOutcome({
          claim,
          registration,
          expectedContentHash: null,
        });
        validatePersistedOutcome(persisted);
      } catch {
        throw new UnresolvedWorkerMutationError();
      }
      if (
        persisted.status === "RETRY_SCHEDULED" ||
        persisted.status === "FAILED" ||
        persisted.status === "CANCELLED"
      ) {
        try {
          if (persisted.settlement.reason !== reason) {
            throw invalid("Persisted settlement reason drifted");
          }
          return outcomeFromPersisted(
            claim,
            registration,
            persisted,
            workerPolicy,
          );
        } catch {
          throw new UnresolvedWorkerMutationError();
        }
      }
      throw new UnresolvedWorkerMutationError();
    }
    validateSettlement(settlement, reason, claim.attempt.ordinal, workerPolicy);
    return Object.freeze({
      status: settlement.disposition,
      registrationDigest: registration.registrationDigest,
      jobId: claim.job.jobId,
      attemptId: claim.attempt.attemptId,
      reason,
    });
  }

  return Object.freeze({
    async runNext() {
      const rawClaim = await store.claimNext({
        workerIdentityHash,
        registration,
        workerPolicy,
      });
      if (!rawClaim) {
        return Object.freeze({
          status: "IDLE",
          registrationDigest: registration.registrationDigest,
        });
      }
      const claim = validateClaim(rawClaim, {
        registration,
        workerIdentityHash,
        workerPolicy,
        providerPolicies,
      });
      let validatedProviderEvidence:
        | CaresLinkV1NoteProviderAttemptEvidence
        | undefined;

      try {
        const grant = validateGrant(
          await payload.authorizeAttempt(payloadInput(claim, registration)),
        );
        const grantCheckedAt = requireServerTime(
          clock.now(),
          "Payload grant check time",
        );
        assertGrantCoversProvider(
          grant.expiresAt,
          grantCheckedAt,
          workerPolicy.providerDeadlineMs,
        );
        const rawFacts = await payload.consumeAttemptGrant({
          ...payloadInput(claim, registration),
          grantId: grant.grantId,
        });
        const cleanedFacts = cloneCanonicalJson(
          validateCaresLinkV1CleanedFacts(claim.job.noteType, rawFacts),
        );
        const policy = requireProviderPolicy(
          providerPolicies,
          claim.job.noteType,
        );
        const startedAt = requireServerTime(
          clock.now(),
          "Provider start time",
        );
        if (Date.parse(startedAt) < Date.parse(grantCheckedAt)) {
          throw new CaresLinkV1RegisteredWorkerExecutionError(
            "INTERNAL_FAILURE",
          );
        }
        assertGrantCoversProvider(
          grant.expiresAt,
          startedAt,
          workerPolicy.providerDeadlineMs,
        );
        const binding = createCaresLinkV1NoteProviderWorkerPolicyBinding({
          policySnapshot: policy,
          workerPolicy,
          startedAt,
        });
        const generated = await runProviderWithGuards({
          claim,
          registration,
          workerPolicy,
          policy,
          binding,
          cleanedFacts: cloneCanonicalJson(cleanedFacts),
          provider,
          store,
          timer,
        });
        const evidence = validateCaresLinkV1NoteProviderAttemptEvidence(
          generated.evidence,
          {
            policySnapshot: policy,
            workerPolicyBinding: binding,
            workerPolicy,
            candidate: generated.candidate,
          },
        );
        validatedProviderEvidence = evidence;
        const observedFinishedAt = requireServerTime(
          clock.now(),
          "Provider observed finish time",
        );
        if (Date.parse(observedFinishedAt) > Date.parse(binding.deadlineAt)) {
          return settle(claim, "PROVIDER_TIMEOUT", evidence);
        }
        if (Date.parse(evidence.finishedAt) > Date.parse(observedFinishedAt)) {
          throw invalid("Provider evidence finish time is ahead of server time");
        }
        if (evidence.finishReason !== "COMPLETED") {
          return settle(
            claim,
            settleReasonForFinishReason(evidence.finishReason),
            evidence,
          );
        }
        const candidate = validateCaresLinkV1NoteProviderCandidate(
          generated.candidate,
        );
        const canonical = buildCaresLinkV1CanonicalNoteContent(
          claim.job.noteType,
          cleanedFacts,
          candidate,
        );
        const fence = validateFence(
          await store.fenceAttempt({
            claim,
            registration,
            workerPolicy,
          }),
        );
        let result: CaresLinkV1RegisteredWorkerSuccess;
        try {
          result = validateSuccess(
            await store.commitCanonicalSuccess({
              claim,
              fence,
              registration,
              content: canonical.content,
              contentHash: canonical.contentHash,
              providerEvidence: evidence,
            }),
            canonical.contentHash,
          );
        } catch (error) {
          let persisted: CaresLinkV1RegisteredWorkerPersistedOutcome;
          try {
            persisted = await store.resolveAttemptOutcome({
              claim,
              registration,
              expectedContentHash: canonical.contentHash,
            });
            validatePersistedOutcome(persisted);
          } catch {
            throw new UnresolvedWorkerMutationError();
          }
          if (persisted.status === "SUCCEEDED") {
            try {
              result = validateSuccess(persisted.result, canonical.contentHash);
            } catch {
              throw new UnresolvedWorkerMutationError();
            }
          } else if (
            persisted.status === "RETRY_SCHEDULED" ||
            persisted.status === "FAILED" ||
            persisted.status === "CANCELLED"
          ) {
            try {
              return outcomeFromPersisted(
                claim,
                registration,
                persisted,
                workerPolicy,
              );
            } catch {
              throw new UnresolvedWorkerMutationError();
            }
          } else {
            throw error;
          }
        }
        return Object.freeze({
          status: "SUCCEEDED",
          registrationDigest: registration.registrationDigest,
          jobId: claim.job.jobId,
          attemptId: claim.attempt.attemptId,
          result,
        });
      } catch (error) {
        if (error instanceof UnresolvedWorkerMutationError) throw error;
        return settle(
          claim,
          normalizeFailure(error),
          validatedProviderEvidence,
        );
      }
    },

    async recoverExpired() {
      return validateRecoverySummary(
        await store.recoverExpired({
          workerIdentityHash,
          registration,
          workerPolicy,
        }),
        workerPolicy,
      );
    },
  });
}

async function runProviderWithGuards(input: Readonly<{
  claim: CaresLinkV1RegisteredWorkerClaim;
  registration: CaresLinkV1NoteGenerationWorkerRegistration;
  workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  policy: CaresLinkV1NoteProviderPolicySnapshot;
  binding: ReturnType<typeof createCaresLinkV1NoteProviderWorkerPolicyBinding>;
  cleanedFacts: CaresLinkV1JsonObject;
  provider: CaresLinkV1NoteProviderPort;
  store: CaresLinkV1NoteGenerationRegisteredWorkerStore;
  timer: CaresLinkV1RegisteredWorkerTimer;
}>) {
  const controller = new AbortController();
  let stopped = false;
  let heartbeatTimer: Readonly<{ cancel(): void }> | undefined;
  let timeoutTimer: Readonly<{ cancel(): void }> | undefined;

  const guarded = new Promise<never>((_resolve, reject) => {
    timeoutTimer = input.timer.schedule({
      delayMs: input.workerPolicy.providerDeadlineMs,
      onElapsed() {
        if (stopped) return;
        stopped = true;
        controller.abort();
        reject(new CaresLinkV1RegisteredWorkerExecutionError("PROVIDER_TIMEOUT"));
      },
    });

    const scheduleHeartbeat = () => {
      if (stopped) return;
      heartbeatTimer = input.timer.schedule({
        delayMs: input.workerPolicy.heartbeatIntervalMs,
        onElapsed() {
          if (stopped) return;
          void input.store
            .heartbeat({
              claim: input.claim,
              registration: input.registration,
              workerPolicy: input.workerPolicy,
            })
            .then(() => {
              if (!stopped) scheduleHeartbeat();
            })
            .catch(() => {
              if (stopped) return;
              stopped = true;
              controller.abort();
              reject(
                new CaresLinkV1RegisteredWorkerExecutionError(
                  "LEASE_EXPIRED",
                ),
              );
            });
        },
      });
    };
    scheduleHeartbeat();
  });

  const providerCall = Promise.resolve().then(() =>
    input.provider.generate({
      workerPrivateCorrelation: sha256(
        stringifyCaresLinkV1CanonicalJson({
          registrationDigest: input.registration.registrationDigest,
          jobId: input.claim.job.jobId,
          attemptId: input.claim.attempt.attemptId,
        }),
      ),
      noteType: input.claim.job.noteType,
      sourceLocale: input.claim.job.sourceLocale,
      contractVersion: input.claim.job.contractVersion,
      schemaVersion: input.claim.job.schemaVersion,
      cleanedFacts: input.cleanedFacts,
      workerPolicyBinding: input.binding,
      workerPolicy: input.workerPolicy,
      signal: controller.signal,
      policySnapshot: input.policy,
    }),
  );

  try {
    return await Promise.race([providerCall, guarded]);
  } finally {
    stopped = true;
    controller.abort();
    heartbeatTimer?.cancel();
    timeoutTimer?.cancel();
  }
}

function validateRegistrationCore(
  value: unknown,
): CaresLinkV1NoteGenerationWorkerRegistrationCore {
  const object = requireExactObject(
    value,
    REGISTRATION_CORE_KEYS,
    "Registration",
  );
  if (object.status !== "APPROVED") {
    throw invalid("Registration status must be APPROVED");
  }
  if (!Array.isArray(object.providerPolicies)) {
    throw invalid("Registration provider policies are invalid");
  }
  const policies = object.providerPolicies.map((entry) => {
    const policy = requireExactObject(
      entry,
      ["noteType", "policyVersion", "policyDigest"],
      "Registration provider policy",
    );
    if (
      typeof policy.noteType !== "string" ||
      !CARESLINK_V1_NOTE_TYPE_CODES.includes(
        policy.noteType as CaresLinkV1NoteTypeCode,
      )
    ) {
      throw invalid("Registration Note type is invalid");
    }
    return Object.freeze({
      noteType: policy.noteType as CaresLinkV1NoteTypeCode,
      policyVersion: requireIdentifier(
        policy.policyVersion,
        "Provider policy version",
      ),
      policyDigest: requireSha256(
        policy.policyDigest,
        "Provider policy digest",
      ),
    });
  });
  if (
    policies.length !== CARESLINK_V1_NOTE_TYPE_CODES.length ||
    new Set(policies.map(({ noteType }) => noteType)).size !== policies.length
  ) {
    throw invalid("Registration must bind each Note type exactly once");
  }
  policies.sort(
    (left, right) =>
      CARESLINK_V1_NOTE_TYPE_CODES.indexOf(left.noteType) -
      CARESLINK_V1_NOTE_TYPE_CODES.indexOf(right.noteType),
  );
  return Object.freeze({
    registrationVersion: requireIdentifier(
      object.registrationVersion,
      "Registration version",
    ),
    status: "APPROVED",
    contractVersion:
      object.contractVersion === CARESLINK_V1_CONTRACT_VERSION
        ? CARESLINK_V1_CONTRACT_VERSION
        : (() => {
            throw invalid("Registration contract version is invalid");
          })(),
    schemaVersion:
      object.schemaVersion === CARESLINK_V1_NOTE_SCHEMA_VERSION
        ? CARESLINK_V1_NOTE_SCHEMA_VERSION
        : (() => {
            throw invalid("Registration schema version is invalid");
          })(),
    workerIdentityVersion: requireIdentifier(
      object.workerIdentityVersion,
      "Worker identity version",
    ),
    workerIdentityHash: requireSha256(
      object.workerIdentityHash,
      "Worker identity hash",
    ),
    workerPolicyVersion: requireIdentifier(
      object.workerPolicyVersion,
      "Worker policy version",
    ),
    workerPolicyDigest: requireSha256(
      object.workerPolicyDigest,
      "Worker policy digest",
    ),
    payloadPolicyVersion: requireIdentifier(
      object.payloadPolicyVersion,
      "Payload policy version",
    ),
    payloadPolicySnapshotHash: requireSha256(
      object.payloadPolicySnapshotHash,
      "Payload policy snapshot hash",
    ),
    providerPolicies: Object.freeze(policies),
  });
}

function freezeProviderPolicies(values: readonly unknown[]) {
  if (!Array.isArray(values)) throw invalid("Provider policies are invalid");
  const entries = values.map(validateCaresLinkV1NoteProviderPolicySnapshot);
  const map = new Map<CaresLinkV1NoteTypeCode, CaresLinkV1NoteProviderPolicySnapshot>();
  for (const policy of entries) {
    if (map.has(policy.noteType)) {
      throw invalid("Provider policy Note type is duplicated");
    }
    map.set(policy.noteType, policy);
  }
  if (map.size !== CARESLINK_V1_NOTE_TYPE_CODES.length) {
    throw invalid("Every Note type requires an approved provider policy");
  }
  return map;
}

function assertRegistrationBindings(input: Readonly<{
  registration: CaresLinkV1NoteGenerationWorkerRegistration;
  identityVersion: string;
  workerIdentityHash: string;
  workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  providerPolicies: ReadonlyMap<CaresLinkV1NoteTypeCode, CaresLinkV1NoteProviderPolicySnapshot>;
  payloadPolicyBinding: Readonly<{
    policyVersion: string;
    policySnapshotHash: string;
  }>;
}>) {
  if (
    input.registration.workerIdentityVersion !== input.identityVersion ||
    input.registration.workerIdentityHash !== input.workerIdentityHash ||
    input.registration.workerPolicyVersion !== input.workerPolicy.version ||
    input.registration.workerPolicyDigest !== input.workerPolicy.digest ||
    input.registration.payloadPolicyVersion !==
      input.payloadPolicyBinding.policyVersion ||
    input.registration.payloadPolicySnapshotHash !==
      input.payloadPolicyBinding.policySnapshotHash
  ) {
    throw invalid("Registration does not match worker identity or policy");
  }
  for (const binding of input.registration.providerPolicies) {
    const policy = input.providerPolicies.get(binding.noteType);
    if (
      !policy ||
      policy.policyVersion !== binding.policyVersion ||
      policy.policyDigest !== binding.policyDigest ||
      policy.timeoutMs !== input.workerPolicy.providerDeadlineMs
    ) {
      throw invalid("Registration does not match provider policies");
    }
  }
}

function validateClaim(
  claim: CaresLinkV1RegisteredWorkerClaim,
  binding: Readonly<{
    registration: CaresLinkV1NoteGenerationWorkerRegistration;
    workerIdentityHash: string;
    workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
    providerPolicies: ReadonlyMap<CaresLinkV1NoteTypeCode, CaresLinkV1NoteProviderPolicySnapshot>;
  }>,
) {
  requireExactObject(claim, CLAIM_KEYS, "Worker claim");
  requireExactObject(claim.job, CLAIM_JOB_KEYS, "Worker claim job");
  requireExactObject(
    claim.attempt,
    CLAIM_ATTEMPT_KEYS,
    "Worker claim attempt",
  );
  requireOpaque(claim.job.jobId, "Job ID");
  requireOpaque(claim.job.payloadId, "Payload ID");
  requireOpaque(claim.attempt.attemptId, "Attempt ID");
  requireOpaque(claim.leaseToken, "Lease token");
  if (
    !CARESLINK_V1_NOTE_TYPE_CODES.includes(claim.job.noteType) ||
    !isCaresLinkV1Locale(claim.job.sourceLocale) ||
    claim.job.status !== "RUNNING" ||
    claim.attempt.status !== "RUNNING" ||
    !Number.isSafeInteger(claim.attempt.ordinal) ||
    claim.attempt.ordinal < 1 ||
    claim.attempt.ordinal > binding.workerPolicy.maxAttempts ||
    requireSha256(claim.attempt.leaseTokenHash, "Lease token hash") !==
      sha256(claim.leaseToken) ||
    claim.attempt.workerIdentityHash !== binding.workerIdentityHash ||
    claim.attempt.registrationDigest !== binding.registration.registrationDigest ||
    claim.job.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
    claim.job.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION ||
    claim.job.workerPolicyVersion !== binding.workerPolicy.version ||
    claim.job.workerPolicyDigest !== binding.workerPolicy.digest ||
    claim.job.payloadPolicyVersion !==
      binding.registration.payloadPolicyVersion ||
    claim.job.payloadPolicySnapshotHash !==
      binding.registration.payloadPolicySnapshotHash
  ) {
    throw invalid("Claim does not match the registered worker");
  }
  const providerPolicy = requireProviderPolicy(
    binding.providerPolicies,
    claim.job.noteType,
  );
  if (
    claim.job.providerPolicyVersion !== providerPolicy.policyVersion ||
    claim.job.providerPolicyDigest !== providerPolicy.policyDigest ||
    claim.job.serviceCode !==
      getCaresLinkV1NoteType(claim.job.noteType).generationServiceCode
  ) {
    throw invalid("Claim policy binding is invalid");
  }
  return Object.freeze({
    job: Object.freeze({
      jobId: claim.job.jobId,
      payloadId: claim.job.payloadId,
      noteType: claim.job.noteType,
      sourceLocale: claim.job.sourceLocale,
      serviceCode: claim.job.serviceCode,
      contractVersion: claim.job.contractVersion,
      schemaVersion: claim.job.schemaVersion,
      workerPolicyVersion: claim.job.workerPolicyVersion,
      workerPolicyDigest: claim.job.workerPolicyDigest,
      providerPolicyVersion: claim.job.providerPolicyVersion,
      providerPolicyDigest: claim.job.providerPolicyDigest,
      payloadPolicyVersion: claim.job.payloadPolicyVersion,
      payloadPolicySnapshotHash: claim.job.payloadPolicySnapshotHash,
      status: "RUNNING" as const,
    }),
    attempt: Object.freeze({
      attemptId: claim.attempt.attemptId,
      ordinal: claim.attempt.ordinal,
      status: "RUNNING" as const,
      leaseTokenHash: claim.attempt.leaseTokenHash,
      workerIdentityHash: claim.attempt.workerIdentityHash,
      registrationDigest: claim.attempt.registrationDigest,
    }),
    leaseToken: claim.leaseToken,
  });
}

function payloadInput(
  claim: CaresLinkV1RegisteredWorkerClaim,
  registration: CaresLinkV1NoteGenerationWorkerRegistration,
) {
  return Object.freeze({
    jobId: claim.job.jobId,
    payloadId: claim.job.payloadId,
    attemptId: claim.attempt.attemptId,
    leaseToken: claim.leaseToken,
    registrationDigest: registration.registrationDigest,
  });
}

function validateSettlement(
  value: CaresLinkV1RegisteredWorkerFailureSettlement,
  reason: CaresLinkV1RegisteredWorkerSettleReason,
  ordinal: number,
  policy: CaresLinkV1NoteGenerationWorkerPolicy,
) {
  requireExactObject(
    value,
    [
      "disposition",
      "reason",
      "payloadDisposition",
      "baseDelayMs",
      "jitterMs",
      "retryDelayMs",
    ],
    "Worker settlement",
  );
  if (
    value.reason !== reason ||
    !CARESLINK_V1_REGISTERED_WORKER_SETTLE_REASONS.includes(value.reason) ||
    !["RETRY_SCHEDULED", "FAILED", "CANCELLED"].includes(
      value.disposition,
    ) ||
    !["RETAINED_FOR_RETRY", "REVOKED_PURGE_ENQUEUED"].includes(
      value.payloadDisposition,
    )
  ) {
    throw invalid("Settlement enum or reason drifted");
  }
  const retryAllowed =
    isRetryable(reason) &&
    policy.retryableOutcomes.includes(reason) &&
    ordinal < policy.maxAttempts;
  const baseDelayMs = retryAllowed
    ? policy.retryDelayMsAfterAttempt[ordinal - 1]
    : null;
  const validJitter =
    retryAllowed &&
    Number.isSafeInteger(value.jitterMs) &&
    (value.jitterMs as number) >= 0 &&
    (policy.jitter.mode === "NONE"
      ? value.jitterMs === 0
      : (value.jitterMs as number) <= policy.jitter.maxMs);
  const validRetryDelay =
    retryAllowed &&
    value.baseDelayMs === baseDelayMs &&
    validJitter &&
    value.retryDelayMs ===
      (baseDelayMs as number) + (value.jitterMs as number) &&
    Number.isSafeInteger(value.retryDelayMs);
  const terminalHasNoDelay =
    !retryAllowed &&
    value.baseDelayMs === null &&
    value.jitterMs === null &&
    value.retryDelayMs === null;
  if (
    (value.disposition === "RETRY_SCHEDULED") !== retryAllowed ||
    (retryAllowed
      ? value.payloadDisposition !== "RETAINED_FOR_RETRY"
      : value.payloadDisposition !== "REVOKED_PURGE_ENQUEUED") ||
    (value.disposition === "CANCELLED") !== (reason === "CANCELLED") ||
    (!retryAllowed &&
      reason !== "CANCELLED" &&
      value.disposition !== "FAILED") ||
    (!validRetryDelay && !terminalHasNoDelay)
  ) {
    throw invalid("Store settlement does not match the approved retry policy");
  }
}

function normalizeFailure(error: unknown): CaresLinkV1RegisteredWorkerSettleReason {
  if (error instanceof CaresLinkV1RegisteredWorkerExecutionError) {
    return error.reason;
  }
  if (error instanceof CaresLinkV1ContractError) {
    if (error.code === "SESSION_REVOKED" || error.code === "AUTH_REQUIRED") {
      return "SESSION_REVOKED";
    }
    if (
      error.code === "PRIVACY_REVIEW_REQUIRED" ||
      error.code === "PRIVACY_REVIEW_STALE"
    ) {
      return "PRIVACY_REVIEW_STALE";
    }
    if (error.code === "VALIDATION_ERROR") return "PROVIDER_OUTPUT_INVALID";
    if (error.code === "GENERATION_FAILED") return "PROVIDER_PERMANENT";
  }
  return "INTERNAL_FAILURE";
}

function settleReasonForFinishReason(
  finishReason: CaresLinkV1NoteProviderAttemptEvidence["finishReason"],
): CaresLinkV1RegisteredWorkerSettleReason {
  if (finishReason === "TIMEOUT") return "PROVIDER_TIMEOUT";
  if (finishReason === "CANCELLED") return "CANCELLED";
  if (finishReason === "OUTPUT_LIMIT" || finishReason === "CONTENT_FILTERED") {
    return "PROVIDER_OUTPUT_INVALID";
  }
  return "PROVIDER_PERMANENT";
}

function outcomeFromPersisted(
  claim: CaresLinkV1RegisteredWorkerClaim,
  registration: CaresLinkV1NoteGenerationWorkerRegistration,
  persisted: Extract<
    CaresLinkV1RegisteredWorkerPersistedOutcome,
    { status: "RETRY_SCHEDULED" | "FAILED" | "CANCELLED" }
  >,
  policy: CaresLinkV1NoteGenerationWorkerPolicy,
): CaresLinkV1RegisteredWorkerRunOutcome {
  requireExactObject(
    persisted,
    ["status", "settlement"],
    "Persisted settlement",
  );
  if (persisted.status !== persisted.settlement.disposition) {
    throw invalid("Persisted settlement status drifted");
  }
  validateSettlement(
    persisted.settlement,
    persisted.settlement.reason,
    claim.attempt.ordinal,
    policy,
  );
  return Object.freeze({
    status: persisted.status,
    registrationDigest: registration.registrationDigest,
    jobId: claim.job.jobId,
    attemptId: claim.attempt.attemptId,
    reason: persisted.settlement.reason,
  });
}

function validatePersistedOutcome(
  value: CaresLinkV1RegisteredWorkerPersistedOutcome,
) {
  if (value.status === "RUNNING") {
    requireExactObject(value, ["status"], "Persisted running outcome");
    return;
  }
  if (value.status === "SUCCEEDED") {
    requireExactObject(
      value,
      ["status", "result"],
      "Persisted success outcome",
    );
    return;
  }
  if (
    value.status === "RETRY_SCHEDULED" ||
    value.status === "FAILED" ||
    value.status === "CANCELLED"
  ) {
    requireExactObject(
      value,
      ["status", "settlement"],
      "Persisted settlement outcome",
    );
    return;
  }
  throw invalid("Persisted worker outcome is invalid");
}

function validateGrant(value: Readonly<{ grantId: string; expiresAt: string }>) {
  requireExactObject(value, ["grantId", "expiresAt"], "Payload grant");
  return Object.freeze({
    grantId: requireOpaque(value.grantId, "Payload grant ID"),
    expiresAt: requireServerTime(value.expiresAt, "Payload grant expiry"),
  });
}

function assertGrantCoversProvider(
  expiresAt: string,
  checkedAt: string,
  providerDeadlineMs: number,
) {
  const requiredUntil = Date.parse(checkedAt) + providerDeadlineMs;
  if (
    !Number.isSafeInteger(requiredUntil) ||
    Date.parse(expiresAt) <= requiredUntil
  ) {
    throw new CaresLinkV1RegisteredWorkerExecutionError(
      "PAYLOAD_UNAVAILABLE",
    );
  }
}

function validateFence(value: CaresLinkV1RegisteredWorkerFence) {
  requireExactObject(
    value,
    ["fenceId", "fenceDigest", "expiresAt"],
    "Attempt fence",
  );
  return Object.freeze({
    fenceId: requireOpaque(value.fenceId, "Attempt fence ID"),
    fenceDigest: requireSha256(value.fenceDigest, "Attempt fence digest"),
    expiresAt: requireServerTime(value.expiresAt, "Attempt fence expiry"),
  });
}

function validateSuccess(
  value: CaresLinkV1RegisteredWorkerSuccess,
  contentHash: string,
) {
  requireExactObject(
    value,
    [
      "canonicalId",
      "revisionId",
      "contentHash",
      "revisionNumber",
      "baseRevisionId",
    ],
    "Canonical success",
  );
  if (
    value.contentHash !== contentHash ||
    value.revisionNumber !== 1 ||
    value.baseRevisionId !== null
  ) {
    throw invalid("Canonical success does not match the built revision");
  }
  return Object.freeze({
    canonicalId: requireOpaque(value.canonicalId, "Canonical document ID"),
    revisionId: requireOpaque(value.revisionId, "Canonical revision ID"),
    contentHash: requireSha256(value.contentHash, "Canonical content hash"),
    revisionNumber: 1 as const,
    baseRevisionId: null,
  });
}

function validateRecoverySummary(
  value: CaresLinkV1RegisteredWorkerRecoverySummary,
  policy: CaresLinkV1NoteGenerationWorkerPolicy,
) {
  requireExactObject(
    value,
    ["recovered", "requeued", "failed"],
    "Recovery summary",
  );
  for (const count of [value.recovered, value.requeued, value.failed]) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw invalid("Recovery summary is invalid");
    }
  }
  if (
    value.recovered !== value.requeued + value.failed ||
    value.recovered > policy.recoveryBatchLimit ||
    (value.requeued > 0 &&
      (policy.maxAttempts < 2 ||
        !policy.retryableOutcomes.includes("LEASE_EXPIRED")))
  ) {
    throw invalid("Recovery summary violates the approved policy");
  }
  return Object.freeze({
    recovered: value.recovered,
    requeued: value.requeued,
    failed: value.failed,
  });
}

function requireProviderPolicy(
  policies: ReadonlyMap<CaresLinkV1NoteTypeCode, CaresLinkV1NoteProviderPolicySnapshot>,
  noteType: CaresLinkV1NoteTypeCode,
) {
  const policy = policies.get(noteType);
  if (!policy) throw new CaresLinkV1RegisteredWorkerExecutionError("POLICY_MISMATCH");
  return policy;
}

function freezeStore(store: CaresLinkV1NoteGenerationRegisteredWorkerStore) {
  return Object.freeze({
    claimNext: store.claimNext.bind(store),
    heartbeat: store.heartbeat.bind(store),
    fenceAttempt: store.fenceAttempt.bind(store),
    commitCanonicalSuccess: store.commitCanonicalSuccess.bind(store),
    settleFailure: store.settleFailure.bind(store),
    resolveAttemptOutcome: store.resolveAttemptOutcome.bind(store),
    recoverExpired: store.recoverExpired.bind(store),
  });
}

function freezePayload(port: CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort) {
  return Object.freeze({
    authorizeAttempt: port.authorizeAttempt.bind(port),
    consumeAttemptGrant: port.consumeAttemptGrant.bind(port),
  });
}

function registrationDigest(core: CaresLinkV1NoteGenerationWorkerRegistrationCore) {
  return sha256(
    stringifyCaresLinkV1CanonicalJson({
      kind: "careslink.v1.note-generation-registered-worker",
      ...core,
    }),
  );
}

function isRetryable(
  reason: CaresLinkV1RegisteredWorkerSettleReason,
): reason is CaresLinkV1NoteGenerationRetryableOutcome {
  return (
    reason === "LEASE_EXPIRED" ||
    reason === "PROVIDER_TIMEOUT" ||
    reason === "PROVIDER_TRANSIENT"
  );
}

function requireExactObject<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
  label: string,
): Record<Key, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${label} is invalid`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid(`${label} is invalid`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw invalid(`${label} shape is invalid`);
  }
  return value as Record<Key, unknown>;
}

function requireIdentifier(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw invalid(`${label} is invalid`);
  }
  return value;
}

function requireOpaque(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    /\s/.test(value) ||
    /^(?:https?:|file:|data:)/i.test(value)
  ) {
    throw invalid(`${label} is invalid`);
  }
  return value;
}

function requireSha256(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw invalid(`${label} is invalid`);
  }
  return value;
}

function requireServerTime(value: unknown, label: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw invalid(`${label} is invalid`);
  }
  return value;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cloneCanonicalJson(value: unknown): CaresLinkV1JsonObject {
  return JSON.parse(stringifyCaresLinkV1CanonicalJson(value)) as CaresLinkV1JsonObject;
}

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Registered Note worker capability is unavailable",
  );
}
