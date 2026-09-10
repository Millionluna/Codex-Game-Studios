-- Unpromoted task-list issuer candidate. No application/API grants or new
-- management LOGIN. Run only on a separately attested no-data Preview after
-- approval. The dedicated control connection establishes target identity.
-- Cookie/session authentication remains at the reader; this issuer accepts
-- only its trusted service's scope and never exposes a public RPC.
begin;
do $guard$
begin
  if current_user <> 'postgres' or session_user <> 'postgres' or current_database() <> 'postgres'
    or current_setting('server_version_num')::int/10000 not in (16,17)
    or current_setting('max_prepared_transactions')::int <> 0
    or not exists(select 1 from pg_catalog.pg_roles where rolname='postgres' and not rolsuper and rolcreaterole and rolbypassrls)
    or not pg_catalog.pg_has_role('postgres','pg_read_all_stats','USAGE')
    or not pg_catalog.pg_has_role('postgres','pg_signal_backend','USAGE')
    or not exists(select 1 from pg_catalog.pg_roles where rolname='careslink_v1_generation_job_list_caller'
      and not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit
      and not rolbypassrls and not rolreplication)
    or pg_catalog.to_regnamespace('careslink_task_preview_issuer') is not null
  then raise exception 'TASK_ISSUER_INSTALL_DENIED'; end if;
end $guard$;
create schema careslink_task_preview_issuer authorization postgres;
revoke all on schema careslink_task_preview_issuer from public,anon,authenticated,service_role,authenticator;
create table careslink_task_preview_issuer.control (
  singleton boolean primary key default true check(singleton),
  project_ref text not null, epoch text not null, ready boolean not null default false
);
create table careslink_task_preview_issuer.leases (
  id text primary key, scope jsonb not null,
  state text not null check(state in ('ISSUED','FENCED','REVOKED')),
  role_name text unique, role_oid oid unique, expires_at timestamptz, fence_xid text,
  check ((role_name is null and role_oid is null and expires_at is null and state='REVOKED')
    or (role_name is not null and role_oid is not null and expires_at is not null
      and role_name ~ '^careslink_v1_job_list_runtime_[a-f0-9]{16}$')),
  check ((state='ISSUED' and fence_xid is null) or (state<>'ISSUED' and fence_xid is not null))
);
alter table careslink_task_preview_issuer.control enable row level security;
alter table careslink_task_preview_issuer.control force row level security;
alter table careslink_task_preview_issuer.leases enable row level security;
alter table careslink_task_preview_issuer.leases force row level security;
revoke all on all tables in schema careslink_task_preview_issuer from public,anon,authenticated,service_role,authenticator;

create function careslink_task_preview_issuer.call(op text,data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $issuer$
declare
  c careslink_task_preview_issuer.control%rowtype;
  l careslink_task_preview_issuer.leases%rowtype;
  s jsonb := data->'scope'; p text; e text := data->>'epoch'; request_id text;
  r text; verifier text; expiry timestamptz; backend record;
  nrole int; nsession int; nmember int; items jsonb;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' or current_database() <> 'postgres'
    or current_setting('server_version_num')::int/10000 not in (16,17)
    or current_setting('max_prepared_transactions')::int <> 0
    or not exists(select 1 from pg_catalog.pg_roles where rolname='postgres' and not rolsuper and rolcreaterole and rolbypassrls)
    or not pg_catalog.pg_has_role('postgres','pg_read_all_stats','USAGE')
    or not pg_catalog.pg_has_role('postgres','pg_signal_backend','USAGE')
    or op is null or op not in ('start','inventory','ready','issue','fence','finalize')
    or jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>8192
  then raise exception 'TASK_ISSUER_DENIED'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(data) as key) is distinct from
    (case when op in ('start','inventory','ready') then array['epoch','projectRef']
      when op='issue' then array['epoch','expiresAt','role','scope','verifier'] else array['scope'] end)
  then raise exception 'TASK_ISSUER_REQUEST_DENIED'; end if;
  if op in ('start','inventory','ready') then
    p := data->>'projectRef';
    if not coalesce(length(e)=32 and e ~ '^[a-f0-9]{32}$',false) then raise exception 'TASK_ISSUER_EPOCH_DENIED'; end if;
  else
    p := s->>'projectRef'; request_id := s->>'requestId';
    if jsonb_typeof(s) is distinct from 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(s) as key)
        is distinct from array['callerRole','principal','projectRef','purpose','requestId']
      or jsonb_typeof(s->'principal') is distinct from 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(s->'principal') as key)
        is distinct from array['sessionId','transport','userId']
      or not coalesce(length(request_id)=32 and request_id ~ '^[a-f0-9]{32}$'
        and s->>'purpose'='COMMUNICATION_NOTE_JOB_LIST_READ'
        and s->>'callerRole'='careslink_v1_generation_job_list_caller'
        and s#>>'{principal,transport}'='COOKIE'
        and length(s#>>'{principal,userId}')=36 and (s#>>'{principal,userId}') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
        and length(s#>>'{principal,sessionId}')=36 and (s#>>'{principal,sessionId}') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',false)
    then raise exception 'TASK_ISSUER_SCOPE_DENIED'; end if;
  end if;
  if not coalesce(length(p)=20 and p ~ '^[a-z0-9]{20}$' and p<>'adocsnwnslxhxcjgbyee',false)
  then raise exception 'TASK_ISSUER_TARGET_DENIED'; end if;
  -- Serialize issuance, epoch takeover and terminal tombstones, including
  -- cancellation arriving BEFORE an uncertain issue. No network inside SQL.
  perform pg_catalog.pg_advisory_xact_lock(7193205);
  select * into c from careslink_task_preview_issuer.control where singleton;
  if c.project_ref is not null and c.project_ref<>p then raise exception 'TASK_ISSUER_TARGET_DENIED'; end if;
  if op='start' then
    if c.epoch=e then raise exception 'TASK_ISSUER_EPOCH_REPLAY'; end if;
    insert into careslink_task_preview_issuer.control(singleton,project_ref,epoch,ready) values(true,p,e,false)
      on conflict(singleton) do update set epoch=excluded.epoch,ready=false;
    return jsonb_build_object('projectRef',p,'epoch',e,'ready',false);
  end if;
  if op in ('inventory','ready','issue') and (c.epoch is null or c.epoch is distinct from e)
  then raise exception 'TASK_ISSUER_STALE_EPOCH'; end if;
  if op='inventory' then
    select jsonb_agg(jsonb_build_object('scope',x.scope,'state',x.state,
      'expiresAt',to_char(x.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by x.id)
      into items from (select * from careslink_task_preview_issuer.leases where state<>'REVOKED' order by id limit 5) x;
    if jsonb_array_length(coalesce(items,'[]'::jsonb))>4 then raise exception 'TASK_ISSUER_INVENTORY_UNBOUNDED'; end if;
    return jsonb_build_object('projectRef',p,'epoch',e,'leases',coalesce(items,'[]'::jsonb));
  elsif op='ready' then
    if exists(select 1 from careslink_task_preview_issuer.leases where state<>'REVOKED')
    then raise exception 'TASK_ISSUER_RECOVERY_REQUIRED'; end if;
    update careslink_task_preview_issuer.control set ready=true where singleton;
    return jsonb_build_object('projectRef',p,'epoch',e,'ready',true);
  end if;
  select * into l from careslink_task_preview_issuer.leases where leases.id=request_id;
  if l.id is not null and l.scope<>s then raise exception 'TASK_ISSUER_SCOPE_CHANGED'; end if;
  if op='issue' then
    if c.ready is distinct from true or l.id is not null then raise exception 'TASK_ISSUER_REPLAY_DENIED'; end if;
    if (select count(*) from careslink_task_preview_issuer.leases where state<>'REVOKED')>=4
      or (select count(*) from careslink_task_preview_issuer.leases)>=4096
    then raise exception 'TASK_ISSUER_CAPACITY'; end if;
    r:=data->>'role'; verifier:=data->>'verifier'; expiry:=(data->>'expiresAt')::timestamptz;
    if not coalesce(length(r)=length('careslink_v1_job_list_runtime_')+16
      and r ~ '^careslink_v1_job_list_runtime_[a-f0-9]{16}$'
      and verifier ~ '^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'
      and expiry>clock_timestamp()+interval '25 seconds' and expiry<=clock_timestamp()+interval '60 seconds',false)
    then raise exception 'TASK_ISSUER_CREDENTIAL_DENIED'; end if;
    execute pg_catalog.format('create role %I login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 2 password %L valid until %L',r,verifier,expiry);
    execute pg_catalog.format('grant careslink_v1_generation_job_list_caller to %I with admin false,inherit false,set true',r);
    insert into careslink_task_preview_issuer.leases(id,scope,state,role_name,role_oid,expires_at)
      values(request_id,s,'ISSUED',r,r::regrole::oid,expiry);
    if expiry<=clock_timestamp()+interval '25 seconds' then raise exception 'TASK_ISSUER_EXPIRED'; end if;
  elsif op='fence' then
    if l.id is null then
      insert into careslink_task_preview_issuer.leases(id,scope,state,fence_xid)
        values(request_id,s,'REVOKED',pg_catalog.pg_current_xact_id()::text);
    elsif l.state='ISSUED' then
      if not exists(select 1 from pg_catalog.pg_roles where oid=l.role_oid and rolname=l.role_name)
      then raise exception 'TASK_ISSUER_ROLE_CHANGED'; end if;
      execute pg_catalog.format('alter role %I nologin password null',l.role_name);
      update careslink_task_preview_issuer.leases set state='FENCED',fence_xid=pg_catalog.pg_current_xact_id()::text where leases.id=request_id;
    end if;
  elsif op='finalize' then
    if l.state is null or l.state not in ('FENCED','REVOKED') or l.fence_xid=pg_catalog.pg_current_xact_id()::text
    then raise exception 'TASK_ISSUER_COMMITTED_FENCE_REQUIRED'; end if;
    if l.role_name is not null then
      if exists(select 1 from pg_catalog.pg_roles where (oid=l.role_oid or rolname=l.role_name)
        and (oid<>l.role_oid or rolname<>l.role_name or rolcanlogin)) then raise exception 'TASK_ISSUER_ROLE_CHANGED'; end if;
      perform pg_catalog.pg_stat_clear_snapshot();
      for backend in select pid from pg_catalog.pg_stat_activity where usesysid=l.role_oid or usename=l.role_name loop
        if backend.pid=pg_catalog.pg_backend_pid() or not pg_catalog.pg_terminate_backend(backend.pid,1000)
        then raise exception 'TASK_ISSUER_TERMINATION_FAILED'; end if;
      end loop;
      perform pg_catalog.pg_stat_clear_snapshot();
      if exists(select 1 from pg_catalog.pg_stat_activity where usesysid=l.role_oid or usename=l.role_name)
      then raise exception 'TASK_ISSUER_SESSION_REMAINS'; end if;
      if exists(select 1 from pg_catalog.pg_roles where oid=l.role_oid and rolname=l.role_name) then
        execute pg_catalog.format('revoke careslink_v1_generation_job_list_caller from %I',l.role_name);
        execute pg_catalog.format('drop role %I',l.role_name); -- RESTRICT, never DROP OWNED/CASCADE.
      end if;
    end if;
    update careslink_task_preview_issuer.leases set state='REVOKED' where leases.id=request_id;
  end if;
  select * into strict l from careslink_task_preview_issuer.leases where leases.id=request_id;
  perform pg_catalog.pg_stat_clear_snapshot();
  select count(*) into nrole from pg_catalog.pg_roles where oid=l.role_oid or rolname=l.role_name;
  select count(*) into nsession from pg_catalog.pg_stat_activity where usesysid=l.role_oid or usename=l.role_name;
  select count(*) into nmember from pg_catalog.pg_auth_members where roleid=l.role_oid or member=l.role_oid or grantor=l.role_oid;
  if l.state='REVOKED' and (nrole<>0 or nsession<>0 or nmember<>0) then raise exception 'TASK_ISSUER_RESIDUE'; end if;
  return jsonb_build_object('scope',l.scope,'state',l.state,'role',l.role_name,
    'expiresAt',to_char(l.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'roleCount',nrole,'sessionCount',nsession,'membershipCount',nmember);
end $issuer$;
revoke all on function careslink_task_preview_issuer.call(text,jsonb) from public,anon,authenticated,service_role,authenticator;
do $acl$
begin
  if exists(select 1 from pg_catalog.pg_namespace n,
    lateral pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
    where n.nspname='careslink_task_preview_issuer' and a.grantee<>n.nspowner)
  or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace,
    lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    where n.nspname='careslink_task_preview_issuer' and c.relkind='r' and a.grantee<>c.relowner)
  or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where n.nspname='careslink_task_preview_issuer' and a.grantee<>p.proowner)
  then raise exception 'TASK_ISSUER_UNEXPECTED_ACL'; end if;
end $acl$;
commit;
