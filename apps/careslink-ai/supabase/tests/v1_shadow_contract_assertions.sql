-- Run only on a disposable Supabase branch immediately after
-- 20260809120000_create_v1_shadow_foundation.sql (with the NDIS integration
-- migration optionally present) and before test fixtures.
-- This script contains no credentials and performs no persistent writes.

begin;

do $$
declare
  v_count integer;
  v_worker_policy_table_present boolean :=
    to_regclass('careslink_v1_generation.worker_policies') is not null;
  v_worker_claim_rpc_present boolean :=
    to_regprocedure(
      'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'
    ) is not null;
  v_worker_extension_present boolean;
  v_points_admission_role_present boolean :=
    to_regrole('careslink_v1_generation_points_admission_executor') is not null;
  v_points_admission_table_present boolean :=
    to_regclass(
      'careslink_v1_generation.communication_note_point_admissions'
    ) is not null;
  v_points_admission_rpc_present boolean :=
    to_regprocedure(
      'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)'
    ) is not null;
  v_points_admission_extension_present boolean;
begin
  if v_worker_policy_table_present is distinct from
    v_worker_claim_rpc_present
  then
    raise exception 'Partial worker extension detected';
  end if;
  v_worker_extension_present := v_worker_policy_table_present;

  if not (
    v_points_admission_role_present = v_points_admission_table_present
    and v_points_admission_table_present = v_points_admission_rpc_present
  ) then
    raise exception 'Partial Communication Note Points admission extension detected';
  end if;
  v_points_admission_extension_present := v_points_admission_role_present;
  if v_points_admission_extension_present and not v_worker_extension_present
  then
    raise exception 'Points admission extension requires the worker extension';
  end if;

  select count(*) into v_count
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relname in (
      'service_rate_versions', 'service_rates', 'ai_documents',
      'privacy_reviews', 'ai_document_revisions', 'document_checkpoints',
      'self_review_events', 'generation_jobs', 'export_jobs', 'export_events',
      'point_wallets', 'point_lots', 'point_quotes', 'point_reservations',
      'point_reservation_allocations', 'point_ledger_entries',
      'legacy_document_migration_batches', 'legacy_document_migration_items'
    );
  if v_count <> 18 then
    raise exception 'Expected 18 V1 shadow tables, found %', v_count;
  end if;

  if to_regclass('public.ndis_shadow_document_links') is not null then
    select count(*) into v_count
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_documents'
      and column_name in (
        'legacy_source_draft_id',
        'legacy_source_owner_user_id',
        'tombstone_correlation_id'
      );

    if v_count <> 3 then
      raise exception 'Expected canonical legacy source/audit columns, found %', v_count;
    end if;

    select count(*) into v_count
    from pg_constraint
    where conrelid = 'public.ai_documents'::regclass
      and conname in (
        'ai_documents_legacy_source_pair_check',
        'ai_documents_legacy_source_generation_key'
      );

    if v_count <> 2 then
      raise exception 'Expected paired/unique canonical legacy source constraints, found %', v_count;
    end if;

    if exists (
      select 1
      from pg_constraint
      where conrelid = 'public.ai_documents'::regclass
        and conname = 'ai_documents_legacy_source_key'
    ) or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.ai_documents'::regclass
        and conname = 'ai_documents_legacy_source_generation_key'
        and pg_get_constraintdef(oid) like
          '%legacy_source_owner_user_id, legacy_source_draft_id, created_at%'
    ) then
      raise exception 'Canonical legacy generation uniqueness contract is invalid';
    end if;

    if to_regprocedure(
         'public.tombstone_deleted_ndis_shadow(uuid,text,uuid)'
       ) is not null
       or to_regprocedure(
         'public.tombstone_deleted_ndis_shadow(uuid,text,timestamptz,uuid)'
       ) is null then
      raise exception 'Canonical tombstone RPC overload contract is invalid';
    end if;
  end if;

  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and cmd = 'SELECT'
    and tablename in (
      'ai_documents', 'privacy_reviews', 'ai_document_revisions',
      'document_checkpoints', 'self_review_events', 'generation_jobs',
      'export_jobs', 'export_events', 'point_wallets', 'point_lots',
      'point_quotes', 'point_reservations',
      'point_reservation_allocations', 'point_ledger_entries',
      'ndis_shadow_document_links', 'ndis_shadow_write_outbox',
      'ndis_shadow_read_comparisons'
    );

  if exists (
    with expected_owner_policies(policyname, tablename, roles) as (
      values
        (
          'ai_documents_owner_select'::name,
          'ai_documents'::name,
          array['authenticated']::name[]
        ),
        (
          'privacy_reviews_owner_select'::name,
          'privacy_reviews'::name,
          array['authenticated']::name[]
        ),
        (
          'ai_document_revisions_owner_select'::name,
          'ai_document_revisions'::name,
          array['authenticated']::name[]
        ),
        (
          'document_checkpoints_owner_select'::name,
          'document_checkpoints'::name,
          array['authenticated']::name[]
        ),
        (
          'self_review_events_owner_select'::name,
          'self_review_events'::name,
          array['authenticated']::name[]
        ),
        (
          'generation_jobs_owner_select'::name,
          'generation_jobs'::name,
          array['authenticated']::name[]
        ),
        (
          'export_jobs_owner_select'::name,
          'export_jobs'::name,
          array['authenticated']::name[]
        ),
        (
          'export_events_owner_select'::name,
          'export_events'::name,
          array['authenticated']::name[]
        ),
        (
          'point_wallets_owner_select'::name,
          'point_wallets'::name,
          array['authenticated']::name[]
        ),
        (
          'point_lots_owner_select'::name,
          'point_lots'::name,
          array['authenticated']::name[]
        ),
        (
          'point_quotes_owner_select'::name,
          'point_quotes'::name,
          array['authenticated']::name[]
        ),
        (
          'point_reservations_owner_select'::name,
          'point_reservations'::name,
          array['authenticated']::name[]
        ),
        (
          'point_reservation_allocations_owner_select'::name,
          'point_reservation_allocations'::name,
          array['authenticated']::name[]
        ),
        (
          'point_ledger_entries_owner_select'::name,
          'point_ledger_entries'::name,
          array['authenticated']::name[]
        )
    ),
    actual_owner_policies as (
      select policyname, tablename, roles
      from pg_policies
      where schemaname = 'public'
        and cmd = 'SELECT'
        and roles = array['authenticated']::name[]
        and tablename in (
          'ai_documents', 'privacy_reviews', 'ai_document_revisions',
          'document_checkpoints', 'self_review_events', 'generation_jobs',
          'export_jobs', 'export_events', 'point_wallets', 'point_lots',
          'point_quotes', 'point_reservations',
          'point_reservation_allocations', 'point_ledger_entries',
          'ndis_shadow_document_links', 'ndis_shadow_write_outbox',
          'ndis_shadow_read_comparisons'
        )
    ),
    missing_owner_policies as (
      select * from expected_owner_policies
      except
      select * from actual_owner_policies
    ),
    unexpected_owner_policies as (
      select * from actual_owner_policies
      except
      select * from expected_owner_policies
    )
    select 1 from missing_owner_policies
    union all
    select 1 from unexpected_owner_policies
  ) then
    raise exception 'Owner SELECT policy identity/table/role set is invalid';
  end if;

  if v_points_admission_extension_present then
    if v_count <> 22 then
      raise exception
        'Expected 14 owner, 2 worker and 6 Points admission SELECT policies, found %',
        v_count;
    end if;

    if exists (
      with expected_points_policies(policyname, tablename) as (
        values
          ('point_wallets_points_admission_select'::name, 'point_wallets'::name),
          ('point_lots_points_admission_select'::name, 'point_lots'::name),
          ('point_quotes_points_admission_select'::name, 'point_quotes'::name),
          (
            'point_reservations_points_admission_select'::name,
            'point_reservations'::name
          ),
          (
            'point_allocations_points_admission_select'::name,
            'point_reservation_allocations'::name
          ),
          (
            'point_ledger_points_admission_select'::name,
            'point_ledger_entries'::name
          )
      ),
      actual_points_policies as (
        select policyname, tablename
        from pg_policies
        where schemaname = 'public'
          and cmd = 'SELECT'
          and roles =
            array['careslink_v1_generation_points_admission_executor']::name[]
          and tablename in (
            'point_wallets', 'point_lots', 'point_quotes',
            'point_reservations', 'point_reservation_allocations',
            'point_ledger_entries'
          )
      ),
      drift as (
        (select * from expected_points_policies
         except all select * from actual_points_policies)
        union all
        (select * from actual_points_policies
         except all select * from expected_points_policies)
      )
      select 1 from drift
    ) then
      raise exception
        'Points admission canonical SELECT policy identities are invalid';
    end if;
  elsif v_worker_extension_present then
    if v_count <> 16 then
      raise exception 'Expected 14 owner and 2 worker SELECT policies, found %',
        v_count;
    end if;

    select count(*) into v_count
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and roles = array['careslink_v1_generation_executor']::name[]
      and (policyname, tablename) in (
        values
          ('ai_documents_generation_executor_select', 'ai_documents'),
          (
            'ai_document_revisions_generation_executor_select',
            'ai_document_revisions'
          )
      );
    if v_count <> 2 then
      raise exception 'Worker canonical SELECT policy identities are invalid';
    end if;
  elsif v_count <> 14 then
    raise exception 'Expected 14 owner SELECT policies, found %', v_count;
  end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee = 'authenticated'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    and table_name in (
      'ai_documents', 'privacy_reviews', 'ai_document_revisions',
      'document_checkpoints', 'self_review_events', 'generation_jobs',
      'export_jobs', 'export_events', 'point_wallets', 'point_lots',
      'point_quotes', 'point_reservations',
      'point_reservation_allocations', 'point_ledger_entries',
      'ndis_shadow_document_links', 'ndis_shadow_write_outbox',
      'ndis_shadow_read_comparisons'
    );
  if v_count <> 0 then
    raise exception 'Authenticated shadow write grants found: %', v_count;
  end if;

  select count(distinct routine_name) into v_count
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE'
    and routine_name in (
      'grant_shadow_point_lot', 'create_shadow_point_quote',
      'reserve_shadow_points', 'commit_shadow_points',
      'release_shadow_points'
    );
  if v_count <> 5 then
    raise exception 'Expected 5 service-role Points RPC grants, found %', v_count;
  end if;

  if exists (
    select 1
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and routine_name in (
        'grant_shadow_point_lot', 'create_shadow_point_quote',
        'reserve_shadow_points', 'commit_shadow_points',
        'release_shadow_points'
      )
  ) then
    raise exception 'Client role can execute a shadow Points RPC';
  end if;

  if exists (select 1 from public.point_lots where source = 'WELCOME') then
    raise exception 'Unexpected automatic welcome Points grant';
  end if;

  begin
    insert into public.point_wallets (owner_user_id, shadow_only)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
    raise exception 'shadow_only=false unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end
$$;

rollback;
