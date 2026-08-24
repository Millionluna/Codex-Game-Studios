import { describe, expect, it, vi } from "vitest";

import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";
import {
  CARESLINK_V1_NOTE_GENERATION_READY,
  createCaresLinkV1NoteGenerationService,
  createMemoryCaresLinkV1NoteGenerationJobUnitOfWork,
  type CaresLinkV1NoteGenerationActiveSessionPort,
  type CaresLinkV1NoteGenerationCommand,
  type CaresLinkV1NoteGenerationJobUnitOfWork,
  type CaresLinkV1NoteGenerationPrivacyProofPort,
  type CaresLinkV1NoteGenerationProviderPort,
} from "./note-generation-job";
import type { CaresLinkV1NoteProviderCandidate } from "./note-generation-output";
import { createCaresLinkV1CleanedFactsHash } from "./product-api-memory";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  type CaresLinkV1JsonObject,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1PrivacyProof,
} from "./shared-contracts";
import type { CaresLinkV1AuthenticatedPrincipal } from "./transport-contract";

vi.mock("server-only", () => ({}));

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRIVACY_REVIEW_ID = "30000000-0000-4000-8000-000000000001";
const NOW = "2026-08-11T01:00:00.000Z";
const EXPIRES_AT = "2026-08-11T01:30:00.000Z";

describe("CaresLink V1 Note generation jobs", () => {
  it("keeps the offline evidence default-off and accepts one provider port with no Points authority", () => {
    type Options = Parameters<typeof createCaresLinkV1NoteGenerationService>[0];
    type HasPointsPort = "pointsPort" extends keyof Options ? true : false;
    type HasQuotePort = "quotePort" extends keyof Options ? true : false;
    type HasReservationPort = "reservationPort" extends keyof Options
      ? true
      : false;
    type CommandHasOwner = "ownerUserId" extends keyof CaresLinkV1NoteGenerationCommand
      ? true
      : false;

    const hasPointsPort: HasPointsPort = false;
    const hasQuotePort: HasQuotePort = false;
    const hasReservationPort: HasReservationPort = false;
    const commandHasOwner: CommandHasOwner = false;

    expect(CARESLINK_V1_NOTE_GENERATION_READY).toBe(false);
    expect({ hasPointsPort, hasQuotePort, hasReservationPort, commandHasOwner }).toEqual({
      hasPointsPort: false,
      hasQuotePort: false,
      hasReservationPort: false,
      commandHasOwner: false,
    });
  });

  it("dispatches all five Note types through one provider and the catalog-owned service code", async () => {
    const harness = createHarness();

    for (const noteType of CARESLINK_V1_NOTE_TYPE_CODES) {
      const command = commandFor(noteType, `note.generate:${noteType}.0001`);
      const queued = await harness.service.submit({
        principal: principalA(),
        command,
      });
      expect(queued).toMatchObject({
        status: "QUEUED",
        noteType,
        serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
      });

      const succeeded = await harness.service.execute({
        principal: principalA(),
        jobId: queued.jobId,
      });
      expect(succeeded).toMatchObject({
        status: "SUCCEEDED",
        noteType,
        serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
        result: {
          revisionNumber: 1,
          baseRevisionId: null,
          saveState: "SERVER_ACKNOWLEDGED",
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });

      const snapshot = await harness.unitOfWork.getCanonicalSnapshot({
        ownerUserId: OWNER_A,
        canonicalId: required(succeeded.result).canonicalId,
      });
      expect(snapshot).toMatchObject({
        document: {
          ownerUserId: OWNER_A,
          noteType,
          currentRevisionNumber: 1,
        },
        revision: {
          ownerUserId: OWNER_A,
          revisionNumber: 1,
          privacyReviewId: PRIVACY_REVIEW_ID,
          contentHash: succeeded.result?.contentHash,
          content: { factsSummary: command.cleanedFacts },
        },
      });
    }

    expect(harness.provider.generate).toHaveBeenCalledTimes(5);
    expect(
      harness.provider.generate.mock.calls.map(([input]) => input.noteType),
    ).toEqual(CARESLINK_V1_NOTE_TYPE_CODES);
    expect(
      harness.provider.generate.mock.calls.every(
        ([input]) =>
          input.contractVersion === CARESLINK_V1_CONTRACT_VERSION &&
          input.schemaVersion === CARESLINK_V1_NOTE_SCHEMA_VERSION &&
          input.sourceLocale === "en",
      ),
    ).toBe(true);
  });

  it("exposes QUEUED, RUNNING and SUCCEEDED while making terminal execution replay-safe", async () => {
    const generation = deferred<unknown>();
    const harness = createHarness({ generate: vi.fn(() => generation.promise) });
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("progress"),
    });

    expect(queued.status).toBe("QUEUED");
    const execution = harness.service.execute({
      principal: principalA(),
      jobId: queued.jobId,
    });
    await vi.waitFor(() =>
      expect(harness.provider.generate).toHaveBeenCalledTimes(1),
    );
    await expect(
      harness.service.get({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toMatchObject({ status: "RUNNING" });

    generation.resolve(validCandidate());
    const succeeded = await execution;
    expect(succeeded.status).toBe("SUCCEEDED");
    await expect(
      harness.service.execute({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toEqual(succeeded);
    expect(harness.provider.generate).toHaveBeenCalledTimes(1);
  });

  it("records provider failure as terminal FAILED without a canonical side effect", async () => {
    const harness = createHarness({
      generate: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    });
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("communication"),
    });

    const failed = await harness.service.execute({
      principal: principalA(),
      jobId: queued.jobId,
    });
    expect(failed).toMatchObject({
      status: "FAILED",
      failureCode: "GENERATION_FAILED",
    });
    expect(failed).not.toHaveProperty("result");
    await expect(
      harness.service.execute({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toEqual(failed);
    expect(harness.provider.generate).toHaveBeenCalledTimes(1);
  });

  it("cancels QUEUED work without calling the provider", async () => {
    const harness = createHarness();
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("handover"),
    });

    await expect(
      harness.service.cancel({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    await expect(
      harness.service.execute({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("rejects cancellation after either terminal success or terminal failure", async () => {
    for (const shouldFail of [false, true]) {
      const harness = createHarness({
        generate: shouldFail
          ? vi.fn(async () => {
              throw new Error("provider unavailable");
            })
          : undefined,
      });
      const queued = await harness.service.submit({
        principal: principalA(),
        command: commandFor(
          "communication",
          `note.generate:terminal.${shouldFail ? "failed" : "succeeded"}`,
        ),
      });
      const terminal = await harness.service.execute({
        principal: principalA(),
        jobId: queued.jobId,
      });

      expect(terminal.status).toBe(shouldFail ? "FAILED" : "SUCCEEDED");
      await expect(
        harness.service.cancel({
          principal: principalA(),
          jobId: queued.jobId,
        }),
      ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      await expect(
        harness.service.get({ principal: principalA(), jobId: queued.jobId }),
      ).resolves.toEqual(terminal);
    }
  });

  it("discards a late provider result after RUNNING work is cancelled", async () => {
    const generation = deferred<unknown>();
    const ids = deterministicIds();
    const harness = createHarness({
      generate: vi.fn(() => generation.promise),
      createId: ids.createId,
    });
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("incident_factual"),
    });
    const execution = harness.service.execute({
      principal: principalA(),
      jobId: queued.jobId,
    });
    await vi.waitFor(() =>
      expect(harness.provider.generate).toHaveBeenCalledTimes(1),
    );

    await expect(
      harness.service.cancel({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    generation.resolve(validCandidate());
    const cancelled = await execution;
    expect(cancelled).toMatchObject({ status: "CANCELLED" });
    expect(cancelled).not.toHaveProperty("result");
    await expect(
      harness.service.get({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    expect(ids.generated).toHaveLength(1);
  });

  it("replays identical submission and execution after response loss without duplicate generation", async () => {
    const harness = createHarness();
    const input = {
      principal: principalA(),
      command: commandFor("ndis", "note.generate:response-loss.0001"),
    } as const;

    const first = await harness.service.submit(input);
    await expect(harness.service.submit(input)).resolves.toEqual(first);
    const responseThatTheCallerLost = await harness.service.execute({
      principal: principalA(),
      jobId: first.jobId,
    });
    const recovered = await harness.service.execute({
      principal: principalA(),
      jobId: first.jobId,
    });

    expect(recovered).toEqual(responseThatTheCallerLost);
    expect(harness.provider.generate).toHaveBeenCalledTimes(1);
    const snapshot = await harness.unitOfWork.getCanonicalSnapshot({
      ownerUserId: OWNER_A,
      canonicalId: required(recovered.result).canonicalId,
    });
    expect(snapshot?.revision.revisionNumber).toBe(1);
  });

  it("coalesces concurrent submission and execution of the same mutation", async () => {
    const harness = createHarness();
    const input = {
      principal: principalA(),
      command: commandFor("progress", "note.generate:concurrent.0001"),
    } as const;

    const submissions = await Promise.all([
      harness.service.submit(input),
      harness.service.submit(input),
    ]);
    expect(submissions[0]).toEqual(submissions[1]);
    const jobId = submissions[0].jobId;

    await Promise.all([
      harness.service.execute({ principal: principalA(), jobId }),
      harness.service.execute({ principal: principalA(), jobId }),
    ]);

    expect(harness.provider.generate).toHaveBeenCalledTimes(1);
    await expect(
      harness.service.get({ principal: principalA(), jobId }),
    ).resolves.toMatchObject({ status: "SUCCEEDED", result: { revisionNumber: 1 } });
  });

  it("rejects reuse of an idempotency key with changed input", async () => {
    const harness = createHarness();
    const first = commandFor("progress", "note.generate:conflict.0001");
    await harness.service.submit({ principal: principalA(), command: first });

    await expect(
      harness.service.submit({
        principal: principalA(),
        command: {
          ...first,
          cleanedFacts: {
            ...createValidCaresLinkV1CleanedFacts("progress"),
            observable_facts: "A different observable fact.",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("passes an exact owner/type/schema/facts-hash/expiry-time binding to privacy admission", async () => {
    const harness = createHarness();
    const command = commandFor("communication");
    await harness.service.submit({ principal: principalA(), command });

    expect(harness.privacyProofPort.assertUsable).toHaveBeenCalledWith({
      ownerUserId: OWNER_A,
      privacyReviewId: PRIVACY_REVIEW_ID,
      noteType: "communication",
      cleanedFactsHash: createCaresLinkV1CleanedFactsHash(
        command.cleanedFacts as CaresLinkV1JsonObject,
      ),
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      now: NOW,
    });
  });

  it.each([
    ["missing", undefined],
    ["expired", privacyProof({ expiresAt: NOW })],
    ["revoked", privacyProof({ status: "REVOKED" })],
    ["wrong owner", privacyProof({ ownerUserId: OWNER_B })],
    ["wrong Note type", privacyProof({ noteType: "ndis" })],
    ["wrong schema", privacyProof({ schemaVersion: "2026-08-09.old-shadow" })],
    ["wrong facts hash", privacyProof({ cleanedFactsHash: "f".repeat(64) })],
    [
      "wrong scanner policy",
      privacyProof({ scannerPolicyVersion: "2026-08-11.old-preview" as never }),
    ],
    ["wrong review revision", privacyProof({ reviewRevision: 2 as never })],
  ] as const)("fails closed for a %s privacy proof", async (_label, proof) => {
    const harness = createHarness({ privacyProofPort: privacyGate(proof) });

    await expect(
      harness.service.submit({
        principal: principalA(),
        command: commandFor("progress"),
      }),
    ).rejects.toMatchObject({
      code: proof === undefined ? "PRIVACY_REVIEW_REQUIRED" : "PRIVACY_REVIEW_STALE",
    });
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it.each(CARESLINK_V1_NOTE_TYPE_CODES)(
    "rejects missing required facts for %s before provider execution",
    async (noteType) => {
      const harness = createHarness();
      const cleanedFacts = createValidCaresLinkV1CleanedFacts(noteType) as Record<
        string,
        unknown
      >;
      const requiredField = getCaresLinkV1NoteType(noteType).fields.find(
        (field) => field.required,
      )!;
      delete cleanedFacts[requiredField.code];

      await expect(
        harness.service.submit({
          principal: principalA(),
          command: { ...commandFor(noteType), cleanedFacts },
        }),
      ).rejects.toMatchObject({ code: "MINIMUM_FACTS_REQUIRED" });
      expect(harness.provider.generate).not.toHaveBeenCalled();
    },
  );

  it("rejects cleaned facts over the 64 KiB upload boundary before privacy or provider work", async () => {
    const harness = createHarness();
    const cleanedFacts = createValidCaresLinkV1CleanedFacts("progress");
    cleanedFacts.observable_facts = "x".repeat(70_000);

    await expect(
      harness.service.submit({
        principal: principalA(),
        command: {
          ...commandFor("progress", "note.generate:oversized.0001"),
          cleanedFacts,
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(harness.privacyProofPort.assertUsable).not.toHaveBeenCalled();
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("does not reveal or mutate another owner's job", async () => {
    const harness = createHarness();
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("progress"),
    });

    for (const action of [
      () => harness.service.get({ principal: principalB(), jobId: queued.jobId }),
      () => harness.service.execute({ principal: principalB(), jobId: queued.jobId }),
      () => harness.service.cancel({ principal: principalB(), jobId: queued.jobId }),
    ]) {
      await expect(action()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(
      harness.service.get({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toMatchObject({ status: "QUEUED" });
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("rejects a revoked initiating session at admission without creating a job", async () => {
    const harness = createHarness({
      activeSessionPort: sessionGate(new Set()),
    });

    await expect(
      harness.service.submit({
        principal: principalA(),
        command: commandFor("progress"),
      }),
    ).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    expect(harness.privacyProofPort.assertUsable).not.toHaveBeenCalled();
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("rejects a drifted Note schema before privacy or provider work", async () => {
    const harness = createHarness();

    await expect(
      harness.service.submit({
        principal: principalA(),
        command: {
          ...commandFor("communication"),
          schemaVersion: "2026-08-09.old-shadow",
        } as unknown as CaresLinkV1NoteGenerationCommand,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(harness.privacyProofPort.assertUsable).not.toHaveBeenCalled();
    expect(harness.provider.generate).not.toHaveBeenCalled();
  });

  it("rechecks the initiating session after generation and rejects a revoked-session result", async () => {
    const generation = deferred<unknown>();
    const activeSessions = new Set([`${OWNER_A}:${SESSION_A}`]);
    const sessionPort = sessionGate(activeSessions);
    const harness = createHarness({
      activeSessionPort: sessionPort,
      generate: vi.fn(() => generation.promise),
    });
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("progress"),
    });
    const execution = harness.service.execute({
      principal: principalA(),
      jobId: queued.jobId,
    });
    await vi.waitFor(() =>
      expect(harness.provider.generate).toHaveBeenCalledTimes(1),
    );

    activeSessions.delete(`${OWNER_A}:${SESSION_A}`);
    generation.resolve(validCandidate());
    await expect(execution).resolves.toMatchObject({
      status: "FAILED",
      failureCode: "SESSION_REVOKED",
    });
    expect(sessionPort.assertActive).toHaveBeenCalledTimes(4);
  });

  it("rechecks privacy after generation and does not persist a proof that became stale", async () => {
    const generation = deferred<unknown>();
    let usable = true;
    const privacyProofPort: CaresLinkV1NoteGenerationPrivacyProofPort = {
      assertUsable: vi.fn(async () => {
        if (!usable) throw contractError("PRIVACY_REVIEW_STALE");
      }),
    };
    const harness = createHarness({
      privacyProofPort,
      generate: vi.fn(() => generation.promise),
    });
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("ndis"),
    });
    const execution = harness.service.execute({
      principal: principalA(),
      jobId: queued.jobId,
    });
    await vi.waitFor(() =>
      expect(harness.provider.generate).toHaveBeenCalledTimes(1),
    );

    usable = false;
    generation.resolve(validCandidate());
    await expect(execution).resolves.toMatchObject({
      status: "FAILED",
      failureCode: "PRIVACY_REVIEW_STALE",
    });
    expect(privacyProofPort.assertUsable).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["invalid candidate", async () => ({ ...validCandidate(), factsSummary: { secret: true } })],
    ["provider exception", async () => {
      throw new Error("provider failed");
    }],
  ])("does not create a document for %s", async (_label, generate) => {
    const ids = deterministicIds();
    const harness = createHarness({
      generate: vi.fn(generate),
      createId: ids.createId,
    });
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("incident_factual"),
    });

    await expect(
      harness.service.execute({ principal: principalA(), jobId: queued.jobId }),
    ).resolves.toMatchObject({ status: "FAILED", failureCode: "GENERATION_FAILED" });
    expect(harness.provider.generate).toHaveBeenCalledTimes(1);
    expect(ids.generated).toHaveLength(1);
  });

  it("turns an atomic commit failure into FAILED with no partial document or revision", async () => {
    const memoryUnitOfWork = createMemoryCaresLinkV1NoteGenerationJobUnitOfWork();
    const unitOfWork: CaresLinkV1NoteGenerationJobUnitOfWork = {
      ...memoryUnitOfWork,
      commitSuccess: vi.fn(async () => {
        throw new Error("atomic storage unavailable");
      }),
    };
    const ids = deterministicIds();
    const harness = createHarness({ unitOfWork, createId: ids.createId });
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("communication"),
    });

    const failed = await harness.service.execute({
      principal: principalA(),
      jobId: queued.jobId,
    });
    expect(failed).toMatchObject({ status: "FAILED", failureCode: "GENERATION_FAILED" });
    expect(failed).not.toHaveProperty("result");
    await expect(
      memoryUnitOfWork.getCanonicalSnapshot({
        ownerUserId: OWNER_A,
        canonicalId: ids.generated[1],
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["revoked session", "SESSION_REVOKED"],
    ["stale privacy proof", "PRIVACY_REVIEW_STALE"],
    ["missing privacy proof", "PRIVACY_REVIEW_REQUIRED"],
  ] as const)(
    "preserves %s from a durable atomic commit without creating canonical state",
    async (_label, failureCode) => {
      const memoryUnitOfWork =
        createMemoryCaresLinkV1NoteGenerationJobUnitOfWork();
      const unitOfWork: CaresLinkV1NoteGenerationJobUnitOfWork = {
        ...memoryUnitOfWork,
        commitSuccess: vi.fn(async () => {
          throw new CaresLinkV1ContractError(
            failureCode,
            "Commit authority is no longer valid",
          );
        }),
      };
      const ids = deterministicIds();
      const harness = createHarness({ unitOfWork, createId: ids.createId });
      const queued = await harness.service.submit({
        principal: principalA(),
        command: commandFor(
          "progress",
          `note.generate:commit-${failureCode.toLowerCase()}.0001`,
        ),
      });

      await expect(
        harness.service.execute({
          principal: principalA(),
          jobId: queued.jobId,
        }),
      ).resolves.toMatchObject({ status: "FAILED", failureCode });
      await expect(
        memoryUnitOfWork.getCanonicalSnapshot({
          ownerUserId: OWNER_A,
          canonicalId: ids.generated[1],
        }),
      ).resolves.toBeUndefined();
    },
  );

  it.each(["privacy", "session"] as const)(
    "rejects a tampered %s commit binding with no canonical side effect",
    async (binding) => {
      const memoryUnitOfWork =
        createMemoryCaresLinkV1NoteGenerationJobUnitOfWork();
      const unitOfWork: CaresLinkV1NoteGenerationJobUnitOfWork = {
        ...memoryUnitOfWork,
        commitSuccess: vi.fn((input) =>
          memoryUnitOfWork.commitSuccess(
            binding === "privacy"
              ? {
                  ...input,
                  privacyBinding: {
                    ...input.privacyBinding,
                    ownerUserId: OWNER_B,
                  },
                }
              : {
                  ...input,
                  sessionBinding: {
                    ...input.sessionBinding,
                    principal: principalB(),
                  },
                },
          ),
        ),
      };
      const ids = deterministicIds();
      const harness = createHarness({ unitOfWork, createId: ids.createId });
      const queued = await harness.service.submit({
        principal: principalA(),
        command: commandFor(
          "handover",
          `note.generate:tampered-${binding}.0001`,
        ),
      });

      await expect(
        harness.service.execute({
          principal: principalA(),
          jobId: queued.jobId,
        }),
      ).resolves.toMatchObject({
        status: "FAILED",
        failureCode:
          binding === "privacy" ? "PRIVACY_REVIEW_STALE" : "SESSION_REVOKED",
      });
      expect(ids.generated).toHaveLength(3);
      await expect(
        memoryUnitOfWork.getCanonicalSnapshot({
          ownerUserId: OWNER_A,
          canonicalId: ids.generated[1],
        }),
      ).resolves.toBeUndefined();
    },
  );

  it("binds canonical revision one to the privacy proof and exact canonical hash", async () => {
    const harness = createHarness();
    const queued = await harness.service.submit({
      principal: principalA(),
      command: commandFor("handover"),
    });
    const succeeded = await harness.service.execute({
      principal: principalA(),
      jobId: queued.jobId,
    });
    const result = required(succeeded.result);
    const snapshot = await harness.unitOfWork.getCanonicalSnapshot({
      ownerUserId: OWNER_A,
      canonicalId: result.canonicalId,
    });

    expect(snapshot?.document).toMatchObject({
      currentRevisionId: result.revisionId,
      currentRevisionNumber: 1,
    });
    expect(snapshot?.revision).toMatchObject({
      id: result.revisionId,
      revisionNumber: 1,
      privacyReviewId: PRIVACY_REVIEW_ID,
      contentHash: result.contentHash,
    });
    expect(snapshot?.revision).not.toHaveProperty("baseRevisionId");
    expect(result).toMatchObject({
      baseRevisionId: null,
      saveState: "SERVER_ACKNOWLEDGED",
    });
    expect(snapshot?.revision.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never includes sensitive facts, keys, provider errors, tokens or URLs in ACK/error metadata", async () => {
    const sensitiveFact = "Sensitive-participant-value-9842";
    const sensitiveKey = "note.generate:sensitive-key-9842";
    const accessToken = "access-token-must-not-cross-job-boundary";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const facts = createValidCaresLinkV1CleanedFacts("progress");
    facts.observable_facts = sensitiveFact;

    const successfulHarness = createHarness();
    const queued = await successfulHarness.service.submit({
      principal: principalA(),
      command: {
        ...commandFor("progress", sensitiveKey),
        cleanedFacts: facts,
      },
    });
    const succeeded = await successfulHarness.service.execute({
      principal: principalA(),
      jobId: queued.jobId,
    });

    const failedHarness = createHarness({
      generate: vi.fn(async () => {
        throw new Error(`${sensitiveFact}:${accessToken}`);
      }),
    });
    const failureQueued = await failedHarness.service.submit({
      principal: principalA(),
      command: {
        ...commandFor("progress", "note.generate:sensitive-error-9842"),
        cleanedFacts: facts,
      },
    });
    const failed = await failedHarness.service.execute({
      principal: principalA(),
      jobId: failureQueued.jobId,
    });
    const serialized = JSON.stringify({ queued, succeeded, failureQueued, failed });

    expect(serialized).not.toContain(sensitiveFact);
    expect(serialized).not.toContain(sensitiveKey);
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain(OWNER_A);
    expect(serialized).not.toContain(SESSION_A);
    expect(serialized).not.toContain(PRIVACY_REVIEW_ID);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(succeeded.status).toBe("SUCCEEDED");
    expect(failed).toMatchObject({ status: "FAILED", failureCode: "GENERATION_FAILED" });
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });
});

function createHarness(overrides: {
  unitOfWork?: CaresLinkV1NoteGenerationJobUnitOfWork;
  activeSessionPort?: CaresLinkV1NoteGenerationActiveSessionPort;
  privacyProofPort?: CaresLinkV1NoteGenerationPrivacyProofPort;
  generate?: CaresLinkV1NoteGenerationProviderPort["generate"];
  createId?: () => string;
} = {}) {
  const unitOfWork =
    overrides.unitOfWork ?? createMemoryCaresLinkV1NoteGenerationJobUnitOfWork();
  const activeSessionPort = overrides.activeSessionPort ?? sessionGate();
  const privacyProofPort = overrides.privacyProofPort ?? {
    assertUsable: vi.fn(async () => undefined),
  };
  const provider = {
    generate: vi.fn(overrides.generate ?? (async () => validCandidate())),
  };
  const ids = deterministicIds();
  const service = createCaresLinkV1NoteGenerationService({
    unitOfWork,
    activeSessionPort,
    privacyProofPort,
    provider,
    createId: overrides.createId ?? ids.createId,
    now: () => NOW,
  });

  return { service, unitOfWork, activeSessionPort, privacyProofPort, provider };
}

function commandFor(
  noteType: CaresLinkV1NoteTypeCode,
  idempotencyKey = `note.generate:${noteType}.0001`,
): CaresLinkV1NoteGenerationCommand {
  return {
    noteType,
    sourceLocale: "en",
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    cleanedFacts: createValidCaresLinkV1CleanedFacts(noteType),
    privacyReviewId: PRIVACY_REVIEW_ID,
    idempotencyKey,
  };
}

function validCandidate(): CaresLinkV1NoteProviderCandidate {
  return {
    englishDraft: "Only observable facts were recorded.",
    reviewVersions: { "zh-Hans": "仅记录了可观察事实。" },
    missingFacts: [],
    neutralWordingChecks: ["No inferred outcome."],
    followUpPrompts: [],
  };
}

function principalA(): CaresLinkV1AuthenticatedPrincipal {
  return { userId: OWNER_A, sessionId: SESSION_A, transport: "COOKIE" };
}

function principalB(): CaresLinkV1AuthenticatedPrincipal {
  return { userId: OWNER_B, sessionId: SESSION_B, transport: "BEARER" };
}

function sessionGate(
  activeSessions = new Set([`${OWNER_A}:${SESSION_A}`, `${OWNER_B}:${SESSION_B}`]),
): CaresLinkV1NoteGenerationActiveSessionPort & {
  assertActive: ReturnType<typeof vi.fn>;
} {
  return {
    assertActive: vi.fn(async (principal: CaresLinkV1AuthenticatedPrincipal) => {
      if (!activeSessions.has(`${principal.userId}:${principal.sessionId}`)) {
        throw contractError("SESSION_REVOKED");
      }
    }),
  };
}

function privacyGate(
  proof: CaresLinkV1PrivacyProof | undefined,
): CaresLinkV1NoteGenerationPrivacyProofPort {
  return {
    assertUsable: vi.fn(async (input) => {
      if (!proof) throw contractError("PRIVACY_REVIEW_REQUIRED");
      if (
        proof.id !== input.privacyReviewId ||
        proof.ownerUserId !== input.ownerUserId ||
        proof.noteType !== input.noteType ||
        proof.cleanedFactsHash !== input.cleanedFactsHash ||
        proof.schemaVersion !== input.schemaVersion ||
        proof.status !== "CONFIRMED" ||
        proof.scannerPolicyVersion !== CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION ||
        proof.reviewRevision !== CARESLINK_V1_PRIVACY_REVIEW_REVISION ||
        Date.parse(proof.expiresAt) <= Date.parse(input.now)
      ) {
        throw contractError("PRIVACY_REVIEW_STALE");
      }
    }),
  };
}

function privacyProof(
  overrides: Partial<CaresLinkV1PrivacyProof> = {},
): CaresLinkV1PrivacyProof {
  return {
    id: PRIVACY_REVIEW_ID,
    ownerUserId: OWNER_A,
    noteType: "progress",
    cleanedFactsHash: createCaresLinkV1CleanedFactsHash(
      createValidCaresLinkV1CleanedFacts("progress"),
    ),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    status: "CONFIRMED",
    scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
    reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
    findingDecisions: [],
    confirmedAt: NOW,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function contractError(
  code:
    | "SESSION_REVOKED"
    | "PRIVACY_REVIEW_REQUIRED"
    | "PRIVACY_REVIEW_STALE",
) {
  return new CaresLinkV1ContractError(code, "Request could not be authorized");
}

function deterministicIds() {
  const generated: string[] = [];
  let next = 1;
  return {
    generated,
    createId: () => {
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
      generated.push(id);
      return id;
    },
  };
}

function required<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  return value as T;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
