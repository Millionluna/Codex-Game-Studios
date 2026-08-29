-- Rollback-only PostgreSQL 16+ posture and functional assertions for
-- Communication Note M1g-f/M1g-g. Synthetic fixture rows and SET-role edges exist
-- only inside this transaction and are removed before the final ROLLBACK.

\set ON_ERROR_STOP on

begin;

select pg_catalog.set_config('careslink.assertion_entry_role', current_user, true);

do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_owner oid := to_regrole('careslink_v1_generation_owner');
  v_executor oid := to_regrole('careslink_v1_preview_runner_terminal_executor');
  v_caller oid := to_regrole('careslink_v1_preview_runner_terminal_caller');
  v_relation oid := to_regclass(
    'careslink_v1_generation.communication_note_preview_runner_terminals'
  );
  v_type oid := to_regtype(
    'careslink_v1_generation.communication_note_preview_runner_terminals'
  );
  v_function oid := to_regprocedure(
    'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)'
  );
  v_reserve oid := to_regprocedure(
    'careslink_v1_generation.reserve_communication_note_preview_dispatch(uuid,text,uuid,integer,text,integer,text,integer,text,text)'
  );
  v_guard oid := to_regprocedure(
    'careslink_v1_generation._deny_communication_note_preview_ledger_mutation()'
  );
  v_canonical_json oid := to_regprocedure(
    'public.v1_shadow_canonical_json(jsonb)'
  );
  v_content_sha256 oid := to_regprocedure(
    'public.v1_shadow_content_sha256(jsonb)'
  );
  v_digest oid := to_regprocedure('extensions.digest(bytea,text)');
  v_definition text;
  v_role text;
  v_entry_actor_super boolean;
  v_edge_count integer;
  v_expected_edges integer;
  v_has_password boolean;
begin
  if current_setting('server_version_num')::integer < 160000 then
    raise exception 'M1g-f assertions require PostgreSQL 16+';
  end if;
  if v_schema is null or v_owner is null or v_executor is null or v_caller is null
    or v_relation is null or v_type is null
    or v_function is null or v_reserve is null
    or v_guard is null or v_canonical_json is null
    or v_content_sha256 is null or v_digest is null
  then
    raise exception 'M1g-f durable objects are incomplete';
  end if;
  if to_regprocedure(
    'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)'
  ) is not null then
    raise exception 'unsigned M1g-f terminal RPC remains callable';
  end if;
  if (
    select count(*)
    from pg_catalog.pg_roles r
    where r.oid = v_executor
      and not r.rolcanlogin and not r.rolsuper and not r.rolcreatedb
      and not r.rolcreaterole and not r.rolinherit and not r.rolreplication
      and not r.rolbypassrls and r.rolconnlimit = -1
      and r.rolvaliduntil is null and r.rolconfig is null
  ) <> 1 then
    raise exception 'unsafe M1g-f executor posture';
  end if;
  if (
    select count(*)
    from pg_catalog.pg_roles r
    where r.oid = v_caller
      and not r.rolcanlogin and not r.rolsuper and not r.rolcreatedb
      and not r.rolcreaterole and not r.rolinherit and not r.rolreplication
      and not r.rolbypassrls and r.rolconnlimit = -1
      and r.rolvaliduntil is null and r.rolconfig is null
  ) <> 1 then
    raise exception 'unsafe M1g-g terminal caller posture';
  end if;
  select r.rolsuper into v_entry_actor_super
  from pg_catalog.pg_roles r where r.oid = current_user::regrole;
  if v_entry_actor_super then
    execute 'select exists (select 1 from pg_catalog.pg_authid where oid in ($1,$2) and rolpassword is not null)'
      into v_has_password using v_executor, v_caller;
    if v_has_password then
      raise exception 'M1g-g terminal executor/caller has a password';
    end if;
  end if;
  select count(*) into v_edge_count
  from pg_catalog.pg_auth_members m
  where m.roleid in (v_executor, v_caller) or m.member in (v_executor, v_caller);
  v_expected_edges := case when v_entry_actor_super then 0 else 2 end;
  if v_edge_count <> v_expected_edges or exists (
    select 1
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles member_role on member_role.oid = m.member
    join pg_catalog.pg_roles grantor_role on grantor_role.oid = m.grantor
    where (m.roleid in (v_executor, v_caller) or m.member in (v_executor, v_caller))
      and not (
        m.roleid in (v_executor, v_caller)
        and member_role.oid = current_user::regrole
        and grantor_role.rolsuper
        and grantor_role.oid <> member_role.oid
        and m.admin_option
        and coalesce((pg_catalog.to_jsonb(m)->>'inherit_option')::boolean, false) is false
        and coalesce((pg_catalog.to_jsonb(m)->>'set_option')::boolean, false) is false
      )
  ) then
    raise exception 'M1g-g terminal roles have unsafe durable membership/bootstrap edge';
  end if;
  if (
    select count(*) from pg_catalog.pg_class c
    where c.oid = v_relation and c.relowner = v_owner
      and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity
  ) <> 1 then
    raise exception 'M1g-f ledger owner/RLS posture drifted';
  end if;
  if (
    select count(*)
    from pg_catalog.pg_proc p
    where p.oid = v_function
      and p.proowner = v_executor
      and p.prokind = 'f'
      and p.prorettype = 'jsonb'::regtype
      and p.provolatile = 'v'
      and p.prosecdef
      and p.proconfig is not null
      and pg_catalog.cardinality(p.proconfig) = 1
      and p.proconfig[1] in ('search_path=', 'search_path=""')
  ) <> 1 then
    raise exception 'M1g-f terminal RPC definer posture drifted';
  end if;
  if (
    select count(*)
    from pg_catalog.pg_trigger t
    where t.tgrelid = v_relation and not t.tgisinternal
      and t.tgname = 'communication_note_preview_runner_terminals_append_only'
      and t.tgenabled = 'O'
      and t.tgtype = 27
      and t.tgfoid = v_guard
  ) <> 1 then
    raise exception 'M1g-f append-only trigger posture drifted';
  end if;
  if has_function_privilege(
    'careslink_v1_generation_owner', v_guard, 'EXECUTE'
  ) then
    raise exception 'temporary append-only guard EXECUTE was not removed';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where p.oid in (v_function, v_reserve)
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'M1g-f function EXECUTE leaked to PUBLIC';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where p.oid = v_function
      and acl.privilege_type = 'EXECUTE'
      and (
        acl.grantee not in (v_executor, v_caller)
        or acl.is_grantable
      )
  ) then
    raise exception 'M1g-f terminal RPC exact EXECUTE ACL drifted';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as acl
    where p.oid = v_reserve
      and acl.privilege_type = 'EXECUTE'
      and (
        acl.grantee not in (
          to_regrole('careslink_v1_preview_dispatch_executor'),
          to_regrole('careslink_v1_preview_dispatch_caller')
        )
        or acl.is_grantable
      )
  ) then
    raise exception 'M1g-f reserve RPC exact EXECUTE ACL drifted';
  end if;
  foreach v_role in array array[
    'anon', 'authenticated', 'service_role',
    'careslink_v1_preview_authorization_registration_caller',
    'careslink_v1_preview_authorization_revocation_caller',
    'careslink_v1_preview_dispatch_caller',
    'careslink_v1_preview_receipt_caller',
    'careslink_v1_preview_authorization_executor',
    'careslink_v1_preview_dispatch_executor',
    'careslink_v1_preview_receipt_executor'
  ] loop
    if has_function_privilege(v_role, v_function, 'EXECUTE') then
      raise exception 'M1g-f RPC execute leaked to %', v_role;
    end if;
  end loop;
  if not has_function_privilege(
    'careslink_v1_preview_runner_terminal_executor', v_function, 'EXECUTE'
  ) or not has_function_privilege(
    'careslink_v1_preview_runner_terminal_caller', v_function, 'EXECUTE'
  ) then
    raise exception 'M1g-g terminal executor/caller exact RPC edge missing';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.pronamespace = v_schema
      and p.oid <> v_function
      and acl.grantee = v_caller
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'M1g-g terminal caller crossed into another private RPC';
  end if;
  if not has_schema_privilege(
      'careslink_v1_preview_runner_terminal_caller', v_schema, 'USAGE'
    ) or has_schema_privilege(
      'careslink_v1_preview_runner_terminal_caller', v_schema, 'CREATE'
    )
  then
    raise exception 'M1g-g terminal caller schema posture drifted';
  end if;
  if not has_schema_privilege(
      'careslink_v1_preview_runner_terminal_executor', 'public', 'USAGE'
    ) or not has_schema_privilege(
      'careslink_v1_preview_runner_terminal_executor', 'extensions', 'USAGE'
    ) or not has_function_privilege(
      'careslink_v1_preview_runner_terminal_executor',
      v_canonical_json,
      'EXECUTE'
    ) or not has_function_privilege(
      'careslink_v1_preview_runner_terminal_executor',
      v_content_sha256,
      'EXECUTE'
    ) or not has_function_privilege(
      'careslink_v1_preview_runner_terminal_executor', v_digest, 'EXECUTE'
    )
  then
    raise exception 'M1g-f canonical digest dependency ACL missing';
  end if;
  if not has_type_privilege(
      'careslink_v1_preview_runner_terminal_executor', v_type, 'USAGE'
    ) or not has_type_privilege(
      'careslink_v1_preview_dispatch_executor', v_type, 'USAGE'
    )
  then
    raise exception 'M1g-f terminal composite type USAGE missing';
  end if;
  foreach v_role in array array[
    'careslink_v1_generation.communication_note_preview_authorizations',
    'careslink_v1_generation.communication_note_preview_claims',
    'careslink_v1_generation.communication_note_preview_dispatch_reservations',
    'careslink_v1_generation.communication_note_preview_dispatch_receipts'
  ] loop
    if not has_type_privilege(
      'careslink_v1_preview_runner_terminal_executor', v_role, 'USAGE'
    ) then
      raise exception 'M1g-f parent composite type USAGE missing: %', v_role;
    end if;
  end loop;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(
      v_role, v_relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) then
      raise exception 'M1g-f ledger leaked to API role %', v_role;
    end if;
  end loop;
  if has_table_privilege(
      'careslink_v1_preview_runner_terminal_caller', v_relation,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) or has_type_privilege(
      'careslink_v1_preview_runner_terminal_caller', v_type, 'USAGE'
    )
  then
    raise exception 'M1g-g terminal caller gained direct ledger/type privilege';
  end if;
  if exists (
    with expected(role_name, privilege_type, is_grantable) as (
      values
        ('careslink_v1_preview_dispatch_executor', 'SELECT', false),
        ('careslink_v1_preview_runner_terminal_executor', 'INSERT', false),
        ('careslink_v1_preview_runner_terminal_executor', 'SELECT', false)
    ),
    actual(role_name, privilege_type, is_grantable) as (
      select
        (
          case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
        )::text,
        acl.privilege_type,
        acl.is_grantable
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) acl
      left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
      where relation.oid = v_relation
        and acl.grantee <> v_owner
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'M1g-f terminal ledger exact table ACL drifted';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
    where attribute.attrelid = v_relation
      and attribute.attnum > 0
      and not attribute.attisdropped
      and acl.grantee <> v_owner
  ) then
    raise exception 'M1g-f terminal ledger unexpected column ACL drifted';
  end if;
  if exists (
    with expected(policy_name, command, role_name, permissive) as (
      values
        (
          'comm_preview_runner_terminals_dispatch_select',
          'r'::"char",
          'careslink_v1_preview_dispatch_executor',
          true
        ),
        (
          'comm_preview_runner_terminals_executor_insert',
          'a'::"char",
          'careslink_v1_preview_runner_terminal_executor',
          true
        ),
        (
          'comm_preview_runner_terminals_executor_select',
          'r'::"char",
          'careslink_v1_preview_runner_terminal_executor',
          true
        )
    ),
    actual(policy_name, command, role_name, permissive) as (
      select
        policy.polname::text,
        policy.polcmd,
        (
          case when policy_role.role_oid = 0 then 'PUBLIC' else role.rolname end
        )::text,
        policy.polpermissive
      from pg_catalog.pg_policy policy
      cross join lateral pg_catalog.unnest(policy.polroles)
        as policy_role(role_oid)
      left join pg_catalog.pg_roles role on role.oid = policy_role.role_oid
      where policy.polrelid = v_relation
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'M1g-f terminal ledger exact policy identity drifted';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = v_relation
      and policy.polname in (
        'comm_preview_runner_terminals_dispatch_select',
        'comm_preview_runner_terminals_executor_select'
      )
      and (
        policy.polqual is null
        or pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          !~* '^[(]?true[)]?$'
        or policy.polwithcheck is not null
      )
  ) then
    raise exception 'M1g-f terminal SELECT policy posture drifted';
  end if;
  foreach v_role in array array[
    'anon','authenticated','service_role',
    'careslink_v1_generation_owner',
    'careslink_v1_preview_authorization_executor',
    'careslink_v1_preview_receipt_executor',
    'careslink_v1_preview_runner_terminal_executor',
    'careslink_v1_preview_authorization_registration_caller',
    'careslink_v1_preview_authorization_revocation_caller',
    'careslink_v1_preview_receipt_caller',
    'careslink_v1_preview_runner_terminal_caller'
  ] loop
    if has_function_privilege(v_role, v_reserve, 'EXECUTE') then
      raise exception 'reserve RPC execute leaked to %', v_role;
    end if;
  end loop;
  if not has_function_privilege(
      'careslink_v1_preview_dispatch_executor', v_reserve, 'EXECUTE'
    ) or not has_function_privilege(
      'careslink_v1_preview_dispatch_caller', v_reserve, 'EXECUTE'
    )
  then
    raise exception 'reserve RPC exact dispatch ACL missing';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = v_relation
      and p.polname = 'comm_preview_runner_terminals_executor_insert'
      and p.polqual is null
      and pg_catalog.regexp_replace(
        pg_catalog.lower(
          pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
        ),
        '[[:space:]()]',
        '',
        'g'
      ) = 'shadow_onlyistrueandno_retryistrue'
  ) then
    raise exception 'M1g-f insert policy is not fail-closed';
  end if;

  select pg_catalog.pg_get_functiondef(v_function) into v_definition;
  if v_definition !~* 'security definer'
    or v_definition !~* 'set search_path to '''''
    or v_definition !~* 'p_signature_base64url text'
    or v_definition !~* 'CARESLINK_RUNNER_TERMINAL'
    or v_definition !~* 'signerKeyIdHash'
    or v_definition !~* 'signerPublicKeySha256'
    or v_definition !~* 'RUNNER_TERMINAL_SIGNER_NOT_INDEPENDENT'
    or v_definition !~* 'v_existing.signature_base64url'
    or v_definition !~* 'v_existing.signature_sha256'
    or v_definition !~* 'transaction_isolation'
    or v_definition !~* 'read committed'
    or v_definition !~* 'outcome <> ''COMPLETED'''
    or v_definition !~* 'RUNNER_TERMINAL_CONFLICT'
    or v_definition !~* 'STRICT_SCHEMA'
    or v_definition !~* 'HUMAN_SEMANTIC_GROUNDEDNESS'
    or v_definition !~* 'UNATTESTED_NO_SHARED_IDENTIFIER'
    or v_definition !~* 'receiptSignatureSha256'
    or v_definition !~* 'totalTokensReconciliation'
    or v_definition !~* 'cachedInputTokensReconciliation'
    or v_definition !~* 'reasoningTokensReconciliation'
    or v_definition !~* '-[[:space:]]*array\['
    or v_definition !~* 'is distinct from v_receipt.usage'
    or v_definition ~* (
      'p_statement->''usage''[[:space:]]+' ||
      'is distinct from v_receipt.usage'
    )
  then
    raise exception 'M1g-g signed terminal RPC contract drifted';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_relation
      and c.conname = 'comm_preview_runner_terminals_signed_envelope_check'
      and pg_catalog.pg_get_constraintdef(c.oid) ~
        'EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED'
      and pg_catalog.pg_get_constraintdef(c.oid) ~
        'APPLICATION_ED25519_TERMINAL_TRUST_REGISTRY'
  ) then
    raise exception 'M1g-g signed terminal ledger constraint drifted';
  end if;
  select pg_catalog.pg_get_functiondef(v_reserve) into v_definition;
  if v_definition !~* '''reservedAt'''
    or v_definition !~* 'v_existing.reserved_at'
    or v_definition !~* 'PRIOR_RUNNER_TERMINAL_PENDING'
    or v_definition !~* 'PRIOR_SLOT_NOT_TERMINAL'
    or v_definition !~* 'for v_prior_slot in 0\.\.p_slot_index - 1'
    or v_definition !~* 'terminal_state.*''ACCEPTED'''
    or v_definition !~* (
      '''dispatchAuthorized''' || '[[:space:]]*,[[:space:]]*false'
    )
    or v_definition !~* (
      '''dispatchAuthorized''' || '[[:space:]]*,[[:space:]]*true'
    )
  then
    raise exception 'M1g-f reserve RPC contract drifted';
  end if;
end
$$;

-- Rollback-only SET-role edges let this assertion exercise the actual owned
-- SECURITY DEFINER entry points without creating a runtime caller.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_authorization_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_dispatch_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_receipt_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_runner_terminal_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_preview_runner_terminal_caller to current_user
  with admin false, inherit false, set true granted by current_user;

savepoint m1gf_functional_fixture;

create temporary table m1gf_state (
  scenario text primary key,
  authorization_statement jsonb not null,
  authorization_digest text not null,
  claim_id uuid,
  claim_token text,
  reservation_id uuid,
  client_request_id_hmac text,
  receipt_digest text,
  receipt_signature_sha256 text,
  receipt_usage jsonb,
  receipt_cost integer
) on commit drop;
grant select, insert, update on m1gf_state to
  careslink_v1_preview_authorization_executor,
  careslink_v1_preview_dispatch_executor,
  careslink_v1_preview_receipt_executor,
  careslink_v1_preview_runner_terminal_executor,
  careslink_v1_preview_runner_terminal_caller;

set local role careslink_v1_preview_authorization_executor;
do $$
declare
  v_scenario text;
  v_now timestamptz := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
  v_statement jsonb;
  v_result jsonb;
begin
  foreach v_scenario in array array['accepted','failed'] loop
    v_statement := pg_catalog.jsonb_build_object(
      'domain','careslink.communication-note.preview-authorization',
      'version','authorization.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1',
      'authorizationId',case when v_scenario='accepted' then
        'f4100000-0000-4000-8000-000000000001' else
        'f4100000-0000-4000-8000-000000000002' end,
      'authorizationNonceHash',case when v_scenario='accepted' then repeat('1',64) else repeat('0',64) end,
      'ownerSubjectHmac',repeat('2',64),
      'tenantScopeHmac',case when v_scenario='accepted' then repeat('3',64) else repeat('4',64) end,
      'runIdHash',case when v_scenario='accepted' then repeat('4',64) else repeat('3',64) end,
      'signerKeyIdHash',case when v_scenario='accepted' then repeat('5',64) else repeat('d',64) end,
      'signerPublicKeySha256',case when v_scenario='accepted' then repeat('6',64) else repeat('e',64) end,
      'issuedAt',to_char((v_now-interval '1 minute') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'notBefore',to_char((v_now-interval '1 minute') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt',to_char((v_now+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'sourceBindings',careslink_v1_generation._communication_note_preview_expected_source_bindings(),
      'environmentEvidence',jsonb_build_object(
        'openAiProjectIdHmac',repeat('7',64),
        'australiaProjectConfigurationSha256',repeat('8',64),
        'zeroDataRetentionConfigurationSha256',repeat('9',64),
        'modifiedRetentionAmendmentSha256',repeat('a',64),
        'ownerProcessingAcknowledgementSha256',repeat('b',64),
        'pricingAndModelAvailabilitySha256',repeat('c',64),
        'providerSpendLimitSha256',repeat('d',64),
        'temporaryCredentialReferenceSha256',repeat('e',64)),
      'budget',careslink_v1_generation._communication_note_preview_expected_budget(),
      'input',jsonb_build_object('classification','SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY','realCareDataAllowed',false),
      'slots',careslink_v1_generation._communication_note_preview_expected_slots());
    v_result := careslink_v1_generation.persist_verified_communication_note_preview_authorization(
      v_statement,repeat(case when v_scenario='accepted' then 'A' else 'B' end,86),repeat('f',64));
    if v_result->'created' is distinct from 'true'::jsonb then
      raise exception 'M1g-f authorization fixture failed: %',v_result;
    end if;
    insert into pg_temp.m1gf_state values (
      v_scenario,v_statement,v_result->>'authorizationDigest',null,null,null,null,null,null,null,null);
  end loop;
end $$;

select set_config('role',current_setting('careslink.assertion_entry_role'),false);
set local role careslink_v1_preview_dispatch_executor;
do $$
declare
  s pg_temp.m1gf_state%rowtype;
  c jsonb;
  r jsonb;
  replay jsonb;
  v_claim uuid;
  v_reservation uuid;
  v_client text;
  v_stored_reserved_at text;
begin
  for s in select * from pg_temp.m1gf_state order by scenario loop
    if s.scenario='accepted' then
      v_claim := 'f4200000-0000-4000-8000-000000000001';
      v_reservation := 'f4300000-0000-4000-8000-000000000001';
      v_client := repeat('a',64);
    else
      v_claim := 'f4200000-0000-4000-8000-000000000002';
      v_reservation := 'f4300000-0000-4000-8000-000000000002';
      v_client := repeat('0',64);
    end if;
    c := careslink_v1_generation.claim_communication_note_preview_authorization(
      s.authorization_digest,v_claim,s.authorization_statement->>'runIdHash',repeat('8',64),
      '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
      '90b9c42796f5d649fcadcdc0cb4c7f123f4d20c79d3c74f2e27e79fe6ec802e8',
      'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4');
    r := careslink_v1_generation.reserve_communication_note_preview_dispatch(
      v_claim,c->>'claimToken',v_reservation,0,'communication.en.phone-duration.v1',1,
      '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',2522,
      'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',v_client);
    select to_char(reservation.reserved_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    into v_stored_reserved_at
    from careslink_v1_generation.communication_note_preview_dispatch_reservations
      as reservation
    where reservation.reservation_id = v_reservation;
    if r->'created' is distinct from 'true'::jsonb
      or r->'dispatchAuthorized' is distinct from 'true'::jsonb
      or r->>'reservedAt' !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
      or r->>'reservedAt' is distinct from v_stored_reserved_at
    then
      raise exception 'fresh slot0 reserve did not return DB reservedAt: %',r;
    end if;
    replay := careslink_v1_generation.reserve_communication_note_preview_dispatch(
      v_claim,c->>'claimToken',v_reservation,0,'communication.en.phone-duration.v1',1,
      '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',2522,
      'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',v_client);
    if replay->'created' is distinct from 'false'::jsonb
      or replay->'dispatchAuthorized' is distinct from 'false'::jsonb
      or replay->>'reservedAt' is distinct from r->>'reservedAt' then
      raise exception 'slot0 exact replay changed time or leaked authority: %',replay;
    end if;
    update pg_temp.m1gf_state set claim_id=v_claim,claim_token=c->>'claimToken',
      reservation_id=v_reservation,client_request_id_hmac=v_client where scenario=s.scenario;
  end loop;
end $$;

select set_config('role',current_setting('careslink.assertion_entry_role'),false);
set local role careslink_v1_preview_receipt_executor;
do $$
declare
  s pg_temp.m1gf_state%rowtype;
  st jsonb;
  result jsonb;
  req_hmac text;
  resp_hmac text;
  key_hmac text;
  pub_hash text;
  verifier text;
begin
  for s in select * from pg_temp.m1gf_state order by scenario loop
    if s.scenario='accepted' then
      req_hmac:=repeat('b',64); resp_hmac:=repeat('c',64);
      key_hmac:=repeat('d',64); pub_hash:=repeat('e',64);
      verifier:=repeat('0',63)||'7';
    else
      req_hmac:=repeat('1',64); resp_hmac:=repeat('2',64);
      key_hmac:=repeat('5',64); pub_hash:=repeat('6',64);
      verifier:=repeat('0',63)||'7';
    end if;
    st := jsonb_build_object(
      'domain','careslink.communication-note.preview-dispatch-receipt',
      'version','receipt.communication.openai.synthetic-preview.2026-08-28.m1g-b.v1',
      'authorizationDigest',s.authorization_digest,'claimId',s.claim_id,
      'runIdHash',s.authorization_statement->>'runIdHash','reservationId',s.reservation_id,
      'slotIndex',0,'fixtureId','communication.en.phone-duration.v1','runOrdinal',1,
      'requestBodySha256','98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
      'requestBodyUtf8ByteLength',2522,
      'semanticCanonicalRequestSha256','f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
      'clientRequestIdHmac',s.client_request_id_hmac,'outcome','COMPLETED',
      'transport',jsonb_build_object('httpStatus',200,'openAiRequestIdHmac',req_hmac,'openAiResponseIdHmac',resp_hmac),
      'usage',jsonb_build_object('source','PROVIDER','inputTokens',120,'outputTokens',80,'totalTokens',200,'cachedInputTokens',20,'reasoningTokens',10),
      'calculatedCostUpperBoundMicroUsd',481,
      'observedAt',to_char(date_trunc('milliseconds',clock_timestamp()) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'noRetry',true,'authenticity','CARESLINK_SIGNED_INTERNAL_OBSERVATION','providerAttestation','ABSENT',
      'transportScope','APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION',
      'notProofOf',jsonb_build_array('EXACT_PROVIDER_RECEIPT','BILLING','MODEL_EXECUTION','EXACTLY_ONCE'),
      'signerKeyIdHash',key_hmac,'signerPublicKeySha256',pub_hash);
    result := careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
      st,repeat(case when s.scenario='accepted' then 'C' else 'D' end,86),verifier,s.claim_token);
    select r.receipt_digest,r.signature_sha256,r.usage,r.calculated_cost_upper_bound_micro_usd
      into s.receipt_digest,s.receipt_signature_sha256,s.receipt_usage,s.receipt_cost
      from careslink_v1_generation.communication_note_preview_dispatch_receipts r
      where r.reservation_id=s.reservation_id;
    update pg_temp.m1gf_state set receipt_digest=s.receipt_digest,
      receipt_signature_sha256=s.receipt_signature_sha256,receipt_usage=s.receipt_usage,
      receipt_cost=s.receipt_cost where scenario=s.scenario;
  end loop;
end $$;

select set_config('role',current_setting('careslink.assertion_entry_role'),false);
set local role careslink_v1_preview_dispatch_executor;
do $$
declare s pg_temp.m1gf_state%rowtype; m text; rejected boolean:=false;
begin
  select * into s from pg_temp.m1gf_state where scenario='accepted';
  begin
    perform careslink_v1_generation.reserve_communication_note_preview_dispatch(
      s.claim_id,s.claim_token,'f4310000-0000-4000-8000-000000000001',1,
      'communication.en.phone-duration.v1',2,
      '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',2522,
      'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',repeat('9',64));
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text;
    rejected := m='PRIOR_RUNNER_TERMINAL_PENDING';
  end;
  if not rejected then raise exception 'missing terminal did not block slot1: %',m; end if;
end $$;

select set_config('role',current_setting('careslink.assertion_entry_role'),false);
set local role careslink_v1_preview_runner_terminal_caller;
do $$
declare
  s pg_temp.m1gf_state%rowtype;
  st jsonb;
  bad jsonb;
  result jsonb;
  replay jsonb;
  m text;
  rejected boolean;
begin
  select * into s from pg_temp.m1gf_state where scenario='accepted';
  st := jsonb_build_object(
    'domain','CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL',
    'version','runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2',
    'authorityPolicyDigest','7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
    'authorizationDigest',s.authorization_digest,'claimId',s.claim_id,'runIdHash',s.authorization_statement->>'runIdHash',
    'reservationId',s.reservation_id,'receiptDigest',s.receipt_digest,'slotIndex',0,
    'fixtureId','communication.en.phone-duration.v1','runOrdinal',1,
    'runnerPolicyDigest','a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4',
    'terminalPolicyVersion','policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2',
    'terminalPolicyDigest','d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa',
    'state','ACCEPTED','failureReason',null,'noRetry',true,
    'requestBodySha256','98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
    'requestBodyUtf8ByteLength',2522,
    'semanticCanonicalRequestSha256','f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
    'signerKeyIdHash',repeat('0',63)||'8',
    'signerPublicKeySha256',repeat('0',63)||'9',
    'signingPurpose','CARESLINK_RUNNER_TERMINAL',
    'receiptSignatureSha256',s.receipt_signature_sha256,
    'fixtureDigest',repeat('0',63)||'b',
    'preflightInputTokens',120,
    'providerRequestIdHash',repeat('0',63)||'c',
    'candidateDigest',repeat('0',63)||'d',
    'usage',s.receipt_usage || jsonb_build_object(
      'totalTokensReconciliation','REPORTED',
      'cachedInputTokensReconciliation','REPORTED',
      'reasoningTokensReconciliation','REPORTED'
    ),'calculatedCostUpperBoundMicroUsd',s.receipt_cost,
    'criticalChecks',jsonb_build_object('STRICT_SCHEMA',true,'SHARED_OUTPUT_PRIVACY',true,'DATE_TIME_PARITY',true,'NUMERIC_PARITY',true,'DECISION_LANGUAGE',true,'REFUSAL_ABSENT',true,'HUMAN_SEMANTIC_GROUNDEDNESS',true),
    'humanReviews',jsonb_build_array(jsonb_build_object('locale','en','passed',true),jsonb_build_object('locale','zh-Hans','passed',true),jsonb_build_object('locale','zh-Hant','passed',true)),
    'receiptProviderCorrelation','UNATTESTED_NO_SHARED_IDENTIFIER',
    'observedAt',to_char(date_trunc('milliseconds',clock_timestamp()) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      st,repeat('E',85),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text;
    rejected:=m='VALIDATION_ERROR';
  end;
  if not rejected then
    raise exception 'malformed terminal signature was accepted: %',m;
  end if;

  bad := jsonb_set(
    st,'{signerKeyIdHash}',to_jsonb(s.authorization_statement->>'signerKeyIdHash'),false
  );
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text;
    rejected:=m in (
      'RUNNER_TERMINAL_SIGNER_NOT_INDEPENDENT',
      'VALIDATION_ERROR'
    );
  end;
  if not rejected then
    raise exception 'authorization signing key reuse was accepted: %',m;
  end if;

  bad := jsonb_set(st,'{preflightInputTokens}',to_jsonb('120'::text),false);
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'VALIDATION_ERROR' then
    raise exception 'string-as-number terminal evidence did not fail validation: %',m;
  end if;

  bad := jsonb_set(st,'{usage}',s.receipt_usage,false);
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'VALIDATION_ERROR' then
    raise exception 'six-key terminal usage did not fail validation: %',m;
  end if;

  bad := jsonb_set(
    st,'{usage}',(st->'usage') - 'totalTokensReconciliation',false
  );
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'VALIDATION_ERROR' then
    raise exception 'missing usage reconciliation did not fail validation: %',m;
  end if;

  bad := jsonb_set(
    st,'{usage}',(st->'usage') || jsonb_build_object('unexpected',true),false
  );
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'VALIDATION_ERROR' then
    raise exception 'extra terminal usage key did not fail validation: %',m;
  end if;

  bad := jsonb_set(
    st,'{usage,totalTokensReconciliation}',to_jsonb('ASSUMED'::text),false
  );
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'VALIDATION_ERROR' then
    raise exception 'invalid usage reconciliation did not fail validation: %',m;
  end if;

  bad := jsonb_set(
    st,'{usage,cachedInputTokensReconciliation}',
    to_jsonb('ASSUMED_ZERO'::text),false
  );
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'VALIDATION_ERROR' then
    raise exception 'assumed-zero cached usage did not fail validation: %',m;
  end if;

  bad := jsonb_set(
    st,'{usage,reasoningTokensReconciliation}',
    to_jsonb('UNAVAILABLE'::text),false
  );
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'VALIDATION_ERROR' then
    raise exception 'unavailable reasoning usage did not fail validation: %',m;
  end if;

  bad := jsonb_set(
    st,'{usage,cachedInputTokens}',to_jsonb(21),false
  );
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'RUNNER_TERMINAL_BINDING_INVALID' then
    raise exception 'receipt evidence drift did not fail binding: %',m;
  end if;

  bad := jsonb_set(st,'{preflightInputTokens}',to_jsonb(119),false);
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('E',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m<>'ASSERTION_EXPECTED_REJECTION'; end;
  if not rejected or m is distinct from 'RUNNER_TERMINAL_BINDING_INVALID' then
    raise exception 'preflight token underestimate did not fail binding: %',m;
  end if;

  result := careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    st,repeat('E',86),repeat('0',63)||'a');
  replay := careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    st,repeat('E',86),repeat('0',63)||'a');
  if result->'created' is distinct from 'true'::jsonb
    or result->'continuationEligible' is distinct from 'true'::jsonb
    or replay->'created' is distinct from 'false'::jsonb
    or replay->>'runnerTerminalDigest' is distinct from result->>'runnerTerminalDigest'
    or replay->>'recordedAt' is distinct from result->>'recordedAt' then
    raise exception 'ACCEPTED terminal create/replay drifted: %, %',result,replay;
  end if;
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      st,repeat('D',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text;
    rejected:=m='RUNNER_TERMINAL_CONFLICT';
  end;
  if not rejected then
    raise exception 'changed terminal signature replay was accepted: %',m;
  end if;

  select * into s from pg_temp.m1gf_state where scenario='failed';
  st := jsonb_build_object(
    'domain','CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL','version','runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2',
    'authorityPolicyDigest','7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9',
    'authorizationDigest',s.authorization_digest,'claimId',s.claim_id,'runIdHash',s.authorization_statement->>'runIdHash',
    'reservationId',s.reservation_id,'receiptDigest',s.receipt_digest,'slotIndex',0,'fixtureId','communication.en.phone-duration.v1','runOrdinal',1,
    'runnerPolicyDigest','a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4',
    'terminalPolicyVersion','policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2',
    'terminalPolicyDigest','d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa',
    'signerKeyIdHash',repeat('0',63)||'8',
    'signerPublicKeySha256',repeat('0',63)||'9',
    'signingPurpose','CARESLINK_RUNNER_TERMINAL',
    'state','FAILED','failureReason','HUMAN_REVIEW_FAILED','noRetry',true,
    'requestBodySha256',null,'requestBodyUtf8ByteLength',null,'semanticCanonicalRequestSha256',null,
    'receiptSignatureSha256',null,'fixtureDigest',null,'preflightInputTokens',null,'providerRequestIdHash',null,'candidateDigest',null,
    'usage',null,'calculatedCostUpperBoundMicroUsd',null,'criticalChecks',null,'humanReviews',null,'receiptProviderCorrelation',null,
    'observedAt',to_char(date_trunc('milliseconds',clock_timestamp()) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  result := careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
    st,repeat('F',86),repeat('0',63)||'a');
  if result->>'state' is distinct from 'FAILED' or result->'continuationEligible' is distinct from 'false'::jsonb then
    raise exception 'FAILED terminal drifted: %',result;
  end if;
  bad := st || jsonb_build_object('state','ACCEPTED','failureReason',null,
    'requestBodySha256','98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',
    'requestBodyUtf8ByteLength',2522,'semanticCanonicalRequestSha256','f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',
    'receiptSignatureSha256',s.receipt_signature_sha256,'fixtureDigest',repeat('8',64),'preflightInputTokens',120,
    'providerRequestIdHash',repeat('9',64),'candidateDigest',repeat('a',64),
    'usage',s.receipt_usage || jsonb_build_object(
      'totalTokensReconciliation','REPORTED',
      'cachedInputTokensReconciliation','REPORTED',
      'reasoningTokensReconciliation','REPORTED'
    ),
    'calculatedCostUpperBoundMicroUsd',s.receipt_cost,
    'criticalChecks',jsonb_build_object('STRICT_SCHEMA',true,'SHARED_OUTPUT_PRIVACY',true,'DATE_TIME_PARITY',true,'NUMERIC_PARITY',true,'DECISION_LANGUAGE',true,'REFUSAL_ABSENT',true,'HUMAN_SEMANTIC_GROUNDEDNESS',true),
    'humanReviews',jsonb_build_array(jsonb_build_object('locale','en','passed',true),jsonb_build_object('locale','zh-Hans','passed',true),jsonb_build_object('locale','zh-Hant','passed',true)),
    'receiptProviderCorrelation','UNATTESTED_NO_SHARED_IDENTIFIER');
  rejected:=false; begin
    perform careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
      bad,repeat('G',86),repeat('0',63)||'a');
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m='RUNNER_TERMINAL_CONFLICT'; end;
  if not rejected then raise exception 'FAILED terminal was overwritable by ACCEPTED: %',m; end if;
end $$;

select set_config('role',current_setting('careslink.assertion_entry_role'),false);
set local role careslink_v1_preview_runner_terminal_executor;
do $$
declare
  s pg_temp.m1gf_state%rowtype;
  t careslink_v1_generation.communication_note_preview_runner_terminals%rowtype;
  v_expected_signature_sha256 text;
begin
  select * into s from pg_temp.m1gf_state where scenario='accepted';
  select terminal.* into t
  from careslink_v1_generation.communication_note_preview_runner_terminals terminal
  where terminal.reservation_id=s.reservation_id;
  v_expected_signature_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(repeat('E',86),'UTF8'),'sha256'),
    'hex'
  );
  if t.signature_base64url is distinct from repeat('E',86)
    or t.signature_sha256 is distinct from v_expected_signature_sha256
    or t.signer_key_id_hash is distinct from repeat('0',63)||'8'
    or t.signer_public_key_sha256 is distinct from repeat('0',63)||'9'
    or t.authenticity is distinct from 'EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED'
    or t.verifier_method is distinct from 'APPLICATION_ED25519_TERMINAL_TRUST_REGISTRY'
    or t.statement->'usage' is distinct from (
      s.receipt_usage || jsonb_build_object(
        'totalTokensReconciliation','REPORTED',
        'cachedInputTokensReconciliation','REPORTED',
        'reasoningTokensReconciliation','REPORTED'
      )
    )
  then
    raise exception 'signed terminal evidence was not stored exactly';
  end if;
end $$;

select set_config('role',current_setting('careslink.assertion_entry_role'),false);
set local role careslink_v1_preview_dispatch_executor;
do $$
declare s pg_temp.m1gf_state%rowtype; r jsonb; m text; rejected boolean:=false;
begin
  select * into s from pg_temp.m1gf_state where scenario='accepted';
  r := careslink_v1_generation.reserve_communication_note_preview_dispatch(
    s.claim_id,s.claim_token,'f4310000-0000-4000-8000-000000000001',1,'communication.en.phone-duration.v1',2,
    '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',2522,
    'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',repeat('9',64));
  if r->'dispatchAuthorized' is distinct from 'true'::jsonb then raise exception 'ACCEPTED terminal did not unlock slot1: %',r; end if;
  select * into s from pg_temp.m1gf_state where scenario='failed';
  begin
    perform careslink_v1_generation.reserve_communication_note_preview_dispatch(
      s.claim_id,s.claim_token,'f4310000-0000-4000-8000-000000000002',1,'communication.en.phone-duration.v1',2,
      '98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213',2522,
      'f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68',repeat('b',64));
    raise exception 'ASSERTION_EXPECTED_REJECTION';
  exception when others then get stacked diagnostics m=message_text; rejected:=m='RUN_PERMANENTLY_CONSUMED'; end;
  if not rejected then raise exception 'FAILED terminal did not permanently block slot1: %',m; end if;
end $$;

select set_config('role',current_setting('careslink.assertion_entry_role'),false);
rollback to savepoint m1gf_functional_fixture;

-- Fixtures are gone before this final FORCE-RLS visibility proof.
set local role careslink_v1_preview_dispatch_executor;
do $$
declare v_table text; v_count bigint;
begin
  foreach v_table in array array[
    'communication_note_preview_authorizations','communication_note_preview_authorization_revocations',
    'communication_note_preview_claims','communication_note_preview_dispatch_reservations',
    'communication_note_preview_dispatch_receipts','communication_note_preview_runner_terminals'
  ] loop
    execute format('select count(*) from careslink_v1_generation.%I',v_table) into v_count;
    if v_count<>0 then raise exception 'rollback fixture remained visible under FORCE RLS: %',v_table; end if;
  end loop;
end $$;

select set_config('role',current_setting('careslink.assertion_entry_role'),false);
revoke careslink_v1_generation_owner from current_user granted by current_user;
revoke careslink_v1_preview_authorization_executor from current_user granted by current_user;
revoke careslink_v1_preview_dispatch_executor from current_user granted by current_user;
revoke careslink_v1_preview_receipt_executor from current_user granted by current_user;
revoke careslink_v1_preview_runner_terminal_executor from current_user granted by current_user;
revoke careslink_v1_preview_runner_terminal_caller from current_user granted by current_user;

rollback;
