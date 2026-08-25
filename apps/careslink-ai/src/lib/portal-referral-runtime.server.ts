import "server-only";

import { createCareslinkServerSupabaseClient } from "./supabase-server";
import type { PortalReferralApi } from "./portal-referral-adapter.server";
import {
  authorizePortalReferralSupabaseClient,
  createSupabasePortalReferralApi,
  type PortalReferralAuthorizationScope,
  type PortalReferralSessionScopedSupabaseRpcClient,
} from "./portal-referral-supabase.server";
import {
  CARESLINK_PRODUCTION_SUPABASE_REF,
  getSupabaseProjectRef,
} from "./v1/ndis-shadow-guard";

export const CARESLINK_PORTAL_REFERRAL_API_FLAG =
  "CARESLINK_PORTAL_REFERRAL_API_ENABLED" as const;
export const CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_FLAG =
  "CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED" as const;
export const CARESLINK_PORTAL_REFERRAL_INTAKE_FLAG =
  "CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED" as const;
export const CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_FLAG =
  "CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED" as const;
export const CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_FLAG =
  "CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED" as const;
export const CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF_FLAG =
  "CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF" as const;

export const CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY =
  true as const;

export type PortalReferralRuntimeEnv = Readonly<{
  CARESLINK_PORTAL_REFERRAL_API_ENABLED?: string;
  CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED?: string;
  CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED?: string;
  CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED?: string;
  CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED?: string;
  CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_URL?: string;
  VERCEL_ENV?: string;
}>;

export type PortalReferralOperation =
  | "LIST_REFERRALS"
  | "CREATE_REFERRAL"
  | "GET_REFERRAL"
  | "LIST_ASSIGNMENT_REFERRALS"
  | "GET_ASSIGNMENT_REFERRAL"
  | "TRIAGE_REFERRAL"
  | "LIST_PROVIDER_CANDIDATES"
  | "OFFER_REFERRAL"
  | "LIST_MY_OFFERS"
  | "RESPOND_TO_OFFER"
  | "RECORD_FOLLOW_UP"
  | "LIST_AUDIT";

export type PortalReferralApiResolution =
  | Readonly<{ ok: true; api: PortalReferralApi }>
  | Readonly<{
      ok: false;
      reason:
        | "capability_disabled"
        | "auth_required"
        | "session_revoked"
        | "forbidden"
        | "adapter_unavailable";
      status: 401 | 403 | 503;
    }>;

export type PortalReferralApiResolver = (
  request: Request,
  operation: PortalReferralOperation,
) => Promise<PortalReferralApiResolution>;

export type PortalReferralRuntimeOptions = Readonly<{
  env?: PortalReferralRuntimeEnv;
  createCookieRpcClient?: () => Promise<
    PortalReferralSessionScopedSupabaseRpcClient | undefined
  >;
}>;

export function isPortalReferralPreviewTargetAllowed(
  env: PortalReferralRuntimeEnv = process.env as PortalReferralRuntimeEnv,
) {
  if (env.VERCEL_ENV !== "preview") return false;
  const targetRef = getSupabaseProjectRef(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const expectedRef = normalizeExpectedProjectRef(
    env.CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF,
  );
  return Boolean(
    targetRef &&
      expectedRef &&
      targetRef === expectedRef &&
      targetRef !== CARESLINK_PRODUCTION_SUPABASE_REF,
  );
}

export function isPortalReferralBaseRuntimeEnabled(
  env: PortalReferralRuntimeEnv = process.env as PortalReferralRuntimeEnv,
) {
  return Boolean(
    CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY &&
      env.CARESLINK_PORTAL_REFERRAL_API_ENABLED === "true" &&
      env.CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED === "true" &&
      isPortalReferralPreviewTargetAllowed(env),
  );
}

/**
 * Existing intake-page convenience gate. Resolver authorization uses the base
 * and per-operation gates independently below.
 */
export function isPortalReferralRuntimeEnabled(
  env: PortalReferralRuntimeEnv = process.env as PortalReferralRuntimeEnv,
) {
  return (
    isPortalReferralBaseRuntimeEnabled(env) &&
    isPortalReferralOperationEnabled("LIST_REFERRALS", env)
  );
}

export function isPortalReferralSourceDetailRuntimeEnabled(
  env: PortalReferralRuntimeEnv = process.env as PortalReferralRuntimeEnv,
) {
  return (
    isPortalReferralBaseRuntimeEnabled(env) &&
    isPortalReferralOperationEnabled("GET_REFERRAL", env)
  );
}

export function isPortalReferralAssignmentRuntimeEnabled(
  env: PortalReferralRuntimeEnv = process.env as PortalReferralRuntimeEnv,
) {
  return (
    isPortalReferralBaseRuntimeEnabled(env) &&
    isPortalReferralOperationEnabled("LIST_ASSIGNMENT_REFERRALS", env)
  );
}

export function isPortalReferralOperationEnabled(
  operation: PortalReferralOperation,
  env: PortalReferralRuntimeEnv = process.env as PortalReferralRuntimeEnv,
) {
  switch (operation) {
    case "LIST_REFERRALS":
    case "CREATE_REFERRAL":
      return env.CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED === "true";
    case "GET_REFERRAL":
      return env.CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED === "true";
    case "LIST_ASSIGNMENT_REFERRALS":
    case "GET_ASSIGNMENT_REFERRAL":
    case "TRIAGE_REFERRAL":
    case "LIST_PROVIDER_CANDIDATES":
    case "OFFER_REFERRAL":
      return env.CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED === "true";
    default:
      return false;
  }
}

/**
 * Builds the request-scoped cookie adapter only after every environment and
 * operation gate passes. Authorization is re-derived by the database RPC;
 * request bodies never supply actor, organization, role or session identity.
 */
export function createPortalReferralApiResolver(
  options: PortalReferralRuntimeOptions = {},
): PortalReferralApiResolver {
  const env = options.env ?? (process.env as PortalReferralRuntimeEnv);
  return async (request, operation) => {
    const authorizationScope = authorizationScopeForOperation(operation);
    if (
      !isPortalReferralBaseRuntimeEnabled(env) ||
      !isPortalReferralOperationEnabled(operation, env) ||
      !authorizationScope
    ) {
      return disabled();
    }

    // This surface is intentionally cookie-only. A caller-supplied bearer is
    // never parsed, copied into an RPC argument, or used to construct a client.
    if (request.headers.get("authorization") !== null) {
      return { ok: false, reason: "auth_required", status: 401 };
    }

    let client: PortalReferralSessionScopedSupabaseRpcClient | undefined;
    try {
      client = options.createCookieRpcClient
        ? await options.createCookieRpcClient()
        : ((await createCareslinkServerSupabaseClient({ env })) as unknown as
            | PortalReferralSessionScopedSupabaseRpcClient
            | undefined);
    } catch {
      return unavailable();
    }
    if (!client) return unavailable();

    const authorization = await authorizePortalReferralSupabaseClient(
      client,
      authorizationScope,
    );
    if (!authorization.ok) {
      switch (authorization.reason) {
        case "auth_required":
          return { ok: false, reason: "auth_required", status: 401 };
        case "session_revoked":
          return { ok: false, reason: "session_revoked", status: 401 };
        case "forbidden":
          return { ok: false, reason: "forbidden", status: 403 };
        case "capability_disabled":
          return disabled();
        default:
          return unavailable();
      }
    }

    return {
      ok: true,
      api: createSupabasePortalReferralApi(client, authorization.authorization),
    };
  };
}

function authorizationScopeForOperation(
  operation: PortalReferralOperation,
): PortalReferralAuthorizationScope | undefined {
  switch (operation) {
    case "LIST_REFERRALS":
    case "CREATE_REFERRAL":
      return "INTAKE";
    case "GET_REFERRAL":
      return "SOURCE_DETAIL";
    case "LIST_ASSIGNMENT_REFERRALS":
    case "GET_ASSIGNMENT_REFERRAL":
    case "TRIAGE_REFERRAL":
    case "LIST_PROVIDER_CANDIDATES":
    case "OFFER_REFERRAL":
      return "ASSIGNMENT";
    default:
      return undefined;
  }
}

export const resolveDefaultPortalReferralApi: PortalReferralApiResolver =
  createPortalReferralApiResolver();

function disabled(): PortalReferralApiResolution {
  return { ok: false, reason: "capability_disabled", status: 503 };
}

function unavailable(): PortalReferralApiResolution {
  return { ok: false, reason: "adapter_unavailable", status: 503 };
}

function normalizeExpectedProjectRef(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z0-9]{8,32}$/.test(normalized)
    ? normalized
    : undefined;
}
