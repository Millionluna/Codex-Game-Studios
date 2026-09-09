import {
  buildCommunicationNoteDocumentApiHref,
  type CommunicationNoteAvailableDocument,
  type CommunicationNoteDocumentContent,
  type CommunicationNoteDocumentResult,
} from "./communication-note-document-contract";
import {
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_SELF_REVIEW_STATUSES,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1Locale,
} from "./v1/shared-contracts";

export type CommunicationNoteDocumentFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "json" | "status">>;

export class CommunicationNoteDocumentClientResponseError extends Error {
  readonly code = "COMMUNICATION_NOTE_DOCUMENT_RESPONSE_INVALID";

  constructor() {
    super("Communication Note document response is invalid");
    this.name = "CommunicationNoteDocumentClientResponseError";
  }
}

export async function loadCommunicationNoteDocument(input: Readonly<{
  canonicalId: string;
  revisionId?: string;
  signal: AbortSignal;
  fetcher?: CommunicationNoteDocumentFetcher;
}>): Promise<CommunicationNoteDocumentResult> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(
    buildCommunicationNoteDocumentApiHref(input),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: input.signal,
    },
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponse();
  }

  try {
    const result = parseDocumentResponse(response.status, payload);
    if (result.status === "AVAILABLE" || result.status === "EMPTY") {
      const expectedCanonicalId = normalizeExpectedUuid(input.canonicalId);
      const expectedRevisionId = input.revisionId
        ? normalizeExpectedUuid(input.revisionId)
        : undefined;
      if (
        result.canonicalId !== expectedCanonicalId ||
        (result.status === "EMPTY" && expectedRevisionId !== undefined) ||
        (result.status === "AVAILABLE" &&
          expectedRevisionId !== undefined &&
          result.revision.revisionId !== expectedRevisionId) ||
        (result.status === "AVAILABLE" &&
          expectedRevisionId === undefined &&
          !result.isCurrentRevision)
      ) {
        throw invalidResponse();
      }
    }
    return result;
  } catch (error) {
    if (error instanceof CommunicationNoteDocumentClientResponseError) {
      throw error;
    }
    throw invalidResponse();
  }
}

function parseDocumentResponse(
  httpStatus: number,
  value: unknown,
): CommunicationNoteDocumentResult {
  const statusRecord = expectRecord(value);
  const status = statusRecord.status;

  if (status === "AUTH_REQUIRED") {
    expectHttpStatus(httpStatus, 401);
    exactKeys(statusRecord, ["status"]);
    return Object.freeze({ status });
  }
  if (status === "NOT_FOUND") {
    expectHttpStatus(httpStatus, 404);
    exactKeys(statusRecord, ["status"]);
    return Object.freeze({ status });
  }
  if (status === "UNAVAILABLE") {
    expectHttpStatus(httpStatus, 503);
    exactKeys(statusRecord, ["status"]);
    return Object.freeze({ status });
  }
  if (status === "EMPTY") {
    expectHttpStatus(httpStatus, 200);
    exactKeys(statusRecord, ["status", "canonicalId", "sourceLocale"]);
    return Object.freeze({
      status,
      canonicalId: expectUuid(statusRecord.canonicalId),
      sourceLocale: expectLocale(statusRecord.sourceLocale),
    });
  }
  if (status !== "AVAILABLE") throw invalidResponse();
  expectHttpStatus(httpStatus, 200);
  exactKeys(statusRecord, [
    "status",
    "canonicalId",
    "noteType",
    "sourceLocale",
    "currentRevisionId",
    "revision",
    "versions",
    "isCurrentRevision",
    "selfReviewStatus",
    "draftNotice",
    "saveState",
  ]);

  const canonicalId = expectUuid(statusRecord.canonicalId);
  const currentRevisionId = expectUuid(statusRecord.currentRevisionId);
  const revision = parseRevision(statusRecord.revision);
  const versions = expectArray(statusRecord.versions).map(parseVersion);
  if (versions.length === 0 || versions.length > 512) throw invalidResponse();
  if (
    new Set(versions.map(({ revisionId }) => revisionId)).size !== versions.length ||
    new Set(versions.map(({ revisionNumber }) => revisionNumber)).size !== versions.length ||
    versions.some(
      (version, index) =>
        index > 0 &&
        versions[index - 1].revisionNumber <= version.revisionNumber,
    )
  ) {
    throw invalidResponse();
  }
  const current = versions.find(
    (version) => version.revisionId === currentRevisionId,
  );
  const selected = versions.find(
    (version) => version.revisionId === revision.revisionId,
  );
  if (
    !current ||
    !selected ||
    current.revisionNumber !== versions[0].revisionNumber ||
    selected.revisionNumber !== revision.revisionNumber ||
    selected.createdAt !== revision.createdAt
  ) {
    throw invalidResponse();
  }

  const isCurrentRevision = expectBoolean(statusRecord.isCurrentRevision);
  if (isCurrentRevision !== (revision.revisionId === currentRevisionId)) {
    throw invalidResponse();
  }
  const selfReviewStatus = statusRecord.selfReviewStatus;
  if (
    (isCurrentRevision &&
      (typeof selfReviewStatus !== "string" ||
        !(CARESLINK_V1_SELF_REVIEW_STATUSES as readonly string[]).includes(
          selfReviewStatus,
        ))) ||
    (!isCurrentRevision && selfReviewStatus !== "UNKNOWN")
  ) {
    throw invalidResponse();
  }
  if (
    statusRecord.noteType !== "communication" ||
    statusRecord.draftNotice !== "Draft – review required" ||
    statusRecord.saveState !== "SERVER_ACKNOWLEDGED"
  ) {
    throw invalidResponse();
  }

  const base = {
    status: "AVAILABLE" as const,
    canonicalId,
    noteType: "communication" as const,
    sourceLocale: expectLocale(statusRecord.sourceLocale),
    currentRevisionId,
    revision,
    versions: Object.freeze(versions),
    draftNotice: "Draft – review required" as const,
    saveState: "SERVER_ACKNOWLEDGED" as const,
  };
  const result: CommunicationNoteAvailableDocument = isCurrentRevision
    ? {
        ...base,
        isCurrentRevision: true,
        selfReviewStatus: selfReviewStatus as "REQUIRED" | "CONFIRMED",
      }
    : { ...base, isCurrentRevision: false, selfReviewStatus: "UNKNOWN" };
  return deepFreeze(result);
}

function parseRevision(value: unknown) {
  const record = expectRecord(value);
  exactKeys(record, [
    "revisionId",
    "revisionNumber",
    "contentHash",
    "createdAt",
    "content",
  ]);
  const hash = expectString(record.contentHash);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw invalidResponse();
  return {
    revisionId: expectUuid(record.revisionId),
    revisionNumber: expectPositiveInteger(record.revisionNumber),
    contentHash: hash,
    createdAt: expectTimestamp(record.createdAt),
    content: parseContent(record.content),
  };
}

function parseVersion(value: unknown) {
  const record = expectRecord(value);
  exactKeys(record, ["revisionId", "revisionNumber", "createdAt"]);
  return {
    revisionId: expectUuid(record.revisionId),
    revisionNumber: expectPositiveInteger(record.revisionNumber),
    createdAt: expectTimestamp(record.createdAt),
  };
}

function parseContent(value: unknown): CommunicationNoteDocumentContent {
  const record = expectRecord(value);
  exactKeys(record, [
    "englishDraft",
    "reviewVersions",
    "factsSummary",
    "missingFacts",
    "neutralWordingChecks",
    "followUpPrompts",
    "disclaimer",
  ]);
  const reviewVersionsRecord = expectRecord(record.reviewVersions);
  if (
    Object.keys(reviewVersionsRecord).some(
      (key) => key !== "zh-Hans" && key !== "zh-Hant",
    )
  ) {
    throw invalidResponse();
  }
  const reviewVersions = Object.fromEntries(
    Object.entries(reviewVersionsRecord).map(([locale, draft]) => [
      locale,
      expectString(draft),
    ]),
  ) as CommunicationNoteDocumentContent["reviewVersions"];
  return {
    englishDraft: expectString(record.englishDraft),
    reviewVersions,
    factsSummary: validateCaresLinkV1CleanedFacts(
      "communication",
      record.factsSummary,
    ),
    missingFacts: parseStringArray(record.missingFacts),
    neutralWordingChecks: parseStringArray(record.neutralWordingChecks),
    followUpPrompts: parseStringArray(record.followUpPrompts),
    disclaimer: expectString(record.disclaimer),
  };
}

function parseStringArray(value: unknown) {
  const items = expectArray(value);
  if (items.length > 512) throw invalidResponse();
  return items.map(expectString);
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponse();
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(record).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    throw invalidResponse();
  }
}

function expectString(value: unknown) {
  if (typeof value !== "string") throw invalidResponse();
  return value;
}

function expectBoolean(value: unknown) {
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function expectPositiveInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw invalidResponse();
  return Number(value);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function expectUuid(value: unknown) {
  const uuid = expectString(value);
  if (!UUID_PATTERN.test(uuid)) throw invalidResponse();
  return uuid.toLowerCase();
}

function expectTimestamp(value: unknown) {
  const timestamp = expectString(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp))
  ) {
    throw invalidResponse();
  }
  return timestamp;
}

function normalizeExpectedUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw invalidResponse();
  return value.toLowerCase();
}

function expectLocale(value: unknown): CaresLinkV1Locale {
  if (
    typeof value !== "string" ||
    !(CARESLINK_V1_LOCALES as readonly string[]).includes(value)
  ) {
    throw invalidResponse();
  }
  return value as CaresLinkV1Locale;
}

function expectHttpStatus(actual: number, expected: number) {
  if (actual !== expected) throw invalidResponse();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function invalidResponse() {
  return new CommunicationNoteDocumentClientResponseError();
}
