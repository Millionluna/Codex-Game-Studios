import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { createEditFixtureState, EDIT_DOC as DOC, EDIT_REV as REV } from "../../scripts/browser-e2e/communication-note-edit.fixture";
import { handleCommunicationNoteEdit } from "./communication-note-edit.server";
import { buildCommunicationNoteEditHref, parseCommunicationNoteEditRequest, parseCommunicationNoteEditResult } from "./communication-note-edit-contract";
import { saveCommunicationNoteEdit } from "./communication-note-edit-client";
import { getCommunicationNoteEditCopy } from "./communication-note-edit-i18n";
import { CaresLinkV1ProductApiError } from "./v1/product-api-memory";
import type { CaresLinkV1ProductApiRuntime } from "./v1/product-api-runtime.server";
const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", NEXT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const body = { baseRevisionId: REV, englishDraft: "SYNTHETIC EDIT. The agreed information was recorded after the phone call.",
  reviewVersions: { "zh-Hans": "合成修改：已记录电话沟通中确认的信息。", "zh-Hant": "合成修改：已記錄電話溝通中確認的資訊。" }, wordingConfirmed: true } as const;
const url = `https://example.test${buildCommunicationNoteEditHref(DOC)}`;
function request(payload: unknown = body, headers: Record<string, string> = {}, suffix = "") {
  return new Request(url + suffix, { method: "POST", body: JSON.stringify(payload), headers: { origin: "https://example.test",
    "sec-fetch-site": "same-origin", "content-type": "application/json", "idempotency-key": KEY, ...headers } });
}
async function setup() {
  const state = await createEditFixtureState(), api = state.store.forPrincipal(state.principal);
  const resolveAuth = vi.fn<CaresLinkV1ProductApiRuntime["resolveAuth"]>(async () => ({ ok: true,
    identity: { source: "cookie", userId: state.principal.userId, sessionId: state.principal.sessionId } }));
  const getProductApi = vi.fn(async () => api);
  return { state, api, binding: { runtime: { resolveAuth, getProductApi } } };
}

describe("explicit durable writer transport binding", () => {
  const ack = { status: "SAVED", canonicalId: DOC, baseRevisionId: REV, revisionId: NEXT, revisionNumber: 2,
    mutationId: KEY, saveState: "SERVER_ACKNOWLEDGED", selfReviewStatus: "REQUIRED", draftNotice: "Draft – review required" } as const;
  it("passes only the validated command to an explicit writer and never generic append", async () => {
    const f = await setup(), write = vi.fn(async () => ack), append = vi.spyOn(f.api, "appendDocumentRevision");
    const r = request();const result = await handleCommunicationNoteEdit(r, DOC, { ...f.binding, write });
    expect(result.status).toBe(200);expect(await result.json()).toEqual(ack);
    expect(write).toHaveBeenCalledExactlyOnceWith({ request: r, canonicalId: DOC, mutationId: KEY, command: body, baseRevisionNumber: 1 });
    expect(append).not.toHaveBeenCalled();expect((await f.api.getDocument(DOC)).revisions).toHaveLength(1);
  });
  it.each(["UNAVAILABLE", "AUTH_REQUIRED", "NOT_FOUND", "STALE_REVISION", "PRIVACY_REVIEW_REQUIRED"] as const)("never falls back after %s", async status => {
    const f = await setup(), append = vi.spyOn(f.api, "appendDocumentRevision"), write = vi.fn(async () => ({ status }));
    const result = await handleCommunicationNoteEdit(request(), DOC, { ...f.binding, write });
    expect(await result.json()).toEqual({ status });expect(write).toHaveBeenCalledTimes(1);expect(append).not.toHaveBeenCalled();
  });
  it.each([{ ...ack, canonicalId: NEXT }, { ...ack, mutationId: NEXT }, { ...ack, revisionNumber: 9 },
    { ...ack, selfReviewStatus: "CONFIRMED" }, { ...ack, draftText: "private" }])("revalidates the bound writer receipt", async saved => {
    const f = await setup(), append = vi.spyOn(f.api, "appendDocumentRevision");
    const response = await handleCommunicationNoteEdit(request(), DOC, { ...f.binding, write: async () => saved as never });
    expect(response.status).toBe(503);expect(await response.json()).toEqual({ status: "UNAVAILABLE" });expect(append).not.toHaveBeenCalled();
  });
  it("does not invoke the writer before valid origin/Auth/body/current-base checks", async () => {
    const f = await setup(), write = vi.fn(async () => ack);
    expect((await handleCommunicationNoteEdit(request(body, { origin: "https://foreign.test" }), DOC, { ...f.binding, write })).status).toBe(400);
    expect((await handleCommunicationNoteEdit(request({ ...body, baseRevisionId: NEXT }), DOC, { ...f.binding, write })).status).toBe(409);
    f.binding.runtime.resolveAuth.mockResolvedValue({ ok: false, status: 401, reason: "auth_required" });
    const r = request();expect((await handleCommunicationNoteEdit(r, DOC, { ...f.binding, write })).status).toBe(401);
    expect(r.bodyUsed).toBe(false);expect(write).not.toHaveBeenCalled();
  });
  it("treats writer throws or post-commit abort as uncertain without fallback", async () => {
    const f = await setup(), append = vi.spyOn(f.api, "appendDocumentRevision"), controller = new AbortController();
    const thrown = await handleCommunicationNoteEdit(request(), DOC, { ...f.binding, write: async () => { throw new Error("private backend"); } });
    expect(thrown.status).toBe(503);expect(await thrown.json()).toEqual({ status: "UNAVAILABLE" });
    const aborted = await handleCommunicationNoteEdit(new Request(request(), { signal: controller.signal }), DOC,
      { ...f.binding, write: async () => { controller.abort();return ack; } });
    expect(aborted.status).toBe(503);expect(append).not.toHaveBeenCalled();
  });
});
const ack = { status: "SAVED", canonicalId: DOC, baseRevisionId: REV, revisionId: NEXT, revisionNumber: 2,
  mutationId: KEY, saveState: "SERVER_ACKNOWLEDGED", selfReviewStatus: "REQUIRED", draftNotice: "Draft – review required" } as const;
const expected = { canonicalId: DOC, baseRevisionId: REV, mutationId: KEY, baseRevisionNumber: 1 };

describe("Communication Note wording edit boundary", () => {
  it("keeps the formal route unbound and body unread", async () => {
    const r = request(); expect((await handleCommunicationNoteEdit(r, DOC)).status).toBe(503); expect(r.bodyUsed).toBe(false);
    const route = readFileSync(new URL("../app/api/ai-documents/communication-note/documents/[documentId]/revisions/route.ts", import.meta.url), "utf8");
    expect(route).toContain("handleCommunicationNoteEdit(request, (await context.params).documentId)");
    expect(route).not.toMatch(/fixture|process\.env|createMemory|service_role/);
  });
  it("authenticates DOCUMENT_WRITE before reading text or acquiring a store", async () => {
    const { binding } = await setup(); binding.runtime.resolveAuth.mockResolvedValue({ ok: false, reason: "session_revoked", status: 401 });
    const r = request(); expect((await handleCommunicationNoteEdit(r, DOC, binding)).status).toBe(401); expect(r.bodyUsed).toBe(false);
    expect(binding.runtime.getProductApi).not.toHaveBeenCalled();
    const routed = binding.runtime.resolveAuth.mock.calls[0][0]; expect(routed.method).toBe("PATCH"); expect(new URL(routed.url).pathname).toBe(`/v1/documents/${DOC}`);
  });
  it("saves a new revision while preserving source facts, warnings, old revision and draft lifecycle", async () => {
    const { api, binding } = await setup(), before = await api.getDocument(DOC);
    const response = await handleCommunicationNoteEdit(request(), DOC, binding); expect(response.status).toBe(200);
    const result = await response.json(); expect(result).toMatchObject({ ...ack, revisionId: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC EDIT"); expect(response.headers.get("cache-control")).toContain("no-store");
    const after = await api.getDocument(DOC); expect(after.revisions).toHaveLength(2); expect(after.revisions[0]).toEqual(before.revisions[0]);
    expect(after.revisions[1].content).toEqual({ ...before.revisions[0].content, englishDraft: body.englishDraft, reviewVersions: body.reviewVersions });
    expect(after.document.lifecycleStatus).toBe("IN_PROGRESS"); expect(after.selfReviewStatus).toBe("REQUIRED");
    expect((await handleCommunicationNoteEdit(request(), DOC, binding)).status).toBe(409); expect((await api.getDocument(DOC)).revisions).toHaveLength(2);
  });
  it("does not create a second revision for concurrent same-command submissions", async () => {
    const { api, binding } = await setup(); const responses = await Promise.all([handleCommunicationNoteEdit(request(), DOC, binding), handleCommunicationNoteEdit(request(), DOC, binding)]);
    expect(responses.every(r => [200, 409].includes(r.status))).toBe(true); expect((await api.getDocument(DOC)).revisions).toHaveLength(2);
  });
  it.each([null, [], { ...body, wordingConfirmed: false }, { ...body, wordingConfirmed: "true" }, { ...body, ownerUserId: KEY },
    { ...body, factsSummary: {} }, { ...body, disclaimer: "Approved" }, { ...body, baseRevisionId: "invalid" },
    { ...body, englishDraft: " " }, { ...body, englishDraft: "x".repeat(8001) }, { ...body, englishDraft: "測".repeat(6000) },
    { ...body, reviewVersions: { "zh-Hans": "one" } }, { ...body, reviewVersions: { ...body.reviewVersions, fr: "no" } },
    { ...body, englishDraft: "bad\u0000text" }])("rejects malformed/oversized/private override input %#", async value => {
    expect(parseCommunicationNoteEditRequest(value)).toBeUndefined();
    const { binding } = await setup(); expect((await handleCommunicationNoteEdit(request(value), DOC, binding)).status).toBe(400);
    expect(binding.runtime.getProductApi).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ origin: "https://attacker.test" }, { "sec-fetch-site": "cross-site" }, { "content-type": "text/plain" }, { origin: "null" }])("rejects unsafe transport %#", async headers => {
    const { binding } = await setup(); expect((await handleCommunicationNoteEdit(request(body, headers), DOC, binding)).status).toBe(400);
    expect(binding.runtime.resolveAuth).not.toHaveBeenCalled();
  });
  it("rejects bearer transport and unknown query before reading text", async () => {
    const { binding } = await setup(); const bearer = request(body, { authorization: "Bearer synthetic" });
    expect((await handleCommunicationNoteEdit(bearer, DOC, binding)).status).toBe(401); expect(bearer.bodyUsed).toBe(false);
    expect((await handleCommunicationNoteEdit(request(body, {}, "?owner=other"), DOC, binding)).status).toBe(400);
  });
  it("stops the bounded stream before store access", async () => {
    const { binding } = await setup(); const response = await handleCommunicationNoteEdit(request({ ...body, englishDraft: "x".repeat(60000) }), DOC, binding);
    expect(response.status).toBe(400); expect(binding.runtime.getProductApi).not.toHaveBeenCalled();
  });
  it.each(["englishDraft", "zh-Hans", "zh-Hant"])("blocks obvious identifiers in %s without persisting or echoing them", async field => {
    const { binding, api } = await setup(); const payload = field === "englishDraft" ? { ...body, englishDraft: "Contact person@example.invalid" }
      : { ...body, reviewVersions: { ...body.reviewVersions, [field]: "Contact person@example.invalid" } };
    const response = await handleCommunicationNoteEdit(request(payload), DOC, binding); expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ status: "PRIVACY_REVIEW_REQUIRED" }); expect((await api.getDocument(DOC)).revisions).toHaveLength(1);
  });
  it.each(["wrong-owner", "wrong-type", "completed", "stale"])("rejects %s before append", async kind => {
    const { binding, api } = await setup(), snapshot = await api.getDocument(DOC), append = vi.spyOn(api, "appendDocumentRevision");
    if (kind === "wrong-owner") vi.spyOn(api, "getDocument").mockRejectedValue(new CaresLinkV1ProductApiError("NOT_FOUND", "private"));
    else { if (kind === "wrong-type") snapshot.document.noteType = "incident_factual";
      if (kind === "completed") snapshot.document.lifecycleStatus = "COMPLETED";
      if (kind === "stale") snapshot.document.currentRevisionId = NEXT;
      vi.spyOn(api, "getDocument").mockResolvedValue(snapshot); }
    expect((await handleCommunicationNoteEdit(request(), DOC, binding)).status).toBe(kind === "stale" ? 409 : 404); expect(append).not.toHaveBeenCalled();
  });
  it("rejects an unchanged draft", async () => {
    const { binding, api } = await setup(), old = (await api.getDocument(DOC)).revisions[0].content;
    expect((await handleCommunicationNoteEdit(request({ ...body, englishDraft: old.englishDraft, reviewVersions: old.reviewVersions }), DOC, binding)).status).toBe(400);
    expect((await api.getDocument(DOC)).revisions).toHaveLength(1);
  });
  it("does not trust an altered acknowledgement or leak backend errors", async () => {
    const { binding, api } = await setup(), real = api.appendDocumentRevision.bind(api);
    vi.spyOn(api, "appendDocumentRevision").mockImplementation(async (...args) => ({ ...await real(...args), lastMutationId: NEXT }));
    expect((await handleCommunicationNoteEdit(request(), DOC, binding)).status).toBe(503);
    expect((await api.getDocument(DOC)).revisions).toHaveLength(2); // An uncertain ACK can follow a commit.
  });
});

describe("edit client acknowledgements", () => {
  it.each([{ ...ack, canonicalId: NEXT }, { ...ack, baseRevisionId: NEXT }, { ...ack, mutationId: NEXT }, { ...ack, revisionId: REV },
    { ...ack, revisionNumber: 1 }, { ...ack, selfReviewStatus: "CONFIRMED" }, { ...ack, extra: "text" }, { ...ack, saveState: "LOCAL" }])("rejects misbound acknowledgement %#", value => {
    expect(parseCommunicationNoteEditResult(value, expected)).toBeUndefined();
  });
  it("posts only the fixed DTO once and checks HTTP/receipt agreement", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, json: async () => ack }));
    const input = { ...expected, request: body, signal: new AbortController().signal, fetcher };
    expect(await saveCommunicationNoteEdit(input)).toEqual(ack); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual([buildCommunicationNoteEditHref(DOC), expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", body: JSON.stringify(body) })]);
    fetcher.mockResolvedValue({ status: 503, json: async () => ack }); expect(await saveCommunicationNoteEdit(input)).toEqual({ status: "UNAVAILABLE" });
  });
  it("never retries lost responses or aborted writes", async () => {
    const fetcher = vi.fn(async () => { throw new Error("private transport detail"); }), controller = new AbortController();
    const input = { ...expected, request: body, signal: controller.signal, fetcher };
    expect(await saveCommunicationNoteEdit(input)).toEqual({ status: "UNAVAILABLE" }); expect(fetcher).toHaveBeenCalledTimes(1);
    controller.abort(); await saveCommunicationNoteEdit(input); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("has all explicit locale labels and errors", () => {
    for (const locale of ["en", "zh-Hans", "zh-Hant"] as const) {
      const copy = getCommunicationNoteEditCopy(locale); expect(Object.keys(copy)).toEqual(Object.keys(getCommunicationNoteEditCopy("en")));
      expect(Object.values(copy).every(value => value.length > 0)).toBe(true);
    }
  });
});
