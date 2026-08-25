-- Credential-free transaction test for the Production-unapplied Mobile/Web
-- sync shadow migration. Run only on a disposable branch after migrations
-- through 20260811134719, in timestamp order; this script rolls every fixture
-- back. The later Points migration must first pass its non-empty-data preflight.

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

do $$
declare
  v_count integer;
  v_internal_schema oid := to_regnamespace('careslink_v1_internal');
  v_internal_functions oid[] := array[
    to_regprocedure('careslink_v1_internal.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'),
    to_regprocedure('careslink_v1_internal.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'),
    to_regprocedure('careslink_v1_internal.resolve_v1_shadow_session_status_before_active_session(uuid,uuid)'),
    to_regprocedure('careslink_v1_internal.list_v1_shadow_documents_before_active_session(uuid,integer)'),
    to_regprocedure('careslink_v1_internal.get_v1_shadow_document_before_active_session(uuid)'),
    to_regprocedure('careslink_v1_internal.create_v1_shadow_document_before_note_schema(text,text,jsonb,text,text,text,text,uuid)'),
    to_regprocedure('careslink_v1_internal.append_v1_shadow_document_revision_before_note_schema(uuid,uuid,jsonb,text,text,text,text,uuid)'),
    to_regprocedure('careslink_v1_internal.save_v1_shadow_document_checkpoint_before_active_session(uuid,uuid,text,text[],text,uuid,uuid,uuid)'),
    to_regprocedure('careslink_v1_internal.tombstone_v1_shadow_document_before_active_session(uuid,uuid,text,text)'),
    to_regprocedure('careslink_v1_internal.pull_v1_shadow_document_changes_before_active_session(bigint,integer)'),
    to_regprocedure('careslink_v1_internal.confirm_v1_shadow_privacy_review_before_active_session(uuid,uuid,text,text,text,text,text,integer,jsonb,boolean,boolean,text)')
  ];
  v_session_helper text;
begin
  select count(*) into v_count
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relname in (
      'v1_mobile_sync_shadow_flags',
      'ai_document_sync_changes',
      'ai_document_mutation_receipts'
    );
  if v_count <> 3 then
    raise exception 'Expected 3 mobile sync shadow tables, found %', v_count;
  end if;

  select lower(pg_get_functiondef(
    'public.v1_shadow_session_is_active(uuid,uuid,timestamptz)'::regprocedure
  )) into v_session_helper;

  if to_regprocedure('public.assert_v1_shadow_note_facts(text,text,jsonb)') is null
    or to_regprocedure(
      'public.assert_v1_shadow_privacy_finding_paths(text,jsonb)'
    ) is null
    or to_regprocedure(
      'public.v1_shadow_session_is_active(uuid,uuid,timestamptz)'
    ) is null
    or v_session_helper not like '%active_session.not_after is null%'
    or v_session_helper not like '%active_session.not_after > p_at%'
    or v_session_helper not like '%join auth.users as active_user%'
    or v_session_helper not like '%jsonb_typeof(active_user.raw_app_meta_data) = ''object''%'
    or v_session_helper not like '%active_user.raw_app_meta_data->>''role'' = ''provider''%'
    or v_session_helper not like '%active_user.deleted_at is null%'
    or v_session_helper not like '%active_user.banned_until <= p_at%'
    or v_session_helper not like '%active_user.is_anonymous is false%'
    or v_session_helper like '%raw_user_meta_data%'
    or v_session_helper like '%user_metadata%'
  then
    raise exception 'Frozen Note validator or active-session helper is incomplete';
  end if;

  if exists (
    select 1
    from unnest(array[
      'public.assert_v1_shadow_note_facts(text,text,jsonb)'::regprocedure,
      'public.assert_v1_shadow_privacy_finding_paths(text,jsonb)'::regprocedure,
      'public.v1_shadow_session_is_active(uuid,uuid,timestamptz)'::regprocedure
    ]) as helper(oid)
    cross join unnest(array['anon', 'authenticated', 'service_role']) as api(role_name)
    where has_function_privilege(api.role_name, helper.oid, 'EXECUTE')
  ) then
    raise exception 'An internal Note/session helper has direct API-role EXECUTE';
  end if;

  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'careslink_v1_internal'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      and routine_name in (
        'resolve_v1_shadow_session_status_before_active_session',
        'list_v1_shadow_documents_before_active_session',
        'get_v1_shadow_document_before_active_session',
        'create_v1_shadow_document_before_note_schema',
        'append_v1_shadow_document_revision_before_note_schema',
        'save_v1_shadow_document_checkpoint_before_active_session',
        'tombstone_v1_shadow_document_before_active_session',
        'pull_v1_shadow_document_changes_before_active_session',
        'confirm_v1_shadow_privacy_review_before_active_session'
      )
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'A private pre-hardening RPC body has API-role EXECUTE';
  end if;

  if v_internal_schema is null
    or array_position(v_internal_functions, null) is not null
    or not exists (
      select 1 from pg_namespace
      where oid = v_internal_schema and nspowner = current_user::regrole
    )
    or exists (
      select 1
      from pg_roles as api_role
      where api_role.rolname in ('anon', 'authenticated', 'service_role')
        and (
          has_schema_privilege(api_role.oid, v_internal_schema, 'USAGE')
          or has_schema_privilege(api_role.oid, v_internal_schema, 'CREATE')
        )
    )
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_internal_schema
        and schema_acl.grantee = 0
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
    )
    or (
      select count(*)
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_internal_schema
        and schema_acl.grantee = namespace.nspowner
        and schema_acl.grantor = namespace.nspowner
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
        and not schema_acl.is_grantable
    ) <> 2
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_internal_schema
        and not (
          schema_acl.grantee = namespace.nspowner
          and schema_acl.grantor = namespace.nspowner
          and schema_acl.privilege_type in ('USAGE', 'CREATE')
          and not schema_acl.is_grantable
        )
    )
    or exists (
      with recursive reachable(role_oid) as (
        select oid from pg_roles
        where rolname in ('anon', 'authenticated', 'service_role')
        union
        select membership.roleid
        from pg_auth_members as membership
        join reachable on reachable.role_oid = membership.member
      )
      select 1 from reachable where role_oid = current_user::regrole
    )
    or (select count(*) from pg_proc where pronamespace = v_internal_schema) <> 11
    or (
      select count(*)
      from pg_proc as implementation
      where implementation.oid = any(v_internal_functions)
        and implementation.pronamespace = v_internal_schema
        and implementation.proowner = current_user::regrole
        and coalesce(to_jsonb(implementation)->>'prokind', 'f') = 'f'
        and implementation.prosecdef
        and cardinality(implementation.proconfig) = 1
        and implementation.proconfig[1] in ('search_path=', 'search_path=""')
        and (
          select count(*)
          from aclexplode(
            coalesce(
              implementation.proacl,
              acldefault('f', implementation.proowner)
            )
          ) as function_acl
          where function_acl.grantee = implementation.proowner
            and function_acl.grantor = implementation.proowner
            and function_acl.privilege_type = 'EXECUTE'
            and not function_acl.is_grantable
        ) = 1
        and not exists (
          select 1
          from aclexplode(
            coalesce(
              implementation.proacl,
              acldefault('f', implementation.proowner)
            )
          ) as function_acl
          where not (
            function_acl.grantee = implementation.proowner
            and function_acl.grantor = implementation.proowner
            and function_acl.privilege_type = 'EXECUTE'
            and not function_acl.is_grantable
          )
        )
        and not exists (
          select 1
          from pg_roles as api_role
          where api_role.rolname in ('anon', 'authenticated', 'service_role')
            and has_function_privilege(
              api_role.oid, implementation.oid, 'EXECUTE'
            )
        )
    ) <> 11
    or exists (select 1 from pg_class where relnamespace = v_internal_schema)
    or exists (select 1 from pg_type where typnamespace = v_internal_schema)
    or exists (
      select 1
      from pg_depend as dependency
      where dependency.refclassid = 'pg_namespace'::regclass
        and dependency.refobjid = v_internal_schema
        and dependency.refobjsubid = 0
        and not (
          dependency.classid = 'pg_proc'::regclass
          and dependency.objid = any(v_internal_functions)
          and dependency.objsubid = 0
        )
    )
  then
    raise exception 'Private Product V1 implementation schema contract is invalid';
  end if;

  if public.v1_shadow_canonical_json(
    '{"é":true,"z":1e21,"a":[1.230,1e-7,-0,"line\nfeed"]}'::jsonb
  ) <> '{"a":[1.23,0.0000001,0,"line\nfeed"],"z":1000000000000000000000,"é":true}'
  then
    raise exception 'Cross-runtime canonical JSON vector failed';
  end if;
  if public.v1_shadow_content_sha256('{"body":"first"}'::jsonb)
    <> 'e95f5694994356d47a08f5e9279896acab61bde95a46bcf289d9ca3517c3c20f'
  then
    raise exception 'Canonical content SHA-256 vector failed';
  end if;

  if (select enabled from public.v1_mobile_sync_shadow_flags
      where feature_key = 'mobile_sync_v1') is distinct from false
    or (select shadow_only from public.v1_mobile_sync_shadow_flags
        where feature_key = 'mobile_sync_v1') is distinct from true
    or (select count(*) from public.v1_mobile_sync_shadow_flags
        where feature_key = 'mobile_sync_v1') <> 1 then
    raise exception 'Mobile sync shadow flag is not disabled by default';
  end if;

  select count(*) into v_count
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'v1_mobile_sync_shadow_flags',
      'ai_document_sync_changes',
      'ai_document_mutation_receipts'
    )
    and rowsecurity;
  if v_count <> 3 then
    raise exception 'Expected RLS on all 3 mobile sync shadow tables';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      and table_name in (
        'ai_documents', 'ai_document_revisions', 'document_checkpoints',
        'ai_document_sync_changes', 'ai_document_mutation_receipts',
        'v1_mobile_sync_shadow_flags', 'privacy_reviews',
        'privacy_review_findings', 'privacy_confirmations'
      )
  ) then
    raise exception 'Client role has a direct mobile sync write grant';
  end if;

  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and cmd = 'SELECT'
    and roles = array['authenticated']::name[]
    and tablename in (
      'ai_document_sync_changes', 'ai_document_mutation_receipts'
    )
    and qual like '%auth.uid()%owner_user_id%';
  if v_count <> 2 then
    raise exception 'Expected 2 owner-only mobile sync SELECT policies, found %', v_count;
  end if;

  if to_regprocedure(
       'public.resolve_v1_shadow_session_status(uuid,uuid)'
     ) is null
    or to_regprocedure(
       'public.list_v1_shadow_documents(uuid,integer)'
     ) is null
    or to_regprocedure(
       'public.get_v1_shadow_document(uuid)'
     ) is null
    or to_regprocedure(
       'public.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'
     ) is null
    or to_regprocedure(
       'public.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'
     ) is null
    or to_regprocedure(
       'public.save_v1_shadow_document_checkpoint(uuid,uuid,text,text[],text,uuid,uuid,uuid)'
     ) is null
    or to_regprocedure(
       'public.tombstone_v1_shadow_document(uuid,uuid,text,text)'
     ) is null
    or to_regprocedure(
       'public.pull_v1_shadow_document_changes(bigint,integer)'
     ) is null
  then
    raise exception 'A required mobile sync RPC signature is missing';
  end if;

  select count(*) into v_count
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in (
      'resolve_v1_shadow_session_status',
      'list_v1_shadow_documents',
      'get_v1_shadow_document',
      'create_v1_shadow_document',
      'append_v1_shadow_document_revision',
      'save_v1_shadow_document_checkpoint',
      'tombstone_v1_shadow_document',
      'pull_v1_shadow_document_changes',
      'confirm_v1_shadow_privacy_review'
    );
  if v_count <> 9 then
    raise exception 'A Product V1 RPC has an unsafe public overload';
  end if;

  select count(*) into v_count
  from pg_proc
  where oid in (
    'public.resolve_v1_shadow_session_status(uuid,uuid)'::regprocedure,
    'public.list_v1_shadow_documents(uuid,integer)'::regprocedure,
    'public.get_v1_shadow_document(uuid)'::regprocedure,
    'public.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'::regprocedure,
    'public.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'::regprocedure,
    'public.save_v1_shadow_document_checkpoint(uuid,uuid,text,text[],text,uuid,uuid,uuid)'::regprocedure,
    'public.tombstone_v1_shadow_document(uuid,uuid,text,text)'::regprocedure,
    'public.pull_v1_shadow_document_changes(bigint,integer)'::regprocedure
  )
    and prosecdef
    and exists (
      select 1 from unnest(proconfig) as setting
      where setting in ('search_path=', 'search_path=""')
    );
  if v_count <> 8 then
    raise exception 'Mobile sync RPC SECURITY DEFINER/search_path contract failed';
  end if;

  if exists (
    select 1 from pg_proc
    where oid in (
      'public.list_v1_shadow_documents(uuid,integer)'::regprocedure,
      'public.get_v1_shadow_document(uuid)'::regprocedure,
      'public.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'::regprocedure,
      'public.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'::regprocedure,
      'public.save_v1_shadow_document_checkpoint(uuid,uuid,text,text[],text,uuid,uuid,uuid)'::regprocedure,
      'public.tombstone_v1_shadow_document(uuid,uuid,text,text)'::regprocedure,
      'public.pull_v1_shadow_document_changes(bigint,integer)'::regprocedure
    )
      and pg_get_function_arguments(oid) ~* '(owner|user_id)'
  ) then
    raise exception 'Mobile sync RPC accepts an owner parameter';
  end if;

  select count(distinct routine_name) into v_count
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and grantee = 'authenticated'
    and privilege_type = 'EXECUTE'
    and routine_name in (
      'create_v1_shadow_document',
      'append_v1_shadow_document_revision',
      'save_v1_shadow_document_checkpoint',
      'tombstone_v1_shadow_document',
      'list_v1_shadow_documents',
      'get_v1_shadow_document',
      'pull_v1_shadow_document_changes'
    );
  if v_count <> 3 or exists (
    select 1 from unnest(array[
      'list_v1_shadow_documents',
      'get_v1_shadow_document',
      'pull_v1_shadow_document_changes'
    ]) as required_read(routine_name)
    where not exists (
      select 1
      from information_schema.routine_privileges as privilege
      where privilege.specific_schema = 'public'
        and privilege.grantee = 'authenticated'
        and privilege.privilege_type = 'EXECUTE'
        and privilege.routine_name = required_read.routine_name
    )
  ) then
    raise exception 'Exactly list/get/pull must have authenticated EXECUTE, found %', v_count;
  end if;

  if exists (
    select 1 from information_schema.routine_privileges
    where specific_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'service_role')
      and routine_name in (
        'create_v1_shadow_document',
        'append_v1_shadow_document_revision',
        'save_v1_shadow_document_checkpoint',
        'tombstone_v1_shadow_document',
        'list_v1_shadow_documents',
        'get_v1_shadow_document',
        'pull_v1_shadow_document_changes'
      )
  ) then
    raise exception 'Non-authenticated role can execute a mobile sync RPC';
  end if;

  if not exists (
    select 1 from information_schema.routine_privileges
    where specific_schema = 'public'
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE'
      and routine_name = 'resolve_v1_shadow_session_status'
  ) or exists (
    select 1 from information_schema.routine_privileges
    where specific_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and routine_name = 'resolve_v1_shadow_session_status'
  ) then
    raise exception 'Session status resolver is not service-role-only';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'authenticated'
      and privilege_type = 'SELECT'
      and table_name in (
        'ai_documents', 'ai_document_revisions', 'document_checkpoints',
        'self_review_events', 'ai_document_sync_changes',
        'ai_document_mutation_receipts', 'privacy_reviews',
        'privacy_review_findings', 'privacy_confirmations'
      )
  ) then
    raise exception 'Authenticated can directly read canonical or internal sync tables';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'point_ledger_entries'
      and column_name = 'source'
  ) or to_regclass('public.point_ledger_grant_source_reference_idx') is null
     or to_regclass('public.point_ledger_grant_reference_idx') is not null then
    raise exception 'Points GRANT source identity correction is incomplete';
  end if;
end
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '81000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'v1-mobile-sync-a@example.invalid', 'test-only-no-login', now(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb, now(), now()
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'v1-mobile-sync-b@example.invalid', 'test-only-no-login', now(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb, now(), now()
  );

insert into auth.sessions (
  id, user_id, created_at, updated_at, not_after
) values
  (
    '81100000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001', now(), now(), null
  ),
  (
    '82200000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002', now(), now(), null
  ),
  (
    '81100000-0000-4000-8000-000000000099',
    '81000000-0000-4000-8000-000000000001',
    now(), now(), now() - interval '1 second'
  );

insert into public.privacy_reviews (
  id, owner_user_id, note_type, cleaned_facts_hash, schema_version,
  status, finding_decisions, confirmed_at, expires_at,
  contract_version, scanner_policy_version, review_revision,
  mutation_id, request_fingerprint, deidentification_confirmed,
  authority_to_process_confirmed, shadow_only
) values
  (
    '84000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001', 'communication',
    public.v1_shadow_content_sha256(
      '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"}'::jsonb
    ),
    '2026-08-09.v1-shadow', 'CONFIRMED', '[]'::jsonb,
    now(), now() + interval '30 minutes',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    'privacy.fixture.owner-a.communication.0001',
    'ba791494955ed03671ea6d3ffbfc4c821d97fc4f9fff0274b53fbef8347a598e',
    true, true, true
  ),
  (
    '84000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002', 'progress',
    public.v1_shadow_content_sha256(
      '{"occurred_at":"2026-08-11T00:15:30Z","support_type":"home support","support_delivered":"delivered","observable_facts":"clean","action_taken":"documented"}'::jsonb
    ),
    '2026-08-09.v1-shadow', 'CONFIRMED', '[]'::jsonb,
    now(), now() + interval '30 minutes',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    'privacy.fixture.owner-b.progress.0001',
    '16e2ef1fa2af41e2ff250d7829b88c122e32cf2c6ba7c2d80958a1a5432aaf9b',
    true, true, true
  ),
  (
    '84000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000001', 'handover',
    public.v1_shadow_content_sha256(
      '{"occurred_at":"2026-08-11T00:15:30Z","current_status":"stable","observable_facts":"clean","actions_completed":"documented","outstanding_items":"none stated"}'::jsonb
    ),
    '2026-08-09.v1-shadow', 'CONFIRMED', '[]'::jsonb,
    now(), now() + interval '30 minutes',
    '1.0.0-shadow.1', '2026-08-11.preview.1', 1,
    'privacy.fixture.owner-a.handover.0001',
    '918631f28c6c3113e506ceda85607ed44368cb902c44dfd57e57d3b409db4593',
    true, true, true
  );

-- Even a database owner cannot use the SECURITY DEFINER resolver unless the
-- request itself carries the service_role claim.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001"}',
  true
);
do $$
begin
  begin
    perform public.resolve_v1_shadow_session_status(
      '81000000-0000-4000-8000-000000000001',
      '81100000-0000-4000-8000-000000000001'
    );
    raise exception 'Non-service JWT unexpectedly resolved session status';
  exception
    when raise_exception then
      if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
end
$$;

select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;
do $$
begin
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'ACTIVE' then
    raise exception 'Active session did not resolve ACTIVE';
  end if;
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81900000-0000-4000-8000-000000000099'
  ) <> 'REVOKED' then
    raise exception 'Missing session did not resolve REVOKED';
  end if;
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000099'
  ) <> 'REVOKED' then
    raise exception 'Expired existing session did not resolve REVOKED';
  end if;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Eligibility is bound to trusted Auth user state as well as the exact
-- session row. User-editable metadata can never supply the provider role.
do $$
declare
  v_at timestamptz := clock_timestamp();
begin
  update auth.users
  set raw_app_meta_data = raw_app_meta_data - 'role',
      raw_user_meta_data = '{"role":"provider"}'::jsonb
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'User metadata role unexpectedly authorized a provider session';
  end if;

  update auth.users
  set raw_user_meta_data = '{}'::jsonb
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Missing trusted provider role unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Admin role unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set raw_app_meta_data = raw_app_meta_data || '{"role":"provider"}'::jsonb,
      is_anonymous = true
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Anonymous provider unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set is_anonymous = false,
      banned_until = clock_timestamp() + interval '1 hour'
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Banned provider unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set banned_until = null,
      deleted_at = clock_timestamp()
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Deleted provider unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set deleted_at = null,
      email_confirmed_at = null
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Unconfirmed provider unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set email_confirmed_at = v_at + interval '1 hour'
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Future-confirmed provider unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set email_confirmed_at = v_at,
      aud = 'unexpected'
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Wrong Auth audience unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set aud = 'authenticated',
      role = 'unexpected'
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Wrong Auth database role unexpectedly resolved ACTIVE';
  end if;

  update auth.users
  set role = 'authenticated',
      banned_until = v_at
  where id = '81000000-0000-4000-8000-000000000001';
  if not public.v1_shadow_session_is_active(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001',
    v_at
  ) then
    raise exception 'Ban expiring at the decision time remained active';
  end if;

  update auth.users
  set banned_until = v_at - interval '1 second'
  where id = '81000000-0000-4000-8000-000000000001';
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'ACTIVE' then
    raise exception 'Eligible provider did not recover ACTIVE after role-state restoration';
  end if;

  update auth.users
  set banned_until = null
  where id = '81000000-0000-4000-8000-000000000001';
end
$$;

update public.v1_mobile_sync_shadow_flags
set enabled = true, updated_at = now()
where feature_key = 'mobile_sync_v1';

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001","session_id":"81100000-0000-4000-8000-000000000001"}',
  true
);
do $$
declare
  v_create jsonb;
  v_replay jsonb;
  v_append jsonb;
  v_checkpoint jsonb;
  v_tombstone jsonb;
  v_pull jsonb;
  v_second jsonb;
  v_error_detail text;
  v_communication_content_first jsonb :=
    '{"englishDraft":"first","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_communication_content_second jsonb :=
    '{"englishDraft":"second","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_communication_content_different jsonb :=
    '{"englishDraft":"different","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_handover_content jsonb :=
    '{"englishDraft":"list-page-two","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","current_status":"stable","observable_facts":"clean","actions_completed":"documented","outstanding_items":"none stated"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
begin
  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_communication_content_first,
      public.v1_shadow_content_sha256(v_communication_content_first),
      'create.privacy.missing.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1', null
    );
    raise exception 'Create without privacy review unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'PRIVACY_REVIEW_REQUIRED' then raise; end if;
  end;

  v_create := public.create_v1_shadow_document(
    'communication', 'en', v_communication_content_first,
    public.v1_shadow_content_sha256(v_communication_content_first),
    'create.mobile.sync.0001',
    '2026-08-09.v1-shadow', '1.0.0-shadow.1',
    '84000000-0000-4000-8000-000000000001'
  );
  if v_create->>'saveState' <> 'SERVER_ACKNOWLEDGED'
    or v_create->'document'->>'canonicalId' is null
    or v_create->'revision'->>'revisionId' is null
    or v_create->'document'->>'currentRevisionId'
      is distinct from v_create->'revision'->>'revisionId'
    or (v_create->'revision'->>'revisionNumber')::integer <> 1 then
    raise exception 'Create + first revision ACK contract failed';
  end if;

  v_replay := public.create_v1_shadow_document(
    'communication', 'en', v_communication_content_first,
    public.v1_shadow_content_sha256(v_communication_content_first),
    'create.mobile.sync.0001',
    '2026-08-09.v1-shadow', '1.0.0-shadow.1',
    '84000000-0000-4000-8000-000000000001'
  );
  if v_replay <> v_create then
    raise exception 'Create replay did not return the original ACK';
  end if;

  begin
    perform public.append_v1_shadow_document_revision(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_create->'revision'->>'revisionId')::uuid,
      v_communication_content_second,
      public.v1_shadow_content_sha256(v_communication_content_second),
      'append.privacy.missing.0001', '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', null
    );
    raise exception 'Append without privacy review unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'PRIVACY_REVIEW_REQUIRED' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_communication_content_different,
      public.v1_shadow_content_sha256(v_communication_content_different),
      'create.mobile.sync.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      '84000000-0000-4000-8000-000000000001'
    );
    raise exception 'Conflicting create replay unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_communication_content_first,
      public.v1_shadow_content_sha256(v_communication_content_different),
      'create.hash.check.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      '84000000-0000-4000-8000-000000000001'
    );
    raise exception 'Content hash mismatch unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.append_v1_shadow_document_revision(
      (v_create->'document'->>'canonicalId')::uuid,
      '8f000000-0000-4000-8000-000000000099'::uuid,
      v_communication_content_second,
      public.v1_shadow_content_sha256(v_communication_content_second),
      'append.mobile.sync.0001', '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '84000000-0000-4000-8000-000000000001'
    );
    raise exception 'Stale append unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'STALE_REVISION' then raise; end if;
      get stacked diagnostics v_error_detail = pg_exception_detail;
      if v_error_detail::jsonb->>'canonicalId'
          is distinct from v_create->'document'->>'canonicalId'
        or v_error_detail::jsonb->>'currentRevisionId'
          is distinct from v_create->'revision'->>'revisionId'
        or (v_error_detail::jsonb->>'currentRevisionNumber')::integer <> 1
      then
        raise exception 'Stale append conflict detail contract failed';
      end if;
  end;

  v_append := public.append_v1_shadow_document_revision(
    (v_create->'document'->>'canonicalId')::uuid,
    (v_create->'revision'->>'revisionId')::uuid,
    v_communication_content_second,
    public.v1_shadow_content_sha256(v_communication_content_second),
    'append.mobile.sync.0001', '2026-08-09.v1-shadow',
    '1.0.0-shadow.1', '84000000-0000-4000-8000-000000000001'
  );
  if (v_append->'revision'->>'revisionNumber')::integer <> 2
    or v_append->'document'->>'currentRevisionId'
      is distinct from v_append->'revision'->>'revisionId' then
    raise exception 'Append revision number contract failed';
  end if;

  begin
    perform public.save_v1_shadow_document_checkpoint(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_create->'revision'->>'revisionId')::uuid,
      'review', array['facts'],
      'checkpoint.stale.0001'
    );
    raise exception 'Stale checkpoint unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'STALE_REVISION' then raise; end if;
      get stacked diagnostics v_error_detail = pg_exception_detail;
      if v_error_detail::jsonb->>'canonicalId'
          is distinct from v_create->'document'->>'canonicalId'
        or v_error_detail::jsonb->>'currentRevisionId'
          is distinct from v_append->'revision'->>'revisionId'
        or (v_error_detail::jsonb->>'currentRevisionNumber')::integer <> 2
      then
        raise exception 'Stale checkpoint conflict detail contract failed';
      end if;
  end;

  v_checkpoint := public.save_v1_shadow_document_checkpoint(
    (v_create->'document'->>'canonicalId')::uuid,
    (v_append->'revision'->>'revisionId')::uuid,
    'review', array['wording', 'facts', 'wording'],
    'checkpoint.sync.0001',
    (v_create->'revision'->>'revisionId')::uuid
  );
  if v_checkpoint->>'saveState' <> 'SERVER_ACKNOWLEDGED'
    or v_checkpoint->'checkpoint'->'completedFieldCodes'
      <> '["facts", "wording"]'::jsonb
    or v_checkpoint->'checkpoint'->>'syncStatus'
      <> 'SERVER_ACKNOWLEDGED' then
    raise exception 'Checkpoint ACK contract failed';
  end if;

  v_replay := public.save_v1_shadow_document_checkpoint(
    (v_create->'document'->>'canonicalId')::uuid,
    (v_append->'revision'->>'revisionId')::uuid,
    'review', array['wording', 'facts', 'wording'],
    'checkpoint.sync.0001',
    (v_create->'revision'->>'revisionId')::uuid
  );
  if v_replay <> v_checkpoint then
    raise exception 'Checkpoint replay did not return the original ACK';
  end if;

  begin
    perform public.save_v1_shadow_document_checkpoint(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_append->'revision'->>'revisionId')::uuid,
      'review', array['facts', 'wording', 'wording'],
      'checkpoint.sync.0001',
      (v_create->'revision'->>'revisionId')::uuid
    );
    raise exception 'Checkpoint reordered payload replay unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.save_v1_shadow_document_checkpoint(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_append->'revision'->>'revisionId')::uuid,
      'review', array['wording', 'facts'],
      'checkpoint.sync.0001',
      (v_create->'revision'->>'revisionId')::uuid
    );
    raise exception 'Checkpoint duplicate-difference replay unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.tombstone_v1_shadow_document(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_create->'revision'->>'revisionId')::uuid,
      null,
      'tombstone.stale.0001'
    );
    raise exception 'Stale tombstone unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'STALE_REVISION' then raise; end if;
      get stacked diagnostics v_error_detail = pg_exception_detail;
      if v_error_detail::jsonb->>'canonicalId'
          is distinct from v_create->'document'->>'canonicalId'
        or v_error_detail::jsonb->>'currentRevisionId'
          is distinct from v_append->'revision'->>'revisionId'
        or (v_error_detail::jsonb->>'currentRevisionNumber')::integer <> 2
      then
        raise exception 'Stale tombstone conflict detail contract failed';
      end if;
  end;

  v_tombstone := public.tombstone_v1_shadow_document(
    (v_create->'document'->>'canonicalId')::uuid,
    (v_append->'revision'->>'revisionId')::uuid,
    null,
    'tombstone.sync.0001'
  );
  if v_tombstone->'document'->>'deletedAt' is null
    or v_tombstone->'document'->>'lifecycleStatus' <> 'TOMBSTONED' then
    raise exception 'Tombstone ACK omitted deletedAt';
  end if;

  begin
    perform public.tombstone_v1_shadow_document(
      (v_create->'document'->>'canonicalId')::uuid,
      (v_append->'revision'->>'revisionId')::uuid,
      'duplicate_tombstone',
      'tombstone.sync.0002'
    );
    raise exception 'Second tombstone mutation unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'INVALID_STATE_TRANSITION' then raise; end if;
  end;

  perform set_config(
    'test.owner_a_document_id', v_create->'document'->>'canonicalId', true
  );
  perform set_config(
    'test.owner_a_revision_id', v_append->'revision'->>'revisionId', true
  );

  v_pull := public.pull_v1_shadow_document_changes(0, 2);
  if jsonb_array_length(v_pull->'changes') <> 2
    or (v_pull->>'hasMore')::boolean is not true
    or v_pull->>'nextCursor' is null then
    raise exception 'Cursor first page contract failed';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_pull->'changes') as item
    where item->>'noteType' is distinct from 'communication'
  ) then
    raise exception 'Cursor first page omitted the owner-scoped Note type';
  end if;
  v_pull := public.pull_v1_shadow_document_changes(
    (v_pull->>'nextCursor')::bigint, 100
  );
  if not exists (
    select 1 from jsonb_array_elements(v_pull->'changes') as item
    where item->>'kind' = 'DOCUMENT_TOMBSTONED'
      and item->>'deletedAt' is not null
      and item->>'noteType' = 'communication'
  ) then
    raise exception 'Cursor tombstone propagation failed or omitted Note type';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_pull->'changes') as item
    where item->>'noteType' is distinct from 'communication'
  ) then
    raise exception 'Cursor later page omitted the owner-scoped Note type';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_pull->'changes') as item
    where item->>'lastMutationId' = 'checkpoint.sync.0001'
      and item->'revision'->>'revisionId'
        is distinct from v_append->'revision'->>'revisionId'
  ) then
    raise exception 'Checkpoint change feed regressed to activeRevisionId';
  end if;
  perform set_config(
    'test.owner_a_change_cursor', v_pull->>'nextCursor', true
  );

  v_second := public.create_v1_shadow_document(
    'handover', 'zh-Hant', v_handover_content,
    public.v1_shadow_content_sha256(v_handover_content),
    'create.mobile.sync.0003',
    '2026-08-09.v1-shadow', '1.0.0-shadow.1',
    '84000000-0000-4000-8000-000000000003'
  );
  if v_second->'document'->>'canonicalId' is null then
    raise exception 'Second owner A document create failed';
  end if;

end
$$;

set local role authenticated;
do $$
declare
  v_list_first jsonb;
  v_list_second jsonb;
  v_get jsonb;
begin
  v_list_first := public.list_v1_shadow_documents(null, 1);
  if jsonb_array_length(v_list_first->'documents') <> 1
    or (v_list_first->>'hasMore')::boolean is not true
    or v_list_first->>'nextCursor' is null then
    raise exception 'Document list first page contract failed';
  end if;
  v_list_second := public.list_v1_shadow_documents(
    (v_list_first->>'nextCursor')::uuid, 1
  );
  if jsonb_array_length(v_list_second->'documents') <> 1
    or (v_list_second->>'hasMore')::boolean is not false
    or v_list_second->>'nextCursor' is not null
    or v_list_first->'documents'->0->>'canonicalId'
      = v_list_second->'documents'->0->>'canonicalId' then
    raise exception 'Document list UUID cursor contract failed';
  end if;

  v_get := public.get_v1_shadow_document(
    current_setting('test.owner_a_document_id')::uuid
  );
  if v_get->'document'->>'canonicalId'
      is distinct from current_setting('test.owner_a_document_id')
    or jsonb_array_length(v_get->'revisions') <> 2
    or v_get->'checkpoint'->>'mutationId' <> 'checkpoint.sync.0001'
    or v_get->>'selfReviewStatus' <> 'REQUIRED'
    or v_get->'document' ? 'ownerUserId'
  then
    raise exception 'Get document full DTO contract failed';
  end if;

  begin
    perform public.resolve_v1_shadow_session_status(
      '81000000-0000-4000-8000-000000000001',
      '81100000-0000-4000-8000-000000000001'
    );
    raise exception 'Authenticated unexpectedly executed session resolver';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.assert_v1_shadow_note_facts(
      'communication', '2026-08-09.v1-shadow', '{}'::jsonb
    );
    raise exception 'Authenticated unexpectedly executed Note facts validator';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.assert_v1_shadow_privacy_finding_paths(
      'communication', '[]'::jsonb
    );
    raise exception 'Authenticated unexpectedly executed finding path validator';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.v1_shadow_session_is_active(
      '81000000-0000-4000-8000-000000000001',
      '81100000-0000-4000-8000-000000000001',
      clock_timestamp()
    );
    raise exception 'Authenticated unexpectedly executed active-session helper';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', '{"englishDraft":"blocked","reviewVersions":{},"factsSummary":{},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb,
      '8ee32d70541e98ec7334296c950703c2658c422c4d195396b78f285a11bf5e1b',
      'create.blocked.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      '84000000-0000-4000-8000-000000000001'
    );
    raise exception 'Authenticated write RPC unexpectedly executable';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.ai_documents (
      owner_user_id, note_type, source_locale, schema_version,
      contract_version
    ) values (
      '81000000-0000-4000-8000-000000000001',
      'communication', 'en', '2026-08-09.v1-shadow',
      '1.0.0-shadow.1'
    );
    raise exception 'Direct authenticated write unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.ai_documents;
    raise exception 'Direct authenticated SELECT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Frozen Product V1 must not mix legacy NDIS projections into its DTOs. This
-- is stricter than the legacy owner policy: even a healthy matching source is
-- hidden until an explicit future adapter/migration converts it to frozen V1.
insert into public.generated_material_drafts (
  id, user_id, feature, status, content, created_at, updated_at
) values
  (
    'v1-mobile-visible-source',
    '81000000-0000-4000-8000-000000000001',
    'ndis_case_note', 'draft', '{}'::jsonb,
    '2026-08-10T10:00:00Z', '2026-08-10T10:00:00Z'
  ),
  (
    'v1-mobile-deleted-source',
    '81000000-0000-4000-8000-000000000001',
    'ndis_case_note', 'draft', '{}'::jsonb,
    '2026-08-10T10:01:00Z', '2026-08-10T10:01:00Z'
  ),
  (
    'v1-mobile-replacement-generation',
    '81000000-0000-4000-8000-000000000001',
    'ndis_case_note', 'draft', '{}'::jsonb,
    '2026-08-10T11:00:00Z', '2026-08-10T11:00:00Z'
  );

insert into public.ai_documents (
  id, owner_user_id, legacy_source_draft_id,
  legacy_source_owner_user_id, note_type, source_locale,
  lifecycle_status, current_revision_number, schema_version,
  contract_version, created_at, updated_at, tombstoned_at
) values
  (
    '83000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'v1-mobile-visible-source',
    '81000000-0000-4000-8000-000000000001',
    'ndis', 'en', 'IN_PROGRESS', 0,
    'legacy.generated_material_drafts.ndis_case_note.v1',
    '1.0.0-shadow.1',
    '2026-08-10T10:00:00Z', '2026-08-10T10:00:00Z', null
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001',
    'v1-mobile-deleted-source',
    '81000000-0000-4000-8000-000000000001',
    'ndis', 'en', 'IN_PROGRESS', 0,
    'legacy.generated_material_drafts.ndis_case_note.v1',
    '1.0.0-shadow.1',
    '2026-08-10T10:01:00Z', '2026-08-10T10:01:00Z', null
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000001',
    null, null,
    'ndis', 'en', 'TOMBSTONED', 0,
    'legacy.generated_material_drafts.ndis_case_note.v1',
    '1.0.0-shadow.1',
    '2026-08-10T10:02:00Z', '2026-08-10T10:02:00Z',
    '2026-08-10T10:02:00Z'
  ),
  (
    '83000000-0000-4000-8000-000000000004',
    '81000000-0000-4000-8000-000000000001',
    'v1-mobile-replacement-generation',
    '81000000-0000-4000-8000-000000000001',
    'ndis', 'en', 'IN_PROGRESS', 0,
    'legacy.generated_material_drafts.ndis_case_note.v1',
    '1.0.0-shadow.1',
    '2026-08-10T10:03:00Z', '2026-08-10T10:03:00Z', null
  );

-- Simulate source deletion whose separately retried tombstone cleanup has not
-- completed yet. The active canonical row must already fail closed.
delete from public.generated_material_drafts
where id = 'v1-mobile-deleted-source'
  and user_id = '81000000-0000-4000-8000-000000000001';

insert into public.ai_document_sync_changes (
  owner_user_id, change_kind, document_id, revision_id,
  last_mutation_id, server_time, deleted_at, shadow_only
) values (
  '81000000-0000-4000-8000-000000000001',
  'DOCUMENT_TOMBSTONED',
  '83000000-0000-4000-8000-000000000001',
  null,
  'legacy.change.blocked.0001',
  '2026-08-10T12:00:00Z',
  '2026-08-10T12:00:00Z',
  true
);

do $$
begin
  begin
    perform public.append_v1_shadow_document_revision(
      '83000000-0000-4000-8000-000000000001',
      '83100000-0000-4000-8000-000000000001',
      '{"englishDraft":"legacy-blocked","reviewVersions":{},"factsSummary":{},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb,
      '70d1443cbb44a9e22c8cbe90efda16c039b30f02569c6025534cb5650f16bca5',
      'append.legacy.blocked.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1'
    );
    raise exception 'Legacy append unexpectedly entered frozen Product V1';
  exception
    when raise_exception then
      if sqlerrm <> 'PRIVACY_REVIEW_REQUIRED' then raise; end if;
  end;

  begin
    perform public.save_v1_shadow_document_checkpoint(
      '83000000-0000-4000-8000-000000000001',
      '83100000-0000-4000-8000-000000000001',
      'review', array['facts'], 'checkpoint.legacy.blocked.0001'
    );
    raise exception 'Legacy checkpoint unexpectedly entered frozen Product V1';
  exception
    when raise_exception then
      if sqlerrm <> 'NOT_FOUND' then raise; end if;
  end;

  begin
    perform public.tombstone_v1_shadow_document(
      '83000000-0000-4000-8000-000000000001',
      '83100000-0000-4000-8000-000000000001',
      null, 'tombstone.legacy.blocked.0001'
    );
    raise exception 'Legacy tombstone unexpectedly entered frozen Product V1';
  exception
    when raise_exception then
      if sqlerrm <> 'NOT_FOUND' then raise; end if;
  end;
end
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001","session_id":"81100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $$
declare
  v_list jsonb;
  v_pull jsonb;
  v_hidden_id uuid;
begin
  v_list := public.list_v1_shadow_documents(null, 100);
  if exists (
    select 1 from jsonb_array_elements(v_list->'documents') as document
    where document->>'canonicalId' in (
      '83000000-0000-4000-8000-000000000001',
      '83000000-0000-4000-8000-000000000002',
      '83000000-0000-4000-8000-000000000003',
      '83000000-0000-4000-8000-000000000004'
    )
  ) then
    raise exception 'Fail-closed legacy document leaked into document list';
  end if;

  v_pull := public.pull_v1_shadow_document_changes(0, 100);
  if exists (
    select 1 from jsonb_array_elements(v_pull->'changes') as change
    where change->>'canonicalId' like '83000000-0000-4000-8000-%'
  ) then
    raise exception 'Legacy document change leaked into frozen Product V1 sync';
  end if;

  foreach v_hidden_id in array array[
    '83000000-0000-4000-8000-000000000001'::uuid,
    '83000000-0000-4000-8000-000000000002'::uuid,
    '83000000-0000-4000-8000-000000000003'::uuid,
    '83000000-0000-4000-8000-000000000004'::uuid
  ] loop
    begin
      perform public.get_v1_shadow_document(v_hidden_id);
      raise exception 'Fail-closed legacy document unexpectedly served by get';
    exception
      when raise_exception then
        if sqlerrm <> 'NOT_FOUND' then raise; end if;
    end;
  end loop;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '82000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"82000000-0000-4000-8000-000000000002","session_id":"82200000-0000-4000-8000-000000000002"}',
  true
);
do $$
declare
  v_b jsonb;
  v_progress_content jsonb :=
    '{"englishDraft":"owner-b","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","support_type":"home support","support_delivered":"delivered","observable_facts":"clean","action_taken":"documented"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
begin
  v_b := public.create_v1_shadow_document(
    'progress', 'zh-Hans', v_progress_content,
    public.v1_shadow_content_sha256(v_progress_content),
    'create.mobile.sync.0002',
    '2026-08-09.v1-shadow', '1.0.0-shadow.1',
    '84000000-0000-4000-8000-000000000002'
  );
  if v_b->'document'->>'canonicalId' is null then
    raise exception 'Owner B create failed';
  end if;
  perform set_config(
    'test.owner_b_document_id', v_b->'document'->>'canonicalId', true
  );

  begin
    perform public.append_v1_shadow_document_revision(
      current_setting('test.owner_a_document_id')::uuid,
      current_setting('test.owner_a_revision_id')::uuid,
      v_progress_content || '{"englishDraft":"cross-owner"}'::jsonb,
      public.v1_shadow_content_sha256(
        v_progress_content || '{"englishDraft":"cross-owner"}'::jsonb
      ),
      'append.mobile.sync.0002', '2026-08-09.v1-shadow',
      '1.0.0-shadow.1', '84000000-0000-4000-8000-000000000002'
    );
    raise exception 'Cross-owner append unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'NOT_FOUND' then raise; end if;
  end;
end
$$;

set local role authenticated;
do $$
declare
  v_list jsonb;
  v_get jsonb;
begin
  v_list := public.list_v1_shadow_documents(null, 50);
  if jsonb_array_length(v_list->'documents') <> 1
    or v_list->'documents'->0->>'canonicalId'
      is distinct from current_setting('test.owner_b_document_id') then
    raise exception 'Owner B list leaked another owner document';
  end if;
  v_get := public.get_v1_shadow_document(
    current_setting('test.owner_b_document_id')::uuid
  );
  if v_get->'document'->>'canonicalId'
      is distinct from current_setting('test.owner_b_document_id') then
    raise exception 'Owner B could not read its own document';
  end if;

  begin
    perform public.list_v1_shadow_documents(
      current_setting('test.owner_a_document_id')::uuid, 50
    );
    raise exception 'Owner B unexpectedly accepted owner A document cursor';
  exception
    when raise_exception then
      if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.pull_v1_shadow_document_changes(
      current_setting('test.owner_a_change_cursor')::bigint, 50
    );
    raise exception 'Owner B unexpectedly accepted owner A change cursor';
  exception
    when raise_exception then
      if sqlerrm <> 'VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.get_v1_shadow_document(
      current_setting('test.owner_a_document_id')::uuid
    );
    raise exception 'Cross-owner get unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'NOT_FOUND' then raise; end if;
  end;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- An expired session row is not active merely because it still exists.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001","session_id":"81100000-0000-4000-8000-000000000099"}',
  true
);
do $$
declare
  v_content jsonb :=
    '{"englishDraft":"expired-session","reviewVersions":{},"factsSummary":{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"},"missingFacts":[],"neutralWordingChecks":[],"followUpPrompts":[],"disclaimer":"Draft for review."}'::jsonb;
  v_document_count bigint;
  v_revision_count bigint;
  v_checkpoint_count bigint;
  v_change_count bigint;
  v_receipt_count bigint;
begin
  select count(*) into v_document_count from public.ai_documents;
  select count(*) into v_revision_count from public.ai_document_revisions;
  select count(*) into v_checkpoint_count from public.document_checkpoints;
  select count(*) into v_change_count from public.ai_document_sync_changes;
  select count(*) into v_receipt_count from public.ai_document_mutation_receipts;

  begin
    perform public.list_v1_shadow_documents(null, 50);
    raise exception 'Expired session unexpectedly listed documents';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.get_v1_shadow_document(
      current_setting('test.owner_a_document_id')::uuid
    );
    raise exception 'Expired session unexpectedly read a document';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.create_v1_shadow_document(
      'communication', 'en', v_content,
      public.v1_shadow_content_sha256(v_content),
      'create.expired.session.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      '84000000-0000-4000-8000-000000000001'
    );
    raise exception 'Expired session unexpectedly created a document';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.append_v1_shadow_document_revision(
      current_setting('test.owner_a_document_id')::uuid,
      current_setting('test.owner_a_revision_id')::uuid,
      v_content, public.v1_shadow_content_sha256(v_content),
      'append.expired.session.0001',
      '2026-08-09.v1-shadow', '1.0.0-shadow.1',
      '84000000-0000-4000-8000-000000000001'
    );
    raise exception 'Expired session unexpectedly appended a revision';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.save_v1_shadow_document_checkpoint(
      current_setting('test.owner_a_document_id')::uuid,
      current_setting('test.owner_a_revision_id')::uuid,
      'review', array['facts'], 'checkpoint.expired.session.0001'
    );
    raise exception 'Expired session unexpectedly saved a checkpoint';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.tombstone_v1_shadow_document(
      current_setting('test.owner_a_document_id')::uuid,
      current_setting('test.owner_a_revision_id')::uuid,
      null, 'tombstone.expired.session.0001'
    );
    raise exception 'Expired session unexpectedly tombstoned a document';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.pull_v1_shadow_document_changes(0, 50);
    raise exception 'Expired session unexpectedly pulled changes';
  exception when raise_exception then
    if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;

  if (select count(*) from public.ai_documents) <> v_document_count
    or (select count(*) from public.ai_document_revisions) <> v_revision_count
    or (select count(*) from public.document_checkpoints) <> v_checkpoint_count
    or (select count(*) from public.ai_document_sync_changes) <> v_change_count
    or (select count(*) from public.ai_document_mutation_receipts) <> v_receipt_count
  then
    raise exception 'Expired-session rejection caused a side effect';
  end if;
end
$$;

delete from auth.sessions
where id = '81100000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"81000000-0000-4000-8000-000000000001","session_id":"81100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $$
begin
  begin
    perform public.list_v1_shadow_documents(null, 50);
    raise exception 'Revoked session unexpectedly listed documents';
  exception
    when raise_exception then
      if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.get_v1_shadow_document(
      current_setting('test.owner_a_document_id')::uuid
    );
    raise exception 'Revoked session unexpectedly read a document';
  exception
    when raise_exception then
      if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.pull_v1_shadow_document_changes(0, 50);
    raise exception 'Revoked session unexpectedly served data';
  exception
    when raise_exception then
      if sqlerrm <> 'SESSION_REVOKED' then raise; end if;
  end;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;
do $$
begin
  if public.resolve_v1_shadow_session_status(
    '81000000-0000-4000-8000-000000000001',
    '81100000-0000-4000-8000-000000000001'
  ) <> 'REVOKED' then
    raise exception 'Deleted session did not resolve REVOKED';
  end if;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

update public.v1_mobile_sync_shadow_flags
set enabled = false, updated_at = now()
where feature_key = 'mobile_sync_v1';
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '82000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"82000000-0000-4000-8000-000000000002","session_id":"82200000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

do $$
begin
  begin
    perform public.list_v1_shadow_documents(null, 50);
    raise exception 'Disabled mobile sync feature unexpectedly listed documents';
  exception
    when raise_exception then
      if sqlerrm <> 'PRODUCT_API_DISABLED' then raise; end if;
  end;
  begin
    perform public.get_v1_shadow_document(
      current_setting('test.owner_b_document_id')::uuid
    );
    raise exception 'Disabled mobile sync feature unexpectedly read a document';
  exception
    when raise_exception then
      if sqlerrm <> 'PRODUCT_API_DISABLED' then raise; end if;
  end;
  begin
    perform public.pull_v1_shadow_document_changes(0, 50);
    raise exception 'Disabled mobile sync feature unexpectedly served data';
  exception
    when raise_exception then
      if sqlerrm <> 'PRODUCT_API_DISABLED' then raise; end if;
  end;
end
$$;

rollback;
