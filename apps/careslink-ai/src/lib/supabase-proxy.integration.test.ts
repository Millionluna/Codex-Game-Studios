import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  refreshCareslinkSupabaseSession,
  type CreateSupabaseProxyClient,
} from "./supabase-proxy";

const SUPABASE_URL = "https://preview-project.supabase.co";
const AUTH_COOKIE_NAME = "sb-preview-project-auth-token";
const AUTH_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

describe("Supabase session refresh Proxy integration", () => {
  it("clears an expired session rejected by Supabase without touching unrelated cookies", async () => {
    const expiredSessionCookie = encodeExpiredSessionCookie();
    const request = new NextRequest(
      "https://preview.careslink.example/plan-and-usage",
      {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${expiredSessionCookie}; careslink-locale=en`,
        },
      },
    );
    const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      );
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        refresh_token: "expired-refresh-token",
      });

      return new Response(
        JSON.stringify({
          code: "refresh_token_not_found",
          msg: "Invalid Refresh Token: Refresh Token Not Found",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;
    const createServerClient: CreateSupabaseProxyClient = (
      supabaseUrl,
      publishableKey,
      options,
    ) =>
      createSupabaseServerClient(supabaseUrl, publishableKey, {
        ...options,
        global: { fetch: fakeFetch },
      });
    // auth-js reports the terminal refresh error to its diagnostic channel even
    // though getClaims returns it as data. Keep this expected path test-local.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await refreshCareslinkSupabaseSession(request, {
        createServerClient,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
        },
      });

      expect(fakeFetch).toHaveBeenCalledTimes(1);
      expect(request.cookies.get(AUTH_COOKIE_NAME)?.value).toBe("");
      expect(request.cookies.get("careslink-locale")?.value).toBe("en");
      expect(response.cookies.get(AUTH_COOKIE_NAME)).toEqual(
        expect.objectContaining({
          name: AUTH_COOKIE_NAME,
          value: "",
          maxAge: 0,
          path: "/",
          sameSite: "lax",
        }),
      );
      expect(response.cookies.get("careslink-locale")).toBeUndefined();
      expect(response.headers.get("cache-control")).toBe(
        AUTH_RESPONSE_HEADERS["Cache-Control"],
      );
      expect(response.headers.get("expires")).toBe(AUTH_RESPONSE_HEADERS.Expires);
      expect(response.headers.get("pragma")).toBe(AUTH_RESPONSE_HEADERS.Pragma);

      const forwardedCookies =
        response.headers.get("x-middleware-request-cookie") ?? "";
      expect(forwardedCookies).toContain(`${AUTH_COOKIE_NAME}=`);
      expect(forwardedCookies).not.toContain(expiredSessionCookie);
      expect(forwardedCookies).toContain("careslink-locale=en");

      const setCookieHeaders = response.headers.getSetCookie();
      expect(setCookieHeaders).toHaveLength(1);
      expect(setCookieHeaders[0]).toContain(`${AUTH_COOKIE_NAME}=`);
      expect(setCookieHeaders[0]).toContain("Max-Age=0");
      expect(setCookieHeaders[0]).not.toContain("careslink-locale");
    } finally {
      consoleError.mockRestore();
    }
  });
});

function encodeExpiredSessionCookie() {
  const accessToken = [
    encodeJwtSegment({ alg: "HS256", typ: "JWT" }),
    encodeJwtSegment({ exp: 1, sub: "expired-user" }),
    "expired-signature",
  ].join(".");
  const session = {
    access_token: accessToken,
    expires_at: 1,
    expires_in: 3600,
    refresh_token: "expired-refresh-token",
    token_type: "bearer",
    user: {
      app_metadata: {},
      aud: "authenticated",
      created_at: "1970-01-01T00:00:00.000Z",
      id: "expired-user",
      user_metadata: {},
    },
  };

  return `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

function encodeJwtSegment(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
