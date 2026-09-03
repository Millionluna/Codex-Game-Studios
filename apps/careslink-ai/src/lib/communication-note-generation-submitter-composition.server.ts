import "server-only";

import { createHash } from "node:crypto";

import {
  COMMUNICATION_NOTE_GENERATION_FAILURE_CODES,
  type CommunicationNoteGenerationAdmission,
  type CommunicationNoteGenerationJob,
  type CommunicationNoteGenerationResult,
} from "./communication-note-generation-contract";
import {
  type CommunicationNoteGenerationCommand,
  type CommunicationNoteGenerationSubmitter,
} from "./communication-note-generation-route.server";
import { stringifyCaresLinkV1CanonicalJson } from "./v1/canonical-json";
import type {
  CaresLinkV1CommunicationNotePointsAdmissionRepository,
} from "./v1/note-generation-owner-repository.server";
import { scanCaresLinkV1CleanedFacts } from "./v1/privacy-review-scanner.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_GENERATION_STATUSES,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  isCaresLinkV1Locale,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1CleanedFactsFor,
  type CaresLinkV1PrivacyProof,
} from "./v1/shared-contracts";

/**
 * Source-only product orchestration. The formal runtime stays absent until the
 * encrypted payload vault, retention policy and purpose-scoped database
 * caller are approved together.
 */
export const CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_READY =
  false as const;

export const CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_TEST_CAPABILITY =
  "TEST_ONLY_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION" as const;

export const COMMUNICATION_NOTE_GENERATION_FORMAL_SUBMITTER_COMPOSITION =
  undefined as CommunicationNoteGenerationSubmitter | undefined;

export type CommunicationNoteGenerationPrivacyReviewIssuer = Readonly<{
  /**
   * A conforming issuer must replay the same proof for the same
   * owner/idempotency/facts binding. Within one owner's namespace it must
   * reject the same idempotency key with a different reviewed-facts binding;
   * different owners have independent idempotency namespaces.
   */
  confirm(input: Readonly<{
    principal: CommunicationNoteGenerationCommand["principal"];
    noteType: "communication";
    cleanedFactsHash: string;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    scannerPolicyVersion: string;
    reviewRevision: typeof CARESLINK_V1_PRIVACY_REVIEW_REVISION;
    findingDecisions: readonly [];
    deIdentificationConfirmed: true;
    authorityToProcessConfirmed: true;
    idempotencyKey: string;
  }>): Promise<CaresLinkV1PrivacyProof>;
}>;

export type CommunicationNoteGenerationStagedPayload = Readonly<{
  /** Stable for the same owner + idempotency hash + exact request. */
  jobId: string;
  /** Stable for the same owner + idempotency hash + exact request. */
  payloadId: string;
  /** Digest only. A vault locator must never cross this boundary. */
  payloadHandleHash: string;
  payloadExpiresAt: string;
  /** Exact immutable policy selected before ciphertext is written. */
  payloadPolicyVersion: string;
  /** Legacy catalog digest of policy, encryption and backup identifiers. */
  payloadPolicySnapshotHash: string;
  /** Exact envelope-encryption profile used for this ciphertext. */
  encryptionProfileVersion: string;
  /** Digest of the exact numeric KMS key-version resource, never an alias. */
  kmsKeyVersionResourceHash: string;
  /** Exact backup/deletion disposition applied to the stored ciphertext. */
  backupDispositionVersion: string;
}>;

export type CommunicationNoteGenerationPayloadStager = Readonly<{
  /**
   * Encrypts and retention-bounds the exact cleaned facts before database
   * admission. A conforming implementation must replay the same receipt for
   * the same owner/idempotency/request binding so response-loss retries cannot
   * orphan or replace a payload referenced by an admitted job. It must reject
   * the same owner/idempotency binding when the request hash differs.
   */
  stageCanonicalFacts(input: Readonly<{
    ownerUserId: string;
    noteType: "communication";
    sourceLocale: CommunicationNoteGenerationCommand["sourceLocale"];
    contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    privacyReviewId: string;
    privacyProofExpiresAt: string;
    cleanedFacts: CaresLinkV1CleanedFactsFor<"communication">;
    cleanedFactsHash: string;
    idempotencyHash: string;
    requestHash: string;
  }>): Promise<CommunicationNoteGenerationStagedPayload>;
  /** Idempotent purge request for a payload the database explicitly rejected. */
  abortUnaccepted(input: Readonly<{
    ownerUserId: string;
    /** Required to address the private owner/idempotency vault namespace. */
    idempotencyHash: string;
    requestHash: string;
    staged: CommunicationNoteGenerationStagedPayload;
    reason: "PAYLOAD_NOT_ACCEPTED";
  }>): Promise<void>;
}>;

export type CommunicationNoteGenerationPointsAdmissionRepositoryFactory = (
  principal: CommunicationNoteGenerationCommand["principal"],
) => CaresLinkV1CommunicationNotePointsAdmissionRepository | undefined;

export type TestOnlyCommunicationNoteGenerationSubmitterCompositionOptions =
  Readonly<{
    capability: typeof CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_TEST_CAPABILITY;
  }> &
  CommunicationNoteGenerationSubmitterCompositionOptions;

export type CommunicationNoteGenerationSubmitterCompositionOptions =
  Readonly<{
    privacyReviewIssuer: CommunicationNoteGenerationPrivacyReviewIssuer;
    payloadStager: CommunicationNoteGenerationPayloadStager;
    createPointsAdmissionRepository: CommunicationNoteGenerationPointsAdmissionRepositoryFactory;
  }>;

/**
 * Provider-neutral composition core. It performs no environment lookup,
 * credential creation, network call or model dispatch at construction time.
 * A formal runtime may use it only after every injected port is independently
 * target-guarded and approved.
 */
export function createCommunicationNoteGenerationSubmitterComposition(
  options: CommunicationNoteGenerationSubmitterCompositionOptions,
): CommunicationNoteGenerationSubmitter {
  const privacyReviewIssuer = options?.privacyReviewIssuer;
  const payloadStager = options?.payloadStager;
  const createPointsAdmissionRepository =
    options?.createPointsAdmissionRepository;
  if (
    typeof privacyReviewIssuer?.confirm !== "function" ||
    typeof payloadStager?.stageCanonicalFacts !== "function" ||
    typeof payloadStager?.abortUnaccepted !== "function" ||
    typeof createPointsAdmissionRepository !== "function"
  ) {
    throw unavailable();
  }

  const confirm = privacyReviewIssuer.confirm.bind(privacyReviewIssuer);
  const stageCanonicalFacts =
    payloadStager.stageCanonicalFacts.bind(payloadStager);
  const abortUnaccepted = payloadStager.abortUnaccepted.bind(payloadStager);
  const createRepository = createPointsAdmissionRepository.bind(undefined);

  return createSubmitter(
    Object.freeze({
      privacyReviewIssuer: Object.freeze({ confirm }),
      payloadStager: Object.freeze({
        stageCanonicalFacts,
        abortUnaccepted,
      }),
      createPointsAdmissionRepository: createRepository,
    }),
  );
}

/**
 * Source-test seam only. It performs no provider/model call: a successful
 * submit ends at the durable `QUEUED` row consumed by the registered async
 * worker boundary.
 */
export function createTestOnlyCommunicationNoteGenerationSubmitterComposition(
  options: TestOnlyCommunicationNoteGenerationSubmitterCompositionOptions,
): CommunicationNoteGenerationSubmitter {
  if (
    options.capability !==
    CARESLINK_COMMUNICATION_NOTE_SUBMITTER_COMPOSITION_TEST_CAPABILITY
  ) {
    throw unavailable();
  }

  return createCommunicationNoteGenerationSubmitterComposition(options);
}

function createSubmitter(
  options: CommunicationNoteGenerationSubmitterCompositionOptions,
): CommunicationNoteGenerationSubmitter {
  return Object.freeze({
    async submit(command) {
      const prepared = prepareCommand(command);
      const proof = parsePrivacyProof(
        await options.privacyReviewIssuer.confirm({
          principal: prepared.principal,
          noteType: "communication",
          cleanedFactsHash: prepared.cleanedFactsHash,
          schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
          scannerPolicyVersion: prepared.scannerPolicyVersion,
          reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
          findingDecisions: [],
          deIdentificationConfirmed: true,
          authorityToProcessConfirmed: true,
          idempotencyKey: prepared.idempotencyKey,
        }),
        prepared,
      );

      const requestHash = sha256Canonical({
        noteType: "communication",
        sourceLocale: prepared.sourceLocale,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        privacyReviewId: proof.id,
        cleanedFacts: prepared.cleanedFacts,
      });
      const idempotencyHash = sha256(prepared.idempotencyKey);

      let repository: CaresLinkV1CommunicationNotePointsAdmissionRepository;
      try {
        const candidate = options.createPointsAdmissionRepository(
          prepared.principal,
        );
        if (!candidate || typeof candidate.enqueue !== "function") {
          throw unavailable();
        }
        repository = candidate;
      } catch (error) {
        throw normalizeError(error);
      }

      const staged = parseStagedPayload(
        await options.payloadStager.stageCanonicalFacts({
          ownerUserId: prepared.principal.userId,
          noteType: "communication",
          sourceLocale: prepared.sourceLocale,
          contractVersion: CARESLINK_V1_CONTRACT_VERSION,
          schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
          privacyReviewId: proof.id,
          privacyProofExpiresAt: proof.expiresAt,
          cleanedFacts: cloneCleanedFacts(prepared.cleanedFacts),
          cleanedFactsHash: prepared.cleanedFactsHash,
          idempotencyHash,
          requestHash,
        }),
        proof.expiresAt,
      );

      let admitted: Awaited<ReturnType<typeof repository.enqueue>>;
      try {
        admitted = await repository.enqueue({
          jobId: staged.jobId,
          payloadId: staged.payloadId,
          sourceLocale: prepared.sourceLocale,
          privacyReviewId: proof.id,
          cleanedFactsHash: prepared.cleanedFactsHash,
          idempotencyHash,
          requestHash,
          payloadHandleHash: staged.payloadHandleHash,
          payloadExpiresAt: staged.payloadExpiresAt,
          payloadPolicyVersion: staged.payloadPolicyVersion,
          payloadPolicySnapshotHash: staged.payloadPolicySnapshotHash,
          encryptionProfileVersion: staged.encryptionProfileVersion,
          kmsKeyVersionResourceHash: staged.kmsKeyVersionResourceHash,
          backupDispositionVersion: staged.backupDispositionVersion,
        });
      } catch (error) {
        // An exception is not proof that the transaction did not commit. A
        // replay can also fail a fresh-session check after an earlier response
        // was lost. Keep the bounded, stable payload for reconciliation rather
        // than risk deleting facts already referenced by a durable job.
        throw normalizeError(error);
      }

      const projection = toAdmission(admitted, staged);
      if (!projection.payloadAccepted) {
        await abortUnacceptedOrDisable(options.payloadStager, {
          ownerUserId: prepared.principal.userId,
          idempotencyHash,
          requestHash,
          staged,
          reason: "PAYLOAD_NOT_ACCEPTED",
        });
      }

      return projection.admission;
    },
  });
}

type PreparedCommand = Readonly<{
  principal: CommunicationNoteGenerationCommand["principal"];
  sourceLocale: CommunicationNoteGenerationCommand["sourceLocale"];
  cleanedFacts: CaresLinkV1CleanedFactsFor<"communication">;
  cleanedFactsHash: string;
  scannerPolicyVersion: string;
  idempotencyKey: string;
}>;

function prepareCommand(
  command: CommunicationNoteGenerationCommand,
): PreparedCommand {
  if (
    !command ||
    typeof command !== "object" ||
    command.noteType !== "communication" ||
    command.serviceCode !== "note.communication.generate" ||
    !isCaresLinkV1Locale(command.sourceLocale) ||
    command.principal?.transport !== "COOKIE" ||
    command.privacyReview?.reviewedNoIdentifiers !== true ||
    command.privacyReview?.processingAuthorityConfirmed !== true
  ) {
    throw validationError();
  }
  const userId = parseUuid(command.principal.userId);
  const sessionId = parseUuid(command.principal.sessionId);
  if (!userId || !sessionId) throw validationError();
  assertCaresLinkV1IdempotencyKey(command.idempotencyKey);
  const cleanedFacts = validateCaresLinkV1CleanedFacts(
    "communication",
    command.cleanedFacts,
  );
  const scan = scanCaresLinkV1CleanedFacts(cleanedFacts);
  if (
    scan.findings.length !== 0 ||
    scan.cleanedFactsHash !== command.cleanedFactsHash ||
    scan.scannerPolicyVersion !== command.scannerPolicyVersion
  ) {
    throw privacyRequired();
  }
  return Object.freeze({
    principal: Object.freeze({
      userId,
      sessionId,
      transport: "COOKIE" as const,
    }),
    sourceLocale: command.sourceLocale,
    cleanedFacts: cloneCleanedFacts(cleanedFacts),
    cleanedFactsHash: scan.cleanedFactsHash,
    scannerPolicyVersion: scan.scannerPolicyVersion,
    idempotencyKey: command.idempotencyKey,
  });
}

function parsePrivacyProof(
  value: CaresLinkV1PrivacyProof,
  prepared: PreparedCommand,
) {
  const proof = exactRecord(value, [
    "cleanedFactsHash",
    "confirmedAt",
    "expiresAt",
    "findingDecisions",
    "id",
    "noteType",
    "ownerUserId",
    "reviewRevision",
    "scannerPolicyVersion",
    "schemaVersion",
    "status",
  ] as const);
  const confirmedAt = parsePrivacyProofTime(proof.confirmedAt);
  const expiresAt = parsePrivacyProofTime(proof.expiresAt);
  if (
    parseUuid(proof.id) === undefined ||
    proof.ownerUserId !== prepared.principal.userId ||
    proof.noteType !== "communication" ||
    proof.cleanedFactsHash !== prepared.cleanedFactsHash ||
    proof.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION ||
    proof.status !== "CONFIRMED" ||
    proof.scannerPolicyVersion !== prepared.scannerPolicyVersion ||
    proof.reviewRevision !== CARESLINK_V1_PRIVACY_REVIEW_REVISION ||
    !Array.isArray(proof.findingDecisions) ||
    proof.findingDecisions.length !== 0 ||
    confirmedAt === undefined ||
    expiresAt === undefined ||
    expiresAt - confirmedAt !==
      CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS * 1000
  ) {
    throw unavailable();
  }
  return Object.freeze({
    id: (proof.id as string).toLowerCase(),
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

function parseStagedPayload(
  value: CommunicationNoteGenerationStagedPayload,
  privacyProofExpiresAt: string,
): CommunicationNoteGenerationStagedPayload {
  const staged = exactRecord(value, [
    "backupDispositionVersion",
    "encryptionProfileVersion",
    "jobId",
    "kmsKeyVersionResourceHash",
    "payloadExpiresAt",
    "payloadHandleHash",
    "payloadId",
    "payloadPolicySnapshotHash",
    "payloadPolicyVersion",
  ] as const);
  const payloadExpiresAt = parseCanonicalServerTime(staged.payloadExpiresAt);
  if (
    parseUuid(staged.jobId) === undefined ||
    parseUuid(staged.payloadId) === undefined ||
    typeof staged.payloadHandleHash !== "string" ||
    !SHA256_PATTERN.test(staged.payloadHandleHash) ||
    typeof staged.payloadPolicySnapshotHash !== "string" ||
    !SHA256_PATTERN.test(staged.payloadPolicySnapshotHash) ||
    typeof staged.kmsKeyVersionResourceHash !== "string" ||
    !SHA256_PATTERN.test(staged.kmsKeyVersionResourceHash) ||
    !isPolicyIdentifier(staged.payloadPolicyVersion) ||
    !isPolicyIdentifier(staged.encryptionProfileVersion) ||
    !isPolicyIdentifier(staged.backupDispositionVersion) ||
    payloadExpiresAt === undefined ||
    payloadExpiresAt > Date.parse(privacyProofExpiresAt)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    jobId: (staged.jobId as string).toLowerCase(),
    payloadId: (staged.payloadId as string).toLowerCase(),
    payloadHandleHash: staged.payloadHandleHash,
    payloadExpiresAt: staged.payloadExpiresAt as string,
    payloadPolicyVersion: staged.payloadPolicyVersion,
    payloadPolicySnapshotHash: staged.payloadPolicySnapshotHash,
    encryptionProfileVersion: staged.encryptionProfileVersion,
    kmsKeyVersionResourceHash: staged.kmsKeyVersionResourceHash,
    backupDispositionVersion: staged.backupDispositionVersion,
  });
}

function toAdmission(
  admitted: Awaited<
    ReturnType<CaresLinkV1CommunicationNotePointsAdmissionRepository["enqueue"]>
  >,
  staged: CommunicationNoteGenerationStagedPayload,
): Readonly<{
  admission: CommunicationNoteGenerationAdmission;
  payloadAccepted: boolean;
}> {
  const envelope = exactRecord(admitted, [
    "created",
    "job",
    "payloadAccepted",
    "pointsReserved",
  ] as const);
  if (
    typeof envelope.created !== "boolean" ||
    typeof envelope.payloadAccepted !== "boolean" ||
    envelope.pointsReserved !== true
  ) {
    throw unavailable();
  }
  const job = parseOwnerJob(envelope.job);
  if (
    (envelope.created &&
      (!envelope.payloadAccepted ||
        job.jobId !== staged.jobId ||
        job.status !== "QUEUED" ||
        job.attemptCount !== 0 ||
        job.startedAt !== undefined ||
        job.createdAt !== job.updatedAt)) ||
    (envelope.payloadAccepted && job.jobId !== staged.jobId)
  ) {
    throw unavailable();
  }
  const admission = Object.freeze({
    created: envelope.created,
    job,
  }) as CommunicationNoteGenerationAdmission;
  return Object.freeze({
    admission,
    payloadAccepted: envelope.payloadAccepted,
  });
}

function parseOwnerJob(value: unknown): CommunicationNoteGenerationJob {
  const record = dataRecordWithAllowedKeys(
    value,
    [
      "attemptCount",
      "createdAt",
      "failureCode",
      "finishedAt",
      "jobId",
      "noteType",
      "result",
      "serviceCode",
      "startedAt",
      "status",
      "updatedAt",
    ],
    [
      "attemptCount",
      "createdAt",
      "jobId",
      "noteType",
      "serviceCode",
      "status",
      "updatedAt",
    ],
  );
  const jobId = parseUuid(record.jobId);
  const status = enumValue(record.status, CARESLINK_V1_GENERATION_STATUSES);
  const attemptCount = nonnegativeSafeInteger(record.attemptCount);
  const createdAt = canonicalServerTime(record.createdAt);
  const updatedAt = canonicalServerTime(record.updatedAt);
  const startedAt = optionalCanonicalServerTime(record.startedAt);
  const finishedAt = optionalCanonicalServerTime(record.finishedAt);
  const failureCode = optionalEnumValue(
    record.failureCode,
    COMMUNICATION_NOTE_GENERATION_FAILURE_CODES,
  );
  const result =
    record.result === undefined ? undefined : parseGenerationResult(record.result);
  if (
    jobId === undefined ||
    status === undefined ||
    attemptCount === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    startedAt === null ||
    finishedAt === null ||
    failureCode === null ||
    record.noteType !== "communication" ||
    record.serviceCode !== "note.communication.generate"
  ) {
    throw unavailable();
  }
  assertJobTimeline({
    status,
    attemptCount,
    createdAt,
    updatedAt,
    startedAt,
    finishedAt,
    failureCode,
    result,
  });
  const base = {
    jobId,
    noteType: "communication" as const,
    serviceCode: "note.communication.generate" as const,
    attemptCount,
    createdAt,
    updatedAt,
  };
  switch (status) {
    case "QUEUED":
      return Object.freeze({
        ...base,
        status,
        ...(startedAt === undefined ? {} : { startedAt }),
      });
    case "RUNNING":
      return Object.freeze({ ...base, status, startedAt: startedAt as string });
    case "SUCCEEDED":
      return Object.freeze({
        ...base,
        status,
        startedAt: startedAt as string,
        finishedAt: finishedAt as string,
        result: result as CommunicationNoteGenerationResult,
      });
    case "FAILED":
      return Object.freeze({
        ...base,
        status,
        startedAt: startedAt as string,
        finishedAt: finishedAt as string,
        failureCode: failureCode as (typeof COMMUNICATION_NOTE_GENERATION_FAILURE_CODES)[number],
      });
    case "CANCELLED":
      return Object.freeze({
        ...base,
        status,
        ...(startedAt === undefined ? {} : { startedAt }),
        finishedAt: finishedAt as string,
      });
  }
}

function parseGenerationResult(value: unknown): CommunicationNoteGenerationResult {
  const result = exactRecord(value, [
    "baseRevisionId",
    "canonicalId",
    "contentHash",
    "revisionId",
    "revisionNumber",
    "saveState",
  ] as const);
  const canonicalId = parseUuid(result.canonicalId);
  const revisionId = parseUuid(result.revisionId);
  if (
    canonicalId === undefined ||
    revisionId === undefined ||
    typeof result.contentHash !== "string" ||
    !SHA256_PATTERN.test(result.contentHash) ||
    result.revisionNumber !== 1 ||
    result.baseRevisionId !== null ||
    result.saveState !== "SERVER_ACKNOWLEDGED"
  ) {
    throw unavailable();
  }
  return Object.freeze({
    canonicalId,
    revisionId,
    contentHash: result.contentHash,
    revisionNumber: 1,
    baseRevisionId: null,
    saveState: "SERVER_ACKNOWLEDGED",
  });
}

function assertJobTimeline(input: Readonly<{
  status: (typeof CARESLINK_V1_GENERATION_STATUSES)[number];
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  failureCode?: (typeof COMMUNICATION_NOTE_GENERATION_FAILURE_CODES)[number];
  result?: CommunicationNoteGenerationResult;
}>) {
  const createdAt = Date.parse(input.createdAt);
  const updatedAt = Date.parse(input.updatedAt);
  const startedAt = input.startedAt ? Date.parse(input.startedAt) : undefined;
  const finishedAt = input.finishedAt ? Date.parse(input.finishedAt) : undefined;
  const timelineValid =
    updatedAt >= createdAt &&
    (startedAt === undefined ||
      (startedAt >= createdAt && startedAt <= updatedAt)) &&
    (finishedAt === undefined ||
      (finishedAt >= createdAt &&
        finishedAt <= updatedAt &&
        (startedAt === undefined || finishedAt >= startedAt)));
  const queued =
    input.status === "QUEUED" &&
    input.finishedAt === undefined &&
    input.failureCode === undefined &&
    input.result === undefined;
  const running =
    input.status === "RUNNING" &&
    input.attemptCount > 0 &&
    input.startedAt !== undefined &&
    input.finishedAt === undefined &&
    input.failureCode === undefined &&
    input.result === undefined;
  const succeeded =
    input.status === "SUCCEEDED" &&
    input.attemptCount > 0 &&
    input.startedAt !== undefined &&
    input.finishedAt !== undefined &&
    input.failureCode === undefined &&
    input.result !== undefined;
  const failed =
    input.status === "FAILED" &&
    input.attemptCount > 0 &&
    input.startedAt !== undefined &&
    input.finishedAt !== undefined &&
    input.failureCode !== undefined &&
    input.result === undefined;
  const cancelled =
    input.status === "CANCELLED" &&
    input.finishedAt !== undefined &&
    input.failureCode === undefined &&
    input.result === undefined;
  if (
    !timelineValid ||
    (input.attemptCount === 0) !== (input.startedAt === undefined) ||
    (!queued && !running && !succeeded && !failed && !cancelled)
  ) {
    throw unavailable();
  }
}

async function abortUnacceptedOrDisable(
  stager: CommunicationNoteGenerationPayloadStager,
  input: Parameters<CommunicationNoteGenerationPayloadStager["abortUnaccepted"]>[0],
) {
  try {
    await stager.abortUnaccepted(input);
  } catch {
    throw unavailable();
  }
}

function normalizeError(error: unknown) {
  return error instanceof CaresLinkV1ContractError ? error : unavailable();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value: unknown) {
  return sha256(stringifyCaresLinkV1CanonicalJson(value));
}

function cloneCleanedFacts(
  facts: CaresLinkV1CleanedFactsFor<"communication">,
): CaresLinkV1CleanedFactsFor<"communication"> {
  return {
    occurred_at: facts.occurred_at,
    contact_channel: facts.contact_channel,
    parties_by_role: [...facts.parties_by_role],
    observable_facts: facts.observable_facts,
    action_taken: facts.action_taken,
    ...(facts.stated_outcome ? { stated_outcome: facts.stated_outcome } : {}),
    ...(facts.follow_up ? { follow_up: facts.follow_up } : {}),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const POLICY_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SERVER_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PRIVACY_PROOF_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : undefined;
}

function parseCanonicalServerTime(value: unknown) {
  if (typeof value !== "string" || !SERVER_TIME_PATTERN.test(value)) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? parsed
    : undefined;
}

function isPolicyIdentifier(value: unknown): value is string {
  return typeof value === "string" && POLICY_IDENTIFIER_PATTERN.test(value);
}

function parsePrivacyProofTime(value: unknown) {
  if (typeof value !== "string" || !PRIVACY_PROOF_TIME_PATTERN.test(value)) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function exactRecord<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
): Record<Key, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw unavailable();
  }
  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function dataRecordWithAllowedKeys(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const names = Object.getOwnPropertyNames(value);
  const allowed = new Set(allowedKeys);
  if (
    names.some((name) => !allowed.has(name)) ||
    requiredKeys.some((name) => !names.includes(name))
  ) {
    throw unavailable();
  }
  const result = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw unavailable();
    }
    result[name] = descriptor.value;
  }
  return result;
}

function enumValue<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value | undefined {
  return typeof value === "string" && allowed.includes(value as Value)
    ? (value as Value)
    : undefined;
}

function optionalEnumValue<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value | undefined | null {
  return value === undefined ? undefined : enumValue(value, allowed) ?? null;
}

function nonnegativeSafeInteger(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

function canonicalServerTime(value: unknown) {
  return parseCanonicalServerTime(value) === undefined
    ? undefined
    : (value as string);
}

function optionalCanonicalServerTime(value: unknown) {
  return value === undefined
    ? undefined
    : canonicalServerTime(value) ?? null;
}

function validationError() {
  return new CaresLinkV1ContractError(
    "VALIDATION_ERROR",
    "The Communication Note generation request was rejected",
  );
}

function privacyRequired() {
  return new CaresLinkV1ContractError(
    "PRIVACY_REVIEW_REQUIRED",
    "Privacy review is required before generation",
  );
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "The Communication Note generation submitter is unavailable",
  );
}
