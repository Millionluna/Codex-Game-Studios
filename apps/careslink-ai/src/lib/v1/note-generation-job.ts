import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { buildCaresLinkV1CanonicalNoteContent } from "./note-generation-output";
import { scanCaresLinkV1CleanedFacts } from "./privacy-review-scanner.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  getCaresLinkV1NoteType,
  isCaresLinkV1Locale,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1Document,
  type CaresLinkV1DocumentRevision,
  type CaresLinkV1GenerationStatus,
  type CaresLinkV1JsonObject,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteContent,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1ServiceCode,
} from "./shared-contracts";
import {
  CARESLINK_V1_SERVER_SAVE_ACK,
  type CaresLinkV1AuthenticatedPrincipal,
} from "./transport-contract";

/** Source/offline evidence only. No route, durable store, model or Points wiring exists. */
export const CARESLINK_V1_NOTE_GENERATION_READY = false as const;
export const CARESLINK_V1_NOTE_GENERATION_PENDING_STATUS = "QUEUED" as const;
/**
 * Activation remains blocked until there is a durable transactional store and
 * a worker lease/heartbeat/timeout design. This source-only service must never
 * be served by a route or wired to a real provider or Points as-is.
 */
export const CARESLINK_V1_NOTE_GENERATION_ACTIVATION_BLOCKERS = [
  "DURABLE_TRANSACTIONAL_STORE",
  "WORKER_LEASE_HEARTBEAT_TIMEOUT",
  "REAL_PROVIDER_POLICY_NOT_CONFIGURED",
  "POINTS_NOT_INTEGRATED",
] as const;

export type CaresLinkV1NoteGenerationFailureCode =
  | "AUTH_REQUIRED"
  | "SESSION_REVOKED"
  | "PRIVACY_REVIEW_REQUIRED"
  | "PRIVACY_REVIEW_STALE"
  | "MINIMUM_FACTS_REQUIRED"
  | "GENERATION_FAILED";

export type CaresLinkV1NoteGenerationCommand = Readonly<{
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  cleanedFacts: unknown;
  privacyReviewId: string;
  idempotencyKey: string;
}>;

export type CaresLinkV1NoteGenerationResult = Readonly<{
  canonicalId: string;
  revisionId: string;
  contentHash: string;
  revisionNumber: 1;
  baseRevisionId: null;
  saveState: typeof CARESLINK_V1_SERVER_SAVE_ACK;
}>;

/** Safe metadata-only ACK. It intentionally excludes facts, output, proof and keys. */
export type CaresLinkV1NoteGenerationJobAck = Readonly<{
  jobId: string;
  status: CaresLinkV1GenerationStatus;
  noteType: CaresLinkV1NoteTypeCode;
  serviceCode: CaresLinkV1ServiceCode;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  failureCode?: CaresLinkV1NoteGenerationFailureCode;
  result?: CaresLinkV1NoteGenerationResult;
}>;

export type CaresLinkV1NoteGenerationActiveSessionPort = Readonly<{
  assertActive(principal: CaresLinkV1AuthenticatedPrincipal): Promise<void>;
}>;

export type CaresLinkV1NoteGenerationPrivacyProofPort = Readonly<{
  assertUsable(input: Readonly<{
    ownerUserId: string;
    privacyReviewId: string;
    noteType: CaresLinkV1NoteTypeCode;
    cleanedFactsHash: string;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    now: string;
  }>): Promise<void>;
}>;

export type CaresLinkV1NoteGenerationProviderPort = Readonly<{
  generate(input: Readonly<{
    jobId: string;
    noteType: CaresLinkV1NoteTypeCode;
    sourceLocale: CaresLinkV1Locale;
    contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    cleanedFacts: CaresLinkV1JsonObject;
    signal: AbortSignal;
  }>): Promise<unknown>;
}>;

export type CaresLinkV1NoteGenerationStoredJob = Readonly<{
  id: string;
  ownerUserId: string;
  admissionPrincipal: CaresLinkV1AuthenticatedPrincipal;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  serviceCode: CaresLinkV1ServiceCode;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  cleanedFacts: CaresLinkV1JsonObject;
  cleanedFactsHash: string;
  privacyReviewId: string;
  idempotencyHash: string;
  requestHash: string;
  status: CaresLinkV1GenerationStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  failureCode?: CaresLinkV1NoteGenerationFailureCode;
  result?: CaresLinkV1NoteGenerationResult;
}>;

export type CaresLinkV1NoteGenerationCanonicalSnapshot = Readonly<{
  document: CaresLinkV1Document;
  revision: CaresLinkV1DocumentRevision;
}>;

export type CaresLinkV1NoteGenerationPrivacyCommitBinding = Readonly<{
  ownerUserId: string;
  privacyReviewId: string;
  noteType: CaresLinkV1NoteTypeCode;
  cleanedFactsHash: string;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  checkedAt: string;
}>;

export type CaresLinkV1NoteGenerationSessionCommitBinding = Readonly<{
  principal: CaresLinkV1AuthenticatedPrincipal;
  checkedAt: string;
}>;

export type CaresLinkV1NoteGenerationJobUnitOfWork = Readonly<{
  findByIdempotency(input: Readonly<{
    ownerUserId: string;
    idempotencyHash: string;
  }>): Promise<CaresLinkV1NoteGenerationStoredJob | undefined>;
  enqueue(input: CaresLinkV1NoteGenerationStoredJob): Promise<Readonly<{
    job: CaresLinkV1NoteGenerationStoredJob;
    created: boolean;
  }>>;
  getOwned(input: Readonly<{
    ownerUserId: string;
    jobId: string;
  }>): Promise<CaresLinkV1NoteGenerationStoredJob>;
  claim(input: Readonly<{
    ownerUserId: string;
    jobId: string;
    now: string;
  }>): Promise<Readonly<{
    job: CaresLinkV1NoteGenerationStoredJob;
    claimed: boolean;
  }>>;
  fail(input: Readonly<{
    ownerUserId: string;
    jobId: string;
    failureCode: CaresLinkV1NoteGenerationFailureCode;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationStoredJob>;
  cancel(input: Readonly<{
    ownerUserId: string;
    jobId: string;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationStoredJob>;
  /**
   * Durable implementations must revalidate the supplied session and exact
   * privacy binding inside the same database transaction that creates the
   * document/revision and transitions the job to SUCCEEDED.
   */
  commitSuccess(input: Readonly<{
    ownerUserId: string;
    jobId: string;
    canonicalId: string;
    revisionId: string;
    privacyBinding: CaresLinkV1NoteGenerationPrivacyCommitBinding;
    sessionBinding: CaresLinkV1NoteGenerationSessionCommitBinding;
    content: CaresLinkV1NoteContent;
    contentHash: string;
    now: string;
  }>): Promise<CaresLinkV1NoteGenerationStoredJob>;
  getCanonicalSnapshot(input: Readonly<{
    ownerUserId: string;
    canonicalId: string;
  }>): Promise<CaresLinkV1NoteGenerationCanonicalSnapshot | undefined>;
}>;

export type CaresLinkV1NoteGenerationService = Readonly<{
  submit(input: Readonly<{
    principal: CaresLinkV1AuthenticatedPrincipal;
    command: CaresLinkV1NoteGenerationCommand;
  }>): Promise<CaresLinkV1NoteGenerationJobAck>;
  execute(input: Readonly<{
    principal: CaresLinkV1AuthenticatedPrincipal;
    jobId: string;
  }>): Promise<CaresLinkV1NoteGenerationJobAck>;
  get(input: Readonly<{
    principal: CaresLinkV1AuthenticatedPrincipal;
    jobId: string;
  }>): Promise<CaresLinkV1NoteGenerationJobAck>;
  cancel(input: Readonly<{
    principal: CaresLinkV1AuthenticatedPrincipal;
    jobId: string;
  }>): Promise<CaresLinkV1NoteGenerationJobAck>;
}>;

export function createCaresLinkV1NoteGenerationService(options: Readonly<{
  unitOfWork: CaresLinkV1NoteGenerationJobUnitOfWork;
  activeSessionPort: CaresLinkV1NoteGenerationActiveSessionPort;
  privacyProofPort: CaresLinkV1NoteGenerationPrivacyProofPort;
  provider: CaresLinkV1NoteGenerationProviderPort;
  createId?: () => string;
  now?: () => string;
}>): CaresLinkV1NoteGenerationService {
  return createNoteGenerationService(options);
}

export function createMemoryCaresLinkV1NoteGenerationJobUnitOfWork(): CaresLinkV1NoteGenerationJobUnitOfWork {
  return createMemoryUnitOfWork();
}

// Implementations follow below so the exported port remains independently testable.

function createNoteGenerationService({
  unitOfWork,
  activeSessionPort,
  privacyProofPort,
  provider,
  createId = randomUUID,
  now = () => new Date().toISOString(),
}: Readonly<{
  unitOfWork: CaresLinkV1NoteGenerationJobUnitOfWork;
  activeSessionPort: CaresLinkV1NoteGenerationActiveSessionPort;
  privacyProofPort: CaresLinkV1NoteGenerationPrivacyProofPort;
  provider: CaresLinkV1NoteGenerationProviderPort;
  createId?: () => string;
  now?: () => string;
}>): CaresLinkV1NoteGenerationService {
  const activeExecutions = new Map<string, AbortController>();

  async function assertActive(principal: CaresLinkV1AuthenticatedPrincipal) {
    assertPrincipal(principal);
    try {
      await activeSessionPort.assertActive(principal);
    } catch (error) {
      throw normalizeSessionError(error);
    }
  }

  async function assertPrivacy(
    job: Pick<
      CaresLinkV1NoteGenerationStoredJob,
      | "ownerUserId"
      | "privacyReviewId"
      | "noteType"
      | "cleanedFactsHash"
      | "schemaVersion"
    >,
    checkedAt: string,
  ) {
    try {
      await privacyProofPort.assertUsable({
        ownerUserId: job.ownerUserId,
        privacyReviewId: job.privacyReviewId,
        noteType: job.noteType,
        cleanedFactsHash: job.cleanedFactsHash,
        schemaVersion: job.schemaVersion,
        now: checkedAt,
      });
    } catch (error) {
      throw normalizePrivacyError(error);
    }
  }

  async function failJob(
    job: CaresLinkV1NoteGenerationStoredJob,
    failureCode: CaresLinkV1NoteGenerationFailureCode,
  ) {
    return unitOfWork.fail({
      ownerUserId: job.ownerUserId,
      jobId: job.id,
      failureCode,
      now: now(),
    });
  }

  return {
    async submit({ principal, command }) {
      await assertActive(principal);
      const prepared = prepareCommand(command);

      const replay = await unitOfWork.findByIdempotency({
        ownerUserId: principal.userId,
        idempotencyHash: prepared.idempotencyHash,
      });
      if (replay) {
        assertSameRequest(replay, prepared.requestHash);
        return toAck(replay);
      }

      const admittedAt = now();
      await assertPrivacy(
        {
          ownerUserId: principal.userId,
          privacyReviewId: prepared.privacyReviewId,
          noteType: prepared.noteType,
          cleanedFactsHash: prepared.cleanedFactsHash,
          schemaVersion: prepared.schemaVersion,
        },
        admittedAt,
      );

      const jobId = createId();
      assertIdentifier(jobId, "Generation job ID");
      const queued: CaresLinkV1NoteGenerationStoredJob = {
        id: jobId,
        ownerUserId: principal.userId,
        admissionPrincipal: clone(principal),
        noteType: prepared.noteType,
        sourceLocale: prepared.sourceLocale,
        serviceCode: prepared.serviceCode,
        contractVersion: prepared.contractVersion,
        schemaVersion: prepared.schemaVersion,
        cleanedFacts: clone(prepared.cleanedFacts),
        cleanedFactsHash: prepared.cleanedFactsHash,
        privacyReviewId: prepared.privacyReviewId,
        idempotencyHash: prepared.idempotencyHash,
        requestHash: prepared.requestHash,
        status: CARESLINK_V1_NOTE_GENERATION_PENDING_STATUS,
        createdAt: admittedAt,
        updatedAt: admittedAt,
      };
      const enqueued = await unitOfWork.enqueue(queued);
      assertSameRequest(enqueued.job, prepared.requestHash);
      return toAck(enqueued.job);
    },

    async execute({ principal, jobId }) {
      await assertActive(principal);
      assertIdentifier(jobId, "Generation job ID");
      let job = await unitOfWork.getOwned({
        ownerUserId: principal.userId,
        jobId,
      });
      if (isTerminal(job.status) || job.status === "RUNNING") {
        return toAck(job);
      }

      try {
        await assertActive(job.admissionPrincipal);
        await assertPrivacy(job, now());
      } catch (error) {
        job = await failJob(job, admissionFailureCode(error));
        return toAck(job);
      }

      const claimed = await unitOfWork.claim({
        ownerUserId: principal.userId,
        jobId,
        now: now(),
      });
      job = claimed.job;
      if (!claimed.claimed) return toAck(job);

      const controller = new AbortController();
      activeExecutions.set(job.id, controller);
      let canonical: ReturnType<typeof buildCaresLinkV1CanonicalNoteContent>;
      try {
        const providerCandidate = await provider.generate({
          jobId: job.id,
          noteType: job.noteType,
          sourceLocale: job.sourceLocale,
          contractVersion: job.contractVersion,
          schemaVersion: job.schemaVersion,
          cleanedFacts: clone(job.cleanedFacts),
          signal: controller.signal,
        });
        canonical = buildCaresLinkV1CanonicalNoteContent(
          job.noteType,
          job.cleanedFacts,
          providerCandidate,
        );
      } catch {
        const current = await unitOfWork.getOwned({
          ownerUserId: job.ownerUserId,
          jobId: job.id,
        });
        if (current.status === "CANCELLED") return toAck(current);
        return toAck(await failJob(current, "GENERATION_FAILED"));
      } finally {
        activeExecutions.delete(job.id);
      }

      job = await unitOfWork.getOwned({
        ownerUserId: job.ownerUserId,
        jobId: job.id,
      });
      if (job.status !== "RUNNING") return toAck(job);

      let commitCheckedAt: string;
      try {
        // Re-check the original admission session and the exact proof as close
        // as possible to the atomic canonical commit. Late output fails closed.
        commitCheckedAt = now();
        await assertActive(job.admissionPrincipal);
        await assertPrivacy(job, commitCheckedAt);
      } catch (error) {
        return toAck(await failJob(job, admissionFailureCode(error)));
      }

      const canonicalId = createId();
      const revisionId = createId();
      assertIdentifier(canonicalId, "Canonical document ID");
      assertIdentifier(revisionId, "Document revision ID");
      try {
        job = await unitOfWork.commitSuccess({
          ownerUserId: job.ownerUserId,
          jobId: job.id,
          canonicalId,
          revisionId,
          privacyBinding: {
            ownerUserId: job.ownerUserId,
            privacyReviewId: job.privacyReviewId,
            noteType: job.noteType,
            cleanedFactsHash: job.cleanedFactsHash,
            schemaVersion: job.schemaVersion,
            checkedAt: commitCheckedAt,
          },
          sessionBinding: {
            principal: clone(job.admissionPrincipal),
            checkedAt: commitCheckedAt,
          },
          content: canonical.content,
          contentHash: canonical.contentHash,
          now: now(),
        });
      } catch (error) {
        const current = await unitOfWork.getOwned({
          ownerUserId: job.ownerUserId,
          jobId: job.id,
        });
        if (current.status === "CANCELLED") return toAck(current);
        job = await failJob(current, commitFailureCode(error));
      }
      return toAck(job);
    },

    async get({ principal, jobId }) {
      await assertActive(principal);
      assertIdentifier(jobId, "Generation job ID");
      return toAck(
        await unitOfWork.getOwned({ ownerUserId: principal.userId, jobId }),
      );
    },

    async cancel({ principal, jobId }) {
      await assertActive(principal);
      assertIdentifier(jobId, "Generation job ID");
      const job = await unitOfWork.cancel({
        ownerUserId: principal.userId,
        jobId,
        now: now(),
      });
      activeExecutions.get(jobId)?.abort();
      return toAck(job);
    },
  };
}

function createMemoryUnitOfWork(): CaresLinkV1NoteGenerationJobUnitOfWork {
  const jobs = new Map<string, CaresLinkV1NoteGenerationStoredJob>();
  const idempotencyIndex = new Map<string, string>();
  const documents = new Map<
    string,
    CaresLinkV1NoteGenerationCanonicalSnapshot
  >();
  const revisionIds = new Set<string>();

  return {
    async findByIdempotency({ ownerUserId, idempotencyHash }) {
      const jobId = idempotencyIndex.get(
        idempotencyIndexKey(ownerUserId, idempotencyHash),
      );
      if (!jobId) return undefined;
      const job = jobs.get(jobId);
      if (!job) throw storageInvariant();
      return clone(job);
    },

    async enqueue(input) {
      assertIdentifier(input.id, "Generation job ID");
      assertIdentifier(input.ownerUserId, "Owner user ID");
      const indexKey = idempotencyIndexKey(
        input.ownerUserId,
        input.idempotencyHash,
      );
      const existingId = idempotencyIndex.get(indexKey);
      if (existingId) {
        const existing = jobs.get(existingId);
        if (!existing) throw storageInvariant();
        assertSameRequest(existing, input.requestHash);
        return { job: clone(existing), created: false };
      }
      if (jobs.has(input.id)) throw idempotencyConflict();
      if (input.status !== "QUEUED") {
        throw new CaresLinkV1ContractError(
          "INVALID_STATE_TRANSITION",
          "New generation jobs must be queued",
        );
      }

      const stored = clone(input);
      jobs.set(stored.id, stored);
      idempotencyIndex.set(indexKey, stored.id);
      return { job: clone(stored), created: true };
    },

    async getOwned({ ownerUserId, jobId }) {
      return clone(requireOwnedJob(jobs, ownerUserId, jobId));
    },

    async claim({ ownerUserId, jobId, now: claimedAt }) {
      const current = requireOwnedJob(jobs, ownerUserId, jobId);
      if (current.status !== "QUEUED") {
        return { job: clone(current), claimed: false };
      }
      const running: CaresLinkV1NoteGenerationStoredJob = {
        ...current,
        status: "RUNNING",
        startedAt: claimedAt,
        updatedAt: claimedAt,
      };
      jobs.set(jobId, running);
      return { job: clone(running), claimed: true };
    },

    async fail({ ownerUserId, jobId, failureCode, now: failedAt }) {
      const current = requireOwnedJob(jobs, ownerUserId, jobId);
      if (isTerminal(current.status)) return clone(current);
      const failed: CaresLinkV1NoteGenerationStoredJob = {
        ...current,
        status: "FAILED",
        failureCode,
        finishedAt: failedAt,
        updatedAt: failedAt,
      };
      jobs.set(jobId, failed);
      return clone(failed);
    },

    async cancel({ ownerUserId, jobId, now: cancelledAt }) {
      const current = requireOwnedJob(jobs, ownerUserId, jobId);
      if (current.status === "CANCELLED") return clone(current);
      if (current.status === "SUCCEEDED" || current.status === "FAILED") {
        throw new CaresLinkV1ContractError(
          "INVALID_STATE_TRANSITION",
          "Completed generation jobs cannot be cancelled",
        );
      }
      const cancelled: CaresLinkV1NoteGenerationStoredJob = {
        ...current,
        status: "CANCELLED",
        finishedAt: cancelledAt,
        updatedAt: cancelledAt,
      };
      jobs.set(jobId, cancelled);
      return clone(cancelled);
    },

    async commitSuccess({
      ownerUserId,
      jobId,
      canonicalId,
      revisionId,
      privacyBinding,
      sessionBinding,
      content,
      contentHash,
      now: committedAt,
    }) {
      const current = requireOwnedJob(jobs, ownerUserId, jobId);
      if (current.status !== "RUNNING") return clone(current);
      if (
        privacyBinding.ownerUserId !== current.ownerUserId ||
        privacyBinding.ownerUserId !== ownerUserId ||
        privacyBinding.privacyReviewId !== current.privacyReviewId ||
        privacyBinding.noteType !== current.noteType ||
        privacyBinding.cleanedFactsHash !== current.cleanedFactsHash ||
        privacyBinding.schemaVersion !== current.schemaVersion ||
        sessionBinding.checkedAt !== privacyBinding.checkedAt ||
        !isValidTimestamp(privacyBinding.checkedAt)
      ) {
        throw new CaresLinkV1ContractError(
          "PRIVACY_REVIEW_STALE",
          "Privacy commit authority does not match the generation job",
        );
      }
      if (
        sessionBinding.principal.userId !== current.admissionPrincipal.userId ||
        sessionBinding.principal.sessionId !==
          current.admissionPrincipal.sessionId ||
        sessionBinding.principal.transport !==
          current.admissionPrincipal.transport
      ) {
        throw new CaresLinkV1ContractError(
          "SESSION_REVOKED",
          "Session commit authority does not match the generation job",
        );
      }
      assertIdentifier(canonicalId, "Canonical document ID");
      assertIdentifier(revisionId, "Document revision ID");
      if (documents.has(canonicalId) || revisionIds.has(revisionId)) {
        throw new CaresLinkV1ContractError(
          "IDEMPOTENCY_CONFLICT",
          "Canonical result identity is already in use",
        );
      }

      const normalizedFacts = validateCaresLinkV1CleanedFacts(
        current.noteType,
        content.factsSummary,
      ) as unknown as CaresLinkV1JsonObject;
      if (
        scanCaresLinkV1CleanedFacts(normalizedFacts).cleanedFactsHash !==
        current.cleanedFactsHash
      ) {
        throw new CaresLinkV1ContractError(
          "PRIVACY_REVIEW_STALE",
          "Canonical facts do not match the reviewed facts",
        );
      }
      const normalizedContent = clone({
        ...content,
        factsSummary: normalizedFacts,
      }) as CaresLinkV1NoteContent;
      if (hashCanonical(normalizedContent) !== contentHash) {
        throw new CaresLinkV1ContractError(
          "VALIDATION_ERROR",
          "Canonical content hash is invalid",
        );
      }

      const mutationId = `note-generation:${createHash("sha256")
        .update(current.id)
        .digest("hex")}`;
      const document: CaresLinkV1Document = {
        id: canonicalId,
        ownerUserId,
        noteType: current.noteType,
        sourceLocale: current.sourceLocale,
        lifecycleStatus: "IN_PROGRESS",
        currentRevisionId: revisionId,
        currentRevisionNumber: 1,
        contractVersion: current.contractVersion,
        schemaVersion: current.schemaVersion,
        createdAt: committedAt,
        updatedAt: committedAt,
      };
      const revision: CaresLinkV1DocumentRevision = {
        id: revisionId,
        documentId: canonicalId,
        ownerUserId,
        revisionNumber: 1,
        privacyReviewId: privacyBinding.privacyReviewId,
        content: normalizedContent,
        contentHash,
        mutationId,
        contractVersion: current.contractVersion,
        schemaVersion: current.schemaVersion,
        createdAt: committedAt,
      };
      const succeeded: CaresLinkV1NoteGenerationStoredJob = {
        ...current,
        status: "SUCCEEDED",
        result: {
          canonicalId,
          revisionId,
          contentHash,
          revisionNumber: 1,
          baseRevisionId: null,
          saveState: CARESLINK_V1_SERVER_SAVE_ACK,
        },
        finishedAt: committedAt,
        updatedAt: committedAt,
      };

      // No awaited work occurs between validation and these mutations: the
      // memory fake models one atomic job + document + initial-revision commit.
      documents.set(canonicalId, { document, revision });
      revisionIds.add(revisionId);
      jobs.set(jobId, succeeded);
      return clone(succeeded);
    },

    async getCanonicalSnapshot({ ownerUserId, canonicalId }) {
      const snapshot = documents.get(canonicalId);
      if (!snapshot || snapshot.document.ownerUserId !== ownerUserId) {
        return undefined;
      }
      return clone(snapshot);
    },
  };
}

type PreparedCommand = Readonly<{
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  serviceCode: CaresLinkV1ServiceCode;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  cleanedFacts: CaresLinkV1JsonObject;
  cleanedFactsHash: string;
  privacyReviewId: string;
  idempotencyHash: string;
  requestHash: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function prepareCommand(
  command: CaresLinkV1NoteGenerationCommand,
): PreparedCommand {
  if (!command || typeof command !== "object") {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "Generation command is required",
    );
  }
  const definition = getCaresLinkV1NoteType(command.noteType);
  if (!isCaresLinkV1Locale(command.sourceLocale)) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "Source locale is unsupported",
    );
  }
  if (command.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "Note schema version is unsupported",
    );
  }
  assertIdentifier(command.privacyReviewId, "Privacy review ID");
  if (typeof command.idempotencyKey !== "string") {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "Idempotency key is invalid",
    );
  }
  assertCaresLinkV1IdempotencyKey(command.idempotencyKey);
  const cleanedFacts = validateCaresLinkV1CleanedFacts(
    command.noteType,
    command.cleanedFacts,
  ) as unknown as CaresLinkV1JsonObject;
  // Reuse the upload gate so job admission has the same depth/node/64 KiB
  // bounds and canonical facts hash as the privacy proof it consumes.
  const cleanedFactsHash =
    scanCaresLinkV1CleanedFacts(cleanedFacts).cleanedFactsHash;
  const requestHash = hashCanonical({
    noteType: command.noteType,
    sourceLocale: command.sourceLocale,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: command.schemaVersion,
    privacyReviewId: command.privacyReviewId,
    cleanedFacts,
  });
  return {
    noteType: command.noteType,
    sourceLocale: command.sourceLocale,
    serviceCode: definition.generationServiceCode,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: command.schemaVersion,
    cleanedFacts,
    cleanedFactsHash,
    privacyReviewId: command.privacyReviewId,
    idempotencyHash: createHash("sha256")
      .update(command.idempotencyKey)
      .digest("hex"),
    requestHash,
  };
}

function toAck(
  job: CaresLinkV1NoteGenerationStoredJob,
): CaresLinkV1NoteGenerationJobAck {
  return clone({
    jobId: job.id,
    status: job.status,
    noteType: job.noteType,
    serviceCode: job.serviceCode,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    ...(job.failureCode ? { failureCode: job.failureCode } : {}),
    ...(job.result ? { result: job.result } : {}),
  });
}

function assertSameRequest(
  job: Pick<CaresLinkV1NoteGenerationStoredJob, "requestHash">,
  requestHash: string,
) {
  if (job.requestHash !== requestHash) throw idempotencyConflict();
}

function assertPrincipal(principal: CaresLinkV1AuthenticatedPrincipal) {
  if (!principal || typeof principal !== "object") {
    throw new CaresLinkV1ContractError(
      "AUTH_REQUIRED",
      "An authenticated session is required",
    );
  }
  assertAuthIdentifier(principal.userId);
  assertAuthIdentifier(principal.sessionId);
  if (principal.transport !== "BEARER" && principal.transport !== "COOKIE") {
    throw new CaresLinkV1ContractError(
      "AUTH_REQUIRED",
      "An authenticated session is required",
    );
  }
}

function assertAuthIdentifier(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new CaresLinkV1ContractError(
      "AUTH_REQUIRED",
      "An authenticated session is required",
    );
  }
}

function assertIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      `${label} is invalid`,
    );
  }
}

function normalizeSessionError(error: unknown) {
  if (
    error instanceof CaresLinkV1ContractError &&
    error.code === "SESSION_REVOKED"
  ) {
    return new CaresLinkV1ContractError(
      "SESSION_REVOKED",
      "The authenticated session is no longer active",
    );
  }
  return new CaresLinkV1ContractError(
    "AUTH_REQUIRED",
    "An active authenticated session is required",
  );
}

function normalizePrivacyError(error: unknown) {
  if (
    error instanceof CaresLinkV1ContractError &&
    error.code === "PRIVACY_REVIEW_STALE"
  ) {
    return new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_STALE",
      "Privacy review must be repeated before generation",
    );
  }
  return new CaresLinkV1ContractError(
    "PRIVACY_REVIEW_REQUIRED",
    "A valid privacy review is required before generation",
  );
}

function admissionFailureCode(
  error: unknown,
): CaresLinkV1NoteGenerationFailureCode {
  if (error instanceof CaresLinkV1ContractError) {
    if (error.code === "SESSION_REVOKED") return "SESSION_REVOKED";
    if (error.code === "PRIVACY_REVIEW_STALE") {
      return "PRIVACY_REVIEW_STALE";
    }
    if (error.code === "PRIVACY_REVIEW_REQUIRED") {
      return "PRIVACY_REVIEW_REQUIRED";
    }
  }
  return "AUTH_REQUIRED";
}

function commitFailureCode(
  error: unknown,
): CaresLinkV1NoteGenerationFailureCode {
  if (
    error instanceof CaresLinkV1ContractError &&
    (error.code === "AUTH_REQUIRED" ||
      error.code === "SESSION_REVOKED" ||
      error.code === "PRIVACY_REVIEW_REQUIRED" ||
      error.code === "PRIVACY_REVIEW_STALE")
  ) {
    return admissionFailureCode(error);
  }
  return "GENERATION_FAILED";
}

function requireOwnedJob(
  jobs: Map<string, CaresLinkV1NoteGenerationStoredJob>,
  ownerUserId: string,
  jobId: string,
) {
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== ownerUserId) {
    throw new CaresLinkV1ContractError(
      "NOT_FOUND",
      "The requested generation job was not found",
    );
  }
  return job;
}

function isTerminal(status: CaresLinkV1GenerationStatus) {
  return (
    status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED"
  );
}

function hashCanonical(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value))
    .digest("hex");
}

function isValidTimestamp(value: string) {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function idempotencyIndexKey(ownerUserId: string, idempotencyHash: string) {
  return `${ownerUserId}:${idempotencyHash}`;
}

function idempotencyConflict() {
  return new CaresLinkV1ContractError(
    "IDEMPOTENCY_CONFLICT",
    "The idempotency key was already used for different input",
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
