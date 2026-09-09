-- LOCAL CANDIDATE ONLY, excluded from the pinned Hosted migration manifest.
-- No LOGIN, runtime membership, public RPC or activation.
-- The migration runner supplies one transaction. The caller receives metadata
-- through this purpose function, never table or owner-executor authority.
select pg_catalog.set_config('careslink.migration_entry_role', current_user, true);
do $preflight$
begin
  if pg_catalog.current_setting('server_version_num')::integer < 160000
    or pg_catalog.to_regrole('careslink_v1_generation_job_list_executor') is not null
    or pg_catalog.to_regrole('careslink_v1_generation_job_list_caller') is not null
    or exists (select 1 from pg_catalog.pg_proc where pronamespace = 'careslink_v1_generation'::regnamespace
      and proname = 'list_v1_communication_note_jobs')
    or not exists (select 1 from pg_catalog.pg_class where oid = 'careslink_v1_generation.jobs'::regclass
      and relrowsecurity and relforcerowsecurity)
    or not exists (select 1 from pg_catalog.pg_proc where oid =
      'careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)'::regprocedure
      and prosecdef and proconfig = array['search_path=""']::text[])
  then raise exception 'COMMUNICATION_JOB_LIST_PREFLIGHT_FAILED'; end if;
end
$preflight$;
create role careslink_v1_generation_job_list_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role careslink_v1_generation_job_list_caller
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant careslink_v1_generation_owner, careslink_v1_generation_job_list_executor,
  careslink_v1_generation_job_list_caller to current_user
  with admin false, inherit false, set true granted by current_user;
grant execute on function careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)
  to careslink_v1_generation_job_list_executor;

set role careslink_v1_generation_owner;
grant usage on schema careslink_v1_generation to
  careslink_v1_generation_job_list_executor, careslink_v1_generation_job_list_caller;
grant create on schema careslink_v1_generation to careslink_v1_generation_job_list_executor;
grant select (id, owner_user_id, note_type, service_code, status, created_at, updated_at)
  on careslink_v1_generation.jobs to careslink_v1_generation_job_list_executor;
create policy jobs_communication_list_select on careslink_v1_generation.jobs
  for select to careslink_v1_generation_job_list_executor
  using (owner_user_id = nullif(pg_catalog.current_setting('careslink.communication_list_owner', true), '')::uuid
    and note_type = 'communication' and service_code = 'note.communication.generate');
create index jobs_communication_owner_created_id_idx
  on careslink_v1_generation.jobs(owner_user_id, created_at desc, id desc)
  where note_type = 'communication' and service_code = 'note.communication.generate';
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);

set role careslink_v1_generation_job_list_executor;
alter default privileges revoke all on functions from public;
create function careslink_v1_generation.list_v1_communication_note_jobs(
  p_owner_user_id uuid, p_session_id uuid, p_before_time timestamptz, p_before_id uuid,
  p_limit integer, p_contract_version text, p_schema_version text
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $reader$
declare
  v_tasks jsonb;
  v_cursor jsonb := null;
  v_previous_owner text := pg_catalog.current_setting('careslink.communication_list_owner', true);
begin
  if p_contract_version is distinct from '1.0.0-shadow.1'
    or p_schema_version is distinct from '2026-08-09.v1-shadow'
  then raise exception using errcode = 'P0001', message = 'MIN_CLIENT_VERSION'; end if;
  if p_owner_user_id is null or p_session_id is null or p_limit is null or p_limit not between 1 and 20
    or (p_before_time is null) <> (p_before_id is null)
    or (p_before_time is not null and not pg_catalog.isfinite(p_before_time))
  then raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR'; end if;
  -- First call acquires auth row locks. Recheck the wall clock after waiting.
  if not careslink_v1_generation.fresh_session_is_active(p_owner_user_id,p_session_id,pg_catalog.clock_timestamp())
    or not careslink_v1_generation.fresh_session_is_active(p_owner_user_id,p_session_id,pg_catalog.clock_timestamp())
  then raise exception using errcode = 'P0001', message = 'SESSION_REVOKED'; end if;
  perform pg_catalog.set_config('careslink.communication_list_owner', p_owner_user_id::text, true);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'jobId', j.id, 'status', j.status,
    'createdAt', pg_catalog.to_char(j.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updatedAt', pg_catalog.to_char(j.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ) order by j.created_at desc, j.id desc), '[]'::jsonb)
  into v_tasks from (
    select id, status, created_at, updated_at from careslink_v1_generation.jobs
    where owner_user_id = p_owner_user_id and note_type = 'communication'
      and service_code = 'note.communication.generate'
      and (p_before_time is null or (created_at,id) < (p_before_time,p_before_id))
    order by created_at desc, id desc limit p_limit + 1
  ) as j;
  if pg_catalog.jsonb_array_length(v_tasks) > p_limit then
    v_tasks := v_tasks - p_limit;
    v_cursor := pg_catalog.jsonb_build_object('createdAt',v_tasks->(p_limit-1)->>'createdAt',
      'jobId',v_tasks->(p_limit-1)->>'jobId');
  end if;
  perform pg_catalog.set_config('careslink.communication_list_owner', coalesce(v_previous_owner,''), true);
  -- A slow query must not return after the session's not_after boundary.
  if not careslink_v1_generation.fresh_session_is_active(p_owner_user_id,p_session_id,pg_catalog.clock_timestamp())
  then raise exception using errcode = 'P0001', message = 'SESSION_REVOKED'; end if;
  return pg_catalog.jsonb_build_object('tasks',v_tasks,'nextCursor',v_cursor);
end
$reader$;
revoke all on function careslink_v1_generation.list_v1_communication_note_jobs(uuid,uuid,timestamptz,uuid,integer,text,text)
  from public, anon, authenticated, service_role, authenticator;
grant execute on function careslink_v1_generation.list_v1_communication_note_jobs(uuid,uuid,timestamptz,uuid,integer,text,text)
  to careslink_v1_generation_job_list_caller;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);
set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation from careslink_v1_generation_job_list_executor;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);
revoke careslink_v1_generation_owner, careslink_v1_generation_job_list_executor,
  careslink_v1_generation_job_list_caller from current_user granted by current_user;
do $postflight$
begin
  if exists (select 1 from pg_catalog.pg_auth_members m
    where (roleid in ('careslink_v1_generation_job_list_executor'::regrole,'careslink_v1_generation_job_list_caller'::regrole)
      or member in ('careslink_v1_generation_job_list_executor'::regrole,'careslink_v1_generation_job_list_caller'::regrole))
    and not (m.member = pg_catalog.current_setting('careslink.migration_entry_role')::regrole
      and m.admin_option and not m.inherit_option and not m.set_option
      and exists (select 1 from pg_catalog.pg_roles r where r.oid=m.grantor and r.rolsuper)))
  then raise exception 'COMMUNICATION_JOB_LIST_MEMBERSHIP_UNSAFE'; end if;
end
$postflight$;
