-- TEST_ONLY setup for the disposable Note worker RPC concurrency Preview.
-- The caller must validate the exact non-Production branch before submitting
-- this transaction. These rows intentionally persist only until the paired
-- cleanup transaction and exact branch deletion complete.

begin;

do $$
declare
  v_schema oid := to_regnamespace('careslink_v1_generation');
  v_tables text[];
  v_rpcs text[];
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'CONCURRENCY_SETUP_MANAGEMENT_ROLE_UNSAFE';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_roles as role_record
    where role_record.rolname =
        'careslink_v1_generation_concurrency_runner'
      and role_record.rolcanlogin is true
      and role_record.rolsuper is false
      and role_record.rolbypassrls is false
      and role_record.rolcreatedb is false
      and role_record.rolcreaterole is false
      and role_record.rolinherit is false
      and role_record.rolreplication is false
      and role_record.rolconnlimit = 2
  ) <> 1 then
    raise exception 'CONCURRENCY_SETUP_RUNNER_POSTURE_UNSAFE';
  end if;

  if pg_catalog.pg_has_role(
      'careslink_v1_generation_concurrency_runner',
      'careslink_v1_generation_owner',
      'MEMBER'
    )
    or pg_catalog.pg_has_role(
      'careslink_v1_generation_concurrency_runner',
      'careslink_v1_generation_executor',
      'MEMBER'
    )
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation.relnamespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, '{}'::pg_catalog.aclitem[])
      ) as privilege_record
      where namespace_record.nspname in (
          'auth', 'public', 'careslink_v1_generation'
        )
        and relation.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
        and privilege_record.grantee =
          'careslink_v1_generation_concurrency_runner'::pg_catalog.regrole
    )
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation.relnamespace
      where relation.relkind in ('r', 'p')
        and (
          namespace_record.nspname = 'careslink_v1_generation'
          or (
            namespace_record.nspname = 'auth'
            and relation.relname in ('users', 'sessions')
          )
          or (
            namespace_record.nspname = 'public'
            and relation.relname in (
              'privacy_reviews',
              'ai_documents',
              'ai_document_revisions',
              'ai_document_sync_changes',
              'ai_document_mutation_receipts'
            )
          )
        )
        and (
          pg_catalog.has_table_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'SELECT'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'INSERT'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'UPDATE'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'DELETE'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'REFERENCES'
          )
          or pg_catalog.has_table_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'TRIGGER'
          )
          or pg_catalog.has_any_column_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'SELECT'
          )
          or pg_catalog.has_any_column_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'INSERT'
          )
          or pg_catalog.has_any_column_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'UPDATE'
          )
          or pg_catalog.has_any_column_privilege(
            'careslink_v1_generation_concurrency_runner',
            relation.oid,
            'REFERENCES'
          )
        )
    )
  then
    raise exception 'CONCURRENCY_SETUP_RUNNER_PRIVILEGE_UNSAFE';
  end if;

  if current_setting('server_version_num')::integer < 160000 then
    raise exception 'CONCURRENCY_SETUP_POSTGRES_VERSION_UNSUPPORTED';
  end if;

  select array_agg(relation.relname::text order by relation.relname)
  into v_tables
  from pg_class as relation
  where relation.relnamespace = v_schema
    and relation.relkind = 'r';

  if v_schema is null or v_tables is distinct from array[
    'attempts', 'jobs', 'payload_grants', 'payload_policies',
    'payload_purge_outbox', 'payloads', 'provider_evidence',
    'provider_policies', 'settings', 'worker_policies',
    'worker_registration_provider_policies', 'worker_registrations'
  ]::text[] then
    raise exception 'CONCURRENCY_SETUP_PRIVATE_SCHEMA_DRIFT';
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
    raise exception 'CONCURRENCY_SETUP_RLS_POSTURE_UNSAFE';
  end if;

  select array_agg(procedure.proname::text order by procedure.proname)
  into v_rpcs
  from pg_proc as procedure
  where procedure.pronamespace = v_schema
    and procedure.proname = any(array[
      'authorize_v1_shadow_note_generation_payload_attempt',
      'claim_v1_shadow_note_generation_job',
      'commit_v1_shadow_note_generation_success',
      'consume_v1_shadow_note_generation_payload_grant',
      'fence_v1_shadow_note_generation_attempt',
      'heartbeat_v1_shadow_note_generation_attempt',
      'recover_v1_shadow_note_generation_expired',
      'resolve_v1_shadow_note_generation_attempt',
      'settle_v1_shadow_note_generation_failure'
    ]::text[]);

  if v_rpcs is distinct from array[
    'authorize_v1_shadow_note_generation_payload_attempt',
    'claim_v1_shadow_note_generation_job',
    'commit_v1_shadow_note_generation_success',
    'consume_v1_shadow_note_generation_payload_grant',
    'fence_v1_shadow_note_generation_attempt',
    'heartbeat_v1_shadow_note_generation_attempt',
    'recover_v1_shadow_note_generation_expired',
    'resolve_v1_shadow_note_generation_attempt',
    'settle_v1_shadow_note_generation_failure'
  ]::text[] then
    raise exception 'CONCURRENCY_SETUP_RPC_SET_DRIFT';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    where procedure.pronamespace = v_schema
      and procedure.proname = any(v_rpcs)
      and (
        not procedure.prosecdef
        or procedure.prorettype <> 'jsonb'::regtype
        or procedure.proowner <> 'careslink_v1_generation_executor'::regrole
        or procedure.proconfig is null
        or cardinality(procedure.proconfig) <> 1
        or procedure.proconfig[1] not in ('search_path=', 'search_path=""')
      )
  ) then
    raise exception 'CONCURRENCY_SETUP_RPC_POSTURE_UNSAFE';
  end if;
end
$$;

create temporary table rpc_concurrency_policy_values (
  note_type text primary key,
  service_code text not null,
  provider_digest text not null
) on commit drop;

create temporary table rpc_concurrency_fixture_values (
  ordinal integer primary key,
  owner_id uuid not null,
  session_id uuid not null,
  privacy_id uuid not null,
  job_id uuid not null,
  payload_id uuid not null,
  idempotency_hash text not null,
  request_hash text not null,
  payload_handle_hash text not null
) on commit drop;

create temporary table rpc_concurrency_management_membership_baseline
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
    from rpc_concurrency_management_membership_baseline as membership
    where membership.grantor = 'postgres'::pg_catalog.regrole
  ) then
    raise exception 'CONCURRENCY_SETUP_ROLE_MEMBERSHIP_UNSAFE';
  end if;
end
$$;

select set_config(
  'careslink.concurrent.facts_hash',
  public.v1_shadow_content_sha256(
    '{"occurred_at":"2026-08-23T00:00:00Z","contact_channel":"phone","parties_by_role":["support worker"],"observable_facts":"TEST_ONLY clean","action_taken":"TEST_ONLY documented"}'::jsonb
  ),
  true
);

select set_config(
  'careslink.concurrent.worker_identity_hash',
  encode(
    extensions.digest(
      convert_to('test-only-concurrency-worker-identity', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  true
);

select set_config(
  'careslink.concurrent.worker_policy_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-worker-policy',
      'version', 'worker.concurrency.20260823.v1',
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
  'careslink.concurrent.payload_policy_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'policyVersion', 'payload.concurrency.20260823.v1',
      'encryptionProfileVersion', 'encryption.concurrency.test.v1',
      'backupDispositionVersion', 'backup.concurrency.test.v1'
    )
  ),
  true
);

insert into rpc_concurrency_policy_values (
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
      'providerId', 'provider.concurrency.test',
      'modelId', 'model.concurrency.test',
      'modelRevision', null,
      'modelRevisionAvailability', 'PROVIDER_NOT_EXPOSED',
      'policyVersion', 'provider.concurrency.20260823.v1',
      'promptTemplateVersion', 'prompt.concurrency.test.v1',
      'goldenSetVersion', 'golden.concurrency.test.v1',
      'parserVersion', 'parser.concurrency.test.v1',
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
  'careslink.concurrent.registration_digest',
  public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-registered-worker',
      'registrationVersion', 'registration.concurrency.20260823.v1',
      'status', 'APPROVED',
      'contractVersion', '1.0.0-shadow.1',
      'schemaVersion', '2026-08-09.v1-shadow',
      'workerIdentityVersion', 'worker-identity.concurrency.test.v1',
      'workerIdentityHash',
        current_setting('careslink.concurrent.worker_identity_hash'),
      'workerPolicyVersion', 'worker.concurrency.20260823.v1',
      'workerPolicyDigest',
        current_setting('careslink.concurrent.worker_policy_digest'),
      'payloadPolicyVersion', 'payload.concurrency.20260823.v1',
      'payloadPolicySnapshotHash',
        current_setting('careslink.concurrent.payload_policy_digest'),
      'providerPolicies', (
        select jsonb_agg(
          jsonb_build_object(
            'noteType', policy.note_type,
            'policyVersion', 'provider.concurrency.20260823.v1',
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
        from rpc_concurrency_policy_values as policy
      )
    )
  ),
  true
);

insert into rpc_concurrency_fixture_values (
  ordinal,
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
  fixture.ordinal,
  fixture.owner_id,
  fixture.session_id,
  fixture.privacy_id,
  fixture.job_id,
  fixture.payload_id,
  encode(
    extensions.digest(
      convert_to('test-only-concurrency-idempotency-' || fixture.ordinal, 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  encode(
    extensions.digest(
      convert_to('test-only-concurrency-request-' || fixture.ordinal, 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  encode(
    extensions.digest(
      convert_to('test-only-concurrency-payload-' || fixture.ordinal, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
from (values
  (
    1,
    'c9100000-0000-4000-8000-000000000001'::uuid,
    'c9110000-0000-4000-8000-000000000001'::uuid,
    'c9120000-0000-4000-8000-000000000001'::uuid,
    'c9130000-0000-4000-8000-000000000001'::uuid,
    'c9140000-0000-4000-8000-000000000001'::uuid
  ),
  (
    2,
    'c9100000-0000-4000-8000-000000000002'::uuid,
    'c9110000-0000-4000-8000-000000000002'::uuid,
    'c9120000-0000-4000-8000-000000000002'::uuid,
    'c9130000-0000-4000-8000-000000000002'::uuid,
    'c9140000-0000-4000-8000-000000000002'::uuid
  ),
  (
    3,
    'c9100000-0000-4000-8000-000000000003'::uuid,
    'c9110000-0000-4000-8000-000000000003'::uuid,
    'c9120000-0000-4000-8000-000000000003'::uuid,
    'c9130000-0000-4000-8000-000000000003'::uuid,
    'c9140000-0000-4000-8000-000000000003'::uuid
  )
) as fixture(
  ordinal,
  owner_id,
  session_id,
  privacy_id,
  job_id,
  payload_id
);

grant select on rpc_concurrency_policy_values,
  rpc_concurrency_fixture_values
  to careslink_v1_generation_owner;

do $$
begin
  if exists (
    select 1
    from rpc_concurrency_fixture_values as fixture
    join auth.users as active_user on active_user.id = fixture.owner_id
  ) or exists (
    select 1
    from rpc_concurrency_fixture_values as fixture
    join auth.sessions as active_session on active_session.id = fixture.session_id
  ) or exists (
    select 1
    from rpc_concurrency_fixture_values as fixture
    join public.privacy_reviews as review on review.id = fixture.privacy_id
  ) then
    raise exception 'CONCURRENCY_SETUP_MANIFEST_ALREADY_PRESENT';
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
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'worker-rpc-concurrency-' || fixture.ordinal || '@example.invalid',
  'test-only-no-login',
  date_trunc('milliseconds', transaction_timestamp()),
  '{"provider":"email","providers":["email"],"role":"provider"}'::jsonb,
  '{}'::jsonb,
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp())
from rpc_concurrency_fixture_values as fixture;

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
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp()),
  null
from rpc_concurrency_fixture_values as fixture;

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
  current_setting('careslink.concurrent.facts_hash'),
  '2026-08-09.v1-shadow',
  'CONFIRMED',
  '[]'::jsonb,
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
  '1.0.0-shadow.1',
  '2026-08-11.preview.1',
  1,
  'privacy.worker.rpc.concurrency.' || fixture.ordinal,
  fixture.request_hash,
  true,
  true,
  true
from rpc_concurrency_fixture_values as fixture;

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
  if (select count(*) from careslink_v1_generation.settings) <> 1
    or (
      select count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is false
        and shadow_only is true
    ) <> 1
    or (select count(*) from careslink_v1_generation.worker_policies) <> 0
    or (select count(*) from careslink_v1_generation.provider_policies) <> 0
    or (select count(*) from careslink_v1_generation.payload_policies) <> 0
    or (select count(*) from careslink_v1_generation.worker_registrations) <> 0
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_provider_policies
    ) <> 0
    or (select count(*) from careslink_v1_generation.jobs) <> 0
    or (select count(*) from careslink_v1_generation.attempts) <> 0
    or (select count(*) from careslink_v1_generation.payloads) <> 0
    or (select count(*) from careslink_v1_generation.payload_grants) <> 0
    or (select count(*) from careslink_v1_generation.provider_evidence) <> 0
    or (
      select count(*)
      from careslink_v1_generation.payload_purge_outbox
    ) <> 0
  then
    raise exception 'CONCURRENCY_SETUP_DATABASE_NOT_EMPTY';
  end if;
end
$$;

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
  'worker.concurrency.20260823.v1',
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
  array[1000]::bigint[],
  array['LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT']::text[],
  10,
  'NONE',
  null,
  current_setting('careslink.concurrent.worker_policy_digest'),
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
  'provider.concurrency.20260823.v1',
  'APPROVED',
  policy.service_code,
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  '2026-08-09.v1-shadow',
  'provider.concurrency.test',
  'model.concurrency.test',
  null,
  'PROVIDER_NOT_EXPOSED',
  'prompt.concurrency.test.v1',
  'golden.concurrency.test.v1',
  'parser.concurrency.test.v1',
  20000,
  policy.provider_digest,
  true
from rpc_concurrency_policy_values as policy;

insert into careslink_v1_generation.payload_policies (
  policy_version,
  status,
  encryption_profile_version,
  backup_disposition_version,
  policy_digest,
  shadow_only
) values (
  'payload.concurrency.20260823.v1',
  'APPROVED',
  'encryption.concurrency.test.v1',
  'backup.concurrency.test.v1',
  current_setting('careslink.concurrent.payload_policy_digest'),
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
  current_setting('careslink.concurrent.registration_digest'),
  'registration.concurrency.20260823.v1',
  'APPROVED',
  '1.0.0-shadow.1',
  '2026-08-09.v1-shadow',
  'worker-identity.concurrency.test.v1',
  current_setting('careslink.concurrent.worker_identity_hash'),
  'worker.concurrency.20260823.v1',
  current_setting('careslink.concurrent.worker_policy_digest'),
  'payload.concurrency.20260823.v1',
  current_setting('careslink.concurrent.payload_policy_digest'),
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
  current_setting('careslink.concurrent.registration_digest'),
  policy.note_type,
  'provider.concurrency.20260823.v1',
  policy.provider_digest,
  true
from rpc_concurrency_policy_values as policy;

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
  current_setting('careslink.concurrent.facts_hash'),
  fixture.idempotency_hash,
  fixture.request_hash,
  'worker.concurrency.20260823.v1',
  current_setting('careslink.concurrent.worker_policy_digest'),
  'provider.concurrency.20260823.v1',
  policy.provider_digest,
  'payload.concurrency.20260823.v1',
  current_setting('careslink.concurrent.payload_policy_digest'),
  'QUEUED',
  0,
  case
    when fixture.ordinal = 1 then null
    else transaction_timestamp() + interval '20 minutes'
  end,
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp()),
  true
from rpc_concurrency_fixture_values as fixture
cross join lateral (
  select provider_digest
  from rpc_concurrency_policy_values
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
  date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
  current_setting('careslink.concurrent.facts_hash'),
  fixture.request_hash,
  'payload.concurrency.20260823.v1',
  'encryption.concurrency.test.v1',
  'backup.concurrency.test.v1',
  current_setting('careslink.concurrent.payload_policy_digest'),
  fixture.payload_handle_hash,
  'AVAILABLE',
  date_trunc('milliseconds', transaction_timestamp()) + interval '30 minutes',
  date_trunc('milliseconds', transaction_timestamp()),
  0,
  date_trunc('milliseconds', transaction_timestamp()),
  date_trunc('milliseconds', transaction_timestamp()),
  true
from rpc_concurrency_fixture_values as fixture;

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

create schema careslink_v1_generation_concurrency_test_support
  authorization postgres;
revoke all on schema careslink_v1_generation_concurrency_test_support
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_concurrency_runner;

-- These two zero-argument helpers are the complete privileged mutation
-- boundary authorized for this disposable Preview. They are postgres-owned,
-- fix every target key in their bodies, accept no caller-controlled value and
-- cannot be reused against any non-fixture row.
create function
careslink_v1_generation_concurrency_test_support.delete_session_fixture()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_concurrency_runner'
    or current_user <> 'postgres'
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) not in (
      'careslink-worker-rpc-race-a',
      'careslink-worker-rpc-race-b'
    )
  then
    raise exception 'CONCURRENCY_HELPER_CALLER_UNSAFE';
  end if;

  delete from auth.sessions as active_session
  where active_session.id =
      'c9110000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and active_session.user_id =
      'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'CONCURRENCY_HELPER_SESSION_DELETE_MISMATCH';
  end if;
  return true;
end;
$$;

create function
careslink_v1_generation_concurrency_test_support.revoke_privacy_fixture()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_concurrency_runner'
    or current_user <> 'postgres'
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) not in (
      'careslink-worker-rpc-race-a',
      'careslink-worker-rpc-race-b'
    )
  then
    raise exception 'CONCURRENCY_HELPER_CALLER_UNSAFE';
  end if;

  update public.privacy_reviews as review
  set status = 'REVOKED'
  where review.id =
      'c9120000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and review.owner_user_id =
      'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and review.note_type = 'communication'
    and review.status = 'CONFIRMED'
    and review.review_revision = 1
    and review.mutation_id = 'privacy.worker.rpc.concurrency.3'
    and review.shadow_only is true;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'CONCURRENCY_HELPER_PRIVACY_REVOKE_MISMATCH';
  end if;
  return true;
end;
$$;

revoke all on function
  careslink_v1_generation_concurrency_test_support.delete_session_fixture()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_concurrency_runner;
revoke all on function
  careslink_v1_generation_concurrency_test_support.revoke_privacy_fixture()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_concurrency_runner;

grant usage, create
  on schema careslink_v1_generation_concurrency_test_support
  to careslink_v1_generation_executor;

set local role careslink_v1_generation_executor;

create function
careslink_v1_generation_concurrency_test_support.fixture_catalog()
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
  if session_user <> 'careslink_v1_generation_concurrency_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) not in (
      'careslink-worker-rpc-race-a',
      'careslink-worker-rpc-race-b'
    )
  then
    raise exception 'CONCURRENCY_HELPER_CALLER_UNSAFE';
  end if;

  select pg_catalog.jsonb_build_object(
    'registrationDigest', registration.registration_digest,
    'workerIdentityHash', registration.worker_identity_hash,
    'workerPolicyDigest', policy.policy_digest
  )
  into v_result
  from careslink_v1_generation.worker_registrations as registration
  join careslink_v1_generation.worker_policies as policy
    on policy.version = registration.worker_policy_version
   and policy.policy_digest = registration.worker_policy_digest
  where registration.registration_version =
      'registration.concurrency.20260823.v1'
    and policy.version = 'worker.concurrency.20260823.v1';

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_result is null then
    raise exception 'CONCURRENCY_HELPER_CATALOG_MISMATCH';
  end if;
  return v_result;
end;
$$;

create function
careslink_v1_generation_concurrency_test_support.activate_session_fixture()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_concurrency_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) not in (
      'careslink-worker-rpc-race-a',
      'careslink-worker-rpc-race-b'
    )
  then
    raise exception 'CONCURRENCY_HELPER_CALLER_UNSAFE';
  end if;

  update careslink_v1_generation.jobs as job
  set next_eligible_at = null,
      updated_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.transaction_timestamp()
      )
  where job.id = 'c9130000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and job.owner_user_id =
      'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and job.payload_id =
      'c9140000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and job.status = 'QUEUED'
    and job.attempt_count = 0;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'CONCURRENCY_HELPER_SESSION_ACTIVATION_MISMATCH';
  end if;
  return true;
end;
$$;

create function
careslink_v1_generation_concurrency_test_support.activate_privacy_fixture()
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_concurrency_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) not in (
      'careslink-worker-rpc-race-a',
      'careslink-worker-rpc-race-b'
    )
  then
    raise exception 'CONCURRENCY_HELPER_CALLER_UNSAFE';
  end if;

  update careslink_v1_generation.jobs as job
  set next_eligible_at = null,
      updated_at = pg_catalog.date_trunc(
        'milliseconds', pg_catalog.transaction_timestamp()
      )
  where job.id = 'c9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and job.owner_user_id =
      'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and job.payload_id =
      'c9140000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and job.status = 'QUEUED'
    and job.attempt_count = 0;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'CONCURRENCY_HELPER_PRIVACY_ACTIVATION_MISMATCH';
  end if;
  return true;
end;
$$;

-- Executor-owned state helpers use the production RPC role's existing
-- FORCE-RLS policies. Each helper fixes both the private job and canonical
-- owner identity and returns only aggregate status, never IDs or capabilities.

create function
careslink_v1_generation_concurrency_test_support.fixture_state_claim()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result pg_catalog.jsonb;
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_concurrency_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) not in (
      'careslink-worker-rpc-race-a',
      'careslink-worker-rpc-race-b'
    )
  then
    raise exception 'CONCURRENCY_HELPER_CALLER_UNSAFE';
  end if;

  perform pg_catalog.set_config(
    'careslink.v1_generation_owner_user_id',
    'c9100000-0000-4000-8000-000000000001',
    true
  );

  select pg_catalog.jsonb_build_object(
    'job_status', job.status,
    'attempt_count', job.attempt_count,
    'job_failure_reason', job.failure_reason,
    'payload_state', payload.state,
    'revoke_reason', payload.revoke_reason,
    'attempt_count_rows',
      pg_catalog.count(distinct attempt.id)::pg_catalog.int4,
    'running_attempts',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'RUNNING'
      )::pg_catalog.int4,
    'failed_attempts',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'FAILED'
      )::pg_catalog.int4,
    'failed_attempts_with_job_reason',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'FAILED'
          and attempt.failure_reason = job.failure_reason
      )::pg_catalog.int4,
    'grant_count',
      pg_catalog.count(distinct grant_record.id)::pg_catalog.int4,
    'revoked_grants',
      pg_catalog.count(distinct grant_record.id) filter (
        where grant_record.status = 'REVOKED'
      )::pg_catalog.int4,
    'consumed_or_released_grants',
      pg_catalog.count(distinct grant_record.id) filter (
        where grant_record.consumed_at is not null
          or grant_record.vault_grant_hash is not null
      )::pg_catalog.int4,
    'evidence_count',
      pg_catalog.count(distinct evidence.attempt_id)::pg_catalog.int4,
    'outbox_count',
      pg_catalog.count(distinct outbox.id)::pg_catalog.int4,
    'failed_pending_outbox_count',
      pg_catalog.count(distinct outbox.id) filter (
        where outbox.reason = 'FAILED'
          and outbox.status = 'PENDING'
      )::pg_catalog.int4,
    'canonicalRows',
      (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_documents as document
        where document.owner_user_id =
          'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_revisions as revision
        where revision.owner_user_id =
          'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_sync_changes as sync_change
        where sync_change.owner_user_id =
          'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_mutation_receipts as receipt
        where receipt.owner_user_id =
          'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
      )
  )
  into v_result
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  left join careslink_v1_generation.attempts as attempt
    on attempt.job_id = job.id
  left join careslink_v1_generation.payload_grants as grant_record
    on grant_record.job_id = job.id
  left join careslink_v1_generation.provider_evidence as evidence
    on evidence.job_id = job.id
  left join careslink_v1_generation.payload_purge_outbox as outbox
    on outbox.job_id = job.id
  where job.id =
      'c9130000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and job.owner_user_id =
      'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
    and payload.id =
      'c9140000-0000-4000-8000-000000000001'::pg_catalog.uuid
  group by job.id, payload.id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_result is null then
    raise exception 'CONCURRENCY_HELPER_CLAIM_STATE_MISMATCH';
  end if;
  return v_result;
end;
$$;

create function
careslink_v1_generation_concurrency_test_support.fixture_state_session()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result pg_catalog.jsonb;
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_concurrency_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) not in (
      'careslink-worker-rpc-race-a',
      'careslink-worker-rpc-race-b'
    )
  then
    raise exception 'CONCURRENCY_HELPER_CALLER_UNSAFE';
  end if;

  perform pg_catalog.set_config(
    'careslink.v1_generation_owner_user_id',
    'c9100000-0000-4000-8000-000000000002',
    true
  );

  select pg_catalog.jsonb_build_object(
    'job_status', job.status,
    'attempt_count', job.attempt_count,
    'job_failure_reason', job.failure_reason,
    'payload_state', payload.state,
    'revoke_reason', payload.revoke_reason,
    'attempt_count_rows',
      pg_catalog.count(distinct attempt.id)::pg_catalog.int4,
    'running_attempts',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'RUNNING'
      )::pg_catalog.int4,
    'failed_attempts',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'FAILED'
      )::pg_catalog.int4,
    'failed_attempts_with_job_reason',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'FAILED'
          and attempt.failure_reason = job.failure_reason
      )::pg_catalog.int4,
    'grant_count',
      pg_catalog.count(distinct grant_record.id)::pg_catalog.int4,
    'revoked_grants',
      pg_catalog.count(distinct grant_record.id) filter (
        where grant_record.status = 'REVOKED'
      )::pg_catalog.int4,
    'consumed_or_released_grants',
      pg_catalog.count(distinct grant_record.id) filter (
        where grant_record.consumed_at is not null
          or grant_record.vault_grant_hash is not null
      )::pg_catalog.int4,
    'evidence_count',
      pg_catalog.count(distinct evidence.attempt_id)::pg_catalog.int4,
    'outbox_count',
      pg_catalog.count(distinct outbox.id)::pg_catalog.int4,
    'failed_pending_outbox_count',
      pg_catalog.count(distinct outbox.id) filter (
        where outbox.reason = 'FAILED'
          and outbox.status = 'PENDING'
      )::pg_catalog.int4,
    'canonicalRows',
      (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_documents as document
        where document.owner_user_id =
          'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_revisions as revision
        where revision.owner_user_id =
          'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_sync_changes as sync_change
        where sync_change.owner_user_id =
          'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_mutation_receipts as receipt
        where receipt.owner_user_id =
          'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
      )
  )
  into v_result
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  left join careslink_v1_generation.attempts as attempt
    on attempt.job_id = job.id
  left join careslink_v1_generation.payload_grants as grant_record
    on grant_record.job_id = job.id
  left join careslink_v1_generation.provider_evidence as evidence
    on evidence.job_id = job.id
  left join careslink_v1_generation.payload_purge_outbox as outbox
    on outbox.job_id = job.id
  where job.id =
      'c9130000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and job.owner_user_id =
      'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
    and payload.id =
      'c9140000-0000-4000-8000-000000000002'::pg_catalog.uuid
  group by job.id, payload.id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_result is null then
    raise exception 'CONCURRENCY_HELPER_SESSION_STATE_MISMATCH';
  end if;
  return v_result;
end;
$$;

create function
careslink_v1_generation_concurrency_test_support.fixture_state_privacy()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result pg_catalog.jsonb;
  v_row_count pg_catalog.int8;
begin
  if session_user <> 'careslink_v1_generation_concurrency_runner'
    or current_user <> 'careslink_v1_generation_executor'
    or coalesce(
      pg_catalog.current_setting('application_name', true),
      ''
    ) not in (
      'careslink-worker-rpc-race-a',
      'careslink-worker-rpc-race-b'
    )
  then
    raise exception 'CONCURRENCY_HELPER_CALLER_UNSAFE';
  end if;

  perform pg_catalog.set_config(
    'careslink.v1_generation_owner_user_id',
    'c9100000-0000-4000-8000-000000000003',
    true
  );

  select pg_catalog.jsonb_build_object(
    'job_status', job.status,
    'attempt_count', job.attempt_count,
    'job_failure_reason', job.failure_reason,
    'payload_state', payload.state,
    'revoke_reason', payload.revoke_reason,
    'attempt_count_rows',
      pg_catalog.count(distinct attempt.id)::pg_catalog.int4,
    'running_attempts',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'RUNNING'
      )::pg_catalog.int4,
    'failed_attempts',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'FAILED'
      )::pg_catalog.int4,
    'failed_attempts_with_job_reason',
      pg_catalog.count(distinct attempt.id) filter (
        where attempt.status = 'FAILED'
          and attempt.failure_reason = job.failure_reason
      )::pg_catalog.int4,
    'grant_count',
      pg_catalog.count(distinct grant_record.id)::pg_catalog.int4,
    'revoked_grants',
      pg_catalog.count(distinct grant_record.id) filter (
        where grant_record.status = 'REVOKED'
      )::pg_catalog.int4,
    'consumed_or_released_grants',
      pg_catalog.count(distinct grant_record.id) filter (
        where grant_record.consumed_at is not null
          or grant_record.vault_grant_hash is not null
      )::pg_catalog.int4,
    'evidence_count',
      pg_catalog.count(distinct evidence.attempt_id)::pg_catalog.int4,
    'outbox_count',
      pg_catalog.count(distinct outbox.id)::pg_catalog.int4,
    'failed_pending_outbox_count',
      pg_catalog.count(distinct outbox.id) filter (
        where outbox.reason = 'FAILED'
          and outbox.status = 'PENDING'
      )::pg_catalog.int4,
    'canonicalRows',
      (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_documents as document
        where document.owner_user_id =
          'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_revisions as revision
        where revision.owner_user_id =
          'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_sync_changes as sync_change
        where sync_change.owner_user_id =
          'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
      ) + (
        select pg_catalog.count(*)::pg_catalog.int4
        from public.ai_document_mutation_receipts as receipt
        where receipt.owner_user_id =
          'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
      )
  )
  into v_result
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  left join careslink_v1_generation.attempts as attempt
    on attempt.job_id = job.id
  left join careslink_v1_generation.payload_grants as grant_record
    on grant_record.job_id = job.id
  left join careslink_v1_generation.provider_evidence as evidence
    on evidence.job_id = job.id
  left join careslink_v1_generation.payload_purge_outbox as outbox
    on outbox.job_id = job.id
  where job.id =
      'c9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and job.owner_user_id =
      'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    and payload.id =
      'c9140000-0000-4000-8000-000000000003'::pg_catalog.uuid
  group by job.id, payload.id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_result is null then
    raise exception 'CONCURRENCY_HELPER_PRIVACY_STATE_MISMATCH';
  end if;
  return v_result;
end;
$$;

revoke all on function
  careslink_v1_generation_concurrency_test_support.fixture_catalog(),
  careslink_v1_generation_concurrency_test_support.activate_session_fixture(),
  careslink_v1_generation_concurrency_test_support.activate_privacy_fixture(),
  careslink_v1_generation_concurrency_test_support.fixture_state_claim(),
  careslink_v1_generation_concurrency_test_support.fixture_state_session(),
  careslink_v1_generation_concurrency_test_support.fixture_state_privacy()
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_concurrency_runner;

grant execute on function
  careslink_v1_generation_concurrency_test_support.fixture_catalog()
  to careslink_v1_generation_concurrency_runner;
grant execute on function
  careslink_v1_generation_concurrency_test_support.activate_session_fixture()
  to careslink_v1_generation_concurrency_runner;
grant execute on function
  careslink_v1_generation_concurrency_test_support.activate_privacy_fixture()
  to careslink_v1_generation_concurrency_runner;
grant execute on function
  careslink_v1_generation_concurrency_test_support.fixture_state_claim()
  to careslink_v1_generation_concurrency_runner;
grant execute on function
  careslink_v1_generation_concurrency_test_support.fixture_state_session()
  to careslink_v1_generation_concurrency_runner;
grant execute on function
  careslink_v1_generation_concurrency_test_support.fixture_state_privacy()
  to careslink_v1_generation_concurrency_runner;

revoke all on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    text, text, text, text, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_concurrency_runner;
revoke all on function
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    uuid, uuid, uuid, text, text
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_concurrency_runner;
revoke all on function
  careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
    uuid, uuid, uuid, text, text, uuid
  )
  from public, anon, authenticated, service_role,
    careslink_v1_generation_owner,
    careslink_v1_generation_concurrency_runner;

grant execute on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    text, text, text, text, text, text
  )
  to careslink_v1_generation_concurrency_runner;
grant execute on function
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    uuid, uuid, uuid, text, text
  )
  to careslink_v1_generation_concurrency_runner;
grant execute on function
  careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
    uuid, uuid, uuid, text, text, uuid
  )
  to careslink_v1_generation_concurrency_runner;

reset role;

revoke create
  on schema careslink_v1_generation_concurrency_test_support
  from careslink_v1_generation_executor;
revoke usage
  on schema careslink_v1_generation_concurrency_test_support
  from careslink_v1_generation_executor;

grant execute on function
  careslink_v1_generation_concurrency_test_support.delete_session_fixture()
  to careslink_v1_generation_concurrency_runner;
grant execute on function
  careslink_v1_generation_concurrency_test_support.revoke_privacy_fixture()
  to careslink_v1_generation_concurrency_runner;
grant usage on schema careslink_v1_generation_concurrency_test_support
  to careslink_v1_generation_concurrency_runner;

set local role careslink_v1_generation_owner;
grant usage on schema careslink_v1_generation
  to careslink_v1_generation_concurrency_runner;
reset role;

-- Prove the final least-privilege surface rather than relying on the grant
-- statements above. Owners retain only PostgreSQL's inherent owner power;
-- the runner is the sole non-owner EXECUTE grantee on these 11 identities.
do $$
declare
  v_support_schema pg_catalog.oid :=
    'careslink_v1_generation_concurrency_test_support'::pg_catalog.regnamespace;
  v_generation_schema pg_catalog.oid :=
    'careslink_v1_generation'::pg_catalog.regnamespace;
  v_runner pg_catalog.oid :=
    'careslink_v1_generation_concurrency_runner'::pg_catalog.regrole;
begin
  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_support_schema
    ) <> 8
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_support_schema
        and (
          procedure.proname <> all(array[
            'fixture_catalog',
            'activate_session_fixture',
            'activate_privacy_fixture',
            'delete_session_fixture',
            'revoke_privacy_fixture',
            'fixture_state_claim',
            'fixture_state_session',
            'fixture_state_privacy'
          ]::pg_catalog.text[])
          or procedure.pronargs <> 0
          or not procedure.prosecdef
          or procedure.proconfig is null
          or pg_catalog.cardinality(procedure.proconfig) <> 1
          or procedure.proconfig[1] not in ('search_path=', 'search_path=""')
          or pg_catalog.strpos(procedure.prosrc, 'session_user') = 0
          or pg_catalog.strpos(
            procedure.prosrc,
            'careslink_v1_generation_concurrency_runner'
          ) = 0
          or pg_catalog.strpos(
            procedure.prosrc,
            'application_name'
          ) = 0
          or pg_catalog.strpos(
            procedure.prosrc,
            'careslink-worker-rpc-race-a'
          ) = 0
          or pg_catalog.strpos(
            procedure.prosrc,
            'careslink-worker-rpc-race-b'
          ) = 0
          or procedure.proowner <> case
            when procedure.proname in (
              'delete_session_fixture', 'revoke_privacy_fixture'
            ) then 'postgres'::pg_catalog.regrole
            else 'careslink_v1_generation_executor'::pg_catalog.regrole
          end
          or procedure.prorettype <> case
            when procedure.proname in (
              'fixture_catalog',
              'fixture_state_claim',
              'fixture_state_session',
              'fixture_state_privacy'
            ) then 'pg_catalog.jsonb'::pg_catalog.regtype
            else 'pg_catalog.bool'::pg_catalog.regtype
          end
          or procedure.provolatile <> case
            when procedure.proname = 'fixture_catalog' then 's'::"char"
            else 'v'::"char"
          end
        )
    )
  then
    raise exception 'CONCURRENCY_SETUP_HELPER_DEFINITION_UNSAFE';
  end if;

  if exists (
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
          procedure.proowner,
          v_runner
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_support_schema
        and not exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(
              procedure.proacl,
              pg_catalog.acldefault('f', procedure.proowner)
            )
          ) as privilege_record
          where privilege_record.grantee = v_runner
            and privilege_record.privilege_type = 'EXECUTE'
            and privilege_record.is_grantable is false
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_support_schema
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
  then
    raise exception 'CONCURRENCY_SETUP_HELPER_ACL_UNSAFE';
  end if;

  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = any(array[
        'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
        'careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
        'careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(uuid,uuid,uuid,text,text,uuid)'::pg_catalog.regprocedure::pg_catalog.oid
      ])
        and procedure.pronamespace = v_generation_schema
        and procedure.proowner =
          'careslink_v1_generation_executor'::pg_catalog.regrole
        and procedure.prosecdef
    ) <> 3
  then
    raise exception 'CONCURRENCY_SETUP_RPC_POSTURE_UNSAFE';
  end if;

  if exists (
      select 1
      from pg_catalog.pg_proc as procedure
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as privilege_record
      where procedure.oid = any(array[
        'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
        'careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
        'careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(uuid,uuid,uuid,text,text,uuid)'::pg_catalog.regprocedure::pg_catalog.oid
      ])
        and privilege_record.privilege_type = 'EXECUTE'
        and privilege_record.grantee not in (
          procedure.proowner,
          v_runner
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.oid = any(array[
        'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
        'careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)'::pg_catalog.regprocedure::pg_catalog.oid,
        'careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(uuid,uuid,uuid,text,text,uuid)'::pg_catalog.regprocedure::pg_catalog.oid
      ])
        and (
          not pg_catalog.has_function_privilege(
            'careslink_v1_generation_concurrency_runner',
            procedure.oid,
            'EXECUTE'
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
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_generation_schema
        and procedure.proname = any(array[
          'heartbeat_v1_shadow_note_generation_attempt',
          'fence_v1_shadow_note_generation_attempt',
          'commit_v1_shadow_note_generation_success',
          'settle_v1_shadow_note_generation_failure',
          'resolve_v1_shadow_note_generation_attempt',
          'recover_v1_shadow_note_generation_expired'
        ]::pg_catalog.text[])
        and pg_catalog.has_function_privilege(
          'careslink_v1_generation_concurrency_runner',
          procedure.oid,
          'EXECUTE'
        )
    )
  then
    raise exception 'CONCURRENCY_SETUP_RPC_ACL_UNSAFE';
  end if;

  if not pg_catalog.has_schema_privilege(
      'careslink_v1_generation_concurrency_runner',
      v_support_schema,
      'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_v1_generation_concurrency_runner',
      v_support_schema,
      'CREATE'
    )
    or not pg_catalog.has_schema_privilege(
      'careslink_v1_generation_concurrency_runner',
      v_generation_schema,
      'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_v1_generation_concurrency_runner',
      v_generation_schema,
      'CREATE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_v1_generation_executor',
      v_support_schema,
      'CREATE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_v1_generation_executor',
      v_support_schema,
      'USAGE'
    )
  then
    raise exception 'CONCURRENCY_SETUP_SCHEMA_ACL_UNSAFE';
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
        from rpc_concurrency_management_membership_baseline
      )
      union all
      (
        select *
        from rpc_concurrency_management_membership_baseline
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
      'careslink_v1_generation_concurrency_runner',
      'careslink_v1_generation_owner',
      'MEMBER'
    )
    or pg_catalog.pg_has_role(
      'careslink_v1_generation_concurrency_runner',
      'careslink_v1_generation_executor',
      'MEMBER'
    )
  then
    raise exception 'CONCURRENCY_SETUP_ROLE_MEMBERSHIP_RESTORE_FAILED';
  end if;
end
$$;

commit;
