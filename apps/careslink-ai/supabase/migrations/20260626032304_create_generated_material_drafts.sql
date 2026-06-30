create table if not exists public.generated_material_drafts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  feature text not null
    check (feature in (
      'profile_rewrite',
      'share_card',
      'referral_message',
      'bilingual_intro',
      'handover_checklist'
    )),
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'archived')),
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_material_drafts_user_id_created_at_idx
  on public.generated_material_drafts(user_id, created_at desc);

create index if not exists generated_material_drafts_provider_draft_id_idx
  on public.generated_material_drafts(provider_draft_id);

create index if not exists generated_material_drafts_feature_idx
  on public.generated_material_drafts(feature);

create index if not exists generated_material_drafts_status_idx
  on public.generated_material_drafts(status);

alter table public.generated_material_drafts enable row level security;

grant select, insert, update, delete on public.generated_material_drafts to service_role;
revoke all on public.generated_material_drafts from anon, authenticated;
