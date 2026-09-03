-- TEST_ONLY setup for atomic Communication Note +20 Points admission races.
-- Apply only to a pre-migrated, disposable, passwordless local PostgreSQL 16
-- cluster carrying the exact marker checked below. No submitted care data is
-- stored; every identity and hash is a fixed synthetic fixture.

\set ON_ERROR_STOP on

\if :{?careslink_bootstrap_role}
\else
\set careslink_bootstrap_role '__missing__'
\endif

begin;

select pg_catalog.set_config(
  'careslink.communication_admission_concurrency_bootstrap_role',
  :'careslink_bootstrap_role',
  true
);

do $$
declare
  v_ssl pg_catalog.bool;
  v_bootstrap_role pg_catalog.text := pg_catalog.current_setting(
    'careslink.communication_admission_concurrency_bootstrap_role',
    true
  );
begin
  select ssl
  into v_ssl
  from pg_catalog.pg_stat_ssl
  where pid = pg_catalog.pg_backend_pid();

  if v_bootstrap_role is null
    or v_bootstrap_role !~ '^[a-z_][a-z0-9_]{0,62}$'
    or current_user <> v_bootstrap_role
    or session_user <> v_bootstrap_role
    or current_database() <> 'postgres'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4
      < 160000
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4
      >= 170000
    or pg_catalog.inet_server_addr() is not null
    or pg_catalog.inet_server_port() is not null
    or pg_catalog.current_setting('port')::pg_catalog.int4 < 49152
    or pg_catalog.current_setting('port')::pg_catalog.int4 > 65535
    or pg_catalog.current_setting('listen_addresses') <> ''
    or pg_catalog.current_setting('unix_socket_directories') !~
      '^/private/tmp/careslink-communication-admission-pg16[.][A-Za-z0-9]{6,}/socket$'
    or pg_catalog.current_setting('unix_socket_permissions') <> '0700'
    or coalesce(v_ssl, false)
    or pg_catalog.current_setting(
      'careslink.communication_note_points_admission_concurrency_marker',
      true
    ) is distinct from
      '2026-09-02.local-pg16.communication-admission.1'
    or pg_catalog.current_setting('is_superuser') <> 'on'
    or not exists (
      select 1
      from pg_catalog.pg_authid as bootstrap_actor
      where bootstrap_actor.rolname = v_bootstrap_role
        and bootstrap_actor.rolcanlogin is true
        and bootstrap_actor.rolsuper is true
        and bootstrap_actor.rolpassword is null
    )
    or not exists (
      select 1
      from pg_catalog.pg_authid as migration_actor
      where migration_actor.rolname = 'postgres'
        and migration_actor.rolcanlogin is true
        and migration_actor.rolsuper is false
        and migration_actor.rolinherit is true
        and migration_actor.rolcreatedb is true
        and migration_actor.rolcreaterole is true
        and migration_actor.rolreplication is false
        and migration_actor.rolbypassrls is true
        and migration_actor.rolpassword is null
    )
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_SETUP_UNSAFE';
  end if;

  if pg_catalog.to_regrole(
      'careslink_v1_communication_admission_concurrency_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_v1_communication_admission_concurrency_test_support'
    ) is not null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_points_admission_executor'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)'
    ) is null
    or pg_catalog.to_regclass(
      'careslink_v1_generation.communication_note_point_admissions'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.commit_shadow_points(uuid,uuid,text,timestamptz)'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.release_shadow_points(uuid,uuid,text,text,timestamptz)'
    ) is null
    or not exists (
      select 1
      from pg_catalog.pg_trigger as terminal_guard
      where terminal_guard.tgrelid =
          'public.point_reservations'::pg_catalog.regclass
        and terminal_guard.tgname =
          'point_reservations_communication_note_paid_admission_gate'
        and terminal_guard.tgfoid = pg_catalog.to_regprocedure(
          'careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()'
        )
        and terminal_guard.tgenabled = 'O'
        and terminal_guard.tgisinternal is false
    )
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_SCHEMA_DRIFT';
  end if;

  if (
      select pg_catalog.count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is false
        and shadow_only is true
    ) <> 1
    or not exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid =
          'careslink_v1_generation.settings'::pg_catalog.regclass
        and conname = 'settings_enabled_check'
        and contype = 'c'
    )
    or (
      select pg_catalog.count(*)
      from public.service_rate_versions
      where version = '2026-08-09.v1-shadow'
        and status = 'SHADOW'
    ) <> 1
    or (
      select pg_catalog.count(*)
      from public.service_rates
      where catalog_version = '2026-08-09.v1-shadow'
        and service_code = 'note.communication.generate'
        and unit = 'request'
        and points = 20
        and minimum_points is null
        and maximum_points is null
        and status = 'SHADOW'
    ) <> 1
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_SCHEMA_DRIFT';
  end if;

  if exists (select 1 from careslink_v1_generation.jobs)
    or exists (select 1 from careslink_v1_generation.payloads)
    or exists (
      select 1
      from careslink_v1_generation.communication_note_point_admissions
    )
    or exists (select 1 from careslink_v1_generation.worker_policies)
    or exists (select 1 from careslink_v1_generation.provider_policies)
    or exists (select 1 from careslink_v1_generation.payload_policies)
    or exists (select 1 from careslink_v1_generation.worker_registrations)
    or exists (
      select 1
      from careslink_v1_generation.worker_registration_provider_policies
    )
    or exists (
      select 1 from careslink_v1_generation.admission_policy_bindings
    )
    or exists (select 1 from public.point_wallets)
    or exists (select 1 from public.point_lots)
    or exists (select 1 from public.point_quotes)
    or exists (select 1 from public.point_reservations)
    or exists (select 1 from public.point_reservation_allocations)
    or exists (select 1 from public.point_ledger_entries)
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_DATABASE_NOT_EMPTY';
  end if;
end;
$$;

create role careslink_v1_communication_admission_concurrency_runner
  login
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls
  password null
  connection limit 3;

grant connect on database postgres
to careslink_v1_communication_admission_concurrency_runner;

create schema
  careslink_v1_communication_admission_concurrency_test_support
authorization postgres;

revoke all on schema
  careslink_v1_communication_admission_concurrency_test_support
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_generation_executor,
  careslink_v1_generation_owner_api_executor,
  careslink_v1_generation_points_admission_executor,
  careslink_v1_communication_admission_concurrency_runner;

grant usage on schema
  careslink_v1_communication_admission_concurrency_test_support,
  careslink_v1_generation
to careslink_v1_communication_admission_concurrency_runner;

create temporary table communication_admission_policy_values (
  note_type pg_catalog.text primary key,
  service_code pg_catalog.text not null,
  provider_digest pg_catalog.text not null
) on commit drop;

select pg_catalog.set_config(
  'careslink.communication_admission.worker_identity_hash',
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'test-only-communication-admission-worker-identity',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  true
);

select pg_catalog.set_config(
  'careslink.communication_admission.worker_policy_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-worker-policy',
      'version', 'worker.communication-admission-concurrency.20260902.v1',
      'status', 'APPROVED',
      'maxQueueAgeMs', 1800000,
      'minimumPayloadRemainingAtClaimMs', 1000,
      'leaseDurationMs', 500,
      'heartbeatIntervalMs', 100,
      'heartbeatSafetyMarginMs', 50,
      'attemptDeadlineMs', 1000,
      'providerDeadlineMs', 600,
      'commitSafetyMarginMs', 100,
      'maxAttempts', 1,
      'retryDelayMsAfterAttempt', '[]'::pg_catalog.jsonb,
      'retryableOutcomes', '[]'::pg_catalog.jsonb,
      'recoveryBatchLimit', 10,
      'jitter', pg_catalog.jsonb_build_object('mode', 'NONE')
    )
  ),
  true
);

select pg_catalog.set_config(
  'careslink.communication_admission.payload_policy_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'policyVersion',
        'payload.communication-admission-concurrency.20260902.v1',
      'encryptionProfileVersion', 'encryption.test-only.v1',
      'backupDispositionVersion', 'backup.test-only.v1'
    )
  ),
  true
);

insert into communication_admission_policy_values (
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
      'providerId', 'provider.test-only',
      'modelId', 'model.test-only-no-call',
      'modelRevision', null,
      'modelRevisionAvailability', 'PROVIDER_NOT_EXPOSED',
      'policyVersion',
        'provider.communication-admission-concurrency.20260902.v1',
      'promptTemplateVersion', 'prompt.test-only.v1',
      'goldenSetVersion', 'golden.test-only.v1',
      'parserVersion', 'parser.test-only.v1',
      'timeoutMs', 600
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
  'careslink.communication_admission.registration_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-registered-worker',
      'registrationVersion',
        'registration.communication-admission-concurrency.20260902.v1',
      'status', 'APPROVED',
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'workerIdentityVersion', 'worker-identity.test-only.v1',
      'workerIdentityHash', pg_catalog.current_setting(
        'careslink.communication_admission.worker_identity_hash'
      ),
      'workerPolicyVersion',
        'worker.communication-admission-concurrency.20260902.v1',
      'workerPolicyDigest', pg_catalog.current_setting(
        'careslink.communication_admission.worker_policy_digest'
      ),
      'payloadPolicyVersion',
        'payload.communication-admission-concurrency.20260902.v1',
      'payloadPolicySnapshotHash', pg_catalog.current_setting(
        'careslink.communication_admission.payload_policy_digest'
      ),
      'providerPolicies', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'noteType', policy.note_type,
            'policyVersion',
              'provider.communication-admission-concurrency.20260902.v1',
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
        from communication_admission_policy_values as policy
      )
    )
  ),
  true
);

alter table careslink_v1_generation.settings
  drop constraint settings_enabled_check;

update careslink_v1_generation.settings
set enabled = true,
    updated_at = pg_catalog.date_trunc(
      'milliseconds', pg_catalog.transaction_timestamp()
    )
where capability = 'note_generation_v1'
  and enabled is false
  and shadow_only is true;

insert into careslink_v1_generation.worker_policies (
  version, status, max_queue_age_ms,
  minimum_payload_remaining_at_claim_ms, lease_duration_ms,
  heartbeat_interval_ms, heartbeat_safety_margin_ms,
  attempt_deadline_ms, provider_deadline_ms, commit_safety_margin_ms,
  max_attempts, retry_delay_ms_after_attempt, retryable_outcomes,
  recovery_batch_limit, jitter_mode, jitter_max_ms, policy_digest,
  shadow_only
) values (
  'worker.communication-admission-concurrency.20260902.v1',
  'APPROVED', 1800000, 1000, 500, 100, 50, 1000, 600, 100, 1,
  array[]::pg_catalog.int8[], array[]::pg_catalog.text[], 10,
  'NONE', null,
  pg_catalog.current_setting(
    'careslink.communication_admission.worker_policy_digest'
  ),
  true
);

insert into careslink_v1_generation.provider_policies (
  note_type, policy_version, status, service_code, contract_version,
  schema_version, rate_catalog_version, provider_id, model_id,
  model_revision, model_revision_availability, prompt_template_version,
  golden_set_version, parser_version, timeout_ms, policy_digest,
  shadow_only
)
select
  policy.note_type,
  'provider.communication-admission-concurrency.20260902.v1',
  'APPROVED',
  policy.service_code,
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  '2026-08-09.v1-shadow',
  'provider.test-only',
  'model.test-only-no-call',
  null,
  'PROVIDER_NOT_EXPOSED',
  'prompt.test-only.v1',
  'golden.test-only.v1',
  'parser.test-only.v1',
  600,
  policy.provider_digest,
  true
from communication_admission_policy_values as policy;

insert into careslink_v1_generation.payload_policies (
  policy_version, status, encryption_profile_version,
  backup_disposition_version, policy_digest, shadow_only
) values (
  'payload.communication-admission-concurrency.20260902.v1',
  'APPROVED',
  'encryption.test-only.v1',
  'backup.test-only.v1',
  pg_catalog.current_setting(
    'careslink.communication_admission.payload_policy_digest'
  ),
  true
);

insert into careslink_v1_generation.worker_registrations (
  registration_digest, registration_version, status, contract_version,
  schema_version, worker_identity_version, worker_identity_hash,
  worker_policy_version, worker_policy_digest, payload_policy_version,
  payload_policy_snapshot_hash, shadow_only
) values (
  pg_catalog.current_setting(
    'careslink.communication_admission.registration_digest'
  ),
  'registration.communication-admission-concurrency.20260902.v1',
  'APPROVED',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'worker-identity.test-only.v1',
  pg_catalog.current_setting(
    'careslink.communication_admission.worker_identity_hash'
  ),
  'worker.communication-admission-concurrency.20260902.v1',
  pg_catalog.current_setting(
    'careslink.communication_admission.worker_policy_digest'
  ),
  'payload.communication-admission-concurrency.20260902.v1',
  pg_catalog.current_setting(
    'careslink.communication_admission.payload_policy_digest'
  ),
  true
);

insert into
  careslink_v1_generation.worker_registration_provider_policies (
    registration_digest, note_type, policy_version, policy_digest,
    shadow_only
  )
select
  pg_catalog.current_setting(
    'careslink.communication_admission.registration_digest'
  ),
  policy.note_type,
  'provider.communication-admission-concurrency.20260902.v1',
  policy.provider_digest,
  true
from communication_admission_policy_values as policy;

insert into careslink_v1_generation.admission_policy_bindings (
  binding_version, note_type, registration_digest, status, activated_at,
  created_at, shadow_only
) values (
  'binding.communication-admission-concurrency.20260902.v1',
  'communication',
  pg_catalog.current_setting(
    'careslink.communication_admission.registration_digest'
  ),
  'ACTIVE',
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  true
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_anonymous, created_at, updated_at
)
select
  fixture.owner_id,
  '00000000-0000-0000-0000-000000000000'::pg_catalog.uuid,
  'authenticated',
  'authenticated',
  fixture.email,
  'test-only-no-login',
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
  '{}'::pg_catalog.jsonb,
  false,
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp())
from (values
  ('da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-replay@example.invalid'),
  ('da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-points@example.invalid'),
  ('da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-session-expiry@example.invalid'),
  ('da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-privacy-expiry@example.invalid'),
  ('da330000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-payload-expiry@example.invalid')
) as fixture(owner_id, email);

insert into auth.sessions (
  id, user_id, created_at, updated_at, not_after
)
select
  fixture.session_id,
  fixture.owner_id,
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  null
from (values
  ('da110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da210000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da311000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da321000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da331000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid)
) as fixture(session_id, owner_id);

insert into public.privacy_reviews (
  id, owner_user_id, note_type, cleaned_facts_hash, schema_version,
  status, finding_decisions, confirmed_at, expires_at, contract_version,
  scanner_policy_version, review_revision, mutation_id,
  request_fingerprint, deidentification_confirmed,
  authority_to_process_confirmed, shadow_only
)
select
  fixture.privacy_id,
  fixture.owner_id,
  'communication',
  repeat(fixture.fact_digit, 64),
  '2026-08-09.v1-shadow',
  'CONFIRMED',
  '[]'::pg_catalog.jsonb,
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp())
    + interval '30 minutes',
  '1.0.0-shadow.1',
  '2026-08-11.preview.1',
  1,
  fixture.mutation_id,
  repeat(fixture.request_digit, 64),
  true,
  true,
  true
from (values
  ('da120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    '1', '2', 'privacy.communication.admission.replay'),
  ('da220000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    '3', '4', 'privacy.communication.admission.points'),
  ('da312000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    '5', '6', 'privacy.communication.admission.session'),
  ('da322000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    '7', '8', 'privacy.communication.admission.privacy'),
  ('da332000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    '9', 'a', 'privacy.communication.admission.payload')
) as fixture(
  privacy_id, owner_id, fact_digit, request_digit, mutation_id
);

insert into public.point_wallets (
  id, owner_user_id, status, shadow_only, created_at, updated_at
)
select
  fixture.wallet_id,
  fixture.owner_id,
  'ACTIVE',
  true,
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp())
from (values
  ('da130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da230000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da313000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da323000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da333000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid)
) as fixture(wallet_id, owner_id);

insert into public.point_lots (
  id, wallet_id, owner_user_id, source, source_reference,
  original_points, remaining_points, granted_at, shadow_only, created_at
)
select
  fixture.lot_id,
  fixture.wallet_id,
  fixture.owner_id,
  'ADJUSTMENT',
  fixture.source_reference,
  30,
  30,
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp()),
  true,
  pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp())
from (values
  ('da140000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-replay'),
  ('da240000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da230000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-points'),
  ('da314000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da313000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-session-expiry'),
  ('da324000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da323000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-privacy-expiry'),
  ('da334000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da333000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-admission-payload-expiry')
) as fixture(lot_id, wallet_id, owner_id, source_reference);

insert into public.point_ledger_entries (
  wallet_id, owner_user_id, event, points, delta, lot_id, source,
  source_reference, created_at, shadow_only
)
select
  lot.wallet_id,
  lot.owner_user_id,
  'GRANT',
  lot.original_points,
  lot.original_points,
  lot.id,
  lot.source,
  lot.source_reference,
  lot.granted_at,
  true
from public.point_lots as lot
where lot.owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

create function
  careslink_v1_communication_admission_concurrency_test_support._assert_runner()
returns pg_catalog.void
language plpgsql
volatile
security definer
set search_path = ''
set careslink.communication_admission_concurrency_bootstrap_role from current
as $$
begin
  if session_user <>
      'careslink_v1_communication_admission_concurrency_runner'
    or current_user <> pg_catalog.current_setting(
      'careslink.communication_admission_concurrency_bootstrap_role'
    )
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) !~ '^careslink-communication-admission-race-(same-key|different-key|expiry-session|expiry-privacy|expiry-payload)-(a|b|observer)$'
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CALLER_UNSAFE';
  end if;
end;
$$;

create function
  careslink_v1_communication_admission_concurrency_test_support._owner_id(
    p_case pg_catalog.text
  )
returns pg_catalog.uuid
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case p_case
    when 'same-key' then
      'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid
    when 'different-key' then
      'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid
    when 'expiry-session' then
      'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid
    when 'expiry-privacy' then
      'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid
    when 'expiry-payload' then
      'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
    else null::pg_catalog.uuid
  end
$$;

create function
  careslink_v1_communication_admission_concurrency_test_support.hold_points_lock(
    p_case pg_catalog.text
  )
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_id pg_catalog.uuid;
begin
  perform
    careslink_v1_communication_admission_concurrency_test_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-communication-admission-race-' || p_case || '-a'
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CALLER_UNSAFE';
  end if;
  v_owner_id :=
    careslink_v1_communication_admission_concurrency_test_support._owner_id(
      p_case
    );
  if v_owner_id is null then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CASE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::pg_catalog.text, 0)
  );
  return true;
end;
$$;

create function
  careslink_v1_communication_admission_concurrency_test_support.arm_expiry(
    p_case pg_catalog.text,
    p_delay_milliseconds pg_catalog.int4
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now pg_catalog.timestamptz := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  v_boundary pg_catalog.timestamptz;
  v_payload_expires_at pg_catalog.timestamptz;
  v_owner_id pg_catalog.uuid;
  v_session_id pg_catalog.uuid;
  v_privacy_id pg_catalog.uuid;
  v_expected_code pg_catalog.text;
begin
  perform
    careslink_v1_communication_admission_concurrency_test_support._assert_runner();

  if p_case not in (
      'expiry-session', 'expiry-privacy', 'expiry-payload'
    )
    or p_delay_milliseconds is null
    or p_delay_milliseconds < 2500
    or p_delay_milliseconds > 10000
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_EXPIRY_INVALID';
  end if;
  if pg_catalog.current_setting('application_name') <>
      'careslink-communication-admission-race-' || p_case || '-observer'
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CALLER_UNSAFE';
  end if;

  v_owner_id :=
    careslink_v1_communication_admission_concurrency_test_support._owner_id(
      p_case
    );
  v_session_id := case p_case
    when 'expiry-session' then
      'da311000-0000-4000-8000-000000000001'::pg_catalog.uuid
    when 'expiry-privacy' then
      'da321000-0000-4000-8000-000000000001'::pg_catalog.uuid
    when 'expiry-payload' then
      'da331000-0000-4000-8000-000000000001'::pg_catalog.uuid
  end;
  v_privacy_id := case p_case
    when 'expiry-session' then
      'da312000-0000-4000-8000-000000000001'::pg_catalog.uuid
    when 'expiry-privacy' then
      'da322000-0000-4000-8000-000000000001'::pg_catalog.uuid
    when 'expiry-payload' then
      'da332000-0000-4000-8000-000000000001'::pg_catalog.uuid
  end;
  v_boundary := v_now + p_delay_milliseconds * interval '1 millisecond';

  update auth.sessions as active_session
  set not_after = case
      when p_case = 'expiry-session' then v_boundary
      else null
    end,
    updated_at = v_now
  where active_session.id = v_session_id
    and active_session.user_id = v_owner_id;
  if not found then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_FIXTURE_MISSING';
  end if;

  if p_case = 'expiry-privacy' then
    update public.privacy_reviews as review
    set confirmed_at = v_boundary - interval '30 minutes',
        expires_at = v_boundary,
        status = 'CONFIRMED'
    where review.id = v_privacy_id
      and review.owner_user_id = v_owner_id
      and review.note_type = 'communication'
      and review.shadow_only is true;
    v_payload_expires_at := v_boundary;
    v_expected_code := 'PRIVACY_REVIEW_STALE';
  else
    update public.privacy_reviews as review
    set confirmed_at = v_now,
        expires_at = v_now + interval '30 minutes',
        status = 'CONFIRMED'
    where review.id = v_privacy_id
      and review.owner_user_id = v_owner_id
      and review.note_type = 'communication'
      and review.shadow_only is true;
    if p_case = 'expiry-payload' then
      v_payload_expires_at := v_boundary;
      v_expected_code := 'PRIVACY_REVIEW_STALE';
    else
      v_payload_expires_at := v_now + interval '10 minutes';
      v_expected_code := 'SESSION_REVOKED';
    end if;
  end if;
  if not found then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_FIXTURE_MISSING';
  end if;

  return pg_catalog.jsonb_build_object(
    'case', p_case,
    'boundaryExpiresAt', pg_catalog.to_char(
      v_boundary at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'payloadExpiresAt', pg_catalog.to_char(
      v_payload_expires_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'expectedCode', v_expected_code
  );
end;
$$;

create function
  careslink_v1_communication_admission_concurrency_test_support.fixture_state(
    p_case pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_id pg_catalog.uuid;
  v_result pg_catalog.jsonb;
begin
  perform
    careslink_v1_communication_admission_concurrency_test_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-communication-admission-race-' || p_case || '-observer'
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CALLER_UNSAFE';
  end if;
  v_owner_id :=
    careslink_v1_communication_admission_concurrency_test_support._owner_id(
      p_case
    );
  if v_owner_id is null then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CASE_INVALID';
  end if;

  select pg_catalog.jsonb_build_object(
    'case', p_case,
    'jobCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.jobs as job
      where job.owner_user_id = v_owner_id
    ),
    'payloadCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payloads as payload
      where payload.owner_user_id = v_owner_id
    ),
    'quoteCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_quotes as quote
      where quote.owner_user_id = v_owner_id
    ),
    'reservationCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_reservations as reservation
      where reservation.owner_user_id = v_owner_id
    ),
    'allocationCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_reservation_allocations as allocation
      where allocation.owner_user_id = v_owner_id
    ),
    'allocationPoints', (
      select coalesce(
        pg_catalog.sum(allocation.points), 0
      )::pg_catalog.int4
      from public.point_reservation_allocations as allocation
      where allocation.owner_user_id = v_owner_id
    ),
    'bindingCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.communication_note_point_admissions
        as binding
      where binding.owner_user_id = v_owner_id
    ),
    'reserveLedgerCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_ledger_entries as ledger
      where ledger.owner_user_id = v_owner_id
        and ledger.event = 'RESERVE'
    ),
    'reserveDelta', (
      select coalesce(pg_catalog.sum(ledger.delta), 0)::pg_catalog.int4
      from public.point_ledger_entries as ledger
      where ledger.owner_user_id = v_owner_id
        and ledger.event = 'RESERVE'
    ),
    'grantLedgerCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_ledger_entries as ledger
      where ledger.owner_user_id = v_owner_id
        and ledger.event = 'GRANT'
    ),
    'lotRemaining', (
      select pg_catalog.sum(lot.remaining_points)::pg_catalog.int4
      from public.point_lots as lot
      where lot.owner_user_id = v_owner_id
    ),
    'jobIds', (
      select coalesce(
        pg_catalog.jsonb_agg(job.id order by job.id),
        '[]'::pg_catalog.jsonb
      )
      from careslink_v1_generation.jobs as job
      where job.owner_user_id = v_owner_id
    ),
    'payloadIds', (
      select coalesce(
        pg_catalog.jsonb_agg(payload.id order by payload.id),
        '[]'::pg_catalog.jsonb
      )
      from careslink_v1_generation.payloads as payload
      where payload.owner_user_id = v_owner_id
    ),
    'quoteIdempotencyKeys', (
      select coalesce(
        pg_catalog.jsonb_agg(
          quote.idempotency_key order by quote.idempotency_key
        ),
        '[]'::pg_catalog.jsonb
      )
      from public.point_quotes as quote
      where quote.owner_user_id = v_owner_id
    ),
    'reservationIdempotencyKeys', (
      select coalesce(
        pg_catalog.jsonb_agg(
          reservation.idempotency_key order by reservation.idempotency_key
        ),
        '[]'::pg_catalog.jsonb
      )
      from public.point_reservations as reservation
      where reservation.owner_user_id = v_owner_id
    ),
    'allQueuedAndBound', not exists (
      select 1
      from careslink_v1_generation.jobs as job
      where job.owner_user_id = v_owner_id
        and (
          job.status <> 'QUEUED'
          or job.communication_note_point_admission_id is null
        )
    )
  ) into v_result;

  return v_result;
end;
$$;

create function
  careslink_v1_communication_admission_concurrency_test_support.assert_generic_terminal_quarantine()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_id constant pg_catalog.uuid :=
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_reservation_id pg_catalog.uuid;
  v_commit_denied pg_catalog.bool := false;
  v_release_denied pg_catalog.bool := false;
  v_result pg_catalog.jsonb;
begin
  perform
    careslink_v1_communication_admission_concurrency_test_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-communication-admission-race-same-key-observer'
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CALLER_UNSAFE';
  end if;

  select binding.reservation_id
  into strict v_reservation_id
  from careslink_v1_generation.communication_note_point_admissions
    as binding
  where binding.owner_user_id = v_owner_id;

  begin
    perform public.commit_shadow_points(
      v_owner_id,
      v_reservation_id,
      'communication-admission-test-only-result',
      pg_catalog.clock_timestamp()
    );
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'PRODUCT_API_DISABLED' then
        v_commit_denied := true;
      else
        raise exception
          'COMMUNICATION_ADMISSION_CONCURRENCY_TERMINAL_GUARD_DRIFT';
      end if;
  end;
  if not v_commit_denied then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_COMMIT_ALLOWED';
  end if;

  begin
    perform public.release_shadow_points(
      v_owner_id,
      v_reservation_id,
      'COMMUNICATION_ADMISSION_TEST_ONLY',
      'RELEASE',
      pg_catalog.clock_timestamp()
    );
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'PRODUCT_API_DISABLED' then
        v_release_denied := true;
      else
        raise exception
          'COMMUNICATION_ADMISSION_CONCURRENCY_TERMINAL_GUARD_DRIFT';
      end if;
  end;
  if not v_release_denied then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_RELEASE_ALLOWED';
  end if;

  select pg_catalog.jsonb_build_object(
    'commitDenied', v_commit_denied,
    'releaseDenied', v_release_denied,
    'reservationStatus', reservation.status,
    'terminalLedgerCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_ledger_entries as terminal_ledger
      where terminal_ledger.reservation_id = reservation.id
        and terminal_ledger.event in ('COMMIT', 'RELEASE', 'EXPIRE')
    ),
    'reserveLedgerCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_ledger_entries as reserve_ledger
      where reserve_ledger.reservation_id = reservation.id
        and reserve_ledger.event = 'RESERVE'
    ),
    'lotRemaining', (
      select pg_catalog.sum(lot.remaining_points)::pg_catalog.int4
      from public.point_lots as lot
      where lot.owner_user_id = v_owner_id
    )
  )
  into v_result
  from public.point_reservations as reservation
  where reservation.id = v_reservation_id
    and reservation.owner_user_id = v_owner_id;

  if v_result is null then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_FIXTURE_MISSING';
  end if;
  return v_result;
end;
$$;

revoke all on function
  careslink_v1_communication_admission_concurrency_test_support._assert_runner(),
  careslink_v1_communication_admission_concurrency_test_support._owner_id(
    pg_catalog.text
  ),
  careslink_v1_communication_admission_concurrency_test_support.hold_points_lock(
    pg_catalog.text
  ),
  careslink_v1_communication_admission_concurrency_test_support.arm_expiry(
    pg_catalog.text,
    pg_catalog.int4
  ),
  careslink_v1_communication_admission_concurrency_test_support.fixture_state(
    pg_catalog.text
  ),
  careslink_v1_communication_admission_concurrency_test_support.assert_generic_terminal_quarantine(
  )
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_generation_executor,
  careslink_v1_generation_owner_api_executor,
  careslink_v1_generation_points_admission_executor,
  careslink_v1_communication_admission_concurrency_runner;

grant execute on function
  careslink_v1_communication_admission_concurrency_test_support.hold_points_lock(
    pg_catalog.text
  ),
  careslink_v1_communication_admission_concurrency_test_support.arm_expiry(
    pg_catalog.text,
    pg_catalog.int4
  ),
  careslink_v1_communication_admission_concurrency_test_support.fixture_state(
    pg_catalog.text
  ),
  careslink_v1_communication_admission_concurrency_test_support.assert_generic_terminal_quarantine(
  )
to careslink_v1_communication_admission_concurrency_runner;

grant execute on function
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.text,
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.timestamptz
  )
to careslink_v1_communication_admission_concurrency_runner;

do $$
begin
  if (
      select pg_catalog.count(*)
      from auth.users
      where email like 'communication-admission-%@example.invalid'
    ) <> 5
    or (select pg_catalog.count(*) from public.point_wallets) <> 5
    or (select pg_catalog.count(*) from public.point_lots) <> 5
    or (
      select pg_catalog.count(*)
      from public.point_ledger_entries
      where event = 'GRANT'
    ) <> 5
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.admission_policy_bindings
      where note_type = 'communication'
        and status = 'ACTIVE'
    ) <> 1
    or not exists (
      select 1
      from pg_catalog.pg_authid as runner
      where runner.rolname =
          'careslink_v1_communication_admission_concurrency_runner'
        and runner.rolcanlogin is true
        and runner.rolinherit is false
        and runner.rolsuper is false
        and runner.rolcreatedb is false
        and runner.rolcreaterole is false
        and runner.rolreplication is false
        and runner.rolbypassrls is false
        and runner.rolconnlimit = 3
        and runner.rolpassword is null
    )
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.member = pg_catalog.to_regrole(
        'careslink_v1_communication_admission_concurrency_runner'
      )
    )
    or not pg_catalog.has_database_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'postgres',
      'CONNECT'
    )
    or not pg_catalog.has_schema_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_generation',
      'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_generation',
      'CREATE'
    )
    or not pg_catalog.has_schema_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_communication_admission_concurrency_test_support',
      'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_communication_admission_concurrency_test_support',
      'CREATE'
    )
    or not pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_communication_admission_concurrency_test_support.hold_points_lock(text)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_communication_admission_concurrency_test_support.arm_expiry(text,integer)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_communication_admission_concurrency_test_support.fixture_state(text)',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_communication_admission_concurrency_test_support.assert_generic_terminal_quarantine()',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_communication_admission_concurrency_test_support._assert_runner()',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'careslink_v1_communication_admission_concurrency_test_support._owner_id(text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'public.commit_shadow_points(uuid,uuid,text,timestamptz)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'careslink_v1_communication_admission_concurrency_runner',
      'public.release_shadow_points(uuid,uuid,text,text,timestamptz)',
      'EXECUTE'
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
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'SELECT'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'INSERT'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'UPDATE'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'DELETE'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'TRUNCATE'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'REFERENCES'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'TRIGGER'
          )
          or pg_catalog.has_any_column_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'SELECT'
          )
          or pg_catalog.has_any_column_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'INSERT'
          )
          or pg_catalog.has_any_column_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'UPDATE'
          )
          or pg_catalog.has_any_column_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            relation.oid,
            'REFERENCES'
          )
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_class as sequence_record
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = sequence_record.relnamespace
      where namespace_record.nspname in (
          'auth', 'public', 'careslink_v1_generation'
        )
        and sequence_record.relkind = 'S'
        and (
          pg_catalog.has_sequence_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            sequence_record.oid,
            'USAGE'
          )
          or pg_catalog.has_sequence_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            sequence_record.oid,
            'SELECT'
          )
          or pg_catalog.has_sequence_privilege(
            'careslink_v1_communication_admission_concurrency_runner',
            sequence_record.oid,
            'UPDATE'
          )
        )
    )
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_POSTCHECK_FAILED';
  end if;
end;
$$;

commit;
