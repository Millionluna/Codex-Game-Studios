-- TEST_ONLY quiesce body. The harness commits this NOLOGIN transition before
-- closing the runtime client and draining only exact idle role backends.

do $careslink_runner_terminal_identity$
declare
  v_runtime_name pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_identity.runtime_role', true
  );
  v_runtime pg_catalog.oid := pg_catalog.to_regrole(v_runtime_name);
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runner-terminal-identity-management'
    or v_runtime_name !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  then
    raise exception 'RUNNER_TERMINAL_IDENTITY_QUIESCE_MANAGEMENT_UNSAFE';
  end if;

  if v_runtime is not null then
    execute pg_catalog.format('alter role %I nologin', v_runtime_name);
  end if;

  if v_runtime is not null and (
    select role_record.rolcanlogin
    from pg_catalog.pg_roles as role_record
    where role_record.oid = v_runtime
  ) then
    raise exception 'RUNNER_TERMINAL_IDENTITY_QUIESCE_POSTCHECK_FAILED';
  end if;
end
$careslink_runner_terminal_identity$;
