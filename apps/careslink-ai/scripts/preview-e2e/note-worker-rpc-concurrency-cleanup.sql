-- Exact TEST_ONLY cleanup for note-worker-rpc-concurrency-setup.sql.
-- This transaction is allowed only after every race assertion passed and the
-- paired pooler-quiesce and pooler-drain requests committed. A failure must
-- roll back and be followed by exact disposable branch deletion.

begin;

do $$
declare
  v_support_schema pg_catalog.oid :=
    pg_catalog.to_regnamespace(
      'careslink_v1_generation_concurrency_test_support'
    );
  v_runner pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_generation_concurrency_runner'
  );
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'CONCURRENCY_CLEANUP_MANAGEMENT_ROLE_UNSAFE';
  end if;

  if v_runner is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runner
        and role_record.rolcanlogin is false
        and role_record.rolsuper is false
        and role_record.rolbypassrls is false
        and role_record.rolcreatedb is false
        and role_record.rolcreaterole is false
        and role_record.rolinherit is false
        and role_record.rolreplication is false
        and role_record.rolconnlimit = 2
    ) <> 1
    or v_support_schema is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace = v_support_schema
        and procedure.pronargs = 0
        and procedure.proname = any(array[
          'fixture_catalog',
          'activate_session_fixture',
          'activate_privacy_fixture',
          'delete_session_fixture',
          'revoke_privacy_fixture',
          'fixture_state_claim',
          'fixture_state_session',
          'fixture_state_privacy'
        ]::pg_catalog.text[])
        and procedure.prosecdef
        and procedure.proconfig is not null
        and pg_catalog.cardinality(procedure.proconfig) = 1
        and procedure.proconfig[1] in ('search_path=', 'search_path=""')
    ) <> 8
    or pg_catalog.pg_has_role(
      v_runner,
      'careslink_v1_generation_owner',
      'MEMBER'
    )
    or pg_catalog.pg_has_role(
      v_runner,
      'careslink_v1_generation_executor',
      'MEMBER'
    )
  then
    raise exception 'CONCURRENCY_CLEANUP_MANAGEMENT_ROLE_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_stat_activity as activity
    where activity.usename =
      'careslink_v1_generation_concurrency_runner'
      and activity.backend_type = 'client backend'
  ) then
    raise exception 'CONCURRENCY_CLEANUP_ACTIVE_RUNNER_SESSION';
  end if;
end
$$;

create temporary table rpc_concurrency_cleanup_membership_baseline
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
    from rpc_concurrency_cleanup_membership_baseline as membership
    where membership.grantor = 'postgres'::pg_catalog.regrole
  ) then
    raise exception 'CONCURRENCY_CLEANUP_MANAGEMENT_ROLE_UNSAFE';
  end if;
end
$$;

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

do $$
declare
  v_runner pg_catalog.oid :=
    'careslink_v1_generation_concurrency_runner'::pg_catalog.regrole;
begin
  if (
      select pg_catalog.count(*)
      from auth.users as active_user
      join (values
        (
          'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'worker-rpc-concurrency-1@example.invalid'::pg_catalog.text
        ),
        (
          'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
          'worker-rpc-concurrency-2@example.invalid'::pg_catalog.text
        ),
        (
          'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid,
          'worker-rpc-concurrency-3@example.invalid'::pg_catalog.text
        )
      ) as expected(id, email)
        on expected.id = active_user.id
       and expected.email = active_user.email
    ) <> 3
    or (
      select pg_catalog.count(*)
      from auth.sessions as active_session
      where (
        active_session.id,
        active_session.user_id
      ) in (
        (
          'c9110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid
        ),
        (
          'c9110000-0000-4000-8000-000000000003'::pg_catalog.uuid,
          'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
        )
      )
    ) <> 2
    or exists (
      select 1
      from auth.sessions as active_session
      where active_session.id =
        'c9110000-0000-4000-8000-000000000002'::pg_catalog.uuid
    )
    or (
      select pg_catalog.count(*)
      from public.privacy_reviews as review
      join (values
        (
          'c9120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'CONFIRMED'::pg_catalog.text,
          'privacy.worker.rpc.concurrency.1'::pg_catalog.text
        ),
        (
          'c9120000-0000-4000-8000-000000000002'::pg_catalog.uuid,
          'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
          'CONFIRMED'::pg_catalog.text,
          'privacy.worker.rpc.concurrency.2'::pg_catalog.text
        ),
        (
          'c9120000-0000-4000-8000-000000000003'::pg_catalog.uuid,
          'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid,
          'REVOKED'::pg_catalog.text,
          'privacy.worker.rpc.concurrency.3'::pg_catalog.text
        )
      ) as expected(id, owner_id, status, mutation_id)
        on expected.id = review.id
       and expected.owner_id = review.owner_user_id
       and expected.status = review.status
       and expected.mutation_id = review.mutation_id
      where review.note_type = 'communication'
        and review.review_revision = 1
        and review.shadow_only is true
    ) <> 3
    or not pg_catalog.has_schema_privilege(
      v_runner,
      'careslink_v1_generation_concurrency_test_support',
      'USAGE'
    )
    or not pg_catalog.has_schema_privilege(
      v_runner,
      'careslink_v1_generation',
      'USAGE'
    )
    or (
      select pg_catalog.count(*)
      from (values
        ('careslink_v1_generation_concurrency_test_support.fixture_catalog()'),
        ('careslink_v1_generation_concurrency_test_support.activate_session_fixture()'),
        ('careslink_v1_generation_concurrency_test_support.activate_privacy_fixture()'),
        ('careslink_v1_generation_concurrency_test_support.delete_session_fixture()'),
        ('careslink_v1_generation_concurrency_test_support.revoke_privacy_fixture()'),
        ('careslink_v1_generation_concurrency_test_support.fixture_state_claim()'),
        ('careslink_v1_generation_concurrency_test_support.fixture_state_session()'),
        ('careslink_v1_generation_concurrency_test_support.fixture_state_privacy()'),
        ('careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'),
        ('careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)'),
        ('careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(uuid,uuid,uuid,text,text,uuid)')
      ) as required(signature)
      where pg_catalog.to_regprocedure(required.signature) is not null
        and pg_catalog.has_function_privilege(
          v_runner,
          pg_catalog.to_regprocedure(required.signature),
          'EXECUTE'
        )
    ) <> 11
  then
    raise exception 'CONCURRENCY_CLEANUP_MANIFEST_MISMATCH';
  end if;
end
$$;

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
declare
  v_job_ids constant uuid[] := array[
    'c9130000-0000-4000-8000-000000000001'::uuid,
    'c9130000-0000-4000-8000-000000000002'::uuid,
    'c9130000-0000-4000-8000-000000000003'::uuid
  ];
  v_payload_ids constant uuid[] := array[
    'c9140000-0000-4000-8000-000000000001'::uuid,
    'c9140000-0000-4000-8000-000000000002'::uuid,
    'c9140000-0000-4000-8000-000000000003'::uuid
  ];
  v_registration_digest text;
begin
  select registration.registration_digest
  into v_registration_digest
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
    'registration.concurrency.20260823.v1';

  if v_registration_digest is null
    or (
      select count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is true
        and shadow_only is true
    ) <> 1
    or exists (
      select 1
      from pg_constraint as constraint_record
      where constraint_record.conrelid =
        'careslink_v1_generation.settings'::regclass
        and constraint_record.conname = 'settings_enabled_check'
    )
    or (select count(*) from careslink_v1_generation.worker_policies) <> 1
    or (
      select count(*)
      from careslink_v1_generation.worker_policies
      where version = 'worker.concurrency.20260823.v1'
    ) <> 1
    or (select count(*) from careslink_v1_generation.provider_policies) <> 5
    or (
      select count(*)
      from careslink_v1_generation.provider_policies
      where policy_version = 'provider.concurrency.20260823.v1'
    ) <> 5
    or (select count(*) from careslink_v1_generation.payload_policies) <> 1
    or (
      select count(*)
      from careslink_v1_generation.payload_policies
      where policy_version = 'payload.concurrency.20260823.v1'
    ) <> 1
    or (select count(*) from careslink_v1_generation.worker_registrations) <> 1
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_provider_policies
    ) <> 5
    or (
      select count(*)
      from careslink_v1_generation.worker_registration_provider_policies
      where registration_digest = v_registration_digest
    ) <> 5
    or (select count(*) from careslink_v1_generation.jobs) <> 3
    or (
      select count(*)
      from careslink_v1_generation.jobs
      where id = any(v_job_ids)
    ) <> 3
    or (select count(*) from careslink_v1_generation.payloads) <> 3
    or (
      select count(*)
      from careslink_v1_generation.payloads
      where id = any(v_payload_ids)
        and job_id = any(v_job_ids)
    ) <> 3
    or (select count(*) from careslink_v1_generation.attempts) <> 3
    or exists (
      select 1
      from careslink_v1_generation.attempts
      where job_id <> all(v_job_ids)
    )
    or (select count(*) from careslink_v1_generation.payload_grants) <> 1
    or exists (
      select 1
      from careslink_v1_generation.payload_grants
      where job_id <> all(v_job_ids)
    )
    or (select count(*) from careslink_v1_generation.provider_evidence) <> 0
    or (select count(*) from careslink_v1_generation.payload_purge_outbox) <> 2
    or exists (
      select 1
      from careslink_v1_generation.payload_purge_outbox
      where job_id <> all(v_job_ids)
    )
  then
    raise exception 'CONCURRENCY_CLEANUP_MANIFEST_MISMATCH';
  end if;

  if (
    select pg_get_constraintdef(constraint_record.oid, true)
    from pg_constraint as constraint_record
    where constraint_record.conrelid =
      'careslink_v1_generation.jobs'::regclass
      and constraint_record.conname = 'jobs_payload_owner_fk'
  ) is distinct from
    'FOREIGN KEY (payload_id, id, owner_user_id) REFERENCES careslink_v1_generation.payloads(id, job_id, owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'
  then
    raise exception 'CONCURRENCY_CLEANUP_JOB_PAYLOAD_FK_DRIFT';
  end if;
end
$$;

delete from careslink_v1_generation.payload_purge_outbox
where job_id = any(array[
  'c9130000-0000-4000-8000-000000000001'::uuid,
  'c9130000-0000-4000-8000-000000000002'::uuid,
  'c9130000-0000-4000-8000-000000000003'::uuid
]);
delete from careslink_v1_generation.provider_evidence
where job_id = any(array[
  'c9130000-0000-4000-8000-000000000001'::uuid,
  'c9130000-0000-4000-8000-000000000002'::uuid,
  'c9130000-0000-4000-8000-000000000003'::uuid
]);
delete from careslink_v1_generation.payload_grants
where job_id = any(array[
  'c9130000-0000-4000-8000-000000000001'::uuid,
  'c9130000-0000-4000-8000-000000000002'::uuid,
  'c9130000-0000-4000-8000-000000000003'::uuid
]);
delete from careslink_v1_generation.attempts
where job_id = any(array[
  'c9130000-0000-4000-8000-000000000001'::uuid,
  'c9130000-0000-4000-8000-000000000002'::uuid,
  'c9130000-0000-4000-8000-000000000003'::uuid
]);

alter table careslink_v1_generation.jobs
  drop constraint jobs_payload_owner_fk;

delete from careslink_v1_generation.payloads
where id = any(array[
  'c9140000-0000-4000-8000-000000000001'::uuid,
  'c9140000-0000-4000-8000-000000000002'::uuid,
  'c9140000-0000-4000-8000-000000000003'::uuid
]);
delete from careslink_v1_generation.jobs
where id = any(array[
  'c9130000-0000-4000-8000-000000000001'::uuid,
  'c9130000-0000-4000-8000-000000000002'::uuid,
  'c9130000-0000-4000-8000-000000000003'::uuid
]);

alter table careslink_v1_generation.jobs
  add constraint jobs_payload_owner_fk
  foreign key (payload_id, id, owner_user_id)
  references careslink_v1_generation.payloads(id, job_id, owner_user_id)
  on delete restrict
  deferrable initially deferred;

delete from careslink_v1_generation.worker_registration_provider_policies
where registration_digest = (
  select registration.registration_digest
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
    'registration.concurrency.20260823.v1'
);
delete from careslink_v1_generation.worker_registrations
where registration_version = 'registration.concurrency.20260823.v1';
delete from careslink_v1_generation.provider_policies
where policy_version = 'provider.concurrency.20260823.v1';
delete from careslink_v1_generation.payload_policies
where policy_version = 'payload.concurrency.20260823.v1';
delete from careslink_v1_generation.worker_policies
where version = 'worker.concurrency.20260823.v1';

update careslink_v1_generation.settings
set enabled = false,
    updated_at = date_trunc('milliseconds', transaction_timestamp())
where capability = 'note_generation_v1';

alter table careslink_v1_generation.settings
  add constraint settings_enabled_check check (enabled = false);

do $$
begin
  if (
    select count(*)
    from careslink_v1_generation.settings
    where capability = 'note_generation_v1'
      and enabled is false
      and shadow_only is true
  ) <> 1
    or (select count(*) from careslink_v1_generation.settings) <> 1
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
    raise exception 'CONCURRENCY_CLEANUP_PRIVATE_ZERO_FAILED';
  end if;
end
$$;

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

do $$
declare
  v_owner_ids constant uuid[] := array[
    'c9100000-0000-4000-8000-000000000001'::uuid,
    'c9100000-0000-4000-8000-000000000002'::uuid,
    'c9100000-0000-4000-8000-000000000003'::uuid
  ];
begin
  if exists (
    select 1 from public.ai_document_mutation_receipts
    where owner_user_id = any(v_owner_ids)
  ) or exists (
    select 1 from public.ai_document_sync_changes
    where owner_user_id = any(v_owner_ids)
  ) or exists (
    select 1 from public.ai_document_revisions
    where owner_user_id = any(v_owner_ids)
  ) or exists (
    select 1 from public.ai_documents
    where owner_user_id = any(v_owner_ids)
  ) then
    raise exception 'CONCURRENCY_CLEANUP_UNEXPECTED_CANONICAL_STATE';
  end if;
end
$$;

delete from public.privacy_reviews
where id = any(array[
  'c9120000-0000-4000-8000-000000000001'::uuid,
  'c9120000-0000-4000-8000-000000000002'::uuid,
  'c9120000-0000-4000-8000-000000000003'::uuid
]);
delete from auth.sessions
where id = any(array[
  'c9110000-0000-4000-8000-000000000001'::uuid,
  'c9110000-0000-4000-8000-000000000002'::uuid,
  'c9110000-0000-4000-8000-000000000003'::uuid
]);
delete from auth.users
where id = any(array[
  'c9100000-0000-4000-8000-000000000001'::uuid,
  'c9100000-0000-4000-8000-000000000002'::uuid,
  'c9100000-0000-4000-8000-000000000003'::uuid
]);

-- Remove every temporary execution edge before dropping the disposable login.
-- The executor receives support-schema USAGE only long enough to drop the six
-- functions it owns; CREATE remains revoked throughout cleanup.
grant usage on schema careslink_v1_generation_concurrency_test_support
  to careslink_v1_generation_executor;
set local role careslink_v1_generation_executor;

revoke execute on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    text, text, text, text, text, text
  )
  from careslink_v1_generation_concurrency_runner;
revoke execute on function
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    uuid, uuid, uuid, text, text
  )
  from careslink_v1_generation_concurrency_runner;
revoke execute on function
  careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
    uuid, uuid, uuid, text, text, uuid
  )
  from careslink_v1_generation_concurrency_runner;

drop function
  careslink_v1_generation_concurrency_test_support.fixture_catalog();
drop function
  careslink_v1_generation_concurrency_test_support.activate_session_fixture();
drop function
  careslink_v1_generation_concurrency_test_support.activate_privacy_fixture();
drop function
  careslink_v1_generation_concurrency_test_support.fixture_state_claim();
drop function
  careslink_v1_generation_concurrency_test_support.fixture_state_session();
drop function
  careslink_v1_generation_concurrency_test_support.fixture_state_privacy();

reset role;

revoke usage on schema careslink_v1_generation_concurrency_test_support
  from careslink_v1_generation_executor;
drop function
  careslink_v1_generation_concurrency_test_support.delete_session_fixture();
drop function
  careslink_v1_generation_concurrency_test_support.revoke_privacy_fixture();
revoke usage on schema careslink_v1_generation_concurrency_test_support
  from careslink_v1_generation_concurrency_runner;
drop schema careslink_v1_generation_concurrency_test_support;

set local role careslink_v1_generation_owner;
revoke usage on schema careslink_v1_generation
  from careslink_v1_generation_concurrency_runner;
reset role;

revoke connect, temporary on database postgres
  from careslink_v1_generation_concurrency_runner;
drop role careslink_v1_generation_concurrency_runner;

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
        from rpc_concurrency_cleanup_membership_baseline
      )
      union all
      (
        select *
        from rpc_concurrency_cleanup_membership_baseline
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
  then
    raise exception 'CONCURRENCY_CLEANUP_ROLE_MEMBERSHIP_RESTORE_FAILED';
  end if;
end
$$;

do $$
declare
  v_schema pg_catalog.oid :=
    'careslink_v1_generation'::pg_catalog.regnamespace;
  v_owner_ids constant pg_catalog.uuid[] := array[
    'c9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'c9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'c9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
  ];
begin
  if current_user <> 'postgres' or session_user <> 'postgres'
    or pg_catalog.to_regrole(
      'careslink_v1_generation_concurrency_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_v1_generation_concurrency_test_support'
    ) is not null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_class as relation
      where relation.relnamespace = v_schema
        and relation.relkind = 'r'
    ) <> 12
    or exists (
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
    )
    or not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid =
        'careslink_v1_generation.settings'::pg_catalog.regclass
        and constraint_record.conname = 'settings_enabled_check'
        and constraint_record.convalidated
    )
    or not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid =
        'careslink_v1_generation.jobs'::pg_catalog.regclass
        and constraint_record.conname = 'jobs_payload_owner_fk'
        and constraint_record.convalidated
    )
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is false
        and shadow_only is true
    ) <> 1
    or (select pg_catalog.count(*) from careslink_v1_generation.settings) <> 1
    or (select pg_catalog.count(*) from careslink_v1_generation.jobs) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.attempts) <> 0
    or (select pg_catalog.count(*) from careslink_v1_generation.payloads) <> 0
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.payload_grants
    ) <> 0
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.provider_evidence
    ) <> 0
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.payload_purge_outbox
    ) <> 0
    or exists (
      select 1
      from auth.users
      where id = any(v_owner_ids)
    )
    or exists (
      select 1
      from auth.sessions
      where id = any(array[
        'c9110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
        'c9110000-0000-4000-8000-000000000002'::pg_catalog.uuid,
        'c9110000-0000-4000-8000-000000000003'::pg_catalog.uuid
      ])
    )
    or exists (
      select 1
      from public.privacy_reviews
      where id = any(array[
        'c9120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
        'c9120000-0000-4000-8000-000000000002'::pg_catalog.uuid,
        'c9120000-0000-4000-8000-000000000003'::pg_catalog.uuid
      ])
    )
    or exists (
      select 1
      from public.ai_documents as document
      where document.owner_user_id = any(v_owner_ids)
    )
    or exists (
      select 1
      from public.ai_document_revisions as revision
      where revision.owner_user_id = any(v_owner_ids)
    )
    or exists (
      select 1
      from public.ai_document_sync_changes as sync_change
      where sync_change.owner_user_id = any(v_owner_ids)
    )
    or exists (
      select 1
      from public.ai_document_mutation_receipts as receipt
      where receipt.owner_user_id = any(v_owner_ids)
    )
  then
    raise exception 'CONCURRENCY_CLEANUP_POSTCHECK_FAILED';
  end if;
end
$$;

commit;
