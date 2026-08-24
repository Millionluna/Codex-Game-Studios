import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_NOTE_GENERATION_OWNER_REPOSITORY_READY,
  CARESLINK_V1_NOTE_GENERATION_OWNER_REPOSITORY_RPC_NAMES,
  createTestOnlyCaresLinkV1NoteGenerationOwnerRepository,
  type CaresLinkV1NoteGenerationOwnerAdmissionInput,
  type CaresLinkV1NoteGenerationOwnerRepositoryQuery,
} from "./note-generation-owner-repository.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
} from "./shared-contracts";
import { CARESLINK_V1_SERVER_SAVE_ACK } from "./transport-contract";

vi.mock("server-only", () => ({}));

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "3abc3333-3333-4333-8333-333333333333";
const PAYLOAD_ID = "44444444-4444-4444-8444-444444444444";
const PRIVACY_REVIEW_ID = "55555555-5555-4555-8555-555555555555";
const CANONICAL_ID = "66666666-6666-4666-8666-666666666666";
const REVISION_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_JOB_ID = "88888888-8888-4888-8888-888888888888";
const CLEANED_FACTS_HASH = "a".repeat(64);
const IDEMPOTENCY_HASH = "b".repeat(64);
const REQUEST_HASH = "c".repeat(64);
const PAYLOAD_HANDLE_HASH = "d".repeat(64);
const CONTENT_HASH = "e".repeat(64);
const CREATED_AT = "2026-08-24T01:00:00.000Z";
const STARTED_AT = "2026-08-24T01:01:00.000Z";
const FINISHED_AT = "2026-08-24T01:02:00.000Z";
const PAYLOAD_EXPIRES_AT = "2026-08-24T01:30:00.000Z";

const ENQUEUE_SQL = `select careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.uuid,
  $5::pg_catalog.uuid,
  $6::pg_catalog.uuid,
  $7::pg_catalog.text,
  $8::pg_catalog.text,
  $9::pg_catalog.text,
  $10::pg_catalog.text,
  $11::pg_catalog.text,
  $12::pg_catalog.text,
  $13::pg_catalog.text,
  $14::pg_catalog.text,
  $15::pg_catalog.timestamptz
) as data`;

const GET_SQL = `select careslink_v1_generation.get_v1_shadow_note_generation_job_status(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text
) as data`;

const CANCEL_SQL = `select careslink_v1_generation.cancel_v1_shadow_note_generation_job(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text
) as data`;

describe("CaresLink V1 Note generation owner repository", () => {
  it("is source-only, TEST_ONLY and freezes the exact three private RPC identities", () => {
    expect(CARESLINK_V1_NOTE_GENERATION_OWNER_REPOSITORY_READY).toBe(false);
    expect(CARESLINK_V1_NOTE_GENERATION_OWNER_REPOSITORY_RPC_NAMES).toEqual({
      enqueue: "admit_and_enqueue_v1_shadow_note_generation_job",
      get: "get_v1_shadow_note_generation_job_status",
      cancel: "cancel_v1_shadow_note_generation_job",
    });

    const { repository } = createHarness(enqueueEnvelope());
    expect(Object.isFrozen(repository)).toBe(true);
  });

  it("requires exact factory fields, a TEST_ONLY capability and an exact principal", () => {
    const query = vi.fn();
    const invalidFactories: unknown[] = [
      { capability: "LIVE", query, principal: principal() },
      {
        capability: "TEST_ONLY",
        query,
        principal: principal(),
        databaseUrl: "postgresql://secret",
      },
      { capability: "TEST_ONLY", query: "query", principal: principal() },
      {
        capability: "TEST_ONLY",
        query,
        principal: { ...principal(), ownerUserId: OWNER_ID },
      },
      {
        capability: "TEST_ONLY",
        query,
        principal: { ...principal(), sessionId: "not-a-uuid" },
      },
      {
        capability: "TEST_ONLY",
        query,
        principal: { ...principal(), transport: "HEADER" },
      },
    ];

    for (const options of invalidFactories) {
      expect(() =>
        createTestOnlyCaresLinkV1NoteGenerationOwnerRepository(
          options as Parameters<
            typeof createTestOnlyCaresLinkV1NoteGenerationOwnerRepository
          >[0],
        ),
      ).toThrowError(
        expect.objectContaining({ code: "PRODUCT_API_DISABLED" }),
      );
    }
  });

  it("does not invoke factory accessors or survive descriptor traps", () => {
    const capabilityGetter = vi.fn(() => "TEST_ONLY");
    const accessorOptions = {
      query: vi.fn(),
      principal: principal(),
    } as Record<string, unknown>;
    Object.defineProperty(accessorOptions, "capability", {
      enumerable: true,
      get: capabilityGetter,
    });
    expect(() =>
      createTestOnlyCaresLinkV1NoteGenerationOwnerRepository(
        accessorOptions as Parameters<
          typeof createTestOnlyCaresLinkV1NoteGenerationOwnerRepository
        >[0],
      ),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    expect(capabilityGetter).not.toHaveBeenCalled();

    const trapped = new Proxy(
      { capability: "TEST_ONLY", query: vi.fn(), principal: principal() },
      {
        getOwnPropertyDescriptor() {
          throw new Error("factory secret");
        },
      },
    );
    expect(() =>
      createTestOnlyCaresLinkV1NoteGenerationOwnerRepository(
        trapped as Parameters<
          typeof createTestOnlyCaresLinkV1NoteGenerationOwnerRepository
        >[0],
      ),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });

  it("maps enqueue to one exact schema-qualified 15-argument query", async () => {
    const { repository, query } = createHarness(enqueueEnvelope());

    await expect(repository.enqueue(admission())).resolves.toEqual({
      created: true,
      payloadAccepted: true,
      job: {
        jobId: JOB_ID,
        status: "QUEUED",
        noteType: "communication",
        serviceCode: "note.communication.generate",
        attemptCount: 0,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0];
    expect(sql).toBe(ENQUEUE_SQL);
    expect(values).toEqual([
      OWNER_ID,
      SESSION_ID,
      "BEARER",
      JOB_ID,
      PAYLOAD_ID,
      PRIVACY_REVIEW_ID,
      "communication",
      "en",
      CARESLINK_V1_CONTRACT_VERSION,
      CARESLINK_V1_NOTE_SCHEMA_VERSION,
      CLEANED_FACTS_HASH,
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
      PAYLOAD_HANDLE_HASH,
      PAYLOAD_EXPIRES_AT,
    ]);
    expect(Object.isFrozen(values)).toBe(true);
  });

  it("maps get and cancel to exact five-argument owner/session queries", async () => {
    const getHarness = createHarness(jobEnvelope(jobWire()));
    await expect(getHarness.repository.get({ jobId: JOB_ID })).resolves.toEqual(
      expect.objectContaining({ jobId: JOB_ID, status: "QUEUED" }),
    );
    expect(getHarness.query).toHaveBeenCalledWith(GET_SQL, [
      OWNER_ID,
      SESSION_ID,
      JOB_ID,
      CARESLINK_V1_CONTRACT_VERSION,
      CARESLINK_V1_NOTE_SCHEMA_VERSION,
    ]);
    expect(Object.isFrozen(getHarness.query.mock.calls[0][1])).toBe(true);

    const cancelled = jobWire({
      status: "CANCELLED",
      updatedAt: FINISHED_AT,
      finishedAt: FINISHED_AT,
    });
    const cancelHarness = createHarness(jobEnvelope(cancelled));
    await expect(
      cancelHarness.repository.cancel({ jobId: JOB_ID }),
    ).resolves.toEqual(
      expect.objectContaining({ jobId: JOB_ID, status: "CANCELLED" }),
    );
    expect(cancelHarness.query).toHaveBeenCalledWith(CANCEL_SQL, [
      OWNER_ID,
      SESSION_ID,
      JOB_ID,
      CARESLINK_V1_CONTRACT_VERSION,
      CARESLINK_V1_NOTE_SCHEMA_VERSION,
    ]);
  });

  it("normalizes constructor principal UUID casing once without adding identity to methods", async () => {
    const query = vi.fn(async () => queryResult(jobEnvelope(jobWire())));
    const repository =
      createTestOnlyCaresLinkV1NoteGenerationOwnerRepository({
        capability: "TEST_ONLY",
        query,
        principal: {
          userId: OWNER_ID.toUpperCase(),
          sessionId: SESSION_ID.toUpperCase(),
          transport: "COOKIE",
        },
      });

    await repository.get({ jobId: JOB_ID.toUpperCase() });
    expect(query).toHaveBeenCalledWith(GET_SQL, [
      OWNER_ID,
      SESSION_ID,
      JOB_ID,
      CARESLINK_V1_CONTRACT_VERSION,
      CARESLINK_V1_NOTE_SCHEMA_VERSION,
    ]);
  });

  it("keeps the serializable owner job free of private admission material", async () => {
    const { repository } = createHarness(enqueueEnvelope());
    const result = await repository.enqueue(admission());
    const serializedJob = JSON.stringify(result.job).toLowerCase();
    for (const forbidden of [
      "owner",
      "session",
      "privacy",
      "facts",
      "idempotency",
      "requesthash",
      "payload",
      "lease",
      "grant",
      "worker",
      "policy",
      "token",
      "locator",
    ]) {
      expect(serializedJob).not.toContain(forbidden);
    }
  });

  it.each([
    ["extra owner", { ...admission(), ownerUserId: OWNER_ID }],
    ["extra session", { ...admission(), sessionId: SESSION_ID }],
    ["raw facts", { ...admission(), cleanedFacts: { note: "private" } }],
    ["raw key", { ...admission(), idempotencyKey: "raw-private-key" }],
    ["lease", { ...admission(), leaseToken: "private-lease-token" }],
    ["caller time", { ...admission(), now: CREATED_AT }],
    ["extra symbol", withSymbol(admission())],
    ["inherited input", Object.assign(Object.create({ owner: OWNER_ID }), admission())],
  ])("rejects %s before executing SQL", async (_label, input) => {
    const { repository, query } = createHarness(enqueueEnvelope());
    await expect(
      repository.enqueue(
        input as CaresLinkV1NoteGenerationOwnerAdmissionInput,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["job UUID", { jobId: "bad" }],
    ["payload UUID", { payloadId: "bad" }],
    ["privacy UUID", { privacyReviewId: "bad" }],
    ["note type", { noteType: "other" }],
    ["locale", { sourceLocale: "fr" }],
    ["facts hash", { cleanedFactsHash: "A".repeat(64) }],
    ["idempotency hash", { idempotencyHash: "short" }],
    ["request hash", { requestHash: "g".repeat(64) }],
    ["payload handle hash", { payloadHandleHash: "" }],
    ["payload expiry", { payloadExpiresAt: "2026-08-24T01:30:00Z" }],
  ])("rejects an invalid %s locally", async (_label, override) => {
    const { repository, query } = createHarness(enqueueEnvelope());
    await expect(
      repository.enqueue({ ...admission(), ...override } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects input accessors and Proxy traps without executing SQL", async () => {
    const jobIdGetter = vi.fn(() => JOB_ID);
    const accessor = { ...admission() } as Record<string, unknown>;
    Object.defineProperty(accessor, "jobId", {
      enumerable: true,
      get: jobIdGetter,
    });
    const first = createHarness(enqueueEnvelope());
    await expect(
      first.repository.enqueue(
        accessor as CaresLinkV1NoteGenerationOwnerAdmissionInput,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(jobIdGetter).not.toHaveBeenCalled();
    expect(first.query).not.toHaveBeenCalled();

    const trapped = new Proxy(admission(), {
      getOwnPropertyDescriptor() {
        throw new Error("private input");
      },
    });
    const second = createHarness(enqueueEnvelope());
    await expect(second.repository.enqueue(trapped)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(second.query).not.toHaveBeenCalled();
  });

  it.each([
    ["queued", jobWire()],
    [
      "requeued",
      jobWire({
        attemptCount: 1,
        startedAt: STARTED_AT,
        updatedAt: FINISHED_AT,
      }),
    ],
    [
      "running",
      jobWire({
        status: "RUNNING",
        attemptCount: 1,
        startedAt: STARTED_AT,
        updatedAt: STARTED_AT,
      }),
    ],
    [
      "succeeded",
      jobWire({
        status: "SUCCEEDED",
        attemptCount: 1,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
        result: generationResult(),
      }),
    ],
    [
      "failed",
      jobWire({
        status: "FAILED",
        attemptCount: 1,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
        failureCode: "GENERATION_FAILED",
      }),
    ],
    [
      "failed after session revocation",
      jobWire({
        status: "FAILED",
        attemptCount: 1,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
        failureCode: "SESSION_REVOKED",
      }),
    ],
    [
      "failed after privacy proof expiry",
      jobWire({
        status: "FAILED",
        attemptCount: 1,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
        failureCode: "PRIVACY_REVIEW_STALE",
      }),
    ],
    [
      "cancelled before claim",
      jobWire({
        status: "CANCELLED",
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
      }),
    ],
  ])("accepts the exact owner-safe %s projection", async (_label, wire) => {
    const { repository } = createHarness(jobEnvelope(wire));
    const job = await repository.get({ jobId: JOB_ID });
    expect(job.jobId).toBe(JOB_ID);
    expect(Object.isFrozen(job)).toBe(true);
    if (job.result) expect(Object.isFrozen(job.result)).toBe(true);
  });

  it("accepts terminal idempotency replay and exposes orphan-cleanup evidence only beside the job", async () => {
    const succeeded = jobWire({
      jobId: OTHER_JOB_ID,
      status: "SUCCEEDED",
      attemptCount: 1,
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      updatedAt: FINISHED_AT,
      result: generationResult(),
    });
    const { repository } = createHarness(
      enqueueEnvelope({
        created: false,
        payloadAccepted: false,
        job: succeeded,
      }),
    );
    await expect(repository.enqueue(admission())).resolves.toMatchObject({
      created: false,
      payloadAccepted: false,
      job: { jobId: OTHER_JOB_ID, status: "SUCCEEDED" },
    });
  });

  it.each([
    [
      "created without payload acceptance",
      enqueueEnvelope({ payloadAccepted: false }),
    ],
    [
      "created non-queued job",
      enqueueEnvelope({ job: jobWire({ status: "RUNNING", attemptCount: 1, startedAt: STARTED_AT, updatedAt: STARTED_AT }) }),
    ],
    [
      "created queued retry",
      enqueueEnvelope({
        job: jobWire({
          attemptCount: 1,
          startedAt: STARTED_AT,
          updatedAt: STARTED_AT,
        }),
      }),
    ],
    [
      "created timestamp drift",
      enqueueEnvelope({ job: jobWire({ updatedAt: STARTED_AT }) }),
    ],
    [
      "created wrong job",
      enqueueEnvelope({ job: jobWire({ jobId: OTHER_JOB_ID }) }),
    ],
    [
      "accepted payload for another job",
      enqueueEnvelope({
        created: false,
        payloadAccepted: true,
        job: jobWire({ jobId: OTHER_JOB_ID }),
      }),
    ],
    [
      "wrong Note type",
      enqueueEnvelope({
        created: false,
        payloadAccepted: false,
        job: jobWire({
          jobId: OTHER_JOB_ID,
          noteType: "handover",
          serviceCode: "note.handover.generate",
        }),
      }),
    ],
  ])("rejects an incoherent enqueue envelope: %s", async (_label, data) => {
    const { repository } = createHarness(data);
    await expect(repository.enqueue(admission())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
  });

  it("requires get/cancel response identity and cancellation state", async () => {
    const wrongGet = createHarness(
      jobEnvelope(jobWire({ jobId: OTHER_JOB_ID })),
    );
    await expect(wrongGet.repository.get({ jobId: JOB_ID })).rejects.toMatchObject(
      { code: "PRODUCT_API_DISABLED" },
    );

    const notCancelled = createHarness(jobEnvelope(jobWire()));
    await expect(
      notCancelled.repository.cancel({ jobId: JOB_ID }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it.each([
    ["service binding", jobWire({ serviceCode: "note.handover.generate" })],
    ["status", jobWire({ status: "WAITING" })],
    ["unsafe attempt count", jobWire({ attemptCount: Number.MAX_SAFE_INTEGER + 1 })],
    ["negative attempt count", jobWire({ attemptCount: -1 })],
    ["uppercase response UUID", jobWire({ jobId: JOB_ID.toUpperCase() })],
    ["noncanonical time", jobWire({ createdAt: "2026-08-24T01:00:00Z" })],
    ["backwards update", jobWire({ updatedAt: "2026-08-23T23:59:59.000Z" })],
    ["attempt without start", jobWire({ attemptCount: 1 })],
    ["start without attempt", jobWire({ startedAt: STARTED_AT, updatedAt: STARTED_AT })],
    [
      "running without start",
      jobWire({ status: "RUNNING", attemptCount: 1 }),
    ],
    [
      "success without result",
      jobWire({
        status: "SUCCEEDED",
        attemptCount: 1,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
      }),
    ],
    ["result on queue", jobWire({ result: generationResult() })],
    [
      "internal failure reason",
      jobWire({
        status: "FAILED",
        attemptCount: 1,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
        failureCode: "PROVIDER_TIMEOUT",
      }),
    ],
    [
      "admission-only failure reason",
      jobWire({
        status: "FAILED",
        attemptCount: 1,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
        failureCode: "PRIVACY_REVIEW_REQUIRED",
      }),
    ],
    [
      "failure code on cancellation",
      jobWire({
        status: "CANCELLED",
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
        failureCode: "GENERATION_FAILED",
      }),
    ],
    [
      "invalid result revision",
      jobWire({
        status: "SUCCEEDED",
        attemptCount: 1,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
        result: { ...generationResult(), revisionNumber: 2 },
      }),
    ],
  ])("rejects owner projection drift: %s", async (_label, wire) => {
    const { repository } = createHarness(jobEnvelope(wire));
    await expect(repository.get({ jobId: JOB_ID })).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
  });

  it("requires exact plain wire envelopes and nested records", async () => {
    const extraEnvelope = createHarness({
      ...jobEnvelope(jobWire()),
      ownerUserId: OWNER_ID,
    });
    await expect(
      extraEnvelope.repository.get({ jobId: JOB_ID }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });

    const missingJobKey = jobWire();
    delete missingJobKey.failureCode;
    const missing = createHarness(jobEnvelope(missingJobKey));
    await expect(missing.repository.get({ jobId: JOB_ID })).rejects.toMatchObject(
      { code: "PRODUCT_API_DISABLED" },
    );

    const extraJob = createHarness(
      jobEnvelope({ ...jobWire(), privacyReviewId: PRIVACY_REVIEW_ID }),
    );
    await expect(extraJob.repository.get({ jobId: JOB_ID })).rejects.toMatchObject(
      { code: "PRODUCT_API_DISABLED" },
    );

    const symbolJob = createHarness(jobEnvelope(withSymbol(jobWire())));
    await expect(symbolJob.repository.get({ jobId: JOB_ID })).rejects.toMatchObject(
      { code: "PRODUCT_API_DISABLED" },
    );

    const inheritedJob = Object.assign(
      Object.create({ ownerUserId: OWNER_ID }),
      jobWire(),
    );
    const inherited = createHarness(jobEnvelope(inheritedJob));
    await expect(
      inherited.repository.get({ jobId: JOB_ID }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("does not invoke response accessors or leak Proxy trap text", async () => {
    const jobIdGetter = vi.fn(() => JOB_ID);
    const accessorJob = jobWire();
    Object.defineProperty(accessorJob, "jobId", {
      enumerable: true,
      get: jobIdGetter,
    });
    const accessor = createHarness(jobEnvelope(accessorJob));
    await expect(accessor.repository.get({ jobId: JOB_ID })).rejects.toMatchObject(
      { code: "PRODUCT_API_DISABLED" },
    );
    expect(jobIdGetter).not.toHaveBeenCalled();

    const proxyJob = new Proxy(jobWire(), {
      getOwnPropertyDescriptor() {
        throw new Error("raw facts from trap");
      },
    });
    const proxy = createHarness(jobEnvelope(proxyJob));
    const error = await captureError(proxy.repository.get({ jobId: JOB_ID }));
    expect(error).toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(error.message).not.toContain("raw facts");
  });

  it.each([
    ["zero rows", { rows: [] }],
    ["multiple rows", { rows: [{ data: jobEnvelope(jobWire()) }, { data: {} }] }],
    ["null data", { rows: [{ data: null }] }],
    ["extra row key", { rows: [{ data: jobEnvelope(jobWire()), private: true }] }],
    ["missing rows", {}],
  ])("rejects malformed query result: %s", async (_label, result) => {
    const query = vi.fn(async () => result);
    const repository = createRepository(query);
    await expect(repository.get({ jobId: JOB_ID })).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
  });

  it("rejects a query row slot accessor without invoking it", async () => {
    const rowGetter = vi.fn(() => ({ data: jobEnvelope(jobWire()) }));
    const rows: unknown[] = Array.from({ length: 1 });
    Object.defineProperty(rows, "0", { enumerable: true, get: rowGetter });
    const query = vi.fn(async () => ({ rows }));
    const repository = createRepository(query);
    await expect(repository.get({ jobId: JOB_ID })).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(rowGetter).not.toHaveBeenCalled();
  });

  it.each([
    ["SESSION_REVOKED", "The authenticated session is no longer active"],
    ["NOT_FOUND", "The requested generation job was not found"],
    ["MIN_CLIENT_VERSION", "The Note generation contract version is unsupported"],
    [
      "PRIVACY_REVIEW_REQUIRED",
      "A valid privacy review is required before generation",
    ],
    ["PRIVACY_REVIEW_STALE", "Privacy review must be repeated before generation"],
    [
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for different input",
    ],
    [
      "IDENTITY_LINK_CONFLICT",
      "The staged payload identity conflicts with the existing generation request",
    ],
    [
      "INVALID_STATE_TRANSITION",
      "The generation job cannot be cancelled in its current state",
    ],
    ["PRODUCT_API_DISABLED", "The Note generation owner repository is unavailable"],
    ["VALIDATION_ERROR", "The Note generation owner request was rejected"],
  ])("preserves only the fixed P0001 owner semantic %s", async (code, message) => {
    const repository = createRepository(
      rejectingQuery({
        code: "P0001",
        message: code,
        details: "private details",
        hint: "private hint",
      }),
    );
    const error = await captureError(repository.get({ jobId: JOB_ID }));
    expect(error).toBeInstanceOf(CaresLinkV1ContractError);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.message).not.toContain("private");
  });

  it("maps PostgreSQL permission denial to one fixed FORBIDDEN error", async () => {
    const repository = createRepository(
      rejectingQuery({
        code: "42501",
        message: "permission denied for secret relation",
      }),
    );
    const error = await captureError(repository.get({ jobId: JOB_ID }));
    expect(error).toEqual(
      expect.objectContaining({
        code: "FORBIDDEN",
        message: "The authenticated session cannot perform this operation",
      }),
    );
  });

  it.each([
    [{ code: "XX000", message: "database host and private SQL" }],
    [{ code: "23505", message: "IDEMPOTENCY_CONFLICT" }],
    [{ code: "P0001", message: "POLICY_MISMATCH" }],
    [{ code: "P0001", message: "PAYLOAD_UNAVAILABLE" }],
    [{ code: "P0001", message: "INTERNAL_FAILURE" }],
    [{ code: "P0001", message: "AUTH_REQUIRED" }],
    [{ code: "P0001", message: "FORBIDDEN" }],
    [{ code: "P0001", message: "MINIMUM_FACTS_REQUIRED" }],
    ["raw thrown secret"],
  ])("collapses an unapproved database error %#", async (databaseError) => {
    const repository = createRepository(rejectingQuery(databaseError));
    const error = await captureError(repository.get({ jobId: JOB_ID }));
    expect(error).toEqual(
      expect.objectContaining({
        code: "PRODUCT_API_DISABLED",
        message: "The Note generation owner repository is unavailable",
      }),
    );
    expect(error.message).not.toContain("private");
    expect(error.message).not.toContain("secret");
  });

  it("does not invoke database error accessors or expose descriptor traps", async () => {
    const messageGetter = vi.fn(() => "NOT_FOUND");
    const accessorError = { code: "P0001" } as Record<string, unknown>;
    Object.defineProperty(accessorError, "message", {
      enumerable: true,
      get: messageGetter,
    });
    const accessorRepository = createRepository(
      rejectingQuery(accessorError),
    );
    await expect(
      accessorRepository.get({ jobId: JOB_ID }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(messageGetter).not.toHaveBeenCalled();

    const trappedError = new Proxy(
      { code: "P0001", message: "NOT_FOUND" },
      {
        getOwnPropertyDescriptor() {
          throw new Error("database trap secret");
        },
      },
    );
    const trappedRepository = createRepository(rejectingQuery(trappedError));
    const error = await captureError(
      trappedRepository.get({ jobId: JOB_ID }),
    );
    expect(error).toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(error.message).not.toContain("secret");
  });
});

function admission(): CaresLinkV1NoteGenerationOwnerAdmissionInput {
  return {
    jobId: JOB_ID,
    payloadId: PAYLOAD_ID,
    noteType: "communication",
    sourceLocale: "en",
    privacyReviewId: PRIVACY_REVIEW_ID,
    cleanedFactsHash: CLEANED_FACTS_HASH,
    idempotencyHash: IDEMPOTENCY_HASH,
    requestHash: REQUEST_HASH,
    payloadHandleHash: PAYLOAD_HANDLE_HASH,
    payloadExpiresAt: PAYLOAD_EXPIRES_AT,
  };
}

function principal() {
  return {
    userId: OWNER_ID,
    sessionId: SESSION_ID,
    transport: "BEARER" as const,
  };
}

function generationResult() {
  return {
    canonicalId: CANONICAL_ID,
    revisionId: REVISION_ID,
    contentHash: CONTENT_HASH,
    revisionNumber: 1,
    baseRevisionId: null,
    saveState: CARESLINK_V1_SERVER_SAVE_ACK,
  };
}

function jobWire(overrides: Record<string, unknown> = {}) {
  return {
    jobId: JOB_ID,
    status: "QUEUED",
    noteType: "communication",
    serviceCode: "note.communication.generate",
    attemptCount: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    startedAt: null,
    finishedAt: null,
    failureCode: null,
    result: null,
    ...overrides,
  } as Record<string, unknown>;
}

function enqueueEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    created: true,
    payloadAccepted: true,
    job: jobWire(),
    ...overrides,
  };
}

function jobEnvelope(job: unknown) {
  return { job };
}

function queryResult(data: unknown) {
  return { rows: [{ data }] };
}

function createHarness(data: unknown) {
  const query = vi.fn(
    async (sql: string, values: readonly unknown[]) => {
      void sql;
      void values;
      return queryResult(data);
    },
  );
  return { repository: createRepository(query), query };
}

function createRepository(query: CaresLinkV1NoteGenerationOwnerRepositoryQuery) {
  return createTestOnlyCaresLinkV1NoteGenerationOwnerRepository({
    capability: "TEST_ONLY",
    query,
    principal: principal(),
  });
}

function rejectingQuery(error: unknown) {
  return vi.fn(async () => {
    throw error;
  });
}

function withSymbol<T extends object>(value: T) {
  Object.defineProperty(value, Symbol("private"), {
    enumerable: true,
    value: "private",
  });
  return value;
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CaresLinkV1ContractError);
    return error as CaresLinkV1ContractError;
  }
  throw new Error("Expected operation to fail");
}
