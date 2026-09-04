import type { NextRequest } from "next/server";
import { refreshCareslinkSupabaseSession } from "./lib/supabase-proxy";

export async function proxy(request: NextRequest) {
  return refreshCareslinkSupabaseSession(request);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/v1/:path*",
    "/auth/:path*",
    "/((?!_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|txt|xml|webmanifest|woff|woff2|ttf|otf|eot)$).*)",
  ],
};
