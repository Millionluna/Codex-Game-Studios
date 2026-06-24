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

const mojibakeMarkers = [
  "�",
  "绠€",
  "浣撲",
  "涓嶈",
  "璧勬",
  "宸ヤ",
  "鍑嗗",
  "瑙勭",
  "鐨勮",
  "杞",
] as const;

function collectStrings(
  value: unknown,
  path: readonly string[] = [],
): Array<{ path: string; value: string }> {
  if (typeof value === "string") {
    return [{ path: path.join("."), value }];
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => collectStrings(child, [...path, key]),
    );
  }

  return [];
}

describe("referral workspace i18n", () => {
  it("defaults to English when no supported locale is provided", () => {
    expect(getLocaleFromSearchParams(undefined)).toBe(DEFAULT_LOCALE);
    expect(getLocaleFromSearchParams({ lang: "fr" })).toBe(DEFAULT_LOCALE);
    expect(getLocaleFromSearchParams({ lang: ["zh-Hans"] })).toBe("zh-Hans");
    expect(getLocaleFromSearchParams({ lang: ["fr", "en"] })).toBe(
      DEFAULT_LOCALE,
    );
    expect(getLocaleFromSearchParams(new URLSearchParams("lang=zh-Hans"))).toBe(
      "zh-Hans",
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
      expect(Object.keys(copy.shell.primaryNav)).toEqual([
        "workspace",
        "profile",
        "health",
        "materials",
        "accessCode",
        "accessRequests",
      ]);
      expect(Object.keys(copy.shell.legacyNav)).toEqual([
        "groupHeading",
        "demoHub",
        "assessment",
        "dashboard",
        "referrals",
        "providers",
        "referralSourcePortal",
        "providerPortal",
      ]);
      expect(copy.shell.primaryNav.workspace.length).toBeGreaterThan(0);
      expect(copy.shell.primaryNav.accessCode.length).toBeGreaterThan(0);
      expect(copy.shell.primaryNav.accessRequests.length).toBeGreaterThan(0);
      expect(copy.shell.legacyNav.groupHeading.length).toBeGreaterThan(0);
      expect(copy.shell.legacyNav.demoHub.length).toBeGreaterThan(0);
      expect(copy.shell.legacyNav.assessment.length).toBeGreaterThan(0);
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
    expect(withLocale("/referral-workspace#top", "zh-Hans")).toBe(
      "/referral-workspace?lang=zh-Hans#top",
    );
    expect(
      withLocale(
        "/referral-workspace/materials?access=code#preview",
        "zh-Hans",
      ),
    ).toBe("/referral-workspace/materials?access=code&lang=zh-Hans#preview");
  });

  it("keeps every dictionary string populated and all zh-Hans copy free of mojibake sentinel glyphs", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const strings = collectStrings(getReferralWorkspaceCopy(locale));

      expect(strings.length).toBeGreaterThan(0);

      for (const { path, value } of strings) {
        expect(value.trim(), `${locale}.${path}`).not.toBe("");
      }
    }

    const zhStrings = collectStrings({
      copy: getReferralWorkspaceCopy("zh-Hans"),
      label: getLocaleLabel("zh-Hans"),
    });

    expect(
      zhStrings.map(({ value }) => value).join(" "),
      "zh-Hans dictionary",
    ).toMatch(/[\u3400-\u9fff]/u);

    for (const { path, value } of zhStrings) {
      for (const marker of mojibakeMarkers) {
        expect(value, `zh-Hans.${path}`).not.toContain(marker);
      }
    }
  });
});
