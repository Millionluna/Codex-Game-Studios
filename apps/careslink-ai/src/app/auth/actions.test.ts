import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("../../lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient:
    supabaseServerMock.createCareslinkServerSupabaseClient,
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMock.redirect,
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
}: {
  signInError?: string;
  signUpError?: string;
  signUpSession?: unknown;
  signInRole?: "provider" | "admin";
  resetPasswordError?: string;
  updateUserError?: string;
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
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
}

describe("auth server actions", () => {
  beforeEach(() => {
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();
    navigationMock.redirect.mockReset();
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
      "/referral-workspace/profile?lang=en",
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
});
