import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CommunicationNoteAvailableDocument } from "../../../../../lib/communication-note-document-contract";
import { createValidCaresLinkV1CleanedFacts } from "../../../../../lib/v1/cleaned-facts-test-fixtures";
import { CommunicationNoteDocumentView } from "./communication-note-document-view";

const DOC = "10000000-0000-4000-8000-000000000001";
const REV1 = "20000000-0000-4000-8000-000000000001";
const REV2 = "20000000-0000-4000-8000-000000000002";
const NOW = "2026-09-07T01:00:00.000Z";

function currentDocument(): CommunicationNoteAvailableDocument {
  return {
    status: "AVAILABLE",
    canonicalId: DOC,
    noteType: "communication",
    sourceLocale: "zh-Hant",
    currentRevisionId: REV2,
    revision: {
      revisionId: REV2,
      revisionNumber: 2,
      contentHash: "a".repeat(64),
      createdAt: NOW,
      content: {
        englishDraft: "The worker contacted the coordinator by phone.",
        reviewVersions: {
          "zh-Hans": "工作人员通过电话联系协调员。",
          "zh-Hant": "工作人員透過電話聯絡協調員。",
        },
        factsSummary: createValidCaresLinkV1CleanedFacts("communication"),
        missingFacts: ["Confirm the stated outcome."],
        neutralWordingChecks: ["Check the recorded time."],
        followUpPrompts: [],
        disclaimer: "Untrusted provider disclaimer must not render",
      },
    },
    versions: [
      { revisionId: REV2, revisionNumber: 2, createdAt: NOW },
      {
        revisionId: REV1,
        revisionNumber: 1,
        createdAt: "2026-09-07T00:00:00.000Z",
      },
    ],
    isCurrentRevision: true,
    selfReviewStatus: "CONFIRMED",
    draftNotice: "Draft – review required",
    saveState: "SERVER_ACKNOWLEDGED",
  };
}

describe("Communication Note saved-document view", () => {
  it("renders the approved green CaresLink result surface and all review versions", () => {
    const markup = render("en", currentDocument());
    const visibleText = markup.replace(/<[^>]+>/g, "");

    expect(markup).toContain("/careslink-ai-logo-reverse.svg");
    expect(markup).toContain("case-note-brandbar");
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(visibleText).toContain("Communication Note draft");
    expect(visibleText).toContain("Draft – review required");
    expect(visibleText).toContain("Saved on server");
    expect(visibleText).toContain("Self-review confirmed");
    expect(visibleText).toContain("It remains a draft");
    expect(visibleText).toContain(
      "The worker contacted the coordinator by phone.",
    );
    expect(visibleText).toContain("工作人员通过电话联系协调员。");
    expect(visibleText).toContain("工作人員透過電話聯絡協調員。");
    expect(visibleText).toContain("Confirm the stated outcome.");
    expect(visibleText).toContain("Check the recorded time.");
    expect(visibleText).toContain("None flagged for this version.");
    expect(visibleText).toContain("The call lasted ten minutes.");
    expect(visibleText).not.toContain(
      "Untrusted provider disclaimer must not render",
    );
    expect(visibleText).not.toMatch(/approved|compliant/i);
    expect(visibleText).not.toMatch(/copy draft|export draft|edit draft/i);
  });

  it("binds every locale and history link to the selected canonical revision", () => {
    const markup = render("zh-Hant", currentDocument());

    expect(markup).toContain(
      `href="/ai-documents/communication-note/documents/${DOC}?lang=en&amp;revisionId=${REV2}"`,
    );
    expect(markup).toContain(
      `href="/ai-documents/communication-note/documents/${DOC}?lang=zh-Hans&amp;revisionId=${REV2}"`,
    );
    expect(markup).toContain(
      `href="/ai-documents/communication-note/documents/${DOC}?lang=zh-Hant&amp;revisionId=${REV1}"`,
    );
    expect(markup).not.toMatch(/contentHash|idempotencyKey|observable_facts=/);
  });

  it("makes a missing Traditional review version explicit without substitution", () => {
    const current = currentDocument();
    const result: CommunicationNoteAvailableDocument = {
      ...current,
      revision: {
        ...current.revision,
        content: {
          ...current.revision.content,
          reviewVersions: {
            "zh-Hans": current.revision.content.reviewVersions["zh-Hans"],
          },
        },
      },
    };
    const visibleText = render("zh-Hant", result).replace(/<[^>]+>/g, "");

    expect(visibleText).toContain(
      "沒有可用的繁體中文複核版本。系統沒有替換為其他語言的內容。",
    );
    expect(visibleText).toContain("工作人员通过电话联系协调员。");
    expect(visibleText).not.toContain("工作人員透過電話聯絡協調員。");
    expect(visibleText).toContain("已確認人工複核");
  });

  it("does not carry the current self-review confirmation onto history", () => {
    const current = currentDocument();
    const historical: CommunicationNoteAvailableDocument = {
      ...current,
      revision: {
        ...current.revision,
        revisionId: REV1,
        revisionNumber: 1,
        createdAt: "2026-09-07T00:00:00.000Z",
      },
      isCurrentRevision: false,
      selfReviewStatus: "UNKNOWN",
    };
    const visibleText = render("en", historical).replace(/<[^>]+>/g, "");

    expect(visibleText).toContain("Historical version");
    expect(visibleText).toContain("Status not carried to history");
    expect(visibleText).not.toContain("Self-review confirmed");
    expect(visibleText).toContain("Draft – review required");
  });

  it.each([
    [undefined, "Checking saved draft access"],
    [{ status: "EMPTY", canonicalId: DOC, sourceLocale: "en" } as const, "has no saved draft yet"],
    [{ status: "NOT_FOUND" } as const, "Communication Note not found"],
    [{ status: "UNAVAILABLE" } as const, "temporarily unavailable"],
  ])("renders the content-free state %#", (result, sentinel) => {
    const markup = render("en", result);
    expect(markup).toContain(sentinel);
    expect(markup).not.toContain("The worker contacted");
    expect(markup.match(/<h1/g)).toHaveLength(1);
  });

  it("keeps unsupported locale fallback explicit", () => {
    const markup = render("en", { status: "NOT_FOUND" }, true);
    expect(markup).toContain("The requested language is not supported");
  });

  it.each((["en", "zh-Hans", "zh-Hant"] as const).flatMap(locale =>
    (["AVAILABLE", "EMPTY", "NOT_FOUND", "UNAVAILABLE", undefined] as const).map(status => ({ locale, status }))))(
    "returns $locale / $status directly to the same-language workspace",
    ({ locale, status }) => {
      const result = status === "AVAILABLE" ? currentDocument() : status === "EMPTY"
        ? { status, canonicalId: DOC, sourceLocale: "en" as const } : status ? { status } : undefined;
      const markup = render(locale, result);
      const header = markup.match(/<header[\s\S]*?<\/header>/)?.[0];
      expect(header?.match(new RegExp(`href="/ai-documents\\?lang=${locale}"`, "g"))).toHaveLength(2);
      expect(header).toContain(locale === "en" ? "Back to workspace" : "返回工作台");
      expect(header).not.toContain("/communication-note?lang=");
      expect(header).toContain(`/documents/${DOC}?lang=${locale}&amp;revisionId=${REV2}`);
      expect(header).not.toMatch(/history\.back|returnTo=|contentHash|idempotencyKey/);
    },
  );

  it.each(["en", "zh-Hans", "zh-Hant"] as const)("keeps invalid document exits safe in %s", locale => {
    const markup = renderToStaticMarkup(createElement(CommunicationNoteDocumentView, {
      canonicalId: "", locale, documentNavigationAvailable: false, result: { status: "NOT_FOUND" },
    }));
    expect(markup).toContain(`href="/ai-documents?lang=${locale}"`);
    expect(markup).not.toContain("/documents/");
    expect(markup).not.toContain("/communication-note?lang=");
  });
});

function render(
  locale: "en" | "zh-Hans" | "zh-Hant",
  result?: React.ComponentProps<typeof CommunicationNoteDocumentView>["result"],
  unsupportedLocale = false,
) {
  return renderToStaticMarkup(
    createElement(CommunicationNoteDocumentView, {
      canonicalId: DOC,
      locale,
      result,
      revisionId: REV2,
      unsupportedLocale,
    }),
  );
}
