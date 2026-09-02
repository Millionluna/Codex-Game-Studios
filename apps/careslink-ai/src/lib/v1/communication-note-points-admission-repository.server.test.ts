import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_REPOSITORY_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME,
  createTestOnlyCaresLinkV1CommunicationNotePointsAdmissionRepository,
  type CaresLinkV1CommunicationNotePointsAdmissionInput,
  type CaresLinkV1NoteGenerationOwnerRepositoryQuery,
} from "./note-generation-owner-repository.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_JOB_ID = "3abc3333-3333-4333-8333-333333333333";
const PAYLOAD_ID = "44444444-4444-4444-8444-444444444444";
const PRIVACY_REVIEW_ID = "55555555-5555-4555-8555-555555555555";
const CREATED_AT = "2026-09-02T01:00:00.000Z";
const PAYLOAD_EXPIRES_AT = "2026-09-02T01:30:00.000Z";
const CLEANED_FACTS_HASH = "a".repeat(64);
const IDEMPOTENCY_HASH = "b".repeat(64);
const REQUEST_HASH = "c".repeat(64);
const PAYLOAD_HANDLE_HASH = "d".repeat(64);

const ADMISSION_SQL = `select careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
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
  $14::pg_catalog.timestamptz
) as data`;

describe("CaresLink V1 Communication Note Points admission repository", () => {
  it("remains source-only and freezes its purpose-specific RPC identity", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_REPOSITORY_READY,
    ).toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME).toBe(
      "admit_and_reserve_v1_shadow_communication_note_generation_job",
    );
    expect(Object.isFrozen(createHarness(admissionEnvelope()).repository)).toBe(
      true,
    );
  });

  it("requires the exact TEST_ONLY factory and authenticated principal", () => {
    const query = vi.fn();
    const invalid: unknown[] = [
      { capability: "LIVE", query, principal: principal() },
      {
        capability: "TEST_ONLY",
        query,
        principal: principal(),
        databaseUrl: "postgresql://private",
      },
      {
        capability: "TEST_ONLY",
        query,
        principal: { ...principal(), ownerUserId: OWNER_ID },
      },
      {
        capability: "TEST_ONLY",
        query,
        principal: { ...principal(), sessionId: "invalid" },
      },
    ];

    for (const options of invalid) {
      expect(() =>
        createTestOnlyCaresLinkV1CommunicationNotePointsAdmissionRepository(
          options as Parameters<
            typeof createTestOnlyCaresLinkV1CommunicationNotePointsAdmissionRepository
          >[0],
        ),
      ).toThrowError(
        expect.objectContaining({ code: "PRODUCT_API_DISABLED" }),
      );
    }
  });

  it("issues one exact 14-argument Communication-only admission query", async () => {
    const { repository, query } = createHarness(admissionEnvelope());

    await expect(repository.enqueue(admission())).resolves.toEqual({
      created: true,
      payloadAccepted: true,
      pointsReserved: true,
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
    expect(sql).toBe(ADMISSION_SQL);
    expect(values).toEqual([
      OWNER_ID,
      SESSION_ID,
      "BEARER",
      JOB_ID,
      PAYLOAD_ID,
      PRIVACY_REVIEW_ID,
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

  it("accepts an exact response-loss replay without claiming the new payload", async () => {
    const { repository } = createHarness(
      admissionEnvelope({
        created: false,
        payloadAccepted: false,
        job: jobWire({ jobId: OTHER_JOB_ID }),
      }),
    );

    await expect(repository.enqueue(admission())).resolves.toMatchObject({
      created: false,
      payloadAccepted: false,
      pointsReserved: true,
      job: { jobId: OTHER_JOB_ID, status: "QUEUED" },
    });
  });

  it.each([
    ["missing reservation", admissionEnvelope({ pointsReserved: false })],
    ["extra envelope field", { ...admissionEnvelope(), points: 20 }],
    [
      "wrong Note type",
      admissionEnvelope({
        created: false,
        payloadAccepted: false,
        job: jobWire({
          jobId: OTHER_JOB_ID,
          noteType: "handover",
          serviceCode: "note.handover.generate",
        }),
      }),
    ],
    [
      "created wrong job",
      admissionEnvelope({ job: jobWire({ jobId: OTHER_JOB_ID }) }),
    ],
    [
      "accepted replay payload for another job",
      admissionEnvelope({
        created: false,
        payloadAccepted: true,
        job: jobWire({ jobId: OTHER_JOB_ID }),
      }),
    ],
    [
      "created non-fresh job",
      admissionEnvelope({
        job: jobWire({
          status: "RUNNING",
          attemptCount: 1,
          startedAt: CREATED_AT,
        }),
      }),
    ],
    [
      "replayed non-quarantined job",
      admissionEnvelope({
        created: false,
        payloadAccepted: false,
        job: jobWire({
          jobId: OTHER_JOB_ID,
          status: "RUNNING",
          attemptCount: 1,
          startedAt: CREATED_AT,
        }),
      }),
    ],
  ])("rejects an incoherent coordinator envelope: %s", async (_label, data) => {
    const { repository } = createHarness(data);
    await expect(repository.enqueue(admission())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
  });

  it.each([
    ["caller note type", { ...admission(), noteType: "communication" }],
    ["raw facts", { ...admission(), cleanedFacts: { private: true } }],
    ["raw idempotency key", { ...admission(), idempotencyKey: "private" }],
    ["caller time", { ...admission(), now: CREATED_AT }],
    ["invalid job UUID", { ...admission(), jobId: "invalid" }],
    ["uppercase digest", { ...admission(), requestHash: "C".repeat(64) }],
    [
      "noncanonical expiry",
      { ...admission(), payloadExpiresAt: "2026-09-02T01:30:00Z" },
    ],
  ])("rejects %s before database access", async (_label, input) => {
    const { repository, query } = createHarness(admissionEnvelope());
    await expect(
      repository.enqueue(
        input as CaresLinkV1CommunicationNotePointsAdmissionInput,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["POINTS_INSUFFICIENT", "The shadow wallet does not have enough points"],
    ["POINT_QUOTE_EXPIRED", "The point reservation window has expired"],
  ])("maps the approved %s semantic to fixed text", async (code, message) => {
    const repository = createRepository(
      rejectingQuery({ code: "P0001", message: code, detail: "private" }),
    );
    const error = await captureError(repository.enqueue(admission()));
    expect(error).toMatchObject({ code, message });
  });

  it("collapses raw or unapproved database errors without leaking them", async () => {
    const repository = createRepository(
      rejectingQuery({
        code: "P0001",
        message: "private wallet balance is 7",
      }),
    );
    const error = await captureError(repository.enqueue(admission()));
    expect(error).toMatchObject({
      code: "PRODUCT_API_DISABLED",
      message: "The Note generation owner repository is unavailable",
    });
    expect(error.message).not.toContain("balance");
  });
});

function admission(): CaresLinkV1CommunicationNotePointsAdmissionInput {
  return {
    jobId: JOB_ID,
    payloadId: PAYLOAD_ID,
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
  };
}

function admissionEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    created: true,
    job: jobWire(),
    payloadAccepted: true,
    pointsReserved: true,
    ...overrides,
  };
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
  return createTestOnlyCaresLinkV1CommunicationNotePointsAdmissionRepository({
    capability: "TEST_ONLY",
    principal: principal(),
    query,
  });
}

function rejectingQuery(error: unknown) {
  return vi.fn(async () => {
    throw error;
  });
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
