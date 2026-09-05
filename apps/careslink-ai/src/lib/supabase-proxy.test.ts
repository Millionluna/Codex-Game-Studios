import type { CookieMethodsServer } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  refreshCareslinkSupabaseSession,
  type CreateSupabaseProxyClient,
} from "./supabase-proxy";

const TEST_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://preview-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
};

const AUTH_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

describe("Supabase session refresh Proxy", () => {
  it("is a safe no-op when public Supabase auth is not configured", async () => {
    const createServerClient = vi.fn<CreateSupabaseProxyClient>();
    const request = createRequest();

    const response = await refreshCareslinkSupabaseSession(request, {
      createServerClient,
      env: {},
    });

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("rotates auth cookies on both the forwarded request and response", async () => {
    let cookieMethods: CookieMethodsServer | undefined;
    const getClaims = vi.fn(async () => {
      expect(await cookieMethods?.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "sb-preview-auth-token",
            value: "expired-token",
          }),
        ]),
      );
      await cookieMethods?.setAll?.(
        [
          {
            name: "sb-preview-auth-token",
            value: "rotated-token",
            options: { httpOnly: true, path: "/", sameSite: "lax" },
          },
          {
            name: "sb-preview-auth-token-code-verifier",
            value: "rotated-verifier",
            options: { httpOnly: true, path: "/", sameSite: "lax" },
          },
        ],
        AUTH_RESPONSE_HEADERS,
      );

      return { data: { claims: { sub: "user-id" } }, error: null };
    });
    const createServerClient = vi.fn<CreateSupabaseProxyClient>(
      (supabaseUrl, publishableKey, options) => {
        expect(supabaseUrl).toBe(TEST_ENV.NEXT_PUBLIC_SUPABASE_URL);
        expect(publishableKey).toBe(
          TEST_ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        );
        cookieMethods = options.cookies;

        return { auth: { getClaims } };
      },
    );
    const request = createRequest("sb-preview-auth-token=expired-token");

    const response = await refreshCareslinkSupabaseSession(request, {
      createServerClient,
      env: TEST_ENV,
    });

    expect(createServerClient).toHaveBeenCalledTimes(1);
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(await cookieMethods?.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "sb-preview-auth-token",
          value: "rotated-token",
        }),
      ]),
    );
    expect(request.cookies.get("sb-preview-auth-token")?.value).toBe(
      "rotated-token",
    );
    expect(
      request.cookies.get("sb-preview-auth-token-code-verifier")?.value,
    ).toBe("rotated-verifier");
    expect(response.cookies.get("sb-preview-auth-token")).toEqual(
      expect.objectContaining({
        value: "rotated-token",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
      }),
    );
    expect(
      response.cookies.get("sb-preview-auth-token-code-verifier")?.value,
    ).toBe("rotated-verifier");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "sb-preview-auth-token=rotated-token",
    );
    expect(response.headers.get("x-middleware-request-cookie")).not.toContain(
      "expired-token",
    );
    expect(response.headers.get("cache-control")).toBe(
      AUTH_RESPONSE_HEADERS["Cache-Control"],
    );
    expect(response.headers.get("expires")).toBe(AUTH_RESPONSE_HEADERS.Expires);
    expect(response.headers.get("pragma")).toBe(AUTH_RESPONSE_HEADERS.Pragma);
  });

  it("forwards terminal stale-session cookie deletion without touching unrelated cookies", async () => {
    let cookieMethods: CookieMethodsServer | undefined;
    const getClaims = vi.fn(async () => {
      await cookieMethods?.setAll?.(
        [
          {
            name: "sb-preview-auth-token",
            value: "",
            options: { maxAge: 0, path: "/" },
          },
          {
            name: "sb-preview-auth-token.0",
            value: "",
            options: { maxAge: 0, path: "/" },
          },
        ],
        AUTH_RESPONSE_HEADERS,
      );

      return { data: null, error: { message: "Invalid Refresh Token" } };
    });
    const createServerClient = vi.fn<CreateSupabaseProxyClient>(
      (_supabaseUrl, _publishableKey, options) => {
        cookieMethods = options.cookies;
        return { auth: { getClaims } };
      },
    );
    const request = createRequest(
      "sb-preview-auth-token=stale; sb-preview-auth-token.0=stale-chunk; careslink-locale=en",
    );

    const response = await refreshCareslinkSupabaseSession(request, {
      createServerClient,
      env: TEST_ENV,
    });

    expect(request.cookies.get("sb-preview-auth-token")?.value).toBe("");
    expect(request.cookies.get("sb-preview-auth-token.0")?.value).toBe("");
    expect(request.cookies.get("careslink-locale")?.value).toBe("en");
    expect(response.cookies.get("sb-preview-auth-token")).toEqual(
      expect.objectContaining({ value: "", maxAge: 0, path: "/" }),
    );
    expect(response.cookies.get("sb-preview-auth-token.0")).toEqual(
      expect.objectContaining({ value: "", maxAge: 0, path: "/" }),
    );
    expect(response.cookies.get("careslink-locale")).toBeUndefined();
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie().join("\n")).not.toContain(
      "careslink-locale",
    );
    expect(response.headers.get("cache-control")).toBe(
      AUTH_RESPONSE_HEADERS["Cache-Control"],
    );
    expect(response.headers.get("expires")).toBe(AUTH_RESPONSE_HEADERS.Expires);
    expect(response.headers.get("pragma")).toBe(AUTH_RESPONSE_HEADERS.Pragma);
  });

  it("creates an isolated Supabase client for every request", async () => {
    const getClaims = vi.fn(async () => ({ data: null, error: null }));
    const createServerClient = vi.fn<CreateSupabaseProxyClient>(() => ({
      auth: { getClaims },
    }));

    await refreshCareslinkSupabaseSession(createRequest(), {
      createServerClient,
      env: TEST_ENV,
    });
    await refreshCareslinkSupabaseSession(createRequest(), {
      createServerClient,
      env: TEST_ENV,
    });

    expect(createServerClient).toHaveBeenCalledTimes(2);
    expect(getClaims).toHaveBeenCalledTimes(2);
  });
});

function createRequest(cookie?: string) {
  return new NextRequest("https://preview.careslink.example/plan-and-usage", {
    headers: cookie ? { cookie } : undefined,
  });
}
