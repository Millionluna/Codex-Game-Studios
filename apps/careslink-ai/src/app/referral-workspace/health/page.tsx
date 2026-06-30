import {
  ArrowRight,
  ClipboardList,
  FileText,
  Info,
  KeyRound,
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
  HealthScorePanel,
  HealthSignalsTable,
  TopIssuesPanel,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink, MetricCard } from "@/components/ui";
import {
  getHealthAudit,
  getReferralProfileForWorkspaceAccount,
  summarizeProfile,
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
} from "@/lib/referral-workspace-i18n";

const nextSteps = [
  {
    key: "profile",
    href: "/referral-workspace/profile",
    icon: UserRound,
  },
  {
    key: "materials",
    href: "/referral-workspace/materials",
    icon: FileText,
  },
  {
    key: "access",
    href: "/referral-workspace/access",
    icon: KeyRound,
  },
] as const;

function getHealthWorkspaceActions(locale: "en" | "zh-Hans") {
  return locale === "zh-Hans"
    ? {
        completeReferral: "补全资料包来源",
        reviewMaterials: "查看资料包草稿",
        profileContext: "资料包来源",
        nextStepsTitle: "下一步转介动作",
        boundaryTitle: "边界说明",
      }
    : {
        completeReferral: "Complete pack source details",
        reviewMaterials: "Review pack drafts",
        profileContext: "Pack source details",
        nextStepsTitle: "Next referral action",
        boundaryTitle: "Boundary note",
      };
}

type ReferralWorkspaceSearchParams = {
  [key: string]: string | string[] | undefined;
};

type ReferralHealthPageProps = {
  searchParams?: Promise<ReferralWorkspaceSearchParams>;
};

export default async function ReferralHealthPage({
  searchParams,
}: ReferralHealthPageProps) {
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
            "/referral-workspace/health",
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
  const profile = resolvedDraft
    ? mapPublicProviderDraftToProfile(resolvedDraft.draft, accountId)
    : getReferralProfileForWorkspaceAccount({
        ownerUserId: gate.account.id,
        name: gate.account.name,
      });
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const issueCount = audit.issues.length;
  const highPriorityCount = audit.issues.filter(
    (issue) => issue.priority === "high",
  ).length;
  const workspaceActions = getHealthWorkspaceActions(locale);

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withWorkspaceAccount(
        withHandoff("/referral-workspace/health"),
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
              {copy.health.eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#181715] sm:text-3xl">
              {copy.health.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#40504b]">
              {copy.health.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={signedInHref("/referral-workspace/profile")}>
              {workspaceActions.completeReferral}
            </ButtonLink>
            <ButtonLink
              href={signedInHref("/referral-workspace/materials")}
              variant="secondary"
            >
              {workspaceActions.reviewMaterials}
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </div>
      </header>

      <WorkspaceGrid
        main={
          <WorkspaceMainPanel>
            <HealthScorePanel audit={audit} locale={locale} />

            <section className="grid gap-4 md:grid-cols-3">
              <MetricCard
                label={copy.health.metrics.signalsReviewed.label}
                value={`${audit.signals.length}`}
                detail={copy.health.metrics.signalsReviewed.detail}
                tone="teal"
              />
              <MetricCard
                label={copy.health.metrics.openIssues.label}
                value={`${issueCount}`}
                detail={copy.health.metrics.openIssues.detail}
                tone={issueCount > 0 ? "amber" : "blue"}
              />
              <MetricCard
                label={copy.health.metrics.highPriority.label}
                value={`${highPriorityCount}`}
                detail={copy.health.metrics.highPriority.detail}
                tone={highPriorityCount > 0 ? "amber" : "slate"}
              />
            </section>

            <WorkspaceSection title={copy.health.scoreMeaningTitle}>
              <div className="flex items-start gap-3">
                <Info className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                    <ClipboardList className="size-5" aria-hidden="true" />
                    {copy.health.scoreMeaningTitle}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#40504b]">
                    {copy.health.scoreMeaning}
                  </p>
                </div>
              </div>
            </WorkspaceSection>

            <TopIssuesPanel audit={audit} limit={6} locale={locale} />
            <HealthSignalsTable audit={audit} locale={locale} />
          </WorkspaceMainPanel>
        }
        rightRail={
          <WorkspaceRightRail>
            <WorkspaceSection title={workspaceActions.profileContext}>
              <BasicProfileCard summary={summary} locale={locale} />
            </WorkspaceSection>
            <WorkspaceSection
              title={workspaceActions.nextStepsTitle}
              description={copy.health.nextStepFlowDescription}
              action={
                <span className="inline-flex min-h-8 items-center rounded-md border border-[#dce8e2] bg-[#f8fbfa] px-2.5 py-1 text-xs font-semibold text-[#40504b]">
                  {copy.common.previewOnly}
                </span>
              }
            >
              <ol className="grid gap-3">
                {nextSteps.map((step, index) => {
                  const stepCopy = copy.health.nextSteps[step.key];

                  return (
                    <li key={step.href}>
                      <a
                        href={signedInHref(step.href)}
                        className="grid min-h-20 grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3 transition hover:border-[#9ed8c9] hover:bg-[#eef7f3]"
                      >
                        <span className="flex size-8 items-center justify-center rounded-lg bg-white text-xs font-semibold text-[#0f766e]">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
                            <step.icon className="size-4 shrink-0 text-[#0f766e]" aria-hidden="true" />
                            {stepCopy.label}
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-[#65736f]">
                            {stepCopy.detail}
                          </span>
                        </span>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-[#91a09b]" aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ol>
            </WorkspaceSection>
            <WorkspaceSection title={workspaceActions.boundaryTitle}>
              <TrustBoundaryNotice className="border-0 bg-transparent p-0" locale={locale} />
            </WorkspaceSection>
          </WorkspaceRightRail>
        }
      />
    </AppShell>
  );
}
