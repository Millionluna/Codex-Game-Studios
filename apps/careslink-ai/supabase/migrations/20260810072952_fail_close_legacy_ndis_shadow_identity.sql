-- Forward-only repair for branches that may already contain canonical NDIS
-- rows created before legacy source identity was stored on ai_documents.
-- Existing link metadata is backfilled; unidentifiable or source-missing rows
-- are retained as service-auditable tombstones and fail closed to owner reads.

begin;

alter table public.ai_documents
  add column if not exists legacy_source_draft_id text,
  add column if not exists legacy_source_owner_user_id uuid;

update public.ai_documents as document
set legacy_source_draft_id = link.source_draft_id,
    legacy_source_owner_user_id = link.owner_user_id
from public.ndis_shadow_document_links as link
where document.id = link.document_id
  and document.owner_user_id = link.owner_user_id
  and document.schema_version = 'legacy.generated_material_drafts.ndis_case_note.v1'
  and document.legacy_source_draft_id is null
  and document.legacy_source_owner_user_id is null;

update public.ai_documents as document
set lifecycle_status = 'TOMBSTONED',
    tombstoned_at = coalesce(document.tombstoned_at, now()),
    updated_at = greatest(document.updated_at, now())
where document.schema_version = 'legacy.generated_material_drafts.ndis_case_note.v1'
  and not exists (
    select 1
    from public.generated_material_drafts as source
    where source.id = document.legacy_source_draft_id
      and source.user_id = document.legacy_source_owner_user_id
      and source.feature = 'ndis_case_note'
      and source.created_at = document.created_at
  );

alter table public.ai_documents
  drop constraint if exists ai_documents_legacy_source_pair_check;

alter table public.ai_documents
  add constraint ai_documents_legacy_source_pair_check
  check (
    (
      schema_version <> 'legacy.generated_material_drafts.ndis_case_note.v1'
      and legacy_source_draft_id is null
      and legacy_source_owner_user_id is null
    )
    or (
      schema_version = 'legacy.generated_material_drafts.ndis_case_note.v1'
      and note_type = 'ndis'
      and legacy_source_draft_id is not null
      and legacy_source_owner_user_id is not null
      and owner_user_id = legacy_source_owner_user_id
    )
    or (
      schema_version = 'legacy.generated_material_drafts.ndis_case_note.v1'
      and note_type = 'ndis'
      and legacy_source_draft_id is null
      and legacy_source_owner_user_id is null
      and lifecycle_status in ('TOMBSTONED', 'PURGED')
    )
  );

drop policy if exists ai_documents_owner_select on public.ai_documents;
create policy ai_documents_owner_select on public.ai_documents
  for select to authenticated
  using (
    (select auth.uid()) = owner_user_id
    and (
      schema_version <> 'legacy.generated_material_drafts.ndis_case_note.v1'
      or (
        legacy_source_draft_id is not null
        and legacy_source_owner_user_id is not null
        and lifecycle_status not in ('TOMBSTONED', 'PURGED')
        and exists (
          select 1
          from public.generated_material_drafts as source
          where source.id = ai_documents.legacy_source_draft_id
            and source.user_id = ai_documents.legacy_source_owner_user_id
            and source.feature = 'ndis_case_note'
            and source.created_at = ai_documents.created_at
        )
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

commit;
