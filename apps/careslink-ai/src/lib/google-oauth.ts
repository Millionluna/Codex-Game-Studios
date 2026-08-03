type GoogleOAuthEnv = {
  CARESLINK_GOOGLE_OAUTH_ENABLED?: string;
};

export function isGoogleOAuthAvailable(
  env: GoogleOAuthEnv = process.env as GoogleOAuthEnv,
) {
  return env.CARESLINK_GOOGLE_OAUTH_ENABLED === "true";
}
