import {
  BarChart3,
  Clock,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  ReferralWorkspaceAdminGate,
  ReferralWorkspaceLoginGate,
} from "@/components/referral-workspace-auth-gate";
import { ButtonLink, Card, MetricCard } from "@/components/ui";
import {
  getGeneratedMaterialDraftStore,
  type GeneratedMaterialDraftMetadataRecord,
} from "@/lib/generated-material-draft-store";
import { getGeneratedMaterialEventStore } from "@/lib/generated-material-event-store";
import { withWorkspaceAccount } from "@/lib/referral-workspace-auth";
import { getWorkspaceAccessGateWithServerSession } from "@/lib/referral-workspace-session";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";

type MaterialUsageSearchParams = {
  [key: string]: string | string[] | undefined;
};

type MaterialUsagePageProps = {
  searchParams?: Promise<MaterialUsageSearchParams>;
};

type MaterialUsageCopy = ReferralWorkspaceCopy["admin"]["materialUsage"];

const statusClasses: Record<
  GeneratedMaterialDraftMetadataRecord["status"],
  string
> = {
  draft: "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
  reviewed: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
  archived: "border-[#c8d5cf] bg-[#eef3f1] text-[#40504b]",
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

function formatDraftCount(value: number, copy: MaterialUsageCopy) {
  return formatTemplate(
    value === 1 ? copy.draftCount.one : copy.draftCount.other,
    { count: value },
  );
}

function formatEventCount(value: number, copy: MaterialUsageCopy) {
  return formatTemplate(
    value === 1 ? copy.eventCount.one : copy.eventCount.other,
    { count: value },
  );
}

function formatMaterialDate(value: string, locale: Locale) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(date);
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

function MaterialUsageField({
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

function MaterialStatusBadge({
  status,
  copy,
}: {
  status: GeneratedMaterialDraftMetadataRecord["status"];
  copy: MaterialUsageCopy;
}) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}
    >
      {copy.statusLabels[status]}
    </span>
  );
}

function MaterialUsageCard({
  draft,
  locale,
  copy,
}: {
  draft: GeneratedMaterialDraftMetadataRecord;
  locale: Locale;
  copy: MaterialUsageCopy;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <FileText className="size-5 shrink-0" aria-hidden="true" />
            <span className="break-words">
              {copy.featureLabels[draft.feature]}
            </span>
          </div>
          <p className="mt-2 break-words text-sm leading-6 text-[#65736f]">
            {draft.id}
          </p>
        </div>
        <MaterialStatusBadge status={draft.status} copy={copy} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MaterialUsageField label={copy.fields.draftId} value={draft.id} />
        <MaterialUsageField label={copy.fields.userId} value={draft.userId} />
        <MaterialUsageField
          label={copy.fields.providerDraftId}
          value={draft.providerDraftId ?? "-"}
        />
        <MaterialUsageField
          label={copy.fields.feature}
          value={copy.featureLabels[draft.feature]}
        />
        <MaterialUsageField
          label={copy.fields.createdAt}
          value={formatMaterialDate(draft.createdAt, locale)}
        />
        <MaterialUsageField
          label={copy.fields.updatedAt}
          value={formatMaterialDate(draft.updatedAt, locale)}
        />
      </div>

      <div className="mt-4 rounded-lg border border-[#dce8e2] bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
          <ShieldAlert className="size-4 text-[#0f766e]" aria-hidden="true" />
          {copy.contentNotShown}
        </div>
        <p className="mt-2 text-sm leading-6 text-[#40504b]">
          {copy.contentNotShownDetail}
        </p>
      </div>
    </Card>
  );
}

export default async function AdminMaterialUsagePage({
  searchParams,
}: MaterialUsagePageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const materialUsageCopy = copy.admin.materialUsage;
  const gate = await getWorkspaceAccessGateWithServerSession(params);

  if (gate.status === "signed_out") {
    return (
      <ReferralWorkspaceLoginGate
        copy={copy}
        locale={locale}
        languageSwitcherHref="/admin/material-usage"
      />
    );
  }

  if (!gate.canViewAdmin) {
    return (
      <ReferralWorkspaceAdminGate
        copy={copy}
        locale={locale}
        accountId={gate.account.id}
      />
    );
  }

  const accountId = gate.account.id;
  const signedInHref = (href: string) => {
    const localizedHref = withLocale(href, locale);

    return gate.source === "demo"
      ? withWorkspaceAccount(localizedHref, accountId)
      : localizedHref;
  };
  const drafts =
    await getGeneratedMaterialDraftStore().listGeneratedMaterialDraftMetadata({
      limit: 25,
      excludeFeature: "ndis_case_note",
    });
  const events =
    await getGeneratedMaterialEventStore().listGeneratedMaterialEvents({
      limit: 500,
      excludeFeature: "ndis_case_note",
    });
  const reviewedCount = drafts.filter(
    (draft) => draft.status === "reviewed",
  ).length;
  const archivedCount = drafts.filter(
    (draft) => draft.status === "archived",
  ).length;
  const copyAllCount = events.filter(
    (event) => event.eventType === "copy_all",
  ).length;
  const copyFieldCount = events.filter(
    (event) => event.eventType === "copy_field",
  ).length;
  const featureMix = formatCountSummary(
    drafts.map((draft) => materialUsageCopy.featureLabels[draft.feature]),
  );

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withWorkspaceAccount(
        "/admin/material-usage",
        gate.source === "demo" ? accountId : undefined,
      )}
      workspaceAccountId={gate.source === "demo" ? accountId : undefined}
      workspaceRole={gate.account.role}
      workspaceSessionSource={gate.source}
    >
      <PageHeader
        eyebrow={materialUsageCopy.eyebrow}
        title={materialUsageCopy.title}
        description={materialUsageCopy.description}
        actions={
          <>
            <ButtonLink
              href={signedInHref("/admin/access-requests")}
              variant="secondary"
            >
              {materialUsageCopy.accessRequests}
            </ButtonLink>
            <ButtonLink href={signedInHref("/referral-workspace")}>
              {materialUsageCopy.workspace}
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={materialUsageCopy.metrics.total.label}
          value={String(drafts.length)}
          detail={materialUsageCopy.metrics.total.detail}
        />
        <MetricCard
          label={materialUsageCopy.metrics.reviewed.label}
          value={String(reviewedCount)}
          detail={materialUsageCopy.metrics.reviewed.detail}
        />
        <MetricCard
          label={materialUsageCopy.metrics.archived.label}
          value={String(archivedCount)}
          detail={materialUsageCopy.metrics.archived.detail}
          tone="slate"
        />
        <MetricCard
          label={materialUsageCopy.metrics.featureMix.label}
          value={formatDraftCount(drafts.length, materialUsageCopy)}
          detail={featureMix || materialUsageCopy.noDrafts}
          tone="blue"
        />
        <MetricCard
          label={materialUsageCopy.metrics.copyEvents.label}
          value={formatEventCount(events.length, materialUsageCopy)}
          detail={materialUsageCopy.metrics.copyEvents.detail}
          tone="teal"
        />
        <MetricCard
          label={materialUsageCopy.metrics.copyAll.label}
          value={String(copyAllCount)}
          detail={materialUsageCopy.metrics.copyAll.detail}
          tone="blue"
        />
        <MetricCard
          label={materialUsageCopy.metrics.copyField.label}
          value={String(copyFieldCount)}
          detail={materialUsageCopy.metrics.copyField.detail}
          tone="slate"
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
              {materialUsageCopy.boundaryTitle}
            </p>
            <p className="mt-1 text-sm leading-6 text-[#40504b]">
              {materialUsageCopy.boundary}
            </p>
          </div>
        </div>
      </Card>

      <section className="mt-6 grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <BarChart3 className="size-5" aria-hidden="true" />
              {materialUsageCopy.activityTitle}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65736f]">
              {materialUsageCopy.activityDescription}
            </p>
          </div>
          <span className="inline-flex min-h-8 items-center rounded-md border border-[#dce8e2] bg-white px-2.5 py-1 text-xs font-semibold text-[#40504b]">
            {formatDraftCount(drafts.length, materialUsageCopy)}
          </span>
        </div>

        {drafts.length ? (
          drafts.map((draft) => (
            <MaterialUsageCard
              key={draft.id}
              draft={draft}
              locale={locale}
              copy={materialUsageCopy}
            />
          ))
        ) : (
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
              <Clock className="size-5 text-[#0f766e]" aria-hidden="true" />
              {materialUsageCopy.noDrafts}
            </div>
          </Card>
        )}
      </section>
    </AppShell>
  );
}
