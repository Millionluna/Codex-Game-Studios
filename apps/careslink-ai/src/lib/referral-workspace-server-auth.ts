import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  getWorkspaceAccountOptions,
  type WorkspaceAccount,
  type WorkspaceAccountRole,
} from "./referral-workspace-auth";

type WorkspaceServerAuthEnv = {
  CARESLINK_ENABLE_DEMO_AUTH?: string;
  NODE_ENV?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_URL?: string;
};

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type SupabaseAuthError = {
  message?: string;
};

type SupabaseAuthClient = {
  auth: {
    getUser(accessToken: string): Promise<{
      data: { user: SupabaseAuthUser | null };
      error: SupabaseAuthError | null;
    }>;
  };
};

type WorkspaceAccountResolution =
  | {
      source: "supabase" | "demo";
      account: WorkspaceAccount;
      error?: undefined;
    }
  | {
      source: "supabase" | "none";
      account?: undefined;
      error?: string;
    };

type WorkspaceAccountRequestOptions = {
  createAuthClient?: () => SupabaseAuthClient | undefined;
  demoAccountId?: string;
  env?: WorkspaceServerAuthEnv;
};

export async function resolveWorkspaceAccountFromRequest(
  request: Request,
  {
    createAuthClient,
    demoAccountId,
    env = process.env as WorkspaceServerAuthEnv,
  }: WorkspaceAccountRequestOptions = {},
): Promise<WorkspaceAccountResolution> {
  const accessToken = getBearerAccessToken(request.headers.get("authorization"));

  if (accessToken) {
    const authClient =
      createAuthClient?.() ?? createSupabaseAuthClientFromEnv(env);

    if (!authClient) {
      return {
        source: "supabase",
        error: "Supabase auth is not configured",
      };
    }

    const { data, error } = await authClient.auth.getUser(accessToken);

    if (error || !data.user) {
      return {
        source: "supabase",
        error: "Invalid auth session",
      };
    }

    return {
      source: "supabase",
      account: createWorkspaceAccountFromSupabaseUser(data.user),
    };
  }

  if (demoAccountId && isDemoWorkspaceAuthEnabled(env)) {
    const demoAccount = getWorkspaceAccountOptions().find(
      (account) => account.id === demoAccountId,
    );

    if (demoAccount) {
      return {
        source: "demo",
        account: demoAccount,
      };
    }
  }

  return { source: "none" };
}

export function createWorkspaceAccountFromSupabaseUser(
  user: SupabaseAuthUser,
): WorkspaceAccount {
  return {
    id: user.id,
    name: getDisplayName(user),
    email: user.email ?? "",
    role: getRoleFromAppMetadata(user.app_metadata),
  };
}

export function isDemoWorkspaceAuthEnabled(
  env: WorkspaceServerAuthEnv = process.env as WorkspaceServerAuthEnv,
) {
  if (env.CARESLINK_ENABLE_DEMO_AUTH === "true") {
    return true;
  }

  if (env.CARESLINK_ENABLE_DEMO_AUTH === "false") {
    return false;
  }

  return env.NODE_ENV !== "production";
}

function createSupabaseAuthClientFromEnv(
  env: WorkspaceServerAuthEnv,
): SupabaseAuthClient | undefined {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    env.SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    return undefined;
  }

  return createSupabaseClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as SupabaseAuthClient;
}

function getRoleFromAppMetadata(
  appMetadata: Record<string, unknown> | undefined,
): WorkspaceAccountRole {
  const role = appMetadata?.careslink_role ?? appMetadata?.role;

  return role === "admin" ? "admin" : "provider";
}

function getDisplayName(user: SupabaseAuthUser) {
  const name = user.user_metadata?.name;

  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  return user.email ?? "CaresLink provider";
}

function getBearerAccessToken(authorization: string | null) {
  if (!authorization) {
    return undefined;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || undefined;
}
