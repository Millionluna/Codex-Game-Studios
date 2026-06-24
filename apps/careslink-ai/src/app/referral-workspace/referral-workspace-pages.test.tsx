import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getReferralWorkspaceCopy } from "../../lib/referral-workspace-i18n";

vi.mock("@/components/app-shell", async () =>
  import("../../components/app-shell"),
);
vi.mock("@/components/page-header", async () =>
  import("../../components/page-header"),
);
vi.mock("@/components/referral-profile-workspace", async () =>
  import("../../components/referral-profile-workspace"),
);
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
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);

type PageComponent = (props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) => ReactElement | Promise<ReactElement>;

async function renderPage(
  Page: PageComponent,
  searchParams: Record<string, string | string[] | undefined> = {
    lang: "zh-Hans",
  },
) {
  const element = await Page({ searchParams: Promise.resolve(searchParams) });

  return renderToStaticMarkup(element);
}

describe("referral workspace route localization", () => {
  it("localizes the workspace overview page and keeps route links in the selected locale", async () => {
    const { default: ReferralWorkspacePage } = await import("./page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralWorkspacePage);

    expect(markup).toContain(copy.workspace.title);
    expect(markup).toContain(copy.components.basicProfile.footer);
    expect(markup).toContain(copy.components.healthScore.heading);
    expect(markup).toContain('href="/referral-workspace/profile?lang=zh-Hans"');
    expect(markup).toContain('href="/referral-workspace/access?lang=zh-Hans"');
    expect(markup).toContain('href="/admin/access-requests?lang=zh-Hans"');
  });

  it("localizes the profile builder page and its read-only builder labels", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralProfilePage);

    expect(markup).toContain(copy.profile.title);
    expect(markup).toContain(copy.profile.noPersistence);
    expect(markup).toContain(copy.components.basicProfile.footer);
    expect(markup).toContain('href="/referral-workspace/health?lang=zh-Hans"');
    expect(markup).not.toContain("Profile builder preview");
  });

  it("localizes the health page while preserving readiness links", async () => {
    const { default: ReferralHealthPage } = await import("./health/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralHealthPage);

    expect(markup).toContain(copy.health.title);
    expect(markup).toContain(copy.health.scoreMeaningTitle);
    expect(markup).toContain(copy.components.healthSignals.heading);
    expect(markup).toContain('href="/referral-workspace/materials?lang=zh-Hans"');
    expect(markup).not.toContain("Referral Profile Health Audit");
  });

  it("localizes free and access-code materials modes while preserving access query params", async () => {
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const freeMarkup = await renderPage(ReferralMaterialsPage);
    const accessMarkup = await renderPage(ReferralMaterialsPage, {
      access: "code",
      lang: "zh-Hans",
    });

    expect(freeMarkup).toContain(copy.materials.title);
    expect(freeMarkup).toContain(copy.materials.freeMode);
    expect(freeMarkup).toContain(
      'href="/referral-workspace/materials?access=code&amp;lang=zh-Hans"',
    );
    expect(accessMarkup).toContain(copy.materials.accessMode);
    expect(accessMarkup).toContain(
      'href="/referral-workspace/materials?access=code&amp;lang=en"',
    );
  });

  it("localizes the access page and keeps materials/admin links in the selected locale", async () => {
    const { default: ReferralAccessPage } = await import("./access/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralAccessPage);

    expect(markup).toContain(copy.access.title);
    expect(markup).toContain(copy.access.costControlTitle);
    expect(markup).toContain(
      'href="/referral-workspace/materials?access=code&amp;lang=zh-Hans"',
    );
    expect(markup).toContain('href="/admin/access-requests?lang=zh-Hans"');
    expect(markup).not.toContain("Access code application preview");
  });

  it("localizes the admin access queue and preserves workspace cross-links", async () => {
    const { default: AdminAccessRequestsPage } = await import(
      "../admin/access-requests/page"
    );
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(AdminAccessRequestsPage);

    expect(markup).toContain(copy.admin.title);
    expect(markup).toContain(copy.admin.boundary);
    expect(markup).toContain('href="/referral-workspace/access?lang=zh-Hans"');
    expect(markup).toContain('href="/referral-workspace?lang=zh-Hans"');
    expect(markup).not.toContain("Access request queue");
  });
});
