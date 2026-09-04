import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUsage: vi.fn(),
  getGate: vi.fn(),
  isPointsUiEnabled: vi.fn(),
  resolvePoints: vi.fn(),
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
vi.mock("@/lib/v1/points-page-data.server", () => ({
  isCaresLinkV1PointsUiEnabled: mocks.isPointsUiEnabled,
  resolveCaresLinkV1PointsPageData: mocks.resolvePoints,
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
    ReferralWorkspaceLoginGate: ({ copy }: { copy: { auth: { gate: { title: string } } } }) =>
      React.createElement("div", null, copy.auth.gate.title),
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
    mocks.isPointsUiEnabled.mockReturnValue(false);
    mocks.resolvePoints.mockResolvedValue({
      status: "UNAVAILABLE",
      unit: "POINTS",
    });
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
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
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

  it("renders only the read-only Points preview when the UI cutover is enabled", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.resolvePoints.mockResolvedValue({
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: "2026-09-04T06:10:00.000Z",
      contractVersion: "1.0.0-shadow.1",
      availablePoints: 1250,
      reservedPoints: 20,
    });

    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Points preview");
    expect(markup).toContain("Preview · not active");
    expect(markup).toContain("Preview Points balance");
    expect(markup).toContain(">1,250<");
    expect(markup).toContain("Reserved Points");
    expect(markup).toContain(">20<");
    expect(markup).toContain("Read-only preview");
    expect(markup).not.toMatch(/\bcredits?\b/i);
    expect(markup).not.toContain("Period limit");
    expect(markup).not.toContain("Recent usage");
    expect(mocks.resolvePoints).toHaveBeenCalledTimes(1);
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("renders valid zero Point balances instead of treating them as missing", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.resolvePoints.mockResolvedValue({
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: "2026-09-04T06:10:00.000Z",
      contractVersion: "1.0.0-shadow.1",
      availablePoints: 0,
      reservedPoints: 0,
    });

    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup.match(/>0<\/dd>/g)).toHaveLength(2);
    expect(markup).not.toContain("isn’t ready");
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("keeps NOT_READY distinct from a zero balance and never falls back to Credits", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.resolvePoints.mockResolvedValue({
      status: "NOT_READY",
      unit: "POINTS",
      serverTime: "2026-09-04T06:10:00.000Z",
      contractVersion: "1.0.0-shadow.1",
    });

    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Your Points preview isn’t ready yet");
    expect(markup).not.toContain("<dd");
    expect(markup).not.toMatch(/\bcredits?\b/i);
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("renders a safe alert when Points cannot be loaded", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.resolvePoints.mockResolvedValue({
      status: "UNAVAILABLE",
      unit: "POINTS",
    });

    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("We can’t load the Points preview right now");
    expect(markup).toContain("Reload Points");
    expect(markup).not.toMatch(/\bcredits?\b/i);
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("requires a real provider session in Points mode without reading demo Credits", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.getGate.mockResolvedValue({
      status: "signed_in",
      account: provider,
      source: "demo",
      canUseGuidedMaterials: true,
    });

    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "en", account: provider.id }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("A verified sign-in is required");
    expect(markup).toContain("Sign in to view Points");
    expect(markup).not.toMatch(/\bcredits?\b/i);
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("redirects an admin before either balance source can be read", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.getGate.mockResolvedValue({
      status: "signed_in",
      account: { ...provider, role: "admin" },
      source: "supabase",
      canUseGuidedMaterials: false,
    });
    mocks.redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      PlanAndUsagePage({
        searchParams: Promise.resolve({ lang: "en" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/admin/material-usage?lang=en");
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("uses Points-specific sign-in copy for a signed-out cutover page", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.getGate.mockResolvedValue({ status: "signed_out" });

    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Sign in to view your Points preview");
    expect(markup).not.toMatch(/\bcredits?\b/i);
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("renders natural Chinese Points copy without legacy balance fields", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.resolvePoints.mockResolvedValue({
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: "2026-09-04T06:10:00.000Z",
      contractVersion: "1.0.0-shadow.1",
      availablePoints: 300,
      reservedPoints: 0,
    });

    const element = await PlanAndUsagePage({
      searchParams: Promise.resolve({ lang: "zh-Hans" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Points 余额");
    expect(markup).toContain("预览 · 尚未启用");
    expect(markup).toContain("这是只读预览，此余额目前不能使用");
    expect(markup).not.toContain("本周期额度");
    expect(markup).not.toContain("最近使用记录");
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });
});
