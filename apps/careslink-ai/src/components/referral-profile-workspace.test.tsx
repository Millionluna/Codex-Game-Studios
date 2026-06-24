import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./ui", async () => {
  const React = await import("react");

  return {
    Card: ({
      children,
      className = "",
    }: {
      children: ReactNode;
      className?: string;
    }) => React.createElement("section", { className }, children),
  };
});

vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../lib/referral-workspace-i18n"),
);

import {
  AccessStatusPanel,
  AgentQueuePanel,
  BasicProfileCard,
  GuidedCopilotPanel,
  HealthScorePanel,
  HealthSignalsTable,
  LockedMaterialsGrid,
  TopIssuesPanel,
  TrustBoundaryNotice,
} from "./referral-profile-workspace";
import {
  getAccessState,
  getAgentQueueForAccess,
  getHealthAudit,
  getLockedMaterials,
  getSeedReferralProfiles,
  summarizeProfile,
} from "../lib/referral-profile-workspace";

describe("referral profile workspace shared components", () => {
  it("localizes zh-Hans generated UI copy while preserving submitted profile data", () => {
    const locale = "zh-Hans";
    const profile = getSeedReferralProfiles()[1];
    const summary = summarizeProfile(profile);
    const audit = getHealthAudit(profile);
    const accessState = getAccessState(profile.ownerUserId);
    const materials = getLockedMaterials(profile.referralDirection, accessState);
    const queue = getAgentQueueForAccess(accessState);

    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(BasicProfileCard, { summary, locale }),
        createElement(HealthScorePanel, { audit, locale }),
        createElement(HealthSignalsTable, { audit, locale }),
        createElement(TopIssuesPanel, { audit, locale }),
        createElement(LockedMaterialsGrid, {
          materials,
          accessState,
          locale,
        }),
        createElement(AgentQueuePanel, { queue, accessState, locale }),
        createElement(AccessStatusPanel, { accessState, locale }),
        createElement(GuidedCopilotPanel, {
          accessState,
          queue,
          summary,
          audit,
          locale,
        }),
        createElement(TrustBoundaryNotice, { locale }),
      ),
    );

    [
      "个人",
      "接收转介",
      "服务范围",
      "语言",
      "转介沟通分数",
      "沟通资料需要完善",
      "此审核仅衡量转介沟通准备度",
      "准备度信号",
      "回应时间缺失",
      "当前可接收情况缺失",
      "服务商资料",
      "服务范围、语言、接收方式和可用情况。",
      "资料助手",
      "预览基础资料结构和缺失字段。",
      "基于自行提交的资料信息",
      "CaresLink 不评估服务商质量",
    ].forEach((localizedCopy) => {
      expect(markup).toContain(localizedCopy);
    });

    [
      "Alex Lee",
      "Northern Sydney",
      "English",
      "Independent care navigator accepting a small number of enquiries.",
    ].forEach((submittedProfileCopy) => {
      expect(markup).toContain(submittedProfileCopy);
    });

    [
      "Individual",
      "Receives referrals",
      "Communication profile",
      "This audit measures referral communication readiness only, not provider quality.",
      "Capacity status is missing",
      "Provider profile",
      "Profile Agent",
      "Preview basic profile structure and missing fields.",
      "Access code required for guided AI materials.",
      "Guided materials",
      "Agent queue",
      "Access status",
      "Guided copilot",
    ].forEach((englishGeneratedCopy) => {
      expect(markup).not.toContain(englishGeneratedCopy);
    });

    const profileMarkup = renderToStaticMarkup(
      createElement(BasicProfileCard, { summary, locale }),
    );

    expect(profileMarkup).toContain("个人");
    expect(profileMarkup).toContain("接收转介");
    expect(profileMarkup).toContain("服务范围");
    expect(profileMarkup).toContain("语言");
    expect(profileMarkup).not.toContain("Individual");
    expect(profileMarkup).not.toContain("Receives referrals");
    expect(profileMarkup).not.toContain("Service area");
    expect(profileMarkup).not.toContain("Languages");
    expect(profileMarkup).toContain("Alex Lee");
    expect(profileMarkup).toContain("Northern Sydney");
    expect(profileMarkup).toContain("English");
  });

  it("localizes unsafe summary remediation for zh-Hans issue panels", () => {
    const profile = {
      ...getSeedReferralProfiles()[0],
      summary:
        "We are a certified recommended provider for families comparing care options, with a complete profile that includes broad context for referrers.",
    };
    const audit = getHealthAudit(profile);

    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(HealthScorePanel, { audit, locale: "zh-Hans" }),
        createElement(TopIssuesPanel, { audit, locale: "zh-Hans" }),
      ),
    );

    expect(markup).toContain(
      "移除验证、背书、结果、临床适用性或合规状态声明",
    );
    expect(markup).not.toContain("补充清晰的自行提交资料摘要");
    expect(markup).not.toContain(
      "Add clear self-submitted profile summary text",
    );
  });

  it("localizes access code type labels for zh-Hans access status", () => {
    const accessState = {
      ...getAccessState("user-approved"),
      codeType: "Dual Role Pilot" as const,
    };

    const markup = renderToStaticMarkup(
      createElement(AccessStatusPanel, { accessState, locale: "zh-Hans" }),
    );

    expect(markup).toContain("双向角色试点");
    expect(markup).not.toContain("Dual Role Pilot");
  });

  it("localizes known empty list placeholders without changing submitted values", () => {
    const profile = {
      ...getSeedReferralProfiles()[0],
      serviceAreas: [],
      languages: [],
    };
    const summary = summarizeProfile(profile);

    expect(summary.serviceAreaLabel).toBe("Not yet provided");
    expect(summary.languageLabel).toBe("Not yet provided");

    const markup = renderToStaticMarkup(
      createElement(BasicProfileCard, { summary, locale: "zh-Hans" }),
    );

    expect(markup).toContain("尚未提供");
    expect(markup).not.toContain("Not yet provided");
    expect(markup).toContain(profile.name);
  });
});
