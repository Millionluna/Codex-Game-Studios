import { describe, expect, it, vi } from "vitest";
import {
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
        signUp: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        exchangeCodeForSession: vi.fn(),
        signOut: vi.fn(),
      },
    };
    const createServerClient = vi.fn(() => createdClient);

    const client = await createCareslinkServerSupabaseClient({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role",
      },
      cookieStore,
      createServerClient,
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
          ): void;
        };
      },
    ];
    const cookies = options.cookies;

    expect(cookies.getAll()).toEqual([{ name: "sb-access-token", value: "token" }]);

    cookies.setAll([
      {
        name: "sb-refresh-token",
        value: "refresh",
        options: { path: "/", httpOnly: true },
      },
    ]);

    expect(cookieStore.set).toHaveBeenCalledWith("sb-refresh-token", "refresh", {
      path: "/",
      httpOnly: true,
    });
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
});
