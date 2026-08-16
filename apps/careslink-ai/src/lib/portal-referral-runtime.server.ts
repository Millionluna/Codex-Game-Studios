import "server-only";

import type { PortalReferralApi } from "./portal-referral-adapter.server";
import {
  CARESLINK_PRODUCTION_SUPABASE_REF,
  getSupabaseProjectRef,
} from "./v1/ndis-shadow-guard";

export const CARESLINK_PORTAL_REFERRAL_API_FLAG =
  "CARESLINK_PORTAL_REFERRAL_API_ENABLED" as const;
export const CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_FLAG =
  "CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED" as const;
export const CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF_FLAG =
  "CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF" as const;

/**
 * This latch deliberately cannot be configured. A later reviewed batch must
 * replace it only after disposable-Preview database and identity evidence.
 */
export const CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY =
  false as const;

export type PortalReferralRuntimeEnv = Readonly<{
  CARESLINK_PORTAL_REFERRAL_API_ENABLED?: string;
  CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED?: string;
  CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  VERCEL_ENV?: string;
}>;

export type PortalReferralOperation =
  | "LIST_REFERRALS"
  | "CREATE_REFERRAL"
  | "GET_REFERRAL"
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

export function isPortalReferralRuntimeEnabled(
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
 * No default database or memory adapter exists in this batch. Tests inject an
 * actor-bound adapter explicitly; production code fails before auth/body/DB.
 */
export const resolveDefaultPortalReferralApi: PortalReferralApiResolver = async (
  request,
  operation,
) => {
  void request;
  void operation;
  if (!isPortalReferralRuntimeEnabled()) {
    return {
      ok: false,
      reason: "capability_disabled",
      status: 503,
    };
  }
  return {
    ok: false,
    reason: "adapter_unavailable",
    status: 503,
  };
};

function normalizeExpectedProjectRef(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z0-9]{8,32}$/.test(normalized)
    ? normalized
    : undefined;
}
