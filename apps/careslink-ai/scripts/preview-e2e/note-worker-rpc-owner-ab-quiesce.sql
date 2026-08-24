-- TEST_ONLY quiesce for the disposable local PostgreSQL 16 owner A/B runner.
-- Run after the live client disconnects and before the fixed cleanup. NOLOGIN
-- commits independently so any later cleanup failure remains fail-closed.

begin;

do $$
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.inet_server_addr() is distinct from
      '127.0.0.1'::pg_catalog.inet
    or pg_catalog.inet_server_port() is distinct from 55432
    or pg_catalog.current_setting('application_name') <>
      'careslink-worker-rpc-owner-ab-management'
    or pg_catalog.current_setting(
      'careslink.owner_ab.local_bootstrap', true
    ) is distinct from '2026-08-24.local-pg16.1'
    or pg_catalog.current_setting('cluster_name') <>
      'careslink-owner-ab-pg16'
    or pg_catalog.current_setting('data_directory') !~
      '^/private/tmp/careslink-owner-ab-pg16\.[[:alnum:]]+$'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4
      not between 160000 and 169999
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.rolname =
          'careslink_v1_generation_owner_ab_runner'
        and not role_record.rolsuper
        and not role_record.rolbypassrls
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and role_record.rolconnlimit = 1
    ) <> 1
  then
    raise exception 'OWNER_AB_QUIESCE_TARGET_UNSAFE';
  end if;
end
$$;

alter role careslink_v1_generation_owner_ab_runner nologin;

commit;

begin;

do $$
begin
  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.rolname =
          'careslink_v1_generation_owner_ab_runner'
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolbypassrls
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and role_record.rolconnlimit = 1
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.usename =
          'careslink_v1_generation_owner_ab_runner'
        and activity.backend_type = 'client backend'
    )
  then
    raise exception 'OWNER_AB_QUIESCE_NOT_CLOSED';
  end if;
end
$$;

commit;
