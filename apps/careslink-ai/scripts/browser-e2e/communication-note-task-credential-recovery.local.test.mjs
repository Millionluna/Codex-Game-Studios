/** Opt-in: real child crashes against one NEW disposable owned PG16 only. */
import { mkdtemp, realpath, rm, lstat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createReviewBrowserDatabase } from "./communication-note-self-review.database.mjs";
import { requestTaskCredential } from "./communication-note-task-credential.fixture";
import { installTaskCredentialBroker } from "./communication-note-task-credential.database.mjs";
import { installTaskCredentialSupervisor } from "./communication-note-task-credential.supervisor.mjs";
vi.mock("server-only", () => ({}));
const enabled = process.env.CARESLINK_TASK_CREDENTIAL_RECOVERY_LOCAL === "OWNED_UNIX_ONLY";
const principal = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", transport: "COOKIE" };
const PURPOSE = "COMMUNICATION_NOTE_JOB_LIST_READ", TABLE = "cl_local_task_credential.receipts";
const canaryRole = "careslink_v1_job_list_runtime_fedcba9876543210";
const canaryPassword = "q".repeat(43);
let root, database, supervisor, admin, capability, canary, baseline, canaryOid, damaged;
const clients = [];
const id = () => randomBytes(16).toString("hex");
const issue = (requestId = id()) => requestTaskCredential(root, capability, "issue", { requestId, principal, purpose: PURPOSE });
const revoke = leaseId => requestTaskCredential(root, capability, "revoke", { leaseId });
async function open(credential) {
  const client = new Client({ host: root + "/pg/socket", port: 15437, database: "postgres", ssl: false,
    user: credential?.role ?? "review_test_bootstrap", password: credential?.password ?? "",
    connectionTimeoutMillis: 1500, query_timeout: 7000, application_name: "cl-recovery-test-canary",
    options: "-c statement_timeout=5000 -c lock_timeout=1000" });
  clients.push(client); client.on("error", () => {});
  try { await client.connect(); return client; } catch (error) { await client.end(); throw error; }
}
async function row(leaseId) { return (await admin.query(`select * from ${TABLE} where id=$1`, [leaseId])).rows[0]; }
async function waitFor(check, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await delay(25); }
  throw new Error("LOCAL_RECOVERY_TEST_TIMEOUT");
}
async function restarted(generation) {
  await waitFor(() => supervisor.health().state === "READY" && supervisor.health().generation > generation);
}
async function snapshot() {
  return JSON.stringify((await admin.query(`select
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.point_ledger_entries x) as points,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.point_reservations x) as reservations,
    (select count(*) from careslink_v1_generation.jobs) as jobs,
    (select count(*) from public.self_review_events) as reviews,
    (select count(*) from public.ai_document_mutation_receipts) as edits`)).rows);
}
async function gone(leaseId, credential) {
  const receipt = await row(leaseId); expect(receipt.state).toBe("REVOKED");
  expect((await admin.query("select count(*)::int n from pg_roles where oid=$1 or rolname=$2", [receipt.role_oid, receipt.role_name])).rows[0].n).toBe(0);
  expect((await admin.query("select count(*)::int n from pg_stat_activity where usesysid=$1", [receipt.role_oid])).rows[0].n).toBe(0);
  if (credential) await expect(open(credential)).rejects.toMatchObject({ code: expect.stringMatching(/^(28P01|28000)$/) });
  expect((await canary.query("select 1 alive")).rows[0].alive).toBe(1);
  expect((await admin.query("select oid from pg_roles where rolname=$1", [canaryRole])).rows[0].oid).toBe(canaryOid);
}
describe.skipIf(!enabled)("owned issuer interruption and supervised recovery", () => {
  beforeAll(async () => {
    root = await mkdtemp("/private/tmp/cl-job-browser-"); expect(await realpath(root)).toBe(root);
    console.log(JSON.stringify({ stage: "task-recovery-owned-root", root }));
    database = createReviewBrowserDatabase(root, "WORKSPACE_TASK"); capability = database.env.CARESLINK_LOCAL_TASK_BROKER_CAPABILITY;
    await database.start(); await database.verifySettlement(); admin = await open();
    supervisor = database.taskCredentialSupervisorForTest(); baseline = await snapshot();
    // Same role-name prefix but NOT owned by a receipt: must never be swept.
    await admin.query(`create role ${canaryRole} login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls password '${canaryPassword}'`);
    canaryOid = (await admin.query("select oid from pg_roles where rolname=$1", [canaryRole])).rows[0].oid;
    canary = await open({ role: canaryRole, password: canaryPassword });
  }, 60000);
  afterAll(async () => {
    try {
      if (admin && baseline) {
        expect(await snapshot()).toBe(baseline);
        if (damaged) await admin.query(`update ${TABLE} set role_oid=$2 where id=$1`, [damaged.leaseId, damaged.oid]);
        await supervisor.stop(); // Also cleanup-only reconciles after failed startup.
        expect((await admin.query(`select count(*)::int n from ${TABLE} where state<>'REVOKED'`)).rows[0].n).toBe(0);
        expect((await canary.query("select 1 alive")).rows[0].alive).toBe(1);
        await canary.end(); await admin.query(`drop role ${canaryRole}`);
      }
    } finally {
      await Promise.allSettled(clients.map(c => c.end()));
      if (database) await database.stop();
      if (root) { expect(await realpath(root)).toBe(root); await rm(root, { recursive: true });
        console.log(JSON.stringify({ stage: "task-recovery-owned-fixture-removed", stopped: true, removed: true })); }
    }
  }, 60000);
  it("refuses competing supervisor/operator without removing the live socket or touching leases", async () => {
    const stat = await lstat(root + "/task-credential.sock");
    await expect(installTaskCredentialSupervisor(root, open, capability)).rejects.toThrow("LOCAL_SUPERVISOR_ALREADY_RUNNING");
    await expect(installTaskCredentialBroker(root, open, capability)).rejects.toThrow("LOCAL_ISSUER_ALREADY_RUNNING");
    expect((await lstat(root + "/task-credential.sock")).ino).toBe(stat.ino);
    const delivery = await issue(); await revoke(delivery.leaseId); await gone(delivery.leaseId, delivery.credential);
  });
  it("reconciles committed issuance lost before delivery after a genuine SIGKILL", async () => {
    const generation = supervisor.health().generation, requestId = id();
    await supervisor.faultForTest("ISSUE_COMMITTED");
    const pending = issue(requestId), denied = expect(pending).rejects.toThrow();
    await waitFor(() => supervisor.health().checkpoint === "ISSUE_COMMITTED");
    expect((await row(requestId)).state).toBe("ISSUED");
    await supervisor.faultForTest("KILL"); await denied; await restarted(generation);
    expect(supervisor.health().lastReason).toBe("PROCESS_EXIT");
    await gone(requestId); expect((await row(requestId)).reason).toBe("RESTART");
    await expect(issue(requestId)).rejects.toThrow(); // No replayed secret after restart.
    const next = await issue(); await revoke(next.leaseId); await gone(next.leaseId, next.credential);
  });
  it.each(["REVOKE_BARRIER_COMMITTED", "REVOKE_DROP_PENDING"])("recovers interruption at %s before accepting new issuance", async point => {
    const generation = supervisor.health().generation, delivery = await issue(), client = await open(delivery.credential);
    const pid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
    await client.query("select pg_advisory_lock(7149044)");
    await supervisor.faultForTest(point);
    const pending = revoke(delivery.leaseId), denied = expect(pending).rejects.toThrow();
    await waitFor(() => supervisor.health().checkpoint === point);
    expect((await row(delivery.leaseId)).state).toBe("REVOKING");
    if (point === "REVOKE_BARRIER_COMMITTED") {
      expect((await admin.query("select rolcanlogin,rolpassword is null erased from pg_authid where rolname=$1", [delivery.credential.role])).rows[0])
        .toEqual({ rolcanlogin: false, erased: true });
    }
    await supervisor.faultForTest("KILL"); await denied; await restarted(generation);
    await gone(delivery.leaseId, delivery.credential);
    expect((await admin.query("select count(*)::int n from pg_locks where pid=$1", [pid])).rows[0].n).toBe(0);
    await expect(revoke(delivery.leaseId)).resolves.toEqual({ leaseId: delivery.leaseId, revoked: true });
    await client.end();
  });
  it("detects a genuinely SIGSTOP-paused issuer and recovers its existing connection", async () => {
    const generation = supervisor.health().generation, delivery = await issue(), client = await open(delivery.credential);
    await client.query("select pg_advisory_lock(7149045)"); await supervisor.faultForTest("PAUSE");
    await restarted(generation); expect(supervisor.health().lastReason).toBe("HEARTBEAT_LOST");
    await gone(delivery.leaseId, delivery.credential); await client.end();
  });
  it("supervises real 60s expiry even when the live issuer loses every expiry timer", async () => {
    const generation = supervisor.health().generation, delivery = await issue(), client = await open(delivery.credential);
    await supervisor.faultForTest("SUPPRESS_EXPIRY"); await delay(1200);
    expect(supervisor.health().generation).toBe(generation);
    expect((await row(delivery.leaseId)).state).toBe("ISSUED");
    await waitFor(() => supervisor.health().generation > generation && supervisor.health().state === "READY", 70000);
    expect(supervisor.health().lastReason).toBe("EXPIRY_OVERDUE");
    await gone(delivery.leaseId, delivery.credential); await client.end();
  }, 75000);
  it("fails closed on a changed role OID rather than killing a same-prefix unrelated role", async () => {
    const delivery = await issue(), receipt = await row(delivery.leaseId);
    damaged = { leaseId: delivery.leaseId, oid: receipt.role_oid };
    await admin.query(`update ${TABLE} set role_oid=$2 where id=$1`, [delivery.leaseId, canaryOid]);
    await supervisor.faultForTest("KILL"); await waitFor(() => supervisor.health().state === "FAILED");
    await expect(issue()).rejects.toThrow();
    expect((await row(delivery.leaseId)).state).toBe("ISSUED"); // No false receipt.
    expect((await canary.query("select 1 alive")).rows[0].alive).toBe(1);
    expect((await admin.query("select oid from pg_roles where rolname=$1", [delivery.credential.role])).rows[0].oid).toBe(receipt.role_oid);
    await admin.query(`update ${TABLE} set role_oid=$2 where id=$1`, [delivery.leaseId, receipt.role_oid]); damaged = undefined;
    await supervisor.stop(); await gone(delivery.leaseId, delivery.credential);
  });
});
