-- Five-Note owner admission/runtime repository shadow RPCs.
--
-- Source-only and default-off. This migration adds no active admission binding,
-- payload, job, route, caller credential, model, vault, Points operation or
-- deployment. The three private RPCs receive only a trusted server principal
-- plus metadata-only vault staging evidence; every API role remains denied.
-- The migration runner owns the transaction boundary.

create role careslink_v1_generation_owner_api_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;

-- PostgreSQL 16+ role membership options are independent. These SET-only
-- edges are temporary migration mechanics; all are removed at the end.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_owner_api_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Close the new executor's defaults before it owns any definer function.
set role careslink_v1_generation_owner_api_executor;

alter default privileges
  revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
alter default privileges
  revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
alter default privileges
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
alter default privileges
  revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;

alter default privileges in schema careslink_v1_generation
  revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;

reset role;

set role careslink_v1_generation_owner;

-- Runtime admission never guesses a catalog row and callers never supply a
-- policy digest. A separate reviewed control-plane change must create exactly
-- one ACTIVE binding for a Note type before a new job can be accepted.
create table careslink_v1_generation.admission_policy_bindings (
  binding_version text primary key,
  note_type text not null,
  registration_digest text not null
    references careslink_v1_generation.worker_registrations(
      registration_digest
    ) on delete restrict,
  status text not null,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  unique (note_type, binding_version),
  constraint admission_policy_bindings_version_check check (
    binding_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint admission_policy_bindings_note_type_check check (
    note_type in (
      'communication', 'handover', 'progress', 'ndis', 'incident_factual'
    )
  ),
  constraint admission_policy_bindings_status_check check (
    status in ('DRAFT', 'ACTIVE', 'RETIRED')
  ),
  constraint admission_policy_bindings_lifecycle_check check (
    (
      status = 'DRAFT'
      and activated_at is null
      and retired_at is null
    )
    or (
      status = 'ACTIVE'
      and activated_at is not null
      and retired_at is null
    )
    or (
      status = 'RETIRED'
      and activated_at is not null
      and retired_at is not null
      and retired_at >= activated_at
    )
  ),
  constraint admission_policy_bindings_time_check check (
    activated_at is null or activated_at >= created_at
  ),
  constraint admission_policy_bindings_shadow_check check (
    shadow_only is true
  )
);

create unique index admission_policy_bindings_one_active_note_idx
  on careslink_v1_generation.admission_policy_bindings(note_type)
  where status = 'ACTIVE';

alter table careslink_v1_generation.admission_policy_bindings
  enable row level security;
alter table careslink_v1_generation.admission_policy_bindings
  force row level security;

-- The worker executor intentionally has cross-owner queue visibility. The
-- owner API receives a separate role and policies so those permissive worker
-- policies can never turn into an owner-facing BOLA path.
create policy settings_owner_api_select
  on careslink_v1_generation.settings
  for select to careslink_v1_generation_owner_api_executor
  using (true);
create policy admission_policy_bindings_owner_api_select
  on careslink_v1_generation.admission_policy_bindings
  for select to careslink_v1_generation_owner_api_executor
  using (true);
create policy worker_policies_owner_api_select
  on careslink_v1_generation.worker_policies
  for select to careslink_v1_generation_owner_api_executor
  using (true);
create policy provider_policies_owner_api_select
  on careslink_v1_generation.provider_policies
  for select to careslink_v1_generation_owner_api_executor
  using (true);
create policy payload_policies_owner_api_select
  on careslink_v1_generation.payload_policies
  for select to careslink_v1_generation_owner_api_executor
  using (true);
create policy worker_registrations_owner_api_select
  on careslink_v1_generation.worker_registrations
  for select to careslink_v1_generation_owner_api_executor
  using (true);
create policy registration_provider_owner_api_select
  on careslink_v1_generation.worker_registration_provider_policies
  for select to careslink_v1_generation_owner_api_executor
  using (true);

-- SELECT ... FOR SHARE also evaluates UPDATE RLS visibility. These policies
-- make reviewed catalog rows lockable while an always-false WITH CHECK keeps
-- every direct UPDATE fail-closed, including a no-op identity-column update.
create policy settings_owner_api_lock
  on careslink_v1_generation.settings
  for update to careslink_v1_generation_owner_api_executor
  using (true)
  with check (false);
create policy admission_policy_bindings_owner_api_lock
  on careslink_v1_generation.admission_policy_bindings
  for update to careslink_v1_generation_owner_api_executor
  using (true)
  with check (false);
create policy worker_policies_owner_api_lock
  on careslink_v1_generation.worker_policies
  for update to careslink_v1_generation_owner_api_executor
  using (true)
  with check (false);
create policy provider_policies_owner_api_lock
  on careslink_v1_generation.provider_policies
  for update to careslink_v1_generation_owner_api_executor
  using (true)
  with check (false);
create policy payload_policies_owner_api_lock
  on careslink_v1_generation.payload_policies
  for update to careslink_v1_generation_owner_api_executor
  using (true)
  with check (false);
create policy worker_registrations_owner_api_lock
  on careslink_v1_generation.worker_registrations
  for update to careslink_v1_generation_owner_api_executor
  using (true)
  with check (false);
create policy registration_provider_owner_api_lock
  on careslink_v1_generation.worker_registration_provider_policies
  for update to careslink_v1_generation_owner_api_executor
  using (true)
  with check (false);

create policy jobs_owner_api_select
  on careslink_v1_generation.jobs
  for select to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy jobs_owner_api_insert
  on careslink_v1_generation.jobs
  for insert to careslink_v1_generation_owner_api_executor
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy jobs_owner_api_update
  on careslink_v1_generation.jobs
  for update to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  )
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );

create policy attempts_owner_api_select
  on careslink_v1_generation.attempts
  for select to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy attempts_owner_api_update
  on careslink_v1_generation.attempts
  for update to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  )
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );

create policy payloads_owner_api_select
  on careslink_v1_generation.payloads
  for select to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy payloads_owner_api_insert
  on careslink_v1_generation.payloads
  for insert to careslink_v1_generation_owner_api_executor
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy payloads_owner_api_update
  on careslink_v1_generation.payloads
  for update to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  )
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );

create policy payload_grants_owner_api_select
  on careslink_v1_generation.payload_grants
  for select to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy payload_grants_owner_api_update
  on careslink_v1_generation.payload_grants
  for update to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  )
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );

create policy purge_outbox_owner_api_select
  on careslink_v1_generation.payload_purge_outbox
  for select to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy purge_outbox_owner_api_insert
  on careslink_v1_generation.payload_purge_outbox
  for insert to careslink_v1_generation_owner_api_executor
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy purge_outbox_owner_api_lock
  on careslink_v1_generation.payload_purge_outbox
  for update to careslink_v1_generation_owner_api_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  )
  with check (false);

grant usage on schema careslink_v1_generation
  to careslink_v1_generation_owner_api_executor;
grant select on
  careslink_v1_generation.settings,
  careslink_v1_generation.admission_policy_bindings,
  careslink_v1_generation.worker_policies,
  careslink_v1_generation.provider_policies,
  careslink_v1_generation.payload_policies,
  careslink_v1_generation.worker_registrations,
  careslink_v1_generation.worker_registration_provider_policies,
  careslink_v1_generation.jobs,
  careslink_v1_generation.attempts,
  careslink_v1_generation.payloads,
  careslink_v1_generation.payload_grants,
  careslink_v1_generation.payload_purge_outbox
  to careslink_v1_generation_owner_api_executor;

-- PostgreSQL row-locking clauses require UPDATE privilege on at least one
-- column of every locked relation. Grant only one identity column per catalog;
-- each owner-API UPDATE RLS policy is lock-only with WITH CHECK (false), so
-- the grants authorize FOR SHARE without authorizing catalog mutation.
grant update (capability)
  on careslink_v1_generation.settings
  to careslink_v1_generation_owner_api_executor;
grant update (binding_version)
  on careslink_v1_generation.admission_policy_bindings
  to careslink_v1_generation_owner_api_executor;
grant update (version)
  on careslink_v1_generation.worker_policies
  to careslink_v1_generation_owner_api_executor;
grant update (note_type)
  on careslink_v1_generation.provider_policies
  to careslink_v1_generation_owner_api_executor;
grant update (policy_version)
  on careslink_v1_generation.payload_policies
  to careslink_v1_generation_owner_api_executor;
grant update (registration_digest)
  on careslink_v1_generation.worker_registrations
  to careslink_v1_generation_owner_api_executor;
grant update (registration_digest)
  on careslink_v1_generation.worker_registration_provider_policies
  to careslink_v1_generation_owner_api_executor;

grant insert (
  id, owner_user_id, initiating_session_id, admission_transport,
  payload_id, note_type, source_locale, service_code,
  rate_catalog_version, contract_version, schema_version,
  privacy_review_id, privacy_scanner_policy_version,
  privacy_review_revision, cleaned_facts_hash, idempotency_hash,
  request_hash, worker_policy_version, worker_policy_digest,
  provider_policy_version, provider_policy_digest,
  payload_policy_version, payload_policy_snapshot_hash,
  status, attempt_count, next_eligible_at, created_at, updated_at,
  shadow_only
) on careslink_v1_generation.jobs
  to careslink_v1_generation_owner_api_executor;
grant update (
  status, next_eligible_at, failure_reason, updated_at, finished_at
) on careslink_v1_generation.jobs
  to careslink_v1_generation_owner_api_executor;

grant update (
  status, failure_reason, finished_at, terminal_transaction_id
) on careslink_v1_generation.attempts
  to careslink_v1_generation_owner_api_executor;

grant insert (
  id, job_id, owner_user_id, note_type, source_locale,
  contract_version, schema_version, privacy_review_id,
  privacy_proof_expires_at, cleaned_facts_hash, request_hash,
  policy_version, encryption_profile_version,
  backup_disposition_version, policy_snapshot_hash,
  payload_handle_hash, state, expires_at, available_at,
  purge_attempt_count, created_at, updated_at, shadow_only
) on careslink_v1_generation.payloads
  to careslink_v1_generation_owner_api_executor;
grant update (
  state, revoked_at, revoke_reason, purge_requested_at, updated_at
) on careslink_v1_generation.payloads
  to careslink_v1_generation_owner_api_executor;

grant update (status, revoked_at)
  on careslink_v1_generation.payload_grants
  to careslink_v1_generation_owner_api_executor;
grant insert (
  id, transaction_id, payload_id, job_id, owner_user_id, reason,
  event_reference_hash, status, requested_at, attempt_count,
  created_at, shadow_only
) on careslink_v1_generation.payload_purge_outbox
  to careslink_v1_generation_owner_api_executor;
grant update (id)
  on careslink_v1_generation.payload_purge_outbox
  to careslink_v1_generation_owner_api_executor;

-- CREATE is temporary and is revoked after the exact helper/RPC identities are
-- owned by the low-privilege owner API executor.
grant create on schema careslink_v1_generation
  to careslink_v1_generation_owner_api_executor;

reset role;

-- Close the SECURITY INVOKER dependency chain without relying on mutable
-- PUBLIC schema defaults. No CREATE privilege is granted on either schema.
grant usage on schema public, extensions
  to careslink_v1_generation_owner_api_executor;

-- Existing worker helpers remain worker-owned. Grant only the invoker helper
-- chain required by owner admission/cancellation; no worker RPC is granted.
set role careslink_v1_generation_executor;
grant execute on function careslink_v1_generation._server_time(timestamptz)
  to careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation._sha256_text(text)
  to careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation._set_owner(uuid)
  to careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation._worker_policy_is_valid(
  text, text
) to careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation._provider_policy_is_valid(
  text, text, text
) to careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation._registration_is_valid(
  text, text, text, text, text, text
) to careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation._payload_snapshot_is_valid(
  text, text, text, text
) to careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation._enqueue_payload_purge(
  uuid, uuid, uuid, uuid, text, timestamptz
) to careslink_v1_generation_owner_api_executor;
reset role;

-- These two metadata-only readers are migration-actor owned because Supabase
-- owns auth. The owner executor receives only exact EXECUTE, never auth table
-- or schema access.
grant execute on function careslink_v1_generation.fresh_session_is_active(
  uuid, uuid, timestamptz
) to careslink_v1_generation_owner_api_executor;
grant execute on function
  careslink_v1_generation.fresh_privacy_proof_expires_at(
    uuid, uuid, text, text, text, text, timestamptz
  ) to careslink_v1_generation_owner_api_executor;
grant execute on function public.v1_shadow_canonical_json(jsonb)
  to careslink_v1_generation_owner_api_executor;
grant execute on function public.v1_shadow_content_sha256(jsonb)
  to careslink_v1_generation_owner_api_executor;
grant execute on function extensions.gen_random_uuid()
  to careslink_v1_generation_owner_api_executor;
grant execute on function extensions.digest(bytea, text)
  to careslink_v1_generation_owner_api_executor;

-- ---------------------------------------------------------------------------
-- Owner-safe response and private owner runtime RPCs
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_owner_api_executor;

create function careslink_v1_generation._owner_api_assert_contract(
  p_contract_version text,
  p_schema_version text
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_contract_version is distinct from '1.0.0-shadow.1'
    or p_schema_version is distinct from '2026-08-09.v1-shadow'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MIN_CLIENT_VERSION';
  end if;
end;
$$;

-- Exact owner envelope: no owner/session/proof/hash/payload/policy/lease,
-- worker or provider evidence crosses this boundary. Internal worker failure
-- reasons collapse to the small owner-safe failure taxonomy.
create function careslink_v1_generation._owner_api_job_view(
  p_job_id uuid,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_job careslink_v1_generation.jobs%rowtype;
  v_failure_code text;
  v_result jsonb;
begin
  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.owner_user_id = p_owner_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  v_failure_code := case
    when v_job.status <> 'FAILED' then null
    when v_job.failure_reason = 'SESSION_REVOKED' then 'SESSION_REVOKED'
    when v_job.failure_reason = 'PRIVACY_REVIEW_STALE'
      then 'PRIVACY_REVIEW_STALE'
    else 'GENERATION_FAILED'
  end;

  v_result := case when v_job.status = 'SUCCEEDED' then
    jsonb_build_object(
      'canonicalId', v_job.result_document_id,
      'revisionId', v_job.result_revision_id,
      'contentHash', v_job.result_content_hash,
      'revisionNumber', 1,
      'baseRevisionId', null,
      'saveState', 'SERVER_ACKNOWLEDGED'
    )
  else null end;

  return jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'noteType', v_job.note_type,
    'serviceCode', v_job.service_code,
    'attemptCount', v_job.attempt_count,
    'createdAt', careslink_v1_generation._server_time(v_job.created_at),
    'updatedAt', careslink_v1_generation._server_time(v_job.updated_at),
    'startedAt', careslink_v1_generation._server_time(v_job.started_at),
    'finishedAt', careslink_v1_generation._server_time(v_job.finished_at),
    'failureCode', v_failure_code,
    'result', v_result
  );
end;
$$;

create function
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

create function
  careslink_v1_generation.get_v1_shadow_note_generation_job_status(
    p_owner_user_id uuid,
    p_session_id uuid,
    p_job_id uuid,
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
  v_now timestamptz;
begin
  perform careslink_v1_generation._owner_api_assert_contract(
    p_contract_version,
    p_schema_version
  );
  if p_owner_user_id is null or p_session_id is null or p_job_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform careslink_v1_generation._set_owner(p_owner_user_id);
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  -- The reader's auth/session FOR SHARE locks can wait. Linearize freshness
  -- at a millisecond wall-clock time read after those locks are held.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  return jsonb_build_object(
    'job', careslink_v1_generation._owner_api_job_view(
      p_job_id,
      p_owner_user_id
    )
  );
end;
$$;

create function
  careslink_v1_generation.cancel_v1_shadow_note_generation_job(
    p_owner_user_id uuid,
    p_session_id uuid,
    p_job_id uuid,
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
  v_now timestamptz;
  v_transaction_id uuid;
  v_job careslink_v1_generation.jobs%rowtype;
  v_attempt careslink_v1_generation.attempts%rowtype;
  v_payload careslink_v1_generation.payloads%rowtype;
  v_invalid_count bigint;
  v_running_attempt_count bigint;
begin
  perform careslink_v1_generation._owner_api_assert_contract(
    p_contract_version,
    p_schema_version
  );
  if p_owner_user_id is null or p_session_id is null or p_job_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform careslink_v1_generation._set_owner(p_owner_user_id);

  -- Job-first matches worker settlement and gives cancel versus claim/success
  -- one linearization point. The session is re-read only after this lock.
  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.owner_user_id = p_owner_user_id
  for update;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  -- The session reader can wait after the job lock. Refresh once it holds its
  -- auth rows so the caller is current at the job/session linearization point.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if v_job.status = 'CANCELLED' then
    select count(*)
    into v_invalid_count
    from careslink_v1_generation.attempts as attempt
    where attempt.job_id = v_job.id
      and attempt.owner_user_id = p_owner_user_id
      and attempt.status = 'RUNNING';
    if v_invalid_count <> 0 then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    select count(*)
    into v_invalid_count
    from careslink_v1_generation.payload_grants as grant_record
    where grant_record.job_id = v_job.id
      and grant_record.owner_user_id = p_owner_user_id
      and grant_record.status = 'ISSUED';
    if v_invalid_count <> 0 then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    select count(*)
    into v_invalid_count
    from careslink_v1_generation.payloads as payload
    join careslink_v1_generation.payload_purge_outbox as outbox
      on outbox.payload_id = payload.id
      and outbox.job_id = payload.job_id
      and outbox.owner_user_id = payload.owner_user_id
    where payload.id = v_job.payload_id
      and payload.job_id = v_job.id
      and payload.owner_user_id = p_owner_user_id
      and payload.revoke_reason = 'CANCELLED'
      and payload.revoked_at is not null
      and payload.purge_requested_at is not null
      and payload.state in (
        'REVOKED', 'PURGE_PENDING', 'PURGE_FAILED', 'PURGED'
      )
      and outbox.reason = 'CANCELLED';
    if v_invalid_count <> 1 then
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

    return jsonb_build_object(
      'job', careslink_v1_generation._owner_api_job_view(
        v_job.id,
        p_owner_user_id
      )
    );
  end if;

  if v_job.status in ('SUCCEEDED', 'FAILED') then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_STATE_TRANSITION';
  end if;
  if v_job.status not in ('QUEUED', 'RUNNING') then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  -- Lock every RUNNING attempt regardless of the job label. This makes a
  -- pre-existing QUEUED + RUNNING-attempt split fail closed before payload
  -- terminalization, while preserving job -> attempt -> payload lock order.
  perform attempt.id
  from careslink_v1_generation.attempts as attempt
  where attempt.job_id = v_job.id
    and attempt.owner_user_id = p_owner_user_id
    and attempt.status = 'RUNNING'
  order by attempt.id
  for update;

  select count(*)
  into v_running_attempt_count
  from careslink_v1_generation.attempts as attempt
  where attempt.job_id = v_job.id
    and attempt.owner_user_id = p_owner_user_id
    and attempt.status = 'RUNNING';

  if v_job.status = 'RUNNING' then
    if v_running_attempt_count <> 1 then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    select attempt.*
    into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.job_id = v_job.id
      and attempt.owner_user_id = p_owner_user_id
      and attempt.status = 'RUNNING';
    if v_attempt.attempt_number is distinct from v_job.attempt_count then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
  elsif v_running_attempt_count <> 0 then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select payload.*
  into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = p_owner_user_id
  for update;
  if not found
    or v_payload.state <> 'AVAILABLE'
    or v_payload.revoked_at is not null
    or v_payload.revoke_reason is not null
    or v_payload.purge_requested_at is not null
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  perform grant_record.id
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.payload_id = v_payload.id
    and grant_record.job_id = v_job.id
    and grant_record.owner_user_id = p_owner_user_id
    and grant_record.status = 'ISSUED'
  order by grant_record.id
  for update;

  perform outbox.id
  from careslink_v1_generation.payload_purge_outbox as outbox
  where outbox.payload_id = v_payload.id
    and outbox.job_id = v_job.id
    and outbox.owner_user_id = p_owner_user_id
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  -- Attempt, payload, grant and outbox locks may each have waited. Use one
  -- post-lock wall-clock value for every terminal timestamp and revalidate the
  -- already-locked session immediately before the atomic terminal write set.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if not careslink_v1_generation.fresh_session_is_active(
    p_owner_user_id,
    p_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  v_transaction_id := extensions.gen_random_uuid();
  if v_job.status = 'RUNNING' then
    update careslink_v1_generation.attempts as attempt
    set status = 'CANCELLED',
        failure_reason = 'CANCELLED',
        finished_at = v_now,
        terminal_transaction_id = v_transaction_id
    where attempt.id = v_attempt.id
      and attempt.job_id = v_job.id
      and attempt.owner_user_id = p_owner_user_id
      and attempt.status = 'RUNNING';
    if not found then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
  end if;

  perform careslink_v1_generation._enqueue_payload_purge(
    v_transaction_id,
    v_payload.id,
    v_job.id,
    p_owner_user_id,
    'CANCELLED',
    v_now
  );

  update careslink_v1_generation.jobs as job
  set status = 'CANCELLED',
      next_eligible_at = null,
      failure_reason = 'CANCELLED',
      updated_at = v_now,
      finished_at = v_now
  where job.id = v_job.id
    and job.owner_user_id = p_owner_user_id
    and job.status = v_job.status;
  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  return jsonb_build_object(
    'job', careslink_v1_generation._owner_api_job_view(
      v_job.id,
      p_owner_user_id
    )
  );
end;
$$;

-- Executor ownership is not a caller grant. Keep the exact RPC identities and
-- their response helpers private until a later reviewed server caller and
-- credential are introduced.
revoke all on function
  careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
    uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, text,
    text, text, text, timestamptz
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
revoke all on function
  careslink_v1_generation.get_v1_shadow_note_generation_job_status(
    uuid, uuid, uuid, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
revoke all on function
  careslink_v1_generation.cancel_v1_shadow_note_generation_job(
    uuid, uuid, uuid, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
revoke all on function
  careslink_v1_generation._owner_api_assert_contract(text, text)
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;
revoke all on function
  careslink_v1_generation._owner_api_job_view(uuid, uuid)
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;

reset role;

set role careslink_v1_generation_owner;

revoke create on schema careslink_v1_generation
  from careslink_v1_generation_owner_api_executor;
revoke all on table
  careslink_v1_generation.admission_policy_bindings
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
revoke all on type
  careslink_v1_generation.admission_policy_bindings,
  careslink_v1_generation.attempts,
  careslink_v1_generation.jobs,
  careslink_v1_generation.payload_grants,
  careslink_v1_generation.payload_policies,
  careslink_v1_generation.payload_purge_outbox,
  careslink_v1_generation.payloads,
  careslink_v1_generation.provider_evidence,
  careslink_v1_generation.provider_policies,
  careslink_v1_generation.settings,
  careslink_v1_generation.worker_policies,
  careslink_v1_generation.worker_registration_provider_policies,
  careslink_v1_generation.worker_registrations
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

-- Reassert that adding the thirteenth private table did not expand Data API,
-- service-role or worker table privileges. The owner API retains only the
-- exact catalog and owner-scoped DML grants declared above.
revoke all on all tables in schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema careslink_v1_generation
  from public, anon, authenticated, service_role;

reset role;

-- Remove only this migration's temporary PostgreSQL-16 SET edges. The roles
-- remain NOLOGIN and no runtime caller membership is introduced.
revoke careslink_v1_generation_owner_api_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_owner from current_user
  granted by current_user;
