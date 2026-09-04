import { NextResponse } from "next/server";
import {
  getSafeAuthRedirectHref,
  getSafePendingAuthNextHref,
  getTrustedAuthRedirectRole,
  normalizeAuthLocale,
} from "@/lib/referral-workspace-auth-actions";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

const fallbackNextPath = "/auth/update-password";
const AUTH_CALLBACK_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const flow = requestUrl.searchParams.get("flow");
  const responseHeaders = new Headers(AUTH_CALLBACK_RESPONSE_HEADERS);

  if (flow === "oauth") {
    return handleOAuthCallback(requestUrl, responseHeaders);
  }

  return handlePasswordResetCallback(requestUrl, responseHeaders);
}

async function handleOAuthCallback(requestUrl: URL, responseHeaders: Headers) {
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
      responseHeaders,
    );
  }

  const supabase = await createCareslinkServerSupabaseClient({ responseHeaders });

  if (!supabase) {
    return redirectToOAuthError(
      requestUrl,
      next,
      locale,
      "Google sign-in is temporarily unavailable.",
      responseHeaders,
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToOAuthError(
      requestUrl,
      next,
      locale,
      "Unable to complete Google sign-in. Please try again.",
      responseHeaders,
    );
  }

  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return redirectToOAuthError(
      requestUrl,
      next,
      locale,
      "Unable to verify the signed-in account. Please try again.",
      responseHeaders,
    );
  }

  const destination = getSafeAuthRedirectHref(
    next,
    locale,
    getTrustedAuthRedirectRole(data.user),
  );

  return redirectWithAuthResponseHeaders(
    new URL(destination, requestUrl),
    responseHeaders,
  );
}

async function handlePasswordResetCallback(
  requestUrl: URL,
  responseHeaders: Headers,
) {
  const code = requestUrl.searchParams.get("code");
  const next = getSafeAuthCallbackNext(requestUrl.searchParams.get("next"));

  if (!code) {
    return redirectWithAuthResponseHeaders(
      new URL("/auth/login?error=Invalid+password+reset+link.", requestUrl),
      responseHeaders,
    );
  }

  const supabase = await createCareslinkServerSupabaseClient({ responseHeaders });

  if (!supabase) {
    return redirectWithAuthResponseHeaders(
      new URL("/auth/login?error=Supabase+auth+is+not+configured.", requestUrl),
      responseHeaders,
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const query = new URLSearchParams({
      error: error.message ?? "Unable to verify password reset link.",
    });

    return redirectWithAuthResponseHeaders(
      new URL(`/auth/login?${query}`, requestUrl),
      responseHeaders,
    );
  }

  return redirectWithAuthResponseHeaders(new URL(next, requestUrl), responseHeaders);
}

function redirectToOAuthError(
  requestUrl: URL,
  next: string | undefined,
  locale: string | undefined,
  message: string,
  responseHeaders: Headers,
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
  return redirectWithAuthResponseHeaders(
    new URL(`${destination.href}#`),
    responseHeaders,
  );
}

function redirectWithAuthResponseHeaders(
  destination: URL,
  responseHeaders: Headers,
) {
  return NextResponse.redirect(destination, { headers: responseHeaders });
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
