import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  createCareslinkServerSupabaseClient,
  getSupabasePublicAuthConfig,
} from "../supabase-server";
import {
  isCaresLinkV1ProductApiEnabled,
  resolveCaresLinkV1ProductApiAuth,
  type CaresLinkV1ProductApiAuthClient,
  type CaresLinkV1ProductApiAuthResolution,
  type CaresLinkV1ProductApiEnv,
} from "./product-api-auth.server";
import {
  createCaresLinkV1SessionStatusResolverFromEnv,
  type CaresLinkV1SessionStatusEnv,
} from "./product-api-session-status.server";
import {
  CARESLINK_PRODUCTION_SUPABASE_REF,
  getSupabaseProjectRef,
} from "./ndis-shadow-guard";
import {
  createSupabaseCaresLinkV1ProductApi,
  type CaresLinkV1ServiceOnlyPrivacyReviewRpcClient,
  type CaresLinkV1SessionScopedSupabaseRpcClient,
} from "./product-api-supabase.server";
import {
  CARESLINK_V1_PRODUCT_API_PATHS,
  type CaresLinkV1AuthenticatedPrincipal,
  type CaresLinkV1ProductApi,
} from "./transport-contract";

export const CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_FLAG =
  "CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED" as const;
export const CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF_FLAG =
  "CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF" as const;
export const CARESLINK_V1_PRODUCT_API_M0_READ_FLAG =
  "CARESLINK_V1_PRODUCT_API_M0_READ_ENABLED" as const;
export const CARESLINK_V1_PRODUCT_API_POINTS_READ_FLAG =
  "CARESLINK_V1_PRODUCT_API_POINTS_READ_ENABLED" as const;
export const CARESLINK_V1_PRODUCT_API_DOCUMENT_DETAIL_FLAG =
  "CARESLINK_V1_PRODUCT_API_DOCUMENT_DETAIL_ENABLED" as const;
export const CARESLINK_V1_PRODUCT_API_PRIVACY_REVIEW_FLAG =
  "CARESLINK_V1_PRODUCT_API_PRIVACY_REVIEW_ENABLED" as const;
export const CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_FLAG =
  "CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED" as const;

export type CaresLinkV1ProductApiRuntimeEnv = CaresLinkV1ProductApiEnv &
  CaresLinkV1SessionStatusEnv & {
    CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED?: string;
    CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF?: string;
    CARESLINK_V1_PRODUCT_API_M0_READ_ENABLED?: string;
    CARESLINK_V1_PRODUCT_API_POINTS_READ_ENABLED?: string;
    CARESLINK_V1_PRODUCT_API_DOCUMENT_DETAIL_ENABLED?: string;
    CARESLINK_V1_PRODUCT_API_PRIVACY_REVIEW_ENABLED?: string;
    CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED?: string;
    CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY?: string;
    VERCEL_ENV?: string;
  };

export type CaresLinkV1ProductApiRuntime = Readonly<{
  resolveAuth(request: Request): Promise<CaresLinkV1ProductApiAuthResolution>;
  getProductApi(
    principal: CaresLinkV1AuthenticatedPrincipal,
    request: Request,
  ): Promise<CaresLinkV1ProductApi | undefined>;
}>;

export type CaresLinkV1ProductApiRuntimeOptions = Readonly<{
  env?: CaresLinkV1ProductApiRuntimeEnv;
  createBearerRpcClient?: (
    supabaseUrl: string,
    publishableKey: string,
    accessToken: string,
  ) => CaresLinkV1SessionScopedSupabaseRpcClient;
  createCookieRpcClient?: () => Promise<
    CaresLinkV1SessionScopedSupabaseRpcClient | undefined
  >;
  createPrivacyReviewRpcClient?: (
    supabaseUrl: string,
    previewServiceRoleKey: string,
  ) => CaresLinkV1ServiceOnlyPrivacyReviewRpcClient;
  createBearerAuthClient?: () =>
    | CaresLinkV1ProductApiAuthClient
    | undefined;
  createCookieAuthClient?: () => Promise<
    CaresLinkV1ProductApiAuthClient | undefined
  >;
  createSessionStatusResolver?: typeof createCaresLinkV1SessionStatusResolverFromEnv;
}>;

export function isCaresLinkV1DurableProductApiEnabled(
  env: CaresLinkV1ProductApiRuntimeEnv =
    process.env as CaresLinkV1ProductApiRuntimeEnv,
) {
  return env.CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED === "true";
}

export function isCaresLinkV1ProductApiPreviewTargetAllowed(
  env: CaresLinkV1ProductApiRuntimeEnv =
    process.env as CaresLinkV1ProductApiRuntimeEnv,
) {
  if (env.VERCEL_ENV !== "preview") {
    return false;
  }

  const targetRef = getSupabaseProjectRef(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const expectedRef = normalizeExpectedProjectRef(
    env.CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF,
  );

  return Boolean(
    targetRef &&
      expectedRef &&
      targetRef === expectedRef &&
      targetRef !== CARESLINK_PRODUCTION_SUPABASE_REF,
  );
}

export type CaresLinkV1ProductApiOperationCapability =
  | "M0_READ"
  | "POINTS_READ"
  | "DOCUMENT_DETAIL"
  | "PRIVACY_REVIEW"
  | "DOCUMENT_WRITE";

export function getCaresLinkV1ProductApiOperationCapability(
  request: Request,
): CaresLinkV1ProductApiOperationCapability | undefined {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return undefined;
  }
  const method = request.method.toUpperCase();
  if (
    method === "GET" &&
    pathname === CARESLINK_V1_PRODUCT_API_PATHS.points
  ) {
    return "POINTS_READ";
  }
  if (
    method === "GET" &&
    (pathname === CARESLINK_V1_PRODUCT_API_PATHS.me ||
      pathname === CARESLINK_V1_PRODUCT_API_PATHS.documents ||
      pathname === CARESLINK_V1_PRODUCT_API_PATHS.syncPull)
  ) {
    return "M0_READ";
  }
  if (method === "GET" && /^\/v1\/documents\/[^/]+$/.test(pathname)) {
    return "DOCUMENT_DETAIL";
  }
  if (
    method === "POST" &&
    pathname === CARESLINK_V1_PRODUCT_API_PATHS.privacyReviews
  ) {
    return "PRIVACY_REVIEW";
  }
  if (
    (method === "POST" &&
      pathname === CARESLINK_V1_PRODUCT_API_PATHS.documents) ||
    ((method === "PATCH" || method === "DELETE") &&
      /^\/v1\/documents\/[^/]+$/.test(pathname)) ||
    (method === "PUT" &&
      /^\/v1\/documents\/[^/]+\/checkpoint$/.test(pathname))
  ) {
    return "DOCUMENT_WRITE";
  }
  return undefined;
}

export function isCaresLinkV1ProductApiOperationEnabled(
  request: Request,
  env: CaresLinkV1ProductApiRuntimeEnv =
    process.env as CaresLinkV1ProductApiRuntimeEnv,
) {
  switch (getCaresLinkV1ProductApiOperationCapability(request)) {
    case "M0_READ":
      return env.CARESLINK_V1_PRODUCT_API_M0_READ_ENABLED === "true";
    case "POINTS_READ":
      return env.CARESLINK_V1_PRODUCT_API_POINTS_READ_ENABLED === "true";
    case "DOCUMENT_DETAIL":
      return env.CARESLINK_V1_PRODUCT_API_DOCUMENT_DETAIL_ENABLED === "true";
    case "PRIVACY_REVIEW":
      return env.CARESLINK_V1_PRODUCT_API_PRIVACY_REVIEW_ENABLED === "true";
    case "DOCUMENT_WRITE":
      return env.CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED === "true";
    default:
      return false;
  }
}

/**
 * Request-scoped runtime assembly. The master API flag, durable-adapter flag,
 * service-only active-session check and database flag are independent gates.
 * No bearer credential is returned from this boundary or added to a DTO.
 */
export function createCaresLinkV1ProductApiRuntime(
  options: CaresLinkV1ProductApiRuntimeOptions = {},
): CaresLinkV1ProductApiRuntime {
  const env =
    options.env ??
    (process.env as unknown as CaresLinkV1ProductApiRuntimeEnv);
  const createSessionStatusResolver =
    options.createSessionStatusResolver ??
    createCaresLinkV1SessionStatusResolverFromEnv;

  return {
    async resolveAuth(request) {
      if (
        !isCaresLinkV1ProductApiEnabled(env) ||
        !isCaresLinkV1DurableProductApiEnabled(env) ||
        !isCaresLinkV1ProductApiPreviewTargetAllowed(env) ||
        !isCaresLinkV1ProductApiOperationEnabled(request, env)
      ) {
        return {
          ok: false,
          reason: "feature_disabled",
          status: 503,
        };
      }

      const resolveSessionStatus = createSessionStatusResolver(env);
      return resolveCaresLinkV1ProductApiAuth(request, {
        env,
        createBearerAuthClient: options.createBearerAuthClient,
        createCookieAuthClient: options.createCookieAuthClient,
        resolveSessionStatus,
      });
    },

    async getProductApi(principal, request) {
      if (
        !isCaresLinkV1ProductApiEnabled(env) ||
        !isCaresLinkV1DurableProductApiEnabled(env) ||
        !isCaresLinkV1ProductApiPreviewTargetAllowed(env) ||
        !isCaresLinkV1ProductApiOperationEnabled(request, env)
      ) {
        return undefined;
      }

      const client = await resolveRequestRpcClient(
        request,
        principal.transport,
        env,
        options,
      );
      if (!client) {
        return undefined;
      }

      return createSupabaseCaresLinkV1ProductApi({
        client,
        principal,
        privacyReviewClient:
          new URL(request.url).pathname ===
          CARESLINK_V1_PRODUCT_API_PATHS.privacyReviews
            ? resolvePreviewPrivacyReviewRpcClient(env, options)
            : undefined,
      });
    },
  };
}

export const CARESLINK_V1_DEFAULT_PRODUCT_API_RUNTIME =
  createCaresLinkV1ProductApiRuntime();

async function resolveRequestRpcClient(
  request: Request,
  transport: CaresLinkV1AuthenticatedPrincipal["transport"],
  env: CaresLinkV1ProductApiRuntimeEnv,
  options: CaresLinkV1ProductApiRuntimeOptions,
) {
  const authorization = request.headers.get("authorization");
  if (transport === "COOKIE") {
    if (authorization !== null) {
      return undefined;
    }
    try {
      if (options.createCookieRpcClient) {
        return await options.createCookieRpcClient();
      }
      return (await createCareslinkServerSupabaseClient({ env })) as unknown as
        | CaresLinkV1SessionScopedSupabaseRpcClient
        | undefined;
    } catch {
      return undefined;
    }
  }

  if (authorization === null) {
    return undefined;
  }

  const accessToken = parseBearerAccessToken(authorization);
  const config = getSupabasePublicAuthConfig(env);
  if (!accessToken || !config) {
    return undefined;
  }

  try {
    const createBearerRpcClient =
      options.createBearerRpcClient ?? createBearerSupabaseRpcClient;
    return createBearerRpcClient(
      config.supabaseUrl,
      config.publishableKey,
      accessToken,
    );
  } catch {
    return undefined;
  }
}

function createBearerSupabaseRpcClient(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
) {
  return createSupabaseClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  }) as unknown as CaresLinkV1SessionScopedSupabaseRpcClient;
}

function resolvePreviewPrivacyReviewRpcClient(
  env: CaresLinkV1ProductApiRuntimeEnv,
  options: CaresLinkV1ProductApiRuntimeOptions,
) {
  // Repeat the target guard at the privileged-client boundary. The dedicated
  // key name intentionally cannot fall back to the general service-role key.
  if (!isCaresLinkV1ProductApiPreviewTargetAllowed(env)) return undefined;
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const previewServiceRoleKey =
    env.CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !previewServiceRoleKey) return undefined;
  try {
    const factory =
      options.createPrivacyReviewRpcClient ??
      createPreviewPrivacyReviewRpcClient;
    return factory(supabaseUrl, previewServiceRoleKey);
  } catch {
    return undefined;
  }
}

function createPreviewPrivacyReviewRpcClient(
  supabaseUrl: string,
  previewServiceRoleKey: string,
) {
  return createSupabaseClient(supabaseUrl, previewServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as CaresLinkV1ServiceOnlyPrivacyReviewRpcClient;
}

function parseBearerAccessToken(authorization: string) {
  const match = authorization.match(/^Bearer[\t ]+([^\s,]+)$/i);
  const accessToken = match?.[1];
  return accessToken && accessToken.length <= 8192 ? accessToken : undefined;
}

function normalizeExpectedProjectRef(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z0-9]{8,32}$/.test(normalized)
    ? normalized
    : undefined;
}
