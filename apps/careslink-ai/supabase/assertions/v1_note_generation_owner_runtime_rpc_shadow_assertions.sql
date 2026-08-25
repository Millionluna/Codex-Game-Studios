-- Manual rollback-only assertions for a fresh disposable PostgreSQL 16+
-- database after every repository migration has been applied. Submit this
-- whole file as one request: BEGIN through ROLLBACK share transaction-only
-- TEST_ONLY fixtures. This assertion creates no durable policy, retirement,
-- binding, job, payload, caller credential, route, model, vault object or
-- Points mutation.
-- Production must never be the SQL target. On 2026-08-25, official Supabase
-- CLI 2.115.0 executed this exact assertion body in the final disposable
-- no-data r5 gate: 30/30 migrations, 11/11 rollback suites and the independent
-- posture postcheck passed. r5 was hosted-role-restore-r5-20260825, id
-- d68d531a-55e6-4374-be68-494da7542c75 and ref eqqlvqqhvsogusqhzuaq;
-- deletion and exact id/ref absence were confirmed. Production was never a
-- SQL target.
-- The wall-clock fixtures below distinguish clock time from transaction start
-- time; they do not claim to replace a separate two-connection lock-wait race.

\set ON_ERROR_STOP on

begin;

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

-- Prove the migration posture before adding the three rollback-only SET-role
-- edges used by the fixture. Catalog reads do not bypass or relax RLS.
do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_owner_api oid := to_regrole(
    'careslink_v1_generation_owner_api_executor'
  );
  v_actual text[];
  v_role text;
  v_table text;
  v_object_kind "char";
  v_effective_acl aclitem[];
  v_edge_count integer;
  v_expected_edges integer;
  v_entry_actor_super boolean;
begin
  if current_setting('server_version_num')::integer < 160000 then
    raise exception 'owner runtime RPC shadow requires PostgreSQL 16 or newer';
  end if;
  if v_schema is null or v_owner_api is null then
    raise exception 'owner runtime RPC private schema or executor is missing';
  end if;

  if (
    select count(*)
    from pg_roles as role
    where role.oid = v_owner_api
      and not role.rolcanlogin
      and not role.rolsuper
      and not role.rolcreatedb
      and not role.rolcreaterole
      and not role.rolinherit
      and not role.rolreplication
      and not role.rolbypassrls
  ) <> 1 then
    raise exception 'owner API executor attributes are unsafe';
  end if;

  select role.rolsuper
  into v_entry_actor_super
  from pg_roles as role
  where role.oid = current_user::regrole;

  select count(*)
  into v_edge_count
  from pg_auth_members as membership
  where membership.roleid = v_owner_api
    or membership.member = v_owner_api;
  v_expected_edges := case
    when not v_entry_actor_super then 1
    else 0
  end;

  if v_edge_count <> v_expected_edges
    or exists (
    select 1
    from pg_auth_members as membership
    join pg_roles as member_role on member_role.oid = membership.member
    join pg_roles as grantor_role on grantor_role.oid = membership.grantor
    where (
      membership.roleid = v_owner_api
      or membership.member = v_owner_api
    )
      and not (
        membership.roleid = v_owner_api
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
  ) then
    raise exception 'owner API executor has an unsafe role membership';
  end if;

  select array_agg(relation.relname::text order by relation.relname)
  into v_actual
  from pg_class as relation
  where relation.relnamespace = v_schema
    and relation.relkind = 'r';

  if v_actual is distinct from array[
    'admission_policy_bindings', 'attempts', 'jobs', 'payload_grants',
    'payload_policies', 'payload_purge_outbox', 'payloads',
    'provider_evidence', 'provider_policies', 'settings', 'worker_policies',
    'worker_registration_provider_policies', 'worker_registration_retirements',
    'worker_registrations'
  ]::text[] then
    raise exception 'owner runtime RPC private table scope drifted: %', v_actual;
  end if;

  if exists (
    select 1
    from pg_class as relation
    where relation.relnamespace = v_schema
      and relation.relkind = 'r'
      and (
        not relation.relrowsecurity
        or not relation.relforcerowsecurity
        or relation.relowner <> 'careslink_v1_generation_owner'::regrole
      )
  ) then
    raise exception 'owner runtime RPC private RLS or ownership is unsafe';
  end if;

  foreach v_role in array array[
    'anon', 'authenticated', 'service_role'
  ] loop
    if has_schema_privilege(v_role, v_schema, 'USAGE')
      or has_schema_privilege(v_role, v_schema, 'CREATE')
    then
      raise exception 'Data API role can access owner private schema: %',
        v_role;
    end if;

    foreach v_table in array v_actual loop
      if has_table_privilege(
          v_role,
          format('careslink_v1_generation.%I', v_table),
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        )
        or has_any_column_privilege(
          v_role,
          format('careslink_v1_generation.%I', v_table),
          'SELECT, INSERT, UPDATE, REFERENCES'
        )
      then
        raise exception 'Data API table or column privilege leaked: % %',
          v_role, v_table;
      end if;
    end loop;

    if exists (
      select 1
      from pg_type as object_type
      where object_type.typnamespace = v_schema
        and has_type_privilege(v_role, object_type.oid, 'USAGE')
    ) then
      raise exception 'Data API type privilege leaked: %', v_role;
    end if;
  end loop;

  if not has_schema_privilege(v_owner_api, v_schema, 'USAGE')
    or not has_schema_privilege(v_owner_api, 'public', 'USAGE')
    or not has_schema_privilege(v_owner_api, 'extensions', 'USAGE')
    or has_schema_privilege(v_owner_api, v_schema, 'CREATE')
    or has_schema_privilege(v_owner_api, 'public', 'CREATE')
    or has_schema_privilege(v_owner_api, 'extensions', 'CREATE')
  then
    raise exception 'owner API executor schema privilege drifted';
  end if;

  if exists (
    with expected(schema_name, privilege_type) as (
      values
        ('careslink_v1_generation', 'USAGE'),
        ('extensions', 'USAGE'),
        ('public', 'USAGE')
    ),
    actual(schema_name, privilege_type) as (
      select namespace.nspname::text, acl.privilege_type
      from pg_namespace as namespace
      cross join lateral aclexplode(
        coalesce(
          namespace.nspacl,
          acldefault('n', namespace.nspowner)
        )
      ) as acl
      where acl.grantee = v_owner_api
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'owner API executor direct schema ACL drifted';
  end if;

  foreach v_object_kind in array array['r', 'S', 'f', 'T']::"char"[]
  loop
    select defaults.defaclacl
    into v_effective_acl
    from pg_default_acl as defaults
    where defaults.defaclrole = v_owner_api
      and defaults.defaclnamespace = 0
      and defaults.defaclobjtype = v_object_kind;

    v_effective_acl := coalesce(
      v_effective_acl,
      acldefault(v_object_kind, v_owner_api)
    );
    if exists (
      select 1
      from aclexplode(v_effective_acl) as acl
      left join pg_roles as grantee on grantee.oid = acl.grantee
      where acl.grantee = 0
        or grantee.rolname in (
          'anon', 'authenticated', 'service_role',
          'careslink_v1_generation_owner',
          'careslink_v1_generation_executor',
          'careslink_v1_generation_registration_control_executor'
        )
    ) then
      raise exception 'owner API executor global default ACL leaked: %',
        v_object_kind;
    end if;
  end loop;

  if exists (
    select 1
    from pg_default_acl as defaults
    cross join lateral aclexplode(defaults.defaclacl) as acl
    left join pg_roles as grantee on grantee.oid = acl.grantee
    where defaults.defaclrole = v_owner_api
      and (
        defaults.defaclnamespace not in (0, v_schema)
        or acl.grantee = 0
        or grantee.rolname in (
          'anon', 'authenticated', 'service_role',
          'careslink_v1_generation_owner',
          'careslink_v1_generation_executor',
          'careslink_v1_generation_registration_control_executor'
        )
      )
  ) then
    raise exception 'owner API executor schema default ACL leaked';
  end if;
end
$$;

-- Exact private RPC identities, owners, definer posture and sole executor.
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
  v_owner_api oid := 'careslink_v1_generation_owner_api_executor'::regrole;
  v_expected jsonb := jsonb_build_object(
    'admit_and_enqueue_v1_shadow_note_generation_job',
      'p_owner_user_id uuid, p_session_id uuid, p_admission_transport text, p_job_id uuid, p_payload_id uuid, p_privacy_review_id uuid, p_note_type text, p_source_locale text, p_contract_version text, p_schema_version text, p_cleaned_facts_hash text, p_idempotency_hash text, p_request_hash text, p_payload_handle_hash text, p_payload_expires_at timestamp with time zone',
    'get_v1_shadow_note_generation_job_status',
      'p_owner_user_id uuid, p_session_id uuid, p_job_id uuid, p_contract_version text, p_schema_version text',
    'cancel_v1_shadow_note_generation_job',
      'p_owner_user_id uuid, p_session_id uuid, p_job_id uuid, p_contract_version text, p_schema_version text'
  );
  v_entry record;
  v_actual text;
  v_grantees text[];
  v_denied_role text;
begin
  if (
    select count(*)
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname in (
        'admit_and_enqueue_v1_shadow_note_generation_job',
        'get_v1_shadow_note_generation_job_status',
        'cancel_v1_shadow_note_generation_job'
      )
  ) <> 3 then
    raise exception 'owner runtime RPC identity set drifted';
  end if;

  for v_entry in select * from jsonb_each_text(v_expected)
  loop
    select pg_get_function_identity_arguments(procedure.oid)
    into v_actual
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname = v_entry.key;
    if v_actual is distinct from v_entry.value then
      raise exception 'owner runtime RPC signature drifted: % => %',
        v_entry.key, v_actual;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname in (
        'admit_and_enqueue_v1_shadow_note_generation_job',
        'get_v1_shadow_note_generation_job_status',
        'cancel_v1_shadow_note_generation_job'
      )
      and (
        procedure.prokind <> 'f'
        or procedure.prorettype <> 'jsonb'::regtype
        or procedure.provolatile <> 'v'
        or not procedure.prosecdef
        or procedure.proowner <> v_owner_api
        or procedure.proconfig is null
        or cardinality(procedure.proconfig) <> 1
        or procedure.proconfig[1] is null
        or procedure.proconfig[1] not in ('search_path=', 'search_path=""')
      )
  ) then
    raise exception 'owner runtime RPC definer posture drifted';
  end if;

  for v_entry in
    select procedure.oid, procedure.proname
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname in (
        'admit_and_enqueue_v1_shadow_note_generation_job',
        'get_v1_shadow_note_generation_job_status',
        'cancel_v1_shadow_note_generation_job'
      )
  loop
    select array_agg(
      case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
      order by case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end
    )
    into v_grantees
    from aclexplode(
      coalesce(
        (select procedure.proacl from pg_proc as procedure
         where procedure.oid = v_entry.oid),
        acldefault('f', v_owner_api)
      )
    ) as acl
    left join pg_roles as grantee on grantee.oid = acl.grantee
    where acl.privilege_type = 'EXECUTE';

    if v_grantees is distinct from
      array['careslink_v1_generation_owner_api_executor']::text[]
    then
      raise exception 'owner runtime RPC execute grantees drifted: % => %',
        v_entry.proname, v_grantees;
    end if;
  end loop;

  foreach v_denied_role in array array[
    'anon', 'authenticated', 'service_role',
    'careslink_v1_generation_executor',
    'careslink_v1_generation_owner',
    'careslink_v1_generation_registration_control_executor'
  ] loop
    if has_function_privilege(
        v_denied_role,
        'careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,timestamptz)',
        'EXECUTE'
      )
      or has_function_privilege(
        v_denied_role,
        'careslink_v1_generation.get_v1_shadow_note_generation_job_status(uuid,uuid,uuid,text,text)',
        'EXECUTE'
      )
      or has_function_privilege(
        v_denied_role,
        'careslink_v1_generation.cancel_v1_shadow_note_generation_job(uuid,uuid,uuid,text,text)',
        'EXECUTE'
      )
    then
      raise exception 'denied role can execute owner runtime RPC: %',
        v_denied_role;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc as procedure
    where procedure.pronamespace = 'public'::regnamespace
      and procedure.proname in (
        'admit_and_enqueue_v1_shadow_note_generation_job',
        'get_v1_shadow_note_generation_job_status',
        'cancel_v1_shadow_note_generation_job'
      )
  ) then
    raise exception 'public owner runtime RPC wrapper unexpectedly exists';
  end if;
end
$$;

-- Freeze the wall-clock proof points without pretending this single
-- transaction exercises a cross-session wait. Each RPC must use the exact
-- millisecond clock expression, never the worker transaction-time helper.
do $$
declare
  v_clock constant text :=
    'date_trunc(''milliseconds'', pg_catalog.clock_timestamp())';
  v_enqueue text;
  v_status text;
  v_cancel text;
  v_enqueue_clock_count integer;
  v_status_clock_count integer;
  v_cancel_clock_count integer;
begin
  select procedure.prosrc
  into v_enqueue
  from pg_proc as procedure
  where procedure.oid =
    'careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,timestamptz)'::regprocedure;
  select procedure.prosrc
  into v_status
  from pg_proc as procedure
  where procedure.oid =
    'careslink_v1_generation.get_v1_shadow_note_generation_job_status(uuid,uuid,uuid,text,text)'::regprocedure;
  select procedure.prosrc
  into v_cancel
  from pg_proc as procedure
  where procedure.oid =
    'careslink_v1_generation.cancel_v1_shadow_note_generation_job(uuid,uuid,uuid,text,text)'::regprocedure;

  v_enqueue_clock_count :=
    (length(v_enqueue) - length(replace(v_enqueue, v_clock, '')))
      / length(v_clock);
  v_status_clock_count :=
    (length(v_status) - length(replace(v_status, v_clock, '')))
      / length(v_clock);
  v_cancel_clock_count :=
    (length(v_cancel) - length(replace(v_cancel, v_clock, '')))
      / length(v_clock);

  if v_enqueue_clock_count <> 10
    or v_status_clock_count <> 2
    or v_cancel_clock_count <> 4
    or v_enqueue like '%_server_now(%'
    or v_status like '%_server_now(%'
    or v_cancel like '%_server_now(%'
    or (
      length(v_enqueue) - length(replace(
        v_enqueue,
        'fresh_session_is_active(',
        ''
      ))
    ) / length('fresh_session_is_active(') <> 10
    or (
      length(v_enqueue) - length(replace(
        v_enqueue,
        'fresh_privacy_proof_expires_at(',
        ''
      ))
    ) / length('fresh_privacy_proof_expires_at(') <> 3
    or (
      length(v_status) - length(replace(
        v_status,
        'fresh_session_is_active(',
        ''
      ))
    ) / length('fresh_session_is_active(') <> 2
    or (
      length(v_cancel) - length(replace(
        v_cancel,
        'fresh_session_is_active(',
        ''
      ))
    ) / length('fresh_session_is_active(') <> 4
  then
    raise exception
      'owner RPC wall-clock/session/privacy proof-point set drifted';
  end if;

  if position('pg_catalog.pg_advisory_xact_lock' in v_enqueue) = 0
    or position(v_clock in v_enqueue) <
      position('pg_catalog.pg_advisory_xact_lock' in v_enqueue)
    or position('v_existing_job_found := found' in v_enqueue) = 0
    or position('for share of binding;' in v_enqueue) = 0
    or position('_registration_accepts_new_work(' in v_enqueue) <
      position('for share of binding;' in v_enqueue)
    or position('and binding.registration_digest = v_binding_registration_digest' in v_enqueue) <
      position('_registration_accepts_new_work(' in v_enqueue)
    or (
      length(v_enqueue) - length(replace(
        v_enqueue,
        '_registration_accepts_new_work(',
        ''
      ))
    ) / length('_registration_accepts_new_work(') <> 1
    or position('binding.activated_at' in v_enqueue) = 0
    or position('v_binding.activated_at > v_now' in v_enqueue) = 0
    or position('inserts have cleared those waits' in v_enqueue) = 0
    or position(v_clock in substring(
      v_enqueue from position('inserts have cleared those waits' in v_enqueue)
    )) = 0
    or position('perform attempt.id' in v_cancel) = 0
    or position('elsif v_running_attempt_count <> 0' in v_cancel) = 0
    or position('select payload.*' in v_cancel) <
      position('perform attempt.id' in v_cancel)
    or position(v_clock in substring(
      v_cancel from position('perform outbox.id' in v_cancel)
    )) = 0
  then
    raise exception 'owner RPC post-lock wall-clock source ordering drifted';
  end if;
end
$$;

-- The owner executor has the exact helper/RPC surface, SELECT on thirteen
-- metadata tables, and only the column DML needed by the three RPCs. The
-- retirement ledger is read-only here; its control-plane writer stays private.
do $$
declare
  v_owner_api oid := 'careslink_v1_generation_owner_api_executor'::regrole;
begin
  if exists (
    with expected(object_oid) as (
      values
        ('careslink_v1_generation._server_time(timestamptz)'::regprocedure::oid),
        ('careslink_v1_generation._sha256_text(text)'::regprocedure::oid),
        ('careslink_v1_generation._set_owner(uuid)'::regprocedure::oid),
        ('careslink_v1_generation._worker_policy_is_valid(text,text)'::regprocedure::oid),
        ('careslink_v1_generation._provider_policy_is_valid(text,text,text)'::regprocedure::oid),
        ('careslink_v1_generation._registration_is_valid(text,text,text,text,text,text)'::regprocedure::oid),
        ('careslink_v1_generation._registration_accepts_new_work(text)'::regprocedure::oid),
        ('careslink_v1_generation._payload_snapshot_is_valid(text,text,text,text)'::regprocedure::oid),
        ('careslink_v1_generation._enqueue_payload_purge(uuid,uuid,uuid,uuid,text,timestamptz)'::regprocedure::oid),
        ('careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)'::regprocedure::oid),
        ('careslink_v1_generation.fresh_privacy_proof_expires_at(uuid,uuid,text,text,text,text,timestamptz)'::regprocedure::oid),
        ('public.v1_shadow_canonical_json(jsonb)'::regprocedure::oid),
        ('public.v1_shadow_content_sha256(jsonb)'::regprocedure::oid),
        ('extensions.gen_random_uuid()'::regprocedure::oid),
        ('extensions.digest(bytea,text)'::regprocedure::oid),
        ('careslink_v1_generation._owner_api_assert_contract(text,text)'::regprocedure::oid),
        ('careslink_v1_generation._owner_api_job_view(uuid,uuid)'::regprocedure::oid),
        ('careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,timestamptz)'::regprocedure::oid),
        ('careslink_v1_generation.get_v1_shadow_note_generation_job_status(uuid,uuid,uuid,text,text)'::regprocedure::oid),
        ('careslink_v1_generation.cancel_v1_shadow_note_generation_job(uuid,uuid,uuid,text,text)'::regprocedure::oid)
    ),
    actual(object_oid) as (
      select procedure.oid
      from pg_proc as procedure
      cross join lateral aclexplode(
        coalesce(procedure.proacl, acldefault('f', procedure.proowner))
      ) as acl
      where acl.grantee = v_owner_api
        and acl.privilege_type = 'EXECUTE'
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'owner API executor direct helper/RPC ACL drifted';
  end if;

  if exists (
    with expected(table_name, privilege_type) as (
      values
        ('admission_policy_bindings', 'SELECT'),
        ('attempts', 'SELECT'),
        ('jobs', 'SELECT'),
        ('payload_grants', 'SELECT'),
        ('payload_policies', 'SELECT'),
        ('payload_purge_outbox', 'SELECT'),
        ('payloads', 'SELECT'),
        ('provider_policies', 'SELECT'),
        ('settings', 'SELECT'),
        ('worker_policies', 'SELECT'),
        ('worker_registration_provider_policies', 'SELECT'),
        ('worker_registration_retirements', 'SELECT'),
        ('worker_registrations', 'SELECT')
    ),
    actual(table_name, privilege_type) as (
      select relation.relname::text, acl.privilege_type
      from pg_class as relation
      cross join lateral aclexplode(
        coalesce(relation.relacl, acldefault('r', relation.relowner))
      ) as acl
      where relation.relnamespace =
          'careslink_v1_generation'::regnamespace
        and relation.relkind = 'r'
        and acl.grantee = v_owner_api
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'owner API executor table ACL drifted';
  end if;

  if exists (
    with expected(table_name, column_name, privilege_type) as (
      values
        ('settings', 'capability', 'UPDATE'),
        ('admission_policy_bindings', 'binding_version', 'UPDATE'),
        ('worker_policies', 'version', 'UPDATE'),
        ('provider_policies', 'note_type', 'UPDATE'),
        ('payload_policies', 'policy_version', 'UPDATE'),
        ('worker_registrations', 'registration_digest', 'UPDATE'),
        ('worker_registration_provider_policies',
          'registration_digest', 'UPDATE'),
        ('jobs', 'id', 'INSERT'),
        ('jobs', 'owner_user_id', 'INSERT'),
        ('jobs', 'initiating_session_id', 'INSERT'),
        ('jobs', 'admission_transport', 'INSERT'),
        ('jobs', 'payload_id', 'INSERT'),
        ('jobs', 'note_type', 'INSERT'),
        ('jobs', 'source_locale', 'INSERT'),
        ('jobs', 'service_code', 'INSERT'),
        ('jobs', 'rate_catalog_version', 'INSERT'),
        ('jobs', 'contract_version', 'INSERT'),
        ('jobs', 'schema_version', 'INSERT'),
        ('jobs', 'privacy_review_id', 'INSERT'),
        ('jobs', 'privacy_scanner_policy_version', 'INSERT'),
        ('jobs', 'privacy_review_revision', 'INSERT'),
        ('jobs', 'cleaned_facts_hash', 'INSERT'),
        ('jobs', 'idempotency_hash', 'INSERT'),
        ('jobs', 'request_hash', 'INSERT'),
        ('jobs', 'worker_policy_version', 'INSERT'),
        ('jobs', 'worker_policy_digest', 'INSERT'),
        ('jobs', 'provider_policy_version', 'INSERT'),
        ('jobs', 'provider_policy_digest', 'INSERT'),
        ('jobs', 'payload_policy_version', 'INSERT'),
        ('jobs', 'payload_policy_snapshot_hash', 'INSERT'),
        ('jobs', 'status', 'INSERT'),
        ('jobs', 'attempt_count', 'INSERT'),
        ('jobs', 'next_eligible_at', 'INSERT'),
        ('jobs', 'created_at', 'INSERT'),
        ('jobs', 'updated_at', 'INSERT'),
        ('jobs', 'shadow_only', 'INSERT'),
        ('jobs', 'status', 'UPDATE'),
        ('jobs', 'next_eligible_at', 'UPDATE'),
        ('jobs', 'failure_reason', 'UPDATE'),
        ('jobs', 'updated_at', 'UPDATE'),
        ('jobs', 'finished_at', 'UPDATE'),
        ('attempts', 'status', 'UPDATE'),
        ('attempts', 'failure_reason', 'UPDATE'),
        ('attempts', 'finished_at', 'UPDATE'),
        ('attempts', 'terminal_transaction_id', 'UPDATE'),
        ('payloads', 'id', 'INSERT'),
        ('payloads', 'job_id', 'INSERT'),
        ('payloads', 'owner_user_id', 'INSERT'),
        ('payloads', 'note_type', 'INSERT'),
        ('payloads', 'source_locale', 'INSERT'),
        ('payloads', 'contract_version', 'INSERT'),
        ('payloads', 'schema_version', 'INSERT'),
        ('payloads', 'privacy_review_id', 'INSERT'),
        ('payloads', 'privacy_proof_expires_at', 'INSERT'),
        ('payloads', 'cleaned_facts_hash', 'INSERT'),
        ('payloads', 'request_hash', 'INSERT'),
        ('payloads', 'policy_version', 'INSERT'),
        ('payloads', 'encryption_profile_version', 'INSERT'),
        ('payloads', 'backup_disposition_version', 'INSERT'),
        ('payloads', 'policy_snapshot_hash', 'INSERT'),
        ('payloads', 'payload_handle_hash', 'INSERT'),
        ('payloads', 'state', 'INSERT'),
        ('payloads', 'expires_at', 'INSERT'),
        ('payloads', 'available_at', 'INSERT'),
        ('payloads', 'purge_attempt_count', 'INSERT'),
        ('payloads', 'created_at', 'INSERT'),
        ('payloads', 'updated_at', 'INSERT'),
        ('payloads', 'shadow_only', 'INSERT'),
        ('payloads', 'state', 'UPDATE'),
        ('payloads', 'revoked_at', 'UPDATE'),
        ('payloads', 'revoke_reason', 'UPDATE'),
        ('payloads', 'purge_requested_at', 'UPDATE'),
        ('payloads', 'updated_at', 'UPDATE'),
        ('payload_grants', 'status', 'UPDATE'),
        ('payload_grants', 'revoked_at', 'UPDATE'),
        ('payload_purge_outbox', 'id', 'UPDATE'),
        ('payload_purge_outbox', 'id', 'INSERT'),
        ('payload_purge_outbox', 'transaction_id', 'INSERT'),
        ('payload_purge_outbox', 'payload_id', 'INSERT'),
        ('payload_purge_outbox', 'job_id', 'INSERT'),
        ('payload_purge_outbox', 'owner_user_id', 'INSERT'),
        ('payload_purge_outbox', 'reason', 'INSERT'),
        ('payload_purge_outbox', 'event_reference_hash', 'INSERT'),
        ('payload_purge_outbox', 'status', 'INSERT'),
        ('payload_purge_outbox', 'requested_at', 'INSERT'),
        ('payload_purge_outbox', 'attempt_count', 'INSERT'),
        ('payload_purge_outbox', 'created_at', 'INSERT'),
        ('payload_purge_outbox', 'shadow_only', 'INSERT')
    ),
    actual(table_name, column_name, privilege_type) as (
      select
        relation.relname::text,
        attribute.attname::text,
        acl.privilege_type
      from pg_attribute as attribute
      join pg_class as relation on relation.oid = attribute.attrelid
      cross join lateral aclexplode(attribute.attacl) as acl
      where relation.relnamespace =
          'careslink_v1_generation'::regnamespace
        and relation.relkind = 'r'
        and attribute.attnum > 0
        and not attribute.attisdropped
        and attribute.attacl is not null
        and acl.grantee = v_owner_api
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'owner API executor column DML ACL drifted';
  end if;

  if has_table_privilege(
      v_owner_api,
      'careslink_v1_generation.provider_evidence',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    or has_any_column_privilege(
      v_owner_api,
      'careslink_v1_generation.provider_evidence',
      'SELECT, INSERT, UPDATE, REFERENCES'
    )
    or has_table_privilege(
      v_owner_api,
      'careslink_v1_generation.worker_registration_retirements',
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    or has_any_column_privilege(
      v_owner_api,
      'careslink_v1_generation.worker_registration_retirements',
      'INSERT, UPDATE, REFERENCES'
    )
    or has_table_privilege(
      v_owner_api,
      'auth.users',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    or has_table_privilege(
      v_owner_api,
      'auth.sessions',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    or has_table_privilege(
      v_owner_api,
      'public.privacy_reviews',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    or exists (
      select 1
      from pg_type as object_type
      where object_type.typnamespace =
          'careslink_v1_generation'::regnamespace
        and (
          has_type_privilege(
            'careslink_v1_generation_owner_api_executor',
            object_type.oid,
            'USAGE'
          )
          or has_type_privilege(
            'careslink_v1_generation_executor',
            object_type.oid,
            'USAGE'
          )
        )
    )
  then
    raise exception
      'owner/worker executor crossed evidence/auth/privacy/type boundary';
  end if;
end
$$;

-- Exact singleton-role policies: eight read-only catalogs plus owner-GUC
-- isolation for jobs, attempts, payloads, grants and purge outbox.
do $$
declare
  v_owner_api oid := 'careslink_v1_generation_owner_api_executor'::regrole;
begin
  if exists (
    with expected(table_name, policy_name, command) as (
      values
        ('settings', 'settings_owner_api_select', 'r'),
        ('admission_policy_bindings',
          'admission_policy_bindings_owner_api_select', 'r'),
        ('worker_policies', 'worker_policies_owner_api_select', 'r'),
        ('provider_policies', 'provider_policies_owner_api_select', 'r'),
        ('payload_policies', 'payload_policies_owner_api_select', 'r'),
        ('worker_registrations',
          'worker_registrations_owner_api_select', 'r'),
        ('worker_registration_provider_policies',
          'registration_provider_owner_api_select', 'r'),
        ('worker_registration_retirements',
          'worker_registration_retirements_owner_api_select', 'r'),
        ('settings', 'settings_owner_api_lock', 'w'),
        ('admission_policy_bindings',
          'admission_policy_bindings_owner_api_lock', 'w'),
        ('worker_policies', 'worker_policies_owner_api_lock', 'w'),
        ('provider_policies', 'provider_policies_owner_api_lock', 'w'),
        ('payload_policies', 'payload_policies_owner_api_lock', 'w'),
        ('worker_registrations',
          'worker_registrations_owner_api_lock', 'w'),
        ('worker_registration_provider_policies',
          'registration_provider_owner_api_lock', 'w'),
        ('jobs', 'jobs_owner_api_select', 'r'),
        ('jobs', 'jobs_owner_api_insert', 'a'),
        ('jobs', 'jobs_owner_api_update', 'w'),
        ('attempts', 'attempts_owner_api_select', 'r'),
        ('attempts', 'attempts_owner_api_update', 'w'),
        ('payloads', 'payloads_owner_api_select', 'r'),
        ('payloads', 'payloads_owner_api_insert', 'a'),
        ('payloads', 'payloads_owner_api_update', 'w'),
        ('payload_grants', 'payload_grants_owner_api_select', 'r'),
        ('payload_grants', 'payload_grants_owner_api_update', 'w'),
        ('payload_purge_outbox', 'purge_outbox_owner_api_select', 'r'),
        ('payload_purge_outbox', 'purge_outbox_owner_api_insert', 'a'),
        ('payload_purge_outbox', 'purge_outbox_owner_api_lock', 'w')
    ),
    actual(table_name, policy_name, command) as (
      select relation.relname::text, policy.polname::text, policy.polcmd::text
      from pg_policy as policy
      join pg_class as relation on relation.oid = policy.polrelid
      where relation.relnamespace =
          'careslink_v1_generation'::regnamespace
        and v_owner_api = any(policy.polroles)
    ),
    drift as (
      (select * from actual except all select * from expected)
      union all
      (select * from expected except all select * from actual)
    )
    select 1 from drift
  ) then
    raise exception 'owner API RLS policy identity set drifted';
  end if;

  if exists (
    select 1
    from pg_policy as policy
    join pg_class as relation on relation.oid = policy.polrelid
    where relation.relnamespace =
        'careslink_v1_generation'::regnamespace
      and v_owner_api = any(policy.polroles)
      and (
        not policy.polpermissive
        or policy.polroles is distinct from array[v_owner_api]::oid[]
        or (
          policy.polcmd = 'r'
          and (policy.polqual is null or policy.polwithcheck is not null)
        )
        or (
          policy.polcmd = 'a'
          and (policy.polqual is not null or policy.polwithcheck is null)
        )
        or (
          policy.polcmd = 'w'
          and (policy.polqual is null or policy.polwithcheck is null)
        )
        or (
          policy.polname like '%\_owner\_api\_lock' escape '\'
          and policy.polname <> 'purge_outbox_owner_api_lock'
          and (
            pg_get_expr(policy.polqual, policy.polrelid) <> 'true'
            or pg_get_expr(policy.polwithcheck, policy.polrelid) <> 'false'
          )
        )
        or (
          policy.polname = 'purge_outbox_owner_api_lock'
          and pg_get_expr(policy.polwithcheck, policy.polrelid) <> 'false'
        )
        or policy.polcmd not in ('r', 'a', 'w')
      )
  ) then
    raise exception 'owner API RLS policy shape drifted';
  end if;

  if exists (
    select 1
    from pg_policy as policy
    join pg_class as relation on relation.oid = policy.polrelid
    where relation.relnamespace =
        'careslink_v1_generation'::regnamespace
      and (
        0::oid = any(policy.polroles)
        or 'anon'::regrole::oid = any(policy.polroles)
        or 'authenticated'::regrole::oid = any(policy.polroles)
        or 'service_role'::regrole::oid = any(policy.polroles)
      )
  ) then
    raise exception 'Data API RLS policy leaked into owner private schema';
  end if;
end
$$;

-- Assertion-only SET edges. They are revoked before the final ROLLBACK and
-- never represent a runtime caller credential or login role.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_owner_api_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

create temporary table owner_rpc_assertion_policy_values (
  note_type text primary key,
  service_code text not null,
  provider_digest text not null
) on commit drop;

create temporary table owner_rpc_assertion_state (
  scenario text primary key,
  job_id uuid not null,
  payload_id uuid not null,
  attempt_id uuid,
  lease_token text,
  grant_id uuid
) on commit drop;

grant select on owner_rpc_assertion_policy_values
  to careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
grant select, insert, update on owner_rpc_assertion_state
  to careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

-- All digest values are derived from the same canonical definitions validated
-- by the worker helpers; no policy version is guessed by an RPC caller.
select set_config(
  'careslink.assert.owner.facts_hash',
  public.v1_shadow_content_sha256(
    '{"occurred_at":"2026-08-11T00:15:30Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"clean","action_taken":"documented"}'::jsonb
  ),
  true
);

select set_config(
  'careslink.assert.owner.worker_identity_hash',
  encode(
    extensions.digest(
      convert_to('owner-runtime-test-only-worker', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  true
);

select set_config(
  'careslink.assert.owner.worker_policy_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-worker-policy',
      'version', 'worker.owner.test.v1',
      'status', 'APPROVED',
      'maxQueueAgeMs', 600000,
      'minimumPayloadRemainingAtClaimMs', 60000,
      'leaseDurationMs', 10000,
      'heartbeatIntervalMs', 2000,
      'heartbeatSafetyMarginMs', 1000,
      'attemptDeadlineMs', 30000,
      'providerDeadlineMs', 20000,
      'commitSafetyMarginMs', 5000,
      'maxAttempts', 2,
      'retryDelayMsAfterAttempt', jsonb_build_array(1000),
      'retryableOutcomes', jsonb_build_array(
        'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT'
      ),
      'recoveryBatchLimit', 10,
      'jitter', jsonb_build_object('mode', 'NONE')
    )
  ),
  true
);

select set_config(
  'careslink.assert.owner.payload_policy_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'policyVersion', 'payload.owner.test.v1',
      'encryptionProfileVersion', 'encryption.owner.test.v1',
      'backupDispositionVersion', 'backup.owner.test.v1'
    )
  ),
  true
);

insert into owner_rpc_assertion_policy_values (
  note_type,
  service_code,
  provider_digest
)
select
  policy.note_type,
  policy.service_code,
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'noteType', policy.note_type,
      'serviceCode', policy.service_code,
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'rateCatalogVersion', '2026-08-09.v1-shadow',
      'providerId', 'provider.owner.test',
      'modelId', 'model.owner.test',
      'modelRevision', null,
      'modelRevisionAvailability', 'PROVIDER_NOT_EXPOSED',
      'policyVersion', 'provider.owner.test.v1',
      'promptTemplateVersion', 'prompt.owner.test.v1',
      'goldenSetVersion', 'golden.owner.test.v1',
      'parserVersion', 'parser.owner.test.v1',
      'timeoutMs', 20000
    )
  )
from (values
  ('communication', 'note.communication.generate'),
  ('handover', 'note.handover.generate'),
  ('progress', 'note.progress.generate'),
  ('ndis', 'note.ndis.generate'),
  ('incident_factual', 'note.incident_factual.generate')
) as policy(note_type, service_code);

select set_config(
  'careslink.assert.owner.registration_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-registered-worker',
      'registrationVersion', 'registration.owner.test.v1',
      'status', 'APPROVED',
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'workerIdentityVersion', 'worker-identity.owner.test.v1',
      'workerIdentityHash',
        current_setting('careslink.assert.owner.worker_identity_hash'),
      'workerPolicyVersion', 'worker.owner.test.v1',
      'workerPolicyDigest',
        current_setting('careslink.assert.owner.worker_policy_digest'),
      'payloadPolicyVersion', 'payload.owner.test.v1',
      'payloadPolicySnapshotHash',
        current_setting('careslink.assert.owner.payload_policy_digest'),
      'providerPolicies', (
        select jsonb_agg(
          jsonb_build_object(
            'noteType', policy.note_type,
            'policyVersion', 'provider.owner.test.v1',
            'policyDigest', policy.provider_digest
          )
          order by case policy.note_type
            when 'communication' then 1
            when 'handover' then 2
            when 'progress' then 3
            when 'ndis' then 4
            when 'incident_factual' then 5
          end
        )
        from owner_rpc_assertion_policy_values as policy
      )
    )
  ),
  true
);

-- Fresh auth/session/privacy metadata is inserted only by the migration actor.
-- The owner executor will prove it can consume the two metadata readers while
-- retaining no auth or privacy table privilege.
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
) values
  (
    'c0000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner-runtime-a@example.invalid',
    'test-only-no-login',
    date_trunc('milliseconds', transaction_timestamp()),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb,
    transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'owner-runtime-b@example.invalid',
    'test-only-no-login',
    date_trunc('milliseconds', transaction_timestamp()),
    '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
    '{}'::jsonb,
    transaction_timestamp(),
    transaction_timestamp()
  );

insert into auth.sessions (
  id,
  user_id,
  created_at,
  updated_at,
  not_after
) values
  (
    'c1000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    transaction_timestamp(),
    transaction_timestamp(),
    null
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000002',
    transaction_timestamp(),
    transaction_timestamp(),
    null
  ),
  (
    'c1000000-0000-4000-8000-000000000099',
    'c0000000-0000-4000-8000-000000000001',
    transaction_timestamp(),
    transaction_timestamp(),
    date_trunc('milliseconds', transaction_timestamp())
      + interval '1 millisecond'
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
) values
  (
    'c2000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'communication',
    current_setting('careslink.assert.owner.facts_hash'),
    '2026-08-09.v1-shadow',
    'CONFIRMED',
    '[]'::jsonb,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
    '1.0.0-shadow.1',
    '2026-08-11.preview.1',
    1,
    'privacy.owner.runtime.a.0001',
    repeat('9', 64),
    true,
    true,
    true
  ),
  (
    'c2000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000002',
    'communication',
    current_setting('careslink.assert.owner.facts_hash'),
    '2026-08-09.v1-shadow',
    'CONFIRMED',
    '[]'::jsonb,
    date_trunc('milliseconds', transaction_timestamp()),
    date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
    '1.0.0-shadow.1',
    '2026-08-11.preview.1',
    1,
    'privacy.owner.runtime.b.0001',
    repeat('8', 64),
    true,
    true,
    true
  ),
  (
    'c2000000-0000-4000-8000-000000000099',
    'c0000000-0000-4000-8000-000000000001',
    'communication',
    current_setting('careslink.assert.owner.facts_hash'),
    '2026-08-09.v1-shadow',
    'CONFIRMED',
    '[]'::jsonb,
    date_trunc('milliseconds', transaction_timestamp())
      - interval '30 minutes' + interval '1 millisecond',
    date_trunc('milliseconds', transaction_timestamp())
      + interval '1 millisecond',
    '1.0.0-shadow.1',
    '2026-08-11.preview.1',
    1,
    'privacy.owner.runtime.clock-expiry.0099',
    repeat('7', 64),
    true,
    true,
    true
  );

-- Default-off and zero-binding/zero-fixture posture is read through the real
-- owner executor policy. A valid caller still cannot create durable state.
set local role careslink_v1_generation_owner_api_executor;

do $$
declare
  v_disabled boolean := false;
begin
  if (
      select count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is false
        and shadow_only is true
    ) <> 1
    or (select count(*) from careslink_v1_generation.settings) <> 1
    or (
      select count(*)
      from careslink_v1_generation.admission_policy_bindings
    ) <> 0
    or (select count(*) from careslink_v1_generation.worker_policies) <> 0
    or (select count(*) from careslink_v1_generation.provider_policies) <> 0
    or (select count(*) from careslink_v1_generation.payload_policies) <> 0
    or (select count(*) from careslink_v1_generation.worker_registrations) <> 0
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_provider_policies
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_retirements
    ) <> 0
    or (select count(*) from careslink_v1_generation.jobs) <> 0
    or (select count(*) from careslink_v1_generation.attempts) <> 0
    or (select count(*) from careslink_v1_generation.payloads) <> 0
    or (select count(*) from careslink_v1_generation.payload_grants) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
    ) <> 0
  then
    raise exception 'owner runtime RPC migration is not default-off and empty';
  end if;

  begin
    perform
      careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
        'c0000000-0000-4000-8000-000000000001'::uuid,
        'c1000000-0000-4000-8000-000000000001'::uuid,
        'BEARER',
        'c3000000-0000-4000-8000-000000000090'::uuid,
        'c5000000-0000-4000-8000-000000000090'::uuid,
        'c2000000-0000-4000-8000-000000000001'::uuid,
        'communication',
        'en',
        '1.0.0-shadow.1',
        '2026-08-09.v1-shadow',
        current_setting('careslink.assert.owner.facts_hash'),
        repeat('0', 64),
        repeat('0', 64),
        repeat('0', 64),
        transaction_timestamp() + interval '10 minutes'
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_disabled := true;
    else
      raise;
    end if;
  end;

  if not v_disabled
    or (select count(*) from careslink_v1_generation.jobs) <> 0
    or (select count(*) from careslink_v1_generation.payloads) <> 0
  then
    raise exception 'default-off owner admission did not fail atomically';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Install a complete TEST_ONLY catalog and enable the capability, but leave
-- admission unbound for the first policy-selection denial.
set local role careslink_v1_generation_owner;

alter table careslink_v1_generation.settings no force row level security;
alter table careslink_v1_generation.admission_policy_bindings
  no force row level security;
alter table careslink_v1_generation.worker_policies
  no force row level security;
alter table careslink_v1_generation.provider_policies
  no force row level security;
alter table careslink_v1_generation.payload_policies
  no force row level security;
alter table careslink_v1_generation.worker_registrations
  no force row level security;
alter table careslink_v1_generation.worker_registration_provider_policies
  no force row level security;

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
  'worker.owner.test.v1',
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
  current_setting('careslink.assert.owner.worker_policy_digest'),
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
)
select
  policy.note_type,
  'provider.owner.test.v1',
  'APPROVED',
  policy.service_code,
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  '2026-08-09.v1-shadow',
  'provider.owner.test',
  'model.owner.test',
  null,
  'PROVIDER_NOT_EXPOSED',
  'prompt.owner.test.v1',
  'golden.owner.test.v1',
  'parser.owner.test.v1',
  20000,
  policy.provider_digest,
  true
from owner_rpc_assertion_policy_values as policy;

insert into careslink_v1_generation.payload_policies (
  policy_version,
  status,
  encryption_profile_version,
  backup_disposition_version,
  policy_digest,
  shadow_only
) values (
  'payload.owner.test.v1',
  'APPROVED',
  'encryption.owner.test.v1',
  'backup.owner.test.v1',
  current_setting('careslink.assert.owner.payload_policy_digest'),
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
  current_setting('careslink.assert.owner.registration_digest'),
  'registration.owner.test.v1',
  'APPROVED',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'worker-identity.owner.test.v1',
  current_setting('careslink.assert.owner.worker_identity_hash'),
  'worker.owner.test.v1',
  current_setting('careslink.assert.owner.worker_policy_digest'),
  'payload.owner.test.v1',
  current_setting('careslink.assert.owner.payload_policy_digest'),
  true
);

insert into careslink_v1_generation.worker_registration_provider_policies (
  registration_digest,
  note_type,
  policy_version,
  policy_digest,
  shadow_only
)
select
  current_setting('careslink.assert.owner.registration_digest'),
  policy.note_type,
  'provider.owner.test.v1',
  policy.provider_digest,
  true
from owner_rpc_assertion_policy_values as policy;

alter table careslink_v1_generation.worker_registration_provider_policies
  force row level security;
alter table careslink_v1_generation.worker_registrations
  force row level security;
alter table careslink_v1_generation.payload_policies
  force row level security;
alter table careslink_v1_generation.provider_policies
  force row level security;
alter table careslink_v1_generation.worker_policies
  force row level security;
alter table careslink_v1_generation.admission_policy_bindings
  force row level security;
alter table careslink_v1_generation.settings force row level security;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

set local role careslink_v1_generation_owner_api_executor;

do $$
declare
  v_disabled boolean := false;
begin
  begin
    perform
      careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
        'c0000000-0000-4000-8000-000000000001'::uuid,
        'c1000000-0000-4000-8000-000000000001'::uuid,
        'BEARER',
        'c3000000-0000-4000-8000-000000000091'::uuid,
        'c5000000-0000-4000-8000-000000000091'::uuid,
        'c2000000-0000-4000-8000-000000000001'::uuid,
        'communication',
        'en',
        '1.0.0-shadow.1',
        '2026-08-09.v1-shadow',
        current_setting('careslink.assert.owner.facts_hash'),
        repeat('1', 64),
        repeat('1', 64),
        repeat('1', 64),
        transaction_timestamp() + interval '10 minutes'
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_disabled := true;
    else
      raise;
    end if;
  end;

  if not v_disabled
    or (
      select count(*)
      from careslink_v1_generation.admission_policy_bindings
      where status = 'ACTIVE'
    ) <> 0
    or (select count(*) from careslink_v1_generation.jobs) <> 0
    or (select count(*) from careslink_v1_generation.payloads) <> 0
  then
    raise exception 'enabled-but-unbound owner admission did not fail closed';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Activate exactly one communication binding inside this transaction. The
-- unique partial index remains the database-owned arbitration point.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.admission_policy_bindings
  no force row level security;
insert into careslink_v1_generation.admission_policy_bindings (
  binding_version,
  note_type,
  registration_digest,
  status,
  activated_at,
  created_at,
  shadow_only
) values (
  'binding.owner.test.v1',
  'communication',
  current_setting('careslink.assert.owner.registration_digest'),
  'ACTIVE',
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp()),
  true
);
alter table careslink_v1_generation.admission_policy_bindings
  force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The seven identity-column UPDATE grants exist only so SELECT ... FOR SHARE
-- can lock catalog rows. Always-false WITH CHECK policies must reject every
-- direct no-op mutation while leaving the catalog unchanged.
set local role careslink_v1_generation_owner_api_executor;
do $$
declare
  v_target record;
  v_denied_count integer := 0;
begin
  for v_target in
    select target.table_name, target.column_name
    from (values
      ('settings', 'capability'),
      ('admission_policy_bindings', 'binding_version'),
      ('worker_policies', 'version'),
      ('provider_policies', 'note_type'),
      ('payload_policies', 'policy_version'),
      ('worker_registrations', 'registration_digest'),
      ('worker_registration_provider_policies', 'registration_digest')
    ) as target(table_name, column_name)
  loop
    begin
      execute format(
        'update careslink_v1_generation.%I set %I = %I',
        v_target.table_name,
        v_target.column_name,
        v_target.column_name
      );
    exception when insufficient_privilege then
      v_denied_count := v_denied_count + 1;
    end;
  end loop;

  if v_denied_count <> 7 then
    raise exception 'catalog row-lock grant permitted direct no-op UPDATE: %',
      v_denied_count;
  end if;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Admission, exact replay, response-loss replay with replacement candidate
-- IDs, changed-input conflict, payload identity conflict, owner scoping,
-- session freshness, privacy freshness and status/BOLA behavior.
set local role careslink_v1_generation_owner_api_executor;

do $$
declare
  v_first jsonb;
  v_replay jsonb;
  v_candidate_replay jsonb;
  v_status jsonb;
  v_owner_b jsonb;
  v_job jsonb;
  v_idempotency_conflict boolean := false;
  v_identity_conflict boolean := false;
  v_job_identity_conflict boolean := false;
  v_enqueue_session_denied boolean := false;
  v_session_denied boolean := false;
  v_cancel_session_denied boolean := false;
  v_privacy_denied boolean := false;
  v_privacy_clock_denied boolean := false;
  v_cross_owner_hidden boolean := false;
begin
  -- Age the 1 ms fixtures past transaction start. An RPC using
  -- transaction_timestamp() would still see both as fresh; clock time must not.
  if date_trunc('milliseconds', pg_catalog.clock_timestamp()) <=
    date_trunc('milliseconds', transaction_timestamp())
      + interval '1 millisecond'
  then
    perform pg_catalog.pg_sleep(0.005);
  end if;
  if date_trunc('milliseconds', pg_catalog.clock_timestamp()) <=
    date_trunc('milliseconds', transaction_timestamp())
      + interval '1 millisecond'
  then
    raise exception 'wall-clock expiry fixture did not age deterministically';
  end if;

  begin
    perform
      careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
        'c0000000-0000-4000-8000-000000000001'::uuid,
        'c1000000-0000-4000-8000-000000000099'::uuid,
        'BEARER',
        'c3000000-0000-4000-8000-000000000098'::uuid,
        'c5000000-0000-4000-8000-000000000098'::uuid,
        'c2000000-0000-4000-8000-000000000001'::uuid,
        'communication',
        'en',
        '1.0.0-shadow.1',
        '2026-08-09.v1-shadow',
        current_setting('careslink.assert.owner.facts_hash'),
        repeat('6', 64),
        repeat('6', 64),
        repeat('6', 64),
        transaction_timestamp() + interval '10 minutes'
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'SESSION_REVOKED' then
      v_enqueue_session_denied := true;
    else
      raise;
    end if;
  end;

  v_first :=
    careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'BEARER',
      'c3000000-0000-4000-8000-000000000001'::uuid,
      'c5000000-0000-4000-8000-000000000001'::uuid,
      'c2000000-0000-4000-8000-000000000001'::uuid,
      'communication',
      'en',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow',
      current_setting('careslink.assert.owner.facts_hash'),
      repeat('a', 64),
      repeat('b', 64),
      repeat('c', 64),
      transaction_timestamp() + interval '10 minutes'
    );
  v_job := v_first->'job';

  if not (v_first ?& array['created', 'payloadAccepted', 'job'])
    or v_first - array['created', 'payloadAccepted', 'job'] <> '{}'::jsonb
    or v_first->'created' is distinct from 'true'::jsonb
    or v_first->'payloadAccepted' is distinct from 'true'::jsonb
    or not (v_job ?& array[
      'jobId', 'status', 'noteType', 'serviceCode', 'attemptCount',
      'createdAt', 'updatedAt', 'startedAt', 'finishedAt', 'failureCode',
      'result'
    ])
    or v_job - array[
      'jobId', 'status', 'noteType', 'serviceCode', 'attemptCount',
      'createdAt', 'updatedAt', 'startedAt', 'finishedAt', 'failureCode',
      'result'
    ] <> '{}'::jsonb
    or v_job->>'jobId' is distinct from
      'c3000000-0000-4000-8000-000000000001'
    or v_job->>'status' is distinct from 'QUEUED'
    or v_job->>'noteType' is distinct from 'communication'
    or v_job->>'serviceCode' is distinct from
      'note.communication.generate'
    or v_job->'attemptCount' is distinct from '0'::jsonb
    or jsonb_typeof(v_job->'createdAt') is distinct from 'string'
    or jsonb_typeof(v_job->'updatedAt') is distinct from 'string'
    or v_job->>'createdAt' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or v_job->>'updatedAt' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or v_job->'startedAt' is distinct from 'null'::jsonb
    or v_job->'finishedAt' is distinct from 'null'::jsonb
    or v_job->'failureCode' is distinct from 'null'::jsonb
    or v_job->'result' is distinct from 'null'::jsonb
    or v_first::text ~*
      'ownerUserId|sessionId|privacyReview|cleanedFacts|idempotency|requestHash|payloadHandle|policyDigest|leaseToken|providerEvidence'
  then
    raise exception 'owner admission response envelope drifted or leaked';
  end if;

  v_replay :=
    careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'BEARER',
      'c3000000-0000-4000-8000-000000000001'::uuid,
      'c5000000-0000-4000-8000-000000000001'::uuid,
      'c2000000-0000-4000-8000-000000000001'::uuid,
      'communication',
      'en',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow',
      current_setting('careslink.assert.owner.facts_hash'),
      repeat('a', 64),
      repeat('b', 64),
      repeat('c', 64),
      transaction_timestamp() + interval '10 minutes'
    );
  if v_replay->'created' is distinct from 'false'::jsonb
    or v_replay->'payloadAccepted' is distinct from 'true'::jsonb
    or v_replay->'job' is distinct from v_first->'job'
    or v_replay - array['created', 'payloadAccepted', 'job'] <> '{}'::jsonb
  then
    raise exception 'exact owner admission replay drifted';
  end if;

  v_candidate_replay :=
    careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'BEARER',
      'c3000000-0000-4000-8000-000000000011'::uuid,
      'c5000000-0000-4000-8000-000000000011'::uuid,
      'c2000000-0000-4000-8000-000000000001'::uuid,
      'communication',
      'en',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow',
      current_setting('careslink.assert.owner.facts_hash'),
      repeat('a', 64),
      repeat('b', 64),
      repeat('d', 64),
      transaction_timestamp() + interval '11 minutes'
    );
  if v_candidate_replay->'created' is distinct from 'false'::jsonb
    or v_candidate_replay->'payloadAccepted' is distinct from 'false'::jsonb
    or v_candidate_replay->'job' is distinct from v_first->'job'
    or v_candidate_replay - array[
      'created', 'payloadAccepted', 'job'
    ] <> '{}'::jsonb
  then
    raise exception 'replacement-candidate admission replay drifted';
  end if;

  begin
    perform
      careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
        'c0000000-0000-4000-8000-000000000001'::uuid,
        'c1000000-0000-4000-8000-000000000001'::uuid,
        'BEARER',
        'c3000000-0000-4000-8000-000000000012'::uuid,
        'c5000000-0000-4000-8000-000000000012'::uuid,
        'c2000000-0000-4000-8000-000000000001'::uuid,
        'communication',
        'en',
        '1.0.0-shadow.1',
        '2026-08-09.v1-shadow',
        current_setting('careslink.assert.owner.facts_hash'),
        repeat('a', 64),
        repeat('f', 64),
        repeat('f', 64),
        transaction_timestamp() + interval '10 minutes'
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IDEMPOTENCY_CONFLICT' then
      v_idempotency_conflict := true;
    else
      raise;
    end if;
  end;

  begin
    perform
      careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
        'c0000000-0000-4000-8000-000000000001'::uuid,
        'c1000000-0000-4000-8000-000000000001'::uuid,
        'BEARER',
        'c3000000-0000-4000-8000-000000000013'::uuid,
        'c5000000-0000-4000-8000-000000000001'::uuid,
        'c2000000-0000-4000-8000-000000000001'::uuid,
        'communication',
        'en',
        '1.0.0-shadow.1',
        '2026-08-09.v1-shadow',
        current_setting('careslink.assert.owner.facts_hash'),
        repeat('a', 64),
        repeat('b', 64),
        repeat('c', 64),
        transaction_timestamp() + interval '10 minutes'
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IDENTITY_LINK_CONFLICT' then
      v_job_identity_conflict := true;
    else
      raise;
    end if;
  end;

  begin
    perform
      careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
        'c0000000-0000-4000-8000-000000000001'::uuid,
        'c1000000-0000-4000-8000-000000000001'::uuid,
        'BEARER',
        'c3000000-0000-4000-8000-000000000001'::uuid,
        'c5000000-0000-4000-8000-000000000001'::uuid,
        'c2000000-0000-4000-8000-000000000001'::uuid,
        'communication',
        'en',
        '1.0.0-shadow.1',
        '2026-08-09.v1-shadow',
        current_setting('careslink.assert.owner.facts_hash'),
        repeat('a', 64),
        repeat('b', 64),
        repeat('f', 64),
        transaction_timestamp() + interval '10 minutes'
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IDENTITY_LINK_CONFLICT' then
      v_identity_conflict := true;
    else
      raise;
    end if;
  end;

  v_status :=
    careslink_v1_generation.get_v1_shadow_note_generation_job_status(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'c3000000-0000-4000-8000-000000000001'::uuid,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  if not (v_status ?& array['job'])
    or v_status - 'job' <> '{}'::jsonb
    or v_status->'job' is distinct from v_first->'job'
  then
    raise exception 'owner queued status response drifted';
  end if;

  v_owner_b :=
    careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000002'::uuid,
      'c1000000-0000-4000-8000-000000000002'::uuid,
      'COOKIE',
      'c3000000-0000-4000-8000-000000000002'::uuid,
      'c5000000-0000-4000-8000-000000000002'::uuid,
      'c2000000-0000-4000-8000-000000000002'::uuid,
      'communication',
      'zh-Hans',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow',
      current_setting('careslink.assert.owner.facts_hash'),
      repeat('a', 64),
      repeat('d', 64),
      repeat('e', 64),
      transaction_timestamp() + interval '10 minutes'
    );
  if v_owner_b->'created' is distinct from 'true'::jsonb
    or v_owner_b->'payloadAccepted' is distinct from 'true'::jsonb
    or v_owner_b #>> '{job,jobId}' is distinct from
      'c3000000-0000-4000-8000-000000000002'
    or v_owner_b #>> '{job,status}' is distinct from 'QUEUED'
  then
    raise exception 'owner-scoped idempotency lane rejected owner B';
  end if;

  begin
    perform careslink_v1_generation.get_v1_shadow_note_generation_job_status(
      'c0000000-0000-4000-8000-000000000002'::uuid,
      'c1000000-0000-4000-8000-000000000002'::uuid,
      'c3000000-0000-4000-8000-000000000001'::uuid,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'NOT_FOUND' then
      v_cross_owner_hidden := true;
    else
      raise;
    end if;
  end;

  begin
    perform careslink_v1_generation.get_v1_shadow_note_generation_job_status(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000099'::uuid,
      'c3000000-0000-4000-8000-000000000001'::uuid,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'SESSION_REVOKED' then
      v_session_denied := true;
    else
      raise;
    end if;
  end;

  begin
    perform careslink_v1_generation.cancel_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000099'::uuid,
      'c3000000-0000-4000-8000-000000000001'::uuid,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'SESSION_REVOKED' then
      v_cancel_session_denied := true;
    else
      raise;
    end if;
  end;

  begin
    perform
      careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
        'c0000000-0000-4000-8000-000000000001'::uuid,
        'c1000000-0000-4000-8000-000000000001'::uuid,
        'BEARER',
        'c3000000-0000-4000-8000-000000000097'::uuid,
        'c5000000-0000-4000-8000-000000000097'::uuid,
        'c2000000-0000-4000-8000-000000000099'::uuid,
        'communication',
        'en',
        '1.0.0-shadow.1',
        '2026-08-09.v1-shadow',
        current_setting('careslink.assert.owner.facts_hash'),
        repeat('7', 64),
        repeat('7', 64),
        repeat('7', 64),
        transaction_timestamp() + interval '10 minutes'
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRIVACY_REVIEW_STALE' then
      v_privacy_clock_denied := true;
    else
      raise;
    end if;
  end;

  begin
    perform
      careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
        'c0000000-0000-4000-8000-000000000001'::uuid,
        'c1000000-0000-4000-8000-000000000001'::uuid,
        'BEARER',
        'c3000000-0000-4000-8000-000000000095'::uuid,
        'c5000000-0000-4000-8000-000000000095'::uuid,
        'c2000000-0000-4000-8000-000000000002'::uuid,
        'communication',
        'en',
        '1.0.0-shadow.1',
        '2026-08-09.v1-shadow',
        current_setting('careslink.assert.owner.facts_hash'),
        repeat('5', 64),
        repeat('5', 64),
        repeat('5', 64),
        transaction_timestamp() + interval '10 minutes'
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRIVACY_REVIEW_STALE' then
      v_privacy_denied := true;
    else
      raise;
    end if;
  end;

  -- Rejected SECURITY DEFINER subtransactions roll their owner GUC change
  -- back. Select owner A explicitly before evaluating the owner-scoped counts.
  perform careslink_v1_generation._set_owner(
    'c0000000-0000-4000-8000-000000000001'::uuid
  );
  if not v_idempotency_conflict
    or not v_identity_conflict
    or not v_job_identity_conflict
    or not v_enqueue_session_denied
    or not v_session_denied
    or not v_cancel_session_denied
    or not v_privacy_denied
    or not v_privacy_clock_denied
    or not v_cross_owner_hidden
    or (select count(*) from careslink_v1_generation.jobs) <> 1
    or (select count(*) from careslink_v1_generation.payloads) <> 1
    or (
      select count(*)
      from careslink_v1_generation.jobs
      where id = 'c3000000-0000-4000-8000-000000000001'::uuid
        and status = 'QUEUED'
        and attempt_count = 0
        and finished_at is null
    ) <> 1
  then
    raise exception using
      message = 'owner admission/status rejection matrix drifted',
      detail = format(
        'idempotency=%s identity=%s job_identity=%s enqueue_session=%s status_session=%s cancel_session=%s privacy_owner=%s privacy_clock=%s cross_owner=%s visible_jobs=%s visible_payloads=%s queued_count=%s',
        v_idempotency_conflict,
        v_identity_conflict,
        v_job_identity_conflict,
        v_enqueue_session_denied,
        v_session_denied,
        v_cancel_session_denied,
        v_privacy_denied,
        v_privacy_clock_denied,
        v_cross_owner_hidden,
        (select count(*) from careslink_v1_generation.jobs),
        (select count(*) from careslink_v1_generation.payloads),
        (
          select count(*)
          from careslink_v1_generation.jobs
          where id = 'c3000000-0000-4000-8000-000000000001'::uuid
            and status = 'QUEUED'
            and attempt_count = 0
            and finished_at is null
        )
      );
  end if;

  insert into owner_rpc_assertion_state (
    scenario, job_id, payload_id
  ) values
    (
      'queued-a',
      'c3000000-0000-4000-8000-000000000001'::uuid,
      'c5000000-0000-4000-8000-000000000001'::uuid
    ),
    (
      'queued-b',
      'c3000000-0000-4000-8000-000000000002'::uuid,
      'c5000000-0000-4000-8000-000000000002'::uuid
    );
end
$$;

-- Exact response-loss replay remains a fresh-session ownership receipt after
-- both the stored proof and payload TTL expire. It must not re-run first-
-- admission privacy/expiry gates or orphan cleanup loses its identity answer.
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
-- Drain the intentionally deferred job/payload identity cycle before the
-- assertion-only ALTER TABLE used to age the payload fixture.
set constraints all immediate;
select set_config(
  'careslink.assert.owner.expired_replay_at',
  (
    date_trunc('milliseconds', pg_catalog.clock_timestamp())
      + interval '10 milliseconds'
  )::text,
  true
);
update public.privacy_reviews
set confirmed_at = current_setting(
      'careslink.assert.owner.expired_replay_at'
    )::timestamptz - interval '30 minutes',
    expires_at = current_setting(
      'careslink.assert.owner.expired_replay_at'
    )::timestamptz
where id = 'c2000000-0000-4000-8000-000000000001'::uuid;
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.payloads no force row level security;
update careslink_v1_generation.payloads
set expires_at = current_setting(
  'careslink.assert.owner.expired_replay_at'
)::timestamptz
where id = 'c5000000-0000-4000-8000-000000000001'::uuid;
alter table careslink_v1_generation.payloads force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
select pg_catalog.pg_sleep(0.02);
set local role careslink_v1_generation_owner_api_executor;
do $$
declare
  v_replay jsonb;
begin
  if date_trunc('milliseconds', pg_catalog.clock_timestamp()) <=
    current_setting(
      'careslink.assert.owner.expired_replay_at'
    )::timestamptz
  then
    raise exception 'expired replay fixture did not age deterministically';
  end if;

  v_replay :=
    careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'BEARER',
      'c3000000-0000-4000-8000-000000000001'::uuid,
      'c5000000-0000-4000-8000-000000000001'::uuid,
      'c2000000-0000-4000-8000-000000000001'::uuid,
      'communication',
      'en',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow',
      current_setting('careslink.assert.owner.facts_hash'),
      repeat('a', 64),
      repeat('b', 64),
      repeat('c', 64),
      current_setting(
        'careslink.assert.owner.expired_replay_at'
      )::timestamptz
    );

  if v_replay->'created' is distinct from 'false'::jsonb
    or v_replay->'payloadAccepted' is distinct from 'true'::jsonb
    or v_replay #>> '{job,jobId}' is distinct from
      'c3000000-0000-4000-8000-000000000001'
  then
    raise exception 'expired-TTL exact owner replay lost its identity receipt';
  end if;
end
$$;

-- Direct RLS visibility follows the database-owned owner GUC. The same
-- executor and same transaction cannot see the other owner's durable rows.
do $$
begin
  perform careslink_v1_generation._set_owner(
    'c0000000-0000-4000-8000-000000000001'::uuid
  );
  if (select count(*) from careslink_v1_generation.jobs) <> 1
    or (select count(*) from careslink_v1_generation.payloads) <> 1
    or exists (
      select 1 from careslink_v1_generation.jobs
      where owner_user_id = 'c0000000-0000-4000-8000-000000000002'::uuid
    )
    or exists (
      select 1 from careslink_v1_generation.payloads
      where owner_user_id = 'c0000000-0000-4000-8000-000000000002'::uuid
    )
  then
    raise exception 'owner A observed owner B admission rows';
  end if;

  perform careslink_v1_generation._set_owner(
    'c0000000-0000-4000-8000-000000000002'::uuid
  );
  if (select count(*) from careslink_v1_generation.jobs) <> 1
    or (select count(*) from careslink_v1_generation.payloads) <> 1
    or exists (
      select 1 from careslink_v1_generation.jobs
      where owner_user_id = 'c0000000-0000-4000-8000-000000000001'::uuid
    )
    or exists (
      select 1 from careslink_v1_generation.payloads
      where owner_user_id = 'c0000000-0000-4000-8000-000000000001'::uuid
    )
  then
    raise exception 'owner B observed owner A admission rows';
  end if;
end
$$;

-- Status and cancel must remain available while new admission is hard-off.
-- Disable the capability before both the corrupt-outbox rejection and queued
-- cancellation; the worker path is re-enabled only after those checks.
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.settings no force row level security;
update careslink_v1_generation.settings
set enabled = false,
    updated_at = date_trunc('milliseconds', transaction_timestamp())
where capability = 'note_generation_v1';
alter table careslink_v1_generation.settings force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;

-- A pre-existing purge event on a nonterminal job is corruption, never an
-- idempotent cancel replay. Cancellation must fail before changing any row.
do $$
declare
  v_rejected boolean := false;
  v_update_denied boolean := false;
begin
  perform careslink_v1_generation._set_owner(
    'c0000000-0000-4000-8000-000000000001'::uuid
  );
  insert into careslink_v1_generation.payload_purge_outbox (
    id,
    transaction_id,
    payload_id,
    job_id,
    owner_user_id,
    reason,
    event_reference_hash,
    status,
    requested_at,
    attempt_count,
    created_at,
    shadow_only
  ) values (
    'c7000000-0000-4000-8000-000000000001'::uuid,
    'c8000000-0000-4000-8000-000000000001'::uuid,
    'c5000000-0000-4000-8000-000000000001'::uuid,
    'c3000000-0000-4000-8000-000000000001'::uuid,
    'c0000000-0000-4000-8000-000000000001'::uuid,
    'FAILED',
    repeat('7', 64),
    'PENDING',
    date_trunc('milliseconds', transaction_timestamp()),
    0,
    date_trunc('milliseconds', transaction_timestamp()),
    true
  );

  begin
    update careslink_v1_generation.payload_purge_outbox
    set id = id
    where id = 'c7000000-0000-4000-8000-000000000001'::uuid;
  exception when insufficient_privilege then
    v_update_denied := true;
  end;

  begin
    perform careslink_v1_generation.cancel_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'c3000000-0000-4000-8000-000000000001'::uuid,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_rejected := true;
    else
      raise;
    end if;
  end;

  if not v_rejected
    or not v_update_denied
    or (
      select count(*)
      from careslink_v1_generation.jobs
      where id = 'c3000000-0000-4000-8000-000000000001'::uuid
        and status = 'QUEUED'
        and failure_reason is null
        and finished_at is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payloads
      where id = 'c5000000-0000-4000-8000-000000000001'::uuid
        and state = 'AVAILABLE'
        and revoked_at is null
        and purge_requested_at is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
      where id = 'c7000000-0000-4000-8000-000000000001'::uuid
        and reason = 'FAILED'
        and status = 'PENDING'
    ) <> 1
  then
    raise exception 'corrupt pre-existing purge outbox was accepted by cancel';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.payload_purge_outbox
  no force row level security;
delete from careslink_v1_generation.payload_purge_outbox
where id = 'c7000000-0000-4000-8000-000000000001'::uuid;
alter table careslink_v1_generation.payload_purge_outbox
  force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The table constraints allow a pre-existing QUEUED job to have one RUNNING
-- attempt. Cancellation must lock and reject that split before touching the
-- job, attempt, payload, grants or outbox.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.attempts no force row level security;
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
) select
  'c6000000-0000-4000-8000-000000000099'::uuid,
  'c3000000-0000-4000-8000-000000000001'::uuid,
  'c0000000-0000-4000-8000-000000000001'::uuid,
  1,
  'RUNNING',
  current_setting('careslink.assert.owner.worker_identity_hash'),
  current_setting('careslink.assert.owner.registration_digest'),
  repeat('9', 64),
  fixture.fixture_now,
  fixture.fixture_now,
  fixture.fixture_now + interval '5 minutes',
  fixture.fixture_now,
  true
from (
  select date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  ) as fixture_now
) as fixture;
alter table careslink_v1_generation.attempts force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;

do $$
declare
  v_rejected boolean := false;
begin
  perform careslink_v1_generation._set_owner(
    'c0000000-0000-4000-8000-000000000001'::uuid
  );
  begin
    perform careslink_v1_generation.cancel_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'c3000000-0000-4000-8000-000000000001'::uuid,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_rejected := true;
    else
      raise;
    end if;
  end;

  if not v_rejected
    or (
      select count(*)
      from careslink_v1_generation.jobs
      where id = 'c3000000-0000-4000-8000-000000000001'::uuid
        and status = 'QUEUED'
        and attempt_count = 0
        and failure_reason is null
        and finished_at is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.attempts
      where id = 'c6000000-0000-4000-8000-000000000099'::uuid
        and job_id = 'c3000000-0000-4000-8000-000000000001'::uuid
        and attempt_number = 1
        and status = 'RUNNING'
        and failure_reason is null
        and finished_at is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payloads
      where id = 'c5000000-0000-4000-8000-000000000001'::uuid
        and state = 'AVAILABLE'
        and revoked_at is null
        and purge_requested_at is null
    ) <> 1
    or exists (
      select 1
      from careslink_v1_generation.payload_grants
      where job_id = 'c3000000-0000-4000-8000-000000000001'::uuid
    )
    or exists (
      select 1
      from careslink_v1_generation.payload_purge_outbox
      where job_id = 'c3000000-0000-4000-8000-000000000001'::uuid
    )
  then
    raise exception
      'QUEUED plus RUNNING-attempt corruption was not rejected atomically';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.attempts no force row level security;
delete from careslink_v1_generation.attempts
where id = 'c6000000-0000-4000-8000-000000000099'::uuid;
alter table careslink_v1_generation.attempts force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;

-- Queued cancellation is atomic and replayable while admission is disabled:
-- no attempt/grant is invented, the payload is terminally revoked and one
-- PENDING purge event is persisted.
do $$
declare
  v_cancel jsonb;
  v_replay jsonb;
  v_job jsonb;
begin
  if (
    select enabled
    from careslink_v1_generation.settings
    where capability = 'note_generation_v1'
  ) is distinct from false then
    raise exception 'queued cancel was not exercised while admission disabled';
  end if;

  v_cancel :=
    careslink_v1_generation.cancel_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'c3000000-0000-4000-8000-000000000001'::uuid,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  v_replay :=
    careslink_v1_generation.cancel_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000001'::uuid,
      'c1000000-0000-4000-8000-000000000001'::uuid,
      'c3000000-0000-4000-8000-000000000001'::uuid,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  v_job := v_cancel->'job';

  if not (v_cancel ?& array['job'])
    or v_cancel - 'job' <> '{}'::jsonb
    or v_replay is distinct from v_cancel
    or v_job->>'jobId' is distinct from
      'c3000000-0000-4000-8000-000000000001'
    or v_job->>'status' is distinct from 'CANCELLED'
    or v_job->'attemptCount' is distinct from '0'::jsonb
    or v_job->'startedAt' is distinct from 'null'::jsonb
    or jsonb_typeof(v_job->'finishedAt') is distinct from 'string'
    or v_job->>'finishedAt' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or v_job->'failureCode' is distinct from 'null'::jsonb
    or v_job->'result' is distinct from 'null'::jsonb
    or (
      select count(*)
      from careslink_v1_generation.jobs as job
      where job.id = 'c3000000-0000-4000-8000-000000000001'::uuid
        and job.status = 'CANCELLED'
        and job.failure_reason = 'CANCELLED'
        and job.next_eligible_at is null
        and job.finished_at is not null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payloads as payload
      where payload.id = 'c5000000-0000-4000-8000-000000000001'::uuid
        and payload.state = 'REVOKED'
        and payload.revoke_reason = 'CANCELLED'
        and payload.revoked_at is not null
        and payload.purge_requested_at is not null
        and payload.purged_at is null
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.payload_id =
          'c5000000-0000-4000-8000-000000000001'::uuid
        and outbox.job_id =
          'c3000000-0000-4000-8000-000000000001'::uuid
        and outbox.reason = 'CANCELLED'
        and outbox.status = 'PENDING'
        and outbox.transaction_id is not null
        and outbox.event_reference_hash ~ '^[a-f0-9]{64}$'
    ) <> 1
    or exists (
      select 1
      from careslink_v1_generation.attempts
      where job_id = 'c3000000-0000-4000-8000-000000000001'::uuid
    )
    or exists (
      select 1
      from careslink_v1_generation.payload_grants
      where job_id = 'c3000000-0000-4000-8000-000000000001'::uuid
    )
  then
    raise exception 'queued owner cancellation or replay drifted';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Re-enable only long enough for the worker to claim and authorize owner B.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.settings no force row level security;
update careslink_v1_generation.settings
set enabled = true,
    updated_at = date_trunc('milliseconds', transaction_timestamp())
where capability = 'note_generation_v1';
alter table careslink_v1_generation.settings force row level security;

-- This whole rollback suite shares one transaction, while a real worker claim
-- starts a later transaction. Align only owner B's queued timestamps to that
-- outer transaction clock so the legacy worker `_server_now()` can see the
-- fixture; this is a single-transaction test artifact, not runtime behavior.
alter table careslink_v1_generation.jobs no force row level security;
alter table careslink_v1_generation.payloads no force row level security;
update careslink_v1_generation.jobs
set created_at = date_trunc('milliseconds', transaction_timestamp()),
    updated_at = date_trunc('milliseconds', transaction_timestamp()),
    next_eligible_at = date_trunc('milliseconds', transaction_timestamp())
where id = 'c3000000-0000-4000-8000-000000000002'::uuid
  and owner_user_id = 'c0000000-0000-4000-8000-000000000002'::uuid
  and status = 'QUEUED';
update careslink_v1_generation.payloads
set created_at = date_trunc('milliseconds', transaction_timestamp()),
    updated_at = date_trunc('milliseconds', transaction_timestamp()),
    available_at = date_trunc('milliseconds', transaction_timestamp())
where id = 'c5000000-0000-4000-8000-000000000002'::uuid
  and owner_user_id = 'c0000000-0000-4000-8000-000000000002'::uuid
  and state = 'AVAILABLE';
alter table careslink_v1_generation.jobs force row level security;
alter table careslink_v1_generation.payloads force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- The worker takes the sole remaining queued job and issues one metadata-only
-- payload grant. The owner then cancels this RUNNING attempt in the next block.
set local role careslink_v1_generation_executor;

do $$
declare
  v_claim jsonb;
  v_authorized jsonb;
  v_job_id uuid;
  v_payload_id uuid;
  v_attempt_id uuid;
  v_lease_token text;
  v_grant_id uuid;
begin
  v_claim :=
    careslink_v1_generation.claim_v1_shadow_note_generation_job(
      current_setting('careslink.assert.owner.registration_digest'),
      'worker.owner.test.v1',
      current_setting('careslink.assert.owner.worker_policy_digest'),
      current_setting('careslink.assert.owner.worker_identity_hash'),
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );

  v_job_id := (v_claim #>> '{claim,job,jobId}')::uuid;
  v_payload_id := (v_claim #>> '{claim,job,payloadId}')::uuid;
  v_attempt_id := (v_claim #>> '{claim,attempt,attemptId}')::uuid;
  v_lease_token := v_claim #>> '{claim,leaseToken}';

  if v_claim->>'status' is distinct from 'CLAIMED'
    or v_job_id is distinct from
      'c3000000-0000-4000-8000-000000000002'::uuid
    or v_payload_id is distinct from
      'c5000000-0000-4000-8000-000000000002'::uuid
    or v_attempt_id is null
    or coalesce(v_lease_token, '') = ''
  then
    raise exception 'worker did not claim the owner B job';
  end if;

  v_authorized :=
    careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
      v_job_id,
      v_payload_id,
      v_attempt_id,
      v_lease_token,
      current_setting('careslink.assert.owner.registration_digest')
    );
  v_grant_id := (v_authorized->>'grantId')::uuid;

  if v_authorized->>'status' is distinct from 'AUTHORIZED'
    or v_grant_id is null
    or v_authorized::text ~* 'vault|locator|rawFacts|cleanedFacts'
    or (
      select count(*)
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.id = v_grant_id
        and grant_record.job_id = v_job_id
        and grant_record.payload_id = v_payload_id
        and grant_record.attempt_id = v_attempt_id
        and grant_record.status = 'ISSUED'
    ) <> 1
  then
    raise exception 'worker authorization fixture drifted';
  end if;

  update owner_rpc_assertion_state
  set attempt_id = v_attempt_id,
      lease_token = v_lease_token,
      grant_id = v_grant_id
  where scenario = 'queued-b'
    and job_id = v_job_id
    and payload_id = v_payload_id;
  if not found then
    raise exception 'running owner cancellation fixture was not retained';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Move the RUNNING attempt/grant timestamps beyond transaction start without
-- claiming a concurrent race. A cancel that still uses transaction_timestamp
-- would violate their time checks; the post-lock wall clock must terminalize
-- this otherwise-valid fixture.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.attempts no force row level security;
alter table careslink_v1_generation.payload_grants no force row level security;
do $$
declare
  v_fixture_now timestamptz :=
    date_trunc('milliseconds', pg_catalog.clock_timestamp());
begin
  if v_fixture_now <= date_trunc(
    'milliseconds', transaction_timestamp()
  ) then
    raise exception 'post-transaction cancel clock fixture did not advance';
  end if;

  update careslink_v1_generation.attempts
  set acquired_at = v_fixture_now,
      last_heartbeat_at = v_fixture_now,
      lease_expires_at = v_fixture_now + interval '5 minutes',
      payload_authorized_at = v_fixture_now,
      created_at = v_fixture_now
  where job_id = 'c3000000-0000-4000-8000-000000000002'::uuid
    and owner_user_id = 'c0000000-0000-4000-8000-000000000002'::uuid
    and status = 'RUNNING';
  if not found then
    raise exception 'post-transaction RUNNING attempt fixture is missing';
  end if;

  update careslink_v1_generation.payload_grants
  set authorized_at = v_fixture_now,
      expires_at = v_fixture_now + interval '4 minutes',
      created_at = v_fixture_now
  where job_id = 'c3000000-0000-4000-8000-000000000002'::uuid
    and owner_user_id = 'c0000000-0000-4000-8000-000000000002'::uuid
    and status = 'ISSUED';
  if not found then
    raise exception 'post-transaction ISSUED grant fixture is missing';
  end if;
end
$$;
alter table careslink_v1_generation.attempts force row level security;
alter table careslink_v1_generation.payload_grants force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Hard-off again before the RUNNING status/cancel path. From this point to the
-- final ROLLBACK, admission stays disabled under its original CHECK.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.settings no force row level security;
update careslink_v1_generation.settings
set enabled = false,
    updated_at = date_trunc('milliseconds', transaction_timestamp())
where capability = 'note_generation_v1';
alter table careslink_v1_generation.settings
  add constraint settings_enabled_check check (enabled = false);
alter table careslink_v1_generation.settings force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Status reflects RUNNING while admission is disabled and exposes no
-- lease/grant. Cancellation then
-- atomically terminalizes attempt, grant, payload, outbox and job with one
-- transaction identity and remains replayable after response loss.
set local role careslink_v1_generation_owner_api_executor;

do $$
declare
  v_state owner_rpc_assertion_state%rowtype;
  v_running jsonb;
  v_cancel jsonb;
  v_replay jsonb;
  v_attempt record;
  v_grant record;
  v_payload record;
  v_outbox record;
begin
  if (
    select enabled
    from careslink_v1_generation.settings
    where capability = 'note_generation_v1'
  ) is distinct from false then
    raise exception 'RUNNING status/cancel was not exercised while disabled';
  end if;

  select state.*
  into v_state
  from owner_rpc_assertion_state as state
  where state.scenario = 'queued-b';

  v_running :=
    careslink_v1_generation.get_v1_shadow_note_generation_job_status(
      'c0000000-0000-4000-8000-000000000002'::uuid,
      'c1000000-0000-4000-8000-000000000002'::uuid,
      v_state.job_id,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  if v_running #>> '{job,status}' is distinct from 'RUNNING'
    or v_running #> '{job,attemptCount}' is distinct from '1'::jsonb
    or jsonb_typeof(v_running #> '{job,startedAt}') is distinct from 'string'
    or v_running #> '{job,finishedAt}' is distinct from 'null'::jsonb
    or v_running #> '{job,failureCode}' is distinct from 'null'::jsonb
    or v_running #> '{job,result}' is distinct from 'null'::jsonb
    or v_running::text ~* 'lease|grantId|payloadId|registrationDigest'
  then
    raise exception 'owner RUNNING status envelope drifted or leaked';
  end if;

  v_cancel :=
    careslink_v1_generation.cancel_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000002'::uuid,
      'c1000000-0000-4000-8000-000000000002'::uuid,
      v_state.job_id,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  v_replay :=
    careslink_v1_generation.cancel_v1_shadow_note_generation_job(
      'c0000000-0000-4000-8000-000000000002'::uuid,
      'c1000000-0000-4000-8000-000000000002'::uuid,
      v_state.job_id,
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = v_state.attempt_id;
  select grant_record.* into v_grant
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.id = v_state.grant_id;
  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_state.payload_id;
  select outbox.* into v_outbox
  from careslink_v1_generation.payload_purge_outbox as outbox
  where outbox.payload_id = v_state.payload_id;

  if v_cancel #>> '{job,status}' is distinct from 'CANCELLED'
    or v_cancel #> '{job,attemptCount}' is distinct from '1'::jsonb
    or jsonb_typeof(v_cancel #> '{job,startedAt}') is distinct from 'string'
    or jsonb_typeof(v_cancel #> '{job,finishedAt}') is distinct from 'string'
    or v_cancel #> '{job,failureCode}' is distinct from 'null'::jsonb
    or v_cancel #> '{job,result}' is distinct from 'null'::jsonb
    or v_replay is distinct from v_cancel
    or v_attempt.id is null
    or v_attempt.status is distinct from 'CANCELLED'
    or v_attempt.failure_reason is distinct from 'CANCELLED'
    or v_attempt.finished_at is null
    or v_attempt.terminal_transaction_id is null
    or v_grant.id is null
    or v_grant.status is distinct from 'REVOKED'
    or v_grant.revoked_at is null
    or v_grant.consumed_at is not null
    or v_grant.vault_grant_hash is not null
    or v_payload.id is null
    or v_payload.state is distinct from 'REVOKED'
    or v_payload.revoke_reason is distinct from 'CANCELLED'
    or v_payload.revoked_at is null
    or v_payload.purge_requested_at is null
    or v_payload.purged_at is not null
    or v_outbox.id is null
    or v_outbox.transaction_id is distinct from
      v_attempt.terminal_transaction_id
    or v_outbox.reason is distinct from 'CANCELLED'
    or v_outbox.status is distinct from 'PENDING'
    or v_outbox.event_reference_hash !~ '^[a-f0-9]{64}$'
    or exists (
      select 1
      from careslink_v1_generation.attempts
      where job_id = v_state.job_id and status = 'RUNNING'
    )
    or exists (
      select 1
      from careslink_v1_generation.payload_grants
      where job_id = v_state.job_id and status = 'ISSUED'
    )
  then
    raise exception 'RUNNING owner cancellation terminal set drifted';
  end if;
end
$$;

-- Re-prove A/B RLS after terminalization and prove sensitive/evidence tables
-- remain unavailable even to the owner executor that owns the definer RPCs.
do $$
declare
  v_auth_denied boolean := false;
  v_evidence_denied boolean := false;
begin
  perform careslink_v1_generation._set_owner(
    'c0000000-0000-4000-8000-000000000001'::uuid
  );
  if (select count(*) from careslink_v1_generation.jobs) <> 1
    or (select count(*) from careslink_v1_generation.payloads) <> 1
    or (select count(*) from careslink_v1_generation.attempts) <> 0
    or (select count(*) from careslink_v1_generation.payload_grants) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
    ) <> 1
  then
    raise exception 'owner A terminal RLS row set drifted';
  end if;

  perform careslink_v1_generation._set_owner(
    'c0000000-0000-4000-8000-000000000002'::uuid
  );
  if (select count(*) from careslink_v1_generation.jobs) <> 1
    or (select count(*) from careslink_v1_generation.payloads) <> 1
    or (select count(*) from careslink_v1_generation.attempts) <> 1
    or (select count(*) from careslink_v1_generation.payload_grants) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
    ) <> 1
  then
    raise exception 'owner B terminal RLS row set drifted';
  end if;

  begin
    perform 1 from auth.users limit 1;
  exception when insufficient_privilege then
    v_auth_denied := true;
  end;
  begin
    perform 1 from careslink_v1_generation.provider_evidence limit 1;
  exception when insufficient_privilege then
    v_evidence_denied := true;
  end;

  if not v_auth_denied or not v_evidence_denied then
    raise exception 'owner API executor direct sensitive read was accepted';
  end if;
end
$$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Remove the assertion-only active binding before the rollback. The capability
-- is already hard-off again with its original CHECK restored above.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.admission_policy_bindings
  no force row level security;
delete from careslink_v1_generation.admission_policy_bindings
where binding_version = 'binding.owner.test.v1';
alter table careslink_v1_generation.admission_policy_bindings
  force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

set local role careslink_v1_generation_owner_api_executor;
do $$
declare
  v_schema oid := 'careslink_v1_generation'::regnamespace;
begin
  if (
      select count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is false
        and shadow_only is true
    ) <> 1
    or (
      select count(*)
      from careslink_v1_generation.admission_policy_bindings
      where status = 'ACTIVE'
    ) <> 0
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_retirements
    ) <> 0
    or (
      select count(*)
      from pg_constraint as constraint_metadata
      where constraint_metadata.conrelid =
          'careslink_v1_generation.settings'::regclass
        and constraint_metadata.conname = 'settings_enabled_check'
        and constraint_metadata.contype = 'c'
        and constraint_metadata.convalidated
    ) <> 1
    or exists (
      select 1
      from pg_class as relation
      where relation.relnamespace = v_schema
        and relation.relkind = 'r'
        and (
          not relation.relrowsecurity
          or not relation.relforcerowsecurity
          or relation.relowner <>
            'careslink_v1_generation_owner'::regrole
        )
    )
  then
    raise exception 'owner assertion did not restore hard-off/binding/RLS';
  end if;

  perform careslink_v1_generation._set_owner(
    'c0000000-0000-4000-8000-000000000002'::uuid
  );
  if exists (
      select 1 from careslink_v1_generation.jobs where status = 'RUNNING'
    )
    or exists (
      select 1
      from careslink_v1_generation.payload_grants
      where status = 'ISSUED'
    )
  then
    raise exception 'owner assertion left active attempt or grant state';
  end if;
end
$$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

revoke careslink_v1_generation_owner_api_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_owner from current_user
  granted by current_user;

do $$
declare
  v_edge_count integer;
  v_expected_edges integer;
  v_entry_actor_super boolean;
begin
  select role.rolsuper
  into v_entry_actor_super
  from pg_roles as role
  where role.oid = current_user::regrole;

  select count(*)
  into v_edge_count
  from pg_auth_members as membership
  join pg_roles as granted_role on granted_role.oid = membership.roleid
  where membership.member = current_user::regrole
    and granted_role.rolname in (
      'careslink_v1_generation_owner',
      'careslink_v1_generation_executor',
      'careslink_v1_generation_owner_api_executor'
    );
  v_expected_edges := case when v_entry_actor_super then 0 else 3 end;

  if v_edge_count <> v_expected_edges
    or exists (
    select 1
    from pg_auth_members as membership
    join pg_roles as granted_role on granted_role.oid = membership.roleid
    join pg_roles as member_role on member_role.oid = membership.member
    join pg_roles as grantor_role on grantor_role.oid = membership.grantor
    where membership.member = current_user::regrole
      and granted_role.rolname in (
        'careslink_v1_generation_owner',
        'careslink_v1_generation_executor',
        'careslink_v1_generation_owner_api_executor'
      )
      and not (
        member_role.oid = current_user::regrole
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
  ) then
    raise exception 'assertion-only owner access cleanup failed';
  end if;
end
$$;

rollback;
