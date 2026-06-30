"use server";

import { redirect } from "next/navigation";
import {
  signInWithPasswordForWorkspace,
  signUpWithPasswordForWorkspace,
} from "../../lib/referral-workspace-auth-actions";
import { createCareslinkServerSupabaseClient } from "../../lib/supabase-server";

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

  const locale = getFormString(formData, "lang");
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
  const next = getFormString(formData, "next");
  const lang = getFormString(formData, "lang");
  const source = getFormString(formData, "source");
  const draftId = getFormString(formData, "draftId");

  if (source) {
    queryParams.set("source", source);
  }

  if (draftId) {
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
  const configured =
    process.env.NEXT_PUBLIC_CARESLINK_AI_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);

  return (configured ?? defaultAuthBaseUrl).replace(/\/+$/, "");
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
