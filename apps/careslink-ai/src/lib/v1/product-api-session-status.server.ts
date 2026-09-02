import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type {
  CaresLinkV1ProductApiAuthIdentity,
  CaresLinkV1SessionStatusResolver,
  CaresLinkV1SessionValidationStatus,
} from "./product-api-auth.server";

export const CARESLINK_V1_SESSION_STATUS_RPC =
  "resolve_v1_shadow_session_status" as const;

export type CaresLinkV1SessionStatusEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
};

type SupabaseRpcError = {
  code?: string;
  message?: string;
};

export type CaresLinkV1SessionStatusRpcClient = {
  rpc(
    functionName: typeof CARESLINK_V1_SESSION_STATUS_RPC,
    args: {
      p_session_id: string;
      p_user_id: string;
    },
  ): Promise<{
    data: unknown;
    error: SupabaseRpcError | null;
  }>;
};

export type CaresLinkV1SessionStatusRpcClientFactory = (
  supabaseUrl: string,
  privilegedServerKey: string,
) => CaresLinkV1SessionStatusRpcClient;

/**
 * Creates the service-only active-session resolver required by Product API
 * authentication. Here ACTIVE means the already-verified JWT still has its
 * matching Auth session row; future timeout-policy enforcement remains a
 * separate auth capability. Credentials never enter this boundary.
 */
export function createCaresLinkV1SessionStatusResolver(
  client: CaresLinkV1SessionStatusRpcClient,
): CaresLinkV1SessionStatusResolver {
  return async (
    identity: CaresLinkV1ProductApiAuthIdentity,
  ): Promise<CaresLinkV1SessionValidationStatus> => {
    if (!isCanonicalUuid(identity.userId) || !isCanonicalUuid(identity.sessionId)) {
      return "UNAVAILABLE";
    }

    try {
      const result = await client.rpc(CARESLINK_V1_SESSION_STATUS_RPC, {
        p_user_id: identity.userId,
        p_session_id: identity.sessionId,
      });

      if (!isRpcResult(result) || result.error !== null) {
        return "UNAVAILABLE";
      }

      return parseSessionStatus(result.data);
    } catch {
      return "UNAVAILABLE";
    }
  };
}

/**
 * Builds a fail-closed resolver from the existing server-side Supabase
 * configuration. Missing or unusable configuration returns undefined so the
 * auth layer can report session validation as unavailable without disclosing
 * configuration values.
 */
export function createCaresLinkV1SessionStatusResolverFromEnv(
  env: CaresLinkV1SessionStatusEnv =
    process.env as CaresLinkV1SessionStatusEnv,
  createClient: CaresLinkV1SessionStatusRpcClientFactory =
    createCaresLinkV1SessionStatusRpcClient,
): CaresLinkV1SessionStatusResolver | undefined {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return undefined;
  }

  try {
    return createCaresLinkV1SessionStatusResolver(
      createClient(supabaseUrl, serviceRoleKey),
    );
  } catch {
    return undefined;
  }
}

export function createCaresLinkV1SessionStatusRpcClient(
  supabaseUrl: string,
  privilegedServerKey: string,
): CaresLinkV1SessionStatusRpcClient {
  return createSupabaseClient(supabaseUrl, privilegedServerKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as CaresLinkV1SessionStatusRpcClient;
}

function parseSessionStatus(
  value: unknown,
): CaresLinkV1SessionValidationStatus {
  if (value === "ACTIVE" || value === "REVOKED") {
    return value;
  }

  return "UNAVAILABLE";
}

function isRpcResult(
  value: unknown,
): value is {
  data: unknown;
  error: SupabaseRpcError | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return "data" in value && "error" in value;
}

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID_PATTERN.test(value);
}
