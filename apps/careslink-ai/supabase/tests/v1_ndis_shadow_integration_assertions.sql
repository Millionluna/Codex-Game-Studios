-- Credential-free transaction test for the isolated NDIS shadow migration.
-- Run only after 20260809120000, 20260809150000 and forward migrations
-- through 20260811134719 are applied.

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  v_count integer;
  v_expected_columns smallint[];
  v_revision_trigger text;
begin
  select count(distinct routine_name) into v_count
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE'
    and routine_name in (
      'project_ndis_legacy_shadow',
      'compare_ndis_legacy_shadow',
      'tombstone_deleted_ndis_shadow',
      'audit_ndis_shadow_reconciliation'
    );

  if v_count <> 4 then
    raise exception 'Expected 4 service-role NDIS shadow RPC grants, found %', v_count;
  end if;

  if to_regprocedure(
       'public.tombstone_deleted_ndis_shadow(uuid,text,uuid)'
     ) is not null
     or to_regprocedure(
       'public.tombstone_deleted_ndis_shadow(uuid,text,timestamptz,uuid)'
     ) is null then
    raise exception 'Tombstone RPC overload contract is invalid';
  end if;

  if exists (
    select 1
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and routine_name in (
        'project_ndis_legacy_shadow',
        'compare_ndis_legacy_shadow',
        'tombstone_deleted_ndis_shadow',
        'audit_ndis_shadow_reconciliation'
      )
  ) then
    raise exception 'Client role can execute an NDIS shadow RPC';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_documents'::regclass
      and conname = 'ai_documents_legacy_source_pair_check'
      and pg_get_constraintdef(oid) like '%legacy.generated_material_drafts.ndis_case_note.v1%'
      and pg_get_constraintdef(oid) like '%TOMBSTONED%'
  ) then
    raise exception 'Fail-closed legacy source constraint is missing';
  end if;

  select array_agg(attribute.attnum order by expected.ordinality)
    into v_expected_columns
  from unnest(array[
    'legacy_source_owner_user_id',
    'legacy_source_draft_id',
    'created_at'
  ]) with ordinality as expected(column_name, ordinality)
  join pg_attribute as attribute
    on attribute.attrelid = 'public.ai_documents'::regclass
   and attribute.attname = expected.column_name
   and attribute.attnum > 0
   and not attribute.attisdropped;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_documents'::regclass
      and conname = 'ai_documents_legacy_source_key'
  )
    or coalesce(array_length(v_expected_columns, 1), 0) <> 3
    or (
      select count(*)
      from pg_constraint as constraint_record
      join pg_index as backing_index
        on backing_index.indexrelid = constraint_record.conindid
       and backing_index.indrelid = constraint_record.conrelid
      where constraint_record.conrelid = 'public.ai_documents'::regclass
        and constraint_record.conname = 'ai_documents_legacy_source_generation_key'
        and constraint_record.contype = 'u'
        and constraint_record.conkey = v_expected_columns
        and constraint_record.convalidated
        and coalesce(
          (to_jsonb(constraint_record)->>'conenforced')::boolean,
          true
        )
        and not constraint_record.condeferrable
        and not constraint_record.condeferred
        and coalesce(
          (to_jsonb(constraint_record)->>'conparentid')::oid,
          0
        ) = 0
        and backing_index.indisunique
        and backing_index.indisvalid
        and backing_index.indisready
        and backing_index.indimmediate
        and not coalesce(
          (to_jsonb(backing_index)->>'indnullsnotdistinct')::boolean,
          false
        )
        and coalesce(
          (to_jsonb(backing_index)->>'indnkeyatts')::integer,
          backing_index.indnatts
        ) = 3
        and backing_index.indnatts = 3
        and backing_index.indexprs is null
        and backing_index.indpred is null
    ) <> 1
  then
    raise exception 'Legacy source generation uniqueness contract is invalid';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_documents'
      and column_name = 'tombstone_correlation_id'
      and data_type = 'uuid'
  ) then
    raise exception 'Tombstone correlation audit column is missing';
  end if;

  select lower(pg_get_functiondef(
    'public.enforce_v1_shadow_revision_privacy_review()'::regprocedure
  )) into v_revision_trigger;
  if strpos(
       v_revision_trigger,
       'v_document.schema_version <> ''2026-08-09.v1-shadow'''
     ) = 0
    or strpos(v_revision_trigger, 'return new;') = 0
    or strpos(v_revision_trigger, 'perform public.assert_v1_shadow_note_facts(') = 0
    or strpos(v_revision_trigger, 'return new;')
      > strpos(v_revision_trigger, 'perform public.assert_v1_shadow_note_facts(')
  then
    raise exception 'Legacy NDIS revision bypass moved behind Note validator';
  end if;
end
$$;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '71000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'v1-shadow-sql-a@example.invalid',
    'test-only-no-login',
    now(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'v1-shadow-sql-b@example.invalid',
    'test-only-no-login',
    now(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

do $$
begin
  begin
    insert into public.ai_documents (
      id,
      owner_user_id,
      note_type,
      source_locale,
      lifecycle_status,
      schema_version,
      contract_version
    ) values (
      '79000000-0000-4000-8000-000000000019',
      '72000000-0000-4000-8000-000000000002',
      'ndis',
      'en',
      'IN_PROGRESS',
      'legacy.generated_material_drafts.ndis_case_note.v1',
      '1.0.0-shadow.1'
    );
    raise exception 'active legacy document without source identity was accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into public.generated_material_drafts (
  id,
  user_id,
  feature,
  status,
  content,
  created_at,
  updated_at
) values (
  'ndis-case-note-shadow-sql-a',
  '71000000-0000-4000-8000-000000000001',
  'ndis_case_note',
  'draft',
  '{
    "englishCaseNoteDraft":"Synthetic observable statement one.",
    "chineseReviewVersion":"Synthetic review one.",
    "missingFacts":[],
    "neutralWordingChecks":[],
    "followUpPrompts":[],
    "disclaimer":"Draft for review."
  }'::jsonb,
  '2026-08-09T01:00:00Z',
  '2026-08-09T01:00:00Z'
);

do $$
declare
  first_result jsonb;
  replay_result jsonb;
  unchanged_result jsonb;
  edit_result jsonb;
  revert_result jsonb;
  historical_result jsonb;
  regressed_result jsonb;
  stale_result jsonb;
  failed_result jsonb;
  match_result jsonb;
  match_replay_result jsonb;
  mismatch_result jsonb;
  v_document_id uuid;
  first_revision uuid;
  second_revision uuid;
  third_revision uuid;
  current_revision uuid;
begin
  first_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'draft',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:00:00Z',
    repeat('a', 64),
    repeat('b', 64),
    'ndis.shadow.sql.first.0001',
    '73000000-0000-4000-8000-000000000003',
    '{
      "englishDraft":"Synthetic observable statement one.",
      "reviewVersions":{"zh-Hans":"Synthetic review one."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    null
  );

  if first_result ->> 'status' is distinct from 'PROJECTED'
     or (first_result ->> 'revisionNumber')::integer is distinct from 1 then
    raise exception 'first projection contract failed';
  end if;

  first_revision := (first_result ->> 'revisionId')::uuid;
  v_document_id := (first_result ->> 'documentId')::uuid;

  replay_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'draft',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:00:00Z',
    repeat('a', 64),
    repeat('b', 64),
    'ndis.shadow.sql.first.0001',
    '73000000-0000-4000-8000-000000000004',
    '{
      "englishDraft":"Synthetic observable statement one.",
      "reviewVersions":{"zh-Hans":"Synthetic review one."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    null
  );

  if replay_result ->> 'status' is distinct from 'REPLAYED' then
    raise exception 'same request replay contract failed';
  end if;

  update public.generated_material_drafts
  set status = 'reviewed',
      updated_at = '2026-08-09T01:02:00Z'
  where id = 'ndis-case-note-shadow-sql-a';

  unchanged_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'reviewed',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:02:00Z',
    repeat('a', 64),
    repeat('b', 64),
    'ndis.shadow.sql.20260809T010200.reviewed.0002',
    '73000000-0000-4000-8000-000000000005',
    '{
      "englishDraft":"Synthetic observable statement one.",
      "reviewVersions":{"zh-Hans":"Synthetic review one."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    null
  );

  if unchanged_result ->> 'status' is distinct from 'UNCHANGED'
     or (unchanged_result ->> 'revisionId')::uuid is distinct from first_revision then
    raise exception 'same content metadata update contract failed';
  end if;

  if not exists (
    select 1
    from public.ndis_shadow_document_links
    where source_draft_id = 'ndis-case-note-shadow-sql-a'
      and owner_user_id = '71000000-0000-4000-8000-000000000001'
      and source_status = 'reviewed'
      and source_updated_at = '2026-08-09T01:02:00Z'
      and source_content_hash = repeat('a', 64)
  ) then
    raise exception 'same content metadata was not advanced';
  end if;

  update public.generated_material_drafts
  set content = jsonb_set(content, '{englishCaseNoteDraft}', '"Synthetic observable statement two."'),
      updated_at = '2026-08-09T01:05:00Z'
  where id = 'ndis-case-note-shadow-sql-a';

  edit_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'reviewed',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:05:00Z',
    repeat('c', 64),
    repeat('b', 64),
    'ndis.shadow.sql.20260809T010500.reviewed.0003',
    '73000000-0000-4000-8000-000000000006',
    '{
      "englishDraft":"Synthetic observable statement two.",
      "reviewVersions":{"zh-Hans":"Synthetic review two."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    null
  );

  if edit_result ->> 'status' is distinct from 'PROJECTED'
     or (edit_result ->> 'revisionNumber')::integer is distinct from 2 then
    raise exception 'new content revision contract failed';
  end if;

  second_revision := (edit_result ->> 'revisionId')::uuid;

  update public.generated_material_drafts
  set content = jsonb_set(
        jsonb_set(
          content,
          '{englishCaseNoteDraft}',
          '"Synthetic observable statement one."'
        ),
        '{chineseReviewVersion}',
        '"Synthetic review one."'
      ),
      updated_at = '2026-08-09T01:10:00Z'
  where id = 'ndis-case-note-shadow-sql-a';

  revert_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'reviewed',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:10:00Z',
    repeat('a', 64),
    repeat('b', 64),
    'ndis.shadow.sql.20260809T011000.reviewed.revert.0004',
    '73000000-0000-4000-8000-000000000007',
    '{
      "englishDraft":"Synthetic observable statement one.",
      "reviewVersions":{"zh-Hans":"Synthetic review one."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    second_revision
  );

  if revert_result ->> 'status' is distinct from 'PROJECTED'
     or (revert_result ->> 'revisionNumber')::integer is distinct from 3 then
    raise exception 'A-B-A projection contract failed';
  end if;

  third_revision := (revert_result ->> 'revisionId')::uuid;
  current_revision := third_revision;

  if not exists (
    select 1
    from public.ai_document_revisions
    where id = third_revision
      and document_id = v_document_id
      and owner_user_id = '71000000-0000-4000-8000-000000000001'
      and revision_number = 3
      and base_revision_id = second_revision
      and content_hash = repeat('a', 64)
  ) then
    raise exception 'A-B-A revision chain contract failed';
  end if;

  historical_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'reviewed',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:10:00Z',
    repeat('a', 64),
    repeat('b', 64),
    'ndis.shadow.sql.first.0001',
    '73000000-0000-4000-8000-000000000008',
    '{
      "englishDraft":"Synthetic observable statement one.",
      "reviewVersions":{"zh-Hans":"Synthetic review one."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    null
  );

  if historical_result ->> 'status' is distinct from 'STALE'
     or historical_result ->> 'failureCode' is distinct from 'HISTORICAL_REPLAY'
     or (historical_result ->> 'revisionId')::uuid is distinct from third_revision then
    raise exception 'historical replay was not rejected';
  end if;

  update public.generated_material_drafts
  set content = jsonb_set(content, '{englishCaseNoteDraft}', '"Synthetic regressed statement."'),
      updated_at = '2026-08-09T01:09:00Z'
  where id = 'ndis-case-note-shadow-sql-a';

  regressed_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'reviewed',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:09:00Z',
    repeat('c', 64),
    repeat('b', 64),
    'ndis.shadow.sql.20260809T010900.reviewed.regressed.0005',
    '73000000-0000-4000-8000-000000000009',
    '{
      "englishDraft":"Synthetic regressed statement.",
      "reviewVersions":{"zh-Hans":"Synthetic regressed review."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    null
  );

  if regressed_result ->> 'status' is distinct from 'STALE'
     or regressed_result ->> 'failureCode' is distinct from 'STALE_SOURCE_VERSION'
     or (regressed_result ->> 'revisionId')::uuid is distinct from third_revision then
    raise exception 'regressed source version was not rejected';
  end if;

  update public.generated_material_drafts
  set content = jsonb_set(content, '{englishCaseNoteDraft}', '"Synthetic stale statement."'),
      updated_at = '2026-08-09T01:15:00Z'
  where id = 'ndis-case-note-shadow-sql-a';

  stale_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'reviewed',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:15:00Z',
    repeat('d', 64),
    repeat('b', 64),
    'ndis.shadow.sql.20260809T011500.reviewed.stale.0006',
    '73000000-0000-4000-8000-000000000010',
    '{
      "englishDraft":"Synthetic stale statement.",
      "reviewVersions":{"zh-Hans":"Synthetic stale review."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    first_revision
  );

  if stale_result ->> 'status' is distinct from 'STALE'
     or stale_result ->> 'failureCode' is distinct from 'STALE_REVISION'
     or (stale_result ->> 'revisionId')::uuid is distinct from current_revision then
    raise exception 'stale base revision contract failed';
  end if;

  update public.generated_material_drafts
  set updated_at = '2026-08-09T01:20:00Z'
  where id = 'ndis-case-note-shadow-sql-a';

  failed_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'reviewed',
    '2026-08-09T01:00:00Z',
    '2026-08-09T01:20:00Z',
    repeat('e', 64),
    repeat('b', 64),
    'ndis.shadow.sql.20260809T012000.reviewed.failure.0007',
    '73000000-0000-4000-8000-000000000011',
    '{}'::jsonb,
    null
  );

  if failed_result ->> 'status' is distinct from 'FAILED' then
    raise exception 'failure evidence contract failed';
  end if;

  match_result := public.compare_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    repeat('a', 64),
    '73000000-0000-4000-8000-000000000012'
  );

  match_replay_result := public.compare_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    repeat('a', 64),
    '73000000-0000-4000-8000-000000000012'
  );

  if match_replay_result <> match_result then
    raise exception 'comparison correlation replay did not return stored evidence';
  end if;

  begin
    perform public.compare_ndis_legacy_shadow(
      '71000000-0000-4000-8000-000000000001',
      'ndis-case-note-shadow-sql-a',
      repeat('f', 64),
      '73000000-0000-4000-8000-000000000012'
    );
    raise exception 'comparison correlation conflict unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  mismatch_result := public.compare_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    repeat('f', 64),
    '73000000-0000-4000-8000-000000000013'
  );

  if match_result ->> 'status' is distinct from 'MATCH'
     or mismatch_result ->> 'status' is distinct from 'MISMATCH' then
    raise exception 'shadow read comparison contract failed';
  end if;

  if (select count(*) from public.ai_document_revisions
      where owner_user_id = '71000000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'unexpected revision count';
  end if;

  if not exists (
    select 1
    from public.ai_documents
    where id = v_document_id
      and owner_user_id = '71000000-0000-4000-8000-000000000001'
      and legacy_source_draft_id = 'ndis-case-note-shadow-sql-a'
      and legacy_source_owner_user_id = '71000000-0000-4000-8000-000000000001'
      and current_revision_id = third_revision
      and current_revision_number = 3
  ) then
    raise exception 'canonical legacy source metadata contract failed';
  end if;

  if exists (
    select 1 from public.ai_documents
    where owner_user_id = '71000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'cross-owner canonical row created';
  end if;

  begin
    perform public.compare_ndis_legacy_shadow(
      '72000000-0000-4000-8000-000000000002',
      'ndis-case-note-shadow-sql-a',
      repeat('a', 64),
      '73000000-0000-4000-8000-000000000014'
    );
    raise exception 'cross-owner comparison unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  if (select count(*) from public.point_wallets) <> 0
     or (select count(*) from public.point_ledger_entries) <> 0 then
    raise exception 'Points shadow was unexpectedly activated';
  end if;
end;
$$;

do $$
declare
  tombstone_result jsonb;
  tombstone_replay_result jsonb;
  missing_result jsonb;
  purged_result jsonb;
  new_generation_result jsonb;
  v_document_id uuid;
  v_new_document_id uuid;
  v_tombstoned_at timestamptz;
  v_tombstone_updated_at timestamptz;
  v_tombstone_correlation_id uuid;
  v_purged_before public.ai_documents%rowtype;
  v_purged_after public.ai_documents%rowtype;
begin
  insert into public.ai_documents (
    id,
    owner_user_id,
    legacy_source_draft_id,
    legacy_source_owner_user_id,
    note_type,
    source_locale,
    lifecycle_status,
    schema_version,
    contract_version,
    tombstoned_at,
    purged_at,
    tombstone_correlation_id,
    created_at,
    updated_at
  ) values (
    '7c000000-0000-4000-8000-000000000030',
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-purged',
    '71000000-0000-4000-8000-000000000001',
    'ndis',
    'en',
    'PURGED',
    'legacy.generated_material_drafts.ndis_case_note.v1',
    '1.0.0-shadow.1',
    '2026-08-09T05:10:00Z',
    '2026-08-09T05:15:00Z',
    '73000000-0000-4000-8000-000000000019',
    '2026-08-09T05:00:00Z',
    '2026-08-09T05:15:00Z'
  );

  select * into strict v_purged_before
  from public.ai_documents
  where id = '7c000000-0000-4000-8000-000000000030';

  purged_result := public.tombstone_deleted_ndis_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-purged',
    '2026-08-09T05:00:00Z',
    '73000000-0000-4000-8000-000000000020'
  );

  select * into strict v_purged_after
  from public.ai_documents
  where id = '7c000000-0000-4000-8000-000000000030';

  if purged_result ->> 'status' is distinct from 'MISSING'
     or (purged_result ->> 'tombstonedCount')::integer is distinct from 0
     or to_jsonb(v_purged_after) is distinct from to_jsonb(v_purged_before) then
    raise exception 'PURGED tombstone replay changed terminal audit evidence';
  end if;

  select id into strict v_document_id
  from public.ai_documents
  where legacy_source_draft_id = 'ndis-case-note-shadow-sql-a'
    and legacy_source_owner_user_id = '71000000-0000-4000-8000-000000000001'
    and created_at = '2026-08-09T01:00:00Z';

  delete from public.generated_material_drafts
  where id = 'ndis-case-note-shadow-sql-a'
    and user_id = '71000000-0000-4000-8000-000000000001';

  if exists (
    select 1 from public.ndis_shadow_document_links
    where source_draft_id = 'ndis-case-note-shadow-sql-a'
  ) or exists (
    select 1 from public.ndis_shadow_write_outbox
    where source_draft_id = 'ndis-case-note-shadow-sql-a'
  ) or exists (
    select 1 from public.ndis_shadow_read_comparisons
    where source_draft_id = 'ndis-case-note-shadow-sql-a'
  ) then
    raise exception 'legacy delete did not clear ephemeral shadow metadata';
  end if;

  -- Reuse of the source id is a distinct generation. It must not prevent the
  -- retained old generation from being tombstoned by its creation identity.
  insert into public.generated_material_drafts (
    id,
    user_id,
    feature,
    status,
    content,
    created_at,
    updated_at
  ) values (
    'ndis-case-note-shadow-sql-a',
    '71000000-0000-4000-8000-000000000001',
    'ndis_case_note',
    'draft',
    '{
      "englishCaseNoteDraft":"Synthetic replacement generation.",
      "chineseReviewVersion":"Synthetic replacement review.",
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    '2026-08-09T03:00:00Z',
    '2026-08-09T03:05:00Z'
  );

  tombstone_result := public.tombstone_deleted_ndis_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    '2026-08-09T01:00:00Z',
    '73000000-0000-4000-8000-000000000015'
  );

  select tombstoned_at, updated_at, tombstone_correlation_id
  into strict v_tombstoned_at, v_tombstone_updated_at,
              v_tombstone_correlation_id
  from public.ai_documents
  where id = v_document_id;

  tombstone_replay_result := public.tombstone_deleted_ndis_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    '2026-08-09T01:00:00Z',
    '73000000-0000-4000-8000-000000000016'
  );

  missing_result := public.tombstone_deleted_ndis_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    '2026-08-09T04:00:00Z',
    '73000000-0000-4000-8000-000000000017'
  );

  if tombstone_result ->> 'status' is distinct from 'TOMBSTONED'
     or (tombstone_result ->> 'tombstonedCount')::integer is distinct from 1
     or tombstone_replay_result ->> 'status' is distinct from 'TOMBSTONED'
     or (tombstone_replay_result ->> 'tombstonedCount')::integer is distinct from 0
     or missing_result ->> 'status' is distinct from 'MISSING'
     or (missing_result ->> 'tombstonedCount')::integer is distinct from 0 then
    raise exception 'deleted source tombstone contract failed';
  end if;

  if not exists (
    select 1
    from public.ai_documents
    where id = v_document_id
      and lifecycle_status = 'TOMBSTONED'
      and tombstoned_at is not null
      and tombstone_correlation_id = '73000000-0000-4000-8000-000000000015'
  ) or (select count(*) from public.ai_document_revisions
        where document_id = v_document_id) <> 3
     or not exists (
       select 1 from public.document_checkpoints
       where document_id = v_document_id
     ) then
    raise exception 'canonical tombstone audit record was not retained';
  end if;

  if v_tombstone_correlation_id <> '73000000-0000-4000-8000-000000000015'
     or exists (
       select 1
       from public.ai_documents
       where id = v_document_id
         and (
           tombstoned_at is distinct from v_tombstoned_at
           or updated_at is distinct from v_tombstone_updated_at
           or tombstone_correlation_id is distinct from v_tombstone_correlation_id
         )
     ) then
    raise exception 'tombstone replay mutated retained audit evidence';
  end if;

  new_generation_result := public.project_ndis_legacy_shadow(
    '71000000-0000-4000-8000-000000000001',
    'ndis-case-note-shadow-sql-a',
    'draft',
    '2026-08-09T03:00:00Z',
    '2026-08-09T03:05:00Z',
    repeat('9', 64),
    repeat('8', 64),
    'ndis.shadow.sql.20260809T030500.draft.0008',
    '73000000-0000-4000-8000-000000000018',
    '{
      "englishDraft":"Synthetic replacement generation.",
      "reviewVersions":{"zh-Hans":"Synthetic replacement review."},
      "factsSummary":{},
      "missingFacts":[],
      "neutralWordingChecks":[],
      "followUpPrompts":[],
      "disclaimer":"Draft for review."
    }'::jsonb,
    null
  );

  if new_generation_result ->> 'status' is distinct from 'PROJECTED'
     or (new_generation_result ->> 'revisionNumber')::integer is distinct from 1 then
    raise exception 'replacement source generation was not projected';
  end if;

  v_new_document_id := (new_generation_result ->> 'documentId')::uuid;

  if v_new_document_id = v_document_id
     or (select count(*) from public.ai_documents
         where owner_user_id = '71000000-0000-4000-8000-000000000001'
           and legacy_source_draft_id = 'ndis-case-note-shadow-sql-a') <> 2
     or not exists (
       select 1
       from public.ai_documents
       where id = v_new_document_id
         and created_at = '2026-08-09T03:00:00Z'
         and lifecycle_status = 'IN_PROGRESS'
         and tombstone_correlation_id is null
     )
     or (select count(*) from public.ai_document_revisions
         where document_id = v_new_document_id) <> 1
     or not exists (
       select 1 from public.document_checkpoints
       where document_id = v_new_document_id
     )
     or not exists (
       select 1
       from public.ndis_shadow_document_links
       where source_draft_id = 'ndis-case-note-shadow-sql-a'
         and document_id = v_new_document_id
         and source_created_at = '2026-08-09T03:00:00Z'
     ) then
    raise exception 'legacy source generations were not isolated';
  end if;
end;
$$;

insert into public.ai_documents (
  id,
  owner_user_id,
  legacy_source_draft_id,
  legacy_source_owner_user_id,
  note_type,
  source_locale,
  lifecycle_status,
  schema_version,
  contract_version,
  created_at,
  updated_at
) values (
  '7c000000-0000-4000-8000-000000000020',
  '72000000-0000-4000-8000-000000000002',
  'ndis-case-note-delete-cleanup-pending',
  '72000000-0000-4000-8000-000000000002',
  'ndis',
  'en',
  'IN_PROGRESS',
  'legacy.generated_material_drafts.ndis_case_note.v1',
  '1.0.0-shadow.1',
  '2026-08-09T02:00:00Z',
  '2026-08-09T02:05:00Z'
);

do $$
declare
  cleanup_record record;
begin
  select * into strict cleanup_record
  from public.audit_ndis_shadow_reconciliation(
    '72000000-0000-4000-8000-000000000002',
    10
  )
  where "sourceDraftId" = 'ndis-case-note-delete-cleanup-pending';

  if cleanup_record.status <> 'FAILED'
     or cleanup_record."failureCode" <> 'SOURCE_DELETE_CLEANUP_PENDING'
     or cleanup_record."documentId" <> '7c000000-0000-4000-8000-000000000020'::uuid
     or cleanup_record."outboxStatus" is not null then
    raise exception 'pending delete cleanup reconciliation contract failed';
  end if;
end;
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '72000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

do $$
begin
  begin
    perform 1
    from public.ai_documents
    where id = '7c000000-0000-4000-8000-000000000020';
    raise exception 'Pending delete cleanup direct authenticated read unexpectedly succeeded';
  exception
    -- 42501 is insufficient_privilege: Mobile hardening removes the direct
    -- authenticated table grant instead of relying on an empty RLS result.
    when sqlstate '42501' then null;
  end;
end;
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

insert into public.ai_documents (
  id,
  owner_user_id,
  note_type,
  source_locale,
  lifecycle_status,
  schema_version,
  contract_version
) values (
  '74000000-0000-4000-8000-000000000018',
  '71000000-0000-4000-8000-000000000001',
  'communication',
  'en',
  'IN_PROGRESS',
  'test.non-legacy.v1',
  'test.1'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

do $$
begin
  begin
    perform 1 from public.ai_documents;
    raise exception 'ai_documents direct authenticated read unexpectedly succeeded';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform 1 from public.ai_document_revisions;
    raise exception 'ai_document_revisions direct authenticated read unexpectedly succeeded';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform 1 from public.document_checkpoints;
    raise exception 'document_checkpoints direct authenticated read unexpectedly succeeded';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    perform public.project_ndis_legacy_shadow(
      null::uuid,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::uuid,
      null::jsonb,
      null::uuid
    );
    raise exception 'authenticated projection unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.compare_ndis_legacy_shadow(
      null::uuid,
      null::text,
      null::text,
      null::uuid
    );
    raise exception 'authenticated comparison unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.audit_ndis_shadow_reconciliation(null::uuid, 1);
    raise exception 'authenticated reconciliation unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.tombstone_deleted_ndis_shadow(
      null::uuid,
      null::text,
      null::timestamptz,
      null::uuid
    );
    raise exception 'authenticated tombstone unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.role', 'service_role', true);
end;
$$;

rollback;
