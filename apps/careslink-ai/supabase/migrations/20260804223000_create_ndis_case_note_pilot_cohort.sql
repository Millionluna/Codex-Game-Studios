create table if not exists public.pilot_cohort_members (
  cohort_code text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  cohort_stage text not null,
  enrolled_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (cohort_code, user_id),
  constraint pilot_cohort_members_cohort_code_check
    check (cohort_code = 'ndis_case_note_v01'),
  constraint pilot_cohort_members_stage_check
    check (cohort_stage in ('canary', 'eight_provider', 'full_pilot')),
  constraint pilot_cohort_members_membership_window_check
    check (removed_at is null or removed_at >= enrolled_at)
);

comment on table public.pilot_cohort_members is
  'Metadata-only allowlist for audited invite-only product pilots. It must not contain email, contact details, prompts, inputs, outputs, participant facts, or generated content.';
comment on column public.pilot_cohort_members.user_id is
  'Supabase account owner UUID. Aggregate reports must not return this value.';
comment on column public.pilot_cohort_members.cohort_stage is
  'Controlled rollout stage only; no free text.';

alter table public.pilot_cohort_members enable row level security;

revoke all on table public.pilot_cohort_members from public, anon, authenticated;
grant select, insert, update, delete on table public.pilot_cohort_members to service_role;

create index if not exists pilot_cohort_members_active_window_idx
  on public.pilot_cohort_members (cohort_code, enrolled_at, removed_at);
