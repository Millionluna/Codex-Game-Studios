/** TEST ONLY: synthetic Auth and PROCESS_MEMORY_ONLY storage. No PostgreSQL,
 * Hosted binding or durable/cross-device claim. Only the owned --edit runner. */
import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { handleCommunicationNoteEdit } from "../../src/lib/communication-note-edit.server";
import { handleCommunicationNoteDocumentRead } from "../../src/lib/communication-note-document.server";
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
  return { store, principal, reviews };
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
