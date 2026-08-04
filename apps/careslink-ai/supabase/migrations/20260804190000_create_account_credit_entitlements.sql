alter table public.ndis_case_note_companion_claims
  add column if not exists generation_model text,
  add column if not exists input_token_count integer
    check (input_token_count is null or input_token_count >= 0),
  add column if not exists output_token_count integer
    check (output_token_count is null or output_token_count >= 0);

create table if not exists public.account_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null default 'free'
    check (plan_code = 'free'),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'expired')),
  period_start date not null,
  period_end date not null,
  credit_limit integer not null default 3
    check (credit_limit >= 0),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_entitlements_period_check
    check (period_end > period_start),
  constraint account_entitlements_effective_range_check
    check (effective_until is null or effective_until > effective_from),
  unique (user_id, plan_code, period_start)
);

create index if not exists account_entitlements_user_period_idx
  on public.account_entitlements(user_id, period_start desc);

alter table public.account_entitlements enable row level security;

revoke all on public.account_entitlements from public, anon, authenticated;
revoke all on public.account_entitlements from service_role;
grant select on public.account_entitlements to authenticated, service_role;

drop policy if exists account_entitlements_owner_select
  on public.account_entitlements;
create policy account_entitlements_owner_select
  on public.account_entitlements
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid not null
    references public.account_entitlements(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  feature text not null
    check (feature ~ '^[a-z][a-z0-9_]{1,63}$'),
  action text not null
    check (action ~ '^[a-z][a-z0-9_]{1,63}$'),
  event text not null
    check (event in ('grant', 'reserve', 'commit', 'release')),
  units integer not null check (units > 0),
  delta integer not null,
  reservation_id uuid,
  idempotency_key text,
  reservation_expires_at timestamptz,
  result_ref text,
  model text,
  input_token_count integer check (input_token_count is null or input_token_count >= 0),
  output_token_count integer check (output_token_count is null or output_token_count >= 0),
  reason_code text,
  created_at timestamptz not null default now(),
  constraint credit_ledger_period_check
    check (period_end > period_start),
  constraint credit_ledger_event_shape_check check (
    (
      event = 'grant'
      and delta = units
      and reservation_id is null
      and idempotency_key is null
      and reservation_expires_at is null
      and result_ref is null
    )
    or (
      event = 'reserve'
      and delta = -units
      and reservation_id is not null
      and idempotency_key is not null
      and reservation_expires_at is not null
      and result_ref is null
    )
    or (
      event = 'commit'
      and delta = 0
      and reservation_id is not null
      and idempotency_key is not null
      and reservation_expires_at is null
      and result_ref is not null
    )
    or (
      event = 'release'
      and delta = units
      and reservation_id is not null
      and idempotency_key is not null
      and reservation_expires_at is null
      and result_ref is null
      and reason_code is not null
    )
  )
);

create unique index if not exists credit_ledger_one_grant_idx
  on public.credit_ledger(entitlement_id)
  where event = 'grant';

create unique index if not exists credit_ledger_one_reserve_idx
  on public.credit_ledger(reservation_id)
  where event = 'reserve';

create unique index if not exists credit_ledger_one_terminal_idx
  on public.credit_ledger(reservation_id)
  where event in ('commit', 'release');

create unique index if not exists credit_ledger_idempotency_idx
  on public.credit_ledger(
    user_id,
    period_start,
    feature,
    action,
    idempotency_key
  )
  where event = 'reserve';

create index if not exists credit_ledger_user_period_created_idx
  on public.credit_ledger(user_id, period_start desc, created_at desc);

create index if not exists credit_ledger_entitlement_created_idx
  on public.credit_ledger(entitlement_id, created_at desc);

alter table public.credit_ledger enable row level security;

revoke all on public.credit_ledger from public, anon, authenticated;
revoke all on public.credit_ledger from service_role;
grant select on public.credit_ledger to authenticated, service_role;

drop policy if exists credit_ledger_owner_select on public.credit_ledger;
create policy credit_ledger_owner_select
  on public.credit_ledger
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

create or replace function public.account_credit_snapshot(
  p_entitlement_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'planCode', entitlement.plan_code,
    'status', entitlement.status,
    'periodStart', entitlement.period_start,
    'periodEnd', entitlement.period_end,
    'creditLimit', entitlement.credit_limit,
    'remainingCredits', greatest(
      0,
      coalesce(sum(ledger.delta), 0)
    ),
    'usedCredits', coalesce(
      sum(ledger.units) filter (where ledger.event = 'commit'),
      0
    ),
    'reservedCredits', coalesce(
      sum(ledger.units) filter (
        where ledger.event = 'reserve'
          and not exists (
            select 1
            from public.credit_ledger as terminal
            where terminal.reservation_id = ledger.reservation_id
              and terminal.event in ('commit', 'release')
          )
      ),
      0
    )
  )
  from public.account_entitlements as entitlement
  left join public.credit_ledger as ledger
    on ledger.entitlement_id = entitlement.id
  where entitlement.id = p_entitlement_id
  group by entitlement.id;
$$;

create or replace function public.release_expired_account_credit_reservations(
  p_entitlement_id uuid,
  p_now timestamptz default now()
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.credit_ledger (
    user_id,
    entitlement_id,
    period_start,
    period_end,
    feature,
    action,
    event,
    units,
    delta,
    reservation_id,
    idempotency_key,
    reason_code,
    created_at
  )
  select
    reserve_event.user_id,
    reserve_event.entitlement_id,
    reserve_event.period_start,
    reserve_event.period_end,
    reserve_event.feature,
    reserve_event.action,
    'release',
    reserve_event.units,
    reserve_event.units,
    reserve_event.reservation_id,
    reserve_event.idempotency_key,
    'reservation_expired',
    p_now
  from public.credit_ledger as reserve_event
  where reserve_event.entitlement_id = p_entitlement_id
    and reserve_event.event = 'reserve'
    and reserve_event.reservation_expires_at <= p_now
    and not exists (
      select 1
      from public.credit_ledger as terminal
      where terminal.reservation_id = reserve_event.reservation_id
        and terminal.event in ('commit', 'release')
    )
  on conflict do nothing;
$$;

create or replace function public.get_account_credit_summary(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_period_start date := date_trunc('month', v_now at time zone 'UTC')::date;
  v_period_end date := (
    date_trunc('month', v_now at time zone 'UTC') + interval '1 month'
  )::date;
  v_entitlement public.account_entitlements%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || v_period_start::text, 0)
  );

  insert into public.account_entitlements (
    user_id,
    plan_code,
    status,
    period_start,
    period_end,
    credit_limit,
    effective_from,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    'free',
    'active',
    v_period_start,
    v_period_end,
    3,
    v_period_start::timestamptz,
    v_now,
    v_now
  )
  on conflict (user_id, plan_code, period_start) do nothing;

  select *
    into v_entitlement
    from public.account_entitlements
    where user_id = p_user_id
      and plan_code = 'free'
      and period_start = v_period_start;

  if v_entitlement.id is null then
    raise exception 'Unable to create account entitlement';
  end if;

  insert into public.credit_ledger (
    user_id,
    entitlement_id,
    period_start,
    period_end,
    feature,
    action,
    event,
    units,
    delta,
    created_at
  )
  values (
    p_user_id,
    v_entitlement.id,
    v_period_start,
    v_period_end,
    'account',
    'period_grant',
    'grant',
    v_entitlement.credit_limit,
    v_entitlement.credit_limit,
    v_now
  )
  on conflict do nothing;

  perform public.release_expired_account_credit_reservations(
    v_entitlement.id,
    v_now
  );

  return public.account_credit_snapshot(v_entitlement.id);
end;
$$;

create or replace function public.reserve_account_credit(
  p_user_id uuid,
  p_feature text,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_period_start date := date_trunc('month', v_now at time zone 'UTC')::date;
  v_period_end date := (
    date_trunc('month', v_now at time zone 'UTC') + interval '1 month'
  )::date;
  v_entitlement public.account_entitlements%rowtype;
  v_reserve public.credit_ledger%rowtype;
  v_terminal public.credit_ledger%rowtype;
  v_snapshot jsonb;
  v_reservation_id uuid;
begin
  if p_feature !~ '^[a-z][a-z0-9_]{1,63}$'
    or p_action !~ '^[a-z][a-z0-9_]{1,63}$'
    or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception 'Invalid credit reservation arguments';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || v_period_start::text, 0)
  );

  v_snapshot := public.get_account_credit_summary(p_user_id);

  select *
    into v_entitlement
    from public.account_entitlements
    where user_id = p_user_id
      and plan_code = 'free'
      and period_start = v_period_start;

  if v_entitlement.status <> 'active'
    or v_entitlement.effective_from > v_now
    or (
      v_entitlement.effective_until is not null
      and v_entitlement.effective_until <= v_now
    ) then
    return v_snapshot || jsonb_build_object(
      'reservationStatus', 'unavailable',
      'isNew', false
    );
  end if;

  select *
    into v_reserve
    from public.credit_ledger
    where user_id = p_user_id
      and period_start = v_period_start
      and feature = p_feature
      and action = p_action
      and idempotency_key = p_idempotency_key
      and event = 'reserve';

  if v_reserve.id is not null then
    select *
      into v_terminal
      from public.credit_ledger
      where reservation_id = v_reserve.reservation_id
        and event in ('commit', 'release')
      limit 1;

    if v_terminal.event = 'commit' then
      return public.account_credit_snapshot(v_entitlement.id)
        || jsonb_build_object(
          'reservationStatus', 'completed',
          'reservationId', v_reserve.reservation_id,
          'isNew', false,
          'resultRef', v_terminal.result_ref,
          'model', v_terminal.model,
          'inputTokenCount', v_terminal.input_token_count,
          'outputTokenCount', v_terminal.output_token_count
        );
    end if;

    if v_terminal.event = 'release' then
      return public.account_credit_snapshot(v_entitlement.id)
        || jsonb_build_object(
          'reservationStatus', 'released',
          'reservationId', v_reserve.reservation_id,
          'isNew', false,
          'reasonCode', v_terminal.reason_code
        );
    end if;

    return public.account_credit_snapshot(v_entitlement.id)
      || jsonb_build_object(
        'reservationStatus', 'reserved',
        'reservationId', v_reserve.reservation_id,
        'isNew', false
      );
  end if;

  v_snapshot := public.account_credit_snapshot(v_entitlement.id);

  if coalesce((v_snapshot ->> 'remainingCredits')::integer, 0) < 1 then
    return v_snapshot || jsonb_build_object(
      'reservationStatus', 'exhausted',
      'isNew', false
    );
  end if;

  v_reservation_id := gen_random_uuid();

  insert into public.credit_ledger (
    user_id,
    entitlement_id,
    period_start,
    period_end,
    feature,
    action,
    event,
    units,
    delta,
    reservation_id,
    idempotency_key,
    reservation_expires_at,
    created_at
  )
  values (
    p_user_id,
    v_entitlement.id,
    v_period_start,
    v_period_end,
    p_feature,
    p_action,
    'reserve',
    1,
    -1,
    v_reservation_id,
    p_idempotency_key,
    v_now + interval '15 minutes',
    v_now
  );

  return public.account_credit_snapshot(v_entitlement.id)
    || jsonb_build_object(
      'reservationStatus', 'reserved',
      'reservationId', v_reservation_id,
      'isNew', true
    );
end;
$$;

create or replace function public.commit_account_credit(
  p_user_id uuid,
  p_reservation_id uuid,
  p_result_ref text,
  p_model text,
  p_input_token_count integer,
  p_output_token_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_entitlement public.account_entitlements%rowtype;
  v_reserve public.credit_ledger%rowtype;
  v_terminal public.credit_ledger%rowtype;
begin
  if p_result_ref !~ '^[a-f0-9]{64}$'
    or p_input_token_count < 0
    or p_output_token_count < 0 then
    raise exception 'Invalid credit commit arguments';
  end if;

  select entitlement.*
    into v_entitlement
    from public.account_entitlements as entitlement
    join public.credit_ledger as reserve_event
      on reserve_event.entitlement_id = entitlement.id
    where reserve_event.user_id = p_user_id
      and reserve_event.reservation_id = p_reservation_id
      and reserve_event.event = 'reserve';

  if v_entitlement.id is null then
    return jsonb_build_object(
      'reservationStatus', 'not_found',
      'isNew', false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_user_id::text || ':' || v_entitlement.period_start::text,
      0
    )
  );

  perform public.release_expired_account_credit_reservations(
    v_entitlement.id,
    v_now
  );

  select *
    into v_reserve
    from public.credit_ledger
    where user_id = p_user_id
      and reservation_id = p_reservation_id
      and event = 'reserve';

  select *
    into v_terminal
    from public.credit_ledger
    where reservation_id = p_reservation_id
      and event in ('commit', 'release')
    limit 1;

  if v_terminal.event = 'release' then
    return public.account_credit_snapshot(v_entitlement.id)
      || jsonb_build_object(
        'reservationStatus', 'released',
        'reservationId', p_reservation_id,
        'isNew', false,
        'reasonCode', v_terminal.reason_code
      );
  end if;

  if v_terminal.event = 'commit' then
    return public.account_credit_snapshot(v_entitlement.id)
      || jsonb_build_object(
        'reservationStatus', 'completed',
        'reservationId', p_reservation_id,
        'isNew', false,
        'resultRef', v_terminal.result_ref,
        'model', v_terminal.model,
        'inputTokenCount', v_terminal.input_token_count,
        'outputTokenCount', v_terminal.output_token_count
      );
  end if;

  insert into public.credit_ledger (
    user_id,
    entitlement_id,
    period_start,
    period_end,
    feature,
    action,
    event,
    units,
    delta,
    reservation_id,
    idempotency_key,
    result_ref,
    model,
    input_token_count,
    output_token_count,
    created_at
  )
  values (
    v_reserve.user_id,
    v_reserve.entitlement_id,
    v_reserve.period_start,
    v_reserve.period_end,
    v_reserve.feature,
    v_reserve.action,
    'commit',
    v_reserve.units,
    0,
    v_reserve.reservation_id,
    v_reserve.idempotency_key,
    p_result_ref,
    left(p_model, 120),
    p_input_token_count,
    p_output_token_count,
    v_now
  )
  on conflict do nothing;

  return public.account_credit_snapshot(v_entitlement.id)
    || jsonb_build_object(
      'reservationStatus', 'completed',
      'reservationId', p_reservation_id,
      'isNew', false,
      'resultRef', p_result_ref,
      'model', left(p_model, 120),
      'inputTokenCount', p_input_token_count,
      'outputTokenCount', p_output_token_count
    );
end;
$$;

create or replace function public.release_account_credit(
  p_user_id uuid,
  p_reservation_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_entitlement public.account_entitlements%rowtype;
  v_reserve public.credit_ledger%rowtype;
  v_terminal public.credit_ledger%rowtype;
begin
  if p_reason_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'Invalid credit release reason';
  end if;

  select entitlement.*
    into v_entitlement
    from public.account_entitlements as entitlement
    join public.credit_ledger as reserve_event
      on reserve_event.entitlement_id = entitlement.id
    where reserve_event.user_id = p_user_id
      and reserve_event.reservation_id = p_reservation_id
      and reserve_event.event = 'reserve';

  if v_entitlement.id is null then
    return jsonb_build_object(
      'reservationStatus', 'not_found',
      'isNew', false
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_user_id::text || ':' || v_entitlement.period_start::text,
      0
    )
  );

  select *
    into v_reserve
    from public.credit_ledger
    where user_id = p_user_id
      and reservation_id = p_reservation_id
      and event = 'reserve';

  select *
    into v_terminal
    from public.credit_ledger
    where reservation_id = p_reservation_id
      and event in ('commit', 'release')
    limit 1;

  if v_terminal.event = 'commit' then
    return public.account_credit_snapshot(v_entitlement.id)
      || jsonb_build_object(
        'reservationStatus', 'completed',
        'reservationId', p_reservation_id,
        'isNew', false,
        'resultRef', v_terminal.result_ref,
        'model', v_terminal.model,
        'inputTokenCount', v_terminal.input_token_count,
        'outputTokenCount', v_terminal.output_token_count
      );
  end if;

  if v_terminal.event = 'release' then
    return public.account_credit_snapshot(v_entitlement.id)
      || jsonb_build_object(
        'reservationStatus', 'released',
        'reservationId', p_reservation_id,
        'isNew', false,
        'reasonCode', v_terminal.reason_code
      );
  end if;

  insert into public.credit_ledger (
    user_id,
    entitlement_id,
    period_start,
    period_end,
    feature,
    action,
    event,
    units,
    delta,
    reservation_id,
    idempotency_key,
    reason_code,
    created_at
  )
  values (
    v_reserve.user_id,
    v_reserve.entitlement_id,
    v_reserve.period_start,
    v_reserve.period_end,
    v_reserve.feature,
    v_reserve.action,
    'release',
    v_reserve.units,
    v_reserve.units,
    v_reserve.reservation_id,
    v_reserve.idempotency_key,
    p_reason_code,
    v_now
  )
  on conflict do nothing;

  return public.account_credit_snapshot(v_entitlement.id)
    || jsonb_build_object(
      'reservationStatus', 'released',
      'reservationId', p_reservation_id,
      'isNew', false,
      'reasonCode', p_reason_code
    );
end;
$$;

revoke all on function public.account_credit_snapshot(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.release_expired_account_credit_reservations(
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.get_account_credit_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.get_account_credit_summary(uuid)
  to service_role;

revoke all on function public.reserve_account_credit(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_account_credit(uuid, text, text, text)
  to service_role;

revoke all on function public.commit_account_credit(
  uuid,
  uuid,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.commit_account_credit(
  uuid,
  uuid,
  text,
  text,
  integer,
  integer
) to service_role;

revoke all on function public.release_account_credit(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_account_credit(uuid, uuid, text)
  to service_role;
