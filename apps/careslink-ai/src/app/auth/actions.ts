"use server";

import { redirect } from "next/navigation";
import { isGoogleOAuthAvailable } from "../../lib/google-oauth";
import {
  getSafeAuthRedirectHref,
  getSafePendingAuthNextHref,
  normalizeAuthLocale,
  signInWithPasswordForWorkspace,
  signUpWithPasswordForWorkspace,
} from "../../lib/referral-workspace-auth-actions";
import {
  clearCareslinkSupabaseAuthCookies,
  createCareslinkServerSupabaseClient,
  getSupabasePublicAuthConfig,
} from "../../lib/supabase-server";

const defaultAuthBaseUrl = "https://ai.careslink.com.au";

export async function loginWithSupabaseAction(formData: FormData) {
  const supabase = await createCareslinkServerSupabaseClient();

  if (!supabase) {
    return redirect(
      getAuthPageRedirectHref("/auth/login", formData, {
        error: "Supabase auth is not configured.",
      }),
    );
  }

  const result = await signInWithPasswordForWorkspace({
    email: getFormString(formData, "email"),
    password: getFormString(formData, "password"),
    next: getFormString(formData, "next"),
    locale: getFormString(formData, "lang"),
    authClient: supabase,
    redirect,
  });

  if (result.status === "error") {
    return redirect(
      getAuthPageRedirectHref("/auth/login", formData, {
        error: result.message,
      }),
    );
  }

  return undefined;
}

export async function registerWithSupabaseAction(formData: FormData) {
  const supabase = await createCareslinkServerSupabaseClient();

  if (!supabase) {
    return redirect(
      getAuthPageRedirectHref("/auth/register", formData, {
        error: "Supabase auth is not configured.",
      }),
    );
  }

  const result = await signUpWithPasswordForWorkspace({
    name: getFormString(formData, "name"),
    email: getFormString(formData, "email"),
    password: getFormString(formData, "password"),
    next: getFormString(formData, "next"),
    locale: getFormString(formData, "lang"),
    authClient: supabase,
    redirect,
  });

  if (result.status === "error") {
    return redirect(
      getAuthPageRedirectHref("/auth/register", formData, {
        error: getReadableRegisterError(result.message),
      }),
    );
  }

  if (result.message === "Account created.") {
    return undefined;
  }

  return redirect(
    getAuthPageRedirectHref("/auth/login", formData, {
      notice: "confirm-email",
    }),
  );
}

export async function continueWithGoogleFromLoginAction(formData: FormData) {
  return continueWithGoogleAction("/auth/login", formData);
}

export async function continueWithGoogleFromRegisterAction(formData: FormData) {
  return continueWithGoogleAction("/auth/register", formData);
}

export async function signOutAction(formData: FormData) {
  const locale = normalizeAuthLocale(getFormString(formData, "lang"));
  const safeReturnTo =
    getSafePendingAuthNextHref(getFormString(formData, "returnTo")) ??
    getSafeAuthRedirectHref(undefined, undefined, "provider");
  formData.set("next", safeReturnTo);

  const supabase = await createCareslinkServerSupabaseClient();

  if (!supabase) {
    const cookieCleanup = await clearCareslinkSupabaseAuthCookies();

    return redirect(
      getAuthPageRedirectHref("/auth/login", formData, {
        error: cookieCleanup.ok
          ? "Authentication is unavailable. Local session cookies were cleared, but remote sign-out could not be confirmed. Please try again before continuing."
          : "Authentication is unavailable and local session cookies could not be cleared. Do not continue on this device until sign-out succeeds.",
      }),
    );
  }

  const { error } = await supabase.auth.signOut();
  const cookieCleanup = await clearCareslinkSupabaseAuthCookies();

  if (error || !cookieCleanup.ok) {
    return redirect(
      getAuthPageRedirectHref("/auth/login", formData, {
        error: "Unable to confirm sign-out. Please try again.",
      }),
    );
  }

  if (locale) {
    formData.set("lang", locale);
  }

  return redirect(
    getAuthPageRedirectHref("/auth/login", formData, {
      notice: "signed-out",
    }),
  );
}

async function continueWithGoogleAction(
  returnPath: "/auth/login" | "/auth/register",
  formData: FormData,
) {
  const locale = normalizeAuthLocale(getFormString(formData, "lang"));
  const safeNext =
    getSafePendingAuthNextHref(getFormString(formData, "next")) ??
    getSafeAuthRedirectHref(undefined, undefined, "provider");

  if (!(await isGoogleOAuthAvailable())) {
    return redirect(
      getAuthPageRedirectHref(returnPath, formData, {
        error: "Google sign-in is not available. Please use email and password.",
      }),
    );
  }

  const supabase = await createCareslinkServerSupabaseClient();

  if (!supabase) {
    return redirect(
      getAuthPageRedirectHref(returnPath, formData, {
        error: "Supabase auth is not configured.",
      }),
    );
  }

  const callbackUrl = new URL("/auth/callback", getAuthBaseUrl());
  callbackUrl.searchParams.set("flow", "oauth");
  callbackUrl.searchParams.set("next", safeNext);

  if (locale) {
    callbackUrl.searchParams.set("lang", locale);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url || !isTrustedSupabaseOAuthUrl(data.url)) {
    return redirect(
      getAuthPageRedirectHref(returnPath, formData, {
        error: "Unable to start Google sign-in. Please try again.",
      }),
    );
  }

  return redirect(data.url);
}

export async function requestPasswordResetAction(formData: FormData) {
  const supabase = await createCareslinkServerSupabaseClient();

  if (!supabase) {
    return redirect(
      getAuthPageRedirectHref("/auth/forgot-password", formData, {
        error: "Supabase auth is not configured.",
      }),
    );
  }

  const email = getFormString(formData, "email").trim();

  if (!email) {
    return redirect(
      getAuthPageRedirectHref("/auth/forgot-password", formData, {
        error: "Email is required.",
      }),
    );
  }

  const locale = normalizeAuthLocale(getFormString(formData, "lang"));
  const updatePasswordPath = locale
    ? `/auth/update-password?lang=${encodeURIComponent(locale)}`
    : "/auth/update-password";
  const redirectTo = `${getAuthBaseUrl()}/auth/callback?next=${encodeURIComponent(updatePasswordPath)}`;

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  return redirect(
    getAuthPageRedirectHref("/auth/login", formData, {
      notice: "password-reset-sent",
    }),
  );
}

export async function updatePasswordAction(formData: FormData) {
  const supabase = await createCareslinkServerSupabaseClient();

  if (!supabase) {
    return redirect(
      getAuthPageRedirectHref("/auth/update-password", formData, {
        error: "Supabase auth is not configured.",
      }),
    );
  }

  const password = getFormString(formData, "password");
  const confirmPassword = getFormString(formData, "confirmPassword");

  if (!password || password.length < 8) {
    return redirect(
      getAuthPageRedirectHref("/auth/update-password", formData, {
        error: "Password must be at least 8 characters.",
      }),
    );
  }

  if (password !== confirmPassword) {
    return redirect(
      getAuthPageRedirectHref("/auth/update-password", formData, {
        error: "Passwords do not match.",
      }),
    );
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return redirect(
      getAuthPageRedirectHref("/auth/update-password", formData, {
        error: error.message ?? "Unable to update password.",
      }),
    );
  }

  await supabase.auth.signOut();

  return redirect(
    getAuthPageRedirectHref("/auth/login", formData, {
      notice: "password-updated",
    }),
  );
}

function getAuthPageRedirectHref(
  pathname:
    | "/auth/login"
    | "/auth/register"
    | "/auth/forgot-password"
    | "/auth/update-password",
  formData: FormData,
  params: { error?: string; notice?: string },
) {
  const queryParams = new URLSearchParams();
  const next = getSafePendingAuthNextHref(getFormString(formData, "next"));
  const lang = normalizeAuthLocale(getFormString(formData, "lang"));
  const source = getFormString(formData, "source");
  const draftId = getFormString(formData, "draftId");

  if (source === "provider-profile-generator") {
    queryParams.set("source", source);
  }

  if (draftId && /^[A-Za-z0-9_-]{1,100}$/.test(draftId)) {
    queryParams.set("draftId", draftId);
  }

  if (next) {
    queryParams.set("next", next);
  }

  if (lang) {
    queryParams.set("lang", lang);
  }

  if (params.error) {
    queryParams.set("error", params.error);
  }

  if (params.notice) {
    queryParams.set("notice", params.notice);
  }

  const queryString = queryParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

function getAuthBaseUrl() {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`.replace(
      /\/+$/,
      "",
    );
  }

  const configured =
    process.env.NEXT_PUBLIC_CARESLINK_AI_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);

  return (configured ?? defaultAuthBaseUrl).replace(/\/+$/, "");
}

function isTrustedSupabaseOAuthUrl(href: string) {
  const config = getSupabasePublicAuthConfig();

  if (!config) {
    return false;
  }

  try {
    const target = new URL(href);
    const supabaseOrigin = new URL(config.supabaseUrl).origin;

    return (
      target.origin === supabaseOrigin &&
      target.pathname === "/auth/v1/authorize"
    );
  } catch {
    return false;
  }
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function getReadableRegisterError(message: string) {
  if (/rate limit/i.test(message)) {
    return "Email sign-up is temporarily rate limited. For local testing, sign in with an existing confirmed provider test account or wait before trying again.";
  }

  return message;
}
