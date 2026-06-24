export const SUPPORTED_LOCALES = ["en", "zh-Hans"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

const LOCALE_QUERY_PARAM = "lang";

type ReferralWorkspaceSearchParams =
  | {
      readonly [key: string]: string | readonly string[] | undefined;
    }
  | Pick<URLSearchParams, "get">
  | undefined;

export type ReferralWorkspaceCopy = {
  readonly common: {
    readonly previewOnly: string;
    readonly selfSubmitted: string;
    readonly continueToReadiness: string;
    readonly trustBoundary: string;
    readonly nonLiveActions: string;
  };
  readonly shell: {
    readonly brand: string;
    readonly subtitle: string;
    readonly language: string;
    readonly pilotPreview: string;
    readonly pilotBoundary: string;
    readonly primaryNav: {
      readonly workspace: string;
      readonly profile: string;
      readonly health: string;
      readonly materials: string;
      readonly accessCode: string;
      readonly accessRequests: string;
    };
    readonly legacyNav: {
      readonly groupHeading: string;
      readonly demoHub: string;
      readonly assessment: string;
      readonly dashboard: string;
      readonly referrals: string;
      readonly providers: string;
      readonly referralSourcePortal: string;
      readonly providerPortal: string;
    };
  };
  readonly workspace: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly requestAccess: string;
    readonly accessRequests: string;
    readonly routeBlockTitle: string;
    readonly routeBlockDescription: string;
  };
  readonly profile: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly identitySection: string;
    readonly footprintSection: string;
    readonly receiveSection: string;
    readonly sendSection: string;
    readonly roleMatrixTitle: string;
    readonly noPersistence: string;
  };
  readonly health: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly scoreMeaningTitle: string;
    readonly scoreMeaning: string;
  };
  readonly materials: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly freeMode: string;
    readonly accessMode: string;
    readonly noAiCall: string;
  };
  readonly access: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly disabledSubmit: string;
    readonly costControlTitle: string;
    readonly costControl: string;
  };
  readonly admin: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly boundary: string;
  };
};

const localeLabels: Record<Locale, string> = {
  en: "English",
  "zh-Hans": "简体中文",
};

const referralWorkspaceCopy: Record<Locale, ReferralWorkspaceCopy> = {
  en: {
    common: {
      previewOnly: "Preview mode only",
      selfSubmitted: "Based on self-submitted profile information",
      continueToReadiness: "Continue to readiness review",
      trustBoundary:
        "CaresLink does not assess provider quality, clinical suitability, compliance status, or service outcomes, and does not provide legal, clinical, medical, compliance, financial, or other professional advice.",
      nonLiveActions:
        "Pilot actions are non-live previews. No referral, endorsement, compliance review, or professional recommendation is created.",
    },
    shell: {
      brand: "CaresLink",
      subtitle: "Referral Profile Workspace",
      language: "Language",
      pilotPreview: "Pilot preview",
      pilotBoundary:
        "Use this workspace to structure referral communication. CaresLink does not verify provider quality, clinical suitability, compliance status, or outcomes.",
      primaryNav: {
        workspace: "Workspace",
        profile: "Profile",
        health: "Readiness",
        materials: "Materials",
        accessCode: "Access code",
        accessRequests: "Access requests",
      },
      legacyNav: {
        groupHeading: "Legacy demos",
        demoHub: "Legacy demo hub",
        assessment: "Legacy assessment",
        dashboard: "Dashboard",
        referrals: "Referrals",
        providers: "Providers",
        referralSourcePortal: "Referral source portal",
        providerPortal: "Provider portal",
      },
    },
    workspace: {
      eyebrow: "Referral workspace",
      title: "Build a clear referral profile",
      description:
        "Review self-submitted profile fields, readiness signals, gated materials, and access status in one pilot workspace.",
      requestAccess: "Request access",
      accessRequests: "Access requests",
      routeBlockTitle: "Workspace route unavailable",
      routeBlockDescription:
        "This pilot route is intentionally limited while the referral profile workflow is being prepared.",
    },
    profile: {
      eyebrow: "Profile basics",
      title: "Referral profile",
      description:
        "Organise identity, service footprint, receiving details, and sending details without implying approval or endorsement.",
      identitySection: "Identity",
      footprintSection: "Service footprint",
      receiveSection: "Receive referrals",
      sendSection: "Send referrals",
      roleMatrixTitle: "Referral role matrix",
      noPersistence:
        "Changes shown here are preview-only and are not persisted to a live provider record.",
    },
    health: {
      eyebrow: "Readiness health",
      title: "Profile readiness",
      description:
        "Check whether the submitted profile is clear enough for referral conversations, without scoring quality, suitability, or compliance.",
      scoreMeaningTitle: "What the score means",
      scoreMeaning:
        "The score reflects communication completeness and clarity only. It is not a provider quality assessment, clinical assessment, compliance assessment, or outcome prediction.",
    },
    materials: {
      eyebrow: "Referral materials",
      title: "Guided materials",
      description:
        "Preview profile summaries, referral messages, handover prompts, and share-card copy generated from submitted fields.",
      freeMode:
        "Free mode shows structure and locked previews without calling AI drafting actions.",
      accessMode:
        "Access code mode unlocks guided drafting within quota and pilot limits.",
      noAiCall:
        "No AI call is made in preview-only mode, and no live referral action is sent.",
    },
    access: {
      eyebrow: "Access controls",
      title: "Pilot access",
      description:
        "Access codes gate guided materials and daily quota during the pilot.",
      disabledSubmit:
        "Submission is disabled in this preview. Requests can be reviewed by pilot admins only.",
      costControlTitle: "Cost control",
      costControl:
        "Access gating keeps AI-assisted drafting behind explicit pilot approval and daily usage limits.",
    },
    admin: {
      eyebrow: "Pilot admin",
      title: "Access request review",
      description:
        "Review queued access requests, code types, and profile context for the pilot workspace.",
      boundary:
        "Admin review manages pilot access only. CaresLink does not assess provider quality, clinical suitability, compliance status, or service outcomes, and does not provide professional advice.",
    },
  },
  "zh-Hans": {
    common: {
      previewOnly: "仅预览模式",
      selfSubmitted: "基于自行提交的资料信息",
      continueToReadiness: "继续查看准备度",
      trustBoundary:
        "CaresLink 不评估服务商质量、临床适用性、合规状态或服务结果，也不提供法律、临床、医疗、合规、财务或其他专业建议。",
      nonLiveActions:
        "试点操作仅为非实时预览，不会创建转介、背书、合规审查或专业建议。",
    },
    shell: {
      brand: "CaresLink",
      subtitle: "转介资料工作区",
      language: "语言",
      pilotPreview: "试点预览",
      pilotBoundary:
        "此工作区用于整理转介沟通。CaresLink 不核验服务商质量、临床适用性、合规状态或服务结果。",
      primaryNav: {
        workspace: "工作区",
        profile: "资料",
        health: "准备度",
        materials: "材料",
        accessCode: "访问码",
        accessRequests: "访问申请",
      },
      legacyNav: {
        groupHeading: "旧版演示",
        demoHub: "旧版演示中心",
        assessment: "旧版评估",
        dashboard: "仪表盘",
        referrals: "转介",
        providers: "服务商",
        referralSourcePortal: "转介来源门户",
        providerPortal: "服务商门户",
      },
    },
    workspace: {
      eyebrow: "转介工作区",
      title: "建立清晰的转介资料",
      description:
        "在一个试点工作区中查看自行提交的资料字段、准备度信号、受限材料和访问状态。",
      requestAccess: "申请访问权限",
      accessRequests: "访问申请",
      routeBlockTitle: "工作区路径暂不可用",
      routeBlockDescription:
        "在转介资料流程准备期间，此试点路径会保持受限。",
    },
    profile: {
      eyebrow: "资料基础",
      title: "转介资料",
      description:
        "整理身份、服务范围、接收转介信息和发送转介信息，同时避免暗示批准或背书。",
      identitySection: "身份",
      footprintSection: "服务范围",
      receiveSection: "接收转介",
      sendSection: "发送转介",
      roleMatrixTitle: "转介角色矩阵",
      noPersistence: "此处显示的更改仅供预览，不会保存到实时服务商记录。",
    },
    health: {
      eyebrow: "准备度健康",
      title: "资料准备度",
      description:
        "检查提交的资料是否足够清晰以支持转介沟通，但不评分质量、适用性或合规性。",
      scoreMeaningTitle: "分数含义",
      scoreMeaning:
        "该分数仅反映沟通完整度和清晰度，不是服务商质量评估、临床评估、合规评估或结果预测。",
    },
    materials: {
      eyebrow: "转介材料",
      title: "引导式材料",
      description:
        "预览基于提交字段生成的资料摘要、转介消息、交接提示和分享卡文案。",
      freeMode: "免费模式显示结构和锁定预览，不调用 AI 起草操作。",
      accessMode: "访问码模式会在配额和试点限制内解锁引导式起草。",
      noAiCall: "仅预览模式不会调用 AI，也不会发送实时转介操作。",
    },
    access: {
      eyebrow: "访问控制",
      title: "试点访问",
      description: "访问码在试点期间控制引导式材料和每日配额。",
      disabledSubmit: "此预览中提交功能已禁用，申请只能由试点管理员审核。",
      costControlTitle: "成本控制",
      costControl:
        "访问门槛会将 AI 辅助起草限制在明确的试点批准和每日使用限制之内。",
    },
    admin: {
      eyebrow: "试点管理",
      title: "访问申请审核",
      description: "查看试点工作区中的访问申请、代码类型和资料上下文。",
      boundary:
        "管理审核仅用于试点访问控制。CaresLink 不评估服务商质量、临床适用性、合规状态或服务结果，也不提供专业建议。",
    },
  },
};

export function isSupportedLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

export function getLocaleFromSearchParams(
  searchParams: ReferralWorkspaceSearchParams,
): Locale {
  const locale = getSearchParamValue(searchParams);

  return locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function getReferralWorkspaceCopy(
  locale: Locale,
): ReferralWorkspaceCopy {
  return referralWorkspaceCopy[locale];
}

export function getLocaleLabel(locale: Locale): string {
  return localeLabels[locale];
}

export function withLocale(href: string, locale: Locale): string {
  const [hrefWithoutHash, hash] = href.split("#", 2);
  const [pathname, query = ""] = hrefWithoutHash.split("?", 2);
  const queryParams = new URLSearchParams(query);

  queryParams.set(LOCALE_QUERY_PARAM, locale);

  const localizedHref = `${pathname}?${queryParams.toString()}`;

  return hash === undefined ? localizedHref : `${localizedHref}#${hash}`;
}

function getSearchParamValue(
  searchParams: ReferralWorkspaceSearchParams,
): string | undefined {
  if (!searchParams) {
    return undefined;
  }

  if ("get" in searchParams && typeof searchParams.get === "function") {
    return searchParams.get(LOCALE_QUERY_PARAM) ?? undefined;
  }

  const indexedParams = searchParams as {
    readonly [key: string]: string | readonly string[] | undefined;
  };
  const value = indexedParams[LOCALE_QUERY_PARAM];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}
