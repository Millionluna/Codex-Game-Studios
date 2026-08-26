-- Exact cleanup for the disposable local Provider Response concurrency gate.
-- Run only after every runner connection has disconnected.

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
      'careslink.portal_response_concurrency_marker',
      true
    ) is distinct from '2026-08-26.local-pg16.1'
    or pg_catalog.to_regrole(
      'careslink_portal_response_concurrency_runner'
    ) is null
    or pg_catalog.to_regnamespace(
      'careslink_portal_response_concurrency_test_support'
    ) is null
  then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_CLEANUP_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_stat_activity
    where usename = 'careslink_portal_response_concurrency_runner'
  ) then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_CLEANUP_ACTIVE_RUNNER';
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
  'referral_provider_response_v1'
);

alter table public.portal_audit_events
  disable trigger portal_audit_append_only;
alter table public.portal_mutation_receipts
  disable trigger portal_receipts_append_only;

delete from public.portal_audit_events
where referral_id = 'e3100000-0000-4000-8000-000000000001';

delete from public.portal_mutation_receipts
where response_referral_id = 'e3100000-0000-4000-8000-000000000001'
  or actor_user_id in (
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000002'
  );

alter table public.portal_mutation_receipts
  enable trigger portal_receipts_append_only;
alter table public.portal_audit_events
  enable trigger portal_audit_append_only;

delete from public.portal_referral_matches
where id in (
  'f3100000-0000-4000-8000-000000000001',
  'f3200000-0000-4000-8000-000000000002'
);

delete from public.portal_referrals
where id = 'e3100000-0000-4000-8000-000000000001';

delete from public.portal_providers
where id in (
  'd3100000-0000-4000-8000-000000000001',
  'd3200000-0000-4000-8000-000000000002'
);

delete from public.portal_organization_memberships
where id in (
  'ca100000-0000-4000-8000-000000000001',
  'ca200000-0000-4000-8000-000000000002',
  'ca300000-0000-4000-8000-000000000003'
);

delete from public.portal_organizations
where id in (
  'c3100000-0000-4000-8000-000000000001',
  'c3200000-0000-4000-8000-000000000002',
  'c3300000-0000-4000-8000-000000000003',
  'c3400000-0000-4000-8000-000000000004'
);

delete from auth.sessions
where id in (
  'b3100000-0000-4000-8000-000000000001',
  'b3200000-0000-4000-8000-000000000002'
);

delete from auth.users
where id in (
  'a3100000-0000-4000-8000-000000000001',
  'a3200000-0000-4000-8000-000000000002',
  'a3300000-0000-4000-8000-000000000003',
  'a3400000-0000-4000-8000-000000000004'
);

drop schema careslink_portal_response_concurrency_test_support cascade;
revoke authenticated
from careslink_portal_response_concurrency_runner;
revoke connect on database postgres
from careslink_portal_response_concurrency_runner;
drop role careslink_portal_response_concurrency_runner;

do $$
begin
  if pg_catalog.to_regrole(
      'careslink_portal_response_concurrency_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_portal_response_concurrency_test_support'
    ) is not null
    or exists (
      select 1
      from public.portal_workflow_flags
      where capability in (
        'referral_workflow_v1',
        'referral_intake_v1',
        'referral_source_detail_v1',
        'referral_assignment_v1',
        'referral_provider_response_v1'
      )
        and enabled
    )
    or exists (
      select 1
      from public.portal_referrals
      where id = 'e3100000-0000-4000-8000-000000000001'
    )
    or exists (
      select 1
      from auth.users
      where id in (
        'a3100000-0000-4000-8000-000000000001',
        'a3200000-0000-4000-8000-000000000002',
        'a3300000-0000-4000-8000-000000000003',
        'a3400000-0000-4000-8000-000000000004'
      )
    )
  then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_CLEANUP_FAILED';
  end if;
end;
$$;

commit;
