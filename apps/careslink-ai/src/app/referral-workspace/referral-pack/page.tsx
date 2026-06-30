import { ArrowRight, ClipboardCheck, PackageCheck, Send } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { GeneratedDraftCopyButton } from "@/components/generated-draft-copy-button";
import {
  ReferralWorkspaceAdminGate,
  ReferralWorkspaceLoginGate,
} from "@/components/referral-workspace-auth-gate";
import { TrustBoundaryNotice } from "@/components/referral-profile-workspace";
import {
  ButtonLink,
  FieldLabel,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  WorkspaceGrid,
  WorkspaceMainPanel,
  WorkspaceRightRail,
  WorkspaceSection,
  WorkspaceSignalRow,
  WorkspaceStatusPill,
} from "@/components/workspace-layout";
import {
  getGeneratedMaterialDraftStore,
  type GeneratedMaterialDraftRecord,
} from "@/lib/generated-material-draft-store";
import {
  getOutreachStore,
  type OutreachRecipientRole,
} from "@/lib/outreach-store";
import {
  buildReferralPackTargetCopy,
  referralPackTargetOptions,
  type ReferralPackTarget,
  type ReferralPackTargetCopy,
} from "@/lib/referral-pack-target-copy";
import { withWorkspaceAccount } from "@/lib/referral-workspace-auth";
import { withAuthHandoffParams } from "@/lib/referral-workspace-handoff";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";
import { getProviderWorkspaceContext } from "@/lib/referral-workspace-provider-context";
import { getWorkspaceAccessGateWithServerSession } from "@/lib/referral-workspace-session";

type ReferralPackSearchParams = {
  [key: string]: string | string[] | undefined;
};

type ReferralPackPageProps = {
  searchParams?: Promise<ReferralPackSearchParams>;
};

type SignedInGate = Awaited<
  ReturnType<typeof getWorkspaceAccessGateWithServerSession>
> & { status: "signed_in" };

type ReferralPackItem = {
  id: string;
  feature: "profile_intro" | GeneratedMaterialDraftRecord["feature"];
  title: string;
  description: string;
  label: string;
  copyText: string;
  generatedMaterialDraftId?: string;
};

function getReferralPackCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      eyebrow: "Referral Pack",
      title: "转介材料包",
      description:
        "把当前服务商资料和已保存草稿整理成一组可复核、可复制、可记录发送状态的材料。",
      primaryAction: "记录一次发送",
      secondaryAction: "查看跟进表",
      packTitle: "可发送材料",
      packDescription:
        "复制前请由服务商自行复核。这些内容仅用于一般商业资料和运营支持。",
      targetTitle: "选择要发给谁",
      targetDescription:
        "不同转介对象需要不同重点。先选对象，再复制最适合的介绍并记录发送。",
      noDrafts:
        "还没有保存的生成草稿。你仍然可以先复制基础资料介绍。",
      markSent: "记录已发送",
      recipientPlaceholder: "联系人姓名",
      channelLabel: "渠道",
      roleLabel: "联系人类型",
      nextFollowUpAtLabel: "下次跟进",
      notesLabel: "备注",
      notesPlaceholder: "例如：微信群已发送，3 天后跟进。",
      sendStatusSaved: "发送记录已保存，下次跟进日期已设置。",
      sendStatusLoginRequired:
        "需要真实服务商账号登录后才能保存发送记录。",
      sendStatusMissingRecipient: "请填写联系人姓名。",
      sendStatusNotFound: "没有找到对应材料草稿。",
      sendStatusGeneric: "发送记录没有保存，请稍后重试。",
      packReadinessTitle: "材料包状态",
      packReadinessDescription: "基于当前资料和已保存草稿。",
      packItems: "材料项",
      outreachRecorded: "已记录发送",
      followUps: "待跟进",
      profileIntroLabel: "基础资料介绍",
      profileIntroDescription: "来自服务商自填资料的简短介绍。",
      generatedDraftLabel: "已保存草稿",
      emptyStateTitle: "可以先发送基础资料介绍",
      emptyStateDescription:
        "还没有 AI 生成材料时，Referral Pack 仍然可以用服务商自填资料形成一个简短介绍。需要更多文案时，可以到材料页生成或复核草稿。",
      materialsAction: "查看材料页",
      groups: {
        profile_intro: {
          title: "基础资料介绍",
          description: "基于服务商自填资料的基础介绍。",
        },
        profile_rewrite: {
          title: "资料改写",
          description: "更正式的服务商资料介绍草稿。",
        },
        referral_message: {
          title: "转介沟通文案",
          description: "适合发给转介伙伴的沟通文案。",
        },
        share_card: {
          title: "分享卡片",
          description: "适合快速分享的服务商摘要卡片。",
        },
        bilingual_intro: {
          title: "双语介绍",
          description: "适合多语言社区沟通的介绍。",
        },
        handover_checklist: {
          title: "交接清单",
          description: "用于跟进转介交接信息的清单草稿。",
        },
      },
      realLoginRequired:
        "预览模式可以查看材料包，但只有真实服务商登录后才能保存发送记录。",
      boundaryTitle: "使用边界",
      copy: "复制",
      copyTarget: "复制这段文案",
      copied: "已复制",
      recordThisSend: "记录这次发送",
      recordSendHint: "复制后填写联系人，方便之后跟进。",
      targetBadge: "发送对象",
      roleOptions: {
        support_coordinator: "支持协调员",
        provider: "其他服务商",
        community_group: "社区群组",
        case_manager: "个案经理",
        family_contact: "家庭联系人",
        other: "其他",
      },
      targetDetails: {
        support_coordinator: "强调服务范围、适合对象、接收方式和回应时间。",
        provider: "强调你能接收或配合的服务边界，以及交接需要的信息。",
        community_group: "使用简短、双语或社区语言介绍，方便转发到群组。",
        case_manager: "强调转介适配、联系路径和需要提前准备的信息。",
        family_contact: "用更容易理解的语言说明服务内容、地区和下一步。",
        other: "保留通用介绍，发送前根据对象手动调整。",
      },
      channelOptions: {
        wechat: "WeChat",
        whatsapp: "WhatsApp",
        email: "Email",
        phone: "Phone",
        in_person: "In person",
        other: "Other",
      },
    };
  }

  return {
    eyebrow: "Referral Pack",
    title: "Referral Pack",
    description:
      "Collect the current provider profile and saved drafts into reviewable materials that can be copied, sent, and tracked.",
    primaryAction: "Record a send",
    secondaryAction: "View outreach",
    packTitle: "Ready-to-send materials",
    packDescription:
      "Provider review is required before sharing. These drafts are general business profile and operational support only.",
    targetTitle: "Choose who you are sending to",
    targetDescription:
      "Different referral contacts need different emphasis. Pick a target, copy the best-fit wording, then record the send.",
    noDrafts:
      "No saved generated drafts yet. You can still copy the basic profile intro.",
    markSent: "Mark as sent",
    recipientPlaceholder: "Recipient name",
    channelLabel: "Channel",
    roleLabel: "Recipient type",
    nextFollowUpAtLabel: "Next follow-up",
    notesLabel: "Notes",
    notesPlaceholder: "Example: Sent in WeChat group, follow up in 3 days.",
    sendStatusSaved: "Send record saved with a follow-up date.",
    sendStatusLoginRequired:
      "Sign in with a real provider account to save outreach records.",
    sendStatusMissingRecipient: "Add a recipient name first.",
    sendStatusNotFound: "Material draft not found.",
    sendStatusGeneric: "Send record was not saved. Try again later.",
    packReadinessTitle: "Pack status",
    packReadinessDescription: "Based on the current profile and saved drafts.",
    packItems: "Pack items",
    outreachRecorded: "Sends recorded",
    followUps: "Follow-ups due",
    profileIntroLabel: "Basic profile intro",
    profileIntroDescription: "Short intro based on provider-submitted details.",
    generatedDraftLabel: "Saved draft",
    emptyStateTitle: "Start with the basic profile intro",
    emptyStateDescription:
      "When no generated drafts have been saved yet, the Referral Pack can still use the provider-submitted profile intro. Generate or review saved materials when you need more tailored wording.",
    materialsAction: "View materials",
    groups: {
      profile_intro: {
        title: "Profile intro",
        description: "Basic introduction from provider-submitted details.",
      },
      profile_rewrite: {
        title: "Profile rewrite",
        description: "More polished provider profile wording.",
      },
      referral_message: {
        title: "Referral message",
        description: "Message draft for referral partners.",
      },
      share_card: {
        title: "Share card",
        description: "Compact provider summary for quick sharing.",
      },
      bilingual_intro: {
        title: "Bilingual intro",
        description: "Multilingual community introduction draft.",
      },
      handover_checklist: {
        title: "Handover checklist",
        description: "Follow-up checklist for referral handover details.",
      },
    },
    realLoginRequired:
      "Preview mode can show the pack, but only a real provider login can save outreach records.",
    boundaryTitle: "Use boundary",
    copy: "Copy",
    copyTarget: "Copy target wording",
    copied: "Copied",
    recordThisSend: "Record this send",
    recordSendHint: "After copying, add the recipient so follow-up is easier.",
    targetBadge: "Target",
    roleOptions: {
      support_coordinator: "Support coordinator",
      provider: "Provider",
      community_group: "Community group",
      case_manager: "Case manager",
      family_contact: "Family contact",
      other: "Other",
    },
    targetDetails: {
      support_coordinator:
        "Emphasise service area, best-fit client types, intake path, and response expectations.",
      provider:
        "Emphasise service boundaries, handover details, and how another provider should introduce you.",
      community_group:
        "Use short, bilingual, or community-language wording that can be forwarded safely.",
      case_manager:
        "Emphasise referral fit, contact path, and the information needed before introduction.",
      family_contact:
        "Use plain language about services, location, contact path, and next step.",
      other:
        "Use the general pack intro and adjust manually before sending.",
    },
    channelOptions: {
      wechat: "WeChat",
      whatsapp: "WhatsApp",
      email: "Email",
      phone: "Phone",
      in_person: "In person",
      other: "Other",
    },
  };
}

export default async function ReferralPackPage({
  searchParams,
}: ReferralPackPageProps) {
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

  return ProviderReferralPack({ gate, locale, params });
}

async function ProviderReferralPack({
  gate,
  locale,
  params,
}: {
  gate: SignedInGate;
  locale: Locale;
  params: ReferralPackSearchParams | undefined;
}) {
  const copy = getReferralWorkspaceCopy(locale);
  const packCopy = getReferralPackCopy(locale);
  const { handoff, resolvedDraft, profile, summary, audit, withHandoff } =
    await getProviderWorkspaceContext({ gate, params });
  const canReadSavedMaterials =
    getGeneratedMaterialDraftStore().kind === "memory" ||
    isSupabaseAuthUserId(gate.account.id);
  const materialDrafts = canReadSavedMaterials
    ? await getGeneratedMaterialDraftStore().listGeneratedMaterialDraftsByUser({
        userId: gate.account.id,
        providerDraftId: resolvedDraft?.record?.id,
        limit: 25,
      })
    : [];
  const outreachRecords =
    getOutreachStore().kind === "memory" || isSupabaseAuthUserId(gate.account.id)
      ? await getOutreachStore().listOutreachByUser({
          userId: gate.account.id,
          providerDraftId: resolvedDraft?.record?.id,
          limit: 50,
        })
      : [];
  const items = getReferralPackItems({
    profile,
    summary,
    materialDrafts,
    locale,
    copy: packCopy,
  });
  const targetCopies = referralPackTargetOptions.map((target) =>
    buildReferralPackTargetCopy({
      profile,
      target: target.id,
      locale,
    }),
  );
  const groups = getReferralPackGroups(items, packCopy);
  const canSaveOutreach = isSupabaseAuthUserId(gate.account.id);
  const outreachPostAction = canSaveOutreach
    ? "/api/outreach-records"
    : undefined;
  const defaultFollowUpDate = getDefaultFollowUpDate();
  const statusMessage = getOutreachStatusMessage(
    params?.outreachStatus,
    packCopy,
  );
  const signedInHref = (href: string) =>
    gate.source === "demo"
      ? withWorkspaceAccount(
          withLocale(withHandoff(href), locale),
          gate.account.id,
        )
      : withLocale(withHandoff(href), locale);

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={
        gate.source === "demo"
          ? withWorkspaceAccount(
              withHandoff("/referral-workspace/referral-pack"),
              gate.account.id,
            )
          : withHandoff("/referral-workspace/referral-pack")
      }
      workspaceAccountId={gate.source === "demo" ? gate.account.id : undefined}
      workspaceRole={gate.account.role}
      workspaceSessionSource={gate.source}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#0f766e]">
            {packCopy.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-[#17211f]">
            {packCopy.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
            {packCopy.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="#record-send-profile-intro">
            <Send className="size-4" aria-hidden="true" />
            {packCopy.primaryAction}
          </ButtonLink>
          <ButtonLink
            href={signedInHref("/referral-workspace/outreach")}
            variant="secondary"
          >
            {packCopy.secondaryAction}
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        </div>
      </div>

      <WorkspaceGrid
        main={
          <WorkspaceMainPanel>
            {statusMessage ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#c9d8cf] bg-[#f3f8f4] p-3 text-sm font-semibold text-[#334a3e]">
                <span>{statusMessage}</span>
                {isOutreachSuccessStatus(params?.outreachStatus) ? (
                  <ButtonLink
                    href={signedInHref("/referral-workspace/outreach")}
                    variant="secondary"
                  >
                    {packCopy.secondaryAction}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}

            <WorkspaceSection
              title={packCopy.targetTitle}
              description={packCopy.targetDescription}
            >
              <TargetCopyCards
                targetCopies={targetCopies}
                copy={packCopy}
                locale={locale}
                providerDraftId={resolvedDraft?.record?.id}
                source={handoff.source}
                draftId={handoff.draftId}
                canSaveOutreach={canSaveOutreach}
                outreachPostAction={outreachPostAction}
                defaultFollowUpDate={defaultFollowUpDate}
              />
            </WorkspaceSection>

            <WorkspaceSection
              title={packCopy.packTitle}
              description={packCopy.packDescription}
              action={
                <WorkspaceStatusPill
                  tone={items.length > 1 ? "success" : "neutral"}
                >
                  {items.length} {packCopy.packItems}
                </WorkspaceStatusPill>
              }
            >
              <div className="grid gap-5">
                {groups.map((group) => (
                  <section key={group.id} className="grid gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[#17211f]">
                          {group.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-[#65736f]">
                          {group.description}
                        </p>
                      </div>
                      <WorkspaceStatusPill tone="neutral">
                        {group.items.length}
                      </WorkspaceStatusPill>
                    </div>
                    <div className="grid gap-4">
                      {group.items.map((item) => (
                        <ReferralPackItemCard
                          key={item.id}
                          item={item}
                          copy={packCopy}
                          locale={locale}
                          providerDraftId={resolvedDraft?.record?.id}
                          source={handoff.source}
                          draftId={handoff.draftId}
                          canSaveOutreach={canSaveOutreach}
                          outreachPostAction={outreachPostAction}
                          defaultFollowUpDate={defaultFollowUpDate}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {materialDrafts.length === 0 ? (
                <div className="mt-4 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-4">
                  <h3 className="text-sm font-semibold text-[#17211f]">
                    {packCopy.emptyStateTitle}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#65736f]">
                    {packCopy.emptyStateDescription}
                  </p>
                  <div className="mt-3">
                    <ButtonLink
                      href={signedInHref("/referral-workspace/materials")}
                      variant="secondary"
                    >
                      {packCopy.materialsAction}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </ButtonLink>
                  </div>
                </div>
              ) : null}
            </WorkspaceSection>
          </WorkspaceMainPanel>
        }
        rightRail={
          <WorkspaceRightRail>
            <WorkspaceSection
              title={packCopy.packReadinessTitle}
              description={packCopy.packReadinessDescription}
            >
              <WorkspaceSignalRow
                title={copy.workspace.routes.profile.label}
                detail={profile.name}
                status={`${audit.score}/100`}
                tone={audit.score >= 75 ? "success" : "warning"}
              />
              <WorkspaceSignalRow
                title={packCopy.packItems}
                detail={
                  items.length > 1
                    ? packCopy.generatedDraftLabel
                    : packCopy.profileIntroLabel
                }
                status={items.length}
                tone={items.length > 1 ? "success" : "neutral"}
              />
              <WorkspaceSignalRow
                title={packCopy.outreachRecorded}
                detail={
                  outreachRecords[0]?.recipientName ??
                  packCopy.realLoginRequired
                }
                status={
                  outreachRecords.filter((record) => record.status === "sent")
                    .length
                }
                tone={outreachRecords.length ? "success" : "neutral"}
              />
              <WorkspaceSignalRow
                title={packCopy.followUps}
                detail={
                  outreachRecords.find(
                    (record) => record.status === "follow_up",
                  )?.recipientName ?? "-"
                }
                status={
                  outreachRecords.filter(
                    (record) => record.status === "follow_up",
                  ).length
                }
                tone={
                  outreachRecords.some(
                    (record) => record.status === "follow_up",
                  )
                    ? "warning"
                    : "neutral"
                }
              />
            </WorkspaceSection>

            {!canSaveOutreach ? (
              <WorkspaceSection title={packCopy.primaryAction}>
                <p className="text-sm leading-6 text-[#40504b]">
                  {packCopy.realLoginRequired}
                </p>
              </WorkspaceSection>
            ) : null}

            <WorkspaceSection title={packCopy.boundaryTitle}>
              <TrustBoundaryNotice
                className="border-0 bg-transparent p-0"
                locale={locale}
              />
            </WorkspaceSection>
          </WorkspaceRightRail>
        }
      />
    </AppShell>
  );
}

const targetRoleMap: Record<ReferralPackTarget, OutreachRecipientRole> = {
  support_coordinator: "support_coordinator",
  case_manager: "case_manager",
  provider_partner: "provider",
  community_group: "community_group",
  family_contact: "family_contact",
};

function TargetCopyCards({
  targetCopies,
  copy,
  locale,
  providerDraftId,
  source,
  draftId,
  canSaveOutreach,
  outreachPostAction,
  defaultFollowUpDate,
}: {
  targetCopies: ReferralPackTargetCopy[];
  copy: ReturnType<typeof getReferralPackCopy>;
  locale: Locale;
  providerDraftId?: string;
  source?: string;
  draftId?: string;
  canSaveOutreach: boolean;
  outreachPostAction?: string;
  defaultFollowUpDate: string;
}) {
  return (
    <div className="grid gap-4">
      {targetCopies.map((targetCopy) => (
        <article
          key={targetCopy.target}
          className="rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <WorkspaceStatusPill tone="neutral">
                {copy.targetBadge}
              </WorkspaceStatusPill>
              <h3 className="mt-3 text-base font-semibold text-[#17211f]">
                {targetCopy.title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#65736f]">
                {targetCopy.description}
              </p>
            </div>
            <GeneratedDraftCopyButton
              text={targetCopy.body}
              label={copy.copyTarget}
              copiedLabel={copy.copied}
              ariaLabel={`${copy.copyTarget}: ${targetCopy.title}`}
              focusAfterCopyId={`record-send-target-${targetCopy.target}`}
            />
          </div>

          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-[#e3ddd2] bg-white p-3 text-sm leading-6 text-[#40504b]">
            {targetCopy.body}
          </pre>
          <p className="mt-3 text-xs leading-5 text-[#65736f]">
            {targetCopy.reviewNote}
          </p>
          <p className="mt-3 text-xs font-semibold text-[#40504b]">
            {copy.recordSendHint}
          </p>

          <form
            id={`record-send-target-${targetCopy.target}`}
            action={outreachPostAction}
            method="post"
            className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]"
          >
            <input
              type="hidden"
              name="redirectTo"
              value="/referral-workspace/referral-pack"
            />
            <input type="hidden" name="lang" value={locale} />
            <input type="hidden" name="source" value={source ?? ""} />
            <input type="hidden" name="draftId" value={draftId ?? ""} />
            <input
              type="hidden"
              name="providerDraftId"
              value={providerDraftId ?? ""}
            />
            <input
              type="hidden"
              name="roleType"
              value={targetRoleMap[targetCopy.target]}
            />
            <input type="hidden" name="status" value="sent" />
            <FieldLabel>
              <span className="sr-only">{copy.recipientPlaceholder}</span>
              <TextInput
                name="recipientName"
                placeholder={copy.recipientPlaceholder}
                disabled={!canSaveOutreach}
              />
            </FieldLabel>
            <FieldLabel>
              <span className="sr-only">{copy.channelLabel}</span>
              <SelectInput
                name="channel"
                defaultValue="wechat"
                disabled={!canSaveOutreach}
              >
                {Object.entries(copy.channelOptions).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectInput>
            </FieldLabel>
            <FieldLabel>
              {copy.nextFollowUpAtLabel}
              <TextInput
                name="nextFollowUpAt"
                type="date"
                defaultValue={defaultFollowUpDate}
                disabled={!canSaveOutreach}
              />
            </FieldLabel>
            <button
              type="submit"
              disabled={!canSaveOutreach}
              className="taito-secondary px-3 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <ClipboardCheck className="size-4" aria-hidden="true" />
              {copy.recordThisSend}
            </button>
            <div className="md:col-span-4">
              <FieldLabel>
                {copy.notesLabel}
                <TextArea
                  name="notes"
                  placeholder={copy.notesPlaceholder}
                  disabled={!canSaveOutreach}
                />
              </FieldLabel>
            </div>
          </form>
        </article>
      ))}
    </div>
  );
}

function ReferralPackItemCard({
  item,
  copy,
  locale,
  providerDraftId,
  source,
  draftId,
  canSaveOutreach,
  outreachPostAction,
  defaultFollowUpDate,
}: {
  item: ReferralPackItem;
  copy: ReturnType<typeof getReferralPackCopy>;
  locale: Locale;
  providerDraftId?: string;
  source?: string;
  draftId?: string;
  canSaveOutreach: boolean;
  outreachPostAction?: string;
  defaultFollowUpDate: string;
}) {
  return (
    <article className="rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
            <PackageCheck
              className="size-4 text-[#0f766e]"
              aria-hidden="true"
            />
            {item.label}
          </div>
          <h2 className="mt-2 break-words text-lg font-semibold text-[#17211f]">
            {item.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#65736f]">
            {item.description}
          </p>
        </div>
        <GeneratedDraftCopyButton
          text={item.copyText}
          label={copy.copy}
          copiedLabel={copy.copied}
          ariaLabel={`${copy.copy}: ${item.title}`}
          focusAfterCopyId={`record-send-${item.id}`}
          telemetryEvent={
            item.generatedMaterialDraftId
              ? {
                  generatedMaterialDraftId: item.generatedMaterialDraftId,
                  eventType: "copy_all",
                }
              : undefined
          }
        />
      </div>

      <pre className="mt-4 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-[#e3ddd2] bg-white p-3 text-sm leading-6 text-[#40504b]">
        {item.copyText}
      </pre>
      <p className="mt-3 text-xs font-semibold text-[#40504b]">
        {copy.recordSendHint}
      </p>

      <form
        id={`record-send-${item.id}`}
        action={outreachPostAction}
        method="post"
        className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_11rem_11rem_auto]"
      >
        <input
          type="hidden"
          name="redirectTo"
          value="/referral-workspace/referral-pack"
        />
        <input type="hidden" name="lang" value={locale} />
        <input type="hidden" name="source" value={source ?? ""} />
        <input type="hidden" name="draftId" value={draftId ?? ""} />
        <input
          type="hidden"
          name="providerDraftId"
          value={providerDraftId ?? ""}
        />
        <input
          type="hidden"
          name="generatedMaterialDraftId"
          value={item.generatedMaterialDraftId ?? ""}
        />
        <input type="hidden" name="status" value="sent" />
        <FieldLabel>
          <span className="sr-only">{copy.recipientPlaceholder}</span>
          <TextInput
            name="recipientName"
            placeholder={copy.recipientPlaceholder}
            disabled={!canSaveOutreach}
          />
        </FieldLabel>
        <FieldLabel>
          <span className="sr-only">{copy.roleLabel}</span>
          <SelectInput
            name="roleType"
            defaultValue="support_coordinator"
            disabled={!canSaveOutreach}
          >
            {Object.entries(copy.roleOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
        <FieldLabel>
          <span className="sr-only">{copy.channelLabel}</span>
          <SelectInput
            name="channel"
            defaultValue="wechat"
            disabled={!canSaveOutreach}
          >
            {Object.entries(copy.channelOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
        <FieldLabel>
          {copy.nextFollowUpAtLabel}
          <TextInput
            name="nextFollowUpAt"
            type="date"
            defaultValue={defaultFollowUpDate}
            disabled={!canSaveOutreach}
          />
        </FieldLabel>
        <button
          type="submit"
          disabled={!canSaveOutreach}
          className="taito-secondary px-3 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <ClipboardCheck className="size-4" aria-hidden="true" />
          {copy.markSent}
        </button>
        <div className="md:col-span-5">
          <FieldLabel>
            {copy.notesLabel}
            <TextArea
              name="notes"
              placeholder={copy.notesPlaceholder}
              disabled={!canSaveOutreach}
            />
          </FieldLabel>
        </div>
      </form>
    </article>
  );
}

function getReferralPackItems({
  profile,
  summary,
  materialDrafts,
  locale,
  copy,
}: {
  profile: { name: string; summary: string };
  summary: ReturnType<
    typeof import("@/lib/referral-profile-workspace").summarizeProfile
  >;
  materialDrafts: GeneratedMaterialDraftRecord[];
  locale: Locale;
  copy: ReturnType<typeof getReferralPackCopy>;
}): ReferralPackItem[] {
  const profileIntro =
    locale === "zh-Hans"
      ? [
          profile.name,
          profile.summary,
          `服务范围：${summary.serviceAreaLabel}`,
          `语言：${summary.languageLabel}`,
          `转介角色：${summary.directionLabel}`,
          "基于服务商自填资料。分享前请先复核。",
        ].join("\n")
      : [
          profile.name,
          profile.summary,
          `Service area: ${summary.serviceAreaLabel}`,
          `Languages: ${summary.languageLabel}`,
          `Referral role: ${summary.directionLabel}`,
          "Based on provider-submitted information. Review before sharing.",
        ].join("\n");

  return [
    {
      id: "profile-intro",
      feature: "profile_intro",
      title: profile.name,
      description: copy.profileIntroDescription,
      label: copy.profileIntroLabel,
      copyText: profileIntro,
    },
    ...materialDrafts
      .map((draft) => getReferralPackItemFromDraft({ draft, locale, copy }))
      .filter((item): item is ReferralPackItem => Boolean(item)),
  ];
}

function getReferralPackItemFromDraft({
  draft,
  locale,
  copy,
}: {
  draft: GeneratedMaterialDraftRecord;
  locale: Locale;
  copy: ReturnType<typeof getReferralPackCopy>;
}): ReferralPackItem | undefined {
  const fields = Object.entries(draft.content)
    .map(([key, value]) => [formatFieldKey(key, locale), getString(value)] as const)
    .filter(([, value]) => Boolean(value));

  if (!fields.length) {
    return undefined;
  }

  const title = fields[0][1];
  const copyText = [
    getFeatureLabel(draft.feature, locale),
    ...fields.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

  return {
    id: draft.id,
    feature: draft.feature,
    title,
    description: `${copy.generatedDraftLabel}: ${getFeatureLabel(
      draft.feature,
      locale,
    )}`,
    label: getFeatureLabel(draft.feature, locale),
    copyText,
    generatedMaterialDraftId: draft.id,
  };
}

function getReferralPackGroups(
  items: ReferralPackItem[],
  copy: ReturnType<typeof getReferralPackCopy>,
) {
  const order: ReferralPackItem["feature"][] = [
    "profile_intro",
    "profile_rewrite",
    "referral_message",
    "share_card",
    "bilingual_intro",
    "handover_checklist",
  ];

  return order
    .map((feature) => ({
      id: feature,
      title: copy.groups[feature].title,
      description: copy.groups[feature].description,
      items: items.filter((item) => item.feature === feature),
    }))
    .filter((group) => group.items.length > 0);
}

function getFeatureLabel(
  feature: GeneratedMaterialDraftRecord["feature"],
  locale: Locale,
) {
  const labels = {
    profile_rewrite: locale === "zh-Hans" ? "资料改写草稿" : "Profile rewrite",
    share_card: locale === "zh-Hans" ? "分享卡片" : "Share card",
    referral_message:
      locale === "zh-Hans" ? "转介沟通文案" : "Referral message",
    bilingual_intro: locale === "zh-Hans" ? "双语介绍" : "Bilingual intro",
    handover_checklist:
      locale === "zh-Hans" ? "交接清单" : "Handover checklist",
  };

  return labels[feature] ?? feature;
}

function formatFieldKey(value: string, locale: Locale) {
  const zhLabels: Record<string, string> = {
    professionalEnglishDescription: "英文介绍",
    shortEnglishSummary: "英文摘要",
    chineseCommunityIntro: "中文社区介绍",
    referralPartnerSummary: "转介方摘要",
    profileImprovementNotes: "资料改进说明",
    disclaimer: "说明",
    headline: "标题",
    subheadline: "副标题",
    serviceArea: "服务范围",
    languages: "语言",
    referralFit: "适合转介",
    intakePath: "接收路径",
    subjectLine: "主题",
    opening: "开场",
    providerSummary: "服务商摘要",
    handoverRequest: "交接请求",
    nextStep: "下一步",
    englishIntro: "英文介绍",
    communityLanguageIntro: "社区语言介绍",
    sharingContext: "分享场景",
    checklistTitle: "清单标题",
    consentCheck: "同意确认",
    clientContext: "对象背景",
    supportNeed: "支持需求",
    handoverDetails: "交接详情",
  };

  if (locale === "zh-Hans") {
    return zhLabels[value] ?? "字段";
  }

  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getDefaultFollowUpDate(now = new Date()) {
  const followUpDate = new Date(now);

  followUpDate.setDate(followUpDate.getDate() + 3);

  return followUpDate.toISOString().slice(0, 10);
}

function getOutreachStatusMessage(
  value: string | string[] | undefined,
  copy: ReturnType<typeof getReferralPackCopy>,
) {
  const status = Array.isArray(value) ? value[0] : value;

  if (status === "saved") {
    return copy.sendStatusSaved;
  }

  if (status === "updated") {
    return copy.sendStatusSaved;
  }

  if (status === "login-required") {
    return copy.sendStatusLoginRequired;
  }

  if (status === "missing-recipient") {
    return copy.sendStatusMissingRecipient;
  }

  if (status === "not-found") {
    return copy.sendStatusNotFound;
  }

  if (status) {
    return copy.sendStatusGeneric;
  }

  return undefined;
}

function isOutreachSuccessStatus(value: string | string[] | undefined) {
  const status = Array.isArray(value) ? value[0] : value;

  return status === "saved" || status === "updated";
}

function isSupabaseAuthUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
