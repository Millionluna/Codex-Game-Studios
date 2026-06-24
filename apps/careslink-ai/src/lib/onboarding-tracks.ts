import type { OnboardingRole } from "./types";

export type OnboardingTrack = {
  role: OnboardingRole;
  label: string;
  shortLabel: string;
  description: string;
  examples: string[];
  canSendReferrals: boolean;
  canReceiveReferrals: boolean;
  reviewFocus: string[];
  requiredSections: string[];
};

const onboardingTracks: OnboardingTrack[] = [
  {
    role: "referral_source",
    label: "发 referral 的机构 / 资源方",
    shortLabel: "发 referral",
    description:
      "适合 support coordinator、case manager、社区组织、微信群主或掌握真实需求的渠道方。",
    examples: ["Support coordinator", "社区资源方", "微信群主", "Case manager"],
    canSendReferrals: true,
    canReceiveReferrals: false,
    reviewFocus: ["来源真实性", "需求质量", "联系人可信度"],
    requiredSections: ["机构信息", "常见需求类型", "来源渠道", "跟进联系人"],
  },
  {
    role: "service_provider",
    label: "接 referral 的服务商",
    shortLabel: "接 referral",
    description:
      "适合 NDIS、aged care、allied health、home care 等希望接收匹配机会的服务商。",
    examples: ["NDIS provider", "Home care provider", "Allied health", "Plan manager"],
    canSendReferrals: false,
    canReceiveReferrals: true,
    reviewFocus: ["服务资质", "服务区域", "接单能力"],
    requiredSections: ["服务类型", "覆盖区域", "语言能力", "ABN / 保险 / 资质"],
  },
  {
    role: "both",
    label: "既发也接",
    shortLabel: "两边都做",
    description:
      "适合既有客户来源、也提供服务的 agency、咨询机构或多业务团队，需要同时管理发出和接收的 referral。",
    examples: ["综合 agency", "多业务服务商", "咨询团队"],
    canSendReferrals: true,
    canReceiveReferrals: true,
    reviewFocus: ["来源可信度", "服务资质", "利益冲突边界"],
    requiredSections: ["来源方信息", "服务商资料", "审核说明", "归因规则"],
  },
];

export function getOnboardingTracks() {
  return onboardingTracks;
}

export function getOnboardingTrack(role: OnboardingRole) {
  return onboardingTracks.find((track) => track.role === role);
}

export function summarizeParticipantCapabilities(role: OnboardingRole) {
  const capabilitySummaries: Record<OnboardingRole, string> = {
    referral_source: "可发布和跟进 referral，不能直接接单",
    service_provider: "可接收匹配机会，不能代表来源方发布 referral",
    both: "可发布 referral，也可接收符合资质的匹配机会",
  };

  return capabilitySummaries[role];
}
