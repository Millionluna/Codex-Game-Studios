import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ndis-case-note-companion-navigation", async () =>
  import("../lib/ndis-case-note-companion-navigation"),
);
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../lib/referral-workspace-i18n"),
);

import HomePage from "./page";

describe("public home page", () => {
  it("leads with AI Documents and a provider-only Case Note auth handoff", async () => {
    const element = await HomePage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("/careslink-ai-logo-reverse.svg");
    expect(markup).toContain("AI Documents for aged care and NDIS");
    expect(markup).toContain(
      "Turn support facts into review-ready documentation.",
    );
    expect(markup).toContain("English case note draft");
    expect(markup).toContain("Chinese review version");
    expect(markup).toContain("Documents first, referrals alongside.");
    expect(markup).toContain("Referrals");
    expect(markup).toContain("Profile &amp; Readiness");
    expect(markup).toContain(
      'href="/referral-workspace/referral-pack?lang=en"',
    );
    expect(markup).toContain('href="/referral-workspace/profile?lang=en"');

    expect(markup).not.toContain("Provider growth funnel");
    expect(markup).not.toContain("Build a referral-ready provider profile");
    expect(markup).not.toContain("Access Code");
    expect(markup).not.toContain("Free public preview");
    expect(markup).not.toContain("Create free provider profile");
    expect(markup).not.toContain(">CL<");

    expect(markup.match(/coral-action/g)).toHaveLength(1);

    const registerHref = getPrimaryActionHref(markup);
    const registerUrl = new URL(registerHref, "https://ai.careslink.com.au");
    const next = registerUrl.searchParams.get("next");

    expect(registerUrl.pathname).toBe("/auth/register");
    expect(next).toBe(registerUrl.searchParams.get("returnTo"));
    expect(next).toBe(
      "/template-companion/ndis-case-note?source=ndis-case-note-download&resourceSlug=ndis-case-note-template&lang=en",
    );
    expect(next).not.toContain("http");
  });

  it("renders natural Simplified Chinese copy and preserves locale through auth", async () => {
    const element = await HomePage({
      searchParams: Promise.resolve({ lang: "zh-Hans" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("面向 aged care 与 NDIS 的 AI 文档工具");
    expect(markup).toContain("把支持事实整理成可复核的文档草稿。");
    expect(markup).toContain("创建免费账户");
    expect(markup).toContain("仅用于核对，不是第二份正式记录");
    expect(markup).toContain("文档为主，转介为辅。");
    expect(markup).toContain("去标识化由用户复核");
    expect(markup).not.toContain("Provider growth funnel");
    expect(markup).not.toContain("Access Code");

    const registerHref = getPrimaryActionHref(markup);
    const registerUrl = new URL(registerHref, "https://ai.careslink.com.au");
    const next = registerUrl.searchParams.get("next") ?? "";

    expect(registerUrl.searchParams.get("lang")).toBe("zh-Hans");
    expect(next).toContain("lang=zh-Hans");
    expect(next).toMatch(/^\/template-companion\/ndis-case-note\?/);
    expect(markup.match(/coral-action/g)).toHaveLength(1);
  });
});

function getPrimaryActionHref(markup: string) {
  const anchor = markup.match(/<a\b[^>]*coral-action[^>]*>/)?.[0];
  const encodedHref = anchor?.match(/href="([^"]+)"/)?.[1];

  expect(encodedHref).toBeTruthy();

  return (encodedHref ?? "").replaceAll("&amp;", "&");
}
