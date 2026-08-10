-- Preview-only NDIS legacy -> canonical shadow integration foundation.
--
-- This migration is additive. It performs no backfill and does not make the
-- canonical model, Points, or shadow comparison a product source of truth.

begin;

do $$
begin
  alter table public.generated_material_drafts
    add constraint generated_material_drafts_id_user_id_key
    unique (id, user_id);
exception
  when duplicate_object then null;
end
$$;

alter table public.ai_documents
  add column if not exists legacy_source_draft_id text,
  add column if not exists legacy_source_owner_user_id uuid,
  add column if not exists tombstone_correlation_id uuid;

do $$
begin
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
exception
  when duplicate_object then null;
end
$$;

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

-- Source metadata deliberately has no cascading foreign key. Legacy deletion
-- must remain reversible: owner reads fail closed immediately, while a
-- service-role RPC tombstones the retained canonical audit record.

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

create table if not exists public.ndis_shadow_document_links (
  source_draft_id text primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  current_revision_id uuid not null,
  source_content_hash text not null check (source_content_hash ~ '^[a-f0-9]{64}$'),
  privacy_fingerprint text not null check (privacy_fingerprint ~ '^[a-f0-9]{64}$'),
  source_status text not null check (source_status in ('draft', 'reviewed', 'archived')),
  source_created_at timestamptz not null,
  source_updated_at timestamptz not null,
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_draft_id, owner_user_id)
    references public.generated_material_drafts(id, user_id) on delete cascade,
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (current_revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  unique (document_id, owner_user_id)
);

create index if not exists ndis_shadow_links_owner_updated_idx
  on public.ndis_shadow_document_links(owner_user_id, updated_at desc);

create table if not exists public.ndis_shadow_write_outbox (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_draft_id text not null,
  source_content_hash text not null check (source_content_hash ~ '^[a-f0-9]{64}$'),
  privacy_fingerprint text not null check (privacy_fingerprint ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,95}$'),
  correlation_id uuid not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROJECTED', 'STALE', 'FAILED')),
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  document_id uuid,
  revision_id uuid,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_draft_id, owner_user_id)
    references public.generated_material_drafts(id, user_id) on delete cascade,
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  unique (owner_user_id, idempotency_key),
  constraint ndis_shadow_outbox_target_shape_check check (
    revision_id is null or document_id is not null
  )
);

create index if not exists ndis_shadow_outbox_status_updated_idx
  on public.ndis_shadow_write_outbox(status, updated_at)
  where status in ('PENDING', 'STALE', 'FAILED');

create index if not exists ndis_shadow_outbox_owner_source_idx
  on public.ndis_shadow_write_outbox(owner_user_id, source_draft_id, updated_at desc);

create table if not exists public.ndis_shadow_read_comparisons (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_draft_id text not null,
  document_id uuid,
  revision_id uuid,
  correlation_id uuid not null,
  result text not null check (result in ('MATCH', 'MISMATCH', 'MISSING', 'ERROR')),
  expected_content_hash text not null check (expected_content_hash ~ '^[a-f0-9]{64}$'),
  actual_content_hash text check (actual_content_hash is null or actual_content_hash ~ '^[a-f0-9]{64}$'),
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  foreign key (source_draft_id, owner_user_id)
    references public.generated_material_drafts(id, user_id) on delete cascade,
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  unique (owner_user_id, correlation_id),
  constraint ndis_shadow_comparison_target_shape_check check (
    revision_id is null or document_id is not null
  )
);

create index if not exists ndis_shadow_comparison_owner_created_idx
  on public.ndis_shadow_read_comparisons(owner_user_id, created_at desc);

alter table public.ndis_shadow_document_links enable row level security;
alter table public.ndis_shadow_write_outbox enable row level security;
alter table public.ndis_shadow_read_comparisons enable row level security;

revoke all on public.ndis_shadow_document_links from public, anon, authenticated, service_role;
revoke all on public.ndis_shadow_write_outbox from public, anon, authenticated, service_role;
revoke all on public.ndis_shadow_read_comparisons from public, anon, authenticated, service_role;

grant select on public.ndis_shadow_document_links to service_role;
grant select on public.ndis_shadow_write_outbox to service_role;
grant select on public.ndis_shadow_read_comparisons to service_role;

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

revoke all on function public.project_ndis_legacy_shadow(
  uuid, text, text, timestamptz, timestamptz, text, text, text, uuid, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.compare_ndis_legacy_shadow(
  uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.tombstone_deleted_ndis_shadow(
  uuid, text, timestamptz, uuid
) from public, anon, authenticated;
revoke all on function public.audit_ndis_shadow_reconciliation(
  uuid, integer
) from public, anon, authenticated;

grant execute on function public.project_ndis_legacy_shadow(
  uuid, text, text, timestamptz, timestamptz, text, text, text, uuid, jsonb, uuid
) to service_role;
grant execute on function public.compare_ndis_legacy_shadow(
  uuid, text, text, uuid
) to service_role;
grant execute on function public.tombstone_deleted_ndis_shadow(
  uuid, text, timestamptz, uuid
) to service_role;
grant execute on function public.audit_ndis_shadow_reconciliation(
  uuid, integer
) to service_role;

commit;
