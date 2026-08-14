import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
  type CaresLinkV1CleanedFacts,
  type CaresLinkV1DocumentLifecycleStatus,
  type CaresLinkV1ErrorCode,
  type CaresLinkV1ErrorEnvelope,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteContent,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1PrivacyFindingDecision,
  type CaresLinkV1PrivacyFindingLocator,
  type CaresLinkV1PrivacyProof,
  type CaresLinkV1SelfReviewStatus,
  type CaresLinkV1SyncStatus,
} from "./shared-contracts";

export const CARESLINK_V1_TRANSPORT_IMPLEMENTATION_STATUS =
  "DURABLE_ADAPTER_DEFAULT_DISABLED_SHADOW" as const;
export const CARESLINK_V1_MINIMUM_CLIENT_VERSION = "1.0.0" as const;

export const CARESLINK_V1_HEADER_NAMES = {
  authorization: "authorization",
  contractVersion: "x-careslink-contract-version",
  clientVersion: "x-careslink-client-version",
  minimumClientVersion: "x-careslink-min-client-version",
  correlationId: "x-correlation-id",
  idempotencyKey: "idempotency-key",
} as const;

export const CARESLINK_V1_PRODUCT_API_PATHS = {
  me: "/v1/me",
  documents: "/v1/documents",
  document: "/v1/documents/{documentId}",
  checkpoint: "/v1/documents/{documentId}/checkpoint",
  privacyReviews: "/v1/privacy-reviews",
  syncPull: "/v1/sync/pull",
  syncPush: "/v1/sync/push",
} as const;

export const CARESLINK_V1_PRODUCT_API_METHODS = {
  getMe: "GET",
  confirmPrivacyReview: "POST",
  listDocuments: "GET",
  createDocument: "POST",
  getDocument: "GET",
  appendDocumentRevision: "PATCH",
  saveCheckpoint: "PUT",
  tombstoneDocument: "DELETE",
  pullChanges: "GET",
} as const;

export const CARESLINK_V1_SYNC_BOUNDARIES = {
  push: {
    path: CARESLINK_V1_PRODUCT_API_PATHS.syncPush,
    method: "POST",
    availability: "NOT_IMPLEMENTED",
    served: false,
  },
} as const;

export const CARESLINK_V1_AUTH_BOUNDARIES = {
  nativePkceCallback: {
    path: "/v1/auth/native/callback",
    availability: "NOT_IMPLEMENTED",
  },
  sessions: {
    path: "/v1/auth/sessions",
    availability: "NOT_IMPLEMENTED",
  },
  devices: {
    path: "/v1/auth/devices",
    availability: "NOT_IMPLEMENTED",
  },
  revokeSession: {
    path: "/v1/auth/sessions/{sessionId}/revoke",
    availability: "NOT_IMPLEMENTED",
  },
  revokeAllSessions: {
    path: "/v1/auth/sessions/revoke-all",
    availability: "NOT_IMPLEMENTED",
  },
} as const;

export const CARESLINK_V1_MUTATION_KINDS = [
  "CREATE_DOCUMENT",
  "APPEND_REVISION",
  "SAVE_CHECKPOINT",
  "TOMBSTONE_DOCUMENT",
] as const;
export type CaresLinkV1MutationKind =
  (typeof CARESLINK_V1_MUTATION_KINDS)[number];

export const CARESLINK_V1_CHANGE_KINDS = [
  "DOCUMENT_UPSERTED",
  "DOCUMENT_TOMBSTONED",
] as const;
export type CaresLinkV1ChangeKind =
  (typeof CARESLINK_V1_CHANGE_KINDS)[number];

export const CARESLINK_V1_MOBILE_SAVE_STATES = [
  "SAVED_ON_DEVICE",
  "SYNCING",
  "SAVED_TO_CARESLINK",
  "NEEDS_ATTENTION",
] as const;
export type CaresLinkV1MobileSaveState =
  (typeof CARESLINK_V1_MOBILE_SAVE_STATES)[number];

export const CARESLINK_V1_SERVER_SAVE_ACK = "SERVER_ACKNOWLEDGED" as const;
export type CaresLinkV1ServerSaveAck =
  typeof CARESLINK_V1_SERVER_SAVE_ACK;

export const CARESLINK_V1_MUTATION_TRANSPORT_POLICY = {
  contentType: "application/json",
  cookieOrigin: "SAME_ORIGIN_HTTPS_REQUIRED",
  bearerOrigin: "NOT_REQUIRED",
} as const;

export type CaresLinkV1AuthTransport = "BEARER" | "COOKIE";

/**
 * Client-memory-only auth context. `accessToken` is transport material: callers
 * place it only in the Authorization header and must never serialize this
 * object into request bodies, drafts, outboxes, URLs, logs, analytics or errors.
 */
export type CaresLinkV1MobileAuthContext = Readonly<{
  userId: string;
  sessionId: string;
  accessToken: string;
}>;

/** Server-derived identity. It is never accepted from a Product API body. */
export type CaresLinkV1AuthenticatedPrincipal = Readonly<{
  userId: string;
  sessionId: string;
  transport: CaresLinkV1AuthTransport;
}>;

export type CaresLinkV1RequestVersionHeaders = Readonly<{
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  clientVersion: string;
  correlationId?: string;
}>;

export type CaresLinkV1ResponseVersionHeaders = Readonly<{
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  minimumClientVersion: typeof CARESLINK_V1_MINIMUM_CLIENT_VERSION;
  correlationId: string;
}>;

/** Mutation metadata maps to headers; it is intentionally outside every body. */
export type CaresLinkV1MutationHeaders = Readonly<{
  idempotencyKey: string;
}>;

export type CaresLinkV1MeResponse = {
  userId: string;
  sessionId: string;
  authTransport: CaresLinkV1AuthTransport;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  capabilities: {
    nativePkceCallback: false;
    sessionManagement: false;
    deviceManagement: false;
    sessionRevocation: false;
  };
};

/**
 * Public HTTP request. `cleanedFacts` is the user's confirmed structured facts,
 * never an unreviewed paste or generated note wording.
 */
export type CaresLinkV1ConfirmPrivacyReviewRequest = {
  noteType: CaresLinkV1NoteTypeCode;
  cleanedFacts: CaresLinkV1CleanedFacts;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  findingDecisions: CaresLinkV1PrivacyFindingDecision[];
  deIdentificationConfirmed: true;
  authorityToProcessConfirmed: true;
};

/** Internal command produced only after the server scanner accepts the body. */
export type CaresLinkV1ConfirmPrivacyReviewCommand = Omit<
  CaresLinkV1ConfirmPrivacyReviewRequest,
  "cleanedFacts"
> & {
  cleanedFactsHash: string;
  scannerPolicyVersion: "2026-08-11.preview.1";
  reviewRevision: 1;
};

export type CaresLinkV1ConfirmPrivacyReviewResponse = Omit<
  CaresLinkV1PrivacyProof,
  "status"
> & { status: "CONFIRMED" };

export type CaresLinkV1DocumentResource = {
  canonicalId: string;
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  lifecycleStatus: CaresLinkV1DocumentLifecycleStatus;
  currentRevisionId: string | null;
  currentRevisionNumber: number;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CaresLinkV1DocumentRevisionResource = {
  revisionId: string;
  canonicalId: string;
  revisionNumber: number;
  baseRevisionId: string | null;
  privacyReviewId: string | null;
  content: CaresLinkV1NoteContent;
  contentHash: string;
  mutationId: string;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  createdAt: string;
};

export type CaresLinkV1DocumentCheckpointResource = {
  canonicalId: string;
  baseRevisionId: string | null;
  currentStep: string;
  completedFieldCodes: string[];
  activeRevisionId: string | null;
  privacyReviewId: string | null;
  generationJobId: string | null;
  syncStatus: CaresLinkV1SyncStatus;
  mutationId: string;
  updatedAt: string;
};

export type CaresLinkV1CreateDocumentRequest = {
  noteType: CaresLinkV1NoteTypeCode;
  sourceLocale: CaresLinkV1Locale;
  content: CaresLinkV1NoteContent;
  contentHash: string;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  privacyReviewId: string;
};

export type CaresLinkV1CreateDocumentResponse = {
  document: CaresLinkV1DocumentResource;
  revision: CaresLinkV1DocumentRevisionResource;
  saveState: CaresLinkV1ServerSaveAck;
  lastMutationId: string;
  serverTime: string;
};

export type CaresLinkV1ListDocumentsRequest = {
  cursor?: string;
  limit?: number;
};

export type CaresLinkV1ListDocumentsResponse = {
  documents: CaresLinkV1DocumentResource[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CaresLinkV1GetDocumentResponse = {
  document: CaresLinkV1DocumentResource;
  revisions: CaresLinkV1DocumentRevisionResource[];
  checkpoint: CaresLinkV1DocumentCheckpointResource | null;
  selfReviewStatus: CaresLinkV1SelfReviewStatus;
};

export type CaresLinkV1AppendDocumentRevisionRequest = {
  baseRevisionId: string;
  content: CaresLinkV1NoteContent;
  contentHash: string;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  privacyReviewId: string;
};

export type CaresLinkV1AppendDocumentRevisionResponse = {
  document: CaresLinkV1DocumentResource;
  revision: CaresLinkV1DocumentRevisionResource;
  saveState: CaresLinkV1ServerSaveAck;
  lastMutationId: string;
  serverTime: string;
};

export type CaresLinkV1SaveCheckpointRequest = {
  baseRevisionId: string;
  currentStep: string;
  completedFieldCodes: string[];
  activeRevisionId?: string;
  privacyReviewId?: string;
  generationJobId?: string;
};

export type CaresLinkV1SaveCheckpointResponse = {
  checkpoint: CaresLinkV1DocumentCheckpointResource;
  saveState: CaresLinkV1ServerSaveAck;
  lastMutationId: string;
  serverTime: string;
};

export type CaresLinkV1TombstoneDocumentRequest = {
  baseRevisionId: string;
  reasonCode?: string;
};

export type CaresLinkV1TombstoneDocumentResponse = {
  document: CaresLinkV1DocumentResource;
  saveState: CaresLinkV1ServerSaveAck;
  lastMutationId: string;
  serverTime: string;
};

export type CaresLinkV1PullChangesRequest = {
  cursor?: string;
  limit?: number;
};

type CaresLinkV1ChangeBase = {
  canonicalId: string;
  /** Owning document type required to validate the detached revision payload. */
  noteType: CaresLinkV1NoteTypeCode;
  lastMutationId: string;
  serverTime: string;
};

export type CaresLinkV1DocumentUpsertedChange = CaresLinkV1ChangeBase & {
  kind: "DOCUMENT_UPSERTED";
  revision: CaresLinkV1DocumentRevisionResource;
  deletedAt: null;
};

export type CaresLinkV1DocumentTombstonedChange = CaresLinkV1ChangeBase & {
  kind: "DOCUMENT_TOMBSTONED";
  revision: CaresLinkV1DocumentRevisionResource | null;
  deletedAt: string;
};

export type CaresLinkV1Change =
  | CaresLinkV1DocumentUpsertedChange
  | CaresLinkV1DocumentTombstonedChange;

export type CaresLinkV1PullChangesResponse = {
  changes: CaresLinkV1Change[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CaresLinkV1ConflictDetails = {
  canonicalId: string;
  currentRevisionId: string | null;
  currentRevisionNumber: number;
};

export const CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE = {
  PRODUCT_API_DISABLED: 503,
  VALIDATION_ERROR: 400,
  AUTH_REQUIRED: 401,
  SESSION_REVOKED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NOT_IMPLEMENTED: 501,
  IDENTITY_LINK_CONFLICT: 409,
  MINIMUM_FACTS_REQUIRED: 422,
  PRIVACY_REVIEW_REQUIRED: 422,
  PRIVACY_REVIEW_STALE: 409,
  POINTS_INSUFFICIENT: 409,
  POINT_QUOTE_EXPIRED: 409,
  PURCHASE_PENDING: 409,
  STALE_REVISION: 409,
  RATE_LIMITED: 429,
  GENERATION_FAILED: 502,
  TRANSCRIPTION_FAILED: 502,
  EXPORT_FAILED: 502,
  EXPORT_EXPIRED: 410,
  CONTENT_WITHDRAWN: 410,
  OFFLINE_NOT_SUPPORTED: 409,
  MIN_CLIENT_VERSION: 426,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
} as const satisfies Record<CaresLinkV1ErrorCode, number>;

export type CaresLinkV1ProductApi = {
  getMe(): Promise<CaresLinkV1MeResponse>;
  confirmPrivacyReview(
    request: CaresLinkV1ConfirmPrivacyReviewCommand,
    mutation: CaresLinkV1MutationHeaders,
  ): Promise<CaresLinkV1ConfirmPrivacyReviewResponse>;
  listDocuments(
    request?: CaresLinkV1ListDocumentsRequest,
  ): Promise<CaresLinkV1ListDocumentsResponse>;
  createDocument(
    request: CaresLinkV1CreateDocumentRequest,
    mutation: CaresLinkV1MutationHeaders,
  ): Promise<CaresLinkV1CreateDocumentResponse>;
  getDocument(canonicalId: string): Promise<CaresLinkV1GetDocumentResponse>;
  appendDocumentRevision(
    canonicalId: string,
    request: CaresLinkV1AppendDocumentRevisionRequest,
    mutation: CaresLinkV1MutationHeaders,
  ): Promise<CaresLinkV1AppendDocumentRevisionResponse>;
  saveCheckpoint(
    canonicalId: string,
    request: CaresLinkV1SaveCheckpointRequest,
    mutation: CaresLinkV1MutationHeaders,
  ): Promise<CaresLinkV1SaveCheckpointResponse>;
  tombstoneDocument(
    canonicalId: string,
    request: CaresLinkV1TombstoneDocumentRequest,
    mutation: CaresLinkV1MutationHeaders,
  ): Promise<CaresLinkV1TombstoneDocumentResponse>;
  pullChanges(
    request?: CaresLinkV1PullChangesRequest,
  ): Promise<CaresLinkV1PullChangesResponse>;
};

export function createCaresLinkV1TransportError(input: {
  code: CaresLinkV1ErrorCode;
  message: string;
  correlationId: string;
  fieldCodes?: string[];
  conflict?: CaresLinkV1ConflictDetails;
  privacyFindings?: CaresLinkV1PrivacyFindingLocator[];
}): CaresLinkV1ErrorEnvelope {
  return {
    error: {
      code: input.code,
      message: input.message,
      correlationId: input.correlationId,
      ...(input.fieldCodes ? { fieldCodes: input.fieldCodes } : {}),
      ...(input.conflict ? { conflict: input.conflict } : {}),
      ...(input.privacyFindings
        ? { privacyFindings: input.privacyFindings }
        : {}),
    },
  };
}

export function assertCaresLinkV1ContentHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "Content hash must be a 64-character lowercase SHA-256 digest",
    );
  }

  return value;
}

export function normalizeCaresLinkV1PageLimit(value: number | undefined) {
  if (value === undefined) {
    return 50;
  }

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "Page limit must be an integer between 1 and 100",
    );
  }

  return value;
}
