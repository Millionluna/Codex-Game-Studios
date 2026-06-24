import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  AccessStatusPanel,
  AgentQueuePanel,
  GuidedCopilotPanel,
  LockedMaterialsGrid,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink } from "@/components/ui";
import {
  getAccessState,
  getAgentQueueForAccess,
  getHealthAudit,
  getLockedMaterials,
  getReferralProfile,
  summarizeProfile,
} from "@/lib/referral-profile-workspace";

export default function ReferralMaterialsPage() {
  const profile = getReferralProfile("profile-alex-lee");
  const accessState = getAccessState("user-free");
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const queue = getAgentQueueForAccess(accessState);
  const materials = getLockedMaterials(profile.referralDirection, accessState);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Materials preview"
        title="Guided referral materials"
        description="Preview share cards, profile text, intake prompts, and guided drafting steps. Guided generation remains locked until an access code is active."
        actions={
          <>
            <ButtonLink href="/referral-workspace/health" variant="secondary">
              Readiness audit
            </ButtonLink>
            <ButtonLink href="/referral-workspace/access">
              Access <ArrowRight className="size-4" />
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-5">
          <AccessStatusPanel accessState={accessState} />
          <AgentQueuePanel queue={queue} accessState={accessState} />
        </div>
        <GuidedCopilotPanel
          accessState={accessState}
          queue={queue}
          summary={summary}
          audit={audit}
        />
      </div>

      <section className="mt-6">
        <LockedMaterialsGrid materials={materials} accessState={accessState} />
      </section>

      <TrustBoundaryNotice className="mt-6" />
    </AppShell>
  );
}
