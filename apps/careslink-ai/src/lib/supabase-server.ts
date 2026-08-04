import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";

type SupabasePublicAuthEnv = {
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
};

type ServerCookieStore = {
  getAll(): Array<{ name: string; value: string }>;
  set(
    name: string,
    value: string,
    options?: Record<string, unknown>,
  ): void;
};

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export type CareslinkServerSupabaseClient = {
  auth: {
    getUser(): Promise<{
      data: { user: SupabaseAuthUser | null };
      error: { message?: string } | null;
    }>;
    signInWithPassword(input: {
      email: string;
      password: string;
    }): Promise<{ error: { message?: string } | null }>;
    signInWithOAuth(input: {
      provider: "google";
      options: {
        redirectTo: string;
      };
    }): Promise<{
      data: { url: string | null };
      error: { message?: string } | null;
    }>;
    signUp(input: {
      email: string;
      password: string;
      options: {
        data: {
          name: string;
          careslink_signup_role: "provider";
        };
      };
    }): Promise<{
      data: { session: unknown | null };
      error: { message?: string } | null;
    }>;
    resetPasswordForEmail(
      email: string,
      options: {
        redirectTo: string;
      },
    ): Promise<{ error: { message?: string } | null }>;
    updateUser(input: {
      password: string;
    }): Promise<{ error: { message?: string } | null }>;
    exchangeCodeForSession(
      code: string,
    ): Promise<{ error: { message?: string } | null }>;
    signOut(): Promise<{ error: { message?: string } | null }>;
  };
};

type CreateServerClientFunction = (
  supabaseUrl: string,
  supabaseKey: string,
  options: {
    cookies: {
      getAll(): Array<{ name: string; value: string }>;
      setAll(cookiesToSet: CookieToSet[]): void;
    };
  },
) => CareslinkServerSupabaseClient;

type CreateCareslinkServerSupabaseClientOptions = {
  cookieStore?: ServerCookieStore;
  createServerClient?: CreateServerClientFunction;
  env?: SupabasePublicAuthEnv;
};

type ClearCareslinkSupabaseAuthCookiesOptions = {
  cookieStore?: ServerCookieStore;
};

const SUPABASE_AUTH_COOKIE_PATTERN =
  /^sb-[a-z0-9]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/i;

export function getSupabasePublicAuthConfig(
  env: SupabasePublicAuthEnv = process.env as SupabasePublicAuthEnv,
) {
  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    env.SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    return undefined;
  }

  return {
    supabaseUrl,
    publishableKey,
  };
}

export async function createCareslinkServerSupabaseClient({
  cookieStore,
  createServerClient = createSupabaseServerClient as unknown as CreateServerClientFunction,
  env = process.env as SupabasePublicAuthEnv,
}: CreateCareslinkServerSupabaseClientOptions = {}) {
  const config = getSupabasePublicAuthConfig(env);

  if (!config) {
    return undefined;
  }

  const store = cookieStore ?? ((await nextCookies()) as unknown as ServerCookieStore);

  return createServerClient(config.supabaseUrl, config.publishableKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            store.set(name, value, options);
          });
        } catch {
          // Server Components cannot always mutate cookies. Route handlers and
          // server actions can, and middleware can refresh sessions separately.
        }
      },
    },
  });
}

export async function clearCareslinkSupabaseAuthCookies({
  cookieStore,
}: ClearCareslinkSupabaseAuthCookiesOptions = {}) {
  const store = cookieStore ?? ((await nextCookies()) as unknown as ServerCookieStore);

  try {
    const authCookies = store
      .getAll()
      .filter(({ name }) => SUPABASE_AUTH_COOKIE_PATTERN.test(name));

    authCookies.forEach(({ name }) => {
      store.set(name, "", {
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    });

    return { ok: true as const, cleared: authCookies.length };
  } catch {
    return { ok: false as const, cleared: 0 };
  }
}
