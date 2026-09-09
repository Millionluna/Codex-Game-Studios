import {
  COMMUNICATION_NOTE_GENERATION_API_PATH,
  getCommunicationNoteGenerationErrorMessage,
  type CommunicationNoteGenerationAdmission,
  type CommunicationNoteGenerationErrorResponse,
  type CommunicationNoteGenerationFreshJob,
} from "./communication-note-generation-contract";
import { parseCommunicationNoteGenerationJob } from "./communication-note-generation-job";
import {
  CARESLINK_V1_ERROR_CODES,
  assertCaresLinkV1IdempotencyKey,
  type CaresLinkV1ErrorCode,
} from "./v1/shared-contracts";
import { CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE } from "./v1/transport-contract";

const NOTE_TYPE = "communication" as const;
const SERVICE_CODE = "note.communication.generate" as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const job = parseCommunicationNoteGenerationJob(envelope.job);

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

function invalidResponse() {
  return new CommunicationNoteGenerationClientResponseError();
}
