begin;

-- Read-only, current-session Points preview for the Communication Note page.
-- This function does not create a quote, reserve Points, grant a welcome lot,
-- mutate a wallet or alter the legacy account credit system.
do $careslink_v1_points_preview_preflight$
declare
  v_session_resolver pg_catalog.oid := pg_catalog.to_regprocedure(
    'public.resolve_v1_current_session_status()'
  );
begin
  if exists (
    select 1
    from pg_catalog.pg_proc as overload
    where overload.pronamespace = 'public'::pg_catalog.regnamespace
      and overload.proname = 'get_v1_communication_note_points_preview'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'V1_COMMUNICATION_NOTE_POINTS_PREVIEW_IDENTITY_EXISTS';
  end if;

  if v_session_resolver is null
    or not exists (
      select 1
      from pg_catalog.pg_proc as resolver
      where resolver.oid = v_session_resolver
        and resolver.proowner = 'postgres'::pg_catalog.regrole
        and resolver.prokind = 'f'
        and resolver.prorettype = 'text'::pg_catalog.regtype
        and resolver.prosecdef
        and resolver.provolatile = 'v'
        and not resolver.proretset
        and pg_catalog.cardinality(resolver.proconfig) = 1
        and resolver.proconfig[1] in ('search_path=', 'search_path=""')
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', v_session_resolver, 'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as resolver
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          resolver.proacl,
          pg_catalog.acldefault('f', resolver.proowner)
        )
      ) as resolver_acl
      where resolver.oid = v_session_resolver
        and resolver_acl.grantee = 0
        and resolver_acl.privilege_type = 'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.unnest(
        array['anon', 'service_role', 'authenticator']
      ) as api_role(role_name)
      where pg_catalog.has_function_privilege(
        api_role.role_name, v_session_resolver, 'EXECUTE'
      )
    )
    or pg_catalog.to_regclass('public.service_rate_versions') is null
    or pg_catalog.to_regclass('public.service_rates') is null
    or pg_catalog.to_regclass('public.point_wallets') is null
    or pg_catalog.to_regclass('public.point_lots') is null
    or pg_catalog.to_regclass('public.point_reservations') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_COMMUNICATION_NOTE_POINTS_PREVIEW_PREDECESSOR_UNSAFE';
  end if;
end
$careslink_v1_points_preview_preflight$;

create function public.get_v1_communication_note_points_preview()
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_points_preview$
declare
  v_now pg_catalog.timestamptz := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  v_owner_user_id pg_catalog.uuid := auth.uid();
  v_wallet public.point_wallets%rowtype;
  v_catalog_version pg_catalog.text;
  v_generation_cost_points pg_catalog.int8;
  v_available_points pg_catalog.int8;
  v_reserved_points pg_catalog.int8;
begin
  if v_owner_user_id is null
    or public.resolve_v1_current_session_status() is distinct from 'ACTIVE'
  then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  select rate.catalog_version, rate.points::pg_catalog.int8
  into v_catalog_version, v_generation_cost_points
  from public.service_rates as rate
  join public.service_rate_versions as version
    on version.version = rate.catalog_version
  where rate.catalog_version = '2026-08-09.v1-shadow'
    and rate.service_code = 'note.communication.generate'
    and rate.unit = 'request'
    and rate.points = 20
    and rate.minimum_points is null
    and rate.maximum_points is null
    and rate.status = 'SHADOW'
    and version.status = 'SHADOW';

  if v_catalog_version is null or v_generation_cost_points is null then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  select wallet.*
  into v_wallet
  from public.point_wallets as wallet
  where wallet.owner_user_id = v_owner_user_id
    and wallet.status = 'ACTIVE'
    and wallet.shadow_only is true;

  if not found then
    return pg_catalog.jsonb_build_object(
      'status', 'NOT_READY',
      'unit', 'POINTS',
      'serviceCode', 'note.communication.generate',
      'catalogVersion', v_catalog_version,
      'generationCostPoints', v_generation_cost_points
    );
  end if;

  -- Both aggregates share one statement snapshot. RESERVED remains reserved
  -- until a terminal ledger event restores its exact lot allocations; an
  -- elapsed reservation timestamp alone is not a release.
  select
    coalesce(
      (
        select pg_catalog.sum(lot.remaining_points::pg_catalog.int8) filter (
          where lot.expires_at is null or lot.expires_at > v_now
        )
        from public.point_lots as lot
        where lot.wallet_id = v_wallet.id
          and lot.owner_user_id = v_owner_user_id
          and lot.shadow_only is true
      ),
      0::pg_catalog.int8
    ),
    coalesce(
      (
        select pg_catalog.sum(reservation.points::pg_catalog.int8)
        from public.point_reservations as reservation
        where reservation.wallet_id = v_wallet.id
          and reservation.owner_user_id = v_owner_user_id
          and reservation.status = 'RESERVED'
          and reservation.shadow_only is true
      ),
      0::pg_catalog.int8
    )
  into v_available_points, v_reserved_points;

  if v_available_points < 0
    or v_reserved_points < 0
    or v_available_points > 9007199254740991
    or v_reserved_points > 9007199254740991
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'AVAILABLE',
    'unit', 'POINTS',
    'serviceCode', 'note.communication.generate',
    'catalogVersion', v_catalog_version,
    'generationCostPoints', v_generation_cost_points,
    'availablePoints', v_available_points,
    'reservedPoints', v_reserved_points,
    'canAfford', v_available_points >= v_generation_cost_points
  );
end
$careslink_v1_points_preview$;

alter function public.get_v1_communication_note_points_preview()
  owner to postgres;

-- PostgreSQL gives new functions PUBLIC EXECUTE by default. Remove every Data
-- API path before granting only the authenticated request role.
revoke all on function public.get_v1_communication_note_points_preview()
  from public, anon, authenticated, service_role, authenticator;
grant execute on function public.get_v1_communication_note_points_preview()
  to authenticated;

comment on function public.get_v1_communication_note_points_preview() is
  'Returns a read-only Communication Note rate and current Provider Points balance; creates no quote or reservation.';

commit;
