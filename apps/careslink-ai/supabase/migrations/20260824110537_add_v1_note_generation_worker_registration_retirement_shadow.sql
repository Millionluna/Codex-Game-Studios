-- Five-Note worker-registration graceful-retirement shadow control plane.
--
-- Source-only and default-off. The immutable registered-worker manifest keeps
-- status = 'APPROVED' because that value is covered by registration_digest.
-- A row in worker_registration_retirements is the separate, append-only
-- operational fact that rejects new admission/claim work while letting an
-- already-bound attempt drain within its frozen deadlines. This migration
-- creates no retirement, binding, worker credential, caller grant, runtime
-- route, model, vault, Points operation or deployment. Emergency revocation
-- and its in-flight/grant/purge recovery semantics remain a separate blocker.
-- The migration runner owns the transaction boundary.

-- Supabase Hosted may authenticate the CLI with a login role and then enter
-- the migration as its database actor. Preserve that actor transactionally
-- before any temporary owner/executor switch.
select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

create role careslink_v1_generation_registration_control_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;

-- PostgreSQL 16+ role membership options are independent. These SET-only
-- edges are temporary migration mechanics and are removed at the end.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_owner_api_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_registration_control_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Close the new executor's defaults before it owns any definer function.
set role careslink_v1_generation_registration_control_executor;

alter default privileges
  revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges
  revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges
  revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

alter default privileges in schema careslink_v1_generation
  revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Append-only retirement ledger and lock-supporting catalog index
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_owner;

create table careslink_v1_generation.worker_registration_retirements (
  registration_digest text primary key
    references careslink_v1_generation.worker_registrations(
      registration_digest
    )
    on update restrict
    on delete restrict,
  operation_id uuid not null unique,
  reason_code text not null,
  retired_binding_versions text[] not null,
  retired_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  constraint worker_registration_retirements_reason_check check (
    reason_code in ('ROTATED', 'DECOMMISSIONED', 'POLICY_SUPERSEDED')
  ),
  constraint worker_registration_retirements_bindings_check check (
    cardinality(retired_binding_versions) between 0 and 5
    and array_position(retired_binding_versions, null) is null
    and (
      cardinality(retired_binding_versions) = 0
      or (
        array_ndims(retired_binding_versions) = 1
        and array_lower(retired_binding_versions, 1) = 1
      )
    )
  ),
  constraint worker_registration_retirements_time_check check (
    retired_at >= created_at
  ),
  constraint worker_registration_retirements_shadow_check check (
    shadow_only is true
  )
);

-- The admission-binding FK lookup and deterministic control-plane lock scan
-- both use this complete child-side index.
create index admission_policy_bindings_registration_idx
  on careslink_v1_generation.admission_policy_bindings(
    registration_digest,
    binding_version
  );

alter table careslink_v1_generation.worker_registration_retirements
  enable row level security;
alter table careslink_v1_generation.worker_registration_retirements
  force row level security;

create policy worker_registration_retirements_generation_executor_select
  on careslink_v1_generation.worker_registration_retirements
  for select to careslink_v1_generation_executor
  using (true);
create policy worker_registration_retirements_owner_api_select
  on careslink_v1_generation.worker_registration_retirements
  for select to careslink_v1_generation_owner_api_executor
  using (true);
create policy worker_registration_retirements_control_select
  on careslink_v1_generation.worker_registration_retirements
  for select to careslink_v1_generation_registration_control_executor
  using (true);
create policy worker_registration_retirements_control_insert
  on careslink_v1_generation.worker_registration_retirements
  for insert to careslink_v1_generation_registration_control_executor
  with check (shadow_only is true);

-- Row-locking clauses require UPDATE privilege and UPDATE RLS visibility.
-- Identity-column grants plus WITH CHECK(false) make these lock-only paths.
create policy worker_registrations_generation_executor_lock
  on careslink_v1_generation.worker_registrations
  for update to careslink_v1_generation_executor
  using (true)
  with check (false);
create policy worker_registrations_registration_control_select
  on careslink_v1_generation.worker_registrations
  for select to careslink_v1_generation_registration_control_executor
  using (true);
create policy worker_registrations_registration_control_lock
  on careslink_v1_generation.worker_registrations
  for update to careslink_v1_generation_registration_control_executor
  using (true)
  with check (false);
create policy admission_policy_bindings_registration_control_select
  on careslink_v1_generation.admission_policy_bindings
  for select to careslink_v1_generation_registration_control_executor
  using (true);
create policy admission_policy_bindings_registration_control_update
  on careslink_v1_generation.admission_policy_bindings
  for update to careslink_v1_generation_registration_control_executor
  using (true)
  with check (
    status = 'RETIRED'
    and activated_at is not null
    and retired_at is not null
    and retired_at >= activated_at
    and shadow_only is true
  );

revoke all on table
  careslink_v1_generation.worker_registration_retirements
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_registration_control_executor;

grant usage on schema careslink_v1_generation
  to careslink_v1_generation_registration_control_executor;
grant select on careslink_v1_generation.worker_registration_retirements
  to careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_registration_control_executor;
grant insert (
  registration_digest,
  operation_id,
  reason_code,
  retired_binding_versions,
  retired_at,
  created_at,
  shadow_only
) on careslink_v1_generation.worker_registration_retirements
  to careslink_v1_generation_registration_control_executor;

grant select on
  careslink_v1_generation.worker_registrations,
  careslink_v1_generation.admission_policy_bindings
  to careslink_v1_generation_registration_control_executor;
grant update (registration_digest)
  on careslink_v1_generation.worker_registrations
  to careslink_v1_generation_executor,
    careslink_v1_generation_registration_control_executor;
grant update (status, retired_at)
  on careslink_v1_generation.admission_policy_bindings
  to careslink_v1_generation_registration_control_executor;

-- CREATE is temporary and is revoked after the exact helpers, triggers and
-- replacement RPC identities are installed.
grant create on schema careslink_v1_generation
  to careslink_v1_generation_registration_control_executor,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Registration-retirement helper, guards and private control RPC
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_registration_control_executor;

-- The parent row lock is the linearization point. The ledger anti-check is a
-- separate SQL statement so a caller that waited for a concurrent retirement
-- receives a fresh READ COMMITTED snapshot instead of a pre-wait snapshot.
create function careslink_v1_generation._registration_accepts_new_work(
  p_registration_digest text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform registration.registration_digest
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_digest = p_registration_digest
    and registration.status = 'APPROVED'
    and registration.shadow_only is true
  for share;

  if not found then
    return false;
  end if;

  return not exists (
    select 1
    from careslink_v1_generation.worker_registration_retirements
      as retirement
    where retirement.registration_digest = p_registration_digest
      and retirement.shadow_only is true
  );
end;
$$;

create function
  careslink_v1_generation._deny_worker_registration_retirement_mutation()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'IMMUTABLE_RETIREMENT_RECORD';
end;
$$;

create function
  careslink_v1_generation._enforce_active_binding_registration_accepts_new_work()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status = 'ACTIVE'
    and not careslink_v1_generation._registration_accepts_new_work(
      new.registration_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  return new;
end;
$$;

create function
  careslink_v1_generation._enforce_running_attempt_registration_accepts_new_work()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status = 'RUNNING'
    and not careslink_v1_generation._registration_accepts_new_work(
      new.registration_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  return new;
end;
$$;

create function
  careslink_v1_generation.retire_v1_shadow_note_generation_worker_registration(
    p_registration_digest text,
    p_operation_id uuid,
    p_reason_code text,
    p_expected_active_binding_versions text[]
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expected text[];
  v_locked_active text[];
  v_fresh_active text[];
  v_existing
    careslink_v1_generation.worker_registration_retirements%rowtype;
  v_now timestamptz;
  v_updated integer;
begin
  select coalesce(
    array_agg(distinct expected.binding_version order by expected.binding_version),
    array[]::text[]
  )
  into v_expected
  from unnest(p_expected_active_binding_versions) as expected(binding_version);

  if p_registration_digest is null
    or p_registration_digest !~ '^[a-f0-9]{64}$'
    or p_operation_id is null
    or p_reason_code is null
    or p_reason_code not in (
      'ROTATED', 'DECOMMISSIONED', 'POLICY_SUPERSEDED'
    )
    or p_expected_active_binding_versions is null
    or cardinality(p_expected_active_binding_versions) > 5
    or array_position(p_expected_active_binding_versions, null) is not null
    or exists (
      select 1
      from unnest(p_expected_active_binding_versions)
        as expected(binding_version)
      where expected.binding_version
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    )
    or p_expected_active_binding_versions is distinct from v_expected
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  -- Binding-first ordering matches owner admission and binding activation.
  -- Lock every existing binding, not just ACTIVE rows, so the reviewed
  -- expected set cannot be changed in-place while retirement waits.
  perform binding.binding_version
  from careslink_v1_generation.admission_policy_bindings as binding
  where binding.registration_digest = p_registration_digest
  order by binding.binding_version
  for update;

  select coalesce(
    array_agg(binding.binding_version order by binding.binding_version),
    array[]::text[]
  )
  into v_locked_active
  from careslink_v1_generation.admission_policy_bindings as binding
  where binding.registration_digest = p_registration_digest
    and binding.status = 'ACTIVE';

  perform registration.registration_digest
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_digest = p_registration_digest
    and registration.status = 'APPROVED'
    and registration.shadow_only is true
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'REGISTRATION_NOT_FOUND';
  end if;

  -- Both reads are deliberately new statements after the parent lock wait.
  select retirement.*
  into v_existing
  from careslink_v1_generation.worker_registration_retirements as retirement
  where retirement.registration_digest = p_registration_digest;

  if found then
    if v_existing.operation_id = p_operation_id
      and v_existing.reason_code = p_reason_code
      and v_existing.retired_binding_versions is not distinct from v_expected
    then
      return jsonb_build_object(
        'created', false,
        'registrationDigest', v_existing.registration_digest,
        'operationId', v_existing.operation_id,
        'reasonCode', v_existing.reason_code,
        'retiredBindingVersions',
          to_jsonb(v_existing.retired_binding_versions),
        'retiredAt', v_existing.retired_at
      );
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'REGISTRATION_RETIREMENT_CONFLICT';
  end if;

  select coalesce(
    array_agg(binding.binding_version order by binding.binding_version),
    array[]::text[]
  )
  into v_fresh_active
  from careslink_v1_generation.admission_policy_bindings as binding
  where binding.registration_digest = p_registration_digest
    and binding.status = 'ACTIVE';

  if v_fresh_active is distinct from v_locked_active
    or v_fresh_active is distinct from v_expected
  then
    raise exception using
      errcode = 'P0001',
      message = 'ACTIVE_BINDING_CONFLICT';
  end if;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());

  update careslink_v1_generation.admission_policy_bindings as binding
  set status = 'RETIRED',
      retired_at = v_now
  where binding.registration_digest = p_registration_digest
    and binding.binding_version = any(v_expected)
    and binding.status = 'ACTIVE';
  get diagnostics v_updated = row_count;

  if v_updated <> cardinality(v_expected) then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  insert into careslink_v1_generation.worker_registration_retirements (
    registration_digest,
    operation_id,
    reason_code,
    retired_binding_versions,
    retired_at,
    created_at,
    shadow_only
  ) values (
    p_registration_digest,
    p_operation_id,
    p_reason_code,
    v_expected,
    v_now,
    v_now,
    true
  );

  return jsonb_build_object(
    'created', true,
    'registrationDigest', p_registration_digest,
    'operationId', p_operation_id,
    'reasonCode', p_reason_code,
    'retiredBindingVersions', to_jsonb(v_expected),
    'retiredAt', v_now
  );
exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'REGISTRATION_RETIREMENT_CONFLICT';
end;
$$;

-- The table owner needs EXECUTE only while it attaches these exact triggers.
-- Runtime trigger invocation does not retain this temporary function ACL.
grant execute on function
  careslink_v1_generation._deny_worker_registration_retirement_mutation()
  to careslink_v1_generation_owner;
grant execute on function
  careslink_v1_generation._enforce_active_binding_registration_accepts_new_work()
  to careslink_v1_generation_owner;
grant execute on function
  careslink_v1_generation._enforce_running_attempt_registration_accepts_new_work()
  to careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- Attach guards as the catalog owner. Trigger functions remain owned by the
-- low-privilege control executor and expose no callable API surface.
set role careslink_v1_generation_owner;

create trigger worker_registration_retirements_append_only
before update or delete
on careslink_v1_generation.worker_registration_retirements
for each row execute function
  careslink_v1_generation._deny_worker_registration_retirement_mutation();

create trigger admission_policy_bindings_active_registration_gate
before insert or update of status, registration_digest
on careslink_v1_generation.admission_policy_bindings
for each row execute function
  careslink_v1_generation._enforce_active_binding_registration_accepts_new_work();

-- Terminal recovery attempts remain insertable after retirement. Only a new
-- RUNNING authority is denied by this defense-in-depth trigger.
create trigger attempts_running_registration_gate
before insert
on careslink_v1_generation.attempts
for each row
when (new.status = 'RUNNING')
execute function
  careslink_v1_generation._enforce_running_attempt_registration_accepts_new_work();

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- Remove the table owner's trigger-attachment grants, then expose only the
-- content-free boolean helper to the two existing definer executors.
set role careslink_v1_generation_registration_control_executor;

revoke execute on function
  careslink_v1_generation._deny_worker_registration_retirement_mutation()
  from careslink_v1_generation_owner;
revoke execute on function
  careslink_v1_generation._enforce_active_binding_registration_accepts_new_work()
  from careslink_v1_generation_owner;
revoke execute on function
  careslink_v1_generation._enforce_running_attempt_registration_accepts_new_work()
  from careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation._registration_accepts_new_work(text)
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
grant execute on function
  careslink_v1_generation._registration_accepts_new_work(text)
  to careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Worker claim replacement: reject a retired registration before queue scan
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_executor;

create or replace function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    p_registration_digest text,
    p_worker_policy_version text,
    p_worker_policy_digest text,
    p_worker_identity_hash text,
    p_contract_version text,
    p_schema_version text
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_policy record;
  v_job record;
  v_payload record;
  v_attempt_id uuid;
  v_lease_token text;
  v_lease_hash text;
  v_lease_expires_at timestamptz;
  v_attempt_number integer;
begin
  perform careslink_v1_generation._assert_capability();

  if p_registration_digest is null
    or p_registration_digest !~ '^[a-f0-9]{64}$'
    or p_worker_policy_version is null
    or p_worker_policy_digest is null
    or p_worker_policy_digest !~ '^[a-f0-9]{64}$'
    or p_worker_identity_hash is null
    or p_worker_identity_hash !~ '^[a-f0-9]{64}$'
    or p_contract_version is distinct from '1.0.0-shadow.1'
    or p_schema_version is distinct from '2026-08-09.v1-shadow'
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  -- This gate runs even when the queue is empty. Its parent FOR SHARE lock is
  -- retained for the transaction; a retirement that commits first is seen by
  -- the helper's second statement, while one that starts later must wait.
  if not careslink_v1_generation._registration_accepts_new_work(
      p_registration_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      p_worker_identity_hash,
      p_contract_version,
      p_schema_version
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  select policy.* into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  join careslink_v1_generation.worker_registration_provider_policies
    as provider_binding
    on provider_binding.registration_digest = p_registration_digest
   and provider_binding.note_type = job.note_type
   and provider_binding.policy_version = job.provider_policy_version
   and provider_binding.policy_digest = job.provider_policy_digest
  join careslink_v1_generation.worker_registrations as registration
    on registration.registration_digest = p_registration_digest
   and registration.worker_policy_version = job.worker_policy_version
   and registration.worker_policy_digest = job.worker_policy_digest
   and registration.payload_policy_version = job.payload_policy_version
   and registration.payload_policy_snapshot_hash =
     job.payload_policy_snapshot_hash
  where job.status = 'QUEUED'
    and (job.next_eligible_at is null or job.next_eligible_at <= v_now)
    and job.worker_policy_version = p_worker_policy_version
    and job.worker_policy_digest = p_worker_policy_digest
    and job.contract_version = p_contract_version
    and job.schema_version = p_schema_version
    and job.attempt_count < v_policy.max_attempts
    and job.created_at +
      v_policy.max_queue_age_ms * interval '1 millisecond' > v_now
    and payload.state = 'AVAILABLE'
    and payload.expires_at > v_now
    and payload.privacy_proof_expires_at > v_now
    and payload.expires_at - v_now >=
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
    and payload.privacy_proof_expires_at - v_now >=
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
    and payload.policy_version = job.payload_policy_version
    and payload.policy_snapshot_hash = job.payload_policy_snapshot_hash
    and payload.cleaned_facts_hash = job.cleaned_facts_hash
    and payload.request_hash = job.request_hash
    and payload.note_type = job.note_type
    and payload.source_locale = job.source_locale
    and payload.privacy_review_id = job.privacy_review_id
    and careslink_v1_generation._payload_snapshot_is_valid(
      payload.policy_version,
      payload.policy_snapshot_hash,
      payload.encryption_profile_version,
      payload.backup_disposition_version
    )
  order by coalesce(job.next_eligible_at, job.created_at), job.created_at, job.id
  for update of job skip locked
  limit 1;

  if v_job.id is null then
    return jsonb_build_object('status', 'IDLE', 'claim', null);
  end if;

  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at - v_now <
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
    or v_payload.privacy_proof_expires_at - v_now <
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  v_attempt_number := v_job.attempt_count + 1;
  v_attempt_id := extensions.gen_random_uuid();
  v_lease_token := careslink_v1_generation._new_opaque_secret();
  v_lease_hash := careslink_v1_generation._sha256_text(v_lease_token);
  v_lease_expires_at := least(
    v_now + v_policy.lease_duration_ms * interval '1 millisecond',
    v_now + v_policy.attempt_deadline_ms * interval '1 millisecond',
    v_payload.expires_at,
    v_payload.privacy_proof_expires_at
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
    v_attempt_id,
    v_job.id,
    v_job.owner_user_id,
    v_attempt_number,
    'RUNNING',
    p_worker_identity_hash,
    p_registration_digest,
    v_lease_hash,
    v_now,
    v_now,
    v_lease_expires_at,
    v_now,
    true
  );

  update careslink_v1_generation.jobs as job
  set status = 'RUNNING',
      attempt_count = v_attempt_number,
      next_eligible_at = null,
      failure_reason = null,
      started_at = coalesce(job.started_at, v_now),
      finished_at = null,
      updated_at = v_now
  where job.id = v_job.id
    and job.status = 'QUEUED';

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  return jsonb_build_object(
    'status', 'CLAIMED',
    'claim', jsonb_build_object(
      'job', jsonb_build_object(
        'jobId', v_job.id,
        'payloadId', v_job.payload_id,
        'noteType', v_job.note_type,
        'sourceLocale', v_job.source_locale,
        'serviceCode', v_job.service_code,
        'contractVersion', v_job.contract_version,
        'schemaVersion', v_job.schema_version,
        'workerPolicyVersion', v_job.worker_policy_version,
        'workerPolicyDigest', v_job.worker_policy_digest,
        'providerPolicyVersion', v_job.provider_policy_version,
        'providerPolicyDigest', v_job.provider_policy_digest,
        'payloadPolicyVersion', v_job.payload_policy_version,
        'payloadPolicySnapshotHash', v_job.payload_policy_snapshot_hash,
        'cleanedFactsHash', v_job.cleaned_facts_hash,
        'status', 'RUNNING'
      ),
      'attempt', jsonb_build_object(
        'attemptId', v_attempt_id,
        'ordinal', v_attempt_number,
        'status', 'RUNNING',
        'leaseTokenHash', v_lease_hash,
        'workerIdentityHash', p_worker_identity_hash,
        'registrationDigest', p_registration_digest
      ),
      'leaseToken', v_lease_token
    )
  );
end;
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Owner admission replacement: replay first, then binding -> registration
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_owner_api_executor;

create or replace function
  careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
    p_owner_user_id uuid,
    p_session_id uuid,
    p_admission_transport text,
    p_job_id uuid,
    p_payload_id uuid,
    p_privacy_review_id uuid,
    p_note_type text,
    p_source_locale text,
    p_contract_version text,
    p_schema_version text,
    p_cleaned_facts_hash text,
    p_idempotency_hash text,
    p_request_hash text,
    p_payload_handle_hash text,
    p_payload_expires_at timestamptz
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_payload_expires_at timestamptz;
  v_privacy_expires_at timestamptz;
  v_service_code text;
  v_existing_job careslink_v1_generation.jobs%rowtype;
  v_existing_payload careslink_v1_generation.payloads%rowtype;
  v_binding record;
  v_binding_registration_digest text;
  v_payload_accepted boolean;
  v_existing_job_found boolean;
begin
  perform careslink_v1_generation._owner_api_assert_contract(
    p_contract_version,
    p_schema_version
  );

  if p_owner_user_id is null
    or p_session_id is null
    or p_job_id is null
    or p_payload_id is null
    or p_privacy_review_id is null
    or p_admission_transport is null
    or p_admission_transport not in ('BEARER', 'COOKIE')
    or p_note_type is null
    or p_note_type not in (
      'communication', 'handover', 'progress', 'ndis', 'incident_factual'
    )
    or p_source_locale is null
    or p_source_locale not in ('en', 'zh-Hans', 'zh-Hant')
    or p_cleaned_facts_hash is null
    or p_cleaned_facts_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_hash is null
    or p_idempotency_hash !~ '^[a-f0-9]{64}$'
    or p_request_hash is null
    or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_payload_handle_hash is null
    or p_payload_handle_hash !~ '^[a-f0-9]{64}$'
    or p_payload_expires_at is null
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  v_payload_expires_at := date_trunc('milliseconds', p_payload_expires_at);
  perform careslink_v1_generation._set_owner(p_owner_user_id);

  -- One owner/idempotency lane serializes all exact replays and changed-input
  -- races before either transaction inspects or creates durable state.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_owner_user_id::text || ':' || p_idempotency_hash,
      0
    )
  );

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  -- The metadata reader can itself wait on auth row locks. Re-read wall time
  -- after those locks are held so transaction start time cannot extend a
  -- session beyond its actual not_after boundary.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  select job.*
  into v_existing_job
  from careslink_v1_generation.jobs as job
  where job.owner_user_id = p_owner_user_id
    and job.idempotency_hash = p_idempotency_hash
  for update;
  v_existing_job_found := found;

  -- A same-lane transaction may have held the durable job lock after the
  -- advisory lock was acquired. Refresh and revalidate at the post-lock time.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  if v_existing_job_found then
    if v_existing_job.request_hash is distinct from p_request_hash
      or v_existing_job.note_type is distinct from p_note_type
      or v_existing_job.source_locale is distinct from p_source_locale
      or v_existing_job.privacy_review_id is distinct from p_privacy_review_id
      or v_existing_job.cleaned_facts_hash
        is distinct from p_cleaned_facts_hash
      or v_existing_job.contract_version is distinct from p_contract_version
      or v_existing_job.schema_version is distinct from p_schema_version
    then
      raise exception using
        errcode = 'P0001',
        message = 'IDEMPOTENCY_CONFLICT';
    end if;

    select payload.*
    into v_existing_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = v_existing_job.payload_id
      and payload.job_id = v_existing_job.id
      and payload.owner_user_id = p_owner_user_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
    if not careslink_v1_generation.fresh_session_is_active(
      p_owner_user_id,
      p_session_id,
      v_now
    ) then
      raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
    end if;

    v_payload_accepted := p_payload_id = v_existing_payload.id;
    if v_payload_accepted
      and (
        p_job_id is distinct from v_existing_job.id
        or v_existing_payload.payload_handle_hash
          is distinct from p_payload_handle_hash
        or v_existing_payload.expires_at
          is distinct from v_payload_expires_at
      )
    then
      raise exception using
        errcode = 'P0001',
        message = 'IDENTITY_LINK_CONFLICT';
    end if;

    return jsonb_build_object(
      'created', false,
      'payloadAccepted', v_payload_accepted,
      'job', careslink_v1_generation._owner_api_job_view(
        v_existing_job.id,
        p_owner_user_id
      )
    );
  end if;

  -- Recovery/status/cancel remain usable during an incident, but a new job is
  -- admitted only after a separate control-plane migration both removes the
  -- hard-off constraint and enables this single shadow capability.
  perform setting.capability
  from careslink_v1_generation.settings as setting
  where setting.capability = 'note_generation_v1'
    and setting.enabled is true
    and setting.shadow_only is true
  for share;
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  -- Fix the cross-surface lock order before any registration row is locked:
  -- admission and retirement both acquire binding then registration. This
  -- pre-lock also keeps a concurrent binding retirement from splitting the
  -- selector read from the policy-vector locks below.
  select binding.registration_digest
  into v_binding_registration_digest
  from careslink_v1_generation.admission_policy_bindings as binding
  where binding.note_type = p_note_type
    and binding.status = 'ACTIVE'
    and binding.retired_at is null
    and binding.shadow_only is true
  order by binding.binding_version
  for share of binding;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  -- The helper takes the parent registration FOR SHARE and then fresh-reads
  -- the append-only ledger in a separate statement. The parent lock remains
  -- held through both durable inserts below.
  if not careslink_v1_generation._registration_accepts_new_work(
      v_binding_registration_digest
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  -- The database owns the only runtime binding. Callers cannot choose policy
  -- versions or make admission fall back to an arbitrary catalog row.
  select
    binding.registration_digest,
    binding.activated_at,
    registration.worker_identity_hash,
    registration.worker_policy_version,
    registration.worker_policy_digest,
    registration.payload_policy_version,
    registration.payload_policy_snapshot_hash,
    worker_policy.minimum_payload_remaining_at_claim_ms,
    payload_policy.encryption_profile_version,
    payload_policy.backup_disposition_version,
    provider_binding.policy_version as provider_policy_version,
    provider_binding.policy_digest as provider_policy_digest,
    provider_policy.service_code,
    provider_policy.rate_catalog_version,
    provider_policy.timeout_ms,
    worker_policy.provider_deadline_ms
  into v_binding
  from careslink_v1_generation.admission_policy_bindings as binding
  join careslink_v1_generation.worker_registrations as registration
    on registration.registration_digest = binding.registration_digest
  join careslink_v1_generation.worker_policies as worker_policy
    on worker_policy.version = registration.worker_policy_version
    and worker_policy.policy_digest = registration.worker_policy_digest
  join careslink_v1_generation.payload_policies as payload_policy
    on payload_policy.policy_version = registration.payload_policy_version
    and payload_policy.policy_digest =
      registration.payload_policy_snapshot_hash
  join careslink_v1_generation.worker_registration_provider_policies
    as provider_binding
    on provider_binding.registration_digest = registration.registration_digest
    and provider_binding.note_type = binding.note_type
  join careslink_v1_generation.provider_policies as provider_policy
    on provider_policy.note_type = provider_binding.note_type
    and provider_policy.policy_version = provider_binding.policy_version
    and provider_policy.policy_digest = provider_binding.policy_digest
  where binding.note_type = p_note_type
    and binding.registration_digest = v_binding_registration_digest
    and binding.status = 'ACTIVE'
    and binding.retired_at is null
    and binding.shadow_only is true
    and registration.status = 'APPROVED'
    and registration.shadow_only is true
    and worker_policy.status = 'APPROVED'
    and worker_policy.shadow_only is true
    and payload_policy.status = 'APPROVED'
    and payload_policy.shadow_only is true
    and provider_binding.shadow_only is true
    and provider_policy.status = 'APPROVED'
    and provider_policy.shadow_only is true
  for share of binding, registration, worker_policy, payload_policy,
    provider_binding, provider_policy;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;
  if v_binding.activated_at > v_now then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  -- Lock the complete five-Note registration vector before recomputing its
  -- digest, so a concurrent control-plane edit cannot split validation from
  -- the exact policy snapshot persisted on the job.
  perform provider_binding.note_type
  from careslink_v1_generation.worker_registration_provider_policies
    as provider_binding
  join careslink_v1_generation.provider_policies as provider_policy
    on provider_policy.note_type = provider_binding.note_type
    and provider_policy.policy_version = provider_binding.policy_version
    and provider_policy.policy_digest = provider_binding.policy_digest
  where provider_binding.registration_digest = v_binding.registration_digest
  order by provider_binding.note_type
  for share of provider_binding, provider_policy;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  if not careslink_v1_generation._worker_policy_is_valid(
      v_binding.worker_policy_version,
      v_binding.worker_policy_digest
    )
    or not careslink_v1_generation._provider_policy_is_valid(
      p_note_type,
      v_binding.provider_policy_version,
      v_binding.provider_policy_digest
    )
    or not careslink_v1_generation._payload_snapshot_is_valid(
      v_binding.payload_policy_version,
      v_binding.payload_policy_snapshot_hash,
      v_binding.encryption_profile_version,
      v_binding.backup_disposition_version
    )
    or not careslink_v1_generation._registration_is_valid(
      v_binding.registration_digest,
      v_binding.worker_policy_version,
      v_binding.worker_policy_digest,
      v_binding.worker_identity_hash,
      p_contract_version,
      p_schema_version
    )
    or v_binding.timeout_ms <> v_binding.provider_deadline_ms
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  v_privacy_expires_at :=
    careslink_v1_generation.fresh_privacy_proof_expires_at(
      p_privacy_review_id,
      p_owner_user_id,
      p_note_type,
      p_cleaned_facts_hash,
      p_schema_version,
      p_contract_version,
      v_now
    );

  -- Privacy review acquisition can block independently of the catalog locks.
  -- Re-evaluate both caller and proof using one post-lock wall-clock time.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  v_privacy_expires_at :=
    careslink_v1_generation.fresh_privacy_proof_expires_at(
      p_privacy_review_id,
      p_owner_user_id,
      p_note_type,
      p_cleaned_facts_hash,
      p_schema_version,
      p_contract_version,
      v_now
    );

  if v_privacy_expires_at is null
    or v_payload_expires_at <= v_now
    or v_payload_expires_at > v_privacy_expires_at
    or v_payload_expires_at - v_now <
      v_binding.minimum_payload_remaining_at_claim_ms
        * interval '1 millisecond'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRIVACY_REVIEW_STALE';
  end if;

  v_service_code := case p_note_type
    when 'communication' then 'note.communication.generate'
    when 'handover' then 'note.handover.generate'
    when 'progress' then 'note.progress.generate'
    when 'ndis' then 'note.ndis.generate'
    when 'incident_factual' then 'note.incident_factual.generate'
  end;

  if v_binding.service_code is distinct from v_service_code then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

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
    next_eligible_at,
    created_at,
    updated_at,
    shadow_only
  ) values (
    p_job_id,
    p_owner_user_id,
    p_session_id,
    p_admission_transport,
    p_payload_id,
    p_note_type,
    p_source_locale,
    v_service_code,
    v_binding.rate_catalog_version,
    p_contract_version,
    p_schema_version,
    p_privacy_review_id,
    '2026-08-11.preview.1',
    1,
    p_cleaned_facts_hash,
    p_idempotency_hash,
    p_request_hash,
    v_binding.worker_policy_version,
    v_binding.worker_policy_digest,
    v_binding.provider_policy_version,
    v_binding.provider_policy_digest,
    v_binding.payload_policy_version,
    v_binding.payload_policy_snapshot_hash,
    'QUEUED',
    0,
    v_now,
    v_now,
    v_now,
    true
  );

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
  ) values (
    p_payload_id,
    p_job_id,
    p_owner_user_id,
    p_note_type,
    p_source_locale,
    p_contract_version,
    p_schema_version,
    p_privacy_review_id,
    v_privacy_expires_at,
    p_cleaned_facts_hash,
    p_request_hash,
    v_binding.payload_policy_version,
    v_binding.encryption_profile_version,
    v_binding.backup_disposition_version,
    v_binding.payload_policy_snapshot_hash,
    p_payload_handle_hash,
    'AVAILABLE',
    v_payload_expires_at,
    v_now,
    0,
    v_now,
    v_now,
    true
  );

  -- Caller-supplied job/payload identities can contend with another
  -- idempotency lane at their unique indexes. Re-prove admission after both
  -- inserts have cleared those waits; any expiry rolls the inserted pair back.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  v_privacy_expires_at :=
    careslink_v1_generation.fresh_privacy_proof_expires_at(
      p_privacy_review_id,
      p_owner_user_id,
      p_note_type,
      p_cleaned_facts_hash,
      p_schema_version,
      p_contract_version,
      v_now
    );
  if v_privacy_expires_at is null
    or v_payload_expires_at <= v_now
    or v_payload_expires_at > v_privacy_expires_at
    or v_payload_expires_at - v_now <
      v_binding.minimum_payload_remaining_at_claim_ms
        * interval '1 millisecond'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRIVACY_REVIEW_STALE';
  end if;

  return jsonb_build_object(
    'created', true,
    'payloadAccepted', true,
    'job', careslink_v1_generation._owner_api_job_view(
      p_job_id,
      p_owner_user_id
    )
  );
exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
end;
$$;


select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);


-- ---------------------------------------------------------------------------
-- Exact privilege closure and temporary-role cleanup
-- ---------------------------------------------------------------------------

-- Reassert every callable surface. The retirement control identity remains
-- executable only by its NOLOGIN owner; helper execution stays limited to the
-- two existing NOLOGIN runtime executors.
set role careslink_v1_generation_registration_control_executor;

revoke all on function
  careslink_v1_generation.retire_v1_shadow_note_generation_worker_registration(
    text, uuid, text, text[]
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._registration_accepts_new_work(text)
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation._deny_worker_registration_retirement_mutation()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._enforce_active_binding_registration_accepts_new_work()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._enforce_running_attempt_registration_accepts_new_work()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_executor;

revoke all on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    text, text, text, text, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_registration_control_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner_api_executor;

revoke all on function
  careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
    uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, text,
    text, text, text, timestamptz
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_registration_control_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;

revoke create on schema careslink_v1_generation
  from careslink_v1_generation_registration_control_executor,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on table
  careslink_v1_generation.worker_registration_retirements
  from public, anon, authenticated, service_role;
revoke all on type
  careslink_v1_generation.worker_registration_retirements
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_registration_control_executor;
revoke all on all tables in schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema careslink_v1_generation
  from public, anon, authenticated, service_role;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- Remove only this migration's temporary PostgreSQL-16 SET edges. Every
-- executor remains NOLOGIN and no runtime caller membership is introduced.
revoke careslink_v1_generation_registration_control_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner_api_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;
