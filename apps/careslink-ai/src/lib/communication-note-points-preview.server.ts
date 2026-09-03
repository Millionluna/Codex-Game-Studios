import "server-only";

import {
  COMMUNICATION_NOTE_POINTS_PREVIEW_SERVICE_CODE,
  COMMUNICATION_NOTE_POINTS_PREVIEW_UNIT,
  UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW,
  type CommunicationNotePointsPreview,
} from "./communication-note-points-preview";
import {
  CARESLINK_V1_RATE_CATALOG_VERSION,
  getCaresLinkV1Rate,
} from "./v1/shared-contracts";

export const COMMUNICATION_NOTE_POINTS_PREVIEW_RPC =
  "get_v1_communication_note_points_preview" as const;
export const COMMUNICATION_NOTE_POINTS_PREVIEW_DEADLINE_MS = 1_500 as const;

export type CommunicationNotePointsPreviewClient = Readonly<{
  rpc(
    functionName: typeof COMMUNICATION_NOTE_POINTS_PREVIEW_RPC,
  ): CommunicationNotePointsPreviewRequest;
}>;

type CommunicationNotePointsPreviewRequest = PromiseLike<unknown> &
  Readonly<{
    abortSignal?(signal: AbortSignal): PromiseLike<unknown>;
  }>;

const EXPECTED_GENERATION_COST_POINTS = getExpectedGenerationCostPoints();

export async function resolveCommunicationNotePointsPreview(
  client: unknown,
): Promise<CommunicationNotePointsPreview> {
  if (!isPreviewClient(client)) {
    return UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW;
  }

  let deadline: ReturnType<typeof setTimeout> | undefined;
  let abortController: AbortController | undefined;
  try {
    const rpcBuilder = client.rpc(COMMUNICATION_NOTE_POINTS_PREVIEW_RPC);
    const rpcRequest = isAbortablePreviewRequest(rpcBuilder)
      ? (() => {
          abortController = new AbortController();
          return Promise.resolve(
            rpcBuilder.abortSignal(abortController.signal),
          );
        })()
      : Promise.resolve(rpcBuilder);
    const deadlineResult = new Promise<undefined>((resolve) => {
      deadline = setTimeout(
        () => {
          abortController?.abort();
          resolve(undefined);
        },
        COMMUNICATION_NOTE_POINTS_PREVIEW_DEADLINE_MS,
      );
      deadline.unref?.();
    });
    const result = await Promise.race([rpcRequest, deadlineResult]);
    if (!isRpcResult(result) || result.error !== null) {
      return UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW;
    }
    return parsePreview(result.data);
  } catch {
    return UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW;
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
  }
}

function isAbortablePreviewRequest(
  value: CommunicationNotePointsPreviewRequest,
): value is CommunicationNotePointsPreviewRequest &
  Required<Pick<CommunicationNotePointsPreviewRequest, "abortSignal">> {
  return typeof value.abortSignal === "function";
}

function parsePreview(value: unknown): CommunicationNotePointsPreview {
  if (!isRecord(value)) {
    return UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW;
  }

  const baseKeys = [
    "catalogVersion",
    "generationCostPoints",
    "serviceCode",
    "status",
    "unit",
  ] as const;
  const hasExpectedRate =
    value.unit === COMMUNICATION_NOTE_POINTS_PREVIEW_UNIT &&
    value.serviceCode === COMMUNICATION_NOTE_POINTS_PREVIEW_SERVICE_CODE &&
    value.catalogVersion === CARESLINK_V1_RATE_CATALOG_VERSION &&
    value.generationCostPoints === EXPECTED_GENERATION_COST_POINTS;

  if (value.status === "NOT_READY") {
    if (!hasExactKeys(value, baseKeys) || !hasExpectedRate) {
      return UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW;
    }
    return Object.freeze({
      status: "NOT_READY",
      unit: COMMUNICATION_NOTE_POINTS_PREVIEW_UNIT,
      serviceCode: COMMUNICATION_NOTE_POINTS_PREVIEW_SERVICE_CODE,
      catalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
      generationCostPoints: EXPECTED_GENERATION_COST_POINTS,
    });
  }

  if (
    value.status !== "AVAILABLE" ||
    !hasExactKeys(value, [
      ...baseKeys,
      "availablePoints",
      "reservedPoints",
      "canAfford",
    ]) ||
    !hasExpectedRate ||
    !isNonnegativeSafeInteger(value.availablePoints) ||
    !isNonnegativeSafeInteger(value.reservedPoints) ||
    typeof value.canAfford !== "boolean" ||
    value.canAfford !==
      (value.availablePoints >= EXPECTED_GENERATION_COST_POINTS)
  ) {
    return UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW;
  }

  return Object.freeze({
    status: "AVAILABLE",
    unit: COMMUNICATION_NOTE_POINTS_PREVIEW_UNIT,
    serviceCode: COMMUNICATION_NOTE_POINTS_PREVIEW_SERVICE_CODE,
    catalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    generationCostPoints: EXPECTED_GENERATION_COST_POINTS,
    availablePoints: value.availablePoints,
    reservedPoints: value.reservedPoints,
    canAfford: value.canAfford,
  });
}

function isPreviewClient(
  value: unknown,
): value is CommunicationNotePointsPreviewClient {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as { rpc?: unknown }).rpc === "function",
  );
}

function isRpcResult(
  value: unknown,
): value is Readonly<{ data: unknown; error: unknown | null }> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "data" in value &&
      "error" in value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function getExpectedGenerationCostPoints(): number {
  const rate = getCaresLinkV1Rate(
    COMMUNICATION_NOTE_POINTS_PREVIEW_SERVICE_CODE,
  );
  if (rate.points === null || rate.unit !== "request") {
    throw new Error("Communication Note Points preview rate is unavailable");
  }
  return rate.points;
}
