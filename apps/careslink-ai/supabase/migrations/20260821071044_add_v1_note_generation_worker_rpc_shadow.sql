-- Five-Note registered-worker durable RPC shadow.
--
-- Source-only and default-off. This migration deliberately persists no worker,
-- provider or payload-policy row, no worker registration and no payload. It
-- does not enable the existing capability, expose a Data API function, call a
-- model or vault, reserve/commit Points, apply a migration, or touch
-- Production. A separately authorized disposable-Preview assertion may insert
-- TEST-only catalog and payload fixtures inside a transaction that rolls back.
--
-- The migration runner owns the transaction boundary.

-- Supabase Hosted may authenticate the CLI with a login role and then enter
-- the migration as its database actor. Preserve that actor transactionally
-- before any temporary owner/executor switch.
select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

-- PostgreSQL 16+ role membership options are independent. These temporary SET
-- edges let the migration actor perform owner-only DDL and create functions as
-- the actual executor. They are revoked at the end; the bootstrap administrative
-- edges created by the earlier migration are left unchanged.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Close the executor's own defaults before it creates any SECURITY DEFINER
-- helper or RPC. Function EXECUTE otherwise defaults to PUBLIC.
set role careslink_v1_generation_executor;

alter default privileges
  revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
alter default privileges
  revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
alter default privileges
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
alter default privileges
  revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;

alter default privileges in schema careslink_v1_generation
  revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
alter default privileges in schema careslink_v1_generation
  revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
alter default privileges in schema careslink_v1_generation
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
alter default privileges in schema careslink_v1_generation
  revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;

-- Empty, immutable-at-runtime policy catalogs. Operational durations and all
-- provider/vault identifiers must be explicitly inserted by a later approved
-- control-plane change; this migration guesses and seeds none of them.
create table careslink_v1_generation.worker_policies (
  version text primary key,
  status text not null,
  max_queue_age_ms bigint not null,
  minimum_payload_remaining_at_claim_ms bigint not null,
  lease_duration_ms bigint not null,
  heartbeat_interval_ms bigint not null,
  heartbeat_safety_margin_ms bigint not null,
  attempt_deadline_ms bigint not null,
  provider_deadline_ms bigint not null,
  commit_safety_margin_ms bigint not null,
  max_attempts integer not null,
  retry_delay_ms_after_attempt bigint[] not null,
  retryable_outcomes text[] not null,
  recovery_batch_limit integer not null,
  jitter_mode text not null,
  jitter_max_ms bigint,
  policy_digest text not null unique,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  unique (version, policy_digest),
  constraint worker_policies_identifier_check check (
    version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint worker_policies_status_check check (
    status in ('DRAFT', 'APPROVED')
  ),
  constraint worker_policies_safe_integer_check check (
    max_queue_age_ms between 1 and 9007199254740991
    and minimum_payload_remaining_at_claim_ms between 1 and 9007199254740991
    and lease_duration_ms between 1 and 9007199254740991
    and heartbeat_interval_ms between 1 and 9007199254740991
    and heartbeat_safety_margin_ms between 1 and 9007199254740991
    and attempt_deadline_ms between 1 and 9007199254740991
    and provider_deadline_ms between 1 and 9007199254740991
    and commit_safety_margin_ms between 1 and 9007199254740991
    and max_attempts between 1 and 1000000
    and recovery_batch_limit between 1 and 1000000
    and array_position(retry_delay_ms_after_attempt, null) is null
    and 0 < all(retry_delay_ms_after_attempt)
    and 9007199254740991 >= all(retry_delay_ms_after_attempt)
  ),
  constraint worker_policies_timing_check check (
    heartbeat_interval_ms + heartbeat_safety_margin_ms < lease_duration_ms
    and lease_duration_ms <= attempt_deadline_ms
    and provider_deadline_ms + commit_safety_margin_ms <= attempt_deadline_ms
    and minimum_payload_remaining_at_claim_ms >= attempt_deadline_ms
  ),
  constraint worker_policies_retry_vector_check check (
    (
      cardinality(retry_delay_ms_after_attempt) = 0
      or (
        array_ndims(retry_delay_ms_after_attempt) = 1
        and array_lower(retry_delay_ms_after_attempt, 1) = 1
      )
    )
    and (
      cardinality(retryable_outcomes) = 0
      or (
        array_ndims(retryable_outcomes) = 1
        and array_lower(retryable_outcomes, 1) = 1
      )
    )
    and cardinality(retry_delay_ms_after_attempt) = max_attempts - 1
    and array_position(retryable_outcomes, null) is null
    and retryable_outcomes <@ array[
      'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT'
    ]::text[]
    and cardinality(retryable_outcomes) =
      (case when 'LEASE_EXPIRED' = any(retryable_outcomes) then 1 else 0 end)
      + (case when 'PROVIDER_TIMEOUT' = any(retryable_outcomes) then 1 else 0 end)
      + (case when 'PROVIDER_TRANSIENT' = any(retryable_outcomes) then 1 else 0 end)
    and (
      (max_attempts = 1 and cardinality(retryable_outcomes) = 0)
      or (max_attempts > 1 and cardinality(retryable_outcomes) > 0)
    )
  ),
  constraint worker_policies_jitter_check check (
    (jitter_mode = 'NONE' and jitter_max_ms is null)
    or (
      jitter_mode = 'APPROVED_BOUNDED'
      and jitter_max_ms is not null
      and jitter_max_ms between 1 and 9007199254740991
      and 9007199254740991 - jitter_max_ms >=
        all(retry_delay_ms_after_attempt)
    )
  ),
  constraint worker_policies_digest_check check (
    policy_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint worker_policies_shadow_check check (shadow_only = true)
);

create table careslink_v1_generation.provider_policies (
  note_type text not null,
  policy_version text not null,
  status text not null,
  service_code text not null,
  contract_version text not null,
  schema_version text not null,
  rate_catalog_version text not null,
  provider_id text not null,
  model_id text not null,
  model_revision text,
  model_revision_availability text not null,
  prompt_template_version text not null,
  golden_set_version text not null,
  parser_version text not null,
  timeout_ms bigint not null,
  policy_digest text not null,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  primary key (note_type, policy_version),
  unique (note_type, policy_digest),
  unique (note_type, policy_version, policy_digest),
  constraint provider_policies_note_type_check check (
    note_type in (
      'communication', 'handover', 'progress', 'ndis', 'incident_factual'
    )
  ),
  constraint provider_policies_status_check check (status = 'APPROVED'),
  constraint provider_policies_service_binding_check check (
    (note_type = 'communication' and service_code = 'note.communication.generate')
    or (note_type = 'handover' and service_code = 'note.handover.generate')
    or (note_type = 'progress' and service_code = 'note.progress.generate')
    or (note_type = 'ndis' and service_code = 'note.ndis.generate')
    or (
      note_type = 'incident_factual'
      and service_code = 'note.incident_factual.generate'
    )
  ),
  constraint provider_policies_contract_check check (
    contract_version = '1.0.0-shadow.1'
    and schema_version = '2026-08-09.v1-shadow'
    and rate_catalog_version = '2026-08-09.v1-shadow'
  ),
  constraint provider_policies_identifier_check check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    and provider_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    and model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    and prompt_template_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    and golden_set_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    and parser_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    and (
      model_revision is null
      or model_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    )
  ),
  constraint provider_policies_revision_check check (
    (
      model_revision_availability = 'EXACT'
      and model_revision is not null
    )
    or (
      model_revision_availability = 'PROVIDER_NOT_EXPOSED'
      and model_revision is null
    )
  ),
  constraint provider_policies_timeout_check check (
    timeout_ms between 1 and 9007199254740991
  ),
  constraint provider_policies_digest_check check (
    policy_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint provider_policies_shadow_check check (shadow_only = true)
);

create table careslink_v1_generation.payload_policies (
  policy_version text primary key,
  status text not null,
  encryption_profile_version text not null,
  backup_disposition_version text not null,
  policy_digest text not null unique,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  unique (policy_version, policy_digest),
  constraint payload_policies_status_check check (status = 'APPROVED'),
  constraint payload_policies_identifier_check check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and encryption_profile_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and backup_disposition_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint payload_policies_digest_check check (
    policy_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint payload_policies_shadow_check check (shadow_only = true)
);

create table careslink_v1_generation.worker_registrations (
  registration_digest text primary key,
  registration_version text not null unique,
  status text not null,
  contract_version text not null,
  schema_version text not null,
  worker_identity_version text not null,
  worker_identity_hash text not null,
  worker_policy_version text not null,
  worker_policy_digest text not null,
  payload_policy_version text not null,
  payload_policy_snapshot_hash text not null,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  foreign key (worker_policy_version, worker_policy_digest)
    references careslink_v1_generation.worker_policies(
      version,
      policy_digest
    )
    on delete restrict,
  foreign key (payload_policy_version, payload_policy_snapshot_hash)
    references careslink_v1_generation.payload_policies(
      policy_version,
      policy_digest
    )
    on delete restrict,
  constraint worker_registrations_status_check check (status = 'APPROVED'),
  constraint worker_registrations_contract_check check (
    contract_version = '1.0.0-shadow.1'
    and schema_version = '2026-08-09.v1-shadow'
  ),
  constraint worker_registrations_identifier_check check (
    registration_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and worker_identity_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and worker_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and payload_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint worker_registrations_hash_check check (
    registration_digest ~ '^[a-f0-9]{64}$'
    and worker_identity_hash ~ '^[a-f0-9]{64}$'
    and worker_policy_digest ~ '^[a-f0-9]{64}$'
    and payload_policy_snapshot_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint worker_registrations_shadow_check check (shadow_only = true)
);

create table careslink_v1_generation.worker_registration_provider_policies (
  registration_digest text not null,
  note_type text not null,
  policy_version text not null,
  policy_digest text not null,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  primary key (registration_digest, note_type),
  foreign key (registration_digest)
    references careslink_v1_generation.worker_registrations(registration_digest)
    on delete cascade,
  foreign key (note_type, policy_version, policy_digest)
    references careslink_v1_generation.provider_policies(
      note_type,
      policy_version,
      policy_digest
    ) on delete restrict,
  constraint worker_registration_provider_note_type_check check (
    note_type in (
      'communication', 'handover', 'progress', 'ndis', 'incident_factual'
    )
  ),
  constraint worker_registration_provider_hash_check check (
    registration_digest ~ '^[a-f0-9]{64}$'
    and policy_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint worker_registration_provider_shadow_check check (shadow_only = true)
);

-- Job bindings must identify one exact catalog row, never a version from one
-- row and a digest from another.
alter table careslink_v1_generation.jobs
  add constraint jobs_worker_policy_catalog_fk
  foreign key (worker_policy_version, worker_policy_digest)
  references careslink_v1_generation.worker_policies(version, policy_digest)
  on delete restrict,
  add constraint jobs_provider_policy_catalog_fk
  foreign key (note_type, provider_policy_version, provider_policy_digest)
  references careslink_v1_generation.provider_policies(
    note_type,
    policy_version,
    policy_digest
  ) on delete restrict,
  add constraint jobs_payload_policy_catalog_fk
  foreign key (payload_policy_version, payload_policy_snapshot_hash)
  references careslink_v1_generation.payload_policies(
    policy_version,
    policy_digest
  ) on delete restrict;

-- Metadata-only payload lifecycle. payload_handle_hash is a digest, never a
-- vault URL/locator. The circular job/payload binding is deferred so an
-- admission transaction can insert both rows atomically.
alter table careslink_v1_generation.jobs
  add constraint jobs_payload_owner_identity_unique
    unique (id, payload_id, owner_user_id);

create table careslink_v1_generation.payloads (
  id uuid primary key,
  job_id uuid not null unique,
  owner_user_id uuid not null,
  note_type text not null,
  source_locale text not null,
  contract_version text not null,
  schema_version text not null,
  privacy_review_id uuid not null,
  privacy_proof_expires_at timestamptz not null,
  cleaned_facts_hash text not null,
  request_hash text not null,
  policy_version text not null,
  encryption_profile_version text not null,
  backup_disposition_version text not null,
  policy_snapshot_hash text not null,
  payload_handle_hash text not null,
  state text not null,
  expires_at timestamptz not null,
  available_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  purge_requested_at timestamptz,
  purged_at timestamptz,
  purge_attempt_count integer not null default 0,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  unique (id, owner_user_id),
  unique (id, job_id, owner_user_id),
  foreign key (job_id, id, owner_user_id)
    references careslink_v1_generation.jobs(id, payload_id, owner_user_id)
    on delete restrict
    deferrable initially deferred,
  foreign key (policy_version, policy_snapshot_hash)
    references careslink_v1_generation.payload_policies(
      policy_version,
      policy_digest
    )
    on delete restrict,
  constraint payloads_note_type_check check (
    note_type in (
      'communication', 'handover', 'progress', 'ndis', 'incident_factual'
    )
  ),
  constraint payloads_locale_check check (
    source_locale in ('en', 'zh-Hans', 'zh-Hant')
  ),
  constraint payloads_contract_check check (
    contract_version = '1.0.0-shadow.1'
    and schema_version = '2026-08-09.v1-shadow'
  ),
  constraint payloads_identifier_check check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and encryption_profile_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and backup_disposition_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  constraint payloads_hash_check check (
    cleaned_facts_hash ~ '^[a-f0-9]{64}$'
    and request_hash ~ '^[a-f0-9]{64}$'
    and policy_snapshot_hash ~ '^[a-f0-9]{64}$'
    and payload_handle_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint payloads_state_check check (
    state in (
      'STAGED', 'AVAILABLE', 'REVOKED', 'PURGE_PENDING', 'PURGED',
      'PURGE_FAILED'
    )
  ),
  constraint payloads_revoke_reason_check check (
    revoke_reason is null
    or revoke_reason in (
      'SUCCEEDED', 'FAILED', 'CANCELLED', 'LEASE_EXHAUSTED', 'EXPIRED',
      'ACCOUNT_DELETION', 'ORPHAN', 'CORRUPT_PAYLOAD'
    )
  ),
  constraint payloads_state_shape_check check (
    (
      state = 'STAGED'
      and available_at is null
      and revoked_at is null
      and revoke_reason is null
      and purge_requested_at is null
      and purged_at is null
    )
    or (
      state = 'AVAILABLE'
      and available_at is not null
      and revoked_at is null
      and revoke_reason is null
      and purge_requested_at is null
      and purged_at is null
    )
    or (
      state = 'REVOKED'
      and revoked_at is not null
      and revoke_reason is not null
      and purged_at is null
    )
    or (
      state in ('PURGE_PENDING', 'PURGE_FAILED')
      and revoked_at is not null
      and revoke_reason is not null
      and purge_requested_at is not null
      and purged_at is null
    )
    or (
      state = 'PURGED'
      and revoked_at is not null
      and revoke_reason is not null
      and purge_requested_at is not null
      and purged_at is not null
    )
  ),
  constraint payloads_time_check check (
    updated_at >= created_at
    and expires_at > created_at
    and privacy_proof_expires_at > created_at
    and expires_at <= privacy_proof_expires_at
    and (available_at is null or available_at >= created_at)
    and (revoked_at is null or revoked_at >= created_at)
    and (purge_requested_at is null or purge_requested_at >= created_at)
    and (purged_at is null or purged_at >= created_at)
  ),
  constraint payloads_purge_attempt_count_check check (
    purge_attempt_count >= 0
  ),
  constraint payloads_shadow_check check (shadow_only = true)
);

alter table careslink_v1_generation.jobs
  add constraint jobs_payload_owner_fk
  foreign key (payload_id, id, owner_user_id)
  references careslink_v1_generation.payloads(id, job_id, owner_user_id)
  on delete restrict
  deferrable initially deferred;

create index payloads_owner_created_idx
  on careslink_v1_generation.payloads(owner_user_id, created_at desc, id);
create index payloads_available_expiry_idx
  on careslink_v1_generation.payloads(expires_at, id)
  where state = 'AVAILABLE';

create table careslink_v1_generation.payload_grants (
  id uuid primary key,
  payload_id uuid not null,
  job_id uuid not null,
  owner_user_id uuid not null,
  attempt_id uuid not null,
  registration_digest text not null,
  lease_token_hash text not null,
  request_hash text not null,
  status text not null,
  authorized_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  vault_grant_hash text,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  unique (id, owner_user_id),
  foreign key (payload_id, job_id, owner_user_id)
    references careslink_v1_generation.payloads(id, job_id, owner_user_id)
    on delete restrict,
  unique (payload_id, attempt_id),
  foreign key (attempt_id, job_id, owner_user_id)
    references careslink_v1_generation.attempts(id, job_id, owner_user_id)
    on delete restrict,
  foreign key (registration_digest)
    references careslink_v1_generation.worker_registrations(
      registration_digest
    ) on delete restrict,
  constraint payload_grants_hash_check check (
    registration_digest ~ '^[a-f0-9]{64}$'
    and
    lease_token_hash ~ '^[a-f0-9]{64}$'
    and request_hash ~ '^[a-f0-9]{64}$'
    and (
      vault_grant_hash is null
      or vault_grant_hash ~ '^[a-f0-9]{64}$'
    )
  ),
  constraint payload_grants_status_check check (
    status in ('ISSUED', 'CONSUMED', 'REVOKED', 'EXPIRED')
  ),
  constraint payload_grants_state_shape_check check (
    (
      status = 'ISSUED'
      and consumed_at is null
      and revoked_at is null
      and vault_grant_hash is null
    )
    or (
      status = 'CONSUMED'
      and consumed_at is not null
      and revoked_at is null
      and vault_grant_hash is not null
    )
    or (
      status in ('REVOKED', 'EXPIRED')
      and consumed_at is null
      and revoked_at is not null
      and vault_grant_hash is null
    )
  ),
  constraint payload_grants_time_check check (
    authorized_at >= created_at
    and expires_at > authorized_at
    and (consumed_at is null or consumed_at >= authorized_at)
    and (revoked_at is null or revoked_at >= authorized_at)
  ),
  constraint payload_grants_shadow_check check (shadow_only = true)
);

create index payload_grants_attempt_idx
  on careslink_v1_generation.payload_grants(attempt_id, job_id);

-- Content-free provider evidence only. The JSON is structurally validated by
-- the worker RPC before insert and is never returned in any ACK.
create table careslink_v1_generation.provider_evidence (
  attempt_id uuid primary key,
  job_id uuid not null,
  owner_user_id uuid not null,
  evidence_hash text not null,
  evidence jsonb not null,
  created_at timestamptz not null,
  shadow_only boolean not null default true,
  foreign key (attempt_id, job_id, owner_user_id)
    references careslink_v1_generation.attempts(id, job_id, owner_user_id)
    on delete restrict,
  constraint provider_evidence_hash_check check (
    evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint provider_evidence_json_check check (
    jsonb_typeof(evidence) = 'object'
  ),
  constraint provider_evidence_shadow_check check (shadow_only = true)
);

create index provider_evidence_job_idx
  on careslink_v1_generation.provider_evidence(job_id, attempt_id);

create table careslink_v1_generation.payload_purge_outbox (
  id uuid primary key,
  transaction_id uuid not null,
  payload_id uuid not null,
  job_id uuid not null,
  owner_user_id uuid not null,
  reason text not null,
  event_reference_hash text not null unique,
  status text not null default 'PENDING',
  requested_at timestamptz not null,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  unique (payload_id),
  foreign key (payload_id, job_id, owner_user_id)
    references careslink_v1_generation.payloads(id, job_id, owner_user_id)
    on delete restrict,
  constraint payload_purge_outbox_reason_check check (
    reason in (
      'SUCCEEDED', 'FAILED', 'CANCELLED', 'LEASE_EXHAUSTED', 'EXPIRED',
      'ACCOUNT_DELETION', 'ORPHAN', 'CORRUPT_PAYLOAD'
    )
  ),
  constraint payload_purge_outbox_hash_check check (
    event_reference_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint payload_purge_outbox_status_check check (
    status in ('PENDING', 'PROCESSING', 'PURGED', 'RETRY_REQUIRED')
  ),
  constraint payload_purge_outbox_time_check check (
    requested_at >= created_at
    and (last_attempt_at is null or last_attempt_at >= requested_at)
    and (completed_at is null or completed_at >= requested_at)
    and attempt_count >= 0
    and (status = 'PURGED') = (completed_at is not null)
  ),
  constraint payload_purge_outbox_shadow_check check (shadow_only = true)
);

create index payload_purge_outbox_pending_idx
  on careslink_v1_generation.payload_purge_outbox(requested_at, id)
  where status in ('PENDING', 'RETRY_REQUIRED');

-- Persist terminal transaction identity and the database-owned retry choice so
-- resolve-after-response-loss can reconstruct the exact prior outcome.
alter table careslink_v1_generation.attempts
  add column terminal_transaction_id uuid,
  add column settlement_base_delay_ms bigint,
  add column settlement_jitter_ms bigint,
  add column settlement_retry_delay_ms bigint;

alter table careslink_v1_generation.attempts
  add constraint attempts_terminal_transaction_shape_check check (
    (status = 'RUNNING' and terminal_transaction_id is null)
    or (status <> 'RUNNING' and terminal_transaction_id is not null)
  ),
  add constraint attempts_settlement_delay_shape_check check (
    (
      settlement_base_delay_ms is null
      and settlement_jitter_ms is null
      and settlement_retry_delay_ms is null
    )
    or (
      status in ('FAILED', 'LEASE_EXPIRED')
      and settlement_base_delay_ms is not null
      and settlement_jitter_ms is not null
      and settlement_retry_delay_ms is not null
      and settlement_base_delay_ms between 1 and 9007199254740991
      and settlement_jitter_ms between 0 and 9007199254740991
      and settlement_retry_delay_ms =
        settlement_base_delay_ms + settlement_jitter_ms
      and settlement_retry_delay_ms <= 9007199254740991
    )
  );

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Private-schema RLS and least-privilege executor ACL
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_owner;

alter table careslink_v1_generation.worker_policies enable row level security;
alter table careslink_v1_generation.worker_policies force row level security;
alter table careslink_v1_generation.provider_policies enable row level security;
alter table careslink_v1_generation.provider_policies force row level security;
alter table careslink_v1_generation.payload_policies enable row level security;
alter table careslink_v1_generation.payload_policies force row level security;
alter table careslink_v1_generation.worker_registrations enable row level security;
alter table careslink_v1_generation.worker_registrations force row level security;
alter table careslink_v1_generation.worker_registration_provider_policies
  enable row level security;
alter table careslink_v1_generation.worker_registration_provider_policies
  force row level security;
alter table careslink_v1_generation.payloads enable row level security;
alter table careslink_v1_generation.payloads force row level security;
alter table careslink_v1_generation.payload_grants enable row level security;
alter table careslink_v1_generation.payload_grants force row level security;
alter table careslink_v1_generation.provider_evidence enable row level security;
alter table careslink_v1_generation.provider_evidence force row level security;
alter table careslink_v1_generation.payload_purge_outbox enable row level security;
alter table careslink_v1_generation.payload_purge_outbox force row level security;

-- Existing durable tables were FORCE-RLS with no policy. Add only the command
-- paths the executor-owned RPC implementation requires.
create policy settings_generation_executor_select
  on careslink_v1_generation.settings
  for select to careslink_v1_generation_executor
  using (true);

create policy jobs_generation_executor_select
  on careslink_v1_generation.jobs
  for select to careslink_v1_generation_executor
  using (true);
create policy jobs_generation_executor_update
  on careslink_v1_generation.jobs
  for update to careslink_v1_generation_executor
  using (true)
  with check (true);

create policy attempts_generation_executor_select
  on careslink_v1_generation.attempts
  for select to careslink_v1_generation_executor
  using (true);
create policy attempts_generation_executor_insert
  on careslink_v1_generation.attempts
  for insert to careslink_v1_generation_executor
  with check (true);
create policy attempts_generation_executor_update
  on careslink_v1_generation.attempts
  for update to careslink_v1_generation_executor
  using (true)
  with check (true);

create policy worker_policies_generation_executor_select
  on careslink_v1_generation.worker_policies
  for select to careslink_v1_generation_executor
  using (true);
create policy provider_policies_generation_executor_select
  on careslink_v1_generation.provider_policies
  for select to careslink_v1_generation_executor
  using (true);
create policy payload_policies_generation_executor_select
  on careslink_v1_generation.payload_policies
  for select to careslink_v1_generation_executor
  using (true);
create policy worker_registrations_generation_executor_select
  on careslink_v1_generation.worker_registrations
  for select to careslink_v1_generation_executor
  using (true);
create policy registration_provider_generation_executor_select
  on careslink_v1_generation.worker_registration_provider_policies
  for select to careslink_v1_generation_executor
  using (true);

create policy payloads_generation_executor_select
  on careslink_v1_generation.payloads
  for select to careslink_v1_generation_executor
  using (true);
create policy payloads_generation_executor_update
  on careslink_v1_generation.payloads
  for update to careslink_v1_generation_executor
  using (true)
  with check (true);

create policy payload_grants_generation_executor_select
  on careslink_v1_generation.payload_grants
  for select to careslink_v1_generation_executor
  using (true);
create policy payload_grants_generation_executor_insert
  on careslink_v1_generation.payload_grants
  for insert to careslink_v1_generation_executor
  with check (true);
create policy payload_grants_generation_executor_update
  on careslink_v1_generation.payload_grants
  for update to careslink_v1_generation_executor
  using (true)
  with check (true);

create policy provider_evidence_generation_executor_select
  on careslink_v1_generation.provider_evidence
  for select to careslink_v1_generation_executor
  using (true);
create policy provider_evidence_generation_executor_insert
  on careslink_v1_generation.provider_evidence
  for insert to careslink_v1_generation_executor
  with check (true);

create policy purge_outbox_generation_executor_select
  on careslink_v1_generation.payload_purge_outbox
  for select to careslink_v1_generation_executor
  using (true);
create policy purge_outbox_generation_executor_insert
  on careslink_v1_generation.payload_purge_outbox
  for insert to careslink_v1_generation_executor
  with check (true);

grant usage on schema careslink_v1_generation
  to careslink_v1_generation_executor;
grant select on careslink_v1_generation.settings
  to careslink_v1_generation_executor;
grant select, update on careslink_v1_generation.jobs
  to careslink_v1_generation_executor;
grant select, insert, update on careslink_v1_generation.attempts
  to careslink_v1_generation_executor;
grant select on
  careslink_v1_generation.worker_policies,
  careslink_v1_generation.provider_policies,
  careslink_v1_generation.payload_policies,
  careslink_v1_generation.worker_registrations,
  careslink_v1_generation.worker_registration_provider_policies
  to careslink_v1_generation_executor;
grant select, update on careslink_v1_generation.payloads
  to careslink_v1_generation_executor;
grant select, insert, update on careslink_v1_generation.payload_grants
  to careslink_v1_generation_executor;
grant select, insert on careslink_v1_generation.provider_evidence
  to careslink_v1_generation_executor;
grant select, insert on careslink_v1_generation.payload_purge_outbox
  to careslink_v1_generation_executor;

-- CREATE is temporary and is revoked immediately after the executor creates
-- its private helpers and the nine exact RPC identities below.
grant create on schema careslink_v1_generation
  to careslink_v1_generation_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Narrow public/auth dependencies for the executor-owned definer functions
-- ---------------------------------------------------------------------------

grant usage on schema public, extensions
  to careslink_v1_generation_executor;

grant select (
  id,
  owner_user_id,
  note_type,
  source_locale,
  lifecycle_status,
  current_revision_id,
  current_revision_number,
  schema_version,
  contract_version,
  shadow_only,
  created_at,
  updated_at
) on public.ai_documents to careslink_v1_generation_executor;
grant insert (
  id,
  owner_user_id,
  note_type,
  source_locale,
  lifecycle_status,
  current_revision_id,
  current_revision_number,
  schema_version,
  contract_version,
  shadow_only,
  created_at,
  updated_at
) on public.ai_documents to careslink_v1_generation_executor;
grant update (
  current_revision_id,
  current_revision_number,
  updated_at
) on public.ai_documents to careslink_v1_generation_executor;

grant select (
  id,
  document_id,
  owner_user_id,
  revision_number,
  base_revision_id,
  privacy_review_id,
  content_hash,
  mutation_id,
  schema_version,
  contract_version,
  shadow_only,
  created_at
) on public.ai_document_revisions to careslink_v1_generation_executor;
grant insert (
  id,
  document_id,
  owner_user_id,
  revision_number,
  base_revision_id,
  privacy_review_id,
  content,
  content_hash,
  mutation_id,
  schema_version,
  contract_version,
  shadow_only,
  created_at
) on public.ai_document_revisions to careslink_v1_generation_executor;

grant select (
  change_id,
  owner_user_id,
  change_kind,
  document_id,
  revision_id,
  last_mutation_id,
  server_time,
  deleted_at,
  shadow_only
) on public.ai_document_sync_changes to careslink_v1_generation_executor;
grant insert (
  owner_user_id,
  change_kind,
  document_id,
  revision_id,
  last_mutation_id,
  server_time,
  deleted_at,
  shadow_only
) on public.ai_document_sync_changes to careslink_v1_generation_executor;

grant select (
  id,
  owner_user_id,
  mutation_id,
  mutation_kind,
  request_fingerprint,
  document_id,
  revision_id,
  change_id,
  server_time,
  shadow_only,
  created_at
) on public.ai_document_mutation_receipts
  to careslink_v1_generation_executor;
grant insert (
  id,
  owner_user_id,
  mutation_id,
  mutation_kind,
  request_fingerprint,
  document_id,
  revision_id,
  change_id,
  acknowledgement,
  server_time,
  shadow_only,
  created_at
) on public.ai_document_mutation_receipts
  to careslink_v1_generation_executor;

grant usage on sequence public.ai_document_sync_changes_change_id_seq
  to careslink_v1_generation_executor;

grant execute on function public.v1_shadow_canonical_json(jsonb)
  to careslink_v1_generation_executor;
grant execute on function public.v1_shadow_content_sha256(jsonb)
  to careslink_v1_generation_executor;
grant execute on function public.assert_v1_shadow_note_facts(text, text, jsonb)
  to careslink_v1_generation_executor;
grant execute on function extensions.digest(bytea, text)
  to careslink_v1_generation_executor;
grant execute on function extensions.gen_random_bytes(integer)
  to careslink_v1_generation_executor;
grant execute on function extensions.gen_random_uuid()
  to careslink_v1_generation_executor;

-- The custom transaction-local owner GUC is set only after a private job row
-- is locked. It scopes every canonical read/write made by the executor. API
-- roles cannot assume the executor and receive no function grant.
create policy ai_documents_generation_executor_select
  on public.ai_documents
  for select to careslink_v1_generation_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy ai_documents_generation_executor_insert
  on public.ai_documents
  for insert to careslink_v1_generation_executor
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy ai_documents_generation_executor_update
  on public.ai_documents
  for update to careslink_v1_generation_executor
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

create policy ai_document_revisions_generation_executor_select
  on public.ai_document_revisions
  for select to careslink_v1_generation_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy ai_document_revisions_generation_executor_insert
  on public.ai_document_revisions
  for insert to careslink_v1_generation_executor
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );

create policy ai_document_sync_changes_generation_executor_select
  on public.ai_document_sync_changes
  for select to careslink_v1_generation_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy ai_document_sync_changes_generation_executor_insert
  on public.ai_document_sync_changes
  for insert to careslink_v1_generation_executor
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );

create policy ai_document_mutation_receipts_generation_executor_select
  on public.ai_document_mutation_receipts
  for select to careslink_v1_generation_executor
  using (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );
create policy ai_document_mutation_receipts_generation_executor_insert
  on public.ai_document_mutation_receipts
  for insert to careslink_v1_generation_executor
  with check (
    owner_user_id = nullif(
      current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::uuid
  );

-- Supabase owns and manages the auth schema. Do not add an executor policy or
-- direct table grant there. This is the sole, metadata-only auth-reader
-- exception: it is owned by the migration actor, locks the user before the
-- session, returns one boolean, has an empty search_path and is executable only
-- by the private executor. Disposable Preview must prove its hosted ownership
-- and lock behavior before any later runtime activation.
set role careslink_v1_generation_owner;
do $grant_migration_entry_role$
begin
  execute pg_catalog.format(
    'grant create on schema careslink_v1_generation to %I',
    pg_catalog.current_setting('careslink.migration_entry_role')
  );
end;
$grant_migration_entry_role$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

create function careslink_v1_generation.fresh_session_is_active(
  p_owner_user_id uuid,
  p_session_id uuid,
  p_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  if p_owner_user_id is null or p_session_id is null or p_at is null then
    return false;
  end if;

  select true
  into v_active
  from auth.users as active_user
  where active_user.id = p_owner_user_id
    and active_user.aud = 'authenticated'
    and active_user.role = 'authenticated'
    and active_user.email_confirmed_at is not null
    and active_user.email_confirmed_at <= p_at
    and active_user.deleted_at is null
    and (
      active_user.banned_until is null
      or active_user.banned_until <= p_at
    )
    and active_user.is_anonymous is false
    and jsonb_typeof(active_user.raw_app_meta_data) = 'object'
    and active_user.raw_app_meta_data->>'role' = 'provider'
  for share;

  if not coalesce(v_active, false) then
    return false;
  end if;

  v_active := null;
  select true
  into v_active
  from auth.sessions as active_session
  where active_session.id = p_session_id
    and active_session.user_id = p_owner_user_id
    and (
      active_session.not_after is null
      or active_session.not_after > p_at
    )
  for share;

  return coalesce(v_active, false);
end;
$$;

create function careslink_v1_generation.fresh_privacy_proof_expires_at(
  p_privacy_review_id uuid,
  p_owner_user_id uuid,
  p_note_type text,
  p_cleaned_facts_hash text,
  p_schema_version text,
  p_contract_version text,
  p_at timestamptz
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
begin
  if p_privacy_review_id is null
    or p_owner_user_id is null
    or p_note_type is null
    or p_cleaned_facts_hash is null
    or p_schema_version is null
    or p_contract_version is null
    or p_at is null
  then
    return null;
  end if;

  select review.expires_at
  into v_expires_at
  from public.privacy_reviews as review
  where review.id = p_privacy_review_id
    and review.owner_user_id = p_owner_user_id
    and review.note_type = p_note_type
    and review.cleaned_facts_hash = p_cleaned_facts_hash
    and review.schema_version = p_schema_version
    and review.contract_version = p_contract_version
    and review.scanner_policy_version = '2026-08-11.preview.1'
    and review.review_revision = 1
    and review.status = 'CONFIRMED'
    and review.deidentification_confirmed is true
    and review.authority_to_process_confirmed is true
    and review.shadow_only is true
    and review.confirmed_at <= p_at
    and review.expires_at > p_at
  for share;

  return v_expires_at;
end;
$$;

revoke all on function careslink_v1_generation.fresh_session_is_active(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role,
  careslink_v1_generation_owner;
grant execute on function careslink_v1_generation.fresh_session_is_active(
  uuid,
  uuid,
  timestamptz
) to careslink_v1_generation_executor;
revoke all on function careslink_v1_generation.fresh_privacy_proof_expires_at(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role,
  careslink_v1_generation_owner;
grant execute on function careslink_v1_generation.fresh_privacy_proof_expires_at(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) to careslink_v1_generation_executor;

set role careslink_v1_generation_owner;
do $revoke_migration_entry_role$
begin
  execute pg_catalog.format(
    'revoke create on schema careslink_v1_generation from %I',
    pg_catalog.current_setting('careslink.migration_entry_role')
  );
end;
$revoke_migration_entry_role$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Executor-owned validation and envelope helpers
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_executor;

create function careslink_v1_generation._server_now()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('milliseconds', transaction_timestamp())
$$;

create function careslink_v1_generation._server_time(p_value timestamptz)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select to_char(
    date_trunc('milliseconds', p_value) at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  )
$$;

create function careslink_v1_generation._sha256_text(p_value text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

create function careslink_v1_generation._new_opaque_secret()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(32), 'hex')
$$;

create function careslink_v1_generation._assert_capability()
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from careslink_v1_generation.settings as setting
    where setting.capability = 'note_generation_v1'
      and setting.enabled is true
      and setting.shadow_only is true
  ) then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;
end;
$$;

create function careslink_v1_generation._set_owner(p_owner_user_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_owner_user_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  perform set_config(
    'careslink.v1_generation_owner_user_id',
    p_owner_user_id::text,
    true
  );
end;
$$;

create function careslink_v1_generation._worker_policy_is_valid(
  p_version text,
  p_digest text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_policy record;
  v_definition jsonb;
begin
  select policy.*
  into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_version
    and policy.policy_digest = p_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  if not found then
    return false;
  end if;

  v_definition := jsonb_build_object(
    'kind', 'careslink.v1.note-generation-worker-policy',
    'version', v_policy.version,
    'status', v_policy.status,
    'maxQueueAgeMs', v_policy.max_queue_age_ms,
    'minimumPayloadRemainingAtClaimMs',
      v_policy.minimum_payload_remaining_at_claim_ms,
    'leaseDurationMs', v_policy.lease_duration_ms,
    'heartbeatIntervalMs', v_policy.heartbeat_interval_ms,
    'heartbeatSafetyMarginMs', v_policy.heartbeat_safety_margin_ms,
    'attemptDeadlineMs', v_policy.attempt_deadline_ms,
    'providerDeadlineMs', v_policy.provider_deadline_ms,
    'commitSafetyMarginMs', v_policy.commit_safety_margin_ms,
    'maxAttempts', v_policy.max_attempts,
    'retryDelayMsAfterAttempt', to_jsonb(v_policy.retry_delay_ms_after_attempt),
    'retryableOutcomes', to_jsonb(v_policy.retryable_outcomes),
    'recoveryBatchLimit', v_policy.recovery_batch_limit,
    'jitter', case
      when v_policy.jitter_mode = 'NONE'
        then jsonb_build_object('mode', 'NONE')
      else jsonb_build_object(
        'mode', 'APPROVED_BOUNDED',
        'maxMs', v_policy.jitter_max_ms
      )
    end
  );

  return public.v1_shadow_content_sha256(v_definition) = p_digest;
end;
$$;

create function careslink_v1_generation._provider_policy_is_valid(
  p_note_type text,
  p_version text,
  p_digest text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_policy record;
  v_core jsonb;
begin
  select policy.*
  into v_policy
  from careslink_v1_generation.provider_policies as policy
  where policy.note_type = p_note_type
    and policy.policy_version = p_version
    and policy.policy_digest = p_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  if not found then
    return false;
  end if;

  v_core := jsonb_build_object(
    'noteType', v_policy.note_type,
    'serviceCode', v_policy.service_code,
    'contractVersion', v_policy.contract_version,
    'schemaVersion', v_policy.schema_version,
    'rateCatalogVersion', v_policy.rate_catalog_version,
    'providerId', v_policy.provider_id,
    'modelId', v_policy.model_id,
    'modelRevision', v_policy.model_revision,
    'modelRevisionAvailability', v_policy.model_revision_availability,
    'policyVersion', v_policy.policy_version,
    'promptTemplateVersion', v_policy.prompt_template_version,
    'goldenSetVersion', v_policy.golden_set_version,
    'parserVersion', v_policy.parser_version,
    'timeoutMs', v_policy.timeout_ms
  );

  return public.v1_shadow_content_sha256(v_core) = p_digest;
end;
$$;

create function careslink_v1_generation._registration_is_valid(
  p_registration_digest text,
  p_worker_policy_version text,
  p_worker_policy_digest text,
  p_worker_identity_hash text,
  p_contract_version text,
  p_schema_version text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_registration record;
  v_provider_policies jsonb;
  v_provider_count integer;
  v_core jsonb;
begin
  select registration.*
  into v_registration
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_digest = p_registration_digest
    and registration.worker_policy_version = p_worker_policy_version
    and registration.worker_policy_digest = p_worker_policy_digest
    and registration.status = 'APPROVED'
    and registration.shadow_only is true
    and registration.worker_identity_hash = p_worker_identity_hash
    and registration.contract_version = p_contract_version
    and registration.schema_version = p_schema_version;

  if not found
    or not careslink_v1_generation._worker_policy_is_valid(
      v_registration.worker_policy_version,
      v_registration.worker_policy_digest
    )
  then
    return false;
  end if;

  select
    count(*),
    jsonb_agg(
      jsonb_build_object(
        'noteType', binding.note_type,
        'policyVersion', binding.policy_version,
        'policyDigest', binding.policy_digest
      )
      order by case binding.note_type
        when 'communication' then 1
        when 'handover' then 2
        when 'progress' then 3
        when 'ndis' then 4
        when 'incident_factual' then 5
      end
    )
  into v_provider_count, v_provider_policies
  from careslink_v1_generation.worker_registration_provider_policies
    as binding
  where binding.registration_digest = p_registration_digest
    and binding.shadow_only is true;

  if v_provider_count <> 5
    or exists (
      select 1
      from careslink_v1_generation.worker_registration_provider_policies
        as binding
      where binding.registration_digest = p_registration_digest
        and not careslink_v1_generation._provider_policy_is_valid(
          binding.note_type,
          binding.policy_version,
          binding.policy_digest
        )
    )
  then
    return false;
  end if;

  v_core := jsonb_build_object(
    'kind', 'careslink.v1.note-generation-registered-worker',
    'registrationVersion', v_registration.registration_version,
    'status', v_registration.status,
    'contractVersion', v_registration.contract_version,
    'schemaVersion', v_registration.schema_version,
    'workerIdentityVersion', v_registration.worker_identity_version,
    'workerIdentityHash', v_registration.worker_identity_hash,
    'workerPolicyVersion', v_registration.worker_policy_version,
    'workerPolicyDigest', v_registration.worker_policy_digest,
    'payloadPolicyVersion', v_registration.payload_policy_version,
    'payloadPolicySnapshotHash',
      v_registration.payload_policy_snapshot_hash,
    'providerPolicies', v_provider_policies
  );

  return public.v1_shadow_content_sha256(v_core) = p_registration_digest;
end;
$$;

create function careslink_v1_generation._payload_snapshot_is_valid(
  p_policy_version text,
  p_policy_snapshot_hash text,
  p_encryption_profile_version text,
  p_backup_disposition_version text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if not exists (
    select 1
    from careslink_v1_generation.payload_policies as policy
    where policy.policy_version = p_policy_version
      and policy.policy_digest = p_policy_snapshot_hash
      and policy.encryption_profile_version = p_encryption_profile_version
      and policy.backup_disposition_version = p_backup_disposition_version
      and policy.status = 'APPROVED'
      and policy.shadow_only is true
  ) then
    return false;
  end if;

  v_snapshot := jsonb_build_object(
    'policyVersion', p_policy_version,
    'encryptionProfileVersion', p_encryption_profile_version,
    'backupDispositionVersion', p_backup_disposition_version
  );

  return public.v1_shadow_content_sha256(v_snapshot) = p_policy_snapshot_hash;
end;
$$;

create function careslink_v1_generation._job_registration_binding_is_valid(
  p_registration_digest text,
  p_worker_policy_version text,
  p_worker_policy_digest text,
  p_payload_policy_version text,
  p_payload_policy_snapshot_hash text,
  p_note_type text,
  p_provider_policy_version text,
  p_provider_policy_digest text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from careslink_v1_generation.worker_registrations as registration
    join careslink_v1_generation.worker_registration_provider_policies
      as provider_binding
      on provider_binding.registration_digest =
        registration.registration_digest
     and provider_binding.note_type = p_note_type
     and provider_binding.policy_version = p_provider_policy_version
     and provider_binding.policy_digest = p_provider_policy_digest
    where registration.registration_digest = p_registration_digest
      and registration.worker_policy_version = p_worker_policy_version
      and registration.worker_policy_digest = p_worker_policy_digest
      and registration.payload_policy_version = p_payload_policy_version
      and registration.payload_policy_snapshot_hash =
        p_payload_policy_snapshot_hash
      and registration.status = 'APPROVED'
      and registration.shadow_only is true
      and provider_binding.shadow_only is true
  )
$$;

create function careslink_v1_generation._bounded_string_array_is_valid(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_text text;
  v_trim_chars constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p_value is null
    or jsonb_typeof(p_value) <> 'array'
    or jsonb_array_length(p_value) > 256
  then
    return false;
  end if;

  for v_item in select item.value from jsonb_array_elements(p_value) as item
  loop
    if jsonb_typeof(v_item) <> 'string' then
      return false;
    end if;
    v_text := v_item #>> '{}';
    if char_length(v_text) not between 1 and 2000
      or btrim(v_text, v_trim_chars) = ''
      or v_text is distinct from btrim(v_text, v_trim_chars)
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create function careslink_v1_generation._validate_note_content(
  p_note_type text,
  p_schema_version text,
  p_cleaned_facts_hash text,
  p_content jsonb,
  p_content_hash text
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_review jsonb;
  v_entry record;
  v_english text;
  v_review_text text;
  v_candidate jsonb;
  v_trim_chars constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p_content is null
    or jsonb_typeof(p_content) <> 'object'
    or not (p_content ?& array[
      'englishDraft', 'reviewVersions', 'factsSummary', 'missingFacts',
      'neutralWordingChecks', 'followUpPrompts', 'disclaimer'
    ])
    or p_content - array[
      'englishDraft', 'reviewVersions', 'factsSummary', 'missingFacts',
      'neutralWordingChecks', 'followUpPrompts', 'disclaimer'
    ] <> '{}'::jsonb
    or jsonb_typeof(p_content->'englishDraft') <> 'string'
    or jsonb_typeof(p_content->'factsSummary') <> 'object'
    or jsonb_typeof(p_content->'disclaimer') <> 'string'
    or p_content->>'disclaimer' is distinct from
      'User-reviewed draft wording based only on the details entered. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice. General documentation support only.'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  v_english := p_content->>'englishDraft';
  if char_length(v_english) not between 1 and 100000
    or btrim(v_english, v_trim_chars) = ''
    or v_english is distinct from btrim(v_english, v_trim_chars)
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  v_review := p_content->'reviewVersions';
  if v_review is null
    or jsonb_typeof(v_review) <> 'object'
    or v_review - array['zh-Hans', 'zh-Hant'] <> '{}'::jsonb
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  for v_entry in select * from jsonb_each(v_review)
  loop
    if jsonb_typeof(v_entry.value) <> 'string' then
      raise exception using
        errcode = 'P0001',
        message = 'PROVIDER_OUTPUT_INVALID';
    end if;
    v_review_text := v_entry.value #>> '{}';
    if char_length(v_review_text) not between 1 and 100000
      or btrim(v_review_text, v_trim_chars) = ''
      or v_review_text is distinct from btrim(v_review_text, v_trim_chars)
    then
      raise exception using
        errcode = 'P0001',
        message = 'PROVIDER_OUTPUT_INVALID';
    end if;
  end loop;

  if not careslink_v1_generation._bounded_string_array_is_valid(
      p_content->'missingFacts'
    )
    or not careslink_v1_generation._bounded_string_array_is_valid(
      p_content->'neutralWordingChecks'
    )
    or not careslink_v1_generation._bounded_string_array_is_valid(
      p_content->'followUpPrompts'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  begin
    perform public.assert_v1_shadow_note_facts(
      p_note_type,
      p_schema_version,
      p_content->'factsSummary'
    );
  exception when others then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end;

  if public.v1_shadow_content_sha256(p_content->'factsSummary')
      is distinct from p_cleaned_facts_hash
    or public.v1_shadow_content_sha256(p_content)
      is distinct from p_content_hash
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  v_candidate := jsonb_build_object(
    'englishDraft', p_content->'englishDraft',
    'reviewVersions', p_content->'reviewVersions',
    'missingFacts', p_content->'missingFacts',
    'neutralWordingChecks', p_content->'neutralWordingChecks',
    'followUpPrompts', p_content->'followUpPrompts'
  );

  return public.v1_shadow_content_sha256(v_candidate);
end;
$$;

create function careslink_v1_generation._json_nonnegative_safe_integer(
  p_value jsonb
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    p_value is not null
    and jsonb_typeof(p_value) = 'number'
    and (p_value #>> '{}') ~ '^(0|[1-9][0-9]{0,15})$'
    and (p_value #>> '{}')::numeric <= 9007199254740991,
    false
  )
$$;

create function careslink_v1_generation._parse_server_time(p_value text)
returns timestamptz
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_time timestamptz;
begin
  if p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    raise exception using errcode = 'P0001', message = 'PROVIDER_OUTPUT_INVALID';
  end if;
  begin
    v_time := p_value::timestamptz;
  exception when others then
    raise exception using errcode = 'P0001', message = 'PROVIDER_OUTPUT_INVALID';
  end;
  if careslink_v1_generation._server_time(v_time) <> p_value then
    raise exception using errcode = 'P0001', message = 'PROVIDER_OUTPUT_INVALID';
  end if;
  return v_time;
end;
$$;

create function careslink_v1_generation._provider_usage_is_valid(
  p_usage jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_total numeric;
  v_input numeric;
  v_output numeric;
begin
  if p_usage is null or jsonb_typeof(p_usage) <> 'object' then
    return false;
  end if;

  if jsonb_typeof(p_usage->'status') <> 'string'
    or jsonb_typeof(p_usage->'source') <> 'string'
  then
    return false;
  end if;

  if p_usage->>'status' = 'UNAVAILABLE' then
    return p_usage ?& array['status', 'source']
      and p_usage - array['status', 'source'] = '{}'::jsonb
      and p_usage->>'source' = 'UNAVAILABLE';
  end if;

  if p_usage->>'status' is distinct from 'REPORTED'
    or not (p_usage->>'source' = any(array['PROVIDER', 'GATEWAY']))
    or not (p_usage ?& array['status', 'source'])
    or p_usage - array[
      'status', 'source', 'inputTokens', 'outputTokens', 'totalTokens',
      'cachedInputTokens', 'reasoningTokens'
    ] <> '{}'::jsonb
  then
    return false;
  end if;

  if not (
    p_usage ? 'inputTokens'
    or p_usage ? 'outputTokens'
    or p_usage ? 'totalTokens'
    or p_usage ? 'cachedInputTokens'
    or p_usage ? 'reasoningTokens'
  ) then
    return false;
  end if;

  foreach v_key in array array[
    'inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens',
    'reasoningTokens'
  ]
  loop
    if p_usage ? v_key
      and not careslink_v1_generation._json_nonnegative_safe_integer(
        p_usage->v_key
      )
    then
      return false;
    end if;
  end loop;

  if p_usage ? 'totalTokens' then
    v_total := (p_usage->>'totalTokens')::numeric;
    if p_usage ? 'inputTokens' then
      v_input := (p_usage->>'inputTokens')::numeric;
      if v_total < v_input then
        return false;
      end if;
    else
      v_input := 0;
    end if;
    if p_usage ? 'outputTokens' then
      v_output := (p_usage->>'outputTokens')::numeric;
      if v_total < v_output or v_total < v_input + v_output then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

create function careslink_v1_generation._provider_cost_is_valid(
  p_cost jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_cost is null or jsonb_typeof(p_cost) <> 'object' then
    return false;
  end if;

  if jsonb_typeof(p_cost->'status') <> 'string'
    or jsonb_typeof(p_cost->'source') <> 'string'
  then
    return false;
  end if;

  if p_cost->>'status' = 'UNAVAILABLE' then
    return p_cost ?& array['status', 'source']
      and p_cost - array['status', 'source'] = '{}'::jsonb
      and p_cost->>'source' = 'UNAVAILABLE';
  end if;

  return coalesce(p_cost ?& array[
      'status', 'source', 'currency', 'decimalAmount', 'pricingVersion'
    ]
    and p_cost - array[
      'status', 'source', 'currency', 'decimalAmount', 'pricingVersion'
    ] = '{}'::jsonb
    and jsonb_typeof(p_cost->'currency') = 'string'
    and jsonb_typeof(p_cost->'decimalAmount') = 'string'
    and jsonb_typeof(p_cost->'pricingVersion') = 'string'
    and p_cost->>'status' = any(array['REPORTED', 'CALCULATED'])
    and p_cost->>'source' = any(array[
      'PROVIDER', 'GATEWAY', 'SERVER_PRICING_CATALOG'
    ])
    and (
      (p_cost->>'status' = 'CALCULATED') =
      (p_cost->>'source' = 'SERVER_PRICING_CATALOG')
    )
    and p_cost->>'currency' ~ '^[A-Z]{3}$'
    and char_length(p_cost->>'decimalAmount') <= 64
    and p_cost->>'decimalAmount'
      ~ '^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$'
    and p_cost->>'pricingVersion'
      ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$', false);
end;
$$;

create function careslink_v1_generation._validate_provider_evidence(
  p_note_type text,
  p_service_code text,
  p_rate_catalog_version text,
  p_worker_policy_version text,
  p_worker_policy_digest text,
  p_provider_policy_version text,
  p_provider_policy_digest text,
  p_attempt_acquired_at timestamptz,
  p_at timestamptz,
  p_evidence jsonb,
  p_expected_candidate_digest text
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_worker record;
  v_provider record;
  v_started_at timestamptz;
  v_deadline_at timestamptz;
  v_finished_at timestamptz;
  v_duration_ms bigint;
  v_digest text;
begin
  if p_evidence is null
    or jsonb_typeof(p_evidence) <> 'object'
    or not (p_evidence ?& array[
      'policyDigest', 'providerId', 'modelId', 'modelRevision',
      'modelRevisionAvailability', 'policyVersion',
      'promptTemplateVersion', 'goldenSetVersion', 'parserVersion',
      'serviceCode', 'rateCatalogVersion', 'timeoutMs',
      'workerPolicyDigest', 'deadlineAt', 'startedAt', 'finishedAt',
      'durationMs', 'finishReason', 'providerRequestIdHash', 'usage',
      'cost', 'candidateDigest'
    ])
    or p_evidence - array[
      'policyDigest', 'providerId', 'modelId', 'modelRevision',
      'modelRevisionAvailability', 'policyVersion',
      'promptTemplateVersion', 'goldenSetVersion', 'parserVersion',
      'serviceCode', 'rateCatalogVersion', 'timeoutMs',
      'workerPolicyDigest', 'deadlineAt', 'startedAt', 'finishedAt',
      'durationMs', 'finishReason', 'providerRequestIdHash', 'usage',
      'cost', 'candidateDigest'
    ] <> '{}'::jsonb
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  select policy.* into v_worker
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  select policy.* into v_provider
  from careslink_v1_generation.provider_policies as policy
  where policy.note_type = p_note_type
    and policy.policy_version = p_provider_policy_version
    and policy.policy_digest = p_provider_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  if not found
    or v_worker.version is null
    or not careslink_v1_generation._worker_policy_is_valid(
      p_worker_policy_version,
      p_worker_policy_digest
    )
    or not careslink_v1_generation._provider_policy_is_valid(
      p_note_type,
      p_provider_policy_version,
      p_provider_policy_digest
    )
    or v_provider.timeout_ms <> v_worker.provider_deadline_ms
    or v_provider.service_code <> p_service_code
    or v_provider.rate_catalog_version <> p_rate_catalog_version
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if p_evidence->>'policyDigest' is distinct from v_provider.policy_digest
    or p_evidence->>'providerId' is distinct from v_provider.provider_id
    or p_evidence->>'modelId' is distinct from v_provider.model_id
    or p_evidence->'modelRevision' is distinct from
      coalesce(to_jsonb(v_provider.model_revision), 'null'::jsonb)
    or p_evidence->>'modelRevisionAvailability'
      is distinct from v_provider.model_revision_availability
    or p_evidence->>'policyVersion'
      is distinct from v_provider.policy_version
    or p_evidence->>'promptTemplateVersion'
      is distinct from v_provider.prompt_template_version
    or p_evidence->>'goldenSetVersion'
      is distinct from v_provider.golden_set_version
    or p_evidence->>'parserVersion' is distinct from v_provider.parser_version
    or p_evidence->>'serviceCode' is distinct from v_provider.service_code
    or p_evidence->>'rateCatalogVersion'
      is distinct from v_provider.rate_catalog_version
    or not careslink_v1_generation._json_nonnegative_safe_integer(
      p_evidence->'timeoutMs'
    )
    or (p_evidence->>'timeoutMs')::bigint <> v_provider.timeout_ms
    or p_evidence->>'workerPolicyDigest'
      is distinct from v_worker.policy_digest
    or jsonb_typeof(p_evidence->'finishReason') <> 'string'
    or p_evidence->>'finishReason' not in (
      'COMPLETED', 'OUTPUT_LIMIT', 'CONTENT_FILTERED', 'TIMEOUT',
      'CANCELLED', 'PROVIDER_ERROR', 'UNKNOWN'
    )
    or not (
      p_evidence->'providerRequestIdHash' = 'null'::jsonb
      or (
        jsonb_typeof(p_evidence->'providerRequestIdHash') = 'string'
        and p_evidence->>'providerRequestIdHash' ~ '^[a-f0-9]{64}$'
      )
    )
    or jsonb_typeof(p_evidence->'candidateDigest') <> 'string'
    or coalesce(p_evidence->>'candidateDigest', '')
      !~ '^[a-f0-9]{64}$'
    or (
      p_expected_candidate_digest is not null
      and p_evidence->>'candidateDigest' <> p_expected_candidate_digest
    )
    or not careslink_v1_generation._provider_usage_is_valid(
      p_evidence->'usage'
    )
    or not careslink_v1_generation._provider_cost_is_valid(
      p_evidence->'cost'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  if jsonb_typeof(p_evidence->'policyDigest') <> 'string'
    or jsonb_typeof(p_evidence->'providerId') <> 'string'
    or jsonb_typeof(p_evidence->'modelId') <> 'string'
    or not (
      jsonb_typeof(p_evidence->'modelRevision') = 'string'
      or p_evidence->'modelRevision' = 'null'::jsonb
    )
    or jsonb_typeof(p_evidence->'modelRevisionAvailability') <> 'string'
    or jsonb_typeof(p_evidence->'policyVersion') <> 'string'
    or jsonb_typeof(p_evidence->'promptTemplateVersion') <> 'string'
    or jsonb_typeof(p_evidence->'goldenSetVersion') <> 'string'
    or jsonb_typeof(p_evidence->'parserVersion') <> 'string'
    or jsonb_typeof(p_evidence->'serviceCode') <> 'string'
    or jsonb_typeof(p_evidence->'rateCatalogVersion') <> 'string'
    or jsonb_typeof(p_evidence->'workerPolicyDigest') <> 'string'
    or jsonb_typeof(p_evidence->'deadlineAt') <> 'string'
    or jsonb_typeof(p_evidence->'startedAt') <> 'string'
    or jsonb_typeof(p_evidence->'finishedAt') <> 'string'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  if not careslink_v1_generation._json_nonnegative_safe_integer(
    p_evidence->'durationMs'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  v_started_at := careslink_v1_generation._parse_server_time(
    p_evidence->>'startedAt'
  );
  v_deadline_at := careslink_v1_generation._parse_server_time(
    p_evidence->>'deadlineAt'
  );
  v_finished_at := careslink_v1_generation._parse_server_time(
    p_evidence->>'finishedAt'
  );
  v_duration_ms := (p_evidence->>'durationMs')::bigint;

  if v_started_at < p_attempt_acquired_at
    or v_finished_at < v_started_at
    or v_finished_at > v_deadline_at
    or v_finished_at > p_at
    or extract(epoch from (v_deadline_at - v_started_at)) * 1000
      <> v_provider.timeout_ms
    or extract(epoch from (v_finished_at - v_started_at)) * 1000
      <> v_duration_ms
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  v_digest := public.v1_shadow_content_sha256(p_evidence);
  return v_digest;
end;
$$;

create function careslink_v1_generation._enqueue_payload_purge(
  p_transaction_id uuid,
  p_payload_id uuid,
  p_job_id uuid,
  p_owner_user_id uuid,
  p_reason text,
  p_at timestamptz
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_hash text;
begin
  if p_reason is null
    or p_reason not in ('SUCCEEDED', 'FAILED', 'CANCELLED')
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  update careslink_v1_generation.payload_grants as grant_record
  set status = 'REVOKED',
      revoked_at = p_at
  where grant_record.payload_id = p_payload_id
    and grant_record.job_id = p_job_id
    and grant_record.owner_user_id = p_owner_user_id
    and grant_record.status = 'ISSUED';

  update careslink_v1_generation.payloads as payload
  set state = 'REVOKED',
      revoked_at = coalesce(payload.revoked_at, p_at),
      revoke_reason = coalesce(payload.revoke_reason, p_reason),
      purge_requested_at = coalesce(payload.purge_requested_at, p_at),
      updated_at = p_at
  where payload.id = p_payload_id
    and payload.job_id = p_job_id
    and payload.owner_user_id = p_owner_user_id
    and payload.state in ('STAGED', 'AVAILABLE', 'REVOKED')
    and (
      payload.revoke_reason is null
      or payload.revoke_reason = p_reason
    );

  if not found then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  select outbox.event_reference_hash
  into v_event_hash
  from careslink_v1_generation.payload_purge_outbox as outbox
  where outbox.payload_id = p_payload_id
    and outbox.job_id = p_job_id
    and outbox.owner_user_id = p_owner_user_id;

  if v_event_hash is not null then
    return v_event_hash;
  end if;

  v_event_id := extensions.gen_random_uuid();
  v_event_hash := careslink_v1_generation._sha256_text(v_event_id::text);
  insert into careslink_v1_generation.payload_purge_outbox (
    id,
    transaction_id,
    payload_id,
    job_id,
    owner_user_id,
    reason,
    event_reference_hash,
    status,
    requested_at,
    attempt_count,
    created_at,
    shadow_only
  ) values (
    v_event_id,
    p_transaction_id,
    p_payload_id,
    p_job_id,
    p_owner_user_id,
    p_reason,
    v_event_hash,
    'PENDING',
    p_at,
    0,
    p_at,
    true
  );

  return v_event_hash;
end;
$$;

create function careslink_v1_generation._failure_envelope(
  p_job_id uuid,
  p_attempt_id uuid,
  p_registration_digest text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job record;
  v_attempt record;
  v_payload record;
  v_outbox record;
  v_disposition text;
  v_job_status text;
  v_expected_attempt_status text;
  v_payload_disposition text;
  v_is_retry boolean;
  v_purge jsonb;
begin
  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id;

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.registration_digest = p_registration_digest;

  if v_job.id is null
    or v_attempt.id is null
    or v_attempt.status = 'RUNNING'
    or v_attempt.terminal_transaction_id is null
    or v_attempt.finished_at is null
    or v_attempt.failure_reason is null
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id;

  v_is_retry := v_attempt.settlement_base_delay_ms is not null
    and v_attempt.settlement_jitter_ms is not null
    and v_attempt.settlement_retry_delay_ms is not null;

  if v_is_retry then
    v_disposition := 'RETRY_SCHEDULED';
    v_job_status := 'QUEUED';
    v_payload_disposition := 'RETAINED_FOR_RETRY';
    v_purge := null;
  elsif v_attempt.failure_reason = 'CANCELLED' then
    v_disposition := 'CANCELLED';
    v_job_status := 'CANCELLED';
    v_payload_disposition := 'REVOKED_PURGE_ENQUEUED';
  else
    v_disposition := 'FAILED';
    v_job_status := 'FAILED';
    v_payload_disposition := 'REVOKED_PURGE_ENQUEUED';
  end if;

  v_expected_attempt_status := case
    when v_attempt.failure_reason = 'CANCELLED' then 'CANCELLED'
    when v_attempt.failure_reason = 'LEASE_EXPIRED' then 'LEASE_EXPIRED'
    else 'FAILED'
  end;

  if v_attempt.status <> v_expected_attempt_status
    or (
      v_is_retry
      and v_attempt.failure_reason not in (
        'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT'
      )
    )
    or (
      not v_is_retry
      and (
        v_job.status <> v_job_status
        or v_job.finished_at is distinct from v_attempt.finished_at
      )
    )
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if v_payload.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if not v_is_retry and (
    v_payload.revoke_reason is distinct from v_disposition
    or v_payload.revoked_at is distinct from v_attempt.finished_at
  ) then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if not v_is_retry then
    select outbox.* into v_outbox
    from careslink_v1_generation.payload_purge_outbox as outbox
    where outbox.payload_id = v_job.payload_id
      and outbox.job_id = v_job.id
      and outbox.owner_user_id = v_job.owner_user_id;

    if v_outbox.id is null
      or v_outbox.transaction_id is distinct from
        v_attempt.terminal_transaction_id
      or v_outbox.reason is distinct from v_disposition
      or v_outbox.requested_at is distinct from v_attempt.finished_at
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_purge := jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', 'ENQUEUED',
      'reason', v_disposition,
      'payloadReferenceHash',
        careslink_v1_generation._sha256_text(v_job.payload_id::text),
      'eventReferenceHash', v_outbox.event_reference_hash,
      'enqueuedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at)
    );
  else
    v_purge := null;
  end if;

  return jsonb_build_object(
    'transaction', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', 'COMMITTED',
      'atomic', true,
      'committedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at),
      'registrationDigest', p_registration_digest
    ),
    'settlement', jsonb_build_object(
      'disposition', v_disposition,
      'reason', v_attempt.failure_reason,
      'payloadDisposition', v_payload_disposition,
      'baseDelayMs', v_attempt.settlement_base_delay_ms,
      'jitterMs', v_attempt.settlement_jitter_ms,
      'retryDelayMs', v_attempt.settlement_retry_delay_ms
    ),
    'jobTransition', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', v_job_status,
      'jobReferenceHash',
        careslink_v1_generation._sha256_text(v_job.id::text),
      'nextEligibleAt', case
        when not v_is_retry then null
        else careslink_v1_generation._server_time(
          v_attempt.finished_at
            + v_attempt.settlement_retry_delay_ms * interval '1 millisecond'
        )
      end,
      'finishedAt', case
        when v_is_retry then null
        else careslink_v1_generation._server_time(v_attempt.finished_at)
      end
    ),
    'attemptTerminal', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', v_attempt.status,
      'attemptReferenceHash',
        careslink_v1_generation._sha256_text(v_attempt.id::text),
      'reason', v_attempt.failure_reason,
      'providerEvidenceHash', v_attempt.provider_evidence_hash,
      'finishedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at)
    ),
    'payloadMetadata', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'state', case when v_is_retry then 'AVAILABLE' else 'REVOKED' end,
      'payloadDisposition', v_payload_disposition,
      'revokeReason', case when v_is_retry then null else v_disposition end,
      'payloadReferenceHash',
        careslink_v1_generation._sha256_text(v_payload.id::text),
      'revokedAt', case
        when v_is_retry then null
        else careslink_v1_generation._server_time(v_attempt.finished_at)
      end
    ),
    'purgeOutboxAcknowledgment', v_purge
  );
end;
$$;

create function careslink_v1_generation._success_envelope(
  p_job_id uuid,
  p_attempt_id uuid,
  p_registration_digest text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job record;
  v_attempt record;
  v_payload record;
  v_revision record;
  v_sync record;
  v_receipt record;
  v_outbox record;
  v_mutation_reference_hash text;
begin
  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.status = 'SUCCEEDED';

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.registration_digest = p_registration_digest
    and attempt.status = 'SUCCEEDED';

  if v_job.id is null
    or v_attempt.id is null
    or v_attempt.terminal_transaction_id is null
    or v_attempt.finished_at is null
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select
    revision.id,
    revision.revision_number,
    revision.base_revision_id
  into v_revision
  from public.ai_document_revisions as revision
  where revision.id = v_job.result_revision_id
    and revision.document_id = v_job.result_document_id
    and revision.owner_user_id = v_job.owner_user_id;

  select
    change.change_id,
    change.change_kind,
    change.server_time
  into v_sync
  from public.ai_document_sync_changes as change
  where change.owner_user_id = v_job.owner_user_id
    and change.document_id = v_job.result_document_id
    and change.revision_id = v_job.result_revision_id
    and change.last_mutation_id =
      'note-generation:' || careslink_v1_generation._sha256_text(v_job.id::text);

  select
    receipt.id,
    receipt.mutation_kind,
    receipt.server_time
  into v_receipt
  from public.ai_document_mutation_receipts as receipt
  where receipt.owner_user_id = v_job.owner_user_id
    and receipt.mutation_id =
      'note-generation:' || careslink_v1_generation._sha256_text(v_job.id::text)
    and receipt.document_id = v_job.result_document_id
    and receipt.revision_id = v_job.result_revision_id;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id;

  select outbox.* into v_outbox
  from careslink_v1_generation.payload_purge_outbox as outbox
  where outbox.payload_id = v_job.payload_id
    and outbox.job_id = v_job.id
    and outbox.owner_user_id = v_job.owner_user_id;

  if v_revision.id is null
    or v_sync.change_id is null
    or v_receipt.id is null
    or v_payload.id is null
    or v_outbox.id is null
    or v_job.finished_at is distinct from v_attempt.finished_at
    or v_payload.revoke_reason is distinct from 'SUCCEEDED'
    or v_payload.revoked_at is distinct from v_attempt.finished_at
    or v_outbox.transaction_id is distinct from
      v_attempt.terminal_transaction_id
    or v_outbox.reason is distinct from 'SUCCEEDED'
    or v_outbox.requested_at is distinct from v_attempt.finished_at
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_mutation_reference_hash := public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-mutation',
      'jobId', v_job.id::text,
      'attemptId', v_attempt.id::text,
      'registrationDigest', p_registration_digest
    )
  );

  return jsonb_build_object(
    'transaction', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', 'COMMITTED',
      'atomic', true,
      'committedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at),
      'registrationDigest', p_registration_digest
    ),
    'canonical', jsonb_build_object(
      'canonicalId', v_job.result_document_id,
      'revisionId', v_job.result_revision_id,
      'contentHash', v_job.result_content_hash,
      'revisionNumber', v_revision.revision_number,
      'baseRevisionId', v_revision.base_revision_id
    ),
    'syncReceipt', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', 'APPENDED',
      'kind', v_sync.change_kind,
      'changeId', v_sync.change_id::text,
      'canonicalId', v_job.result_document_id,
      'revisionId', v_job.result_revision_id,
      'contentHash', v_job.result_content_hash,
      'serverTime', careslink_v1_generation._server_time(v_sync.server_time)
    ),
    'mutationReceipt', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', 'SERVER_ACKNOWLEDGED',
      'mutationReferenceHash', v_mutation_reference_hash,
      'mutationKind', v_receipt.mutation_kind,
      'canonicalId', v_job.result_document_id,
      'revisionId', v_job.result_revision_id,
      'contentHash', v_job.result_content_hash,
      'serverTime', careslink_v1_generation._server_time(v_receipt.server_time)
    ),
    'jobTerminal', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', v_job.status,
      'jobReferenceHash',
        careslink_v1_generation._sha256_text(v_job.id::text),
      'canonicalId', v_job.result_document_id,
      'revisionId', v_job.result_revision_id,
      'contentHash', v_job.result_content_hash,
      'finishedAt',
        careslink_v1_generation._server_time(v_job.finished_at)
    ),
    'attemptTerminal', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', v_attempt.status,
      'attemptReferenceHash',
        careslink_v1_generation._sha256_text(v_attempt.id::text),
      'contentHash', v_attempt.canonical_content_hash,
      'providerEvidenceHash', v_attempt.provider_evidence_hash,
      'finishedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at)
    ),
    'payloadMetadata', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'state', 'REVOKED',
      'payloadDisposition', 'REVOKED_PURGE_ENQUEUED',
      'revokeReason', 'SUCCEEDED',
      'payloadReferenceHash',
        careslink_v1_generation._sha256_text(v_payload.id::text),
      'revokedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at)
    ),
    'purgeOutboxAcknowledgment', jsonb_build_object(
      'transactionId', v_attempt.terminal_transaction_id,
      'status', 'ENQUEUED',
      'reason', 'SUCCEEDED',
      'payloadReferenceHash',
        careslink_v1_generation._sha256_text(v_payload.id::text),
      'eventReferenceHash', v_outbox.event_reference_hash,
      'enqueuedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at)
    )
  );
end;
$$;

create function careslink_v1_generation._settle_denied_authority(
  p_job_id uuid,
  p_attempt_id uuid,
  p_payload_id uuid,
  p_registration_digest text,
  p_reason text,
  p_at timestamptz
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job record;
  v_attempt record;
  v_payload record;
  v_outbox record;
  v_transaction_id uuid;
  v_event_hash text;
begin
  if p_reason is null or p_reason not in (
    'PAYLOAD_UNAVAILABLE', 'SESSION_REVOKED', 'PRIVACY_REVIEW_STALE'
  ) then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.payload_id = p_payload_id
  for update;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
    and attempt.registration_digest = p_registration_digest
  for update;

  if v_attempt.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if v_job.status = 'FAILED' and v_attempt.status = 'FAILED' then
    if v_job.failure_reason is distinct from p_reason
      or v_attempt.failure_reason is distinct from p_reason
      or v_attempt.terminal_transaction_id is null
      or v_attempt.finished_at is null
      or v_job.finished_at is distinct from v_attempt.finished_at
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    select payload.* into v_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = p_payload_id
      and payload.job_id = p_job_id
      and payload.owner_user_id = v_job.owner_user_id;

    select outbox.* into v_outbox
    from careslink_v1_generation.payload_purge_outbox as outbox
    where outbox.payload_id = p_payload_id
      and outbox.job_id = p_job_id
      and outbox.owner_user_id = v_job.owner_user_id
      and outbox.transaction_id = v_attempt.terminal_transaction_id
      and outbox.reason = 'FAILED';

    if v_payload.id is null
      or v_payload.revoke_reason is distinct from 'FAILED'
      or v_payload.revoked_at is distinct from v_attempt.finished_at
      or v_outbox.id is null
      or v_outbox.requested_at is distinct from v_attempt.finished_at
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    return jsonb_build_object(
      'status', 'DENIED_SETTLED',
      'transactionId', v_attempt.terminal_transaction_id,
      'transactionStatus', 'COMMITTED',
      'atomic', true,
      'committedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at),
      'registrationDigest', p_registration_digest,
      'reason', p_reason,
      'jobReferenceHash',
        careslink_v1_generation._sha256_text(p_job_id::text),
      'attemptReferenceHash',
        careslink_v1_generation._sha256_text(p_attempt_id::text),
      'payloadReferenceHash',
        careslink_v1_generation._sha256_text(p_payload_id::text),
      'jobStatus', 'FAILED',
      'attemptStatus', 'FAILED',
      'payloadState', 'REVOKED',
      'payloadDisposition', 'REVOKED_PURGE_ENQUEUED',
      'purgeEventReferenceHash', v_outbox.event_reference_hash
    );
  end if;

  if v_job.status <> 'RUNNING' or v_attempt.status <> 'RUNNING' then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_transaction_id := extensions.gen_random_uuid();

  update careslink_v1_generation.attempts as attempt
  set status = 'FAILED',
      failure_reason = p_reason,
      provider_evidence_hash = null,
      canonical_content_hash = null,
      terminal_transaction_id = v_transaction_id,
      settlement_base_delay_ms = null,
      settlement_jitter_ms = null,
      settlement_retry_delay_ms = null,
      finished_at = p_at
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
    and attempt.registration_digest = p_registration_digest
    and attempt.status = 'RUNNING';

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  update careslink_v1_generation.jobs as job
  set status = 'FAILED',
      next_eligible_at = null,
      failure_reason = p_reason,
      finished_at = p_at,
      updated_at = p_at
  where job.id = p_job_id
    and job.owner_user_id = v_job.owner_user_id
    and job.status = 'RUNNING';

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_event_hash := careslink_v1_generation._enqueue_payload_purge(
    v_transaction_id,
    p_payload_id,
    p_job_id,
    v_job.owner_user_id,
    'FAILED',
    p_at
  );

  return jsonb_build_object(
    'status', 'DENIED_SETTLED',
    'transactionId', v_transaction_id,
    'transactionStatus', 'COMMITTED',
    'atomic', true,
    'committedAt', careslink_v1_generation._server_time(p_at),
    'registrationDigest', p_registration_digest,
    'reason', p_reason,
    'jobReferenceHash',
      careslink_v1_generation._sha256_text(p_job_id::text),
    'attemptReferenceHash',
      careslink_v1_generation._sha256_text(p_attempt_id::text),
    'payloadReferenceHash',
      careslink_v1_generation._sha256_text(p_payload_id::text),
    'jobStatus', 'FAILED',
    'attemptStatus', 'FAILED',
    'payloadState', 'REVOKED',
    'payloadDisposition', 'REVOKED_PURGE_ENQUEUED',
    'purgeEventReferenceHash', v_event_hash
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Nine exact private worker RPC identities
-- ---------------------------------------------------------------------------

create function careslink_v1_generation.claim_v1_shadow_note_generation_job(
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
    or not careslink_v1_generation._registration_is_valid(
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

create function careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text,
  p_worker_policy_version text,
  p_worker_policy_digest text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_job record;
  v_attempt record;
  v_payload record;
  v_policy record;
  v_new_expiry timestamptz;
begin
  perform careslink_v1_generation._assert_capability();

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
  for update;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
  for update;

  if v_attempt.id is null
    or v_job.status <> 'RUNNING'
    or v_attempt.status <> 'RUNNING'
    or v_attempt.registration_digest <> p_registration_digest
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or v_attempt.lease_expires_at <= v_now
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
    or v_job.worker_policy_version <> p_worker_policy_version
    or v_job.worker_policy_digest <> p_worker_policy_digest
    or not careslink_v1_generation._job_registration_binding_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.payload_policy_version,
      v_job.payload_policy_snapshot_hash,
      v_job.note_type,
      v_job.provider_policy_version,
      v_job.provider_policy_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;
  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at <= v_now
    or v_payload.privacy_proof_expires_at <= v_now
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  select policy.* into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED';

  v_new_expiry := least(
    v_now + v_policy.lease_duration_ms * interval '1 millisecond',
    v_attempt.acquired_at +
      v_policy.attempt_deadline_ms * interval '1 millisecond',
    v_payload.expires_at,
    v_payload.privacy_proof_expires_at
  );
  if v_new_expiry <= v_now then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  update careslink_v1_generation.attempts as attempt
  set last_heartbeat_at = v_now,
      lease_expires_at = v_new_expiry
  where attempt.id = p_attempt_id;

  return jsonb_build_object(
    'status', 'RENEWED',
    'jobReferenceHash',
      careslink_v1_generation._sha256_text(p_job_id::text),
    'attemptReferenceHash',
      careslink_v1_generation._sha256_text(p_attempt_id::text),
    'registrationDigest', p_registration_digest
  );
end;
$$;

create function careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text,
  p_worker_policy_version text,
  p_worker_policy_digest text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_job record;
  v_attempt record;
  v_payload record;
  v_policy record;
  v_fence_id uuid;
  v_fence_digest text;
  v_fence_expires_at timestamptz;
begin
  perform careslink_v1_generation._assert_capability();

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
  for update;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
  for update;

  if v_attempt.id is null
    or v_job.status <> 'RUNNING'
    or v_attempt.status <> 'RUNNING'
    or v_attempt.registration_digest <> p_registration_digest
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or v_attempt.lease_expires_at <= v_now
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
    or v_job.worker_policy_version <> p_worker_policy_version
    or v_job.worker_policy_digest <> p_worker_policy_digest
    or not careslink_v1_generation._job_registration_binding_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.payload_policy_version,
      v_job.payload_policy_snapshot_hash,
      v_job.note_type,
      v_job.provider_policy_version,
      v_job.provider_policy_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;
  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at <= v_now
    or v_payload.privacy_proof_expires_at <= v_now
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  if v_attempt.fence_id is not null then
    return jsonb_build_object(
      'status', 'FENCED',
      'fenceId', v_attempt.fence_id,
      'fenceDigest', v_attempt.fence_digest,
      'expiresAt',
        careslink_v1_generation._server_time(v_attempt.fence_expires_at),
      'jobReferenceHash',
        careslink_v1_generation._sha256_text(p_job_id::text),
      'attemptReferenceHash',
        careslink_v1_generation._sha256_text(p_attempt_id::text),
      'registrationDigest', p_registration_digest
    );
  end if;

  select policy.* into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED';

  v_fence_id := extensions.gen_random_uuid();
  v_fence_expires_at := least(
    v_attempt.lease_expires_at,
    v_attempt.acquired_at +
      v_policy.attempt_deadline_ms * interval '1 millisecond',
    v_payload.expires_at,
    v_payload.privacy_proof_expires_at
  );
  if v_fence_expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;
  v_fence_digest := public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-attempt-fence',
      'jobId', p_job_id::text,
      'attemptId', p_attempt_id::text,
      'fenceId', v_fence_id::text,
      'registrationDigest', p_registration_digest,
      'leaseTokenHash', v_attempt.lease_token_hash
    )
  );

  update careslink_v1_generation.attempts as attempt
  set fence_id = v_fence_id,
      fence_digest = v_fence_digest,
      fenced_at = v_now,
      fence_expires_at = v_fence_expires_at
  where attempt.id = p_attempt_id;

  return jsonb_build_object(
    'status', 'FENCED',
    'fenceId', v_fence_id,
    'fenceDigest', v_fence_digest,
    'expiresAt', careslink_v1_generation._server_time(v_fence_expires_at),
    'jobReferenceHash',
      careslink_v1_generation._sha256_text(p_job_id::text),
    'attemptReferenceHash',
      careslink_v1_generation._sha256_text(p_attempt_id::text),
    'registrationDigest', p_registration_digest
  );
end;
$$;

create function careslink_v1_generation.commit_v1_shadow_note_generation_success(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text,
  p_worker_policy_version text,
  p_worker_policy_digest text,
  p_fence_id uuid,
  p_fence_digest text,
  p_canonical_content jsonb,
  p_canonical_content_hash text,
  p_provider_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_job record;
  v_attempt record;
  v_payload record;
  v_privacy_expires_at timestamptz;
  v_candidate_digest text;
  v_evidence_hash text;
  v_transaction_id uuid;
  v_document_id uuid;
  v_revision_id uuid;
  v_change_id bigint;
  v_receipt_id uuid;
  v_mutation_id text;
  v_mutation_reference_hash text;
  v_event_hash text;
  v_request_fingerprint jsonb;
  v_acknowledgement jsonb;
begin
  perform careslink_v1_generation._assert_capability();

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
  for update;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
  for update;

  if v_attempt.id is null
    or v_attempt.registration_digest <> p_registration_digest
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or v_job.worker_policy_version <> p_worker_policy_version
    or v_job.worker_policy_digest <> p_worker_policy_digest
    or not careslink_v1_generation._job_registration_binding_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.payload_policy_version,
      v_job.payload_policy_snapshot_hash,
      v_job.note_type,
      v_job.provider_policy_version,
      v_job.provider_policy_digest
    )
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  v_candidate_digest := careslink_v1_generation._validate_note_content(
    v_job.note_type,
    v_job.schema_version,
    v_job.cleaned_facts_hash,
    p_canonical_content,
    p_canonical_content_hash
  );
  v_evidence_hash := careslink_v1_generation._validate_provider_evidence(
    v_job.note_type,
    v_job.service_code,
    v_job.rate_catalog_version,
    v_job.worker_policy_version,
    v_job.worker_policy_digest,
    v_job.provider_policy_version,
    v_job.provider_policy_digest,
    v_attempt.acquired_at,
    v_now,
    p_provider_evidence,
    v_candidate_digest
  );

  if p_provider_evidence->>'finishReason' <> 'COMPLETED' then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  if v_job.status = 'SUCCEEDED' and v_attempt.status = 'SUCCEEDED' then
    if v_job.result_content_hash is distinct from p_canonical_content_hash
      or v_attempt.canonical_content_hash
        is distinct from p_canonical_content_hash
      or v_attempt.provider_evidence_hash is distinct from v_evidence_hash
      or v_attempt.fence_id is distinct from p_fence_id
      or v_attempt.fence_digest is distinct from p_fence_digest
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    return careslink_v1_generation._success_envelope(
      p_job_id,
      p_attempt_id,
      p_registration_digest
    );
  end if;

  if v_job.status <> 'RUNNING'
    or v_attempt.status <> 'RUNNING'
    or v_attempt.lease_expires_at <= v_now
    or v_attempt.fence_id is distinct from p_fence_id
    or v_attempt.fence_digest is distinct from p_fence_digest
    or v_attempt.fence_expires_at is null
    or v_attempt.fence_expires_at <= v_now
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  if not careslink_v1_generation.fresh_session_is_active(
    v_job.owner_user_id,
    v_job.initiating_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  v_privacy_expires_at :=
    careslink_v1_generation.fresh_privacy_proof_expires_at(
      v_job.privacy_review_id,
      v_job.owner_user_id,
      v_job.note_type,
      v_job.cleaned_facts_hash,
      v_job.schema_version,
      v_job.contract_version,
      v_now
    );
  if v_privacy_expires_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'PRIVACY_REVIEW_STALE';
  end if;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at <= v_now
    or v_payload.privacy_proof_expires_at is distinct from v_privacy_expires_at
    or v_payload.expires_at > v_privacy_expires_at
    or v_payload.note_type <> v_job.note_type
    or v_payload.source_locale <> v_job.source_locale
    or v_payload.contract_version <> v_job.contract_version
    or v_payload.schema_version <> v_job.schema_version
    or v_payload.privacy_review_id <> v_job.privacy_review_id
    or v_payload.cleaned_facts_hash <> v_job.cleaned_facts_hash
    or v_payload.request_hash <> v_job.request_hash
    or v_payload.policy_version <> v_job.payload_policy_version
    or v_payload.policy_snapshot_hash <> v_job.payload_policy_snapshot_hash
    or not careslink_v1_generation._payload_snapshot_is_valid(
      v_payload.policy_version,
      v_payload.policy_snapshot_hash,
      v_payload.encryption_profile_version,
      v_payload.backup_disposition_version
    )
    or v_attempt.payload_authorized_at is null
    or not exists (
      select 1
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.payload_id = v_payload.id
        and grant_record.job_id = v_job.id
        and grant_record.owner_user_id = v_job.owner_user_id
        and grant_record.attempt_id = v_attempt.id
        and grant_record.registration_digest = p_registration_digest
        and grant_record.lease_token_hash = v_attempt.lease_token_hash
        and grant_record.request_hash = v_job.request_hash
        and grant_record.status = 'CONSUMED'
        and grant_record.consumed_at is not null
        and grant_record.consumed_at <= v_now
        and grant_record.expires_at > grant_record.consumed_at
    )
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  v_transaction_id := extensions.gen_random_uuid();
  v_document_id := extensions.gen_random_uuid();
  v_revision_id := extensions.gen_random_uuid();
  v_receipt_id := extensions.gen_random_uuid();
  v_mutation_id :=
    'note-generation:' || careslink_v1_generation._sha256_text(v_job.id::text);
  v_mutation_reference_hash := public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-mutation',
      'jobId', v_job.id::text,
      'attemptId', v_attempt.id::text,
      'registrationDigest', p_registration_digest
    )
  );
  v_request_fingerprint := jsonb_build_object(
    'kind', 'careslink.v1.note-generation-create',
    'jobReferenceHash',
      careslink_v1_generation._sha256_text(v_job.id::text),
    'attemptReferenceHash',
      careslink_v1_generation._sha256_text(v_attempt.id::text),
    'registrationDigest', p_registration_digest,
    'contentHash', p_canonical_content_hash,
    'providerEvidenceHash', v_evidence_hash
  );

  insert into public.ai_documents (
    id,
    owner_user_id,
    note_type,
    source_locale,
    lifecycle_status,
    current_revision_id,
    current_revision_number,
    schema_version,
    contract_version,
    shadow_only,
    created_at,
    updated_at
  ) values (
    v_document_id,
    v_job.owner_user_id,
    v_job.note_type,
    v_job.source_locale,
    'IN_PROGRESS',
    null,
    0,
    v_job.schema_version,
    v_job.contract_version,
    true,
    v_now,
    v_now
  );

  insert into public.ai_document_revisions (
    id,
    document_id,
    owner_user_id,
    revision_number,
    base_revision_id,
    privacy_review_id,
    content,
    content_hash,
    mutation_id,
    schema_version,
    contract_version,
    shadow_only,
    created_at
  ) values (
    v_revision_id,
    v_document_id,
    v_job.owner_user_id,
    1,
    null,
    v_job.privacy_review_id,
    p_canonical_content,
    p_canonical_content_hash,
    v_mutation_id,
    v_job.schema_version,
    v_job.contract_version,
    true,
    v_now
  );

  update public.ai_documents as document
  set current_revision_id = v_revision_id,
      current_revision_number = 1,
      updated_at = v_now
  where document.id = v_document_id
    and document.owner_user_id = v_job.owner_user_id;

  insert into public.ai_document_sync_changes (
    owner_user_id,
    change_kind,
    document_id,
    revision_id,
    last_mutation_id,
    server_time,
    deleted_at,
    shadow_only
  ) values (
    v_job.owner_user_id,
    'DOCUMENT_UPSERTED',
    v_document_id,
    v_revision_id,
    v_mutation_id,
    v_now,
    null,
    true
  ) returning change_id into v_change_id;

  v_acknowledgement := jsonb_build_object(
    'status', 'SERVER_ACKNOWLEDGED',
    'mutationReferenceHash', v_mutation_reference_hash,
    'mutationKind', 'CREATE_DOCUMENT',
    'canonicalId', v_document_id,
    'revisionId', v_revision_id,
    'contentHash', p_canonical_content_hash,
    'serverTime', careslink_v1_generation._server_time(v_now)
  );

  insert into public.ai_document_mutation_receipts (
    id,
    owner_user_id,
    mutation_id,
    mutation_kind,
    request_fingerprint,
    document_id,
    revision_id,
    change_id,
    acknowledgement,
    server_time,
    shadow_only,
    created_at
  ) values (
    v_receipt_id,
    v_job.owner_user_id,
    v_mutation_id,
    'CREATE_DOCUMENT',
    v_request_fingerprint,
    v_document_id,
    v_revision_id,
    v_change_id,
    v_acknowledgement,
    v_now,
    true,
    v_now
  );

  insert into careslink_v1_generation.provider_evidence (
    attempt_id,
    job_id,
    owner_user_id,
    evidence_hash,
    evidence,
    created_at,
    shadow_only
  ) values (
    v_attempt.id,
    v_job.id,
    v_job.owner_user_id,
    v_evidence_hash,
    p_provider_evidence,
    v_now,
    true
  );

  v_event_hash := careslink_v1_generation._enqueue_payload_purge(
    v_transaction_id,
    v_job.payload_id,
    v_job.id,
    v_job.owner_user_id,
    'SUCCEEDED',
    v_now
  );

  update careslink_v1_generation.attempts as attempt
  set status = 'SUCCEEDED',
      provider_evidence_hash = v_evidence_hash,
      canonical_content_hash = p_canonical_content_hash,
      failure_reason = null,
      terminal_transaction_id = v_transaction_id,
      settlement_base_delay_ms = null,
      settlement_jitter_ms = null,
      settlement_retry_delay_ms = null,
      finished_at = v_now
  where attempt.id = v_attempt.id
    and attempt.status = 'RUNNING';

  update careslink_v1_generation.jobs as job
  set status = 'SUCCEEDED',
      next_eligible_at = null,
      failure_reason = null,
      result_document_id = v_document_id,
      result_revision_id = v_revision_id,
      result_content_hash = p_canonical_content_hash,
      finished_at = v_now,
      updated_at = v_now
  where job.id = v_job.id
    and job.status = 'RUNNING';

  return careslink_v1_generation._success_envelope(
    p_job_id,
    p_attempt_id,
    p_registration_digest
  );
end;
$$;

create function careslink_v1_generation.settle_v1_shadow_note_generation_failure(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text,
  p_worker_policy_version text,
  p_worker_policy_digest text,
  p_reason text,
  p_provider_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_job record;
  v_attempt record;
  v_policy record;
  v_payload record;
  v_evidence_hash text;
  v_transaction_id uuid;
  v_retry_allowed boolean;
  v_base_delay_ms bigint;
  v_jitter_ms bigint;
  v_retry_delay_ms bigint;
  v_next_eligible_at timestamptz;
  v_attempt_status text;
  v_job_status text;
  v_purge_reason text;
  v_event_hash text;
begin
  perform careslink_v1_generation._assert_capability();

  if p_reason is null or p_reason not in (
    'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT',
    'PROVIDER_PERMANENT', 'PROVIDER_OUTPUT_INVALID', 'PAYLOAD_UNAVAILABLE',
    'SESSION_REVOKED', 'PRIVACY_REVIEW_STALE', 'CANCELLED',
    'POLICY_MISMATCH', 'INTERNAL_FAILURE'
  ) then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
  for update;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
  for update;

  if v_attempt.id is null
    or v_attempt.registration_digest <> p_registration_digest
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or v_job.worker_policy_version <> p_worker_policy_version
    or v_job.worker_policy_digest <> p_worker_policy_digest
    or not careslink_v1_generation._job_registration_binding_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.payload_policy_version,
      v_job.payload_policy_snapshot_hash,
      v_job.note_type,
      v_job.provider_policy_version,
      v_job.provider_policy_digest
    )
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if p_provider_evidence is not null then
    v_evidence_hash := careslink_v1_generation._validate_provider_evidence(
      v_job.note_type,
      v_job.service_code,
      v_job.rate_catalog_version,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.provider_policy_version,
      v_job.provider_policy_digest,
      v_attempt.acquired_at,
      v_now,
      p_provider_evidence,
      null
    );
  else
    v_evidence_hash := null;
  end if;

  if v_attempt.status <> 'RUNNING' then
    if v_attempt.failure_reason is distinct from p_reason
      or v_attempt.provider_evidence_hash is distinct from v_evidence_hash
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    return careslink_v1_generation._failure_envelope(
      p_job_id,
      p_attempt_id,
      p_registration_digest
    );
  end if;

  if v_job.status <> 'RUNNING'
    or (v_attempt.lease_expires_at <= v_now and p_reason <> 'LEASE_EXPIRED')
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  select policy.* into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  v_retry_allowed := p_reason = any(v_policy.retryable_outcomes)
    and v_attempt.attempt_number < v_policy.max_attempts;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  if v_payload.id is null then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  if v_retry_allowed and (
    v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at <= v_now
    or v_payload.privacy_proof_expires_at <= v_now
  ) then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  v_transaction_id := extensions.gen_random_uuid();

  if p_provider_evidence is not null then
    insert into careslink_v1_generation.provider_evidence (
      attempt_id,
      job_id,
      owner_user_id,
      evidence_hash,
      evidence,
      created_at,
      shadow_only
    ) values (
      v_attempt.id,
      v_job.id,
      v_job.owner_user_id,
      v_evidence_hash,
      p_provider_evidence,
      v_now,
      true
    );
  end if;

  if v_retry_allowed then
    v_base_delay_ms :=
      v_policy.retry_delay_ms_after_attempt[v_attempt.attempt_number];
    v_jitter_ms := case
      when v_policy.jitter_mode = 'NONE' then 0
      else floor(
        pg_catalog.random()::numeric * (v_policy.jitter_max_ms + 1)
      )::bigint
    end;
    v_retry_delay_ms := v_base_delay_ms + v_jitter_ms;
    v_next_eligible_at :=
      v_now + v_retry_delay_ms * interval '1 millisecond';
    v_attempt_status := case
      when p_reason = 'LEASE_EXPIRED' then 'LEASE_EXPIRED'
      else 'FAILED'
    end;

    update careslink_v1_generation.attempts as attempt
    set status = v_attempt_status,
        provider_evidence_hash = v_evidence_hash,
        canonical_content_hash = null,
        failure_reason = p_reason,
        terminal_transaction_id = v_transaction_id,
        settlement_base_delay_ms = v_base_delay_ms,
        settlement_jitter_ms = v_jitter_ms,
        settlement_retry_delay_ms = v_retry_delay_ms,
        finished_at = v_now
    where attempt.id = v_attempt.id
      and attempt.status = 'RUNNING';

    update careslink_v1_generation.jobs as job
    set status = 'QUEUED',
        next_eligible_at = v_next_eligible_at,
        failure_reason = null,
        finished_at = null,
        updated_at = v_now
    where job.id = v_job.id
      and job.status = 'RUNNING';
  else
    v_attempt_status := case
      when p_reason = 'CANCELLED' then 'CANCELLED'
      when p_reason = 'LEASE_EXPIRED' then 'LEASE_EXPIRED'
      else 'FAILED'
    end;
    v_job_status := case
      when p_reason = 'CANCELLED' then 'CANCELLED'
      else 'FAILED'
    end;
    v_purge_reason := v_job_status;
    v_event_hash := careslink_v1_generation._enqueue_payload_purge(
      v_transaction_id,
      v_job.payload_id,
      v_job.id,
      v_job.owner_user_id,
      v_purge_reason,
      v_now
    );

    update careslink_v1_generation.attempts as attempt
    set status = v_attempt_status,
        provider_evidence_hash = v_evidence_hash,
        canonical_content_hash = null,
        failure_reason = p_reason,
        terminal_transaction_id = v_transaction_id,
        settlement_base_delay_ms = null,
        settlement_jitter_ms = null,
        settlement_retry_delay_ms = null,
        finished_at = v_now
    where attempt.id = v_attempt.id
      and attempt.status = 'RUNNING';

    update careslink_v1_generation.jobs as job
    set status = v_job_status,
        next_eligible_at = null,
        failure_reason = p_reason,
        finished_at = v_now,
        updated_at = v_now
    where job.id = v_job.id
      and job.status = 'RUNNING';
  end if;

  return careslink_v1_generation._failure_envelope(
    p_job_id,
    p_attempt_id,
    p_registration_digest
  );
end;
$$;

create function careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text,
  p_expected_content_hash text,
  p_expected_provider_evidence_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_attempt record;
  v_status text;
begin
  perform careslink_v1_generation._assert_capability();

  if p_expected_content_hash is not null
      and p_expected_content_hash !~ '^[a-f0-9]{64}$'
    or p_expected_provider_evidence_hash is not null
      and p_expected_provider_evidence_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
  for update;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
  for update;

  if v_attempt.id is null
    or v_attempt.registration_digest <> p_registration_digest
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
    or not careslink_v1_generation._job_registration_binding_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.payload_policy_version,
      v_job.payload_policy_snapshot_hash,
      v_job.note_type,
      v_job.provider_policy_version,
      v_job.provider_policy_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if v_attempt.status = 'RUNNING' and v_job.status = 'RUNNING' then
    return jsonb_build_object('status', 'RUNNING');
  end if;

  if v_attempt.status = 'SUCCEEDED' and v_job.status = 'SUCCEEDED' then
    if p_expected_content_hash is null
      or p_expected_provider_evidence_hash is null
      or v_attempt.canonical_content_hash
        is distinct from p_expected_content_hash
      or v_attempt.provider_evidence_hash
        is distinct from p_expected_provider_evidence_hash
      or v_job.result_content_hash is distinct from p_expected_content_hash
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    return jsonb_build_object(
      'status', 'SUCCEEDED',
      'atomicSuccess', careslink_v1_generation._success_envelope(
        p_job_id,
        p_attempt_id,
        p_registration_digest
      )
    );
  end if;

  if p_expected_content_hash is not null
    or v_attempt.canonical_content_hash is not null
    or v_attempt.provider_evidence_hash
      is distinct from p_expected_provider_evidence_hash
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if v_attempt.settlement_base_delay_ms is not null
    and v_attempt.settlement_jitter_ms is not null
    and v_attempt.settlement_retry_delay_ms is not null
  then
    v_status := 'RETRY_SCHEDULED';
  elsif v_attempt.failure_reason = 'CANCELLED' then
    v_status := 'CANCELLED';
  else
    v_status := 'FAILED';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'atomicSettlement', careslink_v1_generation._failure_envelope(
      p_job_id,
      p_attempt_id,
      p_registration_digest
    )
  );
end;
$$;

create function careslink_v1_generation.recover_v1_shadow_note_generation_expired(
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
  v_candidate record;
  v_job record;
  v_attempt record;
  v_payload record;
  v_attempt_id uuid;
  v_lease_hash text;
  v_transaction_id uuid;
  v_retry_allowed boolean;
  v_base_delay_ms bigint;
  v_jitter_ms bigint;
  v_retry_delay_ms bigint;
  v_next_eligible_at timestamptz;
  v_terminal_reason text;
  v_event_hash text;
  v_recovered integer := 0;
  v_requeued integer := 0;
  v_failed integer := 0;
begin
  perform careslink_v1_generation._assert_capability();

  if p_registration_digest is null
    or p_worker_policy_version is null
    or p_worker_policy_digest is null
    or p_worker_identity_hash is null
    or p_worker_identity_hash !~ '^[a-f0-9]{64}$'
    or p_contract_version is distinct from '1.0.0-shadow.1'
    or p_schema_version is distinct from '2026-08-09.v1-shadow'
    or not careslink_v1_generation._registration_is_valid(
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

  -- A queued job whose queue-age budget or payload/proof lifetime is already
  -- exhausted can never become claimable again. Settle it within the same
  -- bounded recovery batch using the existing PAYLOAD_UNAVAILABLE reason,
  -- create a metadata-only terminal recovery attempt, and enqueue purge so an
  -- expired payload cannot remain AVAILABLE indefinitely.
  for v_candidate in
    select job.id
    from careslink_v1_generation.jobs as job
    join careslink_v1_generation.payloads as payload
      on payload.id = job.payload_id
     and payload.job_id = job.id
     and payload.owner_user_id = job.owner_user_id
    where job.status = 'QUEUED'
      and job.worker_policy_version = p_worker_policy_version
      and job.worker_policy_digest = p_worker_policy_digest
      and job.contract_version = p_contract_version
      and job.schema_version = p_schema_version
      and careslink_v1_generation._job_registration_binding_is_valid(
        p_registration_digest,
        job.worker_policy_version,
        job.worker_policy_digest,
        job.payload_policy_version,
        job.payload_policy_snapshot_hash,
        job.note_type,
        job.provider_policy_version,
        job.provider_policy_digest
      )
      and (
        job.created_at +
          v_policy.max_queue_age_ms * interval '1 millisecond' <= v_now
        or payload.state <> 'AVAILABLE'
        or payload.expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
        or payload.privacy_proof_expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
      )
    order by job.created_at, job.id
    for update of job skip locked
    limit v_policy.recovery_batch_limit
  loop
    select job.* into v_job
    from careslink_v1_generation.jobs as job
    where job.id = v_candidate.id;
    perform careslink_v1_generation._set_owner(v_job.owner_user_id);

    select payload.* into v_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = v_job.payload_id
      and payload.job_id = v_job.id
      and payload.owner_user_id = v_job.owner_user_id
    for update;

    if v_payload.id is null then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_transaction_id := extensions.gen_random_uuid();
    v_attempt_id := extensions.gen_random_uuid();
    v_lease_hash := careslink_v1_generation._sha256_text(
      careslink_v1_generation._new_opaque_secret()
    );
    v_event_hash := careslink_v1_generation._enqueue_payload_purge(
      v_transaction_id,
      v_job.payload_id,
      v_job.id,
      v_job.owner_user_id,
      'FAILED',
      v_now
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
      failure_reason,
      finished_at,
      created_at,
      shadow_only,
      terminal_transaction_id
    ) values (
      v_attempt_id,
      v_job.id,
      v_job.owner_user_id,
      v_job.attempt_count + 1,
      'FAILED',
      p_worker_identity_hash,
      p_registration_digest,
      v_lease_hash,
      v_now,
      v_now,
      v_now + interval '1 millisecond',
      'PAYLOAD_UNAVAILABLE',
      v_now,
      v_now,
      true,
      v_transaction_id
    );

    update careslink_v1_generation.jobs as job
    set status = 'FAILED',
        attempt_count = v_job.attempt_count + 1,
        next_eligible_at = null,
        failure_reason = 'PAYLOAD_UNAVAILABLE',
        started_at = coalesce(job.started_at, v_now),
        finished_at = v_now,
        updated_at = v_now
    where job.id = v_job.id
      and job.status = 'QUEUED';

    v_recovered := v_recovered + 1;
    v_failed := v_failed + 1;
  end loop;

  for v_candidate in
    select job.id
    from careslink_v1_generation.jobs as job
    join careslink_v1_generation.attempts as attempt
      on attempt.job_id = job.id
     and attempt.owner_user_id = job.owner_user_id
     and attempt.status = 'RUNNING'
    where job.status = 'RUNNING'
      and job.worker_policy_version = p_worker_policy_version
      and job.worker_policy_digest = p_worker_policy_digest
      and job.contract_version = p_contract_version
      and job.schema_version = p_schema_version
      and attempt.registration_digest = p_registration_digest
      and attempt.worker_identity_hash = p_worker_identity_hash
      and attempt.lease_expires_at <= v_now
    order by attempt.lease_expires_at, job.created_at, job.id
    for update of job skip locked
    limit greatest(v_policy.recovery_batch_limit - v_recovered, 0)
  loop
    select job.* into v_job
    from careslink_v1_generation.jobs as job
    where job.id = v_candidate.id;
    perform careslink_v1_generation._set_owner(v_job.owner_user_id);

    select attempt.* into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.job_id = v_job.id
      and attempt.owner_user_id = v_job.owner_user_id
      and attempt.status = 'RUNNING'
    for update;

    if v_attempt.id is null
      or v_attempt.registration_digest <> p_registration_digest
      or v_attempt.worker_identity_hash <> p_worker_identity_hash
      or v_attempt.lease_expires_at > v_now
      or not careslink_v1_generation._job_registration_binding_is_valid(
        p_registration_digest,
        v_job.worker_policy_version,
        v_job.worker_policy_digest,
        v_job.payload_policy_version,
        v_job.payload_policy_snapshot_hash,
        v_job.note_type,
        v_job.provider_policy_version,
        v_job.provider_policy_digest
      )
    then
      continue;
    end if;

    select payload.* into v_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = v_job.payload_id
      and payload.job_id = v_job.id
      and payload.owner_user_id = v_job.owner_user_id
    for update;

    v_retry_allowed := 'LEASE_EXPIRED' = any(v_policy.retryable_outcomes)
      and v_attempt.attempt_number < v_policy.max_attempts
      and v_payload.id is not null
      and v_payload.state = 'AVAILABLE'
      and v_payload.expires_at > v_now
      and v_payload.privacy_proof_expires_at > v_now;
    v_terminal_reason := case
      when v_payload.id is null
        or v_payload.state <> 'AVAILABLE'
        or v_payload.expires_at <= v_now
        or v_payload.privacy_proof_expires_at <= v_now
      then 'PAYLOAD_UNAVAILABLE'
      else 'LEASE_EXPIRED'
    end;
    v_transaction_id := extensions.gen_random_uuid();

    if v_retry_allowed then
      v_base_delay_ms :=
        v_policy.retry_delay_ms_after_attempt[v_attempt.attempt_number];
      v_jitter_ms := case
        when v_policy.jitter_mode = 'NONE' then 0
        else floor(
          pg_catalog.random()::numeric * (v_policy.jitter_max_ms + 1)
        )::bigint
      end;
      v_retry_delay_ms := v_base_delay_ms + v_jitter_ms;
      v_next_eligible_at :=
        v_now + v_retry_delay_ms * interval '1 millisecond';

      update careslink_v1_generation.attempts as attempt
      set status = 'LEASE_EXPIRED',
          failure_reason = 'LEASE_EXPIRED',
          terminal_transaction_id = v_transaction_id,
          settlement_base_delay_ms = v_base_delay_ms,
          settlement_jitter_ms = v_jitter_ms,
          settlement_retry_delay_ms = v_retry_delay_ms,
          finished_at = v_now
      where attempt.id = v_attempt.id
        and attempt.status = 'RUNNING';

      update careslink_v1_generation.jobs as job
      set status = 'QUEUED',
          next_eligible_at = v_next_eligible_at,
          failure_reason = null,
          finished_at = null,
          updated_at = v_now
      where job.id = v_job.id
        and job.status = 'RUNNING';

      v_requeued := v_requeued + 1;
    else
      if v_payload.id is null then
        -- A deferrable job/payload FK makes this unreachable for committed
        -- data. Fail the batch rather than fabricate a purge acknowledgment.
        raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
      end if;

      v_event_hash := careslink_v1_generation._enqueue_payload_purge(
        v_transaction_id,
        v_job.payload_id,
        v_job.id,
        v_job.owner_user_id,
        'FAILED',
        v_now
      );

      update careslink_v1_generation.attempts as attempt
      set status = case
            when v_terminal_reason = 'LEASE_EXPIRED'
              then 'LEASE_EXPIRED'
            else 'FAILED'
          end,
          failure_reason = v_terminal_reason,
          terminal_transaction_id = v_transaction_id,
          settlement_base_delay_ms = null,
          settlement_jitter_ms = null,
          settlement_retry_delay_ms = null,
          finished_at = v_now
      where attempt.id = v_attempt.id
        and attempt.status = 'RUNNING';

      update careslink_v1_generation.jobs as job
      set status = 'FAILED',
          next_eligible_at = null,
          failure_reason = v_terminal_reason,
          finished_at = v_now,
          updated_at = v_now
      where job.id = v_job.id
        and job.status = 'RUNNING';

      v_failed := v_failed + 1;
    end if;

    v_recovered := v_recovered + 1;
  end loop;

  return jsonb_build_object(
    'recovered', v_recovered,
    'requeued', v_requeued,
    'failed', v_failed
  );
end;
$$;

create function careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
  p_job_id uuid,
  p_payload_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_job record;
  v_attempt record;
  v_payload record;
  v_policy record;
  v_grant record;
  v_privacy_expires_at timestamptz;
  v_grant_id uuid;
  v_grant_expires_at timestamptz;
begin
  perform careslink_v1_generation._assert_capability();

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.payload_id = p_payload_id
  for update;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
    and attempt.registration_digest = p_registration_digest
  for update;

  if v_attempt.id is null
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
    or not careslink_v1_generation._job_registration_binding_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.payload_policy_version,
      v_job.payload_policy_snapshot_hash,
      v_job.note_type,
      v_job.provider_policy_version,
      v_job.provider_policy_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  if v_job.status = 'FAILED'
    and v_attempt.status = 'FAILED'
    and v_attempt.failure_reason in (
      'PAYLOAD_UNAVAILABLE', 'SESSION_REVOKED', 'PRIVACY_REVIEW_STALE'
    )
  then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      v_attempt.failure_reason,
      v_attempt.finished_at
    );
  end if;

  if v_job.status <> 'RUNNING'
    or v_attempt.status <> 'RUNNING'
    or v_attempt.lease_expires_at <= v_now
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  if not careslink_v1_generation.fresh_session_is_active(
    v_job.owner_user_id,
    v_job.initiating_session_id,
    v_now
  ) then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      'SESSION_REVOKED',
      v_now
    );
  end if;

  v_privacy_expires_at :=
    careslink_v1_generation.fresh_privacy_proof_expires_at(
      v_job.privacy_review_id,
      v_job.owner_user_id,
      v_job.note_type,
      v_job.cleaned_facts_hash,
      v_job.schema_version,
      v_job.contract_version,
      v_now
    );
  if v_privacy_expires_at is null then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      'PRIVACY_REVIEW_STALE',
      v_now
    );
  end if;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = p_payload_id
    and payload.job_id = p_job_id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at <= v_now
    or v_payload.privacy_proof_expires_at is distinct from v_privacy_expires_at
    or v_payload.expires_at > v_privacy_expires_at
    or v_payload.note_type <> v_job.note_type
    or v_payload.source_locale <> v_job.source_locale
    or v_payload.contract_version <> v_job.contract_version
    or v_payload.schema_version <> v_job.schema_version
    or v_payload.privacy_review_id <> v_job.privacy_review_id
    or v_payload.cleaned_facts_hash <> v_job.cleaned_facts_hash
    or v_payload.request_hash <> v_job.request_hash
    or v_payload.policy_version <> v_job.payload_policy_version
    or v_payload.policy_snapshot_hash <> v_job.payload_policy_snapshot_hash
    or not careslink_v1_generation._payload_snapshot_is_valid(
      v_payload.policy_version,
      v_payload.policy_snapshot_hash,
      v_payload.encryption_profile_version,
      v_payload.backup_disposition_version
    )
  then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      'PAYLOAD_UNAVAILABLE',
      v_now
    );
  end if;

  select policy.* into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = v_job.worker_policy_version
    and policy.policy_digest = v_job.worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  v_grant_expires_at := least(
    v_payload.expires_at,
    v_privacy_expires_at,
    v_attempt.acquired_at +
      v_policy.attempt_deadline_ms * interval '1 millisecond'
  );
  if v_grant_expires_at - v_now <
    v_policy.provider_deadline_ms * interval '1 millisecond'
  then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      'PAYLOAD_UNAVAILABLE',
      v_now
    );
  end if;

  select grant_record.* into v_grant
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.payload_id = p_payload_id
    and grant_record.attempt_id = p_attempt_id
  for update;

  if v_grant.id is not null then
    if v_grant.job_id <> p_job_id
      or v_grant.owner_user_id <> v_job.owner_user_id
      or v_grant.registration_digest <> p_registration_digest
      or v_grant.lease_token_hash <> v_attempt.lease_token_hash
      or v_grant.request_hash <> v_job.request_hash
      or v_grant.status <> 'ISSUED'
      or v_grant.expires_at <= v_now
    then
      return careslink_v1_generation._settle_denied_authority(
        p_job_id,
        p_attempt_id,
        p_payload_id,
        p_registration_digest,
        'PAYLOAD_UNAVAILABLE',
        v_now
      );
    end if;

    update careslink_v1_generation.attempts as attempt
    set payload_authorized_at = coalesce(attempt.payload_authorized_at, v_now)
    where attempt.id = p_attempt_id;

    return jsonb_build_object(
      'status', 'AUTHORIZED',
      'grantId', v_grant.id,
      'expiresAt',
        careslink_v1_generation._server_time(v_grant.expires_at),
      'jobReferenceHash',
        careslink_v1_generation._sha256_text(p_job_id::text),
      'attemptReferenceHash',
        careslink_v1_generation._sha256_text(p_attempt_id::text),
      'payloadReferenceHash',
        careslink_v1_generation._sha256_text(p_payload_id::text),
      'registrationDigest', p_registration_digest
    );
  end if;

  v_grant_id := extensions.gen_random_uuid();
  insert into careslink_v1_generation.payload_grants (
    id,
    payload_id,
    job_id,
    owner_user_id,
    attempt_id,
    registration_digest,
    lease_token_hash,
    request_hash,
    status,
    authorized_at,
    expires_at,
    created_at,
    shadow_only
  ) values (
    v_grant_id,
    p_payload_id,
    p_job_id,
    v_job.owner_user_id,
    p_attempt_id,
    p_registration_digest,
    v_attempt.lease_token_hash,
    v_job.request_hash,
    'ISSUED',
    v_now,
    v_grant_expires_at,
    v_now,
    true
  );

  update careslink_v1_generation.attempts as attempt
  set payload_authorized_at = v_now
  where attempt.id = p_attempt_id
    and attempt.status = 'RUNNING';

  return jsonb_build_object(
    'status', 'AUTHORIZED',
    'grantId', v_grant_id,
    'expiresAt', careslink_v1_generation._server_time(v_grant_expires_at),
    'jobReferenceHash',
      careslink_v1_generation._sha256_text(p_job_id::text),
    'attemptReferenceHash',
      careslink_v1_generation._sha256_text(p_attempt_id::text),
    'payloadReferenceHash',
      careslink_v1_generation._sha256_text(p_payload_id::text),
    'registrationDigest', p_registration_digest
  );
end;
$$;

-- The provider-neutral payload backend, KMS profile and retention/purge
-- operator remain unapproved. This identity performs every fresh authority and
-- metadata binding check, but deliberately cannot release a vault capability.
-- A valid consume request is therefore atomically terminally denied as
-- PAYLOAD_UNAVAILABLE; no token, locator or raw facts are generated or stored.
create function careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
  p_job_id uuid,
  p_payload_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text,
  p_grant_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_job record;
  v_attempt record;
  v_payload record;
  v_grant record;
  v_privacy_expires_at timestamptz;
begin
  perform careslink_v1_generation._assert_capability();

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.payload_id = p_payload_id
  for update;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
    and attempt.registration_digest = p_registration_digest
  for update;

  if v_attempt.id is null
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
    or not careslink_v1_generation._job_registration_binding_is_valid(
      p_registration_digest,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.payload_policy_version,
      v_job.payload_policy_snapshot_hash,
      v_job.note_type,
      v_job.provider_policy_version,
      v_job.provider_policy_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  if v_job.status = 'FAILED'
    and v_attempt.status = 'FAILED'
    and v_attempt.failure_reason in (
      'PAYLOAD_UNAVAILABLE', 'SESSION_REVOKED', 'PRIVACY_REVIEW_STALE'
    )
  then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      v_attempt.failure_reason,
      v_attempt.finished_at
    );
  end if;

  if v_job.status <> 'RUNNING'
    or v_attempt.status <> 'RUNNING'
    or v_attempt.lease_expires_at <= v_now
    or v_attempt.payload_authorized_at is null
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  if not careslink_v1_generation.fresh_session_is_active(
    v_job.owner_user_id,
    v_job.initiating_session_id,
    v_now
  ) then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      'SESSION_REVOKED',
      v_now
    );
  end if;

  v_privacy_expires_at :=
    careslink_v1_generation.fresh_privacy_proof_expires_at(
      v_job.privacy_review_id,
      v_job.owner_user_id,
      v_job.note_type,
      v_job.cleaned_facts_hash,
      v_job.schema_version,
      v_job.contract_version,
      v_now
    );
  if v_privacy_expires_at is null then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      'PRIVACY_REVIEW_STALE',
      v_now
    );
  end if;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = p_payload_id
    and payload.job_id = p_job_id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at <= v_now
    or v_payload.privacy_proof_expires_at is distinct from v_privacy_expires_at
    or v_payload.expires_at > v_privacy_expires_at
    or v_payload.note_type <> v_job.note_type
    or v_payload.source_locale <> v_job.source_locale
    or v_payload.contract_version <> v_job.contract_version
    or v_payload.schema_version <> v_job.schema_version
    or v_payload.privacy_review_id <> v_job.privacy_review_id
    or v_payload.cleaned_facts_hash <> v_job.cleaned_facts_hash
    or v_payload.request_hash <> v_job.request_hash
    or v_payload.policy_version <> v_job.payload_policy_version
    or v_payload.policy_snapshot_hash <> v_job.payload_policy_snapshot_hash
    or not careslink_v1_generation._payload_snapshot_is_valid(
      v_payload.policy_version,
      v_payload.policy_snapshot_hash,
      v_payload.encryption_profile_version,
      v_payload.backup_disposition_version
    )
  then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      'PAYLOAD_UNAVAILABLE',
      v_now
    );
  end if;

  select grant_record.* into v_grant
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.id = p_grant_id
    and grant_record.payload_id = p_payload_id
    and grant_record.job_id = p_job_id
    and grant_record.owner_user_id = v_job.owner_user_id
    and grant_record.attempt_id = p_attempt_id
  for update;

  if v_grant.id is null
    or v_grant.registration_digest <> p_registration_digest
    or v_grant.lease_token_hash <> v_attempt.lease_token_hash
    or v_grant.request_hash <> v_job.request_hash
    or v_grant.status <> 'ISSUED'
    or v_grant.expires_at <= v_now
  then
    return careslink_v1_generation._settle_denied_authority(
      p_job_id,
      p_attempt_id,
      p_payload_id,
      p_registration_digest,
      'PAYLOAD_UNAVAILABLE',
      v_now
    );
  end if;

  return careslink_v1_generation._settle_denied_authority(
    p_job_id,
    p_attempt_id,
    p_payload_id,
    p_registration_digest,
    'PAYLOAD_UNAVAILABLE',
    v_now
  );
end;
$$;

-- Close every exact RPC identity explicitly. Executor ownership is not a
-- caller grant; no API role or service_role can execute these functions and
-- the private schema is not Data API exposed.
revoke all on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    text, text, text, text, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation.commit_v1_shadow_note_generation_success(
    uuid, uuid, text, text, text, text, uuid, text, jsonb, text, jsonb
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation.settle_v1_shadow_note_generation_failure(
    uuid, uuid, text, text, text, text, text, jsonb
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    text, text, text, text, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    uuid, uuid, uuid, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
    uuid, uuid, uuid, text, text, uuid
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation
  from careslink_v1_generation_executor;
-- Reassert zero private-schema API surface after all objects exist. Executor
-- retains only the table DML and helper EXECUTE needed by its owned functions.
revoke all on all tables in schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema careslink_v1_generation
  from public, anon, authenticated, service_role;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- Remove only this migration's temporary SET edges. The PostgreSQL-16
-- bootstrap administrative memberships from role creation remain untouched.
revoke careslink_v1_generation_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_owner from current_user
  granted by current_user;
