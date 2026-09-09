import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCommunicationNoteJobRecoveryComposition as compose,
  COMMUNICATION_NOTE_JOB_RECOVERY_REQUEST_TIMEOUT_MS as TIMEOUT, type CommunicationNoteJobRecoveryEnv } from "./communication-note-job-recovery-composition.server";
import { createCaresLinkV1CommunicationNoteJobStatusCredentialResolver as resolver,
  createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget as target,
  createCaresLinkV1CommunicationNoteJobStatusPurposeSessionLease as lease } from "./v1/communication-note-job-status-purpose-caller.server";
import { CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL as SQL } from "./v1/communication-note-job-status-repository.server";
import { stringifyCaresLinkV1CanonicalJson } from "./v1/canonical-json";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import { COMMUNICATION_NOTE_GENERATION_FAILURE_CODES } from "./communication-note-generation-contract";
import { handleCommunicationNoteGenerationJobRecoveryRequest } from "./communication-note-generation-job-recovery.server";

vi.mock("server-only", () => ({}));
const USER = "11111111-1111-4111-8111-111111111111", SESSION = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333", REF = "abcdefghijklmnopqrst", NOW = "2026-09-07T00:00:00.000Z";
const hash = (v: unknown) => createHash("sha256").update(stringifyCaresLinkV1CanonicalJson(v)).digest("hex");
const signed = (v: Record<string, unknown>) => ({ ...v, receiptDigest: hash(v) });
const request = (init?: RequestInit, query = "") => new Request(`https://app.example.invalid/api/ai-documents/communication-note/jobs/${JOB}${query}`, init);
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function environment(): CommunicationNoteJobRecoveryEnv {
  return { CARESLINK_V1_PRODUCT_API_ENABLED: "true", CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_ENABLED: "true",
    CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_SUPABASE_REF: REF,
    CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_VERCEL_PROJECT_ID: "prj_1234567890abcdef",
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: "prj_1234567890abcdef",
    SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef" };
}

// Real composition/principal/adapter/repository code, synthetic Auth/issuer/SQL
// ports. These receipts are TEST FIXTURES, not physical-connection evidence.
function harness(status = "QUEUED") {
  const events: string[] = [];
  const env = environment();
  const client = { auth: {
    getClaims: vi.fn(async () => { events.push("claims"); return { data: { claims: { sub: USER, session_id: SESSION } }, error: null }; }),
    getUser: vi.fn(async () => { events.push("user"); return { data: { user: { id: USER } }, error: null }; }),
  }, rpc: vi.fn(async (name: string) => { expect(name).toBe("resolve_v1_current_session_status"); events.push("session"); return { data: "ACTIVE", error: null }; }) };
  const databaseTarget = target({ status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED", deploymentEnvironment: "PREVIEW",
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW", targetProjectRefHmac: hash("target"), productionProjectRefHmac: hash("parent"),
    controlPlaneEvidenceSha256: hash("control"), databaseName: "postgres", postgresMajor: 17, projectStatus: "ACTIVE_HEALTHY",
    connectionMode: "DIRECT", port: 5432, tlsMode: "VERIFY_FULL_PINNED_CA", tlsRootCertificateSha256: hash("CA"),
    observedAt: NOW, expiresAt: "2026-09-07T00:05:00.000Z", defaultBranch: false, persistent: false, withData: false,
    productionExcluded: true, rawCredentialMaterialPresent: false });
  const job = { jobId: JOB, noteType: "communication", serviceCode: "note.communication.generate", status,
    attemptCount: ["QUEUED", "CANCELLED"].includes(status) ? 0 : 1, createdAt: NOW, updatedAt: NOW,
    startedAt: ["QUEUED", "CANCELLED"].includes(status) ? null : NOW,
    finishedAt: ["SUCCEEDED", "FAILED", "CANCELLED"].includes(status) ? NOW : null,
    failureCode: status === "FAILED" ? COMMUNICATION_NOTE_GENERATION_FAILURE_CODES[0] : null,
    result: status === "SUCCEEDED" ? { canonicalId: "44444444-4444-4444-8444-444444444444", revisionId: "55555555-5555-4555-8555-555555555555",
      revisionNumber: 1, baseRevisionId: null, contentHash: hash("content"), saveState: "SERVER_ACKNOWLEDGED" } : null };
  const query = vi.fn(async (sql: string, values: readonly unknown[]) => {
    expect(sql).toBe(SQL); expect(values).toHaveLength(5);
    events.push("query"); return { rows: [{ data: { job } }] };
  });
  let descriptor: Record<string, unknown>;
  const destroy = vi.fn(async () => { events.push("destroy"); return signed({ status: "DESTROYED_NOT_APPROVED",
    leaseReferenceSha256: descriptor.leaseReferenceSha256, sessionBindingSha256: descriptor.sessionBindingSha256,
    runtimeRole: descriptor.runtimeRole, reportedAt: NOW, sessionTerminated: true, activeStatementCount: 0,
    inFlightStatementDisposition: "SETTLED_OR_CANCELLED", reusable: false, rawCredentialMaterialPresent: false }); });
  let sequence = 0;
  const acquire = vi.fn(async (value: unknown) => {
    events.push("acquire"); const r = value as Record<string, unknown>; sequence++;
    const keys = ["requestDigest", "deploymentEnvironment", "targetClass", "purpose", "callerRole", "rpcNames", "rpcParameterCount",
      "databaseTargetDigest", "targetProjectRefHmac", "productionProjectRefHmac", "controlPlaneEvidenceSha256", "databaseName",
      "postgresMajor", "projectStatus", "connectionMode", "port", "tlsMode", "tlsRootCertificateSha256", "roleActivationMode"];
    descriptor = { ...Object.fromEntries(keys.map(key => [key, r[key]])), status: "ACTIVE_SINGLE_USE_PURPOSE_SESSION_NOT_APPROVED",
      effectiveRole: r.callerRole, runtimeRole: `careslink_v1_job_status_runtime_${sequence.toString(16).padStart(16, "0")}`,
      requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE", transactionMode: "ONE_ATOMIC_STATEMENT", transactionPoolerUsed: false,
      preparedStatementsUsed: false, callerMembershipAdmin: false, callerMembershipInherit: false, callerMembershipSet: true,
      executorMembershipPresent: false, serviceRoleFallback: false, leaseReferenceSha256: hash("lease" + sequence), sessionBindingSha256: hash("session" + sequence),
      issuedAt: NOW, expiresAt: "2026-09-07T00:01:00.000Z", revokeBy: "2026-09-07T00:01:00.000Z", reuseAllowed: false,
      concurrentUseAllowed: false, rawCredentialMaterialPresent: false };
    // Distinct query function per lease, even if the physical-port spy is reused.
    return lease({ capability: "INJECTED_JOB_STATUS_EXCLUSIVE_SESSION", descriptor, query: (sql: string, values: readonly unknown[]) => query(sql, values), destroy });
  });
  const revoke = vi.fn(async (value: unknown) => { events.push("revoke"); const r = value as Record<string, unknown>;
    return signed({ status: "REVOKED_AND_TOMBSTONED_NOT_APPROVED", requestDigest: r.requestDigest,
      acquisitionRequestDigest: r.acquisitionRequestDigest, leaseReferenceSha256: r.leaseReferenceSha256, sessionBindingSha256: r.sessionBindingSha256,
      runtimeRole: r.runtimeRole, reportedAt: NOW, credentialDisposition: r.bindingState === "NONE" ? "NOT_ISSUED" : "REVOKED",
      acquisitionRequestTombstoned: true, futureIssuanceBlocked: true, lateIssuanceBlockedAtomically: true, activeSessionCount: 0,
      allIssuedSessionsTerminated: true, inFlightStatementsSettled: true, reusable: false, rawCredentialMaterialPresent: false }); });
  const dependencies = { projectRef: REF, databaseTarget, clock: { now: () => NOW },
    credentialResolver: resolver({ capability: "INJECTED_JOB_STATUS_CREDENTIAL_RESOLVER", acquire, revoke }) };
  const resolveDatabase = vi.fn(async () => { events.push("database"); return dependencies; });
  const createCookieAuthClient = vi.fn(async () => { events.push("cookie"); return client; });
  const options = { env, resolveDatabase, createCookieAuthClient };
  return { ...options, options, events, dependencies, client, job, query, acquire, destroy, revoke, handle: compose(options)! };
}

describe("independent job recovery composition", () => {
  it.each(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"])("composes %s through the actual auth, purpose adapter and repository", async status => {
    const h = harness(status);
    expect(h.events).toEqual([]);
    const response = await h.handle(request(), JOB);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "AVAILABLE", job: { status, jobId: JOB } });
    expect(h.events).toEqual(["cookie", "claims", "session", "user", "database", "acquire", "query", "destroy", "revoke"]);
    expect(h.query).toHaveBeenCalledWith(SQL, [USER, SESSION, JOB, "1.0.0-shadow.1", "2026-08-09.v1-shadow"]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(JSON.stringify(await h.resolveDatabase.mock.results[0].value)).not.toContain("sb_publishable");
  });
  it("keeps reads independent of all generation/Points switches", async () => {
    const h = harness(); Object.assign(h.env, { CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED: "false", CARESLINK_POINTS_UI_ENABLED: "false" });
    expect((await h.handle(request(), JOB)).status).toBe(200);
  });
  it.each([
    { CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_ENABLED: "false" }, { CARESLINK_V1_PRODUCT_API_ENABLED: "false" },
    { VERCEL: "0" }, { VERCEL_ENV: "production" }, { VERCEL_TARGET_ENV: "production" }, { VERCEL_PROJECT_ID: "prj_other000000000000" },
    { CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_SUPABASE_REF: CARESLINK_PRODUCTION_SUPABASE_REF },
    { SUPABASE_URL: `https://${REF}.supabase.co/` }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" },
  ])("does not construct an enabled chain for invalid configuration %j", override => {
    const h = harness(); Object.assign(h.env, override); expect(compose(h.options)).toBeUndefined(); expect(h.events).toEqual([]);
  });
  it("rejects bearer auth before opening either client", async () => {
    const h = harness(); expect((await h.handle(request({ headers: { Authorization: "Bearer private" } }), JOB)).status).toBe(403);
    expect(h.events).toEqual([]);
  });
  it.each(["REVOKED", "UNAVAILABLE"])("blocks %s sessions before resolving the database", async data => {
    const h = harness(); h.client.rpc.mockResolvedValue({ data, error: null });
    expect((await h.handle(request(), JOB)).status).toBe(data === "REVOKED" ? 401 : 503);
    expect(h.resolveDatabase).not.toHaveBeenCalled(); expect(h.client.auth.getUser).not.toHaveBeenCalled();
  });
  it("authenticates before interpreting invalid identifiers", async () => {
    const h = harness(); h.client.auth.getClaims.mockRejectedValue(new Error("PRIVATE"));
    expect((await h.handle(request(undefined, "?owner=other"), "not-a-uuid")).status).toBe(401);
    expect(h.resolveDatabase).not.toHaveBeenCalled();
  });
  it("blocks mismatched getUser identity", async () => {
    const h = harness(); h.client.auth.getUser.mockResolvedValue({ data: { user: { id: JOB } }, error: null });
    expect((await h.handle(request(), JOB)).status).toBe(401); expect(h.resolveDatabase).not.toHaveBeenCalled();
  });
  it.each(["claims", "database", "query"])("fails closed when configuration drifts during %s", async stage => {
    const h = harness();
    const change = () => { Object.assign(h.env, { VERCEL_ENV: "production" }); };
    if (stage === "claims") h.client.auth.getClaims.mockImplementation(async () => { change(); return { data: { claims: { sub: USER, session_id: SESSION } }, error: null }; });
    if (stage === "database") h.resolveDatabase.mockImplementation(async () => { change(); return h.dependencies; });
    if (stage === "query") h.query.mockImplementation(async () => { change(); return { rows: [{ data: { job: h.job } }] }; });
    expect((await h.handle(request(), JOB)).status).toBe(503);
    if (stage !== "query") expect(h.acquire).not.toHaveBeenCalled();
    else { expect(h.destroy).toHaveBeenCalledOnce(); expect(h.revoke).toHaveBeenCalledOnce(); }
  });
  it("rejects a database port returning another project", async () => {
    const h = harness(); h.resolveDatabase.mockResolvedValue({ ...h.dependencies, projectRef: "bcdefghijklmnopqrstuv" });
    expect((await h.handle(request(), JOB)).status).toBe(503); expect(h.acquire).not.toHaveBeenCalled();
  });
  it.each([["NOT_FOUND", 404], ["SESSION_REVOKED", 401], ["PRIVATE_DRIVER_MESSAGE", 503]] as const)("maps only safe SQL errors %s after cleanup", async (message, status) => {
    const h = harness(); h.query.mockRejectedValue(Object.assign(new Error(message), { code: "P0001" }));
    const response = await h.handle(request(), JOB); expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ status: status === 404 ? "NOT_FOUND" : status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE" });
    expect(h.destroy).toHaveBeenCalledOnce(); expect(h.revoke).toHaveBeenCalledOnce();
  });
  it("withholds a successful job when credential cleanup fails", async () => {
    const h = harness(); h.revoke.mockRejectedValue(new Error("PRIVATE"));
    expect((await h.handle(request(), JOB)).status).toBe(503);
  });
  it.each(["auth", "database"])("bounds a hanging %s port and ignores late completion", async stage => {
    vi.useFakeTimers(); const h = harness(); let settle!: () => void;
    if (stage === "auth") h.client.auth.getClaims.mockImplementation(() => new Promise(resolve => { settle = () => resolve({ data: { claims: { sub: USER, session_id: SESSION } }, error: null }); }));
    else h.resolveDatabase.mockImplementation(() => new Promise(resolve => { settle = () => resolve(h.dependencies); }));
    const pending = h.handle(request(), JOB); await vi.advanceTimersByTimeAsync(TIMEOUT);
    expect((await pending).status).toBe(503); settle(); await vi.runAllTimersAsync();
    expect(h.acquire).not.toHaveBeenCalled();
  });
  it("aborts pending dependency resolution without starting SQL", async () => {
    const h = harness(); const controller = new AbortController(); let settle!: () => void;
    h.resolveDatabase.mockImplementation(() => new Promise(resolve => { settle = () => resolve(h.dependencies); }));
    const pending = h.handle(request({ signal: controller.signal }), JOB);
    await vi.waitFor(() => expect(h.resolveDatabase).toHaveBeenCalled()); controller.abort();
    expect((await pending).status).toBe(503); settle(); await Promise.resolve(); expect(h.acquire).not.toHaveBeenCalled();
  });
  it("still leaves the actual formal API disabled", async () => {
    expect((await handleCommunicationNoteGenerationJobRecoveryRequest(request(), JOB)).status).toBe(503);
  });
  it("opens no clients for unsupported methods or already-aborted requests", async () => {
    const h = harness();
    expect((await h.handle(request({ method: "POST" }), JOB)).status).toBe(503);
    expect((await h.handle(request({ signal: AbortSignal.abort() }), JOB)).status).toBe(503);
    expect(h.events).toEqual([]);
  });
  it.each([["bad-id", ""], [JOB, "?owner=other"]])("rejects authenticated invalid input without acquiring credentials", async (jobId, query) => {
    const h = harness();
    expect((await h.handle(request(undefined, query), jobId)).status).toBe(404);
    expect(h.events).toEqual(["cookie", "claims", "session", "user"]);
  });
  it("revalidates Cookie identity on every request and never reuses a repository lease", async () => {
    const h = harness();
    expect((await h.handle(request(), JOB)).status).toBe(200);
    expect((await h.handle(request(), JOB)).status).toBe(200);
    expect(h.createCookieAuthClient).toHaveBeenCalledTimes(2);
    expect(h.acquire).toHaveBeenCalledTimes(2);
    expect(h.revoke).toHaveBeenCalledTimes(2);
    h.client.rpc.mockResolvedValue({ data: "REVOKED", error: null });
    expect((await h.handle(request(), JOB)).status).toBe(401);
    expect(h.acquire).toHaveBeenCalledTimes(2);
  });
  it("preserves fixed private response headers without echoing arbitrary SSR headers", async () => {
    const h = harness();
    const handle = compose({ ...h.options, async createCookieAuthClient({ responseHeaders }) {
      responseHeaders.set("Cache-Control", "public, max-age=999999");
      responseHeaders.set("Expires", "PRIVATE");
      responseHeaders.set("Pragma", "PRIVATE");
      responseHeaders.set("X-Private", "PRIVATE");
      return h.client;
    } })!;
    const response = await handle(request(), JOB);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.has("X-Private")).toBe(false);
  });
});
