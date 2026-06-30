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
  "\uFFFD",
  "\u7BA0\u20AC",
  "\u6D63\u64B2",
  "\u6D93\u5D76",
  "\u9435\u52F6",
  "\u5B80\u641E",
  "\u95B8\u621D",
  "\u941F\u6B0F",
  "\u95BB\u3125",
  "\u93C9\u70C6",
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
        "referralPack",
        "outreach",
        "accessCode",
        "accessRequests",
        "materialUsage",
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
      expect(Object.keys(copy.components)).toEqual([
        "basicProfile",
        "healthScore",
        "healthSignals",
        "topIssues",
        "materialsGrid",
        "agentQueue",
        "accessStatus",
        "copilot",
      ]);
      expect(copy.shell.primaryNav.workspace.length).toBeGreaterThan(0);
      expect(copy.shell.primaryNav.accessCode.length).toBeGreaterThan(0);
      expect(copy.shell.primaryNav.accessRequests.length).toBeGreaterThan(0);
      expect(copy.shell.legacyNav.groupHeading.length).toBeGreaterThan(0);
      expect(copy.shell.legacyNav.demoHub.length).toBeGreaterThan(0);
      expect(copy.shell.legacyNav.assessment.length).toBeGreaterThan(0);
      expect(copy.common.trustBoundary).toContain(copy.common.selfSubmitted);
      expect(copy.common.trustBoundary).toContain(
        locale === "zh-Hans" ? "不评估服务商质量" : "does not assess provider quality",
      );
      expect(copy.common.trustBoundary).toContain(
        locale === "zh-Hans" ? "临床适用性" : "clinical suitability",
      );
      expect(copy.common.trustBoundary).toContain(
        locale === "zh-Hans" ? "合规状态" : "compliance status",
      );
      expect(copy.common.trustBoundary).toContain(
        locale === "zh-Hans" ? "服务结果" : "service outcomes",
      );
      expect(copy.common.trustBoundary).toContain(
        locale === "zh-Hans" ? "专业建议" : "professional advice",
      );
      expect(copy.common.previewOnly.length).toBeGreaterThan(0);
      expect(copy.admin.boundary.length).toBeGreaterThan(0);
      expect(copy.components.basicProfile.serviceArea.length).toBeGreaterThan(0);
      expect(copy.components.basicProfile.languages.length).toBeGreaterThan(0);
      expect(copy.components.healthScore.heading.length).toBeGreaterThan(0);
      expect(copy.components.healthSignals.statusLabels.good.length).toBeGreaterThan(0);
      expect(copy.components.topIssues.priorityLabels.high.length).toBeGreaterThan(0);
      expect(copy.components.materialsGrid.lockedMessages.accessRequired).toContain(
        locale === "zh-Hans" ? "访问码" : "Access code",
      );
      expect(copy.components.agentQueue.lockedBadgeLabels.accessCode.length).toBeGreaterThan(0);
      expect(copy.components.accessStatus.states.free.label.length).toBeGreaterThan(0);
      expect(copy.components.copilot.boundaryMessages.accessRequired.length).toBeGreaterThan(0);
    }
  });

  it("provides display labels for every supported locale", () => {
    expect(SUPPORTED_LOCALES.map(getLocaleLabel)).toEqual([
      "English",
      "简体中文",
    ]);
  });

  it("provides unsafe summary remediation and access code type labels", () => {
    const enComponents = getReferralWorkspaceCopy("en").components;
    const zhComponents = getReferralWorkspaceCopy("zh-Hans").components;

    expect(enComponents.basicProfile.descriptionNeedsReview).toBe(
      "The self-submitted profile summary needs review before it can be displayed.",
    );
    expect(zhComponents.basicProfile.descriptionNeedsReview).toBe(
      "自行提交的资料摘要需要审核后才能显示。",
    );
    expect(enComponents.topIssues.issues.unsafe_profile_readability.guidance).toContain(
      "remove claims that suggest verification, endorsement, outcomes, clinical suitability, or compliance status",
    );
    expect(zhComponents.topIssues.issues.unsafe_profile_readability.guidance).toContain(
      "移除验证、背书、结果、临床适用性或合规状态声明",
    );
    expect(enComponents.accessStatus.codeTypeLabels["Dual Role Pilot"]).toBe(
      "Dual Role Pilot",
    );
    expect(zhComponents.accessStatus.codeTypeLabels["Dual Role Pilot"]).toBe(
      "双向角色试点",
    );
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

  it("keeps Simplified Chinese materials copy natural for provider-facing pages", () => {
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const zhCopy = collectStrings(copy)
      .map(({ value }) => value)
      .join(" ");
    const materialsCopy = collectStrings(copy.materials)
      .map(({ value }) => value)
      .join(" ");
    const authGateCopy = [
      copy.auth.gate.description,
      copy.auth.register.description,
    ].join(" ");

    expect(materialsCopy).toContain("创建资料包草稿");
    expect(materialsCopy).toContain("服务商资料");
    expect(materialsCopy).toContain("转介消息");
    expect(materialsCopy).toContain("资料包草稿已生成，等待复核");
    expect(materialsCopy).toContain("可放入 Referral Pack 的转介沟通草稿");
    expect(zhCopy).toContain("Referral Pack 工作台");
    expect(zhCopy).toContain("工作区访问");
    expect(zhCopy).toContain("仅用于一般商业资料和运营支持");
    expect(authGateCopy).toContain("服务商资料、访问申请和引导式材料状态");

    for (const mixedTerm of [
      "优化 profile 文案",
      "provider 资料",
      "Provider 需要审核",
      "生成 profile 改写",
      "Profile 改写已生成",
      "profile 改写草稿",
      "provider 审核",
      "Provider 资料、access request",
    ]) {
      expect(`${materialsCopy} ${authGateCopy}`).not.toContain(mixedTerm);
    }
  });

  it("keeps provider-facing workspace copy free of internal vendor and assurance terms", () => {
    const blockedTerms = [
      "openai",
      "real ai",
      "provider 资料",
      "profile 文案",
      "access request",
      "demo account",
      "demo access",
      "approved provider",
      "verified",
      "compliant",
      "certified",
      "endorsed",
      "guaranteed",
    ] as const;
    const providerFacingCopy = SUPPORTED_LOCALES.flatMap((locale) => {
      const copy = getReferralWorkspaceCopy(locale);

      return collectStrings({
        common: copy.common,
        shell: {
          brand: copy.shell.brand,
          subtitle: copy.shell.subtitle,
          language: copy.shell.language,
          pilotPreview: copy.shell.pilotPreview,
          pilotBoundary: copy.shell.pilotBoundary,
          primaryNav: {
            workspace: copy.shell.primaryNav.workspace,
            profile: copy.shell.primaryNav.profile,
            health: copy.shell.primaryNav.health,
            materials: copy.shell.primaryNav.materials,
            accessCode: copy.shell.primaryNav.accessCode,
          },
        },
        workspace: copy.workspace,
        profile: copy.profile,
        health: copy.health,
        materials: copy.materials,
        access: copy.access,
        auth: copy.auth,
        components: copy.components,
      }).map(({ path, value }) => ({ locale, path, value }));
    });

    for (const { locale, path, value } of providerFacingCopy) {
      const normalizedValue = value.toLowerCase();

      for (const blockedTerm of blockedTerms) {
        expect(normalizedValue, `${locale}.${path}`).not.toContain(blockedTerm);
      }
    }
  });
});
