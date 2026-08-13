import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  createCareslinkServerSupabaseClient,
  getSupabasePublicAuthConfig,
} from "../supabase-server";

export const CARESLINK_V1_PRODUCT_API_FLAG =
  "CARESLINK_V1_PRODUCT_API_ENABLED" as const;

/**
 * These native-auth surfaces are intentionally outside the first Product API
 * batch. Keeping the boundary executable prevents an auth resolver from being
 * mistaken for session/device management or a native PKCE callback.
 */
export const CARESLINK_V1_NATIVE_AUTH_BOUNDARY = Object.freeze({
  nativePkceCallback: "NOT_SERVED",
  sessions: "NOT_SERVED",
  devices: "NOT_SERVED",
  revoke: "NOT_SERVED",
} as const);

export type CaresLinkV1ProductApiEnv = {
  CARESLINK_V1_PRODUCT_API_ENABLED?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_URL?: string;
};

export type CaresLinkV1ProductApiAuthIdentity = Readonly<{
  userId: string;
  sessionId: string;
  source: "bearer" | "cookie";
}>;

export type CaresLinkV1SessionValidationStatus =
  | "ACTIVE"
  | "REVOKED"
  | "UNAVAILABLE";

export type CaresLinkV1SessionStatusResolver = (
  identity: CaresLinkV1ProductApiAuthIdentity,
) => Promise<CaresLinkV1SessionValidationStatus>;

export type CaresLinkV1ProductApiAuthFailureReason =
  | "feature_disabled"
  | "auth_required"
  | "invalid_session"
  | "auth_unavailable"
  | "session_revoked"
  | "session_validation_unavailable";

export type CaresLinkV1ProductApiAuthResolution =
  | {
      ok: true;
      identity: CaresLinkV1ProductApiAuthIdentity;
    }
  | {
      ok: false;
      reason: CaresLinkV1ProductApiAuthFailureReason;
      status: 401 | 503;
    };

type ProductApiSupabaseUser = {
  id: string;
};

type ProductApiSupabaseClaims = {
  session_id?: unknown;
  sub?: unknown;
};

export type CaresLinkV1ProductApiAuthClient = {
  auth: {
    getUser(accessToken?: string): Promise<{
      data: { user: ProductApiSupabaseUser | null };
      error: { message?: string } | null;
    }>;
    getClaims(accessToken?: string): Promise<{
      data: { claims?: ProductApiSupabaseClaims | null } | null;
      error: { message?: string } | null;
    }>;
  };
};

export type CaresLinkV1ProductApiAuthOptions = {
  env?: CaresLinkV1ProductApiEnv;
  createBearerAuthClient?: () =>
    | CaresLinkV1ProductApiAuthClient
    | undefined;
  createCookieAuthClient?: () => Promise<
    CaresLinkV1ProductApiAuthClient | undefined
  >;
  resolveSessionStatus?: CaresLinkV1SessionStatusResolver;
};

export function isCaresLinkV1ProductApiEnabled(
  env: CaresLinkV1ProductApiEnv = process.env as CaresLinkV1ProductApiEnv,
) {
  return env.CARESLINK_V1_PRODUCT_API_ENABLED === "true";
}

/**
 * Resolves only trusted server auth state. It deliberately never reads the
 * request URL or body, so owner identity cannot be supplied by a client.
 *
 * Revocation checks are a required dependency while native session management
 * remains unserved. If an active session cannot be proven, resolution fails
 * closed instead of treating a still-unexpired JWT as an active session.
 */
export async function resolveCaresLinkV1ProductApiAuth(
  request: Request,
  options: CaresLinkV1ProductApiAuthOptions = {},
): Promise<CaresLinkV1ProductApiAuthResolution> {
  const env =
    options.env ?? (process.env as unknown as CaresLinkV1ProductApiEnv);

  if (!isCaresLinkV1ProductApiEnabled(env)) {
    return failure("feature_disabled", 503);
  }

  const credential = parseAuthorizationHeader(
    request.headers.get("authorization"),
  );

  if (credential.kind === "invalid") {
    return failure("invalid_session", 401);
  }

  if (credential.kind === "bearer") {
    const client = safelyCreateBearerClient(
      options.createBearerAuthClient ??
        (() => createBearerAuthClientFromEnv(env)),
    );

    if (!client) {
      return failure("auth_unavailable", 503);
    }

    return resolveVerifiedIdentity({
      client,
      source: "bearer",
      accessToken: credential.accessToken,
      resolveSessionStatus: options.resolveSessionStatus,
    });
  }

  const createCookieAuthClient =
    options.createCookieAuthClient ??
    (() => createCookieAuthClientFromEnv(env));
  const client = await safelyCreateCookieClient(createCookieAuthClient);

  if (!client) {
    return failure("auth_unavailable", 503);
  }

  return resolveVerifiedIdentity({
    client,
    source: "cookie",
    resolveSessionStatus: options.resolveSessionStatus,
  });
}

type ResolveVerifiedIdentityInput = {
  client: CaresLinkV1ProductApiAuthClient;
  source: CaresLinkV1ProductApiAuthIdentity["source"];
  accessToken?: string;
  resolveSessionStatus?: CaresLinkV1SessionStatusResolver;
};

async function resolveVerifiedIdentity({
  client,
  source,
  accessToken,
  resolveSessionStatus,
}: ResolveVerifiedIdentityInput): Promise<CaresLinkV1ProductApiAuthResolution> {
  try {
    const claimsResult = accessToken
      ? await client.auth.getClaims(accessToken)
      : await client.auth.getClaims();

    if (claimsResult.error || !claimsResult.data?.claims) {
      return failure("invalid_session", 401);
    }

    const userId = normalizeUuid(claimsResult.data.claims.sub);
    const sessionId = normalizeUuid(claimsResult.data.claims.session_id);

    if (!userId || !sessionId) {
      return failure("invalid_session", 401);
    }

    const identity = Object.freeze({
      userId,
      sessionId,
      source,
    });

    if (!resolveSessionStatus) {
      return failure("session_validation_unavailable", 503);
    }

    let sessionStatus: CaresLinkV1SessionValidationStatus;
    try {
      sessionStatus = await resolveSessionStatus(identity);
    } catch {
      return failure("session_validation_unavailable", 503);
    }

    if (sessionStatus === "REVOKED") {
      return failure("session_revoked", 401);
    }

    if (sessionStatus !== "ACTIVE") {
      return failure("session_validation_unavailable", 503);
    }

    // getClaims verifies the JWT before its subject and session identifier are
    // used for the service-only revocation lookup. Only a session proven ACTIVE
    // reaches getUser, which preserves Supabase's authoritative user check while
    // still distinguishing a signed, globally-logged-out token as REVOKED.
    const userResult = accessToken
      ? await client.auth.getUser(accessToken)
      : await client.auth.getUser();

    if (userResult.error || !userResult.data.user) {
      return failure(
        source === "cookie" ? "auth_required" : "invalid_session",
        401,
      );
    }

    const verifiedUserId = normalizeUuid(userResult.data.user.id);
    if (!verifiedUserId || verifiedUserId !== identity.userId) {
      return failure("invalid_session", 401);
    }

    return { ok: true, identity };
  } catch {
    return failure(source === "cookie" ? "auth_required" : "invalid_session", 401);
  }
}

function createBearerAuthClientFromEnv(
  env: CaresLinkV1ProductApiEnv,
): CaresLinkV1ProductApiAuthClient | undefined {
  const config = getSupabasePublicAuthConfig(env);

  if (!config) {
    return undefined;
  }

  return createSupabaseClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as CaresLinkV1ProductApiAuthClient;
}

async function createCookieAuthClientFromEnv(
  env: CaresLinkV1ProductApiEnv,
): Promise<CaresLinkV1ProductApiAuthClient | undefined> {
  return createCareslinkServerSupabaseClient({ env }) as Promise<
    CaresLinkV1ProductApiAuthClient | undefined
  >;
}

async function safelyCreateCookieClient(
  createCookieAuthClient: () => Promise<
    CaresLinkV1ProductApiAuthClient | undefined
  >,
) {
  try {
    return await createCookieAuthClient();
  } catch {
    return undefined;
  }
}

function safelyCreateBearerClient(
  createBearerAuthClient: () =>
    | CaresLinkV1ProductApiAuthClient
    | undefined,
) {
  try {
    return createBearerAuthClient();
  } catch {
    return undefined;
  }
}

type ParsedAuthorization =
  | { kind: "cookie" }
  | { kind: "invalid" }
  | { kind: "bearer"; accessToken: string };

function parseAuthorizationHeader(
  authorization: string | null,
): ParsedAuthorization {
  if (authorization === null) {
    return { kind: "cookie" };
  }

  const match = authorization.match(/^Bearer[\t ]+([^\s,]+)$/i);
  const accessToken = match?.[1];

  if (!accessToken || accessToken.length > 8192) {
    return { kind: "invalid" };
  }

  return { kind: "bearer", accessToken };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return undefined;
  }

  return value.toLowerCase();
}

function failure(
  reason: CaresLinkV1ProductApiAuthFailureReason,
  status: 401 | 503,
): CaresLinkV1ProductApiAuthResolution {
  return { ok: false, reason, status };
}
