-- TEST_ONLY management drain for idle Session Pooler backends left after the
-- two runner clients disconnect. The caller must validate the exact disposable
-- non-Production Preview before submitting this fixed statement.

do $$
declare
  v_runner_session_count pg_catalog.int4;
  v_terminated_count pg_catalog.int4;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'CONCURRENCY_POOLER_DRAIN_MANAGEMENT_ROLE_UNSAFE';
  end if;

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
    raise exception 'CONCURRENCY_POOLER_DRAIN_RUNNER_POSTURE_UNSAFE';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
  into v_runner_session_count
  from pg_catalog.pg_stat_activity as activity
  where activity.usename =
    'careslink_v1_generation_concurrency_runner'
    and activity.backend_type = 'client backend';

  if v_runner_session_count > 2
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
    raise exception 'CONCURRENCY_POOLER_DRAIN_ACTIVE_RUNNER_SESSION';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
  into v_terminated_count
  from (
    select pg_catalog.pg_terminate_backend(activity.pid, 5000) as terminated
    from pg_catalog.pg_stat_activity as activity
    where activity.usename =
        'careslink_v1_generation_concurrency_runner'
      and activity.backend_type = 'client backend'
      and activity.datname = pg_catalog.current_database()
      and activity.application_name = 'Supavisor'
      and activity.state = 'idle'
      and activity.backend_xid is null
      and activity.backend_xmin is null
  ) as termination
  where termination.terminated is true;

  if v_terminated_count <> v_runner_session_count then
    raise exception 'CONCURRENCY_POOLER_DRAIN_FAILED';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_stat_activity as activity
    where activity.usename =
      'careslink_v1_generation_concurrency_runner'
      and activity.backend_type = 'client backend'
  ) then
    raise exception 'CONCURRENCY_POOLER_DRAIN_POSTCHECK_FAILED';
  end if;
end
$$;
