import "server-only";

import {
  createCommunicationNoteGenerationPrincipalResolver,
  type CommunicationNoteGenerationPrincipalResolver,
} from "./communication-note-generation-principal.server";
import { createCareslinkServerSupabaseClient } from "./supabase-server";
import {
  isCaresLinkV1ProductApiEnabled,
  type CaresLinkV1ProductApiAuthClient,
  type CaresLinkV1ProductApiEnv,
} from "./v1/product-api-auth.server";
import {
  createCaresLinkV1SessionStatusRpcClient,
  type CaresLinkV1SessionStatusRpcClientFactory,
} from "./v1/product-api-session-status.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";

export const CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_FLAG =
  "CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_ENABLED" as const;
export const CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF_FLAG =
  "CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF" as const;
export const CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID_FLAG =
  "CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID" as const;
export const CARESLINK_COMMUNICATION_NOTE_SESSION_STATUS_PREVIEW_SECRET_KEY =
  "CARESLINK_COMMUNICATION_NOTE_SESSION_STATUS_PREVIEW_SECRET_KEY" as const;
export const CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY =
  "TEST_ONLY_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION" as const;

export type CommunicationNoteGenerationPrincipalCompositionEnv =
  CaresLinkV1ProductApiEnv &
    Readonly<{
      CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED?: string;
      CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_ENABLED?: string;
      CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF?: string;
      CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID?: string;
      CARESLINK_COMMUNICATION_NOTE_SESSION_STATUS_PREVIEW_SECRET_KEY?: string;
      CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY?: string;
      SUPABASE_SECRET_KEY?: string;
      SUPABASE_SERVICE_ROLE_KEY?: string;
      VERCEL?: string;
      VERCEL_ENV?: string;
      VERCEL_PROJECT_ID?: string;
      VERCEL_TARGET_ENV?: string;
    }>;

export type CommunicationNoteGenerationPrincipalCompositionGuard =
  | Readonly<{
      enabled: true;
      reason: "enabled";
      supabaseUrl: string;
      targetSupabaseRef: string;
      vercelProjectId: string;
    }>
  | Readonly<{
      enabled: false;
      reason:
        | "composition_disabled"
        | "generation_disabled"
        | "product_api_disabled"
        | "non_vercel_runtime"
        | "non_preview_environment"
        | "vercel_project_unverified"
        | "supabase_target_unverified"
        | "production_target_denied"
        | "publishable_key_unavailable"
        | "privileged_key_unavailable"
        | "credential_reuse_denied";
    }>;

export type CommunicationNoteGenerationPrincipalCompositionOptions =
  Readonly<{
    env?: CommunicationNoteGenerationPrincipalCompositionEnv;
    capability?: typeof CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY;
    createCookieAuthClient?: () => Promise<
      CaresLinkV1ProductApiAuthClient | undefined
    >;
    createSessionStatusClient?: CaresLinkV1SessionStatusRpcClientFactory;
  }>;

/**
 * Approval remains absent. The source factory below models exact target and
 * custody checks, but the current database RPC still requires a
 * service-role-equivalent secret that bypasses RLS. It is therefore not an
 * approved least-privilege installation.
 */
export const COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION =
  undefined as CommunicationNoteGenerationPrincipalResolver | undefined;

export function resolveCommunicationNoteGenerationPrincipalCompositionGuard(
  env: CommunicationNoteGenerationPrincipalCompositionEnv =
    process.env as CommunicationNoteGenerationPrincipalCompositionEnv,
): CommunicationNoteGenerationPrincipalCompositionGuard {
  const resolution = resolveConfiguration(env);
  if (!resolution.ok) {
    return Object.freeze({ enabled: false, reason: resolution.reason });
  }
  return Object.freeze({
    enabled: true,
    reason: "enabled",
    supabaseUrl: resolution.config.supabaseUrl,
    targetSupabaseRef: resolution.config.targetSupabaseRef,
    vercelProjectId: resolution.config.vercelProjectId,
  });
}

/**
 * Builds a source-only resolver from a frozen Preview target snapshot.
 * Neither this factory nor module import creates a Supabase client. Both the
 * Cookie client and the dedicated privileged client are constructed lazily,
 * after the target is revalidated; the privileged client is later still and
 * cannot exist until verified claims contain canonical identity UUIDs.
 */
export function createCommunicationNoteGenerationPrincipalComposition(
  options: CommunicationNoteGenerationPrincipalCompositionOptions = {},
): CommunicationNoteGenerationPrincipalResolver | undefined {
  const injectedCookieFactory = options.createCookieAuthClient;
  const injectedSessionFactory = options.createSessionStatusClient;
  if (
    (options.env !== undefined ||
      injectedCookieFactory !== undefined ||
      injectedSessionFactory !== undefined) &&
    options.capability !==
      CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY
  ) {
    throw new Error(
      "Communication Note principal composition test ports are unavailable",
    );
  }
  if (
    (injectedCookieFactory !== undefined &&
      typeof injectedCookieFactory !== "function") ||
    (injectedSessionFactory !== undefined &&
      typeof injectedSessionFactory !== "function")
  ) {
    throw new Error(
      "Communication Note principal composition test ports are unavailable",
    );
  }
  const env =
    options.env ??
    (process.env as CommunicationNoteGenerationPrincipalCompositionEnv);
  const initial = resolveConfiguration(env);
  if (!initial.ok) {
    return undefined;
  }
  const snapshot = initial.config;

  function resolveCurrentConfiguration() {
    const current = resolveConfiguration(env);
    return current.ok && sameConfiguration(snapshot, current.config)
      ? current.config
      : undefined;
  }

  return createCommunicationNoteGenerationPrincipalResolver({
    env,
    async createCookieAuthClient() {
      if (!resolveCurrentConfiguration()) {
        return undefined;
      }
      if (injectedCookieFactory) {
        return injectedCookieFactory();
      }
      return (await createCareslinkServerSupabaseClient({
        env,
      })) as unknown as CaresLinkV1ProductApiAuthClient | undefined;
    },
    createSessionStatusClient() {
      const current = resolveCurrentConfiguration();
      if (!current) {
        return undefined;
      }
      const createClient =
        injectedSessionFactory ??
        createCaresLinkV1SessionStatusRpcClient;
      return createClient(
        current.supabaseUrl,
        current.dedicatedPrivilegedKey,
      );
    },
  });
}

type CompositionConfiguration = Readonly<{
  dedicatedPrivilegedKey: string;
  publishableKey: string;
  supabaseUrl: string;
  targetSupabaseRef: string;
  vercelProjectId: string;
}>;

type ConfigurationResolution =
  | Readonly<{ ok: true; config: CompositionConfiguration }>
  | Readonly<{
      ok: false;
      reason: Exclude<
        CommunicationNoteGenerationPrincipalCompositionGuard["reason"],
        "enabled"
      >;
    }>;

function resolveConfiguration(
  env: CommunicationNoteGenerationPrincipalCompositionEnv,
): ConfigurationResolution {
  if (
    env.CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_ENABLED !== "true"
  ) {
    return rejected("composition_disabled");
  }
  if (env.CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED !== "true") {
    return rejected("generation_disabled");
  }
  if (!isCaresLinkV1ProductApiEnabled(env)) {
    return rejected("product_api_disabled");
  }
  if (env.VERCEL !== "1") {
    return rejected("non_vercel_runtime");
  }
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_TARGET_ENV !== "preview") {
    return rejected("non_preview_environment");
  }

  const expectedVercelProjectId = parseVercelProjectId(
    env.CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID,
  );
  const vercelProjectId = parseVercelProjectId(env.VERCEL_PROJECT_ID);
  if (
    !expectedVercelProjectId ||
    !vercelProjectId ||
    expectedVercelProjectId !== vercelProjectId
  ) {
    return rejected("vercel_project_unverified");
  }

  const targetSupabaseRef = parseSupabaseProjectRef(
    env.CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF,
  );
  if (!targetSupabaseRef) {
    return rejected("supabase_target_unverified");
  }
  if (targetSupabaseRef === CARESLINK_PRODUCTION_SUPABASE_REF) {
    return rejected("production_target_denied");
  }

  const serverUrl = parseExactSupabaseUrl(env.SUPABASE_URL, targetSupabaseRef);
  const publicUrl = parseExactSupabaseUrl(
    env.NEXT_PUBLIC_SUPABASE_URL,
    targetSupabaseRef,
  );
  if (!serverUrl || !publicUrl || serverUrl !== publicUrl) {
    return rejected("supabase_target_unverified");
  }

  const serverPublishableKey = parsePublishableKey(
    env.SUPABASE_PUBLISHABLE_KEY,
  );
  const publicPublishableKey = parsePublishableKey(
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  if (
    !serverPublishableKey ||
    !publicPublishableKey ||
    serverPublishableKey !== publicPublishableKey
  ) {
    return rejected("publishable_key_unavailable");
  }

  const dedicatedPrivilegedKey = parseDedicatedSecretKey(
    env.CARESLINK_COMMUNICATION_NOTE_SESSION_STATUS_PREVIEW_SECRET_KEY,
  );
  if (!dedicatedPrivilegedKey) {
    return rejected("privileged_key_unavailable");
  }
  for (const reusedKey of [
    env.SUPABASE_SECRET_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY,
  ]) {
    if (reusedKey !== undefined && reusedKey === dedicatedPrivilegedKey) {
      return rejected("credential_reuse_denied");
    }
  }

  return {
    ok: true,
    config: Object.freeze({
      dedicatedPrivilegedKey,
      publishableKey: serverPublishableKey,
      supabaseUrl: serverUrl,
      targetSupabaseRef,
      vercelProjectId,
    }),
  };
}

function rejected(
  reason: Exclude<
    CommunicationNoteGenerationPrincipalCompositionGuard["reason"],
    "enabled"
  >,
): ConfigurationResolution {
  return Object.freeze({ ok: false, reason });
}

function parseExactSupabaseUrl(
  value: string | undefined,
  expectedRef: string,
) {
  if (!value || value !== value.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value);
    const expectedOrigin = `https://${expectedRef}.supabase.co`;
    if (
      value !== expectedOrigin ||
      url.origin !== expectedOrigin ||
      url.protocol !== "https:" ||
      url.hostname !== `${expectedRef}.supabase.co` ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return undefined;
    }
    return expectedOrigin;
  } catch {
    return undefined;
  }
}

function parseSupabaseProjectRef(value: string | undefined) {
  return value && /^[a-z0-9]{20}$/.test(value) ? value : undefined;
}

function parseVercelProjectId(value: string | undefined) {
  return value && /^prj_[A-Za-z0-9]{16,64}$/.test(value) ? value : undefined;
}

function parsePublishableKey(value: string | undefined) {
  return value && /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(value)
    ? value
    : undefined;
}

function parseDedicatedSecretKey(value: string | undefined) {
  return value && /^sb_secret_[A-Za-z0-9_-]{16,}$/.test(value)
    ? value
    : undefined;
}

function sameConfiguration(
  expected: CompositionConfiguration,
  current: CompositionConfiguration,
) {
  return (
    expected.dedicatedPrivilegedKey === current.dedicatedPrivilegedKey &&
    expected.publishableKey === current.publishableKey &&
    expected.supabaseUrl === current.supabaseUrl &&
    expected.targetSupabaseRef === current.targetSupabaseRef &&
    expected.vercelProjectId === current.vercelProjectId
  );
}
