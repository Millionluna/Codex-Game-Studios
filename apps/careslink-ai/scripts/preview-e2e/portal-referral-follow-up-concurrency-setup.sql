-- TEST_ONLY support boundary for true multi-backend Referral Follow-up races.
-- Apply only after the exact eight-migration local PostgreSQL 16 chain.

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
    or current_setting('is_superuser') <> 'on'
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_SETUP_UNSAFE';
  end if;

  if pg_catalog.to_regrole(
      'careslink_portal_follow_up_concurrency_runner'
    ) is not null
    or pg_catalog.to_regnamespace(
      'careslink_portal_follow_up_concurrency_test_support'
    ) is not null
    or pg_catalog.to_regprocedure(
      'public.portal_referral_follow_up_detail(uuid)'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.portal_referral_follow_up_record(uuid,bigint,text,text,text,text)'
    ) is null
    or (
      select count(*)
      from public.portal_workflow_flags
      where capability in (
        'referral_workflow_v1',
        'referral_intake_v1',
        'referral_source_detail_v1',
        'referral_assignment_v1',
        'referral_provider_response_v1',
        'referral_follow_up_v1'
      )
    ) <> 6
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
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_SETUP_SCHEMA_DRIFT';
  end if;
end;
$$;

create role careslink_portal_follow_up_concurrency_runner
  login
  inherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

grant authenticated to careslink_portal_follow_up_concurrency_runner;
grant connect on database postgres
to careslink_portal_follow_up_concurrency_runner;

create schema careslink_portal_follow_up_concurrency_test_support
authorization postgres;

revoke all on schema careslink_portal_follow_up_concurrency_test_support
from public, anon, authenticated, service_role;

grant usage on schema careslink_portal_follow_up_concurrency_test_support
to careslink_portal_follow_up_concurrency_runner;

create function
careslink_portal_follow_up_concurrency_test_support.lock_mutation(
  p_actor_user_id uuid,
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
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if p_actor_user_id is null
    or p_actor_user_id not in (
      'a4100000-0000-4000-8000-000000000001'::uuid,
      'a4200000-0000-4000-8000-000000000002'::uuid
    )
    or p_mutation_id_hash is null
    or p_mutation_id_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_MUTATION_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_user_id::text || ':' || p_mutation_id_hash,
      0
    )
  );
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.lock_referral(
  p_case text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_referral_id uuid :=
    careslink_portal_follow_up_concurrency_test_support._referral_id(p_case);
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if v_referral_id is null then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_INVALID';
  end if;

  perform 1
  from public.portal_referrals as referral
  where referral.id = v_referral_id
  for update of referral;

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_MISSING';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.lock_session(
  p_case text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if careslink_portal_follow_up_concurrency_test_support._referral_id(p_case)
      is null
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_INVALID';
  end if;

  perform 1
  from auth.sessions as active_session
  where active_session.id =
    'b4100000-0000-4000-8000-000000000001'
  for update of active_session;

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_SESSION_MISSING';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.lock_provider()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  perform 1
  from public.portal_providers as provider
  where provider.id = 'd4100000-0000-4000-8000-000000000001'
  for update of provider;

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_PROVIDER_MISSING';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.lock_contact(
  p_case text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_referral_id uuid :=
    careslink_portal_follow_up_concurrency_test_support._referral_id(p_case);
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if v_referral_id is null then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_INVALID';
  end if;

  perform 1
  from careslink_portal_private.portal_referral_contacts as contact
  where contact.referral_id = v_referral_id
  for update of contact;

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_CONTACT_MISSING';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.arm_session_expiry(
  p_case text,
  p_delay_milliseconds integer
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_not_after timestamptz;
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if careslink_portal_follow_up_concurrency_test_support._referral_id(p_case)
      is null
    or p_delay_milliseconds is null
    or p_delay_milliseconds < 250
    or p_delay_milliseconds > 5000
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_EXPIRY_INVALID';
  end if;

  v_not_after := pg_catalog.clock_timestamp()
    + pg_catalog.make_interval(
      secs => p_delay_milliseconds::double precision / 1000.0
    );

  update auth.sessions
  set not_after = v_not_after,
      updated_at = pg_catalog.clock_timestamp()
  where id = 'b4100000-0000-4000-8000-000000000001';

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_SESSION_MISSING';
  end if;

  return v_not_after;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.revoke_session(
  p_case text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if careslink_portal_follow_up_concurrency_test_support._referral_id(p_case)
      is null
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_INVALID';
  end if;

  delete from auth.sessions
  where id = 'b4100000-0000-4000-8000-000000000001';

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_SESSION_MISSING';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.revoke_provider()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  update public.portal_providers
  set review_status = 'SUSPENDED',
      updated_at = pg_catalog.clock_timestamp()
  where id = 'd4100000-0000-4000-8000-000000000001';

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_PROVIDER_MISSING';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.lock_follow_up_flag()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  perform 1
  from public.portal_workflow_flags as flag
  where flag.capability = 'referral_follow_up_v1'
  for update of flag;

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FLAG_MISSING';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.disable_follow_up_flag()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  update public.portal_workflow_flags
  set enabled = false,
      updated_at = pg_catalog.clock_timestamp()
  where capability = 'referral_follow_up_v1';

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FLAG_MISSING';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.revoke_ownership(
  p_case text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_referral_id uuid :=
    careslink_portal_follow_up_concurrency_test_support._referral_id(p_case);
  v_match_a_id uuid :=
    careslink_portal_follow_up_concurrency_test_support._match_a_id(p_case);
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_match_count bigint;
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if v_referral_id is null or v_match_a_id is null then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_INVALID';
  end if;

  -- Match the production resource order: referral, then every match by id.
  perform 1
  from public.portal_referrals as referral
  where referral.id = v_referral_id
  for update of referral;

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_MISSING';
  end if;

  perform 1
  from public.portal_referral_matches as match
  where match.referral_id = v_referral_id
  order by match.id
  for update of match;

  select count(*)
  into v_match_count
  from public.portal_referral_matches as match
  where match.referral_id = v_referral_id;

  if v_match_count <> 2 then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_MATCH_DRIFT';
  end if;

  update public.portal_referral_matches
  set status = 'WITHDRAWN',
      row_version = row_version + 1,
      updated_at = v_now
  where id = v_match_a_id
    and referral_id = v_referral_id
    and provider_id = 'd4100000-0000-4000-8000-000000000001'
    and status = 'ACCEPTED';

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_OWNERSHIP_DRIFT';
  end if;

  update public.portal_referrals
  set current_status = 'CLOSED',
      assigned_provider_id = null,
      row_version = row_version + 1,
      updated_at = v_now
  where id = v_referral_id
    and assigned_provider_id =
      'd4100000-0000-4000-8000-000000000001';

  if not found then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_OWNERSHIP_DRIFT';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.blocked_count(
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
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if p_backend_pids is null
    or pg_catalog.cardinality(p_backend_pids) < 1
    or pg_catalog.cardinality(p_backend_pids) > 4
    or exists (
      select 1
      from pg_catalog.unnest(p_backend_pids) as pid
      where pid is null or pid <= 0
    )
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_BACKEND_SET_INVALID';
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
careslink_portal_follow_up_concurrency_test_support.blocked_by_count(
  p_backend_pids integer[],
  p_blocker_pid integer
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
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if p_backend_pids is null
    or pg_catalog.cardinality(p_backend_pids) < 1
    or pg_catalog.cardinality(p_backend_pids) > 4
    or p_blocker_pid is null
    or p_blocker_pid <= 0
    or exists (
      select 1
      from pg_catalog.unnest(p_backend_pids) as pid
      where pid is null or pid <= 0
    )
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_BACKEND_SET_INVALID';
  end if;

  select count(*)::integer
  into v_count
  from pg_catalog.pg_stat_activity as activity
  where activity.pid = any(p_backend_pids)
    and activity.wait_event_type = 'Lock'
    and p_blocker_pid = any(pg_catalog.pg_blocking_pids(activity.pid));

  return v_count;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.blockers(
  p_backend_pids integer[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_blockers jsonb;
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if p_backend_pids is null
    or pg_catalog.cardinality(p_backend_pids) < 1
    or pg_catalog.cardinality(p_backend_pids) > 4
    or exists (
      select 1
      from pg_catalog.unnest(p_backend_pids) as pid
      where pid is null or pid <= 0
    )
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_BACKEND_SET_INVALID';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pid', activity.pid,
        'wait_event_type', activity.wait_event_type,
        'wait_event', activity.wait_event,
        'blocking_pids', pg_catalog.pg_blocking_pids(activity.pid)
      ) order by activity.pid
    ),
    '[]'::jsonb
  )
  into v_blockers
  from pg_catalog.pg_stat_activity as activity
  where activity.pid = any(p_backend_pids);

  return v_blockers;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.fixture_state(
  p_case text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_referral_id uuid :=
    careslink_portal_follow_up_concurrency_test_support._referral_id(p_case);
  v_match_a_id uuid :=
    careslink_portal_follow_up_concurrency_test_support._match_a_id(p_case);
  v_match_b_id uuid :=
    careslink_portal_follow_up_concurrency_test_support._match_b_id(p_case);
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  if v_referral_id is null or v_match_a_id is null or v_match_b_id is null then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_INVALID';
  end if;

  return jsonb_build_object(
    'case', p_case,
    'referral_status', (
      select referral.current_status
      from public.portal_referrals as referral
      where referral.id = v_referral_id
    ),
    'referral_version', (
      select referral.row_version
      from public.portal_referrals as referral
      where referral.id = v_referral_id
    ),
    'assigned_provider_id', (
      select referral.assigned_provider_id
      from public.portal_referrals as referral
      where referral.id = v_referral_id
    ),
    'match_a_status', (
      select match.status
      from public.portal_referral_matches as match
      where match.id = v_match_a_id
    ),
    'match_a_version', (
      select match.row_version
      from public.portal_referral_matches as match
      where match.id = v_match_a_id
    ),
    'match_b_status', (
      select match.status
      from public.portal_referral_matches as match
      where match.id = v_match_b_id
    ),
    'match_b_version', (
      select match.row_version
      from public.portal_referral_matches as match
      where match.id = v_match_b_id
    ),
    'followup_count', (
      select count(*)
      from public.portal_referral_followups as followup
      where followup.referral_id = v_referral_id
    ),
    'audit_count', (
      select count(*)
      from public.portal_audit_events as audit
      where audit.referral_id = v_referral_id
        and audit.mutation_kind = 'RECORD_FOLLOW_UP'
    ),
    'receipt_count', (
      select count(*)
      from public.portal_mutation_receipts as receipt
      where receipt.response_referral_id = v_referral_id
        and receipt.mutation_kind = 'RECORD_FOLLOW_UP'
    ),
    'followups', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', followup.id,
            'actor_user_id', followup.actor_user_id,
            'outcome_code', followup.outcome_code,
            'next_due_at', followup.next_due_at,
            'created_at', followup.created_at
          ) order by followup.id
        ),
        '[]'::jsonb
      )
      from public.portal_referral_followups as followup
      where followup.referral_id = v_referral_id
    ),
    'audits', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', audit.id,
            'actor_user_id', audit.actor_user_id,
            'actor_role', audit.actor_role,
            'mutation_kind', audit.mutation_kind,
            'from_status', audit.from_status,
            'to_status', audit.to_status,
            'mutation_id_hash', audit.mutation_id_hash,
            'correlation_id_hash', audit.correlation_id_hash,
            'metadata', audit.metadata,
            'occurred_at', audit.occurred_at
          ) order by audit.id
        ),
        '[]'::jsonb
      )
      from public.portal_audit_events as audit
      where audit.referral_id = v_referral_id
        and audit.mutation_kind = 'RECORD_FOLLOW_UP'
    ),
    'receipts', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', receipt.id,
            'actor_user_id', receipt.actor_user_id,
            'mutation_id_hash', receipt.mutation_id_hash,
            'mutation_kind', receipt.mutation_kind,
            'payload_hash', receipt.payload_hash,
            'response_referral_id', receipt.response_referral_id,
            'response_match_id', receipt.response_match_id,
            'response_status', receipt.response_status,
            'response_row_version', receipt.response_row_version,
            'response_updated_at', receipt.response_updated_at,
            'created_at', receipt.created_at
          ) order by receipt.id
        ),
        '[]'::jsonb
      )
      from public.portal_mutation_receipts as receipt
      where receipt.response_referral_id = v_referral_id
        and receipt.mutation_kind = 'RECORD_FOLLOW_UP'
    ),
    'session_exists', exists (
      select 1
      from auth.sessions as active_session
      where active_session.id =
        'b4100000-0000-4000-8000-000000000001'
    ),
    'provider_review_status', (
      select provider.review_status
      from public.portal_providers as provider
      where provider.id = 'd4100000-0000-4000-8000-000000000001'
    ),
    'follow_up_flag_enabled', (
      select flag.enabled
      from public.portal_workflow_flags as flag
      where flag.capability = 'referral_follow_up_v1'
    )
  );
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support._assert_runner()
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
  if session_user <> 'careslink_portal_follow_up_concurrency_runner'
    or v_application_name !~ '^careslink-portal-follow-up-race-(replay|same-key-conflict|different-key-stale|same-provider-actors|session|provider|flag|ownership-first)-(a|b|control|observer)$'
    or pg_catalog.inet_server_addr() is distinct from
      '127.0.0.1'::pg_catalog.inet
    or pg_catalog.inet_server_port() < 49152
    or pg_catalog.inet_server_port() > 65535
    or pg_catalog.current_setting('server_version_num')::integer < 160000
    or pg_catalog.current_setting('server_version_num')::integer >= 170000
    or pg_catalog.current_setting(
      'careslink.portal_follow_up_concurrency_marker',
      true
    ) is distinct from '2026-08-26.local-pg16.m1c.1'
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_UNSAFE';
  end if;
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support._case_number(
  p_case text
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_case
    when 'replay' then 1
    when 'same-key-conflict' then 2
    when 'different-key-stale' then 3
    when 'same-provider-actors' then 4
    when 'session' then 5
    when 'provider' then 6
    when 'flag' then 7
    when 'ownership-first' then 8
    else null
  end
$$;

create function
careslink_portal_follow_up_concurrency_test_support._referral_id(
  p_case text
)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    careslink_portal_follow_up_concurrency_test_support._case_number(p_case)
    when 1 then 'e4100000-0000-4000-8000-000000000001'::uuid
    when 2 then 'e4200000-0000-4000-8000-000000000002'::uuid
    when 3 then 'e4300000-0000-4000-8000-000000000003'::uuid
    when 4 then 'e4400000-0000-4000-8000-000000000004'::uuid
    when 5 then 'e4500000-0000-4000-8000-000000000005'::uuid
    when 6 then 'e4600000-0000-4000-8000-000000000006'::uuid
    when 7 then 'e4700000-0000-4000-8000-000000000007'::uuid
    when 8 then 'e4800000-0000-4000-8000-000000000008'::uuid
    else null
  end
$$;

create function
careslink_portal_follow_up_concurrency_test_support._match_a_id(
  p_case text
)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    careslink_portal_follow_up_concurrency_test_support._case_number(p_case)
    when 1 then 'f4100000-0000-4000-8000-000000000001'::uuid
    when 2 then 'f4200000-0000-4000-8000-000000000002'::uuid
    when 3 then 'f4300000-0000-4000-8000-000000000003'::uuid
    when 4 then 'f4400000-0000-4000-8000-000000000004'::uuid
    when 5 then 'f4500000-0000-4000-8000-000000000005'::uuid
    when 6 then 'f4600000-0000-4000-8000-000000000006'::uuid
    when 7 then 'f4700000-0000-4000-8000-000000000007'::uuid
    when 8 then 'f4800000-0000-4000-8000-000000000008'::uuid
    else null
  end
$$;

create function
careslink_portal_follow_up_concurrency_test_support._match_b_id(
  p_case text
)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    careslink_portal_follow_up_concurrency_test_support._case_number(p_case)
    when 1 then 'f5100000-0000-4000-8000-000000000001'::uuid
    when 2 then 'f5200000-0000-4000-8000-000000000002'::uuid
    when 3 then 'f5300000-0000-4000-8000-000000000003'::uuid
    when 4 then 'f5400000-0000-4000-8000-000000000004'::uuid
    when 5 then 'f5500000-0000-4000-8000-000000000005'::uuid
    when 6 then 'f5600000-0000-4000-8000-000000000006'::uuid
    when 7 then 'f5700000-0000-4000-8000-000000000007'::uuid
    when 8 then 'f5800000-0000-4000-8000-000000000008'::uuid
    else null
  end
$$;

create function
careslink_portal_follow_up_concurrency_test_support._payload_hash(
  p_referral_id uuid,
  p_outcome_code text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.v1_shadow_content_sha256(
    jsonb_build_object(
      'actor', jsonb_build_object(
        'organizationId', 'c4200000-0000-4000-8000-000000000002',
        'role', 'provider_member',
        'providerId', 'd4100000-0000-4000-8000-000000000001'
      ),
      'kind', 'RECORD_FOLLOW_UP',
      'command', jsonb_build_object(
        'referralId', p_referral_id::text,
        'expectedVersion', 4,
        'outcomeCode', p_outcome_code
      )
    )
  )
$$;

create function
careslink_portal_follow_up_concurrency_test_support.cleanup_fixture()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'careslink.portal-follow-up-concurrency.fixture-management',
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
end;
$$;

create function
careslink_portal_follow_up_concurrency_test_support.reset_fixture(
  p_case text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_referral_id uuid;
  v_match_a_id uuid;
  v_match_b_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_contact_confirmed_hash text;
  v_information_requested_hash text;
  v_follow_up_scheduled_hash text;
  v_service_commenced_hash text;
  v_no_response_hash text;
begin
  perform
    careslink_portal_follow_up_concurrency_test_support._assert_runner();

  v_referral_id :=
    careslink_portal_follow_up_concurrency_test_support._referral_id(p_case);
  v_match_a_id :=
    careslink_portal_follow_up_concurrency_test_support._match_a_id(p_case);
  v_match_b_id :=
    careslink_portal_follow_up_concurrency_test_support._match_b_id(p_case);

  if v_referral_id is null or v_match_a_id is null or v_match_b_id is null then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_INVALID';
  end if;

  perform
    careslink_portal_follow_up_concurrency_test_support.cleanup_fixture();

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
      'a4100000-0000-4000-8000-000000000001',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'follow-up-concurrency-provider-a1@example.invalid',
      'test-only-no-login',
      v_now,
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      v_now,
      v_now
    ),
    (
      'a4200000-0000-4000-8000-000000000002',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'follow-up-concurrency-provider-a2@example.invalid',
      'test-only-no-login',
      v_now,
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      v_now,
      v_now
    ),
    (
      'a4300000-0000-4000-8000-000000000003',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'follow-up-concurrency-provider-b@example.invalid',
      'test-only-no-login',
      v_now,
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      v_now,
      v_now
    ),
    (
      'a4400000-0000-4000-8000-000000000004',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'follow-up-concurrency-source@example.invalid',
      'test-only-no-login',
      v_now,
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      v_now,
      v_now
    ),
    (
      'a4500000-0000-4000-8000-000000000005',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'follow-up-concurrency-offerer@example.invalid',
      'test-only-no-login',
      v_now,
      '{}'::jsonb,
      '{}'::jsonb,
      false,
      v_now,
      v_now
    );

  insert into auth.sessions (
    id,
    user_id,
    created_at,
    updated_at,
    not_after
  ) values
    (
      'b4100000-0000-4000-8000-000000000001',
      'a4100000-0000-4000-8000-000000000001',
      v_now,
      v_now,
      null
    ),
    (
      'b4200000-0000-4000-8000-000000000002',
      'a4200000-0000-4000-8000-000000000002',
      v_now,
      v_now,
      null
    ),
    (
      'b4300000-0000-4000-8000-000000000003',
      'a4300000-0000-4000-8000-000000000003',
      v_now,
      v_now,
      null
    );

  insert into public.portal_organizations (
    id,
    organization_type,
    display_name,
    status
  ) values
    (
      'c4100000-0000-4000-8000-000000000001',
      'REFERRAL_SOURCE',
      'Follow-up Concurrency Source',
      'ACTIVE'
    ),
    (
      'c4200000-0000-4000-8000-000000000002',
      'PROVIDER',
      'Follow-up Concurrency Provider A',
      'ACTIVE'
    ),
    (
      'c4300000-0000-4000-8000-000000000003',
      'PROVIDER',
      'Follow-up Concurrency Provider B',
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
      'ca410000-0000-4000-8000-000000000001',
      'c4200000-0000-4000-8000-000000000002',
      'a4100000-0000-4000-8000-000000000001',
      'provider_member',
      'ACTIVE'
    ),
    (
      'ca420000-0000-4000-8000-000000000002',
      'c4200000-0000-4000-8000-000000000002',
      'a4200000-0000-4000-8000-000000000002',
      'provider_member',
      'ACTIVE'
    ),
    (
      'ca430000-0000-4000-8000-000000000003',
      'c4300000-0000-4000-8000-000000000003',
      'a4300000-0000-4000-8000-000000000003',
      'provider_member',
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
      'd4100000-0000-4000-8000-000000000001',
      'c4200000-0000-4000-8000-000000000002',
      'APPROVED',
      array['SUPPORT_COORDINATION'],
      array['VIC_MELBOURNE'],
      array['en'],
      array[]::text[],
      'UNAVAILABLE'
    ),
    (
      'd4200000-0000-4000-8000-000000000002',
      'c4300000-0000-4000-8000-000000000003',
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
    v_referral_id,
    'c4100000-0000-4000-8000-000000000001',
    'a4400000-0000-4000-8000-000000000004',
    'Follow-up concurrency fixture ' || p_case,
    'VIC_MELBOURNE',
    'SUPPORT_COORDINATION',
    'ACCEPTED',
    'd4100000-0000-4000-8000-000000000001',
    4,
    v_now,
    v_now
  );

  insert into careslink_portal_private.portal_referral_contacts (
    referral_id,
    contact_name,
    contact_phone,
    contact_email,
    created_at,
    updated_at
  ) values (
    v_referral_id,
    'Follow-up Concurrency Contact',
    '0400000041',
    'follow-up-concurrency@example.invalid',
    v_now,
    v_now
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
      v_match_a_id,
      v_referral_id,
      'd4100000-0000-4000-8000-000000000001',
      'ACCEPTED',
      'a4500000-0000-4000-8000-000000000005',
      v_now,
      'a4100000-0000-4000-8000-000000000001',
      v_now,
      2,
      v_now,
      v_now
    ),
    (
      v_match_b_id,
      v_referral_id,
      'd4200000-0000-4000-8000-000000000002',
      'CANDIDATE',
      null,
      null,
      null,
      null,
      1,
      v_now,
      v_now
    );

  update public.portal_workflow_flags
  set enabled = true,
      updated_at = v_now
  where capability in (
    'referral_workflow_v1',
    'referral_follow_up_v1'
  );

  v_contact_confirmed_hash :=
    careslink_portal_follow_up_concurrency_test_support._payload_hash(
      v_referral_id,
      'CONTACT_CONFIRMED'
    );
  v_information_requested_hash :=
    careslink_portal_follow_up_concurrency_test_support._payload_hash(
      v_referral_id,
      'INFORMATION_REQUESTED'
    );
  v_follow_up_scheduled_hash :=
    careslink_portal_follow_up_concurrency_test_support._payload_hash(
      v_referral_id,
      'FOLLOW_UP_SCHEDULED'
    );
  v_service_commenced_hash :=
    careslink_portal_follow_up_concurrency_test_support._payload_hash(
      v_referral_id,
      'SERVICE_COMMENCED'
    );
  v_no_response_hash :=
    careslink_portal_follow_up_concurrency_test_support._payload_hash(
      v_referral_id,
      'NO_RESPONSE'
    );

  return jsonb_build_object(
    'case', p_case,
    'referral_id', v_referral_id,
    'match_a_id', v_match_a_id,
    'match_b_id', v_match_b_id,
    'provider_a_id', 'd4100000-0000-4000-8000-000000000001',
    'provider_b_id', 'd4200000-0000-4000-8000-000000000002',
    'actor_a_user_id', 'a4100000-0000-4000-8000-000000000001',
    'actor_a_session_id', 'b4100000-0000-4000-8000-000000000001',
    'actor_b_user_id', 'a4200000-0000-4000-8000-000000000002',
    'actor_b_session_id', 'b4200000-0000-4000-8000-000000000002',
    'provider_b_user_id', 'a4300000-0000-4000-8000-000000000003',
    'provider_b_session_id', 'b4300000-0000-4000-8000-000000000003',
    'expected_version', 4,
    'contact_confirmed_hash', v_contact_confirmed_hash,
    'information_requested_hash', v_information_requested_hash,
    'follow_up_scheduled_hash', v_follow_up_scheduled_hash,
    'service_commenced_hash', v_service_commenced_hash,
    'no_response_hash', v_no_response_hash,
    'payload_hashes', jsonb_build_object(
      'CONTACT_CONFIRMED', v_contact_confirmed_hash,
      'INFORMATION_REQUESTED', v_information_requested_hash,
      'FOLLOW_UP_SCHEDULED', v_follow_up_scheduled_hash,
      'SERVICE_COMMENCED', v_service_commenced_hash,
      'NO_RESPONSE', v_no_response_hash
    )
  );
end;
$$;

revoke all on all functions in schema
  careslink_portal_follow_up_concurrency_test_support
from public, anon, authenticated, service_role,
  careslink_portal_follow_up_concurrency_runner;

grant execute on function
  careslink_portal_follow_up_concurrency_test_support.cleanup_fixture(),
  careslink_portal_follow_up_concurrency_test_support.reset_fixture(text),
  careslink_portal_follow_up_concurrency_test_support.lock_mutation(uuid, text),
  careslink_portal_follow_up_concurrency_test_support.lock_referral(text),
  careslink_portal_follow_up_concurrency_test_support.lock_session(text),
  careslink_portal_follow_up_concurrency_test_support.lock_provider(),
  careslink_portal_follow_up_concurrency_test_support.lock_contact(text),
  careslink_portal_follow_up_concurrency_test_support.arm_session_expiry(
    text, integer
  ),
  careslink_portal_follow_up_concurrency_test_support.revoke_session(text),
  careslink_portal_follow_up_concurrency_test_support.revoke_provider(),
  careslink_portal_follow_up_concurrency_test_support.lock_follow_up_flag(),
  careslink_portal_follow_up_concurrency_test_support.disable_follow_up_flag(),
  careslink_portal_follow_up_concurrency_test_support.revoke_ownership(text),
  careslink_portal_follow_up_concurrency_test_support.blocked_count(integer[]),
  careslink_portal_follow_up_concurrency_test_support.blocked_by_count(
    integer[], integer
  ),
  careslink_portal_follow_up_concurrency_test_support.blockers(integer[]),
  careslink_portal_follow_up_concurrency_test_support.fixture_state(text)
to careslink_portal_follow_up_concurrency_runner;

do $$
declare
  v_runner pg_catalog.pg_roles%rowtype;
  v_table text;
begin
  select *
  into v_runner
  from pg_catalog.pg_roles
  where rolname = 'careslink_portal_follow_up_concurrency_runner';

  if v_runner.rolname is null
    or not v_runner.rolcanlogin
    or not v_runner.rolinherit
    or v_runner.rolsuper
    or v_runner.rolcreatedb
    or v_runner.rolcreaterole
    or v_runner.rolreplication
    or v_runner.rolbypassrls
    or not pg_catalog.pg_has_role(
      'careslink_portal_follow_up_concurrency_runner',
      'authenticated',
      'member'
    )
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_POSTURE_FAILED';
  end if;

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
    'public.portal_audit_events',
    'auth.users',
    'auth.sessions'
  ] loop
    if pg_catalog.has_table_privilege(
      'careslink_portal_follow_up_concurrency_runner',
      v_table,
      'INSERT, UPDATE, DELETE, REFERENCES, TRIGGER'
    )
    then
      raise exception
        'PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_TABLE_PRIVILEGE_FAILED';
    end if;
  end loop;
end;
$$;

commit;
