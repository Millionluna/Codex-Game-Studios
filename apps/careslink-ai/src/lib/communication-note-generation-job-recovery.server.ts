import "server-only";

import type { CommunicationNoteGenerationJobReadResult } from "./communication-note-generation-contract";
import { parseCommunicationNoteGenerationJob } from "./communication-note-generation-job";
import type {
  CommunicationNoteGenerationPrincipalResolution,
  CommunicationNoteGenerationPrincipalResolver,
  CommunicationNoteGenerationProviderPrincipal,
} from "./communication-note-generation-principal.server";
import { CaresLinkV1ContractError } from "./v1/shared-contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AVAILABLE = "AVAILABLE" as const;
const AUTH_REQUIRED = Object.freeze({ status: "AUTH_REQUIRED" } as const);
const FORBIDDEN = Object.freeze({ status: "FORBIDDEN" } as const);
const NOT_FOUND = Object.freeze({ status: "NOT_FOUND" } as const);
const UNAVAILABLE = Object.freeze({ status: "UNAVAILABLE" } as const);

export const COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_READER_READY =
  false as const;
export const COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_TEST_CAPABILITY =
  "TEST_ONLY_COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY" as const;

/**
 * Purpose-scoped read port. A runtime adapter may expose only this method; it
 * must not carry enqueue, cancellation, raw-query or credential capabilities.
 * The factory-bound principal is the only owner authority. Adapters must fold
 * both an unknown job and a job owned by anyone else into the same fixed-safe
 * CaresLinkV1ContractError("NOT_FOUND") response; other failures stay closed.
 */
export type CommunicationNoteGenerationJobRecoveryRepository = Readonly<{
  get(input: Readonly<{ jobId: string }>): PromiseLike<unknown>;
}>;

export type CommunicationNoteGenerationJobRecoveryRepositoryFactory = (
  input: Readonly<{
    principal: CommunicationNoteGenerationProviderPrincipal;
    signal: AbortSignal;
  }>,
) => CommunicationNoteGenerationJobRecoveryRepository | undefined;

export type CommunicationNoteGenerationJobRecoveryReader = (
  request: Request,
  jobId: string,
) => Promise<CommunicationNoteGenerationJobReadResult>;

/**
 * There is deliberately no formal database caller or credential. Environment
 * variables cannot turn this source-only read boundary on.
 */
export const COMMUNICATION_NOTE_GENERATION_FORMAL_JOB_RECOVERY_READER =
  undefined as CommunicationNoteGenerationJobRecoveryReader | undefined;

type TestOnlyReaderOptions = Readonly<{
  capability: typeof COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_TEST_CAPABILITY;
  resolvePrincipal: CommunicationNoteGenerationPrincipalResolver;
  createRepository: CommunicationNoteGenerationJobRecoveryRepositoryFactory;
}>;

/** Builds only an injected, source-test recovery reader. */
export function createTestOnlyCommunicationNoteGenerationJobRecoveryReader(
  value: TestOnlyReaderOptions,
): CommunicationNoteGenerationJobRecoveryReader {
  let options: Record<"capability" | "createRepository" | "resolvePrincipal", unknown>;
  try {
    options = exactDataRecord(value, [
      "capability",
      "createRepository",
      "resolvePrincipal",
    ]);
  } catch {
    throw unavailableError();
  }
  if (
    options.capability !==
      COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_TEST_CAPABILITY ||
    typeof options.resolvePrincipal !== "function" ||
    typeof options.createRepository !== "function"
  ) {
    throw unavailableError();
  }

  const resolvePrincipal =
    options.resolvePrincipal as CommunicationNoteGenerationPrincipalResolver;
  const createRepository =
    options.createRepository as CommunicationNoteGenerationJobRecoveryRepositoryFactory;

  return async (request, untrustedJobId) => {
    let resolution: CommunicationNoteGenerationPrincipalResolution;
    try {
      resolution = parsePrincipalResolution(await resolvePrincipal(request));
    } catch {
      return UNAVAILABLE;
    }

    if (!resolution.ok) {
      return principalFailure(resolution);
    }

    let url: URL;
    try {
      // Authentication deliberately precedes every interpretation of the URL
      // or identifier so signed-out callers cannot use response differences as
      // a job oracle.
      url = new URL(request.url);
    } catch {
      return UNAVAILABLE;
    }
    if (url.searchParams.size !== 0 || url.hash !== "") return NOT_FOUND;
    if (
      typeof untrustedJobId !== "string" ||
      !UUID_PATTERN.test(untrustedJobId)
    ) {
      return NOT_FOUND;
    }
    const jobId = untrustedJobId.toLowerCase();

    let signal: AbortSignal;
    try {
      signal = request.signal;
      if (!(signal instanceof AbortSignal) || signal.aborted) {
        return UNAVAILABLE;
      }
    } catch {
      return UNAVAILABLE;
    }

    let repository: CommunicationNoteGenerationJobRecoveryRepository;
    try {
      repository = parseRepository(
        createRepository(
          Object.freeze({
            principal: resolution.principal,
            signal,
          }),
        ),
      );
    } catch {
      return UNAVAILABLE;
    }

    let rawJob: unknown;
    try {
      rawJob = await repository.get(Object.freeze({ jobId }));
    } catch (error) {
      return repositoryFailure(error);
    }

    try {
      // A Communication-only route must hide an otherwise valid owner job for
      // another Note type instead of turning it into a 503 contract oracle.
      const noteType = ownEnumerableDataProperty(rawJob, "noteType");
      if (typeof noteType === "string" && noteType !== "communication") {
        return NOT_FOUND;
      }

      const job = parseCommunicationNoteGenerationJob(rawJob);
      if (job.jobId !== jobId) return UNAVAILABLE;
      return Object.freeze({ status: AVAILABLE, job });
    } catch {
      return UNAVAILABLE;
    }
  };
}

/**
 * The production route calls this handler. Because the formal reader is
 * absent, it returns a fixed 503 without inspecting request, auth or job data.
 */
export async function handleCommunicationNoteGenerationJobRecoveryRequest(
  request: Request,
  jobId: string,
) {
  return handleWithReader(
    request,
    jobId,
    COMMUNICATION_NOTE_GENERATION_FORMAL_JOB_RECOVERY_READER,
  );
}

/** Source-test seam; it cannot install or replace the formal reader. */
export function createTestOnlyCommunicationNoteGenerationJobRecoveryHandler(
  options: TestOnlyReaderOptions,
) {
  const reader = createTestOnlyCommunicationNoteGenerationJobRecoveryReader(
    options,
  );
  return (request: Request, jobId: string) =>
    handleWithReader(request, jobId, reader);
}

async function handleWithReader(
  request: Request,
  jobId: string,
  reader: CommunicationNoteGenerationJobRecoveryReader | undefined,
) {
  if (!reader) return resultResponse(UNAVAILABLE);

  let result: CommunicationNoteGenerationJobReadResult;
  try {
    result = await reader(request, jobId);
  } catch {
    result = UNAVAILABLE;
  }
  return resultResponse(result);
}

function principalFailure(
  resolution: Exclude<
    CommunicationNoteGenerationPrincipalResolution,
    { ok: true }
  >,
): CommunicationNoteGenerationJobReadResult {
  switch (resolution.reason) {
    case "auth_required":
    case "session_revoked":
      return AUTH_REQUIRED;
    case "forbidden_transport":
      return FORBIDDEN;
    case "unavailable":
    default:
      return UNAVAILABLE;
  }
}

function parsePrincipalResolution(
  value: unknown,
): CommunicationNoteGenerationPrincipalResolution {
  const ok = ownEnumerableDataProperty(value, "ok");

  if (ok === true) {
    const success = exactDataRecord(value, ["ok", "principal"]);
    return Object.freeze({
      ok: true,
      principal: parsePrincipal(success.principal),
    });
  }

  if (ok === false) {
    const failure = exactDataRecord(value, ["ok", "reason", "status"]);
    if (
      (failure.reason === "auth_required" && failure.status === 401) ||
      (failure.reason === "session_revoked" && failure.status === 401) ||
      (failure.reason === "forbidden_transport" && failure.status === 403) ||
      (failure.reason === "unavailable" && failure.status === 503)
    ) {
      return Object.freeze({
        ok: false,
        reason: failure.reason,
        status: failure.status,
      });
    }
  }
  throw unavailableError();
}

function parsePrincipal(
  value: unknown,
): CommunicationNoteGenerationProviderPrincipal {
  const principal = exactDataRecord(value, [
    "sessionId",
    "transport",
    "userId",
  ]);
  if (
    typeof principal.userId !== "string" ||
    !UUID_PATTERN.test(principal.userId) ||
    typeof principal.sessionId !== "string" ||
    !UUID_PATTERN.test(principal.sessionId) ||
    principal.transport !== "COOKIE"
  ) {
    throw unavailableError();
  }
  return Object.freeze({
    userId: principal.userId.toLowerCase(),
    sessionId: principal.sessionId.toLowerCase(),
    transport: "COOKIE",
  });
}

function parseRepository(
  value: unknown,
): CommunicationNoteGenerationJobRecoveryRepository {
  const repository = exactDataRecord(value, ["get"]);
  if (typeof repository.get !== "function") throw unavailableError();
  const get = repository.get as CommunicationNoteGenerationJobRecoveryRepository["get"];
  return Object.freeze({ get });
}

function repositoryFailure(
  error: unknown,
): CommunicationNoteGenerationJobReadResult {
  if (error instanceof CaresLinkV1ContractError) {
    if (error.code === "NOT_FOUND") return NOT_FOUND;
    if (error.code === "AUTH_REQUIRED" || error.code === "SESSION_REVOKED") {
      return AUTH_REQUIRED;
    }
  }
  return UNAVAILABLE;
}

function resultResponse(result: CommunicationNoteGenerationJobReadResult) {
  const status = {
    AVAILABLE: 200,
    AUTH_REQUIRED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    UNAVAILABLE: 503,
  }[result.status];
  return Response.json(result, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      Vary: "Cookie, Authorization",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function exactDataRecord<const Key extends string>(
  value: unknown,
  exactKeys: readonly Key[],
): Record<Key, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw unavailableError();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw unavailableError();
  }
  const names = Object.getOwnPropertyNames(value);
  if (
    names.length !== exactKeys.length ||
    exactKeys.some((key) => !names.includes(key)) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailableError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    names.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw unavailableError();
  }
  return value as Record<Key, unknown>;
}

function ownEnumerableDataProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw unavailableError();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw unavailableError();
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
    throw unavailableError();
  }
  return descriptor.value;
}

function unavailableError() {
  return new Error("Communication Note generation job recovery is unavailable");
}
