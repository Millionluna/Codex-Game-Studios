import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  createServerClient: vi.fn(),
  resolveAccount: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("../../../lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient: mocks.createServerClient,
}));
vi.mock("../../../lib/referral-workspace-session", () => ({
  resolveWorkspaceAccountFromSupabaseSession: mocks.resolveAccount,
}));

import CommunicationNotePage, { dynamic, generateMetadata } from "./page";

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Synthetic provider",
  email: "provider@example.com",
};

describe("Communication Note page boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED", "true");
    mocks.createServerClient.mockResolvedValue({ auth: {} });
    mocks.resolveAccount.mockResolvedValue(provider);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays fail-closed unless the composer is explicitly enabled", async () => {
    vi.stubEnv("CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED", "false");

    await expect(
      CommunicationNotePage({
        searchParams: Promise.resolve({ lang: "en" }),
      }),
    ).rejects.toThrow("not-found");

    expect(mocks.notFound).toHaveBeenCalledTimes(1);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("redirects a signed-out request with only the fixed path and exact locale", async () => {
    mocks.resolveAccount.mockResolvedValueOnce(undefined);

    await expect(
      CommunicationNotePage({
        searchParams: Promise.resolve({
          lang: "zh-Hant",
          participantName: "must-not-survive",
          phone: "0412 345 678",
          observable_facts: "private-content",
        }),
      }),
    ).rejects.toThrow("redirect:/auth/login?");

    const redirectHref = mocks.redirect.mock.calls[0]?.[0] as string;
    const authUrl = new URL(redirectHref, "https://ai.careslink.com.au");
    const next = authUrl.searchParams.get("next") ?? "";

    expect(authUrl.searchParams.get("lang")).toBe("en");
    expect(next).toBe(
      "/ai-documents/communication-note?lang=zh-Hant",
    );
    expect(redirectHref).not.toMatch(
      /must-not-survive|0412|private-content|participantName|observable_facts/,
    );
  });

  it("renders the exact Traditional Chinese composer for a provider", async () => {
    const element = await CommunicationNotePage({
      searchParams: Promise.resolve({ lang: "zh-Hant" }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(markup).toContain("溝通記錄");
    expect(markup).toContain("本機隱私檢查");
    expect(markup).toContain("產生功能尚未連接");
    expect(markup).toContain('name="occurred_at"');
    expect(markup).toContain('name="parties_by_role"');
    expect(markup).not.toContain("沟通记录");
    expect(markup).not.toContain("participant@example.com");
  });

  it.each(["admin", "referral_source"] as const)(
    "redirects a %s away from provider-only content",
    async (role) => {
      mocks.resolveAccount.mockResolvedValueOnce({ ...provider, role });

      await expect(
        CommunicationNotePage({
          searchParams: Promise.resolve({ lang: "zh-Hant" }),
        }),
      ).rejects.toThrow("redirect:/ai-documents?lang=en");
    },
  );

  it("makes an unsupported locale fallback explicit instead of using Simplified Chinese", async () => {
    const element = await CommunicationNotePage({
      searchParams: Promise.resolve({ lang: "zh-TW" }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(markup).toContain("The requested language is not supported");
    expect(markup).toContain("Communication Note");
    expect(markup).not.toContain("沟通记录");
  });

  it.each([
    ["en", "Communication Note"],
    ["zh-Hans", "沟通记录"],
    ["zh-Hant", "溝通記錄"],
  ] as const)(
    "uses explicit %s metadata while keeping the page out of indexes",
    async (locale, title) => {
      const metadata = await generateMetadata({
        searchParams: Promise.resolve({ lang: locale }),
      });

      expect(metadata.title).toBe(title);
      expect(metadata.description).toBeTruthy();
      expect(metadata.robots).toMatchObject({ index: false, follow: false });
      expect(metadata.referrer).toBe("no-referrer");
    },
  );

  it("stays dynamically rendered so the default-off flag is evaluated at request time", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
