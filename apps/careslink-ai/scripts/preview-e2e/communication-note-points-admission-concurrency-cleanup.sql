-- Exact cleanup for the disposable Communication Note Points admission gate.
-- Run only after every dedicated runner connection has disconnected.

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
    or pg_catalog.to_regrole(
      'careslink_v1_communication_admission_concurrency_runner'
    ) is null
    or pg_catalog.to_regnamespace(
      'careslink_v1_communication_admission_concurrency_test_support'
    ) is null
    or not exists (
      select 1
      from pg_catalog.pg_trigger as immutable_trigger
      where immutable_trigger.tgrelid =
          'careslink_v1_generation.communication_note_point_admissions'::pg_catalog.regclass
        and immutable_trigger.tgname =
          'communication_note_point_admissions_immutable'
        and immutable_trigger.tgenabled = 'O'
        and immutable_trigger.tgisinternal is false
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as marker_guard
      where marker_guard.tgrelid =
          'careslink_v1_generation.jobs'::pg_catalog.regclass
        and marker_guard.tgname =
          'jobs_communication_note_point_marker_guard'
        and marker_guard.tgenabled = 'O'
        and marker_guard.tgisinternal is false
    )
    or (
      select pg_catalog.pg_get_constraintdef(
        constraint_record.oid,
        true
      )
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid =
          'careslink_v1_generation.jobs'::pg_catalog.regclass
        and constraint_record.conname = 'jobs_payload_owner_fk'
        and constraint_record.convalidated
    ) is distinct from
      'FOREIGN KEY (payload_id, id, owner_user_id) REFERENCES careslink_v1_generation.payloads(id, job_id, owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CLEANUP_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_stat_activity
    where usename =
      'careslink_v1_communication_admission_concurrency_runner'
  ) then
    raise exception
      'COMMUNICATION_ADMISSION_CONCURRENCY_CLEANUP_ACTIVE_RUNNER';
  end if;

  if (
      select pg_catalog.count(*)
      from auth.users as synthetic_user
      join (values
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
      ) as fixture(owner_id, email)
        on fixture.owner_id = synthetic_user.id
       and fixture.email = synthetic_user.email
    ) <> 5
    or exists (
      select 1
      from auth.users as synthetic_user
      where synthetic_user.email like
          'communication-admission-%@example.invalid'
        and synthetic_user.id not in (
          'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
        )
    )
  then
    raise exception 'COMMUNICATION_ADMISSION_CONCURRENCY_CLEANUP_UNSAFE';
  end if;
end;
$$;

revoke execute on function
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
from careslink_v1_communication_admission_concurrency_runner;

drop schema
  careslink_v1_communication_admission_concurrency_test_support
cascade;

alter table careslink_v1_generation.jobs
disable trigger jobs_communication_note_point_marker_guard;

update careslink_v1_generation.jobs
set communication_note_point_admission_id = null
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
)
  and communication_note_point_admission_id is not null;

alter table careslink_v1_generation.jobs
enable trigger jobs_communication_note_point_marker_guard;

alter table
  careslink_v1_generation.communication_note_point_admissions
disable trigger communication_note_point_admissions_immutable;

delete from careslink_v1_generation.communication_note_point_admissions
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

alter table
  careslink_v1_generation.communication_note_point_admissions
enable trigger communication_note_point_admissions_immutable;

alter table careslink_v1_generation.jobs
  drop constraint jobs_payload_owner_fk;

delete from careslink_v1_generation.payloads
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from careslink_v1_generation.jobs
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

alter table careslink_v1_generation.jobs
  add constraint jobs_payload_owner_fk
  foreign key (payload_id, id, owner_user_id)
  references careslink_v1_generation.payloads(id, job_id, owner_user_id)
  on delete restrict
  deferrable initially deferred;

delete from public.point_ledger_entries
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from public.point_reservation_allocations
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from public.point_reservations
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from public.point_quotes
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from public.point_lots
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from public.point_wallets
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from public.privacy_reviews
where owner_user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from auth.sessions
where user_id in (
  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
);

delete from auth.users as synthetic_user
where (synthetic_user.id, synthetic_user.email) in (
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
);

delete from careslink_v1_generation.admission_policy_bindings
where binding_version =
  'binding.communication-admission-concurrency.20260902.v1';

delete from careslink_v1_generation.worker_registration_provider_policies
where registration_digest in (
  select registration.registration_digest
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
    'registration.communication-admission-concurrency.20260902.v1'
);

delete from careslink_v1_generation.worker_registrations
where registration_version =
  'registration.communication-admission-concurrency.20260902.v1';

delete from careslink_v1_generation.provider_policies
where policy_version =
  'provider.communication-admission-concurrency.20260902.v1';

delete from careslink_v1_generation.payload_policies
where policy_version =
  'payload.communication-admission-concurrency.20260902.v1';

delete from careslink_v1_generation.worker_policies
where version =
  'worker.communication-admission-concurrency.20260902.v1';

update careslink_v1_generation.settings
set enabled = false,
    updated_at = pg_catalog.date_trunc(
      'milliseconds', pg_catalog.clock_timestamp()
    )
where capability = 'note_generation_v1'
  and enabled is true
  and shadow_only is true;

alter table careslink_v1_generation.settings
  add constraint settings_enabled_check check (enabled = false);

revoke usage on schema careslink_v1_generation
from careslink_v1_communication_admission_concurrency_runner;
revoke connect on database postgres
from careslink_v1_communication_admission_concurrency_runner;
drop role careslink_v1_communication_admission_concurrency_runner;

do $$
begin
  if not exists (
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
    or pg_catalog.to_regrole(
      'careslink_v1_communication_admission_concurrency_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_v1_communication_admission_concurrency_test_support'
    ) is not null
    or exists (
      select 1
      from auth.users
      where email like 'communication-admission-%@example.invalid'
    )
    or exists (select 1 from careslink_v1_generation.jobs)
    or exists (select 1 from careslink_v1_generation.payloads)
    or exists (
      select 1
      from careslink_v1_generation.communication_note_point_admissions
    )
    or exists (select 1 from public.point_wallets)
    or exists (select 1 from public.point_lots)
    or exists (select 1 from public.point_quotes)
    or exists (select 1 from public.point_reservations)
    or exists (select 1 from public.point_reservation_allocations)
    or exists (select 1 from public.point_ledger_entries)
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
    or (
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
    or not exists (
      select 1
      from pg_catalog.pg_trigger as immutable_trigger
      where immutable_trigger.tgrelid =
          'careslink_v1_generation.communication_note_point_admissions'::pg_catalog.regclass
        and immutable_trigger.tgname =
          'communication_note_point_admissions_immutable'
        and immutable_trigger.tgenabled = 'O'
        and immutable_trigger.tgisinternal is false
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as marker_guard
      where marker_guard.tgrelid =
          'careslink_v1_generation.jobs'::pg_catalog.regclass
        and marker_guard.tgname =
          'jobs_communication_note_point_marker_guard'
        and marker_guard.tgenabled = 'O'
        and marker_guard.tgisinternal is false
    )
    or (
      select pg_catalog.pg_get_constraintdef(
        constraint_record.oid,
        true
      )
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid =
          'careslink_v1_generation.jobs'::pg_catalog.regclass
        and constraint_record.conname = 'jobs_payload_owner_fk'
        and constraint_record.convalidated
    ) is distinct from
      'FOREIGN KEY (payload_id, id, owner_user_id) REFERENCES careslink_v1_generation.payloads(id, job_id, owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'
  then
    raise exception
      'COMMUNICATION_ADMISSION_CONCURRENCY_CLEANUP_POSTCHECK_FAILED';
  end if;
end;
$$;

commit;
