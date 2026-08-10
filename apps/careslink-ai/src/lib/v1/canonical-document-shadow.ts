import { createHash } from "node:crypto";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  assertValidStateTransition,
  canTransitionDocumentLifecycle,
  type CaresLinkV1Document,
  type CaresLinkV1DocumentCheckpoint,
  type CaresLinkV1DocumentLifecycleStatus,
  type CaresLinkV1DocumentRevision,
  type CaresLinkV1Locale,
  type CaresLinkV1NoteContent,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1SelfReviewStatus,
  type CaresLinkV1SyncStatus,
} from "./shared-contracts";

export type CaresLinkV1SelfReviewEvent = {
  id: string;
  documentId: string;
  revisionId: string;
  ownerUserId: string;
  event: "CONFIRMED";
  factsConfirmed: true;
  wordingConfirmed: true;
  missingFactsReviewed: true;
  mutationId: string;
  createdAt: string;
};

export type CaresLinkV1CanonicalDocumentSnapshot = {
  document: CaresLinkV1Document;
  revisions: CaresLinkV1DocumentRevision[];
  checkpoint?: CaresLinkV1DocumentCheckpoint;
  selfReviewStatus: CaresLinkV1SelfReviewStatus;
  selfReviewEvents: CaresLinkV1SelfReviewEvent[];
};

export type CaresLinkV1CanonicalDocumentShadowStore = {
  kind: "memory-shadow";
  createDocument(input: {
    id: string;
    ownerUserId: string;
    noteType: CaresLinkV1NoteTypeCode;
    sourceLocale: CaresLinkV1Locale;
    mutationId: string;
    now?: string;
  }): Promise<CaresLinkV1Document>;
  getSnapshot(input: {
    documentId: string;
    ownerUserId: string;
  }): Promise<CaresLinkV1CanonicalDocumentSnapshot | undefined>;
  appendRevision(input: {
    id: string;
    documentId: string;
    ownerUserId: string;
    baseRevisionId?: string;
    privacyReviewId?: string;
    content: CaresLinkV1NoteContent;
    mutationId: string;
    now?: string;
  }): Promise<CaresLinkV1DocumentRevision>;
  saveCheckpoint(input: {
    documentId: string;
    ownerUserId: string;
    currentStep: string;
    completedFieldCodes: string[];
    activeRevisionId?: string;
    privacyReviewId?: string;
    generationJobId?: string;
    syncStatus: CaresLinkV1SyncStatus;
    mutationId: string;
    now?: string;
  }): Promise<CaresLinkV1DocumentCheckpoint>;
  confirmSelfReview(input: {
    id: string;
    documentId: string;
    revisionId: string;
    ownerUserId: string;
    factsConfirmed: boolean;
    wordingConfirmed: boolean;
    missingFactsReviewed: boolean;
    mutationId: string;
    now?: string;
  }): Promise<CaresLinkV1SelfReviewEvent>;
  transitionLifecycle(input: {
    documentId: string;
    ownerUserId: string;
    to: CaresLinkV1DocumentLifecycleStatus;
    now?: string;
  }): Promise<CaresLinkV1Document>;
};

type MutationRecord =
  | { kind: "document"; fingerprint: string; value: CaresLinkV1Document }
  | { kind: "revision"; fingerprint: string; value: CaresLinkV1DocumentRevision }
  | {
      kind: "checkpoint";
      fingerprint: string;
      value: CaresLinkV1DocumentCheckpoint;
    }
  | {
      kind: "self_review";
      fingerprint: string;
      value: CaresLinkV1SelfReviewEvent;
    };

export function createMemoryCanonicalDocumentShadowStore(): CaresLinkV1CanonicalDocumentShadowStore {
  const documents = new Map<string, CaresLinkV1Document>();
  const revisions = new Map<string, CaresLinkV1DocumentRevision[]>();
  const checkpoints = new Map<string, CaresLinkV1DocumentCheckpoint>();
  const selfReviewEvents = new Map<string, CaresLinkV1SelfReviewEvent[]>();
  const mutations = new Map<string, MutationRecord>();

  return {
    kind: "memory-shadow",
    async createDocument({
      id,
      ownerUserId,
      noteType,
      sourceLocale,
      mutationId,
      now = new Date().toISOString(),
    }) {
      assertIdentity(id, "Document ID");
      assertIdentity(ownerUserId, "Owner user ID");
      assertCaresLinkV1IdempotencyKey(mutationId);
      const fingerprint = mutationFingerprint({ id, noteType, sourceLocale });

      const existingMutation = mutations.get(mutationKey(ownerUserId, mutationId));
      if (existingMutation) {
        if (
          existingMutation.kind !== "document" ||
          existingMutation.fingerprint !== fingerprint
        ) {
          throw idempotencyConflict();
        }

        return clone(existingMutation.value);
      }

      const existing = documents.get(id);
      if (existing) {
        throw existing.ownerUserId === ownerUserId
          ? idempotencyConflict()
          : forbidden();
      }

      const document: CaresLinkV1Document = {
        id,
        ownerUserId,
        noteType,
        sourceLocale,
        lifecycleStatus: "IN_PROGRESS",
        currentRevisionNumber: 0,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        createdAt: now,
        updatedAt: now,
      };

      documents.set(id, document);
      revisions.set(id, []);
      selfReviewEvents.set(id, []);
      mutations.set(mutationKey(ownerUserId, mutationId), {
        kind: "document",
        fingerprint,
        value: document,
      });

      return clone(document);
    },
    async getSnapshot({ documentId, ownerUserId }) {
      const document = documents.get(documentId);
      if (!document || document.ownerUserId !== ownerUserId) {
        return undefined;
      }

      const documentRevisions = revisions.get(documentId) ?? [];
      const events = selfReviewEvents.get(documentId) ?? [];
      const latestReview = [...events]
        .reverse()
        .find((event) => event.revisionId === document.currentRevisionId);

      return {
        document: clone(document),
        revisions: clone(documentRevisions),
        checkpoint: cloneOptional(checkpoints.get(documentId)),
        selfReviewStatus: latestReview ? "CONFIRMED" : "REQUIRED",
        selfReviewEvents: clone(events),
      };
    },
    async appendRevision({
      id,
      documentId,
      ownerUserId,
      baseRevisionId,
      privacyReviewId,
      content,
      mutationId,
      now = new Date().toISOString(),
    }) {
      assertIdentity(id, "Revision ID");
      assertCaresLinkV1IdempotencyKey(mutationId);
      const normalizedContent = normalizeNoteContent(content);
      const contentHash = createCanonicalContentHash(normalizedContent);
      const fingerprint = mutationFingerprint({
        id,
        documentId,
        baseRevisionId: baseRevisionId ?? null,
        privacyReviewId: privacyReviewId ?? null,
        contentHash,
      });
      const document = requireOwnedWritableDocument(
        documents,
        documentId,
        ownerUserId,
      );

      const existingMutation = mutations.get(mutationKey(ownerUserId, mutationId));
      if (existingMutation) {
        if (
          existingMutation.kind !== "revision" ||
          existingMutation.fingerprint !== fingerprint
        ) {
          throw idempotencyConflict();
        }

        return clone(existingMutation.value);
      }

      if (document.currentRevisionId !== baseRevisionId) {
        throw new CaresLinkV1ContractError(
          "STALE_REVISION",
          "The document changed before this revision was saved",
        );
      }

      const documentRevisions = revisions.get(documentId) ?? [];
      if (documentRevisions.some((revision) => revision.id === id)) {
        throw idempotencyConflict();
      }

      const revision: CaresLinkV1DocumentRevision = {
        id,
        documentId,
        ownerUserId,
        revisionNumber: document.currentRevisionNumber + 1,
        baseRevisionId,
        privacyReviewId,
        content: normalizedContent,
        contentHash,
        mutationId,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        createdAt: now,
      };

      documentRevisions.push(revision);
      revisions.set(documentId, documentRevisions);
      const updatedDocument: CaresLinkV1Document = {
        ...document,
        lifecycleStatus: "IN_PROGRESS",
        currentRevisionId: revision.id,
        currentRevisionNumber: revision.revisionNumber,
        updatedAt: now,
      };
      documents.set(documentId, updatedDocument);
      mutations.set(mutationKey(ownerUserId, mutationId), {
        kind: "revision",
        fingerprint,
        value: revision,
      });

      return clone(revision);
    },
    async saveCheckpoint({
      documentId,
      ownerUserId,
      currentStep,
      completedFieldCodes,
      activeRevisionId,
      privacyReviewId,
      generationJobId,
      syncStatus,
      mutationId,
      now = new Date().toISOString(),
    }) {
      assertCaresLinkV1IdempotencyKey(mutationId);
      const normalizedStep = normalizeShortCode(currentStep, "Current step");
      const normalizedFields = Array.from(
        new Set(
          completedFieldCodes.map((code) =>
            normalizeShortCode(code, "Completed field code"),
          ),
        ),
      ).sort();
      const fingerprint = mutationFingerprint({
        documentId,
        currentStep: normalizedStep,
        completedFieldCodes: normalizedFields,
        activeRevisionId: activeRevisionId ?? null,
        privacyReviewId: privacyReviewId ?? null,
        generationJobId: generationJobId ?? null,
        syncStatus,
      });
      const document = requireOwnedWritableDocument(
        documents,
        documentId,
        ownerUserId,
      );

      const existingMutation = mutations.get(mutationKey(ownerUserId, mutationId));
      if (existingMutation) {
        if (
          existingMutation.kind !== "checkpoint" ||
          existingMutation.fingerprint !== fingerprint
        ) {
          throw idempotencyConflict();
        }

        return clone(existingMutation.value);
      }

      if (
        activeRevisionId &&
        !(revisions.get(documentId) ?? []).some(
          (revision) => revision.id === activeRevisionId,
        )
      ) {
        throw new CaresLinkV1ContractError(
          "STALE_REVISION",
          "Checkpoint refers to an unknown revision",
        );
      }

      const checkpoint: CaresLinkV1DocumentCheckpoint = {
        documentId,
        ownerUserId,
        currentStep: normalizedStep,
        completedFieldCodes: normalizedFields,
        activeRevisionId: activeRevisionId ?? document.currentRevisionId,
        privacyReviewId,
        generationJobId,
        syncStatus,
        mutationId,
        updatedAt: now,
      };

      checkpoints.set(documentId, checkpoint);
      mutations.set(mutationKey(ownerUserId, mutationId), {
        kind: "checkpoint",
        fingerprint,
        value: checkpoint,
      });

      return clone(checkpoint);
    },
    async confirmSelfReview({
      id,
      documentId,
      revisionId,
      ownerUserId,
      factsConfirmed,
      wordingConfirmed,
      missingFactsReviewed,
      mutationId,
      now = new Date().toISOString(),
    }) {
      assertIdentity(id, "Self-review event ID");
      assertCaresLinkV1IdempotencyKey(mutationId);
      const fingerprint = mutationFingerprint({
        id,
        documentId,
        revisionId,
        factsConfirmed,
        wordingConfirmed,
        missingFactsReviewed,
      });
      const document = requireOwnedWritableDocument(
        documents,
        documentId,
        ownerUserId,
      );

      const existingMutation = mutations.get(mutationKey(ownerUserId, mutationId));
      if (existingMutation) {
        if (
          existingMutation.kind !== "self_review" ||
          existingMutation.fingerprint !== fingerprint
        ) {
          throw idempotencyConflict();
        }

        return clone(existingMutation.value);
      }

      if (document.currentRevisionId !== revisionId) {
        throw new CaresLinkV1ContractError(
          "STALE_REVISION",
          "Self-review must bind to the current revision",
        );
      }

      if (!factsConfirmed || !wordingConfirmed || !missingFactsReviewed) {
        throw new CaresLinkV1ContractError(
          "MINIMUM_FACTS_REQUIRED",
          "All self-review confirmations are required",
        );
      }

      const event: CaresLinkV1SelfReviewEvent = {
        id,
        documentId,
        revisionId,
        ownerUserId,
        event: "CONFIRMED",
        factsConfirmed: true,
        wordingConfirmed: true,
        missingFactsReviewed: true,
        mutationId,
        createdAt: now,
      };
      const events = selfReviewEvents.get(documentId) ?? [];
      events.push(event);
      selfReviewEvents.set(documentId, events);
      mutations.set(mutationKey(ownerUserId, mutationId), {
        kind: "self_review",
        fingerprint,
        value: event,
      });

      return clone(event);
    },
    async transitionLifecycle({
      documentId,
      ownerUserId,
      to,
      now = new Date().toISOString(),
    }) {
      const document = requireOwnedDocument(documents, documentId, ownerUserId);
      assertValidStateTransition(
        canTransitionDocumentLifecycle(document.lifecycleStatus, to),
        `Cannot transition document from ${document.lifecycleStatus} to ${to}`,
      );
      if (to === "COMPLETED") {
        const hasCurrentRevisionConfirmation = (
          selfReviewEvents.get(documentId) ?? []
        ).some(
          (event) =>
            event.event === "CONFIRMED" &&
            event.revisionId === document.currentRevisionId,
        );
        if (!document.currentRevisionId || !hasCurrentRevisionConfirmation) {
          throw new CaresLinkV1ContractError(
            "INVALID_STATE_TRANSITION",
            "The current revision requires self-review before completion",
          );
        }
      }

      const updated: CaresLinkV1Document = {
        ...document,
        lifecycleStatus: to,
        updatedAt: now,
        tombstonedAt:
          to === "TOMBSTONED" || to === "PURGED"
            ? document.tombstonedAt ?? now
            : undefined,
        purgedAt: to === "PURGED" ? now : undefined,
      };
      documents.set(documentId, updated);

      return clone(updated);
    },
  };
}

export function createCanonicalContentHash(content: CaresLinkV1NoteContent) {
  return createHash("sha256").update(stableStringify(content)).digest("hex");
}

function requireOwnedDocument(
  documents: Map<string, CaresLinkV1Document>,
  documentId: string,
  ownerUserId: string,
) {
  const document = documents.get(documentId);
  if (!document || document.ownerUserId !== ownerUserId) {
    throw forbidden();
  }

  return document;
}

function requireOwnedWritableDocument(
  documents: Map<string, CaresLinkV1Document>,
  documentId: string,
  ownerUserId: string,
) {
  const document = requireOwnedDocument(documents, documentId, ownerUserId);
  if (
    document.lifecycleStatus === "TOMBSTONED" ||
    document.lifecycleStatus === "PURGED"
  ) {
    throw new CaresLinkV1ContractError(
      "INVALID_STATE_TRANSITION",
      "Tombstoned documents are not writable",
    );
  }

  return document;
}

function normalizeNoteContent(
  content: CaresLinkV1NoteContent,
): CaresLinkV1NoteContent {
  if (!content.englishDraft.trim() || !content.disclaimer.trim()) {
    throw new CaresLinkV1ContractError(
      "MINIMUM_FACTS_REQUIRED",
      "Document content requires an English draft and disclaimer",
    );
  }

  return clone({
    englishDraft: content.englishDraft.trim(),
    reviewVersions: Object.fromEntries(
      Object.entries(content.reviewVersions)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([locale, value]) => [locale, value?.trim()]),
    ),
    factsSummary: content.factsSummary,
    missingFacts: normalizeStringList(content.missingFacts),
    neutralWordingChecks: normalizeStringList(content.neutralWordingChecks),
    followUpPrompts: normalizeStringList(content.followUpPrompts),
    disclaimer: content.disclaimer.trim(),
  });
}

function normalizeStringList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function mutationKey(ownerUserId: string, mutationId: string) {
  return `${ownerUserId}:${mutationId}`;
}

function mutationFingerprint(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function normalizeShortCode(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(normalized)) {
    throw new CaresLinkV1ContractError(
      "MINIMUM_FACTS_REQUIRED",
      `${label} is invalid`,
    );
  }

  return normalized;
}

function assertIdentity(value: string, label: string) {
  if (!value.trim() || value.length > 160) {
    throw new CaresLinkV1ContractError(
      "MINIMUM_FACTS_REQUIRED",
      `${label} is invalid`,
    );
  }
}

function forbidden() {
  return new CaresLinkV1ContractError(
    "FORBIDDEN",
    "The requested resource is unavailable",
  );
}

function idempotencyConflict() {
  return new CaresLinkV1ContractError(
    "IDEMPOTENCY_CONFLICT",
    "The idempotency key was already used for different input",
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : clone(value);
}
