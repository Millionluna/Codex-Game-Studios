import { describe, expect, it } from "vitest";
import {
  createCanonicalContentHash,
  createMemoryCanonicalDocumentShadowStore,
} from "./canonical-document-shadow";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  type CaresLinkV1NoteContent,
} from "./shared-contracts";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const revisionOneId = "44444444-4444-4444-8444-444444444444";
const revisionTwoId = "55555555-5555-4555-8555-555555555555";
const now = "2026-08-09T01:00:00.000Z";

describe("canonical document shadow store", () => {
  it("creates an owner-bound document and first revision with a saveable snapshot", async () => {
    const store = createMemoryCanonicalDocumentShadowStore();

    const document = await store.createDocument({
      id: documentId,
      ownerUserId: ownerA,
      noteType: "ndis",
      sourceLocale: "zh-Hant",
      mutationId: "document.create:0001",
      now,
    });
    const revision = await store.appendRevision({
      id: revisionOneId,
      documentId,
      ownerUserId: ownerA,
      content: caseNoteContent(),
      mutationId: "document.revision:0001",
      now,
    });
    await store.saveCheckpoint({
      documentId,
      ownerUserId: ownerA,
      currentStep: "result_review",
      completedFieldCodes: ["observable_facts", "support_delivered"],
      activeRevisionId: revision.id,
      syncStatus: "SERVER_ACKNOWLEDGED",
      mutationId: "document.checkpoint:0001",
      now,
    });

    expect(document).toMatchObject({
      lifecycleStatus: "IN_PROGRESS",
      currentRevisionNumber: 0,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    });
    expect(revision).toMatchObject({
      revisionNumber: 1,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await expect(
      store.getSnapshot({ documentId, ownerUserId: ownerA }),
    ).resolves.toMatchObject({
      document: {
        currentRevisionId: revisionOneId,
        currentRevisionNumber: 1,
      },
      checkpoint: {
        activeRevisionId: revisionOneId,
        syncStatus: "SERVER_ACKNOWLEDGED",
      },
      selfReviewStatus: "REQUIRED",
    });
  });

  it("requires the exact base revision and rejects stale concurrent saves", async () => {
    const store = await storeWithFirstRevision();

    await expect(
      store.appendRevision({
        id: revisionTwoId,
        documentId,
        ownerUserId: ownerA,
        baseRevisionId: "stale-revision-id",
        content: caseNoteContent("Changed observable fact."),
        mutationId: "document.revision:0002",
      }),
    ).rejects.toMatchObject({ code: "STALE_REVISION" });

    const snapshot = await store.getSnapshot({
      documentId,
      ownerUserId: ownerA,
    });
    expect(snapshot?.revisions).toHaveLength(1);
  });

  it("replays an identical revision mutation without creating a duplicate", async () => {
    const store = await storeWithFirstRevision();
    const input = {
      id: revisionTwoId,
      documentId,
      ownerUserId: ownerA,
      baseRevisionId: revisionOneId,
      content: caseNoteContent("A second observable fact."),
      mutationId: "document.revision:0002",
      now: "2026-08-09T01:05:00.000Z",
    } as const;

    const first = await store.appendRevision(input);
    const replay = await store.appendRevision(input);

    expect(replay).toEqual(first);
    expect(
      (await store.getSnapshot({ documentId, ownerUserId: ownerA }))?.revisions,
    ).toHaveLength(2);
  });

  it("rejects reuse of an idempotency key for different input", async () => {
    const store = await storeWithFirstRevision();
    await store.appendRevision({
      id: revisionTwoId,
      documentId,
      ownerUserId: ownerA,
      baseRevisionId: revisionOneId,
      content: caseNoteContent("A second observable fact."),
      mutationId: "document.revision:0002",
    });

    await expect(
      store.appendRevision({
        id: revisionTwoId,
        documentId,
        ownerUserId: ownerA,
        baseRevisionId: revisionOneId,
        content: caseNoteContent("Different content under the same mutation."),
        mutationId: "document.revision:0002",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    await expect(
      store.saveCheckpoint({
        documentId,
        ownerUserId: ownerA,
        currentStep: "result_review",
        completedFieldCodes: [],
        syncStatus: "SERVER_ACKNOWLEDGED",
        mutationId: "document.revision:0002",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects a checkpoint mutation replayed with changed fields", async () => {
    const store = await storeWithFirstRevision();
    await store.saveCheckpoint({
      documentId,
      ownerUserId: ownerA,
      currentStep: "facts",
      completedFieldCodes: ["support_type"],
      syncStatus: "LOCAL_SAVED",
      mutationId: "document.checkpoint:0001",
    });

    await expect(
      store.saveCheckpoint({
        documentId,
        ownerUserId: ownerA,
        currentStep: "privacy_review",
        completedFieldCodes: ["support_type", "observable_facts"],
        syncStatus: "LOCAL_SAVED",
        mutationId: "document.checkpoint:0001",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps self-review revision-bound and invalidates completion after editing", async () => {
    const store = await storeWithFirstRevision();
    await expect(
      store.transitionLifecycle({
        documentId,
        ownerUserId: ownerA,
        to: "COMPLETED",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });

    await store.confirmSelfReview({
      id: "66666666-6666-4666-8666-666666666666",
      documentId,
      revisionId: revisionOneId,
      ownerUserId: ownerA,
      factsConfirmed: true,
      wordingConfirmed: true,
      missingFactsReviewed: true,
      mutationId: "document.review:0001",
    });
    await store.transitionLifecycle({
      documentId,
      ownerUserId: ownerA,
      to: "COMPLETED",
    });
    expect(
      (await store.getSnapshot({ documentId, ownerUserId: ownerA }))
        ?.selfReviewStatus,
    ).toBe("CONFIRMED");

    await store.appendRevision({
      id: revisionTwoId,
      documentId,
      ownerUserId: ownerA,
      baseRevisionId: revisionOneId,
      content: caseNoteContent("Edited factual wording."),
      mutationId: "document.revision:0002",
    });
    await expect(
      store.getSnapshot({ documentId, ownerUserId: ownerA }),
    ).resolves.toMatchObject({
      document: { lifecycleStatus: "IN_PROGRESS" },
      selfReviewStatus: "REQUIRED",
    });
  });

  it("does not reveal or mutate another owner's document", async () => {
    const store = await storeWithFirstRevision();

    await expect(
      store.getSnapshot({ documentId, ownerUserId: ownerB }),
    ).resolves.toBeUndefined();
    await expect(
      store.appendRevision({
        id: revisionTwoId,
        documentId,
        ownerUserId: ownerB,
        baseRevisionId: revisionOneId,
        content: caseNoteContent(),
        mutationId: "document.revision:owner-b",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks writes after tombstone and only permits purge as its terminal transition", async () => {
    const store = await storeWithFirstRevision();
    await store.transitionLifecycle({
      documentId,
      ownerUserId: ownerA,
      to: "TOMBSTONED",
      now: "2026-08-09T02:00:00.000Z",
    });

    await expect(
      store.appendRevision({
        id: revisionTwoId,
        documentId,
        ownerUserId: ownerA,
        baseRevisionId: revisionOneId,
        content: caseNoteContent(),
        mutationId: "document.revision:0002",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(
      store.transitionLifecycle({
        documentId,
        ownerUserId: ownerA,
        to: "PURGED",
        now: "2026-08-09T03:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      lifecycleStatus: "PURGED",
      tombstonedAt: "2026-08-09T02:00:00.000Z",
      purgedAt: "2026-08-09T03:00:00.000Z",
    });
  });

  it("hashes equivalent object key order identically", () => {
    const first = caseNoteContent();
    const facts = createValidCaresLinkV1CleanedFacts("ndis");
    const second: CaresLinkV1NoteContent = {
      ...first,
      factsSummary: {
        occurred_at: facts.occurred_at,
        support_type: facts.support_type,
        support_delivered: facts.support_delivered,
        observable_facts: facts.observable_facts,
        action_taken: facts.action_taken,
        provided_goal_context: facts.provided_goal_context,
      },
    };
    const reordered: CaresLinkV1NoteContent = {
      ...first,
      factsSummary: {
        provided_goal_context: facts.provided_goal_context,
        action_taken: facts.action_taken,
        observable_facts: facts.observable_facts,
        support_delivered: facts.support_delivered,
        support_type: facts.support_type,
        occurred_at: facts.occurred_at,
      },
    };

    expect(createCanonicalContentHash(second)).toBe(
      createCanonicalContentHash(reordered),
    );
  });
});

async function storeWithFirstRevision() {
  const store = createMemoryCanonicalDocumentShadowStore();
  await store.createDocument({
    id: documentId,
    ownerUserId: ownerA,
    noteType: "ndis",
    sourceLocale: "en",
    mutationId: "document.create:0001",
    now,
  });
  await store.appendRevision({
    id: revisionOneId,
    documentId,
    ownerUserId: ownerA,
    content: caseNoteContent(),
    mutationId: "document.revision:0001",
    now,
  });
  return store;
}

function caseNoteContent(
  observableFact = "The participant requested a short seated break.",
): CaresLinkV1NoteContent {
  const factsSummary = createValidCaresLinkV1CleanedFacts("ndis");
  factsSummary.observable_facts = observableFact;
  return {
    englishDraft: observableFact,
    reviewVersions: {
      "zh-Hans": "参与者提出短暂坐下休息。",
      "zh-Hant": "參與者提出短暫坐下休息。",
    },
    factsSummary,
    missingFacts: [],
    neutralWordingChecks: [],
    followUpPrompts: [],
    disclaimer: "Draft - review required. General documentation support only.",
  };
}
