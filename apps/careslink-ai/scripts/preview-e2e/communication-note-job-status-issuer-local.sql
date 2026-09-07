-- Owned LOCAL PG16 fixture for the job-status issuer protocol. NOT a migration.
-- No remote installation: guard requires the private Unix-only test cluster.
-- Permanent metadata within the disposable cluster proves cross-connection
-- tombstones; neither a password nor its SCRAM verifier is stored in this table.
begin;
do $guard$
begin
  if current_user <> 'status_test_bootstrap' or session_user <> 'status_test_bootstrap'
    or current_database() <> 'postgres'
    or current_setting('server_version_num')::int / 10000 <> 16
    or current_setting('cluster_name') <> 'careslink-job-status-local-pg16'
    or current_setting('listen_addresses') <> '' or inet_server_addr() is not null
    or current_setting('unix_socket_permissions') <> '0700'
    or current_setting('unix_socket_directories') !~ '^/private/tmp/cl-job-status-[a-zA-Z0-9]{6}/socket$'
  then raise exception 'LOCAL_ISSUER_TARGET_DENIED'; end if;
end $guard$;
-- Restricted server settings are attested by the already-owned bootstrap
-- connection. DDL still runs as the non-superuser operator; do not grant the
-- issuer pg_read_all_settings just to inspect a private fixture path.
set local role postgres;
create schema careslink_job_status_issuer authorization postgres;
revoke all on schema careslink_job_status_issuer from public;
create table careslink_job_status_issuer.acquisitions (
  digest text primary key check (digest ~ '^[a-f0-9]{64}$'),
  target_digest text not null check (target_digest ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('ISSUED','BOUND','FENCED','REVOKED')),
  runtime_role text unique check (runtime_role ~ '^careslink_v1_job_status_runtime_[a-f0-9]{16}$'),
  runtime_oid oid unique,
  lease text unique,
  binding text unique,
  issued_at timestamptz,
  expires_at timestamptz,
  backend_pid int,
  backend_start timestamptz,
  fence_xid text
);
alter table careslink_job_status_issuer.acquisitions enable row level security;
alter table careslink_job_status_issuer.acquisitions force row level security;
revoke all on careslink_job_status_issuer.acquisitions from public;

-- Invoker-only and not granted to any runtime/API role. The fixture operator
-- holds role-management privileges; application query credentials never do.
create function careslink_job_status_issuer.call(op text, data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $issuer$
declare
  d text := data->>'digest'; t text := data->>'targetDigest';
  a careslink_job_status_issuer.acquisitions%rowtype;
  r text; verifier text; until_time timestamptz; issued timestamptz;
  backend record; role_count int; session_count int; member_count int;
begin
  if current_user <> 'postgres' or session_user <> 'postgres'
    or current_setting('cluster_name') <> 'careslink-job-status-local-pg16'
    or inet_server_addr() is not null or current_setting('listen_addresses') <> ''
    or not coalesce(d ~ '^[a-f0-9]{64}$' and t ~ '^[a-f0-9]{64}$',false)
    or op not in ('acquire','bind','fence','finalize')
  then raise exception 'ISSUER_DENIED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(d,7193204));
  select * into a from careslink_job_status_issuer.acquisitions where digest=d;
  if found and a.target_digest <> t then raise exception 'ISSUER_TARGET_MISMATCH'; end if;
  if op='acquire' then
    if a.digest is not null then raise exception 'ISSUER_REPLAY_DENIED'; end if;
    r := data->>'role'; verifier := data->>'verifier';
    until_time := (data->>'expiresAt')::timestamptz; issued := clock_timestamp();
    if not coalesce(r ~ '^careslink_v1_job_status_runtime_[a-f0-9]{16}$'
      and verifier ~ '^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'
      and (data->>'lease') ~ '^[a-f0-9]{64}$'
      and until_time > issued + interval '25 seconds'
      and until_time <= issued + interval '90 seconds',false)
    then raise exception 'ISSUER_REQUEST_DENIED'; end if;
    execute pg_catalog.format('create role %I login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 1 password %L valid until %L',r,verifier,until_time);
    execute pg_catalog.format('grant careslink_v1_generation_job_status_caller to %I with admin false, inherit false, set true',r);
    insert into careslink_job_status_issuer.acquisitions
      (digest,target_digest,state,runtime_role,runtime_oid,lease,issued_at,expires_at)
    values(d,t,'ISSUED',r,r::regrole::oid,data->>'lease',issued,until_time);
  elsif op='bind' then
    if a.state is distinct from 'ISSUED' or clock_timestamp() >= a.expires_at
      or not coalesce((data->>'binding') ~ '^[a-f0-9]{64}$',false)
    then raise exception 'ISSUER_BIND_DENIED'; end if;
    perform pg_catalog.pg_stat_clear_snapshot();
    select * into backend from pg_catalog.pg_stat_activity
      where pid=(data->>'pid')::int and date_trunc('milliseconds',backend_start)=(data->>'start')::timestamptz
        and usesysid=a.runtime_oid and usename=a.runtime_role
        and backend_type='client backend';
    if not found or backend.backend_start < a.issued_at - interval '1 second'
      or (select count(*) from pg_catalog.pg_stat_activity where usesysid=a.runtime_oid) <> 1
    then raise exception 'ISSUER_BACKEND_MISMATCH'; end if;
    -- Commit this login fence before returning the active single-use lease.
    -- Expiry and CONNECTION LIMIT do not revoke existing sessions by themselves.
    execute pg_catalog.format('alter role %I nologin password null',a.runtime_role);
    update careslink_job_status_issuer.acquisitions set state='BOUND',
      backend_pid=backend.pid,backend_start=backend.backend_start,binding=data->>'binding'
      where digest=d;
  elsif op='fence' then
    if a.digest is null then
      insert into careslink_job_status_issuer.acquisitions(digest,target_digest,state,fence_xid)
        values(d,t,'FENCED',pg_catalog.pg_current_xact_id()::text);
    elsif a.state in ('ISSUED','BOUND') then
      if not exists (select 1 from pg_catalog.pg_roles where oid=a.runtime_oid and rolname=a.runtime_role)
      then raise exception 'ISSUER_ROLE_IDENTITY_CHANGED'; end if;
      execute pg_catalog.format('alter role %I nologin password null',a.runtime_role);
      update careslink_job_status_issuer.acquisitions set state='FENCED',
        fence_xid=pg_catalog.pg_current_xact_id()::text where digest=d;
    end if;
  elsif op='finalize' then
    if a.state is null or a.state not in ('FENCED','REVOKED')
      or a.fence_xid=pg_catalog.pg_current_xact_id()::text
    then raise exception 'ISSUER_COMMITTED_FENCE_REQUIRED'; end if;
    if a.runtime_role is not null then
      if exists (select 1 from pg_catalog.pg_roles
        where (oid=a.runtime_oid or rolname=a.runtime_role)
          and (oid<>a.runtime_oid or rolname<>a.runtime_role or rolcanlogin))
      then raise exception 'ISSUER_ROLE_IDENTITY_CHANGED'; end if;
      perform pg_catalog.pg_stat_clear_snapshot();
      for backend in select pid from pg_catalog.pg_stat_activity
        where usesysid=a.runtime_oid or usename=a.runtime_role
      loop
        if backend.pid=pg_catalog.pg_backend_pid()
          or not pg_catalog.pg_terminate_backend(backend.pid,1000)
        then raise exception 'ISSUER_TERMINATION_FAILED'; end if;
      end loop;
      perform pg_catalog.pg_stat_clear_snapshot();
      if exists (select 1 from pg_catalog.pg_stat_activity
        where usesysid=a.runtime_oid or usename=a.runtime_role
          or (pid=a.backend_pid and backend_start=a.backend_start))
      then raise exception 'ISSUER_SESSION_REMAINS'; end if;
      if exists (select 1 from pg_catalog.pg_roles where oid=a.runtime_oid and rolname=a.runtime_role) then
        -- RESTRICT: unexpected ownership/dependencies are a cleanup failure.
        execute pg_catalog.format('revoke careslink_v1_generation_job_status_caller from %I',a.runtime_role);
        execute pg_catalog.format('drop role %I',a.runtime_role);
      end if;
    end if;
    update careslink_job_status_issuer.acquisitions set state='REVOKED' where digest=d;
  end if;
  select * into strict a from careslink_job_status_issuer.acquisitions where digest=d;
  perform pg_catalog.pg_stat_clear_snapshot();
  select count(*) into role_count from pg_catalog.pg_roles where oid=a.runtime_oid or rolname=a.runtime_role;
  select count(*) into session_count from pg_catalog.pg_stat_activity
    where usesysid=a.runtime_oid or usename=a.runtime_role
      or (pid=a.backend_pid and backend_start=a.backend_start);
  select count(*) into member_count from pg_catalog.pg_auth_members
    where roleid=a.runtime_oid or member=a.runtime_oid or grantor=a.runtime_oid;
  if a.state='REVOKED' and (role_count<>0 or session_count<>0 or member_count<>0)
    then raise exception 'ISSUER_RESIDUE'; end if;
  return pg_catalog.jsonb_build_object(
    'digest',d,'targetDigest',t,'state',a.state,'role',a.runtime_role,
    'oid',a.runtime_oid::text,'lease',a.lease,'binding',a.binding,
    'issuedAt',to_char(a.issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt',to_char(a.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'roleCount',role_count,'sessionCount',session_count,'membershipCount',member_count);
end $issuer$;
revoke all on function careslink_job_status_issuer.call(text,jsonb) from public;
commit;
