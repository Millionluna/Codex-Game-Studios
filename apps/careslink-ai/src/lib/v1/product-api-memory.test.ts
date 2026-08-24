import { describe, expect, it } from "vitest";
import {
  CaresLinkV1ProductApiError,
  createCaresLinkV1CleanedFactsHash,
  createCaresLinkV1ProductApiContentHash,
  createMemoryCaresLinkV1ProductApiStore,
} from "./product-api-memory";
import {
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
} from "./shared-contracts";
import type {
  CaresLinkV1AuthenticatedPrincipal,
  CaresLinkV1CreateDocumentRequest,
  CaresLinkV1SaveCheckpointRequest,
} from "./transport-contract";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOCUMENT_ONE = "10000000-0000-4000-8000-000000000001";
const DOCUMENT_TWO = "10000000-0000-4000-8000-000000000002";
const DOCUMENT_THREE = "10000000-0000-4000-8000-000000000003";
const DOCUMENT_FOUR = "10000000-0000-4000-8000-000000000004";
const REVISION_ONE = "20000000-0000-4000-8000-000000000001";
const REVISION_TWO = "20000000-0000-4000-8000-000000000002";
const REVISION_THREE = "20000000-0000-4000-8000-000000000003";
const REVISION_FOUR = "20000000-0000-4000-8000-000000000004";
const PRIVACY_REVIEW_ID = "30000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-08-10T01:00:00.000Z";

describe("CaresLink V1 memory Product API", () => {
  it("atomically creates a canonical document and first acknowledged revision", async () => {
    const store = deterministicStore([DOCUMENT_ONE, REVISION_ONE]);
    const api = store.forPrincipal(principal(OWNER_A, SESSION_A));
    const request = createRequest();

    const result = await api.createDocument(request, {
      idempotencyKey: "mutation:create:0001",
    });

    expect(store.kind).toBe("memory-shadow");
    expect(result).toMatchObject({
      document: {
        canonicalId: DOCUMENT_ONE,
        currentRevisionId: REVISION_ONE,
        currentRevisionNumber: 1,
        lifecycleStatus: "IN_PROGRESS",
      },
      revision: {
        revisionId: REVISION_ONE,
        canonicalId: DOCUMENT_ONE,
        revisionNumber: 1,
        baseRevisionId: null,
        contentHash: request.contentHash,
        mutationId: "mutation:create:0001",
      },
      saveState: "SERVER_ACKNOWLEDGED",
      lastMutationId: "mutation:create:0001",
      serverTime: CREATED_AT,
    });
    await expect(api.getDocument(DOCUMENT_ONE)).resolves.toMatchObject({
      document: { currentRevisionNumber: 1 },
      revisions: [{ revisionId: REVISION_ONE }],
      checkpoint: null,
    });
    await expect(api.pullChanges()).resolves.toMatchObject({
      changes: [
        {
          kind: "DOCUMENT_UPSERTED",
          canonicalId: DOCUMENT_ONE,
          noteType: "ndis",
          revision: { revisionId: REVISION_ONE },
          deletedAt: null,
        },
      ],
      nextCursor: "sync.v1:1",
      hasMore: false,
    });
    await expect(api.pullChanges({ cursor: "sync.v1:0" })).resolves.toMatchObject(
      {
        changes: [{ canonicalId: DOCUMENT_ONE }],
        nextCursor: "sync.v1:1",
      },
    );
  });

  it("replays identical create input once and rejects changed input under the same key", async () => {
    const store = deterministicStore([DOCUMENT_ONE, REVISION_ONE]);
    const api = store.forPrincipal(principal(OWNER_A, SESSION_A));
    const request = createRequest();
    const mutation = { idempotencyKey: "mutation:create:0001" } as const;

    const first = await api.createDocument(request, mutation);
    const replay = await api.createDocument(request, mutation);

    expect(replay).toEqual(first);
    await expect(api.listDocuments()).resolves.toMatchObject({
      documents: [{ canonicalId: DOCUMENT_ONE }],
    });
    await expect(api.pullChanges()).resolves.toMatchObject({
      changes: [{ lastMutationId: mutation.idempotencyKey }],
      nextCursor: "sync.v1:1",
    });

    await expect(
      api.createDocument(
        createRequest("Different factual wording."),
        mutation,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      api.saveCheckpoint(
        DOCUMENT_ONE,
        {
          baseRevisionId: REVISION_ONE,
          currentStep: "facts",
          completedFieldCodes: [],
        },
        mutation,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("requires a valid privacy review UUID for create and append at the memory boundary", async () => {
    const store = deterministicStore([
      DOCUMENT_ONE,
      REVISION_ONE,
      REVISION_TWO,
    ]);
    const api = store.forPrincipal(principal(OWNER_A, SESSION_A));

    await expect(
      api.createDocument(
        { ...createRequest(), privacyReviewId: undefined as never },
        { idempotencyKey: "mutation:create:missing-proof" },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_REQUIRED" });
    await expect(
      api.createDocument(
        { ...createRequest(), privacyReviewId: "not-a-uuid" },
        { idempotencyKey: "mutation:create:invalid-proof" },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const created = await api.createDocument(createRequest(), {
      idempotencyKey: "mutation:create:valid-proof",
    });
    expect(created.revision.privacyReviewId).toBe(PRIVACY_REVIEW_ID);

    await expect(
      api.appendDocumentRevision(
        DOCUMENT_ONE,
        {
          baseRevisionId: REVISION_ONE,
          ...revisionContent("Missing proof."),
          privacyReviewId: undefined as never,
        },
        { idempotencyKey: "mutation:append:missing-proof" },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_REQUIRED" });
    await expect(
      api.appendDocumentRevision(
        DOCUMENT_ONE,
        {
          baseRevisionId: REVISION_ONE,
          ...revisionContent("Invalid proof."),
          privacyReviewId: "not-a-uuid",
        },
        { idempotencyKey: "mutation:append:invalid-proof" },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const appended = await api.appendDocumentRevision(
      DOCUMENT_ONE,
      {
        baseRevisionId: REVISION_ONE,
        ...revisionContent("Valid proof."),
      },
      { idempotencyKey: "mutation:append:valid-proof" },
    );
    expect(appended.revision.privacyReviewId).toBe(PRIVACY_REVIEW_ID);
  });

  it("enforces the closed cleaned-facts and schema-version boundaries before persistence", async () => {
    const api = deterministicStore([DOCUMENT_ONE, REVISION_ONE]).forPrincipal(
      principal(OWNER_A, SESSION_A),
    );
    const missing = createRequest();
    delete (missing.content.factsSummary as Record<string, unknown>)
      .action_taken;
    missing.contentHash = createCaresLinkV1ProductApiContentHash(
      missing.content,
    );
    await expect(
      api.createDocument(missing, {
        idempotencyKey: "mutation:create:missing-facts",
      }),
    ).rejects.toMatchObject({ code: "MINIMUM_FACTS_REQUIRED" });

    const unknown = createRequest();
    (unknown.content.factsSummary as Record<string, unknown>)["Jane Smith"] =
      "worker@example.test";
    unknown.contentHash = createCaresLinkV1ProductApiContentHash(
      unknown.content,
    );
    let error: unknown;
    try {
      await api.createDocument(unknown, {
        idempotencyKey: "mutation:create:unknown-facts",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(JSON.stringify(error)).not.toContain("Jane");
    expect(JSON.stringify(error)).not.toContain("worker@example.test");

    await expect(
      api.createDocument(
        {
          ...createRequest(),
          schemaVersion: "future-schema" as never,
        },
        { idempotencyKey: "mutation:create:future-schema" },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns current revision details when a concurrent append uses a stale base", async () => {
    const store = deterministicStore([DOCUMENT_ONE, REVISION_ONE]);
    const api = store.forPrincipal(principal(OWNER_A, SESSION_A));
    await api.createDocument(createRequest(), {
      idempotencyKey: "mutation:create:0001",
    });

    await expect(
      api.appendDocumentRevision(
        DOCUMENT_ONE,
        {
          baseRevisionId: REVISION_TWO,
          ...revisionContent("A concurrent update."),
        },
        { idempotencyKey: "mutation:append:0001" },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "STALE_REVISION",
        conflict: {
          canonicalId: DOCUMENT_ONE,
          currentRevisionId: REVISION_ONE,
          currentRevisionNumber: 1,
        },
      }),
    );
    await expect(api.getDocument(DOCUMENT_ONE)).resolves.toMatchObject({
      document: { currentRevisionId: REVISION_ONE, currentRevisionNumber: 1 },
      revisions: [{ revisionId: REVISION_ONE }],
    });
  });

  it("isolates documents, change feeds, and idempotency receipts by server owner", async () => {
    const store = deterministicStore([
      DOCUMENT_ONE,
      REVISION_ONE,
      DOCUMENT_TWO,
      REVISION_TWO,
    ]);
    const ownerA = store.forPrincipal(principal(OWNER_A, SESSION_A));
    const ownerB = store.forPrincipal(principal(OWNER_B, SESSION_B));
    const mutation = { idempotencyKey: "mutation:create:shared" } as const;

    await ownerA.createDocument(createRequest("Owner A fact."), mutation);

    await expect(ownerB.listDocuments()).resolves.toEqual({
      documents: [],
      nextCursor: null,
      hasMore: false,
    });
    await expect(ownerB.pullChanges()).resolves.toEqual({
      changes: [],
      nextCursor: null,
      hasMore: false,
    });
    await expect(ownerB.getDocument(DOCUMENT_ONE)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      ownerB.appendDocumentRevision(
        DOCUMENT_ONE,
        {
          baseRevisionId: REVISION_ONE,
          ...revisionContent("Owner B must not write this."),
        },
        { idempotencyKey: "mutation:append:owner-b" },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const ownerBDocument = await ownerB.createDocument(
      createRequest("Owner B fact."),
      mutation,
    );
    expect(ownerBDocument.document.canonicalId).toBe(DOCUMENT_TWO);
    await expect(ownerA.listDocuments()).resolves.toMatchObject({
      documents: [{ canonicalId: DOCUMENT_ONE }],
    });
    await expect(ownerB.listDocuments()).resolves.toMatchObject({
      documents: [{ canonicalId: DOCUMENT_TWO }],
    });
  });

  it("binds document and globally sequenced sync cursors to their server owner", async () => {
    const store = deterministicStore([
      DOCUMENT_ONE,
      REVISION_ONE,
      DOCUMENT_TWO,
      REVISION_TWO,
      DOCUMENT_THREE,
      REVISION_THREE,
      DOCUMENT_FOUR,
      REVISION_FOUR,
    ]);
    const ownerA = store.forPrincipal(principal(OWNER_A, SESSION_A));
    const ownerB = store.forPrincipal(principal(OWNER_B, SESSION_B));

    await ownerA.createDocument(createRequest("Owner A first."), {
      idempotencyKey: "mutation:create:owner-a:1",
    });
    await ownerB.createDocument(createRequest("Owner B first."), {
      idempotencyKey: "mutation:create:owner-b:1",
    });
    await ownerA.createDocument(createRequest("Owner A second."), {
      idempotencyKey: "mutation:create:owner-a:2",
    });
    await ownerB.createDocument(createRequest("Owner B second."), {
      idempotencyKey: "mutation:create:owner-b:2",
    });

    const ownerADocuments = await ownerA.listDocuments({ limit: 1 });
    const ownerBDocuments = await ownerB.listDocuments({ limit: 1 });
    expect(ownerADocuments.nextCursor).toBe(`document.v1:${DOCUMENT_ONE}`);
    expect(ownerBDocuments.nextCursor).toBe(`document.v1:${DOCUMENT_TWO}`);
    await expect(
      ownerB.listDocuments({ cursor: ownerADocuments.nextCursor ?? undefined }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      ownerA.listDocuments({ cursor: ownerBDocuments.nextCursor ?? undefined }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      ownerA.listDocuments({ cursor: "document.v1:not-a-uuid" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const ownerAChanges = await ownerA.pullChanges({ limit: 1 });
    const ownerBChanges = await ownerB.pullChanges({ limit: 1 });
    expect(ownerAChanges.nextCursor).toBe("sync.v1:1");
    expect(ownerBChanges.nextCursor).toBe("sync.v1:2");
    await expect(
      ownerB.pullChanges({ cursor: ownerAChanges.nextCursor ?? undefined }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      ownerA.pullChanges({ cursor: ownerBChanges.nextCursor ?? undefined }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      ownerA.pullChanges({ cursor: "sync.v1:999" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      ownerA.pullChanges({ cursor: "sync.v1:1", limit: 1 }),
    ).resolves.toMatchObject({
      changes: [{ canonicalId: DOCUMENT_THREE }],
      nextCursor: "sync.v1:3",
    });
    await expect(
      ownerB.pullChanges({ cursor: "sync.v1:2", limit: 1 }),
    ).resolves.toMatchObject({
      changes: [{ canonicalId: DOCUMENT_FOUR }],
      nextCursor: "sync.v1:4",
    });
  });

  it("stores a normalized checkpoint, replays it once, and rejects changed replay input", async () => {
    const store = deterministicStore([DOCUMENT_ONE, REVISION_ONE]);
    const api = store.forPrincipal(principal(OWNER_A, SESSION_A));
    await api.createDocument(createRequest(), {
      idempotencyKey: "mutation:create:0001",
    });
    const request: CaresLinkV1SaveCheckpointRequest = {
      baseRevisionId: REVISION_ONE,
      activeRevisionId: REVISION_ONE,
      currentStep: "result_review",
      completedFieldCodes: ["support", "facts", "support"],
    };
    const mutation = { idempotencyKey: "mutation:checkpoint:0001" } as const;

    const first = await api.saveCheckpoint(DOCUMENT_ONE, request, mutation);
    const replay = await api.saveCheckpoint(DOCUMENT_ONE, request, mutation);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      checkpoint: {
        canonicalId: DOCUMENT_ONE,
        activeRevisionId: REVISION_ONE,
        completedFieldCodes: ["facts", "support"],
        syncStatus: "SERVER_ACKNOWLEDGED",
      },
      saveState: "SERVER_ACKNOWLEDGED",
    });
    await expect(api.pullChanges()).resolves.toMatchObject({
      changes: [
        { lastMutationId: "mutation:create:0001" },
        { lastMutationId: "mutation:checkpoint:0001" },
      ],
      nextCursor: "sync.v1:2",
    });
    await expect(
      api.saveCheckpoint(
        DOCUMENT_ONE,
        {
          ...request,
          completedFieldCodes: ["facts", "support"],
        },
        mutation,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      api.saveCheckpoint(
        DOCUMENT_ONE,
        { ...request, currentStep: "complete" },
        mutation,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("validates checkpoint short codes, cardinality, and optional UUIDs in memory", async () => {
    const store = deterministicStore([DOCUMENT_ONE, REVISION_ONE]);
    const api = store.forPrincipal(principal(OWNER_A, SESSION_A));
    await api.createDocument(createRequest(), {
      idempotencyKey: "mutation:create:checkpoint-validation",
    });
    const validRequest: CaresLinkV1SaveCheckpointRequest = {
      baseRevisionId: REVISION_ONE,
      currentStep: "facts",
      completedFieldCodes: ["facts"],
    };
    const invalidRequests: CaresLinkV1SaveCheckpointRequest[] = [
      { ...validRequest, currentStep: "Facts" },
      { ...validRequest, completedFieldCodes: ["facts", "Bad"] },
      {
        ...validRequest,
        completedFieldCodes: Array.from(
          { length: 257 },
          (_, index) => `field_${index}`,
        ),
      },
      { ...validRequest, activeRevisionId: "not-a-uuid" },
      { ...validRequest, privacyReviewId: "not-a-uuid" },
      { ...validRequest, generationJobId: "not-a-uuid" },
    ];

    for (const [index, request] of invalidRequests.entries()) {
      await expect(
        api.saveCheckpoint(DOCUMENT_ONE, request, {
          idempotencyKey: `mutation:checkpoint:invalid:${index}`,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });

  it("pages the ordered change feed and emits a terminal tombstone change", async () => {
    const store = deterministicStore([
      DOCUMENT_ONE,
      REVISION_ONE,
      DOCUMENT_TWO,
      REVISION_TWO,
      REVISION_THREE,
    ]);
    const api = store.forPrincipal(principal(OWNER_A, SESSION_A));
    const first = await api.createDocument(createRequest("First fact."), {
      idempotencyKey: "mutation:create:0001",
    });
    await api.createDocument(createRequest("Second fact."), {
      idempotencyKey: "mutation:create:0002",
    });

    const pageOne = await api.pullChanges({ limit: 1 });
    expect(pageOne).toMatchObject({
      changes: [{ canonicalId: DOCUMENT_ONE }],
      nextCursor: "sync.v1:1",
      hasMore: true,
    });
    await expect(
      api.pullChanges({ cursor: pageOne.nextCursor ?? undefined, limit: 1 }),
    ).resolves.toMatchObject({
      changes: [{ canonicalId: DOCUMENT_TWO }],
      nextCursor: "sync.v1:2",
      hasMore: false,
    });

    const appended = await api.appendDocumentRevision(
      DOCUMENT_ONE,
      {
        baseRevisionId: first.revision.revisionId,
        ...revisionContent("Edited first fact."),
      },
      { idempotencyKey: "mutation:append:0001" },
    );
    await api.tombstoneDocument(
      DOCUMENT_ONE,
      { baseRevisionId: appended.revision.revisionId, reasonCode: "user_delete" },
      { idempotencyKey: "mutation:tombstone:0001" },
    );

    const pageThree = await api.pullChanges({ cursor: "sync.v1:2", limit: 1 });
    expect(pageThree).toMatchObject({
      changes: [
        {
          kind: "DOCUMENT_UPSERTED",
          canonicalId: DOCUMENT_ONE,
          noteType: "ndis",
          revision: { revisionId: REVISION_THREE },
        },
      ],
      nextCursor: "sync.v1:3",
      hasMore: true,
    });
    const tombstonePage = await api.pullChanges({
      cursor: pageThree.nextCursor ?? undefined,
      limit: 1,
    });
    expect(tombstonePage).toMatchObject({
      changes: [
        {
          kind: "DOCUMENT_TOMBSTONED",
          canonicalId: DOCUMENT_ONE,
          noteType: "ndis",
          revision: { revisionId: REVISION_THREE },
          lastMutationId: "mutation:tombstone:0001",
          deletedAt: CREATED_AT,
        },
      ],
      nextCursor: "sync.v1:4",
      hasMore: false,
    });
    await expect(
      api.pullChanges({ cursor: tombstonePage.nextCursor ?? undefined }),
    ).resolves.toEqual({
      changes: [],
      nextCursor: "sync.v1:4",
      hasMore: false,
    });
    await expect(
      api.appendDocumentRevision(
        DOCUMENT_ONE,
        {
          baseRevisionId: REVISION_THREE,
          ...revisionContent("Write after tombstone."),
        },
        { idempotencyKey: "mutation:append:after-delete" },
      ),
    ).rejects.toBeInstanceOf(CaresLinkV1ProductApiError);
  });
});

function deterministicStore(ids: string[]) {
  const remainingIds = [...ids];
  return createMemoryCaresLinkV1ProductApiStore({
    createId() {
      const id = remainingIds.shift();
      if (!id) {
        throw new Error("The deterministic ID fixture was exhausted");
      }
      return id;
    },
    now: () => CREATED_AT,
    initialPrivacyProofs: [OWNER_A, OWNER_B].map((ownerUserId) => ({
      id: PRIVACY_REVIEW_ID,
      ownerUserId,
      noteType: "ndis" as const,
      cleanedFactsHash: createCaresLinkV1CleanedFactsHash(
        noteContent("seed").factsSummary,
      ),
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      status: "CONFIRMED" as const,
      scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
      reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
      findingDecisions: [],
      confirmedAt: CREATED_AT,
      expiresAt: "2026-08-10T02:00:00.000Z",
    })),
  });
}

function principal(
  userId: string,
  sessionId: string,
): CaresLinkV1AuthenticatedPrincipal {
  return { userId, sessionId, transport: "BEARER" };
}

function createRequest(englishDraft = "A factual support note.") {
  const content = noteContent(englishDraft);
  return {
    noteType: "ndis",
    sourceLocale: "en",
    content,
    contentHash: createCaresLinkV1ProductApiContentHash(content),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId: PRIVACY_REVIEW_ID,
  } satisfies CaresLinkV1CreateDocumentRequest;
}

function revisionContent(englishDraft: string) {
  const content = noteContent(englishDraft);
  return {
    content,
    contentHash: createCaresLinkV1ProductApiContentHash(content),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId: PRIVACY_REVIEW_ID,
  } as const;
}

function noteContent(englishDraft: string) {
  return {
    englishDraft,
    reviewVersions: { "zh-Hans": "事实记录。" },
    factsSummary: createValidCaresLinkV1CleanedFacts("ndis"),
    missingFacts: [],
    neutralWordingChecks: ["Uses observable wording"],
    followUpPrompts: [],
    disclaimer: "Review before use.",
  };
}
