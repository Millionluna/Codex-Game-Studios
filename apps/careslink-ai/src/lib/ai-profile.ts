import type { Provider, ProviderProfile } from "./types";
import {
  displayArea,
  displayLanguage,
  displayList,
  displayService,
} from "./display";

export function generateProviderProfile(provider: Provider): ProviderProfile {
  const services = displayList(provider.serviceTypes, displayService);
  const areas = displayList(provider.serviceAreas, displayArea);
  const languages = displayList(provider.languages, displayLanguage);
  const intake = provider.acceptsNewClients
    ? "当前接收新客户"
    : "名额有限";
  const funding = [
    provider.supportsNdis ? "NDIS" : null,
    provider.supportsAgedCare ? "养老护理" : null,
  ]
    .filter(Boolean)
    .join(" 和 ");

  return {
    providerId: provider.id,
    englishIntro: `${provider.name} provides ${provider.serviceTypes.join(", ")} across ${provider.serviceAreas.join(", ")}. The team supports ${provider.languages.join(", ")} speakers and is available for ${funding || "community service"} referrals.`,
    chineseIntro: `${provider.name} 提供 ${services} 服务，覆盖 ${areas}。团队可使用 ${languages} 沟通，适合需要可信转介支持的 aged care / NDIS 客户。`,
    elevatorPitch: `${provider.name} 是面向 referral partner 的可信服务商，适合需要在 ${areas} 快速找到 ${services} 支持的需求。`,
    wechatCopy: `${provider.name} | ${services}\n区域：${areas}\n语言：${languages}\n${intake}${provider.urgentCapacity ? " | 可处理紧急需求" : ""}`,
    partnerRecommendation: `推荐给正在寻找 ${areas} 区域 ${services} 服务的 referral partner，尤其适合需要 ${languages} 沟通和 ${funding || "社区服务"}经验的客户。`,
    shareCardCopy: `${intake}。服务：${services}。区域：${areas}。语言：${languages}。`,
    profilePageCopy: `${provider.intro} ${provider.qualifications} 来源：${provider.sourceGroupName}。`,
  };
}
