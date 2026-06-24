import type { Provider, Referral, ReferralMatch } from "./types";
import {
  displayArea,
  displayFundingType,
  displayLanguage,
  displayList,
  displayService,
} from "./display";

const sameText = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

const includesText = (items: string[], value: string) =>
  items.some((item) => sameText(item, value));

const hasLanguageFit = (referral: Referral, provider: Provider) =>
  referral.languageRequirements.length === 0 ||
  referral.languageRequirements.some((language) =>
    includesText(provider.languages, language),
  );

export function matchReferralToProviders(
  referral: Referral,
  providers: Provider[],
): ReferralMatch[] {
  return providers
    .map((provider) => {
      const reasons: string[] = [];
      const gaps: string[] = [];
      let score = 0;

      if (includesText(provider.serviceAreas, referral.clientArea)) {
        score += 20;
        reasons.push(`服务区域匹配：${displayArea(referral.clientArea)}`);
      } else {
        gaps.push("不在已登记服务区域内");
      }

      if (includesText(provider.serviceTypes, referral.needType)) {
        score += 25;
        reasons.push(`提供${displayService(referral.needType)}服务`);
      } else {
        gaps.push("服务类型未登记");
      }

      if (hasLanguageFit(referral, provider)) {
        score += 15;
        if (referral.languageRequirements.length > 0) {
          reasons.push(
            `支持${displayList(referral.languageRequirements, displayLanguage)}`,
          );
        }
      } else {
        gaps.push("暂未覆盖语言要求");
      }

      if (provider.acceptsNewClients) {
        score += 15;
        reasons.push("当前接收新客户");
      } else {
        gaps.push("当前未标记可接新客户");
      }

      if (!referral.urgent || provider.urgentCapacity) {
        score += 10;
        if (referral.urgent) {
          reasons.push("可处理紧急 referral");
        }
      } else {
        gaps.push("未标记紧急接单能力");
      }

      if (referral.fundingType === "NDIS" && provider.supportsNdis) {
        score += 15;
        reasons.push("支持 NDIS");
      } else if (
        referral.fundingType === "Aged Care" &&
        provider.supportsAgedCare
      ) {
        score += 15;
        reasons.push("支持养老护理");
      } else if (referral.fundingType === "Mixed") {
        const mixedFit = provider.supportsNdis || provider.supportsAgedCare;
        if (mixedFit) {
          score += 15;
          reasons.push("支持混合资金路径");
        } else {
          gaps.push("资金路径未标记");
        }
      } else if (referral.fundingType === "Private") {
        score += 15;
        reasons.push(`可评估${displayFundingType(referral.fundingType)}需求`);
      } else {
        gaps.push("资金路径未标记");
      }

      return {
        id: `${referral.id}-${provider.id}`,
        referralId: referral.id,
        providerId: provider.id,
        score,
        reasons,
        gaps,
        status: score >= 70 ? "recommended" : "declined",
        createdAt: "2026-06-21",
      } satisfies ReferralMatch;
    })
    .sort((left, right) => right.score - left.score);
}
