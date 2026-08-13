import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleCaresLinkV1AppendRevision,
  handleCaresLinkV1CreateDocument,
  handleCaresLinkV1GetMe,
  handleCaresLinkV1ListDocuments,
  handleCaresLinkV1PullChanges,
  handleCaresLinkV1SaveCheckpoint,
  handleCaresLinkV1TombstoneDocument,
  type CaresLinkV1ProductApiRouteDependencies,
} from "./product-api-route.server";
import {
  createCaresLinkV1ProductApiContentHash,
  createCaresLinkV1CleanedFactsHash,
  createMemoryCaresLinkV1ProductApiStore,
  type CaresLinkV1MemoryProductApiStore,
} from "./product-api-memory";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
} from "./shared-contracts";
import {
  CARESLINK_V1_HEADER_NAMES,
  CARESLINK_V1_MINIMUM_CLIENT_VERSION,
} from "./transport-contract";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOCUMENT_ID = "10000000-0000-4000-8000-000000000001";
const REVISION_ID = "20000000-0000-4000-8000-000000000001";
const PRIVACY_REVIEW_ID = "30000000-0000-4000-8000-000000000001";
const STALE_REVISION_ID = "20000000-0000-4000-8000-000000000099";
const CORRELATION_ID = "mobile.request:0001";
const ACCESS_TOKEN = "header-only-sensitive.jwt.value";
const CREATED_AT = "2026-08-10T01:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("CaresLink V1 Product API HTTP route boundary", () => {
  it("fails closed with the real default feature flag and no persistence adapter", async () => {
    vi.stubEnv("CARESLINK_V1_PRODUCT_API_ENABLED", "");

    const response = await handleCaresLinkV1GetMe(
      versionedRequest("/v1/me"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: {
        code: "PRODUCT_API_DISABLED",
        message: "The Product API is not enabled",
      },
    });
  });

  it("rejects unsupported versions before auth and returns version and correlation headers", async () => {
    const resolveAuth = vi.fn();
    const dependencies: CaresLinkV1ProductApiRouteDependencies = {
      resolveAuth,
      createCorrelationId: () => CORRELATION_ID,
    };
    const callerCorrelationId = "caller.request:0001";
    const missingContract = await handleCaresLinkV1ListDocuments(
      new Request("https://portal.example.test/v1/documents", {
        headers: {
          [CARESLINK_V1_HEADER_NAMES.clientVersion]: "1.0.0",
          [CARESLINK_V1_HEADER_NAMES.correlationId]: callerCorrelationId,
        },
      }),
      dependencies,
    );

    expect(missingContract.status).toBe(400);
    expect(missingContract.headers.get(CARESLINK_V1_HEADER_NAMES.contractVersion)).toBe(
      CARESLINK_V1_CONTRACT_VERSION,
    );
    expect(
      missingContract.headers.get(CARESLINK_V1_HEADER_NAMES.minimumClientVersion),
    ).toBe(CARESLINK_V1_MINIMUM_CLIENT_VERSION);
    expect(missingContract.headers.get(CARESLINK_V1_HEADER_NAMES.correlationId)).toBe(
      callerCorrelationId,
    );
    expect(await missingContract.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        correlationId: callerCorrelationId,
      },
    });

    const oldClient = await handleCaresLinkV1ListDocuments(
      versionedRequest("/v1/documents", {
        headers: {
          [CARESLINK_V1_HEADER_NAMES.clientVersion]: "0.9.9",
        },
      }),
      dependencies,
    );
    expect(oldClient.status).toBe(426);
    expect(oldClient.headers.get(CARESLINK_V1_HEADER_NAMES.correlationId)).toBe(
      CORRELATION_ID,
    );
    expect(await oldClient.json()).toMatchObject({
      error: {
        code: "MIN_CLIENT_VERSION",
        correlationId: CORRELATION_ID,
      },
    });

    const prereleaseClient = await handleCaresLinkV1ListDocuments(
      versionedRequest("/v1/documents", {
        headers: {
          [CARESLINK_V1_HEADER_NAMES.clientVersion]: "1.0.0-beta.1",
        },
      }),
      dependencies,
    );
    expect(prereleaseClient.status).toBe(426);
    expect(resolveAuth).not.toHaveBeenCalled();
  });

  it("authenticates before reading an invalid mutation body", async () => {
    const resolveAuth = vi.fn(async () => ({
      ok: false as const,
      reason: "auth_required" as const,
      status: 401 as const,
    }));
    const getProductApi = vi.fn();
    const response = await handleCaresLinkV1CreateDocument(
      versionedRequest("/v1/documents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [CARESLINK_V1_HEADER_NAMES.idempotencyKey]: "mutation:create:0001",
        },
        body: "{",
      }),
      { resolveAuth, getProductApi, createCorrelationId: () => CORRELATION_ID },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTH_REQUIRED", correlationId: CORRELATION_ID },
    });
    expect(resolveAuth).toHaveBeenCalledOnce();
    expect(getProductApi).not.toHaveBeenCalled();
  });

  it.each([
    "ownerId",
    "OWNERUSERID",
    "userId",
    "sessionId",
    "accessToken",
    "refreshToken",
    "Authorization",
  ])(
    "rejects client-supplied %s before creating an owner-bound document",
    async (forbiddenField) => {
      const store = deterministicStore([DOCUMENT_ID, REVISION_ID]);
      const forbiddenValue = `untrusted-${forbiddenField}-${ACCESS_TOKEN}`;
      const response = await handleCaresLinkV1CreateDocument(
        createDocumentRequest("mutation:create:0001", {
          ...createBody(),
          [forbiddenField]: forbiddenValue,
        }),
        authenticatedDependencies(store, "cookie"),
      );

      expect(response.status).toBe(400);
      const text = await response.text();
      expect(JSON.parse(text)).toMatchObject({
        error: { code: "VALIDATION_ERROR", correlationId: CORRELATION_ID },
      });
      expect(text).not.toContain(forbiddenValue);

      const nestedBody = createBody();
      const nestedContent = {
        ...nestedBody.content,
        factsSummary: {
          ...nestedBody.content.factsSummary,
          [forbiddenField]: forbiddenValue,
        },
      };
      const nestedResponse = await handleCaresLinkV1CreateDocument(
        createDocumentRequest("mutation:create:0002", {
          ...nestedBody,
          content: nestedContent,
          contentHash:
            createCaresLinkV1ProductApiContentHash(nestedContent),
        }),
        authenticatedDependencies(store, "bearer"),
      );
      expect(nestedResponse.status).toBe(400);
      expect(await nestedResponse.text()).not.toContain(forbiddenValue);

      if (forbiddenField === "accessToken") {
        const unknownFieldResponse = await handleCaresLinkV1CreateDocument(
          createDocumentRequest("mutation:create:0003", {
            ...createBody(),
            unsupportedField: "must-be-rejected",
          }),
          authenticatedDependencies(store, "cookie"),
        );
        expect(unknownFieldResponse.status).toBe(400);
      }

      await expect(
        store.forPrincipal({
          userId: USER_ID,
          sessionId: SESSION_ID,
          transport: "COOKIE",
        }).listDocuments(),
      ).resolves.toEqual({ documents: [], nextCursor: null, hasMore: false });
    },
  );

  it("rejects unknown top-level note content fields instead of silently dropping them", async () => {
    const store = deterministicStore([DOCUMENT_ID, REVISION_ID]);
    const body = createBody();
    const content = {
      ...body.content,
      unsupportedContentField: "must-not-be-acknowledged",
    };
    const response = await handleCaresLinkV1CreateDocument(
      createDocumentRequest("mutation:create:unknown-content", {
        ...body,
        content,
        contentHash: createCaresLinkV1ProductApiContentHash(content),
      }),
      authenticatedDependencies(store, "bearer"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", correlationId: CORRELATION_ID },
    });
    await expect(
      store
        .forPrincipal({
          userId: USER_ID,
          sessionId: SESSION_ID,
          transport: "BEARER",
        })
        .listDocuments(),
    ).resolves.toEqual({ documents: [], nextCursor: null, hasMore: false });
  });

  it.each([
    [
      "POST create",
      (
        request: Request,
        dependencies: CaresLinkV1ProductApiRouteDependencies,
      ) => handleCaresLinkV1CreateDocument(request, dependencies),
      "/v1/documents",
      "POST",
    ],
    [
      "PATCH document",
      (
        request: Request,
        dependencies: CaresLinkV1ProductApiRouteDependencies,
      ) => handleCaresLinkV1AppendRevision(request, DOCUMENT_ID, dependencies),
      `/v1/documents/${DOCUMENT_ID}`,
      "PATCH",
    ],
    [
      "PUT checkpoint",
      (
        request: Request,
        dependencies: CaresLinkV1ProductApiRouteDependencies,
      ) => handleCaresLinkV1SaveCheckpoint(request, DOCUMENT_ID, dependencies),
      `/v1/documents/${DOCUMENT_ID}/checkpoint`,
      "PUT",
    ],
    [
      "DELETE tombstone",
      (
        request: Request,
        dependencies: CaresLinkV1ProductApiRouteDependencies,
      ) =>
        handleCaresLinkV1TombstoneDocument(
          request,
          DOCUMENT_ID,
          dependencies,
        ),
      `/v1/documents/${DOCUMENT_ID}`,
      "DELETE",
    ],
  ] as const)(
    "rejects cross-origin cookie-authenticated %s before reading the body",
    async (_label, handle, path, method) => {
      const store = deterministicStore([]);
      const request = versionedRequest(path, {
        method,
        headers: {
          "content-type": "application/json",
          origin: "https://sibling.example.test",
          [CARESLINK_V1_HEADER_NAMES.idempotencyKey]: "mutation:csrf:0001",
        },
        body: "{",
      });
      const response = await handle(
        request,
        authenticatedDependencies(store, "cookie"),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: "FORBIDDEN" },
      });
    },
  );

  it("requires JSON and Origin for cookie mutations while keeping header-authenticated native calls origin-independent", async () => {
    const store = deterministicStore([DOCUMENT_ID, REVISION_ID]);
    const missingOrigin = await handleCaresLinkV1CreateDocument(
      versionedRequest("/v1/documents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [CARESLINK_V1_HEADER_NAMES.idempotencyKey]: "mutation:create:0001",
        },
        body: JSON.stringify(createBody()),
      }),
      authenticatedDependencies(store, "cookie"),
    );
    expect(missingOrigin.status).toBe(403);

    const wrongMediaType = await handleCaresLinkV1CreateDocument(
      versionedRequest("/v1/documents", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "https://portal.example.test",
          [CARESLINK_V1_HEADER_NAMES.idempotencyKey]: "mutation:create:0002",
        },
        body: JSON.stringify(createBody()),
      }),
      authenticatedDependencies(store, "cookie"),
    );
    expect(wrongMediaType.status).toBe(400);

    const bearerResponse = await handleCaresLinkV1CreateDocument(
      createDocumentRequest("mutation:create:0003", createBody(), false),
      authenticatedDependencies(store, "bearer"),
    );
    expect(bearerResponse.status).toBe(201);
  });

  it("maps verified cookie and Bearer identities to the same owner with explicit transport", async () => {
    const store = deterministicStore([]);
    const cookieResponse = await handleCaresLinkV1GetMe(
      versionedRequest("/v1/me"),
      authenticatedDependencies(store, "cookie"),
    );
    const bearerResponse = await handleCaresLinkV1GetMe(
      versionedRequest("/v1/me", {
        headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
      }),
      authenticatedDependencies(store, "bearer"),
    );

    expect(cookieResponse.status).toBe(200);
    expect(bearerResponse.status).toBe(200);
    expect(await cookieResponse.json()).toMatchObject({
      userId: USER_ID,
      sessionId: SESSION_ID,
      authTransport: "COOKIE",
      capabilities: {
        nativePkceCallback: false,
        sessionManagement: false,
        deviceManagement: false,
        sessionRevocation: false,
      },
    });
    const bearerText = await bearerResponse.text();
    expect(JSON.parse(bearerText)).toMatchObject({
      userId: USER_ID,
      sessionId: SESSION_ID,
      authTransport: "BEARER",
    });
    expect(bearerText).not.toContain(ACCESS_TOKEN);
    expect(
      bearerResponse.headers.get(CARESLINK_V1_HEADER_NAMES.contractVersion),
    ).toBe(CARESLINK_V1_CONTRACT_VERSION);
    expect(
      bearerResponse.headers.get(CARESLINK_V1_HEADER_NAMES.minimumClientVersion),
    ).toBe(CARESLINK_V1_MINIMUM_CLIENT_VERSION);
  });

  it("returns an explicit revoked-session error without constructing an API", async () => {
    const getProductApi = vi.fn();
    const response = await handleCaresLinkV1GetMe(
      versionedRequest("/v1/me", {
        headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
      }),
      {
        resolveAuth: async () => ({
          ok: false,
          reason: "session_revoked",
          status: 401,
        }),
        getProductApi,
        createCorrelationId: () => CORRELATION_ID,
      },
    );

    expect(response.status).toBe(401);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      error: { code: "SESSION_REVOKED", correlationId: CORRELATION_ID },
    });
    expect(text).not.toContain(ACCESS_TOKEN);
    expect(getProductApi).not.toHaveBeenCalled();
  });

  it("requires idempotency in the header even when a body field is supplied", async () => {
    const store = deterministicStore([DOCUMENT_ID, REVISION_ID]);
    const response = await handleCaresLinkV1CreateDocument(
      versionedRequest("/v1/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...createBody(),
          idempotencyKey: "mutation:create:body-only",
        }),
      }),
      authenticatedDependencies(store, "bearer"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "The Idempotency-Key header is required",
      },
    });
  });

  it("rejects note upload without the frozen privacy review proof field", async () => {
    const store = deterministicStore([DOCUMENT_ID, REVISION_ID]);
    const { privacyReviewId: _privacyReviewId, ...body } = createBody();
    void _privacyReviewId;
    const response = await handleCaresLinkV1CreateDocument(
      createDocumentRequest("mutation:create:privacy-missing", body),
      authenticatedDependencies(store, "bearer"),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "PRIVACY_REVIEW_REQUIRED",
        message: "A privacy review proof is required before upload",
        correlationId: CORRELATION_ID,
      },
    });
  });

  it("serves pullChanges as canonical GET query parameters without mutation transport", async () => {
    const store = deterministicStore([]);
    const bearerResponse = await handleCaresLinkV1PullChanges(
      versionedRequest("/v1/sync/pull?limit=1"),
      authenticatedDependencies(store, "bearer"),
    );

    expect(bearerResponse.status).toBe(200);
    expect(await bearerResponse.json()).toEqual({
      changes: [],
      nextCursor: null,
      hasMore: false,
    });

    const invalidLimit = await handleCaresLinkV1PullChanges(
      versionedRequest("/v1/sync/pull?limit=999"),
      authenticatedDependencies(store, "cookie"),
    );
    expect(invalidLimit.status).toBe(400);
    expect(await invalidLimit.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", correlationId: CORRELATION_ID },
    });
  });

  it("maps replay, changed-payload, and stale-base outcomes to stable HTTP responses", async () => {
    const store = deterministicStore([DOCUMENT_ID, REVISION_ID]);
    const dependencies = authenticatedDependencies(store, "bearer");
    const firstResponse = await handleCaresLinkV1CreateDocument(
      createDocumentRequest("mutation:create:0001", createBody()),
      dependencies,
    );
    const first = await firstResponse.json();
    const replayResponse = await handleCaresLinkV1CreateDocument(
      createDocumentRequest("mutation:create:0001", createBody()),
      dependencies,
    );

    expect(firstResponse.status).toBe(201);
    expect(replayResponse.status).toBe(201);
    expect(await replayResponse.json()).toEqual(first);
    expect(first).toMatchObject({
      document: { canonicalId: DOCUMENT_ID, currentRevisionId: REVISION_ID },
      revision: { revisionId: REVISION_ID, revisionNumber: 1 },
      saveState: "SERVER_ACKNOWLEDGED",
    });

    const changedContent = noteContent("Changed input under the same key.");
    const idempotencyConflict = await handleCaresLinkV1CreateDocument(
      createDocumentRequest("mutation:create:0001", {
        ...createBody(),
        content: changedContent,
        contentHash: createCaresLinkV1ProductApiContentHash(changedContent),
      }),
      dependencies,
    );
    expect(idempotencyConflict.status).toBe(409);
    expect(await idempotencyConflict.json()).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });

    const staleContent = noteContent("Stale concurrent input.");
    const staleRevision = await handleCaresLinkV1AppendRevision(
      versionedRequest(`/v1/documents/${DOCUMENT_ID}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          [CARESLINK_V1_HEADER_NAMES.idempotencyKey]: "mutation:append:0001",
        },
        body: JSON.stringify({
          baseRevisionId: STALE_REVISION_ID,
          content: staleContent,
          contentHash: createCaresLinkV1ProductApiContentHash(staleContent),
          schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
          privacyReviewId: PRIVACY_REVIEW_ID,
        }),
      }),
      DOCUMENT_ID,
      dependencies,
    );
    expect(staleRevision.status).toBe(409);
    expect(await staleRevision.json()).toMatchObject({
      error: {
        code: "STALE_REVISION",
        conflict: {
          canonicalId: DOCUMENT_ID,
          currentRevisionId: REVISION_ID,
          currentRevisionNumber: 1,
        },
      },
    });
  });

  it("replaces unexpected dependency failures with a token-free generic envelope", async () => {
    const store = deterministicStore([]);
    const api = store.forPrincipal({
      userId: USER_ID,
      sessionId: SESSION_ID,
      transport: "BEARER",
    });
    vi.spyOn(api, "getMe").mockRejectedValue(
      new Error(`upstream included ${ACCESS_TOKEN}`),
    );
    const response = await handleCaresLinkV1GetMe(
      versionedRequest("/v1/me", {
        headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
      }),
      {
        resolveAuth: async () => ({
          ok: true,
          identity: { userId: USER_ID, sessionId: SESSION_ID, source: "bearer" },
        }),
        getProductApi: () => api,
        createCorrelationId: () => CORRELATION_ID,
      },
    );

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "PRODUCT_API_DISABLED",
        message: "The Product API request could not be completed",
        correlationId: CORRELATION_ID,
      },
    });
    expect(text).not.toContain(ACCESS_TOKEN);
  });
});

function versionedRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has(CARESLINK_V1_HEADER_NAMES.contractVersion)) {
    headers.set(
      CARESLINK_V1_HEADER_NAMES.contractVersion,
      CARESLINK_V1_CONTRACT_VERSION,
    );
  }
  if (!headers.has(CARESLINK_V1_HEADER_NAMES.clientVersion)) {
    headers.set(CARESLINK_V1_HEADER_NAMES.clientVersion, "1.0.0");
  }
  return new Request(`https://portal.example.test${path}`, {
    ...init,
    headers,
  });
}

function createDocumentRequest(
  idempotencyKey: string,
  body: Record<string, unknown>,
  includeOrigin = true,
) {
  return versionedRequest("/v1/documents", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(includeOrigin ? { origin: "https://portal.example.test" } : {}),
      [CARESLINK_V1_HEADER_NAMES.idempotencyKey]: idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function authenticatedDependencies(
  store: CaresLinkV1MemoryProductApiStore,
  source: "bearer" | "cookie",
): CaresLinkV1ProductApiRouteDependencies {
  return {
    resolveAuth: async () => ({
      ok: true,
      identity: { userId: USER_ID, sessionId: SESSION_ID, source },
    }),
    getProductApi: (principal) => store.forPrincipal(principal),
    createCorrelationId: () => CORRELATION_ID,
  };
}

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
    initialPrivacyProofs: [
      {
        id: PRIVACY_REVIEW_ID,
        ownerUserId: USER_ID,
        noteType: "ndis",
        cleanedFactsHash: createCaresLinkV1CleanedFactsHash(
          noteContent("seed").factsSummary,
        ),
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        status: "CONFIRMED",
        scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
        reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION,
        findingDecisions: [],
        confirmedAt: CREATED_AT,
        expiresAt: "2026-08-10T02:00:00.000Z",
      },
    ],
  });
}

function createBody() {
  const content = noteContent("A factual support note.");
  return {
    noteType: "ndis",
    sourceLocale: "en",
    content,
    contentHash: createCaresLinkV1ProductApiContentHash(content),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId: PRIVACY_REVIEW_ID,
  };
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
