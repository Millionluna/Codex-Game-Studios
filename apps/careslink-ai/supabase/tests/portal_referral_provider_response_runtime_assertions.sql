-- Manual rollback-only assertions for the Production-unapplied Portal
-- Referral Provider Response M1b runtime. Run after the exact repository
-- migrations on a disposable database with ON_ERROR_STOP=1.
-- This suite proves single-connection SQL semantics and statically pins the
-- resource lock order. True two-connection races remain a separate gate.

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
  v_context_definition text;
  v_index_definition text;
  v_offers_definition text;
  v_respond_definition text;
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
    raise exception 'Provider Response assertion entry actor is missing';
  end if;

  if (select count(*)
      from public.portal_workflow_flags
      where capability = 'referral_provider_response_v1') <> 1
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_provider_response_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_provider_response_v1') is distinct from true
    or (select enabled
        from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from false
    or (select preview_only
        from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from true
  then
    raise exception 'Provider Response flags are not default-off Preview-only';
  end if;

  select lower(pg_catalog.pg_get_indexdef(index_relation.oid))
  into v_index_definition
  from pg_catalog.pg_class as index_relation
  where index_relation.oid = pg_catalog.to_regclass(
    'public.portal_matches_provider_response_inbox_idx'
  );

  if v_index_definition is null
    or strpos(v_index_definition, 'provider_id') = 0
    or strpos(v_index_definition, 'status = ''offered''::text')
      <= strpos(v_index_definition, 'provider_id')
    or strpos(v_index_definition, ' desc')
      <= strpos(v_index_definition, 'status = ''offered''::text')
    or strpos(v_index_definition, ', id)')
      <= strpos(v_index_definition, ' desc')
    or v_index_definition not like '%include (referral_id, status)%'
    or v_index_definition not like
      '%where (status = any (array[''offered''::text, ''accepted''::text]))%'
  then
    raise exception 'Provider Response inbox index posture drifted';
  end if;

  foreach v_signature in array array[
    'careslink_portal_private.portal_referral_provider_response_assert_enabled()',
    'careslink_portal_private.portal_referral_provider_response_assert_session(uuid,uuid)',
    'careslink_portal_private.portal_referral_provider_response_context()',
    'public.portal_referral_provider_response_authorize()',
    'public.portal_referral_provider_response_offers(integer,uuid)',
    'public.portal_referral_provider_response_respond(uuid,bigint,text,text,text,text)'
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
      'careslink_portal_private.portal_referral_provider_response_assert_enabled()'
    )
  ) into v_gate_definition;

  if strpos(v_gate_definition, 'referral_workflow_v1') = 0
    or strpos(v_gate_definition, 'referral_provider_response_v1')
      <= strpos(v_gate_definition, 'referral_workflow_v1')
    or lower(v_gate_definition) not like '%for share of flag%'
    or lower(v_gate_definition) like '%for key share%'
  then
    raise exception 'Provider Response gate lock order drifted';
  end if;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'careslink_portal_private.portal_referral_provider_response_context()'
    )
  ) into v_context_definition;

  if strpos(
      lower(v_context_definition),
      'lock table public.portal_organizations in share mode'
    ) = 0
    or strpos(
      lower(v_context_definition),
      'lock table public.portal_organization_memberships in share mode'
    ) <= strpos(
      lower(v_context_definition),
      'lock table public.portal_organizations in share mode'
    )
    or strpos(
      lower(v_context_definition),
      'lock table public.portal_providers in share mode'
    ) <= strpos(
      lower(v_context_definition),
      'lock table public.portal_organization_memberships in share mode'
    )
    or v_context_definition not like '%membership.role = ''provider_member''%'
    or v_context_definition not like '%provider.review_status = ''APPROVED''%'
    or v_context_definition not like '%v_context_count <> 1%'
    or v_context_definition like '%capacity_status%'
  then
    raise exception 'Provider Response exact-one provider context drifted';
  end if;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.portal_referral_provider_response_offers(integer,uuid)'
    )
  ) into v_offers_definition;

  if v_offers_definition not like '%p_limit > 50%'
    or v_offers_definition not like '%match.provider_id = v_provider_id%'
    or v_offers_definition not like
      '%match.status in (''OFFERED'', ''ACCEPTED'')%'
    or v_offers_definition not like
      '%match.status = ''ACCEPTED''%match.offered_at is not null%'
    or v_offers_definition not like
      '%referral.assigned_provider_id is not distinct from v_provider_id%'
    or lower(v_offers_definition) not like
      '%if p_after_match_id is not null then%portal_validation_error%'
    or lower(v_offers_definition) like '%match.id > p_after_match_id%'
    or lower(v_offers_definition) not like
      '%order by (match.status = ''offered'') desc,%match.id%'
    or lower(v_offers_definition) not like '%order by item.match_id%'
    or v_offers_definition like '%referral.summary%'
    or v_offers_definition like '%contact_%'
    or v_offers_definition like '%source_organization_id%'
  then
    raise exception 'Provider Response bounded no-PII inbox drifted';
  end if;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.portal_referral_provider_response_respond(uuid,bigint,text,text,text,text)'
    )
  ) into v_respond_definition;

  if v_respond_definition not like '%pg_advisory_xact_lock%'
    or v_respond_definition not like '%''kind'', ''RESPOND_TO_OFFER''%'
    or v_respond_definition not like '%''providerId'', v_provider_id::text%'
    or v_respond_definition not like '%public.v1_shadow_content_sha256%'
    or v_respond_definition not like '%p_payload_hash is distinct from v_payload_hash%'
    or v_respond_definition not like '%order by match.id%'
    or strpos(lower(v_respond_definition), 'for update of referral') = 0
    or strpos(lower(v_respond_definition), 'order by match.id')
      <= strpos(lower(v_respond_definition), 'for update of referral')
    or strpos(lower(v_respond_definition), 'for update of match')
      <= strpos(lower(v_respond_definition), 'order by match.id')
    or v_respond_definition not like
      '%when p_decision = ''ACCEPT'' then ''ACCEPTED''%'
    or v_respond_definition not like
      '%when p_decision = ''ACCEPT'' then v_provider_id%'
    or v_respond_definition not like '%''RESPOND_TO_OFFER''%'
    or v_respond_definition not like
      '%jsonb_build_object(%''matchId'', v_match.id::text,%''decision'', p_decision%'
  then
    raise exception 'Provider Response mutation/lock/hash posture drifted';
  end if;

  foreach v_signature in array array[
    'public.portal_referral_provider_response_authorize()',
    'public.portal_referral_provider_response_offers(integer,uuid)',
    'public.portal_referral_provider_response_respond(uuid,bigint,text,text,text,text)'
  ] loop
    select exists (
      select 1
      from pg_catalog.pg_proc as routine
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
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
      or pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE')
    then
      raise exception '% public RPC ACL drifted', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'careslink_portal_private.portal_referral_provider_response_assert_enabled()',
    'careslink_portal_private.portal_referral_provider_response_assert_session(uuid,uuid)',
    'careslink_portal_private.portal_referral_provider_response_context()'
  ] loop
    select exists (
      select 1
      from pg_catalog.pg_proc as routine
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
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
    'public.portal_referral_matches',
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
  ('a2100000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'response-provider-a@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2200000-0000-4000-8000-000000000002',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'response-provider-b@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2300000-0000-4000-8000-000000000003',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'response-ambiguous@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2400000-0000-4000-8000-000000000004',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'response-expired@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2500000-0000-4000-8000-000000000005',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'response-source@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2600000-0000-4000-8000-000000000006',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'response-offerer@example.invalid',
   'test-only-no-login', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  ('b2100000-0000-4000-8000-000000000001',
   'a2100000-0000-4000-8000-000000000001', now(), now(), null),
  ('b2200000-0000-4000-8000-000000000002',
   'a2200000-0000-4000-8000-000000000002', now(), now(), null),
  ('b2300000-0000-4000-8000-000000000003',
   'a2300000-0000-4000-8000-000000000003', now(), now(), null),
  ('b2400000-0000-4000-8000-000000000004',
   'a2400000-0000-4000-8000-000000000004', now(), now(),
   pg_catalog.clock_timestamp() - interval '1 second');

insert into public.portal_organizations (
  id, organization_type, display_name, status
) values
  ('c2100000-0000-4000-8000-000000000001',
   'REFERRAL_SOURCE', 'Response Source', 'ACTIVE'),
  ('c2200000-0000-4000-8000-000000000002',
   'PROVIDER', 'Response Provider A', 'ACTIVE'),
  ('c2300000-0000-4000-8000-000000000003',
   'PROVIDER', 'Response Provider B', 'ACTIVE');

insert into public.portal_organization_memberships (
  organization_id, user_id, role, status
) values
  ('c2200000-0000-4000-8000-000000000002',
   'a2100000-0000-4000-8000-000000000001',
   'provider_member', 'ACTIVE'),
  ('c2300000-0000-4000-8000-000000000003',
   'a2200000-0000-4000-8000-000000000002',
   'provider_member', 'ACTIVE'),
  ('c2200000-0000-4000-8000-000000000002',
   'a2300000-0000-4000-8000-000000000003',
   'provider_member', 'ACTIVE'),
  ('c2300000-0000-4000-8000-000000000003',
   'a2300000-0000-4000-8000-000000000003',
   'provider_member', 'ACTIVE'),
  ('c2200000-0000-4000-8000-000000000002',
   'a2400000-0000-4000-8000-000000000004',
   'provider_member', 'ACTIVE');

-- Provider A already owns offers, so a later capacity drop must not revoke its
-- response authority. Capacity is an offer-time eligibility input only; M1b
-- revalidates approved provider identity/tenant but deliberately not capacity.
insert into public.portal_providers (
  id, organization_id, review_status, service_types, regions, capacity_status
) values
  ('d2200000-0000-4000-8000-000000000002',
   'c2200000-0000-4000-8000-000000000002', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'UNAVAILABLE'),
  ('d2300000-0000-4000-8000-000000000003',
   'c2300000-0000-4000-8000-000000000003', 'APPROVED',
   array['SUPPORT_COORDINATION'], array['VIC_MELBOURNE'], 'LIMITED');

insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region, service_type,
  current_status, assigned_provider_id, row_version, created_at, updated_at
) values
  ('e2100000-0000-4000-8000-000000000001',
   'c2100000-0000-4000-8000-000000000001',
   'a2500000-0000-4000-8000-000000000005',
   'Response fixture A metadata only',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'OFFERED', null, 3,
   '2026-08-26 01:00:00+00', '2026-08-26 01:03:00+00'),
  ('e2200000-0000-4000-8000-000000000002',
   'c2100000-0000-4000-8000-000000000001',
   'a2500000-0000-4000-8000-000000000005',
   'Response fixture decline metadata only',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'OFFERED', null, 3,
   '2026-08-26 01:10:00+00', '2026-08-26 01:13:00+00'),
  ('e2300000-0000-4000-8000-000000000003',
   'c2100000-0000-4000-8000-000000000001',
   'a2500000-0000-4000-8000-000000000005',
   'Response fixture B metadata only',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'OFFERED', null, 3,
   '2026-08-26 01:20:00+00', '2026-08-26 01:23:00+00'),
  ('e2400000-0000-4000-8000-000000000004',
   'c2100000-0000-4000-8000-000000000001',
   'a2500000-0000-4000-8000-000000000005',
   'Response fixture closed metadata only',
   'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'CLOSED',
   'd2200000-0000-4000-8000-000000000002', 8,
   '2026-08-26 01:30:00+00', '2026-08-26 01:38:00+00');

insert into public.portal_referral_matches (
  id, referral_id, provider_id, score, status, offered_by, offered_at,
  responded_by, responded_at, row_version, created_at, updated_at
) values
  ('f2100000-0000-4000-8000-000000000001',
   'e2100000-0000-4000-8000-000000000001',
   'd2200000-0000-4000-8000-000000000002',
   null, 'OFFERED', 'a2600000-0000-4000-8000-000000000006',
   '2026-08-26 01:03:00+00', null, null, 1,
   '2026-08-26 01:03:00+00', '2026-08-26 01:03:00+00'),
  ('f2200000-0000-4000-8000-000000000002',
   'e2200000-0000-4000-8000-000000000002',
   'd2200000-0000-4000-8000-000000000002',
   null, 'OFFERED', 'a2600000-0000-4000-8000-000000000006',
   '2026-08-26 01:13:00+00', null, null, 1,
   '2026-08-26 01:13:00+00', '2026-08-26 01:13:00+00'),
  ('f2300000-0000-4000-8000-000000000003',
   'e2300000-0000-4000-8000-000000000003',
   'd2300000-0000-4000-8000-000000000003',
   null, 'OFFERED', 'a2600000-0000-4000-8000-000000000006',
   '2026-08-26 01:23:00+00', null, null, 1,
   '2026-08-26 01:23:00+00', '2026-08-26 01:23:00+00'),
  ('f2400000-0000-4000-8000-000000000004',
   'e2400000-0000-4000-8000-000000000004',
   'd2200000-0000-4000-8000-000000000002',
   null, 'ACCEPTED', 'a2600000-0000-4000-8000-000000000006',
   '2026-08-26 01:33:00+00',
   'a2100000-0000-4000-8000-000000000001',
   '2026-08-26 01:34:00+00', 2,
   '2026-08-26 01:33:00+00', '2026-08-26 01:34:00+00');

-- Operation=true while master=false must fail before authorization.
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_provider_response_v1';

-- Compute database-canonical request hashes as the assertion entry role. The
-- authenticated caller can execute only the three Provider Response RPCs and
-- must not receive direct access to the private canonical hash helpers.
select pg_catalog.set_config(
  'careslink.provider_response.provider_b_foreign_accept_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c2300000-0000-4000-8000-000000000003',
      'role', 'provider_member',
      'providerId', 'd2300000-0000-4000-8000-000000000003'
    ),
    'kind', 'RESPOND_TO_OFFER',
    'command', jsonb_build_object(
      'matchId', 'f2100000-0000-4000-8000-000000000001',
      'expectedVersion', 3,
      'decision', 'ACCEPT'
    )
  )),
  true
);
select pg_catalog.set_config(
  'careslink.provider_response.provider_b_stale_accept_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c2300000-0000-4000-8000-000000000003',
      'role', 'provider_member',
      'providerId', 'd2300000-0000-4000-8000-000000000003'
    ),
    'kind', 'RESPOND_TO_OFFER',
    'command', jsonb_build_object(
      'matchId', 'f2300000-0000-4000-8000-000000000003',
      'expectedVersion', 2,
      'decision', 'ACCEPT'
    )
  )),
  true
);
select pg_catalog.set_config(
  'careslink.provider_response.provider_a_accept_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c2200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd2200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RESPOND_TO_OFFER',
    'command', jsonb_build_object(
      'matchId', 'f2100000-0000-4000-8000-000000000001',
      'expectedVersion', 3,
      'decision', 'ACCEPT'
    )
  )),
  true
);
select pg_catalog.set_config(
  'careslink.provider_response.provider_a_changed_decline_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c2200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd2200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RESPOND_TO_OFFER',
    'command', jsonb_build_object(
      'matchId', 'f2100000-0000-4000-8000-000000000001',
      'expectedVersion', 3,
      'decision', 'DECLINE'
    )
  )),
  true
);
select pg_catalog.set_config(
  'careslink.provider_response.provider_a_decline_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c2200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd2200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RESPOND_TO_OFFER',
    'command', jsonb_build_object(
      'matchId', 'f2200000-0000-4000-8000-000000000002',
      'expectedVersion', 3,
      'decision', 'DECLINE'
    )
  )),
  true
);
select pg_catalog.set_config(
  'careslink.provider_response.provider_a_competing_accept_hash',
  public.v1_shadow_content_sha256(jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', 'c2200000-0000-4000-8000-000000000002',
      'role', 'provider_member',
      'providerId', 'd2200000-0000-4000-8000-000000000002'
    ),
    'kind', 'RESPOND_TO_OFFER',
    'command', jsonb_build_object(
      'matchId', 'f2200000-0000-4000-8000-000000000002',
      'expectedVersion', 3,
      'decision', 'ACCEPT'
    )
  )),
  true
);

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2100000-0000-4000-8000-000000000001","session_id":"b2100000-0000-4000-8000-000000000001"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_provider_response_authorize();
    raise exception 'Provider Response opened while master was disabled';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
end;
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Master=true while operation=false must fail independently.
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_provider_response_v1';
update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_workflow_v1';

set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_provider_response_authorize();
    raise exception 'Provider Response opened while operation was disabled';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_CAPABILITY_DISABLED' then raise; end if;
  end;
end;
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

update public.portal_workflow_flags
set enabled = true, updated_at = now()
where capability = 'referral_provider_response_v1';

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2100000-0000-4000-8000-000000000001","session_id":"b2100000-0000-4000-8000-000000000001"}',
  true
);

do $$
declare
  v_authorization jsonb;
  v_inbox jsonb;
begin
  v_authorization := public.portal_referral_provider_response_authorize();
  if v_authorization is distinct from jsonb_build_object(
    'authorized', true,
    'user_id', 'a2100000-0000-4000-8000-000000000001'::uuid,
    'organization_id', 'c2200000-0000-4000-8000-000000000002'::uuid,
    'organization_type', 'PROVIDER',
    'organization_status', 'ACTIVE',
    'membership_role', 'provider_member',
    'membership_status', 'ACTIVE',
    'provider_id', 'd2200000-0000-4000-8000-000000000002'::uuid,
    'provider_review_status', 'APPROVED'
  ) then
    raise exception 'Provider Response authorization envelope drifted: %',
      v_authorization;
  end if;

  v_inbox := public.portal_referral_provider_response_offers(50, null);
  if jsonb_array_length(v_inbox->'items') is distinct from 3
    or v_inbox->'items'->0->>'match_id' is distinct from
      'f2100000-0000-4000-8000-000000000001'
    or v_inbox->'items'->1->>'match_id' is distinct from
      'f2200000-0000-4000-8000-000000000002'
    or v_inbox->'items'->2->>'match_id' is distinct from
      'f2400000-0000-4000-8000-000000000004'
    or v_inbox->'items'->2->>'match_status' is distinct from 'ACCEPTED'
    or v_inbox->'items'->2->>'current_status' is distinct from 'CLOSED'
    or exists (
      select 1
      from jsonb_array_elements(v_inbox->'items') as item(value)
      where value - array[
        'match_id', 'referral_id', 'region', 'service_type',
        'match_status', 'current_status', 'row_version'
      ]::text[] is distinct from '{}'::jsonb
        or not (value ?& array[
          'match_id', 'referral_id', 'region', 'service_type',
          'match_status', 'current_status', 'row_version'
        ])
    )
    or lower(v_inbox::text) ~
      '(summary|contact|phone|email|source_organization)'
  then
    raise exception 'Provider Response no-PII inbox drifted: %', v_inbox;
  end if;

  begin
    perform public.portal_referral_provider_response_offers(
      1,
      'f2100000-0000-4000-8000-000000000001'
    );
    raise exception 'Provider Response inbox accepted a non-NULL cursor';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform public.portal_referral_provider_response_offers(51, null);
    raise exception 'Provider Response inbox accepted limit 51';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;

  begin
    perform 1 from public.portal_referral_matches;
    raise exception 'Provider Response authenticated direct table read succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- A full first page of accepted history must not crowd a live offer out of the
-- bounded inbox. The selected page prioritizes OFFERED rows, while the returned
-- DTO remains globally ordered by match id for the existing parser.
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region, service_type,
  current_status, assigned_provider_id, row_version, created_at, updated_at
)
select
  ('e3000000-0000-4000-8000-' ||
    lpad(sequence.value::text, 12, '0'))::uuid,
  'c2100000-0000-4000-8000-000000000001'::uuid,
  'a2500000-0000-4000-8000-000000000005'::uuid,
  'Provider Response accepted history fixture ' || sequence.value,
  'VIC_MELBOURNE',
  'SUPPORT_COORDINATION',
  'CLOSED',
  'd2200000-0000-4000-8000-000000000002'::uuid,
  8,
  '2026-08-26 02:00:00+00'::timestamptz +
    sequence.value * interval '1 second',
  '2026-08-26 02:00:00+00'::timestamptz +
    sequence.value * interval '1 second'
from generate_series(1, 50) as sequence(value);
insert into public.portal_referral_matches (
  id, referral_id, provider_id, score, status, offered_by, offered_at,
  responded_by, responded_at, row_version, created_at, updated_at
)
select
  ('f3000000-0000-4000-8000-' ||
    lpad(sequence.value::text, 12, '0'))::uuid,
  ('e3000000-0000-4000-8000-' ||
    lpad(sequence.value::text, 12, '0'))::uuid,
  'd2200000-0000-4000-8000-000000000002'::uuid,
  null,
  'ACCEPTED',
  'a2600000-0000-4000-8000-000000000006'::uuid,
  '2026-08-26 02:00:00+00'::timestamptz +
    sequence.value * interval '1 second',
  'a2100000-0000-4000-8000-000000000001'::uuid,
  '2026-08-26 02:00:00+00'::timestamptz +
    sequence.value * interval '1 second',
  2,
  '2026-08-26 02:00:00+00'::timestamptz +
    sequence.value * interval '1 second',
  '2026-08-26 02:00:00+00'::timestamptz +
    sequence.value * interval '1 second'
from generate_series(1, 50) as sequence(value);
insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region, service_type,
  current_status, assigned_provider_id, row_version, created_at, updated_at
) values (
  'e9000000-0000-4000-8000-000000000001',
  'c2100000-0000-4000-8000-000000000001',
  'a2500000-0000-4000-8000-000000000005',
  'Provider Response active offer priority fixture',
  'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'OFFERED', null, 3,
  '2026-08-26 02:02:00+00', '2026-08-26 02:02:00+00'
);
insert into public.portal_referral_matches (
  id, referral_id, provider_id, score, status, offered_by, offered_at,
  responded_by, responded_at, row_version, created_at, updated_at
) values (
  'ff000000-0000-4000-8000-000000000001',
  'e9000000-0000-4000-8000-000000000001',
  'd2200000-0000-4000-8000-000000000002',
  null, 'OFFERED', 'a2600000-0000-4000-8000-000000000006',
  '2026-08-26 02:02:00+00', null, null, 1,
  '2026-08-26 02:02:00+00', '2026-08-26 02:02:00+00'
);

set local role authenticated;
do $$
declare
  v_inbox jsonb;
begin
  v_inbox := public.portal_referral_provider_response_offers(50, null);
  if jsonb_array_length(v_inbox->'items') is distinct from 50
    or not exists (
      select 1
      from jsonb_array_elements(v_inbox->'items') as item(value)
      where value->>'match_id' =
          'ff000000-0000-4000-8000-000000000001'
        and value->>'match_status' = 'OFFERED'
    )
    or (
      select count(*)
      from jsonb_array_elements(v_inbox->'items') as item(value)
      where value->>'match_status' = 'OFFERED'
    ) <> 3
    or (
      select count(*)
      from jsonb_array_elements(v_inbox->'items') as item(value)
      where value->>'match_status' = 'ACCEPTED'
    ) <> 47
    or exists (
      select 1
      from (
        select
          (item.value->>'match_id')::uuid as match_id,
          lag((item.value->>'match_id')::uuid) over (
            order by item.ordinality
          ) as previous_match_id
        from jsonb_array_elements(v_inbox->'items') with ordinality
          as item(value, ordinality)
      ) as ordered
      where ordered.previous_match_id is not null
        and ordered.match_id <= ordered.previous_match_id
    )
  then
    raise exception
      'Provider Response active offer priority drifted: %', v_inbox;
  end if;
end;
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
delete from public.portal_referral_matches
where id = 'ff000000-0000-4000-8000-000000000001'
  or id in (
    select ('f3000000-0000-4000-8000-' ||
      lpad(sequence.value::text, 12, '0'))::uuid
    from generate_series(1, 50) as sequence(value)
  );
delete from public.portal_referrals
where id = 'e9000000-0000-4000-8000-000000000001'
  or id in (
    select ('e3000000-0000-4000-8000-' ||
      lpad(sequence.value::text, 12, '0'))::uuid
    from generate_series(1, 50) as sequence(value)
  );

-- A structurally corrupt accepted match must fail closed, not disappear through
-- SQL three-valued logic when the referral assignment is unexpectedly NULL.
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region, service_type,
  current_status, assigned_provider_id, row_version, created_at, updated_at
) values (
  'e2500000-0000-4000-8000-000000000005',
  'c2100000-0000-4000-8000-000000000001',
  'a2500000-0000-4000-8000-000000000005',
  'Response corrupt accepted fixture metadata only',
  'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'ACCEPTED', null, 4,
  '2026-08-26 01:40:00+00', '2026-08-26 01:44:00+00'
);
insert into public.portal_referral_matches (
  id, referral_id, provider_id, score, status, offered_by, offered_at,
  responded_by, responded_at, row_version, created_at, updated_at
) values (
  'f2500000-0000-4000-8000-000000000005',
  'e2500000-0000-4000-8000-000000000005',
  'd2200000-0000-4000-8000-000000000002',
  null, 'ACCEPTED', 'a2600000-0000-4000-8000-000000000006',
  '2026-08-26 01:43:00+00',
  'a2100000-0000-4000-8000-000000000001',
  '2026-08-26 01:44:00+00', 2,
  '2026-08-26 01:43:00+00', '2026-08-26 01:44:00+00'
);
set local role authenticated;
do $$
begin
  begin
    perform public.portal_referral_provider_response_offers(50, null);
    raise exception 'Provider Response silently hid corrupt accepted assignment';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_INVALID_STATE_TRANSITION' then raise; end if;
  end;
end;
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
delete from public.portal_referral_matches
where id = 'f2500000-0000-4000-8000-000000000005';
delete from public.portal_referrals
where id = 'e2500000-0000-4000-8000-000000000005';
set local role authenticated;

-- Provider B cannot enumerate or respond to Provider A's match.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2200000-0000-4000-8000-000000000002","session_id":"b2200000-0000-4000-8000-000000000002"}',
  true
);
do $$
declare
  v_inbox jsonb;
  v_payload_hash text;
  v_stale_payload_hash text;
begin
  v_inbox := public.portal_referral_provider_response_offers(50, null);
  if jsonb_array_length(v_inbox->'items') is distinct from 1
    or v_inbox->'items'->0->>'match_id' is distinct from
      'f2300000-0000-4000-8000-000000000003'
  then
    raise exception 'Provider Response Provider B tenant isolation drifted: %',
      v_inbox;
  end if;

  v_payload_hash := pg_catalog.current_setting(
    'careslink.provider_response.provider_b_foreign_accept_hash'
  );

  begin
    perform public.portal_referral_provider_response_respond(
      'f2100000-0000-4000-8000-000000000001',
      3,
      'ACCEPT',
      repeat('1', 64),
      v_payload_hash,
      repeat('2', 64)
    );
    raise exception 'Provider B responded to Provider A offer';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_NOT_FOUND' then raise; end if;
  end;

  v_stale_payload_hash := pg_catalog.current_setting(
    'careslink.provider_response.provider_b_stale_accept_hash'
  );

  begin
    perform public.portal_referral_provider_response_respond(
      'f2300000-0000-4000-8000-000000000003',
      2,
      'ACCEPT',
      repeat('9', 64),
      v_stale_payload_hash,
      repeat('a', 64)
    );
    raise exception 'Provider Response accepted a stale referral version';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_STALE_REFERRAL' then raise; end if;
  end;
end;
$$;

-- Ambiguous and expired provider contexts fail closed.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2300000-0000-4000-8000-000000000003","session_id":"b2300000-0000-4000-8000-000000000003"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_provider_response_authorize();
    raise exception 'Ambiguous provider context was authorized';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_FORBIDDEN' then raise; end if;
  end;
end;
$$;

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2400000-0000-4000-8000-000000000004","session_id":"b2400000-0000-4000-8000-000000000004"}',
  true
);
do $$
begin
  begin
    perform public.portal_referral_provider_response_authorize();
    raise exception 'Expired provider session was authorized';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_SESSION_REVOKED' then raise; end if;
  end;
end;
$$;

-- Provider A ACCEPT: payload hash, replay and hash-only side effects.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2100000-0000-4000-8000-000000000001","session_id":"b2100000-0000-4000-8000-000000000001"}',
  true
);
do $$
declare
  v_payload_hash text;
  v_first jsonb;
  v_replay jsonb;
  v_changed_payload_hash text;
begin
  v_payload_hash := pg_catalog.current_setting(
    'careslink.provider_response.provider_a_accept_hash'
  );

  begin
    perform public.portal_referral_provider_response_respond(
      'f2100000-0000-4000-8000-000000000001',
      3,
      'ACCEPT',
      repeat('3', 64),
      repeat('0', 64),
      repeat('4', 64)
    );
    raise exception 'Provider Response accepted a forged payload hash';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_VALIDATION_ERROR' then raise; end if;
  end;

  v_first := public.portal_referral_provider_response_respond(
    'f2100000-0000-4000-8000-000000000001',
    3,
    'ACCEPT',
    repeat('3', 64),
    v_payload_hash,
    repeat('4', 64)
  );

  if v_first->>'referral_id' is distinct from
      'e2100000-0000-4000-8000-000000000001'
    or v_first->>'match_id' is distinct from
      'f2100000-0000-4000-8000-000000000001'
    or v_first->>'current_status' is distinct from 'ACCEPTED'
    or (v_first->>'row_version')::bigint is distinct from 4
    or v_first->>'updated_at' is null
    or v_first - array[
      'referral_id', 'match_id', 'current_status', 'row_version', 'updated_at'
    ]::text[] is distinct from '{}'::jsonb
    or not (v_first ?& array[
      'referral_id', 'match_id', 'current_status', 'row_version', 'updated_at'
    ])
  then
    raise exception 'Provider Response ACCEPT ACK drifted: %', v_first;
  end if;

  v_replay := public.portal_referral_provider_response_respond(
    'f2100000-0000-4000-8000-000000000001',
    3,
    'ACCEPT',
    repeat('3', 64),
    v_payload_hash,
    repeat('4', 64)
  );
  if v_replay is distinct from v_first then
    raise exception 'Provider Response ACCEPT replay drifted';
  end if;

  v_changed_payload_hash := pg_catalog.current_setting(
    'careslink.provider_response.provider_a_changed_decline_hash'
  );

  begin
    perform public.portal_referral_provider_response_respond(
      'f2100000-0000-4000-8000-000000000001',
      3,
      'DECLINE',
      repeat('3', 64),
      v_changed_payload_hash,
      repeat('4', 64)
    );
    raise exception 'Provider Response changed-payload replay succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

end;
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

do $$
declare
  v_match public.portal_referral_matches%rowtype;
  v_referral public.portal_referrals%rowtype;
  v_audit public.portal_audit_events%rowtype;
  v_receipt public.portal_mutation_receipts%rowtype;
begin
  select match.* into v_match
  from public.portal_referral_matches as match
  where match.id = 'f2100000-0000-4000-8000-000000000001';

  select referral.* into v_referral
  from public.portal_referrals as referral
  where referral.id = 'e2100000-0000-4000-8000-000000000001';

  select audit.* into v_audit
  from public.portal_audit_events as audit
  where audit.actor_user_id = 'a2100000-0000-4000-8000-000000000001'
    and audit.mutation_id_hash = repeat('3', 64)
    and audit.mutation_kind = 'RESPOND_TO_OFFER';

  select receipt.* into v_receipt
  from public.portal_mutation_receipts as receipt
  where receipt.actor_user_id = 'a2100000-0000-4000-8000-000000000001'
    and receipt.mutation_id_hash = repeat('3', 64);

  if v_match.id is distinct from
      'f2100000-0000-4000-8000-000000000001'::uuid
    or v_match.status is distinct from 'ACCEPTED'
    or v_match.responded_by is distinct from
      'a2100000-0000-4000-8000-000000000001'::uuid
    or v_match.responded_at is null
    or v_match.row_version is distinct from 2
    or v_referral.id is distinct from
      'e2100000-0000-4000-8000-000000000001'::uuid
    or v_referral.current_status is distinct from 'ACCEPTED'
    or v_referral.assigned_provider_id is distinct from
      'd2200000-0000-4000-8000-000000000002'::uuid
    or v_referral.row_version is distinct from 4
    or v_audit.id is null
    or v_audit.from_status is distinct from 'OFFERED'
    or v_audit.to_status is distinct from 'ACCEPTED'
    or v_audit.correlation_id_hash is distinct from repeat('4', 64)
    or v_audit.metadata is distinct from jsonb_build_object(
      'matchId', 'f2100000-0000-4000-8000-000000000001',
      'decision', 'ACCEPT'
    )
    or v_audit.occurred_at is null
    or v_receipt.id is null
    or v_receipt.mutation_kind is distinct from 'RESPOND_TO_OFFER'
    or v_receipt.payload_hash is distinct from pg_catalog.current_setting(
      'careslink.provider_response.provider_a_accept_hash'
    )
    or v_receipt.response_referral_id is distinct from v_referral.id
    or v_receipt.response_match_id is distinct from v_match.id
    or v_receipt.response_status is distinct from 'ACCEPTED'
    or v_receipt.response_row_version is distinct from 4
    or v_receipt.response_updated_at is null
    or v_match.responded_at is distinct from v_referral.updated_at
    or v_audit.occurred_at is distinct from v_referral.updated_at
    or v_receipt.response_updated_at is distinct from v_referral.updated_at
  then
    raise exception 'Provider Response ACCEPT atomic state drifted';
  end if;
end;
$$;

-- Provider A DECLINE returns the referral to TRIAGED and removes the inbox row.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2100000-0000-4000-8000-000000000001","session_id":"b2100000-0000-4000-8000-000000000001"}',
  true
);
do $$
declare
  v_payload_hash text;
  v_declined jsonb;
begin
  v_payload_hash := pg_catalog.current_setting(
    'careslink.provider_response.provider_a_decline_hash'
  );

  v_declined := public.portal_referral_provider_response_respond(
    'f2200000-0000-4000-8000-000000000002',
    3,
    'DECLINE',
    repeat('5', 64),
    v_payload_hash,
    repeat('6', 64)
  );

  if v_declined->>'referral_id' is distinct from
      'e2200000-0000-4000-8000-000000000002'
    or v_declined->>'match_id' is distinct from
      'f2200000-0000-4000-8000-000000000002'
    or v_declined->>'current_status' is distinct from 'TRIAGED'
    or (v_declined->>'row_version')::bigint is distinct from 4
    or v_declined->>'updated_at' is null
    or v_declined - array[
      'referral_id', 'match_id', 'current_status', 'row_version', 'updated_at'
    ]::text[] is distinct from '{}'::jsonb
    or not (v_declined ?& array[
      'referral_id', 'match_id', 'current_status', 'row_version', 'updated_at'
    ])
    or jsonb_array_length(
      public.portal_referral_provider_response_offers(50, null)->'items'
    ) is distinct from 2
  then
    raise exception 'Provider Response DECLINE atomic state drifted';
  end if;

  begin
    perform public.portal_referral_provider_response_respond(
      'f2200000-0000-4000-8000-000000000002',
      3,
      'ACCEPT',
      repeat('7', 64),
      pg_catalog.current_setting(
        'careslink.provider_response.provider_a_competing_accept_hash'
      ),
      repeat('8', 64)
    );
    raise exception 'Second competing Provider Response succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PORTAL_INVALID_STATE_TRANSITION' then raise; end if;
  end;
end;
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

do $$
declare
  v_match public.portal_referral_matches%rowtype;
  v_referral public.portal_referrals%rowtype;
  v_audit public.portal_audit_events%rowtype;
  v_receipt public.portal_mutation_receipts%rowtype;
begin
  select match.* into v_match
  from public.portal_referral_matches as match
  where match.id = 'f2200000-0000-4000-8000-000000000002';

  select referral.* into v_referral
  from public.portal_referrals as referral
  where referral.id = 'e2200000-0000-4000-8000-000000000002';

  select audit.* into v_audit
  from public.portal_audit_events as audit
  where audit.actor_user_id = 'a2100000-0000-4000-8000-000000000001'
    and audit.mutation_id_hash = repeat('5', 64)
    and audit.mutation_kind = 'RESPOND_TO_OFFER';

  select receipt.* into v_receipt
  from public.portal_mutation_receipts as receipt
  where receipt.actor_user_id = 'a2100000-0000-4000-8000-000000000001'
    and receipt.mutation_id_hash = repeat('5', 64);

  if v_match.id is distinct from
      'f2200000-0000-4000-8000-000000000002'::uuid
    or v_match.status is distinct from 'DECLINED'
    or v_match.responded_by is distinct from
      'a2100000-0000-4000-8000-000000000001'::uuid
    or v_match.responded_at is null
    or v_match.row_version is distinct from 2
    or v_referral.id is distinct from
      'e2200000-0000-4000-8000-000000000002'::uuid
    or v_referral.current_status is distinct from 'TRIAGED'
    or v_referral.assigned_provider_id is not null
    or v_referral.row_version is distinct from 4
    or v_audit.id is null
    or v_audit.from_status is distinct from 'OFFERED'
    or v_audit.to_status is distinct from 'TRIAGED'
    or v_audit.correlation_id_hash is distinct from repeat('6', 64)
    or v_audit.metadata is distinct from jsonb_build_object(
      'matchId', 'f2200000-0000-4000-8000-000000000002',
      'decision', 'DECLINE'
    )
    or v_audit.occurred_at is null
    or v_receipt.id is null
    or v_receipt.mutation_kind is distinct from 'RESPOND_TO_OFFER'
    or v_receipt.payload_hash is distinct from pg_catalog.current_setting(
      'careslink.provider_response.provider_a_decline_hash'
    )
    or v_receipt.response_referral_id is distinct from v_referral.id
    or v_receipt.response_match_id is distinct from v_match.id
    or v_receipt.response_status is distinct from 'TRIAGED'
    or v_receipt.response_row_version is distinct from 4
    or v_receipt.response_updated_at is null
    or v_match.responded_at is distinct from v_referral.updated_at
    or v_audit.occurred_at is distinct from v_referral.updated_at
    or v_receipt.response_updated_at is distinct from v_referral.updated_at
  then
    raise exception 'Provider Response DECLINE atomic state drifted';
  end if;
end;
$$;

-- Close gates and remove every fixture before the final rollback.
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_workflow_v1';
update public.portal_workflow_flags
set enabled = false, updated_at = now()
where capability = 'referral_provider_response_v1';

alter table public.portal_audit_events
  disable trigger portal_audit_append_only;
alter table public.portal_mutation_receipts
  disable trigger portal_receipts_append_only;

delete from public.portal_audit_events
where actor_user_id in (
  'a2100000-0000-4000-8000-000000000001',
  'a2200000-0000-4000-8000-000000000002'
);
delete from public.portal_mutation_receipts
where actor_user_id in (
  'a2100000-0000-4000-8000-000000000001',
  'a2200000-0000-4000-8000-000000000002'
);
delete from public.portal_referral_matches
where id in (
  'f2100000-0000-4000-8000-000000000001',
  'f2200000-0000-4000-8000-000000000002',
  'f2300000-0000-4000-8000-000000000003',
  'f2400000-0000-4000-8000-000000000004'
);
delete from public.portal_referrals
where id in (
  'e2100000-0000-4000-8000-000000000001',
  'e2200000-0000-4000-8000-000000000002',
  'e2300000-0000-4000-8000-000000000003',
  'e2400000-0000-4000-8000-000000000004'
);
delete from public.portal_providers
where id in (
  'd2200000-0000-4000-8000-000000000002',
  'd2300000-0000-4000-8000-000000000003'
);
delete from public.portal_organization_memberships
where user_id in (
  'a2100000-0000-4000-8000-000000000001',
  'a2200000-0000-4000-8000-000000000002',
  'a2300000-0000-4000-8000-000000000003',
  'a2400000-0000-4000-8000-000000000004'
);
delete from public.portal_organizations
where id in (
  'c2100000-0000-4000-8000-000000000001',
  'c2200000-0000-4000-8000-000000000002',
  'c2300000-0000-4000-8000-000000000003'
);
delete from auth.sessions
where id in (
  'b2100000-0000-4000-8000-000000000001',
  'b2200000-0000-4000-8000-000000000002',
  'b2300000-0000-4000-8000-000000000003',
  'b2400000-0000-4000-8000-000000000004'
);
delete from auth.users
where id in (
  'a2100000-0000-4000-8000-000000000001',
  'a2200000-0000-4000-8000-000000000002',
  'a2300000-0000-4000-8000-000000000003',
  'a2400000-0000-4000-8000-000000000004',
  'a2500000-0000-4000-8000-000000000005',
  'a2600000-0000-4000-8000-000000000006'
);

alter table public.portal_mutation_receipts
  enable trigger portal_receipts_append_only;
alter table public.portal_audit_events
  enable trigger portal_audit_append_only;

do $$
begin
  if (select enabled from public.portal_workflow_flags
      where capability = 'referral_workflow_v1') is distinct from false
    or (select enabled from public.portal_workflow_flags
        where capability = 'referral_provider_response_v1') is distinct from false
    or exists (
      select 1
      from public.portal_referrals
      where id in (
        'e2100000-0000-4000-8000-000000000001',
        'e2200000-0000-4000-8000-000000000002',
        'e2300000-0000-4000-8000-000000000003',
        'e2400000-0000-4000-8000-000000000004',
        'e2500000-0000-4000-8000-000000000005'
      )
    )
    or exists (
      select 1
      from public.portal_referral_matches
      where id in (
        'f2100000-0000-4000-8000-000000000001',
        'f2200000-0000-4000-8000-000000000002',
        'f2300000-0000-4000-8000-000000000003',
        'f2400000-0000-4000-8000-000000000004',
        'f2500000-0000-4000-8000-000000000005'
      )
    )
    or exists (
      select 1
      from public.portal_providers
      where id in (
        'd2200000-0000-4000-8000-000000000002',
        'd2300000-0000-4000-8000-000000000003'
      )
    )
    or exists (
      select 1
      from public.portal_organization_memberships
      where user_id in (
        'a2100000-0000-4000-8000-000000000001',
        'a2200000-0000-4000-8000-000000000002',
        'a2300000-0000-4000-8000-000000000003',
        'a2400000-0000-4000-8000-000000000004'
      )
    )
    or exists (
      select 1
      from public.portal_organizations
      where id in (
        'c2100000-0000-4000-8000-000000000001',
        'c2200000-0000-4000-8000-000000000002',
        'c2300000-0000-4000-8000-000000000003'
      )
    )
    or exists (
      select 1
      from public.portal_audit_events
      where actor_user_id in (
        'a2100000-0000-4000-8000-000000000001',
        'a2200000-0000-4000-8000-000000000002'
      )
    )
    or exists (
      select 1
      from public.portal_mutation_receipts
      where actor_user_id in (
        'a2100000-0000-4000-8000-000000000001',
        'a2200000-0000-4000-8000-000000000002'
      )
    )
    or exists (
      select 1
      from auth.sessions
      where id in (
        'b2100000-0000-4000-8000-000000000001',
        'b2200000-0000-4000-8000-000000000002',
        'b2300000-0000-4000-8000-000000000003',
        'b2400000-0000-4000-8000-000000000004'
      )
    )
    or exists (
      select 1
      from auth.users
      where id in (
        'a2100000-0000-4000-8000-000000000001',
        'a2200000-0000-4000-8000-000000000002',
        'a2300000-0000-4000-8000-000000000003',
        'a2400000-0000-4000-8000-000000000004',
        'a2500000-0000-4000-8000-000000000005',
        'a2600000-0000-4000-8000-000000000006'
      )
    )
    or (select count(*)
        from pg_catalog.pg_trigger
        where tgname in (
          'portal_audit_append_only',
          'portal_receipts_append_only'
        )
          and not tgisinternal
          and tgenabled = 'O') <> 2
  then
    raise exception 'Provider Response rollback zero-fixture posture drifted';
  end if;
end;
$$;

rollback;
