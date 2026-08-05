import {
  CircleGauge,
  FileText,
  KeyRound,
  ShieldAlert,
  UserPlus,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { GoogleOAuthForm } from "@/components/google-oauth-form";
import { ButtonLink, FieldLabel, TextInput } from "@/components/ui";
import {
  getAuthPageContext,
  type AuthPageContext,
} from "@/lib/auth-page-context";
import { isGoogleOAuthAvailable } from "@/lib/google-oauth";
import {
  getProviderGeneratorHandoffContext,
  getSafeNextHrefWithHandoff,
  withAuthHandoffParams,
} from "@/lib/referral-workspace-handoff";
import {
  getLocaleFromSearchParams,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";
import { CARESLINK_AI_NOINDEX_ROBOTS } from "@/lib/seo-policy";
import {
  continueWithGoogleFromRegisterAction,
  registerWithSupabaseAction,
} from "../actions";

type AuthSearchParams = {
  readonly [key: string]: string | string[] | undefined;
};

type RegisterPageProps = {
  searchParams?: Promise<AuthSearchParams>;
};

export async function generateMetadata({
  searchParams,
}: RegisterPageProps): Promise<Metadata> {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const nextHref = getSafeNextHrefWithHandoff(params);
  const context = getAuthPageContext(nextHref);

  return {
    title: getRegisterPageMetadataTitle(locale, context),
    robots: CARESLINK_AI_NOINDEX_ROBOTS,
  };
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const handoff = getProviderGeneratorHandoffContext(params);
  const nextHref = getSafeNextHrefWithHandoff(params);
  const copy = getAuthPageCopy(locale, getAuthPageContext(nextHref));
  const loginHref = withAuthHandoffParams("/auth/login", params);
  const message = getAuthMessage(params);
  const googleOAuthAvailable = await isGoogleOAuthAvailable();

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withAuthHandoffParams("/auth/register", params)}
    >
      <section className="mx-auto grid max-w-7xl gap-6 py-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.7fr)] lg:items-start">
        <div className="surface-card p-5 shadow-[var(--shadow-md)] sm:p-7 lg:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <UserPlus className="size-5" aria-hidden="true" />
            {copy.formHeading}
          </div>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[0.98] tracking-normal text-[#181715] sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#635f57]">
            {copy.description}
          </p>

          {message ? <AuthMessage message={message} /> : null}

          {googleOAuthAvailable ? (
            <GoogleOAuthForm
              action={continueWithGoogleFromRegisterAction}
              dividerLabel={copy.emailDivider}
              label={copy.googleCta}
              locale={locale}
              nextHref={nextHref}
              pendingLabel={copy.googlePending}
            />
          ) : null}

          <form
            action={registerWithSupabaseAction}
            className={`${googleOAuthAvailable ? "" : "mt-6"} grid gap-4`}
          >
            <HiddenAuthInputs
              source={handoff.source}
              draftId={handoff.draftId}
              nextHref={nextHref}
              locale={locale}
            />
            <FieldLabel>
              <span>{copy.name}</span>
              <TextInput
                name="name"
                type="text"
                autoComplete="name"
                required
                placeholder={copy.namePlaceholder}
              />
            </FieldLabel>
            <FieldLabel>
              <span>{copy.email}</span>
              <TextInput
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="provider@example.com"
              />
            </FieldLabel>
            <FieldLabel>
              <span>{copy.password}</span>
              <TextInput
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </FieldLabel>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <ButtonLink href={withLocale(loginHref, locale)} variant="secondary">
                {copy.loginCta}
              </ButtonLink>
            </div>
            <AuthSubmitButton
              pendingLabel={copy.pending}
              className="taito-primary w-full px-4"
            >
              {copy.submit}
            </AuthSubmitButton>
          </form>
        </div>

        <CaresLinkWorkspaceMockup copy={copy} />

        <TrustBoundaryStrip copy={copy} locale={locale} />
      </section>
    </AppShell>
  );
}

function HiddenAuthInputs({
  source,
  draftId,
  nextHref,
  locale,
}: {
  source?: string;
  draftId?: string;
  nextHref: string;
  locale: Locale;
}) {
  return (
    <>
      {source ? <input name="source" type="hidden" value={source} /> : null}
      {draftId ? <input name="draftId" type="hidden" value={draftId} /> : null}
      <input name="next" type="hidden" value={nextHref} />
      <input name="lang" type="hidden" value={locale} />
    </>
  );
}

function AuthMessage({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-lg border border-[#ead091] bg-[#fff8e5] p-3 text-sm leading-6 text-[#5f4300]">
      {message}
    </div>
  );
}

function CaresLinkWorkspaceMockup({ copy }: { copy: AuthPageCopy }) {
  const icons = [UserRound, CircleGauge, FileText, KeyRound];

  return (
    <aside className="taito-product-shell p-4 sm:p-5">
      <div className="rounded-xl border border-[#ded6c8] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#0f766e]">
              {copy.mockup.kicker}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#181715]">
              {copy.mockup.title}
            </h2>
          </div>
          <span className="rounded-md border border-[#ded6c8] bg-[#faf7f0] px-2.5 py-1 text-xs font-semibold text-[#4d4942]">
            {copy.mockup.status}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {copy.mockup.tabs.map((tab, index) => {
            const Icon = icons[index];

            return (
              <div
                key={tab}
                className="flex items-center gap-2 rounded-lg border border-[#ded6c8] bg-[#fbfaf7] px-3 py-2 text-sm font-semibold text-[#24211d]"
              >
                <Icon className="size-4 text-[#0f766e]" aria-hidden="true" />
                {tab}
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3">
          {copy.mockup.rows.map((row) => (
            <div
              key={row.label}
              className="rounded-lg border border-[#ded6c8] bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-[#181715]">
                  {row.label}
                </p>
                <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
                  {row.meta}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#635f57]">
                {row.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function TrustBoundaryStrip({
  copy,
  locale,
}: {
  copy: AuthPageCopy;
  locale: Locale;
}) {
  return (
    <aside className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-start lg:col-span-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#181715] sm:w-56 sm:shrink-0">
        <ShieldAlert className="size-5 text-[#0f766e]" aria-hidden="true" />
        {copy.boundaryHeading}
      </div>
      <div>
        <p className="text-sm leading-6 text-[#5d574f]">{copy.boundary}</p>
        <Link
          href={withLocale("/privacy", locale)}
          className="mt-2 inline-flex text-sm font-semibold text-[#0f766e] underline-offset-4 hover:underline"
        >
          {copy.privacyNotice}
        </Link>
      </div>
    </aside>
  );
}

function getAuthMessage(params: AuthSearchParams | undefined) {
  const value = params?.error;

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}

type AuthPageCopy = ReturnType<typeof getAuthPageCopy>;

function getAuthPageCopy(
  locale: Locale,
  context: AuthPageContext = "referral",
) {
  if (locale === "zh-Hans") {
    const copy = {
      privacyNotice: "查看隐私、收集与保留说明",
      formHeading: "创建账户",
      title: "保存草稿，并开始准备 Referral Pack。",
      description:
        "创建账户以保存服务商资料、认领草稿，并继续准备可发送的资料包和跟进记录。",
      name: "姓名或联系人",
      namePlaceholder: "服务商负责人",
      email: "邮箱",
      password: "密码",
      googleCta: "使用 Google 继续",
      googlePending: "正在连接 Google...",
      emailDivider: "或使用邮箱创建账户",
      pending: "正在创建账户...",
      submit: "创建账户并进入工作区",
      loginCta: "已有账户",
      boundaryHeading: "使用边界",
      boundary:
        "仅用于一般商业资料和运营支持。CaresLink 不提供市场撮合、预约、服务商背书或推荐，也不提供临床、法律、照护、监管或合规建议。",
      mockup: {
        kicker: "服务商工作区",
        title: "Referral Pack 工作台",
        status: "等待认领",
        tabs: ["材料包", "跟进", "阻碍", "访问"],
        rows: [
          {
            label: "认领服务商资料",
            meta: "来源",
            detail: "保存从公开生成器带入的服务商自填资料。",
          },
          {
            label: "准备可发送材料包",
            meta: "待补充",
            detail: "把资料和草稿整理成可复核、可复制的转介沟通材料。",
          },
          {
            label: "记录发送和跟进",
            meta: "跟进",
            detail: "记录发给了谁、是否回应，以及下次跟进时间。",
          },
        ],
      },
    };

    if (context === "ai-documents") {
      return {
        ...copy,
        title: "创建账户后使用 AI Documents。",
        description:
          "创建服务商账户以生成引导式文档草稿、复核隐私提示，并保存仅限账户所有者查看的内容。",
        submit: "创建账户并继续",
        boundary:
          "仅提供一般文档与运营支持。所有草稿都需要用户复核，不是完成记录，也不提供临床、法律、照护、监管或合规建议。",
        mockup: {
          kicker: "AI Documents",
          title: "AI Documents 工作区",
          status: "需要账户",
          tabs: ["文档", "隐私", "草稿", "用量"],
          rows: [
            {
              label: "创建引导式草稿",
              meta: "文档",
              detail: "从去标识化的支持事实开始，并在生成前检查最低事实要求。",
            },
            {
              label: "复核隐私提示",
              meta: "隐私",
              detail: "处理明显身份信息提示，并逐项人工复核输入内容。",
            },
            {
              label: "保存到你的账户",
              meta: "草稿",
              detail: "把复核后的草稿保存到仅限当前服务商账户访问的工作区。",
            },
          ],
        },
      };
    }

    if (context === "ndis-case-note") {
      return {
        ...copy,
        title: "创建账户后使用 NDIS Case Note AI 助手。",
        description:
          "注册 AI Documents 后再输入去标识化的支持事实、完成隐私提示复核，并生成或保存待复核草稿。",
        submit: "创建账户并继续",
        boundary:
          "仅提供一般文档与运营支持。草稿需要用户复核，不是完成记录，也不提供临床、法律、照护、监管或合规建议。",
        mockup: {
          kicker: "AI Documents",
          title: "NDIS Case Note AI 助手",
          status: "需要账户",
          tabs: ["事实", "隐私", "草稿", "保存"],
          rows: [
            {
              label: "输入去标识化事实",
              meta: "第 1 步",
              detail: "只提供草稿所需的支持事实，并移除姓名、号码和联系方式。",
            },
            {
              label: "复核隐私提示",
              meta: "第 2 步",
              detail: "处理明显的身份信息提示，并逐项人工复核输入内容。",
            },
            {
              label: "生成、复核或保存草稿",
              meta: "第 3 步",
              detail: "检查每项事实后，再复制或保存到当前服务商账号。",
            },
          ],
        },
      };
    }

    return copy;
  }

  const copy = {
    privacyNotice: "Read the privacy, collection & retention notice",
    formHeading: "Create account",
    title: "Save the draft and prepare your Referral Pack.",
    description:
      "Create an account to save the provider profile, claim the draft, and prepare sendable material with follow-up records.",
    name: "Name or contact person",
    namePlaceholder: "Provider owner",
    email: "Email",
    password: "Password",
    googleCta: "Continue with Google",
    googlePending: "Opening Google...",
    emailDivider: "or create an account with email",
    pending: "Creating account...",
    submit: "Create account and enter workspace",
    loginCta: "Already have an account",
    boundaryHeading: "Use boundary",
    boundary:
      "General business profile and operational support only. No marketplace, booking, provider endorsement or recommendation, and no clinical, legal, care, regulatory/compliance advice.",
    mockup: {
      kicker: "Provider workspace access",
      title: "Referral Pack workspace",
      status: "Awaiting claim",
      tabs: ["Pack", "Outreach", "Blockers", "Access"],
      rows: [
        {
          label: "Claim provider draft",
          meta: "Source",
          detail:
            "Save the provider profile draft handed off from the public generator.",
        },
        {
          label: "Prepare sendable pack",
          meta: "Needs input",
          detail:
            "Turn the profile and saved drafts into reviewable referral communication.",
        },
        {
          label: "Record sends and follow-ups",
          meta: "Outreach",
          detail:
            "Track who received the pack, reply status, and next follow-up.",
        },
      ],
    },
  };

  if (context === "ai-documents") {
    return {
      ...copy,
      title: "Create an account to use AI Documents.",
      description:
        "Create a provider account to generate guided document drafts, review privacy prompts, and save owner-only work.",
      submit: "Create account and continue",
      boundary:
        "General documentation and operational support only. Every draft requires user review, is not a completed record, and is not clinical, legal, care, regulatory or compliance advice.",
      mockup: {
        kicker: "AI Documents",
        title: "AI Documents workspace",
        status: "Account required",
        tabs: ["Documents", "Privacy", "Drafts", "Usage"],
        rows: [
          {
            label: "Create a guided draft",
            meta: "Documents",
            detail:
              "Start from de-identified support facts and check the minimum fact requirements before generation.",
          },
          {
            label: "Review privacy prompts",
            meta: "Privacy",
            detail:
              "Resolve obvious identifier prompts and review every input yourself.",
          },
          {
            label: "Save to your account",
            meta: "Drafts",
            detail:
              "Keep reviewed drafts in a workspace available only to the current provider account.",
          },
        ],
      },
    };
  }

  if (context === "ndis-case-note") {
    return {
      ...copy,
      title: "Create an account to use the NDIS Case Note Companion.",
      description:
        "Register for AI Documents before entering de-identified support facts, reviewing privacy prompts, and generating or saving a reviewable draft.",
      submit: "Create account and continue",
      boundary:
        "General documentation and operational support only. A draft requires your review, is not a completed record, and is not clinical, legal, care, regulatory or compliance advice.",
      mockup: {
        kicker: "AI Documents",
        title: "NDIS Case Note AI Companion",
        status: "Account required",
        tabs: ["Facts", "Privacy", "Draft", "Save"],
        rows: [
          {
            label: "Enter de-identified facts",
            meta: "Step 1",
            detail:
              "Include only the support facts needed for the draft, without names, numbers or contact details.",
          },
          {
            label: "Review privacy prompts",
            meta: "Step 2",
            detail:
              "Resolve obvious identifier prompts and review every input yourself.",
          },
          {
            label: "Generate, review or save",
            meta: "Step 3",
            detail:
              "Check every fact before copying or saving the draft to your provider account.",
          },
        ],
      },
    };
  }

  return copy;
}

function getRegisterPageMetadataTitle(
  locale: Locale,
  context: AuthPageContext,
) {
  if (locale === "zh-Hans") {
    return context === "ndis-case-note"
      ? "注册 NDIS Case Note AI 助手"
      : context === "ai-documents"
        ? "注册 AI Documents"
        : "创建账户";
  }

  return context === "ndis-case-note"
    ? "Create an NDIS Case Note Companion account"
    : context === "ai-documents"
      ? "Create an AI Documents account"
      : "Create account";
}
