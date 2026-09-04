import {
  createServerClient as createSupabaseServerClient,
  type CookieMethodsServer,
  type CookieOptions,
} from "@supabase/ssr";
import { cookies as nextCookies } from "next/headers";
import {
  getSupabasePublicAuthConfig,
  type SupabasePublicAuthEnv,
} from "./supabase-public-auth-config";

export { getSupabasePublicAuthConfig } from "./supabase-public-auth-config";

type ServerCookieStore = {
  getAll(): Array<{ name: string; value: string }>;
  set(
    name: string,
    value: string,
    options?: CookieOptions,
  ): void;
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
      getAll: CookieMethodsServer["getAll"];
      setAll: NonNullable<CookieMethodsServer["setAll"]>;
    };
  },
) => CareslinkServerSupabaseClient;

type CreateCareslinkServerSupabaseClientOptions = {
  cookieStore?: ServerCookieStore;
  createServerClient?: CreateServerClientFunction;
  env?: SupabasePublicAuthEnv;
  responseHeaders?: Pick<Headers, "set">;
};

type ClearCareslinkSupabaseAuthCookiesOptions = {
  cookieStore?: ServerCookieStore;
};

const SUPABASE_AUTH_COOKIE_PATTERN =
  /^sb-[a-z0-9]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/i;

export async function createCareslinkServerSupabaseClient({
  cookieStore,
  createServerClient = createSupabaseServerClient as unknown as CreateServerClientFunction,
  env = process.env as SupabasePublicAuthEnv,
  responseHeaders,
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
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            store.set(name, value, options);
          });
        } catch {
          // Server Components cannot always mutate cookies. Route handlers and
          // server actions can, and middleware can refresh sessions separately.
        }

        Object.entries(headers).forEach(([name, value]) => {
          responseHeaders?.set(name, value);
        });
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
