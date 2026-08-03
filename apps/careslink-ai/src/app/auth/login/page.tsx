import {
  ArrowRight,
  CircleGauge,
  FileText,
  KeyRound,
  LogIn,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ButtonLink, FieldLabel, TextInput } from "@/components/ui";
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
import { loginWithSupabaseAction } from "../actions";

type AuthSearchParams = {
  readonly [key: string]: string | string[] | undefined;
};

type LoginPageProps = {
  searchParams?: Promise<AuthSearchParams>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getAuthPageCopy(locale);
  const nextHref = getSafeNextHrefWithHandoff(params);
  const registerHref = withAuthHandoffParams("/auth/register", params);
  const forgotPasswordHref = withLocale("/auth/forgot-password", locale);
  const handoff = getProviderGeneratorHandoffContext(params);
  const message = getAuthMessage(params);

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withAuthHandoffParams("/auth/login", params)}
    >
      <section className="mx-auto grid max-w-7xl gap-6 py-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.7fr)] lg:items-start">
        <div className="surface-card p-5 shadow-[var(--shadow-md)] sm:p-7 lg:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <LogIn className="size-5" aria-hidden="true" />
            {copy.formHeading}
          </div>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[0.98] tracking-normal text-[#181715] sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#635f57]">
            {copy.description}
          </p>

          {message ? <AuthMessage message={message} /> : null}

          <form action={loginWithSupabaseAction} className="mt-6 grid gap-4">
            <HiddenAuthInputs
              source={handoff.source}
              draftId={handoff.draftId}
              nextHref={nextHref}
              locale={locale}
            />
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
                autoComplete="current-password"
                required
                minLength={6}
              />
            </FieldLabel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <a
                href={forgotPasswordHref}
                className="text-sm font-semibold text-[#181715] underline-offset-4 hover:underline"
              >
                {copy.forgotPassword}
              </a>
              <ButtonLink href={withLocale(registerHref, locale)} variant="secondary">
                {copy.registerCta}
              </ButtonLink>
            </div>
            <button type="submit" className="taito-primary w-full px-4">
              {copy.submit}
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>

        <CaresLinkWorkspaceMockup locale={locale} />

        <TrustBoundaryStrip copy={copy} />
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

function CaresLinkWorkspaceMockup({ locale }: { locale: Locale }) {
  const copy = getAuthPageCopy(locale);
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

function TrustBoundaryStrip({ copy }: { copy: AuthPageCopy }) {
  return (
    <aside className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-start lg:col-span-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#181715] sm:w-56 sm:shrink-0">
        <ShieldAlert className="size-5 text-[#0f766e]" aria-hidden="true" />
        {copy.boundaryHeading}
      </div>
      <p className="text-sm leading-6 text-[#5d574f]">{copy.boundary}</p>
    </aside>
  );
}

function getAuthMessage(params: AuthSearchParams | undefined) {
  const error = getSearchParam(params, "error");

  if (error) {
    return error;
  }

  const notice = getSearchParam(params, "notice");

  return notice === "confirm-email"
    ? "Check your email to confirm your CaresLink AI account."
    : notice === "password-reset-sent"
      ? "If this email is registered, a password reset link has been sent."
      : notice === "password-updated"
        ? "Password updated. Please sign in with your new password."
        : undefined;
}

type AuthPageCopy = ReturnType<typeof getAuthPageCopy>;

function getAuthPageCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      formHeading: "使用邮箱登录",
      title: "登录后继续准备 Referral Pack。",
      description:
        "查看服务商资料、资料包草稿、转介阻碍、访问状态和跟进记录。",
      email: "邮箱",
      password: "密码",
      forgotPassword: "忘记密码？",
      submit: "登录并进入工作区",
      registerCta: "创建账户",
      boundaryHeading: "使用边界",
      boundary:
        "仅用于一般商业资料和运营支持。CaresLink 不提供市场撮合、预约、服务商背书或推荐，也不提供临床、法律、照护、监管或合规建议。",
      mockup: {
        kicker: "服务商工作区",
        title: "Referral Pack 工作台",
        status: "草稿已保存",
        tabs: ["材料包", "跟进", "阻碍", "访问"],
        rows: [
          {
            label: "可发送资料包",
            meta: "材料包",
            detail: "把服务商自填资料和已保存草稿整理成可复核、可复制的介绍。",
          },
          {
            label: "转介阻碍",
            meta: "待补充",
            detail: "查看哪些缺失信息可能让转介方不敢介绍你。",
          },
          {
            label: "发送与跟进",
            meta: "跟进",
            detail: "记录资料包发给了谁、是否回应，以及下次跟进时间。",
          },
        ],
      },
    };
  }

  return {
    formHeading: "Provider workspace access",
    title: "Continue your Referral Pack workspace.",
    description:
      "Sign in to review provider details, pack drafts, referral blockers, access status, and follow-up records.",
    email: "Email",
    password: "Password",
    forgotPassword: "Forgot password?",
    submit: "Sign in to workspace",
    registerCta: "Create account",
    boundaryHeading: "Use boundary",
    boundary:
      "General business profile and operational support only. No marketplace, booking, provider endorsement or recommendation, and no clinical, legal, care, regulatory/compliance advice.",
    mockup: {
      kicker: "Provider workspace access",
      title: "Referral Pack workspace",
      status: "Draft saved",
      tabs: ["Pack", "Outreach", "Blockers", "Access"],
      rows: [
        {
          label: "Sendable Referral Pack",
          meta: "Pack",
          detail:
            "Turn provider-submitted details and saved drafts into reviewable copy.",
        },
        {
          label: "Referral blockers",
          meta: "Needs input",
          detail:
            "See missing details that may make referral partners hesitate.",
        },
        {
          label: "Sends and follow-ups",
          meta: "Outreach",
          detail:
            "Record who received the pack, reply status, and next follow-up.",
        },
      ],
    },
  };
}

function getSearchParam(
  params: AuthSearchParams | undefined,
  key: string,
): string | undefined {
  const value = params?.[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}
