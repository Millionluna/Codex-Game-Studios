import type { ReferralProfile } from "./referral-profile-workspace";
import type { Locale } from "./referral-workspace-i18n";

export type ReferralPackTarget =
  | "support_coordinator"
  | "case_manager"
  | "provider_partner"
  | "community_group"
  | "family_contact";

export type ReferralPackTargetCopy = {
  target: ReferralPackTarget;
  title: string;
  description: string;
  body: string;
  reviewNote: string;
};

export const referralPackTargetOptions: Array<{
  id: ReferralPackTarget;
  enLabel: string;
  zhLabel: string;
}> = [
  {
    id: "support_coordinator",
    enLabel: "Support coordinator",
    zhLabel: "支持协调员",
  },
  { id: "case_manager", enLabel: "Case manager", zhLabel: "个案经理" },
  { id: "provider_partner", enLabel: "Other provider", zhLabel: "其他服务商" },
  { id: "community_group", enLabel: "Community group", zhLabel: "社区群组" },
  { id: "family_contact", enLabel: "Family contact", zhLabel: "家庭联系人" },
];

export function buildReferralPackTargetCopy({
  profile,
  target,
  locale,
}: {
  profile: ReferralProfile;
  target: ReferralPackTarget;
  locale: Locale;
}): ReferralPackTargetCopy {
  const context = buildContext(profile, locale);

  return locale === "zh-Hans"
    ? buildZhCopy(context, target)
    : buildEnCopy(context, target);
}

function buildEnCopy(
  context: ReturnType<typeof buildContext>,
  target: ReferralPackTarget,
): ReferralPackTargetCopy {
  const { profile, services, areas, languages, bestFit, intake, responseTime } =
    context;
  const common = [
    `${profile.name} can be introduced for ${services}`,
    areas ? `Service area: ${areas}.` : "",
    languages ? `Languages: ${languages}.` : "",
    bestFit ? `Best-fit enquiries: ${bestFit}.` : "",
    intake ? `Suggested intake path: ${intake}.` : "",
    responseTime ? `Expected response: ${responseTime}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const reviewNote =
    "Provider review is required before sharing. This wording is general business profile and operational support only.";

  switch (target) {
    case "support_coordinator":
      return {
        target,
        title: "For support coordinators",
        description:
          "Professional wording that highlights service fit, area, intake path, and response expectations.",
        body: `${common}\n\nYou can use this as a warm introduction if the person's goals and location appear to fit the services listed above.`,
        reviewNote,
      };
    case "case_manager":
      return {
        target,
        title: "For case managers",
        description:
          "Operational wording for referral fit, contact path, and information needed before introduction.",
        body: `${common}\n\nBefore introduction, it may help to include the person's goals, preferred contact time, language needs, and consent status.`,
        reviewNote,
      };
    case "provider_partner":
      return {
        target,
        title: "For provider partners",
        description:
          "Peer-to-peer wording for handover context and collaboration boundaries.",
        body: `${common}\n\nIf another provider is introducing someone, they can include the support need, location, preferred language, and any handover notes that the person has agreed to share.`,
        reviewNote,
      };
    case "community_group":
      return {
        target,
        title: "For community groups",
        description:
          "Short, forwardable wording for community groups or messaging apps.",
        body: `${profile.name} supports ${services}\nAreas: ${areas || "please confirm"}\nLanguages: ${languages || "please confirm"}\nContact path: ${intake || "please confirm"}\n\nPlease review the details before forwarding and contact the provider directly for the next step.`,
        reviewNote,
      };
    case "family_contact":
      return {
        target,
        title: "For family contacts",
        description:
          "Plain-language wording for families who need to understand the service and next step.",
        body: `${profile.name} may be able to help with ${services}\nThey work around ${areas || "the listed service area"} and can communicate in ${languages || "the listed languages"}.\n\nThe next step is to contact the provider through ${intake || "the listed contact path"} and confirm whether the support needed is a fit.`,
        reviewNote,
      };
  }
}

function buildZhCopy(
  context: ReturnType<typeof buildContext>,
  target: ReferralPackTarget,
): ReferralPackTargetCopy {
  const { profile, services, areas, languages, bestFit, intake, responseTime } =
    context;
  const common = [
    `${profile.name} 可用于介绍以下服务：${services}`,
    areas ? `服务范围：${areas}。` : "",
    languages ? `语言：${languages}。` : "",
    bestFit ? `较适合的咨询：${bestFit}。` : "",
    intake ? `建议联系路径：${intake}。` : "",
    responseTime ? `预计回应：${responseTime}。` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const reviewNote =
    "发送前请由服务商自行复核。此文案仅用于一般商业资料和运营支持。";

  switch (target) {
    case "support_coordinator":
      return {
        target,
        title: "发给支持协调员",
        description: "突出服务适配、地区、接收方式和回应时间。",
        body: `${common}\n\n如果服务目标和地区看起来匹配，可以把这段作为温和介绍使用。`,
        reviewNote,
      };
    case "case_manager":
      return {
        target,
        title: "发给个案经理",
        description: "说明转介适配、联系路径和介绍前需要准备的信息。",
        body: `${common}\n\n介绍前可补充服务目标、合适联系时间、语言需求和已获得同意的状态。`,
        reviewNote,
      };
    case "provider_partner":
      return {
        target,
        title: "发给其他服务商",
        description: "用于服务商之间交接背景和协作边界。",
        body: `${common}\n\n如由其他服务商介绍，可补充支持需求、所在地区、偏好语言，以及本人同意分享的交接备注。`,
        reviewNote,
      };
    case "community_group":
      return {
        target,
        title: "发给社区群组",
        description: "适合社区群、微信群或即时消息转发的简短版本。",
        body: `可以了解一下 ${profile.name}。\n服务内容：${services}\n服务范围：${areas || "请确认"}\n可沟通语言：${languages || "请确认"}\n联系路径：${intake || "请确认"}\n\n转发前请先复核资料；如有需要，请由本人或家属直接联系服务商确认是否适合。`,
        reviewNote,
      };
    case "family_contact":
      return {
        target,
        title: "发给家庭联系人",
        description: "用更容易理解的语言说明服务内容和下一步。",
        body: `${profile.name} 可能可以协助：${services}\n服务区域：${areas || "资料中列出的地区"}。\n可沟通语言：${languages || "资料中列出的语言"}。\n\n下一步可以通过 ${intake || "资料中列出的联系路径"} 联系服务商，先确认当前需要、所在地区和时间安排是否适合。`,
        reviewNote,
      };
  }
}

function joinList(values: string[], locale: Locale) {
  const visibleValues = values.map((value) => value.trim()).filter(Boolean);

  return visibleValues.join(locale === "zh-Hans" ? "、" : ", ");
}

function buildContext(profile: ReferralProfile, locale: Locale) {
  return {
    profile,
    services: profile.summary,
    areas: joinList(profile.serviceAreas, locale),
    languages: joinList(profile.languages, locale),
    bestFit: joinList(profile.bestFit, locale),
    intake:
      profile.receive?.intakeMethod ??
      profile.send?.handoverRequirements?.join(
        locale === "zh-Hans" ? "、" : ", ",
      ) ??
      "",
    responseTime: profile.receive?.responseTime ?? "",
    capacity: profile.receive?.capacityStatus ?? "",
  };
}
