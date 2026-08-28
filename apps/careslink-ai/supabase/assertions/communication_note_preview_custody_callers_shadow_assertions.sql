-- Manual rollback-only assertions for a fresh disposable PostgreSQL 16+
-- database after every repository migration has been applied. Submit this
-- whole file as one psql request so BEGIN through ROLLBACK share the
-- transaction-only TEST_ONLY SET-role edges.
--
-- M1g-c adds four empty NOLOGIN caller shells and ACL/role metadata only,
-- including at most PostgreSQL 16's non-usable creator ADMIN bootstrap edges.
-- This file creates no key, credential, authorization, dispatch, receipt,
-- provider call, paid model request or hosted mutation.

\set ON_ERROR_STOP on

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

-- Prove the durable role posture before adding rollback-only SET edges.
do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_role_name text;
  v_role_oid oid;
  v_entry_actor_super boolean;
  v_edge_count integer;
  v_expected_edges integer;
  v_has_password boolean;
begin
  if current_setting('server_version_num')::integer < 160000 then
    raise exception
      'communication-note Preview caller assertions require PostgreSQL 16+';
  end if;

  if v_schema is null then
    raise exception 'communication-note Preview private schema missing';
  end if;

  select role.rolsuper
  into v_entry_actor_super
  from pg_catalog.pg_roles as role
  where role.oid = current_user::regrole;

  foreach v_role_name in array array[
    'careslink_v1_preview_authorization_registration_caller',
    'careslink_v1_preview_authorization_revocation_caller',
    'careslink_v1_preview_dispatch_caller',
    'careslink_v1_preview_receipt_caller'
  ] loop
    v_role_oid := to_regrole(v_role_name);

    if v_role_oid is null or (
      select count(*)
      from pg_catalog.pg_roles as role
      where role.oid = v_role_oid
        and not role.rolcanlogin
        and not role.rolsuper
        and not role.rolcreatedb
        and not role.rolcreaterole
        and not role.rolinherit
        and not role.rolreplication
        and not role.rolbypassrls
        and role.rolconnlimit = -1
        and role.rolvaliduntil is null
        and role.rolconfig is null
    ) <> 1 then
      raise exception 'unsafe Preview caller role attributes: %', v_role_name;
    end if;

    -- pg_roles intentionally masks every password as ********. Only a
    -- superuser assertion actor can distinguish NULL through pg_authid; a
    -- non-superuser still proves NOLOGIN and every usable privilege boundary.
    if v_entry_actor_super then
      execute $query$
        select exists (
          select 1
          from pg_catalog.pg_authid as role
          where role.oid = $1
            and role.rolpassword is not null
        )
      $query$
      into v_has_password
      using v_role_oid;
      if v_has_password then
        raise exception 'Preview caller has a password: %', v_role_name;
      end if;
    end if;

    select count(*)
    into v_edge_count
    from pg_catalog.pg_auth_members as membership
    where membership.roleid = v_role_oid
      or membership.member = v_role_oid;
    v_expected_edges := case when v_entry_actor_super then 0 else 1 end;

    if v_edge_count <> v_expected_edges or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as member_role
        on member_role.oid = membership.member
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where (
        membership.roleid = v_role_oid
        or membership.member = v_role_oid
      )
        and not (
          membership.roleid = v_role_oid
          and member_role.oid = current_user::regrole
          and grantor_role.rolsuper
          and grantor_role.oid <> member_role.oid
          and membership.admin_option
          and coalesce(
            (pg_catalog.to_jsonb(membership)->>'inherit_option')::boolean,
            false
          ) is false
          and coalesce(
            (pg_catalog.to_jsonb(membership)->>'set_option')::boolean,
            false
          ) is false
        )
    ) then
      raise exception 'Preview caller has unsafe durable membership: %',
        v_role_name;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_shdepend as dependency
      where dependency.refclassid = 'pg_authid'::regclass
        and dependency.refobjid = v_role_oid
        and dependency.deptype = 'o'
    ) or exists (
      select 1
      from pg_catalog.pg_default_acl as default_acl
      where default_acl.defaclrole = v_role_oid
    ) then
      raise exception 'Preview caller owns a database object/default ACL: %',
        v_role_name;
    end if;
  end loop;

  -- Executor roles own SECURITY DEFINER functions and hold the underlying DML.
  -- They may retain only PostgreSQL 16's non-usable bootstrap ADMIN edge when
  -- a non-superuser CREATEROLE migration actor created them. No role may
  -- inherit or SET an executor.
  foreach v_role_name in array array[
    'careslink_v1_preview_authorization_executor',
    'careslink_v1_preview_dispatch_executor',
    'careslink_v1_preview_receipt_executor'
  ] loop
    v_role_oid := to_regrole(v_role_name);
    if v_role_oid is null then
      raise exception 'communication-note Preview executor missing: %',
        v_role_name;
    end if;

    select count(*)
    into v_edge_count
    from pg_catalog.pg_auth_members as membership
    where membership.roleid = v_role_oid
      or membership.member = v_role_oid;
    v_expected_edges := case when v_entry_actor_super then 0 else 1 end;

    if v_edge_count <> v_expected_edges or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as member_role
        on member_role.oid = membership.member
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where (
        membership.roleid = v_role_oid
        or membership.member = v_role_oid
      )
        and not (
          membership.roleid = v_role_oid
          and member_role.oid = current_user::regrole
          and grantor_role.rolsuper
          and grantor_role.oid <> member_role.oid
          and membership.admin_option
          and coalesce(
            (pg_catalog.to_jsonb(membership)->>'inherit_option')::boolean,
            false
          ) is false
          and coalesce(
            (pg_catalog.to_jsonb(membership)->>'set_option')::boolean,
            false
          ) is false
        )
    ) then
      raise exception 'Preview executor has unsafe durable membership: %',
        v_role_name;
    end if;
  end loop;
end
$$;

-- Exact direct schema and function ACLs: four USAGE grants and the fixed
-- 1/1/2/1 RPC partition. Any extra helper EXECUTE entry is a failure.
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
begin
  if exists (
    with expected(role_name, privilege_type, is_grantable) as (
      values
        ('careslink_v1_preview_authorization_registration_caller',
          'USAGE', false),
        ('careslink_v1_preview_authorization_revocation_caller',
          'USAGE', false),
        ('careslink_v1_preview_dispatch_caller', 'USAGE', false),
        ('careslink_v1_preview_receipt_caller', 'USAGE', false)
    ),
    actual(role_name, privilege_type, is_grantable) as (
      select grantee.rolname::text, acl.privilege_type, acl.is_grantable
      from pg_catalog.pg_namespace as namespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          namespace.nspacl,
          pg_catalog.acldefault('n', namespace.nspowner)
        )
      ) as acl
      join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
      where namespace.oid = v_schema
        and grantee.rolname in (
          'careslink_v1_preview_authorization_registration_caller',
          'careslink_v1_preview_authorization_revocation_caller',
          'careslink_v1_preview_dispatch_caller',
          'careslink_v1_preview_receipt_caller'
        )
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Preview caller schema ACL drifted';
  end if;

  if exists (
    with expected(
      role_name,
      function_name,
      privilege_type,
      is_grantable
    ) as (
      values
        (
          'careslink_v1_preview_authorization_registration_caller',
          'persist_verified_communication_note_preview_authorization',
          'EXECUTE', false
        ),
        (
          'careslink_v1_preview_authorization_revocation_caller',
          'revoke_communication_note_preview_authorization',
          'EXECUTE', false
        ),
        (
          'careslink_v1_preview_dispatch_caller',
          'claim_communication_note_preview_authorization',
          'EXECUTE', false
        ),
        (
          'careslink_v1_preview_dispatch_caller',
          'reserve_communication_note_preview_dispatch',
          'EXECUTE', false
        ),
        (
          'careslink_v1_preview_receipt_caller',
          'persist_verified_communication_note_preview_dispatch_receipt',
          'EXECUTE', false
        )
    ),
    actual(
      role_name,
      function_name,
      privilege_type,
      is_grantable
    ) as (
      select
        grantee.rolname::text,
        procedure.proname::text,
        acl.privilege_type,
        acl.is_grantable
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as acl
      join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
      where procedure.pronamespace = v_schema
        and grantee.rolname in (
          'careslink_v1_preview_authorization_registration_caller',
          'careslink_v1_preview_authorization_revocation_caller',
          'careslink_v1_preview_dispatch_caller',
          'careslink_v1_preview_receipt_caller'
        )
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'Preview caller function ACL drifted';
  end if;
end
$$;

-- Effective privileges must match the direct ACLs. This catches PUBLIC,
-- inherited-role or future default-privilege leakage that catalog ACL shape
-- alone would miss.
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
  v_role_name text;
  v_relation record;
  v_type record;
  v_procedure record;
  v_expected_execute boolean;
begin
  foreach v_role_name in array array[
    'careslink_v1_preview_authorization_registration_caller',
    'careslink_v1_preview_authorization_revocation_caller',
    'careslink_v1_preview_dispatch_caller',
    'careslink_v1_preview_receipt_caller'
  ] loop
    if not has_schema_privilege(v_role_name, v_schema, 'USAGE')
      or has_schema_privilege(v_role_name, v_schema, 'CREATE')
    then
      raise exception 'Preview caller schema capability drifted: %',
        v_role_name;
    end if;

    for v_relation in
      select relation.oid, relation.relname, relation.relkind
      from pg_catalog.pg_class as relation
      where relation.relnamespace = v_schema
    loop
      if v_relation.relkind in ('r', 'p', 'v', 'm', 'f') and (
        has_table_privilege(
          v_role_name,
          v_relation.oid,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        ) or has_any_column_privilege(
          v_role_name,
          v_relation.oid,
          'SELECT, INSERT, UPDATE, REFERENCES'
        )
      ) then
        raise exception 'Preview caller direct data privilege leaked: % %',
          v_role_name, v_relation.relname;
      elsif v_relation.relkind = 'S' and has_sequence_privilege(
        v_role_name,
        v_relation.oid,
        'USAGE, SELECT, UPDATE'
      ) then
        raise exception 'Preview caller sequence privilege leaked: % %',
          v_role_name, v_relation.relname;
      end if;
    end loop;

    for v_type in
      select object_type.oid, object_type.typname
      from pg_catalog.pg_type as object_type
      where object_type.typnamespace = v_schema
        and object_type.typname like 'communication_note_preview_%'
    loop
      if has_type_privilege(v_role_name, v_type.oid, 'USAGE') then
        raise exception 'Preview caller ledger-type privilege leaked: % %',
          v_role_name, v_type.typname;
      end if;
    end loop;

    for v_procedure in
      select procedure.oid, procedure.proname
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_schema
    loop
      v_expected_execute := case v_role_name
        when 'careslink_v1_preview_authorization_registration_caller' then
          v_procedure.proname =
            'persist_verified_communication_note_preview_authorization'
        when 'careslink_v1_preview_authorization_revocation_caller' then
          v_procedure.proname =
            'revoke_communication_note_preview_authorization'
        when 'careslink_v1_preview_dispatch_caller' then
          v_procedure.proname in (
            'claim_communication_note_preview_authorization',
            'reserve_communication_note_preview_dispatch'
          )
        when 'careslink_v1_preview_receipt_caller' then
          v_procedure.proname =
            'persist_verified_communication_note_preview_dispatch_receipt'
        else false
      end;

      if has_function_privilege(
        v_role_name,
        v_procedure.oid,
        'EXECUTE'
      ) is distinct from v_expected_execute then
        raise exception 'Preview caller effective function ACL drifted: % %',
          v_role_name, v_procedure.proname;
      end if;
    end loop;
  end loop;
end
$$;

-- Assertion-only PostgreSQL-16 SET edges. They are revoked below and the
-- outer transaction also rolls them back.
grant careslink_v1_preview_authorization_registration_caller to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_authorization_revocation_caller to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_dispatch_caller to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_receipt_caller to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Registration can reach only its own definer RPC. Invalid input must reach
-- business validation; cross-RPC, helper and direct-ledger access must fail at
-- privilege checking.
set local role careslink_v1_preview_authorization_registration_caller;

do $$
declare
  v_rejected boolean := false;
  v_denied boolean := false;
begin
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_authorization(
        null::jsonb,
        null::text,
        null::text
      );
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'registration caller did not reach validation';
  end if;

  begin
    perform
      careslink_v1_generation.revoke_communication_note_preview_authorization(
        null::text,
        null::uuid,
        null::text,
        null::text,
        null::text
      );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'registration caller crossed into revocation RPC';
  end if;

  v_denied := false;
  begin
    perform careslink_v1_generation._communication_note_preview_expected_budget();
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'registration caller reached a private helper';
  end if;

  v_denied := false;
  begin
    perform 1
    from careslink_v1_generation.communication_note_preview_authorizations
    limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'registration caller reached a private ledger';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_preview_authorization_revocation_caller;

do $$
declare
  v_rejected boolean := false;
  v_denied boolean := false;
begin
  begin
    perform
      careslink_v1_generation.revoke_communication_note_preview_authorization(
        null::text,
        null::uuid,
        null::text,
        null::text,
        null::text
      );
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'revocation caller did not reach validation';
  end if;

  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_authorization(
        null::jsonb,
        null::text,
        null::text
      );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'revocation caller crossed into registration RPC';
  end if;

  v_denied := false;
  begin
    perform careslink_v1_generation._communication_note_preview_expected_budget();
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'revocation caller reached a private helper';
  end if;

  v_denied := false;
  begin
    perform 1
    from careslink_v1_generation.communication_note_preview_authorizations
    limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'revocation caller reached a private ledger';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_preview_dispatch_caller;

do $$
declare
  v_rejected boolean := false;
  v_denied boolean := false;
begin
  begin
    perform
      careslink_v1_generation.claim_communication_note_preview_authorization(
        null::text,
        null::uuid,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text
      );
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'dispatch caller did not reach claim validation';
  end if;

  v_rejected := false;
  begin
    perform
      careslink_v1_generation.reserve_communication_note_preview_dispatch(
        null::uuid,
        null::text,
        null::uuid,
        null::integer,
        null::text,
        null::integer,
        null::text,
        null::integer,
        null::text,
        null::text
      );
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'dispatch caller did not reach reservation validation';
  end if;

  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        null::jsonb,
        null::text,
        null::text,
        null::text
      );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'dispatch caller crossed into receipt RPC';
  end if;

  v_denied := false;
  begin
    perform careslink_v1_generation._communication_note_preview_expected_budget();
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'dispatch caller reached a private helper';
  end if;

  v_denied := false;
  begin
    perform 1
    from careslink_v1_generation.communication_note_preview_claims
    limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'dispatch caller reached a private ledger';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_preview_receipt_caller;

do $$
declare
  v_rejected boolean := false;
  v_denied boolean := false;
begin
  begin
    perform
      careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
        null::jsonb,
        null::text,
        null::text,
        null::text
      );
  exception when sqlstate 'P0001' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'receipt caller did not reach validation';
  end if;

  begin
    perform
      careslink_v1_generation.reserve_communication_note_preview_dispatch(
        null::uuid,
        null::text,
        null::uuid,
        null::integer,
        null::text,
        null::integer,
        null::text,
        null::integer,
        null::text,
        null::text
      );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'receipt caller crossed into dispatch RPC';
  end if;

  v_denied := false;
  begin
    perform careslink_v1_generation._communication_note_preview_expected_budget();
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'receipt caller reached a private helper';
  end if;

  v_denied := false;
  begin
    perform 1
    from careslink_v1_generation.communication_note_preview_dispatch_receipts
    limit 1;
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'receipt caller reached a private ledger';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

revoke careslink_v1_preview_receipt_caller
  from current_user granted by current_user;
revoke careslink_v1_preview_dispatch_caller
  from current_user granted by current_user;
revoke careslink_v1_preview_authorization_revocation_caller
  from current_user granted by current_user;
revoke careslink_v1_preview_authorization_registration_caller
  from current_user granted by current_user;

-- Recheck the durable no-usable-membership invariant before the outer
-- rollback. A non-superuser CREATEROLE migration actor may retain only its
-- PostgreSQL-16 bootstrap ADMIN edge with INHERIT/SET both false.
do $$
declare
  v_role_name text;
  v_role_oid oid;
  v_entry_actor_super boolean;
  v_edge_count integer;
  v_expected_edges integer;
begin
  select role.rolsuper
  into v_entry_actor_super
  from pg_catalog.pg_roles as role
  where role.oid = current_user::regrole;

  foreach v_role_name in array array[
    'careslink_v1_preview_authorization_registration_caller',
    'careslink_v1_preview_authorization_revocation_caller',
    'careslink_v1_preview_dispatch_caller',
    'careslink_v1_preview_receipt_caller',
    'careslink_v1_preview_authorization_executor',
    'careslink_v1_preview_dispatch_executor',
    'careslink_v1_preview_receipt_executor'
  ] loop
    v_role_oid := v_role_name::regrole;
    select count(*)
    into v_edge_count
    from pg_catalog.pg_auth_members as membership
    where membership.roleid = v_role_oid
      or membership.member = v_role_oid;
    v_expected_edges := case when v_entry_actor_super then 0 else 1 end;

    if v_edge_count <> v_expected_edges or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as member_role
        on member_role.oid = membership.member
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where (
        membership.roleid = v_role_oid
        or membership.member = v_role_oid
      )
        and not (
          membership.roleid = v_role_oid
          and member_role.oid = current_user::regrole
          and grantor_role.rolsuper
          and grantor_role.oid <> member_role.oid
          and membership.admin_option
          and coalesce(
            (pg_catalog.to_jsonb(membership)->>'inherit_option')::boolean,
            false
          ) is false
          and coalesce(
            (pg_catalog.to_jsonb(membership)->>'set_option')::boolean,
            false
          ) is false
        )
    ) then
      raise exception 'Preview role membership remained unsafe: %',
        v_role_name;
    end if;
  end loop;
end
$$;

rollback;
