/** Explicit opt-in, freshly owned synthetic PG16 only. No existing target input,
 * HTTP server, Hosted credentials, AI/worker execution, or production migration. */
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewBrowserDatabase } from "./communication-note-self-review.database.mjs";
import { createTestOnlyCommunicationNoteTaskUnixReadPort } from "../../src/lib/communication-note-workspace-task-postgres.server";
import { createCommunicationNoteJobListRepository } from "../../src/lib/v1/communication-note-job-list-repository.server";
import { createCommunicationNoteWorkspaceDurableRuntime } from "../../src/lib/communication-note-workspace-durable.server";
import { createCommunicationNoteWorkspaceHandler } from "../../src/lib/communication-note-workspace.server";
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/supabase-server", () => ({ createCareslinkServerSupabaseClient: () => { throw new Error("NO_AMBIENT_AUTH"); } }));

const enabled = process.env.CARESLINK_TASK_POSTGRES_LOCAL === "OWNED_UNIX_ONLY";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", OTHER_SESSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REF = "abcdefghijklmnopqrst", CALLER = "careslink_v1_generation_job_list_caller";
let root, socket, database, admin, role, password, baseline;
const clients = [];
async function open(user = "review_test_bootstrap", secret = "", application = "task-read-local-observer") {
  const client = new Client({ host: socket, port: 15437, user, password: secret, database: "postgres", ssl: false,
    application_name: application, connectionTimeoutMillis: 1000, query_timeout: 7000,
    options: "-c statement_timeout=6000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=15000" });
  clients.push(client); client.on("error", () => {}); await client.connect(); return client;
}
const principal = (userId = USER, sessionId = SESSION) => ({ userId, sessionId, transport: "COOKIE" });
function port(identity = principal()) {
  return createTestOnlyCommunicationNoteTaskUnixReadPort({ projectRef: REF, principal: identity, socket, port: 15437,
    credential: { role, password, deliveryExpiresAt: new Date(Date.now() + 60000).toISOString() } });
}
function repository(signal = new AbortController().signal, identity = principal()) {
  const p = port(identity);
  return createCommunicationNoteJobListRepository({ principal: identity, query: (_sql, values) => p.execute(values, { signal }) });
}
async function waitFor(check, message) {
  const limit = Date.now() + 3000;
  while (Date.now() < limit) { const result = await check(); if (result) return result; await delay(10); }
  throw new Error(message);
}
async function noSessions() {
  await waitFor(async () => (await admin.query("select count(*)::int as n from pg_catalog.pg_stat_activity where usename=$1", [role])).rows[0].n === 0,
    "LOCAL_READ_SESSION_RESIDUE");
}
async function snapshot() {
  return JSON.stringify((await admin.query(`select
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.point_ledger_entries x) as ledger,
    (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.point_reservations x) as reservations,
    (select count(*) from careslink_v1_generation.jobs) as jobs,
    (select count(*) from public.self_review_events) as reviews,
    (select count(*) from public.ai_document_mutation_receipts) as edits`)).rows);
}

describe.skipIf(!enabled)("owned PG16 actual task read/cancellation source", () => {
  beforeAll(async () => {
    root = await mkdtemp("/private/tmp/cl-job-browser-"); expect(await realpath(root)).toBe(root);
    database = createReviewBrowserDatabase(root, "WORKSPACE_TASK"); socket = root + "/pg/socket";
    await database.start(); await database.verifySettlement(); admin = await open();
    baseline = await snapshot();
  }, 60000);
  beforeEach(async () => {
    role = "careslink_v1_job_list_runtime_" + randomBytes(8).toString("hex"); password = randomBytes(32).toString("base64url");
    // Only this newly created database receives disposable test credentials.
    expect(role).toMatch(/^careslink_v1_job_list_runtime_[a-f0-9]{16}$/); expect(password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await admin.query(`create role ${role} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 2 password '${password}'`);
    await admin.query(`grant ${CALLER} to ${role} with admin false, inherit false, set true`);
  });
  afterEach(async () => {
    if (!admin || !role) return;
    try { await noSessions(); expect(await snapshot()).toBe(baseline); }
    finally {
      // Fixture-owned cleanup, not the production port's credential lifecycle.
      await admin.query(`alter role ${role} nologin`);
      await admin.query("select pg_catalog.pg_terminate_backend(pid,1000) from pg_catalog.pg_stat_activity where usename=$1", [role]);
      await admin.query(`drop role ${role}`); password = "";
      expect((await admin.query("select count(*)::int as n from pg_catalog.pg_roles where rolname=$1", [role])).rows[0].n).toBe(0);
    }
  });
  afterAll(async () => {
    await Promise.allSettled(clients.map(client => client.end()));
    if (database) await database.stop();
    if (root) {
      expect(root).toMatch(/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/); expect(await realpath(root)).toBe(root);
      await rm(root, { recursive: true });
      console.log(JSON.stringify({ stage: "task-read-owned-fixture-removed", stopped: true, removed: true, modelCalled: false }));
    }
  }, 30000);
  it("reads exact owner metadata using the real repository and two least-privilege sessions", async () => {
    const expected = (await admin.query("select id from careslink_v1_generation.jobs where owner_user_id=$1 and note_type='communication' order by created_at desc,id desc limit 20", [USER])).rows.map(r => r.id);
    expect(expected).toHaveLength(3);
    const page = await repository().list(null); expect(page.tasks.map(t => t.jobId)).toEqual(expected);
    for (const task of page.tasks) expect(Object.keys(task).sort()).toEqual(["createdAt", "jobId", "status", "updatedAt"]);
    await noSessions();
  });
  it("isolates another owner with actual SQL/RLS", async () => {
    const page = await repository(undefined, principal(OTHER, OTHER_SESSION)).list(null);
    expect(page.tasks).toEqual([]); await noSessions();
  });
  it("passes an exact microsecond keyset position into the fixed physical query", async () => {
    const first = await repository().list(null);
    const { jobId, createdAt } = first.tasks[0];
    const next = await repository().list({ jobId, createdAt });
    expect(next.tasks.map(t => t.jobId)).toEqual(first.tasks.slice(1).map(t => t.jobId)); await noSessions();
  });
  it("maps actual mismatched session to SESSION_REVOKED only after cleanup", async () => {
    await expect(repository(undefined, principal(USER, OTHER_SESSION)).list(null)).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    await noSessions();
  });
  it("maps actual expired provider session and leaves no query or lock", async () => {
    await admin.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1", [SESSION]);
    try { await expect(repository().list(null)).rejects.toMatchObject({ code: "SESSION_REVOKED" }); await noSessions(); }
    finally { await admin.query("update auth.sessions set not_after=null where id=$1", [SESSION]); }
  });
  it("cancels an actual auth-row lock wait without unlocking the blocking transaction", async () => {
    const blocker = await open(), controller = new AbortController();
    await blocker.query("begin"); await blocker.query("select id from auth.sessions where id=$1 for update", [SESSION]);
    try {
      const pending = repository(controller.signal).list(null), rejected = expect(pending).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
      const target = await waitFor(async () => (await admin.query("select pid from pg_stat_activity where usename=$1 and application_name like 'cl-task-read-%' and wait_event_type='Lock'", [role])).rows[0], "LOCAL_LOCK_WAIT_MISSING");
      controller.abort(); await rejected; await noSessions();
      expect((await admin.query("select count(*)::int n from pg_locks where pid=$1", [target.pid])).rows[0].n).toBe(0);
      // The unrelated lock owner is still in its transaction, not terminated.
      expect((await blocker.query("select txid_current_if_assigned() is not null as active")).rows[0].active).toBe(true);
    } finally { await blocker.query("rollback"); await blocker.end(); }
  });
  it("server lock timeout fails closed and cleans independently without a caller abort", async () => {
    const blocker = await open(); await blocker.query("begin"); await blocker.query("select id from auth.sessions where id=$1 for update", [SESSION]);
    try { await expect(repository().list(null)).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" }); await noSessions(); }
    finally { await blocker.query("rollback"); await blocker.end(); }
  });
  it("withholds results when the real cleanup connection is lost", async () => {
    const blocker = await open(), controller = new AbortController();
    await blocker.query("begin"); await blocker.query("select id from auth.sessions where id=$1 for update", [SESSION]);
    try {
      const pending = repository(controller.signal).list(null), rejected = expect(pending).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
      await waitFor(async () => (await admin.query("select pid from pg_stat_activity where usename=$1 and application_name like 'cl-task-read-%' and wait_event_type='Lock'", [role])).rows[0], "LOCAL_LOCK_WAIT_MISSING");
      const cleanup = (await admin.query("select pid from pg_stat_activity where usename=$1 and application_name like 'cl-task-clean-%'", [role])).rows;
      expect(cleanup).toHaveLength(1);
      expect((await admin.query("select pg_terminate_backend($1,1000) as terminated", [cleanup[0].pid])).rows[0].terminated).toBe(true);
      controller.abort(); await rejected; await noSessions();
    } finally { await blocker.query("rollback"); await blocker.end(); }
  });
  it("does not terminate an unrelated connection carrying a read-like application name", async () => {
    const canary = await open("review_test_bootstrap", "", "cl-task-read-" + randomBytes(16).toString("hex"));
    try { await repository().list(null); expect((await canary.query("select 1 as alive")).rows).toEqual([{ alive: 1 }]); }
    finally { await canary.end(); }
  });
  it("rejects excess role membership at attestation, before any task query", async () => {
    await admin.query(`grant careslink_v1_generation_job_status_caller to ${role} with admin false, inherit false, set true`);
    await expect(repository().list(null)).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" }); await noSessions();
  });
  it("denies direct table reads and does not require pg_signal_backend membership", async () => {
    const runtime = await open(role, password);
    try {
      expect((await runtime.query("select pg_has_role(current_user,'pg_signal_backend','MEMBER') as member")).rows[0].member).toBe(false);
      await expect(runtime.query("select id from careslink_v1_generation.jobs")).rejects.toMatchObject({ code: "42501" });
      await runtime.query(`set role ${CALLER}`);
      await expect(runtime.query("select id from careslink_v1_generation.jobs")).rejects.toMatchObject({ code: "42501" });
    } finally { await runtime.end(); }
  });
  it("composes actual physical task port into the default-off workspace HTTP core", async () => {
    const key = "sb_publishable_1234567890abcdef";
    const runtime = createCommunicationNoteWorkspaceDurableRuntime({ env: {
      CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "true", CARESLINK_V1_PRODUCT_API_ENABLED: "true",
      CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF: REF,
      CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_VERCEL_PROJECT_ID: "prj_1234567890abcdef",
      VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: "prj_1234567890abcdef",
      SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
      SUPABASE_PUBLISHABLE_KEY: key, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key },
      resolveTaskRead: async ({ principal: identity }) => port(identity),
      // Only Cookie Auth and document RPC replies are mocked in this transport
      // test. The task SQL and its fresh-session checks run on actual PostgreSQL.
      createCookieClient: async () => ({ auth: {
        getClaims: async () => ({ data: { claims: { sub: USER, session_id: SESSION } }, error: null }),
        getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
        rpc: async name => ({ data: name === "resolve_v1_current_session_status" ? "ACTIVE" : { documents: [], nextCursor: null, hasMore: false }, error: null }) }),
    });
    const handle = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime });
    const response = await handle(new Request("https://app.example.invalid/api/ai-documents/communication-note/documents", { headers: { "sec-fetch-site": "same-origin" } }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: "AVAILABLE", documents: [], taskPage: { nextCursor: null } });
    expect(response.headers.get("cache-control")).toContain("no-store"); await noSessions();
  });
});
