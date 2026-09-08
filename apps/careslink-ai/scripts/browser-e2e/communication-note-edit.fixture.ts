/** TEST ONLY: synthetic Auth and PROCESS_MEMORY_ONLY storage. No PostgreSQL,
 * Hosted binding or durable/cross-device claim. Only the owned --edit runner. */
import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { handleCommunicationNoteEdit } from "../../src/lib/communication-note-edit.server";
import { handleCommunicationNoteDocumentRead, readCommunicationNoteDocument } from "../../src/lib/communication-note-document.server";
import { handleExportHistory, type ExportHistoryBinding } from "../../src/lib/communication-note-export-history.server";
import { buildExportHistoryHref, EXPORT_HISTORY_LIMIT, type ExportHistoryEntry } from "../../src/lib/communication-note-export-history-contract";
import { COMMUNICATION_NOTE_TEXT_TEMPLATE } from "../../src/lib/communication-note-export";
import { handleCommunicationNoteSelfReview } from "../../src/lib/communication-note-self-review.server";
import { createMemoryCaresLinkV1ProductApiStore, createCaresLinkV1ProductApiContentHash, createCaresLinkV1CleanedFactsHash } from "../../src/lib/v1/product-api-memory";
import { createValidCaresLinkV1CleanedFacts } from "../../src/lib/v1/cleaned-facts-test-fixtures";
import { CARESLINK_V1_NOTE_SCHEMA_VERSION, CARESLINK_V1_PRIVACY_REVIEW_REVISION, CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION } from "../../src/lib/v1/shared-contracts";
import type { CaresLinkV1ProductApiRuntime } from "../../src/lib/v1/product-api-runtime.server";
import type { CommunicationNoteSelfReviewResult } from "../../src/lib/communication-note-self-review-contract";
export const EDIT_DOC = "44444444-4444-4444-8444-444444444444", EDIT_REV = "55555555-5555-4555-8555-555555555555";
const OWNER = "11111111-1111-4111-8111-111111111111", SESSION = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PROOF = "66666666-6666-4666-8666-666666666666";

export async function createEditFixtureState() {
  const factsSummary = createValidCaresLinkV1CleanedFacts("communication");
  const content = { englishDraft: "SYNTHETIC TEST DRAFT. The worker recorded the agreed information after a phone call.",
    reviewVersions: { "zh-Hans": "合成测试草稿：工作人员记录了电话沟通中确认的信息。", "zh-Hant": "合成測試草稿：工作人員記錄了電話溝通中確認的資訊。" },
    factsSummary, missingFacts: [], neutralWordingChecks: [], followUpPrompts: [], disclaimer: "Draft – review required" };
  const ids = [EDIT_DOC, EDIT_REV], now = new Date().toISOString();
  const store = createMemoryCaresLinkV1ProductApiStore({ createId: () => ids.shift() ?? randomUUID(), initialPrivacyProofs: [{
    id: PROOF, ownerUserId: OWNER, noteType: "communication", cleanedFactsHash: createCaresLinkV1CleanedFactsHash(factsSummary),
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION, status: "CONFIRMED", scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
    reviewRevision: CARESLINK_V1_PRIVACY_REVIEW_REVISION, findingDecisions: [], confirmedAt: now, expiresAt: new Date(Date.now() + 3600000).toISOString(),
  }] });
  const principal = { userId: OWNER, sessionId: SESSION, transport: "COOKIE" } as const;
  await store.forPrincipal(principal).createDocument({ noteType: "communication", sourceLocale: "en", content,
    contentHash: createCaresLinkV1ProductApiContentHash(content), schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION, privacyReviewId: PROOF },
  { idempotencyKey: "synthetic:edit:seed:0001" });
  const reviews = new Map<string, Extract<CommunicationNoteSelfReviewResult, { status: "CONFIRMED" }>>();
  const exportHistory = new Map<string, ExportHistoryEntry>();
  return { store, principal, reviews, exportHistory };
}
const STATE = Symbol.for("careslink.synthetic.edit.fixture");
function guard() {
  if (!/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/.test(process.cwd()) || process.env.VERCEL ||
      process.env.CARESLINK_LOCAL_BROWSER_FIXTURE !== "SYNTHETIC_LOOPBACK_ONLY" || process.env.CARESLINK_LOCAL_EDIT_FIXTURE !== "PROCESS_MEMORY_ONLY") throw new Error("Local edit fixture unavailable");
}
async function fixture() {
  guard();
  const globals = globalThis as typeof globalThis & { [STATE]?: ReturnType<typeof createEditFixtureState> };
  return globals[STATE] ??= createEditFixtureState();
}
async function runtime(): Promise<CaresLinkV1ProductApiRuntime> {
  const state = await fixture();
  const mode = (await cookies()).get("cl_browser_fixture")?.value;
  return {
    resolveAuth: async () => mode === "unavailable" ? { ok: false, reason: "auth_unavailable", status: 503 }
      : ["anonymous", "revoked"].includes(mode ?? "") ? { ok: false, reason: "auth_required", status: 401 }
      : { ok: true, identity: { source: "cookie", userId: mode === "foreign" ? FOREIGN : OWNER, sessionId: SESSION } },
    getProductApi: async principal => {
      const api = state.store.forPrincipal(principal);
      return { ...api, getDocument: async id => {
        const snapshot = await api.getDocument(id);
        snapshot.selfReviewStatus = [...state.reviews.values()].some(r => r.revisionId === snapshot.document.currentRevisionId) ? "CONFIRMED" : "REQUIRED";
        return snapshot;
      } };
    },
  };
}
function localRequest(request: Request) {
  guard(); if (request.headers.get("host") !== "127.0.0.1:3395") throw new Error("Fixture host denied");
  const url = new URL(request.url);
  return new Request(new URL(url.pathname + url.search, "http://127.0.0.1:3395"), request);
}
export async function readEditFixtureDocument(request: Request, id: string) {
  return handleCommunicationNoteDocumentRead(localRequest(request), id, await runtime());
}
export async function saveEditFixtureDocument(request: Request, id: string) {
  const response = await handleCommunicationNoteEdit(localRequest(request), id, { runtime: await runtime(), localFixtureOrigin: "http://127.0.0.1:3395" });
  console.log(JSON.stringify({ fixture: "edit-http", status: response.status, storage: "PROCESS_MEMORY_ONLY" }));
  return response;
}
export async function confirmEditFixtureReview(request: Request, id: string) {
  const r = localRequest(request), source = await runtime();
  return handleCommunicationNoteSelfReview(r, id, { localFixtureOrigin: "http://127.0.0.1:3395", write: async ({ canonicalId, mutationId, confirmation }) => {
    const auth = await source.resolveAuth(r);
    if (!auth.ok) return { status: auth.status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE" };
    if (auth.identity.userId !== OWNER || canonicalId !== EDIT_DOC) return { status: "NOT_FOUND" };
    const state = await fixture(), snapshot = await state.store.forPrincipal(state.principal).getDocument(id);
    if (snapshot.document.currentRevisionId !== confirmation.revisionId) return { status: "STALE_REVISION" };
    const existing = state.reviews.get(mutationId);
    if (existing) return existing.revisionId === confirmation.revisionId ? existing : { status: "INVALID_REQUEST" };
    if (state.reviews.size >= 64) return { status: "UNAVAILABLE" };
    const receipt = { status: "CONFIRMED", canonicalId, mutationId, revisionId: confirmation.revisionId,
      saveState: "SERVER_ACKNOWLEDGED", draftNotice: "Draft – review required" } as const;
    state.reviews.set(mutationId, receipt); return receipt;
  } });
}

/** Test-only process memory, never installed in a formal route. The browser
 * receipt names PROCESS_MEMORY_ONLY and the UI displays that limitation. */
export function createEditFixtureHistoryBinding(state: Awaited<ReturnType<typeof createEditFixtureState>>, source: CaresLinkV1ProductApiRuntime): ExportHistoryBinding {
  async function authorize(request: Request, canonicalId: string, revisionId: string) {
    const url = new URL(request.url);
    url.pathname = buildExportHistoryHref(canonicalId).replace(/\/export-history$/, "");
    url.search = new URLSearchParams({ revisionId }).toString();
    return readCommunicationNoteDocument(new Request(url, { headers: request.headers, signal: request.signal }), canonicalId, source);
  }
  return {
    localFixtureOrigin: "http://127.0.0.1:3395",
    record: async ({ request, canonicalId, attemptId, report }) => {
      const saved = await authorize(request, canonicalId, report.revisionId);
      if (saved.status !== "AVAILABLE") return { status: saved.status === "EMPTY" ? "NOT_FOUND" : saved.status };
      if (!saved.isCurrentRevision) return { status: "STALE_REVISION" };
      if (saved.selfReviewStatus !== "CONFIRMED") return { status: "REVIEW_REQUIRED" };
      if (request.signal.aborted) return { status: "UNAVAILABLE" };
      const existing = state.exportHistory.get(attemptId);
      if (existing && (existing.revisionId !== report.revisionId || existing.format !== report.format ||
          existing.outcome !== report.outcome || existing.startedAt !== report.startedAt)) return { status: "INVALID_REQUEST" };
      if (!existing && state.exportHistory.size >= 128) return { status: "UNAVAILABLE" };
      const entry: ExportHistoryEntry = existing ?? Object.freeze({ ...report, attemptId,
        revisionNumber: saved.revision.revisionNumber, recordedAt: new Date().toISOString(),
        templateVersion: COMMUNICATION_NOTE_TEXT_TEMPLATE, profile: "RECORD_COPY" });
      state.exportHistory.set(attemptId, entry);
      return { status: "RECORDED", canonicalId, storage: "PROCESS_MEMORY_ONLY", entry };
    },
    list: async ({ request, canonicalId, revisionId }) => {
      const saved = await authorize(request, canonicalId, revisionId);
      if (saved.status !== "AVAILABLE") return { status: saved.status === "EMPTY" ? "NOT_FOUND" : saved.status };
      if (request.signal.aborted) return { status: "UNAVAILABLE" };
      const all = [...state.exportHistory.values()].filter(item => item.revisionId === revisionId)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.attemptId.localeCompare(a.attemptId));
      return { status: "AVAILABLE", canonicalId, revisionId, storage: "PROCESS_MEMORY_ONLY",
        entries: all.slice(0, EXPORT_HISTORY_LIMIT), hasMore: all.length > EXPORT_HISTORY_LIMIT };
    },
  };
}
export async function editFixtureExportHistory(request: Request, id: string) {
  return handleExportHistory(localRequest(request), id, createEditFixtureHistoryBinding(await fixture(), await runtime()));
}
