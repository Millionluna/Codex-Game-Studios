-- Communication Note Preview durable reservation timestamp and runner terminal.
--
-- Additive, source-only and default-off. This migration creates no LOGIN,
-- credential, runtime membership, API grant, seed row or enabled capability.

select pg_catalog.set_config('careslink.migration_entry_role', current_user, true);

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_dispatch_executor to current_user
  with admin false, inherit false, set true granted by current_user;

-- Serialize the precondition against every possible ledger writer, then use
-- the existing dispatch executor's five SELECT policies to inspect FORCE-RLS
-- tables. This remains correct for a non-superuser migration entry actor.
set role careslink_v1_generation_owner;
lock table
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_authorization_revocations,
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations,
  careslink_v1_generation.communication_note_preview_dispatch_receipts
in share row exclusive mode;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);

set role careslink_v1_preview_dispatch_executor;
do $$
begin
  if exists (
    select 1 from careslink_v1_generation.communication_note_preview_authorizations
    union all select 1 from careslink_v1_generation.communication_note_preview_authorization_revocations
    union all select 1 from careslink_v1_generation.communication_note_preview_claims
    union all select 1 from careslink_v1_generation.communication_note_preview_dispatch_reservations
    union all select 1 from careslink_v1_generation.communication_note_preview_dispatch_receipts
  ) then
    raise exception using
      errcode = 'P0001', message = 'PREVIEW_EXECUTION_LEDGERS_MUST_BE_EMPTY';
  end if;
end
$$;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);

create role careslink_v1_preview_runner_terminal_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;
grant careslink_v1_preview_runner_terminal_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_receipt_executor to current_user
  with admin false, inherit false, set true granted by current_user;

set role careslink_v1_generation_owner;

create table careslink_v1_generation.communication_note_preview_runner_terminals (
  runner_terminal_digest text primary key,
  reservation_id uuid not null unique
    references careslink_v1_generation.communication_note_preview_dispatch_reservations(
      reservation_id
    ) on update restrict on delete restrict,
  receipt_digest text not null unique
    references careslink_v1_generation.communication_note_preview_dispatch_receipts(
      receipt_digest
    ) on update restrict on delete restrict,
  claim_id uuid not null,
  authorization_digest text not null,
  run_id_hash text not null,
  slot_index integer not null,
  fixture_id text not null,
  run_ordinal integer not null,
  authority_policy_digest text not null,
  runner_policy_digest text not null,
  terminal_policy_version text not null,
  terminal_policy_digest text not null,
  terminal_state text not null,
  failure_reason text,
  statement jsonb not null,
  verifier_identity_hmac text not null,
  observed_at timestamptz not null,
  recorded_at timestamptz not null,
  no_retry boolean not null,
  shadow_only boolean not null default true,
  constraint comm_preview_runner_terminals_hashes_check check (
    runner_terminal_digest ~ '^[a-f0-9]{64}$'
    and authorization_digest ~ '^[a-f0-9]{64}$'
    and run_id_hash ~ '^[a-f0-9]{64}$'
    and authority_policy_digest ~ '^[a-f0-9]{64}$'
    and terminal_policy_digest ~ '^[a-f0-9]{64}$'
    and verifier_identity_hmac ~ '^[a-f0-9]{64}$'
  ),
  constraint comm_preview_runner_terminals_slot_check check (
    slot_index between 0 and 5 and run_ordinal between 1 and 2
  ),
  constraint comm_preview_runner_terminals_policy_check check (
    authority_policy_digest =
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9'
    and
    runner_policy_digest =
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
    and terminal_policy_version =
      'policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-f.v1'
    and terminal_policy_digest =
      '4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a'
  ),
  constraint comm_preview_runner_terminals_state_check check (
    (terminal_state = 'ACCEPTED' and failure_reason is null)
    or (
      terminal_state = 'FAILED'
      and failure_reason in (
        'CANCELLED',
        'PROVIDER_EVIDENCE_INVALID',
        'GOLDEN_EVALUATION_FAILED',
        'HUMAN_REVIEW_FAILED',
        'REPORT_INVALID'
      )
    )
  ),
  constraint comm_preview_runner_terminals_time_check check (
    recorded_at >= observed_at - interval '5 seconds'
  ),
  constraint comm_preview_runner_terminals_safety_check check (
    no_retry is true and shadow_only is true
  )
);

alter table careslink_v1_generation.communication_note_preview_runner_terminals
  enable row level security;
alter table careslink_v1_generation.communication_note_preview_runner_terminals
  force row level security;

create policy comm_preview_runner_terminals_executor_select
on careslink_v1_generation.communication_note_preview_runner_terminals
for select to careslink_v1_preview_runner_terminal_executor using (true);
create policy comm_preview_runner_terminals_executor_insert
on careslink_v1_generation.communication_note_preview_runner_terminals
for insert to careslink_v1_preview_runner_terminal_executor
with check (shadow_only is true and no_retry is true);
create policy comm_preview_runner_terminals_dispatch_select
on careslink_v1_generation.communication_note_preview_runner_terminals
for select to careslink_v1_preview_dispatch_executor using (true);

create policy comm_preview_authorizations_runner_terminal_select
on careslink_v1_generation.communication_note_preview_authorizations
for select to careslink_v1_preview_runner_terminal_executor using (true);
create policy comm_preview_authorizations_runner_terminal_lock
on careslink_v1_generation.communication_note_preview_authorizations
for update to careslink_v1_preview_runner_terminal_executor
using (true) with check (false);
create policy comm_preview_claims_runner_terminal_select
on careslink_v1_generation.communication_note_preview_claims
for select to careslink_v1_preview_runner_terminal_executor using (true);
create policy comm_preview_claims_runner_terminal_lock
on careslink_v1_generation.communication_note_preview_claims
for update to careslink_v1_preview_runner_terminal_executor
using (true) with check (false);
create policy comm_preview_reservations_runner_terminal_select
on careslink_v1_generation.communication_note_preview_dispatch_reservations
for select to careslink_v1_preview_runner_terminal_executor using (true);
create policy comm_preview_reservations_runner_terminal_lock
on careslink_v1_generation.communication_note_preview_dispatch_reservations
for update to careslink_v1_preview_runner_terminal_executor
using (true) with check (false);
create policy comm_preview_receipts_runner_terminal_select
on careslink_v1_generation.communication_note_preview_dispatch_receipts
for select to careslink_v1_preview_runner_terminal_executor using (true);
create policy comm_preview_receipts_runner_terminal_lock
on careslink_v1_generation.communication_note_preview_dispatch_receipts
for update to careslink_v1_preview_runner_terminal_executor
using (true) with check (false);

grant select, insert on
  careslink_v1_generation.communication_note_preview_runner_terminals
to careslink_v1_preview_runner_terminal_executor;
grant select on
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations,
  careslink_v1_generation.communication_note_preview_dispatch_receipts
to careslink_v1_preview_runner_terminal_executor;
grant select on
  careslink_v1_generation.communication_note_preview_runner_terminals
to careslink_v1_preview_dispatch_executor;
grant usage on type
  careslink_v1_generation.communication_note_preview_authorizations,
  careslink_v1_generation.communication_note_preview_claims,
  careslink_v1_generation.communication_note_preview_dispatch_reservations,
  careslink_v1_generation.communication_note_preview_dispatch_receipts,
  careslink_v1_generation.communication_note_preview_runner_terminals
to careslink_v1_preview_runner_terminal_executor;
grant usage on type
  careslink_v1_generation.communication_note_preview_runner_terminals
to careslink_v1_preview_dispatch_executor;
grant update (authorization_digest) on
  careslink_v1_generation.communication_note_preview_authorizations
to careslink_v1_preview_runner_terminal_executor;
grant update (authorization_digest) on
  careslink_v1_generation.communication_note_preview_claims
to careslink_v1_preview_runner_terminal_executor;
grant update (authorization_digest) on
  careslink_v1_generation.communication_note_preview_dispatch_reservations
to careslink_v1_preview_runner_terminal_executor;
grant update (authorization_digest) on
  careslink_v1_generation.communication_note_preview_dispatch_receipts
to careslink_v1_preview_runner_terminal_executor;

grant usage, create on schema careslink_v1_generation
  to careslink_v1_preview_runner_terminal_executor;
grant create on schema careslink_v1_generation
  to careslink_v1_preview_dispatch_executor;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);

grant usage on schema public, extensions
to careslink_v1_preview_runner_terminal_executor;
grant execute on function public.v1_shadow_canonical_json(jsonb),
  public.v1_shadow_content_sha256(jsonb),
  extensions.digest(bytea, text)
to careslink_v1_preview_runner_terminal_executor;

set role careslink_v1_preview_receipt_executor;
grant execute on function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation()
to careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);

set role careslink_v1_generation_owner;
create trigger communication_note_preview_runner_terminals_append_only
before update or delete
on careslink_v1_generation.communication_note_preview_runner_terminals
for each row execute function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation();

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);

set role careslink_v1_preview_receipt_executor;
revoke execute on function
  careslink_v1_generation._deny_communication_note_preview_ledger_mutation()
from careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);

set role careslink_v1_preview_runner_terminal_executor;

alter default privileges
  revoke execute on functions from public, anon, authenticated, service_role;

create function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
  p_statement jsonb,
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
  v_claim careslink_v1_generation.communication_note_preview_claims%rowtype;
  v_reservation careslink_v1_generation.communication_note_preview_dispatch_reservations%rowtype;
  v_receipt careslink_v1_generation.communication_note_preview_dispatch_receipts%rowtype;
  v_existing careslink_v1_generation.communication_note_preview_runner_terminals%rowtype;
  v_digest text;
  v_state text;
  v_reason text;
  v_observed_at timestamptz;
  v_now timestamptz;
begin
  if pg_catalog.current_setting('transaction_isolation') is distinct from
    'read committed'
  then
    raise exception using errcode = 'P0001', message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end if;
  if p_statement is null
    or pg_catalog.jsonb_typeof(p_statement) <> 'object'
    or not coalesce(p_verifier_identity_hmac ~ '^[a-f0-9]{64}$', false)
    or (select pg_catalog.array_agg(key order by key)
        from pg_catalog.jsonb_object_keys(p_statement) as keys(key)) is distinct from
      array[
        'authorityPolicyDigest','authorizationDigest',
        'calculatedCostUpperBoundMicroUsd','candidateDigest','claimId',
        'criticalChecks','domain',
        'failureReason','fixtureDigest','fixtureId','humanReviews','noRetry',
        'observedAt','preflightInputTokens','providerRequestIdHash',
        'receiptDigest','receiptProviderCorrelation','receiptSignatureSha256',
        'requestBodySha256','requestBodyUtf8ByteLength','reservationId',
        'runIdHash','runOrdinal','runnerPolicyDigest',
        'semanticCanonicalRequestSha256','slotIndex','state',
        'terminalPolicyDigest','terminalPolicyVersion','usage','version'
      ]::text[]
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  v_state := p_statement->>'state';
  v_reason := p_statement->>'failureReason';
  if exists (
      select 1
      from pg_catalog.unnest(array[
        'authorityPolicyDigest','authorizationDigest','claimId','domain',
        'fixtureId','observedAt','receiptDigest','reservationId','runIdHash',
        'runnerPolicyDigest','state','terminalPolicyDigest',
        'terminalPolicyVersion','version'
      ]::text[]) as required_string(key)
      where pg_catalog.jsonb_typeof(p_statement->required_string.key)
        is distinct from 'string'
    )
    or p_statement->>'domain' is distinct from
      'CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL'
    or p_statement->>'version' is distinct from
      'runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-f.v1'
    or p_statement->>'authorityPolicyDigest' is distinct from
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9'
    or p_statement->>'runnerPolicyDigest' is distinct from
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
    or p_statement->>'terminalPolicyVersion' is distinct from
      'policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-f.v1'
    or p_statement->>'terminalPolicyDigest' is distinct from
      '4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a'
    or p_statement->'noRetry' is distinct from 'true'::jsonb
    or pg_catalog.jsonb_typeof(p_statement->'slotIndex') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_statement->'runOrdinal') is distinct from 'number'
    or not coalesce((p_statement->>'slotIndex') ~ '^[0-5]$', false)
    or not coalesce((p_statement->>'runOrdinal') ~ '^[12]$', false)
    or not coalesce((p_statement->>'authorizationDigest') ~ '^[a-f0-9]{64}$', false)
    or not coalesce((p_statement->>'runIdHash') ~ '^[a-f0-9]{64}$', false)
    or not coalesce((p_statement->>'receiptDigest') ~ '^[a-f0-9]{64}$', false)
    or not coalesce((p_statement->>'observedAt') ~
      '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$', false)
    or not coalesce((p_statement->>'claimId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
    or not coalesce((p_statement->>'reservationId') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
    or not coalesce(case
      when v_state = 'ACCEPTED' then
        p_statement->'failureReason' is not distinct from 'null'::jsonb
        and not exists (
          select 1
          from pg_catalog.unnest(array[
            'candidateDigest','fixtureDigest','providerRequestIdHash',
            'receiptProviderCorrelation','receiptSignatureSha256',
            'requestBodySha256','semanticCanonicalRequestSha256'
          ]::text[]) as required_string(key)
          where pg_catalog.jsonb_typeof(p_statement->required_string.key)
            is distinct from 'string'
        )
        and coalesce((p_statement->>'requestBodySha256') ~ '^[a-f0-9]{64}$', false)
        and coalesce((p_statement->>'semanticCanonicalRequestSha256') ~ '^[a-f0-9]{64}$', false)
        and coalesce((p_statement->>'receiptSignatureSha256') ~ '^[a-f0-9]{64}$', false)
        and coalesce((p_statement->>'fixtureDigest') ~ '^[a-f0-9]{64}$', false)
        and coalesce((p_statement->>'providerRequestIdHash') ~ '^[a-f0-9]{64}$', false)
        and coalesce((p_statement->>'candidateDigest') ~ '^[a-f0-9]{64}$', false)
        and pg_catalog.jsonb_typeof(p_statement->'requestBodyUtf8ByteLength') = 'number'
        and pg_catalog.jsonb_typeof(p_statement->'preflightInputTokens') = 'number'
        and pg_catalog.jsonb_typeof(
          p_statement->'calculatedCostUpperBoundMicroUsd'
        ) = 'number'
        and coalesce((p_statement->>'requestBodyUtf8ByteLength') ~ '^[1-9][0-9]{0,6}$', false)
        and coalesce((p_statement->>'preflightInputTokens') ~ '^[1-9][0-9]{0,4}$', false)
        and (p_statement->>'preflightInputTokens')::integer between 1 and 10000
        and p_statement->'usage' is not null
        and pg_catalog.jsonb_typeof(p_statement->'usage') = 'object'
        and p_statement->'calculatedCostUpperBoundMicroUsd' is not null
        and p_statement->'criticalChecks' is not distinct from pg_catalog.jsonb_build_object(
          'STRICT_SCHEMA',true,'SHARED_OUTPUT_PRIVACY',true,
          'DATE_TIME_PARITY',true,'NUMERIC_PARITY',true,
          'DECISION_LANGUAGE',true,'REFUSAL_ABSENT',true,
          'HUMAN_SEMANTIC_GROUNDEDNESS',true
        )
        and p_statement->'humanReviews' is not distinct from pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('locale','en','passed',true),
          pg_catalog.jsonb_build_object('locale','zh-Hans','passed',true),
          pg_catalog.jsonb_build_object('locale','zh-Hant','passed',true)
        )
        and p_statement->>'receiptProviderCorrelation' is not distinct from
          'UNATTESTED_NO_SHARED_IDENTIFIER'
      when v_state = 'FAILED' then
        v_reason in (
          'CANCELLED','PROVIDER_EVIDENCE_INVALID','GOLDEN_EVALUATION_FAILED',
          'HUMAN_REVIEW_FAILED','REPORT_INVALID'
        )
        and p_statement->'requestBodySha256' is not distinct from 'null'::jsonb
        and p_statement->'requestBodyUtf8ByteLength' is not distinct from 'null'::jsonb
        and p_statement->'semanticCanonicalRequestSha256' is not distinct from 'null'::jsonb
        and p_statement->'receiptSignatureSha256' is not distinct from 'null'::jsonb
        and p_statement->'fixtureDigest' is not distinct from 'null'::jsonb
        and p_statement->'preflightInputTokens' is not distinct from 'null'::jsonb
        and p_statement->'providerRequestIdHash' is not distinct from 'null'::jsonb
        and p_statement->'candidateDigest' is not distinct from 'null'::jsonb
        and p_statement->'usage' is not distinct from 'null'::jsonb
        and p_statement->'calculatedCostUpperBoundMicroUsd' is not distinct from 'null'::jsonb
        and p_statement->'criticalChecks' is not distinct from 'null'::jsonb
        and p_statement->'humanReviews' is not distinct from 'null'::jsonb
        and p_statement->'receiptProviderCorrelation' is not distinct from 'null'::jsonb
      else false
    end, false)
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  begin
    v_observed_at := (p_statement->>'observedAt')::timestamptz;
  exception when others then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end;
  if pg_catalog.to_char(v_observed_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_statement->>'observedAt'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  v_digest := public.v1_shadow_content_sha256(p_statement);

  select a.* into v_authorization
  from careslink_v1_generation.communication_note_preview_authorizations a
  where a.authorization_digest = p_statement->>'authorizationDigest'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_FOUND';
  end if;
  select c.* into v_claim
  from careslink_v1_generation.communication_note_preview_claims c
  where c.claim_id = (p_statement->>'claimId')::uuid
  for update;
  if not found then raise exception using errcode='P0001', message='CLAIM_NOT_FOUND'; end if;
  select r.* into v_reservation
  from careslink_v1_generation.communication_note_preview_dispatch_reservations r
  where r.reservation_id = (p_statement->>'reservationId')::uuid
  for update;
  if not found then raise exception using errcode='P0001', message='RESERVATION_NOT_FOUND'; end if;
  select r.* into v_receipt
  from careslink_v1_generation.communication_note_preview_dispatch_receipts r
  where r.receipt_digest = p_statement->>'receiptDigest'
  for update;
  if not found then raise exception using errcode='P0001', message='RECEIPT_NOT_FOUND'; end if;

  if v_claim.authorization_digest <> v_authorization.authorization_digest
    or v_reservation.claim_id <> v_claim.claim_id
    or v_reservation.authorization_digest <> v_authorization.authorization_digest
    or v_reservation.run_id_hash <> v_claim.run_id_hash
    or v_receipt.reservation_id <> v_reservation.reservation_id
    or v_receipt.claim_id <> v_claim.claim_id
    or v_receipt.authorization_digest <> v_authorization.authorization_digest
    or v_receipt.run_id_hash <> v_claim.run_id_hash
    or v_receipt.slot_index <> v_reservation.slot_index
    or v_receipt.outcome <> 'COMPLETED'
    or p_statement->>'runIdHash' is distinct from v_claim.run_id_hash
    or (p_statement->>'slotIndex')::integer <> v_reservation.slot_index
    or p_statement->>'fixtureId' is distinct from v_reservation.fixture_id
    or (p_statement->>'runOrdinal')::integer <> v_reservation.run_ordinal
    or v_observed_at < v_receipt.verified_at
    or (
      v_state = 'ACCEPTED'
      and (
        p_statement->>'requestBodySha256' is distinct from
          v_reservation.request_body_sha256
        or (p_statement->>'requestBodyUtf8ByteLength')::integer is distinct from
          v_reservation.request_body_utf8_byte_length
        or p_statement->>'semanticCanonicalRequestSha256' is distinct from
          v_reservation.semantic_canonical_request_sha256
        or p_statement->>'receiptSignatureSha256' is distinct from
          v_receipt.signature_sha256
        or p_statement->'usage' is distinct from v_receipt.usage
        or (p_statement->>'preflightInputTokens')::integer <
          (v_receipt.usage->>'inputTokens')::integer
        or p_statement->'calculatedCostUpperBoundMicroUsd' is distinct from
          pg_catalog.to_jsonb(v_receipt.calculated_cost_upper_bound_micro_usd)
      )
    )
    or (
      select pg_catalog.count(distinct digest)
      from pg_catalog.unnest(array[
        v_digest,
        p_verifier_identity_hmac,
        v_authorization.authorization_digest,
        v_claim.run_id_hash,
        v_reservation.request_body_sha256,
        v_reservation.semantic_canonical_request_sha256,
        v_reservation.client_request_id_hmac,
        v_receipt.receipt_digest,
        v_receipt.signature_sha256,
        v_receipt.signer_key_id_hash,
        v_receipt.signer_public_key_sha256,
        v_receipt.verifier_identity_hmac,
        v_receipt.openai_request_id_hmac,
        v_receipt.openai_response_id_hmac,
        p_statement->>'authorityPolicyDigest',
        p_statement->>'runnerPolicyDigest',
        p_statement->>'terminalPolicyDigest'
      ]) as common_evidence(digest)
    ) <> 17
    or (
      v_state = 'ACCEPTED'
      and (
        select pg_catalog.count(distinct digest)
        from pg_catalog.unnest(array[
          v_digest,
          p_verifier_identity_hmac,
          v_authorization.authorization_digest,
          v_claim.run_id_hash,
          v_reservation.request_body_sha256,
          v_reservation.semantic_canonical_request_sha256,
          v_reservation.client_request_id_hmac,
          v_receipt.receipt_digest,
          v_receipt.signature_sha256,
          v_receipt.signer_key_id_hash,
          v_receipt.signer_public_key_sha256,
          v_receipt.verifier_identity_hmac,
          v_receipt.openai_request_id_hmac,
          v_receipt.openai_response_id_hmac,
          p_statement->>'fixtureDigest',
          p_statement->>'providerRequestIdHash',
          p_statement->>'candidateDigest',
          p_statement->>'authorityPolicyDigest',
          p_statement->>'runnerPolicyDigest',
          p_statement->>'terminalPolicyDigest'
        ]) as evidence(digest)
      ) <> 20
    )
  then
    raise exception using errcode='P0001', message='RUNNER_TERMINAL_BINDING_INVALID';
  end if;

  select t.* into v_existing
  from careslink_v1_generation.communication_note_preview_runner_terminals t
  where t.reservation_id = v_reservation.reservation_id;
  if found then
    if v_existing.runner_terminal_digest = v_digest
      and v_existing.statement is not distinct from p_statement
      and v_existing.verifier_identity_hmac = p_verifier_identity_hmac
    then
      return pg_catalog.jsonb_build_object(
        'created', false,
        'runnerTerminalRecorded', true,
        'continuationEligible', v_existing.terminal_state = 'ACCEPTED',
        'runnerTerminalDigest', v_existing.runner_terminal_digest,
        'state', v_existing.terminal_state,
        'recordedAt', pg_catalog.to_char(v_existing.recorded_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'status', 'ALREADY_RECORDED'
      );
    end if;
    raise exception using errcode='P0001', message='RUNNER_TERMINAL_CONFLICT';
  end if;

  v_now := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  if v_observed_at > v_now + interval '5 seconds' then
    raise exception using errcode='P0001', message='RUNNER_TERMINAL_TIME_INVALID';
  end if;
  insert into careslink_v1_generation.communication_note_preview_runner_terminals(
    runner_terminal_digest,reservation_id,receipt_digest,claim_id,
    authorization_digest,run_id_hash,slot_index,fixture_id,run_ordinal,
    authority_policy_digest,runner_policy_digest,terminal_policy_version,
    terminal_policy_digest,terminal_state,failure_reason,statement,
    verifier_identity_hmac,observed_at,recorded_at,no_retry,shadow_only
  ) values (
    v_digest,v_reservation.reservation_id,v_receipt.receipt_digest,v_claim.claim_id,
    v_authorization.authorization_digest,v_claim.run_id_hash,v_reservation.slot_index,
    v_reservation.fixture_id,v_reservation.run_ordinal,
    p_statement->>'authorityPolicyDigest',p_statement->>'runnerPolicyDigest',
    p_statement->>'terminalPolicyVersion',p_statement->>'terminalPolicyDigest',
    v_state,v_reason,p_statement,p_verifier_identity_hmac,v_observed_at,v_now,true,true
  );
  return pg_catalog.jsonb_build_object(
    'created', true,
    'runnerTerminalRecorded', true,
    'continuationEligible', v_state = 'ACCEPTED',
    'runnerTerminalDigest', v_digest,
    'state', v_state,
    'recordedAt', pg_catalog.to_char(v_now at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'status', 'RUNNER_TERMINAL_RECORDED'
  );
exception when unique_violation then
  raise exception using errcode='P0001', message='RUNNER_TERMINAL_CONFLICT';
when invalid_text_representation
  or datetime_field_overflow
  or numeric_value_out_of_range
  or invalid_parameter_value
then
  raise exception using errcode='P0001', message='VALIDATION_ERROR';
end;
$$;

revoke all on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller;
grant execute on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)
to careslink_v1_preview_runner_terminal_executor;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);

set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation
  from careslink_v1_preview_runner_terminal_executor;
revoke all on all tables in schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on type careslink_v1_generation.communication_note_preview_runner_terminals
  from public, anon, authenticated, service_role;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);

set role careslink_v1_preview_dispatch_executor;

create or replace function careslink_v1_generation.reserve_communication_note_preview_dispatch(
  p_claim_id uuid, p_claim_token text, p_reservation_id uuid,
  p_slot_index integer, p_fixture_id text, p_run_ordinal integer,
  p_request_body_sha256 text, p_request_body_utf8_byte_length integer,
  p_semantic_canonical_request_sha256 text, p_client_request_id_hmac text
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_authorization_digest text;
  v_authorization careslink_v1_generation.communication_note_preview_authorizations%rowtype;
  v_claim careslink_v1_generation.communication_note_preview_claims%rowtype;
  v_existing careslink_v1_generation.communication_note_preview_dispatch_reservations%rowtype;
  v_prior_reservation careslink_v1_generation.communication_note_preview_dispatch_reservations%rowtype;
  v_prior_receipt careslink_v1_generation.communication_note_preview_dispatch_receipts%rowtype;
  v_prior_terminal careslink_v1_generation.communication_note_preview_runner_terminals%rowtype;
  v_prior_slot integer;
  v_expected_slot jsonb;
  v_now timestamptz;
begin
  if pg_catalog.current_setting('transaction_isolation') is distinct from 'read committed' then
    raise exception using errcode='P0001', message='UNSUPPORTED_TRANSACTION_ISOLATION';
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
    or p_fixture_id is null
    or p_run_ordinal is null
    or p_run_ordinal not between 1 and 2
    or not coalesce(p_request_body_sha256 ~ '^[a-f0-9]{64}$', false)
    or p_request_body_utf8_byte_length is null
    or p_request_body_utf8_byte_length <= 0
    or not coalesce(
      p_semantic_canonical_request_sha256 ~ '^[a-f0-9]{64}$', false
    )
    or not coalesce(p_client_request_id_hmac ~ '^[a-f0-9]{64}$', false)
  then
    raise exception using errcode='P0001', message='VALIDATION_ERROR';
  end if;

  select c.authorization_digest into v_authorization_digest
  from careslink_v1_generation.communication_note_preview_claims c
  where c.claim_id=p_claim_id;
  if not found then raise exception using errcode='P0001', message='CLAIM_NOT_FOUND'; end if;
  select a.* into v_authorization
  from careslink_v1_generation.communication_note_preview_authorizations a
  where a.authorization_digest=v_authorization_digest for update;
  select c.* into v_claim
  from careslink_v1_generation.communication_note_preview_claims c
  where c.claim_id=p_claim_id for update;
  if not found or v_claim.authorization_digest<>v_authorization_digest
    or v_claim.claim_token_sha256<>
      careslink_v1_generation._communication_note_preview_sha256_text(p_claim_token)
  then raise exception using errcode='P0001', message='CLAIM_AUTHORITY_INVALID'; end if;

  select r.* into v_existing
  from careslink_v1_generation.communication_note_preview_dispatch_reservations r
  where r.claim_id=p_claim_id and r.slot_index=p_slot_index;
  if found then
    if v_existing.reservation_id=p_reservation_id
      and v_existing.fixture_id=p_fixture_id and v_existing.run_ordinal=p_run_ordinal
      and v_existing.request_body_sha256=p_request_body_sha256
      and v_existing.request_body_utf8_byte_length=p_request_body_utf8_byte_length
      and v_existing.semantic_canonical_request_sha256=p_semantic_canonical_request_sha256
      and v_existing.client_request_id_hmac=p_client_request_id_hmac
    then return pg_catalog.jsonb_build_object(
      'created',false,'dispatchAuthorized',false,
      'reservationId',v_existing.reservation_id,'slotIndex',v_existing.slot_index,
      'reservedAt',pg_catalog.to_char(v_existing.reserved_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status','ALREADY_RESERVED');
    end if;
    raise exception using errcode='P0001', message='SLOT_ALREADY_RESERVED';
  end if;

  if p_slot_index > 0 then
    for v_prior_slot in 0..p_slot_index - 1 loop
      select r.* into v_prior_reservation
      from careslink_v1_generation.communication_note_preview_dispatch_reservations r
      where r.claim_id = p_claim_id and r.slot_index = v_prior_slot;
      if not found then
        raise exception using errcode='P0001', message='SLOT_OUT_OF_ORDER';
      end if;
      select r.* into v_prior_receipt
      from careslink_v1_generation.communication_note_preview_dispatch_receipts r
      where r.reservation_id = v_prior_reservation.reservation_id;
      if not found then
        raise exception using errcode='P0001', message='PRIOR_SLOT_NOT_TERMINAL';
      end if;
      if v_prior_receipt.outcome is distinct from 'COMPLETED' then
        raise exception using errcode='P0001', message='RUN_PERMANENTLY_CONSUMED';
      end if;
      select t.* into v_prior_terminal
      from careslink_v1_generation.communication_note_preview_runner_terminals t
      where t.reservation_id = v_prior_reservation.reservation_id;
      if not found then
        raise exception using
          errcode='P0001', message='PRIOR_RUNNER_TERMINAL_PENDING';
      end if;
      if v_prior_terminal.terminal_state is distinct from 'ACCEPTED' then
        raise exception using errcode='P0001', message='RUN_PERMANENTLY_CONSUMED';
      end if;
    end loop;
  end if;
  if exists (select 1 from careslink_v1_generation.communication_note_preview_authorization_revocations x
    where x.authorization_digest=v_authorization_digest)
  then raise exception using errcode='P0001', message='AUTHORIZATION_REVOKED'; end if;

  v_now:=pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp());
  if v_authorization.expires_at<=v_now then
    raise exception using errcode='P0001', message='AUTHORIZATION_EXPIRED';
  end if;
  v_expected_slot:=careslink_v1_generation._communication_note_preview_expected_slots()->p_slot_index;
  if v_expected_slot->>'fixtureId' is distinct from p_fixture_id
    or (v_expected_slot->>'runOrdinal')::integer is distinct from p_run_ordinal
    or v_expected_slot->>'requestBodySha256' is distinct from p_request_body_sha256
    or (v_expected_slot->>'requestBodyUtf8ByteLength')::integer is distinct from p_request_body_utf8_byte_length
    or v_expected_slot->>'semanticCanonicalRequestSha256' is distinct from p_semantic_canonical_request_sha256
  then raise exception using errcode='P0001', message='SLOT_BINDING_MISMATCH'; end if;
  insert into careslink_v1_generation.communication_note_preview_dispatch_reservations(
    reservation_id,claim_id,authorization_digest,run_id_hash,slot_index,
    fixture_id,run_ordinal,attempt_ordinal,request_body_sha256,
    request_body_utf8_byte_length,semantic_canonical_request_sha256,
    client_request_id_hmac,reserved_at,shadow_only
  ) values (p_reservation_id,p_claim_id,v_authorization_digest,v_claim.run_id_hash,
    p_slot_index,p_fixture_id,p_run_ordinal,1,p_request_body_sha256,
    p_request_body_utf8_byte_length,p_semantic_canonical_request_sha256,
    p_client_request_id_hmac,v_now,true);
  return pg_catalog.jsonb_build_object(
    'created',true,'dispatchAuthorized',true,'reservationId',p_reservation_id,
    'slotIndex',p_slot_index,'reservedAt',pg_catalog.to_char(v_now at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status','RESERVED_BEFORE_TRANSPORT');
exception when unique_violation then
  raise exception using errcode='P0001', message='RESERVATION_CONFLICT';
end;
$$;

revoke all on function careslink_v1_generation.reserve_communication_note_preview_dispatch(
  uuid, text, uuid, integer, text, integer, text, integer, text, text
)
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_runner_terminal_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_receipt_caller;
grant execute on function careslink_v1_generation.reserve_communication_note_preview_dispatch(
  uuid, text, uuid, integer, text, integer, text, integer, text, text
)
to careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_dispatch_caller;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);
set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation
  from careslink_v1_preview_dispatch_executor;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);
set role careslink_v1_preview_runner_terminal_executor;
revoke all on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller;
grant execute on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)
to careslink_v1_preview_runner_terminal_executor;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);
set role careslink_v1_generation_owner;
revoke all on schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on all tables in schema careslink_v1_generation
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema careslink_v1_generation
  from public, anon, authenticated, service_role;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);
revoke careslink_v1_preview_runner_terminal_executor from current_user granted by current_user;
revoke careslink_v1_preview_receipt_executor from current_user granted by current_user;
revoke careslink_v1_preview_dispatch_executor from current_user granted by current_user;
revoke careslink_v1_generation_owner from current_user granted by current_user;
