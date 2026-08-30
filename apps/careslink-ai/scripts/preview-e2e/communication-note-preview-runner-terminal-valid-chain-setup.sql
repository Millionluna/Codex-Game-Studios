-- TEST_ONLY setup body for one disposable Preview signed-terminal live gate.
-- The caller owns the transaction and supplies only a synthetic authorization
-- statement/signature plus the already-created random runtime role through
-- transaction-local, parameterized GUCs. No terminal row is written here.

do $careslink_runner_terminal_valid_setup$
declare
  v_runtime_name pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_valid.runtime_role', true
  );
  v_expected_major pg_catalog.int4 := pg_catalog.current_setting(
    'careslink.runner_terminal_valid.expected_pg_major', true
  )::pg_catalog.int4;
  v_authorization_statement pg_catalog.jsonb := pg_catalog.current_setting(
    'careslink.runner_terminal_valid.authorization_statement', true
  )::pg_catalog.jsonb;
  v_authorization_signature pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_valid.authorization_signature', true
  );
  v_runtime pg_catalog.oid := pg_catalog.to_regrole(v_runtime_name);
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runner-terminal-valid-e2e-management'
    or v_expected_major not in (16, 17)
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 <> v_expected_major
  then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_MANAGEMENT_UNSAFE';
  end if;

  if v_runtime_name !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
    or v_runtime is null
    or v_caller is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runtime
        and role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = 1
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
        and membership.roleid = v_caller
        and not membership.admin_option
        and not membership.inherit_option
        and membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
    ) <> 1
    or pg_catalog.pg_has_role(
      v_runtime,
      'careslink_v1_preview_runner_terminal_executor',
      'MEMBER'
    )
  then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_RUNTIME_UNSAFE';
  end if;

  if v_authorization_statement->>'domain' is distinct from
      'careslink.communication-note.preview-authorization'
    or v_authorization_statement->'input'->>'classification' is distinct from
      'SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY'
    or v_authorization_statement->'input'->'realCareDataAllowed' is distinct from
      'false'::pg_catalog.jsonb
    or not coalesce(
      v_authorization_signature ~ '^[A-Za-z0-9_-]{86}$', false
    )
  then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_FIXTURE_UNSAFE';
  end if;

  if exists (
    select 1 from careslink_v1_generation.communication_note_preview_authorizations
    union all
    select 1 from careslink_v1_generation.communication_note_preview_authorization_revocations
    union all
    select 1 from careslink_v1_generation.communication_note_preview_claims
    union all
    select 1 from careslink_v1_generation.communication_note_preview_dispatch_reservations
    union all
    select 1 from careslink_v1_generation.communication_note_preview_dispatch_receipts
    union all
    select 1 from careslink_v1_generation.communication_note_preview_runner_terminals
  ) then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_LEDGER_NOT_EMPTY';
  end if;

  if pg_catalog.to_regprocedure(
      'careslink_v1_generation.persist_verified_communication_note_preview_authorization(jsonb,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.claim_communication_note_preview_authorization(text,uuid,text,text,text,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.reserve_communication_note_preview_dispatch(uuid,text,uuid,integer,text,integer,text,integer,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(jsonb,text,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)'
    ) is not null
  then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_RPC_DRIFT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    join pg_catalog.pg_roles as grantor_role
      on grantor_role.oid = membership.grantor
    where membership.member = current_user::pg_catalog.regrole
      and membership.roleid in (
        'careslink_v1_preview_authorization_executor'::pg_catalog.regrole,
        'careslink_v1_preview_dispatch_executor'::pg_catalog.regrole,
        'careslink_v1_preview_receipt_executor'::pg_catalog.regrole
      )
      and not (
        grantor_role.rolsuper
        and membership.grantor <> membership.member
        and membership.admin_option
        and coalesce(
          (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
          false
        ) is false
        and coalesce(
          (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
          false
        ) is false
      )
  ) or exists (
    select membership.roleid
    from pg_catalog.pg_auth_members as membership
    where membership.member = current_user::pg_catalog.regrole
      and membership.roleid in (
        'careslink_v1_preview_authorization_executor'::pg_catalog.regrole,
        'careslink_v1_preview_dispatch_executor'::pg_catalog.regrole,
        'careslink_v1_preview_receipt_executor'::pg_catalog.regrole
      )
    group by membership.roleid
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_MANAGEMENT_MEMBERSHIP_DRIFT';
  end if;
end
$careslink_runner_terminal_valid_setup$;

create temporary table m1gh_valid_management_membership_snapshot
on commit drop as
select
  membership.roleid,
  membership.member,
  membership.grantor,
  membership.admin_option,
  coalesce(
    (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
    false
  ) as inherit_option,
  coalesce(
    (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
    false
  ) as set_option
from pg_catalog.pg_auth_members as membership
where membership.member = current_user::pg_catalog.regrole
  and membership.roleid in (
    'careslink_v1_preview_authorization_executor'::pg_catalog.regrole,
    'careslink_v1_preview_dispatch_executor'::pg_catalog.regrole,
    'careslink_v1_preview_receipt_executor'::pg_catalog.regrole
  );

grant careslink_v1_preview_authorization_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_dispatch_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_receipt_executor to current_user
  with admin false, inherit false, set true granted by current_user;

create temporary table m1gh_valid_chain_state (
  authorization_statement pg_catalog.jsonb not null,
  authorization_digest pg_catalog.text not null,
  claim_id pg_catalog.uuid not null,
  claim_token pg_catalog.text not null,
  reservation_id pg_catalog.uuid not null,
  receipt_digest pg_catalog.text,
  primary key (claim_id)
) on commit drop;
grant select, insert, update on m1gh_valid_chain_state to
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor;

set local role careslink_v1_preview_authorization_executor;
do $careslink_runner_terminal_valid_authorization$
declare
  v_statement pg_catalog.jsonb := pg_catalog.current_setting(
    'careslink.runner_terminal_valid.authorization_statement', true
  )::pg_catalog.jsonb;
  v_result pg_catalog.jsonb;
begin
  v_result := careslink_v1_generation.persist_verified_communication_note_preview_authorization(
    v_statement,
    pg_catalog.current_setting(
      'careslink.runner_terminal_valid.authorization_signature', true
    ),
    pg_catalog.repeat('f', 64)
  );
  if v_result->'created' is distinct from 'true'::pg_catalog.jsonb then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_AUTHORIZATION_FAILED';
  end if;
  insert into pg_temp.m1gh_valid_chain_state (
    authorization_statement,
    authorization_digest,
    claim_id,
    claim_token,
    reservation_id
  ) values (
    v_statement,
    v_result->>'authorizationDigest',
    'f5200000-0000-4000-8000-000000000001',
    pg_catalog.repeat('0', 64),
    'f5300000-0000-4000-8000-000000000001'
  );
end
$careslink_runner_terminal_valid_authorization$;

reset role;
set local role careslink_v1_preview_dispatch_executor;
do $careslink_runner_terminal_valid_dispatch$
declare
  v_state pg_temp.m1gh_valid_chain_state%rowtype;
  v_claim pg_catalog.jsonb;
  v_reservation pg_catalog.jsonb;
begin
  select * into strict v_state from pg_temp.m1gh_valid_chain_state;
  v_claim := careslink_v1_generation.claim_communication_note_preview_authorization(
    v_state.authorization_digest,
    v_state.claim_id,
    v_state.authorization_statement->>'runIdHash',
    pg_catalog.repeat('8', 64),
    '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
    '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8',
    'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
  );
  v_reservation := careslink_v1_generation.reserve_communication_note_preview_dispatch(
    v_state.claim_id,
    v_claim->>'claimToken',
    v_state.reservation_id,
    0,
    'communication.en.phone-duration.v1',
    1,
    '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
    2522,
    'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
    pg_catalog.repeat('a', 64)
  );
  if v_claim->'created' is distinct from 'true'::pg_catalog.jsonb
    or v_reservation->'created' is distinct from 'true'::pg_catalog.jsonb
    or v_reservation->'dispatchAuthorized' is distinct from
      'true'::pg_catalog.jsonb
  then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_DISPATCH_FAILED';
  end if;
  update pg_temp.m1gh_valid_chain_state
  set claim_token = v_claim->>'claimToken';
end
$careslink_runner_terminal_valid_dispatch$;

reset role;
set local role careslink_v1_preview_receipt_executor;
do $careslink_runner_terminal_valid_receipt$
declare
  v_state pg_temp.m1gh_valid_chain_state%rowtype;
  v_statement pg_catalog.jsonb;
  v_result pg_catalog.jsonb;
  v_observed_at pg_catalog.text := pg_catalog.to_char(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
      at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
begin
  select * into strict v_state from pg_temp.m1gh_valid_chain_state;
  v_statement := pg_catalog.jsonb_build_object(
    'domain', 'careslink.communication-note.preview-dispatch-receipt',
    'version', 'receipt.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1',
    'authorizationDigest', v_state.authorization_digest,
    'claimId', v_state.claim_id,
    'runIdHash', v_state.authorization_statement->>'runIdHash',
    'reservationId', v_state.reservation_id,
    'slotIndex', 0,
    'fixtureId', 'communication.en.phone-duration.v1',
    'runOrdinal', 1,
    'requestBodySha256', '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
    'requestBodyUtf8ByteLength', 2522,
    'semanticCanonicalRequestSha256', 'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
    'clientRequestIdHmac', pg_catalog.repeat('a', 64),
    'outcome', 'COMPLETED',
    'transport', pg_catalog.jsonb_build_object(
      'httpStatus', 200,
      'openAiRequestIdHmac', pg_catalog.repeat('b', 64),
      'openAiResponseIdHmac', pg_catalog.repeat('c', 64)
    ),
    'usage', pg_catalog.jsonb_build_object(
      'source', 'PROVIDER',
      'inputTokens', 120,
      'outputTokens', 80,
      'totalTokens', 200,
      'cachedInputTokens', 20,
      'reasoningTokens', 10
    ),
    'calculatedCostUpperBoundMicroUsd', 481,
    'observedAt', v_observed_at,
    'noRetry', true,
    'authenticity', 'CARESLINK_SIGNED_INTERNAL_OBSERVATION',
    'providerAttestation', 'ABSENT',
    'transportScope', 'APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION',
    'notProofOf', pg_catalog.jsonb_build_array(
      'EXACT_PROVIDER_RECEIPT', 'BILLING', 'MODEL_EXECUTION', 'EXACTLY_ONCE'
    ),
    'signerKeyIdHash', pg_catalog.repeat('d', 64),
    'signerPublicKeySha256', pg_catalog.repeat('6', 64)
  );
  v_result := careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
    v_statement,
    pg_catalog.repeat('C', 86),
    pg_catalog.repeat('0', 63) || '7',
    v_state.claim_token
  );
  if v_result->'created' is distinct from 'true'::pg_catalog.jsonb
    or v_result->>'outcome' is distinct from 'COMPLETED'
  then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_RECEIPT_FAILED';
  end if;
  update pg_temp.m1gh_valid_chain_state
  set receipt_digest = v_result->>'receiptDigest';
end
$careslink_runner_terminal_valid_receipt$;

reset role;
revoke careslink_v1_preview_receipt_executor from current_user
  granted by current_user;
revoke careslink_v1_preview_dispatch_executor from current_user
  granted by current_user;
revoke careslink_v1_preview_authorization_executor from current_user
  granted by current_user;

do $careslink_runner_terminal_valid_setup_postcheck$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_authorizations) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_authorization_revocations) <> 0
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_claims) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_dispatch_reservations) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_dispatch_receipts) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_runner_terminals) <> 0
    or exists (
      (
        select
          membership.roleid,
          membership.member,
          membership.grantor,
          membership.admin_option,
          coalesce(
            (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
            false
          ),
          coalesce(
            (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
            false
          )
        from pg_catalog.pg_auth_members as membership
        where membership.member = current_user::pg_catalog.regrole
          and membership.roleid in (
            'careslink_v1_preview_authorization_executor'::pg_catalog.regrole,
            'careslink_v1_preview_dispatch_executor'::pg_catalog.regrole,
            'careslink_v1_preview_receipt_executor'::pg_catalog.regrole
          )
        except all
        select * from pg_temp.m1gh_valid_management_membership_snapshot
      )
      union all
      (
        select * from pg_temp.m1gh_valid_management_membership_snapshot
        except all
        select
          membership.roleid,
          membership.member,
          membership.grantor,
          membership.admin_option,
          coalesce(
            (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
            false
          ),
          coalesce(
            (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
            false
          )
        from pg_catalog.pg_auth_members as membership
        where membership.member = current_user::pg_catalog.regrole
          and membership.roleid in (
            'careslink_v1_preview_authorization_executor'::pg_catalog.regrole,
            'careslink_v1_preview_dispatch_executor'::pg_catalog.regrole,
            'careslink_v1_preview_receipt_executor'::pg_catalog.regrole
          )
      )
    )
  then
    raise exception 'RUNNER_TERMINAL_VALID_SETUP_POSTCHECK_FAILED';
  end if;
end
$careslink_runner_terminal_valid_setup_postcheck$;
