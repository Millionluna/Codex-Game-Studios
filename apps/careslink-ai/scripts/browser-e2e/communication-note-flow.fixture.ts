/** TEST ONLY: one fixed synthetic admission/task, real local saved-result RPCs.
 * No worker, model, Points write, payload vault, arbitrary facts or formal gate.
 * Task state is process memory; the pre-seeded result is NOT generated output. */
import "server-only";
import { createHash } from "node:crypto";
import { createTestOnlyCommunicationNoteGenerationHandler } from "../../src/lib/communication-note-generation-route.server";
import { createCommunicationNoteGenerationPrincipalResolver } from "../../src/lib/communication-note-generation-principal.server";
import { createTestOnlyCommunicationNoteGenerationJobRecoveryHandler } from "../../src/lib/communication-note-generation-job-recovery.server";
import { loadCommunicationNoteDocument } from "../../src/lib/communication-note-document-client";
import type { CommunicationNoteGenerationJob, CommunicationNoteGenerationResult } from "../../src/lib/communication-note-generation-contract";
import { stringifyCaresLinkV1CanonicalJson } from "../../src/lib/v1/canonical-json";
import { CaresLinkV1ContractError } from "../../src/lib/v1/shared-contracts";
import { assertReviewDatabaseFixture, createReviewDatabaseAuthClient, readReviewDatabaseDocument, REVIEW_DOC } from "./communication-note-self-review.fixture";

export const FLOW_JOB = "99999999-9999-4999-8999-999999999999";
export const FLOW_REV = "22222222-2222-4222-8222-222222222222";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORIGIN = "http://127.0.0.1:3395", API = "/api/ai-documents/communication-note";
export const FLOW_FACTS = Object.freeze({
  occurred_at: "2026-09-07T10:15:30+10:00", contact_channel: "Phone", parties_by_role: ["Support worker"],
  observable_facts: "Synthetic call occurred.", action_taken: "Synthetic information was recorded.",
  stated_outcome: "No further information supplied.",
});
export const FLOW_POINTS = Object.freeze({ status: "AVAILABLE", unit: "POINTS", serviceCode: "note.communication.generate",
  catalogVersion: "SYNTHETIC_DISPLAY_ONLY", generationCostPoints: 20, availablePoints: 100, reservedPoints: 0, canAfford: true } as const);
type Admission = { keyDigest: string; requestDigest: string; created: number; result: CommunicationNoteGenerationResult };
const STATE = Symbol.for("careslink.synthetic.browser.flow");
const digest = (value: unknown) => createHash("sha256").update(stringifyCaresLinkV1CanonicalJson(value)).digest("hex");
export function assertFlowFixture() {
  assertReviewDatabaseFixture();
  if (process.env.CARESLINK_LOCAL_FLOW_FIXTURE !== "FIXED_SYNTHETIC_ONLY" ||
      process.env.CARESLINK_LOCAL_HISTORY_DATABASE !== "OWNED_UNIX_SOCKET_ONLY" ||
      process.env.CARESLINK_LOCAL_EDIT_DATABASE !== "OWNED_UNIX_SOCKET_ONLY") throw new Error("Local flow fixture unavailable");
}
function state() {
  assertFlowFixture();
  const scope = globalThis as typeof globalThis & { [STATE]?: { admission?: Admission } };
  return scope[STATE] ??= {};
}
function principal() {
  assertFlowFixture();
  return createCommunicationNoteGenerationPrincipalResolver({ env: { CARESLINK_V1_PRODUCT_API_ENABLED: "true" },
    createCookieAuthClient: createReviewDatabaseAuthClient, validateCurrentSessionAuthority: () => { assertFlowFixture(); return true; } });
}
function reply(status: "AUTH_REQUIRED" | "NOT_FOUND" | "UNAVAILABLE" | "FORBIDDEN", httpStatus: number) {
  return Response.json({ status }, { status: httpStatus, headers: { "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie, Authorization", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
}
function transport(request: Request, path: string, method: string) {
  const url = new URL(request.url);
  return request.method === method && request.headers.get("host") === "127.0.0.1:3395" && url.pathname === path &&
    !url.search && request.headers.get("sec-fetch-site") === "same-origin" && !request.headers.has("authorization") &&
    (method === "POST" ? request.headers.get("origin") === ORIGIN : !request.headers.has("origin") || request.headers.get("origin") === ORIGIN);
}
async function savedResult(request: Request) {
  return loadCommunicationNoteDocument({ canonicalId: REVIEW_DOC, revisionId: FLOW_REV, signal: request.signal,
    fetcher: async input => readReviewDatabaseDocument(new Request(new URL(String(input), ORIGIN), {
      headers: request.headers, signal: request.signal,
    }), REVIEW_DOC) });
}
function job(admission: Admission): CommunicationNoteGenerationJob {
  const elapsed = Date.now() - admission.created, createdAt = new Date(admission.created).toISOString();
  const base = { jobId: FLOW_JOB, noteType: "communication", serviceCode: "note.communication.generate", createdAt } as const;
  // Time-derived synthetic progress; GET never submits, writes or runs a worker.
  if (elapsed < 8000) return { ...base, status: "QUEUED", attemptCount: 0, updatedAt: createdAt };
  const startedAt = new Date(admission.created + 8000).toISOString();
  if (elapsed < 16000) return { ...base, status: "RUNNING", attemptCount: 1, startedAt, updatedAt: startedAt };
  const finishedAt = new Date(admission.created + 16000).toISOString();
  return { ...base, status: "SUCCEEDED", attemptCount: 1, startedAt, finishedAt, updatedAt: finishedAt, result: admission.result };
}

export async function submitFlowTask(request: Request) {
  assertFlowFixture();
  if (!transport(request, API + "/generate", "POST")) return reply("FORBIDDEN", 403);
  // Adapt the already-checked loopback transport ONLY inside this owned fixture.
  // This is NOT TLS evidence and does not relax the formal HTTPS-only handler.
  const headers = new Headers(request.headers);
  headers.set("origin", "https://flow.fixture.invalid"); headers.set("host", "flow.fixture.invalid");
  const internal = new Request("https://flow.fixture.invalid" + API + "/generate", new Request(request, { headers }));
  const handler = createTestOnlyCommunicationNoteGenerationHandler({
    capability: "TEST_ONLY_M1X_COMMUNICATION_NOTE_GENERATION_ROUTE", runtimeEnabled: true, resolvePrincipal: principal(),
    submitter: { submit: async command => {
      if (command.principal.userId !== OWNER || command.principal.sessionId !== SESSION)
        throw new CaresLinkV1ContractError("NOT_FOUND", "Synthetic fixture unavailable");
      if (command.sourceLocale !== "en" || digest(command.cleanedFacts) !== digest(FLOW_FACTS))
        throw new CaresLinkV1ContractError("VALIDATION_ERROR", "Only the fixed synthetic English fixture is accepted");
      const result = await savedResult(request);
      if (result.status === "AUTH_REQUIRED") throw new CaresLinkV1ContractError("AUTH_REQUIRED", "Synthetic session unavailable");
      if (result.status !== "AVAILABLE" || result.sourceLocale !== "en" || result.revision.revisionNumber !== 1 ||
          digest(result.revision.content.factsSummary) !== digest(FLOW_FACTS)) throw new Error("Synthetic result mismatch");
      if (request.signal.aborted) throw new Error("Synthetic request aborted");
      const scope = state(), keyDigest = digest(command.idempotencyKey);
      const requestDigest = digest({ sourceLocale: command.sourceLocale, facts: command.cleanedFacts, privacy: command.privacyReview });
      if (scope.admission) {
        if (scope.admission.keyDigest !== keyDigest || scope.admission.requestDigest !== requestDigest)
          throw new CaresLinkV1ContractError("IDEMPOTENCY_CONFLICT", "This fixture accepts one synthetic task per run");
        console.log(JSON.stringify({ fixture: "synthetic-flow-admission", created: false, taskStorage: "PROCESS_MEMORY_ONLY", pointsWritten: false, modelCalled: false }));
        return { created: false, job: job(scope.admission) };
      }
      const created = Date.now();
      const admission = { keyDigest, requestDigest, created, result: { canonicalId: REVIEW_DOC, revisionId: FLOW_REV, revisionNumber: 1,
        baseRevisionId: null, contentHash: result.revision.contentHash, saveState: "SERVER_ACKNOWLEDGED" } as const };
      scope.admission = admission;
      console.log(JSON.stringify({ fixture: "synthetic-flow-admission", created: true, taskStorage: "PROCESS_MEMORY_ONLY", pointsWritten: false, modelCalled: false }));
      return { created: true, job: { jobId: FLOW_JOB, noteType: "communication", serviceCode: "note.communication.generate",
        status: "QUEUED", attemptCount: 0, createdAt: new Date(created).toISOString(), updatedAt: new Date(created).toISOString() } };
    } },
  });
  return handler(internal);
}

export async function readFlowTask(request: Request, jobId: string) {
  assertFlowFixture();
  if (!transport(request, API + "/jobs/" + jobId, "GET")) return reply("FORBIDDEN", 403);
  const handler = createTestOnlyCommunicationNoteGenerationJobRecoveryHandler({
    capability: "TEST_ONLY_COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY", resolvePrincipal: principal(),
    createRepository: ({ principal: identity }) => ({ get: async ({ jobId: id }) => {
      const admission = state().admission;
      if (identity.userId !== OWNER || identity.sessionId !== SESSION || id !== FLOW_JOB || !admission)
        throw new CaresLinkV1ContractError("NOT_FOUND", "Synthetic task unavailable");
      const result = await savedResult(request);
      if (result.status === "AUTH_REQUIRED") throw new CaresLinkV1ContractError("AUTH_REQUIRED", "Synthetic session unavailable");
      if (result.status !== "AVAILABLE" || result.revision.contentHash !== admission.result.contentHash)
        throw new CaresLinkV1ContractError("NOT_FOUND", "Synthetic result unavailable");
      const value = job(admission);
      console.log(JSON.stringify({ fixture: "synthetic-flow-read", status: value.status, taskStorage: "PROCESS_MEMORY_ONLY", databaseJobWritten: false }));
      return value;
    } }),
  });
  return handler(request, jobId);
}

export async function flowResultBoundary(request: Request, documentId: string,
  handle: (request: Request, id: string) => Promise<Response>) {
  assertFlowFixture();
  if (request.headers.get("host") !== "127.0.0.1:3395" || request.headers.get("sec-fetch-site") !== "same-origin" ||
      request.headers.has("authorization")) return reply("FORBIDDEN", 403);
  const auth = await principal()(request);
  if (!auth.ok) return reply(auth.status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE", auth.status);
  const admission = state().admission;
  if (auth.principal.userId !== OWNER || auth.principal.sessionId !== SESSION || documentId !== REVIEW_DOC ||
      !admission || job(admission).status !== "SUCCEEDED") return reply("NOT_FOUND", 404);
  return handle(request, documentId);
}
