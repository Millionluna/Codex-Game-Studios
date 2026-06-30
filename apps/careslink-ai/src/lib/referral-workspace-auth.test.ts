import { describe, expect, it } from "vitest";
import {
  ACCOUNT_QUERY_PARAM,
  getWorkspaceAccessGate,
  getWorkspaceAccessGateForAccount,
  getWorkspaceAccountFromSearchParams,
  getWorkspaceAccountOptions,
  withWorkspaceAccount,
} from "./referral-workspace-auth";

describe("referral workspace auth gate", () => {
  it("treats missing or unknown demo accounts as signed out", () => {
    expect(getWorkspaceAccountFromSearchParams(undefined)).toBeUndefined();
    expect(
      getWorkspaceAccountFromSearchParams({ [ACCOUNT_QUERY_PARAM]: "missing" }),
    ).toBeUndefined();

    expect(getWorkspaceAccessGate(undefined)).toMatchObject({
      status: "signed_out",
      mode: "login_required",
      canViewWorkspace: false,
      canViewAdmin: false,
      canUseGuidedMaterials: false,
    });
  });

  it("keeps free, waitlist, approved, and admin accounts separate", () => {
    expect(getWorkspaceAccountOptions().map((account) => account.id)).toEqual([
      "user-free",
      "user-waitlist",
      "user-approved",
      "user-admin",
    ]);

    expect(
      getWorkspaceAccessGate({ [ACCOUNT_QUERY_PARAM]: "user-free" }),
    ).toMatchObject({
      status: "signed_in",
      mode: "free_preview",
      canViewWorkspace: true,
      canViewAdmin: false,
      canUseGuidedMaterials: false,
      accessState: { status: "free", hasAccessCode: false },
    });

    expect(
      getWorkspaceAccessGate({ [ACCOUNT_QUERY_PARAM]: "user-waitlist" }),
    ).toMatchObject({
      status: "signed_in",
      mode: "access_waitlist",
      canViewWorkspace: true,
      canViewAdmin: false,
      canUseGuidedMaterials: false,
      accessState: { status: "waitlist", hasAccessCode: false },
    });

    expect(
      getWorkspaceAccessGate({ [ACCOUNT_QUERY_PARAM]: "user-approved" }),
    ).toMatchObject({
      status: "signed_in",
      mode: "access_active",
      canViewWorkspace: true,
      canViewAdmin: false,
      canUseGuidedMaterials: true,
      accessState: { status: "approved", hasAccessCode: true },
    });

    expect(
      getWorkspaceAccessGate({ [ACCOUNT_QUERY_PARAM]: "user-admin" }),
    ).toMatchObject({
      status: "signed_in",
      mode: "admin_review",
      canViewWorkspace: true,
      canViewAdmin: true,
      canUseGuidedMaterials: false,
    });
  });

  it("does not let access=code unlock guided materials without an approved account", () => {
    expect(
      getWorkspaceAccessGate({
        [ACCOUNT_QUERY_PARAM]: "user-free",
        access: "code",
      }),
    ).toMatchObject({
      mode: "free_preview",
      canUseGuidedMaterials: false,
      accessState: { status: "free", hasAccessCode: false },
    });
  });

  it("builds a provider workspace gate from a real Supabase auth account", () => {
    expect(
      getWorkspaceAccessGateForAccount({
        id: "11111111-1111-4111-8111-111111111111",
        name: "Provider Owner",
        email: "provider@example.com",
        role: "provider",
      }),
    ).toMatchObject({
      status: "signed_in",
      mode: "free_preview",
      canViewWorkspace: true,
      canViewAdmin: false,
      canUseGuidedMaterials: false,
      accessState: { status: "free", hasAccessCode: false },
    });
  });

  it("uses a persisted access state override for a real provider account", () => {
    expect(
      getWorkspaceAccessGateForAccount(
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Provider Owner",
          email: "provider@example.com",
          role: "provider",
        },
        {
          userId: "11111111-1111-4111-8111-111111111111",
          hasAccessCode: true,
          status: "approved",
          codeType: "Provider Pilot",
          dailyQuota: 5,
          usedToday: 1,
        },
      ),
    ).toMatchObject({
      status: "signed_in",
      mode: "access_active",
      canUseGuidedMaterials: true,
      accessState: {
        status: "approved",
        hasAccessCode: true,
        dailyQuota: 5,
        usedToday: 1,
      },
    });
  });

  it("builds an admin review gate from a real Supabase admin account", () => {
    expect(
      getWorkspaceAccessGateForAccount({
        id: "22222222-2222-4222-8222-222222222222",
        name: "CaresLink Admin",
        email: "admin@example.com",
        role: "admin",
      }),
    ).toMatchObject({
      status: "signed_in",
      mode: "admin_review",
      canViewWorkspace: true,
      canViewAdmin: true,
      canUseGuidedMaterials: false,
    });
  });

  it("preserves account context in internal links without dropping query or hash", () => {
    expect(
      withWorkspaceAccount(
        "/referral-workspace/materials?access=code&lang=zh-Hans#preview",
        "user-approved",
      ),
    ).toBe(
      "/referral-workspace/materials?access=code&lang=zh-Hans&account=user-approved#preview",
    );

    expect(
      withWorkspaceAccount(
        "/referral-workspace?account=user-free&lang=en",
        "user-waitlist",
      ),
    ).toBe("/referral-workspace?account=user-waitlist&lang=en");

    expect(withWorkspaceAccount("/auth/login?lang=zh-Hans", undefined)).toBe(
      "/auth/login?lang=zh-Hans",
    );
  });
});
