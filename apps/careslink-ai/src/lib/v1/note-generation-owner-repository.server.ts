import "server-only";

import type { CaresLinkV1NoteGenerationDurableOwnerView } from "./note-generation-durable";
import type {
  CaresLinkV1NoteGenerationFailureCode,
  CaresLinkV1NoteGenerationResult,
} from "./note-generation-job";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_GENERATION_STATUSES,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  type CaresLinkV1GenerationStatus,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";
import {
  CARESLINK_V1_SERVER_SAVE_ACK,
  type CaresLinkV1AuthenticatedPrincipal,
} from "./transport-contract";

/**
 * Source-only owner repository adapter. It creates no connection, pool, route,
 * environment lookup, database role, execute grant or runtime registration.
 */
export const CARESLINK_V1_NOTE_GENERATION_OWNER_REPOSITORY_READY =
  false as const;

/**
 * Purpose-specific source-only adapter for the atomic Communication Note
 * admission + 20-Point reservation coordinator. It is intentionally not
 * wired into the Product route or any live database capability.
 */
export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_REPOSITORY_READY =
  false as const;

export const CARESLINK_V1_NOTE_GENERATION_OWNER_REPOSITORY_RPC_NAMES = {
  enqueue: "admit_and_enqueue_v1_shadow_note_generation_job",
  get: "get_v1_shadow_note_generation_job_status",
  cancel: "cancel_v1_shadow_note_generation_job",
} as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME =
  "admit_and_reserve_v1_shadow_communication_note_generation_job" as const;

export type CaresLinkV1NoteGenerationOwnerRepositoryQuery = (
  sql: string,
  values: readonly unknown[],
) => PromiseLike<unknown>;

/**
 * Server-private, content-free admission receipt. The route or vault boundary
 * creates these identifiers and digests; none is an owner response field.
 * Raw facts, raw idempotency keys, vault locators and privacy proof bodies are
 * deliberately absent.
 */
export type CaresLinkV1NoteGenerationOwnerAdmissionInput = Readonly<{
  jobId: string;
  payloadId: string;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  privacyReviewId: string;
  cleanedFactsHash: string;
  idempotencyHash: string;
  requestHash: string;
  payloadHandleHash: string;
  payloadExpiresAt: string;
}>;

/**
 * `payloadAccepted` is server-private orphan-cleanup evidence. Only `job` may
 * be serialized into an owner response.
 */
export type CaresLinkV1NoteGenerationOwnerAdmissionResult = Readonly<{
  created: boolean;
  payloadAccepted: boolean;
  job: CaresLinkV1NoteGenerationDurableOwnerView;
}>;

export type CaresLinkV1CommunicationNotePointsAdmissionInput = Readonly<
  Omit<CaresLinkV1NoteGenerationOwnerAdmissionInput, "noteType">
>;

export type CaresLinkV1CommunicationNotePointsAdmissionResult = Readonly<{
  created: boolean;
  payloadAccepted: boolean;
  pointsReserved: true;
  job: CaresLinkV1NoteGenerationDurableOwnerView;
}>;

export type CaresLinkV1CommunicationNotePointsAdmissionRepository = Readonly<{
  enqueue(
    input: CaresLinkV1CommunicationNotePointsAdmissionInput,
  ): Promise<CaresLinkV1CommunicationNotePointsAdmissionResult>;
}>;

export type CaresLinkV1NoteGenerationOwnerRepository = Readonly<{
  enqueue(
    input: CaresLinkV1NoteGenerationOwnerAdmissionInput,
  ): Promise<CaresLinkV1NoteGenerationOwnerAdmissionResult>;
  get(
    input: Readonly<{ jobId: string }>,
  ): Promise<CaresLinkV1NoteGenerationDurableOwnerView>;
  cancel(
    input: Readonly<{ jobId: string }>,
  ): Promise<CaresLinkV1NoteGenerationDurableOwnerView>;
}>;

type RpcCall = Readonly<{
  sql: string;
}>;

const RPC_CALLS = Object.freeze({
  enqueue: Object.freeze({
    sql: `select careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
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
) as data`,
  } satisfies RpcCall),
  get: Object.freeze({
    sql: `select careslink_v1_generation.get_v1_shadow_note_generation_job_status(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text
) as data`,
  } satisfies RpcCall),
  cancel: Object.freeze({
    sql: `select careslink_v1_generation.cancel_v1_shadow_note_generation_job(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text
) as data`,
  } satisfies RpcCall),
});

const COMMUNICATION_POINTS_ADMISSION_RPC_CALL = Object.freeze({
  sql: `select careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
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
) as data`,
} satisfies RpcCall);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INPUT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SERVER_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const OWNER_FAILURE_CODES = Object.freeze([
  "SESSION_REVOKED",
  "PRIVACY_REVIEW_STALE",
  "GENERATION_FAILED",
] as const satisfies readonly CaresLinkV1NoteGenerationFailureCode[]);

const SAFE_DATABASE_MESSAGES = new Set([
  "SESSION_REVOKED",
  "NOT_FOUND",
  "MIN_CLIENT_VERSION",
  "PRIVACY_REVIEW_REQUIRED",
  "PRIVACY_REVIEW_STALE",
  "IDEMPOTENCY_CONFLICT",
  "IDENTITY_LINK_CONFLICT",
  "INVALID_STATE_TRANSITION",
  "PRODUCT_API_DISABLED",
  "VALIDATION_ERROR",
]);

const COMMUNICATION_POINTS_SAFE_DATABASE_MESSAGES = new Set([
  ...SAFE_DATABASE_MESSAGES,
  "POINTS_INSUFFICIENT",
  "POINT_QUOTE_EXPIRED",
]);

const FIXED_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  AUTH_REQUIRED: "Authentication is required",
  SESSION_REVOKED: "The authenticated session is no longer active",
  FORBIDDEN: "The authenticated session cannot perform this operation",
  NOT_FOUND: "The requested generation job was not found",
  MINIMUM_FACTS_REQUIRED: "Required cleaned facts are missing or empty",
  MIN_CLIENT_VERSION: "The Note generation contract version is unsupported",
  PRIVACY_REVIEW_REQUIRED:
    "A valid privacy review is required before generation",
  PRIVACY_REVIEW_STALE:
    "Privacy review must be repeated before generation",
  POINTS_INSUFFICIENT: "The shadow wallet does not have enough points",
  POINT_QUOTE_EXPIRED: "The point reservation window has expired",
  IDEMPOTENCY_CONFLICT:
    "The idempotency key was already used for different input",
  IDENTITY_LINK_CONFLICT:
    "The staged payload identity conflicts with the existing generation request",
  INVALID_STATE_TRANSITION:
    "The generation job cannot be cancelled in its current state",
  PRODUCT_API_DISABLED: "The Note generation owner repository is unavailable",
  VALIDATION_ERROR: "The Note generation owner request was rejected",
});

const FACTORY_KEYS = ["capability", "principal", "query"] as const;
const PRINCIPAL_KEYS = ["sessionId", "transport", "userId"] as const;
const ENQUEUE_KEYS = [
  "cleanedFactsHash",
  "idempotencyHash",
  "jobId",
  "noteType",
  "payloadExpiresAt",
  "payloadHandleHash",
  "payloadId",
  "privacyReviewId",
  "requestHash",
  "sourceLocale",
] as const;
const COMMUNICATION_POINTS_ADMISSION_KEYS = [
  "cleanedFactsHash",
  "idempotencyHash",
  "jobId",
  "payloadExpiresAt",
  "payloadHandleHash",
  "payloadId",
  "privacyReviewId",
  "requestHash",
  "sourceLocale",
] as const;
const JOB_ID_KEYS = ["jobId"] as const;
const ENQUEUE_ENVELOPE_KEYS = ["created", "job", "payloadAccepted"] as const;
const COMMUNICATION_POINTS_ADMISSION_ENVELOPE_KEYS = [
  "created",
  "job",
  "payloadAccepted",
  "pointsReserved",
] as const;
const JOB_ENVELOPE_KEYS = ["job"] as const;
const OWNER_JOB_KEYS = [
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
] as const;
const RESULT_KEYS = [
  "baseRevisionId",
  "canonicalId",
  "contentHash",
  "revisionId",
  "revisionNumber",
  "saveState",
] as const;

/**
 * Adapts one already-created, session-authenticated query capability to the
 * owner repository. The principal is copied once at construction and is never
 * accepted by a repository method or returned in a DTO.
 */
export function createTestOnlyCaresLinkV1NoteGenerationOwnerRepository(
  options: Readonly<{
    capability: "TEST_ONLY";
    query: CaresLinkV1NoteGenerationOwnerRepositoryQuery;
    principal: CaresLinkV1AuthenticatedPrincipal;
  }>,
): CaresLinkV1NoteGenerationOwnerRepository {
  let factory: Record<(typeof FACTORY_KEYS)[number], unknown>;
  let principal: Record<(typeof PRINCIPAL_KEYS)[number], unknown>;
  try {
    factory = exactDataRecord(options, FACTORY_KEYS);
    principal = exactDataRecord(factory.principal, PRINCIPAL_KEYS);
  } catch {
    throw unavailable();
  }
  if (factory.capability !== "TEST_ONLY" || typeof factory.query !== "function") {
    throw unavailable();
  }

  const safePrincipal = Object.freeze({
    userId: parseInputUuid(principal.userId),
    sessionId: parseInputUuid(principal.sessionId),
    transport: parseTransport(principal.transport),
  });
  const query = factory.query as CaresLinkV1NoteGenerationOwnerRepositoryQuery;

  return Object.freeze({
    async enqueue(input) {
      const prepared = prepareAdmission(input);
      const data = await callQuery(
        query,
        RPC_CALLS.enqueue.sql,
        Object.freeze([
          safePrincipal.userId,
          safePrincipal.sessionId,
          safePrincipal.transport,
          prepared.jobId,
          prepared.payloadId,
          prepared.privacyReviewId,
          prepared.noteType,
          prepared.sourceLocale,
          CARESLINK_V1_CONTRACT_VERSION,
          CARESLINK_V1_NOTE_SCHEMA_VERSION,
          prepared.cleanedFactsHash,
          prepared.idempotencyHash,
          prepared.requestHash,
          prepared.payloadHandleHash,
          prepared.payloadExpiresAt,
        ]),
      );
      return parseEnqueueEnvelope(data, prepared);
    },

    async get(input) {
      const jobId = prepareJobId(input);
      const data = await callQuery(
        query,
        RPC_CALLS.get.sql,
        ownerJobValues(safePrincipal, jobId),
      );
      return parseJobEnvelope(data, jobId, false);
    },

    async cancel(input) {
      const jobId = prepareJobId(input);
      const data = await callQuery(
        query,
        RPC_CALLS.cancel.sql,
        ownerJobValues(safePrincipal, jobId),
      );
      return parseJobEnvelope(data, jobId, true);
    },
  });
}

export function createTestOnlyCaresLinkV1CommunicationNotePointsAdmissionRepository(
  options: Readonly<{
    capability: "TEST_ONLY";
    query: CaresLinkV1NoteGenerationOwnerRepositoryQuery;
    principal: CaresLinkV1AuthenticatedPrincipal;
  }>,
): CaresLinkV1CommunicationNotePointsAdmissionRepository {
  let factory: Record<(typeof FACTORY_KEYS)[number], unknown>;
  let principal: Record<(typeof PRINCIPAL_KEYS)[number], unknown>;
  try {
    factory = exactDataRecord(options, FACTORY_KEYS);
    principal = exactDataRecord(factory.principal, PRINCIPAL_KEYS);
  } catch {
    throw unavailable();
  }
  if (factory.capability !== "TEST_ONLY" || typeof factory.query !== "function") {
    throw unavailable();
  }

  const safePrincipal = Object.freeze({
    userId: parseInputUuid(principal.userId),
    sessionId: parseInputUuid(principal.sessionId),
    transport: parseTransport(principal.transport),
  });
  const query = factory.query as CaresLinkV1NoteGenerationOwnerRepositoryQuery;

  return Object.freeze({
    async enqueue(input) {
      const prepared = prepareCommunicationPointsAdmission(input);
      const data = await callQuery(
        query,
        COMMUNICATION_POINTS_ADMISSION_RPC_CALL.sql,
        Object.freeze([
          safePrincipal.userId,
          safePrincipal.sessionId,
          safePrincipal.transport,
          prepared.jobId,
          prepared.payloadId,
          prepared.privacyReviewId,
          prepared.sourceLocale,
          CARESLINK_V1_CONTRACT_VERSION,
          CARESLINK_V1_NOTE_SCHEMA_VERSION,
          prepared.cleanedFactsHash,
          prepared.idempotencyHash,
          prepared.requestHash,
          prepared.payloadHandleHash,
          prepared.payloadExpiresAt,
        ]),
        COMMUNICATION_POINTS_SAFE_DATABASE_MESSAGES,
      );
      return parseCommunicationPointsAdmissionEnvelope(data, prepared);
    },
  });
}

function ownerJobValues(
  principal: Readonly<CaresLinkV1AuthenticatedPrincipal>,
  jobId: string,
) {
  return Object.freeze([
    principal.userId,
    principal.sessionId,
    jobId,
    CARESLINK_V1_CONTRACT_VERSION,
    CARESLINK_V1_NOTE_SCHEMA_VERSION,
  ]);
}

function prepareAdmission(
  value: unknown,
): CaresLinkV1NoteGenerationOwnerAdmissionInput {
  try {
    const input = exactDataRecord(value, ENQUEUE_KEYS);
    return Object.freeze({
      jobId: expectInputUuid(input.jobId),
      payloadId: expectInputUuid(input.payloadId),
      noteType: expectInputEnum(
        input.noteType,
        CARESLINK_V1_NOTE_TYPE_CODES,
      ),
      sourceLocale: expectInputEnum(input.sourceLocale, CARESLINK_V1_LOCALES),
      privacyReviewId: expectInputUuid(input.privacyReviewId),
      cleanedFactsHash: expectInputSha256(input.cleanedFactsHash),
      idempotencyHash: expectInputSha256(input.idempotencyHash),
      requestHash: expectInputSha256(input.requestHash),
      payloadHandleHash: expectInputSha256(input.payloadHandleHash),
      payloadExpiresAt: expectInputServerTime(input.payloadExpiresAt),
    });
  } catch {
    throw validationError();
  }
}

function prepareCommunicationPointsAdmission(
  value: unknown,
): CaresLinkV1CommunicationNotePointsAdmissionInput {
  try {
    const input = exactDataRecord(value, COMMUNICATION_POINTS_ADMISSION_KEYS);
    return Object.freeze({
      jobId: expectInputUuid(input.jobId),
      payloadId: expectInputUuid(input.payloadId),
      sourceLocale: expectInputEnum(input.sourceLocale, CARESLINK_V1_LOCALES),
      privacyReviewId: expectInputUuid(input.privacyReviewId),
      cleanedFactsHash: expectInputSha256(input.cleanedFactsHash),
      idempotencyHash: expectInputSha256(input.idempotencyHash),
      requestHash: expectInputSha256(input.requestHash),
      payloadHandleHash: expectInputSha256(input.payloadHandleHash),
      payloadExpiresAt: expectInputServerTime(input.payloadExpiresAt),
    });
  } catch {
    throw validationError();
  }
}

function prepareJobId(value: unknown) {
  try {
    return expectInputUuid(exactDataRecord(value, JOB_ID_KEYS).jobId);
  } catch {
    throw validationError();
  }
}

async function callQuery(
  query: CaresLinkV1NoteGenerationOwnerRepositoryQuery,
  sql: string,
  values: readonly unknown[],
  safeDatabaseMessages: ReadonlySet<string> = SAFE_DATABASE_MESSAGES,
) {
  let result: unknown;
  try {
    result = await query(sql, values);
  } catch (error) {
    let normalized: CaresLinkV1ContractError;
    try {
      normalized = normalizeDatabaseError(error, safeDatabaseMessages);
    } catch {
      normalized = unavailable();
    }
    throw normalized;
  }

  try {
    return parseQueryData(result);
  } catch {
    throw unavailable();
  }
}

function parseQueryData(value: unknown) {
  const rows = ownDataProperty(value, "rows");
  if (!Array.isArray(rows) || ownDataProperty(rows, "length") !== 1) {
    throw unavailable();
  }
  const row = ownDataProperty(rows, "0");
  const record = exactDataRecord(row, ["data"] as const);
  if (record.data === null || record.data === undefined) throw unavailable();
  return record.data;
}

function parseEnqueueEnvelope(
  value: unknown,
  input: CaresLinkV1NoteGenerationOwnerAdmissionInput,
): CaresLinkV1NoteGenerationOwnerAdmissionResult {
  try {
    const envelope = exactDataRecord(value, ENQUEUE_ENVELOPE_KEYS);
    const created = expectBoolean(envelope.created);
    const payloadAccepted = expectBoolean(envelope.payloadAccepted);
    const job = parseOwnerJob(envelope.job);
    if (
      job.noteType !== input.noteType ||
      (created &&
        (job.jobId !== input.jobId ||
          job.status !== "QUEUED" ||
          job.attemptCount !== 0 ||
          job.startedAt !== undefined ||
          job.updatedAt !== job.createdAt ||
          !payloadAccepted)) ||
      (payloadAccepted && job.jobId !== input.jobId)
    ) {
      throw unavailable();
    }
    return Object.freeze({ created, payloadAccepted, job });
  } catch {
    throw unavailable();
  }
}

function parseCommunicationPointsAdmissionEnvelope(
  value: unknown,
  input: CaresLinkV1CommunicationNotePointsAdmissionInput,
): CaresLinkV1CommunicationNotePointsAdmissionResult {
  try {
    const envelope = exactDataRecord(
      value,
      COMMUNICATION_POINTS_ADMISSION_ENVELOPE_KEYS,
    );
    const created = expectBoolean(envelope.created);
    const payloadAccepted = expectBoolean(envelope.payloadAccepted);
    const pointsReserved = expectBoolean(envelope.pointsReserved);
    const job = parseOwnerJob(envelope.job);
    if (
      !pointsReserved ||
      job.noteType !== "communication" ||
      job.status !== "QUEUED" ||
      job.attemptCount !== 0 ||
      job.startedAt !== undefined ||
      job.updatedAt !== job.createdAt ||
      (created && (job.jobId !== input.jobId || !payloadAccepted)) ||
      (payloadAccepted && job.jobId !== input.jobId)
    ) {
      throw unavailable();
    }
    return Object.freeze({ created, payloadAccepted, pointsReserved: true, job });
  } catch {
    throw unavailable();
  }
}

function parseJobEnvelope(
  value: unknown,
  expectedJobId: string,
  requireCancelled: boolean,
) {
  try {
    const envelope = exactDataRecord(value, JOB_ENVELOPE_KEYS);
    const job = parseOwnerJob(envelope.job);
    if (
      job.jobId !== expectedJobId ||
      (requireCancelled && job.status !== "CANCELLED")
    ) {
      throw unavailable();
    }
    return job;
  } catch {
    throw unavailable();
  }
}

function parseOwnerJob(value: unknown): CaresLinkV1NoteGenerationDurableOwnerView {
  const record = exactDataRecord(value, OWNER_JOB_KEYS);
  const status = expectEnum(record.status, CARESLINK_V1_GENERATION_STATUSES);
  const noteType = expectEnum(record.noteType, CARESLINK_V1_NOTE_TYPE_CODES);
  const serviceCode = getCaresLinkV1NoteType(noteType).generationServiceCode;
  if (record.serviceCode !== serviceCode) throw unavailable();

  const jobId = expectUuid(record.jobId);
  const attemptCount = expectNonnegativeSafeInteger(record.attemptCount);
  const createdAt = expectServerTime(record.createdAt);
  const updatedAt = expectServerTime(record.updatedAt);
  const startedAt = nullableServerTime(record.startedAt);
  const finishedAt = nullableServerTime(record.finishedAt);
  const failureCode = nullableFailureCode(record.failureCode);
  const result =
    record.result === null ? null : parseGenerationResult(record.result);

  assertJobState({
    status,
    attemptCount,
    createdAt,
    updatedAt,
    startedAt,
    finishedAt,
    failureCode,
    result,
  });

  return Object.freeze({
    jobId,
    status,
    noteType,
    serviceCode,
    attemptCount,
    createdAt,
    updatedAt,
    ...(startedAt === null ? {} : { startedAt }),
    ...(finishedAt === null ? {} : { finishedAt }),
    ...(failureCode === null ? {} : { failureCode }),
    ...(result === null ? {} : { result }),
  });
}

function parseGenerationResult(value: unknown): CaresLinkV1NoteGenerationResult {
  const record = exactDataRecord(value, RESULT_KEYS);
  if (
    record.revisionNumber !== 1 ||
    record.baseRevisionId !== null ||
    record.saveState !== CARESLINK_V1_SERVER_SAVE_ACK
  ) {
    throw unavailable();
  }
  return Object.freeze({
    canonicalId: expectUuid(record.canonicalId),
    revisionId: expectUuid(record.revisionId),
    contentHash: expectSha256(record.contentHash),
    revisionNumber: 1,
    baseRevisionId: null,
    saveState: CARESLINK_V1_SERVER_SAVE_ACK,
  });
}

function assertJobState(input: Readonly<{
  status: CaresLinkV1GenerationStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureCode: CaresLinkV1NoteGenerationFailureCode | null;
  result: CaresLinkV1NoteGenerationResult | null;
}>) {
  const createdAt = Date.parse(input.createdAt);
  const updatedAt = Date.parse(input.updatedAt);
  const startedAt = input.startedAt === null ? null : Date.parse(input.startedAt);
  const finishedAt =
    input.finishedAt === null ? null : Date.parse(input.finishedAt);
  if (
    (input.attemptCount === 0) !== (input.startedAt === null) ||
    updatedAt < createdAt ||
    (startedAt !== null && (startedAt < createdAt || startedAt > updatedAt)) ||
    (finishedAt !== null &&
      (finishedAt < createdAt ||
        finishedAt > updatedAt ||
        (startedAt !== null && finishedAt < startedAt)))
  ) {
    throw unavailable();
  }

  const queued =
    input.status === "QUEUED" &&
    input.finishedAt === null &&
    input.failureCode === null &&
    input.result === null;
  const running =
    input.status === "RUNNING" &&
    input.attemptCount > 0 &&
    input.startedAt !== null &&
    input.finishedAt === null &&
    input.failureCode === null &&
    input.result === null;
  const succeeded =
    input.status === "SUCCEEDED" &&
    input.attemptCount > 0 &&
    input.startedAt !== null &&
    input.finishedAt !== null &&
    input.failureCode === null &&
    input.result !== null;
  const failed =
    input.status === "FAILED" &&
    input.attemptCount > 0 &&
    input.startedAt !== null &&
    input.finishedAt !== null &&
    input.failureCode !== null &&
    input.result === null;
  const cancelled =
    input.status === "CANCELLED" &&
    input.finishedAt !== null &&
    input.failureCode === null &&
    input.result === null;
  if (!queued && !running && !succeeded && !failed && !cancelled) {
    throw unavailable();
  }
}

function normalizeDatabaseError(
  value: unknown,
  safeDatabaseMessages: ReadonlySet<string>,
): CaresLinkV1ContractError {
  const code = ownStringProperty(value, "code");
  const message = ownStringProperty(value, "message");
  if (code === "42501") {
    return fixedContractError("FORBIDDEN");
  }
  if (code === "P0001" && message && safeDatabaseMessages.has(message)) {
    return fixedContractError(message);
  }
  return unavailable();
}

function fixedContractError(code: string) {
  const message = FIXED_ERROR_MESSAGES[code];
  if (!message) return unavailable();
  return new CaresLinkV1ContractError(
    code as
      | "AUTH_REQUIRED"
      | "SESSION_REVOKED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "MINIMUM_FACTS_REQUIRED"
      | "MIN_CLIENT_VERSION"
      | "PRIVACY_REVIEW_REQUIRED"
      | "PRIVACY_REVIEW_STALE"
      | "POINTS_INSUFFICIENT"
      | "POINT_QUOTE_EXPIRED"
      | "IDEMPOTENCY_CONFLICT"
      | "IDENTITY_LINK_CONFLICT"
      | "INVALID_STATE_TRANSITION"
      | "PRODUCT_API_DISABLED"
      | "VALIDATION_ERROR",
    message,
  );
}

function exactDataRecord<const Key extends string>(
  value: unknown,
  expectedKeys: readonly Key[],
): Record<Key, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw unavailable();
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw unavailable();
  }

  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function ownDataProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function ownStringProperty(value: unknown, key: string) {
  const property = ownDataProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function parseInputUuid(value: unknown) {
  if (typeof value !== "string" || !INPUT_UUID_PATTERN.test(value)) {
    throw unavailable();
  }
  return value.toLowerCase();
}

function parseTransport(value: unknown): CaresLinkV1AuthenticatedPrincipal["transport"] {
  if (value !== "BEARER" && value !== "COOKIE") throw unavailable();
  return value;
}

function expectInputUuid(value: unknown) {
  if (typeof value !== "string" || !INPUT_UUID_PATTERN.test(value)) {
    throw validationError();
  }
  return value.toLowerCase();
}

function expectUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function expectInputSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw validationError();
  }
  return value;
}

function expectSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function expectInputServerTime(value: unknown) {
  try {
    return expectServerTime(value);
  } catch {
    throw validationError();
  }
}

function expectServerTime(value: unknown) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== "string" ||
    !SERVER_TIME_PATTERN.test(value) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== value
  ) {
    throw unavailable();
  }
  return value;
}

function nullableServerTime(value: unknown) {
  return value === null ? null : expectServerTime(value);
}

function expectInputEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw validationError();
  }
  return value as Value;
}

function expectEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw unavailable();
  }
  return value as Value;
}

function expectBoolean(value: unknown) {
  if (typeof value !== "boolean") throw unavailable();
  return value;
}

function expectNonnegativeSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw unavailable();
  }
  return value as number;
}

function nullableFailureCode(value: unknown) {
  return value === null ? null : expectEnum(value, OWNER_FAILURE_CODES);
}

function validationError() {
  return new CaresLinkV1ContractError(
    "VALIDATION_ERROR",
    FIXED_ERROR_MESSAGES.VALIDATION_ERROR,
  );
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "The Note generation owner repository is unavailable",
  );
}
