-- CLI-generated candidate, deliberately outside supabase/migrations until a
-- separately reviewed promotion. Existing 47-migration Hosted pins stay intact.
-- The local test runner owns the transaction, including migration history.
select pg_catalog.set_config('careslink.review_migration_entry_role', current_user, true);
do $preflight$
begin
  if current_user <> 'postgres' or current_setting('server_version_num')::int < 160000
    or not exists (select 1 from pg_proc p where
      p.oid=to_regprocedure('careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)')
      and p.proowner='postgres'::regrole and p.prosecdef and p.provolatile='v'
      and p.prorettype='boolean'::regtype and p.proconfig=array['search_path=""']::text[])
    or exists (select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role','authenticator')
      and (pg_has_role(r.oid,'postgres','MEMBER') or has_function_privilege(r.oid,
        'careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)','EXECUTE')))
  then raise exception 'COMMUNICATION_REVIEW_PREDECESSOR_UNSAFE'; end if;
end
$preflight$;

-- Local/Preview candidate only; no activation, backfill, Points or AI work.
-- Both this dedicated switch and the existing mobile-sync switch start/off
-- independently. Do not add this candidate to a hosted runner implicitly.
create role careslink_communication_review_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant careslink_communication_review_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;

create table public.communication_note_self_review_flags (
  feature_key text primary key check (feature_key = 'communication_self_review'),
  enabled boolean not null default false,
  shadow_only boolean not null default true check (shadow_only)
);
insert into public.communication_note_self_review_flags(feature_key)
values ('communication_self_review');
alter table public.communication_note_self_review_flags enable row level security;
revoke all on public.communication_note_self_review_flags
  from public, anon, authenticated, service_role, authenticator;

grant usage on schema public, auth
  to careslink_communication_review_executor;
grant execute on function auth.uid(), auth.jwt()
  to careslink_communication_review_executor;
-- Reuse the existing locked Provider/session reader, without any direct Auth
-- table privilege, owner-role membership, service-role writer or BYPASSRLS.
set role careslink_v1_generation_owner;
grant usage on schema careslink_v1_generation to careslink_communication_review_executor;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.review_migration_entry_role'), false);
grant execute on function careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)
  to careslink_communication_review_executor;
grant select, update (enabled) on public.communication_note_self_review_flags,
  public.v1_mobile_sync_shadow_flags to careslink_communication_review_executor;
grant select, update (current_revision_id) on public.ai_documents
  to careslink_communication_review_executor;
grant select on public.ai_document_revisions to careslink_communication_review_executor;
grant select, insert on public.self_review_events to careslink_communication_review_executor;
-- UPDATE column grants/policies above permit row locks only; this RPC never
-- updates a flag or document. API roles cannot inherit the executor role.
create policy communication_review_flag_read on public.communication_note_self_review_flags
  for select to careslink_communication_review_executor using (true);
create policy communication_review_flag_lock on public.communication_note_self_review_flags
  for update to careslink_communication_review_executor using (true) with check (false);
create policy communication_review_sync_flag_read on public.v1_mobile_sync_shadow_flags
  for select to careslink_communication_review_executor using (true);
create policy communication_review_sync_flag_lock on public.v1_mobile_sync_shadow_flags
  for update to careslink_communication_review_executor using (true) with check (false);
create policy communication_review_document_read on public.ai_documents
  for select to careslink_communication_review_executor using (owner_user_id = (select auth.uid()));
create policy communication_review_document_lock on public.ai_documents
  for update to careslink_communication_review_executor
  using (owner_user_id = (select auth.uid())) with check (false);
create policy communication_review_revision_read on public.ai_document_revisions
  for select to careslink_communication_review_executor using (owner_user_id = (select auth.uid()));
create policy communication_review_event_read on public.self_review_events
  for select to careslink_communication_review_executor using (owner_user_id = (select auth.uid()));
create policy communication_review_event_insert on public.self_review_events
  for insert to careslink_communication_review_executor with check (
    owner_user_id = (select auth.uid()) and event = 'CONFIRMED'
    and facts_confirmed is true and wording_confirmed is true
    and missing_facts_reviewed is true and invalidation_reason is null
  );

create function public.confirm_communication_note_self_review(
  p_document_id uuid, p_revision_id uuid, p_mutation_id uuid,
  p_facts_confirmed boolean, p_wording_confirmed boolean, p_missing_facts_reviewed boolean
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_owner uuid;
  v_session uuid;
  v_document public.ai_documents%rowtype;
  v_event public.self_review_events%rowtype;
  v_exp numeric;
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
  v_owner := auth.uid();
  v_session := (v_claims->>'session_id')::uuid;
  v_exp := (v_claims->>'exp')::numeric;
  if v_owner is null or v_owner::text is distinct from v_claims->>'sub'
    or v_exp <= extract(epoch from clock_timestamp())
    or not careslink_v1_generation.fresh_session_is_active(v_owner,v_session,clock_timestamp())
  then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;

  -- Consistent order: Auth user -> Auth session -> switches -> document.
  -- Keep locks through COMMIT, including the replay path.
  perform 1 from public.communication_note_self_review_flags
    where feature_key='communication_self_review' and enabled and shadow_only for share;
  if not found then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  perform 1 from public.v1_mobile_sync_shadow_flags
    where feature_key='mobile_sync_v1' and enabled and shadow_only for share;
  if not found then raise exception using errcode='P0001', message='UNAVAILABLE'; end if;
  if p_document_id is null or p_revision_id is null or p_mutation_id is null
    or p_facts_confirmed is distinct from true or p_wording_confirmed is distinct from true
    or p_missing_facts_reviewed is distinct from true
    or p_document_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_revision_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_mutation_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;

  select * into v_document from public.ai_documents
    where id=p_document_id and owner_user_id=v_owner for update;
  if not found or v_document.note_type <> 'communication'
    or v_document.lifecycle_status <> 'IN_PROGRESS'
    or v_document.shadow_only is distinct from true
    or v_document.tombstoned_at is not null or v_document.purged_at is not null
    or v_document.contract_version <> '1.0.0-shadow.1'
    or v_document.schema_version <> '2026-08-09.v1-shadow'
  then raise exception using errcode='P0001', message='NOT_FOUND'; end if;
  if v_document.current_revision_id is distinct from p_revision_id
    or not exists (select 1 from public.ai_document_revisions
      where id=p_revision_id and document_id=p_document_id and owner_user_id=v_owner
        and shadow_only is true
        and revision_number=v_document.current_revision_number
        and contract_version='1.0.0-shadow.1' and schema_version='2026-08-09.v1-shadow')
  then raise exception using errcode='P0001', message='STALE_REVISION'; end if;

  -- Serialize the owner/key across documents as well as same-document retries.
  -- The unique event key remains the authoritative deduplication constraint.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_mutation_id::text, 0));
  -- Every potentially blocking lock is now held. Check real time again, not
  -- transaction-start now(); expiry while waiting must not permit a receipt.
  if v_exp <= extract(epoch from clock_timestamp())
    or not careslink_v1_generation.fresh_session_is_active(v_owner,v_session,clock_timestamp())
  then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;

  select * into v_event from public.self_review_events
    where owner_user_id=v_owner and mutation_id=p_mutation_id::text;
  if found then
    if v_event.document_id <> p_document_id or v_event.revision_id <> p_revision_id
      or v_event.event <> 'CONFIRMED' or v_event.facts_confirmed is distinct from true
      or v_event.wording_confirmed is distinct from true or v_event.missing_facts_reviewed is distinct from true
    then raise exception using errcode='P0001', message='INVALID_REQUEST'; end if;
  else
    insert into public.self_review_events(document_id,revision_id,owner_user_id,event,
      facts_confirmed,wording_confirmed,missing_facts_reviewed,mutation_id,created_at)
    values (p_document_id,p_revision_id,v_owner,'CONFIRMED',true,true,true,p_mutation_id::text,clock_timestamp());
  end if;
  return jsonb_build_object('status','CONFIRMED','canonicalId',p_document_id,
    'revisionId',p_revision_id,'mutationId',p_mutation_id,'saveState','SERVER_ACKNOWLEDGED',
    'draftNotice','Draft – review required');
end;
$$;

-- Changing the owner requires only a temporary schema CREATE grant. Revoke it
-- in this transaction; the executor receives no API-role memberships.
grant create on schema public to careslink_communication_review_executor;
alter function public.confirm_communication_note_self_review(uuid,uuid,uuid,boolean,boolean,boolean)
  owner to careslink_communication_review_executor;
revoke create on schema public from careslink_communication_review_executor;
set role careslink_communication_review_executor;
revoke all on function public.confirm_communication_note_self_review(uuid,uuid,uuid,boolean,boolean,boolean)
  from public, anon, authenticated, service_role, authenticator;
grant execute on function public.confirm_communication_note_self_review(uuid,uuid,uuid,boolean,boolean,boolean)
  to authenticated;
comment on function public.confirm_communication_note_self_review(uuid,uuid,uuid,boolean,boolean,boolean)
  is 'Default-off Communication-only current-revision Provider self-review; does not complete or professionally approve the draft.';
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.review_migration_entry_role'), false);
revoke careslink_communication_review_executor from current_user granted by current_user;
revoke careslink_v1_generation_owner from current_user granted by current_user;
