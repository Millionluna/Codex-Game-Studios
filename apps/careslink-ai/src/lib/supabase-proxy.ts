import {
  createServerClient as createSupabaseServerClient,
  type CookieMethodsServer,
} from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabasePublicAuthConfig,
  type SupabasePublicAuthEnv,
} from "./supabase-public-auth-config";

export type SupabaseProxyClient = {
  auth: {
    getClaims(): Promise<unknown>;
  };
};

export type CreateSupabaseProxyClient = (
  supabaseUrl: string,
  publishableKey: string,
  options: {
    cookies: {
      getAll: CookieMethodsServer["getAll"];
      setAll: NonNullable<CookieMethodsServer["setAll"]>;
    };
  },
) => SupabaseProxyClient;

type RefreshCareslinkSupabaseSessionOptions = {
  createServerClient?: CreateSupabaseProxyClient;
  env?: SupabasePublicAuthEnv;
};

const createDefaultSupabaseProxyClient: CreateSupabaseProxyClient = (
  supabaseUrl,
  publishableKey,
  options,
) => createSupabaseServerClient(supabaseUrl, publishableKey, options);

export async function refreshCareslinkSupabaseSession(
  request: NextRequest,
  {
    createServerClient = createDefaultSupabaseProxyClient,
    env = process.env as SupabasePublicAuthEnv,
  }: RefreshCareslinkSupabaseSessionOptions = {},
) {
  let response = NextResponse.next({ request });
  const config = getSupabasePublicAuthConfig(env);

  if (!config) {
    return response;
  }

  const supabase = createServerClient(config.supabaseUrl, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  // This is deliberately session maintenance only. Pages, Route Handlers and
  // Server Actions remain responsible for their own authorization decisions.
  await supabase.auth.getClaims();

  return response;
}
