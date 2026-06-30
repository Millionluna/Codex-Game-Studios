import { LogIn, ShieldAlert, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card } from "@/components/ui";
import { withWorkspaceAccount } from "@/lib/referral-workspace-auth";
import {
  withLocale,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";

export function ReferralWorkspaceLoginGate({
  copy,
  locale,
  languageSwitcherHref = "/referral-workspace",
  loginHref = "/auth/login",
  registerHref = "/auth/register",
}: {
  copy: ReferralWorkspaceCopy;
  locale: Locale;
  languageSwitcherHref?: string;
  loginHref?: string;
  registerHref?: string;
}) {
  return (
    <AppShell locale={locale} languageSwitcherHref={languageSwitcherHref}>
      <PageHeader
        eyebrow={copy.auth.gate.eyebrow}
        title={copy.auth.gate.title}
        description={copy.auth.gate.description}
        actions={
          <>
            <ButtonLink href={withLocale(loginHref, locale)}>
              <LogIn className="size-4" aria-hidden="true" />
              {copy.auth.gate.loginCta}
            </ButtonLink>
            <ButtonLink
              href={withLocale(registerHref, locale)}
              variant="secondary"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {copy.auth.gate.registerCta}
            </ButtonLink>
          </>
        }
      />

      <Card className="p-5">
        <p className="text-sm font-semibold text-[#17211f]">
          {copy.common.trustBoundary}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6d68]">
          {copy.auth.gate.previewBoundary}
        </p>
      </Card>
    </AppShell>
  );
}

export function ReferralWorkspaceAdminGate({
  copy,
  locale,
  accountId,
}: {
  copy: ReferralWorkspaceCopy;
  locale: Locale;
  accountId: string;
}) {
  return (
    <AppShell
      locale={locale}
      languageSwitcherHref={withWorkspaceAccount(
        "/admin/access-requests",
        accountId,
      )}
      workspaceAccountId={accountId}
    >
      <PageHeader
        eyebrow={copy.auth.adminGate.eyebrow}
        title={copy.auth.adminGate.title}
        description={copy.auth.adminGate.description}
        actions={
          <>
            <ButtonLink
              href={withWorkspaceAccount(
                withLocale("/admin/access-requests", locale),
                "user-admin",
              )}
            >
              <ShieldAlert className="size-4" aria-hidden="true" />
              {copy.auth.adminGate.adminCta}
            </ButtonLink>
            <ButtonLink
              href={withWorkspaceAccount(
                withLocale("/referral-workspace", locale),
                accountId,
              )}
              variant="secondary"
            >
              {copy.auth.adminGate.workspaceCta}
            </ButtonLink>
          </>
        }
      />

      <Card className="p-5">
        <p className="text-sm font-semibold text-[#17211f]">
          {copy.common.trustBoundary}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6d68]">
          {copy.auth.adminGate.previewBoundary}
        </p>
      </Card>
    </AppShell>
  );
}
