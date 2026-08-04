import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getGeneratedMaterialDraftStore } from "../../lib/generated-material-draft-store";
import { NDIS_CASE_NOTE_DISCLAIMER } from "../../lib/ndis-case-note-companion";
import AiDocumentsPage from "./page";

vi.mock("@/components/app-shell", async () =>
  import("../../components/app-shell"),
);
vi.mock("@/components/generated-draft-delete-button", async () =>
  import("../../components/generated-draft-delete-button"),
);
vi.mock("@/components/referral-workspace-auth-gate", async () => {
  const React = await import("react");
  return {
    ReferralWorkspaceLoginGate: () =>
      React.createElement("div", null, "Sign in required"),
  };
});
vi.mock("@/lib/generated-material-draft-store", async () =>
  import("../../lib/generated-material-draft-store"),
);
vi.mock("@/lib/ndis-case-note-companion", async () =>
  import("../../lib/ndis-case-note-companion"),
);
vi.mock("@/lib/referral-workspace-auth", async () =>
  import("../../lib/referral-workspace-auth"),
);
vi.mock("@/lib/referral-workspace-session", async () => {
  const { getWorkspaceAccessGate } = await import(
    "../../lib/referral-workspace-auth"
  );
  return {
    getWorkspaceAccessGateWithServerSession: async (
      params: Record<string, string | string[] | undefined>,
    ) => {
      const gate = getWorkspaceAccessGate(params);

      return gate.status === "signed_in"
        ? { ...gate, source: "supabase" as const }
        : gate;
    },
  };
});
vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../../lib/referral-workspace-i18n"),
);

describe("AI Documents page", () => {
  it("renders the two-job shell and only the current provider's saved documents", async () => {
    const store = getGeneratedMaterialDraftStore();
    const now = "2026-08-02T04:00:00.000Z";

    await store.saveGeneratedMaterialDraft({
      id: "ai-documents-owner-draft",
      userId: "user-approved",
      feature: "ndis_case_note",
      status: "draft",
      content: {
        englishCaseNoteDraft:
          "The participant attended a community activity and selected a preferred task.",
        chineseReviewVersion: "参与者参加了社区活动并选择了一项偏好的任务。",
        missingFacts: [],
        neutralWordingChecks: ["Review the recorded time."],
        followUpPrompts: [],
        disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
      },
      createdAt: now,
      updatedAt: now,
    });
    await store.saveGeneratedMaterialDraft({
      id: "ai-documents-other-owner-draft",
      userId: "user-free",
      feature: "ndis_case_note",
      status: "draft",
      content: {
        englishCaseNoteDraft: "This other account's content must stay hidden.",
        chineseReviewVersion: "其他账号的内容不得显示。",
        missingFacts: [],
        neutralWordingChecks: [],
        followUpPrompts: [],
        disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
      },
      createdAt: now,
      updatedAt: now,
    });
    await store.saveGeneratedMaterialDraft({
      id: "ai-documents-owner-share-card",
      userId: "user-approved",
      feature: "share_card",
      status: "draft",
      content: { summary: "Owner-scoped non-case-note material." },
      createdAt: now,
      updatedAt: now,
    });

    const element = await AiDocumentsPage({
      searchParams: Promise.resolve({
        account: "user-approved",
        lang: "en",
      }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("AI Documents");
    expect(markup).toContain("Referrals");
    expect(markup).toContain("Create case note draft");
    expect(markup).toContain("Saved Documents");
    expect(markup).toContain(
      "Saved drafts remain in this workspace until you delete them.",
    );
    expect(markup).toContain("Delete");
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(1);
    expect(markup).toContain("Share card draft");
    expect(markup).toContain("The participant attended a community activity");
    expect(markup).not.toContain("This other account&#x27;s content");
    expect(markup).not.toContain("ai-documents-owner-draft");
    expect(markup).not.toContain("/admin/material-usage");
  });
});
