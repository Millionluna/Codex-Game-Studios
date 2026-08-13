import "server-only";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_PRIVACY_DECISIONS,
  CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH,
  CARESLINK_V1_PRIVACY_FINDING_TYPES,
  CARESLINK_V1_PRIVACY_FINDING_DECISION_MAX_ITEMS,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  CARESLINK_V1_SELF_REVIEW_STATUSES,
  CARESLINK_V1_SYNC_STATUSES,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  validateCaresLinkV1CleanedFacts,
  validateCaresLinkV1CleanedFactsForAnyNoteType,
  type CaresLinkV1NoteContent,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1PrivacyFindingDecision,
} from "./shared-contracts";
import {
  CaresLinkV1ProductApiError,
  createCaresLinkV1ProductApiContentHash,
} from "./product-api-memory";
import { normalizeCaresLinkV1PrivacyFindingDecisions } from "./privacy-review-scanner.server";
import {
  CARESLINK_V1_SERVER_SAVE_ACK,
  assertCaresLinkV1ContentHash,
  normalizeCaresLinkV1PageLimit,
  type CaresLinkV1AppendDocumentRevisionResponse,
  type CaresLinkV1AuthenticatedPrincipal,
  type CaresLinkV1Change,
  type CaresLinkV1ConfirmPrivacyReviewCommand,
  type CaresLinkV1ConfirmPrivacyReviewResponse,
  type CaresLinkV1CreateDocumentResponse,
  type CaresLinkV1DocumentCheckpointResource,
  type CaresLinkV1DocumentResource,
  type CaresLinkV1DocumentRevisionResource,
  type CaresLinkV1GetDocumentResponse,
  type CaresLinkV1ListDocumentsResponse,
  type CaresLinkV1ProductApi,
  type CaresLinkV1PullChangesResponse,
  type CaresLinkV1SaveCheckpointResponse,
  type CaresLinkV1TombstoneDocumentResponse,
} from "./transport-contract";

export const CARESLINK_V1_SUPABASE_RPC_NAMES = {
  confirmPrivacyReview: "confirm_v1_shadow_privacy_review",
  listDocuments: "list_v1_shadow_documents",
  getDocument: "get_v1_shadow_document",
  createDocument: "create_v1_shadow_document",
  appendRevision: "append_v1_shadow_document_revision",
  saveCheckpoint: "save_v1_shadow_document_checkpoint",
  tombstoneDocument: "tombstone_v1_shadow_document",
  pullChanges: "pull_v1_shadow_document_changes",
} as const;

export type CaresLinkV1SupabaseRpcError = Readonly<{
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}>;

export type CaresLinkV1SupabaseRpcResult = Readonly<{
  data: unknown;
  error: CaresLinkV1SupabaseRpcError | null;
}>;

/**
 * This client must already be scoped to the verified user's active session.
 * The adapter intentionally has no credential, owner-id, URL, or logging input.
 */
export type CaresLinkV1SessionScopedSupabaseRpcClient = Readonly<{
  rpc(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<CaresLinkV1SupabaseRpcResult>;
}>;

export type CaresLinkV1ServiceOnlyPrivacyReviewRpcClient = Readonly<{
  rpc(
    functionName: typeof CARESLINK_V1_SUPABASE_RPC_NAMES.confirmPrivacyReview,
    args: Readonly<{
      p_owner_user_id: string;
      p_session_id: string;
      p_note_type: string;
      p_cleaned_facts_hash: string;
      p_schema_version: string;
      p_contract_version: string;
      p_scanner_policy_version: string;
      p_review_revision: number;
      p_finding_decisions: readonly CaresLinkV1PrivacyFindingDecision[];
      p_deidentification_confirmed: true;
      p_authority_to_process_confirmed: true;
      p_mutation_id: string;
    }>,
  ): PromiseLike<CaresLinkV1SupabaseRpcResult>;
}>;

export type CaresLinkV1SupabaseProductApiOptions = Readonly<{
  client: CaresLinkV1SessionScopedSupabaseRpcClient;
  privacyReviewClient?: CaresLinkV1ServiceOnlyPrivacyReviewRpcClient;
  principal: CaresLinkV1AuthenticatedPrincipal;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_CURSOR_PATTERN = /^(0|[1-9][0-9]*)$/;
const SHORT_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const MAX_POSTGRES_BIGINT = BigInt("9223372036854775807");
const FORBIDDEN_KEYS = new Set([
  "accesstoken",
  "authorization",
  "ownerid",
  "owneruserid",
  "sessionid",
  "userid",
]);

/**
 * Creates a durable Product API port over session-scoped Supabase RPCs.
 * Document RPCs derive ownership from auth.uid() and the verified session_id
 * claim. The isolated privacy issuer instead receives the already-verified
 * owner/session IDs through its service-only RPC; neither client receives a
 * bearer token in a DTO or RPC argument.
 */
export function createSupabaseCaresLinkV1ProductApi({
  client,
  privacyReviewClient,
  principal,
}: CaresLinkV1SupabaseProductApiOptions): CaresLinkV1ProductApi {
  const safePrincipal = parsePrincipal(principal);

  return {
    async getMe() {
      return {
        userId: safePrincipal.userId,
        sessionId: safePrincipal.sessionId,
        authTransport: safePrincipal.transport,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        capabilities: {
          nativePkceCallback: false,
          sessionManagement: false,
          deviceManagement: false,
          sessionRevocation: false,
        },
      };
    },

    async confirmPrivacyReview(request, mutation) {
      rejectSensitiveKeys(request);
      assertPrivacyReviewCommand(request);
      const mutationId = assertCaresLinkV1IdempotencyKey(
        mutation.idempotencyKey,
      );
      const findingDecisions = normalizeCaresLinkV1PrivacyFindingDecisions(
        request.findingDecisions,
      );
      if (!privacyReviewClient) throw unavailable();
      const data = await callPrivacyReviewRpc(privacyReviewClient, {
        p_owner_user_id: safePrincipal.userId,
        p_session_id: safePrincipal.sessionId,
        p_note_type: request.noteType,
        p_cleaned_facts_hash: request.cleanedFactsHash,
        p_schema_version: request.schemaVersion,
        p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
        p_scanner_policy_version: request.scannerPolicyVersion,
        p_review_revision: request.reviewRevision,
        p_finding_decisions: findingDecisions,
        p_deidentification_confirmed: true,
        p_authority_to_process_confirmed: true,
        p_mutation_id: mutationId,
      });
      const proof = parsePrivacyReviewProof(data);
      if (
        proof.ownerUserId !== safePrincipal.userId ||
        proof.noteType !== request.noteType ||
        proof.cleanedFactsHash !== request.cleanedFactsHash ||
        proof.schemaVersion !== request.schemaVersion ||
        proof.status !== "CONFIRMED" ||
        proof.scannerPolicyVersion !== request.scannerPolicyVersion ||
        proof.reviewRevision !== request.reviewRevision ||
        stringifyCaresLinkV1CanonicalJson(proof.findingDecisions) !==
          stringifyCaresLinkV1CanonicalJson(findingDecisions)
      ) {
        throw unavailable();
      }
      return proof;
    },

    async listDocuments(request = {}) {
      const limit = normalizeCaresLinkV1PageLimit(request.limit);
      const afterDocumentId = decodeDocumentCursor(request.cursor);
      const data = await callRpc(client, CARESLINK_V1_SUPABASE_RPC_NAMES.listDocuments, {
        p_after_document_id: afterDocumentId,
        p_limit: limit,
      });
      const response = parseRpcResponse(data, parseListDocumentsResponse);
      if (
        response.documents.length > limit ||
        (response.hasMore && response.documents.length === 0)
      ) {
        throw unavailable();
      }
      return response;
    },

    async createDocument(request, mutation) {
      rejectSensitiveKeys(request);
      const noteType = assertRequestEnum(
        request.noteType,
        CARESLINK_V1_NOTE_TYPE_CODES,
        "noteType",
      );
      assertCreateOrRevisionContent(request, noteType);
      const mutationId = assertCaresLinkV1IdempotencyKey(
        mutation.idempotencyKey,
      );
      const data = await callRpc(client, CARESLINK_V1_SUPABASE_RPC_NAMES.createDocument, {
        p_note_type: noteType,
        p_source_locale: assertRequestEnum(
          request.sourceLocale,
          CARESLINK_V1_LOCALES,
          "sourceLocale",
        ),
        p_content: request.content,
        p_content_hash: request.contentHash,
        p_mutation_id: mutationId,
        p_schema_version: request.schemaVersion,
        p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
        p_privacy_review_id: requiredPrivacyReviewId(request.privacyReviewId),
      });
      const response = parseRpcResponse(data, parseCreateDocumentResponse);
      if (
        response.lastMutationId !== mutationId ||
        response.revision.contentHash !== request.contentHash ||
        response.revision.privacyReviewId !==
          request.privacyReviewId.toLowerCase() ||
        response.document.noteType !== request.noteType ||
        response.document.sourceLocale !== request.sourceLocale
      ) {
        throw unavailable();
      }
      return response;
    },

    async getDocument(canonicalId) {
      const data = await callRpc(client, CARESLINK_V1_SUPABASE_RPC_NAMES.getDocument, {
        p_document_id: assertRequestUuid(canonicalId, "canonicalId"),
      });
      const response = parseRpcResponse(data, parseGetDocumentResponse);
      if (response.document.canonicalId !== canonicalId.toLowerCase()) {
        throw unavailable();
      }
      return response;
    },

    async appendDocumentRevision(canonicalId, request, mutation) {
      rejectSensitiveKeys(request);
      assertCreateOrRevisionContent(request);
      const mutationId = assertCaresLinkV1IdempotencyKey(
        mutation.idempotencyKey,
      );
      const data = await callRpc(client, CARESLINK_V1_SUPABASE_RPC_NAMES.appendRevision, {
        p_document_id: assertRequestUuid(canonicalId, "canonicalId"),
        p_base_revision_id: assertRequestUuid(
          request.baseRevisionId,
          "baseRevisionId",
        ),
        p_content: request.content,
        p_content_hash: request.contentHash,
        p_mutation_id: mutationId,
        p_schema_version: request.schemaVersion,
        p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
        p_privacy_review_id: requiredPrivacyReviewId(request.privacyReviewId),
      });
      const response = parseRpcResponse(data, parseAppendRevisionResponse);
      if (
        response.document.canonicalId !== canonicalId.toLowerCase() ||
        response.revision.baseRevisionId !== request.baseRevisionId.toLowerCase() ||
        response.revision.contentHash !== request.contentHash ||
        response.revision.privacyReviewId !==
          request.privacyReviewId.toLowerCase() ||
        response.lastMutationId !== mutationId
      ) {
        throw unavailable();
      }
      return response;
    },

    async saveCheckpoint(canonicalId, request, mutation) {
      rejectSensitiveKeys(request);
      if (!SHORT_CODE_PATTERN.test(request.currentStep)) {
        invalidRequest("Checkpoint current step is invalid");
      }
      if (
        !Array.isArray(request.completedFieldCodes) ||
        request.completedFieldCodes.length > 256 ||
        request.completedFieldCodes.some((code) => !SHORT_CODE_PATTERN.test(code))
      ) {
        invalidRequest("Checkpoint completed field codes are invalid");
      }
      const mutationId = assertCaresLinkV1IdempotencyKey(
        mutation.idempotencyKey,
      );
      const data = await callRpc(client, CARESLINK_V1_SUPABASE_RPC_NAMES.saveCheckpoint, {
        p_document_id: assertRequestUuid(canonicalId, "canonicalId"),
        p_base_revision_id: assertRequestUuid(
          request.baseRevisionId,
          "baseRevisionId",
        ),
        p_current_step: request.currentStep,
        p_completed_field_codes: [...request.completedFieldCodes],
        p_mutation_id: mutationId,
        p_active_revision_id: optionalRequestUuid(request.activeRevisionId),
        p_privacy_review_id: optionalRequestUuid(request.privacyReviewId),
        p_generation_job_id: optionalRequestUuid(request.generationJobId),
      });
      const response = parseRpcResponse(data, parseSaveCheckpointResponse);
      const expectedCompletedFieldCodes = [
        ...new Set(request.completedFieldCodes),
      ].sort();
      if (
        response.checkpoint.canonicalId !== canonicalId.toLowerCase() ||
        response.checkpoint.baseRevisionId !== request.baseRevisionId.toLowerCase() ||
        response.checkpoint.activeRevisionId !==
          (request.activeRevisionId ?? request.baseRevisionId).toLowerCase() ||
        response.checkpoint.currentStep !== request.currentStep ||
        !arraysEqual(
          response.checkpoint.completedFieldCodes,
          expectedCompletedFieldCodes,
        ) ||
        response.checkpoint.privacyReviewId !==
          (request.privacyReviewId?.toLowerCase() ?? null) ||
        response.checkpoint.generationJobId !==
          (request.generationJobId?.toLowerCase() ?? null) ||
        response.lastMutationId !== mutationId
      ) {
        throw unavailable();
      }
      return response;
    },

    async tombstoneDocument(canonicalId, request, mutation) {
      rejectSensitiveKeys(request);
      if (
        request.reasonCode !== undefined &&
        (typeof request.reasonCode !== "string" ||
          !SHORT_CODE_PATTERN.test(request.reasonCode))
      ) {
        invalidRequest("Tombstone reason code is invalid");
      }
      const mutationId = assertCaresLinkV1IdempotencyKey(
        mutation.idempotencyKey,
      );
      const data = await callRpc(client, CARESLINK_V1_SUPABASE_RPC_NAMES.tombstoneDocument, {
        p_document_id: assertRequestUuid(canonicalId, "canonicalId"),
        p_base_revision_id: assertRequestUuid(
          request.baseRevisionId,
          "baseRevisionId",
        ),
        p_reason_code: request.reasonCode ?? null,
        p_mutation_id: mutationId,
      });
      const response = parseRpcResponse(data, parseTombstoneResponse);
      if (
        response.document.canonicalId !== canonicalId.toLowerCase() ||
        response.lastMutationId !== mutationId
      ) {
        throw unavailable();
      }
      return response;
    },

    async pullChanges(request = {}) {
      const limit = normalizeCaresLinkV1PageLimit(request.limit);
      const afterChangeId = decodeSyncCursor(request.cursor);
      const data = await callRpc(client, CARESLINK_V1_SUPABASE_RPC_NAMES.pullChanges, {
        p_after_change_id: afterChangeId,
        p_limit: limit,
      });
      const response = parseRpcResponse(data, parsePullChangesResponse);
      const nextChangeId = response.nextCursor
        ? decodeSyncCursor(response.nextCursor)
        : afterChangeId;
      if (
        response.changes.length > limit ||
        (response.hasMore && response.changes.length === 0) ||
        BigInt(nextChangeId) < BigInt(afterChangeId) ||
        (response.changes.length > 0 &&
          BigInt(nextChangeId) === BigInt(afterChangeId))
      ) {
        throw unavailable();
      }
      return response;
    },
  };
}

async function callRpc(
  client: CaresLinkV1SessionScopedSupabaseRpcClient,
  functionName: string,
  args: Readonly<Record<string, unknown>>,
) {
  let result: CaresLinkV1SupabaseRpcResult;
  try {
    result = await client.rpc(functionName, args);
  } catch {
    throw unavailable();
  }

  if (!isRecord(result) || !("data" in result) || !("error" in result)) {
    throw unavailable();
  }
  if (result.error) {
    throw mapRpcError(result.error);
  }
  if (result.data === null || result.data === undefined) {
    throw unavailable();
  }
  return result.data;
}

async function callPrivacyReviewRpc(
  client: CaresLinkV1ServiceOnlyPrivacyReviewRpcClient,
  args: Parameters<CaresLinkV1ServiceOnlyPrivacyReviewRpcClient["rpc"]>[1],
) {
  let result: CaresLinkV1SupabaseRpcResult;
  try {
    result = await client.rpc(
      CARESLINK_V1_SUPABASE_RPC_NAMES.confirmPrivacyReview,
      args,
    );
  } catch {
    throw unavailable();
  }
  if (!isRecord(result) || !("data" in result) || !("error" in result)) {
    throw unavailable();
  }
  if (result.error) throw mapRpcError(result.error);
  if (result.data === null || result.data === undefined) throw unavailable();
  return result.data;
}

function assertPrivacyReviewCommand(
  request: CaresLinkV1ConfirmPrivacyReviewCommand,
) {
  assertRequestEnum(request.noteType, CARESLINK_V1_NOTE_TYPE_CODES, "noteType");
  assertCaresLinkV1ContentHash(request.cleanedFactsHash);
  if (
    request.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION ||
    request.scannerPolicyVersion !==
      CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION ||
    request.reviewRevision !== CARESLINK_V1_PRIVACY_REVIEW_REVISION ||
    request.deIdentificationConfirmed !== true ||
    request.authorityToProcessConfirmed !== true ||
    !Array.isArray(request.findingDecisions) ||
    request.findingDecisions.length >
      CARESLINK_V1_PRIVACY_FINDING_DECISION_MAX_ITEMS
  ) {
    invalidRequest("Privacy review command is invalid");
  }
  request.findingDecisions.forEach(assertPrivacyFindingDecisionRequest);
}

function assertPrivacyFindingDecisionRequest(value: unknown) {
  if (!isRecord(value)) invalidRequest("Privacy finding decision is invalid");
  const allowed = [
    "findingType",
    "fieldCode",
    "startOffset",
    "endOffset",
    "decision",
    "retentionPurposeConfirmed",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    invalidRequest("Privacy finding decision is invalid");
  }
  if (
    typeof value.findingType !== "string" ||
    !(CARESLINK_V1_PRIVACY_FINDING_TYPES as readonly string[]).includes(
      value.findingType,
    ) ||
    typeof value.fieldCode !== "string" ||
    !isJsonPointer(value.fieldCode) ||
    !Number.isSafeInteger(value.startOffset) ||
    !Number.isSafeInteger(value.endOffset) ||
    (value.startOffset as number) < 0 ||
    (value.endOffset as number) <= (value.startOffset as number) ||
    typeof value.decision !== "string" ||
    !(CARESLINK_V1_PRIVACY_DECISIONS as readonly string[]).includes(
      value.decision,
    ) ||
    (value.decision === "RETAINED_CONFIRMED" &&
      value.retentionPurposeConfirmed !== true) ||
    (value.decision !== "RETAINED_CONFIRMED" &&
      value.retentionPurposeConfirmed !== undefined)
  ) {
    invalidRequest("Privacy finding decision is invalid");
  }
}

function parsePrivacyReviewProof(
  value: unknown,
): CaresLinkV1ConfirmPrivacyReviewResponse {
  const record = objectWithKeys(value, [
    "id",
    "ownerUserId",
    "noteType",
    "cleanedFactsHash",
    "schemaVersion",
    "status",
    "scannerPolicyVersion",
    "reviewRevision",
    "findingDecisions",
    "confirmedAt",
    "expiresAt",
  ]);
  const confirmedAt = expectTimestamp(record.confirmedAt, "confirmedAt");
  const expiresAt = expectTimestamp(record.expiresAt, "expiresAt");
  if (
    Date.parse(expiresAt) - Date.parse(confirmedAt) !==
    CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS * 1000
  ) {
    throw unavailable();
  }
  if (
    !Array.isArray(record.findingDecisions) ||
    record.findingDecisions.length >
      CARESLINK_V1_PRIVACY_FINDING_DECISION_MAX_ITEMS
  ) {
    throw unavailable();
  }
  return {
    id: expectUuid(record.id, "id"),
    ownerUserId: expectUuid(record.ownerUserId, "ownerUserId"),
    noteType: expectEnum(record.noteType, CARESLINK_V1_NOTE_TYPE_CODES, "noteType"),
    cleanedFactsHash: expectContentHash(record.cleanedFactsHash),
    schemaVersion: expectLiteral(
      record.schemaVersion,
      CARESLINK_V1_NOTE_SCHEMA_VERSION,
      "schemaVersion",
    ),
    status: expectLiteral(record.status, "CONFIRMED", "status"),
    scannerPolicyVersion: expectLiteral(
      record.scannerPolicyVersion,
      CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
      "scannerPolicyVersion",
    ),
    reviewRevision: expectLiteral(
      record.reviewRevision,
      CARESLINK_V1_PRIVACY_REVIEW_REVISION,
      "reviewRevision",
    ),
    findingDecisions: record.findingDecisions.map(parsePrivacyFindingDecision),
    confirmedAt,
    expiresAt,
  };
}

function parsePrivacyFindingDecision(
  value: unknown,
): CaresLinkV1PrivacyFindingDecision {
  const record = objectWithOptionalKeys(
    value,
    [
      "findingType",
      "fieldCode",
      "startOffset",
      "endOffset",
      "decision",
      "retentionPurposeConfirmed",
    ],
    "findingDecision",
  );
  const decision = expectEnum(
    record.decision,
    CARESLINK_V1_PRIVACY_DECISIONS,
    "decision",
  );
  const retentionPurposeConfirmed = record.retentionPurposeConfirmed;
  if (
    (decision === "RETAINED_CONFIRMED" &&
      retentionPurposeConfirmed !== true) ||
    (decision !== "RETAINED_CONFIRMED" &&
      retentionPurposeConfirmed !== undefined)
  ) {
    throw unavailable();
  }
  const fieldCode = expectString(record.fieldCode, "fieldCode");
  if (!isJsonPointer(fieldCode)) throw unavailable();
  const startOffset = expectNonnegativeInteger(record.startOffset, "startOffset");
  const endOffset = expectNonnegativeInteger(record.endOffset, "endOffset");
  if (endOffset <= startOffset) throw unavailable();
  const findingType = expectEnum(
    record.findingType,
    CARESLINK_V1_PRIVACY_FINDING_TYPES,
    "findingType",
  );
  return {
    findingType,
    fieldCode,
    startOffset,
    endOffset,
    decision,
    ...(retentionPurposeConfirmed === true
      ? { retentionPurposeConfirmed: true }
      : {}),
  };
}

function mapRpcError(error: CaresLinkV1SupabaseRpcError): Error {
  const message = typeof error.message === "string" ? error.message.trim() : "";
  const code = typeof error.code === "string" ? error.code : "";
  const productMessages = new Set([
    "IDEMPOTENCY_CONFLICT",
    "INVALID_STATE_TRANSITION",
    "NOT_FOUND",
    "STALE_REVISION",
    "VALIDATION_ERROR",
  ]);

  if (productMessages.has(message)) {
    const conflict =
      message === "STALE_REVISION"
        ? parseConflictDetails(error.details)
        : undefined;
    return new CaresLinkV1ProductApiError(
      message as CaresLinkV1ProductApiError["code"],
      rpcErrorMessage(message),
      conflict,
    );
  }

  const contractCodes = new Set([
    "AUTH_REQUIRED",
    "FORBIDDEN",
    "MINIMUM_FACTS_REQUIRED",
    "MIN_CLIENT_VERSION",
    "PRIVACY_REVIEW_REQUIRED",
    "PRIVACY_REVIEW_STALE",
    "PRODUCT_API_DISABLED",
    "SESSION_REVOKED",
  ]);
  if (contractCodes.has(message)) {
    return new CaresLinkV1ContractError(
      message as
        | "AUTH_REQUIRED"
        | "FORBIDDEN"
        | "MINIMUM_FACTS_REQUIRED"
        | "MIN_CLIENT_VERSION"
        | "PRIVACY_REVIEW_REQUIRED"
        | "PRIVACY_REVIEW_STALE"
        | "PRODUCT_API_DISABLED"
        | "SESSION_REVOKED",
      rpcErrorMessage(message),
    );
  }
  if (code === "42501") {
    return new CaresLinkV1ContractError(
      "FORBIDDEN",
      "The authenticated session cannot perform this operation",
    );
  }
  if (code === "PGRST202") {
    return unavailable();
  }
  return unavailable();
}

function rpcErrorMessage(code: string) {
  const messages: Record<string, string> = {
    AUTH_REQUIRED: "Authentication is required",
    FORBIDDEN: "The authenticated session cannot perform this operation",
    IDEMPOTENCY_CONFLICT:
      "The idempotency key was already used for different input",
    INVALID_STATE_TRANSITION: "The document is not writable",
    MINIMUM_FACTS_REQUIRED:
      "Required cleaned facts are missing or empty",
    MIN_CLIENT_VERSION: "The Product API contract version is unsupported",
    NOT_FOUND: "The requested document was not found",
    PRIVACY_REVIEW_REQUIRED: "A privacy review proof is required before upload",
    PRIVACY_REVIEW_STALE:
      "The privacy review proof no longer matches the content being uploaded",
    PRODUCT_API_DISABLED: "The Product API persistence layer is disabled",
    SESSION_REVOKED: "The authenticated session is no longer active",
    STALE_REVISION: "The document changed before this mutation was saved",
    VALIDATION_ERROR: "The Product API mutation was rejected",
  };
  return messages[code] ?? "The Product API request could not be completed";
}

function parseConflictDetails(
  value: unknown,
): CaresLinkV1ProductApiError["conflict"] | undefined {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!isRecord(candidate)) {
    return undefined;
  }
  try {
    exactKeys(candidate, [
      "canonicalId",
      "currentRevisionId",
      "currentRevisionNumber",
    ]);
    return {
      canonicalId: expectUuid(candidate.canonicalId, "canonicalId"),
      currentRevisionId: nullableUuid(
        candidate.currentRevisionId,
        "currentRevisionId",
      ),
      currentRevisionNumber: expectNonnegativeInteger(
        candidate.currentRevisionNumber,
        "currentRevisionNumber",
      ),
    };
  } catch {
    return undefined;
  }
}

function parseListDocumentsResponse(value: unknown): CaresLinkV1ListDocumentsResponse {
  const record = objectWithKeys(value, ["documents", "nextCursor", "hasMore"]);
  const documents = expectArray(record.documents, "documents").map(parseDocument);
  const nextCursor = encodeDocumentCursor(record.nextCursor);
  const hasMore = expectBoolean(record.hasMore, "hasMore");
  if (hasMore && !nextCursor) {
    throw unavailable();
  }
  return {
    documents,
    nextCursor,
    hasMore,
  };
}

function parseGetDocumentResponse(value: unknown): CaresLinkV1GetDocumentResponse {
  const record = objectWithKeys(value, [
    "document",
    "revisions",
    "checkpoint",
    "selfReviewStatus",
  ]);
  const document = parseDocument(record.document);
  const revisions = expectArray(record.revisions, "revisions").map((revision) =>
    parseRevision(revision, document.noteType),
  );
  const checkpoint =
    record.checkpoint === null ? null : parseCheckpoint(record.checkpoint);
  assertDocumentAggregate(document, revisions, checkpoint);
  return {
    document,
    revisions,
    checkpoint,
    selfReviewStatus: expectEnum(
      record.selfReviewStatus,
      CARESLINK_V1_SELF_REVIEW_STATUSES,
      "selfReviewStatus",
    ),
  };
}

function parseCreateDocumentResponse(value: unknown): CaresLinkV1CreateDocumentResponse {
  const response = parseRevisionMutationResponse(value);
  if (
    response.revision.revisionNumber !== 1 ||
    response.revision.baseRevisionId !== null
  ) {
    throw unavailable();
  }
  return response;
}

function parseRevisionMutationResponse(
  value: unknown,
): CaresLinkV1CreateDocumentResponse {
  const record = parseMutationEnvelope(value, ["document", "revision"]);
  const document = parseDocument(record.document);
  const revision = parseRevision(record.revision, document.noteType);
  const lastMutationId = expectString(record.lastMutationId, "lastMutationId");
  assertAcknowledgedRevision(document, revision, lastMutationId);
  return {
    document,
    revision,
    saveState: CARESLINK_V1_SERVER_SAVE_ACK,
    lastMutationId,
    serverTime: expectTimestamp(record.serverTime, "serverTime"),
  };
}

function assertAcknowledgedRevision(
  document: CaresLinkV1DocumentResource,
  revision: CaresLinkV1DocumentRevisionResource,
  lastMutationId: string,
) {
  if (
    document.canonicalId !== revision.canonicalId ||
    document.currentRevisionId !== revision.revisionId ||
    document.currentRevisionNumber !== revision.revisionNumber ||
    revision.mutationId !== lastMutationId
  ) {
    throw unavailable();
  }
}

function assertDocumentAggregate(
  document: CaresLinkV1DocumentResource,
  revisions: CaresLinkV1DocumentRevisionResource[],
  checkpoint: CaresLinkV1DocumentCheckpointResource | null,
) {
  if (revisions.some((revision) => revision.canonicalId !== document.canonicalId)) {
    throw unavailable();
  }
  if (checkpoint && checkpoint.canonicalId !== document.canonicalId) {
    throw unavailable();
  }
  if (document.currentRevisionId === null) {
    if (document.currentRevisionNumber !== 0) {
      throw unavailable();
    }
    return;
  }
  if (
    !revisions.some(
      (revision) =>
        revision.revisionId === document.currentRevisionId &&
        revision.revisionNumber === document.currentRevisionNumber,
    )
  ) {
    throw unavailable();
  }
}

function parseAppendRevisionResponse(
  value: unknown,
): CaresLinkV1AppendDocumentRevisionResponse {
  return parseRevisionMutationResponse(value);
}

function parseSaveCheckpointResponse(value: unknown): CaresLinkV1SaveCheckpointResponse {
  const record = parseMutationEnvelope(value, ["checkpoint"]);
  const checkpoint = parseCheckpoint(record.checkpoint);
  const lastMutationId = expectString(record.lastMutationId, "lastMutationId");
  if (
    checkpoint.mutationId !== lastMutationId ||
    checkpoint.syncStatus !== CARESLINK_V1_SERVER_SAVE_ACK
  ) {
    throw unavailable();
  }
  return {
    checkpoint,
    saveState: CARESLINK_V1_SERVER_SAVE_ACK,
    lastMutationId,
    serverTime: expectTimestamp(record.serverTime, "serverTime"),
  };
}

function parseTombstoneResponse(value: unknown): CaresLinkV1TombstoneDocumentResponse {
  const record = parseMutationEnvelope(value, ["document"]);
  const document = parseDocument(record.document);
  if (document.lifecycleStatus !== "TOMBSTONED" || !document.deletedAt) {
    throw unavailable();
  }
  return {
    document,
    saveState: CARESLINK_V1_SERVER_SAVE_ACK,
    lastMutationId: assertCaresLinkV1IdempotencyKey(
      expectString(record.lastMutationId, "lastMutationId"),
    ),
    serverTime: expectTimestamp(record.serverTime, "serverTime"),
  };
}

function parseMutationEnvelope(
  value: unknown,
  resourceKeys: readonly string[],
) {
  const record = objectWithKeys(value, [
    ...resourceKeys,
    "saveState",
    "lastMutationId",
    "serverTime",
  ]);
  if (record.saveState !== CARESLINK_V1_SERVER_SAVE_ACK) {
    throw unavailable();
  }
  return record;
}

function parseRpcResponse<T>(value: unknown, parser: (value: unknown) => T): T {
  try {
    return parser(value);
  } catch {
    throw unavailable();
  }
}

function parsePullChangesResponse(value: unknown): CaresLinkV1PullChangesResponse {
  const record = objectWithKeys(value, ["changes", "nextCursor", "hasMore"]);
  const changes = expectArray(record.changes, "changes").map(parseChange);
  const nextCursor = encodeSyncCursor(record.nextCursor);
  const hasMore = expectBoolean(record.hasMore, "hasMore");
  if (hasMore && !nextCursor) {
    throw unavailable();
  }
  return {
    changes,
    nextCursor,
    hasMore,
  };
}

function parseDocument(value: unknown): CaresLinkV1DocumentResource {
  const record = objectWithKeys(value, [
    "canonicalId",
    "noteType",
    "sourceLocale",
    "lifecycleStatus",
    "currentRevisionId",
    "currentRevisionNumber",
    "contractVersion",
    "schemaVersion",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ]);
  expectContractVersions(record);
  const document: CaresLinkV1DocumentResource = {
    canonicalId: expectUuid(record.canonicalId, "canonicalId"),
    noteType: expectEnum(record.noteType, CARESLINK_V1_NOTE_TYPE_CODES, "noteType"),
    sourceLocale: expectEnum(record.sourceLocale, CARESLINK_V1_LOCALES, "sourceLocale"),
    lifecycleStatus: expectEnum(
      record.lifecycleStatus,
      CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES,
      "lifecycleStatus",
    ),
    currentRevisionId: nullableUuid(record.currentRevisionId, "currentRevisionId"),
    currentRevisionNumber: expectNonnegativeInteger(
      record.currentRevisionNumber,
      "currentRevisionNumber",
    ),
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    createdAt: expectTimestamp(record.createdAt, "createdAt"),
    updatedAt: expectTimestamp(record.updatedAt, "updatedAt"),
    deletedAt: nullableTimestamp(record.deletedAt, "deletedAt"),
  };
  const isDeleted =
    document.lifecycleStatus === "TOMBSTONED" ||
    document.lifecycleStatus === "PURGED";
  if (isDeleted !== Boolean(document.deletedAt)) {
    throw unavailable();
  }
  return document;
}

function parseRevision(
  value: unknown,
  noteType?: CaresLinkV1NoteTypeCode,
): CaresLinkV1DocumentRevisionResource {
  const record = objectWithKeys(value, [
    "revisionId",
    "canonicalId",
    "revisionNumber",
    "baseRevisionId",
    "privacyReviewId",
    "content",
    "contentHash",
    "mutationId",
    "contractVersion",
    "schemaVersion",
    "createdAt",
  ]);
  expectContractVersions(record);
  const content = parseNoteContent(record.content, noteType);
  const contentHash = assertCaresLinkV1ContentHash(
    expectString(record.contentHash, "contentHash"),
  );
  if (createCaresLinkV1ProductApiContentHash(content) !== contentHash) {
    throw unavailable();
  }
  const revision: CaresLinkV1DocumentRevisionResource = {
    revisionId: expectUuid(record.revisionId, "revisionId"),
    canonicalId: expectUuid(record.canonicalId, "canonicalId"),
    revisionNumber: expectPositiveInteger(record.revisionNumber, "revisionNumber"),
    baseRevisionId: nullableUuid(record.baseRevisionId, "baseRevisionId"),
    privacyReviewId: nullableUuid(record.privacyReviewId, "privacyReviewId"),
    content,
    contentHash,
    mutationId: assertCaresLinkV1IdempotencyKey(
      expectString(record.mutationId, "mutationId"),
    ),
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    createdAt: expectTimestamp(record.createdAt, "createdAt"),
  };
  if (
    (revision.revisionNumber === 1 && revision.baseRevisionId !== null) ||
    (revision.revisionNumber > 1 && revision.baseRevisionId === null)
  ) {
    throw unavailable();
  }
  return revision;
}

function parseCheckpoint(value: unknown): CaresLinkV1DocumentCheckpointResource {
  const record = objectWithKeys(value, [
    "canonicalId",
    "baseRevisionId",
    "currentStep",
    "completedFieldCodes",
    "activeRevisionId",
    "privacyReviewId",
    "generationJobId",
    "syncStatus",
    "mutationId",
    "updatedAt",
  ]);
  const currentStep = expectString(record.currentStep, "currentStep");
  const completedFieldCodes = expectArray(
    record.completedFieldCodes,
    "completedFieldCodes",
  ).map((entry) => expectString(entry, "completedFieldCode"));
  if (
    !SHORT_CODE_PATTERN.test(currentStep) ||
    completedFieldCodes.length > 256 ||
    completedFieldCodes.some((code) => !SHORT_CODE_PATTERN.test(code)) ||
    !arraysEqual(completedFieldCodes, [...new Set(completedFieldCodes)].sort())
  ) {
    throw unavailable();
  }
  return {
    canonicalId: expectUuid(record.canonicalId, "canonicalId"),
    baseRevisionId: nullableUuid(record.baseRevisionId, "baseRevisionId"),
    currentStep,
    completedFieldCodes,
    activeRevisionId: nullableUuid(record.activeRevisionId, "activeRevisionId"),
    privacyReviewId: nullableUuid(record.privacyReviewId, "privacyReviewId"),
    generationJobId: nullableUuid(record.generationJobId, "generationJobId"),
    syncStatus: expectEnum(record.syncStatus, CARESLINK_V1_SYNC_STATUSES, "syncStatus"),
    mutationId: assertCaresLinkV1IdempotencyKey(
      expectString(record.mutationId, "mutationId"),
    ),
    updatedAt: expectTimestamp(record.updatedAt, "updatedAt"),
  };
}

function parseChange(value: unknown): CaresLinkV1Change {
  const record = objectWithKeys(value, [
    "kind",
    "canonicalId",
    "noteType",
    "revision",
    "lastMutationId",
    "serverTime",
    "deletedAt",
  ]);
  const noteType = expectEnum(
    record.noteType,
    CARESLINK_V1_NOTE_TYPE_CODES,
    "noteType",
  );
  const common = {
    canonicalId: expectUuid(record.canonicalId, "canonicalId"),
    noteType,
    lastMutationId: assertCaresLinkV1IdempotencyKey(
      expectString(record.lastMutationId, "lastMutationId"),
    ),
    serverTime: expectTimestamp(record.serverTime, "serverTime"),
  };
  if (record.kind === "DOCUMENT_UPSERTED") {
    if (record.deletedAt !== null) {
      throw unavailable();
    }
    const revision = parseRevision(record.revision, noteType);
    if (revision.canonicalId !== common.canonicalId) {
      throw unavailable();
    }
    return {
      kind: record.kind,
      ...common,
      revision,
      deletedAt: null,
    };
  }
  if (record.kind === "DOCUMENT_TOMBSTONED") {
    const revision =
      record.revision === null
        ? null
        : parseRevision(record.revision, noteType);
    if (revision && revision.canonicalId !== common.canonicalId) {
      throw unavailable();
    }
    return {
      kind: record.kind,
      ...common,
      revision,
      deletedAt: expectTimestamp(record.deletedAt, "deletedAt"),
    };
  }
  throw unavailable();
}

function parseNoteContent(
  value: unknown,
  noteType?: CaresLinkV1NoteTypeCode,
): CaresLinkV1NoteContent {
  const record = objectWithKeys(value, [
    "englishDraft",
    "reviewVersions",
    "factsSummary",
    "missingFacts",
    "neutralWordingChecks",
    "followUpPrompts",
    "disclaimer",
  ]);
  const reviewVersions = objectWithOptionalKeys(
    record.reviewVersions,
    ["zh-Hans", "zh-Hant"],
    "reviewVersions",
  );
  const factsSummary = noteType
    ? validateCaresLinkV1CleanedFacts(noteType, record.factsSummary)
    : validateCaresLinkV1CleanedFactsForAnyNoteType(record.factsSummary);
  return {
    englishDraft: expectString(record.englishDraft, "englishDraft"),
    reviewVersions: Object.fromEntries(
      Object.entries(reviewVersions).map(([locale, draft]) => [
        locale,
        expectString(draft, `reviewVersions.${locale}`),
      ]),
    ),
    factsSummary,
    missingFacts: stringArray(record.missingFacts, "missingFacts"),
    neutralWordingChecks: stringArray(
      record.neutralWordingChecks,
      "neutralWordingChecks",
    ),
    followUpPrompts: stringArray(record.followUpPrompts, "followUpPrompts"),
    disclaimer: expectString(record.disclaimer, "disclaimer"),
  };
}

function assertCreateOrRevisionContent(request: {
  content: CaresLinkV1NoteContent;
  contentHash: string;
  schemaVersion: string;
}, noteType?: CaresLinkV1NoteTypeCode) {
  if (request.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION) {
    invalidRequest("Unsupported note schema version");
  }
  if (noteType) {
    validateCaresLinkV1CleanedFacts(noteType, request.content.factsSummary);
  } else {
    validateCaresLinkV1CleanedFactsForAnyNoteType(
      request.content.factsSummary,
    );
  }
  let content: CaresLinkV1NoteContent;
  try {
    content = parseNoteContent(request.content, noteType);
  } catch {
    invalidRequest("Note content is invalid");
  }
  const hash = assertCaresLinkV1ContentHash(request.contentHash);
  if (createCaresLinkV1ProductApiContentHash(content) !== hash) {
    invalidRequest("Content hash does not match the request content");
  }
}

function parsePrincipal(principal: CaresLinkV1AuthenticatedPrincipal) {
  exactKeys(principal, ["userId", "sessionId", "transport"]);
  if (principal.transport !== "BEARER" && principal.transport !== "COOKIE") {
    throw unavailable();
  }
  return {
    userId: expectUuid(principal.userId, "userId"),
    sessionId: expectUuid(principal.sessionId, "sessionId"),
    transport: principal.transport,
  } as const;
}

function encodeDocumentCursor(value: unknown) {
  if (value === null) {
    return null;
  }
  return `document.v1:${expectUuid(value, "document cursor")}`;
}

function decodeDocumentCursor(value: string | undefined) {
  if (value === undefined) {
    return null;
  }
  const match = value.match(/^document\.v1:([0-9a-f-]{36})$/i);
  if (!match || !UUID_PATTERN.test(match[1])) {
    invalidRequest("Document cursor is invalid");
  }
  return match[1].toLowerCase();
}

function encodeSyncCursor(value: unknown) {
  if (value === null) {
    return null;
  }
  return `sync.v1:${normalizeDatabaseCursor(value)}`;
}

function decodeSyncCursor(value: string | undefined) {
  if (value === undefined) {
    return "0";
  }
  const match = value.match(/^sync\.v1:(0|[1-9][0-9]*)$/);
  if (!match || BigInt(match[1]) > MAX_POSTGRES_BIGINT) {
    invalidRequest("Sync cursor is invalid");
  }
  return match[1];
}

function normalizeDatabaseCursor(value: unknown) {
  const raw =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value;
  if (typeof raw !== "string" || !DECIMAL_CURSOR_PATTERN.test(raw)) {
    throw unavailable();
  }
  const numeric = BigInt(raw);
  if (numeric > MAX_POSTGRES_BIGINT) {
    throw unavailable();
  }
  return raw;
}

function expectContractVersions(record: Record<string, unknown>) {
  if (
    record.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
    record.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION
  ) {
    throw unavailable();
  }
}

function rejectSensitiveKeys(value: unknown, seen = new Set<object>()) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    invalidRequest("Request body contains a recursive value");
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry) => rejectSensitiveKeys(entry, seen));
  } else {
    Object.entries(value).forEach(([key, entry]) => {
      const normalizedKey = key.toLowerCase();
      if (
        FORBIDDEN_KEYS.has(normalizedKey) ||
        normalizedKey.endsWith("token")
      ) {
        invalidRequest("Request contains server-owned identity material");
      }
      rejectSensitiveKeys(entry, seen);
    });
  }
  seen.delete(value);
}

function objectWithKeys(value: unknown, keys: readonly string[]) {
  const record = expectRecord(value, "response");
  exactKeys(record, keys);
  return record;
}

function objectWithOptionalKeys(
  value: unknown,
  keys: readonly string[],
  field: string,
) {
  const record = expectRecord(value, field);
  const actual = Object.keys(record);
  if (actual.some((key) => !keys.includes(key))) {
    throw unavailable();
  }
  return record;
}

function exactKeys(value: object, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw unavailable();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function expectRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw unavailable(`${field} is invalid`);
  }
  return value;
}

function expectArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw unavailable(`${field} is invalid`);
  }
  return value;
}

function expectString(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw unavailable(`${field} is invalid`);
  }
  return value;
}

function expectContentHash(value: unknown) {
  const hash = expectString(value, "cleanedFactsHash");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw unavailable();
  return hash;
}

function expectLiteral<const T extends string | number>(
  value: unknown,
  expected: T,
  field: string,
): T {
  if (value !== expected) throw unavailable(`${field} is invalid`);
  return expected;
}

function expectBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw unavailable(`${field} is invalid`);
  }
  return value;
}

function expectUuid(value: unknown, field: string) {
  const string = expectString(value, field);
  if (!UUID_PATTERN.test(string)) {
    throw unavailable(`${field} is invalid`);
  }
  return string.toLowerCase();
}

function assertRequestUuid(value: unknown, field: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invalidRequest(`${field} must be a UUID`);
  }
  return value.toLowerCase();
}

function isJsonPointer(value: string) {
  return (
    value.length >= 1 &&
    value.length <= CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH &&
    /^\/(?:[^~]|~[01])*(?:\/(?:[^~]|~[01])*)*$/.test(value)
  );
}

function optionalRequestUuid(value: unknown) {
  return value === undefined
    ? null
    : assertRequestUuid(value, "optional UUID");
}

function requiredPrivacyReviewId(value: unknown) {
  if (value === undefined || value === null || value === "") {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_REQUIRED",
      "A privacy review proof is required before upload",
    );
  }
  return assertRequestUuid(value, "privacyReviewId");
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function nullableUuid(value: unknown, field: string) {
  return value === null ? null : expectUuid(value, field);
}

function expectPositiveInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw unavailable(`${field} is invalid`);
  }
  return value as number;
}

function expectNonnegativeInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw unavailable(`${field} is invalid`);
  }
  return value as number;
}

function expectTimestamp(value: unknown, field: string) {
  const timestamp = expectString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    throw unavailable(`${field} is invalid`);
  }
  return timestamp;
}

function nullableTimestamp(value: unknown, field: string) {
  return value === null ? null : expectTimestamp(value, field);
}

function expectEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw unavailable(`${field} is invalid`);
  }
  return value as T[number];
}

function assertRequestEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    invalidRequest(`${field} is invalid`);
  }
  return value as T[number];
}

function stringArray(value: unknown, field: string) {
  return expectArray(value, field).map((entry) => expectString(entry, field));
}

function invalidRequest(message: string): never {
  throw new CaresLinkV1ProductApiError("VALIDATION_ERROR", message);
}

function unavailable(
  message = "The Product API persistence response was invalid",
): CaresLinkV1ContractError {
  return new CaresLinkV1ContractError("PRODUCT_API_DISABLED", message);
}
