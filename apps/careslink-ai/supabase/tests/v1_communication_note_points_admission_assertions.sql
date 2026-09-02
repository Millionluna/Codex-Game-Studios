begin;

-- A21: rollback-only catalog, ACL/RLS and serial functional evidence for the
-- private Communication Note durable admission + 20-Point reservation.
--
-- Run only after migrations through 20260902063211 on an isolated database
-- containing no care data. All rows below are fixed TEST_ONLY fixtures and the
-- outer ROLLBACK is mandatory. This is deliberately one-backend/serial-only:
-- it makes no same-key race, oversubscription race, lock-wait expiry or
-- response-loss concurrency claim; those belong to the separate two-client
-- harness and its own fixed TEST_ONLY namespace/contracts.

select pg_catalog.set_config(
  'careslink.assertion_entry_role',
  current_user,
  true
);

do $careslink_v1_communication_points_catalog$
declare
  v_points_role pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_generation_points_admission_executor'
  );
  v_binding pg_catalog.oid := pg_catalog.to_regclass(
    'careslink_v1_generation.communication_note_point_admissions'
  );
  v_policy_contract pg_catalog.text[];
  v_constraint_names pg_catalog.text[];
  v_function_contract pg_catalog.text[];
  v_helper_definition pg_catalog.text;
  v_coordinator_definition pg_catalog.text;
  v_claim_definition pg_catalog.text;
  v_recovery_definition pg_catalog.text;
  v_marker_definition pg_catalog.text;
  v_reservation_guard_definition pg_catalog.text;
begin
  if pg_catalog.current_setting('server_version_num')::pg_catalog.int4 < 160000
  then
    raise exception 'A21 requires PostgreSQL 16 or newer';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles as entry_role
    where entry_role.rolname = current_user
      and entry_role.rolsuper
  ) then
    raise exception 'A21 requires an isolated-cluster superuser entry role';
  end if;

  if v_points_role is null
    or not exists (
      select 1
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_points_role
        and not role_record.rolsuper
        and not role_record.rolinherit
        and not role_record.rolcreaterole
        and not role_record.rolcreatedb
        and not role_record.rolcanlogin
        and not role_record.rolreplication
        and not role_record.rolbypassrls
    )
  then
    raise exception 'A21 purpose role posture drifted';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    where membership.roleid = v_points_role
      and membership.member in (
        'anon'::pg_catalog.regrole,
        'authenticated'::pg_catalog.regrole,
        'service_role'::pg_catalog.regrole,
        'authenticator'::pg_catalog.regrole,
        'careslink_v1_generation_owner'::pg_catalog.regrole,
        'careslink_v1_generation_executor'::pg_catalog.regrole,
        'careslink_v1_generation_owner_api_executor'::pg_catalog.regrole
      )
  ) then
    raise exception 'A21 purpose role leaked a runtime membership';
  end if;

  -- PostgreSQL 16 records the CREATEROLE actor's role-management ownership as
  -- one ADMIN-only membership. The migration-added SET edge must be gone: the
  -- only remaining edge is the non-inheriting, non-impersonating entry-role
  -- management edge created by CREATE ROLE itself.
  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = v_points_role
    ) <> 1
    or not exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.roleid = v_points_role
        and membership.member = 'postgres'::pg_catalog.regrole
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
    )
  then
    raise exception 'A21 purpose role creator-management edge drifted';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_default_acl as default_acl
    where default_acl.defaclrole = v_points_role
  ) <> 2
    or not exists (
      select 1
      from pg_catalog.pg_default_acl as default_acl
      join lateral pg_catalog.aclexplode(default_acl.defaclacl) as acl
        on true
      where default_acl.defaclrole = v_points_role
        and default_acl.defaclnamespace = 0
        and default_acl.defaclobjtype = 'f'
        and acl.grantee = v_points_role
        and acl.grantor = v_points_role
        and acl.privilege_type = 'EXECUTE'
        and not acl.is_grantable
    )
    or not exists (
      select 1
      from pg_catalog.pg_default_acl as default_acl
      join lateral pg_catalog.aclexplode(default_acl.defaclacl) as acl
        on true
      where default_acl.defaclrole = v_points_role
        and default_acl.defaclnamespace = 0
        and default_acl.defaclobjtype = 'T'
        and acl.grantee = v_points_role
        and acl.grantor = v_points_role
        and acl.privilege_type = 'USAGE'
        and not acl.is_grantable
    )
  then
    raise exception 'A21 purpose role default ACL closure drifted';
  end if;

  if v_binding is null
    or not exists (
      select 1
      from pg_catalog.pg_class as relation
      where relation.oid = v_binding
        and relation.relkind = 'r'
        and relation.relrowsecurity
        and relation.relforcerowsecurity
        and pg_catalog.pg_get_userbyid(relation.relowner) =
          'careslink_v1_generation_owner'
    )
    or not exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid =
          'careslink_v1_generation.jobs'::pg_catalog.regclass
        and attribute.attname = 'communication_note_point_admission_id'
        and attribute.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
        and attribute.attnum > 0
        and not attribute.attisdropped
        and not attribute.attnotnull
    )
  then
    raise exception 'A21 binding table or job marker catalog drifted';
  end if;

  select pg_catalog.array_agg(constraint_record.conname order by
    constraint_record.conname)
  into v_constraint_names
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = v_binding;

  if v_constraint_names is distinct from array[
    'communication_note_point_admissions_consistency_trigger',
    'communication_note_point_admissions_identity_unique',
    'communication_note_point_admissions_job_owner_fk',
    'communication_note_point_admissions_job_owner_unique',
    'communication_note_point_admissions_job_unique',
    'communication_note_point_admissions_pkey',
    'communication_note_point_admissions_quote_owner_fk',
    'communication_note_point_admissions_quote_owner_unique',
    'communication_note_point_admissions_quote_unique',
    'communication_note_point_admissions_reservation_owner_fk',
    'communication_note_point_admissions_reservation_owner_unique',
    'communication_note_point_admissions_reservation_unique',
    'communication_note_point_admissions_shadow_check'
  ]::pg_catalog.text[]
    or not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid =
          'careslink_v1_generation.jobs'::pg_catalog.regclass
        and constraint_record.conname =
          'jobs_communication_note_point_admission_fk'
        and constraint_record.contype = 'f'
        and constraint_record.condeferrable
        and constraint_record.condeferred
        and pg_catalog.pg_get_constraintdef(constraint_record.oid) =
          'FOREIGN KEY (communication_note_point_admission_id, id, owner_user_id) REFERENCES careslink_v1_generation.communication_note_point_admissions(id, job_id, owner_user_id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'
    )
    or not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = v_binding
        and constraint_record.conname =
          'communication_note_point_admissions_consistency_trigger'
        and constraint_record.contype = 't'
        and constraint_record.condeferrable
        and constraint_record.condeferred
    )
  then
    raise exception 'A21 binding constraints drifted';
  end if;

  if not exists (
      select 1
      from pg_catalog.pg_indexes as index_record
      where index_record.schemaname = 'careslink_v1_generation'
        and index_record.indexname =
          'communication_note_point_admissions_owner_created_idx'
        and index_record.indexdef =
          'CREATE INDEX communication_note_point_admissions_owner_created_idx ON careslink_v1_generation.communication_note_point_admissions USING btree (owner_user_id, created_at DESC, job_id)'
    )
    or not exists (
      select 1
      from pg_catalog.pg_indexes as index_record
      where index_record.schemaname = 'careslink_v1_generation'
        and index_record.indexname =
          'jobs_communication_note_point_admission_fk_idx'
        and index_record.indexdef =
          'CREATE INDEX jobs_communication_note_point_admission_fk_idx ON careslink_v1_generation.jobs USING btree (communication_note_point_admission_id, id, owner_user_id) WHERE (communication_note_point_admission_id IS NOT NULL)'
    )
  then
    raise exception 'A21 binding indexes drifted';
  end if;

  select pg_catalog.array_agg(
    policy_record.schemaname || '.' || policy_record.tablename || ':' ||
      policy_record.policyname || ':' || policy_record.cmd
    order by policy_record.schemaname, policy_record.tablename,
      policy_record.policyname
  )
  into v_policy_contract
  from pg_catalog.pg_policies as policy_record
  where policy_record.roles =
    array['careslink_v1_generation_points_admission_executor']::name[];

  if v_policy_contract is distinct from array[
    'careslink_v1_generation.communication_note_point_admissions:communication_note_point_admissions_executor_insert:INSERT',
    'careslink_v1_generation.communication_note_point_admissions:communication_note_point_admissions_executor_select:SELECT',
    'careslink_v1_generation.jobs:jobs_points_admission_executor_select:SELECT',
    'careslink_v1_generation.jobs:jobs_points_admission_executor_update:UPDATE',
    'careslink_v1_generation.payloads:payloads_points_admission_executor_select:SELECT',
    'public.point_ledger_entries:point_ledger_points_admission_insert:INSERT',
    'public.point_ledger_entries:point_ledger_points_admission_select:SELECT',
    'public.point_lots:point_lots_points_admission_select:SELECT',
    'public.point_lots:point_lots_points_admission_update:UPDATE',
    'public.point_quotes:point_quotes_points_admission_insert:INSERT',
    'public.point_quotes:point_quotes_points_admission_select:SELECT',
    'public.point_reservation_allocations:point_allocations_points_admission_insert:INSERT',
    'public.point_reservation_allocations:point_allocations_points_admission_select:SELECT',
    'public.point_reservations:point_reservations_points_admission_insert:INSERT',
    'public.point_reservations:point_reservations_points_admission_select:SELECT',
    'public.point_wallets:point_wallets_points_admission_lock:UPDATE',
    'public.point_wallets:point_wallets_points_admission_select:SELECT',
    'public.service_rate_versions:service_rate_versions_points_admission_lock:UPDATE',
    'public.service_rate_versions:service_rate_versions_points_admission_select:SELECT',
    'public.service_rates:service_rates_points_admission_lock:UPDATE',
    'public.service_rates:service_rates_points_admission_select:SELECT'
  ]::pg_catalog.text[]
  then
    raise exception 'A21 exact 21-policy contract drifted';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_record
    where policy_record.polname like '%points_admission%'
      and (
        0::pg_catalog.oid = any(policy_record.polroles)
        or 'anon'::pg_catalog.regrole::pg_catalog.oid =
          any(policy_record.polroles)
        or 'authenticated'::pg_catalog.regrole::pg_catalog.oid =
          any(policy_record.polroles)
        or 'service_role'::pg_catalog.regrole::pg_catalog.oid =
          any(policy_record.polroles)
        or 'authenticator'::pg_catalog.regrole::pg_catalog.oid =
          any(policy_record.polroles)
      )
  ) then
    raise exception 'A21 Points admission policy leaked to an API role';
  end if;

  select pg_catalog.array_agg(
    procedure_record.proname || ':' ||
      pg_catalog.pg_get_userbyid(procedure_record.proowner)
    order by procedure_record.proname
  )
  into v_function_contract
  from pg_catalog.pg_proc as procedure_record
  where procedure_record.pronamespace =
      'careslink_v1_generation'::pg_catalog.regnamespace
    and procedure_record.proname in (
      '_deny_v1_shadow_communication_note_point_binding_mutation',
      '_enforce_v1_shadow_communication_note_point_binding',
      '_guard_v1_shadow_communication_note_paid_attempt',
      '_guard_v1_shadow_communication_note_paid_reservation',
      '_guard_v1_shadow_communication_note_point_marker',
      '_reserve_and_bind_v1_shadow_communication_note_points',
      'admit_and_reserve_v1_shadow_communication_note_generation_job',
      'claim_v1_shadow_note_generation_job',
      'recover_v1_shadow_note_generation_expired'
    )
    and procedure_record.prosecdef
    and procedure_record.provolatile = 'v'
    and not procedure_record.proleakproof
    and not procedure_record.proretset
    and pg_catalog.cardinality(procedure_record.proconfig) = 1
    and procedure_record.proconfig[1] in ('search_path=', 'search_path=""');

  if v_function_contract is distinct from array[
    '_deny_v1_shadow_communication_note_point_binding_mutation:careslink_v1_generation_points_admission_executor',
    '_enforce_v1_shadow_communication_note_point_binding:careslink_v1_generation_points_admission_executor',
    '_guard_v1_shadow_communication_note_paid_attempt:careslink_v1_generation_points_admission_executor',
    '_guard_v1_shadow_communication_note_paid_reservation:careslink_v1_generation_points_admission_executor',
    '_guard_v1_shadow_communication_note_point_marker:careslink_v1_generation_points_admission_executor',
    '_reserve_and_bind_v1_shadow_communication_note_points:careslink_v1_generation_points_admission_executor',
    'admit_and_reserve_v1_shadow_communication_note_generation_job:careslink_v1_generation_owner_api_executor',
    'claim_v1_shadow_note_generation_job:careslink_v1_generation_executor',
    'recover_v1_shadow_note_generation_expired:careslink_v1_generation_executor'
  ]::pg_catalog.text[]
  then
    raise exception 'A21 function owner/definer/search_path contract drifted';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_record.oid))
  into v_helper_definition
  from pg_catalog.pg_proc as procedure_record
  where procedure_record.oid =
    'careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(uuid,uuid,uuid,boolean)'::pg_catalog.regprocedure;
  select pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_record.oid))
  into v_coordinator_definition
  from pg_catalog.pg_proc as procedure_record
  where procedure_record.oid =
    'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)'::pg_catalog.regprocedure;
  select pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_record.oid))
  into v_claim_definition
  from pg_catalog.pg_proc as procedure_record
  where procedure_record.oid =
    'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'::pg_catalog.regprocedure;
  select pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_record.oid))
  into v_recovery_definition
  from pg_catalog.pg_proc as procedure_record
  where procedure_record.oid =
    'careslink_v1_generation.recover_v1_shadow_note_generation_expired(text,text,text,text,text,text)'::pg_catalog.regprocedure;
  select pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_record.oid))
  into v_marker_definition
  from pg_catalog.pg_proc as procedure_record
  where procedure_record.oid =
    'careslink_v1_generation._guard_v1_shadow_communication_note_point_marker()'::pg_catalog.regprocedure;
  select pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure_record.oid))
  into v_reservation_guard_definition
  from pg_catalog.pg_proc as procedure_record
  where procedure_record.oid =
    'careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()'::pg_catalog.regprocedure;

  if v_helper_definition !~
      'set constraints[[:space:]]+careslink_v1_generation[.]communication_note_point_admissions_consistency_trigger[[:space:]]+deferred'
    or v_helper_definition !~
      'set constraints[[:space:]]+careslink_v1_generation[.]communication_note_point_admissions_consistency_trigger[[:space:]]+immediate'
    or v_helper_definition !~ 'pg_advisory_xact_lock'
    or v_helper_definition !~ 'v_outstanding pg_catalog[.]int4 := 20'
    or v_helper_definition !~ 'reservation_status is distinct from ''reserved'''
    or v_helper_definition !~ 'v_replay_reserve_ledger_count'
    or v_coordinator_definition !~ '''pointsreserved'', true'
    or v_coordinator_definition !~ 'v_admission is null'
    or v_coordinator_definition !~ 'v_points is null'
    or v_coordinator_definition !~
      'v_points[[:space:]]*->[[:space:]]*''points'' is distinct from ''20''::pg_catalog[.]jsonb'
    or v_claim_definition !~ 'communication_note_point_admission_id is null'
    or (
      pg_catalog.length(v_recovery_definition) - pg_catalog.length(
        pg_catalog.replace(
          v_recovery_definition,
          'communication_note_point_admission_id is null',
          ''
        )
      )
    ) / pg_catalog.length('communication_note_point_admission_id is null') <> 7
    or v_marker_definition !~ 'new[.]status is distinct from ''queued'''
    or v_reservation_guard_definition !~ 'v_owner_user_id := old[.]owner_user_id'
    or v_reservation_guard_definition !~ 'v_reservation_id := old[.]id'
    or v_reservation_guard_definition !~ 'product_api_disabled'
  then
    raise exception 'A21 function source/quarantine contract drifted';
  end if;

  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_trigger as trigger_record
      where not trigger_record.tgisinternal
        and trigger_record.tgname in (
          'communication_note_point_admissions_consistency_trigger',
          'communication_note_point_admissions_immutable',
          'jobs_communication_note_point_marker_guard',
          'attempts_communication_note_paid_admission_gate',
          'point_reservations_communication_note_paid_admission_gate'
        )
    ) <> 5
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'careslink_v1_generation.attempts'::pg_catalog.regclass
        and trigger_record.tgname =
          'attempts_communication_note_paid_admission_gate'
        and trigger_record.tgqual is null
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.point_reservations'::pg_catalog.regclass
        and trigger_record.tgname =
          'point_reservations_communication_note_paid_admission_gate'
        and pg_catalog.pg_get_triggerdef(trigger_record.oid) ~
          'BEFORE DELETE OR UPDATE ON public[.]point_reservations'
    )
  then
    raise exception 'A21 trigger contract drifted';
  end if;

  if pg_catalog.has_schema_privilege(
      v_points_role, 'careslink_v1_generation', 'CREATE'
    )
    or pg_catalog.has_table_privilege(
      v_points_role, 'public.point_reservations', 'TRIGGER'
    )
    or pg_catalog.has_table_privilege(
      v_points_role,
      'careslink_v1_generation.communication_note_point_admissions',
      'INSERT'
    )
    or not pg_catalog.has_column_privilege(
      v_points_role,
      'careslink_v1_generation.communication_note_point_admissions',
      'id',
      'INSERT'
    )
    or not pg_catalog.has_column_privilege(
      v_points_role,
      'careslink_v1_generation.jobs',
      'communication_note_point_admission_id',
      'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'authenticated',
      'careslink_v1_generation.communication_note_point_admissions',
      'SELECT'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'careslink_v1_generation_owner_api_executor',
      'careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(uuid,uuid,uuid,boolean)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'careslink_v1_generation_executor',
      'careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(uuid,uuid,uuid,boolean)',
      'EXECUTE'
    )
  then
    raise exception 'A21 privilege closure drifted';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure_record
    join lateral pg_catalog.aclexplode(
      coalesce(
        procedure_record.proacl,
        pg_catalog.acldefault('f', procedure_record.proowner)
      )
    ) as acl on true
    where procedure_record.pronamespace =
        'careslink_v1_generation'::pg_catalog.regnamespace
      and procedure_record.proname in (
        '_deny_v1_shadow_communication_note_point_binding_mutation',
        '_enforce_v1_shadow_communication_note_point_binding',
        '_guard_v1_shadow_communication_note_paid_attempt',
        '_guard_v1_shadow_communication_note_paid_reservation',
        '_guard_v1_shadow_communication_note_point_marker'
      )
      and acl.grantee <> v_points_role
  ) then
    raise exception 'A21 trigger helper ACL leaked beyond its owner';
  end if;
end
$careslink_v1_communication_points_catalog$;

-- Assertion-only SET edges. They are revoked before the final rollback and
-- never constitute a runtime caller credential.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_owner_api_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_points_admission_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant service_role to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant authenticated to current_user
  with admin false, inherit false, set true
  granted by current_user;

create temporary table a21_policy_values (
  note_type pg_catalog.text primary key,
  service_code pg_catalog.text not null,
  provider_digest pg_catalog.text not null
) on commit drop;

create temporary table a21_results (
  scenario pg_catalog.text primary key,
  result pg_catalog.jsonb not null
) on commit drop;

create temporary table a21_snapshots (
  scenario pg_catalog.text not null,
  relation_name pg_catalog.text not null,
  rows_json pg_catalog.jsonb not null,
  primary key (scenario, relation_name)
) on commit drop;

grant select on a21_policy_values
  to careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
grant select, insert, update on a21_results
  to careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_executor,
    careslink_v1_generation_points_admission_executor;
grant select, insert, update on a21_snapshots
  to careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_executor,
    careslink_v1_generation_points_admission_executor;

-- Fixed digests and expiry belong only to this A21 TEST_ONLY namespace. The
-- two-client harness uses a separate fixed namespace and contract.
select pg_catalog.set_config(
  'careslink.assert.a21.facts_hash',
  public.v1_shadow_content_sha256(
    '{"occurred_at":"2026-09-02T08:00:00Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"test-only","action_taken":"documented"}'::pg_catalog.jsonb
  ),
  true
);
select pg_catalog.set_config(
  'careslink.assert.a21.payload_expires_at',
  (
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()) +
      interval '20 minutes'
  )::pg_catalog.text,
  true
);
select pg_catalog.set_config(
  'careslink.assert.a21.worker_identity_hash',
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to('a21-test-only-worker', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  true
);
select pg_catalog.set_config(
  'careslink.assert.a21.worker_policy_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-worker-policy',
      'version', 'worker.a21.test.v1',
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
      'retryDelayMsAfterAttempt', pg_catalog.jsonb_build_array(1000),
      'retryableOutcomes', pg_catalog.jsonb_build_array(
        'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT'
      ),
      'recoveryBatchLimit', 10,
      'jitter', pg_catalog.jsonb_build_object('mode', 'NONE')
    )
  ),
  true
);
select pg_catalog.set_config(
  'careslink.assert.a21.payload_policy_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'policyVersion', 'payload.a21.test.v1',
      'encryptionProfileVersion', 'encryption.a21.test.v1',
      'backupDispositionVersion', 'backup.a21.test.v1'
    )
  ),
  true
);

insert into a21_policy_values (note_type, service_code, provider_digest)
select policy.note_type, policy.service_code,
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'noteType', policy.note_type,
      'serviceCode', policy.service_code,
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'rateCatalogVersion', '2026-08-09.v1-shadow',
      'providerId', 'provider.a21.test',
      'modelId', 'model.a21.test',
      'modelRevision', null,
      'modelRevisionAvailability', 'PROVIDER_NOT_EXPOSED',
      'policyVersion', 'provider.a21.test.v1',
      'promptTemplateVersion', 'prompt.a21.test.v1',
      'goldenSetVersion', 'golden.a21.test.v1',
      'parserVersion', 'parser.a21.test.v1',
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

select pg_catalog.set_config(
  'careslink.assert.a21.registration_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-registered-worker',
      'registrationVersion', 'registration.a21.test.v1',
      'status', 'APPROVED',
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'workerIdentityVersion', 'worker-identity.a21.test.v1',
      'workerIdentityHash',
        pg_catalog.current_setting(
          'careslink.assert.a21.worker_identity_hash'
        ),
      'workerPolicyVersion', 'worker.a21.test.v1',
      'workerPolicyDigest',
        pg_catalog.current_setting(
          'careslink.assert.a21.worker_policy_digest'
        ),
      'payloadPolicyVersion', 'payload.a21.test.v1',
      'payloadPolicySnapshotHash',
        pg_catalog.current_setting(
          'careslink.assert.a21.payload_policy_digest'
        ),
      'providerPolicies', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'noteType', policy.note_type,
            'policyVersion', 'provider.a21.test.v1',
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
        from a21_policy_values as policy
      )
    )
  ),
  true
);

-- Fixed synthetic Auth and privacy fixtures only. No care text or generated
-- note content is inserted.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_anonymous, created_at, updated_at
) values
  (
    'a2100000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'a21-a@example.invalid',
    'test-only-no-login', pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    'a2100000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'a21-b@example.invalid',
    'test-only-no-login', pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    'a2100000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'a21-c@example.invalid',
    'test-only-no-login', pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    'a2100000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'a21-d@example.invalid',
    'test-only-no-login', pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    'a2100000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'a21-e@example.invalid',
    'test-only-no-login', pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    'a2100000-0000-4000-8000-000000000006',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'a21-legacy@example.invalid',
    'test-only-no-login', pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );

insert into auth.sessions (
  id, user_id, created_at, updated_at, not_after
) values
  (
    'a2110000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    'a2110000-0000-4000-8000-000000000002',
    'a2100000-0000-4000-8000-000000000002',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    'a2110000-0000-4000-8000-000000000003',
    'a2100000-0000-4000-8000-000000000003',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    'a2110000-0000-4000-8000-000000000004',
    'a2100000-0000-4000-8000-000000000004',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    'a2110000-0000-4000-8000-000000000005',
    'a2100000-0000-4000-8000-000000000005',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    'a2110000-0000-4000-8000-000000000099',
    'a2100000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() - interval '1 second'
  );

insert into public.privacy_reviews (
  id, owner_user_id, note_type, cleaned_facts_hash, schema_version,
  status, finding_decisions, confirmed_at, expires_at, contract_version,
  scanner_policy_version, review_revision, mutation_id,
  request_fingerprint, deidentification_confirmed,
  authority_to_process_confirmed, shadow_only
)
select
  fixture.review_id,
  fixture.owner_user_id,
  'communication',
  pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
  '2026-08-09.v1-shadow',
  'CONFIRMED',
  '[]'::pg_catalog.jsonb,
  case when fixture.is_stale then
    assertion_clock.now_ms - interval '31 minutes'
  else
    assertion_clock.now_ms
  end,
  case when fixture.is_stale then
    assertion_clock.now_ms - interval '1 minute'
  else
    assertion_clock.now_ms + interval '30 minutes'
  end,
  '1.0.0-shadow.1',
  '2026-08-11.preview.1',
  1,
  fixture.mutation_id,
  fixture.request_fingerprint,
  true,
  true,
  true
from (values
  (
    'a2120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'a2100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    false, 'privacy.a21.a.0001'::pg_catalog.text,
    pg_catalog.repeat('1', 64)
  ),
  (
    'a2120000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'a2100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    false, 'privacy.a21.b.0001'::pg_catalog.text,
    pg_catalog.repeat('2', 64)
  ),
  (
    'a2120000-0000-4000-8000-000000000003'::pg_catalog.uuid,
    'a2100000-0000-4000-8000-000000000003'::pg_catalog.uuid,
    false, 'privacy.a21.c.0001'::pg_catalog.text,
    pg_catalog.repeat('3', 64)
  ),
  (
    'a2120000-0000-4000-8000-000000000004'::pg_catalog.uuid,
    'a2100000-0000-4000-8000-000000000004'::pg_catalog.uuid,
    false, 'privacy.a21.d.0001'::pg_catalog.text,
    pg_catalog.repeat('4', 64)
  ),
  (
    'a2120000-0000-4000-8000-000000000005'::pg_catalog.uuid,
    'a2100000-0000-4000-8000-000000000005'::pg_catalog.uuid,
    false, 'privacy.a21.e.0001'::pg_catalog.text,
    pg_catalog.repeat('5', 64)
  ),
  (
    'a2120000-0000-4000-8000-000000000099'::pg_catalog.uuid,
    'a2100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    true, 'privacy.a21.stale.0099'::pg_catalog.text,
    pg_catalog.repeat('9', 64)
  )
) as fixture(
  review_id, owner_user_id, is_stale, mutation_id, request_fingerprint
)
cross join lateral (
  select pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  ) as now_ms
) as assertion_clock;

-- Install a complete TEST_ONLY policy catalog and activate only the
-- communication admission lane. Every FORCE-RLS relaxation is inside the
-- outer rollback transaction.
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
    updated_at = pg_catalog.date_trunc(
      'milliseconds', pg_catalog.clock_timestamp()
    )
where capability = 'note_generation_v1';

insert into careslink_v1_generation.worker_policies (
  version, status, max_queue_age_ms,
  minimum_payload_remaining_at_claim_ms, lease_duration_ms,
  heartbeat_interval_ms, heartbeat_safety_margin_ms,
  attempt_deadline_ms, provider_deadline_ms, commit_safety_margin_ms,
  max_attempts, retry_delay_ms_after_attempt, retryable_outcomes,
  recovery_batch_limit, jitter_mode, jitter_max_ms, policy_digest,
  shadow_only
) values (
  'worker.a21.test.v1', 'APPROVED', 600000, 60000, 10000, 2000,
  1000, 30000, 20000, 5000, 2,
  array[1000]::pg_catalog.int8[],
  array[
    'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT'
  ]::pg_catalog.text[],
  10, 'NONE', null,
  pg_catalog.current_setting('careslink.assert.a21.worker_policy_digest'),
  true
);

insert into careslink_v1_generation.provider_policies (
  note_type, policy_version, status, service_code, contract_version,
  schema_version, rate_catalog_version, provider_id, model_id,
  model_revision, model_revision_availability, prompt_template_version,
  golden_set_version, parser_version, timeout_ms, policy_digest, shadow_only
)
select policy.note_type, 'provider.a21.test.v1', 'APPROVED',
  policy.service_code, '1.0.0-shadow.1', '2026-08-09.v1-shadow',
  '2026-08-09.v1-shadow', 'provider.a21.test', 'model.a21.test', null,
  'PROVIDER_NOT_EXPOSED', 'prompt.a21.test.v1', 'golden.a21.test.v1',
  'parser.a21.test.v1', 20000, policy.provider_digest, true
from a21_policy_values as policy;

insert into careslink_v1_generation.payload_policies (
  policy_version, status, encryption_profile_version,
  backup_disposition_version, policy_digest, shadow_only
) values (
  'payload.a21.test.v1', 'APPROVED', 'encryption.a21.test.v1',
  'backup.a21.test.v1',
  pg_catalog.current_setting('careslink.assert.a21.payload_policy_digest'),
  true
);

insert into careslink_v1_generation.worker_registrations (
  registration_digest, registration_version, status, contract_version,
  schema_version, worker_identity_version, worker_identity_hash,
  worker_policy_version, worker_policy_digest, payload_policy_version,
  payload_policy_snapshot_hash, shadow_only
) values (
  pg_catalog.current_setting('careslink.assert.a21.registration_digest'),
  'registration.a21.test.v1', 'APPROVED', '1.0.0-shadow.1',
  '2026-08-09.v1-shadow', 'worker-identity.a21.test.v1',
  pg_catalog.current_setting('careslink.assert.a21.worker_identity_hash'),
  'worker.a21.test.v1',
  pg_catalog.current_setting('careslink.assert.a21.worker_policy_digest'),
  'payload.a21.test.v1',
  pg_catalog.current_setting('careslink.assert.a21.payload_policy_digest'),
  true
);

insert into
  careslink_v1_generation.worker_registration_provider_policies (
    registration_digest, note_type, policy_version, policy_digest,
    shadow_only
  )
select pg_catalog.current_setting(
    'careslink.assert.a21.registration_digest'
  ),
  policy.note_type,
  'provider.a21.test.v1',
  policy.provider_digest,
  true
from a21_policy_values as policy;

insert into careslink_v1_generation.admission_policy_bindings (
  binding_version, note_type, registration_digest, status,
  activated_at, created_at, shadow_only
) values (
  'binding.a21.test.v1',
  'communication',
  pg_catalog.current_setting('careslink.assert.a21.registration_digest'),
  'ACTIVE',
  pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
  pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
  true
);

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

-- Build Points history only through the existing service_role-only grant RPC.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
do $careslink_v1_communication_points_grants$
declare
  v_now pg_catalog.timestamptz := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
begin
  perform public.grant_shadow_point_lot(
    'a2100000-0000-4000-8000-000000000001',
    'WELCOME', 'TEST_A21_OWNER_A_60', 60, null, v_now
  );
  perform public.grant_shadow_point_lot(
    'a2100000-0000-4000-8000-000000000003',
    'WELCOME', 'TEST_A21_OWNER_C_SUSPENDED', 40, null, v_now
  );
  perform public.grant_shadow_point_lot(
    'a2100000-0000-4000-8000-000000000004',
    'WELCOME', 'TEST_A21_OWNER_D_19', 19, null, v_now
  );
  perform public.grant_shadow_point_lot(
    'a2100000-0000-4000-8000-000000000005',
    'WELCOME', 'TEST_A21_OWNER_E_30', 30, null, v_now
  );
  perform public.grant_shadow_point_lot(
    'a2100000-0000-4000-8000-000000000006',
    'WELCOME', 'TEST_A21_LEGACY_50', 50, null, v_now
  );
end
$careslink_v1_communication_points_grants$;

update public.point_wallets
set status = 'SUSPENDED',
    updated_at = pg_catalog.clock_timestamp()
where owner_user_id = 'a2100000-0000-4000-8000-000000000003';

-- Snapshot legacy credit relations after all fixture setup. Every subsequent
-- assertion must leave their ordered full-row JSON byte-for-byte unchanged.
insert into a21_snapshots (scenario, relation_name, rows_json)
select 'legacy-baseline', 'account_entitlements',
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(entitlement) order by
      entitlement.id),
    '[]'::pg_catalog.jsonb
  )
from public.account_entitlements as entitlement
union all
select 'legacy-baseline', 'credit_ledger',
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(credit) order by credit.id),
    '[]'::pg_catalog.jsonb
  )
from public.credit_ledger as credit;

-- A deterministic AFTER INSERT fault proves that a failure after quote,
-- reservation, allocation and RESERVE-ledger writes rolls the durable job and
-- every Points mutation back as one statement.
set local role careslink_v1_generation_owner;
create function careslink_v1_generation._a21_late_binding_fault()
returns trigger
language plpgsql
set search_path = ''
as $a21_late_binding_fault$
begin
  raise exception using errcode = 'P0001', message = 'A21_LATE_FAULT';
end
$a21_late_binding_fault$;
create trigger a21_late_binding_fault
after insert on careslink_v1_generation.communication_note_point_admissions
for each row execute function
  careslink_v1_generation._a21_late_binding_fault();
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_late_fault$
declare
  v_failed pg_catalog.bool := false;
begin
  begin
    perform
      careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
        'a2100000-0000-4000-8000-000000000001',
        'a2110000-0000-4000-8000-000000000001',
        'BEARER',
        'a2130000-0000-4000-8000-000000000090',
        'a2150000-0000-4000-8000-000000000090',
        'a2120000-0000-4000-8000-000000000001',
        'en', '1.0.0-shadow.1', '2026-08-09.v1-shadow',
        pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
        pg_catalog.repeat('0', 64),
        pg_catalog.repeat('0', 64),
        pg_catalog.repeat('0', 64),
        pg_catalog.current_setting(
          'careslink.assert.a21.payload_expires_at'
        )::pg_catalog.timestamptz
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'A21_LATE_FAULT' then
      v_failed := true;
    else
      raise;
    end if;
  end;

  if not v_failed then
    raise exception 'A21 deterministic late fault did not fire';
  end if;
end
$careslink_v1_communication_points_late_fault$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_points_admission_executor;
select careslink_v1_generation._set_owner(
  'a2100000-0000-4000-8000-000000000001'
);
do $careslink_v1_communication_points_late_fault_rollback$
begin
  if exists (
      select 1 from careslink_v1_generation.jobs
      where id = 'a2130000-0000-4000-8000-000000000090'
    )
    or exists (
      select 1 from careslink_v1_generation.payloads
      where id = 'a2150000-0000-4000-8000-000000000090'
    )
    or exists (
      select 1
      from careslink_v1_generation.communication_note_point_admissions
    )
    or exists (
      select 1 from public.point_quotes
      where owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    )
    or exists (
      select 1 from public.point_reservations
      where owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    )
    or exists (
      select 1 from public.point_reservation_allocations
      where owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    )
    or exists (
      select 1 from public.point_ledger_entries
      where owner_user_id = 'a2100000-0000-4000-8000-000000000001'
        and event = 'RESERVE'
    )
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
      where lot.owner_user_id =
        'a2100000-0000-4000-8000-000000000001'
    ) is distinct from 60::pg_catalog.int8
  then
    raise exception 'A21 late-fault statement left partial durable/Points state';
  end if;
end
$careslink_v1_communication_points_late_fault_rollback$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner;
drop trigger a21_late_binding_fault
  on careslink_v1_generation.communication_note_point_admissions;
drop function careslink_v1_generation._a21_late_binding_fault();
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- First admission: the public envelope is owner-safe and contains no Points
-- identifiers or private binding data.
set local role careslink_v1_generation_owner_api_executor;
insert into a21_results (scenario, result)
values (
  'owner-a-first',
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    'a2100000-0000-4000-8000-000000000001',
    'a2110000-0000-4000-8000-000000000001',
    'BEARER',
    'a2130000-0000-4000-8000-000000000001',
    'a2150000-0000-4000-8000-000000000001',
    'a2120000-0000-4000-8000-000000000001',
    'en', '1.0.0-shadow.1', '2026-08-09.v1-shadow',
    pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
    pg_catalog.repeat('1', 64),
    pg_catalog.repeat('a', 64),
    pg_catalog.repeat('b', 64),
    pg_catalog.current_setting(
      'careslink.assert.a21.payload_expires_at'
    )::pg_catalog.timestamptz
  )
);

do $careslink_v1_communication_points_response$
declare
  v_result pg_catalog.jsonb := (
    select result from a21_results where scenario = 'owner-a-first'
  );
  v_job pg_catalog.jsonb;
begin
  v_job := v_result->'job';
  if not (v_result ?& array[
      'created', 'payloadAccepted', 'pointsReserved', 'job'
    ])
    or v_result - array[
      'created', 'payloadAccepted', 'pointsReserved', 'job'
    ] <> '{}'::pg_catalog.jsonb
    or v_result->'created' is distinct from 'true'::pg_catalog.jsonb
    or v_result->'payloadAccepted' is distinct from 'true'::pg_catalog.jsonb
    or v_result->'pointsReserved' is distinct from 'true'::pg_catalog.jsonb
    or not (v_job ?& array[
      'attemptCount', 'createdAt', 'failureCode', 'finishedAt', 'jobId',
      'noteType', 'result', 'serviceCode', 'startedAt', 'status', 'updatedAt'
    ])
    or v_job - array[
      'attemptCount', 'createdAt', 'failureCode', 'finishedAt', 'jobId',
      'noteType', 'result', 'serviceCode', 'startedAt', 'status', 'updatedAt'
    ] <> '{}'::pg_catalog.jsonb
    or v_job->>'jobId' is distinct from
      'a2130000-0000-4000-8000-000000000001'
    or v_job->>'noteType' is distinct from 'communication'
    or v_job->>'serviceCode' is distinct from
      'note.communication.generate'
    or v_job->>'status' is distinct from 'QUEUED'
    or v_job->'attemptCount' is distinct from '0'::pg_catalog.jsonb
    or v_job->'updatedAt' is distinct from v_job->'createdAt'
    or v_job->>'createdAt' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or v_job->'startedAt' is distinct from 'null'::pg_catalog.jsonb
    or v_job->'finishedAt' is distinct from 'null'::pg_catalog.jsonb
    or v_job->'failureCode' is distinct from 'null'::pg_catalog.jsonb
    or v_job->'result' is distinct from 'null'::pg_catalog.jsonb
    or v_result::pg_catalog.text ~*
      'bindingId|quoteId|reservationId|ownerUserId|sessionId|privacyReview|cleanedFacts|idempotency|requestHash|payloadHandle|policyDigest|leaseToken|providerEvidence'
  then
    raise exception 'A21 coordinator response envelope drifted or leaked';
  end if;
end
$careslink_v1_communication_points_response$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_points_admission_executor;
select careslink_v1_generation._set_owner(
  'a2100000-0000-4000-8000-000000000001'
);
do $careslink_v1_communication_points_first_raw$
begin
  if (
      select pg_catalog.count(*)
      from careslink_v1_generation.jobs as job
      join careslink_v1_generation.payloads as payload
        on payload.id = job.payload_id
       and payload.job_id = job.id
       and payload.owner_user_id = job.owner_user_id
      join careslink_v1_generation.communication_note_point_admissions
        as binding
        on binding.id = job.communication_note_point_admission_id
       and binding.job_id = job.id
       and binding.owner_user_id = job.owner_user_id
      join public.point_quotes as quote
        on quote.id = binding.quote_id
       and quote.owner_user_id = binding.owner_user_id
      join public.point_reservations as reservation
        on reservation.id = binding.reservation_id
       and reservation.owner_user_id = binding.owner_user_id
      where job.id = 'a2130000-0000-4000-8000-000000000001'
        and job.status = 'QUEUED'
        and job.note_type = 'communication'
        and job.service_code = 'note.communication.generate'
        and job.rate_catalog_version = '2026-08-09.v1-shadow'
        and payload.state = 'AVAILABLE'
        and binding.created_at = quote.created_at
        and quote.points = 20
        and quote.quantity = 1
        and quote.expires_at = reservation.expires_at
        and reservation.points = 20
        and reservation.status = 'RESERVED'
        and reservation.reserved_at = quote.created_at
        and reservation.idempotency_key =
          'communication-admission:' || pg_catalog.repeat('1', 64)
        and binding.shadow_only
        and quote.shadow_only
        and reservation.shadow_only
    ) <> 1
    or (
      select pg_catalog.count(*)
      from public.point_reservation_allocations as allocation
      join public.point_reservations as reservation
        on reservation.id = allocation.reservation_id
       and reservation.owner_user_id = allocation.owner_user_id
      where allocation.owner_user_id =
          'a2100000-0000-4000-8000-000000000001'
        and reservation.idempotency_key =
          'communication-admission:' || pg_catalog.repeat('1', 64)
    ) < 1
    or (
      select pg_catalog.sum(allocation.points)
      from public.point_reservation_allocations as allocation
      join public.point_reservations as reservation
        on reservation.id = allocation.reservation_id
       and reservation.owner_user_id = allocation.owner_user_id
      where allocation.owner_user_id =
          'a2100000-0000-4000-8000-000000000001'
        and reservation.idempotency_key =
          'communication-admission:' || pg_catalog.repeat('1', 64)
    ) is distinct from 20::pg_catalog.int8
    or (
      select pg_catalog.count(*)
      from public.point_ledger_entries as ledger
      where ledger.owner_user_id =
          'a2100000-0000-4000-8000-000000000001'
        and ledger.event = 'RESERVE'
        and ledger.points = 20
        and ledger.delta = -20
        and ledger.idempotency_key =
          'communication-admission:' || pg_catalog.repeat('1', 64)
    ) <> 1
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
      where lot.owner_user_id =
        'a2100000-0000-4000-8000-000000000001'
    ) is distinct from 40::pg_catalog.int8
  then
    raise exception 'A21 first admission raw 20-Point shape drifted';
  end if;
end
$careslink_v1_communication_points_first_raw$;

insert into a21_snapshots (scenario, relation_name, rows_json)
select 'owner-a-first', 'jobs', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(job) order by job.id),
  '[]'::pg_catalog.jsonb
)
from careslink_v1_generation.jobs as job
where job.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
union all
select 'owner-a-first', 'payloads', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(payload) order by payload.id),
  '[]'::pg_catalog.jsonb
)
from careslink_v1_generation.payloads as payload
where payload.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
union all
select 'owner-a-first', 'bindings', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(binding) order by binding.id),
  '[]'::pg_catalog.jsonb
)
from careslink_v1_generation.communication_note_point_admissions as binding
where binding.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
union all
select 'owner-a-first', 'wallets', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(wallet) order by wallet.id),
  '[]'::pg_catalog.jsonb
)
from public.point_wallets as wallet
where wallet.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
union all
select 'owner-a-first', 'lots', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(lot) order by lot.id),
  '[]'::pg_catalog.jsonb
)
from public.point_lots as lot
where lot.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
union all
select 'owner-a-first', 'quotes', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(quote) order by quote.id),
  '[]'::pg_catalog.jsonb
)
from public.point_quotes as quote
where quote.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
union all
select 'owner-a-first', 'reservations', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(reservation) order by reservation.id),
  '[]'::pg_catalog.jsonb
)
from public.point_reservations as reservation
where reservation.owner_user_id =
  'a2100000-0000-4000-8000-000000000001'
union all
select 'owner-a-first', 'allocations', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(allocation) order by
    allocation.reservation_id, allocation.lot_id),
  '[]'::pg_catalog.jsonb
)
from public.point_reservation_allocations as allocation
where allocation.owner_user_id =
  'a2100000-0000-4000-8000-000000000001'
union all
select 'owner-a-first', 'ledger', coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ledger) order by ledger.id),
  '[]'::pg_catalog.jsonb
)
from public.point_ledger_entries as ledger
where ledger.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
  and ledger.event = 'RESERVE';

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Exact replay, replacement-candidate replay and changed-request conflict all
-- share the same durable lane and must be zero-write at the Points boundary.
set local role careslink_v1_generation_owner_api_executor;
insert into a21_results (scenario, result)
values (
  'owner-a-exact-replay',
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    'a2100000-0000-4000-8000-000000000001',
    'a2110000-0000-4000-8000-000000000001', 'BEARER',
    'a2130000-0000-4000-8000-000000000001',
    'a2150000-0000-4000-8000-000000000001',
    'a2120000-0000-4000-8000-000000000001',
    'en', '1.0.0-shadow.1', '2026-08-09.v1-shadow',
    pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
    pg_catalog.repeat('1', 64), pg_catalog.repeat('a', 64),
    pg_catalog.repeat('b', 64),
    pg_catalog.current_setting(
      'careslink.assert.a21.payload_expires_at'
    )::pg_catalog.timestamptz
  )
), (
  'owner-a-candidate-replay',
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    'a2100000-0000-4000-8000-000000000001',
    'a2110000-0000-4000-8000-000000000001', 'BEARER',
    'a2130000-0000-4000-8000-000000000011',
    'a2150000-0000-4000-8000-000000000011',
    'a2120000-0000-4000-8000-000000000001',
    'en', '1.0.0-shadow.1', '2026-08-09.v1-shadow',
    pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
    pg_catalog.repeat('1', 64), pg_catalog.repeat('a', 64),
    pg_catalog.repeat('c', 64),
    pg_catalog.current_setting(
      'careslink.assert.a21.payload_expires_at'
    )::pg_catalog.timestamptz + interval '1 minute'
  )
);

do $careslink_v1_communication_points_replay_results$
declare
  v_exact pg_catalog.jsonb := (
    select result from a21_results where scenario = 'owner-a-exact-replay'
  );
  v_candidate pg_catalog.jsonb := (
    select result from a21_results where scenario = 'owner-a-candidate-replay'
  );
  v_conflict pg_catalog.bool := false;
begin
  if v_exact->'created' is distinct from 'false'::pg_catalog.jsonb
    or v_exact->'payloadAccepted' is distinct from 'true'::pg_catalog.jsonb
    or v_exact->'pointsReserved' is distinct from 'true'::pg_catalog.jsonb
    or v_exact->'job' is distinct from (
      select result->'job' from a21_results where scenario = 'owner-a-first'
    )
    or v_candidate->'created' is distinct from 'false'::pg_catalog.jsonb
    or v_candidate->'payloadAccepted' is distinct from 'false'::pg_catalog.jsonb
    or v_candidate->'pointsReserved' is distinct from 'true'::pg_catalog.jsonb
    or v_candidate->'job' is distinct from v_exact->'job'
  then
    raise exception 'A21 replay response contract drifted';
  end if;

  begin
    perform
      careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
        'a2100000-0000-4000-8000-000000000001',
        'a2110000-0000-4000-8000-000000000001', 'BEARER',
        'a2130000-0000-4000-8000-000000000012',
        'a2150000-0000-4000-8000-000000000012',
        'a2120000-0000-4000-8000-000000000001',
        'en', '1.0.0-shadow.1', '2026-08-09.v1-shadow',
        pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
        pg_catalog.repeat('1', 64), pg_catalog.repeat('f', 64),
        pg_catalog.repeat('f', 64),
        pg_catalog.current_setting(
          'careslink.assert.a21.payload_expires_at'
        )::pg_catalog.timestamptz
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IDEMPOTENCY_CONFLICT' then
      v_conflict := true;
    else
      raise;
    end if;
  end;

  if not v_conflict then
    raise exception 'A21 changed request did not fail closed';
  end if;
end
$careslink_v1_communication_points_replay_results$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_points_admission_executor;
select careslink_v1_generation._set_owner(
  'a2100000-0000-4000-8000-000000000001'
);
do $careslink_v1_communication_points_replay_zero_write$
declare
  v_mismatch_count pg_catalog.int4;
  v_mismatches pg_catalog.jsonb;
begin
  with current_state(relation_name, rows_json) as (
    select 'jobs', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(job) order by job.id),
      '[]'::pg_catalog.jsonb
    ) from careslink_v1_generation.jobs as job
      where job.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    union all
    select 'payloads', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(payload) order by payload.id),
      '[]'::pg_catalog.jsonb
    ) from careslink_v1_generation.payloads as payload
      where payload.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    union all
    select 'bindings', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(binding) order by binding.id),
      '[]'::pg_catalog.jsonb
    ) from careslink_v1_generation.communication_note_point_admissions
      as binding
      where binding.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    union all
    select 'wallets', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(wallet) order by wallet.id),
      '[]'::pg_catalog.jsonb
    ) from public.point_wallets as wallet
      where wallet.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    union all
    select 'lots', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(lot) order by lot.id),
      '[]'::pg_catalog.jsonb
    ) from public.point_lots as lot
      where lot.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    union all
    select 'quotes', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(quote) order by quote.id),
      '[]'::pg_catalog.jsonb
    ) from public.point_quotes as quote
      where quote.owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    union all
    select 'reservations', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(reservation) order by
        reservation.id),
      '[]'::pg_catalog.jsonb
    ) from public.point_reservations as reservation
      where reservation.owner_user_id =
        'a2100000-0000-4000-8000-000000000001'
    union all
    select 'allocations', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(allocation) order by
        allocation.reservation_id, allocation.lot_id),
      '[]'::pg_catalog.jsonb
    ) from public.point_reservation_allocations as allocation
      where allocation.owner_user_id =
        'a2100000-0000-4000-8000-000000000001'
    union all
    select 'ledger', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ledger) order by ledger.id),
      '[]'::pg_catalog.jsonb
    ) from public.point_ledger_entries as ledger
      where ledger.owner_user_id =
        'a2100000-0000-4000-8000-000000000001'
        and ledger.event = 'RESERVE'
  )
  select pg_catalog.count(*), pg_catalog.jsonb_agg(
    coalesce(current_state.relation_name, snapshot.relation_name)
    order by coalesce(current_state.relation_name, snapshot.relation_name)
  ) into v_mismatch_count, v_mismatches
  from current_state
  full join (
    select relation_name, rows_json
    from a21_snapshots
    where scenario = 'owner-a-first'
  ) as snapshot
    on snapshot.relation_name = current_state.relation_name
  where snapshot.relation_name is null
    or current_state.relation_name is null
    or snapshot.rows_json is distinct from current_state.rows_json;

  if v_mismatch_count <> 0 then
    raise exception 'A21 replay or changed request wrote durable/Points state: %',
      v_mismatches;
  end if;
end
$careslink_v1_communication_points_replay_zero_write$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Force the outer transaction's deferred binding constraint IMMEDIATE; the
-- allocator must restore DEFERRED itself and admit a second paid job safely.
set constraints
  careslink_v1_generation.communication_note_point_admissions_consistency_trigger
  immediate;
set local role careslink_v1_generation_owner_api_executor;
insert into a21_results (scenario, result)
values (
  'owner-a-second',
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    'a2100000-0000-4000-8000-000000000001',
    'a2110000-0000-4000-8000-000000000001', 'BEARER',
    'a2130000-0000-4000-8000-000000000002',
    'a2150000-0000-4000-8000-000000000002',
    'a2120000-0000-4000-8000-000000000001',
    'en', '1.0.0-shadow.1', '2026-08-09.v1-shadow',
    pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
    pg_catalog.repeat('2', 64), pg_catalog.repeat('c', 64),
    pg_catalog.repeat('d', 64),
    pg_catalog.current_setting(
      'careslink.assert.a21.payload_expires_at'
    )::pg_catalog.timestamptz
  )
);

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_points_admission_executor;
select careslink_v1_generation._set_owner(
  'a2100000-0000-4000-8000-000000000001'
);
do $careslink_v1_communication_points_two_in_one_transaction$
begin
  if (
      select pg_catalog.count(*)
      from careslink_v1_generation.communication_note_point_admissions
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.point_reservations
      where status = 'RESERVED' and points = 20
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.point_ledger_entries
      where event = 'RESERVE' and points = 20 and delta = -20
    ) <> 2
    or (
      select pg_catalog.sum(allocation.points)
      from public.point_reservation_allocations as allocation
    ) is distinct from 40::pg_catalog.int8
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
    ) is distinct from 20::pg_catalog.int8
    or (
      select result->'created' from a21_results
      where scenario = 'owner-a-second'
    ) is distinct from 'true'::pg_catalog.jsonb
  then
    raise exception 'A21 two sequential admissions in one transaction drifted';
  end if;
end
$careslink_v1_communication_points_two_in_one_transaction$;

-- Compact TEST_ONLY caller used by the remaining serial matrix. It is an
-- invoker-rights wrapper around the exact private coordinator, not a product
-- surface, and disappears with the outer rollback.
create function pg_temp.a21_admit(
  p_owner_user_id pg_catalog.uuid,
  p_session_id pg_catalog.uuid,
  p_job_id pg_catalog.uuid,
  p_payload_id pg_catalog.uuid,
  p_privacy_review_id pg_catalog.uuid,
  p_idempotency_hash pg_catalog.text,
  p_request_hash pg_catalog.text,
  p_payload_handle_hash pg_catalog.text
)
returns pg_catalog.jsonb
language sql
volatile
set search_path = ''
as $a21_admit$
  select
    careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
      p_owner_user_id,
      p_session_id,
      'BEARER',
      p_job_id,
      p_payload_id,
      p_privacy_review_id,
      'en',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow',
      pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
      p_idempotency_hash,
      p_request_hash,
      p_payload_handle_hash,
      pg_catalog.current_setting(
        'careslink.assert.a21.payload_expires_at'
      )::pg_catalog.timestamptz
    )
$a21_admit$;

grant execute on function pg_temp.a21_admit(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid,
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text
) to careslink_v1_generation_owner_api_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_failure_matrix$
declare
  v_expired_session pg_catalog.bool := false;
  v_stale_privacy pg_catalog.bool := false;
  v_walletless pg_catalog.bool := false;
  v_suspended pg_catalog.bool := false;
  v_nineteen_points pg_catalog.bool := false;
begin
  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000099',
      'a2130000-0000-4000-8000-000000000091',
      'a2150000-0000-4000-8000-000000000091',
      'a2120000-0000-4000-8000-000000000001',
      pg_catalog.repeat('3', 64), pg_catalog.repeat('3', 64),
      pg_catalog.repeat('3', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'SESSION_REVOKED' then
      v_expired_session := true;
    else
      raise;
    end if;
  end;

  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000092',
      'a2150000-0000-4000-8000-000000000092',
      'a2120000-0000-4000-8000-000000000099',
      pg_catalog.repeat('4', 64), pg_catalog.repeat('4', 64),
      pg_catalog.repeat('4', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRIVACY_REVIEW_STALE' then
      v_stale_privacy := true;
    else
      raise;
    end if;
  end;

  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000002',
      'a2110000-0000-4000-8000-000000000002',
      'a2130000-0000-4000-8000-000000000101',
      'a2150000-0000-4000-8000-000000000101',
      'a2120000-0000-4000-8000-000000000002',
      pg_catalog.repeat('5', 64), pg_catalog.repeat('5', 64),
      pg_catalog.repeat('5', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POINTS_INSUFFICIENT' then
      v_walletless := true;
    else
      raise;
    end if;
  end;

  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000003',
      'a2110000-0000-4000-8000-000000000003',
      'a2130000-0000-4000-8000-000000000201',
      'a2150000-0000-4000-8000-000000000201',
      'a2120000-0000-4000-8000-000000000003',
      pg_catalog.repeat('6', 64), pg_catalog.repeat('6', 64),
      pg_catalog.repeat('6', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POINTS_INSUFFICIENT' then
      v_suspended := true;
    else
      raise;
    end if;
  end;

  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000004',
      'a2110000-0000-4000-8000-000000000004',
      'a2130000-0000-4000-8000-000000000301',
      'a2150000-0000-4000-8000-000000000301',
      'a2120000-0000-4000-8000-000000000004',
      pg_catalog.repeat('7', 64), pg_catalog.repeat('7', 64),
      pg_catalog.repeat('7', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POINTS_INSUFFICIENT' then
      v_nineteen_points := true;
    else
      raise;
    end if;
  end;

  if not v_expired_session
    or not v_stale_privacy
    or not v_walletless
    or not v_suspended
    or not v_nineteen_points
  then
    raise exception 'A21 serial failure matrix did not fail closed';
  end if;
end
$careslink_v1_communication_points_failure_matrix$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_points_admission_executor;
do $careslink_v1_communication_points_failure_rollback$
begin
  perform careslink_v1_generation._set_owner(
    'a2100000-0000-4000-8000-000000000001'
  );
  if exists (
      select 1 from careslink_v1_generation.jobs
      where id in (
        'a2130000-0000-4000-8000-000000000091',
        'a2130000-0000-4000-8000-000000000092'
      )
    )
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
    ) is distinct from 20::pg_catalog.int8
  then
    raise exception 'A21 session/privacy failure left owner-A state';
  end if;

  perform careslink_v1_generation._set_owner(
    'a2100000-0000-4000-8000-000000000002'
  );
  if exists (select 1 from careslink_v1_generation.jobs)
    or exists (select 1 from careslink_v1_generation.payloads)
    or exists (
      select 1
      from careslink_v1_generation.communication_note_point_admissions
    )
    or exists (select 1 from public.point_quotes)
    or exists (select 1 from public.point_reservations)
  then
    raise exception 'A21 walletless failure left partial state';
  end if;

  perform careslink_v1_generation._set_owner(
    'a2100000-0000-4000-8000-000000000003'
  );
  if exists (select 1 from careslink_v1_generation.jobs)
    or exists (select 1 from public.point_quotes)
    or exists (select 1 from public.point_reservations)
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
    ) is distinct from 40::pg_catalog.int8
  then
    raise exception 'A21 suspended-wallet failure left partial state';
  end if;

  perform careslink_v1_generation._set_owner(
    'a2100000-0000-4000-8000-000000000004'
  );
  if exists (select 1 from careslink_v1_generation.jobs)
    or exists (select 1 from public.point_quotes)
    or exists (select 1 from public.point_reservations)
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
    ) is distinct from 19::pg_catalog.int8
  then
    raise exception 'A21 19-Point failure left partial state';
  end if;
end
$careslink_v1_communication_points_failure_rollback$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Serial 30-Point oversubscription evidence only: one different-key 20-Point
-- admission succeeds, the next fails, and exactly 10 Points remain. This does
-- not claim a concurrent oversubscription result.
set local role careslink_v1_generation_owner_api_executor;
insert into a21_results (scenario, result)
values (
  'owner-e-first',
  pg_temp.a21_admit(
    'a2100000-0000-4000-8000-000000000005',
    'a2110000-0000-4000-8000-000000000005',
    'a2130000-0000-4000-8000-000000000401',
    'a2150000-0000-4000-8000-000000000401',
    'a2120000-0000-4000-8000-000000000005',
    pg_catalog.repeat('8', 64), pg_catalog.repeat('8', 64),
    pg_catalog.repeat('8', 64)
  )
);
do $careslink_v1_communication_points_serial_oversubscription$
declare
  v_failed pg_catalog.bool := false;
begin
  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000005',
      'a2110000-0000-4000-8000-000000000005',
      'a2130000-0000-4000-8000-000000000402',
      'a2150000-0000-4000-8000-000000000402',
      'a2120000-0000-4000-8000-000000000005',
      pg_catalog.repeat('9', 64), pg_catalog.repeat('9', 64),
      pg_catalog.repeat('9', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'POINTS_INSUFFICIENT' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'A21 serial 30-Point second admission did not fail';
  end if;
end
$careslink_v1_communication_points_serial_oversubscription$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_points_admission_executor;
select careslink_v1_generation._set_owner(
  'a2100000-0000-4000-8000-000000000005'
);
do $careslink_v1_communication_points_serial_oversubscription_state$
begin
  if (
      select pg_catalog.count(*)
      from careslink_v1_generation.communication_note_point_admissions
    ) <> 1
    or (
      select pg_catalog.count(*)
      from public.point_ledger_entries
      where event = 'RESERVE'
    ) <> 1
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
    ) is distinct from 10::pg_catalog.int8
    or exists (
      select 1 from careslink_v1_generation.jobs
      where id = 'a2130000-0000-4000-8000-000000000402'
    )
  then
    raise exception 'A21 serial 30-Point state drifted';
  end if;
end
$careslink_v1_communication_points_serial_oversubscription_state$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Capability and fixed-rate failures occur before any committed debit.
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.settings no force row level security;
update careslink_v1_generation.settings
set enabled = false
where capability = 'note_generation_v1';
alter table careslink_v1_generation.settings force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_disabled$
declare
  v_failed pg_catalog.bool := false;
begin
  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000093',
      'a2150000-0000-4000-8000-000000000093',
      'a2120000-0000-4000-8000-000000000001',
      pg_catalog.repeat('d', 64), pg_catalog.repeat('d', 64),
      pg_catalog.repeat('d', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'A21 disabled capability admitted a job';
  end if;
end
$careslink_v1_communication_points_disabled$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.settings no force row level security;
update careslink_v1_generation.settings
set enabled = true
where capability = 'note_generation_v1';
alter table careslink_v1_generation.settings force row level security;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

update public.service_rates
set points = 21
where catalog_version = '2026-08-09.v1-shadow'
  and service_code = 'note.communication.generate';
set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_rate_mismatch$
declare
  v_failed pg_catalog.bool := false;
begin
  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000094',
      'a2150000-0000-4000-8000-000000000094',
      'a2120000-0000-4000-8000-000000000001',
      pg_catalog.repeat('e', 64), pg_catalog.repeat('e', 64),
      pg_catalog.repeat('e', 64)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'A21 21-Point rate mismatch admitted a job';
  end if;
end
$careslink_v1_communication_points_rate_mismatch$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
update public.service_rates
set points = 20
where catalog_version = '2026-08-09.v1-shadow'
  and service_code = 'note.communication.generate';

set local role careslink_v1_generation_points_admission_executor;
select careslink_v1_generation._set_owner(
  'a2100000-0000-4000-8000-000000000001'
);
do $careslink_v1_communication_points_policy_rate_rollback$
begin
  if exists (
      select 1 from careslink_v1_generation.jobs
      where id in (
        'a2130000-0000-4000-8000-000000000093',
        'a2130000-0000-4000-8000-000000000094'
      )
    )
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.communication_note_point_admissions
    ) <> 2
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
    ) is distinct from 20::pg_catalog.int8
  then
    raise exception 'A21 policy/rate denial left partial state';
  end if;
end
$careslink_v1_communication_points_policy_rate_rollback$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
select pg_catalog.set_config(
  'careslink.assert.a21.paid_reservation_id',
  (
    select reservation.id::pg_catalog.text
    from public.point_reservations as reservation
    where reservation.owner_user_id =
        'a2100000-0000-4000-8000-000000000001'
      and reservation.idempotency_key =
        'communication-admission:' || pg_catalog.repeat('1', 64)
  ),
  true
);

-- Both historical service_role-only terminal RPCs must hit the new bound
-- reservation guard. release_shadow_points mutates lots before reservation;
-- its failure therefore also proves statement-level rollback of those writes.
set local role service_role;
do $careslink_v1_communication_points_paid_terminal_quarantine$
declare
  v_commit_denied pg_catalog.bool := false;
  v_release_denied pg_catalog.bool := false;
begin
  begin
    perform public.commit_shadow_points(
      'a2100000-0000-4000-8000-000000000001',
      pg_catalog.current_setting(
        'careslink.assert.a21.paid_reservation_id'
      )::pg_catalog.uuid,
      'TEST_A21_PAID_COMMIT',
      pg_catalog.clock_timestamp()
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_commit_denied := true;
    else
      raise;
    end if;
  end;

  begin
    perform public.release_shadow_points(
      'a2100000-0000-4000-8000-000000000001',
      pg_catalog.current_setting(
        'careslink.assert.a21.paid_reservation_id'
      )::pg_catalog.uuid,
      'TEST_A21_PAID_RELEASE',
      'RELEASE',
      pg_catalog.clock_timestamp()
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_release_denied := true;
    else
      raise;
    end if;
  end;

  if not v_commit_denied or not v_release_denied then
    raise exception 'A21 paid Points terminal RPC quarantine drifted';
  end if;
end
$careslink_v1_communication_points_paid_terminal_quarantine$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- OLD identity must drive the guard even for a privileged simultaneous
-- owner/id/status mutation; DELETE must fail with the same fixed product code.
do $careslink_v1_communication_points_direct_reservation_guard$
declare
  v_update_denied pg_catalog.bool := false;
  v_delete_denied pg_catalog.bool := false;
begin
  begin
    update public.point_reservations as reservation
    set owner_user_id = 'a2100000-0000-4000-8000-000000000006',
        status = 'COMMITTED',
        result_ref = 'TEST_A21_DIRECT_MUTATION',
        terminal_at = pg_catalog.clock_timestamp()
    where reservation.id = pg_catalog.current_setting(
      'careslink.assert.a21.paid_reservation_id'
    )::pg_catalog.uuid;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_update_denied := true;
    else
      raise;
    end if;
  end;

  begin
    delete from public.point_reservations as reservation
    where reservation.id = pg_catalog.current_setting(
      'careslink.assert.a21.paid_reservation_id'
    )::pg_catalog.uuid;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_delete_denied := true;
    else
      raise;
    end if;
  end;

  if not v_update_denied or not v_delete_denied then
    raise exception 'A21 paid reservation direct guard drifted';
  end if;
end
$careslink_v1_communication_points_direct_reservation_guard$;

set local role careslink_v1_generation_points_admission_executor;
select careslink_v1_generation._set_owner(
  'a2100000-0000-4000-8000-000000000001'
);
do $careslink_v1_communication_points_paid_terminal_state$
begin
  if (
      select pg_catalog.count(*)
      from public.point_reservations
      where status = 'RESERVED'
    ) <> 2
    or exists (
      select 1
      from public.point_ledger_entries
      where event in ('COMMIT', 'RELEASE', 'EXPIRE')
    )
    or (
      select pg_catalog.count(*)
      from public.point_ledger_entries
      where event = 'RESERVE'
    ) <> 2
    or (
      select pg_catalog.sum(lot.remaining_points)
      from public.point_lots as lot
    ) is distinct from 20::pg_catalog.int8
  then
    raise exception 'A21 paid terminal denial was not atomic';
  end if;
end
$careslink_v1_communication_points_paid_terminal_state$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Unbound legacy Points transitions remain successful and the reservation
-- trigger restores the caller's pre-existing private owner GUC after each
-- UPDATE. This covers both COMMIT and RELEASE paths.
select pg_catalog.set_config(
  'careslink.v1_generation_owner_user_id',
  'a2100000-0000-4000-8000-000000000005',
  true
);
set local role service_role;
do $careslink_v1_communication_points_legacy_terminal_non_regression$
declare
  v_now pg_catalog.timestamptz := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  v_before pg_catalog.text := pg_catalog.current_setting(
    'careslink.v1_generation_owner_user_id', true
  );
  v_quote pg_catalog.jsonb;
  v_reservation pg_catalog.jsonb;
  v_terminal pg_catalog.jsonb;
begin
  v_quote := public.create_shadow_point_quote(
    'a2100000-0000-4000-8000-000000000006',
    'content.explain', 'TEST_A21_LEGACY_QUOTE_COMMIT', 1, null, v_now
  );
  v_reservation := public.reserve_shadow_points(
    'a2100000-0000-4000-8000-000000000006',
    (v_quote->>'id')::pg_catalog.uuid,
    'TEST_A21_LEGACY_RESERVE_COMMIT', v_now
  );
  v_terminal := public.commit_shadow_points(
    'a2100000-0000-4000-8000-000000000006',
    (v_reservation->>'id')::pg_catalog.uuid,
    'TEST_A21_LEGACY_RESULT', v_now + interval '1 millisecond'
  );
  if v_terminal->>'status' is distinct from 'COMMITTED'
    or pg_catalog.current_setting(
      'careslink.v1_generation_owner_user_id', true
    ) is distinct from v_before
  then
    raise exception 'A21 legacy COMMIT or owner-GUC restoration drifted';
  end if;

  v_quote := public.create_shadow_point_quote(
    'a2100000-0000-4000-8000-000000000006',
    'content.explain', 'TEST_A21_LEGACY_QUOTE_RELEASE', 1, null,
    v_now + interval '2 milliseconds'
  );
  v_reservation := public.reserve_shadow_points(
    'a2100000-0000-4000-8000-000000000006',
    (v_quote->>'id')::pg_catalog.uuid,
    'TEST_A21_LEGACY_RESERVE_RELEASE',
    v_now + interval '2 milliseconds'
  );
  v_terminal := public.release_shadow_points(
    'a2100000-0000-4000-8000-000000000006',
    (v_reservation->>'id')::pg_catalog.uuid,
    'TEST_A21_LEGACY_RELEASE', 'RELEASE',
    v_now + interval '3 milliseconds'
  );
  if v_terminal->>'status' is distinct from 'RELEASED'
    or pg_catalog.current_setting(
      'careslink.v1_generation_owner_user_id', true
    ) is distinct from v_before
  then
    raise exception 'A21 legacy RELEASE or owner-GUC restoration drifted';
  end if;
end
$careslink_v1_communication_points_legacy_terminal_non_regression$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
select pg_catalog.set_config(
  'careslink.v1_generation_owner_user_id',
  '',
  true
);

-- Existing authenticated owner policies intentionally expose the owner's
-- Points quote/reservation/allocation/ledger IDs. The private job-to-Points
-- binding remains inaccessible; A21 does not claim database-level ID secrecy.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2100000-0000-4000-8000-000000000001","session_id":"a2110000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_communication_points_owner_visible_ids$
declare
  v_private_denied pg_catalog.bool := false;
begin
  if (
      select pg_catalog.count(*)
      from public.point_quotes
      where owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.point_reservations
      where owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.point_reservation_allocations
      where owner_user_id = 'a2100000-0000-4000-8000-000000000001'
    ) < 2
    or (
      select pg_catalog.count(*)
      from public.point_ledger_entries
      where owner_user_id = 'a2100000-0000-4000-8000-000000000001'
        and event = 'RESERVE'
    ) <> 2
  then
    raise exception 'A21 authenticated owner Points visibility drifted';
  end if;

  begin
    perform 1
    from careslink_v1_generation.communication_note_point_admissions;
  exception when insufficient_privilege then
    v_private_denied := true;
  end;
  if not v_private_denied then
    raise exception 'A21 private binding became authenticated-readable';
  end if;
end
$careslink_v1_communication_points_owner_visible_ids$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Legacy owner cancel cannot strand the reservation after changing payload
-- state: the paid job marker status guard rejects it and the statement rolls
-- the preceding payload mutation back.
set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_cancel_quarantine$
declare
  v_denied pg_catalog.bool := false;
begin
  begin
    perform careslink_v1_generation.cancel_v1_shadow_note_generation_job(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000001',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_denied := true;
    else
      raise;
    end if;
  end;
  if not v_denied then
    raise exception 'A21 legacy cancel changed a paid job';
  end if;
end
$careslink_v1_communication_points_cancel_quarantine$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_points_admission_executor;
select careslink_v1_generation._set_owner(
  'a2100000-0000-4000-8000-000000000001'
);
do $careslink_v1_communication_points_cancel_state$
begin
  if not exists (
      select 1
      from careslink_v1_generation.jobs as job
      join careslink_v1_generation.payloads as payload
        on payload.id = job.payload_id
       and payload.job_id = job.id
       and payload.owner_user_id = job.owner_user_id
      where job.id = 'a2130000-0000-4000-8000-000000000001'
        and job.status = 'QUEUED'
        and payload.state = 'AVAILABLE'
    )
    or not exists (
      select 1
      from public.point_reservations
      where id = pg_catalog.current_setting(
        'careslink.assert.a21.paid_reservation_id'
      )::pg_catalog.uuid
        and status = 'RESERVED'
    )
    or (
      select pg_catalog.count(*)
      from public.point_ledger_entries
      where event = 'RESERVE'
    ) <> 2
  then
    raise exception 'A21 legacy cancel denial was not atomic';
  end if;
end
$careslink_v1_communication_points_cancel_state$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Paid work is invisible to claim, and every direct attempt status is denied.
set local role careslink_v1_generation_executor;
do $careslink_v1_communication_points_worker_quarantine$
declare
  v_claim pg_catalog.jsonb;
  v_attempt_denied pg_catalog.bool := false;
  v_now pg_catalog.timestamptz := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
begin
  v_claim := careslink_v1_generation.claim_v1_shadow_note_generation_job(
    pg_catalog.current_setting('careslink.assert.a21.registration_digest'),
    'worker.a21.test.v1',
    pg_catalog.current_setting('careslink.assert.a21.worker_policy_digest'),
    pg_catalog.current_setting('careslink.assert.a21.worker_identity_hash'),
    '1.0.0-shadow.1',
    '2026-08-09.v1-shadow'
  );
  if v_claim is distinct from pg_catalog.jsonb_build_object(
    'status', 'IDLE', 'claim', null
  ) then
    raise exception 'A21 worker claimed a paid job';
  end if;

  begin
    insert into careslink_v1_generation.attempts (
      id, job_id, owner_user_id, attempt_number, status,
      worker_identity_hash, registration_digest, lease_token_hash,
      acquired_at, last_heartbeat_at, lease_expires_at, failure_reason,
      finished_at, created_at, shadow_only, terminal_transaction_id
    ) values (
      'a2160000-0000-4000-8000-000000000090',
      'a2130000-0000-4000-8000-000000000001',
      'a2100000-0000-4000-8000-000000000001',
      1, 'FAILED',
      pg_catalog.current_setting(
        'careslink.assert.a21.worker_identity_hash'
      ),
      pg_catalog.current_setting(
        'careslink.assert.a21.registration_digest'
      ),
      pg_catalog.repeat('f', 64),
      v_now, v_now, v_now + interval '1 millisecond',
      'PAYLOAD_UNAVAILABLE', v_now, v_now, true,
      'a2170000-0000-4000-8000-000000000090'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'PRODUCT_API_DISABLED' then
      v_attempt_denied := true;
    else
      raise;
    end if;
  end;
  if not v_attempt_denied then
    raise exception 'A21 direct FAILED attempt reached a paid job';
  end if;
end
$careslink_v1_communication_points_worker_quarantine$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);

-- Create one deliberately unpaid legacy job, age it and one paid job beyond
-- max queue age, then prove recovery skips paid state while recovering the
-- unpaid candidate in the same bounded call. A savepoint restores the paid
-- job timestamps after the proof so later replay assertions see canonical
-- owner-response timestamps.
savepoint a21_recovery_quarantine;
set local role careslink_v1_generation_owner_api_executor;
insert into a21_results (scenario, result)
values (
  'owner-a-unpaid-recovery-candidate',
  careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
    'a2100000-0000-4000-8000-000000000001',
    'a2110000-0000-4000-8000-000000000001',
    'BEARER',
    'a2130000-0000-4000-8000-000000000080',
    'a2150000-0000-4000-8000-000000000080',
    'a2120000-0000-4000-8000-000000000001',
    'communication', 'en', '1.0.0-shadow.1',
    '2026-08-09.v1-shadow',
    pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
    pg_catalog.repeat('b', 64), pg_catalog.repeat('b', 64),
    pg_catalog.repeat('b', 64),
    pg_catalog.current_setting(
      'careslink.assert.a21.payload_expires_at'
    )::pg_catalog.timestamptz
  )
);

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_executor;
update careslink_v1_generation.jobs
set created_at = created_at - interval '20 minutes'
where id in (
  'a2130000-0000-4000-8000-000000000001',
  'a2130000-0000-4000-8000-000000000080'
);
update careslink_v1_generation.payloads
set created_at = created_at - interval '20 minutes'
where job_id in (
  'a2130000-0000-4000-8000-000000000001',
  'a2130000-0000-4000-8000-000000000080'
);
insert into a21_results (scenario, result)
values (
  'recovery-paid-skip-unpaid-progress',
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    pg_catalog.current_setting('careslink.assert.a21.registration_digest'),
    'worker.a21.test.v1',
    pg_catalog.current_setting('careslink.assert.a21.worker_policy_digest'),
    pg_catalog.current_setting('careslink.assert.a21.worker_identity_hash'),
    '1.0.0-shadow.1',
    '2026-08-09.v1-shadow'
  )
);

do $careslink_v1_communication_points_recovery_quarantine$
declare
  v_result pg_catalog.jsonb := (
    select result from a21_results
    where scenario = 'recovery-paid-skip-unpaid-progress'
  );
begin
  if v_result is distinct from pg_catalog.jsonb_build_object(
      'recovered', 1, 'requeued', 0, 'failed', 1
    )
    or not exists (
      select 1
      from careslink_v1_generation.jobs as job
      join careslink_v1_generation.payloads as payload
        on payload.id = job.payload_id
       and payload.job_id = job.id
       and payload.owner_user_id = job.owner_user_id
      where job.id = 'a2130000-0000-4000-8000-000000000001'
        and job.status = 'QUEUED'
        and job.communication_note_point_admission_id is not null
        and payload.state = 'AVAILABLE'
    )
    or exists (
      select 1 from careslink_v1_generation.attempts
      where job_id = 'a2130000-0000-4000-8000-000000000001'
    )
    or not exists (
      select 1
      from careslink_v1_generation.jobs as job
      join careslink_v1_generation.attempts as attempt
        on attempt.job_id = job.id
       and attempt.owner_user_id = job.owner_user_id
      where job.id = 'a2130000-0000-4000-8000-000000000080'
        and job.status = 'FAILED'
        and job.failure_reason = 'PAYLOAD_UNAVAILABLE'
        and job.communication_note_point_admission_id is null
        and attempt.status = 'FAILED'
        and attempt.failure_reason = 'PAYLOAD_UNAVAILABLE'
    )
  then
    raise exception 'A21 paid recovery quarantine or unpaid progress drifted';
  end if;
end
$careslink_v1_communication_points_recovery_quarantine$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
rollback to savepoint a21_recovery_quarantine;
release savepoint a21_recovery_quarantine;

-- Replay must re-prove the exact 20-Point allocation aggregate. The temporary
-- corruption is isolated by a savepoint and cannot survive this assertion.
savepoint a21_replay_integrity_tamper;
update public.point_reservation_allocations as allocation
set points = allocation.points - 1
where allocation.reservation_id = pg_catalog.current_setting(
    'careslink.assert.a21.paid_reservation_id'
  )::pg_catalog.uuid;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_replay_tamper$
declare
  v_denied pg_catalog.bool := false;
begin
  begin
    perform
      careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
        'a2100000-0000-4000-8000-000000000001',
        'a2110000-0000-4000-8000-000000000001', 'BEARER',
        'a2130000-0000-4000-8000-000000000001',
        'a2150000-0000-4000-8000-000000000001',
        'a2120000-0000-4000-8000-000000000001',
        'en', '1.0.0-shadow.1', '2026-08-09.v1-shadow',
        pg_catalog.current_setting('careslink.assert.a21.facts_hash'),
        pg_catalog.repeat('1', 64), pg_catalog.repeat('a', 64),
        pg_catalog.repeat('b', 64),
        pg_catalog.current_setting(
          'careslink.assert.a21.payload_expires_at'
        )::pg_catalog.timestamptz
      );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IDENTITY_LINK_CONFLICT' then
      v_denied := true;
    else
      raise;
    end if;
  end;
  if not v_denied then
    raise exception 'A21 replay accepted a 19-Point allocation aggregate';
  end if;
end
$careslink_v1_communication_points_replay_tamper$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
rollback to savepoint a21_replay_integrity_tamper;
release savepoint a21_replay_integrity_tamper;

do $careslink_v1_communication_points_replay_tamper_rollback$
begin
  if (
    select pg_catalog.sum(allocation.points)
    from public.point_reservation_allocations as allocation
    where allocation.reservation_id = pg_catalog.current_setting(
        'careslink.assert.a21.paid_reservation_id'
      )::pg_catalog.uuid
  ) is distinct from 20::pg_catalog.int8
  then
    raise exception 'A21 replay-integrity savepoint did not restore allocation';
  end if;
end
$careslink_v1_communication_points_replay_tamper_rollback$;

-- Fault-substitute the trusted durable admission helper with SQL NULL. The
-- public coordinator must map the malformed envelope to its fixed error and
-- expose neither a raw cast failure nor partial durable/Points state.
savepoint a21_null_admission_envelope;
grant create on schema careslink_v1_generation
  to careslink_v1_generation_owner_api_executor;
set local role careslink_v1_generation_owner_api_executor;
create or replace function
  careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
    p_owner_user_id pg_catalog.uuid,
    p_session_id pg_catalog.uuid,
    p_admission_transport pg_catalog.text,
    p_job_id pg_catalog.uuid,
    p_payload_id pg_catalog.uuid,
    p_privacy_review_id pg_catalog.uuid,
    p_note_type pg_catalog.text,
    p_source_locale pg_catalog.text,
    p_contract_version pg_catalog.text,
    p_schema_version pg_catalog.text,
    p_cleaned_facts_hash pg_catalog.text,
    p_idempotency_hash pg_catalog.text,
    p_request_hash pg_catalog.text,
    p_payload_handle_hash pg_catalog.text,
    p_payload_expires_at pg_catalog.timestamptz
  )
returns pg_catalog.jsonb
language sql
volatile
security definer
set search_path = ''
as $a21_null_admission_envelope$
  select null::pg_catalog.jsonb
$a21_null_admission_envelope$;

do $careslink_v1_communication_points_null_admission_envelope$
declare
  v_denied pg_catalog.bool := false;
begin
  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000501',
      'a2150000-0000-4000-8000-000000000501',
      'a2120000-0000-4000-8000-000000000001',
      pg_catalog.repeat('1a', 32), pg_catalog.repeat('1b', 32),
      pg_catalog.repeat('1c', 32)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_denied := true;
    else
      raise;
    end if;
  end;
  if not v_denied then
    raise exception 'A21 coordinator accepted SQL NULL admission envelope';
  end if;
end
$careslink_v1_communication_points_null_admission_envelope$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
rollback to savepoint a21_null_admission_envelope;
release savepoint a21_null_admission_envelope;

-- SQL NULL from the trusted Points allocator must likewise fail closed after
-- durable admission, rolling that predecessor write back with the statement.
savepoint a21_null_points_envelope;
grant create on schema careslink_v1_generation
  to careslink_v1_generation_points_admission_executor;
set local role careslink_v1_generation_points_admission_executor;
create or replace function
  careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(
    p_owner_user_id pg_catalog.uuid,
    p_session_id pg_catalog.uuid,
    p_job_id pg_catalog.uuid,
    p_expect_new pg_catalog.bool
  )
returns pg_catalog.jsonb
language sql
volatile
security definer
set search_path = ''
as $a21_null_points_envelope$
  select null::pg_catalog.jsonb
$a21_null_points_envelope$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_null_points_envelope$
declare
  v_denied pg_catalog.bool := false;
begin
  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000502',
      'a2150000-0000-4000-8000-000000000502',
      'a2120000-0000-4000-8000-000000000001',
      pg_catalog.repeat('2a', 32), pg_catalog.repeat('2b', 32),
      pg_catalog.repeat('2c', 32)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_denied := true;
    else
      raise;
    end if;
  end;
  if not v_denied then
    raise exception 'A21 coordinator accepted SQL NULL Points envelope';
  end if;
end
$careslink_v1_communication_points_null_points_envelope$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
rollback to savepoint a21_null_points_envelope;
release savepoint a21_null_points_envelope;

-- Exact keys, types, booleans and canonical identifiers do not make a huge
-- numeric Points value valid. Direct JSONB comparison must reject it before
-- any cast can leak a PostgreSQL numeric error.
savepoint a21_huge_points_envelope;
grant create on schema careslink_v1_generation
  to careslink_v1_generation_points_admission_executor;
set local role careslink_v1_generation_points_admission_executor;
create or replace function
  careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(
    p_owner_user_id pg_catalog.uuid,
    p_session_id pg_catalog.uuid,
    p_job_id pg_catalog.uuid,
    p_expect_new pg_catalog.bool
  )
returns pg_catalog.jsonb
language sql
volatile
security definer
set search_path = ''
as $a21_huge_points_envelope$
  select pg_catalog.jsonb_build_object(
    'created', p_expect_new,
    'bindingId', 'a2180000-0000-4000-8000-000000000503',
    'quoteId', 'a2180000-0000-4000-8000-000000000504',
    'reservationId', 'a2180000-0000-4000-8000-000000000505',
    'points', 1e100::pg_catalog.numeric
  )
$a21_huge_points_envelope$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_huge_points_envelope$
declare
  v_denied pg_catalog.bool := false;
begin
  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000503',
      'a2150000-0000-4000-8000-000000000503',
      'a2120000-0000-4000-8000-000000000001',
      pg_catalog.repeat('3a', 32), pg_catalog.repeat('3b', 32),
      pg_catalog.repeat('3c', 32)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_denied := true;
    else
      raise;
    end if;
  end;
  if not v_denied then
    raise exception 'A21 coordinator accepted huge Points numeric';
  end if;
end
$careslink_v1_communication_points_huge_points_envelope$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
rollback to savepoint a21_huge_points_envelope;
release savepoint a21_huge_points_envelope;

-- Fractional numeric Points are the final malformed trusted-helper probe.
savepoint a21_fractional_points_envelope;
grant create on schema careslink_v1_generation
  to careslink_v1_generation_points_admission_executor;
set local role careslink_v1_generation_points_admission_executor;
create or replace function
  careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(
    p_owner_user_id pg_catalog.uuid,
    p_session_id pg_catalog.uuid,
    p_job_id pg_catalog.uuid,
    p_expect_new pg_catalog.bool
  )
returns pg_catalog.jsonb
language sql
volatile
security definer
set search_path = ''
as $a21_fractional_points_envelope$
  select pg_catalog.jsonb_build_object(
    'created', p_expect_new,
    'bindingId', 'a2180000-0000-4000-8000-000000000506',
    'quoteId', 'a2180000-0000-4000-8000-000000000507',
    'reservationId', 'a2180000-0000-4000-8000-000000000508',
    'points', 20.5::pg_catalog.numeric
  )
$a21_fractional_points_envelope$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
set local role careslink_v1_generation_owner_api_executor;
do $careslink_v1_communication_points_fractional_points_envelope$
declare
  v_denied pg_catalog.bool := false;
begin
  begin
    perform pg_temp.a21_admit(
      'a2100000-0000-4000-8000-000000000001',
      'a2110000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000504',
      'a2150000-0000-4000-8000-000000000504',
      'a2120000-0000-4000-8000-000000000001',
      pg_catalog.repeat('4a', 32), pg_catalog.repeat('4b', 32),
      pg_catalog.repeat('4c', 32)
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'INTERNAL_FAILURE' then
      v_denied := true;
    else
      raise;
    end if;
  end;
  if not v_denied then
    raise exception 'A21 coordinator accepted fractional Points numeric';
  end if;
end
$careslink_v1_communication_points_fractional_points_envelope$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.assertion_entry_role'),
  false
);
rollback to savepoint a21_fractional_points_envelope;
release savepoint a21_fractional_points_envelope;

-- Every malformed-helper statement above must have rolled durable admission
-- back, and the two predecessor account-credit relations must remain identical
-- to their ordered full-row post-fixture baselines.
do $careslink_v1_communication_points_final_rollback_evidence$
declare
  v_mismatches pg_catalog.int8;
begin
  if exists (
      select 1
      from careslink_v1_generation.jobs as job
      where job.id in (
        'a2130000-0000-4000-8000-000000000501',
        'a2130000-0000-4000-8000-000000000502',
        'a2130000-0000-4000-8000-000000000503',
        'a2130000-0000-4000-8000-000000000504'
      )
    )
    or exists (
      select 1
      from careslink_v1_generation.payloads as payload
      where payload.id in (
        'a2150000-0000-4000-8000-000000000501',
        'a2150000-0000-4000-8000-000000000502',
        'a2150000-0000-4000-8000-000000000503',
        'a2150000-0000-4000-8000-000000000504'
      )
    )
  then
    raise exception 'A21 malformed helper left durable state';
  end if;

  with current_state as (
    select 'account_entitlements'::pg_catalog.text as relation_name,
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(entitlement) order by
          entitlement.id),
        '[]'::pg_catalog.jsonb
      ) as rows_json
    from public.account_entitlements as entitlement
    union all
    select 'credit_ledger', coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(credit) order by credit.id),
      '[]'::pg_catalog.jsonb
    )
    from public.credit_ledger as credit
  )
  select pg_catalog.count(*)
  into v_mismatches
  from current_state
  join a21_snapshots as snapshot
    on snapshot.scenario = 'legacy-baseline'
   and snapshot.relation_name = current_state.relation_name
  where snapshot.rows_json is distinct from current_state.rows_json;

  if v_mismatches <> 0 then
    raise exception 'A21 predecessor account-credit rows changed';
  end if;
end
$careslink_v1_communication_points_final_rollback_evidence$;

-- Remove every assertion-only SET edge explicitly, then let the mandatory
-- outer rollback independently prove that no fixture or membership survives.
revoke authenticated from current_user granted by current_user;
revoke service_role from current_user granted by current_user;
revoke careslink_v1_generation_points_admission_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_owner_api_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_owner from current_user
  granted by current_user;

do $careslink_v1_communication_points_assertion_edges_revoked$
begin
  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    where membership.member = current_user::pg_catalog.regrole
      and membership.roleid in (
        'authenticated'::pg_catalog.regrole,
        'service_role'::pg_catalog.regrole,
        'careslink_v1_generation_points_admission_executor'::pg_catalog.regrole,
        'careslink_v1_generation_owner_api_executor'::pg_catalog.regrole,
        'careslink_v1_generation_executor'::pg_catalog.regrole,
        'careslink_v1_generation_owner'::pg_catalog.regrole
      )
  ) then
    raise exception 'A21 assertion-only SET edge survived explicit revoke';
  end if;
end
$careslink_v1_communication_points_assertion_edges_revoked$;

rollback;

-- Read-only proof after the rollback: neither the six temporary memberships
-- nor any synthetic A21 owner row can exist outside the assertion transaction.
do $careslink_v1_communication_points_outer_rollback$
begin
  if exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.member = current_user::pg_catalog.regrole
        and membership.roleid in (
          'authenticated'::pg_catalog.regrole,
          'service_role'::pg_catalog.regrole,
          'careslink_v1_generation_points_admission_executor'::pg_catalog.regrole,
          'careslink_v1_generation_owner_api_executor'::pg_catalog.regrole,
          'careslink_v1_generation_executor'::pg_catalog.regrole,
          'careslink_v1_generation_owner'::pg_catalog.regrole
        )
    )
    or exists (
      select 1
      from auth.users as auth_user
      where auth_user.id between
        'a2100000-0000-4000-8000-000000000001'::pg_catalog.uuid
        and 'a2100000-0000-4000-8000-000000000006'::pg_catalog.uuid
    )
    or pg_catalog.to_regclass('pg_temp.a21_results') is not null
  then
    raise exception 'A21 outer rollback left test-only state';
  end if;
end
$careslink_v1_communication_points_outer_rollback$;
