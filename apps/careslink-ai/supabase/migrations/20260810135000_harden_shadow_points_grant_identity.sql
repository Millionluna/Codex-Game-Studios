begin;

-- Production-unapplied shadow Points hardening, deliberately separate from
-- canonical Mobile/Web sync. This is not a cutover. A non-empty database must
-- pass the fail-closed GRANT/lot preflight before this draft can be approved.

alter table public.point_ledger_entries
  add column if not exists source text;

do $$
begin
  if exists (
    select 1
    from public.point_ledger_entries as ledger
    left join public.point_lots as lot
      on lot.id = ledger.lot_id
      and lot.owner_user_id = ledger.owner_user_id
      and lot.wallet_id = ledger.wallet_id
    where ledger.event = 'GRANT'
      and (ledger.source_reference is null or lot.id is null)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'POINTS_GRANT_IDENTITY_PREFLIGHT_REQUIRED';
  end if;

  if exists (
    select 1
    from public.point_ledger_entries as ledger
    join public.point_lots as lot
      on lot.id = ledger.lot_id
      and lot.owner_user_id = ledger.owner_user_id
      and lot.wallet_id = ledger.wallet_id
    where ledger.event = 'GRANT'
    group by ledger.owner_user_id, lot.source, ledger.source_reference
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'POINTS_GRANT_IDENTITY_PREFLIGHT_REQUIRED';
  end if;
end
$$;

update public.point_ledger_entries as ledger
set source = lot.source
from public.point_lots as lot
where ledger.event = 'GRANT'
  and ledger.lot_id = lot.id
  and ledger.owner_user_id = lot.owner_user_id
  and ledger.wallet_id = lot.wallet_id
  and ledger.source is null;

alter table public.point_ledger_entries
  add constraint point_ledger_entries_source_shape_check check (
    (event = 'GRANT' and source in (
      'WELCOME', 'SUBSCRIPTION', 'TOP_UP', 'LEGACY_MIGRATION', 'ADJUSTMENT'
    ))
    or (event <> 'GRANT' and source is null)
  );

drop index if exists public.point_ledger_grant_reference_idx;
create unique index point_ledger_grant_source_reference_idx
  on public.point_ledger_entries(owner_user_id, event, source, source_reference)
  where event = 'GRANT';

create or replace function public.grant_shadow_point_lot(
  p_user_id uuid,
  p_source text,
  p_source_reference text,
  p_points integer,
  p_expires_at timestamptz default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.point_wallets%rowtype;
  v_lot public.point_lots%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_user_id is null
    or p_source is null
    or p_source not in ('WELCOME', 'SUBSCRIPTION', 'TOP_UP', 'LEGACY_MIGRATION', 'ADJUSTMENT')
    or p_source_reference is null
    or p_source_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or p_points is null or p_points <= 0
    or (p_expires_at is not null and p_expires_at <= p_now)
  then
    raise exception 'Invalid shadow point grant arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  insert into public.point_wallets (owner_user_id, shadow_only, created_at, updated_at)
  values (p_user_id, true, p_now, p_now)
  on conflict (owner_user_id) do nothing;

  select * into v_wallet from public.point_wallets
  where owner_user_id = p_user_id for update;
  select * into v_lot from public.point_lots
  where owner_user_id = p_user_id
    and source = p_source
    and source_reference = p_source_reference
  for update;

  if v_lot.id is not null then
    if v_lot.original_points <> p_points
      or v_lot.expires_at is distinct from p_expires_at
    then
      raise exception 'Shadow point grant idempotency conflict';
    end if;
    return to_jsonb(v_lot);
  end if;

  insert into public.point_lots (
    wallet_id, owner_user_id, source, source_reference,
    original_points, remaining_points, granted_at, expires_at,
    shadow_only, created_at
  ) values (
    v_wallet.id, p_user_id, p_source, p_source_reference,
    p_points, p_points, p_now, p_expires_at, true, p_now
  ) returning * into v_lot;

  insert into public.point_ledger_entries (
    wallet_id, owner_user_id, event, points, delta, lot_id,
    source, source_reference, created_at, shadow_only
  ) values (
    v_wallet.id, p_user_id, 'GRANT', p_points, p_points, v_lot.id,
    p_source, p_source_reference, p_now, true
  );
  return to_jsonb(v_lot);
end;
$$;

revoke all on function public.grant_shadow_point_lot(uuid, text, text, integer, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.grant_shadow_point_lot(uuid, text, text, integer, timestamptz, timestamptz)
  to service_role;

commit;
