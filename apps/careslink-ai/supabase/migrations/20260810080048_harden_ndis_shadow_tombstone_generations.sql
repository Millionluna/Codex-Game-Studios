-- Forward-only hardening after the recorded NDIS shadow repair chain.
-- A legacy draft id may be reused only as a new creation generation; retained
-- tombstones stay immutable audit records and never block that new generation.

begin;

alter table public.ai_documents
  add column if not exists tombstone_correlation_id uuid;

alter table public.ai_documents
  drop constraint if exists ai_documents_legacy_source_key;

do $$
begin
  alter table public.ai_documents
    add constraint ai_documents_legacy_source_generation_key
    unique (
      legacy_source_owner_user_id,
      legacy_source_draft_id,
      created_at
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  if to_regprocedure(
    'public.tombstone_deleted_ndis_shadow(uuid,text,uuid)'
  ) is not null then
    execute 'revoke all on function public.tombstone_deleted_ndis_shadow(uuid, text, uuid) from public, anon, authenticated, service_role';
  end if;
end
$$;

drop function if exists public.tombstone_deleted_ndis_shadow(
  uuid, text, uuid
);

create or replace function public.tombstone_deleted_ndis_shadow(
  p_owner_user_id uuid,
  p_source_draft_id text,
  p_source_created_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.ai_documents%rowtype;
  v_tombstoned_count integer;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'NDIS shadow tombstone is unavailable';
  end if;

  if p_owner_user_id is null
     or nullif(btrim(p_source_draft_id), '') is null
     or p_source_created_at is null
     or p_correlation_id is null then
    raise exception using errcode = '22023', message = 'NDIS shadow tombstone metadata is invalid';
  end if;

  -- Match the projection lock so delete cleanup and any replacement
  -- generation remain serialized for one owner/source id.
  perform pg_advisory_xact_lock(
    hashtextextended(p_owner_user_id::text || ':' || p_source_draft_id, 0)
  );

  select * into v_document
  from public.ai_documents
  where owner_user_id = p_owner_user_id
    and legacy_source_owner_user_id = p_owner_user_id
    and legacy_source_draft_id = p_source_draft_id
    and created_at = p_source_created_at
    and schema_version = 'legacy.generated_material_drafts.ndis_case_note.v1'
    and note_type = 'ndis'
  for update;

  if not found or v_document.lifecycle_status = 'PURGED' then
    return jsonb_build_object(
      'status', 'MISSING',
      'tombstonedCount', 0
    );
  end if;

  if v_document.lifecycle_status = 'TOMBSTONED' then
    return jsonb_build_object(
      'status', 'TOMBSTONED',
      'tombstonedCount', 0
    );
  end if;

  if exists (
    select 1
    from public.generated_material_drafts
    where id = p_source_draft_id
      and user_id = p_owner_user_id
      and feature = 'ndis_case_note'
      and created_at = p_source_created_at
  ) then
    raise exception using
      errcode = '55000',
      message = 'NDIS shadow source still exists';
  end if;

  v_now := now();

  update public.ai_documents
  set lifecycle_status = 'TOMBSTONED',
      tombstoned_at = coalesce(tombstoned_at, v_now),
      tombstone_correlation_id = p_correlation_id,
      updated_at = greatest(updated_at, v_now)
  where id = v_document.id
    and owner_user_id = p_owner_user_id
    and legacy_source_owner_user_id = p_owner_user_id
    and legacy_source_draft_id = p_source_draft_id
    and created_at = p_source_created_at
    and lifecycle_status not in ('TOMBSTONED', 'PURGED');

  get diagnostics v_tombstoned_count = row_count;

  return jsonb_build_object(
    'status', case
      when v_tombstoned_count = 1 then 'TOMBSTONED'
      else 'MISSING'
    end,
    'tombstonedCount', v_tombstoned_count
  );
end;
$$;

revoke all on function public.tombstone_deleted_ndis_shadow(
  uuid, text, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.tombstone_deleted_ndis_shadow(
  uuid, text, timestamptz, uuid
) to service_role;

commit;
