import "server-only";

import { randomUUID } from "node:crypto";

import {
  type CaresLinkV1ProductApiAuthResolution,
} from "./product-api-auth.server";
import {
  CaresLinkV1ProductApiError,
  isCaresLinkV1ProductApiContractError,
} from "./product-api-memory";
import { CARESLINK_V1_DEFAULT_PRODUCT_API_RUNTIME } from "./product-api-runtime.server";
import {
  CARESLINK_V1_PRIVACY_DECISIONS,
  CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH,
  CARESLINK_V1_PRIVACY_FINDING_DECISION_MAX_ITEMS,
  CARESLINK_V1_PRIVACY_FINDING_TYPES,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  getCaresLinkV1NoteType,
  validateCaresLinkV1CleanedFacts,
  validateCaresLinkV1CleanedFactsForAnyNoteType,
  type CaresLinkV1CleanedFacts,
  type CaresLinkV1ErrorCode,
  type CaresLinkV1NoteContent,
  type CaresLinkV1PrivacyFindingDecision,
} from "./shared-contracts";
import {
  findUnresolvedCaresLinkV1PrivacyFindings,
  normalizeCaresLinkV1PrivacyFindingDecisions,
  scanCaresLinkV1CleanedFacts,
} from "./privacy-review-scanner.server";
import {
  CARESLINK_V1_HEADER_NAMES,
  CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE,
  CARESLINK_V1_MINIMUM_CLIENT_VERSION,
  createCaresLinkV1TransportError,
  type CaresLinkV1AppendDocumentRevisionRequest,
  type CaresLinkV1AuthenticatedPrincipal,
  type CaresLinkV1ConfirmPrivacyReviewRequest,
  type CaresLinkV1CreateDocumentRequest,
  type CaresLinkV1ProductApi,
  type CaresLinkV1SaveCheckpointRequest,
  type CaresLinkV1TombstoneDocumentRequest,
} from "./transport-contract";

export type CaresLinkV1ProductApiRouteDependencies = {
  resolveAuth?: (
    request: Request,
  ) => Promise<CaresLinkV1ProductApiAuthResolution>;
  getProductApi?: (
    principal: CaresLinkV1AuthenticatedPrincipal,
    request: Request,
  ) =>
    | CaresLinkV1ProductApi
    | undefined
    | Promise<CaresLinkV1ProductApi | undefined>;
  createCorrelationId?: () => string;
};

const DEFAULT_DEPENDENCIES: Required<CaresLinkV1ProductApiRouteDependencies> = {
  resolveAuth: (request) =>
    CARESLINK_V1_DEFAULT_PRODUCT_API_RUNTIME.resolveAuth(request),
  getProductApi: (principal, request) =>
    CARESLINK_V1_DEFAULT_PRODUCT_API_RUNTIME.getProductApi(principal, request),
  createCorrelationId: randomUUID,
};

export async function handleCaresLinkV1GetMe(
  request: Request,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api }) => api.getMe());
}

export async function handleCaresLinkV1ConfirmPrivacyReview(
  request: Request,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api, principal }) => {
    assertMutationTransport(request, principal);
    const mutation = getMutationHeaders(request);
    const body = await readJsonObject(request);
    rejectClientOwner(body);
    const parsed = parseConfirmPrivacyReviewRequest(body);
    const scan = scanCaresLinkV1CleanedFacts(parsed.request.cleanedFacts);
    const findingDecisions = normalizeCaresLinkV1PrivacyFindingDecisions(
      parsed.request.findingDecisions,
    );
    const unresolved = findUnresolvedCaresLinkV1PrivacyFindings(
      scan.findings,
      findingDecisions,
    );
    if (
      parsed.request.deIdentificationConfirmed !== true ||
      parsed.request.authorityToProcessConfirmed !== true ||
      parsed.missingRetentionPurpose ||
      unresolved.length > 0
    ) {
      throw new CaresLinkV1ContractError(
        "PRIVACY_REVIEW_REQUIRED",
        "Privacy review confirmation is required before upload",
        {
          privacyFindings: unresolved.slice(
            0,
            CARESLINK_V1_PRIVACY_FINDING_DECISION_MAX_ITEMS,
          ),
        },
      );
    }

    return {
      status: 201,
      body: await api.confirmPrivacyReview(
        {
          noteType: parsed.request.noteType,
          cleanedFactsHash: scan.cleanedFactsHash,
          schemaVersion: parsed.request.schemaVersion,
          scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
          reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
          findingDecisions,
          deIdentificationConfirmed: true,
          authorityToProcessConfirmed: true,
        },
        mutation,
      ),
    };
  });
}

export async function handleCaresLinkV1ListDocuments(
  request: Request,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api }) => {
    const url = new URL(request.url);
    return api.listDocuments(parsePageRequest(url.searchParams));
  });
}

export async function handleCaresLinkV1CreateDocument(
  request: Request,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api, principal }) => {
    assertMutationTransport(request, principal);
    const mutation = getMutationHeaders(request);
    const body = await readJsonObject(request);
    rejectClientOwner(body);
    return {
      status: 201,
      body: await api.createDocument(parseCreateDocumentRequest(body), mutation),
    };
  });
}

export async function handleCaresLinkV1GetDocument(
  request: Request,
  canonicalId: string,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api }) =>
    api.getDocument(assertUuid(canonicalId, "documentId")),
  );
}

export async function handleCaresLinkV1AppendRevision(
  request: Request,
  canonicalId: string,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api, principal }) => {
    assertMutationTransport(request, principal);
    const mutation = getMutationHeaders(request);
    const body = await readJsonObject(request);
    rejectClientOwner(body);
    return {
      status: 201,
      body: await api.appendDocumentRevision(
        assertUuid(canonicalId, "documentId"),
        parseAppendRevisionRequest(body),
        mutation,
      ),
    };
  });
}

export async function handleCaresLinkV1SaveCheckpoint(
  request: Request,
  canonicalId: string,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api, principal }) => {
    assertMutationTransport(request, principal);
    const mutation = getMutationHeaders(request);
    const body = await readJsonObject(request);
    rejectClientOwner(body);
    return api.saveCheckpoint(
      assertUuid(canonicalId, "documentId"),
      parseSaveCheckpointRequest(body),
      mutation,
    );
  });
}

export async function handleCaresLinkV1TombstoneDocument(
  request: Request,
  canonicalId: string,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api, principal }) => {
    assertMutationTransport(request, principal);
    const mutation = getMutationHeaders(request);
    const body = await readJsonObject(request);
    rejectClientOwner(body);
    return api.tombstoneDocument(
      assertUuid(canonicalId, "documentId"),
      parseTombstoneRequest(body),
      mutation,
    );
  });
}

export async function handleCaresLinkV1PullChanges(
  request: Request,
  dependencies?: CaresLinkV1ProductApiRouteDependencies,
) {
  return withProductApi(request, dependencies, async ({ api }) => {
    const url = new URL(request.url);
    return api.pullChanges(parsePageRequest(url.searchParams));
  });
}

/**
 * Fixed fail-closed boundary for the reserved sync-push path. The request is
 * intentionally opaque because no batch body, auth flow or write semantics are
 * frozen for this capability.
 */
export function handleCaresLinkV1SyncPushDisabledBoundary(
  request: Request,
  dependencies: Pick<
    CaresLinkV1ProductApiRouteDependencies,
    "createCorrelationId"
  > = {},
) {
  void request;
  const correlationId = resolveCorrelationId(
    null,
    dependencies.createCorrelationId ?? randomUUID,
  );
  const headers = createResponseHeaders(correlationId);
  return jsonResponse(
    createCaresLinkV1TransportError({
      code: "NOT_IMPLEMENTED",
      message: "Sync push is not implemented",
      correlationId,
    }),
    501,
    headers,
  );
}

type ProductApiOperationResult =
  | unknown
  | { body: unknown; status: number };

async function withProductApi(
  request: Request,
  overrides: CaresLinkV1ProductApiRouteDependencies | undefined,
  operation: (context: {
    api: CaresLinkV1ProductApi;
    principal: CaresLinkV1AuthenticatedPrincipal;
  }) => Promise<ProductApiOperationResult>,
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const correlationId = resolveCorrelationId(
    request.headers.get(CARESLINK_V1_HEADER_NAMES.correlationId),
    dependencies.createCorrelationId,
  );
  const responseHeaders = createResponseHeaders(correlationId);

  try {
    assertRequestVersions(request);
  } catch (error) {
    return errorResponse(error, correlationId, responseHeaders);
  }

  const auth = await dependencies.resolveAuth(request);
  if (!auth.ok) {
    return authErrorResponse(auth, correlationId, responseHeaders);
  }

  const principal: CaresLinkV1AuthenticatedPrincipal = {
    userId: auth.identity.userId,
    sessionId: auth.identity.sessionId,
    transport: auth.identity.source === "bearer" ? "BEARER" : "COOKIE",
  };
  const api = await dependencies.getProductApi(principal, request);
  if (!api) {
    return jsonResponse(
      createCaresLinkV1TransportError({
        code: "PRODUCT_API_DISABLED",
        message: "The Product API persistence adapter is not configured",
        correlationId,
      }),
      503,
      responseHeaders,
    );
  }

  try {
    const result = await operation({ api, principal });
    if (isStatusResult(result)) {
      return jsonResponse(result.body, result.status, responseHeaders);
    }
    return jsonResponse(result, 200, responseHeaders);
  } catch (error) {
    return errorResponse(error, correlationId, responseHeaders);
  }
}

function authErrorResponse(
  auth: Exclude<CaresLinkV1ProductApiAuthResolution, { ok: true }>,
  correlationId: string,
  headers: Headers,
) {
  const mapping: Record<
    typeof auth.reason,
    { code: CaresLinkV1ErrorCode; message: string }
  > = {
    feature_disabled: {
      code: "PRODUCT_API_DISABLED",
      message: "The Product API is not enabled",
    },
    auth_required: { code: "AUTH_REQUIRED", message: "Authentication is required" },
    invalid_session: { code: "AUTH_REQUIRED", message: "Authentication is required" },
    auth_unavailable: {
      code: "PRODUCT_API_DISABLED",
      message: "Product API authentication is unavailable",
    },
    session_revoked: {
      code: "SESSION_REVOKED",
      message: "The authenticated session is no longer active",
    },
    session_validation_unavailable: {
      code: "PRODUCT_API_DISABLED",
      message: "Active session validation is unavailable",
    },
  };
  const mapped = mapping[auth.reason];
  return jsonResponse(
    createCaresLinkV1TransportError({
      code: mapped.code,
      message: mapped.message,
      correlationId,
    }),
    auth.status,
    headers,
  );
}

function errorResponse(error: unknown, correlationId: string, headers: Headers) {
  if (isCaresLinkV1ProductApiContractError(error)) {
    const conflict =
      error instanceof CaresLinkV1ProductApiError ? error.conflict : undefined;
    return jsonResponse(
      createCaresLinkV1TransportError({
        code: error.code,
        message: error.message,
        correlationId,
        conflict,
        privacyFindings:
          error instanceof CaresLinkV1ContractError
            ? error.privacyFindings
            : undefined,
      }),
      CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE[error.code],
      headers,
    );
  }

  return jsonResponse(
    createCaresLinkV1TransportError({
      code: "PRODUCT_API_DISABLED",
      message: "The Product API request could not be completed",
      correlationId,
    }),
    503,
    headers,
  );
}

function assertRequestVersions(request: Request) {
  const contractVersion = request.headers.get(
    CARESLINK_V1_HEADER_NAMES.contractVersion,
  );
  if (contractVersion !== CARESLINK_V1_CONTRACT_VERSION) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "The request contract version is missing or unsupported",
    );
  }

  const clientVersion = request.headers.get(
    CARESLINK_V1_HEADER_NAMES.clientVersion,
  );
  if (
    !clientVersion ||
    compareSemanticVersions(clientVersion, CARESLINK_V1_MINIMUM_CLIENT_VERSION) <
      0
  ) {
    throw new CaresLinkV1ContractError(
      "MIN_CLIENT_VERSION",
      `Client version ${CARESLINK_V1_MINIMUM_CLIENT_VERSION} or newer is required`,
    );
  }
}

function compareSemanticVersions(left: string, right: string) {
  const leftParts = parseSemanticVersion(left);
  const rightParts = parseSemanticVersion(right);
  if (!leftParts || !rightParts) {
    return -1;
  }
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function parseSemanticVersion(value: string) {
  const match = value.match(
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/,
  );
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function getMutationHeaders(request: Request) {
  const idempotencyKey = request.headers.get(
    CARESLINK_V1_HEADER_NAMES.idempotencyKey,
  );
  if (!idempotencyKey) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "The Idempotency-Key header is required",
    );
  }
  return { idempotencyKey: assertCaresLinkV1IdempotencyKey(idempotencyKey) };
}

function assertMutationTransport(
  request: Request,
  principal: CaresLinkV1AuthenticatedPrincipal,
) {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "Product API mutations require application/json",
    );
  }

  if (principal.transport !== "COOKIE") {
    return;
  }

  const callerOrigin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  if (
    requestUrl.protocol !== "https:" ||
    !callerOrigin ||
    callerOrigin !== requestUrl.origin
  ) {
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

async function readJsonObject(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "The request body is too large",
    );
  }
  let value: unknown;
  try {
    const text = await request.text();
    if (text.length > 1_048_576) {
      throw new Error("body_too_large");
    }
    value = JSON.parse(text);
  } catch {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "The request body must be valid JSON",
    );
  }
  if (!isRecord(value)) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "The request body must be a JSON object",
    );
  }
  return value;
}

const FORBIDDEN_PRODUCT_API_BODY_KEYS = new Set([
  "authorization",
  "ownerid",
  "owneruserid",
  "userid",
  "sessionid",
  "accesstoken",
]);

function rejectClientOwner(value: unknown) {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (const child of current) pending.push(child);
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [key, child] of Object.entries(current)) {
      const normalizedKey = key.toLowerCase();
      if (
        FORBIDDEN_PRODUCT_API_BODY_KEYS.has(normalizedKey) ||
        normalizedKey.endsWith("token")
      ) {
        throw new CaresLinkV1ContractError(
          "VALIDATION_ERROR",
          "Server-owned identity or credential fields must not be supplied in a Product API body",
        );
      }
      pending.push(child);
    }
  }
}

function parseCreateDocumentRequest(
  body: Record<string, unknown>,
): CaresLinkV1CreateDocumentRequest {
  assertAllowedKeys(body, [
    "noteType",
    "sourceLocale",
    "content",
    "contentHash",
    "schemaVersion",
    "privacyReviewId",
  ]);
  const noteType = assertEnum(
    body.noteType,
    CARESLINK_V1_NOTE_TYPE_CODES,
    "noteType",
  );
  return {
    noteType,
    sourceLocale: assertEnum(body.sourceLocale, CARESLINK_V1_LOCALES, "sourceLocale"),
    content: parseNoteContent(body.content, noteType),
    contentHash: assertString(body.contentHash, "contentHash", 64),
    schemaVersion: assertSchemaVersion(body.schemaVersion),
    privacyReviewId: assertPrivacyReviewId(body.privacyReviewId),
  };
}

function parseConfirmPrivacyReviewRequest(body: Record<string, unknown>) {
  assertAllowedKeys(body, [
    "noteType",
    "cleanedFacts",
    "schemaVersion",
    "findingDecisions",
    "deIdentificationConfirmed",
    "authorityToProcessConfirmed",
  ]);
  if (!isRecord(body.cleanedFacts)) {
    throw validation("cleanedFacts must be a JSON object");
  }
  if (
    typeof body.deIdentificationConfirmed !== "boolean" ||
    typeof body.authorityToProcessConfirmed !== "boolean"
  ) {
    throw validation("Privacy confirmations must be boolean values");
  }
  const noteType = assertEnum(
    body.noteType,
    CARESLINK_V1_NOTE_TYPE_CODES,
    "noteType",
  );
  const cleanedFacts = validateCaresLinkV1CleanedFacts(
    noteType,
    body.cleanedFacts,
  );
  const parsedDecisions = parsePrivacyFindingDecisions(body.findingDecisions);
  assertPrivacyFindingDecisionLeaves(
    noteType,
    cleanedFacts,
    parsedDecisions.decisions,
  );
  return {
    request: {
      noteType,
      cleanedFacts,
      schemaVersion: assertSchemaVersion(body.schemaVersion),
      findingDecisions: parsedDecisions.decisions,
      deIdentificationConfirmed: body.deIdentificationConfirmed,
      authorityToProcessConfirmed: body.authorityToProcessConfirmed,
    } satisfies Omit<
      CaresLinkV1ConfirmPrivacyReviewRequest,
      "deIdentificationConfirmed" | "authorityToProcessConfirmed"
    > & {
      deIdentificationConfirmed: boolean;
      authorityToProcessConfirmed: boolean;
    },
    missingRetentionPurpose: parsedDecisions.missingRetentionPurpose,
  };
}

function assertPrivacyFindingDecisionLeaves(
  noteType: (typeof CARESLINK_V1_NOTE_TYPE_CODES)[number],
  cleanedFacts: CaresLinkV1CleanedFacts,
  decisions: readonly CaresLinkV1PrivacyFindingDecision[],
) {
  const leaves = new Set<string>();
  for (const field of getCaresLinkV1NoteType(noteType).fields) {
    const value = (cleanedFacts as Record<string, string | string[]>)[field.code];
    if (typeof value === "string") {
      leaves.add(`/${escapeJsonPointerSegment(field.code)}`);
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((_entry, index) => {
        leaves.add(`/${escapeJsonPointerSegment(field.code)}/${index}`);
      });
    }
  }

  if (decisions.some((decision) => !leaves.has(decision.fieldCode))) {
    // The submitted pointer is untrusted metadata and may itself contain PII.
    // REMOVED/REPLACED/GENERALISED offsets can refer to the pre-edit value, which
    // is intentionally absent from this atomic request. Current RETAINED
    // decisions are still matched exactly against server findings below.
    throw validation("findingDecisions contains an invalid field locator");
  }
}

function escapeJsonPointerSegment(value: string) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function parsePrivacyFindingDecisions(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > CARESLINK_V1_PRIVACY_FINDING_DECISION_MAX_ITEMS
  ) {
    throw validation("findingDecisions must be an array with at most 256 items");
  }
  let missingRetentionPurpose = false;
  const decisions = value.map((candidate) => {
    if (!isRecord(candidate)) {
      throw validation("findingDecisions entries must be objects");
    }
    assertAllowedKeys(candidate, [
      "findingType",
      "fieldCode",
      "startOffset",
      "endOffset",
      "decision",
      "retentionPurposeConfirmed",
    ]);
    const decision = assertEnum(
      candidate.decision,
      CARESLINK_V1_PRIVACY_DECISIONS,
      "findingDecisions.decision",
    );
    const retentionPurposeConfirmed = candidate.retentionPurposeConfirmed;
    if (
      retentionPurposeConfirmed !== undefined &&
      typeof retentionPurposeConfirmed !== "boolean"
    ) {
      throw validation("retentionPurposeConfirmed must be a boolean");
    }
    if (decision === "RETAINED_CONFIRMED") {
      missingRetentionPurpose ||= retentionPurposeConfirmed !== true;
    } else if (retentionPurposeConfirmed !== undefined) {
      throw validation(
        "retentionPurposeConfirmed is only valid for RETAINED_CONFIRMED",
      );
    }
    const startOffset = assertNonnegativeInteger(
      candidate.startOffset,
      "findingDecisions.startOffset",
    );
    const endOffset = assertNonnegativeInteger(
      candidate.endOffset,
      "findingDecisions.endOffset",
    );
    if (endOffset <= startOffset) {
      throw validation("findingDecisions offsets are invalid");
    }
    const parsed: CaresLinkV1PrivacyFindingDecision = {
      findingType: assertEnum(
        candidate.findingType,
        CARESLINK_V1_PRIVACY_FINDING_TYPES,
        "findingDecisions.findingType",
      ),
      fieldCode: assertJsonPointer(
        candidate.fieldCode,
        "findingDecisions.fieldCode",
      ),
      startOffset,
      endOffset,
      decision,
      ...(retentionPurposeConfirmed === true
        ? { retentionPurposeConfirmed: true as const }
        : {}),
    };
    return parsed;
  });
  return { decisions, missingRetentionPurpose };
}

function parseAppendRevisionRequest(
  body: Record<string, unknown>,
): CaresLinkV1AppendDocumentRevisionRequest {
  assertAllowedKeys(body, [
    "baseRevisionId",
    "content",
    "contentHash",
    "schemaVersion",
    "privacyReviewId",
  ]);
  return {
    baseRevisionId: assertUuid(body.baseRevisionId, "baseRevisionId"),
    content: parseNoteContent(body.content),
    contentHash: assertString(body.contentHash, "contentHash", 64),
    schemaVersion: assertSchemaVersion(body.schemaVersion),
    privacyReviewId: assertPrivacyReviewId(body.privacyReviewId),
  };
}

function parseSaveCheckpointRequest(
  body: Record<string, unknown>,
): CaresLinkV1SaveCheckpointRequest {
  assertAllowedKeys(body, [
    "baseRevisionId",
    "currentStep",
    "completedFieldCodes",
    "activeRevisionId",
    "privacyReviewId",
    "generationJobId",
  ]);
  return {
    baseRevisionId: assertUuid(body.baseRevisionId, "baseRevisionId"),
    currentStep: assertShortCode(body.currentStep, "currentStep"),
    completedFieldCodes: assertStringArray(
      body.completedFieldCodes,
      "completedFieldCodes",
    ).map((value) => assertShortCode(value, "completedFieldCodes")),
    ...(body.activeRevisionId === undefined
      ? {}
      : { activeRevisionId: assertUuid(body.activeRevisionId, "activeRevisionId") }),
    ...(body.privacyReviewId === undefined
      ? {}
      : { privacyReviewId: assertUuid(body.privacyReviewId, "privacyReviewId") }),
    ...(body.generationJobId === undefined
      ? {}
      : { generationJobId: assertUuid(body.generationJobId, "generationJobId") }),
  };
}

function parseTombstoneRequest(
  body: Record<string, unknown>,
): CaresLinkV1TombstoneDocumentRequest {
  assertAllowedKeys(body, ["baseRevisionId", "reasonCode"]);
  return {
    baseRevisionId: assertUuid(body.baseRevisionId, "baseRevisionId"),
    ...(body.reasonCode === undefined
      ? {}
      : { reasonCode: assertShortCode(body.reasonCode, "reasonCode") }),
  };
}

function assertAllowedKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw validation("The request body contains an unsupported field");
  }
}

function parsePageRequest(searchParams: URLSearchParams) {
  const cursor = searchParams.get("cursor") ?? undefined;
  const limitValue = searchParams.get("limit");
  let limit: number | undefined;
  if (limitValue !== null) {
    if (!/^[0-9]+$/.test(limitValue)) {
      throw new CaresLinkV1ContractError(
        "VALIDATION_ERROR",
        "Page limit must be an integer",
      );
    }
    limit = Number(limitValue);
  }
  return { cursor, limit };
}

function assertPrivacyReviewId(value: unknown) {
  if (value === undefined || value === null || value === "") {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_REQUIRED",
      "A privacy review proof is required before upload",
    );
  }
  return assertUuid(value, "privacyReviewId");
}

function parseNoteContent(
  value: unknown,
  noteType?: (typeof CARESLINK_V1_NOTE_TYPE_CODES)[number],
): CaresLinkV1NoteContent {
  if (!isRecord(value)) {
    throw validation("content must be an object");
  }
  assertAllowedKeys(value, [
    "englishDraft",
    "reviewVersions",
    "factsSummary",
    "missingFacts",
    "neutralWordingChecks",
    "followUpPrompts",
    "disclaimer",
  ]);
  const reviewVersions = value.reviewVersions;
  const factsSummary = value.factsSummary;
  if (!isRecord(reviewVersions) || !isRecord(factsSummary)) {
    throw validation("content reviewVersions and factsSummary must be objects");
  }
  const normalizedReviewVersions: Record<string, string> = {};
  for (const [locale, text] of Object.entries(reviewVersions)) {
    if (!(["zh-Hans", "zh-Hant"] as const).includes(locale as "zh-Hans" | "zh-Hant")) {
      throw validation("reviewVersions contains an unsupported locale");
    }
    normalizedReviewVersions[locale] = assertString(text, `reviewVersions.${locale}`, 100_000);
  }
  return {
    englishDraft: assertString(value.englishDraft, "englishDraft", 100_000),
    reviewVersions: normalizedReviewVersions,
    factsSummary: noteType
      ? validateCaresLinkV1CleanedFacts(noteType, factsSummary)
      : validateCaresLinkV1CleanedFactsForAnyNoteType(factsSummary),
    missingFacts: assertStringArray(value.missingFacts, "missingFacts"),
    neutralWordingChecks: assertStringArray(
      value.neutralWordingChecks,
      "neutralWordingChecks",
    ),
    followUpPrompts: assertStringArray(value.followUpPrompts, "followUpPrompts"),
    disclaimer: assertString(value.disclaimer, "disclaimer", 10_000),
  };
}

function assertSchemaVersion(value: unknown) {
  if (value !== CARESLINK_V1_NOTE_SCHEMA_VERSION) {
    throw validation("schemaVersion is unsupported");
  }
  return CARESLINK_V1_NOTE_SCHEMA_VERSION;
}

function assertUuid(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw validation(`${field} must be a UUID`);
  }
  return value.toLowerCase();
}

function assertShortCode(value: unknown, field: string) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(value)) {
    throw validation(`${field} is invalid`);
  }
  return value;
}

function assertJsonPointer(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH ||
    !/^\/(?:[^~]|~[01])*(?:\/(?:[^~]|~[01])*)*$/.test(value)
  ) {
    throw validation(`${field} must be an RFC 6901 JSON pointer`);
  }
  return value;
}

function assertNonnegativeInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw validation(`${field} must be a non-negative integer`);
  }
  return value as number;
}

function assertString(value: unknown, field: string, maximumLength = 2_000) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength
  ) {
    throw validation(`${field} must be a non-empty string`);
  }
  return value;
}

function assertStringArray(value: unknown, field: string) {
  if (
    !Array.isArray(value) ||
    value.length > 256 ||
    !value.every(
      (entry) =>
        typeof entry === "string" && entry.length > 0 && entry.length <= 2_000,
    )
  ) {
    throw validation(`${field} must be a bounded string array`);
  }
  return value as string[];
}

function assertEnum<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  field: string,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) {
    throw validation(`${field} is unsupported`);
  }
  return value as T[number];
}

function validation(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStatusResult(
  value: ProductApiOperationResult,
): value is { body: unknown; status: number } {
  return (
    isRecord(value) &&
    typeof value.status === "number" &&
    Object.hasOwn(value, "body")
  );
}

function resolveCorrelationId(
  candidate: string | null,
  createCorrelationId: () => string,
) {
  if (
    candidate &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(candidate)
  ) {
    return candidate;
  }
  return createCorrelationId();
}

function createResponseHeaders(correlationId: string) {
  return new Headers({
    "cache-control": "no-store",
    [CARESLINK_V1_HEADER_NAMES.contractVersion]: CARESLINK_V1_CONTRACT_VERSION,
    [CARESLINK_V1_HEADER_NAMES.minimumClientVersion]:
      CARESLINK_V1_MINIMUM_CLIENT_VERSION,
    [CARESLINK_V1_HEADER_NAMES.correlationId]: correlationId,
  });
}

function jsonResponse(body: unknown, status: number, headers: Headers) {
  return Response.json(body, { status, headers });
}
