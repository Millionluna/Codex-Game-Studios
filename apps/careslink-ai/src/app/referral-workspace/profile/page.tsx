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

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const entityTypeLabels: Record<EntityType, string> = {
  individual: "Individual",
  organisation: "Organisation",
};

const directionLabels: Record<ReferralDirection, string> = {
  receive: "Receives referrals",
  send: "Sends referrals",
  both: "Receives and sends referrals",
};

const directionHelp: Record<ReferralDirection, string> = {
  receive:
    "Receive-side profiles explain how referrers can introduce a person and what helps intake.",
  send:
    "Send-side profiles explain what information travels with a referral handover.",
  both:
    "Both-direction profiles keep receive and send details separate for each referral conversation.",
};

const entityOptions = [
  { value: "individual", label: "Individual" },
  { value: "organisation", label: "Organisation" },
];

const directionOptions = [
  { value: "receive", label: "Receives referrals" },
  { value: "send", label: "Sends referrals" },
  { value: "both", label: "Receives and sends referrals" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatList(items: string[] | undefined) {
  return items && items.length > 0 ? items.join(", ") : "Not yet provided";
}

function formatMultilineList(items: string[] | undefined) {
  return items && items.length > 0 ? items.join("\n") : "Not yet provided";
}

function isReceiveRelevant(direction: ReferralDirection) {
  return direction === "receive" || direction === "both";
}

function isSendRelevant(direction: ReferralDirection) {
  return direction === "send" || direction === "both";
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

function RelevanceBadge({ relevant }: { relevant: boolean }) {
  return (
    <StatusPill tone={relevant ? "active" : "inactive"}>
      {relevant ? "Relevant to this profile" : "Not used for this direction"}
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

function ProfileBuilderPanel({ profile }: { profile: ReferralProfile }) {
  const receiveRelevant = isReceiveRelevant(profile.referralDirection);
  const sendRelevant = isSendRelevant(profile.referralDirection);
  const summaryDescription = summarizeProfile(profile).description;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <EntityIcon entityType={profile.entityType} />
            Builder example
          </div>
          <h2 className="mt-2 break-words text-xl font-semibold text-[#17211f]">
            {profile.name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
            Seeded Harbour data is shown as a first-version profile builder.
            Fields are read-only in this slice and do not persist changes.
          </p>
        </div>
        <StatusPill tone="neutral">Preview only</StatusPill>
      </div>

      <div role="form" aria-label="Read-only referral profile builder" className="mt-6 grid gap-6">
        <BuilderSection
          icon={UserRound}
          title="Identity and profile type"
          description="Set who the profile represents, how it participates in referrals, and the self-submitted summary referrers can read."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnlySelectField
              label="Entity type"
              value={profile.entityType}
              options={entityOptions}
            />
            <ReadOnlyTextField label="Profile name" value={profile.name} />
            <ReadOnlySelectField
              label="Referral direction"
              value={profile.referralDirection}
              options={directionOptions}
            />
            <ReadOnlyTextField label="Last updated" value={profile.updatedAt} />
            <div className="md:col-span-2">
              <ReadOnlyTextAreaField
                label="Profile summary"
                value={summaryDescription}
              />
            </div>
          </div>
        </BuilderSection>

        <BuilderSection
          icon={MapPin}
          title="Referral footprint"
          description="Capture where the profile is relevant, the languages submitted, and the referral fit notes used for communication readiness."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <ReadOnlyTextAreaField
              label="Service areas"
              value={formatMultilineList(profile.serviceAreas)}
              className="min-h-28"
            />
            <ReadOnlyTextAreaField
              label="Languages"
              value={formatMultilineList(profile.languages)}
              className="min-h-28"
            />
            <ReadOnlyTextAreaField
              label="Referral fit notes"
              value={formatMultilineList(profile.bestFit)}
              className="min-h-28"
            />
          </div>
        </BuilderSection>

        <BuilderSection
          icon={ClipboardList}
          title="Receive-referral fields"
          description="Receive-side details stay separate from send-side handover information."
          action={<RelevanceBadge relevant={receiveRelevant} />}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <ReadOnlyTextField
              label="Intake method"
              value={profile.receive?.intakeMethod ?? "Not yet provided"}
            />
            <ReadOnlyTextField
              label="Response time"
              value={profile.receive?.responseTime ?? "Not yet provided"}
            />
            <ReadOnlyTextField
              label="Capacity status"
              value={profile.receive?.capacityStatus ?? "Not yet provided"}
            />
          </div>
        </BuilderSection>

        <BuilderSection
          icon={Send}
          title="Send-referral fields"
          description="Send-side details describe what should travel with an outgoing referral and how follow-up is handled."
          action={<RelevanceBadge relevant={sendRelevant} />}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ReadOnlyTextAreaField
              label="Handover requirements"
              value={formatMultilineList(profile.send?.handoverRequirements)}
            />
            <div className="grid gap-4">
              <ReadOnlyTextField
                label="Follow-up cadence"
                value={profile.send?.followUpCadence ?? "Not yet provided"}
              />
              <ReadOnlyTextField
                label="Consent reminder"
                value={profile.send?.consentReminder ?? "Not yet provided"}
              />
            </div>
          </div>
        </BuilderSection>

        <BuilderSection
          icon={Eye}
          title="Preview and non-live boundary"
          description="This page uses seeded profile data only. It does not save edits, issue access codes, or perform real account actions."
        >
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4">
            <div className="flex max-w-3xl gap-3 text-sm leading-6 text-[#40504b]">
              <Info className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
              <p>
                Referral profile information is self-submitted and used here
                for referral communication readiness only. It is not a provider
                quality, service outcome, clinical, or compliance assessment.
              </p>
            </div>
            <ButtonLink href="/referral-workspace/health" variant="secondary">
              Continue to readiness audit
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
}: {
  relevant: boolean;
  detail: string;
}) {
  return (
    <div className="grid gap-2">
      <StatusPill tone={relevant ? "active" : "inactive"}>
        {relevant ? "Relevant" : "Not used"}
      </StatusPill>
      <p className="text-xs leading-5 text-[#65736f]">{detail}</p>
    </div>
  );
}

function RoleMatrix({ profiles }: { profiles: ReferralProfile[] }) {
  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-[#dce8e2] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
          <Languages className="size-5" aria-hidden="true" />
          Profile type and referral role examples
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
          The seed set shows how individual and organisation profiles can
          receive referrals, send referrals, or do both while keeping each side
          of the profile distinct.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[820px] divide-y divide-[#dce8e2] text-left text-sm">
          <thead className="bg-[#f8fbfa] text-xs font-semibold text-[#65736f]">
            <tr>
              <th className="px-5 py-3">Profile</th>
              <th className="px-5 py-3">Entity type</th>
              <th className="px-5 py-3">Referral direction</th>
              <th className="px-5 py-3">Receive side</th>
              <th className="px-5 py-3">Send side</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f1]">
            {profiles.map((profile) => {
              const receiveRelevant = isReceiveRelevant(profile.referralDirection);
              const sendRelevant = isSendRelevant(profile.referralDirection);
              const summaryDescription = summarizeProfile(profile).description;

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
                    <StatusPill>{entityTypeLabels[profile.entityType]}</StatusPill>
                  </td>
                  <td className="px-5 py-4">
                    <div className="grid gap-2">
                      <StatusPill tone="neutral">
                        {directionLabels[profile.referralDirection]}
                      </StatusPill>
                      <p className="max-w-64 text-xs leading-5 text-[#65736f]">
                        {directionHelp[profile.referralDirection]}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <RoleState
                      relevant={receiveRelevant}
                      detail={
                        receiveRelevant
                          ? profile.receive?.intakeMethod ?? "Receive details not yet provided."
                          : "Receive fields are separate and not used for this direction."
                      }
                    />
                  </td>
                  <td className="px-5 py-4">
                    <RoleState
                      relevant={sendRelevant}
                      detail={
                        sendRelevant
                          ? formatList(profile.send?.handoverRequirements)
                          : "Send fields are separate and not used for this direction."
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

export default function ReferralProfilePage() {
  const primaryProfile = getReferralProfile("profile-harbour");
  const profiles = getSeedReferralProfiles();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Profile builder preview"
        title="Referral profile builder"
        description="A read-only first version of the provider and referral profile builder, using seeded data for identity, direction, receive-side fields, and send-side fields."
        actions={
          <>
            <ButtonLink href="/referral-workspace/health">
              Continue to readiness audit <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/referral-workspace" variant="secondary">
              Workspace
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-6 p-5">
        <div className="flex items-start gap-3">
          <Eye className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#17211f]">
              Preview-only builder
            </p>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-[#40504b]">
              Controls are intentionally read-only or disabled. This route does
              not persist edits, create access codes, check authentication, or
              perform live referral actions.
            </p>
          </div>
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <BasicProfileCard summary={summarizeProfile(primaryProfile)} />
        <ProfileBuilderPanel profile={primaryProfile} />
      </section>

      <RoleMatrix profiles={profiles} />

      <TrustBoundaryNotice className="mt-6" />
    </AppShell>
  );
}
