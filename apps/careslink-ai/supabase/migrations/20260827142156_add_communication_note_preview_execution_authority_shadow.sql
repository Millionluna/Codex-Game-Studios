-- Communication Note disposable Preview execution-authority shadow ledger.
--
-- Source-only and default-off. This migration defines private, append-only
-- storage and NOLOGIN execution identities for an authorization statement that
-- an external application trust registry has already verified with Ed25519.
-- PostgreSQL rechecks the signed statement's canonical digest and fixed policy
-- bindings, but does not claim to perform the external signature verification.
--
-- A claim token and a per-slot dispatch authorization are each returned once.
-- An exact replay after an acknowledgement loss returns content-free existing
-- state with executionAuthorized/dispatchAuthorized = false. A reservation is
-- durable before transport begins; every terminal outcome consumes the slot,
-- and only COMPLETED permits the next ordered slot. There is no retry/release
-- path. Receipts authenticate a CaresLink observation, not OpenAI: provider
-- attestation remains ABSENT and provider correlation identifiers are HMACed.
--
-- This migration creates no authorization, claim, reservation, receipt, key,
-- caller membership, HTTPS path, paid request, deployment or hosted mutation.
-- The migration runner owns the transaction boundary.

select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

create role careslink_v1_preview_authorization_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;
create role careslink_v1_preview_dispatch_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;
create role careslink_v1_preview_receipt_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_authorization_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_dispatch_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_receipt_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Close each future definer owner's global and schema-local defaults before it
-- creates any helper or RPC. PUBLIC function EXECUTE is otherwise implicit.
set role careslink_v1_preview_authorization_executor;
alter default privileges revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
alter default privileges revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
alter default privileges revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
alter default privileges revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_dispatch_executor;
alter default privileges revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_receipt_executor;
alter default privileges revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_receipt_executor;
alter default privileges revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_receipt_executor;
alter default privileges revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_receipt_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_receipt_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_receipt_executor;
alter default privileges revoke all on tables
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor;
alter default privileges revoke all on sequences
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor;
alter default privileges revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor;
alter default privileges revoke all on types
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on functions
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Five private append-only ledgers
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_owner;

create table careslink_v1_generation.communication_note_preview_authorizations (
  authorization_digest text primary key,
  authorization_id uuid not null unique,
  authorization_nonce_hash text not null unique,
  owner_subject_hmac text not null,
  tenant_scope_hmac text not null,
  run_id_hash text not null unique,
  signer_key_id_hash text not null,
  signer_public_key_sha256 text not null,
  openai_project_id_hmac text not null,
  statement jsonb not null,
  signature_base64url text not null,
  signature_sha256 text not null,
  authenticity text not null,
  verifier_method text not null,
  verifier_identity_hmac text not null,
  authority_policy_digest text not null,
  request_body_pin_bundle_digest text not null,
  runner_policy_digest text not null,
  issued_at timestamptz not null,
  not_before timestamptz not null,
  expires_at timestamptz not null,
  verified_at timestamptz not null,
  registered_at timestamptz not null,
  shadow_only boolean not null default true,
  constraint communication_note_preview_authorizations_hashes_check check (
    authorization_digest ~ '^[a-f0-9]{64}$'
    and authorization_nonce_hash ~ '^[a-f0-9]{64}$'
    and owner_subject_hmac ~ '^[a-f0-9]{64}$'
    and tenant_scope_hmac ~ '^[a-f0-9]{64}$'
    and run_id_hash ~ '^[a-f0-9]{64}$'
    and signer_key_id_hash ~ '^[a-f0-9]{64}$'
    and signer_public_key_sha256 ~ '^[a-f0-9]{64}$'
    and openai_project_id_hmac ~ '^[a-f0-9]{64}$'
    and signature_sha256 ~ '^[a-f0-9]{64}$'
    and verifier_identity_hmac ~ '^[a-f0-9]{64}$'
    and authority_policy_digest ~ '^[a-f0-9]{64}$'
    and request_body_pin_bundle_digest ~ '^[a-f0-9]{64}$'
    and runner_policy_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint communication_note_preview_authorizations_signature_check check (
    signature_base64url ~ '^[A-Za-z0-9_-]{86}$'
  ),
  constraint communication_note_preview_authorizations_authenticity_check check (
    authenticity = 'EXTERNAL_OWNER_ED25519_VERIFIED'
    and verifier_method = 'APPLICATION_ED25519_TRUST_REGISTRY'
  ),
  constraint communication_note_preview_authorizations_policy_check check (
    authority_policy_digest =
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9'
    and request_body_pin_bundle_digest =
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8'
    and runner_policy_digest =
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
  ),
  constraint communication_note_preview_authorizations_time_check check (
    not_before >= issued_at
    and expires_at > not_before
    and expires_at - issued_at <= interval '15 minutes'
    and verified_at >= issued_at - interval '5 seconds'
    and registered_at = verified_at
  ),
  constraint communication_note_preview_authorizations_shadow_check check (
    shadow_only is true
  )
);

create table careslink_v1_generation.communication_note_preview_authorization_revocations (
  revocation_id uuid primary key,
  authorization_digest text not null unique
    references careslink_v1_generation.communication_note_preview_authorizations(
      authorization_digest
    ) on update restrict on delete restrict,
  reason_code text not null,
  evidence_sha256 text not null,
  verifier_identity_hmac text not null,
  revoked_at timestamptz not null,
  registered_at timestamptz not null,
  shadow_only boolean not null default true,
  constraint comm_preview_auth_revocations_reason_check check (
    reason_code in (
      'OWNER_REVOKED',
      'SIGNING_KEY_REVOKED',
      'POLICY_REVOKED',
      'SECURITY_HOLD'
    )
  ),
  constraint comm_preview_auth_revocations_hashes_check check (
    evidence_sha256 ~ '^[a-f0-9]{64}$'
    and verifier_identity_hmac ~ '^[a-f0-9]{64}$'
  ),
  constraint comm_preview_auth_revocations_time_check check (
    registered_at = revoked_at
  ),
  constraint comm_preview_auth_revocations_shadow_check check (
    shadow_only is true
  )
);

create table careslink_v1_generation.communication_note_preview_claims (
  claim_id uuid primary key,
  authorization_digest text not null unique
    references careslink_v1_generation.communication_note_preview_authorizations(
      authorization_digest
    ) on update restrict on delete restrict,
  run_id_hash text not null unique,
  claim_token_sha256 text not null unique,
  executor_identity_hmac text not null,
  authority_policy_digest text not null,
  request_body_pin_bundle_digest text not null,
  runner_policy_digest text not null,
  claimed_at timestamptz not null,
  shadow_only boolean not null default true,
  constraint communication_note_preview_claims_hashes_check check (
    run_id_hash ~ '^[a-f0-9]{64}$'
    and claim_token_sha256 ~ '^[a-f0-9]{64}$'
    and executor_identity_hmac ~ '^[a-f0-9]{64}$'
  ),
  constraint communication_note_preview_claims_policy_check check (
    authority_policy_digest =
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9'
    and request_body_pin_bundle_digest =
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8'
    and runner_policy_digest =
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
  ),
  constraint communication_note_preview_claims_shadow_check check (
    shadow_only is true
  )
);

create table careslink_v1_generation.communication_note_preview_dispatch_reservations (
  reservation_id uuid primary key,
  claim_id uuid not null
    references careslink_v1_generation.communication_note_preview_claims(
      claim_id
    ) on update restrict on delete restrict,
  authorization_digest text not null,
  run_id_hash text not null,
  slot_index integer not null,
  fixture_id text not null,
  run_ordinal integer not null,
  attempt_ordinal integer not null,
  request_body_sha256 text not null,
  request_body_utf8_byte_length integer not null,
  semantic_canonical_request_sha256 text not null,
  client_request_id_hmac text not null unique,
  reserved_at timestamptz not null,
  shadow_only boolean not null default true,
  constraint comm_preview_reservations_claim_slot_unique
    unique (claim_id, slot_index),
  constraint comm_preview_reservations_run_slot_unique
    unique (run_id_hash, slot_index),
  constraint communication_note_preview_dispatch_reservations_hashes_check check (
    authorization_digest ~ '^[a-f0-9]{64}$'
    and run_id_hash ~ '^[a-f0-9]{64}$'
    and request_body_sha256 ~ '^[a-f0-9]{64}$'
    and semantic_canonical_request_sha256 ~ '^[a-f0-9]{64}$'
    and client_request_id_hmac ~ '^[a-f0-9]{64}$'
  ),
  constraint communication_note_preview_dispatch_reservations_slot_check check (
    slot_index between 0 and 5
    and run_ordinal between 1 and 2
    and attempt_ordinal = 1
    and request_body_utf8_byte_length > 0
  ),
  constraint communication_note_preview_dispatch_reservations_shadow_check check (
    shadow_only is true
  )
);

create table careslink_v1_generation.communication_note_preview_dispatch_receipts (
  receipt_digest text primary key,
  reservation_id uuid not null unique
    references careslink_v1_generation.communication_note_preview_dispatch_reservations(
      reservation_id
    ) on update restrict on delete restrict,
  claim_id uuid not null,
  authorization_digest text not null,
  run_id_hash text not null,
  slot_index integer not null,
  statement jsonb not null,
  signature_base64url text not null,
  signature_sha256 text not null,
  signer_key_id_hash text not null,
  signer_public_key_sha256 text not null,
  verifier_identity_hmac text not null,
  authenticity text not null,
  provider_attestation text not null,
  transport_scope text not null,
  not_proof_of text[] not null,
  outcome text not null,
  http_status integer,
  client_request_id_hmac text not null,
  openai_request_id_hmac text,
  openai_response_id_hmac text,
  usage jsonb,
  calculated_cost_upper_bound_micro_usd integer,
  observed_at timestamptz not null,
  verified_at timestamptz not null,
  no_retry boolean not null,
  shadow_only boolean not null default true,
  constraint communication_note_preview_dispatch_receipts_hashes_check check (
    receipt_digest ~ '^[a-f0-9]{64}$'
    and authorization_digest ~ '^[a-f0-9]{64}$'
    and run_id_hash ~ '^[a-f0-9]{64}$'
    and signature_sha256 ~ '^[a-f0-9]{64}$'
    and signer_key_id_hash ~ '^[a-f0-9]{64}$'
    and signer_public_key_sha256 ~ '^[a-f0-9]{64}$'
    and verifier_identity_hmac ~ '^[a-f0-9]{64}$'
    and client_request_id_hmac ~ '^[a-f0-9]{64}$'
    and (
      openai_request_id_hmac is null
      or openai_request_id_hmac ~ '^[a-f0-9]{64}$'
    )
    and (
      openai_response_id_hmac is null
      or openai_response_id_hmac ~ '^[a-f0-9]{64}$'
    )
  ),
  constraint communication_note_preview_dispatch_receipts_signature_check check (
    signature_base64url ~ '^[A-Za-z0-9_-]{86}$'
  ),
  constraint communication_note_preview_dispatch_receipts_identity_check check (
    slot_index between 0 and 5
    and authenticity = 'CARESLINK_SIGNED_INTERNAL_OBSERVATION'
    and provider_attestation = 'ABSENT'
    and transport_scope = 'APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION'
    and not_proof_of = array[
      'EXACT_PROVIDER_RECEIPT',
      'BILLING',
      'MODEL_EXECUTION',
      'EXACTLY_ONCE'
    ]::text[]
    and no_retry is true
  ),
  constraint communication_note_preview_dispatch_receipts_outcome_check check (
    outcome in (
      'COMPLETED',
      'PROVIDER_HTTP_ERROR',
      'TRANSPORT_AMBIGUOUS',
      'LOCAL_PRE_DISPATCH_ABORTED'
    )
  ),
  constraint communication_note_preview_dispatch_receipts_transport_check check (((
    (
      outcome = 'COMPLETED'
      and http_status is not null
      and http_status between 200 and 299
      and openai_request_id_hmac is not null
      and openai_response_id_hmac is not null
      and usage is not null
      and pg_catalog.jsonb_typeof(usage) = 'object'
      and calculated_cost_upper_bound_micro_usd is not null
      and calculated_cost_upper_bound_micro_usd between 0 and 20130
    )
    or (
      outcome = 'PROVIDER_HTTP_ERROR'
      and http_status is not null
      and http_status between 400 and 599
      and openai_response_id_hmac is null
      and usage is null
      and calculated_cost_upper_bound_micro_usd is null
    )
    or (
      outcome = 'TRANSPORT_AMBIGUOUS'
      and (http_status is null or http_status between 100 and 599)
      and usage is null
      and calculated_cost_upper_bound_micro_usd is null
    )
    or (
      outcome = 'LOCAL_PRE_DISPATCH_ABORTED'
      and http_status is null
      and openai_request_id_hmac is null
      and openai_response_id_hmac is null
      and usage is null
      and calculated_cost_upper_bound_micro_usd is not null
      and calculated_cost_upper_bound_micro_usd = 0
    )
  )
    and (
      openai_request_id_hmac is null
      or openai_request_id_hmac <> client_request_id_hmac
    )
    and (
      openai_response_id_hmac is null
      or openai_response_id_hmac <> client_request_id_hmac
    )
    and (
      openai_request_id_hmac is null
      or openai_response_id_hmac is null
      or openai_request_id_hmac <> openai_response_id_hmac
    )
  ) is true),
  constraint communication_note_preview_dispatch_receipts_time_check check (
    verified_at >= observed_at - interval '5 seconds'
  ),
  constraint communication_note_preview_dispatch_receipts_shadow_check check (
    shadow_only is true
  )
);

create unique index communication_note_preview_receipts_openai_request_hmac_idx
  on careslink_v1_generation.communication_note_preview_dispatch_receipts(
    openai_request_id_hmac
  ) where openai_request_id_hmac is not null;
create unique index communication_note_preview_receipts_openai_response_hmac_idx
  on careslink_v1_generation.communication_note_preview_dispatch_receipts(
    openai_response_id_hmac
  ) where openai_response_id_hmac is not null;

alter table careslink_v1_generation.communication_note_preview_authorizations
  enable row level security;
alter table careslink_v1_generation.communication_note_preview_authorizations
  force row level security;
alter table careslink_v1_generation.communication_note_preview_authorization_revocations
  enable row level security;
alter table careslink_v1_generation.communication_note_preview_authorization_revocations
  force row level security;
alter table careslink_v1_generation.communication_note_preview_claims
  enable row level security;
alter table careslink_v1_generation.communication_note_preview_claims
  force row level security;
alter table careslink_v1_generation.communication_note_preview_dispatch_reservations
  enable row level security;
alter table careslink_v1_generation.communication_note_preview_dispatch_reservations
  force row level security;
alter table careslink_v1_generation.communication_note_preview_dispatch_receipts
  enable row level security;
alter table careslink_v1_generation.communication_note_preview_dispatch_receipts
  force row level security;

-- Policies are role-specific. UPDATE is lock-only and cannot write because
-- every UPDATE policy has WITH CHECK(false); immutable triggers are added below.
create policy communication_note_preview_authorizations_registration_select
  on careslink_v1_generation.communication_note_preview_authorizations
  for select to careslink_v1_preview_authorization_executor using (true);
create policy communication_note_preview_authorizations_registration_insert
  on careslink_v1_generation.communication_note_preview_authorizations
  for insert to careslink_v1_preview_authorization_executor
  with check (shadow_only is true);
create policy communication_note_preview_authorizations_registration_lock
  on careslink_v1_generation.communication_note_preview_authorizations
  for update to careslink_v1_preview_authorization_executor
  using (true) with check (false);
create policy communication_note_preview_authorizations_dispatch_select
  on careslink_v1_generation.communication_note_preview_authorizations
  for select to careslink_v1_preview_dispatch_executor using (true);
create policy communication_note_preview_authorizations_dispatch_lock
  on careslink_v1_generation.communication_note_preview_authorizations
  for update to careslink_v1_preview_dispatch_executor
  using (true) with check (false);
create policy communication_note_preview_authorizations_receipt_select
  on careslink_v1_generation.communication_note_preview_authorizations
  for select to careslink_v1_preview_receipt_executor using (true);
create policy communication_note_preview_authorizations_receipt_lock
  on careslink_v1_generation.communication_note_preview_authorizations
  for update to careslink_v1_preview_receipt_executor
  using (true) with check (false);

create policy communication_note_preview_revocations_registration_select
  on careslink_v1_generation.communication_note_preview_authorization_revocations
  for select to careslink_v1_preview_authorization_executor using (true);
create policy communication_note_preview_revocations_registration_insert
  on careslink_v1_generation.communication_note_preview_authorization_revocations
  for insert to careslink_v1_preview_authorization_executor
  with check (shadow_only is true);
create policy communication_note_preview_revocations_dispatch_select
  on careslink_v1_generation.communication_note_preview_authorization_revocations
  for select to careslink_v1_preview_dispatch_executor using (true);
create policy communication_note_preview_revocations_receipt_select
  on careslink_v1_generation.communication_note_preview_authorization_revocations
  for select to careslink_v1_preview_receipt_executor using (true);

create policy communication_note_preview_claims_registration_select
  on careslink_v1_generation.communication_note_preview_claims
  for select to careslink_v1_preview_authorization_executor using (true);
create policy communication_note_preview_claims_dispatch_select
  on careslink_v1_generation.communication_note_preview_claims
  for select to careslink_v1_preview_dispatch_executor using (true);
create policy communication_note_preview_claims_dispatch_insert
  on careslink_v1_generation.communication_note_preview_claims
  for insert to careslink_v1_preview_dispatch_executor
  with check (shadow_only is true);
create policy communication_note_preview_claims_dispatch_lock
  on careslink_v1_generation.communication_note_preview_claims
  for update to careslink_v1_preview_dispatch_executor
  using (true) with check (false);
create policy communication_note_preview_claims_receipt_select
  on careslink_v1_generation.communication_note_preview_claims
  for select to careslink_v1_preview_receipt_executor using (true);
create policy communication_note_preview_claims_receipt_lock
  on careslink_v1_generation.communication_note_preview_claims
  for update to careslink_v1_preview_receipt_executor
  using (true) with check (false);

create policy communication_note_preview_reservations_dispatch_select
  on careslink_v1_generation.communication_note_preview_dispatch_reservations
  for select to careslink_v1_preview_dispatch_executor using (true);
create policy communication_note_preview_reservations_dispatch_insert
  on careslink_v1_generation.communication_note_preview_dispatch_reservations
  for insert to careslink_v1_preview_dispatch_executor
  with check (shadow_only is true);
create policy communication_note_preview_reservations_receipt_select
  on careslink_v1_generation.communication_note_preview_dispatch_reservations
  for select to careslink_v1_preview_receipt_executor using (true);
create policy communication_note_preview_reservations_receipt_lock
  on careslink_v1_generation.communication_note_preview_dispatch_reservations
  for update to careslink_v1_preview_receipt_executor
  using (true) with check (false);

create policy communication_note_preview_receipts_dispatch_select
  on careslink_v1_generation.communication_note_preview_dispatch_receipts
  for select to careslink_v1_preview_dispatch_executor using (true);
create policy communication_note_preview_receipts_receipt_select
  on careslink_v1_generation.communication_note_preview_dispatch_receipts
  for select to careslink_v1_preview_receipt_executor using (true);
create policy communication_note_preview_receipts_receipt_insert
  on careslink_v1_generation.communication_note_preview_dispatch_receipts
  for insert to careslink_v1_preview_receipt_executor
  with check (shadow_only is true);

revoke all on table
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_authorization_revocations,
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations,
  careslink_v1_generation.communication_note_preview_dispatch_receipts
  from public, anon, authenticated, service_role,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

grant usage on schema careslink_v1_generation
  to careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

grant usage on type
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_authorization_revocations,
  careslink_v1_generation.communication_note_preview_claims
  to careslink_v1_preview_authorization_executor;
grant usage on type
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations,
  careslink_v1_generation.communication_note_preview_dispatch_receipts
  to careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

grant select on
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_authorization_revocations,
  careslink_v1_generation.communication_note_preview_claims
  to careslink_v1_preview_authorization_executor;
grant insert on
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_authorization_revocations
  to careslink_v1_preview_authorization_executor;
grant update (authorization_digest)
  on careslink_v1_generation.communication_note_preview_authorizations
  to careslink_v1_preview_authorization_executor;
grant update (authorization_digest)
  on careslink_v1_generation.communication_note_preview_authorizations
  to careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

grant select on
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_authorization_revocations,
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations,
  careslink_v1_generation.communication_note_preview_dispatch_receipts
  to careslink_v1_preview_dispatch_executor;
grant insert on
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations
  to careslink_v1_preview_dispatch_executor;
grant update (claim_id)
  on careslink_v1_generation.communication_note_preview_claims
  to careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

grant select on
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_authorization_revocations,
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations,
  careslink_v1_generation.communication_note_preview_dispatch_receipts
  to careslink_v1_preview_receipt_executor;
grant insert on
  careslink_v1_generation.communication_note_preview_dispatch_receipts
  to careslink_v1_preview_receipt_executor;
grant update (reservation_id)
  on careslink_v1_generation.communication_note_preview_dispatch_reservations
  to careslink_v1_preview_receipt_executor;

-- CREATE exists only while each NOLOGIN identity installs its exact definer
-- functions. It is revoked before the migration finishes.
grant create on schema careslink_v1_generation
  to careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

-- Canonical JSON and cryptographic primitives are callable only by the three
-- internal definer identities; no API role receives them through this change.
-- These public/extension objects are owned by the migration entry actor rather
-- than the private schema owner, so restore that actor before granting them.
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

grant usage on schema public, extensions
  to careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
grant execute on function public.v1_shadow_canonical_json(jsonb)
  to careslink_v1_preview_authorization_executor,
    careslink_v1_preview_receipt_executor;
grant execute on function public.v1_shadow_content_sha256(jsonb)
  to careslink_v1_preview_authorization_executor,
    careslink_v1_preview_receipt_executor;
grant execute on function extensions.digest(bytea, text)
  to careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
grant execute on function extensions.gen_random_bytes(integer)
  to careslink_v1_preview_dispatch_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Fixed statement helpers and externally-verified authorization ingress
-- ---------------------------------------------------------------------------

set role careslink_v1_preview_authorization_executor;

create function careslink_v1_generation._communication_note_preview_sha256_text(
  p_value text
)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_value, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

create function careslink_v1_generation._communication_note_preview_expected_source_bindings()
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'requestBodyPinBundleDigest',
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8',
    'runnerPolicyDigest',
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4',
    'evaluationPlanDigest',
      'b89b03ba248bb4c615470a82c7c4ca6220cc009839f9d9c7dd6aaf772fee9dcd',
    'requestTemplateDigest',
      '5809bb94ebb96586f5ddb0e48782fa9d961e446a1a5694ac0e18d483f024979d',
    'manifestDigest',
      'aab4e65bec64ea2c3dc7da91f3544e91aee3163dc7cab9187765c1eff9581be9',
    'goldenFixtureSetDigest',
      '432cfda8c51e76ec517a4c4d39769c3c3a67d7a273ebe3b1662d3e4826449e17',
    'workerPolicyDigest',
      '5b91823e2d9e842f2e64e12f9a79610291f9219cd220ec5ac7bea3cd686200f2',
    'providerId', 'openai.responses',
    'modelId', 'gpt-5.4-mini-2026-03-17',
    'endpointProfile', 'OPENAI_AU_STORAGE_RESPONSES_V1',
    'endpointUrlSha256',
      '050d015644561df01677bcc29a93369a4bd6cc7bfb6b40a6957e5bb3a819101c'
  )
$$;

create function careslink_v1_generation._communication_note_preview_expected_budget()
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'currency', 'USD',
    'maximumCalls', 6,
    'maximumAttemptsPerSlot', 1,
    'automaticRetry', false,
    'fallbackModel', null,
    'maximumInputTokensPerCall', 10000,
    'maximumOutputTokensPerCall', 2400,
    'maximumProjectedCostMicroUsdPerCall', 20130,
    'projectedCostMicroUsd', 120780,
    'maximumCostMicroUsd', 250000,
    'pricingVersion', 'openai.gpt-5.4-mini.au.2026-08-27.v1',
    'costNature', 'CALCULATED_UPPER_BOUND_NOT_INVOICE'
  )
$$;

create function careslink_v1_generation._communication_note_preview_expected_slots()
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'slotIndex', 0,
      'fixtureId', 'communication.en.phone-duration.v1',
      'runOrdinal', 1,
      'requestBodySha256',
        '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
      'requestBodyUtf8ByteLength', 2522,
      'semanticCanonicalRequestSha256',
        'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68'
    ),
    pg_catalog.jsonb_build_object(
      'slotIndex', 1,
      'fixtureId', 'communication.en.phone-duration.v1',
      'runOrdinal', 2,
      'requestBodySha256',
        '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
      'requestBodyUtf8ByteLength', 2522,
      'semanticCanonicalRequestSha256',
        'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68'
    ),
    pg_catalog.jsonb_build_object(
      'slotIndex', 2,
      'fixtureId', 'communication.zh-hans.mixed-video.v1',
      'runOrdinal', 1,
      'requestBodySha256',
        '3692fa0e0fd7461829204ddb2767e3cb620aacf0a2c8db20baabd9d62d10d3d6',
      'requestBodyUtf8ByteLength', 2589,
      'semanticCanonicalRequestSha256',
        'c83dd32f3aa58625b9cba576c0347e91f8e7ffa57d0c048e28b555ceb1be89b9'
    ),
    pg_catalog.jsonb_build_object(
      'slotIndex', 3,
      'fixtureId', 'communication.zh-hans.mixed-video.v1',
      'runOrdinal', 2,
      'requestBodySha256',
        '3692fa0e0fd7461829204ddb2767e3cb620aacf0a2c8db20baabd9d62d10d3d6',
      'requestBodyUtf8ByteLength', 2589,
      'semanticCanonicalRequestSha256',
        'c83dd32f3aa58625b9cba576c0347e91f8e7ffa57d0c048e28b555ceb1be89b9'
    ),
    pg_catalog.jsonb_build_object(
      'slotIndex', 4,
      'fixtureId', 'communication.zh-hant.in-person.v1',
      'runOrdinal', 1,
      'requestBodySha256',
        '0ac00c5037388bd1d8d6d96a28a2d909369d6d75a7d93795d6e86e339da96fc1',
      'requestBodyUtf8ByteLength', 2657,
      'semanticCanonicalRequestSha256',
        '5ba1250f04d1eb3ab938ad25270a1444dfe6fa5b706eccab47723687e9cddf76'
    ),
    pg_catalog.jsonb_build_object(
      'slotIndex', 5,
      'fixtureId', 'communication.zh-hant.in-person.v1',
      'runOrdinal', 2,
      'requestBodySha256',
        '0ac00c5037388bd1d8d6d96a28a2d909369d6d75a7d93795d6e86e339da96fc1',
      'requestBodyUtf8ByteLength', 2657,
      'semanticCanonicalRequestSha256',
        '5ba1250f04d1eb3ab938ad25270a1444dfe6fa5b706eccab47723687e9cddf76'
    )
  )
$$;

create function careslink_v1_generation._communication_note_preview_authorization_statement_is_valid(
  p_statement jsonb
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_evidence jsonb;
begin
  if pg_catalog.jsonb_typeof(p_statement) is distinct from 'object' then
    return false;
  end if;

  if (select count(*) from pg_catalog.jsonb_object_keys(p_statement)) <> 17
    or not coalesce(p_statement ?& array[
      'domain', 'version', 'authorizationId', 'authorizationNonceHash',
      'ownerSubjectHmac', 'tenantScopeHmac', 'runIdHash', 'signerKeyIdHash',
      'signerPublicKeySha256', 'issuedAt', 'notBefore', 'expiresAt',
      'sourceBindings', 'environmentEvidence', 'budget', 'input', 'slots'
    ]::text[], false)
    or exists (
      select 1
      from pg_catalog.unnest(array[
        'domain', 'version', 'authorizationId', 'authorizationNonceHash',
        'ownerSubjectHmac', 'tenantScopeHmac', 'runIdHash', 'signerKeyIdHash',
        'signerPublicKeySha256', 'issuedAt', 'notBefore', 'expiresAt'
      ]::text[]) as required_string(key)
      where pg_catalog.jsonb_typeof(p_statement->required_string.key)
        is distinct from 'string'
    )
    or p_statement->>'domain' is distinct from
      'careslink.communication-note.preview-authorization'
    or p_statement->>'version' is distinct from
      'authorization.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1'
    or not coalesce(p_statement->>'authorizationId' ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      , false)
    or not coalesce(p_statement->>'authorizationNonceHash' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'ownerSubjectHmac' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'tenantScopeHmac' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'runIdHash' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'signerKeyIdHash' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'signerPublicKeySha256' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'issuedAt' ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
      , false)
    or not coalesce(p_statement->>'notBefore' ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
      , false)
    or not coalesce(p_statement->>'expiresAt' ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
      , false)
    or p_statement->'sourceBindings' is distinct from
      careslink_v1_generation._communication_note_preview_expected_source_bindings()
    or p_statement->'budget' is distinct from
      careslink_v1_generation._communication_note_preview_expected_budget()
    or p_statement->'input' is distinct from pg_catalog.jsonb_build_object(
      'classification', 'SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY',
      'realCareDataAllowed', false
    )
    or p_statement->'slots' is distinct from
      careslink_v1_generation._communication_note_preview_expected_slots()
  then
    return false;
  end if;

  v_evidence := p_statement->'environmentEvidence';
  if pg_catalog.jsonb_typeof(v_evidence) is distinct from 'object' then
    return false;
  end if;

  if (select count(*) from pg_catalog.jsonb_object_keys(v_evidence)) <> 8
    or not coalesce(v_evidence ?& array[
      'openAiProjectIdHmac',
      'australiaProjectConfigurationSha256',
      'zeroDataRetentionConfigurationSha256',
      'modifiedRetentionAmendmentSha256',
      'ownerProcessingAcknowledgementSha256',
      'pricingAndModelAvailabilitySha256',
      'providerSpendLimitSha256',
      'temporaryCredentialReferenceSha256'
    ]::text[], false)
    or exists (
      select 1
      from pg_catalog.jsonb_each(v_evidence) as evidence(key, value)
      where pg_catalog.jsonb_typeof(evidence.value) is distinct from 'string'
        or not coalesce(evidence.value #>> '{}' ~ '^[a-f0-9]{64}$', false)
    )
  then
    return false;
  end if;

  return true;
end;
$$;

create function careslink_v1_generation.persist_verified_communication_note_preview_authorization(
  p_statement jsonb,
  p_signature_base64url text,
  p_verifier_identity_hmac text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_authorization_digest text;
  v_signature_sha256 text;
  v_issued_at timestamptz;
  v_not_before timestamptz;
  v_expires_at timestamptz;
  v_now timestamptz;
  v_created boolean := false;
  v_existing careslink_v1_generation.communication_note_preview_authorizations%rowtype;
begin
  if pg_catalog.current_setting('transaction_isolation') is distinct from
    'read committed'
  then
    raise exception using
      errcode = 'P0001', message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end if;

  if not coalesce(
    careslink_v1_generation._communication_note_preview_authorization_statement_is_valid(
      p_statement
    ),
    false
  )
    or not coalesce(p_signature_base64url ~ '^[A-Za-z0-9_-]{86}$', false)
    or not coalesce(p_verifier_identity_hmac ~ '^[a-f0-9]{64}$', false)
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  v_authorization_digest := public.v1_shadow_content_sha256(p_statement);
  v_signature_sha256 :=
    careslink_v1_generation._communication_note_preview_sha256_text(
      p_signature_base64url
    );
  v_issued_at := (p_statement->>'issuedAt')::timestamptz;
  v_not_before := (p_statement->>'notBefore')::timestamptz;
  v_expires_at := (p_statement->>'expiresAt')::timestamptz;
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());

  if v_not_before < v_issued_at
    or v_expires_at <= v_not_before
    or v_expires_at - v_issued_at > interval '15 minutes'
    or v_issued_at > v_now + interval '5 seconds'
    or v_not_before > v_now + interval '5 seconds'
    or v_expires_at <= v_now
  then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_TIME_INVALID';
  end if;

  insert into careslink_v1_generation.communication_note_preview_authorizations (
    authorization_digest,
    authorization_id,
    authorization_nonce_hash,
    owner_subject_hmac,
    tenant_scope_hmac,
    run_id_hash,
    signer_key_id_hash,
    signer_public_key_sha256,
    openai_project_id_hmac,
    statement,
    signature_base64url,
    signature_sha256,
    authenticity,
    verifier_method,
    verifier_identity_hmac,
    authority_policy_digest,
    request_body_pin_bundle_digest,
    runner_policy_digest,
    issued_at,
    not_before,
    expires_at,
    verified_at,
    registered_at,
    shadow_only
  ) values (
    v_authorization_digest,
    (p_statement->>'authorizationId')::uuid,
    p_statement->>'authorizationNonceHash',
    p_statement->>'ownerSubjectHmac',
    p_statement->>'tenantScopeHmac',
    p_statement->>'runIdHash',
    p_statement->>'signerKeyIdHash',
    p_statement->>'signerPublicKeySha256',
    p_statement->'environmentEvidence'->>'openAiProjectIdHmac',
    p_statement,
    p_signature_base64url,
    v_signature_sha256,
    'EXTERNAL_OWNER_ED25519_VERIFIED',
    'APPLICATION_ED25519_TRUST_REGISTRY',
    p_verifier_identity_hmac,
    '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
    '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8',
    'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4',
    v_issued_at,
    v_not_before,
    v_expires_at,
    v_now,
    v_now,
    true
  )
  on conflict (authorization_digest) do nothing
  returning true into v_created;

  if not coalesce(v_created, false) then
    select preview_authorization.*
    into v_existing
    from careslink_v1_generation.communication_note_preview_authorizations
      as preview_authorization
    where preview_authorization.authorization_digest = v_authorization_digest;

    if not found
      or v_existing.statement is distinct from p_statement
      or v_existing.signature_base64url is distinct from p_signature_base64url
      or v_existing.signature_sha256 is distinct from v_signature_sha256
      or v_existing.verifier_identity_hmac is distinct from p_verifier_identity_hmac
    then
      raise exception using
        errcode = 'P0001', message = 'AUTHORIZATION_CONFLICT';
    end if;

    return pg_catalog.jsonb_build_object(
      'created', false,
      'authorizationRegistered', true,
      'authorizationDigest', v_authorization_digest,
      'executionAuthorized', false
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'created', true,
    'authorizationRegistered', true,
    'authorizationDigest', v_authorization_digest,
    'executionAuthorized', false
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_CONFLICT';
  when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
end;
$$;

create function careslink_v1_generation.revoke_communication_note_preview_authorization(
  p_authorization_digest text,
  p_revocation_id uuid,
  p_reason_code text,
  p_evidence_sha256 text,
  p_verifier_identity_hmac text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_authorization careslink_v1_generation.communication_note_preview_authorizations%rowtype;
  v_existing careslink_v1_generation.communication_note_preview_authorization_revocations%rowtype;
  v_now timestamptz;
begin
  if pg_catalog.current_setting('transaction_isolation') is distinct from
    'read committed'
  then
    raise exception using
      errcode = 'P0001', message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end if;

  if not coalesce(p_authorization_digest ~ '^[a-f0-9]{64}$', false)
    or p_revocation_id is null
    or not coalesce(
      p_revocation_id::text ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      false
    )
    or p_reason_code is null
    or p_reason_code not in (
      'OWNER_REVOKED',
      'SIGNING_KEY_REVOKED',
      'POLICY_REVOKED',
      'SECURITY_HOLD'
    )
    or not coalesce(p_evidence_sha256 ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_verifier_identity_hmac ~ '^[a-f0-9]{64}$', false)
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  -- This parent lock serializes revocation against the single-use claim.
  select preview_authorization.*
  into v_authorization
  from careslink_v1_generation.communication_note_preview_authorizations
    as preview_authorization
  where preview_authorization.authorization_digest = p_authorization_digest
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_FOUND';
  end if;

  select revocation.*
  into v_existing
  from careslink_v1_generation.communication_note_preview_authorization_revocations
    as revocation
  where revocation.authorization_digest = p_authorization_digest;

  if found then
    if v_existing.revocation_id = p_revocation_id
      and v_existing.reason_code = p_reason_code
      and v_existing.evidence_sha256 = p_evidence_sha256
      and v_existing.verifier_identity_hmac = p_verifier_identity_hmac
    then
      return pg_catalog.jsonb_build_object(
        'created', false,
        'revoked', true,
        'executionAuthorized', false
      );
    end if;
    raise exception using errcode = 'P0001', message = 'REVOCATION_CONFLICT';
  end if;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());

  insert into careslink_v1_generation.communication_note_preview_authorization_revocations (
    revocation_id,
    authorization_digest,
    reason_code,
    evidence_sha256,
    verifier_identity_hmac,
    revoked_at,
    registered_at,
    shadow_only
  ) values (
    p_revocation_id,
    p_authorization_digest,
    p_reason_code,
    p_evidence_sha256,
    p_verifier_identity_hmac,
    v_now,
    v_now,
    true
  );

  return pg_catalog.jsonb_build_object(
    'created', true,
    'revoked', true,
    'executionAuthorized', false
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'REVOCATION_CONFLICT';
end;
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Atomic one-use claim and ordered pre-transport dispatch reservation
-- ---------------------------------------------------------------------------

set role careslink_v1_preview_authorization_executor;

grant execute on function
  careslink_v1_generation._communication_note_preview_sha256_text(text),
  careslink_v1_generation._communication_note_preview_expected_slots()
  to careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_dispatch_executor;

create function careslink_v1_generation.claim_communication_note_preview_authorization(
  p_authorization_digest text,
  p_claim_id uuid,
  p_run_id_hash text,
  p_executor_identity_hmac text,
  p_authority_policy_digest text,
  p_request_body_pin_bundle_digest text,
  p_runner_policy_digest text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_authorization careslink_v1_generation.communication_note_preview_authorizations%rowtype;
  v_existing careslink_v1_generation.communication_note_preview_claims%rowtype;
  v_now timestamptz;
  v_claim_token text;
  v_claim_token_sha256 text;
begin
  if pg_catalog.current_setting('transaction_isolation') is distinct from
    'read committed'
  then
    raise exception using
      errcode = 'P0001', message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end if;

  if not coalesce(p_authorization_digest ~ '^[a-f0-9]{64}$', false)
    or p_claim_id is null
    or not coalesce(
      p_claim_id::text ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      false
    )
    or not coalesce(p_run_id_hash ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_executor_identity_hmac ~ '^[a-f0-9]{64}$', false)
    or p_authority_policy_digest is distinct from
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9'
    or p_request_body_pin_bundle_digest is distinct from
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8'
    or p_runner_policy_digest is distinct from
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  -- The authorization row is the linearization point for claim vs revoke and
  -- concurrent claim attempts. Every post-wait read is a separate statement.
  select preview_authorization.*
  into v_authorization
  from careslink_v1_generation.communication_note_preview_authorizations
    as preview_authorization
  where preview_authorization.authorization_digest = p_authorization_digest
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_FOUND';
  end if;

  select claim.*
  into v_existing
  from careslink_v1_generation.communication_note_preview_claims as claim
  where claim.authorization_digest = p_authorization_digest;

  if found then
    if v_existing.claim_id = p_claim_id
      and v_existing.run_id_hash = p_run_id_hash
      and v_existing.executor_identity_hmac = p_executor_identity_hmac
      and v_existing.authority_policy_digest = p_authority_policy_digest
      and v_existing.request_body_pin_bundle_digest =
        p_request_body_pin_bundle_digest
      and v_existing.runner_policy_digest = p_runner_policy_digest
    then
      return pg_catalog.jsonb_build_object(
        'created', false,
        'executionAuthorized', false,
        'claimId', v_existing.claim_id,
        'claimToken', null,
        'status', 'ALREADY_CLAIMED'
      );
    end if;
    raise exception using
      errcode = 'P0001', message = 'AUTHORIZATION_ALREADY_CLAIMED';
  end if;

  if exists (
    select 1
    from careslink_v1_generation.communication_note_preview_authorization_revocations
      as revocation
    where revocation.authorization_digest = p_authorization_digest
  ) then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_REVOKED';
  end if;

  -- Use wall-clock time only after the potentially blocking parent-row lock.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());

  if v_authorization.run_id_hash is distinct from p_run_id_hash
    or v_authorization.authority_policy_digest is distinct from
      p_authority_policy_digest
    or v_authorization.request_body_pin_bundle_digest is distinct from
      p_request_body_pin_bundle_digest
    or v_authorization.runner_policy_digest is distinct from
      p_runner_policy_digest
  then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_BINDING_MISMATCH';
  end if;
  if v_authorization.not_before > v_now
    or v_authorization.expires_at <= v_now
    or v_authorization.expires_at - v_now < interval '5 minutes'
  then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_CLAIMABLE';
  end if;

  v_claim_token := pg_catalog.encode(
    extensions.gen_random_bytes(32),
    'hex'
  );
  v_claim_token_sha256 :=
    careslink_v1_generation._communication_note_preview_sha256_text(
      v_claim_token
    );

  insert into careslink_v1_generation.communication_note_preview_claims (
    claim_id,
    authorization_digest,
    run_id_hash,
    claim_token_sha256,
    executor_identity_hmac,
    authority_policy_digest,
    request_body_pin_bundle_digest,
    runner_policy_digest,
    claimed_at,
    shadow_only
  ) values (
    p_claim_id,
    p_authorization_digest,
    p_run_id_hash,
    v_claim_token_sha256,
    p_executor_identity_hmac,
    p_authority_policy_digest,
    p_request_body_pin_bundle_digest,
    p_runner_policy_digest,
    v_now,
    true
  );

  return pg_catalog.jsonb_build_object(
    'created', true,
    'executionAuthorized', true,
    'claimId', p_claim_id,
    'claimToken', v_claim_token,
    'status', 'CLAIMED'
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'CLAIM_CONFLICT';
end;
$$;

create function careslink_v1_generation.reserve_communication_note_preview_dispatch(
  p_claim_id uuid,
  p_claim_token text,
  p_reservation_id uuid,
  p_slot_index integer,
  p_fixture_id text,
  p_run_ordinal integer,
  p_request_body_sha256 text,
  p_request_body_utf8_byte_length integer,
  p_semantic_canonical_request_sha256 text,
  p_client_request_id_hmac text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_authorization_digest text;
  v_authorization careslink_v1_generation.communication_note_preview_authorizations%rowtype;
  v_claim careslink_v1_generation.communication_note_preview_claims%rowtype;
  v_existing careslink_v1_generation.communication_note_preview_dispatch_reservations%rowtype;
  v_prior_outcome text;
  v_expected_slot jsonb;
  v_now timestamptz;
begin
  if pg_catalog.current_setting('transaction_isolation') is distinct from
    'read committed'
  then
    raise exception using
      errcode = 'P0001', message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end if;

  if p_claim_id is null
    or not coalesce(
      p_claim_id::text ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      false
    )
    or not coalesce(p_claim_token ~ '^[a-f0-9]{64}$', false)
    or p_reservation_id is null
    or not coalesce(
      p_reservation_id::text ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      false
    )
    or p_slot_index is null
    or p_slot_index not between 0 and 5
    or p_run_ordinal is null
    or p_run_ordinal not between 1 and 2
    or not coalesce(p_request_body_sha256 ~ '^[a-f0-9]{64}$', false)
    or p_request_body_utf8_byte_length is null
    or p_request_body_utf8_byte_length <= 0
    or not coalesce(
      p_semantic_canonical_request_sha256 ~ '^[a-f0-9]{64}$',
      false
    )
    or not coalesce(p_client_request_id_hmac ~ '^[a-f0-9]{64}$', false)
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  -- Resolve the immutable parent identity, then take locks in one global order:
  -- authorization -> claim. The claim lock serializes all slot reservations.
  select claim.authorization_digest
  into v_authorization_digest
  from careslink_v1_generation.communication_note_preview_claims as claim
  where claim.claim_id = p_claim_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'CLAIM_NOT_FOUND';
  end if;

  select preview_authorization.*
  into v_authorization
  from careslink_v1_generation.communication_note_preview_authorizations
    as preview_authorization
  where preview_authorization.authorization_digest = v_authorization_digest
  for update;

  select claim.*
  into v_claim
  from careslink_v1_generation.communication_note_preview_claims as claim
  where claim.claim_id = p_claim_id
  for update;

  if not found
    or v_claim.authorization_digest is distinct from v_authorization_digest
    or v_claim.claim_token_sha256 is distinct from
      careslink_v1_generation._communication_note_preview_sha256_text(
        p_claim_token
      )
  then
    raise exception using errcode = 'P0001', message = 'CLAIM_AUTHORITY_INVALID';
  end if;

  select reservation.*
  into v_existing
  from careslink_v1_generation.communication_note_preview_dispatch_reservations
    as reservation
  where reservation.claim_id = p_claim_id
    and reservation.slot_index = p_slot_index;

  if found then
    if v_existing.reservation_id = p_reservation_id
      and v_existing.fixture_id = p_fixture_id
      and v_existing.run_ordinal = p_run_ordinal
      and v_existing.request_body_sha256 = p_request_body_sha256
      and v_existing.request_body_utf8_byte_length =
        p_request_body_utf8_byte_length
      and v_existing.semantic_canonical_request_sha256 =
        p_semantic_canonical_request_sha256
      and v_existing.client_request_id_hmac = p_client_request_id_hmac
    then
      return pg_catalog.jsonb_build_object(
        'created', false,
        'dispatchAuthorized', false,
        'reservationId', v_existing.reservation_id,
        'status', 'ALREADY_RESERVED'
      );
    end if;
    raise exception using errcode = 'P0001', message = 'SLOT_ALREADY_RESERVED';
  end if;

  -- A non-COMPLETED terminal receipt permanently ends the run. An outstanding
  -- prior reservation also blocks progress; neither condition authorizes retry.
  if p_slot_index > 0 then
    select receipt.outcome
    into v_prior_outcome
    from careslink_v1_generation.communication_note_preview_dispatch_reservations
      as prior_reservation
    left join careslink_v1_generation.communication_note_preview_dispatch_receipts
      as receipt on receipt.reservation_id = prior_reservation.reservation_id
    where prior_reservation.claim_id = p_claim_id
      and prior_reservation.slot_index = p_slot_index - 1;

    if not found then
      raise exception using errcode = 'P0001', message = 'SLOT_OUT_OF_ORDER';
    end if;
    if v_prior_outcome is null then
      raise exception using errcode = 'P0001', message = 'PRIOR_SLOT_NOT_TERMINAL';
    end if;
    if v_prior_outcome <> 'COMPLETED' then
      raise exception using errcode = 'P0001', message = 'RUN_PERMANENTLY_CONSUMED';
    end if;
  end if;

  if exists (
    select 1
    from careslink_v1_generation.communication_note_preview_dispatch_reservations
      as prior_reservation
    join careslink_v1_generation.communication_note_preview_dispatch_receipts
      as prior_receipt on prior_receipt.reservation_id =
        prior_reservation.reservation_id
    where prior_reservation.claim_id = p_claim_id
      and prior_receipt.outcome <> 'COMPLETED'
  ) then
    raise exception using errcode = 'P0001', message = 'RUN_PERMANENTLY_CONSUMED';
  end if;

  if exists (
    select 1
    from careslink_v1_generation.communication_note_preview_authorization_revocations
      as revocation
    where revocation.authorization_digest = v_authorization_digest
  ) then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_REVOKED';
  end if;

  -- Recheck hard expiry using a fresh wall clock after all blocking locks.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if v_authorization.expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_EXPIRED';
  end if;

  v_expected_slot :=
    careslink_v1_generation._communication_note_preview_expected_slots()
      -> p_slot_index;
  if v_expected_slot->>'fixtureId' is distinct from p_fixture_id
    or (v_expected_slot->>'runOrdinal')::integer is distinct from p_run_ordinal
    or v_expected_slot->>'requestBodySha256' is distinct from
      p_request_body_sha256
    or (v_expected_slot->>'requestBodyUtf8ByteLength')::integer is distinct from
      p_request_body_utf8_byte_length
    or v_expected_slot->>'semanticCanonicalRequestSha256' is distinct from
      p_semantic_canonical_request_sha256
  then
    raise exception using errcode = 'P0001', message = 'SLOT_BINDING_MISMATCH';
  end if;

  insert into careslink_v1_generation.communication_note_preview_dispatch_reservations (
    reservation_id,
    claim_id,
    authorization_digest,
    run_id_hash,
    slot_index,
    fixture_id,
    run_ordinal,
    attempt_ordinal,
    request_body_sha256,
    request_body_utf8_byte_length,
    semantic_canonical_request_sha256,
    client_request_id_hmac,
    reserved_at,
    shadow_only
  ) values (
    p_reservation_id,
    p_claim_id,
    v_authorization_digest,
    v_claim.run_id_hash,
    p_slot_index,
    p_fixture_id,
    p_run_ordinal,
    1,
    p_request_body_sha256,
    p_request_body_utf8_byte_length,
    p_semantic_canonical_request_sha256,
    p_client_request_id_hmac,
    v_now,
    true
  );

  return pg_catalog.jsonb_build_object(
    'created', true,
    'dispatchAuthorized', true,
    'reservationId', p_reservation_id,
    'slotIndex', p_slot_index,
    'status', 'RESERVED_BEFORE_TRANSPORT'
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'RESERVATION_CONFLICT';
end;
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Externally verified CaresLink dispatch-observation receipt ingress
-- ---------------------------------------------------------------------------

set role careslink_v1_preview_receipt_executor;

create function careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
  p_statement jsonb,
  p_signature_base64url text,
  p_verifier_identity_hmac text,
  p_claim_token text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_authorization_digest text;
  v_claim_id uuid;
  v_reservation_id uuid;
  v_authorization careslink_v1_generation.communication_note_preview_authorizations%rowtype;
  v_claim careslink_v1_generation.communication_note_preview_claims%rowtype;
  v_reservation careslink_v1_generation.communication_note_preview_dispatch_reservations%rowtype;
  v_existing careslink_v1_generation.communication_note_preview_dispatch_receipts%rowtype;
  v_transport jsonb;
  v_usage jsonb;
  v_outcome text;
  v_http_status integer;
  v_cost integer;
  v_observed_at timestamptz;
  v_now timestamptz;
  v_receipt_digest text;
  v_signature_sha256 text;
  v_openai_request_id_hmac text;
  v_openai_response_id_hmac text;
begin
  if pg_catalog.current_setting('transaction_isolation') is distinct from
    'read committed'
  then
    raise exception using
      errcode = 'P0001', message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end if;

  if pg_catalog.jsonb_typeof(p_statement) is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if (select count(*) from pg_catalog.jsonb_object_keys(p_statement)) <> 25
    or not coalesce(p_statement ?& array[
      'domain', 'version', 'authorizationDigest', 'claimId', 'runIdHash',
      'reservationId', 'slotIndex', 'fixtureId', 'runOrdinal',
      'requestBodySha256', 'requestBodyUtf8ByteLength',
      'semanticCanonicalRequestSha256', 'clientRequestIdHmac', 'outcome',
      'transport', 'usage', 'calculatedCostUpperBoundMicroUsd', 'observedAt',
      'noRetry', 'authenticity', 'providerAttestation', 'transportScope',
      'notProofOf', 'signerKeyIdHash', 'signerPublicKeySha256'
    ]::text[], false)
    or exists (
      select 1
      from pg_catalog.unnest(array[
        'domain', 'version', 'authorizationDigest', 'claimId', 'runIdHash',
        'reservationId', 'fixtureId', 'requestBodySha256',
        'semanticCanonicalRequestSha256', 'clientRequestIdHmac', 'outcome',
        'observedAt', 'authenticity', 'providerAttestation', 'transportScope',
        'signerKeyIdHash', 'signerPublicKeySha256'
      ]::text[]) as required_string(key)
      where pg_catalog.jsonb_typeof(p_statement->required_string.key)
        is distinct from 'string'
    )
    or pg_catalog.jsonb_typeof(p_statement->'slotIndex')
      is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_statement->'runOrdinal')
      is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_statement->'requestBodyUtf8ByteLength')
      is distinct from 'number'
    or pg_catalog.jsonb_typeof(
      p_statement->'calculatedCostUpperBoundMicroUsd'
    ) not in ('number', 'null')
    or p_statement->>'domain' is distinct from
      'careslink.communication-note.preview-dispatch-receipt'
    or p_statement->>'version' is distinct from
      'receipt.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1'
    or not coalesce(p_statement->>'authorizationDigest' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'claimId' ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      , false)
    or not coalesce(p_statement->>'runIdHash' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'reservationId' ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      , false)
    or not coalesce(p_statement->>'requestBodySha256' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(
      p_statement->>'semanticCanonicalRequestSha256' ~ '^[a-f0-9]{64}$',
      false
    )
    or not coalesce(p_statement->>'clientRequestIdHmac' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'signerKeyIdHash' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'signerPublicKeySha256' ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_statement->>'observedAt' ~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
      , false)
    or p_statement->'noRetry' is distinct from 'true'::jsonb
    or p_statement->>'authenticity' is distinct from
      'CARESLINK_SIGNED_INTERNAL_OBSERVATION'
    or p_statement->>'providerAttestation' is distinct from 'ABSENT'
    or p_statement->>'transportScope' is distinct from
      'APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION'
    or p_statement->'notProofOf' is distinct from pg_catalog.jsonb_build_array(
      'EXACT_PROVIDER_RECEIPT',
      'BILLING',
      'MODEL_EXECUTION',
      'EXACTLY_ONCE'
    )
    or not coalesce(p_signature_base64url ~ '^[A-Za-z0-9_-]{86}$', false)
    or not coalesce(p_verifier_identity_hmac ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_claim_token ~ '^[a-f0-9]{64}$', false)
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if not coalesce(p_statement->>'slotIndex' ~ '^[0-5]$', false)
    or not coalesce(p_statement->>'runOrdinal' ~ '^[12]$', false)
    or not coalesce(
      p_statement->>'requestBodyUtf8ByteLength' ~ '^[1-9][0-9]*$',
      false
    )
    or (p_statement->>'requestBodyUtf8ByteLength')::numeric > 2147483647
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  v_authorization_digest := p_statement->>'authorizationDigest';
  v_claim_id := (p_statement->>'claimId')::uuid;
  v_reservation_id := (p_statement->>'reservationId')::uuid;

  -- Resolve immutable identities, then serialize receipt persistence using the
  -- same global lock order as reservation: authorization -> claim -> slot.
  select preview_authorization.*
  into v_authorization
  from careslink_v1_generation.communication_note_preview_authorizations
    as preview_authorization
  where preview_authorization.authorization_digest = v_authorization_digest
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_FOUND';
  end if;

  select claim.*
  into v_claim
  from careslink_v1_generation.communication_note_preview_claims as claim
  where claim.claim_id = v_claim_id
  for update;

  if not found
    or v_claim.authorization_digest is distinct from v_authorization_digest
    or v_claim.claim_token_sha256 is distinct from
      careslink_v1_generation._communication_note_preview_sha256_text(
        p_claim_token
      )
  then
    raise exception using errcode = 'P0001', message = 'CLAIM_AUTHORITY_INVALID';
  end if;

  select reservation.*
  into v_reservation
  from careslink_v1_generation.communication_note_preview_dispatch_reservations
    as reservation
  where reservation.reservation_id = v_reservation_id
  for update;

  if not found
    or v_reservation.claim_id is distinct from v_claim_id
    or v_reservation.authorization_digest is distinct from
      v_authorization_digest
    or v_reservation.run_id_hash is distinct from p_statement->>'runIdHash'
    or v_reservation.slot_index is distinct from
      (p_statement->>'slotIndex')::integer
    or v_reservation.fixture_id is distinct from p_statement->>'fixtureId'
    or v_reservation.run_ordinal is distinct from
      (p_statement->>'runOrdinal')::integer
    or v_reservation.request_body_sha256 is distinct from
      p_statement->>'requestBodySha256'
    or v_reservation.request_body_utf8_byte_length is distinct from
      (p_statement->>'requestBodyUtf8ByteLength')::integer
    or v_reservation.semantic_canonical_request_sha256 is distinct from
      p_statement->>'semanticCanonicalRequestSha256'
    or v_reservation.client_request_id_hmac is distinct from
      p_statement->>'clientRequestIdHmac'
  then
    raise exception using errcode = 'P0001', message = 'RECEIPT_BINDING_MISMATCH';
  end if;

  v_receipt_digest := public.v1_shadow_content_sha256(p_statement);
  v_signature_sha256 :=
    careslink_v1_generation._communication_note_preview_sha256_text(
      p_signature_base64url
    );

  select receipt.*
  into v_existing
  from careslink_v1_generation.communication_note_preview_dispatch_receipts
    as receipt
  where receipt.reservation_id = v_reservation_id;

  if found then
    if v_existing.receipt_digest = v_receipt_digest
      and v_existing.statement is not distinct from p_statement
      and v_existing.signature_base64url is not distinct from
        p_signature_base64url
      and v_existing.signature_sha256 = v_signature_sha256
      and v_existing.verifier_identity_hmac = p_verifier_identity_hmac
    then
      return pg_catalog.jsonb_build_object(
        'created', false,
        'receiptRecorded', true,
        'dispatchAuthorized', false,
        'receiptDigest', v_receipt_digest,
        'outcome', v_existing.outcome
      );
    end if;
    raise exception using errcode = 'P0001', message = 'RECEIPT_CONFLICT';
  end if;

  v_transport := p_statement->'transport';
  if pg_catalog.jsonb_typeof(v_transport) is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'RECEIPT_TRANSPORT_INVALID';
  end if;

  if (select count(*) from pg_catalog.jsonb_object_keys(v_transport)) <> 3
    or not coalesce(v_transport ?& array[
      'httpStatus', 'openAiRequestIdHmac', 'openAiResponseIdHmac'
    ]::text[], false)
    or pg_catalog.jsonb_typeof(v_transport->'httpStatus')
      not in ('number', 'null')
    or pg_catalog.jsonb_typeof(v_transport->'openAiRequestIdHmac')
      not in ('string', 'null')
    or pg_catalog.jsonb_typeof(v_transport->'openAiResponseIdHmac')
      not in ('string', 'null')
    or (
      pg_catalog.jsonb_typeof(v_transport->'httpStatus') = 'number'
      and not coalesce(v_transport->>'httpStatus' ~ '^[1-5][0-9]{2}$', false)
    )
    or (
      pg_catalog.jsonb_typeof(v_transport->'openAiRequestIdHmac') = 'string'
      and not coalesce(
        v_transport->>'openAiRequestIdHmac' ~ '^[a-f0-9]{64}$',
        false
      )
    )
    or (
      pg_catalog.jsonb_typeof(v_transport->'openAiResponseIdHmac') = 'string'
      and not coalesce(
        v_transport->>'openAiResponseIdHmac' ~ '^[a-f0-9]{64}$',
        false
      )
    )
  then
    raise exception using errcode = 'P0001', message = 'RECEIPT_TRANSPORT_INVALID';
  end if;

  v_outcome := p_statement->>'outcome';
  v_http_status := case
    when pg_catalog.jsonb_typeof(v_transport->'httpStatus') = 'null' then null
    else (v_transport->>'httpStatus')::integer
  end;
  v_openai_request_id_hmac := case
    when pg_catalog.jsonb_typeof(v_transport->'openAiRequestIdHmac') = 'null'
      then null
    else v_transport->>'openAiRequestIdHmac'
  end;
  v_openai_response_id_hmac := case
    when pg_catalog.jsonb_typeof(v_transport->'openAiResponseIdHmac') = 'null'
      then null
    else v_transport->>'openAiResponseIdHmac'
  end;

  if (
    v_openai_request_id_hmac is not null
    and v_openai_request_id_hmac = p_statement->>'clientRequestIdHmac'
  ) or (
    v_openai_response_id_hmac is not null
    and v_openai_response_id_hmac = p_statement->>'clientRequestIdHmac'
  ) or (
    v_openai_request_id_hmac is not null
    and v_openai_response_id_hmac is not null
    and v_openai_request_id_hmac = v_openai_response_id_hmac
  ) then
    raise exception using errcode = 'P0001', message = 'RECEIPT_TRANSPORT_INVALID';
  end if;

  if pg_catalog.jsonb_typeof(
    p_statement->'calculatedCostUpperBoundMicroUsd'
  ) = 'null' then
    v_cost := null;
  elsif pg_catalog.jsonb_typeof(
    p_statement->'calculatedCostUpperBoundMicroUsd'
  ) = 'number'
    and coalesce(
      p_statement->>'calculatedCostUpperBoundMicroUsd' ~ '^[0-9]+$',
      false
    )
    and (p_statement->>'calculatedCostUpperBoundMicroUsd')::numeric <= 2147483647
  then
    v_cost := (p_statement->>'calculatedCostUpperBoundMicroUsd')::integer;
  else
    raise exception using errcode = 'P0001', message = 'RECEIPT_COST_INVALID';
  end if;

  v_usage := p_statement->'usage';
  if v_outcome = 'COMPLETED' then
    if v_http_status is null
      or v_http_status not between 200 and 299
      or v_openai_request_id_hmac is null
      or v_openai_response_id_hmac is null
      or v_cost is null
      or v_cost not between 0 and 20130
      or pg_catalog.jsonb_typeof(v_usage) is distinct from 'object'
    then
      raise exception using errcode = 'P0001', message = 'RECEIPT_COMPLETED_INVALID';
    end if;

    if (select count(*) from pg_catalog.jsonb_object_keys(v_usage)) <> 6
      or not coalesce(v_usage ?& array[
        'source', 'inputTokens', 'outputTokens', 'totalTokens',
        'cachedInputTokens', 'reasoningTokens'
      ]::text[], false)
      or pg_catalog.jsonb_typeof(v_usage->'source') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_usage->'inputTokens')
        is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_usage->'outputTokens')
        is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_usage->'totalTokens')
        is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_usage->'cachedInputTokens')
        is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_usage->'reasoningTokens')
        not in ('number', 'null')
      or v_usage->>'source' is distinct from 'PROVIDER'
      or not coalesce(v_usage->>'inputTokens' ~ '^[0-9]+$', false)
      or not coalesce(v_usage->>'outputTokens' ~ '^[0-9]+$', false)
      or not coalesce(v_usage->>'totalTokens' ~ '^[0-9]+$', false)
      or not coalesce(v_usage->>'cachedInputTokens' ~ '^[0-9]+$', false)
      or (
        pg_catalog.jsonb_typeof(v_usage->'reasoningTokens') = 'number'
        and not coalesce(v_usage->>'reasoningTokens' ~ '^[0-9]+$', false)
      )
    then
      raise exception using errcode = 'P0001', message = 'RECEIPT_COMPLETED_INVALID';
    end if;

    if (v_usage->>'inputTokens')::numeric not between 1 and 10000
      or (v_usage->>'outputTokens')::numeric not between 1 and 2400
      or (v_usage->>'totalTokens')::numeric < 0
      or (v_usage->>'cachedInputTokens')::numeric < 0
      or (v_usage->>'totalTokens')::numeric <>
        (v_usage->>'inputTokens')::numeric +
        (v_usage->>'outputTokens')::numeric
      or (v_usage->>'cachedInputTokens')::numeric >
        (v_usage->>'inputTokens')::numeric
      or (
        pg_catalog.jsonb_typeof(v_usage->'reasoningTokens') = 'number'
        and (v_usage->>'reasoningTokens')::numeric >
          (v_usage->>'outputTokens')::numeric
      )
      or (
        pg_catalog.jsonb_typeof(v_usage->'reasoningTokens') = 'number'
        and (v_usage->>'reasoningTokens')::numeric < 0
      )
      or v_cost is distinct from pg_catalog.ceil((
        (
          (
            (v_usage->>'inputTokens')::numeric -
            (v_usage->>'cachedInputTokens')::numeric
          ) * 750000 +
          (v_usage->>'cachedInputTokens')::numeric * 75000 +
          (v_usage->>'outputTokens')::numeric * 4500000
        ) * 11000
      ) / 10000000000)::integer
    then
      raise exception using errcode = 'P0001', message = 'RECEIPT_COMPLETED_INVALID';
    end if;
  elsif v_outcome = 'PROVIDER_HTTP_ERROR' then
    if v_http_status is null
      or v_http_status not between 400 and 599
      or v_openai_response_id_hmac is not null
      or v_usage is distinct from 'null'::jsonb
      or v_cost is not null
    then
      raise exception using errcode = 'P0001', message = 'RECEIPT_HTTP_ERROR_INVALID';
    end if;
  elsif v_outcome = 'TRANSPORT_AMBIGUOUS' then
    if (v_http_status is not null and v_http_status not between 100 and 599)
      or v_usage is distinct from 'null'::jsonb
      or v_cost is not null
    then
      raise exception using errcode = 'P0001', message = 'RECEIPT_AMBIGUOUS_INVALID';
    end if;
  elsif v_outcome = 'LOCAL_PRE_DISPATCH_ABORTED' then
    if v_http_status is not null
      or v_openai_request_id_hmac is not null
      or v_openai_response_id_hmac is not null
      or v_usage is distinct from 'null'::jsonb
      or v_cost is distinct from 0
    then
      raise exception using errcode = 'P0001', message = 'RECEIPT_PRE_DISPATCH_INVALID';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'RECEIPT_OUTCOME_INVALID';
  end if;

  -- This is a CaresLink-signed internal observation only. It is explicitly not
  -- an OpenAI exact-provider receipt, billing proof or exactly-once attestation.
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  v_observed_at := (p_statement->>'observedAt')::timestamptz;
  if v_observed_at < v_reservation.reserved_at
    or v_observed_at > v_now + interval '5 seconds'
  then
    raise exception using errcode = 'P0001', message = 'RECEIPT_TIME_INVALID';
  end if;

  insert into careslink_v1_generation.communication_note_preview_dispatch_receipts (
    receipt_digest,
    reservation_id,
    claim_id,
    authorization_digest,
    run_id_hash,
    slot_index,
    statement,
    signature_base64url,
    signature_sha256,
    signer_key_id_hash,
    signer_public_key_sha256,
    verifier_identity_hmac,
    authenticity,
    provider_attestation,
    transport_scope,
    not_proof_of,
    outcome,
    http_status,
    client_request_id_hmac,
    openai_request_id_hmac,
    openai_response_id_hmac,
    usage,
    calculated_cost_upper_bound_micro_usd,
    observed_at,
    verified_at,
    no_retry,
    shadow_only
  ) values (
    v_receipt_digest,
    v_reservation_id,
    v_claim_id,
    v_authorization_digest,
    p_statement->>'runIdHash',
    (p_statement->>'slotIndex')::integer,
    p_statement,
    p_signature_base64url,
    v_signature_sha256,
    p_statement->>'signerKeyIdHash',
    p_statement->>'signerPublicKeySha256',
    p_verifier_identity_hmac,
    'CARESLINK_SIGNED_INTERNAL_OBSERVATION',
    'ABSENT',
    'APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION',
    array[
      'EXACT_PROVIDER_RECEIPT',
      'BILLING',
      'MODEL_EXECUTION',
      'EXACTLY_ONCE'
    ]::text[],
    v_outcome,
    v_http_status,
    p_statement->>'clientRequestIdHmac',
    v_openai_request_id_hmac,
    v_openai_response_id_hmac,
    case when v_usage = 'null'::jsonb then null else v_usage end,
    v_cost,
    v_observed_at,
    v_now,
    true,
    true
  );

  return pg_catalog.jsonb_build_object(
    'created', true,
    'receiptRecorded', true,
    'dispatchAuthorized', false,
    'receiptDigest', v_receipt_digest,
    'outcome', v_outcome,
    'providerAttestation', 'ABSENT'
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'RECEIPT_CONFLICT';
  when invalid_text_representation
    or datetime_field_overflow
    or numeric_value_out_of_range
    or invalid_parameter_value
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
end;
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Append-only enforcement, exact RPC ACLs and temporary-role cleanup
-- ---------------------------------------------------------------------------

set role careslink_v1_preview_receipt_executor;

create function careslink_v1_generation._deny_communication_note_preview_ledger_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'IMMUTABLE_PREVIEW_EXECUTION_AUTHORITY_LEDGER';
end;
$$;

grant execute on function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation()
  to careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;

create trigger communication_note_preview_authorizations_append_only
before update or delete
on careslink_v1_generation.communication_note_preview_authorizations
for each row execute function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation();
create trigger comm_preview_authorization_revocations_append_only
before update or delete
on careslink_v1_generation.communication_note_preview_authorization_revocations
for each row execute function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation();
create trigger communication_note_preview_claims_append_only
before update or delete
on careslink_v1_generation.communication_note_preview_claims
for each row execute function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation();
create trigger communication_note_preview_dispatch_reservations_append_only
before update or delete
on careslink_v1_generation.communication_note_preview_dispatch_reservations
for each row execute function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation();
create trigger communication_note_preview_dispatch_receipts_append_only
before update or delete
on careslink_v1_generation.communication_note_preview_dispatch_receipts
for each row execute function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation();

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_receipt_executor;

revoke execute on function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation()
  from careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_authorization_executor;

revoke all on function careslink_v1_generation.persist_verified_communication_note_preview_authorization(
  jsonb, text, text
)
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor;
grant execute on function careslink_v1_generation.persist_verified_communication_note_preview_authorization(
  jsonb, text, text
)
to careslink_v1_preview_authorization_executor;

revoke all on function careslink_v1_generation.revoke_communication_note_preview_authorization(
  text, uuid, text, text, text
)
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor;
grant execute on function careslink_v1_generation.revoke_communication_note_preview_authorization(
  text, uuid, text, text, text
)
to careslink_v1_preview_authorization_executor;

revoke all on function
  careslink_v1_generation._communication_note_preview_expected_source_bindings()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
revoke all on function
  careslink_v1_generation._communication_note_preview_expected_budget()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
revoke all on function
  careslink_v1_generation._communication_note_preview_authorization_statement_is_valid(
    jsonb
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
revoke all on function
  careslink_v1_generation._communication_note_preview_sha256_text(text)
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation._communication_note_preview_expected_slots()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_dispatch_executor;

revoke all on function careslink_v1_generation.claim_communication_note_preview_authorization(
  text, uuid, text, text, text, text, text
)
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_receipt_executor;
grant execute on function careslink_v1_generation.claim_communication_note_preview_authorization(
  text, uuid, text, text, text, text, text
)
to careslink_v1_preview_dispatch_executor;

revoke all on function careslink_v1_generation.reserve_communication_note_preview_dispatch(
  uuid, text, uuid, integer, text, integer, text, integer, text, text
)
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_receipt_executor;
grant execute on function careslink_v1_generation.reserve_communication_note_preview_dispatch(
  uuid, text, uuid, integer, text, integer, text, integer, text, text
)
to careslink_v1_preview_dispatch_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_receipt_executor;

revoke all on function careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
  jsonb, text, text, text
)
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor;
grant execute on function careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
  jsonb, text, text, text
)
to careslink_v1_preview_receipt_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;

revoke create on schema careslink_v1_generation
  from careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;
revoke all on schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on all tables in schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on type
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_authorization_revocations,
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations,
  careslink_v1_generation.communication_note_preview_dispatch_receipts
  from public, anon, authenticated, service_role;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- Remove only this migration's temporary PostgreSQL-16 SET edges. No LOGIN
-- role or Data API identity can assume a preview executor after this change.
revoke careslink_v1_preview_receipt_executor
  from current_user granted by current_user;
revoke careslink_v1_preview_dispatch_executor
  from current_user granted by current_user;
revoke careslink_v1_preview_authorization_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;
