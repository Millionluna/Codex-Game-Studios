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

const nextSteps = [
  {
    href: "/referral-workspace/profile",
    label: "Profile builder",
    detail:
      "Review the self-submitted fields that affect referral communication readiness.",
    icon: UserRound,
  },
  {
    href: "/referral-workspace/materials",
    label: "Materials preview",
    detail:
      "Preview profile copy, share cards, and intake prompts from the current fields.",
    icon: FileText,
  },
  {
    href: "/referral-workspace/access",
    label: "Access request",
    detail:
      "View the pilot access request state. Submission and guided drafting are not live here.",
    icon: KeyRound,
  },
];

export default function ReferralHealthPage() {
  const profile = getReferralProfile("profile-alex-lee");
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const issueCount = audit.issues.length;
  const highPriorityCount = audit.issues.filter(
    (issue) => issue.priority === "high",
  ).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Free diagnostic report"
        title="Referral Profile Health Audit"
        description="A readiness audit for Alex Lee's free profile preview. It highlights profile completeness and referral communication gaps only."
        actions={
          <>
            <ButtonLink href="/referral-workspace/profile">
              Profile builder <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/referral-workspace/materials" variant="secondary">
              Materials preview
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <BasicProfileCard summary={summary} />
        <HealthScorePanel audit={audit} />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Signals reviewed"
          value={`${audit.signals.length}`}
          detail="Profile fields checked for communication completeness."
          tone="teal"
        />
        <MetricCard
          label="Open issues"
          value={`${issueCount}`}
          detail="Gaps sorted by priority for this profile."
          tone={issueCount > 0 ? "amber" : "blue"}
        />
        <MetricCard
          label="High priority"
          value={`${highPriorityCount}`}
          detail="Items to address before relying on the profile for referral conversations."
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
                What this score means
              </div>
              <p className="mt-3 text-sm leading-6 text-[#40504b]">
                The score measures referral communication readiness and profile
                completeness for this submitted profile. It checks whether a
                referrer has enough context about scope, contact path, timing,
                availability, and missing fields to continue a referral
                conversation.
              </p>
              <p className="mt-3 text-sm leading-6 text-[#65736f]">
                It does not assess provider quality, service outcomes, clinical
                matters, regulatory compliance, or professional advice.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                <ArrowRight className="size-5" aria-hidden="true" />
                Next-step flow
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                Use the audit to choose what to update, then review preview
                materials and the access request screen.
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md border border-[#dce8e2] bg-[#f8fbfa] px-2.5 py-1 text-xs font-semibold text-[#40504b]">
              Preview only
            </span>
          </div>

          <ol className="mt-5 grid gap-3">
            {nextSteps.map((step, index) => (
              <li key={step.href}>
                <a
                  href={step.href}
                  className="grid min-h-20 grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3 transition hover:border-[#9ed8c9] hover:bg-[#eef7f3]"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-white text-xs font-semibold text-[#0f766e]">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
                      <step.icon className="size-4 shrink-0 text-[#0f766e]" aria-hidden="true" />
                      {step.label}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[#65736f]">
                      {step.detail}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-[#91a09b]" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <section className="mt-6">
        <TopIssuesPanel audit={audit} limit={6} />
      </section>

      <section className="mt-6">
        <HealthSignalsTable audit={audit} />
      </section>

      <TrustBoundaryNotice className="mt-6" />
    </AppShell>
  );
}
