import { describe, expect, it } from "vitest";
import { matchReferralToProviders } from "./referral-matching";
import type { Provider, Referral } from "./types";

const providers: Provider[] = [
  {
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
    intro:
      "Bilingual aged care and NDIS coordination team serving Greater Sydney.",
    logoUrl: "/provider-harbour.png",
    sourcePartnerId: "partner-chen",
    sourceGroupName: "Sydney Aged Care Referral Hub",
    sourceInviteLink: "invite-001",
    sourceShareCardId: "card-provider-fit",
    membershipPlan: "Pro",
    createdBy: "user-operator",
    reviewedBy: "user-admin",
    createdAt: "2026-06-01",
  },
  {
    id: "provider-miss",
    name: "Brisbane Allied Care",
    serviceTypes: ["Physiotherapy"],
    serviceAreas: ["Brisbane"],
    languages: ["English"],
    contact: {
      phone: "07 3000 1000",
      email: "hello@brisbane.example",
    },
    abn: "98 765 432 109",
    status: "approved",
    acceptsNewClients: false,
    supportsNdis: true,
    supportsAgedCare: false,
    urgentCapacity: false,
    chineseProvider: false,
    qualifications: "Allied health clinic.",
    insuranceStatus: "uploaded",
    intro: "Allied health clinic in Brisbane.",
    logoUrl: "/provider-brisbane.png",
    sourcePartnerId: "partner-lee",
    sourceGroupName: "Brisbane Provider Circle",
    sourceInviteLink: "invite-002",
    sourceShareCardId: "card-provider-miss",
    membershipPlan: "Free",
    createdBy: "user-operator",
    reviewedBy: "user-admin",
    createdAt: "2026-06-03",
  },
];

const referral: Referral = {
  id: "referral-001",
  clientArea: "Parramatta",
  needType: "Support Coordination",
  languageRequirements: ["Mandarin"],
  frequency: "Weekly",
  urgent: true,
  fundingType: "NDIS",
  summary:
    "Mandarin-speaking participant needs urgent support coordination in Parramatta.",
  contactName: "Referral partner",
  contactPhone: "04 0000 0000",
  sourcePartnerId: "partner-chen",
  sourceGroupName: "Sydney Aged Care Referral Hub",
  sourceChannelId: "channel-wechat-sydney",
  status: "Pending Match",
  notes: "Came from a WeChat referral thread.",
  followUpDate: "2026-06-24",
  assignedProviderId: null,
  matchedProviderIds: [],
  createdBy: "user-operator",
  followedBy: "user-operator",
  createdAt: "2026-06-21",
};

describe("matchReferralToProviders", () => {
  it("ranks providers by area, service, language, intake capacity, urgency, and funding fit", () => {
    const matches = matchReferralToProviders(referral, providers);

    expect(matches[0]).toMatchObject({
      providerId: "provider-fit",
      referralId: "referral-001",
      score: 100,
      reasons: [
        "服务区域匹配：帕拉马塔",
        "提供支持协调服务",
        "支持普通话",
        "当前接收新客户",
        "可处理紧急 referral",
        "支持 NDIS",
      ],
    });
  });

  it("keeps weak providers visible with lower scores and clear gaps", () => {
    const matches = matchReferralToProviders(referral, providers);
    const weakMatch = matches.find((match) => match.providerId === "provider-miss");

    expect(weakMatch).toMatchObject({
      score: 15,
      reasons: ["支持 NDIS"],
      gaps: [
        "不在已登记服务区域内",
        "服务类型未登记",
        "暂未覆盖语言要求",
        "当前未标记可接新客户",
        "未标记紧急接单能力",
      ],
    });
  });
});
