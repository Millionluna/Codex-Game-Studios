import { describe, expect, it } from "vitest";
import type { GeneratedMaterialDraftRecord } from "../generated-material-draft-store";
import { NDIS_CASE_NOTE_DISCLAIMER } from "../ndis-case-note-companion";
import {
  LEGACY_NDIS_SCHEMA_VERSION,
  projectLegacyNdisDraftToCanonical,
} from "./legacy-ndis-adapter";

const source: GeneratedMaterialDraftRecord = {
  id: "legacy-ndis-draft-0001",
  userId: "11111111-1111-4111-8111-111111111111",
  feature: "ndis_case_note",
  status: "reviewed",
  content: {
    englishCaseNoteDraft: "The participant requested a seated break.",
    chineseReviewVersion: "参与者提出坐下休息。",
    missingFacts: [],
    neutralWordingChecks: ["Review the timing before using the draft."],
    followUpPrompts: [],
    disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
  },
  createdAt: "2026-08-04T10:00:00.000Z",
  updatedAt: "2026-08-04T10:05:00.000Z",
};

describe("legacy NDIS canonical adapter", () => {
  it("projects a saved NDIS material into a deterministic read-only canonical snapshot", () => {
    const first = projectLegacyNdisDraftToCanonical(source);
    const second = projectLegacyNdisDraftToCanonical(source);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      readOnly: true,
      document: {
        ownerUserId: source.userId,
        noteType: "ndis",
        sourceLocale: "en",
        lifecycleStatus: "IN_PROGRESS",
        currentRevisionNumber: 1,
        schemaVersion: LEGACY_NDIS_SCHEMA_VERSION,
      },
      revision: {
        ownerUserId: source.userId,
        revisionNumber: 1,
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      checkpoint: {
        currentStep: "result_review",
        syncStatus: "SERVER_ACKNOWLEDGED",
      },
      selfReviewStatus: "REQUIRED",
    });
  });

  it("does not reinterpret a legacy reviewed/archived status as V1 self-review or approval", () => {
    const reviewed = projectLegacyNdisDraftToCanonical(source);
    const archived = projectLegacyNdisDraftToCanonical({
      ...source,
      id: "legacy-ndis-draft-archived",
      status: "archived",
    });

    expect(reviewed.selfReviewStatus).toBe("REQUIRED");
    expect(archived.selfReviewStatus).toBe("REQUIRED");
    expect(reviewed.document.lifecycleStatus).toBe("IN_PROGRESS");
    expect(archived.document.lifecycleStatus).toBe("IN_PROGRESS");
    expect(reviewed.warnings).toContain(
      "LEGACY_STATUS_NOT_MAPPED_TO_SELF_REVIEW",
    );
  });

  it("maps English and Simplified Chinese output without inventing structured facts", () => {
    const projection = projectLegacyNdisDraftToCanonical(source);

    expect(projection.revision.content).toEqual({
      englishDraft: "The participant requested a seated break.",
      reviewVersions: { "zh-Hans": "参与者提出坐下休息。" },
      factsSummary: {},
      missingFacts: [],
      neutralWordingChecks: ["Review the timing before using the draft."],
      followUpPrompts: [],
      disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
    });
    expect(projection.revision.content.reviewVersions).not.toHaveProperty(
      "zh-Hant",
    );
    expect(projection.warnings).toContain(
      "NO_ORIGINAL_STRUCTURED_FACTS_AVAILABLE",
    );
  });

  it("emits metadata-only migration candidate data and never rewrites the source", () => {
    const original = structuredClone(source);
    const projection = projectLegacyNdisDraftToCanonical(source);
    const candidateJson = JSON.stringify(projection.migrationCandidate);

    expect(source).toEqual(original);
    expect(projection.migrationCandidate).toMatchObject({
      sourceTable: "generated_material_drafts",
      sourceId: source.id,
      sourceOwnerUserId: source.userId,
      sourceFeature: "ndis_case_note",
      sourceStatus: "reviewed",
      sourceContentHash: projection.revision.contentHash,
    });
    expect(candidateJson).not.toContain("seated break");
    expect(candidateJson).not.toContain("坐下休息");
    expect(candidateJson).not.toContain("englishDraft");
  });

  it("supports the older English-only saved shape without claiming a translated formal record", () => {
    const projection = projectLegacyNdisDraftToCanonical({
      ...source,
      id: "legacy-ndis-draft-old-shape",
      content: {
        caseNoteDraft: "The participant requested a seated break.",
        missingFacts: [],
        neutralWordingChecks: [],
        followUpPrompts: [],
        disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
      },
    });

    expect(projection.revision.content.reviewVersions["zh-Hans"]).toContain(
      "旧版已保存草稿",
    );
    expect(projection.selfReviewStatus).toBe("REQUIRED");
  });

  it("rejects non-NDIS legacy materials", () => {
    expect(() =>
      projectLegacyNdisDraftToCanonical({
        ...source,
        feature: "profile_rewrite",
      }),
    ).toThrow("Only legacy NDIS case-note drafts can be projected");
  });
});
