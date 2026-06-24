import { describe, expect, it } from "vitest";
import {
  getAssessmentFunnel,
  getAssessmentPipeline,
  getReadinessReport,
  getReadinessUpgradeOffers,
  getSourceReadinessMap,
} from "./provider-assessment";

describe("Provider referral readiness assessment", () => {
  it("turns the free assessment into the expected cold-start funnel", () => {
    expect(getAssessmentFunnel().map((step) => step.id)).toEqual([
      "free_assessment",
      "readiness_report",
      "ai_profile_pack",
      "network_entry",
      "pro_or_agency_plan",
    ]);
  });

  it("creates a non-certification readiness report for a provider", () => {
    const report = getReadinessReport("provider-harbour");

    expect(report.providerName).toBe("Harbour Community Support");
    expect(report.level).toBe("Network Partner");
    expect(report.disclaimer).toContain("不是认证");
    expect(report.sections.map((section) => section.id)).toEqual([
      "profile_clarity",
      "service_coverage",
      "intake_response",
      "family_fit",
      "share_card",
      "partner_confidence",
    ]);
    expect(report.nextActions).toContain("生成 AI 中英文 profile 和微信群分享卡片");
  });

  it("summarizes the partner assessment pipeline", () => {
    expect(getAssessmentPipeline("partner-chen")).toMatchObject({
      invited: 48,
      completed: 31,
      ready: 18,
      missingInsurance: 7,
      priorityRegionGap: "Hurstville / Bankstown",
    });
  });

  it("shows source-side network gaps and upgrade offers", () => {
    expect(getSourceReadinessMap("partner-chen").map((item) => item.gap)).toContain(
      "中文 aged care transport 供给不足",
    );
    expect(getReadinessUpgradeOffers().map((offer) => offer.id)).toEqual([
      "ai_profile_pack",
      "share_card_pack",
      "academy_session",
      "provider_pro",
    ]);
  });
});
