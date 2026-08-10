-- Preserve PURGED as the terminal lifecycle when the preceding identity
-- repair encounters a historical legacy row whose source has disappeared.
-- purged_at is authoritative evidence that the row must never be downgraded.

begin;

update public.ai_documents as document
set lifecycle_status = 'PURGED',
    tombstoned_at = coalesce(document.tombstoned_at, document.purged_at, now()),
    updated_at = greatest(document.updated_at, document.purged_at, now())
where document.schema_version = 'legacy.generated_material_drafts.ndis_case_note.v1'
  and document.purged_at is not null
  and document.lifecycle_status <> 'PURGED';

commit;
