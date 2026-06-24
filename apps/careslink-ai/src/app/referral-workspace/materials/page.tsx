import {
  ArrowRight,
  CheckCircle2,
  FileText,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  AccessStatusPanel,
  AgentQueuePanel,
  GuidedCopilotPanel,
  LockedMaterialsGrid,
  TrustBoundaryNotice,
} from "@/components/referral-profile-workspace";
import { ButtonLink, Card } from "@/components/ui";
import {
  getAccessState,
  getAgentQueueForAccess,
  getHealthAudit,
  getLockedMaterials,
  getReferralProfile,
  summarizeProfile,
} from "@/lib/referral-profile-workspace";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";

type MaterialsSearchParams = {
  [key: string]: string | string[] | undefined;
  access?: string | string[];
};

type ReferralMaterialsPageProps = {
  searchParams?: Promise<MaterialsSearchParams>;
};

type AccessState = ReturnType<typeof getAccessState>;

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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hasDemoAccessCode(searchParams: MaterialsSearchParams | undefined) {
  return firstParam(searchParams?.access) === "code";
}

function ModeStatusCard({
  accessState,
  hasDemoAccess,
  locale,
  copy,
}: {
  accessState: AccessState;
  hasDemoAccess: boolean;
  locale: Locale;
  copy: ReferralWorkspaceCopy["materials"];
}) {
  const remainingQuota = Math.max(
    0,
    accessState.dailyQuota - accessState.usedToday,
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            {hasDemoAccess ? (
              <CheckCircle2 className="size-5" aria-hidden="true" />
            ) : (
              <LockKeyhole className="size-5" aria-hidden="true" />
            )}
            {copy.currentModeTitle}
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[#17211f]">
            {hasDemoAccess
              ? copy.accessCodeGuidedPreview
              : copy.freePreviewWithoutCode}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
            {hasDemoAccess ? copy.accessModeDetail : copy.freeModeDetail}
          </p>
        </div>
        <span
          className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
            hasDemoAccess
              ? "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]"
              : "border-[#f4d28f] bg-[#fff7df] text-[#925b00]"
          }`}
        >
          {hasDemoAccess ? copy.userApproved : copy.userFree}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <p className="text-xs font-semibold text-[#65736f]">{copy.accessCode}</p>
          <p className="mt-1 text-sm font-semibold text-[#17211f]">
            {accessState.hasAccessCode ? copy.activeForDemo : copy.notPresent}
          </p>
        </div>
        <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <p className="text-xs font-semibold text-[#65736f]">{copy.guidedQuota}</p>
          <p className="mt-1 text-sm font-semibold text-[#17211f]">
            {formatTemplate(copy.usedDailyQuota, {
              used: accessState.usedToday,
              total: accessState.dailyQuota,
            })}
          </p>
        </div>
        <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <p className="text-xs font-semibold text-[#65736f]">{copy.remainingToday}</p>
          <p className="mt-1 text-sm font-semibold text-[#17211f]">
            {remainingQuota}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {hasDemoAccess ? (
          <>
            <ButtonLink
              href={withLocale("/referral-workspace/materials", locale)}
              variant="secondary"
            >
              {copy.viewFreePreview}
            </ButtonLink>
            <ButtonLink href={withLocale("/referral-workspace/access", locale)}>
              {copy.accessRequestPreview}
            </ButtonLink>
          </>
        ) : (
          <>
            <ButtonLink href={withLocale("/referral-workspace/access", locale)}>
              {getReferralWorkspaceCopy(locale).workspace.requestAccess}{" "}
              <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink
              href={withLocale(
                "/referral-workspace/materials?access=code",
                locale,
              )}
              variant="secondary"
            >
              {copy.tryAccessCodeDemo}
            </ButtonLink>
          </>
        )}
      </div>
    </Card>
  );
}

function DeterministicPreviewNotice({
  hasDemoAccess,
  copy,
}: {
  hasDemoAccess: boolean;
  copy: ReferralWorkspaceCopy["materials"];
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
        <ShieldCheck className="size-5" aria-hidden="true" />
        {copy.deterministicPreviewTitle}
      </div>
      <div className="mt-4 grid gap-3">
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <MessageSquareText
            className="mt-1 size-4 shrink-0 text-[#19518d]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#40504b]">
            {copy.noAiCall}
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <FileText
            className="mt-1 size-4 shrink-0 text-[#0f766e]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#40504b]">
            {hasDemoAccess
              ? copy.guidedReviewBoundary
              : copy.freePreviewBoundary}
          </p>
        </div>
        <div className="flex gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
          <KeyRound
            className="mt-1 size-4 shrink-0 text-[#925b00]"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-[#40504b]">
            {copy.accessStateBoundary}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default async function ReferralMaterialsPage({
  searchParams,
}: ReferralMaterialsPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const hasDemoAccess = hasDemoAccessCode(params);
  const profile = getReferralProfile("profile-alex-lee");
  const accessState = getAccessState(
    hasDemoAccess ? "user-approved" : "user-free",
  );
  const summary = summarizeProfile(profile);
  const audit = getHealthAudit(profile);
  const queue = getAgentQueueForAccess(accessState);
  const materials = getLockedMaterials(profile.referralDirection, accessState);
  const languageSwitcherHref = hasDemoAccess
    ? "/referral-workspace/materials?access=code"
    : "/referral-workspace/materials";

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={languageSwitcherHref}
    >
      <PageHeader
        eyebrow={copy.materials.eyebrow}
        title={copy.materials.title}
        description={`${copy.materials.description} ${
          hasDemoAccess ? copy.materials.accessMode : copy.materials.freeMode
        }`}
        actions={
          <>
            <ButtonLink
              href={withLocale("/referral-workspace/health", locale)}
              variant="secondary"
            >
              {copy.materials.readinessAudit}
            </ButtonLink>
            {hasDemoAccess ? (
              <ButtonLink
                href={withLocale("/referral-workspace/materials", locale)}
                variant="secondary"
              >
                {copy.materials.freePreview}
              </ButtonLink>
            ) : (
              <ButtonLink
                href={withLocale(
                  "/referral-workspace/materials?access=code",
                  locale,
                )}
                variant="secondary"
              >
                {copy.materials.accessDemo}
              </ButtonLink>
            )}
            <ButtonLink href={withLocale("/referral-workspace/access", locale)}>
              {copy.materials.access} <ArrowRight className="size-4" />
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ModeStatusCard
          accessState={accessState}
          hasDemoAccess={hasDemoAccess}
          locale={locale}
          copy={copy.materials}
        />
        <DeterministicPreviewNotice
          hasDemoAccess={hasDemoAccess}
          copy={copy.materials}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-5">
          <AccessStatusPanel accessState={accessState} locale={locale} />
          <AgentQueuePanel
            queue={queue}
            accessState={accessState}
            locale={locale}
          />
        </div>
        <GuidedCopilotPanel
          accessState={accessState}
          queue={queue}
          summary={summary}
          audit={audit}
          locale={locale}
        />
      </div>

      <section className="mt-6">
        <LockedMaterialsGrid
          materials={materials}
          accessState={accessState}
          locale={locale}
        />
      </section>

      <TrustBoundaryNotice className="mt-6" locale={locale} />
    </AppShell>
  );
}
