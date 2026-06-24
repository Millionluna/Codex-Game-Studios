import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  Hourglass,
  KeyRound,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card, MetricCard } from "@/components/ui";
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

const directionLabels: Record<AccessRequest["referralDirection"], string> = {
  receive: "Receive referrals",
  send: "Send referrals",
  both: "Receive and send referrals",
};

const directionSummaryLabels: Record<AccessRequest["referralDirection"], string> = {
  receive: "Receive",
  send: "Send",
  both: "Both",
};

const previewActions: {
  label: string;
  icon: LucideIcon;
}[] = [
  { label: "Preview approve", icon: CheckCircle2 },
  { label: "Preview waitlist", icon: Hourglass },
  { label: "Preview decline", icon: XCircle },
];

const requestedAtFormatter = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Sydney",
});

function formatRequestedAt(value: string) {
  const requestedAt = new Date(value);

  if (Number.isNaN(requestedAt.getTime())) {
    return value;
  }

  return requestedAtFormatter.format(requestedAt);
}

function formatCountSummary(values: string[]) {
  const counts = values.reduce<Record<string, number>>((summary, value) => {
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});

  return Object.entries(counts)
    .map(([label, count]) => `${label}: ${count}`)
    .join(", ");
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function StatusBadge({ status }: { status: AccessRequest["status"] }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function RequestField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] px-3 py-2">
      <p className="text-xs font-semibold text-[#65736f]">{label}</p>
      <p className="mt-1 break-words text-sm leading-6 text-[#263834]">
        {value}
      </p>
    </div>
  );
}

function PreviewActionButton({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-white px-3 text-sm font-semibold text-[#40504b] opacity-75"
      title="Preview only. This mock does not change access, quota, codes, or notifications."
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function RequestCard({ request }: { request: AccessRequest }) {
  const profile = getReferralProfile(request.profileId);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <UserRound className="size-5 shrink-0" aria-hidden="true" />
            <span className="break-words">{profile.name}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">
            Request {request.id} from {request.userId}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <RequestField label="User ID" value={request.userId} />
        <RequestField
          label="Requested code type"
          value={request.requestedCodeType}
        />
        <RequestField
          label="Referral direction"
          value={directionLabels[request.referralDirection]}
        />
        <RequestField
          label="Requested time"
          value={formatRequestedAt(request.requestedAt)}
        />
      </div>

      <div className="mt-4 rounded-lg border border-[#dce8e2] bg-white p-4">
        <p className="text-xs font-semibold text-[#65736f]">Note or reason</p>
        <p className="mt-2 text-sm leading-6 text-[#40504b]">{request.note}</p>
      </div>

      <div className="mt-5 border-t border-[#e5eee9] pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
              <Eye className="size-4 text-[#0f766e]" aria-hidden="true" />
              Read-only review affordances
            </div>
            <p className="mt-1 text-sm leading-6 text-[#65736f]">
              Disabled preview controls only. No access code, quota change, or
              notification is produced here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {previewActions.map((action) => (
              <PreviewActionButton
                key={action.label}
                icon={action.icon}
                label={action.label}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function AccessRequestsPage() {
  const requests = getAccessRequests();
  const queuedCount = requests.filter(
    (request) => request.status === "queued",
  ).length;
  const accessActiveCount = requests.filter(
    (request) => request.status === "approved",
  ).length;
  const declinedCount = requests.filter(
    (request) => request.status === "declined",
  ).length;
  const codeTypeSummary = formatCountSummary(
    requests.map((request) => request.requestedCodeType),
  );
  const directionSummary = formatCountSummary(
    requests.map(
      (request) => directionSummaryLabels[request.referralDirection],
    ),
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Read-only admin"
        title="Access request queue"
        description="An MVP admin queue for reviewing pilot access-code requests. Review actions, code generation, quota changes, and notifications are not live in this slice."
        actions={
          <>
            <ButtonLink href="/referral-workspace/access" variant="secondary">
              Access preview
            </ButtonLink>
            <ButtonLink href="/referral-workspace">Workspace</ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Queued"
          value={String(queuedCount)}
          detail="Requests waiting for access review."
          tone="amber"
        />
        <MetricCard
          label="Access active"
          value={String(accessActiveCount)}
          detail="Mock records with access currently active."
        />
        <MetricCard
          label="Declined"
          value={String(declinedCount)}
          detail="Requests not granted access in the mock queue."
          tone="slate"
        />
        <MetricCard
          label="Direction mix"
          value={pluralize(requests.length, "request")}
          detail={directionSummary || "No requests in queue."}
          tone="blue"
        />
      </div>

      <Card className="mt-6 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert
            className="mt-1 size-5 shrink-0 text-[#0f766e]"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-[#17211f]">
              Access review boundary
            </p>
            <p className="mt-1 text-sm leading-6 text-[#40504b]">
              Admin review controls access-code usage, AI cost exposure, daily
              quota, invite source, and repeated or multi-account misuse. Queue
              status describes access workflow only; it does not describe
              provider quality, service outcomes, clinical suitability, or
              compliance status.
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                <ClipboardList className="size-5" aria-hidden="true" />
                Request queue
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                Review submitted profile context before any future access
                decision is applied outside this mock.
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md border border-[#dce8e2] bg-white px-2.5 py-1 text-xs font-semibold text-[#40504b]">
              {pluralize(requests.length, "request")}
            </span>
          </div>

          {requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </section>

        <aside className="grid content-start gap-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <KeyRound className="size-5" aria-hidden="true" />
              Requested code types
            </div>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              {codeTypeSummary || "No requested code types in this queue."}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <SlidersHorizontal className="size-5" aria-hidden="true" />
              Review focus
            </div>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#40504b]">
              <li>Confirm the requested pilot code type and referral direction.</li>
              <li>Check invite source and expected quota use before access.</li>
              <li>
                Watch for repeated requests, duplicate users, or multi-account
                misuse patterns.
              </li>
              <li>
                Keep provider quality, outcomes, clinical suitability, and
                compliance judgments outside this access queue.
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
