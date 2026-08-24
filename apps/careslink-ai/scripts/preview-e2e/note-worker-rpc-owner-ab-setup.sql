-- TEST_ONLY setup for the disposable local PostgreSQL 16 owner A/B runtime
-- integration gate. This transaction creates only fixed fixtures and a
-- passwordless loopback runner. It must never be submitted to a hosted target.

begin;

do $$
declare
  v_schema pg_catalog.oid :=
    pg_catalog.to_regnamespace('careslink_v1_generation');
  v_tables pg_catalog.text[];
  v_rpc_oids pg_catalog.oid[] := array[
    'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.fence_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.commit_v1_shadow_note_generation_success(uuid,uuid,text,text,text,text,uuid,text,jsonb,text,jsonb)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.settle_v1_shadow_note_generation_failure(uuid,uuid,text,text,text,text,text,jsonb)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.recover_v1_shadow_note_generation_expired(text,text,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(uuid,uuid,uuid,text,text,uuid)'::pg_catalog.regprocedure::pg_catalog.oid
  ];
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.inet_server_addr() is distinct from
      '127.0.0.1'::pg_catalog.inet
    or pg_catalog.inet_server_port() is distinct from 55432
    or pg_catalog.current_setting('application_name') <>
      'careslink-worker-rpc-owner-ab-management'
    or pg_catalog.current_setting(
      'careslink.owner_ab.local_bootstrap', true
    ) is distinct from '2026-08-24.local-pg16.1'
    or pg_catalog.current_setting('cluster_name') <>
      'careslink-owner-ab-pg16'
    or pg_catalog.current_setting('data_directory') !~
      '^/private/tmp/careslink-owner-ab-pg16\.[[:alnum:]]+$'
    or not (
      select role_record.rolcreaterole
        and role_record.rolbypassrls
      from pg_catalog.pg_roles as role_record
      where role_record.rolname = 'postgres'
    )
  then
    raise exception 'OWNER_AB_SETUP_MANAGEMENT_ROLE_UNSAFE';
  end if;

  if pg_catalog.current_setting('server_version_num')::pg_catalog.int4
      not between 160000 and 169999
  then
    raise exception 'OWNER_AB_SETUP_POSTGRES_VERSION_UNSUPPORTED';
  end if;

  if pg_catalog.to_regrole(
      'careslink_v1_generation_owner_ab_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_v1_generation_owner_ab_test_support'
    ) is not null
  then
    raise exception 'OWNER_AB_SETUP_TEST_SURFACE_ALREADY_PRESENT';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_database as database_record
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        database_record.datacl,
        pg_catalog.acldefault('d', database_record.datdba)
      )
    ) as privilege_record
    where database_record.datname = 'postgres'
      and privilege_record.grantee = 0
      and privilege_record.privilege_type = 'TEMPORARY'
  ) then
    raise exception 'OWNER_AB_SETUP_DATABASE_BASELINE_UNSAFE';
  end if;

  select pg_catalog.array_agg(
    relation.relname::pg_catalog.text order by relation.relname
  )
  into v_tables
  from pg_catalog.pg_class as relation
  where relation.relnamespace = v_schema
    and relation.relkind = 'r';

  if v_schema is null or v_tables is distinct from array[
    'attempts', 'jobs', 'payload_grants', 'payload_policies',
    'payload_purge_outbox', 'payloads', 'provider_evidence',
    'provider_policies', 'settings', 'worker_policies',
    'worker_registration_provider_policies', 'worker_registrations'
  ]::pg_catalog.text[] then
    raise exception 'OWNER_AB_SETUP_PRIVATE_SCHEMA_DRIFT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as relation
    where relation.relnamespace = v_schema
      and relation.relkind = 'r'
      and (
        not relation.relrowsecurity
        or not relation.relforcerowsecurity
        or relation.relowner <>
          'careslink_v1_generation_owner'::pg_catalog.regrole
      )
  ) then
    raise exception 'OWNER_AB_SETUP_RLS_POSTURE_UNSAFE';
  end if;

  if pg_catalog.cardinality(v_rpc_oids) <> 9
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = any(v_rpc_oids)
        and procedure.pronamespace = v_schema
        and procedure.proowner =
          'careslink_v1_generation_executor'::pg_catalog.regrole
        and procedure.prosecdef
        and procedure.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
        and procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
    ) <> 9
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.oid = any(v_rpc_oids)
        and (
          pg_catalog.has_function_privilege(
            'anon', procedure.oid, 'EXECUTE'
          )
          or pg_catalog.has_function_privilege(
            'authenticated', procedure.oid, 'EXECUTE'
          )
          or pg_catalog.has_function_privilege(
            'service_role', procedure.oid, 'EXECUTE'
          )
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as privilege_record
      where procedure.oid = any(v_rpc_oids)
        and privilege_record.privilege_type = 'EXECUTE'
        and privilege_record.grantee <> procedure.proowner
    )
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.roleid =
        'careslink_v1_generation_executor'::pg_catalog.regrole
    )
  then
    raise exception 'OWNER_AB_SETUP_RPC_POSTURE_UNSAFE';
  end if;
end
$$;

create role careslink_v1_generation_owner_ab_runner
  login
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  noreplication
  nobypassrls
  connection limit 1
  password null;
revoke temporary on database postgres from public;
revoke all on database postgres
  from careslink_v1_generation_owner_ab_runner;
grant connect on database postgres
  to careslink_v1_generation_owner_ab_runner;

create temporary table rpc_owner_ab_policy_values (
  note_type pg_catalog.text primary key,
  service_code pg_catalog.text not null,
  provider_digest pg_catalog.text not null
) on commit drop;

create temporary table rpc_owner_ab_fixture_values (
  fixture_key pg_catalog.text primary key,
  owner_id pg_catalog.uuid not null,
  session_id pg_catalog.uuid not null,
  privacy_id pg_catalog.uuid not null,
  job_id pg_catalog.uuid not null,
  payload_id pg_catalog.uuid not null,
  idempotency_hash pg_catalog.text not null,
  request_hash pg_catalog.text not null,
  payload_handle_hash pg_catalog.text not null
) on commit drop;

create temporary table rpc_owner_ab_management_membership_baseline
on commit drop
as
select
  membership.roleid,
  membership.member,
  membership.grantor,
  membership.admin_option,
  membership.inherit_option,
  membership.set_option
from pg_catalog.pg_auth_members as membership
where membership.member = 'postgres'::pg_catalog.regrole
  and membership.roleid in (
    'careslink_v1_generation_owner'::pg_catalog.regrole,
    'careslink_v1_generation_executor'::pg_catalog.regrole
  );

do $$
begin
  if exists (
    select 1
    from rpc_owner_ab_management_membership_baseline as membership
    where membership.grantor = 'postgres'::pg_catalog.regrole
  ) then
    raise exception 'OWNER_AB_SETUP_ROLE_MEMBERSHIP_UNSAFE';
  end if;
end
$$;

select pg_catalog.set_config(
  'careslink.owner_ab.facts_hash',
  public.v1_shadow_content_sha256(
    '{"occurred_at":"2026-08-24T00:00:00Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"TEST_ONLY clean owner isolation fixture","action_taken":"TEST_ONLY documented"}'::pg_catalog.jsonb
  ),
  true
);

select pg_catalog.set_config(
  'careslink.owner_ab.worker_identity_hash',
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'test-only-owner-ab-worker-identity', 'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  true
);

select pg_catalog.set_config(
  'careslink.owner_ab.worker_policy_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-worker-policy',
      'version', 'worker.owner-ab.20260824.v1',
      'status', 'APPROVED',
      'maxQueueAgeMs', 1800000,
      'minimumPayloadRemainingAtClaimMs', 180000,
      'leaseDurationMs', 120000,
      'heartbeatIntervalMs', 20000,
      'heartbeatSafetyMarginMs', 5000,
      'attemptDeadlineMs', 180000,
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
  'careslink.owner_ab.payload_policy_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'policyVersion', 'payload.owner-ab.20260824.v1',
      'encryptionProfileVersion', 'encryption.owner-ab.test.v1',
      'backupDispositionVersion', 'backup.owner-ab.test.v1'
    )
  ),
  true
);

insert into rpc_owner_ab_policy_values (
  note_type,
  service_code,
  provider_digest
)
select
  policy.note_type,
  policy.service_code,
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'noteType', policy.note_type,
      'serviceCode', policy.service_code,
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'rateCatalogVersion', '2026-08-09.v1-shadow',
      'providerId', 'provider.owner-ab.test',
      'modelId', 'model.owner-ab.test',
      'modelRevision', null,
      'modelRevisionAvailability', 'PROVIDER_NOT_EXPOSED',
      'policyVersion', 'provider.owner-ab.20260824.v1',
      'promptTemplateVersion', 'prompt.owner-ab.test.v1',
      'goldenSetVersion', 'golden.owner-ab.test.v1',
      'parserVersion', 'parser.owner-ab.test.v1',
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
  'careslink.owner_ab.registration_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-registered-worker',
      'registrationVersion', 'registration.owner-ab.20260824.v1',
      'status', 'APPROVED',
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'workerIdentityVersion', 'worker-identity.owner-ab.test.v1',
      'workerIdentityHash',
        pg_catalog.current_setting(
          'careslink.owner_ab.worker_identity_hash'
        ),
      'workerPolicyVersion', 'worker.owner-ab.20260824.v1',
      'workerPolicyDigest',
        pg_catalog.current_setting(
          'careslink.owner_ab.worker_policy_digest'
        ),
      'payloadPolicyVersion', 'payload.owner-ab.20260824.v1',
      'payloadPolicySnapshotHash',
        pg_catalog.current_setting(
          'careslink.owner_ab.payload_policy_digest'
        ),
      'providerPolicies', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'noteType', policy.note_type,
            'policyVersion', 'provider.owner-ab.20260824.v1',
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
        from rpc_owner_ab_policy_values as policy
      )
    )
  ),
  true
);

insert into rpc_owner_ab_fixture_values (
  fixture_key,
  owner_id,
  session_id,
  privacy_id,
  job_id,
  payload_id,
  idempotency_hash,
  request_hash,
  payload_handle_hash
)
select
  fixture.fixture_key,
  fixture.owner_id,
  fixture.session_id,
  fixture.privacy_id,
  fixture.job_id,
  fixture.payload_id,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'test-only-owner-ab-idempotency-' || fixture.fixture_key,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'test-only-owner-ab-request-' || fixture.fixture_key,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'test-only-owner-ab-payload-' || fixture.fixture_key,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
from (values
  (
    'ownerA'::pg_catalog.text,
    'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd9110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd9120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd9140000-0000-4000-8000-000000000001'::pg_catalog.uuid
  ),
  (
    'ownerB'::pg_catalog.text,
    'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'd9110000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'd9120000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'd9140000-0000-4000-8000-000000000002'::pg_catalog.uuid
  ),
  (
    'privacyDenied'::pg_catalog.text,
    'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid,
    'd9110000-0000-4000-8000-000000000003'::pg_catalog.uuid,
    'd9120000-0000-4000-8000-000000000003'::pg_catalog.uuid,
    'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid,
    'd9140000-0000-4000-8000-000000000003'::pg_catalog.uuid
  )
) as fixture(
  fixture_key,
  owner_id,
  session_id,
  privacy_id,
  job_id,
  payload_id
);

grant select on rpc_owner_ab_policy_values,
  rpc_owner_ab_fixture_values
  to careslink_v1_generation_owner;

do $$
begin
  if exists (
    select 1
    from rpc_owner_ab_fixture_values as fixture
    join auth.users as active_user on active_user.id = fixture.owner_id
  ) or exists (
    select 1
    from rpc_owner_ab_fixture_values as fixture
    join auth.sessions as active_session
      on active_session.id = fixture.session_id
  ) or exists (
    select 1
    from rpc_owner_ab_fixture_values as fixture
    join public.privacy_reviews as review
      on review.id = fixture.privacy_id
  ) or exists (
    select 1
    from rpc_owner_ab_fixture_values as fixture
    join public.ai_documents as document
      on document.owner_user_id = fixture.owner_id
  ) then
    raise exception 'OWNER_AB_SETUP_MANIFEST_ALREADY_PRESENT';
  end if;
end
$$;

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
)
select
  fixture.owner_id,
  '00000000-0000-0000-0000-000000000000'::pg_catalog.uuid,
  'authenticated',
  'authenticated',
  'worker-rpc-owner-ab-' || fixture.fixture_key || '@example.invalid',
  'test-only-no-login',
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
  '{}'::pg_catalog.jsonb,
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  )
from rpc_owner_ab_fixture_values as fixture;

insert into auth.sessions (
  id,
  user_id,
  created_at,
  updated_at,
  not_after
)
select
  fixture.session_id,
  fixture.owner_id,
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  null
from rpc_owner_ab_fixture_values as fixture;

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
)
select
  fixture.privacy_id,
  fixture.owner_id,
  'communication',
  pg_catalog.current_setting('careslink.owner_ab.facts_hash'),
  '2026-08-09.v1-shadow',
  'CONFIRMED',
  '[]'::pg_catalog.jsonb,
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ) + interval '30 minutes',
  '1.0.0-shadow.1',
  '2026-08-11.preview.1',
  1,
  'privacy.worker.rpc.owner-ab.' || fixture.fixture_key,
  fixture.request_hash,
  true,
  true,
  true
from rpc_owner_ab_fixture_values as fixture;

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

set local role careslink_v1_generation_owner;

alter table careslink_v1_generation.settings no force row level security;
alter table careslink_v1_generation.jobs no force row level security;
alter table careslink_v1_generation.attempts no force row level security;
alter table careslink_v1_generation.worker_policies no force row level security;
alter table careslink_v1_generation.provider_policies no force row level security;
alter table careslink_v1_generation.payload_policies no force row level security;
alter table careslink_v1_generation.worker_registrations
  no force row level security;
alter table careslink_v1_generation.worker_registration_provider_policies
  no force row level security;
alter table careslink_v1_generation.payloads no force row level security;
alter table careslink_v1_generation.payload_grants
  no force row level security;
alter table careslink_v1_generation.provider_evidence
  no force row level security;
alter table careslink_v1_generation.payload_purge_outbox
  no force row level security;

do $$
begin
  if (select pg_catalog.count(*) from careslink_v1_generation.settings) <> 1
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is false
        and shadow_only is true
    ) <> 1
    or (select pg_catalog.count(*) from careslink_v1_generation.worker_policies) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.provider_policies) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.payload_policies) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.worker_registrations) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.worker_registration_provider_policies) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.jobs) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.attempts) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.payloads) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.payload_grants) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.provider_evidence) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.payload_purge_outbox) <> 0
  then
    raise exception 'OWNER_AB_SETUP_DATABASE_NOT_EMPTY';
  end if;
end
$$;

alter table careslink_v1_generation.settings
  drop constraint settings_enabled_check;
update careslink_v1_generation.settings
set enabled = true,
    updated_at = pg_catalog.date_trunc(
      'milliseconds', pg_catalog.transaction_timestamp()
    )
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
  'worker.owner-ab.20260824.v1',
  'APPROVED',
  1800000,
  180000,
  120000,
  20000,
  5000,
  180000,
  20000,
  5000,
  2,
  array[1000]::pg_catalog.int8[],
  array[
    'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT'
  ]::pg_catalog.text[],
  10,
  'NONE',
  null,
  pg_catalog.current_setting(
    'careslink.owner_ab.worker_policy_digest'
  ),
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
  'provider.owner-ab.20260824.v1',
  'APPROVED',
  policy.service_code,
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  '2026-08-09.v1-shadow',
  'provider.owner-ab.test',
  'model.owner-ab.test',
  null,
  'PROVIDER_NOT_EXPOSED',
  'prompt.owner-ab.test.v1',
  'golden.owner-ab.test.v1',
  'parser.owner-ab.test.v1',
  20000,
  policy.provider_digest,
  true
from rpc_owner_ab_policy_values as policy;

insert into careslink_v1_generation.payload_policies (
  policy_version,
  status,
  encryption_profile_version,
  backup_disposition_version,
  policy_digest,
  shadow_only
) values (
  'payload.owner-ab.20260824.v1',
  'APPROVED',
  'encryption.owner-ab.test.v1',
  'backup.owner-ab.test.v1',
  pg_catalog.current_setting(
    'careslink.owner_ab.payload_policy_digest'
  ),
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
  pg_catalog.current_setting(
    'careslink.owner_ab.registration_digest'
  ),
  'registration.owner-ab.20260824.v1',
  'APPROVED',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'worker-identity.owner-ab.test.v1',
  pg_catalog.current_setting(
    'careslink.owner_ab.worker_identity_hash'
  ),
  'worker.owner-ab.20260824.v1',
  pg_catalog.current_setting(
    'careslink.owner_ab.worker_policy_digest'
  ),
  'payload.owner-ab.20260824.v1',
  pg_catalog.current_setting(
    'careslink.owner_ab.payload_policy_digest'
  ),
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
  pg_catalog.current_setting(
    'careslink.owner_ab.registration_digest'
  ),
  policy.note_type,
  'provider.owner-ab.20260824.v1',
  policy.provider_digest,
  true
from rpc_owner_ab_policy_values as policy;

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
  created_at,
  updated_at,
  shadow_only
)
select
  fixture.job_id,
  fixture.owner_id,
  fixture.session_id,
  'BEARER',
  fixture.payload_id,
  'communication',
  'en',
  'note.communication.generate',
  '2026-08-09.v1-shadow',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  fixture.privacy_id,
  '2026-08-11.preview.1',
  1,
  pg_catalog.current_setting('careslink.owner_ab.facts_hash'),
  fixture.idempotency_hash,
  fixture.request_hash,
  'worker.owner-ab.20260824.v1',
  pg_catalog.current_setting(
    'careslink.owner_ab.worker_policy_digest'
  ),
  'provider.owner-ab.20260824.v1',
  policy.provider_digest,
  'payload.owner-ab.20260824.v1',
  pg_catalog.current_setting(
    'careslink.owner_ab.payload_policy_digest'
  ),
  'QUEUED',
  0,
  pg_catalog.transaction_timestamp() + interval '20 minutes',
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  true
from rpc_owner_ab_fixture_values as fixture
cross join lateral (
  select provider_digest
  from rpc_owner_ab_policy_values
  where note_type = 'communication'
) as policy;

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
)
select
  fixture.payload_id,
  fixture.job_id,
  fixture.owner_id,
  'communication',
  'en',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  fixture.privacy_id,
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ) + interval '30 minutes',
  pg_catalog.current_setting('careslink.owner_ab.facts_hash'),
  fixture.request_hash,
  'payload.owner-ab.20260824.v1',
  'encryption.owner-ab.test.v1',
  'backup.owner-ab.test.v1',
  pg_catalog.current_setting(
    'careslink.owner_ab.payload_policy_digest'
  ),
  fixture.payload_handle_hash,
  'AVAILABLE',
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ) + interval '30 minutes',
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  0,
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  pg_catalog.date_trunc(
    'milliseconds', pg_catalog.transaction_timestamp()
  ),
  true
from rpc_owner_ab_fixture_values as fixture;

set constraints all immediate;

alter table careslink_v1_generation.settings force row level security;
alter table careslink_v1_generation.jobs force row level security;
alter table careslink_v1_generation.attempts force row level security;
alter table careslink_v1_generation.worker_policies force row level security;
alter table careslink_v1_generation.provider_policies force row level security;
alter table careslink_v1_generation.payload_policies force row level security;
alter table careslink_v1_generation.worker_registrations
  force row level security;
alter table careslink_v1_generation.worker_registration_provider_policies
  force row level security;
alter table careslink_v1_generation.payloads force row level security;
alter table careslink_v1_generation.payload_grants force row level security;
alter table careslink_v1_generation.provider_evidence force row level security;
alter table careslink_v1_generation.payload_purge_outbox
  force row level security;

reset role;

create schema careslink_v1_generation_owner_ab_test_support
  authorization postgres;
revoke all on schema careslink_v1_generation_owner_ab_test_support
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_ab_runner;

-- Fixed TEST_ONLY privacy revocation. The caller controls neither the target
-- nor the resulting state, and the helper returns no row data or capability.
create function
careslink_v1_generation_owner_ab_test_support.revoke_privacy_denied_fixture()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_owner_ab_runner'
    or current_user <> 'postgres'
    or coalesce(
      pg_catalog.current_setting('application_name', true), ''
    ) <> 'careslink-worker-rpc-owner-ab'
  then
    raise exception 'OWNER_AB_HELPER_CALLER_UNSAFE';
  end if;

  update public.privacy_reviews as review
  set status = 'REVOKED'
  where review.id =
      'd9120000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and review.owner_user_id =
      'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and review.note_type = 'communication'
    and review.status = 'CONFIRMED'
    and review.review_revision = 1
    and review.mutation_id =
      'privacy.worker.rpc.owner-ab.privacyDenied'
    and review.shadow_only is true;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'OWNER_AB_HELPER_PRIVACY_REVOKE_MISMATCH';
  end if;
  return true;
end;
$$;

revoke all on function
  careslink_v1_generation_owner_ab_test_support.revoke_privacy_denied_fixture()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_ab_runner;

grant usage, create
  on schema careslink_v1_generation_owner_ab_test_support
  to careslink_v1_generation_executor;

set local role careslink_v1_generation_executor;

create function
careslink_v1_generation_owner_ab_test_support.fixture_catalog()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result pg_catalog.jsonb;
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_owner_ab_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true), ''
    ) <> 'careslink-worker-rpc-owner-ab'
  then
    raise exception 'OWNER_AB_HELPER_CALLER_UNSAFE';
  end if;

  select pg_catalog.jsonb_build_object(
    'applicationName', 'careslink-worker-rpc-owner-ab',
    'contractVersion', registration.contract_version,
    'schemaVersion', registration.schema_version,
    'registrationDigest', registration.registration_digest,
    'workerIdentityHash', registration.worker_identity_hash,
    'workerPolicyVersion', registration.worker_policy_version,
    'workerPolicyDigest', registration.worker_policy_digest,
    'fixtures', pg_catalog.jsonb_build_object(
      'ownerA', pg_catalog.jsonb_build_object(
        'jobId', 'd9130000-0000-4000-8000-000000000001',
        'payloadId', 'd9140000-0000-4000-8000-000000000001'
      ),
      'ownerB', pg_catalog.jsonb_build_object(
        'jobId', 'd9130000-0000-4000-8000-000000000002',
        'payloadId', 'd9140000-0000-4000-8000-000000000002'
      ),
      'privacyDenied', pg_catalog.jsonb_build_object(
        'jobId', 'd9130000-0000-4000-8000-000000000003',
        'payloadId', 'd9140000-0000-4000-8000-000000000003'
      )
    )
  )
  into v_result
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
    'registration.owner-ab.20260824.v1';

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_result is null then
    raise exception 'OWNER_AB_HELPER_CATALOG_MISMATCH';
  end if;
  return v_result;
end;
$$;

create function
careslink_v1_generation_owner_ab_test_support.activate_owner_a_fixture()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_owner_ab_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true), ''
    ) <> 'careslink-worker-rpc-owner-ab'
  then
    raise exception 'OWNER_AB_HELPER_CALLER_UNSAFE';
  end if;

  update careslink_v1_generation.jobs as job
  set next_eligible_at = null,
      updated_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.transaction_timestamp()
      )
  where job.id =
      'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and job.owner_user_id =
      'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and job.payload_id =
      'd9140000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and job.status = 'QUEUED'
    and job.attempt_count = 0
    and job.next_eligible_at is not null;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'OWNER_AB_HELPER_OWNER_A_ACTIVATION_MISMATCH';
  end if;
  return true;
end;
$$;

create function
careslink_v1_generation_owner_ab_test_support.activate_owner_b_fixture()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_owner_ab_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true), ''
    ) <> 'careslink-worker-rpc-owner-ab'
  then
    raise exception 'OWNER_AB_HELPER_CALLER_UNSAFE';
  end if;

  update careslink_v1_generation.jobs as job
  set next_eligible_at = null,
      updated_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.transaction_timestamp()
      )
  where job.id =
      'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and job.owner_user_id =
      'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and job.payload_id =
      'd9140000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and job.status = 'QUEUED'
    and job.attempt_count = 0
    and job.next_eligible_at is not null;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'OWNER_AB_HELPER_OWNER_B_ACTIVATION_MISMATCH';
  end if;
  return true;
end;
$$;

create function
careslink_v1_generation_owner_ab_test_support.activate_privacy_denied_fixture()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_owner_ab_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true), ''
    ) <> 'careslink-worker-rpc-owner-ab'
  then
    raise exception 'OWNER_AB_HELPER_CALLER_UNSAFE';
  end if;

  update careslink_v1_generation.jobs as job
  set next_eligible_at = null,
      updated_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.transaction_timestamp()
      )
  where job.id =
      'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and job.owner_user_id =
      'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and job.payload_id =
      'd9140000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and job.status = 'QUEUED'
    and job.attempt_count = 0
    and job.next_eligible_at is not null;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'OWNER_AB_HELPER_PRIVACY_ACTIVATION_MISMATCH';
  end if;
  return true;
end;
$$;

-- TEST_ONLY bridge: the real vault/KMS handoff is intentionally absent. Each
-- helper can transition only one fixed fixture's already-authorized ISSUED
-- grant to
-- CONSUMED, returns only true and never returns a vault capability or payload.
create function
careslink_v1_generation_owner_ab_test_support.consume_owner_a_grant_test_only()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_owner_ab_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true), ''
    ) <> 'careslink-worker-rpc-owner-ab'
  then
    raise exception 'OWNER_AB_HELPER_CALLER_UNSAFE';
  end if;

  update careslink_v1_generation.payload_grants as grant_record
  set status = 'CONSUMED',
      consumed_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.transaction_timestamp()
      ),
      vault_grant_hash = pg_catalog.repeat('a', 64)
  where grant_record.job_id =
      'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and grant_record.payload_id =
      'd9140000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and grant_record.owner_user_id =
      'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and grant_record.status = 'ISSUED'
    and grant_record.consumed_at is null
    and grant_record.revoked_at is null
    and grant_record.vault_grant_hash is null
    and grant_record.expires_at > pg_catalog.transaction_timestamp();

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'OWNER_AB_HELPER_OWNER_A_CONSUME_MISMATCH';
  end if;
  return true;
end;
$$;

create function
careslink_v1_generation_owner_ab_test_support.consume_owner_b_grant_test_only()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_owner_ab_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true), ''
    ) <> 'careslink-worker-rpc-owner-ab'
  then
    raise exception 'OWNER_AB_HELPER_CALLER_UNSAFE';
  end if;

  update careslink_v1_generation.payload_grants as grant_record
  set status = 'CONSUMED',
      consumed_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.transaction_timestamp()
      ),
      vault_grant_hash = pg_catalog.repeat('b', 64)
  where grant_record.job_id =
      'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and grant_record.payload_id =
      'd9140000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and grant_record.owner_user_id =
      'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and grant_record.status = 'ISSUED'
    and grant_record.consumed_at is null
    and grant_record.revoked_at is null
    and grant_record.vault_grant_hash is null
    and grant_record.expires_at > pg_catalog.transaction_timestamp();

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'OWNER_AB_HELPER_OWNER_B_CONSUME_MISMATCH';
  end if;
  return true;
end;
$$;

-- This state projection is intentionally zero-argument. For each owner it
-- invokes the production owner setter and then counts whole canonical tables
-- without an explicit owner predicate; FORCE-RLS must reduce A and B to one
-- visible row per table and C to zero after the live runtime scenarios.
create function
careslink_v1_generation_owner_ab_test_support.fixture_state()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_projection_a pg_catalog.jsonb;
  v_projection_b pg_catalog.jsonb;
  v_projection_c pg_catalog.jsonb;
  v_owner_a pg_catalog.jsonb;
  v_owner_b pg_catalog.jsonb;
  v_privacy_denied pg_catalog.jsonb;
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_owner_ab_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true), ''
    ) <> 'careslink-worker-rpc-owner-ab'
  then
    raise exception 'OWNER_AB_HELPER_CALLER_UNSAFE';
  end if;

  perform careslink_v1_generation._set_owner(
    'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
  );
  select pg_catalog.jsonb_build_object(
    'documents', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_documents
    ),
    'revisions', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_revisions
    ),
    'syncChanges', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_sync_changes
    ),
    'mutationReceipts', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_mutation_receipts
    )
  ) into v_projection_a;

  select pg_catalog.jsonb_build_object(
    'jobStatus', job.status,
    'jobFailureReason', job.failure_reason,
    'attemptStatus', (
      select attempt.status
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = job.id
        and attempt.owner_user_id = job.owner_user_id
      order by attempt.attempt_number desc
      limit 1
    ),
    'attemptFailureReason', (
      select attempt.failure_reason
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = job.id
        and attempt.owner_user_id = job.owner_user_id
      order by attempt.attempt_number desc
      limit 1
    ),
    'payloadState', payload.state,
    'payloadRevokeReason', payload.revoke_reason,
    'grantStatus', (
      select grant_record.status
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.job_id = job.id
        and grant_record.payload_id = payload.id
        and grant_record.owner_user_id = job.owner_user_id
      order by grant_record.authorized_at desc
      limit 1
    ),
    'grantCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.job_id = job.id
        and grant_record.payload_id = payload.id
        and grant_record.owner_user_id = job.owner_user_id
    ),
    'evidenceCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.job_id = job.id
        and evidence.owner_user_id = job.owner_user_id
    ),
    'outboxCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.job_id = job.id
        and outbox.owner_user_id = job.owner_user_id
    ),
    'rlsProjection', v_projection_a
  )
  into v_owner_a
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  where job.id =
      'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and job.owner_user_id =
      'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and payload.id =
      'd9140000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_owner_a is null then
    raise exception 'OWNER_AB_HELPER_OWNER_A_STATE_MISMATCH';
  end if;

  perform careslink_v1_generation._set_owner(
    'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
  );
  select pg_catalog.jsonb_build_object(
    'documents', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_documents
    ),
    'revisions', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_revisions
    ),
    'syncChanges', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_sync_changes
    ),
    'mutationReceipts', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_mutation_receipts
    )
  ) into v_projection_b;

  select pg_catalog.jsonb_build_object(
    'jobStatus', job.status,
    'jobFailureReason', job.failure_reason,
    'attemptStatus', (
      select attempt.status
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = job.id
        and attempt.owner_user_id = job.owner_user_id
      order by attempt.attempt_number desc
      limit 1
    ),
    'attemptFailureReason', (
      select attempt.failure_reason
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = job.id
        and attempt.owner_user_id = job.owner_user_id
      order by attempt.attempt_number desc
      limit 1
    ),
    'payloadState', payload.state,
    'payloadRevokeReason', payload.revoke_reason,
    'grantStatus', (
      select grant_record.status
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.job_id = job.id
        and grant_record.payload_id = payload.id
        and grant_record.owner_user_id = job.owner_user_id
      order by grant_record.authorized_at desc
      limit 1
    ),
    'grantCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.job_id = job.id
        and grant_record.payload_id = payload.id
        and grant_record.owner_user_id = job.owner_user_id
    ),
    'evidenceCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.job_id = job.id
        and evidence.owner_user_id = job.owner_user_id
    ),
    'outboxCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.job_id = job.id
        and outbox.owner_user_id = job.owner_user_id
    ),
    'rlsProjection', v_projection_b
  )
  into v_owner_b
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  where job.id =
      'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and job.owner_user_id =
      'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and payload.id =
      'd9140000-0000-4000-8000-000000000002'::pg_catalog.uuid;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_owner_b is null then
    raise exception 'OWNER_AB_HELPER_OWNER_B_STATE_MISMATCH';
  end if;

  perform careslink_v1_generation._set_owner(
    'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
  );
  select pg_catalog.jsonb_build_object(
    'documents', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_documents
    ),
    'revisions', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_revisions
    ),
    'syncChanges', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_sync_changes
    ),
    'mutationReceipts', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_mutation_receipts
    )
  ) into v_projection_c;

  select pg_catalog.jsonb_build_object(
    'jobStatus', job.status,
    'jobFailureReason', job.failure_reason,
    'attemptStatus', (
      select attempt.status
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = job.id
        and attempt.owner_user_id = job.owner_user_id
      order by attempt.attempt_number desc
      limit 1
    ),
    'attemptFailureReason', (
      select attempt.failure_reason
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = job.id
        and attempt.owner_user_id = job.owner_user_id
      order by attempt.attempt_number desc
      limit 1
    ),
    'payloadState', payload.state,
    'payloadRevokeReason', payload.revoke_reason,
    'grantStatus', (
      select grant_record.status
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.job_id = job.id
        and grant_record.payload_id = payload.id
        and grant_record.owner_user_id = job.owner_user_id
      order by grant_record.authorized_at desc
      limit 1
    ),
    'grantCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.job_id = job.id
        and grant_record.payload_id = payload.id
        and grant_record.owner_user_id = job.owner_user_id
    ),
    'evidenceCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.job_id = job.id
        and evidence.owner_user_id = job.owner_user_id
    ),
    'outboxCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.job_id = job.id
        and outbox.owner_user_id = job.owner_user_id
    ),
    'rlsProjection', v_projection_c
  )
  into v_privacy_denied
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  where job.id =
      'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and job.owner_user_id =
      'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and payload.id =
      'd9140000-0000-4000-8000-000000000003'::pg_catalog.uuid;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_privacy_denied is null then
    raise exception 'OWNER_AB_HELPER_PRIVACY_STATE_MISMATCH';
  end if;

  return pg_catalog.jsonb_build_object(
    'ownerA', v_owner_a,
    'ownerB', v_owner_b,
    'privacyDenied', v_privacy_denied
  );
end;
$$;

revoke all on function
  careslink_v1_generation_owner_ab_test_support.fixture_catalog(),
  careslink_v1_generation_owner_ab_test_support.activate_owner_a_fixture(),
  careslink_v1_generation_owner_ab_test_support.activate_owner_b_fixture(),
  careslink_v1_generation_owner_ab_test_support.activate_privacy_denied_fixture(),
  careslink_v1_generation_owner_ab_test_support.consume_owner_a_grant_test_only(),
  careslink_v1_generation_owner_ab_test_support.consume_owner_b_grant_test_only(),
  careslink_v1_generation_owner_ab_test_support.fixture_state()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_ab_runner;

grant execute on function
  careslink_v1_generation_owner_ab_test_support.fixture_catalog(),
  careslink_v1_generation_owner_ab_test_support.activate_owner_a_fixture(),
  careslink_v1_generation_owner_ab_test_support.activate_owner_b_fixture(),
  careslink_v1_generation_owner_ab_test_support.activate_privacy_denied_fixture(),
  careslink_v1_generation_owner_ab_test_support.consume_owner_a_grant_test_only(),
  careslink_v1_generation_owner_ab_test_support.consume_owner_b_grant_test_only(),
  careslink_v1_generation_owner_ab_test_support.fixture_state()
  to careslink_v1_generation_owner_ab_runner;

revoke all on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    text, text, text, text, text, text
  ),
  careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  ),
  careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  ),
  careslink_v1_generation.commit_v1_shadow_note_generation_success(
    uuid, uuid, text, text, text, text, uuid, text, jsonb, text, jsonb
  ),
  careslink_v1_generation.settle_v1_shadow_note_generation_failure(
    uuid, uuid, text, text, text, text, text, jsonb
  ),
  careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  ),
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    text, text, text, text, text, text
  ),
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    uuid, uuid, uuid, text, text
  ),
  careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
    uuid, uuid, uuid, text, text, uuid
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_ab_runner;

grant execute on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    text, text, text, text, text, text
  ),
  careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  ),
  careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  ),
  careslink_v1_generation.commit_v1_shadow_note_generation_success(
    uuid, uuid, text, text, text, text, uuid, text, jsonb, text, jsonb
  ),
  careslink_v1_generation.settle_v1_shadow_note_generation_failure(
    uuid, uuid, text, text, text, text, text, jsonb
  ),
  careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
    uuid, uuid, text, text, text, text
  ),
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    text, text, text, text, text, text
  ),
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    uuid, uuid, uuid, text, text
  ),
  careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
    uuid, uuid, uuid, text, text, uuid
  )
  to careslink_v1_generation_owner_ab_runner;

reset role;

revoke usage, create
  on schema careslink_v1_generation_owner_ab_test_support
  from careslink_v1_generation_executor;
grant execute on function
  careslink_v1_generation_owner_ab_test_support.revoke_privacy_denied_fixture()
  to careslink_v1_generation_owner_ab_runner;
grant usage on schema careslink_v1_generation_owner_ab_test_support
  to careslink_v1_generation_owner_ab_runner;

set local role careslink_v1_generation_owner;
grant usage on schema careslink_v1_generation
  to careslink_v1_generation_owner_ab_runner;
reset role;

do $$
declare
  v_support_schema pg_catalog.oid :=
    'careslink_v1_generation_owner_ab_test_support'::pg_catalog.regnamespace;
  v_generation_schema pg_catalog.oid :=
    'careslink_v1_generation'::pg_catalog.regnamespace;
  v_runner pg_catalog.oid :=
    'careslink_v1_generation_owner_ab_runner'::pg_catalog.regrole;
  v_rpc_oids pg_catalog.oid[] := array[
    'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.fence_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.commit_v1_shadow_note_generation_success(uuid,uuid,text,text,text,text,uuid,text,jsonb,text,jsonb)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.settle_v1_shadow_note_generation_failure(uuid,uuid,text,text,text,text,text,jsonb)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.recover_v1_shadow_note_generation_expired(text,text,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
    'careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(uuid,uuid,uuid,text,text,uuid)'::pg_catalog.regprocedure::pg_catalog.oid
  ];
begin
  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runner
        and role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolbypassrls
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and role_record.rolconnlimit = 1
    ) <> 1
    or pg_catalog.pg_has_role(
      v_runner, 'careslink_v1_generation_owner', 'MEMBER'
    )
    or pg_catalog.pg_has_role(
      v_runner, 'careslink_v1_generation_executor', 'MEMBER'
    )
    or not pg_catalog.has_database_privilege(
      v_runner, 'postgres', 'CONNECT'
    )
    or pg_catalog.has_database_privilege(
      v_runner, 'postgres', 'TEMPORARY'
    )
  then
    raise exception 'OWNER_AB_SETUP_RUNNER_POSTURE_UNSAFE';
  end if;

  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_support_schema
        and procedure.pronargs = 0
        and procedure.proname = any(array[
          'fixture_catalog',
          'activate_owner_a_fixture',
          'activate_owner_b_fixture',
          'activate_privacy_denied_fixture',
          'consume_owner_a_grant_test_only',
          'consume_owner_b_grant_test_only',
          'revoke_privacy_denied_fixture',
          'fixture_state'
        ]::pg_catalog.text[])
        and procedure.prosecdef
        and procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
        and pg_catalog.strpos(
          procedure.prosrc,
          'careslink_v1_generation_owner_ab_runner'
        ) > 0
        and pg_catalog.strpos(
          procedure.prosrc, 'careslink-worker-rpc-owner-ab'
        ) > 0
    ) <> 8
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_support_schema
        and procedure.proowner <> case
          when procedure.proname = 'revoke_privacy_denied_fixture'
            then 'postgres'::pg_catalog.regrole
          else 'careslink_v1_generation_executor'::pg_catalog.regrole
        end
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as privilege_record
      where procedure.pronamespace = v_support_schema
        and privilege_record.privilege_type = 'EXECUTE'
        and privilege_record.grantee not in (
          procedure.proowner, v_runner
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_support_schema
        and (
          not pg_catalog.has_function_privilege(
            v_runner, procedure.oid, 'EXECUTE'
          )
          or pg_catalog.has_function_privilege(
            'anon', procedure.oid, 'EXECUTE'
          )
          or pg_catalog.has_function_privilege(
            'authenticated', procedure.oid, 'EXECUTE'
          )
          or pg_catalog.has_function_privilege(
            'service_role', procedure.oid, 'EXECUTE'
          )
        )
    )
  then
    raise exception 'OWNER_AB_SETUP_HELPER_SURFACE_UNSAFE';
  end if;

  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_generation_schema
        and pg_catalog.has_function_privilege(
          v_runner, procedure.oid, 'EXECUTE'
        )
    ) <> 9
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as privilege_record
      where procedure.oid = any(v_rpc_oids)
        and privilege_record.privilege_type = 'EXECUTE'
        and privilege_record.grantee not in (
          procedure.proowner, v_runner
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.roleid =
          'careslink_v1_generation_executor'::pg_catalog.regrole
        and membership.member <> 'postgres'::pg_catalog.regrole
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = any(v_rpc_oids)
        and pg_catalog.has_function_privilege(
          v_runner, procedure.oid, 'EXECUTE'
        )
        and not pg_catalog.has_function_privilege(
          'anon', procedure.oid, 'EXECUTE'
        )
        and not pg_catalog.has_function_privilege(
          'authenticated', procedure.oid, 'EXECUTE'
        )
        and not pg_catalog.has_function_privilege(
          'service_role', procedure.oid, 'EXECUTE'
        )
    ) <> 9
  then
    raise exception 'OWNER_AB_SETUP_RPC_ACL_UNSAFE';
  end if;

  if not pg_catalog.has_schema_privilege(
      v_runner, v_support_schema, 'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      v_runner, v_support_schema, 'CREATE'
    )
    or not pg_catalog.has_schema_privilege(
      v_runner, v_generation_schema, 'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      v_runner, v_generation_schema, 'CREATE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_v1_generation_executor', v_support_schema, 'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_v1_generation_executor', v_support_schema, 'CREATE'
    )
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation.relnamespace
      cross join lateral pg_catalog.aclexplode(
        relation.relacl
      ) as privilege_record
      where namespace_record.nspname in (
          'auth', 'public', 'careslink_v1_generation'
        )
        and privilege_record.grantee = v_runner
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
            v_runner, relation.oid, 'SELECT'
          )
          or pg_catalog.has_table_privilege(
            v_runner, relation.oid, 'INSERT'
          )
          or pg_catalog.has_table_privilege(
            v_runner, relation.oid, 'UPDATE'
          )
          or pg_catalog.has_table_privilege(
            v_runner, relation.oid, 'DELETE'
          )
          or pg_catalog.has_table_privilege(
            v_runner, relation.oid, 'TRUNCATE'
          )
          or pg_catalog.has_table_privilege(
            v_runner, relation.oid, 'REFERENCES'
          )
          or pg_catalog.has_table_privilege(
            v_runner, relation.oid, 'TRIGGER'
          )
        )
    )
  then
    raise exception 'OWNER_AB_SETUP_SCHEMA_OR_TABLE_ACL_UNSAFE';
  end if;

  if (
      select pg_catalog.count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is true
        and shadow_only is true
    ) <> 1
    or (select pg_catalog.count(*) from careslink_v1_generation.jobs) <> 3
    or (select pg_catalog.count(*) from careslink_v1_generation.payloads) <> 3
    or (select pg_catalog.count(*) from auth.sessions where id in (
      'd9110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'd9110000-0000-4000-8000-000000000002'::pg_catalog.uuid,
      'd9110000-0000-4000-8000-000000000003'::pg_catalog.uuid
    )) <> 3
  then
    raise exception 'OWNER_AB_SETUP_POSTCHECK_FAILED';
  end if;
end
$$;

revoke careslink_v1_generation_executor from current_user
  granted by current_user;
revoke careslink_v1_generation_owner from current_user
  granted by current_user;

do $$
begin
  if exists (
      (
        select
          membership.roleid,
          membership.member,
          membership.grantor,
          membership.admin_option,
          membership.inherit_option,
          membership.set_option
        from pg_catalog.pg_auth_members as membership
        where membership.member = 'postgres'::pg_catalog.regrole
          and membership.roleid in (
            'careslink_v1_generation_owner'::pg_catalog.regrole,
            'careslink_v1_generation_executor'::pg_catalog.regrole
          )
        except
        select *
        from rpc_owner_ab_management_membership_baseline
      )
      union all
      (
        select *
        from rpc_owner_ab_management_membership_baseline
        except
        select
          membership.roleid,
          membership.member,
          membership.grantor,
          membership.admin_option,
          membership.inherit_option,
          membership.set_option
        from pg_catalog.pg_auth_members as membership
        where membership.member = 'postgres'::pg_catalog.regrole
          and membership.roleid in (
            'careslink_v1_generation_owner'::pg_catalog.regrole,
            'careslink_v1_generation_executor'::pg_catalog.regrole
          )
      )
    )
    or pg_catalog.pg_has_role(
      'careslink_v1_generation_owner_ab_runner',
      'careslink_v1_generation_owner',
      'MEMBER'
    )
    or pg_catalog.pg_has_role(
      'careslink_v1_generation_owner_ab_runner',
      'careslink_v1_generation_executor',
      'MEMBER'
    )
  then
    raise exception 'OWNER_AB_SETUP_ROLE_MEMBERSHIP_RESTORE_FAILED';
  end if;
end
$$;

commit;
