create table if not exists public.outreach_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  generated_material_draft_id text references public.generated_material_drafts(id) on delete set null,
  recipient_name text not null,
  organisation text,
  role_type text not null
    check (role_type in (
      'support_coordinator',
      'provider',
      'community_group',
      'case_manager',
      'family_contact',
      'other'
    )),
  channel text not null
    check (channel in (
      'wechat',
      'whatsapp',
      'email',
      'phone',
      'in_person',
      'other'
    )),
  status text not null
    check (status in (
      'to_send',
      'sent',
      'replied',
      'follow_up',
      'not_suitable'
    )),
  last_contacted_at date,
  next_follow_up_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_records_user_id_created_at_idx
  on public.outreach_records(user_id, created_at desc);

create index if not exists outreach_records_provider_draft_id_idx
  on public.outreach_records(provider_draft_id);

create index if not exists outreach_records_status_idx
  on public.outreach_records(status);

create index if not exists outreach_records_next_follow_up_at_idx
  on public.outreach_records(next_follow_up_at);

alter table public.outreach_records enable row level security;

grant select, insert, update, delete on public.outreach_records to service_role;
revoke all on public.outreach_records from anon, authenticated;
