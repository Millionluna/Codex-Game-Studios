import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.hoisted(() => ({
  clearCareslinkSupabaseAuthCookies: vi.fn(),
  createCareslinkServerSupabaseClient: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

const googleOAuthMock = vi.hoisted(() => ({
  isGoogleOAuthAvailable: vi.fn(),
}));

vi.mock("../../lib/supabase-server", () => ({
  clearCareslinkSupabaseAuthCookies:
    supabaseServerMock.clearCareslinkSupabaseAuthCookies,
  createCareslinkServerSupabaseClient:
    supabaseServerMock.createCareslinkServerSupabaseClient,
  getSupabasePublicAuthConfig: () => ({
    supabaseUrl: "https://project.supabase.co",
    publishableKey: "publishable-key",
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMock.redirect,
}));

vi.mock("../../lib/google-oauth", () => ({
  isGoogleOAuthAvailable: googleOAuthMock.isGoogleOAuthAvailable,
}));

function createFormData(values: Record<string, string>) {
  const formData = new FormData();

  Object.entries(values).forEach(([key, value]) => formData.set(key, value));

  return formData;
}

function createAuthClient({
  signInError,
  signUpError,
  signUpSession = null,
  signInRole = "provider",
  resetPasswordError,
  updateUserError,
  oauthError,
  oauthUrl = "https://project.supabase.co/auth/v1/authorize?provider=google",
  signOutError,
}: {
  signInError?: string;
  signUpError?: string;
  signUpSession?: unknown;
  signInRole?: "provider" | "admin";
  resetPasswordError?: string;
  updateUserError?: string;
  oauthError?: string;
  oauthUrl?: string | null;
  signOutError?: string;
} = {}) {
  return {
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(async () => ({
        data: {
          user: {
            app_metadata: {
              careslink_role: signInRole,
            },
          },
        },
        error: signInError ? { message: signInError } : null,
      })),
      signInWithOAuth: vi.fn(
        async (_input: {
          provider: "google";
          options: { redirectTo: string };
        }) => {
          void _input;

          return {
            data: { url: oauthUrl },
            error: oauthError ? { message: oauthError } : null,
          };
        },
      ),
      signUp: vi.fn(async () => ({
        data: { session: signUpSession },
        error: signUpError ? { message: signUpError } : null,
      })),
      resetPasswordForEmail: vi.fn(async () => ({
        error: resetPasswordError ? { message: resetPasswordError } : null,
      })),
      updateUser: vi.fn(async () => ({
        error: updateUserError ? { message: updateUserError } : null,
      })),
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({
        error: signOutError ? { message: signOutError } : null,
      })),
    },
  };
}

describe("auth server actions", () => {
  beforeEach(() => {
    supabaseServerMock.clearCareslinkSupabaseAuthCookies.mockReset();
    supabaseServerMock.clearCareslinkSupabaseAuthCookies.mockResolvedValue({
      ok: true,
      cleared: 1,
    });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();
    navigationMock.redirect.mockReset();
    googleOAuthMock.isGoogleOAuthAvailable.mockReset();
    googleOAuthMock.isGoogleOAuthAvailable.mockResolvedValue(true);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "publishable-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs in with Supabase and redirects to the safe workspace next route", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { loginWithSupabaseAction } = await import("./actions");

    await loginWithSupabaseAction(
      createFormData({
        email: " provider@example.com ",
        password: "secret-password",
        next: "/referral-workspace/profile?draftId=sample-harbour",
        lang: "zh-Hans",
      }),
    );

    expect(authClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "provider@example.com",
      password: "secret-password",
    });
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/referral-workspace/profile?draftId=sample-harbour&lang=zh-Hans",
    );
  });

  it("signs in an admin and redirects to a safe admin material usage next route", async () => {
    const authClient = createAuthClient({ signInRole: "admin" });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { loginWithSupabaseAction } = await import("./actions");

    await loginWithSupabaseAction(
      createFormData({
        email: "admin@example.com",
        password: "secret-password",
        next: "/admin/material-usage",
        lang: "en",
      }),
    );

    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/admin/material-usage?lang=en",
    );
  });

  it("sends an admin with no next route to the admin cockpit fallback", async () => {
    const authClient = createAuthClient({ signInRole: "admin" });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { loginWithSupabaseAction } = await import("./actions");

    await loginWithSupabaseAction(
      createFormData({
        email: "admin@example.com",
        password: "secret-password",
        lang: "en",
      }),
    );

    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/referral-workspace?lang=en",
    );
  });

  it("does not redirect provider sessions into admin routes from next", async () => {
    const authClient = createAuthClient({ signInRole: "provider" });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { loginWithSupabaseAction } = await import("./actions");

    await loginWithSupabaseAction(
      createFormData({
        email: "provider@example.com",
        password: "secret-password",
        next: "/admin/material-usage",
        lang: "en",
      }),
    );

    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/ai-documents?lang=en",
    );
  });

  it("starts Google OAuth with a safe provider callback and redirects to Supabase", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { continueWithGoogleFromLoginAction } = await import("./actions");

    await continueWithGoogleFromLoginAction(
      createFormData({
        next: "/template-companion/ndis-case-note?source=ndis-case-note-download",
        lang: "zh-Hans",
      }),
    );

    expect(authClient.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: expect.stringMatching(
          /^https:\/\/ai\.careslink\.com\.au\/auth\/callback\?/,
        ),
      },
    });

    const redirectTo = new URL(
      authClient.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo,
    );
    expect(redirectTo.searchParams.get("flow")).toBe("oauth");
    expect(redirectTo.searchParams.get("lang")).toBe("zh-Hans");
    expect(redirectTo.searchParams.get("next")).toBe(
      "/template-companion/ndis-case-note?source=ndis-case-note-download&resourceSlug=ndis-case-note-template",
    );
    expect(navigationMock.redirect).toHaveBeenLastCalledWith(
      "https://project.supabase.co/auth/v1/authorize?provider=google",
    );
  });

  it("rejects an external OAuth next value before constructing the callback", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { continueWithGoogleFromRegisterAction } = await import("./actions");

    await continueWithGoogleFromRegisterAction(
      createFormData({
        next: "https://evil.example/steal",
        lang: "en",
      }),
    );

    const redirectTo = new URL(
      authClient.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo,
    );
    expect(redirectTo.searchParams.get("next")).toBe("/ai-documents");
    expect(redirectTo.toString()).not.toContain("evil.example");
  });

  it("preserves a safe admin next until the callback verifies the account role", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { continueWithGoogleFromLoginAction } = await import("./actions");

    await continueWithGoogleFromLoginAction(
      createFormData({ next: "/admin/material-usage", lang: "en" }),
    );

    const redirectTo = new URL(
      authClient.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo,
    );
    expect(redirectTo.searchParams.get("next")).toBe("/admin/material-usage");
    expect(redirectTo.searchParams.get("lang")).toBe("en");
  });

  it("uses the deployment-specific callback for Preview OAuth", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "careslink-preview.example.vercel.app");
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { continueWithGoogleFromLoginAction } = await import("./actions");

    await continueWithGoogleFromLoginAction(
      createFormData({ next: "/ai-documents", lang: "en" }),
    );

    expect(
      authClient.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo,
    ).toMatch(/^https:\/\/careslink-preview\.example\.vercel\.app\/auth\/callback\?/);
  });

  it("fails closed in-page when Google is disabled", async () => {
    googleOAuthMock.isGoogleOAuthAvailable.mockResolvedValue(false);
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { continueWithGoogleFromLoginAction } = await import("./actions");

    await continueWithGoogleFromLoginAction(
      createFormData({ next: "/ai-documents", lang: "en" }),
    );

    expect(authClient.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?next=%2Fai-documents&lang=en&error=Google+sign-in+is+not+available.+Please+use+email+and+password.",
    );
  });

  it("does not follow a non-Supabase URL returned by the OAuth client", async () => {
    const authClient = createAuthClient({
      oauthUrl: "https://evil.example/authorize",
    });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { continueWithGoogleFromLoginAction } = await import("./actions");

    await continueWithGoogleFromLoginAction(
      createFormData({ next: "/ai-documents", lang: "en" }),
    );

    expect(navigationMock.redirect).toHaveBeenLastCalledWith(
      "/auth/login?next=%2Fai-documents&lang=en&error=Unable+to+start+Google+sign-in.+Please+try+again.",
    );
  });

  it("redirects back to login with an error when Supabase auth is unavailable", async () => {
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(undefined);
    const { loginWithSupabaseAction } = await import("./actions");

    await loginWithSupabaseAction(
      createFormData({
        email: "provider@example.com",
        password: "secret-password",
        next: "/referral-workspace/profile",
        lang: "zh-Hans",
      }),
    );

    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?next=%2Freferral-workspace%2Fprofile&lang=zh-Hans&error=Supabase+auth+is+not+configured.",
    );
  });

  it("registers a provider account and returns to login when email confirmation is needed", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { registerWithSupabaseAction } = await import("./actions");

    await registerWithSupabaseAction(
      createFormData({
        name: " Provider Owner ",
        email: " provider@example.com ",
        password: "secret-password",
        next: "/referral-workspace/profile",
        lang: "zh-Hans",
      }),
    );

    expect(authClient.auth.signUp).toHaveBeenCalledWith({
      email: "provider@example.com",
      password: "secret-password",
      options: {
        data: {
          name: "Provider Owner",
          careslink_signup_role: "provider",
        },
      },
    });
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?next=%2Freferral-workspace%2Fprofile&lang=zh-Hans&notice=confirm-email",
    );
  });

  it("explains Supabase email rate limits when provider registration is throttled", async () => {
    const authClient = createAuthClient({
      signUpError: "email rate limit exceeded",
    });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { registerWithSupabaseAction } = await import("./actions");

    await registerWithSupabaseAction(
      createFormData({
        name: "Provider Owner",
        email: "provider@example.com",
        password: "secret-password",
        next: "/referral-workspace/profile",
        lang: "en",
      }),
    );

    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/register?next=%2Freferral-workspace%2Fprofile&lang=en&error=Email+sign-up+is+temporarily+rate+limited.+For+local+testing%2C+sign+in+with+an+existing+confirmed+provider+test+account+or+wait+before+trying+again.",
    );
  });

  it("requests a Supabase password reset email with the AI custom-domain callback", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { requestPasswordResetAction } = await import("./actions");

    await requestPasswordResetAction(
      createFormData({
        email: " alex.zhushihao@hotmail.com ",
        lang: "zh-Hans",
      }),
    );

    expect(authClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "alex.zhushihao@hotmail.com",
      {
        redirectTo:
          "https://ai.careslink.com.au/auth/callback?next=%2Fauth%2Fupdate-password%3Flang%3Dzh-Hans",
      },
    );
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?lang=zh-Hans&notice=password-reset-sent",
    );
  });

  it("drops unsupported locale values from password reset redirects", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { requestPasswordResetAction } = await import("./actions");

    await requestPasswordResetAction(
      createFormData({
        email: "provider@example.com",
        lang: "https://evil.example/steal",
      }),
    );

    expect(authClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "provider@example.com",
      {
        redirectTo:
          "https://ai.careslink.com.au/auth/callback?next=%2Fauth%2Fupdate-password",
      },
    );
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?notice=password-reset-sent",
    );
  });

  it("updates a recovered user's password and returns to login", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { updatePasswordAction } = await import("./actions");

    await updatePasswordAction(
      createFormData({
        password: "new-secure-password",
        confirmPassword: "new-secure-password",
        lang: "en",
      }),
    );

    expect(authClient.auth.updateUser).toHaveBeenCalledWith({
      password: "new-secure-password",
    });
    expect(authClient.auth.signOut).toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?lang=en&notice=password-updated",
    );
  });

  it("keeps users on update password when confirmation does not match", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { updatePasswordAction } = await import("./actions");

    await updatePasswordAction(
      createFormData({
        password: "new-secure-password",
        confirmPassword: "different-secure-password",
        lang: "en",
      }),
    );

    expect(authClient.auth.updateUser).not.toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/update-password?lang=en&error=Passwords+do+not+match.",
    );
  });

  it("signs a provider out and preserves a safe provider return route", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { signOutAction } = await import("./actions");

    await signOutAction(
      createFormData({
        returnTo: "/template-companion/ndis-case-note?lang=zh-Hans",
        lang: "zh-Hans",
      }),
    );

    expect(authClient.auth.signOut).toHaveBeenCalledOnce();
    expect(
      supabaseServerMock.clearCareslinkSupabaseAuthCookies,
    ).toHaveBeenCalledOnce();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?next=%2Ftemplate-companion%2Fndis-case-note%3Fsource%3Dndis-case-note-download%26resourceSlug%3Dndis-case-note-template%26lang%3Dzh-Hans&lang=zh-Hans&notice=signed-out",
    );
  });

  it("fails closed and clears local auth cookies when Supabase is unavailable", async () => {
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      undefined,
    );
    const { signOutAction } = await import("./actions");

    await signOutAction(
      createFormData({
        returnTo: "/template-companion/ndis-case-note?lang=en",
        lang: "en",
      }),
    );

    expect(
      supabaseServerMock.clearCareslinkSupabaseAuthCookies,
    ).toHaveBeenCalledOnce();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      expect.stringContaining("error=Authentication+is+unavailable."),
    );
    expect(navigationMock.redirect).not.toHaveBeenCalledWith(
      expect.stringContaining("notice=signed-out"),
    );
  });

  it("does not report success when remote sign-out or cookie cleanup fails", async () => {
    const authClient = createAuthClient({ signOutError: "network unavailable" });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      authClient,
    );
    const { signOutAction } = await import("./actions");

    await signOutAction(
      createFormData({
        returnTo: "/ai-documents?lang=en",
        lang: "en",
      }),
    );

    expect(
      supabaseServerMock.clearCareslinkSupabaseAuthCookies,
    ).toHaveBeenCalledOnce();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      expect.stringContaining("error=Unable+to+confirm+sign-out."),
    );
    expect(navigationMock.redirect).not.toHaveBeenCalledWith(
      expect.stringContaining("notice=signed-out"),
    );
  });

  it("signs an admin out and preserves a safe admin return route", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { signOutAction } = await import("./actions");

    await signOutAction(
      createFormData({
        returnTo: "/admin/material-usage?lang=en",
        lang: "en",
      }),
    );

    expect(authClient.auth.signOut).toHaveBeenCalledOnce();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?next=%2Fadmin%2Fmaterial-usage%3Flang%3Den&lang=en&notice=signed-out",
    );
  });

  it("drops an external sign-out return route", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(authClient);
    const { signOutAction } = await import("./actions");

    await signOutAction(
      createFormData({
        returnTo: "https://evil.example/collect",
        lang: "en",
      }),
    );

    expect(authClient.auth.signOut).toHaveBeenCalledOnce();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/auth/login?next=%2Fai-documents&lang=en&notice=signed-out",
    );
  });
});
