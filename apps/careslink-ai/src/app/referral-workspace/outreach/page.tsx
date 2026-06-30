import { ArrowRight, Plus } from "lucide-react";
import { Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import {
  ReferralWorkspaceAdminGate,
  ReferralWorkspaceLoginGate,
} from "@/components/referral-workspace-auth-gate";
import { TrustBoundaryNotice } from "@/components/referral-profile-workspace";
import { ButtonLink, FieldLabel, SelectInput, TextArea, TextInput } from "@/components/ui";
import {
  WorkspaceGrid,
  WorkspaceMainPanel,
  WorkspaceRightRail,
  WorkspaceSection,
  WorkspaceSignalRow,
  WorkspaceStatusPill,
} from "@/components/workspace-layout";
import {
  getOutreachStore,
  type OutreachChannel,
  type OutreachRecipientRole,
  type OutreachRecord,
  type OutreachStatus,
} from "@/lib/outreach-store";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";
import { withWorkspaceAccount } from "@/lib/referral-workspace-auth";
import { getWorkspaceAccessGateWithServerSession } from "@/lib/referral-workspace-session";
import { withAuthHandoffParams } from "@/lib/referral-workspace-handoff";
import { getProviderWorkspaceContext } from "@/lib/referral-workspace-provider-context";

type OutreachSearchParams = {
  [key: string]: string | string[] | undefined;
};

type OutreachPageProps = {
  searchParams?: Promise<OutreachSearchParams>;
};

type SignedInGate = Awaited<
  ReturnType<typeof getWorkspaceAccessGateWithServerSession>
> & { status: "signed_in" };

function getOutreachCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      eyebrow: "跟进",
      title: "转介跟进助手",
      description:
        "查看哪些 Referral Pack 需要跟进，更新回应状态，并记录新的发送。",
      addTitle: "添加或记录一次发送",
      addDescription:
        "这是服务商自己的运营记录，不代表 CaresLink 分发线索、撮合转介或背书服务质量。",
      listTitle: "跟进记录",
      listDescription: "按最近创建时间显示当前服务商的跟进记录。",
      followUpQueueTitle: "需要跟进",
      followUpQueueDescription:
        "优先处理已标记为待跟进，或已经设置下次跟进日期的联系人。",
      recentSendsTitle: "最近发送",
      recentSendsDescription:
        "查看最近把 Referral Pack 发给了谁，以及当前回应状态。",
      empty: "还没有跟进记录。先从 Referral Pack 复制材料并记录一次发送。",
      noFollowUps: "暂无需要跟进的联系人。",
      saved: "跟进记录已保存。",
      updated: "跟进记录已更新。",
      loginRequired: "需要真实服务商账号登录后才能保存记录。",
      missingRecipient: "请填写联系人姓名。",
      notFound: "没有找到对应材料草稿。",
      genericError: "记录没有保存，请稍后重试。",
      referralPack: "打开 Referral Pack",
      recipientName: "联系人姓名",
      organisation: "机构 / 组织",
      roleType: "联系人类型",
      channel: "渠道",
      status: "状态",
      lastContactedAt: "上次联系日期",
      nextFollowUpAt: "下次跟进日期",
      notes: "备注",
      save: "保存记录",
      update: "更新记录",
      updateTitle: "更新跟进状态",
      previewOnly:
        "预览模式可以查看表格，但只有真实服务商登录后才能保存跟进记录。",
      metricsTitle: "跟进状态",
      total: "总记录",
      sent: "已发送",
      replied: "已回应",
      followUp: "待跟进",
      boundaryTitle: "使用边界",
      roleOptions: {
        support_coordinator: "支持协调员",
        provider: "其他服务商",
        community_group: "社区群组",
        case_manager: "个案经理",
        family_contact: "家庭联系人",
        other: "其他",
      } satisfies Record<OutreachRecipientRole, string>,
      channelOptions: {
        wechat: "WeChat",
        whatsapp: "WhatsApp",
        email: "Email",
        phone: "Phone",
        in_person: "In person",
        other: "Other",
      } satisfies Record<OutreachChannel, string>,
      statusOptions: {
        to_send: "待发送",
        sent: "已发送",
        replied: "已回应",
        follow_up: "待跟进",
        not_suitable: "不适合",
      } satisfies Record<OutreachStatus, string>,
    };
  }

  return {
    eyebrow: "Outreach",
    title: "Follow-up assistant",
    description:
      "See which Referral Pack sends need follow-up, update reply status, and record new outreach.",
    addTitle: "Add or record a send",
    addDescription:
      "This is the provider's own operating record for follow-up and general business operations.",
    listTitle: "Recent sends",
    listDescription: "Current provider send records, newest first.",
    followUpQueueTitle: "Needs follow-up",
    followUpQueueDescription:
      "Prioritise contacts marked for follow-up or records with a next follow-up date.",
    recentSendsTitle: "Recent sends",
    recentSendsDescription:
      "See who received the Referral Pack and the current reply state.",
    empty:
      "No outreach records yet. Start from the Referral Pack, copy material, and record a send.",
    noFollowUps: "No follow-ups due yet.",
    saved: "Outreach record saved.",
    updated: "Outreach record updated.",
    loginRequired: "Sign in with a real provider account to save records.",
    missingRecipient: "Add a recipient name first.",
    notFound: "Material draft not found.",
    genericError: "Record was not saved. Try again later.",
    referralPack: "Open Referral Pack",
    recipientName: "Recipient name",
    organisation: "Organisation",
    roleType: "Recipient type",
    channel: "Channel",
    status: "Status",
    lastContactedAt: "Last contacted",
    nextFollowUpAt: "Next follow-up",
    notes: "Notes",
    save: "Save record",
    update: "Update record",
    updateTitle: "Update follow-up",
    previewOnly:
      "Preview mode can show the tracker, but only a real provider login can save outreach records.",
    metricsTitle: "Outreach status",
    total: "Total records",
    sent: "Sent",
    replied: "Replied",
    followUp: "Follow-up due",
    boundaryTitle: "Use boundary",
    roleOptions: {
      support_coordinator: "Support coordinator",
      provider: "Provider",
      community_group: "Community group",
      case_manager: "Case manager",
      family_contact: "Family contact",
      other: "Other",
    } satisfies Record<OutreachRecipientRole, string>,
    channelOptions: {
      wechat: "WeChat",
      whatsapp: "WhatsApp",
      email: "Email",
      phone: "Phone",
      in_person: "In person",
      other: "Other",
    } satisfies Record<OutreachChannel, string>,
    statusOptions: {
      to_send: "To send",
      sent: "Sent",
      replied: "Replied",
      follow_up: "Follow up",
      not_suitable: "Not suitable",
    } satisfies Record<OutreachStatus, string>,
  };
}

export default async function OutreachPage({ searchParams }: OutreachPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const gate = await getWorkspaceAccessGateWithServerSession(params);

  if (gate.status === "signed_out") {
    return (
      <ReferralWorkspaceLoginGate
        copy={copy}
        locale={locale}
        loginHref={withAuthHandoffParams("/auth/login", params)}
        registerHref={withAuthHandoffParams("/auth/register", params)}
      />
    );
  }

  if (gate.account.role === "admin") {
    return (
      <ReferralWorkspaceAdminGate
        copy={copy}
        locale={locale}
        accountId={gate.account.id}
      />
    );
  }

  return ProviderOutreach({ gate, locale, params });
}

async function ProviderOutreach({
  gate,
  locale,
  params,
}: {
  gate: SignedInGate;
  locale: Locale;
  params: OutreachSearchParams | undefined;
}) {
  const outreachCopy = getOutreachCopy(locale);
  const { handoff, resolvedDraft, profile, withHandoff } =
    await getProviderWorkspaceContext({ gate, params });
  const canSaveOutreach = isSupabaseAuthUserId(gate.account.id);
  const outreachPostAction = canSaveOutreach
    ? "/api/outreach-records"
    : undefined;
  const canReadOutreach = getOutreachStore().kind === "memory" || canSaveOutreach;
  const outreachRecords = canReadOutreach
    ? await getOutreachStore().listOutreachByUser({
        userId: gate.account.id,
        providerDraftId: resolvedDraft?.record?.id,
        limit: 100,
      })
    : [];
  const followUpRecords = getFollowUpRecords(outreachRecords);
  const recentSendRecords = getRecentSendRecords(outreachRecords);
  const statusMessage = getOutreachStatusMessage(
    params?.outreachStatus,
    outreachCopy,
  );
  const signedInHref = (href: string) =>
    gate.source === "demo"
      ? withWorkspaceAccount(withLocale(withHandoff(href), locale), gate.account.id)
      : withLocale(withHandoff(href), locale);

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={
        gate.source === "demo"
          ? withWorkspaceAccount(withHandoff("/referral-workspace/outreach"), gate.account.id)
          : withHandoff("/referral-workspace/outreach")
      }
      workspaceAccountId={gate.source === "demo" ? gate.account.id : undefined}
      workspaceRole={gate.account.role}
      workspaceSessionSource={gate.source}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0f766e]">
            {outreachCopy.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#17211f]">
            {outreachCopy.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
            {outreachCopy.description}
          </p>
        </div>
        <ButtonLink href={signedInHref("/referral-workspace/referral-pack")}>
          {outreachCopy.referralPack}
          <ArrowRight className="size-4" aria-hidden="true" />
        </ButtonLink>
      </div>

      <WorkspaceGrid
        main={
          <WorkspaceMainPanel>
            {statusMessage ? (
              <div className="rounded-lg border border-[#c9d8cf] bg-[#f3f8f4] p-3 text-sm font-semibold text-[#334a3e]">
                {statusMessage}
              </div>
            ) : null}

            <WorkspaceSection
              title={outreachCopy.followUpQueueTitle}
              description={outreachCopy.followUpQueueDescription}
              action={
                <WorkspaceStatusPill tone={followUpRecords.length ? "warning" : "neutral"}>
                  {followUpRecords.length}
                </WorkspaceStatusPill>
              }
            >
              <OutreachTable
                records={followUpRecords}
                copy={outreachCopy}
                locale={locale}
                source={handoff.source}
                draftId={handoff.draftId}
                canSaveOutreach={canSaveOutreach}
                outreachPostAction={outreachPostAction}
                emptyMessage={outreachCopy.noFollowUps}
              />
            </WorkspaceSection>

            <WorkspaceSection
              title={outreachCopy.recentSendsTitle}
              description={outreachCopy.recentSendsDescription}
              action={
                <WorkspaceStatusPill tone={recentSendRecords.length ? "success" : "neutral"}>
                  {recentSendRecords.length}
                </WorkspaceStatusPill>
              }
            >
              <OutreachTable
                records={recentSendRecords}
                copy={outreachCopy}
                locale={locale}
                source={handoff.source}
                draftId={handoff.draftId}
                canSaveOutreach={canSaveOutreach}
                outreachPostAction={outreachPostAction}
              />
            </WorkspaceSection>

            <WorkspaceSection
              title={outreachCopy.addTitle}
              description={outreachCopy.addDescription}
            >
              <OutreachForm
                copy={outreachCopy}
                locale={locale}
                providerDraftId={resolvedDraft?.record?.id}
                source={handoff.source}
                draftId={handoff.draftId}
                canSaveOutreach={canSaveOutreach}
                outreachPostAction={outreachPostAction}
              />
            </WorkspaceSection>
          </WorkspaceMainPanel>
        }
        rightRail={
          <WorkspaceRightRail>
            <WorkspaceSection
              title={outreachCopy.metricsTitle}
              description={profile.name}
            >
              <WorkspaceSignalRow
                title={outreachCopy.total}
                detail={outreachRecords[0]?.recipientName ?? outreachCopy.empty}
                status={outreachRecords.length}
                tone={outreachRecords.length ? "success" : "neutral"}
              />
              <WorkspaceSignalRow
                title={outreachCopy.sent}
                detail={getLatestByStatus(outreachRecords, "sent")?.recipientName ?? "-"}
                status={outreachRecords.filter((record) => record.status === "sent").length}
                tone="success"
              />
              <WorkspaceSignalRow
                title={outreachCopy.replied}
                detail={getLatestByStatus(outreachRecords, "replied")?.recipientName ?? "-"}
                status={outreachRecords.filter((record) => record.status === "replied").length}
                tone={outreachRecords.some((record) => record.status === "replied") ? "success" : "neutral"}
              />
              <WorkspaceSignalRow
                title={outreachCopy.followUp}
                detail={getLatestByStatus(outreachRecords, "follow_up")?.recipientName ?? "-"}
                status={outreachRecords.filter((record) => record.status === "follow_up").length}
                tone={outreachRecords.some((record) => record.status === "follow_up") ? "warning" : "neutral"}
              />
            </WorkspaceSection>

            {!canSaveOutreach ? (
              <WorkspaceSection title={outreachCopy.save}>
                <p className="text-sm leading-6 text-[#40504b]">
                  {outreachCopy.previewOnly}
                </p>
              </WorkspaceSection>
            ) : null}

            <WorkspaceSection title={outreachCopy.boundaryTitle}>
              <TrustBoundaryNotice className="border-0 bg-transparent p-0" locale={locale} />
            </WorkspaceSection>
          </WorkspaceRightRail>
        }
      />
    </AppShell>
  );
}

function OutreachForm({
  copy,
  locale,
  providerDraftId,
  source,
  draftId,
  canSaveOutreach,
  outreachPostAction,
}: {
  copy: ReturnType<typeof getOutreachCopy>;
  locale: Locale;
  providerDraftId?: string;
  source?: string;
  draftId?: string;
  canSaveOutreach: boolean;
  outreachPostAction?: string;
}) {
  return (
    <form
      action={outreachPostAction}
      method="post"
      className="grid gap-4"
    >
      <input type="hidden" name="redirectTo" value="/referral-workspace/outreach" />
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="source" value={source ?? ""} />
      <input type="hidden" name="draftId" value={draftId ?? ""} />
      <input type="hidden" name="providerDraftId" value={providerDraftId ?? ""} />
      <div className="grid gap-3 md:grid-cols-2">
        <FieldLabel>
          {copy.recipientName}
          <TextInput name="recipientName" required disabled={!canSaveOutreach} />
        </FieldLabel>
        <FieldLabel>
          {copy.organisation}
          <TextInput name="organisation" disabled={!canSaveOutreach} />
        </FieldLabel>
        <FieldLabel>
          {copy.roleType}
          <SelectInput name="roleType" defaultValue="support_coordinator" disabled={!canSaveOutreach}>
            {Object.entries(copy.roleOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
        <FieldLabel>
          {copy.channel}
          <SelectInput name="channel" defaultValue="wechat" disabled={!canSaveOutreach}>
            {Object.entries(copy.channelOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
        <FieldLabel>
          {copy.status}
          <SelectInput name="status" defaultValue="sent" disabled={!canSaveOutreach}>
            {Object.entries(copy.statusOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
        <FieldLabel>
          {copy.lastContactedAt}
          <TextInput name="lastContactedAt" type="date" disabled={!canSaveOutreach} />
        </FieldLabel>
        <FieldLabel>
          {copy.nextFollowUpAt}
          <TextInput name="nextFollowUpAt" type="date" disabled={!canSaveOutreach} />
        </FieldLabel>
      </div>
      <FieldLabel>
        {copy.notes}
        <TextArea name="notes" disabled={!canSaveOutreach} />
      </FieldLabel>
      <div>
        <button
          type="submit"
          disabled={!canSaveOutreach}
          className="taito-primary px-4 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <Plus className="size-4" aria-hidden="true" />
          {copy.save}
        </button>
      </div>
    </form>
  );
}

function OutreachTable({
  records,
  copy,
  locale,
  source,
  draftId,
  canSaveOutreach,
  outreachPostAction,
  emptyMessage,
}: {
  records: OutreachRecord[];
  copy: ReturnType<typeof getOutreachCopy>;
  locale: Locale;
  source?: string;
  draftId?: string;
  canSaveOutreach: boolean;
  outreachPostAction?: string;
  emptyMessage?: string;
}) {
  if (!records.length) {
    return <p className="text-sm leading-6 text-[#65736f]">{emptyMessage ?? copy.empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[#e3ddd2] text-xs uppercase tracking-[0.08em] text-[#65736f]">
          <tr>
            <th className="py-2 pr-4">{copy.recipientName}</th>
            <th className="py-2 pr-4">{copy.roleType}</th>
            <th className="py-2 pr-4">{copy.channel}</th>
            <th className="py-2 pr-4">{copy.status}</th>
            <th className="py-2 pr-4">{copy.nextFollowUpAt}</th>
            <th className="py-2 pr-4">{copy.notes}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e3ddd2]">
          {records.map((record) => (
            <Fragment key={record.id}>
              <tr>
                <td className="py-3 pr-4 align-top">
                  <p className="font-semibold text-[#17211f]">
                    {record.recipientName}
                  </p>
                  {record.organisation ? (
                    <p className="mt-1 text-xs text-[#65736f]">
                      {record.organisation}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-4 align-top">
                  {copy.roleOptions[record.roleType]}
                </td>
                <td className="py-3 pr-4 align-top">
                  {copy.channelOptions[record.channel]}
                </td>
                <td className="py-3 pr-4 align-top">
                  <span className="inline-flex rounded-md border border-[#dce8e2] bg-[#f8fbfa] px-2 py-1 text-xs font-semibold text-[#40504b]">
                    {copy.statusOptions[record.status]}
                  </span>
                </td>
                <td className="py-3 pr-4 align-top">
                  {record.nextFollowUpAt
                    ? formatDate(record.nextFollowUpAt, locale)
                    : "-"}
                </td>
                <td className="max-w-xs py-3 pr-4 align-top text-[#65736f]">
                  {record.notes ?? "-"}
                </td>
              </tr>
              <tr>
                <td colSpan={6} className="pb-4 pr-4">
                  <form
                    action={outreachPostAction}
                    method="post"
                    className="grid gap-3 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3 md:grid-cols-[10rem_10rem_10rem_minmax(14rem,1fr)_auto]"
                  >
                    <input type="hidden" name="mode" value="update" />
                    <input
                      type="hidden"
                      name="outreachRecordId"
                      value={record.id}
                    />
                    <input
                      type="hidden"
                      name="redirectTo"
                      value="/referral-workspace/outreach"
                    />
                    <input type="hidden" name="lang" value={locale} />
                    <input type="hidden" name="source" value={source ?? ""} />
                    <input type="hidden" name="draftId" value={draftId ?? ""} />
                    <FieldLabel>
                      {copy.status}
                      <SelectInput
                        name="status"
                        defaultValue={record.status}
                        disabled={!canSaveOutreach}
                      >
                        {Object.entries(copy.statusOptions).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </SelectInput>
                    </FieldLabel>
                    <FieldLabel>
                      {copy.lastContactedAt}
                      <TextInput
                        name="lastContactedAt"
                        type="date"
                        defaultValue={record.lastContactedAt ?? ""}
                        disabled={!canSaveOutreach}
                      />
                    </FieldLabel>
                    <FieldLabel>
                      {copy.nextFollowUpAt}
                      <TextInput
                        name="nextFollowUpAt"
                        type="date"
                        defaultValue={record.nextFollowUpAt ?? ""}
                        disabled={!canSaveOutreach}
                      />
                    </FieldLabel>
                    <FieldLabel>
                      {copy.notes}
                      <TextArea
                        name="notes"
                        defaultValue={record.notes ?? ""}
                        disabled={!canSaveOutreach}
                      />
                    </FieldLabel>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={!canSaveOutreach}
                        className="taito-secondary px-3 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {copy.update}
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getFollowUpRecords(records: OutreachRecord[]) {
  return records.filter(
    (record) => record.status === "follow_up" || Boolean(record.nextFollowUpAt),
  );
}

function getRecentSendRecords(records: OutreachRecord[]) {
  return records.filter(
    (record) => record.status !== "follow_up" && !record.nextFollowUpAt,
  );
}

function getLatestByStatus(records: OutreachRecord[], status: OutreachStatus) {
  return records.find((record) => record.status === status);
}

function getOutreachStatusMessage(
  value: string | string[] | undefined,
  copy: ReturnType<typeof getOutreachCopy>,
) {
  const status = Array.isArray(value) ? value[0] : value;

  if (status === "saved") {
    return copy.saved;
  }

  if (status === "updated") {
    return copy.updated;
  }

  if (status === "login-required") {
    return copy.loginRequired;
  }

  if (status === "missing-recipient") {
    return copy.missingRecipient;
  }

  if (status === "not-found") {
    return copy.notFound;
  }

  if (status) {
    return copy.genericError;
  }

  return undefined;
}

function formatDate(value: string, locale: Locale) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en-AU", {
    dateStyle: "medium",
  }).format(date);
}

function isSupabaseAuthUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
