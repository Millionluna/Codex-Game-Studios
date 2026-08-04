alter table public.template_companion_events
  add column if not exists surface text;

alter table public.template_companion_events
  drop constraint if exists template_companion_events_event_name_check;

alter table public.template_companion_events
  add constraint template_companion_events_event_name_check
  check (event_name in (
    'companion_viewed',
    'companion_started',
    'companion_generated',
    'companion_copied',
    'companion_credit_exhausted',
    'companion_offer_viewed',
    'companion_offer_requested',
    'companion_save_prompt_clicked',
    'companion_saved'
  ));

alter table public.template_companion_events
  drop constraint if exists template_companion_events_surface_medium_check;

alter table public.template_companion_events
  add constraint template_companion_events_surface_medium_check
  check (
    surface is null
    or (surface = 'core_product_landing' and utm_medium = 'product_landing')
    or (surface = 'core_download_success' and utm_medium = 'post_download')
  );

create index if not exists template_companion_events_surface_created_at_idx
  on public.template_companion_events(surface, created_at desc)
  where surface is not null;

comment on column public.template_companion_events.surface is
  'Allowlisted Core acquisition surface only; never user-entered content.';
