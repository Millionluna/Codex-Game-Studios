import {
  COMMUNICATION_NOTE_GENERATION_FAILURE_CODES,
  type CommunicationNoteGenerationFailureCode,
  type CommunicationNoteGenerationJob,
  type CommunicationNoteGenerationResult,
} from "./communication-note-generation-contract";
import { CARESLINK_V1_GENERATION_STATUSES } from "./v1/shared-contracts";

const NOTE_TYPE = "communication" as const;
const SERVICE_CODE = "note.communication.generate" as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVER_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Fixed error for untrusted or contract-incompatible owner job data. */
export class CommunicationNoteGenerationJobParseError extends Error {
  readonly code = "COMMUNICATION_NOTE_GENERATION_JOB_INVALID" as const;

  constructor() {
    super("Communication Note generation job is invalid");
    this.name = "CommunicationNoteGenerationJobParseError";
  }
}

/** Strict, browser-safe parser shared by POST admission and GET recovery. */
export function parseCommunicationNoteGenerationJob(
  value: unknown,
): CommunicationNoteGenerationJob {
  try {
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

    const jobId = expectCanonicalUuid(job.jobId);
    if (job.noteType !== NOTE_TYPE || job.serviceCode !== SERVICE_CODE) {
      throw invalidJob();
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
      jobId,
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
  } catch (error) {
    if (error instanceof CommunicationNoteGenerationJobParseError) {
      throw error;
    }
    throw invalidJob();
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
  const canonicalId = expectCanonicalUuid(result.canonicalId);
  const revisionId = expectCanonicalUuid(result.revisionId);
  if (
    typeof result.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(result.contentHash) ||
    result.revisionNumber !== 1 ||
    result.baseRevisionId !== null ||
    result.saveState !== "SERVER_ACKNOWLEDGED"
  ) {
    throw invalidJob();
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
    throw invalidJob();
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
    throw invalidJob();
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
    throw invalidJob();
  }
  return value as CommunicationNoteGenerationFailureCode;
}

function dataRecordWithAllowedKeys(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
) {
  if (!isRecord(value)) throw invalidJob();
  const names = Object.getOwnPropertyNames(value);
  const allowed = new Set(allowedKeys);
  if (
    names.some((key) => !allowed.has(key)) ||
    requiredKeys.some((key) => !names.includes(key)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw invalidJob();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    names.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw invalidJob();
  }
  return value;
}

function exactDataRecord(value: unknown, exactKeys: readonly string[]) {
  if (!isRecord(value)) throw invalidJob();
  const names = Object.getOwnPropertyNames(value);
  if (
    names.length !== exactKeys.length ||
    exactKeys.some((key) => !names.includes(key)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw invalidJob();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    exactKeys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw invalidJob();
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
    throw invalidJob();
  }
  return value as Value;
}

function expectNonnegativeSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidJob();
  }
  return value as number;
}

function expectCanonicalUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw invalidJob();
  }
  return value.toLowerCase();
}

function expectServerTime(value: unknown) {
  if (
    typeof value !== "string" ||
    !SERVER_TIME_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw invalidJob();
  }
  return value;
}

function optionalServerTime(value: unknown) {
  return value === undefined ? undefined : expectServerTime(value);
}

function requireParsedValue<Value>(value: Value | undefined): Value {
  if (value === undefined) throw invalidJob();
  return value;
}

function invalidJob() {
  return new CommunicationNoteGenerationJobParseError();
}
