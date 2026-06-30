create table if not exists public.access_requests (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  profile_name text not null,
  entity_type text not null
    check (entity_type in ('individual', 'organisation')),
  referral_direction text not null
    check (referral_direction in ('receive', 'send', 'both')),
  requested_code_type text not null
    check (requested_code_type in (
      'Provider Pilot',
      'Referral Source Pilot',
      'Dual Role Pilot',
      'Internal Test',
      'Partner Batch'
    )),
  source_invite text,
  expected_daily_quota integer not null default 0
    check (expected_daily_quota >= 0 and expected_daily_quota <= 100),
  reason text not null,
  abuse_cost_control_note text,
  status text not null default 'queued'
    check (status in ('queued', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_requests_user_id_idx
  on public.access_requests(user_id);

create index if not exists access_requests_status_idx
  on public.access_requests(status);

create index if not exists access_requests_created_at_idx
  on public.access_requests(created_at desc);

create table if not exists public.access_codes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_request_id text references public.access_requests(id) on delete set null,
  code_type text not null
    check (code_type in (
      'Provider Pilot',
      'Referral Source Pilot',
      'Dual Role Pilot',
      'Internal Test',
      'Partner Batch'
    )),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  daily_quota integer not null default 0
    check (daily_quota >= 0 and daily_quota <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists access_codes_user_id_idx
  on public.access_codes(user_id);

create index if not exists access_codes_status_idx
  on public.access_codes(status);

create table if not exists public.ai_usage_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  feature text not null,
  input_token_count integer not null default 0
    check (input_token_count >= 0),
  output_token_count integer not null default 0
    check (output_token_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_id_created_at_idx
  on public.ai_usage_events(user_id, created_at desc);

create index if not exists ai_usage_events_feature_idx
  on public.ai_usage_events(feature);

alter table public.access_requests enable row level security;
alter table public.access_codes enable row level security;
alter table public.ai_usage_events enable row level security;

grant select, insert, update, delete on public.access_requests to service_role;
grant select, insert, update, delete on public.access_codes to service_role;
grant select, insert, update, delete on public.ai_usage_events to service_role;

revoke all on public.access_requests from anon, authenticated;
revoke all on public.access_codes from anon, authenticated;
revoke all on public.ai_usage_events from anon, authenticated;
