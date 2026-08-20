-- Manual rollback-only assertions for a fresh disposable Preview database.
-- This file is not executed by pnpm test. A 2026-08-21 PostgreSQL 17 r2 run
-- reached the constraint-catalog check and rolled back after
-- information_schema exposed generated NOT NULL constraint names.
-- This pg_constraint-based revision has not yet been rerun on a fresh Preview.
-- Run it only after a clean apply of the exact migration revision. It verifies
-- the metadata schema foundation and does not prove SKIP LOCKED, worker RPCs or atomic canonical persistence.
-- Invoke it explicitly with psql; it intentionally lives outside
-- supabase/tests because it is not a pgTAP/supabase test db test file.

\set ON_ERROR_STOP on

begin;

do $$
begin
  if current_setting('server_version_num')::integer < 160000 then
    raise exception 'durable generation foundation requires PostgreSQL 16 or newer';
  end if;
end
$$;

do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_edge_count integer;
  v_distinct_roles integer;
  v_expected_edges integer;
  v_session_super boolean;
begin
  if v_schema is null
    or exists (
      select 1
      from pg_class as relation
      where relation.relnamespace = v_schema
        and relation.relname in ('settings', 'jobs', 'attempts')
        and (
          relation.relkind <> 'r'
          or not relation.relrowsecurity
          or not relation.relforcerowsecurity
        )
    )
    or (
      select count(*)
      from pg_class as relation
      where relation.relnamespace = v_schema
        and relation.relname in ('settings', 'jobs', 'attempts')
        and relation.relkind = 'r'
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ) <> 3
  then
    raise exception 'durable generation RLS posture is unsafe';
  end if;

  select role.rolsuper
  into v_session_super
  from pg_roles as role
  where role.oid = session_user::regrole;

  select
    count(*),
    count(distinct granted_role.rolname)
  into v_edge_count, v_distinct_roles
  from pg_auth_members as membership
  join pg_roles as granted_role on granted_role.oid = membership.roleid
  join pg_roles as member_role on member_role.oid = membership.member
  where granted_role.rolname in (
    'careslink_v1_generation_owner',
    'careslink_v1_generation_executor'
  )
    or member_role.rolname in (
      'careslink_v1_generation_owner',
      'careslink_v1_generation_executor'
    );

  v_expected_edges := case
    when current_setting('server_version_num')::integer >= 160000
      and not v_session_super then 2
    else 0
  end;

  if v_edge_count <> v_expected_edges
    or v_distinct_roles <> v_expected_edges
    or exists (
    select 1
    from pg_auth_members as membership
    join pg_roles as granted_role on granted_role.oid = membership.roleid
    join pg_roles as member_role on member_role.oid = membership.member
    join pg_roles as grantor_role on grantor_role.oid = membership.grantor
    where (
      granted_role.rolname in (
        'careslink_v1_generation_owner',
        'careslink_v1_generation_executor'
      )
      or member_role.rolname in (
        'careslink_v1_generation_owner',
        'careslink_v1_generation_executor'
      )
    )
      and not (
        granted_role.rolname in (
          'careslink_v1_generation_owner',
          'careslink_v1_generation_executor'
        )
        and member_role.oid = session_user::regrole
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
    raise exception 'unsafe durable generation role membership';
  end if;
end
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    'a0000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'durable-a@example.invalid', '',
    transaction_timestamp(), '{}'::jsonb, '{}'::jsonb,
    transaction_timestamp(), transaction_timestamp()
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'durable-b@example.invalid', '',
    transaction_timestamp(), '{}'::jsonb, '{}'::jsonb,
    transaction_timestamp(), transaction_timestamp()
  );

insert into public.privacy_reviews (
  id, owner_user_id, note_type, cleaned_facts_hash, schema_version,
  status, finding_decisions, confirmed_at, expires_at
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'communication', repeat('a', 64), '2026-08-09.v1-shadow',
  'CONFIRMED', '[]'::jsonb,
  transaction_timestamp() - interval '1 minute',
  transaction_timestamp() + interval '29 minutes'
);

-- Assertion-only access: this temporary membership and FORCE relaxation are
-- transaction-local test scaffolding, not migration or runtime permissions.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
set local role careslink_v1_generation_owner;
alter table careslink_v1_generation.settings no force row level security;
alter table careslink_v1_generation.jobs no force row level security;
alter table careslink_v1_generation.attempts no force row level security;

do $$
declare
  v_schema oid;
  v_actual text[];
  v_table text;
  v_role text;
  v_object_kind text;
  v_owner oid := 'careslink_v1_generation_owner'::regrole;
  v_effective_acl aclitem[];
begin
  select namespace.oid
  into v_schema
  from pg_namespace as namespace
  where namespace.nspname = 'careslink_v1_generation';

  if v_schema is null
    or (
      select owner.rolname
      from pg_namespace as namespace
      join pg_roles as owner on owner.oid = namespace.nspowner
      where namespace.oid = v_schema
    ) is distinct from 'careslink_v1_generation_owner'
  then
    raise exception 'durable generation schema scope drifted';
  end if;

  select array_agg(relation.relname::text order by relation.relname)
  into v_actual
  from pg_class as relation
  where relation.relnamespace = v_schema
    and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'f');

  if v_actual is distinct from array['attempts', 'jobs', 'settings']::text[]
    or exists (select 1 from pg_proc where pronamespace = v_schema)
    or exists (
      select 1
      from pg_policy as policy
      join pg_class as relation on relation.oid = policy.polrelid
      where relation.relnamespace = v_schema
    )
    or exists (
      select 1
      from pg_trigger as trigger
      join pg_class as relation on relation.oid = trigger.tgrelid
      where relation.relnamespace = v_schema
        and not trigger.tgisinternal
    )
  then
    raise exception 'durable generation schema scope drifted';
  end if;

  if (
    select count(*)
    from pg_roles as role
    where role.rolname in (
      'careslink_v1_generation_owner',
      'careslink_v1_generation_executor'
    )
      and not role.rolcanlogin
      and not role.rolsuper
      and not role.rolcreatedb
      and not role.rolcreaterole
      and not role.rolinherit
      and not role.rolreplication
      and not role.rolbypassrls
  ) <> 2 then
    raise exception 'durable generation role attributes are unsafe';
  end if;

  if (
    select count(*)
    from careslink_v1_generation.settings
  ) <> 1
    or not exists (
      select 1
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is false
        and shadow_only is true
        and updated_at >= created_at
    )
  then
    raise exception 'durable generation settings are not hard-off and unconfigured';
  end if;

  select array_agg(column_name::text order by ordinal_position)
  into v_actual
  from information_schema.columns
  where table_schema = 'careslink_v1_generation'
    and table_name = 'settings';

  if v_actual is distinct from array[
    'capability', 'enabled', 'shadow_only', 'created_at', 'updated_at'
  ]::text[] then
    raise exception 'durable generation settings are not hard-off and unconfigured';
  end if;

  foreach v_table in array array['settings', 'jobs', 'attempts'] loop
    if not exists (
      select 1
      from pg_class as relation
      where relation.relnamespace = v_schema
        and relation.relname = v_table
        and relation.relkind = 'r'
        and relation.relrowsecurity
        and not relation.relforcerowsecurity
        and relation.relowner = 'careslink_v1_generation_owner'::regrole
    ) then
      raise exception 'durable generation RLS posture is unsafe: %', v_table;
    end if;
  end loop;

  foreach v_role in array array[
    'anon',
    'authenticated',
    'service_role',
    'careslink_v1_generation_executor'
  ] loop
    if has_schema_privilege(v_role, 'careslink_v1_generation', 'USAGE')
      or has_schema_privilege(v_role, 'careslink_v1_generation', 'CREATE')
    then
      raise exception 'durable generation API or executor privilege leaked: % schema', v_role;
    end if;

    foreach v_table in array array['settings', 'jobs', 'attempts'] loop
      if has_table_privilege(
        v_role,
        'careslink_v1_generation.' || v_table,
        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      ) then
        raise exception 'durable generation API or executor privilege leaked: % %',
          v_role, v_table;
      end if;
    end loop;

    if exists (
      select 1
      from pg_type as object_type
      where object_type.typnamespace = v_schema
        and object_type.typname in ('settings', 'jobs', 'attempts')
        and has_type_privilege(v_role, object_type.oid, 'USAGE')
    ) then
      raise exception 'durable generation API or executor type privilege leaked: %',
        v_role;
    end if;
  end loop;

  foreach v_object_kind in array array['r', 'S', 'f', 'T'] loop
    select defaults.defaclacl
    into v_effective_acl
    from pg_default_acl as defaults
    where defaults.defaclrole = v_owner
      and defaults.defaclnamespace = 0
      and defaults.defaclobjtype = v_object_kind::"char";

    v_effective_acl := coalesce(
      v_effective_acl,
      acldefault(v_object_kind::"char", v_owner)
    );

    if exists (
      select 1
      from aclexplode(v_effective_acl) as acl
      left join pg_roles as grantee on grantee.oid = acl.grantee
      where acl.grantee = 0
        or grantee.rolname in (
          'anon',
          'authenticated',
          'service_role',
          'careslink_v1_generation_executor'
        )
    ) then
      raise exception 'durable generation owner default ACL leaked: %',
        v_object_kind;
    end if;
  end loop;

  if exists (
    select 1
    from pg_namespace as namespace
    cross join lateral aclexplode(
      coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) as acl
    where namespace.oid = v_schema
      and acl.grantee = 0
  )
    or exists (
      select 1
      from pg_class as relation
      cross join lateral aclexplode(
        coalesce(relation.relacl, acldefault('r', relation.relowner))
      ) as acl
      where relation.relnamespace = v_schema
        and relation.relkind = 'r'
        and acl.grantee = 0
    )
    or exists (
      select 1
      from pg_default_acl as defaults
      join pg_roles as owner on owner.oid = defaults.defaclrole
      cross join lateral aclexplode(defaults.defaclacl) as acl
      left join pg_roles as grantee on grantee.oid = acl.grantee
      where owner.rolname = 'careslink_v1_generation_owner'
        and (
          acl.grantee = 0
          or grantee.rolname in (
            'anon',
            'authenticated',
            'service_role',
            'careslink_v1_generation_executor'
          )
        )
    )
    or exists (
      select 1
      from pg_default_acl as defaults
      join pg_roles as owner on owner.oid = defaults.defaclrole
      where owner.rolname = 'careslink_v1_generation_owner'
        and defaults.defaclnamespace <> 0
    )
  then
    raise exception 'durable generation API or executor privilege leaked';
  end if;

  select array_agg(column_name::text order by ordinal_position)
  into v_actual
  from information_schema.columns
  where table_schema = 'careslink_v1_generation'
    and table_name = 'jobs';

  if v_actual is distinct from array[
    'id', 'owner_user_id', 'initiating_session_id', 'admission_transport',
    'payload_id', 'note_type', 'source_locale', 'service_code',
    'rate_catalog_version', 'contract_version', 'schema_version',
    'privacy_review_id', 'privacy_scanner_policy_version',
    'privacy_review_revision', 'cleaned_facts_hash', 'idempotency_hash',
    'request_hash', 'worker_policy_version', 'worker_policy_digest',
    'provider_policy_version', 'provider_policy_digest',
    'payload_policy_version', 'payload_policy_snapshot_hash', 'status',
    'attempt_count', 'next_eligible_at', 'failure_reason',
    'result_document_id', 'result_revision_id', 'result_content_hash',
    'created_at', 'updated_at', 'started_at', 'finished_at', 'shadow_only'
  ]::text[] then
    raise exception 'durable generation job column scope drifted';
  end if;

  select array_agg(column_name::text order by ordinal_position)
  into v_actual
  from information_schema.columns
  where table_schema = 'careslink_v1_generation'
    and table_name = 'attempts';

  if v_actual is distinct from array[
    'id', 'job_id', 'owner_user_id', 'attempt_number', 'status',
    'worker_identity_hash', 'registration_digest', 'lease_token_hash',
    'acquired_at', 'last_heartbeat_at', 'lease_expires_at',
    'payload_authorized_at', 'fence_id', 'fence_digest', 'fenced_at',
    'fence_expires_at', 'provider_evidence_hash', 'canonical_content_hash',
    'failure_reason', 'finished_at', 'created_at', 'shadow_only'
  ]::text[] then
    raise exception 'durable generation attempt column scope drifted';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'careslink_v1_generation'
      and (
        data_type in ('json', 'jsonb', 'bytea')
        or column_name in (
          'cleaned_facts', 'facts', 'provider_output', 'provider_candidate',
          'content', 'transcript', 'payload_locator', 'payload_handle',
          'vault_locator', 'authorization', 'access_token', 'refresh_token',
          'idempotency_key', 'request_body', 'response_body', 'url',
          'error_message'
        )
      )
  ) then
    raise exception 'durable generation sensitive column leaked';
  end if;

  select array_agg(
    constraint_metadata.conname::text
    order by constraint_metadata.conname
  )
  into v_actual
  from pg_constraint as constraint_metadata
  join pg_class as relation
    on relation.oid = constraint_metadata.conrelid
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'careslink_v1_generation'
    and relation.relkind = 'r'
    and relation.relname = 'settings';

  if v_actual is distinct from array[
    'settings_capability_check', 'settings_enabled_check', 'settings_pkey',
    'settings_shadow_only_check', 'settings_time_check'
  ]::text[] then
    raise exception 'durable generation constraint scope drifted: settings';
  end if;

  select array_agg(
    constraint_metadata.conname::text
    order by constraint_metadata.conname
  )
  into v_actual
  from pg_constraint as constraint_metadata
  join pg_class as relation
    on relation.oid = constraint_metadata.conrelid
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'careslink_v1_generation'
    and relation.relkind = 'r'
    and relation.relname = 'jobs';

  if v_actual is distinct from array[
    'jobs_admission_transport_check', 'jobs_attempt_count_check',
    'jobs_contract_version_check', 'jobs_failure_reason_check',
    'jobs_hashes_check', 'jobs_note_type_check',
    'jobs_owner_idempotency_unique', 'jobs_owner_identity_unique',
    'jobs_owner_user_id_fkey', 'jobs_payload_unique', 'jobs_pkey',
    'jobs_privacy_owner_fk', 'jobs_privacy_policy_version_check',
    'jobs_privacy_review_revision_check', 'jobs_rate_catalog_version_check',
    'jobs_result_document_owner_fk', 'jobs_result_revision_owner_fk',
    'jobs_schema_version_check', 'jobs_service_binding_check',
    'jobs_shadow_only_check', 'jobs_source_locale_check', 'jobs_status_check',
    'jobs_terminal_shape_check', 'jobs_time_check',
    'jobs_version_identifiers_check'
  ]::text[] then
    raise exception 'durable generation constraint scope drifted: jobs';
  end if;

  select array_agg(
    constraint_metadata.conname::text
    order by constraint_metadata.conname
  )
  into v_actual
  from pg_constraint as constraint_metadata
  join pg_class as relation
    on relation.oid = constraint_metadata.conrelid
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'careslink_v1_generation'
    and relation.relkind = 'r'
    and relation.relname = 'attempts';

  if v_actual is distinct from array[
    'attempts_failure_reason_check', 'attempts_fence_shape_check',
    'attempts_hashes_check', 'attempts_identity_binding_unique',
    'attempts_job_number_unique', 'attempts_job_owner_fk',
    'attempts_number_check', 'attempts_pkey', 'attempts_reason_status_check',
    'attempts_shadow_only_check', 'attempts_status_check',
    'attempts_terminal_shape_check', 'attempts_time_check'
  ]::text[] then
    raise exception 'durable generation constraint scope drifted: attempts';
  end if;

  select array_agg(index_relation.relname::text order by index_relation.relname)
  into v_actual
  from pg_index as index_metadata
  join pg_class as index_relation on index_relation.oid = index_metadata.indexrelid
  where index_relation.relnamespace = v_schema;

  if v_actual is distinct from array[
    'attempts_identity_binding_unique', 'attempts_job_number_unique',
    'attempts_job_owner_idx', 'attempts_one_running_per_job_idx',
    'attempts_owner_created_idx', 'attempts_pkey',
    'attempts_running_lease_expiry_idx', 'jobs_claim_order_idx',
    'jobs_initiating_session_idx', 'jobs_owner_created_idx',
    'jobs_owner_idempotency_unique', 'jobs_owner_identity_unique',
    'jobs_payload_unique', 'jobs_pkey', 'jobs_privacy_owner_idx',
    'jobs_result_document_owner_idx', 'jobs_result_revision_owner_idx',
    'settings_pkey'
  ]::text[] then
    raise exception 'durable generation index scope drifted';
  end if;

  if (
    select count(*)
    from pg_constraint as binding
    where binding.conname in (
      'jobs_owner_user_id_fkey',
      'jobs_privacy_owner_fk',
      'jobs_result_document_owner_fk',
      'jobs_result_revision_owner_fk',
      'attempts_job_owner_fk'
    )
      and binding.connamespace = v_schema
      and binding.contype = 'f'
      and binding.confdeltype = 'r'
  ) <> 5 then
    raise exception 'durable generation owner foreign-key scope drifted';
  end if;
end
$$;

insert into careslink_v1_generation.jobs (
  id, owner_user_id, initiating_session_id, admission_transport, payload_id,
  note_type, source_locale, service_code, rate_catalog_version,
  contract_version, schema_version, privacy_review_id,
  privacy_scanner_policy_version, privacy_review_revision,
  cleaned_facts_hash, idempotency_hash, request_hash,
  worker_policy_version, worker_policy_digest, provider_policy_version,
  provider_policy_digest, payload_policy_version,
  payload_policy_snapshot_hash
) values (
  'a3000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'BEARER',
  'a5000000-0000-4000-8000-000000000001',
  'communication', 'en', 'note.communication.generate',
  '2026-08-09.v1-shadow', '1.0.0-shadow.1', '2026-08-09.v1-shadow',
  'a2000000-0000-4000-8000-000000000001',
  '2026-08-11.preview.1', 1,
  repeat('a', 64), repeat('b', 64), repeat('c', 64),
  'worker.test.v1', repeat('d', 64), 'provider.test.v1', repeat('e', 64),
  'payload.test.v1', repeat('f', 64)
);

do $$
declare
  v_constraint text;
begin
  begin
    update careslink_v1_generation.settings
    set enabled = true
    where capability = 'note_generation_v1';
    raise exception 'enabled settings mutation unexpectedly succeeded';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'settings_enabled_check' then
      raise exception 'wrong constraint rejected enabled settings mutation: %',
        v_constraint;
    end if;
  end;

  begin
    update careslink_v1_generation.jobs
    set status = 'UNKNOWN'
    where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'invalid job state unexpectedly succeeded';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'jobs_status_check' then
      raise exception 'wrong constraint rejected invalid job state: %', v_constraint;
    end if;
  end;

  begin
    update careslink_v1_generation.jobs
    set cleaned_facts_hash = 'not-a-sha256'
    where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'invalid job hash unexpectedly succeeded';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'jobs_hashes_check' then
      raise exception 'wrong constraint rejected invalid job hash: %', v_constraint;
    end if;
  end;

  begin
    update careslink_v1_generation.jobs
    set service_code = 'note.ndis.generate'
    where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'invalid Note service binding unexpectedly succeeded';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'jobs_service_binding_check' then
      raise exception 'wrong constraint rejected Note service binding: %',
        v_constraint;
    end if;
  end;

  begin
    update careslink_v1_generation.jobs
    set status = 'SUCCEEDED', attempt_count = 1,
        started_at = transaction_timestamp(),
        finished_at = transaction_timestamp()
    where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'invalid terminal job shape unexpectedly succeeded';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'jobs_terminal_shape_check' then
      raise exception 'wrong constraint rejected terminal job shape: %',
        v_constraint;
    end if;
  end;

  begin
    update careslink_v1_generation.jobs
    set owner_user_id = 'a0000000-0000-4000-8000-000000000002'
    where id = 'a3000000-0000-4000-8000-000000000001';
    raise exception 'cross-owner privacy binding unexpectedly succeeded';
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'jobs_privacy_owner_fk' then
      raise exception 'wrong constraint rejected cross-owner privacy binding: %',
        v_constraint;
    end if;
  end;
end
$$;

insert into careslink_v1_generation.attempts (
  id, job_id, owner_user_id, attempt_number, status,
  worker_identity_hash, registration_digest, lease_token_hash,
  acquired_at, last_heartbeat_at, lease_expires_at
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  1, 'RUNNING', repeat('1', 64), repeat('2', 64), repeat('3', 64),
  transaction_timestamp(), transaction_timestamp(),
  transaction_timestamp() + interval '10 minutes'
);

do $$
declare
  v_constraint text;
begin
  begin
    update careslink_v1_generation.attempts
    set status = 'UNKNOWN'
    where id = 'a6000000-0000-4000-8000-000000000001';
    raise exception 'invalid attempt state unexpectedly succeeded';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'attempts_status_check' then
      raise exception 'wrong constraint rejected invalid attempt state: %',
        v_constraint;
    end if;
  end;

  begin
    update careslink_v1_generation.attempts
    set lease_token_hash = 'raw-token'
    where id = 'a6000000-0000-4000-8000-000000000001';
    raise exception 'invalid attempt hash unexpectedly succeeded';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'attempts_hashes_check' then
      raise exception 'wrong constraint rejected invalid attempt hash: %',
        v_constraint;
    end if;
  end;

  begin
    update careslink_v1_generation.attempts
    set last_heartbeat_at = lease_expires_at
    where id = 'a6000000-0000-4000-8000-000000000001';
    raise exception 'invalid attempt time unexpectedly succeeded';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'attempts_time_check' then
      raise exception 'wrong constraint rejected invalid attempt time: %',
        v_constraint;
    end if;
  end;

  begin
    update careslink_v1_generation.attempts
    set owner_user_id = 'a0000000-0000-4000-8000-000000000002'
    where id = 'a6000000-0000-4000-8000-000000000001';
    raise exception 'cross-owner attempt binding unexpectedly succeeded';
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'attempts_job_owner_fk' then
      raise exception 'wrong constraint rejected cross-owner attempt binding: %',
        v_constraint;
    end if;
  end;

  begin
    insert into careslink_v1_generation.attempts (
      id, job_id, owner_user_id, attempt_number, status,
      worker_identity_hash, registration_digest, lease_token_hash,
      acquired_at, last_heartbeat_at, lease_expires_at
    ) values (
      'a6000000-0000-4000-8000-000000000002',
      'a3000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001',
      2, 'RUNNING', repeat('4', 64), repeat('5', 64), repeat('6', 64),
      transaction_timestamp(), transaction_timestamp(),
      transaction_timestamp() + interval '10 minutes'
    );
    raise exception 'multiple RUNNING attempts unexpectedly succeeded';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'attempts_one_running_per_job_idx' then
      raise exception 'wrong index rejected multiple RUNNING attempts: %',
        v_constraint;
    end if;
  end;
end
$$;

alter table careslink_v1_generation.settings force row level security;
alter table careslink_v1_generation.jobs force row level security;
alter table careslink_v1_generation.attempts force row level security;
reset role;
revoke careslink_v1_generation_owner from current_user
  granted by current_user;

do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_edge_count integer;
  v_distinct_roles integer;
  v_expected_edges integer;
  v_session_super boolean;
begin
  if (
    select count(*)
    from pg_class as relation
    where relation.relnamespace = v_schema
      and relation.relname in ('settings', 'jobs', 'attempts')
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ) <> 3 then
    raise exception 'assertion-only owner access cleanup failed';
  end if;

  select role.rolsuper
  into v_session_super
  from pg_roles as role
  where role.oid = session_user::regrole;

  select
    count(*),
    count(distinct granted_role.rolname)
  into v_edge_count, v_distinct_roles
  from pg_auth_members as membership
  join pg_roles as granted_role on granted_role.oid = membership.roleid
  join pg_roles as member_role on member_role.oid = membership.member
  where granted_role.rolname in (
    'careslink_v1_generation_owner',
    'careslink_v1_generation_executor'
  )
    or member_role.rolname in (
      'careslink_v1_generation_owner',
      'careslink_v1_generation_executor'
    );

  v_expected_edges := case
    when current_setting('server_version_num')::integer >= 160000
      and not v_session_super then 2
    else 0
  end;

  if v_edge_count <> v_expected_edges
    or v_distinct_roles <> v_expected_edges
    or exists (
    select 1
    from pg_auth_members as membership
    join pg_roles as granted_role on granted_role.oid = membership.roleid
    join pg_roles as member_role on member_role.oid = membership.member
    join pg_roles as grantor_role on grantor_role.oid = membership.grantor
    where (
      granted_role.rolname in (
        'careslink_v1_generation_owner',
        'careslink_v1_generation_executor'
      )
      or member_role.rolname in (
        'careslink_v1_generation_owner',
        'careslink_v1_generation_executor'
      )
    )
      and not (
        granted_role.rolname in (
          'careslink_v1_generation_owner',
          'careslink_v1_generation_executor'
        )
        and member_role.oid = session_user::regrole
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
    raise exception 'unsafe durable generation role membership';
  end if;
end
$$;

rollback;
