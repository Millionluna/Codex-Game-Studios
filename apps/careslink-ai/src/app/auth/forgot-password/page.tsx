import { Mail } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card, FieldLabel, TextInput } from "@/components/ui";
import {
  getLocaleFromSearchParams,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";
import { requestPasswordResetAction } from "../actions";

type AuthSearchParams = {
  readonly [key: string]: string | string[] | undefined;
};

type ForgotPasswordPageProps = {
  searchParams?: Promise<AuthSearchParams>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const formCopy = getForgotPasswordCopy(locale);
  const message = getAuthMessage(params);

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withLocale("/auth/forgot-password", locale)}
    >
      <PageHeader
        eyebrow={copy.auth.login.eyebrow}
        title={formCopy.title}
        description={formCopy.description}
        actions={
          <ButtonLink href={withLocale("/auth/login", locale)} variant="secondary">
            {formCopy.backToLogin}
          </ButtonLink>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.86fr)_360px]">
        <Card className="p-6 shadow-[var(--shadow-md)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <Mail className="size-5" aria-hidden="true" />
            {formCopy.formHeading}
          </div>

          {message ? <AuthMessage message={message} /> : null}

          <form action={requestPasswordResetAction} className="mt-5 grid gap-4">
            <input name="lang" type="hidden" value={locale} />
            <FieldLabel>
              <span>{formCopy.email}</span>
              <TextInput
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="provider@example.com"
              />
            </FieldLabel>
            <AuthSubmitButton
              pendingLabel={formCopy.pending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:bg-brand-dark active:translate-y-0"
            >
              {formCopy.submit}
            </AuthSubmitButton>
          </form>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-semibold text-[#17211f]">
            {copy.common.trustBoundary}
          </p>
          <p className="mt-3 text-sm leading-6 text-[#5d6d68]">
            {formCopy.boundary}
          </p>
        </Card>
      </section>
    </AppShell>
  );
}

function AuthMessage({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-lg border border-[#f4d28f] bg-[#fff7df] p-3 text-sm leading-6 text-[#5f4300]">
      {message}
    </div>
  );
}

function getAuthMessage(params: AuthSearchParams | undefined) {
  const value = params?.error;

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}

function getForgotPasswordCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      title: "重置密码",
      description:
        "输入你的 CaresLink AI 登录邮箱。如果账号存在，我们会发送一封重置密码邮件。",
      formHeading: "发送重置链接",
      email: "邮箱",
      submit: "发送重置邮件",
      pending: "正在发送...",
      backToLogin: "返回登录",
      boundary:
        "为了保护账号安全，此页面不会说明某个邮箱是否已经注册。请只使用你自己的服务商账号邮箱。",
    };
  }

  return {
    title: "Reset password",
    description:
      "Enter your CaresLink AI login email. If an account exists, we will send a password reset email.",
    formHeading: "Send reset link",
    email: "Email",
    submit: "Send reset email",
    pending: "Sending...",
    backToLogin: "Back to login",
    boundary:
      "For account safety, this page does not reveal whether an email is registered. Only use your own provider account email.",
  };
}
