import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the existing Node server-component/mock environment; use the already
// installed DOM parser only to inspect rendered markup, not to simulate E2E.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => { window: { document: Document; close(): void } };
};
let markupDom: InstanceType<typeof JSDOM>;
let document: Document;

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
vi.mock("@/components/page-header", async () => import("../../components/page-header"));
vi.mock("@/components/ui", async () => import("../../components/ui"));
vi.mock("@/lib/display", async () => import("../../lib/display"));
vi.mock("@/lib/account-credit-store", () => ({
  getAccountCreditStore: () => ({ getUsage: mocks.getUsage }),
}));
vi.mock("@/lib/referral-workspace-session", () => ({
  getWorkspaceAccessGateWithServerSession: mocks.getGate,
}));
vi.mock("@/lib/v1/points-page-data.server", () => ({
  resolveCaresLinkV1PointsPageData: mocks.resolvePoints,
}));
vi.mock("@/lib/points-ui-feature.server", () => ({
  isCaresLinkV1PointsUiEnabled: mocks.isPointsUiEnabled,
}));
vi.mock("@/lib/communication-note-points-navigation", async () =>
  import("../../lib/communication-note-points-navigation"),
);
vi.mock("@/lib/referral-workspace-auth", async () =>
  import("../../lib/referral-workspace-auth"),
);
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);
vi.mock("@/components/referral-workspace-auth-gate", async () =>
  import("../../components/referral-workspace-auth-gate"),
);

import PlanAndUsagePage from "./page";

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Synthetic provider",
  email: "synthetic@example.com",
};

describe("Plan & Usage page", () => {
  beforeEach(() => {
    markupDom = new JSDOM("<!doctype html><html><body></body></html>");
    document = markupDom.window.document;
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

  afterEach(() => markupDom.window.close());

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

  it.each(["en", "zh-Hans", "zh-Hant"])("returns to the original %s workspace and preserves context through refresh/language links", async communicationLang => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    const element = await PlanAndUsagePage({ searchParams: Promise.resolve({ lang: "en", communicationLang,
      next: "https://outside.invalid", owner: "private-owner", returnTo: "https://outside.invalid" }) });
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain(`href="/ai-documents?lang=${communicationLang}"`);
    expect(markup).toContain("Back to workspace");
    expect(markup).toContain(`/plan-and-usage?lang=en&amp;communicationLang=${communicationLang}`);
    expect(markup).toContain(`/plan-and-usage?lang=zh-Hans&amp;communicationLang=${communicationLang}`);
    expect(markup).toContain(`/plan-and-usage?lang=zh-Hant&amp;communicationLang=${communicationLang}`);
    expect(markup).not.toContain("Return to the workspace in Traditional Chinese.");
    expect(markup).not.toMatch(/outside\.invalid|private-owner/);
    expect(mocks.resolvePoints).toHaveBeenCalledTimes(1);
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it.each(["AVAILABLE", "NOT_READY", "AUTH_REQUIRED", "UNAVAILABLE"])("keeps navigation independent of balance state %s", async status => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.resolvePoints.mockResolvedValue({ status, unit: "POINTS", availablePoints: 0, reservedPoints: 0,
      serverTime: "2026-09-04T06:10:00.000Z", contractVersion: "1.0.0-shadow.1" });
    const markup = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve({ lang: "zh-Hans", communicationLang: "zh-Hant" }) }));
    expect(markup).toContain("返回工作台");
    expect(markup).toContain('href="/ai-documents?lang=zh-Hant"');
    expect(markup).not.toContain("返回后将恢复繁体中文工作台");
    if (status === "AUTH_REQUIRED") expect(markup).toContain("next=%2Fplan-and-usage%3Flang%3Dzh-Hans%26communicationLang%3Dzh-Hant");
    if (status !== "AVAILABLE") expect(markup).not.toContain('>0<');
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it.each(["https://outside.invalid", ["en"], ["en", "zh-Hant"]])("ignores invalid or duplicate return context %#", async communicationLang => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    const markup = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve({ lang: "en", communicationLang }) }));
    expect(markup).not.toContain("Back to workspace");
    expect(markup).not.toContain("communicationLang");
    expect(markup).not.toContain("outside.invalid");
  });

  it("does not use context to activate Points or authenticate a demo account", async () => {
    const params = { lang: "en", communicationLang: "zh-Hant" };
    const legacy = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve(params) }));
    expect(legacy).not.toContain("communicationLang");
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.getGate.mockResolvedValue({status:"signed_in", account:provider, source:"demo"});
    const demo = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve(params) }));
    expect(demo).not.toContain("Back to workspace");
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
  });

  it("preserves only safe context in the signed-out gate, without reading a balance", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.getGate.mockResolvedValue({status:"signed_out"});
    const view = await PlanAndUsagePage({ searchParams: Promise.resolve({lang:"en", communicationLang:"zh-Hant", next:"https://outside.invalid"}) });
    expect(view.props.languageSwitcherHref).toBe("/plan-and-usage?lang=en&communicationLang=zh-Hant");
    expect(view.props.loginHref).toBe("/auth/login?next=%2Fplan-and-usage%3Flang%3Den%26communicationLang%3Dzh-Hant");
    expect(view.props.registerHref).toBe("/auth/register?next=%2Fplan-and-usage%3Flang%3Den%26communicationLang%3Dzh-Hant");
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
    expect(mocks.getUsage).not.toHaveBeenCalled();
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

  it.each([
    ["AVAILABLE", "預覽 Points 餘額"],
    ["NOT_READY", "Points 預覽尚未就緒"],
    ["AUTH_REQUIRED", "需要已驗證的登入狀態"],
    ["UNAVAILABLE", "暫時無法載入 Points 預覽"],
  ])("renders complete Traditional Chinese state %s without legacy balance reads", async (status, title) => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.resolvePoints.mockResolvedValue({ status, unit: "POINTS", availablePoints: 1250, reservedPoints: 0,
      serverTime: "2026-09-04T06:10:00.000Z", contractVersion: "1.0.0-shadow.1" });
    const markup = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve({ lang: "zh-Hant", communicationLang: "zh-Hant" }) }));
    const view = document.createElement("div"); view.innerHTML = markup;
    expect(view.querySelector(".careslink-app-shell")?.getAttribute("lang")).toBe("zh-Hant");
    expect(view.querySelector("h1")?.textContent).toBe("Points 餘額");
    expect(markup).toContain(title);
    expect(markup).toContain("預覽 · 尚未啟用");
    expect(markup).toContain("無法發放、購買、預留、使用或轉換 Points");
    expect(markup).toContain("已儲存文件");
    expect(markup).not.toMatch(/Return to the workspace in Traditional Chinese|英文和简体中文|Points（英文）|餘額為零/);
    const primaryReturn = view.querySelector<HTMLAnchorElement>("header a.jade-action");
    expect(primaryReturn?.getAttribute("href")).toBe("/ai-documents?lang=zh-Hant");
    expect(primaryReturn?.textContent).toBe("返回工作台");
    if (status === "AVAILABLE") {
      expect([...view.querySelectorAll("dd")].map(node => node.textContent)).toEqual(["1,250", "0"]);
      expect(markup).toContain("這是唯讀預覽，此餘額目前無法使用。");
      const date = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date("2026-09-04T06:10:00.000Z"));
      expect(markup).toContain(`核驗時間：${date} UTC。`);
    } else {
      expect(view.querySelector("dd")).toBeNull();
      const action = view.querySelector<HTMLAnchorElement>("main a.taito-secondary");
      if (status === "AUTH_REQUIRED") {
        expect(action?.textContent).toBe("登入查看 Points（英文登入頁）");
        const authUrl = new URL(action!.getAttribute("href")!, "https://local.invalid");
        expect(authUrl.searchParams.get("lang")).toBe("en");
        expect(authUrl.searchParams.get("next")).toBe("/plan-and-usage?lang=zh-Hant&communicationLang=zh-Hant");
      } else {
        expect(action?.textContent).toBe("重新載入 Points");
        expect(action?.getAttribute("href")).toBe("/plan-and-usage?lang=zh-Hant&communicationLang=zh-Hant");
        expect(Boolean(view.querySelector('[role="alert"]'))).toBe(status === "UNAVAILABLE");
      }
    }
    expect(mocks.resolvePoints).toHaveBeenCalledTimes(1);
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it.each(["en", "zh-Hans", "zh-Hant"] as const)("keeps original workspace %s across every Points display language", async communicationLang => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    for (const lang of ["en", "zh-Hans", "zh-Hant"]) {
      const view = document.createElement("div");
      view.innerHTML = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve({ lang, communicationLang }) }));
      expect(view.querySelector("header a.jade-action")?.getAttribute("href")).toBe(`/ai-documents?lang=${communicationLang}`);
      for (const switched of ["en", "zh-Hans", "zh-Hant"]) {
        const links = [...view.querySelectorAll<HTMLAnchorElement>(`a[lang="${switched}"]`)];
        expect(links).toHaveLength(2); // desktop and collapsed mobile navigation
        for (const link of links) {
          expect(link.getAttribute("href")).toBe(`/plan-and-usage?lang=${switched}&communicationLang=${communicationLang}`);
          expect(link.getAttribute("aria-current")).toBe(switched === lang ? "page" : null);
          expect(link.className).toContain("min-h-11");
        }
      }
    }
  });

  it.each([true, false])("keeps Traditional Chinese signed-out return context (workspace context: %s)", async withContext => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    mocks.getGate.mockResolvedValue({ status: "signed_out" });
    const expectedNext = `/plan-and-usage?lang=zh-Hant${withContext ? "&communicationLang=zh-Hant" : ""}`;
    const view = document.createElement("div");
    view.innerHTML = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve({ lang: "zh-Hant",
      ...(withContext ? { communicationLang: "zh-Hant" } : {}), next: "https://outside.invalid" }) }));
    expect(view.querySelector("h1")?.textContent).toBe("登入查看 Points 預覽");
    expect(view.textContent).toContain("建立服務商帳戶（英文註冊頁）");
    expect(view.textContent).toContain("預覽邊界");
    for (const path of ["/auth/login", "/auth/register"]) {
      const link = view.querySelector<HTMLAnchorElement>(`a[href^="${path}?"]`)!;
      const url = new URL(link.getAttribute("href")!, "https://local.invalid");
      expect(url.searchParams.get("lang")).toBe("en");
      expect(url.searchParams.get("next")).toBe(expectedNext);
    }
    expect(view.querySelector('a[lang="zh-Hant"]')?.getAttribute("aria-current")).toBe("page");
    expect(view.innerHTML).not.toContain("outside.invalid");
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it.each([undefined, "fr", "zh-hant", ["zh-Hant"], ["zh-Hant", "en"]])("defaults invalid or duplicate Points display language safely %#", async lang => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    const markup = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve({ lang }) }));
    expect(markup).toContain("We can’t load the Points preview right now");
    expect(markup).not.toContain("暫時無法載入");
    expect(mocks.getUsage).not.toHaveBeenCalled();
  });

  it("does not enable Traditional Chinese or Points on the legacy Credits branch", async () => {
    const markup = renderToStaticMarkup(await PlanAndUsagePage({ searchParams: Promise.resolve({ lang: "zh-Hant" }) }));
    expect(markup).toContain("Period limit");
    expect(markup).not.toContain("繁體中文");
    expect(markup).not.toContain("Points 餘額");
    expect(mocks.resolvePoints).not.toHaveBeenCalled();
  });
});
