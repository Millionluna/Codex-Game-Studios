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

const routeLinks = [
  {
    href: "/referral-workspace/profile",
    label: "Profile",
    detail: "Edit self-submitted referral communication fields.",
    icon: UserRound,
  },
  {
    href: "/referral-workspace/health",
    label: "Readiness",
    detail: "Review completeness signals and priority gaps.",
    icon: CircleGauge,
  },
  {
    href: "/referral-workspace/materials",
    label: "Materials",
    detail: "Preview share cards, handover copy, and intake prompts.",
    icon: FileText,
  },
  {
    href: "/referral-workspace/access",
    label: "Access",
    detail: "Request or enter an access code for guided drafting.",
    icon: KeyRound,
  },
];

export default function ReferralWorkspacePage() {
  const profile = getReferralProfile("profile-alex-lee");
  const accessState = getAccessState("user-free");
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const materials = getLockedMaterials(profile.referralDirection, accessState);
  const queue = getAgentQueueForAccess(accessState);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Referral Profile Workspace v0.1"
        title="Alex Lee referral profile"
        description="A free preview of referral communication completeness. Guided AI drafting is visible as previews and remains locked until an access code is active."
        actions={
          <>
            <ButtonLink href="/referral-workspace/access">
              Request access <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/admin/access-requests" variant="secondary">
              Access requests
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-5 md:grid-cols-2">
          <BasicProfileCard summary={summary} />
          <HealthScorePanel audit={audit} />
        </div>

        <div className="grid gap-5">
          <AccessStatusPanel accessState={accessState} />
          <GuidedCopilotPanel
            accessState={accessState}
            queue={queue}
            summary={summary}
            audit={audit}
          />
        </div>
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <TopIssuesPanel audit={audit} />
        <AgentQueuePanel queue={queue} accessState={accessState} />
      </div>

      <section className="mt-6">
        <LockedMaterialsGrid materials={materials} accessState={accessState} />
      </section>

      <section className="mt-6">
        <HealthSignalsTable audit={audit} />
      </section>

      <TrustBoundaryNotice className="mt-6" />

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <ArrowRight className="size-5" aria-hidden="true" />
              Planned workspace routes
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
              These links show the intended navigation for profile editing,
              readiness review, guided material previews, access-code entry,
              and pilot access administration.
            </p>
          </div>
          <ButtonLink href="/admin/access-requests" variant="secondary">
            Admin access queue
          </ButtonLink>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {routeLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4 transition hover:border-[#9ed8c9] hover:bg-[#eef7f3]"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
                <link.icon className="size-4 text-[#0f766e]" aria-hidden="true" />
                {link.label}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                {link.detail}
              </p>
            </a>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
