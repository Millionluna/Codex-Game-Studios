/** TEST ONLY: real local atomic admission, synthetic identities/policy receipts.
 * No payload vault, encryption attestation, worker or automatic completion. */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { Client } from "pg";
import { createTestOnlyCommunicationNoteGenerationHandler } from "../../src/lib/communication-note-generation-route.server";
import { createCommunicationNoteGenerationPrincipalResolver } from "../../src/lib/communication-note-generation-principal.server";
import { createTestOnlyCommunicationNoteGenerationJobRecoveryHandler } from "../../src/lib/communication-note-generation-job-recovery.server";
import { parseCommunicationNoteGenerationJob } from "../../src/lib/communication-note-generation-job";
import { createCaresLinkV1CommunicationNotePointsAdmissionRepository } from "../../src/lib/v1/note-generation-owner-repository.server";
import { CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_POSTGRES_SQL } from "../../src/lib/v1/communication-note-points-admission-purpose-caller.server";
import { createCaresLinkV1CommunicationNoteJobStatusRepository, CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL } from "../../src/lib/v1/communication-note-job-status-repository.server";
import { resolveCommunicationNotePointsPreview } from "../../src/lib/communication-note-points-preview.server";
import { stringifyCaresLinkV1CanonicalJson } from "../../src/lib/v1/canonical-json";
import { CaresLinkV1ContractError } from "../../src/lib/v1/shared-contracts";
import { assertReviewDatabaseFixture, createReviewDatabaseAuthClient } from "./communication-note-self-review.fixture";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ORIGIN = "http://127.0.0.1:3395", API = "/api/ai-documents/communication-note";
export const ADMISSION_FACTS = Object.freeze({ occurred_at: "2026-09-07T10:15:30+10:00", contact_channel: "Phone",
  parties_by_role: ["Support worker"], observable_facts: "Synthetic call occurred.",
  action_taken: "Synthetic information was recorded.", stated_outcome: "No further information supplied." });
const payloadPolicy = { policyVersion: "payload.local-browser.v1", encryptionProfileVersion: "encryption.synthetic-no-kms.v1",
  backupDispositionVersion: "backup.disposable-local.v1" };
const digest = (value: unknown) => createHash("sha256").update(stringifyCaresLinkV1CanonicalJson(value)).digest("hex");
const LOST_ACK = Symbol.for("careslink.synthetic.browser.admission.lost-ack");
export function assertAdmissionFixture() {
  const root = assertReviewDatabaseFixture();
  if (process.env.CARESLINK_LOCAL_ADMISSION_DATABASE !== "OWNED_UNIX_SOCKET_ONLY" ||
      !/^[a-f0-9]{64}$/.test(process.env.CARESLINK_LOCAL_ADMISSION_PASSWORD ?? "")) throw new Error("Local admission fixture unavailable");
  return root;
}
export function principal() {
  assertAdmissionFixture();
  return createCommunicationNoteGenerationPrincipalResolver({ env: { CARESLINK_V1_PRODUCT_API_ENABLED: "true" },
    createCookieAuthClient: createReviewDatabaseAuthClient, validateCurrentSessionAuthority: () => { assertAdmissionFixture(); return true; } });
}
function reply(status: string, httpStatus: number) {
  return Response.json({ status }, { status: httpStatus, headers: { "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie, Authorization", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
}
function transport(request: Request, path: string, method: string) {
  const url = new URL(request.url);
  return request.method === method && request.headers.get("host") === "127.0.0.1:3395" && url.pathname === path &&
    !url.search && request.headers.get("sec-fetch-site") === "same-origin" && !request.headers.has("authorization") &&
    (method === "POST" ? request.headers.get("origin") === ORIGIN : !request.headers.has("origin") || request.headers.get("origin") === ORIGIN);
}

/** Exact purpose statements; never accepts SQL or identity from HTTP. */
export async function queryAdmissionFixture(sql: string, values: readonly unknown[]) {
  const root = assertAdmissionFixture();
  const write = sql === CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_POSTGRES_SQL;
  if ((!write && sql !== CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL) || values.length !== (write ? 19 : 5))
    throw new Error("Local purpose statement denied");
  if (await realpath(root) !== root || await realpath(root + "/pg/socket") !== root + "/pg/socket") throw new Error("Local target denied");
  const client = new Client({ host: root + "/pg/socket", port: 15437, database: "postgres", user: "cl_admission_browser_runtime",
    password: process.env.CARESLINK_LOCAL_ADMISSION_PASSWORD, ssl: false, connectionTimeoutMillis: 1000, query_timeout: 7000,
    options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000" });
  client.on("error", () => {});
  try {
    await client.connect();
    const target = (await client.query("select current_user as role,inet_server_addr() is null as unix_only,current_setting('cluster_name') as cluster")).rows[0];
    if (target.role !== "cl_admission_browser_runtime" || target.unix_only !== true || target.cluster !== "careslink-review-browser-pg16") throw new Error("Local target denied");
    await client.query("begin");
    await client.query(write ? "set local role careslink_v1_generation_points_admission_caller" : "set local role careslink_v1_generation_job_status_caller");
    const result = await client.query(sql, [...values]);
    await client.query("commit");
    return { rows: result.rows };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error; // Repository normalizes safe codes; no raw driver diagnostics logged.
  } finally { await client.end(); }
}

export async function readAdmissionPoints() {
  assertAdmissionFixture();
  return resolveCommunicationNotePointsPreview(await createReviewDatabaseAuthClient());
}
/** One server-preallocated candidate per owned run; not a general task catalog.
 * Allocated before admission, so losing the response cannot lose its locator. */
export function getLocalWorkspaceTaskId(): string | undefined {
  const mode = process.env.CARESLINK_LOCAL_TASK_ENTRY, id = process.env.CARESLINK_LOCAL_TASK_ENTRY_JOB_ID;
  if (mode === undefined && id === undefined) return undefined;
  assertAdmissionFixture();
  if (mode === "OWNER_TASK_LIST" && id === undefined) return undefined;
  if (mode !== "FIXED_SINGLE_ADMISSION" || typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error("Local task entry unavailable");
  return id;
}

export async function submitAdmissionTask(request: Request) {
  assertAdmissionFixture();
  if (!transport(request, API + "/generate", "POST")) return reply("FORBIDDEN", 403);
  // Loopback-only adapter, not evidence of Hosted HTTPS/cookies.
  const headers = new Headers(request.headers);
  headers.set("origin", "https://admission.fixture.invalid"); headers.set("host", "admission.fixture.invalid");
  const internal = new Request("https://admission.fixture.invalid" + API + "/generate", new Request(request, { headers }));
  const handler = createTestOnlyCommunicationNoteGenerationHandler({ capability: "TEST_ONLY_M1X_COMMUNICATION_NOTE_GENERATION_ROUTE",
    runtimeEnabled: true, resolvePrincipal: principal(), submitter: { submit: async command => {
      if (command.principal.userId !== OWNER || command.principal.sessionId !== SESSION)
        throw new CaresLinkV1ContractError("NOT_FOUND", "Synthetic fixture unavailable");
      if (command.sourceLocale !== "en" || digest(command.cleanedFacts) !== digest(ADMISSION_FACTS))
        throw new CaresLinkV1ContractError("VALIDATION_ERROR", "Only fixed synthetic facts are accepted");
      if (request.signal.aborted) throw new Error("Local request aborted");
      const admission = await createCaresLinkV1CommunicationNotePointsAdmissionRepository({ principal: command.principal,
        query: queryAdmissionFixture }).enqueue({ jobId: getLocalWorkspaceTaskId() ?? randomUUID(), payloadId: randomUUID(),
        sourceLocale: "en", privacyReviewId: "88888888-8888-4888-8888-888888888888", cleanedFactsHash: command.cleanedFactsHash,
        idempotencyHash: digest(command.idempotencyKey), requestHash: digest({ locale: command.sourceLocale,
          factsHash: command.cleanedFactsHash, scanner: command.scannerPolicyVersion, privacy: command.privacyReview }),
        payloadHandleHash: digest("synthetic-no-vault:" + command.idempotencyKey), payloadExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        payloadPolicyVersion: payloadPolicy.policyVersion, payloadPolicySnapshotHash: digest(payloadPolicy),
        encryptionProfileVersion: payloadPolicy.encryptionProfileVersion, kmsKeyVersionResourceHash: "b".repeat(64),
        backupDispositionVersion: payloadPolicy.backupDispositionVersion });
      console.log(JSON.stringify({ fixture: "local-postgres-admission", created: admission.created,
        pointsReserved: admission.pointsReserved, status: admission.job.status, modelCalled: false }));
      const job = parseCommunicationNoteGenerationJob(admission.job);
      if (admission.created) return { created: true as const, job: { jobId: job.jobId, noteType: "communication" as const,
        serviceCode: "note.communication.generate" as const, status: "QUEUED" as const, attemptCount: 0 as const,
        createdAt: job.createdAt, updatedAt: job.updatedAt } };
      return { created: false as const, job };
    } } });
  const response = await handler(internal);
  const scope = globalThis as typeof globalThis & { [LOST_ACK]?: boolean };
  // Fixed lost-ack probe: commit succeeded but first acknowledgement is hidden.
  // The unchanged composer must replay its frozen body/key, not create a new one.
  if (response.status === 202 && !scope[LOST_ACK]) {
    scope[LOST_ACK] = true;
    console.log(JSON.stringify({ fixture: "local-admission-lost-ack", committed: true, responseSuppressed: true }));
    return reply("UNAVAILABLE", 503);
  }
  return response;
}
export async function readAdmissionTask(request: Request, jobId: string) {
  assertAdmissionFixture();
  if (!transport(request, API + "/jobs/" + jobId, "GET")) return reply("FORBIDDEN", 403);
  return createTestOnlyCommunicationNoteGenerationJobRecoveryHandler({ capability: "TEST_ONLY_COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY",
    resolvePrincipal: principal(), createRepository: ({ principal: identity }) =>
      createCaresLinkV1CommunicationNoteJobStatusRepository({ principal: identity, query: queryAdmissionFixture }) })(request, jobId);
}
