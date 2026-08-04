import { describe, expect, it, vi } from "vitest";
import { isGoogleOAuthAvailable } from "./google-oauth";

const config = {
  supabaseUrl: "https://project.supabase.co",
  publishableKey: "publishable-key",
};

describe("Google OAuth availability", () => {
  it("requires both the release gate and an enabled Supabase provider", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ external: { google: true } }),
    }));

    await expect(
      isGoogleOAuthAvailable(
        { CARESLINK_GOOGLE_OAUTH_ENABLED: "true" },
        fetcher,
        config,
      ),
    ).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/settings",
      expect.objectContaining({
        method: "GET",
        headers: { apikey: "publishable-key" },
        cache: "no-store",
      }),
    );
  });

  it("fails closed when the release gate is absent or not exactly true", async () => {
    await expect(isGoogleOAuthAvailable({}, vi.fn(), config)).resolves.toBe(false);
    await expect(
      isGoogleOAuthAvailable(
        { CARESLINK_GOOGLE_OAUTH_ENABLED: "false" },
        vi.fn(),
        config,
      ),
    ).resolves.toBe(false);
    await expect(
      isGoogleOAuthAvailable(
        { CARESLINK_GOOGLE_OAUTH_ENABLED: "TRUE" },
        vi.fn(),
        config,
      ),
    ).resolves.toBe(false);
  });

  it("hides Google when Supabase does not confirm the provider", async () => {
    const disabled = vi.fn(async () => ({
      ok: true,
      json: async () => ({ external: { google: false } }),
    }));
    const unavailable = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    }));

    await expect(
      isGoogleOAuthAvailable(
        { CARESLINK_GOOGLE_OAUTH_ENABLED: "true" },
        disabled,
        config,
      ),
    ).resolves.toBe(false);
    await expect(
      isGoogleOAuthAvailable(
        { CARESLINK_GOOGLE_OAUTH_ENABLED: "true" },
        unavailable,
        config,
      ),
    ).resolves.toBe(false);
  });
});
