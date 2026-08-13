import { createHash } from "node:crypto";
import type { GeneratedMaterialDraftRecord } from "../generated-material-draft-store";
import { parseNdisCaseNoteMaterial } from "../ndis-case-note-companion";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  type CaresLinkV1Document,
  type CaresLinkV1DocumentCheckpoint,
  type CaresLinkV1DocumentRevision,
  type CaresLinkV1NoteContent,
} from "./shared-contracts";

export const LEGACY_NDIS_SCHEMA_VERSION =
  "legacy.generated_material_drafts.ndis_case_note.v1" as const;

export type LegacyNdisMigrationCandidate = {
  sourceTable: "generated_material_drafts";
  sourceId: string;
  sourceOwnerUserId: string;
  sourceFeature: "ndis_case_note";
  sourceStatus: "draft" | "reviewed" | "archived";
  sourceContentHash: string;
  projectedDocumentId: string;
  projectedRevisionId: string;
  adapterVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
};

export type LegacyNdisCanonicalProjection = {
  readOnly: true;
  document: CaresLinkV1Document;
  revision: LegacyNdisDocumentRevision;
  checkpoint: CaresLinkV1DocumentCheckpoint;
  selfReviewStatus: "REQUIRED";
  migrationCandidate: LegacyNdisMigrationCandidate;
  warnings: readonly [
    "LEGACY_STATUS_NOT_MAPPED_TO_SELF_REVIEW",
    "SOURCE_LOCALE_ASSUMED_ENGLISH_FORMAL_RECORD",
    "NO_ORIGINAL_STRUCTURED_FACTS_AVAILABLE",
  ];
};

/**
 * Read-only legacy payload. It is intentionally not a current V1 Note content
 * because the source row did not retain the original structured facts.
 */
export type LegacyNdisNoteContent = Omit<
  CaresLinkV1NoteContent,
  "factsSummary"
> & {
  factsSummary: Record<string, never>;
};

export type LegacyNdisDocumentRevision = Omit<
  CaresLinkV1DocumentRevision,
  "content"
> & {
  content: LegacyNdisNoteContent;
};

export function projectLegacyNdisDraftToCanonical(
  source: GeneratedMaterialDraftRecord,
): LegacyNdisCanonicalProjection {
  if (source.feature !== "ndis_case_note") {
    throw new Error("Only legacy NDIS case-note drafts can be projected");
  }
  if (!source.userId.trim()) {
    throw new Error("Legacy NDIS draft owner is required");
  }

  const material = parseNdisCaseNoteMaterial(JSON.stringify(source.content), {
    allowLegacy: true,
  });
  const digest = createHash("sha256")
    .update(`generated_material_drafts:${source.id}`)
    .digest("hex")
    .slice(0, 32);
  const documentId = `legacy-ndis-doc-${digest}`;
  const revisionId = `legacy-ndis-revision-${digest}`;
  const mutationId = `legacy-ndis-map:${digest}`;
  const content: LegacyNdisNoteContent = {
    englishDraft: material.englishCaseNoteDraft,
    reviewVersions: {
      "zh-Hans": material.chineseReviewVersion,
    },
    factsSummary: {},
    missingFacts: [...material.missingFacts],
    neutralWordingChecks: [...material.neutralWordingChecks],
    followUpPrompts: [...material.followUpPrompts],
    disclaimer: material.disclaimer,
  };
  const contentHash = createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(content))
    .digest("hex");
  const document: CaresLinkV1Document = {
    id: documentId,
    ownerUserId: source.userId,
    noteType: "ndis",
    sourceLocale: "en",
    lifecycleStatus: "IN_PROGRESS",
    currentRevisionId: revisionId,
    currentRevisionNumber: 1,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: LEGACY_NDIS_SCHEMA_VERSION,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
  const revision: LegacyNdisDocumentRevision = {
    id: revisionId,
    documentId,
    ownerUserId: source.userId,
    revisionNumber: 1,
    content,
    contentHash,
    mutationId,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: LEGACY_NDIS_SCHEMA_VERSION,
    createdAt: source.createdAt,
  };
  const checkpoint: CaresLinkV1DocumentCheckpoint = {
    documentId,
    ownerUserId: source.userId,
    currentStep: "result_review",
    completedFieldCodes: [],
    activeRevisionId: revisionId,
    syncStatus: "SERVER_ACKNOWLEDGED",
    mutationId,
    updatedAt: source.updatedAt,
  };

  return {
    readOnly: true,
    document,
    revision,
    checkpoint,
    selfReviewStatus: "REQUIRED",
    migrationCandidate: {
      sourceTable: "generated_material_drafts",
      sourceId: source.id,
      sourceOwnerUserId: source.userId,
      sourceFeature: "ndis_case_note",
      sourceStatus: source.status,
      sourceContentHash: contentHash,
      projectedDocumentId: documentId,
      projectedRevisionId: revisionId,
      adapterVersion: CARESLINK_V1_CONTRACT_VERSION,
    },
    warnings: [
      "LEGACY_STATUS_NOT_MAPPED_TO_SELF_REVIEW",
      "SOURCE_LOCALE_ASSUMED_ENGLISH_FORMAL_RECORD",
      "NO_ORIGINAL_STRUCTURED_FACTS_AVAILABLE",
    ],
  };
}
