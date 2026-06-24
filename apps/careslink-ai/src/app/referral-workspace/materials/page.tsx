import {
  ArrowRight,
  CheckCircle2,
  FileText,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  AccessStatusPanel,
  AgentQueuePanel,
  GuidedCopilotPanel,
  LockedMaterialsGrid,
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

type MaterialsSearchParams = {
  access?: string | string[];
};

type ReferralMaterialsPageProps = {
  searchParams?: Promise<MaterialsSearchParams>;
};

type AccessState = ReturnType<typeof getAccessState>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hasDemoAccessCode(searchParams: MaterialsSearchParams | undefined) {
  return firstParam(searchParams?.access) === "code";
}

function ModeStatusCard({
  accessState,
  hasDemoAccess,
}: {
  accessState: AccessState;
  hasDemoAccess: boolean;
}) {
  const remainingQuota = Math.max(
    0,
    accessState.dailyQuota - accessState.usedToday,
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            {hasDemoAccess ? (
              <CheckCircle2 className="size-5" aria-hidden="true" />
            ) : (
              <LockKeyhole className="size-5" aria-hidden="true" />
            )}
            Current materials mode
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[#17211f]">
            {hasDemoAccess
              ? "Access-code guided preview"
              : "Free preview without an access code"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
            {hasDemoAccess
              ? "This demo route uses the approved access state so guided drafting steps, unlocked materials, and quota state are visible."
              : "This route shows the default free state: material previews are visible, while guided drafting remains gated behind an access code."}
          </p>
        </div>
        <span
          className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
            hasDemoAccess
              ? "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]"
              : "border-[#f4d28f] bg-[#fff7df] text-[#925b00]"
          }`}
        >
          {hasDemoAccess ? "user-approved" : "user-free"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <p className="text-xs font-semibold text-[#65736f]">Access code</p>
          <p className="mt-1 text-sm font-semibold text-[#17211f]">
            {accessState.hasAccessCode ? "Active for demo" : "Not present"}
          </p>
        </div>
        <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <p className="text-xs font-semibold text-[#65736f]">Guided quota</p>
          <p className="mt-1 text-sm font-semibold text-[#17211f]">
            {accessState.usedToday} used / {accessState.dailyQuota} daily
          </p>
        </div>
        <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <p className="text-xs font-semibold text-[#65736f]">Remaining today</p>
          <p className="mt-1 text-sm font-semibold text-[#17211f]">
            {remainingQuota}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {hasDemoAccess ? (
          <>
            <ButtonLink href="/referral-workspace/materials" variant="secondary">
              View free preview
            </ButtonLink>
            <ButtonLink href="/referral-workspace/access">
              Access request preview
            </ButtonLink>
          </>
        ) : (
          <>
            <ButtonLink href="/referral-workspace/access">
              Request access <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink
              href="/referral-workspace/materials?access=code"
              variant="secondary"
            >
              Try access-code demo
            </ButtonLink>
          </>
        )}
      </div>
    </Card>
  );
}

function DeterministicPreviewNotice({
  hasDemoAccess,
}: {
  hasDemoAccess: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
        <ShieldCheck className="size-5" aria-hidden="true" />
        Deterministic UI preview
      </div>
      <div className="mt-4 grid gap-3">
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <MessageSquareText
            className="mt-1 size-4 shrink-0 text-[#19518d]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#40504b]">
            No OpenAI API call, generation, submission, or live drafting action
            is running in this slice. The text shown here is seeded,
            deterministic interface content.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <FileText
            className="mt-1 size-4 shrink-0 text-[#0f766e]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#40504b]">
            {hasDemoAccess
              ? "Guided steps are visible for access-code review, but users still review and control any future drafted material."
              : "Free preview keeps material requirements visible while showing exactly where access-code gating applies."}
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <KeyRound
            className="mt-1 size-4 shrink-0 text-[#925b00]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#40504b]">
            Access state does not signal endorsement, certification, clinical
            review, compliance approval, or any guaranteed referral outcome.
          </p>
        </div>
      </div>
    </Card>
  );
}

export default async function ReferralMaterialsPage({
  searchParams,
}: ReferralMaterialsPageProps) {
  const resolvedSearchParams = await searchParams;
  const hasDemoAccess = hasDemoAccessCode(resolvedSearchParams);
  const profile = getReferralProfile("profile-alex-lee");
  const accessState = getAccessState(
    hasDemoAccess ? "user-approved" : "user-free",
  );
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const queue = getAgentQueueForAccess(accessState);
  const materials = getLockedMaterials(profile.referralDirection, accessState);

  return (
    <AppShell>
      <PageHeader
        eyebrow={hasDemoAccess ? "Materials demo access" : "Materials free preview"}
        title="Guided referral materials"
        description={
          hasDemoAccess
            ? "Access-code demo mode shows guided drafting availability, unlocked materials, and quota state without running live generation."
            : "Free mode shows material previews, gated guided drafting, and a clear path to the access-code application preview."
        }
        actions={
          <>
            <ButtonLink href="/referral-workspace/health" variant="secondary">
              Readiness audit
            </ButtonLink>
            {hasDemoAccess ? (
              <ButtonLink href="/referral-workspace/materials" variant="secondary">
                Free preview
              </ButtonLink>
            ) : (
              <ButtonLink
                href="/referral-workspace/materials?access=code"
                variant="secondary"
              >
                Access demo
              </ButtonLink>
            )}
            <ButtonLink href="/referral-workspace/access">
              Access <ArrowRight className="size-4" />
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ModeStatusCard
          accessState={accessState}
          hasDemoAccess={hasDemoAccess}
        />
        <DeterministicPreviewNotice hasDemoAccess={hasDemoAccess} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
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
