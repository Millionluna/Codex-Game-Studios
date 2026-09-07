-- CLI-generated, LOCAL CANDIDATE ONLY. Not in the approved migration manifest.
-- No API caller receives EXECUTE/USAGE here. Local tests grant and discard their
-- own authenticated path. Promotion and external exposure need separate review.
select pg_catalog.set_config('careslink.edit_migration_entry_role', current_user, true);
do $preflight$
begin
  if current_user <> 'postgres' or current_setting('server_version_num')::int < 160000
    or not exists (select 1 from pg_proc where
      oid=to_regprocedure('careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)')
      and proowner='postgres'::regrole and prosecdef and provolatile='v'
      and prorettype='boolean'::regtype and proconfig=array['search_path=""']::text[])
    or exists (select 1 from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')
      and (pg_has_role(oid,'postgres','MEMBER') or has_function_privilege(oid,
        'careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)','EXECUTE')))
  then raise exception 'COMMUNICATION_EDIT_PREDECESSOR_UNSAFE'; end if;
end
$preflight$;

create role careslink_communication_edit_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant careslink_communication_edit_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
create schema careslink_communication_edit;
revoke all on schema careslink_communication_edit from public, anon, authenticated, service_role, authenticator;
grant usage on schema careslink_communication_edit, public, auth, extensions to careslink_communication_edit_executor;
grant execute on function auth.uid(), auth.jwt(), public.v1_shadow_canonical_json(jsonb),
  public.v1_shadow_content_sha256(jsonb), extensions.digest(bytea,text),
  public.assert_v1_shadow_note_facts(text,text,jsonb)
  to careslink_communication_edit_executor;
set role careslink_v1_generation_owner;
grant usage on schema careslink_v1_generation to careslink_communication_edit_executor;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.edit_migration_entry_role'), false);
grant execute on function careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)
  to careslink_communication_edit_executor;

create table public.communication_note_edit_flags (
  feature_key text primary key check (feature_key='communication_wording_edit'),
  enabled boolean not null default false,
  shadow_only boolean not null default true check (shadow_only)
);
insert into public.communication_note_edit_flags(feature_key) values ('communication_wording_edit');
alter table public.communication_note_edit_flags enable row level security;
revoke all on public.communication_note_edit_flags from public, anon, authenticated, service_role, authenticator;
grant select, update(enabled) on public.communication_note_edit_flags,
  public.v1_mobile_sync_shadow_flags to careslink_communication_edit_executor;
grant select, update(current_revision_id,current_revision_number,updated_at) on public.ai_documents
  to careslink_communication_edit_executor;
grant select, insert, update(content_hash) on public.ai_document_revisions to careslink_communication_edit_executor;
grant select, update(status) on public.privacy_reviews to careslink_communication_edit_executor;
grant select, insert on public.ai_document_mutation_receipts, public.ai_document_sync_changes
  to careslink_communication_edit_executor;
grant usage on sequence public.ai_document_sync_changes_change_id_seq to careslink_communication_edit_executor;

create policy communication_edit_flag_read on public.communication_note_edit_flags
  for select to careslink_communication_edit_executor using (true);
create policy communication_edit_flag_lock on public.communication_note_edit_flags
  for update to careslink_communication_edit_executor using (true) with check (false);
create policy communication_edit_sync_flag_read on public.v1_mobile_sync_shadow_flags
  for select to careslink_communication_edit_executor using (true);
create policy communication_edit_sync_flag_lock on public.v1_mobile_sync_shadow_flags
  for update to careslink_communication_edit_executor using (true) with check (false);
create policy communication_edit_document_read on public.ai_documents
  for select to careslink_communication_edit_executor using (owner_user_id=(select auth.uid()));
create policy communication_edit_document_update on public.ai_documents
  for update to careslink_communication_edit_executor
  using (owner_user_id=(select auth.uid()) and note_type='communication' and lifecycle_status='IN_PROGRESS' and shadow_only)
  with check (owner_user_id=(select auth.uid()) and note_type='communication' and lifecycle_status='IN_PROGRESS' and shadow_only);
create policy communication_edit_revision_read on public.ai_document_revisions
  for select to careslink_communication_edit_executor using (owner_user_id=(select auth.uid()));
create policy communication_edit_revision_lock on public.ai_document_revisions
  for update to careslink_communication_edit_executor using (owner_user_id=(select auth.uid())) with check (false);
create policy communication_edit_revision_insert on public.ai_document_revisions
  for insert to careslink_communication_edit_executor with check (owner_user_id=(select auth.uid()) and shadow_only);
create policy communication_edit_privacy_read on public.privacy_reviews
  for select to careslink_communication_edit_executor using (owner_user_id=(select auth.uid()));
create policy communication_edit_privacy_lock on public.privacy_reviews
  for update to careslink_communication_edit_executor using (owner_user_id=(select auth.uid())) with check (false);
create policy communication_edit_receipt_read on public.ai_document_mutation_receipts
  for select to careslink_communication_edit_executor using (owner_user_id=(select auth.uid()));
create policy communication_edit_receipt_insert on public.ai_document_mutation_receipts
  for insert to careslink_communication_edit_executor with check (
    owner_user_id=(select auth.uid()) and mutation_kind='APPEND_REVISION' and shadow_only);
create policy communication_edit_change_read on public.ai_document_sync_changes
  for select to careslink_communication_edit_executor using (owner_user_id=(select auth.uid()));
create policy communication_edit_change_insert on public.ai_document_sync_changes
  for insert to careslink_communication_edit_executor with check (
    owner_user_id=(select auth.uid()) and change_kind='DOCUMENT_UPSERTED' and deleted_at is null and shadow_only);

-- Definer code lives in a non-exposed schema and runs under RLS, not postgres.
create function careslink_communication_edit.save_wording(p_document_id uuid, p_mutation_id uuid, p_command jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_owner uuid;
  v_session uuid;
  v_exp numeric;
  v_base_id uuid;
  v_document public.ai_documents%rowtype;
  v_base public.ai_document_revisions%rowtype;
  v_revision public.ai_document_revisions%rowtype;
  v_proof public.privacy_reviews%rowtype;
  v_receipt public.ai_document_mutation_receipts%rowtype;
  v_content jsonb;
  v_hash text;
  v_text text;
  v_fingerprint jsonb;
  v_ack jsonb;
  v_change bigint;
  v_now timestamptz;
  v_replay boolean;
begin
  if jsonb_typeof(v_claims) is distinct from 'object'
    or v_claims->>'role' is distinct from 'authenticated'
    or v_claims->'is_anonymous' is distinct from 'false'::jsonb
    or jsonb_typeof(v_claims->'sub') is distinct from 'string'
    or jsonb_typeof(v_claims->'session_id') is distinct from 'string'
    or coalesce(v_claims->>'sub','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(v_claims->>'session_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(v_claims->'exp') is distinct from 'number'
  then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  v_owner := auth.uid(); v_session := (v_claims->>'session_id')::uuid; v_exp := (v_claims->>'exp')::numeric;
  if v_owner is null or v_owner::text is distinct from v_claims->>'sub'
    or v_exp <= extract(epoch from clock_timestamp())
    or not careslink_v1_generation.fresh_session_is_active(v_owner,v_session,clock_timestamp())
  then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  -- Order shared with self-review: Auth user/session -> flags -> document ->
  -- owner/mutation advisory key. Legacy generic write RPCs remain ungranted.
  perform 1 from public.communication_note_edit_flags
    where feature_key='communication_wording_edit' and enabled and shadow_only for share;
  if not found then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  perform 1 from public.v1_mobile_sync_shadow_flags
    where feature_key='mobile_sync_v1' and enabled and shadow_only for share;
  if not found then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  if p_document_id is null or p_mutation_id is null
    or p_document_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_mutation_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_command) is distinct from 'object'
  then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_command) key)
      is distinct from array['baseRevisionId','englishDraft','reviewVersions','wordingConfirmed']::text[]
    or jsonb_typeof(p_command->'baseRevisionId') is distinct from 'string'
    or coalesce(p_command->>'baseRevisionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_command->'wordingConfirmed' is distinct from 'true'::jsonb
    or jsonb_typeof(p_command->'englishDraft') is distinct from 'string'
    or jsonb_typeof(p_command->'reviewVersions') is distinct from 'object'
  then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_command->'reviewVersions') key)
      is distinct from array['zh-Hans','zh-Hant']::text[]
    or jsonb_typeof(p_command#>'{reviewVersions,zh-Hans}') is distinct from 'string'
    or jsonb_typeof(p_command#>'{reviewVersions,zh-Hant}') is distinct from 'string'
  then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
  foreach v_text in array array[p_command->>'englishDraft',p_command#>>'{reviewVersions,zh-Hans}',p_command#>>'{reviewVersions,zh-Hant}'] loop
    if v_text !~ '[^[:space:]]' or octet_length(v_text)>16000
      or (select sum(case when ascii(ch)>65535 then 2 else 1 end) from regexp_split_to_table(v_text,'') ch)>8000
      or v_text ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
    then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
    -- Defense in depth for direct SQL callers; the server's full deterministic
    -- scanner remains mandatory. This conservative pattern gate is not PII proof.
    if v_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}|https?://|www\.|(\+?61[ ().-]*|0)([0-9][ ().-]*){8,10}|\m(Mr|Mrs|Ms|Miss|Dr|Prof|Professor|Mx)\.?[[:space:]]+[A-Z][A-Z''-]+|\m(ABN|ACN|NDIS[[:space:]]+(provider|registration))\M|\m(participant|client|patient|member|reference|case|record|claim|medicare|NDIS)[[:space:]]*(ID|number|no\.?|#)[[:space:]]*[:#-]?[[:space:]]*[A-Z0-9]|\m[0-9]{1,5}[[:space:]]+([A-Z0-9''-]+[[:space:]]+){0,6}(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Boulevard|Blvd|Parade|Pde|Highway|Hwy|Close|Crescent|Cres|Place|Pl|Way)\M'
    then raise exception using errcode='P0001', message='PRIVACY_REVIEW_REQUIRED'; end if;
  end loop;
  v_base_id := (p_command->>'baseRevisionId')::uuid;
  select * into v_document from public.ai_documents where id=p_document_id and owner_user_id=v_owner for update;
  if not found or v_document.note_type<>'communication' or v_document.lifecycle_status<>'IN_PROGRESS'
    or not v_document.shadow_only or v_document.tombstoned_at is not null or v_document.purged_at is not null
    or v_document.contract_version<>'1.0.0-shadow.1' or v_document.schema_version<>'2026-08-09.v1-shadow'
  then raise exception using errcode='P0001', message='NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_mutation_id::text,0));
  select * into v_base from public.ai_document_revisions
    where id=v_base_id and document_id=p_document_id and owner_user_id=v_owner for share;
  if not found then raise exception using errcode='P0001', message='STALE_REVISION'; end if;
  if not v_base.shadow_only or v_base.schema_version<>v_document.schema_version
    or v_base.contract_version<>v_document.contract_version
    or v_base.content_hash is distinct from public.v1_shadow_content_sha256(v_base.content)
  then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  perform public.assert_v1_shadow_note_facts('communication',v_base.schema_version,v_base.content->'factsSummary');
  v_content := v_base.content || jsonb_build_object('englishDraft',p_command->'englishDraft','reviewVersions',p_command->'reviewVersions');
  if octet_length(public.v1_shadow_canonical_json(v_content))>65536
    then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
  v_hash := public.v1_shadow_content_sha256(v_content);
  if v_hash=v_base.content_hash then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
  v_fingerprint := jsonb_build_object('operation','COMMUNICATION_WORDING_EDIT_V1',
    'documentId',p_document_id,'baseRevisionId',v_base_id,'wordingHash',public.v1_shadow_content_sha256(p_command));
  select * into v_receipt from public.ai_document_mutation_receipts
    where owner_user_id=v_owner and mutation_id=p_mutation_id::text;
  v_replay := found;
  if v_replay then
    if v_receipt.mutation_kind<>'APPEND_REVISION' or v_receipt.request_fingerprint<>v_fingerprint
      or v_receipt.document_id<>p_document_id
    then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
    if v_document.current_revision_id is distinct from v_receipt.revision_id
      then raise exception using errcode='P0001', message='STALE_REVISION'; end if;
    select * into v_revision from public.ai_document_revisions
      where id=v_receipt.revision_id and document_id=p_document_id and owner_user_id=v_owner;
    if not found or v_revision.content is distinct from v_content or v_revision.content_hash is distinct from v_hash
      or v_revision.base_revision_id is distinct from v_base_id or v_revision.revision_number<>v_base.revision_number+1
      or v_document.current_revision_number<>v_revision.revision_number
    then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  elsif v_document.current_revision_id is distinct from v_base_id or v_document.current_revision_number<>v_base.revision_number then
    raise exception using errcode='P0001', message='STALE_REVISION';
  end if;
  select * into v_proof from public.privacy_reviews where id=v_base.privacy_review_id and owner_user_id=v_owner for share;
  if not found or v_proof.note_type<>'communication' or v_proof.status<>'CONFIRMED'
    or v_proof.cleaned_facts_hash is distinct from public.v1_shadow_content_sha256(v_base.content->'factsSummary')
    or v_proof.schema_version<>v_base.schema_version or v_proof.contract_version is distinct from v_base.contract_version
    or v_proof.scanner_policy_version is distinct from '2026-08-11.preview.1' or v_proof.review_revision is distinct from 1
    or not v_proof.shadow_only or v_proof.deidentification_confirmed is distinct from true
    or v_proof.authority_to_process_confirmed is distinct from true or v_proof.confirmed_at>clock_timestamp()
  then raise exception using errcode='P0001', message='PRIVACY_REVIEW_REQUIRED'; end if;
  if v_exp<=extract(epoch from clock_timestamp())
    or not careslink_v1_generation.fresh_session_is_active(v_owner,v_session,clock_timestamp())
  then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  if v_proof.expires_at<=clock_timestamp() then raise exception using errcode='P0001', message='PRIVACY_REVIEW_REQUIRED'; end if;
  if not v_replay then
    v_now := clock_timestamp();
    insert into public.ai_document_revisions(document_id,owner_user_id,revision_number,base_revision_id,privacy_review_id,
      content,content_hash,mutation_id,schema_version,contract_version,shadow_only,created_at)
    values(p_document_id,v_owner,v_base.revision_number+1,v_base_id,v_base.privacy_review_id,
      v_content,v_hash,p_mutation_id::text,v_base.schema_version,v_base.contract_version,true,v_now) returning * into v_revision;
    update public.ai_documents set current_revision_id=v_revision.id,current_revision_number=v_revision.revision_number,updated_at=v_now
      where id=p_document_id and owner_user_id=v_owner;
    insert into public.ai_document_sync_changes(owner_user_id,change_kind,document_id,revision_id,last_mutation_id,server_time,shadow_only)
      values(v_owner,'DOCUMENT_UPSERTED',p_document_id,v_revision.id,p_mutation_id::text,v_now,true) returning change_id into v_change;
    v_ack := jsonb_build_object('status','SAVED','canonicalId',p_document_id,'baseRevisionId',v_base_id,
      'revisionId',v_revision.id,'revisionNumber',v_revision.revision_number,'mutationId',p_mutation_id,
      'saveState','SERVER_ACKNOWLEDGED','selfReviewStatus','REQUIRED','draftNotice','Draft – review required');
    insert into public.ai_document_mutation_receipts(owner_user_id,mutation_id,mutation_kind,request_fingerprint,
      document_id,revision_id,change_id,acknowledgement,server_time,shadow_only,created_at)
      values(v_owner,p_mutation_id::text,'APPEND_REVISION',v_fingerprint,p_document_id,v_revision.id,v_change,v_ack,v_now,true,v_now);
  else v_ack := v_receipt.acknowledgement;
  end if;
  -- Recheck even after potential unique-index/FK waits; failure rolls everything back.
  if v_exp<=extract(epoch from clock_timestamp())
    or not careslink_v1_generation.fresh_session_is_active(v_owner,v_session,clock_timestamp())
  then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  if v_proof.expires_at<=clock_timestamp() then raise exception using errcode='P0001', message='PRIVACY_REVIEW_REQUIRED'; end if;
  return v_ack;
end;
$$;
grant create on schema careslink_communication_edit to careslink_communication_edit_executor;
alter function careslink_communication_edit.save_wording(uuid,uuid,jsonb) owner to careslink_communication_edit_executor;
revoke create on schema careslink_communication_edit from careslink_communication_edit_executor;
set role careslink_communication_edit_executor;
revoke all on function careslink_communication_edit.save_wording(uuid,uuid,jsonb) from public,anon,authenticated,service_role,authenticator;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.edit_migration_entry_role'), false);

-- Invoker-only facade: no public definer, and still no caller grants.
create function public.save_communication_note_wording(p_document_id uuid,p_mutation_id uuid,p_command jsonb)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select careslink_communication_edit.save_wording(p_document_id,p_mutation_id,p_command) $$;
revoke all on function public.save_communication_note_wording(uuid,uuid,jsonb) from public,anon,authenticated,service_role,authenticator;
revoke careslink_communication_edit_executor from current_user granted by current_user;
revoke careslink_v1_generation_owner from current_user granted by current_user;
