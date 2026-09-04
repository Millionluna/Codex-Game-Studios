import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPointsUiEnabled: vi.fn(),
}));

vi.mock("@/components/app-shell", async () =>
  import("../../components/app-shell"),
);
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);
vi.mock("@/lib/points-ui-feature.server", () => ({
  isCaresLinkV1PointsUiEnabled: mocks.isPointsUiEnabled,
}));

describe("AI privacy notice", () => {
  beforeEach(() => {
    mocks.isPointsUiEnabled.mockReturnValue(false);
  });

  it("lets the root title template add the brand only once", async () => {
    const { metadata } = await import("./page");

    expect(metadata.title).toBe("Privacy, collection and retention");
  });

  it("renders the English collection and retention contract", async () => {
    const { default: PrivacyNoticePage } = await import("./page");
    const markup = renderToStaticMarkup(
      await PrivacyNoticePage({ searchParams: Promise.resolve({ lang: "en" }) }),
    );

    expect(markup).toContain("Privacy, collection and retention notice");
    expect(markup).toContain("store:false");
    expect(markup).toContain("30 minutes");
    expect(markup).toContain("cannot be claimed or saved");
    expect(markup).toContain("does not promise physical deletion");
    expect(markup).toContain("until that user deletes it");
    expect(markup).toContain("metadata");
    expect(markup).toContain(
      "The current Communication Note Composer is a separate local-only release",
    );
    expect(markup).toContain("not sent to the Product API or OpenAI");
    expect(markup).toContain("must be enabled separately");
    expect(markup).toContain("For the connected NDIS Case Note Companion");
    expect(markup).toContain(
      "We do not describe that setting as zero data retention",
    );
  });

  it("renders a readable Simplified Chinese notice and product boundary", async () => {
    const { default: PrivacyNoticePage } = await import("./page");
    const markup = renderToStaticMarkup(
      await PrivacyNoticePage({
        searchParams: Promise.resolve({ lang: "zh-Hans" }),
      }),
    );

    expect(markup).toContain("隐私、信息收集与保留说明");
    expect(markup).toContain("30 分钟");
    expect(markup).toContain("到期后不能再领取或保存");
    expect(markup).toContain("不承诺在第 30 分钟即时物理删除");
    expect(markup).toContain("直到该用户主动删除");
    expect(markup).toContain("不是完成的正式记录");
    expect(markup).toContain("Communication Note Composer 当前是独立的本地版本");
    expect(markup).toContain("不会发送给 Product API 或 OpenAI");
    expect(markup).toContain("必须单独启用");
    expect(markup).toContain("对于已联网的 NDIS Case Note Companion");
  });

  it("describes the paused NDIS boundary without exposing legacy Credits in Points mode", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    const { default: PrivacyNoticePage } = await import("./page");
    const markup = renderToStaticMarkup(
      await PrivacyNoticePage({ searchParams: Promise.resolve({ lang: "en" }) }),
    );

    expect(markup).toContain("During the Points preview");
    expect(markup).toContain("NDIS Case Note generation is paused");
    expect(markup).toContain("Back to AI Documents");
    expect(markup).toContain('href="/ai-documents?lang=en"');
    expect(markup).not.toContain("/template-companion/ndis-case-note");
    expect(markup).not.toMatch(/\bcredits?\b/i);
  });

  it("renders the same Points isolation boundary in Simplified Chinese", async () => {
    mocks.isPointsUiEnabled.mockReturnValue(true);
    const { default: PrivacyNoticePage } = await import("./page");
    const markup = renderToStaticMarkup(
      await PrivacyNoticePage({
        searchParams: Promise.resolve({ lang: "zh-Hans" }),
      }),
    );

    expect(markup).toContain("Points 预览期间");
    expect(markup).toContain("NDIS Case Note 生成功能已暂停");
    expect(markup).toContain("返回 AI 文档");
    expect(markup).not.toContain("/template-companion/ndis-case-note");
    expect(markup).not.toMatch(/\bcredits?\b/i);
  });
});
