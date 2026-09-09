import "server-only";

import { randomUUID } from "node:crypto";

import {
  RequestBodyTooLargeError,
  readBoundedRequestText,
} from "./bounded-request-text.server";
import {
  reviewCommunicationNoteDraft,
  type CommunicationNoteComposerDraft,
} from "./communication-note-composer";
import {
  COMMUNICATION_NOTE_GENERATION_API_PATH,
  getCommunicationNoteGenerationErrorMessage,
  type CommunicationNoteGenerationAdmission,
  type CommunicationNoteGenerationFreshJob,
} from "./communication-note-generation-contract";
import { parseCommunicationNoteGenerationJob } from "./communication-note-generation-job";
import { isCommunicationNoteGenerationApiEnabled } from "./communication-note-generation-feature";
import { COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION } from "./communication-note-generation-principal-composition.server";
import {
  type CommunicationNoteGenerationPrincipalResolution,
  type CommunicationNoteGenerationPrincipalResolver,
  type CommunicationNoteGenerationProviderPrincipal,
} from "./communication-note-generation-principal.server";
import { COMMUNICATION_NOTE_GENERATION_FORMAL_SUBMITTER_COMPOSITION } from "./communication-note-generation-submitter-composition.server";
import { scanCaresLinkV1CleanedFacts } from "./v1/privacy-review-scanner.server";
import {
  CARESLINK_V1_ERROR_CODES,
  CARESLINK_V1_LOCALES,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1CleanedFactsFor,
  type CaresLinkV1ErrorCode,
  type CaresLinkV1Locale,
} from "./v1/shared-contracts";
import { CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE } from "./v1/transport-contract";

export { COMMUNICATION_NOTE_GENERATION_API_PATH };
export const COMMUNICATION_NOTE_GENERATION_API_MAX_REQUEST_BYTES =
  96 * 1024;

const NOTE_TYPE = "communication" as const;
const SERVICE_CODE = "note.communication.generate" as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CommunicationNoteGenerationCommand = Readonly<{
  principal: CommunicationNoteGenerationProviderPrincipal;
  noteType: typeof NOTE_TYPE;
  serviceCode: typeof SERVICE_CODE;
  sourceLocale: CaresLinkV1Locale;
  cleanedFacts: CaresLinkV1CleanedFactsFor<typeof NOTE_TYPE>;
  cleanedFactsHash: string;
  scannerPolicyVersion: string;
  privacyReview: Readonly<{
    reviewedNoIdentifiers: true;
    processingAuthorityConfirmed: true;
  }>;
  idempotencyKey: string;
  correlationId: string;
}>;

export type {
  CommunicationNoteGenerationAdmission,
  CommunicationNoteGenerationJob,
} from "./communication-note-generation-contract";

export type CommunicationNoteGenerationSubmitter = Readonly<{
  submit(
    command: CommunicationNoteGenerationCommand,
  ): Promise<CommunicationNoteGenerationAdmission>;
}>;

/**
 * Formal runtime submission remains absent until the durable admission chain is
 * approved. In particular, this is not a provider/model function.
 */
export const COMMUNICATION_NOTE_GENERATION_SUBMITTER = undefined as
  | CommunicationNoteGenerationSubmitter
  | undefined;

type CommunicationNoteGenerationRouteDependencies = Readonly<{
  isRuntimeEnabled(): boolean;
  getSubmitter(): CommunicationNoteGenerationSubmitter | undefined;
  getPrincipalResolver():
    | CommunicationNoteGenerationPrincipalResolver
    | undefined;
  createCorrelationId(): string;
}>;

export type TestOnlyCommunicationNoteGenerationRouteOptions = Readonly<{
  capability: "TEST_ONLY_M1X_COMMUNICATION_NOTE_GENERATION_ROUTE";
  runtimeEnabled: boolean;
  submitter?: CommunicationNoteGenerationSubmitter;
  resolvePrincipal?: CommunicationNoteGenerationPrincipalResolver;
  createCorrelationId?: () => string;
}>;

const DEFAULT_DEPENDENCIES: CommunicationNoteGenerationRouteDependencies = {
  isRuntimeEnabled: isCommunicationNoteGenerationApiEnabled,
  getSubmitter: () =>
    COMMUNICATION_NOTE_GENERATION_FORMAL_SUBMITTER_COMPOSITION,
  getPrincipalResolver: () =>
    COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION,
  createCorrelationId: randomUUID,
};

export async function handleCommunicationNoteGenerationRequest(
  request: Request,
) {
  return handleRequest(request, DEFAULT_DEPENDENCIES);
}

/** Source-test seam only. It cannot install or mutate the formal runtime port. */
export function createTestOnlyCommunicationNoteGenerationHandler(
  options: TestOnlyCommunicationNoteGenerationRouteOptions,
) {
  if (
    options.capability !==
      "TEST_ONLY_M1X_COMMUNICATION_NOTE_GENERATION_ROUTE" ||
    typeof options.runtimeEnabled !== "boolean" ||
    (options.resolvePrincipal !== undefined &&
      typeof options.resolvePrincipal !== "function") ||
    (options.submitter !== undefined &&
      typeof options.submitter.submit !== "function") ||
    (options.createCorrelationId !== undefined &&
      typeof options.createCorrelationId !== "function")
  ) {
    throw new Error("Communication Note generation test route is unavailable");
  }

  const dependencies: CommunicationNoteGenerationRouteDependencies = {
    isRuntimeEnabled: () => options.runtimeEnabled,
    getSubmitter: () => options.submitter,
    getPrincipalResolver: () => options.resolvePrincipal,
    createCorrelationId: options.createCorrelationId ?? randomUUID,
  };
  return (request: Request) => handleRequest(request, dependencies);
}

async function handleRequest(
  request: Request,
  dependencies: CommunicationNoteGenerationRouteDependencies,
) {
  const correlationId = safelyCreateCorrelationId(
    dependencies.createCorrelationId,
  );
  const headers = createResponseHeaders(correlationId);

  // This guard deliberately precedes request, auth and body access.
  if (!dependencies.isRuntimeEnabled()) {
    return disabledResponse(correlationId, headers);
  }

  let submitter: CommunicationNoteGenerationSubmitter | undefined;
  try {
    submitter = dependencies.getSubmitter();
  } catch {
    return disabledResponse(correlationId, headers);
  }
  if (!submitter) {
    return disabledResponse(correlationId, headers);
  }

  let resolvePrincipal: CommunicationNoteGenerationPrincipalResolver | undefined;
  try {
    resolvePrincipal = dependencies.getPrincipalResolver();
  } catch {
    return disabledResponse(correlationId, headers);
  }
  if (!resolvePrincipal) {
    return disabledResponse(correlationId, headers);
  }

  let principalResolution: CommunicationNoteGenerationPrincipalResolution;
  try {
    principalResolution = parsePrincipalResolution(
      await resolvePrincipal(request),
    );
  } catch {
    return disabledResponse(correlationId, headers);
  }
  if (!principalResolution.ok) {
    return principalFailureResponse(principalResolution, correlationId, headers);
  }

  const principal = principalResolution.principal;

  try {
    assertCookieMutationTransport(request);
    const idempotencyKey = getIdempotencyKey(request);
    const body = await readJsonObject(request);
    rejectClientIdentityOrCredential(body);
    const input = parseRequestBody(body);
    const localReview = reviewCommunicationNoteDraft(
      toComposerDraft(input.cleanedFacts),
      input.sourceLocale,
    );
    if (localReview.findings.length > 0) {
      throw new CaresLinkV1ContractError(
        "PRIVACY_REVIEW_REQUIRED",
        "Privacy review is required before generation",
      );
    }
    const privacyScan = scanCaresLinkV1CleanedFacts(input.cleanedFacts);
    if (privacyScan.findings.length > 0) {
      throw new CaresLinkV1ContractError(
        "PRIVACY_REVIEW_REQUIRED",
        "Privacy review is required before generation",
      );
    }

    const admission = parseAdmission(
      await submitter.submit({
        principal,
        noteType: NOTE_TYPE,
        serviceCode: SERVICE_CODE,
        sourceLocale: input.sourceLocale,
        cleanedFacts: cloneCleanedFacts(input.cleanedFacts),
        cleanedFactsHash: privacyScan.cleanedFactsHash,
        scannerPolicyVersion: privacyScan.scannerPolicyVersion,
        privacyReview: {
          reviewedNoIdentifiers: true,
          processingAuthorityConfirmed: true,
        },
        idempotencyKey,
        correlationId,
      }),
    );

    return jsonResponse(admission, admission.created ? 202 : 200, headers);
  } catch (error) {
    if (error instanceof CaresLinkV1ContractError) {
      const code = knownContractErrorCode(error.code);
      if (!code) return disabledResponse(correlationId, headers);
      return errorResponse(
        code,
        getCommunicationNoteGenerationErrorMessage(code),
        CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE[code],
        correlationId,
        headers,
      );
    }
    return disabledResponse(correlationId, headers);
  }
}

function principalFailureResponse(
  resolution: Exclude<
    CommunicationNoteGenerationPrincipalResolution,
    { ok: true }
  >,
  correlationId: string,
  headers: Headers,
) {
  switch (resolution.reason) {
    case "auth_required":
      return resolution.status === 401
        ? errorResponse(
            "AUTH_REQUIRED",
            getCommunicationNoteGenerationErrorMessage("AUTH_REQUIRED"),
            401,
            correlationId,
            headers,
          )
        : disabledResponse(correlationId, headers);
    case "session_revoked":
      return resolution.status === 401
        ? errorResponse(
            "SESSION_REVOKED",
            getCommunicationNoteGenerationErrorMessage("SESSION_REVOKED"),
            401,
            correlationId,
            headers,
          )
        : disabledResponse(correlationId, headers);
    case "forbidden_transport":
      return resolution.status === 403
        ? errorResponse(
            "FORBIDDEN",
            getCommunicationNoteGenerationErrorMessage("FORBIDDEN"),
            403,
            correlationId,
            headers,
          )
        : disabledResponse(correlationId, headers);
    case "unavailable":
      return disabledResponse(correlationId, headers);
    default:
      return disabledResponse(correlationId, headers);
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
      principal: parseProviderPrincipal(success.principal),
    });
  }

  if (ok === false) {
    const rejected = exactDataRecord(value, ["ok", "reason", "status"]);
    if (
      (rejected.reason === "auth_required" && rejected.status === 401) ||
      (rejected.reason === "session_revoked" && rejected.status === 401) ||
      (rejected.reason === "forbidden_transport" && rejected.status === 403) ||
      (rejected.reason === "unavailable" && rejected.status === 503)
    ) {
      return Object.freeze({
        ok: false,
        reason: rejected.reason,
        status: rejected.status,
      });
    }
  }

  throw new Error("Communication Note principal resolution is unavailable");
}

function parseProviderPrincipal(
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
    throw new Error("Communication Note generation principal is unavailable");
  }
  return Object.freeze({
    userId: principal.userId.toLowerCase(),
    sessionId: principal.sessionId.toLowerCase(),
    transport: "COOKIE",
  });
}

function parseRequestBody(body: Record<string, unknown>) {
  assertAllowedKeys(body, ["cleanedFacts", "privacyReview", "sourceLocale"]);
  if (
    typeof body.sourceLocale !== "string" ||
    !(CARESLINK_V1_LOCALES as readonly string[]).includes(body.sourceLocale)
  ) {
    throw validationError();
  }
  const privacyReview = exactDataRecord(body.privacyReview, [
    "processingAuthorityConfirmed",
    "reviewedNoIdentifiers",
  ]);
  if (
    privacyReview.reviewedNoIdentifiers !== true ||
    privacyReview.processingAuthorityConfirmed !== true
  ) {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_REQUIRED",
      "Privacy review is required before generation",
    );
  }
  return {
    sourceLocale: body.sourceLocale as CaresLinkV1Locale,
    cleanedFacts: validateCaresLinkV1CleanedFacts(
      NOTE_TYPE,
      body.cleanedFacts,
    ),
  };
}

function toComposerDraft(
  cleanedFacts: CaresLinkV1CleanedFactsFor<typeof NOTE_TYPE>,
): CommunicationNoteComposerDraft {
  return {
    occurred_at: cleanedFacts.occurred_at,
    contact_channel: cleanedFacts.contact_channel,
    parties_by_role: [...cleanedFacts.parties_by_role],
    observable_facts: cleanedFacts.observable_facts,
    action_taken: cleanedFacts.action_taken,
    stated_outcome: cleanedFacts.stated_outcome ?? "",
    follow_up: cleanedFacts.follow_up ?? "",
  };
}

function cloneCleanedFacts(
  cleanedFacts: CaresLinkV1CleanedFactsFor<typeof NOTE_TYPE>,
): CaresLinkV1CleanedFactsFor<typeof NOTE_TYPE> {
  return {
    occurred_at: cleanedFacts.occurred_at,
    contact_channel: cleanedFacts.contact_channel,
    parties_by_role: [...cleanedFacts.parties_by_role],
    observable_facts: cleanedFacts.observable_facts,
    action_taken: cleanedFacts.action_taken,
    ...(cleanedFacts.stated_outcome
      ? { stated_outcome: cleanedFacts.stated_outcome }
      : {}),
    ...(cleanedFacts.follow_up ? { follow_up: cleanedFacts.follow_up } : {}),
  };
}

function parseAdmission(value: unknown): CommunicationNoteGenerationAdmission {
  try {
    const envelope = exactDataRecord(value, ["created", "job"]);
    if (typeof envelope.created !== "boolean") throw new Error();
    const job = parseCommunicationNoteGenerationJob(envelope.job);
    if (envelope.created) {
      if (
        job.status !== "QUEUED" ||
        job.attemptCount !== 0 ||
        job.startedAt !== undefined ||
        job.createdAt !== job.updatedAt
      ) {
        throw new Error();
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
      return Object.freeze({
        created: true,
        job: freshJob,
      });
    }
    return Object.freeze({
      created: false,
      job,
    });
  } catch {
    throw new Error("Communication Note generation admission is unavailable");
  }
}

function assertCookieMutationTransport(request: Request) {
  if (request.headers.has("authorization")) {
    throw new CaresLinkV1ContractError(
      "FORBIDDEN",
      "Bearer credentials are not accepted by this Web route",
    );
  }
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw validationError();
  }
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (url.protocol !== "https:" || !origin || origin !== url.origin) {
    throw new CaresLinkV1ContractError(
      "FORBIDDEN",
      "The request origin is not permitted",
    );
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") {
    throw new CaresLinkV1ContractError(
      "FORBIDDEN",
      "The request origin is not permitted",
    );
  }
}

function getIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key");
  if (!value) throw validationError();
  return assertCaresLinkV1IdempotencyKey(value);
}

async function readJsonObject(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > COMMUNICATION_NOTE_GENERATION_API_MAX_REQUEST_BYTES
  ) {
    throw validationError();
  }
  let value: unknown;
  try {
    const text = await readBoundedRequestText(
      request,
      COMMUNICATION_NOTE_GENERATION_API_MAX_REQUEST_BYTES,
    );
    assertNoDuplicateJsonObjectKeys(text);
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw validationError();
    throw validationError();
  }
  if (!isRecord(value)) throw validationError();
  return value;
}

function assertNoDuplicateJsonObjectKeys(text: string) {
  let index = 0;

  function fail(): never {
    throw validationError();
  }

  function skipWhitespace() {
    while (/\s/.test(text[index] ?? "")) index += 1;
  }

  function readString() {
    const start = index;
    if (text[index] !== '"') fail();
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index)) as string;
        } catch {
          fail();
        }
      }
      if (character === "\\") {
        index += 2;
      } else {
        index += 1;
      }
    }
    fail();
  }

  function readValue(): void {
    skipWhitespace();
    if (text[index] === "{") {
      readObject();
      return;
    }
    if (text[index] === "[") {
      readArray();
      return;
    }
    if (text[index] === '"') {
      readString();
      return;
    }
    const start = index;
    while (
      index < text.length &&
      !/[\s,\]}]/.test(text[index] ?? "")
    ) {
      index += 1;
    }
    if (index === start) fail();
  }

  function readObject(): void {
    index += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    while (index < text.length) {
      skipWhitespace();
      const key = readString();
      if (keys.has(key)) fail();
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ":") fail();
      index += 1;
      readValue();
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      if (text[index] !== ",") fail();
      index += 1;
    }
    fail();
  }

  function readArray(): void {
    index += 1;
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    while (index < text.length) {
      readValue();
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      if (text[index] !== ",") fail();
      index += 1;
    }
    fail();
  }

  readValue();
  skipWhitespace();
  if (index !== text.length) fail();
}

const FORBIDDEN_BODY_KEYS = new Set([
  "authorization",
  "ownerid",
  "owneruserid",
  "provideruserid",
  "userid",
  "sessionid",
  "accesstoken",
]);

function rejectClientIdentityOrCredential(value: unknown) {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [key, child] of Object.entries(current)) {
      const normalized = key.toLowerCase();
      if (FORBIDDEN_BODY_KEYS.has(normalized) || normalized.endsWith("token")) {
        throw validationError();
      }
      pending.push(child);
    }
  }
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw validationError();
  }
}

function exactDataRecord(value: unknown, exactKeys: readonly string[]) {
  if (!isRecord(value)) throw validationError();
  const names = Object.getOwnPropertyNames(value);
  if (
    names.length !== exactKeys.length ||
    exactKeys.some((key) => !names.includes(key)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw validationError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    exactKeys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw validationError();
  }
  return value as Record<string, unknown>;
}

function ownEnumerableDataProperty(value: unknown, key: string) {
  if (!isRecord(value)) throw validationError();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
    throw validationError();
  }
  return descriptor.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safelyCreateCorrelationId(factory: () => string) {
  try {
    const value = factory();
    if (UUID_PATTERN.test(value)) return value.toLowerCase();
  } catch {
    // Fall back to fresh server entropy without exposing dependency failures.
  }
  return randomUUID();
}

function createResponseHeaders(correlationId: string) {
  return new Headers({
    "cache-control": "private, no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-correlation-id": correlationId,
  });
}

function disabledResponse(correlationId: string, headers: Headers) {
  return errorResponse(
    "PRODUCT_API_DISABLED",
    getCommunicationNoteGenerationErrorMessage("PRODUCT_API_DISABLED"),
    503,
    correlationId,
    headers,
  );
}

function knownContractErrorCode(value: unknown) {
  if (
    typeof value !== "string" ||
    !(CARESLINK_V1_ERROR_CODES as readonly string[]).includes(value)
  ) {
    return undefined;
  }
  return value as CaresLinkV1ErrorCode;
}

function validationError() {
  return new CaresLinkV1ContractError(
    "VALIDATION_ERROR",
    "The Communication Note generation request is invalid",
  );
}

function errorResponse(
  code: CaresLinkV1ErrorCode,
  message: string,
  status: number,
  correlationId: string,
  headers: Headers,
) {
  return jsonResponse(
    { error: { code, message, correlationId } },
    status,
    headers,
  );
}

function jsonResponse(body: unknown, status: number, headers: Headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
