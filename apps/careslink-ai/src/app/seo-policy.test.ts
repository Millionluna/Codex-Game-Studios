import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARESLINK_AI_NOINDEX_ROBOTS,
  CARESLINK_AI_PROTECTED_ROUTE_FAMILIES,
} from "../lib/seo-policy";
import robots from "./robots";

describe("CaresLink AI crawl and index policy", () => {
  it("allows crawlers to read HTML noindex while excluding APIs", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
    });
  });

  it("keeps the whole app noindex and records every protected route family", () => {
    const layout = readAppSource("layout.tsx");

    expect(CARESLINK_AI_NOINDEX_ROBOTS).toEqual({
      index: false,
      follow: false,
    });
    expect(layout).toContain("robots: CARESLINK_AI_NOINDEX_ROBOTS");
    expect(CARESLINK_AI_PROTECTED_ROUTE_FAMILIES).toEqual(
      expect.arrayContaining([
        "/auth/",
        "/admin/",
        "/ai-documents",
        "/template-companion/",
        "/referral-workspace/",
        "/plan-and-usage",
        "/provider-profile-generator/preview/",
        "/providers/",
        "/referrals/",
      ]),
    );
  });

  it("synchronizes the document language from the allowlisted locale query", () => {
    const layout = readAppSource("layout.tsx");

    expect(layout).toContain(
      'locale === "zh-Hans" ? "zh-Hans" : "en"',
    );
    expect(layout).toContain("suppressHydrationWarning");
    expect(layout).not.toContain("document.documentElement.lang = locale;");
  });

  it("does not combine the Case Note noindex page with a canonical signal", () => {
    const companionPage = readAppSource(
      "template-companion/ndis-case-note/page.tsx",
    );

    expect(companionPage).toContain(
      "robots: CARESLINK_AI_NOINDEX_ROBOTS",
    );
    expect(companionPage).not.toContain("alternates:");
    expect(companionPage).not.toContain("canonical:");
  });

  it("keeps explicit noindex guards on account, usage and draft surfaces", () => {
    const login = readAppSource("auth/login/page.tsx");
    const register = readAppSource("auth/register/page.tsx");
    const plan = readAppSource("plan-and-usage/page.tsx");
    const profilePreview = readAppSource(
      "provider-profile-generator/preview/[draftId]/page.tsx",
    );

    expect(login).toContain("robots: CARESLINK_AI_NOINDEX_ROBOTS");
    expect(register).toContain("robots: CARESLINK_AI_NOINDEX_ROBOTS");
    expect(plan).toContain("robots: { index: false, follow: false }");
    expect(profilePreview).toContain("index: false");
    expect(profilePreview).toContain("follow: false");
  });
});

function readAppSource(relativePath: string) {
  return readFileSync(join(process.cwd(), "src/app", relativePath), "utf8");
}
