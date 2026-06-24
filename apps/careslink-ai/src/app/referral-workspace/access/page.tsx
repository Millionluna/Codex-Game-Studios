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
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";

type AccessCodeType =
  keyof ReferralWorkspaceCopy["components"]["accessStatus"]["codeTypeLabels"];

const accessCodeTypes: AccessCodeType[] = [
  "Provider Pilot",
  "Referral Source Pilot",
  "Dual Role Pilot",
  "Internal Test",
  "Partner Batch",
];

type ReferralWorkspaceSearchParams = {
  [key: string]: string | string[] | undefined;
};

type ReferralAccessPageProps = {
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
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <FieldLabel>
      <span>{label}</span>
      <SelectInput defaultValue={value} disabled aria-disabled="true">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
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

function WhyAccessCodePanel({
  copy,
}: {
  copy: ReferralWorkspaceCopy["access"];
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
        <ShieldCheck className="size-5" aria-hidden="true" />
        {copy.costControlTitle}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#65736f]">
        {copy.costControl}
      </p>

      <div className="mt-5 grid gap-3">
        {copy.costControlItems.map((item, index) => {
          const Icon = index === 0 ? KeyRound : index === 1 ? LockKeyhole : Link2;
          const iconClassName =
            index === 0
              ? "text-[#0f766e]"
              : index === 1
                ? "text-[#925b00]"
                : "text-[#19518d]";

          return (
            <div
              key={item}
              className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3"
            >
              <Icon
                className={`mt-1 size-4 shrink-0 ${iconClassName}`}
                aria-hidden="true"
              />
              <p className="text-sm leading-6 text-[#40504b]">{item}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default async function ReferralAccessPage({
  searchParams,
}: ReferralAccessPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const profile = getReferralProfile("profile-alex-lee");
  const summary = summarizeProfile(profile);
  const accessState = getAccessState("user-free");
  const approvedAccessState = getAccessState("user-approved");
  const expectedDailyQuota = formatTemplate(
    copy.access.fieldValues.expectedDailyQuota,
    { count: approvedAccessState.dailyQuota },
  );
  const codeTypeOptions = accessCodeTypes.map((codeType) => ({
    value: codeType,
    label: copy.components.accessStatus.codeTypeLabels[codeType],
  }));

  return (
    <AppShell locale={locale} languageSwitcherHref="/referral-workspace/access">
      <PageHeader
        eyebrow={copy.access.eyebrow}
        title={copy.access.title}
        description={copy.access.description}
        actions={
          <>
            <ButtonLink
              href={withLocale(
                "/referral-workspace/materials?access=code",
                locale,
              )}
              variant="secondary"
            >
              {copy.access.materialsDemo}
            </ButtonLink>
            <ButtonLink href={withLocale("/admin/access-requests", locale)}>
              {copy.access.adminQueue} <ArrowRight className="size-4" />
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="grid gap-5">
          <AccessStatusPanel accessState={accessState} locale={locale} />
          <WhyAccessCodePanel copy={copy.access} />
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                <KeyRound className="size-5" aria-hidden="true" />
                {copy.access.applicationFieldsTitle}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                {copy.access.applicationFieldsDescription}
              </p>
            </div>
            <span className="inline-flex min-h-8 items-center rounded-md border border-[#f4d28f] bg-[#fff7df] px-2.5 py-1 text-xs font-semibold text-[#925b00]">
              {copy.access.previewOnlyNoSubmit}
            </span>
          </div>

          <form
            aria-label={copy.access.formLabel}
            className="mt-5 grid gap-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <PreviewInput
                label={copy.access.fields.profile}
                value={summary.title}
              />
              <PreviewInput
                label={copy.access.fields.entityType}
                value={
                  copy.components.basicProfile.entityLabels[summary.entityType]
                }
              />
              <PreviewInput
                label={copy.access.fields.referralDirection}
                value={
                  copy.components.basicProfile.directionLabels[
                    summary.referralDirection
                  ]
                }
              />
              <PreviewSelect
                label={copy.access.fields.requestedCodeType}
                value="Provider Pilot"
                options={codeTypeOptions}
              />
              <PreviewInput
                label={copy.access.fields.sourceInvite}
                value={copy.access.fieldValues.sourceInvite}
              />
              <PreviewInput
                label={copy.access.fields.expectedDailyQuota}
                value={expectedDailyQuota}
              />
            </div>

            <PreviewTextArea
              label={copy.access.fields.reason}
              value={copy.access.fieldValues.reason}
            />
            <PreviewTextArea
              label={copy.access.fields.abuseCostControlNote}
              value={copy.access.fieldValues.abuseCostControlNote}
            />
          </form>

          <div className="mt-5 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
              <ClipboardList className="size-4 text-[#0f766e]" aria-hidden="true" />
              {copy.access.previewRequestStateTitle}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65736f]">
              {copy.access.previewRequestStateDescription}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled
              className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-[#eef3f1] px-4 text-sm font-semibold text-[#65736f]"
            >
              <Send className="size-4" aria-hidden="true" />
              {copy.access.disabledButton}
            </button>
            <ButtonLink
              href={withLocale(
                "/referral-workspace/materials?access=code",
                locale,
              )}
              variant="secondary"
            >
              {copy.access.viewAccessCodeMaterialsDemo}
            </ButtonLink>
            <ButtonLink
              href={withLocale("/admin/access-requests", locale)}
              variant="secondary"
            >
              {copy.access.openAdminQueue}
            </ButtonLink>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <Link2 className="size-5" aria-hidden="true" />
              {copy.access.previewDestinationsTitle}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
              {copy.access.previewDestinationsDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink
              href={withLocale("/referral-workspace/materials", locale)}
              variant="secondary"
            >
              {copy.access.freeMaterials}
            </ButtonLink>
            <ButtonLink
              href={withLocale(
                "/referral-workspace/materials?access=code",
                locale,
              )}
            >
              {copy.access.accessCodeDemo} <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </div>
      </Card>

      <TrustBoundaryNotice className="mt-6" locale={locale} />
    </AppShell>
  );
}
