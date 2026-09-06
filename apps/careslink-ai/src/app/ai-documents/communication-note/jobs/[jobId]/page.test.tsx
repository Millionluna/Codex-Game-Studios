import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({
      priority,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
      void priority;
      return React.createElement("img", props);
    },
  };
});

import CommunicationNoteGenerationJobPage, {
  dynamic,
  generateMetadata,
  revalidate,
  runtime,
} from "./page";

const JOB_ID = "22222222-2222-4222-8222-222222222222";
const UPPERCASE_JOB_ID = JOB_ID.toUpperCase();
const serverClient = { auth: {} };
const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Synthetic provider",
  email: "provider@example.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerClient.mockResolvedValue(serverClient);
  mocks.resolveAccount.mockResolvedValue(provider);
});

describe("Communication Note generation job page", () => {
  it("authenticates before validating an untrusted job identifier", async () => {
    const element = await CommunicationNoteGenerationJobPage({
      params: Promise.resolve({ jobId: "private-observable-facts" }),
      searchParams: Promise.resolve({ lang: "en" }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(mocks.resolveAccount).toHaveBeenCalledWith(serverClient);
    expect(markup).toContain("Generation job not found");
    expect(markup).not.toContain("private-observable-facts");
    expect(markup).not.toContain("/jobs/");
  });

  it("redirects signed-out users with only a canonical safe job path", async () => {
    mocks.resolveAccount.mockResolvedValueOnce(undefined);

    await expect(
      CommunicationNoteGenerationJobPage({
        params: Promise.resolve({ jobId: UPPERCASE_JOB_ID }),
        searchParams: Promise.resolve({
          lang: "zh-Hant",
          observable_facts: "private facts",
          idempotencyKey: "must-not-survive",
        }),
      }),
    ).rejects.toThrow("redirect:/auth/login?");

    const redirectHref = mocks.redirect.mock.calls[0][0] as string;
    const login = new URL(redirectHref, "https://ai.careslink.com.au");
    expect(login.searchParams.get("lang")).toBe("en");
    expect(login.searchParams.get("next")).toBe(
      `/ai-documents/communication-note/jobs/${JOB_ID}?lang=zh-Hant`,
    );
    expect(redirectHref).not.toMatch(
      /private facts|must-not-survive|observable_facts|idempotency/i,
    );
  });

  it("drops an invalid job identifier from the signed-out return path", async () => {
    mocks.resolveAccount.mockResolvedValueOnce(undefined);

    await expect(
      CommunicationNoteGenerationJobPage({
        params: Promise.resolve({ jobId: "not-a-job" }),
        searchParams: Promise.resolve({ lang: "zh-Hans" }),
      }),
    ).rejects.toThrow("redirect:/auth/login?");

    const login = new URL(
      mocks.redirect.mock.calls[0][0] as string,
      "https://ai.careslink.com.au",
    );
    expect(login.searchParams.get("next")).toBe(
      "/ai-documents/communication-note?lang=zh-Hans",
    );
    expect(login.searchParams.get("next")).not.toContain("not-a-job");
  });

  it.each(["admin", "referral_source"] as const)(
    "redirects a %s before mounting the owner job loader",
    async (role) => {
      mocks.resolveAccount.mockResolvedValueOnce({ ...provider, role });

      await expect(
        CommunicationNoteGenerationJobPage({
          params: Promise.resolve({ jobId: JOB_ID }),
          searchParams: Promise.resolve({ lang: "zh-Hant" }),
        }),
      ).rejects.toThrow("redirect:/ai-documents?lang=en");
    },
  );

  it("canonicalizes case and strips every query key except one explicit locale", async () => {
    await expect(
      CommunicationNoteGenerationJobPage({
        params: Promise.resolve({ jobId: UPPERCASE_JOB_ID }),
        searchParams: Promise.resolve({
          lang: ["zh-Hans", "en"],
          contentHash: "a".repeat(64),
          requestKey: "secret",
        }),
      }),
    ).rejects.toThrow(
      `redirect:/ai-documents/communication-note/jobs/${JOB_ID}?lang=zh-Hans`,
    );

    const href = mocks.redirect.mock.calls[0][0] as string;
    expect(href).not.toMatch(/contentHash|requestKey|secret|lang=.*lang=/i);
  });

  it("renders the explicit Traditional Chinese loading state for a provider", async () => {
    const element = await CommunicationNoteGenerationJobPage({
      params: Promise.resolve({ jobId: JOB_ID }),
      searchParams: Promise.resolve({ lang: "zh-Hant" }),
    });
    const markup = renderToStaticMarkup(createElement(() => element));

    expect(markup).toContain("正在檢查產生狀態");
    expect(markup).toContain("CaresLink AI");
    expect(markup).not.toContain("Points");
    expect(markup).not.toContain("observable_facts");
    expect(markup).not.toContain("idempotency");
  });

  it.each([
    ["en", "Communication Note generation"],
    ["zh-Hans", "Communication Note 生成任务"],
    ["zh-Hant", "Communication Note 產生任務"],
  ] as const)("uses explicit %s noindex metadata", async (locale, title) => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ lang: locale }),
    });

    expect(metadata.title).toBe(title);
    expect(metadata.description).toBeTruthy();
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });

  it("is an uncached Node route independent of generation and Points gates", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
    expect(revalidate).toBe(0);
  });
});
