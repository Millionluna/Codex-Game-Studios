-- CLI-generated LOCAL CANDIDATE ONLY. Not in the approved migration manifest.
-- No API caller receives USAGE/EXECUTE. Tests grant a disposable capability;
-- deployment, retained schema installation and activation are separate gates.
select pg_catalog.set_config('careslink.history_migration_entry_role', current_user, true);
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
  then raise exception 'COMMUNICATION_HISTORY_PREDECESSOR_UNSAFE'; end if;
end
$preflight$;

create role careslink_communication_history_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant careslink_communication_history_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
create schema careslink_communication_history;
revoke all on schema careslink_communication_history from public,anon,authenticated,service_role,authenticator;
grant usage on schema careslink_communication_history,public,auth to careslink_communication_history_executor;
grant execute on function auth.uid(),auth.jwt() to careslink_communication_history_executor;
set role careslink_v1_generation_owner;
grant usage on schema careslink_v1_generation to careslink_communication_history_executor;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.history_migration_entry_role'), false);
grant execute on function careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)
  to careslink_communication_history_executor;

create table careslink_communication_history.flags (
  feature_key text primary key check (feature_key='communication_export_history'),
  enabled boolean not null default false,
  shadow_only boolean not null default true check (shadow_only)
);
insert into careslink_communication_history.flags(feature_key) values ('communication_export_history');
create table careslink_communication_history.reports (
  owner_user_id uuid not null,
  attempt_id uuid not null,
  document_id uuid not null,
  revision_id uuid not null,
  revision_number integer not null check (revision_number>0),
  format text not null check (format in ('COPY','TXT','DOCX','PDF')),
  outcome text not null check (outcome='FAILED' or
    (format='COPY' and outcome='COPY_REPORTED') or
    (format in ('TXT','DOCX','PDF') and outcome='DOWNLOAD_INITIATED')),
  started_at timestamptz not null check (started_at>='2000-01-01T00:00:00Z' and started_at<'2100-01-01T00:00:00Z'),
  recorded_at timestamptz not null,
  template_version text not null check (template_version='communication-record-text.2026-09-08.1'),
  profile text not null check (profile='RECORD_COPY'),
  shadow_only boolean not null default true check (shadow_only),
  primary key(owner_user_id,attempt_id),
  foreign key(document_id,owner_user_id) references public.ai_documents(id,owner_user_id) on delete cascade,
  foreign key(revision_id,document_id,owner_user_id)
    references public.ai_document_revisions(id,document_id,owner_user_id) on delete cascade
);
create index communication_history_revision_recent_idx on careslink_communication_history.reports
  (owner_user_id,document_id,revision_id,recorded_at desc,attempt_id desc);
alter table careslink_communication_history.flags enable row level security;
alter table careslink_communication_history.reports enable row level security;
revoke all on careslink_communication_history.flags,careslink_communication_history.reports
  from public,anon,authenticated,service_role,authenticator;
grant select,update(enabled) on careslink_communication_history.flags,public.v1_mobile_sync_shadow_flags
  to careslink_communication_history_executor;
-- Column-scoped metadata only: the executor cannot read draft content, facts,
-- privacy payloads, Auth tables, Points or legacy export artifact records.
grant select(id,owner_user_id,note_type,lifecycle_status,shadow_only,tombstoned_at,purged_at,
  contract_version,schema_version,current_revision_id,current_revision_number),update(current_revision_id)
  on public.ai_documents to careslink_communication_history_executor;
grant select(id,document_id,owner_user_id,revision_number,shadow_only,contract_version,schema_version)
  on public.ai_document_revisions to careslink_communication_history_executor;
grant select(id,document_id,revision_id,owner_user_id,event,facts_confirmed,wording_confirmed,missing_facts_reviewed,created_at)
  on public.self_review_events to careslink_communication_history_executor;
grant select,insert on careslink_communication_history.reports to careslink_communication_history_executor;
create policy history_flags_read on careslink_communication_history.flags
  for select to careslink_communication_history_executor using (true);
create policy history_flags_lock on careslink_communication_history.flags
  for update to careslink_communication_history_executor using (true) with check (false);
create policy history_sync_read on public.v1_mobile_sync_shadow_flags
  for select to careslink_communication_history_executor using (true);
create policy history_sync_lock on public.v1_mobile_sync_shadow_flags
  for update to careslink_communication_history_executor using (true) with check (false);
create policy history_document_read on public.ai_documents
  for select to careslink_communication_history_executor using (owner_user_id=(select auth.uid()));
create policy history_document_lock on public.ai_documents
  for update to careslink_communication_history_executor using (owner_user_id=(select auth.uid())) with check (false);
create policy history_revision_read on public.ai_document_revisions
  for select to careslink_communication_history_executor using (owner_user_id=(select auth.uid()));
create policy history_review_read on public.self_review_events
  for select to careslink_communication_history_executor using (owner_user_id=(select auth.uid()));
create policy history_report_read on careslink_communication_history.reports
  for select to careslink_communication_history_executor using (owner_user_id=(select auth.uid()));
create policy history_report_insert on careslink_communication_history.reports
  for insert to careslink_communication_history_executor with check (owner_user_id=(select auth.uid()) and shadow_only);

-- Both narrow invoker facades use this one private authorization/locking path.
-- No caller gets this function in the candidate. Reads do not write reports.
create function careslink_communication_history.access_reports(
  p_document_id uuid,p_revision_id uuid,p_attempt_id uuid,p_report jsonb
) returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_owner uuid;
  v_session uuid;
  v_exp numeric;
  v_write boolean := p_attempt_id is not null or p_report is not null;
  v_revision_id uuid := p_revision_id;
  v_doc record;
  v_revision_number integer;
  v_review record;
  v_started timestamptz;
  v_row careslink_communication_history.reports%rowtype;
  v_items jsonb;
  v_more boolean;
  v_result jsonb;
begin
  if jsonb_typeof(v_claims) is distinct from 'object'
    or v_claims->>'role' is distinct from 'authenticated'
    or v_claims->'is_anonymous' is distinct from 'false'::jsonb
    or jsonb_typeof(v_claims->'sub') is distinct from 'string'
    or jsonb_typeof(v_claims->'session_id') is distinct from 'string'
    or coalesce(v_claims->>'sub','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(v_claims->>'session_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(v_claims->'exp') is distinct from 'number'
  then raise exception using errcode='P0001',message='AUTH_REQUIRED'; end if;
  v_owner:=auth.uid(); v_session:=(v_claims->>'session_id')::uuid; v_exp:=(v_claims->>'exp')::numeric;
  if v_owner is null or v_owner::text is distinct from v_claims->>'sub'
    or v_exp<=extract(epoch from clock_timestamp())
    or not careslink_v1_generation.fresh_session_is_active(v_owner,v_session,clock_timestamp())
  then raise exception using errcode='P0001',message='AUTH_REQUIRED'; end if;
  -- Same order as editing/review: user/session -> flags -> document -> key.
  -- SHARE blocks edits/review/deletion while permitting concurrent history reads.
  perform 1 from careslink_communication_history.flags
    where feature_key='communication_export_history' and enabled and shadow_only for share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  perform 1 from public.v1_mobile_sync_shadow_flags
    where feature_key='mobile_sync_v1' and enabled and shadow_only for share;
  if not found then raise exception using errcode='P0001',message='UNAVAILABLE'; end if;
  if p_document_id is null or p_document_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception using errcode='P0001',message='INVALID_REQUEST'; end if;
  if v_write then
    if p_revision_id is not null or p_attempt_id is null or
      p_attempt_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(p_report) is distinct from 'object'
    then raise exception using errcode='P0001',message='INVALID_REQUEST'; end if;
    if (select array_agg(key order by key) from jsonb_object_keys(p_report) key)
        is distinct from array['format','outcome','revisionId','startedAt']::text[]
      or jsonb_typeof(p_report->'revisionId') is distinct from 'string'
      or coalesce(p_report->>'revisionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(p_report->'format') is distinct from 'string'
      or p_report->>'format' not in ('COPY','TXT','DOCX','PDF')
      or jsonb_typeof(p_report->'outcome') is distinct from 'string'
      or not (p_report->>'outcome'='FAILED' or
        (p_report->>'format'='COPY' and p_report->>'outcome'='COPY_REPORTED') or
        (p_report->>'format'<>'COPY' and p_report->>'outcome'='DOWNLOAD_INITIATED'))
      or jsonb_typeof(p_report->'startedAt') is distinct from 'string'
      or coalesce(p_report->>'startedAt','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    then raise exception using errcode='P0001',message='INVALID_REQUEST'; end if;
    v_revision_id:=(p_report->>'revisionId')::uuid;
    begin
      v_started:=(p_report->>'startedAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode='P0001',message='INVALID_REQUEST';
    end;
    if to_char(v_started at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_report->>'startedAt'
    then raise exception using errcode='P0001',message='INVALID_REQUEST'; end if;
  elsif v_revision_id is null or v_revision_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode='P0001',message='INVALID_REQUEST';
  end if;

  select id,note_type,lifecycle_status,shadow_only,tombstoned_at,purged_at,contract_version,schema_version,
    current_revision_id,current_revision_number into v_doc from public.ai_documents
    where id=p_document_id and owner_user_id=v_owner for share;
  if not found or v_doc.note_type<>'communication' or v_doc.lifecycle_status<>'IN_PROGRESS'
    or not v_doc.shadow_only or v_doc.tombstoned_at is not null or v_doc.purged_at is not null
    or v_doc.contract_version<>'1.0.0-shadow.1' or v_doc.schema_version<>'2026-08-09.v1-shadow'
  then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  select revision_number into v_revision_number from public.ai_document_revisions
    where id=v_revision_id and document_id=p_document_id and owner_user_id=v_owner and shadow_only
      and contract_version=v_doc.contract_version and schema_version=v_doc.schema_version;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;

  if v_write then
    if v_doc.current_revision_id is distinct from v_revision_id or v_doc.current_revision_number<>v_revision_number
    then raise exception using errcode='P0001',message='STALE_REVISION'; end if;
    select event,facts_confirmed,wording_confirmed,missing_facts_reviewed into v_review
      from public.self_review_events where document_id=p_document_id and revision_id=v_revision_id and owner_user_id=v_owner
      order by created_at desc,id desc limit 1;
    if not found or v_review.event<>'CONFIRMED' or v_review.facts_confirmed is distinct from true
      or v_review.wording_confirmed is distinct from true or v_review.missing_facts_reviewed is distinct from true
    then raise exception using errcode='P0001',message='REVIEW_REQUIRED'; end if;
    perform pg_advisory_xact_lock(hashtextextended('communication-history:'||v_owner::text||':'||p_attempt_id::text,0));
    -- Expiry is wall time, not transaction-start time, including lock waits.
    if v_exp<=extract(epoch from clock_timestamp())
      or not careslink_v1_generation.fresh_session_is_active(v_owner,v_session,clock_timestamp())
    then raise exception using errcode='P0001',message='AUTH_REQUIRED'; end if;
    select * into v_row from careslink_communication_history.reports
      where owner_user_id=v_owner and attempt_id=p_attempt_id;
    if found then
      if v_row.document_id<>p_document_id or v_row.revision_id<>v_revision_id
        or v_row.revision_number<>v_revision_number or v_row.format<>p_report->>'format'
        or v_row.outcome<>p_report->>'outcome' or v_row.started_at<>v_started
      then raise exception using errcode='P0001',message='INVALID_REQUEST'; end if;
    else
      insert into careslink_communication_history.reports(owner_user_id,attempt_id,document_id,revision_id,
        revision_number,format,outcome,started_at,recorded_at,template_version,profile)
      values(v_owner,p_attempt_id,p_document_id,v_revision_id,v_revision_number,p_report->>'format',p_report->>'outcome',
        v_started,date_trunc('milliseconds',clock_timestamp()),'communication-record-text.2026-09-08.1','RECORD_COPY') returning * into v_row;
    end if;
    v_result:=jsonb_build_object('status','RECORDED','canonicalId',p_document_id,'storage','DURABLE',
      'entry',jsonb_build_object('revisionId',v_row.revision_id,'format',v_row.format,'outcome',v_row.outcome,
        'startedAt',to_char(v_row.started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'attemptId',v_row.attempt_id,'revisionNumber',v_row.revision_number,
        'recordedAt',to_char(v_row.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'templateVersion',v_row.template_version,'profile',v_row.profile));
  else
    -- Limit 21 in one snapshot: bounded work and truthful hasMore, no full count.
    with recent as materialized (
      select * from careslink_communication_history.reports
      where owner_user_id=v_owner and document_id=p_document_id and revision_id=v_revision_id
      order by recorded_at desc,attempt_id desc limit 21
    ), numbered as (select *,row_number() over(order by recorded_at desc,attempt_id desc) as n from recent)
    select coalesce(jsonb_agg(jsonb_build_object('revisionId',revision_id,'format',format,'outcome',outcome,
      'startedAt',to_char(started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'attemptId',attempt_id,'revisionNumber',revision_number,
      'recordedAt',to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'templateVersion',template_version,'profile',profile) order by recorded_at desc,attempt_id desc)
      filter(where n<=20),'[]'::jsonb),count(*)>20 into v_items,v_more from numbered;
    v_result:=jsonb_build_object('status','AVAILABLE','canonicalId',p_document_id,'revisionId',v_revision_id,
      'storage','DURABLE','entries',v_items,'hasMore',v_more);
  end if;
  -- Cover unique/FK/index waits too; any failure rolls the whole write back.
  if v_exp<=extract(epoch from clock_timestamp())
    or not careslink_v1_generation.fresh_session_is_active(v_owner,v_session,clock_timestamp())
  then raise exception using errcode='P0001',message='AUTH_REQUIRED'; end if;
  return v_result;
end;
$$;
grant create on schema careslink_communication_history to careslink_communication_history_executor;
alter function careslink_communication_history.access_reports(uuid,uuid,uuid,jsonb) owner to careslink_communication_history_executor;
revoke create on schema careslink_communication_history from careslink_communication_history_executor;
set role careslink_communication_history_executor;
revoke all on function careslink_communication_history.access_reports(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role,authenticator;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.history_migration_entry_role'), false);
create function public.record_communication_note_export_report(p_document_id uuid,p_attempt_id uuid,p_report jsonb)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select careslink_communication_history.access_reports(p_document_id,null,p_attempt_id,p_report) $$;
create function public.list_communication_note_export_reports(p_document_id uuid,p_revision_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select careslink_communication_history.access_reports(p_document_id,p_revision_id,null,null) $$;
revoke all on function public.record_communication_note_export_report(uuid,uuid,jsonb),
  public.list_communication_note_export_reports(uuid,uuid) from public,anon,authenticated,service_role,authenticator;
revoke careslink_communication_history_executor from current_user granted by current_user;
revoke careslink_v1_generation_owner from current_user granted by current_user;
