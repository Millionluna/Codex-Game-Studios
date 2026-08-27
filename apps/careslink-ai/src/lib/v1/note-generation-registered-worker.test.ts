import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import type { CaresLinkV1NoteProviderCandidate } from "./note-generation-output";
import {
  CaresLinkV1NoteProviderExecutionError,
  createCaresLinkV1NoteProviderAttemptEvidence,
  createCaresLinkV1NoteProviderPolicySnapshot,
  type CaresLinkV1NoteProviderFinishReason,
  type CaresLinkV1NoteProviderPolicyCore,
  type CaresLinkV1NoteProviderPolicySnapshot,
  type CaresLinkV1NoteProviderPort,
} from "./note-generation-provider-policy";
import {
  CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_READY,
  CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_REGISTRY,
  CaresLinkV1RegisteredWorkerExecutionError,
  createCaresLinkV1NoteGenerationWorkerRegistration,
  createCaresLinkV1RegisteredWorkerIdentityHash,
  createTestOnlyCaresLinkV1NoteGenerationRegisteredWorker,
  validateCaresLinkV1NoteGenerationWorkerRegistration,
  type CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort,
  type CaresLinkV1NoteGenerationRegisteredWorkerStore,
  type CaresLinkV1RegisteredWorkerClaim,
  type CaresLinkV1RegisteredWorkerFailureSettlement,
  type CaresLinkV1RegisteredWorkerPersistedOutcome,
  type CaresLinkV1RegisteredWorkerSettleReason,
  type CaresLinkV1RegisteredWorkerTimer,
} from "./note-generation-registered-worker";
import {
  CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES,
  createCaresLinkV1NoteGenerationWorkerPolicyDigest,
  type CaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationWorkerPolicyDefinition,
} from "./note-generation-worker-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

const STARTED_AT = "2026-08-20T00:00:00.000Z";
const FINISHED_AT = "2026-08-20T00:00:01.000Z";
const GRANT_EXPIRES_AT = "2026-08-20T00:01:00.000Z";
const FENCE_EXPIRES_AT = "2026-08-20T00:00:40.000Z";
const IDENTITY = {
  identityVersion: "worker-identity.v1",
  workerId: "worker-private-identity-001",
} as const;
const PAYLOAD_POLICY = {
  policyVersion: "payload-retention.test-only.v1",
  policySnapshotHash: sha256("payload-policy-snapshot"),
} as const;
const CANDIDATE: CaresLinkV1NoteProviderCandidate = {
  englishDraft: "Observable support facts only.",
  reviewVersions: {
    "zh-Hans": "仅包含可观察的支持事实。",
    "zh-Hant": "僅包含可觀察的支援事實。",
  },
  missingFacts: [],
  neutralWordingChecks: [],
  followUpPrompts: [],
};

describe("CaresLink V1 registered Note worker", () => {
  it("remains default-off with an empty frozen registry and no Points authority", () => {
    type FactoryOptions = Parameters<
      typeof createTestOnlyCaresLinkV1NoteGenerationRegisteredWorker
    >[0];
    type HasPoints = "points" extends keyof FactoryOptions ? true : false;
    type HasPointsPort = "pointsPort" extends keyof FactoryOptions
      ? true
      : false;
    type HasQuote = "quotePort" extends keyof FactoryOptions ? true : false;
    const hasPoints: HasPoints = false;
    const hasPointsPort: HasPointsPort = false;
    const hasQuote: HasQuote = false;

    expect(CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_READY).toBe(false);
    expect(CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_REGISTRY).toEqual([]);
    expect(
      Object.isFrozen(CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_REGISTRY),
    ).toBe(true);
    expect({ hasPoints, hasPointsPort, hasQuote }).toEqual({
      hasPoints: false,
      hasPointsPort: false,
      hasQuote: false,
    });
  });

  it("creates an exact immutable registration bound to identity and all policies", () => {
    const setup = policySetup();

    expect(setup.registration).toMatchObject({
      status: "APPROVED",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      workerIdentityHash: createCaresLinkV1RegisteredWorkerIdentityHash(
        IDENTITY,
      ),
      workerPolicyDigest: setup.workerPolicy.digest,
      payloadPolicyVersion: PAYLOAD_POLICY.policyVersion,
      payloadPolicySnapshotHash: PAYLOAD_POLICY.policySnapshotHash,
    });
    expect(setup.registration.providerPolicies.map(({ noteType }) => noteType)).toEqual(
      CARESLINK_V1_NOTE_TYPE_CODES,
    );
    expect(setup.registration.registrationDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(setup.registration)).toBe(true);
    expect(Object.isFrozen(setup.registration.providerPolicies)).toBe(true);
    expect(
      validateCaresLinkV1NoteGenerationWorkerRegistration(setup.registration),
    ).toEqual(setup.registration);
  });

  it("keeps operational retirement outside the digest-bound registration shape", () => {
    const setup = policySetup();
    const { registrationDigest, ...core } = setup.registration;

    expect(() =>
      createCaresLinkV1NoteGenerationWorkerRegistration({
        ...core,
        status: "RETIRED",
      }),
    ).toThrowError(CaresLinkV1ContractError);
    expect(() =>
      createCaresLinkV1NoteGenerationWorkerRegistration({
        ...core,
        retiredAt: "2026-08-24T11:05:37.000Z",
      }),
    ).toThrowError(CaresLinkV1ContractError);
    expect(() =>
      validateCaresLinkV1NoteGenerationWorkerRegistration({
        ...setup.registration,
        retiredAt: "2026-08-24T11:05:37.000Z",
      }),
    ).toThrowError(CaresLinkV1ContractError);
    expect(setup.registration.registrationDigest).toBe(registrationDigest);
    expect(
      validateCaresLinkV1NoteGenerationWorkerRegistration(setup.registration),
    ).toEqual(setup.registration);
  });

  it("uses a new digest for a replacement while the historical registration stays stable", () => {
    const setup = policySetup();
    const historical = setup.registration;
    const historicalDigest = historical.registrationDigest;
    const { registrationDigest: replacementSourceDigest, ...core } = historical;
    const replacement = createCaresLinkV1NoteGenerationWorkerRegistration({
      ...core,
      registrationVersion: "registered-worker.test-only.v2",
    });

    expect(replacementSourceDigest).toBe(historicalDigest);
    expect(replacement.registrationDigest).not.toBe(historicalDigest);
    expect(replacement).toMatchObject({
      status: "APPROVED",
      workerIdentityHash: historical.workerIdentityHash,
      workerPolicyDigest: historical.workerPolicyDigest,
      payloadPolicySnapshotHash: historical.payloadPolicySnapshotHash,
    });
    expect(historical.registrationDigest).toBe(historicalDigest);
    expect(
      validateCaresLinkV1NoteGenerationWorkerRegistration(historical),
    ).toEqual(historical);
  });

  it("round-trips provider policy versions that use the provider-safe slash", () => {
    const setup = policySetup();
    const providerPolicies = setup.providerPolicies.map((policy) =>
      policy.noteType === "communication"
        ? providerPolicy(
            policy.noteType,
            policy.timeoutMs,
            "policy/communication/v1",
          )
        : policy,
    );
    const { registrationDigest, ...core } =
      setup.registration;
    const registration = createCaresLinkV1NoteGenerationWorkerRegistration({
      ...core,
      providerPolicies: providerPolicies.map((policy) => ({
        noteType: policy.noteType,
        policyVersion: policy.policyVersion,
        policyDigest: policy.policyDigest,
      })),
    });

    expect(registration.providerPolicies[0]?.policyVersion).toBe(
      "policy/communication/v1",
    );
    expect(registration.registrationDigest).not.toBe(registrationDigest);
    expect(
      validateCaresLinkV1NoteGenerationWorkerRegistration(registration),
    ).toEqual(registration);
  });

  it("rejects registration shape, digest, identity, provider and payload-policy drift", () => {
    const setup = policySetup();
    expect(() =>
      validateCaresLinkV1NoteGenerationWorkerRegistration({
        ...setup.registration,
        unexpected: true,
      }),
    ).toThrowError(CaresLinkV1ContractError);
    expect(() =>
      validateCaresLinkV1NoteGenerationWorkerRegistration({
        ...setup.registration,
        workerPolicyDigest: sha256("drifted-worker-policy"),
      }),
    ).toThrowError(CaresLinkV1ContractError);

    const harness = createHarness({ setup });
    expect(() =>
      createTestOnlyCaresLinkV1NoteGenerationRegisteredWorker({
        ...harness.factoryOptions,
        identity: { ...IDENTITY, workerId: "different-worker" },
      }),
    ).toThrowError(CaresLinkV1ContractError);
    expect(() =>
      createTestOnlyCaresLinkV1NoteGenerationRegisteredWorker({
        ...harness.factoryOptions,
        payloadPolicyBinding: {
          ...PAYLOAD_POLICY,
          policySnapshotHash: sha256("different-payload-policy"),
        },
      }),
    ).toThrowError(CaresLinkV1ContractError);
    expect(() =>
      createTestOnlyCaresLinkV1NoteGenerationRegisteredWorker({
        ...harness.factoryOptions,
        approvedProviderPolicies: setup.providerPolicies.slice(1),
      }),
    ).toThrowError(CaresLinkV1ContractError);
  });

  it("rejects provider/worker timeout incompatibility before claim or payload access", () => {
    const incompatible = policySetup(workerPolicy(), 29_999);
    const harness = createHarness();

    expect(() =>
      createTestOnlyCaresLinkV1NoteGenerationRegisteredWorker({
        ...harness.factoryOptions,
        registration: incompatible.registration,
        workerPolicy: incompatible.workerPolicy,
        approvedProviderPolicies: incompatible.providerPolicies,
      }),
    ).toThrowError(CaresLinkV1ContractError);
    expect(harness.store.claimNext).not.toHaveBeenCalled();
    expect(harness.payload.authorizeAttempt).not.toHaveBeenCalled();
  });

  it.each(
    CARESLINK_V1_NOTE_TYPE_CODES.flatMap((noteType) =>
      CARESLINK_V1_LOCALES.map(
        (sourceLocale) => [noteType, sourceLocale] as const,
      ),
    ),
  )(
    "runs %s in %s through one provider and one canonical commit",
    async (noteType, sourceLocale) => {
      const harness = createHarness({ noteType, sourceLocale });

      const outcome = await harness.worker.runNext();

      expect(outcome).toMatchObject({
        status: "SUCCEEDED",
        registrationDigest: harness.setup.registration.registrationDigest,
        jobId: harness.claim.job.jobId,
        attemptId: harness.claim.attempt.attemptId,
        result: {
          revisionNumber: 1,
          baseRevisionId: null,
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
      expect(harness.events).toEqual([
        "authorize",
        "consume",
        "provider",
        "fence",
        "commit",
      ]);
      const expectedPayloadBinding = {
        jobId: harness.claim.job.jobId,
        payloadId: harness.claim.job.payloadId,
        attemptId: harness.claim.attempt.attemptId,
        leaseToken: harness.claim.leaseToken,
        registrationDigest: harness.setup.registration.registrationDigest,
        noteType,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        cleanedFactsHash: harness.claim.job.cleanedFactsHash,
      };
      expect(harness.payload.authorizeAttempt).toHaveBeenCalledWith(
        expectedPayloadBinding,
      );
      expect(harness.payload.consumeAttemptGrant).toHaveBeenCalledWith({
        ...expectedPayloadBinding,
        grantId: "grant-private-001",
      });
      expect(harness.provider.generate).toHaveBeenCalledTimes(1);
      expect(harness.provider.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          noteType,
          sourceLocale,
          contractVersion: CARESLINK_V1_CONTRACT_VERSION,
          schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
          policySnapshot: harness.setup.providerPolicies.find(
            (policy) => policy.noteType === noteType,
          ),
          cleanedFacts: createValidCaresLinkV1CleanedFacts(noteType),
        }),
      );
      expect(harness.store.commitCanonicalSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          contentHash: outcome.status === "SUCCEEDED" ? outcome.result.contentHash : "",
          content: expect.objectContaining({
            factsSummary: createValidCaresLinkV1CleanedFacts(noteType),
          }),
          providerEvidence: expect.objectContaining({
            finishReason: "COMPLETED",
            serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
          }),
        }),
      );
      expect(harness.store.settleFailure).not.toHaveBeenCalled();
    },
  );

  it("authorizes before consuming and fails closed on fresh session/privacy denial", async () => {
    const sessionHarness = createHarness({
      authorizeAttempt: async () => {
        throw new CaresLinkV1ContractError(
          "SESSION_REVOKED",
          "Session authority is unavailable",
        );
      },
    });
    await expect(sessionHarness.worker.runNext()).resolves.toMatchObject({
      status: "FAILED",
      reason: "SESSION_REVOKED",
    });
    expect(sessionHarness.payload.consumeAttemptGrant).not.toHaveBeenCalled();
    expect(sessionHarness.provider.generate).not.toHaveBeenCalled();
    expect(sessionHarness.store.commitCanonicalSuccess).not.toHaveBeenCalled();

    const privacyHarness = createHarness({
      consumeAttemptGrant: async () => {
        throw new CaresLinkV1ContractError(
          "PRIVACY_REVIEW_STALE",
          "Privacy authority is unavailable",
        );
      },
    });
    await expect(privacyHarness.worker.runNext()).resolves.toMatchObject({
      status: "FAILED",
      reason: "PRIVACY_REVIEW_STALE",
    });
    expect(privacyHarness.events.slice(0, 2)).toEqual([
      "authorize",
      "consume",
    ]);
    expect(privacyHarness.provider.generate).not.toHaveBeenCalled();
    expect(privacyHarness.store.commitCanonicalSuccess).not.toHaveBeenCalled();
  });

  it.each([
    {
      grantExpiresAt: "2026-08-20T00:00:00.000Z",
      label: "already expired",
    },
    {
      grantExpiresAt: "2026-08-20T00:00:30.000Z",
      label: "at deadline equality",
    },
  ] as const)(
    "rejects a payload grant that is $label before consuming or calling provider",
    async ({ grantExpiresAt }) => {
      const harness = createHarness({ grantExpiresAt });
      await expect(harness.worker.runNext()).resolves.toMatchObject({
        status: "FAILED",
        reason: "PAYLOAD_UNAVAILABLE",
      });
      expect(harness.payload.authorizeAttempt).toHaveBeenCalledTimes(1);
      expect(harness.payload.consumeAttemptGrant).not.toHaveBeenCalled();
      expect(harness.provider.generate).not.toHaveBeenCalled();
      expect(harness.store.settleFailure).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects a normalized-but-impossible calendar timestamp", async () => {
    const harness = createHarness({
      grantExpiresAt: "2026-02-30T00:01:00.000Z",
    });

    await expect(harness.worker.runNext()).resolves.toMatchObject({
      status: "FAILED",
      reason: "PROVIDER_OUTPUT_INVALID",
    });
    expect(harness.payload.consumeAttemptGrant).not.toHaveBeenCalled();
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("aborts at the hard provider timeout and discards a late provider result", async () => {
    const generation = deferred<Awaited<ReturnType<CaresLinkV1NoteProviderPort["generate"]>>>();
    let signal: AbortSignal | undefined;
    const harness = createHarness({
      providerGenerate: async (input) => {
        signal = input.signal;
        return generation.promise;
      },
    });

    const execution = harness.worker.runNext();
    await vi.waitFor(() => expect(harness.provider.generate).toHaveBeenCalled());
    harness.timer.fire(harness.setup.workerPolicy.providerDeadlineMs);

    await expect(execution).resolves.toMatchObject({
      status: "RETRY_SCHEDULED",
      reason: "PROVIDER_TIMEOUT",
    });
    expect(signal?.aborted).toBe(true);
    expect(harness.store.commitCanonicalSuccess).not.toHaveBeenCalled();

    generation.resolve(
      providerResult(
        harness.setup.providerPolicies[0],
        harness.setup.workerPolicy,
        harness.lastProviderInput(),
      ),
    );
    await Promise.resolve();
    expect(harness.store.commitCanonicalSuccess).not.toHaveBeenCalled();
  });

  it("fences the attempt when heartbeat fails and ignores the late provider", async () => {
    const generation = deferred<Awaited<ReturnType<CaresLinkV1NoteProviderPort["generate"]>>>();
    let signal: AbortSignal | undefined;
    const harness = createHarness({
      heartbeat: async () => {
        throw new Error("lease lost");
      },
      providerGenerate: async (input) => {
        signal = input.signal;
        return generation.promise;
      },
    });

    const execution = harness.worker.runNext();
    await vi.waitFor(() => expect(harness.provider.generate).toHaveBeenCalled());
    harness.timer.fire(harness.setup.workerPolicy.heartbeatIntervalMs);

    await expect(execution).resolves.toMatchObject({
      status: "RETRY_SCHEDULED",
      reason: "LEASE_EXPIRED",
    });
    expect(signal?.aborted).toBe(true);
    generation.resolve(
      providerResult(
        harness.setup.providerPolicies[0],
        harness.setup.workerPolicy,
        harness.lastProviderInput(),
      ),
    );
    await Promise.resolve();
    expect(harness.store.fenceAttempt).not.toHaveBeenCalled();
    expect(harness.store.commitCanonicalSuccess).not.toHaveBeenCalled();
  });

  it.each([
    ["timeout", "PROVIDER_TIMEOUT"],
    ["heartbeat", "LEASE_EXPIRED"],
  ] as const)(
    "preserves the %s guard reason when abort synchronously rejects the provider",
    async (trigger, expectedReason) => {
      const harness = createHarness({
        ...(trigger === "heartbeat"
          ? {
              heartbeat: async () => {
                throw new Error("lease lost");
              },
            }
          : {}),
        providerGenerate: async (input) =>
          new Promise((_resolve, reject) => {
            input.signal.addEventListener(
              "abort",
              () =>
                reject(
                  new CaresLinkV1NoteProviderExecutionError("CANCELLED"),
                ),
              { once: true },
            );
          }),
      });

      const execution = harness.worker.runNext();
      await vi.waitFor(() => expect(harness.provider.generate).toHaveBeenCalled());
      harness.timer.fire(
        trigger === "heartbeat"
          ? harness.setup.workerPolicy.heartbeatIntervalMs
          : harness.setup.workerPolicy.providerDeadlineMs,
      );

      await expect(execution).resolves.toMatchObject({
        status: "RETRY_SCHEDULED",
        reason: expectedReason,
      });
    },
  );

  it.each([
    ["OUTPUT_LIMIT", "PROVIDER_OUTPUT_INVALID"],
    ["CONTENT_FILTERED", "PROVIDER_OUTPUT_INVALID"],
    ["TIMEOUT", "PROVIDER_TIMEOUT"],
    ["CANCELLED", "CANCELLED"],
    ["PROVIDER_ERROR", "PROVIDER_PERMANENT"],
  ] as const)(
    "does not commit a %s provider result",
    async (finishReason, expectedReason) => {
      const harness = createHarness({ finishReason });
      await expect(harness.worker.runNext()).resolves.toMatchObject({
        reason: expectedReason,
      });
      expect(harness.store.fenceAttempt).not.toHaveBeenCalled();
      expect(harness.store.commitCanonicalSuccess).not.toHaveBeenCalled();
      expect(harness.store.settleFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expectedReason,
          providerEvidence: expect.objectContaining({ finishReason }),
        }),
      );
    },
  );

  it("settles evidence mismatch and invalid provider output without canonical state", async () => {
    const mismatch = createHarness({
      candidate: {
        ...structuredClone(CANDIDATE),
        englishDraft: "A different candidate digest.",
      },
      evidenceCandidate: CANDIDATE,
    });
    await expect(mismatch.worker.runNext()).resolves.toMatchObject({
      status: "FAILED",
      reason: "PROVIDER_OUTPUT_INVALID",
    });
    expect(mismatch.store.commitCanonicalSuccess).not.toHaveBeenCalled();

    const invalid = createHarness({
      candidate: {
        ...CANDIDATE,
        raw_access_token: "Bearer secret-token",
      },
    });
    await expect(invalid.worker.runNext()).resolves.toMatchObject({
      status: "FAILED",
      reason: "PROVIDER_OUTPUT_INVALID",
    });
    expect(invalid.store.commitCanonicalSuccess).not.toHaveBeenCalled();
    expect(invalid.store.settleFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "PROVIDER_OUTPUT_INVALID",
        providerEvidence: expect.objectContaining({
          finishReason: "COMPLETED",
          candidateDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it("carries validated content-free provider evidence through a fence failure", async () => {
    const harness = createHarness({
      fenceAttempt: async () => {
        throw new CaresLinkV1RegisteredWorkerExecutionError("LEASE_EXPIRED");
      },
    });

    await expect(harness.worker.runNext()).resolves.toMatchObject({
      status: "RETRY_SCHEDULED",
      reason: "LEASE_EXPIRED",
    });
    expect(harness.store.settleFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "LEASE_EXPIRED",
        providerEvidence: expect.objectContaining({
          finishReason: "COMPLETED",
          providerRequestIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(harness.store.commitCanonicalSuccess).not.toHaveBeenCalled();
  });

  it("accepts only the exact retry vector and approved bounded jitter", async () => {
    const policy = workerPolicy({
      jitter: { mode: "APPROVED_BOUNDED", maxMs: 250 },
    });
    const accepted = createHarness({
      setup: policySetup(policy),
      providerGenerate: async () => {
        throw new CaresLinkV1RegisteredWorkerExecutionError(
          "PROVIDER_TRANSIENT",
        );
      },
      retryJitterMs: 125,
    });
    await expect(accepted.worker.runNext()).resolves.toMatchObject({
      status: "RETRY_SCHEDULED",
      reason: "PROVIDER_TRANSIENT",
    });
    expect(accepted.store.settleFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "PROVIDER_TRANSIENT" }),
    );

    const drifted = createHarness({
      setup: policySetup(policy),
      providerGenerate: async () => {
        throw new CaresLinkV1RegisteredWorkerExecutionError(
          "PROVIDER_TRANSIENT",
        );
      },
      settlementOverride: {
        disposition: "RETRY_SCHEDULED",
        reason: "PROVIDER_TRANSIENT",
        payloadDisposition: "RETAINED_FOR_RETRY",
        baseDelayMs: 9_999,
        jitterMs: 125,
        retryDelayMs: 10_124,
      },
    });
    await expect(drifted.worker.runNext()).rejects.toThrowError(
      CaresLinkV1ContractError,
    );
  });

  it("stops retrying at maxAttempts and requires terminal payload cleanup", async () => {
    const harness = createHarness({
      ordinal: 3,
      providerGenerate: async () => {
        throw new CaresLinkV1RegisteredWorkerExecutionError(
          "PROVIDER_TRANSIENT",
        );
      },
    });

    await expect(harness.worker.runNext()).resolves.toMatchObject({
      status: "FAILED",
      reason: "PROVIDER_TRANSIENT",
    });
    expect(harness.store.settleFailure).toHaveReturned();
  });

  it.each([
    {
      label: "retry at maxAttempts",
      ordinal: 3,
      settlement: {
        disposition: "RETRY_SCHEDULED",
        reason: "PROVIDER_TRANSIENT",
        payloadDisposition: "RETAINED_FOR_RETRY",
        baseDelayMs: 2_000,
        jitterMs: 0,
        retryDelayMs: 2_000,
      },
    },
    {
      label: "unapproved jitter",
      ordinal: 1,
      settlement: {
        disposition: "RETRY_SCHEDULED",
        reason: "PROVIDER_TRANSIENT",
        payloadDisposition: "RETAINED_FOR_RETRY",
        baseDelayMs: 1_000,
        jitterMs: 1,
        retryDelayMs: 1_001,
      },
    },
    {
      label: "wrong payload disposition",
      ordinal: 1,
      settlement: {
        disposition: "RETRY_SCHEDULED",
        reason: "PROVIDER_TRANSIENT",
        payloadDisposition: "REVOKED_PURGE_ENQUEUED",
        baseDelayMs: 1_000,
        jitterMs: 0,
        retryDelayMs: 1_000,
      },
    },
  ] as const)(
    "fails closed on persisted response-loss settlement: $label",
    async ({ ordinal, settlement: persistedSettlement }) => {
      const harness = createHarness({
        ordinal,
        providerGenerate: async () => {
          throw new CaresLinkV1RegisteredWorkerExecutionError(
            "PROVIDER_TRANSIENT",
          );
        },
        settleFailure: async () => {
          throw new Error("settle response lost");
        },
        resolveAttemptOutcome: async () => ({
          status: persistedSettlement.disposition,
          settlement: persistedSettlement as CaresLinkV1RegisteredWorkerFailureSettlement,
        }),
      });

      await expect(harness.worker.runNext()).rejects.toThrowError();
      expect(harness.store.settleFailure).toHaveBeenCalledTimes(1);
      expect(harness.store.resolveAttemptOutcome).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    {
      phase: "authorize",
      persistedReason: "SESSION_REVOKED",
      expectedEvents: ["authorize"],
    },
    {
      phase: "consume",
      persistedReason: "PRIVACY_REVIEW_STALE",
      expectedEvents: ["authorize", "consume"],
    },
  ] as const)(
    "uses the persisted authority denial after $phase and settlement response loss",
    async ({ phase, persistedReason, expectedEvents }) => {
      const setup = policySetup();
      const responseLoss = async () => {
        throw new CaresLinkV1RegisteredWorkerExecutionError(
          "PAYLOAD_UNAVAILABLE",
        );
      };
      const payloadResponseLoss =
        phase === "authorize"
          ? { authorizeAttempt: responseLoss }
          : { consumeAttemptGrant: responseLoss };
      const harness = createHarness({
        setup,
        ...payloadResponseLoss,
        settleFailure: async () => {
          throw new Error("settle response lost");
        },
        resolveAttemptOutcome: async () => ({
          status: "FAILED",
          settlement: settlement(
            persistedReason,
            1,
            setup.workerPolicy,
            0,
          ),
        }),
      });

      await expect(harness.worker.runNext()).resolves.toMatchObject({
        status: "FAILED",
        reason: persistedReason,
      });
      expect(harness.events).toEqual(expectedEvents);
      expect(harness.payload.authorizeAttempt).toHaveBeenCalledTimes(1);
      expect(harness.payload.consumeAttemptGrant).toHaveBeenCalledTimes(
        phase === "consume" ? 1 : 0,
      );
      expect(harness.store.settleFailure).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "PAYLOAD_UNAVAILABLE" }),
      );
      expect(harness.store.resolveAttemptOutcome).toHaveBeenCalledTimes(1);
      expect(harness.provider.generate).not.toHaveBeenCalled();
      expect(harness.store.commitCanonicalSuccess).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      requestedReason: "PAYLOAD_UNAVAILABLE",
      persistedReason: "PROVIDER_PERMANENT",
    },
    {
      requestedReason: "PROVIDER_TRANSIENT",
      persistedReason: "SESSION_REVOKED",
    },
  ] as const)(
    "rejects response-loss reason drift from $requestedReason to $persistedReason",
    async ({ requestedReason, persistedReason }) => {
      const setup = policySetup();
      const harness = createHarness({
        setup,
        authorizeAttempt: async () => {
          throw new CaresLinkV1RegisteredWorkerExecutionError(
            requestedReason,
          );
        },
        settleFailure: async () => {
          throw new Error("settle response lost");
        },
        resolveAttemptOutcome: async () => ({
          status: "FAILED",
          settlement: settlement(
            persistedReason,
            1,
            setup.workerPolicy,
            0,
          ),
        }),
      });

      await expect(harness.worker.runNext()).rejects.toThrowError();
      expect(harness.store.settleFailure).toHaveBeenCalledTimes(1);
      expect(harness.store.resolveAttemptOutcome).toHaveBeenCalledTimes(1);
      expect(harness.provider.generate).not.toHaveBeenCalled();
      expect(harness.store.commitCanonicalSuccess).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed or unknown settlement enums", async () => {
    for (const malformed of [
      {
        disposition: "DONE",
        reason: "PROVIDER_PERMANENT",
        payloadDisposition: "REVOKED_PURGE_ENQUEUED",
        baseDelayMs: null,
        jitterMs: null,
        retryDelayMs: null,
      },
      {
        disposition: "FAILED",
        reason: "UNKNOWN_REASON",
        payloadDisposition: "REVOKED_PURGE_ENQUEUED",
        baseDelayMs: null,
        jitterMs: null,
        retryDelayMs: null,
      },
    ]) {
      const harness = createHarness({
        providerGenerate: async () => {
          throw new CaresLinkV1RegisteredWorkerExecutionError(
            "PROVIDER_PERMANENT",
          );
        },
        settlementOverride:
          malformed as unknown as CaresLinkV1RegisteredWorkerFailureSettlement,
      });
      await expect(harness.worker.runNext()).rejects.toThrowError(
        CaresLinkV1ContractError,
      );
    }
  });

  it.each(["throws", "RUNNING", "SUCCEEDED"] as const)(
    "fails closed after unresolved settle response loss when resolver %s",
    async (resolverOutcome) => {
      const resolveAttemptOutcome = async () => {
        if (resolverOutcome === "throws") throw new Error("resolver unavailable");
        if (resolverOutcome === "SUCCEEDED") {
          return {
            status: "SUCCEEDED" as const,
            result: success(sha256("unrelated-content")),
          };
        }
        return { status: "RUNNING" as const };
      };
      const harness = createHarness({
        providerGenerate: async () => {
          throw new CaresLinkV1RegisteredWorkerExecutionError(
            "PROVIDER_TRANSIENT",
          );
        },
        settleFailure: async () => {
          throw new Error("settle response lost");
        },
        resolveAttemptOutcome,
      });

      await expect(harness.worker.runNext()).rejects.toThrowError();
      expect(harness.store.settleFailure).toHaveBeenCalledTimes(1);
      expect(harness.store.resolveAttemptOutcome).toHaveBeenCalledTimes(1);
    },
  );

  it("resolves a lost canonical commit response without repeating provider or commit", async () => {
    let persisted: CaresLinkV1RegisteredWorkerPersistedOutcome = {
      status: "RUNNING",
    };
    const harness = createHarness({
      commitCanonicalSuccess: async (input) => {
        persisted = {
          status: "SUCCEEDED",
          result: success(input.contentHash),
        };
        throw new Error("commit response lost");
      },
      resolveAttemptOutcome: async () => persisted,
    });

    await expect(harness.worker.runNext()).resolves.toMatchObject({
      status: "SUCCEEDED",
      result: { revisionNumber: 1, baseRevisionId: null },
    });
    expect(harness.provider.generate).toHaveBeenCalledTimes(1);
    expect(harness.store.commitCanonicalSuccess).toHaveBeenCalledTimes(1);
    expect(harness.store.resolveAttemptOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ expectedContentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
    expect(harness.store.settleFailure).not.toHaveBeenCalled();
  });

  it("does not repeat an uncertain commit when resolution remains RUNNING", async () => {
    const harness = createHarness({
      commitCanonicalSuccess: async () => {
        throw new Error("commit response lost");
      },
      resolveAttemptOutcome: async () => ({ status: "RUNNING" }),
    });

    await expect(harness.worker.runNext()).resolves.toMatchObject({
      status: "FAILED",
      reason: "INTERNAL_FAILURE",
    });
    expect(harness.provider.generate).toHaveBeenCalledTimes(1);
    expect(harness.store.commitCanonicalSuccess).toHaveBeenCalledTimes(1);
    expect(harness.store.resolveAttemptOutcome).toHaveBeenCalledTimes(1);
    expect(harness.store.settleFailure).toHaveBeenCalledTimes(1);
  });

  it("keeps outcomes and logs free of payload, lease, provider ID and facts", async () => {
    const logSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    try {
      const harness = createHarness();
      const outcome = await harness.worker.runNext();
      const serialized = JSON.stringify(outcome);
      expect(serialized).not.toContain(harness.claim.leaseToken);
      expect(serialized).not.toContain(harness.claim.job.payloadId);
      expect(serialized).not.toContain("provider-request-sensitive");
      expect(serialized).not.toContain(
        JSON.stringify(createValidCaresLinkV1CleanedFacts("communication")),
      );
      expect(Object.keys(outcome).sort()).toEqual(
        ["attemptId", "jobId", "registrationDigest", "result", "status"].sort(),
      );
      for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of logSpies) spy.mockRestore();
    }
  });

  it("validates metadata-only recovery summaries against the frozen batch limit", async () => {
    const harness = createHarness({
      recoverExpired: async () => ({ recovered: 3, requeued: 2, failed: 1 }),
    });
    await expect(harness.worker.recoverExpired()).resolves.toEqual({
      recovered: 3,
      requeued: 2,
      failed: 1,
    });
    expect(harness.store.recoverExpired).toHaveBeenCalledWith(
      expect.objectContaining({
        workerIdentityHash: harness.claim.attempt.workerIdentityHash,
        registration: harness.setup.registration,
        workerPolicy: harness.setup.workerPolicy,
      }),
    );

    const invalid = createHarness({
      recoverExpired: async () => ({ recovered: 21, requeued: 20, failed: 1 }),
    });
    await expect(invalid.worker.recoverExpired()).rejects.toThrowError(
      CaresLinkV1ContractError,
    );
  });
});

type HarnessOptions = Readonly<{
  noteType?: CaresLinkV1NoteTypeCode;
  sourceLocale?: CaresLinkV1Locale;
  ordinal?: number;
  setup?: ReturnType<typeof policySetup>;
  candidate?: Record<string, unknown>;
  evidenceCandidate?: unknown;
  finishReason?: CaresLinkV1NoteProviderFinishReason;
  grantExpiresAt?: string;
  authorizeAttempt?: CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort["authorizeAttempt"];
  consumeAttemptGrant?: CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort["consumeAttemptGrant"];
  providerGenerate?: CaresLinkV1NoteProviderPort["generate"];
  heartbeat?: CaresLinkV1NoteGenerationRegisteredWorkerStore["heartbeat"];
  fenceAttempt?: CaresLinkV1NoteGenerationRegisteredWorkerStore["fenceAttempt"];
  commitCanonicalSuccess?: CaresLinkV1NoteGenerationRegisteredWorkerStore["commitCanonicalSuccess"];
  settleFailure?: CaresLinkV1NoteGenerationRegisteredWorkerStore["settleFailure"];
  resolveAttemptOutcome?: CaresLinkV1NoteGenerationRegisteredWorkerStore["resolveAttemptOutcome"];
  recoverExpired?: CaresLinkV1NoteGenerationRegisteredWorkerStore["recoverExpired"];
  retryJitterMs?: number;
  settlementOverride?: CaresLinkV1RegisteredWorkerFailureSettlement;
}>;

function createHarness(options: HarnessOptions = {}) {
  const setup = options.setup ?? policySetup();
  const noteType = options.noteType ?? "communication";
  const sourceLocale = options.sourceLocale ?? "en";
  const policy = required(
    setup.providerPolicies.find((entry) => entry.noteType === noteType),
  );
  const events: string[] = [];
  const leaseToken = "lease-token-sensitive-001";
  const cleanedFacts = createValidCaresLinkV1CleanedFacts(noteType);
  const claim: CaresLinkV1RegisteredWorkerClaim = {
    job: {
      jobId: `job-${noteType}-${sourceLocale}`,
      payloadId: `payload-${noteType}-${sourceLocale}`,
      noteType,
      sourceLocale,
      serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      workerPolicyVersion: setup.workerPolicy.version,
      workerPolicyDigest: setup.workerPolicy.digest,
      providerPolicyVersion: policy.policyVersion,
      providerPolicyDigest: policy.policyDigest,
      payloadPolicyVersion: PAYLOAD_POLICY.policyVersion,
      payloadPolicySnapshotHash: PAYLOAD_POLICY.policySnapshotHash,
      cleanedFactsHash: sha256(
        stringifyCaresLinkV1CanonicalJson(cleanedFacts),
      ),
      status: "RUNNING",
    },
    attempt: {
      attemptId: `attempt-${noteType}-${sourceLocale}`,
      ordinal: options.ordinal ?? 1,
      status: "RUNNING",
      leaseTokenHash: sha256(leaseToken),
      workerIdentityHash: createCaresLinkV1RegisteredWorkerIdentityHash(
        IDENTITY,
      ),
      registrationDigest: setup.registration.registrationDigest,
    },
    leaseToken,
  };
  const candidate = (options.candidate ?? structuredClone(CANDIDATE)) as Record<
    string,
    unknown
  >;
  const timer = manualTimer();
  let lastProviderInputValue:
    | Parameters<CaresLinkV1NoteProviderPort["generate"]>[0]
    | undefined;

  const settleFailure = vi.fn(
    options.settleFailure ??
      (async ({ reason }) =>
        options.settlementOverride ??
        settlement(
          reason,
          claim.attempt.ordinal,
          setup.workerPolicy,
          options.retryJitterMs ?? 0,
        )),
  );
  const store = {
    claimNext: vi.fn(async () => claim),
    heartbeat: vi.fn(options.heartbeat ?? (async () => undefined)),
    fenceAttempt: vi.fn(async (input) => {
      events.push("fence");
      if (options.fenceAttempt) return options.fenceAttempt(input);
      return {
        fenceId: "fence-private-001",
        fenceDigest: sha256("fence-private-001"),
        expiresAt: FENCE_EXPIRES_AT,
      };
    }),
    commitCanonicalSuccess: vi.fn(
      options.commitCanonicalSuccess ??
        (async (input) => {
          events.push("commit");
          return success(input.contentHash);
        }),
    ),
    settleFailure,
    resolveAttemptOutcome: vi.fn(
      options.resolveAttemptOutcome ??
        (async (): Promise<CaresLinkV1RegisteredWorkerPersistedOutcome> => ({
          status: "RUNNING" as const,
        })),
    ),
    recoverExpired: vi.fn(
      options.recoverExpired ??
        (async () => ({ recovered: 0, requeued: 0, failed: 0 })),
    ),
  } satisfies CaresLinkV1NoteGenerationRegisteredWorkerStore;

  const payload = {
    authorizeAttempt: vi.fn(async (input) => {
      events.push("authorize");
      if (options.authorizeAttempt) return options.authorizeAttempt(input);
      return {
        grantId: "grant-private-001",
        expiresAt: options.grantExpiresAt ?? GRANT_EXPIRES_AT,
      };
    }),
    consumeAttemptGrant: vi.fn(async (input) => {
      events.push("consume");
      if (options.consumeAttemptGrant) {
        return options.consumeAttemptGrant(input);
      }
      return structuredClone(cleanedFacts);
    }),
  } satisfies CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort;

  const provider = {
    generate: vi.fn(async (input) => {
      events.push("provider");
      lastProviderInputValue = input;
      if (options.providerGenerate) return options.providerGenerate(input);
      return providerResult(
        policy,
        setup.workerPolicy,
        input,
        candidate,
        options.evidenceCandidate ?? candidate,
        options.finishReason,
      );
    }),
  } satisfies CaresLinkV1NoteProviderPort;

  const clockTimes = [STARTED_AT, STARTED_AT, FINISHED_AT];
  const factoryOptions = {
    capability: "TEST_ONLY" as const,
    identity: IDENTITY,
    registration: setup.registration,
    workerPolicy: setup.workerPolicy,
    payloadPolicyBinding: PAYLOAD_POLICY,
    approvedProviderPolicies: setup.providerPolicies,
    store,
    payload,
    provider,
    clock: { now: () => clockTimes.shift() ?? FINISHED_AT },
    timer: timer.timer,
  };
  const createWorker = () =>
    createTestOnlyCaresLinkV1NoteGenerationRegisteredWorker(factoryOptions);
  const worker = createWorker();

  return {
    worker,
    factoryOptions,
    setup,
    claim,
    events,
    candidate,
    store,
    payload,
    provider,
    timer,
    createWorker,
    lastProviderInput() {
      return required(lastProviderInputValue);
    },
  };
}

function policySetup(
  approvedWorkerPolicy: CaresLinkV1NoteGenerationWorkerPolicy = workerPolicy(),
  providerTimeoutMs = approvedWorkerPolicy.providerDeadlineMs,
) {
  const providerPolicies = CARESLINK_V1_NOTE_TYPE_CODES.map((noteType) =>
    providerPolicy(noteType, providerTimeoutMs),
  );
  const core = {
    registrationVersion: "registered-worker.test-only.v1",
    status: "APPROVED" as const,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    workerIdentityVersion: IDENTITY.identityVersion,
    workerIdentityHash: createCaresLinkV1RegisteredWorkerIdentityHash(
      IDENTITY,
    ),
    workerPolicyVersion: approvedWorkerPolicy.version,
    workerPolicyDigest: approvedWorkerPolicy.digest,
    payloadPolicyVersion: PAYLOAD_POLICY.policyVersion,
    payloadPolicySnapshotHash: PAYLOAD_POLICY.policySnapshotHash,
    providerPolicies: providerPolicies.map((policy) => ({
      noteType: policy.noteType,
      policyVersion: policy.policyVersion,
      policyDigest: policy.policyDigest,
    })),
  };
  return {
    workerPolicy: approvedWorkerPolicy,
    providerPolicies,
    registration: createCaresLinkV1NoteGenerationWorkerRegistration(
      core,
    ),
  };
}

function workerPolicy(
  overrides: Partial<CaresLinkV1NoteGenerationWorkerPolicyDefinition> = {},
): CaresLinkV1NoteGenerationWorkerPolicy {
  const definition: CaresLinkV1NoteGenerationWorkerPolicyDefinition = {
    version: "worker-policy.test-only.v1",
    status: "APPROVED",
    maxQueueAgeMs: 60_000,
    minimumPayloadRemainingAtClaimMs: 40_000,
    leaseDurationMs: 10_000,
    heartbeatIntervalMs: 3_000,
    heartbeatSafetyMarginMs: 2_000,
    attemptDeadlineMs: 40_000,
    providerDeadlineMs: 30_000,
    commitSafetyMarginMs: 10_000,
    maxAttempts: 3,
    retryDelayMsAfterAttempt: [1_000, 2_000],
    retryableOutcomes: [...CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES],
    recoveryBatchLimit: 20,
    jitter: { mode: "NONE" },
    ...overrides,
  };
  return {
    ...definition,
    digest: createCaresLinkV1NoteGenerationWorkerPolicyDigest(definition),
  };
}

function providerPolicy(
  noteType: CaresLinkV1NoteTypeCode,
  timeoutMs: number,
  policyVersion = `policy.${noteType}.v1`,
): CaresLinkV1NoteProviderPolicySnapshot {
  const core: CaresLinkV1NoteProviderPolicyCore = {
    noteType,
    serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    rateCatalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    providerId: "provider.test-only",
    modelId: "model.test-only",
    modelRevision: "revision.test-only",
    modelRevisionAvailability: "EXACT",
    policyVersion,
    promptTemplateVersion: `prompt.${noteType}.v1`,
    goldenSetVersion: `golden.${noteType}.v1`,
    parserVersion: "parser.note-candidate.v1",
    timeoutMs,
  };
  return createCaresLinkV1NoteProviderPolicySnapshot(core);
}

function providerResult(
  policy: CaresLinkV1NoteProviderPolicySnapshot,
  approvedWorkerPolicy: CaresLinkV1NoteGenerationWorkerPolicy,
  input: Parameters<CaresLinkV1NoteProviderPort["generate"]>[0],
  candidate: unknown = CANDIDATE,
  evidenceCandidate: unknown = candidate,
  finishReason: CaresLinkV1NoteProviderFinishReason = "COMPLETED",
) {
  return {
    candidate,
    evidence: createCaresLinkV1NoteProviderAttemptEvidence({
      policySnapshot: policy,
      workerPolicyBinding: input.workerPolicyBinding,
      workerPolicy: approvedWorkerPolicy,
      candidate: evidenceCandidate,
      finishedAt: FINISHED_AT,
      finishReason,
      providerRequestId: "provider-request-sensitive-001",
      usage: { status: "UNAVAILABLE", source: "UNAVAILABLE" },
      cost: { status: "UNAVAILABLE", source: "UNAVAILABLE" },
    }),
  };
}

function settlement(
  reason: CaresLinkV1RegisteredWorkerSettleReason,
  ordinal: number,
  policy: CaresLinkV1NoteGenerationWorkerPolicy,
  jitterMs: number,
): CaresLinkV1RegisteredWorkerFailureSettlement {
  const retryable =
    (reason === "LEASE_EXPIRED" ||
      reason === "PROVIDER_TIMEOUT" ||
      reason === "PROVIDER_TRANSIENT") &&
    policy.retryableOutcomes.includes(reason) &&
    ordinal < policy.maxAttempts;
  if (retryable) {
    const baseDelayMs = required(policy.retryDelayMsAfterAttempt[ordinal - 1]);
    return {
      disposition: "RETRY_SCHEDULED",
      reason,
      payloadDisposition: "RETAINED_FOR_RETRY",
      baseDelayMs,
      jitterMs,
      retryDelayMs: baseDelayMs + jitterMs,
    };
  }
  return {
    disposition: reason === "CANCELLED" ? "CANCELLED" : "FAILED",
    reason,
    payloadDisposition: "REVOKED_PURGE_ENQUEUED",
    baseDelayMs: null,
    jitterMs: null,
    retryDelayMs: null,
  };
}

function success(contentHash: string) {
  return {
    canonicalId: "canonical-document-001",
    revisionId: "canonical-revision-001",
    contentHash,
    revisionNumber: 1 as const,
    baseRevisionId: null,
  };
}

function manualTimer() {
  const tasks: Array<{
    delayMs: number;
    onElapsed: () => void;
    cancelled: boolean;
  }> = [];
  const timer: CaresLinkV1RegisteredWorkerTimer = {
    schedule: vi.fn(({ delayMs, onElapsed }) => {
      const task = { delayMs, onElapsed, cancelled: false };
      tasks.push(task);
      return {
        cancel() {
          task.cancelled = true;
        },
      };
    }),
  };
  return {
    timer,
    tasks,
    fire(delayMs: number) {
      const task = tasks.find(
        (entry) => entry.delayMs === delayMs && !entry.cancelled,
      );
      if (!task) throw new Error(`No active timer for ${delayMs}`);
      task.onElapsed();
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Required test value is missing");
  return value;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
