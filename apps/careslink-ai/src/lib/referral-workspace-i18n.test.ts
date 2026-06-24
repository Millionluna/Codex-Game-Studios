import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getLocaleFromSearchParams,
  getLocaleLabel,
  getReferralWorkspaceCopy,
  isSupportedLocale,
  withLocale,
} from "./referral-workspace-i18n";

describe("referral workspace i18n", () => {
  it("defaults to English when no supported locale is provided", () => {
    expect(getLocaleFromSearchParams(undefined)).toBe(DEFAULT_LOCALE);
    expect(getLocaleFromSearchParams({ lang: "fr" })).toBe(DEFAULT_LOCALE);
    expect(getLocaleFromSearchParams({ lang: ["zh-Hans"] })).toBe("zh-Hans");
    expect(getLocaleFromSearchParams({ lang: ["fr", "en"] })).toBe(
      DEFAULT_LOCALE,
    );
  });

  it("recognizes only supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "zh-Hans"]);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("zh-Hans")).toBe(true);
    expect(isSupportedLocale("zh")).toBe(false);
    expect(isSupportedLocale("fr")).toBe(false);
  });

  it("provides complete shell and boundary copy for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const copy = getReferralWorkspaceCopy(locale);

      expect(copy.shell.brand).toBe("CaresLink");
      expect(copy.shell.primaryNav.workspace.length).toBeGreaterThan(0);
      expect(copy.common.trustBoundary).toContain(
        locale === "zh-Hans" ? "不评估服务商质量" : "does not assess provider quality",
      );
      expect(copy.common.trustBoundary).toContain(
        locale === "zh-Hans" ? "专业建议" : "professional advice",
      );
      expect(copy.common.previewOnly.length).toBeGreaterThan(0);
      expect(copy.admin.boundary.length).toBeGreaterThan(0);
    }
  });

  it("provides display labels for every supported locale", () => {
    expect(SUPPORTED_LOCALES.map(getLocaleLabel)).toEqual([
      "English",
      "简体中文",
    ]);
  });

  it("preserves and replaces locale query params in internal links", () => {
    expect(withLocale("/referral-workspace", "zh-Hans")).toBe(
      "/referral-workspace?lang=zh-Hans",
    );
    expect(
      withLocale("/referral-workspace/materials?access=code", "zh-Hans"),
    ).toBe("/referral-workspace/materials?access=code&lang=zh-Hans");
    expect(withLocale("/referral-workspace?lang=zh-Hans", "en")).toBe(
      "/referral-workspace?lang=en",
    );
  });
});
