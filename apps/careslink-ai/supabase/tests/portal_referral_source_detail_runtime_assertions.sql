-- Manual rollback-only assertions for the Production-unapplied Portal
-- Referral-source detail runtime. Run only after the exact Portal foundation,
-- intake and source-detail migrations on a disposable database. The suite
-- explicitly removes its fixtures before the final ROLLBACK.

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

do $$
declare
  v_signature text;
  v_old_intake_signature text;
  v_role text;
  v_table text;
  v_definition text;
  v_intake_gate_definition text;
  v_authorize_definition text;
  v_detail_definition text;
  v_search_path text;
  v_entry_actor oid := (
    select role.oid
    from pg_catalog.pg_roles as role
    where role.rolname = pg_catalog.current_setting(
      'careslink.assertion_entry_role'
    )
  );
begin
  if v_entry_actor is null then
    raise exception 'assertion entry actor is missing';
  end if;

  if (select count(*)
      from public.portal_workflow_flags
      where capability = 'referral_intake_v1') <> 1
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_intake_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_intake_v1') is distinct from true
    or (select count(*)
      from public.portal_workflow_flags
      where capability = 'referral_source_detail_v1') <> 1
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_source_detail_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_source_detail_v1') is distinct from true
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from true
  then
    raise exception 'Portal operation flags are not default-off Preview-only';
  end if;

  foreach v_signature in array array[
    'careslink_portal_private.portal_referral_intake_assert_enabled()',
    'public.portal_referral_source_detail_authorize()',
    'public.portal_referral_source_detail(uuid)'
  ] loop
    select
      pg_catalog.pg_get_functiondef(routine.oid),
      coalesce((
        select setting
        from unnest(coalesce(routine.proconfig, '{}'::text[])) as setting
        where setting like 'search_path=%'
        limit 1
      ), '')
    into v_definition, v_search_path
    from pg_catalog.pg_proc as routine
    where routine.oid = pg_catalog.to_regprocedure(v_signature)
      and routine.prosecdef
      and routine.provolatile = 'v'
      and routine.proowner = v_entry_actor;

    if v_definition is null
      or v_search_path not in ('search_path=', 'search_path=""')
    then
      raise exception '% definer/owner/search-path posture drifted', v_signature;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'careslink_portal_private.portal_referral_intake_assert_enabled()'
    )
  ) into v_intake_gate_definition;
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.portal_referral_source_detail_authorize()'
    )
  ) into v_authorize_definition;
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.portal_referral_source_detail(uuid)')
  ) into v_detail_definition;

  if strpos(v_intake_gate_definition, 'referral_workflow_v1') = 0
    or strpos(v_intake_gate_definition, 'referral_intake_v1')
      <= strpos(v_intake_gate_definition, 'referral_workflow_v1')
    or lower(v_intake_gate_definition) not like '%for share of flag%'
    or lower(v_intake_gate_definition) like '%for key share%'
  then
    raise exception 'Portal Intake master/operation gate posture drifted';
  end if;

  if strpos(v_authorize_definition, 'referral_workflow_v1') = 0
    or strpos(v_authorize_definition, 'referral_source_detail_v1')
      <= strpos(v_authorize_definition, 'referral_workflow_v1')
    or strpos(v_authorize_definition, 'portal_referral_intake_context()')
      <= strpos(v_authorize_definition, 'referral_source_detail_v1')
    or lower(v_authorize_definition) not like '%for share of flag%'
    or lower(v_authorize_definition) like '%for key share%'
    or strpos(v_detail_definition, 'referral_workflow_v1') = 0
    or strpos(v_detail_definition, 'referral_source_detail_v1')
      <= strpos(v_detail_definition, 'referral_workflow_v1')
    or strpos(v_detail_definition, 'portal_referral_intake_context()')
      <= strpos(v_detail_definition, 'referral_source_detail_v1')
    or lower(v_detail_definition) not like '%for share of flag%'
    or lower(v_detail_definition) like '%for key share%'
  then
    raise exception 'Portal source-detail master/operation gate posture drifted';
  end if;

  foreach v_old_intake_signature in array array[
    'public.portal_referral_intake_authorize()',
    'public.portal_referral_intake_list(integer,timestamp with time zone,uuid)',
    'public.portal_referral_intake_create(text,text,text,text,text,text,text,text,text)'
  ] loop
    select pg_catalog.pg_get_functiondef(routine.oid)
    into v_definition
    from pg_catalog.pg_proc as routine
    where routine.oid = pg_catalog.to_regprocedure(v_old_intake_signature);

    if v_definition is null
      or v_definition not like '%portal_referral_intake_assert_enabled()%'
    then
      raise exception '% bypasses the Intake operation gate',
        v_old_intake_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.portal_referral_source_detail_authorize()',
    'public.portal_referral_source_detail(uuid)'
  ] loop
    if not pg_catalog.has_function_privilege(
        'authenticated', v_signature, 'EXECUTE'
      )
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege(
        'service_role', v_signature, 'EXECUTE'
      )
    then
      raise exception '% ACL drifted', v_signature;
    end if;
  end loop;

  v_signature :=
    'careslink_portal_private.portal_referral_intake_assert_enabled()';
  if pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'authenticated', v_signature, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role', v_signature, 'EXECUTE'
    )
  then
    raise exception 'Portal private Intake gate ACL drifted';
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
      if pg_catalog.has_table_privilege(v_role, v_table, 'SELECT')
        or pg_catalog.has_table_privilege(v_role, v_table, 'INSERT')
        or pg_catalog.has_table_privilege(v_role, v_table, 'UPDATE')
        or pg_catalog.has_table_privilege(v_role, v_table, 'DELETE')
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
  ('d1100000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'detail-a@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d1200000-0000-4000-8000-000000000002',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'detail-b@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d1300000-0000-4000-8000-000000000003',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'detail-expired@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d1400000-0000-4000-8000-000000000004',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'detail-revoked-session@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d1500000-0000-4000-8000-000000000005',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'detail-revoked-member@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('e1100000-0000-4000-8000-000000000001',
   'd1100000-0000-4000-8000-000000000001', now(), now(), null),
  ('e1200000-0000-4000-8000-000000000002',
   'd1200000-0000-4000-8000-000000000002', now(), now(), null),
  ('e1300000-0000-4000-8000-000000000003',
   'd1300000-0000-4000-8000-000000000003', now(), now(),
   pg_catalog.clock_timestamp() - interval '1 second'),
  ('e1400000-0000-4000-8000-000000000004',
   'd1400000-0000-4000-8000-000000000004', now(), now(), null),
  ('e1500000-0000-4000-8000-000000000005',
   'd1500000-0000-4000-8000-000000000005', now(), now(), null);

insert into public.portal_organizations (
  id, organization_type, display_name, status
) values
  ('f1100000-0000-4000-8000-000000000001',
   'REFERRAL_SOURCE', 'Detail Source A', 'ACTIVE'),
  ('f1200000-0000-4000-8000-000000000002',
   'REFERRAL_SOURCE', 'Detail Source B', 'ACTIVE');

insert into public.portal_organization_memberships (
  organization_id, user_id, role, status
) values
  ('f1100000-0000-4000-8000-000000000001',
   'd1100000-0000-4000-8000-000000000001',
   'referral_source', 'ACTIVE'),
  ('f1200000-0000-4000-8000-000000000002',
   'd1200000-0000-4000-8000-000000000002',
   'referral_source', 'ACTIVE'),
  ('f1100000-0000-4000-8000-000000000001',
   'd1300000-0000-4000-8000-000000000003',
   'referral_source', 'ACTIVE'),
  ('f1100000-0000-4000-8000-000000000001',
   'd1400000-0000-4000-8000-000000000004',
   'referral_source', 'ACTIVE'),
  ('f1100000-0000-4000-8000-000000000001',
   'd1500000-0000-4000-8000-000000000005',
   'referral_source', 'REVOKED');

insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region, service_type,
  current_status, assigned_provider_id, row_version, created_at, updated_at
) values
  ('f2100000-0000-4000-8000-000000000001',
   'f1100000-0000-4000-8000-000000000001',
   'd1100000-0000-4000-8000-000000000001',
   'Adult participant seeks support coordination',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'SUBMITTED', null, 1,
   '2026-08-25 01:02:03+00', '2026-08-25 01:03:04+00'),
  ('f2200000-0000-4000-8000-000000000002',
   'f1200000-0000-4000-8000-000000000002',
   'd1200000-0000-4000-8000-000000000002',
   'Adult participant seeks daily living support',
   'VIC_GEELONG', 'DAILY_LIVING_SUPPORT', 'SUBMITTED', null, 1,
   '2026-08-25 02:02:03+00', '2026-08-25 02:03:04+00');

insert into careslink_portal_private.portal_referral_contacts (
  referral_id, contact_name, contact_phone, contact_email,
  created_at, updated_at
) values
  ('f2100000-0000-4000-8000-000000000001',
   'Private Source A', '0400000011', 'source-a@example.invalid',
   '2026-08-25 01:02:03+00', '2026-08-25 01:03:04+00'),
  ('f2200000-0000-4000-8000-000000000002',
   'Private Source B', '0400000022', null,
   '2026-08-25 02:02:03+00', '2026-08-25 02:03:04+00');

-- A deleted session row represents immediate online session revocation.
delete from auth.sessions
where id = 'e1400000-0000-4000-8000-000000000004';

-- Master and both operation flags start hard-off.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1100000-0000-4000-8000-000000000001","session_id":"e1100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_source_detail_authorize();
    raise exception 'hard-off source-detail authorize unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_source_detail(
      'f2100000-0000-4000-8000-000000000001'
    );
    raise exception 'hard-off source detail unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Enabling only the master flag cannot open the detail operation.
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_workflow_v1';

set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_source_detail_authorize();
    raise exception 'master-only source-detail authorize unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_source_detail(
      'f2100000-0000-4000-8000-000000000001'
    );
    raise exception 'master-only source detail unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Temporary TEST_ONLY operation enable inside this rollback transaction.
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_source_detail_v1';

set local role authenticated;
do $$
declare
  v_authorization jsonb;
  v_detail jsonb;
begin
  -- Master+Detail must not admit any legacy Intake operation.
  begin
    perform public.portal_referral_intake_authorize();
    raise exception 'master+detail opened legacy Intake authorize';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_list();
    raise exception 'master+detail opened legacy Intake list';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_intake_create(
      null, null, null, null, null, null, null, null, null
    );
    raise exception 'master+detail opened legacy Intake create';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;

  v_authorization := public.portal_referral_source_detail_authorize();
  if not (v_authorization ?& array[
      'authorized', 'user_id', 'organization_id', 'organization_type',
      'organization_status', 'membership_role', 'membership_status'
    ])
    or v_authorization - array[
      'authorized', 'user_id', 'organization_id', 'organization_type',
      'organization_status', 'membership_role', 'membership_status'
    ]::text[] <> '{}'::jsonb
    or v_authorization->'authorized' is distinct from 'true'::jsonb
    or v_authorization->>'user_id' is distinct from
      'd1100000-0000-4000-8000-000000000001'
    or v_authorization->>'organization_id' is distinct from
      'f1100000-0000-4000-8000-000000000001'
    or v_authorization->>'organization_type' is distinct from
      'REFERRAL_SOURCE'
    or v_authorization->>'organization_status' is distinct from 'ACTIVE'
    or v_authorization->>'membership_role' is distinct from 'referral_source'
    or v_authorization->>'membership_status' is distinct from 'ACTIVE'
  then
    raise exception 'Source A exact detail authorization drifted: %',
      v_authorization;
  end if;

  v_detail := public.portal_referral_source_detail(
    'f2100000-0000-4000-8000-000000000001'
  );
  if not (v_detail ?& array[
      'referral_id', 'summary', 'region', 'service_type', 'current_status',
      'row_version', 'contact', 'created_at', 'updated_at'
    ])
    or v_detail - array[
      'referral_id', 'summary', 'region', 'service_type', 'current_status',
      'row_version', 'contact', 'created_at', 'updated_at'
    ]::text[] <> '{}'::jsonb
    or not ((v_detail->'contact') ?& array['name', 'phone', 'email'])
    or (v_detail->'contact') - array['name', 'phone', 'email']::text[]
      <> '{}'::jsonb
    or v_detail->>'referral_id' is distinct from
      'f2100000-0000-4000-8000-000000000001'
    or v_detail->>'summary' is distinct from
      'Adult participant seeks support coordination'
    or v_detail->>'region' is distinct from 'VIC_MELBOURNE'
    or v_detail->>'service_type' is distinct from 'SUPPORT_COORDINATION'
    or v_detail->>'current_status' is distinct from 'SUBMITTED'
    or v_detail->>'row_version' is distinct from '1'
    or v_detail->'contact'->>'name' is distinct from 'Private Source A'
    or v_detail->'contact'->>'phone' is distinct from '0400000011'
    or v_detail->'contact'->>'email' is distinct from
      'source-a@example.invalid'
    or (v_detail->>'created_at')::timestamptz is distinct from
      '2026-08-25 01:02:03+00'::timestamptz
    or (v_detail->>'updated_at')::timestamptz is distinct from
      '2026-08-25 01:03:04+00'::timestamptz
  then
    raise exception 'Source A exact detail envelope drifted: %', v_detail;
  end if;

  begin
    perform public.portal_referral_source_detail(
      'f2200000-0000-4000-8000-000000000002'
    );
    raise exception 'Source A read Source B detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.portal_referral_source_detail(
      'ffffffff-ffff-4fff-8fff-ffffffffffff'
    );
    raise exception 'missing referral detail unexpectedly existed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.portal_referral_source_detail(null);
    raise exception 'null referral detail unexpectedly existed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;

  begin
    perform count(*) from public.portal_referrals;
    raise exception 'authenticated direct referral SELECT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.portal_referrals (
      source_organization_id, source_user_id, summary, region, service_type
    ) values (
      'f1100000-0000-4000-8000-000000000001', auth.uid(),
      'Direct write must fail', 'VIC_MELBOURNE', 'SUPPORT_COORDINATION'
    );
    raise exception 'authenticated direct referral INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1200000-0000-4000-8000-000000000002","session_id":"e1200000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
do $$
declare
  v_detail jsonb := public.portal_referral_source_detail(
    'f2200000-0000-4000-8000-000000000002'
  );
begin
  if v_detail->>'referral_id' is distinct from
      'f2200000-0000-4000-8000-000000000002'
    or v_detail->>'region' is distinct from 'VIC_GEELONG'
    or v_detail->>'service_type' is distinct from 'DAILY_LIVING_SUPPORT'
    or v_detail->'contact'->>'name' is distinct from 'Private Source B'
    or v_detail->'contact'->>'phone' is distinct from '0400000022'
    or v_detail->'contact'->'email' is distinct from 'null'::jsonb
  then
    raise exception 'Source B exact detail envelope drifted: %', v_detail;
  end if;

  begin
    perform public.portal_referral_source_detail(
      'f2100000-0000-4000-8000-000000000001'
    );
    raise exception 'Source B read Source A detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1300000-0000-4000-8000-000000000003","session_id":"e1300000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_source_detail(
      'f2100000-0000-4000-8000-000000000001'
    );
    raise exception 'expired session read source detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1400000-0000-4000-8000-000000000004","session_id":"e1400000-0000-4000-8000-000000000004"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_source_detail(
      'f2100000-0000-4000-8000-000000000001'
    );
    raise exception 'revoked session read source detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1500000-0000-4000-8000-000000000005","session_id":"e1500000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_source_detail(
      'f2100000-0000-4000-8000-000000000001'
    );
    raise exception 'revoked membership read source detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

do $$
begin
  if (select count(*)
      from public.portal_referrals
      where id in (
        'f2100000-0000-4000-8000-000000000001',
        'f2200000-0000-4000-8000-000000000002'
      )) <> 2
    or (select count(*)
        from careslink_portal_private.portal_referral_contacts
        where referral_id in (
          'f2100000-0000-4000-8000-000000000001',
          'f2200000-0000-4000-8000-000000000002'
        )) <> 2
    or exists (
      select 1
      from public.portal_audit_events
      where referral_id in (
        'f2100000-0000-4000-8000-000000000001',
        'f2200000-0000-4000-8000-000000000002'
      )
    )
    or exists (
      select 1
      from public.portal_mutation_receipts
      where response_referral_id in (
        'f2100000-0000-4000-8000-000000000001',
        'f2200000-0000-4000-8000-000000000002'
      )
    )
  then
    raise exception 'source-detail RPC changed durable rows';
  end if;
end
$$;

-- Master+Intake admits the old Intake reads but cannot open Detail.
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_source_detail_v1';

update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_intake_v1';

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1100000-0000-4000-8000-000000000001","session_id":"e1100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
declare
  v_intake_authorization jsonb;
  v_intake_list jsonb;
begin
  begin
    perform public.portal_referral_source_detail_authorize();
    raise exception 'intake-only source-detail authorize unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_source_detail(
      'f2100000-0000-4000-8000-000000000001'
    );
    raise exception 'intake-only source detail unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;

  v_intake_authorization := public.portal_referral_intake_authorize();
  v_intake_list := public.portal_referral_intake_list();
  if v_intake_authorization->'authorized' is distinct from 'true'::jsonb
    or v_intake_authorization->>'organization_id' is distinct from
      'f1100000-0000-4000-8000-000000000001'
    or pg_catalog.jsonb_array_length(v_intake_list->'items') <> 1
    or v_intake_list->'items'->0->>'referral_id' is distinct from
      'f2100000-0000-4000-8000-000000000001'
  then
    raise exception 'master+intake failed to admit legacy Intake reads';
  end if;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_intake_v1';

update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_workflow_v1';

-- Explicit cleanup makes the zero-fixture posture observable before rollback.
delete from careslink_portal_private.portal_referral_contacts
where referral_id in (
  'f2100000-0000-4000-8000-000000000001',
  'f2200000-0000-4000-8000-000000000002'
);
delete from public.portal_referrals
where id in (
  'f2100000-0000-4000-8000-000000000001',
  'f2200000-0000-4000-8000-000000000002'
);
delete from public.portal_organization_memberships
where user_id in (
  'd1100000-0000-4000-8000-000000000001',
  'd1200000-0000-4000-8000-000000000002',
  'd1300000-0000-4000-8000-000000000003',
  'd1400000-0000-4000-8000-000000000004',
  'd1500000-0000-4000-8000-000000000005'
);
delete from auth.sessions
where user_id in (
  'd1100000-0000-4000-8000-000000000001',
  'd1200000-0000-4000-8000-000000000002',
  'd1300000-0000-4000-8000-000000000003',
  'd1400000-0000-4000-8000-000000000004',
  'd1500000-0000-4000-8000-000000000005'
);
delete from auth.users
where id in (
  'd1100000-0000-4000-8000-000000000001',
  'd1200000-0000-4000-8000-000000000002',
  'd1300000-0000-4000-8000-000000000003',
  'd1400000-0000-4000-8000-000000000004',
  'd1500000-0000-4000-8000-000000000005'
);
delete from public.portal_organizations
where id in (
  'f1100000-0000-4000-8000-000000000001',
  'f1200000-0000-4000-8000-000000000002'
);

do $$
begin
  if (select enabled
      from public.portal_workflow_flags
      where capability = 'referral_workflow_v1') is distinct from false
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_intake_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_intake_v1') is distinct from true
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_source_detail_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_source_detail_v1') is distinct from true
    or exists (
      select 1 from auth.users
      where id in (
        'd1100000-0000-4000-8000-000000000001',
        'd1200000-0000-4000-8000-000000000002',
        'd1300000-0000-4000-8000-000000000003',
        'd1400000-0000-4000-8000-000000000004',
        'd1500000-0000-4000-8000-000000000005'
      )
    )
    or exists (
      select 1 from auth.sessions
      where user_id in (
        'd1100000-0000-4000-8000-000000000001',
        'd1200000-0000-4000-8000-000000000002',
        'd1300000-0000-4000-8000-000000000003',
        'd1400000-0000-4000-8000-000000000004',
        'd1500000-0000-4000-8000-000000000005'
      )
    )
    or exists (
      select 1 from public.portal_organizations
      where id in (
        'f1100000-0000-4000-8000-000000000001',
        'f1200000-0000-4000-8000-000000000002'
      )
    )
    or exists (
      select 1 from public.portal_organization_memberships
      where user_id in (
        'd1100000-0000-4000-8000-000000000001',
        'd1200000-0000-4000-8000-000000000002',
        'd1300000-0000-4000-8000-000000000003',
        'd1400000-0000-4000-8000-000000000004',
        'd1500000-0000-4000-8000-000000000005'
      )
    )
    or exists (
      select 1 from public.portal_referrals
      where id in (
        'f2100000-0000-4000-8000-000000000001',
        'f2200000-0000-4000-8000-000000000002'
      )
    )
    or exists (
      select 1 from careslink_portal_private.portal_referral_contacts
      where referral_id in (
        'f2100000-0000-4000-8000-000000000001',
        'f2200000-0000-4000-8000-000000000002'
      )
    )
  then
    raise exception 'Portal source-detail zero-fixture posture drifted';
  end if;
end
$$;

rollback;
