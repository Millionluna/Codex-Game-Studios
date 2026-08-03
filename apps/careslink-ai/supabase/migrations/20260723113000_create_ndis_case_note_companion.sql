alter table public.generated_material_drafts
  drop constraint if exists generated_material_drafts_feature_check;

alter table public.generated_material_drafts
  add constraint generated_material_drafts_feature_check
  check (feature in (
    'profile_rewrite',
    'share_card',
    'referral_message',
    'bilingual_intro',
    'handover_checklist',
    'ndis_case_note'
  ));

alter table public.generated_material_events
  drop constraint if exists generated_material_events_feature_check;

alter table public.generated_material_events
  add constraint generated_material_events_feature_check
  check (feature in (
    'profile_rewrite',
    'share_card',
    'referral_message',
    'bilingual_intro',
    'handover_checklist',
    'ndis_case_note'
  ));

create table if not exists public.ndis_case_note_companion_claims (
  token_hash text primary key,
  material jsonb not null,
  expires_at timestamptz not null,
  claimed_by_user_id uuid references auth.users(id) on delete cascade,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ndis_case_note_companion_claims_expires_at_idx
  on public.ndis_case_note_companion_claims(expires_at);

alter table public.ndis_case_note_companion_claims enable row level security;

grant select, insert, update, delete
  on public.ndis_case_note_companion_claims to service_role;
revoke all on public.ndis_case_note_companion_claims from anon, authenticated;

create table if not exists public.template_companion_quota_usage (
  scope text not null
    check (scope in (
      'anonymous_device',
      'anonymous_ip',
      'authenticated_user',
      'authenticated_ip'
    )),
  fingerprint_hash text not null,
  usage_date date not null,
  usage_count integer not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, fingerprint_hash, usage_date)
);

create index if not exists template_companion_quota_usage_date_idx
  on public.template_companion_quota_usage(usage_date);

alter table public.template_companion_quota_usage enable row level security;

grant select, insert, update, delete
  on public.template_companion_quota_usage to service_role;
revoke all on public.template_companion_quota_usage from anon, authenticated;

create table if not exists public.template_companion_events (
  id text primary key,
  event_name text not null
    check (event_name in (
      'companion_viewed',
      'companion_started',
      'companion_generated',
      'companion_save_prompt_clicked',
      'companion_saved'
    )),
  user_id uuid references auth.users(id) on delete set null,
  visitor_hash text,
  source text not null,
  resource_slug text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  locale text not null check (locale in ('en', 'zh-Hans')),
  created_at timestamptz not null default now()
);

create index if not exists template_companion_events_created_at_idx
  on public.template_companion_events(created_at desc);

create index if not exists template_companion_events_name_created_at_idx
  on public.template_companion_events(event_name, created_at desc);

alter table public.template_companion_events enable row level security;

grant select, insert, update, delete
  on public.template_companion_events to service_role;
revoke all on public.template_companion_events from anon, authenticated;

create or replace function public.consume_template_companion_quota(
  p_scope text,
  p_fingerprint_hash text,
  p_usage_date date,
  p_limit integer
)
returns table (allowed boolean, usage_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_count integer;
begin
  if p_limit <= 0 then
    return query select false, 0;
    return;
  end if;

  insert into public.template_companion_quota_usage (
    scope,
    fingerprint_hash,
    usage_date,
    usage_count,
    updated_at
  )
  values (
    p_scope,
    p_fingerprint_hash,
    p_usage_date,
    1,
    now()
  )
  on conflict (scope, fingerprint_hash, usage_date)
  do update
    set usage_count = public.template_companion_quota_usage.usage_count + 1,
        updated_at = now()
    where public.template_companion_quota_usage.usage_count < p_limit
  returning public.template_companion_quota_usage.usage_count
    into v_usage_count;

  if v_usage_count is not null then
    return query select true, v_usage_count;
    return;
  end if;

  select quota.usage_count
    into v_usage_count
    from public.template_companion_quota_usage as quota
    where quota.scope = p_scope
      and quota.fingerprint_hash = p_fingerprint_hash
      and quota.usage_date = p_usage_date;

  return query select false, coalesce(v_usage_count, p_limit);
end;
$$;

create or replace function public.release_template_companion_quota(
  p_scope text,
  p_fingerprint_hash text,
  p_usage_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.template_companion_quota_usage
    set usage_count = greatest(usage_count - 1, 0),
        updated_at = now()
    where scope = p_scope
      and fingerprint_hash = p_fingerprint_hash
      and usage_date = p_usage_date;

  delete from public.template_companion_quota_usage
    where scope = p_scope
      and fingerprint_hash = p_fingerprint_hash
      and usage_date = p_usage_date
      and usage_count = 0;
end;
$$;

create or replace function public.claim_ndis_case_note_companion_output(
  p_token_hash text,
  p_user_id uuid
)
returns setof public.ndis_case_note_companion_claims
language sql
security definer
set search_path = public
as $$
  update public.ndis_case_note_companion_claims
    set claimed_by_user_id = p_user_id,
        claimed_at = coalesce(claimed_at, now())
    where token_hash = p_token_hash
      and expires_at > now()
      and (
        claimed_by_user_id is null
        or claimed_by_user_id = p_user_id
      )
    returning *;
$$;

revoke all on function public.consume_template_companion_quota(
  text,
  text,
  date,
  integer
) from public, anon, authenticated;
grant execute on function public.consume_template_companion_quota(
  text,
  text,
  date,
  integer
) to service_role;

revoke all on function public.release_template_companion_quota(
  text,
  text,
  date
) from public, anon, authenticated;
grant execute on function public.release_template_companion_quota(
  text,
  text,
  date
) to service_role;

revoke all on function public.claim_ndis_case_note_companion_output(
  text,
  uuid
) from public, anon, authenticated;
grant execute on function public.claim_ndis_case_note_companion_output(
  text,
  uuid
) to service_role;
