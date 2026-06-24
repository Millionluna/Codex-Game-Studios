import { ArrowRight, CircleGauge, FileText, KeyRound, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  AccessStatusPanel,
  AgentQueuePanel,
  BasicProfileCard,
  GuidedCopilotPanel,
  HealthScorePanel,
  HealthSignalsTable,
  LockedMaterialsGrid,
  TopIssuesPanel,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink, Card } from "@/components/ui";
import {
  getAccessState,
  getAgentQueueForAccess,
  getHealthAudit,
  getLockedMaterials,
  getReferralProfile,
  summarizeProfile,
} from "@/lib/referral-profile-workspace";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
} from "@/lib/referral-workspace-i18n";

const routeLinks = [
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

type ReferralWorkspacePageProps = {
  searchParams?: Promise<ReferralWorkspaceSearchParams>;
};

export default async function ReferralWorkspacePage({
  searchParams,
}: ReferralWorkspacePageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const profile = getReferralProfile("profile-alex-lee");
  const accessState = getAccessState("user-free");
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const materials = getLockedMaterials(profile.referralDirection, accessState);
  const queue = getAgentQueueForAccess(accessState);

  return (
    <AppShell locale={locale} languageSwitcherHref="/referral-workspace">
      <PageHeader
        eyebrow={copy.workspace.eyebrow}
        title={copy.workspace.title}
        description={copy.workspace.description}
        actions={
          <>
            <ButtonLink href={withLocale("/referral-workspace/access", locale)}>
              {copy.workspace.requestAccess} <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink
              href={withLocale("/admin/access-requests", locale)}
              variant="secondary"
            >
              {copy.workspace.accessRequests}
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-5 md:grid-cols-2">
          <BasicProfileCard summary={summary} locale={locale} />
          <HealthScorePanel audit={audit} locale={locale} />
        </div>

        <div className="grid gap-5">
          <AccessStatusPanel accessState={accessState} locale={locale} />
          <GuidedCopilotPanel
            accessState={accessState}
            queue={queue}
            summary={summary}
            audit={audit}
            locale={locale}
          />
        </div>
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <TopIssuesPanel audit={audit} locale={locale} />
        <AgentQueuePanel
          queue={queue}
          accessState={accessState}
          locale={locale}
        />
      </div>

      <section className="mt-6">
        <LockedMaterialsGrid
          materials={materials}
          accessState={accessState}
          locale={locale}
        />
      </section>

      <section className="mt-6">
        <HealthSignalsTable audit={audit} locale={locale} />
      </section>

      <TrustBoundaryNotice className="mt-6" locale={locale} />

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <ArrowRight className="size-5" aria-hidden="true" />
              {copy.workspace.plannedRoutesTitle}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
              {copy.workspace.plannedRoutesDescription}
            </p>
          </div>
          <ButtonLink
            href={withLocale("/admin/access-requests", locale)}
            variant="secondary"
          >
            {copy.workspace.adminAccessQueue}
          </ButtonLink>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {routeLinks.map((link) => {
            const routeCopy = copy.workspace.routes[link.key];

            return (
            <a
              key={link.href}
              href={withLocale(link.href, locale)}
              className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4 transition hover:border-[#9ed8c9] hover:bg-[#eef7f3]"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
                <link.icon className="size-4 text-[#0f766e]" aria-hidden="true" />
                {routeCopy.label}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                {routeCopy.detail}
              </p>
            </a>
            );
          })}
        </div>
      </Card>
    </AppShell>
  );
}
