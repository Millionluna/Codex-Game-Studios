import {
  buildCommunicationNoteGenerationJobApiHref,
  type CommunicationNoteGenerationJobReadResult,
} from "./communication-note-generation-contract";
import { parseCommunicationNoteGenerationJob } from "./communication-note-generation-job";

export type CommunicationNoteGenerationJobFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "json" | "status">>;

export type CommunicationNoteGenerationJobClientOptions = Readonly<{
  jobId: string;
  signal: AbortSignal;
  fetcher?: CommunicationNoteGenerationJobFetcher;
}>;

/** Fixed client-side failure for an untrusted recovery response. */
export class CommunicationNoteGenerationJobClientResponseError extends Error {
  readonly code =
    "COMMUNICATION_NOTE_GENERATION_JOB_RESPONSE_INVALID" as const;

  constructor() {
    super("Communication Note generation job response is invalid");
    this.name = "CommunicationNoteGenerationJobClientResponseError";
  }
}

/** Reads one owner-authorized job without replaying facts or an idempotency key. */
export async function loadCommunicationNoteGenerationJob({
  jobId,
  signal,
  fetcher = fetch,
}: CommunicationNoteGenerationJobClientOptions): Promise<CommunicationNoteGenerationJobReadResult> {
  const href = buildCommunicationNoteGenerationJobApiHref({ jobId });
  const canonicalJobId = href.slice(href.lastIndexOf("/") + 1);
  const response = await fetcher(href, {
    method: "GET",
    headers: { Accept: "application/json" },
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
    const envelope = recordWithExactStatusShape(payload);
    if (envelope.status === "AVAILABLE") {
      if (response.status !== 200) throw invalidResponse();
      const job = parseCommunicationNoteGenerationJob(envelope.job);
      if (job.jobId !== canonicalJobId) throw invalidResponse();
      return Object.freeze({ status: "AVAILABLE", job });
    }

    const expectedStatus = {
      AUTH_REQUIRED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      UNAVAILABLE: 503,
    }[envelope.status];
    if (response.status !== expectedStatus) throw invalidResponse();
    return Object.freeze({ status: envelope.status });
  } catch (error) {
    if (error instanceof CommunicationNoteGenerationJobClientResponseError) {
      throw error;
    }
    throw invalidResponse();
  }
}

function recordWithExactStatusShape(value: unknown):
  | Readonly<{ status: "AVAILABLE"; job: unknown }>
  | Exclude<
      CommunicationNoteGenerationJobReadResult,
      Readonly<{ status: "AVAILABLE"; job: unknown }>
    > {
  if (!isRecord(value)) throw invalidResponse();
  const status = dataProperty(value, "status");
  if (status === "AVAILABLE") {
    assertExactKeys(value, ["job", "status"]);
    return Object.freeze({ status, job: dataProperty(value, "job") });
  }
  if (
    status === "AUTH_REQUIRED" ||
    status === "FORBIDDEN" ||
    status === "NOT_FOUND" ||
    status === "UNAVAILABLE"
  ) {
    assertExactKeys(value, ["status"]);
    return Object.freeze({ status });
  }
  throw invalidResponse();
}

function assertExactKeys(value: Record<string, unknown>, expected: string[]) {
  const names = Object.getOwnPropertyNames(value).sort();
  const keys = [...expected].sort();
  if (
    names.length !== keys.length ||
    names.some((name, index) => name !== keys[index]) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw invalidResponse();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    names.some((name) => {
      const descriptor = descriptors[name];
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw invalidResponse();
  }
}

function dataProperty(value: Record<string, unknown>, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
    throw invalidResponse();
  }
  return descriptor.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidResponse() {
  return new CommunicationNoteGenerationJobClientResponseError();
}
