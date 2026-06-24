import { describe, expect, it } from "vitest";
import { generateProviderProfile } from "./ai-profile";
import type { Provider } from "./types";

const provider: Provider = {
  id: "provider-fit",
  name: "Harbour Community Support",
  serviceTypes: ["Support Coordination", "Personal Care"],
  serviceAreas: ["Sydney", "Parramatta"],
  languages: ["English", "Mandarin"],
  contact: {
    phone: "02 9000 1000",
    email: "hello@harbour.example",
    wechat: "harbour-care",
    website: "https://harbour.example",
  },
  abn: "12 345 678 901",
  status: "approved",
  acceptsNewClients: true,
  supportsNdis: true,
  supportsAgedCare: true,
  urgentCapacity: true,
  chineseProvider: true,
  qualifications: "Registered NDIS provider with bilingual care coordinators.",
  insuranceStatus: "uploaded",
  intro: "Bilingual aged care and NDIS coordination team serving Greater Sydney.",
  logoUrl: "/provider-harbour.png",
  sourcePartnerId: "partner-chen",
  sourceGroupName: "Sydney Aged Care Referral Hub",
  sourceInviteLink: "invite-001",
  sourceShareCardId: "card-provider-fit",
  membershipPlan: "Pro",
  createdBy: "user-operator",
  reviewedBy: "user-admin",
  createdAt: "2026-06-01",
};

describe("generateProviderProfile", () => {
  it("creates reusable bilingual referral marketing copy from provider data", () => {
    const profile = generateProviderProfile(provider);

    expect(profile.englishIntro).toContain("Harbour Community Support");
    expect(profile.englishIntro).toContain("Support Coordination");
    expect(profile.chineseIntro).toContain("Harbour Community Support");
    expect(profile.wechatCopy).toContain("帕拉马塔");
    expect(profile.partnerRecommendation).toContain("普通话");
    expect(profile.shareCardCopy).toContain("当前接收新客户");
  });
});
