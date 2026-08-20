-- Five-Note durable generation metadata foundation.
--
-- This migration is intentionally additive, source-only and default-off. It
-- creates no callable function, policy, view, trigger or runtime privilege. A
-- later, separately reviewed migration must add the payload-vault metadata,
-- one-time authorizations, purge outbox and narrowly typed worker RPCs after the
-- operational policy and disposable Preview gates are approved.
--
-- The migration runner owns the transaction boundary.

create role careslink_v1_generation_owner
  with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;

create role careslink_v1_generation_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;

-- PostgreSQL 16+ gives a non-superuser CREATEROLE creator an unavoidable
-- bootstrap-superuser grant on each new role with ADMIN TRUE, INHERIT FALSE
-- and SET FALSE. That administrative edge cannot exercise either role's
-- privileges. Add a separate, explicitly non-inheriting SET grant solely for
-- the ownership transfer; only this current-user-granted edge is revoked at
-- the end of the migration. The bootstrap administrative edges remain and
-- must be asserted as such rather than misreported as zero memberships.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;

create schema careslink_v1_generation authorization current_user;

revoke all on schema careslink_v1_generation
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;

alter default privileges in schema careslink_v1_generation
  revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;

-- The owner is dedicated to this namespace. Close its global defaults because
-- PostgreSQL schema-local revokes cannot subtract a privilege granted by a
-- global default ACL (notably PUBLIC function execution and type usage). The
-- hosted migration actor is not a superuser, so exercise the temporary SET
-- membership and have the owner alter its own defaults rather than using FOR
-- ROLE as the migration actor.
set role careslink_v1_generation_owner;

alter default privileges
  revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
alter default privileges
  revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
alter default privileges
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
alter default privileges
  revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;

reset role;

create table careslink_v1_generation.settings (
  capability text primary key,
  enabled boolean not null default false,
  shadow_only boolean not null default true,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  constraint settings_capability_check check (
    capability = 'note_generation_v1'
  ),
  constraint settings_enabled_check check (enabled = false),
  constraint settings_shadow_only_check check (shadow_only = true),
  constraint settings_time_check check (updated_at >= created_at)
);

insert into careslink_v1_generation.settings (
  capability,
  enabled,
  shadow_only
) values (
  'note_generation_v1',
  false,
  true
);

create table careslink_v1_generation.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null
    references auth.users(id) on delete restrict,
  initiating_session_id uuid not null,
  admission_transport text not null,
  payload_id uuid not null,
  note_type text not null,
  source_locale text not null,
  service_code text not null,
  rate_catalog_version text not null,
  contract_version text not null,
  schema_version text not null,
  privacy_review_id uuid not null,
  privacy_scanner_policy_version text not null,
  privacy_review_revision integer not null,
  cleaned_facts_hash text not null,
  idempotency_hash text not null,
  request_hash text not null,
  worker_policy_version text not null,
  worker_policy_digest text not null,
  provider_policy_version text not null,
  provider_policy_digest text not null,
  payload_policy_version text not null,
  payload_policy_snapshot_hash text not null,
  status text not null default 'QUEUED',
  attempt_count integer not null default 0,
  next_eligible_at timestamptz,
  failure_reason text,
  result_document_id uuid,
  result_revision_id uuid,
  result_content_hash text,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  shadow_only boolean not null default true,
  constraint jobs_owner_identity_unique unique (id, owner_user_id),
  constraint jobs_payload_unique unique (payload_id),
  constraint jobs_owner_idempotency_unique unique (
    owner_user_id,
    idempotency_hash
  ),
  constraint jobs_privacy_owner_fk foreign key (
    privacy_review_id,
    owner_user_id
  ) references public.privacy_reviews(id, owner_user_id) on delete restrict,
  constraint jobs_result_document_owner_fk foreign key (
    result_document_id,
    owner_user_id
  ) references public.ai_documents(id, owner_user_id) on delete restrict,
  constraint jobs_result_revision_owner_fk foreign key (
    result_revision_id,
    result_document_id,
    owner_user_id
  ) references public.ai_document_revisions(
    id,
    document_id,
    owner_user_id
  ) on delete restrict,
  constraint jobs_admission_transport_check check (
    admission_transport in ('BEARER', 'COOKIE')
  ),
  constraint jobs_note_type_check check (
    note_type in (
      'communication',
      'handover',
      'progress',
      'ndis',
      'incident_factual'
    )
  ),
  constraint jobs_source_locale_check check (
    source_locale in ('en', 'zh-Hans', 'zh-Hant')
  ),
  constraint jobs_service_binding_check check (
    (note_type = 'communication' and service_code = 'note.communication.generate')
    or (note_type = 'handover' and service_code = 'note.handover.generate')
    or (note_type = 'progress' and service_code = 'note.progress.generate')
    or (note_type = 'ndis' and service_code = 'note.ndis.generate')
    or (
      note_type = 'incident_factual'
      and service_code = 'note.incident_factual.generate'
    )
  ),
  constraint jobs_contract_version_check check (
    contract_version = '1.0.0-shadow.1'
  ),
  constraint jobs_schema_version_check check (
    schema_version = '2026-08-09.v1-shadow'
  ),
  constraint jobs_rate_catalog_version_check check (
    rate_catalog_version = '2026-08-09.v1-shadow'
  ),
  constraint jobs_privacy_policy_version_check check (
    privacy_scanner_policy_version = '2026-08-11.preview.1'
  ),
  constraint jobs_privacy_review_revision_check check (
    privacy_review_revision = 1
  ),
  constraint jobs_hashes_check check (
    cleaned_facts_hash ~ '^[a-f0-9]{64}$'
    and idempotency_hash ~ '^[a-f0-9]{64}$'
    and request_hash ~ '^[a-f0-9]{64}$'
    and worker_policy_digest ~ '^[a-f0-9]{64}$'
    and provider_policy_digest ~ '^[a-f0-9]{64}$'
    and payload_policy_snapshot_hash ~ '^[a-f0-9]{64}$'
    and (
      result_content_hash is null
      or result_content_hash ~ '^[a-f0-9]{64}$'
    )
  ),
  constraint jobs_version_identifiers_check check (
    char_length(btrim(rate_catalog_version)) between 1 and 128
    and char_length(btrim(privacy_scanner_policy_version)) between 1 and 128
    and char_length(btrim(worker_policy_version)) between 1 and 128
    and char_length(btrim(provider_policy_version)) between 1 and 128
    and char_length(btrim(payload_policy_version)) between 1 and 128
  ),
  constraint jobs_status_check check (
    status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')
  ),
  constraint jobs_attempt_count_check check (attempt_count >= 0),
  constraint jobs_failure_reason_check check (
    failure_reason is null
    or failure_reason in (
      'LEASE_EXPIRED',
      'PROVIDER_TIMEOUT',
      'PROVIDER_TRANSIENT',
      'PROVIDER_PERMANENT',
      'PROVIDER_OUTPUT_INVALID',
      'PAYLOAD_UNAVAILABLE',
      'SESSION_REVOKED',
      'PRIVACY_REVIEW_STALE',
      'CANCELLED',
      'POLICY_MISMATCH',
      'INTERNAL_FAILURE'
    )
  ),
  constraint jobs_terminal_shape_check check (
    (
      status = 'QUEUED'
      and failure_reason is null
      and result_document_id is null
      and result_revision_id is null
      and result_content_hash is null
      and finished_at is null
    )
    or (
      status = 'RUNNING'
      and attempt_count > 0
      and next_eligible_at is null
      and failure_reason is null
      and result_document_id is null
      and result_revision_id is null
      and result_content_hash is null
      and started_at is not null
      and finished_at is null
    )
    or (
      status = 'SUCCEEDED'
      and attempt_count > 0
      and next_eligible_at is null
      and failure_reason is null
      and result_document_id is not null
      and result_revision_id is not null
      and result_content_hash is not null
      and started_at is not null
      and finished_at is not null
    )
    or (
      status = 'FAILED'
      and attempt_count > 0
      and next_eligible_at is null
      and failure_reason is not null
      and result_document_id is null
      and result_revision_id is null
      and result_content_hash is null
      and started_at is not null
      and finished_at is not null
    )
    or (
      status = 'CANCELLED'
      and next_eligible_at is null
      and failure_reason = 'CANCELLED'
      and result_document_id is null
      and result_revision_id is null
      and result_content_hash is null
      and finished_at is not null
    )
  ),
  constraint jobs_time_check check (
    updated_at >= created_at
    and (started_at is null or started_at >= created_at)
    and (finished_at is null or finished_at >= created_at)
    and (
      started_at is null
      or finished_at is null
      or finished_at >= started_at
    )
    and (next_eligible_at is null or next_eligible_at >= created_at)
  ),
  constraint jobs_shadow_only_check check (shadow_only = true)
);

create index jobs_claim_order_idx
  on careslink_v1_generation.jobs(next_eligible_at, created_at, id)
  where status = 'QUEUED';
create index jobs_owner_created_idx
  on careslink_v1_generation.jobs(owner_user_id, created_at desc, id);
create index jobs_initiating_session_idx
  on careslink_v1_generation.jobs(initiating_session_id);
create index jobs_privacy_owner_idx
  on careslink_v1_generation.jobs(privacy_review_id, owner_user_id);
create index jobs_result_document_owner_idx
  on careslink_v1_generation.jobs(result_document_id, owner_user_id)
  where result_document_id is not null;
create index jobs_result_revision_owner_idx
  on careslink_v1_generation.jobs(
    result_revision_id,
    result_document_id,
    owner_user_id
  ) where result_revision_id is not null;

create table careslink_v1_generation.attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  owner_user_id uuid not null,
  attempt_number integer not null,
  status text not null default 'RUNNING',
  worker_identity_hash text not null,
  registration_digest text not null,
  lease_token_hash text not null,
  acquired_at timestamptz not null,
  last_heartbeat_at timestamptz not null,
  lease_expires_at timestamptz not null,
  payload_authorized_at timestamptz,
  fence_id uuid,
  fence_digest text,
  fenced_at timestamptz,
  fence_expires_at timestamptz,
  provider_evidence_hash text,
  canonical_content_hash text,
  failure_reason text,
  finished_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  shadow_only boolean not null default true,
  constraint attempts_identity_binding_unique unique (
    id,
    job_id,
    owner_user_id
  ),
  constraint attempts_job_number_unique unique (job_id, attempt_number),
  constraint attempts_job_owner_fk foreign key (job_id, owner_user_id)
    references careslink_v1_generation.jobs(id, owner_user_id)
    on delete restrict,
  constraint attempts_number_check check (attempt_number > 0),
  constraint attempts_status_check check (
    status in ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'LEASE_EXPIRED')
  ),
  constraint attempts_hashes_check check (
    worker_identity_hash ~ '^[a-f0-9]{64}$'
    and registration_digest ~ '^[a-f0-9]{64}$'
    and lease_token_hash ~ '^[a-f0-9]{64}$'
    and (
      fence_digest is null
      or fence_digest ~ '^[a-f0-9]{64}$'
    )
    and (
      provider_evidence_hash is null
      or provider_evidence_hash ~ '^[a-f0-9]{64}$'
    )
    and (
      canonical_content_hash is null
      or canonical_content_hash ~ '^[a-f0-9]{64}$'
    )
  ),
  constraint attempts_failure_reason_check check (
    failure_reason is null
    or failure_reason in (
      'LEASE_EXPIRED',
      'PROVIDER_TIMEOUT',
      'PROVIDER_TRANSIENT',
      'PROVIDER_PERMANENT',
      'PROVIDER_OUTPUT_INVALID',
      'PAYLOAD_UNAVAILABLE',
      'SESSION_REVOKED',
      'PRIVACY_REVIEW_STALE',
      'CANCELLED',
      'POLICY_MISMATCH',
      'INTERNAL_FAILURE'
    )
  ),
  constraint attempts_fence_shape_check check (
    (
      fence_id is null
      and fence_digest is null
      and fenced_at is null
      and fence_expires_at is null
    )
    or (
      fence_id is not null
      and fence_digest is not null
      and fenced_at is not null
      and fence_expires_at is not null
      and fence_expires_at > fenced_at
    )
  ),
  constraint attempts_terminal_shape_check check (
    (
      status = 'RUNNING'
      and failure_reason is null
      and provider_evidence_hash is null
      and canonical_content_hash is null
      and finished_at is null
    )
    or (
      status = 'SUCCEEDED'
      and failure_reason is null
      and provider_evidence_hash is not null
      and canonical_content_hash is not null
      and finished_at is not null
    )
    or (
      status in ('FAILED', 'CANCELLED', 'LEASE_EXPIRED')
      and failure_reason is not null
      and canonical_content_hash is null
      and finished_at is not null
    )
  ),
  constraint attempts_reason_status_check check (
    (status <> 'CANCELLED' or failure_reason = 'CANCELLED')
    and (status <> 'LEASE_EXPIRED' or failure_reason = 'LEASE_EXPIRED')
  ),
  constraint attempts_time_check check (
    acquired_at >= created_at
    and last_heartbeat_at >= acquired_at
    and last_heartbeat_at < lease_expires_at
    and lease_expires_at > acquired_at
    and (
      payload_authorized_at is null
      or (
        payload_authorized_at >= acquired_at
        and payload_authorized_at < lease_expires_at
      )
    )
    and (fenced_at is null or fenced_at >= acquired_at)
    and (fence_expires_at is null or fence_expires_at <= lease_expires_at)
    and (finished_at is null or finished_at >= acquired_at)
  ),
  constraint attempts_shadow_only_check check (shadow_only = true)
);

create unique index attempts_one_running_per_job_idx
  on careslink_v1_generation.attempts(job_id)
  where status = 'RUNNING';
create index attempts_job_owner_idx
  on careslink_v1_generation.attempts(job_id, owner_user_id);
create index attempts_owner_created_idx
  on careslink_v1_generation.attempts(owner_user_id, created_at desc, id);
create index attempts_running_lease_expiry_idx
  on careslink_v1_generation.attempts(lease_expires_at, job_id, id)
  where status = 'RUNNING';

alter table careslink_v1_generation.settings enable row level security;
alter table careslink_v1_generation.settings force row level security;
alter table careslink_v1_generation.jobs enable row level security;
alter table careslink_v1_generation.jobs force row level security;
alter table careslink_v1_generation.attempts enable row level security;
alter table careslink_v1_generation.attempts force row level security;

revoke all on all tables in schema careslink_v1_generation
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
revoke all on all sequences in schema careslink_v1_generation
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
revoke all on all functions in schema careslink_v1_generation
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;
revoke all on type
  careslink_v1_generation.settings,
  careslink_v1_generation.jobs,
  careslink_v1_generation.attempts
  from public, anon, authenticated, service_role,
    careslink_v1_generation_executor;

alter schema careslink_v1_generation
  owner to careslink_v1_generation_owner;
alter table careslink_v1_generation.settings
  owner to careslink_v1_generation_owner;
alter table careslink_v1_generation.jobs
  owner to careslink_v1_generation_owner;
alter table careslink_v1_generation.attempts
  owner to careslink_v1_generation_owner;

-- The schema and object ACLs were closed above while the migration actor still
-- owned them. Ownership transfer changes the implicit owner privileges only;
-- do not repeat the schema REVOKE here as a non-owner migration actor.

revoke careslink_v1_generation_owner from current_user
  granted by current_user;
