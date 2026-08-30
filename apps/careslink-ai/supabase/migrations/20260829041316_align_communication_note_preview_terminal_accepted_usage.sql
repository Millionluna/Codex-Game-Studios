-- Communication Note Preview ACCEPTED usage contract alignment.
--
-- Forward-only correction for the already-published signed terminal migration.
-- The signed terminal keeps all nine usage keys, including three reconciliation
-- labels. Only the six provider receipt facts are projected for exact receipt
-- binding. No role, credential, runtime path, ledger row or capability is added.

begin;

select pg_catalog.set_config('careslink.migration_entry_role', current_user, true);

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_runner_terminal_executor to current_user
  with admin false, inherit false, set true granted by current_user;

set role careslink_v1_generation_owner;
grant create on schema careslink_v1_generation
  to careslink_v1_preview_runner_terminal_executor;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);
set role careslink_v1_preview_runner_terminal_executor;

create or replace function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
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
  v_authorization careslink_v1_generation.communication_note_preview_authorizations%rowtype;
  v_claim careslink_v1_generation.communication_note_preview_claims%rowtype;
  v_reservation careslink_v1_generation.communication_note_preview_dispatch_reservations%rowtype;
  v_receipt careslink_v1_generation.communication_note_preview_dispatch_receipts%rowtype;
  v_existing careslink_v1_generation.communication_note_preview_runner_terminals%rowtype;
  v_digest text;
  v_signature_sha256 text;
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
    or not coalesce(p_signature_base64url ~ '^[A-Za-z0-9_-]{86}$', false)
    or not coalesce(p_verifier_identity_hmac ~ '^[a-f0-9]{64}$', false)
    or (select pg_catalog.array_agg(key order by key collate "C")
        from pg_catalog.jsonb_object_keys(p_statement) as keys(key)) is distinct from
      array[
        'authorityPolicyDigest','authorizationDigest',
        'calculatedCostUpperBoundMicroUsd','candidateDigest','claimId',
        'criticalChecks','domain','failureReason','fixtureDigest','fixtureId',
        'humanReviews','noRetry','observedAt','preflightInputTokens',
        'providerRequestIdHash','receiptDigest','receiptProviderCorrelation',
        'receiptSignatureSha256','requestBodySha256','requestBodyUtf8ByteLength',
        'reservationId','runIdHash','runOrdinal','runnerPolicyDigest',
        'semanticCanonicalRequestSha256','signerKeyIdHash',
        'signerPublicKeySha256','signingPurpose','slotIndex','state',
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
        'runnerPolicyDigest','signerKeyIdHash','signerPublicKeySha256',
        'signingPurpose','state','terminalPolicyDigest','terminalPolicyVersion',
        'version'
      ]::text[]) as required_string(key)
      where pg_catalog.jsonb_typeof(p_statement->required_string.key)
        is distinct from 'string'
    )
    or p_statement->>'domain' is distinct from
      'CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL'
    or p_statement->>'version' is distinct from
      'runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2'
    or p_statement->>'authorityPolicyDigest' is distinct from
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9'
    or p_statement->>'runnerPolicyDigest' is distinct from
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
    or p_statement->>'terminalPolicyVersion' is distinct from
      'policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2'
    or p_statement->>'terminalPolicyDigest' is distinct from
      'd0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa'
    or p_statement->>'signingPurpose' is distinct from 'CARESLINK_RUNNER_TERMINAL'
    or not coalesce((p_statement->>'signerKeyIdHash') ~ '^[a-f0-9]{64}$', false)
    or not coalesce((p_statement->>'signerPublicKeySha256') ~ '^[a-f0-9]{64}$', false)
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
        and case
          when pg_catalog.jsonb_typeof(p_statement->'usage') = 'object' then
            (select pg_catalog.array_agg(key order by key collate "C")
             from pg_catalog.jsonb_object_keys(
               p_statement->'usage'
             ) as usage_keys(key)) is not distinct from
              array[
                'cachedInputTokens','cachedInputTokensReconciliation',
                'inputTokens','outputTokens','reasoningTokens',
                'reasoningTokensReconciliation','source','totalTokens',
                'totalTokensReconciliation'
              ]::text[]
            and not exists (
              select 1
              from pg_catalog.unnest(array[
                'source','totalTokensReconciliation',
                'cachedInputTokensReconciliation',
                'reasoningTokensReconciliation'
              ]::text[]) as string_usage(key)
              where pg_catalog.jsonb_typeof(
                p_statement->'usage'->string_usage.key
              ) is distinct from 'string'
            )
            and not exists (
              select 1
              from pg_catalog.unnest(array[
                'inputTokens','outputTokens','totalTokens','cachedInputTokens'
              ]::text[]) as numeric_usage(key)
              where pg_catalog.jsonb_typeof(
                p_statement->'usage'->numeric_usage.key
              ) is distinct from 'number'
            )
            and (
              pg_catalog.jsonb_typeof(
                p_statement->'usage'->'reasoningTokens'
              ) = 'number'
              or p_statement->'usage'->'reasoningTokens'
                is not distinct from 'null'::jsonb
            )
            and p_statement->'usage'->>'source' = 'PROVIDER'
            and p_statement->'usage'->>'totalTokensReconciliation' in (
              'REPORTED','CALCULATED'
            )
            and p_statement->'usage'->>'cachedInputTokensReconciliation' in (
              'REPORTED','ASSUMED_ZERO'
            )
            and p_statement->'usage'->>'reasoningTokensReconciliation' in (
              'REPORTED','UNAVAILABLE'
            )
            and case
              when not exists (
                select 1
                from pg_catalog.unnest(array[
                  'inputTokens','outputTokens','totalTokens',
                  'cachedInputTokens'
                ]::text[]) as integer_usage(key)
                where not coalesce(
                  (p_statement->'usage'->>integer_usage.key) ~
                    '^(0|[1-9][0-9]{0,4})$',
                  false
                )
              )
              and (
                p_statement->'usage'->'reasoningTokens'
                  is not distinct from 'null'::jsonb
                or coalesce(
                  (p_statement->'usage'->>'reasoningTokens') ~
                    '^(0|[1-9][0-9]{0,4})$',
                  false
                )
              )
              then
                (p_statement->'usage'->>'inputTokens')::integer
                  between 0 and 10000
                and (p_statement->'usage'->>'outputTokens')::integer
                  between 0 and 2400
                and (p_statement->'usage'->>'totalTokens')::integer
                  between 0 and 12400
                and (p_statement->'usage'->>'totalTokens')::integer =
                  (p_statement->'usage'->>'inputTokens')::integer +
                  (p_statement->'usage'->>'outputTokens')::integer
                and (p_statement->'usage'->>'cachedInputTokens')::integer
                  between 0 and
                    (p_statement->'usage'->>'inputTokens')::integer
                and (
                  p_statement->'usage'->>'cachedInputTokensReconciliation'
                    <> 'ASSUMED_ZERO'
                  or (p_statement->'usage'->>'cachedInputTokens')::integer = 0
                )
                and (
                  p_statement->'usage'->'reasoningTokens'
                    is not distinct from 'null'::jsonb
                  or (p_statement->'usage'->>'reasoningTokens')::integer
                    between 0 and
                      (p_statement->'usage'->>'outputTokens')::integer
                )
                and (
                  p_statement->'usage'->>'reasoningTokensReconciliation' =
                    'UNAVAILABLE'
                ) = (
                  p_statement->'usage'->'reasoningTokens'
                    is not distinct from 'null'::jsonb
                )
              else false
            end
          else false
        end
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
  v_signature_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_signature_base64url, 'UTF8'), 'sha256'
    ),
    'hex'
  );

  -- Preserve the global writer lock order.
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

  if v_authorization.signer_key_id_hash = v_receipt.signer_key_id_hash
    or v_authorization.signer_public_key_sha256 = v_receipt.signer_public_key_sha256
    or v_authorization.verifier_identity_hmac = v_receipt.verifier_identity_hmac
    or p_statement->>'signerKeyIdHash' in (
      v_authorization.signer_key_id_hash, v_receipt.signer_key_id_hash
    )
    or p_statement->>'signerPublicKeySha256' in (
      v_authorization.signer_public_key_sha256,
      v_receipt.signer_public_key_sha256
    )
    or p_verifier_identity_hmac in (
      v_authorization.verifier_identity_hmac, v_receipt.verifier_identity_hmac
    )
  then
    raise exception using
      errcode='P0001', message='RUNNER_TERMINAL_SIGNER_NOT_INDEPENDENT';
  end if;

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
        or (
          (p_statement->'usage') - array[
            'totalTokensReconciliation',
            'cachedInputTokensReconciliation',
            'reasoningTokensReconciliation'
          ]::text[]
        ) is distinct from v_receipt.usage
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
        v_signature_sha256,
        p_statement->>'signerKeyIdHash',
        p_statement->>'signerPublicKeySha256',
        p_verifier_identity_hmac,
        v_authorization.authorization_digest,
        v_authorization.signer_key_id_hash,
        v_authorization.signer_public_key_sha256,
        v_authorization.verifier_identity_hmac,
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
    ) <> 23
    or (
      v_state = 'ACCEPTED'
      and (
        select pg_catalog.count(distinct digest)
        from pg_catalog.unnest(array[
          v_digest,
          v_signature_sha256,
          p_statement->>'signerKeyIdHash',
          p_statement->>'signerPublicKeySha256',
          p_verifier_identity_hmac,
          v_authorization.authorization_digest,
          v_authorization.signer_key_id_hash,
          v_authorization.signer_public_key_sha256,
          v_authorization.verifier_identity_hmac,
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
      ) <> 26
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
      and v_existing.signature_base64url is not distinct from p_signature_base64url
      and v_existing.signature_sha256 = v_signature_sha256
      and v_existing.signer_key_id_hash = p_statement->>'signerKeyIdHash'
      and v_existing.signer_public_key_sha256 = p_statement->>'signerPublicKeySha256'
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
    verifier_identity_hmac,observed_at,recorded_at,no_retry,shadow_only,
    signature_base64url,signature_sha256,signer_key_id_hash,
    signer_public_key_sha256,authenticity,verifier_method
  ) values (
    v_digest,v_reservation.reservation_id,v_receipt.receipt_digest,v_claim.claim_id,
    v_authorization.authorization_digest,v_claim.run_id_hash,v_reservation.slot_index,
    v_reservation.fixture_id,v_reservation.run_ordinal,
    p_statement->>'authorityPolicyDigest',p_statement->>'runnerPolicyDigest',
    p_statement->>'terminalPolicyVersion',p_statement->>'terminalPolicyDigest',
    v_state,v_reason,p_statement,p_verifier_identity_hmac,v_observed_at,v_now,true,true,
    p_signature_base64url,v_signature_sha256,p_statement->>'signerKeyIdHash',
    p_statement->>'signerPublicKeySha256',
    'EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED',
    'APPLICATION_ED25519_TERMINAL_TRUST_REGISTRY'
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

revoke all on function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    jsonb, text, text
  )
from public, anon, authenticated, service_role,
  careslink_v1_generation_owner,
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller,
  careslink_v1_preview_runner_terminal_caller;
grant execute on function
  careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    jsonb, text, text
  )
to careslink_v1_preview_runner_terminal_executor,
  careslink_v1_preview_runner_terminal_caller;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);
set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation
  from careslink_v1_preview_runner_terminal_executor;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.migration_entry_role'), false
);
revoke careslink_v1_preview_runner_terminal_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;

commit;
