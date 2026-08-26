-- TEST_ONLY support boundary for true multi-backend Portal Provider Response
-- races. Apply only after the exact seven-migration local PG16 chain.

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
    or current_setting('is_superuser') <> 'on'
  then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_SETUP_UNSAFE';
  end if;

  if pg_catalog.to_regrole(
      'careslink_portal_response_concurrency_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_portal_response_concurrency_test_support'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.portal_referral_provider_response_respond(uuid,bigint,text,text,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.portal_referral_assignment_offer(uuid,uuid,bigint,text,text,text)'
    ) is null
    or (
      select count(*)
      from public.portal_workflow_flags
      where capability in (
        'referral_workflow_v1',
        'referral_intake_v1',
        'referral_source_detail_v1',
        'referral_assignment_v1',
        'referral_provider_response_v1'
      )
    ) <> 5
  then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_SETUP_SCHEMA_DRIFT';
  end if;
end;
$$;

create role careslink_portal_response_concurrency_runner
  login
  inherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

grant authenticated to careslink_portal_response_concurrency_runner;
grant connect on database postgres
to careslink_portal_response_concurrency_runner;

create schema careslink_portal_response_concurrency_test_support
authorization postgres;

revoke all on schema careslink_portal_response_concurrency_test_support
from public, anon, authenticated, service_role;

grant usage on schema careslink_portal_response_concurrency_test_support
to careslink_portal_response_concurrency_runner;

create function
careslink_portal_response_concurrency_test_support._assert_runner()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_application_name text := pg_catalog.current_setting(
    'application_name',
    true
  );
begin
  if session_user <> 'careslink_portal_response_concurrency_runner'
    or v_application_name !~ '^careslink-portal-response-race-(replay|competition|session|provider|flag|offer-response)-(a|b|control|observer)$'
    or pg_catalog.inet_server_addr() is distinct from
      '127.0.0.1'::pg_catalog.inet
    or pg_catalog.inet_server_port() < 49152
    or pg_catalog.inet_server_port() > 65535
    or pg_catalog.current_setting('server_version_num')::integer < 160000
    or pg_catalog.current_setting('server_version_num')::integer >= 170000
    or pg_catalog.current_setting(
      'careslink.portal_response_concurrency_marker',
      true
    ) is distinct from '2026-08-26.local-pg16.1'
  then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_RUNNER_UNSAFE';
  end if;
end;
$$;

create function
careslink_portal_response_concurrency_test_support.cleanup_fixture()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'careslink.portal-response-concurrency.fixture-management',
      0
    )
  );

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
  where response_referral_id =
    'e3100000-0000-4000-8000-000000000001'
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
end;
$$;

create function
careslink_portal_response_concurrency_test_support.reset_fixture(
  p_case text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_response_accept_hash text;
  v_response_decline_hash text;
  v_assignment_offer_hash text;
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();

  if p_case not in (
    'replay',
    'competition',
    'session',
    'provider',
    'flag',
    'offer-response'
  ) then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_FIXTURE_INVALID';
  end if;

  perform
    careslink_portal_response_concurrency_test_support.cleanup_fixture();

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
    is_anonymous,
    created_at,
    updated_at
  ) values
    (
      'a3100000-0000-4000-8000-000000000001',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'concurrency-provider-a@example.invalid',
      'test-only-no-login',
      pg_catalog.clock_timestamp(),
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    ),
    (
      'a3200000-0000-4000-8000-000000000002',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'concurrency-operator@example.invalid',
      'test-only-no-login',
      pg_catalog.clock_timestamp(),
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    ),
    (
      'a3300000-0000-4000-8000-000000000003',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'concurrency-source@example.invalid',
      'test-only-no-login',
      pg_catalog.clock_timestamp(),
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    ),
    (
      'a3400000-0000-4000-8000-000000000004',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'concurrency-provider-b@example.invalid',
      'test-only-no-login',
      pg_catalog.clock_timestamp(),
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    );

  insert into auth.sessions (
    id,
    user_id,
    created_at,
    updated_at,
    not_after
  ) values
    (
      'b3100000-0000-4000-8000-000000000001',
      'a3100000-0000-4000-8000-000000000001',
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp(),
      null
    ),
    (
      'b3200000-0000-4000-8000-000000000002',
      'a3200000-0000-4000-8000-000000000002',
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp(),
      null
    );

  insert into public.portal_organizations (
    id,
    organization_type,
    display_name,
    status
  ) values
    (
      'c3100000-0000-4000-8000-000000000001',
      'REFERRAL_SOURCE',
      'Concurrency Source',
      'ACTIVE'
    ),
    (
      'c3200000-0000-4000-8000-000000000002',
      'PROVIDER',
      'Concurrency Provider A',
      'ACTIVE'
    ),
    (
      'c3300000-0000-4000-8000-000000000003',
      'PROVIDER',
      'Concurrency Provider B',
      'ACTIVE'
    ),
    (
      'c3400000-0000-4000-8000-000000000004',
      'PLATFORM',
      'Concurrency Platform',
      'ACTIVE'
    );

  insert into public.portal_organization_memberships (
    id,
    organization_id,
    user_id,
    role,
    status
  ) values
    (
      'ca100000-0000-4000-8000-000000000001',
      'c3200000-0000-4000-8000-000000000002',
      'a3100000-0000-4000-8000-000000000001',
      'provider_member',
      'ACTIVE'
    ),
    (
      'ca200000-0000-4000-8000-000000000002',
      'c3300000-0000-4000-8000-000000000003',
      'a3400000-0000-4000-8000-000000000004',
      'provider_member',
      'ACTIVE'
    ),
    (
      'ca300000-0000-4000-8000-000000000003',
      'c3400000-0000-4000-8000-000000000004',
      'a3200000-0000-4000-8000-000000000002',
      'platform_admin',
      'ACTIVE'
    );

  insert into public.portal_providers (
    id,
    organization_id,
    review_status,
    service_types,
    regions,
    languages,
    funding_types,
    capacity_status
  ) values
    (
      'd3100000-0000-4000-8000-000000000001',
      'c3200000-0000-4000-8000-000000000002',
      'APPROVED',
      array['SUPPORT_COORDINATION'],
      array['VIC_MELBOURNE'],
      array['en'],
      array[]::text[],
      'AVAILABLE'
    ),
    (
      'd3200000-0000-4000-8000-000000000002',
      'c3300000-0000-4000-8000-000000000003',
      'APPROVED',
      array['SUPPORT_COORDINATION'],
      array['VIC_MELBOURNE'],
      array['en'],
      array[]::text[],
      'AVAILABLE'
    );

  insert into public.portal_referrals (
    id,
    source_organization_id,
    source_user_id,
    summary,
    region,
    service_type,
    current_status,
    assigned_provider_id,
    row_version,
    created_at,
    updated_at
  ) values (
    'e3100000-0000-4000-8000-000000000001',
    'c3100000-0000-4000-8000-000000000001',
    'a3300000-0000-4000-8000-000000000003',
    'Concurrency fixture metadata only',
    'VIC_MELBOURNE',
    'SUPPORT_COORDINATION',
    'OFFERED',
    null,
    3,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

  insert into public.portal_referral_matches (
    id,
    referral_id,
    provider_id,
    status,
    offered_by,
    offered_at,
    responded_by,
    responded_at,
    row_version,
    created_at,
    updated_at
  ) values
    (
      'f3100000-0000-4000-8000-000000000001',
      'e3100000-0000-4000-8000-000000000001',
      'd3100000-0000-4000-8000-000000000001',
      'OFFERED',
      'a3200000-0000-4000-8000-000000000002',
      pg_catalog.clock_timestamp(),
      null,
      null,
      1,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    ),
    (
      'f3200000-0000-4000-8000-000000000002',
      'e3100000-0000-4000-8000-000000000001',
      'd3200000-0000-4000-8000-000000000002',
      'CANDIDATE',
      null,
      null,
      null,
      null,
      1,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    );

  update public.portal_workflow_flags
  set enabled = true,
      updated_at = pg_catalog.clock_timestamp()
  where capability in (
    'referral_workflow_v1',
    'referral_intake_v1',
    'referral_source_detail_v1',
    'referral_assignment_v1',
    'referral_provider_response_v1'
  );

  v_response_accept_hash := public.v1_shadow_content_sha256(
    jsonb_build_object(
      'actor',
      jsonb_build_object(
        'organizationId',
        'c3200000-0000-4000-8000-000000000002',
        'role',
        'provider_member',
        'providerId',
        'd3100000-0000-4000-8000-000000000001'
      ),
      'kind',
      'RESPOND_TO_OFFER',
      'command',
      jsonb_build_object(
        'matchId',
        'f3100000-0000-4000-8000-000000000001',
        'expectedVersion',
        3,
        'decision',
        'ACCEPT'
      )
    )
  );

  v_response_decline_hash := public.v1_shadow_content_sha256(
    jsonb_build_object(
      'actor',
      jsonb_build_object(
        'organizationId',
        'c3200000-0000-4000-8000-000000000002',
        'role',
        'provider_member',
        'providerId',
        'd3100000-0000-4000-8000-000000000001'
      ),
      'kind',
      'RESPOND_TO_OFFER',
      'command',
      jsonb_build_object(
        'matchId',
        'f3100000-0000-4000-8000-000000000001',
        'expectedVersion',
        3,
        'decision',
        'DECLINE'
      )
    )
  );

  v_assignment_offer_hash := public.v1_shadow_content_sha256(
    jsonb_build_object(
      'actor',
      jsonb_build_object(
        'organizationId',
        'c3400000-0000-4000-8000-000000000004',
        'role',
        'platform_admin',
        'providerId',
        null
      ),
      'kind',
      'OFFER_REFERRAL',
      'command',
      jsonb_build_object(
        'referralId',
        'e3100000-0000-4000-8000-000000000001',
        'providerId',
        'd3200000-0000-4000-8000-000000000002',
        'expectedVersion',
        4
      )
    )
  );

  return jsonb_build_object(
    'case', p_case,
    'provider_user_id', 'a3100000-0000-4000-8000-000000000001',
    'provider_session_id', 'b3100000-0000-4000-8000-000000000001',
    'operator_user_id', 'a3200000-0000-4000-8000-000000000002',
    'operator_session_id', 'b3200000-0000-4000-8000-000000000002',
    'referral_id', 'e3100000-0000-4000-8000-000000000001',
    'match_a_id', 'f3100000-0000-4000-8000-000000000001',
    'match_b_id', 'f3200000-0000-4000-8000-000000000002',
    'provider_b_id', 'd3200000-0000-4000-8000-000000000002',
    'response_accept_hash', v_response_accept_hash,
    'response_decline_hash', v_response_decline_hash,
    'assignment_offer_hash', v_assignment_offer_hash
  );
end;
$$;

create function
careslink_portal_response_concurrency_test_support.lock_mutation(
  p_mutation_id_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();
  if p_mutation_id_hash is null
    or p_mutation_id_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_MUTATION_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'a3100000-0000-4000-8000-000000000001:' ||
        p_mutation_id_hash,
      0
    )
  );
end;
$$;

create function
careslink_portal_response_concurrency_test_support.lock_referral()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();
  perform 1
  from public.portal_referrals
  where id = 'e3100000-0000-4000-8000-000000000001'
  for update;
  if not found then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_FIXTURE_MISSING';
  end if;
end;
$$;

create function
careslink_portal_response_concurrency_test_support.lock_response_flag()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();
  perform 1
  from public.portal_workflow_flags
  where capability = 'referral_provider_response_v1'
  for update;
  if not found then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_FLAG_MISSING';
  end if;
end;
$$;

create function
careslink_portal_response_concurrency_test_support.revoke_session()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();
  delete from auth.sessions
  where id = 'b3100000-0000-4000-8000-000000000001';
  if not found then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_SESSION_MISSING';
  end if;
end;
$$;

create function
careslink_portal_response_concurrency_test_support.revoke_provider()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();
  update public.portal_providers
  set review_status = 'SUSPENDED',
      updated_at = pg_catalog.clock_timestamp()
  where id = 'd3100000-0000-4000-8000-000000000001';
  if not found then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_PROVIDER_MISSING';
  end if;
end;
$$;

create function
careslink_portal_response_concurrency_test_support.disable_response_flag()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();
  update public.portal_workflow_flags
  set enabled = false,
      updated_at = pg_catalog.clock_timestamp()
  where capability = 'referral_provider_response_v1';
  if not found then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_FLAG_MISSING';
  end if;
end;
$$;

create function
careslink_portal_response_concurrency_test_support.blocked_count(
  p_backend_pids integer[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();
  if p_backend_pids is null
    or pg_catalog.cardinality(p_backend_pids) < 1
    or pg_catalog.cardinality(p_backend_pids) > 4
    or exists (
      select 1
      from pg_catalog.unnest(p_backend_pids) as pid
      where pid is null or pid <= 0
    )
  then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_BACKEND_SET_INVALID';
  end if;

  select count(*)::integer
  into v_count
  from pg_catalog.pg_stat_activity as activity
  where activity.pid = any(p_backend_pids)
    and activity.wait_event_type = 'Lock'
    and pg_catalog.cardinality(
      pg_catalog.pg_blocking_pids(activity.pid)
    ) > 0;

  return v_count;
end;
$$;

create function
careslink_portal_response_concurrency_test_support.fixture_state()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_response_concurrency_test_support._assert_runner();

  return jsonb_build_object(
    'referral_status',
    (
      select current_status
      from public.portal_referrals
      where id = 'e3100000-0000-4000-8000-000000000001'
    ),
    'referral_version',
    (
      select row_version
      from public.portal_referrals
      where id = 'e3100000-0000-4000-8000-000000000001'
    ),
    'assigned_provider_id',
    (
      select assigned_provider_id
      from public.portal_referrals
      where id = 'e3100000-0000-4000-8000-000000000001'
    ),
    'match_a_status',
    (
      select status
      from public.portal_referral_matches
      where id = 'f3100000-0000-4000-8000-000000000001'
    ),
    'match_b_status',
    (
      select status
      from public.portal_referral_matches
      where id = 'f3200000-0000-4000-8000-000000000002'
    ),
    'audit_count',
    (
      select count(*)
      from public.portal_audit_events
      where referral_id = 'e3100000-0000-4000-8000-000000000001'
    ),
    'receipt_count',
    (
      select count(*)
      from public.portal_mutation_receipts
      where response_referral_id =
        'e3100000-0000-4000-8000-000000000001'
    ),
    'response_audit_count',
    (
      select count(*)
      from public.portal_audit_events
      where referral_id = 'e3100000-0000-4000-8000-000000000001'
        and mutation_kind = 'RESPOND_TO_OFFER'
    ),
    'offer_audit_count',
    (
      select count(*)
      from public.portal_audit_events
      where referral_id = 'e3100000-0000-4000-8000-000000000001'
        and mutation_kind = 'OFFER_REFERRAL'
    )
  );
end;
$$;

revoke all on all functions in schema
  careslink_portal_response_concurrency_test_support
from public, anon, authenticated, service_role;

grant execute on all functions in schema
  careslink_portal_response_concurrency_test_support
to careslink_portal_response_concurrency_runner;

revoke execute on function
  careslink_portal_response_concurrency_test_support._assert_runner()
from careslink_portal_response_concurrency_runner;

do $$
declare
  v_runner pg_catalog.pg_roles%rowtype;
begin
  select *
  into v_runner
  from pg_catalog.pg_roles
  where rolname = 'careslink_portal_response_concurrency_runner';

  if v_runner.rolname is null
    or not v_runner.rolcanlogin
    or v_runner.rolsuper
    or v_runner.rolcreatedb
    or v_runner.rolcreaterole
    or v_runner.rolreplication
    or v_runner.rolbypassrls
    or exists (
      select 1
      from pg_catalog.pg_authid as auth_role
      where auth_role.rolname =
        'careslink_portal_response_concurrency_runner'
        and auth_role.rolpassword is not null
    )
    or not pg_catalog.pg_has_role(
      'careslink_portal_response_concurrency_runner',
      'authenticated',
      'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      'careslink_portal_response_concurrency_runner',
      'public',
      'CREATE'
    )
    or pg_catalog.has_table_privilege(
      'careslink_portal_response_concurrency_runner',
      'public.portal_referrals',
      'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'careslink_portal_response_concurrency_runner',
      'public.portal_referrals',
      'UPDATE'
    )
  then
    raise exception 'PORTAL_RESPONSE_CONCURRENCY_RUNNER_POSTURE_UNSAFE';
  end if;
end;
$$;

commit;
