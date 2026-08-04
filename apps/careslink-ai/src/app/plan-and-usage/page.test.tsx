import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUsage: vi.fn(),
  getGate: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/app-shell", async () =>
  import("../../components/app-shell"),
);
vi.mock("@/lib/account-credit-store", () => ({
  getAccountCreditStore: () => ({ getUsage: mocks.getUsage }),
}));
vi.mock("@/lib/referral-workspace-session", () => ({
  getWorkspaceAccessGateWithServerSession: mocks.getGate,
}));
vi.mock("@/lib/referral-workspace-auth", async () =>
  import("../../lib/referral-workspace-auth"),
);
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);
vi.mock("@/components/referral-workspace-auth-gate", async () => {
  const React = await import("react");
  return {
    ReferralWorkspaceLoginGate: () =>
      React.createElement("div", null, "Sign in required"),
  };
});

import PlanAndUsagePage from "./page";

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Synthetic provider",
  email: "synthetic@example.com",
};

describe("Plan & Usage page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGate.mockResolvedValue({
      status: "signed_in",
      account: provider,
      source: "supabase",
      canUseGuidedMaterials: true,
    });
    mocks.getUsage.mockResolvedValue({
      planCode: "free",
      status: "active",
      periodStart: "2026-08-01",
      periodEnd: "2026-09-01",
      creditLimit: 3,
      remainingCredits: 2,
      usedCredits: 1,
      reservedCredits: 0,
      recentUsage: [
        {
          id: "metadata-row-only",
          feature: "ndis_case_note",
          action: "generate",
          event: "commit",
          units: 1,
          model: "gpt-5.4-mini",
          createdAt: "2026-08-04T02:00:00.000Z",
        },
      ],
    });
  });

  it("renders real owner-scoped free-plan metadata without document content", async () => {
    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Plan &amp; Usage");
    expect(markup).toContain("Period limit");
    expect(markup).toContain("Available");
    expect(markup).toContain("NDIS Case Note generation");
    expect(markup).toContain("Used");
    expect(markup).toContain("Next reset");
    expect(markup).not.toContain("synthetic private case note content");
    expect(markup).not.toContain("metadata-row-only");
    expect(mocks.getUsage).toHaveBeenCalledWith({
      userId: provider.id,
      recentLimit: 16,
    });
  });

  it("renders natural Chinese credit rules", async () => {
    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "zh-Hans" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("免费方案与使用量");
    expect(markup).toContain("本周期额度");
    expect(markup).toContain("只有成功返回一份新的完整 Case Note 结果包才使用 1 credit");
    expect(markup).toContain("不保存输入、输出或 participant 事实");
  });
});
