-- CaresLink AI Documents V1 metadata-only pilot report.
-- Change the two timestamps before running. Every result set is aggregate-only.
-- Membership is determined by public.pilot_cohort_members, not auth email or
-- general provider activity. Never return account, visitor, reservation,
-- idempotency, result, input, output, participant, or generated-content fields.

begin transaction read only;

-- Invite, activation, utility, repeat, paid-intent and credit-exhaustion funnel.
with
params as (
  select
    timestamptz '2026-08-05 00:00:00+00' as starts_at,
    timestamptz '2026-09-04 00:00:00+00' as ends_at
),
members as (
  select member.user_id, member.enrolled_at, member.removed_at
  from public.pilot_cohort_members member
  cross join params
  where member.cohort_code = 'ndis_case_note_v01'
    and member.enrolled_at < params.ends_at
    and coalesce(member.removed_at, 'infinity'::timestamptz) >= params.starts_at
),
events as (
  select event.event_name, event.user_id, event.visitor_hash, event.created_at
  from public.template_companion_events event
  join members on members.user_id = event.user_id
  cross join params
  where event.created_at >= greatest(params.starts_at, members.enrolled_at)
    and event.created_at < least(
      params.ends_at,
      coalesce(members.removed_at, 'infinity'::timestamptz)
    )
),
first_seen as (
  select user_id, min(created_at) filter (where event_name = 'companion_viewed') as viewed_at
  from events
  group by user_id
),
activated as (
  select first_seen.user_id, min(events.created_at) as activated_at
  from first_seen
  join events on events.user_id = first_seen.user_id
  where first_seen.viewed_at is not null
    and events.event_name = 'companion_generated'
    and events.created_at between first_seen.viewed_at and first_seen.viewed_at + interval '72 hours'
  group by first_seen.user_id
),
utility as (
  select distinct generated.user_id
  from events generated
  join events action
    on action.user_id = generated.user_id
   and action.visitor_hash = generated.visitor_hash
   and action.event_name in ('companion_saved', 'companion_copied')
   and action.created_at between generated.created_at and generated.created_at + interval '4 hours'
  where generated.event_name = 'companion_generated'
),
repeat_users as (
  select distinct activated.user_id
  from activated
  join events
    on events.user_id = activated.user_id
   and events.event_name = 'companion_generated'
   and events.created_at::date > activated.activated_at::date
   and events.created_at <= activated.activated_at + interval '14 days'
),
paid_intent as (
  select distinct user_id
  from events
  where event_name = 'companion_offer_requested'
),
totals as (
  select
    (select count(*) from members) as invited_providers,
    count(distinct events.user_id) as unique_providers,
    count(distinct events.user_id) filter (where events.event_name = 'companion_viewed') as viewed,
    count(distinct events.user_id) filter (where events.event_name = 'companion_started') as started,
    count(distinct events.user_id) filter (where events.event_name = 'companion_generated') as generated,
    (select count(*) from activated) as activated_within_72h,
    (select count(*) from utility) as same_session_save_or_copy,
    (select count(*) from repeat_users) as repeated_within_14d,
    (select count(*) from paid_intent) as requested_more_credits,
    count(*) filter (where events.event_name = 'companion_credit_exhausted') as credit_exhausted_events
  from events
)
select
  invited_providers,
  unique_providers,
  viewed,
  started,
  generated,
  activated_within_72h,
  round(100.0 * activated_within_72h / nullif(invited_providers, 0), 1) as activation_percent,
  same_session_save_or_copy,
  round(100.0 * same_session_save_or_copy / nullif(generated, 0), 1) as utility_percent,
  repeated_within_14d,
  round(100.0 * repeated_within_14d / nullif(activated_within_72h, 0), 1) as repeat_percent,
  requested_more_credits,
  credit_exhausted_events
from totals;

-- Allowlisted source-surface distribution for active pilot members only.
with
params as (
  select
    timestamptz '2026-08-05 00:00:00+00' as starts_at,
    timestamptz '2026-09-04 00:00:00+00' as ends_at
),
members as (
  select member.user_id, member.enrolled_at, member.removed_at
  from public.pilot_cohort_members member
  cross join params
  where member.cohort_code = 'ndis_case_note_v01'
    and member.enrolled_at < params.ends_at
    and coalesce(member.removed_at, 'infinity'::timestamptz) >= params.starts_at
),
events as (
  select event.surface, event.event_name, event.user_id
  from public.template_companion_events event
  join members on members.user_id = event.user_id
  cross join params
  where event.created_at >= greatest(params.starts_at, members.enrolled_at)
    and event.created_at < least(
      params.ends_at,
      coalesce(members.removed_at, 'infinity'::timestamptz)
    )
)
select
  coalesce(surface, 'direct_or_legacy') as surface,
  event_name,
  count(*) as event_count,
  count(distinct user_id) as unique_providers
from events
group by coalesce(surface, 'direct_or_legacy'), event_name
order by surface, event_name;

-- Controlled release reasons and technical success for active pilot members.
with
params as (
  select
    timestamptz '2026-08-05 00:00:00+00' as starts_at,
    timestamptz '2026-09-04 00:00:00+00' as ends_at
),
members as (
  select member.user_id, member.enrolled_at, member.removed_at
  from public.pilot_cohort_members member
  cross join params
  where member.cohort_code = 'ndis_case_note_v01'
    and member.enrolled_at < params.ends_at
    and coalesce(member.removed_at, 'infinity'::timestamptz) >= params.starts_at
),
terminal as (
  select ledger.event, ledger.reason_code
  from public.credit_ledger ledger
  join members on members.user_id = ledger.user_id
  cross join params
  where ledger.feature = 'ndis_case_note'
    and ledger.action = 'generate'
    and ledger.created_at >= greatest(params.starts_at, members.enrolled_at)
    and ledger.created_at < least(
      params.ends_at,
      coalesce(members.removed_at, 'infinity'::timestamptz)
    )
    and ledger.event in ('commit', 'release')
),
technical as (
  select *
  from terminal
  where event = 'commit'
     or reason_code in (
       'generation_failed',
       'claim_persistence_failed',
       'credit_commit_failed',
       'credit_commit_rejected'
     )
)
select
  count(*) filter (where event = 'commit') as successful_results,
  count(*) filter (where event = 'release') as technical_releases,
  round(
    100.0 * count(*) filter (where event = 'commit') / nullif(count(*), 0),
    1
  ) as technical_success_percent
from technical;

-- Controlled release counts only; reason_code is constrained metadata.
with
params as (
  select
    timestamptz '2026-08-05 00:00:00+00' as starts_at,
    timestamptz '2026-09-04 00:00:00+00' as ends_at
),
members as (
  select member.user_id, member.enrolled_at, member.removed_at
  from public.pilot_cohort_members member
  cross join params
  where member.cohort_code = 'ndis_case_note_v01'
    and member.enrolled_at < params.ends_at
    and coalesce(member.removed_at, 'infinity'::timestamptz) >= params.starts_at
),
releases as (
  select ledger.reason_code
  from public.credit_ledger ledger
  join members on members.user_id = ledger.user_id
  cross join params
  where ledger.feature = 'ndis_case_note'
    and ledger.action = 'generate'
    and ledger.event = 'release'
    and ledger.created_at >= greatest(params.starts_at, members.enrolled_at)
    and ledger.created_at < least(
      params.ends_at,
      coalesce(members.removed_at, 'infinity'::timestamptz)
    )
)
select reason_code, count(*) as release_count
from releases
group by reason_code
order by release_count desc, reason_code;

-- Must return zero. Aggregate-only credit correctness check for the cohort.
with
params as (
  select
    timestamptz '2026-08-05 00:00:00+00' as starts_at,
    timestamptz '2026-09-04 00:00:00+00' as ends_at
),
members as (
  select member.user_id, member.enrolled_at, member.removed_at
  from public.pilot_cohort_members member
  cross join params
  where member.cohort_code = 'ndis_case_note_v01'
    and member.enrolled_at < params.ends_at
    and coalesce(member.removed_at, 'infinity'::timestamptz) >= params.starts_at
),
reservation_terminal_counts as (
  select
    ledger.reservation_id,
    count(*) filter (where ledger.event = 'reserve') as reserve_count,
    count(*) filter (where ledger.event in ('commit', 'release')) as terminal_count
  from public.credit_ledger ledger
  join members on members.user_id = ledger.user_id
  cross join params
  where ledger.feature = 'ndis_case_note'
    and ledger.action = 'generate'
    and ledger.created_at >= greatest(params.starts_at, members.enrolled_at)
    and ledger.created_at < least(
      params.ends_at,
      coalesce(members.removed_at, 'infinity'::timestamptz)
    )
    and ledger.reservation_id is not null
  group by ledger.reservation_id
)
select count(*) as credit_correctness_anomalies
from reservation_terminal_counts
where reserve_count <> 1 or terminal_count <> 1;

rollback;
