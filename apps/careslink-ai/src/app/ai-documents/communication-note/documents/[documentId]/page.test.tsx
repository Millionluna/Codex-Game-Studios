import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  createServerClient: vi.fn(),
  resolveAccount: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../../../../lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient: mocks.createServerClient,
}));
vi.mock("../../../../../lib/referral-workspace-session", () => ({
  resolveWorkspaceAccountFromSupabaseSession: mocks.resolveAccount,
}));

import CommunicationNoteDocumentPage, {
  dynamic,
  generateMetadata,
  revalidate,
  runtime,
} from "./page";

const DOC = "10000000-0000-4000-8000-000000000001";
const REV = "20000000-0000-4000-8000-000000000001";
const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Synthetic provider",
  email: "provider@example.com",
};
const serverClient = { auth: {} };

describe("Communication Note saved-document page boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockResolvedValue(serverClient);
    mocks.resolveAccount.mockResolvedValue(provider);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the real provider session gate and initially renders no document body", async () => {
    vi.stubEnv("CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_ENABLED", "false");
    vi.stubEnv("CARESLINK_V1_POINTS_UI_ENABLED", "false");
    const element = await CommunicationNoteDocumentPage({
      params: Promise.resolve({ documentId: DOC }),
      searchParams: Promise.resolve({ lang: "zh-Hant", revisionId: REV }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(markup).toContain("正在檢查草稿存取權限");
    expect(markup).toContain("/careslink-ai-logo-reverse.svg");
    expect(markup).not.toContain("The worker contacted");
    expect(mocks.resolveAccount).toHaveBeenCalledExactlyOnceWith(serverClient);
  });

  it("redirects a signed-out user with only UUIDs and the exact result locale", async () => {
    mocks.resolveAccount.mockResolvedValueOnce(undefined);

    await expect(
      CommunicationNoteDocumentPage({
        params: Promise.resolve({ documentId: DOC }),
        searchParams: Promise.resolve({
          lang: "zh-Hant",
          revisionId: REV,
          observable_facts: "must-not-survive",
          phone: "0412 345 678",
        }),
      }),
    ).rejects.toThrow("redirect:/auth/login?");

    const redirectHref = mocks.redirect.mock.calls[0][0] as string;
    const authUrl = new URL(redirectHref, "https://ai.careslink.com.au");
    expect(authUrl.searchParams.get("lang")).toBe("en");
    expect(authUrl.searchParams.get("next")).toBe(
      `/ai-documents/communication-note/documents/${DOC}?lang=zh-Hant&revisionId=${REV}`,
    );
    expect(redirectHref).not.toMatch(/must-not-survive|0412|observable_facts|phone/);
  });

  it("drops malformed identifiers from the signed-out return path", async () => {
    mocks.resolveAccount.mockResolvedValueOnce(undefined);

    await expect(
      CommunicationNoteDocumentPage({
        params: Promise.resolve({ documentId: "private-name" }),
        searchParams: Promise.resolve({
          lang: "en",
          revisionId: "private-revision",
        }),
      }),
    ).rejects.toThrow("redirect:/auth/login?");

    const redirectHref = mocks.redirect.mock.calls[0][0] as string;
    const authUrl = new URL(redirectHref, "https://ai.careslink.com.au");
    expect(authUrl.searchParams.get("next")).toBe(
      "/ai-documents/communication-note?lang=en",
    );
    expect(redirectHref).not.toMatch(/private-name|private-revision/);
  });

  it.each(["admin", "referral_source"] as const)(
    "redirects a %s before mounting the private loader",
    async (role) => {
      mocks.resolveAccount.mockResolvedValueOnce({ ...provider, role });
      await expect(
        CommunicationNoteDocumentPage({
          params: Promise.resolve({ documentId: DOC }),
          searchParams: Promise.resolve({ lang: "zh-Hant" }),
        }),
      ).rejects.toThrow("redirect:/ai-documents?lang=en");
    },
  );

  it("rejects an ambiguous revision only after the provider gate", async () => {
    const element = await CommunicationNoteDocumentPage({
      params: Promise.resolve({ documentId: DOC }),
      searchParams: Promise.resolve({ lang: "en", revisionId: [REV, DOC] }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(markup).toContain("Communication Note not found");
    expect(markup).not.toContain(REV);
    expect(mocks.resolveAccount).toHaveBeenCalledExactlyOnceWith(serverClient);
  });

  it("does not mount the private loader for one malformed revision", async () => {
    const element = await CommunicationNoteDocumentPage({
      params: Promise.resolve({ documentId: DOC }),
      searchParams: Promise.resolve({
        lang: "en",
        revisionId: "participant-private-name",
      }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(markup).toContain("Communication Note not found");
    expect(markup).not.toContain("Checking saved draft access");
    expect(markup).not.toContain("participant-private-name");
    expect(mocks.resolveAccount).toHaveBeenCalledExactlyOnceWith(serverClient);
  });

  it("does not reflect a malformed document identifier into rendered links", async () => {
    const element = await CommunicationNoteDocumentPage({
      params: Promise.resolve({ documentId: "participant-private-name" }),
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(markup).toContain("Communication Note not found");
    expect(markup).not.toContain("Checking saved draft access");
    expect(markup).not.toContain("participant-private-name");
  });

  it("canonicalizes extra query data without forwarding it to the private loader", async () => {
    await expect(
      CommunicationNoteDocumentPage({
        params: Promise.resolve({ documentId: DOC }),
        searchParams: Promise.resolve({
          lang: "en",
          revisionId: REV,
          participant: "private-name",
          observable_facts: "must-not-survive",
        }),
      }),
    ).rejects.toThrow("redirect:");

    const redirectHref = mocks.redirect.mock.calls[0][0] as string;
    expect(redirectHref).toBe(
      `/ai-documents/communication-note/documents/${DOC}?lang=en&revisionId=${REV}`,
    );
    expect(redirectHref).not.toMatch(/private-name|must-not-survive|participant|observable_facts/);
  });

  it("canonicalizes an unsupported locale instead of retaining it in the URL", async () => {
    await expect(
      CommunicationNoteDocumentPage({
        params: Promise.resolve({ documentId: DOC }),
        searchParams: Promise.resolve({ lang: "private-language-value" }),
      }),
    ).rejects.toThrow("redirect:");

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/ai-documents/communication-note/documents/${DOC}?lang=en`,
    );
  });

  it.each([
    ["en", "Communication Note draft"],
    ["zh-Hans", "沟通记录草稿"],
    ["zh-Hant", "溝通記錄草稿"],
  ] as const)("uses explicit %s metadata", async (locale, title) => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ lang: locale }),
    });
    expect(metadata.title).toBe(title);
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });

  it("keeps the private page dynamic and on the Node runtime", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
    expect(revalidate).toBe(0);
  });
});
