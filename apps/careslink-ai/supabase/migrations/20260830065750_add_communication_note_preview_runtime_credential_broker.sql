-- Communication Note Preview durable runtime-credential broker and terminal fence.
--
-- Additive, source-only and default-off. This migration creates durable metadata
-- tombstones and lifecycle functions for a short-lived, purpose-scoped runtime
-- login. It never stores a raw password, SCRAM verifier or DSN. The existing
-- three-argument runner-terminal RPC remains the only caller-facing entry point;
-- its new transaction-level shared fence serializes terminal writes against the
-- broker's exclusive tombstone/finalize fence.
-- The client transaction never issues SET ROLE: outside SECURITY DEFINER
-- functions current_user=session_user is the runtime LOGIN. The terminal
-- wrapper deliberately executes as its executor owner while session_user stays
-- the runtime LOGIN. The LOGIN inherits the terminal caller capability through
-- ADMIN FALSE / INHERIT TRUE / SET FALSE, so it cannot become the static caller
-- or transfer object ownership to it.
-- PostgreSQL's automatic creator ADMIN edge is accepted only in its inert
-- super-grantor / postgres-member / INHERIT FALSE / SET FALSE shape.
--
-- The migration intentionally requires the Supabase Hosted management posture:
-- postgres is not a superuser, but has CREATEROLE, BYPASSRLS, pg_signal_backend
-- and pg_read_all_stats. It remains unapplied until a separately authorized,
-- disposable no-data Preview proves the PostgreSQL 17 and Hosted-specific edges.

begin;

select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

do $careslink_v1_runtime_broker_setup_guard$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 not in (16, 17)
    or pg_catalog.current_setting(
      'max_prepared_transactions'
    )::pg_catalog.int4 <> 0
    or not coalesce((
      select not role_record.rolsuper
        and role_record.rolcreaterole
        and role_record.rolbypassrls
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = current_user
    ), false)
    or not pg_catalog.pg_has_role(
      current_user, 'pg_signal_backend', 'USAGE'
    )
    or not pg_catalog.pg_has_role(
      current_user, 'pg_read_all_stats', 'USAGE'
    )
    or pg_catalog.to_regnamespace(
      'careslink_v1_runtime_broker'
    ) is not null
    or pg_catalog.to_regrole(
      'careslink_v1_preview_runner_terminal_caller'
    ) is null
    or pg_catalog.to_regrole(
      'careslink_v1_preview_runner_terminal_executor'
    ) is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'careslink_v1_generation'
        and procedure.proname =
          'persist_verified_communication_note_preview_runner_terminal'
        and procedure.prokind = 'f'
        and procedure.pronargs = 3
        and procedure.proargtypes[0] =
          'pg_catalog.jsonb'::pg_catalog.regtype
        and procedure.proargtypes[1] =
          'pg_catalog.text'::pg_catalog.regtype
        and procedure.proargtypes[2] =
          'pg_catalog.text'::pg_catalog.regtype
        and procedure.prorettype =
          'pg_catalog.jsonb'::pg_catalog.regtype
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'v1_shadow_content_sha256'
        and procedure.prokind = 'f'
        and procedure.pronargs = 1
        and procedure.proargtypes[0] =
          'pg_catalog.jsonb'::pg_catalog.regtype
        and procedure.prorettype =
          'pg_catalog.text'::pg_catalog.regtype
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'extensions'
        and procedure.proname = 'digest'
        and procedure.prokind = 'f'
        and procedure.pronargs = 2
        and procedure.proargtypes[0] =
          'pg_catalog.bytea'::pg_catalog.regtype
        and procedure.proargtypes[1] =
          'pg_catalog.text'::pg_catalog.regtype
        and procedure.prorettype =
          'pg_catalog.bytea'::pg_catalog.regtype
    ) <> 1
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_SETUP_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(array[
      'anon', 'authenticated', 'service_role', 'authenticator'
    ]::pg_catalog.text[]) as required_role(role_name)
    where pg_catalog.to_regrole(required_role.role_name) is null
  ) then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_API_ROLE_MISSING';
  end if;
end
$careslink_v1_runtime_broker_setup_guard$;

do $careslink_v1_terminal_predecessor_guard$
declare
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_executor pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_executor'
  );
  v_database pg_catalog.oid := (
    select database_record.oid
    from pg_catalog.pg_database as database_record
    where database_record.datname = pg_catalog.current_database()
  );
  v_generation_schema pg_catalog.oid := pg_catalog.to_regnamespace(
    'careslink_v1_generation'
  );
  v_terminal pg_catalog.oid;
begin
  select procedure.oid
  into v_terminal
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'careslink_v1_generation'
    and procedure.proname =
      'persist_verified_communication_note_preview_runner_terminal'
    and procedure.prokind = 'f'
    and procedure.pronargs = 3
    and procedure.proargtypes[0] =
      'pg_catalog.jsonb'::pg_catalog.regtype
    and procedure.proargtypes[1] =
      'pg_catalog.text'::pg_catalog.regtype
    and procedure.proargtypes[2] =
      'pg_catalog.text'::pg_catalog.regtype;

  if not found or v_caller is null or v_executor is null
    or v_database is null or v_generation_schema is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_caller
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = -1
        and role_record.rolvaliduntil is null
        and role_record.rolconfig is null
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and dependency.deptype = 'o'
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and dependency.deptype = 'a'
    ) <> 2
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and dependency.deptype = 'a'
        and dependency.dbid = v_database
        and dependency.classid =
          'pg_catalog.pg_namespace'::pg_catalog.regclass
        and dependency.objid = v_generation_schema
        and dependency.objsubid = 0
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and dependency.deptype = 'a'
        and dependency.dbid = v_database
        and dependency.classid =
          'pg_catalog.pg_proc'::pg_catalog.regclass
        and dependency.objid = v_terminal
        and dependency.objsubid = 0
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and not (
          dependency.deptype = 'a'
          and dependency.dbid = v_database
          and dependency.objsubid = 0
          and (
            (
              dependency.classid =
                'pg_catalog.pg_namespace'::pg_catalog.regclass
              and dependency.objid = v_generation_schema
            )
            or (
              dependency.classid =
                'pg_catalog.pg_proc'::pg_catalog.regclass
              and dependency.objid = v_terminal
            )
          )
        )
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = v_terminal
        and procedure.proowner = v_executor
        and procedure.prosecdef
        and procedure.provolatile = 'v'
        and procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      where procedure.oid = v_terminal
        and acl.privilege_type = 'EXECUTE'
    ) <> 2
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      where procedure.oid = v_terminal
        and acl.privilege_type = 'EXECUTE'
        and (
          acl.grantee not in (v_executor, v_caller)
          or acl.grantor <> v_executor
          or acl.is_grantable
        )
    )
    or not pg_catalog.has_function_privilege(
      v_executor, v_terminal, 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      v_caller, v_terminal, 'EXECUTE'
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid in (v_executor, v_caller)
        or membership.member in (v_executor, v_caller)
    ) <> 2
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where (
          membership.roleid in (v_executor, v_caller)
          or membership.member in (v_executor, v_caller)
        )
        and not (
          membership.roleid in (v_executor, v_caller)
          and membership.member = pg_catalog.to_regrole('postgres')
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
    )
  then
    raise exception 'RUNTIME_CREDENTIAL_TERMINAL_PREDECESSOR_UNSAFE';
  end if;
end
$careslink_v1_terminal_predecessor_guard$;

create schema careslink_v1_runtime_broker authorization postgres;

revoke all on schema careslink_v1_runtime_broker
from public, anon, authenticated, service_role, authenticator;

create table careslink_v1_runtime_broker.acquisitions (
  acquisition_digest pg_catalog.text primary key,
  authorization_digest pg_catalog.text,
  run_id_hash pg_catalog.text,
  database_target_digest pg_catalog.text,
  caller_identity_hmac pg_catalog.text,
  fence_token pg_catalog.int8 generated always as identity unique,
  state pg_catalog.text not null,
  runtime_role pg_catalog.text unique,
  runtime_role_oid pg_catalog.oid,
  lease_reference_sha256 pg_catalog.text unique,
  session_binding_sha256 pg_catalog.text unique,
  credential_verifier_sha256 pg_catalog.text unique,
  issued_at pg_catalog.timestamptz,
  expires_at pg_catalog.timestamptz,
  bound_backend_pid pg_catalog.int4,
  bound_backend_start pg_catalog.timestamptz,
  bound_at pg_catalog.timestamptz,
  tombstoned_at pg_catalog.timestamptz,
  tombstone_transaction_id pg_catalog.text,
  future_issuance_blocked pg_catalog.bool not null default false,
  revoked_at pg_catalog.timestamptz,
  reported_session_disposition pg_catalog.text,
  reported_credential_disposition pg_catalog.text,
  receipt_digest pg_catalog.text unique,
  reusable pg_catalog.bool not null default false,
  raw_credential_material_present pg_catalog.bool not null default false,
  created_at pg_catalog.timestamptz not null,
  updated_at pg_catalog.timestamptz not null,
  constraint runtime_credential_broker_digest_check check (
    acquisition_digest ~ '^[a-f0-9]{64}$'
    and (
      authorization_digest is null
      or authorization_digest ~ '^[a-f0-9]{64}$'
    )
    and (
      run_id_hash is null
      or run_id_hash ~ '^[a-f0-9]{64}$'
    )
    and (
      database_target_digest is null
      or database_target_digest ~ '^[a-f0-9]{64}$'
    )
    and (
      caller_identity_hmac is null
      or caller_identity_hmac ~ '^[a-f0-9]{64}$'
    )
    and (
      lease_reference_sha256 is null
      or lease_reference_sha256 ~ '^[a-f0-9]{64}$'
    )
    and (
      session_binding_sha256 is null
      or session_binding_sha256 ~ '^[a-f0-9]{64}$'
    )
    and (
      credential_verifier_sha256 is null
      or credential_verifier_sha256 ~ '^[a-f0-9]{64}$'
    )
    and (
      receipt_digest is null
      or receipt_digest ~ '^[a-f0-9]{64}$'
    )
  ),
  constraint runtime_credential_broker_runtime_role_check check (
    runtime_role is null
    or runtime_role =
      'careslink_v1_preview_runner_terminal_runtime_' ||
      pg_catalog.substr(acquisition_digest, 1, 16)
  ),
  constraint runtime_credential_broker_statement_binding_check check (
    (
      authorization_digest is null
      and run_id_hash is null
      and database_target_digest is null
      and caller_identity_hmac is null
    )
    or (
      authorization_digest is not null
      and run_id_hash is not null
      and database_target_digest is not null
      and caller_identity_hmac is not null
    )
  ),
  constraint runtime_credential_broker_identity_bundle_check check (
    (
      runtime_role is null
      and runtime_role_oid is null
      and lease_reference_sha256 is null
      and session_binding_sha256 is null
      and credential_verifier_sha256 is null
      and issued_at is null
      and expires_at is null
    )
    or (
      runtime_role is not null
      and runtime_role_oid is not null
      and lease_reference_sha256 is not null
      and session_binding_sha256 is not null
      and credential_verifier_sha256 is not null
      and issued_at is not null
      and expires_at is not null
      and expires_at > issued_at
      and expires_at <= issued_at + pg_catalog.make_interval(secs => 90)
      and acquisition_digest <> lease_reference_sha256
      and acquisition_digest <> session_binding_sha256
      and acquisition_digest <> credential_verifier_sha256
      and lease_reference_sha256 <> session_binding_sha256
      and lease_reference_sha256 <> credential_verifier_sha256
      and session_binding_sha256 <> credential_verifier_sha256
    )
  ),
  constraint runtime_credential_broker_bound_session_check check (
    (
      bound_backend_pid is null
      and bound_backend_start is null
      and bound_at is null
    )
    or (
      bound_backend_pid > 0
      and bound_backend_start is not null
      and bound_at is not null
      and issued_at is not null
      and bound_backend_start >= issued_at - pg_catalog.make_interval(secs => 5)
      and bound_at >= issued_at
    )
  ),
  constraint runtime_credential_broker_tombstone_check check (
    (
      tombstoned_at is null
      and tombstone_transaction_id is null
      and future_issuance_blocked is false
    )
    or (
      tombstoned_at is not null
      and tombstone_transaction_id ~ '^[1-9][0-9]*$'
      and future_issuance_blocked is true
    )
  ),
  constraint runtime_credential_broker_release_check check (
    (
      revoked_at is null
      and reported_session_disposition is null
      and reported_credential_disposition is null
      and receipt_digest is null
    )
    or (
      revoked_at is not null
      and tombstoned_at is not null
      and revoked_at >= tombstoned_at
      and receipt_digest is not null
      and (
        (
          issued_at is null
          and reported_session_disposition = 'NOT_ACQUIRED'
          and reported_credential_disposition = 'NOT_ISSUED'
        )
        or (
          issued_at is not null
          and reported_session_disposition = 'DESTROYED'
          and reported_credential_disposition = 'REVOKED'
        )
      )
    )
  ),
  constraint runtime_credential_broker_state_check check (
    (
      state = 'RESERVED'
      and issued_at is null
      and bound_at is null
      and tombstoned_at is null
      and revoked_at is null
    )
    or (
      state = 'ISSUED_UNBOUND'
      and issued_at is not null
      and bound_at is null
      and tombstoned_at is null
      and revoked_at is null
    )
    or (
      state = 'ACTIVE'
      and issued_at is not null
      and bound_at is not null
      and tombstoned_at is null
      and revoked_at is null
    )
    or (
      state = 'TOMBSTONED'
      and tombstoned_at is not null
      and revoked_at is null
    )
    or (
      state = 'REVOKED'
      and tombstoned_at is not null
      and revoked_at is not null
    )
  ),
  constraint runtime_credential_broker_safety_check check (
    reusable is false and raw_credential_material_present is false
  ),
  constraint runtime_credential_broker_clock_check check (
    updated_at >= created_at
    and (issued_at is null or issued_at >= created_at)
    and (bound_at is null or bound_at >= issued_at)
    and (tombstoned_at is null or tombstoned_at >= created_at)
  )
);

create unique index runtime_credential_broker_active_runtime_oid_unique
on careslink_v1_runtime_broker.acquisitions (runtime_role_oid)
where runtime_role_oid is not null and state <> 'REVOKED';

alter table careslink_v1_runtime_broker.acquisitions
  enable row level security;
alter table careslink_v1_runtime_broker.acquisitions
  force row level security;

revoke all on table careslink_v1_runtime_broker.acquisitions
from public, anon, authenticated, service_role, authenticator;
revoke all on sequence
  careslink_v1_runtime_broker.acquisitions_fence_token_seq
from public, anon, authenticated, service_role, authenticator;
revoke all on type careslink_v1_runtime_broker.acquisitions
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_preview_runner_terminal_caller;

grant usage on schema careslink_v1_runtime_broker
  to careslink_v1_preview_runner_terminal_executor;
grant select on table careslink_v1_runtime_broker.acquisitions
  to careslink_v1_preview_runner_terminal_executor;
grant usage on type careslink_v1_runtime_broker.acquisitions
  to careslink_v1_preview_runner_terminal_executor;

create policy runtime_credential_broker_terminal_session_select
on careslink_v1_runtime_broker.acquisitions
for select
to careslink_v1_preview_runner_terminal_executor
using (runtime_role = session_user);

alter default privileges for role postgres
in schema careslink_v1_runtime_broker
revoke execute on functions from public, anon, authenticated, service_role,
  authenticator, careslink_v1_preview_runner_terminal_caller;
alter default privileges for role postgres
in schema careslink_v1_runtime_broker
revoke all on tables from public, anon, authenticated, service_role,
  authenticator, careslink_v1_preview_runner_terminal_caller;
alter default privileges for role postgres
in schema careslink_v1_runtime_broker
revoke all on sequences from public, anon, authenticated, service_role,
  authenticator, careslink_v1_preview_runner_terminal_caller;
alter default privileges for role postgres
in schema careslink_v1_runtime_broker
revoke all on types from public, anon, authenticated, service_role,
  authenticator, careslink_v1_preview_runner_terminal_caller;

create function careslink_v1_runtime_broker._assert_management_session()
returns pg_catalog.void
language plpgsql
volatile
security invoker
set search_path = ''
as $runtime_credential_broker$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runtime-credential-broker-management'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 not in (16, 17)
    or pg_catalog.current_setting(
      'max_prepared_transactions'
    )::pg_catalog.int4 <> 0
    or not coalesce((
      select not role_record.rolsuper
        and role_record.rolcreaterole
        and role_record.rolbypassrls
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = current_user
    ), false)
    or not pg_catalog.pg_has_role(
      current_user, 'pg_signal_backend', 'USAGE'
    )
    or not pg_catalog.pg_has_role(
      current_user, 'pg_read_all_stats', 'USAGE'
    )
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_MANAGEMENT_UNSAFE';
  end if;

  perform pg_catalog.set_config('lock_timeout', '5s', true);
end
$runtime_credential_broker$;

create function careslink_v1_runtime_broker._guard_transition()
returns pg_catalog.trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $runtime_credential_broker$
begin
  if tg_op = 'DELETE' then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_DELETE_DENIED';
  end if;

  if new.acquisition_digest is distinct from old.acquisition_digest
    or new.fence_token is distinct from old.fence_token
    or new.authorization_digest is distinct from old.authorization_digest
    or new.run_id_hash is distinct from old.run_id_hash
    or new.database_target_digest is distinct from old.database_target_digest
    or new.caller_identity_hmac is distinct from old.caller_identity_hmac
    or (
      old.runtime_role is not null
      and (
        new.runtime_role is distinct from old.runtime_role
        or new.runtime_role_oid is distinct from old.runtime_role_oid
        or new.lease_reference_sha256 is distinct from
          old.lease_reference_sha256
        or new.session_binding_sha256 is distinct from
          old.session_binding_sha256
        or new.credential_verifier_sha256 is distinct from
          old.credential_verifier_sha256
        or new.issued_at is distinct from old.issued_at
        or new.expires_at is distinct from old.expires_at
      )
    )
    or (
      old.bound_at is not null
      and (
        new.bound_backend_pid is distinct from old.bound_backend_pid
        or new.bound_backend_start is distinct from old.bound_backend_start
        or new.bound_at is distinct from old.bound_at
      )
    )
    or (
      old.tombstoned_at is not null
      and (
        new.tombstoned_at is distinct from old.tombstoned_at
        or new.tombstone_transaction_id is distinct from
          old.tombstone_transaction_id
        or new.future_issuance_blocked is distinct from true
      )
    )
    or (
      old.revoked_at is not null
      and new is distinct from old
    )
    or not (
      new.state = old.state
      or (old.state = 'RESERVED' and new.state = 'ISSUED_UNBOUND')
      or (old.state = 'ISSUED_UNBOUND' and new.state = 'ACTIVE')
      or (
        old.state in ('RESERVED', 'ISSUED_UNBOUND', 'ACTIVE')
        and new.state = 'TOMBSTONED'
      )
      or (old.state = 'TOMBSTONED' and new.state = 'REVOKED')
    )
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_TRANSITION_DENIED';
  end if;

  return new;
end
$runtime_credential_broker$;

create function careslink_v1_runtime_broker._deny_truncate()
returns pg_catalog.trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $runtime_credential_broker$
begin
  raise exception 'RUNTIME_CREDENTIAL_BROKER_TRUNCATE_DENIED';
end
$runtime_credential_broker$;

create trigger runtime_credential_broker_transition_guard
before update or delete
on careslink_v1_runtime_broker.acquisitions
for each row execute function
  careslink_v1_runtime_broker._guard_transition();

create trigger runtime_credential_broker_truncate_guard
before truncate
on careslink_v1_runtime_broker.acquisitions
for each statement execute function
  careslink_v1_runtime_broker._deny_truncate();

create function careslink_v1_runtime_broker.acquire(
  p_acquisition_digest pg_catalog.text,
  p_authorization_digest pg_catalog.text,
  p_run_id_hash pg_catalog.text,
  p_database_target_digest pg_catalog.text,
  p_caller_identity_hmac pg_catalog.text,
  p_runtime_role pg_catalog.text,
  p_lease_reference_sha256 pg_catalog.text,
  p_session_binding_sha256 pg_catalog.text,
  p_scram_verifier pg_catalog.text,
  p_credential_verifier_sha256 pg_catalog.text,
  p_expires_at pg_catalog.timestamptz
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $runtime_credential_broker$
declare
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_existing careslink_v1_runtime_broker.acquisitions%rowtype;
  v_fence_token pg_catalog.int8;
  v_issued_at pg_catalog.timestamptz;
  v_runtime_oid pg_catalog.oid;
  v_terminal_oid pg_catalog.oid;
  v_expires_at_text pg_catalog.text;
begin
  perform careslink_v1_runtime_broker._assert_management_session();

  if not coalesce(
      p_acquisition_digest ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(p_authorization_digest ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_run_id_hash ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_database_target_digest ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_caller_identity_hmac ~ '^[a-f0-9]{64}$', false)
    or p_runtime_role is distinct from
      'careslink_v1_preview_runner_terminal_runtime_' ||
      pg_catalog.substr(p_acquisition_digest, 1, 16)
    or not coalesce(
      p_lease_reference_sha256 ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(
      p_session_binding_sha256 ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(
      p_credential_verifier_sha256 ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(
      p_scram_verifier ~
        '^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]{22}==[$][A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$',
      false
    )
    or p_credential_verifier_sha256 <> pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(p_scram_verifier, 'UTF8'), 'sha256'
      ),
      'hex'
    )
    or pg_catalog.cardinality(array[
      p_acquisition_digest,
      p_lease_reference_sha256,
      p_session_binding_sha256,
      p_credential_verifier_sha256
    ]::pg_catalog.text[]) <> 4
    or (
      select pg_catalog.count(distinct identity_value)
      from pg_catalog.unnest(array[
        p_acquisition_digest,
        p_lease_reference_sha256,
        p_session_binding_sha256,
        p_credential_verifier_sha256
      ]::pg_catalog.text[]) as identity(identity_value)
    ) <> 4
    or p_expires_at is distinct from
      pg_catalog.date_trunc('milliseconds', p_expires_at)
    or p_expires_at is null
    or v_caller is null
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_ACQUIRE_INVALID';
  end if;

  select procedure.oid
  into v_terminal_oid
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'careslink_v1_generation'
    and procedure.proname =
      'persist_verified_communication_note_preview_runner_terminal'
    and procedure.prokind = 'f'
    and procedure.pronargs = 3
    and procedure.proargtypes[0] =
      'pg_catalog.jsonb'::pg_catalog.regtype
    and procedure.proargtypes[1] =
      'pg_catalog.text'::pg_catalog.regtype
    and procedure.proargtypes[2] =
      'pg_catalog.text'::pg_catalog.regtype
    and procedure.prorettype =
      'pg_catalog.jsonb'::pg_catalog.regtype;
  if not found then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_TERMINAL_MISSING';
  end if;

  perform careslink_v1_runtime_broker._assert_terminal_static_posture();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );

  v_issued_at := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  if p_expires_at < v_issued_at + pg_catalog.make_interval(secs => 45)
    or p_expires_at > v_issued_at + pg_catalog.make_interval(secs => 90)
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_ACQUIRE_EXPIRY_INVALID';
  end if;

  select acquisition.*
  into v_existing
  from careslink_v1_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = p_acquisition_digest
  for update;

  if found then
    if v_existing.state in ('TOMBSTONED', 'REVOKED')
      or v_existing.future_issuance_blocked
    then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_ACQUIRE_TOMBSTONED';
    end if;

    if v_existing.runtime_role = p_runtime_role
      and v_existing.authorization_digest = p_authorization_digest
      and v_existing.run_id_hash = p_run_id_hash
      and v_existing.database_target_digest = p_database_target_digest
      and v_existing.caller_identity_hmac = p_caller_identity_hmac
      and v_existing.lease_reference_sha256 = p_lease_reference_sha256
      and v_existing.session_binding_sha256 = p_session_binding_sha256
      and v_existing.credential_verifier_sha256 =
        p_credential_verifier_sha256
      and v_existing.expires_at = p_expires_at
      and v_existing.state in ('ISSUED_UNBOUND', 'ACTIVE')
    then
      raise exception
        'RUNTIME_CREDENTIAL_BROKER_ALREADY_ISSUED_REQUIRES_REVOKE';
    end if;

    raise exception 'RUNTIME_CREDENTIAL_BROKER_ACQUIRE_CONFLICT';
  end if;

  if pg_catalog.to_regrole(p_runtime_role) is not null then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_RUNTIME_ROLE_CONFLICT';
  end if;

  insert into careslink_v1_runtime_broker.acquisitions (
    acquisition_digest,
    authorization_digest,
    run_id_hash,
    database_target_digest,
    caller_identity_hmac,
    state,
    future_issuance_blocked,
    reusable,
    raw_credential_material_present,
    created_at,
    updated_at
  ) values (
    p_acquisition_digest,
    p_authorization_digest,
    p_run_id_hash,
    p_database_target_digest,
    p_caller_identity_hmac,
    'RESERVED',
    false,
    false,
    false,
    v_issued_at,
    v_issued_at
  )
  returning fence_token into v_fence_token;

  v_expires_at_text := pg_catalog.to_char(
    p_expires_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  execute pg_catalog.format(
    'create role %I with login nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls connection limit 1 password %L valid until %L',
    p_runtime_role,
    p_scram_verifier,
    v_expires_at_text
  );
  p_scram_verifier := null;

  execute pg_catalog.format(
    'alter role %I set statement_timeout = %L',
    p_runtime_role,
    '5s'
  );
  execute pg_catalog.format(
    'alter role %I set lock_timeout = %L',
    p_runtime_role,
    '1s'
  );
  execute pg_catalog.format(
    'alter role %I set idle_in_transaction_session_timeout = %L',
    p_runtime_role,
    '5s'
  );
  execute pg_catalog.format(
    'alter role %I set idle_session_timeout = %L',
    p_runtime_role,
    '5s'
  );
  execute pg_catalog.format(
    'grant careslink_v1_preview_runner_terminal_caller to %I with admin false, inherit true, set false',
    p_runtime_role
  );

  v_runtime_oid := pg_catalog.to_regrole(p_runtime_role);
  perform careslink_v1_runtime_broker._assert_runtime_privilege_posture(
    v_runtime_oid
  );
  if v_runtime_oid is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runtime_oid
        and role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = 1
        and role_record.rolvaliduntil = p_expires_at
        and role_record.rolconfig @> array[
          'statement_timeout=5s',
          'lock_timeout=1s',
          'idle_in_transaction_session_timeout=5s',
          'idle_session_timeout=5s'
        ]::pg_catalog.text[]
        and pg_catalog.cardinality(role_record.rolconfig) = 4
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime_oid
        and membership.roleid = v_caller
        and not membership.admin_option
        and membership.inherit_option
        and not membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime_oid
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = v_runtime_oid
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = v_runtime_oid
        and not (
          membership.member = pg_catalog.to_regrole('postgres')
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
    )
    or pg_catalog.has_schema_privilege(
      v_runtime_oid, 'careslink_v1_runtime_broker', 'USAGE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace =
        'careslink_v1_runtime_broker'::pg_catalog.regnamespace
        and procedure.prokind in ('f', 'w')
        and pg_catalog.has_function_privilege(
          v_runtime_oid, procedure.oid, 'EXECUTE'
        )
    )
    or not pg_catalog.pg_has_role(v_runtime_oid, v_caller, 'USAGE')
    or pg_catalog.pg_has_role(v_runtime_oid, v_caller, 'SET')
    or not pg_catalog.has_schema_privilege(
      v_runtime_oid, 'careslink_v1_generation', 'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      v_runtime_oid, 'careslink_v1_generation', 'CREATE'
    )
    or exists (
      with candidate_relation as materialized (
        select relation.oid
        from pg_catalog.pg_class as relation
        where relation.relnamespace in (
            'careslink_v1_generation'::pg_catalog.regnamespace,
            'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          )
          and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      )
      select 1
      from candidate_relation as relation
      where pg_catalog.has_table_privilege(
          v_runtime_oid,
          relation.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
        or pg_catalog.has_any_column_privilege(
          v_runtime_oid,
          relation.oid,
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
    )
    or exists (
      with candidate_sequence as materialized (
        select relation.oid
        from pg_catalog.pg_class as relation
        where relation.relnamespace in (
            'careslink_v1_generation'::pg_catalog.regnamespace,
            'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          )
          and relation.relkind = 'S'
      )
      select 1
      from candidate_sequence as relation
      where pg_catalog.has_sequence_privilege(
          v_runtime_oid, relation.oid, 'SELECT,UPDATE,USAGE'
        )
    )
    or exists (
      with candidate_function as materialized (
        select procedure.oid
        from pg_catalog.pg_proc as procedure
        where procedure.pronamespace in (
            'careslink_v1_generation'::pg_catalog.regnamespace,
            'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          )
          and procedure.prokind in ('f', 'w')
      )
      select 1
      from candidate_function as procedure
      where procedure.oid <> v_terminal_oid
        and pg_catalog.has_function_privilege(
          v_runtime_oid, procedure.oid, 'EXECUTE'
        )
    )
    or not pg_catalog.has_function_privilege(
      v_runtime_oid, v_terminal_oid, 'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.unnest(array[
        'anon', 'authenticated', 'service_role', 'authenticator',
        'careslink_v1_preview_runner_terminal_executor'
      ]::pg_catalog.text[]) as forbidden(role_name)
      where pg_catalog.pg_has_role(
          p_runtime_role, forbidden.role_name, 'SET'
        )
        or pg_catalog.pg_has_role(
          forbidden.role_name, p_runtime_role, 'SET'
        )
    )
    or pg_catalog.pg_has_role(p_runtime_role, 'postgres', 'SET')
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_ISSUANCE_POSTCHECK_FAILED';
  end if;

  update careslink_v1_runtime_broker.acquisitions
  set state = 'ISSUED_UNBOUND',
      runtime_role = p_runtime_role,
      runtime_role_oid = v_runtime_oid,
      lease_reference_sha256 = p_lease_reference_sha256,
      session_binding_sha256 = p_session_binding_sha256,
      credential_verifier_sha256 = p_credential_verifier_sha256,
      issued_at = v_issued_at,
      expires_at = p_expires_at,
      updated_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.clock_timestamp()
      )
  where acquisition_digest = p_acquisition_digest
    and fence_token = v_fence_token
    and state = 'RESERVED'
    and tombstoned_at is null
    and future_issuance_blocked is false;

  if not found then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_ISSUANCE_FENCE_LOST';
  end if;

  return pg_catalog.jsonb_build_object(
    'acquisitionRequestDigest', p_acquisition_digest,
    'credentialVerifierSha256', p_credential_verifier_sha256,
    'expiresAt', v_expires_at_text,
    'issuedAt', pg_catalog.to_char(
      v_issued_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'leaseReferenceSha256', p_lease_reference_sha256,
    'rawCredentialMaterialPresent', false,
    'runtimeRole', p_runtime_role,
    'sessionBindingSha256', p_session_binding_sha256,
    'status', 'ISSUED_UNBOUND'
  );
end
$runtime_credential_broker$;

create function careslink_v1_runtime_broker.bind(
  p_acquisition_digest pg_catalog.text,
  p_backend_pid pg_catalog.int4
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $runtime_credential_broker$
declare
  v_acquisition careslink_v1_runtime_broker.acquisitions%rowtype;
  v_backend_start pg_catalog.timestamptz;
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_now pg_catalog.timestamptz;
  v_terminal_oid pg_catalog.oid;
begin
  perform careslink_v1_runtime_broker._assert_management_session();
  if not coalesce(
      p_acquisition_digest ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(p_backend_pid > 0, false)
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_BIND_INVALID';
  end if;

  select procedure.oid
  into v_terminal_oid
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'careslink_v1_generation'
    and procedure.proname =
      'persist_verified_communication_note_preview_runner_terminal'
    and procedure.prokind = 'f'
    and procedure.pronargs = 3
    and procedure.proargtypes[0] =
      'pg_catalog.jsonb'::pg_catalog.regtype
    and procedure.proargtypes[1] =
      'pg_catalog.text'::pg_catalog.regtype
    and procedure.proargtypes[2] =
      'pg_catalog.text'::pg_catalog.regtype
    and procedure.prorettype =
      'pg_catalog.jsonb'::pg_catalog.regtype;
  if not found or v_caller is null then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_BIND_DEPENDENCY_INVALID';
  end if;

  perform careslink_v1_runtime_broker._assert_terminal_static_posture();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );
  select acquisition.*
  into v_acquisition
  from careslink_v1_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = p_acquisition_digest
  for update;

  v_now := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  if not found
    or v_acquisition.state not in ('ISSUED_UNBOUND', 'ACTIVE')
    or v_acquisition.future_issuance_blocked
    or v_acquisition.tombstoned_at is not null
    or v_acquisition.expires_at <= v_now
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_BIND_FENCE_REJECTED';
  end if;

  perform careslink_v1_runtime_broker._assert_runtime_privilege_posture(
    v_acquisition.runtime_role_oid
  );

  perform pg_catalog.pg_stat_clear_snapshot();
  select activity.backend_start
  into v_backend_start
  from pg_catalog.pg_stat_activity as activity
  where activity.pid = p_backend_pid
    and activity.datname = pg_catalog.current_database()
    and activity.usesysid = v_acquisition.runtime_role_oid
    and activity.usename = v_acquisition.runtime_role
    and activity.application_name =
      'careslink-preview-runtime-credential-broker-runtime'
    and activity.backend_type = 'client backend'
    and activity.state = 'idle';

  if not found
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_stat_activity as activity
      where activity.backend_type = 'client backend'
        and (
          activity.usesysid = v_acquisition.runtime_role_oid
          or activity.usename = v_acquisition.runtime_role
        )
    ) <> 1
    or pg_catalog.to_regrole(v_acquisition.runtime_role) is distinct from
      v_acquisition.runtime_role_oid
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_acquisition.runtime_role_oid
        and role_record.rolname = v_acquisition.runtime_role
        and (
          (v_acquisition.state = 'ISSUED_UNBOUND' and role_record.rolcanlogin)
          or (v_acquisition.state = 'ACTIVE' and not role_record.rolcanlogin)
        )
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = 1
        and role_record.rolvaliduntil = v_acquisition.expires_at
        and role_record.rolconfig @> array[
          'statement_timeout=5s',
          'lock_timeout=1s',
          'idle_in_transaction_session_timeout=5s',
          'idle_session_timeout=5s'
        ]::pg_catalog.text[]
        and pg_catalog.cardinality(role_record.rolconfig) = 4
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_acquisition.runtime_role_oid
        and membership.roleid = v_caller
        and not membership.admin_option
        and membership.inherit_option
        and not membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_acquisition.runtime_role_oid
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = v_acquisition.runtime_role_oid
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = v_acquisition.runtime_role_oid
        and not (
          membership.member = pg_catalog.to_regrole('postgres')
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
    )
    or not pg_catalog.pg_has_role(
      v_acquisition.runtime_role_oid, v_caller, 'USAGE'
    )
    or pg_catalog.pg_has_role(
      v_acquisition.runtime_role_oid, v_caller, 'SET'
    )
    or not pg_catalog.has_schema_privilege(
      v_acquisition.runtime_role_oid,
      'careslink_v1_generation',
      'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      v_acquisition.runtime_role_oid,
      'careslink_v1_generation',
      'CREATE'
    )
    or not pg_catalog.has_function_privilege(
      v_acquisition.runtime_role_oid, v_terminal_oid, 'EXECUTE'
    )
    or v_backend_start < v_acquisition.issued_at -
      pg_catalog.make_interval(secs => 5)
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_BIND_SESSION_INVALID';
  end if;

  if v_acquisition.state = 'ACTIVE' then
    if v_acquisition.bound_backend_pid = p_backend_pid
      and v_acquisition.bound_backend_start = v_backend_start
    then
      return pg_catalog.jsonb_build_object(
        'acquisitionRequestDigest', p_acquisition_digest,
        'backendPid', p_backend_pid,
        'leaseReferenceSha256',
          v_acquisition.lease_reference_sha256,
        'rawCredentialMaterialPresent', false,
        'runtimeRole', v_acquisition.runtime_role,
        'sessionBindingSha256',
          v_acquisition.session_binding_sha256,
        'status', 'ACTIVE'
      );
    end if;
    raise exception 'RUNTIME_CREDENTIAL_BROKER_BIND_CONFLICT';
  end if;

  execute pg_catalog.format(
    'alter role %I with nologin', v_acquisition.runtime_role
  );
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_roles as role_record
    where role_record.oid = v_acquisition.runtime_role_oid
      and role_record.rolname = v_acquisition.runtime_role
      and not role_record.rolcanlogin
      and not role_record.rolsuper
      and not role_record.rolcreatedb
      and not role_record.rolcreaterole
      and role_record.rolinherit
      and not role_record.rolreplication
      and not role_record.rolbypassrls
      and role_record.rolconnlimit = 1
      and role_record.rolvaliduntil = v_acquisition.expires_at
      and role_record.rolconfig @> array[
        'statement_timeout=5s',
        'lock_timeout=1s',
        'idle_in_transaction_session_timeout=5s',
        'idle_session_timeout=5s'
      ]::pg_catalog.text[]
      and pg_catalog.cardinality(role_record.rolconfig) = 4
  ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_acquisition.runtime_role_oid
        and membership.roleid = v_caller
        and not membership.admin_option
        and membership.inherit_option
        and not membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_acquisition.runtime_role_oid
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = v_acquisition.runtime_role_oid
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = v_acquisition.runtime_role_oid
        and not (
          membership.member = pg_catalog.to_regrole('postgres')
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
    )
    or not pg_catalog.pg_has_role(
      v_acquisition.runtime_role_oid, v_caller, 'USAGE'
    )
    or pg_catalog.pg_has_role(
      v_acquisition.runtime_role_oid, v_caller, 'SET'
    )
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_BIND_LOGIN_FENCE_FAILED';
  end if;

  perform careslink_v1_runtime_broker._assert_runtime_privilege_posture(
    v_acquisition.runtime_role_oid
  );

  update careslink_v1_runtime_broker.acquisitions
  set state = 'ACTIVE',
      bound_backend_pid = p_backend_pid,
      bound_backend_start = v_backend_start,
      bound_at = v_now,
      updated_at = v_now
  where acquisition_digest = p_acquisition_digest
    and state = 'ISSUED_UNBOUND'
    and tombstoned_at is null
    and future_issuance_blocked is false;

  if not found then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_BIND_FENCE_LOST';
  end if;

  return pg_catalog.jsonb_build_object(
    'acquisitionRequestDigest', p_acquisition_digest,
    'backendPid', p_backend_pid,
    'leaseReferenceSha256', v_acquisition.lease_reference_sha256,
    'rawCredentialMaterialPresent', false,
    'runtimeRole', v_acquisition.runtime_role,
    'sessionBindingSha256', v_acquisition.session_binding_sha256,
    'status', 'ACTIVE'
  );
end
$runtime_credential_broker$;

create function careslink_v1_runtime_broker.tombstone(
  p_acquisition_digest pg_catalog.text
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $runtime_credential_broker$
declare
  v_acquisition careslink_v1_runtime_broker.acquisitions%rowtype;
  v_acquisition_found pg_catalog.bool;
  v_bound_backend_count pg_catalog.int4;
  v_now pg_catalog.timestamptz;
  v_role_can_login pg_catalog.bool;
  v_role_identity_count pg_catalog.int4;
  v_role_name pg_catalog.text;
  v_role_oid pg_catalog.oid;
  v_terminated pg_catalog.bool;
  v_transaction_id pg_catalog.text := pg_catalog.pg_current_xact_id()::pg_catalog.text;
begin
  perform careslink_v1_runtime_broker._assert_management_session();
  if not coalesce(
    p_acquisition_digest ~ '^[a-f0-9]{64}$', false
  ) then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_TOMBSTONE_INVALID';
  end if;

  begin
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
    );
  exception when lock_not_available then
    -- Ordinary terminal transactions get five seconds to commit. A longer
    -- holder can only be the exact ACTIVE backend recorded by bind; terminate
    -- that one physical session before retrying the exclusive fence.
    select acquisition.*
    into v_acquisition
    from careslink_v1_runtime_broker.acquisitions as acquisition
    where acquisition.acquisition_digest = p_acquisition_digest;

    if found and v_acquisition.state = 'ACTIVE' then
      perform pg_catalog.pg_stat_clear_snapshot();
      select pg_catalog.count(*)::pg_catalog.int4
      into v_bound_backend_count
      from pg_catalog.pg_stat_activity as activity
      where activity.pid = v_acquisition.bound_backend_pid
        and activity.backend_start = v_acquisition.bound_backend_start
        and activity.datname = pg_catalog.current_database()
        and activity.usesysid = v_acquisition.runtime_role_oid
        and activity.usename = v_acquisition.runtime_role
        and activity.backend_type = 'client backend';
      if v_bound_backend_count = 1 then
        v_terminated := pg_catalog.pg_terminate_backend(
          v_acquisition.bound_backend_pid, 5000
        );
        if not v_terminated then
          perform pg_catalog.pg_stat_clear_snapshot();
          if exists (
            select 1
            from pg_catalog.pg_stat_activity as activity
            where activity.pid = v_acquisition.bound_backend_pid
              and activity.backend_start =
                v_acquisition.bound_backend_start
              and activity.datname = pg_catalog.current_database()
              and activity.usesysid = v_acquisition.runtime_role_oid
              and activity.usename = v_acquisition.runtime_role
              and activity.backend_type = 'client backend'
          ) then
            raise exception 'RUNTIME_CREDENTIAL_BROKER_TERMINATE_FAILED';
          end if;
        end if;
      elsif v_bound_backend_count > 1 then
        raise exception 'RUNTIME_CREDENTIAL_BROKER_BOUND_SESSION_AMBIGUOUS';
      end if;
    end if;

    perform pg_catalog.set_config('lock_timeout', '5s', true);
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
    );
  end;
  select acquisition.*
  into v_acquisition
  from careslink_v1_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = p_acquisition_digest
  for update;
  v_acquisition_found := found;
  v_now := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );

  if v_acquisition_found and v_acquisition.issued_at is not null then
    select pg_catalog.count(*)::pg_catalog.int4
    into v_role_identity_count
    from pg_catalog.pg_roles as role_record
    where role_record.rolname = v_acquisition.runtime_role
      or (
        v_acquisition.state <> 'REVOKED'
        and role_record.oid = v_acquisition.runtime_role_oid
      );

    if v_role_identity_count > 1 then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_RUNTIME_ROLE_ABA';
    end if;
    if v_role_identity_count = 1 then
      select role_record.oid, role_record.rolname, role_record.rolcanlogin
      into v_role_oid, v_role_name, v_role_can_login
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = v_acquisition.runtime_role
        or (
          v_acquisition.state <> 'REVOKED'
          and role_record.oid = v_acquisition.runtime_role_oid
        );
      if v_role_oid is distinct from v_acquisition.runtime_role_oid
        or v_role_name is distinct from v_acquisition.runtime_role
      then
        raise exception 'RUNTIME_CREDENTIAL_BROKER_RUNTIME_ROLE_ABA';
      end if;
    end if;

    if v_acquisition.state in ('RESERVED', 'ISSUED_UNBOUND', 'ACTIVE') then
      if v_role_identity_count <> 1 then
        raise exception 'RUNTIME_CREDENTIAL_BROKER_RUNTIME_ROLE_MISSING';
      end if;
      execute pg_catalog.format(
        'alter role %I with nologin valid until %L',
        v_role_name,
        pg_catalog.to_char(
          v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      );
      if (
        select pg_catalog.count(*)
        from pg_catalog.pg_roles as role_record
        where role_record.oid = v_acquisition.runtime_role_oid
          and role_record.rolname = v_acquisition.runtime_role
          and not role_record.rolcanlogin
          and role_record.rolvaliduntil = v_now
      ) <> 1
      then
        raise exception 'RUNTIME_CREDENTIAL_BROKER_LOGIN_FENCE_FAILED';
      end if;
    elsif v_acquisition.state = 'TOMBSTONED'
      and v_role_identity_count = 1
      and v_role_can_login
    then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_LOGIN_FENCE_MISSING';
    elsif v_acquisition.state = 'REVOKED'
      and v_role_identity_count <> 0
    then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_ROLE_RESIDUE';
    end if;
  end if;

  if not v_acquisition_found then
    insert into careslink_v1_runtime_broker.acquisitions (
      acquisition_digest,
      state,
      tombstoned_at,
      tombstone_transaction_id,
      future_issuance_blocked,
      reusable,
      raw_credential_material_present,
      created_at,
      updated_at
    ) values (
      p_acquisition_digest,
      'TOMBSTONED',
      v_now,
      v_transaction_id,
      true,
      false,
      false,
      v_now,
      v_now
    )
    returning * into v_acquisition;
  elsif v_acquisition.state not in ('TOMBSTONED', 'REVOKED') then
    update careslink_v1_runtime_broker.acquisitions
    set state = 'TOMBSTONED',
        tombstoned_at = v_now,
        tombstone_transaction_id = v_transaction_id,
        future_issuance_blocked = true,
        updated_at = v_now
    where acquisition_digest = p_acquisition_digest
      and state in ('RESERVED', 'ISSUED_UNBOUND', 'ACTIVE')
      and tombstoned_at is null
      and future_issuance_blocked is false
    returning * into v_acquisition;
    if not found then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_TOMBSTONE_FENCE_LOST';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'acquisitionRequestDigest', p_acquisition_digest,
    'everIssued', v_acquisition.issued_at is not null,
    'futureIssuanceBlocked', true,
    'rawCredentialMaterialPresent', false,
    'status', 'TOMBSTONED'
  );
end
$runtime_credential_broker$;

create function careslink_v1_runtime_broker.finalize(
  p_acquisition_digest pg_catalog.text
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $runtime_credential_broker$
declare
  v_acquisition careslink_v1_runtime_broker.acquisitions%rowtype;
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_now pg_catalog.timestamptz;
  v_session_disposition pg_catalog.text;
  v_credential_disposition pg_catalog.text;
  v_receipt_core pg_catalog.jsonb;
  v_receipt_digest pg_catalog.text;
  v_backend_pid pg_catalog.int4;
  v_role_can_login pg_catalog.bool;
  v_role_identity_count pg_catalog.int4;
  v_role_name pg_catalog.text;
  v_role_oid pg_catalog.oid;
  v_wait_attempt pg_catalog.int4;
begin
  perform careslink_v1_runtime_broker._assert_management_session();
  if not coalesce(
    p_acquisition_digest ~ '^[a-f0-9]{64}$', false
  ) then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_FINALIZE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );
  select acquisition.*
  into v_acquisition
  from careslink_v1_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = p_acquisition_digest
  for update;
  v_now := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );

  if not found
    or v_acquisition.state not in ('TOMBSTONED', 'REVOKED')
    or v_acquisition.tombstoned_at is null
    or not v_acquisition.future_issuance_blocked
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_FINALIZE_NOT_TOMBSTONED';
  end if;
  if v_acquisition.tombstone_transaction_id =
    pg_catalog.pg_current_xact_id()::pg_catalog.text
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_TOMBSTONE_NOT_DURABLE';
  end if;

  if v_acquisition.state = 'REVOKED' then
    perform pg_catalog.pg_stat_clear_snapshot();
    if exists (
        select 1
        from pg_catalog.pg_roles as role_record
        where role_record.rolname = v_acquisition.runtime_role
      )
      or exists (
        select 1
        from pg_catalog.pg_stat_activity as activity
        where activity.usename = v_acquisition.runtime_role
          or (
            v_acquisition.bound_backend_pid is not null
            and activity.pid = v_acquisition.bound_backend_pid
            and activity.backend_start = v_acquisition.bound_backend_start
          )
      )
    then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_REVOKED_RESIDUE';
    end if;
    return pg_catalog.jsonb_build_object(
      'acquisitionRequestDigest', p_acquisition_digest,
      'everIssued', v_acquisition.issued_at is not null,
      'futureIssuanceBlocked', true,
      'membershipCount', 0,
      'rawCredentialMaterialPresent', false,
      'roleCount', 0,
      'sessionCount', 0,
      'status', 'REVOKED'
    );
  end if;

  if v_acquisition.issued_at is null then
    v_session_disposition := 'NOT_ACQUIRED';
    v_credential_disposition := 'NOT_ISSUED';
  else
    v_session_disposition := 'DESTROYED';
    v_credential_disposition := 'REVOKED';

    select pg_catalog.count(*)::pg_catalog.int4
    into v_role_identity_count
    from pg_catalog.pg_roles as role_record
    where role_record.oid = v_acquisition.runtime_role_oid
      or role_record.rolname = v_acquisition.runtime_role;
    if v_role_identity_count > 1 then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_RUNTIME_ROLE_ABA';
    end if;
    if v_role_identity_count = 1 then
      select role_record.oid, role_record.rolname, role_record.rolcanlogin
      into v_role_oid, v_role_name, v_role_can_login
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_acquisition.runtime_role_oid
        or role_record.rolname = v_acquisition.runtime_role;
      if v_role_oid is distinct from v_acquisition.runtime_role_oid
        or v_role_name is distinct from v_acquisition.runtime_role
      then
        raise exception 'RUNTIME_CREDENTIAL_BROKER_RUNTIME_ROLE_ABA';
      end if;
      if v_role_can_login then
        raise exception 'RUNTIME_CREDENTIAL_BROKER_LOGIN_FENCE_MISSING';
      end if;
    end if;

    -- The committed tombstone transaction has already made the role NOLOGIN.
    -- Materialize the authoritative backends before invoking termination; SQL
    -- predicate evaluation order is not a safety boundary.
    perform pg_catalog.pg_stat_clear_snapshot();
    for v_backend_pid in
      select activity.pid
      from pg_catalog.pg_stat_activity as activity
      where activity.pid <> pg_catalog.pg_backend_pid()
        and activity.backend_type = 'client backend'
        and (
          activity.usesysid = v_acquisition.runtime_role_oid
          or activity.usename = v_acquisition.runtime_role
        )
    loop
      if v_backend_pid = pg_catalog.pg_backend_pid()
        or not pg_catalog.pg_terminate_backend(v_backend_pid, 5000)
      then
        raise exception 'RUNTIME_CREDENTIAL_BROKER_TERMINATE_FAILED';
      end if;
    end loop;

    -- Statistics rows can remain visible through the transaction-local stats
    -- snapshot after pg_terminate_backend has confirmed exit. Refresh that
    -- snapshot and allow a short bounded drain before proving zero sessions.
    for v_wait_attempt in 1..50 loop
      perform pg_catalog.pg_stat_clear_snapshot();
      exit when not exists (
        select 1
        from pg_catalog.pg_stat_activity as activity
        where activity.backend_type = 'client backend'
          and (
            activity.usesysid = v_acquisition.runtime_role_oid
            or activity.usename = v_acquisition.runtime_role
          )
      );
      perform pg_catalog.pg_sleep(0.05);
    end loop;
    perform pg_catalog.pg_stat_clear_snapshot();
    if exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.backend_type = 'client backend'
        and (
          activity.usesysid = v_acquisition.runtime_role_oid
          or activity.usename = v_acquisition.runtime_role
        )
    ) then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_SESSION_REMAINS';
    end if;

    if v_role_identity_count = 1 then
      if (
        select pg_catalog.count(*)
        from pg_catalog.pg_auth_members as membership
        where membership.member = v_acquisition.runtime_role_oid
          and membership.roleid = v_caller
          and not membership.admin_option
          and membership.inherit_option
          and not membership.set_option
      ) <> 1
        or (
          select pg_catalog.count(*)
          from pg_catalog.pg_auth_members as membership
          where membership.member = v_acquisition.runtime_role_oid
        ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = v_acquisition.runtime_role_oid
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = v_acquisition.runtime_role_oid
        and not (
          membership.member = pg_catalog.to_regrole('postgres')
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
    )
        or not pg_catalog.pg_has_role(
          v_acquisition.runtime_role_oid, v_caller, 'USAGE'
        )
        or pg_catalog.pg_has_role(
          v_acquisition.runtime_role_oid, v_caller, 'SET'
        )
        or exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        where membership.member = v_acquisition.runtime_role_oid
          and membership.roleid <> v_caller
        )
      then
        raise exception 'RUNTIME_CREDENTIAL_BROKER_MEMBERSHIP_DRIFT';
      end if;

      execute pg_catalog.format(
        'revoke careslink_v1_preview_runner_terminal_caller from %I',
        v_role_name
      );
      execute pg_catalog.format(
        'drop role %I', v_role_name
      );
    end if;

    perform pg_catalog.pg_stat_clear_snapshot();
    if exists (
        select 1
        from pg_catalog.pg_roles as role_record
        where role_record.rolname = v_acquisition.runtime_role
      )
      or exists (
        select 1
        from pg_catalog.pg_stat_activity as activity
        where activity.usename = v_acquisition.runtime_role
          or (
            v_acquisition.bound_backend_pid is not null
            and activity.pid = v_acquisition.bound_backend_pid
            and activity.backend_start =
              v_acquisition.bound_backend_start
          )
      )
    then
      raise exception 'RUNTIME_CREDENTIAL_BROKER_ZERO_RESIDUE_FAILED';
    end if;
  end if;

  v_receipt_core := pg_catalog.jsonb_build_object(
    'acquisitionDigest', p_acquisition_digest,
    'acquisitionRequestTombstoned', true,
    'fenceToken', v_acquisition.fence_token::pg_catalog.text,
    'futureIssuanceBlocked', true,
    'rawCredentialMaterialPresent', false,
    'reportedAt', pg_catalog.to_char(
      v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'reportedCredentialDisposition', v_credential_disposition,
    'reportedSessionDisposition', v_session_disposition,
    'reusable', false
  );
  v_receipt_digest := public.v1_shadow_content_sha256(v_receipt_core);

  update careslink_v1_runtime_broker.acquisitions
  set state = 'REVOKED',
      revoked_at = v_now,
      reported_session_disposition = v_session_disposition,
      reported_credential_disposition = v_credential_disposition,
      receipt_digest = v_receipt_digest,
      updated_at = v_now
  where acquisition_digest = p_acquisition_digest
    and state = 'TOMBSTONED'
    and tombstoned_at is not null
    and future_issuance_blocked is true;

  if not found then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_FINALIZE_FENCE_LOST';
  end if;

  return pg_catalog.jsonb_build_object(
    'acquisitionRequestDigest', p_acquisition_digest,
    'everIssued', v_acquisition.issued_at is not null,
    'futureIssuanceBlocked', true,
    'membershipCount', 0,
    'rawCredentialMaterialPresent', false,
    'roleCount', 0,
    'sessionCount', 0,
    'status', 'REVOKED'
  );
end
$runtime_credential_broker$;

create function careslink_v1_runtime_broker.inspect(
  p_acquisition_digest pg_catalog.text
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $runtime_credential_broker$
declare
  v_acquisition careslink_v1_runtime_broker.acquisitions%rowtype;
begin
  perform careslink_v1_runtime_broker._assert_management_session();
  if not coalesce(
    p_acquisition_digest ~ '^[a-f0-9]{64}$', false
  ) then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_INSPECT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );
  select acquisition.*
  into v_acquisition
  from careslink_v1_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = p_acquisition_digest;

  if not found
    or v_acquisition.state <> 'REVOKED'
    or v_acquisition.tombstoned_at is null
    or not v_acquisition.future_issuance_blocked
    or v_acquisition.revoked_at is null
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_NOT_REVOKED';
  end if;

  perform pg_catalog.pg_stat_clear_snapshot();
  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = v_acquisition.runtime_role
    ) <> 0
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_stat_activity as activity
      where activity.usename = v_acquisition.runtime_role
        or (
          v_acquisition.bound_backend_pid is not null
          and activity.pid = v_acquisition.bound_backend_pid
          and activity.backend_start = v_acquisition.bound_backend_start
        )
    ) <> 0
  then
    raise exception 'RUNTIME_CREDENTIAL_BROKER_ATTESTATION_FAILED';
  end if;

  return pg_catalog.jsonb_build_object(
    'acquisitionRequestDigest', v_acquisition.acquisition_digest,
    'everIssued', v_acquisition.issued_at is not null,
    'futureIssuanceBlocked', true,
    'membershipCount', 0,
    'rawCredentialMaterialPresent', false,
    'roleCount', 0,
    'sessionCount', 0,
    'status', 'REVOKED_ATTESTED',
    'credentialVerifierResidueCount', 0
  );
end
$runtime_credential_broker$;

create function careslink_v1_runtime_broker._current_runtime_backend_start()
returns pg_catalog.timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $runtime_credential_backend_identity$
declare
  v_backend_start pg_catalog.timestamptz;
  v_runtime_oid pg_catalog.oid;
begin
  if session_user !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runtime-credential-broker-runtime'
  then
    raise exception using
      errcode = 'P0001', message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE';
  end if;

  v_runtime_oid := pg_catalog.to_regrole(session_user);
  if v_runtime_oid is null then
    raise exception using
      errcode = 'P0001', message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE';
  end if;

  perform pg_catalog.pg_stat_clear_snapshot();
  select activity.backend_start
  into v_backend_start
  from pg_catalog.pg_stat_activity as activity
  where activity.pid = pg_catalog.pg_backend_pid()
    and activity.datname = pg_catalog.current_database()
    and activity.usename = session_user
    and activity.application_name =
      'careslink-preview-runtime-credential-broker-runtime'
    and activity.backend_type = 'client backend'
    and (
      select pg_catalog.count(*)
      from pg_catalog.pg_stat_activity as candidate
      where candidate.backend_type = 'client backend'
        and (
          candidate.usesysid = v_runtime_oid
          or candidate.usename = session_user
        )
    ) = 1;

  if not found or v_backend_start is null then
    raise exception using
      errcode = 'P0001', message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE';
  end if;
  return v_backend_start;
end
$runtime_credential_backend_identity$;

revoke all on function
  careslink_v1_runtime_broker._current_runtime_backend_start()
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller,
  careslink_v1_preview_runner_terminal_caller,
  careslink_v1_preview_runner_terminal_executor;
grant execute on function
  careslink_v1_runtime_broker._current_runtime_backend_start()
to careslink_v1_preview_runner_terminal_executor;

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_runner_terminal_executor to current_user
  with admin false, inherit false, set true granted by current_user;

set role careslink_v1_generation_owner;
grant create on schema careslink_v1_generation
  to careslink_v1_preview_runner_terminal_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);
set role careslink_v1_preview_runner_terminal_executor;

alter function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
  )
rename to _persist_verified_communication_note_preview_terminal_unfenced;

revoke all on function
  careslink_v1_generation._persist_verified_communication_note_preview_terminal_unfenced(
    pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
  )
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller,
  careslink_v1_preview_runner_terminal_caller,
  careslink_v1_preview_runner_terminal_executor;
grant execute on function
  careslink_v1_generation._persist_verified_communication_note_preview_terminal_unfenced(
    pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
  )
to careslink_v1_preview_runner_terminal_executor;

do $careslink_v1_terminal_inner_acl_guard$
declare
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_executor pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_executor'
  );
  v_inner pg_catalog.oid;
begin
  select procedure.oid
  into v_inner
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'careslink_v1_generation'
    and procedure.proname =
      '_persist_verified_communication_note_preview_terminal_unfenced'
    and procedure.prokind = 'f'
    and procedure.pronargs = 3
    and procedure.proargtypes[0] =
      'pg_catalog.jsonb'::pg_catalog.regtype
    and procedure.proargtypes[1] =
      'pg_catalog.text'::pg_catalog.regtype
    and procedure.proargtypes[2] =
      'pg_catalog.text'::pg_catalog.regtype;

  if not found or v_caller is null or v_executor is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = v_inner
        and procedure.proowner = v_executor
        and procedure.prosecdef
        and procedure.provolatile = 'v'
        and procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      where procedure.oid = v_inner
        and acl.privilege_type = 'EXECUTE'
        and acl.grantee = v_executor
        and acl.grantor = v_executor
        and not acl.is_grantable
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      where procedure.oid = v_inner
        and acl.privilege_type = 'EXECUTE'
    ) <> 1
    or pg_catalog.has_function_privilege(
      v_caller, v_inner, 'EXECUTE'
    )
  then
    raise exception 'RUNTIME_CREDENTIAL_TERMINAL_INNER_ACL_UNSAFE';
  end if;
end
$careslink_v1_terminal_inner_acl_guard$;

create function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    p_statement pg_catalog.jsonb,
    p_signature_base64url pg_catalog.text,
    p_verifier_identity_hmac pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $runtime_credential_terminal_fence$
declare
  v_acquisition careslink_v1_runtime_broker.acquisitions%rowtype;
  v_backend_start pg_catalog.timestamptz;
  v_now pg_catalog.timestamptz;
  v_runtime_oid pg_catalog.oid;
begin
  if session_user !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
    or p_statement is null
    or pg_catalog.jsonb_typeof(p_statement) <> 'object'
    or not coalesce(
      (p_statement->>'authorizationDigest') ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(
      (p_statement->>'runIdHash') ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(p_verifier_identity_hmac ~ '^[a-f0-9]{64}$', false)
  then
    raise exception using
      errcode = 'P0001', message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE';
  end if;

  select acquisition.*
  into v_acquisition
  from careslink_v1_runtime_broker.acquisitions as acquisition
  where acquisition.runtime_role = session_user;

  if not found then
    raise exception using
      errcode = 'P0001', message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE';
  end if;

  begin
    perform pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(
        v_acquisition.acquisition_digest, 836492741
      )
    );
  exception when lock_not_available then
    raise exception using
      errcode = 'P0001', message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE';
  end;

  select acquisition.*
  into v_acquisition
  from careslink_v1_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = v_acquisition.acquisition_digest
    and acquisition.runtime_role = session_user;

  v_now := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  v_runtime_oid := pg_catalog.to_regrole(session_user);
  begin
    perform careslink_v1_runtime_broker._assert_runtime_privilege_posture(
      v_runtime_oid
    );
  exception when others then
    raise exception using
      errcode = 'P0001', message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE';
  end;
  v_backend_start :=
    careslink_v1_runtime_broker._current_runtime_backend_start();

  if v_acquisition.state <> 'ACTIVE'
    or v_acquisition.future_issuance_blocked
    or v_acquisition.tombstoned_at is not null
    or v_acquisition.revoked_at is not null
    or v_acquisition.expires_at <=
      v_now + pg_catalog.make_interval(secs => 5)
    or v_acquisition.runtime_role <> session_user
    or v_acquisition.runtime_role_oid is distinct from v_runtime_oid
    or v_acquisition.bound_backend_pid <> pg_catalog.pg_backend_pid()
    or v_acquisition.bound_backend_start is distinct from v_backend_start
    or v_acquisition.authorization_digest is distinct from
      p_statement->>'authorizationDigest'
    or v_acquisition.run_id_hash is distinct from p_statement->>'runIdHash'
    or v_acquisition.caller_identity_hmac is distinct from
      p_verifier_identity_hmac
    or pg_catalog.current_setting('statement_timeout') <> '5s'
    or pg_catalog.current_setting('lock_timeout') <> '1s'
    or pg_catalog.current_setting(
      'idle_in_transaction_session_timeout'
    ) <> '5s'
    or pg_catalog.current_setting('idle_session_timeout') <> '5s'
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_acquisition.runtime_role_oid
        and role_record.rolname = v_acquisition.runtime_role
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = 1
        and role_record.rolvaliduntil = v_acquisition.expires_at
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_acquisition.runtime_role_oid
        and membership.roleid = pg_catalog.to_regrole(
          'careslink_v1_preview_runner_terminal_caller'
        )
        and not membership.admin_option
        and membership.inherit_option
        and not membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_acquisition.runtime_role_oid
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = v_acquisition.runtime_role_oid
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = v_acquisition.runtime_role_oid
        and not (
          membership.member = pg_catalog.to_regrole('postgres')
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
    )
    or not pg_catalog.pg_has_role(
      v_acquisition.runtime_role_oid,
      pg_catalog.to_regrole(
        'careslink_v1_preview_runner_terminal_caller'
      ),
      'USAGE'
    )
    or pg_catalog.pg_has_role(
      v_acquisition.runtime_role_oid,
      pg_catalog.to_regrole(
        'careslink_v1_preview_runner_terminal_caller'
      ),
      'SET'
    )
  then
    raise exception using
      errcode = 'P0001', message = 'RUNTIME_CREDENTIAL_NOT_ACTIVE';
  end if;

  return
    careslink_v1_generation._persist_verified_communication_note_preview_terminal_unfenced(
      p_statement, p_signature_base64url, p_verifier_identity_hmac
    );
end
$runtime_credential_terminal_fence$;

revoke all on function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
  )
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller,
  careslink_v1_preview_runner_terminal_caller,
  careslink_v1_preview_runner_terminal_executor;
grant execute on function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    pg_catalog.jsonb, pg_catalog.text, pg_catalog.text
  )
to careslink_v1_preview_runner_terminal_executor,
  careslink_v1_preview_runner_terminal_caller;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

create function
  careslink_v1_runtime_broker._assert_terminal_static_posture()
returns pg_catalog.void
language plpgsql
volatile
security definer
set search_path = ''
as $runtime_credential_static_posture$
declare
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_database pg_catalog.oid := (
    select database_record.oid
    from pg_catalog.pg_database as database_record
    where database_record.datname = pg_catalog.current_database()
  );
  v_executor pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_executor'
  );
  v_generation_owner pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_generation_owner'
  );
  v_generation_schema pg_catalog.oid := pg_catalog.to_regnamespace(
    'careslink_v1_generation'
  );
  v_inner pg_catalog.oid;
  v_postgres pg_catalog.oid := pg_catalog.to_regrole('postgres');
  v_wrapper pg_catalog.oid;
begin
  select
    (
      select procedure.oid
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_generation_schema
        and procedure.proname =
          '_persist_verified_communication_note_preview_terminal_unfenced'
        and procedure.prokind = 'f'
        and procedure.pronargs = 3
        and procedure.proargtypes[0] =
          'pg_catalog.jsonb'::pg_catalog.regtype
        and procedure.proargtypes[1] =
          'pg_catalog.text'::pg_catalog.regtype
        and procedure.proargtypes[2] =
          'pg_catalog.text'::pg_catalog.regtype
        and procedure.prorettype =
          'pg_catalog.jsonb'::pg_catalog.regtype
    ),
    (
      select procedure.oid
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_generation_schema
        and procedure.proname =
          'persist_verified_communication_note_preview_runner_terminal'
        and procedure.prokind = 'f'
        and procedure.pronargs = 3
        and procedure.proargtypes[0] =
          'pg_catalog.jsonb'::pg_catalog.regtype
        and procedure.proargtypes[1] =
          'pg_catalog.text'::pg_catalog.regtype
        and procedure.proargtypes[2] =
          'pg_catalog.text'::pg_catalog.regtype
        and procedure.prorettype =
          'pg_catalog.jsonb'::pg_catalog.regtype
    )
  into v_inner, v_wrapper;

  if v_caller is null or v_database is null or v_executor is null
    or v_generation_owner is null or v_generation_schema is null
    or v_inner is null or v_postgres is null or v_wrapper is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_caller
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = -1
        and role_record.rolvaliduntil is null
        and role_record.rolconfig is null
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_executor
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = -1
        and role_record.rolvaliduntil is null
        and role_record.rolconfig is null
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = v_executor
        or membership.member = v_executor
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where (
          membership.roleid = v_executor
          or membership.member = v_executor
        )
        and not (
          membership.roleid = v_executor
          and membership.member = v_postgres
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = v_caller
        and membership.member = v_postgres
        and grantor_role.rolsuper
        and membership.grantor <> membership.member
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_caller
    )
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      left join pg_catalog.pg_roles as member_role
        on member_role.oid = membership.member
      left join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = v_caller
        and not (
          (
            membership.member = v_postgres
            and grantor_role.rolsuper
            and membership.grantor <> membership.member
            and membership.admin_option
            and not membership.inherit_option
            and not membership.set_option
          )
          or (
            member_role.rolname ~
              '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
            and membership.grantor = v_postgres
            and not membership.admin_option
            and membership.inherit_option
            and not membership.set_option
          )
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and dependency.deptype = 'o'
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and dependency.deptype = 'a'
    ) <> 2
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and dependency.deptype = 'a'
        and dependency.dbid = v_database
        and dependency.classid =
          'pg_catalog.pg_namespace'::pg_catalog.regclass
        and dependency.objid = v_generation_schema
        and dependency.objsubid = 0
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and dependency.deptype = 'a'
        and dependency.dbid = v_database
        and dependency.classid =
          'pg_catalog.pg_proc'::pg_catalog.regclass
        and dependency.objid = v_wrapper
        and dependency.objsubid = 0
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = v_caller
        and not (
          dependency.deptype = 'a'
          and dependency.dbid = v_database
          and dependency.objsubid = 0
          and (
            (
              dependency.classid =
                'pg_catalog.pg_namespace'::pg_catalog.regclass
              and dependency.objid = v_generation_schema
            )
            or (
              dependency.classid =
                'pg_catalog.pg_proc'::pg_catalog.regclass
              and dependency.objid = v_wrapper
            )
          )
        )
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_namespace as namespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          namespace.nspacl,
          pg_catalog.acldefault('n', namespace.nspowner)
        )
      ) as acl
      where namespace.oid = v_generation_schema
        and acl.grantee = v_caller
        and acl.grantor = v_generation_owner
        and acl.privilege_type = 'USAGE'
        and not acl.is_grantable
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_namespace as namespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          namespace.nspacl,
          pg_catalog.acldefault('n', namespace.nspowner)
        )
      ) as acl
      where namespace.oid = v_generation_schema
        and (acl.grantee = v_caller or acl.grantor = v_caller)
        and not (
          acl.grantee = v_caller
          and
          acl.grantor = v_generation_owner
          and acl.privilege_type = 'USAGE'
          and not acl.is_grantable
        )
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = v_wrapper
        and procedure.proowner = v_executor
        and procedure.prosecdef
        and procedure.provolatile = 'v'
        and procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      where procedure.oid = v_wrapper
        and acl.privilege_type = 'EXECUTE'
    ) <> 2
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      where procedure.oid = v_wrapper
        and acl.privilege_type = 'EXECUTE'
        and (
          acl.grantee not in (v_executor, v_caller)
          or acl.grantor <> v_executor
          or acl.is_grantable
        )
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = v_inner
        and procedure.proowner = v_executor
        and procedure.prosecdef
        and procedure.provolatile = 'v'
        and procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      where procedure.oid = v_inner
        and acl.privilege_type = 'EXECUTE'
        and acl.grantee = v_executor
        and acl.grantor = v_executor
        and not acl.is_grantable
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      where procedure.oid = v_inner
        and acl.privilege_type = 'EXECUTE'
    ) <> 1
    or pg_catalog.has_database_privilege(v_caller, v_database, 'CREATE')
    or not pg_catalog.has_schema_privilege(
      v_caller, v_generation_schema, 'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      v_caller, v_generation_schema, 'CREATE'
    )
    or pg_catalog.has_schema_privilege(
      v_caller, 'careslink_v1_runtime_broker', 'USAGE'
    )
    or exists (
      with candidate_relation as materialized (
        select relation.oid
        from pg_catalog.pg_class as relation
        where relation.relnamespace in (
            v_generation_schema,
            'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          )
          and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      )
      select 1
      from candidate_relation as relation
      where (
          pg_catalog.has_table_privilege(
            v_caller,
            relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
          or pg_catalog.has_any_column_privilege(
            v_caller,
            relation.oid,
            'SELECT,INSERT,UPDATE,REFERENCES'
          )
        )
    )
    or exists (
      with candidate_sequence as materialized (
        select relation.oid
        from pg_catalog.pg_class as relation
        where relation.relnamespace in (
            v_generation_schema,
            'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          )
          and relation.relkind = 'S'
      )
      select 1
      from candidate_sequence as relation
      where pg_catalog.has_sequence_privilege(
          v_caller, relation.oid, 'SELECT,UPDATE,USAGE'
        )
    )
    or not pg_catalog.has_function_privilege(
      v_caller, v_wrapper, 'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace in (
          v_generation_schema,
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
        )
        and procedure.prokind in ('f', 'p', 'w')
        and procedure.oid <> v_wrapper
        and pg_catalog.has_function_privilege(
          v_caller, procedure.oid, 'EXECUTE'
        )
    )
  then
    raise exception 'RUNTIME_CREDENTIAL_TERMINAL_STATIC_POSTURE_UNSAFE';
  end if;
end
$runtime_credential_static_posture$;

create function
  careslink_v1_runtime_broker._assert_runtime_privilege_posture(
    p_runtime_oid pg_catalog.oid
  )
returns pg_catalog.void
language plpgsql
volatile
security definer
set search_path = ''
as $runtime_credential_privilege_posture$
declare
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_database pg_catalog.oid := (
    select database_record.oid
    from pg_catalog.pg_database as database_record
    where database_record.datname = pg_catalog.current_database()
  );
  v_generation_schema pg_catalog.oid := pg_catalog.to_regnamespace(
    'careslink_v1_generation'
  );
  v_postgres pg_catalog.oid := pg_catalog.to_regrole('postgres');
  v_runtime_name pg_catalog.text;
  v_wrapper pg_catalog.oid;
begin
  perform careslink_v1_runtime_broker._assert_terminal_static_posture();

  select procedure.oid
  into v_wrapper
  from pg_catalog.pg_proc as procedure
  where procedure.pronamespace = v_generation_schema
    and procedure.proname =
      'persist_verified_communication_note_preview_runner_terminal'
    and procedure.prokind = 'f'
    and procedure.pronargs = 3
    and procedure.proargtypes[0] =
      'pg_catalog.jsonb'::pg_catalog.regtype
    and procedure.proargtypes[1] =
      'pg_catalog.text'::pg_catalog.regtype
    and procedure.proargtypes[2] =
      'pg_catalog.text'::pg_catalog.regtype
    and procedure.prorettype =
      'pg_catalog.jsonb'::pg_catalog.regtype;

  select role_record.rolname
  into v_runtime_name
  from pg_catalog.pg_roles as role_record
  where role_record.oid = p_runtime_oid;

  if not found or v_caller is null or v_database is null
    or v_generation_schema is null or v_postgres is null
    or v_wrapper is null
    or v_runtime_name !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = p_runtime_oid
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = 1
        and role_record.rolvaliduntil is not null
        and role_record.rolconfig @> array[
          'statement_timeout=5s',
          'lock_timeout=1s',
          'idle_in_transaction_session_timeout=5s',
          'idle_session_timeout=5s'
        ]::pg_catalog.text[]
        and pg_catalog.cardinality(role_record.rolconfig) = 4
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = p_runtime_oid
        and membership.roleid = v_caller
        and membership.grantor = v_postgres
        and not membership.admin_option
        and membership.inherit_option
        and not membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = p_runtime_oid
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = p_runtime_oid
        and membership.member = v_postgres
        and grantor_role.rolsuper
        and membership.grantor <> membership.member
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = p_runtime_oid
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid =
          'pg_catalog.pg_authid'::pg_catalog.regclass
        and dependency.refobjid = p_runtime_oid
        and dependency.deptype in ('a', 'i', 'r', 't')
    )
    or not pg_catalog.pg_has_role(p_runtime_oid, v_caller, 'USAGE')
    or pg_catalog.pg_has_role(p_runtime_oid, v_caller, 'SET')
    or pg_catalog.has_database_privilege(p_runtime_oid, v_database, 'CREATE')
    or not pg_catalog.has_schema_privilege(
      p_runtime_oid, v_generation_schema, 'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      p_runtime_oid, v_generation_schema, 'CREATE'
    )
    or pg_catalog.has_schema_privilege(
      p_runtime_oid, 'careslink_v1_runtime_broker', 'USAGE'
    )
    or exists (
      with candidate_relation as materialized (
        select relation.oid
        from pg_catalog.pg_class as relation
        where relation.relnamespace in (
            v_generation_schema,
            'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          )
          and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      )
      select 1
      from candidate_relation as relation
      where (
          pg_catalog.has_table_privilege(
            p_runtime_oid,
            relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
          or pg_catalog.has_any_column_privilege(
            p_runtime_oid,
            relation.oid,
            'SELECT,INSERT,UPDATE,REFERENCES'
          )
        )
    )
    or exists (
      with candidate_sequence as materialized (
        select relation.oid
        from pg_catalog.pg_class as relation
        where relation.relnamespace in (
            v_generation_schema,
            'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          )
          and relation.relkind = 'S'
      )
      select 1
      from candidate_sequence as relation
      where pg_catalog.has_sequence_privilege(
          p_runtime_oid, relation.oid, 'SELECT,UPDATE,USAGE'
        )
    )
    or not pg_catalog.has_function_privilege(
      p_runtime_oid, v_wrapper, 'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace in (
          v_generation_schema,
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
        )
        and procedure.prokind in ('f', 'p', 'w')
        and procedure.oid <> v_wrapper
        and pg_catalog.has_function_privilege(
          p_runtime_oid, procedure.oid, 'EXECUTE'
        )
    )
    or exists (
      select 1
      from pg_catalog.unnest(array[
        'anon', 'authenticated', 'service_role', 'authenticator',
        'careslink_v1_preview_runner_terminal_executor'
      ]::pg_catalog.text[]) as forbidden(role_name)
      where pg_catalog.pg_has_role(
          v_runtime_name, forbidden.role_name, 'SET'
        )
        or pg_catalog.pg_has_role(
          forbidden.role_name, v_runtime_name, 'SET'
        )
    )
    or pg_catalog.pg_has_role(v_runtime_name, 'postgres', 'SET')
  then
    raise exception 'RUNTIME_CREDENTIAL_RUNTIME_PRIVILEGE_POSTURE_UNSAFE';
  end if;
end
$runtime_credential_privilege_posture$;

revoke all on function
  careslink_v1_runtime_broker._assert_terminal_static_posture()
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller,
  careslink_v1_preview_runner_terminal_caller,
  careslink_v1_preview_runner_terminal_executor;
grant execute on function
  careslink_v1_runtime_broker._assert_terminal_static_posture()
to careslink_v1_preview_runner_terminal_executor;

revoke all on function
  careslink_v1_runtime_broker._assert_runtime_privilege_posture(
    pg_catalog.oid
  )
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller,
  careslink_v1_preview_runner_terminal_caller,
  careslink_v1_preview_runner_terminal_executor;
grant execute on function
  careslink_v1_runtime_broker._assert_runtime_privilege_posture(
    pg_catalog.oid
  )
to careslink_v1_preview_runner_terminal_executor;

set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation
  from careslink_v1_preview_runner_terminal_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);
revoke careslink_v1_preview_runner_terminal_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;

do $careslink_v1_terminal_cleanup_guard$
declare
  v_executor pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_executor'
  );
  v_generation_schema pg_catalog.oid;
  v_owner pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_generation_owner'
  );
begin
  select namespace.oid
  into v_generation_schema
  from pg_catalog.pg_namespace as namespace
  where namespace.nspname = 'careslink_v1_generation';

  if not found or v_executor is null or v_owner is null
    or pg_catalog.has_schema_privilege(
      v_executor, v_generation_schema, 'CREATE'
    )
    or not pg_catalog.has_schema_privilege(
      v_executor, v_generation_schema, 'USAGE'
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid in (v_executor, v_owner)
        or membership.member in (v_executor, v_owner)
    ) <> 2
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where (
          membership.roleid in (v_executor, v_owner)
          or membership.member in (v_executor, v_owner)
        )
        and not (
          membership.roleid in (v_executor, v_owner)
          and membership.member = pg_catalog.to_regrole('postgres')
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
    )
  then
    raise exception 'RUNTIME_CREDENTIAL_TERMINAL_CLEANUP_UNSAFE';
  end if;
end
$careslink_v1_terminal_cleanup_guard$;

revoke all on all functions in schema careslink_v1_runtime_broker
from public, anon, authenticated, service_role, authenticator;
revoke all on all tables in schema careslink_v1_runtime_broker
from public, anon, authenticated, service_role, authenticator;
revoke all on all sequences in schema careslink_v1_runtime_broker
from public, anon, authenticated, service_role, authenticator;
revoke all on schema careslink_v1_runtime_broker
from public, anon, authenticated, service_role, authenticator;

comment on schema careslink_v1_runtime_broker is
  'Private durable runtime-credential lifecycle metadata and terminal fence';
comment on table careslink_v1_runtime_broker.acquisitions is
  'Permanent metadata tombstones; never stores raw password, SCRAM verifier or DSN';

commit;
