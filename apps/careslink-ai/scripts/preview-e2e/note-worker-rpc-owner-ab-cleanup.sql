-- Exact TEST_ONLY cleanup for note-worker-rpc-owner-ab-setup.sql. Run only
-- after the passwordless local runner has disconnected and every live owner
-- isolation assertion has passed. Any mismatch rolls back the whole cleanup.

begin;

do $$
declare
  v_runner pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_generation_owner_ab_runner'
  );
  v_support_schema pg_catalog.oid := pg_catalog.to_regnamespace(
    'careslink_v1_generation_owner_ab_test_support'
  );
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
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4
      not between 160000 and 169999
  then
    raise exception 'OWNER_AB_CLEANUP_MANAGEMENT_ROLE_UNSAFE';
  end if;

  if v_runner is null
    or v_support_schema is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runner
        and not role_record.rolcanlogin
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
    or (
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
        and pg_catalog.has_function_privilege(
          v_runner, procedure.oid, 'EXECUTE'
        )
    ) <> 8
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
    raise exception 'OWNER_AB_CLEANUP_TEST_SURFACE_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_stat_activity as activity
    where activity.usename =
      'careslink_v1_generation_owner_ab_runner'
      and activity.backend_type = 'client backend'
  ) then
    raise exception 'OWNER_AB_CLEANUP_ACTIVE_RUNNER_SESSION';
  end if;
end
$$;

create temporary table rpc_owner_ab_cleanup_membership_baseline
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
    from rpc_owner_ab_cleanup_membership_baseline as membership
    where membership.grantor = 'postgres'::pg_catalog.regrole
  ) then
    raise exception 'OWNER_AB_CLEANUP_ROLE_MEMBERSHIP_UNSAFE';
  end if;
end
$$;

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
alter table careslink_v1_generation.payload_grants no force row level security;
alter table careslink_v1_generation.provider_evidence
  no force row level security;
alter table careslink_v1_generation.payload_purge_outbox
  no force row level security;

reset role;

do $$
declare
  v_owner_ids constant pg_catalog.uuid[] := array[
    'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
  ];
  v_job_ids constant pg_catalog.uuid[] := array[
    'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
  ];
  v_payload_ids constant pg_catalog.uuid[] := array[
    'd9140000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd9140000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'd9140000-0000-4000-8000-000000000003'::pg_catalog.uuid
  ];
  v_registration_digest pg_catalog.text;
begin
  select registration.registration_digest
  into v_registration_digest
  from careslink_v1_generation.worker_registrations as registration
  where registration.registration_version =
    'registration.owner-ab.20260824.v1';

  if v_registration_digest is null
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is true
        and shadow_only is true
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid =
        'careslink_v1_generation.settings'::pg_catalog.regclass
        and constraint_record.conname = 'settings_enabled_check'
    )
    or (select pg_catalog.count(*) from careslink_v1_generation.worker_policies) <> 1
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.worker_policies
      where version = 'worker.owner-ab.20260824.v1'
    ) <> 1
    or (select pg_catalog.count(*) from careslink_v1_generation.provider_policies) <> 5
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.provider_policies
      where policy_version = 'provider.owner-ab.20260824.v1'
    ) <> 5
    or (select pg_catalog.count(*) from careslink_v1_generation.payload_policies) <> 1
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.payload_policies
      where policy_version = 'payload.owner-ab.20260824.v1'
    ) <> 1
    or (select pg_catalog.count(*) from careslink_v1_generation.worker_registrations) <> 1
    or (select pg_catalog.count(*) from careslink_v1_generation.worker_registration_provider_policies) <> 5
    or (select pg_catalog.count(*) from careslink_v1_generation.jobs) <> 3
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.jobs
      where id = any(v_job_ids)
    ) <> 3
    or (select pg_catalog.count(*) from careslink_v1_generation.payloads) <> 3
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.payloads
      where id = any(v_payload_ids)
        and job_id = any(v_job_ids)
    ) <> 3
    or (select pg_catalog.count(*) from careslink_v1_generation.attempts) <> 3
    or exists (
      select 1
      from careslink_v1_generation.attempts
      where job_id <> all(v_job_ids)
    )
    or (select pg_catalog.count(*) from careslink_v1_generation.payload_grants) <> 3
    or exists (
      select 1
      from careslink_v1_generation.payload_grants
      where job_id <> all(v_job_ids)
    )
    or (select pg_catalog.count(*) from careslink_v1_generation.provider_evidence) <> 2
    or exists (
      select 1
      from careslink_v1_generation.provider_evidence
      where job_id not in (
        'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
        'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid
      )
    )
    or (select pg_catalog.count(*) from careslink_v1_generation.payload_purge_outbox) <> 3
    or exists (
      select 1
      from careslink_v1_generation.payload_purge_outbox
      where job_id <> all(v_job_ids)
    )
  then
    raise exception 'OWNER_AB_CLEANUP_PRIVATE_MANIFEST_MISMATCH';
  end if;

  if (
      select pg_catalog.count(*)
      from careslink_v1_generation.jobs as job
      join careslink_v1_generation.attempts as attempt
        on attempt.job_id = job.id
       and attempt.owner_user_id = job.owner_user_id
      join careslink_v1_generation.payloads as payload
        on payload.id = job.payload_id
       and payload.job_id = job.id
       and payload.owner_user_id = job.owner_user_id
      join careslink_v1_generation.payload_grants as grant_record
        on grant_record.job_id = job.id
       and grant_record.payload_id = payload.id
       and grant_record.attempt_id = attempt.id
       and grant_record.owner_user_id = job.owner_user_id
      where job.id in (
          'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid
        )
        and job.owner_user_id in (
          'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
          'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid
        )
        and job.status = 'SUCCEEDED'
        and job.failure_reason is null
        and attempt.status = 'SUCCEEDED'
        and attempt.failure_reason is null
        and payload.state = 'REVOKED'
        and payload.revoke_reason = 'SUCCEEDED'
        and grant_record.status = 'CONSUMED'
        and grant_record.consumed_at is not null
        and grant_record.revoked_at is null
        and grant_record.vault_grant_hash = case job.id
          when 'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid
            then pg_catalog.repeat('a', 64)
          else pg_catalog.repeat('b', 64)
        end
    ) <> 2
  then
    raise exception 'OWNER_AB_CLEANUP_SUCCESS_STATE_MISMATCH';
  end if;

  if (
      select pg_catalog.count(*)
      from careslink_v1_generation.jobs as job
      join careslink_v1_generation.attempts as attempt
        on attempt.job_id = job.id
       and attempt.owner_user_id = job.owner_user_id
      join careslink_v1_generation.payloads as payload
        on payload.id = job.payload_id
       and payload.job_id = job.id
       and payload.owner_user_id = job.owner_user_id
      join careslink_v1_generation.payload_grants as grant_record
        on grant_record.job_id = job.id
       and grant_record.payload_id = payload.id
       and grant_record.attempt_id = attempt.id
       and grant_record.owner_user_id = job.owner_user_id
      where job.id =
          'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
        and job.owner_user_id =
          'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
        and job.status = 'FAILED'
        and job.failure_reason in (
          'PRIVACY_REVIEW_STALE', 'PAYLOAD_UNAVAILABLE'
        )
        and attempt.status = 'FAILED'
        and attempt.failure_reason = job.failure_reason
        and payload.state = 'REVOKED'
        and payload.revoke_reason = 'FAILED'
        and grant_record.status = 'REVOKED'
        and grant_record.consumed_at is null
        and grant_record.revoked_at is not null
        and grant_record.vault_grant_hash is null
    ) <> 1
  then
    raise exception 'OWNER_AB_CLEANUP_PRIVACY_DENIAL_STATE_MISMATCH';
  end if;

  if (
      select pg_catalog.count(*)
      from auth.users as active_user
      where active_user.id = any(v_owner_ids)
        and active_user.email like 'worker-rpc-owner-ab-%@example.invalid'
    ) <> 3
    or (
      select pg_catalog.count(*)
      from auth.sessions as active_session
      where active_session.id in (
        'd9110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
        'd9110000-0000-4000-8000-000000000002'::pg_catalog.uuid,
        'd9110000-0000-4000-8000-000000000003'::pg_catalog.uuid
      )
        and active_session.user_id = any(v_owner_ids)
    ) <> 3
    or (
      select pg_catalog.count(*)
      from public.privacy_reviews as review
      where review.id in (
        'd9120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
        'd9120000-0000-4000-8000-000000000002'::pg_catalog.uuid,
        'd9120000-0000-4000-8000-000000000003'::pg_catalog.uuid
      )
        and review.owner_user_id = any(v_owner_ids)
        and review.status = case review.owner_user_id
          when 'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
            then 'REVOKED'
          else 'CONFIRMED'
        end
    ) <> 3
  then
    raise exception 'OWNER_AB_CLEANUP_ADMISSION_MANIFEST_MISMATCH';
  end if;

  if (
      select pg_catalog.count(*)
      from public.ai_documents
      where owner_user_id = any(v_owner_ids)
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.ai_document_revisions
      where owner_user_id = any(v_owner_ids)
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.ai_document_sync_changes
      where owner_user_id = any(v_owner_ids)
    ) <> 2
    or (
      select pg_catalog.count(*)
      from public.ai_document_mutation_receipts
      where owner_user_id = any(v_owner_ids)
    ) <> 2
    or exists (
      select 1 from public.ai_documents
      where owner_user_id =
        'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    )
  then
    raise exception 'OWNER_AB_CLEANUP_CANONICAL_MANIFEST_MISMATCH';
  end if;

  if (
    select pg_catalog.pg_get_constraintdef(
      constraint_record.oid, true
    )
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
      'careslink_v1_generation.jobs'::pg_catalog.regclass
      and constraint_record.conname = 'jobs_payload_owner_fk'
  ) is distinct from
    'FOREIGN KEY (payload_id, id, owner_user_id) REFERENCES careslink_v1_generation.payloads(id, job_id, owner_user_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED'
  then
    raise exception 'OWNER_AB_CLEANUP_JOB_PAYLOAD_FK_DRIFT';
  end if;
end
$$;

set local role careslink_v1_generation_owner;

delete from careslink_v1_generation.payload_purge_outbox
where job_id in (
  'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
);
delete from careslink_v1_generation.provider_evidence
where job_id in (
  'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
);
delete from careslink_v1_generation.payload_grants
where job_id in (
  'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
);
delete from careslink_v1_generation.attempts
where job_id in (
  'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
);

alter table careslink_v1_generation.jobs
  drop constraint jobs_payload_owner_fk;

delete from careslink_v1_generation.payloads
where id in (
  'd9140000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9140000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9140000-0000-4000-8000-000000000003'::pg_catalog.uuid
);
delete from careslink_v1_generation.jobs
where id in (
  'd9130000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9130000-0000-4000-8000-000000000003'::pg_catalog.uuid
);

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
    'registration.owner-ab.20260824.v1'
);
delete from careslink_v1_generation.worker_registrations
where registration_version = 'registration.owner-ab.20260824.v1';
delete from careslink_v1_generation.provider_policies
where policy_version = 'provider.owner-ab.20260824.v1';
delete from careslink_v1_generation.payload_policies
where policy_version = 'payload.owner-ab.20260824.v1';
delete from careslink_v1_generation.worker_policies
where version = 'worker.owner-ab.20260824.v1';

update careslink_v1_generation.settings
set enabled = false,
    updated_at = pg_catalog.date_trunc(
      'milliseconds', pg_catalog.transaction_timestamp()
    )
where capability = 'note_generation_v1';
alter table careslink_v1_generation.settings
  add constraint settings_enabled_check check (enabled = false);

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
    raise exception 'OWNER_AB_CLEANUP_PRIVATE_ZERO_FAILED';
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

delete from public.ai_document_mutation_receipts
where owner_user_id in (
  'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
);
delete from public.ai_document_sync_changes
where owner_user_id in (
  'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
);

do $$
declare
  v_row_count pg_catalog.int8;
begin
  delete from public.ai_documents as document
  where document.owner_user_id in (
      'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
      'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    );

  get diagnostics v_row_count = row_count;
  if v_row_count <> 2 then
    raise exception 'OWNER_AB_CLEANUP_CANONICAL_DELETE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.ai_document_revisions as revision
    where revision.owner_user_id in (
      'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
      'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
    )
  ) then
    raise exception 'OWNER_AB_CLEANUP_CANONICAL_CASCADE_MISMATCH';
  end if;
end
$$;

delete from public.privacy_reviews
where id in (
  'd9120000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9120000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9120000-0000-4000-8000-000000000003'::pg_catalog.uuid
);
delete from auth.sessions
where id in (
  'd9110000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9110000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9110000-0000-4000-8000-000000000003'::pg_catalog.uuid
);
delete from auth.users
where id in (
  'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
  'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
  'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
);

grant usage on schema careslink_v1_generation_owner_ab_test_support
  to careslink_v1_generation_executor;
set local role careslink_v1_generation_executor;

revoke execute on function
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
  from careslink_v1_generation_owner_ab_runner;

drop function
  careslink_v1_generation_owner_ab_test_support.fixture_catalog(),
  careslink_v1_generation_owner_ab_test_support.activate_owner_a_fixture(),
  careslink_v1_generation_owner_ab_test_support.activate_owner_b_fixture(),
  careslink_v1_generation_owner_ab_test_support.activate_privacy_denied_fixture(),
  careslink_v1_generation_owner_ab_test_support.consume_owner_a_grant_test_only(),
  careslink_v1_generation_owner_ab_test_support.consume_owner_b_grant_test_only(),
  careslink_v1_generation_owner_ab_test_support.fixture_state();

reset role;

revoke usage on schema careslink_v1_generation_owner_ab_test_support
  from careslink_v1_generation_executor;
drop function
  careslink_v1_generation_owner_ab_test_support.revoke_privacy_denied_fixture();

revoke usage on schema careslink_v1_generation_owner_ab_test_support
  from careslink_v1_generation_owner_ab_runner;
drop schema careslink_v1_generation_owner_ab_test_support;

set local role careslink_v1_generation_owner;
revoke usage on schema careslink_v1_generation
  from careslink_v1_generation_owner_ab_runner;
reset role;

revoke connect, temporary on database postgres
  from careslink_v1_generation_owner_ab_runner;
drop role careslink_v1_generation_owner_ab_runner;
grant temporary on database postgres to public;

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
      from rpc_owner_ab_cleanup_membership_baseline
    )
    union all
    (
      select *
      from rpc_owner_ab_cleanup_membership_baseline
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
  ) then
    raise exception 'OWNER_AB_CLEANUP_ROLE_MEMBERSHIP_RESTORE_FAILED';
  end if;
end
$$;

do $$
declare
  v_owner_ids constant pg_catalog.uuid[] := array[
    'd9100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
    'd9100000-0000-4000-8000-000000000002'::pg_catalog.uuid,
    'd9100000-0000-4000-8000-000000000003'::pg_catalog.uuid
  ];
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
  v_tables pg_catalog.text[];
begin
  select pg_catalog.array_agg(
    relation.relname::pg_catalog.text order by relation.relname
  )
  into v_tables
  from pg_catalog.pg_class as relation
  where relation.relnamespace =
      'careslink_v1_generation'::pg_catalog.regnamespace
    and relation.relkind = 'r';

  if pg_catalog.to_regrole(
      'careslink_v1_generation_owner_ab_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_v1_generation_owner_ab_test_support'
    ) is not null
    or v_tables is distinct from array[
      'attempts', 'jobs', 'payload_grants', 'payload_policies',
      'payload_purge_outbox', 'payloads', 'provider_evidence',
      'provider_policies', 'settings', 'worker_policies',
      'worker_registration_provider_policies', 'worker_registrations'
    ]::pg_catalog.text[]
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      where relation.relnamespace =
          'careslink_v1_generation'::pg_catalog.regnamespace
        and relation.relkind = 'r'
        and (
          not relation.relrowsecurity
          or not relation.relforcerowsecurity
          or relation.relowner <>
            'careslink_v1_generation_owner'::pg_catalog.regrole
        )
    )
    or (select pg_catalog.count(*) from careslink_v1_generation.settings) <> 1
    or (
      select pg_catalog.count(*)
      from careslink_v1_generation.settings
      where capability = 'note_generation_v1'
        and enabled is false
        and shadow_only is true
    ) <> 1
    or (
      select pg_catalog.pg_get_constraintdef(
        constraint_record.oid, true
      )
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid =
        'careslink_v1_generation.settings'::pg_catalog.regclass
        and constraint_record.conname = 'settings_enabled_check'
    ) is distinct from 'CHECK (enabled = false)'
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
    or exists (
      select 1 from auth.users where id = any(v_owner_ids)
    )
    or exists (
      select 1 from auth.sessions where user_id = any(v_owner_ids)
    )
    or exists (
      select 1 from public.privacy_reviews
      where owner_user_id = any(v_owner_ids)
    )
    or exists (
      select 1 from public.ai_documents
      where owner_user_id = any(v_owner_ids)
    )
    or exists (
      select 1 from public.ai_document_revisions
      where owner_user_id = any(v_owner_ids)
    )
    or exists (
      select 1 from public.ai_document_sync_changes
      where owner_user_id = any(v_owner_ids)
    )
    or exists (
      select 1 from public.ai_document_mutation_receipts
      where owner_user_id = any(v_owner_ids)
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure
      where procedure.oid = any(v_rpc_oids)
        and procedure.proowner =
          'careslink_v1_generation_executor'::pg_catalog.regrole
        and procedure.prosecdef
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
    or not exists (
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
    )
  then
    raise exception 'OWNER_AB_CLEANUP_POSTCHECK_FAILED';
  end if;
end
$$;

commit;
