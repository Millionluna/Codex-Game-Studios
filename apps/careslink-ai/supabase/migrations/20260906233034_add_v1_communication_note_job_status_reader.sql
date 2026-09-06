-- Communication-only metadata reader. No runtime LOGIN, membership, table
-- access, Data API exposure or feature activation is installed by this file.
-- The migration runner supplies the transaction boundary.
select pg_catalog.set_config('careslink.migration_entry_role', current_user, true);

do $preflight$
begin
  if pg_catalog.current_setting('server_version_num')::integer < 160000 then
    raise exception 'COMMUNICATION_JOB_STATUS_REQUIRES_PG16';
  end if;
  if pg_catalog.to_regrole('careslink_v1_generation_job_status_caller') is not null
    or pg_catalog.to_regrole('careslink_v1_generation_job_status_executor') is not null
    or exists (select 1 from pg_catalog.pg_proc
      where pronamespace = 'careslink_v1_generation'::regnamespace
        and proname = 'get_v1_communication_note_job_status') then
    raise exception 'COMMUNICATION_JOB_STATUS_IDENTITY_EXISTS';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc as f
    join pg_catalog.pg_roles as r on r.oid = f.proowner
    where f.oid = pg_catalog.to_regprocedure(
      'careslink_v1_generation.get_v1_shadow_note_generation_job_status(uuid,uuid,uuid,text,text)')
      and f.prosecdef and f.proconfig = array['search_path=""']::text[]
      and r.rolname = 'careslink_v1_generation_owner_api_executor'
      and not r.rolcanlogin and not r.rolinherit and not r.rolbypassrls
      and not r.rolsuper and not r.rolcreaterole and not r.rolcreatedb
  ) or not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'careslink_v1_generation.jobs'::regclass
      and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'COMMUNICATION_JOB_STATUS_PREDECESSOR_UNSAFE';
  end if;
end
$preflight$;

create role careslink_v1_generation_job_status_executor
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role careslink_v1_generation_job_status_caller
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_generation_owner_api_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_generation_job_status_executor to current_user
  with admin false, inherit false, set true granted by current_user;
grant careslink_v1_generation_job_status_caller to current_user
  with admin false, inherit false, set true granted by current_user;

set role careslink_v1_generation_owner;
grant usage on schema careslink_v1_generation to
  careslink_v1_generation_job_status_executor,
  careslink_v1_generation_job_status_caller;
grant create on schema careslink_v1_generation to careslink_v1_generation_job_status_executor;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);

-- The wrapper's NOLOGIN definer can call only the existing status reader.
-- Its caller cannot reach the generic five-Note reader or its write-capable
-- owner executor. Existing owner RLS and both fresh-session checks are reused.
set role careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation.get_v1_shadow_note_generation_job_status(
  uuid, uuid, uuid, text, text) to careslink_v1_generation_job_status_executor;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);

set role careslink_v1_generation_job_status_executor;
alter default privileges revoke all on functions from public;
create function careslink_v1_generation.get_v1_communication_note_job_status(
  p_owner_user_id uuid,
  p_session_id uuid,
  p_job_id uuid,
  p_contract_version text,
  p_schema_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $reader$
declare
  v_response jsonb;
begin
  v_response := careslink_v1_generation.get_v1_shadow_note_generation_job_status(
    p_owner_user_id, p_session_id, p_job_id, p_contract_version, p_schema_version
  );
  if v_response -> 'job' ->> 'noteType' is distinct from 'communication'
    or v_response -> 'job' ->> 'serviceCode' is distinct from 'note.communication.generate'
  then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  return v_response;
end
$reader$;
revoke all on function careslink_v1_generation.get_v1_communication_note_job_status(
  uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner, careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
grant execute on function careslink_v1_generation.get_v1_communication_note_job_status(
  uuid, uuid, uuid, text, text) to careslink_v1_generation_job_status_caller;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);

set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation from careslink_v1_generation_job_status_executor;
select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);

revoke careslink_v1_generation_job_status_caller from current_user granted by current_user;
revoke careslink_v1_generation_job_status_executor from current_user granted by current_user;
revoke careslink_v1_generation_owner_api_executor from current_user granted by current_user;
revoke careslink_v1_generation_owner from current_user granted by current_user;

-- No runtime role may inherit or SET into either new role at migration end.
do $postflight$
begin
  if exists (
    select 1 from pg_catalog.pg_auth_members as membership
    where (roleid in (
      'careslink_v1_generation_job_status_executor'::regrole,
      'careslink_v1_generation_job_status_caller'::regrole)
      or member in (
      'careslink_v1_generation_job_status_executor'::regrole,
      'careslink_v1_generation_job_status_caller'::regrole))
    -- PG16 CREATEROLE may retain its bootstrap-superuser ADMIN-only edge.
    -- It must confer neither inheritance nor SET privilege.
    and not (
      membership.member = pg_catalog.current_setting('careslink.migration_entry_role')::regrole
      and membership.admin_option and not membership.inherit_option
      and not membership.set_option
      and exists (select 1 from pg_catalog.pg_roles as grantor
        where grantor.oid = membership.grantor and grantor.rolsuper)
    )
  ) then
    raise exception 'COMMUNICATION_JOB_STATUS_MEMBERSHIP_UNSAFE';
  end if;
end
$postflight$;
