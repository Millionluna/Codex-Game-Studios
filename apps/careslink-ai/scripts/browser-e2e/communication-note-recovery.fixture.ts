/** TEST ONLY: copied into an owned loopback Next app by the browser runner.
 * Actual HTTP principal/purpose/repository and document projection; synthetic
 * Auth, credential receipts and SQL ports. Never import from product runtime.
 */
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createCommunicationNoteJobRecoveryComposition } from "../../src/lib/communication-note-job-recovery-composition.server";
import { createCaresLinkV1CommunicationNoteJobStatusCredentialResolver as resolver,
  createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget as target,
  createCaresLinkV1CommunicationNoteJobStatusPurposeSessionLease as lease } from "../../src/lib/v1/communication-note-job-status-purpose-caller.server";
import { CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL as SQL } from "../../src/lib/v1/communication-note-job-status-repository.server";
import { stringifyCaresLinkV1CanonicalJson } from "../../src/lib/v1/canonical-json";
import { handleCommunicationNoteDocumentRead } from "../../src/lib/communication-note-document.server";
import { createValidCaresLinkV1CleanedFacts } from "../../src/lib/v1/cleaned-facts-test-fixtures";
import type { CaresLinkV1ProductApi } from "../../src/lib/v1/transport-contract";
import { CaresLinkV1ProductApiError } from "../../src/lib/v1/product-api-memory";

export const JOB = "33333333-3333-4333-8333-333333333333";
export const DOC = "44444444-4444-4444-8444-444444444444";
export const REV = "55555555-5555-4555-8555-555555555555";
const USER = "11111111-1111-4111-8111-111111111111", SESSION = "22222222-2222-4222-8222-222222222222";
const REF = "abcdefghijklmnopqrst", CREATED = "2026-09-07T00:00:00.000Z";
export const MODES = ["queued", "running", "succeeded", "failed", "cancelled", "unavailable", "revoked", "anonymous", "foreign"] as const;
const hash = (value: unknown) => createHash("sha256").update(stringifyCaresLinkV1CanonicalJson(value)).digest("hex");
const receipt = (value: Record<string, unknown>) => ({ ...value, receiptDigest: hash(value) });
function guard() {
  if (!/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/.test(process.cwd()) ||
      process.env.CARESLINK_LOCAL_BROWSER_FIXTURE !== "SYNTHETIC_LOOPBACK_ONLY" || process.env.VERCEL) throw new Error("Local browser fixture unavailable");
}
export function observeFixtureNetwork(request: Request) {
  guard();
  const query = new URL(request.url).searchParams;
  const expected = ["kind", "online", "page", "sequence", "trusted"];
  const kinds = ["LOAD", "OFFLINE", "ONLINE", "MANUAL_CHECK", "CHECKING", "QUEUED", "RUNNING", "SUCCEEDED", "UNAVAILABLE"];
  if (request.method !== "GET" || request.headers.get("host") !== "127.0.0.1:3395" ||
      request.headers.get("sec-fetch-site") !== "same-origin" || query.size !== expected.length ||
      !expected.every(key => query.has(key)) || !kinds.includes(query.get("kind")!) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(query.get("page")!) ||
      !/^(?:[1-9]|[1-5][0-9]|6[0-4])$/.test(query.get("sequence")!) ||
      !["true", "false"].includes(query.get("online")!) || !["true", "false"].includes(query.get("trusted")!)) {
    return new Response(null, { status: 400 });
  }
  // Test observation, not authorization evidence. Only fixed codes/booleans,
  // a random page-instance ID and bounded sequence; never a URL or body.
  console.log(JSON.stringify({ fixture: "browser-network", page: query.get("page"), sequence: Number(query.get("sequence")),
    kind: query.get("kind"), online: query.get("online") === "true", trusted: query.get("trusted") === "true" }));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
async function mode() { guard(); const value = (await cookies()).get("cl_browser_fixture")?.value; return MODES.find(m => m === value) ?? "succeeded"; }
function user() { return { id: USER, email: "synthetic@example.invalid", app_metadata: { role: "provider" } }; }
export async function createFixtureAuthClient() {
  const current = await mode();
  return { auth: {
    getClaims: async () => ({ data: { claims: current === "anonymous" ? null : { sub: USER, session_id: SESSION } }, error: null }),
    getUser: async () => ({ data: { user: current === "anonymous" ? null : user() }, error: null }),
  }, rpc: async (name: string) => {
    if (name !== "resolve_v1_current_session_status") throw new Error("Fixture RPC denied");
    return { data: current === "revoked" ? "REVOKED" : "ACTIVE", error: null };
  } };
}

export async function readFixtureJob(request: Request, jobId: string) {
  guard(); const current = await mode(), now = new Date().toISOString();
  const diagnostics = { acquired: false, queried: false, destroyed: false, revoked: false };
  const expiry = new Date(Date.now() + 60000).toISOString();
  const databaseTarget = target({ status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED", deploymentEnvironment: "PREVIEW",
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW", targetProjectRefHmac: hash("target"), productionProjectRefHmac: hash("parent"),
    controlPlaneEvidenceSha256: hash("SYNTHETIC_CONTROL"), databaseName: "postgres", postgresMajor: 17, projectStatus: "ACTIVE_HEALTHY",
    connectionMode: "DIRECT", port: 5432, tlsMode: "VERIFY_FULL_PINNED_CA", tlsRootCertificateSha256: hash("SYNTHETIC_CA"),
    observedAt: now, expiresAt: expiry, defaultBranch: false, persistent: false, withData: false,
    productionExcluded: true, rawCredentialMaterialPresent: false });
  const status = ["queued", "running", "failed", "cancelled"].includes(current) ? current.toUpperCase() : "SUCCEEDED";
  const job = { jobId: JOB, noteType: "communication", serviceCode: "note.communication.generate", status,
    attemptCount: ["QUEUED", "CANCELLED"].includes(status) ? 0 : 1, createdAt: CREATED, updatedAt: CREATED,
    startedAt: ["QUEUED", "CANCELLED"].includes(status) ? null : CREATED,
    finishedAt: ["SUCCEEDED", "FAILED", "CANCELLED"].includes(status) ? CREATED : null,
    failureCode: status === "FAILED" ? "GENERATION_FAILED" : null,
    result: status === "SUCCEEDED" ? { canonicalId: DOC, revisionId: REV, revisionNumber: 1, baseRevisionId: null,
      contentHash: hash("content"), saveState: "SERVER_ACKNOWLEDGED" } : null };
  const handle = createCommunicationNoteJobRecoveryComposition({
    env: { CARESLINK_V1_PRODUCT_API_ENABLED: "true", CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_ENABLED: "true",
      CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_SUPABASE_REF: REF,
      CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_VERCEL_PROJECT_ID: "prj_1234567890abcdef",
      VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: "prj_1234567890abcdef",
      SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_SYNTHETIC0000000", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_SYNTHETIC0000000" },
    createCookieAuthClient: createFixtureAuthClient,
    resolveDatabase: async () => ({ projectRef: REF, databaseTarget, clock: { now: () => new Date().toISOString() },
      credentialResolver: resolver({ capability: "INJECTED_JOB_STATUS_CREDENTIAL_RESOLVER",
        acquire: async (value: unknown) => {
          diagnostics.acquired = true;
          const r = value as Record<string, unknown>;
          const keys = ["requestDigest", "deploymentEnvironment", "targetClass", "purpose", "callerRole", "rpcNames", "rpcParameterCount",
            "databaseTargetDigest", "targetProjectRefHmac", "productionProjectRefHmac", "controlPlaneEvidenceSha256", "databaseName",
            "postgresMajor", "projectStatus", "connectionMode", "port", "tlsMode", "tlsRootCertificateSha256", "roleActivationMode"];
          const descriptor = { ...Object.fromEntries(keys.map(key => [key, r[key]])), status: "ACTIVE_SINGLE_USE_PURPOSE_SESSION_NOT_APPROVED",
            effectiveRole: r.callerRole, runtimeRole: "careslink_v1_job_status_runtime_0123456789abcdef",
            requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE", transactionMode: "ONE_ATOMIC_STATEMENT", transactionPoolerUsed: false,
            preparedStatementsUsed: false, callerMembershipAdmin: false, callerMembershipInherit: false, callerMembershipSet: true,
            executorMembershipPresent: false, serviceRoleFallback: false, leaseReferenceSha256: hash(r.requestDigest), sessionBindingSha256: hash("session"),
            issuedAt: new Date().toISOString(), expiresAt: expiry, revokeBy: expiry, reuseAllowed: false, concurrentUseAllowed: false, rawCredentialMaterialPresent: false };
          return lease({ capability: "INJECTED_JOB_STATUS_EXCLUSIVE_SESSION", descriptor,
            query: async (sql: string, values: readonly unknown[]) => {
              diagnostics.queried = true;
              if (sql !== SQL || values.length !== 5 || values[0] !== USER || values[1] !== SESSION) throw new Error("Fixture query denied");
              if (current === "unavailable") throw new Error("SYNTHETIC_READ_FAILURE");
              if (current === "foreign" || values[2] !== JOB) throw Object.assign(new Error("NOT_FOUND"), { code: "P0001" });
              return { rows: [{ data: { job } }] };
            }, destroy: async () => { diagnostics.destroyed = true; return receipt({ status: "DESTROYED_NOT_APPROVED", leaseReferenceSha256: descriptor.leaseReferenceSha256,
              sessionBindingSha256: descriptor.sessionBindingSha256, runtimeRole: descriptor.runtimeRole, reportedAt: new Date().toISOString(),
              sessionTerminated: true, activeStatementCount: 0, inFlightStatementDisposition: "SETTLED_OR_CANCELLED", reusable: false, rawCredentialMaterialPresent: false }); } });
        }, revoke: async (value: unknown) => {
          diagnostics.revoked = true;
          const r = value as Record<string, unknown>;
          return receipt({ status: "REVOKED_AND_TOMBSTONED_NOT_APPROVED", requestDigest: r.requestDigest,
            acquisitionRequestDigest: r.acquisitionRequestDigest, leaseReferenceSha256: r.leaseReferenceSha256,
            sessionBindingSha256: r.sessionBindingSha256, runtimeRole: r.runtimeRole, reportedAt: new Date().toISOString(),
            credentialDisposition: r.bindingState === "NONE" ? "NOT_ISSUED" : "REVOKED", acquisitionRequestTombstoned: true,
            futureIssuanceBlocked: true, lateIssuanceBlockedAtomically: true, activeSessionCount: 0, allIssuedSessionsTerminated: true,
            inFlightStatementsSettled: true, reusable: false, rawCredentialMaterialPresent: false });
        } }) }),
  });
  if (!handle) throw new Error("Fixture composition disabled");
  const response = await handle(request, jobId);
  console.log(JSON.stringify({ fixture: "job-read", method: request.method, status: response.status, mode: current,
    requestAborted: request.signal.aborted, ...diagnostics,
    failure: response.status !== 503 ? null : request.signal.aborted ? "CLIENT_ABORTED"
      : current === "unavailable" ? "SYNTHETIC_UNAVAILABLE" : "UNCLASSIFIED" }));
  return response;
}

export async function readFixtureDocument(request: Request, documentId: string) {
  guard(); const current = await mode();
  const content = { englishDraft: "SYNTHETIC TEST DRAFT — The worker recorded the agreed information after a phone call. Human review is still required.",
    reviewVersions: { "zh-Hans": "合成测试草稿：工作人员记录了电话沟通中确认的信息，仍需人工审核。", "zh-Hant": "合成測試草稿：工作人員記錄了電話溝通中確認的資訊，仍需人工審核。" },
    factsSummary: createValidCaresLinkV1CleanedFacts("communication"), missingFacts: [], neutralWordingChecks: [], followUpPrompts: [], disclaimer: "Draft – review required" };
  const getDocument = async (id: string) => {
    if (id !== DOC || current === "foreign") throw new CaresLinkV1ProductApiError("NOT_FOUND", "Synthetic missing");
    return { document: { canonicalId: DOC, noteType: "communication", sourceLocale: "en", lifecycleStatus: "IN_PROGRESS",
      currentRevisionId: REV, currentRevisionNumber: 1, contractVersion: "1.0.0-shadow.1", schemaVersion: "2026-08-09.v1-shadow",
      createdAt: CREATED, updatedAt: CREATED, deletedAt: null }, revisions: [{ canonicalId: DOC, revisionId: REV, revisionNumber: 1,
      baseRevisionId: null, privacyReviewId: "66666666-6666-4666-8666-666666666666", content, contentHash: hash(content),
      mutationId: "synthetic:browser:fixture", contractVersion: "1.0.0-shadow.1", schemaVersion: "2026-08-09.v1-shadow", createdAt: CREATED }], checkpoint: null, selfReviewStatus: "REQUIRED" };
  };
  return handleCommunicationNoteDocumentRead(request, documentId, {
    resolveAuth: async () => ["anonymous", "revoked"].includes(current)
      ? { ok: false, reason: "auth_required", status: 401 } : { ok: true, identity: { source: "cookie", userId: USER, sessionId: SESSION } },
    getProductApi: async () => ({ getDocument }) as unknown as CaresLinkV1ProductApi,
  });
}
