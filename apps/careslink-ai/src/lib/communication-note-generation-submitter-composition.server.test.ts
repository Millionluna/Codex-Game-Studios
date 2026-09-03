import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { scanCaresLinkV1CleanedFacts } from "./v1/privacy-review-scanner.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CaresLinkV1ContractError,
} from "./v1/shared-contracts";
import { stringifyCaresLinkV1CanonicalJson } from "./v1/canonical-json";
import {
  CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_READY,
  CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_TEST_CAPABILITY,
  COMMUNICATION_NOTE_GENERATION_FORMAL_SUBMITTER_COMPOSITION,
  createCommunicationNoteGenerationSubmitterComposition,
  createTestOnlyCommunicationNoteGenerationSubmitterComposition,
  type CommunicationNoteGenerationPayloadStager,
  type CommunicationNoteGenerationPrivacyReviewIssuer,
} from "./communication-note-generation-submitter-composition.server";
import type { CommunicationNoteGenerationCommand } from "./communication-note-generation-route.server";
import type { CaresLinkV1CommunicationNotePointsAdmissionRepository } from "./v1/note-generation-owner-repository.server";

vi.mock("server-only", () => ({}));

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const PRIVACY_REVIEW_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const PAYLOAD_ID = "55555555-5555-4555-8555-555555555555";
const REPLAY_JOB_ID = "66666666-6666-4666-8666-666666666666";
const IDEMPOTENCY_KEY = "communication-note-request-0001";
const CONFIRMED_AT = "2026-09-03T02:00:00.000Z";
const PAYLOAD_EXPIRES_AT = "2026-09-03T02:20:00.000Z";
const PROOF_EXPIRES_AT = "2026-09-03T02:30:00.000Z";
const CREATED_AT = "2026-09-03T02:00:01.000Z";
const PAYLOAD_POLICY_VERSION = "2026-09-03.communication-preview.1";
const ENCRYPTION_PROFILE_VERSION = "aes-256-gcm-envelope.1";
const BACKUP_DISPOSITION_VERSION = "gcs-no-soft-delete.1";
const PAYLOAD_POLICY_SNAPSHOT_HASH = "b".repeat(64);
const KMS_KEY_VERSION_RESOURCE_HASH = "c".repeat(64);

const CLEANED_FACTS = Object.freeze({
  occurred_at: "2026-09-03T12:00:00+10:00",
  contact_channel: "Phone",
  parties_by_role: ["Participant", "Support coordinator"],
  observable_facts: "The participant requested a schedule update.",
  action_taken: "The coordinator confirmed the next contact window.",
  stated_outcome: "The participant acknowledged the update.",
  follow_up: "Confirm the schedule at the next contact.",
});

const SCAN = scanCaresLinkV1CleanedFacts(CLEANED_FACTS);

describe("Communication Note product submitter composition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("remains source-only and has no formal runtime submitter", () => {
    expect(CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_READY).toBe(false);
    expect(COMMUNICATION_NOTE_GENERATION_FORMAL_SUBMITTER_COMPOSITION).toBeUndefined();

    const source = readFileSync(
      new URL(
        "./communication-note-generation-submitter-composition.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /openai|provider\.generate|runNext|registered-worker|setInterval|setTimeout|cron/i,
    );
    expect(source).not.toContain("process.env");
  });

  it("confirms privacy, stages exact facts, reserves 20 Points and returns only the owner-safe admission", async () => {
    const events: string[] = [];
    const harness = createHarness({ events });

    const result = await harness.submitter.submit(command());

    expect(events).toEqual(["privacy", "repository", "stage", "admission"]);
    expect(result).toEqual({ created: true, job: ownerJob() });
    expect(Object.keys(result).sort()).toEqual(["created", "job"]);
    expect(JSON.stringify(result)).not.toMatch(
      /payload|pointsReserved|reservation|quote|ownerUserId|privacyReview/i,
    );

    expect(harness.privacyReviewIssuer.confirm).toHaveBeenCalledExactlyOnceWith({
      principal: { userId: OWNER_ID, sessionId: SESSION_ID, transport: "COOKIE" },
      noteType: "communication",
      cleanedFactsHash: SCAN.cleanedFactsHash,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      scannerPolicyVersion: SCAN.scannerPolicyVersion,
      reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
      findingDecisions: [],
      deIdentificationConfirmed: true,
      authorityToProcessConfirmed: true,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    const requestHash = hashCanonical({
      noteType: "communication",
      sourceLocale: "en",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      privacyReviewId: PRIVACY_REVIEW_ID,
      cleanedFacts: CLEANED_FACTS,
    });
    const idempotencyHash = sha256(IDEMPOTENCY_KEY);
    expect(harness.payloadStager.stageCanonicalFacts).toHaveBeenCalledExactlyOnceWith({
      ownerUserId: OWNER_ID,
      noteType: "communication",
      sourceLocale: "en",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      privacyReviewId: PRIVACY_REVIEW_ID,
      privacyProofExpiresAt: PROOF_EXPIRES_AT,
      cleanedFacts: CLEANED_FACTS,
      cleanedFactsHash: SCAN.cleanedFactsHash,
      idempotencyHash,
      requestHash,
    });
    expect(harness.enqueue).toHaveBeenCalledExactlyOnceWith({
      jobId: JOB_ID,
      payloadId: PAYLOAD_ID,
      sourceLocale: "en",
      privacyReviewId: PRIVACY_REVIEW_ID,
      cleanedFactsHash: SCAN.cleanedFactsHash,
      idempotencyHash,
      requestHash,
      payloadHandleHash: "a".repeat(64),
      payloadExpiresAt: PAYLOAD_EXPIRES_AT,
      payloadPolicyVersion: PAYLOAD_POLICY_VERSION,
      payloadPolicySnapshotHash: PAYLOAD_POLICY_SNAPSHOT_HASH,
      encryptionProfileVersion: ENCRYPTION_PROFILE_VERSION,
      kmsKeyVersionResourceHash: KMS_KEY_VERSION_RESOURCE_HASH,
      backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
    });
    expect(harness.payloadStager.abortUnaccepted).not.toHaveBeenCalled();
  });

  it("purges only the replacement payload explicitly rejected by a replay", async () => {
    const harness = createHarness({
      admission: {
        created: false,
        payloadAccepted: false,
        pointsReserved: true,
        job: ownerJob({ jobId: REPLAY_JOB_ID }),
      },
    });

    await expect(harness.submitter.submit(command())).resolves.toEqual({
      created: false,
      job: ownerJob({ jobId: REPLAY_JOB_ID }),
    });
    expect(harness.payloadStager.abortUnaccepted).toHaveBeenCalledExactlyOnceWith({
      ownerUserId: OWNER_ID,
      idempotencyHash: sha256(IDEMPOTENCY_KEY),
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      staged: stagedPayload(),
      reason: "PAYLOAD_NOT_ACCEPTED",
    });
  });

  it("retains the bounded payload after a Points rejection because a prior replay may already have committed", async () => {
    const rejection = new CaresLinkV1ContractError(
      "POINTS_INSUFFICIENT",
      "private database text",
    );
    const harness = createHarness({ admissionError: rejection });

    await expect(harness.submitter.submit(command())).rejects.toBe(rejection);
    expect(harness.payloadStager.abortUnaccepted).not.toHaveBeenCalled();
  });

  it("replays the identical proof, staged receipt and admission binding after response loss", async () => {
    const harness = createHarness();
    harness.enqueue
      .mockRejectedValueOnce(new Error("response lost after commit"))
      .mockResolvedValueOnce({
        created: false,
        payloadAccepted: true,
        pointsReserved: true,
        job: ownerJob(),
      });

    await expect(harness.submitter.submit(command())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    await expect(harness.submitter.submit(command())).resolves.toEqual({
      created: false,
      job: ownerJob(),
    });

    expect(harness.privacyReviewIssuer.confirm).toHaveBeenCalledTimes(2);
    expect(harness.confirm.mock.calls[1]?.[0]).toEqual(
      harness.confirm.mock.calls[0]?.[0],
    );
    expect(harness.payloadStager.stageCanonicalFacts).toHaveBeenCalledTimes(2);
    expect(harness.stageCanonicalFacts.mock.calls[1]?.[0]).toEqual(
      harness.stageCanonicalFacts.mock.calls[0]?.[0],
    );
    expect(harness.enqueue.mock.calls[1]?.[0]).toEqual(
      harness.enqueue.mock.calls[0]?.[0],
    );
    expect(harness.payloadStager.abortUnaccepted).not.toHaveBeenCalled();
  });

  it.each([
    [new Error("connection ended"), "unknown transport failure"],
    [
      new CaresLinkV1ContractError("PRODUCT_API_DISABLED", "response unknown"),
      "normalized response-loss failure",
    ],
  ])("retains the bounded staged payload after %s: %s", async (error) => {
    const harness = createHarness({ admissionError: error });

    await expect(harness.submitter.submit(command())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.payloadStager.abortUnaccepted).not.toHaveBeenCalled();
  });

  it("fails closed when required cleanup cannot be requested", async () => {
    const harness = createHarness({
      admission: {
        created: false,
        payloadAccepted: false,
        pointsReserved: true,
        job: ownerJob({ jobId: REPLAY_JOB_ID }),
      },
      cleanupError: new Error("private vault failure"),
    });

    await expect(harness.submitter.submit(command())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
  });

  it("rejects an owner job with an extra private field before cleanup", async () => {
    const harness = createHarness({
      admission: admission({
        created: false,
        payloadAccepted: false,
        job: ownerJob({
          jobId: REPLAY_JOB_ID,
          privatePayloadLocator: "must-not-cross-boundary",
        }),
      }),
    });

    await expect(harness.submitter.submit(command())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.payloadStager.abortUnaccepted).not.toHaveBeenCalled();
  });

  it("rejects created=true with a RUNNING job before cleanup", async () => {
    const harness = createHarness({
      admission: admission({
        payloadAccepted: true,
        job: ownerJob({
          status: "RUNNING",
          attemptCount: 1,
          startedAt: "2026-09-03T02:00:00.500Z",
          updatedAt: "2026-09-03T02:00:01.000Z",
        }),
      }),
    });

    await expect(harness.submitter.submit(command())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.payloadStager.abortUnaccepted).not.toHaveBeenCalled();
  });

  it("projects only the normalized cookie principal to downstream ports", async () => {
    const harness = createHarness();
    const hostileCommand = {
      ...command(),
      principal: {
        ...command().principal,
        accessToken: "must-not-cross-boundary",
        ownerUserId: REPLAY_JOB_ID,
      },
    } as CommunicationNoteGenerationCommand;

    await expect(harness.submitter.submit(hostileCommand)).resolves.toMatchObject({
      created: true,
    });
    const expectedPrincipal = {
      userId: OWNER_ID,
      sessionId: SESSION_ID,
      transport: "COOKIE",
    };
    expect(harness.privacyReviewIssuer.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ principal: expectedPrincipal }),
    );
    expect(harness.createRepository).toHaveBeenCalledExactlyOnceWith(
      expectedPrincipal,
    );
    expect(JSON.stringify(harness.confirm.mock.calls)).not.toContain(
      "must-not-cross-boundary",
    );
    expect(JSON.stringify(harness.createRepository.mock.calls)).not.toContain(
      "must-not-cross-boundary",
    );
  });

  it("rejects a mismatched proof before staging or Points admission", async () => {
    const harness = createHarness({
      proof: privacyProof({ ownerUserId: REPLAY_JOB_ID }),
    });

    await expect(harness.submitter.submit(command())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.payloadStager.stageCanonicalFacts).not.toHaveBeenCalled();
    expect(harness.enqueue).not.toHaveBeenCalled();
  });

  it("rejects a payload receipt beyond proof expiry before admission", async () => {
    const harness = createHarness({
      staged: stagedPayload({ payloadExpiresAt: "2026-09-03T02:30:00.001Z" }),
    });

    await expect(harness.submitter.submit(command())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ["payloadPolicyVersion", "latest/alias"],
    ["payloadPolicySnapshotHash", "b".repeat(63)],
    ["encryptionProfileVersion", "aes 256"],
    ["kmsKeyVersionResourceHash", "c".repeat(63)],
    ["backupDispositionVersion", ""],
  ])("rejects an invalid staged %s binding before Points admission", async (field, value) => {
    const harness = createHarness({
      staged: stagedPayload({ [field]: value }),
    });

    await expect(harness.submitter.submit(command())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.enqueue).not.toHaveBeenCalled();
  });

  it("normalizes the Supabase timestamptz privacy expiry before staging and admission", async () => {
    const harness = createHarness({
      proof: privacyProof({
        confirmedAt: "2026-09-03T02:00:00.000000+00:00",
        expiresAt: "2026-09-03T02:30:00.000000+00:00",
      }),
    });

    await expect(harness.submitter.submit(command())).resolves.toMatchObject({
      created: true,
    });
    expect(harness.payloadStager.stageCanonicalFacts).toHaveBeenCalledWith(
      expect.objectContaining({ privacyProofExpiresAt: PROOF_EXPIRES_AT }),
    );
    expect(harness.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ payloadExpiresAt: PAYLOAD_EXPIRES_AT }),
    );
  });

  it("requires the explicit TestOnly capability and all three ports", () => {
    const harness = createHarness();
    const options = {
      capability: "LIVE",
      privacyReviewIssuer: harness.privacyReviewIssuer,
      payloadStager: harness.payloadStager,
      createPointsAdmissionRepository: harness.createRepository,
    };
    expect(() =>
      createTestOnlyCommunicationNoteGenerationSubmitterComposition(
        options as never,
      ),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });

  it("exposes a provider-neutral composition core without installing the formal runtime", async () => {
    const harness = createHarness();
    const submitter = createCommunicationNoteGenerationSubmitterComposition({
      privacyReviewIssuer: harness.privacyReviewIssuer,
      payloadStager: harness.payloadStager,
      createPointsAdmissionRepository: harness.createRepository,
    });

    await expect(submitter.submit(command())).resolves.toEqual({
      created: true,
      job: ownerJob(),
    });
    expect(COMMUNICATION_NOTE_GENERATION_FORMAL_SUBMITTER_COMPOSITION).toBeUndefined();
  });

  it("captures production-safe ports so retained options cannot replace them", async () => {
    const harness = createHarness();
    const replacementConfirm = vi.fn(() => {
      throw new Error("replacement privacy issuer reached");
    });
    const replacementStage = vi.fn(() => {
      throw new Error("replacement payload stager reached");
    });
    const replacementRepositoryFactory = vi.fn(() => {
      throw new Error("replacement repository factory reached");
    });
    const options = {
      privacyReviewIssuer: harness.privacyReviewIssuer,
      payloadStager: harness.payloadStager,
      createPointsAdmissionRepository: harness.createRepository,
    };
    const submitter =
      createCommunicationNoteGenerationSubmitterComposition(options);

    const retained = options as unknown as Record<string, unknown>;
    retained.privacyReviewIssuer = { confirm: replacementConfirm };
    retained.createPointsAdmissionRepository = replacementRepositoryFactory;
    (
      harness.payloadStager as unknown as Record<string, unknown>
    ).stageCanonicalFacts = replacementStage;

    await expect(submitter.submit(command())).resolves.toEqual({
      created: true,
      job: ownerJob(),
    });
    expect(harness.confirm).toHaveBeenCalledOnce();
    expect(harness.stageCanonicalFacts).toHaveBeenCalledOnce();
    expect(harness.createRepository).toHaveBeenCalledOnce();
    expect(replacementConfirm).not.toHaveBeenCalled();
    expect(replacementStage).not.toHaveBeenCalled();
    expect(replacementRepositoryFactory).not.toHaveBeenCalled();
  });
});

function createHarness(options: Readonly<{
  events?: string[];
  proof?: ReturnType<typeof privacyProof>;
  staged?: ReturnType<typeof stagedPayload>;
  admission?: ReturnType<typeof admission>;
  admissionError?: unknown;
  cleanupError?: unknown;
}> = {}) {
  const events = options.events ?? [];
  const confirm = vi.fn(
    async (
      _input: Parameters<
        CommunicationNoteGenerationPrivacyReviewIssuer["confirm"]
      >[0],
    ) => {
      void _input;
      events.push("privacy");
      return options.proof ?? privacyProof();
    },
  );
  const privacyReviewIssuer: CommunicationNoteGenerationPrivacyReviewIssuer = {
    confirm,
  };
  const stageCanonicalFacts = vi.fn(
    async (
      _input: Parameters<
        CommunicationNoteGenerationPayloadStager["stageCanonicalFacts"]
      >[0],
    ) => {
      void _input;
      events.push("stage");
      return options.staged ?? stagedPayload();
    },
  );
  const abortUnaccepted = vi.fn(
    async (
      _input: Parameters<
        CommunicationNoteGenerationPayloadStager["abortUnaccepted"]
      >[0],
    ) => {
      void _input;
      events.push("cleanup");
      if (options.cleanupError) throw options.cleanupError;
    },
  );
  const payloadStager: CommunicationNoteGenerationPayloadStager = {
    stageCanonicalFacts,
    abortUnaccepted,
  };
  const enqueue = vi.fn(
    async (
      _input: Parameters<
        CaresLinkV1CommunicationNotePointsAdmissionRepository["enqueue"]
      >[0],
    ) => {
      void _input;
      events.push("admission");
      if (options.admissionError) throw options.admissionError;
      return options.admission ?? admission();
    },
  );
  const repository: CaresLinkV1CommunicationNotePointsAdmissionRepository = {
    enqueue,
  };
  const createRepository = vi.fn(() => {
    events.push("repository");
    return repository;
  });
  const submitter =
    createTestOnlyCommunicationNoteGenerationSubmitterComposition({
      capability:
        CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_TEST_CAPABILITY,
      privacyReviewIssuer,
      payloadStager,
      createPointsAdmissionRepository: createRepository,
    });
  return {
    submitter,
    privacyReviewIssuer,
    confirm,
    payloadStager,
    stageCanonicalFacts,
    abortUnaccepted,
    enqueue,
    createRepository,
  };
}

function command(): CommunicationNoteGenerationCommand {
  return {
    principal: { userId: OWNER_ID, sessionId: SESSION_ID, transport: "COOKIE" },
    noteType: "communication",
    serviceCode: "note.communication.generate",
    sourceLocale: "en",
    cleanedFacts: CLEANED_FACTS,
    cleanedFactsHash: SCAN.cleanedFactsHash,
    scannerPolicyVersion: SCAN.scannerPolicyVersion,
    privacyReview: {
      reviewedNoIdentifiers: true,
      processingAuthorityConfirmed: true,
    },
    idempotencyKey: IDEMPOTENCY_KEY,
    correlationId: "77777777-7777-4777-8777-777777777777",
  };
}

function privacyProof(overrides: Record<string, unknown> = {}) {
  return {
    id: PRIVACY_REVIEW_ID,
    ownerUserId: OWNER_ID,
    noteType: "communication" as const,
    cleanedFactsHash: SCAN.cleanedFactsHash,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    status: "CONFIRMED" as const,
    scannerPolicyVersion: SCAN.scannerPolicyVersion,
    reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
    findingDecisions: [],
    confirmedAt: CONFIRMED_AT,
    expiresAt: PROOF_EXPIRES_AT,
    ...overrides,
  };
}

function stagedPayload(overrides: Record<string, unknown> = {}) {
  return {
    jobId: JOB_ID,
    payloadId: PAYLOAD_ID,
    payloadHandleHash: "a".repeat(64),
    payloadExpiresAt: PAYLOAD_EXPIRES_AT,
    payloadPolicyVersion: PAYLOAD_POLICY_VERSION,
    payloadPolicySnapshotHash: PAYLOAD_POLICY_SNAPSHOT_HASH,
    encryptionProfileVersion: ENCRYPTION_PROFILE_VERSION,
    kmsKeyVersionResourceHash: KMS_KEY_VERSION_RESOURCE_HASH,
    backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
    ...overrides,
  };
}

function ownerJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: JOB_ID,
    status: "QUEUED" as const,
    noteType: "communication" as const,
    serviceCode: "note.communication.generate" as const,
    attemptCount: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function admission(overrides: Record<string, unknown> = {}) {
  return {
    created: true,
    payloadAccepted: true,
    pointsReserved: true as const,
    job: ownerJob(),
    ...overrides,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashCanonical(value: unknown) {
  return sha256(stringifyCaresLinkV1CanonicalJson(value));
}
