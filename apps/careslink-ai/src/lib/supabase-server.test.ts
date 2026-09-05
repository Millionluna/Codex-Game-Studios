import { describe, expect, it, vi } from "vitest";
import {
  clearCareslinkSupabaseAuthCookies,
  createCareslinkServerSupabaseClient,
  getSupabasePublicAuthConfig,
} from "./supabase-server";

describe("Supabase server auth client", () => {
  it("uses public Supabase auth env values for SSR session cookies", async () => {
    const cookieStore = {
      getAll: vi.fn(() => [{ name: "sb-access-token", value: "token" }]),
      set: vi.fn(),
    };
    const createdClient = {
      auth: {
        getUser: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithOAuth: vi.fn(),
        signUp: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        exchangeCodeForSession: vi.fn(),
        signOut: vi.fn(),
      },
    };
    const createServerClient = vi.fn(() => createdClient);
    const responseHeaders = { set: vi.fn() };

    const client = await createCareslinkServerSupabaseClient({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role",
      },
      cookieStore,
      createServerClient,
      responseHeaders,
    });

    expect(client).toBe(createdClient);
    expect(createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    );

    const [, , options] = createServerClient.mock.calls[0] as unknown as [
      string,
      string,
      {
        cookies: {
          getAll(): Array<{ name: string; value: string }>;
          setAll(
            cookiesToSet: Array<{
              name: string;
              value: string;
              options: Record<string, unknown>;
            }>,
            headers: Record<string, string>,
          ): void;
        };
      },
    ];
    const cookies = options.cookies;

    expect(cookies.getAll()).toEqual([{ name: "sb-access-token", value: "token" }]);

    cookies.setAll(
      [
        {
          name: "sb-refresh-token",
          value: "refresh",
          options: { path: "/", httpOnly: true },
        },
      ],
      {
        "Cache-Control": "private, no-store",
        Expires: "0",
        Pragma: "no-cache",
      },
    );

    expect(cookieStore.set).toHaveBeenCalledWith("sb-refresh-token", "refresh", {
      path: "/",
      httpOnly: true,
    });
    expect(responseHeaders.set).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(responseHeaders.set).toHaveBeenCalledWith("Expires", "0");
    expect(responseHeaders.set).toHaveBeenCalledWith("Pragma", "no-cache");
  });

  it("returns no client when public Supabase auth env is missing", async () => {
    expect(getSupabasePublicAuthConfig({})).toBeUndefined();

    await expect(
      createCareslinkServerSupabaseClient({
        env: {},
        cookieStore: {
          getAll: vi.fn(() => []),
          set: vi.fn(),
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("clears only Supabase auth cookies so an unavailable client cannot revive a session", async () => {
    const cookieStore = {
      getAll: vi.fn(() => [
        { name: "sb-projectref-auth-token", value: "access" },
        { name: "sb-projectref-auth-token.0", value: "chunk" },
        { name: "sb-projectref-auth-token-code-verifier", value: "verifier" },
        { name: "careslink-locale", value: "en" },
      ]),
      set: vi.fn(),
    };

    await expect(
      clearCareslinkSupabaseAuthCookies({ cookieStore }),
    ).resolves.toEqual({ ok: true, cleared: 3 });

    expect(cookieStore.set).toHaveBeenCalledTimes(3);
    expect(cookieStore.set).not.toHaveBeenCalledWith(
      "careslink-locale",
      expect.anything(),
      expect.anything(),
    );
    expect(cookieStore.set).toHaveBeenCalledWith(
      "sb-projectref-auth-token",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
  });

  it("reports cookie cleanup failure instead of claiming a successful sign-out", async () => {
    const cookieStore = {
      getAll: vi.fn(() => [
        { name: "sb-projectref-auth-token", value: "access" },
      ]),
      set: vi.fn(() => {
        throw new Error("cookie mutation unavailable");
      }),
    };

    await expect(
      clearCareslinkSupabaseAuthCookies({ cookieStore }),
    ).resolves.toEqual({ ok: false, cleared: 0 });
  });
});
