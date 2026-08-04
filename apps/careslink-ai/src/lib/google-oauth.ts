import { getSupabasePublicAuthConfig } from "./supabase-server";

type GoogleOAuthEnv = {
  CARESLINK_GOOGLE_OAUTH_ENABLED?: string;
};

type GoogleOAuthSettingsResponse = {
  external?: {
    google?: unknown;
  };
};

type GoogleOAuthFetcher = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "json">>;

export async function isGoogleOAuthAvailable(
  env: GoogleOAuthEnv = process.env as GoogleOAuthEnv,
  fetcher: GoogleOAuthFetcher = fetch,
  config = getSupabasePublicAuthConfig(),
) {
  if (env.CARESLINK_GOOGLE_OAUTH_ENABLED !== "true" || !config) {
    return false;
  }

  try {
    const response = await fetcher(
      `${config.supabaseUrl.replace(/\/+$/, "")}/auth/v1/settings`,
      {
        method: "GET",
        headers: {
          apikey: config.publishableKey,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return false;
    }

    const settings = (await response.json()) as GoogleOAuthSettingsResponse;
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
