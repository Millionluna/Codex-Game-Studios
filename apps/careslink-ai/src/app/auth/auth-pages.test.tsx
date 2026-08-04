import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getReferralWorkspaceCopy } from "../../lib/referral-workspace-i18n";

const googleOAuthMock = vi.hoisted(() => ({
  isGoogleOAuthAvailable: vi.fn(async () => false),
}));

vi.mock("@/lib/google-oauth", () => ({
  isGoogleOAuthAvailable: googleOAuthMock.isGoogleOAuthAvailable,
}));
vi.mock("@/lib/auth-page-context", async () =>
  import("../../lib/auth-page-context"),
);

vi.mock("@/components/app-shell", async () =>
  import("../../components/app-shell"),
);
vi.mock("@/components/guided-share-card-generator", async () =>
  import("../../components/guided-share-card-generator"),
);
vi.mock("@/components/guided-profile-rewrite-generator", async () =>
  import("../../components/guided-profile-rewrite-generator"),
);
vi.mock("@/components/guided-referral-message-generator", async () =>
  import("../../components/guided-referral-message-generator"),
);
vi.mock("@/components/guided-bilingual-intro-generator", async () =>
  import("../../components/guided-bilingual-intro-generator"),
);
vi.mock("@/components/guided-handover-checklist-generator", async () =>
  import("../../components/guided-handover-checklist-generator"),
);
vi.mock("@/components/generated-draft-copy-button", async () =>
  import("../../components/generated-draft-copy-button"),
);
vi.mock("@/components/page-header", async () =>
  import("../../components/page-header"),
);
vi.mock("@/components/auth-submit-button", async () =>
  import("../../components/auth-submit-button"),
);
vi.mock("@/components/google-oauth-form", async () =>
  import("../../components/google-oauth-form"),
);
vi.mock("@/components/referral-workspace-auth-gate", async () =>
  import("../../components/referral-workspace-auth-gate"),
);
vi.mock("@/components/referral-profile-workspace", async () =>
  import("../../components/referral-profile-workspace"),
);
vi.mock("@/components/workspace-layout", async () =>
  import("../../components/workspace-layout"),
);
vi.mock("@/components/provider-draft-handoff-persister", () => ({
  ProviderDraftHandoffPersister: () => null,
}));
vi.mock("@/components/ui", async () => {
  const React = await import("react");

  return {
    ButtonLink: ({
      href,
      children,
    }: {
      href: string;
      children: React.ReactNode;
    }) => React.createElement("a", { href }, children),
    Card: ({
      children,
      className = "",
    }: {
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("section", { className }, children),
    FieldLabel: ({ children }: { children: React.ReactNode }) =>
      React.createElement("label", null, children),
    MetricCard: ({
      label,
      value,
      detail,
    }: {
      label: string;
      value: string;
      detail: string;
    }) =>
      React.createElement(
        "section",
        null,
        React.createElement("p", null, label),
        React.createElement("p", null, value),
        React.createElement("p", null, detail),
      ),
    SelectInput: ({
      children,
      ...props
    }: React.SelectHTMLAttributes<HTMLSelectElement>) =>
      React.createElement("select", props, children),
    TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
    TextInput: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
  };
});
vi.mock("../../components/ui", async () => {
  const React = await import("react");

  return {
    ButtonLink: ({
      href,
      children,
    }: {
      href: string;
      children: React.ReactNode;
    }) => React.createElement("a", { href }, children),
    Card: ({
      children,
      className = "",
    }: {
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("section", { className }, children),
    FieldLabel: ({ children }: { children: React.ReactNode }) =>
      React.createElement("label", null, children),
    MetricCard: ({
      label,
      value,
      detail,
    }: {
      label: string;
      value: string;
      detail: string;
    }) =>
      React.createElement(
        "section",
        null,
        React.createElement("p", null, label),
        React.createElement("p", null, value),
        React.createElement("p", null, detail),
      ),
    SelectInput: ({
      children,
      ...props
    }: React.SelectHTMLAttributes<HTMLSelectElement>) =>
      React.createElement("select", props, children),
    TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
    TextInput: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
  };
});
vi.mock("@/lib/referral-profile-workspace", async () =>
  import("../../lib/referral-profile-workspace"),
);
vi.mock("@/lib/referral-workspace-auth", async () =>
  import("../../lib/referral-workspace-auth"),
);
vi.mock("@/lib/referral-workspace-session", async () =>
  import("../../lib/referral-workspace-session"),
);
vi.mock("@/lib/referral-workspace-handoff", async () =>
  import("../../lib/referral-workspace-handoff"),
);
vi.mock("@/lib/provider-draft-store", async () =>
  import("../../lib/provider-draft-store"),
);
vi.mock("@/lib/generated-material-draft-store", async () =>
  import("../../lib/generated-material-draft-store"),
);
vi.mock("@/lib/generated-material-event-store", async () =>
  import("../../lib/generated-material-event-store"),
);
vi.mock("@/lib/outreach-store", async () =>
  import("../../lib/outreach-store"),
);
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);
vi.mock("@/lib/public-provider-profile-generator", async () =>
  import("../../lib/public-provider-profile-generator"),
);

type PageComponent = (props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<React.ReactElement>;

async function renderPage(
  Page: PageComponent,
  searchParams: Record<string, string | string[] | undefined> = {
    lang: "zh-Hans",
  },
) {
  const element = await Page({ searchParams: Promise.resolve(searchParams) });

  return renderToStaticMarkup(element);
}

describe("auth and access gate pages", () => {
  afterEach(() => {
    googleOAuthMock.isGoogleOAuthAvailable.mockResolvedValue(false);
  });

  it("renders localized login form without demo account choices", async () => {
    const { default: LoginPage } = await import("./login/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(LoginPage, {
      lang: "zh-Hans",
      next: "/referral-workspace/materials?access=code",
    });

    expect(markup).toContain("登录后继续准备 Referral Pack。");
    expect(markup).toContain("查看服务商资料、资料包草稿、转介阻碍、访问状态和跟进记录。");
    expect(markup).toContain("使用邮箱登录");
    expect(markup).toContain("登录并进入工作区");
    expect(markup).toContain("Referral Pack 工作台");
    expect(markup).toContain("转介阻碍");
    expect(markup).toContain('name="email"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('href="/auth/forgot-password?lang=zh-Hans"');
    expect(markup).toContain(
      'type="hidden" name="next" value="/referral-workspace/materials?access=code"',
    );
    expect(markup).toContain('type="hidden" name="lang" value="zh-Hans"');
    expect(markup).not.toContain(copy.auth.login.chooseAccount);
    expect(markup).not.toContain(copy.auth.demoAccounts.free.label);
    expect(markup).not.toContain(copy.auth.demoAccounts.approved.label);
    expect(markup).not.toContain("account=user-free");
    expect(markup).not.toContain("account=user-approved");
  });

  it("renders localized registration form without demo preview entry points", async () => {
    const { default: RegisterPage } = await import("./register/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(RegisterPage);

    expect(markup).toContain("保存草稿，并开始准备 Referral Pack。");
    expect(markup).toContain("创建账户以保存服务商资料、认领草稿，并继续准备可发送的资料包和跟进记录。");
    expect(markup).toContain("创建账户并进入工作区");
    expect(markup).toContain("认领服务商资料");
    expect(markup).toContain('name="name"');
    expect(markup).toContain('name="email"');
    expect(markup).toContain('type="password"');
    expect(markup).not.toContain(copy.auth.register.waitlistCta);
    expect(markup).not.toContain("account=user-free");
    expect(markup).not.toContain("account=user-waitlist");
  });

  it("shows Case Note context for an allowlisted companion next route in both locales", async () => {
    const { default: LoginPage } = await import("./login/page");
    const { default: RegisterPage } = await import("./register/page");
    const next =
      "/template-companion/ndis-case-note?source=ndis-case-note-download&resourceSlug=ndis-case-note-template";
    const loginEn = await renderPage(LoginPage, { lang: "en", next });
    const loginZh = await renderPage(LoginPage, { lang: "zh-Hans", next });
    const registerEn = await renderPage(RegisterPage, { lang: "en", next });
    const registerZh = await renderPage(RegisterPage, {
      lang: "zh-Hans",
      next,
    });

    expect(loginEn).toContain(
      "Sign in to continue to the NDIS Case Note Companion.",
    );
    expect(loginEn).toContain("AI Documents");
    expect(loginEn).toContain("NDIS Case Note AI Companion");
    expect(loginEn).toContain("Review privacy prompts");
    expect(loginEn).toContain("Sign in and continue");
    expect(loginEn).not.toContain("Referral Pack");

    expect(loginZh).toContain("登录后继续使用 NDIS Case Note AI 助手。");
    expect(loginZh).toContain("AI Documents");
    expect(loginZh).toContain("NDIS Case Note AI 助手");
    expect(loginZh).toContain("复核隐私提示");
    expect(loginZh).toContain("登录并继续");
    expect(loginZh).not.toContain("Referral Pack");

    expect(registerEn).toContain(
      "Create an account to use the NDIS Case Note Companion.",
    );
    expect(registerEn).toContain("AI Documents");
    expect(registerEn).toContain("NDIS Case Note AI Companion");
    expect(registerEn).toContain("Review privacy prompts");
    expect(registerEn).toContain("Create account and continue");
    expect(registerEn).not.toContain("Referral Pack");

    expect(registerZh).toContain("创建账户后使用 NDIS Case Note AI 助手。");
    expect(registerZh).toContain("AI Documents");
    expect(registerZh).toContain("NDIS Case Note AI 助手");
    expect(registerZh).toContain("复核隐私提示");
    expect(registerZh).toContain("创建账户并继续");
    expect(registerZh).not.toContain("Referral Pack");

    for (const markup of [loginEn, loginZh, registerEn, registerZh]) {
      expect(markup).toContain(
        'name="next" value="/template-companion/ndis-case-note?source=ndis-case-note-download&amp;resourceSlug=ndis-case-note-template"',
      );
    }
  });

  it("keeps Referral Pack copy for a non-allowlisted Case Note lookalike", async () => {
    const { default: LoginPage } = await import("./login/page");
    const { default: RegisterPage } = await import("./register/page");
    const searchParams = {
      lang: "en",
      next: "/template-companion/ndis-case-note-lookalike",
    };
    const loginMarkup = await renderPage(LoginPage, searchParams);
    const registerMarkup = await renderPage(RegisterPage, searchParams);

    expect(loginMarkup).toContain("Continue your Referral Pack workspace.");
    expect(loginMarkup).toContain("Referral Pack workspace");
    expect(loginMarkup).not.toContain(
      "Sign in to continue to the NDIS Case Note Companion.",
    );
    expect(registerMarkup).toContain(
      "Save the draft and prepare your Referral Pack.",
    );
    expect(registerMarkup).toContain("Referral Pack workspace");
    expect(registerMarkup).not.toContain(
      "Create an account to use the NDIS Case Note Companion.",
    );
  });

  it("shows Google OAuth on login and registration only when Supabase enables it", async () => {
    googleOAuthMock.isGoogleOAuthAvailable.mockResolvedValue(true);
    const { default: LoginPage } = await import("./login/page");
    const { default: RegisterPage } = await import("./register/page");

    const loginMarkup = await renderPage(LoginPage, {
      lang: "zh-Hans",
      next: "/template-companion/ndis-case-note?source=ndis-case-note-download",
    });
    const registerMarkup = await renderPage(RegisterPage, {
      lang: "en",
      next: "/ai-documents",
    });

    expect(loginMarkup).toContain("使用 Google 继续");
    expect(loginMarkup).toContain("或使用邮箱继续");
    expect(loginMarkup).toContain('src="/google-g.svg"');
    expect(loginMarkup).toContain(
      'name="next" value="/template-companion/ndis-case-note?source=ndis-case-note-download"',
    );
    expect(registerMarkup).toContain("Continue with Google");
    expect(registerMarkup).toContain("or create an account with email");
  });

  it("preserves a safe next route when creating a provider preview account", async () => {
    const { default: RegisterPage } = await import("./register/page");
    const markup = await renderPage(RegisterPage, {
      lang: "zh-Hans",
      next: "/referral-workspace/profile?draft=sample-harbour",
    });

    expect(markup).toContain(
      'type="hidden" name="next" value="/referral-workspace/profile?draft=sample-harbour"',
    );
    expect(markup).not.toContain("account=user-free");
  });

  it("shows auth errors and email-confirmation notices from redirects", async () => {
    const { default: LoginPage } = await import("./login/page");
    const loginMarkup = await renderPage(LoginPage, {
      lang: "zh-Hans",
      notice: "confirm-email",
    });

    expect(loginMarkup).toContain("Check your email");

    const { default: RegisterPage } = await import("./register/page");
    const registerMarkup = await renderPage(RegisterPage, {
      lang: "zh-Hans",
      error: "Email and password are required.",
    });

    expect(registerMarkup).toContain("Email and password are required.");
  });

  it("renders forgot password and update password forms", async () => {
    const { default: ForgotPasswordPage } = await import(
      "./forgot-password/page"
    );
    const forgotMarkup = await renderPage(ForgotPasswordPage, {
      lang: "en",
    });

    expect(forgotMarkup).toContain("Reset password");
    expect(forgotMarkup).toContain('name="email"');
    expect(forgotMarkup).toContain("Send reset email");
    expect(forgotMarkup).toContain('href="/auth/login?lang=en"');

    const { default: UpdatePasswordPage } = await import(
      "./update-password/page"
    );
    const updateMarkup = await renderPage(UpdatePasswordPage, {
      lang: "en",
      error: "Passwords do not match.",
    });

    expect(updateMarkup).toContain("Set a new password");
    expect(updateMarkup).toContain("Passwords do not match.");
    expect(updateMarkup).toContain('name="password"');
    expect(updateMarkup).toContain('name="confirmPassword"');
    expect(updateMarkup).toContain("Update password");
  });

  it("accepts public CaresLink source and draftId handoff without an explicit next route", async () => {
    const { default: RegisterPage } = await import("./register/page");
    const markup = await renderPage(RegisterPage, {
      source: "provider-profile-generator",
      draftId: "sample-harbour",
      lang: "zh-Hans",
    });

    expect(markup).toContain(
      'href="/auth/login?source=provider-profile-generator&amp;draftId=sample-harbour&amp;lang=zh-Hans"',
    );
    expect(markup).not.toContain("account=user-free");
    expect(markup).not.toContain("account=user-waitlist");
  });

  it("keeps public CaresLink handoff through the login/register links", async () => {
    const { default: LoginPage } = await import("./login/page");
    const markup = await renderPage(LoginPage, {
      source: "provider-profile-generator",
      draftId: "sample-harbour",
      lang: "zh-Hans",
    });

    expect(markup).toContain(
      'href="/auth/register?source=provider-profile-generator&amp;draftId=sample-harbour&amp;lang=zh-Hans"',
    );
    expect(markup).not.toContain("account=user-free");
    expect(markup).not.toContain("account=user-approved");
  });

  it("keeps touched auth and shell sources free of visible mojibake markers", () => {
    const files = [
      "src/app/auth/login/page.tsx",
      "src/app/auth/register/page.tsx",
      "src/components/app-shell.tsx",
      "src/components/page-header.tsx",
      "src/components/ui.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toMatch(new RegExp("[\\uFFFD\\u00C3]"));
      expect(source, file).not.toContain(String.fromCharCode(0x93c8));
      expect(source, file).not.toContain(String.fromCharCode(0x9427));
    }
  });

  it("shows a login-required gate on the workspace when no account is selected", async () => {
    const { default: ReferralWorkspacePage } = await import(
      "../referral-workspace/page"
    );
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralWorkspacePage);

    expect(markup).toContain(copy.auth.gate.title);
    expect(markup).toContain(copy.auth.gate.description);
    expect(markup).toContain('href="/auth/login?lang=zh-Hans');
    expect(markup).toContain('href="/auth/register?lang=zh-Hans');
    expect(markup).not.toContain("Alex Lee");
  });

  it("does not unlock guided materials from a URL access flag without an account", async () => {
    const { default: ReferralMaterialsPage } = await import(
      "../referral-workspace/materials/page"
    );
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralMaterialsPage, {
      access: "code",
      lang: "zh-Hans",
    });

    expect(markup).toContain(copy.auth.gate.title);
    expect(markup).not.toContain(copy.materials.accessMode);
  });

  it("keeps the admin access queue behind the admin demo account", async () => {
    const { default: AdminAccessRequestsPage } = await import(
      "../admin/access-requests/page"
    );
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(AdminAccessRequestsPage, {
      account: "user-free",
      lang: "zh-Hans",
    });

    expect(markup).toContain(copy.auth.adminGate.title);
    expect(markup).not.toContain(copy.admin.title);
  });

  it("keeps the admin material usage review behind the admin demo account", async () => {
    const { default: AdminMaterialUsagePage } = await import(
      "../admin/material-usage/page"
    );
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(AdminMaterialUsagePage, {
      account: "user-free",
      lang: "zh-Hans",
    });

    expect(markup).toContain(copy.auth.adminGate.title);
    expect(markup).not.toContain(copy.admin.materialUsage.title);
  });

  it("shows admin generated material usage metadata without exposing draft content", async () => {
    const { default: AdminMaterialUsagePage } = await import(
      "../admin/material-usage/page"
    );
    const { getGeneratedMaterialDraftStore } = await import(
      "../../lib/generated-material-draft-store"
    );
    const {
      createGeneratedMaterialEventRecord,
      getGeneratedMaterialEventStore,
    } = await import("../../lib/generated-material-event-store");
    const store = getGeneratedMaterialDraftStore();
    const eventStore = getGeneratedMaterialEventStore();

    await store.saveGeneratedMaterialDraft({
      id: "admin-usage-private-content",
      userId: "11111111-1111-4111-8111-111111111111",
      providerDraftId: "provider-draft-admin-usage",
      feature: "handover_checklist",
      status: "reviewed",
      content: {
        checklistTitle: "Private generated draft headline should not render",
        supportNeed: "Private support context should not render",
      },
      createdAt: "2026-06-26T09:00:00.000Z",
      updatedAt: "2026-06-26T09:30:00.000Z",
    });
    await eventStore.saveGeneratedMaterialEvent(
      createGeneratedMaterialEventRecord({
        userId: "11111111-1111-4111-8111-111111111111",
        providerDraftId: "provider-draft-admin-usage",
        generatedMaterialDraftId: "admin-usage-private-content",
        feature: "handover_checklist",
        eventType: "copy_all",
        now: "2026-06-26T09:35:00.000Z",
      }),
    );
    await eventStore.saveGeneratedMaterialEvent(
      createGeneratedMaterialEventRecord({
        userId: "11111111-1111-4111-8111-111111111111",
        providerDraftId: "provider-draft-admin-usage",
        generatedMaterialDraftId: "admin-usage-private-content",
        feature: "handover_checklist",
        eventType: "copy_field",
        fieldKey: "supportNeed",
        now: "2026-06-26T09:36:00.000Z",
      }),
    );

    const copy = getReferralWorkspaceCopy("en");
    const markup = await renderPage(AdminMaterialUsagePage, {
      account: "user-admin",
      lang: "en",
    });

    expect(markup).toContain(copy.admin.materialUsage.title);
    expect(markup).toContain("admin-usage-private-content");
    expect(markup).toContain("11111111-1111-4111-8111-111111111111");
    expect(markup).toContain("provider-draft-admin-usage");
    expect(markup).toContain("Handover checklist");
    expect(markup).toContain("Reviewed");
    expect(markup).toContain("Content not shown");
    expect(markup).toContain("Copy all events");
    expect(markup).toContain("Copy field events");
    expect(markup).toContain("2 events");
    expect(markup).not.toContain("Private generated draft headline should not render");
    expect(markup).not.toContain("Private support context should not render");
  });
});
