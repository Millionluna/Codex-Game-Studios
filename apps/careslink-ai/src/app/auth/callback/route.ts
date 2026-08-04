import { NextResponse } from "next/server";
import {
  getSafeAuthRedirectHref,
  getSafePendingAuthNextHref,
  getTrustedAuthRedirectRole,
  normalizeAuthLocale,
} from "@/lib/referral-workspace-auth-actions";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

const fallbackNextPath = "/auth/update-password";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const flow = requestUrl.searchParams.get("flow");

  if (flow === "oauth") {
    return handleOAuthCallback(requestUrl);
  }

  return handlePasswordResetCallback(requestUrl);
}

async function handleOAuthCallback(requestUrl: URL) {
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? undefined;
  const locale = normalizeAuthLocale(
    requestUrl.searchParams.get("lang") ?? undefined,
  );

  if (!code) {
    return redirectToOAuthError(
      requestUrl,
      next,
      locale,
      "Google sign-in was not completed. Please try again.",
    );
  }

  const supabase = await createCareslinkServerSupabaseClient();

  if (!supabase) {
    return redirectToOAuthError(
      requestUrl,
      next,
      locale,
      "Google sign-in is temporarily unavailable.",
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToOAuthError(
      requestUrl,
      next,
      locale,
      "Unable to complete Google sign-in. Please try again.",
    );
  }

  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return redirectToOAuthError(
      requestUrl,
      next,
      locale,
      "Unable to verify the signed-in account. Please try again.",
    );
  }

  const destination = getSafeAuthRedirectHref(
    next,
    locale,
    getTrustedAuthRedirectRole(data.user),
  );

  return NextResponse.redirect(new URL(destination, requestUrl));
}

async function handlePasswordResetCallback(requestUrl: URL) {
  const code = requestUrl.searchParams.get("code");
  const next = getSafeAuthCallbackNext(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/login?error=Invalid+password+reset+link.", requestUrl),
    );
  }

  const supabase = await createCareslinkServerSupabaseClient();

  if (!supabase) {
    return NextResponse.redirect(
      new URL("/auth/login?error=Supabase+auth+is+not+configured.", requestUrl),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const query = new URLSearchParams({
      error: error.message ?? "Unable to verify password reset link.",
    });

    return NextResponse.redirect(new URL(`/auth/login?${query}`, requestUrl));
  }

  return NextResponse.redirect(new URL(next, requestUrl));
}

function redirectToOAuthError(
  requestUrl: URL,
  next: string | undefined,
  locale: string | undefined,
  message: string,
) {
  const query = new URLSearchParams({ error: message });
  const safeNext = getSafePendingAuthNextHref(next);

  if (safeNext) {
    query.set("next", safeNext);
  }

  if (locale) {
    query.set("lang", locale);
  }

  const destination = new URL(`/auth/login?${query}`, requestUrl);

  // An explicit empty fragment prevents browsers from inheriting a provider
  // error fragment from the OAuth callback URL into the login page URL.
  return NextResponse.redirect(new URL(`${destination.href}#`));
}

function getSafeAuthCallbackNext(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallbackNextPath;
  }

  try {
    const parsed = new URL(next, "https://careslink.local");

    if (
      parsed.origin === "https://careslink.local" &&
      parsed.pathname === "/auth/update-password"
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return fallbackNextPath;
  }

  return fallbackNextPath;
}
