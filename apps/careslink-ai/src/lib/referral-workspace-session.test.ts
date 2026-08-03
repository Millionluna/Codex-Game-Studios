import { describe, expect, it, vi } from "vitest";
import {
  getWorkspaceAccessGateWithServerSession,
  resolveWorkspaceAccountFromSupabaseSession,
} from "./referral-workspace-session";

describe("referral workspace server session gate", () => {
  it("uses a Supabase session account before query-string demo accounts", async () => {
    const resolveSessionAccount = vi.fn(async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Provider Owner",
      email: "provider@example.com",
      role: "provider" as const,
    }));

    const gate = await getWorkspaceAccessGateWithServerSession(
      {
        account: "user-admin",
      },
      { resolveSessionAccount },
    );

    expect(resolveSessionAccount).toHaveBeenCalledTimes(1);
    expect(gate).toMatchObject({
      source: "supabase",
      status: "signed_in",
      mode: "free_preview",
      account: {
        id: "11111111-1111-4111-8111-111111111111",
        role: "provider",
      },
      canViewAdmin: false,
    });
  });

  it("loads persisted access state for a Supabase session account", async () => {
    const resolveSessionAccount = vi.fn(async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Provider Owner",
      email: "provider@example.com",
      role: "provider" as const,
    }));
    const resolveAccessState = vi.fn(async () => ({
      userId: "11111111-1111-4111-8111-111111111111",
      hasAccessCode: true,
      status: "approved" as const,
      codeType: "Dual Role Pilot" as const,
      dailyQuota: 5,
      usedToday: 2,
    }));

    const gate = await getWorkspaceAccessGateWithServerSession(
      {
        account: "user-free",
      },
      { resolveSessionAccount, resolveAccessState },
    );

    expect(resolveAccessState).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Provider Owner",
      email: "provider@example.com",
      role: "provider",
    });
    expect(gate).toMatchObject({
      source: "supabase",
      status: "signed_in",
      mode: "access_active",
      canUseGuidedMaterials: true,
      accessState: {
        hasAccessCode: true,
        status: "approved",
        dailyQuota: 5,
        usedToday: 2,
      },
    });
  });

  it("falls back to demo account routing when no Supabase session exists", async () => {
    const gate = await getWorkspaceAccessGateWithServerSession(
      {
        account: "user-approved",
      },
      {
        resolveSessionAccount: vi.fn(async () => undefined),
      },
    );

    expect(gate).toMatchObject({
      source: "demo",
      status: "signed_in",
      mode: "access_active",
      account: { id: "user-approved" },
      canUseGuidedMaterials: true,
    });
  });

  it("does not accept a query-string demo account when demo auth is disabled", async () => {
    const gate = await getWorkspaceAccessGateWithServerSession(
      {
        account: "user-admin",
      },
      {
        resolveSessionAccount: vi.fn(async () => undefined),
        allowDemoAuth: false,
      },
    );

    expect(gate).toMatchObject({
      source: "none",
      status: "signed_out",
      canViewAdmin: false,
    });
  });

  it("maps a verified Supabase cookie session into a workspace account", async () => {
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: "33333333-3333-4333-8333-333333333333",
          email: "provider@example.com",
          app_metadata: { careslink_role: "provider" },
          user_metadata: {
            name: "Provider Owner",
            role: "admin",
          },
        },
      },
      error: null,
    }));

    const account = await resolveWorkspaceAccountFromSupabaseSession({
      auth: { getUser },
    });

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(account).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Provider Owner",
      email: "provider@example.com",
      role: "provider",
    });
  });

  it("returns no account for missing or invalid Supabase cookie sessions", async () => {
    await expect(
      resolveWorkspaceAccountFromSupabaseSession(undefined),
    ).resolves.toBeUndefined();

    await expect(
      resolveWorkspaceAccountFromSupabaseSession({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: null },
            error: { message: "JWT expired" },
          })),
        },
      }),
    ).resolves.toBeUndefined();
  });
});
