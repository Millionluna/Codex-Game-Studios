import { createHash, randomUUID } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_PRIVACY_DECISIONS,
  CARESLINK_V1_PRIVACY_FINDING_TYPES,
  CARESLINK_V1_PRIVACY_FINDING_DECISION_MAX_ITEMS,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1JsonObject,
  type CaresLinkV1NoteContent,
  type CaresLinkV1PrivacyProof,
} from "./shared-contracts";
import {
  CARESLINK_V1_SERVER_SAVE_ACK,
  assertCaresLinkV1ContentHash,
  normalizeCaresLinkV1PageLimit,
  type CaresLinkV1AppendDocumentRevisionRequest,
  type CaresLinkV1AppendDocumentRevisionResponse,
  type CaresLinkV1AuthenticatedPrincipal,
  type CaresLinkV1Change,
  type CaresLinkV1ConfirmPrivacyReviewCommand,
  type CaresLinkV1ConfirmPrivacyReviewResponse,
  type CaresLinkV1CreateDocumentRequest,
  type CaresLinkV1CreateDocumentResponse,
  type CaresLinkV1DocumentCheckpointResource,
  type CaresLinkV1DocumentResource,
  type CaresLinkV1DocumentRevisionResource,
  type CaresLinkV1GetDocumentResponse,
  type CaresLinkV1ListDocumentsRequest,
  type CaresLinkV1ListDocumentsResponse,
  type CaresLinkV1MeResponse,
  type CaresLinkV1MutationHeaders,
  type CaresLinkV1ProductApi,
  type CaresLinkV1PullChangesRequest,
  type CaresLinkV1PullChangesResponse,
  type CaresLinkV1SaveCheckpointRequest,
  type CaresLinkV1SaveCheckpointResponse,
  type CaresLinkV1TombstoneDocumentRequest,
  type CaresLinkV1TombstoneDocumentResponse,
} from "./transport-contract";

export class CaresLinkV1ProductApiError extends Error {
  readonly code:
    | "IDEMPOTENCY_CONFLICT"
    | "INVALID_STATE_TRANSITION"
    | "NOT_FOUND"
    | "STALE_REVISION"
    | "VALIDATION_ERROR";
  readonly conflict?: {
    canonicalId: string;
    currentRevisionId: string | null;
    currentRevisionNumber: number;
  };

  constructor(
    code: CaresLinkV1ProductApiError["code"],
    message: string,
    conflict?: CaresLinkV1ProductApiError["conflict"],
  ) {
    super(message);
    this.name = "CaresLinkV1ProductApiError";
    this.code = code;
    this.conflict = conflict;
  }
}

type StoredDocument = {
  ownerUserId: string;
  document: CaresLinkV1DocumentResource;
  revisions: CaresLinkV1DocumentRevisionResource[];
  checkpoint: CaresLinkV1DocumentCheckpointResource | null;
};

type MutationReceipt = {
  fingerprint: string;
  kind:
    | "APPEND_REVISION"
    | "CONFIRM_PRIVACY_REVIEW"
    | "CREATE_DOCUMENT"
    | "SAVE_CHECKPOINT"
    | "TOMBSTONE_DOCUMENT";
  response: unknown;
};

type StoredChange = {
  sequence: number;
  change: CaresLinkV1Change;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHORT_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;

export type CaresLinkV1MemoryProductApiStore = {
  kind: "memory-shadow";
  forPrincipal(principal: CaresLinkV1AuthenticatedPrincipal): CaresLinkV1ProductApi;
};

export type CaresLinkV1MemoryProductApiOptions = {
  createId?: () => string;
  now?: () => string;
  initialPrivacyProofs?: readonly CaresLinkV1PrivacyProof[];
};

/**
 * Reference adapter for local and unit-test use only. It deliberately exposes
 * no persistence configuration and must never be presented as cross-device
 * durable storage.
 */
export function createMemoryCaresLinkV1ProductApiStore({
  createId = randomUUID,
  now = () => new Date().toISOString(),
  initialPrivacyProofs = [],
}: CaresLinkV1MemoryProductApiOptions = {}): CaresLinkV1MemoryProductApiStore {
  const documents = new Map<string, StoredDocument>();
  const privacyProofs = new Map(
    initialPrivacyProofs.map((proof) => [
      privacyProofKey(proof.ownerUserId, proof.id),
      clone(proof),
    ]),
  );
  const mutationReceipts = new Map<string, MutationReceipt>();
  const changes = new Map<string, StoredChange[]>();
  const changeCursorOwners = new Map<number, string>();
  let nextChangeSequence = 0;

  return {
    kind: "memory-shadow",
    forPrincipal(principal) {
      const ownerUserId = principal.userId;

      return {
        async getMe(): Promise<CaresLinkV1MeResponse> {
          return {
            userId: ownerUserId,
            sessionId: principal.sessionId,
            authTransport: principal.transport,
            contractVersion: CARESLINK_V1_CONTRACT_VERSION,
            capabilities: {
              nativePkceCallback: false,
              sessionManagement: false,
              deviceManagement: false,
              sessionRevocation: false,
            },
          };
        },

        async confirmPrivacyReview(
          request: CaresLinkV1ConfirmPrivacyReviewCommand,
          mutation: CaresLinkV1MutationHeaders,
        ): Promise<CaresLinkV1ConfirmPrivacyReviewResponse> {
          const mutationId = validateMutation(mutation);
          validatePrivacyReviewCommand(request);
          const fingerprint = fingerprintMutation(
            "CONFIRM_PRIVACY_REVIEW",
            request,
          );
          const replay = replayMutation<CaresLinkV1ConfirmPrivacyReviewResponse>(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "CONFIRM_PRIVACY_REVIEW",
            fingerprint,
          );
          if (replay) return replay;

          const confirmedAt = now();
          const expiresAt = new Date(
            Date.parse(confirmedAt) +
              CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS * 1000,
          ).toISOString();
          const proof: CaresLinkV1ConfirmPrivacyReviewResponse = {
            id: validateUuid(createId(), "Privacy review ID"),
            ownerUserId,
            noteType: request.noteType,
            cleanedFactsHash: request.cleanedFactsHash,
            schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
            status: "CONFIRMED",
            scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
            reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
            findingDecisions: clone(request.findingDecisions),
            confirmedAt,
            expiresAt,
          };
          privacyProofs.set(privacyProofKey(ownerUserId, proof.id), proof);
          recordMutation(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "CONFIRM_PRIVACY_REVIEW",
            fingerprint,
            proof,
          );
          return clone(proof);
        },

        async listDocuments(
          request: CaresLinkV1ListDocumentsRequest = {},
        ): Promise<CaresLinkV1ListDocumentsResponse> {
          const limit = normalizeCaresLinkV1PageLimit(request.limit);
          const afterId = parseDocumentCursor(request.cursor);
          if (afterId) {
            const cursorDocument = documents.get(afterId);
            if (!cursorDocument || cursorDocument.ownerUserId !== ownerUserId) {
              invalidRequest("Document cursor is invalid for this owner");
            }
          }
          const candidates = [...documents.values()]
            .filter(
              (stored) =>
                stored.ownerUserId === ownerUserId &&
                stored.document.lifecycleStatus !== "PURGED" &&
                (!afterId || stored.document.canonicalId > afterId),
            )
            .sort((left, right) =>
              left.document.canonicalId.localeCompare(
                right.document.canonicalId,
              ),
            );
          const page = candidates.slice(0, limit);
          const hasMore = candidates.length > page.length;

          return {
            documents: clone(page.map(({ document }) => document)),
            nextCursor:
              hasMore && page.length > 0
                ? createDocumentCursor(page.at(-1)!.document.canonicalId)
                : null,
            hasMore,
          };
        },

        async createDocument(
          request: CaresLinkV1CreateDocumentRequest,
          mutation: CaresLinkV1MutationHeaders,
        ): Promise<CaresLinkV1CreateDocumentResponse> {
          const mutationId = validateMutation(mutation);
          const privacyReviewId = validateRequiredPrivacyReviewId(
            request.privacyReviewId,
          );
          validateSchemaVersion(request.schemaVersion);
          validateCaresLinkV1CleanedFacts(
            request.noteType,
            request.content.factsSummary,
          );
          validateContentHash(request.content, request.contentHash);
          const fingerprint = fingerprintMutation("CREATE_DOCUMENT", {
            ...request,
            privacyReviewId,
          });
          const replay = replayMutation<CaresLinkV1CreateDocumentResponse>(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "CREATE_DOCUMENT",
            fingerprint,
          );
          if (replay) {
            return replay;
          }
          requireValidPrivacyProof({
            privacyProofs,
            privacyReviewId,
            ownerUserId,
            noteType: request.noteType,
            cleanedFactsHash: createCaresLinkV1CleanedFactsHash(
              request.content.factsSummary,
            ),
            schemaVersion: request.schemaVersion,
            now: now(),
          });

          const canonicalId = createId();
          const revisionId = createId();
          const serverTime = now();
          const revision: CaresLinkV1DocumentRevisionResource = {
            revisionId,
            canonicalId,
            revisionNumber: 1,
            baseRevisionId: null,
            privacyReviewId,
            content: clone(request.content),
            contentHash: request.contentHash,
            mutationId,
            contractVersion: CARESLINK_V1_CONTRACT_VERSION,
            schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
            createdAt: serverTime,
          };
          const document: CaresLinkV1DocumentResource = {
            canonicalId,
            noteType: request.noteType,
            sourceLocale: request.sourceLocale,
            lifecycleStatus: "IN_PROGRESS",
            currentRevisionId: revisionId,
            currentRevisionNumber: 1,
            contractVersion: CARESLINK_V1_CONTRACT_VERSION,
            schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
            createdAt: serverTime,
            updatedAt: serverTime,
            deletedAt: null,
          };
          const response: CaresLinkV1CreateDocumentResponse = {
            document,
            revision,
            saveState: CARESLINK_V1_SERVER_SAVE_ACK,
            lastMutationId: mutationId,
            serverTime,
          };

          documents.set(canonicalId, {
            ownerUserId,
            document,
            revisions: [revision],
            checkpoint: null,
          });
          recordMutation(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "CREATE_DOCUMENT",
            fingerprint,
            response,
          );
          nextChangeSequence = recordChange(
            changes,
            changeCursorOwners,
            nextChangeSequence,
            ownerUserId,
            {
              kind: "DOCUMENT_UPSERTED",
              canonicalId,
              noteType: document.noteType,
              revision,
              lastMutationId: mutationId,
              serverTime,
              deletedAt: null,
            },
          );

          return clone(response);
        },

        async getDocument(
          canonicalId: string,
        ): Promise<CaresLinkV1GetDocumentResponse> {
          const stored = requireOwnedDocument(
            documents,
            canonicalId,
            ownerUserId,
          );

          return clone({
            document: stored.document,
            revisions: stored.revisions,
            checkpoint: stored.checkpoint,
            selfReviewStatus: "REQUIRED",
          });
        },

        async appendDocumentRevision(
          canonicalId: string,
          request: CaresLinkV1AppendDocumentRevisionRequest,
          mutation: CaresLinkV1MutationHeaders,
        ): Promise<CaresLinkV1AppendDocumentRevisionResponse> {
          const mutationId = validateMutation(mutation);
          const privacyReviewId = validateRequiredPrivacyReviewId(
            request.privacyReviewId,
          );
          validateSchemaVersion(request.schemaVersion);
          const owned = requireOwnedDocument(
            documents,
            canonicalId,
            ownerUserId,
          );
          validateCaresLinkV1CleanedFacts(
            owned.document.noteType,
            request.content.factsSummary,
          );
          validateContentHash(request.content, request.contentHash);
          const fingerprint = fingerprintMutation("APPEND_REVISION", {
            canonicalId,
            ...request,
            privacyReviewId,
          });
          const replay = replayMutation<CaresLinkV1AppendDocumentRevisionResponse>(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "APPEND_REVISION",
            fingerprint,
          );
          if (replay) {
            return replay;
          }

          const stored = requireWritableOwnedDocument(
            documents,
            canonicalId,
            ownerUserId,
          );
          assertCurrentRevision(stored, request.baseRevisionId);
          requireValidPrivacyProof({
            privacyProofs,
            privacyReviewId,
            ownerUserId,
            noteType: stored.document.noteType,
            cleanedFactsHash: createCaresLinkV1CleanedFactsHash(
              request.content.factsSummary,
            ),
            schemaVersion: request.schemaVersion,
            now: now(),
          });
          const revisionId = createId();
          const serverTime = now();
          const revision: CaresLinkV1DocumentRevisionResource = {
            revisionId,
            canonicalId,
            revisionNumber: stored.document.currentRevisionNumber + 1,
            baseRevisionId: request.baseRevisionId,
            privacyReviewId,
            content: clone(request.content),
            contentHash: request.contentHash,
            mutationId,
            contractVersion: CARESLINK_V1_CONTRACT_VERSION,
            schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
            createdAt: serverTime,
          };
          stored.revisions.push(revision);
          stored.document = {
            ...stored.document,
            currentRevisionId: revisionId,
            currentRevisionNumber: revision.revisionNumber,
            lifecycleStatus: "IN_PROGRESS",
            updatedAt: serverTime,
          };
          const response: CaresLinkV1AppendDocumentRevisionResponse = {
            document: stored.document,
            revision,
            saveState: CARESLINK_V1_SERVER_SAVE_ACK,
            lastMutationId: mutationId,
            serverTime,
          };
          recordMutation(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "APPEND_REVISION",
            fingerprint,
            response,
          );
          nextChangeSequence = recordChange(
            changes,
            changeCursorOwners,
            nextChangeSequence,
            ownerUserId,
            {
              kind: "DOCUMENT_UPSERTED",
              canonicalId,
              noteType: stored.document.noteType,
              revision,
              lastMutationId: mutationId,
              serverTime,
              deletedAt: null,
            },
          );

          return clone(response);
        },

        async saveCheckpoint(
          canonicalId: string,
          request: CaresLinkV1SaveCheckpointRequest,
          mutation: CaresLinkV1MutationHeaders,
        ): Promise<CaresLinkV1SaveCheckpointResponse> {
          const mutationId = validateMutation(mutation);
          const normalizedRequest = validateCheckpointRequest(request);
          const fingerprint = fingerprintMutation("SAVE_CHECKPOINT", {
            canonicalId,
            ...request,
          });
          const replay = replayMutation<CaresLinkV1SaveCheckpointResponse>(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "SAVE_CHECKPOINT",
            fingerprint,
          );
          if (replay) {
            return replay;
          }

          const stored = requireWritableOwnedDocument(
            documents,
            canonicalId,
            ownerUserId,
          );
          assertCurrentRevision(stored, normalizedRequest.baseRevisionId);
          if (
            normalizedRequest.activeRevisionId &&
            !stored.revisions.some(
              ({ revisionId }) =>
                revisionId === normalizedRequest.activeRevisionId,
            )
          ) {
            throw staleRevision(stored);
          }
          const serverTime = now();
          const checkpoint: CaresLinkV1DocumentCheckpointResource = {
            canonicalId,
            baseRevisionId: normalizedRequest.baseRevisionId,
            currentStep: normalizedRequest.currentStep,
            completedFieldCodes: normalizedRequest.completedFieldCodes,
            activeRevisionId:
              normalizedRequest.activeRevisionId ??
              stored.document.currentRevisionId,
            privacyReviewId: normalizedRequest.privacyReviewId ?? null,
            generationJobId: normalizedRequest.generationJobId ?? null,
            syncStatus: CARESLINK_V1_SERVER_SAVE_ACK,
            mutationId,
            updatedAt: serverTime,
          };
          stored.checkpoint = checkpoint;
          stored.document = { ...stored.document, updatedAt: serverTime };
          const response: CaresLinkV1SaveCheckpointResponse = {
            checkpoint,
            saveState: CARESLINK_V1_SERVER_SAVE_ACK,
            lastMutationId: mutationId,
            serverTime,
          };
          recordMutation(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "SAVE_CHECKPOINT",
            fingerprint,
            response,
          );
          const currentRevision = stored.revisions.at(-1);
          if (currentRevision) {
            nextChangeSequence = recordChange(
              changes,
              changeCursorOwners,
              nextChangeSequence,
              ownerUserId,
              {
                kind: "DOCUMENT_UPSERTED",
                canonicalId,
                noteType: stored.document.noteType,
                revision: currentRevision,
                lastMutationId: mutationId,
                serverTime,
                deletedAt: null,
              },
            );
          }

          return clone(response);
        },

        async tombstoneDocument(
          canonicalId: string,
          request: CaresLinkV1TombstoneDocumentRequest,
          mutation: CaresLinkV1MutationHeaders,
        ): Promise<CaresLinkV1TombstoneDocumentResponse> {
          const mutationId = validateMutation(mutation);
          const fingerprint = fingerprintMutation("TOMBSTONE_DOCUMENT", {
            canonicalId,
            ...request,
          });
          const replay = replayMutation<CaresLinkV1TombstoneDocumentResponse>(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "TOMBSTONE_DOCUMENT",
            fingerprint,
          );
          if (replay) {
            return replay;
          }

          const stored = requireWritableOwnedDocument(
            documents,
            canonicalId,
            ownerUserId,
          );
          assertCurrentRevision(stored, request.baseRevisionId);
          const serverTime = now();
          stored.document = {
            ...stored.document,
            lifecycleStatus: "TOMBSTONED",
            updatedAt: serverTime,
            deletedAt: serverTime,
          };
          const response: CaresLinkV1TombstoneDocumentResponse = {
            document: stored.document,
            saveState: CARESLINK_V1_SERVER_SAVE_ACK,
            lastMutationId: mutationId,
            serverTime,
          };
          recordMutation(
            mutationReceipts,
            ownerUserId,
            mutationId,
            "TOMBSTONE_DOCUMENT",
            fingerprint,
            response,
          );
          nextChangeSequence = recordChange(
            changes,
            changeCursorOwners,
            nextChangeSequence,
            ownerUserId,
            {
              kind: "DOCUMENT_TOMBSTONED",
              canonicalId,
              noteType: stored.document.noteType,
              revision: stored.revisions.at(-1) ?? null,
              lastMutationId: mutationId,
              serverTime,
              deletedAt: serverTime,
            },
          );

          return clone(response);
        },

        async pullChanges(
          request: CaresLinkV1PullChangesRequest = {},
        ): Promise<CaresLinkV1PullChangesResponse> {
          const limit = normalizeCaresLinkV1PageLimit(request.limit);
          const afterSequence = parseSyncCursor(request.cursor);
          if (
            afterSequence > 0 &&
            changeCursorOwners.get(afterSequence) !== ownerUserId
          ) {
            invalidRequest("Sync cursor is invalid for this owner");
          }
          const candidates = (changes.get(ownerUserId) ?? []).filter(
            ({ sequence }) => sequence > afterSequence,
          );
          const page = candidates.slice(0, limit);
          const hasMore = candidates.length > page.length;

          return {
            changes: clone(page.map(({ change }) => change)),
            nextCursor:
              page.length > 0
                ? createSyncCursor(page.at(-1)!.sequence)
                : request.cursor ?? null,
            hasMore,
          };
        },
      };
    },
  };
}

function validateMutation(mutation: CaresLinkV1MutationHeaders) {
  return assertCaresLinkV1IdempotencyKey(mutation.idempotencyKey);
}

function validatePrivacyReviewCommand(
  request: CaresLinkV1ConfirmPrivacyReviewCommand,
) {
  if (!(CARESLINK_V1_NOTE_TYPE_CODES as readonly string[]).includes(request.noteType)) {
    invalidRequest("Privacy review note type is unsupported");
  }
  assertCaresLinkV1ContentHash(request.cleanedFactsHash);
  validateSchemaVersion(request.schemaVersion);
  if (
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
  for (const decision of request.findingDecisions) {
    if (
      typeof decision.findingType !== "string" ||
      !(CARESLINK_V1_PRIVACY_FINDING_TYPES as readonly string[]).includes(
        decision.findingType,
      ) ||
      typeof decision.fieldCode !== "string" ||
      !decision.fieldCode.startsWith("/") ||
      !Number.isSafeInteger(decision.startOffset) ||
      !Number.isSafeInteger(decision.endOffset) ||
      decision.startOffset < 0 ||
      decision.endOffset <= decision.startOffset ||
      !(CARESLINK_V1_PRIVACY_DECISIONS as readonly string[]).includes(
        decision.decision,
      ) ||
      (decision.decision === "RETAINED_CONFIRMED" &&
        decision.retentionPurposeConfirmed !== true) ||
      (decision.decision !== "RETAINED_CONFIRMED" &&
        decision.retentionPurposeConfirmed !== undefined)
    ) {
      invalidRequest("Privacy review finding decision is invalid");
    }
  }
}

function requireValidPrivacyProof(input: {
  privacyProofs: Map<string, CaresLinkV1PrivacyProof>;
  privacyReviewId: string;
  ownerUserId: string;
  noteType: string;
  cleanedFactsHash: string;
  schemaVersion: string;
  now: string;
}) {
  const proof = input.privacyProofs.get(
    privacyProofKey(input.ownerUserId, input.privacyReviewId),
  );
  if (
    !proof ||
    proof.ownerUserId !== input.ownerUserId ||
    proof.noteType !== input.noteType ||
    proof.cleanedFactsHash !== input.cleanedFactsHash ||
    proof.schemaVersion !== input.schemaVersion ||
    proof.status !== "CONFIRMED" ||
    proof.scannerPolicyVersion !==
      CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION ||
    proof.reviewRevision !== CARESLINK_V1_PRIVACY_REVIEW_REVISION ||
    !Number.isFinite(Date.parse(input.now)) ||
    !Number.isFinite(Date.parse(proof.expiresAt)) ||
    Date.parse(proof.expiresAt) <= Date.parse(input.now)
  ) {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_STALE",
      "The privacy review proof no longer matches the cleaned facts being uploaded",
    );
  }
  return proof;
}

function validateRequiredPrivacyReviewId(value: unknown) {
  if (value === undefined || value === null || value === "") {
    throw new CaresLinkV1ContractError(
      "PRIVACY_REVIEW_REQUIRED",
      "A privacy review proof is required before upload",
    );
  }
  return validateUuid(value, "Privacy review ID");
}

function validateCheckpointRequest(request: CaresLinkV1SaveCheckpointRequest) {
  if (
    typeof request.currentStep !== "string" ||
    !SHORT_CODE_PATTERN.test(request.currentStep)
  ) {
    invalidRequest("Checkpoint current step is invalid");
  }
  if (
    !Array.isArray(request.completedFieldCodes) ||
    request.completedFieldCodes.length > 256 ||
    request.completedFieldCodes.some(
      (code) => typeof code !== "string" || !SHORT_CODE_PATTERN.test(code),
    )
  ) {
    invalidRequest("Checkpoint completed field codes are invalid");
  }
  return {
    baseRevisionId: validateUuid(
      request.baseRevisionId,
      "Checkpoint base revision ID",
    ),
    currentStep: request.currentStep,
    completedFieldCodes: [...new Set(request.completedFieldCodes)].sort(),
    ...(request.activeRevisionId === undefined
      ? {}
      : {
          activeRevisionId: validateUuid(
            request.activeRevisionId,
            "Checkpoint active revision ID",
          ),
        }),
    ...(request.privacyReviewId === undefined
      ? {}
      : {
          privacyReviewId: validateUuid(
            request.privacyReviewId,
            "Checkpoint privacy review ID",
          ),
        }),
    ...(request.generationJobId === undefined
      ? {}
      : {
          generationJobId: validateUuid(
            request.generationJobId,
            "Checkpoint generation job ID",
          ),
        }),
  };
}

function validateUuid(value: unknown, field: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invalidRequest(`${field} must be a UUID`);
  }
  return value.toLowerCase();
}

function invalidRequest(message: string): never {
  throw new CaresLinkV1ProductApiError("VALIDATION_ERROR", message);
}

function validateSchemaVersion(value: string) {
  if (value !== CARESLINK_V1_NOTE_SCHEMA_VERSION) {
    throw new CaresLinkV1ProductApiError(
      "VALIDATION_ERROR",
      "Unsupported note schema version",
    );
  }
}

function validateContentHash(content: CaresLinkV1NoteContent, hash: string) {
  assertCaresLinkV1ContentHash(hash);
  if (createContentHash(content) !== hash) {
    throw new CaresLinkV1ProductApiError(
      "VALIDATION_ERROR",
      "Content hash does not match the request content",
    );
  }
}

export function createCaresLinkV1ProductApiContentHash(
  content: CaresLinkV1NoteContent,
) {
  return createContentHash(content);
}

export function createCaresLinkV1CleanedFactsHash(
  cleanedFacts: CaresLinkV1JsonObject,
) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(cleanedFacts))
    .digest("hex");
}

function createContentHash(content: CaresLinkV1NoteContent) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(content))
    .digest("hex");
}

function requireOwnedDocument(
  documents: Map<string, StoredDocument>,
  canonicalId: string,
  ownerUserId: string,
) {
  const stored = documents.get(canonicalId);
  if (!stored || stored.ownerUserId !== ownerUserId) {
    throw new CaresLinkV1ProductApiError(
      "NOT_FOUND",
      "The requested document was not found",
    );
  }
  return stored;
}

function requireWritableOwnedDocument(
  documents: Map<string, StoredDocument>,
  canonicalId: string,
  ownerUserId: string,
) {
  const stored = requireOwnedDocument(documents, canonicalId, ownerUserId);
  if (
    stored.document.lifecycleStatus === "TOMBSTONED" ||
    stored.document.lifecycleStatus === "PURGED"
  ) {
    throw new CaresLinkV1ProductApiError(
      "INVALID_STATE_TRANSITION",
      "Tombstoned documents are not writable",
    );
  }
  return stored;
}

function assertCurrentRevision(
  stored: StoredDocument,
  baseRevisionId: string,
) {
  if (stored.document.currentRevisionId !== baseRevisionId) {
    throw staleRevision(stored);
  }
}

function staleRevision(stored: StoredDocument) {
  return new CaresLinkV1ProductApiError(
    "STALE_REVISION",
    "The document changed before this mutation was saved",
    {
      canonicalId: stored.document.canonicalId,
      currentRevisionId: stored.document.currentRevisionId,
      currentRevisionNumber: stored.document.currentRevisionNumber,
    },
  );
}

function replayMutation<T>(
  receipts: Map<string, MutationReceipt>,
  ownerUserId: string,
  mutationId: string,
  kind: MutationReceipt["kind"],
  fingerprint: string,
): T | undefined {
  const receipt = receipts.get(receiptKey(ownerUserId, mutationId));
  if (!receipt) {
    return undefined;
  }
  if (receipt.kind !== kind || receipt.fingerprint !== fingerprint) {
    throw new CaresLinkV1ProductApiError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for different input",
    );
  }
  return clone(receipt.response as T);
}

function recordMutation(
  receipts: Map<string, MutationReceipt>,
  ownerUserId: string,
  mutationId: string,
  kind: MutationReceipt["kind"],
  fingerprint: string,
  response: unknown,
) {
  receipts.set(receiptKey(ownerUserId, mutationId), {
    kind,
    fingerprint,
    response: clone(response),
  });
}

function recordChange(
  changes: Map<string, StoredChange[]>,
  changeCursorOwners: Map<number, string>,
  previousSequence: number,
  ownerUserId: string,
  change: CaresLinkV1Change,
) {
  const sequence = previousSequence + 1;
  changeCursorOwners.set(sequence, ownerUserId);
  const ownerChanges = changes.get(ownerUserId) ?? [];
  ownerChanges.push({ sequence, change: clone(change) });
  changes.set(ownerUserId, ownerChanges);
  return sequence;
}

function receiptKey(ownerUserId: string, mutationId: string) {
  return `${ownerUserId}:${mutationId}`;
}

function privacyProofKey(ownerUserId: string, privacyReviewId: string) {
  return `${ownerUserId}:${privacyReviewId}`;
}

function fingerprintMutation(kind: string, payload: unknown) {
  return createHash("sha256")
    .update(`${kind}:${stringifyCaresLinkV1CanonicalJson(payload)}`)
    .digest("hex");
}

function createDocumentCursor(canonicalId: string) {
  return `document.v1:${canonicalId}`;
}

function parseDocumentCursor(cursor: string | undefined) {
  if (!cursor) {
    return undefined;
  }
  const match = cursor.match(/^document\.v1:(.+)$/i);
  if (!match || !UUID_PATTERN.test(match[1])) {
    throw new CaresLinkV1ProductApiError(
      "VALIDATION_ERROR",
      "Document cursor is invalid",
    );
  }
  return match[1].toLowerCase();
}

function createSyncCursor(sequence: number) {
  return `sync.v1:${sequence}`;
}

function parseSyncCursor(cursor: string | undefined) {
  if (!cursor) {
    return 0;
  }
  const match = cursor.match(/^sync\.v1:(0|[1-9][0-9]*)$/);
  if (!match) {
    throw new CaresLinkV1ProductApiError(
      "VALIDATION_ERROR",
      "Sync cursor is invalid",
    );
  }
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value)) {
    throw new CaresLinkV1ProductApiError(
      "VALIDATION_ERROR",
      "Sync cursor is invalid",
    );
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isCaresLinkV1ProductApiContractError(
  error: unknown,
): error is CaresLinkV1ProductApiError | CaresLinkV1ContractError {
  return (
    error instanceof CaresLinkV1ProductApiError ||
    error instanceof CaresLinkV1ContractError
  );
}
