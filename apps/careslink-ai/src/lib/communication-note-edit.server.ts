import "server-only";
import { buildCommunicationNoteEditHref, EDIT_HTTP_STATUS, parseCommunicationNoteEditRequest, parseCommunicationNoteEditResult,
  type CommunicationNoteEditResult } from "./communication-note-edit-contract";
import { SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";
import type { CaresLinkV1ProductApiRuntime } from "./v1/product-api-runtime.server";
import { createCaresLinkV1ProductApiContentHash } from "./v1/product-api-memory";
import { scanCaresLinkV1CleanedFacts } from "./v1/privacy-review-scanner.server";
import { validateCaresLinkV1CleanedFacts } from "./v1/shared-contracts";
import type { CommunicationNoteDurableEditInput } from "./communication-note-edit-durable.server";

/** No default runtime, read-permission fallback or formal binding. The eventual
 * durable adapter must atomically enforce owner/session, writable lifecycle,
 * privacy, current base and full-command idempotency, including lock waits. */
export async function handleCommunicationNoteEdit(request: Request, canonicalId: string, binding?: Readonly<{
  runtime: CaresLinkV1ProductApiRuntime; localFixtureOrigin?: "http://127.0.0.1:3395";
  write?: (input: CommunicationNoteDurableEditInput) => Promise<CommunicationNoteEditResult>;
}>) {
  const reply = (result: CommunicationNoteEditResult) => Response.json(result, { status: EDIT_HTTP_STATUS[result.status], headers: {
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
  if (!binding) return reply({ status: "UNAVAILABLE" });
  try {
    const url = new URL(request.url);
    const local = url.origin === binding.localFixtureOrigin && !process.env.VERCEL &&
      process.env.CARESLINK_LOCAL_BROWSER_FIXTURE === "SYNTHETIC_LOOPBACK_ONLY" && /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/.test(process.cwd());
    if (request.method !== "POST" || !UUID.test(canonicalId) || url.pathname !== buildCommunicationNoteEditHref(canonicalId) || url.search ||
        (url.protocol !== "https:" && !local) || request.headers.get("origin") !== url.origin ||
        request.headers.get("sec-fetch-site") !== "same-origin" ||
        !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return reply({ status: "INVALID_REQUEST" });
    if (request.headers.has("authorization")) return reply({ status: "AUTH_REQUIRED" });
    // Select DOCUMENT_WRITE, never use the result page's DOCUMENT_DETAIL gate.
    const apiRequest = new Request(`https://careslink.internal/v1/documents/${canonicalId}`, { method: "PATCH", headers: request.headers, signal: request.signal });
    const auth = await binding.runtime.resolveAuth(apiRequest);
    if (!auth.ok) return reply({ status: auth.status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE" });
    if (auth.identity.source !== "cookie") return reply({ status: "AUTH_REQUIRED" });
    if (!UUID.test(auth.identity.userId) || !UUID.test(auth.identity.sessionId)) return reply({ status: "UNAVAILABLE" });
    const mutationId = request.headers.get("idempotency-key") ?? "";
    if (!UUID.test(mutationId)) return reply({ status: "INVALID_REQUEST" });
    const command = parseCommunicationNoteEditRequest(await readJson(request));
    if (!command) return reply({ status: "INVALID_REQUEST" });
    if (request.signal.aborted) return reply({ status: "UNAVAILABLE" });
    const api = await binding.runtime.getProductApi({ userId: auth.identity.userId, sessionId: auth.identity.sessionId, transport: "COOKIE" }, apiRequest);
    if (!api) return reply({ status: "UNAVAILABLE" });
    const snapshot = await api.getDocument(canonicalId);
    const { document, revisions } = snapshot;
    if (document.canonicalId !== canonicalId || document.noteType !== "communication" || document.lifecycleStatus !== "IN_PROGRESS" || document.deletedAt !== null) return reply({ status: "NOT_FOUND" });
    if (document.currentRevisionId !== command.baseRevisionId) return reply({ status: "STALE_REVISION" });
    const base = revisions.find(r => r.revisionId === command.baseRevisionId);
    if (!base || base.canonicalId !== canonicalId || base.revisionNumber !== document.currentRevisionNumber || !base.privacyReviewId ||
        base.contentHash !== createCaresLinkV1ProductApiContentHash(base.content)) return reply({ status: "UNAVAILABLE" });
    validateCaresLinkV1CleanedFacts("communication", base.content.factsSummary);
    // Facts, safety lists, disclaimer, schema and privacy binding are server-owned.
    const content = { ...base.content, englishDraft: command.englishDraft, reviewVersions: { ...command.reviewVersions } };
    const contentHash = createCaresLinkV1ProductApiContentHash(content);
    if (contentHash === base.contentHash) return reply({ status: "INVALID_REQUEST" });
    if (scanCaresLinkV1CleanedFacts({ englishDraft: command.englishDraft, ...command.reviewVersions }).findings.length) return reply({ status: "PRIVACY_REVIEW_REQUIRED" });
    if (request.signal.aborted) return reply({ status: "UNAVAILABLE" });
    if (binding.write) {
      // Explicit injected writer only. A failed/uncertain durable command must
      // never fall through to a generic append or the synthetic memory store.
      const saved = await binding.write({ request, canonicalId, mutationId, command, baseRevisionNumber: base.revisionNumber });
      if (request.signal.aborted) return reply({ status: "UNAVAILABLE" });
      return reply(parseCommunicationNoteEditResult(saved, {
        canonicalId, mutationId, baseRevisionId: base.revisionId, baseRevisionNumber: base.revisionNumber,
      }) ?? { status: "UNAVAILABLE" });
    }
    const saved = await api.appendDocumentRevision(canonicalId, { baseRevisionId: base.revisionId, content, contentHash,
      schemaVersion: base.schemaVersion, privacyReviewId: base.privacyReviewId }, { idempotencyKey: mutationId });
    if (request.signal.aborted || saved.document.canonicalId !== canonicalId || saved.document.noteType !== "communication" ||
        saved.document.lifecycleStatus !== "IN_PROGRESS" || saved.document.currentRevisionId !== saved.revision.revisionId ||
        saved.document.currentRevisionNumber !== base.revisionNumber + 1 || saved.revision.canonicalId !== canonicalId ||
        saved.revision.baseRevisionId !== base.revisionId || saved.revision.contentHash !== contentHash ||
        createCaresLinkV1ProductApiContentHash(saved.revision.content) !== contentHash || saved.revision.privacyReviewId !== base.privacyReviewId ||
        saved.revision.mutationId !== mutationId) return reply({ status: "UNAVAILABLE" });
    return reply(parseCommunicationNoteEditResult({ status: "SAVED", canonicalId, baseRevisionId: base.revisionId,
      revisionId: saved.revision.revisionId, revisionNumber: saved.revision.revisionNumber, mutationId: saved.lastMutationId,
      saveState: saved.saveState, selfReviewStatus: "REQUIRED", draftNotice: "Draft – review required" },
    { canonicalId, baseRevisionId: base.revisionId, baseRevisionNumber: base.revisionNumber, mutationId }) ?? { status: "UNAVAILABLE" });
  } catch (error) {
    // Only domain codes, never backend messages, wording, tokens or SQL details.
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    return reply({ status: code === "AUTH_REQUIRED" || code === "SESSION_REVOKED" ? "AUTH_REQUIRED"
      : code === "NOT_FOUND" ? "NOT_FOUND" : code === "STALE_REVISION" ? "STALE_REVISION"
      : code === "PRIVACY_REVIEW_REQUIRED" || code === "PRIVACY_REVIEW_EXPIRED" ? "PRIVACY_REVIEW_REQUIRED" : "UNAVAILABLE" });
  }
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.body) return;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 50 * 1024 || request.signal.aborted) { await reader.cancel(); return; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { return; } finally { reader.releaseLock(); }
}
