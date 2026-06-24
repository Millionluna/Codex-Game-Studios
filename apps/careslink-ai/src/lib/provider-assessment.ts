import { providers } from "./mock-data";

export type AssessmentFunnelStep = {
  id: string;
  label: string;
  description: string;
  owner: string;
};

export type ReadinessSection = {
  id: string;
  label: string;
  score: number;
  status: "Strong" | "Improve" | "Missing";
  evidence: string;
  recommendation: string;
};

export type ReadinessReport = {
  providerId: string;
  providerName: string;
  level: "Starter" | "Ready" | "Growth" | "Network Partner";
  overallScore: number;
  summary: string;
  disclaimer: string;
  sections: ReadinessSection[];
  topRecommendations: string[];
  nextActions: string[];
};

export type AssessmentPipeline = {
  partnerId: string;
  invited: number;
  completed: number;
  ready: number;
  growth: number;
  missingInsurance: number;
  priorityRegionGap: string;
};

export type ReadinessMapItem = {
  id: string;
  region: string;
  serviceType: string;
  strength: string;
  gap: string;
  nextMove: string;
};

export type ReadinessUpgradeOffer = {
  id: string;
  label: string;
  priceSignal: string;
  outcome: string;
};

const assessmentFunnel: AssessmentFunnelStep[] = [
  {
    id: "free_assessment",
    label: "免费 Referral Readiness Assessment",
    description: "用 20-30 分钟收集 provider 的服务、区域、语言、intake 和资料完整度。",
    owner: "Careslink AI + 业务合伙人",
  },
  {
    id: "readiness_report",
    label: "Referral Readiness Snapshot",
    description: "输出一页准备度报告，避免做质量认证，只给可执行的资料和接单改进建议。",
    owner: "AI 工具",
  },
  {
    id: "ai_profile_pack",
    label: "AI Profile / Share Card Pack",
    description: "生成中英文 profile、微信群文案、referral partner 推荐语和分享卡片。",
    owner: "Provider",
  },
  {
    id: "network_entry",
    label: "进入可信 Provider Network",
    description: "通过审核后进入可搜索、可匹配、可跟进的 provider network。",
    owner: "平台管理员 / 群主",
  },
  {
    id: "pro_or_agency_plan",
    label: "Provider Pro / Agency Plan",
    description: "当 provider 开始获得真实 referral，再转为工具费、training 或团队版 CRM。",
    owner: "商业化",
  },
];

const upgradeOffers: ReadinessUpgradeOffer[] = [
  {
    id: "ai_profile_pack",
    label: "AI 中英文 Profile Pack",
    priceSignal: "后续可做低价一次性包",
    outcome: "把 provider 的资料整理成可被 referral partner 推荐的双语页面。",
  },
  {
    id: "share_card_pack",
    label: "微信群分享卡片包",
    priceSignal: "按卡片或模板包收费",
    outcome: "生成适合微信群、WhatsApp 和小红书转发的专业卡片。",
  },
  {
    id: "academy_session",
    label: "Referral Readiness Academy",
    priceSignal: "培训 / team licence",
    outcome: "训练 intake、接单回应、资料更新和 referral partner 沟通。",
  },
  {
    id: "provider_pro",
    label: "Provider Pro / Agency CRM",
    priceSignal: "月费 / 团队版",
    outcome: "多人处理机会、容量管理、跟进模板和表现摘要。",
  },
];

const sourceReadinessMap: ReadinessMapItem[] = [
  {
    id: "map-hurstville-transport",
    region: "Hurstville / Bankstown",
    serviceType: "Aged care transport",
    strength: "有 allied health 和 support coordination 来源",
    gap: "中文 aged care transport 供给不足",
    nextMove: "优先邀请 5 个交通和陪诊 provider 完成 readiness assessment。",
  },
  {
    id: "map-parramatta-personal-care",
    region: "Parramatta / Blacktown",
    serviceType: "Personal care",
    strength: "已有多语言居家支持 provider",
    gap: "夜间和紧急接单容量不稳定",
    nextMove: "把 urgent capacity 和 response window 加进 provider profile。",
  },
  {
    id: "map-chatswood-ndis",
    region: "Chatswood / Sydney",
    serviceType: "NDIS support coordination",
    strength: "中文 support coordination 供给较强",
    gap: "新 provider 的 ABN / insurance 资料不完整",
    nextMove: "通过免费评估补齐资料并排序优先审核名单。",
  },
];

export function getAssessmentFunnel() {
  return assessmentFunnel;
}

export function getReadinessUpgradeOffers() {
  return upgradeOffers;
}

export function getAssessmentPipeline(partnerId: string): AssessmentPipeline {
  if (partnerId === "partner-chen") {
    return {
      partnerId,
      invited: 48,
      completed: 31,
      ready: 18,
      growth: 9,
      missingInsurance: 7,
      priorityRegionGap: "Hurstville / Bankstown",
    };
  }

  return {
    partnerId,
    invited: 12,
    completed: 5,
    ready: 2,
    growth: 2,
    missingInsurance: 3,
    priorityRegionGap: "To be mapped",
  };
}

export function getSourceReadinessMap(partnerId: string) {
  if (partnerId !== "partner-chen") {
    return sourceReadinessMap.slice(0, 1);
  }

  return sourceReadinessMap;
}

export function getReadinessReport(providerId: string): ReadinessReport {
  const provider = providers.find((item) => item.id === providerId);

  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  const sections: ReadinessSection[] = [
    {
      id: "profile_clarity",
      label: "Profile clarity",
      score: provider.intro && provider.qualifications ? 92 : 58,
      status: provider.intro && provider.qualifications ? "Strong" : "Improve",
      evidence: "服务介绍、资质说明、ABN 和联系方式已经能支持初步推荐。",
      recommendation: "把服务差异、典型 referral 场景和响应窗口写得更具体。",
    },
    {
      id: "service_coverage",
      label: "Service coverage clarity",
      score: provider.serviceAreas.length >= 3 ? 90 : 64,
      status: provider.serviceAreas.length >= 3 ? "Strong" : "Improve",
      evidence: `当前服务区域覆盖 ${provider.serviceAreas.join(", ")}。`,
      recommendation: "给每个区域补充可接单容量，避免群主推荐后才发现排不上。",
    },
    {
      id: "intake_response",
      label: "Intake response readiness",
      score: provider.acceptsNewClients && provider.contact.phone ? 88 : 55,
      status: provider.acceptsNewClients && provider.contact.phone ? "Strong" : "Improve",
      evidence: provider.acceptsNewClients
        ? "当前标记为接新客户，并有电话或邮箱入口。"
        : "当前没有明确接新客户状态。",
      recommendation: "补充平均响应时间、紧急 referral 处理方式和 intake 负责人。",
    },
    {
      id: "family_fit",
      label: "Chinese-speaking family fit",
      score: provider.chineseProvider || provider.languages.includes("Mandarin") ? 94 : 70,
      status: provider.chineseProvider || provider.languages.includes("Mandarin") ? "Strong" : "Improve",
      evidence: `语言能力包括 ${provider.languages.join(", ")}。`,
      recommendation: "补充家属沟通方式、微信联络边界和双语资料。",
    },
    {
      id: "share_card",
      label: "Share card readiness",
      score: provider.sourceShareCardId && provider.logoUrl ? 86 : 52,
      status: provider.sourceShareCardId && provider.logoUrl ? "Strong" : "Missing",
      evidence: "已有分享卡片来源字段和品牌视觉入口。",
      recommendation: "生成更短的微信群转发文案和 referral partner 推荐语。",
    },
    {
      id: "partner_confidence",
      label: "Referral partner confidence",
      score: provider.status === "approved" && provider.insuranceStatus === "verified" ? 91 : 61,
      status: provider.status === "approved" && provider.insuranceStatus === "verified" ? "Strong" : "Improve",
      evidence: "审核状态、保险状态和来源群已经可以支撑运营方判断。",
      recommendation: "避免写成认证背书，用 profile reviewed 和 readiness completed 表达。",
    },
  ];

  const overallScore = Math.round(
    sections.reduce((total, section) => total + section.score, 0) / sections.length,
  );

  return {
    providerId,
    providerName: provider.name,
    level: getLevel(overallScore),
    overallScore,
    summary:
      "这个 provider 已经适合进入 referral partner 的短名单，但还需要把 intake 响应、容量和双语分享素材进一步标准化。",
    disclaimer:
      "这不是认证、质量担保或临床/合规意见，只是用于 referral 运营的资料完整度和接单准备度评估。",
    sections,
    topRecommendations: [
      "补充紧急 referral 的响应窗口和联系人。",
      "把服务区域按 postcode / suburb 细化到可接单容量。",
      "生成更适合微信群转发的双语 provider profile。",
    ],
    nextActions: [
      "生成 AI 中英文 profile 和微信群分享卡片",
      "进入业务合伙人的 provider review queue",
      "设置本周可接 referral 容量",
    ],
  };
}

function getLevel(score: number): ReadinessReport["level"] {
  if (score >= 90) {
    return "Network Partner";
  }

  if (score >= 80) {
    return "Growth";
  }

  if (score >= 68) {
    return "Ready";
  }

  return "Starter";
}
