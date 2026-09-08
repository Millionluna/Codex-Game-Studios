/** Opt-in, newly owned PG16 + private IPC; never an existing / Hosted target. */
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createReviewBrowserDatabase } from "./communication-note-self-review.database.mjs";
import { requestTaskCredential } from "./communication-note-task-credential.fixture";
import { createWorkspaceTaskReadPort } from "./communication-note-workspace-task-connection.fixture";
vi.mock("server-only", () => ({}));
vi.mock("./communication-note-self-review.fixture", () => ({ assertReviewDatabaseFixture: () => root }));
vi.mock("../../src/lib/supabase-server", () => ({ createCareslinkServerSupabaseClient: () => { throw new Error("NO_AMBIENT_AUTH"); } }));
const enabled = process.env.CARESLINK_TASK_CREDENTIAL_LOCAL === "OWNED_UNIX_ONLY";
const principal = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", transport: "COOKIE" };
const PURPOSE = "COMMUNICATION_NOTE_JOB_LIST_READ", CALLER = "careslink_v1_generation_job_list_caller";
const TABLE = "cl_local_task_credential.receipts";
const params = [principal.userId, principal.sessionId, null, null, 20, "1.0.0-shadow.1", "2026-08-09.v1-shadow"];
let root, database, admin, capability, baseline, abandoned;
const clients = [];
const id = () => randomBytes(16).toString("hex");
const issue = (requestId = id(), extras = {}) => requestTaskCredential(root, capability, "issue", { requestId, principal, purpose: PURPOSE, ...extras });
const revoke = leaseId => requestTaskCredential(root, capability, "revoke", { leaseId });
async function open(credential, application = "local-task-lease-test") {
  const client = new Client({ host: root + "/pg/socket", port: 15437, database: "postgres", ssl: false,
    user: credential?.role ?? "review_test_bootstrap", password: credential?.password ?? "", application_name: application,
    connectionTimeoutMillis: 1000, query_timeout: 7000, options: "-c statement_timeout=6000 -c lock_timeout=1000" });
  clients.push(client); client.on("error", () => {});
  try { await client.connect(); return client; } catch (error) { await client.end(); throw error; }
}
async function receipt(leaseId) { return (await admin.query(`select * from ${TABLE} where id=$1`, [leaseId])).rows[0]; }
async function waitFor(check, limit = 4000) {
  const end = Date.now() + limit;
  while (Date.now() < end) { const result = await check(); if (result) return result; await delay(20); }
  throw new Error("LOCAL_LEASE_OBSERVATION_TIMEOUT");
}
async function snapshot() {
  return JSON.stringify((await admin.query(`select
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.point_ledger_entries x) as points,
    (select jsonb_agg(to_jsonb(x) order by x.id) from public.point_reservations x) as reservations,
    (select count(*) from careslink_v1_generation.jobs) as jobs,
    (select count(*) from public.self_review_events) as reviews,
    (select count(*) from public.ai_document_mutation_receipts) as edits`)).rows);
}
async function gone(delivery) {
  expect(await receipt(delivery.leaseId)).toMatchObject({ state: "REVOKED" });
  expect((await admin.query("select count(*)::int n from pg_roles where rolname=$1", [delivery.credential.role])).rows[0].n).toBe(0);
  expect((await admin.query("select count(*)::int n from pg_stat_activity where usename=$1", [delivery.credential.role])).rows[0].n).toBe(0);
  await expect(open(delivery.credential)).rejects.toMatchObject({ code: expect.stringMatching(/^(28P01|28000)$/) });
}
describe.skipIf(!enabled)("owned task credential issuance, physical read and revocation", () => {
  beforeAll(async () => {
    root = await mkdtemp("/private/tmp/cl-job-browser-"); expect(await realpath(root)).toBe(root);
    console.log(JSON.stringify({ stage: "task-credential-owned-root", root }));
    database = createReviewBrowserDatabase(root, "WORKSPACE_TASK");
    capability = database.env.CARESLINK_LOCAL_TASK_BROKER_CAPABILITY;
    expect(Object.keys(database.env)).not.toContain("CARESLINK_LOCAL_TASK_READ_PASSWORD");
    await database.start(); await database.verifySettlement(); admin = await open(); baseline = await snapshot();
    vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY", "OWNER_TASK_LIST"); vi.stubEnv("CARESLINK_LOCAL_TASK_BROKER_CAPABILITY", capability);
    // Start the genuine 60-second lost-consumer expiry in parallel with the
    // other scenarios, not a fake clock or a manually backdated SQL receipt.
    abandoned = await issue(); await open(abandoned.credential);
  }, 60000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    try { if (admin && baseline) expect(await snapshot()).toBe(baseline); }
    finally {
      await Promise.allSettled(clients.map(c => c.end()));
      if (database) await database.stop();
      if (root) { expect(await realpath(root)).toBe(root); await rm(root, { recursive: true });
        console.log(JSON.stringify({ stage: "task-credential-owned-fixture-removed", stopped: true, removed: true })); }
    }
  }, 30000);
  it("issues least privilege with real expiry; no table/status/operator capability", async () => {
    const delivery = await issue(), c = await open(delivery.credential);
    try {
      const r = (await admin.query(`select rolcanlogin,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconnlimit,
        extract(epoch from (rolvaliduntil-clock_timestamp()))::int seconds from pg_roles where rolname=$1`, [delivery.credential.role])).rows[0];
      expect(r).toMatchObject({ rolcanlogin: true, rolsuper: false, rolinherit: false, rolcreatedb: false,
        rolcreaterole: false, rolreplication: false, rolbypassrls: false, rolconnlimit: 2 });
      expect(r.seconds).toBeGreaterThan(45); expect(r.seconds).toBeLessThanOrEqual(60);
      for (const sql of ["select id from careslink_v1_generation.jobs", `select * from ${TABLE}`, "set role careslink_v1_generation_job_status_caller"])
        await expect(c.query(sql)).rejects.toMatchObject({ code: "42501" });
      expect((await c.query("select pg_has_role(current_user,'pg_signal_backend','MEMBER') as member")).rows[0].member).toBe(false);
      await c.query(`set role ${CALLER}`);
      await expect(c.query("select id from careslink_v1_generation.jobs")).rejects.toMatchObject({ code: "42501" });
    } finally { await c.end(); await revoke(delivery.leaseId); }
    await gone(delivery);
  });
  it("uses actual IPC, physical source and 3-task SQL, then tombstones before returning", async () => {
    const before = (await admin.query(`select count(*)::int n from ${TABLE} where state='REVOKED'`)).rows[0].n;
    const port = createWorkspaceTaskReadPort(principal), signal = new AbortController().signal;
    const result = await port.execute(params, { signal }); expect(result.rows[0].data.tasks).toHaveLength(3);
    expect((await admin.query(`select count(*)::int n from ${TABLE} where state='REVOKED'`)).rows[0].n).toBe(before + 1);
    await expect(port.execute(params, { signal })).rejects.toThrow();
  });
  it("delivers once across concurrent replay and never reissues a revoked request ID", async () => {
    const requestId = id(), attempts = await Promise.allSettled([issue(requestId), issue(requestId)]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const delivery = attempts.find(r => r.status === "fulfilled").value;
    await revoke(requestId); await gone(delivery);
    await expect(issue(requestId)).rejects.toThrow();
    await expect(revoke(requestId)).resolves.toEqual({ leaseId: requestId, revoked: true });
  });
  it("rejects wrong scope, identity, extra fields and unauthorized IPC without issuing", async () => {
    const before = (await admin.query(`select count(*)::int n from ${TABLE}`)).rows[0].n;
    for (const extras of [{ purpose: "COMMUNICATION_NOTE_JOB_STATUS_READ" }, { sql: "select 1" }, { ttl: 900000 },
      { principal: { ...principal, transport: "BEARER" } }, { principal: { ...principal, sessionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" } }])
      await expect(issue(id(), extras)).rejects.toThrow();
    await expect(issue("not-an-id")).rejects.toThrow();
    await expect(requestTaskCredential(root, "z".repeat(43), "issue", { requestId: id(), principal, purpose: PURPOSE })).rejects.toThrow();
    await expect(revoke(id())).rejects.toThrow();
    expect((await admin.query(`select count(*)::int n from ${TABLE}`)).rows[0].n).toBe(before);
  });
  it("rejects a genuinely expired auth session before role creation", async () => {
    await admin.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1", [principal.sessionId]);
    try { await expect(issue()).rejects.toThrow(); }
    finally { await admin.query("update auth.sessions set not_after=null where id=$1", [principal.sessionId]); }
  });
  it("bounds concurrent live leases without invalidating an unrelated lease", async () => {
    const held = [await issue(), await issue(), await issue()];
    try { await expect(issue()).rejects.toThrow(); expect((await receipt(abandoned.leaseId)).state).toBe("ISSUED"); }
    finally { for (const d of held) await revoke(d.leaseId); }
  });
  it("revocation kills both real sessions and their locks, not an unrelated login", async () => {
    const delivery = await issue(), first = await open(delivery.credential), second = await open(delivery.credential), canary = await open();
    const pids = [(await first.query("select pg_backend_pid() pid")).rows[0].pid, (await second.query("select pg_backend_pid() pid")).rows[0].pid];
    await first.query("select pg_advisory_lock(7149021)"); await second.query(`set role ${CALLER}`);
    try {
      await revoke(delivery.leaseId); await gone(delivery);
      expect((await admin.query("select count(*)::int n from pg_locks where pid=any($1::int[])", [pids])).rows[0].n).toBe(0);
      expect((await canary.query("select 1 alive")).rows[0].alive).toBe(1);
    } finally { await first.end(); await second.end(); await canary.end(); }
  });
  it("browser abort cancels a real blocked source read and revokes its login", async () => {
    const blocker = await open(), controller = new AbortController();
    await blocker.query("begin"); await blocker.query("lock table careslink_v1_generation.jobs in access exclusive mode");
    try {
      const pending = createWorkspaceTaskReadPort(principal).execute(params, { signal: controller.signal });
      const rejected = expect(pending).rejects.toThrow();
      const target = await waitFor(async () => (await admin.query("select pid,usename from pg_stat_activity where application_name like 'cl-task-read-%' and wait_event_type='Lock'")).rows[0]);
      controller.abort(); await rejected;
      expect((await admin.query("select count(*)::int n from pg_locks where pid=$1", [target.pid])).rows[0].n).toBe(0);
      expect((await admin.query("select count(*)::int n from pg_roles where rolname=$1", [target.usename])).rows[0].n).toBe(0);
      expect((await blocker.query("select txid_current_if_assigned() is not null active")).rows[0].active).toBe(true);
    } finally { await blocker.query("rollback"); await blocker.end(); }
  });
  it("independent 60s expiry revokes an abandoned credential and established connection", async () => {
    await waitFor(async () => (await receipt(abandoned.leaseId)).state === "REVOKED", 65000);
    expect((await receipt(abandoned.leaseId)).reason).toBe("EXPIRED"); await gone(abandoned);
  }, 70000);
  it("withholds a cleanup receipt on DROP failure; disables issuance until disposal", async () => {
    const delivery = await issue();
    // Only this newly owned test DB deliberately injects a dependency.
    await admin.query(`grant select on table ${TABLE} to ${delivery.credential.role}`);
    await expect(revoke(delivery.leaseId)).rejects.toThrow();
    expect((await receipt(delivery.leaseId)).state).toBe("REVOKING");
    expect((await admin.query("select rolcanlogin,rolpassword is null erased from pg_authid where rolname=$1", [delivery.credential.role])).rows[0])
      .toEqual({ rolcanlogin: false, erased: true });
    await expect(issue()).rejects.toThrow();
    await admin.query(`revoke select on table ${TABLE} from ${delivery.credential.role}`);
    await revoke(delivery.leaseId); await gone(delivery);
  });
});
