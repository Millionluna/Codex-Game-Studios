export type DemoEntrypoint = {
  id: string;
  title: string;
  audience: string;
  path: string;
  purpose: string;
  proofPoints: string[];
};

export type RevenueEngine = {
  id: string;
  label: string;
  buyer: string;
  offer: string;
  timing: string;
};

export type HushcareBridge = {
  sourceProduct: string;
  entryPoint: string;
  userMoment: string;
  privacyBoundary: string;
  conversionGoal: string;
};

const demoEntrypoints: DemoEntrypoint[] = [
  {
    id: "demo_hub",
    title: "项目核心构思与盈利逻辑",
    audience: "群主、投资人、合作方",
    path: "/demo",
    purpose: "用一张谈判桌视角讲清 Careslink AI 怎么把群资源变成 referral operating system。",
    proofPoints: ["Okana 式 setup + training", "三类角色门户", "HushCare 家庭端入口"],
  },
  {
    id: "platform_admin",
    title: "整个平台管理端",
    audience: "平台管理员 / 运营负责人",
    path: "/admin",
    purpose: "管理角色、渠道、审核、运营数据、商业化账本和 partner rollout。",
    proofPoints: ["全局 referral pipeline", "网络成员审核", "Partner enablement"],
  },
  {
    id: "referral_source",
    title: "可发 referral 的 provider 端",
    audience: "群主、support coordinator、agency、资源方",
    path: "/referral-source-portal",
    purpose: "让可信来源方快速发布 referral，并追踪自己来源的需求状态。",
    proofPoints: ["Web 工作台", "手机端快速录入", "来源归因"],
  },
  {
    id: "referral_receiver",
    title: "可接 referral 的 provider / 个人端",
    audience: "服务商、个人 practitioner、intake 团队",
    path: "/provider-portal",
    purpose: "让接单方查看匹配机会、维护容量、反馈接单状态和生成推广素材。",
    proofPoints: ["Web 接单工作台", "手机端快速回应", "AI profile / share card"],
  },
  {
    id: "hushcare_provider_finder",
    title: "终端用户找 provider 端",
    audience: "HushCare 家庭用户 / 华人家庭",
    path: "/hushcare-provider-finder",
    purpose: "从家庭安心小程序的 Care Hub 自然进入 provider discovery，并沉淀为 B2B referral lead。",
    proofPoints: ["不展示表现数据", "按 postcode / 语言 / 服务筛选", "家庭收藏讨论"],
  },
];

const revenueEngines: RevenueEngine[] = [
  {
    id: "setup",
    label: "Referral Ops Setup",
    buyer: "大群主 / agency / channel partner",
    offer: "4-6 周把微信群 provider、referral 模板、审核规则和报表系统化。",
    timing: "冷启动优先，用服务换深度合作和真实数据。",
  },
  {
    id: "subscription",
    label: "Partner / Agency Dashboard",
    buyer: "群主、渠道方、provider agency",
    offer: "多用户 pipeline、来源归因、weekly report、团队账号和导出。",
    timing: "一个群跑通后按月费或团队 licence 收费。",
  },
  {
    id: "provider_tools",
    label: "Provider Pro Tools",
    buyer: "接 referral 的 provider / 个人",
    offer: "AI profile、分享卡片、容量管理、接单提醒和表现摘要。",
    timing: "先带来真实 referral，再转 Pro 工具费。",
  },
  {
    id: "training",
    label: "Careslink Academy",
    buyer: "provider 团队、群主运营团队、referral source",
    offer: "如何发高质量 referral、如何写 profile、如何用 AI 做 intake 和跟进。",
    timing: "借鉴 Okana 的 training / LMS / team licence 结构。",
  },
  {
    id: "partner_share",
    label: "Channel Partner Share",
    buyer: "未来平台收入池",
    offer: "按来源渠道记录未来展示、Pro、CRM 或 referral ops 收入分成。",
    timing: "MVP 先记账，不急着直接收 referral fee。",
  },
];

const hushcareBridge: HushcareBridge = {
  sourceProduct: "HUSHCARE 安心小助手",
  entryPoint: "Care Hub / Provider Finder",
  userMoment:
    "家人看到安心手帐后，开始关心居家支持、中文服务、交通、个人护理或 NDIS / aged care 路径。",
  privacyBoundary:
    "不展示长者小游戏分数、错误、反应速度或能力评估，只用家庭主动表达的服务需求进入 provider 查找。",
  conversionGoal: "从家庭安心场景进入可信 provider discovery，再生成 B2B referral lead。",
};

export function getDemoEntrypoints() {
  return demoEntrypoints;
}

export function getRevenueEngines() {
  return revenueEngines;
}

export function getHushcareBridge() {
  return hushcareBridge;
}
