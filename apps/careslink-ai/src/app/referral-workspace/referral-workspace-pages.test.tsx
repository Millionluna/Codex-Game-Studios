import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getReferralWorkspaceCopy } from "../../lib/referral-workspace-i18n";

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
vi.mock("@/components/generated-draft-copy-button", async () => {
  const React = await import("react");

  return {
    GeneratedDraftCopyButton: ({
      label,
      ariaLabel,
    }: {
      label: string;
      ariaLabel: string;
    }) => React.createElement("button", { type: "button", "aria-label": ariaLabel }, label),
  };
});
vi.mock("@/components/page-header", async () =>
  import("../../components/page-header"),
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
vi.mock("@/components/provider-draft-handoff-persister", async () => {
  const React = await import("react");

  return {
    ProviderDraftHandoffPersister: ({
      source,
      draftId,
      draftPayload,
    }: {
      source?: string;
      draftId?: string;
      draftPayload?: string;
    }) =>
      React.createElement("span", {
        "data-testid": "provider-draft-handoff-persister",
        "data-source": source,
        "data-draft-id": draftId,
        "data-draft-payload": draftPayload,
        hidden: true,
      }),
  };
});
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
vi.mock("@/lib/supabase-server", async () =>
  import("../../lib/supabase-server"),
);
vi.mock("@/lib/referral-workspace-handoff", async () =>
  import("../../lib/referral-workspace-handoff"),
);
vi.mock("@/lib/referral-workspace-provider-context", async () =>
  import("../../lib/referral-workspace-provider-context"),
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
vi.mock("@/lib/referral-pack-target-copy", async () =>
  import("../../lib/referral-pack-target-copy"),
);
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);
vi.mock("@/lib/public-provider-profile-generator", async () =>
  import("../../lib/public-provider-profile-generator"),
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
    account: "user-free",
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

function countOccurrences(markup: string, text: string): number {
  return markup.split(text).length - 1;
}

function getVisibleText(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expectNoInternalProviderFacingCopy(visibleText: string) {
  const normalizedVisibleText = visibleText.toLowerCase();

  for (const blockedTerm of [
    "openai",
    "real ai",
    "demo account",
    "demo access",
    "provider 资料",
    "profile 文案",
    "access request",
    "approved provider",
    "verified provider",
    "verified",
    "compliant",
    "certified",
    "endorsed",
    "guaranteed",
    "演示账号",
    "演示访问",
    "演示链接",
    "材料演示",
    "访问码演示",
  ]) {
    expect(normalizedVisibleText).not.toContain(blockedTerm);
  }
}

function expectNoInternalRoleMatrixCopy(visibleText: string) {
  [
    "转介角色矩阵",
    "Referral role matrix",
    "种子",
    "种子集合",
    "seeded",
    "seed set",
    "Seeded Harbour",
    "与此资料相关",
    "此方向不使用",
    "Relevant",
    "Not used",
    "Vitalcare support",
    "Alex Lee",
    "CarePath Advisory",
  ].forEach((copy) => {
    expect(visibleText).not.toContain(copy);
  });
}

describe("referral workspace route localization", () => {
  it(
    "localizes the workspace overview page and keeps route links in the selected locale",
    async () => {
      const { default: ReferralWorkspacePage } = await import("./page");
      const copy = getReferralWorkspaceCopy("zh-Hans");
      const markup = await renderPage(ReferralWorkspacePage, {
        account: "user-free",
        lang: "zh-Hans",
      });

      expect(markup).toContain(copy.workspace.title);
      expect(markup).toContain(copy.components.basicProfile.footer);
      expect(markup).toContain("资料包来源");
      expect(markup).toContain("转介阻碍");
      expect(markup).toContain("Referral Pack 和跟进");
      expect(markup).toContain("工作区访问");
      expect(markup).toContain("AI 材料队列");
      expect(markup).toContain(
        'href="/referral-workspace/profile?lang=zh-Hans&amp;account=user-free"',
      );
      expect(markup).toContain(
        'href="/referral-workspace/access?lang=zh-Hans&amp;account=user-free"',
      );
      expect(markup).not.toContain(
        'href="/admin/access-requests?lang=zh-Hans&amp;account=user-free"',
      );
    },
    10000,
  );

  it("localizes the profile builder page and its read-only builder labels", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralProfilePage);

    expect(markup).toContain(copy.profile.title);
    expect(markup).toContain(copy.profile.noPersistence);
    expect(markup).toContain(copy.components.basicProfile.footer);
    expect(markup).toContain(
      'href="/referral-workspace/health?lang=zh-Hans&amp;account=user-free"',
    );
    expect(markup).not.toContain("Profile builder preview");
  });

  it("hides internal role matrix and seed provider records from provider profile pages", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");

    const markup = await renderPage(ReferralProfilePage, {
      account: "user-approved",
      lang: "zh-Hans",
    });
    const visibleText = getVisibleText(markup);

    expect(visibleText).toContain("你的转介角色");
    expect(visibleText).toContain("接收转介需要补充");
    expectNoInternalRoleMatrixCopy(visibleText);
    expect(visibleText).not.toContain("user-approved");
    expect(visibleText).not.toContain("user-free");
  });

  it("hides internal role matrix and seed provider records from the provider cockpit", async () => {
    const { default: ReferralWorkspacePage } = await import("./page");

    const markup = await renderPage(ReferralWorkspacePage, {
      account: "user-approved",
      lang: "zh-Hans",
    });
    const visibleText = getVisibleText(markup);

    expect(visibleText).toContain("Referral Pack 工作台");
    expectNoInternalRoleMatrixCopy(visibleText);
    expect(visibleText).not.toContain("user-approved");
    expect(visibleText).not.toContain("user-free");
  });

  it(
    "renders provider subpages with the compact workspace shell and no legacy hero/account text",
    async () => {
      const { default: ReferralProfilePage } = await import("./profile/page");
      const { default: ReferralHealthPage } = await import("./health/page");
      const { default: ReferralMaterialsPage } = await import("./materials/page");
      const { default: ReferralAccessPage } = await import("./access/page");

      const pages = [
        ReferralProfilePage,
        ReferralHealthPage,
        ReferralMaterialsPage,
        ReferralAccessPage,
      ];

      for (const Page of pages) {
        const markup = await renderPage(Page, {
          account: "user-approved",
          lang: "zh-Hans",
        });
        const visibleText = getVisibleText(markup);

        expect(markup).toContain("workspace-grid");
        expect(markup).toContain("workspace-main-panel");
        expect(markup).toContain("workspace-right-rail");
        expect(markup).not.toContain("hero-title");
        expectNoInternalProviderFacingCopy(visibleText);
        expect(visibleText).not.toContain("一个工作台，管理转介准备度。");
        expect(visibleText).not.toContain("demo account");
        expect(visibleText).not.toContain("user-approved");
        expect(visibleText).not.toContain("user-free");
      }
    },
    10000,
  );

  it("keeps real admin sessions out of provider workspace subpages", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const { default: ReferralHealthPage } = await import("./health/page");
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const { default: ReferralAccessPage } = await import("./access/page");
    const copy = getReferralWorkspaceCopy("en");

    for (const Page of [
      ReferralProfilePage,
      ReferralHealthPage,
      ReferralMaterialsPage,
      ReferralAccessPage,
    ]) {
      const markup = await renderPage(Page, {
        account: "user-admin",
        lang: "en",
      });

      expect(markup).toContain(copy.auth.adminGate.title);
      expect(markup).toContain(copy.auth.adminGate.adminCta);
      expect(markup).not.toContain("workspace-grid");
      expect(markup).not.toContain("Alex Lee");
      expect(markup).not.toContain("Generate profile rewrite");
    }
  });

  it("keeps waitlist overview, materials, and access surfaces free of internal copy", async () => {
    const { default: ReferralWorkspacePage } = await import("./page");
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const { default: ReferralAccessPage } = await import("./access/page");

    for (const Page of [
      ReferralWorkspacePage,
      ReferralMaterialsPage,
      ReferralAccessPage,
    ]) {
      const markup = await renderPage(Page, {
        account: "user-waitlist",
        lang: "en",
      });
      const visibleText = getVisibleText(markup);

      expectNoInternalProviderFacingCopy(visibleText);
      expect(visibleText).not.toContain("user-waitlist");
    }
  });

  it("imports a public draft into the profile workspace preview", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const markup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      draft: "sample-harbour",
      lang: "zh-Hans",
    });

    expect(markup).toContain("已导入服务商资料草稿");
    expect(markup).toContain("草稿 ID：sample-harbour");
    expect(markup).toContain("clear intake details for referral partners");
    expect(markup).toContain(
      'href="/referral-workspace/health?draft=sample-harbour&amp;lang=zh-Hans&amp;account=user-free"',
    );
  });

  it("imports a public CaresLink draftId handoff into the profile workspace preview", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const markup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      source: "provider-profile-generator",
      draftId: "sample-harbour",
      lang: "zh-Hans",
    });

    expect(markup).toContain("已导入服务商资料草稿");
    expect(markup).toContain("草稿 ID：sample-harbour");
    expect(markup).toContain("来源：provider-profile-generator");
    expect(markup).toContain("clear intake details for referral partners");
    expect(markup).toContain(
      'href="/referral-workspace/health?source=provider-profile-generator&amp;draftId=sample-harbour&amp;lang=zh-Hans&amp;account=user-free"',
    );
  });

  it("imports a repository-backed public draft using draftId only", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const markup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      source: "provider-profile-generator",
      draftId: "riverside-care-navigation",
      lang: "zh-Hans",
    });

    expect(markup).toContain("已导入服务商资料草稿");
    expect(markup).toContain("Riverside Care Navigation");
    expect(markup).toContain("Brisbane South, Logan");
    expect(markup).toContain("Provider listed public contact methods");
    expect(markup).toContain(
      'href="/referral-workspace/health?source=provider-profile-generator&amp;draftId=riverside-care-navigation&amp;lang=zh-Hans&amp;account=user-free"',
    );
    expect(markup).not.toContain("draftPayload=");
  });

  it("mounts draft handoff persistence on workspace pages without adding draftPayload to draftId-only handoff links", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const { default: ReferralHealthPage } = await import("./health/page");
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const { default: ReferralAccessPage } = await import("./access/page");
    const pages = [
      ReferralProfilePage,
      ReferralHealthPage,
      ReferralMaterialsPage,
      ReferralAccessPage,
    ];

    for (const Page of pages) {
      const markup = await renderPage(Page, {
        account: "user-free",
        source: "provider-profile-generator",
        draftId: "riverside-care-navigation",
        lang: "zh-Hans",
      });

      expect(markup).toContain(
        'data-testid="provider-draft-handoff-persister"',
      );
      expect(markup).toContain('data-source="provider-profile-generator"');
      expect(markup).toContain('data-draft-id="riverside-care-navigation"');
      expect(markup).not.toContain("draftPayload=");
    }
  });

  it("accepts public draftId handoff links from auth pages", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const markup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      draftId: "sample-harbour",
      lang: "zh-Hans",
      source: "provider-profile-generator",
    });

    expect(markup).toContain("已导入服务商资料草稿");
    expect(markup).toContain("草稿 ID：sample-harbour");
    expect(markup).toContain("clear intake details for referral partners");
  });

  it("imports real provider payload data instead of falling back to the mock draft", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const draftPayload = JSON.stringify({
      version: 1,
      id: "bright-path",
      businessName: "Bright Path Community Support",
      serviceCategories: ["Transport", "Interpreting"],
      referralServices: ["SERV-0016"],
      serviceAreas: ["Sydney", "Parramatta"],
      languages: ["English", "Mandarin"],
      supportsNdis: true,
      supportsAgedCare: true,
      acceptingNewClients: true,
      urgentReferralAvailable: false,
      shortDescription:
        "Community support provider helping families with transport and interpreting.",
      targetClients: "Older people and NDIS participants",
      publicContactMethods: ["Phone", "Website"],
      sourceChannel: "public-generator",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    });
    const markup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      draftId: "bright-path",
      draftPayload,
      lang: "zh-Hans",
      source: "provider-profile-generator",
    });

    expect(markup).toContain("Bright Path Community Support");
    expect(markup).toContain("Sydney, Parramatta");
    expect(markup).toContain("Provider listed public contact methods");
    expect(markup).toContain("draftPayload=");
  });

  it("stores an inbound generator payload for later draftId-only workspace access", async () => {
    const { default: ProviderProfileDraftPreviewPage } = await import(
      "../provider-profile-generator/preview/[draftId]/page"
    );
    const { default: ReferralProfilePage } = await import("./profile/page");
    const draftPayload = JSON.stringify({
      version: 1,
      id: "stored-bright-path",
      businessName: "Stored Bright Path Support",
      serviceCategories: ["Transport", "Interpreting"],
      referralServices: ["SERV-0016"],
      serviceAreas: ["Sydney", "Parramatta"],
      languages: ["English", "Mandarin"],
      supportsNdis: true,
      supportsAgedCare: true,
      acceptingNewClients: true,
      urgentReferralAvailable: false,
      shortDescription:
        "Stored provider draft imported once from the public generator.",
      targetClients: "Older people and NDIS participants",
      publicContactMethods: ["Phone", "Website"],
      sourceChannel: "public-generator",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    });
    const previewMarkup = await renderPage(
      ProviderProfileDraftPreviewPage,
      { lang: "zh-Hans", draftPayload },
      { draftId: "stored-bright-path" },
    );
    const profileMarkup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      draftId: "stored-bright-path",
      lang: "zh-Hans",
      source: "provider-profile-generator",
    });

    expect(previewMarkup).toContain("Stored Bright Path Support");
    expect(previewMarkup).toContain(
      'href="/auth/register?source=provider-profile-generator&amp;draftId=stored-bright-path&amp;next=',
    );
    expect(previewMarkup).not.toContain("draftPayload=");
    expect(profileMarkup).toContain("Stored Bright Path Support");
    expect(profileMarkup).toContain("Sydney, Parramatta");
    expect(profileMarkup).toContain("草稿 ID：stored-bright-path");
  });

  it("loads the signed-in account's claimed provider draft when no draftId is present", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const {
      claimProviderDraft,
      getProviderDraftStore,
      resolveProviderDraftForOwner,
    } = await import("../../lib/provider-draft-store");
    const store = getProviderDraftStore();
    await store.saveDraft({
      id: "claimed-owner-profile",
      source: "provider-profile-generator",
      draftPayload: JSON.stringify({
        version: 1,
        id: "claimed-owner-profile",
        businessName: "Claimed Owner Profile",
        serviceCategories: ["Transport"],
        referralServices: ["SERV-0016"],
        serviceAreas: ["Adelaide"],
        languages: ["English"],
        supportsNdis: true,
        supportsAgedCare: false,
        acceptingNewClients: true,
        urgentReferralAvailable: false,
        shortDescription: "Claimed provider profile for workspace owner.",
        targetClients: "NDIS participants",
        publicContactMethods: ["Website"],
        sourceChannel: "test",
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T00:00:00.000Z",
      }),
      status: "draft",
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    });
    await claimProviderDraft({
      draftId: "claimed-owner-profile",
      ownerUserId: "user-free",
      store,
      now: "2026-06-26T01:00:00.000Z",
    });

    await expect(
      resolveProviderDraftForOwner({
        ownerUserId: "user-free",
        store,
      }),
    ).resolves.toMatchObject({
      source: "store",
      draft: {
        profile: {
          name: "Claimed Owner Profile",
        },
      },
    });

    const markup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      lang: "zh-Hans",
    });

    expect(markup).toContain("Claimed Owner Profile");
    expect(markup).toContain("Adelaide");
  });

  it("shows profile quality prompts without implying provider verification", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const markup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      lang: "en",
    });

    expect(markup).toContain("Referral Pack source quality");
    expect(markup).toContain("Profile completeness");
    expect(markup).toContain("Missing fields");
    expect(markup).toContain("Provider-submitted information");
    expect(markup).toContain("AI-generated draft wording");
    expect(markup).toContain("Needs provider review");
    expect(markup).toContain("Referral blocker prompts");
    expect(markup).not.toContain("verified provider");
    expect(markup).not.toContain("approved provider");
    expect(markup).not.toContain("certified provider");
  });

  it("localizes profile quality guidance in Simplified Chinese", async () => {
    const { default: ReferralProfilePage } = await import("./profile/page");
    const markup = await renderPage(ReferralProfilePage, {
      account: "user-free",
      lang: "zh-Hans",
    });

    expect(markup).toContain("资料包来源质量");
    expect(markup).toContain("资料完整度");
    expect(markup).toContain("缺失字段");
    expect(markup).toContain("服务商自填资料");
    expect(markup).toContain("AI 生成草稿文案");
    expect(markup).toContain("需要服务商复核");
    expect(markup).not.toContain("Profile quality");
    expect(markup).not.toContain("Provider-submitted information");
    expect(markup).not.toContain("AI-generated draft wording");
  });

  it("renders a provider cockpit from claimed profile and saved material metadata", async () => {
    const { default: ReferralWorkspacePage } = await import("./page");
    const { claimProviderDraft, getProviderDraftStore } = await import(
      "../../lib/provider-draft-store"
    );
    const { getGeneratedMaterialDraftStore } = await import(
      "../../lib/generated-material-draft-store"
    );
    const {
      createGeneratedMaterialEventRecord,
      getGeneratedMaterialEventStore,
    } = await import("../../lib/generated-material-event-store");
    const providerStore = getProviderDraftStore();
    const materialStore = getGeneratedMaterialDraftStore();
    const eventStore = getGeneratedMaterialEventStore();

    await providerStore.saveDraft({
      id: "cockpit-owner-profile",
      source: "provider-profile-generator",
      draftPayload: JSON.stringify({
        version: 1,
        id: "cockpit-owner-profile",
        businessName: "Cockpit Owner Provider",
        serviceCategories: ["Care navigation"],
        referralServices: ["SERV-0020"],
        serviceAreas: ["Perth"],
        languages: ["English"],
        supportsNdis: true,
        supportsAgedCare: true,
        acceptingNewClients: true,
        urgentReferralAvailable: false,
        shortDescription: "Cockpit provider profile for the workspace overview.",
        targetClients: "Older people and NDIS participants",
        publicContactMethods: ["Website"],
        sourceChannel: "test",
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T00:00:00.000Z",
      }),
      status: "draft",
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    });
    await claimProviderDraft({
      draftId: "cockpit-owner-profile",
      ownerUserId: "user-free",
      store: providerStore,
      now: "2026-06-26T01:00:00.000Z",
    });
    await materialStore.saveGeneratedMaterialDraft({
      id: "cockpit-material-draft",
      userId: "user-free",
      providerDraftId: "cockpit-owner-profile",
      feature: "handover_checklist",
      status: "reviewed",
      content: {
        checklistTitle: "Cockpit handover checklist",
        supportNeed: "Private support need should not appear on cockpit.",
      },
      createdAt: "2026-06-26T02:00:00.000Z",
      updatedAt: "2026-06-26T02:30:00.000Z",
    });
    await eventStore.saveGeneratedMaterialEvent(
      createGeneratedMaterialEventRecord({
        userId: "user-free",
        providerDraftId: "cockpit-owner-profile",
        generatedMaterialDraftId: "cockpit-material-draft",
        feature: "handover_checklist",
        eventType: "copy_field",
        fieldKey: "supportNeed",
        now: "2026-06-26T03:00:00.000Z",
      }),
    );

    const markup = await renderPage(ReferralWorkspacePage, {
      account: "user-free",
      lang: "en",
    });

    expect(markup).toContain("Referral Pack workspace");
    expect(markup).toContain("Cockpit Owner Provider");
    expect(markup).toContain("Perth");
    expect(markup).toContain("Saved materials");
    expect(markup).toContain("1 saved draft");
    expect(markup).toContain("Latest pack activity");
    expect(markup).toContain("Copied field");
    expect(markup).toContain("Support need");
    expect(markup).not.toContain("Alex Lee");
    expect(markup).not.toContain("Private support need should not appear");
    expect(markup).not.toContain("/admin/access-requests");
  });

  it("localizes provider first-run cockpit actions in Simplified Chinese", async () => {
    const { default: ReferralWorkspacePage } = await import("./page");
    const markup = await renderPage(ReferralWorkspacePage, {
      account: "user-free",
      lang: "zh-Hans",
    });

    expect(markup).toContain("Referral Pack 工作台");
    expect(markup).toContain("资料包来源");
    expect(markup).toContain("转介阻碍");
    expect(markup).toContain("下一步");
    expect(markup).toContain("准备 Referral Pack");
    expect(markup).toContain("修正转介阻碍");
    expect(markup).toContain("确认工作区访问");
    expect(markup).toContain("创建资料包草稿");
    expect(markup).toContain("AI 材料队列");
    expect(markup).not.toContain("Provider cockpit");
    expect(markup).not.toContain("Next best actions");
    expect(markup).not.toContain("Review profile details");
  });

  it("renders the provider cockpit as a compact workspace in Simplified Chinese", async () => {
    const { default: ReferralWorkspacePage } = await import("./page");
    const { getGeneratedMaterialDraftStore } = await import(
      "../../lib/generated-material-draft-store"
    );
    const {
      createGeneratedMaterialEventRecord,
      getGeneratedMaterialEventStore,
    } = await import("../../lib/generated-material-event-store");
    const materialStore = getGeneratedMaterialDraftStore();
    const eventStore = getGeneratedMaterialEventStore();

    await materialStore.saveGeneratedMaterialDraft({
      id: "zh-cockpit-activity-draft",
      userId: "user-approved",
      feature: "handover_checklist",
      status: "draft",
      content: {
        checklistTitle: "Chinese cockpit checklist",
        supportNeed: "Private support need should not appear on cockpit.",
      },
      createdAt: "2026-06-27T02:00:00.000Z",
      updatedAt: "2026-06-27T02:30:00.000Z",
    });
    await eventStore.saveGeneratedMaterialEvent(
      createGeneratedMaterialEventRecord({
        userId: "user-approved",
        generatedMaterialDraftId: "zh-cockpit-activity-draft",
        feature: "handover_checklist",
        eventType: "copy_field",
        fieldKey: "supportNeed",
        now: "2026-06-27T03:00:00.000Z",
      }),
    );

    const markup = await renderPage(ReferralWorkspacePage, {
      account: "user-approved",
      lang: "zh-Hans",
    });

    expect(markup).toContain("Referral Pack 工作台");
    expect(markup).toContain("资料包来源");
    expect(markup).toContain("转介阻碍");
    expect(markup).toContain("工作区访问");
    expect(markup).toContain("最近动态");
    expect(markup).toContain("AI 材料队列");
    expect(markup).toContain("资料改写");
    expect(markup).toContain("分享卡片");
    expect(markup).toContain("转介沟通文案");
    expect(markup).toContain("双语介绍");
    expect(markup).toContain("交接清单");
    expect(markup).toContain("优先处理");
    expect(markup).toContain("需要复核");
    expect(markup).toContain("访问码可用");
    expect(markup).toContain("字段");
    expect(markup).not.toContain("一个工作台，管理转介准备度。");
    expect(markup).not.toContain("hero-title");
    expect(markup).not.toContain("SEO");
    expect(markup).not.toContain("Reddit");
    expect(markup).not.toContain("LinkedIn Agent");
    expect(markup).not.toContain("Provider cockpit");
    expect(markup).not.toContain("Active");
    expect(markup).not.toContain("Pending");
    expect(markup).not.toContain("High");
    expect(markup).not.toContain("Review");
    expect(markup).not.toContain("Describe which regions are most relevant");
    expect(markup).not.toContain("Support need");
  });

  it("localizes the health page while preserving readiness links", async () => {
    const { default: ReferralHealthPage } = await import("./health/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralHealthPage);

    expect(markup).toContain(copy.health.title);
    expect(markup).toContain(copy.health.scoreMeaningTitle);
    expect(markup).toContain(copy.components.healthSignals.heading);
    expect(markup).toContain(
      'href="/referral-workspace/materials?lang=zh-Hans&amp;account=user-free"',
    );
    expect(markup).not.toContain("Referral Profile Health Audit");
  });

  it("uses an imported public draft for readiness diagnosis", async () => {
    const { default: ReferralHealthPage } = await import("./health/page");
    const markup = await renderPage(ReferralHealthPage, {
      account: "user-free",
      draft: "sample-harbour",
      lang: "zh-Hans",
    });

    expect(markup).toContain("Harbour Community Support");
    expect(markup).toContain("clear intake details for referral partners");
    expect(markup).toContain(
      'href="/referral-workspace/materials?draft=sample-harbour&amp;lang=zh-Hans&amp;account=user-free"',
    );
  });

  it("preserves public CaresLink draftId handoff through readiness diagnosis", async () => {
    const { default: ReferralHealthPage } = await import("./health/page");
    const markup = await renderPage(ReferralHealthPage, {
      account: "user-free",
      source: "provider-profile-generator",
      draftId: "sample-harbour",
      lang: "zh-Hans",
    });

    expect(markup).toContain("Harbour Community Support");
    expect(markup).toContain("clear intake details for referral partners");
    expect(markup).toContain(
      'href="/referral-workspace/materials?source=provider-profile-generator&amp;draftId=sample-harbour&amp;lang=zh-Hans&amp;account=user-free"',
    );
  });

  it("localizes free and access-code materials modes while preserving account context", async () => {
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const freeMarkup = await renderPage(ReferralMaterialsPage);
    const accessMarkup = await renderPage(ReferralMaterialsPage, {
      account: "user-approved",
      lang: "zh-Hans",
    });

    expect(freeMarkup).toContain(copy.materials.title);
    expect(freeMarkup).toContain(copy.materials.freeMode);
    expect(freeMarkup).toContain(
      "请先申请工作区访问权限，才能生成引导式材料。",
    );
    expect(freeMarkup).toContain(
      'href="/referral-workspace/materials?lang=zh-Hans&amp;account=user-approved"',
    );
    expect(accessMarkup).toContain(copy.materials.accessMode);
    expect(accessMarkup).toContain("创建资料包草稿");
    expect(accessMarkup).toContain(
      "将已保存的服务商资料整理成可放入 Referral Pack 的转介沟通草稿。",
    );
    expect(accessMarkup).toContain(
      'href="/referral-workspace/materials?account=user-approved&amp;lang=en"',
    );
    expect(freeMarkup).not.toContain(
      'data-testid="guided-share-card-generator"',
    );
    expect(freeMarkup).not.toContain(
      'data-testid="guided-profile-rewrite-generator"',
    );
    expect(freeMarkup).not.toContain(
      'data-testid="guided-referral-message-generator"',
    );
    expect(freeMarkup).not.toContain(
      'data-testid="guided-bilingual-intro-generator"',
    );
    expect(freeMarkup).not.toContain(
      'data-testid="guided-handover-checklist-generator"',
    );
    expect(accessMarkup).toContain(
      'data-testid="guided-share-card-generator"',
    );
    expect(accessMarkup).toContain(
      'data-testid="guided-profile-rewrite-generator"',
    );
    expect(accessMarkup).toContain(
      'data-testid="guided-referral-message-generator"',
    );
    expect(accessMarkup).toContain(
      'data-testid="guided-bilingual-intro-generator"',
    );
    expect(accessMarkup).toContain(
      'data-testid="guided-handover-checklist-generator"',
    );
    expect(accessMarkup).toContain(
      copy.materials.shareCardGenerator.disabledReasons.verified_session_required,
    );
    expect(accessMarkup).toContain(
      copy.materials.profileRewriteGenerator.disabledReasons
        .verified_session_required,
    );
    expect(accessMarkup).toContain(
      copy.materials.referralMessageGenerator.disabledReasons
        .verified_session_required,
    );
    expect(accessMarkup).toContain(
      copy.materials.bilingualIntroGenerator.disabledReasons
        .verified_session_required,
    );
    expect(accessMarkup).toContain(
      copy.materials.handoverChecklistGenerator.disabledReasons
        .verified_session_required,
    );
    expect(accessMarkup).not.toContain("Verified approved login required");
    expect(accessMarkup).not.toContain("verified approved provider account");
    expect(accessMarkup).not.toContain("approved provider account");
  });

  it("renders the approved demo materials page as a compact workspace preview", async () => {
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const markup = await renderPage(ReferralMaterialsPage, {
      account: "user-approved",
      lang: "zh-Hans",
    });
    const visibleText = getVisibleText(markup);

    expect(markup).toContain("workspace-grid");
    expect(markup).toContain("workspace-main-panel");
    expect(markup).toContain("workspace-right-rail");
    expect(visibleText).toContain("创建资料包草稿");
    expect(visibleText).toContain("已保存资料包草稿");
    expect(visibleText).toContain("访问状态");
    expect(visibleText).toContain("每日引导额度");
    expect(visibleText).not.toContain("SEO Agent");
  });

  it("renders the referral pack as the post-profile sendable material surface", async () => {
    const { default: ReferralPackPage } = await import("./referral-pack/page");
    const { getGeneratedMaterialDraftStore } = await import(
      "../../lib/generated-material-draft-store"
    );
    const store = getGeneratedMaterialDraftStore();

    await store.saveGeneratedMaterialDraft({
      id: "pack-referral-message",
      userId: "user-approved",
      feature: "referral_message",
      status: "reviewed",
      content: {
        subjectLine: "Referral intro for community partners",
        providerSummary: "Provider-reviewed introduction for outreach.",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      createdAt: "2026-06-29T04:00:00.000Z",
      updatedAt: "2026-06-29T04:00:00.000Z",
    });

    const markup = await renderPage(ReferralPackPage, {
      account: "user-approved",
      lang: "en",
    });
    const visibleText = getVisibleText(markup);

    expect(markup).toContain("Referral Pack");
    expect(markup).toContain("Ready-to-send materials");
    expect(markup).toContain("Choose who you are sending to");
    expect(markup).toContain("For support coordinators");
    expect(markup).toContain("For case managers");
    expect(markup).toContain("For community groups");
    expect(markup).toContain("Copy target wording");
    expect(markup).toContain("Record this send");
    expect(markup).toContain(
      "After copying, add the recipient so follow-up is easier.",
    );
    expect(markup).toContain("Basic profile intro");
    expect(markup).toContain("Referral intro for community partners");
    expect(markup).toContain("Mark as sent");
    expect(markup).toContain('name="recipientName"');
    expect(markup).toContain('href="/referral-workspace/outreach?lang=en&amp;account=user-approved"');
    expect(visibleText.toLowerCase()).not.toContain("marketplace");
    expect(visibleText.toLowerCase()).not.toContain("verified provider");
  });

  it("renders the outreach tracker with saved follow-up records", async () => {
    const { default: OutreachPage } = await import("./outreach/page");
    const { getOutreachStore, createOutreachRecord } = await import(
      "../../lib/outreach-store"
    );
    const store = getOutreachStore();

    await store.saveOutreach(
      createOutreachRecord({
        userId: "user-approved",
        recipientName: "Mia Chen",
        organisation: "Community Link",
        roleType: "support_coordinator",
        channel: "wechat",
        status: "follow_up",
        lastContactedAt: "2026-06-29",
        nextFollowUpAt: "2026-07-02",
        notes: "Follow up after sending the pack.",
        now: "2026-06-29T05:00:00.000Z",
      }),
    );

    const markup = await renderPage(OutreachPage, {
      account: "user-approved",
      lang: "en",
    });
    const visibleText = getVisibleText(markup);

    expect(markup).toContain("Follow-up assistant");
    expect(markup).toContain("Add or record a send");
    expect(markup).toContain("Today&#x27;s follow-up focus");
    expect(markup).toContain("Needs follow-up");
    expect(markup).toContain("No reply yet");
    expect(markup).toContain("Replied");
    expect(markup).toContain("Recent sends");
    expect(markup).toContain("Mia Chen");
    expect(markup).toContain("Community Link");
    expect(markup).toContain("Follow up");
    expect(markup).toContain("Update record");
    expect(markup).toContain('name="mode" value="update"');
    expect(markup).toContain('name="outreachRecordId"');
    expect(markup).toContain('href="/referral-workspace/referral-pack?lang=en&amp;account=user-approved"');
    expect(visibleText.toLowerCase()).not.toContain("lead resale");
    expect(visibleText.toLowerCase()).not.toContain("referral matching");
  });

  it("routes the materials primary action to access until generators are available", async () => {
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const freeMarkup = await renderPage(ReferralMaterialsPage, {
      account: "user-free",
      lang: "zh-Hans",
    });
    const approvedMarkup = await renderPage(ReferralMaterialsPage, {
      account: "user-approved",
      lang: "zh-Hans",
    });

    expect(freeMarkup).not.toContain('href="#materials-generators"');
    expect(freeMarkup).toContain(
      'href="/referral-workspace/access?lang=zh-Hans&amp;account=user-free"',
    );
    expect(approvedMarkup).toContain('href="#materials-generators"');
  });

  it("does not expose internal account or legacy hero copy on English materials pages", async () => {
    const { default: ReferralMaterialsPage } = await import("./materials/page");

    for (const account of ["user-free", "user-approved"]) {
      const markup = await renderPage(ReferralMaterialsPage, {
        account,
        lang: "en",
      });
      const visibleText = getVisibleText(markup);

      expect(markup).not.toContain("hero-title");
      expectNoInternalProviderFacingCopy(visibleText);
      expect(visibleText).not.toContain("一个工作台，管理转介准备度。");
      expect(visibleText.toLowerCase()).not.toContain("demo account");
      expect(visibleText).not.toContain("Demo access");
      expect(visibleText).not.toContain("user-free");
      expect(visibleText).not.toContain("user-approved");
    }
  });

  it("shows the latest saved share-card draft for the signed-in account", async () => {
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const { getGeneratedMaterialDraftStore } = await import(
      "../../lib/generated-material-draft-store"
    );
    const store = getGeneratedMaterialDraftStore();

    await store.saveGeneratedMaterialDraft({
      id: "latest-user-approved-share-card",
      userId: "user-approved",
      feature: "share_card",
      status: "draft",
      content: {
        headline: "Referral-ready care navigation",
        subheadline: "General business profile for referral conversations",
        serviceArea: "Inner West Sydney",
        languages: "English; Mandarin",
        referralFit: "Older people and NDIS participants needing navigation",
        intakePath: "Phone warm handover",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      createdAt: "2026-06-26T04:00:00.000Z",
      updatedAt: "2026-06-26T04:00:00.000Z",
    });

    const markup = await renderPage(ReferralMaterialsPage, {
      account: "user-approved",
      lang: "en",
    });

    expect(markup).toContain("Latest saved share-card draft");
    expect(markup).toContain("Referral-ready care navigation");
    expect(markup).toContain("Not a provider endorsement.");
  });

  it("shows generated draft history across profile rewrite and referral material drafts", async () => {
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const { getGeneratedMaterialDraftStore } = await import(
      "../../lib/generated-material-draft-store"
    );
    const store = getGeneratedMaterialDraftStore();

    await store.saveGeneratedMaterialDraft({
      id: "history-profile-rewrite",
      userId: "user-approved",
      feature: "profile_rewrite",
      status: "draft",
      content: {
        professionalEnglishDescription:
          "History professional English description",
        shortEnglishSummary: "History short English summary",
        chineseCommunityIntro: "History Chinese community intro",
        referralPartnerSummary: "History referral partner summary",
        profileImprovementNotes: "History improvement notes",
        disclaimer:
          "Draft wording based on self-submitted information. Not a provider endorsement.",
      },
      createdAt: "2026-06-26T09:00:00.000Z",
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await store.saveGeneratedMaterialDraft({
      id: "history-share-card",
      userId: "user-approved",
      feature: "share_card",
      status: "archived",
      content: {
        headline: "History share card headline",
        subheadline: "General business profile for referral conversations",
        serviceArea: "Inner West Sydney",
        languages: "English; Mandarin",
        referralFit: "Older people needing navigation",
        intakePath: "Phone warm handover",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      createdAt: "2026-06-26T05:00:00.000Z",
      updatedAt: "2026-06-26T05:00:00.000Z",
    });
    await store.saveGeneratedMaterialDraft({
      id: "history-referral-message",
      userId: "user-approved",
      feature: "referral_message",
      status: "reviewed",
      content: {
        subjectLine: "History referral message subject",
        opening: "Hi, please review this provider profile.",
        providerSummary: "Provider-submitted referral message summary.",
        referralFit: "Older people needing navigation.",
        handoverRequest: "Include consent confirmation.",
        nextStep: "Review before sending.",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      createdAt: "2026-06-26T06:00:00.000Z",
      updatedAt: "2026-06-26T06:00:00.000Z",
    });
    await store.saveGeneratedMaterialDraft({
      id: "history-bilingual-intro",
      userId: "user-approved",
      feature: "bilingual_intro",
      status: "draft",
      content: {
        englishIntro: "History bilingual English intro",
        communityLanguageIntro: "History bilingual community language intro",
        language: "Mandarin",
        sharingContext: "Use after provider review.",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      createdAt: "2026-06-26T07:00:00.000Z",
      updatedAt: "2026-06-26T07:00:00.000Z",
    });
    await store.saveGeneratedMaterialDraft({
      id: "history-handover-checklist",
      userId: "user-approved",
      feature: "handover_checklist",
      status: "draft",
      content: {
        checklistTitle: "History handover checklist title",
        consentCheck: "Confirm consent before sharing personal details.",
        clientContext: "Include client goals and preferred language.",
        supportNeed: "Summarise the requested support in plain language.",
        handoverDetails: "Attach required intake details before introduction.",
        nextStep: "Review before contacting the provider intake path.",
        disclaimer:
          "Based on self-submitted information. Not clinical advice or a provider endorsement.",
      },
      createdAt: "2026-06-26T08:00:00.000Z",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });

    const markup = await renderPage(ReferralMaterialsPage, {
      account: "user-approved",
      lang: "en",
    });

    expect(markup).toContain("Generated draft history");
    expect(markup).toContain("Profile rewrite");
    expect(markup).toContain("Handover checklist");
    expect(markup).toContain("Bilingual intro");
    expect(markup).toContain("Referral message");
    expect(markup).toContain("Share card");
    expect(markup).toContain("History professional English description");
    expect(markup).toContain("History handover checklist title");
    expect(markup).toContain("History bilingual English intro");
    expect(markup).toContain("History referral message subject");
    expect(markup).toContain("History share card headline");
    expect(markup).toContain("Copy all");
    expect(markup).toContain("Copy");
    expect(markup).toContain("Support need");
    expect(markup).toContain(
      "Summarise the requested support in plain language.",
    );
    expect(markup).toContain("Chinese community intro");
    expect(markup).toContain("History Chinese community intro");
    expect(markup).toContain("Community-language intro");
    expect(markup).toContain("History bilingual community language intro");
    expect(markup).toContain("Handover request");
    expect(markup).toContain("Include consent confirmation.");
    expect(markup).toContain("Reviewed");
    expect(markup).toContain("Archived");
    expect(markup).not.toContain("Mark reviewed");
    expect(markup).not.toContain('name="materialDraftId"');
  });

  it("keeps imported public draft context through materials mode actions", async () => {
    const { default: ReferralMaterialsPage } = await import("./materials/page");
    const markup = await renderPage(ReferralMaterialsPage, {
      account: "user-free",
      draft: "sample-harbour",
      lang: "zh-Hans",
    });
    const approvedMaterialsHref =
      'href="/referral-workspace/materials?draft=sample-harbour&amp;lang=zh-Hans&amp;account=user-approved"';
    const accessHref =
      'href="/referral-workspace/access?draft=sample-harbour&amp;lang=zh-Hans&amp;account=user-free"';

    expect(markup).toContain("Harbour Community Support");
    expect(markup).toContain("clear intake details for referral partners");
    expect(countOccurrences(markup, approvedMaterialsHref)).toBeGreaterThanOrEqual(
      2,
    );
    expect(countOccurrences(markup, accessHref)).toBeGreaterThanOrEqual(2);
  });

  it("localizes the access page and keeps materials/admin links in the selected locale", async () => {
    const { default: ReferralAccessPage } = await import("./access/page");
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(ReferralAccessPage);

    expect(markup).toContain(copy.access.title);
    expect(markup).toContain(copy.access.costControlTitle);
    expect(markup).toContain(
      'href="/referral-workspace/materials?lang=zh-Hans&amp;account=user-approved"',
    );
    expect(markup).toContain(
      'href="/admin/access-requests?lang=zh-Hans&amp;account=user-free"',
    );
    expect(markup).not.toContain("Access code application preview");
  });

  it("preserves public CaresLink draftId handoff on the access request page", async () => {
    const { default: ReferralAccessPage } = await import("./access/page");
    const markup = await renderPage(ReferralAccessPage, {
      account: "user-free",
      source: "provider-profile-generator",
      draftId: "sample-harbour",
      lang: "zh-Hans",
    });

    expect(markup).toContain("Harbour Community Support");
    expect(markup).toContain(
      'href="/referral-workspace/materials?source=provider-profile-generator&amp;draftId=sample-harbour&amp;lang=zh-Hans&amp;account=user-approved"',
    );
    expect(markup).toContain(
      'href="/admin/access-requests?source=provider-profile-generator&amp;draftId=sample-harbour&amp;lang=zh-Hans&amp;account=user-free"',
    );
  });

  it("localizes the admin access queue and preserves workspace cross-links", async () => {
    const { default: AdminAccessRequestsPage } = await import(
      "../admin/access-requests/page"
    );
    const copy = getReferralWorkspaceCopy("zh-Hans");
    const markup = await renderPage(AdminAccessRequestsPage, {
      account: "user-admin",
      lang: "zh-Hans",
    });

    expect(markup).toContain(copy.admin.title);
    expect(markup).toContain(copy.admin.boundary);
    expect(markup).toContain(
      'href="/referral-workspace/access?lang=zh-Hans&amp;account=user-admin"',
    );
    expect(markup).toContain(
      'href="/referral-workspace?lang=zh-Hans&amp;account=user-admin"',
    );
    expect(markup).not.toContain("Access request queue");
  });
});
