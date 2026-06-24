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
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";

const statusClasses: Record<AccessRequest["status"], string> = {
  queued: "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
  approved: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
  declined: "border-[#c8d5cf] bg-[#eef3f1] text-[#40504b]",
};

const previewActions: {
  key: keyof ReferralWorkspaceCopy["admin"]["previewActions"];
  icon: LucideIcon;
}[] = [
  { key: "approve", icon: CheckCircle2 },
  { key: "waitlist", icon: Hourglass },
  { key: "decline", icon: XCircle },
];

type ReferralWorkspaceSearchParams = {
  [key: string]: string | string[] | undefined;
};

type AccessRequestsPageProps = {
  searchParams?: Promise<ReferralWorkspaceSearchParams>;
};

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (formatted, [key, value]) =>
      formatted.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function formatRequestedAt(value: string, locale: Locale) {
  const requestedAt = new Date(value);

  if (Number.isNaN(requestedAt.getTime())) {
    return value;
  }

  const requestedAtFormatter = new Intl.DateTimeFormat(
    locale === "zh-Hans" ? "zh-CN" : "en-AU",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Australia/Sydney",
    },
  );

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

function formatCount(
  value: number,
  labels: ReferralWorkspaceCopy["admin"]["requestCount"],
) {
  return formatTemplate(value === 1 ? labels.one : labels.other, {
    count: value,
  });
}

function localizedCodeType(
  codeType: string,
  copy: ReferralWorkspaceCopy,
) {
  const labels = copy.components.accessStatus.codeTypeLabels;

  return Object.prototype.hasOwnProperty.call(labels, codeType)
    ? labels[codeType as keyof typeof labels]
    : codeType;
}

function StatusBadge({
  status,
  copy,
}: {
  status: AccessRequest["status"];
  copy: ReferralWorkspaceCopy["admin"];
}) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}
    >
      {copy.statusLabels[status]}
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
  title,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-white px-3 text-sm font-semibold text-[#40504b] opacity-75"
      title={title}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function RequestCard({
  request,
  locale,
  copy,
}: {
  request: AccessRequest;
  locale: Locale;
  copy: ReferralWorkspaceCopy;
}) {
  const profile = getReferralProfile(request.profileId);
  const adminCopy = copy.admin;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <UserRound className="size-5 shrink-0" aria-hidden="true" />
            <span className="break-words">{profile.name}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">
            {formatTemplate(adminCopy.requestFrom, {
              requestId: request.id,
              userId: request.userId,
            })}
          </p>
        </div>
        <StatusBadge status={request.status} copy={adminCopy} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <RequestField label={adminCopy.fields.userId} value={request.userId} />
        <RequestField
          label={adminCopy.fields.requestedCodeType}
          value={localizedCodeType(request.requestedCodeType, copy)}
        />
        <RequestField
          label={adminCopy.fields.referralDirection}
          value={adminCopy.directionLabels[request.referralDirection]}
        />
        <RequestField
          label={adminCopy.fields.requestedTime}
          value={formatRequestedAt(request.requestedAt, locale)}
        />
      </div>

      <div className="mt-4 rounded-lg border border-[#dce8e2] bg-white p-4">
        <p className="text-xs font-semibold text-[#65736f]">
          {adminCopy.fields.noteOrReason}
        </p>
        <p className="mt-2 text-sm leading-6 text-[#40504b]">{request.note}</p>
      </div>

      <div className="mt-5 border-t border-[#e5eee9] pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
              <Eye className="size-4 text-[#0f766e]" aria-hidden="true" />
              {adminCopy.reviewAffordancesTitle}
            </div>
            <p className="mt-1 text-sm leading-6 text-[#65736f]">
              {adminCopy.reviewAffordancesDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {previewActions.map((action) => (
              <PreviewActionButton
                key={action.key}
                icon={action.icon}
                label={adminCopy.previewActions[action.key]}
                title={adminCopy.previewActionTitle}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default async function AccessRequestsPage({
  searchParams,
}: AccessRequestsPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
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
    requests.map((request) => localizedCodeType(request.requestedCodeType, copy)),
  );
  const directionSummary = formatCountSummary(
    requests.map(
      (request) => copy.admin.directionSummaryLabels[request.referralDirection],
    ),
  );

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref="/admin/access-requests"
    >
      <PageHeader
        eyebrow={copy.admin.eyebrow}
        title={copy.admin.title}
        description={copy.admin.description}
        actions={
          <>
            <ButtonLink
              href={withLocale("/referral-workspace/access", locale)}
              variant="secondary"
            >
              {copy.admin.accessPreview}
            </ButtonLink>
            <ButtonLink href={withLocale("/referral-workspace", locale)}>
              {copy.admin.workspace}
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={copy.admin.metrics.queued.label}
          value={String(queuedCount)}
          detail={copy.admin.metrics.queued.detail}
          tone="amber"
        />
        <MetricCard
          label={copy.admin.metrics.accessActive.label}
          value={String(accessActiveCount)}
          detail={copy.admin.metrics.accessActive.detail}
        />
        <MetricCard
          label={copy.admin.metrics.declined.label}
          value={String(declinedCount)}
          detail={copy.admin.metrics.declined.detail}
          tone="slate"
        />
        <MetricCard
          label={copy.admin.metrics.directionMix.label}
          value={formatCount(requests.length, copy.admin.requestCount)}
          detail={directionSummary || copy.admin.noRequestsInQueue}
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
              {copy.admin.boundaryTitle}
            </p>
            <p className="mt-1 text-sm leading-6 text-[#40504b]">
              {copy.admin.boundary}
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
                {copy.admin.requestQueueTitle}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                {copy.admin.requestQueueDescription}
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md border border-[#dce8e2] bg-white px-2.5 py-1 text-xs font-semibold text-[#40504b]">
              {formatCount(requests.length, copy.admin.requestCount)}
            </span>
          </div>

          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              locale={locale}
              copy={copy}
            />
          ))}
        </section>

        <aside className="grid content-start gap-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <KeyRound className="size-5" aria-hidden="true" />
              {copy.admin.requestedCodeTypesTitle}
            </div>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              {codeTypeSummary || copy.admin.noRequestedCodeTypes}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <SlidersHorizontal className="size-5" aria-hidden="true" />
              {copy.admin.reviewFocusTitle}
            </div>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#40504b]">
              {copy.admin.reviewFocusItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
