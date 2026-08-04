import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NDIS_CASE_NOTE_DISCLAIMER } from "../../../lib/ndis-case-note-companion";
import {
  getNdisCaseNoteConfirmationGate,
  getNdisCaseNoteInputPanelState,
  NdisCaseNoteCompanion,
  PrivacyConfirmationStep,
} from "./ndis-case-note-companion";

const attribution = {
  source: "ndis-case-note-download",
  resourceSlug: "ndis-case-note-template",
  utmSource: "careslink",
  utmMedium: "post_download",
  utmCampaign: "ndis_case_note_ai_companion_v01",
  locale: "en" as const,
};

const material = {
  englishCaseNoteDraft: "The participant attended a community setting.",
  chineseReviewVersion: "参与者前往了社区场景。",
  missingFacts: ["Confirm the finish time."],
  neutralWordingChecks: ["Review all observable statements."],
  followUpPrompts: ["Confirm whether handover occurred."],
  disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
};

const creditUsage = {
  planCode: "free" as const,
  status: "active" as const,
  periodStart: "2026-08-01",
  periodEnd: "2026-09-01",
  creditLimit: 3,
  remainingCredits: 2,
  usedCredits: 1,
  reservedCredits: 0,
};

describe("NDIS case note companion UI", () => {
  it("keeps the authenticated companion route out of search indexes", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    expect(pageSource).toContain("index: false");
    expect(pageSource).toContain("follow: false");
    expect(pageSource).toContain(
      "https://ai.careslink.com.au/template-companion/ndis-case-note",
    );
  });

  it("renders a responsive single-task flow with product navigation and mobile privacy context", () => {
    const markup = renderToStaticMarkup(
      createElement(NdisCaseNoteCompanion, {
        attribution,
        autoSave: false,
        savedDrafts: [],
        initialCreditUsage: creditUsage,
      }),
    );

    expect(markup).toContain("2 of 3 credits remaining this period");
    expect(markup).toContain("One new draft uses 1 credit");
    expect(markup).toContain("Sign out");
    expect(markup).toContain("Privacy, collection &amp; retention");
    expect(markup).toContain("Do not enter names");
    expect(markup).toContain("Review privacy first");
    expect(markup).toContain("Structured facts");
    expect(markup).toContain("Paste Chinese notes");
    expect(markup).toContain("Support date and approximate time");
    expect(markup).not.toContain("Support date and time (optional)");
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toMatch(/<fieldset disabled=""[^>]*>/);
    expect(markup).toContain("Choose Review privacy first below");
    expect(markup).toContain("does not state or replace participant consent");
    expect(markup).toContain("case-note-workspace");
    expect(markup).toContain("Privacy Review");
    expect(markup).toContain("case-note-result");
    expect(markup).toContain("AI Documents");
    expect(markup).toContain("Referrals");
    expect(markup).toContain("case-note-mobile-context");
    expect(markup).not.toContain("Access request");
    expect(markup).not.toContain("Demo account");
  });

  it("keeps pasted notes visible while revealing extracted structured facts", () => {
    expect(getNdisCaseNoteInputPanelState("paste", false)).toEqual({
      showPasteInput: true,
      showExtractedFactsContext: false,
      showStructuredFacts: false,
    });
    expect(getNdisCaseNoteInputPanelState("paste", true)).toEqual({
      showPasteInput: true,
      showExtractedFactsContext: true,
      showStructuredFacts: true,
    });
    expect(getNdisCaseNoteInputPanelState("structured", false)).toEqual({
      showPasteInput: false,
      showExtractedFactsContext: false,
      showStructuredFacts: true,
    });
  });

  it("shows either a clear locked state or enabled confirmation controls", () => {
    expect(getNdisCaseNoteConfirmationGate(false, false, 6)).toEqual({
      canConfirm: false,
      reason: "privacy_review",
    });
    expect(getNdisCaseNoteConfirmationGate(true, false, 6)).toEqual({
      canConfirm: false,
      reason: "privacy_findings",
    });
    expect(getNdisCaseNoteConfirmationGate(true, true, 5)).toEqual({
      canConfirm: false,
      reason: "minimum_facts",
    });
    expect(getNdisCaseNoteConfirmationGate(true, true, 0)).toEqual({
      canConfirm: true,
      reason: "ready",
    });

    const commonProps = {
      title: "Confirm before generating",
      lockedMessage: "Complete Privacy Review before selecting these confirmations.",
      unlockHint: "Choose Review privacy first below.",
      confirmations: {
        reviewedNoIdentifiers: false,
        processingAuthorityConfirmed: false,
      },
      reviewedNoIdentifiers: "I reviewed the facts.",
      processingAuthorityConfirmed: "I have processing authority.",
      authorityNotConsent: "This does not replace participant consent.",
      onReviewedNoIdentifiersChange: () => undefined,
      onProcessingAuthorityChange: () => undefined,
    };
    const lockedMarkup = renderToStaticMarkup(
      createElement(PrivacyConfirmationStep, {
        ...commonProps,
        canConfirm: false,
      }),
    );
    const unlockedMarkup = renderToStaticMarkup(
      createElement(PrivacyConfirmationStep, {
        ...commonProps,
        canConfirm: true,
      }),
    );

    expect(lockedMarkup).toContain('role="status"');
    expect(lockedMarkup).not.toContain('type="checkbox"');
    expect(unlockedMarkup.match(/type="checkbox"/g)).toHaveLength(2);
    expect(unlockedMarkup).not.toContain('disabled=""');
    expect(unlockedMarkup).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it("shows a concrete, non-charging paid-beta fake door at zero credits", () => {
    const markup = renderToStaticMarkup(
      createElement(NdisCaseNoteCompanion, {
        attribution,
        autoSave: false,
        savedDrafts: [],
        initialCreditUsage: {
          ...creditUsage,
          remainingCredits: 0,
          usedCredits: 3,
        },
      }),
    );

    expect(markup).toContain("A$9.99 per month for 30 generation credits");
    expect(markup).toContain("Request more credits / Join paid beta");
    expect(markup).toContain("you will not be charged now");
    expect(markup).toContain("credits are not added automatically");
  });

  it("shows an authenticated reviewable result without a guest save handoff", () => {
    const claimToken = "a".repeat(43);
    const markup = renderToStaticMarkup(
      createElement(NdisCaseNoteCompanion, {
        attribution,
        initialClaimToken: claimToken,
        initialMaterial: material,
        autoSave: false,
        savedDrafts: [],
        initialCreditUsage: creditUsage,
      }),
    );

    expect(markup).toContain("Save this draft");
    expect(markup).not.toContain("Already registered? Sign in");
    expect(markup).toContain(`claimToken=${claimToken}`);
    expect(markup).not.toContain(
      encodeURIComponent(material.englishCaseNoteDraft),
    );
    expect(markup).toContain(material.chineseReviewVersion);
    expect(markup).toContain("not a second formal record");
  });

  it("renders owner-scoped saved history for a provider account", () => {
    const markup = renderToStaticMarkup(
      createElement(NdisCaseNoteCompanion, {
        attribution,
        autoSave: false,
        initialCreditUsage: creditUsage,
        savedDrafts: [
          {
            id: "ndis-case-note-owner-1",
            material,
            status: "draft",
            createdAt: "2026-07-23T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(markup).toContain("Recently saved drafts");
    expect(markup).toContain(
      "Saved drafts remain in this workspace until you delete them.",
    );
    expect(markup).toContain("Delete");
    expect(markup).toContain(material.englishCaseNoteDraft);
    expect(markup).not.toContain("ndis-case-note-owner-1");
  });

  it("renders the Chinese input and authority boundaries without preselecting confirmations", () => {
    const markup = renderToStaticMarkup(
      createElement(NdisCaseNoteCompanion, {
        attribution: { ...attribution, locale: "zh-Hans" as const },
        autoSave: false,
        savedDrafts: [],
        initialCreditUsage: creditUsage,
      }),
    );

    expect(markup).toContain("结构化事实");
    expect(markup).toContain("粘贴中文记录");
    expect(markup).toContain("仅说明处理权限");
    expect(markup).toContain("不代表或替代 participant consent");
    expect(markup).toContain("本周期剩余 2 / 3 credits");
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).toContain("先进行隐私复核");
  });
});
