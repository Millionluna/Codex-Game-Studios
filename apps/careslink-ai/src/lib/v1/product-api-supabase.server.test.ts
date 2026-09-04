import { describe, expect, it, vi } from "vitest";

import {
  createCaresLinkV1CleanedFactsHash,
  createCaresLinkV1ProductApiContentHash,
} from "./product-api-memory";
import {
  CARESLINK_V1_SUPABASE_RPC_NAMES,
  createSupabaseCaresLinkV1ProductApi,
  type CaresLinkV1ServiceOnlyPrivacyReviewRpcClient,
  type CaresLinkV1SessionScopedSupabaseRpcClient,
  type CaresLinkV1SupabaseRpcResult,
} from "./product-api-supabase.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  type CaresLinkV1NoteContent,
} from "./shared-contracts";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOCUMENT_ID = "10000000-0000-4000-8000-000000000001";
const REVISION_ID = "20000000-0000-4000-8000-000000000001";
const REVISION_TWO_ID = "20000000-0000-4000-8000-000000000002";
const PRIVACY_REVIEW_ID = "30000000-0000-4000-8000-000000000001";
const GENERATION_JOB_ID = "40000000-0000-4000-8000-000000000001";
const CREATED_AT = "2026-08-11T01:00:00.000Z";
const UPDATED_AT = "2026-08-11T01:01:00.000Z";
const PRIVACY_EXPIRES_AT = "2026-08-11T01:30:00.000Z";
const ACCESS_TOKEN = "must-never-enter-adapter.jwt.value";

describe("CaresLink V1 session-scoped Supabase Product API", () => {
  it("builds getMe from the verified principal without an RPC or credential input", async () => {
    const { api, rpc } = createApi([]);

    await expect(api.getMe()).resolves.toEqual({
      userId: USER_ID,
      sessionId: SESSION_ID,
      authTransport: "BEARER",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      capabilities: {
        nativePkceCallback: false,
        sessionManagement: false,
        deviceManagement: false,
        sessionRevocation: false,
      },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(api)).not.toContain(ACCESS_TOKEN);
  });

  it("reads exact owner-free Points summaries through a zero-argument RPC", async () => {
    expect(CARESLINK_V1_SUPABASE_RPC_NAMES.getPoints).toBe(
      "get_v1_points_wallet",
    );
    const { api, rpc } = createApi([
      success({
        status: "NOT_READY",
        unit: "POINTS",
        serverTime: CREATED_AT,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      }),
      success({
        status: "AVAILABLE",
        unit: "POINTS",
        serverTime: UPDATED_AT,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        availablePoints: 250,
        reservedPoints: 50,
      }),
    ]);

    await expect(api.getPoints()).resolves.toEqual({
      status: "NOT_READY",
      unit: "POINTS",
      serverTime: CREATED_AT,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    });
    await expect(api.getPoints()).resolves.toEqual({
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: UPDATED_AT,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      availablePoints: 250,
      reservedPoints: 50,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      CARESLINK_V1_SUPABASE_RPC_NAMES.getPoints,
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      CARESLINK_V1_SUPABASE_RPC_NAMES.getPoints,
    );
  });

  it("fails Points reads closed on response drift, identifiers, and unsafe balances", async () => {
    const validAvailable = {
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: CREATED_AT,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      availablePoints: 250,
      reservedPoints: 50,
    };
    const invalidResponses = [
      { ...validAvailable, ownerUserId: USER_ID },
      { ...validAvailable, walletId: DOCUMENT_ID },
      { ...validAvailable, unit: "CREDITS" },
      { ...validAvailable, contractVersion: "future-contract" },
      { ...validAvailable, serverTime: "not-a-time" },
      { ...validAvailable, availablePoints: -1 },
      { ...validAvailable, availablePoints: 1.5 },
      { ...validAvailable, reservedPoints: Number.MAX_SAFE_INTEGER + 1 },
      {
        status: "AVAILABLE",
        unit: "POINTS",
        serverTime: CREATED_AT,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        availablePoints: 250,
      },
      {
        status: "NOT_READY",
        unit: "POINTS",
        serverTime: CREATED_AT,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        availablePoints: 0,
      },
      {
        status: "UNKNOWN",
        unit: "POINTS",
        serverTime: CREATED_AT,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      },
    ];

    for (const response of invalidResponses) {
      const { api } = createApi([success(response)]);
      await expect(api.getPoints()).rejects.toMatchObject({
        code: "PRODUCT_API_DISABLED",
      });
    }
  });

  it("uses the service-only client for privacy proof issuance without sending facts or tokens", async () => {
    const cleanedFacts = { support: "Observed assistance" };
    const cleanedFactsHash = createCaresLinkV1CleanedFactsHash(cleanedFacts);
    const submittedDecisions = [
      {
        findingType: "phone" as const,
        fieldCode: "/z",
        startOffset: 2,
        endOffset: 4,
        decision: "REMOVED" as const,
      },
      {
        findingType: "email" as const,
        fieldCode: "/a",
        startOffset: 8,
        endOffset: 12,
        decision: "REPLACED" as const,
      },
    ];
    const normalizedDecisions = [submittedDecisions[1], submittedDecisions[0]];
    const proof = privacyProof({
      cleanedFactsHash,
      findingDecisions: normalizedDecisions,
    });
    const privacyRpc = vi.fn(async () => success(proof));
    const primaryRpc = vi.fn();
    const api = createSupabaseCaresLinkV1ProductApi({
      client: { rpc: primaryRpc },
      privacyReviewClient: {
        rpc: privacyRpc,
      } as CaresLinkV1ServiceOnlyPrivacyReviewRpcClient,
      principal: principal(),
    });

    await expect(
      api.confirmPrivacyReview(
        {
          noteType: "progress",
          cleanedFactsHash,
          schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
          scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
          reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
          findingDecisions: submittedDecisions,
          deIdentificationConfirmed: true,
          authorityToProcessConfirmed: true,
        },
        { idempotencyKey: "privacy.confirm.0001" },
      ),
    ).resolves.toEqual(proof);

    expect(primaryRpc).not.toHaveBeenCalled();
    expect(privacyRpc).toHaveBeenCalledWith(
      CARESLINK_V1_SUPABASE_RPC_NAMES.confirmPrivacyReview,
      {
        p_owner_user_id: USER_ID,
        p_session_id: SESSION_ID,
        p_note_type: "progress",
        p_cleaned_facts_hash: cleanedFactsHash,
        p_schema_version: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
        p_scanner_policy_version: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
        p_review_revision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
        p_finding_decisions: normalizedDecisions,
        p_deidentification_confirmed: true,
        p_authority_to_process_confirmed: true,
        p_mutation_id: "privacy.confirm.0001",
      },
    );
    const serializedArgs = JSON.stringify(
      (
        privacyRpc.mock.calls as unknown as Array<
          [string, Record<string, unknown>]
        >
      )[0]?.[1],
    );
    expect(serializedArgs).not.toContain("Observed assistance");
    expect(serializedArgs).not.toContain(ACCESS_TOKEN);
    expect(serializedArgs).not.toContain("cleanedFacts\"");
  });

  it("fails closed when the privacy service client or proof response is unavailable", async () => {
    const command = {
      noteType: "progress" as const,
      cleanedFactsHash: createCaresLinkV1CleanedFactsHash({ support: "safe" }),
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
      reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
      findingDecisions: [],
      deIdentificationConfirmed: true as const,
      authorityToProcessConfirmed: true as const,
    };
    const withoutServiceClient = createApi([]).api;
    await expect(
      withoutServiceClient.confirmPrivacyReview(command, {
        idempotencyKey: "privacy.confirm.0001",
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });

    const drifted = createSupabaseCaresLinkV1ProductApi({
      client: { rpc: vi.fn() },
      privacyReviewClient: {
        rpc: vi.fn(async () =>
          success(privacyProof({ cleanedFactsHash: "a".repeat(64) })),
        ),
      } as CaresLinkV1ServiceOnlyPrivacyReviewRpcClient,
      principal: principal(),
    });
    await expect(
      drifted.confirmPrivacyReview(command, {
        idempotencyKey: "privacy.confirm.0002",
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });

    const wrongExpiry = createSupabaseCaresLinkV1ProductApi({
      client: { rpc: vi.fn() },
      privacyReviewClient: {
        rpc: vi.fn(async () =>
          success(
            privacyProof({
              cleanedFactsHash: command.cleanedFactsHash,
              expiresAt: UPDATED_AT,
            }),
          ),
        ),
      } as CaresLinkV1ServiceOnlyPrivacyReviewRpcClient,
      principal: principal(),
    });
    await expect(
      wrongExpiry.confirmPrivacyReview(command, {
        idempotencyKey: "privacy.confirm.0003",
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("maps list/get RPCs and keeps the document cursor adapter-owned", async () => {
    const { api, rpc } = createApi([
      success({
        documents: [document()],
        nextCursor: DOCUMENT_ID,
        hasMore: true,
      }),
      success({ documents: [], nextCursor: null, hasMore: false }),
      success({
        document: document(),
        revisions: [revision()],
        checkpoint: null,
        selfReviewStatus: "REQUIRED",
      }),
    ]);

    const firstPage = await api.listDocuments({ limit: 1 });
    expect(firstPage.nextCursor).toBe(`document.v1:${DOCUMENT_ID}`);
    await expect(
      api.listDocuments({ cursor: firstPage.nextCursor ?? undefined, limit: 1 }),
    ).resolves.toEqual({ documents: [], nextCursor: null, hasMore: false });
    await expect(api.getDocument(DOCUMENT_ID)).resolves.toMatchObject({
      document: { canonicalId: DOCUMENT_ID },
      revisions: [{ revisionId: REVISION_ID }],
      checkpoint: null,
    });

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      CARESLINK_V1_SUPABASE_RPC_NAMES.listDocuments,
      { p_after_document_id: null, p_limit: 1 },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      CARESLINK_V1_SUPABASE_RPC_NAMES.listDocuments,
      { p_after_document_id: DOCUMENT_ID, p_limit: 1 },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      CARESLINK_V1_SUPABASE_RPC_NAMES.getDocument,
      { p_document_id: DOCUMENT_ID },
    );
  });

  it("maps all mutation bodies to owner-free RPC arguments and full transport DTOs", async () => {
    const secondRevision = revision({
      revisionId: REVISION_TWO_ID,
      revisionNumber: 2,
      baseRevisionId: REVISION_ID,
      content: noteContent("A second factual revision."),
      contentHash: contentHash("A second factual revision."),
      mutationId: "mutation:append:0001",
      createdAt: UPDATED_AT,
    });
    const updatedDocument = document({
      currentRevisionId: REVISION_TWO_ID,
      currentRevisionNumber: 2,
      updatedAt: UPDATED_AT,
    });
    const checkpoint = checkpointResource();
    const tombstoned = document({
      currentRevisionId: REVISION_TWO_ID,
      currentRevisionNumber: 2,
      lifecycleStatus: "TOMBSTONED",
      updatedAt: UPDATED_AT,
      deletedAt: UPDATED_AT,
    });
    const { api, rpc } = createApi([
      success(createResponse()),
      success({
        document: updatedDocument,
        revision: secondRevision,
        saveState: "SERVER_ACKNOWLEDGED",
        lastMutationId: "mutation:append:0001",
        serverTime: UPDATED_AT,
      }),
      success({
        checkpoint,
        saveState: "SERVER_ACKNOWLEDGED",
        lastMutationId: "mutation:checkpoint:0001",
        serverTime: UPDATED_AT,
      }),
      success({
        document: tombstoned,
        saveState: "SERVER_ACKNOWLEDGED",
        lastMutationId: "mutation:tombstone:0001",
        serverTime: UPDATED_AT,
      }),
    ]);

    await expect(
      api.createDocument(createRequest(), {
        idempotencyKey: "mutation:create:0001",
      }),
    ).resolves.toEqual(createResponse());
    await expect(
      api.appendDocumentRevision(
        DOCUMENT_ID,
        {
          baseRevisionId: REVISION_ID,
          content: noteContent("A second factual revision."),
          contentHash: contentHash("A second factual revision."),
          schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
          privacyReviewId: PRIVACY_REVIEW_ID,
        },
        { idempotencyKey: "mutation:append:0001" },
      ),
    ).resolves.toMatchObject({ revision: { revisionId: REVISION_TWO_ID } });
    await expect(
      api.saveCheckpoint(
        DOCUMENT_ID,
        {
          baseRevisionId: REVISION_TWO_ID,
          currentStep: "result_review",
          completedFieldCodes: ["facts", "review", "facts"],
          activeRevisionId: REVISION_TWO_ID,
          privacyReviewId: PRIVACY_REVIEW_ID,
          generationJobId: GENERATION_JOB_ID,
        },
        { idempotencyKey: "mutation:checkpoint:0001" },
      ),
    ).resolves.toMatchObject({ checkpoint });
    await expect(
      api.tombstoneDocument(
        DOCUMENT_ID,
        { baseRevisionId: REVISION_TWO_ID, reasonCode: "user_requested" },
        { idempotencyKey: "mutation:tombstone:0001" },
      ),
    ).resolves.toMatchObject({
      document: { lifecycleStatus: "TOMBSTONED" },
    });

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      CARESLINK_V1_SUPABASE_RPC_NAMES.createDocument,
      {
        p_note_type: "progress",
        p_source_locale: "en",
        p_content: noteContent(),
        p_content_hash: contentHash(),
        p_mutation_id: "mutation:create:0001",
        p_schema_version: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
        p_privacy_review_id: PRIVACY_REVIEW_ID,
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      CARESLINK_V1_SUPABASE_RPC_NAMES.appendRevision,
      expect.objectContaining({
        p_document_id: DOCUMENT_ID,
        p_base_revision_id: REVISION_ID,
        p_mutation_id: "mutation:append:0001",
        p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      CARESLINK_V1_SUPABASE_RPC_NAMES.saveCheckpoint,
      {
        p_document_id: DOCUMENT_ID,
        p_base_revision_id: REVISION_TWO_ID,
        p_current_step: "result_review",
        p_completed_field_codes: ["facts", "review", "facts"],
        p_mutation_id: "mutation:checkpoint:0001",
        p_active_revision_id: REVISION_TWO_ID,
        p_privacy_review_id: PRIVACY_REVIEW_ID,
        p_generation_job_id: GENERATION_JOB_ID,
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      4,
      CARESLINK_V1_SUPABASE_RPC_NAMES.tombstoneDocument,
      {
        p_document_id: DOCUMENT_ID,
        p_base_revision_id: REVISION_TWO_ID,
        p_reason_code: "user_requested",
        p_mutation_id: "mutation:tombstone:0001",
      },
    );
    const serializedArgs = JSON.stringify(rpc.mock.calls.map((call) => call[1]));
    expect(serializedArgs).not.toContain("owner");
    expect(serializedArgs).not.toContain("userId");
    expect(serializedArgs).not.toContain("sessionId");
    expect(serializedArgs).not.toContain(ACCESS_TOKEN);
  });

  it("wraps and validates the numeric database change cursor", async () => {
    const { api, rpc } = createApi([
      success({
        changes: [
          {
            kind: "DOCUMENT_UPSERTED",
            canonicalId: DOCUMENT_ID,
            noteType: "progress",
            revision: revision(),
            lastMutationId: "mutation:create:0001",
            serverTime: CREATED_AT,
            deletedAt: null,
          },
        ],
        nextCursor: "42",
        hasMore: true,
      }),
      success({ changes: [], nextCursor: "42", hasMore: false }),
    ]);

    const first = await api.pullChanges({ limit: 1 });
    expect(first.nextCursor).toBe("sync.v1:42");
    await expect(
      api.pullChanges({ cursor: first.nextCursor ?? undefined, limit: 50 }),
    ).resolves.toEqual({
      changes: [],
      nextCursor: "sync.v1:42",
      hasMore: false,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      CARESLINK_V1_SUPABASE_RPC_NAMES.pullChanges,
      { p_after_change_id: "0", p_limit: 1 },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      CARESLINK_V1_SUPABASE_RPC_NAMES.pullChanges,
      { p_after_change_id: "42", p_limit: 50 },
    );
  });

  it("fails closed when a pulled revision does not match the change Note type", async () => {
    const crossTypeContent = {
      ...noteContent(),
      factsSummary: createValidCaresLinkV1CleanedFacts("communication"),
    };
    const api = createApi([
      success({
        changes: [
          {
            kind: "DOCUMENT_UPSERTED",
            canonicalId: DOCUMENT_ID,
            noteType: "progress",
            revision: revision({
              content: crossTypeContent,
              contentHash:
                createCaresLinkV1ProductApiContentHash(crossTypeContent),
            }),
            lastMutationId: "mutation:create:0001",
            serverTime: CREATED_AT,
            deletedAt: null,
          },
        ],
        nextCursor: "1",
        hasMore: false,
      }),
    ]).api;

    await expect(api.pullChanges()).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
  });

  it.each([
    ["SESSION_REVOKED", "SESSION_REVOKED"],
    ["NOT_FOUND", "NOT_FOUND"],
    ["IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
    ["INVALID_STATE_TRANSITION", "INVALID_STATE_TRANSITION"],
    ["MINIMUM_FACTS_REQUIRED", "MINIMUM_FACTS_REQUIRED"],
    ["MIN_CLIENT_VERSION", "MIN_CLIENT_VERSION"],
    ["PRIVACY_REVIEW_REQUIRED", "PRIVACY_REVIEW_REQUIRED"],
    ["PRIVACY_REVIEW_STALE", "PRIVACY_REVIEW_STALE"],
    ["VALIDATION_ERROR", "VALIDATION_ERROR"],
  ])("maps the %s database error without exposing database detail", async (message, code) => {
    const { api } = createApi([
      failure({ code: "P0001", message, details: "private database detail" }),
    ]);

    await expect(api.listDocuments()).rejects.toMatchObject({ code });
  });

  it("maps stale revision details only when their complete shape is trustworthy", async () => {
    const { api } = createApi([
      failure({
        code: "P0001",
        message: "STALE_REVISION",
        details: JSON.stringify({
          canonicalId: DOCUMENT_ID,
          currentRevisionId: REVISION_ID,
          currentRevisionNumber: 1,
        }),
      }),
    ]);

    await expect(api.listDocuments()).rejects.toMatchObject({
      code: "STALE_REVISION",
      conflict: {
        canonicalId: DOCUMENT_ID,
        currentRevisionId: REVISION_ID,
        currentRevisionNumber: 1,
      },
    });
  });

  it("maps withheld grants to FORBIDDEN and unknown failures to a closed adapter", async () => {
    const forbidden = createApi([
      failure({ code: "42501", message: "permission denied for function" }),
    ]).api;
    await expect(forbidden.listDocuments()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const unavailable = createApi([
      failure({
        code: "XX999",
        message: `unknown backend error ${ACCESS_TOKEN}`,
        details: ACCESS_TOKEN,
      }),
    ]).api;
    const error = await unavailable.listDocuments().catch((caught) => caught);
    expect(error).toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(String(error)).not.toContain(ACCESS_TOKEN);
  });

  it("requires the frozen privacy proof before either note-content upload RPC", async () => {
    const { api, rpc } = createApi([]);
    const missingProof = {
      ...createRequest(),
      privacyReviewId: undefined as never,
    };

    await expect(
      api.createDocument(missingProof, {
        idempotencyKey: "mutation:create:privacy-missing",
      }),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_REQUIRED" });
    await expect(
      api.appendDocumentRevision(
        DOCUMENT_ID,
        {
          baseRevisionId: REVISION_ID,
          content: noteContent("Reviewed edit."),
          contentHash: contentHash("Reviewed edit."),
          schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
          privacyReviewId: undefined as never,
        },
        { idempotencyKey: "mutation:append:privacy-missing" },
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_REQUIRED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects non-first create ACKs, mismatched checkpoints and regressing sync cursors", async () => {
    const invalidCreate = createApi([
      success({
        ...createResponse(),
        document: document({
          currentRevisionId: REVISION_TWO_ID,
          currentRevisionNumber: 2,
        }),
        revision: revision({
          revisionId: REVISION_TWO_ID,
          revisionNumber: 2,
          baseRevisionId: REVISION_ID,
        }),
      }),
    ]).api;
    await expect(
      invalidCreate.createDocument(createRequest(), {
        idempotencyKey: "mutation:create:0001",
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });

    const invalidCheckpoint = createApi([
      success({
        checkpoint: { ...checkpointResource(), currentStep: "facts_review" },
        saveState: "SERVER_ACKNOWLEDGED",
        lastMutationId: "mutation:checkpoint:0001",
        serverTime: UPDATED_AT,
      }),
    ]).api;
    await expect(
      invalidCheckpoint.saveCheckpoint(
        DOCUMENT_ID,
        {
          baseRevisionId: REVISION_TWO_ID,
          currentStep: "result_review",
          completedFieldCodes: ["facts", "review"],
          activeRevisionId: REVISION_TWO_ID,
          privacyReviewId: PRIVACY_REVIEW_ID,
          generationJobId: GENERATION_JOB_ID,
        },
        { idempotencyKey: "mutation:checkpoint:0001" },
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });

    const regressingSync = createApi([
      success({
        changes: [
          {
            kind: "DOCUMENT_UPSERTED",
            canonicalId: DOCUMENT_ID,
            noteType: "progress",
            revision: revision(),
            lastMutationId: "mutation:create:0001",
            serverTime: CREATED_AT,
            deletedAt: null,
          },
        ],
        nextCursor: "41",
        hasMore: false,
      }),
    ]).api;
    await expect(
      regressingSync.pullChanges({ cursor: "sync.v1:42" }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("fails closed on extra owner data, bad hashes, malformed DTOs, and wrong cursor kinds", async () => {
    const leakedDocument = { ...document(), ownerUserId: USER_ID };
    const leaked = createApi([
      success({ documents: [leakedDocument], nextCursor: null, hasMore: false }),
    ]).api;
    await expect(leaked.listDocuments()).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });

    const malformed = createApi([
      success({ documents: [], nextCursor: null }),
    ]).api;
    await expect(malformed.listDocuments()).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });

    const { api, rpc } = createApi([]);
    await expect(
      api.listDocuments({ cursor: "sync.v1:42" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      api.pullChanges({ cursor: "document.v1:42" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      api.createDocument(
        { ...createRequest(), contentHash: "0".repeat(64) },
        { idempotencyKey: "mutation:create:0001" },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const invalidFactsRequest = createRequest();
    Reflect.set(invalidFactsRequest.content, "factsSummary", {
      ...createValidCaresLinkV1CleanedFacts("progress"),
      "Jane Smith": "worker@example.test",
    });
    const invalidFactsError = await api
      .createDocument(invalidFactsRequest, {
        idempotencyKey: "mutation:create:0002",
      })
      .catch((error) => error);
    expect(invalidFactsError).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(JSON.stringify(invalidFactsError)).not.toContain("Jane");
    expect(JSON.stringify(invalidFactsError)).not.toContain(
      "worker@example.test",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a revision ACK whose cleaned facts do not match its document Note type", async () => {
    const crossTypeContent = {
      ...noteContent(),
      factsSummary: createValidCaresLinkV1CleanedFacts("communication"),
    };
    const crossTypeRevision = revision({
      content: crossTypeContent,
      contentHash: createCaresLinkV1ProductApiContentHash(crossTypeContent),
    });
    const api = createApi([
      success({
        document: document(),
        revisions: [crossTypeRevision],
        checkpoint: null,
        selfReviewStatus: "REQUIRED",
      }),
    ]).api;

    await expect(api.getDocument(DOCUMENT_ID)).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
  });

  it("fails closed when the RPC rejects or returns no data", async () => {
    const rejectedClient: CaresLinkV1SessionScopedSupabaseRpcClient = {
      rpc: vi.fn(async () => {
        throw new Error(`transport failed ${ACCESS_TOKEN}`);
      }),
    };
    const rejected = createSupabaseCaresLinkV1ProductApi({
      client: rejectedClient,
      principal: principal(),
    });
    const rejectedError = await rejected.listDocuments().catch((error) => error);
    expect(rejectedError).toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(String(rejectedError)).not.toContain(ACCESS_TOKEN);

    const missing = createApi([success(null)]).api;
    await expect(missing.listDocuments()).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
  });
});

function createApi(results: CaresLinkV1SupabaseRpcResult[]) {
  const queue = [...results];
  const rpc = vi.fn(
    async (
      functionName: string,
      args?: Readonly<Record<string, unknown>>,
    ) => {
      void functionName;
      void args;
      const next = queue.shift();
      if (!next) {
        throw new Error("Unexpected RPC call");
      }
      return next;
    },
  );
  const client: CaresLinkV1SessionScopedSupabaseRpcClient = { rpc };
  return {
    api: createSupabaseCaresLinkV1ProductApi({ client, principal: principal() }),
    rpc,
  };
}

function principal() {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    transport: "BEARER" as const,
  };
}

function success(data: unknown): CaresLinkV1SupabaseRpcResult {
  return { data, error: null };
}

function failure(
  error: NonNullable<CaresLinkV1SupabaseRpcResult["error"]>,
): CaresLinkV1SupabaseRpcResult {
  return { data: null, error };
}

function noteContent(
  englishDraft = "Only observable facts are recorded.",
): CaresLinkV1NoteContent {
  return {
    englishDraft,
    reviewVersions: {},
    factsSummary: createValidCaresLinkV1CleanedFacts("progress"),
    missingFacts: [],
    neutralWordingChecks: ["No inferred outcome"],
    followUpPrompts: [],
    disclaimer: "Review before use.",
  };
}

function privacyProof(overrides: Record<string, unknown> = {}) {
  return {
    id: PRIVACY_REVIEW_ID,
    ownerUserId: USER_ID,
    noteType: "progress",
    cleanedFactsHash: createCaresLinkV1CleanedFactsHash(
      createValidCaresLinkV1CleanedFacts("progress"),
    ),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    status: "CONFIRMED",
    scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
    reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
    findingDecisions: [],
    confirmedAt: CREATED_AT,
    expiresAt: PRIVACY_EXPIRES_AT,
    ...overrides,
  };
}

function contentHash(englishDraft?: string) {
  return createCaresLinkV1ProductApiContentHash(noteContent(englishDraft));
}

function createRequest() {
  return {
    noteType: "progress" as const,
    sourceLocale: "en" as const,
    content: noteContent(),
    contentHash: contentHash(),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId: PRIVACY_REVIEW_ID,
  };
}

function document(overrides: Record<string, unknown> = {}) {
  return {
    canonicalId: DOCUMENT_ID,
    noteType: "progress",
    sourceLocale: "en",
    lifecycleStatus: "IN_PROGRESS",
    currentRevisionId: REVISION_ID,
    currentRevisionNumber: 1,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  };
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    revisionId: REVISION_ID,
    canonicalId: DOCUMENT_ID,
    revisionNumber: 1,
    baseRevisionId: null,
    privacyReviewId: PRIVACY_REVIEW_ID,
    content: noteContent(),
    contentHash: contentHash(),
    mutationId: "mutation:create:0001",
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function checkpointResource() {
  return {
    canonicalId: DOCUMENT_ID,
    baseRevisionId: REVISION_TWO_ID,
    currentStep: "result_review",
    completedFieldCodes: ["facts", "review"],
    activeRevisionId: REVISION_TWO_ID,
    privacyReviewId: PRIVACY_REVIEW_ID,
    generationJobId: GENERATION_JOB_ID,
    syncStatus: "SERVER_ACKNOWLEDGED",
    mutationId: "mutation:checkpoint:0001",
    updatedAt: UPDATED_AT,
  };
}

function createResponse() {
  return {
    document: document(),
    revision: revision(),
    saveState: "SERVER_ACKNOWLEDGED",
    lastMutationId: "mutation:create:0001",
    serverTime: CREATED_AT,
  };
}
