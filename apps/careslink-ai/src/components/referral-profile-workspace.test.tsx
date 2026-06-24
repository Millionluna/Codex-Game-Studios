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
  it("localizes zh-Hans product UI while preserving submitted workspace data", () => {
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
      "CaresLink 不评估服务商质量",
    ].forEach((localizedCopy) => {
      expect(markup).toContain(localizedCopy);
    });

    [
      "Alex Lee",
      "Service area",
      "Provider profile",
      "Profile Agent",
      "Capacity status is missing",
      "This audit measures referral communication readiness only, not provider quality.",
    ].forEach((submittedCopy) => {
      expect(markup).toContain(submittedCopy);
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
  });
});
