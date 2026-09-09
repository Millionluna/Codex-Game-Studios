import { describe, expect, it, vi } from "vitest";
import {
  CommunicationNoteDocumentClientResponseError,
  loadCommunicationNoteDocument,
} from "./communication-note-document-client";
import { createValidCaresLinkV1CleanedFacts } from "./v1/cleaned-facts-test-fixtures";

const DOC = "10000000-0000-4000-8000-000000000001";
const OTHER_DOC = "10000000-0000-4000-8000-000000000002";
const REV1 = "20000000-0000-4000-8000-000000000001";
const REV2 = "20000000-0000-4000-8000-000000000002";
const NOW = "2026-09-07T01:00:00.000Z";

function available() {
  return {
    status: "AVAILABLE",
    canonicalId: DOC,
    noteType: "communication",
    sourceLocale: "zh-Hant",
    currentRevisionId: REV2,
    revision: {
      revisionId: REV2,
      revisionNumber: 2,
      contentHash: "a".repeat(64),
      createdAt: NOW,
      content: {
        englishDraft: "The worker contacted the coordinator by phone.",
        reviewVersions: {
          "zh-Hans": "工作人员通过电话联系协调员。",
          "zh-Hant": "工作人員透過電話聯絡協調員。",
        },
        factsSummary: createValidCaresLinkV1CleanedFacts("communication"),
        missingFacts: ["The outcome was not provided."],
        neutralWordingChecks: ["Check factual wording."],
        followUpPrompts: [],
        disclaimer: "Untrusted generated disclaimer",
      },
    },
    versions: [
      { revisionId: REV2, revisionNumber: 2, createdAt: NOW },
      {
        revisionId: REV1,
        revisionNumber: 1,
        createdAt: "2026-09-07T00:00:00.000Z",
      },
    ],
    isCurrentRevision: true,
    selfReviewStatus: "CONFIRMED",
    draftNotice: "Draft – review required",
    saveState: "SERVER_ACKNOWLEDGED",
  };
}

describe("Communication Note saved-document browser client", () => {
  it("reads the fixed same-origin revision endpoint without cache or credentials in the URL", async () => {
    const signal = new AbortController().signal;
    const fetcher = responseFetcher(200, available());
    const result = await loadCommunicationNoteDocument({
      canonicalId: DOC,
      revisionId: REV2,
      signal,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `/api/ai-documents/communication-note/documents/${DOC}?revisionId=${REV2}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal,
      },
    );
    expect(result).toMatchObject({
      status: "AVAILABLE",
      canonicalId: DOC,
      revision: { revisionId: REV2 },
      selfReviewStatus: "CONFIRMED",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(
      result.status === "AVAILABLE" && Object.isFrozen(result.revision.content),
    ).toBe(true);
    expect(JSON.stringify(fetcher.mock.calls[0])).not.toMatch(
      /worker contacted|contentHash|idempotency/i,
    );
  });

  it("accepts a historical revision only with UNKNOWN self-review", async () => {
    const payload = available();
    payload.revision = {
      ...payload.revision,
      revisionId: REV1,
      revisionNumber: 1,
      createdAt: "2026-09-07T00:00:00.000Z",
    };
    payload.isCurrentRevision = false;
    payload.selfReviewStatus = "UNKNOWN";

    const result = await loadWith(payload, REV1);
    expect(result).toMatchObject({
      status: "AVAILABLE",
      isCurrentRevision: false,
      selfReviewStatus: "UNKNOWN",
    });
  });

  it("requires the current revision when the page did not request history", async () => {
    const payload = available();
    payload.revision = {
      ...payload.revision,
      revisionId: REV1,
      revisionNumber: 1,
      createdAt: "2026-09-07T00:00:00.000Z",
    };
    payload.isCurrentRevision = false;
    payload.selfReviewStatus = "UNKNOWN";

    await expect(loadWith(payload)).rejects.toBeInstanceOf(
      CommunicationNoteDocumentClientResponseError,
    );
  });

  it("does not accept EMPTY for an explicitly requested revision", async () => {
    await expect(
      loadCommunicationNoteDocument({
        canonicalId: DOC,
        revisionId: REV1,
        signal: new AbortController().signal,
        fetcher: responseFetcher(200, {
          status: "EMPTY",
          canonicalId: DOC,
          sourceLocale: "en",
        }),
      }),
    ).rejects.toBeInstanceOf(CommunicationNoteDocumentClientResponseError);
  });

  it.each([
    [401, { status: "AUTH_REQUIRED" }],
    [404, { status: "NOT_FOUND" }],
    [503, { status: "UNAVAILABLE" }],
    [
      200,
      { status: "EMPTY", canonicalId: DOC, sourceLocale: "zh-Hans" },
    ],
  ] as const)("accepts the strict %s status envelope", async (status, payload) => {
    const result = await loadCommunicationNoteDocument({
      canonicalId: DOC,
      signal: new AbortController().signal,
      fetcher: responseFetcher(status, payload),
    });
    expect(result.status).toBe(payload.status);
  });

  it.each([
    { name: "extra top-level field", payload: { ...available(), private: "secret" }, status: 200 },
    { name: "wrong document", payload: { ...available(), canonicalId: OTHER_DOC }, status: 200 },
    { name: "wrong selected revision", payload: { ...available(), revision: { ...available().revision, revisionId: REV1, revisionNumber: 1 } }, status: 200 },
    { name: "current review on history", payload: { ...available(), isCurrentRevision: false }, status: 200 },
    { name: "history review on current", payload: { ...available(), selfReviewStatus: "UNKNOWN" }, status: 200 },
    { name: "newer undeclared version", payload: { ...available(), versions: [{ revisionId: "20000000-0000-4000-8000-000000000003", revisionNumber: 3, createdAt: NOW }, ...available().versions] }, status: 200 },
    { name: "unsorted versions", payload: { ...available(), versions: [...available().versions].reverse() }, status: 200 },
    { name: "untrusted review locale", payload: { ...available(), revision: { ...available().revision, content: { ...available().revision.content, reviewVersions: { fr: "private" } } } }, status: 200 },
    { name: "wrong HTTP status", payload: available(), status: 201 },
  ])("rejects $name", async ({ payload, status }) => {
    await expect(
      loadCommunicationNoteDocument({
        canonicalId: DOC,
        revisionId: REV2,
        signal: new AbortController().signal,
        fetcher: responseFetcher(status, payload),
      }),
    ).rejects.toBeInstanceOf(CommunicationNoteDocumentClientResponseError);
  });

  it("does not reinterpret a malformed requested ID when the API returns generic not found", async () => {
    const result = await loadCommunicationNoteDocument({
      canonicalId: "not-a-document-id",
      signal: new AbortController().signal,
      fetcher: responseFetcher(404, { status: "NOT_FOUND" }),
    });
    expect(result).toEqual({ status: "NOT_FOUND" });
  });

  it("replaces JSON failures with one content-free error", async () => {
    const fetcher = vi.fn(async () => ({
      status: 503,
      json: vi.fn().mockRejectedValue(new Error("private database message")),
    }));
    let caught: unknown;
    try {
      await loadCommunicationNoteDocument({
        canonicalId: DOC,
        signal: new AbortController().signal,
        fetcher,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CommunicationNoteDocumentClientResponseError);
    expect(JSON.stringify(caught)).not.toContain("private database message");
  });
});

async function loadWith(payload: unknown, revisionId?: string) {
  return loadCommunicationNoteDocument({
    canonicalId: DOC,
    revisionId,
    signal: new AbortController().signal,
    fetcher: responseFetcher(200, payload),
  });
}

function responseFetcher(status: number, payload: unknown) {
  return vi.fn(async () => ({ status, json: async () => payload }));
}
