-- TEST_ONLY local PostgreSQL 16/17 runtime-credential broker.
--
-- This is an isolated Preview/local verification harness, not a Supabase
-- migration and not a product credential service. Run it only on a disposable,
-- no-data database as postgres with application_name fixed to
-- `careslink-preview-runtime-credential-broker-management`. It creates no
-- acquisition, LOGIN, password or SCRAM verifier by itself.
-- Its historical M1k SET-only caller model is superseded by the formal M1l
-- migration and must never be used as M1l activation or deployment evidence.
--
-- The acquire function accepts a client-generated SCRAM verifier, uses it only
-- to create one short-lived LOGIN, and persists only its SHA-256 digest. The
-- raw password and DSN must remain outside SQL, GUCs, returned JSON and logs.
-- Every operation for one acquisition digest takes the same transaction-level
-- advisory lock. For an issued identity, tombstone atomically makes the role
-- NOLOGIN and blocks future issuance. Finalize refuses the transaction that
-- first wrote that fence, forcing the login/issuance fence to commit first.

\set ON_ERROR_STOP on

begin;

do $careslink_test_only_runtime_broker_setup_guard$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runtime-credential-broker-management'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 not in (16, 17)
    or not (
      select role_record.rolsuper and role_record.rolcreaterole
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = current_user
    )
    or pg_catalog.to_regnamespace(
      'careslink_test_only_runtime_broker'
    ) is not null
    or pg_catalog.to_regrole(
      'careslink_v1_preview_runner_terminal_caller'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.v1_shadow_content_sha256(jsonb)'
    ) is null
    or pg_catalog.to_regprocedure(
      'extensions.digest(bytea,text)'
    ) is null
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_SETUP_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(array[
      'anon', 'authenticated', 'service_role', 'authenticator'
    ]::pg_catalog.text[]) as required_role(role_name)
    where pg_catalog.to_regrole(required_role.role_name) is null
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_API_ROLE_MISSING';
  end if;
end
$careslink_test_only_runtime_broker_setup_guard$;

create schema careslink_test_only_runtime_broker authorization postgres;

revoke all on schema careslink_test_only_runtime_broker
from public, anon, authenticated, service_role, authenticator;

create table careslink_test_only_runtime_broker.acquisitions (
  acquisition_digest pg_catalog.text primary key,
  fence_token pg_catalog.int8 generated always as identity unique,
  state pg_catalog.text not null,
  runtime_role pg_catalog.text unique,
  runtime_role_oid pg_catalog.oid unique,
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
  constraint test_only_runtime_broker_digest_check check (
    acquisition_digest ~ '^[a-f0-9]{64}$'
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
  constraint test_only_runtime_broker_runtime_role_check check (
    runtime_role is null
    or runtime_role ~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  ),
  constraint test_only_runtime_broker_identity_bundle_check check (
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
      and expires_at <= issued_at + pg_catalog.make_interval(mins => 10)
      and acquisition_digest <> lease_reference_sha256
      and acquisition_digest <> session_binding_sha256
      and acquisition_digest <> credential_verifier_sha256
      and lease_reference_sha256 <> session_binding_sha256
      and lease_reference_sha256 <> credential_verifier_sha256
      and session_binding_sha256 <> credential_verifier_sha256
    )
  ),
  constraint test_only_runtime_broker_bound_session_check check (
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
  constraint test_only_runtime_broker_tombstone_check check (
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
  constraint test_only_runtime_broker_release_check check (
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
  constraint test_only_runtime_broker_state_check check (
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
  constraint test_only_runtime_broker_safety_check check (
    reusable is false and raw_credential_material_present is false
  ),
  constraint test_only_runtime_broker_clock_check check (
    updated_at >= created_at
    and (issued_at is null or issued_at >= created_at)
    and (bound_at is null or bound_at >= issued_at)
    and (tombstoned_at is null or tombstoned_at >= created_at)
  )
);

alter table careslink_test_only_runtime_broker.acquisitions
  enable row level security;
alter table careslink_test_only_runtime_broker.acquisitions
  force row level security;

revoke all on table careslink_test_only_runtime_broker.acquisitions
from public, anon, authenticated, service_role, authenticator;
revoke all on sequence
  careslink_test_only_runtime_broker.acquisitions_fence_token_seq
from public, anon, authenticated, service_role, authenticator;

create function careslink_test_only_runtime_broker._assert_management_session()
returns pg_catalog.void
language plpgsql
volatile
security invoker
set search_path = ''
as $test_only_runtime_broker$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runtime-credential-broker-management'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 not in (16, 17)
    or not (
      select role_record.rolsuper and role_record.rolcreaterole
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = current_user
    )
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_MANAGEMENT_UNSAFE';
  end if;
end
$test_only_runtime_broker$;

create function careslink_test_only_runtime_broker._guard_transition()
returns pg_catalog.trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $test_only_runtime_broker$
begin
  if tg_op = 'DELETE' then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_DELETE_DENIED';
  end if;

  if new.acquisition_digest is distinct from old.acquisition_digest
    or new.fence_token is distinct from old.fence_token
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
    raise exception 'TEST_ONLY_RUNTIME_BROKER_TRANSITION_DENIED';
  end if;

  return new;
end
$test_only_runtime_broker$;

create function careslink_test_only_runtime_broker._deny_truncate()
returns pg_catalog.trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $test_only_runtime_broker$
begin
  raise exception 'TEST_ONLY_RUNTIME_BROKER_TRUNCATE_DENIED';
end
$test_only_runtime_broker$;

create trigger test_only_runtime_broker_transition_guard
before update or delete
on careslink_test_only_runtime_broker.acquisitions
for each row execute function
  careslink_test_only_runtime_broker._guard_transition();

create trigger test_only_runtime_broker_truncate_guard
before truncate
on careslink_test_only_runtime_broker.acquisitions
for each statement execute function
  careslink_test_only_runtime_broker._deny_truncate();

create function careslink_test_only_runtime_broker.acquire(
  p_acquisition_digest pg_catalog.text,
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
as $test_only_runtime_broker$
declare
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_existing careslink_test_only_runtime_broker.acquisitions%rowtype;
  v_fence_token pg_catalog.int8;
  v_issued_at pg_catalog.timestamptz := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  v_runtime_oid pg_catalog.oid;
  v_expires_at_text pg_catalog.text;
begin
  perform careslink_test_only_runtime_broker._assert_management_session();

  if not coalesce(
      p_acquisition_digest ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(
      p_runtime_role ~
        '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$',
      false
    )
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
    or p_expires_at < v_issued_at + pg_catalog.make_interval(secs => 30)
    or p_expires_at > v_issued_at + pg_catalog.make_interval(mins => 10)
    or v_caller is null
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_ACQUIRE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );

  select acquisition.*
  into v_existing
  from careslink_test_only_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = p_acquisition_digest
  for update;

  if found then
    if v_existing.state in ('TOMBSTONED', 'REVOKED')
      or v_existing.future_issuance_blocked
    then
      raise exception 'TEST_ONLY_RUNTIME_BROKER_ACQUIRE_TOMBSTONED';
    end if;

    if v_existing.runtime_role = p_runtime_role
      and v_existing.lease_reference_sha256 = p_lease_reference_sha256
      and v_existing.session_binding_sha256 = p_session_binding_sha256
      and v_existing.credential_verifier_sha256 =
        p_credential_verifier_sha256
      and v_existing.expires_at = p_expires_at
      and v_existing.state in ('ISSUED_UNBOUND', 'ACTIVE')
    then
      raise exception
        'TEST_ONLY_RUNTIME_BROKER_ALREADY_ISSUED_REQUIRES_REVOKE';
    end if;

    raise exception 'TEST_ONLY_RUNTIME_BROKER_ACQUIRE_CONFLICT';
  end if;

  if pg_catalog.to_regrole(p_runtime_role) is not null then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_RUNTIME_ROLE_CONFLICT';
  end if;

  insert into careslink_test_only_runtime_broker.acquisitions (
    acquisition_digest,
    state,
    future_issuance_blocked,
    reusable,
    raw_credential_material_present,
    created_at,
    updated_at
  ) values (
    p_acquisition_digest,
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
    'create role %I with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 1 password %L valid until %L',
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
    'grant careslink_v1_preview_runner_terminal_caller to %I with admin false, inherit false, set true',
    p_runtime_role
  );

  v_runtime_oid := pg_catalog.to_regrole(p_runtime_role);
  if v_runtime_oid is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runtime_oid
        and role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
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
        and not membership.inherit_option
        and membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime_oid
    ) <> 1
    or pg_catalog.has_schema_privilege(
      v_runtime_oid, 'careslink_test_only_runtime_broker', 'USAGE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace =
        'careslink_test_only_runtime_broker'::pg_catalog.regnamespace
        and pg_catalog.has_function_privilege(
          v_runtime_oid, procedure.oid, 'EXECUTE'
        )
    )
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_ISSUANCE_POSTCHECK_FAILED';
  end if;

  update careslink_test_only_runtime_broker.acquisitions
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
    raise exception 'TEST_ONLY_RUNTIME_BROKER_ISSUANCE_FENCE_LOST';
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
$test_only_runtime_broker$;

create function careslink_test_only_runtime_broker.bind(
  p_acquisition_digest pg_catalog.text,
  p_backend_pid pg_catalog.int4
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $test_only_runtime_broker$
declare
  v_acquisition careslink_test_only_runtime_broker.acquisitions%rowtype;
  v_backend_start pg_catalog.timestamptz;
  v_now pg_catalog.timestamptz;
begin
  perform careslink_test_only_runtime_broker._assert_management_session();
  if not coalesce(
      p_acquisition_digest ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(p_backend_pid > 0, false)
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_BIND_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );
  select acquisition.*
  into v_acquisition
  from careslink_test_only_runtime_broker.acquisitions as acquisition
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
    raise exception 'TEST_ONLY_RUNTIME_BROKER_BIND_FENCE_REJECTED';
  end if;

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
        and role_record.rolcanlogin
        and role_record.rolvaliduntil = v_acquisition.expires_at
    ) <> 1
    or v_backend_start < v_acquisition.issued_at -
      pg_catalog.make_interval(secs => 5)
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_BIND_SESSION_INVALID';
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
    raise exception 'TEST_ONLY_RUNTIME_BROKER_BIND_CONFLICT';
  end if;

  update careslink_test_only_runtime_broker.acquisitions
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
    raise exception 'TEST_ONLY_RUNTIME_BROKER_BIND_FENCE_LOST';
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
$test_only_runtime_broker$;

create function careslink_test_only_runtime_broker.tombstone(
  p_acquisition_digest pg_catalog.text
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $test_only_runtime_broker$
declare
  v_acquisition careslink_test_only_runtime_broker.acquisitions%rowtype;
  v_acquisition_found pg_catalog.bool;
  v_now pg_catalog.timestamptz;
  v_role_can_login pg_catalog.bool;
  v_role_identity_count pg_catalog.int4;
  v_role_name pg_catalog.text;
  v_role_oid pg_catalog.oid;
  v_transaction_id pg_catalog.text := pg_catalog.pg_current_xact_id()::pg_catalog.text;
begin
  perform careslink_test_only_runtime_broker._assert_management_session();
  if not coalesce(
    p_acquisition_digest ~ '^[a-f0-9]{64}$', false
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_TOMBSTONE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );
  select acquisition.*
  into v_acquisition
  from careslink_test_only_runtime_broker.acquisitions as acquisition
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
    where role_record.oid = v_acquisition.runtime_role_oid
      or role_record.rolname = v_acquisition.runtime_role;

    if v_role_identity_count > 1 then
      raise exception 'TEST_ONLY_RUNTIME_BROKER_RUNTIME_ROLE_ABA';
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
        raise exception 'TEST_ONLY_RUNTIME_BROKER_RUNTIME_ROLE_ABA';
      end if;
    end if;

    if v_acquisition.state in ('RESERVED', 'ISSUED_UNBOUND', 'ACTIVE') then
      if v_role_identity_count <> 1 then
        raise exception 'TEST_ONLY_RUNTIME_BROKER_RUNTIME_ROLE_MISSING';
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
        raise exception 'TEST_ONLY_RUNTIME_BROKER_LOGIN_FENCE_FAILED';
      end if;
    elsif v_acquisition.state = 'TOMBSTONED'
      and v_role_identity_count = 1
      and v_role_can_login
    then
      raise exception 'TEST_ONLY_RUNTIME_BROKER_LOGIN_FENCE_MISSING';
    elsif v_acquisition.state = 'REVOKED'
      and v_role_identity_count <> 0
    then
      raise exception 'TEST_ONLY_RUNTIME_BROKER_ROLE_RESIDUE';
    end if;
  end if;

  if not v_acquisition_found then
    insert into careslink_test_only_runtime_broker.acquisitions (
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
    update careslink_test_only_runtime_broker.acquisitions
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
      raise exception 'TEST_ONLY_RUNTIME_BROKER_TOMBSTONE_FENCE_LOST';
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
$test_only_runtime_broker$;

create function careslink_test_only_runtime_broker.finalize(
  p_acquisition_digest pg_catalog.text
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $test_only_runtime_broker$
declare
  v_acquisition careslink_test_only_runtime_broker.acquisitions%rowtype;
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
  perform careslink_test_only_runtime_broker._assert_management_session();
  if not coalesce(
    p_acquisition_digest ~ '^[a-f0-9]{64}$', false
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_FINALIZE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );
  select acquisition.*
  into v_acquisition
  from careslink_test_only_runtime_broker.acquisitions as acquisition
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
    raise exception 'TEST_ONLY_RUNTIME_BROKER_FINALIZE_NOT_TOMBSTONED';
  end if;
  if v_acquisition.tombstone_transaction_id =
    pg_catalog.pg_current_xact_id()::pg_catalog.text
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_TOMBSTONE_NOT_DURABLE';
  end if;

  if v_acquisition.state = 'REVOKED' then
    perform pg_catalog.pg_stat_clear_snapshot();
    if exists (
        select 1
        from pg_catalog.pg_roles as role_record
        where role_record.oid = v_acquisition.runtime_role_oid
          or role_record.rolname = v_acquisition.runtime_role
      )
      or exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        where membership.member = v_acquisition.runtime_role_oid
          or membership.roleid = v_acquisition.runtime_role_oid
          or membership.grantor = v_acquisition.runtime_role_oid
      )
      or exists (
        select 1
        from pg_catalog.pg_stat_activity as activity
        where activity.usesysid = v_acquisition.runtime_role_oid
          or activity.usename = v_acquisition.runtime_role
          or (
            v_acquisition.bound_backend_pid is not null
            and activity.pid = v_acquisition.bound_backend_pid
            and activity.backend_start = v_acquisition.bound_backend_start
          )
      )
    then
      raise exception 'TEST_ONLY_RUNTIME_BROKER_REVOKED_RESIDUE';
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
      raise exception 'TEST_ONLY_RUNTIME_BROKER_RUNTIME_ROLE_ABA';
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
        raise exception 'TEST_ONLY_RUNTIME_BROKER_RUNTIME_ROLE_ABA';
      end if;
      if v_role_can_login then
        raise exception 'TEST_ONLY_RUNTIME_BROKER_LOGIN_FENCE_MISSING';
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
        raise exception 'TEST_ONLY_RUNTIME_BROKER_TERMINATE_FAILED';
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
      raise exception 'TEST_ONLY_RUNTIME_BROKER_SESSION_REMAINS';
    end if;

    if v_role_identity_count = 1 then
      if exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        where membership.member = v_acquisition.runtime_role_oid
          and membership.roleid <> v_caller
      ) then
        raise exception 'TEST_ONLY_RUNTIME_BROKER_MEMBERSHIP_DRIFT';
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
        where role_record.oid = v_acquisition.runtime_role_oid
          or role_record.rolname = v_acquisition.runtime_role
      )
      or exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        where membership.member = v_acquisition.runtime_role_oid
          or membership.roleid = v_acquisition.runtime_role_oid
          or membership.grantor = v_acquisition.runtime_role_oid
      )
      or exists (
        select 1
        from pg_catalog.pg_stat_activity as activity
        where activity.usesysid = v_acquisition.runtime_role_oid
          or activity.usename = v_acquisition.runtime_role
          or (
            v_acquisition.bound_backend_pid is not null
            and activity.pid = v_acquisition.bound_backend_pid
            and activity.backend_start =
              v_acquisition.bound_backend_start
          )
      )
    then
      raise exception 'TEST_ONLY_RUNTIME_BROKER_ZERO_RESIDUE_FAILED';
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

  update careslink_test_only_runtime_broker.acquisitions
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
    raise exception 'TEST_ONLY_RUNTIME_BROKER_FINALIZE_FENCE_LOST';
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
$test_only_runtime_broker$;

create function careslink_test_only_runtime_broker.inspect(
  p_acquisition_digest pg_catalog.text
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $test_only_runtime_broker$
declare
  v_acquisition careslink_test_only_runtime_broker.acquisitions%rowtype;
begin
  perform careslink_test_only_runtime_broker._assert_management_session();
  if not coalesce(
    p_acquisition_digest ~ '^[a-f0-9]{64}$', false
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_INSPECT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(p_acquisition_digest, 836492741)
  );
  select acquisition.*
  into v_acquisition
  from careslink_test_only_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = p_acquisition_digest;

  if not found
    or v_acquisition.state <> 'REVOKED'
    or v_acquisition.tombstoned_at is null
    or not v_acquisition.future_issuance_blocked
    or v_acquisition.revoked_at is null
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_NOT_REVOKED';
  end if;

  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_acquisition.runtime_role_oid
        or role_record.rolname = v_acquisition.runtime_role
    ) <> 0
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_acquisition.runtime_role_oid
        or membership.roleid = v_acquisition.runtime_role_oid
        or membership.grantor = v_acquisition.runtime_role_oid
    ) <> 0
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_stat_activity as activity
      where activity.usesysid = v_acquisition.runtime_role_oid
        or activity.usename = v_acquisition.runtime_role
    ) <> 0
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_ATTESTATION_FAILED';
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
$test_only_runtime_broker$;

revoke all on all functions in schema careslink_test_only_runtime_broker
from public, anon, authenticated, service_role, authenticator;
revoke all on all tables in schema careslink_test_only_runtime_broker
from public, anon, authenticated, service_role, authenticator;
revoke all on all sequences in schema careslink_test_only_runtime_broker
from public, anon, authenticated, service_role, authenticator;
revoke all on schema careslink_test_only_runtime_broker
from public, anon, authenticated, service_role, authenticator;

comment on schema careslink_test_only_runtime_broker is
  'TEST_ONLY local PG16/17 durable-fence harness; never a product migration';
comment on table careslink_test_only_runtime_broker.acquisitions is
  'TEST_ONLY permanent metadata tombstones; never stores raw password, SCRAM verifier or DSN';

commit;
