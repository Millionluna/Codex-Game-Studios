import type { Metadata } from "next";
import {
  CalendarClock,
  CircleAlert,
  Coins,
  FileText,
  LogIn,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReferralWorkspaceLoginGate } from "@/components/referral-workspace-auth-gate";
import {
  getAccountCreditStore,
  type AccountCreditLedgerRecord,
} from "@/lib/account-credit-store";
import { withWorkspaceAccount } from "@/lib/referral-workspace-auth";
import { getWorkspaceAccessGateWithServerSession } from "@/lib/referral-workspace-session";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";
import {
  resolveCaresLinkV1PointsPageData,
  type CaresLinkV1PointsPageData,
} from "@/lib/v1/points-page-data.server";
import { isCaresLinkV1PointsUiEnabled } from "@/lib/points-ui-feature.server";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Plan & Usage",
  description: "Review account access and usage information.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const AUTH_REQUIRED_POINTS_PAGE_DATA = Object.freeze({
  status: "AUTH_REQUIRED",
  unit: "POINTS",
}) satisfies CaresLinkV1PointsPageData;

export default async function PlanAndUsagePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getPlanUsageCopy(locale);
  const workspaceCopy = getReferralWorkspaceCopy(locale);
  const pointsUiEnabled = isCaresLinkV1PointsUiEnabled();
  const gate = await getWorkspaceAccessGateWithServerSession(params);

  if (gate.status === "signed_out") {
    return (
      <ReferralWorkspaceLoginGate
        copy={
          pointsUiEnabled
            ? getPointsLoginWorkspaceCopy(workspaceCopy, locale)
            : workspaceCopy
        }
        locale={locale}
        languageSwitcherHref="/plan-and-usage"
        loginHref="/auth/login?next=%2Fplan-and-usage"
        registerHref="/auth/register?next=%2Fplan-and-usage"
      />
    );
  }

  if (gate.account.role !== "provider") {
    redirect(withLocale("/admin/material-usage", locale));
  }

  const accountParam = gate.source === "demo" ? gate.account.id : undefined;
  const href = (path: string) =>
    withWorkspaceAccount(withLocale(path, locale), accountParam);

  if (pointsUiEnabled) {
    const points =
      gate.source === "supabase"
        ? await resolveCaresLinkV1PointsPageData()
        : AUTH_REQUIRED_POINTS_PAGE_DATA;

    return (
      <AppShell
        balanceNavigation="points"
        locale={locale}
        languageSwitcherHref="/plan-and-usage"
        workspaceAccountId={accountParam}
        workspaceRole="provider"
        workspaceSessionSource={gate.source}
      >
        <PointsPreviewSurface
          data={points}
          locale={locale}
          openDocumentsHref={href("/ai-documents")}
          refreshHref={href("/plan-and-usage")}
          signInHref={withLocale(
            "/auth/login?next=%2Fplan-and-usage",
            locale,
          )}
        />
      </AppShell>
    );
  }

  const usage =
    gate.source === "supabase"
      ? await getUsageSafely(gate.account.id)
      : null;

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref="/plan-and-usage"
      workspaceAccountId={accountParam}
      workspaceRole="provider"
      workspaceSessionSource={gate.source}
    >
      <div className="mx-auto max-w-[1180px]">
        <header className="document-paper overflow-hidden">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-brand">
                <Coins className="size-4" aria-hidden="true" />
                <p className="micro-label">{copy.eyebrow}</p>
              </div>
              <h1 className="document-title mt-3">{copy.title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                {copy.description}
              </p>
            </div>
            <Link
              href={href("/template-companion/ndis-case-note")}
              className="jade-action w-full sm:w-auto"
            >
              <FileText className="size-4" aria-hidden="true" />
              {copy.openCaseNote}
            </Link>
          </div>

          {usage ? (
            <dl className="grid border-t border-line sm:grid-cols-4">
              <UsageMetric label={copy.limit} value={usage.creditLimit} />
              <UsageMetric
                label={copy.remaining}
                value={usage.remainingCredits}
              />
              <UsageMetric label={copy.used} value={usage.usedCredits} />
              <UsageMetric
                label={copy.reserved}
                value={usage.reservedCredits}
              />
            </dl>
          ) : (
            <div className="border-t border-line px-6 py-5 text-sm leading-6 text-[#7a4e38]">
              {copy.unavailable}
            </div>
          )}
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="document-paper overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div>
                <p className="micro-label">{copy.ledgerEyebrow}</p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">
                  {copy.ledgerTitle}
                </h2>
              </div>
              {usage ? (
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  {copy.resetsOn(formatPeriodDate(usage.periodEnd, locale))}
                </span>
              ) : null}
            </div>

            {usage && usage.recentUsage.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-[#f1f4f0] text-xs text-muted">
                    <tr>
                      <th className="px-5 py-3 font-semibold sm:px-6">
                        {copy.date}
                      </th>
                      <th className="px-5 py-3 font-semibold">{copy.activity}</th>
                      <th className="px-5 py-3 font-semibold">{copy.event}</th>
                      <th className="px-5 py-3 text-right font-semibold sm:px-6">
                        {copy.units}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {usage.recentUsage.map((record) => (
                      <UsageRow
                        key={record.id}
                        record={record}
                        locale={locale}
                        copy={copy}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-10 text-sm leading-6 text-muted sm:px-6">
                {usage ? copy.noUsage : copy.unavailableDetail}
              </p>
            )}
          </section>

          <aside className="care-glass h-fit p-5">
            <div className="flex items-center gap-2 text-brand">
              <ShieldCheck className="size-4" aria-hidden="true" />
              <p className="micro-label">{copy.rulesEyebrow}</p>
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">
              {copy.rulesTitle}
            </h2>
            <ul className="mt-4 divide-y divide-[#b8ccc2] border-y border-[#b8ccc2]">
              {copy.rules.map((rule) => (
                <li key={rule} className="py-3 text-sm leading-6 text-[#385249]">
                  {rule}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-muted">
              {copy.boundary}
            </p>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function PointsPreviewSurface({
  data,
  locale,
  openDocumentsHref,
  refreshHref,
  signInHref,
}: {
  data: CaresLinkV1PointsPageData;
  locale: Locale;
  openDocumentsHref: string;
  refreshHref: string;
  signInHref: string;
}) {
  const copy = getPointsPreviewCopy(locale);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="document-paper overflow-hidden">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Coins className="size-4" aria-hidden="true" />
              <p className="micro-label">{copy.eyebrow}</p>
            </div>
            <h1 className="document-title mt-3">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              {copy.description}
            </p>
            <span className="workspace-status-pill workspace-status-pill--locked mt-4">
              {copy.previewStatus}
            </span>
          </div>
          <Link
            href={openDocumentsHref}
            className="jade-action w-full sm:w-auto"
          >
            <FileText className="size-4" aria-hidden="true" />
            {copy.openDocuments}
          </Link>
        </div>
      </header>

      <section
        className="document-paper mt-4 overflow-hidden"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="px-5 py-5 sm:px-6">
          <h2 className="text-lg font-semibold text-foreground">
            {copy.balanceTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#405b52]">
            {copy.balanceDescription}
          </p>
        </div>
        <PointsPreviewState
          copy={copy}
          data={data}
          locale={locale}
          refreshHref={refreshHref}
          signInHref={signInHref}
        />
      </section>

      <aside className="care-glass mt-4 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-brand">
          <ShieldCheck className="size-4" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">
            {copy.boundaryTitle}
          </h2>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385249]">
          {copy.boundary}
        </p>
      </aside>
    </div>
  );
}

function PointsPreviewState({
  copy,
  data,
  locale,
  refreshHref,
  signInHref,
}: {
  copy: ReturnType<typeof getPointsPreviewCopy>;
  data: CaresLinkV1PointsPageData;
  locale: Locale;
  refreshHref: string;
  signInHref: string;
}) {
  if (data.status === "AVAILABLE") {
    return (
      <>
        <dl className="grid border-t border-line sm:grid-cols-2">
          <PointsMetric
            label={copy.availablePoints}
            locale={locale}
            value={data.availablePoints}
          />
          <PointsMetric
            label={copy.reservedPoints}
            locale={locale}
            value={data.reservedPoints}
          />
        </dl>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4 text-sm leading-6 text-[#405b52] sm:px-6">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          <p>
            {copy.readOnly} {copy.checkedAt(formatPointsTimestamp(data.serverTime, locale))}
          </p>
        </div>
      </>
    );
  }

  if (data.status === "NOT_READY") {
    return (
      <PointsStateMessage
        actionHref={refreshHref}
        actionLabel={copy.tryAgain}
        detail={copy.notReadyDetail}
        icon={CalendarClock}
        title={copy.notReadyTitle}
      />
    );
  }

  if (data.status === "AUTH_REQUIRED") {
    return (
      <PointsStateMessage
        actionHref={signInHref}
        actionLabel={copy.signIn}
        detail={copy.authDetail}
        icon={LogIn}
        title={copy.authTitle}
      />
    );
  }

  return (
    <PointsStateMessage
      actionHref={refreshHref}
      actionLabel={copy.tryAgain}
      detail={copy.unavailableDetail}
      icon={CircleAlert}
      role="alert"
      title={copy.unavailableTitle}
    />
  );
}

function PointsMetric({
  label,
  locale,
  value,
}: {
  label: string;
  locale: Locale;
  value: number;
}) {
  return (
    <div className="border-b border-line px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-6">
      <dt className="text-sm font-semibold text-[#405b52]">{label}</dt>
      <dd className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
        {value.toLocaleString(locale === "zh-Hans" ? "zh-CN" : "en-AU")}
      </dd>
    </div>
  );
}

function PointsStateMessage({
  actionHref,
  actionLabel,
  detail,
  icon: Icon,
  role,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  detail: string;
  icon: typeof CalendarClock;
  role?: "alert";
  title: string;
}) {
  return (
    <div className="border-t border-line px-5 py-8 sm:px-6 sm:py-10" role={role}>
      <div className="flex size-10 items-center justify-center rounded-md bg-brand-soft text-brand">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#405b52]">
        {detail}
      </p>
      <Link href={actionHref} className="taito-secondary mt-5 w-full sm:w-auto">
        {Icon === LogIn ? (
          <LogIn className="size-4" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        {actionLabel}
      </Link>
    </div>
  );
}

function getPointsLoginWorkspaceCopy(
  workspaceCopy: ReferralWorkspaceCopy,
  locale: Locale,
): ReferralWorkspaceCopy {
  const pointsCopy = getPointsPreviewCopy(locale);

  return {
    ...workspaceCopy,
    auth: {
      ...workspaceCopy.auth,
      gate: {
        ...workspaceCopy.auth.gate,
        eyebrow: pointsCopy.eyebrow,
        title: pointsCopy.signInTitle,
        description: pointsCopy.signInDescription,
        loginCta: pointsCopy.signIn,
        registerCta: pointsCopy.register,
        previewBoundary: pointsCopy.boundary,
      },
    },
  };
}

function formatPointsTimestamp(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getPointsPreviewCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      eyebrow: "Points 预览",
      title: "Points 余额",
      description: "显示当前已验证服务商账户的只读 Points 余额。",
      previewStatus: "预览 · 尚未启用",
      openDocuments: "打开 AI 文档",
      balanceTitle: "余额快照",
      balanceDescription: "服务器会根据当前有效会话重新核验此余额。",
      availablePoints: "预览 Points 余额",
      reservedPoints: "已预留 Points",
      readOnly: "这是只读预览，此余额目前不能使用。",
      checkedAt: (date: string) => `核验时间：${date} UTC。`,
      notReadyTitle: "Points 预览尚未就绪",
      notReadyDetail: "此账户目前没有可显示的预览余额，请稍后再试。",
      unavailableTitle: "暂时无法载入 Points 预览",
      unavailableDetail: "此页面没有预留或使用 Points，请重试。",
      authTitle: "需要已验证的登录会话",
      authDetail: "请使用服务商账户登录，以查看 Points 预览。",
      tryAgain: "重新载入 Points",
      signIn: "登录查看 Points",
      signInTitle: "登录查看 Points 预览",
      signInDescription: "使用已验证的服务商账户查看当前只读 Points 余额。",
      register: "创建服务商账户",
      boundaryTitle: "预览边界",
      boundary:
        "此页面只读取服务器核验的余额快照，不能发放、购买、预留、使用或转换 Points。",
    };
  }

  return {
    eyebrow: "Points preview",
    title: "Points",
    description:
      "Read-only balance information for the current verified provider account.",
    previewStatus: "Preview · not active",
    openDocuments: "Open AI Documents",
    balanceTitle: "Balance snapshot",
    balanceDescription:
      "The server verifies this balance for the current active session.",
    availablePoints: "Preview Points balance",
    reservedPoints: "Reserved Points",
    readOnly: "Read-only preview. This balance cannot be used yet.",
    checkedAt: (date: string) => `Checked ${date} UTC.`,
    notReadyTitle: "Your Points preview isn’t ready yet",
    notReadyDetail:
      "No preview balance is available for this account yet. Try again later.",
    unavailableTitle: "We can’t load the Points preview right now",
    unavailableDetail:
      "This page did not reserve or use Points. Try again.",
    authTitle: "A verified sign-in is required",
    authDetail:
      "Sign in with your provider account to view the Points preview.",
    tryAgain: "Reload Points",
    signIn: "Sign in to view Points",
    signInTitle: "Sign in to view your Points preview",
    signInDescription:
      "Use your verified provider account to view the current read-only Points balance.",
    register: "Create provider account",
    boundaryTitle: "Preview boundary",
    boundary:
      "This surface only reads a server-verified balance snapshot. It cannot grant, purchase, reserve, use or convert Points.",
  };
}

function UsageMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-line px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-6">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function UsageRow({
  record,
  locale,
  copy,
}: {
  record: AccountCreditLedgerRecord;
  locale: Locale;
  copy: ReturnType<typeof getPlanUsageCopy>;
}) {
  return (
    <tr>
      <td className="whitespace-nowrap px-5 py-4 text-xs text-muted sm:px-6">
        {formatTimestamp(record.createdAt, locale)}
      </td>
      <td className="px-5 py-4 font-semibold text-foreground">
        {getActivityLabel(record, copy)}
      </td>
      <td className="px-5 py-4 text-muted">{copy.events[record.event]}</td>
      <td className="px-5 py-4 text-right font-semibold text-foreground sm:px-6">
        {record.units}
      </td>
    </tr>
  );
}

async function getUsageSafely(userId: string) {
  try {
    return await getAccountCreditStore().getUsage({ userId, recentLimit: 16 });
  } catch {
    return null;
  }
}

function getActivityLabel(
  record: AccountCreditLedgerRecord,
  copy: ReturnType<typeof getPlanUsageCopy>,
) {
  if (record.feature === "ndis_case_note" && record.action === "generate") {
    return copy.caseNoteGeneration;
  }

  if (record.feature === "account" && record.action === "period_grant") {
    return copy.periodGrant;
  }

  return copy.accountActivity;
}

function formatPeriodDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en-AU", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatTimestamp(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getPlanUsageCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      eyebrow: "免费方案与使用量",
      title: "Plan & Usage",
      description:
        "免费服务商账户每个 UTC 自然月获得 3 个 Case Note 生成 credits。额度由服务端账本记录。",
      openCaseNote: "打开 Case Note 助手",
      limit: "本周期额度",
      remaining: "可用",
      used: "已使用",
      reserved: "处理中",
      unavailable: "暂时无法确认 credits；AI 生成已安全停用。",
      unavailableDetail: "使用量服务恢复后，这里会显示当前周期账本。",
      ledgerEyebrow: "仅元数据记录",
      ledgerTitle: "最近使用记录",
      resetsOn: (date: string) => `下次重置：${date}`,
      date: "时间",
      activity: "功能",
      event: "状态",
      units: "Credits",
      noUsage: "本周期尚无使用记录。",
      caseNoteGeneration: "NDIS Case Note 生成",
      periodGrant: "本周期免费额度",
      accountActivity: "账户额度活动",
      events: {
        grant: "发放",
        reserve: "预留",
        commit: "已使用",
        release: "已释放",
      },
      rulesEyebrow: "额度规则",
      rulesTitle: "什么会使用 credit",
      rules: [
        "只有成功返回一份新的完整 Case Note 结果包才使用 1 credit。",
        "隐私检查、编辑、查看、保存、复制和下载均不使用 credit。",
        "Credits 每个周期重置，不结转；当前未开放购买。",
      ],
      boundary:
        "账本只保存功能、动作、状态、数量和时间等元数据，不保存输入、输出或 participant 事实。",
    };
  }

  return {
    eyebrow: "Free plan and usage",
    title: "Plan & Usage",
    description:
      "A free provider account receives 3 Case Note generation credits per UTC calendar month. The server-side ledger is the source of truth.",
    openCaseNote: "Open Case Note Companion",
    limit: "Period limit",
    remaining: "Available",
    used: "Used",
    reserved: "In progress",
    unavailable:
      "Credits cannot be confirmed right now, so AI generation is safely unavailable.",
    unavailableDetail:
      "The current-period ledger will appear when the usage service is available.",
    ledgerEyebrow: "Metadata only",
    ledgerTitle: "Recent usage",
    resetsOn: (date: string) => `Next reset: ${date}`,
    date: "Time",
    activity: "Feature",
    event: "State",
    units: "Credits",
    noUsage: "There is no usage activity in this period yet.",
    caseNoteGeneration: "NDIS Case Note generation",
    periodGrant: "Free period grant",
    accountActivity: "Account credit activity",
    events: {
      grant: "Granted",
      reserve: "Reserved",
      commit: "Used",
      release: "Released",
    },
    rulesEyebrow: "Credit rules",
    rulesTitle: "What uses a credit",
    rules: [
      "Only a new, complete Case Note result package that is returned successfully uses 1 credit.",
      "Privacy review, editing, viewing, saving, copying and downloading use 0 credits.",
      "Credits reset each period and do not roll over. Purchasing is not available yet.",
    ],
    boundary:
      "The ledger stores metadata such as feature, action, state, units and time. It does not store inputs, outputs or participant facts.",
  };
}
