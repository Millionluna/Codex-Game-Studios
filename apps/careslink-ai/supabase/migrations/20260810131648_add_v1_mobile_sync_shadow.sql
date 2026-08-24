begin;

-- Production-unapplied Mobile/Web sync shadow. This migration is additive to
-- the V1 foundation and performs no activation, legacy backfill, Points
-- cutover, or Production write. Every RPC is additionally gated by a database
-- flag that is inserted disabled.

create extension if not exists pgcrypto with schema extensions;

-- Cross-runtime canonical JSON used by both the TypeScript transport and
-- PostgreSQL integrity check:
--   * object keys sort by their UTF-8 bytes;
--   * arrays preserve order;
--   * strings/booleans/null use their compact JSON representation;
--   * numbers use PostgreSQL jsonb's normalized, non-exponent decimal text.
-- TypeScript expands JSON.stringify exponent notation before hashing so the
-- same JSON value produces the same UTF-8 byte stream in both runtimes.
create or replace function public.v1_shadow_canonical_json(p_value jsonb)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_result text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(string_agg(
        to_jsonb(entry.key)::text || ':' ||
          public.v1_shadow_canonical_json(entry.value),
        ',' order by convert_to(entry.key, 'UTF8')
      ), '') || '}'
      into v_result
      from jsonb_each(p_value) as entry;
      return v_result;
    when 'array' then
      select '[' || coalesce(string_agg(
        public.v1_shadow_canonical_json(item.value),
        ',' order by item.ordinality
      ), '') || ']'
      into v_result
      from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
      return v_result;
    when 'number' then
      return trim_scale((p_value #>> '{}')::numeric)::text;
    else
      return p_value::text;
  end case;
end;
$$;

create or replace function public.v1_shadow_content_sha256(p_content jsonb)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(public.v1_shadow_canonical_json(p_content), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

revoke all on function public.v1_shadow_canonical_json(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.v1_shadow_content_sha256(jsonb)
  from public, anon, authenticated, service_role;

create table public.v1_mobile_sync_shadow_flags (
  feature_key text primary key
    check (feature_key = 'mobile_sync_v1'),
  enabled boolean not null default false,
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.v1_mobile_sync_shadow_flags (feature_key, enabled, shadow_only)
values ('mobile_sync_v1', false, true);

create table public.ai_document_sync_changes (
  change_id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  change_kind text not null
    check (change_kind in ('DOCUMENT_UPSERTED', 'DOCUMENT_TOMBSTONED')),
  document_id uuid not null,
  revision_id uuid,
  last_mutation_id text not null
    check (last_mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  server_time timestamptz not null default now(),
  deleted_at timestamptz,
  shadow_only boolean not null default true check (shadow_only),
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  unique (owner_user_id, last_mutation_id),
  unique (change_id, owner_user_id),
  constraint ai_document_sync_changes_shape_check check (
    (change_kind = 'DOCUMENT_UPSERTED' and revision_id is not null and deleted_at is null)
    or (change_kind = 'DOCUMENT_TOMBSTONED' and deleted_at is not null)
  )
);

create index if not exists ai_document_sync_changes_owner_cursor_idx
  on public.ai_document_sync_changes(owner_user_id, change_id);

create table public.ai_document_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id text not null
    check (mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  mutation_kind text not null check (
    mutation_kind in (
      'CREATE_DOCUMENT',
      'APPEND_REVISION',
      'SAVE_CHECKPOINT',
      'TOMBSTONE_DOCUMENT'
    )
  ),
  request_fingerprint jsonb not null
    check (jsonb_typeof(request_fingerprint) = 'object'),
  document_id uuid not null,
  revision_id uuid,
  change_id bigint not null,
  acknowledgement jsonb not null
    check (jsonb_typeof(acknowledgement) = 'object'),
  server_time timestamptz not null,
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  foreign key (change_id, owner_user_id)
    references public.ai_document_sync_changes(change_id, owner_user_id)
    on delete cascade,
  unique (owner_user_id, mutation_id)
);

create index if not exists ai_document_mutation_receipts_owner_created_idx
  on public.ai_document_mutation_receipts(owner_user_id, created_at desc);

-- Document UUID is the database-only list cursor payload. The HTTP adapter
-- wraps it as document.v1:<uuid> and rejects unwrapped client input.
create index if not exists ai_documents_owner_cursor_list_idx
  on public.ai_documents(owner_user_id, id);

alter table public.document_checkpoints
  add column if not exists base_revision_id uuid;

alter table public.document_checkpoints
  add constraint document_checkpoints_base_revision_fk
  foreign key (base_revision_id, document_id, owner_user_id)
  references public.ai_document_revisions(id, document_id, owner_user_id)
  on delete restrict;

alter table public.document_checkpoints
  drop constraint if exists document_checkpoints_current_step_check;
alter table public.document_checkpoints
  add constraint document_checkpoints_current_step_check
  check (current_step ~ '^[a-z][a-z0-9_.-]{0,63}$');

alter table public.v1_mobile_sync_shadow_flags enable row level security;
alter table public.ai_document_sync_changes enable row level security;
alter table public.ai_document_mutation_receipts enable row level security;

revoke all on public.v1_mobile_sync_shadow_flags
  from public, anon, authenticated, service_role;
revoke all on public.ai_document_sync_changes
  from public, anon, authenticated, service_role;
revoke all on public.ai_document_mutation_receipts
  from public, anon, authenticated, service_role;

grant select on public.ai_document_sync_changes to service_role;
grant select on public.ai_document_mutation_receipts to service_role;
grant select on public.v1_mobile_sync_shadow_flags to service_role;

-- A still-unexpired JWT whose auth.sessions row was revoked must not bypass
-- the session-validating RPC boundary through an owner RLS SELECT.
revoke select on public.ai_documents from authenticated;
revoke select on public.ai_document_revisions from authenticated;
revoke select on public.document_checkpoints from authenticated;
revoke select on public.self_review_events from authenticated;

create policy ai_document_sync_changes_owner_select
  on public.ai_document_sync_changes
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy ai_document_mutation_receipts_owner_select
  on public.ai_document_mutation_receipts
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);

-- This is the only RPC that accepts a caller-supplied owner. It is an internal
-- service-role auth dependency, not a Product API owner selector. Product data
-- RPCs below always derive their owner from auth.uid().
create or replace function public.resolve_v1_shadow_session_status(
  p_user_id uuid,
  p_session_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_user_id is null or p_session_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from auth.sessions
    where id = p_session_id and user_id = p_user_id
  ) then
    return 'ACTIVE';
  end if;

  return 'REVOKED';
end;
$$;

-- p_after_document_id is a database cursor payload. The HTTP adapter is
-- responsible for wrapping/unwrapping it as an opaque Web/App cursor.
create or replace function public.list_v1_shadow_documents(
  p_after_document_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_documents jsonb;
  v_next uuid;
  v_has_more boolean;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null or not exists (
    select 1 from auth.sessions
    where id = v_session_id and user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_after_document_id is not null and not exists (
    select 1
    from public.ai_documents as cursor_document
    where cursor_document.id = p_after_document_id
      and cursor_document.owner_user_id = v_owner
      and cursor_document.lifecycle_status <> 'PURGED'
      and cursor_document.contract_version = '1.0.0-shadow.1'
      and cursor_document.schema_version = '2026-08-09.v1-shadow'
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  with candidates as (
    select document.*
    from public.ai_documents as document
    where document.owner_user_id = v_owner
      and document.lifecycle_status <> 'PURGED'
      and document.contract_version = '1.0.0-shadow.1'
      and document.schema_version = '2026-08-09.v1-shadow'
      and (p_after_document_id is null or document.id > p_after_document_id)
    order by document.id
    limit p_limit + 1
  ), page as (
    select * from candidates
    order by id
    limit p_limit
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'canonicalId', id,
        'noteType', note_type,
        'sourceLocale', source_locale,
        'lifecycleStatus', lifecycle_status,
        'currentRevisionId', current_revision_id,
        'currentRevisionNumber', current_revision_number,
        'contractVersion', contract_version,
        'schemaVersion', schema_version,
        'createdAt', created_at,
        'updatedAt', updated_at,
        'deletedAt', tombstoned_at
      ) order by id
    ), '[]'::jsonb),
    (select id from page order by id desc limit 1),
    (select count(*) > p_limit from candidates)
  into v_documents, v_next, v_has_more
  from page;

  return jsonb_build_object(
    'documents', v_documents,
    'nextCursor', case when v_has_more then v_next::text else null end,
    'hasMore', v_has_more
  );
end;
$$;

create or replace function public.get_v1_shadow_document(
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_document public.ai_documents%rowtype;
  v_revisions jsonb;
  v_checkpoint jsonb;
  v_self_review_status text;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null or not exists (
    select 1 from auth.sessions
    where id = v_session_id and user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_document_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select * into v_document
  from public.ai_documents
  where id = p_document_id
    and owner_user_id = v_owner
    and lifecycle_status <> 'PURGED'
    and contract_version = '1.0.0-shadow.1'
    and schema_version = '2026-08-09.v1-shadow';
  if v_document.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'revisionId', revision.id,
      'canonicalId', revision.document_id,
      'revisionNumber', revision.revision_number,
      'baseRevisionId', revision.base_revision_id,
      'privacyReviewId', revision.privacy_review_id,
      'content', revision.content,
      'contentHash', revision.content_hash,
      'mutationId', revision.mutation_id,
      'contractVersion', revision.contract_version,
      'schemaVersion', revision.schema_version,
      'createdAt', revision.created_at
    ) order by revision.revision_number
  ), '[]'::jsonb)
  into v_revisions
  from public.ai_document_revisions as revision
  where revision.document_id = p_document_id
    and revision.owner_user_id = v_owner;

  select jsonb_build_object(
    'canonicalId', checkpoint.document_id,
    'baseRevisionId', checkpoint.base_revision_id,
    'currentStep', checkpoint.current_step,
    'completedFieldCodes', to_jsonb(checkpoint.completed_field_codes),
    'activeRevisionId', checkpoint.active_revision_id,
    'privacyReviewId', checkpoint.privacy_review_id,
    'generationJobId', checkpoint.generation_job_id,
    'syncStatus', checkpoint.sync_status,
    'mutationId', checkpoint.mutation_id,
    'updatedAt', checkpoint.updated_at
  )
  into v_checkpoint
  from public.document_checkpoints as checkpoint
  where checkpoint.document_id = p_document_id
    and checkpoint.owner_user_id = v_owner;

  select coalesce((
    select case review.event
      when 'CONFIRMED' then 'CONFIRMED'
      else 'REQUIRED'
    end
    from public.self_review_events as review
    where review.document_id = p_document_id
      and review.revision_id = v_document.current_revision_id
      and review.owner_user_id = v_owner
    order by review.created_at desc, review.id desc
    limit 1
  ), 'REQUIRED')
  into v_self_review_status;

  return jsonb_build_object(
    'document', jsonb_build_object(
      'canonicalId', v_document.id,
      'noteType', v_document.note_type,
      'sourceLocale', v_document.source_locale,
      'lifecycleStatus', v_document.lifecycle_status,
      'currentRevisionId', v_document.current_revision_id,
      'currentRevisionNumber', v_document.current_revision_number,
      'contractVersion', v_document.contract_version,
      'schemaVersion', v_document.schema_version,
      'createdAt', v_document.created_at,
      'updatedAt', v_document.updated_at,
      'deletedAt', v_document.tombstoned_at
    ),
    'revisions', v_revisions,
    'checkpoint', v_checkpoint,
    'selfReviewStatus', v_self_review_status
  );
end;
$$;

-- Write RPC acknowledgement JSON is the complete transport response DTO. A
-- receipt is inserted only after the canonical mutation and sync change exist.

create or replace function public.create_v1_shadow_document(
  p_note_type text,
  p_source_locale text,
  p_content jsonb,
  p_content_hash text,
  p_mutation_id text,
  p_schema_version text,
  p_contract_version text,
  p_privacy_review_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_document public.ai_documents%rowtype;
  v_revision public.ai_document_revisions%rowtype;
  v_receipt public.ai_document_mutation_receipts%rowtype;
  v_change_id bigint;
  v_server_time timestamptz := clock_timestamp();
  v_fingerprint jsonb;
  v_ack jsonb;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null or not exists (
    select 1 from auth.sessions
    where id = v_session_id and user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_note_type is null
    or p_note_type not in ('communication', 'handover', 'progress', 'ndis', 'incident_factual')
    or p_source_locale is null
    or p_source_locale not in ('en', 'zh-Hans', 'zh-Hant')
    or p_content is null or jsonb_typeof(p_content) <> 'object'
    or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_mutation_id is null
    or p_mutation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_schema_version is distinct from '2026-08-09.v1-shadow'
    or p_contract_version is distinct from '1.0.0-shadow.1'
  then
    raise exception using errcode = 'P0001', message = 'MIN_CLIENT_VERSION';
  end if;
  if p_content_hash is distinct from public.v1_shadow_content_sha256(p_content) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_privacy_review_id is null then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_mutation_id, 0));
  v_fingerprint := jsonb_build_object(
    'noteType', p_note_type,
    'sourceLocale', p_source_locale,
    'contentHash', p_content_hash,
    'schemaVersion', p_schema_version,
    'contractVersion', p_contract_version,
    'privacyReviewId', p_privacy_review_id
  );

  select * into v_receipt
  from public.ai_document_mutation_receipts
  where owner_user_id = v_owner and mutation_id = p_mutation_id;

  if v_receipt.id is not null then
    if v_receipt.mutation_kind <> 'CREATE_DOCUMENT'
      or v_receipt.request_fingerprint <> v_fingerprint
    then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    select * into v_revision
    from public.ai_document_revisions
    where id = v_receipt.revision_id and owner_user_id = v_owner;
    if v_revision.id is null or v_revision.content <> p_content then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.acknowledgement;
  end if;

  if p_privacy_review_id is not null and not exists (
    select 1 from public.privacy_reviews
    where id = p_privacy_review_id and owner_user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  insert into public.ai_documents (
    owner_user_id, note_type, source_locale, lifecycle_status,
    current_revision_number, schema_version, contract_version,
    shadow_only, created_at, updated_at
  ) values (
    v_owner, p_note_type, p_source_locale, 'IN_PROGRESS',
    0, p_schema_version, p_contract_version,
    true, v_server_time, v_server_time
  ) returning * into v_document;

  insert into public.ai_document_revisions (
    document_id, owner_user_id, revision_number, base_revision_id,
    privacy_review_id, content, content_hash, mutation_id, schema_version,
    contract_version, shadow_only, created_at
  ) values (
    v_document.id, v_owner, 1, null,
    p_privacy_review_id, p_content, p_content_hash, p_mutation_id, p_schema_version,
    p_contract_version, true, v_server_time
  ) returning * into v_revision;

  update public.ai_documents
  set current_revision_id = v_revision.id,
      current_revision_number = 1,
      updated_at = v_server_time
  where id = v_document.id and owner_user_id = v_owner
  returning * into v_document;

  insert into public.ai_document_sync_changes (
    owner_user_id, change_kind, document_id, revision_id,
    last_mutation_id, server_time, deleted_at, shadow_only
  ) values (
    v_owner, 'DOCUMENT_UPSERTED', v_document.id, v_revision.id,
    p_mutation_id, v_server_time, null, true
  ) returning change_id into v_change_id;

  v_ack := jsonb_build_object(
    'document', jsonb_build_object(
      'canonicalId', v_document.id,
      'noteType', v_document.note_type,
      'sourceLocale', v_document.source_locale,
      'lifecycleStatus', v_document.lifecycle_status,
      'currentRevisionId', v_document.current_revision_id,
      'currentRevisionNumber', v_document.current_revision_number,
      'contractVersion', v_document.contract_version,
      'schemaVersion', v_document.schema_version,
      'createdAt', v_document.created_at,
      'updatedAt', v_document.updated_at,
      'deletedAt', v_document.tombstoned_at
    ),
    'revision', jsonb_build_object(
      'revisionId', v_revision.id,
      'canonicalId', v_revision.document_id,
      'revisionNumber', v_revision.revision_number,
      'baseRevisionId', v_revision.base_revision_id,
      'privacyReviewId', v_revision.privacy_review_id,
      'content', v_revision.content,
      'contentHash', v_revision.content_hash,
      'mutationId', v_revision.mutation_id,
      'contractVersion', v_revision.contract_version,
      'schemaVersion', v_revision.schema_version,
      'createdAt', v_revision.created_at
    ),
    'saveState', 'SERVER_ACKNOWLEDGED',
    'lastMutationId', p_mutation_id,
    'serverTime', v_server_time
  );

  insert into public.ai_document_mutation_receipts (
    owner_user_id, mutation_id, mutation_kind, request_fingerprint,
    document_id, revision_id, change_id, acknowledgement,
    server_time, shadow_only, created_at
  ) values (
    v_owner, p_mutation_id, 'CREATE_DOCUMENT', v_fingerprint,
    v_document.id, v_revision.id, v_change_id, v_ack,
    v_server_time, true, v_server_time
  );

  return v_ack;
end;
$$;

create or replace function public.append_v1_shadow_document_revision(
  p_document_id uuid,
  p_base_revision_id uuid,
  p_content jsonb,
  p_content_hash text,
  p_mutation_id text,
  p_schema_version text,
  p_contract_version text,
  p_privacy_review_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_document public.ai_documents%rowtype;
  v_revision public.ai_document_revisions%rowtype;
  v_receipt public.ai_document_mutation_receipts%rowtype;
  v_change_id bigint;
  v_server_time timestamptz := clock_timestamp();
  v_fingerprint jsonb;
  v_ack jsonb;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null or not exists (
    select 1 from auth.sessions
    where id = v_session_id and user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_document_id is null or p_base_revision_id is null
    or p_content is null or jsonb_typeof(p_content) <> 'object'
    or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_mutation_id is null
    or p_mutation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_schema_version is distinct from '2026-08-09.v1-shadow'
    or p_contract_version is distinct from '1.0.0-shadow.1'
  then
    raise exception using errcode = 'P0001', message = 'MIN_CLIENT_VERSION';
  end if;
  if p_content_hash is distinct from public.v1_shadow_content_sha256(p_content) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_privacy_review_id is null then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_mutation_id, 0));
  v_fingerprint := jsonb_build_object(
    'canonicalId', p_document_id,
    'baseRevisionId', p_base_revision_id,
    'contentHash', p_content_hash,
    'schemaVersion', p_schema_version,
    'contractVersion', p_contract_version,
    'privacyReviewId', p_privacy_review_id
  );
  select * into v_receipt
  from public.ai_document_mutation_receipts
  where owner_user_id = v_owner and mutation_id = p_mutation_id;
  if v_receipt.id is not null then
    if v_receipt.mutation_kind <> 'APPEND_REVISION'
      or v_receipt.request_fingerprint <> v_fingerprint
    then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    select * into v_revision
    from public.ai_document_revisions
    where id = v_receipt.revision_id and owner_user_id = v_owner;
    if v_revision.id is null or v_revision.content <> p_content then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.acknowledgement;
  end if;

  select * into v_document
  from public.ai_documents
  where id = p_document_id
    and owner_user_id = v_owner
    and contract_version = '1.0.0-shadow.1'
    and schema_version = '2026-08-09.v1-shadow'
  for update;
  if v_document.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_document.lifecycle_status in ('TOMBSTONED', 'PURGED') then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE_TRANSITION';
  end if;
  if v_document.current_revision_id is distinct from p_base_revision_id then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_REVISION',
      detail = jsonb_build_object(
        'canonicalId', p_document_id,
        'currentRevisionId', v_document.current_revision_id,
        'currentRevisionNumber', v_document.current_revision_number
      )::text;
  end if;
  if p_privacy_review_id is not null and not exists (
    select 1 from public.privacy_reviews
    where id = p_privacy_review_id and owner_user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  insert into public.ai_document_revisions (
    document_id, owner_user_id, revision_number, base_revision_id,
    privacy_review_id, content, content_hash, mutation_id, schema_version,
    contract_version, shadow_only, created_at
  ) values (
    v_document.id, v_owner, v_document.current_revision_number + 1,
    p_base_revision_id, p_privacy_review_id, p_content, p_content_hash, p_mutation_id,
    p_schema_version, p_contract_version, true, v_server_time
  ) returning * into v_revision;

  update public.ai_documents
  set current_revision_id = v_revision.id,
      current_revision_number = v_revision.revision_number,
      schema_version = p_schema_version,
      contract_version = p_contract_version,
      updated_at = v_server_time
  where id = v_document.id and owner_user_id = v_owner
  returning * into v_document;

  insert into public.ai_document_sync_changes (
    owner_user_id, change_kind, document_id, revision_id,
    last_mutation_id, server_time, deleted_at, shadow_only
  ) values (
    v_owner, 'DOCUMENT_UPSERTED', v_document.id, v_revision.id,
    p_mutation_id, v_server_time, null, true
  ) returning change_id into v_change_id;

  v_ack := jsonb_build_object(
    'document', jsonb_build_object(
      'canonicalId', v_document.id,
      'noteType', v_document.note_type,
      'sourceLocale', v_document.source_locale,
      'lifecycleStatus', v_document.lifecycle_status,
      'currentRevisionId', v_document.current_revision_id,
      'currentRevisionNumber', v_document.current_revision_number,
      'contractVersion', v_document.contract_version,
      'schemaVersion', v_document.schema_version,
      'createdAt', v_document.created_at,
      'updatedAt', v_document.updated_at,
      'deletedAt', v_document.tombstoned_at
    ),
    'revision', jsonb_build_object(
      'revisionId', v_revision.id,
      'canonicalId', v_revision.document_id,
      'revisionNumber', v_revision.revision_number,
      'baseRevisionId', v_revision.base_revision_id,
      'privacyReviewId', v_revision.privacy_review_id,
      'content', v_revision.content,
      'contentHash', v_revision.content_hash,
      'mutationId', v_revision.mutation_id,
      'contractVersion', v_revision.contract_version,
      'schemaVersion', v_revision.schema_version,
      'createdAt', v_revision.created_at
    ),
    'saveState', 'SERVER_ACKNOWLEDGED',
    'lastMutationId', p_mutation_id,
    'serverTime', v_server_time
  );
  insert into public.ai_document_mutation_receipts (
    owner_user_id, mutation_id, mutation_kind, request_fingerprint,
    document_id, revision_id, change_id, acknowledgement,
    server_time, shadow_only, created_at
  ) values (
    v_owner, p_mutation_id, 'APPEND_REVISION', v_fingerprint,
    v_document.id, v_revision.id, v_change_id, v_ack,
    v_server_time, true, v_server_time
  );
  return v_ack;
end;
$$;

create or replace function public.save_v1_shadow_document_checkpoint(
  p_document_id uuid,
  p_base_revision_id uuid,
  p_current_step text,
  p_completed_field_codes text[],
  p_mutation_id text,
  p_active_revision_id uuid default null,
  p_privacy_review_id uuid default null,
  p_generation_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_document public.ai_documents%rowtype;
  v_checkpoint public.document_checkpoints%rowtype;
  v_receipt public.ai_document_mutation_receipts%rowtype;
  v_change_id bigint;
  v_server_time timestamptz := clock_timestamp();
  v_fingerprint jsonb;
  v_ack jsonb;
  v_active_revision_id uuid;
  v_completed_field_codes text[];
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null or not exists (
    select 1 from auth.sessions
    where id = v_session_id and user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_document_id is null or p_base_revision_id is null
    or p_current_step is null
    or p_current_step !~ '^[a-z][a-z0-9_.-]{0,63}$'
    or p_completed_field_codes is null
    or cardinality(p_completed_field_codes) > 256
    or array_position(p_completed_field_codes, null) is not null
    or exists (
      select 1 from unnest(p_completed_field_codes) as field_code
      where field_code !~ '^[a-z][a-z0-9_.-]{0,63}$'
    )
    or p_mutation_id is null
    or p_mutation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select coalesce(
    array_agg(
      distinct field_code collate "C"
      order by field_code collate "C"
    ),
    '{}'::text[]
  )
  into v_completed_field_codes
  from unnest(p_completed_field_codes) as field_code;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_mutation_id, 0));
  v_fingerprint := jsonb_build_object(
    'canonicalId', p_document_id,
    'baseRevisionId', p_base_revision_id,
    'activeRevisionId', p_active_revision_id,
    'currentStep', p_current_step,
    'completedFieldCodes', to_jsonb(p_completed_field_codes),
    'privacyReviewId', p_privacy_review_id,
    'generationJobId', p_generation_job_id
  );
  select * into v_receipt
  from public.ai_document_mutation_receipts
  where owner_user_id = v_owner and mutation_id = p_mutation_id;
  if v_receipt.id is not null then
    if v_receipt.mutation_kind <> 'SAVE_CHECKPOINT'
      or v_receipt.request_fingerprint <> v_fingerprint
    then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.acknowledgement;
  end if;

  select * into v_document
  from public.ai_documents
  where id = p_document_id
    and owner_user_id = v_owner
    and contract_version = '1.0.0-shadow.1'
    and schema_version = '2026-08-09.v1-shadow'
  for update;
  if v_document.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_document.lifecycle_status in ('TOMBSTONED', 'PURGED') then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE_TRANSITION';
  end if;
  if v_document.current_revision_id is distinct from p_base_revision_id then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_REVISION',
      detail = jsonb_build_object(
        'canonicalId', p_document_id,
        'currentRevisionId', v_document.current_revision_id,
        'currentRevisionNumber', v_document.current_revision_number
      )::text;
  end if;
  v_active_revision_id := coalesce(p_active_revision_id, p_base_revision_id);
  if not exists (
    select 1 from public.ai_document_revisions
    where id = v_active_revision_id
      and document_id = p_document_id
      and owner_user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if p_privacy_review_id is not null and not exists (
    select 1 from public.privacy_reviews
    where id = p_privacy_review_id and owner_user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if p_generation_job_id is not null and not exists (
    select 1 from public.generation_jobs
    where id = p_generation_job_id
      and document_id = p_document_id
      and owner_user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  insert into public.document_checkpoints (
    document_id, owner_user_id, base_revision_id, current_step,
    completed_field_codes, active_revision_id, privacy_review_id,
    generation_job_id, sync_status, mutation_id, updated_at
  ) values (
    p_document_id, v_owner, p_base_revision_id, p_current_step,
    v_completed_field_codes, v_active_revision_id, p_privacy_review_id,
    p_generation_job_id, 'SERVER_ACKNOWLEDGED', p_mutation_id, v_server_time
  )
  on conflict (document_id) do update
  set base_revision_id = excluded.base_revision_id,
      current_step = excluded.current_step,
      completed_field_codes = excluded.completed_field_codes,
      active_revision_id = excluded.active_revision_id,
      privacy_review_id = excluded.privacy_review_id,
      generation_job_id = excluded.generation_job_id,
      sync_status = 'SERVER_ACKNOWLEDGED',
      mutation_id = excluded.mutation_id,
      updated_at = excluded.updated_at
  where public.document_checkpoints.owner_user_id = v_owner
  returning * into v_checkpoint;

  update public.ai_documents
  set updated_at = v_server_time
  where id = p_document_id and owner_user_id = v_owner;

  insert into public.ai_document_sync_changes (
    owner_user_id, change_kind, document_id, revision_id,
    last_mutation_id, server_time, deleted_at, shadow_only
  ) values (
    v_owner, 'DOCUMENT_UPSERTED', p_document_id, v_document.current_revision_id,
    p_mutation_id, v_server_time, null, true
  ) returning change_id into v_change_id;

  v_ack := jsonb_build_object(
    'checkpoint', jsonb_build_object(
      'canonicalId', v_checkpoint.document_id,
      'baseRevisionId', v_checkpoint.base_revision_id,
      'currentStep', v_checkpoint.current_step,
      'completedFieldCodes', to_jsonb(v_checkpoint.completed_field_codes),
      'activeRevisionId', v_checkpoint.active_revision_id,
      'privacyReviewId', v_checkpoint.privacy_review_id,
      'generationJobId', v_checkpoint.generation_job_id,
      'syncStatus', v_checkpoint.sync_status,
      'mutationId', v_checkpoint.mutation_id,
      'updatedAt', v_checkpoint.updated_at
    ),
    'saveState', 'SERVER_ACKNOWLEDGED',
    'lastMutationId', p_mutation_id,
    'serverTime', v_server_time
  );
  insert into public.ai_document_mutation_receipts (
    owner_user_id, mutation_id, mutation_kind, request_fingerprint,
    document_id, revision_id, change_id, acknowledgement,
    server_time, shadow_only, created_at
  ) values (
    v_owner, p_mutation_id, 'SAVE_CHECKPOINT', v_fingerprint,
    p_document_id, v_active_revision_id, v_change_id, v_ack,
    v_server_time, true, v_server_time
  );
  return v_ack;
end;
$$;

create or replace function public.tombstone_v1_shadow_document(
  p_document_id uuid,
  p_base_revision_id uuid,
  p_reason_code text,
  p_mutation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_document public.ai_documents%rowtype;
  v_receipt public.ai_document_mutation_receipts%rowtype;
  v_change_id bigint;
  v_server_time timestamptz := clock_timestamp();
  v_fingerprint jsonb;
  v_ack jsonb;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null or not exists (
    select 1 from auth.sessions
    where id = v_session_id and user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_document_id is null or p_base_revision_id is null
    or (p_reason_code is not null and p_reason_code !~ '^[a-z][a-z0-9_.-]{0,63}$')
    or p_mutation_id is null
    or p_mutation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_mutation_id, 0));
  v_fingerprint := jsonb_build_object(
    'canonicalId', p_document_id,
    'baseRevisionId', p_base_revision_id,
    'reasonCode', p_reason_code
  );
  select * into v_receipt
  from public.ai_document_mutation_receipts
  where owner_user_id = v_owner and mutation_id = p_mutation_id;
  if v_receipt.id is not null then
    if v_receipt.mutation_kind <> 'TOMBSTONE_DOCUMENT'
      or v_receipt.request_fingerprint <> v_fingerprint
    then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.acknowledgement;
  end if;

  select * into v_document
  from public.ai_documents
  where id = p_document_id
    and owner_user_id = v_owner
    and contract_version = '1.0.0-shadow.1'
    and schema_version = '2026-08-09.v1-shadow'
  for update;
  if v_document.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_document.lifecycle_status = 'PURGED' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_document.lifecycle_status = 'TOMBSTONED' then
    raise exception using errcode = 'P0001', message = 'INVALID_STATE_TRANSITION';
  end if;
  if v_document.current_revision_id is distinct from p_base_revision_id then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_REVISION',
      detail = jsonb_build_object(
        'canonicalId', p_document_id,
        'currentRevisionId', v_document.current_revision_id,
        'currentRevisionNumber', v_document.current_revision_number
      )::text;
  end if;

  update public.ai_documents
  set lifecycle_status = 'TOMBSTONED',
      tombstoned_at = coalesce(tombstoned_at, v_server_time),
      updated_at = v_server_time
  where id = p_document_id and owner_user_id = v_owner
  returning * into v_document;

  insert into public.ai_document_sync_changes (
    owner_user_id, change_kind, document_id, revision_id,
    last_mutation_id, server_time, deleted_at, shadow_only
  ) values (
    v_owner, 'DOCUMENT_TOMBSTONED', p_document_id,
    v_document.current_revision_id, p_mutation_id,
    v_server_time, v_document.tombstoned_at, true
  ) returning change_id into v_change_id;

  v_ack := jsonb_build_object(
    'document', jsonb_build_object(
      'canonicalId', v_document.id,
      'noteType', v_document.note_type,
      'sourceLocale', v_document.source_locale,
      'lifecycleStatus', v_document.lifecycle_status,
      'currentRevisionId', v_document.current_revision_id,
      'currentRevisionNumber', v_document.current_revision_number,
      'contractVersion', v_document.contract_version,
      'schemaVersion', v_document.schema_version,
      'createdAt', v_document.created_at,
      'updatedAt', v_document.updated_at,
      'deletedAt', v_document.tombstoned_at
    ),
    'saveState', 'SERVER_ACKNOWLEDGED',
    'lastMutationId', p_mutation_id,
    'serverTime', v_server_time
  );
  insert into public.ai_document_mutation_receipts (
    owner_user_id, mutation_id, mutation_kind, request_fingerprint,
    document_id, revision_id, change_id, acknowledgement,
    server_time, shadow_only, created_at
  ) values (
    v_owner, p_mutation_id, 'TOMBSTONE_DOCUMENT', v_fingerprint,
    p_document_id, v_document.current_revision_id, v_change_id, v_ack,
    v_server_time, true, v_server_time
  );
  return v_ack;
end;
$$;

-- p_after_change_id is an internal monotonic cursor. The HTTP adapter must
-- encode/decode it as an opaque cursor and must not expose its numeric format
-- as a stable Web/App contract.
create or replace function public.pull_v1_shadow_document_changes(
  p_after_change_id bigint default 0,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_session_id uuid;
  v_changes jsonb;
  v_next bigint := p_after_change_id;
  v_has_more boolean := false;
begin
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;
  if v_session_id is null or not exists (
    select 1 from auth.sessions
    where id = v_session_id and user_id = v_owner
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  if not exists (
    select 1 from public.v1_mobile_sync_shadow_flags
    where feature_key = 'mobile_sync_v1' and enabled and shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;
  if p_after_change_id is null or p_limit is null
    or p_after_change_id < 0 or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_after_change_id > 0 and not exists (
    select 1
    from public.ai_document_sync_changes as cursor_change
    join public.ai_documents as cursor_document
      on cursor_document.id = cursor_change.document_id
      and cursor_document.owner_user_id = cursor_change.owner_user_id
    where cursor_change.change_id = p_after_change_id
      and cursor_change.owner_user_id = v_owner
      and cursor_document.contract_version = '1.0.0-shadow.1'
      and cursor_document.schema_version = '2026-08-09.v1-shadow'
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  with page as (
    select sync_change.*, revision.revision_number, revision.base_revision_id,
      revision.privacy_review_id, revision.content, revision.content_hash,
      revision.mutation_id, revision.schema_version,
      revision.contract_version, revision.created_at as revision_created_at
    from public.ai_document_sync_changes as sync_change
    join public.ai_documents as document
      on document.id = sync_change.document_id
      and document.owner_user_id = sync_change.owner_user_id
    left join public.ai_document_revisions as revision
      on revision.id = sync_change.revision_id
      and revision.document_id = sync_change.document_id
      and revision.owner_user_id = sync_change.owner_user_id
    where sync_change.owner_user_id = v_owner
      and document.contract_version = '1.0.0-shadow.1'
      and document.schema_version = '2026-08-09.v1-shadow'
      and sync_change.change_id > p_after_change_id
    order by sync_change.change_id
    limit p_limit
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'kind', change_kind,
        'canonicalId', document_id,
        'revision', case when revision_id is null then null else jsonb_build_object(
          'revisionId', revision_id,
          'canonicalId', document_id,
          'revisionNumber', revision_number,
          'baseRevisionId', base_revision_id,
          'privacyReviewId', privacy_review_id,
          'content', content,
          'contentHash', content_hash,
          'mutationId', mutation_id,
          'schemaVersion', schema_version,
          'contractVersion', contract_version,
          'createdAt', revision_created_at
        ) end,
        'lastMutationId', last_mutation_id,
        'serverTime', server_time,
        'deletedAt', deleted_at
      ) order by change_id
    ), '[]'::jsonb),
    coalesce(max(change_id), p_after_change_id)
  into v_changes, v_next
  from page;

  select exists (
    select 1
    from public.ai_document_sync_changes as sync_change
    join public.ai_documents as document
      on document.id = sync_change.document_id
      and document.owner_user_id = sync_change.owner_user_id
    where sync_change.owner_user_id = v_owner
      and document.contract_version = '1.0.0-shadow.1'
      and document.schema_version = '2026-08-09.v1-shadow'
      and sync_change.change_id > v_next
  ) into v_has_more;

  return jsonb_build_object(
    'changes', v_changes,
    'nextCursor', v_next::text,
    'hasMore', v_has_more
  );
end;
$$;

revoke all on function public.resolve_v1_shadow_session_status(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_v1_shadow_documents(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_v1_shadow_document(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.create_v1_shadow_document(text, text, jsonb, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.append_v1_shadow_document_revision(uuid, uuid, jsonb, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_v1_shadow_document_checkpoint(uuid, uuid, text, text[], text, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.tombstone_v1_shadow_document(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.pull_v1_shadow_document_changes(bigint, integer)
  from public, anon, authenticated, service_role;

-- Write EXECUTE remains withheld from every API role until canonical hash
-- vectors pass in a disposable Supabase runtime and complete frozen NoteContent
-- schema validation plus privacy-proof binding are implemented and verified.
-- Only session-checked reads are exposed to authenticated; session resolution
-- itself is service-role-only.
grant execute on function public.resolve_v1_shadow_session_status(uuid, uuid)
  to service_role;
grant execute on function public.list_v1_shadow_documents(uuid, integer)
  to authenticated;
grant execute on function public.get_v1_shadow_document(uuid)
  to authenticated;
grant execute on function public.pull_v1_shadow_document_changes(bigint, integer)
  to authenticated;

commit;
