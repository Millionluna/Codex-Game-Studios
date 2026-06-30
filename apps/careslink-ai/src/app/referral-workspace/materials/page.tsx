import type { ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  FileText,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  GuidedProfileRewriteGenerator,
  type GuidedProfileRewriteDisabledReason,
} from "@/components/guided-profile-rewrite-generator";
import {
  GuidedShareCardGenerator,
  type GuidedShareCardDisabledReason,
} from "@/components/guided-share-card-generator";
import {
  GuidedReferralMessageGenerator,
  type GuidedReferralMessageDisabledReason,
} from "@/components/guided-referral-message-generator";
import {
  GuidedBilingualIntroGenerator,
  type GuidedBilingualIntroDisabledReason,
} from "@/components/guided-bilingual-intro-generator";
import {
  GuidedHandoverChecklistGenerator,
  type GuidedHandoverChecklistDisabledReason,
} from "@/components/guided-handover-checklist-generator";
import { GeneratedDraftCopyButton } from "@/components/generated-draft-copy-button";
import { ProviderDraftHandoffPersister } from "@/components/provider-draft-handoff-persister";
import {
  ReferralWorkspaceAdminGate,
  ReferralWorkspaceLoginGate,
} from "@/components/referral-workspace-auth-gate";
import {
  WorkspaceGrid,
  WorkspaceMainPanel,
  WorkspaceRightRail,
  WorkspaceSection,
  WorkspaceSignalRow,
  WorkspaceStatusPill,
} from "@/components/workspace-layout";
import {
  AccessStatusPanel,
  AgentQueuePanel,
  GuidedCopilotPanel,
  LockedMaterialsGrid,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink, Card } from "@/components/ui";
import {
  getAgentQueueForAccess,
  getHealthAudit,
  getLockedMaterials,
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
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";
import { updateGeneratedMaterialDraftStatusAction } from "./actions";

type MaterialsSearchParams = {
  [key: string]: string | string[] | undefined;
  access?: string | string[];
};

type ReferralMaterialsPageProps = {
  searchParams?: Promise<MaterialsSearchParams>;
};

type AccessState = WorkspaceAccessGate["accessState"];
type ProfileRewriteGeneratorCopy =
  ReferralWorkspaceCopy["materials"]["profileRewriteGenerator"];
type GeneratorCopyWithDisabledReasons = {
  disabledReasons: {
    verified_session_required: string;
  };
};

type ShareCardMaterial = {
  headline: string;
  subheadline: string;
  serviceArea: string;
  languages: string;
  referralFit: string;
  intakePath: string;
  disclaimer: string;
};

type GeneratedDraftHistoryItem = {
  id: string;
  feature:
    | "profile_rewrite"
    | "share_card"
    | "referral_message"
    | "bilingual_intro"
    | "handover_checklist";
  status: GeneratedMaterialDraftRecord["status"];
  featureLabel: string;
  title: string;
  description: string;
  fields: GeneratedDraftHistoryField[];
  copyText: string;
  statusLabel: string;
  createdAt: string;
};

type GeneratedDraftHistoryField = {
  key: string;
  label: string;
  value: string;
};

type GeneratedDraftHistoryActionContext = {
  locale: Locale;
  source?: string;
  draftId?: string;
};

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (formatted, [key, value]) =>
      formatted.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function getProfileRewriteGeneratorCopy(
  copy: ProfileRewriteGeneratorCopy,
  locale: Locale,
): ProfileRewriteGeneratorCopy {
  return {
    ...copy,
    title: locale === "zh-Hans" ? "创建资料包草稿" : "Create pack draft",
    description:
      locale === "zh-Hans"
        ? "将已保存的服务商资料整理成可放入 Referral Pack 的转介沟通草稿。"
        : "Turn the saved provider profile into reviewable Referral Pack communication drafts.",
  };
}

function getPreviewSafeGeneratorCopy<TCopy extends GeneratorCopyWithDisabledReasons>(
  copy: TCopy,
  locale: Locale,
): TCopy {
  if (locale !== "en") {
    return copy;
  }

  return {
    ...copy,
    disabledReasons: {
      ...copy.disabledReasons,
      verified_session_required:
        "Sign in with a provider account that has active workspace access. Preview mode can show the control for review, but cannot start live generation.",
    },
  };
}

function getMaterialsModeBoundaryCopy({
  hasDemoAccess,
  isDemoSession,
  locale,
}: {
  hasDemoAccess: boolean;
  isDemoSession: boolean;
  locale: Locale;
}) {
  if (!hasDemoAccess) {
    return locale === "zh-Hans"
      ? "请先申请工作区访问权限，才能生成引导式材料。免费、候补和预览模式只能查看流程状态，不能启动实时生成。"
      : "Request workspace access to generate guided materials. Free, waitlist, and preview sessions can view workflow states only and cannot start live generation.";
  }

  if (isDemoSession) {
    return locale === "zh-Hans"
      ? "预览模式可展示引导式控件供复核，但不能启动实时生成。"
      : "Preview mode can show guided controls for review, but cannot start live generation.";
  }

  return locale === "zh-Hans"
    ? "引导式生成使用已保存的服务商资料和每日配额。分享前请复核每一份草稿。"
    : "Guided generation uses the saved provider profile and daily quota. Review every draft before sharing.";
}

function getMaterialsWorkspaceCopy(locale: Locale) {
  return locale === "zh-Hans"
    ? {
        generateRewrite: "生成资料包草稿",
        requestAccess: "申请访问",
        viewSavedMaterials: "查看 Referral Pack",
        providerContext: "资料包来源",
        savedMaterials: "已保存资料包草稿",
        savedMaterialsDescription: "查看最近保存的生成草稿，以及是否可放入 Referral Pack。",
        accessStatus: "访问状态",
        accessDescription: "访问状态和每日引导额度决定是否可以生成材料。",
        dailyGuidedQuota: "每日引导额度",
        remainingToday: "今日剩余",
        boundaryTitle: "边界说明",
        noSavedMaterials: "目前还没有已保存资料包草稿。",
      }
    : {
        generateRewrite: "Generate pack draft",
        requestAccess: "Request access",
        viewSavedMaterials: "View Referral Pack",
        providerContext: "Pack source details",
        savedMaterials: "Saved pack drafts",
        savedMaterialsDescription:
          "Review recently saved generated drafts and whether they are ready for the Referral Pack.",
        accessStatus: "Access status",
        accessDescription:
          "Access state and daily guided quota determine whether materials can be generated.",
        dailyGuidedQuota: "Daily guided quota",
        remainingToday: "Remaining today",
        boundaryTitle: "Boundary note",
        noSavedMaterials: "No saved pack drafts yet.",
      };
}

function ModeStatusCard({
  accessState,
  hasDemoAccess,
  isDemoSession,
  locale,
  copy,
  buildAccountHref,
}: {
  accessState: AccessState;
  hasDemoAccess: boolean;
  isDemoSession: boolean;
  locale: Locale;
  copy: ReferralWorkspaceCopy["materials"];
  buildAccountHref: (href: string, targetAccountId?: string) => string;
}) {
  const remainingQuota = Math.max(
    0,
    accessState.dailyQuota - accessState.usedToday,
  );
  const accountHref = buildAccountHref;
  const modeBoundaryCopy = getMaterialsModeBoundaryCopy({
    hasDemoAccess,
    isDemoSession,
    locale,
  });

  return (
    <Card className="taito-product-shell p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
            {hasDemoAccess ? (
              <CheckCircle2 className="size-5 text-[#635f57]" aria-hidden="true" />
            ) : (
              <LockKeyhole className="size-5 text-[#635f57]" aria-hidden="true" />
            )}
            {copy.currentModeTitle}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-[#181715]">
            {hasDemoAccess
              ? copy.accessCodeGuidedPreview
              : copy.freePreviewWithoutCode}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#635f57]">
            {hasDemoAccess ? copy.accessModeDetail : copy.freeModeDetail}
          </p>
        </div>
        <span
          className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
            hasDemoAccess
              ? "border-[#c9d8cf] bg-[#f3f8f4] text-[#334a3e]"
              : "border-[#ded6c8] bg-white text-[#635f57]"
          }`}
        >
          {isDemoSession
            ? hasDemoAccess
              ? copy.userApproved
              : copy.userFree
            : accessState.hasAccessCode
              ? copy.activeForDemo
              : copy.notPresent}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[#e3ddd2] bg-white p-3">
          <p className="text-xs font-semibold text-[#635f57]">{copy.accessCode}</p>
          <p className="mt-1 text-sm font-semibold text-[#181715]">
            {accessState.hasAccessCode ? copy.activeForDemo : copy.notPresent}
          </p>
        </div>
        <div className="rounded-lg border border-[#e3ddd2] bg-white p-3">
          <p className="text-xs font-semibold text-[#635f57]">{copy.guidedQuota}</p>
          <p className="mt-1 text-sm font-semibold text-[#181715]">
            {formatTemplate(copy.usedDailyQuota, {
              used: accessState.usedToday,
              total: accessState.dailyQuota,
            })}
          </p>
        </div>
        <div className="rounded-lg border border-[#e3ddd2] bg-white p-3">
          <p className="text-xs font-semibold text-[#635f57]">{copy.remainingToday}</p>
          <p className="mt-1 text-sm font-semibold text-[#181715]">
            {remainingQuota}
          </p>
        </div>
      </div>

      <p className="mt-4 rounded-lg border border-[#e3ddd2] bg-white px-3 py-2 text-sm leading-6 text-[#3f3b34]">
        {modeBoundaryCopy}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        {!isDemoSession ? (
          <ButtonLink href={accountHref("/referral-workspace/access")}>
            {getReferralWorkspaceCopy(locale).workspace.requestAccess}{" "}
            <ArrowRight className="size-4" />
          </ButtonLink>
        ) : hasDemoAccess ? (
          <>
            <ButtonLink
              href={accountHref("/referral-workspace/materials", "user-free")}
              variant="secondary"
            >
              {copy.viewFreePreview}
            </ButtonLink>
            <ButtonLink href={accountHref("/referral-workspace/access")}>
              {copy.accessRequestPreview}
            </ButtonLink>
          </>
        ) : (
          <>
            <ButtonLink href={accountHref("/referral-workspace/access")}>
              {getReferralWorkspaceCopy(locale).workspace.requestAccess}{" "}
              <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink
              href={accountHref("/referral-workspace/materials", "user-approved")}
              variant="secondary"
            >
              {copy.tryAccessCodeDemo}
            </ButtonLink>
          </>
        )}
      </div>
    </Card>
  );
}

function DeterministicPreviewNotice({
  hasDemoAccess,
  copy,
}: {
  hasDemoAccess: boolean;
  copy: ReferralWorkspaceCopy["materials"];
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
        <ShieldCheck className="size-5 text-[#635f57]" aria-hidden="true" />
        {copy.deterministicPreviewTitle}
      </div>
      <div className="mt-4 grid gap-3">
        <div className="flex gap-3 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3">
          <MessageSquareText
            className="mt-1 size-4 shrink-0 text-[#635f57]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#3f3b34]">
            {copy.noAiCall}
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3">
          <FileText
            className="mt-1 size-4 shrink-0 text-[#635f57]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#3f3b34]">
            {hasDemoAccess
              ? copy.guidedReviewBoundary
              : copy.freePreviewBoundary}
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3">
          <KeyRound
            className="mt-1 size-4 shrink-0 text-[#635f57]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#3f3b34]">
            {copy.accessStateBoundary}
          </p>
        </div>
      </div>
    </Card>
  );
}

function MaterialsContextPanel({
  profile,
  copy,
}: {
  profile: ReferralProfile;
  copy: ReferralWorkspaceCopy;
}) {
  const profileCopy = copy.profile;
  const componentCopy = copy.components.basicProfile;
  const entityLabel = componentCopy.entityLabels[profile.entityType];
  const directionLabel = componentCopy.directionLabels[profile.referralDirection];

  return (
    <Card className="mt-6 p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#635f57]">
            {copy.components.copilot.profileContextLabel}
          </div>
          <h2 className="mt-2 break-words text-2xl font-semibold text-[#181715]">
            {profile.name}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#3f3b34]">
            {profile.summary}
          </p>
        </div>
        <span className="inline-flex min-h-7 items-center rounded-md border border-[#ded6c8] bg-[#fbfaf7] px-2 py-1 text-xs font-semibold text-[#635f57]">
          {directionLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3">
          <p className="text-xs font-semibold text-[#635f57]">
            {profileCopy.fields.entityType}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#181715]">
            {entityLabel}
          </p>
        </div>
        <div className="rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3">
          <p className="text-xs font-semibold text-[#635f57]">
            {profileCopy.fields.serviceAreas}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#181715]">
            {profile.serviceAreas.join(", ")}
          </p>
        </div>
        <div className="rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3">
          <p className="text-xs font-semibold text-[#635f57]">
            {profileCopy.fields.languages}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#181715]">
            {profile.languages.join(", ")}
          </p>
        </div>
      </div>
    </Card>
  );
}

function LatestShareCardDraftPanel({
  material,
  copy,
}: {
  material: ShareCardMaterial;
  copy: ReferralWorkspaceCopy["materials"];
}) {
  const fieldLabels = copy.shareCardGenerator.fieldLabels;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
            <CheckCircle2 className="size-5 text-[#635f57]" aria-hidden="true" />
            {copy.latestShareCard.title}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#635f57]">
            {copy.latestShareCard.description}
          </p>
        </div>
        <span className="inline-flex min-h-7 items-center rounded-md border border-[#c9d8cf] bg-[#f3f8f4] px-2 py-1 text-xs font-semibold text-[#334a3e]">
          {copy.latestShareCard.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ShareCardField label={fieldLabels.headline} value={material.headline} />
        <ShareCardField
          label={fieldLabels.subheadline}
          value={material.subheadline}
        />
        <ShareCardField
          label={fieldLabels.serviceArea}
          value={material.serviceArea}
        />
        <ShareCardField label={fieldLabels.languages} value={material.languages} />
        <ShareCardField
          label={fieldLabels.referralFit}
          value={material.referralFit}
        />
        <ShareCardField label={fieldLabels.intakePath} value={material.intakePath} />
        <div className="md:col-span-2">
          <ShareCardField
            label={fieldLabels.disclaimer}
            value={material.disclaimer}
          />
        </div>
      </div>

      <p className="mt-4 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3 text-xs leading-5 text-[#635f57]">
        {copy.shareCardGenerator.boundary}
      </p>
    </Card>
  );
}

function GeneratedDraftHistoryPanel({
  items,
  copy,
  canUpdateStatus,
  actionContext,
}: {
  items: GeneratedDraftHistoryItem[];
  copy: ReferralWorkspaceCopy["materials"];
  canUpdateStatus: boolean;
  actionContext: GeneratedDraftHistoryActionContext;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
            <FileText className="size-5 text-[#635f57]" aria-hidden="true" />
            {copy.generatedDraftHistory.title}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#635f57]">
            {copy.generatedDraftHistory.description}
          </p>
        </div>
        <span className="inline-flex min-h-7 items-center rounded-md border border-[#ded6c8] bg-[#fbfaf7] px-2 py-1 text-xs font-semibold text-[#635f57]">
          {items.length}
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="grid gap-3 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex min-h-7 items-center rounded-md border border-[#ded6c8] bg-white px-2 py-1 text-xs font-semibold text-[#635f57]">
                  {item.featureLabel}
                </span>
                <span className="text-xs font-semibold text-[#635f57]">
                  {item.createdAt}
                </span>
              </div>
              <h3 className="mt-2 break-words text-sm font-semibold text-[#181715]">
                {item.title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#3f3b34]">
                {item.description}
              </p>
              {item.fields.length ? (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#635f57]">
                      {copy.generatedDraftHistory.copyActions.fieldsTitle}
                    </p>
                    <GeneratedDraftCopyButton
                      text={item.copyText}
                      label={copy.generatedDraftHistory.copyActions.copyAll}
                      copiedLabel={copy.generatedDraftHistory.copyActions.copied}
                      telemetryEvent={{
                        generatedMaterialDraftId: item.id,
                        eventType: "copy_all",
                      }}
                      ariaLabel={formatTemplate(
                        copy.generatedDraftHistory.copyActions.copyAllAria,
                        { title: item.title },
                      )}
                    />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {item.fields.map((field) => (
                      <GeneratedDraftHistoryFieldCard
                        key={`${item.id}-${field.key}`}
                        generatedMaterialDraftId={item.id}
                        field={field}
                        copy={copy}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-start md:justify-end">
              <div className="flex flex-col items-start gap-2 md:items-end">
                <span
                  className={`inline-flex min-h-7 items-center rounded-md border px-2 py-1 text-xs font-semibold ${getGeneratedDraftStatusBadgeClass(
                    item.status,
                  )}`}
                >
                  {item.statusLabel}
                </span>
                {canUpdateStatus ? (
                  <GeneratedDraftHistoryActions
                    item={item}
                    copy={copy}
                    actionContext={actionContext}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3 text-xs leading-5 text-[#635f57]">
        {copy.shareCardGenerator.boundary}
      </p>
    </Card>
  );
}

function GeneratedDraftHistoryFieldCard({
  generatedMaterialDraftId,
  field,
  copy,
}: {
  generatedMaterialDraftId: string;
  field: GeneratedDraftHistoryField;
  copy: ReferralWorkspaceCopy["materials"];
}) {
  return (
    <div className="rounded-lg border border-[#e3ddd2] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-xs font-semibold text-[#635f57]">
          {field.label}
        </p>
        <GeneratedDraftCopyButton
          text={`${field.label}: ${field.value}`}
          label={copy.generatedDraftHistory.copyActions.copyField}
          copiedLabel={copy.generatedDraftHistory.copyActions.copied}
          telemetryEvent={{
            generatedMaterialDraftId,
            eventType: "copy_field",
            fieldKey: field.key,
          }}
          ariaLabel={formatTemplate(
            copy.generatedDraftHistory.copyActions.copyFieldAria,
            { field: field.label },
          )}
          compact
        />
      </div>
      <p className="mt-2 break-words text-sm leading-6 text-[#181715]">
        {field.value}
      </p>
    </div>
  );
}

function GeneratedDraftHistoryActions({
  item,
  copy,
  actionContext,
}: {
  item: GeneratedDraftHistoryItem;
  copy: ReferralWorkspaceCopy["materials"];
  actionContext: GeneratedDraftHistoryActionContext;
}) {
  if (item.status === "archived") {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 md:justify-end">
      {item.status !== "reviewed" ? (
        <GeneratedDraftHistoryActionForm
          item={item}
          status="reviewed"
          actionContext={actionContext}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {copy.generatedDraftHistory.actions.markReviewed}
        </GeneratedDraftHistoryActionForm>
      ) : null}
      <GeneratedDraftHistoryActionForm
        item={item}
        status="archived"
        actionContext={actionContext}
      >
        <Archive className="size-4" aria-hidden="true" />
        {copy.generatedDraftHistory.actions.archive}
      </GeneratedDraftHistoryActionForm>
    </div>
  );
}

function GeneratedDraftHistoryActionForm({
  item,
  status,
  actionContext,
  children,
}: {
  item: GeneratedDraftHistoryItem;
  status: GeneratedMaterialDraftRecord["status"];
  actionContext: GeneratedDraftHistoryActionContext;
  children: ReactNode;
}) {
  return (
    <form action={updateGeneratedMaterialDraftStatusAction}>
      <input type="hidden" name="materialDraftId" value={item.id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="lang" value={actionContext.locale} />
      {actionContext.source ? (
        <input type="hidden" name="source" value={actionContext.source} />
      ) : null}
      {actionContext.draftId ? (
        <input type="hidden" name="draftId" value={actionContext.draftId} />
      ) : null}
      <button
        type="submit"
        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[#ded6c8] bg-white px-2.5 py-1 text-xs font-semibold text-[#181715] transition hover:bg-[#fbfaf7]"
      >
        {children}
      </button>
    </form>
  );
}

function ShareCardField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-20 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3">
      <p className="text-xs font-semibold text-[#635f57]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[#181715]">{value}</p>
    </div>
  );
}

export default async function ReferralMaterialsPage({
  searchParams,
}: ReferralMaterialsPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const gate = await getWorkspaceAccessGateWithServerSession(params);
  const handoff = getProviderGeneratorHandoffContext(params);
  const localDraftPersister = (
    <ProviderDraftHandoffPersister
      source={handoff.source}
      draftId={handoff.draftId}
      draftPayload={handoff.draftPayload}
    />
  );

  if (gate.status === "signed_out") {
    return (
      <>
        {localDraftPersister}
        <ReferralWorkspaceLoginGate
          copy={copy}
          locale={locale}
          languageSwitcherHref={withProviderGeneratorHandoff(
            "/referral-workspace/materials",
            handoff,
          )}
          loginHref={withAuthHandoffParams("/auth/login", params)}
          registerHref={withAuthHandoffParams("/auth/register", params)}
        />
      </>
    );
  }

  if (gate.account.role === "admin") {
    return (
      <>
        {localDraftPersister}
        <ReferralWorkspaceAdminGate
          copy={copy}
          locale={locale}
          accountId={gate.account.id}
        />
      </>
    );
  }

  const accountId = gate.account.id;
  const providerDraftStore = getProviderDraftStore();
  const rawResolvedDraft = handoff.draftId
    ? await resolveProviderDraft({
        draftId: handoff.draftId,
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
  const withHandoff = (href: string) =>
    withProviderGeneratorHandoff(href, handoff);
  const signedInHref = (href: string, targetAccountId = accountId) => {
    const localizedHref = withLocale(withHandoff(href), locale);

    return gate.source === "demo"
      ? withWorkspaceAccount(localizedHref, targetAccountId)
      : localizedHref;
  };
  const isDemoSession = gate.source === "demo";
  const hasDemoAccess = gate.canUseGuidedMaterials;
  const profile = resolvedDraft
    ? mapPublicProviderDraftToProfile(resolvedDraft.draft, accountId)
    : getReferralProfileForWorkspaceAccount({
        ownerUserId: gate.account.id,
        name: gate.account.name,
      });
  const accessState = gate.accessState;
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const queue = getAgentQueueForAccess(accessState);
  const materials = getLockedMaterials(profile.referralDirection, accessState);
  const profileRewriteDisabledReason = getGuidedProfileRewriteDisabledReason({
    accountId,
    claimedDraftId: resolvedDraft?.record?.id,
  });
  const shareCardDisabledReason = getGuidedShareCardDisabledReason({
    accountId,
    claimedDraftId: resolvedDraft?.record?.id,
  });
  const referralMessageDisabledReason = getGuidedReferralMessageDisabledReason({
    accountId,
    claimedDraftId: resolvedDraft?.record?.id,
  });
  const bilingualIntroDisabledReason = getGuidedBilingualIntroDisabledReason({
    accountId,
    claimedDraftId: resolvedDraft?.record?.id,
  });
  const handoverChecklistDisabledReason =
    getGuidedHandoverChecklistDisabledReason({
      accountId,
      claimedDraftId: resolvedDraft?.record?.id,
    });
  const profileRewriteGenerationEnabled =
    hasDemoAccess && profileRewriteDisabledReason === undefined;
  const shareCardGenerationEnabled =
    hasDemoAccess && shareCardDisabledReason === undefined;
  const referralMessageGenerationEnabled =
    hasDemoAccess && referralMessageDisabledReason === undefined;
  const bilingualIntroGenerationEnabled =
    hasDemoAccess && bilingualIntroDisabledReason === undefined;
  const handoverChecklistGenerationEnabled =
    hasDemoAccess && handoverChecklistDisabledReason === undefined;
  const generatedMaterialDraftStore = getGeneratedMaterialDraftStore();
  const canReadSavedGeneratedMaterials =
    generatedMaterialDraftStore.kind === "memory" || isSupabaseAuthUserId(accountId);
  const latestShareCardDraft = canReadSavedGeneratedMaterials
    ? await generatedMaterialDraftStore.getLatestGeneratedMaterialDraftByUser({
        userId: accountId,
        feature: "share_card",
        providerDraftId: resolvedDraft?.record?.id,
      })
    : undefined;
  const generatedMaterialDrafts = canReadSavedGeneratedMaterials
    ? await generatedMaterialDraftStore.listGeneratedMaterialDraftsByUser({
        userId: accountId,
        providerDraftId: resolvedDraft?.record?.id,
        limit: 12,
      })
    : [];
  const latestShareCardMaterial =
    getShareCardMaterialFromDraft(latestShareCardDraft);
  const generatedDraftHistoryItems = getGeneratedDraftHistoryItems({
    drafts: generatedMaterialDrafts,
    copy: copy.materials,
  });
  const profileRewriteCopy = getPreviewSafeGeneratorCopy(
    getProfileRewriteGeneratorCopy(
      copy.materials.profileRewriteGenerator,
      locale,
    ),
    locale,
  );
  const shareCardCopy = getPreviewSafeGeneratorCopy(
    copy.materials.shareCardGenerator,
    locale,
  );
  const referralMessageCopy = getPreviewSafeGeneratorCopy(
    copy.materials.referralMessageGenerator,
    locale,
  );
  const bilingualIntroCopy = getPreviewSafeGeneratorCopy(
    copy.materials.bilingualIntroGenerator,
    locale,
  );
  const handoverChecklistCopy = getPreviewSafeGeneratorCopy(
    copy.materials.handoverChecklistGenerator,
    locale,
  );
  const languageSwitcherHref = withWorkspaceAccount(
    withHandoff("/referral-workspace/materials"),
    gate.source === "demo" ? accountId : undefined,
  );
  const workspaceCopy = getMaterialsWorkspaceCopy(locale);
  const savedMaterialsCount = generatedDraftHistoryItems.length;
  const remainingQuota = Math.max(
    0,
    accessState.dailyQuota - accessState.usedToday,
  );

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={languageSwitcherHref}
      workspaceAccountId={gate.source === "demo" ? accountId : undefined}
      workspaceRole={gate.account.role}
      workspaceSessionSource={gate.source}
    >
      {localDraftPersister}
      <header className="mb-4 border-b border-[#ded6c8] pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#0f766e]">
              {copy.materials.eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#181715] sm:text-3xl">
              {copy.materials.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#40504b]">
              {`${copy.materials.description} ${
                hasDemoAccess ? copy.materials.accessMode : copy.materials.freeMode
              }`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasDemoAccess ? (
              <ButtonLink href="#materials-generators">
                {workspaceCopy.generateRewrite}
              </ButtonLink>
            ) : (
              <ButtonLink href={signedInHref("/referral-workspace/access")}>
                {workspaceCopy.requestAccess}
              </ButtonLink>
            )}
            <ButtonLink href="#saved-materials" variant="secondary">
              {workspaceCopy.viewSavedMaterials}
            </ButtonLink>
            {isDemoSession ? (
              hasDemoAccess ? (
                <ButtonLink
                  href={signedInHref(
                    "/referral-workspace/materials",
                    "user-free",
                  )}
                  variant="secondary"
                >
                  {copy.materials.freePreview}
                </ButtonLink>
              ) : (
                <ButtonLink
                  href={signedInHref(
                    "/referral-workspace/materials",
                    "user-approved",
                  )}
                  variant="secondary"
                >
                  {copy.materials.accessDemo}
                </ButtonLink>
              )
            ) : null}
            <ButtonLink
              href={signedInHref("/referral-workspace/access")}
              variant="secondary"
            >
              {copy.materials.access}
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </div>
      </header>

      <WorkspaceGrid
        main={
          <WorkspaceMainPanel>
            <ModeStatusCard
              accessState={accessState}
              hasDemoAccess={hasDemoAccess}
              isDemoSession={isDemoSession}
              locale={locale}
              copy={copy.materials}
              buildAccountHref={signedInHref}
            />

            <MaterialsContextPanel profile={profile} copy={copy} />

            {hasDemoAccess ? (
              <section
                id="materials-generators"
                className="grid scroll-mt-6 gap-5 xl:grid-cols-2 2xl:grid-cols-4"
              >
                <GuidedProfileRewriteGenerator
                  draftId={resolvedDraft?.record?.id}
                  profileName={profile.name}
                  enabled={profileRewriteGenerationEnabled}
                  disabledReason={profileRewriteDisabledReason}
                  copy={profileRewriteCopy}
                />
                <GuidedShareCardGenerator
                  draftId={resolvedDraft?.record?.id}
                  profileName={profile.name}
                  enabled={shareCardGenerationEnabled}
                  disabledReason={shareCardDisabledReason}
                  copy={shareCardCopy}
                />
                <GuidedReferralMessageGenerator
                  draftId={resolvedDraft?.record?.id}
                  profileName={profile.name}
                  enabled={referralMessageGenerationEnabled}
                  disabledReason={referralMessageDisabledReason}
                  copy={referralMessageCopy}
                />
                <GuidedBilingualIntroGenerator
                  draftId={resolvedDraft?.record?.id}
                  profileName={profile.name}
                  enabled={bilingualIntroGenerationEnabled}
                  disabledReason={bilingualIntroDisabledReason}
                  copy={bilingualIntroCopy}
                />
                <GuidedHandoverChecklistGenerator
                  draftId={resolvedDraft?.record?.id}
                  profileName={profile.name}
                  enabled={handoverChecklistGenerationEnabled}
                  disabledReason={handoverChecklistDisabledReason}
                  copy={handoverChecklistCopy}
                />
              </section>
            ) : null}

            <section id="saved-materials" className="scroll-mt-6">
              {latestShareCardMaterial ? (
                <LatestShareCardDraftPanel
                  material={latestShareCardMaterial}
                  copy={copy.materials}
                />
              ) : null}

              {generatedDraftHistoryItems.length ? (
                <div className={latestShareCardMaterial ? "mt-4" : undefined}>
                  <GeneratedDraftHistoryPanel
                    items={generatedDraftHistoryItems}
                    copy={copy.materials}
                    canUpdateStatus={isSupabaseAuthUserId(accountId)}
                    actionContext={{
                      locale,
                      source: handoff.source,
                      draftId: handoff.draftId,
                    }}
                  />
                </div>
              ) : (
                <WorkspaceSection
                  title={workspaceCopy.savedMaterials}
                  description={workspaceCopy.savedMaterialsDescription}
                  action={
                    <WorkspaceStatusPill tone="neutral">
                      {savedMaterialsCount}
                    </WorkspaceStatusPill>
                  }
                >
                  <p className="text-sm leading-6 text-[#40504b]">
                    {workspaceCopy.noSavedMaterials}
                  </p>
                </WorkspaceSection>
              )}
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="grid gap-5">
                <AccessStatusPanel accessState={accessState} locale={locale} />
                <AgentQueuePanel
                  queue={queue}
                  accessState={accessState}
                  locale={locale}
                />
              </div>
              <GuidedCopilotPanel
                accessState={accessState}
                queue={queue}
                summary={summary}
                audit={audit}
                locale={locale}
              />
            </div>

            <LockedMaterialsGrid
              materials={materials}
              accessState={accessState}
              locale={locale}
            />
          </WorkspaceMainPanel>
        }
        rightRail={
          <WorkspaceRightRail>
            {isDemoSession ? (
              <DeterministicPreviewNotice
                hasDemoAccess={hasDemoAccess}
                copy={copy.materials}
              />
            ) : null}
            <WorkspaceSection
              title={workspaceCopy.accessStatus}
              description={workspaceCopy.accessDescription}
            >
              <WorkspaceSignalRow
                title={copy.materials.accessCode}
                detail={accessState.codeType ?? copy.materials.notPresent}
                status={
                  accessState.hasAccessCode
                    ? copy.materials.activeForDemo
                    : copy.materials.notPresent
                }
                tone={accessState.hasAccessCode ? "success" : "locked"}
              />
              <WorkspaceSignalRow
                title={workspaceCopy.dailyGuidedQuota}
                detail={formatTemplate(copy.materials.usedDailyQuota, {
                  used: accessState.usedToday,
                  total: accessState.dailyQuota,
                })}
                status={remainingQuota}
                tone={hasDemoAccess ? "success" : "warning"}
              />
              <WorkspaceSignalRow
                title={workspaceCopy.remainingToday}
                detail={copy.materials.remainingToday}
                status={remainingQuota}
                tone={hasDemoAccess ? "success" : "warning"}
              />
            </WorkspaceSection>

            <WorkspaceSection
              title={workspaceCopy.savedMaterials}
              description={workspaceCopy.savedMaterialsDescription}
              action={
                <WorkspaceStatusPill tone={savedMaterialsCount ? "success" : "neutral"}>
                  {savedMaterialsCount}
                </WorkspaceStatusPill>
              }
            >
              <p className="text-sm leading-6 text-[#40504b]">
                {savedMaterialsCount
                  ? copy.materials.generatedDraftHistory.description
                  : workspaceCopy.noSavedMaterials}
              </p>
            </WorkspaceSection>

            <WorkspaceSection title={workspaceCopy.boundaryTitle}>
              <TrustBoundaryNotice className="border-0 bg-transparent p-0" locale={locale} />
            </WorkspaceSection>
          </WorkspaceRightRail>
        }
      />
    </AppShell>
  );
}

function getGuidedProfileRewriteDisabledReason({
  accountId,
  claimedDraftId,
}: {
  accountId: string;
  claimedDraftId?: string;
}): GuidedProfileRewriteDisabledReason | undefined {
  if (!isSupabaseAuthUserId(accountId)) {
    return "verified_session_required";
  }

  if (!claimedDraftId) {
    return "claimed_draft_required";
  }

  return undefined;
}

function getGuidedShareCardDisabledReason({
  accountId,
  claimedDraftId,
}: {
  accountId: string;
  claimedDraftId?: string;
}): GuidedShareCardDisabledReason | undefined {
  if (!isSupabaseAuthUserId(accountId)) {
    return "verified_session_required";
  }

  if (!claimedDraftId) {
    return "claimed_draft_required";
  }

  return undefined;
}

function getGuidedReferralMessageDisabledReason({
  accountId,
  claimedDraftId,
}: {
  accountId: string;
  claimedDraftId?: string;
}): GuidedReferralMessageDisabledReason | undefined {
  if (!isSupabaseAuthUserId(accountId)) {
    return "verified_session_required";
  }

  if (!claimedDraftId) {
    return "claimed_draft_required";
  }

  return undefined;
}

function getGuidedBilingualIntroDisabledReason({
  accountId,
  claimedDraftId,
}: {
  accountId: string;
  claimedDraftId?: string;
}): GuidedBilingualIntroDisabledReason | undefined {
  if (!isSupabaseAuthUserId(accountId)) {
    return "verified_session_required";
  }

  if (!claimedDraftId) {
    return "claimed_draft_required";
  }

  return undefined;
}

function getGuidedHandoverChecklistDisabledReason({
  accountId,
  claimedDraftId,
}: {
  accountId: string;
  claimedDraftId?: string;
}): GuidedHandoverChecklistDisabledReason | undefined {
  if (!isSupabaseAuthUserId(accountId)) {
    return "verified_session_required";
  }

  if (!claimedDraftId) {
    return "claimed_draft_required";
  }

  return undefined;
}

function getShareCardMaterialFromDraft(
  draft: GeneratedMaterialDraftRecord | undefined,
): ShareCardMaterial | undefined {
  if (!draft || draft.feature !== "share_card") {
    return undefined;
  }

  const material = {
    headline: getMaterialString(draft.content.headline),
    subheadline: getMaterialString(draft.content.subheadline),
    serviceArea: getMaterialString(draft.content.serviceArea),
    languages: getMaterialString(draft.content.languages),
    referralFit: getMaterialString(draft.content.referralFit),
    intakePath: getMaterialString(draft.content.intakePath),
    disclaimer: getMaterialString(draft.content.disclaimer),
  };

  return Object.values(material).every(Boolean) ? material : undefined;
}

function getGeneratedDraftHistoryItems({
  drafts,
  copy,
}: {
  drafts: GeneratedMaterialDraftRecord[];
  copy: ReferralWorkspaceCopy["materials"];
}): GeneratedDraftHistoryItem[] {
  return drafts
    .map((draft) => getGeneratedDraftHistoryItem({ draft, copy }))
    .filter((item): item is GeneratedDraftHistoryItem => Boolean(item));
}

function getGeneratedDraftHistoryItem({
  draft,
  copy,
}: {
  draft: GeneratedMaterialDraftRecord;
  copy: ReferralWorkspaceCopy["materials"];
}): GeneratedDraftHistoryItem | undefined {
  if (draft.feature === "profile_rewrite") {
    const fields = getGeneratedDraftFields([
      [
        "professionalEnglishDescription",
        copy.profileRewriteGenerator.fieldLabels.professionalEnglishDescription,
        draft.content.professionalEnglishDescription,
      ],
      [
        "shortEnglishSummary",
        copy.profileRewriteGenerator.fieldLabels.shortEnglishSummary,
        draft.content.shortEnglishSummary,
      ],
      [
        "chineseCommunityIntro",
        copy.profileRewriteGenerator.fieldLabels.chineseCommunityIntro,
        draft.content.chineseCommunityIntro,
      ],
      [
        "referralPartnerSummary",
        copy.profileRewriteGenerator.fieldLabels.referralPartnerSummary,
        draft.content.referralPartnerSummary,
      ],
      [
        "profileImprovementNotes",
        copy.profileRewriteGenerator.fieldLabels.profileImprovementNotes,
        draft.content.profileImprovementNotes,
      ],
      [
        "disclaimer",
        copy.profileRewriteGenerator.fieldLabels.disclaimer,
        draft.content.disclaimer,
      ],
    ]);
    const title = getMaterialString(
      draft.content.professionalEnglishDescription,
    );
    const description =
      getMaterialString(draft.content.shortEnglishSummary) ||
      getMaterialString(draft.content.referralPartnerSummary) ||
      getMaterialString(draft.content.disclaimer);

    return title
      ? {
          id: draft.id,
          feature: "profile_rewrite",
          status: draft.status,
          featureLabel: copy.generatedDraftHistory.featureLabels.profile_rewrite,
          title,
          description,
          fields,
          copyText: formatGeneratedDraftCopyText({
            featureLabel: copy.generatedDraftHistory.featureLabels.profile_rewrite,
            fields,
          }),
          statusLabel: copy.generatedDraftHistory.statusLabels[draft.status],
          createdAt: formatGeneratedDraftCreatedAt(draft.createdAt),
        }
      : undefined;
  }

  if (draft.feature === "share_card") {
    const fields = getGeneratedDraftFields([
      ["headline", copy.shareCardGenerator.fieldLabels.headline, draft.content.headline],
      [
        "subheadline",
        copy.shareCardGenerator.fieldLabels.subheadline,
        draft.content.subheadline,
      ],
      ["serviceArea", copy.shareCardGenerator.fieldLabels.serviceArea, draft.content.serviceArea],
      ["languages", copy.shareCardGenerator.fieldLabels.languages, draft.content.languages],
      ["referralFit", copy.shareCardGenerator.fieldLabels.referralFit, draft.content.referralFit],
      ["intakePath", copy.shareCardGenerator.fieldLabels.intakePath, draft.content.intakePath],
      ["disclaimer", copy.shareCardGenerator.fieldLabels.disclaimer, draft.content.disclaimer],
    ]);
    const title = getMaterialString(draft.content.headline);
    const description =
      getMaterialString(draft.content.subheadline) ||
      getMaterialString(draft.content.referralFit) ||
      getMaterialString(draft.content.disclaimer);

    return title
      ? {
          id: draft.id,
          feature: "share_card",
          status: draft.status,
          featureLabel: copy.generatedDraftHistory.featureLabels.share_card,
          title,
          description,
          fields,
          copyText: formatGeneratedDraftCopyText({
            featureLabel: copy.generatedDraftHistory.featureLabels.share_card,
            fields,
          }),
          statusLabel: copy.generatedDraftHistory.statusLabels[draft.status],
          createdAt: formatGeneratedDraftCreatedAt(draft.createdAt),
        }
      : undefined;
  }

  if (draft.feature === "referral_message") {
    const fields = getGeneratedDraftFields([
      [
        "subjectLine",
        copy.referralMessageGenerator.fieldLabels.subjectLine,
        draft.content.subjectLine,
      ],
      ["opening", copy.referralMessageGenerator.fieldLabels.opening, draft.content.opening],
      [
        "providerSummary",
        copy.referralMessageGenerator.fieldLabels.providerSummary,
        draft.content.providerSummary,
      ],
      [
        "referralFit",
        copy.referralMessageGenerator.fieldLabels.referralFit,
        draft.content.referralFit,
      ],
      [
        "handoverRequest",
        copy.referralMessageGenerator.fieldLabels.handoverRequest,
        draft.content.handoverRequest,
      ],
      ["nextStep", copy.referralMessageGenerator.fieldLabels.nextStep, draft.content.nextStep],
      [
        "disclaimer",
        copy.referralMessageGenerator.fieldLabels.disclaimer,
        draft.content.disclaimer,
      ],
    ]);
    const title = getMaterialString(draft.content.subjectLine);
    const description =
      getMaterialString(draft.content.providerSummary) ||
      getMaterialString(draft.content.opening) ||
      getMaterialString(draft.content.disclaimer);

    return title
      ? {
          id: draft.id,
          feature: "referral_message",
          status: draft.status,
          featureLabel:
            copy.generatedDraftHistory.featureLabels.referral_message,
          title,
          description,
          fields,
          copyText: formatGeneratedDraftCopyText({
            featureLabel:
              copy.generatedDraftHistory.featureLabels.referral_message,
            fields,
          }),
          statusLabel: copy.generatedDraftHistory.statusLabels[draft.status],
          createdAt: formatGeneratedDraftCreatedAt(draft.createdAt),
        }
      : undefined;
  }

  if (draft.feature === "bilingual_intro") {
    const fields = getGeneratedDraftFields([
      [
        "englishIntro",
        copy.bilingualIntroGenerator.fieldLabels.englishIntro,
        draft.content.englishIntro,
      ],
      [
        "communityLanguageIntro",
        copy.bilingualIntroGenerator.fieldLabels.communityLanguageIntro,
        draft.content.communityLanguageIntro,
      ],
      ["language", copy.bilingualIntroGenerator.fieldLabels.language, draft.content.language],
      [
        "sharingContext",
        copy.bilingualIntroGenerator.fieldLabels.sharingContext,
        draft.content.sharingContext,
      ],
      [
        "disclaimer",
        copy.bilingualIntroGenerator.fieldLabels.disclaimer,
        draft.content.disclaimer,
      ],
    ]);
    const title = getMaterialString(draft.content.englishIntro);
    const description =
      getMaterialString(draft.content.communityLanguageIntro) ||
      getMaterialString(draft.content.sharingContext) ||
      getMaterialString(draft.content.disclaimer);

    return title
      ? {
          id: draft.id,
          feature: "bilingual_intro",
          status: draft.status,
          featureLabel: copy.generatedDraftHistory.featureLabels.bilingual_intro,
          title,
          description,
          fields,
          copyText: formatGeneratedDraftCopyText({
            featureLabel: copy.generatedDraftHistory.featureLabels.bilingual_intro,
            fields,
          }),
          statusLabel: copy.generatedDraftHistory.statusLabels[draft.status],
          createdAt: formatGeneratedDraftCreatedAt(draft.createdAt),
        }
      : undefined;
  }

  if (draft.feature === "handover_checklist") {
    const fields = getGeneratedDraftFields([
      [
        "checklistTitle",
        copy.handoverChecklistGenerator.fieldLabels.checklistTitle,
        draft.content.checklistTitle,
      ],
      [
        "consentCheck",
        copy.handoverChecklistGenerator.fieldLabels.consentCheck,
        draft.content.consentCheck,
      ],
      [
        "clientContext",
        copy.handoverChecklistGenerator.fieldLabels.clientContext,
        draft.content.clientContext,
      ],
      [
        "supportNeed",
        copy.handoverChecklistGenerator.fieldLabels.supportNeed,
        draft.content.supportNeed,
      ],
      [
        "handoverDetails",
        copy.handoverChecklistGenerator.fieldLabels.handoverDetails,
        draft.content.handoverDetails,
      ],
      [
        "nextStep",
        copy.handoverChecklistGenerator.fieldLabels.nextStep,
        draft.content.nextStep,
      ],
      [
        "disclaimer",
        copy.handoverChecklistGenerator.fieldLabels.disclaimer,
        draft.content.disclaimer,
      ],
    ]);
    const title = getMaterialString(draft.content.checklistTitle);
    const description =
      getMaterialString(draft.content.consentCheck) ||
      getMaterialString(draft.content.clientContext) ||
      getMaterialString(draft.content.disclaimer);

    return title
      ? {
          id: draft.id,
          feature: "handover_checklist",
          status: draft.status,
          featureLabel:
            copy.generatedDraftHistory.featureLabels.handover_checklist,
          title,
          description,
          fields,
          copyText: formatGeneratedDraftCopyText({
            featureLabel:
              copy.generatedDraftHistory.featureLabels.handover_checklist,
            fields,
          }),
          statusLabel: copy.generatedDraftHistory.statusLabels[draft.status],
          createdAt: formatGeneratedDraftCreatedAt(draft.createdAt),
        }
      : undefined;
  }

  return undefined;
}

function getGeneratedDraftFields(
  fields: [key: string, label: string, value: unknown][],
): GeneratedDraftHistoryField[] {
  return fields
    .map(([key, label, value]) => ({
      key,
      label,
      value: getMaterialString(value),
    }))
    .filter((field) => Boolean(field.value));
}

function formatGeneratedDraftCopyText({
  featureLabel,
  fields,
}: {
  featureLabel: string;
  fields: GeneratedDraftHistoryField[];
}) {
  return [
    featureLabel,
    ...fields.map((field) => `${field.label}: ${field.value}`),
  ].join("\n");
}

function getMaterialString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatGeneratedDraftCreatedAt(value: string) {
  return value.slice(0, 10);
}

function getGeneratedDraftStatusBadgeClass(
  status: GeneratedMaterialDraftRecord["status"],
) {
  if (status === "reviewed") {
    return "border-[#c9d8cf] bg-[#f3f8f4] text-[#334a3e]";
  }

  if (status === "archived") {
    return "border-[#ded6c8] bg-white text-[#635f57]";
  }

  return "border-[#ded6c8] bg-[#fbfaf7] text-[#635f57]";
}

function isSupabaseAuthUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
