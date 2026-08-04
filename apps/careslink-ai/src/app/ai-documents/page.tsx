import type { Metadata } from "next";
import {
  ArrowRight,
  FileCheck2,
  FileText,
  FolderOpen,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { GeneratedDraftDeleteButton } from "@/components/generated-draft-delete-button";
import { ReferralWorkspaceLoginGate } from "@/components/referral-workspace-auth-gate";
import {
  getAccountCreditStore,
  type AccountCreditSummary,
} from "@/lib/account-credit-store";
import {
  getGeneratedMaterialDraftStore,
  type GeneratedMaterialDraftRecord,
} from "@/lib/generated-material-draft-store";
import { parseNdisCaseNoteMaterial } from "@/lib/ndis-case-note-companion";
import { withWorkspaceAccount } from "@/lib/referral-workspace-auth";
import { getWorkspaceAccessGateWithServerSession } from "@/lib/referral-workspace-session";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "AI Documents",
  description:
    "Create and review guided document drafts, then return to owner-scoped saved work.",
};

export default async function AiDocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getAiDocumentsCopy(locale);
  const workspaceCopy = getReferralWorkspaceCopy(locale);
  const gate = await getWorkspaceAccessGateWithServerSession(params);

  if (gate.status === "signed_out") {
    return (
      <ReferralWorkspaceLoginGate
        copy={workspaceCopy}
        locale={locale}
        languageSwitcherHref="/ai-documents"
        loginHref="/auth/login?next=%2Fai-documents"
        registerHref="/auth/register?next=%2Fai-documents"
      />
    );
  }

  const accountParam = gate.source === "demo" ? gate.account.id : undefined;
  const href = (path: string) =>
    withWorkspaceAccount(withLocale(path, locale), accountParam);

  if (gate.account.role === "admin") {
    return (
      <AppShell
        locale={locale}
        languageSwitcherHref="/admin/access-requests"
        workspaceRole="admin"
        workspaceSessionSource={gate.source}
        workspaceAccountId={accountParam}
      >
        <section className="document-paper mx-auto max-w-4xl p-6 sm:p-8">
          <p className="micro-label">{copy.adminEyebrow}</p>
          <h1 className="document-title mt-3">{copy.adminTitle}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            {copy.adminDescription}
          </p>
          <Link
            href={href("/admin/material-usage")}
            className="jade-action mt-6"
          >
            {copy.openMaterialUsage}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </AppShell>
    );
  }

  const [savedDrafts, creditUsage] = await Promise.all([
    getOwnerDrafts(gate.account.id),
    getCreditUsage(gate.account.id, gate.source === "supabase"),
  ]);
  const latestDraft = savedDrafts[0];

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref="/ai-documents"
      workspaceAccountId={accountParam}
      workspaceRole="provider"
      workspaceSessionSource={gate.source}
    >
      <div className="mx-auto max-w-[1380px]">
        <header className="document-paper overflow-hidden">
          <div className="grid gap-6 p-6 sm:p-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div>
              <p className="micro-label">{copy.eyebrow}</p>
              <h1 className="document-title mt-3 max-w-3xl">{copy.title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                {copy.description}
              </p>
            </div>
            <Link
              href={href("/template-companion/ndis-case-note")}
              className="coral-action w-full sm:w-auto"
            >
              <FileText className="size-4" aria-hidden="true" />
              {copy.createCaseNote}
            </Link>
          </div>
          <dl className="grid border-t border-line sm:grid-cols-3">
            <DocumentStat label={copy.savedLabel} value={savedDrafts.length} />
            <DocumentStat
              label={copy.latestLabel}
              value={
                latestDraft
                  ? formatDate(latestDraft.updatedAt, locale)
                  : copy.notYet
              }
            />
            <DocumentStat
              label={copy.creditsLabel}
              value={
                creditUsage
                  ? copy.creditBalance(
                      creditUsage.remainingCredits,
                      creditUsage.creditLimit,
                    )
                  : copy.creditsUnavailable
              }
            />
          </dl>
        </header>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="grid gap-4">
            <section className="document-paper">
              <div className="border-b border-line px-5 py-4 sm:px-6">
                <p className="micro-label">{copy.guidedTools}</p>
                <h2 className="mt-2 text-lg font-semibold text-foreground">
                  {copy.startFromTask}
                </h2>
              </div>
              <div className="divide-y divide-line">
                <DocumentToolRow
                  href={href("/template-companion/ndis-case-note")}
                  title={copy.caseNoteTitle}
                  description={copy.caseNoteDescription}
                  status={
                    creditUsage
                      ? copy.creditToolStatus(creditUsage.remainingCredits)
                      : copy.creditsUnavailable
                  }
                  icon={<FileText className="size-5" aria-hidden="true" />}
                />
                <DocumentToolRow
                  href={href("/referral-workspace/materials")}
                  title={copy.referralMaterialsTitle}
                  description={copy.referralMaterialsDescription}
                  status={copy.workspaceAccess}
                  icon={<FileCheck2 className="size-5" aria-hidden="true" />}
                />
              </div>
            </section>

            <section id="saved-documents" className="document-paper scroll-mt-6">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
                <div>
                  <p className="micro-label">{copy.ownerScoped}</p>
                  <h2 className="mt-2 text-lg font-semibold text-foreground">
                    {copy.savedTitle}
                  </h2>
                  <p className="mt-2 max-w-2xl text-xs leading-5 text-muted">
                    {copy.retentionNotice}
                  </p>
                </div>
                <span className="text-xs font-semibold text-muted">
                  {copy.savedPrivacy}
                </span>
              </div>
              {savedDrafts.length > 0 ? (
                <div className="divide-y divide-line">
                  {savedDrafts.map((draft) => (
                    <SavedDocumentRow
                      key={draft.id}
                      draft={draft}
                      locale={locale}
                      copy={copy}
                      canDelete={gate.source === "supabase"}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-5 py-10 sm:px-6">
                  <FolderOpen
                    className="size-6 text-[#7b9187]"
                    aria-hidden="true"
                  />
                  <p className="mt-4 max-w-xl text-sm font-semibold text-foreground">
                    {copy.emptyTitle}
                  </p>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                    {copy.emptyDescription}
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className="care-glass h-fit p-5 xl:sticky xl:top-8">
            <div className="flex items-center gap-2 text-brand">
              <ShieldCheck className="size-4" aria-hidden="true" />
              <p className="micro-label">{copy.guidedLayer}</p>
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">
              {copy.nextActionTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {copy.nextActionDescription}
            </p>
            <ol className="mt-5 grid gap-0 border-y border-[#b8ccc2]">
              {copy.steps.map((step, index) => (
                <li
                  key={step}
                  className="grid grid-cols-[1.75rem_1fr] gap-2 border-b border-[#b8ccc2] py-3 text-sm leading-5 text-[#385249] last:border-b-0"
                >
                  <span className="font-mono text-xs font-semibold text-brand">
                    0{index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex gap-3 border-t border-[#b8ccc2] pt-4 text-xs leading-5 text-muted">
              <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{copy.boundary}</p>
            </div>
            <Link
              href={href("/plan-and-usage")}
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              {copy.viewPlanUsage}
            </Link>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

async function getCreditUsage(
  userId: string,
  isSupabaseSession: boolean,
): Promise<AccountCreditSummary | null> {
  if (!isSupabaseSession) {
    return null;
  }

  try {
    const usage = await getAccountCreditStore().getUsage({
      userId,
      recentLimit: 1,
    });

    return usage;
  } catch {
    return null;
  }
}

function DocumentStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border-b border-line px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-6">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-2 text-base font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function DocumentToolRow({
  href,
  title,
  description,
  status,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  status: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group grid gap-4 px-5 py-5 hover:bg-[#f8faf7] sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:items-center sm:px-6"
    >
      <span className="text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="mt-1 block text-sm leading-6 text-muted">
          {description}
        </span>
      </span>
      <span className="flex items-center gap-2 text-xs font-semibold text-brand">
        {status}
        <ArrowRight
          className="size-4 transition group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

function SavedDocumentRow({
  draft,
  locale,
  copy,
  canDelete,
}: {
  draft: GeneratedMaterialDraftRecord;
  locale: Locale;
  copy: ReturnType<typeof getAiDocumentsCopy>;
  canDelete: boolean;
}) {
  const preview = getSafeDocumentPreview(draft);
  return (
    <article className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {getFeatureLabel(draft.feature, copy)}
          </h3>
          <span className="text-xs font-semibold text-muted">
            {formatDate(draft.updatedAt, locale)}
          </span>
        </div>
        {preview ? (
          <p className="document-prose mt-3 line-clamp-2 text-[0.9375rem]">
            {preview}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">{copy.savedMetadataOnly}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="workspace-status-pill">{draft.status}</span>
        {canDelete && draft.feature === "ndis_case_note" ? (
          <GeneratedDraftDeleteButton draftId={draft.id} locale={locale} />
        ) : null}
      </div>
    </article>
  );
}

async function getOwnerDrafts(userId: string) {
  try {
    return await getGeneratedMaterialDraftStore().listGeneratedMaterialDraftsByUser({
      userId,
      limit: 12,
    });
  } catch {
    return [];
  }
}

function getSafeDocumentPreview(draft: GeneratedMaterialDraftRecord) {
  if (draft.feature !== "ndis_case_note") {
    return undefined;
  }

  try {
    return parseNdisCaseNoteMaterial(JSON.stringify(draft.content), {
      allowLegacy: true,
    }).englishCaseNoteDraft;
  } catch {
    return undefined;
  }
}

function getFeatureLabel(
  feature: GeneratedMaterialDraftRecord["feature"],
  copy: ReturnType<typeof getAiDocumentsCopy>,
) {
  const labels: Record<GeneratedMaterialDraftRecord["feature"], string> = {
    ndis_case_note: copy.features.ndisCaseNote,
    profile_rewrite: copy.features.profileRewrite,
    share_card: copy.features.shareCard,
    referral_message: copy.features.referralMessage,
    bilingual_intro: copy.features.bilingualIntro,
    handover_checklist: copy.features.handoverChecklist,
  };
  return labels[feature];
}

function formatDate(value: string, locale: Locale) {
  try {
    return new Intl.DateTimeFormat(locale === "zh-Hans" ? "zh-CN" : "en-AU", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getAiDocumentsCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      eyebrow: "文档工作区",
      title: "创建、复核并保存需要实际使用的文档草稿。",
      description:
        "从一个明确任务开始。AI 只整理你提供的去标识化事实，最终内容由你复核后使用。",
      createCaseNote: "创建 Case Note 草稿",
      savedLabel: "已保存文档",
      latestLabel: "最近更新",
      workspaceLabel: "工作区状态",
      creditsLabel: "本周期 Case Note credits",
      creditBalance: (remaining: number, limit: number) =>
        `${remaining} / ${limit} 可用`,
      creditToolStatus: (remaining: number) =>
        `剩余 ${remaining} credits · 每次生成使用 1 credit`,
      creditsUnavailable: "暂时无法读取",
      active: "引导式工具可用",
      freeAccess: "基础访问",
      notYet: "暂无",
      guidedTools: "引导式工具",
      startFromTask: "选择你现在要完成的工作",
      caseNoteTitle: "NDIS Case Note AI 助手",
      caseNoteDescription:
        "把去标识化的支持事实整理成中性、可复核的 case note 草稿。",
      availableNow: "立即开始",
      referralMaterialsTitle: "转介沟通材料",
      referralMaterialsDescription:
        "根据服务商自填资料生成可复核的介绍、转介信息和交接清单。",
      workspaceAccess: "打开工作区",
      ownerScoped: "仅本人可见",
      savedTitle: "已保存文档",
      savedPrivacy: "按当前账号读取",
      retentionNotice:
        "已保存草稿会保留在此工作区，直到你主动删除。机构需要正式保存的记录，应转入其获授权的记录系统。",
      emptyTitle: "还没有保存的文档。",
      emptyDescription:
        "使用当前账号生成并保存 Case Note 草稿后，它会显示在这里。",
      savedMetadataOnly: "已保存的引导式材料草稿",
      guidedLayer: "下一步",
      nextActionTitle: "先完成一份可复核的草稿",
      nextActionDescription:
        "不要从空白页面开始，也不要一次处理多个工作流。",
      steps: ["输入去标识化事实", "检查隐私提示", "复核、复制或保存草稿"],
      boundary:
        "这是一般文档与运营支持。草稿不是完成记录，也不提供临床、法律、照护、监管或合规建议。",
      viewPlanUsage: "查看访问与使用量",
      features: {
        ndisCaseNote: "NDIS Case Note 草稿",
        profileRewrite: "资料改写草稿",
        shareCard: "分享卡片草稿",
        referralMessage: "转介信息草稿",
        bilingualIntro: "双语介绍草稿",
        handoverChecklist: "交接清单草稿",
      },
      adminEyebrow: "管理后台",
      adminTitle: "AI Documents 是服务商工作区。",
      adminDescription:
        "管理员仅查看聚合使用数据和元数据，不在这里读取服务商生成的完整文档内容。",
      openMaterialUsage: "查看材料使用情况",
    };
  }

  return {
    eyebrow: "Document workspace",
    title: "Create, review and save the documents you need to use.",
    description:
      "Start with one defined task. AI organises only the de-identified facts you provide, and you review every draft before use.",
    createCaseNote: "Create case note draft",
    savedLabel: "Saved documents",
    latestLabel: "Latest update",
    workspaceLabel: "Workspace status",
    creditsLabel: "Case Note credits this period",
    creditBalance: (remaining: number, limit: number) =>
      `${remaining} of ${limit} available`,
    creditToolStatus: (remaining: number) =>
      `${remaining} credits remaining · 1 per generation`,
    creditsUnavailable: "Temporarily unavailable",
    active: "Guided tools active",
    freeAccess: "Base access",
    notYet: "Not yet",
    guidedTools: "Guided tools",
    startFromTask: "Choose the work you need to complete now",
    caseNoteTitle: "NDIS Case Note AI Companion",
    caseNoteDescription:
      "Turn de-identified support facts into neutral case-note wording for review.",
    availableNow: "Start now",
    referralMaterialsTitle: "Referral communication materials",
    referralMaterialsDescription:
      "Create reviewable introductions, referral messages and handover checklists from provider-submitted information.",
    workspaceAccess: "Open workspace",
    ownerScoped: "Owner scoped",
    savedTitle: "Saved Documents",
    savedPrivacy: "Read for this account only",
    retentionNotice:
      "Saved drafts remain in this workspace until you delete them. Move any record your organisation must retain into its authorised record system.",
    emptyTitle: "No saved documents yet.",
    emptyDescription:
      "Generate and save a case-note draft with this account, and it will appear here.",
    savedMetadataOnly: "Saved guided material draft",
    guidedLayer: "Next action",
    nextActionTitle: "Complete one reviewable draft first",
    nextActionDescription:
      "Avoid a blank page and keep one operational workflow in focus.",
    steps: [
      "Enter de-identified facts",
      "Check the privacy findings",
      "Review, copy or save the draft",
    ],
    boundary:
      "General documentation and operational support only. A draft is not a completed record and is not clinical, legal, care, regulatory or compliance advice.",
    viewPlanUsage: "View Plan & Usage",
    features: {
      ndisCaseNote: "NDIS case note draft",
      profileRewrite: "Profile wording draft",
      shareCard: "Share card draft",
      referralMessage: "Referral message draft",
      bilingualIntro: "Bilingual introduction draft",
      handoverChecklist: "Handover checklist draft",
    },
    adminEyebrow: "Administration",
    adminTitle: "AI Documents is a provider workspace.",
    adminDescription:
      "Administrators review aggregate usage and metadata. Full provider-generated document content is not shown here.",
    openMaterialUsage: "View material usage",
  };
}
