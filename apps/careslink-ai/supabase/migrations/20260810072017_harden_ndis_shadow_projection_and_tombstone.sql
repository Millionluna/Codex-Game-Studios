-- Forward hardening for branches that recorded the earlier NDIS integration
-- migration before source CAS and correlation replay protections were added.
-- This migration is additive, idempotent after a clean apply, and does not
-- activate or mutate legacy credits or shadow Points.

begin;

alter table public.ai_documents
  add column if not exists legacy_source_draft_id text,
  add column if not exists legacy_source_owner_user_id uuid;

do $$
begin
  alter table public.ai_documents
    add constraint ai_documents_legacy_source_pair_check
    check (
      (
        legacy_source_draft_id is null
        and legacy_source_owner_user_id is null
      )
      or (
        legacy_source_draft_id is not null
        and legacy_source_owner_user_id is not null
        and note_type = 'ndis'
        and owner_user_id = legacy_source_owner_user_id
      )
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.ai_documents
    add constraint ai_documents_legacy_source_key
    unique (
      legacy_source_draft_id,
      legacy_source_owner_user_id
    );
exception
  when duplicate_object then null;
end
$$;

-- A deleted legacy source must immediately disappear from the owner's
-- canonical read surface. The retained canonical row remains available only
-- to service-role audit and a later, separately approved purge workflow.
drop policy if exists ai_documents_owner_select on public.ai_documents;
create policy ai_documents_owner_select on public.ai_documents
  for select to authenticated
  using (
    (select auth.uid()) = owner_user_id
    and (
      legacy_source_draft_id is null
      or exists (
        select 1
        from public.generated_material_drafts as source
        where source.id = ai_documents.legacy_source_draft_id
          and source.user_id = ai_documents.legacy_source_owner_user_id
          and source.feature = 'ndis_case_note'
          and source.created_at = ai_documents.created_at
      )
    )
  );

drop policy if exists ai_document_revisions_owner_select
  on public.ai_document_revisions;
create policy ai_document_revisions_owner_select
  on public.ai_document_revisions
  for select to authenticated
  using (
    (select auth.uid()) = owner_user_id
    and exists (
      select 1
      from public.ai_documents as document
      where document.id = ai_document_revisions.document_id
        and document.owner_user_id = ai_document_revisions.owner_user_id
    )
  );

drop policy if exists document_checkpoints_owner_select
  on public.document_checkpoints;
create policy document_checkpoints_owner_select
  on public.document_checkpoints
  for select to authenticated
  using (
    (select auth.uid()) = owner_user_id
    and exists (
      select 1
      from public.ai_documents as document
      where document.id = document_checkpoints.document_id
        and document.owner_user_id = document_checkpoints.owner_user_id
    )
  );

-- TODO(points-activation): keep all Point RPC and table behavior unchanged
-- until the separately approved Points activation gate.

create or replace function public.project_ndis_legacy_shadow(
  p_owner_user_id uuid,
  p_source_draft_id text,
  p_source_status text,
  p_source_created_at timestamptz,
  p_source_updated_at timestamptz,
  p_source_content_hash text,
  p_privacy_fingerprint text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_content jsonb,
  p_expected_base_revision_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.generated_material_drafts%rowtype;
  v_outbox public.ndis_shadow_write_outbox%rowtype;
  v_link public.ndis_shadow_document_links%rowtype;
  v_document public.ai_documents%rowtype;
  v_document_id uuid;
  v_revision_id uuid;
  v_revision_number integer;
  v_checkpoint_mutation_id text;
  v_link_found boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'NDIS shadow projection is unavailable';
  end if;

  if p_owner_user_id is null
     or nullif(btrim(p_source_draft_id), '') is null
     or p_source_status is null
     or p_source_status not in ('draft', 'reviewed', 'archived')
     or p_source_content_hash is null
     or p_source_content_hash !~ '^[a-f0-9]{64}$'
     or p_privacy_fingerprint is null
     or p_privacy_fingerprint !~ '^[a-f0-9]{64}$'
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,95}$'
     or p_correlation_id is null
     or p_source_created_at is null
     or p_source_updated_at is null
     or p_source_updated_at < p_source_created_at then
    raise exception using errcode = '22023', message = 'NDIS shadow metadata is invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_owner_user_id::text || ':' || p_source_draft_id, 0)
  );

  select * into v_source
  from public.generated_material_drafts
  where id = p_source_draft_id
    and user_id = p_owner_user_id
    and feature = 'ndis_case_note'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'NDIS shadow source is unavailable';
  end if;

  if v_source.status <> p_source_status
     or v_source.created_at <> p_source_created_at
     or v_source.updated_at <> p_source_updated_at then
    raise exception using errcode = '40001', message = 'NDIS shadow source changed before projection';
  end if;

  insert into public.ndis_shadow_write_outbox (
    owner_user_id,
    source_draft_id,
    source_content_hash,
    privacy_fingerprint,
    idempotency_key,
    correlation_id
  ) values (
    p_owner_user_id,
    p_source_draft_id,
    p_source_content_hash,
    p_privacy_fingerprint,
    p_idempotency_key,
    p_correlation_id
  )
  on conflict (owner_user_id, idempotency_key) do nothing;

  select * into v_outbox
  from public.ndis_shadow_write_outbox
  where owner_user_id = p_owner_user_id
    and idempotency_key = p_idempotency_key
  for update;

  if v_outbox.source_draft_id <> p_source_draft_id
     or v_outbox.source_content_hash <> p_source_content_hash
     or v_outbox.privacy_fingerprint <> p_privacy_fingerprint then
    raise exception using errcode = '23505', message = 'NDIS shadow idempotency conflict';
  end if;

  select * into v_link
  from public.ndis_shadow_document_links
  where source_draft_id = p_source_draft_id
  for update;

  v_link_found := found;

  if v_link_found and v_link.owner_user_id <> p_owner_user_id then
    raise exception using errcode = '42501', message = 'NDIS shadow source is unavailable';
  end if;

  if v_outbox.status = 'PROJECTED'
     and v_link_found
     and v_outbox.document_id = v_link.document_id
     and v_outbox.revision_id = v_link.current_revision_id
     and v_link.source_content_hash = p_source_content_hash
     and v_link.source_status = p_source_status
     and v_link.source_created_at = p_source_created_at
     and v_link.source_updated_at = p_source_updated_at then
    return jsonb_build_object(
      'status', 'REPLAYED',
      'documentId', v_outbox.document_id,
      'revisionId', v_outbox.revision_id,
      'revisionNumber', (
        select revision_number
        from public.ai_document_revisions
        where id = v_outbox.revision_id
          and document_id = v_outbox.document_id
          and owner_user_id = p_owner_user_id
      ),
      'sourceContentHash', p_source_content_hash
    );
  end if;

  if v_outbox.status = 'PROJECTED' then
    return jsonb_build_object(
      'status', 'STALE',
      'documentId', case when v_link_found then v_link.document_id else null end,
      'revisionId', case when v_link_found then v_link.current_revision_id else null end,
      'revisionNumber', case
        when v_link_found then (
          select revision_number
          from public.ai_document_revisions
          where id = v_link.current_revision_id
            and document_id = v_link.document_id
            and owner_user_id = p_owner_user_id
        )
        else null
      end,
      'sourceContentHash', p_source_content_hash,
      'failureCode', 'HISTORICAL_REPLAY'
    );
  end if;

  update public.ndis_shadow_write_outbox
  set status = 'PENDING',
      failure_code = null,
      correlation_id = p_correlation_id,
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = v_outbox.id;

  begin
    if jsonb_typeof(p_content) <> 'object'
       or nullif(btrim(p_content ->> 'englishDraft'), '') is null
       or nullif(btrim(p_content ->> 'disclaimer'), '') is null
       or coalesce(jsonb_typeof(p_content -> 'reviewVersions'), '') <> 'object'
       or coalesce(jsonb_typeof(p_content -> 'factsSummary'), '') <> 'object'
       or coalesce(jsonb_typeof(p_content -> 'missingFacts'), '') <> 'array'
       or coalesce(jsonb_typeof(p_content -> 'neutralWordingChecks'), '') <> 'array'
       or coalesce(jsonb_typeof(p_content -> 'followUpPrompts'), '') <> 'array' then
      raise exception using errcode = '22023', message = 'Canonical shadow content is invalid';
    end if;

    if v_link_found and (
      v_link.source_created_at is distinct from p_source_created_at
      or p_source_updated_at < v_link.source_updated_at
      or (
        p_source_updated_at = v_link.source_updated_at
        and (
          v_link.source_status is distinct from p_source_status
          or v_link.source_content_hash is distinct from p_source_content_hash
        )
      )
    ) then
      update public.ndis_shadow_write_outbox
      set status = 'STALE',
          failure_code = 'STALE_SOURCE_VERSION',
          document_id = v_link.document_id,
          revision_id = v_link.current_revision_id,
          updated_at = now()
      where id = v_outbox.id;

      return jsonb_build_object(
        'status', 'STALE',
        'documentId', v_link.document_id,
        'revisionId', v_link.current_revision_id,
        'revisionNumber', (
          select revision_number
          from public.ai_document_revisions
          where id = v_link.current_revision_id
            and document_id = v_link.document_id
            and owner_user_id = p_owner_user_id
        ),
        'sourceContentHash', p_source_content_hash,
        'failureCode', 'STALE_SOURCE_VERSION'
      );
    end if;

    if v_link_found and p_expected_base_revision_id is not null
       and v_link.current_revision_id <> p_expected_base_revision_id then
      update public.ndis_shadow_write_outbox
      set status = 'STALE',
          failure_code = 'STALE_REVISION',
          document_id = v_link.document_id,
          revision_id = v_link.current_revision_id,
          updated_at = now()
      where id = v_outbox.id;

      return jsonb_build_object(
        'status', 'STALE',
        'documentId', v_link.document_id,
        'revisionId', v_link.current_revision_id,
        'revisionNumber', (
          select revision_number
          from public.ai_document_revisions
          where id = v_link.current_revision_id
            and document_id = v_link.document_id
            and owner_user_id = p_owner_user_id
        ),
        'sourceContentHash', p_source_content_hash,
        'failureCode', 'STALE_REVISION'
      );
    end if;

    if v_link_found and v_link.source_content_hash = p_source_content_hash then
      update public.ndis_shadow_document_links
      set privacy_fingerprint = p_privacy_fingerprint,
          source_status = p_source_status,
          source_updated_at = p_source_updated_at,
          updated_at = now()
      where source_draft_id = p_source_draft_id
        and owner_user_id = p_owner_user_id;

      update public.ai_documents
      set updated_at = p_source_updated_at
      where id = v_link.document_id
        and owner_user_id = p_owner_user_id;

      update public.document_checkpoints
      set updated_at = p_source_updated_at
      where document_id = v_link.document_id
        and owner_user_id = p_owner_user_id;

      update public.ndis_shadow_write_outbox
      set status = 'PROJECTED',
          failure_code = null,
          document_id = v_link.document_id,
          revision_id = v_link.current_revision_id,
          updated_at = now()
      where id = v_outbox.id;

      return jsonb_build_object(
        'status', 'UNCHANGED',
        'documentId', v_link.document_id,
        'revisionId', v_link.current_revision_id,
        'revisionNumber', (
          select revision_number
          from public.ai_document_revisions
          where id = v_link.current_revision_id
            and document_id = v_link.document_id
            and owner_user_id = p_owner_user_id
        ),
        'sourceContentHash', p_source_content_hash
      );
    end if;

    if not v_link_found then
      v_document_id := gen_random_uuid();
      v_revision_id := gen_random_uuid();
      v_revision_number := 1;

      insert into public.ai_documents (
        id,
        owner_user_id,
        legacy_source_draft_id,
        legacy_source_owner_user_id,
        note_type,
        source_locale,
        lifecycle_status,
        current_revision_number,
        schema_version,
        contract_version,
        created_at,
        updated_at
      ) values (
        v_document_id,
        p_owner_user_id,
        p_source_draft_id,
        p_owner_user_id,
        'ndis',
        'en',
        'IN_PROGRESS',
        0,
        'legacy.generated_material_drafts.ndis_case_note.v1',
        '1.0.0-shadow.1',
        p_source_created_at,
        p_source_updated_at
      );

      insert into public.ai_document_revisions (
        id,
        document_id,
        owner_user_id,
        revision_number,
        content,
        content_hash,
        mutation_id,
        schema_version,
        contract_version,
        created_at
      ) values (
        v_revision_id,
        v_document_id,
        p_owner_user_id,
        v_revision_number,
        p_content,
        p_source_content_hash,
        p_idempotency_key,
        'legacy.generated_material_drafts.ndis_case_note.v1',
        '1.0.0-shadow.1',
        p_source_updated_at
      );

      update public.ai_documents
      set current_revision_id = v_revision_id,
          current_revision_number = v_revision_number,
          updated_at = p_source_updated_at
      where id = v_document_id
        and owner_user_id = p_owner_user_id;

      insert into public.ndis_shadow_document_links (
        source_draft_id,
        owner_user_id,
        document_id,
        current_revision_id,
        source_content_hash,
        privacy_fingerprint,
        source_status,
        source_created_at,
        source_updated_at
      ) values (
        p_source_draft_id,
        p_owner_user_id,
        v_document_id,
        v_revision_id,
        p_source_content_hash,
        p_privacy_fingerprint,
        p_source_status,
        p_source_created_at,
        p_source_updated_at
      );
    else
      select * into v_document
      from public.ai_documents
      where id = v_link.document_id
        and owner_user_id = p_owner_user_id
      for update;

      if not found
         or v_document.lifecycle_status in ('TOMBSTONED', 'PURGED')
         or v_document.legacy_source_draft_id is distinct from p_source_draft_id
         or v_document.legacy_source_owner_user_id is distinct from p_owner_user_id then
        raise exception using errcode = '55000', message = 'Canonical shadow document is not writable';
      end if;

      v_document_id := v_link.document_id;
      v_revision_id := gen_random_uuid();
      v_revision_number := v_document.current_revision_number + 1;

      insert into public.ai_document_revisions (
        id,
        document_id,
        owner_user_id,
        revision_number,
        base_revision_id,
        content,
        content_hash,
        mutation_id,
        schema_version,
        contract_version,
        created_at
      ) values (
        v_revision_id,
        v_document_id,
        p_owner_user_id,
        v_revision_number,
        v_document.current_revision_id,
        p_content,
        p_source_content_hash,
        p_idempotency_key,
        'legacy.generated_material_drafts.ndis_case_note.v1',
        '1.0.0-shadow.1',
        p_source_updated_at
      );

      update public.ai_documents
      set lifecycle_status = 'IN_PROGRESS',
          current_revision_id = v_revision_id,
          current_revision_number = v_revision_number,
          updated_at = p_source_updated_at
      where id = v_document_id
        and owner_user_id = p_owner_user_id;

      update public.ndis_shadow_document_links
      set current_revision_id = v_revision_id,
          source_content_hash = p_source_content_hash,
          privacy_fingerprint = p_privacy_fingerprint,
          source_status = p_source_status,
          source_updated_at = p_source_updated_at,
          updated_at = now()
      where source_draft_id = p_source_draft_id
        and owner_user_id = p_owner_user_id;
    end if;

    v_checkpoint_mutation_id := p_idempotency_key || '.checkpoint';

    insert into public.document_checkpoints (
      document_id,
      owner_user_id,
      current_step,
      completed_field_codes,
      active_revision_id,
      sync_status,
      mutation_id,
      updated_at
    ) values (
      v_document_id,
      p_owner_user_id,
      'result_review',
      '{}'::text[],
      v_revision_id,
      'SERVER_ACKNOWLEDGED',
      v_checkpoint_mutation_id,
      p_source_updated_at
    )
    on conflict (document_id) do update
    set current_step = excluded.current_step,
        active_revision_id = excluded.active_revision_id,
        sync_status = excluded.sync_status,
        mutation_id = excluded.mutation_id,
        updated_at = excluded.updated_at
    where public.document_checkpoints.owner_user_id = excluded.owner_user_id;

    update public.ndis_shadow_write_outbox
    set status = 'PROJECTED',
        failure_code = null,
        document_id = v_document_id,
        revision_id = v_revision_id,
        updated_at = now()
    where id = v_outbox.id;

    return jsonb_build_object(
      'status', 'PROJECTED',
      'documentId', v_document_id,
      'revisionId', v_revision_id,
      'revisionNumber', v_revision_number,
      'sourceContentHash', p_source_content_hash
    );
  exception
    when others then
      update public.ndis_shadow_write_outbox
      set status = 'FAILED',
          failure_code = 'SHADOW_WRITE_FAILED',
          document_id = null,
          revision_id = null,
          updated_at = now()
      where id = v_outbox.id;

      return jsonb_build_object(
        'status', 'FAILED',
        'sourceContentHash', p_source_content_hash,
        'failureCode', 'SHADOW_WRITE_FAILED'
      );
  end;
end;
$$;

create or replace function public.compare_ndis_legacy_shadow(
  p_owner_user_id uuid,
  p_source_draft_id text,
  p_expected_content_hash text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_exists boolean;
  v_link public.ndis_shadow_document_links%rowtype;
  v_existing public.ndis_shadow_read_comparisons%rowtype;
  v_actual_content_hash text;
  v_result text;
  v_failure_code text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'NDIS shadow comparison is unavailable';
  end if;

  if p_owner_user_id is null
     or nullif(btrim(p_source_draft_id), '') is null
     or p_expected_content_hash is null
     or p_expected_content_hash !~ '^[a-f0-9]{64}$'
     or p_correlation_id is null then
    raise exception using errcode = '22023', message = 'NDIS shadow comparison metadata is invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_owner_user_id::text || ':comparison:' || p_correlation_id::text,
      0
    )
  );

  select * into v_existing
  from public.ndis_shadow_read_comparisons
  where owner_user_id = p_owner_user_id
    and correlation_id = p_correlation_id
  for update;

  if found then
    if v_existing.source_draft_id <> p_source_draft_id
       or v_existing.expected_content_hash <> p_expected_content_hash then
      raise exception using
        errcode = '23505',
        message = 'NDIS shadow comparison correlation conflict';
    end if;

    return jsonb_build_object(
      'status', v_existing.result,
      'documentId', v_existing.document_id,
      'revisionId', v_existing.revision_id,
      'expectedContentHash', v_existing.expected_content_hash,
      'actualContentHash', v_existing.actual_content_hash,
      'failureCode', v_existing.failure_code
    );
  end if;

  select exists (
    select 1
    from public.generated_material_drafts
    where id = p_source_draft_id
      and user_id = p_owner_user_id
      and feature = 'ndis_case_note'
  ) into v_source_exists;

  if not v_source_exists then
    raise exception using errcode = '42501', message = 'NDIS shadow source is unavailable';
  end if;

  select * into v_link
  from public.ndis_shadow_document_links
  where source_draft_id = p_source_draft_id
    and owner_user_id = p_owner_user_id;

  if not found then
    v_result := 'MISSING';
    v_failure_code := 'SHADOW_MAPPING_MISSING';
  else
    select content_hash into v_actual_content_hash
    from public.ai_document_revisions
    where id = v_link.current_revision_id
      and document_id = v_link.document_id
      and owner_user_id = p_owner_user_id;

    if not found then
      v_result := 'ERROR';
      v_failure_code := 'SHADOW_REVISION_MISSING';
    elsif v_actual_content_hash = p_expected_content_hash
          and v_link.source_content_hash = p_expected_content_hash then
      v_result := 'MATCH';
    else
      v_result := 'MISMATCH';
      v_failure_code := 'SHADOW_CONTENT_MISMATCH';
    end if;
  end if;

  insert into public.ndis_shadow_read_comparisons (
    owner_user_id,
    source_draft_id,
    document_id,
    revision_id,
    correlation_id,
    result,
    expected_content_hash,
    actual_content_hash,
    failure_code
  ) values (
    p_owner_user_id,
    p_source_draft_id,
    v_link.document_id,
    v_link.current_revision_id,
    p_correlation_id,
    v_result,
    p_expected_content_hash,
    v_actual_content_hash,
    v_failure_code
  );

  return jsonb_build_object(
    'status', v_result,
    'documentId', v_link.document_id,
    'revisionId', v_link.current_revision_id,
    'expectedContentHash', p_expected_content_hash,
    'actualContentHash', v_actual_content_hash,
    'failureCode', v_failure_code
  );
end;
$$;


create or replace function public.tombstone_deleted_ndis_shadow(
  p_owner_user_id uuid,
  p_source_draft_id text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tombstoned_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'NDIS shadow tombstone is unavailable';
  end if;

  if p_owner_user_id is null
     or nullif(btrim(p_source_draft_id), '') is null
     or p_correlation_id is null then
    raise exception using errcode = '22023', message = 'NDIS shadow tombstone metadata is invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_owner_user_id::text || ':' || p_source_draft_id, 0)
  );

  if exists (
    select 1
    from public.generated_material_drafts
    where id = p_source_draft_id
      and user_id = p_owner_user_id
      and feature = 'ndis_case_note'
  ) then
    raise exception using
      errcode = '55000',
      message = 'NDIS shadow source still exists';
  end if;

  update public.ai_documents
  set lifecycle_status = 'TOMBSTONED',
      tombstoned_at = coalesce(tombstoned_at, now()),
      updated_at = greatest(updated_at, now())
  where legacy_source_draft_id = p_source_draft_id
    and legacy_source_owner_user_id = p_owner_user_id
    and note_type = 'ndis'
    and lifecycle_status <> 'PURGED';

  get diagnostics v_tombstoned_count = row_count;

  return jsonb_build_object(
    'status', case
      when v_tombstoned_count > 0 then 'TOMBSTONED'
      else 'MISSING'
    end,
    'tombstonedCount', v_tombstoned_count
  );
end;
$$;

revoke all on function public.project_ndis_legacy_shadow(
  uuid, text, text, timestamptz, timestamptz, text, text, text, uuid, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.compare_ndis_legacy_shadow(
  uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.tombstone_deleted_ndis_shadow(
  uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.project_ndis_legacy_shadow(
  uuid, text, text, timestamptz, timestamptz, text, text, text, uuid, jsonb, uuid
) to service_role;
grant execute on function public.compare_ndis_legacy_shadow(
  uuid, text, text, uuid
) to service_role;
grant execute on function public.tombstone_deleted_ndis_shadow(
  uuid, text, uuid
) to service_role;

commit;
