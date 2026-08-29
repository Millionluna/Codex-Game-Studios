-- TEST_ONLY cleanup body. The harness reaches this only after NOLOGIN has
-- committed, the runtime client has closed and exact idle backends are gone.

do $careslink_runner_terminal_identity$
declare
  v_runtime_name pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_identity.runtime_role', true
  );
  v_runtime pg_catalog.oid := pg_catalog.to_regrole(v_runtime_name);
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runner-terminal-identity-management'
    or v_runtime_name !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  then
    raise exception 'RUNNER_TERMINAL_IDENTITY_CLEANUP_MANAGEMENT_UNSAFE';
  end if;

  if v_runtime is null then
    return;
  end if;
  if exists (
    select 1
    from pg_catalog.pg_stat_activity as activity
    where activity.usename = v_runtime_name
      and activity.backend_type = 'client backend'
  ) then
    raise exception 'RUNNER_TERMINAL_IDENTITY_CLEANUP_ACTIVE_SESSION';
  end if;

  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runtime
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = 1
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
        and membership.roleid = v_caller
        and not membership.admin_option
        and not membership.inherit_option
        and membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
    ) <> 1
  then
    raise exception 'RUNNER_TERMINAL_IDENTITY_CLEANUP_SURFACE_UNSAFE';
  end if;

  execute pg_catalog.format(
    'revoke careslink_v1_preview_runner_terminal_caller from %I',
    v_runtime_name
  );
  execute pg_catalog.format('drop role %I', v_runtime_name);

  if pg_catalog.to_regrole(v_runtime_name) is not null
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
        or membership.roleid = v_runtime
        or membership.grantor = v_runtime
    )
    or exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.usename = v_runtime_name
    )
    or exists (
      select 1 from careslink_v1_generation.communication_note_preview_authorizations
      union all
      select 1 from careslink_v1_generation.communication_note_preview_authorization_revocations
      union all
      select 1 from careslink_v1_generation.communication_note_preview_claims
      union all
      select 1 from careslink_v1_generation.communication_note_preview_dispatch_reservations
      union all
      select 1 from careslink_v1_generation.communication_note_preview_dispatch_receipts
      union all
      select 1 from careslink_v1_generation.communication_note_preview_runner_terminals
    )
  then
    raise exception 'RUNNER_TERMINAL_IDENTITY_CLEANUP_ZERO_RESIDUE_FAILED';
  end if;
end
$careslink_runner_terminal_identity$;
