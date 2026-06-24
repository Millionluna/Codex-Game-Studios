import { describe, expect, it } from "vitest";
import {
  getOnboardingTracks,
  summarizeParticipantCapabilities,
} from "./onboarding-tracks";

describe("network onboarding tracks", () => {
  it("separates referral senders from referral receivers", () => {
    const tracks = getOnboardingTracks();

    expect(tracks.map((track) => track.role)).toEqual([
      "referral_source",
      "service_provider",
      "both",
    ]);
    expect(tracks[0]).toMatchObject({
      label: "发 referral 的机构 / 资源方",
      canSendReferrals: true,
      canReceiveReferrals: false,
      reviewFocus: ["来源真实性", "需求质量", "联系人可信度"],
    });
    expect(tracks[1]).toMatchObject({
      label: "接 referral 的服务商",
      canSendReferrals: false,
      canReceiveReferrals: true,
      reviewFocus: ["服务资质", "服务区域", "接单能力"],
    });
    expect(tracks[2]).toMatchObject({
      label: "既发也接",
      canSendReferrals: true,
      canReceiveReferrals: true,
    });
  });

  it("summarizes participant capabilities for review and access control", () => {
    expect(summarizeParticipantCapabilities("referral_source")).toBe(
      "可发布和跟进 referral，不能直接接单",
    );
    expect(summarizeParticipantCapabilities("service_provider")).toBe(
      "可接收匹配机会，不能代表来源方发布 referral",
    );
    expect(summarizeParticipantCapabilities("both")).toBe(
      "可发布 referral，也可接收符合资质的匹配机会",
    );
  });
});
