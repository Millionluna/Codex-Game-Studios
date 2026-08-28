-- Manual rollback-only assertions for a fresh disposable PostgreSQL 16+
-- database after every repository migration has been applied. Submit this
-- whole file as one psql request so BEGIN through ROLLBACK share the
-- transaction-only TEST_ONLY fixtures.
--
-- The fixtures contain only synthetic identifiers, hashes, counters and
-- timestamps. The 86-character strings model application-verified signature
-- envelopes for the database ingress contract; they are not real keys or
-- signatures. This file performs no HTTPS request, provider call, paid model
-- execution, deployment, hosted mutation or durable authorization.

\set ON_ERROR_STOP on

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

-- Prove the private durable posture before adding rollback-only SET-role
-- edges for the functional fixtures.
do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_owner oid := to_regrole('careslink_v1_generation_owner');
  v_role_name text;
  v_role_oid oid;
  v_table_name text;
  v_api_role text;
begin
  if current_setting('server_version_num')::integer < 160000 then
    raise exception
      'communication-note Preview authority assertions require PostgreSQL 16+';
  end if;

  if v_schema is null or v_owner is null then
    raise exception 'communication-note Preview authority schema/owner missing';
  end if;

  foreach v_role_name in array array[
    'careslink_v1_preview_authorization_executor',
    'careslink_v1_preview_dispatch_executor',
    'careslink_v1_preview_receipt_executor'
  ] loop
    v_role_oid := to_regrole(v_role_name);
    if v_role_oid is null or (
      select count(*)
      from pg_catalog.pg_roles as role
      where role.oid = v_role_oid
        and not role.rolcanlogin
        and not role.rolsuper
        and not role.rolcreatedb
        and not role.rolcreaterole
        and not role.rolinherit
        and not role.rolreplication
        and not role.rolbypassrls
    ) <> 1 then
      raise exception 'unsafe Preview executor role attributes: %', v_role_name;
    end if;
  end loop;

  foreach v_table_name in array array[
    'communication_note_preview_authorizations',
    'communication_note_preview_authorization_revocations',
    'communication_note_preview_claims',
    'communication_note_preview_dispatch_reservations',
    'communication_note_preview_dispatch_receipts'
  ] loop
    if (
      select count(*)
      from pg_catalog.pg_class as relation
      where relation.relnamespace = v_schema
        and relation.relname = v_table_name
        and relation.relkind = 'r'
        and relation.relowner = v_owner
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ) <> 1 then
      raise exception
        'Preview authority table owner/RLS posture drifted: %', v_table_name;
    end if;

    foreach v_api_role in array array[
      'anon', 'authenticated', 'service_role'
    ] loop
      if has_table_privilege(
          v_api_role,
          pg_catalog.format('careslink_v1_generation.%I', v_table_name),
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        ) or has_any_column_privilege(
          v_api_role,
          pg_catalog.format('careslink_v1_generation.%I', v_table_name),
          'SELECT, INSERT, UPDATE, REFERENCES'
        )
      then
        raise exception 'Data API table/column privilege leaked: % %',
          v_api_role, v_table_name;
      end if;
    end loop;
  end loop;

  foreach v_api_role in array array[
    'anon', 'authenticated', 'service_role'
  ] loop
    if has_schema_privilege(v_api_role, v_schema, 'USAGE')
      or has_schema_privilege(v_api_role, v_schema, 'CREATE')
    then
      raise exception 'Data API role can access Preview private schema: %',
        v_api_role;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_type as object_type
      where object_type.typnamespace = v_schema
        and object_type.typname like 'communication_note_preview_%'
        and has_type_privilege(v_api_role, object_type.oid, 'USAGE')
    ) then
      raise exception 'Data API Preview composite-type privilege leaked: %',
        v_api_role;
    end if;
  end loop;
end
$$;

-- Exact executor table and lock-only column ACLs. In particular, none of the
-- three callable identities receives DELETE or TRUNCATE, which would bypass a
-- row-level UPDATE/DELETE guard.
do $$
begin
  if exists (
    with expected(role_name, table_name, privilege_type, is_grantable) as (
      values
        ('careslink_v1_preview_authorization_executor',
          'communication_note_preview_authorizations', 'INSERT', false),
        ('careslink_v1_preview_authorization_executor',
          'communication_note_preview_authorizations', 'SELECT', false),
        ('careslink_v1_preview_authorization_executor',
          'communication_note_preview_authorization_revocations', 'INSERT', false),
        ('careslink_v1_preview_authorization_executor',
          'communication_note_preview_authorization_revocations', 'SELECT', false),
        ('careslink_v1_preview_authorization_executor',
          'communication_note_preview_claims', 'SELECT', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_authorizations', 'SELECT', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_authorization_revocations', 'SELECT', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_claims', 'INSERT', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_claims', 'SELECT', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_dispatch_reservations', 'INSERT', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_dispatch_reservations', 'SELECT', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_dispatch_receipts', 'SELECT', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_authorizations', 'SELECT', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_authorization_revocations', 'SELECT', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_claims', 'SELECT', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_dispatch_reservations', 'SELECT', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_dispatch_receipts', 'INSERT', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_dispatch_receipts', 'SELECT', false)
    ),
    actual(role_name, table_name, privilege_type, is_grantable) as (
      select
        grantee.rolname::text,
        relation.relname::text,
        acl.privilege_type,
        acl.is_grantable
      from pg_catalog.pg_class as relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) as acl
      join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
      where relation.relnamespace =
          'careslink_v1_generation'::regnamespace
        and relation.relname in (
          'communication_note_preview_authorizations',
          'communication_note_preview_authorization_revocations',
          'communication_note_preview_claims',
          'communication_note_preview_dispatch_reservations',
          'communication_note_preview_dispatch_receipts'
        )
        and grantee.rolname in (
          'careslink_v1_preview_authorization_executor',
          'careslink_v1_preview_dispatch_executor',
          'careslink_v1_preview_receipt_executor'
        )
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Preview executor direct table ACL drifted';
  end if;

  if exists (
    with expected(
      role_name,
      table_name,
      column_name,
      privilege_type,
      is_grantable
    ) as (
      values
        ('careslink_v1_preview_authorization_executor',
          'communication_note_preview_authorizations',
          'authorization_digest', 'UPDATE', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_authorizations',
          'authorization_digest', 'UPDATE', false),
        ('careslink_v1_preview_dispatch_executor',
          'communication_note_preview_claims',
          'claim_id', 'UPDATE', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_authorizations',
          'authorization_digest', 'UPDATE', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_claims',
          'claim_id', 'UPDATE', false),
        ('careslink_v1_preview_receipt_executor',
          'communication_note_preview_dispatch_reservations',
          'reservation_id', 'UPDATE', false)
    ),
    actual(
      role_name,
      table_name,
      column_name,
      privilege_type,
      is_grantable
    ) as (
      select
        grantee.rolname::text,
        relation.relname::text,
        attribute.attname::text,
        acl.privilege_type,
        acl.is_grantable
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = relation.oid
      cross join lateral pg_catalog.aclexplode(attribute.attacl) as acl
      join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
      where relation.relnamespace =
          'careslink_v1_generation'::regnamespace
        and relation.relname in (
          'communication_note_preview_authorizations',
          'communication_note_preview_authorization_revocations',
          'communication_note_preview_claims',
          'communication_note_preview_dispatch_reservations',
          'communication_note_preview_dispatch_receipts'
        )
        and attribute.attnum > 0
        and not attribute.attisdropped
        and grantee.rolname in (
          'careslink_v1_preview_authorization_executor',
          'careslink_v1_preview_dispatch_executor',
          'careslink_v1_preview_receipt_executor'
        )
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Preview executor direct column ACL drifted';
  end if;
end
$$;

-- Each ledger has one enabled BEFORE ROW UPDATE/DELETE trigger routed to the
-- same inaccessible immutable-ledger guard.
do $$
declare
  v_guard oid := to_regprocedure(
    'careslink_v1_generation._deny_communication_note_preview_ledger_mutation()'
  );
begin
  if v_guard is null then
    raise exception 'Preview append-only guard is missing';
  end if;

  if exists (
    with expected(table_name, trigger_name) as (
      values
        (
          'communication_note_preview_authorizations',
          'communication_note_preview_authorizations_append_only'
        ),
        (
          'communication_note_preview_authorization_revocations',
          'comm_preview_authorization_revocations_append_only'
        ),
        (
          'communication_note_preview_claims',
          'communication_note_preview_claims_append_only'
        ),
        (
          'communication_note_preview_dispatch_reservations',
          'communication_note_preview_dispatch_reservations_append_only'
        ),
        (
          'communication_note_preview_dispatch_receipts',
          'communication_note_preview_dispatch_receipts_append_only'
        )
    ),
    actual(table_name, trigger_name) as (
      select relation.relname::text, trigger_metadata.tgname::text
      from pg_catalog.pg_trigger as trigger_metadata
      join pg_catalog.pg_class as relation
        on relation.oid = trigger_metadata.tgrelid
      where relation.relnamespace =
          'careslink_v1_generation'::regnamespace
        and relation.relname in (
          'communication_note_preview_authorizations',
          'communication_note_preview_authorization_revocations',
          'communication_note_preview_claims',
          'communication_note_preview_dispatch_reservations',
          'communication_note_preview_dispatch_receipts'
        )
        and not trigger_metadata.tgisinternal
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Preview append-only trigger identity set drifted';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger as trigger_metadata
    join pg_catalog.pg_class as relation
      on relation.oid = trigger_metadata.tgrelid
    where relation.relnamespace =
        'careslink_v1_generation'::regnamespace
      and relation.relname in (
        'communication_note_preview_authorizations',
        'communication_note_preview_authorization_revocations',
        'communication_note_preview_claims',
        'communication_note_preview_dispatch_reservations',
        'communication_note_preview_dispatch_receipts'
      )
      and not trigger_metadata.tgisinternal
      and (
        trigger_metadata.tgenabled <> 'O'
        or trigger_metadata.tgtype <> 27
        or trigger_metadata.tgfoid <> v_guard
      )
  ) then
    raise exception 'Preview append-only trigger posture drifted';
  end if;
end
$$;

-- Cross-row provider correlation HMACs are unique only when observed. Lock the
-- exact btree key and partial predicate for both indexes.
do $$
declare
  v_entry record;
begin
  for v_entry in
    select *
    from (
      values
        (
          'communication_note_preview_receipts_openai_request_hmac_idx',
          'openai_request_id_hmac'
        ),
        (
          'communication_note_preview_receipts_openai_response_hmac_idx',
          'openai_response_id_hmac'
        )
    ) as expected(index_name, column_name)
  loop
    if (
      select count(*)
      from pg_catalog.pg_index as index_metadata
      join pg_catalog.pg_class as index_relation
        on index_relation.oid = index_metadata.indexrelid
      join pg_catalog.pg_am as access_method
        on access_method.oid = index_relation.relam
      where index_metadata.indrelid =
          'careslink_v1_generation.communication_note_preview_dispatch_receipts'::regclass
        and index_relation.relnamespace =
          'careslink_v1_generation'::regnamespace
        and index_relation.relname = v_entry.index_name
        and index_relation.relowner =
          'careslink_v1_generation_owner'::regrole
        and access_method.amname = 'btree'
        and index_metadata.indisvalid
        and index_metadata.indisready
        and index_metadata.indisunique
        and not index_metadata.indisprimary
        and index_metadata.indnkeyatts = 1
        and index_metadata.indnatts = 1
        and index_metadata.indkey[0] = (
          select attribute.attnum
          from pg_catalog.pg_attribute as attribute
          where attribute.attrelid = index_metadata.indrelid
            and attribute.attname = v_entry.column_name
            and not attribute.attisdropped
        )
        and index_metadata.indexprs is null
        and pg_catalog.pg_get_expr(
          index_metadata.indpred,
          index_metadata.indrelid
        ) = pg_catalog.format('(%I IS NOT NULL)', v_entry.column_name)
    ) <> 1 then
      raise exception 'Preview receipt HMAC partial index drifted: %',
        v_entry.index_name;
    end if;
  end loop;
end
$$;

-- Exact private RPC identities, owners, SECURITY DEFINER search paths and sole
-- execution grantees. No public wrapper or Data API execution surface exists.
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
  v_entry record;
  v_actual_arguments text;
  v_grantees text[];
  v_expected_grantees text[];
  v_denied_role text;
begin
  if (
    select count(*)
    from pg_catalog.pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname in (
        'persist_verified_communication_note_preview_authorization',
        'revoke_communication_note_preview_authorization',
        'claim_communication_note_preview_authorization',
        'reserve_communication_note_preview_dispatch',
        'persist_verified_communication_note_preview_dispatch_receipt'
      )
  ) <> 5 then
    raise exception 'Preview authority RPC identity set drifted';
  end if;

  for v_entry in
    select *
    from (
      values
        (
          'persist_verified_communication_note_preview_authorization',
          'p_statement jsonb, p_signature_base64url text, p_verifier_identity_hmac text',
          'careslink_v1_preview_authorization_executor',
          'careslink_v1_preview_authorization_registration_caller'
        ),
        (
          'revoke_communication_note_preview_authorization',
          'p_authorization_digest text, p_revocation_id uuid, p_reason_code text, p_evidence_sha256 text, p_verifier_identity_hmac text',
          'careslink_v1_preview_authorization_executor',
          'careslink_v1_preview_authorization_revocation_caller'
        ),
        (
          'claim_communication_note_preview_authorization',
          'p_authorization_digest text, p_claim_id uuid, p_run_id_hash text, p_executor_identity_hmac text, p_authority_policy_digest text, p_request_body_pin_bundle_digest text, p_runner_policy_digest text',
          'careslink_v1_preview_dispatch_executor',
          'careslink_v1_preview_dispatch_caller'
        ),
        (
          'reserve_communication_note_preview_dispatch',
          'p_claim_id uuid, p_claim_token text, p_reservation_id uuid, p_slot_index integer, p_fixture_id text, p_run_ordinal integer, p_request_body_sha256 text, p_request_body_utf8_byte_length integer, p_semantic_canonical_request_sha256 text, p_client_request_id_hmac text',
          'careslink_v1_preview_dispatch_executor',
          'careslink_v1_preview_dispatch_caller'
        ),
        (
          'persist_verified_communication_note_preview_dispatch_receipt',
          'p_statement jsonb, p_signature_base64url text, p_verifier_identity_hmac text, p_claim_token text',
          'careslink_v1_preview_receipt_executor',
          'careslink_v1_preview_receipt_caller'
        )
    ) as expected(
      function_name,
      identity_arguments,
      owner_name,
      caller_name
    )
  loop
    select pg_catalog.pg_get_function_identity_arguments(procedure.oid)
    into v_actual_arguments
    from pg_catalog.pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname = v_entry.function_name;

    if v_actual_arguments is distinct from v_entry.identity_arguments then
      raise exception 'Preview RPC signature drifted: % => %',
        v_entry.function_name, v_actual_arguments;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_schema
        and procedure.proname = v_entry.function_name
        and (
          procedure.prokind <> 'f'
          or procedure.prorettype <> 'jsonb'::regtype
          or procedure.provolatile <> 'v'
          or not procedure.prosecdef
          or procedure.proowner <> pg_catalog.to_regrole(v_entry.owner_name)
          or procedure.proconfig is null
          or pg_catalog.cardinality(procedure.proconfig) <> 1
          or procedure.proconfig[1] is null
          or procedure.proconfig[1] not in ('search_path=', 'search_path=""')
        )
    ) then
      raise exception 'Preview RPC definer posture drifted: %',
        v_entry.function_name;
    end if;

    select pg_catalog.array_agg(
      case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
      order by case
        when acl.grantee = 0 then 'PUBLIC'
        else grantee.rolname
      end
    )
    into v_grantees
    from pg_catalog.pg_proc as procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) as acl
    left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
    where procedure.pronamespace = v_schema
      and procedure.proname = v_entry.function_name
      and acl.privilege_type = 'EXECUTE';

    select pg_catalog.array_agg(grantee_name order by grantee_name)
    into v_expected_grantees
    from pg_catalog.unnest(
      array[v_entry.owner_name, v_entry.caller_name]::text[]
    ) as expected_grantee(grantee_name);

    if v_grantees is distinct from v_expected_grantees then
      raise exception 'Preview RPC execute ACL drifted: % => %',
        v_entry.function_name, v_grantees;
    end if;
  end loop;

  foreach v_denied_role in array array[
    'anon', 'authenticated', 'service_role'
  ] loop
    if has_function_privilege(
        v_denied_role,
        'careslink_v1_generation.persist_verified_communication_note_preview_authorization(jsonb,text,text)',
        'EXECUTE'
      ) or has_function_privilege(
        v_denied_role,
        'careslink_v1_generation.revoke_communication_note_preview_authorization(text,uuid,text,text,text)',
        'EXECUTE'
      ) or has_function_privilege(
        v_denied_role,
        'careslink_v1_generation.claim_communication_note_preview_authorization(text,uuid,text,text,text,text,text)',
        'EXECUTE'
      ) or has_function_privilege(
        v_denied_role,
        'careslink_v1_generation.reserve_communication_note_preview_dispatch(uuid,text,uuid,integer,text,integer,text,integer,text,text)',
        'EXECUTE'
      ) or has_function_privilege(
        v_denied_role,
        'careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(jsonb,text,text,text)',
        'EXECUTE'
      )
    then
      raise exception 'Data API role can execute Preview authority RPC: %',
        v_denied_role;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.pronamespace = 'public'::regnamespace
      and procedure.proname in (
        'persist_verified_communication_note_preview_authorization',
        'revoke_communication_note_preview_authorization',
        'claim_communication_note_preview_authorization',
        'reserve_communication_note_preview_dispatch',
        'persist_verified_communication_note_preview_dispatch_receipt'
      )
  ) then
    raise exception 'public Preview authority RPC wrapper unexpectedly exists';
  end if;
end
$$;

-- Assertion-only PostgreSQL-16 SET edges. They are explicitly revoked below
-- and the outer transaction also rolls them back.
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

-- The receipt executor has read access to all five ledgers. The fixture uses
-- only its one receipt RPC for mutation.
set local role careslink_v1_preview_receipt_executor;

do $$
declare
  v_table_name text;
  v_count bigint;
begin
  foreach v_table_name in array array[
    'communication_note_preview_authorizations',
    'communication_note_preview_authorization_revocations',
    'communication_note_preview_claims',
    'communication_note_preview_dispatch_reservations',
    'communication_note_preview_dispatch_receipts'
  ] loop
    execute pg_catalog.format(
      'select count(*) from careslink_v1_generation.%I',
      v_table_name
    ) into v_count;
    if v_count <> 0 then
      raise exception 'Preview authority ledger is not empty by default: %',
        v_table_name;
    end if;
  end loop;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

create temporary table communication_note_preview_assertion_state (
  scenario text primary key,
  statement jsonb not null,
  authorization_digest text not null,
  claim_id uuid,
  claim_token text,
  reservation_id uuid,
  client_request_id_hmac text,
  receipt_statement jsonb,
  receipt_digest text
) on commit drop;

grant select, insert on communication_note_preview_assertion_state
  to careslink_v1_preview_authorization_executor;
grant select, update on communication_note_preview_assertion_state
  to careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor;

-- Persist two externally-verified synthetic metadata envelopes. One drives a
-- completed dispatch; the other proves claim-then-revoke dispatch denial.
set local role careslink_v1_preview_authorization_executor;

do $$
declare
  v_now timestamptz := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  v_statement jsonb;
  v_invalid_statement jsonb;
  v_created jsonb;
  v_replay jsonb;
  v_scenario text;
  v_authorization_id uuid;
  v_nonce_hash text;
  v_run_id_hash text;
  v_signer_key_id_hash text;
  v_signer_public_key_sha256 text;
  v_signature text;
  v_evidence_key text;
  v_message text;
  v_rejected boolean;
  v_null_rejected boolean := false;
  v_array_rejected boolean := false;
begin
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_authorization(
        null::jsonb,
        pg_catalog.repeat('Z', 86),
        pg_catalog.repeat('f', 64)
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_null_rejected := v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_authorization(
        '[]'::jsonb,
        pg_catalog.repeat('Z', 86),
        pg_catalog.repeat('f', 64)
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_array_rejected := v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  if not v_null_rejected or not v_array_rejected or exists (
    select 1
    from careslink_v1_generation.communication_note_preview_authorizations
  ) then
    raise exception 'invalid Preview authorization JSON was accepted';
  end if;

  foreach v_scenario in array array['dispatch', 'revocation'] loop
    if v_scenario = 'dispatch' then
      v_authorization_id := 'f1000000-0000-4000-8000-000000000001';
      v_nonce_hash := pg_catalog.repeat('1', 64);
      v_run_id_hash := pg_catalog.repeat('4', 64);
      v_signer_key_id_hash := pg_catalog.repeat('5', 64);
      v_signer_public_key_sha256 := pg_catalog.repeat('6', 64);
      v_signature := pg_catalog.repeat('A', 86);
    else
      v_authorization_id := 'f1000000-0000-4000-8000-000000000002';
      v_nonce_hash := pg_catalog.repeat('0', 64);
      v_run_id_hash := pg_catalog.repeat('3', 64);
      v_signer_key_id_hash := pg_catalog.repeat('d', 64);
      v_signer_public_key_sha256 := pg_catalog.repeat('e', 64);
      v_signature := pg_catalog.repeat('B', 86);
    end if;

    v_statement := pg_catalog.jsonb_build_object(
      'domain', 'careslink.communication-note.preview-authorization',
      'version',
        'authorization.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1',
      'authorizationId', v_authorization_id,
      'authorizationNonceHash', v_nonce_hash,
      'ownerSubjectHmac', pg_catalog.repeat('2', 64),
      'tenantScopeHmac', pg_catalog.repeat('3', 64),
      'runIdHash', v_run_id_hash,
      'signerKeyIdHash', v_signer_key_id_hash,
      'signerPublicKeySha256', v_signer_public_key_sha256,
      'issuedAt', pg_catalog.to_char(
        (v_now - interval '1 minute') at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'notBefore', pg_catalog.to_char(
        (v_now - interval '1 minute') at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'expiresAt', pg_catalog.to_char(
        (v_now + interval '10 minutes') at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'sourceBindings',
        careslink_v1_generation._communication_note_preview_expected_source_bindings(),
      'environmentEvidence', pg_catalog.jsonb_build_object(
        'openAiProjectIdHmac', pg_catalog.repeat('7', 64),
        'australiaProjectConfigurationSha256', pg_catalog.repeat('8', 64),
        'zeroDataRetentionConfigurationSha256', pg_catalog.repeat('9', 64),
        'modifiedRetentionAmendmentSha256', pg_catalog.repeat('a', 64),
        'ownerProcessingAcknowledgementSha256', pg_catalog.repeat('b', 64),
        'pricingAndModelAvailabilitySha256', pg_catalog.repeat('c', 64),
        'providerSpendLimitSha256', pg_catalog.repeat('d', 64),
        'temporaryCredentialReferenceSha256', pg_catalog.repeat('e', 64)
      ),
      'budget',
        careslink_v1_generation._communication_note_preview_expected_budget(),
      'input', pg_catalog.jsonb_build_object(
        'classification',
          'SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY',
        'realCareDataAllowed', false
      ),
      'slots',
        careslink_v1_generation._communication_note_preview_expected_slots()
    );

    if v_scenario = 'dispatch' then
      foreach v_evidence_key in array array[
        'australiaProjectConfigurationSha256',
        'zeroDataRetentionConfigurationSha256',
        'modifiedRetentionAmendmentSha256',
        'ownerProcessingAcknowledgementSha256',
        'pricingAndModelAvailabilitySha256',
        'providerSpendLimitSha256',
        'temporaryCredentialReferenceSha256'
      ] loop
        v_invalid_statement := pg_catalog.jsonb_set(
          v_statement,
          array['environmentEvidence', v_evidence_key]::text[],
          'null'::jsonb,
          false
        );
        v_rejected := false;
        begin
          perform
            careslink_v1_generation.persist_verified_communication_note_preview_authorization(
              v_invalid_statement,
              v_signature,
              pg_catalog.repeat('f', 64)
            );
          raise exception using
            errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
        exception when others then
          get stacked diagnostics v_message = message_text;
          v_rejected := v_message <> 'ASSERTION_EXPECTED_REJECTION';
        end;

        if not v_rejected then
          raise exception
            'null Preview environment evidence was accepted: %',
            v_evidence_key;
        end if;
      end loop;
    end if;

    v_created :=
      careslink_v1_generation.persist_verified_communication_note_preview_authorization(
        v_statement,
        v_signature,
        pg_catalog.repeat('f', 64)
      );

    if v_created->'created' is distinct from 'true'::jsonb
      or v_created->'authorizationRegistered' is distinct from 'true'::jsonb
      or v_created->'executionAuthorized' is distinct from 'false'::jsonb
      or v_created->>'authorizationDigest' !~ '^[a-f0-9]{64}$'
    then
      raise exception 'Preview authorization create acknowledgement drifted: %',
        v_created;
    end if;

    v_replay :=
      careslink_v1_generation.persist_verified_communication_note_preview_authorization(
        v_statement,
        v_signature,
        pg_catalog.repeat('f', 64)
      );

    if v_replay->'created' is distinct from 'false'::jsonb
      or v_replay->'authorizationRegistered' is distinct from 'true'::jsonb
      or v_replay->'executionAuthorized' is distinct from 'false'::jsonb
      or v_replay->>'authorizationDigest' is distinct from
        v_created->>'authorizationDigest'
    then
      raise exception 'Preview authorization replay drifted: %', v_replay;
    end if;

    insert into pg_temp.communication_note_preview_assertion_state (
      scenario,
      statement,
      authorization_digest
    ) values (
      v_scenario,
      v_statement,
      v_created->>'authorizationDigest'
    );
  end loop;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The token and dispatch permission exist only on the first acknowledgement.
-- Exact replays are content-free acknowledgements with no new authority.
set local role careslink_v1_preview_dispatch_executor;

do $$
declare
  v_state pg_temp.communication_note_preview_assertion_state%rowtype;
  v_claim jsonb;
  v_claim_replay jsonb;
  v_reservation jsonb;
  v_reservation_replay jsonb;
  v_claim_id constant uuid :=
    'f2000000-0000-4000-8000-000000000001';
  v_reservation_id constant uuid :=
    'f3000000-0000-4000-8000-000000000001';
  v_client_request_id_hmac constant text := pg_catalog.repeat('a', 64);
begin
  select state.*
  into v_state
  from pg_temp.communication_note_preview_assertion_state as state
  where state.scenario = 'dispatch';

  v_claim :=
    careslink_v1_generation.claim_communication_note_preview_authorization(
      v_state.authorization_digest,
      v_claim_id,
      v_state.statement->>'runIdHash',
      pg_catalog.repeat('8', 64),
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8',
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
    );

  if v_claim->'created' is distinct from 'true'::jsonb
    or v_claim->'executionAuthorized' is distinct from 'true'::jsonb
    or v_claim->>'claimId' is distinct from v_claim_id::text
    or v_claim->>'claimToken' !~ '^[a-f0-9]{64}$'
    or v_claim->>'status' is distinct from 'CLAIMED'
  then
    raise exception 'Preview claim acknowledgement drifted: %', v_claim;
  end if;

  v_claim_replay :=
    careslink_v1_generation.claim_communication_note_preview_authorization(
      v_state.authorization_digest,
      v_claim_id,
      v_state.statement->>'runIdHash',
      pg_catalog.repeat('8', 64),
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8',
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
    );

  if v_claim_replay->'created' is distinct from 'false'::jsonb
    or v_claim_replay->'executionAuthorized' is distinct from 'false'::jsonb
    or v_claim_replay->>'claimId' is distinct from v_claim_id::text
    or v_claim_replay->'claimToken' is distinct from 'null'::jsonb
    or v_claim_replay->>'status' is distinct from 'ALREADY_CLAIMED'
  then
    raise exception 'Preview claim replay leaked authority: %', v_claim_replay;
  end if;

  update pg_temp.communication_note_preview_assertion_state
  set claim_id = v_claim_id,
      claim_token = v_claim->>'claimToken'
  where scenario = 'dispatch';

  v_reservation :=
    careslink_v1_generation.reserve_communication_note_preview_dispatch(
      v_claim_id,
      v_claim->>'claimToken',
      v_reservation_id,
      0,
      'communication.en.phone-duration.v1',
      1,
      '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
      2522,
      'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
      v_client_request_id_hmac
    );

  if v_reservation->'created' is distinct from 'true'::jsonb
    or v_reservation->'dispatchAuthorized' is distinct from 'true'::jsonb
    or v_reservation->>'reservationId' is distinct from
      v_reservation_id::text
    or v_reservation->>'slotIndex' is distinct from '0'
    or v_reservation->>'status' is distinct from
      'RESERVED_BEFORE_TRANSPORT'
  then
    raise exception 'Preview reservation acknowledgement drifted: %',
      v_reservation;
  end if;

  v_reservation_replay :=
    careslink_v1_generation.reserve_communication_note_preview_dispatch(
      v_claim_id,
      v_claim->>'claimToken',
      v_reservation_id,
      0,
      'communication.en.phone-duration.v1',
      1,
      '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
      2522,
      'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
      v_client_request_id_hmac
    );

  if v_reservation_replay->'created' is distinct from 'false'::jsonb
    or v_reservation_replay->'dispatchAuthorized' is distinct from
      'false'::jsonb
    or v_reservation_replay->>'reservationId' is distinct from
      v_reservation_id::text
    or v_reservation_replay->>'status' is distinct from 'ALREADY_RESERVED'
  then
    raise exception 'Preview reservation replay leaked authority: %',
      v_reservation_replay;
  end if;

  update pg_temp.communication_note_preview_assertion_state
  set reservation_id = v_reservation_id,
      client_request_id_hmac = v_client_request_id_hmac
  where scenario = 'dispatch';
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Persist one synthetic COMPLETED observation. The distinct client request,
-- OpenAI x-request-id and Responses resource ID values are HMACs only, and the
-- envelope explicitly carries providerAttestation=ABSENT.
set local role careslink_v1_preview_receipt_executor;

do $$
declare
  v_state pg_temp.communication_note_preview_assertion_state%rowtype;
  v_statement jsonb;
  v_invalid_statement jsonb;
  v_created jsonb;
  v_replay jsonb;
  v_message text;
  v_usage_key text;
  v_hmac_collision_case text;
  v_rejected boolean;
  v_null_rejected boolean := false;
  v_array_rejected boolean := false;
  v_string_numeric_rejected boolean := false;
  v_null_usage_fields_rejected boolean := true;
  v_completed_http_null_rejected boolean := false;
  v_completed_cost_null_rejected boolean := false;
  v_cost_mismatch_rejected boolean := false;
  v_hmac_collisions_rejected boolean := true;
  v_http_error_null_status_rejected boolean := false;
  v_local_abort_null_cost_rejected boolean := false;
  v_observed_at timestamptz := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
begin
  select state.*
  into v_state
  from pg_temp.communication_note_preview_assertion_state as state
  where state.scenario = 'dispatch';

  v_statement := pg_catalog.jsonb_build_object(
    'domain', 'careslink.communication-note.preview-dispatch-receipt',
    'version',
      'receipt.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1',
    'authorizationDigest', v_state.authorization_digest,
    'claimId', v_state.claim_id,
    'runIdHash', v_state.statement->>'runIdHash',
    'reservationId', v_state.reservation_id,
    'slotIndex', 0,
    'fixtureId', 'communication.en.phone-duration.v1',
    'runOrdinal', 1,
    'requestBodySha256',
      '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
    'requestBodyUtf8ByteLength', 2522,
    'semanticCanonicalRequestSha256',
      'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
    'clientRequestIdHmac', v_state.client_request_id_hmac,
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
    'observedAt', pg_catalog.to_char(
      v_observed_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'noRetry', true,
    'authenticity', 'CARESLINK_SIGNED_INTERNAL_OBSERVATION',
    'providerAttestation', 'ABSENT',
    'transportScope',
      'APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION',
    'notProofOf', pg_catalog.jsonb_build_array(
      'EXACT_PROVIDER_RECEIPT',
      'BILLING',
      'MODEL_EXECUTION',
      'EXACTLY_ONCE'
    ),
    'signerKeyIdHash', pg_catalog.repeat('d', 64),
    'signerPublicKeySha256', pg_catalog.repeat('e', 64)
  );

  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        null::jsonb,
        pg_catalog.repeat('C', 86),
        pg_catalog.repeat('f', 64),
        v_state.claim_token
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_null_rejected := v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        '[]'::jsonb,
        pg_catalog.repeat('C', 86),
        pg_catalog.repeat('f', 64),
        v_state.claim_token
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_array_rejected := v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  v_invalid_statement := pg_catalog.jsonb_set(
    v_statement,
    array['usage', 'inputTokens']::text[],
    pg_catalog.to_jsonb('120'::text),
    false
  );
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        v_invalid_statement,
        pg_catalog.repeat('C', 86),
        pg_catalog.repeat('f', 64),
        v_state.claim_token
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_string_numeric_rejected :=
      v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  foreach v_usage_key in array array[
    'inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens'
  ] loop
    v_invalid_statement := pg_catalog.jsonb_set(
      v_statement,
      array['usage', v_usage_key]::text[],
      'null'::jsonb,
      false
    );
    v_rejected := false;
    begin
      perform
        careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
          v_invalid_statement,
          pg_catalog.repeat('C', 86),
          pg_catalog.repeat('f', 64),
          v_state.claim_token
        );
      raise exception using
        errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
    exception when others then
      get stacked diagnostics v_message = message_text;
      v_rejected := v_message <> 'ASSERTION_EXPECTED_REJECTION';
    end;
    if not v_rejected then
      v_null_usage_fields_rejected := false;
    end if;
  end loop;

  v_invalid_statement := pg_catalog.jsonb_set(
    v_statement,
    array['transport', 'httpStatus']::text[],
    'null'::jsonb,
    false
  );
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        v_invalid_statement,
        pg_catalog.repeat('C', 86),
        pg_catalog.repeat('f', 64),
        v_state.claim_token
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_completed_http_null_rejected :=
      v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  v_invalid_statement := pg_catalog.jsonb_set(
    v_statement,
    array['calculatedCostUpperBoundMicroUsd']::text[],
    'null'::jsonb,
    false
  );
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        v_invalid_statement,
        pg_catalog.repeat('C', 86),
        pg_catalog.repeat('f', 64),
        v_state.claim_token
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_completed_cost_null_rejected :=
      v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  v_invalid_statement := pg_catalog.jsonb_set(
    v_statement,
    array['calculatedCostUpperBoundMicroUsd']::text[],
    '482'::jsonb,
    false
  );
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        v_invalid_statement,
        pg_catalog.repeat('C', 86),
        pg_catalog.repeat('f', 64),
        v_state.claim_token
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_cost_mismatch_rejected :=
      v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  foreach v_hmac_collision_case in array array[
    'request-client', 'response-client', 'request-response'
  ] loop
    if v_hmac_collision_case = 'request-client' then
      v_invalid_statement := pg_catalog.jsonb_set(
        v_statement,
        array['transport', 'openAiRequestIdHmac']::text[],
        pg_catalog.to_jsonb(v_state.client_request_id_hmac),
        false
      );
    elsif v_hmac_collision_case = 'response-client' then
      v_invalid_statement := pg_catalog.jsonb_set(
        v_statement,
        array['transport', 'openAiResponseIdHmac']::text[],
        pg_catalog.to_jsonb(v_state.client_request_id_hmac),
        false
      );
    else
      v_invalid_statement := pg_catalog.jsonb_set(
        v_statement,
        array['transport', 'openAiResponseIdHmac']::text[],
        pg_catalog.to_jsonb(pg_catalog.repeat('b', 64)),
        false
      );
    end if;

    v_rejected := false;
    begin
      perform
        careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
          v_invalid_statement,
          pg_catalog.repeat('C', 86),
          pg_catalog.repeat('f', 64),
          v_state.claim_token
        );
      raise exception using
        errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
    exception when others then
      get stacked diagnostics v_message = message_text;
      v_rejected := v_message <> 'ASSERTION_EXPECTED_REJECTION';
    end;
    if not v_rejected then
      v_hmac_collisions_rejected := false;
    end if;
  end loop;

  v_invalid_statement := v_statement || pg_catalog.jsonb_build_object(
    'outcome', 'PROVIDER_HTTP_ERROR',
    'transport', pg_catalog.jsonb_build_object(
      'httpStatus', null,
      'openAiRequestIdHmac', pg_catalog.repeat('b', 64),
      'openAiResponseIdHmac', null
    ),
    'usage', null,
    'calculatedCostUpperBoundMicroUsd', null
  );
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        v_invalid_statement,
        pg_catalog.repeat('C', 86),
        pg_catalog.repeat('f', 64),
        v_state.claim_token
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_http_error_null_status_rejected :=
      v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  v_invalid_statement := v_statement || pg_catalog.jsonb_build_object(
    'outcome', 'LOCAL_PRE_DISPATCH_ABORTED',
    'transport', pg_catalog.jsonb_build_object(
      'httpStatus', null,
      'openAiRequestIdHmac', null,
      'openAiResponseIdHmac', null
    ),
    'usage', null,
    'calculatedCostUpperBoundMicroUsd', null
  );
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        v_invalid_statement,
        pg_catalog.repeat('C', 86),
        pg_catalog.repeat('f', 64),
        v_state.claim_token
      );
    raise exception using
      errcode = 'P0001', message = 'ASSERTION_EXPECTED_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_local_abort_null_cost_rejected :=
      v_message <> 'ASSERTION_EXPECTED_REJECTION';
  end;

  if not v_null_rejected
    or not v_array_rejected
    or not v_string_numeric_rejected
    or not v_null_usage_fields_rejected
    or not v_completed_http_null_rejected
    or not v_completed_cost_null_rejected
    or not v_cost_mismatch_rejected
    or not v_hmac_collisions_rejected
    or not v_http_error_null_status_rejected
    or not v_local_abort_null_cost_rejected
    or exists (
      select 1
      from careslink_v1_generation.communication_note_preview_dispatch_receipts
      where reservation_id = v_state.reservation_id
    )
  then
    raise exception
      'invalid Preview receipt JSON/cost/HMAC boundary was accepted';
  end if;

  v_created :=
    careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
      v_statement,
      pg_catalog.repeat('C', 86),
      pg_catalog.repeat('f', 64),
      v_state.claim_token
    );

  if v_created->'created' is distinct from 'true'::jsonb
    or v_created->'receiptRecorded' is distinct from 'true'::jsonb
    or v_created->'dispatchAuthorized' is distinct from 'false'::jsonb
    or v_created->>'receiptDigest' !~ '^[a-f0-9]{64}$'
    or v_created->>'outcome' is distinct from 'COMPLETED'
    or v_created->>'providerAttestation' is distinct from 'ABSENT'
  then
    raise exception 'Preview receipt acknowledgement drifted: %', v_created;
  end if;

  v_replay :=
    careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
      v_statement,
      pg_catalog.repeat('C', 86),
      pg_catalog.repeat('f', 64),
      v_state.claim_token
    );

  if v_replay->'created' is distinct from 'false'::jsonb
    or v_replay->'receiptRecorded' is distinct from 'true'::jsonb
    or v_replay->'dispatchAuthorized' is distinct from 'false'::jsonb
    or v_replay->>'receiptDigest' is distinct from
      v_created->>'receiptDigest'
    or v_replay->>'outcome' is distinct from 'COMPLETED'
    or v_replay ? 'providerAttestation'
  then
    raise exception 'Preview receipt replay leaked authority: %', v_replay;
  end if;

  update pg_temp.communication_note_preview_assertion_state
  set receipt_statement = v_statement,
      receipt_digest = v_created->>'receiptDigest'
  where scenario = 'dispatch';
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Claim the second envelope without reserving transport. Revocation must stay
-- available after claim so an owner/security hold can stop future dispatch.
set local role careslink_v1_preview_dispatch_executor;

do $$
declare
  v_state pg_temp.communication_note_preview_assertion_state%rowtype;
  v_created jsonb;
  v_replay jsonb;
  v_claim_id constant uuid :=
    'f2000000-0000-4000-8000-000000000002';
begin
  select state.*
  into v_state
  from pg_temp.communication_note_preview_assertion_state as state
  where state.scenario = 'revocation';

  v_created :=
    careslink_v1_generation.claim_communication_note_preview_authorization(
      v_state.authorization_digest,
      v_claim_id,
      v_state.statement->>'runIdHash',
      pg_catalog.repeat('9', 64),
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8',
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
    );

  if v_created->'created' is distinct from 'true'::jsonb
    or v_created->'executionAuthorized' is distinct from 'true'::jsonb
    or v_created->>'claimId' is distinct from v_claim_id::text
    or v_created->>'claimToken' !~ '^[a-f0-9]{64}$'
    or v_created->>'status' is distinct from 'CLAIMED'
  then
    raise exception 'revocation-path Preview claim drifted: %', v_created;
  end if;

  v_replay :=
    careslink_v1_generation.claim_communication_note_preview_authorization(
      v_state.authorization_digest,
      v_claim_id,
      v_state.statement->>'runIdHash',
      pg_catalog.repeat('9', 64),
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8',
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'
    );

  if v_replay->'created' is distinct from 'false'::jsonb
    or v_replay->'executionAuthorized' is distinct from 'false'::jsonb
    or v_replay->>'claimId' is distinct from v_claim_id::text
    or v_replay->'claimToken' is distinct from 'null'::jsonb
    or v_replay->>'status' is distinct from 'ALREADY_CLAIMED'
  then
    raise exception 'revocation-path claim replay leaked authority: %',
      v_replay;
  end if;

  update pg_temp.communication_note_preview_assertion_state
  set claim_id = v_claim_id,
      claim_token = v_created->>'claimToken'
  where scenario = 'revocation';
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- A claimed authorization remains revocable. Replay returns the same terminal
-- acknowledgement and never reissues execution authority.
set local role careslink_v1_preview_authorization_executor;

do $$
declare
  v_state pg_temp.communication_note_preview_assertion_state%rowtype;
  v_created jsonb;
  v_replay jsonb;
  v_revocation_id constant uuid :=
    'f4000000-0000-4000-8000-000000000001';
begin
  select state.*
  into v_state
  from pg_temp.communication_note_preview_assertion_state as state
  where state.scenario = 'revocation';

  v_created :=
    careslink_v1_generation.revoke_communication_note_preview_authorization(
      v_state.authorization_digest,
      v_revocation_id,
      'SECURITY_HOLD',
      pg_catalog.repeat('c', 64),
      pg_catalog.repeat('d', 64)
    );

  if v_created->'created' is distinct from 'true'::jsonb
    or v_created->'revoked' is distinct from 'true'::jsonb
    or v_created->'executionAuthorized' is distinct from 'false'::jsonb
  then
    raise exception 'Preview revocation acknowledgement drifted: %', v_created;
  end if;

  v_replay :=
    careslink_v1_generation.revoke_communication_note_preview_authorization(
      v_state.authorization_digest,
      v_revocation_id,
      'SECURITY_HOLD',
      pg_catalog.repeat('c', 64),
      pg_catalog.repeat('d', 64)
    );

  if v_replay->'created' is distinct from 'false'::jsonb
    or v_replay->'revoked' is distinct from 'true'::jsonb
    or v_replay->'executionAuthorized' is distinct from 'false'::jsonb
  then
    raise exception 'Preview revocation replay drifted: %', v_replay;
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Revocation is terminal: a previously issued raw claim token cannot reserve
-- a new transport slot after the SECURITY_HOLD is durable.
set local role careslink_v1_preview_dispatch_executor;

do $$
declare
  v_state pg_temp.communication_note_preview_assertion_state%rowtype;
  v_message text;
  v_rejected boolean := false;
begin
  select state.*
  into v_state
  from pg_temp.communication_note_preview_assertion_state as state
  where state.scenario = 'revocation';

  begin
    perform
      careslink_v1_generation.reserve_communication_note_preview_dispatch(
        v_state.claim_id,
        v_state.claim_token,
        'f3000000-0000-4000-8000-000000000002',
        0,
        'communication.en.phone-duration.v1',
        1,
        '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
        2522,
        'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
        pg_catalog.repeat('f', 64)
      );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_rejected := v_message = 'AUTHORIZATION_REVOKED';
  end;

  if not v_rejected or exists (
    select 1
    from careslink_v1_generation.communication_note_preview_dispatch_reservations
      as reservation
    where reservation.claim_id = v_state.claim_id
  ) then
    raise exception 'revoked Preview claim received dispatch authority';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Exact fixture state: raw token never enters a durable ledger, identifiers
-- remain distinct HMACs, and the receipt is explicitly not provider-attested.
set local role careslink_v1_preview_receipt_executor;

do $$
declare
  v_state pg_temp.communication_note_preview_assertion_state%rowtype;
begin
  select state.*
  into v_state
  from pg_temp.communication_note_preview_assertion_state as state
  where state.scenario = 'dispatch';

  if (
      select count(*)
      from careslink_v1_generation.communication_note_preview_authorizations
    ) <> 2
    or (
      select count(*)
      from careslink_v1_generation.communication_note_preview_authorization_revocations
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.communication_note_preview_claims
    ) <> 2
    or (
      select count(*)
      from careslink_v1_generation.communication_note_preview_dispatch_reservations
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.communication_note_preview_dispatch_receipts
    ) <> 1
  then
    raise exception 'Preview authority fixture cardinality drifted';
  end if;

  if (
      select count(*)
      from careslink_v1_generation.communication_note_preview_claims as claim
      where claim.claim_id = v_state.claim_id
        and claim.claim_token_sha256 =
          careslink_v1_generation._communication_note_preview_sha256_text(
            v_state.claim_token
          )
        and claim.claim_token_sha256 <> v_state.claim_token
    ) <> 1
  then
    raise exception 'Preview raw claim token storage boundary drifted';
  end if;

  if (
      select count(*)
      from careslink_v1_generation.communication_note_preview_dispatch_receipts
        as receipt
      where receipt.receipt_digest = v_state.receipt_digest
        and receipt.outcome = 'COMPLETED'
        and receipt.provider_attestation = 'ABSENT'
        and receipt.authenticity = 'CARESLINK_SIGNED_INTERNAL_OBSERVATION'
        and receipt.client_request_id_hmac =
          v_state.client_request_id_hmac
        and receipt.openai_request_id_hmac <> receipt.client_request_id_hmac
        and receipt.openai_response_id_hmac <> receipt.client_request_id_hmac
        and receipt.openai_request_id_hmac <>
          receipt.openai_response_id_hmac
        and receipt.no_retry
    ) <> 1
  then
    raise exception 'Preview receipt authenticity/correlation boundary drifted';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Every populated ledger rejects both UPDATE and DELETE even to its table
-- owner. FORCE RLS is relaxed only inside this rollback-only transaction so
-- the guard trigger itself is reached, then restored immediately.
set local role careslink_v1_generation_owner;

do $$
declare
  v_entry record;
  v_message text;
  v_update_rejected boolean;
  v_delete_rejected boolean;
  v_count bigint;
begin
  for v_entry in
    select *
    from (
      values
        ('communication_note_preview_authorizations', 2::bigint),
        ('communication_note_preview_authorization_revocations', 1::bigint),
        ('communication_note_preview_claims', 2::bigint),
        ('communication_note_preview_dispatch_reservations', 1::bigint),
        ('communication_note_preview_dispatch_receipts', 1::bigint)
    ) as expected(table_name, row_count)
  loop
    execute pg_catalog.format(
      'alter table careslink_v1_generation.%I no force row level security',
      v_entry.table_name
    );

    v_update_rejected := false;
    begin
      execute pg_catalog.format(
        'update careslink_v1_generation.%I set shadow_only = shadow_only',
        v_entry.table_name
      );
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_message = message_text;
      v_update_rejected :=
        v_message = 'IMMUTABLE_PREVIEW_EXECUTION_AUTHORITY_LEDGER';
    end;

    v_delete_rejected := false;
    begin
      execute pg_catalog.format(
        'delete from careslink_v1_generation.%I',
        v_entry.table_name
      );
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_message = message_text;
      v_delete_rejected :=
        v_message = 'IMMUTABLE_PREVIEW_EXECUTION_AUTHORITY_LEDGER';
    end;

    execute pg_catalog.format(
      'select count(*) from careslink_v1_generation.%I',
      v_entry.table_name
    ) into v_count;

    if not v_update_rejected
      or not v_delete_rejected
      or v_count <> v_entry.row_count
    then
      raise exception 'Preview append-only ledger failed open: %',
        v_entry.table_name;
    end if;

    execute pg_catalog.format(
      'alter table careslink_v1_generation.%I force row level security',
      v_entry.table_name
    );
  end loop;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_class as relation
    where relation.relnamespace =
        'careslink_v1_generation'::regnamespace
      and relation.relname in (
        'communication_note_preview_authorizations',
        'communication_note_preview_authorization_revocations',
        'communication_note_preview_claims',
        'communication_note_preview_dispatch_reservations',
        'communication_note_preview_dispatch_receipts'
      )
      and (
        not relation.relrowsecurity
        or not relation.relforcerowsecurity
        or relation.relowner <>
          'careslink_v1_generation_owner'::regrole
      )
  ) then
    raise exception 'Preview owner/RLS posture not restored after fixtures';
  end if;
end
$$;

-- Remove the assertion-only role edges explicitly. ROLLBACK also removes all
-- metadata fixtures, temporary state and any transient catalog state.
revoke careslink_v1_preview_receipt_executor
  from current_user granted by current_user;
revoke careslink_v1_preview_dispatch_executor
  from current_user granted by current_user;
revoke careslink_v1_preview_authorization_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;

rollback;

-- A separate rollback-only transaction proves the isolation guard before any
-- argument validation or mutation. READ COMMITTED is required because each
-- post-lock command must see a fresh snapshot of concurrent revocation facts.
begin isolation level repeatable read;

grant careslink_v1_preview_authorization_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_dispatch_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_receipt_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

set local role careslink_v1_preview_authorization_executor;

do $$
declare
  v_message text;
  v_rejected boolean := false;
begin
  begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_authorization(
      null::jsonb,
      null::text,
      null::text
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_rejected := v_message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end;
  if not v_rejected then
    raise exception 'authorization persist accepted REPEATABLE READ';
  end if;

  v_rejected := false;
  begin
    perform careslink_v1_generation.revoke_communication_note_preview_authorization(
      null::text,
      null::uuid,
      null::text,
      null::text,
      null::text
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_rejected := v_message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end;
  if not v_rejected then
    raise exception 'authorization revoke accepted REPEATABLE READ';
  end if;
end
$$;

reset role;
set local role careslink_v1_preview_dispatch_executor;

do $$
declare
  v_message text;
  v_rejected boolean := false;
begin
  begin
    perform careslink_v1_generation.claim_communication_note_preview_authorization(
      null::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_rejected := v_message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end;
  if not v_rejected then
    raise exception 'authorization claim accepted REPEATABLE READ';
  end if;

  v_rejected := false;
  begin
    perform careslink_v1_generation.reserve_communication_note_preview_dispatch(
      null::uuid,
      null::text,
      null::uuid,
      null::integer,
      null::text,
      null::integer,
      null::text,
      null::integer,
      null::text,
      null::text
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_rejected := v_message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end;
  if not v_rejected then
    raise exception 'dispatch reservation accepted REPEATABLE READ';
  end if;
end
$$;

reset role;
set local role careslink_v1_preview_receipt_executor;

do $$
declare
  v_message text;
  v_rejected boolean := false;
begin
  begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
      null::jsonb,
      null::text,
      null::text,
      null::text
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_rejected := v_message = 'UNSUPPORTED_TRANSACTION_ISOLATION';
  end;
  if not v_rejected then
    raise exception 'dispatch receipt accepted REPEATABLE READ';
  end if;
end
$$;

reset role;
rollback;
