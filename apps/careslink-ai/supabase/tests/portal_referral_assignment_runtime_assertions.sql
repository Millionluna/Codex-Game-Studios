-- Manual rollback-only assertions for the Production-unapplied Portal
-- Referral Assignment M1a runtime. Run only after the exact Portal foundation,
-- Intake, source-detail and Assignment migrations on a disposable database.
-- This suite is single-connection transaction evidence; true two-connection
-- advisory/resource/flag/session races remain a separate release gate.

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

do $$
declare
  v_signature text;
  v_role text;
  v_table text;
  v_definition text;
  v_gate_definition text;
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
    raise exception 'Portal Assignment assertion entry actor is missing';
  end if;

  if (select count(*)
      from public.portal_workflow_flags
      where capability = 'referral_assignment_v1') <> 1
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_assignment_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_assignment_v1') is distinct from true
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from true
  then
    raise exception 'Portal Assignment flags are not default-off Preview-only';
  end if;

  if pg_catalog.to_regclass(
      'public.portal_referrals_assignment_queue_idx'
    ) is null
    or pg_catalog.to_regclass(
      'public.portal_providers_assignment_eligible_idx'
    ) is null
  then
    raise exception 'Portal Assignment support index is missing';
  end if;

  foreach v_signature in array array[
    'careslink_portal_private.portal_referral_assignment_assert_enabled()',
    'careslink_portal_private.portal_referral_assignment_assert_session(uuid,uuid)',
    'careslink_portal_private.portal_referral_assignment_context()',
    'careslink_portal_private.portal_referral_assignment_eligible_providers(text,text,uuid,integer)',
    'public.portal_referral_assignment_authorize()',
    'public.portal_referral_assignment_queue(integer,timestamp with time zone,uuid)',
    'public.portal_referral_assignment_detail(uuid)',
    'public.portal_referral_assignment_triage(uuid,bigint,text,text,text)',
    'public.portal_referral_assignment_candidates(uuid,integer)',
    'public.portal_referral_assignment_offer(uuid,uuid,bigint,text,text,text)'
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
      'careslink_portal_private.portal_referral_assignment_assert_enabled()'
    )
  ) into v_gate_definition;

  if strpos(v_gate_definition, 'referral_workflow_v1') = 0
    or strpos(v_gate_definition, 'referral_assignment_v1')
      <= strpos(v_gate_definition, 'referral_workflow_v1')
    or lower(v_gate_definition) not like '%for share of flag%'
    or lower(v_gate_definition) like '%for key share%'
  then
    raise exception 'Portal Assignment master/operation gate posture drifted';
  end if;

  foreach v_signature in array array[
    'public.portal_referral_assignment_authorize()',
    'public.portal_referral_assignment_queue(integer,timestamp with time zone,uuid)',
    'public.portal_referral_assignment_detail(uuid)',
    'public.portal_referral_assignment_triage(uuid,bigint,text,text,text)',
    'public.portal_referral_assignment_candidates(uuid,integer)',
    'public.portal_referral_assignment_offer(uuid,uuid,bigint,text,text,text)'
  ] loop
    select pg_catalog.pg_get_functiondef(routine.oid)
    into v_definition
    from pg_catalog.pg_proc as routine
    where routine.oid = pg_catalog.to_regprocedure(v_signature);

    if v_definition is null
      or v_definition not like
        '%portal_referral_assignment_assert_enabled()%'
      or not pg_catalog.has_function_privilege(
        'authenticated', v_signature, 'EXECUTE'
      )
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege(
        'service_role', v_signature, 'EXECUTE'
      )
    then
      raise exception '% Assignment gate/ACL drifted', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'careslink_portal_private.portal_referral_assignment_assert_enabled()',
    'careslink_portal_private.portal_referral_assignment_assert_session(uuid,uuid)',
    'careslink_portal_private.portal_referral_assignment_context()',
    'careslink_portal_private.portal_referral_assignment_eligible_providers(text,text,uuid,integer)'
  ] loop
    if pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege(
        'authenticated', v_signature, 'EXECUTE'
      )
      or pg_catalog.has_function_privilege(
        'service_role', v_signature, 'EXECUTE'
      )
    then
      raise exception '% private helper EXECUTE leaked', v_signature;
    end if;
  end loop;

  if pg_catalog.to_regprocedure(
      'careslink_portal_private.portal_referral_assignment_eligible_providers(text,text,uuid)'
    ) is not null
  then
    raise exception 'Portal Assignment unbounded provider helper overload exists';
  end if;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'careslink_portal_private.portal_referral_assignment_eligible_providers(text,text,uuid,integer)'
    )
  ) into v_definition;

  if strpos(lower(v_definition), 'p_limit > 50') = 0
    or strpos(lower(v_definition), 'limit p_limit') = 0
    or strpos(lower(v_definition), 'for share of provider, organization')
      <= strpos(lower(v_definition), 'limit p_limit')
  then
    raise exception 'Portal Assignment provider helper bound/lock drifted';
  end if;

  foreach v_table in array array[
    'public.portal_workflow_flags',
    'public.portal_organizations',
    'public.portal_organization_memberships',
    'public.portal_providers',
    'public.portal_referrals',
    'public.portal_referral_matches',
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
  ('a1100000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-admin@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1200000-0000-4000-8000-000000000002',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-operator-a@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1300000-0000-4000-8000-000000000003',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-operator-b@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1400000-0000-4000-8000-000000000004',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-source@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1500000-0000-4000-8000-000000000005',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-provider-a@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1600000-0000-4000-8000-000000000006',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-provider-b@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1700000-0000-4000-8000-000000000007',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-provider-c@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1800000-0000-4000-8000-000000000008',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-ambiguous@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1900000-0000-4000-8000-000000000009',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'assignment-expired@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('b1100000-0000-4000-8000-000000000001',
   'a1100000-0000-4000-8000-000000000001', now(), now(), null),
  ('b1200000-0000-4000-8000-000000000002',
   'a1200000-0000-4000-8000-000000000002', now(), now(), null),
  ('b1300000-0000-4000-8000-000000000003',
   'a1300000-0000-4000-8000-000000000003', now(), now(), null),
  ('b1400000-0000-4000-8000-000000000004',
   'a1400000-0000-4000-8000-000000000004', now(), now(), null),
  ('b1500000-0000-4000-8000-000000000005',
   'a1500000-0000-4000-8000-000000000005', now(), now(), null),
  ('b1600000-0000-4000-8000-000000000006',
   'a1600000-0000-4000-8000-000000000006', now(), now(), null),
  ('b1700000-0000-4000-8000-000000000007',
   'a1700000-0000-4000-8000-000000000007', now(), now(), null),
  ('b1800000-0000-4000-8000-000000000008',
   'a1800000-0000-4000-8000-000000000008', now(), now(), null),
  ('b1900000-0000-4000-8000-000000000009',
   'a1900000-0000-4000-8000-000000000009', now(), now(),
   pg_catalog.clock_timestamp() - interval '1 second');

insert into public.portal_organizations (
  id, organization_type, display_name, status
) values
  ('c1100000-0000-4000-8000-000000000001',
   'PLATFORM', 'Assignment Platform', 'ACTIVE'),
  ('c1200000-0000-4000-8000-000000000002',
   'REFERRAL_SOURCE', '  Assignment Source A  ', 'ACTIVE'),
  ('c1300000-0000-4000-8000-000000000003',
   'REFERRAL_SOURCE', 'Assignment Source B', 'ACTIVE'),
  ('c1400000-0000-4000-8000-000000000004',
   'PROVIDER', '  Assignment Provider Available  ', 'ACTIVE'),
  ('c1500000-0000-4000-8000-000000000005',
   'PROVIDER', 'Assignment Provider Limited', 'ACTIVE'),
  ('c1600000-0000-4000-8000-000000000006',
   'PROVIDER', 'Assignment Provider Unknown', 'ACTIVE'),
  ('c1700000-0000-4000-8000-000000000007',
   'PROVIDER', 'Assignment Provider Wrong Region', 'ACTIVE'),
  ('c1800000-0000-4000-8000-000000000008',
   'PROVIDER', 'Assignment Provider No Member', 'ACTIVE'),
  ('c1900000-0000-4000-8000-000000000009',
   'PROVIDER', 'Assignment Provider Unavailable', 'ACTIVE'),
  ('ca100000-0000-4000-8000-00000000000a',
   'PROVIDER', 'Assignment Provider Wrong Service', 'ACTIVE');

insert into public.portal_organization_memberships (
  organization_id, user_id, role, status
) values
  ('c1100000-0000-4000-8000-000000000001',
   'a1100000-0000-4000-8000-000000000001',
   'platform_admin', 'ACTIVE'),
  ('c1200000-0000-4000-8000-000000000002',
   'a1200000-0000-4000-8000-000000000002',
   'partner_operator', 'ACTIVE'),
  ('c1300000-0000-4000-8000-000000000003',
   'a1300000-0000-4000-8000-000000000003',
   'partner_operator', 'ACTIVE'),
  ('c1200000-0000-4000-8000-000000000002',
   'a1400000-0000-4000-8000-000000000004',
   'referral_source', 'ACTIVE'),
  ('c1400000-0000-4000-8000-000000000004',
   'a1500000-0000-4000-8000-000000000005',
   'provider_member', 'ACTIVE'),
  ('c1500000-0000-4000-8000-000000000005',
   'a1600000-0000-4000-8000-000000000006',
   'provider_member', 'ACTIVE'),
  ('c1600000-0000-4000-8000-000000000006',
   'a1700000-0000-4000-8000-000000000007',
   'provider_member', 'ACTIVE'),
  ('c1700000-0000-4000-8000-000000000007',
   'a1500000-0000-4000-8000-000000000005',
   'provider_member', 'ACTIVE'),
  ('c1900000-0000-4000-8000-000000000009',
   'a1600000-0000-4000-8000-000000000006',
   'provider_member', 'ACTIVE'),
  ('ca100000-0000-4000-8000-00000000000a',
   'a1700000-0000-4000-8000-000000000007',
   'provider_member', 'ACTIVE'),
  ('c1100000-0000-4000-8000-000000000001',
   'a1800000-0000-4000-8000-000000000008',
   'platform_admin', 'ACTIVE'),
  ('c1200000-0000-4000-8000-000000000002',
   'a1800000-0000-4000-8000-000000000008',
   'partner_operator', 'ACTIVE'),
  ('c1200000-0000-4000-8000-000000000002',
   'a1900000-0000-4000-8000-000000000009',
   'partner_operator', 'ACTIVE');

insert into public.portal_providers (
  id, organization_id, review_status, service_types, regions, capacity_status
) values
  ('d1400000-0000-4000-8000-000000000004',
   'c1400000-0000-4000-8000-000000000004', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'AVAILABLE'),
  ('d1500000-0000-4000-8000-000000000005',
   'c1500000-0000-4000-8000-000000000005', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'LIMITED'),
  ('d1600000-0000-4000-8000-000000000006',
   'c1600000-0000-4000-8000-000000000006', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'UNKNOWN'),
  ('d1700000-0000-4000-8000-000000000007',
   'c1700000-0000-4000-8000-000000000007', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_GEELONG'], 'AVAILABLE'),
  ('d1800000-0000-4000-8000-000000000008',
   'c1800000-0000-4000-8000-000000000008', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'AVAILABLE'),
  ('d1900000-0000-4000-8000-000000000009',
   'c1900000-0000-4000-8000-000000000009', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'UNAVAILABLE'),
  ('da100000-0000-4000-8000-00000000000a',
   'ca100000-0000-4000-8000-00000000000a', 'APPROVED',
   array['DAILY_LIVING_SUPPORT'], array['VIC_MELBOURNE'], 'AVAILABLE');

insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region, service_type,
  current_status, assigned_provider_id, row_version, created_at, updated_at
) values
  ('e1200000-0000-4000-8000-000000000002',
   'c1200000-0000-4000-8000-000000000002',
   'a1400000-0000-4000-8000-000000000004',
   'Adult participant seeks support coordination',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'SUBMITTED', null, 1,
   '2026-08-25 01:00:00+00', '2026-08-25 01:03:00+00'),
  ('e1210000-0000-4000-8000-000000000012',
   'c1200000-0000-4000-8000-000000000002',
   'a1400000-0000-4000-8000-000000000004',
   'Adult participant seeks a second support coordinator',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'TRIAGED', null, 1,
   '2026-08-25 01:10:00+00', '2026-08-25 01:13:00+00'),
  ('e1300000-0000-4000-8000-000000000003',
   'c1300000-0000-4000-8000-000000000003',
   'a1400000-0000-4000-8000-000000000004',
   'Adult participant seeks support coordination in Source B',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'SUBMITTED', null, 1,
   '2026-08-25 02:00:00+00', '2026-08-25 02:03:00+00'),
  ('e1400000-0000-4000-8000-000000000004',
   'c1200000-0000-4000-8000-000000000002',
   'a1400000-0000-4000-8000-000000000004',
   'Completed referral excluded from the Assignment queue',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'COMPLETED', null, 9,
   '2026-08-25 03:00:00+00', '2026-08-25 03:03:00+00');

insert into careslink_portal_private.portal_referral_contacts (
  referral_id, contact_name, contact_phone, contact_email,
  created_at, updated_at
) values
  ('e1200000-0000-4000-8000-000000000002',
   'Assignment Private A1', '0400000101', 'assignment-a1@example.invalid',
   '2026-08-25 01:00:00+00', '2026-08-25 01:03:00+00'),
  ('e1210000-0000-4000-8000-000000000012',
   'Assignment Private A2', '0400000102', null,
   '2026-08-25 01:10:00+00', '2026-08-25 01:13:00+00'),
  ('e1300000-0000-4000-8000-000000000003',
   'Assignment Private B1', '0400000201', 'assignment-b1@example.invalid',
   '2026-08-25 02:00:00+00', '2026-08-25 02:03:00+00'),
  ('e1400000-0000-4000-8000-000000000004',
   'Assignment Completed', '0400000301', null,
   '2026-08-25 03:00:00+00', '2026-08-25 03:03:00+00');

insert into public.portal_referral_matches (
  id, referral_id, provider_id, score, status, row_version,
  created_at, updated_at
) values (
  'f1210000-0000-4000-8000-000000000012',
  'e1210000-0000-4000-8000-000000000012',
  'd1500000-0000-4000-8000-000000000005',
  80, 'CANDIDATE', 1,
  '2026-08-25 01:11:00+00', '2026-08-25 01:12:00+00'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1200000-0000-4000-8000-000000000002","session_id":"b1200000-0000-4000-8000-000000000002"}',
  true
);

-- Operation=true while master=false: all six public RPCs must fail at the
-- database capability boundary before argument validation or private reads.
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_assignment_v1';

set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_authorize();
    raise exception 'master=false operation=true Assignment authorize succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_assignment_queue(null, null, null);
    raise exception 'master=false operation=true Assignment queue succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_assignment_detail(null);
    raise exception 'master=false operation=true Assignment detail succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_assignment_triage(
      null, null, null, null, null
    );
    raise exception 'master=false operation=true Assignment triage succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_assignment_candidates(null, null);
    raise exception 'master=false operation=true Assignment candidates succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_assignment_offer(
      null, null, null, null, null, null
    );
    raise exception 'master=false operation=true Assignment offer succeeded';
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

update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_assignment_v1';
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability in ('referral_workflow_v1', 'referral_intake_v1');

set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_authorize();
    raise exception 'master+intake opened Assignment authorize';
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

update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_intake_v1';
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_assignment_v1';

set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_intake_authorize();
    raise exception 'master+assignment opened Intake authorize';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
  begin
    perform public.portal_referral_source_detail_authorize();
    raise exception 'master+assignment opened source-detail authorize';
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

-- Exact partner-operator authorization, tenant queue/detail and direct-table
-- denial. Queue and detail DTOs are strict M1a projections.
set local role authenticated;
do $$
declare
  v_authorization jsonb;
  v_queue jsonb;
  v_page jsonb;
  v_page_two jsonb;
  v_detail jsonb;
begin
  v_authorization := public.portal_referral_assignment_authorize();
  if v_authorization - array[
      'authorized', 'user_id', 'organization_id', 'organization_type',
      'organization_status', 'membership_role', 'membership_status'
    ]::text[] <> '{}'::jsonb
    or not (v_authorization ?& array[
      'authorized', 'user_id', 'organization_id', 'organization_type',
      'organization_status', 'membership_role', 'membership_status'
    ])
    or v_authorization->>'organization_id' is distinct from
      'c1200000-0000-4000-8000-000000000002'
    or v_authorization->>'organization_type' is distinct from 'REFERRAL_SOURCE'
    or v_authorization->>'membership_role' is distinct from 'partner_operator'
  then
    raise exception 'Partner Assignment authorization drifted: %',
      v_authorization;
  end if;

  v_queue := public.portal_referral_assignment_queue(100, null, null);
  if jsonb_array_length(v_queue->'items') <> 2
    or exists (
      select 1
      from jsonb_array_elements(v_queue->'items') as item(value)
      where value - array[
        'referral_id', 'source_organization_id',
        'source_organization_name', 'region', 'service_type',
        'current_status', 'row_version', 'updated_at'
      ]::text[] <> '{}'::jsonb
        or not (value ?& array[
          'referral_id', 'source_organization_id',
          'source_organization_name', 'region', 'service_type',
          'current_status', 'row_version', 'updated_at'
        ])
        or value->>'source_organization_id' <>
          'c1200000-0000-4000-8000-000000000002'
        or value->>'source_organization_name' <> 'Assignment Source A'
        or value ?| array['summary', 'contact', 'source_user_id']
    )
  then
    raise exception 'Partner Assignment queue tenant/DTO drifted: %', v_queue;
  end if;

  v_page := public.portal_referral_assignment_queue(1, null, null);
  if jsonb_array_length(v_page->'items') <> 1 then
    raise exception 'Assignment queue limit drifted: %', v_page;
  end if;

  v_page_two := public.portal_referral_assignment_queue(
    100,
    (v_page->'items'->0->>'updated_at')::timestamptz,
    (v_page->'items'->0->>'referral_id')::uuid
  );
  if jsonb_array_length(v_page_two->'items') <> 1
    or v_page_two->'items'->0->>'referral_id' <>
      'e1200000-0000-4000-8000-000000000002'
  then
    raise exception 'Assignment queue keyset cursor drifted: %', v_page_two;
  end if;

  v_detail := public.portal_referral_assignment_detail(
    'e1210000-0000-4000-8000-000000000012'
  );
  if v_detail - array[
      'referral_id', 'source_organization_id', 'source_organization_name',
      'summary', 'region', 'service_type', 'current_status', 'row_version',
      'contact', 'active_offer', 'created_at', 'updated_at'
    ]::text[] <> '{}'::jsonb
    or not (v_detail ?& array[
      'referral_id', 'source_organization_id', 'source_organization_name',
      'summary', 'region', 'service_type', 'current_status', 'row_version',
      'contact', 'active_offer', 'created_at', 'updated_at'
    ])
    or v_detail->>'current_status' <> 'TRIAGED'
    or v_detail->>'source_organization_name' <> 'Assignment Source A'
    or v_detail->'active_offer' <> 'null'::jsonb
    or (v_detail->'contact') - array['name', 'phone', 'email']::text[]
      <> '{}'::jsonb
  then
    raise exception 'Assignment detail DTO drifted: %', v_detail;
  end if;

  begin
    perform public.portal_referral_assignment_detail(
      'e1300000-0000-4000-8000-000000000003'
    );
    raise exception 'Operator A read Source B Assignment detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.portal_referral_assignment_detail(
      'e1400000-0000-4000-8000-000000000004'
    );
    raise exception 'Completed referral entered Assignment detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.portal_referral_assignment_detail(
      'eeeeeeee-0000-4000-8000-000000000000'
    );
    raise exception 'Operator read absent Assignment detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;

  begin
    perform 1 from public.portal_referrals;
    raise exception 'authenticated direct Assignment SELECT succeeded';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.portal_referrals (
      source_organization_id, source_user_id, summary, region, service_type
    ) values (
      'c1200000-0000-4000-8000-000000000002',
      'a1200000-0000-4000-8000-000000000002',
      'must fail', 'VIC_MELBOURNE', 'SUPPORT_COORDINATION'
    );
    raise exception 'authenticated direct Assignment INSERT succeeded';
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

-- Platform admin is global and receives the same strict queue contract.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1100000-0000-4000-8000-000000000001","session_id":"b1100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
declare
  v_authorization jsonb;
  v_queue jsonb;
begin
  v_authorization := public.portal_referral_assignment_authorize();
  v_queue := public.portal_referral_assignment_queue(100, null, null);
  if v_authorization->>'organization_type' <> 'PLATFORM'
    or v_authorization->>'membership_role' <> 'platform_admin'
    or jsonb_array_length(v_queue->'items') <> 3
  then
    raise exception 'Platform Assignment global authorization/queue drifted';
  end if;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Provider, source, ambiguous operator and expired-session contexts fail closed.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1500000-0000-4000-8000-000000000005","session_id":"b1500000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_authorize();
    raise exception 'Provider opened Assignment authorize';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1400000-0000-4000-8000-000000000004","session_id":"b1400000-0000-4000-8000-000000000004"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_authorize();
    raise exception 'Referral source opened Assignment authorize';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1800000-0000-4000-8000-000000000008","session_id":"b1800000-0000-4000-8000-000000000008"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_authorize();
    raise exception 'Ambiguous Assignment membership succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1900000-0000-4000-8000-000000000009","session_id":"b1900000-0000-4000-8000-000000000009"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_authorize();
    raise exception 'Expired session opened Assignment authorize';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

-- Restore Operator A and prepare database-canonical mutation hashes.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1200000-0000-4000-8000-000000000002","session_id":"b1200000-0000-4000-8000-000000000002"}',
  true
);
select pg_catalog.set_config(
  'careslink.assignment.triage_payload_v1',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator',
      'providerId', null
    ),
    'kind', 'TRIAGE_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1200000-0000-4000-8000-000000000002',
      'expectedVersion', 1
    )
  )),
  true
);
select pg_catalog.set_config(
  'careslink.assignment.triage_payload_v2',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator',
      'providerId', null
    ),
    'kind', 'TRIAGE_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1200000-0000-4000-8000-000000000002',
      'expectedVersion', 2
    )
  )),
  true
);

select pg_catalog.set_config(
  'careslink.assignment.triage_payload_corrupt_receipt',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator',
      'providerId', null
    ),
    'kind', 'TRIAGE_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1400000-0000-4000-8000-000000000004',
      'expectedVersion', 9
    )
  )),
  true
);

-- Database-owner corruption probes prove replay cannot turn a receipt with a
-- mismatched status or version into an ACK. The transaction rolls these rows
-- back after the explicit trigger-safe fixture restoration below.
insert into public.portal_mutation_receipts (
  actor_user_id, mutation_id_hash, mutation_kind, payload_hash,
  response_referral_id, response_match_id, response_status,
  response_row_version, response_updated_at, created_at
) values
  (
    'a1200000-0000-4000-8000-000000000002', repeat('f', 64),
    'TRIAGE_REFERRAL',
    pg_catalog.current_setting(
      'careslink.assignment.triage_payload_corrupt_receipt'
    ),
    'e1400000-0000-4000-8000-000000000004', null, 'SUBMITTED', 10,
    '2026-08-25 03:03:00+00', now()
  ),
  (
    'a1200000-0000-4000-8000-000000000002', repeat('0', 64),
    'TRIAGE_REFERRAL',
    pg_catalog.current_setting(
      'careslink.assignment.triage_payload_corrupt_receipt'
    ),
    'e1400000-0000-4000-8000-000000000004', null, 'TRIAGED', 9,
    '2026-08-25 03:03:00+00', now()
  );

set local role authenticated;
do $$
declare
  v_first jsonb;
  v_replay jsonb;
begin
  begin
    perform public.portal_referral_assignment_triage(
      'e1400000-0000-4000-8000-000000000004',
      9,
      repeat('f', 64),
      pg_catalog.current_setting(
        'careslink.assignment.triage_payload_corrupt_receipt'
      ),
      repeat('f', 64)
    );
    raise exception 'Assignment replay accepted corrupt receipt status';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.portal_referral_assignment_triage(
      'e1400000-0000-4000-8000-000000000004',
      9,
      repeat('0', 64),
      pg_catalog.current_setting(
        'careslink.assignment.triage_payload_corrupt_receipt'
      ),
      repeat('0', 64)
    );
    raise exception 'Assignment replay accepted corrupt receipt version';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.portal_referral_assignment_triage(
      'e1200000-0000-4000-8000-000000000002',
      9223372036854775807,
      repeat('f', 64), repeat('f', 64), repeat('f', 64)
    );
    raise exception 'Assignment triage accepted overflowing expected version';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.portal_referral_assignment_offer(
      'e1200000-0000-4000-8000-000000000002',
      'd1400000-0000-4000-8000-000000000004',
      9223372036854775807,
      repeat('e', 64), repeat('e', 64), repeat('e', 64)
    );
    raise exception 'Assignment offer accepted overflowing expected version';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;

  v_first := public.portal_referral_assignment_triage(
    'e1200000-0000-4000-8000-000000000002',
    1,
    repeat('1', 64),
    pg_catalog.current_setting('careslink.assignment.triage_payload_v1'),
    repeat('2', 64)
  );
  if v_first - array[
      'referral_id', 'match_id', 'current_status', 'row_version', 'updated_at'
    ]::text[] <> '{}'::jsonb
    or v_first->>'current_status' <> 'TRIAGED'
    or (v_first->>'row_version')::bigint <> 2
    or v_first->'match_id' <> 'null'::jsonb
  then
    raise exception 'Assignment triage ACK drifted: %', v_first;
  end if;

  v_replay := public.portal_referral_assignment_triage(
    'e1200000-0000-4000-8000-000000000002',
    1,
    repeat('1', 64),
    pg_catalog.current_setting('careslink.assignment.triage_payload_v1'),
    repeat('2', 64)
  );
  if v_replay is distinct from v_first then
    raise exception 'Assignment triage replay drifted';
  end if;

  begin
    perform public.portal_referral_assignment_triage(
      'e1200000-0000-4000-8000-000000000002',
      2,
      repeat('1', 64),
      pg_catalog.current_setting('careslink.assignment.triage_payload_v2'),
      repeat('3', 64)
    );
    raise exception 'Assignment triage changed-payload replay succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  begin
    perform public.portal_referral_assignment_triage(
      'e1200000-0000-4000-8000-000000000002',
      1,
      repeat('4', 64),
      pg_catalog.current_setting('careslink.assignment.triage_payload_v1'),
      repeat('5', 64)
    );
    raise exception 'Assignment stale triage succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_STALE_REFERRAL' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

do $$
begin
  if (select current_status from public.portal_referrals
      where id = 'e1200000-0000-4000-8000-000000000002') <> 'TRIAGED'
    or (select row_version from public.portal_referrals
        where id = 'e1200000-0000-4000-8000-000000000002') <> 2
    or (select assigned_provider_id from public.portal_referrals
        where id = 'e1200000-0000-4000-8000-000000000002') is not null
    or (select count(*) from public.portal_audit_events
        where referral_id = 'e1200000-0000-4000-8000-000000000002'
          and mutation_kind = 'TRIAGE_REFERRAL') <> 1
    or (select count(*) from public.portal_mutation_receipts
        where response_referral_id = 'e1200000-0000-4000-8000-000000000002'
          and mutation_kind = 'TRIAGE_REFERRAL') <> 1
  then
    raise exception 'Assignment triage atomicity/replay snapshot drifted';
  end if;
end
$$;

set local role authenticated;
do $$
declare
  v_candidates jsonb;
  v_one_candidate jsonb;
begin
  v_candidates := public.portal_referral_assignment_candidates(
    'e1200000-0000-4000-8000-000000000002',
    50
  );
  if jsonb_array_length(v_candidates->'items') <> 2
    or v_candidates->'items'->0->>'provider_id' <>
      'd1400000-0000-4000-8000-000000000004'
    or v_candidates->'items'->0->>'display_name' <>
      'Assignment Provider Available'
    or v_candidates->'items'->1->>'provider_id' <>
      'd1500000-0000-4000-8000-000000000005'
    or exists (
      select 1
      from jsonb_array_elements(v_candidates->'items') as item(value)
      where value - array['provider_id', 'display_name']::text[]
        <> '{}'::jsonb
    )
  then
    raise exception 'Assignment eligible-provider projection drifted: %',
      v_candidates;
  end if;

  v_one_candidate := public.portal_referral_assignment_candidates(
    'e1200000-0000-4000-8000-000000000002',
    1
  );
  if jsonb_array_length(v_one_candidate->'items') <> 1
    or v_one_candidate->'items'->0->>'provider_id' <>
      'd1400000-0000-4000-8000-000000000004'
  then
    raise exception 'Assignment bounded provider helper drifted: %',
      v_one_candidate;
  end if;

  begin
    perform public.portal_referral_assignment_candidates(
      'e1300000-0000-4000-8000-000000000003', 50
    );
    raise exception 'Operator A listed Source B candidates';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

do $$
begin
  if (select count(*) from public.portal_referral_matches) <> 1 then
    raise exception 'Assignment candidate read wrote a match row';
  end if;
end
$$;

-- Uniform provider visibility: a historical target match cannot reveal an
-- absent/currently-ineligible provider association. An eligible provider with
-- a non-CANDIDATE historical match remains an explicit state error.
insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region, service_type,
  current_status, assigned_provider_id, row_version, created_at, updated_at
) values
  (
    'e1500000-0000-4000-8000-000000000005',
    'c1200000-0000-4000-8000-000000000002',
    'a1400000-0000-4000-8000-000000000004',
    'Uniform not found with declined ineligible provider',
    'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'TRIAGED', null, 1,
    '2026-08-25 04:00:00+00', '2026-08-25 04:01:00+00'
  ),
  (
    'e1600000-0000-4000-8000-000000000006',
    'c1200000-0000-4000-8000-000000000002',
    'a1400000-0000-4000-8000-000000000004',
    'Uniform not found with expired ineligible provider',
    'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'TRIAGED', null, 1,
    '2026-08-25 04:10:00+00', '2026-08-25 04:11:00+00'
  ),
  (
    'e1700000-0000-4000-8000-000000000007',
    'c1200000-0000-4000-8000-000000000002',
    'a1400000-0000-4000-8000-000000000004',
    'Uniform not found with absent provider',
    'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'TRIAGED', null, 1,
    '2026-08-25 04:20:00+00', '2026-08-25 04:21:00+00'
  ),
  (
    'e1800000-0000-4000-8000-000000000008',
    'c1200000-0000-4000-8000-000000000002',
    'a1400000-0000-4000-8000-000000000004',
    'Eligible provider with declined historical match',
    'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'TRIAGED', null, 1,
    '2026-08-25 04:30:00+00', '2026-08-25 04:31:00+00'
  );

insert into public.portal_referral_matches (
  id, referral_id, provider_id, score, status, row_version,
  created_at, updated_at
) values
  (
    'f1500000-0000-4000-8000-000000000005',
    'e1500000-0000-4000-8000-000000000005',
    'd1600000-0000-4000-8000-000000000006',
    null, 'DECLINED', 1, now(), now()
  ),
  (
    'f1600000-0000-4000-8000-000000000006',
    'e1600000-0000-4000-8000-000000000006',
    'd1900000-0000-4000-8000-000000000009',
    null, 'EXPIRED', 1, now(), now()
  ),
  (
    'f1800000-0000-4000-8000-000000000008',
    'e1800000-0000-4000-8000-000000000008',
    'd1500000-0000-4000-8000-000000000005',
    null, 'DECLINED', 1, now(), now()
  );

select pg_catalog.set_config(
  'careslink.assignment.uniform_declined_payload',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator', 'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1500000-0000-4000-8000-000000000005',
      'providerId', 'd1600000-0000-4000-8000-000000000006',
      'expectedVersion', 1
    )
  )), true
);
select pg_catalog.set_config(
  'careslink.assignment.uniform_expired_payload',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator', 'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1600000-0000-4000-8000-000000000006',
      'providerId', 'd1900000-0000-4000-8000-000000000009',
      'expectedVersion', 1
    )
  )), true
);
select pg_catalog.set_config(
  'careslink.assignment.uniform_absent_payload',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator', 'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1700000-0000-4000-8000-000000000007',
      'providerId', 'db000000-0000-4000-8000-00000000000b',
      'expectedVersion', 1
    )
  )), true
);
select pg_catalog.set_config(
  'careslink.assignment.eligible_declined_payload',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator', 'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1800000-0000-4000-8000-000000000008',
      'providerId', 'd1500000-0000-4000-8000-000000000005',
      'expectedVersion', 1
    )
  )), true
);

set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_offer(
      'e1500000-0000-4000-8000-000000000005',
      'd1600000-0000-4000-8000-000000000006',
      1, repeat('5', 64),
      pg_catalog.current_setting(
        'careslink.assignment.uniform_declined_payload'
      ), repeat('5', 64)
    );
    raise exception 'Ineligible DECLINED provider association was observable';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;

  begin
    perform public.portal_referral_assignment_offer(
      'e1600000-0000-4000-8000-000000000006',
      'd1900000-0000-4000-8000-000000000009',
      1, repeat('7', 64),
      pg_catalog.current_setting(
        'careslink.assignment.uniform_expired_payload'
      ), repeat('7', 64)
    );
    raise exception 'Ineligible EXPIRED provider association was observable';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;

  begin
    perform public.portal_referral_assignment_offer(
      'e1700000-0000-4000-8000-000000000007',
      'db000000-0000-4000-8000-00000000000b',
      1, repeat('9', 64),
      pg_catalog.current_setting(
        'careslink.assignment.uniform_absent_payload'
      ), repeat('9', 64)
    );
    raise exception 'Absent provider did not share uniform NOT_FOUND';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;

  begin
    perform public.portal_referral_assignment_offer(
      'e1800000-0000-4000-8000-000000000008',
      'd1500000-0000-4000-8000-000000000005',
      1, repeat('a', 64),
      pg_catalog.current_setting(
        'careslink.assignment.eligible_declined_payload'
      ), repeat('a', 64)
    );
    raise exception 'Eligible DECLINED provider match was promoted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_INVALID_STATE_TRANSITION' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

do $$
begin
  if exists (
      select 1
      from public.portal_referrals as referral
      where referral.id in (
        'e1500000-0000-4000-8000-000000000005',
        'e1600000-0000-4000-8000-000000000006',
        'e1700000-0000-4000-8000-000000000007',
        'e1800000-0000-4000-8000-000000000008'
      )
        and (
          referral.current_status <> 'TRIAGED'
          or referral.row_version <> 1
          or referral.assigned_provider_id is not null
        )
    )
    or (select status from public.portal_referral_matches
        where id = 'f1500000-0000-4000-8000-000000000005') <> 'DECLINED'
    or (select status from public.portal_referral_matches
        where id = 'f1600000-0000-4000-8000-000000000006') <> 'EXPIRED'
    or (select status from public.portal_referral_matches
        where id = 'f1800000-0000-4000-8000-000000000008') <> 'DECLINED'
    or exists (
      select 1 from public.portal_audit_events
      where referral_id in (
        'e1500000-0000-4000-8000-000000000005',
        'e1600000-0000-4000-8000-000000000006',
        'e1700000-0000-4000-8000-000000000007',
        'e1800000-0000-4000-8000-000000000008'
      )
    )
    or exists (
      select 1 from public.portal_mutation_receipts
      where response_referral_id in (
        'e1500000-0000-4000-8000-000000000005',
        'e1600000-0000-4000-8000-000000000006',
        'e1700000-0000-4000-8000-000000000007',
        'e1800000-0000-4000-8000-000000000008'
      )
    )
  then
    raise exception 'Uniform provider NOT_FOUND zero-write snapshot drifted';
  end if;
end
$$;

-- Ineligible offer target is indistinguishable from an absent provider and
-- leaves referral/match/audit/receipt counts unchanged.
select pg_catalog.set_config(
  'careslink.assignment.offer_unknown_payload',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator', 'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1200000-0000-4000-8000-000000000002',
      'providerId', 'd1600000-0000-4000-8000-000000000006',
      'expectedVersion', 2
    )
  )), true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_offer(
      'e1200000-0000-4000-8000-000000000002',
      'd1600000-0000-4000-8000-000000000006',
      2, repeat('6', 64),
      pg_catalog.current_setting('careslink.assignment.offer_unknown_payload'),
      repeat('7', 64)
    );
    raise exception 'UNKNOWN provider received Assignment offer';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

do $$
begin
  if (select current_status from public.portal_referrals
      where id = 'e1200000-0000-4000-8000-000000000002') <> 'TRIAGED'
    or (select row_version from public.portal_referrals
        where id = 'e1200000-0000-4000-8000-000000000002') <> 2
    or (select count(*) from public.portal_referral_matches
        where referral_id =
          'e1200000-0000-4000-8000-000000000002') <> 0
    or (select count(*) from public.portal_audit_events) <> 1
    or (select count(*) from public.portal_mutation_receipts
        where response_referral_id =
          'e1200000-0000-4000-8000-000000000002') <> 1
  then
    raise exception 'Ineligible Assignment offer changed persisted state';
  end if;
end
$$;

select pg_catalog.set_config(
  'careslink.assignment.offer_payload_v1',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator', 'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1200000-0000-4000-8000-000000000002',
      'providerId', 'd1400000-0000-4000-8000-000000000004',
      'expectedVersion', 2
    )
  )), true
);
select pg_catalog.set_config(
  'careslink.assignment.offer_payload_changed',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator', 'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1200000-0000-4000-8000-000000000002',
      'providerId', 'd1500000-0000-4000-8000-000000000005',
      'expectedVersion', 2
    )
  )), true
);

set local role authenticated;
do $$
declare
  v_first jsonb;
begin
  v_first := public.portal_referral_assignment_offer(
    'e1200000-0000-4000-8000-000000000002',
    'd1400000-0000-4000-8000-000000000004',
    2, repeat('8', 64),
    pg_catalog.current_setting('careslink.assignment.offer_payload_v1'),
    repeat('9', 64)
  );
  perform pg_catalog.set_config(
    'careslink.assignment.first_offer_ack', v_first::text, true
  );
  if v_first->>'current_status' <> 'OFFERED'
    or (v_first->>'row_version')::bigint <> 3
    or v_first->>'match_id' is null
  then
    raise exception 'Assignment offer ACK drifted: %', v_first;
  end if;

  begin
    perform public.portal_referral_assignment_offer(
      'e1200000-0000-4000-8000-000000000002',
      'd1500000-0000-4000-8000-000000000005',
      2, repeat('8', 64),
      pg_catalog.current_setting('careslink.assignment.offer_payload_changed'),
      repeat('a', 64)
    );
    raise exception 'Assignment offer changed-payload replay succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

-- Completed replay remains stable after the target becomes ineligible.
update public.portal_providers
set review_status = 'SUSPENDED', updated_at = now()
where id = 'd1400000-0000-4000-8000-000000000004';
set local role authenticated;
do $$
declare
  v_replay jsonb;
begin
  v_replay := public.portal_referral_assignment_offer(
    'e1200000-0000-4000-8000-000000000002',
    'd1400000-0000-4000-8000-000000000004',
    2, repeat('8', 64),
    pg_catalog.current_setting('careslink.assignment.offer_payload_v1'),
    repeat('9', 64)
  );
  if v_replay is distinct from
    pg_catalog.current_setting('careslink.assignment.first_offer_ack')::jsonb
  then
    raise exception 'Assignment offer replay changed after eligibility loss';
  end if;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

do $$
declare
  v_metadata jsonb;
begin
  select audit.metadata into v_metadata
  from public.portal_audit_events as audit
  where audit.referral_id = 'e1200000-0000-4000-8000-000000000002'
    and audit.mutation_kind = 'OFFER_REFERRAL';

  if (select current_status from public.portal_referrals
      where id = 'e1200000-0000-4000-8000-000000000002') <> 'OFFERED'
    or (select row_version from public.portal_referrals
        where id = 'e1200000-0000-4000-8000-000000000002') <> 3
    or (select assigned_provider_id from public.portal_referrals
        where id = 'e1200000-0000-4000-8000-000000000002') is not null
    or (select count(*) from public.portal_referral_matches
        where referral_id = 'e1200000-0000-4000-8000-000000000002'
          and status = 'OFFERED') <> 1
    or (select count(*) from public.portal_audit_events
        where referral_id = 'e1200000-0000-4000-8000-000000000002'
          and mutation_kind = 'OFFER_REFERRAL') <> 1
    or (select count(*) from public.portal_mutation_receipts
        where response_referral_id = 'e1200000-0000-4000-8000-000000000002'
          and mutation_kind = 'OFFER_REFERRAL') <> 1
    or v_metadata - array['matchId', 'providerId']::text[] <> '{}'::jsonb
  then
    raise exception 'Assignment offer atomic snapshot drifted';
  end if;
end
$$;

set local role authenticated;
do $$
declare
  v_detail jsonb;
begin
  v_detail := public.portal_referral_assignment_detail(
    'e1200000-0000-4000-8000-000000000002'
  );
  if v_detail->>'current_status' <> 'OFFERED'
    or v_detail->'active_offer' = 'null'::jsonb
    or (v_detail->'active_offer') - array[
      'match_id', 'provider_id', 'provider_display_name',
      'match_status', 'offered_at'
    ]::text[] <> '{}'::jsonb
    or v_detail->'active_offer'->>'match_status' <> 'OFFERED'
    or v_detail->'active_offer'->>'provider_id' <>
      'd1400000-0000-4000-8000-000000000004'
    or v_detail->'active_offer'->>'provider_display_name' <>
      'Assignment Provider Available'
  then
    raise exception 'Assignment OFFERED detail projection drifted: %', v_detail;
  end if;

  begin
    perform public.portal_referral_assignment_candidates(
      'e1200000-0000-4000-8000-000000000002', 50
    );
    raise exception 'OFFERED referral still listed Assignment candidates';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_INVALID_STATE_TRANSITION' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

-- Existing CANDIDATE promotion uses the same match id, increments its version
-- and still leaves assigned_provider_id null.
update public.portal_providers
set review_status = 'APPROVED', updated_at = now()
where id = 'd1400000-0000-4000-8000-000000000004';
select pg_catalog.set_config(
  'careslink.assignment.offer_candidate_payload',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1200000-0000-4000-8000-000000000002',
      'role', 'partner_operator', 'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1210000-0000-4000-8000-000000000012',
      'providerId', 'd1500000-0000-4000-8000-000000000005',
      'expectedVersion', 1
    )
  )), true
);
insert into public.portal_mutation_receipts (
  actor_user_id, mutation_id_hash, mutation_kind, payload_hash,
  response_referral_id, response_match_id, response_status,
  response_row_version, response_updated_at, created_at
) values (
  'a1200000-0000-4000-8000-000000000002', repeat('3', 64),
  'OFFER_REFERRAL',
  pg_catalog.current_setting('careslink.assignment.offer_candidate_payload'),
  'e1210000-0000-4000-8000-000000000012',
  'f1210000-0000-4000-8000-000000000012',
  'TRIAGED', 1, '2026-08-25 01:13:00+00', now()
);
set local role authenticated;
do $$
declare
  v_ack jsonb;
begin
  begin
    perform public.portal_referral_assignment_offer(
      'e1210000-0000-4000-8000-000000000012',
      'd1500000-0000-4000-8000-000000000005',
      1, repeat('3', 64),
      pg_catalog.current_setting('careslink.assignment.offer_candidate_payload'),
      repeat('3', 64)
    );
    raise exception 'Assignment offer replay accepted corrupt receipt ACK';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  v_ack := public.portal_referral_assignment_offer(
    'e1210000-0000-4000-8000-000000000012',
    'd1500000-0000-4000-8000-000000000005',
    1, repeat('b', 64),
    pg_catalog.current_setting('careslink.assignment.offer_candidate_payload'),
    repeat('c', 64)
  );
  if v_ack->>'match_id' <> 'f1210000-0000-4000-8000-000000000012'
    or v_ack->>'current_status' <> 'OFFERED'
    or (v_ack->>'row_version')::bigint <> 2
  then
    raise exception 'Assignment CANDIDATE promotion ACK drifted';
  end if;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

do $$
begin
  if (select status from public.portal_referral_matches
      where id = 'f1210000-0000-4000-8000-000000000012') <> 'OFFERED'
    or (select row_version from public.portal_referral_matches
        where id = 'f1210000-0000-4000-8000-000000000012') <> 2
    or (select assigned_provider_id from public.portal_referrals
        where id = 'e1210000-0000-4000-8000-000000000012') is not null
  then
    raise exception 'Assignment CANDIDATE promotion snapshot drifted';
  end if;
end
$$;

-- Admin can triage Source B globally using its own DB-derived actor hash.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1100000-0000-4000-8000-000000000001","session_id":"b1100000-0000-4000-8000-000000000001"}',
  true
);
select pg_catalog.set_config(
  'careslink.assignment.admin_triage_payload',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c1100000-0000-4000-8000-000000000001',
      'role', 'platform_admin', 'providerId', null
    ),
    'kind', 'TRIAGE_REFERRAL',
    'command', jsonb_build_object(
      'referralId', 'e1300000-0000-4000-8000-000000000003',
      'expectedVersion', 1
    )
  )), true
);
set local role authenticated;
do $$
begin
  if public.portal_referral_assignment_triage(
      'e1300000-0000-4000-8000-000000000003',
      1, repeat('d', 64),
      pg_catalog.current_setting('careslink.assignment.admin_triage_payload'),
      repeat('e', 64)
    )->>'current_status' <> 'TRIAGED'
  then
    raise exception 'Platform admin global triage drifted';
  end if;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

-- Revoked operator membership fails on the next call.
update public.portal_organization_memberships
set status = 'SUSPENDED', updated_at = now()
where organization_id = 'c1300000-0000-4000-8000-000000000003'
  and user_id = 'a1300000-0000-4000-8000-000000000003'
  and role = 'partner_operator';
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1300000-0000-4000-8000-000000000003","session_id":"b1300000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_assignment_authorize();
    raise exception 'Suspended operator membership opened Assignment';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

-- Close the capability in global-before-operation order, remove fixtures, and
-- prove the suite leaves no durable test state before its final ROLLBACK.
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_workflow_v1';
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_assignment_v1';

-- Fixture-only cleanup must temporarily bypass the two append-only row
-- triggers; both trigger-state changes and all deletes are inside this same
-- rollback-only transaction and are restored before the zero-fixture proof.
alter table public.portal_audit_events
  disable trigger portal_audit_append_only;
alter table public.portal_mutation_receipts
  disable trigger portal_receipts_append_only;

delete from public.portal_audit_events
where actor_user_id::text like 'a1%';
delete from public.portal_mutation_receipts
where actor_user_id::text like 'a1%';
delete from public.portal_referral_matches
where referral_id::text like 'e1%';
delete from careslink_portal_private.portal_referral_contacts
where referral_id::text like 'e1%';
delete from public.portal_referrals
where id::text like 'e1%';
delete from public.portal_providers
where id::text like 'd1%' or id::text like 'da1%';
delete from public.portal_organization_memberships
where user_id::text like 'a1%';
delete from public.portal_organizations
where id::text like 'c1%' or id::text like 'ca1%';
delete from auth.sessions
where user_id::text like 'a1%';
delete from auth.users
where id::text like 'a1%';

alter table public.portal_mutation_receipts
  enable trigger portal_receipts_append_only;
alter table public.portal_audit_events
  enable trigger portal_audit_append_only;

do $$
begin
  if (select enabled from public.portal_workflow_flags
      where capability = 'referral_workflow_v1') is distinct from false
    or (select enabled from public.portal_workflow_flags
        where capability = 'referral_assignment_v1') is distinct from false
    or exists (select 1 from public.portal_referrals where id::text like 'e1%')
    or exists (select 1 from public.portal_referral_matches
               where referral_id::text like 'e1%')
    or exists (select 1 from public.portal_audit_events
               where actor_user_id::text like 'a1%')
    or exists (select 1 from public.portal_mutation_receipts
               where actor_user_id::text like 'a1%')
    or exists (select 1 from auth.users where id::text like 'a1%')
    or exists (
      select 1
      from pg_catalog.pg_trigger as trigger
      where trigger.tgname in (
        'portal_receipts_append_only', 'portal_audit_append_only'
      )
        and trigger.tgenabled <> 'O'
    )
  then
    raise exception 'Portal Assignment zero-fixture posture drifted';
  end if;
end
$$;

rollback;
