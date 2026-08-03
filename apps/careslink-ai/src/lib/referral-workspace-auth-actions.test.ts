import { describe, expect, it, vi } from "vitest";
import {
  getSafeAuthRedirectHref,
  signInWithPasswordForWorkspace,
  signUpWithPasswordForWorkspace,
} from "./referral-workspace-auth-actions";

function createAuthClient({
  signInError,
  signUpError,
  signUpSession = null,
}: {
  signInError?: string;
  signUpError?: string;
  signUpSession?: unknown;
} = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn(async () => ({
        error: signInError ? { message: signInError } : null,
      })),
      signUp: vi.fn(async () => ({
        data: { session: signUpSession },
        error: signUpError ? { message: signUpError } : null,
      })),
    },
  };
}

describe("referral workspace auth actions", () => {
  it("signs in with email/password and redirects to a safe workspace URL", async () => {
    const authClient = createAuthClient();
    const redirect = vi.fn();

    await signInWithPasswordForWorkspace({
      email: " provider@example.com ",
      password: "secret-password",
      next: "/referral-workspace/profile?source=provider-profile-generator&draftId=abc",
      locale: "zh-Hans",
      authClient,
      redirect,
    });

    expect(authClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "provider@example.com",
      password: "secret-password",
    });
    expect(redirect).toHaveBeenCalledWith(
      "/referral-workspace/profile?source=provider-profile-generator&draftId=abc&lang=zh-Hans",
    );
  });

  it("does not redirect to external next URLs", () => {
    expect(getSafeAuthRedirectHref("https://evil.example/phish", "zh-Hans")).toBe(
      "/ai-documents?lang=zh-Hans",
    );
    expect(getSafeAuthRedirectHref("//evil.example/phish", "zh-Hans")).toBe(
      "/ai-documents?lang=zh-Hans",
    );
    expect(
      getSafeAuthRedirectHref(
        "/template-companion/ndis-case-note-lookalike",
        "zh-Hans",
      ),
    ).toBe("/ai-documents?lang=zh-Hans");
  });

  it("returns a provider to the short-lived companion claim without putting draft content in the URL", () => {
    const claimToken = "a".repeat(43);
    const next =
      `/template-companion/ndis-case-note?claimToken=${claimToken}` +
      "&source=ndis-case-note-download&resourceSlug=ndis-case-note-template&save=1";
    const redirectHref = getSafeAuthRedirectHref(next, "zh-Hans", "provider");

    expect(redirectHref).toContain(
      "/template-companion/ndis-case-note?",
    );
    expect(redirectHref).toContain(`claimToken=${claimToken}`);
    expect(redirectHref).toContain("lang=zh-Hans");
    expect(redirectHref).not.toContain("caseNoteDraft");
    expect(redirectHref).not.toContain("observableFacts");
  });

  it("returns a form error without calling Supabase when credentials are incomplete", async () => {
    const authClient = createAuthClient();
    const result = await signInWithPasswordForWorkspace({
      email: "",
      password: "",
      authClient,
      redirect: vi.fn(),
    });

    expect(result).toEqual({
      status: "error",
      message: "Email and password are required.",
    });
    expect(authClient.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a form error when Supabase sign-in fails", async () => {
    const authClient = createAuthClient({ signInError: "Invalid login credentials" });
    const result = await signInWithPasswordForWorkspace({
      email: "provider@example.com",
      password: "wrong-password",
      authClient,
      redirect: vi.fn(),
    });

    expect(result).toEqual({
      status: "error",
      message: "Invalid login credentials",
    });
  });

  it("signs up a provider with user metadata and shows email confirmation state", async () => {
    const authClient = createAuthClient();
    const redirect = vi.fn();
    const result = await signUpWithPasswordForWorkspace({
      name: " Provider Owner ",
      email: " provider@example.com ",
      password: "secret-password",
      next: "/referral-workspace/profile",
      locale: "zh-Hans",
      authClient,
      redirect,
    });

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
    expect(result).toEqual({
      status: "success",
      message: "Check your email to confirm your CaresLink AI account.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects after sign-up when Supabase returns an active session", async () => {
    const authClient = createAuthClient({ signUpSession: { access_token: "token" } });
    const redirect = vi.fn();

    await signUpWithPasswordForWorkspace({
      name: "Provider Owner",
      email: "provider@example.com",
      password: "secret-password",
      next: "/referral-workspace/profile",
      authClient,
      redirect,
    });

    expect(redirect).toHaveBeenCalledWith("/referral-workspace/profile");
  });
});
