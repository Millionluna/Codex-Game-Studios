import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProviderPortalPage from "./provider-portal/page";
import ProviderReferralFollowUpPage from "./provider-portal/referrals/[referralId]/page";
import ReferralSourcePortalPage from "./referral-source-portal/page";
import ReferralDetailPage from "./referrals/[id]/page";
import ReferralMatchingPage from "./referrals/[id]/matches/page";
import ReferralIntakePage from "./referrals/intake/page";
import ReferralBoardPage from "./referrals/page";

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
const runtimeMocks = vi.hoisted(() => ({
  isPortalReferralAssignmentRuntimeEnabled: vi.fn(() => false),
  isPortalReferralFollowUpRuntimeEnabled: vi.fn(() => false),
  isPortalReferralProviderResponseRuntimeEnabled: vi.fn(() => false),
  isPortalReferralRuntimeEnabled: vi.fn(() => false),
  isPortalReferralSourceDetailRuntimeEnabled: vi.fn(() => false),
}));
const providerPortalMocks = vi.hoisted(() => ({
  getProviderPortalData: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock("@/components/app-shell", async () => {
  const React = await import("react");
  return {
    AppShell: ({ children }: { children: React.ReactNode }) =>
      React.createElement("main", null, children),
  };
});
vi.mock("@/components/mobile-app-frame", async () => {
  const React = await import("react");
  return {
    MobileAppFrame: ({ children }: { children: React.ReactNode }) =>
      React.createElement("section", null, children),
  };
});
vi.mock("@/components/page-header", async () => {
  const React = await import("react");
  return {
    PageHeader: ({
      title,
      description,
      actions,
    }: {
      title: string;
      description: string;
      actions?: React.ReactNode;
    }) =>
      React.createElement(
        "header",
        null,
        React.createElement("h1", null, title),
        React.createElement("p", null, description),
        actions,
      ),
  };
});
vi.mock("@/components/portal-referral-workflow-controls", async () =>
  import("../components/portal-referral-workflow-controls"),
);
vi.mock("@/components/portal-referral-assignment-controls", async () =>
  import("../components/portal-referral-assignment-controls"),
);
vi.mock("@/components/portal-referral-provider-response-controls", async () =>
  import("../components/portal-referral-provider-response-controls"),
);
vi.mock("@/components/portal-referral-provider-follow-up-controls", async () =>
  import("../components/portal-referral-provider-follow-up-controls"),
);
vi.mock("@/components/referral-card", async () => {
  const React = await import("react");
  return {
    ReferralCard: ({ referral }: { referral: { id: string } }) =>
      React.createElement("article", null, referral.id),
  };
});
vi.mock("@/components/share-card", async () => {
  const React = await import("react");
  return {
    ShareCardPreview: () => React.createElement("section", null, "Share card"),
  };
});
vi.mock("@/components/ui", async () => {
  const React = await import("react");
  return {
    ButtonLink: ({
      href,
      children,
    }: {
      href: string;
      children: React.ReactNode;
    }) => React.createElement("a", { href }, children),
    Card: ({ children }: { children: React.ReactNode }) =>
      React.createElement("section", null, children),
    MetricCard: ({ label, value }: { label: string; value: string }) =>
      React.createElement("section", null, label, value),
    ProviderStatusBadge: ({ status }: { status: string }) =>
      React.createElement("span", null, status),
    ReferralStatusBadge: ({ status }: { status: string }) =>
      React.createElement("span", null, status),
  };
});
vi.mock("@/lib/display", async () => import("../lib/display"));
vi.mock("@/lib/demo-strategy", async () => import("../lib/demo-strategy"));
vi.mock("@/lib/mock-data", async () => import("../lib/mock-data"));
vi.mock("@/lib/portal-referral-id", async () =>
  import("../lib/portal-referral-id"),
);
vi.mock("@/lib/provider-assessment", async () =>
  import("../lib/provider-assessment"),
);
vi.mock("@/lib/provider-portal", async () => {
  const actual = await import("../lib/provider-portal");
  providerPortalMocks.getProviderPortalData.mockImplementation(
    actual.getProviderPortalData,
  );
  return {
    ...actual,
    getProviderPortalData: providerPortalMocks.getProviderPortalData,
  };
});
vi.mock("@/lib/portal-referral-runtime.server", () => runtimeMocks);
vi.mock("@/lib/referral-matching", async () =>
  import("../lib/referral-matching"),
);
vi.mock("@/lib/role-portals", async () => import("../lib/role-portals"));

describe("Portal referral page wiring", () => {
  beforeEach(() => {
    runtimeMocks.isPortalReferralAssignmentRuntimeEnabled.mockClear();
    runtimeMocks.isPortalReferralAssignmentRuntimeEnabled.mockReturnValue(
      false,
    );
    runtimeMocks.isPortalReferralFollowUpRuntimeEnabled.mockClear();
    runtimeMocks.isPortalReferralFollowUpRuntimeEnabled.mockReturnValue(false);
    runtimeMocks.isPortalReferralProviderResponseRuntimeEnabled.mockClear();
    runtimeMocks.isPortalReferralProviderResponseRuntimeEnabled.mockReturnValue(
      false,
    );
    runtimeMocks.isPortalReferralRuntimeEnabled.mockClear();
    runtimeMocks.isPortalReferralRuntimeEnabled.mockReturnValue(false);
    runtimeMocks.isPortalReferralSourceDetailRuntimeEnabled.mockClear();
    runtimeMocks.isPortalReferralSourceDetailRuntimeEnabled.mockReturnValue(
      false,
    );
    providerPortalMocks.getProviderPortalData.mockClear();
  });

  it("uses the closed runtime gate on both source entry pages", () => {
    const intakeMarkup = renderToStaticMarkup(ReferralIntakePage());
    const sourceMarkup = renderToStaticMarkup(ReferralSourcePortalPage());

    for (const markup of [intakeMarkup, sourceMarkup]) {
      expect(markup).toContain('name="region"');
      expect(markup).toContain('value="VIC_MELBOURNE"');
      expect(markup).toContain('name="contactName"');
      expect(markup).toContain('name="summary"');
      expect(markup).toContain("No data will be submitted");
      expect(markup).toContain("No list request is sent");
      expect(markup).toContain("disabled");
    }
    expect(sourceMarkup).toContain("Legacy demo data / 旧版演示数据");
    expect(sourceMarkup).toContain("不是 Preview 数据库记录");
    expect(sourceMarkup).toContain("Preview runtime disabled");
    expect(runtimeMocks.isPortalReferralRuntimeEnabled).toHaveBeenCalledTimes(2);
    expect(
      runtimeMocks.isPortalReferralSourceDetailRuntimeEnabled,
    ).toHaveBeenCalledTimes(2);
  });

  it("passes the server runtime result as a plain enabled boolean", () => {
    runtimeMocks.isPortalReferralRuntimeEnabled.mockReturnValue(true);
    runtimeMocks.isPortalReferralSourceDetailRuntimeEnabled.mockReturnValue(
      true,
    );

    const intakeMarkup = renderToStaticMarkup(ReferralIntakePage());
    const sourceMarkup = renderToStaticMarkup(ReferralSourcePortalPage());

    for (const markup of [intakeMarkup, sourceMarkup]) {
      expect(markup).toContain("Loading durable Preview referral metadata");
      expect(markup).not.toContain("No list request is sent");
    }
    expect(intakeMarkup).toContain("不会显示摘要或联系人");
    expect(sourceMarkup).toContain("Preview runtime enabled");
    expect(sourceMarkup).toContain("Preview durable intake");
    expect(
      runtimeMocks.isPortalReferralSourceDetailRuntimeEnabled,
    ).toHaveBeenCalledTimes(2);
  });

  it("withholds follow-up controls until a database-scoped identity is available", async () => {
    const page = await ReferralDetailPage({
      params: Promise.resolve({ id: "referral-001" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("旧版 demo fixture");
    expect(markup).toContain("不是 Preview 数据库记录");
    expect(markup).toContain("Record follow-up / 记录跟进");
    expect(markup).toContain("authorized database-scoped ID");
    expect(markup).not.toContain('name="outcomeCode"');
    expect(markup).not.toContain("04 0000 0000");
    expect(markup).not.toContain("来自微信群讨论");
    expect(markup).not.toContain("帕拉马塔一位普通话 participant");
  });

  it("renders a durable source-detail shell without falling back to a mock record", async () => {
    runtimeMocks.isPortalReferralSourceDetailRuntimeEnabled.mockReturnValue(
      true,
    );
    const page = await ReferralDetailPage({
      params: Promise.resolve({
        id: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Authorized referral detail");
    expect(markup).toContain("Loading authorized referral detail");
    expect(markup).toContain("不会回退到 mock");
    expect(markup).not.toContain("旧版 demo fixture");
    expect(markup).not.toContain("referral-001");
  });

  it("rejects legacy fixture ids while the durable source-detail gate is open", async () => {
    runtimeMocks.isPortalReferralSourceDetailRuntimeEnabled.mockReturnValue(
      true,
    );
    navigationMocks.notFound.mockClear();

    await expect(
      ReferralDetailPage({ params: Promise.resolve({ id: "referral-001" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigationMocks.notFound).toHaveBeenCalledOnce();
  });

  it("renders triage and offer boundaries without promoting mock IDs", async () => {
    const page = await ReferralMatchingPage({
      params: Promise.resolve({ id: "referral-001" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("旧版 demo fixture");
    expect(markup).toContain("不是 Preview 数据库分配");
    expect(markup).toContain("Triage referral / 开始分诊");
    expect(markup).toContain("Offer to provider / 分配给服务商");
    expect(markup).toContain("authorized database-scoped ID");
    expect(markup).toContain("不代表 provider 已拒绝");
    expect(markup).not.toContain("/api/portal/");
  });

  it("renders only the durable assignment queue and detail while its gate is open", async () => {
    runtimeMocks.isPortalReferralAssignmentRuntimeEnabled.mockReturnValue(true);
    const referralId = "81111111-1111-8111-8111-111111111111";

    const boardMarkup = renderToStaticMarkup(ReferralBoardPage());
    const matchingMarkup = renderToStaticMarkup(
      await ReferralMatchingPage({ params: Promise.resolve({ id: referralId }) }),
    );

    expect(boardMarkup).toContain("Authorized assignment queue");
    expect(boardMarkup).toContain("Loading authorized assignment queue");
    expect(boardMarkup).not.toContain("Legacy demo board");
    expect(boardMarkup).not.toContain("真实 list adapter 尚未接入");
    expect(boardMarkup).not.toContain("referral-001");

    expect(matchingMarkup).toContain("Authorized referral assignment");
    expect(matchingMarkup).toContain("Loading authorized assignment detail");
    expect(matchingMarkup).toContain("不会回退到 mock");
    expect(matchingMarkup).not.toContain("旧版 demo fixture");
    expect(matchingMarkup).not.toContain("匹配分");
    expect(matchingMarkup).not.toContain("referral-001");
    expect(
      runtimeMocks.isPortalReferralAssignmentRuntimeEnabled,
    ).toHaveBeenCalledTimes(2);
  });

  it("rejects legacy fixture ids while the durable assignment gate is open", async () => {
    runtimeMocks.isPortalReferralAssignmentRuntimeEnabled.mockReturnValue(true);
    navigationMocks.notFound.mockClear();

    for (const id of [
      "referral-001",
      "a1111111-1111-4111-8111-111111111111".toUpperCase(),
    ]) {
      await expect(
        ReferralMatchingPage({ params: Promise.resolve({ id }) }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(navigationMocks.notFound).toHaveBeenCalledTimes(2);
  });

  it("does not render the matched provider's private mock summary as a pre-accept offer", () => {
    const markup = renderToStaticMarkup(ProviderPortalPage());

    expect(markup).not.toContain("帕拉马塔一位普通话 participant");
    expect(markup).not.toContain("04 0000 0000");
    expect(markup).toContain("Legacy mock referrals are intentionally not shown");
    expect(markup).toContain("authorized database-scoped ID");
    expect(
      runtimeMocks.isPortalReferralProviderResponseRuntimeEnabled,
    ).toHaveBeenCalledOnce();
    expect(providerPortalMocks.getProviderPortalData).toHaveBeenCalledOnce();
  });

  it("renders only the authorized provider-response workbench while its gate is open", () => {
    runtimeMocks.isPortalReferralProviderResponseRuntimeEnabled.mockReturnValue(
      true,
    );

    const markup = renderToStaticMarkup(ProviderPortalPage());

    expect(markup).toContain("我的 referral 邀约");
    expect(markup).toContain("Authorized provider offers");
    expect(markup).toContain("Loading authorized provider offers");
    expect(markup).not.toContain("Legacy mock referrals");
    expect(markup).not.toContain("Readiness");
    expect(markup).not.toContain("本周容量");
    expect(markup).not.toContain("AI 推荐文案");
    expect(markup).not.toContain("Share card");
    expect(providerPortalMocks.getProviderPortalData).not.toHaveBeenCalled();
  });

  it("keeps follow-up discovery inside the M1b inbox and separately gates private detail", async () => {
    runtimeMocks.isPortalReferralFollowUpRuntimeEnabled.mockReturnValue(true);

    const legacyMarkup = renderToStaticMarkup(ProviderPortalPage());
    expect(legacyMarkup).toContain("Legacy mock referrals");
    expect(legacyMarkup).not.toContain("Authorized provider offers");

    runtimeMocks.isPortalReferralProviderResponseRuntimeEnabled.mockReturnValue(
      true,
    );
    const inboxMarkup = renderToStaticMarkup(ProviderPortalPage());
    expect(inboxMarkup).toContain("Authorized provider offers");
    expect(
      runtimeMocks.isPortalReferralFollowUpRuntimeEnabled,
    ).toHaveBeenCalledTimes(2);

    const detailMarkup = renderToStaticMarkup(
      await ProviderReferralFollowUpPage({
        params: Promise.resolve({ referralId: "a1111111-1111-4111-8111-111111111111" }),
      }),
    );
    expect(detailMarkup).toContain("Provider follow-up M1c");
    expect(detailMarkup).toContain("Loading authorized referral detail");
    expect(detailMarkup).not.toContain("Legacy mock");
  });

  it("fails closed for disabled or non-canonical provider follow-up detail pages", async () => {
    navigationMocks.notFound.mockClear();
    await expect(
      ProviderReferralFollowUpPage({
        params: Promise.resolve({ referralId: "a1111111-1111-4111-8111-111111111111" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    runtimeMocks.isPortalReferralFollowUpRuntimeEnabled.mockReturnValue(true);
    for (const referralId of [
      "legacy-referral",
      "A1111111-1111-4111-8111-111111111111",
    ]) {
      await expect(
        ProviderReferralFollowUpPage({ params: Promise.resolve({ referralId }) }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(navigationMocks.notFound).toHaveBeenCalledTimes(3);
  });

  it("marks the core referral board as mock and keeps the real list adapter disabled", () => {
    const markup = renderToStaticMarkup(ReferralBoardPage());

    expect(markup).toContain("Legacy demo board / 旧版演示看板");
    expect(markup).toContain("不是 Preview 数据库或 canonical Referral");
    expect(markup).toContain("真实 list adapter 尚未接入");
  });

  it("returns not-found for invalid detail and matching IDs instead of the first fixture", async () => {
    navigationMocks.notFound.mockClear();

    await expect(
      ReferralDetailPage({ params: Promise.resolve({ id: "missing-referral" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      ReferralMatchingPage({
        params: Promise.resolve({ id: "missing-referral" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigationMocks.notFound).toHaveBeenCalledTimes(2);
  });

  it("keeps every new page control default-disabled in source", () => {
    const sources = [
      "referrals/intake/page.tsx",
      "referrals/[id]/page.tsx",
      "referrals/[id]/matches/page.tsx",
      "provider-portal/page.tsx",
      "provider-portal/referrals/[referralId]/page.tsx",
      "referral-source-portal/page.tsx",
    ].map((relativePath) =>
      readFileSync(join(process.cwd(), "src/app", relativePath), "utf8"),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/enabled\s*=\s*[{]?true/);
    }
    expect(sources[1]).not.toContain("?? referrals[0]");
    expect(sources[2]).not.toContain("?? referrals[0]");
    expect(sources[1]).not.toContain("referralId={referral.id}");
    expect(sources[2]).not.toContain("referralId={referral.id}");
    expect(sources[2]).not.toContain("providerId={provider.id}");
    expect(sources[3]).not.toContain("matchId={`${");
  });
});
