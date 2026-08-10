-- Run only on a disposable Supabase branch immediately after
-- 20260809120000_create_v1_shadow_foundation.sql (with the NDIS integration
-- migration optionally present) and before test fixtures.
-- This script contains no credentials and performs no persistent writes.

begin;

do $$
declare
  v_count integer;
begin
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
  if v_count <> 14 then
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
