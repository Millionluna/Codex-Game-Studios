import { KeyRound } from "lucide-react";
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
import { updatePasswordAction } from "../actions";

type AuthSearchParams = {
  readonly [key: string]: string | string[] | undefined;
};

type UpdatePasswordPageProps = {
  searchParams?: Promise<AuthSearchParams>;
};

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const copy = getReferralWorkspaceCopy(locale);
  const formCopy = getUpdatePasswordCopy(locale);
  const message = getAuthMessage(params);

  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withLocale("/auth/update-password", locale)}
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
            <KeyRound className="size-5" aria-hidden="true" />
            {formCopy.formHeading}
          </div>

          {message ? <AuthMessage message={message} /> : null}

          <form action={updatePasswordAction} className="mt-5 grid gap-4">
            <input name="lang" type="hidden" value={locale} />
            <FieldLabel>
              <span>{formCopy.password}</span>
              <TextInput
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </FieldLabel>
            <FieldLabel>
              <span>{formCopy.confirmPassword}</span>
              <TextInput
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
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

function getUpdatePasswordCopy(locale: Locale) {
  if (locale === "zh-Hans") {
    return {
      title: "设置新密码",
      description: "输入一个新的 CaresLink AI 登录密码。更新后请重新登录工作区。",
      formHeading: "更新密码",
      password: "新密码",
      confirmPassword: "确认新密码",
      submit: "更新密码",
      pending: "正在更新...",
      backToLogin: "返回登录",
      boundary:
        "密码重置只用于账号访问。工作区内容仍然仅作为 general business profile / operational support。",
    };
  }

  return {
    title: "Set a new password",
    description:
      "Enter a new CaresLink AI login password. After updating, sign in again to continue.",
    formHeading: "Update password",
    password: "New password",
    confirmPassword: "Confirm new password",
    submit: "Update password",
    pending: "Updating...",
    backToLogin: "Back to login",
    boundary:
      "Password reset only controls account access. Workspace content remains general business profile / operational support only.",
  };
}
