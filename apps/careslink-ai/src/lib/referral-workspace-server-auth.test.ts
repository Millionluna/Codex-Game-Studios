import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceAccountFromSupabaseUser,
  isDemoWorkspaceAuthEnabled,
  resolveWorkspaceAccountFromRequest,
} from "./referral-workspace-server-auth";

function createAuthRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/provider-drafts/claim", {
    method: "POST",
    headers,
    body: "{}",
  });
}

describe("referral workspace server auth", () => {
  it("uses verified Supabase bearer users before demo account fallbacks", async () => {
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "provider@example.com",
          app_metadata: { careslink_role: "provider" },
          user_metadata: {
            name: "Provider Owner",
            careslink_role: "admin",
          },
        },
      },
      error: null,
    }));

    const resolved = await resolveWorkspaceAccountFromRequest(
      createAuthRequest({ authorization: "Bearer real-access-token" }),
      {
        demoAccountId: "user-admin",
        env: {
          CARESLINK_ENABLE_DEMO_AUTH: "true",
          NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        },
        createAuthClient: () => ({ auth: { getUser } }),
      },
    );

    expect(getUser).toHaveBeenCalledWith("real-access-token");
    expect(resolved).toEqual({
      source: "supabase",
      account: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "provider@example.com",
        name: "Provider Owner",
        role: "provider",
      },
    });
  });

  it("maps admin role only from Supabase app metadata", () => {
    expect(
      createWorkspaceAccountFromSupabaseUser({
        id: "22222222-2222-4222-8222-222222222222",
        email: "admin@example.com",
        app_metadata: { careslink_role: "admin" },
        user_metadata: { name: "Admin User" },
      }),
    ).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      role: "admin",
    });

    expect(
      createWorkspaceAccountFromSupabaseUser({
        id: "33333333-3333-4333-8333-333333333333",
        email: "unsafe@example.com",
        app_metadata: {},
        user_metadata: { name: "Unsafe Admin", role: "admin" },
      }),
    ).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      role: "provider",
    });
  });

  it("rejects invalid bearer sessions without falling back to demo accounts", async () => {
    const resolved = await resolveWorkspaceAccountFromRequest(
      createAuthRequest({ authorization: "Bearer invalid-token" }),
      {
        demoAccountId: "user-free",
        env: { CARESLINK_ENABLE_DEMO_AUTH: "true" },
        createAuthClient: () => ({
          auth: {
            getUser: vi.fn(async () => ({
              data: { user: null },
              error: { message: "JWT expired" },
            })),
          },
        }),
      },
    );

    expect(resolved).toEqual({
      source: "supabase",
      error: "Invalid auth session",
    });
  });

  it("allows demo fallback only when explicitly enabled outside production", async () => {
    await expect(
      resolveWorkspaceAccountFromRequest(createAuthRequest(), {
        demoAccountId: "user-free",
        env: { NODE_ENV: "production" },
      }),
    ).resolves.toEqual({ source: "none" });

    await expect(
      resolveWorkspaceAccountFromRequest(createAuthRequest(), {
        demoAccountId: "user-free",
        env: { NODE_ENV: "production", CARESLINK_ENABLE_DEMO_AUTH: "true" },
      }),
    ).resolves.toMatchObject({
      source: "demo",
      account: {
        id: "user-free",
        role: "provider",
      },
    });

    expect(isDemoWorkspaceAuthEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(
      isDemoWorkspaceAuthEnabled({
        NODE_ENV: "test",
        CARESLINK_ENABLE_DEMO_AUTH: "false",
      }),
    ).toBe(false);
  });
});
