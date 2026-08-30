-- TEST_ONLY independent postcheck for the isolated local runtime broker.
--
-- Run after credential-broker-cleanup.sql with the same management
-- application_name and acquisition-digest GUC. This file performs no cleanup:
-- it proves the permanent metadata tombstone, zero runtime role/membership/
-- session residue, paired release disposition, and zero API-role capability.

\set ON_ERROR_STOP on

begin;

do $careslink_test_only_runtime_broker_postcheck$
declare
  v_schema pg_catalog.oid := pg_catalog.to_regnamespace(
    'careslink_test_only_runtime_broker'
  );
  v_table pg_catalog.oid := pg_catalog.to_regclass(
    'careslink_test_only_runtime_broker.acquisitions'
  );
  v_acquisition_digest pg_catalog.text := pg_catalog.current_setting(
    'careslink.runtime_broker.acquisition_digest', true
  );
  v_acquisition careslink_test_only_runtime_broker.acquisitions%rowtype;
  v_api_role pg_catalog.text;
  v_relation record;
  v_procedure record;
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runtime-credential-broker-management'
    or not coalesce(
      v_acquisition_digest ~ '^[a-f0-9]{64}$', false
    )
    or v_schema is null
    or v_table is null
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_POSTCHECK_UNSAFE';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_class as relation
    where relation.oid = v_table
      and relation.relkind = 'r'
      and relation.relowner = 'postgres'::pg_catalog.regrole
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) <> 1
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_LEDGER_POSTURE_INVALID';
  end if;

  if exists (
    select 1
    from careslink_test_only_runtime_broker.acquisitions as acquisition
    where acquisition.state not in ('TOMBSTONED', 'REVOKED')
      or acquisition.tombstoned_at is null
      or not acquisition.future_issuance_blocked
      or acquisition.raw_credential_material_present
      or acquisition.reusable
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_NONTERMINAL_ROW_REMAINS';
  end if;

  select acquisition.*
  into strict v_acquisition
  from careslink_test_only_runtime_broker.acquisitions as acquisition
  where acquisition.acquisition_digest = v_acquisition_digest;

  if v_acquisition.state <> 'REVOKED'
    or v_acquisition.tombstoned_at is null
    or not coalesce(
      v_acquisition.tombstone_transaction_id ~ '^[1-9][0-9]*$', false
    )
    or not v_acquisition.future_issuance_blocked
    or v_acquisition.revoked_at is null
    or v_acquisition.revoked_at < v_acquisition.tombstoned_at
    or v_acquisition.receipt_digest !~ '^[a-f0-9]{64}$'
    or v_acquisition.reusable
    or v_acquisition.raw_credential_material_present
    or not (
      (
        v_acquisition.issued_at is null
        and v_acquisition.runtime_role is null
        and v_acquisition.runtime_role_oid is null
        and v_acquisition.lease_reference_sha256 is null
        and v_acquisition.session_binding_sha256 is null
        and v_acquisition.credential_verifier_sha256 is null
        and v_acquisition.reported_session_disposition = 'NOT_ACQUIRED'
        and v_acquisition.reported_credential_disposition = 'NOT_ISSUED'
      )
      or (
        v_acquisition.issued_at is not null
        and v_acquisition.runtime_role ~
          '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
        and v_acquisition.runtime_role_oid is not null
        and v_acquisition.lease_reference_sha256 ~ '^[a-f0-9]{64}$'
        and v_acquisition.session_binding_sha256 ~ '^[a-f0-9]{64}$'
        and v_acquisition.credential_verifier_sha256 ~ '^[a-f0-9]{64}$'
        and v_acquisition.reported_session_disposition = 'DESTROYED'
        and v_acquisition.reported_credential_disposition = 'REVOKED'
      )
    )
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_TOMBSTONE_INVALID';
  end if;

  -- Issued identity metadata is deliberately retained forever in this local
  -- broker. The actual role, membership and backend must all be absent.
  if v_acquisition.runtime_role is not null and (
    exists (
      select 1
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_acquisition.runtime_role_oid
        or role_record.rolname = v_acquisition.runtime_role
    )
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_acquisition.runtime_role_oid
        or membership.roleid = v_acquisition.runtime_role_oid
        or membership.grantor = v_acquisition.runtime_role_oid
    )
    or exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.usesysid = v_acquisition.runtime_role_oid
        or activity.usename = v_acquisition.runtime_role
        or (
          v_acquisition.bound_backend_pid is not null
          and activity.pid = v_acquisition.bound_backend_pid
          and activity.backend_start = v_acquisition.bound_backend_start
        )
    )
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_RUNTIME_RESIDUE';
  end if;

  if exists (
    select 1
    from careslink_test_only_runtime_broker.acquisitions as acquisition
    join pg_catalog.pg_roles as role_record
      on role_record.oid = acquisition.runtime_role_oid
        or role_record.rolname = acquisition.runtime_role
  ) or exists (
    select 1
    from pg_catalog.pg_roles as role_record
    where role_record.rolname ~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_LOGIN_ROLE_REMAINS';
  end if;

  -- The ledger schema must be metadata-only. A SCRAM verifier digest is
  -- retained; the verifier itself, password, DSN and connection string are
  -- structurally absent.
  if exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = v_table
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attname in (
        'password', 'runtime_password', 'scram_verifier', 'dsn',
        'connection_string', 'database_url'
      )
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_RAW_CREDENTIAL_COLUMN';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.pronamespace = v_schema
      and (
        procedure.prosecdef
        or procedure.proconfig is null
        or pg_catalog.cardinality(procedure.proconfig) <> 1
        or procedure.proconfig[1] not in ('search_path=', 'search_path=""')
      )
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_FUNCTION_POSTURE_INVALID';
  end if;

  -- PUBLIC is ACL grantee OID 0, not a role name accepted by the has_* name
  -- overloads. Expand each effective object ACL and test that pseudo-role
  -- directly; column ACLs have no acldefault variant, so inspect non-null
  -- attribute ACLs separately.
  if exists (
    select 1
    from pg_catalog.pg_namespace as namespace_record
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        namespace_record.nspacl,
        pg_catalog.acldefault(
          'n'::pg_catalog."char", namespace_record.nspowner
        )
      )
    ) as public_acl
    where namespace_record.oid = v_schema
      and public_acl.grantee = 0::pg_catalog.oid
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_SCHEMA_LEAK: PUBLIC';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('r'::pg_catalog."char", relation.relowner)
      )
    ) as public_acl
    where relation.relnamespace = v_schema
      and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      and public_acl.grantee = 0::pg_catalog.oid
  ) or exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    cross join lateral pg_catalog.aclexplode(attribute.attacl) as public_acl
    where attribute.attrelid in (
        select relation.oid
        from pg_catalog.pg_class as relation
        where relation.relnamespace = v_schema
          and relation.relkind in ('r', 'p', 'v', 'm', 'f')
      )
      and attribute.attnum > 0
      and not attribute.attisdropped
      and public_acl.grantee = 0::pg_catalog.oid
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_TABLE_LEAK: PUBLIC';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault('S'::pg_catalog."char", relation.relowner)
      )
    ) as public_acl
    where relation.relnamespace = v_schema
      and relation.relkind = 'S'
      and public_acl.grantee = 0::pg_catalog.oid
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_SEQUENCE_LEAK: PUBLIC';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f'::pg_catalog."char", procedure.proowner)
      )
    ) as public_acl
    where procedure.pronamespace = v_schema
      and public_acl.grantee = 0::pg_catalog.oid
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_FUNCTION_LEAK: PUBLIC';
  end if;

  foreach v_api_role in array array[
    'anon', 'authenticated', 'service_role', 'authenticator'
  ] loop
    if pg_catalog.to_regrole(v_api_role) is null then
      raise exception 'TEST_ONLY_RUNTIME_BROKER_API_ROLE_MISSING: %',
        v_api_role;
    end if;

    if pg_catalog.has_schema_privilege(
        v_api_role, v_schema, 'USAGE'
      )
      or pg_catalog.has_schema_privilege(
        v_api_role, v_schema, 'CREATE'
      )
    then
      raise exception 'TEST_ONLY_RUNTIME_BROKER_SCHEMA_LEAK: %', v_api_role;
    end if;

    for v_relation in
      select relation.oid, relation.relkind
      from pg_catalog.pg_class as relation
      where relation.relnamespace = v_schema
    loop
      if v_relation.relkind in ('r', 'p', 'v', 'm', 'f') and (
        pg_catalog.has_table_privilege(
          v_api_role,
          v_relation.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
        or pg_catalog.has_any_column_privilege(
          v_api_role,
          v_relation.oid,
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
      ) then
        raise exception 'TEST_ONLY_RUNTIME_BROKER_TABLE_LEAK: %', v_api_role;
      end if;
      if v_relation.relkind = 'S' and pg_catalog.has_sequence_privilege(
        v_api_role, v_relation.oid, 'USAGE,SELECT,UPDATE'
      ) then
        raise exception 'TEST_ONLY_RUNTIME_BROKER_SEQUENCE_LEAK: %',
          v_api_role;
      end if;
    end loop;

    for v_procedure in
      select procedure.oid
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_schema
    loop
      if pg_catalog.has_function_privilege(
        v_api_role, v_procedure.oid, 'EXECUTE'
      ) then
        raise exception 'TEST_ONLY_RUNTIME_BROKER_FUNCTION_LEAK: %',
          v_api_role;
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    join pg_catalog.pg_roles as role_record
      on role_record.oid = membership.member
    where role_record.rolname in (
      'anon', 'authenticated', 'service_role', 'authenticator'
    )
      and (
        membership.roleid = 'postgres'::pg_catalog.regrole
        or membership.member = 'postgres'::pg_catalog.regrole
      )
  ) then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_API_MEMBERSHIP_LEAK';
  end if;

  -- A stale acquire replay must observe the durable fence, never recreate the
  -- credential. This direct state proof avoids handling a verifier again.
  if (
      careslink_test_only_runtime_broker.inspect(v_acquisition_digest)
      ->> 'status'
  ) <> 'REVOKED_ATTESTED'
    or (
      careslink_test_only_runtime_broker.inspect(v_acquisition_digest)
        ->> 'futureIssuanceBlocked'
    )::pg_catalog.bool is not true
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_INSPECT_FENCE_FAILED';
  end if;
end
$careslink_test_only_runtime_broker_postcheck$;

rollback;
