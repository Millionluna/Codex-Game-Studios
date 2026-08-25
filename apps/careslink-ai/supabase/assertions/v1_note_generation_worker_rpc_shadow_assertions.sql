-- Manual rollback-only assertions for a fresh disposable Preview database.
-- This file is not executed by pnpm test. Submit the whole file as one request:
-- BEGIN through the final ROLLBACK share transaction-only TEST_ONLY fixtures.
-- The serial claim arbitration below does not prove two independent database
-- sessions race safely. It locks the SKIP LOCKED structure and single-active-
-- attempt invariant; a separately authorized disposable Preview must run the
-- real two-connection concurrency gate before any execute grant or activation.
-- Deleted r20 separately closed that PostgreSQL 17.6 race subset; this file
-- remains serial evidence.
-- On 2026-08-24, from a worktree based on HEAD
-- 93c5c2aa956d20e5f1f704e24e5dd17a478fc2ea plus this batch's uncommitted
-- concurrency-harness changes, a clean local PostgreSQL 16.15 cluster
-- (server_version_num = 160015) closed the PostgreSQL 16 engine, serial and
-- true-two-session race gates: all 27/27 repository migrations (V1 15/15),
-- all 7/7 rollback suites, the independent postcheck and all 3/3 real
-- two-connection concurrency scenarios passed. The loopback-only endpoint used
-- no password and no TLS. Fixed SQL cleanup deleted the local runner, helper
-- surface and fixtures. The outer gate then stopped the server and permanently
-- deleted the exact temporary cluster directory. Production was never touched.
-- The historical pre-retention body, from the worktree based on HEAD
-- 000f17af88eff9266a92e484ba2080335d20fd2d, passed on deleted PostgreSQL
-- 17.6 r21: 14/14 migrations, 7/7 rollback suites and the independent
-- hard-off/zero-row/role/RLS/ACL postcheck all passed.
-- The deleted r21 branch was v1-note-worker-rpc-r21, id
-- 688da83b-78e8-45fa-8646-b015822d59b0 and ref kfgjxlilotpaxnozomqq;
-- deletion was confirmed with its id, ref and name absent.
-- Production must never be the SQL target for this assertion; Production
-- adocsnwnslxhxcjgbyee remained the sole healthy default branch and was never
-- a SQL target. Historical deleted-r9 evidence remains identified by source
-- HEAD c7b70e9f84b9b804779039711b85cc7eda55bd57, branch id
-- a1571c30-a322-4cea-b332-b189804df195, ref hyczevivoakmflswmwlb and name
-- v1-note-worker-rpc-r9.
-- Historical pre-header-edit full-file SHA-256:
-- 7ac37a3698e60636725195eae9eb07992a300c0219ab47f83c56128e5d8e9c3d.
-- Historical r21 executed BEGIN-through-ROLLBACK body SHA-256:
-- bdcd479473ed1c6ae0782127eb1d8e5765e3de2ede829aadeb3eb35c2eeadaac;
-- 146488 bytes.
-- The historical deleted-r22 source body added the separately CLI-generated
-- registration-retention migration catalog and enforcement proof. From exact
-- execution source HEAD 4cae6f1a08ce2bcc7e43456c275cf5e743f13fdf it
-- passed on deleted PostgreSQL 17.6 r22: 15/15 migrations, 7/7 rollback suites
-- and the independent 12-table/9-RPC/hard-off/zero-fixture/API-denial,
-- two-admin-only-edge and validated retention-FK/index postcheck all passed.
-- The confirmed branch rate was US$0.01344/hour. The non-default,
-- persistent=false, with_data=false branch was v1-note-worker-rpc-r22, id
-- 0bc8db56-0e4a-42ec-9595-1f32a3d74a6b and ref wuzcjcfrkctelcnbbgtg.
-- Security advisors were 23 INFO + 3 pre-existing WARN globally and zero in
-- generation scope. Performance advisors were 144 INFO + 11 WARN globally;
-- generation scope had 20 INFO (14 unindexed FKs + 6 unused indexes) and zero
-- WARN/ERROR. Deletion was confirmed with r22 id and ref absent; Production
-- remained the sole healthy default and was never a SQL target. Historical
-- deleted-r22 executed BEGIN-through-ROLLBACK source SHA-256:
-- 1c9f65bdc7f1de86e1c7398399ecf029207ba1b2bdf9fa3634dadb482424fdbb;
-- 153956 bytes.
-- The deleted-r5 executed BEGIN-through-ROLLBACK source SHA-256 was:
-- 50b2b9cf03c7e23279cfed94f38958b949fefd722a3def9ff787d24c40b9a72f;
-- 161598 bytes. On 2026-08-25, official Supabase CLI 2.115.0 executed this
-- exact body in the final disposable no-data r5 gate: 30/30 migrations,
-- 11/11 rollback suites and the independent posture postcheck passed. r5 was
-- hosted-role-restore-r5-20260825, id
-- d68d531a-55e6-4374-be68-494da7542c75 and ref eqqlvqqhvsogusqhzuaq;
-- deletion and exact id/ref absence were confirmed. Production was never a
-- SQL target.
-- The current post-r5 proowner-hardened BEGIN-through-ROLLBACK source is
-- 162857 bytes with SHA-256
-- 1c30fd7a8604ec8a279ac8d8cf00155bf54801ee15d91dc8ecbc7bc9bc9cf859.
-- It moves the two migration-entry reader ownership checks from the one-time
-- postcheck into this committed suite. This exact augmented body has source and
-- static-contract evidence only until a fresh disposable Preview reruns it;
-- the deleted-r5 independent postcheck separately proved the same invariant.

\set ON_ERROR_STOP on

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

-- Assertion-only role access. These two temporary SET edges are rolled back
-- and are never migration/runtime or API memberships.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Prove the real migration posture before relaxing FORCE RLS for rollback-only
-- owner fixtures. This block reads only catalogs, never protected table rows.
do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_actual text[];
  v_expected text[];
begin
  if current_setting('server_version_num')::integer < 160000 then
    raise exception 'worker RPC shadow requires PostgreSQL 16 or newer';
  end if;

  if v_schema is null then
    raise exception 'worker RPC private schema is missing';
  end if;

  select array_agg(relation.relname::text order by relation.relname)
  into v_actual
  from pg_class as relation
  where relation.relnamespace = v_schema
    and relation.relkind = 'r';

  v_expected := array[
    'attempts', 'jobs', 'payload_grants', 'payload_policies',
    'payload_purge_outbox', 'payloads', 'provider_evidence',
    'provider_policies', 'settings', 'worker_policies',
    'worker_registration_provider_policies', 'worker_registrations'
  ]::text[];
  if to_regclass(
      'careslink_v1_generation.admission_policy_bindings'
    ) is not null
  then
    select array_agg(table_name order by table_name)
    into v_expected
    from unnest(
      array_append(v_expected, 'admission_policy_bindings')
    ) as expected_table(table_name);
  end if;

  if to_regclass(
      'careslink_v1_generation.worker_registration_retirements'
    ) is not null
  then
    select array_agg(table_name order by table_name)
    into v_expected
    from unnest(
      array_append(v_expected, 'worker_registration_retirements')
    ) as expected_table(table_name);
  end if;

  if v_actual is distinct from v_expected then
    raise exception 'worker RPC private table scope drifted: %', v_actual;
  end if;

  if exists (
    select 1
    from pg_class as relation
    where relation.relnamespace = v_schema
      and relation.relkind = 'r'
      and (
        not relation.relrowsecurity
        or not relation.relforcerowsecurity
        or relation.relowner <> 'careslink_v1_generation_owner'::regrole
      )
  ) then
    raise exception 'worker RPC private RLS or ownership posture is unsafe';
  end if;
end
$$;

-- The optional #29 retirement layer replaces only claim admission. Prove its
-- additive empty/RLS/API posture and the executor's exact helper, ledger-read
-- and registration-row-lock capabilities before any owner fixture relaxation.
set local role careslink_v1_generation_executor;
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
  v_retirement_ledger regclass := to_regclass(
    'careslink_v1_generation.worker_registration_retirements'
  );
  v_retirement_count bigint := 0;
  v_denied_role text;
begin
  if v_retirement_ledger is not null then
    execute
      'select count(*) from ' || v_retirement_ledger::text
    into v_retirement_count;
    if v_retirement_count <> 0 then
      raise exception 'worker RPC retirement ledger is not empty';
    end if;

    if not has_table_privilege(
        'careslink_v1_generation_executor',
        v_retirement_ledger,
        'SELECT'
      )
      or has_table_privilege(
        'careslink_v1_generation_executor',
        v_retirement_ledger,
        'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      )
      or has_any_column_privilege(
        'careslink_v1_generation_executor',
        v_retirement_ledger,
        'INSERT, UPDATE, REFERENCES'
      )
      or not has_function_privilege(
        'careslink_v1_generation_executor',
        'careslink_v1_generation._registration_accepts_new_work(text)',
        'EXECUTE'
      )
      or (
        select count(*)
        from pg_policy as policy
        where policy.polrelid = v_retirement_ledger
          and policy.polname =
            'worker_registration_retirements_generation_executor_select'
          and policy.polcmd = 'r'
          and policy.polpermissive
          and policy.polroles = array[
            'careslink_v1_generation_executor'::regrole::oid
          ]::oid[]
          and pg_get_expr(policy.polqual, policy.polrelid) = 'true'
          and policy.polwithcheck is null
      ) <> 1
    then
      raise exception 'worker executor retirement compatibility drifted';
    end if;

    if exists (
      with expected(column_name, privilege_type) as (
        values ('registration_digest', 'UPDATE')
      ),
      actual(column_name, privilege_type) as (
        select attribute.attname::text, acl.privilege_type
        from pg_attribute as attribute
        cross join lateral aclexplode(attribute.attacl) as acl
        where attribute.attrelid =
            'careslink_v1_generation.worker_registrations'::regclass
          and attribute.attnum > 0
          and not attribute.attisdropped
          and attribute.attacl is not null
          and acl.grantee =
            'careslink_v1_generation_executor'::regrole
      ),
      drift as (
        (select * from actual except all select * from expected)
        union all
        (select * from expected except all select * from actual)
      )
      select 1 from drift
    )
      or (
        select count(*)
        from pg_policy as policy
        where policy.polrelid =
            'careslink_v1_generation.worker_registrations'::regclass
          and policy.polname =
            'worker_registrations_generation_executor_lock'
          and policy.polcmd = 'w'
          and policy.polpermissive
          and policy.polroles is distinct from array[
            'careslink_v1_generation_executor'::regrole::oid
          ]::oid[]
      ) <> 0
      or (
        select count(*)
        from pg_policy as policy
        where policy.polrelid =
            'careslink_v1_generation.worker_registrations'::regclass
          and policy.polname =
            'worker_registrations_generation_executor_lock'
          and policy.polcmd = 'w'
          and policy.polpermissive
          and policy.polroles = array[
            'careslink_v1_generation_executor'::regrole::oid
          ]::oid[]
          and pg_get_expr(policy.polqual, policy.polrelid) = 'true'
          and pg_get_expr(policy.polwithcheck, policy.polrelid) = 'false'
      ) <> 1
    then
      raise exception 'worker registration lock-only ACL or policy drifted';
    end if;

    foreach v_denied_role in array array[
      'anon', 'authenticated', 'service_role'
    ] loop
      if has_table_privilege(
          v_denied_role,
          v_retirement_ledger,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        )
        or has_any_column_privilege(
          v_denied_role,
          v_retirement_ledger,
          'SELECT, INSERT, UPDATE, REFERENCES'
        )
        or has_function_privilege(
          v_denied_role,
          'careslink_v1_generation._registration_accepts_new_work(text)',
          'EXECUTE'
        )
        or exists (
          select 1
          from pg_type as object_type
          where object_type.typrelid = v_retirement_ledger
            and object_type.typnamespace = v_schema
            and has_type_privilege(
              v_denied_role,
              object_type.oid,
              'USAGE'
            )
        )
      then
        raise exception 'Data API retirement surface leaked to %',
          v_denied_role;
      end if;
    end loop;
  end if;
end
$$;

-- Only after the catalog proof may the dedicated owner see/seed TEST_ONLY
-- fixture rows inside this single transaction.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.settings no force row level security;
alter table careslink_v1_generation.jobs no force row level security;
alter table careslink_v1_generation.attempts no force row level security;
alter table careslink_v1_generation.worker_policies no force row level security;
alter table careslink_v1_generation.provider_policies no force row level security;
alter table careslink_v1_generation.payload_policies no force row level security;
alter table careslink_v1_generation.worker_registrations
  no force row level security;
alter table careslink_v1_generation.worker_registration_provider_policies
  no force row level security;
alter table careslink_v1_generation.payloads no force row level security;
alter table careslink_v1_generation.payload_grants
  no force row level security;
alter table careslink_v1_generation.provider_evidence
  no force row level security;
alter table careslink_v1_generation.payload_purge_outbox
  no force row level security;

do $$
declare
  v_owner_extension_fixture_count bigint := 0;
begin
  if to_regclass(
      'careslink_v1_generation.admission_policy_bindings'
    ) is not null
  then
    execute
      'alter table careslink_v1_generation.admission_policy_bindings '
      || 'no force row level security';
    execute
      'select count(*) from '
      || 'careslink_v1_generation.admission_policy_bindings'
    into v_owner_extension_fixture_count;
    execute
      'alter table careslink_v1_generation.admission_policy_bindings '
      || 'force row level security';
  end if;

  if (
    select count(*)
    from careslink_v1_generation.settings
    where capability = 'note_generation_v1'
      and enabled is false
      and shadow_only is true
  ) <> 1
    or (select count(*) from careslink_v1_generation.settings) <> 1
  then
    raise exception 'worker RPC setting is not hard-off';
  end if;

  if (select count(*) from careslink_v1_generation.worker_policies) <> 0
    or (select count(*) from careslink_v1_generation.provider_policies) <> 0
    or (select count(*) from careslink_v1_generation.payload_policies) <> 0
    or (select count(*) from careslink_v1_generation.worker_registrations) <> 0
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_provider_policies
    ) <> 0
    or (select count(*) from careslink_v1_generation.jobs) <> 0
    or (select count(*) from careslink_v1_generation.attempts) <> 0
    or (select count(*) from careslink_v1_generation.payloads) <> 0
    or (select count(*) from careslink_v1_generation.payload_grants) <> 0
    or (select count(*) from careslink_v1_generation.provider_evidence) <> 0
    or (
      select count(*) from careslink_v1_generation.payload_purge_outbox
    ) <> 0
    or v_owner_extension_fixture_count <> 0
  then
    raise exception 'worker RPC migration persisted policy or business fixtures';
  end if;

  if exists (
    select 1
    from information_schema.columns as column_metadata
    where column_metadata.table_schema = 'careslink_v1_generation'
      and (
        column_metadata.column_name in (
          'cleaned_facts', 'facts', 'canonical_content', 'provider_output',
          'provider_candidate', 'transcript', 'lease_token', 'vault_locator',
          'payload_locator', 'payload_handle', 'vault_grant', 'access_token',
          'refresh_token', 'idempotency_key', 'request_body', 'response_body',
          'url', 'error_message', 'points', 'point_cost'
        )
        or column_metadata.data_type = 'bytea'
        or (
          column_metadata.data_type in ('json', 'jsonb')
          and not (
            column_metadata.table_name = 'provider_evidence'
            and column_metadata.column_name = 'evidence'
          )
        )
      )
  ) then
    raise exception 'worker RPC private metadata boundary leaked sensitive data';
  end if;
end
$$;

-- These two readers were deliberately created by the migration-entry actor:
-- they cross into Supabase-owned auth and the existing privacy-review surface.
-- Exact signatures prevent overloads from satisfying this ownership proof.
do $$
declare
  v_entry_actor oid := (
    select role.oid
    from pg_catalog.pg_roles as role
    where role.rolname = pg_catalog.current_setting(
      'careslink.assertion_entry_role'
    )
  );
  v_signature text;
begin
  if v_entry_actor is null then
    raise exception 'assertion entry actor is missing';
  end if;

  foreach v_signature in array array[
    'careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamp with time zone)',
    'careslink_v1_generation.fresh_privacy_proof_expires_at(uuid,uuid,text,text,text,text,timestamp with time zone)'
  ] loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'migration-entry reader is missing: %', v_signature;
    end if;

    if (
      select routine.proowner
      from pg_catalog.pg_proc as routine
      where routine.oid = pg_catalog.to_regprocedure(v_signature)
    ) is distinct from v_entry_actor then
      raise exception 'migration-entry reader owner drifted: %', v_signature;
    end if;
  end loop;
end
$$;

do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_rpc_names constant text[] := array[
    'authorize_v1_shadow_note_generation_payload_attempt',
    'claim_v1_shadow_note_generation_job',
    'commit_v1_shadow_note_generation_success',
    'consume_v1_shadow_note_generation_payload_grant',
    'fence_v1_shadow_note_generation_attempt',
    'heartbeat_v1_shadow_note_generation_attempt',
    'recover_v1_shadow_note_generation_expired',
    'resolve_v1_shadow_note_generation_attempt',
    'settle_v1_shadow_note_generation_failure'
  ]::text[];
  v_actual text[];
  v_role text;
begin
  select array_agg(procedure.proname::text order by procedure.proname)
  into v_actual
  from pg_proc as procedure
  where procedure.pronamespace = v_schema
    and procedure.proname = any(v_rpc_names);

  if v_actual is distinct from v_rpc_names then
    raise exception 'worker RPC identity set drifted: %', v_actual;
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname = any(v_rpc_names)
      and (
        procedure.prorettype <> 'jsonb'::regtype
        or not procedure.prosecdef
        or procedure.proowner <> 'careslink_v1_generation_executor'::regrole
        or procedure.proconfig is null
        or cardinality(procedure.proconfig) <> 1
        or procedure.proconfig[1] is null
        or procedure.proconfig[1] not in ('search_path=', 'search_path=""')
      )
  ) then
    raise exception 'worker RPC owner, return type or definer posture drifted';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as acl
    left join pg_roles as grantee on grantee.oid = acl.grantee
    where procedure.pronamespace = v_schema
      and procedure.proname = any(v_rpc_names)
      and acl.privilege_type = 'EXECUTE'
      and (
        acl.grantee = 0
        or grantee.rolname in (
          'anon', 'authenticated', 'service_role',
          'careslink_v1_generation_owner'
        )
      )
  ) then
    raise exception 'worker RPC execute privilege leaked';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname = any(v_rpc_names)
      and (
        select array_agg(
          case
            when acl.grantee = 0 then 'PUBLIC'::text
            else grantee.rolname::text
          end
          order by
            case
              when acl.grantee = 0 then 'PUBLIC'::text
              else grantee.rolname::text
            end
        )
        from aclexplode(
          coalesce(procedure.proacl, acldefault('f', procedure.proowner))
        ) as acl
        left join pg_roles as grantee on grantee.oid = acl.grantee
        where acl.privilege_type = 'EXECUTE'
      ) is distinct from array['careslink_v1_generation_executor']::text[]
  ) then
    raise exception 'worker RPC execute grantee set drifted';
  end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_schema_privilege(v_role, 'careslink_v1_generation', 'USAGE')
      or has_schema_privilege(v_role, 'careslink_v1_generation', 'CREATE')
    then
      raise exception 'API role can access worker private schema: %', v_role;
    end if;
  end loop;

  if not has_schema_privilege(
      'careslink_v1_generation_executor',
      'careslink_v1_generation',
      'USAGE'
    )
    or has_schema_privilege(
      'careslink_v1_generation_executor',
      'careslink_v1_generation',
      'CREATE'
    )
  then
    raise exception 'worker executor schema privilege drifted';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    where procedure.pronamespace = 'public'::regnamespace
      and procedure.proname = any(v_rpc_names)
  ) then
    raise exception 'worker RPC public wrapper unexpectedly exists';
  end if;
end
$$;

-- Exact identity argument names and types are checked in the catalog rather
-- than inferred from source formatting. No RPC accepts owner, caller time,
-- lease duration, retry budget, model price, retention or Points parameters.
do $$
declare
  v_expected jsonb := jsonb_build_object(
    'authorize_v1_shadow_note_generation_payload_attempt',
      'p_job_id uuid, p_payload_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text',
    'claim_v1_shadow_note_generation_job',
      'p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text, p_worker_identity_hash text, p_contract_version text, p_schema_version text',
    'commit_v1_shadow_note_generation_success',
      'p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text, p_fence_id uuid, p_fence_digest text, p_canonical_content jsonb, p_canonical_content_hash text, p_provider_evidence jsonb',
    'consume_v1_shadow_note_generation_payload_grant',
      'p_job_id uuid, p_payload_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_grant_id uuid',
    'fence_v1_shadow_note_generation_attempt',
      'p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text',
    'heartbeat_v1_shadow_note_generation_attempt',
      'p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text',
    'recover_v1_shadow_note_generation_expired',
      'p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text, p_worker_identity_hash text, p_contract_version text, p_schema_version text',
    'resolve_v1_shadow_note_generation_attempt',
      'p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_expected_content_hash text, p_expected_provider_evidence_hash text',
    'settle_v1_shadow_note_generation_failure',
      'p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text, p_reason text, p_provider_evidence jsonb'
  );
  v_entry record;
  v_actual text;
begin
  for v_entry in select * from jsonb_each_text(v_expected)
  loop
    select pg_get_function_identity_arguments(procedure.oid)
    into v_actual
    from pg_proc as procedure
    where procedure.pronamespace = 'careslink_v1_generation'::regnamespace
      and procedure.proname = v_entry.key;

    if v_actual is distinct from v_entry.value then
      raise exception 'worker RPC signature drifted: % => %',
        v_entry.key, v_actual;
    end if;
  end loop;
end
$$;

-- The remaining blocks install only transaction-local TEST_ONLY catalogs and
-- fixtures, exercise all nine RPC states and restore role/RLS scaffolding.
-- No migration, route, runtime grant, model, vault, Points or Production
-- capability is enabled by this file.

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

create temporary table rpc_assertion_policy_values (
  note_type text primary key,
  service_code text not null,
  provider_digest text not null
) on commit drop;

create temporary table rpc_assertion_state (
  scenario text primary key,
  job_id uuid not null,
  payload_id uuid not null,
  attempt_id uuid not null,
  lease_token text not null,
  grant_id uuid,
  fence_id uuid,
  fence_digest text
) on commit drop;

create temporary table rpc_assertion_artifacts (
  scenario text primary key,
  canonical_content jsonb not null,
  canonical_content_hash text not null,
  provider_evidence jsonb not null,
  provider_evidence_hash text not null
) on commit drop;

create temporary table rpc_assertion_acknowledgements (
  scenario text primary key,
  acknowledgement jsonb not null
) on commit drop;

grant select on rpc_assertion_policy_values
  to careslink_v1_generation_owner, careslink_v1_generation_executor;
grant select, insert, update on rpc_assertion_state
  to careslink_v1_generation_executor;
grant select, insert, update on rpc_assertion_artifacts
  to careslink_v1_generation_executor;
grant select, insert on rpc_assertion_acknowledgements
  to careslink_v1_generation_executor;

create temporary table rpc_assertion_point_snapshot (
  object_name text primary key,
  row_count bigint not null
) on commit drop;

insert into rpc_assertion_point_snapshot (object_name, row_count) values
  ('point_wallets', (select count(*) from public.point_wallets)),
  ('point_lots', (select count(*) from public.point_lots)),
  ('point_reservations', (select count(*) from public.point_reservations)),
  (
    'point_reservation_allocations',
    (select count(*) from public.point_reservation_allocations)
  ),
  ('point_ledger_entries', (select count(*) from public.point_ledger_entries));

select set_config(
  'careslink.assert.facts_hash',
  public.v1_shadow_content_sha256(
    '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"}'::jsonb
  ),
  true
);

select set_config(
  'careslink.assert.worker_identity_hash',
  encode(
    extensions.digest(convert_to('test-only-worker-identity', 'UTF8'), 'sha256'),
    'hex'
  ),
  true
);

-- Precompute the fixed assertion-only lease digest while still running as the
-- bootstrap actor. The restricted owner intentionally has no extensions
-- schema privilege and receives only this irreversible, transaction-local
-- fixture value.
select set_config(
  'careslink.assert.expired_lease_hash',
  encode(
    extensions.digest(convert_to('test-only-expired-lease', 'UTF8'), 'sha256'),
    'hex'
  ),
  true
);

select set_config(
  'careslink.assert.worker_policy_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-worker-policy',
      'version', 'worker.test.v1',
      'status', 'APPROVED',
      'maxQueueAgeMs', 600000,
      'minimumPayloadRemainingAtClaimMs', 60000,
      'leaseDurationMs', 10000,
      'heartbeatIntervalMs', 2000,
      'heartbeatSafetyMarginMs', 1000,
      'attemptDeadlineMs', 30000,
      'providerDeadlineMs', 20000,
      'commitSafetyMarginMs', 5000,
      'maxAttempts', 2,
      'retryDelayMsAfterAttempt', jsonb_build_array(1000),
      'retryableOutcomes', jsonb_build_array(
        'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT'
      ),
      'recoveryBatchLimit', 10,
      'jitter', jsonb_build_object('mode', 'NONE')
    )
  ),
  true
);

select set_config(
  'careslink.assert.payload_policy_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'policyVersion', 'payload.test.v1',
      'encryptionProfileVersion', 'encryption.test.v1',
      'backupDispositionVersion', 'backup.test.v1'
    )
  ),
  true
);

insert into rpc_assertion_policy_values (
  note_type,
  service_code,
  provider_digest
)
select
  policy.note_type,
  policy.service_code,
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'noteType', policy.note_type,
      'serviceCode', policy.service_code,
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'rateCatalogVersion', '2026-08-09.v1-shadow',
      'providerId', 'provider.test',
      'modelId', 'model.test',
      'modelRevision', null,
      'modelRevisionAvailability', 'PROVIDER_NOT_EXPOSED',
      'policyVersion', 'provider.test.v1',
      'promptTemplateVersion', 'prompt.test.v1',
      'goldenSetVersion', 'golden.test.v1',
      'parserVersion', 'parser.test.v1',
      'timeoutMs', 20000
    )
  )
from (values
  ('communication', 'note.communication.generate'),
  ('handover', 'note.handover.generate'),
  ('progress', 'note.progress.generate'),
  ('ndis', 'note.ndis.generate'),
  ('incident_factual', 'note.incident_factual.generate')
) as policy(note_type, service_code);

select set_config(
  'careslink.assert.registration_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-registered-worker',
      'registrationVersion', 'registration.test.v1',
      'status', 'APPROVED',
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'workerIdentityVersion', 'worker-identity.test.v1',
      'workerIdentityHash',
        current_setting('careslink.assert.worker_identity_hash'),
      'workerPolicyVersion', 'worker.test.v1',
      'workerPolicyDigest',
        current_setting('careslink.assert.worker_policy_digest'),
      'payloadPolicyVersion', 'payload.test.v1',
      'payloadPolicySnapshotHash',
        current_setting('careslink.assert.payload_policy_digest'),
      'providerPolicies', (
        select jsonb_agg(
          jsonb_build_object(
            'noteType', policy.note_type,
            'policyVersion', 'provider.test.v1',
            'policyDigest', policy.provider_digest
          )
          order by case policy.note_type
            when 'communication' then 1
            when 'handover' then 2
            when 'progress' then 3
            when 'ndis' then 4
            when 'incident_factual' then 5
          end
        )
        from rpc_assertion_policy_values as policy
      )
    )
  ),
  true
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'worker-rpc-owner-a@example.invalid',
    'test-only-no-login',
    date_trunc('milliseconds', transaction_timestamp()),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb,
    date_trunc('milliseconds', transaction_timestamp()),
    transaction_timestamp()
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'worker-rpc-owner-b@example.invalid',
    'test-only-no-login',
    date_trunc('milliseconds', transaction_timestamp()),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb,
    transaction_timestamp(),
    transaction_timestamp()
  );

insert into auth.sessions (
  id,
  user_id,
  created_at,
  updated_at,
  not_after
) values
  (
    'b1000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    transaction_timestamp(),
    transaction_timestamp(),
    null
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    transaction_timestamp(),
    transaction_timestamp(),
    null
  ),
  (
    'b1000000-0000-4000-8000-000000000099',
    'b0000000-0000-4000-8000-000000000001',
    transaction_timestamp(),
    transaction_timestamp(),
    transaction_timestamp() - interval '1 millisecond'
  );

insert into public.privacy_reviews (
  id,
  owner_user_id,
  note_type,
  cleaned_facts_hash,
  schema_version,
  status,
  finding_decisions,
  confirmed_at,
  expires_at,
  contract_version,
  scanner_policy_version,
  review_revision,
  mutation_id,
  request_fingerprint,
  deidentification_confirmed,
  authority_to_process_confirmed,
  shadow_only
) values
  (
    'b2000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'communication',
    current_setting('careslink.assert.facts_hash'),
    '2026-08-09.v1-shadow',
    'CONFIRMED',
    '[]'::jsonb,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
    '1.0.0-shadow.1',
    '2026-08-11.preview.1',
    1,
    'privacy.worker.rpc.owner-a.0001',
    repeat('9', 64),
    true,
    true,
    true
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'communication',
    current_setting('careslink.assert.facts_hash'),
    '2026-08-09.v1-shadow',
    'CONFIRMED',
    '[]'::jsonb,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
    '1.0.0-shadow.1',
    '2026-08-11.preview.1',
    1,
    'privacy.worker.rpc.owner-b.0001',
    repeat('8', 64),
    true,
    true,
    true
  );

set local role careslink_v1_generation_owner;

-- The capability constraint and catalog rows are relaxed/inserted only inside
-- this rollback transaction. No duration or provider value becomes a default.
alter table careslink_v1_generation.settings
  drop constraint settings_enabled_check;
update careslink_v1_generation.settings
set enabled = true,
    updated_at = date_trunc('milliseconds', transaction_timestamp())
where capability = 'note_generation_v1';

-- CHECK constraints must reject NULL three-valued-logic bypass and any
-- retry-base plus bounded-jitter sum beyond JavaScript's safe integer range.
do $$
declare
  v_null_jitter_rejected boolean := false;
  v_overflow_rejected boolean := false;
  v_limit_rejected boolean := false;
  v_array_shape_rejected boolean := false;
begin
  begin
    insert into careslink_v1_generation.worker_policies (
      version,
      status,
      max_queue_age_ms,
      minimum_payload_remaining_at_claim_ms,
      lease_duration_ms,
      heartbeat_interval_ms,
      heartbeat_safety_margin_ms,
      attempt_deadline_ms,
      provider_deadline_ms,
      commit_safety_margin_ms,
      max_attempts,
      retry_delay_ms_after_attempt,
      retryable_outcomes,
      recovery_batch_limit,
      jitter_mode,
      jitter_max_ms,
      policy_digest,
      shadow_only
    ) values (
      'worker.invalid-null-jitter.test',
      'APPROVED',
      600000,
      60000,
      10000,
      2000,
      1000,
      30000,
      20000,
      5000,
      2,
      array[1000]::bigint[],
      array['LEASE_EXPIRED']::text[],
      10,
      'APPROVED_BOUNDED',
      null,
      repeat('0', 64),
      true
    );
  exception when check_violation then
    v_null_jitter_rejected := true;
  end;
  if not v_null_jitter_rejected then
    raise exception 'APPROVED_BOUNDED NULL jitter_max_ms was accepted';
  end if;

  begin
    insert into careslink_v1_generation.worker_policies (
      version,
      status,
      max_queue_age_ms,
      minimum_payload_remaining_at_claim_ms,
      lease_duration_ms,
      heartbeat_interval_ms,
      heartbeat_safety_margin_ms,
      attempt_deadline_ms,
      provider_deadline_ms,
      commit_safety_margin_ms,
      max_attempts,
      retry_delay_ms_after_attempt,
      retryable_outcomes,
      recovery_batch_limit,
      jitter_mode,
      jitter_max_ms,
      policy_digest,
      shadow_only
    ) values (
      'worker.invalid-jitter-overflow.test',
      'APPROVED',
      600000,
      60000,
      10000,
      2000,
      1000,
      30000,
      20000,
      5000,
      2,
      array[9007199254740990]::bigint[],
      array['LEASE_EXPIRED']::text[],
      10,
      'APPROVED_BOUNDED',
      2,
      repeat('f', 64),
      true
    );
  exception when check_violation then
    v_overflow_rejected := true;
  end;
  if not v_overflow_rejected then
    raise exception 'retry base plus bounded jitter exceeded safe integer';
  end if;

  begin
    insert into careslink_v1_generation.worker_policies (
      version,
      status,
      max_queue_age_ms,
      minimum_payload_remaining_at_claim_ms,
      lease_duration_ms,
      heartbeat_interval_ms,
      heartbeat_safety_margin_ms,
      attempt_deadline_ms,
      provider_deadline_ms,
      commit_safety_margin_ms,
      max_attempts,
      retry_delay_ms_after_attempt,
      retryable_outcomes,
      recovery_batch_limit,
      jitter_mode,
      jitter_max_ms,
      policy_digest,
      shadow_only
    ) values (
      'worker.invalid-recovery-limit.test',
      'APPROVED',
      600000,
      60000,
      10000,
      2000,
      1000,
      30000,
      20000,
      5000,
      2,
      array[1000]::bigint[],
      array['LEASE_EXPIRED']::text[],
      1000001,
      'NONE',
      null,
      repeat('e', 64),
      true
    );
  exception when check_violation then
    v_limit_rejected := true;
  end;
  if not v_limit_rejected then
    raise exception 'recovery batch limit above 1000000 was accepted';
  end if;

  begin
    insert into careslink_v1_generation.worker_policies (
      version,
      status,
      max_queue_age_ms,
      minimum_payload_remaining_at_claim_ms,
      lease_duration_ms,
      heartbeat_interval_ms,
      heartbeat_safety_margin_ms,
      attempt_deadline_ms,
      provider_deadline_ms,
      commit_safety_margin_ms,
      max_attempts,
      retry_delay_ms_after_attempt,
      retryable_outcomes,
      recovery_batch_limit,
      jitter_mode,
      jitter_max_ms,
      policy_digest,
      shadow_only
    ) values (
      'worker.invalid-array-lower-bound.test',
      'APPROVED',
      600000,
      60000,
      10000,
      2000,
      1000,
      30000,
      20000,
      5000,
      2,
      '[0:0]={1000}'::bigint[],
      '[0:0]={LEASE_EXPIRED}'::text[],
      10,
      'NONE',
      null,
      repeat('d', 64),
      true
    );
  exception when check_violation then
    v_array_shape_rejected := true;
  end;
  if not v_array_shape_rejected then
    raise exception 'zero-lower-bound retry arrays were accepted';
  end if;
end
$$;

insert into careslink_v1_generation.worker_policies (
  version,
  status,
  max_queue_age_ms,
  minimum_payload_remaining_at_claim_ms,
  lease_duration_ms,
  heartbeat_interval_ms,
  heartbeat_safety_margin_ms,
  attempt_deadline_ms,
  provider_deadline_ms,
  commit_safety_margin_ms,
  max_attempts,
  retry_delay_ms_after_attempt,
  retryable_outcomes,
  recovery_batch_limit,
  jitter_mode,
  jitter_max_ms,
  policy_digest,
  shadow_only
) values (
  'worker.test.v1',
  'APPROVED',
  600000,
  60000,
  10000,
  2000,
  1000,
  30000,
  20000,
  5000,
  2,
  array[1000]::bigint[],
  array['LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT']::text[],
  10,
  'NONE',
  null,
  current_setting('careslink.assert.worker_policy_digest'),
  true
);

insert into careslink_v1_generation.provider_policies (
  note_type,
  policy_version,
  status,
  service_code,
  contract_version,
  schema_version,
  rate_catalog_version,
  provider_id,
  model_id,
  model_revision,
  model_revision_availability,
  prompt_template_version,
  golden_set_version,
  parser_version,
  timeout_ms,
  policy_digest,
  shadow_only
)
select
  policy.note_type,
  'provider.test.v1',
  'APPROVED',
  policy.service_code,
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  '2026-08-09.v1-shadow',
  'provider.test',
  'model.test',
  null,
  'PROVIDER_NOT_EXPOSED',
  'prompt.test.v1',
  'golden.test.v1',
  'parser.test.v1',
  20000,
  policy.provider_digest,
  true
from rpc_assertion_policy_values as policy;

insert into careslink_v1_generation.payload_policies (
  policy_version,
  status,
  encryption_profile_version,
  backup_disposition_version,
  policy_digest,
  shadow_only
) values (
  'payload.test.v1',
  'APPROVED',
  'encryption.test.v1',
  'backup.test.v1',
  current_setting('careslink.assert.payload_policy_digest'),
  true
);

insert into careslink_v1_generation.worker_registrations (
  registration_digest,
  registration_version,
  status,
  contract_version,
  schema_version,
  worker_identity_version,
  worker_identity_hash,
  worker_policy_version,
  worker_policy_digest,
  payload_policy_version,
  payload_policy_snapshot_hash,
  shadow_only
) values (
  current_setting('careslink.assert.registration_digest'),
  'registration.test.v1',
  'APPROVED',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'worker-identity.test.v1',
  current_setting('careslink.assert.worker_identity_hash'),
  'worker.test.v1',
  current_setting('careslink.assert.worker_policy_digest'),
  'payload.test.v1',
  current_setting('careslink.assert.payload_policy_digest'),
  true
);

insert into careslink_v1_generation.worker_registration_provider_policies (
  registration_digest,
  note_type,
  policy_version,
  policy_digest,
  shadow_only
)
select
  current_setting('careslink.assert.registration_digest'),
  policy.note_type,
  'provider.test.v1',
  policy.provider_digest,
  true
from rpc_assertion_policy_values as policy;

insert into careslink_v1_generation.jobs (
  id,
  owner_user_id,
  initiating_session_id,
  admission_transport,
  payload_id,
  note_type,
  source_locale,
  service_code,
  rate_catalog_version,
  contract_version,
  schema_version,
  privacy_review_id,
  privacy_scanner_policy_version,
  privacy_review_revision,
  cleaned_facts_hash,
  idempotency_hash,
  request_hash,
  worker_policy_version,
  worker_policy_digest,
  provider_policy_version,
  provider_policy_digest,
  payload_policy_version,
  payload_policy_snapshot_hash,
  status,
  attempt_count,
  created_at,
  updated_at,
  started_at,
  shadow_only
)
select
  fixture.job_id,
  'b0000000-0000-4000-8000-000000000001'::uuid,
  fixture.session_id,
  'BEARER',
  fixture.payload_id,
  'communication',
  'en',
  'note.communication.generate',
  '2026-08-09.v1-shadow',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'b2000000-0000-4000-8000-000000000001'::uuid,
  '2026-08-11.preview.1',
  1,
  current_setting('careslink.assert.facts_hash'),
  repeat(fixture.idempotency_digit, 64),
  repeat(fixture.request_digit, 64),
  'worker.test.v1',
  current_setting('careslink.assert.worker_policy_digest'),
  'provider.test.v1',
  policy.provider_digest,
  'payload.test.v1',
  current_setting('careslink.assert.payload_policy_digest'),
  fixture.status,
  fixture.attempt_count,
  fixture.created_at,
  fixture.updated_at,
  fixture.started_at,
  true
from (values
  (
    'b3000000-0000-4000-8000-000000000001'::uuid,
    'b5000000-0000-4000-8000-000000000001'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid,
    '1', 'a', 'QUEUED', 0,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()),
    null::timestamptz
  ),
  (
    'b3000000-0000-4000-8000-000000000002'::uuid,
    'b5000000-0000-4000-8000-000000000002'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid,
    '2', 'b', 'QUEUED', 0,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()),
    null::timestamptz
  ),
  (
    'b3000000-0000-4000-8000-000000000003'::uuid,
    'b5000000-0000-4000-8000-000000000003'::uuid,
    'b1000000-0000-4000-8000-000000000099'::uuid,
    '3', 'c', 'QUEUED', 0,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()),
    null::timestamptz
  ),
  (
    'b3000000-0000-4000-8000-000000000004'::uuid,
    'b5000000-0000-4000-8000-000000000004'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid,
    '4', 'd', 'QUEUED', 0,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()),
    null::timestamptz
  ),
  (
    'b3000000-0000-4000-8000-000000000005'::uuid,
    'b5000000-0000-4000-8000-000000000005'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid,
    '5', 'e', 'QUEUED', 0,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()),
    null::timestamptz
  ),
  (
    'b3000000-0000-4000-8000-000000000006'::uuid,
    'b5000000-0000-4000-8000-000000000006'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid,
    '6', 'f', 'RUNNING', 1,
    date_trunc('milliseconds', transaction_timestamp()) - interval '20 seconds',
    date_trunc('milliseconds', transaction_timestamp()) - interval '15 seconds',
    date_trunc('milliseconds', transaction_timestamp()) - interval '15 seconds'
  ),
  (
    'b3000000-0000-4000-8000-000000000007'::uuid,
    'b5000000-0000-4000-8000-000000000007'::uuid,
    'b1000000-0000-4000-8000-000000000001'::uuid,
    '7', '7', 'QUEUED', 0,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()),
    null::timestamptz
  )
) as fixture(
  job_id,
  payload_id,
  session_id,
  idempotency_digit,
  request_digit,
  status,
  attempt_count,
  created_at,
  updated_at,
  started_at
)
cross join lateral (
  select provider_digest
  from rpc_assertion_policy_values
  where note_type = 'communication'
) as policy;

insert into careslink_v1_generation.payloads (
  id,
  job_id,
  owner_user_id,
  note_type,
  source_locale,
  contract_version,
  schema_version,
  privacy_review_id,
  privacy_proof_expires_at,
  cleaned_facts_hash,
  request_hash,
  policy_version,
  encryption_profile_version,
  backup_disposition_version,
  policy_snapshot_hash,
  payload_handle_hash,
  state,
  expires_at,
  available_at,
  purge_attempt_count,
  created_at,
  updated_at,
  shadow_only
)
select
  fixture.payload_id,
  fixture.job_id,
  'b0000000-0000-4000-8000-000000000001'::uuid,
  'communication',
  'en',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'b2000000-0000-4000-8000-000000000001'::uuid,
  date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
  current_setting('careslink.assert.facts_hash'),
  repeat(fixture.request_digit, 64),
  'payload.test.v1',
  'encryption.test.v1',
  'backup.test.v1',
  current_setting('careslink.assert.payload_policy_digest'),
  repeat(fixture.handle_digit, 64),
  'AVAILABLE',
  date_trunc('milliseconds', transaction_timestamp()) + interval '10 minutes',
  fixture.created_at,
  0,
  fixture.created_at,
  fixture.created_at,
  true
from (values
  (
    'b5000000-0000-4000-8000-000000000001'::uuid,
    'b3000000-0000-4000-8000-000000000001'::uuid,
    'a', '1',
    date_trunc('milliseconds', transaction_timestamp())
  ),
  (
    'b5000000-0000-4000-8000-000000000002'::uuid,
    'b3000000-0000-4000-8000-000000000002'::uuid,
    'b', '2',
    date_trunc('milliseconds', transaction_timestamp())
  ),
  (
    'b5000000-0000-4000-8000-000000000003'::uuid,
    'b3000000-0000-4000-8000-000000000003'::uuid,
    'c', '3',
    date_trunc('milliseconds', transaction_timestamp())
  ),
  (
    'b5000000-0000-4000-8000-000000000004'::uuid,
    'b3000000-0000-4000-8000-000000000004'::uuid,
    'd', '4',
    date_trunc('milliseconds', transaction_timestamp())
  ),
  (
    'b5000000-0000-4000-8000-000000000005'::uuid,
    'b3000000-0000-4000-8000-000000000005'::uuid,
    'e', '5',
    date_trunc('milliseconds', transaction_timestamp())
  ),
  (
    'b5000000-0000-4000-8000-000000000006'::uuid,
    'b3000000-0000-4000-8000-000000000006'::uuid,
    'f', '6',
    date_trunc('milliseconds', transaction_timestamp()) - interval '20 seconds'
  ),
  (
    'b5000000-0000-4000-8000-000000000007'::uuid,
    'b3000000-0000-4000-8000-000000000007'::uuid,
    '7', '7',
    date_trunc('milliseconds', transaction_timestamp())
  )
) as fixture(
  payload_id,
  job_id,
  request_digit,
  handle_digit,
  created_at
);

insert into careslink_v1_generation.attempts (
  id,
  job_id,
  owner_user_id,
  attempt_number,
  status,
  worker_identity_hash,
  registration_digest,
  lease_token_hash,
  acquired_at,
  last_heartbeat_at,
  lease_expires_at,
  created_at,
  shadow_only
) values (
  'b6000000-0000-4000-8000-000000000006',
  'b3000000-0000-4000-8000-000000000006',
  'b0000000-0000-4000-8000-000000000001',
  1,
  'RUNNING',
  current_setting('careslink.assert.worker_identity_hash'),
  current_setting('careslink.assert.registration_digest'),
  current_setting('careslink.assert.expired_lease_hash'),
  date_trunc('milliseconds', transaction_timestamp()) - interval '15 seconds',
  date_trunc('milliseconds', transaction_timestamp()) - interval '15 seconds',
  date_trunc('milliseconds', transaction_timestamp()) - interval '5 seconds',
  date_trunc('milliseconds', transaction_timestamp()) - interval '15 seconds',
  true
);

-- Both sides of the deferred jobs/payloads identity cycle now exist. Validate
-- the real foreign keys and drain their pending trigger events before any
-- assertion-only FORCE RLS restoration performs ALTER TABLE.
set constraints all immediate;

alter table careslink_v1_generation.settings force row level security;
alter table careslink_v1_generation.jobs force row level security;
alter table careslink_v1_generation.attempts force row level security;
alter table careslink_v1_generation.worker_policies force row level security;
alter table careslink_v1_generation.provider_policies force row level security;
alter table careslink_v1_generation.payload_policies force row level security;
alter table careslink_v1_generation.worker_registrations
  force row level security;
alter table careslink_v1_generation.worker_registration_provider_policies
  force row level security;
alter table careslink_v1_generation.payloads force row level security;
alter table careslink_v1_generation.payload_grants force row level security;
alter table careslink_v1_generation.provider_evidence force row level security;
alter table careslink_v1_generation.payload_purge_outbox
  force row level security;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_executor;

-- Serial arbitration proves that repeated claims in one transaction select
-- distinct eligible jobs and preserve the one-RUNNING-attempt invariant. It
-- intentionally does not stand in for the later two-session Preview race.
do $$
declare
  v_first jsonb;
  v_second jsonb;
  v_heartbeat jsonb;
  v_authorized jsonb;
  v_authorized_replay jsonb;
  v_fence jsonb;
  v_fence_replay jsonb;
  v_first_job uuid;
  v_first_payload uuid;
  v_first_attempt uuid;
  v_first_lease text;
  v_second_job uuid;
  v_second_payload uuid;
  v_second_attempt uuid;
  v_second_lease text;
  v_grant_id uuid;
  v_attempt record;
  v_grant record;
begin
  begin
    perform careslink_v1_generation.claim_v1_shadow_note_generation_job(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      null,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
    raise exception 'claim accepted an incomplete worker identity binding';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'POLICY_MISMATCH' then
        raise;
      end if;
  end;

  begin
    perform careslink_v1_generation.recover_v1_shadow_note_generation_expired(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      null,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
    raise exception 'recovery accepted an incomplete worker identity binding';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'POLICY_MISMATCH' then
        raise;
      end if;
  end;

  v_first :=
    careslink_v1_generation.claim_v1_shadow_note_generation_job(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      current_setting('careslink.assert.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  v_second :=
    careslink_v1_generation.claim_v1_shadow_note_generation_job(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      current_setting('careslink.assert.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );

  if v_first->>'status' is distinct from 'CLAIMED'
    or v_second->>'status' is distinct from 'CLAIMED'
    or not (v_first ?& array['status', 'claim'])
    or v_first - array['status', 'claim'] <> '{}'::jsonb
    or not (v_second ?& array['status', 'claim'])
    or v_second - array['status', 'claim'] <> '{}'::jsonb
    or v_first::text like '%observable_facts%'
    or v_first::text like '%payloadHandle%'
    or v_first::text like '%vault%'
  then
    raise exception 'serial claim envelope leaked or drifted';
  end if;

  v_first_job := (v_first #>> '{claim,job,jobId}')::uuid;
  v_first_payload := (v_first #>> '{claim,job,payloadId}')::uuid;
  v_first_attempt := (v_first #>> '{claim,attempt,attemptId}')::uuid;
  v_first_lease := v_first #>> '{claim,leaseToken}';
  v_second_job := (v_second #>> '{claim,job,jobId}')::uuid;
  v_second_payload := (v_second #>> '{claim,job,payloadId}')::uuid;
  v_second_attempt := (v_second #>> '{claim,attempt,attemptId}')::uuid;
  v_second_lease := v_second #>> '{claim,leaseToken}';

  if v_first_job is distinct from
      'b3000000-0000-4000-8000-000000000001'::uuid
    or v_second_job is distinct from
      'b3000000-0000-4000-8000-000000000002'::uuid
    or v_first_job = v_second_job
    or v_first_attempt = v_second_attempt
    or coalesce(v_first_lease, '') = ''
    or coalesce(v_second_lease, '') = ''
    or exists (
      select 1
      from careslink_v1_generation.attempts
      where status = 'RUNNING'
      group by job_id
      having count(*) > 1
    )
  then
    raise exception 'serial claim arbitration or active-attempt invariant failed';
  end if;

  insert into rpc_assertion_state (
    scenario, job_id, payload_id, attempt_id, lease_token
  ) values
    (
      'success', v_first_job, v_first_payload, v_first_attempt, v_first_lease
    ),
    (
      'failure', v_second_job, v_second_payload, v_second_attempt,
      v_second_lease
    );

  v_heartbeat :=
    careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
      v_first_job,
      v_first_attempt,
      v_first_lease,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest')
    );
  if v_heartbeat->>'status' is distinct from 'RENEWED'
    or not (v_heartbeat ?& array[
      'status', 'jobReferenceHash', 'attemptReferenceHash',
      'registrationDigest'
    ])
    or v_heartbeat - array[
      'status', 'jobReferenceHash', 'attemptReferenceHash',
      'registrationDigest'
    ] <> '{}'::jsonb
  then
    raise exception 'heartbeat envelope drifted';
  end if;

  v_authorized :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_first_job,
      v_first_payload,
      v_first_attempt,
      v_first_lease,
      current_setting('careslink.assert.registration_digest')
    );
  v_authorized_replay :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_first_job,
      v_first_payload,
      v_first_attempt,
      v_first_lease,
      current_setting('careslink.assert.registration_digest')
    );
  if v_authorized->>'status' is distinct from 'AUTHORIZED'
    or v_authorized_replay is distinct from v_authorized
    or not (v_authorized ?& array[
      'status', 'grantId', 'expiresAt', 'jobReferenceHash',
      'attemptReferenceHash', 'payloadReferenceHash', 'registrationDigest'
    ])
    or v_authorized - array[
      'status', 'grantId', 'expiresAt', 'jobReferenceHash',
      'attemptReferenceHash', 'payloadReferenceHash', 'registrationDigest'
    ] <> '{}'::jsonb
    or v_authorized::text ~* 'vault|locator|rawFacts|cleanedFacts'
  then
    raise exception 'metadata-only authorization or replay drifted';
  end if;

  v_grant_id := (v_authorized->>'grantId')::uuid;
  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_first_attempt;
  select grant_record.* into v_grant
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.id = v_grant_id;

  -- This freezes the approved absolute-deadline rule: the 10-second lease is
  -- shorter than the 20-second provider deadline, but authorization remains
  -- valid through the 30-second attempt deadline. Consume still rechecks the
  -- active lease independently.
  if v_attempt.lease_expires_at is distinct from
      v_attempt.acquired_at + interval '10 seconds'
    or v_grant.expires_at is distinct from
      v_attempt.acquired_at + interval '30 seconds'
    or v_grant.expires_at <= v_attempt.lease_expires_at
    or v_grant.status is distinct from 'ISSUED'
  then
    raise exception 'authorization absolute-deadline binding drifted';
  end if;

  -- TEST_ONLY fixture bridge. No migration RPC creates a vault secret or can
  -- consume successfully while vault/KMS/retention remain undecided. This
  -- rollback-only metadata update solely lets the canonical commit invariant
  -- be exercised; it is not a vault or consume end-to-end test.
  update careslink_v1_generation.payload_grants as grant_record
  set status = 'CONSUMED',
      consumed_at = date_trunc('milliseconds', transaction_timestamp()),
      vault_grant_hash = repeat('7', 64)
  where grant_record.id = v_grant_id
    and grant_record.payload_id = v_first_payload
    and grant_record.job_id = v_first_job
    and grant_record.attempt_id = v_first_attempt
    and grant_record.registration_digest =
      current_setting('careslink.assert.registration_digest')
    and grant_record.lease_token_hash =
      encode(
        extensions.digest(convert_to(v_first_lease, 'UTF8'), 'sha256'),
        'hex'
      )
    and grant_record.request_hash = repeat('a', 64)
    and grant_record.status = 'ISSUED';
  if not found then
    raise exception 'TEST_ONLY consumed grant binding failed';
  end if;

  v_fence := careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    v_first_job,
    v_first_attempt,
    v_first_lease,
    current_setting('careslink.assert.registration_digest'),
    'worker.test.v1',
    current_setting('careslink.assert.worker_policy_digest')
  );
  v_fence_replay :=
    careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
      v_first_job,
      v_first_attempt,
      v_first_lease,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest')
    );
  if v_fence->>'status' is distinct from 'FENCED'
    or v_fence_replay is distinct from v_fence
    or not (v_fence ?& array[
      'status', 'fenceId', 'fenceDigest', 'expiresAt',
      'jobReferenceHash', 'attemptReferenceHash', 'registrationDigest'
    ])
    or v_fence - array[
      'status', 'fenceId', 'fenceDigest', 'expiresAt',
      'jobReferenceHash', 'attemptReferenceHash', 'registrationDigest'
    ] <> '{}'::jsonb
  then
    raise exception 'fence or fence replay drifted';
  end if;

  update rpc_assertion_state
  set grant_id = v_grant_id,
      fence_id = (v_fence->>'fenceId')::uuid,
      fence_digest = v_fence->>'fenceDigest'
  where scenario = 'success';
end
$$;

-- NULL lease-token matrix begins. Every token-bearing RPC must reject NULL
-- before any heartbeat, fence, terminal transition, grant or canonical write.
-- Each call runs in its own PL/pgSQL subtransaction so a vulnerable function
-- that mutates and returns is rolled back before this assertion reports it.
do $$
declare
  v_state rpc_assertion_state%rowtype;
  v_job_before jsonb;
  v_attempt_before jsonb;
  v_payload_before jsonb;
  v_grant_before jsonb;
  v_job_after jsonb;
  v_attempt_after jsonb;
  v_payload_after jsonb;
  v_grant_after jsonb;
  v_evidence_count bigint;
  v_purge_count bigint;
  v_document_count bigint;
  v_revision_count bigint;
  v_sync_count bigint;
  v_receipt_count bigint;
  v_rejections integer := 0;
begin
  select state.* into v_state
  from rpc_assertion_state as state
  where state.scenario = 'success';
  perform careslink_v1_generation._set_owner(
    'b0000000-0000-4000-8000-000000000001'::uuid
  );

  select to_jsonb(job.*) into v_job_before
  from careslink_v1_generation.jobs as job
  where job.id = v_state.job_id;
  select to_jsonb(attempt.*) into v_attempt_before
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_state.attempt_id;
  select to_jsonb(payload.*) into v_payload_before
  from careslink_v1_generation.payloads as payload
  where payload.id = v_state.payload_id;
  select to_jsonb(grant_record.*) into v_grant_before
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.id = v_state.grant_id;
  select count(*) into v_evidence_count
  from careslink_v1_generation.provider_evidence;
  select count(*) into v_purge_count
  from careslink_v1_generation.payload_purge_outbox;
  select count(*) into v_document_count from public.ai_documents;
  select count(*) into v_revision_count from public.ai_document_revisions;
  select count(*) into v_sync_count from public.ai_document_sync_changes;
  select count(*) into v_receipt_count
  from public.ai_document_mutation_receipts;

  begin
    perform careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
      v_state.job_id,
      v_state.attempt_id,
      null,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest')
    );
    raise exception using errcode = 'P0001', message = 'NULL_TOKEN_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'LEASE_EXPIRED' then
      v_rejections := v_rejections + 1;
    else
      raise exception 'heartbeat NULL lease token did not fail closed: %',
        sqlerrm;
    end if;
  end;

  begin
    perform careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
      v_state.job_id,
      v_state.attempt_id,
      null,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest')
    );
    raise exception using errcode = 'P0001', message = 'NULL_TOKEN_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'LEASE_EXPIRED' then
      v_rejections := v_rejections + 1;
    else
      raise exception 'fence NULL lease token did not fail closed: %', sqlerrm;
    end if;
  end;

  begin
    perform careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_state.job_id,
      v_state.attempt_id,
      null,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      v_state.fence_id,
      v_state.fence_digest,
      '{}'::jsonb,
      repeat('0', 64),
      '{}'::jsonb
    );
    raise exception using errcode = 'P0001', message = 'NULL_TOKEN_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POLICY_MISMATCH' then
      v_rejections := v_rejections + 1;
    else
      raise exception 'commit NULL lease token did not fail closed: %', sqlerrm;
    end if;
  end;

  begin
    perform careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_state.job_id,
      v_state.attempt_id,
      null,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_PERMANENT',
      null
    );
    raise exception using errcode = 'P0001', message = 'NULL_TOKEN_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POLICY_MISMATCH' then
      v_rejections := v_rejections + 1;
    else
      raise exception 'settle NULL lease token did not fail closed: %', sqlerrm;
    end if;
  end;

  begin
    perform careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_state.job_id,
      v_state.attempt_id,
      null,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
    raise exception using errcode = 'P0001', message = 'NULL_TOKEN_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POLICY_MISMATCH' then
      v_rejections := v_rejections + 1;
    else
      raise exception 'resolve NULL lease token did not fail closed: %', sqlerrm;
    end if;
  end;

  begin
    perform
      careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
        v_state.job_id,
        v_state.payload_id,
        v_state.attempt_id,
        null,
        current_setting('careslink.assert.registration_digest')
      );
    raise exception using errcode = 'P0001', message = 'NULL_TOKEN_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PAYLOAD_UNAVAILABLE' then
      v_rejections := v_rejections + 1;
    else
      raise exception 'authorize NULL lease token did not fail closed: %',
        sqlerrm;
    end if;
  end;

  begin
    perform
      careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
        v_state.job_id,
        v_state.payload_id,
        v_state.attempt_id,
        null,
        current_setting('careslink.assert.registration_digest'),
        v_state.grant_id
      );
    raise exception using errcode = 'P0001', message = 'NULL_TOKEN_ACCEPTED';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PAYLOAD_UNAVAILABLE' then
      v_rejections := v_rejections + 1;
    else
      raise exception 'consume NULL lease token did not fail closed: %', sqlerrm;
    end if;
  end;

  select to_jsonb(job.*) into v_job_after
  from careslink_v1_generation.jobs as job
  where job.id = v_state.job_id;
  select to_jsonb(attempt.*) into v_attempt_after
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_state.attempt_id;
  select to_jsonb(payload.*) into v_payload_after
  from careslink_v1_generation.payloads as payload
  where payload.id = v_state.payload_id;
  select to_jsonb(grant_record.*) into v_grant_after
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.id = v_state.grant_id;

  if v_rejections <> 7
    or v_job_after is distinct from v_job_before
    or v_attempt_after is distinct from v_attempt_before
    or v_payload_after is distinct from v_payload_before
    or v_grant_after is distinct from v_grant_before
    or (select count(*) from careslink_v1_generation.provider_evidence) <>
      v_evidence_count
    or (select count(*) from careslink_v1_generation.payload_purge_outbox) <>
      v_purge_count
    or (select count(*) from public.ai_documents) <> v_document_count
    or (select count(*) from public.ai_document_revisions) <> v_revision_count
    or (select count(*) from public.ai_document_sync_changes) <> v_sync_count
    or (select count(*) from public.ai_document_mutation_receipts) <>
      v_receipt_count
  then
    raise exception 'NULL lease-token matrix mutated state or row counts';
  end if;
end
$$;
-- NULL lease-token matrix ends.

-- Canonical success is one atomic transaction: revision, sync receipt,
-- mutation receipt, provider-evidence digest, terminal state and purge ACK.
-- Response-loss replay must reconstruct exactly the same metadata envelope.
do $$
declare
  v_state rpc_assertion_state%rowtype;
  v_attempt record;
  v_content jsonb;
  v_candidate jsonb;
  v_evidence jsonb;
  v_content_hash text;
  v_candidate_hash text;
  v_evidence_hash text;
  v_success jsonb;
  v_replay jsonb;
  v_resolved jsonb;
  v_changed_content jsonb;
  v_changed_candidate jsonb;
  v_changed_evidence jsonb;
  v_changed_content_hash text;
  v_changed_candidate_hash text;
  v_rejected boolean := false;
  v_mutation_id text;
  v_job record;
begin
  select state.* into v_state
  from rpc_assertion_state as state
  where state.scenario = 'success';
  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_state.attempt_id;

  v_content := jsonb_build_object(
    'englishDraft', 'TEST_ONLY observable communication draft.',
    'reviewVersions', jsonb_build_object(
      'zh-Hans', '仅供测试的客观沟通记录草稿。',
      'zh-Hant', '僅供測試的客觀溝通記錄草稿。'
    ),
    'factsSummary', jsonb_build_object(
      'occurred_at', '2026-08-11T00:15:30Z',
      'contact_channel', 'phone',
      'parties_by_role', jsonb_build_array('support worker'),
      'observable_facts', 'clean',
      'action_taken', 'documented'
    ),
    'missingFacts', jsonb_build_array(),
    'neutralWordingChecks', jsonb_build_array('Observable facts only'),
    'followUpPrompts', jsonb_build_array(),
    'disclaimer',
      'User-reviewed draft wording based only on the details entered. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice. General documentation support only.'
  );
  v_candidate := jsonb_build_object(
    'englishDraft', v_content->'englishDraft',
    'reviewVersions', v_content->'reviewVersions',
    'missingFacts', v_content->'missingFacts',
    'neutralWordingChecks', v_content->'neutralWordingChecks',
    'followUpPrompts', v_content->'followUpPrompts'
  );
  v_content_hash := public.v1_shadow_content_sha256(v_content);
  v_candidate_hash := public.v1_shadow_content_sha256(v_candidate);
  v_evidence := jsonb_build_object(
    'policyDigest', (
      select provider_digest
      from rpc_assertion_policy_values
      where note_type = 'communication'
    ),
    'providerId', 'provider.test',
    'modelId', 'model.test',
    'modelRevision', null,
    'modelRevisionAvailability', 'PROVIDER_NOT_EXPOSED',
    'policyVersion', 'provider.test.v1',
    'promptTemplateVersion', 'prompt.test.v1',
    'goldenSetVersion', 'golden.test.v1',
    'parserVersion', 'parser.test.v1',
    'serviceCode', 'note.communication.generate',
    'rateCatalogVersion', '2026-08-09.v1-shadow',
    'timeoutMs', 20000,
    'workerPolicyDigest',
      current_setting('careslink.assert.worker_policy_digest'),
    'deadlineAt', careslink_v1_generation._server_time(
      v_attempt.acquired_at + interval '20 seconds'
    ),
    'startedAt',
      careslink_v1_generation._server_time(v_attempt.acquired_at),
    'finishedAt',
      careslink_v1_generation._server_time(v_attempt.acquired_at),
    'durationMs', 0,
    'finishReason', 'COMPLETED',
    'providerRequestIdHash', null,
    'usage', jsonb_build_object(
      'status', 'UNAVAILABLE', 'source', 'UNAVAILABLE'
    ),
    'cost', jsonb_build_object(
      'status', 'UNAVAILABLE', 'source', 'UNAVAILABLE'
    ),
    'candidateDigest', v_candidate_hash
  );
  v_evidence_hash := public.v1_shadow_content_sha256(v_evidence);

  insert into rpc_assertion_artifacts (
    scenario,
    canonical_content,
    canonical_content_hash,
    provider_evidence,
    provider_evidence_hash
  ) values (
    'success',
    v_content,
    v_content_hash,
    v_evidence,
    v_evidence_hash
  );

  v_success :=
    careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      v_state.fence_id,
      v_state.fence_digest,
      v_content,
      v_content_hash,
      v_evidence
    );

  -- The earlier attempt record supplied the provider timing fixture while the
  -- attempt was RUNNING. Refresh the persisted terminal row before binding
  -- its database-owned finished_at to the ACK and later purge simulation.
  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_state.attempt_id
    and attempt.job_id = v_state.job_id
    and attempt.status = 'SUCCEEDED';

  if not (v_success ?& array[
      'transaction', 'canonical', 'syncReceipt', 'mutationReceipt',
      'jobTerminal', 'attemptTerminal', 'payloadMetadata',
      'purgeOutboxAcknowledgment'
    ])
    or v_success - array[
      'transaction', 'canonical', 'syncReceipt', 'mutationReceipt',
      'jobTerminal', 'attemptTerminal', 'payloadMetadata',
      'purgeOutboxAcknowledgment'
    ] <> '{}'::jsonb
    or v_success #>> '{transaction,status}' is distinct from 'COMMITTED'
    or (v_success #>> '{transaction,atomic}')::boolean is not true
    or v_success #>> '{jobTerminal,status}' is distinct from 'SUCCEEDED'
    or v_success #>> '{attemptTerminal,status}' is distinct from 'SUCCEEDED'
    or v_success #>> '{attemptTerminal,contentHash}' is distinct from
      v_content_hash
    or v_success #>> '{attemptTerminal,providerEvidenceHash}' is distinct from
      v_evidence_hash
    or v_success #>> '{payloadMetadata,state}' is distinct from 'REVOKED'
    or v_success #>> '{payloadMetadata,payloadDisposition}' is distinct from
      'REVOKED_PURGE_ENQUEUED'
    or v_success #>> '{purgeOutboxAcknowledgment,status}' is distinct from
      'ENQUEUED'
    or v_success::text ~*
      '"(canonicalContent|providerEvidence|englishDraft|providerId)"[[:space:]]*:|vault|locator'
  then
    raise exception 'atomic success envelope drifted or leaked content';
  end if;

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = v_state.job_id;
  v_mutation_id :=
    'note-generation:' || careslink_v1_generation._sha256_text(
      v_state.job_id::text
    );

  if v_attempt.id is null
    or v_attempt.finished_at is null
    or v_job.status is distinct from 'SUCCEEDED'
    or v_job.finished_at is distinct from v_attempt.finished_at
    or v_success #>> '{transaction,committedAt}' is distinct from
      careslink_v1_generation._server_time(v_attempt.finished_at)
    or v_job.result_content_hash is distinct from v_content_hash
    or v_job.result_revision_id::text is distinct from
      v_success #>> '{canonical,revisionId}'
    or v_job.result_document_id::text is distinct from
      v_success #>> '{canonical,canonicalId}'
    or (
      select count(*)
      from public.ai_documents
      where id = v_job.result_document_id
        and owner_user_id = v_job.owner_user_id
        and current_revision_id = v_job.result_revision_id
        and current_revision_number = 1
    ) <> 1
    or (
      select count(*)
      from public.ai_document_revisions
      where id = v_job.result_revision_id
        and document_id = v_job.result_document_id
        and owner_user_id = v_job.owner_user_id
        and content_hash = v_content_hash
        and mutation_id = v_mutation_id
    ) <> 1
    or (
      select count(*)
      from public.ai_document_sync_changes
      where owner_user_id = v_job.owner_user_id
        and document_id = v_job.result_document_id
        and revision_id = v_job.result_revision_id
        and last_mutation_id = v_mutation_id
    ) <> 1
    or (
      select count(*)
      from public.ai_document_mutation_receipts
      where owner_user_id = v_job.owner_user_id
        and document_id = v_job.result_document_id
        and revision_id = v_job.result_revision_id
        and mutation_id = v_mutation_id
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence
      where attempt_id = v_state.attempt_id
        and evidence_hash = v_evidence_hash
        and evidence = v_evidence
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
      where payload_id = v_state.payload_id
        and job_id = v_state.job_id
        and reason = 'SUCCEEDED'
        and status = 'PENDING'
    ) <> 1
  then
    raise exception 'canonical success rows are not atomically bound';
  end if;

  -- A later purge worker may advance the live payload lifecycle. Both commit
  -- replay and resolve must still return the immutable original REVOKED /
  -- ENQUEUED acknowledgement rather than the current PURGED state.
  update careslink_v1_generation.payloads as payload
  set state = 'PURGED',
      purged_at = v_attempt.finished_at,
      updated_at = v_attempt.finished_at
  where payload.id = v_state.payload_id
    and payload.job_id = v_state.job_id
    and payload.state = 'REVOKED'
    and payload.revoke_reason = 'SUCCEEDED'
    and payload.revoked_at = v_attempt.finished_at
    and payload.purge_requested_at = v_attempt.finished_at;
  if not found then
    raise exception 'success payload purge fixture was not applied';
  end if;

  v_replay :=
    careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      v_state.fence_id,
      v_state.fence_digest,
      v_content,
      v_content_hash,
      v_evidence
    );
  if v_replay is distinct from v_success
    or (select count(*) from public.ai_documents where id = v_job.result_document_id) <> 1
    or (select count(*) from public.ai_document_revisions where id = v_job.result_revision_id) <> 1
    or (select count(*) from public.ai_document_sync_changes where last_mutation_id = v_mutation_id) <> 1
    or (select count(*) from public.ai_document_mutation_receipts where mutation_id = v_mutation_id) <> 1
    or (select count(*) from careslink_v1_generation.provider_evidence where attempt_id = v_state.attempt_id) <> 1
    or (select count(*) from careslink_v1_generation.payload_purge_outbox where payload_id = v_state.payload_id) <> 1
  then
    raise exception 'atomic success replay duplicated or drifted';
  end if;

  v_changed_content := jsonb_set(
    v_content,
    '{englishDraft}',
    to_jsonb('TEST_ONLY changed observable draft.'::text)
  );
  v_changed_candidate := jsonb_build_object(
    'englishDraft', v_changed_content->'englishDraft',
    'reviewVersions', v_changed_content->'reviewVersions',
    'missingFacts', v_changed_content->'missingFacts',
    'neutralWordingChecks', v_changed_content->'neutralWordingChecks',
    'followUpPrompts', v_changed_content->'followUpPrompts'
  );
  v_changed_content_hash :=
    public.v1_shadow_content_sha256(v_changed_content);
  v_changed_candidate_hash :=
    public.v1_shadow_content_sha256(v_changed_candidate);
  v_changed_evidence := jsonb_set(
    v_evidence,
    '{candidateDigest}',
    to_jsonb(v_changed_candidate_hash)
  );

  begin
    perform careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      v_state.fence_id,
      v_state.fence_digest,
      v_changed_content,
      v_changed_content_hash,
      v_changed_evidence
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected
    or (select count(*) from public.ai_document_revisions where document_id = v_job.result_document_id) <> 1
    or (select count(*) from public.ai_document_mutation_receipts where mutation_id = v_mutation_id) <> 1
  then
    raise exception 'changed success replay was not rejected atomically';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      v_content_hash,
      v_evidence_hash
    );
  if v_resolved->>'status' is distinct from 'SUCCEEDED'
    or v_resolved->'atomicSuccess' is distinct from v_success
    or v_resolved - array['status', 'atomicSuccess'] <> '{}'::jsonb
  then
    raise exception 'success response-loss resolution drifted';
  end if;
end
$$;

-- A terminal provider failure produces no canonical object and no Points
-- mutation. The exact settlement envelope is stable across response loss.
do $$
declare
  v_state rpc_assertion_state%rowtype;
  v_failure jsonb;
  v_replay jsonb;
  v_resolved jsonb;
  v_wrong_token_rejected boolean := false;
  v_mutation_id text;
begin
  select state.* into v_state
  from rpc_assertion_state as state
  where state.scenario = 'failure';

  v_failure :=
    careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_PERMANENT',
      null
    );
  if not (v_failure ?& array[
      'transaction', 'settlement', 'jobTransition', 'attemptTerminal',
      'payloadMetadata', 'purgeOutboxAcknowledgment'
    ])
    or v_failure - array[
      'transaction', 'settlement', 'jobTransition', 'attemptTerminal',
      'payloadMetadata', 'purgeOutboxAcknowledgment'
    ] <> '{}'::jsonb
    or v_failure #>> '{transaction,status}' is distinct from 'COMMITTED'
    or (v_failure #>> '{transaction,atomic}')::boolean is not true
    or v_failure #>> '{settlement,disposition}' is distinct from 'FAILED'
    or v_failure #>> '{settlement,reason}' is distinct from
      'PROVIDER_PERMANENT'
    or v_failure #>> '{jobTransition,status}' is distinct from 'FAILED'
    or v_failure #>> '{attemptTerminal,status}' is distinct from 'FAILED'
    or v_failure #> '{attemptTerminal,providerEvidenceHash}' is distinct from
      'null'::jsonb
    or v_failure #>> '{payloadMetadata,state}' is distinct from 'REVOKED'
    or v_failure #>> '{purgeOutboxAcknowledgment,status}' is distinct from
      'ENQUEUED'
    or v_failure::text ~*
      '"(canonicalContent|providerEvidence|englishDraft)"[[:space:]]*:|vault|locator'
  then
    raise exception 'atomic failure envelope drifted or leaked content';
  end if;

  v_replay :=
    careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_PERMANENT',
      null
    );
  if v_replay is distinct from v_failure then
    raise exception 'failure response-loss replay drifted';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  if v_resolved->>'status' is distinct from 'FAILED'
    or v_resolved->'atomicSettlement' is distinct from v_failure
    or v_resolved - array['status', 'atomicSettlement'] <> '{}'::jsonb
  then
    raise exception 'failure response-loss resolution drifted';
  end if;

  begin
    perform careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_state.job_id,
      v_state.attempt_id,
      'test-only-wrong-lease',
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_PERMANENT',
      null
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POLICY_MISMATCH' then
      v_wrong_token_rejected := true;
    else
      raise;
    end if;
  end;

  v_mutation_id :=
    'note-generation:' || careslink_v1_generation._sha256_text(
      v_state.job_id::text
    );
  if not v_wrong_token_rejected
    or (
      select count(*)
      from public.ai_document_mutation_receipts
      where mutation_id = v_mutation_id
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence
      where attempt_id = v_state.attempt_id
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
      where payload_id = v_state.payload_id
        and reason = 'FAILED'
    ) <> 1
  then
    raise exception 'failure path was not terminal, idempotent and content-free';
  end if;
end
$$;

-- A terminal attempt may store either no retry-delay tuple or all three
-- database-owned values. PostgreSQL CHECK must reject each partial-NULL shape
-- rather than letting UNKNOWN pass three-valued constraint evaluation.
do $$
declare
  v_state rpc_assertion_state%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_rejections integer := 0;
begin
  select state.* into v_state
  from rpc_assertion_state as state
  where state.scenario = 'failure';
  select to_jsonb(attempt.*) into v_before
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_state.attempt_id;

  begin
    update careslink_v1_generation.attempts
    set settlement_base_delay_ms = null,
        settlement_jitter_ms = 0,
        settlement_retry_delay_ms = 1000
    where id = v_state.attempt_id;
    raise exception using
      errcode = 'P0001', message = 'PARTIAL_DELAY_ACCEPTED';
  exception
    when check_violation then
      v_rejections := v_rejections + 1;
    when sqlstate 'P0001' then
      raise exception 'NULL settlement_base_delay_ms was accepted';
  end;

  begin
    update careslink_v1_generation.attempts
    set settlement_base_delay_ms = 1000,
        settlement_jitter_ms = null,
        settlement_retry_delay_ms = 1000
    where id = v_state.attempt_id;
    raise exception using
      errcode = 'P0001', message = 'PARTIAL_DELAY_ACCEPTED';
  exception
    when check_violation then
      v_rejections := v_rejections + 1;
    when sqlstate 'P0001' then
      raise exception 'NULL settlement_jitter_ms was accepted';
  end;

  begin
    update careslink_v1_generation.attempts
    set settlement_base_delay_ms = 1000,
        settlement_jitter_ms = 0,
        settlement_retry_delay_ms = null
    where id = v_state.attempt_id;
    raise exception using
      errcode = 'P0001', message = 'PARTIAL_DELAY_ACCEPTED';
  exception
    when check_violation then
      v_rejections := v_rejections + 1;
    when sqlstate 'P0001' then
      raise exception 'NULL settlement_retry_delay_ms was accepted';
  end;

  select to_jsonb(attempt.*) into v_after
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_state.attempt_id;
  if v_rejections <> 3 or v_after is distinct from v_before then
    raise exception 'partial-NULL settlement delay checks mutated state';
  end if;
end
$$;

-- Claim does not trust admission-time auth. Authorize re-reads the user and
-- session and atomically settles a revoked/expired session without issuing a
-- payload grant or canonical output; the denial itself is replayable.
do $$
declare
  v_claim jsonb;
  v_denied jsonb;
  v_replay jsonb;
  v_resolved jsonb;
  v_job_id uuid;
  v_payload_id uuid;
  v_attempt_id uuid;
  v_lease_token text;
begin
  v_claim := careslink_v1_generation.claim_v1_shadow_note_generation_job(
    current_setting('careslink.assert.registration_digest'),
    'worker.test.v1',
    current_setting('careslink.assert.worker_policy_digest'),
    current_setting('careslink.assert.worker_identity_hash'),
    '1.0.0-shadow.1',
    '2026-08-09.v1-shadow'
  );
  v_job_id := (v_claim #>> '{claim,job,jobId}')::uuid;
  v_payload_id := (v_claim #>> '{claim,job,payloadId}')::uuid;
  v_attempt_id := (v_claim #>> '{claim,attempt,attemptId}')::uuid;
  v_lease_token := v_claim #>> '{claim,leaseToken}';
  if v_claim->>'status' is distinct from 'CLAIMED'
    or v_job_id is distinct from
      'b3000000-0000-4000-8000-000000000003'::uuid
  then
    raise exception 'expired-session fixture was not claimed';
  end if;

  insert into rpc_assertion_state (
    scenario, job_id, payload_id, attempt_id, lease_token
  ) values (
    'session-revoked', v_job_id, v_payload_id, v_attempt_id, v_lease_token
  );

  v_denied :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_job_id,
      v_payload_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest')
    );
  v_replay :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_job_id,
      v_payload_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest')
    );

  if v_denied->>'status' is distinct from 'DENIED_SETTLED'
    or v_denied->>'reason' is distinct from 'SESSION_REVOKED'
    or v_denied->>'transactionStatus' is distinct from 'COMMITTED'
    or (v_denied->>'atomic')::boolean is not true
    or v_denied->>'jobStatus' is distinct from 'FAILED'
    or v_denied->>'attemptStatus' is distinct from 'FAILED'
    or v_denied->>'payloadState' is distinct from 'REVOKED'
    or v_denied->>'payloadDisposition' is distinct from
      'REVOKED_PURGE_ENQUEUED'
    or not (v_denied ?& array[
      'status', 'transactionId', 'transactionStatus', 'atomic',
      'committedAt', 'registrationDigest', 'reason', 'jobReferenceHash',
      'attemptReferenceHash', 'payloadReferenceHash', 'jobStatus',
      'attemptStatus', 'payloadState', 'payloadDisposition',
      'purgeEventReferenceHash'
    ])
    or v_denied - array[
      'status', 'transactionId', 'transactionStatus', 'atomic',
      'committedAt', 'registrationDigest', 'reason', 'jobReferenceHash',
      'attemptReferenceHash', 'payloadReferenceHash', 'jobStatus',
      'attemptStatus', 'payloadState', 'payloadDisposition',
      'purgeEventReferenceHash'
    ] <> '{}'::jsonb
    or v_denied::text ~* 'vault|locator|grantId|rawFacts|canonicalContent|providerEvidence'
    or v_replay is distinct from v_denied
    or (
      select count(*)
      from careslink_v1_generation.payload_grants
      where attempt_id = v_attempt_id
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
      where payload_id = v_payload_id
        and reason = 'FAILED'
    ) <> 1
  then
    raise exception 'fresh-session denial was not atomic and replayable';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_job_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  if v_resolved->>'status' is distinct from 'FAILED'
    or v_resolved #>> '{atomicSettlement,settlement,reason}' is distinct from
      'SESSION_REVOKED'
  then
    raise exception 'fresh-session denial resolution drifted';
  end if;
end
$$;

-- Until a vault/KMS/retention decision exists, consume can validate every
-- fresh binding but must never release a capability. A fully valid request is
-- atomically denied as PAYLOAD_UNAVAILABLE and the metadata grant is revoked.
do $$
declare
  v_claim jsonb;
  v_authorized jsonb;
  v_denied jsonb;
  v_replay jsonb;
  v_resolved jsonb;
  v_job_id uuid;
  v_payload_id uuid;
  v_attempt_id uuid;
  v_grant_id uuid;
  v_lease_token text;
begin
  v_claim := careslink_v1_generation.claim_v1_shadow_note_generation_job(
    current_setting('careslink.assert.registration_digest'),
    'worker.test.v1',
    current_setting('careslink.assert.worker_policy_digest'),
    current_setting('careslink.assert.worker_identity_hash'),
    '1.0.0-shadow.1',
    '2026-08-09.v1-shadow'
  );
  v_job_id := (v_claim #>> '{claim,job,jobId}')::uuid;
  v_payload_id := (v_claim #>> '{claim,job,payloadId}')::uuid;
  v_attempt_id := (v_claim #>> '{claim,attempt,attemptId}')::uuid;
  v_lease_token := v_claim #>> '{claim,leaseToken}';
  if v_claim->>'status' is distinct from 'CLAIMED'
    or v_job_id is distinct from
      'b3000000-0000-4000-8000-000000000004'::uuid
  then
    raise exception 'fail-closed consume fixture was not claimed';
  end if;

  v_authorized :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_job_id,
      v_payload_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest')
    );
  if v_authorized->>'status' is distinct from 'AUTHORIZED'
    or v_authorized::text ~* 'vault|locator|rawFacts|cleanedFacts'
  then
    raise exception 'consume fixture authorization leaked capability data';
  end if;
  v_grant_id := (v_authorized->>'grantId')::uuid;

  insert into rpc_assertion_state (
    scenario, job_id, payload_id, attempt_id, lease_token, grant_id
  ) values (
    'consume-denied',
    v_job_id,
    v_payload_id,
    v_attempt_id,
    v_lease_token,
    v_grant_id
  );

  v_denied :=
    careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
      v_job_id,
      v_payload_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest'),
      v_grant_id
    );
  v_replay :=
    careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
      v_job_id,
      v_payload_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest'),
      v_grant_id
    );

  if v_denied->>'status' is distinct from 'DENIED_SETTLED'
    or v_denied->>'reason' is distinct from 'PAYLOAD_UNAVAILABLE'
    or v_denied->>'transactionStatus' is distinct from 'COMMITTED'
    or (v_denied->>'atomic')::boolean is not true
    or v_denied->>'jobStatus' is distinct from 'FAILED'
    or v_denied->>'attemptStatus' is distinct from 'FAILED'
    or v_denied->>'payloadState' is distinct from 'REVOKED'
    or v_denied->>'payloadDisposition' is distinct from
      'REVOKED_PURGE_ENQUEUED'
    or v_denied::text ~* 'vaultGrant|vault|locator|rawFacts|cleanedFacts|canonicalContent|providerEvidence'
    or v_replay is distinct from v_denied
    or (
      select count(*)
      from careslink_v1_generation.payload_grants
      where id = v_grant_id
        and status = 'REVOKED'
        and consumed_at is null
        and revoked_at is not null
        and vault_grant_hash is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
      where payload_id = v_payload_id
        and reason = 'FAILED'
    ) <> 1
  then
    raise exception 'consume was not fail-closed, atomic and replayable';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_job_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  if v_resolved->>'status' is distinct from 'FAILED'
    or v_resolved #>> '{atomicSettlement,settlement,reason}' is distinct from
      'PAYLOAD_UNAVAILABLE'
  then
    raise exception 'consume denial response-loss resolution drifted';
  end if;
end
$$;

-- Prepare a late-failure scenario. First prove that even a fenced attempt
-- cannot commit while its exact payload grant remains merely ISSUED, then use
-- the same explicit rollback-only CONSUMED metadata bridge as above.
do $$
declare
  v_claim jsonb;
  v_authorized jsonb;
  v_fence jsonb;
  v_job_id uuid;
  v_payload_id uuid;
  v_attempt_id uuid;
  v_grant_id uuid;
  v_lease_token text;
  v_rejected boolean := false;
  v_artifact rpc_assertion_artifacts%rowtype;
begin
  v_claim := careslink_v1_generation.claim_v1_shadow_note_generation_job(
    current_setting('careslink.assert.registration_digest'),
    'worker.test.v1',
    current_setting('careslink.assert.worker_policy_digest'),
    current_setting('careslink.assert.worker_identity_hash'),
    '1.0.0-shadow.1',
    '2026-08-09.v1-shadow'
  );
  v_job_id := (v_claim #>> '{claim,job,jobId}')::uuid;
  v_payload_id := (v_claim #>> '{claim,job,payloadId}')::uuid;
  v_attempt_id := (v_claim #>> '{claim,attempt,attemptId}')::uuid;
  v_lease_token := v_claim #>> '{claim,leaseToken}';
  if v_claim->>'status' is distinct from 'CLAIMED'
    or v_job_id is distinct from
      'b3000000-0000-4000-8000-000000000005'::uuid
  then
    raise exception 'late-failure fixture was not claimed';
  end if;

  v_authorized :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_job_id,
      v_payload_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest')
    );
  v_grant_id := (v_authorized->>'grantId')::uuid;
  v_fence := careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    v_job_id,
    v_attempt_id,
    v_lease_token,
    current_setting('careslink.assert.registration_digest'),
    'worker.test.v1',
    current_setting('careslink.assert.worker_policy_digest')
  );
  if v_authorized->>'status' is distinct from 'AUTHORIZED'
    or v_fence->>'status' is distinct from 'FENCED'
  then
    raise exception 'late-failure authorization or fence failed';
  end if;

  insert into rpc_assertion_state (
    scenario,
    job_id,
    payload_id,
    attempt_id,
    lease_token,
    grant_id,
    fence_id,
    fence_digest
  ) values (
    'atomic-rollback',
    v_job_id,
    v_payload_id,
    v_attempt_id,
    v_lease_token,
    v_grant_id,
    (v_fence->>'fenceId')::uuid,
    v_fence->>'fenceDigest'
  );
  insert into rpc_assertion_artifacts (
    scenario,
    canonical_content,
    canonical_content_hash,
    provider_evidence,
    provider_evidence_hash
  )
  select
    'atomic-rollback',
    artifact.canonical_content,
    artifact.canonical_content_hash,
    artifact.provider_evidence,
    artifact.provider_evidence_hash
  from rpc_assertion_artifacts as artifact
  where artifact.scenario = 'success';

  select artifact.* into v_artifact
  from rpc_assertion_artifacts as artifact
  where artifact.scenario = 'atomic-rollback';
  begin
    perform careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_job_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      (v_fence->>'fenceId')::uuid,
      v_fence->>'fenceDigest',
      v_artifact.canonical_content,
      v_artifact.canonical_content_hash,
      v_artifact.provider_evidence
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PAYLOAD_UNAVAILABLE' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected
    or (
      select count(*)
      from careslink_v1_generation.jobs
      where id = v_job_id and status = 'RUNNING'
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence
      where attempt_id = v_attempt_id
    ) <> 0
  then
    raise exception 'commit did not require an exact CONSUMED grant';
  end if;

  update careslink_v1_generation.payload_grants as grant_record
  set status = 'CONSUMED',
      consumed_at = date_trunc('milliseconds', transaction_timestamp()),
      vault_grant_hash = repeat('6', 64)
  where grant_record.id = v_grant_id
    and grant_record.payload_id = v_payload_id
    and grant_record.job_id = v_job_id
    and grant_record.attempt_id = v_attempt_id
    and grant_record.registration_digest =
      current_setting('careslink.assert.registration_digest')
    and grant_record.lease_token_hash = encode(
      extensions.digest(convert_to(v_lease_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and grant_record.request_hash = repeat('e', 64)
    and grant_record.status = 'ISSUED';
  if not found then
    raise exception 'late-failure TEST_ONLY consumed grant binding failed';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The executor deliberately has no SELECT privilege on raw revision content.
-- After leaving that role, the migration actor proves the one successful raw
-- revision against the transaction-local artifact and the immutable
-- job-derived mutation identifier without widening the runtime ACL.
do $$
declare
  v_state rpc_assertion_state%rowtype;
  v_artifact rpc_assertion_artifacts%rowtype;
  v_mutation_id text;
begin
  select state.* into v_state
  from rpc_assertion_state as state
  where state.scenario = 'success';
  select artifact.* into v_artifact
  from rpc_assertion_artifacts as artifact
  where artifact.scenario = 'success';

  v_mutation_id :=
    'note-generation:' || encode(
      extensions.digest(convert_to(v_state.job_id::text, 'UTF8'), 'sha256'),
      'hex'
    );

  if v_state.job_id is null
    or v_artifact.scenario is null
    or (
      select count(*)
      from public.ai_document_revisions as revision
      where revision.mutation_id = v_mutation_id
        and revision.content is not distinct from v_artifact.canonical_content
        and revision.content_hash is not distinct from
          v_artifact.canonical_content_hash
        and public.v1_shadow_content_sha256(revision.content)
          is not distinct from revision.content_hash
    ) <> 1
  then
    raise exception 'canonical success raw revision binding drifted';
  end if;
end
$$;

-- The trigger is assertion-only fault injection. It fires after document,
-- revision and sync inserts but before the terminal metadata transaction can
-- complete, proving PostgreSQL rolls the entire commit statement back.
create function pg_temp.fail_v1_worker_rpc_late()
returns trigger
language plpgsql
as $assertion_fault$
begin
  raise exception using
    errcode = 'P0001',
    message = 'TEST_ONLY_LATE_FAILURE';
end
$assertion_fault$;

create trigger test_only_fail_v1_worker_rpc_late
before insert on public.ai_document_mutation_receipts
for each row execute function pg_temp.fail_v1_worker_rpc_late();

set local role careslink_v1_generation_executor;

do $$
declare
  v_state rpc_assertion_state%rowtype;
  v_artifact rpc_assertion_artifacts%rowtype;
  v_rejected boolean := false;
  v_mutation_id text;
begin
  select state.* into v_state
  from rpc_assertion_state as state
  where state.scenario = 'atomic-rollback';
  select artifact.* into v_artifact
  from rpc_assertion_artifacts as artifact
  where artifact.scenario = 'atomic-rollback';

  begin
    perform careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      v_state.fence_id,
      v_state.fence_digest,
      v_artifact.canonical_content,
      v_artifact.canonical_content_hash,
      v_artifact.provider_evidence
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'TEST_ONLY_LATE_FAILURE' then
      v_rejected := true;
    else
      raise;
    end if;
  end;

  perform careslink_v1_generation._set_owner(
    'b0000000-0000-4000-8000-000000000001'::uuid
  );
  v_mutation_id :=
    'note-generation:' || careslink_v1_generation._sha256_text(
      v_state.job_id::text
    );
  if not v_rejected
    or (
      select count(*)
      from careslink_v1_generation.jobs
      where id = v_state.job_id
        and status = 'RUNNING'
        and result_document_id is null
        and result_revision_id is null
        and result_content_hash is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.attempts
      where id = v_state.attempt_id
        and status = 'RUNNING'
        and terminal_transaction_id is null
        and canonical_content_hash is null
        and provider_evidence_hash is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payloads
      where id = v_state.payload_id and state = 'AVAILABLE'
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_grants
      where id = v_state.grant_id
        and status = 'CONSUMED'
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence
      where attempt_id = v_state.attempt_id
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
      where payload_id = v_state.payload_id
    ) <> 0
    or (
      select count(*)
      from public.ai_document_revisions
      where mutation_id = v_mutation_id
    ) <> 0
    or (
      select count(*)
      from public.ai_document_sync_changes
      where last_mutation_id = v_mutation_id
    ) <> 0
    or (
      select count(*)
      from public.ai_document_mutation_receipts
      where mutation_id = v_mutation_id
    ) <> 0
    or (
      select count(*)
      from public.ai_documents
      where owner_user_id =
        'b0000000-0000-4000-8000-000000000001'::uuid
    ) <> 1
  then
    raise exception 'late commit failure did not roll back atomically';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
drop trigger test_only_fail_v1_worker_rpc_late
  on public.ai_document_mutation_receipts;
drop function pg_temp.fail_v1_worker_rpc_late();

set local role careslink_v1_generation_executor;

-- Recovery serially arbitrates an expired lease, persists the exact retry
-- choice once, and makes the prior attempt resolvable after response loss.
do $$
declare
  v_recovery jsonb;
  v_replay jsonb;
  v_resolved jsonb;
begin
  v_recovery :=
    careslink_v1_generation.recover_v1_shadow_note_generation_expired(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      current_setting('careslink.assert.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  if v_recovery is distinct from jsonb_build_object(
      'recovered', 1,
      'requeued', 1,
      'failed', 0
    )
    or (
      select count(*)
      from careslink_v1_generation.attempts
      where id = 'b6000000-0000-4000-8000-000000000006'::uuid
        and status = 'LEASE_EXPIRED'
        and failure_reason = 'LEASE_EXPIRED'
        and terminal_transaction_id is not null
        and settlement_base_delay_ms = 1000
        and settlement_jitter_ms = 0
        and settlement_retry_delay_ms = 1000
        and finished_at =
          date_trunc('milliseconds', transaction_timestamp())
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.jobs
      where id = 'b3000000-0000-4000-8000-000000000006'::uuid
        and status = 'QUEUED'
        and attempt_count = 1
        and next_eligible_at =
          date_trunc('milliseconds', transaction_timestamp())
            + interval '1 second'
        and failure_reason is null
        and finished_at is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payloads
      where id = 'b5000000-0000-4000-8000-000000000006'::uuid
        and state = 'AVAILABLE'
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
      where payload_id = 'b5000000-0000-4000-8000-000000000006'::uuid
    ) <> 0
  then
    raise exception 'expired-lease recovery arbitration drifted';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      'b3000000-0000-4000-8000-000000000006'::uuid,
      'b6000000-0000-4000-8000-000000000006'::uuid,
      'test-only-expired-lease',
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  if v_resolved->>'status' is distinct from 'RETRY_SCHEDULED'
    or v_resolved #>> '{atomicSettlement,settlement,reason}' is distinct from
      'LEASE_EXPIRED'
    or v_resolved #>> '{atomicSettlement,settlement,payloadDisposition}'
      is distinct from
      'RETAINED_FOR_RETRY'
    or v_resolved #> '{atomicSettlement,purgeOutboxAcknowledgment}'
      is distinct from
      'null'::jsonb
  then
    raise exception 'recovered-attempt resolution drifted';
  end if;

  v_replay :=
    careslink_v1_generation.recover_v1_shadow_note_generation_expired(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      current_setting('careslink.assert.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  if v_replay is distinct from jsonb_build_object(
      'recovered', 0,
      'requeued', 0,
      'failed', 0
    )
  then
    raise exception 'recovery replay was not empty and idempotent';
  end if;
end
$$;

-- A retry acknowledgement belongs to the terminal attempt, not to the job's
-- later mutable state. Settle attempt 1, complete attempt 2 canonically, advance
-- the payload to PURGED, then prove old-attempt resolve/settle and current-
-- attempt success replay reproduce the original acknowledgements without any
-- duplicate canonical, evidence or purge-outbox side effect.
do $$
declare
  v_job_id constant uuid :=
    'b3000000-0000-4000-8000-000000000007'::uuid;
  v_payload_id constant uuid :=
    'b5000000-0000-4000-8000-000000000007'::uuid;
  v_claim jsonb;
  v_next_claim jsonb;
  v_first_ack jsonb;
  v_resolved jsonb;
  v_replay jsonb;
  v_first_attempt_id uuid;
  v_next_attempt_id uuid;
  v_first_lease_token text;
  v_next_lease_token text;
  v_grant_id uuid;
  v_authorized jsonb;
  v_fence jsonb;
  v_first_attempt record;
  v_next_attempt record;
  v_content jsonb;
  v_candidate jsonb;
  v_evidence jsonb;
  v_stale_evidence jsonb;
  v_content_hash text;
  v_candidate_hash text;
  v_evidence_hash text;
  v_success_ack jsonb;
  v_success_resolved jsonb;
  v_success_replay jsonb;
  v_recovery jsonb;
  v_stale_worker_rejected boolean := false;
  v_wrong_reason_rejected boolean := false;
  v_mutation_id text;
begin
  v_claim :=
    careslink_v1_generation.claim_v1_shadow_note_generation_job(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      current_setting('careslink.assert.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  v_first_attempt_id := (v_claim #>> '{claim,attempt,attemptId}')::uuid;
  v_first_lease_token := v_claim #>> '{claim,leaseToken}';
  if v_claim->>'status' is distinct from 'CLAIMED'
    or (v_claim #>> '{claim,job,jobId}')::uuid is distinct from v_job_id
    or v_claim #>> '{claim,attempt,ordinal}' is distinct from '1'
    or coalesce(v_first_lease_token, '') = ''
  then
    raise exception 'historical retry fixture claim drifted';
  end if;

  v_first_ack :=
    careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_job_id,
      v_first_attempt_id,
      v_first_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_TRANSIENT',
      null
    );
  if v_first_ack #>> '{transaction,status}' is distinct from 'COMMITTED'
    or v_first_ack #>> '{settlement,disposition}' is distinct from
      'RETRY_SCHEDULED'
    or v_first_ack #>> '{settlement,reason}' is distinct from
      'PROVIDER_TRANSIENT'
    or v_first_ack #>> '{settlement,payloadDisposition}' is distinct from
      'RETAINED_FOR_RETRY'
    or v_first_ack #>> '{settlement,baseDelayMs}' is distinct from '1000'
    or v_first_ack #>> '{settlement,jitterMs}' is distinct from '0'
    or v_first_ack #>> '{settlement,retryDelayMs}' is distinct from '1000'
    or v_first_ack #>> '{jobTransition,status}' is distinct from 'QUEUED'
    or v_first_ack #>> '{attemptTerminal,status}' is distinct from 'FAILED'
    or v_first_ack #>> '{payloadMetadata,state}' is distinct from 'AVAILABLE'
    or v_first_ack->'purgeOutboxAcknowledgment' is distinct from 'null'::jsonb
    or coalesce(
      v_first_ack #>> '{jobTransition,jobReferenceHash}', ''
    ) !~ '^[a-f0-9]{64}$'
    or coalesce(
      v_first_ack #>> '{attemptTerminal,attemptReferenceHash}', ''
    ) !~ '^[a-f0-9]{64}$'
    or coalesce(
      v_first_ack #>> '{payloadMetadata,payloadReferenceHash}', ''
    ) !~ '^[a-f0-9]{64}$'
  then
    raise exception 'historical retry first acknowledgement drifted';
  end if;

  -- The retry delay is database-owned. This transaction-only fixture advances
  -- eligibility without using caller time as an RPC input.
  update careslink_v1_generation.jobs as job
  set next_eligible_at = date_trunc('milliseconds', transaction_timestamp()),
      updated_at = date_trunc('milliseconds', transaction_timestamp())
  where job.id = v_job_id
    and job.status = 'QUEUED'
    and job.attempt_count = 1;
  if not found then
    raise exception 'historical retry eligibility fixture drifted';
  end if;

  v_next_claim :=
    careslink_v1_generation.claim_v1_shadow_note_generation_job(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      current_setting('careslink.assert.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  v_next_attempt_id :=
    (v_next_claim #>> '{claim,attempt,attemptId}')::uuid;
  v_next_lease_token := v_next_claim #>> '{claim,leaseToken}';
  if v_next_claim->>'status' is distinct from 'CLAIMED'
    or (v_next_claim #>> '{claim,job,jobId}')::uuid is distinct from v_job_id
    or v_next_claim #>> '{claim,attempt,ordinal}' is distinct from '2'
    or v_next_attempt_id is not distinct from v_first_attempt_id
    or coalesce(v_next_lease_token, '') = ''
    or (
      select count(*)
      from careslink_v1_generation.jobs as job
      where job.id = v_job_id
        and job.status = 'RUNNING'
        and job.attempt_count = 2
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.id = v_next_attempt_id
        and attempt.job_id = v_job_id
        and attempt.attempt_number = 2
        and attempt.status = 'RUNNING'
    ) <> 1
  then
    raise exception 'historical retry next-attempt transition drifted';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_job_id,
      v_first_attempt_id,
      v_first_lease_token,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  v_replay :=
    careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_job_id,
      v_first_attempt_id,
      v_first_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_TRANSIENT',
      null
    );
  if v_resolved is distinct from jsonb_build_object(
      'status', 'RETRY_SCHEDULED',
      'atomicSettlement', v_first_ack
    )
    or v_replay is distinct from v_first_ack
  then
    raise exception
      'historical retry replay drifted while attempt 2 was running';
  end if;

  -- Attempt 2 completes canonically before the old response-loss replay.
  v_authorized :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_job_id,
      v_payload_id,
      v_next_attempt_id,
      v_next_lease_token,
      current_setting('careslink.assert.registration_digest')
    );
  v_grant_id := (v_authorized->>'grantId')::uuid;
  if v_authorized->>'status' is distinct from 'AUTHORIZED'
    or v_grant_id is null
    or v_authorized::text ~* 'vault|locator|rawFacts|cleanedFacts'
  then
    raise exception 'historical retry attempt-2 authorization drifted';
  end if;

  -- TEST_ONLY fixture bridge: normal consume remains deliberately unavailable
  -- until the vault/KMS/retention contract is approved.
  update careslink_v1_generation.payload_grants as grant_record
  set status = 'CONSUMED',
      consumed_at = date_trunc('milliseconds', transaction_timestamp()),
      vault_grant_hash = repeat('6', 64)
  where grant_record.id = v_grant_id
    and grant_record.payload_id = v_payload_id
    and grant_record.job_id = v_job_id
    and grant_record.attempt_id = v_next_attempt_id
    and grant_record.registration_digest =
      current_setting('careslink.assert.registration_digest')
    and grant_record.lease_token_hash =
      encode(
        extensions.digest(
          convert_to(v_next_lease_token, 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    and grant_record.request_hash = repeat('7', 64)
    and grant_record.status = 'ISSUED';
  if not found then
    raise exception 'historical retry attempt-2 consumed fixture drifted';
  end if;

  v_fence :=
    careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
      v_job_id,
      v_next_attempt_id,
      v_next_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest')
    );
  if v_fence->>'status' is distinct from 'FENCED'
    or coalesce(v_fence->>'fenceId', '') = ''
    or coalesce(v_fence->>'fenceDigest', '') !~ '^[a-f0-9]{64}$'
  then
    raise exception 'historical retry attempt-2 fence drifted';
  end if;

  select attempt.* into v_next_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_next_attempt_id
    and attempt.job_id = v_job_id
    and attempt.status = 'RUNNING';
  select
    artifact.canonical_content,
    artifact.canonical_content_hash
  into v_content, v_content_hash
  from rpc_assertion_artifacts as artifact
  where artifact.scenario = 'success';
  v_candidate := jsonb_build_object(
    'englishDraft', v_content->'englishDraft',
    'reviewVersions', v_content->'reviewVersions',
    'missingFacts', v_content->'missingFacts',
    'neutralWordingChecks', v_content->'neutralWordingChecks',
    'followUpPrompts', v_content->'followUpPrompts'
  );
  v_candidate_hash := public.v1_shadow_content_sha256(v_candidate);
  v_evidence := jsonb_build_object(
    'policyDigest', (
      select provider_digest
      from rpc_assertion_policy_values
      where note_type = 'communication'
    ),
    'providerId', 'provider.test',
    'modelId', 'model.test',
    'modelRevision', null,
    'modelRevisionAvailability', 'PROVIDER_NOT_EXPOSED',
    'policyVersion', 'provider.test.v1',
    'promptTemplateVersion', 'prompt.test.v1',
    'goldenSetVersion', 'golden.test.v1',
    'parserVersion', 'parser.test.v1',
    'serviceCode', 'note.communication.generate',
    'rateCatalogVersion', '2026-08-09.v1-shadow',
    'timeoutMs', 20000,
    'workerPolicyDigest',
      current_setting('careslink.assert.worker_policy_digest'),
    'deadlineAt', careslink_v1_generation._server_time(
      v_next_attempt.acquired_at + interval '20 seconds'
    ),
    'startedAt',
      careslink_v1_generation._server_time(v_next_attempt.acquired_at),
    'finishedAt',
      careslink_v1_generation._server_time(v_next_attempt.acquired_at),
    'durationMs', 0,
    'finishReason', 'COMPLETED',
    'providerRequestIdHash', null,
    'usage', jsonb_build_object(
      'status', 'UNAVAILABLE', 'source', 'UNAVAILABLE'
    ),
    'cost', jsonb_build_object(
      'status', 'UNAVAILABLE', 'source', 'UNAVAILABLE'
    ),
    'candidateDigest', v_candidate_hash
  );
  v_evidence_hash := public.v1_shadow_content_sha256(v_evidence);

  v_success_ack :=
    careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_job_id,
      v_next_attempt_id,
      v_next_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      (v_fence->>'fenceId')::uuid,
      v_fence->>'fenceDigest',
      v_content,
      v_content_hash,
      v_evidence
    );
  v_mutation_id :=
    'note-generation:' || careslink_v1_generation._sha256_text(v_job_id::text);
  select attempt.* into v_next_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_next_attempt_id
    and attempt.job_id = v_job_id
    and attempt.status = 'SUCCEEDED';
  if v_success_ack #>> '{transaction,status}' is distinct from 'COMMITTED'
    or v_success_ack #>> '{jobTerminal,status}' is distinct from 'SUCCEEDED'
    or v_success_ack #>> '{attemptTerminal,status}' is distinct from
      'SUCCEEDED'
    or v_success_ack #>> '{attemptTerminal,contentHash}' is distinct from
      v_content_hash
    or v_success_ack #>> '{attemptTerminal,providerEvidenceHash}'
      is distinct from v_evidence_hash
    or v_success_ack #>> '{payloadMetadata,state}' is distinct from 'REVOKED'
    or v_success_ack #>> '{purgeOutboxAcknowledgment,status}' is distinct from
      'ENQUEUED'
    or v_success_ack::text ~*
      '"(canonicalContent|providerEvidence|englishDraft|providerId)"[[:space:]]*:|vault|locator'
    or v_next_attempt.id is null
  then
    raise exception 'historical retry attempt-2 success drifted';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_job_id,
      v_first_attempt_id,
      v_first_lease_token,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  if v_resolved->>'status' is distinct from 'RETRY_SCHEDULED'
    or v_resolved->'atomicSettlement' is distinct from v_first_ack
    or v_resolved - array['status', 'atomicSettlement'] <> '{}'::jsonb
  then
    raise exception
      'historical retry resolution drifted after attempt 2 succeeded';
  end if;

  v_replay :=
    careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_job_id,
      v_first_attempt_id,
      v_first_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_TRANSIENT',
      null
    );
  if v_replay is distinct from v_first_ack
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.id = v_first_attempt_id
        and attempt.terminal_transaction_id::text =
          v_first_ack #>> '{transaction,transactionId}'
        and attempt.settlement_base_delay_ms = 1000
        and attempt.settlement_jitter_ms = 0
        and attempt.settlement_retry_delay_ms = 1000
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payloads as payload
      where payload.id = v_payload_id
        and payload.state = 'REVOKED'
        and payload.revoke_reason = 'SUCCEEDED'
    ) <> 1
  then
    raise exception
      'historical retry settlement replay drifted after attempt 2 succeeded';
  end if;

  v_success_replay :=
    careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_job_id,
      v_next_attempt_id,
      v_next_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      (v_fence->>'fenceId')::uuid,
      v_fence->>'fenceDigest',
      v_content,
      v_content_hash,
      v_evidence
    );
  v_success_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_job_id,
      v_next_attempt_id,
      v_next_lease_token,
      current_setting('careslink.assert.registration_digest'),
      v_content_hash,
      v_evidence_hash
    );
  if v_success_replay is distinct from v_success_ack
    or v_success_resolved is distinct from jsonb_build_object(
      'status', 'SUCCEEDED',
      'atomicSuccess', v_success_ack
    )
  then
    raise exception
      'historical retry attempt-2 replay or resolution drifted before purge';
  end if;

  begin
    perform careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_job_id,
      v_first_attempt_id,
      v_first_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_PERMANENT',
      null
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_wrong_reason_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_wrong_reason_rejected then
    raise exception 'historical retry changed failure reason was accepted';
  end if;

  select attempt.* into v_first_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_first_attempt_id
    and attempt.job_id = v_job_id;
  v_stale_evidence := v_evidence || jsonb_build_object(
    'deadlineAt', careslink_v1_generation._server_time(
      v_first_attempt.acquired_at + interval '20 seconds'
    ),
    'startedAt',
      careslink_v1_generation._server_time(v_first_attempt.acquired_at),
    'finishedAt',
      careslink_v1_generation._server_time(v_first_attempt.acquired_at),
    'durationMs', 0
  );
  begin
    perform careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_job_id,
      v_first_attempt_id,
      v_first_lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      v_first_attempt.fence_id,
      v_first_attempt.fence_digest,
      v_content,
      v_content_hash,
      v_stale_evidence
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'LEASE_EXPIRED' then
      v_stale_worker_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_stale_worker_rejected then
    raise exception 'historical retry stale attempt-1 commit was not rejected';
  end if;

  v_recovery :=
    careslink_v1_generation.recover_v1_shadow_note_generation_expired(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      current_setting('careslink.assert.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  if v_recovery is distinct from jsonb_build_object(
    'recovered', 0,
    'requeued', 0,
    'failed', 0
  ) then
    raise exception
      'historical retry recovery was not empty after attempt-2 success';
  end if;

  insert into rpc_assertion_state (
    scenario,
    job_id,
    payload_id,
    attempt_id,
    lease_token,
    grant_id,
    fence_id,
    fence_digest
  ) values
    (
      'historical-retry-attempt-1',
      v_job_id,
      v_payload_id,
      v_first_attempt_id,
      v_first_lease_token,
      null,
      null,
      null
    ),
    (
      'historical-retry-attempt-2',
      v_job_id,
      v_payload_id,
      v_next_attempt_id,
      v_next_lease_token,
      v_grant_id,
      (v_fence->>'fenceId')::uuid,
      v_fence->>'fenceDigest'
    );
  insert into rpc_assertion_artifacts (
    scenario,
    canonical_content,
    canonical_content_hash,
    provider_evidence,
    provider_evidence_hash
  ) values (
    'historical-retry-attempt-2',
    v_content,
    v_content_hash,
    v_evidence,
    v_evidence_hash
  );
  insert into rpc_assertion_acknowledgements (
    scenario,
    acknowledgement
  ) values
    ('historical-retry-attempt-1', v_first_ack),
    ('historical-retry-attempt-2', v_success_ack);

  perform careslink_v1_generation._set_owner(
    'b0000000-0000-4000-8000-000000000001'::uuid
  );
  if (
      select count(*)
      from careslink_v1_generation.jobs as job
      where job.id = v_job_id
        and job.status = 'SUCCEEDED'
        and job.attempt_count = 2
        and job.result_document_id::text =
          v_success_ack #>> '{canonical,canonicalId}'
        and job.result_revision_id::text =
          v_success_ack #>> '{canonical,revisionId}'
        and job.result_content_hash = v_content_hash
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = v_job_id
    ) <> 2
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.id = v_first_attempt_id
        and attempt.status = 'FAILED'
        and attempt.failure_reason = 'PROVIDER_TRANSIENT'
        and attempt.terminal_transaction_id::text =
          v_first_ack #>> '{transaction,transactionId}'
        and attempt.settlement_base_delay_ms = 1000
        and attempt.settlement_jitter_ms = 0
        and attempt.settlement_retry_delay_ms = 1000
        and attempt.canonical_content_hash is null
        and attempt.provider_evidence_hash is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.id = v_next_attempt_id
        and attempt.status = 'SUCCEEDED'
        and attempt.terminal_transaction_id::text =
          v_success_ack #>> '{transaction,transactionId}'
        and attempt.canonical_content_hash = v_content_hash
        and attempt.provider_evidence_hash = v_evidence_hash
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payloads as payload
      where payload.id = v_payload_id
        and payload.job_id = v_job_id
        and payload.state = 'REVOKED'
        and payload.revoke_reason = 'SUCCEEDED'
        and payload.revoked_at = v_next_attempt.finished_at
        and payload.purge_requested_at = v_next_attempt.finished_at
        and payload.purged_at is null
        and payload.purge_attempt_count = 0
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.job_id = v_job_id
        and grant_record.attempt_id = v_next_attempt_id
        and grant_record.id = v_grant_id
        and grant_record.status = 'CONSUMED'
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.job_id = v_job_id
        and evidence.attempt_id = v_next_attempt_id
        and evidence.evidence_hash = v_evidence_hash
        and evidence.evidence = v_evidence
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.attempt_id = v_first_attempt_id
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.payload_id = v_payload_id
        and outbox.job_id = v_job_id
        and outbox.transaction_id::text =
          v_success_ack #>> '{transaction,transactionId}'
        and outbox.event_reference_hash =
          v_success_ack #>> '{purgeOutboxAcknowledgment,eventReferenceHash}'
        and outbox.reason = 'SUCCEEDED'
        and outbox.status = 'PENDING'
        and outbox.attempt_count = 0
        and outbox.last_attempt_at is null
        and outbox.completed_at is null
    ) <> 1
    or (
      select count(*)
      from public.ai_documents as document
      where document.id =
        (v_success_ack #>> '{canonical,canonicalId}')::uuid
    ) <> 1
    or (
      select count(*)
      from public.ai_document_revisions as revision
      where revision.id =
          (v_success_ack #>> '{canonical,revisionId}')::uuid
        and revision.document_id =
          (v_success_ack #>> '{canonical,canonicalId}')::uuid
        and revision.content_hash = v_content_hash
        and revision.mutation_id = v_mutation_id
    ) <> 1
    or (
      select count(*)
      from public.ai_document_sync_changes as change
      where change.document_id =
          (v_success_ack #>> '{canonical,canonicalId}')::uuid
        and change.revision_id =
          (v_success_ack #>> '{canonical,revisionId}')::uuid
        and change.last_mutation_id = v_mutation_id
    ) <> 1
    or (
      select count(*)
      from public.ai_document_mutation_receipts as receipt
      where receipt.document_id =
          (v_success_ack #>> '{canonical,canonicalId}')::uuid
        and receipt.revision_id =
          (v_success_ack #>> '{canonical,revisionId}')::uuid
        and receipt.mutation_id = v_mutation_id
    ) <> 1
  then
    raise exception 'historical retry pre-purge side-effect row set drifted';
  end if;
end
$$;

-- Advance the successful payload and its outbox through the rollback-only
-- purge-worker lifecycle without widening the executor's production ACL.
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.payloads no force row level security;
alter table careslink_v1_generation.payload_purge_outbox
  no force row level security;

do $$
declare
  v_job_id constant uuid :=
    'b3000000-0000-4000-8000-000000000007'::uuid;
  v_payload_id constant uuid :=
    'b5000000-0000-4000-8000-000000000007'::uuid;
  v_completed_at timestamptz;
begin
  select greatest(
    outbox.requested_at,
    date_trunc('milliseconds', statement_timestamp())
  )
  into v_completed_at
  from careslink_v1_generation.payloads as payload
  join careslink_v1_generation.payload_purge_outbox as outbox
    on outbox.payload_id = payload.id
   and outbox.job_id = payload.job_id
   and outbox.owner_user_id = payload.owner_user_id
  where payload.id = v_payload_id
    and payload.job_id = v_job_id
    and payload.owner_user_id =
      'b0000000-0000-4000-8000-000000000001'::uuid
    and payload.state = 'REVOKED'
    and payload.revoke_reason = 'SUCCEEDED'
    and payload.revoked_at is not null
    and payload.purge_requested_at = payload.revoked_at
    and payload.purged_at is null
    and payload.purge_attempt_count = 0
    and outbox.reason = 'SUCCEEDED'
    and outbox.status = 'PENDING'
    and outbox.requested_at = payload.purge_requested_at
    and outbox.attempt_count = 0
    and outbox.last_attempt_at is null
    and outbox.completed_at is null
  for update of payload, outbox;
  if v_completed_at is null then
    raise exception 'historical retry purge source fixture drifted';
  end if;

  update careslink_v1_generation.payloads as payload
  set state = 'PURGE_PENDING',
      purge_attempt_count = 1,
      updated_at = v_completed_at
  where payload.id = v_payload_id
    and payload.job_id = v_job_id
    and payload.state = 'REVOKED'
    and payload.revoke_reason = 'SUCCEEDED'
    and payload.purged_at is null
    and payload.purge_attempt_count = 0;
  if not found then
    raise exception 'historical retry purge-pending fixture drifted';
  end if;

  update careslink_v1_generation.payload_purge_outbox as outbox
  set status = 'PROCESSING',
      attempt_count = 1,
      last_attempt_at = v_completed_at
  where outbox.payload_id = v_payload_id
    and outbox.job_id = v_job_id
    and outbox.reason = 'SUCCEEDED'
    and outbox.status = 'PENDING'
    and outbox.attempt_count = 0
    and outbox.last_attempt_at is null
    and outbox.completed_at is null;
  if not found
    or (
      select count(*)
      from careslink_v1_generation.payloads as payload
      join careslink_v1_generation.payload_purge_outbox as outbox
        on outbox.payload_id = payload.id
       and outbox.job_id = payload.job_id
       and outbox.owner_user_id = payload.owner_user_id
      where payload.id = v_payload_id
        and payload.job_id = v_job_id
        and payload.state = 'PURGE_PENDING'
        and payload.purge_attempt_count = 1
        and payload.purged_at is null
        and outbox.status = 'PROCESSING'
        and outbox.attempt_count = 1
        and outbox.last_attempt_at = v_completed_at
        and outbox.completed_at is null
    ) <> 1
  then
    raise exception 'historical retry processing fixture drifted';
  end if;

  update careslink_v1_generation.payloads as payload
  set state = 'PURGED',
      purged_at = v_completed_at,
      updated_at = v_completed_at
  where payload.id = v_payload_id
    and payload.job_id = v_job_id
    and payload.state = 'PURGE_PENDING'
    and payload.purge_attempt_count = 1
    and payload.purged_at is null;
  if not found then
    raise exception 'historical retry payload purge fixture drifted';
  end if;

  update careslink_v1_generation.payload_purge_outbox as outbox
  set status = 'PURGED',
      completed_at = v_completed_at
  where outbox.payload_id = v_payload_id
    and outbox.job_id = v_job_id
    and outbox.reason = 'SUCCEEDED'
    and outbox.status = 'PROCESSING'
    and outbox.attempt_count = 1
    and outbox.last_attempt_at = v_completed_at
    and outbox.completed_at is null;
  if not found
    or (
      select count(*)
      from careslink_v1_generation.payloads as payload
      join careslink_v1_generation.payload_purge_outbox as outbox
        on outbox.payload_id = payload.id
       and outbox.job_id = payload.job_id
       and outbox.owner_user_id = payload.owner_user_id
      where payload.id = v_payload_id
        and payload.job_id = v_job_id
        and payload.state = 'PURGED'
        and payload.revoke_reason = 'SUCCEEDED'
        and payload.purge_attempt_count = 1
        and payload.purged_at = v_completed_at
        and payload.updated_at = v_completed_at
        and outbox.status = 'PURGED'
        and outbox.reason = 'SUCCEEDED'
        and outbox.attempt_count = 1
        and outbox.last_attempt_at = v_completed_at
        and outbox.completed_at = v_completed_at
        and outbox.requested_at = payload.purge_requested_at
    ) <> 1
  then
    raise exception 'historical retry purge lifecycle fixture drifted';
  end if;
end
$$;

alter table careslink_v1_generation.payload_purge_outbox
  force row level security;
alter table careslink_v1_generation.payloads force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_executor;

-- Both attempts now replay across a later live purge state. The old worker
-- cannot overwrite Attempt 2's success, and no terminal call duplicates any
-- canonical, evidence, grant or outbox side effect.
do $$
declare
  v_first_state rpc_assertion_state%rowtype;
  v_success_state rpc_assertion_state%rowtype;
  v_artifact rpc_assertion_artifacts%rowtype;
  v_first_ack jsonb;
  v_success_ack jsonb;
  v_resolved jsonb;
  v_replay jsonb;
  v_success_resolved jsonb;
  v_success_replay jsonb;
  v_first_attempt record;
  v_success_attempt record;
  v_stale_evidence jsonb;
  v_recovery jsonb;
  v_stale_worker_rejected boolean := false;
  v_wrong_reason_rejected boolean := false;
  v_mutation_id text;
begin
  select state.* into v_first_state
  from rpc_assertion_state as state
  where state.scenario = 'historical-retry-attempt-1';
  select state.* into v_success_state
  from rpc_assertion_state as state
  where state.scenario = 'historical-retry-attempt-2';
  select artifact.* into v_artifact
  from rpc_assertion_artifacts as artifact
  where artifact.scenario = 'historical-retry-attempt-2';
  select outcome.acknowledgement into v_first_ack
  from rpc_assertion_acknowledgements as outcome
  where outcome.scenario = 'historical-retry-attempt-1';
  select outcome.acknowledgement into v_success_ack
  from rpc_assertion_acknowledgements as outcome
  where outcome.scenario = 'historical-retry-attempt-2';
  if v_first_state.scenario is null
    or v_success_state.scenario is null
    or v_artifact.scenario is null
    or v_first_ack is null
    or v_success_ack is null
  then
    raise exception 'historical retry persisted proof state drifted';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_first_state.job_id,
      v_first_state.attempt_id,
      v_first_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  if v_resolved is distinct from jsonb_build_object(
    'status', 'RETRY_SCHEDULED',
    'atomicSettlement', v_first_ack
  ) then
    raise exception 'historical retry resolution drifted after purge';
  end if;

  v_replay :=
    careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_first_state.job_id,
      v_first_state.attempt_id,
      v_first_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_TRANSIENT',
      null
    );
  if v_replay is distinct from v_first_ack then
    raise exception
      'historical retry settlement replay drifted after purge';
  end if;

  v_success_replay :=
    careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_success_state.job_id,
      v_success_state.attempt_id,
      v_success_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      v_success_state.fence_id,
      v_success_state.fence_digest,
      v_artifact.canonical_content,
      v_artifact.canonical_content_hash,
      v_artifact.provider_evidence
    );
  v_success_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_success_state.job_id,
      v_success_state.attempt_id,
      v_success_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      v_artifact.canonical_content_hash,
      v_artifact.provider_evidence_hash
    );
  if v_success_replay is distinct from v_success_ack
    or v_success_resolved is distinct from jsonb_build_object(
      'status', 'SUCCEEDED',
      'atomicSuccess', v_success_ack
    )
  then
    raise exception
      'historical retry attempt-2 replay or resolution drifted after purge';
  end if;

  begin
    perform careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_first_state.job_id,
      v_first_state.attempt_id,
      v_first_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      'PROVIDER_PERMANENT',
      null
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_wrong_reason_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_wrong_reason_rejected then
    raise exception
      'historical retry changed failure reason was accepted after purge';
  end if;

  select attempt.* into v_first_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_first_state.attempt_id
    and attempt.job_id = v_first_state.job_id;
  select attempt.* into v_success_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_success_state.attempt_id
    and attempt.job_id = v_success_state.job_id;
  v_stale_evidence := v_artifact.provider_evidence || jsonb_build_object(
    'deadlineAt', careslink_v1_generation._server_time(
      v_first_attempt.acquired_at + interval '20 seconds'
    ),
    'startedAt',
      careslink_v1_generation._server_time(v_first_attempt.acquired_at),
    'finishedAt',
      careslink_v1_generation._server_time(v_first_attempt.acquired_at),
    'durationMs', 0
  );
  begin
    perform careslink_v1_generation.commit_v1_shadow_note_generation_success(
      v_first_state.job_id,
      v_first_state.attempt_id,
      v_first_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      v_first_attempt.fence_id,
      v_first_attempt.fence_digest,
      v_artifact.canonical_content,
      v_artifact.canonical_content_hash,
      v_stale_evidence
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'LEASE_EXPIRED' then
      v_stale_worker_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_stale_worker_rejected then
    raise exception
      'historical retry stale attempt-1 commit was not rejected after purge';
  end if;

  v_recovery :=
    careslink_v1_generation.recover_v1_shadow_note_generation_expired(
      current_setting('careslink.assert.registration_digest'),
      'worker.test.v1',
      current_setting('careslink.assert.worker_policy_digest'),
      current_setting('careslink.assert.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  if v_recovery is distinct from jsonb_build_object(
    'recovered', 0,
    'requeued', 0,
    'failed', 0
  ) then
    raise exception 'historical retry recovery was not empty after purge';
  end if;

  perform careslink_v1_generation._set_owner(
    'b0000000-0000-4000-8000-000000000001'::uuid
  );
  v_mutation_id :=
    'note-generation:' || careslink_v1_generation._sha256_text(
      v_success_state.job_id::text
    );
  if (
      select count(*)
      from careslink_v1_generation.jobs as job
      where job.id = v_success_state.job_id
        and job.status = 'SUCCEEDED'
        and job.attempt_count = 2
        and job.result_document_id::text =
          v_success_ack #>> '{canonical,canonicalId}'
        and job.result_revision_id::text =
          v_success_ack #>> '{canonical,revisionId}'
        and job.result_content_hash = v_artifact.canonical_content_hash
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = v_success_state.job_id
    ) <> 2
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = v_success_state.job_id
        and attempt.status = 'RUNNING'
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.id = v_first_state.attempt_id
        and attempt.status = 'FAILED'
        and attempt.failure_reason = 'PROVIDER_TRANSIENT'
        and attempt.terminal_transaction_id::text =
          v_first_ack #>> '{transaction,transactionId}'
        and attempt.settlement_base_delay_ms = 1000
        and attempt.settlement_jitter_ms = 0
        and attempt.settlement_retry_delay_ms = 1000
        and attempt.canonical_content_hash is null
        and attempt.provider_evidence_hash is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.id = v_success_state.attempt_id
        and attempt.status = 'SUCCEEDED'
        and attempt.terminal_transaction_id::text =
          v_success_ack #>> '{transaction,transactionId}'
        and attempt.canonical_content_hash =
          v_artifact.canonical_content_hash
        and attempt.provider_evidence_hash =
          v_artifact.provider_evidence_hash
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payloads as payload
      where payload.id = v_success_state.payload_id
        and payload.job_id = v_success_state.job_id
        and payload.state = 'PURGED'
        and payload.revoke_reason = 'SUCCEEDED'
        and payload.revoked_at = v_success_attempt.finished_at
        and payload.purge_requested_at = v_success_attempt.finished_at
        and payload.purged_at is not null
        and payload.purge_attempt_count = 1
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.job_id = v_success_state.job_id
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.id = v_success_state.grant_id
        and grant_record.attempt_id = v_success_state.attempt_id
        and grant_record.status = 'CONSUMED'
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.job_id = v_success_state.job_id
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.job_id = v_success_state.job_id
        and evidence.attempt_id = v_success_state.attempt_id
        and evidence.evidence_hash = v_artifact.provider_evidence_hash
        and evidence.evidence = v_artifact.provider_evidence
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.attempt_id = v_first_state.attempt_id
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.payload_id = v_success_state.payload_id
        and outbox.job_id = v_success_state.job_id
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.payload_id = v_success_state.payload_id
        and outbox.job_id = v_success_state.job_id
        and outbox.transaction_id::text =
          v_success_ack #>> '{transaction,transactionId}'
        and outbox.event_reference_hash =
          v_success_ack #>> '{purgeOutboxAcknowledgment,eventReferenceHash}'
        and outbox.reason = 'SUCCEEDED'
        and outbox.status = 'PURGED'
        and outbox.attempt_count = 1
        and outbox.last_attempt_at is not null
        and outbox.completed_at = outbox.last_attempt_at
        and outbox.requested_at = v_success_attempt.finished_at
    ) <> 1
    or (
      select count(*)
      from public.ai_documents as document
      where document.id =
        (v_success_ack #>> '{canonical,canonicalId}')::uuid
    ) <> 1
    or (
      select count(*)
      from public.ai_document_revisions as revision
      where revision.id =
          (v_success_ack #>> '{canonical,revisionId}')::uuid
        and revision.document_id =
          (v_success_ack #>> '{canonical,canonicalId}')::uuid
        and revision.content_hash = v_artifact.canonical_content_hash
        and revision.mutation_id = v_mutation_id
    ) <> 1
    or (
      select count(*)
      from public.ai_document_sync_changes as change
      where change.document_id =
          (v_success_ack #>> '{canonical,canonicalId}')::uuid
        and change.revision_id =
          (v_success_ack #>> '{canonical,revisionId}')::uuid
        and change.last_mutation_id = v_mutation_id
    ) <> 1
    or (
      select count(*)
      from public.ai_document_mutation_receipts as receipt
      where receipt.document_id =
          (v_success_ack #>> '{canonical,canonicalId}')::uuid
        and receipt.revision_id =
          (v_success_ack #>> '{canonical,revisionId}')::uuid
        and receipt.mutation_id = v_mutation_id
    ) <> 1
    or v_first_ack #>> '{payloadMetadata,state}' is distinct from 'AVAILABLE'
    or v_first_ack->'purgeOutboxAcknowledgment' is distinct from 'null'::jsonb
    or v_success_ack #>> '{payloadMetadata,state}' is distinct from 'REVOKED'
    or v_success_ack #>> '{purgeOutboxAcknowledgment,status}' is distinct from
      'ENQUEUED'
  then
    raise exception 'historical retry post-purge side-effect row set drifted';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- A terminal attempt must keep its immutable worker-registration row for
-- historical resolve/settle/success replay. Prove both the exact catalog
-- posture and live enforcement inside rollback-only owner subtransactions.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.attempts no force row level security;
alter table careslink_v1_generation.payload_grants
  no force row level security;
alter table careslink_v1_generation.worker_registrations
  no force row level security;
alter table careslink_v1_generation.worker_registration_provider_policies
  no force row level security;

do $$
declare
  v_registration_digest text :=
    current_setting('careslink.assert.registration_digest');
  v_attempt_id uuid;
  v_attempt_count bigint;
  v_grant_count bigint;
  v_binding_count bigint;
  v_constraint_name text;
  v_orphan_rejected boolean := false;
  v_delete_restricted boolean := false;
begin
  if (
    select count(*)
    from pg_constraint as constraint_metadata
    where constraint_metadata.conname =
        'attempts_registration_catalog_fk'
      and constraint_metadata.contype = 'f'
      and constraint_metadata.conrelid =
        'careslink_v1_generation.attempts'::regclass
      and constraint_metadata.confrelid =
        'careslink_v1_generation.worker_registrations'::regclass
      and constraint_metadata.convalidated is true
      and constraint_metadata.condeferrable is false
      and constraint_metadata.condeferred is false
      and constraint_metadata.confupdtype = 'r'
      and constraint_metadata.confdeltype = 'r'
      and constraint_metadata.conkey = array[
        (
          select attribute.attnum
          from pg_attribute as attribute
          where attribute.attrelid =
              'careslink_v1_generation.attempts'::regclass
            and attribute.attname = 'registration_digest'
            and not attribute.attisdropped
        )
      ]::smallint[]
      and constraint_metadata.confkey = array[
        (
          select attribute.attnum
          from pg_attribute as attribute
          where attribute.attrelid =
              'careslink_v1_generation.worker_registrations'::regclass
            and attribute.attname = 'registration_digest'
            and not attribute.attisdropped
        )
      ]::smallint[]
  ) <> 1
    or (
      select count(*)
      from pg_index as index_metadata
      join pg_class as index_relation
        on index_relation.oid = index_metadata.indexrelid
      join pg_am as access_method
        on access_method.oid = index_relation.relam
      where index_metadata.indrelid =
          'careslink_v1_generation.attempts'::regclass
        and index_relation.relname = 'attempts_registration_digest_idx'
        and index_relation.relnamespace =
          'careslink_v1_generation'::regnamespace
        and index_relation.relowner =
          'careslink_v1_generation_owner'::regrole
        and access_method.amname = 'btree'
        and index_metadata.indisvalid is true
        and index_metadata.indisready is true
        and index_metadata.indisunique is false
        and index_metadata.indisprimary is false
        and index_metadata.indnkeyatts = 1
        and index_metadata.indnatts = 1
        and index_metadata.indkey[0] = (
          select attribute.attnum
          from pg_attribute as attribute
          where attribute.attrelid =
              'careslink_v1_generation.attempts'::regclass
            and attribute.attname = 'registration_digest'
            and not attribute.attisdropped
        )
        and index_metadata.indexprs is null
        and index_metadata.indpred is null
    ) <> 1
  then
    raise exception 'registration retention catalog posture drifted';
  end if;

  select attempt.id
  into v_attempt_id
  from careslink_v1_generation.attempts as attempt
  where attempt.registration_digest = v_registration_digest
  order by attempt.created_at, attempt.id
  limit 1;
  select count(*) into v_attempt_count
  from careslink_v1_generation.attempts as attempt
  where attempt.registration_digest = v_registration_digest;
  select count(*) into v_grant_count
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.registration_digest = v_registration_digest;
  select count(*) into v_binding_count
  from careslink_v1_generation.worker_registration_provider_policies
    as binding
  where binding.registration_digest = v_registration_digest;

  if v_attempt_id is null
    or v_attempt_count < 1
    or v_binding_count <> 5
    or (
      select count(*)
      from careslink_v1_generation.worker_registrations as registration
      where registration.registration_digest = v_registration_digest
    ) <> 1
  then
    raise exception 'registration retention proof fixture drifted';
  end if;

  begin
    update careslink_v1_generation.attempts as attempt
    set registration_digest = repeat('f', 64)
    where attempt.id = v_attempt_id
      and attempt.registration_digest = v_registration_digest
      and not exists (
        select 1
        from careslink_v1_generation.worker_registrations as registration
        where registration.registration_digest = repeat('f', 64)
      );
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'attempts_registration_catalog_fk' then
      v_orphan_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_orphan_rejected then
    raise exception 'unregistered historical attempt digest was accepted';
  end if;

  begin
    delete from careslink_v1_generation.payload_grants as grant_record
    where grant_record.registration_digest = v_registration_digest;

    delete from careslink_v1_generation.worker_registrations as registration
    where registration.registration_digest = v_registration_digest;
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = 'attempts_registration_catalog_fk' then
      v_delete_restricted := true;
    else
      raise;
    end if;
  end;
  if not v_delete_restricted then
    raise exception
      'referenced worker registration delete was not restricted by attempt history';
  end if;

  if (
      select count(*)
      from careslink_v1_generation.worker_registrations as registration
      where registration.registration_digest = v_registration_digest
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_provider_policies
        as binding
      where binding.registration_digest = v_registration_digest
    ) <> v_binding_count
    or (
      select count(*)
      from careslink_v1_generation.attempts as attempt
      where attempt.registration_digest = v_registration_digest
    ) <> v_attempt_count
    or (
      select count(*)
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.registration_digest = v_registration_digest
    ) <> v_grant_count
  then
    raise exception 'registration retention rollback changed historical rows';
  end if;
end
$$;

alter table careslink_v1_generation.worker_registration_provider_policies
  force row level security;
alter table careslink_v1_generation.worker_registrations
  force row level security;
alter table careslink_v1_generation.payload_grants force row level security;
alter table careslink_v1_generation.attempts force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Revoke the shared TEST_ONLY proof only after every fresh-authority scenario
-- has completed. Authorize must re-read it and atomically settle the still-
-- running late-failure attempt as PRIVACY_REVIEW_STALE.
update public.privacy_reviews
set status = 'REVOKED'
where id = 'b2000000-0000-4000-8000-000000000001'::uuid
  and owner_user_id = 'b0000000-0000-4000-8000-000000000001'::uuid
  and status = 'CONFIRMED';

set local role careslink_v1_generation_executor;

do $$
declare
  v_state rpc_assertion_state%rowtype;
  v_denied jsonb;
  v_replay jsonb;
  v_resolved jsonb;
begin
  select state.* into v_state
  from rpc_assertion_state as state
  where state.scenario = 'atomic-rollback';

  v_denied :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_state.job_id,
      v_state.payload_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest')
    );
  v_replay :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_state.job_id,
      v_state.payload_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest')
    );

  if v_denied->>'status' is distinct from 'DENIED_SETTLED'
    or v_denied->>'reason' is distinct from 'PRIVACY_REVIEW_STALE'
    or v_denied->>'transactionStatus' is distinct from 'COMMITTED'
    or (v_denied->>'atomic')::boolean is not true
    or v_denied->>'jobStatus' is distinct from 'FAILED'
    or v_denied->>'attemptStatus' is distinct from 'FAILED'
    or v_denied->>'payloadState' is distinct from 'REVOKED'
    or v_denied->>'payloadDisposition' is distinct from
      'REVOKED_PURGE_ENQUEUED'
    or v_denied::text ~*
      'vaultGrant|vault|locator|rawFacts|canonicalContent|providerEvidence'
    or v_replay is distinct from v_denied
    or (
      select count(*)
      from careslink_v1_generation.provider_evidence
      where attempt_id = v_state.attempt_id
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
      where payload_id = v_state.payload_id
        and reason = 'FAILED'
    ) <> 1
  then
    raise exception 'fresh-privacy denial was not atomic and replayable';
  end if;

  v_resolved :=
    careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  if v_resolved->>'status' is distinct from 'FAILED'
    or v_resolved #>> '{atomicSettlement,settlement,reason}' is distinct from
      'PRIVACY_REVIEW_STALE'
  then
    raise exception 'fresh-privacy denial resolution drifted';
  end if;
end
$$;

-- Cross-job credentials cannot resolve another attempt. Canonical RLS is
-- scoped by the database-owned owner GUC: owner B cannot observe owner A's
-- two successful documents, while switching back restores exactly those rows.
do $$
declare
  v_success rpc_assertion_state%rowtype;
  v_failure rpc_assertion_state%rowtype;
  v_cross_binding_rejected boolean := false;
begin
  select state.* into v_success
  from rpc_assertion_state as state
  where state.scenario = 'success';
  select state.* into v_failure
  from rpc_assertion_state as state
  where state.scenario = 'failure';

  begin
    perform careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
      v_success.job_id,
      v_failure.attempt_id,
      v_failure.lease_token,
      current_setting('careslink.assert.registration_digest'),
      null,
      null
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POLICY_MISMATCH' then
      v_cross_binding_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_cross_binding_rejected then
    raise exception 'cross-job attempt binding was accepted';
  end if;

  perform careslink_v1_generation._set_owner(
    'b0000000-0000-4000-8000-000000000002'::uuid
  );
  if (select count(*) from public.ai_documents) <> 0
    or (select count(*) from public.ai_document_revisions) <> 0
    or (select count(*) from public.ai_document_sync_changes) <> 0
    or (select count(*) from public.ai_document_mutation_receipts) <> 0
  then
    raise exception 'owner B observed owner A canonical rows';
  end if;

  perform careslink_v1_generation._set_owner(
    'b0000000-0000-4000-8000-000000000001'::uuid
  );
  if (select count(*) from public.ai_documents) <> 2
    or (select count(*) from public.ai_document_revisions) <> 2
    or (select count(*) from public.ai_document_sync_changes) <> 2
    or (select count(*) from public.ai_document_mutation_receipts) <> 2
  then
    raise exception 'owner A canonical success row set drifted';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Note generation must not touch any wallet, lot, reservation, allocation or
-- ledger row. Compare the complete table counts captured before all RPCs.
do $$
declare
  v_snapshot record;
  v_current bigint;
begin
  for v_snapshot in
    select object_name, row_count
    from rpc_assertion_point_snapshot
    order by object_name
  loop
    v_current := case v_snapshot.object_name
      when 'point_wallets' then
        (select count(*) from public.point_wallets)
      when 'point_lots' then
        (select count(*) from public.point_lots)
      when 'point_reservations' then
        (select count(*) from public.point_reservations)
      when 'point_reservation_allocations' then
        (select count(*) from public.point_reservation_allocations)
      when 'point_ledger_entries' then
        (select count(*) from public.point_ledger_entries)
      else null
    end;

    if v_current is distinct from v_snapshot.row_count then
      raise exception 'worker RPC changed Points object %: % -> %',
        v_snapshot.object_name,
        v_snapshot.row_count,
        v_current;
    end if;
  end loop;
end
$$;

-- Restore and reassert the hard-off source posture before rolling the entire
-- request back. The constraint and all fixture values are transaction-local.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.settings no force row level security;
update careslink_v1_generation.settings
set enabled = false,
    updated_at = date_trunc('milliseconds', transaction_timestamp())
where capability = 'note_generation_v1';
alter table careslink_v1_generation.settings
  add constraint settings_enabled_check check (enabled = false);
alter table careslink_v1_generation.settings force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The hosted migration actor is not assumed to be superuser and owns neither
-- the private tables nor their SELECT grants. Re-enter the narrowly privileged
-- executor for the final hard-off row read, then immediately leave it.
set local role careslink_v1_generation_executor;
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
begin
  if (
    select count(*)
    from careslink_v1_generation.settings
    where capability = 'note_generation_v1'
      and enabled is false
      and shadow_only is true
  ) <> 1
    or exists (
      select 1
      from pg_class as relation
      where relation.relnamespace = v_schema
        and relation.relkind = 'r'
        and (
          not relation.relrowsecurity
          or not relation.relforcerowsecurity
        )
    )
    or exists (
      select 1
      from pg_trigger as trigger_metadata
      where trigger_metadata.tgname = 'test_only_fail_v1_worker_rpc_late'
        and not trigger_metadata.tgisinternal
    )
  then
    raise exception 'assertion did not restore hard-off/RLS/fault scaffolding';
  end if;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

revoke careslink_v1_generation_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_owner from current_user
  granted by current_user;

rollback;
