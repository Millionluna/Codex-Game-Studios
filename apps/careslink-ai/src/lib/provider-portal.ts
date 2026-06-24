import { providerProfiles, providers, referrals, shareCards } from "./mock-data";

export function getProviderPortalData(providerId: string) {
  const provider =
    providers.find((item) => item.id === providerId) ?? providers[0];
  const profile = providerProfiles.find((item) => item.providerId === provider.id);
  const shareCard =
    shareCards.find((item) => item.providerId === provider.id) ?? shareCards[0];

  const visibleReferrals = referrals.filter(
    (referral) =>
      referral.assignedProviderId === provider.id ||
      referral.matchedProviderIds.includes(provider.id),
  );

  const requiredFields = [
    provider.name,
    provider.serviceTypes.length,
    provider.serviceAreas.length,
    provider.languages.length,
    provider.contact.phone || provider.contact.email || provider.contact.wechat,
    provider.abn,
    provider.qualifications,
    provider.intro,
    provider.insuranceStatus !== "missing",
  ];

  const completedFields = requiredFields.filter(Boolean).length;
  const profileCompleteness = Math.round(
    (completedFields / requiredFields.length) * 100,
  );

  return {
    provider,
    profile,
    shareCard,
    visibleReferrals,
    profileCompleteness,
    actions: ["确认可接单", "需要更多资料", "暂时无法服务"],
    nextSteps: [
      "确认当前是否继续接收新客户",
      "检查服务区域和语言是否最新",
      "生成微信群可转发服务商卡片",
      "及时更新已联系或已接受的 referral 状态",
    ],
  };
}
