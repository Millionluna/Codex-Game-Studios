-- CaresLink AI Documents V1 metadata-only pilot report.
-- Change the two timestamps before running. Result sets contain aggregates only.
-- Never select identifiers, hashes, idempotency keys, result refs, input or output.

begin;
set local transaction read only;

create temporary table pilot_window on commit drop as
select
  timestamptz '2026-08-05 00:00:00+00' as starts_at,
  timestamptz '2026-09-04 00:00:00+00' as ends_at;

-- Aggregate acquisition and product funnel, including allowlisted surface.
with events as (
  select event_name, user_id, visitor_hash, surface, created_at
  from public.template_companion_events, pilot_window
  where created_at >= starts_at
    and created_at < ends_at
    and user_id is not null
),
first_seen as (
  select user_id, min(created_at) filter (where event_name = 'companion_viewed') as viewed_at
  from events
  group by user_id
),
activated as (
  select distinct f.user_id
  from first_seen f
  join events e on e.user_id = f.user_id
  where f.viewed_at is not null
    and e.event_name = 'companion_generated'
    and e.created_at between f.viewed_at and f.viewed_at + interval '72 hours'
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
first_generation as (
  select user_id, min(created_at)::date as first_generated_on
  from events
  where event_name = 'companion_generated'
  group by user_id
),
repeat_users as (
  select distinct first_generation.user_id
  from first_generation
  join events
    on events.user_id = first_generation.user_id
   and events.event_name = 'companion_generated'
   and events.created_at::date > first_generation.first_generated_on
   and events.created_at::date <= first_generation.first_generated_on + 14
),
paid_intent as (
  select distinct user_id
  from events
  where event_name = 'companion_offer_requested'
)
select
  count(distinct events.user_id) as unique_providers,
  count(distinct events.user_id) filter (where event_name = 'companion_viewed') as viewed,
  count(distinct events.user_id) filter (where event_name = 'companion_started') as started,
  count(distinct events.user_id) filter (where event_name = 'companion_generated') as generated,
  count(distinct activated.user_id) as activated_within_72h,
  count(distinct utility.user_id) as same_session_save_or_copy,
  count(distinct repeat_users.user_id) as repeated_within_14d,
  count(distinct paid_intent.user_id) as requested_more_credits,
  count(*) filter (where event_name = 'companion_credit_exhausted') as credit_exhausted_events
from events
left join activated on activated.user_id = events.user_id
left join utility on utility.user_id = events.user_id
left join repeat_users on repeat_users.user_id = events.user_id
left join paid_intent on paid_intent.user_id = events.user_id;

-- Allowlisted source-surface distribution. Null means direct/legacy attribution.
select
  coalesce(surface, 'direct_or_legacy') as surface,
  event_name,
  count(*) as event_count,
  count(distinct user_id) as unique_providers
from public.template_companion_events, pilot_window
where created_at >= starts_at
  and created_at < ends_at
group by coalesce(surface, 'direct_or_legacy'), event_name
order by surface, event_name;

-- Controlled release reasons and technical success. No free-text errors are stored.
with terminal as (
  select event, reason_code
  from public.credit_ledger, pilot_window
  where feature = 'ndis_case_note'
    and action = 'generate'
    and created_at >= starts_at
    and created_at < ends_at
    and event in ('commit', 'release')
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

select reason_code, count(*) as release_count
from public.credit_ledger, pilot_window
where feature = 'ndis_case_note'
  and action = 'generate'
  and event = 'release'
  and created_at >= starts_at
  and created_at < ends_at
group by reason_code
order by release_count desc, reason_code;

-- Must return zero. Aggregate-only credit correctness check.
with reservation_terminal_counts as (
  select
    reservation_id,
    count(*) filter (where event = 'reserve') as reserve_count,
    count(*) filter (where event in ('commit', 'release')) as terminal_count
  from public.credit_ledger, pilot_window
  where feature = 'ndis_case_note'
    and action = 'generate'
    and created_at >= starts_at
    and created_at < ends_at
    and reservation_id is not null
  group by reservation_id
)
select count(*) as credit_correctness_anomalies
from reservation_terminal_counts
where reserve_count <> 1 or terminal_count <> 1;

rollback;
