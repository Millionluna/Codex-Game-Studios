import {
  ArrowRight,
  ClipboardList,
  KeyRound,
  Link2,
  LockKeyhole,
  Send,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  AccessStatusPanel,
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
  getAccessState,
  getReferralProfile,
  summarizeProfile,
} from "@/lib/referral-profile-workspace";

const accessCodeTypes = [
  "Provider Pilot",
  "Referral Source Pilot",
  "Dual Role Pilot",
  "Internal Test",
  "Partner Batch",
];

function PreviewInput({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>
        <span>{label}</span>
        <TextInput defaultValue={value} readOnly aria-readonly="true" />
      </FieldLabel>
    </div>
  );
}

function PreviewSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <FieldLabel>
      <span>{label}</span>
      <SelectInput defaultValue={value} disabled aria-disabled="true">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </SelectInput>
    </FieldLabel>
  );
}

function PreviewTextArea({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>
        <span>{label}</span>
        <TextArea defaultValue={value} readOnly aria-readonly="true" />
      </FieldLabel>
    </div>
  );
}

function WhyAccessCodePanel() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
        <ShieldCheck className="size-5" aria-hidden="true" />
        Why access codes exist
      </div>
      <p className="mt-2 text-sm leading-6 text-[#65736f]">
        The pilot uses access codes to keep guided AI drafting controlled while
        the workspace is still an invite-based preview.
      </p>

      <div className="mt-5 grid gap-3">
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <KeyRound className="mt-1 size-4 shrink-0 text-[#0f766e]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[#40504b]">
            Control AI cost with a small daily guided drafting quota.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <LockKeyhole className="mt-1 size-4 shrink-0 text-[#925b00]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[#40504b]">
            Reduce abuse, multi-account scraping, and automated extraction of
            pilot materials.
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <Link2 className="mt-1 size-4 shrink-0 text-[#19518d]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[#40504b]">
            Keep the first pilot invite-based until review and support flows
            are ready for broader access.
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function ReferralAccessPage() {
  const profile = getReferralProfile("profile-alex-lee");
  const summary = summarizeProfile(profile);
  const accessState = getAccessState("user-free");
  const approvedAccessState = getAccessState("user-approved");
  const expectedDailyQuota = `${approvedAccessState.dailyQuota} guided drafting actions per day`;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Access preview"
        title="Access code application preview"
        description="A form-like, non-submitting preview for requesting guided AI drafting access. No request is submitted, reviewed, or queued from this page."
        actions={
          <>
            <ButtonLink
              href="/referral-workspace/materials?access=code"
              variant="secondary"
            >
              Materials demo
            </ButtonLink>
            <ButtonLink href="/admin/access-requests">
              Admin queue <ArrowRight className="size-4" />
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="grid gap-5">
          <AccessStatusPanel accessState={accessState} />
          <WhyAccessCodePanel />
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                <KeyRound className="size-5" aria-hidden="true" />
                Application fields
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                These disabled fields show what the first access-code request
                could collect for pilot review. They are seeded preview values,
                not submitted form data.
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md border border-[#f4d28f] bg-[#fff7df] px-2.5 py-1 text-xs font-semibold text-[#925b00]">
              Preview only: no submit
            </span>
          </div>

          <form
            aria-label="Access code application preview"
            className="mt-5 grid gap-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <PreviewInput label="Profile" value={summary.title} />
              <PreviewInput label="Entity type" value={summary.entityLabel} />
              <PreviewInput
                label="Referral direction"
                value={summary.directionLabel}
              />
              <PreviewSelect
                label="Requested code type"
                value="Provider Pilot"
                options={accessCodeTypes}
              />
              <PreviewInput
                label="Source/invite"
                value="Invite from referral workspace pilot"
              />
              <PreviewInput
                label="Expected daily quota"
                value={expectedDailyQuota}
              />
            </div>

            <PreviewTextArea
              label="Reason"
              value="Prepare guided referral communication materials from submitted profile details while keeping preview content clearly separate from live generation."
            />
            <PreviewTextArea
              label="Abuse and cost control note"
              value="Access codes limit guided drafting quota, reduce automated scraping or multi-account abuse, and keep the v0.1 pilot invite-based."
            />
          </form>

          <div className="mt-5 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
              <ClipboardList className="size-4 text-[#0f766e]" aria-hidden="true" />
              Preview request state
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65736f]">
              This page does not create an access request, send email, call
              OpenAI, or enqueue an admin review. It only previews the first
              version of the application surface.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled
              className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-[#eef3f1] px-4 text-sm font-semibold text-[#65736f]"
            >
              <Send className="size-4" aria-hidden="true" />
              Preview only - request not submitted
            </button>
            <ButtonLink
              href="/referral-workspace/materials?access=code"
              variant="secondary"
            >
              View access-code materials demo
            </ButtonLink>
            <ButtonLink href="/admin/access-requests" variant="secondary">
              Open admin queue
            </ButtonLink>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <Link2 className="size-5" aria-hidden="true" />
              Preview destinations
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
              Use these links to compare the no-code materials preview, the
              access-code materials demo, and the seeded admin queue without
              changing live access state.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/referral-workspace/materials" variant="secondary">
              Free materials
            </ButtonLink>
            <ButtonLink href="/referral-workspace/materials?access=code">
              Access-code demo <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </div>
      </Card>

      <TrustBoundaryNotice className="mt-6" />
    </AppShell>
  );
}
