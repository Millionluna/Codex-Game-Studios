import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", async () =>
  import("../../components/app-shell"),
);
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);

describe("AI privacy notice", () => {
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
  });
});
