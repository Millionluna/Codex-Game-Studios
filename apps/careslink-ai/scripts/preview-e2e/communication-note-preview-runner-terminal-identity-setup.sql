-- TEST_ONLY setup body for one disposable Preview runner-terminal LOGIN.
-- The harness owns the transaction and supplies role, password, expiry and
-- expected PostgreSQL major through transaction-local parameterized GUCs.

do $careslink_runner_terminal_identity$
declare
  v_runtime_name pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_identity.runtime_role', true
  );
  v_runtime_password pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_identity.runtime_password', true
  );
  v_runtime_expires_at pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_identity.runtime_expires_at', true
  );
  v_expected_major pg_catalog.int4 := pg_catalog.current_setting(
    'careslink.runner_terminal_identity.expected_pg_major', true
  )::pg_catalog.int4;
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_exact_rpc pg_catalog.oid := pg_catalog.to_regprocedure(
    'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)'
  );
  v_unsigned_rpc pg_catalog.oid := pg_catalog.to_regprocedure(
    'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)'
  );
  v_runtime pg_catalog.oid;
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runner-terminal-identity-management'
    or pg_catalog.current_setting('password_encryption') <>
      'scram-sha-256'
    or v_expected_major not in (16, 17)
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 <> v_expected_major
    or not (
      select role_record.rolcreaterole
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = current_user
    )
  then
    raise exception 'RUNNER_TERMINAL_IDENTITY_SETUP_MANAGEMENT_UNSAFE';
  end if;

  if v_runtime_name !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
    or pg_catalog.length(v_runtime_name) <> 61
    or v_runtime_password !~ '^[A-Za-z0-9_-]{43}$'
    or v_runtime_expires_at::pg_catalog.timestamptz <=
      pg_catalog.clock_timestamp()
    or v_runtime_expires_at::pg_catalog.timestamptz >
      pg_catalog.clock_timestamp() + pg_catalog.make_interval(mins => 15)
    or pg_catalog.to_regrole(v_runtime_name) is not null
  then
    raise exception 'RUNNER_TERMINAL_IDENTITY_SETUP_MANAGEMENT_UNSAFE';
  end if;

  if v_caller is null
    or v_exact_rpc is null
    or v_unsigned_rpc is not null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_caller
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = v_exact_rpc
        and procedure.proowner =
          'careslink_v1_preview_runner_terminal_executor'::pg_catalog.regrole
        and procedure.prosecdef
        and procedure.provolatile = 'v'
        and procedure.prorettype =
          'pg_catalog.jsonb'::pg_catalog.regtype
        and procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
    ) <> 1
    or not pg_catalog.has_function_privilege(
      v_caller, v_exact_rpc, 'EXECUTE'
    )
    or pg_catalog.has_schema_privilege(
      v_caller, 'careslink_v1_generation', 'CREATE'
    )
  then
    raise exception 'RUNNER_TERMINAL_IDENTITY_SETUP_CONTRACT_DRIFT';
  end if;

  if exists (
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
  ) then
    raise exception 'RUNNER_TERMINAL_IDENTITY_SETUP_LEDGER_NOT_EMPTY';
  end if;

  execute pg_catalog.format(
    'create role %I with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 1 password %L valid until %L',
    v_runtime_name,
    v_runtime_password,
    v_runtime_expires_at
  );
  execute pg_catalog.format(
    'grant careslink_v1_preview_runner_terminal_caller to %I with admin false, inherit false, set true',
    v_runtime_name
  );
  v_runtime := pg_catalog.to_regrole(v_runtime_name);
  v_runtime_password := null;

  if v_runtime is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runtime
        and role_record.rolcanlogin
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
        and membership.grantor = current_user::pg_catalog.regrole
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
    ) <> 1
    or pg_catalog.pg_has_role(v_runtime, v_caller, 'USAGE')
    or not pg_catalog.pg_has_role(v_runtime, v_caller, 'MEMBER')
    or not pg_catalog.pg_has_role(v_runtime, v_caller, 'SET')
    or pg_catalog.pg_has_role(
      v_runtime,
      'careslink_v1_preview_runner_terminal_executor',
      'MEMBER'
    )
    or pg_catalog.pg_has_role('authenticator', v_runtime, 'SET')
    or pg_catalog.pg_has_role(v_runtime, 'anon', 'MEMBER')
    or pg_catalog.pg_has_role(v_runtime, 'authenticated', 'MEMBER')
    or pg_catalog.pg_has_role(v_runtime, 'service_role', 'MEMBER')
    or pg_catalog.has_function_privilege(
      v_runtime, v_exact_rpc, 'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation.relnamespace
      where namespace_record.nspname in (
          'auth', 'public', 'careslink_v1_generation'
        )
        and relation.relkind in ('r', 'p', 'v', 'm', 'f')
        and (
          pg_catalog.has_table_privilege(
            v_runtime, relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
          or pg_catalog.has_any_column_privilege(
            v_runtime, relation.oid,
            'SELECT,INSERT,UPDATE,REFERENCES'
          )
        )
    )
  then
    raise exception 'RUNNER_TERMINAL_IDENTITY_SETUP_POSTCHECK_FAILED';
  end if;
end
$careslink_runner_terminal_identity$;
