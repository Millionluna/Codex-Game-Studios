-- Surface legacy deletes whose fail-safe tombstone call timed out or failed.
-- The canonical body remains owner-hidden by RLS; this RPC exposes metadata
-- only so an operator can retry cleanup without relying solely on logs.

begin;

create or replace function public.audit_ndis_shadow_reconciliation(
  p_owner_user_id uuid default null,
  p_limit integer default 100
)
returns table (
  "ownerUserId" uuid,
  "sourceDraftId" text,
  "sourceUpdatedAt" timestamptz,
  status text,
  "outboxStatus" text,
  "failureCode" text,
  "documentId" uuid,
  "revisionId" uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'NDIS shadow reconciliation is unavailable';
  end if;

  return query
  with candidates (
    owner_user_id,
    source_draft_id,
    source_updated_at,
    reconciliation_status,
    outbox_status,
    failure_code,
    document_id,
    revision_id
  ) as (
    select
      source.user_id,
      source.id,
      source.updated_at,
      case
        when link.source_draft_id is null then 'MISSING'
        when latest.status in ('FAILED', 'STALE') then 'FAILED'
        when link.source_updated_at < source.updated_at then 'STALE'
        else 'CURRENT'
      end,
      latest.status,
      latest.failure_code,
      link.document_id,
      link.current_revision_id
    from public.generated_material_drafts source
    left join public.ndis_shadow_document_links link
      on link.source_draft_id = source.id
     and link.owner_user_id = source.user_id
    left join lateral (
      select outbox.status, outbox.failure_code
      from public.ndis_shadow_write_outbox outbox
      where outbox.source_draft_id = source.id
        and outbox.owner_user_id = source.user_id
      order by outbox.updated_at desc
      limit 1
    ) latest on true
    where source.feature = 'ndis_case_note'
      and (p_owner_user_id is null or source.user_id = p_owner_user_id)

    union all

    select
      document.owner_user_id,
      document.legacy_source_draft_id,
      document.updated_at,
      'FAILED'::text,
      null::text,
      'SOURCE_DELETE_CLEANUP_PENDING'::text,
      document.id,
      document.current_revision_id
    from public.ai_documents document
    where document.schema_version = 'legacy.generated_material_drafts.ndis_case_note.v1'
      and document.legacy_source_draft_id is not null
      and document.legacy_source_owner_user_id = document.owner_user_id
      and document.lifecycle_status not in ('TOMBSTONED', 'PURGED')
      and (p_owner_user_id is null or document.owner_user_id = p_owner_user_id)
      and not exists (
        select 1
        from public.generated_material_drafts source
        where source.id = document.legacy_source_draft_id
          and source.user_id = document.legacy_source_owner_user_id
          and source.feature = 'ndis_case_note'
          and source.created_at = document.created_at
      )
  )
  select
    candidate.owner_user_id,
    candidate.source_draft_id,
    candidate.source_updated_at,
    candidate.reconciliation_status,
    candidate.outbox_status,
    candidate.failure_code,
    candidate.document_id,
    candidate.revision_id
  from candidates candidate
  order by candidate.source_updated_at asc, candidate.source_draft_id asc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.audit_ndis_shadow_reconciliation(
  uuid, integer
) from public, anon, authenticated;

grant execute on function public.audit_ndis_shadow_reconciliation(
  uuid, integer
) to service_role;

commit;
