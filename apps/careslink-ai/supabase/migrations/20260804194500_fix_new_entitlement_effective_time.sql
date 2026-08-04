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

revoke all on function public.get_account_credit_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.get_account_credit_summary(uuid)
  to service_role;
