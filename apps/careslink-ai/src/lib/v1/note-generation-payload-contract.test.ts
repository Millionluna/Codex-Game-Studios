import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";
import {
  CARESLINK_V1_NOTE_GENERATION_PAYLOAD_ACTIVATION_BLOCKERS,
  CARESLINK_V1_NOTE_GENERATION_PAYLOAD_CURRENT_POLICY,
  CARESLINK_V1_NOTE_GENERATION_PAYLOAD_GRANT_STATUSES,
  CARESLINK_V1_NOTE_GENERATION_PAYLOAD_RETENTION_READY,
  CARESLINK_V1_NOTE_GENERATION_PAYLOAD_STATES,
  createTestOnlyMemoryCaresLinkV1NoteGenerationPayloadRepository,
  type CaresLinkV1NoteGenerationPayloadAttemptBinding,
  type CaresLinkV1NoteGenerationPayloadJobBinding,
  type CaresLinkV1NoteGenerationPayloadPolicy,
  type CaresLinkV1NoteGenerationPayloadPrivacyBinding,
  type CaresLinkV1NoteGenerationPayloadRepository,
  type CaresLinkV1NoteGenerationPayloadSessionBinding,
  type CaresLinkV1NoteGenerationPayloadStageInput,
} from "./note-generation-payload-contract";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  type CaresLinkV1JsonObject,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAYLOAD_A = "30000000-0000-4000-8000-000000000001";
const JOB_A = "40000000-0000-4000-8000-000000000001";
const PRIVACY_A = "50000000-0000-4000-8000-000000000001";
const ATTEMPT_ONE = "60000000-0000-4000-8000-000000000001";
const ATTEMPT_TWO = "60000000-0000-4000-8000-000000000002";
const GRANT_ONE = "70000000-0000-4000-8000-000000000001";
const GRANT_TWO = "70000000-0000-4000-8000-000000000002";
const LEASE_ONE = "lease.token:payload.0001";
const LEASE_TWO = "lease.token:payload.0002";
const HANDLE = "payload.locator:private.0001";
const PURGE_EVENT = "purge.event:payload.0001";
const STAGED_AT = "2026-08-20T00:00:00.000Z";
const ACTIVATED_AT = "2026-08-20T00:00:01.000Z";
const AUTHORIZED_AT = "2026-08-20T00:00:02.000Z";
const CONSUMED_AT = "2026-08-20T00:00:03.000Z";
const LEASE_EXPIRES_AT = "2026-08-20T00:05:00.000Z";
const PAYLOAD_EXPIRES_AT = "2026-08-20T00:10:00.000Z";
const PROOF_EXPIRES_AT = "2026-08-20T00:30:00.000Z";

const TEST_POLICY: CaresLinkV1NoteGenerationPayloadPolicy = {
  policyVersion: "test-only.policy.v1",
  encryptionProfileVersion: "test-only.no-encryption",
  kmsKeyVersionResourceHash: "0".repeat(64),
  backupDispositionVersion: "test-only.no-backup",
};

describe("CaresLink V1 Note generation payload contract", () => {
  it("is source-only, retention-off, policy-free and exact-state bounded", () => {
    expect(CARESLINK_V1_NOTE_GENERATION_PAYLOAD_RETENTION_READY).toBe(false);
    expect(CARESLINK_V1_NOTE_GENERATION_PAYLOAD_CURRENT_POLICY).toBeUndefined();
    expect(CARESLINK_V1_NOTE_GENERATION_PAYLOAD_STATES).toEqual([
      "STAGED",
      "AVAILABLE",
      "REVOKED",
      "PURGE_PENDING",
      "PURGED",
      "PURGE_FAILED",
    ]);
    expect(CARESLINK_V1_NOTE_GENERATION_PAYLOAD_GRANT_STATUSES).toEqual([
      "ISSUED",
      "CONSUMED",
      "REVOKED",
      "EXPIRED",
    ]);
    expect(CARESLINK_V1_NOTE_GENERATION_PAYLOAD_ACTIVATION_BLOCKERS).toContain(
      "RETENTION_VALUES_NOT_APPROVED",
    );
  });

  it.each(CARESLINK_V1_NOTE_TYPE_CODES)(
    "stages, authorizes and consumes canonical %s facts through one shared contract",
    async (noteType) => {
      const repository = createRepository();
      const staged = await repository.stageCanonicalFacts(stageInput(noteType));
      expect(staged).toMatchObject({
        created: true,
        metadata: { noteType, state: "STAGED", shadowOnly: true },
      });
      expect(staged.metadata.policySnapshotHash).toMatch(/^[a-f0-9]{64}$/);
      expect(staged.metadata.kmsKeyVersionResourceHash).toBe(
        TEST_POLICY.kmsKeyVersionResourceHash,
      );
      expect(staged.metadata).not.toHaveProperty("cleanedFacts");
      expect(staged.metadata).not.toHaveProperty("payloadHandle");

      await repository.activate(activationInput());
      const grant = await repository.authorizeAttempt(
        authorizationInput(noteType),
      );
      expect(grant).toEqual({
        grantId: GRANT_ONE,
        expiresAt: LEASE_EXPIRES_AT,
      });
      expect(grant).not.toHaveProperty("payloadHandle");
      expect(grant).not.toHaveProperty("cleanedFacts");

      await expect(
        repository.consumeAttemptGrant(consumeInput(grant.grantId, noteType)),
      ).resolves.toEqual(createValidCaresLinkV1CleanedFacts(noteType));
      await expect(
        repository.getGrantPrivate({ grantId: grant.grantId, ownerUserId: OWNER_A }),
      ).resolves.toMatchObject({ status: "CONSUMED", consumedAt: CONSUMED_AT });
    },
  );

  it("keeps the registration-bound policy digest stable across absolute payload expiry", async () => {
    const earlier = await createRepository().stageCanonicalFacts(
      stageInput("progress", {
        expiresAt: "2026-08-20T00:09:00.000Z",
      }),
    );
    const later = await createRepository().stageCanonicalFacts(
      stageInput("progress", {
        expiresAt: PAYLOAD_EXPIRES_AT,
      }),
    );

    expect(earlier.metadata.expiresAt).not.toBe(later.metadata.expiresAt);
    expect(earlier.metadata.policySnapshotHash).toBe(
      later.metadata.policySnapshotHash,
    );
  });

  it("recomputes the canonical facts hash and accepts expiry equal to proof expiry", async () => {
    const repository = createRepository();
    await expect(
      repository.stageCanonicalFacts(
        stageInput("progress", {
          expiresAt: PROOF_EXPIRES_AT,
          privacyProofExpiresAt: PROOF_EXPIRES_AT,
        }),
      ),
    ).resolves.toMatchObject({ created: true });

    const wrongHashRepository = createRepository();
    await expect(
      wrongHashRepository.stageCanonicalFacts(
        stageInput("progress", { cleanedFactsHash: "f".repeat(64) }),
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });

    const invalidFactsRepository = createRepository();
    await expect(
      invalidFactsRepository.stageCanonicalFacts(
        stageInput("progress", {
          cleanedFacts: {
            ...createValidCaresLinkV1CleanedFacts("progress"),
            raw_paste: "must never be staged",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects payload retention beyond the exact privacy proof without guessing a TTL", async () => {
    const repository = createRepository();
    await expect(
      repository.stageCanonicalFacts(
        stageInput("progress", {
          expiresAt: "2026-08-20T00:30:00.001Z",
          privacyProofExpiresAt: PROOF_EXPIRES_AT,
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("requires an exact policy shape and canonical UTC millisecond timestamps", async () => {
    const repository = createRepository();
    await expect(
      repository.stageCanonicalFacts(
        stageInput("progress", {
          policy: {
            ...TEST_POLICY,
            backend: "must-not-be-guessed",
          } as CaresLinkV1NoteGenerationPayloadPolicy,
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      repository.stageCanonicalFacts(
        stageInput("progress", { now: "2026-08-20T10:00:00+10:00" }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("replays stage, activation and a lost authorization response without a second grant", async () => {
    const repository = createRepository();
    const input = stageInput();
    const firstStage = await repository.stageCanonicalFacts(input);
    const replayStage = await repository.stageCanonicalFacts(input);
    expect(replayStage).toEqual({ metadata: firstStage.metadata, created: false });

    const firstActivation = await repository.activate(activationInput());
    const replayActivation = await repository.activate({
      ...activationInput(),
      now: AUTHORIZED_AT,
    });
    expect(replayActivation).toEqual(firstActivation);

    const firstGrant = await repository.authorizeAttempt(authorizationInput());
    const replayGrant = await repository.authorizeAttempt(
      authorizationInput("progress", "2026-08-20T00:00:02.500Z"),
    );
    expect(replayGrant).toEqual(firstGrant);
    await expect(
      repository.getGrantPrivate({ grantId: GRANT_ONE, ownerUserId: OWNER_A }),
    ).resolves.toMatchObject({ status: "ISSUED", authorizedAt: AUTHORIZED_AT });
  });

  it("maps wrong session, privacy, lease and active attempt bindings without releasing facts", async () => {
    const cases: readonly [
      string,
      string,
      (value: ReturnType<typeof authorizationInput>) => ReturnType<typeof authorizationInput>,
    ][] = [
      [
        "session",
        "SESSION_REVOKED",
        (value) => ({
          ...value,
          session: {
            ...value.session,
            principal: { ...value.session.principal, sessionId: SESSION_B },
          },
        }),
      ],
      [
        "privacy proof",
        "PRIVACY_REVIEW_STALE",
        (value) => ({
          ...value,
          privacy: { ...value.privacy, privacyReviewId: `${PRIVACY_A.slice(0, -1)}2` },
        }),
      ],
      [
        "lease",
        "GENERATION_FAILED",
        (value) => ({ ...value, leaseToken: "lease.token:wrong.0001" }),
      ],
      [
        "attempt",
        "GENERATION_FAILED",
        (value) => ({
          ...value,
          attempt: { ...value.attempt, attemptId: ATTEMPT_TWO },
        }),
      ],
    ];

    for (const [, code, mutate] of cases) {
      const repository = createRepository();
      await stageAndActivate(repository);
      await expect(
        repository.authorizeAttempt(mutate(authorizationInput())),
      ).rejects.toMatchObject({ code });
      await expect(
        repository.getPrivate({ payloadId: PAYLOAD_A, ownerUserId: OWNER_A }),
      ).resolves.toMatchObject({ state: "AVAILABLE" });
    }
  });

  it("runtime-rejects non-running job/attempt and non-confirmed privacy bindings", async () => {
    const cases = [
      [
        "GENERATION_FAILED",
        (value: ReturnType<typeof authorizationInput>) => ({
          ...value,
          job: { ...value.job, status: "SUCCEEDED" as "RUNNING" },
        }),
      ],
      [
        "GENERATION_FAILED",
        (value: ReturnType<typeof authorizationInput>) => ({
          ...value,
          attempt: { ...value.attempt, status: "LEASE_EXPIRED" as "RUNNING" },
        }),
      ],
      [
        "PRIVACY_REVIEW_STALE",
        (value: ReturnType<typeof authorizationInput>) => ({
          ...value,
          privacy: { ...value.privacy, status: "REVOKED" as "CONFIRMED" },
        }),
      ],
    ] as const;
    for (const [code, mutate] of cases) {
      const repository = createRepository();
      await stageAndActivate(repository);
      await expect(
        repository.authorizeAttempt(mutate(authorizationInput())),
      ).rejects.toMatchObject({ code });
    }
  });

  it("denies cross-owner reads and bindings without changing owner A state", async () => {
    const repository = createRepository();
    await stageAndActivate(repository);
    await expect(
      repository.getPrivate({ payloadId: PAYLOAD_A, ownerUserId: OWNER_B }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      repository.getOwnerView({ jobId: JOB_A, ownerUserId: OWNER_B }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      repository.authorizeAttempt({
        ...authorizationInput(),
        job: { ...authorizationInput().job, ownerUserId: OWNER_B },
        attempt: { ...authorizationInput().attempt, ownerUserId: OWNER_B },
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    await expect(
      repository.getPrivate({ payloadId: PAYLOAD_A, ownerUserId: OWNER_A }),
    ).resolves.toMatchObject({ state: "AVAILABLE" });
  });

  it("allows exactly one of two concurrent consumers and fails a consume response-loss replay", async () => {
    const repository = createRepository();
    await stageAndActivate(repository);
    const grant = await repository.authorizeAttempt(authorizationInput());
    const results = await Promise.allSettled([
      repository.consumeAttemptGrant(consumeInput(grant.grantId)),
      repository.consumeAttemptGrant(consumeInput(grant.grantId)),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(
      repository.consumeAttemptGrant({
        ...consumeInput(grant.grantId, "progress", "2026-08-20T00:00:04.000Z"),
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
  });

  it("expires grants and payload authority at boundary equality", async () => {
    const repository = createRepository();
    await stageAndActivate(repository);
    const grant = await repository.authorizeAttempt(authorizationInput());
    await expect(
      repository.consumeAttemptGrant({
        ...consumeInput(grant.grantId, "progress", LEASE_EXPIRES_AT),
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    await expect(
      repository.getGrantPrivate({ grantId: grant.grantId, ownerUserId: OWNER_A }),
    ).resolves.toMatchObject({ status: "EXPIRED" });

    const expiryRepository = createRepository();
    await expiryRepository.stageCanonicalFacts(
      stageInput("progress", {
        expiresAt: ACTIVATED_AT,
        privacyProofExpiresAt: PROOF_EXPIRES_AT,
      }),
    );
    // Activation itself is denied at exact payload expiry.
    await expect(
      expiryRepository.activate({ ...activationInput(), now: ACTIVATED_AT }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
  });

  it("fresh-rechecks session and privacy at consume before releasing facts", async () => {
    const revokedSessionRepository = createRepository();
    await stageAndActivate(revokedSessionRepository);
    const sessionGrant = await revokedSessionRepository.authorizeAttempt(
      authorizationInput(),
    );
    const revokedSessionConsume = consumeInput(
      sessionGrant.grantId,
      "progress",
      CONSUMED_AT,
    );
    await expect(
      revokedSessionRepository.consumeAttemptGrant({
        ...revokedSessionConsume,
        session: {
          ...revokedSessionConsume.session,
          principal: {
            ...revokedSessionConsume.session.principal,
            sessionId: SESSION_B,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    await expect(
      revokedSessionRepository.getGrantPrivate({
        grantId: sessionGrant.grantId,
        ownerUserId: OWNER_A,
      }),
    ).resolves.toMatchObject({ status: "ISSUED" });

    const revokedPrivacyRepository = createRepository();
    await stageAndActivate(revokedPrivacyRepository);
    const privacyGrant = await revokedPrivacyRepository.authorizeAttempt(
      authorizationInput(),
    );
    const revokedPrivacyConsume = consumeInput(
      privacyGrant.grantId,
      "progress",
      CONSUMED_AT,
    );
    await expect(
      revokedPrivacyRepository.consumeAttemptGrant({
        ...revokedPrivacyConsume,
        privacy: {
          ...revokedPrivacyConsume.privacy,
          status: "REVOKED" as "CONFIRMED",
        },
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });
    await expect(
      revokedPrivacyRepository.getGrantPrivate({
        grantId: privacyGrant.grantId,
        ownerUserId: OWNER_A,
      }),
    ).resolves.toMatchObject({ status: "ISSUED" });
  });

  it("does not replay an issued grant after that grant's original expiry", async () => {
    const repository = createRepository();
    await stageAndActivate(repository);
    const first = await repository.authorizeAttempt(
      authorizationInput("progress", AUTHORIZED_AT, {
        leaseExpiresAt: CONSUMED_AT,
      }),
    );
    expect(first.expiresAt).toBe(CONSUMED_AT);

    await expect(
      repository.authorizeAttempt(
        authorizationInput("progress", CONSUMED_AT, {
          leaseExpiresAt: LEASE_EXPIRES_AT,
        }),
      ),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    await expect(
      repository.getGrantPrivate({ grantId: first.grantId, ownerUserId: OWNER_A }),
    ).resolves.toMatchObject({ status: "EXPIRED" });
  });

  it("revokes the old attempt grant when recovery authorizes a new attempt", async () => {
    const repository = createRepository([GRANT_ONE, GRANT_TWO]);
    await stageAndActivate(repository);
    const first = await repository.authorizeAttempt(authorizationInput());
    const recovered = authorizationInput(
      "progress",
      "2026-08-20T00:00:04.000Z",
      {
        attemptId: ATTEMPT_TWO,
        leaseToken: LEASE_TWO,
        leaseExpiresAt: "2026-08-20T00:06:00.000Z",
      },
    );
    const second = await repository.authorizeAttempt(recovered);
    expect(second.grantId).toBe(GRANT_TWO);
    await expect(
      repository.getGrantPrivate({ grantId: first.grantId, ownerUserId: OWNER_A }),
    ).resolves.toMatchObject({ status: "REVOKED" });
    await expect(
      repository.consumeAttemptGrant(consumeInput(first.grantId)),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    await expect(
      repository.consumeAttemptGrant(
        consumeInput(second.grantId, "progress", "2026-08-20T00:00:05.000Z", {
          attemptId: ATTEMPT_TWO,
          leaseToken: LEASE_TWO,
          leaseExpiresAt: "2026-08-20T00:06:00.000Z",
        }),
      ),
    ).resolves.toEqual(createValidCaresLinkV1CleanedFacts("progress"));
  });

  it("makes cancellation logically unavailable before a purge race can consume it", async () => {
    const repository = createRepository();
    await stageAndActivate(repository);
    const grant = await repository.authorizeAttempt(authorizationInput());
    await expect(
      repository.revoke({
        payloadId: PAYLOAD_A,
        ownerUserId: OWNER_A,
        reason: "CANCELLED",
        now: "2026-08-20T00:00:03.000Z",
      }),
    ).resolves.toMatchObject({ state: "REVOKED" });
    await repository.requestPurge({
      payloadId: PAYLOAD_A,
      ownerUserId: OWNER_A,
      reason: "CANCELLED",
      purgeEventId: PURGE_EVENT,
      now: "2026-08-20T00:00:03.000Z",
    });

    const [consume, purge] = await Promise.allSettled([
      repository.consumeAttemptGrant({
        ...consumeInput(grant.grantId, "progress", "2026-08-20T00:00:03.001Z"),
      }),
      repository.purge({
        payloadId: PAYLOAD_A,
        ownerUserId: OWNER_A,
        reason: "CANCELLED",
        purgeEventId: PURGE_EVENT,
        now: "2026-08-20T00:00:03.001Z",
      }),
    ]);
    expect(consume.status).toBe("rejected");
    expect(purge).toMatchObject({ status: "fulfilled", value: { outcome: "PURGED" } });
  });

  it("aborts an orphan, retries a content-free purge and replays completed purge idempotently", async () => {
    const repository = createRepository(undefined, ({ attemptCount }) => attemptCount === 1);
    await repository.stageCanonicalFacts(stageInput());
    const requested = await repository.abortOrphan({
      payloadId: PAYLOAD_A,
      jobId: JOB_A,
      ownerUserId: OWNER_A,
      requestHash: "b".repeat(64),
      purgeEventId: PURGE_EVENT,
      now: ACTIVATED_AT,
    });
    expect(requested).toMatchObject({ outcome: "PENDING", reason: "ORPHAN" });
    expect(requested).not.toHaveProperty("payloadId");
    expect(requested).not.toHaveProperty("ownerUserId");

    const failed = await repository.purge({
      payloadId: PAYLOAD_A,
      ownerUserId: OWNER_A,
      reason: "ORPHAN",
      purgeEventId: PURGE_EVENT,
      now: AUTHORIZED_AT,
    });
    expect(failed).toMatchObject({ outcome: "RETRY_REQUIRED", attemptCount: 1 });
    await expect(
      repository.getPrivate({ payloadId: PAYLOAD_A, ownerUserId: OWNER_A }),
    ).resolves.toMatchObject({ state: "PURGE_FAILED" });

    const purged = await repository.purge({
      payloadId: PAYLOAD_A,
      ownerUserId: OWNER_A,
      reason: "ORPHAN",
      purgeEventId: PURGE_EVENT,
      now: CONSUMED_AT,
    });
    const replay = await repository.purge({
      payloadId: PAYLOAD_A,
      ownerUserId: OWNER_A,
      reason: "ORPHAN",
      purgeEventId: PURGE_EVENT,
      now: "2026-08-20T00:00:04.000Z",
    });
    expect(purged).toMatchObject({ outcome: "PURGED", attemptCount: 2 });
    expect(replay).toEqual(purged);
  });

  it("detects corrupt stored facts at consumption and revokes the payload", async () => {
    const repository = createRepository();
    await stageAndActivate(repository);
    const grant = await repository.authorizeAttempt(authorizationInput());
    const changedFacts = {
      ...createValidCaresLinkV1CleanedFacts("progress"),
      observable_facts: "Different canonical facts",
    };
    await repository.TEST_ONLY_corruptStoredFacts({
      payloadId: PAYLOAD_A,
      ownerUserId: OWNER_A,
      cleanedFacts: changedFacts,
    });
    await expect(
      repository.consumeAttemptGrant(consumeInput(grant.grantId)),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    await expect(
      repository.getPrivate({ payloadId: PAYLOAD_A, ownerUserId: OWNER_A }),
    ).resolves.toMatchObject({ state: "REVOKED", revokeReason: "CORRUPT_PAYLOAD" });
  });

  it("keeps owner views, grants, receipts, errors and logs free of payload secrets", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const repository = createRepository();
      const input = stageInput();
      const sensitiveFact = Object.values(input.cleanedFacts as Record<string, unknown>)
        .flat()
        .find((value) => typeof value === "string") as string;
      await stageAndActivate(repository);
      const grant = await repository.authorizeAttempt(authorizationInput());
      const privateMetadata = await repository.getPrivate({
        payloadId: PAYLOAD_A,
        ownerUserId: OWNER_A,
      });
      const privateGrant = await repository.getGrantPrivate({
        grantId: grant.grantId,
        ownerUserId: OWNER_A,
      });
      const ownerView = await repository.getOwnerView({
        jobId: JOB_A,
        ownerUserId: OWNER_A,
      });

      await repository.revoke({
        payloadId: PAYLOAD_A,
        ownerUserId: OWNER_A,
        reason: "FAILED",
        now: CONSUMED_AT,
      });
      const receipt = await repository.requestPurge({
        payloadId: PAYLOAD_A,
        ownerUserId: OWNER_A,
        reason: "FAILED",
        purgeEventId: PURGE_EVENT,
        now: CONSUMED_AT,
      });
      const safeSurface = JSON.stringify({ ownerView, receipt });
      for (const secret of [
        OWNER_A,
        SESSION_A,
        PRIVACY_A,
        HANDLE,
        LEASE_ONE,
        sensitiveFact,
        "Bearer",
        "Authorization",
        "https://",
      ]) {
        expect(safeSurface).not.toContain(secret);
      }
      const privateSurface = JSON.stringify({ privateMetadata, privateGrant });
      expect(privateSurface).not.toContain(HANDLE);
      expect(privateSurface).not.toContain(LEASE_ONE);
      expect(privateSurface).not.toContain(sensitiveFact);
      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
      consoleError.mockRestore();
    }
  });

  it("rejects URL/bearer-like locators, lease credentials and purge IDs with safe errors", async () => {
    const badHandleRepository = createTestOnlyMemoryCaresLinkV1NoteGenerationPayloadRepository({
      capability: "TEST_ONLY",
      createId: () => GRANT_ONE,
      createHandle: () => "https://vault.example/payload",
    });
    await expect(
      badHandleRepository.stageCanonicalFacts(stageInput()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const repository = createRepository();
    await stageAndActivate(repository);
    await expect(
      repository.authorizeAttempt({
        ...authorizationInput(),
        leaseToken: "Bearer secret-token-value",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await repository.revoke({
      payloadId: PAYLOAD_A,
      ownerUserId: OWNER_A,
      reason: "FAILED",
      now: CONSUMED_AT,
    });
    await expect(
      repository.requestPurge({
        payloadId: PAYLOAD_A,
        ownerUserId: OWNER_A,
        reason: "FAILED",
        purgeEventId: "https://purge.example/event",
        now: CONSUMED_AT,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

function createRepository(
  grantIds: readonly string[] = [GRANT_ONE],
  shouldFailPurgeAttempt: (input: Readonly<{
    payloadId: string;
    attemptCount: number;
  }>) => boolean = () => false,
) {
  let index = 0;
  return createTestOnlyMemoryCaresLinkV1NoteGenerationPayloadRepository({
    capability: "TEST_ONLY",
    createId: () => grantIds[index++] ?? GRANT_TWO,
    createHandle: () => HANDLE,
    shouldFailPurgeAttempt,
  });
}

function stageInput(
  noteType: CaresLinkV1NoteTypeCode = "progress",
  overrides: Partial<CaresLinkV1NoteGenerationPayloadStageInput> = {},
): CaresLinkV1NoteGenerationPayloadStageInput {
  const cleanedFacts = createValidCaresLinkV1CleanedFacts(noteType);
  return {
    payloadId: PAYLOAD_A,
    jobId: JOB_A,
    ownerUserId: OWNER_A,
    noteType,
    sourceLocale: "en",
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId: PRIVACY_A,
    privacyProofExpiresAt: PROOF_EXPIRES_AT,
    cleanedFacts,
    cleanedFactsHash: canonicalHash(cleanedFacts as CaresLinkV1JsonObject),
    requestHash: "b".repeat(64),
    policy: TEST_POLICY,
    expiresAt: PAYLOAD_EXPIRES_AT,
    now: STAGED_AT,
    ...overrides,
  };
}

function activationInput() {
  return {
    payloadId: PAYLOAD_A,
    jobId: JOB_A,
    ownerUserId: OWNER_A,
    requestHash: "b".repeat(64),
    now: ACTIVATED_AT,
  } as const;
}

async function stageAndActivate(
  repository: CaresLinkV1NoteGenerationPayloadRepository,
  stageOverrides: Partial<CaresLinkV1NoteGenerationPayloadStageInput> = {},
  activationTime = ACTIVATED_AT,
) {
  await repository.stageCanonicalFacts(stageInput("progress", stageOverrides));
  return repository.activate({ ...activationInput(), now: activationTime });
}

function authorizationInput(
  noteType: CaresLinkV1NoteTypeCode = "progress",
  now = AUTHORIZED_AT,
  attemptOverrides: Readonly<{
    attemptId?: string;
    leaseToken?: string;
    leaseExpiresAt?: string;
  }> = {},
) {
  const factsHash = stageInput(noteType).cleanedFactsHash;
  const attemptId = attemptOverrides.attemptId ?? ATTEMPT_ONE;
  const leaseToken = attemptOverrides.leaseToken ?? LEASE_ONE;
  const leaseExpiresAt = attemptOverrides.leaseExpiresAt ?? LEASE_EXPIRES_AT;
  const leaseTokenHash = createHash("sha256").update(leaseToken).digest("hex");
  const job: CaresLinkV1NoteGenerationPayloadJobBinding = {
    jobId: JOB_A,
    ownerUserId: OWNER_A,
    admissionSessionId: SESSION_A,
    admissionTransport: "BEARER",
    noteType,
    sourceLocale: "en",
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId: PRIVACY_A,
    cleanedFactsHash: factsHash,
    requestHash: "b".repeat(64),
    status: "RUNNING",
    activeAttemptId: attemptId,
    activeLeaseTokenHash: leaseTokenHash,
    leaseExpiresAt,
  };
  const attempt: CaresLinkV1NoteGenerationPayloadAttemptBinding = {
    attemptId,
    jobId: JOB_A,
    ownerUserId: OWNER_A,
    status: "RUNNING",
    leaseTokenHash,
    leaseExpiresAt,
  };
  const session: CaresLinkV1NoteGenerationPayloadSessionBinding = {
    principal: { userId: OWNER_A, sessionId: SESSION_A, transport: "BEARER" },
    checkedAt: now,
  };
  const privacy: CaresLinkV1NoteGenerationPayloadPrivacyBinding = {
    ownerUserId: OWNER_A,
    privacyReviewId: PRIVACY_A,
    noteType,
    cleanedFactsHash: factsHash,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    status: "CONFIRMED",
    expiresAt: PROOF_EXPIRES_AT,
    checkedAt: now,
  };
  return {
    payloadId: PAYLOAD_A,
    leaseToken,
    job,
    attempt,
    session,
    privacy,
    now,
  } as const;
}

function consumeInput(
  grantId: string,
  noteType: CaresLinkV1NoteTypeCode = "progress",
  now = CONSUMED_AT,
  attemptOverrides: Readonly<{
    attemptId?: string;
    leaseToken?: string;
    leaseExpiresAt?: string;
  }> = {},
) {
  const authority = authorizationInput(noteType, now, attemptOverrides);
  return {
    grantId,
    payloadId: PAYLOAD_A,
    leaseToken: authority.leaseToken,
    job: authority.job,
    attempt: authority.attempt,
    session: authority.session,
    privacy: authority.privacy,
    now,
  } as const;
}

function canonicalHash(value: CaresLinkV1JsonObject) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}
