export const CARESLINK_PRODUCTION_SUPABASE_REF =
  "adocsnwnslxhxcjgbyee" as const;

export const CARESLINK_V1_NDIS_SHADOW_FLAGS = {
  master: "CARESLINK_V1_SHADOW_ENABLED",
  dualWrite: "CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED",
  shadowRead: "CARESLINK_V1_NDIS_SHADOW_READ_ENABLED",
  expectedSupabaseRef: "CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF",
} as const;

export type CaresLinkV1NdisShadowEnv = {
  VERCEL_ENV?: string;
  CARESLINK_V1_SHADOW_ENABLED?: string;
  CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED?: string;
  CARESLINK_V1_NDIS_SHADOW_READ_ENABLED?: string;
  CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF?: string;
  CARESLINK_V1_NDIS_SHADOW_TIMEOUT_MS?: string;
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

export type CaresLinkV1NdisShadowGuard = {
  enabled: boolean;
  dualWriteEnabled: boolean;
  shadowReadEnabled: boolean;
  targetSupabaseRef?: string;
  reason:
    | "enabled"
    | "production_environment"
    | "non_preview_environment"
    | "master_disabled"
    | "dual_write_disabled"
    | "target_unverified"
    | "production_target_denied";
};

export function resolveCaresLinkV1NdisShadowGuard(
  env: CaresLinkV1NdisShadowEnv = process.env as CaresLinkV1NdisShadowEnv,
): CaresLinkV1NdisShadowGuard {
  if (env.VERCEL_ENV === "production") {
    return disabled("production_environment");
  }

  if (env.VERCEL_ENV !== "preview") {
    return disabled("non_preview_environment");
  }

  if (env.CARESLINK_V1_SHADOW_ENABLED !== "true") {
    return disabled("master_disabled");
  }

  if (env.CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED !== "true") {
    return disabled("dual_write_disabled");
  }

  const targetSupabaseRef = getSupabaseProjectRef(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const expectedSupabaseRef = normalizeProjectRef(
    env.CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF,
  );

  if (
    !targetSupabaseRef ||
    !expectedSupabaseRef ||
    targetSupabaseRef !== expectedSupabaseRef
  ) {
    return disabled("target_unverified", targetSupabaseRef);
  }

  if (targetSupabaseRef === CARESLINK_PRODUCTION_SUPABASE_REF) {
    return disabled("production_target_denied", targetSupabaseRef);
  }

  return {
    enabled: true,
    dualWriteEnabled: true,
    shadowReadEnabled:
      env.CARESLINK_V1_NDIS_SHADOW_READ_ENABLED === "true",
    targetSupabaseRef,
    reason: "enabled",
  };
}

export function getCaresLinkV1NdisShadowTimeoutMs(
  env: CaresLinkV1NdisShadowEnv = process.env as CaresLinkV1NdisShadowEnv,
) {
  const parsed = Number.parseInt(
    env.CARESLINK_V1_NDIS_SHADOW_TIMEOUT_MS ?? "",
    10,
  );

  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 250), 5_000)
    : 1_500;
}

export function getSupabaseProjectRef(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
      return undefined;
    }

    return normalizeProjectRef(url.hostname.slice(0, -".supabase.co".length));
  } catch {
    return undefined;
  }
}

function disabled(
  reason: Exclude<CaresLinkV1NdisShadowGuard["reason"], "enabled">,
  targetSupabaseRef?: string,
): CaresLinkV1NdisShadowGuard {
  return {
    enabled: false,
    dualWriteEnabled: false,
    shadowReadEnabled: false,
    targetSupabaseRef,
    reason,
  };
}

function normalizeProjectRef(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z0-9]{8,32}$/.test(normalized)
    ? normalized
    : undefined;
}
