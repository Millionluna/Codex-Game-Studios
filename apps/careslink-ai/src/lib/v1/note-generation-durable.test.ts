import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";
import {
  CARESLINK_V1_NOTE_GENERATION_DURABLE_ACTIVATION_BLOCKERS,
  CARESLINK_V1_NOTE_GENERATION_DURABLE_READY,
  CARESLINK_V1_NOTE_GENERATION_PAYLOAD_RETENTION_READY,
  createMemoryCaresLinkV1NoteGenerationDurableRepository,
  type CaresLinkV1NoteGenerationDurableEnqueueInput,
  type CaresLinkV1NoteGenerationDurableLeaseClaim,
  type CaresLinkV1NoteGenerationDurableRepository,
} from "./note-generation-durable";
import type {
  CaresLinkV1NoteGenerationCanonicalSnapshot,
  CaresLinkV1NoteGenerationPrivacyCommitBinding,
  CaresLinkV1NoteGenerationResult,
  CaresLinkV1NoteGenerationSessionCommitBinding,
} from "./note-generation-job";
import { CARESLINK_V1_NOTE_DRAFT_DISCLAIMER } from "./note-generation-output";
import { createCaresLinkV1CleanedFactsHash } from "./product-api-memory";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  getCaresLinkV1NoteType,
  type CaresLinkV1JsonObject,
  type CaresLinkV1NoteContent,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB_A = "30000000-0000-4000-8000-000000000001";
const JOB_B = "30000000-0000-4000-8000-000000000002";
const PRIVACY_A = "40000000-0000-4000-8000-000000000001";
const CANONICAL_A = "50000000-0000-4000-8000-000000000001";
const REVISION_A = "60000000-0000-4000-8000-000000000001";
const ATTEMPT_ONE = "70000000-0000-4000-8000-000000000001";
const ATTEMPT_TWO = "70000000-0000-4000-8000-000000000002";
const LEASE_ONE = "lease.token:durable.0001";
const LEASE_TWO = "lease.token:durable.0002";
const PAYLOAD_HANDLE = "payload.handle:private.0001";
const WORKER_ID = "worker.preview.1";
const ENQUEUED_AT = "2026-08-20T00:00:00.000Z";
const CLAIMED_AT = "2026-08-20T00:00:01.000Z";
const COMMITTED_AT = "2026-08-20T00:00:10.000Z";
const PAYLOAD_EXPIRES_AT = "2026-08-20T00:10:00.000Z";

describe("CaresLink V1 durable Note generation repository", () => {
  it("remains source-only, payload-retention-off and has no Points or route authority", async () => {
    type Repository = CaresLinkV1NoteGenerationDurableRepository;
    type Enqueue = CaresLinkV1NoteGenerationDurableEnqueueInput;
    type HasPoints = "points" extends keyof Repository ? true : false;
    type HasRoute = "route" extends keyof Repository ? true : false;
    type HasRawFacts = "cleanedFacts" extends keyof Enqueue ? true : false;
    type HasAccessToken = "accessToken" extends keyof Enqueue ? true : false;
    type HasRefreshToken = "refreshToken" extends keyof Enqueue ? true : false;
    type HasProviderOutput = "providerOutput" extends keyof Enqueue ? true : false;

    const boundary = {
      hasPoints: false as HasPoints,
      hasRoute: false as HasRoute,
      hasRawFacts: false as HasRawFacts,
      hasAccessToken: false as HasAccessToken,
      hasRefreshToken: false as HasRefreshToken,
      hasProviderOutput: false as HasProviderOutput,
    };

    expect(CARESLINK_V1_NOTE_GENERATION_DURABLE_READY).toBe(false);
    expect(CARESLINK_V1_NOTE_GENERATION_PAYLOAD_RETENTION_READY).toBe(false);
    expect(CARESLINK_V1_NOTE_GENERATION_DURABLE_ACTIVATION_BLOCKERS).toContain(
      "DATABASE_SCHEMA_AND_RLS_NOT_APPLIED",
    );
    expect(boundary).toEqual({
      hasPoints: false,
      hasRoute: false,
      hasRawFacts: false,
      hasAccessToken: false,
      hasRefreshToken: false,
      hasProviderOutput: false,
    });

    const repository = createMemoryCaresLinkV1NoteGenerationDurableRepository();
    await expect(repository.enqueue(enqueueInput())).rejects.toMatchObject({
      code: "GENERATION_FAILED",
    });
  });

  it("stores metadata only and exposes a separately named owner-safe view", async () => {
    const repository = createRepository();
    const { job } = await repository.enqueue(enqueueInput());
    const claim = required(
      await repository.claimNext({
        workerId: WORKER_ID,
        now: CLAIMED_AT,
        leaseDurationMs: 60_000,
      }),
    );
    const privateJob = await repository.getPrivate({
      ownerUserId: OWNER_A,
      jobId: JOB_A,
    });
    const ownerView = await repository.getOwnerView({
      ownerUserId: OWNER_A,
      jobId: JOB_A,
    });
    const attempts = await repository.listAttemptsPrivate({
      ownerUserId: OWNER_A,
      jobId: JOB_A,
    });

    expect(job.payloadHandleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(job).not.toHaveProperty("payloadHandle");
    expect(job).not.toHaveProperty("leaseToken");
    expect(job).not.toHaveProperty("cleanedFacts");
    expect(job).not.toHaveProperty("providerOutput");
    expect(privateJob.admissionSessionId).toBe(SESSION_A);
    expect(claim).not.toHaveProperty("payloadHandle");
    expect(claim.leaseToken).toBe(LEASE_ONE);
    expect(attempts).toHaveLength(1);

    const authorized = await repository.authorizePayloadUse(
      authorityInput(claim, CLAIMED_AT),
    );
    expect(authorized.payloadHandle).toBe(PAYLOAD_HANDLE);

    expect(ownerView).toEqual({
      jobId: JOB_A,
      status: "RUNNING",
      noteType: "progress",
      serviceCode: getCaresLinkV1NoteType("progress").generationServiceCode,
      attemptCount: 1,
      createdAt: ENQUEUED_AT,
      updatedAt: CLAIMED_AT,
      startedAt: CLAIMED_AT,
    });
    for (const prohibited of [
      "ownerUserId",
      "admissionSessionId",
      "admissionTransport",
      "privacyReviewId",
      "cleanedFactsHash",
      "idempotencyHash",
      "requestHash",
      "payloadHandle",
      "payloadHandleHash",
      "payloadExpiresAt",
      "activeAttemptId",
      "activeLeaseTokenHash",
      "leaseExpiresAt",
      "workerIdHash",
      "leaseToken",
    ]) {
      expect(ownerView).not.toHaveProperty(prohibited);
    }

    const persisted = JSON.stringify({ job, privateJob, attempts });
    expect(persisted).not.toContain(PAYLOAD_HANDLE);
    expect(persisted).not.toContain(LEASE_ONE);
    expect(persisted).not.toContain(WORKER_ID);
    expect(persisted).not.toContain("access-token");
    expect(persisted).not.toContain("refresh-token");
    expect(persisted).not.toContain("Only observable facts were recorded");
  });

  it("replays the same owner-scoped idempotency identity and conflicts on changed input", async () => {
    const repository = createRepository();
    const input = enqueueInput();
    const first = await repository.enqueue(input);
    const replay = await repository.enqueue(input);

    expect(first.created).toBe(true);
    expect(replay).toEqual({ job: first.job, created: false });
    await expect(
      repository.enqueue({ ...input, requestHash: "d".repeat(64) }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const ownerBInput = enqueueInput({
      jobId: JOB_B,
      ownerUserId: OWNER_B,
      admissionSessionId: SESSION_B,
    });
    await expect(repository.enqueue(ownerBInput)).resolves.toMatchObject({
      created: true,
      job: { ownerUserId: OWNER_B },
    });
  });

  it("allows only one concurrent worker to claim a queued job", async () => {
    const repository = createRepository();
    await repository.enqueue(enqueueInput());

    const claims = await Promise.all([
      repository.claimNext({
        workerId: "worker.preview.concurrent-a",
        now: CLAIMED_AT,
        leaseDurationMs: 60_000,
      }),
      repository.claimNext({
        workerId: "worker.preview.concurrent-b",
        now: CLAIMED_AT,
        leaseDurationMs: 60_000,
      }),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.filter((claim) => claim === undefined)).toHaveLength(1);
    await expect(
      repository.listAttemptsPrivate({ ownerUserId: OWNER_A, jobId: JOB_A }),
    ).resolves.toHaveLength(1);
  });

  it("renews only the active token and caps a lease at payload expiry", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository, {
      payloadExpiresAt: "2026-08-20T00:01:00.000Z",
      leaseDurationMs: 30_000,
    });

    await expect(
      repository.renewLease({
        jobId: JOB_A,
        attemptId: claim.attempt.id,
        leaseToken: "lease.token:wrong.0001",
        now: "2026-08-20T00:00:20.000Z",
        leaseDurationMs: 120_000,
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });

    const renewed = await repository.renewLease({
      jobId: JOB_A,
      attemptId: claim.attempt.id,
      leaseToken: claim.leaseToken,
      now: "2026-08-20T00:00:20.000Z",
      leaseDurationMs: 120_000,
    });
    expect(renewed.attempt.leaseExpiresAt).toBe(
      "2026-08-20T00:01:00.000Z",
    );
    expect(renewed.attempt.renewedAt).toBe("2026-08-20T00:00:20.000Z");

    await expect(
      repository.renewLease({
        jobId: JOB_A,
        attemptId: claim.attempt.id,
        leaseToken: claim.leaseToken,
        now: "2026-08-20T00:01:00.000Z",
        leaseDurationMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
  });

  it("releases a payload handle only after exact memory session/privacy bindings", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository);

    // Source-only binding evidence: this does not prove live auth.sessions or
    // privacy-row revocation; those remain disposable Preview transaction gates.
    expect(JSON.stringify(claim)).not.toContain(PAYLOAD_HANDLE);
    await expect(
      repository.authorizePayloadUse(authorityInput(claim, CLAIMED_AT)),
    ).resolves.toMatchObject({ payloadHandle: PAYLOAD_HANDLE });
  });

  it.each([
    [
      "mismatched initiating session binding",
      "SESSION_REVOKED",
      (claim: CaresLinkV1NoteGenerationDurableLeaseClaim) => ({
        ...authorityInput(claim, CLAIMED_AT),
        sessionBinding: {
          ...authorityInput(claim, CLAIMED_AT).sessionBinding,
          principal: {
            ...authorityInput(claim, CLAIMED_AT).sessionBinding.principal,
            sessionId: SESSION_B,
          },
        },
      }),
    ],
    [
      "stale privacy proof",
      "PRIVACY_REVIEW_STALE",
      (claim: CaresLinkV1NoteGenerationDurableLeaseClaim) => ({
        ...authorityInput(claim, CLAIMED_AT),
        privacyBinding: {
          ...authorityInput(claim, CLAIMED_AT).privacyBinding,
          privacyReviewId: "40000000-0000-4000-8000-000000000002",
        },
      }),
    ],
  ] as const)(
    "fails terminally before exposing a payload for a %s",
    async (_label, code, makeAuthorization) => {
      const repository = createRepository();
      const claim = await enqueueAndClaim(repository);

      await expect(
        repository.authorizePayloadUse(makeAuthorization(claim)),
      ).rejects.toMatchObject({ code });
      await expect(
        repository.getOwnerView({ ownerUserId: OWNER_A, jobId: JOB_A }),
      ).resolves.toMatchObject({ status: "FAILED", failureCode: code });
      await expect(
        repository.listAttemptsPrivate({ ownerUserId: OWNER_A, jobId: JOB_A }),
      ).resolves.toMatchObject([{ status: "FAILED", failureCode: code }]);
      await expect(
        repository.renewLease({
          jobId: JOB_A,
          attemptId: claim.attempt.id,
          leaseToken: claim.leaseToken,
          now: "2026-08-20T00:00:02.000Z",
          leaseDurationMs: 60_000,
        }),
      ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
      await expect(
        repository.commitCanonicalSuccess(
          commitInput(claim, "2026-08-20T00:00:02.000Z"),
        ),
      ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
      expect(JSON.stringify(await repository.getOwnerView({
        ownerUserId: OWNER_A,
        jobId: JOB_A,
      }))).not.toContain(PAYLOAD_HANDLE);
    },
  );

  it("recovers an expired lease at an explicit eligibility time and fences the old worker", async () => {
    const repository = createRepository();
    const first = await enqueueAndClaim(repository, { leaseDurationMs: 1_000 });
    await authorizeClaim(repository, first);
    const recovery = await repository.recoverExpired({
      now: "2026-08-20T00:00:02.000Z",
      requeueAt: "2026-08-20T00:00:05.000Z",
      maxAttempts: 2,
    });

    expect(recovery).toEqual([
      {
        jobId: JOB_A,
        expiredAttemptId: ATTEMPT_ONE,
        outcome: "REQUEUED",
      },
    ]);
    await expect(
      repository.claimNext({
        workerId: "worker.preview.early",
        now: "2026-08-20T00:00:04.999Z",
        leaseDurationMs: 60_000,
      }),
    ).resolves.toBeUndefined();

    const second = required(
      await repository.claimNext({
        workerId: "worker.preview.recovery",
        now: "2026-08-20T00:00:05.000Z",
        leaseDurationMs: 60_000,
      }),
    );
    expect(second.attempt).toMatchObject({ id: ATTEMPT_TWO, ordinal: 2 });
    expect(second.attempt).not.toHaveProperty("payloadAuthorizedAt");

    await expect(
      repository.renewLease({
        jobId: JOB_A,
        attemptId: first.attempt.id,
        leaseToken: first.leaseToken,
        now: "2026-08-20T00:00:06.000Z",
        leaseDurationMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    await expect(
      repository.commitCanonicalSuccess(
        commitInput(first, "2026-08-20T00:00:06.000Z"),
      ),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });

    await expect(
      repository.listAttemptsPrivate({ ownerUserId: OWNER_A, jobId: JOB_A }),
    ).resolves.toMatchObject([
      { id: ATTEMPT_ONE, status: "LEASE_EXPIRED" },
      { id: ATTEMPT_TWO, status: "RUNNING" },
    ]);

    await expect(
      repository.commitCanonicalSuccess(
        commitInput(second, "2026-08-20T00:00:06.000Z"),
      ),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    await authorizeClaim(repository, second, "2026-08-20T00:00:06.000Z");
    await expect(
      repository.commitCanonicalSuccess(
        commitInput(second, "2026-08-20T00:00:07.000Z"),
      ),
    ).resolves.toMatchObject({ status: "SUCCEEDED" });
  });

  it("fails terminally when the explicit retry budget is exhausted", async () => {
    const repository = createRepository();
    await enqueueAndClaim(repository, { leaseDurationMs: 1_000 });

    await expect(
      repository.recoverExpired({
        now: "2026-08-20T00:00:02.000Z",
        requeueAt: "2026-08-20T00:00:03.000Z",
        maxAttempts: 1,
      }),
    ).resolves.toEqual([
      {
        jobId: JOB_A,
        expiredAttemptId: ATTEMPT_ONE,
        outcome: "FAILED",
      },
    ]);
    await expect(
      repository.getOwnerView({ ownerUserId: OWNER_A, jobId: JOB_A }),
    ).resolves.toMatchObject({
      status: "FAILED",
      failureCode: "GENERATION_FAILED",
      attemptCount: 1,
    });
    await expect(
      repository.claimNext({
        workerId: WORKER_ID,
        now: "2026-08-20T00:00:03.000Z",
        leaseDurationMs: 60_000,
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.cancel({
        ownerUserId: OWNER_A,
        jobId: JOB_A,
        now: "2026-08-20T00:00:04.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("fails recovery instead of requeueing beyond the payload-retention boundary", async () => {
    const repository = createRepository();
    await enqueueAndClaim(repository, {
      payloadExpiresAt: "2026-08-20T00:00:04.000Z",
      leaseDurationMs: 60_000,
    });

    await expect(
      repository.recoverExpired({
        now: "2026-08-20T00:00:04.000Z",
        requeueAt: "2026-08-20T00:00:05.000Z",
        maxAttempts: 2,
      }),
    ).resolves.toEqual([
      {
        jobId: JOB_A,
        expiredAttemptId: ATTEMPT_ONE,
        outcome: "FAILED",
      },
    ]);
    await expect(
      repository.getOwnerView({ ownerUserId: OWNER_A, jobId: JOB_A }),
    ).resolves.toMatchObject({
      status: "FAILED",
      failureCode: "GENERATION_FAILED",
    });
    await expect(
      repository.claimNext({
        workerId: "worker.preview.after-retention",
        now: "2026-08-20T00:00:05.000Z",
        leaseDurationMs: 60_000,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects commit before payload authorization and permits it after authorization", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository);
    const input = commitInput(claim, COMMITTED_AT);

    await expect(repository.commitCanonicalSuccess(input)).rejects.toMatchObject({
      code: "GENERATION_FAILED",
    });
    await expect(
      repository.getCanonicalSnapshot({
        ownerUserId: OWNER_A,
        canonicalId: CANONICAL_A,
      }),
    ).resolves.toBeUndefined();
    const attemptsBeforeAuthorization =
      await repository.listAttemptsPrivate({
        ownerUserId: OWNER_A,
        jobId: JOB_A,
      });
    expect(attemptsBeforeAuthorization).toMatchObject([{ status: "RUNNING" }]);
    expect(attemptsBeforeAuthorization[0]).not.toHaveProperty(
      "payloadAuthorizedAt",
    );

    const authorized = await authorizeClaim(repository, claim, COMMITTED_AT);
    expect(authorized.attempt.payloadAuthorizedAt).toBe(COMMITTED_AT);
    await expect(repository.commitCanonicalSuccess(input)).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
  });

  it("commits one canonical revision atomically and replays an exact lost response", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository);
    await authorizeClaim(repository, claim);
    const input = commitInput(claim, COMMITTED_AT);
    const first = await repository.commitCanonicalSuccess(input);
    const replay = await repository.commitCanonicalSuccess(input);

    expect(first).toMatchObject({
      status: "SUCCEEDED",
      result: input.result,
    });
    expect(replay).toEqual(first);
    await expect(
      repository.getCanonicalSnapshot({
        ownerUserId: OWNER_A,
        canonicalId: CANONICAL_A,
      }),
    ).resolves.toEqual(input.snapshot);
    await expect(
      repository.listAttemptsPrivate({ ownerUserId: OWNER_A, jobId: JOB_A }),
    ).resolves.toMatchObject([{ status: "SUCCEEDED" }]);
  });

  it("returns 409 when a successful response-loss replay changes the result or snapshot", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository);
    await authorizeClaim(repository, claim);
    const input = commitInput(claim, COMMITTED_AT);
    await repository.commitCanonicalSuccess(input);
    const changedContent = {
      ...input.snapshot.revision.content,
      englishDraft: "A different but internally valid replay payload.",
    };
    const changedHash = canonicalHash(changedContent);

    await expect(
      repository.commitCanonicalSuccess({
        ...input,
        result: { ...input.result, contentHash: changedHash },
        snapshot: {
          ...input.snapshot,
          revision: {
            ...input.snapshot.revision,
            content: changedContent,
            contentHash: changedHash,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      repository.commitCanonicalSuccess({
        ...input,
        snapshot: {
          ...input.snapshot,
          document: {
            ...input.snapshot.document,
            updatedAt: "2026-08-20T00:00:11.000Z",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("leaves no canonical side effect when commit validation fails", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository);
    await authorizeClaim(repository, claim);
    const input = commitInput(claim, COMMITTED_AT);

    await expect(
      repository.commitCanonicalSuccess({
        ...input,
        snapshot: {
          ...input.snapshot,
          revision: {
            ...input.snapshot.revision,
            content: {
              ...input.snapshot.revision.content,
              englishDraft: "Tampered after the canonical hash was created.",
            },
          },
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      repository.getCanonicalSnapshot({
        ownerUserId: OWNER_A,
        canonicalId: CANONICAL_A,
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.getPrivate({ ownerUserId: OWNER_A, jobId: JOB_A }),
    ).resolves.toMatchObject({ status: "RUNNING" });

    await expect(repository.commitCanonicalSuccess(input)).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
  });

  it("rejects a base revision on canonical revision one", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository);
    await authorizeClaim(repository, claim);
    const input = commitInput(claim, COMMITTED_AT);

    await expect(
      repository.commitCanonicalSuccess({
        ...input,
        snapshot: {
          ...input.snapshot,
          revision: {
            ...input.snapshot.revision,
            baseRevisionId: "90000000-0000-4000-8000-000000000001",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it.each([
    ["owner", { userId: OWNER_B }, "SESSION_REVOKED"],
    ["session", { sessionId: SESSION_B }, "SESSION_REVOKED"],
    ["transport", { transport: "COOKIE" as const }, "SESSION_REVOKED"],
  ])(
    "rejects a mismatched initiating %s at the atomic commit boundary",
    async (_label, principalOverride, code) => {
      const repository = createRepository();
      const claim = await enqueueAndClaim(repository);
      await authorizeClaim(repository, claim);
      const input = commitInput(claim, COMMITTED_AT);

      await expect(
        repository.commitCanonicalSuccess({
          ...input,
          sessionBinding: {
            ...input.sessionBinding,
            principal: {
              ...input.sessionBinding.principal,
              ...principalOverride,
            },
          },
        }),
      ).rejects.toMatchObject({ code });
      await expect(
        repository.getCanonicalSnapshot({
          ownerUserId: OWNER_A,
          canonicalId: CANONICAL_A,
        }),
      ).resolves.toBeUndefined();
    },
  );

  it.each([
    ["privacy owner", { ownerUserId: OWNER_B }],
    ["privacy proof", { privacyReviewId: "40000000-0000-4000-8000-000000000002" }],
    ["facts hash", { cleanedFactsHash: "f".repeat(64) }],
    ["checked time", { checkedAt: "2026-08-20T00:00:09.999Z" }],
  ])(
    "rejects a stale %s binding at the atomic commit boundary",
    async (_label, privacyOverride) => {
      const repository = createRepository();
      const claim = await enqueueAndClaim(repository);
      await authorizeClaim(repository, claim);
      const input = commitInput(claim, COMMITTED_AT);
      const checkedAt =
        "checkedAt" in privacyOverride &&
        typeof privacyOverride.checkedAt === "string"
          ? privacyOverride.checkedAt
          : COMMITTED_AT;

      await expect(
        repository.commitCanonicalSuccess({
          ...input,
          privacyBinding: {
            ...input.privacyBinding,
            ...privacyOverride,
          },
          sessionBinding: { ...input.sessionBinding, checkedAt },
        }),
      ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });
      await expect(
        repository.getCanonicalSnapshot({
          ownerUserId: OWNER_A,
          canonicalId: CANONICAL_A,
        }),
      ).resolves.toBeUndefined();
    },
  );

  it("rejects canonical facts that differ from the reviewed facts hash", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository);
    await authorizeClaim(repository, claim);
    const input = commitInput(claim, COMMITTED_AT);
    const changedFacts = createValidCaresLinkV1CleanedFacts("progress");
    changedFacts.observable_facts = "A different reviewed fact.";
    const changedContent = {
      ...input.snapshot.revision.content,
      factsSummary: changedFacts,
    };
    const changedHash = canonicalHash(changedContent);

    await expect(
      repository.commitCanonicalSuccess({
        ...input,
        result: { ...input.result, contentHash: changedHash },
        snapshot: {
          ...input.snapshot,
          revision: {
            ...input.snapshot.revision,
            content: changedContent,
            contentHash: changedHash,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });
  });

  it.each([
    [
      "non-server disclaimer",
      (content: CaresLinkV1NoteContent) => ({
        ...content,
        disclaimer: "Provider-controlled disclaimer.",
      }),
      "VALIDATION_ERROR",
    ],
    [
      "extra canonical field",
      (content: CaresLinkV1NoteContent) => ({
        ...content,
        providerMetadata: "must not persist",
      }),
      "VALIDATION_ERROR",
    ],
    [
      "unsafe generated identity",
      (content: CaresLinkV1NoteContent) => ({
        ...content,
        englishDraft: "Contact participant@example.com for the record.",
      }),
      "GENERATION_FAILED",
    ],
  ] as const)(
    "rejects %s with zero canonical side effects",
    async (_label, mutate, code) => {
      const repository = createRepository();
      const claim = await enqueueAndClaim(repository);
      await authorizeClaim(repository, claim);
      const input = commitInput(claim, COMMITTED_AT);
      const changedContent = mutate(input.snapshot.revision.content);
      const changedHash = canonicalHash(changedContent);

      await expect(
        repository.commitCanonicalSuccess({
          ...input,
          result: { ...input.result, contentHash: changedHash },
          snapshot: {
            ...input.snapshot,
            revision: {
              ...input.snapshot.revision,
              content: changedContent,
              contentHash: changedHash,
            },
          },
        }),
      ).rejects.toMatchObject({ code });
      await expect(
        repository.getCanonicalSnapshot({
          ownerUserId: OWNER_A,
          canonicalId: CANONICAL_A,
        }),
      ).resolves.toBeUndefined();
    },
  );

  it("fails closed when payload retention expires during an active lease", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository, {
      payloadExpiresAt: "2026-08-20T00:00:05.000Z",
      leaseDurationMs: 60_000,
    });
    await authorizeClaim(repository, claim);

    expect(claim.attempt.leaseExpiresAt).toBe("2026-08-20T00:00:05.000Z");
    await expect(
      repository.commitCanonicalSuccess(
        commitInput(claim, "2026-08-20T00:00:05.000Z"),
      ),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    await expect(
      repository.getCanonicalSnapshot({
        ownerUserId: OWNER_A,
        canonicalId: CANONICAL_A,
      }),
    ).resolves.toBeUndefined();
  });

  it("enforces owner isolation for private records, owner views, attempts and canonical state", async () => {
    const repository = createRepository();
    const claim = await enqueueAndClaim(repository);
    await authorizeClaim(repository, claim);
    const input = commitInput(claim, COMMITTED_AT);
    await repository.commitCanonicalSuccess(input);

    for (const operation of [
      () => repository.getPrivate({ ownerUserId: OWNER_B, jobId: JOB_A }),
      () => repository.getOwnerView({ ownerUserId: OWNER_B, jobId: JOB_A }),
      () =>
        repository.listAttemptsPrivate({ ownerUserId: OWNER_B, jobId: JOB_A }),
      () =>
        repository.cancel({
          ownerUserId: OWNER_B,
          jobId: JOB_A,
          now: "2026-08-20T00:00:11.000Z",
        }),
    ]) {
      await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(
      repository.getCanonicalSnapshot({
        ownerUserId: OWNER_B,
        canonicalId: CANONICAL_A,
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps cancellation and failure terminal and discards their worker authority", async () => {
    const cancelledRepository = createRepository();
    const cancelledClaim = await enqueueAndClaim(cancelledRepository);
    const cancelled = await cancelledRepository.cancel({
      ownerUserId: OWNER_A,
      jobId: JOB_A,
      now: "2026-08-20T00:00:02.000Z",
    });
    await expect(
      cancelledRepository.cancel({
        ownerUserId: OWNER_A,
        jobId: JOB_A,
        now: "2026-08-20T00:00:03.000Z",
      }),
    ).resolves.toEqual(cancelled);
    await expect(
      cancelledRepository.failAttempt({
        jobId: JOB_A,
        attemptId: cancelledClaim.attempt.id,
        leaseToken: cancelledClaim.leaseToken,
        failureCode: "GENERATION_FAILED",
        now: "2026-08-20T00:00:03.000Z",
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });

    const failedRepository = createRepository();
    const failedClaim = await enqueueAndClaim(failedRepository);
    const failed = await failedRepository.failAttempt({
      jobId: JOB_A,
      attemptId: failedClaim.attempt.id,
      leaseToken: failedClaim.leaseToken,
      failureCode: "GENERATION_FAILED",
      now: "2026-08-20T00:00:02.000Z",
    });
    expect(failed).toMatchObject({ status: "FAILED" });
    await expect(
      failedRepository.cancel({
        ownerUserId: OWNER_A,
        jobId: JOB_A,
        now: "2026-08-20T00:00:03.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it.each(CARESLINK_V1_NOTE_TYPE_CODES)(
    "accepts catalog-aligned %s durable metadata",
    async (noteType) => {
      const repository = createRepository();
      await expect(
        repository.enqueue(
          enqueueInput({
            noteType,
            serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
          }),
        ),
      ).resolves.toMatchObject({ created: true, job: { noteType } });
    },
  );

  it("rejects runtime catalog, locale and service-code drift", async () => {
    const valid = enqueueInput();
    for (const input of [
      { ...valid, noteType: "unknown" as CaresLinkV1NoteTypeCode },
      { ...valid, sourceLocale: "fr" as never },
      {
        ...valid,
        serviceCode: getCaresLinkV1NoteType("ndis").generationServiceCode,
      },
    ]) {
      const repository = createRepository();
      await expect(repository.enqueue(input)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    }
  });

  it("never writes secrets, payloads, lease credentials or provider failures to logs", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const repository = createRepository();
      const claim = await enqueueAndClaim(repository);
      await repository.failAttempt({
        jobId: JOB_A,
        attemptId: claim.attempt.id,
        leaseToken: claim.leaseToken,
        failureCode: "GENERATION_FAILED",
        now: "2026-08-20T00:00:02.000Z",
      });

      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
      consoleError.mockRestore();
    }
  });

  it("rejects backdated claim, lease, authorization, cancel, commit and replay clocks", async () => {
    const backdatedClaimRepository = createRepository();
    await backdatedClaimRepository.enqueue(enqueueInput());
    await expect(
      backdatedClaimRepository.claimNext({
        workerId: WORKER_ID,
        now: "2026-08-19T23:59:59.999Z",
        leaseDurationMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const activeRepository = createRepository();
    const activeClaim = await enqueueAndClaim(activeRepository);
    await expect(
      activeRepository.renewLease({
        jobId: JOB_A,
        attemptId: activeClaim.attempt.id,
        leaseToken: activeClaim.leaseToken,
        now: ENQUEUED_AT,
        leaseDurationMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      activeRepository.authorizePayloadUse(
        authorityInput(activeClaim, ENQUEUED_AT),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      activeRepository.commitCanonicalSuccess(
        commitInput(activeClaim, ENQUEUED_AT),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const cancelRepository = createRepository();
    const cancelClaim = await enqueueAndClaim(cancelRepository);
    await authorizeClaim(
      cancelRepository,
      cancelClaim,
      "2026-08-20T00:00:05.000Z",
    );
    await expect(
      cancelRepository.cancel({
        ownerUserId: OWNER_A,
        jobId: JOB_A,
        now: "2026-08-20T00:00:03.000Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      cancelRepository.getPrivate({ ownerUserId: OWNER_A, jobId: JOB_A }),
    ).resolves.toMatchObject({ status: "RUNNING" });
    await expect(
      cancelRepository.listAttemptsPrivate({
        ownerUserId: OWNER_A,
        jobId: JOB_A,
      }),
    ).resolves.toMatchObject([
      { status: "RUNNING", payloadAuthorizedAt: "2026-08-20T00:00:05.000Z" },
    ]);
    await expect(
      cancelRepository.cancel({
        ownerUserId: OWNER_A,
        jobId: JOB_A,
        now: "2026-08-20T00:00:06.000Z",
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });

    const replayRepository = createRepository();
    const replayClaim = await enqueueAndClaim(replayRepository);
    await authorizeClaim(replayRepository, replayClaim);
    const committed = commitInput(replayClaim, COMMITTED_AT);
    await replayRepository.commitCanonicalSuccess(committed);
    await expect(
      replayRepository.commitCanonicalSuccess({
        ...committed,
        now: "2026-08-20T00:00:09.999Z",
        privacyBinding: {
          ...committed.privacyBinding,
          checkedAt: "2026-08-20T00:00:09.999Z",
        },
        sessionBinding: {
          ...committed.sessionBinding,
          checkedAt: "2026-08-20T00:00:09.999Z",
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

function createRepository() {
  const attemptIds = [ATTEMPT_ONE, ATTEMPT_TWO];
  const leaseTokens = [LEASE_ONE, LEASE_TWO];
  return createMemoryCaresLinkV1NoteGenerationDurableRepository({
    payloadCapability: "TEST_ONLY",
    createId: () => required(attemptIds.shift()),
    createLeaseToken: () => required(leaseTokens.shift()),
  });
}

function enqueueInput(
  overrides: Partial<CaresLinkV1NoteGenerationDurableEnqueueInput> = {},
): CaresLinkV1NoteGenerationDurableEnqueueInput {
  const noteType = overrides.noteType ?? "progress";
  const facts = createValidCaresLinkV1CleanedFacts(noteType);
  return {
    jobId: JOB_A,
    ownerUserId: OWNER_A,
    admissionSessionId: SESSION_A,
    admissionTransport: "BEARER",
    noteType,
    sourceLocale: "en",
    serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    cleanedFactsHash: createCaresLinkV1CleanedFactsHash(facts),
    privacyReviewId: PRIVACY_A,
    idempotencyHash: "a".repeat(64),
    requestHash: "b".repeat(64),
    payload: {
      handle: PAYLOAD_HANDLE,
      expiresAt: PAYLOAD_EXPIRES_AT,
    },
    now: ENQUEUED_AT,
    ...overrides,
  };
}

async function enqueueAndClaim(
  repository: CaresLinkV1NoteGenerationDurableRepository,
  options: Readonly<{
    payloadExpiresAt?: string;
    leaseDurationMs?: number;
  }> = {},
) {
  await repository.enqueue(
    enqueueInput({
      payload: {
        handle: PAYLOAD_HANDLE,
        expiresAt: options.payloadExpiresAt ?? PAYLOAD_EXPIRES_AT,
      },
    }),
  );
  return required(
    await repository.claimNext({
      workerId: WORKER_ID,
      now: CLAIMED_AT,
      leaseDurationMs: options.leaseDurationMs ?? 60_000,
    }),
  );
}

async function authorizeClaim(
  repository: CaresLinkV1NoteGenerationDurableRepository,
  claim: CaresLinkV1NoteGenerationDurableLeaseClaim,
  now = CLAIMED_AT,
) {
  return repository.authorizePayloadUse(authorityInput(claim, now));
}

function authorityInput(
  claim: CaresLinkV1NoteGenerationDurableLeaseClaim,
  now: string,
) {
  const privacyBinding: CaresLinkV1NoteGenerationPrivacyCommitBinding = {
    ownerUserId: OWNER_A,
    privacyReviewId: PRIVACY_A,
    noteType: "progress",
    cleanedFactsHash: claim.job.cleanedFactsHash,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    checkedAt: now,
  };
  const sessionBinding: CaresLinkV1NoteGenerationSessionCommitBinding = {
    principal: {
      userId: OWNER_A,
      sessionId: SESSION_A,
      transport: "BEARER",
    },
    checkedAt: now,
  };
  return {
    jobId: JOB_A,
    attemptId: claim.attempt.id,
    leaseToken: claim.leaseToken,
    privacyBinding,
    sessionBinding,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    now,
  } as const;
}

function commitInput(
  claim: CaresLinkV1NoteGenerationDurableLeaseClaim,
  now: string,
) {
  const { snapshot, result } = canonicalSuccess(now);
  return {
    ...authorityInput(claim, now),
    snapshot,
    result,
  } as const;
}

function canonicalSuccess(now: string): Readonly<{
  snapshot: CaresLinkV1NoteGenerationCanonicalSnapshot;
  result: CaresLinkV1NoteGenerationResult;
}> {
  const content = noteContent();
  const contentHash = canonicalHash(content);
  const result: CaresLinkV1NoteGenerationResult = {
    canonicalId: CANONICAL_A,
    revisionId: REVISION_A,
    contentHash,
    revisionNumber: 1,
    baseRevisionId: null,
    saveState: "SERVER_ACKNOWLEDGED",
  };
  return {
    result,
    snapshot: {
      document: {
        id: CANONICAL_A,
        ownerUserId: OWNER_A,
        noteType: "progress",
        sourceLocale: "en",
        lifecycleStatus: "IN_PROGRESS",
        currentRevisionId: REVISION_A,
        currentRevisionNumber: 1,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      },
      revision: {
        id: REVISION_A,
        documentId: CANONICAL_A,
        ownerUserId: OWNER_A,
        revisionNumber: 1,
        privacyReviewId: PRIVACY_A,
        content,
        contentHash,
        mutationId: `note-generation:${createHash("sha256")
          .update(JOB_A)
          .digest("hex")}`,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        createdAt: now,
      },
    },
  };
}

function noteContent(): CaresLinkV1NoteContent {
  return {
    englishDraft: "Only observable facts were recorded.",
    reviewVersions: {
      "zh-Hans": "仅记录了可观察事实。",
      "zh-Hant": "僅記錄了可觀察事實。",
    },
    factsSummary: createValidCaresLinkV1CleanedFacts("progress"),
    missingFacts: [],
    neutralWordingChecks: ["No inferred outcome."],
    followUpPrompts: [],
    disclaimer: CARESLINK_V1_NOTE_DRAFT_DISCLAIMER,
  };
}

function canonicalHash(value: CaresLinkV1JsonObject) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value))
    .digest("hex");
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a value");
  return value;
}
