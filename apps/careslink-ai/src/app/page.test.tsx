import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth-page-context", async () =>
  import("../lib/auth-page-context"),
);
vi.mock("@/lib/ndis-case-note-companion-navigation", async () =>
  import("../lib/ndis-case-note-companion-navigation"),
);
vi.mock("@/lib/points-ui-feature.server", async () =>
  import("../lib/points-ui-feature.server"),
);
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../lib/referral-workspace-i18n"),
);

import HomePage, { generateMetadata } from "./page";

describe("public home page", () => {
  beforeEach(() => {
    vi.stubEnv("CARESLINK_V1_POINTS_UI_ENABLED", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("localizes public metadata while the app remains globally noindex", async () => {
    await expect(
      generateMetadata({
        searchParams: Promise.resolve({ lang: "en" }),
      }),
    ).resolves.toMatchObject({
      title: "AI Documents for aged care and NDIS | CaresLink AI",
      description:
        "Create review-ready document drafts from de-identified support facts, with privacy prompts and bilingual review.",
    });
    await expect(
      generateMetadata({
        searchParams: Promise.resolve({ lang: "zh-Hans" }),
      }),
    ).resolves.toMatchObject({
      title: "养老服务与 NDIS 的 AI 文档工具 | CaresLink AI",
      description:
        "使用去标识化的支持事实创建可复核的文档草稿，并在生成前检查隐私提示和中文复核内容。",
    });
  });

  it("replaces legacy NDIS generation promises in exact-true Points metadata", async () => {
    vi.stubEnv("CARESLINK_V1_POINTS_UI_ENABLED", "true");

    const englishMetadata = await generateMetadata({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const chineseMetadata = await generateMetadata({
      searchParams: Promise.resolve({ lang: "zh-Hans" }),
    });

    expect(englishMetadata).toMatchObject({
      title: "AI Documents and Points preview | CaresLink AI",
      description:
        "Review the tools currently available and an owner-scoped Points preview. NDIS Case Note is paused during the transition.",
    });
    expect(JSON.stringify(englishMetadata)).not.toContain(
      "Create review-ready document drafts",
    );
    expect(chineseMetadata).toMatchObject({
      title: "AI Documents 与 Points 预览 | CaresLink AI",
      description:
        "查看当前可用工具和仅限账户本人的 Points 预览；NDIS Case Note 在切换期间暂停。",
    });
    expect(JSON.stringify(chineseMetadata)).not.toContain(
      "创建可复核的文档草稿",
    );
  });

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

  it.each([
    ["en", "NDIS Case Note generation is paused", "View Points preview"],
    ["zh-Hans", "NDIS Case Note 生成功能在切换期间暂停", "查看 Points 预览"],
  ] as const)(
    "routes the %s public Points surface away from legacy NDIS generation",
    async (lang, pausedCopy, pointsCta) => {
      vi.stubEnv("CARESLINK_V1_POINTS_UI_ENABLED", "true");

      const element = await HomePage({
        searchParams: Promise.resolve({ lang }),
      });
      const markup = renderToStaticMarkup(element);
      const registerUrl = new URL(
        getPrimaryActionHref(markup),
        "https://ai.careslink.com.au",
      );

      expect(markup).toContain(pausedCopy);
      expect(markup).toContain(pointsCta);
      expect(markup).toContain(`/plan-and-usage?lang=${lang}`);
      expect(markup).not.toContain("/template-companion/ndis-case-note");
      expect(registerUrl.pathname).toBe("/auth/register");
      expect(registerUrl.searchParams.get("next")).toBe(
        "/ai-documents?entry=ndis-case-note-points-cutover",
      );
      expect(registerUrl.searchParams.get("lang")).toBe(lang);
      expect(markup).toContain(
        `/auth/login?next=%2Fai-documents%3Fentry%3Dndis-case-note-points-cutover&amp;lang=${lang}`,
      );
      expect(markup).not.toMatch(
        /turn de-identified support facts into a bilingual draft that can be reviewed, copied and saved/i,
      );
      expect(markup).not.toContain(
        "把去标识化的支持事实整理成可复核、可复制并可保存的双语草稿",
      );
    },
  );

  it("keeps the Points cutover disabled for non-exact flag values", async () => {
    vi.stubEnv("CARESLINK_V1_POINTS_UI_ENABLED", "TRUE");

    const element = await HomePage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(element);
    const registerUrl = new URL(
      getPrimaryActionHref(markup),
      "https://ai.careslink.com.au",
    );

    expect(markup).toContain("Open the Case Note Companion");
    expect(markup).not.toContain("NDIS Case Note generation is paused");
    expect(registerUrl.searchParams.get("next")).toMatch(
      /^\/template-companion\/ndis-case-note\?/,
    );
    await expect(
      generateMetadata({
        searchParams: Promise.resolve({ lang: "en" }),
      }),
    ).resolves.toMatchObject({
      title: "AI Documents for aged care and NDIS | CaresLink AI",
    });
  });
});

function getPrimaryActionHref(markup: string) {
  const anchor = markup.match(/<a\b[^>]*coral-action[^>]*>/)?.[0];
  const encodedHref = anchor?.match(/href="([^"]+)"/)?.[1];

  expect(encodedHref).toBeTruthy();

  return (encodedHref ?? "").replaceAll("&amp;", "&");
}
