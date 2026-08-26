-- Manual rollback-only assertions for the Production-unapplied Portal
-- Referral Follow-up M1c runtime. Run after the exact repository migrations on
-- a disposable database with ON_ERROR_STOP=1. This suite proves
-- single-connection SQL semantics and statically pins lock order; a true two-session
-- race remains a separate release gate.

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

do $$
declare
  v_signature text;
  v_table text;
  v_definition text;
  v_gate_definition text;
  v_authorize_definition text;
  v_detail_definition text;
  v_record_definition text;
  v_search_path text;
  v_public_execute boolean;
  v_entry_actor oid := (
    select role.oid
    from pg_catalog.pg_roles as role
    where role.rolname = pg_catalog.current_setting(
      'careslink.assertion_entry_role'
    )
  );
begin
  if v_entry_actor is null then
    raise exception 'Follow-up assertion entry actor is missing';
  end if;

  if (select count(*)
      from public.portal_workflow_flags
      where capability = 'referral_follow_up_v1') <> 1
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_follow_up_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_follow_up_v1') is distinct from true
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from true
  then
    raise exception 'Follow-up flags are not default-off Preview-only';
  end if;

  if (select count(*)
      from pg_catalog.pg_proc as routine
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public'
        and routine.proname like 'portal_referral_follow_up_%') <> 3
    or (select count(*)
        from pg_catalog.pg_proc as routine
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = routine.pronamespace
        where namespace.nspname = 'careslink_portal_private'
          and routine.proname like 'portal_referral_follow_up_%') <> 1
  then
    raise exception 'Follow-up exact RPC surface drifted';
  end if;

  foreach v_signature in array array[
    'careslink_portal_private.portal_referral_follow_up_assert_enabled()',
    'public.portal_referral_follow_up_authorize()',
    'public.portal_referral_follow_up_detail(uuid)',
    'public.portal_referral_follow_up_record(uuid,bigint,text,text,text,text)'
  ] loop
    v_definition := null;
    v_search_path := null;
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
      raise exception '% definer/owner/search-path posture drifted',
        v_signature;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'careslink_portal_private.portal_referral_follow_up_assert_enabled()'
    )
  ) into v_gate_definition;

  if strpos(v_gate_definition, 'referral_workflow_v1') = 0
    or strpos(v_gate_definition, 'referral_follow_up_v1')
      <= strpos(v_gate_definition, 'referral_workflow_v1')
    or (length(lower(v_gate_definition)) - length(replace(
      lower(v_gate_definition), 'for share of flag', ''
    ))) / length('for share of flag') <> 2
    or lower(v_gate_definition) like '%for key share%'
  then
    raise exception 'Follow-up gate lock order drifted';
  end if;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.portal_referral_follow_up_authorize()'
    )
  ) into v_authorize_definition;
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.portal_referral_follow_up_detail(uuid)'
    )
  ) into v_detail_definition;
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.portal_referral_follow_up_record(uuid,bigint,text,text,text,text)'
    )
  ) into v_record_definition;

  if (v_authorize_definition || v_detail_definition || v_record_definition)
      like '%portal_referral_provider_response_assert_enabled%'
  then
    raise exception 'Follow-up reused the Provider Response operation gate';
  end if;

  if v_authorize_definition not like
      '%portal_referral_provider_response_context()%'
    or v_detail_definition not like
      '%portal_referral_provider_response_context()%'
    or v_detail_definition not like
      '%portal_referral_provider_response_assert_session(%'
    or v_record_definition not like
      '%portal_referral_provider_response_context()%'
    or v_record_definition not like
      '%portal_referral_provider_response_assert_session(%'
  then
    raise exception 'Follow-up provider context dependency drifted';
  end if;

  if v_detail_definition not like
      '%referral.assigned_provider_id = v_provider_id%'
    or v_detail_definition not like
      '%v_referral.current_status not in (''ACCEPTED'', ''IN_PROGRESS'')%'
    or v_detail_definition not like '%match.status = ''ACCEPTED''%'
    or v_detail_definition not like '%match.offered_at is not null%'
    or v_detail_definition not like '%match.responded_by is not null%'
    or v_detail_definition not like '%match.responded_at is not null%'
    or v_detail_definition not like '%v_accepted_match_count <> 1%'
    or v_detail_definition not like
      '%careslink_portal_private.portal_referral_contacts%'
    or v_detail_definition not like '%''summary'', v_referral.summary%'
    or v_detail_definition not like '%''contact'', jsonb_build_object(%'
    or v_detail_definition like '%portal_referral_followups%'
    or v_detail_definition like '%portal_audit_events%'
    or v_detail_definition like '%portal_mutation_receipts%'
    or v_detail_definition like '%source_organization_id%'
    or v_detail_definition like '%source_user_id%'
  then
    raise exception 'Follow-up private detail projection drifted';
  end if;

  if v_record_definition not like '%pg_advisory_xact_lock%'
    or v_record_definition not like '%''kind'', ''RECORD_FOLLOW_UP''%'
    or v_record_definition not like '%''providerId'', v_provider_id::text%'
    or v_record_definition not like '%''outcomeCode'', p_outcome_code%'
    or v_record_definition not like '%public.v1_shadow_content_sha256%'
    or v_record_definition not like
      '%p_payload_hash is distinct from v_payload_hash%'
    or (length(lower(v_record_definition)) - length(replace(
      lower(v_record_definition), 'for update of referral', ''
    ))) / length('for update of referral') <> 2
    or (length(lower(v_record_definition)) - length(replace(
      lower(v_record_definition), 'order by match.id', ''
    ))) / length('order by match.id') <> 2
    or (length(lower(v_record_definition)) - length(replace(
      lower(v_record_definition), 'for update of match', ''
    ))) / length('for update of match') <> 2
    or strpos(lower(v_record_definition), 'for update of referral') = 0
    or strpos(lower(v_record_definition), 'order by match.id')
      <= strpos(lower(v_record_definition), 'for update of referral')
    or strpos(lower(v_record_definition), 'for update of match')
      <= strpos(lower(v_record_definition), 'order by match.id')
    or strpos(
      lower(substr(
        v_record_definition,
        strpos(lower(v_record_definition), 'for update of match')
      )),
      'portal_referral_provider_response_assert_session('
    ) = 0
    or v_record_definition not like '%v_accepted_match_count <> 1%'
    or v_record_definition not like
      '%v_referral.current_status not in (''ACCEPTED'', ''IN_PROGRESS'')%'
    or v_record_definition not like
      '%insert into public.portal_referral_followups%'
    or v_record_definition not like '%next_due_at%null%'
    or v_record_definition not like '%insert into public.portal_audit_events%'
    or v_record_definition not like
      '%jsonb_build_object(''outcomeCode'', p_outcome_code)%'
    or v_record_definition not like
      '%insert into public.portal_mutation_receipts%'
  then
    raise exception 'Follow-up mutation/lock/hash posture drifted';
  end if;

  if pg_catalog.to_regclass(
      'public.portal_referrals_provider_status_idx'
    ) is null
    or pg_catalog.to_regclass(
      'public.portal_matches_one_accepted_idx'
    ) is null
    or pg_catalog.to_regclass(
      'public.portal_followups_referral_created_idx'
    ) is null
    or not exists (
      select 1
      from pg_catalog.pg_index as index_posture
      join pg_catalog.pg_class as relation
        on relation.oid = index_posture.indrelid
      where relation.oid = 'public.portal_mutation_receipts'::regclass
        and index_posture.indisunique
        and pg_catalog.pg_get_indexdef(index_posture.indexrelid)
          like '%(actor_user_id, mutation_id_hash)%'
    )
  then
    raise exception 'Follow-up existing index coverage drifted';
  end if;

  foreach v_signature in array array[
    'public.portal_referral_follow_up_authorize()',
    'public.portal_referral_follow_up_detail(uuid)',
    'public.portal_referral_follow_up_record(uuid,bigint,text,text,text,text)'
  ] loop
    select exists (
      select 1
      from pg_catalog.pg_proc as routine
      cross join lateral pg_catalog.aclexplode(
        coalesce(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
      ) as privilege
      where routine.oid = pg_catalog.to_regprocedure(v_signature)
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) into v_public_execute;

    if not pg_catalog.has_function_privilege(
      'authenticated', v_signature, 'EXECUTE'
    )
      or v_public_execute
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege(
        'service_role', v_signature, 'EXECUTE'
      )
    then
      raise exception '% public RPC ACL drifted', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'careslink_portal_private.portal_referral_follow_up_assert_enabled()',
    'careslink_portal_private.portal_referral_provider_response_assert_session(uuid,uuid)',
    'careslink_portal_private.portal_referral_provider_response_context()'
  ] loop
    select exists (
      select 1
      from pg_catalog.pg_proc as routine
      cross join lateral pg_catalog.aclexplode(
        coalesce(routine.proacl, pg_catalog.acldefault('f', routine.proowner))
      ) as privilege
      where routine.oid = pg_catalog.to_regprocedure(v_signature)
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) into v_public_execute;

    if v_public_execute
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege(
        'authenticated', v_signature, 'EXECUTE'
      )
      or pg_catalog.has_function_privilege(
        'service_role', v_signature, 'EXECUTE'
      )
    then
      raise exception '% private helper ACL drifted', v_signature;
    end if;
  end loop;

  foreach v_table in array array[
    'public.portal_workflow_flags',
    'public.portal_organizations',
    'public.portal_organization_memberships',
    'public.portal_providers',
    'public.portal_referrals',
    'careslink_portal_private.portal_referral_contacts',
    'public.portal_referral_matches',
    'public.portal_referral_followups',
    'public.portal_mutation_receipts',
    'public.portal_audit_events'
  ] loop
    if pg_catalog.has_table_privilege('anon', v_table, 'SELECT')
      or pg_catalog.has_table_privilege('anon', v_table, 'INSERT')
      or pg_catalog.has_table_privilege('anon', v_table, 'UPDATE')
      or pg_catalog.has_table_privilege('anon', v_table, 'DELETE')
      or pg_catalog.has_table_privilege('authenticated', v_table, 'SELECT')
      or pg_catalog.has_table_privilege('authenticated', v_table, 'INSERT')
      or pg_catalog.has_table_privilege('authenticated', v_table, 'UPDATE')
      or pg_catalog.has_table_privilege('authenticated', v_table, 'DELETE')
      or pg_catalog.has_table_privilege('service_role', v_table, 'SELECT')
      or pg_catalog.has_table_privilege('service_role', v_table, 'INSERT')
      or pg_catalog.has_table_privilege('service_role', v_table, 'UPDATE')
      or pg_catalog.has_table_privilege('service_role', v_table, 'DELETE')
    then
      raise exception '% API table grant drifted', v_table;
    end if;
  end loop;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('a3100000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'followup-provider-a@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a3200000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000000',
   'authenticated', 'authenticated', 'followup-provider-b@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a3300000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000000',
   'authenticated', 'authenticated', 'followup-ambiguous@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a3400000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000000',
   'authenticated', 'authenticated', 'followup-expired@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a3500000-0000-4000-8000-000000000005',
   '00000000-0000-4000-8000-000000000000',
   'authenticated', 'authenticated', 'followup-source@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a3600000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000000',
   'authenticated', 'authenticated', 'followup-offerer@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('b3100000-0000-4000-8000-000000000001',
   'a3100000-0000-4000-8000-000000000001', now(), now(), null),
  ('b3200000-0000-4000-8000-000000000002',
   'a3200000-0000-4000-8000-000000000002', now(), now(), null),
  ('b3300000-0000-4000-8000-000000000003',
   'a3300000-0000-4000-8000-000000000003', now(), now(), null),
  ('b3400000-0000-4000-8000-000000000004',
   'a3400000-0000-4000-8000-000000000004', now(), now(),
   pg_catalog.clock_timestamp() - interval '1 second');

insert into public.portal_organizations (
  id, organization_type, display_name, status
) values
  ('c3100000-0000-4000-8000-000000000001',
   'REFERRAL_SOURCE', 'Follow-up Source', 'ACTIVE'),
  ('c3200000-0000-4000-8000-000000000002',
   'PROVIDER', 'Follow-up Provider A', 'ACTIVE'),
  ('c3300000-0000-4000-8000-000000000003',
   'PROVIDER', 'Follow-up Provider B', 'ACTIVE');

insert into public.portal_organization_memberships (
  organization_id, user_id, role, status
) values
  ('c3200000-0000-4000-8000-000000000002',
   'a3100000-0000-4000-8000-000000000001',
   'provider_member', 'ACTIVE'),
  ('c3300000-0000-4000-8000-000000000003',
   'a3200000-0000-4000-8000-000000000002',
   'provider_member', 'ACTIVE'),
  ('c3200000-0000-4000-8000-000000000002',
   'a3300000-0000-4000-8000-000000000003',
   'provider_member', 'ACTIVE'),
  ('c3300000-0000-4000-8000-000000000003',
   'a3300000-0000-4000-8000-000000000003',
   'provider_member', 'ACTIVE'),
  ('c3200000-0000-4000-8000-000000000002',
   'a3400000-0000-4000-8000-000000000004',
   'provider_member', 'ACTIVE');

-- Capacity does not revoke already-accepted work authority.
insert into public.portal_providers (
  id, organization_id, review_status, service_types, regions, capacity_status
) values
  ('d3200000-0000-4000-8000-000000000002',
   'c3200000-0000-4000-8000-000000000002', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'UNAVAILABLE'),
  ('d3300000-0000-4000-8000-000000000003',
   'c3300000-0000-4000-8000-000000000003', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'LIMITED');

insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region, service_type,
  current_status, assigned_provider_id, row_version, created_at, updated_at
) values
  ('e3100000-0000-4000-8000-000000000001',
   'c3100000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000005',
   'Follow-up accepted fixture A private detail',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'ACCEPTED',
   'd3200000-0000-4000-8000-000000000002', 4,
   '2026-08-26 03:00:00+00', '2026-08-26 03:04:00+00'),
  ('e3200000-0000-4000-8000-000000000002',
   'c3100000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000005',
   'Follow-up in progress fixture A',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'IN_PROGRESS',
   'd3200000-0000-4000-8000-000000000002', 8,
   '2026-08-26 03:10:00+00', '2026-08-26 03:18:00+00'),
  ('e3300000-0000-4000-8000-000000000003',
   'c3100000-0000-4000-8000-000000000001',
   'a3500000-0000-4000-8000-000000000005',
   'Follow-up accepted fixture B private detail',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'ACCEPTED',
   'd3300000-0000-4000-8000-000000000003', 4,
   '2026-08-26 03:20:00+00', '2026-08-26 03:24:00+00');

insert into careslink_portal_private.portal_referral_contacts (
  referral_id, contact_name, contact_phone, contact_email,
  created_at, updated_at
) values
  ('e3100000-0000-4000-8000-000000000001',
   'Accepted Person A', '0400000001', 'accepted-a@example.invalid',
   '2026-08-26 03:00:00+00', '2026-08-26 03:00:00+00'),
  ('e3200000-0000-4000-8000-000000000002',
   'Progress Person A', '0400000002', null,
   '2026-08-26 03:10:00+00', '2026-08-26 03:10:00+00'),
  ('e3300000-0000-4000-8000-000000000003',
   'Accepted Person B', '0400000003', 'accepted-b@example.invalid',
   '2026-08-26 03:20:00+00', '2026-08-26 03:20:00+00');

insert into public.portal_referral_matches (
  id, referral_id, provider_id, score, status, offered_by, offered_at,
  responded_by, responded_at, row_version, created_at, updated_at
) values
  ('f3100000-0000-4000-8000-000000000001',
   'e3100000-0000-4000-8000-000000000001',
   'd3200000-0000-4000-8000-000000000002', null, 'ACCEPTED',
   'a3600000-0000-4000-8000-000000000006', '2026-08-26 03:03:00+00',
   'a3100000-0000-4000-8000-000000000001', '2026-08-26 03:04:00+00', 2,
   '2026-08-26 03:03:00+00', '2026-08-26 03:04:00+00'),
  ('f3200000-0000-4000-8000-000000000002',
   'e3200000-0000-4000-8000-000000000002',
   'd3200000-0000-4000-8000-000000000002', null, 'ACCEPTED',
   'a3600000-0000-4000-8000-000000000006', '2026-08-26 03:13:00+00',
   'a3100000-0000-4000-8000-000000000001', '2026-08-26 03:14:00+00', 2,
   '2026-08-26 03:13:00+00', '2026-08-26 03:14:00+00'),
  ('f3300000-0000-4000-8000-000000000003',
   'e3300000-0000-4000-8000-000000000003',
   'd3300000-0000-4000-8000-000000000003', null, 'ACCEPTED',
   'a3600000-0000-4000-8000-000000000006', '2026-08-26 03:23:00+00',
   'a3200000-0000-4000-8000-000000000002', '2026-08-26 03:24:00+00', 2,
   '2026-08-26 03:23:00+00', '2026-08-26 03:24:00+00');

-- Canonical hashes are computed as the migration owner, never as the API role.
select pg_catalog.set_config(
  'careslink.follow_up.accepted_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c3200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd3200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RECORD_FOLLOW_UP',
    'command', jsonb_build_object(
      'referralId', 'e3100000-0000-4000-8000-000000000001',
      'expectedVersion', 4,
      'outcomeCode', 'CONTACT_CONFIRMED'
    )
  )), true
);
select pg_catalog.set_config(
  'careslink.follow_up.changed_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c3200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd3200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RECORD_FOLLOW_UP',
    'command', jsonb_build_object(
      'referralId', 'e3100000-0000-4000-8000-000000000001',
      'expectedVersion', 4,
      'outcomeCode', 'NO_RESPONSE'
    )
  )), true
);
select pg_catalog.set_config(
  'careslink.follow_up.foreign_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c3200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd3200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RECORD_FOLLOW_UP',
    'command', jsonb_build_object(
      'referralId', 'e3300000-0000-4000-8000-000000000003',
      'expectedVersion', 4,
      'outcomeCode', 'CONTACT_CONFIRMED'
    )
  )), true
);
select pg_catalog.set_config(
  'careslink.follow_up.competing_first_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c3200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd3200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RECORD_FOLLOW_UP',
    'command', jsonb_build_object(
      'referralId', 'e3200000-0000-4000-8000-000000000002',
      'expectedVersion', 8,
      'outcomeCode', 'INFORMATION_REQUESTED'
    )
  )), true
);
select pg_catalog.set_config(
  'careslink.follow_up.competing_second_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c3200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd3200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RECORD_FOLLOW_UP',
    'command', jsonb_build_object(
      'referralId', 'e3200000-0000-4000-8000-000000000002',
      'expectedVersion', 8,
      'outcomeCode', 'SERVICE_COMMENCED'
    )
  )), true
);

-- Operation=true while master=false must fail before provider context.
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_follow_up_v1';

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3100000-0000-4000-8000-000000000001","session_id":"b3100000-0000-4000-8000-000000000001"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_follow_up_authorize();
    raise exception 'Follow-up opened while master was disabled';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
end;
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

-- Master=true while operation=false must fail independently.
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_follow_up_v1';
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_workflow_v1';

set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_follow_up_authorize();
    raise exception 'Follow-up opened while operation was disabled';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
end;
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);

-- The M1b operation remains off: M1c has its own gate.
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_provider_response_v1';
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_follow_up_v1';

set local role authenticated;
do $$
declare
  v_authorization jsonb;
  v_detail jsonb;
begin
  v_authorization := public.portal_referral_follow_up_authorize();
  if v_authorization is distinct from jsonb_build_object(
    'authorized', true,
    'user_id', 'a3100000-0000-4000-8000-000000000001'::uuid,
    'organization_id', 'c3200000-0000-4000-8000-000000000002'::uuid,
    'organization_type', 'PROVIDER',
    'organization_status', 'ACTIVE',
    'membership_role', 'provider_member',
    'membership_status', 'ACTIVE',
    'provider_id', 'd3200000-0000-4000-8000-000000000002'::uuid,
    'provider_review_status', 'APPROVED'
  ) then
    raise exception 'Follow-up authorization envelope drifted: %',
      v_authorization;
  end if;

  v_detail := public.portal_referral_follow_up_detail(
    'e3100000-0000-4000-8000-000000000001'
  );
  if v_detail->>'referral_id' is distinct from
      'e3100000-0000-4000-8000-000000000001'
    or v_detail->>'summary' is distinct from
      'Follow-up accepted fixture A private detail'
    or v_detail->>'region' is distinct from 'VIC_MELBOURNE'
    or v_detail->>'service_type' is distinct from 'SUPPORT_COORDINATION'
    or v_detail->>'current_status' is distinct from 'ACCEPTED'
    or (v_detail->>'row_version')::bigint is distinct from 4
    or v_detail->'contact'->>'name' is distinct from 'Accepted Person A'
    or v_detail->'contact'->>'phone' is distinct from '0400000001'
    or v_detail->'contact'->>'email' is distinct from
      'accepted-a@example.invalid'
    or v_detail - array[
      'referral_id', 'summary', 'region', 'service_type', 'current_status',
      'row_version', 'contact', 'created_at', 'updated_at'
    ]::text[] is distinct from '{}'::jsonb
    or not (v_detail ?& array[
      'referral_id', 'summary', 'region', 'service_type', 'current_status',
      'row_version', 'contact', 'created_at', 'updated_at'
    ])
    or (v_detail->'contact') - array['name', 'phone', 'email']::text[]
      is distinct from '{}'::jsonb
    or not ((v_detail->'contact') ?& array['name', 'phone', 'email'])
  then
    raise exception 'Follow-up private detail projection drifted: %', v_detail;
  end if;

  begin
    perform public.portal_referral_follow_up_detail(
      'e3300000-0000-4000-8000-000000000003'
    );
    raise exception 'Follow-up exposed a foreign accepted referral';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;

  begin
    perform 1 from public.portal_referral_followups;
    raise exception 'Follow-up authenticated direct table read succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Provider B sees its own accepted detail but not Provider A's private row.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3200000-0000-4000-8000-000000000002","session_id":"b3200000-0000-4000-8000-000000000002"}',
  true
);
do $$
declare
  v_detail jsonb;
begin
  v_detail := public.portal_referral_follow_up_detail(
    'e3300000-0000-4000-8000-000000000003'
  );
  if v_detail->>'summary' is distinct from
      'Follow-up accepted fixture B private detail'
    or v_detail->'contact'->>'phone' is distinct from '0400000003'
  then
    raise exception 'Follow-up Provider B detail drifted: %', v_detail;
  end if;

  begin
    perform public.portal_referral_follow_up_detail(
      'e3100000-0000-4000-8000-000000000001'
    );
    raise exception 'Follow-up Provider B exposed Provider A detail';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
end;
$$;

-- The accepted status and coherent accepted-match tuple both fail closed.
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
update public.portal_referrals
set current_status = 'TRIAGED'
where id = 'e3200000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3100000-0000-4000-8000-000000000001","session_id":"b3100000-0000-4000-8000-000000000001"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_follow_up_detail(
      'e3200000-0000-4000-8000-000000000002'
    );
    raise exception 'Follow-up exposed a non-accepted referral';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
end;
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
update public.portal_referrals
set current_status = 'IN_PROGRESS'
where id = 'e3200000-0000-4000-8000-000000000002';
update public.portal_referral_matches
set responded_at = null
where id = 'f3200000-0000-4000-8000-000000000002';
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_follow_up_detail(
      'e3200000-0000-4000-8000-000000000002'
    );
    raise exception 'Follow-up exposed corrupt accepted-match state';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_INVALID_STATE_TRANSITION' then raise; end if;
  end;
end;
$$;
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
update public.portal_referral_matches
set responded_at = '2026-08-26 03:14:00+00'
where id = 'f3200000-0000-4000-8000-000000000002';

-- Ambiguous and expired exact-provider contexts fail closed.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3300000-0000-4000-8000-000000000003","session_id":"b3300000-0000-4000-8000-000000000003"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_follow_up_authorize();
    raise exception 'Ambiguous provider context was authorized';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end;
$$;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3400000-0000-4000-8000-000000000004","session_id":"b3400000-0000-4000-8000-000000000004"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_follow_up_authorize();
    raise exception 'Expired provider session was authorized';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
end;
$$;

-- Provider A cannot mutate Provider B's accepted referral, and a caller-
-- supplied payload hash must equal the database-built canonical hash.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3100000-0000-4000-8000-000000000001","session_id":"b3100000-0000-4000-8000-000000000001"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_follow_up_record(
      'e3300000-0000-4000-8000-000000000003', 4,
      'CONTACT_CONFIRMED', repeat('1', 64),
      pg_catalog.current_setting('careslink.follow_up.foreign_hash'),
      repeat('2', 64)
    );
    raise exception 'Follow-up recorded a foreign accepted referral';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;

  begin
    perform public.portal_referral_follow_up_record(
      'e3100000-0000-4000-8000-000000000001', 4,
      'CONTACT_CONFIRMED', repeat('3', 64), repeat('0', 64), repeat('4', 64)
    );
    raise exception 'Follow-up accepted a forged payload hash';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;
end;
$$;

do $$
declare
  v_first jsonb;
  v_replay jsonb;
begin
  v_first := public.portal_referral_follow_up_record(
    'e3100000-0000-4000-8000-000000000001', 4,
    'CONTACT_CONFIRMED', repeat('3', 64),
    pg_catalog.current_setting('careslink.follow_up.accepted_hash'),
    repeat('4', 64)
  );

  if v_first->>'referral_id' is distinct from
      'e3100000-0000-4000-8000-000000000001'
    or v_first->>'match_id' is not null
    or v_first->>'current_status' is distinct from 'IN_PROGRESS'
    or (v_first->>'row_version')::bigint is distinct from 5
    or v_first->>'updated_at' is null
    or v_first - array[
      'referral_id', 'match_id', 'current_status', 'row_version', 'updated_at'
    ]::text[] is distinct from '{}'::jsonb
    or not (v_first ?& array[
      'referral_id', 'match_id', 'current_status', 'row_version', 'updated_at'
    ])
  then
    raise exception 'Follow-up ACK drifted: %', v_first;
  end if;

  v_replay := public.portal_referral_follow_up_record(
    'e3100000-0000-4000-8000-000000000001', 4,
    'CONTACT_CONFIRMED', repeat('3', 64),
    pg_catalog.current_setting('careslink.follow_up.accepted_hash'),
    repeat('4', 64)
  );
  if v_replay is distinct from v_first then
    raise exception 'Follow-up replay drifted';
  end if;

  begin
    perform public.portal_referral_follow_up_record(
      'e3100000-0000-4000-8000-000000000001', 4,
      'NO_RESPONSE', repeat('3', 64),
      pg_catalog.current_setting('careslink.follow_up.changed_hash'),
      repeat('4', 64)
    );
    raise exception 'Follow-up changed-payload replay succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
end;
$$;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
do $$
declare
  v_referral public.portal_referrals%rowtype;
  v_followup public.portal_referral_followups%rowtype;
  v_audit public.portal_audit_events%rowtype;
  v_receipt public.portal_mutation_receipts%rowtype;
begin
  select referral.* into v_referral
  from public.portal_referrals as referral
  where referral.id = 'e3100000-0000-4000-8000-000000000001';

  select followup.* into v_followup
  from public.portal_referral_followups as followup
  where followup.referral_id = v_referral.id;

  select audit.* into v_audit
  from public.portal_audit_events as audit
  where audit.actor_user_id = 'a3100000-0000-4000-8000-000000000001'
    and audit.mutation_id_hash = repeat('3', 64)
    and audit.mutation_kind = 'RECORD_FOLLOW_UP';

  select receipt.* into v_receipt
  from public.portal_mutation_receipts as receipt
  where receipt.actor_user_id = 'a3100000-0000-4000-8000-000000000001'
    and receipt.mutation_id_hash = repeat('3', 64);

  if v_referral.current_status is distinct from 'IN_PROGRESS'
    or v_referral.assigned_provider_id is distinct from
      'd3200000-0000-4000-8000-000000000002'::uuid
    or v_referral.row_version is distinct from 5
    or v_followup.id is null
    or v_followup.actor_user_id is distinct from
      'a3100000-0000-4000-8000-000000000001'::uuid
    or v_followup.outcome_code is distinct from 'CONTACT_CONFIRMED'
    or v_followup.next_due_at is not null
    or v_audit.id is null
    or v_audit.actor_role is distinct from 'provider_member'
    or v_audit.from_status is distinct from 'ACCEPTED'
    or v_audit.to_status is distinct from 'IN_PROGRESS'
    or v_audit.correlation_id_hash is distinct from repeat('4', 64)
    or v_audit.metadata is distinct from
      jsonb_build_object('outcomeCode', 'CONTACT_CONFIRMED')
    or v_receipt.id is null
    or v_receipt.mutation_kind is distinct from 'RECORD_FOLLOW_UP'
    or v_receipt.payload_hash is distinct from pg_catalog.current_setting(
      'careslink.follow_up.accepted_hash'
    )
    or v_receipt.response_referral_id is distinct from v_referral.id
    or v_receipt.response_match_id is not null
    or v_receipt.response_status is distinct from 'IN_PROGRESS'
    or v_receipt.response_row_version is distinct from 5
    or v_followup.created_at is distinct from v_referral.updated_at
    or v_audit.occurred_at is distinct from v_referral.updated_at
    or v_receipt.response_updated_at is distinct from v_referral.updated_at
    or (select count(*) from public.portal_referral_followups
        where referral_id = v_referral.id) <> 1
    or (select count(*) from public.portal_audit_events
        where actor_user_id = 'a3100000-0000-4000-8000-000000000001'
          and mutation_id_hash = repeat('3', 64)) <> 1
    or (select count(*) from public.portal_mutation_receipts
        where actor_user_id = 'a3100000-0000-4000-8000-000000000001'
          and mutation_id_hash = repeat('3', 64)) <> 1
  then
    raise exception 'Follow-up atomic state drifted';
  end if;

  begin
    update public.portal_referral_followups
    set outcome_code = 'NO_RESPONSE'
    where id = v_followup.id;
    raise exception 'portal_followups_append_only accepted mutation';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'APPEND_ONLY_RESOURCE' then raise; end if;
  end;

  begin
    update public.portal_audit_events
    set metadata = '{}'::jsonb
    where id = v_audit.id;
    raise exception 'portal_audit_append_only accepted mutation';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'APPEND_ONLY_RESOURCE' then raise; end if;
  end;

  begin
    update public.portal_mutation_receipts
    set response_status = 'ACCEPTED'
    where id = v_receipt.id;
    raise exception 'portal_receipts_append_only accepted mutation';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'APPEND_ONLY_RESOURCE' then raise; end if;
  end;
end;
$$;

-- A receipt remains only an ACK cache. Even with the historical provider
-- assignment and accepted match deliberately left behind, a CLOSED referral
-- must fail replay authority closed instead of returning the old ACK.
select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
update public.portal_referrals
set current_status = 'CLOSED'
where id = 'e3100000-0000-4000-8000-000000000001'
  and current_status = 'IN_PROGRESS'
  and assigned_provider_id = 'd3200000-0000-4000-8000-000000000002';
do $$
begin
  if (select current_status from public.portal_referrals
      where id = 'e3100000-0000-4000-8000-000000000001')
        is distinct from 'CLOSED'
    or (select assigned_provider_id from public.portal_referrals
        where id = 'e3100000-0000-4000-8000-000000000001')
        is distinct from 'd3200000-0000-4000-8000-000000000002'::uuid
    or (select status from public.portal_referral_matches
        where id = 'f3100000-0000-4000-8000-000000000001')
        is distinct from 'ACCEPTED'
  then
    raise exception 'Follow-up CLOSED residual-binding fixture drifted';
  end if;
end;
$$;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3100000-0000-4000-8000-000000000001","session_id":"b3100000-0000-4000-8000-000000000001"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_follow_up_record(
      'e3100000-0000-4000-8000-000000000001', 4,
      'CONTACT_CONFIRMED', repeat('3', 64),
      pg_catalog.current_setting('careslink.follow_up.accepted_hash'),
      repeat('4', 64)
    );
    raise exception 'Follow-up replayed a CLOSED residual binding';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;
end;
$$;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
update public.portal_referrals
set current_status = 'IN_PROGRESS'
where id = 'e3100000-0000-4000-8000-000000000001'
  and current_status = 'CLOSED'
  and assigned_provider_id = 'd3200000-0000-4000-8000-000000000002';
do $$
begin
  if (select current_status from public.portal_referrals
      where id = 'e3100000-0000-4000-8000-000000000001')
        is distinct from 'IN_PROGRESS'
  then
    raise exception 'Follow-up CLOSED residual-binding fixture did not restore';
  end if;
end;
$$;

-- IN_PROGRESS self-transition succeeds once. A different mutation key with
-- the same expected version is serialized by the referral row lock and stale.
set local role authenticated;
do $$
declare
  v_first jsonb;
begin
  v_first := public.portal_referral_follow_up_record(
    'e3200000-0000-4000-8000-000000000002', 8,
    'INFORMATION_REQUESTED', repeat('5', 64),
    pg_catalog.current_setting('careslink.follow_up.competing_first_hash'),
    repeat('6', 64)
  );
  if v_first->>'current_status' is distinct from 'IN_PROGRESS'
    or (v_first->>'row_version')::bigint is distinct from 9
  then
    raise exception 'Follow-up IN_PROGRESS transition drifted';
  end if;

  begin
    perform public.portal_referral_follow_up_record(
      'e3200000-0000-4000-8000-000000000002', 8,
      'SERVICE_COMMENCED', repeat('7', 64),
      pg_catalog.current_setting('careslink.follow_up.competing_second_hash'),
      repeat('8', 64)
    );
    raise exception 'Second competing Follow-up succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_STALE_REFERRAL' then
      raise exception 'Follow-up accepted a stale referral version: %', sqlerrm;
    end if;
  end;
end;
$$;

select pg_catalog.set_config(
  'role', pg_catalog.current_setting('careslink.assertion_entry_role'), false
);
do $$
begin
  if (select row_version from public.portal_referrals
      where id = 'e3200000-0000-4000-8000-000000000002') is distinct from 9
    or (select count(*) from public.portal_referral_followups
        where referral_id = 'e3200000-0000-4000-8000-000000000002') <> 1
    or (select count(*) from public.portal_audit_events
        where referral_id = 'e3200000-0000-4000-8000-000000000002'
          and mutation_kind = 'RECORD_FOLLOW_UP') <> 1
    or (select count(*) from public.portal_mutation_receipts
        where response_referral_id = 'e3200000-0000-4000-8000-000000000002'
          and mutation_kind = 'RECORD_FOLLOW_UP') <> 1
  then
    raise exception 'Follow-up competing atomic state drifted';
  end if;
end;
$$;

-- Close gates and remove every fixture before the final rollback.
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability in ('referral_workflow_v1', 'referral_follow_up_v1');

alter table public.portal_referral_followups
  disable trigger portal_followups_append_only;
alter table public.portal_audit_events
  disable trigger portal_audit_append_only;
alter table public.portal_mutation_receipts
  disable trigger portal_receipts_append_only;

delete from public.portal_referral_followups
where actor_user_id = 'a3100000-0000-4000-8000-000000000001';
delete from public.portal_audit_events
where actor_user_id in (
  'a3100000-0000-4000-8000-000000000001',
  'a3200000-0000-4000-8000-000000000002'
);
delete from public.portal_mutation_receipts
where actor_user_id in (
  'a3100000-0000-4000-8000-000000000001',
  'a3200000-0000-4000-8000-000000000002'
);
delete from public.portal_referral_matches
where id in (
  'f3100000-0000-4000-8000-000000000001',
  'f3200000-0000-4000-8000-000000000002',
  'f3300000-0000-4000-8000-000000000003'
);
delete from careslink_portal_private.portal_referral_contacts
where referral_id in (
  'e3100000-0000-4000-8000-000000000001',
  'e3200000-0000-4000-8000-000000000002',
  'e3300000-0000-4000-8000-000000000003'
);
delete from public.portal_referrals
where id in (
  'e3100000-0000-4000-8000-000000000001',
  'e3200000-0000-4000-8000-000000000002',
  'e3300000-0000-4000-8000-000000000003'
);
delete from public.portal_providers
where id in (
  'd3200000-0000-4000-8000-000000000002',
  'd3300000-0000-4000-8000-000000000003'
);
delete from public.portal_organization_memberships
where user_id in (
  'a3100000-0000-4000-8000-000000000001',
  'a3200000-0000-4000-8000-000000000002',
  'a3300000-0000-4000-8000-000000000003',
  'a3400000-0000-4000-8000-000000000004'
);
delete from public.portal_organizations
where id in (
  'c3100000-0000-4000-8000-000000000001',
  'c3200000-0000-4000-8000-000000000002',
  'c3300000-0000-4000-8000-000000000003'
);
delete from auth.sessions
where id in (
  'b3100000-0000-4000-8000-000000000001',
  'b3200000-0000-4000-8000-000000000002',
  'b3300000-0000-4000-8000-000000000003',
  'b3400000-0000-4000-8000-000000000004'
);
delete from auth.users
where id in (
  'a3100000-0000-4000-8000-000000000001',
  'a3200000-0000-4000-8000-000000000002',
  'a3300000-0000-4000-8000-000000000003',
  'a3400000-0000-4000-8000-000000000004',
  'a3500000-0000-4000-8000-000000000005',
  'a3600000-0000-4000-8000-000000000006'
);

alter table public.portal_mutation_receipts
  enable trigger portal_receipts_append_only;
alter table public.portal_audit_events
  enable trigger portal_audit_append_only;
alter table public.portal_referral_followups
  enable trigger portal_followups_append_only;

do $$
begin
  if (select enabled from public.portal_workflow_flags
      where capability = 'referral_workflow_v1') is distinct from false
    or (select enabled from public.portal_workflow_flags
        where capability = 'referral_follow_up_v1') is distinct from false
    or exists (
      select 1 from public.portal_referrals
      where id in (
        'e3100000-0000-4000-8000-000000000001',
        'e3200000-0000-4000-8000-000000000002',
        'e3300000-0000-4000-8000-000000000003'
      )
    )
    or exists (
      select 1 from public.portal_referral_followups
      where actor_user_id = 'a3100000-0000-4000-8000-000000000001'
    )
    or exists (
      select 1 from public.portal_audit_events
      where actor_user_id = 'a3100000-0000-4000-8000-000000000001'
    )
    or exists (
      select 1 from public.portal_mutation_receipts
      where actor_user_id = 'a3100000-0000-4000-8000-000000000001'
    )
    or exists (
      select 1 from auth.users
      where id in (
        'a3100000-0000-4000-8000-000000000001',
        'a3200000-0000-4000-8000-000000000002',
        'a3300000-0000-4000-8000-000000000003',
        'a3400000-0000-4000-8000-000000000004',
        'a3500000-0000-4000-8000-000000000005',
        'a3600000-0000-4000-8000-000000000006'
      )
    )
    or (select count(*)
        from pg_catalog.pg_trigger
        where tgname in (
          'portal_followups_append_only',
          'portal_audit_append_only',
          'portal_receipts_append_only'
        )
          and not tgisinternal
          and tgenabled = 'O') <> 3
  then
    raise exception 'Follow-up rollback zero-fixture posture drifted';
  end if;
end;
$$;

rollback;
