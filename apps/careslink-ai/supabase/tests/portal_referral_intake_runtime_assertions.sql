-- Manual rollback-only assertions for the Production-unapplied Portal Referral
-- intake runtime. Run only after the exact foundation and intake migrations on
-- a disposable database. No fixture may survive the final ROLLBACK.

begin;

do $$
declare
  v_signature text;
  v_role text;
  v_table text;
  v_definition text;
  v_search_path text;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.portal_workflow_flags'::regclass
      and conname = 'portal_workflow_flags_enabled_check'
  ) then
    raise exception 'portal enabled=false hard lock remains';
  end if;

  if pg_get_expr(
    (
      select adbin from pg_attrdef
      where adrelid = 'public.portal_workflow_flags'::regclass
        and adnum = (
          select attnum from pg_attribute
          where attrelid = 'public.portal_workflow_flags'::regclass
            and attname = 'enabled' and not attisdropped
        )
    ),
    'public.portal_workflow_flags'::regclass
  ) is distinct from 'false'
    or (select enabled from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from false
    or (select preview_only from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from true
  then
    raise exception 'portal flag is not default-off Preview-only';
  end if;

  if to_regclass('public.portal_referrals_source_updated_id_idx') is null then
    raise exception 'portal intake list composite index is missing';
  end if;

  foreach v_signature in array array[
    'public.portal_referral_intake_authorize()',
    'public.portal_referral_intake_list(integer,timestamp with time zone,uuid)',
    'public.portal_referral_intake_create(text,text,text,text,text,text,text,text,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'portal intake RPC is missing: %', v_signature;
    end if;
    select
      pg_get_functiondef(routine.oid),
      coalesce((
        select setting
        from unnest(coalesce(routine.proconfig, '{}'::text[])) as setting
        where setting like 'search_path=%'
        limit 1
      ), '')
    into v_definition, v_search_path
    from pg_proc as routine
    where routine.oid = to_regprocedure(v_signature)
      and routine.prosecdef;

    if v_definition is null
      or v_search_path not in ('search_path=', 'search_path=""')
      or v_definition not like
        '%portal_referral_intake_assert_enabled()%'
    then
      raise exception 'unsafe or ungated portal intake RPC: %', v_signature;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or has_function_privilege('anon', v_signature, 'EXECUTE')
      or has_function_privilege('service_role', v_signature, 'EXECUTE')
    then
      raise exception 'unsafe portal intake RPC ACL: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'careslink_portal_private.portal_referral_intake_assert_enabled()',
    'careslink_portal_private.portal_referral_intake_context()'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'portal intake private helper is missing: %', v_signature;
    end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception '% can execute private helper %', v_role, v_signature;
      end if;
    end loop;
  end loop;

  select lower(pg_get_functiondef(to_regprocedure(
    'careslink_portal_private.portal_referral_intake_assert_enabled()'
  ))) into v_definition;
  if v_definition not like '%for share of flag%'
    or v_definition like '%for key share%'
  then
    raise exception 'capability row lock is weaker than FOR SHARE';
  end if;

  select lower(pg_get_functiondef(to_regprocedure(
    'careslink_portal_private.portal_referral_intake_context()'
  ))) into v_definition;
  if v_definition not like
      '%lock table public.portal_organizations in share mode%'
    or v_definition not like
      '%lock table public.portal_organization_memberships in share mode%'
    or v_definition not like
      '%for share of active_session, active_user%'
    or v_definition not like
      '%for share of membership, organization%'
    or v_definition like '%for key share%'
  then
    raise exception 'portal context lock/predicate boundary drifted';
  end if;

  foreach v_table in array array[
    'public.portal_workflow_flags',
    'public.portal_organizations',
    'public.portal_organization_memberships',
    'public.portal_referrals',
    'public.portal_mutation_receipts',
    'public.portal_audit_events',
    'careslink_portal_private.portal_referral_contacts'
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(v_role, v_table, 'SELECT')
        or has_table_privilege(v_role, v_table, 'INSERT')
        or has_table_privilege(v_role, v_table, 'UPDATE')
        or has_table_privilege(v_role, v_table, 'DELETE')
      then
        raise exception '% direct table privilege leaked on %', v_role, v_table;
      end if;
    end loop;
  end loop;
end
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a1000000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'intake-a@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2000000-0000-4000-8000-000000000002',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'intake-b@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a3000000-0000-4000-8000-000000000003',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'intake-ambiguous@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a4000000-0000-4000-8000-000000000004',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'intake-revoked-member@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a5000000-0000-4000-8000-000000000005',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'intake-revoked-session@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-000000000006',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'intake-expired-session@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('b1000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001', now(), now(), null),
  ('b2000000-0000-4000-8000-000000000002',
   'a2000000-0000-4000-8000-000000000002', now(), now(), null),
  ('b3000000-0000-4000-8000-000000000003',
   'a3000000-0000-4000-8000-000000000003', now(), now(), null),
  ('b4000000-0000-4000-8000-000000000004',
   'a4000000-0000-4000-8000-000000000004', now(), now(), null),
  ('b5000000-0000-4000-8000-000000000005',
   'a5000000-0000-4000-8000-000000000005', now(), now(), null),
  ('b6000000-0000-4000-8000-000000000006',
   'a6000000-0000-4000-8000-000000000006', now(), now(),
   pg_catalog.clock_timestamp() - interval '1 second');

insert into public.portal_organizations (
  id, organization_type, display_name, status
) values
  ('c1000000-0000-4000-8000-000000000001',
   'REFERRAL_SOURCE', 'Intake Source A', 'ACTIVE'),
  ('c2000000-0000-4000-8000-000000000002',
   'REFERRAL_SOURCE', 'Intake Source B', 'ACTIVE');

insert into public.portal_organization_memberships (
  organization_id, user_id, role, status
) values
  ('c1000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001',
   'referral_source', 'ACTIVE'),
  ('c2000000-0000-4000-8000-000000000002',
   'a2000000-0000-4000-8000-000000000002',
   'referral_source', 'ACTIVE'),
  ('c1000000-0000-4000-8000-000000000001',
   'a3000000-0000-4000-8000-000000000003',
   'referral_source', 'ACTIVE'),
  ('c2000000-0000-4000-8000-000000000002',
   'a3000000-0000-4000-8000-000000000003',
   'referral_source', 'ACTIVE'),
  ('c1000000-0000-4000-8000-000000000001',
   'a4000000-0000-4000-8000-000000000004',
   'referral_source', 'REVOKED'),
  ('c1000000-0000-4000-8000-000000000001',
   'a5000000-0000-4000-8000-000000000005',
   'referral_source', 'ACTIVE'),
  ('c1000000-0000-4000-8000-000000000001',
   'a6000000-0000-4000-8000-000000000006',
   'referral_source', 'ACTIVE');

-- Hard-off is checked before any body-bearing operation.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_authorize();
    raise exception 'hard-off authorize unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_list();
    raise exception 'hard-off list unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('0', 64), repeat('0', 64), 'Hard off fixture',
      'VIC_MELBOURNE', 'SUPPORT_COORDINATION',
      'Private Hard Off', '0400000000', null, repeat('1', 64)
    );
    raise exception 'hard-off create unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
end
$$;
reset role;

update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_workflow_v1';

delete from auth.sessions
where id = 'b5000000-0000-4000-8000-000000000005';

create temporary table portal_referral_intake_test_payloads (
  fixture_key text primary key,
  payload_hash text not null
) on commit drop;
create temporary table portal_referral_intake_test_results (
  fixture_key text primary key,
  value jsonb not null
) on commit drop;
grant select on table pg_temp.portal_referral_intake_test_payloads
  to authenticated;
grant select, insert, update on table
  pg_temp.portal_referral_intake_test_results to authenticated;

insert into pg_temp.portal_referral_intake_test_payloads (
  fixture_key, payload_hash
) values
  ('a1', public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1000000-0000-4000-8000-000000000001',
      'role', 'referral_source', 'providerId', null),
    'kind', 'CREATE_REFERRAL',
    'command', jsonb_build_object(
      'summary', 'Adult participant seeks support coordination',
      'region', 'VIC_MELBOURNE',
      'serviceType', 'SUPPORT_COORDINATION',
      'contact', jsonb_build_object(
        'name', 'Private Intake A', 'phone', '0400000011',
        'email', 'private-a@example.invalid'))))),
  ('a2', public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1000000-0000-4000-8000-000000000001',
      'role', 'referral_source', 'providerId', null),
    'kind', 'CREATE_REFERRAL',
    'command', jsonb_build_object(
      'summary', 'Adult participant seeks community participation',
      'region', 'VIC_REGIONAL',
      'serviceType', 'COMMUNITY_PARTICIPATION',
      'contact', jsonb_build_object(
        'name', 'Second Private Intake', 'phone', '0400000022',
        'email', null))))),
  ('b1', public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c2000000-0000-4000-8000-000000000002',
      'role', 'referral_source', 'providerId', null),
    'kind', 'CREATE_REFERRAL',
    'command', jsonb_build_object(
      'summary', 'Adult participant seeks daily living support',
      'region', 'VIC_GEELONG',
      'serviceType', 'DAILY_LIVING_SUPPORT',
      'contact', jsonb_build_object(
        'name', 'Private Intake B', 'phone', '0400000033',
        'email', null))))),
  ('atomic', public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1000000-0000-4000-8000-000000000001',
      'role', 'referral_source', 'providerId', null),
    'kind', 'CREATE_REFERRAL',
    'command', jsonb_build_object(
      'summary', 'Late atomic failure fixture',
      'region', 'VIC_MELBOURNE',
      'serviceType', 'DAILY_LIVING_SUPPORT',
      'contact', jsonb_build_object(
        'name', 'Private Atomic', 'phone', '0400000044',
        'email', null)))));

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_authorize();
    raise exception 'missing auth identity unexpectedly authorized';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_AUTH_REQUIRED' then raise; end if;
  end;
end
$$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a6000000-0000-4000-8000-000000000006","session_id":"b6000000-0000-4000-8000-000000000006"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_authorize();
    raise exception 'expired session unexpectedly authorized';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
end
$$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
declare
  v_authorization jsonb := public.portal_referral_intake_authorize();
begin
  if v_authorization - array[
      'authorized', 'user_id', 'organization_id', 'organization_type',
      'organization_status', 'membership_role', 'membership_status'
    ]::text[] <> '{}'::jsonb
    or v_authorization->>'authorized' is distinct from 'true'
    or v_authorization->>'user_id' is distinct from
      'a1000000-0000-4000-8000-000000000001'
    or v_authorization->>'organization_id' is distinct from
      'c1000000-0000-4000-8000-000000000001'
    or v_authorization->>'organization_type' is distinct from
      'REFERRAL_SOURCE'
    or v_authorization->>'organization_status' is distinct from 'ACTIVE'
    or v_authorization->>'membership_role' is distinct from 'referral_source'
    or v_authorization->>'membership_status' is distinct from 'ACTIVE'
  then
    raise exception 'Source A authorization envelope drifted: %',
      v_authorization;
  end if;
  if not exists (
    select 1 from pg_locks
    where pid = pg_backend_pid()
      and relation = 'public.portal_organizations'::regclass
      and mode = 'ShareLock' and granted
  ) or not exists (
    select 1 from pg_locks
    where pid = pg_backend_pid()
      and relation = 'public.portal_organization_memberships'::regclass
      and mode = 'ShareLock' and granted
  ) then
    raise exception 'portal exact-one SHARE table locks were not retained';
  end if;
end
$$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3000000-0000-4000-8000-000000000003","session_id":"b3000000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_authorize();
    raise exception 'ambiguous membership unexpectedly authorized';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end
$$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a4000000-0000-4000-8000-000000000004","session_id":"b4000000-0000-4000-8000-000000000004"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_list();
    raise exception 'revoked membership unexpectedly listed referrals';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end
$$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a5000000-0000-4000-8000-000000000005","session_id":"b5000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_authorize();
    raise exception 'revoked session unexpectedly authorized';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
end
$$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
declare
  v_payload_hash text;
  v_created jsonb;
  v_replayed jsonb;
begin
  select payload_hash into strict v_payload_hash
  from pg_temp.portal_referral_intake_test_payloads
  where fixture_key = 'a1';

  v_created := public.portal_referral_intake_create(
    repeat('1', 64), v_payload_hash,
    '  Adult participant seeks support coordination  ',
    'VIC_MELBOURNE', 'SUPPORT_COORDINATION',
    '  Private Intake A  ', '  0400000011  ',
    '  private-a@example.invalid  ', repeat('a', 64)
  );
  if v_created - array[
      'referral_id', 'match_id', 'current_status', 'row_version', 'updated_at'
    ]::text[] <> '{}'::jsonb
    or v_created->>'referral_id' is null
    or v_created->'match_id' is distinct from 'null'::jsonb
    or v_created->>'current_status' is distinct from 'SUBMITTED'
    or (v_created->>'row_version')::integer is distinct from 1
    or v_created->>'updated_at' is null
    or v_created::text ~*
      '(summary|contact|phone|email|payload|mutation|user_id|organization_id|Private Intake|0400000011)'
  then
    raise exception 'create ACK is not exact metadata-only: %', v_created;
  end if;

  v_replayed := public.portal_referral_intake_create(
    repeat('1', 64), v_payload_hash,
    'Adult participant seeks support coordination',
    'VIC_MELBOURNE', 'SUPPORT_COORDINATION',
    'Private Intake A', '0400000011',
    'private-a@example.invalid', repeat('b', 64)
  );
  if v_replayed is distinct from v_created then
    raise exception 'same-key same-payload replay drifted: %, %',
      v_created, v_replayed;
  end if;
  insert into pg_temp.portal_referral_intake_test_results (
    fixture_key, value
  ) values ('a1', v_created);
end
$$;
reset role;

do $$
declare
  v_referral_id uuid := (
    select (value->>'referral_id')::uuid
    from pg_temp.portal_referral_intake_test_results
    where fixture_key = 'a1'
  );
  v_payload_hash text := (
    select payload_hash
    from pg_temp.portal_referral_intake_test_payloads
    where fixture_key = 'a1'
  );
begin
  if (select count(*) from public.portal_referrals
      where id = v_referral_id
        and source_organization_id =
          'c1000000-0000-4000-8000-000000000001'
        and source_user_id =
          'a1000000-0000-4000-8000-000000000001'
        and summary = 'Adult participant seeks support coordination'
        and region = 'VIC_MELBOURNE'
        and service_type = 'SUPPORT_COORDINATION'
        and current_status = 'SUBMITTED'
        and row_version = 1) <> 1
    or (select count(*)
        from careslink_portal_private.portal_referral_contacts
        where referral_id = v_referral_id
          and contact_name = 'Private Intake A'
          and contact_phone = '0400000011'
          and contact_email = 'private-a@example.invalid') <> 1
    or (select count(*) from public.portal_mutation_receipts
        where actor_user_id =
            'a1000000-0000-4000-8000-000000000001'
          and mutation_id_hash = repeat('1', 64)
          and mutation_kind = 'CREATE_REFERRAL'
          and payload_hash = v_payload_hash
          and response_referral_id = v_referral_id
          and response_match_id is null
          and response_status = 'SUBMITTED'
          and response_row_version = 1) <> 1
    or (select count(*) from public.portal_audit_events
        where referral_id = v_referral_id
          and actor_user_id =
            'a1000000-0000-4000-8000-000000000001'
          and actor_role = 'referral_source'
          and mutation_kind = 'CREATE_REFERRAL'
          and from_status is null
          and to_status = 'SUBMITTED'
          and mutation_id_hash = repeat('1', 64)
          and correlation_id_hash = repeat('a', 64)
          and metadata = '{}'::jsonb) <> 1
  then
    raise exception 'atomic four-table create/replay state drifted';
  end if;
  if (select count(*) from public.portal_referrals) <> 1
    or (select count(*)
        from careslink_portal_private.portal_referral_contacts) <> 1
    or (select count(*) from public.portal_mutation_receipts) <> 1
    or (select count(*) from public.portal_audit_events) <> 1
  then
    raise exception 'replay duplicated one or more portal rows';
  end if;
end
$$;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
declare
  v_a2_hash text := (
    select payload_hash
    from pg_temp.portal_referral_intake_test_payloads
    where fixture_key = 'a2'
  );
begin
  begin
    perform public.portal_referral_intake_create(
      repeat('1', 64), v_a2_hash,
      'Adult participant seeks community participation',
      'VIC_REGIONAL', 'COMMUNITY_PARTICIPATION',
      'Second Private Intake', '0400000022', null, repeat('c', 64)
    );
    raise exception 'same-key different-payload unexpectedly replayed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('2', 64), repeat('0', 64),
      'Adult participant seeks community participation',
      'VIC_REGIONAL', 'COMMUNITY_PARTICIPATION',
      'Second Private Intake', '0400000022', null, repeat('c', 64)
    );
    raise exception 'caller-forged payload hash unexpectedly accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('3', 64), repeat('0', 64),
      'Support requested for Private Intake A',
      'VIC_MELBOURNE', 'SUPPORT_COORDINATION',
      'Private Intake A', '0400000011', null, repeat('c', 64)
    );
    raise exception 'contact name leaked into summary';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('4', 64), repeat('0', 64),
      'Email leak@example.invalid for support',
      'VIC_MELBOURNE', 'SUPPORT_COORDINATION',
      'Different Private Name', '0400000011',
      'leak@example.invalid', repeat('c', 64)
    );
    raise exception 'email leaked into summary';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('5', 64), repeat('0', 64),
      'Reference 12-34-56-78 for support',
      'VIC_MELBOURNE', 'SUPPORT_COORDINATION',
      'Different Private Name', '0400000011', null, repeat('c', 64)
    );
    raise exception 'eight summary digits were accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('6', 64), repeat('0', 64),
      'Adult participant requests coordination support',
      'VIC_MELBOURNE', 'SUPPORT_COORDINATION',
      'Different Private Name', '0400000011', null, null
    );
    raise exception 'null correlation hash was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('7', 64), repeat('0', 64),
      'Adult participant requests coordination support',
      null, 'SUPPORT_COORDINATION',
      'Different Private Name', '0400000011', null, repeat('c', 64)
    );
    raise exception 'null region was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('8', 64), repeat('0', 64),
      'Adult participant requests coordination support',
      'VIC_MELBOURNE', null,
      'Different Private Name', '0400000011', null, repeat('c', 64)
    );
    raise exception 'null service type was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
end
$$;
reset role;

create function pg_temp.portal_intake_test_fail_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mutation_id_hash = repeat('f', 64) then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_TEST_LATE_FAILURE';
  end if;
  return new;
end;
$$;
create trigger portal_intake_test_fail_audit
before insert on public.portal_audit_events
for each row execute function pg_temp.portal_intake_test_fail_audit();

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
declare
  v_atomic_hash text := (
    select payload_hash
    from pg_temp.portal_referral_intake_test_payloads
    where fixture_key = 'atomic'
  );
begin
  begin
    perform public.portal_referral_intake_create(
      repeat('f', 64), v_atomic_hash,
      'Late atomic failure fixture',
      'VIC_MELBOURNE', 'DAILY_LIVING_SUPPORT',
      'Private Atomic', '0400000044', null, repeat('d', 64)
    );
    raise exception 'late atomic failure fixture unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_TEST_LATE_FAILURE' then raise; end if;
  end;
end
$$;
reset role;

drop trigger portal_intake_test_fail_audit on public.portal_audit_events;
drop function pg_temp.portal_intake_test_fail_audit();

do $$
begin
  if exists (
    select 1 from public.portal_referrals
    where summary = 'Late atomic failure fixture'
  )
    or exists (
      select 1 from public.portal_mutation_receipts
      where mutation_id_hash = repeat('f', 64)
    )
    or exists (
      select 1 from public.portal_audit_events
      where mutation_id_hash = repeat('f', 64)
    )
    or (select count(*) from public.portal_referrals) <> 1
    or (select count(*)
        from careslink_portal_private.portal_referral_contacts) <> 1
    or (select count(*) from public.portal_mutation_receipts) <> 1
    or (select count(*) from public.portal_audit_events) <> 1
  then
    raise exception 'late failure left an orphan or rejected input wrote rows';
  end if;
end
$$;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
declare
  v_hash text := (
    select payload_hash
    from pg_temp.portal_referral_intake_test_payloads
    where fixture_key = 'a2'
  );
  v_created jsonb;
begin
  v_created := public.portal_referral_intake_create(
    repeat('6', 64), v_hash,
    'Adult participant seeks community participation',
    'VIC_REGIONAL', 'COMMUNITY_PARTICIPATION',
    'Second Private Intake', '0400000022', null, repeat('e', 64)
  );
  insert into pg_temp.portal_referral_intake_test_results (
    fixture_key, value
  ) values ('a2', v_created);
end
$$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
do $$
declare
  v_authorization jsonb := public.portal_referral_intake_authorize();
  v_hash text := (
    select payload_hash
    from pg_temp.portal_referral_intake_test_payloads
    where fixture_key = 'b1'
  );
  v_created jsonb;
  v_list jsonb;
begin
  if v_authorization->>'user_id' is distinct from
      'a2000000-0000-4000-8000-000000000002'
    or v_authorization->>'organization_id' is distinct from
      'c2000000-0000-4000-8000-000000000002'
  then
    raise exception 'Source B authorization crossed tenant: %',
      v_authorization;
  end if;

  v_created := public.portal_referral_intake_create(
    repeat('7', 64), v_hash,
    'Adult participant seeks daily living support',
    'VIC_GEELONG', 'DAILY_LIVING_SUPPORT',
    'Private Intake B', '0400000033', null, repeat('f', 64)
  );
  insert into pg_temp.portal_referral_intake_test_results (
    fixture_key, value
  ) values ('b1', v_created);

  v_list := public.portal_referral_intake_list(50, null, null);
  if v_list - 'items' <> '{}'::jsonb
    or jsonb_array_length(v_list->'items') <> 1
    or v_list->'items'->0->>'referral_id' is distinct from
      v_created->>'referral_id'
    or (v_list->'items'->0) - array[
      'referral_id', 'region', 'service_type', 'current_status',
      'row_version', 'updated_at'
    ]::text[] <> '{}'::jsonb
    or not (v_list->'items'->0 ?& array[
      'referral_id', 'region', 'service_type', 'current_status',
      'row_version', 'updated_at'
    ]::text[])
    or v_list::text ~*
      '(summary|contact|phone|email|Private Intake|0400000033)'
  then
    raise exception 'Source B metadata list/isolation drifted: %', v_list;
  end if;
end
$$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
declare
  v_list jsonb := public.portal_referral_intake_list(50, null, null);
  v_cursor_time timestamptz;
  v_cursor_id uuid;
  v_next jsonb;
  v_a1_id text := (
    select value->>'referral_id'
    from pg_temp.portal_referral_intake_test_results
    where fixture_key = 'a1'
  );
  v_a2_id text := (
    select value->>'referral_id'
    from pg_temp.portal_referral_intake_test_results
    where fixture_key = 'a2'
  );
begin
  if jsonb_array_length(v_list->'items') <> 2
    or not (v_list->'items' @> jsonb_build_array(
      jsonb_build_object('referral_id', v_a1_id)
    ))
    or not (v_list->'items' @> jsonb_build_array(
      jsonb_build_object('referral_id', v_a2_id)
    ))
    or exists (
      select 1
      from jsonb_array_elements(v_list->'items') as item(value)
      where item.value - array[
        'referral_id', 'region', 'service_type', 'current_status',
        'row_version', 'updated_at'
      ]::text[] <> '{}'::jsonb
        or not (item.value ?& array[
          'referral_id', 'region', 'service_type', 'current_status',
          'row_version', 'updated_at'
        ]::text[])
    )
    or (v_list->'items'->0->>'updated_at')::timestamptz
      <> (v_list->'items'->1->>'updated_at')::timestamptz
    or (v_list->'items'->0->>'referral_id')::uuid
      <= (v_list->'items'->1->>'referral_id')::uuid
    or v_list::text ~*
      '(summary|contact|phone|email|Private Intake|04000000)'
  then
    raise exception 'Source A stable metadata list drifted: %', v_list;
  end if;

  v_cursor_time := (v_list->'items'->0->>'updated_at')::timestamptz;
  v_cursor_id := (v_list->'items'->0->>'referral_id')::uuid;
  v_next := public.portal_referral_intake_list(
    50, v_cursor_time, v_cursor_id
  );
  if jsonb_array_length(v_next->'items') <> 1
    or v_next->'items'->0->>'referral_id' is distinct from
      v_list->'items'->1->>'referral_id'
  then
    raise exception 'keyset cursor is not stable: %, %', v_list, v_next;
  end if;

  begin
    perform public.portal_referral_intake_list(101, null, null);
    raise exception 'unbounded list limit unexpectedly accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_list(50, now(), null);
    raise exception 'partial cursor unexpectedly accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
  begin
    perform count(*) from public.portal_referrals;
    raise exception 'authenticated direct SELECT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.portal_referrals (
      source_organization_id, source_user_id, summary, region, service_type
    ) values (
      'c1000000-0000-4000-8000-000000000001', auth.uid(),
      'Direct write must fail', 'VIC_MELBOURNE', 'SUPPORT_COORDINATION'
    );
    raise exception 'authenticated direct INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

do $$
begin
  if (select count(*) from public.portal_referrals) <> 3
    or (select count(*)
        from careslink_portal_private.portal_referral_contacts) <> 3
    or (select count(*) from public.portal_mutation_receipts) <> 3
    or (select count(*) from public.portal_audit_events) <> 3
    or (select count(*) from public.portal_referrals
        where source_organization_id =
          'c1000000-0000-4000-8000-000000000001') <> 2
    or (select count(*) from public.portal_referrals
        where source_organization_id =
          'c2000000-0000-4000-8000-000000000002') <> 1
    or exists (
      select 1
      from public.portal_mutation_receipts as receipt
      join public.portal_referrals as referral
        on referral.id = receipt.response_referral_id
      where receipt.actor_user_id <> referral.source_user_id
    )
    or exists (
      select 1 from public.portal_audit_events
      where metadata <> '{}'::jsonb
    )
  then
    raise exception 'final portal intake tenant/atomic posture drifted';
  end if;
end
$$;

delete from auth.sessions
where id = 'b1000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-000000000001","session_id":"b1000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_list();
    raise exception 'post-create revoked session listed referrals';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      repeat('1', 64),
      (select payload_hash
       from pg_temp.portal_referral_intake_test_payloads
       where fixture_key = 'a1'),
      'Adult participant seeks support coordination',
      'VIC_MELBOURNE', 'SUPPORT_COORDINATION',
      'Private Intake A', '0400000011',
      'private-a@example.invalid', repeat('a', 64)
    );
    raise exception 'post-create revoked session replayed mutation';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
end
$$;
reset role;

update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_workflow_v1';

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-4000-8000-000000000002","session_id":"b2000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_authorize();
    raise exception 'final hard-off authorize unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_list();
    raise exception 'final hard-off list unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      'invalid-body-must-not-be-read', 'invalid', null, null, null,
      null, null, null, null
    );
    raise exception 'final hard-off create unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
end
$$;
reset role;

do $$
begin
  if (select enabled from public.portal_workflow_flags
      where capability = 'referral_workflow_v1') is distinct from false
    or (select preview_only from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from true
    or (select count(*) from public.portal_referrals) <> 3
    or (select count(*)
        from careslink_portal_private.portal_referral_contacts) <> 3
    or (select count(*) from public.portal_mutation_receipts) <> 3
    or (select count(*) from public.portal_audit_events) <> 3
  then
    raise exception 'final hard-off or write-free failure posture drifted';
  end if;
end
$$;

-- Removes every Auth/org/referral/contact/receipt/audit fixture, temporary
-- grant/trigger object and flag update. The migration remains default-off.
rollback;
