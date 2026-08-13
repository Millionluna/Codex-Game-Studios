begin;

-- Preview-only privacy-review confirmation. The trusted Product API scanner
-- supplies only a canonical cleaned-facts digest and a sanitized finding
-- decision projection. This migration does not activate document writes, does
-- not grant a client role any privacy write, and stores no submitted facts.

alter table public.privacy_reviews
  add column contract_version text,
  add column scanner_policy_version text,
  add column review_revision integer,
  add column mutation_id text,
  add column request_fingerprint text,
  add column deidentification_confirmed boolean,
  add column authority_to_process_confirmed boolean,
  add column shadow_only boolean;

alter table public.privacy_reviews
  add constraint privacy_reviews_v1_confirmation_shape_check check (
    (
      contract_version is null
      and scanner_policy_version is null
      and review_revision is null
      and mutation_id is null
      and request_fingerprint is null
      and deidentification_confirmed is null
      and authority_to_process_confirmed is null
      and shadow_only is null
    )
    or (
      contract_version = '1.0.0-shadow.1'
      and scanner_policy_version = '2026-08-11.preview.1'
      and review_revision = 1
      and mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
      and request_fingerprint ~ '^[a-f0-9]{64}$'
      and deidentification_confirmed is true
      and authority_to_process_confirmed is true
      and shadow_only is true
      and expires_at = confirmed_at + interval '30 minutes'
    )
  );

create unique index privacy_reviews_owner_mutation_idx
  on public.privacy_reviews(owner_user_id, mutation_id)
  where mutation_id is not null;

create index privacy_reviews_owner_expiry_idx
  on public.privacy_reviews(owner_user_id, expires_at);

create table public.privacy_review_findings (
  id uuid primary key default gen_random_uuid(),
  privacy_review_id uuid not null,
  owner_user_id uuid not null,
  finding_type text not null check (finding_type in (
    'email', 'phone', 'postal_address', 'titled_person',
    'organisation_identifier', 'labelled_identifier', 'url'
  )),
  field_code text not null check (
    char_length(field_code) between 1 and 1024
    and field_code ~ '^/([^~]|~[01])*(/([^~]|~[01])*)*$'
  ),
  start_offset bigint not null check (
    start_offset >= 0 and start_offset <= 9007199254740991
  ),
  end_offset bigint not null check (
    end_offset > start_offset and end_offset <= 9007199254740991
  ),
  review_revision integer not null check (review_revision = 1),
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  foreign key (privacy_review_id, owner_user_id)
    references public.privacy_reviews(id, owner_user_id) on delete cascade,
  unique (id, privacy_review_id, owner_user_id),
  unique (
    privacy_review_id, finding_type, field_code,
    start_offset, end_offset, review_revision
  )
);

create table public.privacy_confirmations (
  id uuid primary key default gen_random_uuid(),
  privacy_review_id uuid not null,
  finding_id uuid not null,
  owner_user_id uuid not null,
  decision text not null check (
    decision in ('REMOVED', 'REPLACED', 'GENERALISED', 'RETAINED_CONFIRMED')
  ),
  review_revision integer not null check (review_revision = 1),
  retention_purpose_confirmed boolean not null,
  confirmed_at timestamptz not null,
  shadow_only boolean not null default true check (shadow_only),
  foreign key (privacy_review_id, owner_user_id)
    references public.privacy_reviews(id, owner_user_id) on delete cascade,
  foreign key (finding_id, privacy_review_id, owner_user_id)
    references public.privacy_review_findings(id, privacy_review_id, owner_user_id)
    on delete cascade,
  unique (finding_id),
  constraint privacy_confirmations_retention_purpose_check check (
    (decision = 'RETAINED_CONFIRMED' and retention_purpose_confirmed)
    or (decision <> 'RETAINED_CONFIRMED' and not retention_purpose_confirmed)
  )
);

create index privacy_review_findings_review_idx
  on public.privacy_review_findings(privacy_review_id, review_revision);
create index privacy_confirmations_review_idx
  on public.privacy_confirmations(privacy_review_id, review_revision);

alter table public.privacy_review_findings enable row level security;
alter table public.privacy_confirmations enable row level security;

revoke all on public.privacy_review_findings
  from public, anon, authenticated, service_role;
revoke all on public.privacy_confirmations
  from public, anon, authenticated, service_role;

-- Privacy metadata must use the same active-session RPC boundary as Documents.
revoke select on public.privacy_reviews from authenticated;

create or replace function public.v1_shadow_privacy_decisions_are_safe(
  p_decisions jsonb
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_decision jsonb;
  v_start bigint;
  v_end bigint;
  v_identity text;
  v_seen text[] := '{}'::text[];
begin
  if jsonb_typeof(p_decisions) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_decisions) > 256 then
    return false;
  end if;

  for v_decision in
    select item.value
    from jsonb_array_elements(p_decisions) as item(value)
  loop
    if jsonb_typeof(v_decision) <> 'object' then
      return false;
    end if;
    if not (v_decision ?& array[
        'findingType', 'fieldCode', 'startOffset', 'endOffset', 'decision'
      ])
      or v_decision - array[
        'findingType', 'fieldCode', 'startOffset', 'endOffset', 'decision',
        'retentionPurposeConfirmed'
      ] <> '{}'::jsonb
      or coalesce(v_decision->>'findingType', '') not in (
        'email', 'phone', 'postal_address', 'titled_person',
        'organisation_identifier', 'labelled_identifier', 'url'
      )
      or char_length(coalesce(v_decision->>'fieldCode', '')) not between 1 and 1024
      or coalesce(v_decision->>'fieldCode', '')
        !~ '^/([^~]|~[01])*(/([^~]|~[01])*)*$'
      or jsonb_typeof(v_decision->'startOffset') <> 'number'
      or jsonb_typeof(v_decision->'endOffset') <> 'number'
      or coalesce(v_decision->>'startOffset', '')
        !~ '^(0|[1-9][0-9]{0,15})$'
      or coalesce(v_decision->>'endOffset', '') !~ '^[1-9][0-9]{0,15}$'
      or coalesce(v_decision->>'decision', '') not in (
        'REMOVED', 'REPLACED', 'GENERALISED', 'RETAINED_CONFIRMED'
      )
    then
      return false;
    end if;

    v_start := (v_decision->>'startOffset')::bigint;
    v_end := (v_decision->>'endOffset')::bigint;
    if v_start > 9007199254740991
      or v_end > 9007199254740991
      or v_end <= v_start
    then
      return false;
    end if;
    if (v_decision->>'decision') = 'RETAINED_CONFIRMED' then
      if jsonb_typeof(v_decision->'retentionPurposeConfirmed') <> 'boolean'
        or v_decision->'retentionPurposeConfirmed' <> 'true'::jsonb
      then
        return false;
      end if;
    elsif v_decision ? 'retentionPurposeConfirmed' then
      return false;
    end if;

    v_identity := jsonb_build_array(
      v_decision->>'findingType',
      v_decision->>'fieldCode',
      v_start,
      v_end
    )::text;
    if v_identity = any(v_seen) then
      return false;
    end if;
    v_seen := array_append(v_seen, v_identity);
  end loop;

  return true;
end;
$$;

revoke all on function public.v1_shadow_privacy_decisions_are_safe(jsonb)
  from public, anon, authenticated, service_role;

alter table public.privacy_reviews
  add constraint privacy_reviews_v1_safe_decisions_check check (
    scanner_policy_version is null
    or public.v1_shadow_privacy_decisions_are_safe(finding_decisions)
  );

create or replace function public.confirm_v1_shadow_privacy_review(
  p_owner_user_id uuid,
  p_session_id uuid,
  p_note_type text,
  p_cleaned_facts_hash text,
  p_schema_version text,
  p_contract_version text,
  p_scanner_policy_version text,
  p_review_revision integer,
  p_finding_decisions jsonb,
  p_deidentification_confirmed boolean,
  p_authority_to_process_confirmed boolean,
  p_mutation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.privacy_reviews%rowtype;
  v_review public.privacy_reviews%rowtype;
  v_decision jsonb;
  v_finding_id uuid;
  v_confirmed_at timestamptz;
  v_expires_at timestamptz;
  v_normalized_decisions jsonb;
  v_fingerprint text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_owner_user_id is null or p_session_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if not exists (
    select 1 from auth.sessions
    where id = p_session_id
      and user_id = p_owner_user_id
      and (not_after is null or not_after > clock_timestamp())
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
    or p_note_type not in (
      'communication', 'handover', 'progress', 'ndis', 'incident_factual'
    )
    or p_cleaned_facts_hash is null
    or p_cleaned_facts_hash !~ '^[a-f0-9]{64}$'
    or p_scanner_policy_version is distinct from '2026-08-11.preview.1'
    or p_review_revision is distinct from 1
    or p_mutation_id is null
    or p_mutation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
    or p_finding_decisions is null
    or not public.v1_shadow_privacy_decisions_are_safe(p_finding_decisions)
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_schema_version is distinct from '2026-08-09.v1-shadow'
    or p_contract_version is distinct from '1.0.0-shadow.1'
  then
    raise exception using errcode = 'P0001', message = 'MIN_CLIENT_VERSION';
  end if;
  if p_deidentification_confirmed is distinct from true
    or p_authority_to_process_confirmed is distinct from true
  then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_REQUIRED';
  end if;

  select coalesce(
    jsonb_agg(item.value order by
      convert_to(item.value->>'fieldCode', 'UTF8'),
      (item.value->>'startOffset')::bigint,
      (item.value->>'endOffset')::bigint,
      convert_to(item.value->>'findingType', 'UTF8')
    ),
    '[]'::jsonb
  ) into v_normalized_decisions
  from jsonb_array_elements(p_finding_decisions) as item(value);

  v_fingerprint := public.v1_shadow_content_sha256(
    jsonb_build_object(
      'noteType', p_note_type,
      'cleanedFactsHash', p_cleaned_facts_hash,
      'schemaVersion', p_schema_version,
      'contractVersion', p_contract_version,
      'scannerPolicyVersion', p_scanner_policy_version,
      'reviewRevision', p_review_revision,
      'findingDecisions', v_normalized_decisions,
      'deidentificationConfirmed', true,
      'authorityToProcessConfirmed', true
    )
  );

  perform pg_advisory_xact_lock(
    hashtextextended(p_owner_user_id::text || ':' || p_mutation_id, 0)
  );

  select * into v_existing
  from public.privacy_reviews
  where owner_user_id = p_owner_user_id and mutation_id = p_mutation_id
  for update;

  if v_existing.id is not null then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'ownerUserId', v_existing.owner_user_id,
      'noteType', v_existing.note_type,
      'cleanedFactsHash', v_existing.cleaned_facts_hash,
      'schemaVersion', v_existing.schema_version,
      'scannerPolicyVersion', v_existing.scanner_policy_version,
      'reviewRevision', v_existing.review_revision,
      'findingDecisions', v_existing.finding_decisions,
      'status', v_existing.status,
      'confirmedAt', v_existing.confirmed_at,
      'expiresAt', v_existing.expires_at
    );
  end if;

  v_confirmed_at := clock_timestamp();
  v_expires_at := v_confirmed_at + interval '30 minutes';
  insert into public.privacy_reviews (
    owner_user_id, note_type, cleaned_facts_hash, schema_version,
    status, finding_decisions, confirmed_at, expires_at,
    contract_version, scanner_policy_version, review_revision,
    mutation_id, request_fingerprint, deidentification_confirmed,
    authority_to_process_confirmed, shadow_only
  ) values (
    p_owner_user_id, p_note_type, p_cleaned_facts_hash, p_schema_version,
    'CONFIRMED', v_normalized_decisions, v_confirmed_at, v_expires_at,
    p_contract_version, p_scanner_policy_version, p_review_revision,
    p_mutation_id, v_fingerprint, true, true, true
  ) returning * into v_review;

  for v_decision in
    select item.value
    from jsonb_array_elements(v_normalized_decisions) as item(value)
  loop
    insert into public.privacy_review_findings (
      privacy_review_id, owner_user_id, finding_type, field_code,
      start_offset, end_offset, review_revision, shadow_only,
      created_at
    ) values (
      v_review.id, p_owner_user_id, v_decision->>'findingType',
      v_decision->>'fieldCode', (v_decision->>'startOffset')::bigint,
      (v_decision->>'endOffset')::bigint,
      p_review_revision, true, v_confirmed_at
    ) returning id into v_finding_id;

    insert into public.privacy_confirmations (
      privacy_review_id, finding_id, owner_user_id, decision,
      review_revision, retention_purpose_confirmed, confirmed_at, shadow_only
    ) values (
      v_review.id, v_finding_id, p_owner_user_id,
      v_decision->>'decision', p_review_revision,
      (v_decision->>'decision') = 'RETAINED_CONFIRMED',
      v_confirmed_at, true
    );
  end loop;

  return jsonb_build_object(
    'id', v_review.id,
    'ownerUserId', v_review.owner_user_id,
    'noteType', v_review.note_type,
    'cleanedFactsHash', v_review.cleaned_facts_hash,
    'schemaVersion', v_review.schema_version,
    'scannerPolicyVersion', v_review.scanner_policy_version,
    'reviewRevision', v_review.review_revision,
    'findingDecisions', v_review.finding_decisions,
    'status', v_review.status,
    'confirmedAt', v_review.confirmed_at,
    'expiresAt', v_review.expires_at
  );
end;
$$;

revoke all on function public.confirm_v1_shadow_privacy_review(
  uuid, uuid, text, text, text, text, text, integer, jsonb,
  boolean, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.confirm_v1_shadow_privacy_review(
  uuid, uuid, text, text, text, text, text, integer, jsonb,
  boolean, boolean, text
) to service_role;

create or replace function public.assert_v1_shadow_privacy_review(
  p_privacy_review_id uuid,
  p_owner_user_id uuid,
  p_note_type text,
  p_cleaned_facts_hash text,
  p_schema_version text,
  p_contract_version text,
  p_at timestamptz
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_review_id uuid;
begin
  if p_privacy_review_id is null then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_REQUIRED';
  end if;

  select review.id into v_review_id
  from public.privacy_reviews as review
  where review.id = p_privacy_review_id
    and review.owner_user_id = p_owner_user_id
    and review.note_type = p_note_type
    and review.cleaned_facts_hash = p_cleaned_facts_hash
    and review.schema_version = p_schema_version
    and review.contract_version = p_contract_version
    and review.scanner_policy_version = '2026-08-11.preview.1'
    and review.review_revision = 1
    and review.status = 'CONFIRMED'
    and review.deidentification_confirmed is true
    and review.authority_to_process_confirmed is true
    and review.shadow_only is true
    and review.confirmed_at <= p_at
    and review.expires_at > p_at
  for share;

  if v_review_id is null then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_STALE';
  end if;
end;
$$;

revoke all on function public.assert_v1_shadow_privacy_review(
  uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.enforce_v1_shadow_revision_privacy_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.ai_documents%rowtype;
  v_cleaned_facts_hash text;
begin
  select * into v_document
  from public.ai_documents
  where id = new.document_id and owner_user_id = new.owner_user_id;

  if v_document.id is null
    or v_document.contract_version <> '1.0.0-shadow.1'
    or v_document.schema_version <> '2026-08-09.v1-shadow'
  then
    return new;
  end if;
  if not (new.content ? 'factsSummary')
    or jsonb_typeof(new.content->'factsSummary') <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  v_cleaned_facts_hash := public.v1_shadow_content_sha256(
    new.content->'factsSummary'
  );
  perform public.assert_v1_shadow_privacy_review(
    new.privacy_review_id,
    new.owner_user_id,
    v_document.note_type,
    v_cleaned_facts_hash,
    new.schema_version,
    new.contract_version,
    clock_timestamp()
  );
  return new;
end;
$$;

revoke all on function public.enforce_v1_shadow_revision_privacy_review()
  from public, anon, authenticated, service_role;

create trigger enforce_v1_shadow_revision_privacy_review
before insert on public.ai_document_revisions
for each row execute function public.enforce_v1_shadow_revision_privacy_review();

create or replace function public.enforce_v1_shadow_checkpoint_privacy_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.ai_documents%rowtype;
  v_revision public.ai_document_revisions%rowtype;
  v_active_revision_id uuid;
begin
  if new.privacy_review_id is null then
    return new;
  end if;
  v_active_revision_id := coalesce(new.active_revision_id, new.base_revision_id);

  select * into v_document
  from public.ai_documents
  where id = new.document_id and owner_user_id = new.owner_user_id;
  if v_document.id is null
    or v_document.contract_version <> '1.0.0-shadow.1'
    or v_document.schema_version <> '2026-08-09.v1-shadow'
  then
    return new;
  end if;

  select * into v_revision
  from public.ai_document_revisions
  where id = v_active_revision_id
    and document_id = new.document_id
    and owner_user_id = new.owner_user_id;
  if v_revision.id is null
    or v_revision.privacy_review_id is distinct from new.privacy_review_id
    or not (v_revision.content ? 'factsSummary')
    or jsonb_typeof(v_revision.content->'factsSummary') <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_STALE';
  end if;

  perform public.assert_v1_shadow_privacy_review(
    new.privacy_review_id,
    new.owner_user_id,
    v_document.note_type,
    public.v1_shadow_content_sha256(v_revision.content->'factsSummary'),
    v_revision.schema_version,
    v_revision.contract_version,
    clock_timestamp()
  );
  return new;
end;
$$;

revoke all on function public.enforce_v1_shadow_checkpoint_privacy_review()
  from public, anon, authenticated, service_role;

create trigger enforce_v1_shadow_checkpoint_privacy_review
before insert or update on public.document_checkpoints
for each row execute function public.enforce_v1_shadow_checkpoint_privacy_review();

-- Preserve the public RPC identities while moving the pre-binding bodies into
-- a non-exposed schema. Public wrappers validate a new mutation before the old
-- body can allocate a document/change identity; successful receipt replays keep
-- their original ACK even after the proof later expires. A pre-existing schema
-- is an ownership/ACL/object-set conflict, never an idempotent success.
do $$
begin
  if to_regnamespace('careslink_v1_internal') is not null then
    raise exception using
      errcode = '55000',
      message = 'CARESLINK_V1_INTERNAL_SCHEMA_PREFLIGHT_REQUIRED';
  end if;
end
$$;

create schema careslink_v1_internal authorization current_user;
revoke all on schema careslink_v1_internal
  from public, anon, authenticated, service_role;

do $$
declare
  v_schema oid;
begin
  select namespace.oid into v_schema
  from pg_namespace as namespace
  where namespace.nspname = 'careslink_v1_internal'
    and namespace.nspowner = current_user::regrole;

  if v_schema is null
    or exists (
      select 1
      from pg_roles as api_role
      where api_role.rolname in ('anon', 'authenticated', 'service_role')
        and (
          has_schema_privilege(api_role.oid, v_schema, 'USAGE')
          or has_schema_privilege(api_role.oid, v_schema, 'CREATE')
        )
    )
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and schema_acl.grantee = 0
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
    )
    or (
      select count(*)
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and schema_acl.grantee = namespace.nspowner
        and schema_acl.grantor = namespace.nspowner
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
        and not schema_acl.is_grantable
    ) <> 2
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and not (
          schema_acl.grantee = namespace.nspowner
          and schema_acl.grantor = namespace.nspowner
          and schema_acl.privilege_type in ('USAGE', 'CREATE')
          and not schema_acl.is_grantable
        )
    )
    or exists (
      with recursive reachable(role_oid) as (
        select oid from pg_roles
        where rolname in ('anon', 'authenticated', 'service_role')
        union
        select membership.roleid
        from pg_auth_members as membership
        join reachable on reachable.role_oid = membership.member
      )
      select 1 from reachable where role_oid = current_user::regrole
    )
    or exists (select 1 from pg_class where relnamespace = v_schema)
    or exists (select 1 from pg_type where typnamespace = v_schema)
    or exists (select 1 from pg_proc where pronamespace = v_schema)
    or exists (
      select 1 from pg_depend
      where refclassid = 'pg_namespace'::regclass
        and refobjid = v_schema
        and refobjsubid = 0
    )
  then
    raise exception using
      errcode = '55000',
      message = 'CARESLINK_V1_INTERNAL_SCHEMA_INVALID';
  end if;
end
$$;

alter function public.create_v1_shadow_document(
  text, text, jsonb, text, text, text, text, uuid
) set schema careslink_v1_internal;
alter function public.append_v1_shadow_document_revision(
  uuid, uuid, jsonb, text, text, text, text, uuid
) set schema careslink_v1_internal;

revoke all on function careslink_v1_internal.create_v1_shadow_document(
  text, text, jsonb, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function careslink_v1_internal.append_v1_shadow_document_revision(
  uuid, uuid, jsonb, text, text, text, text, uuid
) from public, anon, authenticated, service_role;

do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_internal');
  v_expected oid[] := array[
    to_regprocedure(
      'careslink_v1_internal.create_v1_shadow_document(text,text,jsonb,text,text,text,text,uuid)'
    ),
    to_regprocedure(
      'careslink_v1_internal.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)'
    )
  ];
begin
  if v_schema is null
    or array_position(v_expected, null) is not null
    or not exists (
      select 1 from pg_namespace
      where oid = v_schema and nspowner = current_user::regrole
    )
    or (
      select count(*)
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and schema_acl.grantee = namespace.nspowner
        and schema_acl.grantor = namespace.nspowner
        and schema_acl.privilege_type in ('USAGE', 'CREATE')
        and not schema_acl.is_grantable
    ) <> 2
    or exists (
      select 1
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) as schema_acl
      where namespace.oid = v_schema
        and not (
          schema_acl.grantee = namespace.nspowner
          and schema_acl.grantor = namespace.nspowner
          and schema_acl.privilege_type in ('USAGE', 'CREATE')
          and not schema_acl.is_grantable
        )
    )
    or (select count(*) from pg_proc where pronamespace = v_schema) <> 2
    or (
      select count(*)
      from pg_proc as implementation
      where implementation.oid = any(v_expected)
        and implementation.pronamespace = v_schema
        and implementation.proowner = current_user::regrole
        and coalesce(to_jsonb(implementation)->>'prokind', 'f') = 'f'
        and implementation.prosecdef
        and cardinality(implementation.proconfig) = 1
        and implementation.proconfig[1] in ('search_path=', 'search_path=""')
        and (
          select count(*)
          from aclexplode(
            coalesce(
              implementation.proacl,
              acldefault('f', implementation.proowner)
            )
          ) as function_acl
          where function_acl.grantee = implementation.proowner
            and function_acl.grantor = implementation.proowner
            and function_acl.privilege_type = 'EXECUTE'
            and not function_acl.is_grantable
        ) = 1
        and not exists (
          select 1
          from aclexplode(
            coalesce(
              implementation.proacl,
              acldefault('f', implementation.proowner)
            )
          ) as function_acl
          where not (
            function_acl.grantee = implementation.proowner
            and function_acl.grantor = implementation.proowner
            and function_acl.privilege_type = 'EXECUTE'
            and not function_acl.is_grantable
          )
        )
        and not exists (
          select 1
          from pg_roles as api_role
          where api_role.rolname in ('anon', 'authenticated', 'service_role')
            and has_function_privilege(
              api_role.oid, implementation.oid, 'EXECUTE'
            )
        )
    ) <> 2
    or exists (
      with recursive reachable(role_oid) as (
        select oid from pg_roles
        where rolname in ('anon', 'authenticated', 'service_role')
        union
        select membership.roleid
        from pg_auth_members as membership
        join reachable on reachable.role_oid = membership.member
      )
      select 1 from reachable where role_oid = current_user::regrole
    )
    or exists (select 1 from pg_class where relnamespace = v_schema)
    or exists (select 1 from pg_type where typnamespace = v_schema)
    or exists (
      select 1
      from pg_depend as dependency
      where dependency.refclassid = 'pg_namespace'::regclass
        and dependency.refobjid = v_schema
        and dependency.refobjsubid = 0
        and not (
          dependency.classid = 'pg_proc'::regclass
          and dependency.objid = any(v_expected)
          and dependency.objsubid = 0
        )
    )
  then
    raise exception using
      errcode = '55000',
      message = 'CARESLINK_V1_INTERNAL_FUNCTION_SET_INVALID';
  end if;
end
$$;

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
    select 1 from auth.sessions where id = v_session_id and user_id = v_owner
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
    or p_note_type not in (
      'communication', 'handover', 'progress', 'ndis', 'incident_factual'
    )
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
  if p_content_hash is distinct from public.v1_shadow_content_sha256(p_content)
    or not (p_content ? 'factsSummary')
    or jsonb_typeof(p_content->'factsSummary') <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_privacy_review_id is null then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner::text || ':' || p_mutation_id, 0)
  );
  if not exists (
    select 1 from public.ai_document_mutation_receipts
    where owner_user_id = v_owner and mutation_id = p_mutation_id
  ) then
    perform public.assert_v1_shadow_privacy_review(
      p_privacy_review_id,
      v_owner,
      p_note_type,
      public.v1_shadow_content_sha256(p_content->'factsSummary'),
      p_schema_version,
      p_contract_version,
      clock_timestamp()
    );
  end if;

  return careslink_v1_internal.create_v1_shadow_document(
    p_note_type, p_source_locale, p_content, p_content_hash, p_mutation_id,
    p_schema_version, p_contract_version, p_privacy_review_id
  );
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
    select 1 from auth.sessions where id = v_session_id and user_id = v_owner
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
  if p_content_hash is distinct from public.v1_shadow_content_sha256(p_content)
    or not (p_content ? 'factsSummary')
    or jsonb_typeof(p_content->'factsSummary') <> 'object'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;
  if p_privacy_review_id is null then
    raise exception using errcode = 'P0001', message = 'PRIVACY_REVIEW_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_owner::text || ':' || p_mutation_id, 0)
  );
  if not exists (
    select 1 from public.ai_document_mutation_receipts
    where owner_user_id = v_owner and mutation_id = p_mutation_id
  ) then
    select * into v_document
    from public.ai_documents
    where id = p_document_id
      and owner_user_id = v_owner
      and contract_version = '1.0.0-shadow.1'
      and schema_version = '2026-08-09.v1-shadow';
    if v_document.id is not null then
      perform public.assert_v1_shadow_privacy_review(
        p_privacy_review_id,
        v_owner,
        v_document.note_type,
        public.v1_shadow_content_sha256(p_content->'factsSummary'),
        p_schema_version,
        p_contract_version,
        clock_timestamp()
      );
    end if;
  end if;

  return careslink_v1_internal.append_v1_shadow_document_revision(
    p_document_id, p_base_revision_id, p_content, p_content_hash, p_mutation_id,
    p_schema_version, p_contract_version, p_privacy_review_id
  );
end;
$$;

revoke all on function public.create_v1_shadow_document(
  text, text, jsonb, text, text, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.append_v1_shadow_document_revision(
  uuid, uuid, jsonb, text, text, text, text, uuid
) from public, anon, authenticated, service_role;

commit;
