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
  COMMUNICATION_NOTE_GENERATION_FAILURE_CODES,
  type CommunicationNoteGenerationAdmission,
  type CommunicationNoteGenerationFailureCode,
  type CommunicationNoteGenerationFreshJob,
  type CommunicationNoteGenerationJob,
  type CommunicationNoteGenerationResult,
} from "./communication-note-generation-contract";
import { isCommunicationNoteGenerationApiEnabled } from "./communication-note-generation-feature";
import { resolveWorkspaceAccountFromSupabaseSession } from "./referral-workspace-session";
import type { WorkspaceAccount } from "./referral-workspace-auth";
import { createCareslinkServerSupabaseClient } from "./supabase-server";
import { scanCaresLinkV1CleanedFacts } from "./v1/privacy-review-scanner.server";
import {
  CARESLINK_V1_GENERATION_STATUSES,
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
const SERVER_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type ProviderAccount = Pick<WorkspaceAccount, "id" | "role">;

export type CommunicationNoteGenerationCommand = Readonly<{
  providerUserId: string;
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
  resolveAccount(): Promise<ProviderAccount | undefined>;
  createCorrelationId(): string;
}>;

export type TestOnlyCommunicationNoteGenerationRouteOptions = Readonly<{
  capability: "TEST_ONLY_M1X_COMMUNICATION_NOTE_GENERATION_ROUTE";
  runtimeEnabled: boolean;
  submitter?: CommunicationNoteGenerationSubmitter;
  resolveAccount(): Promise<ProviderAccount | undefined>;
  createCorrelationId?: () => string;
}>;

const DEFAULT_DEPENDENCIES: CommunicationNoteGenerationRouteDependencies = {
  isRuntimeEnabled: isCommunicationNoteGenerationApiEnabled,
  getSubmitter: () => COMMUNICATION_NOTE_GENERATION_SUBMITTER,
  resolveAccount: resolveDefaultAccount,
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
    typeof options.resolveAccount !== "function" ||
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
    resolveAccount: options.resolveAccount,
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

  let account: ProviderAccount | undefined;
  try {
    account = await dependencies.resolveAccount();
  } catch {
    return disabledResponse(correlationId, headers);
  }
  if (!account) {
    return errorResponse(
      "AUTH_REQUIRED",
      "Authentication is required",
      401,
      correlationId,
      headers,
    );
  }
  if (account.role !== "provider") {
    return errorResponse(
      "FORBIDDEN",
      "A provider account is required",
      403,
      correlationId,
      headers,
    );
  }
  if (!UUID_PATTERN.test(account.id)) {
    return disabledResponse(correlationId, headers);
  }

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
        providerUserId: account.id,
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
        fixedContractMessage(code),
        CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE[code],
        correlationId,
        headers,
      );
    }
    return disabledResponse(correlationId, headers);
  }
}

async function resolveDefaultAccount() {
  const supabase = await createCareslinkServerSupabaseClient();
  return resolveWorkspaceAccountFromSupabaseSession(supabase);
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
    const job = parseOwnerJob(envelope.job);
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
    throw new Error("Communication Note generation admission is unavailable");
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
    throw new Error("Communication Note generation admission is unavailable");
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
    throw new Error("Communication Note generation admission is unavailable");
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
    throw new Error("Communication Note generation admission is unavailable");
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
    throw new Error("Communication Note generation admission is unavailable");
  }
  return value as CommunicationNoteGenerationFailureCode;
}

function expectNonnegativeSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("Communication Note generation admission is unavailable");
  }
  return value as number;
}

function expectServerTime(value: unknown) {
  if (!isServerTime(value)) {
    throw new Error("Communication Note generation admission is unavailable");
  }
  return value;
}

function optionalServerTime(value: unknown) {
  return value === undefined ? undefined : expectServerTime(value);
}

function requireParsedValue<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error("Communication Note generation admission is unavailable");
  }
  return value;
}

function expectEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
) {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw new Error("Communication Note generation admission is unavailable");
  }
  return value as Value;
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

function dataRecordWithAllowedKeys(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
) {
  if (!isRecord(value)) {
    throw new Error("Communication Note generation admission is unavailable");
  }
  const names = Object.getOwnPropertyNames(value);
  const allowed = new Set(allowedKeys);
  if (
    names.some((key) => !allowed.has(key)) ||
    requiredKeys.some((key) => !names.includes(key)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    throw new Error("Communication Note generation admission is unavailable");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    names.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !("value" in descriptor) || !descriptor.enumerable;
    })
  ) {
    throw new Error("Communication Note generation admission is unavailable");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isServerTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SERVER_TIME_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
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
    "Communication Note generation is unavailable",
    503,
    correlationId,
    headers,
  );
}

function fixedContractMessage(code: CaresLinkV1ErrorCode) {
  switch (code) {
    case "PRODUCT_API_DISABLED":
      return "Communication Note generation is unavailable";
    case "AUTH_REQUIRED":
      return "Authentication is required";
    case "SESSION_REVOKED":
      return "The authenticated session is no longer active";
    case "FORBIDDEN":
      return "The request is not permitted";
    case "MINIMUM_FACTS_REQUIRED":
      return "Required cleaned facts are missing or empty";
    case "PRIVACY_REVIEW_REQUIRED":
      return "Privacy review is required before generation";
    case "PRIVACY_REVIEW_STALE":
      return "Privacy review must be repeated before generation";
    case "IDEMPOTENCY_CONFLICT":
    case "IDENTITY_LINK_CONFLICT":
      return "The idempotent generation request conflicts with existing work";
    case "POINTS_INSUFFICIENT":
      return "There are not enough Points for this generation request";
    case "POINT_QUOTE_EXPIRED":
      return "The Points quote has expired";
    case "RATE_LIMITED":
      return "Too many generation requests were submitted";
    case "GENERATION_FAILED":
      return "Communication Note generation failed";
    default:
      return code === "VALIDATION_ERROR"
        ? "The Communication Note generation request is invalid"
        : "The Communication Note generation request could not be completed";
  }
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
