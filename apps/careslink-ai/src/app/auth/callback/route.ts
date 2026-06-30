import { NextResponse } from "next/server";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

const fallbackNextPath = "/auth/update-password";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
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
