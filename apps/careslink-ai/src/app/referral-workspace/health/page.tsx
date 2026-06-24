import {
  ArrowRight,
  ClipboardList,
  FileText,
  Info,
  KeyRound,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  BasicProfileCard,
  HealthScorePanel,
  HealthSignalsTable,
  TopIssuesPanel,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink, Card, MetricCard } from "@/components/ui";
import {
  getHealthAudit,
  getReferralProfile,
  summarizeProfile,
} from "@/lib/referral-profile-workspace";
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
  const profile = getReferralProfile("profile-alex-lee");
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const issueCount = audit.issues.length;
  const highPriorityCount = audit.issues.filter(
    (issue) => issue.priority === "high",
  ).length;

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref="/referral-workspace/health"
    >
      <PageHeader
        eyebrow={copy.health.eyebrow}
        title={copy.health.title}
        description={copy.health.description}
        actions={
          <>
            <ButtonLink href={withLocale("/referral-workspace/profile", locale)}>
              {copy.health.profileBuilder} <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink
              href={withLocale("/referral-workspace/materials", locale)}
              variant="secondary"
            >
              {copy.health.materialsPreview}
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <BasicProfileCard summary={summary} locale={locale} />
        <HealthScorePanel audit={audit} locale={locale} />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
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

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="p-5">
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
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                <ArrowRight className="size-5" aria-hidden="true" />
                {copy.health.nextStepFlowTitle}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                {copy.health.nextStepFlowDescription}
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md border border-[#dce8e2] bg-[#f8fbfa] px-2.5 py-1 text-xs font-semibold text-[#40504b]">
              {copy.common.previewOnly}
            </span>
          </div>

          <ol className="mt-5 grid gap-3">
            {nextSteps.map((step, index) => {
              const stepCopy = copy.health.nextSteps[step.key];

              return (
              <li key={step.href}>
                <a
                  href={withLocale(step.href, locale)}
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
        </Card>
      </div>

      <section className="mt-6">
        <TopIssuesPanel audit={audit} limit={6} locale={locale} />
      </section>

      <section className="mt-6">
        <HealthSignalsTable audit={audit} locale={locale} />
      </section>

      <TrustBoundaryNotice className="mt-6" locale={locale} />
    </AppShell>
  );
}
