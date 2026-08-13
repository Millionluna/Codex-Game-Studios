import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { CaresLinkV1NoteContent } from "./shared-contracts";
import type { LegacyNdisNoteContent } from "./legacy-ndis-adapter";

export type NdisShadowProjectionStatus =
  | "PROJECTED"
  | "REPLAYED"
  | "UNCHANGED"
  | "STALE"
  | "FAILED";

export type NdisShadowComparisonStatus =
  | "MATCH"
  | "MISMATCH"
  | "MISSING"
  | "ERROR";

export type NdisShadowTombstoneStatus = "TOMBSTONED" | "MISSING";

export type NdisShadowProjectionInput = {
  ownerUserId: string;
  sourceDraftId: string;
  sourceStatus: "draft" | "reviewed" | "archived";
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
  sourceContentHash: string;
  privacyFingerprint: string;
  idempotencyKey: string;
  correlationId: string;
  /**
   * The legacy-only RPC may receive the explicitly read-only legacy payload.
   * That payload is not a current Product API NoteContent or revision.
   */
  content: CaresLinkV1NoteContent | LegacyNdisNoteContent;
  expectedBaseRevisionId?: string;
};

export type NdisShadowProjectionResult = {
  status: NdisShadowProjectionStatus;
  documentId?: string;
  revisionId?: string;
  revisionNumber?: number;
  sourceContentHash: string;
  failureCode?: string;
};

export type NdisShadowComparisonInput = {
  ownerUserId: string;
  sourceDraftId: string;
  expectedContentHash: string;
  correlationId: string;
};

export type NdisShadowComparisonResult = {
  status: NdisShadowComparisonStatus;
  documentId?: string;
  revisionId?: string;
  expectedContentHash: string;
  actualContentHash?: string;
  failureCode?: string;
};

export type NdisShadowTombstoneInput = {
  ownerUserId: string;
  sourceDraftId: string;
  sourceCreatedAt: string;
  correlationId: string;
};

export type NdisShadowTombstoneResult = {
  status: NdisShadowTombstoneStatus;
  tombstonedCount: number;
};

export type NdisShadowReconciliationRecord = {
  ownerUserId: string;
  sourceDraftId: string;
  sourceUpdatedAt: string;
  status: "CURRENT" | "STALE" | "MISSING" | "FAILED";
  outboxStatus?: string;
  failureCode?: string;
  documentId?: string;
  revisionId?: string;
};

export type NdisShadowRepository = {
  kind: "supabase-shadow";
  project(
    input: NdisShadowProjectionInput,
  ): Promise<NdisShadowProjectionResult>;
  compare(
    input: NdisShadowComparisonInput,
  ): Promise<NdisShadowComparisonResult>;
  tombstoneDeleted(
    input: NdisShadowTombstoneInput,
  ): Promise<NdisShadowTombstoneResult>;
  listReconciliation(input?: {
    ownerUserId?: string;
    limit?: number;
  }): Promise<NdisShadowReconciliationRecord[]>;
};

type NdisShadowRepositoryEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type SupabaseRpcError = {
  message?: string;
  code?: string;
};

type SupabaseRpcClient = {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: SupabaseRpcError | null }>;
};

type SupabaseRpcClientFactory = (
  url: string,
  serviceRoleKey: string,
) => SupabaseRpcClient;

export const NDIS_SHADOW_RPC = {
  project: "project_ndis_legacy_shadow",
  compare: "compare_ndis_legacy_shadow",
  tombstone: "tombstone_deleted_ndis_shadow",
  reconciliation: "audit_ndis_shadow_reconciliation",
} as const;

export function createNdisShadowRepositoryFromEnv(
  env: NdisShadowRepositoryEnv = process.env as NdisShadowRepositoryEnv,
  createClient: SupabaseRpcClientFactory = createSupabaseRpcClient,
): NdisShadowRepository {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Persistent NDIS shadow storage is not configured");
  }

  return createNdisShadowRepository(createClient(supabaseUrl, serviceRoleKey));
}

export function createNdisShadowRepository(
  client: SupabaseRpcClient,
): NdisShadowRepository {
  return {
    kind: "supabase-shadow",
    async project(input) {
      const data = await callRpc(client, NDIS_SHADOW_RPC.project, {
        p_owner_user_id: input.ownerUserId,
        p_source_draft_id: input.sourceDraftId,
        p_source_status: input.sourceStatus,
        p_source_created_at: input.sourceCreatedAt,
        p_source_updated_at: input.sourceUpdatedAt,
        p_source_content_hash: input.sourceContentHash,
        p_privacy_fingerprint: input.privacyFingerprint,
        p_idempotency_key: input.idempotencyKey,
        p_correlation_id: input.correlationId,
        p_content: input.content,
        p_expected_base_revision_id:
          input.expectedBaseRevisionId ?? null,
      });

      return parseProjectionResult(data, input.sourceContentHash);
    },
    async compare(input) {
      const data = await callRpc(client, NDIS_SHADOW_RPC.compare, {
        p_owner_user_id: input.ownerUserId,
        p_source_draft_id: input.sourceDraftId,
        p_expected_content_hash: input.expectedContentHash,
        p_correlation_id: input.correlationId,
      });

      return parseComparisonResult(data, input.expectedContentHash);
    },
    async tombstoneDeleted(input) {
      const data = await callRpc(client, NDIS_SHADOW_RPC.tombstone, {
        p_owner_user_id: input.ownerUserId,
        p_source_draft_id: input.sourceDraftId,
        p_source_created_at: input.sourceCreatedAt,
        p_correlation_id: input.correlationId,
      });

      return parseTombstoneResult(data);
    },
    async listReconciliation({ ownerUserId, limit = 100 } = {}) {
      const data = await callRpc(client, NDIS_SHADOW_RPC.reconciliation, {
        p_owner_user_id: ownerUserId ?? null,
        p_limit: Math.min(Math.max(Math.trunc(limit), 1), 500),
      });

      if (!Array.isArray(data)) {
        throw new Error("NDIS shadow reconciliation response is invalid");
      }

      return data.map(parseReconciliationRecord);
    },
  };
}

async function callRpc(
  client: SupabaseRpcClient,
  functionName: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(functionName, args);

  if (error) {
    const code = error.code ? ` (${error.code})` : "";
    throw new Error(`NDIS shadow RPC failed${code}`);
  }

  return data;
}

function parseProjectionResult(
  value: unknown,
  expectedContentHash: string,
): NdisShadowProjectionResult {
  const record = getRecord(value, "projection");
  const status = record.status;
  const sourceContentHash = record.sourceContentHash;

  if (!isProjectionStatus(status) || sourceContentHash !== expectedContentHash) {
    throw new Error("NDIS shadow projection response is invalid");
  }

  return {
    status,
    documentId: getOptionalString(record.documentId),
    revisionId: getOptionalString(record.revisionId),
    revisionNumber: getOptionalPositiveInteger(record.revisionNumber),
    sourceContentHash,
    failureCode: getOptionalSafeCode(record.failureCode),
  };
}

function parseComparisonResult(
  value: unknown,
  expectedContentHash: string,
): NdisShadowComparisonResult {
  const record = getRecord(value, "comparison");
  const status = record.status;

  if (
    !isComparisonStatus(status) ||
    record.expectedContentHash !== expectedContentHash
  ) {
    throw new Error("NDIS shadow comparison response is invalid");
  }

  return {
    status,
    documentId: getOptionalString(record.documentId),
    revisionId: getOptionalString(record.revisionId),
    expectedContentHash,
    actualContentHash: getOptionalHash(record.actualContentHash),
    failureCode: getOptionalSafeCode(record.failureCode),
  };
}

function parseTombstoneResult(value: unknown): NdisShadowTombstoneResult {
  const record = getRecord(value, "tombstone");
  const status = record.status;
  const tombstonedCount = record.tombstonedCount;

  if (
    !isTombstoneStatus(status) ||
    typeof tombstonedCount !== "number" ||
    !Number.isSafeInteger(tombstonedCount) ||
    tombstonedCount < 0 ||
    (status === "TOMBSTONED" && tombstonedCount > 1) ||
    (status === "MISSING" && tombstonedCount !== 0)
  ) {
    throw new Error("NDIS shadow tombstone response is invalid");
  }

  return { status, tombstonedCount };
}

function parseReconciliationRecord(value: unknown) {
  const record = getRecord(value, "reconciliation");
  const status = record.status;

  if (
    typeof record.ownerUserId !== "string" ||
    typeof record.sourceDraftId !== "string" ||
    typeof record.sourceUpdatedAt !== "string" ||
    !isReconciliationStatus(status)
  ) {
    throw new Error("NDIS shadow reconciliation row is invalid");
  }

  return {
    ownerUserId: record.ownerUserId,
    sourceDraftId: record.sourceDraftId,
    sourceUpdatedAt: record.sourceUpdatedAt,
    status,
    outboxStatus: getOptionalSafeCode(record.outboxStatus),
    failureCode: getOptionalSafeCode(record.failureCode),
    documentId: getOptionalString(record.documentId),
    revisionId: getOptionalString(record.revisionId),
  } satisfies NdisShadowReconciliationRecord;
}

function getRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`NDIS shadow ${label} response is invalid`);
  }

  return value as Record<string, unknown>;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function getOptionalPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function getOptionalHash(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
    ? value
    : undefined;
}

function getOptionalSafeCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value)
    ? value
    : undefined;
}

function isProjectionStatus(value: unknown): value is NdisShadowProjectionStatus {
  return (
    value === "PROJECTED" ||
    value === "REPLAYED" ||
    value === "UNCHANGED" ||
    value === "STALE" ||
    value === "FAILED"
  );
}

function isComparisonStatus(value: unknown): value is NdisShadowComparisonStatus {
  return (
    value === "MATCH" ||
    value === "MISMATCH" ||
    value === "MISSING" ||
    value === "ERROR"
  );
}

function isTombstoneStatus(value: unknown): value is NdisShadowTombstoneStatus {
  return value === "TOMBSTONED" || value === "MISSING";
}

function isReconciliationStatus(
  value: unknown,
): value is NdisShadowReconciliationRecord["status"] {
  return (
    value === "CURRENT" ||
    value === "STALE" ||
    value === "MISSING" ||
    value === "FAILED"
  );
}

function createSupabaseRpcClient(url: string, serviceRoleKey: string) {
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as SupabaseRpcClient;
}
