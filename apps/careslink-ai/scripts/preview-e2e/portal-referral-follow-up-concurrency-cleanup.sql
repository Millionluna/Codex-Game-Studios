-- Exact cleanup for the disposable local Referral Follow-up concurrency gate.
-- Run only after every dedicated runner connection has disconnected.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ssl boolean;
begin
  select ssl
  into v_ssl
  from pg_catalog.pg_stat_ssl
  where pid = pg_catalog.pg_backend_pid();

  if current_user <> 'postgres'
    or current_database() <> 'postgres'
    or pg_catalog.current_setting('server_version_num')::integer < 160000
    or pg_catalog.current_setting('server_version_num')::integer >= 170000
    or pg_catalog.inet_server_addr() is distinct from
      '127.0.0.1'::pg_catalog.inet
    or pg_catalog.inet_server_port() < 49152
    or pg_catalog.inet_server_port() > 65535
    or coalesce(v_ssl, false)
    or pg_catalog.current_setting(
      'careslink.portal_follow_up_concurrency_marker',
      true
    ) is distinct from '2026-08-26.local-pg16.m1c.1'
    or pg_catalog.to_regrole(
      'careslink_portal_follow_up_concurrency_runner'
    ) is null
    or pg_catalog.to_regnamespace(
      'careslink_portal_follow_up_concurrency_test_support'
    ) is null
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_CLEANUP_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_stat_activity
    where usename = 'careslink_portal_follow_up_concurrency_runner'
  ) then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_CLEANUP_ACTIVE_RUNNER';
  end if;
end;
$$;

update public.portal_workflow_flags
set enabled = false,
    updated_at = pg_catalog.clock_timestamp()
where capability in (
  'referral_workflow_v1',
  'referral_intake_v1',
  'referral_source_detail_v1',
  'referral_assignment_v1',
  'referral_provider_response_v1',
  'referral_follow_up_v1'
);

alter table public.portal_referral_followups
  disable trigger portal_followups_append_only;
alter table public.portal_audit_events
  disable trigger portal_audit_append_only;
alter table public.portal_mutation_receipts
  disable trigger portal_receipts_append_only;

delete from public.portal_referral_followups
where referral_id in (
  'e4100000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000002',
  'e4300000-0000-4000-8000-000000000003',
  'e4400000-0000-4000-8000-000000000004',
  'e4500000-0000-4000-8000-000000000005',
  'e4600000-0000-4000-8000-000000000006',
  'e4700000-0000-4000-8000-000000000007',
  'e4800000-0000-4000-8000-000000000008'
);

delete from public.portal_audit_events
where referral_id in (
  'e4100000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000002',
  'e4300000-0000-4000-8000-000000000003',
  'e4400000-0000-4000-8000-000000000004',
  'e4500000-0000-4000-8000-000000000005',
  'e4600000-0000-4000-8000-000000000006',
  'e4700000-0000-4000-8000-000000000007',
  'e4800000-0000-4000-8000-000000000008'
);

delete from public.portal_mutation_receipts
where response_referral_id in (
  'e4100000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000002',
  'e4300000-0000-4000-8000-000000000003',
  'e4400000-0000-4000-8000-000000000004',
  'e4500000-0000-4000-8000-000000000005',
  'e4600000-0000-4000-8000-000000000006',
  'e4700000-0000-4000-8000-000000000007',
  'e4800000-0000-4000-8000-000000000008'
)
  or actor_user_id in (
    'a4100000-0000-4000-8000-000000000001',
    'a4200000-0000-4000-8000-000000000002',
    'a4300000-0000-4000-8000-000000000003'
  );

alter table public.portal_mutation_receipts
  enable trigger portal_receipts_append_only;
alter table public.portal_audit_events
  enable trigger portal_audit_append_only;
alter table public.portal_referral_followups
  enable trigger portal_followups_append_only;

delete from public.portal_referral_matches
where referral_id in (
  'e4100000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000002',
  'e4300000-0000-4000-8000-000000000003',
  'e4400000-0000-4000-8000-000000000004',
  'e4500000-0000-4000-8000-000000000005',
  'e4600000-0000-4000-8000-000000000006',
  'e4700000-0000-4000-8000-000000000007',
  'e4800000-0000-4000-8000-000000000008'
);

delete from careslink_portal_private.portal_referral_contacts
where referral_id in (
  'e4100000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000002',
  'e4300000-0000-4000-8000-000000000003',
  'e4400000-0000-4000-8000-000000000004',
  'e4500000-0000-4000-8000-000000000005',
  'e4600000-0000-4000-8000-000000000006',
  'e4700000-0000-4000-8000-000000000007',
  'e4800000-0000-4000-8000-000000000008'
);

delete from public.portal_referrals
where id in (
  'e4100000-0000-4000-8000-000000000001',
  'e4200000-0000-4000-8000-000000000002',
  'e4300000-0000-4000-8000-000000000003',
  'e4400000-0000-4000-8000-000000000004',
  'e4500000-0000-4000-8000-000000000005',
  'e4600000-0000-4000-8000-000000000006',
  'e4700000-0000-4000-8000-000000000007',
  'e4800000-0000-4000-8000-000000000008'
);

delete from public.portal_providers
where id in (
  'd4100000-0000-4000-8000-000000000001',
  'd4200000-0000-4000-8000-000000000002'
);

delete from public.portal_organization_memberships
where id in (
  'ca410000-0000-4000-8000-000000000001',
  'ca420000-0000-4000-8000-000000000002',
  'ca430000-0000-4000-8000-000000000003'
);

delete from public.portal_organizations
where id in (
  'c4100000-0000-4000-8000-000000000001',
  'c4200000-0000-4000-8000-000000000002',
  'c4300000-0000-4000-8000-000000000003'
);

delete from auth.sessions
where id in (
  'b4100000-0000-4000-8000-000000000001',
  'b4200000-0000-4000-8000-000000000002',
  'b4300000-0000-4000-8000-000000000003'
);

delete from auth.users
where id in (
  'a4100000-0000-4000-8000-000000000001',
  'a4200000-0000-4000-8000-000000000002',
  'a4300000-0000-4000-8000-000000000003',
  'a4400000-0000-4000-8000-000000000004',
  'a4500000-0000-4000-8000-000000000005'
);

drop schema careslink_portal_follow_up_concurrency_test_support cascade;
revoke authenticated
from careslink_portal_follow_up_concurrency_runner;
revoke connect on database postgres
from careslink_portal_follow_up_concurrency_runner;
drop role careslink_portal_follow_up_concurrency_runner;

do $$
declare
  v_table text;
  v_role text;
begin
  if pg_catalog.to_regrole(
      'careslink_portal_follow_up_concurrency_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_portal_follow_up_concurrency_test_support'
    ) is not null
    or exists (
      select 1
      from public.portal_workflow_flags
      where capability in (
        'referral_workflow_v1',
        'referral_intake_v1',
        'referral_source_detail_v1',
        'referral_assignment_v1',
        'referral_provider_response_v1',
        'referral_follow_up_v1'
      )
        and (enabled or not preview_only)
    )
    or exists (
      select 1
      from public.portal_referrals
      where id in (
        'e4100000-0000-4000-8000-000000000001',
        'e4200000-0000-4000-8000-000000000002',
        'e4300000-0000-4000-8000-000000000003',
        'e4400000-0000-4000-8000-000000000004',
        'e4500000-0000-4000-8000-000000000005',
        'e4600000-0000-4000-8000-000000000006',
        'e4700000-0000-4000-8000-000000000007',
        'e4800000-0000-4000-8000-000000000008'
      )
    )
    or exists (
      select 1
      from public.portal_referral_followups
      where referral_id in (
        'e4100000-0000-4000-8000-000000000001',
        'e4200000-0000-4000-8000-000000000002',
        'e4300000-0000-4000-8000-000000000003',
        'e4400000-0000-4000-8000-000000000004',
        'e4500000-0000-4000-8000-000000000005',
        'e4600000-0000-4000-8000-000000000006',
        'e4700000-0000-4000-8000-000000000007',
        'e4800000-0000-4000-8000-000000000008'
      )
    )
    or exists (
      select 1
      from public.portal_audit_events
      where referral_id in (
        'e4100000-0000-4000-8000-000000000001',
        'e4200000-0000-4000-8000-000000000002',
        'e4300000-0000-4000-8000-000000000003',
        'e4400000-0000-4000-8000-000000000004',
        'e4500000-0000-4000-8000-000000000005',
        'e4600000-0000-4000-8000-000000000006',
        'e4700000-0000-4000-8000-000000000007',
        'e4800000-0000-4000-8000-000000000008'
      )
    )
    or exists (
      select 1
      from public.portal_mutation_receipts
      where response_referral_id in (
        'e4100000-0000-4000-8000-000000000001',
        'e4200000-0000-4000-8000-000000000002',
        'e4300000-0000-4000-8000-000000000003',
        'e4400000-0000-4000-8000-000000000004',
        'e4500000-0000-4000-8000-000000000005',
        'e4600000-0000-4000-8000-000000000006',
        'e4700000-0000-4000-8000-000000000007',
        'e4800000-0000-4000-8000-000000000008'
      )
    )
    or exists (
      select 1
      from auth.users
      where id in (
        'a4100000-0000-4000-8000-000000000001',
        'a4200000-0000-4000-8000-000000000002',
        'a4300000-0000-4000-8000-000000000003',
        'a4400000-0000-4000-8000-000000000004',
        'a4500000-0000-4000-8000-000000000005'
      )
    )
    or (
      select count(*)
      from pg_catalog.pg_trigger
      where tgname in (
        'portal_followups_append_only',
        'portal_audit_append_only',
        'portal_receipts_append_only'
      )
        and not tgisinternal
        and tgenabled = 'O'
    ) <> 3
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_CLEANUP_FAILED';
  end if;

  foreach v_role in array array[
    'public', 'anon', 'authenticated', 'service_role'
  ] loop
    foreach v_table in array array[
      'public.portal_workflow_flags',
      'public.portal_organizations',
      'public.portal_organization_memberships',
      'public.portal_providers',
      'public.portal_referrals',
      'careslink_portal_private.portal_referral_contacts',
      'public.portal_referral_matches',
      'public.portal_referral_followups',
      'public.portal_mutation_receipts',
      'public.portal_audit_events'
    ] loop
      if pg_catalog.has_table_privilege(
        v_role,
        v_table,
        'SELECT, INSERT, UPDATE, DELETE'
      )
      then
        raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_TABLE_ACL_DRIFT';
      end if;
    end loop;
  end loop;

  if not pg_catalog.has_function_privilege(
      'authenticated',
      'public.portal_referral_follow_up_record(uuid,bigint,text,text,text,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.portal_referral_follow_up_record(uuid,bigint,text,text,text,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.portal_referral_follow_up_record(uuid,bigint,text,text,text,text)',
      'EXECUTE'
    )
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FUNCTION_ACL_DRIFT';
  end if;
end;
$$;

commit;
