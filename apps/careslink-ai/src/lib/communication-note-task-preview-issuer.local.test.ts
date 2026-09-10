import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCommunicationNoteTaskPreviewIssuer as createIssuer, createTaskPreviewSqlBroker,
  TASK_PREVIEW_ISSUER_SQL, type TaskPreviewIssuerBroker } from "./communication-note-task-preview-issuer.server";
import type { CommunicationNoteTaskLeaseScope } from "./communication-note-workspace-task-lease.server";
const socket = process.env.CARESLINK_TASK_ISSUER_LOCAL_SOCKET, REF = "abcdefghijklmnopqrst";
const TABLE = "careslink_task_preview_issuer.leases", CANARY = "careslink_v1_job_list_runtime_fedcba9876543210";
const context = () => ({ signal: new AbortController().signal });
const scope = (): CommunicationNoteTaskLeaseScope => ({ requestId: randomBytes(16).toString("hex"), projectRef: REF,
  purpose: "COMMUNICATION_NOTE_JOB_LIST_READ", callerRole: "careslink_v1_generation_job_list_caller",
  principal: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", transport: "COOKIE" } });
type Credential = { role: string; password: string; deliveryExpiresAt: string };
let admin: Client, canary: Client, canaryOid: number;
const clients: Client[] = [];
async function open(user = "postgres", password = "") {
  expect(socket).toMatch(/^\/private\/tmp\/cl-task-issuer-[A-Za-z0-9]{6}\/socket$/);
  const c = new Client({ host: socket, port: 15437, user, password, database: "postgres", ssl: false,
    connectionTimeoutMillis: 500, query_timeout: 3000, application_name: "task-preview-issuer-local-test",
    options: "-c statement_timeout=2000 -c lock_timeout=500" });
  c.on("error", () => {}); clients.push(c);
  try { await c.connect(); return c; } catch (error) { await c.end(); throw error; }
}
const broker = () => createTaskPreviewSqlBroker(async () => {
  const c = await open();
  return { query: (sql, values) => c.query(sql, [...values]), close: () => c.end() };
});
async function service(b: TaskPreviewIssuerBroker = broker()) { const s = createIssuer({ projectRef: REF, broker: b }); await s.recover(context()); return s; }
async function row(s: CommunicationNoteTaskLeaseScope) { return (await admin.query(`select * from ${TABLE} where id=$1`, [s.requestId])).rows[0]; }
async function gone(s: CommunicationNoteTaskLeaseScope, credential?: Credential) {
  const r = await row(s); expect(r.state).toBe("REVOKED");
  expect((await admin.query("select count(*)::int n from pg_roles where oid=$1 or rolname=$2", [r.role_oid, r.role_name])).rows[0].n).toBe(0);
  expect((await admin.query("select count(*)::int n from pg_stat_activity where usesysid=$1", [r.role_oid])).rows[0].n).toBe(0);
  if (credential) await expect(open(credential.role, credential.password)).rejects.toMatchObject({ code: expect.stringMatching(/^(28P01|28000)$/) });
  expect((await canary.query("select 1 alive")).rows[0].alive).toBe(1);
  expect((await admin.query("select oid from pg_roles where rolname=$1", [CANARY])).rows[0].oid).toBe(canaryOid);
}
describe.skipIf(!socket)("actual task Preview issuer source and durable local recovery", () => {
  beforeAll(async () => {
    admin = await open("task_test_bootstrap");
    expect((await admin.query("select current_setting('cluster_name') cluster,inet_server_addr() is null local")).rows)
      .toEqual([{ cluster: "careslink-task-issuer-local-pg16", local: true }]);
    await admin.query(`create role ${CANARY} login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls password '${"q".repeat(43)}'`);
    canaryOid = (await admin.query("select oid from pg_roles where rolname=$1", [CANARY])).rows[0].oid;
    canary = await open(CANARY, "q".repeat(43));
  });
  afterAll(async () => {
    try { if (admin) { await service(); await canary?.end(); await admin.query(`drop role ${CANARY}`); } }
    finally { await Promise.allSettled(clients.map(c => c.end())); }
  });
  it("creates a real SCRAM-authenticated two-connection narrow role and permanently revokes it", async () => {
    const s = await service(), input = scope(), d = await s.custody.issue(input, context());
    const a = await open(d.credential.role, d.credential.password), b = await open(d.credential.role, d.credential.password);
    await expect(open(d.credential.role, d.credential.password)).rejects.toMatchObject({ code: "53300" });
    expect((await a.query("select current_user role")).rows[0].role).toBe(d.credential.role);
    await a.query("set role careslink_v1_generation_job_list_caller");
    await expect(a.query(`select * from ${TABLE}`)).rejects.toMatchObject({ code: "42501" });
    expect((await admin.query("select rolpassword like 'SCRAM-SHA-256$4096:%' scram,rolconnlimit from pg_authid where rolname=$1", [d.credential.role])).rows)
      .toEqual([{ scram: true, rolconnlimit: 2 }]);
    await s.custody.revoke(input, context()); await gone(input, d.credential); await Promise.all([a.end(), b.end()]);
  });
  it("never returns a secret for a replay after revocation", async () => {
    const s = await service(), input = scope(), d = await s.custody.issue(input, context());
    await s.custody.revoke(input, context()); await expect(s.custody.issue(input, context())).rejects.toThrow(); await gone(input, d.credential);
  });
  it("commits an unknown-request tombstone before a delayed issue can arrive", async () => {
    const s = await service(), input = scope(); await s.custody.revoke(input, context());
    await expect(s.custody.issue(input, context())).rejects.toThrow(); await gone(input);
  });
  it("blocks stale issuer instances after another instance recovers the durable epoch", async () => {
    const a = await service(), input = scope(), d = await a.custody.issue(input, context());
    const b = await service(); await gone(input, d.credential);
    await expect(a.custody.issue(scope(), context())).rejects.toThrow();
    const next = scope(), delivery = await b.custody.issue(next, context()); await b.custody.revoke(next, context()); await gone(next, delivery.credential);
  });
  it("recovers a committed issue whose response and subsequent control connection were lost", async () => {
    const base = broker(); let offline = false;
    const crashing: TaskPreviewIssuerBroker = { async call(op, data, ctx) {
      if (offline) throw new Error("CONTROL_PROCESS_GONE");
      const value = await base.call(op, data, ctx);
      if (op === "issue") { offline = true; throw new Error("DELIVERY_LOST_AFTER_COMMIT"); }
      return value;
    } };
    const s = await service(crashing), input = scope(); await expect(s.custody.issue(input, context())).rejects.toThrow();
    expect((await row(input)).state).toBe("ISSUED"); await service(); await gone(input);
  });
  it("recovers a lost fence acknowledgement and denies login before terminating the existing session", async () => {
    const base = broker(), s = await service(base), input = scope(), d = await s.custody.issue(input, context());
    const c = await open(d.credential.role, d.credential.password); await c.query("select pg_advisory_lock(7149046)");
    await base.call("fence", { scope: input }, context());
    expect((await row(input)).state).toBe("FENCED");
    await expect(open(d.credential.role, d.credential.password)).rejects.toMatchObject({ code: expect.stringMatching(/^(28P01|28000)$/) });
    expect((await c.query("select 1 alive")).rows[0].alive).toBe(1);
    await service(); await gone(input, d.credential); await c.end();
  });
  it("rolls back a pending DROP on actual control-backend termination, then recovers", async () => {
    const base = broker(), s = await service(base), input = scope(), d = await s.custody.issue(input, context());
    await base.call("fence", { scope: input }, context());
    const c = await open(), pid = (await c.query("select pg_backend_pid() pid")).rows[0].pid;
    await c.query("begin"); await c.query(TASK_PREVIEW_ISSUER_SQL, ["finalize", JSON.stringify({ scope: input })]);
    expect((await admin.query("select pg_terminate_backend($1,1000) killed", [pid])).rows[0].killed).toBe(true);
    expect((await row(input)).state).toBe("FENCED"); await service(); await gone(input, d.credential); await c.end();
  });
  it("requires the NOLOGIN fence to commit in a different transaction", async () => {
    const s = await service(), input = scope(), d = await s.custody.issue(input, context()), c = await open();
    await c.query("begin"); await c.query(TASK_PREVIEW_ISSUER_SQL, ["fence", JSON.stringify({ scope: input })]);
    await expect(c.query(TASK_PREVIEW_ISSUER_SQL, ["finalize", JSON.stringify({ scope: input })])).rejects.toMatchObject({ message: "TASK_ISSUER_COMMITTED_FENCE_REQUIRED" });
    await c.query("rollback"); await c.end(); await s.custody.revoke(input, context()); await gone(input, d.credential);
  });
  it("does not revoke or terminate a substituted same-prefix role OID", async () => {
    const s = await service(), input = scope(), d = await s.custody.issue(input, context()), original = await row(input);
    try {
      await admin.query(`update ${TABLE} set role_oid=$2 where id=$1`, [input.requestId, canaryOid]);
      await expect(s.custody.revoke(input, context())).rejects.toThrow(); await expect(service()).rejects.toThrow();
      expect((await canary.query("select 1 alive")).rows[0].alive).toBe(1); expect((await row(input)).state).toBe("ISSUED");
    } finally { await admin.query(`update ${TABLE} set role_oid=$2 where id=$1`, [input.requestId, original.role_oid]); }
    await service(); await gone(input, d.credential);
  });
  it("rejects changed ownership and null epochs at the SQL boundary", async () => {
    let captured: Record<string, unknown> | undefined;
    const base = broker(), s = await service({ async call(op, data, ctx) { if (op === "issue") captured = { ...data }; return base.call(op, data, ctx); } });
    const input = scope(), d = await s.custody.issue(input, context());
    await expect(base.call("fence", { scope: { ...input, principal: { ...input.principal, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } }, context())).rejects.toThrow();
    await expect(base.call("issue", { ...captured, scope: scope(), epoch: null }, context())).rejects.toThrow();
    await s.custody.revoke(input, context()); await gone(input, d.credential); captured = undefined;
  });
  it("keeps issuer tables/functions private with invoker-only execution and forced RLS", async () => {
    expect((await admin.query(`select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='careslink_task_preview_issuer' and c.relkind='r' order by relname`)).rows)
      .toEqual(["control", "leases"].map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true })));
    expect((await admin.query("select prosecdef from pg_proc where oid='careslink_task_preview_issuer.call(text,jsonb)'::regprocedure")).rows[0].prosecdef).toBe(false);
    for (const role of ["anon", "authenticated", "service_role", "authenticator", "careslink_v1_generation_job_list_caller"]) {
      expect((await admin.query("select has_schema_privilege($1,'careslink_task_preview_issuer','usage') allowed", [role])).rows[0].allowed).toBe(false);
      expect((await admin.query("select has_function_privilege($1,'careslink_task_preview_issuer.call(text,jsonb)','execute') allowed", [role])).rows[0].allowed).toBe(false);
    }
  });
  it("sweeps real 60-second expiry without requiring the page or an issue-process timer", async () => {
    const s = await service(), input = scope(), d = await s.custody.issue(input, context()), c = await open(d.credential.role, d.credential.password);
    await c.query("select pg_advisory_lock(7149047)");
    await delay(Math.max(0, Date.parse(d.credential.deliveryExpiresAt) - Date.now()) + 250);
    await expect(open(d.credential.role, d.credential.password)).rejects.toMatchObject({ code: expect.stringMatching(/^(28P01|28000)$/) });
    expect((await c.query("select 1 alive")).rows[0].alive).toBe(1); // Expiry alone is NOT session revocation.
    await s.sweepExpired(context()); await gone(input, d.credential); await c.end();
  }, 70000);
});
