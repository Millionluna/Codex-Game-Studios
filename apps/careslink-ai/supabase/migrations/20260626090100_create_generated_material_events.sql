create table if not exists public.generated_material_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_draft_id text references public.provider_drafts(id) on delete set null,
  generated_material_draft_id text not null references public.generated_material_drafts(id) on delete cascade,
  feature text not null
    check (feature in (
      'profile_rewrite',
      'share_card',
      'referral_message',
      'bilingual_intro',
      'handover_checklist'
    )),
  event_type text not null
    check (event_type in ('copy_all', 'copy_field', 'mark_reviewed', 'archive')),
  field_key text,
  created_at timestamptz not null default now()
);

create index if not exists generated_material_events_user_id_created_at_idx
  on public.generated_material_events(user_id, created_at desc);

create index if not exists generated_material_events_generated_material_draft_id_idx
  on public.generated_material_events(generated_material_draft_id);

create index if not exists generated_material_events_event_type_idx
  on public.generated_material_events(event_type);

alter table public.generated_material_events enable row level security;

grant select, insert, update, delete on public.generated_material_events to service_role;
revoke all on public.generated_material_events from anon, authenticated;
