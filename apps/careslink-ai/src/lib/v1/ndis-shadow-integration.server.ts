import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { GeneratedMaterialDraftRecord } from "../generated-material-draft-store";
import { projectLegacyNdisDraftToCanonical } from "./legacy-ndis-adapter";
import {
  getCaresLinkV1NdisShadowTimeoutMs,
  resolveCaresLinkV1NdisShadowGuard,
  type CaresLinkV1NdisShadowEnv,
} from "./ndis-shadow-guard";
import {
  createNdisShadowRepositoryFromEnv,
  type NdisShadowComparisonStatus,
  type NdisShadowProjectionStatus,
  type NdisShadowRepository,
  type NdisShadowTombstoneStatus,
} from "./ndis-shadow-repository.server";

type NdisShadowLogRecord = {
  event: "ndis_shadow_write" | "ndis_shadow_read" | "ndis_shadow_tombstone";
  correlationId: string;
  sourceRefHash: string;
  status: string;
  failureCode?: string;
};

export type NdisShadowLogger = {
  info(record: NdisShadowLogRecord): void;
  warn(record: NdisShadowLogRecord): void;
};

export type NdisShadowIntegrationResult = {
  enabled: boolean;
  guardReason: string;
  correlationId?: string;
  writeStatus?: NdisShadowProjectionStatus | "ERROR" | "TIMEOUT";
  readStatus?: NdisShadowComparisonStatus | "DISABLED" | "ERROR" | "TIMEOUT";
};

export type NdisShadowTombstoneIntegrationResult = {
  enabled: boolean;
  guardReason: string;
  correlationId?: string;
  tombstoneStatus?: NdisShadowTombstoneStatus | "ERROR" | "TIMEOUT";
  tombstonedCount?: number;
};

export async function mirrorSavedNdisDraftToCanonicalShadow({
  legacyDraft,
  privacyFingerprint,
  expectedBaseRevisionId,
  env = process.env as CaresLinkV1NdisShadowEnv,
  repository,
  logger = defaultLogger,
  correlationId = randomUUID(),
}: {
  legacyDraft: GeneratedMaterialDraftRecord;
  privacyFingerprint: string;
  expectedBaseRevisionId?: string;
  env?: CaresLinkV1NdisShadowEnv;
  repository?: NdisShadowRepository;
  logger?: NdisShadowLogger;
  correlationId?: string;
}): Promise<NdisShadowIntegrationResult> {
  const guard = resolveCaresLinkV1NdisShadowGuard(env);
  const sourceRefHash = createNdisShadowSourceRefHash(legacyDraft.id);

  if (!guard.enabled) {
    logSafely(logger, "info", {
      event: "ndis_shadow_write",
      correlationId,
      sourceRefHash,
      status: "DISABLED",
      failureCode: `GUARD_${guard.reason.toUpperCase()}`,
    });
    return { enabled: false, guardReason: guard.reason };
  }

  const timeoutMs = getCaresLinkV1NdisShadowTimeoutMs(env);
  let projection: ReturnType<typeof projectLegacyNdisDraftToCanonical>;

  try {
    projection = projectLegacyNdisDraftToCanonical(legacyDraft);
  } catch {
    logSafely(logger, "warn", {
      event: "ndis_shadow_write",
      correlationId,
      sourceRefHash,
      status: "ERROR",
      failureCode: "PROJECTION_ERROR",
    });
    return {
      enabled: true,
      guardReason: guard.reason,
      correlationId,
      writeStatus: "ERROR",
      readStatus: guard.shadowReadEnabled ? "MISSING" : "DISABLED",
    };
  }

  const idempotencyKey = createNdisShadowIdempotencyKey({
    ownerUserId: legacyDraft.userId,
    sourceDraftId: legacyDraft.id,
    sourceCreatedAt: legacyDraft.createdAt,
    sourceStatus: legacyDraft.status,
    sourceUpdatedAt: legacyDraft.updatedAt,
    contentHash: projection.revision.contentHash,
  });
  let shadowRepository: NdisShadowRepository;

  try {
    shadowRepository = repository ?? createNdisShadowRepositoryFromEnv(env);
  } catch {
    logSafely(logger, "warn", {
      event: "ndis_shadow_write",
      correlationId,
      sourceRefHash,
      status: "ERROR",
      failureCode: "SHADOW_NOT_CONFIGURED",
    });
    return {
      enabled: true,
      guardReason: guard.reason,
      correlationId,
      writeStatus: "ERROR",
      readStatus: guard.shadowReadEnabled ? "ERROR" : "DISABLED",
    };
  }

  let writeStatus: NdisShadowIntegrationResult["writeStatus"];

  try {
    const result = await withTimeout(
      shadowRepository.project({
        ownerUserId: legacyDraft.userId,
        sourceDraftId: legacyDraft.id,
        sourceStatus: legacyDraft.status,
        sourceCreatedAt: legacyDraft.createdAt,
        sourceUpdatedAt: legacyDraft.updatedAt,
        sourceContentHash: projection.revision.contentHash,
        privacyFingerprint,
        idempotencyKey,
        correlationId,
        content: projection.revision.content,
        expectedBaseRevisionId,
      }),
      timeoutMs,
    );
    writeStatus = result.status;
    const level =
      result.status === "FAILED" || result.status === "STALE" ? "warn" : "info";
    logSafely(logger, level, {
      event: "ndis_shadow_write",
      correlationId,
      sourceRefHash,
      status: result.status,
      failureCode: result.failureCode,
    });
  } catch (error) {
    writeStatus = isTimeoutError(error) ? "TIMEOUT" : "ERROR";
    logSafely(logger, "warn", {
      event: "ndis_shadow_write",
      correlationId,
      sourceRefHash,
      status: writeStatus,
      failureCode:
        writeStatus === "TIMEOUT" ? "SHADOW_TIMEOUT" : "SHADOW_WRITE_ERROR",
    });
  }

  if (!guard.shadowReadEnabled) {
    return {
      enabled: true,
      guardReason: guard.reason,
      correlationId,
      writeStatus,
      readStatus: "DISABLED",
    };
  }

  if (
    writeStatus === "FAILED" ||
    writeStatus === "STALE" ||
    writeStatus === "ERROR" ||
    writeStatus === "TIMEOUT"
  ) {
    return {
      enabled: true,
      guardReason: guard.reason,
      correlationId,
      writeStatus,
      readStatus: "MISSING",
    };
  }

  let readStatus: NdisShadowIntegrationResult["readStatus"];

  try {
    const comparison = await withTimeout(
      shadowRepository.compare({
        ownerUserId: legacyDraft.userId,
        sourceDraftId: legacyDraft.id,
        expectedContentHash: projection.revision.contentHash,
        correlationId,
      }),
      timeoutMs,
    );
    readStatus = comparison.status;
    const level = comparison.status === "MATCH" ? "info" : "warn";
    logSafely(logger, level, {
      event: "ndis_shadow_read",
      correlationId,
      sourceRefHash,
      status: comparison.status,
      failureCode: comparison.failureCode,
    });
  } catch (error) {
    readStatus = isTimeoutError(error) ? "TIMEOUT" : "ERROR";
    logSafely(logger, "warn", {
      event: "ndis_shadow_read",
      correlationId,
      sourceRefHash,
      status: readStatus,
      failureCode:
        readStatus === "TIMEOUT" ? "SHADOW_TIMEOUT" : "SHADOW_READ_ERROR",
    });
  }

  return {
    enabled: true,
    guardReason: guard.reason,
    correlationId,
    writeStatus,
    readStatus,
  };
}

export async function tombstoneDeletedNdisShadowFromCanonical({
  ownerUserId,
  sourceDraftId,
  sourceCreatedAt,
  env = process.env as CaresLinkV1NdisShadowEnv,
  repository,
  logger = defaultLogger,
  correlationId,
}: {
  ownerUserId: string;
  sourceDraftId: string;
  sourceCreatedAt: string;
  env?: CaresLinkV1NdisShadowEnv;
  repository?: NdisShadowRepository;
  logger?: NdisShadowLogger;
  correlationId?: string;
}): Promise<NdisShadowTombstoneIntegrationResult> {
  let resolvedCorrelationId: string | undefined = correlationId;
  let sourceRefHash = "unavailable";

  try {
    resolvedCorrelationId ??= randomUUID();
    sourceRefHash = createNdisShadowSourceRefHash(sourceDraftId);

    const guard = resolveCaresLinkV1NdisShadowGuard(env);

    if (!guard.enabled) {
      logSafely(logger, "info", {
        event: "ndis_shadow_tombstone",
        correlationId: resolvedCorrelationId,
        sourceRefHash,
        status: "DISABLED",
        failureCode: `GUARD_${guard.reason.toUpperCase()}`,
      });
      return {
        enabled: false,
        guardReason: guard.reason,
        correlationId: resolvedCorrelationId,
      };
    }

    const timeoutMs = getCaresLinkV1NdisShadowTimeoutMs(env);
    let shadowRepository: NdisShadowRepository;

    try {
      shadowRepository = repository ?? createNdisShadowRepositoryFromEnv(env);
    } catch {
      logSafely(logger, "warn", {
        event: "ndis_shadow_tombstone",
        correlationId: resolvedCorrelationId,
        sourceRefHash,
        status: "ERROR",
        failureCode: "SHADOW_NOT_CONFIGURED",
      });
      return {
        enabled: true,
        guardReason: guard.reason,
        correlationId: resolvedCorrelationId,
        tombstoneStatus: "ERROR",
      };
    }

    try {
      const result = await withTimeout(
        shadowRepository.tombstoneDeleted({
          ownerUserId,
          sourceDraftId,
          sourceCreatedAt,
          correlationId: resolvedCorrelationId,
        }),
        timeoutMs,
      );
      logSafely(logger, "info", {
        event: "ndis_shadow_tombstone",
        correlationId: resolvedCorrelationId,
        sourceRefHash,
        status: result.status,
      });
      return {
        enabled: true,
        guardReason: guard.reason,
        correlationId: resolvedCorrelationId,
        tombstoneStatus: result.status,
        tombstonedCount: result.tombstonedCount,
      };
    } catch (error) {
      const tombstoneStatus = isTimeoutError(error) ? "TIMEOUT" : "ERROR";
      logSafely(logger, "warn", {
        event: "ndis_shadow_tombstone",
        correlationId: resolvedCorrelationId,
        sourceRefHash,
        status: tombstoneStatus,
        failureCode:
          tombstoneStatus === "TIMEOUT"
            ? "SHADOW_TIMEOUT"
            : "SHADOW_TOMBSTONE_ERROR",
      });
      return {
        enabled: true,
        guardReason: guard.reason,
        correlationId: resolvedCorrelationId,
        tombstoneStatus,
      };
    }
  } catch {
    logSafely(logger, "warn", {
      event: "ndis_shadow_tombstone",
      correlationId: resolvedCorrelationId ?? "unavailable",
      sourceRefHash,
      status: "ERROR",
      failureCode: "SHADOW_INTEGRATION_ERROR",
    });
    return {
      enabled: false,
      guardReason: "integration_error",
      correlationId: resolvedCorrelationId,
      tombstoneStatus: "ERROR",
    };
  }
}

export function createNdisShadowIdempotencyKey({
  ownerUserId,
  sourceDraftId,
  sourceCreatedAt,
  sourceStatus,
  sourceUpdatedAt,
  contentHash,
}: {
  ownerUserId: string;
  sourceDraftId: string;
  sourceCreatedAt: string;
  sourceStatus: GeneratedMaterialDraftRecord["status"];
  sourceUpdatedAt: string;
  contentHash: string;
}) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        ownerUserId,
        sourceDraftId,
        sourceCreatedAt,
        sourceStatus,
        sourceUpdatedAt,
        contentHash,
      ]),
    )
    .digest("hex");

  return `ndis.shadow.${digest}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new ShadowTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

class ShadowTimeoutError extends Error {}

function isTimeoutError(error: unknown) {
  return error instanceof ShadowTimeoutError;
}

function createNdisShadowSourceRefHash(sourceDraftId: string) {
  return createHash("sha256")
    .update(sourceDraftId)
    .digest("hex")
    .slice(0, 20);
}

const defaultLogger: NdisShadowLogger = {
  info(record) {
    console.info(JSON.stringify({ component: "careslink_ndis_shadow", ...record }));
  },
  warn(record) {
    console.warn(JSON.stringify({ component: "careslink_ndis_shadow", ...record }));
  },
};

function logSafely(
  logger: NdisShadowLogger,
  level: keyof NdisShadowLogger,
  record: NdisShadowLogRecord,
) {
  try {
    logger[level](record);
  } catch {
    // Shadow observability must never change the legacy save response.
  }
}
