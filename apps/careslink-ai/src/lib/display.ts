import type { FundingType, ProviderStatus, ReferralStatus } from "./types";

const serviceLabels: Record<string, string> = {
  "Support Coordination": "支持协调",
  "Personal Care": "个人护理",
  Physiotherapy: "物理治疗",
  "Occupational Therapy": "职业治疗",
  "Domestic Assistance": "居家清洁与家务协助",
  Transport: "社区交通",
  "Plan Management": "NDIS 计划管理",
};

const areaLabels: Record<string, string> = {
  Sydney: "悉尼",
  Parramatta: "帕拉马塔",
  Chatswood: "车士活",
  Hurstville: "好市围",
  Bankstown: "班克斯镇",
  Blacktown: "黑镇",
  Penrith: "彭里斯",
  Brisbane: "布里斯班",
  Melbourne: "墨尔本",
  Geelong: "吉朗",
};

const languageLabels: Record<string, string> = {
  English: "英语",
  Mandarin: "普通话",
  Cantonese: "粤语",
  Arabic: "阿拉伯语",
  Hindi: "印地语",
  Punjabi: "旁遮普语",
  Vietnamese: "越南语",
};

export const displayProviderStatus = (status: ProviderStatus) =>
  ({
    approved: "已审核",
    pending: "待审核",
    rejected: "已拒绝",
  })[status];

export const displayReferralStatus = (status: ReferralStatus) =>
  ({
    New: "新需求",
    "Pending Match": "待匹配",
    Matched: "已匹配",
    Contacted: "已联系",
    Accepted: "已接受",
    Completed: "已完成",
    "Unable to Serve": "无法服务",
    Closed: "已关闭",
  })[status];

export const displayFundingType = (fundingType: FundingType) =>
  ({
    NDIS: "NDIS",
    "Aged Care": "养老护理",
    Private: "自费",
    Mixed: "混合资金",
  })[fundingType];

export const displayService = (service: string) => serviceLabels[service] ?? service;

export const displayArea = (area: string) => areaLabels[area] ?? area;

export const displayLanguage = (language: string) =>
  languageLabels[language] ?? language;

export const displayFrequency = (frequency: string) =>
  ({
    Weekly: "每周",
    Fortnightly: "每两周",
    Assessment: "评估",
  })[frequency] ?? frequency;

export const displayList = (
  values: string[],
  mapper: (value: string) => string = (value) => value,
) => values.map(mapper).join("、");

export const displayInsuranceStatus = (status: "missing" | "uploaded" | "verified") =>
  ({
    missing: "未上传",
    uploaded: "已上传",
    verified: "已验证",
  })[status];

export const displaySourceType = (type: string) =>
  ({
    "WeChat Group": "微信群",
    "Invite Link": "邀请链接",
    "Share Card": "分享卡片",
    "Manual Entry": "手动录入",
  })[type] ?? type;
