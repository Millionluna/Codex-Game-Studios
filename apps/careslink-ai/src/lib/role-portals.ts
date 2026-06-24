export type RolePortalId =
  | "platform_admin"
  | "referral_source"
  | "referral_receiver";

export type RolePortalSurface = "web" | "app";

export type RolePortal = {
  id: RolePortalId;
  label: string;
  path: string;
  surfaces: RolePortalSurface[];
  canSendReferrals: boolean;
  canReceiveReferrals: boolean;
  primaryJobs: string[];
  accessBoundary: string;
};

const rolePortals: RolePortal[] = [
  {
    id: "platform_admin",
    label: "平台管理员",
    path: "/admin",
    surfaces: ["web"],
    canSendReferrals: false,
    canReceiveReferrals: false,
    primaryJobs: [
      "审核网络成员",
      "管理业务合伙人和来源渠道",
      "查看全局 referral pipeline",
      "维护平台治理和商业化数据",
    ],
    accessBoundary: "看全局数据和审核记录，不直接代表 provider 发单或接单。",
  },
  {
    id: "referral_source",
    label: "可发 referral 的 provider / 资源方",
    path: "/referral-source-portal",
    surfaces: ["web", "app"],
    canSendReferrals: true,
    canReceiveReferrals: false,
    primaryJobs: [
      "快速录入 referral",
      "查看自己来源的 referral 状态",
      "补充跟进备注",
      "把需求分享给业务合伙人匹配",
    ],
    accessBoundary: "只管理自己来源的需求，不查看服务商后台资料和全平台机会。",
  },
  {
    id: "referral_receiver",
    label: "可接 referral 的 provider / 个人",
    path: "/provider-portal",
    surfaces: ["web", "app"],
    canSendReferrals: false,
    canReceiveReferrals: true,
    primaryJobs: [
      "查看匹配给自己的机会",
      "确认可接单或拒绝",
      "维护服务区域、语言和容量",
      "生成服务商资料和分享卡片",
    ],
    accessBoundary: "只看匹配给自己或已分配给自己的 referral，不看来源方完整客户池。",
  },
];

export function getRolePortals() {
  return rolePortals;
}

export function getRolePortal(id: RolePortalId) {
  return rolePortals.find((portal) => portal.id === id);
}
