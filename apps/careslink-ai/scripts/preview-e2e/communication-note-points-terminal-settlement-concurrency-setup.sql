-- TEST_ONLY setup for atomic Communication Note Points terminal settlement.
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
  'careslink.cn_points_terminal.bootstrap_role',
  :'careslink_bootstrap_role',
  true
);

do $$
declare
  v_ssl pg_catalog.bool;
  v_bootstrap_role pg_catalog.text := pg_catalog.current_setting(
    'careslink.cn_points_terminal.bootstrap_role',
    true
  );
begin
  select ssl
  into v_ssl
  from pg_catalog.pg_stat_ssl
  where pid = pg_catalog.pg_backend_pid();

  if v_bootstrap_role is null
    or v_bootstrap_role !~ '^[a-z_][a-z0-9_]{0,62}$'
    or pg_catalog.octet_length(
      'careslink_v1_cn_points_terminal_runner'
    ) > 63
    or pg_catalog.octet_length(
      'careslink_v1_cn_points_terminal_support'
    ) > 63
    or 'careslink_v1_cn_points_terminal_runner' =
      'careslink_v1_cn_points_terminal_support'
    or exists (
      select 1
      from pg_catalog.unnest(array[
        'careslink.cn_points_terminal.marker',
        'careslink.cn_points_terminal.bootstrap_role',
        'careslink.cn_points_terminal.worker_identity_hash',
        'careslink.cn_points_terminal.worker_policy_digest',
        'careslink.cn_points_terminal.payload_policy_digest',
        'careslink.cn_points_terminal.kms_key_version_resource_hash',
        'careslink.cn_points_terminal.registration_digest',
        'careslink.cn_points_terminal.secondary_registration_digest'
      ]::pg_catalog.text[]) as custom_guc(name)
      where pg_catalog.octet_length(custom_guc.name) > 63
    )
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
      '^/private/tmp/careslink-points-terminal-pg16[.][A-Za-z0-9]{6,}/socket$'
    or pg_catalog.current_setting('unix_socket_permissions') <> '0700'
    or coalesce(v_ssl, false)
    or pg_catalog.current_setting(
      'careslink.cn_points_terminal.marker',
      true
    ) is distinct from
      '2026-09-02.local-pg16.communication-terminal.1'
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
    raise exception 'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SETUP_UNSAFE';
  end if;

  if pg_catalog.to_regrole(
      'careslink_v1_cn_points_terminal_runner'
    ) is not null
    or pg_catalog.to_regrole(
      'careslink_v1_cn_points_terminal_support'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_v1_cn_points_terminal_support'
    ) is not null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_points_admission_executor'
    ) is null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_points_settlement_executor'
    ) is null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_points_admission_caller'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,text,text,text,text,text)'
    ) is null
    or pg_catalog.to_regclass(
      'careslink_v1_generation.communication_note_point_admissions'
    ) is null
    or pg_catalog.to_regclass(
      'careslink_v1_generation.communication_note_point_settlements'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal()'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.recover_v1_shadow_note_generation_expired(text,text,text,text,text,text)'
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
    or not exists (
      select 1
      from pg_catalog.pg_trigger as terminal_coordinator
      where terminal_coordinator.tgrelid =
          'careslink_v1_generation.jobs'::pg_catalog.regclass
        and terminal_coordinator.tgfoid = pg_catalog.to_regprocedure(
          'careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal()'
        )
        and terminal_coordinator.tgenabled = 'O'
        and terminal_coordinator.tgisinternal is false
    )
  then
    raise exception 'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SCHEMA_DRIFT';
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
    raise exception 'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SCHEMA_DRIFT';
  end if;

  if exists (select 1 from careslink_v1_generation.jobs)
    or exists (select 1 from careslink_v1_generation.payloads)
    or exists (
      select 1
      from careslink_v1_generation.communication_note_point_admissions
    )
    or exists (
      select 1
      from careslink_v1_generation.communication_note_point_settlements
    )
    or exists (select 1 from careslink_v1_generation.attempts)
    or exists (select 1 from careslink_v1_generation.payload_grants)
    or exists (select 1 from careslink_v1_generation.provider_evidence)
    or exists (select 1 from careslink_v1_generation.payload_purge_outbox)
    or exists (select 1 from careslink_v1_generation.worker_policies)
    or exists (select 1 from careslink_v1_generation.provider_policies)
    or exists (select 1 from careslink_v1_generation.payload_policies)
    or exists (select 1 from careslink_v1_generation.worker_registrations)
    or exists (
      select 1
      from careslink_v1_generation.worker_registration_provider_policies
    )
    or exists (
      select 1
      from careslink_v1_generation.communication_note_paid_recovery_turns
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
    raise exception 'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_DATABASE_NOT_EMPTY';
  end if;
end;
$$;


create role careslink_v1_cn_points_terminal_runner
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
to careslink_v1_cn_points_terminal_runner;

create schema
  careslink_v1_cn_points_terminal_support
authorization postgres;

revoke all on schema
  careslink_v1_cn_points_terminal_support
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_generation_executor,
  careslink_v1_generation_owner_api_executor,
  careslink_v1_generation_points_admission_executor,
  careslink_v1_generation_points_settlement_executor,
  careslink_v1_cn_points_terminal_runner;

grant usage on schema
  careslink_v1_cn_points_terminal_support,
  careslink_v1_generation
to careslink_v1_cn_points_terminal_runner;

create temporary table communication_points_terminal_settlement_policy_values (
  note_type pg_catalog.text primary key,
  service_code pg_catalog.text not null,
  provider_digest pg_catalog.text not null
) on commit drop;

select pg_catalog.set_config(
  'careslink.cn_points_terminal.worker_identity_hash',
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'test-only-communication-terminal-worker-identity',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  true
);

select pg_catalog.set_config(
  'careslink.cn_points_terminal.worker_policy_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-worker-policy',
      'version', 'worker.communication-terminal-concurrency.20260902.v1',
      'status', 'APPROVED',
      'maxQueueAgeMs', 1800000,
      'minimumPayloadRemainingAtClaimMs', 2000,
      'leaseDurationMs', 2000,
      'heartbeatIntervalMs', 500,
      'heartbeatSafetyMarginMs', 100,
      'attemptDeadlineMs', 2000,
      'providerDeadlineMs', 1000,
      'commitSafetyMarginMs', 500,
      'maxAttempts', 2,
      'retryDelayMsAfterAttempt', pg_catalog.jsonb_build_array(1),
      'retryableOutcomes', pg_catalog.jsonb_build_array(
        'LEASE_EXPIRED', 'PROVIDER_TIMEOUT'
      ),
      'recoveryBatchLimit', 1,
      'jitter', pg_catalog.jsonb_build_object('mode', 'NONE')
    )
  ),
  true
);

select pg_catalog.set_config(
  'careslink.cn_points_terminal.payload_policy_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'policyVersion',
        'payload.communication-terminal-concurrency.20260902.v1',
      'encryptionProfileVersion', 'encryption.test-only.v1',
      'backupDispositionVersion', 'backup.test-only.v1'
    )
  ),
  true
);

select pg_catalog.set_config(
  'careslink.cn_points_terminal.kms_key_version_resource_hash',
  pg_catalog.repeat('8', 64),
  true
);

insert into communication_points_terminal_settlement_policy_values (
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
        'provider.communication-terminal-concurrency.20260902.v1',
      'promptTemplateVersion', 'prompt.test-only.v1',
      'goldenSetVersion', 'golden.test-only.v1',
      'parserVersion', 'parser.test-only.v1',
      'timeoutMs', 1000
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
  'careslink.cn_points_terminal.registration_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-registered-worker',
      'registrationVersion',
        'registration.communication-terminal-concurrency.20260902.v1',
      'status', 'APPROVED',
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'workerIdentityVersion', 'worker-identity.test-only.v1',
      'workerIdentityHash', pg_catalog.current_setting(
        'careslink.cn_points_terminal.worker_identity_hash'
      ),
      'workerPolicyVersion',
        'worker.communication-terminal-concurrency.20260902.v1',
      'workerPolicyDigest', pg_catalog.current_setting(
        'careslink.cn_points_terminal.worker_policy_digest'
      ),
      'payloadPolicyVersion',
        'payload.communication-terminal-concurrency.20260902.v1',
      'payloadPolicySnapshotHash', pg_catalog.current_setting(
        'careslink.cn_points_terminal.payload_policy_digest'
      ),
      'providerPolicies', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'noteType', policy.note_type,
            'policyVersion',
              'provider.communication-terminal-concurrency.20260902.v1',
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
        from communication_points_terminal_settlement_policy_values as policy
      )
    )
  ),
  true
);

select pg_catalog.set_config(
  'careslink.cn_points_terminal.secondary_registration_digest',
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'kind', 'careslink.v1.note-generation-registered-worker',
      'registrationVersion',
        'registration.communication-terminal-concurrency.20260902.v2',
      'status', 'APPROVED',
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'workerIdentityVersion', 'worker-identity.test-only.v1',
      'workerIdentityHash', pg_catalog.current_setting(
        'careslink.cn_points_terminal.worker_identity_hash'
      ),
      'workerPolicyVersion',
        'worker.communication-terminal-concurrency.20260902.v1',
      'workerPolicyDigest', pg_catalog.current_setting(
        'careslink.cn_points_terminal.worker_policy_digest'
      ),
      'payloadPolicyVersion',
        'payload.communication-terminal-concurrency.20260902.v1',
      'payloadPolicySnapshotHash', pg_catalog.current_setting(
        'careslink.cn_points_terminal.payload_policy_digest'
      ),
      'providerPolicies', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'noteType', policy.note_type,
            'policyVersion',
              'provider.communication-terminal-concurrency.20260902.v1',
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
        from communication_points_terminal_settlement_policy_values as policy
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
  'worker.communication-terminal-concurrency.20260902.v1',
  'APPROVED', 1800000, 2000, 2000, 500, 100, 2000, 1000, 500, 2,
  array[1]::pg_catalog.int8[],
  array['LEASE_EXPIRED', 'PROVIDER_TIMEOUT']::pg_catalog.text[], 1,
  'NONE', null,
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.worker_policy_digest'
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
  'provider.communication-terminal-concurrency.20260902.v1',
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
  1000,
  policy.provider_digest,
  true
from communication_points_terminal_settlement_policy_values as policy;

insert into careslink_v1_generation.payload_policies (
  policy_version, status, encryption_profile_version,
  kms_key_version_resource_hash, backup_disposition_version, policy_digest,
  shadow_only
) values (
  'payload.communication-terminal-concurrency.20260902.v1',
  'APPROVED',
  'encryption.test-only.v1',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.kms_key_version_resource_hash'
  ),
  'backup.test-only.v1',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.payload_policy_digest'
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
    'careslink.cn_points_terminal.registration_digest'
  ),
  'registration.communication-terminal-concurrency.20260902.v1',
  'APPROVED',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'worker-identity.test-only.v1',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.worker_identity_hash'
  ),
  'worker.communication-terminal-concurrency.20260902.v1',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.worker_policy_digest'
  ),
  'payload.communication-terminal-concurrency.20260902.v1',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.payload_policy_digest'
  ),
  true
), (
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.secondary_registration_digest'
  ),
  'registration.communication-terminal-concurrency.20260902.v2',
  'APPROVED',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'worker-identity.test-only.v1',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.worker_identity_hash'
  ),
  'worker.communication-terminal-concurrency.20260902.v1',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.worker_policy_digest'
  ),
  'payload.communication-terminal-concurrency.20260902.v1',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.payload_policy_digest'
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
    'careslink.cn_points_terminal.registration_digest'
  ),
  policy.note_type,
  'provider.communication-terminal-concurrency.20260902.v1',
  policy.provider_digest,
  true
from communication_points_terminal_settlement_policy_values as policy;

insert into
  careslink_v1_generation.worker_registration_provider_policies (
    registration_digest, note_type, policy_version, policy_digest,
    shadow_only
  )
select
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.secondary_registration_digest'
  ),
  policy.note_type,
  'provider.communication-terminal-concurrency.20260902.v1',
  policy.provider_digest,
  true
from communication_points_terminal_settlement_policy_values as policy;

insert into careslink_v1_generation.admission_policy_bindings (
  binding_version, note_type, registration_digest, status, activated_at,
  created_at, shadow_only
) values (
  'binding.communication-terminal-concurrency.20260902.v1',
  'communication',
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.registration_digest'
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
    'communication-terminal-replay@example.invalid'),
  ('da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-terminal-points@example.invalid'),
  ('da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-terminal-session-expiry@example.invalid'),
  ('da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-terminal-privacy-expiry@example.invalid'),
  ('da330000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-terminal-payload-expiry@example.invalid')
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
    'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('da351000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('db351000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('dd351000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid),
  ('dc351000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid)
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
  public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'occurred_at', '2026-09-02T00:00:00Z',
      'contact_channel', 'phone',
      'parties_by_role', pg_catalog.jsonb_build_array('support worker'),
      'observable_facts', 'TEST_ONLY terminal settlement fixture',
      'action_taken', 'TEST_ONLY documented'
    )
  ),
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
    '9', 'a', 'privacy.communication.admission.payload'),
  ('da352000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'b', '1', 'privacy.communication.terminal.timing-boundaries'),
  ('db352000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'c', '7', 'privacy.communication.terminal.clock'),
  ('dd352000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'e', 'f', 'privacy.communication.terminal.denied-clock'),
  ('dc352000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd', 'd', 'privacy.communication.terminal.success-clock')
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
    'communication-terminal-replay'),
  ('da240000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da230000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-terminal-points'),
  ('da314000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da313000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-terminal-session-expiry'),
  ('da324000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da323000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-terminal-privacy-expiry'),
  ('da334000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da333000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'communication-terminal-payload-expiry')
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
  careslink_v1_cn_points_terminal_support._assert_runner()
returns pg_catalog.void
language plpgsql
volatile
security definer
set search_path = ''
set careslink.cn_points_terminal.bootstrap_role from current
as $$
begin
  if session_user <>
      'careslink_v1_cn_points_terminal_runner'
    or current_user <> pg_catalog.current_setting(
      'careslink.cn_points_terminal.bootstrap_role'
    )
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) !~ '^careslink-cn-terminal-(terminal-failure|retry-success-replay|queued-expiry-recovery|short-grant-denial|authority-bounds-cancel|timing-boundaries)-(a|b|observer)$'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;
end;
$$;

create function
  careslink_v1_cn_points_terminal_support._fixture(
    p_case pg_catalog.text
  )
returns table (
  owner_id pg_catalog.uuid,
  session_id pg_catalog.uuid,
  privacy_id pg_catalog.uuid,
  job_id pg_catalog.uuid,
  payload_id pg_catalog.uuid,
  idempotency_hash pg_catalog.text,
  request_hash pg_catalog.text,
  payload_handle_hash pg_catalog.text
)
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select fixture.owner_id, fixture.session_id, fixture.privacy_id,
    fixture.job_id, fixture.payload_id, fixture.idempotency_hash,
    fixture.request_hash, fixture.payload_handle_hash
  from (values
    (
      'terminal-failure',
      'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da150000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da160000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('b', 64), repeat('2', 64), repeat('c', 64)
    ),
    (
      'retry-success-replay',
      'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da210000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da220000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da250000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da260000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('d', 64), repeat('4', 64), repeat('e', 64)
    ),
    (
      'queued-expiry-recovery',
      'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da311000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da312000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da315000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da316000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('5', 64), repeat('6', 64), repeat('7', 64)
    ),
    (
      'short-grant-denial',
      'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da321000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da322000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da325000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da326000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('8', 64), repeat('8', 64), repeat('9', 64)
    ),
    (
      'authority-bounds-cancel',
      'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da331000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da332000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da335000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da336000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('a', 64), repeat('a', 64), repeat('b', 64)
    ),
    (
      'timing-boundaries',
      'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da351000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da352000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da350000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da360000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('4', 64), repeat('1', 64), repeat('3', 64)
    ),
    (
      'terminal-clock',
      'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'db351000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'db352000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'db350000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'db360000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('6', 64), repeat('7', 64), repeat('8', 64)
    ),
    (
      'success-clock',
      'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'dc351000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'dc352000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'dc350000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'dc360000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('9', 64), repeat('d', 64), repeat('e', 64)
    ),
    (
      'denied-clock',
      'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'dd351000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'dd352000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'dd350000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'dd360000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('2', 64), repeat('f', 64), repeat('0', 64)
    ),
    (
      'paid-running-recovery',
      'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'db150000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'db160000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      repeat('f', 64), repeat('e', 64), repeat('d', 64)
    )
  ) as fixture(
    case_name, owner_id, session_id, privacy_id, job_id, payload_id,
    idempotency_hash, request_hash, payload_handle_hash
  )
  where fixture.case_name = p_case
$$;

create function
  careslink_v1_cn_points_terminal_support.fixture_catalog()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result pg_catalog.jsonb;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();

  select pg_catalog.jsonb_build_object(
    'contractVersion', '1.0.0-shadow.1',
    'schemaVersion', '2026-08-09.v1-shadow',
    'workerPolicyVersion', policy.version,
    'workerPolicyDigest', policy.policy_digest,
    'workerIdentityHash', registration.worker_identity_hash,
    'registrationDigest', registration.registration_digest,
    'secondaryRegistrationDigest', (
      select secondary.registration_digest
      from careslink_v1_generation.worker_registrations as secondary
      where secondary.registration_version =
          'registration.communication-terminal-concurrency.20260902.v2'
        and secondary.status = 'APPROVED'
        and secondary.shadow_only is true
    ),
    'providerDeadlineMs', policy.provider_deadline_ms,
    'minimumPayloadRemainingAtClaimMs',
      policy.minimum_payload_remaining_at_claim_ms,
    'cases', (
      select pg_catalog.jsonb_object_agg(
        case_name,
        pg_catalog.jsonb_build_object(
          'ownerId', fixture.owner_id,
          'sessionId', fixture.session_id,
          'privacyId', fixture.privacy_id,
          'jobId', fixture.job_id,
          'payloadId', fixture.payload_id
        )
        order by case_name
      )
      from pg_catalog.unnest(array[
        'terminal-failure',
        'retry-success-replay',
        'queued-expiry-recovery',
        'short-grant-denial',
        'authority-bounds-cancel',
        'timing-boundaries'
      ]::pg_catalog.text[]) as scenario(case_name)
      cross join lateral
        careslink_v1_cn_points_terminal_support._fixture(
          scenario.case_name
        ) as fixture
    )
  )
  into v_result
  from careslink_v1_generation.worker_policies as policy
  join careslink_v1_generation.worker_registrations as registration
    on registration.worker_policy_version = policy.version
   and registration.worker_policy_digest = policy.policy_digest
  where policy.version =
      'worker.communication-terminal-concurrency.20260902.v1'
    and registration.registration_version =
      'registration.communication-terminal-concurrency.20260902.v1'
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  if v_result is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;
  return v_result;
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.admit_case(
    p_case pg_catalog.text,
    p_payload_remaining_ms pg_catalog.int4
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fixture record;
  v_payload_policy record;
  v_now pg_catalog.timestamptz;
  v_payload_expires_at pg_catalog.timestamptz;
  v_cleaned_facts_hash pg_catalog.text;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if p_payload_remaining_ms is null
    or p_payload_remaining_ms < 250
    or p_payload_remaining_ms > 1800000
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_EXPIRY_INVALID';
  end if;

  select * into v_fixture
  from careslink_v1_cn_points_terminal_support._fixture(
    p_case
  );
  if v_fixture.owner_id is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CASE_INVALID';
  end if;

  select
    policy.policy_version,
    policy.policy_digest,
    policy.encryption_profile_version,
    policy.kms_key_version_resource_hash,
    policy.backup_disposition_version
  into v_payload_policy
  from careslink_v1_generation.payload_policies as policy
  where policy.policy_version =
      'payload.communication-terminal-concurrency.20260902.v1'
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;
  if not found
    or v_payload_policy.kms_key_version_resource_hash is null
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  v_now := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  select payload.expires_at into v_payload_expires_at
  from careslink_v1_generation.payloads as payload
  where payload.id = v_fixture.payload_id
    and payload.job_id = v_fixture.job_id
    and payload.owner_user_id = v_fixture.owner_id;
  v_payload_expires_at := coalesce(
    v_payload_expires_at,
    v_now + p_payload_remaining_ms * interval '1 millisecond'
  );
  v_cleaned_facts_hash := public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'occurred_at', '2026-09-02T00:00:00Z',
      'contact_channel', 'phone',
      'parties_by_role', pg_catalog.jsonb_build_array('support worker'),
      'observable_facts', 'TEST_ONLY terminal settlement fixture',
      'action_taken', 'TEST_ONLY documented'
    )
  );

  return
    careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(
      v_fixture.owner_id,
      v_fixture.session_id,
      'BEARER',
      v_fixture.job_id,
      v_fixture.payload_id,
      v_fixture.privacy_id,
      'en',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow',
      v_cleaned_facts_hash,
      v_fixture.idempotency_hash,
      v_fixture.request_hash,
      v_fixture.payload_handle_hash,
      v_payload_expires_at,
      v_payload_policy.policy_version,
      v_payload_policy.policy_digest,
      v_payload_policy.encryption_profile_version,
      v_payload_policy.kms_key_version_resource_hash,
      v_payload_policy.backup_disposition_version
    );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.hold_paid_recovery_lock()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-queued-expiry-recovery-a'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'careslink:v1:communication-note:points:paid-recovery',
      0
    )
  );
  return true;
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.hold_job_lock(
    p_case pg_catalog.text
  )
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fixture record;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  select * into v_fixture
  from careslink_v1_cn_points_terminal_support._fixture(
    p_case
  );
  if v_fixture.job_id is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CASE_INVALID';
  end if;
  perform job.id
  from careslink_v1_generation.jobs as job
  where job.id = v_fixture.job_id
    and job.owner_user_id = v_fixture.owner_id
  for update;
  if not found then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;
  return true;
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.age_queue_deadline(
    p_case pg_catalog.text,
    p_remaining_ms pg_catalog.int4
  )
returns pg_catalog.text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fixture record;
  v_deadline pg_catalog.timestamptz;
  v_max_queue_age_ms pg_catalog.int8;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if p_case <> 'timing-boundaries'
    or p_remaining_ms is null
    or p_remaining_ms < 250
    or p_remaining_ms > 3000
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_EXPIRY_INVALID';
  end if;

  select * into v_fixture
  from careslink_v1_cn_points_terminal_support._fixture(p_case);
  select policy.max_queue_age_ms
  into v_max_queue_age_ms
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.worker_policies as policy
    on policy.version = job.worker_policy_version
   and policy.policy_digest = job.worker_policy_digest
  where job.id = v_fixture.job_id
    and job.owner_user_id = v_fixture.owner_id
    and job.status = 'QUEUED'
    and job.attempt_count = 0
  for update of job;
  if v_max_queue_age_ms is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  v_deadline := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp() +
      p_remaining_ms * interval '1 millisecond'
  );
  update careslink_v1_generation.jobs as job
  set created_at =
    v_deadline - v_max_queue_age_ms * interval '1 millisecond'
  where job.id = v_fixture.job_id
    and job.owner_user_id = v_fixture.owner_id
    and job.status = 'QUEUED'
    and job.attempt_count = 0;
  if not found then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  return careslink_v1_generation._server_time(v_deadline);
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.hold_payload_lock(
    p_case pg_catalog.text
  )
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fixture record;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if p_case not in (
    'timing-boundaries', 'terminal-clock', 'success-clock'
  ) then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CASE_INVALID';
  end if;
  select * into v_fixture
  from careslink_v1_cn_points_terminal_support._fixture(p_case);
  perform payload.id
  from careslink_v1_generation.payloads as payload
  where payload.id = v_fixture.payload_id
    and payload.job_id = v_fixture.job_id
    and payload.owner_user_id = v_fixture.owner_id
  for update;
  if not found then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;
  return true;
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.hold_point_reservation_lock(
    p_case pg_catalog.text
  )
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fixture record;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if p_case <> 'denied-clock'
    or pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-timing-boundaries-observer'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;
  select * into v_fixture
  from careslink_v1_cn_points_terminal_support._fixture(p_case);
  if v_fixture.job_id is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CASE_INVALID';
  end if;
  perform
    careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
      v_fixture.job_id,
      v_fixture.owner_id
    );
  return true;
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.consume_grant_test_only(
    p_job_id pg_catalog.uuid,
    p_grant_id pg_catalog.uuid
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_grant record;
  v_now pg_catalog.timestamptz;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and (job.id, job.owner_user_id) in (
      (
        'da250000-0000-4000-8000-000000000001'::pg_catalog.uuid,
        'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid
      ),
      (
        'da335000-0000-4000-8000-000000000001'::pg_catalog.uuid,
        'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
      ),
      (
        'dc350000-0000-4000-8000-000000000001'::pg_catalog.uuid,
        'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid
      )
    )
    and job.status = 'RUNNING'
  for update of job;
  if v_job.id is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  select grant_record.* into v_grant
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.id = p_grant_id
    and grant_record.job_id = v_job.id
    and grant_record.payload_id = v_job.payload_id
    and grant_record.owner_user_id = v_job.owner_user_id
    and grant_record.status = 'ISSUED'
  for update;
  if v_grant.id is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  v_now := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  update careslink_v1_generation.payload_grants as grant_record
  set status = 'CONSUMED',
      consumed_at = v_now,
      vault_grant_hash = public.v1_shadow_content_sha256(
        pg_catalog.jsonb_build_object(
          'testOnly', true,
          'grantId', v_grant.id,
          'jobId', v_job.id,
          'attemptId', v_grant.attempt_id
        )
      )
  where grant_record.id = v_grant.id
    and grant_record.status = 'ISSUED';
  if not found then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'CONSUMED',
    'grantId', v_grant.id,
    'consumedAt', careslink_v1_generation._server_time(v_now)
  );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.assert_incomplete_fence_denied(
    p_job_id pg_catalog.uuid,
    p_attempt_id pg_catalog.uuid
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fixture record;
  v_attempt careslink_v1_generation.attempts%rowtype;
  v_denied pg_catalog.bool := false;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-authority-bounds-cancel-observer'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;
  select * into v_fixture
  from careslink_v1_cn_points_terminal_support._fixture(
    'authority-bounds-cancel'
  );
  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.job_id = v_fixture.job_id
    and attempt.owner_user_id = v_fixture.owner_id
    and attempt.status = 'RUNNING'
    and attempt.fence_id is null
    and attempt.fence_digest is null
    and attempt.fenced_at is null
    and attempt.fence_expires_at is null
  for update;
  if v_attempt.id is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  begin
    update careslink_v1_generation.attempts as attempt
    set fence_id = extensions.gen_random_uuid()
    where attempt.id = v_attempt.id;
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'LEASE_EXPIRED' then
        v_denied := true;
      else
        raise exception
          'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FENCE_GUARD_DRIFT';
      end if;
  end;

  return pg_catalog.jsonb_build_object(
    'denied', v_denied,
    'unchanged', exists (
      select 1
      from careslink_v1_generation.attempts as attempt
      where attempt.id = v_attempt.id
        and attempt.status = 'RUNNING'
        and attempt.fence_id is null
        and attempt.fence_digest is null
        and attempt.fenced_at is null
        and attempt.fence_expires_at is null
    )
  );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.commit_success_test_only(
    p_job_id pg_catalog.uuid,
    p_attempt_id pg_catalog.uuid,
    p_lease_token pg_catalog.text,
    p_fence_id pg_catalog.uuid,
    p_fence_digest pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_attempt record;
  v_provider record;
  v_evidence_at pg_catalog.timestamptz;
  v_candidate pg_catalog.jsonb;
  v_content pg_catalog.jsonb;
  v_content_hash pg_catalog.text;
  v_evidence pg_catalog.jsonb;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  -- Prove the terminal helper restores its own named constraint to DEFERRED
  -- even when the outer caller deliberately enters with it IMMEDIATE.
  set constraints
    careslink_v1_generation.communication_note_point_settlements_consistency_trigger
    immediate;
  select job.* into v_job
  from careslink_v1_generation.jobs as job
  join (
    select retry_fixture.*
    from careslink_v1_cn_points_terminal_support._fixture(
      'retry-success-replay'
    ) as retry_fixture
    union all
    select timing_fixture.*
    from careslink_v1_cn_points_terminal_support._fixture(
      'success-clock'
    ) as timing_fixture
  ) as fixture
    on fixture.job_id = job.id
   and fixture.owner_id = job.owner_user_id
  where job.id = p_job_id
    and job.status in ('RUNNING', 'SUCCEEDED')
  for update of job;
  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
    and attempt.status in ('RUNNING', 'SUCCEEDED')
  for update;
  select policy.* into v_provider
  from careslink_v1_generation.provider_policies as policy
  where policy.note_type = 'communication'
    and policy.policy_version = v_job.provider_policy_version
    and policy.policy_digest = v_job.provider_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;
  if v_job.id is null or v_attempt.id is null or v_provider.note_type is null
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  v_candidate := pg_catalog.jsonb_build_object(
    'englishDraft', 'Observable support facts were documented.',
    'reviewVersions', pg_catalog.jsonb_build_object(
      'zh-Hans', '已记录可观察的支持事实。',
      'zh-Hant', '已記錄可觀察的支援事實。'
    ),
    'missingFacts', '[]'::pg_catalog.jsonb,
    'neutralWordingChecks', '[]'::pg_catalog.jsonb,
    'followUpPrompts', '[]'::pg_catalog.jsonb
  );
  v_content := v_candidate || pg_catalog.jsonb_build_object(
    'factsSummary', pg_catalog.jsonb_build_object(
      'occurred_at', '2026-09-02T00:00:00Z',
      'contact_channel', 'phone',
      'parties_by_role', pg_catalog.jsonb_build_array('support worker'),
      'observable_facts', 'TEST_ONLY terminal settlement fixture',
      'action_taken', 'TEST_ONLY documented'
    ),
    'disclaimer',
      'User-reviewed draft wording based only on the details entered. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice. General documentation support only.'
  );
  v_content_hash := public.v1_shadow_content_sha256(v_content);
  v_evidence_at := v_attempt.acquired_at;
  v_evidence := pg_catalog.jsonb_build_object(
    'policyDigest', v_provider.policy_digest,
    'providerId', v_provider.provider_id,
    'modelId', v_provider.model_id,
    'modelRevision', v_provider.model_revision,
    'modelRevisionAvailability', v_provider.model_revision_availability,
    'policyVersion', v_provider.policy_version,
    'promptTemplateVersion', v_provider.prompt_template_version,
    'goldenSetVersion', v_provider.golden_set_version,
    'parserVersion', v_provider.parser_version,
    'serviceCode', v_provider.service_code,
    'rateCatalogVersion', v_provider.rate_catalog_version,
    'timeoutMs', v_provider.timeout_ms,
    'workerPolicyDigest', v_job.worker_policy_digest,
    'deadlineAt', careslink_v1_generation._server_time(
      v_evidence_at + v_provider.timeout_ms * interval '1 millisecond'
    ),
    'startedAt', careslink_v1_generation._server_time(v_evidence_at),
    'finishedAt', careslink_v1_generation._server_time(v_evidence_at),
    'durationMs', 0,
    'finishReason', 'COMPLETED',
    'providerRequestIdHash', null,
    'usage', pg_catalog.jsonb_build_object(
      'status', 'UNAVAILABLE', 'source', 'UNAVAILABLE'
    ),
    'cost', pg_catalog.jsonb_build_object(
      'status', 'UNAVAILABLE', 'source', 'UNAVAILABLE'
    ),
    'candidateDigest', public.v1_shadow_content_sha256(v_candidate)
  );

  return careslink_v1_generation.commit_v1_shadow_note_generation_success(
    p_job_id,
    p_attempt_id,
    p_lease_token,
    v_attempt.registration_digest,
    v_job.worker_policy_version,
    v_job.worker_policy_digest,
    p_fence_id,
    p_fence_digest,
    v_content,
    v_content_hash,
    v_evidence
  );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.advance_success_document_test_only(
    p_job_id pg_catalog.uuid
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fixture record;
  v_job careslink_v1_generation.jobs%rowtype;
  v_document public.ai_documents%rowtype;
  v_revision public.ai_document_revisions%rowtype;
  v_sync_enabled pg_catalog.bool;
  v_append pg_catalog.jsonb;
  v_tombstone pg_catalog.jsonb;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  select * into v_fixture
  from careslink_v1_cn_points_terminal_support._fixture(
    'retry-success-replay'
  );
  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.id = v_fixture.job_id
    and job.owner_user_id = v_fixture.owner_id
    and job.status = 'SUCCEEDED'
  for update;
  select document.* into v_document
  from public.ai_documents as document
  where document.id = v_job.result_document_id
    and document.owner_user_id = v_job.owner_user_id
    and document.current_revision_id = v_job.result_revision_id
    and document.current_revision_number = 1
    and document.lifecycle_status = 'IN_PROGRESS'
  for update;
  select revision.* into v_revision
  from public.ai_document_revisions as revision
  where revision.id = v_job.result_revision_id
    and revision.document_id = v_job.result_document_id
    and revision.owner_user_id = v_job.owner_user_id;
  if v_job.id is null or v_document.id is null or v_revision.id is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  select flag.enabled into v_sync_enabled
  from public.v1_mobile_sync_shadow_flags as flag
  where flag.feature_key = 'mobile_sync_v1'
    and flag.shadow_only is true
  for update;
  if v_sync_enabled is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;
  update public.v1_mobile_sync_shadow_flags as flag
  set enabled = true,
      updated_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.clock_timestamp()
      )
  where flag.feature_key = 'mobile_sync_v1';

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_fixture.owner_id,
      'session_id', v_fixture.session_id,
      'role', 'authenticated'
    )::pg_catalog.text,
    true
  );
  v_append := public.append_v1_shadow_document_revision(
    v_document.id,
    v_revision.id,
    v_revision.content,
    v_revision.content_hash,
    'terminal-replay:append:' || public.v1_shadow_content_sha256(
      pg_catalog.to_jsonb(v_job.id::pg_catalog.text)
    ),
    v_revision.schema_version,
    v_revision.contract_version,
    v_revision.privacy_review_id
  );
  v_tombstone := public.tombstone_v1_shadow_document(
    v_document.id,
    (v_append #>> '{revision,revisionId}')::pg_catalog.uuid,
    'owner_requested',
    'terminal-replay:tombstone:' || public.v1_shadow_content_sha256(
      pg_catalog.to_jsonb(v_job.id::pg_catalog.text)
    )
  );

  update public.v1_mobile_sync_shadow_flags as flag
  set enabled = v_sync_enabled,
      updated_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.clock_timestamp()
      )
  where flag.feature_key = 'mobile_sync_v1';

  return pg_catalog.jsonb_build_object(
    'append', v_append,
    'tombstone', v_tombstone,
    'revisionNumber', v_append #> '{revision,revisionNumber}',
    'lifecycleStatus', v_tombstone #> '{document,lifecycleStatus}'
  );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.fixture_state(
    p_case pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fixture record;
  v_reservation_id pg_catalog.uuid;
  v_result pg_catalog.jsonb;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  select * into v_fixture
  from careslink_v1_cn_points_terminal_support._fixture(
    p_case
  );
  if v_fixture.owner_id is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CASE_INVALID';
  end if;

  select binding.reservation_id into v_reservation_id
  from careslink_v1_generation.communication_note_point_admissions as binding
  where binding.job_id = v_fixture.job_id
    and binding.owner_user_id = v_fixture.owner_id;

  select pg_catalog.jsonb_build_object(
    'case', p_case,
    'jobId', v_fixture.job_id,
    'jobStatus', job.status,
    'attemptCount', job.attempt_count,
    'jobFailureReason', job.failure_reason,
    'jobFinishedAt', case
      when job.finished_at is null then null
      else careslink_v1_generation._server_time(job.finished_at)
    end,
    'resultDocumentId', job.result_document_id,
    'resultRevisionId', job.result_revision_id,
    'resultContentHash', job.result_content_hash,
    'documentCurrentRevisionId', result_document.current_revision_id,
    'documentCurrentRevisionNumber', result_document.current_revision_number,
    'documentLifecycleStatus', result_document.lifecycle_status,
    'attempts', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'attemptId', attempt.id,
            'attemptNumber', attempt.attempt_number,
            'status', attempt.status,
            'failureReason', attempt.failure_reason,
            'terminalTransactionId', attempt.terminal_transaction_id,
            'acquiredAt', careslink_v1_generation._server_time(
              attempt.acquired_at
            ),
            'finishedAt', case
              when attempt.finished_at is null then null
              else careslink_v1_generation._server_time(attempt.finished_at)
            end,
            'baseDelayMs', attempt.settlement_base_delay_ms,
            'jitterMs', attempt.settlement_jitter_ms,
            'retryDelayMs', attempt.settlement_retry_delay_ms,
            'leaseExpiresAt', careslink_v1_generation._server_time(
              attempt.lease_expires_at
            ),
            'fenceExpiresAt', case
              when attempt.fence_expires_at is null then null
              else careslink_v1_generation._server_time(
                attempt.fence_expires_at
              )
            end
          )
          order by attempt.attempt_number
        ),
        '[]'::pg_catalog.jsonb
      )
      from careslink_v1_generation.attempts as attempt
      where attempt.job_id = v_fixture.job_id
        and attempt.owner_user_id = v_fixture.owner_id
    ),
    'reservationStatus', reservation.status,
    'reservationExpiresAt', careslink_v1_generation._server_time(
      reservation.expires_at
    ),
    'reservationTerminalAt', case
      when reservation.terminal_at is null then null
      else careslink_v1_generation._server_time(reservation.terminal_at)
    end,
    'settlementCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.communication_note_point_settlements
        as settlement_count
      where settlement_count.job_id = v_fixture.job_id
        and settlement_count.owner_user_id = v_fixture.owner_id
    ),
    'settlementJobStatus', settlement.job_status,
    'settlementReservationStatus', settlement.reservation_status,
    'settlementAttemptId', settlement.attempt_id,
    'settlementAttemptNumber', settlement_attempt.attempt_number,
    'settlementReason', settlement.reason_code,
    'settlementSettledAt', case
      when settlement.settled_at is null then null
      else careslink_v1_generation._server_time(settlement.settled_at)
    end,
    'settlementPoints', settlement.points,
    'settlementAllocationPoints', settlement.allocation_points,
    'settlementRestoredPoints', settlement.restored_points,
    'settlementResultRef', settlement.result_ref,
    'reserveLedgerCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_ledger_entries as reserve_ledger
      where reserve_ledger.reservation_id = v_reservation_id
        and reserve_ledger.owner_user_id = v_fixture.owner_id
        and reserve_ledger.event = 'RESERVE'
    ),
    'terminalLedgerCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.point_ledger_entries as terminal_ledger
      where terminal_ledger.reservation_id = v_reservation_id
        and terminal_ledger.owner_user_id = v_fixture.owner_id
        and terminal_ledger.event in ('COMMIT', 'RELEASE', 'EXPIRE')
    ),
    'terminalLedgerEvent', terminal_ledger.event,
    'terminalLedgerCreatedAt', case
      when terminal_ledger.created_at is null then null
      else careslink_v1_generation._server_time(terminal_ledger.created_at)
    end,
    'lotRemaining', (
      select pg_catalog.sum(lot.remaining_points)::pg_catalog.int4
      from public.point_lots as lot
      where lot.owner_user_id = v_fixture.owner_id
    ),
    'grantCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_grants as grant_count
      where grant_count.job_id = v_fixture.job_id
        and grant_count.owner_user_id = v_fixture.owner_id
    ),
    'issuedGrantCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_grants as issued_grant
      where issued_grant.job_id = v_fixture.job_id
        and issued_grant.owner_user_id = v_fixture.owner_id
        and issued_grant.status = 'ISSUED'
    ),
    'consumedGrantCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_grants as consumed_grant
      where consumed_grant.job_id = v_fixture.job_id
        and consumed_grant.owner_user_id = v_fixture.owner_id
        and consumed_grant.status = 'CONSUMED'
    ),
    'revokedGrantCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_grants as revoked_grant
      where revoked_grant.job_id = v_fixture.job_id
        and revoked_grant.owner_user_id = v_fixture.owner_id
        and revoked_grant.status = 'REVOKED'
    ),
    'authorityBoundsValid', not exists (
      select 1
      from careslink_v1_generation.attempts as bounded_attempt
      where bounded_attempt.job_id = v_fixture.job_id
        and bounded_attempt.owner_user_id = v_fixture.owner_id
        and (
          bounded_attempt.lease_expires_at > reservation.expires_at
          or bounded_attempt.fence_expires_at > reservation.expires_at
        )
    ) and not exists (
      select 1
      from careslink_v1_generation.payload_grants as bounded_grant
      where bounded_grant.job_id = v_fixture.job_id
        and bounded_grant.owner_user_id = v_fixture.owner_id
        and bounded_grant.expires_at > reservation.expires_at
    ),
    'payloadState', payload.state,
    'payloadRevokeReason', payload.revoke_reason,
    'payloadRevokedAt', case
      when payload.revoked_at is null then null
      else careslink_v1_generation._server_time(payload.revoked_at)
    end,
    'outboxCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.job_id = v_fixture.job_id
        and outbox.owner_user_id = v_fixture.owner_id
    ),
    'outboxRequestedAt', (
      select careslink_v1_generation._server_time(outbox.requested_at)
      from careslink_v1_generation.payload_purge_outbox as outbox
      where outbox.job_id = v_fixture.job_id
        and outbox.owner_user_id = v_fixture.owner_id
    ),
    'documentCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_documents as document
      where document.owner_user_id = v_fixture.owner_id
    ),
    'revisionCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_revisions as revision
      where revision.owner_user_id = v_fixture.owner_id
    ),
    'syncChangeCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_sync_changes as sync_change
      where sync_change.owner_user_id = v_fixture.owner_id
    ),
    'mutationReceiptCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from public.ai_document_mutation_receipts as receipt
      where receipt.owner_user_id = v_fixture.owner_id
    ),
    'providerEvidenceCount', (
      select pg_catalog.count(*)::pg_catalog.int4
      from careslink_v1_generation.provider_evidence as evidence
      where evidence.job_id = v_fixture.job_id
        and evidence.owner_user_id = v_fixture.owner_id
    )
  ) into v_result
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  join public.point_reservations as reservation
    on reservation.id = v_reservation_id
   and reservation.owner_user_id = job.owner_user_id
  left join
    careslink_v1_generation.communication_note_point_settlements as settlement
    on settlement.job_id = job.id
   and settlement.owner_user_id = job.owner_user_id
  left join careslink_v1_generation.attempts as settlement_attempt
    on settlement_attempt.id = settlement.attempt_id
   and settlement_attempt.job_id = settlement.job_id
   and settlement_attempt.owner_user_id = settlement.owner_user_id
  left join public.point_ledger_entries as terminal_ledger
    on terminal_ledger.id = settlement.ledger_entry_id
  left join public.ai_documents as result_document
    on result_document.id = job.result_document_id
   and result_document.owner_user_id = job.owner_user_id
  where job.id = v_fixture.job_id
    and job.owner_user_id = v_fixture.owner_id;

  if v_result is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;
  return v_result;
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.prepare_recovery_fixtures(
    p_paid_running_remaining_ms pg_catalog.int4,
    p_unpaid_remaining_ms pg_catalog.int4
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_paid_fixture record;
  v_paid_admission pg_catalog.jsonb;
  v_unpaid_admission pg_catalog.jsonb;
  v_cleaned_facts_hash pg_catalog.text;
  v_now pg_catalog.timestamptz;
  v_unpaid_job_id constant pg_catalog.uuid :=
    'db315000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_unpaid_payload_id constant pg_catalog.uuid :=
    'db316000-0000-4000-8000-000000000001'::pg_catalog.uuid;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-queued-expiry-recovery-observer'
    or p_paid_running_remaining_ms is null
    or p_paid_running_remaining_ms < 2500
    or p_paid_running_remaining_ms > 30000
    or p_unpaid_remaining_ms is null
    or p_unpaid_remaining_ms < 2500
    or p_unpaid_remaining_ms > 30000
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_EXPIRY_INVALID';
  end if;

  select * into v_paid_fixture
  from careslink_v1_cn_points_terminal_support._fixture(
    'paid-running-recovery'
  );
  v_paid_admission :=
    careslink_v1_cn_points_terminal_support.admit_case(
      'paid-running-recovery',
      p_paid_running_remaining_ms
    );

  v_now := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  );
  v_cleaned_facts_hash := public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'occurred_at', '2026-09-02T00:00:00Z',
      'contact_channel', 'phone',
      'parties_by_role', pg_catalog.jsonb_build_array('support worker'),
      'observable_facts', 'TEST_ONLY terminal settlement fixture',
      'action_taken', 'TEST_ONLY documented'
    )
  );
  v_unpaid_admission :=
    careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
      'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da311000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'BEARER',
      v_unpaid_job_id,
      v_unpaid_payload_id,
      'da312000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'communication',
      'en',
      '1.0.0-shadow.1',
      '2026-08-09.v1-shadow',
      v_cleaned_facts_hash,
      repeat('c', 64),
      repeat('d', 64),
      repeat('e', 64),
      v_now + p_unpaid_remaining_ms * interval '1 millisecond'
    );

  if v_paid_fixture.job_id is null
    or v_paid_admission #>> '{job,jobId}' is distinct from
      v_paid_fixture.job_id::pg_catalog.text
    or v_paid_admission #>> '{job,status}' is distinct from 'QUEUED'
    or v_paid_admission->>'pointsReserved' is distinct from 'true'
    or v_unpaid_admission #>> '{job,jobId}' is distinct from
      v_unpaid_job_id::pg_catalog.text
    or v_unpaid_admission #>> '{job,status}' is distinct from 'QUEUED'
    or v_unpaid_admission ? 'pointsReserved'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  return pg_catalog.jsonb_build_object(
    'paidRunning', pg_catalog.jsonb_build_object(
      'ownerId', v_paid_fixture.owner_id,
      'jobId', v_paid_fixture.job_id,
      'payloadId', v_paid_fixture.payload_id,
      'admission', v_paid_admission
    ),
    'unpaid', pg_catalog.jsonb_build_object(
      'ownerId',
        'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'jobId', v_unpaid_job_id,
      'payloadId', v_unpaid_payload_id,
      'admission', v_unpaid_admission
    )
  );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.recovery_fairness_state()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_primary_registration pg_catalog.text;
  v_secondary_registration pg_catalog.text;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-queued-expiry-recovery-observer'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;

  select registration.registration_digest
  into strict v_primary_registration
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
    'registration.communication-terminal-concurrency.20260902.v1';
  select registration.registration_digest
  into strict v_secondary_registration
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
    'registration.communication-terminal-concurrency.20260902.v2';

  return pg_catalog.jsonb_build_object(
    'primaryTurn', (
      select pg_catalog.jsonb_build_object(
        'paidFirst', turn.paid_first,
        'runningFirst', turn.running_first
      )
      from careslink_v1_generation.communication_note_paid_recovery_turns
        as turn
      where turn.registration_digest = v_primary_registration
    ),
    'secondaryTurn', (
      select pg_catalog.jsonb_build_object(
        'paidFirst', turn.paid_first,
        'runningFirst', turn.running_first
      )
      from careslink_v1_generation.communication_note_paid_recovery_turns
        as turn
      where turn.registration_digest = v_secondary_registration
    ),
    'paidRunning', (
      select pg_catalog.jsonb_build_object(
        'jobId', job.id,
        'jobStatus', job.status,
        'attemptCount', job.attempt_count,
        'attemptStatus', (
          select attempt.status
          from careslink_v1_generation.attempts as attempt
          where attempt.job_id = job.id
            and attempt.owner_user_id = job.owner_user_id
          order by attempt.attempt_number desc
          limit 1
        ),
        'attemptLeaseExpiresAt', (
          select careslink_v1_generation._server_time(
            attempt.lease_expires_at
          )
          from careslink_v1_generation.attempts as attempt
          where attempt.job_id = job.id
            and attempt.owner_user_id = job.owner_user_id
          order by attempt.attempt_number desc
          limit 1
        ),
        'reservationStatus', reservation.status,
        'reservationExpiresAt', careslink_v1_generation._server_time(
          reservation.expires_at
        ),
        'settlementCount', (
          select pg_catalog.count(*)::pg_catalog.int4
          from careslink_v1_generation.communication_note_point_settlements
            as settlement
          where settlement.job_id = job.id
            and settlement.owner_user_id = job.owner_user_id
        )
      )
      from careslink_v1_generation.jobs as job
      join careslink_v1_generation.communication_note_point_admissions
        as admission
        on admission.job_id = job.id
       and admission.owner_user_id = job.owner_user_id
      join public.point_reservations as reservation
        on reservation.id = admission.reservation_id
       and reservation.owner_user_id = admission.owner_user_id
      where job.id =
        'db150000-0000-4000-8000-000000000001'::pg_catalog.uuid
        and job.owner_user_id =
          'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid
    ),
    'paidQueued', (
      select pg_catalog.jsonb_build_object(
        'jobId', job.id,
        'jobStatus', job.status,
        'attemptCount', job.attempt_count,
        'settlementCount', (
          select pg_catalog.count(*)::pg_catalog.int4
          from careslink_v1_generation.communication_note_point_settlements
            as settlement
          where settlement.job_id = job.id
            and settlement.owner_user_id = job.owner_user_id
        ),
        'settlementAttemptNumber', (
          select attempt.attempt_number
          from careslink_v1_generation.communication_note_point_settlements
            as settlement
          join careslink_v1_generation.attempts as attempt
            on attempt.id = settlement.attempt_id
           and attempt.job_id = settlement.job_id
           and attempt.owner_user_id = settlement.owner_user_id
          where settlement.job_id = job.id
            and settlement.owner_user_id = job.owner_user_id
        )
      )
      from careslink_v1_generation.jobs as job
      where job.id =
        'da315000-0000-4000-8000-000000000001'::pg_catalog.uuid
        and job.owner_user_id =
          'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid
    ),
    'unpaid', (
      select pg_catalog.jsonb_build_object(
        'jobId', job.id,
        'jobStatus', job.status,
        'attemptCount', job.attempt_count,
        'admissionCount', (
          select pg_catalog.count(*)::pg_catalog.int4
          from careslink_v1_generation.communication_note_point_admissions
            as admission
          where admission.job_id = job.id
            and admission.owner_user_id = job.owner_user_id
        ),
        'settlementCount', (
          select pg_catalog.count(*)::pg_catalog.int4
          from careslink_v1_generation.communication_note_point_settlements
            as settlement
          where settlement.job_id = job.id
            and settlement.owner_user_id = job.owner_user_id
        )
      )
      from careslink_v1_generation.jobs as job
      where job.id =
        'db315000-0000-4000-8000-000000000001'::pg_catalog.uuid
        and job.owner_user_id =
          'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid
    )
  );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.assert_settlement_worker_policy_boundary()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role constant pg_catalog.text :=
    'careslink_v1_generation_points_settlement_executor';
  v_select_only pg_catalog.bool;
  v_forced_rls pg_catalog.bool;
  v_approved_only pg_catalog.bool;
  v_no_runtime_membership pg_catalog.bool;
  v_settlement_schema_create_denied pg_catalog.bool;
  v_generation_executor_schema_create_denied pg_catalog.bool;
  v_owner_api_executor_schema_create_denied pg_catalog.bool;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();

  select relation.relrowsecurity and relation.relforcerowsecurity
  into v_forced_rls
  from pg_catalog.pg_class as relation
  where relation.oid =
    'careslink_v1_generation.worker_policies'::pg_catalog.regclass;

  v_select_only := pg_catalog.has_table_privilege(
      v_role,
      'careslink_v1_generation.worker_policies',
      'SELECT'
    )
    and not pg_catalog.has_table_privilege(
      v_role,
      'careslink_v1_generation.worker_policies',
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    and not pg_catalog.has_any_column_privilege(
      v_role,
      'careslink_v1_generation.worker_policies',
      'INSERT, UPDATE, REFERENCES'
    );

  select pg_catalog.count(*) = 1
  into v_approved_only
  from pg_catalog.pg_policy as policy
  where policy.polrelid =
      'careslink_v1_generation.worker_policies'::pg_catalog.regclass
    and policy.polname = 'worker_policies_points_settlement_select'
    and policy.polcmd = 'r'
    and policy.polroles = array[
      pg_catalog.to_regrole(v_role)::pg_catalog.oid
    ]
    and policy.polwithcheck is null
    and pg_catalog.lower(
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
    ) ~ 'status = ''approved'''
    and pg_catalog.lower(
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
    ) ~ 'shadow_only is true';

  select not role_record.rolcanlogin
      and not role_record.rolinherit
      and not exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        where membership.roleid = role_record.oid
          and membership.member = any(array[
            pg_catalog.to_regrole(
              'careslink_v1_cn_points_terminal_runner'
            )::pg_catalog.oid,
            pg_catalog.to_regrole('anon')::pg_catalog.oid,
            pg_catalog.to_regrole('authenticated')::pg_catalog.oid,
            pg_catalog.to_regrole('service_role')::pg_catalog.oid,
            pg_catalog.to_regrole('authenticator')::pg_catalog.oid,
            pg_catalog.to_regrole(
              'careslink_v1_generation_executor'
            )::pg_catalog.oid,
            pg_catalog.to_regrole(
              'careslink_v1_generation_owner_api_executor'
            )::pg_catalog.oid,
            pg_catalog.to_regrole(
              'careslink_v1_generation_points_admission_executor'
            )::pg_catalog.oid
          ])
      )
  into v_no_runtime_membership
  from pg_catalog.pg_roles as role_record
  where role_record.rolname = v_role;

  v_settlement_schema_create_denied := not pg_catalog.has_schema_privilege(
    v_role,
    'careslink_v1_generation',
    'CREATE'
  );
  v_generation_executor_schema_create_denied :=
    not pg_catalog.has_schema_privilege(
      'careslink_v1_generation_executor',
      'careslink_v1_generation',
      'CREATE'
    );
  v_owner_api_executor_schema_create_denied :=
    not pg_catalog.has_schema_privilege(
      'careslink_v1_generation_owner_api_executor',
      'careslink_v1_generation',
      'CREATE'
    );

  return pg_catalog.jsonb_build_object(
    'selectOnly', coalesce(v_select_only, false),
    'forcedRls', coalesce(v_forced_rls, false),
    'approvedOnly', coalesce(v_approved_only, false),
    'noRuntimeMembership', coalesce(v_no_runtime_membership, false),
    'settlementSchemaCreateDenied',
      coalesce(v_settlement_schema_create_denied, false),
    'generationExecutorSchemaCreateDenied',
      coalesce(v_generation_executor_schema_create_denied, false),
    'ownerApiExecutorSchemaCreateDenied',
      coalesce(v_owner_api_executor_schema_create_denied, false)
  );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.assert_generic_terminal_quarantine()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_id constant pg_catalog.uuid :=
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_job_id pg_catalog.uuid;
  v_reservation_id pg_catalog.uuid;
  v_commit_denied pg_catalog.bool := false;
  v_release_denied pg_catalog.bool := false;
  v_result pg_catalog.jsonb;
begin
  perform
    careslink_v1_cn_points_terminal_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-terminal-failure-observer'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;

  select fixture.job_id
  into strict v_job_id
  from careslink_v1_cn_points_terminal_support._fixture(
    'terminal-failure'
  ) as fixture;

  select binding.reservation_id
  into strict v_reservation_id
  from careslink_v1_generation.communication_note_point_admissions as binding
  where binding.job_id = v_job_id
    and binding.owner_user_id = v_owner_id;

  begin
    perform public.commit_shadow_points(
      v_owner_id,
      v_reservation_id,
      'communication-terminal-test-only-result',
      pg_catalog.clock_timestamp()
    );
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'PRODUCT_API_DISABLED' then
        v_commit_denied := true;
      else
        raise exception
          'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_GUARD_DRIFT';
      end if;
  end;
  if not v_commit_denied then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_COMMIT_ALLOWED';
  end if;

  begin
    perform public.release_shadow_points(
      v_owner_id,
      v_reservation_id,
      'COMMUNICATION_TERMINAL_TEST_ONLY',
      'RELEASE',
      pg_catalog.clock_timestamp()
    );
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'PRODUCT_API_DISABLED' then
        v_release_denied := true;
      else
        raise exception
          'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_GUARD_DRIFT';
      end if;
  end;
  if not v_release_denied then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RELEASE_ALLOWED';
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
  ) into v_result
  from public.point_reservations as reservation
  where reservation.id = v_reservation_id
    and reservation.owner_user_id = v_owner_id;
  if v_result is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;
  return v_result;
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.assert_terminal_job_mutation_denied(
    p_job_id pg_catalog.uuid
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before_job pg_catalog.jsonb;
  v_after_job pg_catalog.jsonb;
  v_before_settlement pg_catalog.jsonb;
  v_after_settlement pg_catalog.jsonb;
  v_denied pg_catalog.bool := false;
  v_sqlstate pg_catalog.text;
  v_message pg_catalog.text;
begin
  perform careslink_v1_cn_points_terminal_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-terminal-failure-observer'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;

  select pg_catalog.to_jsonb(job)
  into v_before_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.status in ('SUCCEEDED', 'FAILED', 'CANCELLED')
    and job.communication_note_point_admission_id is not null;
  select pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(settlement)
    order by settlement.id
  )
  into v_before_settlement
  from careslink_v1_generation.communication_note_point_settlements
    as settlement
  where settlement.job_id = p_job_id;
  if v_before_job is null or v_before_settlement is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  begin
    update careslink_v1_generation.jobs as job
    set attempt_count = job.attempt_count + 1
    where job.id = p_job_id;
  exception
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_message = message_text;
      if v_sqlstate = 'P0001' and v_message = 'IMMUTABLE_TERMINAL' then
        v_denied := true;
      else
        raise;
      end if;
  end;
  if not v_denied then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_MUTATION_ALLOWED';
  end if;

  select pg_catalog.to_jsonb(job)
  into v_after_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id;
  select pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(settlement)
    order by settlement.id
  )
  into v_after_settlement
  from careslink_v1_generation.communication_note_point_settlements
    as settlement
  where settlement.job_id = p_job_id;
  if v_after_job is distinct from v_before_job
    or v_after_settlement is distinct from v_before_settlement
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_MUTATION_WROTE';
  end if;

  return pg_catalog.jsonb_build_object(
    'denied', v_denied,
    'jobUnchanged', v_after_job is not distinct from v_before_job,
    'settlementIntact',
      v_after_settlement is not distinct from v_before_settlement
  );
end;
$$;

create table
  careslink_v1_cn_points_terminal_support.unmarked_paid_outer_replay_state (
    state_key pg_catalog.bool primary key default true check (state_key),
    job_id pg_catalog.uuid not null unique,
    attempt_id pg_catalog.uuid not null unique,
    lease_token pg_catalog.text not null check (
      pg_catalog.octet_length(lease_token) between 32 and 512
    ),
    payload_expires_at pg_catalog.timestamptz not null,
    points_snapshot pg_catalog.jsonb not null
  );

revoke all on table
  careslink_v1_cn_points_terminal_support.unmarked_paid_outer_replay_state
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_generation_executor,
  careslink_v1_generation_owner_api_executor,
  careslink_v1_generation_points_admission_executor,
  careslink_v1_generation_points_settlement_executor,
  careslink_v1_cn_points_terminal_runner;

create function
  careslink_v1_cn_points_terminal_support.assert_unmarked_paid_outer_running_replay_denied()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_id constant pg_catalog.uuid :=
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_session_id constant pg_catalog.uuid :=
    'da110000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_privacy_id constant pg_catalog.uuid :=
    'da120000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_job_id constant pg_catalog.uuid :=
    'db170000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_payload_id constant pg_catalog.uuid :=
    'db171000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_replay_payload_id constant pg_catalog.uuid :=
    'db172000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_contract_version constant pg_catalog.text := '1.0.0-shadow.1';
  v_schema_version constant pg_catalog.text := '2026-08-09.v1-shadow';
  v_cleaned_facts_hash pg_catalog.text;
  v_payload_expires_at pg_catalog.timestamptz;
  v_admission pg_catalog.jsonb;
  v_claim pg_catalog.jsonb;
  v_attempt_id pg_catalog.uuid;
  v_lease_token pg_catalog.text;
  v_registration_digest pg_catalog.text;
  v_worker_policy_version pg_catalog.text;
  v_worker_policy_digest pg_catalog.text;
  v_worker_identity_hash pg_catalog.text;
  v_queued_before pg_catalog.jsonb;
  v_queued_after pg_catalog.jsonb;
  v_running_before pg_catalog.jsonb;
  v_running_after pg_catalog.jsonb;
  v_points_before pg_catalog.jsonb;
  v_points_after pg_catalog.jsonb;
  v_queued_denied pg_catalog.bool := false;
  v_running_denied pg_catalog.bool := false;
  v_sqlstate pg_catalog.text;
  v_message pg_catalog.text;
  v_admission_count pg_catalog.int4;
  v_settlement_count pg_catalog.int4;
begin
  perform careslink_v1_cn_points_terminal_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-terminal-failure-observer'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;

  select
    registration.registration_digest,
    registration.worker_policy_version,
    registration.worker_policy_digest,
    registration.worker_identity_hash
  into
    v_registration_digest,
    v_worker_policy_version,
    v_worker_policy_digest,
    v_worker_identity_hash
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
      'registration.communication-terminal-concurrency.20260902.v1'
    and registration.status = 'APPROVED'
    and registration.shadow_only is true;
  if not found then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  select pg_catalog.jsonb_build_object(
    'wallets', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(wallet) order by wallet.id
      ) from public.point_wallets as wallet
    ),
    'lots', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(lot) order by lot.id
      ) from public.point_lots as lot
    ),
    'quotes', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(quote) order by quote.id
      ) from public.point_quotes as quote
    ),
    'reservations', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(reservation) order by reservation.id
      ) from public.point_reservations as reservation
    ),
    'allocations', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(reservation_allocation)
        order by reservation_allocation.reservation_id,
          reservation_allocation.lot_id
      )
      from public.point_reservation_allocations as reservation_allocation
    ),
    'ledger', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(ledger) order by ledger.id
      ) from public.point_ledger_entries as ledger
    ),
    'admissions', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(point_admission) order by point_admission.id
      )
      from careslink_v1_generation.communication_note_point_admissions
        as point_admission
    ),
    'settlements', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(point_settlement) order by point_settlement.id
      )
      from careslink_v1_generation.communication_note_point_settlements
        as point_settlement
    )
  ) into v_points_before;

  v_payload_expires_at := pg_catalog.date_trunc(
    'milliseconds', pg_catalog.clock_timestamp()
  ) + interval '120 seconds';
  v_cleaned_facts_hash := public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'occurred_at', '2026-09-02T00:00:00Z',
      'contact_channel', 'phone',
      'parties_by_role', pg_catalog.jsonb_build_array('support worker'),
      'observable_facts', 'TEST_ONLY terminal settlement fixture',
      'action_taken', 'TEST_ONLY documented'
    )
  );
  v_admission :=
    careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
      v_owner_id,
      v_session_id,
      'BEARER',
      v_job_id,
      v_payload_id,
      v_privacy_id,
      'communication',
      'en',
      v_contract_version,
      v_schema_version,
      v_cleaned_facts_hash,
      repeat('0', 64),
      repeat('1', 64),
      repeat('3', 64),
      v_payload_expires_at
    );
  if v_admission->'created' is distinct from 'true'::pg_catalog.jsonb
    or v_admission #>> '{job,jobId}' is distinct from v_job_id::pg_catalog.text
    or v_admission #>> '{job,status}' is distinct from 'QUEUED'
    or v_admission ? 'pointsReserved'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  select pg_catalog.jsonb_build_object(
    'job', pg_catalog.to_jsonb(job),
    'payloads', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(payload) order by payload.id
      )
      from careslink_v1_generation.payloads as payload
      where payload.job_id = v_job_id
    )
  )
  into v_queued_before
  from careslink_v1_generation.jobs as job
  where job.id = v_job_id
    and job.owner_user_id = v_owner_id
    and job.status = 'QUEUED'
    and job.communication_note_point_admission_id is null;
  if v_queued_before is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  begin
    perform
      careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
        v_owner_id,
        v_session_id,
        'BEARER',
        v_job_id,
        v_replay_payload_id,
        v_privacy_id,
        'en',
        v_contract_version,
        v_schema_version,
        v_cleaned_facts_hash,
        repeat('0', 64),
        repeat('1', 64),
        repeat('3', 64),
        v_payload_expires_at
      );
  exception
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_message = message_text;
      if v_sqlstate = 'P0001'
        and v_message = 'IDENTITY_LINK_CONFLICT'
      then
        v_queued_denied := true;
      else
        raise;
      end if;
  end;
  select pg_catalog.jsonb_build_object(
    'job', pg_catalog.to_jsonb(job),
    'payloads', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(payload) order by payload.id
      )
      from careslink_v1_generation.payloads as payload
      where payload.job_id = v_job_id
    )
  )
  into v_queued_after
  from careslink_v1_generation.jobs as job
  where job.id = v_job_id;
  if not v_queued_denied
    or v_queued_after is distinct from v_queued_before
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_UNMARKED_REPLAY_WROTE';
  end if;

  v_claim := careslink_v1_generation.claim_v1_shadow_note_generation_job(
    v_registration_digest,
    v_worker_policy_version,
    v_worker_policy_digest,
    v_worker_identity_hash,
    v_contract_version,
    v_schema_version
  );
  if v_claim->>'status' is distinct from 'CLAIMED'
    or v_claim #>> '{claim,job,jobId}' is distinct from v_job_id::pg_catalog.text
    or v_claim #>> '{claim,job,status}' is distinct from 'RUNNING'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;
  v_attempt_id :=
    (v_claim #>> '{claim,attempt,attemptId}')::pg_catalog.uuid;
  v_lease_token := v_claim #>> '{claim,leaseToken}';

  select pg_catalog.to_jsonb(job)
  into v_running_before
  from careslink_v1_generation.jobs as job
  where job.id = v_job_id
    and job.owner_user_id = v_owner_id
    and job.status = 'RUNNING'
    and job.communication_note_point_admission_id is null;
  if v_running_before is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  begin
    perform
      careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
        v_owner_id,
        v_session_id,
        'BEARER',
        v_job_id,
        v_payload_id,
        v_privacy_id,
        'en',
        v_contract_version,
        v_schema_version,
        v_cleaned_facts_hash,
        repeat('0', 64),
        repeat('1', 64),
        repeat('3', 64),
        v_payload_expires_at
      );
  exception
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_message = message_text;
      if v_sqlstate = 'P0001'
        and v_message = 'IDENTITY_LINK_CONFLICT'
      then
        v_running_denied := true;
      else
        raise;
      end if;
  end;
  select pg_catalog.to_jsonb(job)
  into v_running_after
  from careslink_v1_generation.jobs as job
  where job.id = v_job_id;
  if not v_running_denied
    or v_running_after is distinct from v_running_before
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_UNMARKED_REPLAY_WROTE';
  end if;

  select pg_catalog.jsonb_build_object(
    'wallets', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(wallet) order by wallet.id
      ) from public.point_wallets as wallet
    ),
    'lots', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(lot) order by lot.id
      ) from public.point_lots as lot
    ),
    'quotes', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(quote) order by quote.id
      ) from public.point_quotes as quote
    ),
    'reservations', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(reservation) order by reservation.id
      ) from public.point_reservations as reservation
    ),
    'allocations', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(reservation_allocation)
        order by reservation_allocation.reservation_id,
          reservation_allocation.lot_id
      )
      from public.point_reservation_allocations as reservation_allocation
    ),
    'ledger', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(ledger) order by ledger.id
      ) from public.point_ledger_entries as ledger
    ),
    'admissions', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(point_admission) order by point_admission.id
      )
      from careslink_v1_generation.communication_note_point_admissions
        as point_admission
    ),
    'settlements', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(point_settlement) order by point_settlement.id
      )
      from careslink_v1_generation.communication_note_point_settlements
        as point_settlement
    )
  ) into v_points_after;
  select pg_catalog.count(*)::pg_catalog.int4
  into v_admission_count
  from careslink_v1_generation.communication_note_point_admissions
    as point_admission
  where point_admission.job_id = v_job_id;
  select pg_catalog.count(*)::pg_catalog.int4
  into v_settlement_count
  from careslink_v1_generation.communication_note_point_settlements
    as point_settlement
  where point_settlement.job_id = v_job_id;
  if v_points_after is distinct from v_points_before
    or v_admission_count <> 0
    or v_settlement_count <> 0
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_UNMARKED_POINTS_WROTE';
  end if;

  insert into
    careslink_v1_cn_points_terminal_support.unmarked_paid_outer_replay_state (
      state_key,
      job_id,
      attempt_id,
      lease_token,
      payload_expires_at,
      points_snapshot
    ) values (
      true,
      v_job_id,
      v_attempt_id,
      v_lease_token,
      v_payload_expires_at,
      v_points_before
    );

  return pg_catalog.jsonb_build_object(
    'denied', v_queued_denied and v_running_denied,
    'jobUnchanged',
      v_queued_after is not distinct from v_queued_before
      and v_running_after is not distinct from v_running_before,
    'pointsUnchanged', v_points_after is not distinct from v_points_before,
    'admissionCount', v_admission_count,
    'settlementCount', v_settlement_count
  );
end;
$$;

create function
  careslink_v1_cn_points_terminal_support.assert_unmarked_paid_outer_terminal_replay_denied()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_id constant pg_catalog.uuid :=
    'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_session_id constant pg_catalog.uuid :=
    'da110000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_privacy_id constant pg_catalog.uuid :=
    'da120000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_payload_id constant pg_catalog.uuid :=
    'db171000-0000-4000-8000-000000000001'::pg_catalog.uuid;
  v_contract_version constant pg_catalog.text := '1.0.0-shadow.1';
  v_schema_version constant pg_catalog.text := '2026-08-09.v1-shadow';
  v_state record;
  v_cleaned_facts_hash pg_catalog.text;
  v_failure pg_catalog.jsonb;
  v_registration_digest pg_catalog.text;
  v_worker_policy_version pg_catalog.text;
  v_worker_policy_digest pg_catalog.text;
  v_terminal_before pg_catalog.jsonb;
  v_terminal_after pg_catalog.jsonb;
  v_points_after pg_catalog.jsonb;
  v_terminal_denied pg_catalog.bool := false;
  v_sqlstate pg_catalog.text;
  v_message pg_catalog.text;
  v_admission_count pg_catalog.int4;
  v_settlement_count pg_catalog.int4;
begin
  perform careslink_v1_cn_points_terminal_support._assert_runner();
  if pg_catalog.current_setting('application_name') <>
      'careslink-cn-terminal-terminal-failure-observer'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CALLER_UNSAFE';
  end if;

  select state.*
  into v_state
  from careslink_v1_cn_points_terminal_support.unmarked_paid_outer_replay_state
    as state
  where state.state_key is true
  for update;
  select
    registration.registration_digest,
    registration.worker_policy_version,
    registration.worker_policy_digest
  into
    v_registration_digest,
    v_worker_policy_version,
    v_worker_policy_digest
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
      'registration.communication-terminal-concurrency.20260902.v1'
    and registration.status = 'APPROVED'
    and registration.shadow_only is true;
  if v_state.job_id is null or v_registration_digest is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  v_failure :=
    careslink_v1_generation.settle_v1_shadow_note_generation_failure(
      v_state.job_id,
      v_state.attempt_id,
      v_state.lease_token,
      v_registration_digest,
      v_worker_policy_version,
      v_worker_policy_digest,
      'PROVIDER_PERMANENT',
      null
    );
  if v_failure #>> '{settlement,disposition}' is distinct from 'FAILED'
    or v_failure #>> '{jobTransition,status}' is distinct from 'FAILED'
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  select pg_catalog.to_jsonb(job)
  into v_terminal_before
  from careslink_v1_generation.jobs as job
  where job.id = v_state.job_id
    and job.owner_user_id = v_owner_id
    and job.status = 'FAILED'
    and job.communication_note_point_admission_id is null;
  if v_terminal_before is null then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  v_cleaned_facts_hash := public.v1_shadow_content_sha256(
    pg_catalog.jsonb_build_object(
      'occurred_at', '2026-09-02T00:00:00Z',
      'contact_channel', 'phone',
      'parties_by_role', pg_catalog.jsonb_build_array('support worker'),
      'observable_facts', 'TEST_ONLY terminal settlement fixture',
      'action_taken', 'TEST_ONLY documented'
    )
  );
  begin
    perform
      careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
        v_owner_id,
        v_session_id,
        'BEARER',
        v_state.job_id,
        v_payload_id,
        v_privacy_id,
        'en',
        v_contract_version,
        v_schema_version,
        v_cleaned_facts_hash,
        repeat('0', 64),
        repeat('1', 64),
        repeat('3', 64),
        v_state.payload_expires_at
      );
  exception
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_message = message_text;
      if v_sqlstate = 'P0001'
        and v_message = 'IDENTITY_LINK_CONFLICT'
      then
        v_terminal_denied := true;
      else
        raise;
      end if;
  end;
  select pg_catalog.to_jsonb(job)
  into v_terminal_after
  from careslink_v1_generation.jobs as job
  where job.id = v_state.job_id;
  if not v_terminal_denied
    or v_terminal_after is distinct from v_terminal_before
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_UNMARKED_REPLAY_WROTE';
  end if;

  select pg_catalog.jsonb_build_object(
    'wallets', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(wallet) order by wallet.id
      ) from public.point_wallets as wallet
    ),
    'lots', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(lot) order by lot.id
      ) from public.point_lots as lot
    ),
    'quotes', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(quote) order by quote.id
      ) from public.point_quotes as quote
    ),
    'reservations', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(reservation) order by reservation.id
      ) from public.point_reservations as reservation
    ),
    'allocations', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(reservation_allocation)
        order by reservation_allocation.reservation_id,
          reservation_allocation.lot_id
      )
      from public.point_reservation_allocations as reservation_allocation
    ),
    'ledger', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(ledger) order by ledger.id
      ) from public.point_ledger_entries as ledger
    ),
    'admissions', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(point_admission) order by point_admission.id
      )
      from careslink_v1_generation.communication_note_point_admissions
        as point_admission
    ),
    'settlements', (
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(point_settlement) order by point_settlement.id
      )
      from careslink_v1_generation.communication_note_point_settlements
        as point_settlement
    )
  ) into v_points_after;
  select pg_catalog.count(*)::pg_catalog.int4
  into v_admission_count
  from careslink_v1_generation.communication_note_point_admissions
    as point_admission
  where point_admission.job_id = v_state.job_id;
  select pg_catalog.count(*)::pg_catalog.int4
  into v_settlement_count
  from careslink_v1_generation.communication_note_point_settlements
    as point_settlement
  where point_settlement.job_id = v_state.job_id;
  if v_points_after is distinct from v_state.points_snapshot
    or v_admission_count <> 0
    or v_settlement_count <> 0
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_UNMARKED_POINTS_WROTE';
  end if;

  delete from
    careslink_v1_cn_points_terminal_support.unmarked_paid_outer_replay_state
  where state_key is true;
  if not found then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_FIXTURE_MISSING';
  end if;

  return pg_catalog.jsonb_build_object(
    'denied', v_terminal_denied,
    'jobUnchanged', v_terminal_after is not distinct from v_terminal_before,
    'pointsUnchanged', v_points_after is not distinct from v_state.points_snapshot,
    'admissionCount', v_admission_count,
    'settlementCount', v_settlement_count
  );
end;
$$;

revoke all on function
  careslink_v1_cn_points_terminal_support._assert_runner(),
  careslink_v1_cn_points_terminal_support._fixture(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.fixture_catalog(),
  careslink_v1_cn_points_terminal_support.admit_case(pg_catalog.text, pg_catalog.int4),
  careslink_v1_cn_points_terminal_support.hold_paid_recovery_lock(),
  careslink_v1_cn_points_terminal_support.hold_job_lock(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.age_queue_deadline(pg_catalog.text, pg_catalog.int4),
  careslink_v1_cn_points_terminal_support.hold_payload_lock(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.hold_point_reservation_lock(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.consume_grant_test_only(pg_catalog.uuid, pg_catalog.uuid),
  careslink_v1_cn_points_terminal_support.assert_incomplete_fence_denied(pg_catalog.uuid, pg_catalog.uuid),
  careslink_v1_cn_points_terminal_support.commit_success_test_only(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.text),
  careslink_v1_cn_points_terminal_support.advance_success_document_test_only(pg_catalog.uuid),
  careslink_v1_cn_points_terminal_support.fixture_state(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.prepare_recovery_fixtures(pg_catalog.int4, pg_catalog.int4),
  careslink_v1_cn_points_terminal_support.recovery_fairness_state(),
  careslink_v1_cn_points_terminal_support.assert_settlement_worker_policy_boundary(),
  careslink_v1_cn_points_terminal_support.assert_generic_terminal_quarantine(),
  careslink_v1_cn_points_terminal_support.assert_terminal_job_mutation_denied(pg_catalog.uuid),
  careslink_v1_cn_points_terminal_support.assert_unmarked_paid_outer_running_replay_denied(),
  careslink_v1_cn_points_terminal_support.assert_unmarked_paid_outer_terminal_replay_denied()
from public, anon, authenticated, service_role, authenticator,
  careslink_v1_generation_owner,
  careslink_v1_generation_executor,
  careslink_v1_generation_owner_api_executor,
  careslink_v1_generation_points_admission_executor,
  careslink_v1_generation_points_settlement_executor,
  careslink_v1_cn_points_terminal_runner;

grant execute on function
  careslink_v1_cn_points_terminal_support.fixture_catalog(),
  careslink_v1_cn_points_terminal_support.admit_case(pg_catalog.text, pg_catalog.int4),
  careslink_v1_cn_points_terminal_support.hold_paid_recovery_lock(),
  careslink_v1_cn_points_terminal_support.hold_job_lock(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.age_queue_deadline(pg_catalog.text, pg_catalog.int4),
  careslink_v1_cn_points_terminal_support.hold_payload_lock(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.hold_point_reservation_lock(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.consume_grant_test_only(pg_catalog.uuid, pg_catalog.uuid),
  careslink_v1_cn_points_terminal_support.assert_incomplete_fence_denied(pg_catalog.uuid, pg_catalog.uuid),
  careslink_v1_cn_points_terminal_support.commit_success_test_only(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.text),
  careslink_v1_cn_points_terminal_support.advance_success_document_test_only(pg_catalog.uuid),
  careslink_v1_cn_points_terminal_support.fixture_state(pg_catalog.text),
  careslink_v1_cn_points_terminal_support.prepare_recovery_fixtures(pg_catalog.int4, pg_catalog.int4),
  careslink_v1_cn_points_terminal_support.recovery_fairness_state(),
  careslink_v1_cn_points_terminal_support.assert_settlement_worker_policy_boundary(),
  careslink_v1_cn_points_terminal_support.assert_generic_terminal_quarantine(),
  careslink_v1_cn_points_terminal_support.assert_terminal_job_mutation_denied(pg_catalog.uuid),
  careslink_v1_cn_points_terminal_support.assert_unmarked_paid_outer_running_replay_denied(),
  careslink_v1_cn_points_terminal_support.assert_unmarked_paid_outer_terminal_replay_denied()
to careslink_v1_cn_points_terminal_runner;

grant execute on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.text
  ),
  careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.text, pg_catalog.uuid
  ),
  careslink_v1_generation.settle_v1_shadow_note_generation_failure(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.jsonb
  ),
  careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation.get_v1_shadow_note_generation_job_status(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.text
  ),
  careslink_v1_generation.cancel_v1_shadow_note_generation_job(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.text
  )
to careslink_v1_cn_points_terminal_runner;

do $$
declare
  v_runner constant pg_catalog.text :=
    'careslink_v1_cn_points_terminal_runner';
begin
  if (
      select pg_catalog.count(*)
      from auth.users
      where email like 'communication-terminal-%@example.invalid'
    ) <> 5
    or (select pg_catalog.count(*) from public.point_wallets) <> 5
    or (select pg_catalog.count(*) from public.point_lots) <> 5
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.worker_registrations
      where registration_version in (
        'registration.communication-terminal-concurrency.20260902.v1',
        'registration.communication-terminal-concurrency.20260902.v2'
      )
    ) <> 2
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.worker_registration_provider_policies
      where registration_digest in (
        select registration.registration_digest
        from careslink_v1_generation.worker_registrations as registration
        where registration.registration_version in (
          'registration.communication-terminal-concurrency.20260902.v1',
          'registration.communication-terminal-concurrency.20260902.v2'
        )
      )
    ) <> 10
    or (
      select pg_catalog.count(*)
      from public.point_ledger_entries
      where event = 'GRANT'
    ) <> 5
    or exists (select 1 from careslink_v1_generation.jobs)
    or exists (
      select 1
      from careslink_v1_generation.communication_note_point_settlements
    )
    or exists (
      select 1
      from careslink_v1_generation.communication_note_paid_recovery_turns
    )
    or exists (
      select 1
      from careslink_v1_cn_points_terminal_support.unmarked_paid_outer_replay_state
    )
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is true
        and shadow_only is true
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid =
          'careslink_v1_generation.settings'::pg_catalog.regclass
        and conname = 'settings_enabled_check'
    )
    or not exists (
      select 1
      from pg_catalog.pg_authid as runner
      where runner.rolname = v_runner
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
      where membership.member = pg_catalog.to_regrole(v_runner)
    )
    or pg_catalog.octet_length(v_runner) > 63
    or pg_catalog.octet_length(
      'careslink_v1_cn_points_terminal_support'
    ) > 63
    or v_runner = 'careslink_v1_cn_points_terminal_support'
    or pg_catalog.to_regrole(
      'careslink_v1_cn_points_terminal_support'
    ) is not null
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.member in (
        pg_catalog.to_regrole('careslink_v1_generation_executor'),
        pg_catalog.to_regrole('careslink_v1_generation_owner_api_executor'),
        pg_catalog.to_regrole('careslink_v1_generation_points_admission_executor'),
        pg_catalog.to_regrole('careslink_v1_generation_points_settlement_executor')
      )
    )
    or not pg_catalog.has_database_privilege(v_runner, 'postgres', 'CONNECT')
    or not pg_catalog.has_schema_privilege(
      v_runner,
      'careslink_v1_generation',
      'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      v_runner,
      'careslink_v1_generation',
      'CREATE'
    )
    or not pg_catalog.has_schema_privilege(
      v_runner,
      'careslink_v1_cn_points_terminal_support',
      'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      v_runner,
      'careslink_v1_cn_points_terminal_support',
      'CREATE'
    )
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation.relnamespace
      where namespace_record.nspname in (
          'auth', 'public', 'careslink_v1_generation',
          'careslink_v1_cn_points_terminal_support'
        )
        and relation.relkind in ('r', 'p', 'v', 'm', 'f')
        and (
          pg_catalog.has_table_privilege(v_runner, relation.oid, 'SELECT')
          or pg_catalog.has_table_privilege(v_runner, relation.oid, 'INSERT')
          or pg_catalog.has_table_privilege(v_runner, relation.oid, 'UPDATE')
          or pg_catalog.has_table_privilege(v_runner, relation.oid, 'DELETE')
          or pg_catalog.has_table_privilege(v_runner, relation.oid, 'TRUNCATE')
          or pg_catalog.has_table_privilege(v_runner, relation.oid, 'REFERENCES')
          or pg_catalog.has_table_privilege(v_runner, relation.oid, 'TRIGGER')
          or pg_catalog.has_any_column_privilege(
            v_runner, relation.oid, 'SELECT'
          )
          or pg_catalog.has_any_column_privilege(
            v_runner, relation.oid, 'INSERT'
          )
          or pg_catalog.has_any_column_privilege(
            v_runner, relation.oid, 'UPDATE'
          )
          or pg_catalog.has_any_column_privilege(
            v_runner, relation.oid, 'REFERENCES'
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
          pg_catalog.has_sequence_privilege(v_runner, sequence_record.oid, 'USAGE')
          or pg_catalog.has_sequence_privilege(v_runner, sequence_record.oid, 'SELECT')
          or pg_catalog.has_sequence_privilege(v_runner, sequence_record.oid, 'UPDATE')
        )
    )
    or exists (
      select 1
      from pg_catalog.unnest(array[
        'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'::pg_catalog.regprocedure,
        'careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure,
        'careslink_v1_generation.fence_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure,
        'careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)'::pg_catalog.regprocedure,
        'careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(uuid,uuid,uuid,text,text,uuid)'::pg_catalog.regprocedure,
        'careslink_v1_generation.settle_v1_shadow_note_generation_failure(uuid,uuid,text,text,text,text,text,jsonb)'::pg_catalog.regprocedure,
        'careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)'::pg_catalog.regprocedure,
        'careslink_v1_generation.recover_v1_shadow_note_generation_expired(text,text,text,text,text,text)'::pg_catalog.regprocedure,
        'careslink_v1_generation.get_v1_shadow_note_generation_job_status(uuid,uuid,uuid,text,text)'::pg_catalog.regprocedure,
        'careslink_v1_generation.cancel_v1_shadow_note_generation_job(uuid,uuid,uuid,text,text)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.fixture_catalog()'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.admit_case(text,integer)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.hold_paid_recovery_lock()'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.hold_job_lock(text)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.age_queue_deadline(text,integer)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.hold_payload_lock(text)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.hold_point_reservation_lock(text)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.consume_grant_test_only(uuid,uuid)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.assert_incomplete_fence_denied(uuid,uuid)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.commit_success_test_only(uuid,uuid,text,uuid,text)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.advance_success_document_test_only(uuid)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.fixture_state(text)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.prepare_recovery_fixtures(integer,integer)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.recovery_fairness_state()'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.assert_settlement_worker_policy_boundary()'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.assert_generic_terminal_quarantine()'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.assert_terminal_job_mutation_denied(uuid)'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.assert_unmarked_paid_outer_running_replay_denied()'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support.assert_unmarked_paid_outer_terminal_replay_denied()'::pg_catalog.regprocedure
      ]) as allowed(procedure_oid)
      where not pg_catalog.has_function_privilege(
        v_runner, allowed.procedure_oid, 'EXECUTE'
      )
    )
    or exists (
      select 1
      from pg_catalog.unnest(array[
        'careslink_v1_cn_points_terminal_support._assert_runner()'::pg_catalog.regprocedure,
        'careslink_v1_cn_points_terminal_support._fixture(text)'::pg_catalog.regprocedure,
        'careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz,text,text,text,text,text)'::pg_catalog.regprocedure,
        'public.commit_shadow_points(uuid,uuid,text,timestamptz)'::pg_catalog.regprocedure,
        'public.release_shadow_points(uuid,uuid,text,text,timestamptz)'::pg_catalog.regprocedure
      ]) as denied(procedure_oid)
      where pg_catalog.has_function_privilege(
        v_runner, denied.procedure_oid, 'EXECUTE'
      )
    )
  then
    raise exception
      'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_POSTCHECK_FAILED';
  end if;
end;
$$;

commit;
