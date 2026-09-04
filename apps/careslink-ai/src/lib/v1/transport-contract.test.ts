import { describe, expect, it } from "vitest";
import {
  CARESLINK_V1_AUTH_BOUNDARIES,
  CARESLINK_V1_CHANGE_KINDS,
  CARESLINK_V1_HEADER_NAMES,
  CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE,
  CARESLINK_V1_MOBILE_SAVE_STATES,
  CARESLINK_V1_MINIMUM_CLIENT_VERSION,
  CARESLINK_V1_MUTATION_KINDS,
  CARESLINK_V1_MUTATION_TRANSPORT_POLICY,
  CARESLINK_V1_PRODUCT_API_METHODS,
  CARESLINK_V1_PRODUCT_API_PATHS,
  CARESLINK_V1_SERVER_SAVE_ACK,
  CARESLINK_V1_SYNC_BOUNDARIES,
  CARESLINK_V1_TRANSPORT_IMPLEMENTATION_STATUS,
  assertCaresLinkV1ContentHash,
  createCaresLinkV1TransportError,
  normalizeCaresLinkV1PageLimit,
  type CaresLinkV1CreateDocumentRequest,
  type CaresLinkV1DocumentResource,
  type CaresLinkV1MobileAuthContext,
  type CaresLinkV1PointsResponse,
} from "./transport-contract";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
} from "./shared-contracts";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";

describe("CaresLink V1 transport contract", () => {
  it("stays explicitly local-durable and default-disabled", () => {
    expect(CARESLINK_V1_TRANSPORT_IMPLEMENTATION_STATUS).toBe(
      "DURABLE_ADAPTER_DEFAULT_DISABLED_SHADOW",
    );
  });

  it("freezes version, correlation, client and idempotency header names", () => {
    expect(CARESLINK_V1_MINIMUM_CLIENT_VERSION).toBe("1.0.0");
    expect(CARESLINK_V1_MUTATION_TRANSPORT_POLICY).toEqual({
      contentType: "application/json",
      cookieOrigin: "SAME_ORIGIN_HTTPS_REQUIRED",
      bearerOrigin: "NOT_REQUIRED",
    });
    expect(CARESLINK_V1_HEADER_NAMES).toEqual({
      authorization: "authorization",
      contractVersion: "x-careslink-contract-version",
      clientVersion: "x-careslink-client-version",
      minimumClientVersion: "x-careslink-min-client-version",
      correlationId: "x-correlation-id",
      idempotencyKey: "idempotency-key",
    });
  });

  it("freezes Product API paths and the four document mutation kinds", () => {
    expect(CARESLINK_V1_PRODUCT_API_PATHS).toEqual({
      me: "/v1/me",
      points: "/v1/points",
      documents: "/v1/documents",
      document: "/v1/documents/{documentId}",
      checkpoint: "/v1/documents/{documentId}/checkpoint",
      privacyReviews: "/v1/privacy-reviews",
      syncPull: "/v1/sync/pull",
      syncPush: "/v1/sync/push",
    });
    expect(CARESLINK_V1_PRODUCT_API_METHODS).toEqual({
      getMe: "GET",
      getPoints: "GET",
      confirmPrivacyReview: "POST",
      listDocuments: "GET",
      createDocument: "POST",
      getDocument: "GET",
      appendDocumentRevision: "PATCH",
      saveCheckpoint: "PUT",
      tombstoneDocument: "DELETE",
      pullChanges: "GET",
    });
    expect(CARESLINK_V1_MUTATION_KINDS).toEqual([
      "CREATE_DOCUMENT",
      "APPEND_REVISION",
      "SAVE_CHECKPOINT",
      "TOMBSTONE_DOCUMENT",
    ]);
    expect(CARESLINK_V1_CHANGE_KINDS).toEqual([
      "DOCUMENT_UPSERTED",
      "DOCUMENT_TOMBSTONED",
    ]);
  });

  it("keeps the Points read DTO owner-free and limited to the approved summary", () => {
    const notReady = {
      status: "NOT_READY",
      unit: "POINTS",
      serverTime: "2026-09-04T05:45:00.000Z",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    } satisfies CaresLinkV1PointsResponse;
    const available = {
      ...notReady,
      status: "AVAILABLE",
      availablePoints: 250,
      reservedPoints: 50,
    } satisfies CaresLinkV1PointsResponse;

    expect(notReady).toEqual({
      status: "NOT_READY",
      unit: "POINTS",
      serverTime: "2026-09-04T05:45:00.000Z",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    });
    expect(available).toEqual({
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: "2026-09-04T05:45:00.000Z",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      availablePoints: 250,
      reservedPoints: 50,
    });
    expect(JSON.stringify([notReady, available])).not.toMatch(
      /(?:owner|user|session|wallet|lot|reservation|ledger|source|reference|receipt|idempotency)/i,
    );
  });

  it("freezes sync push as an unserved PRD boundary without inventing a body", () => {
    expect(CARESLINK_V1_SYNC_BOUNDARIES.push).toEqual({
      path: "/v1/sync/push",
      method: "POST",
      availability: "NOT_IMPLEMENTED",
      served: false,
    });
  });

  it("keeps native PKCE, session, device and revoke APIs explicitly offline", () => {
    expect(Object.values(CARESLINK_V1_AUTH_BOUNDARIES)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availability: "NOT_IMPLEMENTED" }),
      ]),
    );
    expect(
      Object.values(CARESLINK_V1_AUTH_BOUNDARIES).every(
        (boundary) => boundary.availability === "NOT_IMPLEMENTED",
      ),
    ).toBe(true);
  });

  it("keeps access tokens in client memory and out of mutation bodies", () => {
    const auth: CaresLinkV1MobileAuthContext = {
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "session-a",
      accessToken: "token-only-for-authorization-header",
    };
    const body: CaresLinkV1CreateDocumentRequest = {
      noteType: "ndis",
      sourceLocale: "en",
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      content: noteContent(),
      contentHash: "a".repeat(64),
      privacyReviewId: "22222222-2222-4222-8222-222222222222",
    };

    expect(auth.accessToken).toBeTruthy();
    expect(body).not.toHaveProperty("accessToken");
    expect(body).not.toHaveProperty("authorization");
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("ownerUserId");
  });

  it("keeps owner identity out of transport document resources", () => {
    const document: CaresLinkV1DocumentResource = {
      canonicalId: "22222222-2222-4222-8222-222222222222",
      noteType: "ndis",
      sourceLocale: "en",
      lifecycleStatus: "IN_PROGRESS",
      currentRevisionId: null,
      currentRevisionNumber: 0,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      deletedAt: null,
    };

    expect(document).not.toHaveProperty("ownerId");
    expect(document).not.toHaveProperty("ownerUserId");
  });

  it("freezes Mobile save labels separately from the server acknowledgement", () => {
    expect(CARESLINK_V1_MOBILE_SAVE_STATES).toEqual([
      "SAVED_ON_DEVICE",
      "SYNCING",
      "SAVED_TO_CARESLINK",
      "NEEDS_ATTENTION",
    ]);
    expect(CARESLINK_V1_SERVER_SAVE_ACK).toBe("SERVER_ACKNOWLEDGED");
    expect(CARESLINK_V1_MOBILE_SAVE_STATES).not.toContain(
      CARESLINK_V1_SERVER_SAVE_ACK,
    );
  });

  it("validates lowercase SHA-256 hashes and bounded page limits", () => {
    expect(assertCaresLinkV1ContentHash("a".repeat(64))).toBe("a".repeat(64));
    expect(() => assertCaresLinkV1ContentHash("A".repeat(64))).toThrow(
      CaresLinkV1ContractError,
    );
    expect(normalizeCaresLinkV1PageLimit(undefined)).toBe(50);
    expect(normalizeCaresLinkV1PageLimit(100)).toBe(100);
    expect(() => normalizeCaresLinkV1PageLimit(101)).toThrow(
      CaresLinkV1ContractError,
    );
  });

  it("maps conflicts, disabled API, min client and unimplemented boundaries", () => {
    expect(CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE.STALE_REVISION).toBe(409);
    expect(CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE.IDEMPOTENCY_CONFLICT).toBe(
      409,
    );
    expect(CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE.PRODUCT_API_DISABLED).toBe(
      503,
    );
    expect(CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE.MIN_CLIENT_VERSION).toBe(426);
    expect(CARESLINK_V1_HTTP_STATUS_BY_ERROR_CODE.NOT_IMPLEMENTED).toBe(501);
  });

  it("requires one correlation id in every error envelope", () => {
    expect(
      createCaresLinkV1TransportError({
        code: "STALE_REVISION",
        message: "The base revision is stale",
        correlationId: "5f555e7a-6baf-4acd-8666-1c8b5df305ef",
        conflict: {
          canonicalId: "22222222-2222-4222-8222-222222222222",
          currentRevisionId: "33333333-3333-4333-8333-333333333333",
          currentRevisionNumber: 2,
        },
      }),
    ).toEqual({
      error: {
        code: "STALE_REVISION",
        message: "The base revision is stale",
        correlationId: "5f555e7a-6baf-4acd-8666-1c8b5df305ef",
        conflict: {
          canonicalId: "22222222-2222-4222-8222-222222222222",
          currentRevisionId: "33333333-3333-4333-8333-333333333333",
          currentRevisionNumber: 2,
        },
      },
    });
  });

  it("carries only locator metadata in a privacy-required error", () => {
    const envelope = createCaresLinkV1TransportError({
      code: "PRIVACY_REVIEW_REQUIRED",
      message: "Privacy review confirmation is required before upload",
      correlationId: "privacy.error:0001",
      privacyFindings: [
        {
          findingType: "email",
          fieldCode: "/contact",
          startOffset: 4,
          endOffset: 23,
        },
      ],
    });

    expect(envelope.error.privacyFindings).toEqual([
      {
        findingType: "email",
        fieldCode: "/contact",
        startOffset: 4,
        endOffset: 23,
      },
    ]);
    expect(JSON.stringify(envelope)).not.toMatch(/excerpt|matchedValue|rawText/);
  });
});

function noteContent() {
  return {
    englishDraft: "Support was provided.",
    reviewVersions: {},
    factsSummary: createValidCaresLinkV1CleanedFacts("ndis"),
    missingFacts: [],
    neutralWordingChecks: [],
    followUpPrompts: [],
    disclaimer: "Review before use.",
  };
}
