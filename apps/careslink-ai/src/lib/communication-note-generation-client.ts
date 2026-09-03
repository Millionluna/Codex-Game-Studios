import {
  COMMUNICATION_NOTE_GENERATION_API_PATH,
  COMMUNICATION_NOTE_GENERATION_FAILURE_CODES,
  getCommunicationNoteGenerationErrorMessage,
  type CommunicationNoteGenerationAdmission,
  type CommunicationNoteGenerationErrorResponse,
  type CommunicationNoteGenerationFailureCode,
  type CommunicationNoteGenerationFreshJob,
  type CommunicationNoteGenerationJob,
  type CommunicationNoteGenerationResult,
} from "./communication-note-generation-contract";
import {
  CARESLINK_V1_ERROR_CODES,
  CARESLINK_V1_GENERATION_STATUSES,
  assertCaresLinkV1IdempotencyKey,
  type CaresLinkV1ErrorCode,
} from "./v1/shared-contracts";
import { CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE } from "./v1/transport-contract";

const NOTE_TYPE = "communication" as const;
const SERVICE_CODE = "note.communication.generate" as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVER_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type CommunicationNoteGenerationFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "json" | "status">>;

export type CommunicationNoteGenerationClientOptions = Readonly<{
  /** Exact reviewed request bytes. Retain these bytes with the key for replay. */
  body: string;
  /** Exact key paired with `body`; the client never generates or replaces it. */
  idempotencyKey: string;
  signal: AbortSignal;
  fetcher?: CommunicationNoteGenerationFetcher;
}>;

export type CommunicationNoteGenerationClientSuccess = Readonly<{
  ok: true;
  status: 200 | 202;
  admission: CommunicationNoteGenerationAdmission;
}>;

export type CommunicationNoteGenerationClientFailure = Readonly<{
  ok: false;
  status: (typeof CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE)[CaresLinkV1ErrorCode];
  error: CommunicationNoteGenerationErrorResponse["error"];
}>;

export type CommunicationNoteGenerationClientResult =
  | CommunicationNoteGenerationClientSuccess
  | CommunicationNoteGenerationClientFailure;

/** Fixed client-side failure for an untrusted or contract-incompatible response. */
export class CommunicationNoteGenerationClientResponseError extends Error {
  readonly code = "COMMUNICATION_NOTE_GENERATION_RESPONSE_INVALID" as const;

  constructor() {
    super("Communication Note generation response is invalid");
    this.name = "CommunicationNoteGenerationClientResponseError";
  }
}

/**
 * Sends caller-owned, pre-serialized bytes to the fixed same-origin endpoint.
 * Transport failures (including AbortError) are deliberately left intact;
 * response-body failures are replaced with the fixed client error above.
 */
export async function submitCommunicationNoteGeneration({
  body,
  idempotencyKey,
  signal,
  fetcher = fetch,
}: CommunicationNoteGenerationClientOptions): Promise<CommunicationNoteGenerationClientResult> {
  assertCaresLinkV1IdempotencyKey(idempotencyKey);

  const response = await fetcher(COMMUNICATION_NOTE_GENERATION_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body,
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponse();
  }

  try {
    if (response.status === 200 || response.status === 202) {
      const admission = parseAdmission(payload);
      if ((response.status === 202) !== admission.created) {
        throw invalidResponse();
      }
      return Object.freeze({
        ok: true,
        status: response.status,
        admission,
      });
    }

    const error = parseError(payload);
    const expectedStatus = CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE[error.code];
    if (response.status !== expectedStatus) throw invalidResponse();

    return Object.freeze({
      ok: false,
      status: expectedStatus,
      error,
    });
  } catch (error) {
    if (error instanceof CommunicationNoteGenerationClientResponseError) {
      throw error;
    }
    throw invalidResponse();
  }
}

function parseAdmission(value: unknown): CommunicationNoteGenerationAdmission {
  const envelope = exactDataRecord(value, ["created", "job"]);
  if (typeof envelope.created !== "boolean") throw invalidResponse();
  const job = parseOwnerJob(envelope.job);

  if (envelope.created) {
    if (
      job.status !== "QUEUED" ||
      job.attemptCount !== 0 ||
      job.startedAt !== undefined ||
      job.createdAt !== job.updatedAt
    ) {
      throw invalidResponse();
    }
    const freshJob: CommunicationNoteGenerationFreshJob = Object.freeze({
      jobId: job.jobId,
      status: "QUEUED",
      noteType: NOTE_TYPE,
      serviceCode: SERVICE_CODE,
      attemptCount: 0,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
    return Object.freeze({ created: true, job: freshJob });
  }

  return Object.freeze({ created: false, job });
}

function parseOwnerJob(value: unknown): CommunicationNoteGenerationJob {
  const job = dataRecordWithAllowedKeys(
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
  const status = expectEnum(job.status, CARESLINK_V1_GENERATION_STATUSES);
  const attemptCount = expectNonnegativeSafeInteger(job.attemptCount);
  const createdAt = expectServerTime(job.createdAt);
  const updatedAt = expectServerTime(job.updatedAt);
  const startedAt = optionalServerTime(job.startedAt);
  const finishedAt = optionalServerTime(job.finishedAt);
  const failureCode = optionalFailureCode(job.failureCode);
  const result =
    job.result === undefined ? undefined : parseGenerationResult(job.result);

  if (
    typeof job.jobId !== "string" ||
    !UUID_PATTERN.test(job.jobId) ||
    job.noteType !== NOTE_TYPE ||
    job.serviceCode !== SERVICE_CODE
  ) {
    throw invalidResponse();
  }

  assertOwnerJobState({
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
    jobId: job.jobId,
    noteType: NOTE_TYPE,
    serviceCode: SERVICE_CODE,
    attemptCount,
    createdAt,
    updatedAt,
  } as const;

  switch (status) {
    case "QUEUED":
      return Object.freeze({
        ...base,
        status,
        ...(startedAt === undefined ? {} : { startedAt }),
      });
    case "RUNNING":
      return Object.freeze({
        ...base,
        status,
        startedAt: requireParsedValue(startedAt),
      });
    case "SUCCEEDED":
      return Object.freeze({
        ...base,
        status,
        startedAt: requireParsedValue(startedAt),
        finishedAt: requireParsedValue(finishedAt),
        result: requireParsedValue(result),
      });
    case "FAILED":
      return Object.freeze({
        ...base,
        status,
        startedAt: requireParsedValue(startedAt),
        finishedAt: requireParsedValue(finishedAt),
        failureCode: requireParsedValue(failureCode),
      });
    case "CANCELLED":
      return Object.freeze({
        ...base,
        status,
        ...(startedAt === undefined ? {} : { startedAt }),
        finishedAt: requireParsedValue(finishedAt),
      });
  }
}

function parseGenerationResult(
  value: unknown,
): CommunicationNoteGenerationResult {
  const result = exactDataRecord(value, [
    "baseRevisionId",
    "canonicalId",
    "contentHash",
    "revisionId",
    "revisionNumber",
    "saveState",
  ]);
  if (
    typeof result.canonicalId !== "string" ||
    !UUID_PATTERN.test(result.canonicalId) ||
    typeof result.revisionId !== "string" ||
    !UUID_PATTERN.test(result.revisionId) ||
    typeof result.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(result.contentHash) ||
    result.revisionNumber !== 1 ||
    result.baseRevisionId !== null ||
    result.saveState !== "SERVER_ACKNOWLEDGED"
  ) {
    throw invalidResponse();
  }
  return Object.freeze({
    canonicalId: result.canonicalId,
    revisionId: result.revisionId,
    contentHash: result.contentHash,
    revisionNumber: 1,
    baseRevisionId: null,
    saveState: "SERVER_ACKNOWLEDGED",
  });
}

function assertOwnerJobState(input: Readonly<{
  status: (typeof CARESLINK_V1_GENERATION_STATUSES)[number];
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  failureCode?: CommunicationNoteGenerationFailureCode;
  result?: CommunicationNoteGenerationResult;
}>) {
  const createdAt = Date.parse(input.createdAt);
  const updatedAt = Date.parse(input.updatedAt);
  const startedAt = input.startedAt ? Date.parse(input.startedAt) : undefined;
  const finishedAt = input.finishedAt ? Date.parse(input.finishedAt) : undefined;
  if (
    (input.attemptCount === 0) !== (startedAt === undefined) ||
    updatedAt < createdAt ||
    (startedAt !== undefined &&
      (startedAt < createdAt || startedAt > updatedAt)) ||
    (finishedAt !== undefined &&
      (finishedAt < createdAt ||
        finishedAt > updatedAt ||
        (startedAt !== undefined && finishedAt < startedAt)))
  ) {
    throw invalidResponse();
  }

  const queued =
    input.status === "QUEUED" &&
    finishedAt === undefined &&
    input.failureCode === undefined &&
    input.result === undefined;
  const running =
    input.status === "RUNNING" &&
    input.attemptCount > 0 &&
    startedAt !== undefined &&
    finishedAt === undefined &&
    input.failureCode === undefined &&
    input.result === undefined;
  const succeeded =
    input.status === "SUCCEEDED" &&
    input.attemptCount > 0 &&
    startedAt !== undefined &&
    finishedAt !== undefined &&
    input.failureCode === undefined &&
    input.result !== undefined;
  const failed =
    input.status === "FAILED" &&
    input.attemptCount > 0 &&
    startedAt !== undefined &&
    finishedAt !== undefined &&
    input.failureCode !== undefined &&
    input.result === undefined;
  const cancelled =
    input.status === "CANCELLED" &&
    finishedAt !== undefined &&
    input.failureCode === undefined &&
    input.result === undefined;
  if (!queued && !running && !succeeded && !failed && !cancelled) {
    throw invalidResponse();
  }
}

const FAILURE_CODES = new Set<CommunicationNoteGenerationFailureCode>(
  COMMUNICATION_NOTE_GENERATION_FAILURE_CODES,
);

function optionalFailureCode(value: unknown) {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !FAILURE_CODES.has(value as CommunicationNoteGenerationFailureCode)
  ) {
    throw invalidResponse();
  }
  return value as CommunicationNoteGenerationFailureCode;
}

function parseError(
  value: unknown,
): CommunicationNoteGenerationErrorResponse["error"] {
  const envelope = exactDataRecord(value, ["error"]);
  const error = exactDataRecord(envelope.error, [
    "code",
    "correlationId",
    "message",
  ]);
  const code = expectEnum(error.code, CARESLINK_V1_ERROR_CODES);
  const fixedMessage = getCommunicationNoteGenerationErrorMessage(code);
  if (
    error.message !== fixedMessage ||
    typeof error.correlationId !== "string" ||
    !UUID_PATTERN.test(error.correlationId)
  ) {
    throw invalidResponse();
  }

  return Object.freeze({
    code,
    message: fixedMessage,
    correlationId: error.correlationId,
  });
}

function dataRecordWithAllowedKeys(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
) {
  if (!isRecord(value)) throw invalidResponse();
  const names = Object.getOwnPropertyNames(value);
  const allowed = new Set(allowedKeys);
  if (
    names.some((key) => !allowed.has(key)) ||
    requiredKeys.some((key) => !names.includes(key)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw invalidResponse();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    names.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw invalidResponse();
  }
  return value;
}

function exactDataRecord(value: unknown, exactKeys: readonly string[]) {
  if (!isRecord(value)) throw invalidResponse();
  const names = Object.getOwnPropertyNames(value);
  if (
    names.length !== exactKeys.length ||
    exactKeys.some((key) => !names.includes(key)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw invalidResponse();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    exactKeys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw invalidResponse();
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function expectEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
) {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw invalidResponse();
  }
  return value as Value;
}

function expectNonnegativeSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidResponse();
  }
  return value as number;
}

function expectServerTime(value: unknown) {
  if (
    typeof value !== "string" ||
    !SERVER_TIME_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw invalidResponse();
  }
  return value;
}

function optionalServerTime(value: unknown) {
  return value === undefined ? undefined : expectServerTime(value);
}

function requireParsedValue<Value>(value: Value | undefined): Value {
  if (value === undefined) throw invalidResponse();
  return value;
}

function invalidResponse() {
  return new CommunicationNoteGenerationClientResponseError();
}
