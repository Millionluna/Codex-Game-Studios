-- Manual rollback-only assertions for a fresh disposable PostgreSQL 16+
-- database after every repository migration has been applied. Submit this
-- whole file as one request: BEGIN through ROLLBACK share transaction-only
-- TEST_ONLY fixtures. Production must never be the SQL target. This file does
-- not claim to exercise the separate two-connection claim/retirement race.
-- On 2026-08-25, official Supabase CLI 2.115.0 executed this exact assertion
-- body in the final disposable no-data r5 gate: 30/30 migrations, 11/11
-- rollback suites and the independent posture postcheck passed. r5 was
-- hosted-role-restore-r5-20260825, id
-- d68d531a-55e6-4374-be68-494da7542c75 and ref eqqlvqqhvsogusqhzuaq;
-- deletion and exact id/ref absence were confirmed. Production was never a
-- SQL target.

\set ON_ERROR_STOP on

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

-- Prove the durable posture before adding rollback-only SET-role edges.
do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_control oid := to_regrole(
    'careslink_v1_generation_registration_control_executor'
  );
  v_table oid := to_regclass(
    'careslink_v1_generation.worker_registration_retirements'
  );
  v_entry_actor_super boolean;
  v_edge_count integer;
  v_expected_edges integer;
  v_denied_role text;
begin
  if current_setting('server_version_num')::integer < 160000 then
    raise exception
      'registration-retirement shadow requires PostgreSQL 16 or newer';
  end if;

  if v_schema is null or v_control is null or v_table is null then
    raise exception 'registration-retirement schema, role or ledger is missing';
  end if;

  if (
    select count(*)
    from pg_roles as role
    where role.oid = v_control
      and not role.rolcanlogin
      and not role.rolsuper
      and not role.rolcreatedb
      and not role.rolcreaterole
      and not role.rolinherit
      and not role.rolreplication
      and not role.rolbypassrls
  ) <> 1 then
    raise exception 'registration-control executor attributes are unsafe';
  end if;

  select role.rolsuper
  into v_entry_actor_super
  from pg_roles as role
  where role.oid = current_user::regrole;

  select count(*)
  into v_edge_count
  from pg_auth_members as membership
  where membership.roleid = v_control
    or membership.member = v_control;
  v_expected_edges := case when v_entry_actor_super then 0 else 1 end;

  if v_edge_count <> v_expected_edges
    or exists (
      select 1
      from pg_auth_members as membership
      join pg_roles as member_role on member_role.oid = membership.member
      join pg_roles as grantor_role on grantor_role.oid = membership.grantor
      where (
        membership.roleid = v_control
        or membership.member = v_control
      )
        and not (
          membership.roleid = v_control
          and member_role.oid = current_user::regrole
          and grantor_role.rolsuper
          and grantor_role.oid <> member_role.oid
          and membership.admin_option
          and coalesce(
            (to_jsonb(membership)->>'inherit_option')::boolean,
            false
          ) is false
          and coalesce(
            (to_jsonb(membership)->>'set_option')::boolean,
            false
          ) is false
        )
    )
  then
    raise exception 'registration-control executor membership is unsafe';
  end if;

  if (
    select count(*)
    from pg_class as relation
    where relation.oid = v_table
      and relation.relkind = 'r'
      and relation.relowner = 'careslink_v1_generation_owner'::regrole
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) <> 1 then
    raise exception 'retirement ledger ownership or forced RLS drifted';
  end if;

  if exists (
    with expected(attnum, column_name, data_type, not_null, default_expr) as (
      values
        (1, 'registration_digest', 'text', true, null::text),
        (2, 'operation_id', 'uuid', true, null::text),
        (3, 'reason_code', 'text', true, null::text),
        (4, 'retired_binding_versions', 'text[]', true, null::text),
        (5, 'retired_at', 'timestamp with time zone', true, null::text),
        (6, 'created_at', 'timestamp with time zone', true,
          'transaction_timestamp()'),
        (7, 'shadow_only', 'boolean', true, 'true')
    ),
    actual(attnum, column_name, data_type, not_null, default_expr) as (
      select
        attribute.attnum::integer,
        attribute.attname::text,
        format_type(attribute.atttypid, attribute.atttypmod),
        attribute.attnotnull,
        pg_get_expr(default_value.adbin, default_value.adrelid)
      from pg_attribute as attribute
      left join pg_attrdef as default_value
        on default_value.adrelid = attribute.attrelid
       and default_value.adnum = attribute.attnum
      where attribute.attrelid = v_table
        and attribute.attnum > 0
        and not attribute.attisdropped
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'retirement ledger column shape drifted';
  end if;

  if (
    select count(*)
    from pg_constraint as constraint_metadata
    where constraint_metadata.conrelid = v_table
      and constraint_metadata.convalidated
  ) <> 7
    or (
      select count(*)
      from pg_constraint as constraint_metadata
      where constraint_metadata.conrelid = v_table
        and constraint_metadata.conname =
          'worker_registration_retirements_registration_digest_fkey'
        and constraint_metadata.contype = 'f'
        and constraint_metadata.confrelid =
          'careslink_v1_generation.worker_registrations'::regclass
        and constraint_metadata.confupdtype = 'r'
        and constraint_metadata.confdeltype = 'r'
        and constraint_metadata.convalidated
    ) <> 1
    or (
      select count(*)
      from pg_constraint as constraint_metadata
      where constraint_metadata.conrelid = v_table
        and constraint_metadata.conname =
          'worker_registration_retirements_reason_check'
        and constraint_metadata.contype = 'c'
        and pg_get_constraintdef(constraint_metadata.oid) like '%ROTATED%'
        and pg_get_constraintdef(constraint_metadata.oid) like
          '%DECOMMISSIONED%'
        and pg_get_constraintdef(constraint_metadata.oid) like
          '%POLICY_SUPERSEDED%'
    ) <> 1
  then
    raise exception 'retirement ledger constraint posture drifted';
  end if;

  if (
    select count(*)
    from pg_index as index_metadata
    join pg_class as index_relation
      on index_relation.oid = index_metadata.indexrelid
    join pg_am as access_method
      on access_method.oid = index_relation.relam
    where index_metadata.indrelid =
        'careslink_v1_generation.admission_policy_bindings'::regclass
      and index_relation.relname =
        'admission_policy_bindings_registration_idx'
      and index_relation.relnamespace = v_schema
      and index_relation.relowner =
        'careslink_v1_generation_owner'::regrole
      and access_method.amname = 'btree'
      and index_metadata.indisvalid
      and index_metadata.indisready
      and not index_metadata.indisunique
      and not index_metadata.indisprimary
      and index_metadata.indnkeyatts = 2
      and index_metadata.indnatts = 2
      and index_metadata.indkey[0] = (
        select attribute.attnum
        from pg_attribute as attribute
        where attribute.attrelid = index_metadata.indrelid
          and attribute.attname = 'registration_digest'
          and not attribute.attisdropped
      )
      and index_metadata.indkey[1] = (
        select attribute.attnum
        from pg_attribute as attribute
        where attribute.attrelid = index_metadata.indrelid
          and attribute.attname = 'binding_version'
          and not attribute.attisdropped
      )
      and index_metadata.indexprs is null
      and index_metadata.indpred is null
  ) <> 1 then
    raise exception 'registration binding lock index drifted';
  end if;

  if not has_schema_privilege(v_control, v_schema, 'USAGE')
    or has_schema_privilege(v_control, v_schema, 'CREATE')
    or exists (
      with expected(schema_name, privilege_type) as (
        values ('careslink_v1_generation', 'USAGE')
      ),
      actual(schema_name, privilege_type) as (
        select namespace.nspname::text, acl.privilege_type
        from pg_namespace as namespace
        cross join lateral aclexplode(
          coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
        ) as acl
        where acl.grantee = v_control
      ),
      drift as (
        (select * from actual except all select * from expected)
        union all
        (select * from expected except all select * from actual)
      )
      select 1 from drift
    )
  then
    raise exception 'registration-control schema ACL drifted';
  end if;

  if exists (
    with expected(table_name, privilege_type) as (
      values
        ('admission_policy_bindings', 'SELECT'),
        ('worker_registrations', 'SELECT'),
        ('worker_registration_retirements', 'SELECT')
    ),
    actual(table_name, privilege_type) as (
      select relation.relname::text, acl.privilege_type
      from pg_class as relation
      cross join lateral aclexplode(
        coalesce(relation.relacl, acldefault('r', relation.relowner))
      ) as acl
      where relation.relnamespace = v_schema
        and relation.relkind = 'r'
        and acl.grantee = v_control
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'registration-control table ACL drifted';
  end if;

  if exists (
    with expected(table_name, column_name, privilege_type) as (
      values
        ('admission_policy_bindings', 'retired_at', 'UPDATE'),
        ('admission_policy_bindings', 'status', 'UPDATE'),
        ('worker_registrations', 'registration_digest', 'UPDATE'),
        ('worker_registration_retirements', 'created_at', 'INSERT'),
        ('worker_registration_retirements', 'operation_id', 'INSERT'),
        ('worker_registration_retirements', 'reason_code', 'INSERT'),
        ('worker_registration_retirements', 'registration_digest', 'INSERT'),
        ('worker_registration_retirements', 'retired_at', 'INSERT'),
        ('worker_registration_retirements', 'retired_binding_versions',
          'INSERT'),
        ('worker_registration_retirements', 'shadow_only', 'INSERT')
    ),
    actual(table_name, column_name, privilege_type) as (
      select
        relation.relname::text,
        attribute.attname::text,
        acl.privilege_type
      from pg_attribute as attribute
      join pg_class as relation on relation.oid = attribute.attrelid
      cross join lateral aclexplode(attribute.attacl) as acl
      where relation.relnamespace = v_schema
        and relation.relkind = 'r'
        and attribute.attnum > 0
        and not attribute.attisdropped
        and attribute.attacl is not null
        and acl.grantee = v_control
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'registration-control column ACL drifted';
  end if;

  if exists (
    select 1
    from pg_type as object_type
    where object_type.typnamespace = v_schema
      and has_type_privilege(v_control, object_type.oid, 'USAGE')
  ) then
    raise exception 'registration-control private type privilege leaked';
  end if;

  foreach v_denied_role in array array[
    'anon', 'authenticated', 'service_role'
  ] loop
    if has_schema_privilege(v_denied_role, v_schema, 'USAGE')
      or has_schema_privilege(v_denied_role, v_schema, 'CREATE')
      or has_table_privilege(
        v_denied_role,
        v_table,
        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      )
      or has_any_column_privilege(
        v_denied_role,
        v_table,
        'SELECT, INSERT, UPDATE, REFERENCES'
      )
      or exists (
        select 1
        from pg_type as object_type
        where object_type.typnamespace = v_schema
          and has_type_privilege(v_denied_role, object_type.oid, 'USAGE')
      )
    then
      raise exception 'Data API retirement surface leaked to %',
        v_denied_role;
    end if;
  end loop;

  if has_table_privilege(
      'careslink_v1_generation_executor',
      v_table,
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    or has_table_privilege(
      'careslink_v1_generation_owner_api_executor',
      v_table,
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    or not has_table_privilege(
      'careslink_v1_generation_executor', v_table, 'SELECT'
    )
    or not has_table_privilege(
      'careslink_v1_generation_owner_api_executor', v_table, 'SELECT'
    )
  then
    raise exception 'runtime executor retirement-ledger ACL drifted';
  end if;
end
$$;

-- Exact private function identities, owners, definer posture and executors.
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
  v_control oid :=
    'careslink_v1_generation_registration_control_executor'::regrole;
  v_entry record;
  v_actual_grantees text[];
  v_expected_grantees text[];
  v_denied_role text;
begin
  if exists (
    with expected(
      function_name, identity_arguments, result_type, security_definer
    ) as (
      values
        ('_registration_accepts_new_work',
          'p_registration_digest text', 'boolean', false),
        ('_deny_worker_registration_retirement_mutation',
          '', 'trigger', false),
        ('_enforce_active_binding_registration_accepts_new_work',
          '', 'trigger', true),
        ('_enforce_running_attempt_registration_accepts_new_work',
          '', 'trigger', true),
        ('retire_v1_shadow_note_generation_worker_registration',
          'p_registration_digest text, p_operation_id uuid, p_reason_code text, p_expected_active_binding_versions text[]',
          'jsonb', true)
    ),
    actual(
      function_name, identity_arguments, result_type, security_definer
    ) as (
      select
        procedure.proname::text,
        pg_get_function_identity_arguments(procedure.oid),
        pg_get_function_result(procedure.oid),
        procedure.prosecdef
      from pg_proc as procedure
      where procedure.pronamespace = v_schema
        and procedure.proname in (
          '_registration_accepts_new_work',
          '_deny_worker_registration_retirement_mutation',
          '_enforce_active_binding_registration_accepts_new_work',
          '_enforce_running_attempt_registration_accepts_new_work',
          'retire_v1_shadow_note_generation_worker_registration'
        )
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'registration-retirement function identity drifted';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname in (
        '_registration_accepts_new_work',
        '_deny_worker_registration_retirement_mutation',
        '_enforce_active_binding_registration_accepts_new_work',
        '_enforce_running_attempt_registration_accepts_new_work',
        'retire_v1_shadow_note_generation_worker_registration'
      )
      and (
        procedure.prokind <> 'f'
        or procedure.provolatile <> 'v'
        or procedure.proretset
        or procedure.proowner <> v_control
        or procedure.proconfig is null
        or cardinality(procedure.proconfig) <> 1
        or procedure.proconfig[1] is null
        or procedure.proconfig[1] not in ('search_path=', 'search_path=""')
      )
  ) then
    raise exception 'registration-retirement function posture drifted';
  end if;

  for v_entry in
    select procedure.oid, procedure.proname
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname in (
        '_registration_accepts_new_work',
        '_deny_worker_registration_retirement_mutation',
        '_enforce_active_binding_registration_accepts_new_work',
        '_enforce_running_attempt_registration_accepts_new_work',
        'retire_v1_shadow_note_generation_worker_registration'
      )
  loop
    select array_agg(
      case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
      order by case
        when acl.grantee = 0 then 'PUBLIC'
        else grantee.rolname
      end
    )
    into v_actual_grantees
    from aclexplode(
      coalesce(
        (select procedure.proacl
         from pg_proc as procedure
         where procedure.oid = v_entry.oid),
        acldefault('f', v_control)
      )
    ) as acl
    left join pg_roles as grantee on grantee.oid = acl.grantee
    where acl.privilege_type = 'EXECUTE';

    v_expected_grantees := case
      when v_entry.proname = '_registration_accepts_new_work' then
        array[
          'careslink_v1_generation_executor',
          'careslink_v1_generation_owner_api_executor',
          'careslink_v1_generation_registration_control_executor'
        ]::text[]
      else array[
        'careslink_v1_generation_registration_control_executor'
      ]::text[]
    end;

    if v_actual_grantees is distinct from v_expected_grantees then
      raise exception 'retirement function execute ACL drifted: % => %',
        v_entry.proname, v_actual_grantees;
    end if;
  end loop;

  foreach v_denied_role in array array[
    'anon', 'authenticated', 'service_role',
    'careslink_v1_generation_owner',
    'careslink_v1_generation_executor',
    'careslink_v1_generation_owner_api_executor'
  ] loop
    if has_function_privilege(
      v_denied_role,
      'careslink_v1_generation.retire_v1_shadow_note_generation_worker_registration(text,uuid,text,text[])',
      'EXECUTE'
    ) then
      raise exception 'denied role can execute retirement RPC: %',
        v_denied_role;
    end if;
  end loop;

  foreach v_denied_role in array array[
    'anon', 'authenticated', 'service_role',
    'careslink_v1_generation_owner'
  ] loop
    if has_function_privilege(
      v_denied_role,
      'careslink_v1_generation._registration_accepts_new_work(text)',
      'EXECUTE'
    ) then
      raise exception 'denied role can execute retirement helper: %',
        v_denied_role;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc as procedure
    where procedure.pronamespace = 'public'::regnamespace
      and procedure.proname in (
        '_registration_accepts_new_work',
        '_deny_worker_registration_retirement_mutation',
        '_enforce_active_binding_registration_accepts_new_work',
        '_enforce_running_attempt_registration_accepts_new_work',
        'retire_v1_shadow_note_generation_worker_registration'
      )
  ) then
    raise exception 'public registration-retirement wrapper exists';
  end if;
end
$$;

-- Exact new policies and trigger attachment boundaries.
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
  v_control oid :=
    'careslink_v1_generation_registration_control_executor'::regrole;
  v_trigger_definition text;
begin
  if exists (
    with expected(table_name, policy_name, command, role_name) as (
      values
        ('worker_registration_retirements',
          'worker_registration_retirements_generation_executor_select',
          'r', 'careslink_v1_generation_executor'),
        ('worker_registration_retirements',
          'worker_registration_retirements_owner_api_select',
          'r', 'careslink_v1_generation_owner_api_executor'),
        ('worker_registration_retirements',
          'worker_registration_retirements_control_select',
          'r',
          'careslink_v1_generation_registration_control_executor'),
        ('worker_registration_retirements',
          'worker_registration_retirements_control_insert',
          'a',
          'careslink_v1_generation_registration_control_executor'),
        ('worker_registrations',
          'worker_registrations_generation_executor_lock',
          'w', 'careslink_v1_generation_executor'),
        ('worker_registrations',
          'worker_registrations_registration_control_select',
          'r',
          'careslink_v1_generation_registration_control_executor'),
        ('worker_registrations',
          'worker_registrations_registration_control_lock',
          'w',
          'careslink_v1_generation_registration_control_executor'),
        ('admission_policy_bindings',
          'admission_policy_bindings_registration_control_select',
          'r',
          'careslink_v1_generation_registration_control_executor'),
        ('admission_policy_bindings',
          'admission_policy_bindings_registration_control_update',
          'w',
          'careslink_v1_generation_registration_control_executor')
    ),
    actual(table_name, policy_name, command, role_name) as (
      select
        relation.relname::text,
        policy.polname::text,
        policy.polcmd::text,
        role.rolname::text
      from pg_policy as policy
      join pg_class as relation on relation.oid = policy.polrelid
      cross join lateral unnest(policy.polroles) as policy_role(role_oid)
      join pg_roles as role on role.oid = policy_role.role_oid
      where relation.relnamespace = v_schema
        and (
          relation.oid =
            'careslink_v1_generation.worker_registration_retirements'::regclass
          or v_control = any(policy.polroles)
          or policy.polname = 'worker_registrations_generation_executor_lock'
        )
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'registration-retirement RLS policy set drifted';
  end if;

  if exists (
    select 1
    from pg_policy as policy
    join pg_class as relation on relation.oid = policy.polrelid
    where relation.relnamespace = v_schema
      and (
        relation.oid =
          'careslink_v1_generation.worker_registration_retirements'::regclass
        or v_control = any(policy.polroles)
        or policy.polname = 'worker_registrations_generation_executor_lock'
      )
      and (
        not policy.polpermissive
        or cardinality(policy.polroles) <> 1
      )
  ) then
    raise exception 'registration-retirement RLS policy posture drifted';
  end if;

  if (
    select count(*)
    from pg_trigger as trigger_metadata
    where trigger_metadata.tgrelid =
        'careslink_v1_generation.worker_registration_retirements'::regclass
      and trigger_metadata.tgname =
        'worker_registration_retirements_append_only'
      and not trigger_metadata.tgisinternal
      and trigger_metadata.tgenabled = 'O'
      and trigger_metadata.tgtype = 27
      and trigger_metadata.tgfoid =
        'careslink_v1_generation._deny_worker_registration_retirement_mutation()'::regprocedure
  ) <> 1 then
    raise exception 'retirement append-only trigger drifted';
  end if;

  select pg_get_triggerdef(trigger_metadata.oid)
  into v_trigger_definition
  from pg_trigger as trigger_metadata
  where trigger_metadata.tgrelid =
      'careslink_v1_generation.admission_policy_bindings'::regclass
    and trigger_metadata.tgname =
      'admission_policy_bindings_active_registration_gate'
    and not trigger_metadata.tgisinternal
    and trigger_metadata.tgenabled = 'O'
    and trigger_metadata.tgtype = 23
    and trigger_metadata.tgfoid =
      'careslink_v1_generation._enforce_active_binding_registration_accepts_new_work()'::regprocedure;
  if v_trigger_definition is null
    or v_trigger_definition not like '%BEFORE INSERT OR UPDATE OF status, registration_digest%'
  then
    raise exception 'ACTIVE binding registration gate drifted';
  end if;

  select pg_get_triggerdef(trigger_metadata.oid)
  into v_trigger_definition
  from pg_trigger as trigger_metadata
  where trigger_metadata.tgrelid =
      'careslink_v1_generation.attempts'::regclass
    and trigger_metadata.tgname = 'attempts_running_registration_gate'
    and not trigger_metadata.tgisinternal
    and trigger_metadata.tgenabled = 'O'
    and trigger_metadata.tgtype = 7
    and trigger_metadata.tgfoid =
      'careslink_v1_generation._enforce_running_attempt_registration_accepts_new_work()'::regprocedure;
  if v_trigger_definition is null
    or v_trigger_definition not like '%BEFORE INSERT%'
    or v_trigger_definition not like '%WHEN%RUNNING%'
  then
    raise exception 'RUNNING-only attempt registration gate drifted';
  end if;
end
$$;

-- Assertion-only PostgreSQL-16 SET edges. All are revoked below and rolled
-- back even if a later assertion fails.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_registration_control_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

set local role careslink_v1_generation_registration_control_executor;

do $$
begin
  if (
    select count(*)
    from careslink_v1_generation.worker_registration_retirements
  ) <> 0 then
    raise exception 'retirement ledger is not empty by default';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Minimal catalog, one cancelled job/payload pair and no QUEUED work. The
-- terminal job exists only to exercise the attempt trigger's RUNNING boundary.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  'e0000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'registration-retirement-owner@example.invalid',
  'test-only-no-login',
  date_trunc('milliseconds', transaction_timestamp()),
  '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
  '{}'::jsonb,
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp())
);

insert into public.privacy_reviews (
  id,
  owner_user_id,
  note_type,
  cleaned_facts_hash,
  schema_version,
  status,
  finding_decisions,
  confirmed_at,
  expires_at,
  contract_version,
  scanner_policy_version,
  review_revision,
  mutation_id,
  request_fingerprint,
  deidentification_confirmed,
  authority_to_process_confirmed,
  shadow_only
) values (
  'e2000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'communication',
  repeat('4', 64),
  '2026-08-09.v1-shadow',
  'CONFIRMED',
  '[]'::jsonb,
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
  '1.0.0-shadow.1',
  '2026-08-11.preview.1',
  1,
  'privacy.registration-retirement.0001',
  repeat('5', 64),
  true,
  true,
  true
);

set local role careslink_v1_generation_owner;

alter table careslink_v1_generation.settings no force row level security;
alter table careslink_v1_generation.worker_policies
  no force row level security;
alter table careslink_v1_generation.provider_policies
  no force row level security;
alter table careslink_v1_generation.payload_policies
  no force row level security;
alter table careslink_v1_generation.worker_registrations
  no force row level security;
alter table careslink_v1_generation.admission_policy_bindings
  no force row level security;
alter table careslink_v1_generation.jobs no force row level security;
alter table careslink_v1_generation.payloads no force row level security;
alter table careslink_v1_generation.attempts no force row level security;

alter table careslink_v1_generation.settings
  drop constraint settings_enabled_check;

update careslink_v1_generation.settings
set enabled = true,
    updated_at = date_trunc('milliseconds', transaction_timestamp())
where capability = 'note_generation_v1';

insert into careslink_v1_generation.worker_policies (
  version,
  status,
  max_queue_age_ms,
  minimum_payload_remaining_at_claim_ms,
  lease_duration_ms,
  heartbeat_interval_ms,
  heartbeat_safety_margin_ms,
  attempt_deadline_ms,
  provider_deadline_ms,
  commit_safety_margin_ms,
  max_attempts,
  retry_delay_ms_after_attempt,
  retryable_outcomes,
  recovery_batch_limit,
  jitter_mode,
  jitter_max_ms,
  policy_digest,
  shadow_only
) values (
  'worker.retirement.test.v1',
  'APPROVED',
  600000,
  60000,
  10000,
  2000,
  1000,
  30000,
  20000,
  5000,
  2,
  array[1000]::bigint[],
  array['LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT']::text[],
  10,
  'NONE',
  null,
  repeat('1', 64),
  true
);

insert into careslink_v1_generation.provider_policies (
  note_type,
  policy_version,
  status,
  service_code,
  contract_version,
  schema_version,
  rate_catalog_version,
  provider_id,
  model_id,
  model_revision,
  model_revision_availability,
  prompt_template_version,
  golden_set_version,
  parser_version,
  timeout_ms,
  policy_digest,
  shadow_only
) values (
  'communication',
  'provider.retirement.test.v1',
  'APPROVED',
  'note.communication.generate',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  '2026-08-09.v1-shadow',
  'provider.retirement.test',
  'model.retirement.test',
  null,
  'PROVIDER_NOT_EXPOSED',
  'prompt.retirement.test.v1',
  'golden.retirement.test.v1',
  'parser.retirement.test.v1',
  20000,
  repeat('3', 64),
  true
);

insert into careslink_v1_generation.payload_policies (
  policy_version,
  status,
  encryption_profile_version,
  backup_disposition_version,
  policy_digest,
  shadow_only
) values (
  'payload.retirement.test.v1',
  'APPROVED',
  'encryption.retirement.test.v1',
  'backup.retirement.test.v1',
  repeat('2', 64),
  true
);

insert into careslink_v1_generation.worker_registrations (
  registration_digest,
  registration_version,
  status,
  contract_version,
  schema_version,
  worker_identity_version,
  worker_identity_hash,
  worker_policy_version,
  worker_policy_digest,
  payload_policy_version,
  payload_policy_snapshot_hash,
  shadow_only
) values (
  repeat('a', 64),
  'registration.retirement.test.v1',
  'APPROVED',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'worker-identity.retirement.test.v1',
  repeat('b', 64),
  'worker.retirement.test.v1',
  repeat('1', 64),
  'payload.retirement.test.v1',
  repeat('2', 64),
  true
);

insert into careslink_v1_generation.admission_policy_bindings (
  binding_version,
  note_type,
  registration_digest,
  status,
  activated_at,
  retired_at,
  created_at,
  shadow_only
) values
  (
    'binding.retirement.communication.v1',
    'communication',
    repeat('a', 64),
    'ACTIVE',
    date_trunc('milliseconds', transaction_timestamp()),
    null,
    date_trunc('milliseconds', transaction_timestamp()),
    true
  ),
  (
    'binding.retirement.ndis.v1',
    'ndis',
    repeat('a', 64),
    'ACTIVE',
    date_trunc('milliseconds', transaction_timestamp()),
    null,
    date_trunc('milliseconds', transaction_timestamp()),
    true
  );

insert into careslink_v1_generation.jobs (
  id,
  owner_user_id,
  initiating_session_id,
  admission_transport,
  payload_id,
  note_type,
  source_locale,
  service_code,
  rate_catalog_version,
  contract_version,
  schema_version,
  privacy_review_id,
  privacy_scanner_policy_version,
  privacy_review_revision,
  cleaned_facts_hash,
  idempotency_hash,
  request_hash,
  worker_policy_version,
  worker_policy_digest,
  provider_policy_version,
  provider_policy_digest,
  payload_policy_version,
  payload_policy_snapshot_hash,
  status,
  attempt_count,
  next_eligible_at,
  failure_reason,
  created_at,
  updated_at,
  started_at,
  finished_at,
  shadow_only
) values (
  'e3000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'BEARER',
  'e5000000-0000-4000-8000-000000000001',
  'communication',
  'en',
  'note.communication.generate',
  '2026-08-09.v1-shadow',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'e2000000-0000-4000-8000-000000000001',
  '2026-08-11.preview.1',
  1,
  repeat('4', 64),
  repeat('6', 64),
  repeat('7', 64),
  'worker.retirement.test.v1',
  repeat('1', 64),
  'provider.retirement.test.v1',
  repeat('3', 64),
  'payload.retirement.test.v1',
  repeat('2', 64),
  'CANCELLED',
  0,
  null,
  'CANCELLED',
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp()),
  null,
  date_trunc('milliseconds', transaction_timestamp()),
  true
);

insert into careslink_v1_generation.payloads (
  id,
  job_id,
  owner_user_id,
  note_type,
  source_locale,
  contract_version,
  schema_version,
  privacy_review_id,
  privacy_proof_expires_at,
  cleaned_facts_hash,
  request_hash,
  policy_version,
  encryption_profile_version,
  backup_disposition_version,
  policy_snapshot_hash,
  payload_handle_hash,
  state,
  expires_at,
  available_at,
  purge_attempt_count,
  created_at,
  updated_at,
  shadow_only
) values (
  'e5000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'communication',
  'en',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'e2000000-0000-4000-8000-000000000001',
  date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
  repeat('4', 64),
  repeat('7', 64),
  'payload.retirement.test.v1',
  'encryption.retirement.test.v1',
  'backup.retirement.test.v1',
  repeat('2', 64),
  repeat('8', 64),
  'AVAILABLE',
  date_trunc('milliseconds', transaction_timestamp()) + interval '10 minutes',
  date_trunc('milliseconds', transaction_timestamp()),
  0,
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp()),
  true
);

set constraints all immediate;

alter table careslink_v1_generation.settings force row level security;
alter table careslink_v1_generation.worker_policies
  force row level security;
alter table careslink_v1_generation.provider_policies
  force row level security;
alter table careslink_v1_generation.payload_policies
  force row level security;
alter table careslink_v1_generation.worker_registrations
  force row level security;
alter table careslink_v1_generation.admission_policy_bindings
  force row level security;
alter table careslink_v1_generation.jobs force row level security;
alter table careslink_v1_generation.payloads force row level security;
alter table careslink_v1_generation.attempts force row level security;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The fixed reason vocabulary rejects all unreviewed values even through the
-- only INSERT-capable control role.
set local role careslink_v1_generation_registration_control_executor;

do $$
declare
  v_rejected boolean := false;
begin
  begin
    insert into careslink_v1_generation.worker_registration_retirements (
      registration_digest,
      operation_id,
      reason_code,
      retired_binding_versions,
      retired_at,
      created_at,
      shadow_only
    ) values (
      repeat('a', 64),
      'e9000000-0000-4000-8000-000000000099',
      'UNREVIEWED_REASON',
      array[]::text[],
      date_trunc('milliseconds', transaction_timestamp()),
      date_trunc('milliseconds', transaction_timestamp()),
      true
    );
  exception when check_violation then
    v_rejected := true;
  end;

  if not v_rejected
    or exists (
      select 1
      from careslink_v1_generation.worker_registration_retirements
    )
  then
    raise exception 'retirement reason constraint failed open';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

set local role careslink_v1_generation_executor;

do $$
begin
  if not careslink_v1_generation._registration_accepts_new_work(
      repeat('a', 64)
    )
  then
    raise exception 'approved unretired registration rejected new work';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Reject malformed or stale expected sets before accepting the exact sorted,
-- de-duplicated ACTIVE binding vector. Then prove durable idempotent replay.
set local role careslink_v1_generation_registration_control_executor;

do $$
declare
  v_expected text[] := array[
    'binding.retirement.communication.v1',
    'binding.retirement.ndis.v1'
  ]::text[];
  v_created jsonb;
  v_replay jsonb;
  v_message text;
  v_validation_rejected boolean := false;
  v_active_conflict_rejected boolean := false;
  v_retirement_conflict_rejected boolean := false;
  v_retired_at timestamptz;
begin
  begin
    perform
      careslink_v1_generation.retire_v1_shadow_note_generation_worker_registration(
        repeat('a', 64),
        'e9000000-0000-4000-8000-000000000090',
        'ROTATED',
        array[
          'binding.retirement.ndis.v1',
          'binding.retirement.communication.v1'
        ]::text[]
      );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_validation_rejected := v_message = 'VALIDATION_ERROR';
  end;
  if not v_validation_rejected then
    raise exception 'unsorted retirement expectation was accepted';
  end if;

  begin
    perform
      careslink_v1_generation.retire_v1_shadow_note_generation_worker_registration(
        repeat('a', 64),
        'e9000000-0000-4000-8000-000000000091',
        'ROTATED',
        array['binding.retirement.communication.v1']::text[]
      );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_active_conflict_rejected := v_message = 'ACTIVE_BINDING_CONFLICT';
  end;
  if not v_active_conflict_rejected then
    raise exception 'inexact ACTIVE binding expectation was accepted';
  end if;

  if exists (
      select 1
      from careslink_v1_generation.worker_registration_retirements
    )
    or (
      select count(*)
      from careslink_v1_generation.admission_policy_bindings as binding
      where binding.registration_digest = repeat('a', 64)
        and binding.status = 'ACTIVE'
        and binding.retired_at is null
    ) <> 2
  then
    raise exception 'rejected retirement changed durable state';
  end if;

  select
    careslink_v1_generation.retire_v1_shadow_note_generation_worker_registration(
      repeat('a', 64),
      'e9000000-0000-4000-8000-000000000001',
      'ROTATED',
      v_expected
    )
  into v_created;

  if v_created->'created' is distinct from 'true'::jsonb
    or v_created->>'registrationDigest' is distinct from repeat('a', 64)
    or v_created->>'operationId' is distinct from
      'e9000000-0000-4000-8000-000000000001'
    or v_created->>'reasonCode' is distinct from 'ROTATED'
    or v_created->'retiredBindingVersions' is distinct from
      to_jsonb(v_expected)
    or v_created->>'retiredAt' is null
  then
    raise exception 'created retirement acknowledgement drifted: %',
      v_created;
  end if;

  select retirement.retired_at
  into v_retired_at
  from careslink_v1_generation.worker_registration_retirements as retirement
  where retirement.registration_digest = repeat('a', 64)
    and retirement.operation_id =
      'e9000000-0000-4000-8000-000000000001'
    and retirement.reason_code = 'ROTATED'
    and retirement.retired_binding_versions = v_expected
    and retirement.created_at = retirement.retired_at
    and retirement.shadow_only is true;

  if v_retired_at is null
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_retirements
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.admission_policy_bindings as binding
      where binding.registration_digest = repeat('a', 64)
        and binding.binding_version = any(v_expected)
        and binding.status = 'RETIRED'
        and binding.retired_at = v_retired_at
        and binding.activated_at is not null
        and binding.retired_at >= binding.activated_at
        and binding.shadow_only is true
    ) <> 2
    or exists (
      select 1
      from careslink_v1_generation.admission_policy_bindings as binding
      where binding.registration_digest = repeat('a', 64)
        and binding.status = 'ACTIVE'
    )
    or (
      select count(*)
      from careslink_v1_generation.worker_registrations as registration
      where registration.registration_digest = repeat('a', 64)
        and registration.status = 'APPROVED'
        and registration.shadow_only is true
    ) <> 1
  then
    raise exception 'exact retirement durable row set drifted';
  end if;

  select
    careslink_v1_generation.retire_v1_shadow_note_generation_worker_registration(
      repeat('a', 64),
      'e9000000-0000-4000-8000-000000000001',
      'ROTATED',
      v_expected
    )
  into v_replay;

  if v_replay->'created' is distinct from 'false'::jsonb
    or v_replay->>'registrationDigest' is distinct from repeat('a', 64)
    or v_replay->>'operationId' is distinct from
      'e9000000-0000-4000-8000-000000000001'
    or v_replay->>'reasonCode' is distinct from 'ROTATED'
    or v_replay->'retiredBindingVersions' is distinct from
      to_jsonb(v_expected)
    or (v_replay->>'retiredAt')::timestamptz is distinct from v_retired_at
  then
    raise exception 'retirement replay acknowledgement drifted: %', v_replay;
  end if;

  begin
    perform
      careslink_v1_generation.retire_v1_shadow_note_generation_worker_registration(
        repeat('a', 64),
        'e9000000-0000-4000-8000-000000000002',
        'ROTATED',
        v_expected
      );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_retirement_conflict_rejected :=
      v_message = 'REGISTRATION_RETIREMENT_CONFLICT';
  end;
  if not v_retirement_conflict_rejected then
    raise exception 'conflicting retirement operation was accepted';
  end if;

  if (
      select count(*)
      from careslink_v1_generation.worker_registration_retirements
      where registration_digest = repeat('a', 64)
        and operation_id = 'e9000000-0000-4000-8000-000000000001'
        and retired_at = v_retired_at
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.admission_policy_bindings as binding
      where binding.registration_digest = repeat('a', 64)
        and binding.status = 'RETIRED'
        and binding.retired_at = v_retired_at
    ) <> 2
  then
    raise exception 'replay/conflict changed exact retirement state';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The helper and claim both fail closed after retirement. The queue is
-- deliberately empty, proving the gate precedes the queue scan.
set local role careslink_v1_generation_executor;

do $$
declare
  v_message text;
  v_rejected boolean := false;
begin
  if careslink_v1_generation._registration_accepts_new_work(
      repeat('a', 64)
    )
  then
    raise exception 'retired registration still accepts new work';
  end if;

  if exists (
    select 1
    from careslink_v1_generation.jobs as job
    where job.status = 'QUEUED'
  ) then
    raise exception 'retired claim fixture unexpectedly has queued work';
  end if;

  begin
    perform careslink_v1_generation.claim_v1_shadow_note_generation_job(
      repeat('a', 64),
      'worker.retirement.test.v1',
      repeat('1', 64),
      repeat('b', 64),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_rejected := v_message = 'POLICY_MISMATCH';
  end;

  if not v_rejected then
    raise exception 'empty-queue retired claim did not return POLICY_MISMATCH';
  end if;

  if exists (
      select 1
      from careslink_v1_generation.jobs as job
      where job.status = 'QUEUED'
    )
    or exists (
      select 1
      from careslink_v1_generation.attempts
    )
  then
    raise exception 'rejected retired claim created runtime authority';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The ledger is immutable even to the table owner inside a rollback-only
-- FORCE-RLS relaxation. Both UPDATE and DELETE must reach the guard trigger.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.worker_registration_retirements
  no force row level security;

do $$
declare
  v_message text;
  v_update_rejected boolean := false;
  v_delete_rejected boolean := false;
begin
  begin
    update careslink_v1_generation.worker_registration_retirements
    set reason_code = 'DECOMMISSIONED'
    where registration_digest = repeat('a', 64);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_update_rejected := v_message = 'IMMUTABLE_RETIREMENT_RECORD';
  end;

  begin
    delete from careslink_v1_generation.worker_registration_retirements
    where registration_digest = repeat('a', 64);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_delete_rejected := v_message = 'IMMUTABLE_RETIREMENT_RECORD';
  end;

  if not v_update_rejected
    or not v_delete_rejected
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_retirements
      where registration_digest = repeat('a', 64)
        and reason_code = 'ROTATED'
        and operation_id = 'e9000000-0000-4000-8000-000000000001'
    ) <> 1
  then
    raise exception 'append-only retirement ledger failed open';
  end if;
end
$$;

alter table careslink_v1_generation.worker_registration_retirements
  force row level security;

-- A retired registration cannot regain an ACTIVE binding through either an
-- UPDATE of a retired row or a newly inserted binding.
alter table careslink_v1_generation.admission_policy_bindings
  no force row level security;

do $$
declare
  v_message text;
  v_update_rejected boolean := false;
  v_insert_rejected boolean := false;
begin
  begin
    update careslink_v1_generation.admission_policy_bindings
    set status = 'ACTIVE',
        retired_at = null
    where binding_version = 'binding.retirement.communication.v1';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_update_rejected := v_message = 'POLICY_MISMATCH';
  end;

  begin
    insert into careslink_v1_generation.admission_policy_bindings (
      binding_version,
      note_type,
      registration_digest,
      status,
      activated_at,
      retired_at,
      created_at,
      shadow_only
    ) values (
      'binding.retirement.progress.v1',
      'progress',
      repeat('a', 64),
      'ACTIVE',
      date_trunc('milliseconds', clock_timestamp()),
      null,
      date_trunc('milliseconds', transaction_timestamp()),
      true
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_insert_rejected := v_message = 'POLICY_MISMATCH';
  end;

  if not v_update_rejected
    or not v_insert_rejected
    or (
      select count(*)
      from careslink_v1_generation.admission_policy_bindings as binding
      where binding.registration_digest = repeat('a', 64)
        and binding.status = 'RETIRED'
        and binding.retired_at is not null
    ) <> 2
    or exists (
      select 1
      from careslink_v1_generation.admission_policy_bindings as binding
      where binding.registration_digest = repeat('a', 64)
        and binding.status = 'ACTIVE'
    )
  then
    raise exception 'retired registration ACTIVE-binding gate failed open';
  end if;
end
$$;

alter table careslink_v1_generation.admission_policy_bindings
  force row level security;

-- The attempt trigger denies only new RUNNING authority. A terminal FAILED
-- historical/recovery row remains insertable for bounded settlement paths.
alter table careslink_v1_generation.attempts no force row level security;

do $$
declare
  v_message text;
  v_running_rejected boolean := false;
begin
  begin
    insert into careslink_v1_generation.attempts (
      id,
      job_id,
      owner_user_id,
      attempt_number,
      status,
      worker_identity_hash,
      registration_digest,
      lease_token_hash,
      acquired_at,
      last_heartbeat_at,
      lease_expires_at,
      created_at,
      shadow_only
    ) values (
      'e6000000-0000-4000-8000-000000000001',
      'e3000000-0000-4000-8000-000000000001',
      'e0000000-0000-4000-8000-000000000001',
      1,
      'RUNNING',
      repeat('b', 64),
      repeat('a', 64),
      repeat('c', 64),
      date_trunc('milliseconds', transaction_timestamp()),
      date_trunc('milliseconds', transaction_timestamp()),
      date_trunc('milliseconds', transaction_timestamp()) + interval '1 minute',
      date_trunc('milliseconds', transaction_timestamp()),
      true
    );
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    v_running_rejected := v_message = 'POLICY_MISMATCH';
  end;

  if not v_running_rejected
    or exists (
      select 1
      from careslink_v1_generation.attempts
      where id = 'e6000000-0000-4000-8000-000000000001'
    )
  then
    raise exception 'retired registration received a RUNNING attempt';
  end if;

  insert into careslink_v1_generation.attempts (
    id,
    job_id,
    owner_user_id,
    attempt_number,
    status,
    worker_identity_hash,
    registration_digest,
    lease_token_hash,
    acquired_at,
    last_heartbeat_at,
    lease_expires_at,
    failure_reason,
    finished_at,
    terminal_transaction_id,
    created_at,
    shadow_only
  ) values (
    'e6000000-0000-4000-8000-000000000002',
    'e3000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    1,
    'FAILED',
    repeat('b', 64),
    repeat('a', 64),
    repeat('c', 64),
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()) + interval '1 minute',
    'INTERNAL_FAILURE',
    date_trunc('milliseconds', transaction_timestamp()),
    'e7000000-0000-4000-8000-000000000001',
    date_trunc('milliseconds', transaction_timestamp()),
    true
  );

  if (
    select count(*)
    from careslink_v1_generation.attempts as attempt
    where attempt.id = 'e6000000-0000-4000-8000-000000000002'
      and attempt.job_id = 'e3000000-0000-4000-8000-000000000001'
      and attempt.registration_digest = repeat('a', 64)
      and attempt.status = 'FAILED'
      and attempt.failure_reason = 'INTERNAL_FAILURE'
      and attempt.finished_at is not null
      and attempt.terminal_transaction_id =
        'e7000000-0000-4000-8000-000000000001'
      and attempt.shadow_only is true
  ) <> 1 then
    raise exception 'terminal FAILED attempt was not preserved';
  end if;
end
$$;

alter table careslink_v1_generation.attempts force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Remove the assertion-only role edges explicitly; ROLLBACK also removes all
-- fixtures, FORCE-RLS relaxations and the temporary capability enablement.
revoke careslink_v1_generation_registration_control_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;

rollback;
