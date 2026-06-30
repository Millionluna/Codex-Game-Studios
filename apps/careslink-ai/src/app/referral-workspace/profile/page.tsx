import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Eye,
  Info,
  MapPin,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
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
} from "@/components/workspace-layout";
import {
  BasicProfileCard,
  ReferralRoleChecklistPanel,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import {
  ButtonLink,
  Card,
  FieldLabel,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  getReferralProfileForWorkspaceAccount,
  getHealthAudit,
  summarizeProfile,
  type EntityType,
  type ReferralDirection,
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
} from "@/lib/referral-workspace-auth";
import { getWorkspaceAccessGateWithServerSession } from "@/lib/referral-workspace-session";
import {
  getProviderGeneratorHandoffContext,
  withAuthHandoffParams,
  withProviderGeneratorHandoff,
} from "@/lib/referral-workspace-handoff";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type ProfilePageCopy = ReferralWorkspaceCopy["profile"];
type ComponentCopy = ReferralWorkspaceCopy["components"];
type ReferralWorkspaceSearchParams = {
  [key: string]: string | string[] | undefined;
};

type ReferralProfilePageProps = {
  searchParams?: Promise<ReferralWorkspaceSearchParams>;
};

function getProfilePolishCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      qualityTitle: "资料包来源质量",
      qualityDescription:
        "这些资料会进入 Referral Pack。先检查完整度、缺失字段和转介阻碍，再用于发送。",
      completeness: (score: number) => `资料完整度 ${score}%`,
      submittedTitle: "服务商自填资料",
      submittedDescription:
        "这些字段来自服务商资料草稿。CaresLink 不评估服务商质量、适用性、合规状态或服务结果。",
      missingFields: "缺失字段",
      generatedTitle: "AI 生成草稿文案",
      generatedDescription:
        "资料改写结果只作为服务商审核用的草稿文案，不是验证、背书或专业建议流程。",
      reviewTitle: "需要服务商复核",
      reviewDescription:
        "把缺失字段和转介阻碍作为复核清单，确认后再分享资料或生成材料。",
      promptsTitle: "转介阻碍提示",
      fallbackPrompt:
        "分享前请确认服务范围、语言、接收方式和当前接单能力清晰可读。",
      reviewReadiness: "查看转介阻碍",
      improveWording: "创建资料包草稿",
      importedTitle: "已导入服务商资料草稿",
      importedDescription: (draftId: string, source?: string) =>
        `这份草稿来自 CaresLink 服务商资料生成器。草稿 ID：${draftId}${
          source ? `；来源：${source}` : ""
        }。请在工作区内继续补全和审核资料。`,
      importedBadge: "草稿承接",
    };
  }

  return {
    qualityTitle: "Referral Pack source quality",
    qualityDescription:
      "These details power the Referral Pack. Check completeness, missing fields, and referral blockers before sending.",
    completeness: (score: number) => `Profile completeness ${score}%`,
    submittedTitle: "Provider-submitted information",
    submittedDescription:
      "These fields come from the provider profile draft. CaresLink does not assess provider quality, suitability, compliance, or outcomes.",
    missingFields: "Missing fields",
    generatedTitle: "AI-generated draft wording",
    generatedDescription:
      "Profile rewrite output is draft wording for provider review only. It is not a verification, endorsement, or advice workflow.",
    reviewTitle: "Needs provider review",
    reviewDescription:
      "Use missing fields and referral blockers as a review checklist before sharing the profile or generating materials.",
    promptsTitle: "Referral blocker prompts",
    fallbackPrompt:
      "Keep service area, language, intake path, and current capacity clear before sharing.",
    reviewReadiness: "Review referral blockers",
    improveWording: "Create pack drafts",
    importedTitle: "Imported provider profile draft",
    importedDescription: (draftId: string, source?: string) =>
      `This draft came from the CaresLink provider profile generator. Draft ID: ${draftId}${
        source ? ` - Source: ${source}` : ""
      }. Complete and review the details here before publishing or using generated materials.`,
    importedBadge: "Draft handoff",
  };
}

function getProfileWorkspaceActions(locale: Locale) {
  return locale === "zh-Hans"
    ? {
        completeProfile: "完善资料",
        viewReadiness: "查看转介阻碍",
        workspaceBack: "返回工作台",
        previewTitle: "工作区边界",
        sideTitle: "资料包来源",
        sideDescription: "当前服务商资料、下一步和边界说明。",
        actionsTitle: "主要操作",
        actionsDescription: "继续补全资料或检查转介阻碍。",
      }
    : {
        completeProfile: "Complete profile",
        viewReadiness: "View referral blockers",
        workspaceBack: "Back to workspace",
        previewTitle: "Workspace boundary",
        sideTitle: "Pack source overview",
        sideDescription: "Current provider profile, next steps, and boundary notes.",
        actionsTitle: "Primary actions",
        actionsDescription: "Continue profile completion or check referral blockers.",
      };
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatMultilineList(
  items: string[] | undefined,
  emptyPlaceholder: string,
) {
  return items && items.length > 0 ? items.join("\n") : emptyPlaceholder;
}

function isReceiveRelevant(direction: ReferralDirection) {
  return direction === "receive" || direction === "both";
}

function isSendRelevant(direction: ReferralDirection) {
  return direction === "send" || direction === "both";
}

function getEntityOptions(copy: ComponentCopy["basicProfile"]) {
  return [
    { value: "individual", label: copy.entityLabels.individual },
    { value: "organisation", label: copy.entityLabels.organisation },
  ];
}

function getDirectionOptions(copy: ComponentCopy["basicProfile"]) {
  return [
    { value: "receive", label: copy.directionLabels.receive },
    { value: "send", label: copy.directionLabels.send },
    { value: "both", label: copy.directionLabels.both },
  ];
}

function getLocalizedSummaryDescription(
  profile: ReferralProfile,
  copy: ComponentCopy["basicProfile"],
) {
  const summary = summarizeProfile(profile);

  return summary.descriptionNeedsReview
    ? copy.descriptionNeedsReview
    : summary.description;
}

function EntityIcon({ entityType }: { entityType: EntityType }) {
  const Icon = entityType === "organisation" ? Building2 : UserRound;

  return <Icon className="size-5 text-[#181715]" aria-hidden="true" />;
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "active" | "inactive";
}) {
  const tones = {
    neutral: "border-[#ded6c8] bg-[#fbfaf7] text-[#635f57]",
    active: "border-[#c9d8cf] bg-[#f3f8f4] text-[#334a3e]",
    inactive: "border-[#ded6c8] bg-white text-[#7c766d]",
  };

  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center rounded-md border px-2 py-1 text-xs font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function RelevanceBadge({
  relevant,
  copy,
}: {
  relevant: boolean;
  copy: ProfilePageCopy;
}) {
  return (
    <StatusPill tone={relevant ? "active" : "inactive"}>
      {relevant ? copy.relevantToProfile : copy.notUsedForDirection}
    </StatusPill>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
          <Icon className="size-5 shrink-0 text-[#635f57]" aria-hidden="true" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#635f57]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function BuilderSection({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[#e3ddd2] pt-5 first:border-t-0 first:pt-0">
      <SectionHeader
        icon={icon}
        title={title}
        description={description}
        action={action}
      />
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ReadOnlyTextField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <FieldLabel>
      <span>{label}</span>
      <TextInput
        readOnly
        value={value}
        className="cursor-default bg-[#fbfaf7] text-[#181715]"
      />
    </FieldLabel>
  );
}

function ReadOnlyTextAreaField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <FieldLabel>
      <span>{label}</span>
      <TextArea
        readOnly
        value={value}
        className={cx(
          "min-h-32 cursor-default resize-none bg-[#fbfaf7] text-[#181715]",
          className,
        )}
      />
    </FieldLabel>
  );
}

function ReadOnlySelectField({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <FieldLabel>
      <span>{label}</span>
      <SelectInput
        disabled
        value={value}
        className="cursor-default bg-[#fbfaf7] text-[#181715] disabled:opacity-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </FieldLabel>
  );
}

function ProfileBuilderPanel({
  profile,
  readinessHref,
  copy,
}: {
  profile: ReferralProfile;
  readinessHref: string;
  copy: ReferralWorkspaceCopy;
}) {
  const receiveRelevant = isReceiveRelevant(profile.referralDirection);
  const sendRelevant = isSendRelevant(profile.referralDirection);
  const profileCopy = copy.profile;
  const componentCopy = copy.components.basicProfile;
  const summaryDescription = getLocalizedSummaryDescription(
    profile,
    componentCopy,
  );
  const entityOptions = getEntityOptions(componentCopy);
  const directionOptions = getDirectionOptions(componentCopy);

  return (
    <Card className="p-5 shadow-[var(--shadow-md)] lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
            <EntityIcon entityType={profile.entityType} />
            {profileCopy.builderExample}
          </div>
          <h2 className="mt-2 break-words text-2xl font-semibold text-[#181715]">
            {profile.name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#635f57]">
            {profileCopy.builderDescription}
          </p>
        </div>
        <StatusPill tone="neutral">{copy.common.previewOnly}</StatusPill>
      </div>

      <div role="form" aria-label={profileCopy.formLabel} className="mt-6 grid gap-6">
        <BuilderSection
          icon={UserRound}
          title={profileCopy.identitySection}
          description={profileCopy.identityDescription}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlySelectField
              label={profileCopy.fields.entityType}
              value={profile.entityType}
              options={entityOptions}
            />
            <ReadOnlyTextField
              label={profileCopy.fields.profileName}
              value={profile.name}
            />
            <ReadOnlySelectField
              label={profileCopy.fields.referralDirection}
              value={profile.referralDirection}
              options={directionOptions}
            />
            <ReadOnlyTextField
              label={profileCopy.fields.lastUpdated}
              value={profile.updatedAt}
            />
            <div className="md:col-span-2">
              <ReadOnlyTextAreaField
                label={profileCopy.fields.profileSummary}
                value={summaryDescription}
              />
            </div>
          </div>
        </BuilderSection>

        <BuilderSection
          icon={MapPin}
          title={profileCopy.footprintSection}
          description={profileCopy.footprintDescription}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <ReadOnlyTextAreaField
              label={profileCopy.fields.serviceAreas}
              value={formatMultilineList(
                profile.serviceAreas,
                componentCopy.emptyPlaceholder,
              )}
              className="min-h-28"
            />
            <ReadOnlyTextAreaField
              label={profileCopy.fields.languages}
              value={formatMultilineList(
                profile.languages,
                componentCopy.emptyPlaceholder,
              )}
              className="min-h-28"
            />
            <ReadOnlyTextAreaField
              label={profileCopy.fields.referralFitNotes}
              value={formatMultilineList(
                profile.bestFit,
                componentCopy.emptyPlaceholder,
              )}
              className="min-h-28"
            />
          </div>
        </BuilderSection>

        <BuilderSection
          icon={ClipboardList}
          title={profileCopy.receiveSection}
          description={profileCopy.receiveDescription}
          action={<RelevanceBadge relevant={receiveRelevant} copy={profileCopy} />}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <ReadOnlyTextField
              label={profileCopy.fields.intakeMethod}
              value={
                profile.receive?.intakeMethod ?? componentCopy.emptyPlaceholder
              }
            />
            <ReadOnlyTextField
              label={profileCopy.fields.responseTime}
              value={
                profile.receive?.responseTime ?? componentCopy.emptyPlaceholder
              }
            />
            <ReadOnlyTextField
              label={profileCopy.fields.capacityStatus}
              value={
                profile.receive?.capacityStatus ?? componentCopy.emptyPlaceholder
              }
            />
          </div>
        </BuilderSection>

        <BuilderSection
          icon={Send}
          title={profileCopy.sendSection}
          description={profileCopy.sendDescription}
          action={<RelevanceBadge relevant={sendRelevant} copy={profileCopy} />}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ReadOnlyTextAreaField
              label={profileCopy.fields.handoverRequirements}
              value={formatMultilineList(
                profile.send?.handoverRequirements,
                componentCopy.emptyPlaceholder,
              )}
            />
            <div className="grid gap-4">
              <ReadOnlyTextField
                label={profileCopy.fields.followUpCadence}
                value={
                  profile.send?.followUpCadence ??
                  componentCopy.emptyPlaceholder
                }
              />
              <ReadOnlyTextField
                label={profileCopy.fields.consentReminder}
                value={
                  profile.send?.consentReminder ??
                  componentCopy.emptyPlaceholder
                }
              />
            </div>
          </div>
        </BuilderSection>

        <BuilderSection
          icon={Eye}
          title={profileCopy.previewBoundaryTitle}
          description={profileCopy.previewBoundaryDescription}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-4">
            <div className="flex max-w-3xl gap-3 text-sm leading-6 text-[#3f3b34]">
              <Info className="mt-1 size-5 shrink-0 text-[#635f57]" aria-hidden="true" />
              <p>{copy.common.trustBoundary}</p>
            </div>
            <ButtonLink
              href={readinessHref}
              variant="secondary"
            >
              {copy.common.continueToReadiness}
            </ButtonLink>
          </div>
        </BuilderSection>
      </div>
    </Card>
  );
}

function ProfileQualityPanel({
  profile,
  readinessHref,
  materialsHref,
  locale,
}: {
  profile: ReferralProfile;
  readinessHref: string;
  materialsHref: string;
  locale: Locale;
}) {
  const polishCopy = getProfilePolishCopy(locale);
  const audit = getHealthAudit(profile);
  const missingSignals = audit.signals.filter(
    (signal) => signal.status !== "good",
  );
  const topPrompts = audit.issues.slice(0, 3);

  return (
    <Card className="mt-6 p-5 shadow-[var(--shadow-md)] lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
            <ClipboardList className="size-5 text-[#635f57]" aria-hidden="true" />
            {polishCopy.qualityTitle}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#635f57]">
            {polishCopy.qualityDescription}
          </p>
        </div>
        <StatusPill tone={audit.score >= 70 ? "active" : "neutral"}>
          {polishCopy.completeness(audit.score)}
        </StatusPill>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-4">
          <p className="text-sm font-semibold text-[#181715]">
            {polishCopy.submittedTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#3f3b34]">
            {polishCopy.submittedDescription}
          </p>
        </div>
        <div className="rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-4">
          <p className="text-sm font-semibold text-[#181715]">
            {polishCopy.generatedTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#3f3b34]">
            {polishCopy.generatedDescription}
          </p>
        </div>
        <div className="rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-4">
          <p className="text-sm font-semibold text-[#181715]">
            {polishCopy.reviewTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#3f3b34]">
            {polishCopy.reviewDescription}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-lg border border-[#e3ddd2] bg-white p-4">
          <p className="text-sm font-semibold text-[#181715]">
            {polishCopy.missingFields}
          </p>
          <div className="mt-3 grid gap-2">
            {(missingSignals.length ? missingSignals : audit.signals.slice(0, 2))
              .slice(0, 4)
              .map((signal) => (
                <div
                  key={signal.id}
                  className="rounded-md border border-[#e3ddd2] bg-[#fbfaf7] px-3 py-2 text-sm text-[#3f3b34]"
                >
                  {signal.label}
                </div>
              ))}
          </div>
        </div>

        <div className="rounded-lg border border-[#e3ddd2] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
            <Sparkles className="size-5 text-[#635f57]" aria-hidden="true" />
            {polishCopy.promptsTitle}
          </div>
          <div className="mt-3 grid gap-2">
            {(topPrompts.length
              ? topPrompts.map((issue) => issue.guidance)
              : [polishCopy.fallbackPrompt]
            ).map((prompt) => (
              <p
                key={prompt}
                className="rounded-md border border-[#e3ddd2] bg-[#fbfaf7] px-3 py-2 text-sm leading-6 text-[#3f3b34]"
              >
                {prompt}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <ButtonLink href={readinessHref} variant="secondary">
          {polishCopy.reviewReadiness}
        </ButtonLink>
        <ButtonLink href={materialsHref}>{polishCopy.improveWording}</ButtonLink>
      </div>
    </Card>
  );
}

function ImportedDraftBanner({
  draftId,
  source,
  locale,
}: {
  draftId: string;
  source?: string;
  locale: Locale;
}) {
  const polishCopy = getProfilePolishCopy(locale);

  return (
    <Card className="mb-6 border-[#d8d0c1] bg-[#fbfaf7] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Info className="mt-1 size-5 shrink-0 text-[#635f57]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#181715]">
              {polishCopy.importedTitle}
            </p>
            <p className="mt-1 text-sm leading-6 text-[#3f3b34]">
              {polishCopy.importedDescription(draftId, source)}
            </p>
          </div>
        </div>
        <span className="inline-flex min-h-7 items-center rounded-md border border-[#ded6c8] bg-white px-2 py-1 text-xs font-semibold text-[#635f57]">
          {polishCopy.importedBadge}
        </span>
      </div>
    </Card>
  );
}

export default async function ReferralProfilePage({
  searchParams,
}: ReferralProfilePageProps) {
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
            "/referral-workspace/profile",
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
  const draftId = handoff.draftId;
  const providerDraftStore = getProviderDraftStore();
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
  const withHandoff = (href: string) =>
    withProviderGeneratorHandoff(href, handoff);
  const signedInHref = (href: string) => {
    const localizedHref = withLocale(withHandoff(href), locale);

    return gate.source === "demo"
      ? withWorkspaceAccount(localizedHref, accountId)
      : localizedHref;
  };
  const primaryProfile = resolvedDraft
    ? mapPublicProviderDraftToProfile(resolvedDraft.draft, accountId)
    : getReferralProfileForWorkspaceAccount({
        ownerUserId: gate.account.id,
        name: gate.account.name,
      });
  const primarySummary = summarizeProfile(primaryProfile);
  const workspaceActions = getProfileWorkspaceActions(locale);

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withWorkspaceAccount(
        withHandoff("/referral-workspace/profile"),
        gate.source === "demo" ? accountId : undefined,
      )}
      workspaceAccountId={gate.source === "demo" ? accountId : undefined}
      workspaceRole={gate.account.role}
      workspaceSessionSource={gate.source}
    >
      {localDraftPersister}
      <header className="mb-4 border-b border-[#ded6c8] pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#0f766e]">
              {copy.profile.eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#181715] sm:text-3xl">
              {copy.profile.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#40504b]">
              {copy.profile.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={signedInHref("/referral-workspace/profile")}>
              {workspaceActions.completeProfile}
            </ButtonLink>
            <ButtonLink
              href={signedInHref("/referral-workspace/health")}
              variant="secondary"
            >
              {workspaceActions.viewReadiness}
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </div>
      </header>

      <WorkspaceGrid
        main={
          <WorkspaceMainPanel>
            <WorkspaceSection title={workspaceActions.previewTitle}>
              <div className="flex items-start gap-3">
                <Eye className="mt-1 size-5 shrink-0 text-[#635f57]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-[#181715]">
                    {copy.common.previewOnly}
                  </p>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-[#3f3b34]">
                    {copy.profile.noPersistence}
                  </p>
                </div>
              </div>
            </WorkspaceSection>

            {draftId ? (
              <ImportedDraftBanner
                draftId={draftId}
                source={handoff.source}
                locale={locale}
              />
            ) : null}

            <ProfileBuilderPanel
              profile={primaryProfile}
              readinessHref={signedInHref("/referral-workspace/health")}
              copy={copy}
            />

            <ReferralRoleChecklistPanel
              summary={primarySummary}
              locale={locale}
              className="mt-6"
            />

            <ProfileQualityPanel
              profile={primaryProfile}
              readinessHref={signedInHref("/referral-workspace/health")}
              materialsHref={signedInHref("/referral-workspace/materials")}
              locale={locale}
            />
          </WorkspaceMainPanel>
        }
        rightRail={
          <WorkspaceRightRail>
            <WorkspaceSection
              title={workspaceActions.sideTitle}
              description={workspaceActions.sideDescription}
            >
              <BasicProfileCard
                summary={primarySummary}
                locale={locale}
              />
            </WorkspaceSection>
            <WorkspaceSection
              title={workspaceActions.actionsTitle}
              description={workspaceActions.actionsDescription}
            >
              <div className="grid gap-2">
                <ButtonLink href={signedInHref("/referral-workspace/profile")}>
                  {workspaceActions.completeProfile}
                </ButtonLink>
                <ButtonLink
                  href={signedInHref("/referral-workspace/health")}
                  variant="secondary"
                >
                  {workspaceActions.viewReadiness}
                </ButtonLink>
                <ButtonLink
                  href={signedInHref("/referral-workspace")}
                  variant="secondary"
                >
                  {workspaceActions.workspaceBack}
                </ButtonLink>
              </div>
            </WorkspaceSection>
            <WorkspaceSection title={workspaceActions.previewTitle}>
              <TrustBoundaryNotice className="border-0 bg-transparent p-0" locale={locale} />
            </WorkspaceSection>
          </WorkspaceRightRail>
        }
      />
    </AppShell>
  );
}
