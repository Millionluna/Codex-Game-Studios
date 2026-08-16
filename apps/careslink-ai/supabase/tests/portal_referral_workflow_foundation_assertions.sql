-- Manual rollback-only assertions for a fresh disposable Preview database.
-- This file is not executed by pnpm test and has not been run against a DB.
-- It must be run only after a clean apply of the exact migration revision.

begin;

do $$
declare
  v_table text;
  v_role text;
  v_signature text;
  v_security_definer boolean;
  v_search_path_setting text;
begin
  foreach v_table in array array[
    'portal_workflow_flags',
    'portal_organizations',
    'portal_organization_memberships',
    'portal_providers',
    'portal_referrals',
    'portal_referral_matches',
    'portal_referral_followups',
    'portal_referral_document_links',
    'portal_referral_exports',
    'portal_mutation_receipts',
    'portal_audit_events'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'missing portal table: %', v_table;
    end if;
    if not exists (
      select 1
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = v_table
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled: %', v_table;
    end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(v_role, 'public.' || v_table, 'SELECT')
        or has_table_privilege(v_role, 'public.' || v_table, 'INSERT')
        or has_table_privilege(v_role, 'public.' || v_table, 'UPDATE')
        or has_table_privilege(v_role, 'public.' || v_table, 'DELETE') then
        raise exception '% table grant leaked: %', v_role, v_table;
      end if;
    end loop;
  end loop;

  if to_regclass(
    'careslink_portal_private.portal_referral_contacts'
  ) is null then
    raise exception 'private contact table is missing';
  end if;
  if not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'careslink_portal_private'
      and relation.relname = 'portal_referral_contacts'
      and relation.relrowsecurity
  ) then
    raise exception 'private contact RLS is not enabled';
  end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(
      v_role,
      'careslink_portal_private.portal_referral_contacts',
      'SELECT'
    )
      or has_table_privilege(
        v_role,
        'careslink_portal_private.portal_referral_contacts',
        'INSERT'
      )
      or has_table_privilege(
        v_role,
        'careslink_portal_private.portal_referral_contacts',
        'UPDATE'
      )
      or has_table_privilege(
        v_role,
        'careslink_portal_private.portal_referral_contacts',
        'DELETE'
      ) then
      raise exception '% private contact ACL leaked', v_role;
    end if;
  end loop;

  if not has_schema_privilege(
    'authenticated',
    'careslink_portal_private',
    'USAGE'
  )
    or has_schema_privilege(
      'authenticated',
      'careslink_portal_private',
      'CREATE'
    )
    or has_schema_privilege('anon', 'careslink_portal_private', 'USAGE')
    or has_schema_privilege('service_role', 'careslink_portal_private', 'USAGE')
  then
    raise exception 'private schema ACL is unsafe';
  end if;

  if (select enabled from public.portal_workflow_flags
      where capability = 'referral_workflow_v1') is distinct from false
    or (select preview_only from public.portal_workflow_flags
        where capability = 'referral_workflow_v1') is distinct from true then
    raise exception 'portal workflow flag is not default-off Preview-only';
  end if;

  foreach v_signature in array array[
    'careslink_portal_private.current_session_is_eligible()',
    'careslink_portal_private.has_active_membership(uuid,text[])',
    'careslink_portal_private.is_platform_admin()',
    'careslink_portal_private.current_provider_id()',
    'careslink_portal_private.can_read_referral(uuid)',
    'careslink_portal_private.can_read_match(uuid)',
    'careslink_portal_private.can_read_assigned_workflow(uuid)',
    'careslink_portal_private.can_read_audit(uuid)',
    'careslink_portal_private.can_read_contact(uuid)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'portal RLS helper is missing: %', v_signature;
    end if;
    select
      routine.prosecdef,
      coalesce((
        select setting.value
        from unnest(coalesce(routine.proconfig, '{}'::text[]))
          as setting(value)
        where setting.value like 'search_path=%'
        limit 1
      ), '')
    into v_security_definer, v_search_path_setting
    from pg_proc as routine
    where routine.oid = to_regprocedure(v_signature);

    if not v_security_definer
      or v_search_path_setting not in ('search_path=', 'search_path=""') then
      raise exception 'unsafe SECURITY DEFINER/search_path: % (%)',
        v_signature, v_search_path_setting;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or has_function_privilege('anon', v_signature, 'EXECUTE')
      or has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'unsafe helper EXECUTE ACL: %', v_signature;
    end if;
  end loop;

  v_signature :=
    'careslink_portal_private.deny_append_only_mutation()';
  if has_function_privilege('authenticated', v_signature, 'EXECUTE')
    or has_function_privilege('anon', v_signature, 'EXECUTE')
    or has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception 'append-only trigger function EXECUTE leaked';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname in ('public', 'careslink_portal_private')
      and tablename like 'portal_%'
      and cmd <> 'SELECT'
  ) then
    raise exception 'state-changing portal RLS policy unexpectedly exists';
  end if;

  foreach v_table in array array[
    'portal_referrals_source_user_idx',
    'portal_matches_offered_by_idx',
    'portal_matches_responded_by_idx',
    'portal_followups_actor_user_idx',
    'portal_document_links_document_owner_idx',
    'portal_document_links_owner_user_idx',
    'portal_document_links_created_by_idx',
    'portal_exports_job_owner_idx',
    'portal_exports_owner_user_idx',
    'portal_exports_created_by_idx',
    'portal_receipts_response_referral_idx',
    'portal_receipts_response_match_idx'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'foreign-key support index is missing: %', v_table;
    end if;
  end loop;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'portal_mutation_receipts'
      and column_name in ('response_envelope', 'mutation_id', 'correlation_id')
  )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'portal_mutation_receipts'
        and column_name = 'response_referral_id'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'portal_mutation_receipts'
        and column_name = 'mutation_id_hash'
    ) then
    raise exception 'mutation receipt is not metadata-only';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and (
        (
          table_name = 'portal_referral_matches'
          and column_name in ('reasons', 'gaps', 'response_reason_code')
        )
        or (
          table_name = 'portal_referral_followups'
          and column_name = 'restricted_note'
        )
        or (
          table_name = 'portal_audit_events'
          and column_name in ('mutation_id', 'correlation_id')
        )
      )
  )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'portal_audit_events'
        and column_name = 'mutation_id_hash'
    )
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'portal_audit_events'
        and column_name = 'correlation_id_hash'
    ) then
    raise exception 'Portal free-text or raw transport metadata leaked';
  end if;
end
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '91000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'portal-source-a@example.invalid', 'test-only-no-login', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000000',
    'authenticated', 'authenticated',
    'portal-source-b@example.invalid', 'test-only-no-login', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '93000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000000',
    'authenticated', 'authenticated',
    'portal-provider-a@example.invalid', 'test-only-no-login', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '94000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000000',
    'authenticated', 'authenticated',
    'portal-provider-b@example.invalid', 'test-only-no-login', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '90000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000000',
    'authenticated', 'authenticated',
    'portal-admin@example.invalid', 'test-only-no-login', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '90000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000000',
    'authenticated', 'authenticated',
    'portal-operator@example.invalid', 'test-only-no-login', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
values
  (
    '91100000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001', now(), now(), null
  ),
  (
    '92200000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002', now(), now(), null
  ),
  (
    '93300000-0000-4000-8000-000000000003',
    '93000000-0000-4000-8000-000000000003', now(), now(), null
  ),
  (
    '94400000-0000-4000-8000-000000000004',
    '94000000-0000-4000-8000-000000000004', now(), now(), null
  ),
  (
    '90000000-0000-4000-8000-000000000505',
    '90000000-0000-4000-8000-000000000005', now(), now(), null
  ),
  (
    '90000000-0000-4000-8000-000000000606',
    '90000000-0000-4000-8000-000000000006', now(), now(), null
  );

insert into public.portal_organizations (
  id, organization_type, display_name
) values
  ('95000000-0000-4000-8000-000000000001', 'REFERRAL_SOURCE', 'Source A'),
  ('95000000-0000-4000-8000-000000000002', 'REFERRAL_SOURCE', 'Source B'),
  ('95000000-0000-4000-8000-000000000003', 'PROVIDER', 'Provider A'),
  ('95000000-0000-4000-8000-000000000004', 'PROVIDER', 'Provider B'),
  ('95000000-0000-4000-8000-000000000005', 'PLATFORM', 'Platform'),
  ('95000000-0000-4000-8000-000000000006', 'PROVIDER', 'Provider C');

insert into public.portal_organization_memberships (
  organization_id, user_id, role, status
) values
  (
    '95000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'referral_source', 'ACTIVE'
  ),
  (
    '95000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'referral_source', 'ACTIVE'
  ),
  (
    '95000000-0000-4000-8000-000000000003',
    '93000000-0000-4000-8000-000000000003',
    'provider_member', 'ACTIVE'
  ),
  (
    '95000000-0000-4000-8000-000000000004',
    '94000000-0000-4000-8000-000000000004',
    'provider_member', 'ACTIVE'
  ),
  (
    '95000000-0000-4000-8000-000000000005',
    '90000000-0000-4000-8000-000000000005',
    'platform_admin', 'ACTIVE'
  ),
  (
    '95000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000006',
    'partner_operator', 'ACTIVE'
  ),
  -- This intentionally malformed role/org pairing must never grant admin.
  (
    '95000000-0000-4000-8000-000000000004',
    '94000000-0000-4000-8000-000000000004',
    'platform_admin', 'ACTIVE'
  );

insert into public.portal_providers (id, organization_id, review_status)
values
  (
    '96000000-0000-4000-8000-000000000003',
    '95000000-0000-4000-8000-000000000003', 'APPROVED'
  ),
  (
    '96000000-0000-4000-8000-000000000004',
    '95000000-0000-4000-8000-000000000004', 'APPROVED'
  ),
  (
    '96000000-0000-4000-8000-000000000006',
    '95000000-0000-4000-8000-000000000006', 'APPROVED'
  );

insert into public.portal_referrals (
  id, source_organization_id, source_user_id, summary, region,
  service_type, current_status
) values
  (
    '97000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'Adult participant seeks support coordination',
    'VIC_MELBOURNE', 'SUPPORT_COORDINATION', 'OFFERED'
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'Adult participant seeks daily living support',
    'VIC_GEELONG', 'DAILY_LIVING_SUPPORT', 'TRIAGED'
  );

do $$
begin
  begin
    insert into public.portal_referrals (
      id, source_organization_id, source_user_id, summary, region, service_type
    ) values (
      '97000000-0000-4000-8000-000000000003',
      '95000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'Email participant@example.invalid',
      'VIC_MELBOURNE', 'DAILY_LIVING_SUPPORT'
    );
    raise exception 'Referral summary email guard failed';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.portal_referrals (
      id, source_organization_id, source_user_id, summary, region, service_type
    ) values (
      '97000000-0000-4000-8000-000000000004',
      '95000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'Call 0400 000 999 for intake',
      'VIC_MELBOURNE', 'DAILY_LIVING_SUPPORT'
    );
    raise exception 'Referral summary phone guard failed';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.portal_referrals (
      id, source_organization_id, source_user_id, summary, region, service_type
    ) values (
      '97000000-0000-4000-8000-000000000005',
      '95000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'Contact: Jamie', 'VIC_MELBOURNE', 'DAILY_LIVING_SUPPORT'
    );
    raise exception 'Referral summary labelled-contact guard failed';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.portal_referrals (
      id, source_organization_id, source_user_id, summary, region, service_type
    ) values (
      '97000000-0000-4000-8000-000000000006',
      '95000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'Structured catalog validation fixture',
      'PHONE_0400000000', 'DAILY_LIVING_SUPPORT'
    );
    raise exception 'Referral region allowlist failed';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.portal_referrals (
      id, source_organization_id, source_user_id, summary, region, service_type
    ) values (
      '97000000-0000-4000-8000-000000000007',
      '95000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'Structured catalog validation fixture',
      'VIC_REGIONAL', 'UNKNOWN_SERVICE'
    );
    raise exception 'Referral service allowlist failed';
  exception when check_violation then
    null;
  end;
end
$$;

insert into careslink_portal_private.portal_referral_contacts (
  referral_id, contact_name, contact_phone, contact_email
) values
  (
    '97000000-0000-4000-8000-000000000001',
    'Private A', '0400000001', 'private-a@example.invalid'
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    'Private B', '0400000002', 'private-b@example.invalid'
  );

insert into public.portal_referral_matches (
  id, referral_id, provider_id, status
) values
  (
    '98000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000003',
    'OFFERED'
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000004',
    'CANDIDATE'
  );

insert into public.portal_referral_followups (
  id, referral_id, actor_user_id, outcome_code
) values (
  '99000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'FOLLOW_UP_SCHEDULED'
);

insert into public.ai_documents (
  id, owner_user_id, note_type, source_locale, lifecycle_status,
  schema_version, contract_version
) values (
  '9c000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000003',
  'communication', 'en', 'IN_PROGRESS',
  '2026-08-09.v1-shadow', '1.0.0-shadow.1'
);

insert into public.ai_document_revisions (
  id, document_id, owner_user_id, revision_number, content, content_hash,
  mutation_id, schema_version, contract_version
) values (
  '9d000000-0000-4000-8000-000000000001',
  '9c000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000003',
  1, '{}'::jsonb, repeat('c', 64), 'portal.revision.0001',
  '2026-08-09.v1-shadow', '1.0.0-shadow.1'
);

update public.ai_documents
set current_revision_id = '9d000000-0000-4000-8000-000000000001',
    current_revision_number = 1,
    updated_at = now()
where id = '9c000000-0000-4000-8000-000000000001';

insert into public.export_jobs (
  id, owner_user_id, document_id, revision_id, format, status,
  template_version, export_profile, idempotency_key
) values (
  '9e000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000003',
  '9c000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000001',
  'PDF', 'ARTIFACT_READY', 'portal-test-v1', 'RECORD_COPY',
  'portal.export.0001'
);

insert into public.portal_referral_document_links (
  id, referral_id, document_id, document_owner_user_id, link_type, created_by
) values (
  '9f000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '9c000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000003',
  'PRIMARY_NOTE',
  '91000000-0000-4000-8000-000000000001'
);

insert into public.portal_referral_exports (
  id, referral_id, export_job_id, export_owner_user_id, created_by
) values (
  '8f000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '9e000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000003',
  '91000000-0000-4000-8000-000000000001'
);

insert into public.portal_mutation_receipts (
  id, actor_user_id, mutation_id_hash, mutation_kind, payload_hash,
  response_referral_id, response_match_id, response_status,
  response_row_version, response_updated_at
) values
  (
    '9a000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    repeat('a', 64), 'CREATE_REFERRAL', repeat('a', 64),
    '97000000-0000-4000-8000-000000000001',
    null,
    'SUBMITTED', 1, now()
  ),
  (
    '9a000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000003',
    repeat('b', 64), 'RESPOND_TO_OFFER', repeat('b', 64),
    '97000000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000001',
    'OFFERED', 1, now()
  );

insert into public.portal_audit_events (
  id, referral_id, actor_user_id, actor_role, mutation_kind,
  from_status, to_status, mutation_id_hash, correlation_id_hash, metadata
) values (
  '9b000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000006',
  'partner_operator', 'OFFER_REFERRAL', 'TRIAGED', 'OFFERED',
  repeat('c', 64), repeat('d', 64),
  '{"matchId":"98000000-0000-4000-8000-000000000001","providerId":"96000000-0000-4000-8000-000000000003"}'::jsonb
);

do $$
begin
  begin
    insert into public.portal_referral_followups (
      referral_id, actor_user_id, outcome_code
    ) values (
      '97000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'FREE_TEXT_OUTCOME'
    );
    raise exception 'Follow-up outcome allowlist failed';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.portal_audit_events (
      referral_id, actor_user_id, actor_role, mutation_kind,
      from_status, to_status, mutation_id_hash, metadata
    ) values (
      '97000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'referral_source', 'RECORD_FOLLOW_UP', 'OFFERED', 'OFFERED',
      repeat('e', 64),
      '{"contactPhone":"0400000001"}'::jsonb
    );
    raise exception 'Audit metadata contact-key allowlist failed';
  exception when check_violation then
    null;
  end;
end
$$;

-- Temporary read grants exist only inside this rollback transaction so the RLS
-- predicates can be exercised. The migration itself withholds these grants.
grant select on table
  public.portal_organizations,
  public.portal_organization_memberships,
  public.portal_providers,
  public.portal_referrals,
  public.portal_referral_matches,
  public.portal_referral_followups,
  public.portal_referral_document_links,
  public.portal_referral_exports,
  public.portal_mutation_receipts,
  public.portal_audit_events
to authenticated;
grant select on table careslink_portal_private.portal_referral_contacts
to authenticated;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $$
declare
  v_receipt jsonb;
begin
  if (select count(*) from public.portal_organizations) <> 1
    or (select count(*) from public.portal_organization_memberships) <> 1
    or (select count(*) from public.portal_providers) <> 0
    or (select count(*) from public.portal_referrals) <> 1
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 1
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from public.portal_referral_followups) <> 1
    or (select count(*) from public.portal_referral_document_links) <> 1
    or (select count(*) from public.portal_referral_exports) <> 1
    or (select count(*) from public.portal_mutation_receipts) <> 1
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Source A referral isolation failed';
  end if;

  select to_jsonb(receipt)
  into v_receipt
  from public.portal_mutation_receipts as receipt;
  if v_receipt ? 'response_envelope'
    or v_receipt::text ~* '(Private A|0400000001|private-a@example[.]invalid|access[_-]?token|english_draft)' then
    raise exception 'Mutation receipt redaction failed';
  end if;

  begin
    insert into public.portal_referrals (
      source_organization_id, source_user_id, summary, region, service_type
    ) values (
      '95000000-0000-4000-8000-000000000001', auth.uid(),
      'must fail', 'VIC_MELBOURNE', 'SUPPORT_COORDINATION'
    );
    raise exception 'Authenticated direct write unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000006","session_id":"90000000-0000-4000-8000-000000000606"}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.portal_organizations) <> 1
    or (select count(*) from public.portal_organization_memberships) <> 2
    or (select count(*) from public.portal_providers) <> 0
    or (select count(*) from public.portal_referrals) <> 1
    or not exists (
      select 1 from public.portal_referrals
      where id = '97000000-0000-4000-8000-000000000001'
    )
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 1
    or (select count(*) from public.portal_referral_matches) <> 2
    or (select count(*) from public.portal_referral_followups) <> 1
    or (select count(*) from public.portal_referral_document_links) <> 1
    or (select count(*) from public.portal_referral_exports) <> 1
    or (select count(*) from public.portal_mutation_receipts) <> 0
    or (select count(*) from public.portal_audit_events) <> 1 then
    raise exception 'Partner operator referral-tenant isolation failed';
  end if;
end
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"92000000-0000-4000-8000-000000000002","session_id":"92200000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.portal_referrals) <> 1
    or not exists (
      select 1 from public.portal_referrals
      where id = '97000000-0000-4000-8000-000000000002'
    )
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 1
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from public.portal_referral_followups) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0
    or (select count(*) from public.portal_mutation_receipts) <> 0
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Source B owner isolation failed';
  end if;
end
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"93000000-0000-4000-8000-000000000003","session_id":"93300000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;

do $$
begin
  if careslink_portal_private.current_provider_id() is distinct from
      '96000000-0000-4000-8000-000000000003'::uuid
    or (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0
    or (select count(*) from public.portal_referral_followups) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0
    or (select count(*) from public.portal_mutation_receipts) <> 0
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Provider A raw-match isolation failed';
  end if;
end
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94000000-0000-4000-8000-000000000004","session_id":"94400000-0000-4000-8000-000000000004"}',
  true
);
set local role authenticated;

do $$
begin
  if careslink_portal_private.is_platform_admin()
    or careslink_portal_private.current_provider_id() is distinct from
      '96000000-0000-4000-8000-000000000004'::uuid
    or (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Provider B candidate/role-type isolation failed';
  end if;
end
$$;

reset role;
insert into public.portal_organization_memberships (
  organization_id, user_id, role, status
) values (
  '95000000-0000-4000-8000-000000000006',
  '94000000-0000-4000-8000-000000000004',
  'provider_member', 'ACTIVE'
);
set local role authenticated;

do $$
begin
  if careslink_portal_private.current_provider_id() is not null
    or (select count(*) from public.portal_providers) <> 0
    or (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from public.portal_referral_matches) <> 0 then
    raise exception 'Multiple-provider membership fail-closed check failed';
  end if;
end
$$;

reset role;
update public.portal_referral_matches
set status = 'DECLINED', row_version = row_version + 1, updated_at = now()
where id = '98000000-0000-4000-8000-000000000001';
update public.portal_referrals
set current_status = 'TRIAGED', assigned_provider_id = null,
    row_version = row_version + 1, updated_at = now()
where id = '97000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"93000000-0000-4000-8000-000000000003","session_id":"93300000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0
    or (select count(*) from public.portal_referral_followups) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0
    or (select count(*) from public.portal_mutation_receipts) <> 0
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Declined provider retained workflow visibility';
  end if;
end
$$;

reset role;
update public.portal_referrals
set current_status = 'ACCEPTED',
    assigned_provider_id = '96000000-0000-4000-8000-000000000003',
    row_version = row_version + 1, updated_at = now()
where id = '97000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
begin
  if (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0
    or (select count(*) from public.portal_referral_followups) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0 then
    raise exception 'Exact accepted-match contact guard failed';
  end if;
end
$$;

reset role;
update public.portal_referral_matches
set status = 'ACCEPTED', row_version = row_version + 1, updated_at = now()
where id = '98000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
begin
  if (select count(*) from public.portal_referrals) <> 1
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 1
    or (select count(*) from public.portal_referral_followups) <> 1
    or (select count(*) from public.portal_referral_document_links) <> 1
    or (select count(*) from public.portal_referral_exports) <> 1
    or (select count(*) from public.portal_mutation_receipts) <> 1
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Assigned Provider A accepted-workflow isolation failed';
  end if;
end
$$;

reset role;
update public.portal_organizations
set status = 'SUSPENDED', updated_at = now()
where id = '95000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$
begin
  if (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0
    or (select count(*) from public.portal_referral_followups) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0
    or (select count(*) from public.portal_mutation_receipts) <> 0 then
    raise exception 'Suspended provider organization retained visibility';
  end if;
end
$$;

reset role;
update public.portal_organizations
set status = 'ACTIVE', updated_at = now()
where id = '95000000-0000-4000-8000-000000000003';
update public.portal_providers
set review_status = 'SUSPENDED', updated_at = now()
where id = '96000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$
begin
  if careslink_portal_private.current_provider_id() is not null
    or (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0 then
    raise exception 'Suspended provider review retained visibility';
  end if;
end
$$;

reset role;
update public.portal_providers
set review_status = 'APPROVED', updated_at = now()
where id = '96000000-0000-4000-8000-000000000003';
update public.portal_organization_memberships
set status = 'SUSPENDED', updated_at = now()
where organization_id = '95000000-0000-4000-8000-000000000003'
  and user_id = '93000000-0000-4000-8000-000000000003'
  and role = 'provider_member';
set local role authenticated;
do $$
begin
  if careslink_portal_private.current_provider_id() is not null
    or (select count(*) from public.portal_organization_memberships) <> 0
    or (select count(*) from public.portal_referrals) <> 0 then
    raise exception 'Suspended provider membership retained visibility';
  end if;
end
$$;

reset role;
update public.portal_organization_memberships
set status = 'ACTIVE', updated_at = now()
where organization_id = '95000000-0000-4000-8000-000000000003'
  and user_id = '93000000-0000-4000-8000-000000000003'
  and role = 'provider_member';
update public.portal_organizations
set status = 'SUSPENDED', updated_at = now()
where id = '95000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.portal_organizations) <> 0
    or (select count(*) from public.portal_organization_memberships) <> 0
    or (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from public.portal_referral_followups) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0
    or (select count(*) from public.portal_mutation_receipts) <> 0
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Suspended source organization retained visibility';
  end if;
end
$$;

reset role;
update public.portal_organizations
set status = 'ACTIVE', updated_at = now()
where id = '95000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000005","session_id":"90000000-0000-4000-8000-000000000505"}',
  true
);
set local role authenticated;

do $$
begin
  if not careslink_portal_private.is_platform_admin()
    or (select count(*) from public.portal_referrals) <> 2
    or (select count(*) from public.portal_referral_matches) <> 2
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 2
    or (select count(*) from public.portal_referral_followups) <> 1
    or (select count(*) from public.portal_referral_document_links) <> 1
    or (select count(*) from public.portal_referral_exports) <> 1
    or (select count(*) from public.portal_mutation_receipts) <> 0
    or (select count(*) from public.portal_audit_events) <> 1 then
    raise exception 'Platform admin visibility failed';
  end if;
end
$$;

reset role;
update public.portal_organizations
set status = 'SUSPENDED', updated_at = now()
where id = '95000000-0000-4000-8000-000000000005';
set local role authenticated;
do $$
begin
  if careslink_portal_private.is_platform_admin()
    or (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Suspended PLATFORM admin retained visibility';
  end if;
end
$$;

reset role;
update public.portal_organizations
set status = 'ACTIVE', updated_at = now()
where id = '95000000-0000-4000-8000-000000000005';
delete from auth.sessions
where id = '91100000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $$
begin
  if careslink_portal_private.current_session_is_eligible()
    or (select count(*) from public.portal_organizations) <> 0
    or (select count(*) from public.portal_organization_memberships) <> 0
    or (select count(*) from public.portal_providers) <> 0
    or (select count(*) from public.portal_referrals) <> 0
    or (select count(*) from careslink_portal_private.portal_referral_contacts) <> 0
    or (select count(*) from public.portal_referral_matches) <> 0
    or (select count(*) from public.portal_referral_followups) <> 0
    or (select count(*) from public.portal_referral_document_links) <> 0
    or (select count(*) from public.portal_referral_exports) <> 0
    or (select count(*) from public.portal_mutation_receipts) <> 0
    or (select count(*) from public.portal_audit_events) <> 0 then
    raise exception 'Revoked Source A session retained portal visibility';
  end if;
end
$$;

reset role;
rollback;
