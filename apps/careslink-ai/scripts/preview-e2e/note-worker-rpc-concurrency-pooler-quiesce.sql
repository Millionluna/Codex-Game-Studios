-- TEST_ONLY management quiesce for the disposable concurrency runner. Submit
-- this as its own committed request before the paired pooler-drain and cleanup
-- requests so Supavisor cannot replace an idle backend after termination.

do $$
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'CONCURRENCY_POOLER_QUIESCE_MANAGEMENT_ROLE_UNSAFE';
  end if;

  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.rolname =
          'careslink_v1_generation_concurrency_runner'
        and role_record.rolcanlogin is true
        and role_record.rolsuper is false
        and role_record.rolbypassrls is false
        and role_record.rolcreatedb is false
        and role_record.rolcreaterole is false
        and role_record.rolinherit is false
        and role_record.rolreplication is false
        and role_record.rolconnlimit = 2
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_stat_activity as activity
      where activity.usename =
          'careslink_v1_generation_concurrency_runner'
        and activity.backend_type = 'client backend'
    ) > 2
    or exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.usename =
          'careslink_v1_generation_concurrency_runner'
        and (
          activity.backend_type <> 'client backend'
          or activity.datname <> pg_catalog.current_database()
          or activity.application_name <> 'Supavisor'
          or activity.state <> 'idle'
          or activity.backend_xid is not null
          or activity.backend_xmin is not null
        )
    )
  then
    raise exception 'CONCURRENCY_POOLER_QUIESCE_ACTIVE_RUNNER_SESSION';
  end if;
end
$$;

alter role careslink_v1_generation_concurrency_runner nologin;

do $$
begin
  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.rolname =
          'careslink_v1_generation_concurrency_runner'
        and role_record.rolcanlogin is false
        and role_record.rolsuper is false
        and role_record.rolbypassrls is false
        and role_record.rolcreatedb is false
        and role_record.rolcreaterole is false
        and role_record.rolinherit is false
        and role_record.rolreplication is false
        and role_record.rolconnlimit = 2
    ) <> 1
  then
    raise exception 'CONCURRENCY_POOLER_QUIESCE_POSTCHECK_FAILED';
  end if;
end
$$;
