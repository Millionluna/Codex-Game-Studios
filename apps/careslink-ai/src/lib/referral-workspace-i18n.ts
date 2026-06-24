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
  readonly components: {
    readonly basicProfile: {
      readonly serviceArea: string;
      readonly languages: string;
    };
    readonly healthScore: {
      readonly heading: string;
    };
    readonly healthSignals: {
      readonly heading: string;
      readonly description: string;
      readonly columns: {
        readonly signal: string;
        readonly detail: string;
        readonly points: string;
        readonly status: string;
      };
      readonly statusLabels: {
        readonly good: string;
        readonly warning: string;
        readonly high: string;
      };
    };
    readonly topIssues: {
      readonly heading: string;
      readonly description: string;
      readonly countLabel: {
        readonly one: string;
        readonly other: string;
      };
      readonly priorityLabels: {
        readonly high: string;
        readonly warning: string;
      };
      readonly emptyTitle: string;
      readonly emptyDetail: string;
    };
    readonly materialsGrid: {
      readonly heading: string;
      readonly description: string;
      readonly guidedAvailable: string;
      readonly readyMessage: string;
      readonly noMaterialsTitle: string;
      readonly noMaterialsDetail: string;
      readonly directionLabels: {
        readonly receive: string;
        readonly send: string;
      };
      readonly lockedStatusLabels: {
        readonly quotaUsed: string;
        readonly waitlist: string;
        readonly accessRequired: string;
      };
      readonly lockedMessages: {
        readonly quotaUsed: string;
        readonly waitlist: string;
        readonly accessRequired: string;
      };
    };
    readonly agentQueue: {
      readonly heading: string;
      readonly description: string;
      readonly readyLabel: string;
      readonly lockedBadgeLabels: {
        readonly quotaUsed: string;
        readonly queued: string;
        readonly accessCode: string;
      };
    };
    readonly accessStatus: {
      readonly heading: string;
      readonly states: {
        readonly active: {
          readonly label: string;
          readonly detail: string;
        };
        readonly quotaUsed: {
          readonly label: string;
          readonly detail: string;
        };
        readonly waitlist: {
          readonly label: string;
          readonly detail: string;
        };
        readonly free: {
          readonly label: string;
          readonly detail: string;
        };
      };
      readonly accessCodeLabel: string;
      readonly present: string;
      readonly notPresent: string;
      readonly usedToday: string;
      readonly remaining: string;
      readonly dailyGuidedQuota: string;
    };
    readonly copilot: {
      readonly heading: string;
      readonly description: string;
      readonly profileContextLabel: string;
      readonly readinessContextLabel: string;
      readonly guidedStepLabel: string;
      readonly previewStepLabel: string;
      readonly accessBoundaryLabel: string;
      readonly noProfileContext: string;
      readonly readinessScore: string;
      readonly noQueueItem: string;
      readonly draftingPromptReady: string;
      readonly boundaryMessages: {
        readonly quotaUsed: string;
        readonly waitlist: string;
        readonly accessRequired: string;
      };
    };
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
        "Based on self-submitted profile information. CaresLink does not assess provider quality, clinical suitability, compliance status, or service outcomes, and does not provide legal, clinical, medical, compliance, financial, or other professional advice.",
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
    components: {
      basicProfile: {
        serviceArea: "Service area",
        languages: "Languages",
      },
      healthScore: {
        heading: "Referral communication score",
      },
      healthSignals: {
        heading: "Readiness signals",
        description:
          "Field-level signals for referral communication completeness.",
        columns: {
          signal: "Signal",
          detail: "Detail",
          points: "Points",
          status: "Status",
        },
        statusLabels: {
          good: "Complete",
          warning: "Needs detail",
          high: "Missing",
        },
      },
      topIssues: {
        heading: "Top issues",
        description:
          "Prioritized gaps in the referral communication profile.",
        countLabel: {
          one: "1 item",
          other: "{count} items",
        },
        priorityLabels: {
          high: "High priority",
          warning: "Needs detail",
        },
        emptyTitle: "No priority issues",
        emptyDetail:
          "This audit did not find priority communication gaps in the current profile.",
      },
      materialsGrid: {
        heading: "Guided materials",
        description:
          "Preview text remains visible when guided drafting is locked.",
        guidedAvailable: "Guided drafting available",
        readyMessage:
          "Ready for guided drafting from submitted profile details.",
        noMaterialsTitle: "No materials configured",
        noMaterialsDetail:
          "Materials appear here when a receive or send direction is available for the profile.",
        directionLabels: {
          receive: "Receive",
          send: "Send",
        },
        lockedStatusLabels: {
          quotaUsed: "Quota used today",
          waitlist: "Access request queued",
          accessRequired: "Access code required",
        },
        lockedMessages: {
          quotaUsed: "Daily guided quota used. Preview remains visible.",
          waitlist:
            "Access request queued. Preview remains visible while the request is pending.",
          accessRequired: "Access code required for guided materials.",
        },
      },
      agentQueue: {
        heading: "Agent queue",
        description:
          "Guided steps are based on submitted profile fields and access state.",
        readyLabel: "Ready",
        lockedBadgeLabels: {
          quotaUsed: "Quota used",
          queued: "Queued",
          accessCode: "Access code",
        },
      },
      accessStatus: {
        heading: "Access status",
        states: {
          active: {
            label: "Access code active",
            detail:
              "Guided materials are available while daily quota remains.",
          },
          quotaUsed: {
            label: "Quota used today",
            detail:
              "Preview materials remain visible. Guided drafting unlocks again with available quota.",
          },
          waitlist: {
            label: "Access request queued",
            detail:
              "Preview materials remain visible until an access code is active.",
          },
          free: {
            label: "Free preview",
            detail:
              "Preview materials are visible. Guided drafting requires an access code.",
          },
        },
        accessCodeLabel: "Access code",
        present: "Present",
        notPresent: "Not present",
        usedToday: "Used today",
        remaining: "Remaining",
        dailyGuidedQuota: "Daily guided quota",
      },
      copilot: {
        heading: "Guided copilot",
        description: "Right-side workspace for profile drafting prompts.",
        profileContextLabel: "Profile context",
        readinessContextLabel: "Readiness context",
        guidedStepLabel: "Guided step",
        previewStepLabel: "Preview step",
        accessBoundaryLabel: "Access boundary",
        noProfileContext: "Select a profile to show submitted referral context.",
        readinessScore: "Current score is {score} out of 100.",
        noQueueItem:
          "Queue items appear here when a guided workflow is configured.",
        draftingPromptReady: "Drafting prompt ready",
        boundaryMessages: {
          quotaUsed:
            "Daily guided quota used. Preview materials remain visible.",
          waitlist:
            "Access request queued. Preview materials remain visible while the request is pending.",
          accessRequired:
            "Access code required before guided drafting is available. Preview materials remain visible.",
        },
      },
    },
  },
  "zh-Hans": {
    common: {
      previewOnly: "仅预览模式",
      selfSubmitted: "基于自行提交的资料信息",
      continueToReadiness: "继续查看准备度",
      trustBoundary:
        "资料信息基于自行提交的资料信息。CaresLink 不评估服务商质量、临床适用性、合规状态或服务结果，也不提供法律、临床、医疗、合规、财务或其他专业建议。",
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
    components: {
      basicProfile: {
        serviceArea: "服务范围",
        languages: "语言",
      },
      healthScore: {
        heading: "转介沟通分数",
      },
      healthSignals: {
        heading: "准备度信号",
        description: "字段级信号用于查看转介沟通资料的完整度。",
        columns: {
          signal: "信号",
          detail: "详情",
          points: "分数",
          status: "状态",
        },
        statusLabels: {
          good: "完整",
          warning: "需要补充",
          high: "缺失",
        },
      },
      topIssues: {
        heading: "重点问题",
        description: "转介沟通资料中的优先缺口。",
        countLabel: {
          one: "{count} 项",
          other: "{count} 项",
        },
        priorityLabels: {
          high: "高优先级",
          warning: "需要补充",
        },
        emptyTitle: "暂无重点问题",
        emptyDetail: "当前资料审核未发现重点沟通缺口。",
      },
      materialsGrid: {
        heading: "引导式材料",
        description: "引导式起草锁定时，预览文字仍可查看。",
        guidedAvailable: "可使用引导式起草",
        readyMessage: "可根据已提交的资料详情进行引导式起草。",
        noMaterialsTitle: "未配置材料",
        noMaterialsDetail:
          "当资料包含接收或发送方向时，材料会显示在这里。",
        directionLabels: {
          receive: "接收",
          send: "发送",
        },
        lockedStatusLabels: {
          quotaUsed: "今日配额已用完",
          waitlist: "访问申请排队中",
          accessRequired: "需要访问码",
        },
        lockedMessages: {
          quotaUsed: "今日引导式配额已用完。预览仍可查看。",
          waitlist: "访问申请排队中。申请待处理期间预览仍可查看。",
          accessRequired: "需要访问码才能使用引导式材料。",
        },
      },
      agentQueue: {
        heading: "智能队列",
        description: "引导步骤基于已提交的资料字段和访问状态。",
        readyLabel: "就绪",
        lockedBadgeLabels: {
          quotaUsed: "配额已用完",
          queued: "排队中",
          accessCode: "访问码",
        },
      },
      accessStatus: {
        heading: "访问状态",
        states: {
          active: {
            label: "访问码已启用",
            detail: "每日配额仍可用时，引导式材料可用。",
          },
          quotaUsed: {
            label: "今日配额已用完",
            detail:
              "预览材料仍可查看。配额可用后将再次解锁引导式起草。",
          },
          waitlist: {
            label: "访问申请排队中",
            detail: "访问码启用前，预览材料仍可查看。",
          },
          free: {
            label: "免费预览",
            detail: "预览材料可查看。引导式起草需要访问码。",
          },
        },
        accessCodeLabel: "访问码",
        present: "已提供",
        notPresent: "未提供",
        usedToday: "今日已用",
        remaining: "剩余",
        dailyGuidedQuota: "每日引导配额",
      },
      copilot: {
        heading: "引导式助手",
        description: "用于资料起草提示的右侧工作区。",
        profileContextLabel: "资料上下文",
        readinessContextLabel: "准备度上下文",
        guidedStepLabel: "引导步骤",
        previewStepLabel: "预览步骤",
        accessBoundaryLabel: "访问边界",
        noProfileContext: "选择资料后会显示已提交的转介上下文。",
        readinessScore: "当前分数为 {score}/100。",
        noQueueItem: "配置引导流程后，队列项会显示在这里。",
        draftingPromptReady: "起草提示已就绪",
        boundaryMessages: {
          quotaUsed: "今日引导式配额已用完。预览材料仍可查看。",
          waitlist:
            "访问申请排队中。申请待处理期间预览材料仍可查看。",
          accessRequired:
            "需要访问码才能使用引导式起草。预览材料仍可查看。",
        },
      },
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
