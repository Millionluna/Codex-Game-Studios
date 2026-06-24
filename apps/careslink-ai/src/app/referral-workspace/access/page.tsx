import { ClipboardList, KeyRound, Send } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  AccessStatusPanel,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink, Card } from "@/components/ui";
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

function PreviewField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#cfded8] bg-white px-3 py-2">
      <p className="text-xs font-semibold text-[#65736f]">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[#263834]">{value}</p>
    </div>
  );
}

export default function ReferralAccessPage() {
  const profile = getReferralProfile("profile-alex-lee");
  const summary = summarizeProfile(profile);
  const accessState = getAccessState("user-free");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Access preview"
        title="Access code request"
        description="A non-submitting application preview for guided AI drafting access. Code generation and review actions are not live in this slice."
        actions={
          <>
            <ButtonLink href="/referral-workspace/materials" variant="secondary">
              Materials
            </ButtonLink>
            <ButtonLink href="/admin/access-requests">Admin queue</ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <AccessStatusPanel accessState={accessState} />

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                <KeyRound className="size-5" aria-hidden="true" />
                Request details
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                These fields show the information an access request may collect
                for pilot review. Submitting is not enabled here.
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md border border-[#f4d28f] bg-[#fff7df] px-2.5 py-1 text-xs font-semibold text-[#925b00]">
              Preview only
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <PreviewField label="Profile" value={summary.title} />
            <PreviewField label="Entity type" value={summary.entityLabel} />
            <PreviewField label="Referral direction" value={summary.directionLabel} />
            <PreviewField label="Requested code type" value="Provider Pilot" />
            <PreviewField label="Daily guided quota" value="Shown after access is active" />
            <PreviewField label="Reason for request" value="Prepare guided referral communication materials from submitted profile details." />
          </div>

          <div className="mt-5 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
              <ClipboardList className="size-4 text-[#0f766e]" aria-hidden="true" />
              Available pilot code categories
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {accessCodeTypes.map((codeType) => (
                <span
                  key={codeType}
                  className="inline-flex min-h-8 items-center rounded-md border border-[#dce8e2] bg-white px-2.5 py-1 text-xs font-semibold text-[#40504b]"
                >
                  {codeType}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 flex min-h-12 items-center gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] px-3 text-sm text-[#65736f]">
            <Send className="size-4 shrink-0 text-[#91a09b]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              Submit action disabled in this preview.
            </span>
          </div>
        </Card>
      </div>

      <TrustBoundaryNotice className="mt-6" />
    </AppShell>
  );
}
