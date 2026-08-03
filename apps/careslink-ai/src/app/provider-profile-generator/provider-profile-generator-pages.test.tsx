import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);
vi.mock("@/lib/ndis-case-note-companion-navigation", async () =>
  import("../../lib/ndis-case-note-companion-navigation"),
);
vi.mock("@/lib/public-provider-profile-generator", async () =>
  import("../../lib/public-provider-profile-generator"),
);
vi.mock("@/lib/referral-workspace-auth", async () =>
  import("../../lib/referral-workspace-auth"),
);
vi.mock("@/lib/referral-workspace-handoff", async () =>
  import("../../lib/referral-workspace-handoff"),
);
vi.mock("@/lib/provider-draft-store", async () =>
  import("../../lib/provider-draft-store"),
);

type PageComponent = (props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) => ReactElement | Promise<ReactElement>;

async function renderPage(
  Page: PageComponent,
  searchParams: Record<string, string | string[] | undefined> = {
    lang: "zh-Hans",
  },
  params: Record<string, string | string[] | undefined> = {},
) {
  const element = await Page({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(searchParams),
  });

  return renderToStaticMarkup(element);
}

const riversideDraftPayload = JSON.stringify({
  version: 1,
  id: "riverside-care-navigation",
  businessName: "Riverside Care Navigation",
  serviceCategories: ["Aged care navigation", "NDIS support coordination"],
  referralServices: ["SERV-0007"],
  serviceAreas: ["Brisbane South", "Logan"],
  languages: ["English", "Mandarin"],
  supportsNdis: true,
  supportsAgedCare: true,
  acceptingNewClients: true,
  urgentReferralAvailable: true,
  shortDescription:
    "Bilingual care navigation provider helping families understand aged care and NDIS referral pathways.",
  targetClients: "Older people, NDIS participants, and family decision makers",
  publicContactMethods: ["Phone", "Email"],
  sourceChannel: "public-generator",
  createdAt: "2026-06-25T00:00:00.000Z",
  updatedAt: "2026-06-25T00:00:00.000Z",
});

describe("public provider profile generator funnel", () => {
  it("renders the public homepage as a CaresLink AI entry point instead of redirecting", async () => {
    const { default: HomePage } = await import("../page");
    const markup = await renderPage(HomePage);

    expect(markup).toContain("把支持事实整理成可复核的文档草稿。");
    expect(markup).toContain("AI Documents");
    expect(markup).toContain("创建免费账户");
    expect(markup).toContain("/careslink-ai-logo-reverse.svg");
    expect(markup).toContain('href="/auth/register?next=');
    expect(markup).toContain(
      "%2Ftemplate-companion%2Fndis-case-note%3Fsource%3Dndis-case-note-download",
    );
    expect(markup).not.toContain("Provider growth funnel");
    expect(markup).not.toContain("Access Code");
  });

  it("renders the generator landing page with no-cost deterministic preview positioning", async () => {
    const { default: ProviderProfileGeneratorPage } = await import("./page");
    const markup = await renderPage(ProviderProfileGeneratorPage);

    expect(markup).toContain("Provider Profile Generator");
    expect(markup).toContain("不调用 AI，不产生 token 成本");
    expect(markup).toContain(
      'href="/provider-profile-generator/new?lang=zh-Hans"',
    );
    expect(markup).toContain('href="/auth/register?lang=zh-Hans"');
  });

  it("renders the anonymous generator form and links to a deterministic draft preview", async () => {
    const { default: NewProviderProfileDraftPage } = await import("./new/page");
    const markup = await renderPage(NewProviderProfileDraftPage);

    expect(markup).toContain("Create a free provider profile draft");
    expect(markup).toContain("Riverside Care Navigation");
    expect(markup).toContain("Provider name");
    expect(markup).toContain("Referral direction");
    expect(markup).toContain("Service areas");
    expect(markup).toContain(
      'href="/provider-profile-generator/preview/riverside-care-navigation?lang=zh-Hans"',
    );
    expect(markup).toContain(
      'href="/auth/register?source=provider-profile-generator&amp;draftId=riverside-care-navigation&amp;next=',
    );
    expect(markup).not.toContain("draftPayload=");
  });

  it("renders a draft preview with share card and login-to-save CTA", async () => {
    const { default: ProviderProfileDraftPreviewPage } = await import(
      "./preview/[draftId]/page"
    );
    const markup = await renderPage(
      ProviderProfileDraftPreviewPage,
      { lang: "zh-Hans" },
      { draftId: "sample-harbour" },
    );

    expect(markup).toContain("Harbour Community Support");
    expect(markup).toContain("Share card preview");
    expect(markup).toContain("Self-submitted provider information");
    expect(markup).toContain(
      'href="/auth/register?source=provider-profile-generator&amp;draftId=sample-harbour&amp;next=',
    );
    expect(markup).toContain(
      "next=%2Freferral-workspace%2Fprofile%3Fsource%3Dprovider-profile-generator%26draftId%3Dsample-harbour",
    );
    expect(markup).not.toContain("draftPayload=");
    expect(markup).toContain(
      'href="/referral-workspace/profile?source=provider-profile-generator&amp;draftId=sample-harbour&amp;lang=zh-Hans&amp;account=user-free"',
    );
  });

  it("renders a repository draft preview without long draft payload URLs", async () => {
    const { default: ProviderProfileDraftPreviewPage } = await import(
      "./preview/[draftId]/page"
    );
    const markup = await renderPage(
      ProviderProfileDraftPreviewPage,
      { lang: "zh-Hans" },
      { draftId: "riverside-care-navigation" },
    );

    expect(markup).toContain("Riverside Care Navigation");
    expect(markup).toContain("Brisbane South, Logan");
    expect(markup).toContain(
      'href="/auth/register?source=provider-profile-generator&amp;draftId=riverside-care-navigation&amp;next=',
    );
    expect(markup).toContain(
      'href="/referral-workspace/profile?source=provider-profile-generator&amp;draftId=riverside-care-navigation&amp;lang=zh-Hans&amp;account=user-free"',
    );
    expect(markup).not.toContain("draftPayload=");
  });

  it("renders a real generator payload in preview and stores it behind short account links", async () => {
    const { default: ProviderProfileDraftPreviewPage } = await import(
      "./preview/[draftId]/page"
    );
    const markup = await renderPage(
      ProviderProfileDraftPreviewPage,
      { lang: "zh-Hans", draftPayload: riversideDraftPayload },
      { draftId: "riverside-care-navigation" },
    );

    expect(markup).toContain("Riverside Care Navigation");
    expect(markup).toContain("Brisbane South, Logan");
    expect(markup).toContain("Bilingual care navigation provider");
    expect(markup).not.toContain("Harbour Community Support");
    expect(markup).toContain(
      'href="/auth/register?source=provider-profile-generator&amp;draftId=riverside-care-navigation&amp;next=',
    );
    expect(markup).toContain(
      "next=%2Freferral-workspace%2Fprofile%3Fsource%3Dprovider-profile-generator%26draftId%3Driverside-care-navigation",
    );
    expect(markup).toContain(
      'href="/referral-workspace/profile?source=provider-profile-generator&amp;draftId=riverside-care-navigation&amp;lang=zh-Hans&amp;account=user-free"',
    );
    expect(markup).not.toContain("draftPayload=");
  });
});
