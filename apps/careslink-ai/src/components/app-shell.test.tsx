import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../lib/referral-workspace-i18n"),
);

const originalLegacyDemoNavEnv =
  process.env.NEXT_PUBLIC_CARESLINK_SHOW_LEGACY_DEMO_NAV;

describe("AppShell", () => {
  afterEach(() => {
    if (originalLegacyDemoNavEnv === undefined) {
      delete process.env.NEXT_PUBLIC_CARESLINK_SHOW_LEGACY_DEMO_NAV;
      return;
    }

    process.env.NEXT_PUBLIC_CARESLINK_SHOW_LEGACY_DEMO_NAV =
      originalLegacyDemoNavEnv;
  });

  it("preserves caller-provided route context in language switcher links", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        locale="zh-Hans"
        languageSwitcherHref="/referral-workspace/materials?access=code#preview"
      >
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(markup).toContain(
      'href="/referral-workspace/materials?access=code&amp;lang=en#preview"',
    );
    expect(markup).toContain(
      'href="/referral-workspace/materials?access=code&amp;lang=zh-Hans#preview"',
    );
  });

  it("renders readable Simplified Chinese shell labels", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        locale="zh-Hans"
        languageSwitcherHref="/referral-workspace"
        workspaceRole="provider"
        workspaceSessionSource="supabase"
      >
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(markup).toContain("AI 文档");
    expect(markup).toContain("简体中文");
    expect(markup).toContain("已保存文档");
    expect(markup).toContain("资料与转介准备");
    expect(markup).toContain("仅用于一般文档和运营支持");
    expect(markup).not.toMatch(new RegExp("[\\uFFFD\\u00C3]"));
    expect(markup).not.toContain(String.fromCharCode(0x93c8));
    expect(markup).not.toContain(String.fromCharCode(0x9427));
  });

  it("shows only provider workspace navigation for a real provider session", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        locale="en"
        languageSwitcherHref="/referral-workspace"
        workspaceRole="provider"
        workspaceSessionSource="supabase"
      >
        <div>Referral Pack workspace</div>
      </AppShell>,
    );

    expect(markup).toContain('href="/ai-documents?lang=en"');
    expect(markup).toContain('href="/referral-workspace/referral-pack?lang=en"');
    expect(markup).toContain('href="/referral-workspace/profile?lang=en"');
    expect(markup).toContain('href="/referral-workspace/access?lang=en"');
    expect(markup).toContain("AI Documents");
    expect(markup).toContain("Referrals");
    expect(markup).toContain("Saved Documents");
    expect(markup).not.toContain("/admin/access-requests");
    expect(markup).not.toContain("/admin/material-usage");
    expect(markup).not.toContain("/demo");
    expect(markup).not.toContain("/providers");
    expect(markup).not.toContain("account=");
  });

  it("shows only admin navigation for a real admin session", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        locale="en"
        languageSwitcherHref="/admin/access-requests"
        workspaceRole="admin"
        workspaceSessionSource="supabase"
      >
        <div>Admin queue</div>
      </AppShell>,
    );

    expect(markup).toContain('href="/admin/access-requests?lang=en"');
    expect(markup).toContain('href="/admin/material-usage?lang=en"');
    expect(markup).not.toContain("/referral-workspace/profile");
    expect(markup).not.toContain("/referral-workspace/materials");
    expect(markup).not.toContain("/referral-workspace/access");
    expect(markup).not.toContain("/demo");
    expect(markup).not.toContain("account=");
  });

  it("shows pilot-safe provider navigation for demo query-param accounts", () => {
    delete process.env.NEXT_PUBLIC_CARESLINK_SHOW_LEGACY_DEMO_NAV;

    const markup = renderToStaticMarkup(
      <AppShell
        locale="en"
        languageSwitcherHref="/referral-workspace"
        workspaceAccountId="user-approved"
        workspaceRole="provider"
        workspaceSessionSource="demo"
      >
        <div>Demo preview</div>
      </AppShell>,
    );

    expect(markup).toContain(
      'href="/ai-documents?lang=en&amp;account=user-approved"',
    );
    expect(markup).toContain(
      'href="/referral-workspace/profile?lang=en&amp;account=user-approved"',
    );
    expect(markup).toContain(
      'href="/referral-workspace/access?lang=en&amp;account=user-approved"',
    );
    expect(markup).not.toContain("/demo");
    expect(markup).not.toContain("/providers");
    expect(markup).not.toContain("/dashboard");
    expect(markup).not.toContain("Legacy");
  });

  it("shows legacy demo navigation for demo accounts when explicitly enabled", () => {
    process.env.NEXT_PUBLIC_CARESLINK_SHOW_LEGACY_DEMO_NAV = "true";

    const markup = renderToStaticMarkup(
      <AppShell
        locale="en"
        languageSwitcherHref="/referral-workspace"
        workspaceAccountId="user-approved"
        workspaceRole="provider"
        workspaceSessionSource="demo"
      >
        <div>Demo preview</div>
      </AppShell>,
    );

    expect(markup).toContain("/demo");
    expect(markup).toContain("/providers");
  });
});
