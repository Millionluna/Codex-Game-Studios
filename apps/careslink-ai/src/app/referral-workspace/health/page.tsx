import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  HealthScorePanel,
  HealthSignalsTable,
  TopIssuesPanel,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink } from "@/components/ui";
import {
  getHealthAudit,
  getReferralProfile,
} from "@/lib/referral-profile-workspace";

export default function ReferralHealthPage() {
  const profile = getReferralProfile("profile-alex-lee");
  const audit = getHealthAudit(profile);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Readiness audit"
        title="Referral communication readiness"
        description="A field-level audit of profile completeness and referral communication gaps. This is not a provider quality, clinical suitability, compliance, or outcome assessment."
        actions={
          <>
            <ButtonLink href="/referral-workspace/profile" variant="secondary">
              Profile
            </ButtonLink>
            <ButtonLink href="/referral-workspace/materials">
              Materials <ArrowRight className="size-4" />
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <HealthScorePanel audit={audit} />
        <TopIssuesPanel audit={audit} limit={6} />
      </div>

      <section className="mt-6">
        <HealthSignalsTable audit={audit} />
      </section>

      <TrustBoundaryNotice className="mt-6" />
    </AppShell>
  );
}
