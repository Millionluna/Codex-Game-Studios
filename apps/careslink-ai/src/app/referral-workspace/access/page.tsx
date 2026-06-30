import {
  ArrowRight,
  ClipboardList,
  KeyRound,
  Link2,
  LockKeyhole,
  Send,
  ShieldCheck,
} from "lucide-react";
import { submitAccessRequestAction } from "./actions";
import { AppShell } from "@/components/app-shell";
import { ProviderDraftHandoffPersister } from "@/components/provider-draft-handoff-persister";
import {
  ReferralWorkspaceAdminGate,
  ReferralWorkspaceLoginGate,
} from "@/components/referral-workspace-auth-gate";
import {
  WorkspaceGrid,
  WorkspaceMainPanel,
  WorkspaceRightRail,
  WorkspaceSection,
} from "@/components/workspace-layout";
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
  getReferralProfileForWorkspaceAccount,
  summarizeProfile,
} from "@/lib/referral-profile-workspace";
import { mapPublicProviderDraftToProfile } from "@/lib/public-provider-profile-generator";
import {
  claimResolvedProviderDraftForOwner,
  getProviderDraftStore,
  resolveProviderDraft,
  resolveProviderDraftForOwner,
} from "@/lib/provider-draft-store";
import {
  withWorkspaceAccount,
} from "@/lib/referral-workspace-auth";
import { getWorkspaceAccessGateWithServerSession } from "@/lib/referral-workspace-session";
import {
  getProviderGeneratorHandoffContext,
  withAuthHandoffParams,
  withProviderGeneratorHandoff,
} from "@/lib/referral-workspace-handoff";
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

function getAccessWorkspaceActions(locale: "en" | "zh-Hans") {
  return locale === "zh-Hans"
    ? {
        requestAccess: "申请访问",
        backToWorkspace: "返回工作台",
        applicationTitle: "访问申请",
        statusTitle: "访问状态",
        destinationsTitle: "预览链接",
        boundaryTitle: "边界说明",
      }
    : {
        requestAccess: "Request access",
        backToWorkspace: "Back to workspace",
        applicationTitle: "Access request",
        statusTitle: "Access status",
        destinationsTitle: "Preview links",
        boundaryTitle: "Boundary note",
      };
}

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
  name,
  className = "",
}: {
  label: string;
  value: string;
  name?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>
        <span>{label}</span>
        <TextInput
          name={name}
          defaultValue={value}
          readOnly
          aria-readonly="true"
        />
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
  name,
  className = "",
}: {
  label: string;
  value: string;
  name?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel>
        <span>{label}</span>
        <TextArea
          name={name}
          defaultValue={value}
          readOnly
          aria-readonly="true"
        />
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

function getRequestStatus(params: ReferralWorkspaceSearchParams | undefined) {
  const value = params?.request;

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}

function isSupabaseAuthUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getDefaultAccessCodeType(
  direction: "receive" | "send" | "both",
): AccessCodeType {
  if (direction === "send") {
    return "Referral Source Pilot";
  }

  if (direction === "both") {
    return "Dual Role Pilot";
  }

  return "Provider Pilot";
}

export default async function ReferralAccessPage({
  searchParams,
}: ReferralAccessPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const gate = await getWorkspaceAccessGateWithServerSession(params);
  const handoff = getProviderGeneratorHandoffContext(params);
  const localDraftPersister = (
    <ProviderDraftHandoffPersister
      source={handoff.source}
      draftId={handoff.draftId}
      draftPayload={handoff.draftPayload}
    />
  );

  if (gate.status === "signed_out") {
    return (
      <>
        {localDraftPersister}
        <ReferralWorkspaceLoginGate
          copy={copy}
          locale={locale}
          languageSwitcherHref={withProviderGeneratorHandoff(
            "/referral-workspace/access",
            handoff,
          )}
          loginHref={withAuthHandoffParams("/auth/login", params)}
          registerHref={withAuthHandoffParams("/auth/register", params)}
        />
      </>
    );
  }

  if (gate.account.role === "admin") {
    return (
      <>
        {localDraftPersister}
        <ReferralWorkspaceAdminGate
          copy={copy}
          locale={locale}
          accountId={gate.account.id}
        />
      </>
    );
  }

  const accountId = gate.account.id;
  const providerDraftStore = getProviderDraftStore();
  const rawResolvedDraft = handoff.draftId
    ? await resolveProviderDraft({
        draftId: handoff.draftId,
        draftPayload: handoff.draftPayload,
        ownerUserId: accountId,
        store: providerDraftStore,
      })
    : await resolveProviderDraftForOwner({
        ownerUserId: accountId,
        store: providerDraftStore,
      });
  const resolvedDraft = await claimResolvedProviderDraftForOwner({
    ownerUserId: accountId,
    resolution: rawResolvedDraft,
    store: providerDraftStore,
  });
  const withHandoff = (href: string) =>
    withProviderGeneratorHandoff(href, handoff);
  const signedInHref = (href: string, targetAccountId = accountId) => {
    const localizedHref = withLocale(withHandoff(href), locale);

    return gate.source === "demo"
      ? withWorkspaceAccount(localizedHref, targetAccountId)
      : localizedHref;
  };
  const profile = resolvedDraft
    ? mapPublicProviderDraftToProfile(resolvedDraft.draft, accountId)
    : getReferralProfileForWorkspaceAccount({
        ownerUserId: gate.account.id,
        name: gate.account.name,
      });
  const summary = summarizeProfile(profile);
  const accessState = gate.accessState;
  const approvedAccessState = getAccessState("user-approved");
  const requestedCodeType = getDefaultAccessCodeType(summary.referralDirection);
  const canSubmitAccessRequest =
    gate.account.role === "provider" &&
    isSupabaseAuthUserId(accountId) &&
    accessState.status !== "approved";
  const requestStatus = getRequestStatus(params);
  const requestNotice =
    requestStatus === "submitted"
      ? copy.access.submittedNotice
      : requestStatus === "already-active"
        ? copy.access.alreadyActiveNotice
        : undefined;
  const expectedDailyQuota = formatTemplate(
    copy.access.fieldValues.expectedDailyQuota,
    { count: approvedAccessState.dailyQuota },
  );
  const codeTypeOptions = accessCodeTypes.map((codeType) => ({
    value: codeType,
    label: copy.components.accessStatus.codeTypeLabels[codeType],
  }));
  const workspaceActions = getAccessWorkspaceActions(locale);

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withWorkspaceAccount(
        withHandoff("/referral-workspace/access"),
        gate.source === "demo" ? accountId : undefined,
      )}
      workspaceAccountId={gate.source === "demo" ? accountId : undefined}
      workspaceRole={gate.account.role}
      workspaceSessionSource={gate.source}
    >
      {localDraftPersister}
      <header className="mb-4 border-b border-[#ded6c8] pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#0f766e]">
              {copy.access.eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#181715] sm:text-3xl">
              {copy.access.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#40504b]">
              {copy.access.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="#access-request">
              {workspaceActions.requestAccess}
            </ButtonLink>
            <ButtonLink
              href={signedInHref("/referral-workspace")}
              variant="secondary"
            >
              {workspaceActions.backToWorkspace}
            </ButtonLink>
          </div>
        </div>
      </header>

      <WorkspaceGrid
        main={
          <WorkspaceMainPanel>
            <Card id="access-request" className="scroll-mt-6 p-5">
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
              {canSubmitAccessRequest
                ? copy.access.submitAvailable
                : copy.access.previewOnlyNoSubmit}
            </span>
          </div>

          {requestNotice ? (
            <div className="mt-5 rounded-lg border border-[#9ed8c9] bg-[#e6f7f2] p-4 text-sm leading-6 text-[#0f766e]">
              {requestNotice}
            </div>
          ) : null}

          <form
            action={submitAccessRequestAction}
            aria-label={copy.access.formLabel}
            className="mt-5 grid gap-4"
          >
            <input type="hidden" name="lang" value={locale} />
            <input type="hidden" name="source" value={handoff.source ?? ""} />
            <input type="hidden" name="draftId" value={handoff.draftId ?? ""} />
            <input
              type="hidden"
              name="providerDraftId"
              value={resolvedDraft?.record?.id ?? handoff.draftId ?? ""}
            />
            <input type="hidden" name="profileName" value={summary.title} />
            <input type="hidden" name="entityType" value={summary.entityType} />
            <input
              type="hidden"
              name="referralDirection"
              value={summary.referralDirection}
            />
            <input
              type="hidden"
              name="requestedCodeType"
              value={requestedCodeType}
            />
            <input
              type="hidden"
              name="expectedDailyQuota"
              value={String(approvedAccessState.dailyQuota)}
            />
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
                value={requestedCodeType}
                options={codeTypeOptions}
              />
              <PreviewInput
                label={copy.access.fields.sourceInvite}
                name="sourceInvite"
                value={copy.access.fieldValues.sourceInvite}
              />
              <PreviewInput
                label={copy.access.fields.expectedDailyQuota}
                value={expectedDailyQuota}
              />
            </div>

            <PreviewTextArea
              label={copy.access.fields.reason}
              name="reason"
              value={copy.access.fieldValues.reason}
            />
            <PreviewTextArea
              label={copy.access.fields.abuseCostControlNote}
              name="abuseCostControlNote"
              value={copy.access.fieldValues.abuseCostControlNote}
            />

            <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
                <ClipboardList className="size-4 text-[#0f766e]" aria-hidden="true" />
                {copy.access.previewRequestStateTitle}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                {copy.access.previewRequestStateDescription}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!canSubmitAccessRequest}
                className={
                  canSubmitAccessRequest
                    ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white transition hover:bg-[#0b5f59]"
                    : "inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-[#eef3f1] px-4 text-sm font-semibold text-[#65736f]"
                }
              >
                <Send className="size-4" aria-hidden="true" />
                {canSubmitAccessRequest
                  ? copy.access.submitButton
                  : copy.access.disabledButton}
              </button>
              <ButtonLink
                href={signedInHref("/referral-workspace/materials")}
                variant="secondary"
              >
                {copy.workspace.routes.materials.label}
              </ButtonLink>
              {gate.source === "demo" ? (
                <ButtonLink
                  href={signedInHref("/admin/access-requests")}
                  variant="secondary"
                >
                  {copy.access.openAdminQueue}
                </ButtonLink>
              ) : null}
            </div>
          </form>

          <div className="mt-5 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-4">
            <p className="text-sm leading-6 text-[#65736f]">
              {copy.common.nonLiveActions}
            </p>
          </div>
            </Card>
          </WorkspaceMainPanel>
        }
        rightRail={
          <WorkspaceRightRail>
            <WorkspaceSection title={workspaceActions.statusTitle}>
              <AccessStatusPanel accessState={accessState} locale={locale} />
            </WorkspaceSection>
            <WorkspaceSection title={copy.access.costControlTitle}>
              <WhyAccessCodePanel copy={copy.access} />
            </WorkspaceSection>
            {gate.source === "demo" ? (
              <WorkspaceSection
                title={workspaceActions.destinationsTitle}
                description={copy.access.previewDestinationsDescription}
              >
                <div className="grid gap-2">
                  <ButtonLink
                    href={signedInHref("/referral-workspace/materials")}
                    variant="secondary"
                  >
                    {copy.access.freeMaterials}
                  </ButtonLink>
                  <ButtonLink
                    href={signedInHref(
                      "/referral-workspace/materials",
                      "user-approved",
                    )}
                  >
                    {copy.access.accessCodeDemo}
                    <ArrowRight className="size-4" />
                  </ButtonLink>
                  <ButtonLink
                    href={signedInHref("/admin/access-requests")}
                    variant="secondary"
                  >
                    {copy.access.adminQueue}
                  </ButtonLink>
                </div>
              </WorkspaceSection>
            ) : null}
            <WorkspaceSection title={workspaceActions.boundaryTitle}>
              <TrustBoundaryNotice className="border-0 bg-transparent p-0" locale={locale} />
            </WorkspaceSection>
          </WorkspaceRightRail>
        }
      />
    </AppShell>
  );
}
