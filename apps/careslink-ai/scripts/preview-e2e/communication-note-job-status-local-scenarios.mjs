import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const MIGRATIONS = [
  "20260809120000_create_v1_shadow_foundation.sql",
  "20260810131648_add_v1_mobile_sync_shadow.sql",
  "20260810135000_harden_shadow_points_grant_identity.sql",
  "20260811102502_add_v1_privacy_review_confirmation.sql",
  "20260811134719_harden_v1_note_facts_schema_and_active_sessions.sql",
  "20260820135834_add_v1_note_generation_durable_shadow.sql",
  "20260821071044_add_v1_note_generation_worker_rpc_shadow.sql",
  "20260823213144_harden_v1_note_generation_registration_retention.sql",
  "20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql",
  "20260906233034_add_v1_communication_note_job_status_reader.sql",
];
const CALLER = "careslink_v1_generation_job_status_caller";
const EXECUTOR = "careslink_v1_generation_job_status_executor";
const RPC = "careslink_v1_generation.get_v1_communication_note_job_status(uuid,uuid,uuid,text,text)";
const GENERIC = "careslink_v1_generation.get_v1_shadow_note_generation_job_status(uuid,uuid,uuid,text,text)";
const SQL = "select careslink_v1_generation.get_v1_communication_note_job_status($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text) as data";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_SESSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const args = (owner = OWNER, session = SESSION, job = JOB) =>
  [owner, session, job, "1.0.0-shadow.1", "2026-08-09.v1-shadow"];
const BOOTSTRAP = `begin;
create role postgres
  login inherit nosuperuser createdb createrole noreplication bypassrls
  password null;
alter database postgres owner to postgres;
grant pg_read_all_stats, pg_signal_backend to postgres;

set role postgres;

create role anon
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role authenticated
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role service_role
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication bypassrls;
create role authenticator
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;

create schema auth authorization postgres;
create schema extensions authorization postgres;
revoke all on schema auth, extensions
from public, anon, authenticated, service_role, authenticator;
grant usage on schema auth to anon, authenticated, service_role;

create extension pgcrypto with schema extensions;

create table auth.users (
  instance_id pg_catalog.uuid not null,
  id pg_catalog.uuid primary key,
  aud pg_catalog.text,
  role pg_catalog.text,
  email pg_catalog.text,
  encrypted_password pg_catalog.text,
  email_confirmed_at pg_catalog.timestamptz,
  raw_app_meta_data pg_catalog.jsonb,
  raw_user_meta_data pg_catalog.jsonb,
  is_anonymous pg_catalog.bool not null default false,
  banned_until pg_catalog.timestamptz,
  deleted_at pg_catalog.timestamptz,
  created_at pg_catalog.timestamptz not null default pg_catalog.now(),
  updated_at pg_catalog.timestamptz not null default pg_catalog.now()
);

create table auth.sessions (
  id pg_catalog.uuid primary key,
  user_id pg_catalog.uuid not null references auth.users(id) on delete cascade,
  created_at pg_catalog.timestamptz not null default pg_catalog.now(),
  updated_at pg_catalog.timestamptz not null default pg_catalog.now(),
  not_after pg_catalog.timestamptz
);

revoke all on auth.users, auth.sessions
from public, anon, authenticated, service_role, authenticator;

create function auth.jwt()
returns pg_catalog.jsonb
language sql
stable
security invoker
set search_path = ''
as $careslink_points_terminal_bootstrap$
  select coalesce(
    nullif(
      pg_catalog.current_setting('request.jwt.claims', true),
      ''
    )::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb
  )
$careslink_points_terminal_bootstrap$;

create function auth.uid()
returns pg_catalog.uuid
language sql
stable
security invoker
set search_path = ''
as $careslink_points_terminal_bootstrap$
  select nullif(auth.jwt()->>'sub', '')::pg_catalog.uuid
$careslink_points_terminal_bootstrap$;

grant execute on function auth.jwt(), auth.uid()
to anon, authenticated, service_role;

reset role;
commit;
`;

export async function verifyJobStatusScenarios(owner, actor, peer, passed, onScenario) {
  const scenario = async (name, run) => {
    onScenario(name);
    await run();
    passed.push(name);
  };
  await scenario("non-superuser-migration-chain", async () => {
    await owner.query(BOOTSTRAP);
    await actor.query("set role postgres");
    assert.deepEqual((await actor.query("select rolsuper from pg_roles where rolname=current_user")).rows, [{ rolsuper: false }]);
    for (const name of MIGRATIONS) {
      onScenario("migration:" + name);
      const sql = await readFile(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8");
      // Each repository migration owns or is supplied one complete transaction.
      await actor.query("begin");
      await actor.query(sql);
      await actor.query("commit");
      if (name === "20260820135834_add_v1_note_generation_durable_shadow.sql") {
        // Match the existing local migration runner's temporary schema-name
        // resolution grant. This grants no table/function capability.
        await owner.query("grant usage on schema careslink_v1_generation to postgres");
      }
    }
    await actor.query("reset role");
    await owner.query("revoke usage on schema careslink_v1_generation from postgres");
  });

  await scenario("role-attributes-and-no-runtime-membership", async () => {
    for (const role of [CALLER, EXECUTOR]) {
      assert.deepEqual((await owner.query(`select rolcanlogin, rolinherit, rolsuper,
        rolcreatedb, rolcreaterole, rolreplication, rolbypassrls from pg_roles where rolname=$1`, [role])).rows,
      [{ rolcanlogin: false, rolinherit: false, rolsuper: false, rolcreatedb: false,
        rolcreaterole: false, rolreplication: false, rolbypassrls: false }]);
      const edges = (await owner.query(`select member::regrole::text as member,
        inherit_option, set_option from pg_auth_members where roleid=$1::regrole`, [role])).rows;
      assert.ok(edges.every((edge) => edge.member === "postgres" && !edge.inherit_option && !edge.set_option));
      assert.equal((await owner.query("select count(*)::int as count from pg_auth_members where member=$1::regrole", [role])).rows[0].count, 0);
    }
  });

  await scenario("exact-function-acls-and-empty-search-path", async () => {
    assert.deepEqual((await owner.query(`select p.prosecdef, p.proconfig, r.rolname
      from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=$1::regprocedure`, [RPC])).rows,
    [{ prosecdef: true, proconfig: ['search_path=""'], rolname: EXECUTOR }]);
    for (const role of ["anon", "authenticated", "service_role", "authenticator",
      "careslink_v1_generation_owner_api_executor", "careslink_v1_generation_executor"]) {
      assert.equal((await owner.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, RPC])).rows[0].allowed, false);
    }
    for (const [role, allowed] of [[CALLER, [RPC.split(".")[1].split("(")[0]]], [EXECUTOR, [RPC.split(".")[1].split("(")[0], GENERIC.split(".")[1].split("(")[0]]]]) {
      const functions = (await owner.query(`select proname from pg_proc where pronamespace='careslink_v1_generation'::regnamespace
        and has_function_privilege($1,oid,'EXECUTE') order by proname`, [role])).rows.map((row) => row.proname);
      assert.deepEqual(functions, allowed.sort());
      assert.equal((await owner.query(`select count(*)::int as count from pg_proc p
        where p.pronamespace='public'::regnamespace and p.prosecdef
        and has_function_privilege($1,p.oid,'EXECUTE')`, [role])).rows[0].count, 0);
      assert.equal((await owner.query(`select count(*)::int as count from pg_class
        where relnamespace in ('public'::regnamespace,'auth'::regnamespace,'careslink_v1_generation'::regnamespace)
        and relkind in ('r','p','v','m','S') and
        (has_table_privilege($1,oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))`, [role])).rows[0].count, 0);
      assert.equal((await owner.query("select has_schema_privilege($1,'careslink_v1_generation','CREATE') as allowed", [role])).rows[0].allowed, false);
    }
  });

  // Local metadata fixtures intentionally bypass only FK triggers, so they need
  // no model/payload/admission lifecycle. CHECK constraints, real readers and
  // forced owner RLS remain intact. This is not admission or Hosted Auth proof.
  await owner.query(`insert into auth.users(instance_id,id,aud,role,email_confirmed_at,raw_app_meta_data)
    values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',
      clock_timestamp()-interval '1 minute','{"role":"provider"}'),
      ('00000000-0000-0000-0000-000000000000',$2,'authenticated','authenticated',
      clock_timestamp()-interval '1 minute','{"role":"provider"}');
  `, [OWNER, FOREIGN]);
  await owner.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4)", [SESSION, OWNER, OTHER_SESSION, FOREIGN]);
  await owner.query("set session_replication_role=replica");
  try {
    await owner.query(`insert into careslink_v1_generation.jobs (
      id,owner_user_id,initiating_session_id,admission_transport,payload_id,note_type,source_locale,
      service_code,rate_catalog_version,contract_version,schema_version,privacy_review_id,
      privacy_scanner_policy_version,privacy_review_revision,cleaned_facts_hash,idempotency_hash,request_hash,
      worker_policy_version,worker_policy_digest,provider_policy_version,provider_policy_digest,
      payload_policy_version,payload_policy_snapshot_hash,next_eligible_at,created_at,updated_at)
    values ($1,$2,$3,'COOKIE',gen_random_uuid(),'communication','en','note.communication.generate',
      '2026-08-09.v1-shadow','1.0.0-shadow.1','2026-08-09.v1-shadow',gen_random_uuid(),
      '2026-08-11.preview.1',1,repeat('a',64),repeat('b',64),repeat('c',64),'fixture.worker',repeat('d',64),
      'fixture.provider',repeat('e',64),'fixture.payload',repeat('f',64),
      '2026-09-07T00:00:00Z','2026-09-07T00:00:00Z','2026-09-07T00:00:00Z')`, [JOB, OWNER, SESSION]);
  } finally { await owner.query("set session_replication_role=origin"); }
  await owner.query(`create role status_test_login login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
    grant careslink_v1_generation_job_status_caller to status_test_login
      with admin false, inherit false, set true`);
  await actor.query("set session authorization status_test_login");
  await actor.query("set role " + CALLER);

  await scenario("all-five-status-envelopes-and-no-read-mutations", async () => {
    for (const status of ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]) {
      await owner.query("set session_replication_role=replica");
      try {
        await owner.query(`update careslink_v1_generation.jobs set status=$1,
          attempt_count=case when $1='QUEUED' then 0 else 1 end,
          next_eligible_at=case when $1='QUEUED' then created_at else null end,
          started_at=case when $1='QUEUED' then null else created_at end,
          finished_at=case when $1 in ('SUCCEEDED','FAILED','CANCELLED') then created_at else null end,
          failure_reason=case when $1='FAILED' then 'PROVIDER_PERMANENT' when $1='CANCELLED' then 'CANCELLED' else null end,
          result_document_id=case when $1='SUCCEEDED' then $2::uuid else null end,
          result_revision_id=case when $1='SUCCEEDED' then $3::uuid else null end,
          result_content_hash=case when $1='SUCCEEDED' then repeat('a',64) else null end`, [status, OWNER, SESSION]);
      } finally { await owner.query("set session_replication_role=origin"); }
      const before = (await owner.query("select to_jsonb(j) as job from careslink_v1_generation.jobs j")).rows;
      const job = (await actor.query(SQL, args())).rows[0].data.job;
      assert.equal(job.status, status);
      assert.deepEqual(Object.keys(job).sort(), ["attemptCount","createdAt","failureCode","finishedAt","jobId","noteType","result","serviceCode","startedAt","status","updatedAt"].sort());
      assert.equal(job.jobId, JOB);
      if (status === "FAILED") assert.equal(job.failureCode, "GENERATION_FAILED");
      if (status === "SUCCEEDED") assert.equal(job.result.saveState, "SERVER_ACKNOWLEDGED");
      assert.deepEqual((await owner.query("select to_jsonb(j) as job from careslink_v1_generation.jobs j")).rows, before);
    }
  });
  await scenario("foreign-and-missing-job-are-identical", async () => {
    for (const values of [args(FOREIGN, OTHER_SESSION), args(OWNER, SESSION, FOREIGN)]) {
      await assert.rejects(actor.query(SQL, values), { code: "P0001", message: "NOT_FOUND" });
    }
  });
  await scenario("other-four-note-types-are-hidden", async () => {
    await owner.query("set session_replication_role=replica");
    try {
      for (const type of ["handover", "progress", "ndis", "incident_factual"]) {
        await owner.query("update careslink_v1_generation.jobs set note_type=$1,service_code=$2", [type, "note."+type+".generate"]);
        await assert.rejects(actor.query(SQL, args()), { code: "P0001", message: "NOT_FOUND" });
      }
      await owner.query("update careslink_v1_generation.jobs set note_type='communication',service_code='note.communication.generate'");
    } finally { await owner.query("set session_replication_role=origin"); }
  });
  await scenario("expired-and-mismatched-sessions-denied", async () => {
    await assert.rejects(actor.query(SQL, args(OWNER, OTHER_SESSION)), { code: "P0001", message: "SESSION_REVOKED" });
    await owner.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1", [SESSION]);
    await assert.rejects(actor.query(SQL, args()), { code: "P0001", message: "SESSION_REVOKED" });
    await owner.query("update auth.sessions set not_after=null where id=$1", [SESSION]);
  });
  await scenario("caller-cannot-query-tables-generic-reader-or-writes", async () => {
    for (const sql of ["select * from careslink_v1_generation.jobs",
      "delete from careslink_v1_generation.jobs", "select * from public.point_wallets",
      "select careslink_v1_generation.get_v1_shadow_note_generation_job_status(null,null,null,null,null)",
      "select careslink_v1_generation.cancel_v1_shadow_note_generation_job(null,null,null,null,null)",
      "set role careslink_v1_generation_owner_api_executor"]) {
      await assert.rejects(actor.query(sql), { code: "42501" });
    }
  });
  await scenario("session-expiry-during-auth-lock-wait", async () => {
    await peer.query("begin");
    await peer.query("update auth.sessions set not_after=clock_timestamp()+interval '400 milliseconds' where id=$1", [SESSION]);
    const pid = (await actor.query("select pg_backend_pid() as pid")).rows[0].pid;
    const pending = actor.query(SQL, args()).catch((error) => error);
    let blocked = false;
    for (let i = 0; i < 40; i++) {
      if ((await owner.query("select cardinality(pg_blocking_pids($1))>0 as blocked", [pid])).rows[0].blocked) { blocked = true; break; }
      await delay(10);
    }
    assert.equal(blocked, true);
    await delay(450);
    await peer.query("commit");
    const result = await pending;
    assert.equal(result.code, "P0001");
    assert.equal(result.message, "SESSION_REVOKED");
  });
  await actor.query("reset session authorization");
  await owner.query(`revoke ${CALLER} from status_test_login; drop role status_test_login`);
}
