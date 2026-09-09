import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleCommunicationNoteDocumentRead,
  readCommunicationNoteDocument,
} from "./communication-note-document.server";
import { COMMUNICATION_NOTE_DOCUMENT_API_PATH } from "./communication-note-document-contract";
import {
  CaresLinkV1ProductApiError,
  createCaresLinkV1CleanedFactsHash,
  createCaresLinkV1ProductApiContentHash,
  createMemoryCaresLinkV1ProductApiStore,
} from "./v1/product-api-memory";
import { createValidCaresLinkV1CleanedFacts } from "./v1/cleaned-facts-test-fixtures";
import type { CaresLinkV1ProductApiAuthResolution } from "./v1/product-api-auth.server";
import { createCaresLinkV1ProductApiRuntime, getCaresLinkV1ProductApiOperationCapability } from "./v1/product-api-runtime.server";
import { createSupabaseCaresLinkV1ProductApi } from "./v1/product-api-supabase.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_PRIVACY_REVIEW_REVISION,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  CaresLinkV1ContractError,
  type CaresLinkV1NoteContent,
} from "./v1/shared-contracts";
import type { CaresLinkV1GetDocumentResponse, CaresLinkV1ProductApi } from "./v1/transport-contract";

vi.mock("server-only", () => ({}));

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC = "10000000-0000-4000-8000-000000000001";
const REV1 = "20000000-0000-4000-8000-000000000001";
const REV2 = "20000000-0000-4000-8000-000000000002";
const PRIVACY = "30000000-0000-4000-8000-000000000001";
const NOW = "2026-09-07T01:00:00.000Z";
const content: CaresLinkV1NoteContent = {
  englishDraft: "The worker contacted the coordinator by phone.",
  reviewVersions: { "zh-Hans": "工作人员通过电话联系协调员。", "zh-Hant": "工作人員透過電話聯絡協調員。" },
  factsSummary: createValidCaresLinkV1CleanedFacts("communication"),
  missingFacts: ["The outcome was not provided."],
  neutralWordingChecks: ["Check factual wording."],
  followUpPrompts: [],
  disclaimer: "Draft – review required",
};

function request(query = "") {
  return new Request(`https://example.test${COMMUNICATION_NOTE_DOCUMENT_API_PATH}/${DOC}${query}`);
}

function snapshot(): CaresLinkV1GetDocumentResponse {
  return {
    document: {
      canonicalId: DOC, noteType: "communication", sourceLocale: "zh-Hant",
      lifecycleStatus: "IN_PROGRESS", currentRevisionId: REV2, currentRevisionNumber: 2,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION, schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      createdAt: NOW, updatedAt: NOW, deletedAt: null,
    },
    revisions: [REV1, REV2].map((revisionId, index) => ({
      canonicalId: DOC, revisionId, revisionNumber: index + 1,
      baseRevisionId: index === 0 ? null : REV1, privacyReviewId: PRIVACY,
      content: structuredClone(content), contentHash: createCaresLinkV1ProductApiContentHash(content),
      mutationId: `test:communication:revision:${index + 1}`, contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION, createdAt: NOW,
    })),
    checkpoint: null, selfReviewStatus: "CONFIRMED",
  };
}

function fixture(value = snapshot()) {
  const auth: CaresLinkV1ProductApiAuthResolution = {
    ok: true, identity: { userId: USER, sessionId: SESSION, source: "cookie" },
  };
  const getDocument = vi.fn(async (id: string) => { void id; return value; });
  const getPoints = vi.fn();
  const api = { getDocument, getPoints } as unknown as CaresLinkV1ProductApi;
  const resolveAuth = vi.fn(async (request: Request): Promise<CaresLinkV1ProductApiAuthResolution> => { void request; return auth; });
  const getProductApi = vi.fn(async () => api);
  return { runtime: { resolveAuth, getProductApi }, getDocument, getPoints };
}

afterEach(() => vi.restoreAllMocks());

describe("Communication Note saved-document reads", () => {
  it("recovers the current revision with all three languages and a permanent draft notice", async () => {
    const { runtime, getDocument, getPoints } = fixture();
    const result = await readCommunicationNoteDocument(request(), DOC, runtime);
    expect(result).toMatchObject({
      status: "AVAILABLE", canonicalId: DOC, sourceLocale: "zh-Hant", currentRevisionId: REV2,
      revision: { revisionId: REV2, revisionNumber: 2, content },
      isCurrentRevision: true, selfReviewStatus: "CONFIRMED",
      draftNotice: "Draft – review required", saveState: "SERVER_ACKNOWLEDGED",
      versions: [{ revisionId: REV2 }, { revisionId: REV1 }],
    });
    expect(getDocument).toHaveBeenCalledExactlyOnceWith(DOC);
    expect(getPoints).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/ownerUserId|sessionId|privacyReviewId|mutationId|generationJobId|checkpoint/);
    const apiRequest = runtime.resolveAuth.mock.calls[0][0];
    expect(getCaresLinkV1ProductApiOperationCapability(apiRequest)).toBe("DOCUMENT_DETAIL");
    expect(runtime.getProductApi).toHaveBeenCalledWith({ userId: USER, sessionId: SESSION, transport: "COOKIE" }, apiRequest);
  });

  it("selects a historical revision without transferring the current self-review confirmation", async () => {
    const { runtime } = fixture();
    expect(await readCommunicationNoteDocument(request(`?revisionId=${REV1}`), DOC, runtime)).toMatchObject({
      status: "AVAILABLE", revision: { revisionId: REV1 }, isCurrentRevision: false, selfReviewStatus: "UNKNOWN",
    });
  });

  it("does not substitute Simplified Chinese when a Traditional review version is absent", async () => {
    const value = snapshot();
    delete value.revisions[1].content.reviewVersions["zh-Hant"];
    const { runtime } = fixture(value);
    const result = await readCommunicationNoteDocument(request(), DOC, runtime);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.revision.content.reviewVersions["zh-Hant"]).toBeUndefined();
  });

  it("returns detached data without sorting or mutating the stored aggregate", async () => {
    const value = snapshot();
    const { runtime } = fixture(value);
    const result = await readCommunicationNoteDocument(request(), DOC, runtime);
    if (result.status !== "AVAILABLE") throw new Error("Expected document");
    result.revision.content.englishDraft = "Client edit";
    expect(value.revisions[0].revisionId).toBe(REV1);
    expect(value.revisions[1].content.englishDraft).toBe(content.englishDraft);
  });

  it.each(["auth_required", "invalid_session", "session_revoked"] as const)("fails before lookup for %s", async (reason) => {
    const { runtime, getDocument } = fixture();
    runtime.resolveAuth.mockResolvedValue({ ok: false, reason, status: 401 });
    expect(await readCommunicationNoteDocument(request("?ownerUserId=other"), "invalid", runtime)).toEqual({ status: "AUTH_REQUIRED" });
    expect(runtime.getProductApi).not.toHaveBeenCalled();
    expect(getDocument).not.toHaveBeenCalled();
  });

  it.each(["feature_disabled", "auth_unavailable", "session_validation_unavailable"] as const)("keeps %s unavailable", async (reason) => {
    const { runtime } = fixture();
    runtime.resolveAuth.mockResolvedValue({ ok: false, reason, status: 503 });
    expect(await readCommunicationNoteDocument(request(), DOC, runtime)).toEqual({ status: "UNAVAILABLE" });
    expect(runtime.getProductApi).not.toHaveBeenCalled();
  });

  it("does not turn bearer credentials into a Portal cookie identity", async () => {
    const { runtime } = fixture();
    runtime.resolveAuth.mockResolvedValue({ ok: true, identity: { userId: USER, sessionId: SESSION, source: "bearer" } });
    const incoming = request();
    incoming.headers.set("authorization", "Bearer synthetic-token");
    expect(await readCommunicationNoteDocument(incoming, DOC, runtime)).toEqual({ status: "AUTH_REQUIRED" });
    expect(runtime.resolveAuth.mock.calls[0][0].headers.get("authorization")).toBe("Bearer synthetic-token");
    expect(runtime.getProductApi).not.toHaveBeenCalled();
  });

  it.each(["userId", "sessionId"] as const)("rejects malformed %s from a replacement auth resolver", async (field) => {
    const { runtime } = fixture();
    runtime.resolveAuth.mockResolvedValue({ ok: true, identity: { userId: USER, sessionId: SESSION, source: "cookie", [field]: "invalid" } });
    expect(await readCommunicationNoteDocument(request(), DOC, runtime)).toEqual({ status: "UNAVAILABLE" });
    expect(runtime.getProductApi).not.toHaveBeenCalled();
  });

  it.each(["?revisionId=bad", "?revisionId=", `?revisionId=${REV1}&revisionId=${REV2}`, `?ownerUserId=${OTHER}`])("rejects ambiguous input %s without a document lookup", async (query) => {
    const { runtime } = fixture();
    expect(await readCommunicationNoteDocument(request(query), DOC, runtime)).toEqual({ status: "NOT_FOUND" });
    expect(runtime.getProductApi).not.toHaveBeenCalled();
  });

  it("does not silently open the current revision when the requested version is missing", async () => {
    const { runtime } = fixture();
    expect(await readCommunicationNoteDocument(request(`?revisionId=${PRIVACY}`), DOC, runtime)).toEqual({ status: "NOT_FOUND" });
  });

  it.each(["TOMBSTONED", "PURGED"] as const)("never returns body for a %s document", async (lifecycleStatus) => {
    const value = snapshot();
    value.document.lifecycleStatus = lifecycleStatus;
    expect(await readCommunicationNoteDocument(request(), DOC, fixture(value).runtime)).toEqual({ status: "NOT_FOUND" });
  });

  it("honours deletedAt even if lifecycle metadata is inconsistent", async () => {
    const value = snapshot();
    value.document.deletedAt = NOW;
    expect(await readCommunicationNoteDocument(request(), DOC, fixture(value).runtime)).toEqual({ status: "NOT_FOUND" });
  });

  it.each(["handover", "progress", "ndis", "incident_factual"] as const)("does not expose %s via the Communication surface", async (noteType) => {
    const value = snapshot();
    value.document.noteType = noteType;
    expect(await readCommunicationNoteDocument(request(), DOC, fixture(value).runtime)).toEqual({ status: "NOT_FOUND" });
  });

  it.each(["document", "revision", "current", "duplicate", "newer"])("rejects broken %s binding", async (kind) => {
    const value = snapshot();
    if (kind === "document") value.document.canonicalId = OTHER;
    if (kind === "revision") value.revisions[0].canonicalId = OTHER;
    if (kind === "current") value.document.currentRevisionNumber = 3;
    if (kind === "duplicate") value.revisions.push(value.revisions[0]);
    if (kind === "newer") value.revisions.push({
      ...value.revisions[1],
      revisionId: "20000000-0000-4000-8000-000000000003",
      revisionNumber: 3,
    });
    expect(await readCommunicationNoteDocument(request(), DOC, fixture(value).runtime)).toEqual({ status: "UNAVAILABLE" });
  });

  it("revalidates Communication facts at the final projection boundary", async () => {
    const value = snapshot();
    value.revisions[1].content.factsSummary =
      createValidCaresLinkV1CleanedFacts("ndis");

    expect(
      await readCommunicationNoteDocument(request(), DOC, fixture(value).runtime),
    ).toEqual({ status: "UNAVAILABLE" });
  });

  it("distinguishes an empty canonical document from a saved result", async () => {
    const value = snapshot();
    value.document.currentRevisionId = null;
    value.document.currentRevisionNumber = 0;
    value.revisions = [];
    const { runtime } = fixture(value);
    expect(await readCommunicationNoteDocument(request(), DOC, runtime)).toEqual({ status: "EMPTY", canonicalId: DOC, sourceLocale: "zh-Hant" });
    expect(await readCommunicationNoteDocument(request(`?revisionId=${REV1}`), DOC, runtime)).toEqual({ status: "NOT_FOUND" });
  });

  it.each(["resolveAuth", "getProductApi"] as const)("redacts exceptions from %s", async (stage) => {
    const { runtime } = fixture();
    runtime[stage].mockRejectedValue(new Error("sensitive credentials and care facts"));
    expect(await readCommunicationNoteDocument(request(), DOC, runtime)).toEqual({ status: "UNAVAILABLE" });
  });

  it.each([
    [new CaresLinkV1ProductApiError("NOT_FOUND", "private"), "NOT_FOUND"],
    [new CaresLinkV1ContractError("SESSION_REVOKED", "private"), "AUTH_REQUIRED"],
    [new CaresLinkV1ContractError("AUTH_REQUIRED", "private"), "AUTH_REQUIRED"],
    [new Error("care facts in backend error"), "UNAVAILABLE"],
  ] as const)("maps backend errors to a stable body (%s)", async (error, status) => {
    const { runtime, getDocument } = fixture();
    getDocument.mockRejectedValue(error);
    const response = await handleCommunicationNoteDocumentRead(request(), DOC, runtime);
    expect(await response.json()).toEqual({ status });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("keeps the actual default-off runtime closed without contacting Supabase", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    const runtime = createCaresLinkV1ProductApiRuntime({ env: {} });
    const response = await handleCommunicationNoteDocumentRead(request(), DOC, runtime);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks successful responses private, uncacheable and non-indexable", async () => {
    const response = await handleCommunicationNoteDocumentRead(request(), DOC, fixture().runtime);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });

  it.each([false, true])("uses the real Supabase parser and rejects content/hash corruption: %s", async (corrupt) => {
    const value = snapshot();
    if (corrupt) value.revisions[1].content.englishDraft = "Changed without a matching hash";
    const rpc = vi.fn(async () => ({ data: value, error: null }));
    const api = createSupabaseCaresLinkV1ProductApi({
      client: { rpc },
      principal: { userId: USER, sessionId: SESSION, transport: "COOKIE" },
    });
    const { runtime } = fixture();
    runtime.getProductApi.mockResolvedValue(api);
    const result = await readCommunicationNoteDocument(request(), DOC, runtime);
    expect(result.status).toBe(corrupt ? "UNAVAILABLE" : "AVAILABLE");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_v1_shadow_document", { p_document_id: DOC });
  });

  it("recovers a stored revision across requests and enforces ownership using the memory Product API", async () => {
    const ids = [DOC, REV1, REV2];
    const store = createMemoryCaresLinkV1ProductApiStore({
      createId: () => ids.shift()!, now: () => NOW,
      initialPrivacyProofs: [{
        id: PRIVACY, ownerUserId: USER, noteType: "communication",
        cleanedFactsHash: createCaresLinkV1CleanedFactsHash(content.factsSummary),
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION, status: "CONFIRMED",
        scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
        reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION, findingDecisions: [],
        confirmedAt: NOW, expiresAt: "2026-09-07T02:00:00.000Z",
      }],
    });
    const api = store.forPrincipal({ userId: USER, sessionId: SESSION, transport: "COOKIE" });
    const savedContent = { content, contentHash: createCaresLinkV1ProductApiContentHash(content), schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION, privacyReviewId: PRIVACY };
    await api.createDocument({ noteType: "communication", sourceLocale: "zh-Hant", ...savedContent }, { idempotencyKey: "test:create:communication" });
    const { runtime } = fixture();
    runtime.getProductApi.mockResolvedValue(api);
    expect(await readCommunicationNoteDocument(request(), DOC, runtime)).toMatchObject({ status: "AVAILABLE", revision: { revisionId: REV1 } });
    await api.appendDocumentRevision(DOC, { baseRevisionId: REV1, ...savedContent }, { idempotencyKey: "test:append:communication" });
    expect(await readCommunicationNoteDocument(request(), DOC, runtime)).toMatchObject({ status: "AVAILABLE", revision: { revisionId: REV2 }, selfReviewStatus: "REQUIRED" });
    expect(await readCommunicationNoteDocument(request(`?revisionId=${REV1}`), DOC, runtime)).toMatchObject({ status: "AVAILABLE", revision: { revisionId: REV1 }, selfReviewStatus: "UNKNOWN" });
    runtime.resolveAuth.mockResolvedValue({ ok: true, identity: { userId: OTHER, sessionId: SESSION, source: "cookie" } });
    runtime.getProductApi.mockResolvedValue(store.forPrincipal({ userId: OTHER, sessionId: SESSION, transport: "COOKIE" }));
    expect(await readCommunicationNoteDocument(request(), DOC, runtime)).toEqual({ status: "NOT_FOUND" });
  });
});
