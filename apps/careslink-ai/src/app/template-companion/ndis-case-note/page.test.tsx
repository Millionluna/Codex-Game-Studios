import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  createServerClient: vi.fn(),
  resolveAccount: vi.fn(),
  getCompanionStore: vi.fn(),
  getMaterialStore: vi.fn(),
  getCreditStore: vi.fn(),
  getCreditUsage: vi.fn(),
  getClaim: vi.fn(),
  listDrafts: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient: mocks.createServerClient,
}));
vi.mock("@/lib/referral-workspace-session", () => ({
  resolveWorkspaceAccountFromSupabaseSession: mocks.resolveAccount,
}));
vi.mock("@/lib/ndis-case-note-companion-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/ndis-case-note-companion-store")
  >("../../../lib/ndis-case-note-companion-store");

  return {
    ...actual,
    getNdisCaseNoteCompanionStore: mocks.getCompanionStore,
  };
});
vi.mock("@/lib/generated-material-draft-store", () => ({
  getGeneratedMaterialDraftStore: mocks.getMaterialStore,
}));
vi.mock("@/lib/account-credit-store", () => ({
  getAccountCreditStore: mocks.getCreditStore,
}));
vi.mock("@/lib/ndis-case-note-companion-request", async () => {
  return vi.importActual("../../../lib/ndis-case-note-companion-request");
});
vi.mock("@/lib/ndis-case-note-companion", async () => {
  return vi.importActual("../../../lib/ndis-case-note-companion");
});
vi.mock("@/lib/seo-policy", async () => {
  return vi.importActual("../../../lib/seo-policy");
});

import NdisCaseNoteCompanionPage from "./page";

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Synthetic provider",
  email: "provider@example.com",
};

describe("NDIS case note companion page auth gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockResolvedValue({ auth: {} });
    mocks.resolveAccount.mockResolvedValue(provider);
    mocks.getCompanionStore.mockReturnValue({ getClaim: mocks.getClaim });
    mocks.getMaterialStore.mockReturnValue({
      listGeneratedMaterialDraftsByUser: mocks.listDrafts,
    });
    mocks.getCreditStore.mockReturnValue({ getUsage: mocks.getCreditUsage });
    mocks.getClaim.mockResolvedValue(undefined);
    mocks.listDrafts.mockResolvedValue([]);
    mocks.getCreditUsage.mockResolvedValue({
      planCode: "free",
      status: "active",
      periodStart: "2026-08-01",
      periodEnd: "2026-09-01",
      creditLimit: 3,
      remainingCredits: 3,
      usedCredits: 0,
      reservedCredits: 0,
      recentUsage: [],
    });
  });

  it("redirects an unauthenticated request to login with a safe internal return", async () => {
    mocks.resolveAccount.mockResolvedValueOnce(undefined);

    await expect(
      NdisCaseNoteCompanionPage({
        searchParams: Promise.resolve({
          source: "private-person",
          resourceSlug: "private-record",
          utm_source: "careslink",
          utm_medium: "post_download",
          utm_campaign: "ndis_case_note_ai_companion_v01",
          lang: "zh-Hans",
          participantName: "must-not-survive",
        }),
      }),
    ).rejects.toThrow("redirect:/auth/login?");

    const redirectHref = mocks.redirect.mock.calls[0]?.[0] as string;
    const authUrl = new URL(redirectHref, "https://ai.careslink.com.au");
    const next = authUrl.searchParams.get("next") ?? "";

    expect(next).toContain("/template-companion/ndis-case-note?");
    expect(next).toContain("source=ndis-case-note-download");
    expect(next).toContain("resourceSlug=ndis-case-note-template");
    expect(next).toContain("utm_source=careslink");
    expect(next).toContain("lang=zh-Hans");
    expect(redirectHref).not.toContain("must-not-survive");
    expect(mocks.getCompanionStore).not.toHaveBeenCalled();
    expect(mocks.getMaterialStore).not.toHaveBeenCalled();
  });

  it("renders the full form for a signed-in provider", async () => {
    const element = await NdisCaseNoteCompanionPage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(markup).toContain("NDIS Case Note AI Companion");
    expect(markup).toContain("Structured facts");
    expect(markup).toContain("Privacy Review");
    expect(markup).toContain("Review privacy first");
    expect(markup).toContain("3 of 3 credits remaining this period");
    expect(markup).not.toContain("1 free draft");
    expect(mocks.listDrafts).toHaveBeenCalledWith({
      userId: provider.id,
      feature: "ndis_case_note",
      limit: 6,
    });
    expect(mocks.getCreditUsage).toHaveBeenCalledWith({
      userId: provider.id,
      recentLimit: 1,
    });
  });

  it("redirects an admin away from provider case-note content", async () => {
    mocks.resolveAccount.mockResolvedValueOnce({
      ...provider,
      role: "admin",
    });

    await expect(
      NdisCaseNoteCompanionPage({
        searchParams: Promise.resolve({ lang: "zh-Hans" }),
      }),
    ).rejects.toThrow("redirect:/referral-workspace?lang=zh-Hans");
    expect(mocks.getCompanionStore).not.toHaveBeenCalled();
    expect(mocks.getMaterialStore).not.toHaveBeenCalled();
  });
});
