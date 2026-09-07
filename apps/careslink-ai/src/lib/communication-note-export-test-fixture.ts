import { createValidCaresLinkV1CleanedFacts } from "./v1/cleaned-facts-test-fixtures";
import type { CommunicationNoteAvailableDocument } from "./communication-note-document-contract";

export const EXPORT_DOC = "10000000-0000-4000-8000-000000000001", EXPORT_REV = "20000000-0000-4000-8000-000000000001";
export const EXPORT_NOW = "2026-09-08T02:03:04.000Z";
export function exportDocument(): CommunicationNoteAvailableDocument {
  return { status: "AVAILABLE", canonicalId: EXPORT_DOC, noteType: "communication", sourceLocale: "zh-Hant",
    currentRevisionId: EXPORT_REV, isCurrentRevision: true, selfReviewStatus: "CONFIRMED", draftNotice: "Draft – review required",
    saveState: "SERVER_ACKNOWLEDGED", versions: [{ revisionId: EXPORT_REV, revisionNumber: 3, createdAt: EXPORT_NOW }],
    revision: { revisionId: EXPORT_REV, revisionNumber: 3, createdAt: EXPORT_NOW, contentHash: "a".repeat(64), content: {
      englishDraft: "Synthetic record. The agreed information was recorded.\nUnicode: café 中文 😀.",
      reviewVersions: { "zh-Hans": "PRIVATE_REVIEW_HANS", "zh-Hant": "PRIVATE_REVIEW_HANT" },
      factsSummary: createValidCaresLinkV1CleanedFacts("communication"), missingFacts: ["PRIVATE_MISSING"],
      neutralWordingChecks: ["PRIVATE_CHECKS"], followUpPrompts: ["PRIVATE_FOLLOW_UP"], disclaimer: "PRIVATE_INTERNAL_DISCLAIMER",
    } },
  };
}
