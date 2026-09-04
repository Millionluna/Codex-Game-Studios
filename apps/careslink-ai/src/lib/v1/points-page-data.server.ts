import "server-only";

import { CARESLINK_V1_CONTRACT_VERSION } from "./shared-contracts";
import {
  CARESLINK_V1_DEFAULT_PRODUCT_API_RUNTIME,
  type CaresLinkV1ProductApiRuntime,
} from "./product-api-runtime.server";
import {
  CARESLINK_V1_PRODUCT_API_PATHS,
  type CaresLinkV1AuthenticatedPrincipal,
} from "./transport-contract";

export const CARESLINK_V1_POINTS_UI_FEATURE_FLAG =
  "CARESLINK_V1_POINTS_UI_ENABLED" as const;

type CaresLinkV1PointsUiEnv = Readonly<{
  CARESLINK_V1_POINTS_UI_ENABLED?: string;
}>;

export type CaresLinkV1PointsPageData =
  | Readonly<{
      status: "AVAILABLE";
      unit: "POINTS";
      serverTime: string;
      contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
      availablePoints: number;
      reservedPoints: number;
    }>
  | Readonly<{
      status: "NOT_READY";
      unit: "POINTS";
      serverTime: string;
      contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
    }>
  | Readonly<{
      status: "AUTH_REQUIRED";
      unit: "POINTS";
    }>
  | Readonly<{
      status: "UNAVAILABLE";
      unit: "POINTS";
    }>;

type ResolveCaresLinkV1PointsPageDataOptions = Readonly<{
  env?: CaresLinkV1PointsUiEnv;
  runtime?: CaresLinkV1ProductApiRuntime;
}>;

const AUTH_REQUIRED = Object.freeze({
  status: "AUTH_REQUIRED",
  unit: "POINTS",
} as const satisfies CaresLinkV1PointsPageData);

const UNAVAILABLE = Object.freeze({
  status: "UNAVAILABLE",
  unit: "POINTS",
} as const satisfies CaresLinkV1PointsPageData);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVER_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isCaresLinkV1PointsUiEnabled(
  env: CaresLinkV1PointsUiEnv = process.env as CaresLinkV1PointsUiEnv,
) {
  return env[CARESLINK_V1_POINTS_UI_FEATURE_FLAG] === "true";
}

/**
 * Resolves the owner-free Points summary for a Server Component without an
 * internal HTTP request. The synthetic Request selects the existing Product
 * API capability and cookie transport; the runtime reads the real request's
 * cookies from Next's request store and verifies the identity itself.
 */
export async function resolveCaresLinkV1PointsPageData(
  options: ResolveCaresLinkV1PointsPageDataOptions = {},
): Promise<CaresLinkV1PointsPageData> {
  if (!isCaresLinkV1PointsUiEnabled(options.env)) {
    return UNAVAILABLE;
  }

  const runtime = options.runtime ?? CARESLINK_V1_DEFAULT_PRODUCT_API_RUNTIME;
  const request = new Request(
    new URL(CARESLINK_V1_PRODUCT_API_PATHS.points, "https://careslink.internal"),
    { method: "GET" },
  );

  try {
    const auth = await runtime.resolveAuth(request);
    if (!auth.ok) {
      return isAuthenticationFailure(auth.reason)
        ? AUTH_REQUIRED
        : UNAVAILABLE;
    }

    if (
      auth.identity.source !== "cookie" ||
      !UUID_PATTERN.test(auth.identity.userId) ||
      !UUID_PATTERN.test(auth.identity.sessionId)
    ) {
      return UNAVAILABLE;
    }

    const principal: CaresLinkV1AuthenticatedPrincipal = {
      userId: auth.identity.userId.toLowerCase(),
      sessionId: auth.identity.sessionId.toLowerCase(),
      transport: "COOKIE",
    };
    const api = await runtime.getProductApi(principal, request);
    if (!api) {
      return UNAVAILABLE;
    }

    return parsePointsPageData(await api.getPoints()) ?? UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

function isAuthenticationFailure(reason: string) {
  return (
    reason === "auth_required" ||
    reason === "invalid_session" ||
    reason === "session_revoked"
  );
}

function parsePointsPageData(value: unknown): CaresLinkV1PointsPageData | null {
  if (!isRecord(value)) {
    return null;
  }

  const commonKeys = ["status", "unit", "serverTime", "contractVersion"];
  if (value.status === "NOT_READY") {
    if (
      !hasExactKeys(value, commonKeys) ||
      value.unit !== "POINTS" ||
      !isCanonicalServerTime(value.serverTime) ||
      value.contractVersion !== CARESLINK_V1_CONTRACT_VERSION
    ) {
      return null;
    }

    return Object.freeze({
      status: "NOT_READY",
      unit: "POINTS",
      serverTime: value.serverTime,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    });
  }

  if (value.status === "AVAILABLE") {
    if (
      !hasExactKeys(value, [
        ...commonKeys,
        "availablePoints",
        "reservedPoints",
      ]) ||
      value.unit !== "POINTS" ||
      !isCanonicalServerTime(value.serverTime) ||
      value.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
      !isNonnegativeSafeInteger(value.availablePoints) ||
      !isNonnegativeSafeInteger(value.reservedPoints)
    ) {
      return null;
    }

    return Object.freeze({
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: value.serverTime,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      availablePoints: value.availablePoints,
      reservedPoints: value.reservedPoints,
    });
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) {
    return false;
  }
  const actualStrings = (actual as string[]).sort();
  const expectedStrings = [...expected].sort();
  return (
    actualStrings.length === expectedStrings.length &&
    actualStrings.every((key, index) => key === expectedStrings[index])
  );
}

function isCanonicalServerTime(value: unknown): value is string {
  if (typeof value !== "string" || !SERVER_TIME_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
