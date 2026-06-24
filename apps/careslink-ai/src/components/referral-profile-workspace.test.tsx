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
  it("localizes zh-Hans product UI while preserving submitted profile data", () => {
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
      "服务范围",
      "语言",
      "转介沟通分数",
      "准备度信号",
      "重点问题",
      "引导式材料",
      "智能队列",
      "访问状态",
      "引导式助手",
      "仅预览模式",
      "访问码",
      "未提供",
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
      "Service areas, languages, intake method, and availability.",
    ].forEach((suppliedProfileCopy) => {
      expect(markup).toContain(suppliedProfileCopy);
    });

    [
      "Referral communication score",
      "Readiness signals",
      "Top issues",
      "Guided materials",
      "Agent queue",
      "Access status",
      "Guided copilot",
    ].forEach((englishProductCopy) => {
      expect(markup).not.toContain(englishProductCopy);
    });

    const profileMarkup = renderToStaticMarkup(
      createElement(BasicProfileCard, { summary, locale }),
    );

    expect(profileMarkup).toContain("服务范围");
    expect(profileMarkup).toContain("语言");
    expect(profileMarkup).not.toContain("Service area");
    expect(profileMarkup).not.toContain("Languages");
    expect(profileMarkup).toContain("Alex Lee");
    expect(profileMarkup).toContain("Northern Sydney");
    expect(profileMarkup).toContain("English");
  });
});
