create table if not exists public.provider_drafts (
  id text primary key,
  source text not null default 'provider-profile-generator',
  draft_payload jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'claimed', 'archived')),
  owner_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_drafts_source_idx
  on public.provider_drafts(source);

create index if not exists provider_drafts_status_idx
  on public.provider_drafts(status);

create index if not exists provider_drafts_owner_user_id_idx
  on public.provider_drafts(owner_user_id);

alter table public.provider_drafts enable row level security;

grant select, insert, update, delete on public.provider_drafts to service_role;
revoke all on public.provider_drafts from anon, authenticated;
