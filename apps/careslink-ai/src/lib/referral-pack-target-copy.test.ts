import { describe, expect, it } from "vitest";
import type { ReferralProfile } from "./referral-profile-workspace";
import {
  buildReferralPackTargetCopy,
  referralPackTargetOptions,
} from "./referral-pack-target-copy";

const profile: ReferralProfile = {
  id: "provider-1",
  ownerUserId: "user-approved",
  name: "Harbour Community Support",
  entityType: "organisation",
  referralDirection: "receive",
  submittedBy: "self",
  summary:
    "Neighbourhood aged care navigation and social support for older adults.",
  serviceAreas: ["Sydney", "Chatswood"],
  languages: ["English", "Mandarin"],
  bestFit: ["Older adults needing community navigation"],
  receive: {
    intakeMethod: "Phone warm handover and secure web form",
    responseTime: "Within two business days",
    capacityStatus: "Accepting selected new enquiries",
  },
  updatedAt: "2026-06-30T00:00:00.000Z",
};

describe("referral pack target copy", () => {
  it("lists the supported recipient targets", () => {
    expect(referralPackTargetOptions.map((target) => target.id)).toEqual([
      "support_coordinator",
      "case_manager",
      "provider_partner",
      "community_group",
      "family_contact",
    ]);
  });

  it("builds support coordinator wording without endorsement claims", () => {
    const copy = buildReferralPackTargetCopy({
      profile,
      target: "support_coordinator",
      locale: "en",
    });

    expect(copy.title).toBe("For support coordinators");
    expect(copy.body).toContain("Harbour Community Support");
    expect(copy.body).toContain("Sydney, Chatswood");
    expect(copy.body).toContain("Phone warm handover and secure web form");
    expect(copy.body).not.toMatch(
      /verified|approved|endorsed|guaranteed|compliant|certified|quality/i,
    );
  });

  it("builds community group wording in Simplified Chinese", () => {
    const copy = buildReferralPackTargetCopy({
      profile,
      target: "community_group",
      locale: "zh-Hans",
    });

    expect(copy.title).toBe("发给社区群组");
    expect(copy.body).toContain("Harbour Community Support");
    expect(copy.body).toContain("Sydney、Chatswood");
    expect(copy.body).toContain("English、Mandarin");
    expect(copy.reviewNote).toContain("服务商");
  });

  it("uses plain-language family wording", () => {
    const copy = buildReferralPackTargetCopy({
      profile,
      target: "family_contact",
      locale: "en",
    });

    expect(copy.title).toBe("For family contacts");
    expect(copy.description).toContain("Plain-language");
    expect(copy.body).toContain("next step");
  });
});
