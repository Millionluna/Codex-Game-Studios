import { Building2, ClipboardList, Eye, Send, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  BasicProfileCard,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink, Card } from "@/components/ui";
import {
  getSeedReferralProfiles,
  summarizeProfile,
  type ReferralDirection,
  type ReferralProfile,
} from "@/lib/referral-profile-workspace";

const directionHelp: Record<ReferralDirection, string> = {
  receive:
    "Receive-side profiles explain how referrers can introduce a person, what details help intake, and what response expectations have been submitted.",
  send:
    "Send-side profiles explain what information travels with a referral handover and how follow-up is usually handled.",
  both:
    "Both-direction profiles keep receive and send communication details separate so each referral conversation has the right context.",
};

function formatList(items: string[] | undefined) {
  return items && items.length > 0 ? items.join(", ") : "Not yet provided";
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
      <p className="text-xs font-semibold text-[#65736f]">{label}</p>
      <p className="mt-1 break-words text-sm leading-6 text-[#263834]">
        {value}
      </p>
    </div>
  );
}

function ProfileBuilderPanel({ profile }: { profile: ReferralProfile }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            {profile.entityType === "organisation" ? (
              <Building2 className="size-5" aria-hidden="true" />
            ) : (
              <UserRound className="size-5" aria-hidden="true" />
            )}
            {profile.name}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
            Preview builder fields from self-submitted profile information.
            Changes are not saved in this slice.
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center rounded-md border border-[#dce8e2] bg-white px-2.5 py-1 text-xs font-semibold text-[#40504b]">
          {profile.referralDirection}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ProfileField
          label="Entity type"
          value={
            profile.entityType === "organisation"
              ? "Organisation profile"
              : "Individual profile"
          }
        />
        <ProfileField
          label="Referral direction"
          value={directionHelp[profile.referralDirection]}
        />
        <ProfileField label="Service areas" value={formatList(profile.serviceAreas)} />
        <ProfileField label="Languages" value={formatList(profile.languages)} />
        <ProfileField label="Referral fit notes" value={formatList(profile.bestFit)} />
        <ProfileField label="Last profile update" value={profile.updatedAt} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#dce8e2] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
            <ClipboardList className="size-4 text-[#0f766e]" aria-hidden="true" />
            Receive-side fields
          </div>
          <div className="mt-3 grid gap-3">
            <ProfileField
              label="Intake method"
              value={profile.receive?.intakeMethod ?? "Not yet provided"}
            />
            <ProfileField
              label="Response time"
              value={profile.receive?.responseTime ?? "Not yet provided"}
            />
            <ProfileField
              label="Capacity status"
              value={profile.receive?.capacityStatus ?? "Not yet provided"}
            />
          </div>
        </div>

        <div className="rounded-lg border border-[#dce8e2] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
            <Send className="size-4 text-[#0f766e]" aria-hidden="true" />
            Send-side fields
          </div>
          <div className="mt-3 grid gap-3">
            <ProfileField
              label="Handover requirements"
              value={formatList(profile.send?.handoverRequirements)}
            />
            <ProfileField
              label="Follow-up cadence"
              value={profile.send?.followUpCadence ?? "Not yet provided"}
            />
            <ProfileField
              label="Consent reminder"
              value={profile.send?.consentReminder ?? "Not yet provided"}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ReferralProfilePage() {
  const profiles = getSeedReferralProfiles();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Profile builder preview"
        title="Referral profile fields"
        description="Review how individual, organisation, receive, send, and both-direction profiles are represented before guided drafting is unlocked."
        actions={
          <>
            <ButtonLink href="/referral-workspace">Workspace</ButtonLink>
            <ButtonLink href="/referral-workspace/health" variant="secondary">
              Readiness audit
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-6 p-5">
        <div className="flex items-start gap-3">
          <Eye className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#17211f]">
              Preview only
            </p>
            <p className="mt-1 text-sm leading-6 text-[#40504b]">
              This page shows a form-like builder layout for seeded profiles.
              It does not persist edits or issue access codes in this slice.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5">
        {profiles.map((profile) => (
          <div key={profile.id} className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <BasicProfileCard summary={summarizeProfile(profile)} />
            <ProfileBuilderPanel profile={profile} />
          </div>
        ))}
      </div>

      <TrustBoundaryNotice className="mt-6" />
    </AppShell>
  );
}
