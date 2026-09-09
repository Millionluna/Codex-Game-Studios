import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { handleCommunicationNoteSelfReview } from "./communication-note-self-review.server";
import { confirmCommunicationNoteSelfReview } from "./communication-note-self-review-client";
import { buildCommunicationNoteSelfReviewHref, type CommunicationNoteSelfReviewResult } from "./communication-note-self-review-contract";
vi.mock("server-only", () => ({}));

const DOC = "44444444-4444-4444-8444-444444444444", REV = "55555555-5555-4555-8555-555555555555";
const KEY = "11111111-1111-4111-8111-111111111111";
const body = { revisionId: REV, factsConfirmed: true, wordingConfirmed: true, missingFactsReviewed: true } as const;
const ack = { status: "CONFIRMED", canonicalId: DOC, revisionId: REV, mutationId: KEY,
  saveState: "SERVER_ACKNOWLEDGED", draftNotice: "Draft – review required" } as const;
const url = `https://example.test${buildCommunicationNoteSelfReviewHref(DOC)}`;
function request(payload: unknown = body, headers: Record<string, string> = {}, suffix = "") {
  return new Request(url + suffix, { method: "POST", body: JSON.stringify(payload), headers: {
    origin: "https://example.test", "sec-fetch-site": "same-origin", "content-type": "application/json", "idempotency-key": KEY, ...headers,
  } });
}

describe("Communication self-review HTTP boundary", () => {
  it("keeps the formal writer absent and default-off without reading the body", async () => {
    const r = request(); const json = vi.spyOn(r, "json");
    const response = await handleCommunicationNoteSelfReview(r, DOC);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expect(json).not.toHaveBeenCalled(); expect(r.bodyUsed).toBe(false);
    const route = readFileSync(new URL("../app/api/ai-documents/communication-note/documents/[documentId]/self-review/route.ts", import.meta.url), "utf8");
    expect(route).toContain("handleCommunicationNoteSelfReview(request, (await context.params).documentId)");
    expect(route).not.toMatch(/fixture|process\.env|service.role|createMemory/);
  });
  it("sends only the exact version and confirmations to the trusted writer and returns a bound receipt", async () => {
    const write = vi.fn(async () => ack);
    const r = request(); const response = await handleCommunicationNoteSelfReview(r, DOC, { write });
    expect(write).toHaveBeenCalledExactlyOnceWith({ request: r, canonicalId: DOC, mutationId: KEY, confirmation: body });
    expect(await response.json()).toEqual(ack); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it.each([
    { ...body, factsConfirmed: false }, { ...body, wordingConfirmed: false }, { ...body, missingFactsReviewed: false },
    { ...body, factsConfirmed: "true" }, { ...body, ownerUserId: KEY }, { ...body, noteType: "incident" },
    { ...body, revisionId: "not-a-revision" }, { ...body, extra: "private text" }, [], null,
  ])("denies malformed or extra body fields before the writer: %j", async payload => {
    const write = vi.fn(async () => ack);
    expect((await handleCommunicationNoteSelfReview(request(payload), DOC, { write })).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { origin: "https://attacker.test" }, { origin: "null" }, { origin: "" },
    { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "" },
    { "content-type": "text/plain" }, { "idempotency-key": "" },
  ])("blocks unsafe transport before any writer call: %j", async headers => {
    const write = vi.fn(async () => ack);
    expect((await handleCommunicationNoteSelfReview(request(body, headers), DOC, { write })).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
  it("rejects bearer credentials, query injection and plain HTTP", async () => {
    const write = vi.fn(async () => ack);
    expect((await handleCommunicationNoteSelfReview(request(body, { authorization: "Bearer synthetic" }), DOC, { write })).status).toBe(401);
    expect((await handleCommunicationNoteSelfReview(request(body, {}, "?owner=other"), DOC, { write })).status).toBe(400);
    expect((await handleCommunicationNoteSelfReview(new Request(url.replace("https:", "http:"), request()), DOC, { write })).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
  it("bounds streamed bytes even without Content-Length", async () => {
    const write = vi.fn(async () => ack);
    const r = request({ ...body, extra: "x".repeat(2048) });
    expect(r.headers.has("content-length")).toBe(false);
    expect((await handleCommunicationNoteSelfReview(r, DOC, { write })).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
  it.each([
    ["AUTH_REQUIRED", 401], ["NOT_FOUND", 404], ["STALE_REVISION", 409], ["UNAVAILABLE", 503],
  ] as const)("preserves the writer's content-free %s result", async (status, http) => {
    const response = await handleCommunicationNoteSelfReview(request(), DOC, { write: async () => ({ status }) });
    expect(response.status).toBe(http); expect(await response.json()).toEqual({ status });
  });
  it("never exposes writer details or an unbound receipt", async () => {
    for (const value of [{ ...ack, revisionId: KEY }, { ...ack, mutationId: REV }, { ...ack, canonicalId: REV }, { ...ack, details: "secret" }]) {
      const response = await handleCommunicationNoteSelfReview(request(), DOC, { write: async () => value });
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    }
    const response = await handleCommunicationNoteSelfReview(request(), DOC, { write: async () => { throw new Error("private DB detail"); } });
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
  });
  it("ignores aborted requests and does not turn an aborted completion into success", async () => {
    const c = new AbortController(); c.abort(); const write = vi.fn(async () => ack);
    expect((await handleCommunicationNoteSelfReview(new Request(request(), { signal: c.signal }), DOC, { write })).status).not.toBe(200);
    expect(write).not.toHaveBeenCalled();
    const pending = new AbortController();
    const response = await handleCommunicationNoteSelfReview(new Request(request(), { signal: pending.signal }), DOC, {
      write: async () => { pending.abort(); return ack; },
    });
    expect(response.status).toBe(503);
  });
});

describe("Communication self-review browser client", () => {
  const input = () => ({ canonicalId: DOC, mutationId: KEY, request: body, signal: new AbortController().signal });
  it("uses one same-origin no-store POST, no draft text and no automatic retry", async () => {
    const fetcher = vi.fn(async () => ({ status: 200, json: async () => ack }));
    expect(await confirmCommunicationNoteSelfReview({ ...input(), fetcher })).toEqual(ack);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual([buildCommunicationNoteSelfReviewHref(DOC), expect.objectContaining({
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", body: JSON.stringify(body),
      headers: expect.objectContaining({ "Idempotency-Key": KEY }),
    })]);
  });
  it.each([
    { ...ack, revisionId: KEY }, { ...ack, canonicalId: REV }, { ...ack, mutationId: REV },
    { ...ack, saveState: "SAVED_ON_DEVICE" }, { ...ack, private: "secret" }, { status: "CONFIRMED" },
  ])("rejects malformed or cross-command success: %j", async payload => {
    expect(await confirmCommunicationNoteSelfReview({ ...input(), fetcher: async () => ({ status: 200, json: async () => payload }) }))
      .toEqual({ status: "UNAVAILABLE" });
  });
  it("rejects status/envelope mismatch, invalid IDs, aborted and lost responses", async () => {
    const fetcher = vi.fn(async () => ({ status: 503, json: async () => ack }));
    expect(await confirmCommunicationNoteSelfReview({ ...input(), fetcher })).toEqual({ status: "UNAVAILABLE" });
    fetcher.mockClear();
    expect(await confirmCommunicationNoteSelfReview({ ...input(), canonicalId: "bad", fetcher })).toEqual({ status: "INVALID_REQUEST" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await confirmCommunicationNoteSelfReview({ ...input(), signal: AbortSignal.abort(), fetcher })).toEqual({ status: "UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await confirmCommunicationNoteSelfReview({ ...input(), fetcher: async () => { throw new Error("lost ack"); } })).toEqual({ status: "UNAVAILABLE" });
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND", "STALE_REVISION", "INVALID_REQUEST", "UNAVAILABLE"] as const)("preserves %s with the exact HTTP status", async status => {
    const http = { AUTH_REQUIRED: 401, NOT_FOUND: 404, STALE_REVISION: 409, INVALID_REQUEST: 400, UNAVAILABLE: 503 }[status];
    expect(await confirmCommunicationNoteSelfReview({ ...input(), fetcher: async () => ({ status: http, json: async () => ({ status }) }) }))
      .toEqual({ status } satisfies CommunicationNoteSelfReviewResult);
  });
});
