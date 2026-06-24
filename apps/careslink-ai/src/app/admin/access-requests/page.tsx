import { ClipboardList, KeyRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card } from "@/components/ui";
import {
  getAccessRequests,
  getReferralProfile,
  type AccessRequest,
} from "@/lib/referral-profile-workspace";

const statusClasses: Record<AccessRequest["status"], string> = {
  queued: "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
  approved: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
  declined: "border-[#c8d5cf] bg-[#eef3f1] text-[#40504b]",
};

const statusLabels: Record<AccessRequest["status"], string> = {
  queued: "Queued",
  approved: "Access active",
  declined: "Declined",
};

function RequestCard({ request }: { request: AccessRequest }) {
  const profile = getReferralProfile(request.profileId);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <KeyRound className="size-5" aria-hidden="true" />
            {request.requestedCodeType}
          </div>
          <h2 className="mt-2 text-lg font-semibold text-[#17211f]">
            {profile.name}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#65736f]">
            {request.userId} - {request.referralDirection} direction - requested{" "}
            {request.requestedAt}
          </p>
        </div>
        <span
          className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses[request.status]}`}
        >
          {statusLabels[request.status]}
        </span>
      </div>

      <p className="mt-4 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3 text-sm leading-6 text-[#40504b]">
        {request.note}
      </p>
    </Card>
  );
}

export default function AccessRequestsPage() {
  const requests = getAccessRequests();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Read-only admin"
        title="Access request queue"
        description="A mock admin view of pilot access requests. Review actions, code generation, and notifications are not live in this slice."
        actions={
          <>
            <ButtonLink href="/referral-workspace/access" variant="secondary">
              Access preview
            </ButtonLink>
            <ButtonLink href="/referral-workspace">Workspace</ButtonLink>
          </>
        }
      />

      <Card className="mb-6 p-5">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#17211f]">
              Pilot queue snapshot
            </p>
            <p className="mt-1 text-sm leading-6 text-[#40504b]">
              Status labels refer only to access-code workflow state. They do
              not describe provider quality, service outcomes, clinical
              suitability, or compliance status.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {requests.map((request) => (
          <RequestCard key={request.id} request={request} />
        ))}
      </div>
    </AppShell>
  );
}
