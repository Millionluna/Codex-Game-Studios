import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  FolderLock,
  Languages,
  LockKeyhole,
  Menu,
  Network,
  ShieldCheck,
} from "lucide-react";
import {
  buildNdisCaseNoteCompanionAuthHref,
  buildNdisCaseNoteCompanionHref,
  NDIS_CASE_NOTE_COMPANION_SOURCE,
  NDIS_CASE_NOTE_RESOURCE_SLUG,
} from "@/lib/ndis-case-note-companion-navigation";
import type { NdisCaseNoteCompanionAttribution } from "@/lib/ndis-case-note-companion-store";
import {
  getLocaleFromSearchParams,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";

type HomePageProps = {
  searchParams?: Promise<{ lang?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "AI Documents for aged care and NDIS",
  description:
    "Create review-ready document drafts from de-identified support facts, with privacy prompts and bilingual review.",
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getHomeCopy(locale);
  const attribution = getHomeCompanionAttribution(locale);
  const companionHref = buildNdisCaseNoteCompanionHref({ attribution });
  const registerHref = buildNdisCaseNoteCompanionAuthHref(
    "/auth/register",
    attribution,
  );
  const loginHref = buildNdisCaseNoteCompanionAuthHref(
    "/auth/login",
    attribution,
  );

  const links = {
    documents: withLocale("/ai-documents", locale),
    companion: companionHref,
    referrals: withLocale("/referral-workspace/referral-pack", locale),
    profile: withLocale("/referral-workspace/profile", locale),
    readiness: withLocale("/referral-workspace/health", locale),
    register: registerHref,
    login: loginHref,
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only z-50 bg-white px-4 py-3 font-semibold text-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {copy.skipToContent}
      </a>

      <PublicHeader copy={copy} links={links} locale={locale} />

      <section
        id="main-content"
        className="overflow-hidden bg-[#063d34] text-white"
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-12 pt-8 sm:px-6 sm:pb-14 sm:pt-12 lg:grid-cols-[minmax(0,0.86fr)_minmax(28rem,0.8fr)] lg:items-center lg:gap-14 lg:px-8 lg:pb-16 lg:pt-14">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9fe1ca]">
              {copy.heroKicker}
            </p>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.02] tracking-normal text-white sm:text-5xl lg:text-[4rem]">
              {copy.heroTitle}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/74 sm:text-lg sm:leading-8">
              {copy.heroDescription}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href={links.register} className="coral-action">
                {copy.createAccount}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href={links.login}
                className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-white underline decoration-white/35 underline-offset-4 hover:decoration-white"
              >
                {copy.signIn}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-5 flex max-w-xl items-start gap-2 text-sm leading-6 text-[#c9ddd5]">
              <LockKeyhole
                className="mt-1 size-4 shrink-0 text-[#9fe1ca]"
                aria-hidden="true"
              />
              <p>{copy.accountBoundary}</p>
            </div>
          </div>

          <BilingualDocumentPreview copy={copy} />
        </div>
      </section>

      <WorkflowSection copy={copy} />
      <ProductLanes copy={copy} links={links} />
      <TrustBoundary copy={copy} />

      <footer className="border-t border-white/10 bg-[#063d34] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Image
            src="/careslink-ai-logo-reverse.svg"
            alt="CaresLink AI"
            width={200}
            height={48}
            className="h-10 w-auto"
          />
          <div className="max-w-xl text-xs leading-5 text-white/58 sm:text-right">
            <p>{copy.footerBoundary}</p>
            <Link
              href={withLocale("/privacy", locale)}
              className="mt-2 inline-flex font-semibold text-white/78 hover:text-white"
            >
              {copy.privacyNotice}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

type HomeCopy = ReturnType<typeof getHomeCopy>;

type HomeLinks = {
  documents: string;
  companion: string;
  referrals: string;
  profile: string;
  readiness: string;
  register: string;
  login: string;
};

function PublicHeader({
  copy,
  links,
  locale,
}: {
  copy: HomeCopy;
  links: HomeLinks;
  locale: Locale;
}) {
  const alternateLocale = locale === "en" ? "zh-Hans" : "en";

  return (
    <header className="border-b border-white/10 bg-[#063d34] text-white">
      <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href={withLocale("/", locale)}
          className="shrink-0 rounded-sm focus-visible:outline-offset-4"
        >
          <Image
            src="/careslink-ai-logo-reverse.svg"
            alt="CaresLink AI"
            width={200}
            height={48}
            priority
            className="h-10 w-auto sm:h-11"
          />
        </Link>

        <nav
          aria-label={copy.primaryNavigation}
          className="hidden items-center gap-6 text-sm font-semibold lg:flex"
        >
          <Link className="text-white/72 hover:text-white" href={links.documents}>
            {copy.navDocuments}
          </Link>
          <Link className="text-white/72 hover:text-white" href={links.companion}>
            {copy.navCaseNote}
          </Link>
          <Link className="text-white/72 hover:text-white" href={links.referrals}>
            {copy.navReferrals}
          </Link>
          <Link className="text-white/72 hover:text-white" href={links.profile}>
            {copy.navProfile}
          </Link>
          <span className="h-5 w-px bg-white/15" aria-hidden="true" />
          <Link className="text-white/72 hover:text-white" href={links.login}>
            {copy.signIn}
          </Link>
          <Link
            className="text-xs font-bold uppercase tracking-[0.08em] text-[#9fe1ca] hover:text-white"
            href={withLocale("/", alternateLocale)}
            hrefLang={alternateLocale}
          >
            {copy.languageSwitch}
          </Link>
        </nav>

        <details className="group relative lg:hidden">
          <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-md border border-white/20 text-white hover:bg-white/8 [&::-webkit-details-marker]:hidden">
            <Menu className="size-5" aria-hidden="true" />
            <span className="sr-only">{copy.openMenu}</span>
          </summary>
          <nav
            aria-label={copy.mobileNavigation}
            className="care-glass absolute right-0 top-[calc(100%+0.75rem)] z-40 grid w-[min(19rem,calc(100vw-2rem))] gap-1 bg-[#edf4f0]/95 p-3 text-sm font-semibold text-foreground"
          >
            <MobileNavLink href={links.documents}>{copy.navDocuments}</MobileNavLink>
            <MobileNavLink href={links.companion}>{copy.navCaseNote}</MobileNavLink>
            <MobileNavLink href={links.referrals}>{copy.navReferrals}</MobileNavLink>
            <MobileNavLink href={links.profile}>{copy.navProfile}</MobileNavLink>
            <div className="my-1 h-px bg-line" />
            <MobileNavLink href={links.login}>{copy.signIn}</MobileNavLink>
            <MobileNavLink href={withLocale("/", alternateLocale)}>
              {copy.languageSwitch}
            </MobileNavLink>
          </nav>
        </details>
      </div>
    </header>
  );
}

function MobileNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="rounded-md px-3 py-2.5 hover:bg-white/72">
      {children}
    </Link>
  );
}

function BilingualDocumentPreview({ copy }: { copy: HomeCopy }) {
  return (
    <div
      className="relative mx-auto h-[19rem] w-full max-w-[38rem] sm:h-[28rem] lg:h-[31rem]"
      aria-label={copy.previewAriaLabel}
    >
      <article className="document-paper absolute left-0 top-7 w-[92%] overflow-hidden p-4 text-foreground shadow-[0_22px_50px_rgba(1,27,22,0.22)] sm:top-10 sm:w-[82%] sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
          <div>
            <p className="micro-label">{copy.englishDraftLabel}</p>
            <h2 className="document-title mt-2 text-xl sm:text-2xl">
              {copy.caseNoteTitle}
            </h2>
          </div>
          <FileText className="size-5 shrink-0 text-brand" aria-hidden="true" />
        </div>
        <p className="mt-3 font-mono text-[0.66rem] font-semibold uppercase text-muted sm:text-xs">
          {copy.sampleDate}
        </p>
        <p className="document-prose mt-3 line-clamp-4 text-[0.78rem] leading-5 sm:text-[0.92rem] sm:leading-7">
          {copy.englishSample}
        </p>
      </article>

      <article className="document-paper absolute bottom-3 right-0 w-[82%] p-4 text-foreground shadow-[0_22px_50px_rgba(1,27,22,0.2)] sm:bottom-5 sm:w-[74%] sm:p-5">
        <div className="flex items-center gap-2 text-brand">
          <Languages className="size-4" aria-hidden="true" />
          <p className="micro-label">{copy.chineseReviewLabel}</p>
        </div>
        <p className="mt-2 text-[0.67rem] font-semibold text-muted sm:text-xs">
          {copy.reviewOnly}
        </p>
        <p className="mt-3 line-clamp-3 text-[0.76rem] leading-5 text-[#273f38] sm:text-sm sm:leading-6">
          {copy.chineseSample}
        </p>
      </article>

      <aside className="care-glass absolute right-1 top-0 w-[63%] bg-[#e5f1ec]/90 p-3 text-foreground sm:right-0 sm:w-[53%] sm:p-4">
        <div className="flex items-center gap-2 text-brand">
          <ShieldCheck className="size-4" aria-hidden="true" />
          <p className="text-[0.64rem] font-extrabold uppercase sm:text-xs">
            {copy.privacyReview}
          </p>
        </div>
        <p className="mt-2 text-[0.67rem] leading-4 text-[#405b52] sm:text-xs sm:leading-5">
          {copy.privacyPrompt}
        </p>
      </aside>

      <aside className="care-glass absolute bottom-0 left-2 w-[58%] bg-[#edf4f0]/92 p-3 text-foreground sm:left-5 sm:w-[47%] sm:p-4">
        <div className="flex items-center gap-2 text-brand">
          <Check className="size-4" aria-hidden="true" />
          <p className="text-[0.64rem] font-extrabold uppercase sm:text-xs">
            {copy.guidedAction}
          </p>
        </div>
        <p className="mt-2 text-[0.67rem] leading-4 text-[#405b52] sm:text-xs sm:leading-5">
          {copy.guidedActionDetail}
        </p>
      </aside>
    </div>
  );
}

function WorkflowSection({ copy }: { copy: HomeCopy }) {
  return (
    <section className="border-b border-line bg-[#dfe9e4]" aria-labelledby="workflow-title">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[minmax(16rem,0.55fr)_minmax(0,1.2fr)] lg:gap-16 lg:px-8">
        <div>
          <p className="micro-label">{copy.workflowKicker}</p>
          <h2 id="workflow-title" className="section-title mt-3 max-w-md">
            {copy.workflowTitle}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted sm:text-base sm:leading-7">
            {copy.workflowDescription}
          </p>
        </div>

        <ol className="border-t border-[#adbbb5]">
          {copy.workflowSteps.map((step, index) => (
            <li
              key={step.title}
              className="grid gap-3 border-b border-[#adbbb5] py-5 sm:grid-cols-[3rem_minmax(0,0.7fr)_minmax(0,1fr)] sm:items-start sm:gap-5"
            >
              <span className="font-mono text-xs font-bold text-brand">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-sm font-semibold text-foreground sm:text-base">
                {step.title}
              </h3>
              <p className="text-sm leading-6 text-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ProductLanes({ copy, links }: { copy: HomeCopy; links: HomeLinks }) {
  return (
    <section className="bg-background" aria-labelledby="product-lanes-title">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
        <p className="micro-label">{copy.productKicker}</p>
        <h2 id="product-lanes-title" className="section-title mt-3 max-w-2xl">
          {copy.productTitle}
        </h2>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.72fr)]">
          <article className="document-paper grid overflow-hidden sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-2 text-brand">
                <FileText className="size-5" aria-hidden="true" />
                <p className="micro-label">{copy.primaryLane}</p>
              </div>
              <h3 className="document-title mt-5">{copy.documentsTitle}</h3>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
                {copy.documentsDescription}
              </p>
              <Link
                href={links.companion}
                className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand underline decoration-brand/25 underline-offset-4 hover:decoration-brand"
              >
                {copy.openCaseNote}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="hidden border-l border-line bg-[#eef2ee] p-5 sm:flex sm:flex-col sm:justify-between">
              <FolderLock className="size-7 text-brand" aria-hidden="true" />
              <div>
                <p className="font-mono text-[0.65rem] font-bold uppercase text-brand">
                  {copy.ownerOnlyLabel}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {copy.ownerOnlyDescription}
                </p>
              </div>
            </div>
          </article>

          <article className="care-glass flex flex-col justify-between bg-[#edf4f0]/88 p-6 sm:p-7">
            <div>
              <Network className="size-6 text-brand" aria-hidden="true" />
              <p className="micro-label mt-5">{copy.secondaryLane}</p>
              <h3 className="mt-3 text-2xl font-semibold text-foreground">
                {copy.referralsTitle}
              </h3>
              <p className="mt-4 text-sm leading-6 text-muted">
                {copy.referralsDescription}
              </p>
            </div>
            <Link
              href={links.referrals}
              className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand underline decoration-brand/25 underline-offset-4 hover:decoration-brand"
            >
              {copy.openReferrals}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </article>
        </div>

        <div className="mt-8 grid gap-5 border-t border-line pt-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {copy.profileTitle}
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              {copy.profileDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-brand">
            <Link className="underline decoration-brand/25 underline-offset-4 hover:decoration-brand" href={links.profile}>
              {copy.openProfile}
            </Link>
            <Link className="underline decoration-brand/25 underline-offset-4 hover:decoration-brand" href={links.readiness}>
              {copy.openReadiness}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBoundary({ copy }: { copy: HomeCopy }) {
  return (
    <section className="border-t border-line bg-[#eef2ee]" aria-labelledby="trust-title">
      <div className="mx-auto grid max-w-7xl gap-7 px-4 py-11 sm:px-6 lg:grid-cols-[minmax(15rem,0.5fr)_minmax(0,1.25fr)] lg:items-start lg:gap-14 lg:px-8">
        <div className="flex items-center gap-3 text-brand">
          <ShieldCheck className="size-5" aria-hidden="true" />
          <h2 id="trust-title" className="text-base font-semibold">
            {copy.trustTitle}
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {copy.privacyTitle}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {copy.privacyDescription}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {copy.boundaryTitle}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {copy.boundaryDescription}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function getHomeCompanionAttribution(
  locale: Locale,
): NdisCaseNoteCompanionAttribution {
  return {
    source: NDIS_CASE_NOTE_COMPANION_SOURCE,
    resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
    locale,
  };
}

function getHomeCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      privacyNotice: "隐私、收集与保留说明",
      skipToContent: "跳至主要内容",
      primaryNavigation: "主要导航",
      mobileNavigation: "移动端导航",
      openMenu: "打开导航菜单",
      navDocuments: "AI 文档",
      navCaseNote: "Case Note 工具",
      navReferrals: "转介",
      navProfile: "资料与准备度",
      signIn: "登录",
      languageSwitch: "English",
      heroKicker: "面向 aged care 与 NDIS 的 AI 文档工具",
      heroTitle: "把支持事实整理成可复核的文档草稿。",
      heroDescription:
        "可使用中文或英文输入；先完成隐私提示复核，再生成英文 case note 草稿与中文复核版本。",
      createAccount: "创建免费账户",
      accountBoundary:
        "免费账户可用。注册或登录后，才能输入支持事实、完成隐私复核、生成并保存草稿。",
      previewAriaLabel: "英文 case note 草稿与中文复核版本示例",
      englishDraftLabel: "英文 case note 草稿",
      caseNoteTitle: "社区支持记录",
      sampleDate: "2026 年 7 月 30 日 · 下午",
      englishSample:
        "The participant attended a community activity. During the visit, the participant said three times that they wanted to return home and later sat near the exit. The support worker remained with the participant for approximately 10 minutes and supported the return home.",
      chineseReviewLabel: "中文复核版本",
      reviewOnly: "仅用于核对，不是第二份正式记录",
      chineseSample:
        "参与者参加了一次社区活动。活动期间，参与者三次表示想回家，之后坐在出口附近。支持人员陪同约 10 分钟，并协助参与者返回家中。",
      privacyReview: "隐私提示复核",
      privacyPrompt: "先检查姓名、联系方式、编号和可识别地点。",
      guidedAction: "引导式下一步",
      guidedActionDetail: "复核中性措辞，并确认事实没有被添加。",
      workflowKicker: "一个清晰的工作流",
      workflowTitle: "先复核隐私，再起草文档。",
      workflowDescription:
        "CaresLink 把一次文档任务拆成可检查的步骤；AI 不会跳过你的事实与隐私确认。",
      workflowSteps: [
        {
          title: "注册或登录",
          description: "受保护的文档工作区仅对已登录服务商账户开放。",
        },
        {
          title: "输入去标识化事实",
          description: "使用结构化字段，或粘贴中文笔记并在浏览器中清理。",
        },
        {
          title: "完成隐私与中性措辞复核",
          description: "处理明显标识和评价性表述后，才能生成草稿。",
        },
        {
          title: "生成英文草稿与中文复核版本",
          description: "两个版本基于同一组事实；中文仅用于核对。",
        },
        {
          title: "复核并保存到自己的账户",
          description: "草稿由用户最终复核；保存内容仅归当前账户读取。",
        },
      ],
      productKicker: "产品工作区",
      productTitle: "文档为主，转介为辅。",
      primaryLane: "主要产品路径",
      documentsTitle: "AI Documents",
      documentsDescription:
        "从 NDIS Case Note Companion 开始，把去标识化的支持事实整理成可复核、可复制并可保存的双语草稿。",
      openCaseNote: "打开 Case Note 工具",
      ownerOnlyLabel: "仅限账户本人",
      ownerOnlyDescription: "保存后的文档按账户隔离，不显示在公共资料或管理员内容视图中。",
      secondaryLane: "一级辅助路径",
      referralsTitle: "Referrals",
      referralsDescription:
        "整理转介资料、发送对象和跟进节奏；不承诺匹配结果，也不提供服务质量背书。",
      openReferrals: "进入转介工作区",
      profileTitle: "Profile & Readiness",
      profileDescription:
        "继续维护一般商业资料，并检查转介沟通中仍需补充的信息。这是辅助能力，不是资质或服务质量评估。",
      openProfile: "查看服务商资料",
      openReadiness: "检查沟通准备度",
      trustTitle: "隐私与使用边界",
      privacyTitle: "去标识化由用户复核",
      privacyDescription:
        "浏览器提示可帮助发现明显标识，但不能保证完全去标识。请勿输入姓名、联系方式、participant number 或其他可识别信息。",
      boundaryTitle: "一般文档与运营支持",
      boundaryDescription:
        "草稿不是完成记录，也不构成临床、法律、合规或照护建议；CaresLink 不认证服务商、不评价服务质量，也不保证转介结果。",
      footerBoundary:
        "CaresLink AI 提供由用户复核的一般文档与运营支持，不提供临床、法律、合规或照护建议。",
    } as const;
  }

  return {
    privacyNotice: "Privacy, collection & retention",
    skipToContent: "Skip to main content",
    primaryNavigation: "Primary navigation",
    mobileNavigation: "Mobile navigation",
    openMenu: "Open navigation menu",
    navDocuments: "AI Documents",
    navCaseNote: "Case Note",
    navReferrals: "Referrals",
    navProfile: "Profile & Readiness",
    signIn: "Sign in",
    languageSwitch: "简体中文",
    heroKicker: "AI Documents for aged care and NDIS",
    heroTitle: "Turn support facts into review-ready documentation.",
    heroDescription:
      "Work in English or Chinese. Review privacy prompts before CaresLink drafts an English case note with a Chinese review version.",
    createAccount: "Create free account",
    accountBoundary:
      "Available with a free account. Register or sign in before entering support facts, reviewing privacy prompts, generating, or saving a draft.",
    previewAriaLabel: "Example English case note draft and Chinese review version",
    englishDraftLabel: "English case note draft",
    caseNoteTitle: "Community support note",
    sampleDate: "30 July 2026 · afternoon",
    englishSample:
      "The participant attended a community activity. During the visit, the participant said three times that they wanted to return home and later sat near the exit. The support worker remained with the participant for approximately 10 minutes and supported the return home.",
    chineseReviewLabel: "Chinese review version",
    reviewOnly: "For checking only · not a second formal record",
    chineseSample:
      "参与者参加了一次社区活动。活动期间，参与者三次表示想回家，之后坐在出口附近。支持人员陪同约 10 分钟，并协助参与者返回家中。",
    privacyReview: "Privacy review",
    privacyPrompt: "Check names, contact details, numbers and identifying places first.",
    guidedAction: "Guided next action",
    guidedActionDetail: "Review neutral wording and confirm no facts were added.",
    workflowKicker: "One deliberate workflow",
    workflowTitle: "Review privacy before drafting.",
    workflowDescription:
      "CaresLink separates one documentation task into checkable steps. AI does not bypass your factual or privacy review.",
    workflowSteps: [
      {
        title: "Register or sign in",
        description: "The protected document workspace is available to signed-in provider accounts.",
      },
      {
        title: "Enter de-identified facts",
        description: "Use structured fields, or paste Chinese notes and clean them in the browser.",
      },
      {
        title: "Review privacy and neutral wording",
        description: "Resolve obvious identifiers and evaluative wording before generation.",
      },
      {
        title: "Generate English + Chinese review",
        description: "Both versions use the same facts; Chinese is provided for checking only.",
      },
      {
        title: "Review and save to your account",
        description: "You make the final review; saved drafts are readable only by their owner.",
      },
    ],
    productKicker: "Product workspace",
    productTitle: "Documents first, referrals alongside.",
    primaryLane: "Primary product lane",
    documentsTitle: "AI Documents",
    documentsDescription:
      "Start with the NDIS Case Note Companion and turn de-identified support facts into a bilingual draft that can be reviewed, copied and saved.",
    openCaseNote: "Open the Case Note Companion",
    ownerOnlyLabel: "Owner-only",
    ownerOnlyDescription: "Saved documents stay out of public profiles and administrator content views.",
    secondaryLane: "First-level supporting lane",
    referralsTitle: "Referrals",
    referralsDescription:
      "Prepare referral information, sending context and follow-up timing without promising a match or endorsing service quality.",
    openReferrals: "Open referral workspace",
    profileTitle: "Profile & Readiness",
    profileDescription:
      "Maintain a general business profile and review missing referral communication details. This supporting path is not a qualification or service-quality assessment.",
    openProfile: "View provider profile",
    openReadiness: "Check communication readiness",
    trustTitle: "Privacy and use boundaries",
    privacyTitle: "De-identification stays user-reviewed",
    privacyDescription:
      "Browser prompts can help identify obvious identifiers, but cannot guarantee complete de-identification. Do not enter names, contact details, participant numbers or other identifying information.",
    boundaryTitle: "General documentation and operational support",
    boundaryDescription:
      "Drafts are not completed records or clinical, legal, compliance or care advice. CaresLink does not certify providers, assess service quality or guarantee referral outcomes.",
    footerBoundary:
      "CaresLink AI provides user-reviewed general documentation and operational support, not clinical, legal, compliance or care advice.",
  } as const;
}
