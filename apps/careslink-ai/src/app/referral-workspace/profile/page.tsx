import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Eye,
  Info,
  Languages,
  MapPin,
  Send,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  BasicProfileCard,
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
  getReferralProfile,
  getSeedReferralProfiles,
  summarizeProfile,
  type EntityType,
  type ReferralDirection,
  type ReferralProfile,
} from "@/lib/referral-profile-workspace";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type ProfilePageCopy = ReferralWorkspaceCopy["profile"];
type ComponentCopy = ReferralWorkspaceCopy["components"];
type ReferralWorkspaceSearchParams = {
  [key: string]: string | string[] | undefined;
};

type ReferralProfilePageProps = {
  searchParams?: Promise<ReferralWorkspaceSearchParams>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatList(items: string[] | undefined, emptyPlaceholder: string) {
  return items && items.length > 0 ? items.join(", ") : emptyPlaceholder;
}

function formatMultilineList(
  items: string[] | undefined,
  emptyPlaceholder: string,
) {
  return items && items.length > 0 ? items.join("\n") : emptyPlaceholder;
}

function isReceiveRelevant(direction: ReferralDirection) {
  return direction === "receive" || direction === "both";
}

function isSendRelevant(direction: ReferralDirection) {
  return direction === "send" || direction === "both";
}

function getEntityOptions(copy: ComponentCopy["basicProfile"]) {
  return [
    { value: "individual", label: copy.entityLabels.individual },
    { value: "organisation", label: copy.entityLabels.organisation },
  ];
}

function getDirectionOptions(copy: ComponentCopy["basicProfile"]) {
  return [
    { value: "receive", label: copy.directionLabels.receive },
    { value: "send", label: copy.directionLabels.send },
    { value: "both", label: copy.directionLabels.both },
  ];
}

function getLocalizedSummaryDescription(
  profile: ReferralProfile,
  copy: ComponentCopy["basicProfile"],
) {
  const summary = summarizeProfile(profile);

  return summary.descriptionNeedsReview
    ? copy.descriptionNeedsReview
    : summary.description;
}

function EntityIcon({ entityType }: { entityType: EntityType }) {
  const Icon = entityType === "organisation" ? Building2 : UserRound;

  return <Icon className="size-5 text-[#0f766e]" aria-hidden="true" />;
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "active" | "inactive";
}) {
  const tones = {
    neutral: "border-[#dce8e2] bg-[#f8fbfa] text-[#40504b]",
    active: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
    inactive: "border-[#cfded8] bg-white text-[#65736f]",
  };

  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center rounded-md border px-2 py-1 text-xs font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function RelevanceBadge({
  relevant,
  copy,
}: {
  relevant: boolean;
  copy: ProfilePageCopy;
}) {
  return (
    <StatusPill tone={relevant ? "active" : "inactive"}>
      {relevant ? copy.relevantToProfile : copy.notUsedForDirection}
    </StatusPill>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function BuilderSection({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[#dce8e2] pt-5 first:border-t-0 first:pt-0">
      <SectionHeader
        icon={icon}
        title={title}
        description={description}
        action={action}
      />
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ReadOnlyTextField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <FieldLabel>
      <span>{label}</span>
      <TextInput
        readOnly
        value={value}
        className="cursor-default bg-[#f8fbfa]"
      />
    </FieldLabel>
  );
}

function ReadOnlyTextAreaField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <FieldLabel>
      <span>{label}</span>
      <TextArea
        readOnly
        value={value}
        className={cx("min-h-32 cursor-default resize-none bg-[#f8fbfa]", className)}
      />
    </FieldLabel>
  );
}

function ReadOnlySelectField({
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
      <SelectInput
        disabled
        value={value}
        className="cursor-default bg-[#f8fbfa] disabled:opacity-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </FieldLabel>
  );
}

function ProfileBuilderPanel({
  profile,
  locale,
  copy,
}: {
  profile: ReferralProfile;
  locale: Locale;
  copy: ReferralWorkspaceCopy;
}) {
  const receiveRelevant = isReceiveRelevant(profile.referralDirection);
  const sendRelevant = isSendRelevant(profile.referralDirection);
  const profileCopy = copy.profile;
  const componentCopy = copy.components.basicProfile;
  const summaryDescription = getLocalizedSummaryDescription(
    profile,
    componentCopy,
  );
  const entityOptions = getEntityOptions(componentCopy);
  const directionOptions = getDirectionOptions(componentCopy);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <EntityIcon entityType={profile.entityType} />
            {profileCopy.builderExample}
          </div>
          <h2 className="mt-2 break-words text-xl font-semibold text-[#17211f]">
            {profile.name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
            {profileCopy.builderDescription}
          </p>
        </div>
        <StatusPill tone="neutral">{copy.common.previewOnly}</StatusPill>
      </div>

      <div role="form" aria-label={profileCopy.formLabel} className="mt-6 grid gap-6">
        <BuilderSection
          icon={UserRound}
          title={profileCopy.identitySection}
          description={profileCopy.identityDescription}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlySelectField
              label={profileCopy.fields.entityType}
              value={profile.entityType}
              options={entityOptions}
            />
            <ReadOnlyTextField
              label={profileCopy.fields.profileName}
              value={profile.name}
            />
            <ReadOnlySelectField
              label={profileCopy.fields.referralDirection}
              value={profile.referralDirection}
              options={directionOptions}
            />
            <ReadOnlyTextField
              label={profileCopy.fields.lastUpdated}
              value={profile.updatedAt}
            />
            <div className="md:col-span-2">
              <ReadOnlyTextAreaField
                label={profileCopy.fields.profileSummary}
                value={summaryDescription}
              />
            </div>
          </div>
        </BuilderSection>

        <BuilderSection
          icon={MapPin}
          title={profileCopy.footprintSection}
          description={profileCopy.footprintDescription}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <ReadOnlyTextAreaField
              label={profileCopy.fields.serviceAreas}
              value={formatMultilineList(
                profile.serviceAreas,
                componentCopy.emptyPlaceholder,
              )}
              className="min-h-28"
            />
            <ReadOnlyTextAreaField
              label={profileCopy.fields.languages}
              value={formatMultilineList(
                profile.languages,
                componentCopy.emptyPlaceholder,
              )}
              className="min-h-28"
            />
            <ReadOnlyTextAreaField
              label={profileCopy.fields.referralFitNotes}
              value={formatMultilineList(
                profile.bestFit,
                componentCopy.emptyPlaceholder,
              )}
              className="min-h-28"
            />
          </div>
        </BuilderSection>

        <BuilderSection
          icon={ClipboardList}
          title={profileCopy.receiveSection}
          description={profileCopy.receiveDescription}
          action={<RelevanceBadge relevant={receiveRelevant} copy={profileCopy} />}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <ReadOnlyTextField
              label={profileCopy.fields.intakeMethod}
              value={
                profile.receive?.intakeMethod ?? componentCopy.emptyPlaceholder
              }
            />
            <ReadOnlyTextField
              label={profileCopy.fields.responseTime}
              value={
                profile.receive?.responseTime ?? componentCopy.emptyPlaceholder
              }
            />
            <ReadOnlyTextField
              label={profileCopy.fields.capacityStatus}
              value={
                profile.receive?.capacityStatus ?? componentCopy.emptyPlaceholder
              }
            />
          </div>
        </BuilderSection>

        <BuilderSection
          icon={Send}
          title={profileCopy.sendSection}
          description={profileCopy.sendDescription}
          action={<RelevanceBadge relevant={sendRelevant} copy={profileCopy} />}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ReadOnlyTextAreaField
              label={profileCopy.fields.handoverRequirements}
              value={formatMultilineList(
                profile.send?.handoverRequirements,
                componentCopy.emptyPlaceholder,
              )}
            />
            <div className="grid gap-4">
              <ReadOnlyTextField
                label={profileCopy.fields.followUpCadence}
                value={
                  profile.send?.followUpCadence ??
                  componentCopy.emptyPlaceholder
                }
              />
              <ReadOnlyTextField
                label={profileCopy.fields.consentReminder}
                value={
                  profile.send?.consentReminder ??
                  componentCopy.emptyPlaceholder
                }
              />
            </div>
          </div>
        </BuilderSection>

        <BuilderSection
          icon={Eye}
          title={profileCopy.previewBoundaryTitle}
          description={profileCopy.previewBoundaryDescription}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4">
            <div className="flex max-w-3xl gap-3 text-sm leading-6 text-[#40504b]">
              <Info className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
              <p>{copy.common.trustBoundary}</p>
            </div>
            <ButtonLink
              href={withLocale("/referral-workspace/health", locale)}
              variant="secondary"
            >
              {copy.common.continueToReadiness}
            </ButtonLink>
          </div>
        </BuilderSection>
      </div>
    </Card>
  );
}

function RoleState({
  relevant,
  detail,
  copy,
}: {
  relevant: boolean;
  detail: string;
  copy: ProfilePageCopy;
}) {
  return (
    <div className="grid gap-2">
      <StatusPill tone={relevant ? "active" : "inactive"}>
        {relevant ? copy.relevant : copy.notUsed}
      </StatusPill>
      <p className="text-xs leading-5 text-[#65736f]">{detail}</p>
    </div>
  );
}

function RoleMatrix({
  profiles,
  copy,
}: {
  profiles: ReferralProfile[];
  copy: ReferralWorkspaceCopy;
}) {
  const profileCopy = copy.profile;
  const componentCopy = copy.components.basicProfile;

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-[#dce8e2] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
          <Languages className="size-5" aria-hidden="true" />
          {profileCopy.roleMatrixTitle}
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
          {profileCopy.roleMatrixDescription}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[820px] divide-y divide-[#dce8e2] text-left text-sm">
          <thead className="bg-[#f8fbfa] text-xs font-semibold text-[#65736f]">
            <tr>
              <th className="px-5 py-3">{profileCopy.tableColumns.profile}</th>
              <th className="px-5 py-3">
                {profileCopy.tableColumns.entityType}
              </th>
              <th className="px-5 py-3">
                {profileCopy.tableColumns.referralDirection}
              </th>
              <th className="px-5 py-3">
                {profileCopy.tableColumns.receiveSide}
              </th>
              <th className="px-5 py-3">
                {profileCopy.tableColumns.sendSide}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f1]">
            {profiles.map((profile) => {
              const receiveRelevant = isReceiveRelevant(profile.referralDirection);
              const sendRelevant = isSendRelevant(profile.referralDirection);
              const summaryDescription = getLocalizedSummaryDescription(
                profile,
                componentCopy,
              );

              return (
                <tr key={profile.id} className="align-top">
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      <EntityIcon entityType={profile.entityType} />
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-[#17211f]">
                          {profile.name}
                        </p>
                        <p className="mt-1 max-w-72 text-xs leading-5 text-[#65736f]">
                          {summaryDescription}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill>
                      {componentCopy.entityLabels[profile.entityType]}
                    </StatusPill>
                  </td>
                  <td className="px-5 py-4">
                    <div className="grid gap-2">
                      <StatusPill tone="neutral">
                        {componentCopy.directionLabels[profile.referralDirection]}
                      </StatusPill>
                      <p className="max-w-64 text-xs leading-5 text-[#65736f]">
                        {profileCopy.directionHelp[profile.referralDirection]}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <RoleState
                      relevant={receiveRelevant}
                      copy={profileCopy}
                      detail={
                        receiveRelevant
                          ? profile.receive?.intakeMethod ??
                            profileCopy.receiveDetailsMissing
                          : profileCopy.receiveNotUsed
                      }
                    />
                  </td>
                  <td className="px-5 py-4">
                    <RoleState
                      relevant={sendRelevant}
                      copy={profileCopy}
                      detail={
                        sendRelevant
                          ? formatList(
                              profile.send?.handoverRequirements,
                              componentCopy.emptyPlaceholder,
                            )
                          : profileCopy.sendNotUsed
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function ReferralProfilePage({
  searchParams,
}: ReferralProfilePageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const primaryProfile = getReferralProfile("profile-harbour");
  const profiles = getSeedReferralProfiles();

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref="/referral-workspace/profile"
    >
      <PageHeader
        eyebrow={copy.profile.eyebrow}
        title={copy.profile.title}
        description={copy.profile.description}
        actions={
          <>
            <ButtonLink href={withLocale("/referral-workspace/health", locale)}>
              {copy.common.continueToReadiness} <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink
              href={withLocale("/referral-workspace", locale)}
              variant="secondary"
            >
              {copy.shell.primaryNav.workspace}
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-6 p-5">
        <div className="flex items-start gap-3">
          <Eye className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#17211f]">
              {copy.common.previewOnly}
            </p>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-[#40504b]">
              {copy.profile.noPersistence}
            </p>
          </div>
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <BasicProfileCard
          summary={summarizeProfile(primaryProfile)}
          locale={locale}
        />
        <ProfileBuilderPanel
          profile={primaryProfile}
          locale={locale}
          copy={copy}
        />
      </section>

      <RoleMatrix profiles={profiles} copy={copy} />

      <TrustBoundaryNotice className="mt-6" locale={locale} />
    </AppShell>
  );
}
