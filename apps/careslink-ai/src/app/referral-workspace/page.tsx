import {
  ArrowRight,
  CircleGauge,
  ClipboardList,
  FileText,
  KeyRound,
  PackageCheck,
  Send,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ReferralWorkspaceLoginGate } from "@/components/referral-workspace-auth-gate";
import {
  ReferralRoleChecklistPanel,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink } from "@/components/ui";
import {
  WorkspaceGrid,
  WorkspaceMainPanel,
  WorkspaceRightRail,
  WorkspaceSection,
  WorkspaceSignalRow,
  WorkspaceStatusPill,
} from "@/components/workspace-layout";
import {
  getHealthAudit,
  getReferralProfileForWorkspaceAccount,
  summarizeProfile,
  type ReferralProfile,
} from "@/lib/referral-profile-workspace";
import { mapPublicProviderDraftToProfile } from "@/lib/public-provider-profile-generator";
import {
  claimResolvedProviderDraftForOwner,
  getProviderDraftStore,
  resolveProviderDraft,
  resolveProviderDraftForOwner,
} from "@/lib/provider-draft-store";
import {
  withWorkspaceAccount,
  type WorkspaceAccessGate,
} from "@/lib/referral-workspace-auth";
import { getWorkspaceAccessGateWithServerSession } from "@/lib/referral-workspace-session";
import {
  getProviderGeneratorHandoffContext,
  withAuthHandoffParams,
  withProviderGeneratorHandoff,
} from "@/lib/referral-workspace-handoff";
import {
  getGeneratedMaterialDraftStore,
  type GeneratedMaterialDraftRecord,
} from "@/lib/generated-material-draft-store";
import {
  getGeneratedMaterialEventStore,
  type GeneratedMaterialEventRecord,
} from "@/lib/generated-material-event-store";
import {
  getOutreachStore,
  type OutreachRecord,
} from "@/lib/outreach-store";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";
import type { AiUsageFeature } from "@/lib/access-control-store";

const providerActions = [
  {
    key: "referralPack",
    href: "/referral-workspace/referral-pack",
    icon: PackageCheck,
  },
  {
    key: "outreach",
    href: "/referral-workspace/outreach",
    icon: Send,
  },
  {
    key: "profile",
    href: "/referral-workspace/profile",
    icon: UserRound,
  },
  {
    key: "health",
    href: "/referral-workspace/health",
    icon: CircleGauge,
  },
  {
    key: "access",
    href: "/referral-workspace/access",
    icon: KeyRound,
  },
  {
    key: "materials",
    href: "/referral-workspace/materials",
    icon: FileText,
  },
] as const;

function getCockpitCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      heroEyebrow: "已登录的服务商工作区",
      heroTitle: "Referral Pack 工作台",
      heroDescription:
        "准备可发送的转介资料包，记录发给了谁，并跟进下一步。",
      primaryAction: "准备 Referral Pack",
      secondaryAction: "记录跟进",
      workspaceTitle: "Referral Pack 工作台",
      shellTitle: "Referral Pack 工作台",
      shellProviderLabel: "服务商",
      shellScoreLabel: "资料包准备度",
      shellIssuesLabel: "转介阻碍",
      shellSavedLabel: "已保存材料",
      shellAccessLabel: "访问状态",
      shellActivityLabel: "最近动态",
      nextActionsEyebrow: "下一步",
      nextActionsTitle: "下一步转介动作",
      nextActionsDescription:
        "先准备资料包，再记录发送和跟进；资料缺口会作为转介阻碍提示。",
      profileReadiness: "资料包准备度",
      accessStatus: "访问状态",
      savedMaterials: "已保存材料",
      savedMaterialsDetail: "可以放进 Referral Pack 的可复核材料草稿。",
      latestActivity: "最近资料包动态",
      noActivity: "暂未记录复制、发送或复核动态。",
      actions: {
        profile: {
          label: "更新资料包来源",
          detail: "确认名称、服务范围、语言、接单能力和会进入资料包的转介说明。",
        },
        health: {
          label: "修正转介阻碍",
          detail: "查看哪些缺失信息可能让转介方不敢介绍你。",
        },
        access: {
          label: "确认工作区访问",
          detail: "提交访问申请，或确认访问码和每日配额是否可用。",
        },
        materials: {
          label: "创建资料包草稿",
          detail: "访问开通后，把资料整理成可放进 Referral Pack 的沟通草稿。",
        },
      },
      eventTypes: {
        copy_field: "已复制字段",
        copy_all: "已复制完整草稿",
        mark_reviewed: "已标记审核",
        archive: "已归档草稿",
      },
      reviewedDraft: "已审核材料草稿",
      access: {
        active: "访问已开通",
        waitlist: "请求排队中",
        free: "需要访问",
        activeDetail: (remaining: number) => `今日还可使用 ${remaining} 次引导式操作。`,
        waitlistDetail: "访问请求正在等待处理。",
        freeDetail: "开通工作区访问后可使用引导式材料起草。",
      },
      savedDraftCount: (count: number) => `${count} 个已保存草稿`,
      adminTitle: "管理工作台",
      adminDescription:
        "查看试点访问请求和材料使用 metadata，不评估服务商质量、结果、合规或临床适用性。",
    };
  }

  return {
    heroEyebrow: "Authenticated provider workspace",
    heroTitle: "Referral Pack workspace",
    heroDescription:
      "Prepare what to send, record who received it, and know what to follow up next.",
    primaryAction: "Prepare Referral Pack",
    secondaryAction: "Record outreach",
    workspaceTitle: "Referral Pack workspace",
    shellTitle: "Referral Pack workspace",
    shellProviderLabel: "Provider",
    shellScoreLabel: "Pack readiness",
    shellIssuesLabel: "Referral blockers",
    shellSavedLabel: "Saved materials",
    shellAccessLabel: "Access status",
    shellActivityLabel: "Latest activity",
    nextActionsEyebrow: "Next step",
    nextActionsTitle: "Next referral action",
    nextActionsDescription:
      "Prepare the pack first, record the first send, then use blockers to improve what referral partners see.",
    profileReadiness: "Pack readiness",
    accessStatus: "Access status",
    savedMaterials: "Saved materials",
    savedMaterialsDetail:
      "Reviewable drafts that can be included in the Referral Pack.",
    latestActivity: "Latest pack activity",
    noActivity: "No copy, send, or review activity recorded yet.",
    actions: {
      profile: {
        label: "Update pack source details",
        detail:
          "Confirm name, service areas, languages, intake capacity, and wording used by the pack.",
      },
      health: {
        label: "Fix referral blockers",
        detail:
          "Review missing details that may make referral partners hesitate before introducing you.",
      },
      access: {
        label: "Confirm workspace access",
        detail: "Submit a workspace request or confirm code and daily quota status.",
      },
      materials: {
        label: "Create pack drafts",
        detail:
          "When access is active, turn the profile into reviewable drafts for the Referral Pack.",
      },
    },
    eventTypes: {
      copy_field: "Copied field",
      copy_all: "Copied full draft",
      mark_reviewed: "Marked reviewed",
      archive: "Archived draft",
    },
    reviewedDraft: "Reviewed material draft",
    access: {
      active: "Access active",
      waitlist: "Request queued",
      free: "Access needed",
      activeDetail: (remaining: number) =>
        `${remaining} guided actions left today.`,
      waitlistDetail: "Workspace request is queued for review.",
      freeDetail: "Guided drafting is available after workspace access is active.",
    },
    savedDraftCount: (count: number) =>
      count === 1 ? "1 saved draft" : `${count} saved drafts`,
    adminTitle: "Admin cockpit",
    adminDescription:
      "Review pilot access and generated material metadata without assessing provider quality, outcomes, compliance, or clinical suitability.",
  };
}

const materialQueueFeatures: Array<{
  feature: AiUsageFeature;
  zhLabel: string;
  enLabel: string;
  zhDetail: string;
  enDetail: string;
}> = [
  {
    feature: "profile_rewrite",
    zhLabel: "资料改写",
    enLabel: "Profile rewrite",
    zhDetail: "把服务商资料整理成可复核的介绍文案。",
    enDetail: "Turn provider details into reviewable profile wording.",
  },
  {
    feature: "share_card",
    zhLabel: "分享卡片",
    enLabel: "Share card",
    zhDetail: "整理适合转介沟通的简短分享卡片。",
    enDetail: "Prepare a compact card for referral conversations.",
  },
  {
    feature: "referral_message",
    zhLabel: "转介沟通文案",
    enLabel: "Referral message",
    zhDetail: "起草给转介方复核后使用的沟通文案。",
    enDetail: "Draft referral wording for review before use.",
  },
  {
    feature: "bilingual_intro",
    zhLabel: "双语介绍",
    enLabel: "Bilingual intro",
    zhDetail: "准备英文和社区语言介绍草稿。",
    enDetail: "Prepare English and community-language intro drafts.",
  },
  {
    feature: "handover_checklist",
    zhLabel: "交接清单",
    enLabel: "Handover checklist",
    zhDetail: "整理转介交接前需要复核的信息清单。",
    enDetail: "List details to review before referral handover.",
  },
];

function getProviderWorkspaceCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      headerTitle: "Referral Pack 工作台",
      headerDescription: "准备可发送的转介资料包，记录发给了谁，并跟进下一步。",
      profileStatusTitle: "资料包来源",
      profileStatusDescription: "基于当前服务商资料和已认领草稿生成资料包。",
      referralReadinessTitle: "转介阻碍",
      referralReadinessDescription: "显示哪些缺口可能让转介方不敢介绍你。",
      nextStepsTitle: "下一步转介动作",
      nextStepsDescription: "先准备资料包，再记录发送和跟进；资料缺口会作为转介阻碍提示。",
      savedMaterialsTitle: "已保存材料",
      savedMaterialsDescription: "可以放进 Referral Pack 的可复核材料草稿。",
      referralLoopTitle: "Referral Pack 和跟进",
      referralLoopDescription:
        "把资料变成可发送的材料包，并记录已发送和待跟进状态。",
      workspaceAccessTitle: "工作区访问",
      workspaceAccessDescription: "显示访问状态和今日引导式材料配额。",
      materialQueueTitle: "AI 材料队列",
      materialQueueDescription: "仅显示当前已有的材料草稿能力。",
      recentActivityTitle: "最近动态",
      recentActivityDescription: "最近一次复制、复核或保存记录。",
      usageBoundaryTitle: "使用边界",
      providerLabel: "服务商",
      serviceAreaLabel: "服务范围",
      languageLabel: "语言",
      readinessScoreLabel: "资料包准备度",
      openIssueLabel: "转介阻碍",
      noIssueLabel: "暂无转介阻碍",
      savedDraftCount: (count: number) => `${count} 个已保存草稿`,
      noSavedMaterials: "还没有保存的材料草稿。",
      noActivity: "暂未记录复制或复核动态。",
      noOutreach: "还没有发送或跟进记录。",
      referralPackReady: "材料包可用",
      sentOutreach: "已发送",
      followUpDue: "待跟进",
      reviewNeeded: "待复核",
      highPriority: "优先处理",
      saved: "已保存",
      available: "可使用",
      accessNeeded: "需要访问",
      accessCodeAvailable: "访问码可用",
      accessCodeMissing: "尚未提供",
      quotaLabel: "今日剩余",
      accessCodeLabel: "访问码",
      actions: {
        profile: {
          label: "更新资料包来源",
          detail: "确认名称、服务范围、语言、接单能力和会进入资料包的转介说明。",
        },
        health: {
          label: "修正转介阻碍",
          detail: "查看哪些缺失信息可能让转介方不敢介绍你。",
        },
        access: {
          label: "确认工作区访问",
          detail: "确认访问状态、访问码和每日配额是否可用。",
        },
        materials: {
          label: "创建资料包草稿",
          detail: "把现有资料整理成可放进 Referral Pack 的沟通草稿。",
        },
        referralPack: {
          label: "准备 Referral Pack",
          detail: "把资料、已保存草稿和介绍文案整理成可发送的材料包。",
        },
        outreach: {
          label: "记录发送和跟进",
          detail:
            "记录发给了谁、什么渠道、是否回复和下次跟进时间。",
        },
      },
    };
  }

  return {
    headerTitle: "Referral Pack workspace",
    headerDescription:
      "Prepare what to send, record who received it, and know what to follow up next.",
    profileStatusTitle: "Pack source details",
    profileStatusDescription:
      "Based on the current provider profile and claimed draft.",
    referralReadinessTitle: "Referral blockers",
    referralReadinessDescription:
      "Shows gaps that may make referral partners hesitate before introducing you.",
    nextStepsTitle: "Next referral action",
    nextStepsDescription:
      "Prepare the pack, record the first send, and use blockers to improve what referral partners see.",
    savedMaterialsTitle: "Saved materials",
    savedMaterialsDescription:
      "Reviewable drafts that can be included in the Referral Pack.",
    referralLoopTitle: "Referral Pack and outreach",
    referralLoopDescription:
      "Turn the profile into sendable material and track who received it.",
    workspaceAccessTitle: "Workspace access",
    workspaceAccessDescription:
      "Shows access state and today's guided material quota.",
    materialQueueTitle: "AI material queue",
    materialQueueDescription: "Existing guided material capabilities only.",
    recentActivityTitle: "Latest pack activity",
    recentActivityDescription: "Latest copy, send, review, or save event.",
    usageBoundaryTitle: "Usage boundary",
    providerLabel: "Provider",
    serviceAreaLabel: "Service area",
    languageLabel: "Languages",
    readinessScoreLabel: "Pack readiness",
    openIssueLabel: "Referral blockers",
    noIssueLabel: "No referral blockers",
    savedDraftCount: (count: number) =>
      count === 1 ? "1 saved draft" : `${count} saved drafts`,
    noSavedMaterials: "No saved material drafts yet.",
    noActivity: "No copy, send, or review activity recorded yet.",
    noOutreach: "No send or follow-up records yet.",
    referralPackReady: "Pack ready",
    sentOutreach: "Sent",
    followUpDue: "Follow-up due",
    reviewNeeded: "Needs review",
    highPriority: "High priority",
    saved: "Saved",
    available: "Available",
    accessNeeded: "Access needed",
    accessCodeAvailable: "Code available",
    accessCodeMissing: "No code yet",
    quotaLabel: "Remaining today",
    accessCodeLabel: "Access code",
    actions: {
      profile: {
        label: "Update pack source details",
        detail:
          "Confirm provider name, service areas, languages, intake capacity, and referral wording used by the pack.",
      },
      health: {
        label: "Fix referral blockers",
        detail: "Review missing details that may make referral partners hesitate before introducing you.",
      },
      access: {
        label: "Confirm workspace access",
        detail: "Confirm access state, access code, and daily quota.",
      },
      materials: {
        label: "Create pack drafts",
        detail:
          "Turn current profile details into reviewable drafts for the Referral Pack.",
      },
      referralPack: {
        label: "Prepare Referral Pack",
        detail:
          "Collect profile details, saved drafts, and intro copy into a sendable pack.",
      },
      outreach: {
        label: "Record sends and follow-ups",
        detail:
          "Track who received the pack, channel, reply state, and next follow-up.",
      },
    },
  };
}

type ReferralWorkspaceSearchParams = {
  [key: string]: string | string[] | undefined;
};

type ReferralWorkspacePageProps = {
  searchParams?: Promise<ReferralWorkspaceSearchParams>;
};

type SignedInGate = Extract<WorkspaceAccessGate, { status: "signed_in" }>;

export default async function ReferralWorkspacePage({
  searchParams,
}: ReferralWorkspacePageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const gate = await getWorkspaceAccessGateWithServerSession(params);

  if (gate.status === "signed_out") {
    return (
      <ReferralWorkspaceLoginGate
        copy={copy}
        locale={locale}
        loginHref={withAuthHandoffParams("/auth/login", params)}
        registerHref={withAuthHandoffParams("/auth/register", params)}
      />
    );
  }

  if (gate.account.role === "admin") {
    return <AdminCockpit gate={gate} locale={locale} />;
  }

  return await ProviderCockpit({ gate, locale, params });
}

async function ProviderCockpit({
  gate,
  locale,
  params,
}: {
  gate: SignedInGate;
  locale: Locale;
  params: ReferralWorkspaceSearchParams | undefined;
}) {
  const copy = getReferralWorkspaceCopy(locale);
  const cockpitCopy = getCockpitCopy(locale);
  const workspaceCopy = getProviderWorkspaceCopy(locale);
  const handoff = getProviderGeneratorHandoffContext(params);
  const accountId = gate.account.id;
  const providerDraftStore = getProviderDraftStore();
  const draftId = handoff.draftId;
  const rawResolvedDraft = draftId
    ? await resolveProviderDraft({
        draftId,
        draftPayload: handoff.draftPayload,
        ownerUserId: accountId,
        store: providerDraftStore,
      })
    : await resolveProviderDraftForOwner({
        ownerUserId: accountId,
        store: providerDraftStore,
      });
  const resolvedDraft = await claimResolvedProviderDraftForOwner({
    ownerUserId: accountId,
    resolution: rawResolvedDraft,
    store: providerDraftStore,
  });
  const profile = getCockpitProfile(gate, resolvedDraft);
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const generatedMaterialDraftStore = getGeneratedMaterialDraftStore();
  const generatedMaterialEventStore = getGeneratedMaterialEventStore();
  const canReadSavedGeneratedMaterials =
    (generatedMaterialDraftStore.kind === "memory" &&
      generatedMaterialEventStore.kind === "memory") ||
    isSupabaseAuthUserId(accountId);
  const materialDrafts = canReadSavedGeneratedMaterials
    ? await generatedMaterialDraftStore.listGeneratedMaterialDraftsByUser({
        userId: accountId,
        providerDraftId: resolvedDraft?.record?.id,
        limit: 25,
      })
    : [];
  const materialEvents = canReadSavedGeneratedMaterials
    ? await generatedMaterialEventStore.listGeneratedMaterialEvents({
        userId: accountId,
        limit: 100,
      })
    : [];
  const canReadOutreach =
    getOutreachStore().kind === "memory" || isSupabaseAuthUserId(accountId);
  const outreachRecords = canReadOutreach
    ? await getOutreachStore().listOutreachByUser({
        userId: accountId,
        providerDraftId: resolvedDraft?.record?.id,
        limit: 100,
      })
    : [];
  const latestActivity = getLatestMaterialActivity(
    materialDrafts,
    materialEvents,
    locale,
  );
  const withHandoff = (href: string) =>
    withProviderGeneratorHandoff(href, handoff);
  const signedInHref = (href: string) =>
    withSignedInWorkspaceContext(gate, withLocale(withHandoff(href), locale));
  const workspaceAccountId = getDemoWorkspaceAccountId(gate);
  const accessLabel = getAccessStatusLabel(gate, cockpitCopy);
  const accessDetail = getAccessStatusDetail(gate, cockpitCopy);
  const primaryActionKey = getPrimaryProviderActionKey({
    audit,
    materialDrafts,
    outreachRecords,
  });
  const primaryAction = workspaceCopy.actions[primaryActionKey];
  const primaryActionHref =
    providerActions.find((action) => action.key === primaryActionKey)?.href ??
    "/referral-workspace/profile";
  const localizedIssues = audit.issues.map((issue) =>
    getLocalizedIssueCopy(issue, copy.components.topIssues),
  );

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withSignedInWorkspaceContext(
        gate,
        withHandoff("/referral-workspace"),
      )}
      workspaceAccountId={workspaceAccountId}
      workspaceRole={gate.account.role}
      workspaceSessionSource={gate.source}
    >
      <header className="mb-4 border-b border-[#ded6c8] pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal text-[#181715] sm:text-3xl">
              {workspaceCopy.headerTitle}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#40504b]">
              {workspaceCopy.headerDescription}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border border-[#dce8e2] bg-white px-4 py-3">
            <p className="text-xs font-semibold text-[#65736f]">
              {workspaceCopy.providerLabel}
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-[#17211f]">
              {summary.title}
            </p>
          </div>
        </div>
      </header>

      <WorkspaceGrid
        main={
          <WorkspaceMainPanel>
            <WorkspaceSection
              title={workspaceCopy.profileStatusTitle}
              description={workspaceCopy.profileStatusDescription}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <CockpitMetric
                  label={workspaceCopy.providerLabel}
                  value={summary.title}
                  detail={summary.description}
                />
                <CockpitMetric
                  label={workspaceCopy.serviceAreaLabel}
                  value={summary.serviceAreaLabel}
                  detail={summary.directionLabel}
                />
                <CockpitMetric
                  label={workspaceCopy.languageLabel}
                  value={summary.languageLabel}
                  detail={summary.entityLabel}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-[#65736f]">
                {copy.components.basicProfile.footer}
              </p>
            </WorkspaceSection>

            <ReferralRoleChecklistPanel summary={summary} locale={locale} />

            <WorkspaceSection
              title={workspaceCopy.referralReadinessTitle}
              description={workspaceCopy.referralReadinessDescription}
            >
              <WorkspaceSignalRow
                title={workspaceCopy.readinessScoreLabel}
                detail={audit.band}
                status={`${audit.score}/100`}
                tone={audit.score >= 75 ? "success" : "warning"}
              />
              <WorkspaceSignalRow
                title={workspaceCopy.openIssueLabel}
                detail={
                  localizedIssues[0]?.guidance ?? workspaceCopy.noIssueLabel
                }
                status={`${audit.issues.length}`}
                tone={audit.issues.length > 0 ? "warning" : "success"}
              />
              {audit.issues.slice(0, 3).map((issue, index) => (
                <WorkspaceSignalRow
                  key={issue.id}
                  title={localizedIssues[index]?.title ?? issue.title}
                  detail={localizedIssues[index]?.guidance ?? issue.guidance}
                  status={
                    issue.priority === "high"
                      ? workspaceCopy.highPriority
                      : workspaceCopy.reviewNeeded
                  }
                  tone="warning"
                />
              ))}
            </WorkspaceSection>

            <WorkspaceSection
              title={workspaceCopy.nextStepsTitle}
              description={workspaceCopy.nextStepsDescription}
              action={
                <ButtonLink href={signedInHref(primaryActionHref)}>
                  {primaryAction.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
              }
            >
              <ProviderActionRows
                actions={providerActions}
                copy={workspaceCopy}
                routeCopy={copy.workspace.routes}
                signedInHref={signedInHref}
              />
            </WorkspaceSection>

            <WorkspaceSection
              title={workspaceCopy.savedMaterialsTitle}
              description={workspaceCopy.savedMaterialsDescription}
              action={
                <WorkspaceStatusPill tone={materialDrafts.length ? "success" : "neutral"}>
                  {workspaceCopy.savedDraftCount(materialDrafts.length)}
                </WorkspaceStatusPill>
              }
            >
              <SavedMaterialRows
                drafts={materialDrafts}
                copy={workspaceCopy}
                locale={locale}
              />
            </WorkspaceSection>

            <WorkspaceSection
              title={workspaceCopy.referralLoopTitle}
              description={workspaceCopy.referralLoopDescription}
              action={
                <ButtonLink href={signedInHref("/referral-workspace/referral-pack")}>
                  {workspaceCopy.actions.referralPack.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
              }
            >
              <WorkspaceSignalRow
                title={workspaceCopy.referralPackReady}
                detail={
                  materialDrafts.length
                    ? workspaceCopy.savedDraftCount(materialDrafts.length)
                    : workspaceCopy.noSavedMaterials
                }
                status={materialDrafts.length + 1}
                tone="success"
              />
              <WorkspaceSignalRow
                title={workspaceCopy.sentOutreach}
                detail={
                  outreachRecords.find((record) => record.status === "sent")
                    ?.recipientName ?? workspaceCopy.noOutreach
                }
                status={
                  outreachRecords.filter((record) => record.status === "sent")
                    .length
                }
                tone={outreachRecords.length ? "success" : "neutral"}
              />
              <WorkspaceSignalRow
                title={workspaceCopy.followUpDue}
                detail={
                  outreachRecords.find((record) => record.status === "follow_up")
                    ?.recipientName ?? workspaceCopy.noOutreach
                }
                status={
                  outreachRecords.filter((record) => record.status === "follow_up")
                    .length
                }
                tone={
                  outreachRecords.some((record) => record.status === "follow_up")
                    ? "warning"
                    : "neutral"
                }
              />
            </WorkspaceSection>
          </WorkspaceMainPanel>
        }
        rightRail={
          <WorkspaceRightRail>
            <WorkspaceSection
              title={workspaceCopy.workspaceAccessTitle}
              description={workspaceCopy.workspaceAccessDescription}
            >
              <WorkspaceSignalRow
                title={accessLabel}
                detail={accessDetail}
                status={
                  gate.canUseGuidedMaterials
                    ? workspaceCopy.available
                    : workspaceCopy.accessNeeded
                }
                tone={gate.canUseGuidedMaterials ? "success" : "locked"}
              />
              <WorkspaceSignalRow
                title={workspaceCopy.accessCodeLabel}
                detail={gate.accessState.codeType ?? accessDetail}
                status={
                  gate.accessState.hasAccessCode
                    ? workspaceCopy.accessCodeAvailable
                    : workspaceCopy.accessCodeMissing
                }
                tone={gate.accessState.hasAccessCode ? "success" : "warning"}
              />
              <WorkspaceSignalRow
                title={workspaceCopy.quotaLabel}
                detail={`${gate.accessState.usedToday} / ${gate.accessState.dailyQuota}`}
                status={`${Math.max(
                  0,
                  gate.accessState.dailyQuota - gate.accessState.usedToday,
                )}`}
                tone={gate.canUseGuidedMaterials ? "success" : "warning"}
              />
            </WorkspaceSection>

            <WorkspaceSection
              title={workspaceCopy.materialQueueTitle}
              description={workspaceCopy.materialQueueDescription}
              action={
                <a
                  href={signedInHref("/referral-workspace/materials")}
                  className="text-sm font-semibold text-[#0f766e] hover:text-[#0b5f59]"
                >
                  {copy.workspace.routes.materials.label}
                </a>
              }
            >
              <MaterialQueueRows
                gate={gate}
                drafts={materialDrafts}
                copy={workspaceCopy}
                locale={locale}
              />
            </WorkspaceSection>

            <WorkspaceSection
              title={workspaceCopy.recentActivityTitle}
              description={workspaceCopy.recentActivityDescription}
            >
              <p className="text-sm leading-6 text-[#40504b]">
                {latestActivity?.detail ?? workspaceCopy.noActivity}
              </p>
            </WorkspaceSection>

            <WorkspaceSection title={workspaceCopy.usageBoundaryTitle}>
              <TrustBoundaryNotice className="border-0 bg-transparent p-0" locale={locale} />
            </WorkspaceSection>
          </WorkspaceRightRail>
        }
      />
    </AppShell>
  );
}

function AdminCockpit({
  gate,
  locale,
}: {
  gate: SignedInGate;
  locale: Locale;
}) {
  const copy = getReferralWorkspaceCopy(locale);
  const cockpitCopy = getCockpitCopy(locale);
  const signedInHref = (href: string) =>
    withSignedInWorkspaceContext(gate, withLocale(href, locale));

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withSignedInWorkspaceContext(
        gate,
        "/referral-workspace",
      )}
      workspaceAccountId={getDemoWorkspaceAccountId(gate)}
      workspaceRole={gate.account.role}
      workspaceSessionSource={gate.source}
    >
      <PageHeader
        eyebrow={copy.admin.eyebrow}
        title={cockpitCopy.adminTitle}
        description={cockpitCopy.adminDescription}
        actions={
          <>
            <ButtonLink href={signedInHref("/admin/access-requests")}>
              {copy.admin.title}
            </ButtonLink>
            <ButtonLink
              href={signedInHref("/admin/material-usage")}
              variant="secondary"
            >
              {copy.admin.materialUsage.title}
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2">
        <AdminActionCard
          href={signedInHref("/admin/access-requests")}
          icon={ClipboardList}
          title={copy.admin.title}
          description={copy.admin.description}
        />
        <AdminActionCard
          href={signedInHref("/admin/material-usage")}
          icon={FileText}
          title={copy.admin.materialUsage.title}
          description={copy.admin.materialUsage.description}
        />
      </section>

      <TrustBoundaryNotice className="mt-6" locale={locale} />
    </AppShell>
  );
}

function AdminActionCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof ClipboardList;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="rounded-lg border border-[#dce8e2] bg-white p-5 transition hover:border-[#9ed8c9] hover:bg-[#f8fbfa]"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
        <Icon className="size-5" aria-hidden="true" />
        {title}
      </div>
      <p className="mt-3 text-sm leading-6 text-[#40504b]">{description}</p>
    </a>
  );
}

function CockpitMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-h-24 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4">
      <p className="text-xs font-semibold text-[#65736f]">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold tabular-nums text-[#17211f]">
        {value}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#65736f]">
        {detail}
      </p>
    </div>
  );
}

function ProviderActionRows({
  actions,
  copy,
  routeCopy,
  signedInHref,
}: {
  actions: typeof providerActions;
  copy: ReturnType<typeof getProviderWorkspaceCopy>;
  routeCopy: ReturnType<typeof getReferralWorkspaceCopy>["workspace"]["routes"];
  signedInHref: (href: string) => string;
}) {
  return (
    <div className="divide-y divide-[#e3ddd2]">
      {actions.map((link) => {
        const actionCopy = copy.actions[link.key];
        const routeLabel = getProviderActionRouteLabel({
          key: link.key,
          routeCopy,
          actionLabel: actionCopy.label,
        });

        return (
          <a
            key={link.href}
            href={signedInHref(link.href)}
            className="flex gap-3 py-3 transition hover:bg-[#fbfaf7] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#9ed8c9]"
          >
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e6f7f2] text-[#0f766e]">
              <link.icon className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-[#17211f]">
                  {actionCopy.label}
                </p>
                <span className="text-xs font-semibold text-[#0f766e]">
                  {routeLabel}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-[#65736f]">
                {actionCopy.detail}
              </p>
            </div>
            <ArrowRight
              className="mt-2 size-4 shrink-0 text-[#65736f]"
              aria-hidden="true"
            />
          </a>
        );
      })}
    </div>
  );
}

function SavedMaterialRows({
  drafts,
  copy,
  locale,
}: {
  drafts: GeneratedMaterialDraftRecord[];
  copy: ReturnType<typeof getProviderWorkspaceCopy>;
  locale: Locale;
}) {
  if (drafts.length === 0) {
    return <p className="text-sm leading-6 text-[#65736f]">{copy.noSavedMaterials}</p>;
  }

  return (
    <div className="divide-y divide-[#e3ddd2]">
      {drafts.slice(0, 5).map((draft) => {
        const status = getDraftStatusDisplay(draft, copy);

        return (
          <WorkspaceSignalRow
            key={draft.id}
            title={getMaterialFeatureLabel(draft.feature, locale)}
            detail={formatActivityTimestamp(draft.updatedAt, locale)}
            status={status.label}
            tone={status.tone}
          />
        );
      })}
    </div>
  );
}

function MaterialQueueRows({
  gate,
  drafts,
  copy,
  locale,
}: {
  gate: SignedInGate;
  drafts: GeneratedMaterialDraftRecord[];
  copy: ReturnType<typeof getProviderWorkspaceCopy>;
  locale: Locale;
}) {
  const latestDraftByFeature = new Map<AiUsageFeature, GeneratedMaterialDraftRecord>();

  for (const draft of drafts) {
    latestDraftByFeature.set(draft.feature, latestDraftByFeature.get(draft.feature) ?? draft);
  }

  return (
    <div className="divide-y divide-[#e3ddd2]">
      {materialQueueFeatures.map((item) => {
        const draft = latestDraftByFeature.get(item.feature);
        const status = getMaterialQueueStatus({
          draft,
          canUseGuidedMaterials: gate.canUseGuidedMaterials,
          copy,
        });

        return (
          <WorkspaceSignalRow
            key={item.feature}
            title={locale === "zh-Hans" ? item.zhLabel : item.enLabel}
            detail={locale === "zh-Hans" ? item.zhDetail : item.enDetail}
            status={status.label}
            tone={status.tone}
          />
        );
      })}
    </div>
  );
}

function getMaterialQueueStatus({
  draft,
  canUseGuidedMaterials,
  copy,
}: {
  draft: GeneratedMaterialDraftRecord | undefined;
  canUseGuidedMaterials: boolean;
  copy: ReturnType<typeof getProviderWorkspaceCopy>;
}): { label: string; tone: "neutral" | "success" | "warning" | "locked" } {
  if (draft) {
    return getDraftStatusDisplay(draft, copy);
  }

  if (canUseGuidedMaterials) {
    return { label: copy.available, tone: "success" };
  }

  return { label: copy.accessNeeded, tone: "locked" };
}

function getDraftStatusDisplay(
  draft: GeneratedMaterialDraftRecord,
  copy: ReturnType<typeof getProviderWorkspaceCopy>,
): { label: string; tone: "neutral" | "success" | "warning" | "locked" } {
  if (draft.status === "draft") {
    return { label: copy.reviewNeeded, tone: "warning" };
  }

  return { label: copy.saved, tone: "success" };
}

function getMaterialFeatureLabel(feature: AiUsageFeature, locale: Locale) {
  const item = materialQueueFeatures.find((candidate) => candidate.feature === feature);

  if (!item) {
    return formatFeature(feature);
  }

  return locale === "zh-Hans" ? item.zhLabel : item.enLabel;
}

function getLocalizedIssueCopy(
  issue: ReturnType<typeof getHealthAudit>["issues"][number],
  copy: ReturnType<typeof getReferralWorkspaceCopy>["components"]["topIssues"],
) {
  const issueKey = issue.copyKey ?? issue.id;
  const issueCopy =
    copy.issues[issueKey as keyof typeof copy.issues];

  return (
    issueCopy ?? {
      label: issue.label,
      title: issue.title,
      guidance: issue.guidance,
    }
  );
}

function getPrimaryProviderActionKey({
  audit,
  materialDrafts,
  outreachRecords,
}: {
  audit: ReturnType<typeof getHealthAudit>;
  materialDrafts: GeneratedMaterialDraftRecord[];
  outreachRecords: OutreachRecord[];
}): (typeof providerActions)[number]["key"] {
  if (
    outreachRecords.some((record) => record.status === "follow_up")
  ) {
    return "outreach";
  }

  if (materialDrafts.length === 0 || outreachRecords.length === 0) {
    return "referralPack";
  }

  if (audit.issues.length > 0) {
    return "health";
  }

  return "outreach";
}

function getProviderActionRouteLabel({
  key,
  routeCopy,
  actionLabel,
}: {
  key: (typeof providerActions)[number]["key"];
  routeCopy: ReturnType<typeof getReferralWorkspaceCopy>["workspace"]["routes"];
  actionLabel: string;
}) {
  if (key === "profile" || key === "health" || key === "materials" || key === "access") {
    return routeCopy[key].label;
  }

  return actionLabel;
}

function getCockpitProfile(
  gate: SignedInGate,
  resolvedDraft:
    | Awaited<ReturnType<typeof resolveProviderDraft>>
    | Awaited<ReturnType<typeof resolveProviderDraftForOwner>>
    | undefined,
): ReferralProfile {
  if (resolvedDraft) {
    return mapPublicProviderDraftToProfile(resolvedDraft.draft, gate.account.id);
  }

  return getReferralProfileForWorkspaceAccount({
    ownerUserId: gate.account.id,
    name: gate.account.name,
  });
}

function getLatestMaterialActivity(
  drafts: GeneratedMaterialDraftRecord[],
  events: GeneratedMaterialEventRecord[],
  locale: Locale = "en",
) {
  const cockpitCopy = getCockpitCopy(locale);
  const currentDraftIds = new Set(drafts.map((draft) => draft.id));
  const latestEvent = events.find((event) =>
    currentDraftIds.has(event.generatedMaterialDraftId),
  );

  if (latestEvent) {
    return {
      detail: `${formatEventType(latestEvent, cockpitCopy)}${
        latestEvent.fieldKey
          ? `: ${formatFieldKey(latestEvent.fieldKey, locale)}`
          : ""
      } (${formatActivityTimestamp(latestEvent.createdAt, locale)})`,
    };
  }

  const latestReviewedDraft = drafts.find((draft) => draft.status === "reviewed");

  if (latestReviewedDraft) {
    return {
      detail: `${cockpitCopy.reviewedDraft}: ${getMaterialFeatureLabel(
        latestReviewedDraft.feature,
        locale,
      )} (${formatActivityTimestamp(latestReviewedDraft.updatedAt, locale)})`,
    };
  }

  return undefined;
}

function formatEventType(
  event: GeneratedMaterialEventRecord,
  copy: ReturnType<typeof getCockpitCopy>,
) {
  if (event.eventType === "copy_field") {
    return copy.eventTypes.copy_field;
  }

  if (event.eventType === "copy_all") {
    return copy.eventTypes.copy_all;
  }

  if (event.eventType === "mark_reviewed") {
    return copy.eventTypes.mark_reviewed;
  }

  return copy.eventTypes.archive;
}

function formatFieldKey(value: string, locale: Locale) {
  if (locale === "zh-Hans") {
    return zhGeneratedFieldLabels[value] ?? "字段";
  }

  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

const zhGeneratedFieldLabels: Record<string, string> = {
  checklistTitle: "清单标题",
  consentCheck: "同意确认",
  clientContext: "对象背景",
  supportNeed: "字段",
  handoverDetails: "交接详情",
  nextStep: "下一步",
  professionalEnglishDescription: "英文介绍",
  shortEnglishSummary: "英文摘要",
  chineseCommunityIntro: "中文社区介绍",
  referralPartnerSummary: "转介方摘要",
  profileImprovementNotes: "资料改进说明",
  headline: "标题",
  subheadline: "副标题",
  serviceArea: "服务范围",
  languages: "语言",
  referralFit: "适合转介",
  intakePath: "接收路径",
  subjectLine: "主题",
  opening: "开场",
  providerSummary: "服务商摘要",
  handoverRequest: "交接请求",
  englishIntro: "英文介绍",
  communityLanguageIntro: "社区语言介绍",
  sharingContext: "分享场景",
  disclaimer: "说明",
};

function formatFeature(value: GeneratedMaterialDraftRecord["feature"]) {
  return value.replace(/_/g, " ");
}

function formatActivityTimestamp(value: string, locale: Locale) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getAccessStatusLabel(
  gate: SignedInGate,
  copy: ReturnType<typeof getCockpitCopy>,
) {
  if (gate.canUseGuidedMaterials) {
    return copy.access.active;
  }

  if (gate.accessState.status === "waitlist") {
    return copy.access.waitlist;
  }

  return copy.access.free;
}

function getAccessStatusDetail(
  gate: SignedInGate,
  copy: ReturnType<typeof getCockpitCopy>,
) {
  if (gate.canUseGuidedMaterials) {
    return copy.access.activeDetail(
      Math.max(0, gate.accessState.dailyQuota - gate.accessState.usedToday),
    );
  }

  if (gate.accessState.status === "waitlist") {
    return copy.access.waitlistDetail;
  }

  return copy.access.freeDetail;
}

function withSignedInWorkspaceContext(gate: SignedInGate, href: string) {
  return gate.source === "demo"
    ? withWorkspaceAccount(href, gate.account.id)
    : href;
}

function getDemoWorkspaceAccountId(gate: SignedInGate) {
  return gate.source === "demo" ? gate.account.id : undefined;
}

function isSupabaseAuthUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
