import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NDIS_CASE_NOTE_DISCLAIMER } from "../../../lib/ndis-case-note-companion";
import { NdisCaseNoteCompanion } from "./ndis-case-note-companion";

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
      }),
    );

    expect(markup).toContain("Available with a free account");
    expect(markup).toContain("Register or sign in to generate");
    expect(markup).toContain("Do not enter names");
    expect(markup).toContain("Review privacy first");
    expect(markup).toContain("Structured facts");
    expect(markup).toContain("Paste Chinese notes");
    expect(markup).toContain("Support date and approximate time");
    expect(markup).not.toContain("Support date and time (optional)");
    expect(markup.match(/type="checkbox"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(markup).toMatch(/<fieldset disabled=""[^>]*>/);
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

  it("shows an authenticated reviewable result without a guest save handoff", () => {
    const claimToken = "a".repeat(43);
    const markup = renderToStaticMarkup(
      createElement(NdisCaseNoteCompanion, {
        attribution,
        initialClaimToken: claimToken,
        initialMaterial: material,
        autoSave: false,
        savedDrafts: [],
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
    expect(markup).toContain(material.englishCaseNoteDraft);
    expect(markup).not.toContain("ndis-case-note-owner-1");
  });

  it("renders the Chinese input and authority boundaries without preselecting confirmations", () => {
    const markup = renderToStaticMarkup(
      createElement(NdisCaseNoteCompanion, {
        attribution: { ...attribution, locale: "zh-Hans" as const },
        autoSave: false,
        savedDrafts: [],
      }),
    );

    expect(markup).toContain("结构化事实");
    expect(markup).toContain("粘贴中文记录");
    expect(markup).toContain("仅说明处理权限");
    expect(markup).toContain("不代表或替代 participant consent");
    expect(markup.match(/type="checkbox"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/type="checkbox"[^>]*checked/);
  });
});
