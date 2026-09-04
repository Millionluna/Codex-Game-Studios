begin;

-- Generic, read-only Points wallet projection for the current authenticated
-- Provider session. It neither creates a wallet nor mutates Points or legacy
-- Credits. RLS remains authoritative because this function is an invoker.
do $careslink_v1_points_wallet_read_preflight$
declare
  v_session_resolver pg_catalog.oid := pg_catalog.to_regprocedure(
    'public.resolve_v1_current_session_status()'
  );
  v_wallets pg_catalog.oid := pg_catalog.to_regclass(
    'public.point_wallets'
  );
  v_lots pg_catalog.oid := pg_catalog.to_regclass(
    'public.point_lots'
  );
  v_reservations pg_catalog.oid := pg_catalog.to_regclass(
    'public.point_reservations'
  );
begin
  if exists (
    select 1
    from pg_catalog.pg_proc as overload
    where overload.pronamespace = 'public'::pg_catalog.regnamespace
      and overload.proname = 'get_v1_points_wallet'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POINTS_WALLET_READ_IDENTITY_EXISTS';
  end if;

  if pg_catalog.to_regclass(
    'public.point_reservations_wallet_reserved_shadow_idx'
  ) is not null then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POINTS_WALLET_READ_INDEX_IDENTITY_EXISTS';
  end if;

  if pg_catalog.to_regclass(
    'public.v1_points_wallet_read_flags'
  ) is not null then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POINTS_WALLET_READ_FLAG_IDENTITY_EXISTS';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as relation
      on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and policy.polname =
        'v1_points_wallet_read_flags_authenticated_select'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POINTS_WALLET_READ_FLAG_POLICY_IDENTITY_EXISTS';
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
      from pg_catalog.unnest(
        array['anon', 'service_role', 'authenticator']
      ) as api_role(role_name)
      where pg_catalog.has_function_privilege(
        api_role.role_name, v_session_resolver, 'EXECUTE'
      )
    )
    or v_wallets is null
    or v_lots is null
    or v_reservations is null
    or exists (
      select 1
      from pg_catalog.unnest(
        array[v_wallets, v_lots, v_reservations]
      ) as required_relation(relation_oid)
      left join pg_catalog.pg_class as relation
        on relation.oid = required_relation.relation_oid
      where relation.relkind not in ('r', 'p')
        or not relation.relrowsecurity
        or not pg_catalog.has_table_privilege(
          'authenticated', required_relation.relation_oid, 'SELECT'
        )
        or pg_catalog.has_table_privilege(
          'authenticated', required_relation.relation_oid, 'INSERT'
        )
        or pg_catalog.has_table_privilege(
          'authenticated', required_relation.relation_oid, 'UPDATE'
        )
        or pg_catalog.has_table_privilege(
          'authenticated', required_relation.relation_oid, 'DELETE'
        )
        or pg_catalog.has_table_privilege(
          'authenticated', required_relation.relation_oid, 'TRUNCATE'
        )
        or pg_catalog.has_table_privilege(
          'authenticated', required_relation.relation_oid, 'REFERENCES'
        )
        or pg_catalog.has_table_privilege(
          'authenticated', required_relation.relation_oid, 'TRIGGER'
        )
    )
    or not exists (
      select 1
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_wallets
        and policy.polname = 'point_wallets_owner_select'
        and policy.polcmd = 'r'
        and policy.polpermissive
        and policy.polroles = array[
          'authenticated'::pg_catalog.regrole::pg_catalog.oid
        ]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          ),
          '[[:space:]]+',
          '',
          'g'
        ) = '((selectauth.uid()asuid)=owner_user_id)'
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_wallets
        and (
          0::pg_catalog.oid = any(policy.polroles)
          or exists (
            select 1
            from pg_catalog.unnest(policy.polroles)
              as policy_role(role_oid)
            join pg_catalog.pg_roles as inherited_role
              on inherited_role.oid = policy_role.role_oid
            where pg_catalog.pg_has_role(
              'authenticated', inherited_role.oid, 'MEMBER'
            )
          )
        )
    ) <> 1
    or not exists (
      select 1
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_lots
        and policy.polname = 'point_lots_owner_select'
        and policy.polcmd = 'r'
        and policy.polpermissive
        and policy.polroles = array[
          'authenticated'::pg_catalog.regrole::pg_catalog.oid
        ]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          ),
          '[[:space:]]+',
          '',
          'g'
        ) = '((selectauth.uid()asuid)=owner_user_id)'
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_lots
        and (
          0::pg_catalog.oid = any(policy.polroles)
          or exists (
            select 1
            from pg_catalog.unnest(policy.polroles)
              as policy_role(role_oid)
            join pg_catalog.pg_roles as inherited_role
              on inherited_role.oid = policy_role.role_oid
            where pg_catalog.pg_has_role(
              'authenticated', inherited_role.oid, 'MEMBER'
            )
          )
        )
    ) <> 1
    or not exists (
      select 1
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_reservations
        and policy.polname = 'point_reservations_owner_select'
        and policy.polcmd = 'r'
        and policy.polpermissive
        and policy.polroles = array[
          'authenticated'::pg_catalog.regrole::pg_catalog.oid
        ]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          ),
          '[[:space:]]+',
          '',
          'g'
        ) = '((selectauth.uid()asuid)=owner_user_id)'
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_reservations
        and (
          0::pg_catalog.oid = any(policy.polroles)
          or exists (
            select 1
            from pg_catalog.unnest(policy.polroles)
              as policy_role(role_oid)
            join pg_catalog.pg_roles as inherited_role
              on inherited_role.oid = policy_role.role_oid
            where pg_catalog.pg_has_role(
              'authenticated', inherited_role.oid, 'MEMBER'
            )
          )
        )
    ) <> 1
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POINTS_WALLET_READ_PREDECESSOR_UNSAFE';
  end if;
end
$careslink_v1_points_wallet_read_preflight$;

-- Applying this migration does not activate the API. Only the migration owner
-- may deliberately flip the single capability row in a separately authorized
-- Preview operation; browser roles retain read-only visibility of this flag.
create table public.v1_points_wallet_read_flags (
  feature_key pg_catalog.text primary key
    check (feature_key = 'points_wallet_read_v1'),
  enabled pg_catalog.bool not null default false,
  preview_only pg_catalog.bool not null default true check (preview_only),
  shadow_only pg_catalog.bool not null default true check (shadow_only)
);

alter table public.v1_points_wallet_read_flags enable row level security;

revoke all on public.v1_points_wallet_read_flags
  from public, anon, authenticated, service_role, authenticator;
grant select on public.v1_points_wallet_read_flags to authenticated;

create policy v1_points_wallet_read_flags_authenticated_select
  on public.v1_points_wallet_read_flags
  for select
  to authenticated
  using (
    feature_key = 'points_wallet_read_v1'
    and preview_only is true
    and shadow_only is true
  );

insert into public.v1_points_wallet_read_flags (
  feature_key,
  enabled,
  preview_only,
  shadow_only
) values (
  'points_wallet_read_v1',
  false,
  true,
  true
);

-- RESERVED is a durable state, not a wall-clock inference. Keep the index
-- predicate aligned with the projection and do not filter on expires_at.
create index point_reservations_wallet_reserved_shadow_idx
  on public.point_reservations(wallet_id, owner_user_id)
  where status = 'RESERVED' and shadow_only is true;

create function public.get_v1_points_wallet()
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $careslink_v1_points_wallet_read$
declare
  v_now pg_catalog.timestamptz := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  v_server_time pg_catalog.text := pg_catalog.to_char(
    v_now at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  v_owner_user_id pg_catalog.uuid := auth.uid();
  v_capability_enabled pg_catalog.bool := false;
  v_available_points pg_catalog.int8;
  v_reserved_points pg_catalog.int8;
begin
  if v_owner_user_id is null
    or public.resolve_v1_current_session_status() is distinct from 'ACTIVE'
  then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  select flag.enabled is true
  into v_capability_enabled
  from public.v1_points_wallet_read_flags as flag
  where flag.feature_key = 'points_wallet_read_v1'
    and flag.enabled is true
    and flag.preview_only is true
    and flag.shadow_only is true;

  if not coalesce(v_capability_enabled, false) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  -- Wallet lookup and both aggregates intentionally share this single SQL
  -- statement and therefore one statement snapshot. An elapsed reservation
  -- stays reserved until a terminal state is durably written.
  select
    coalesce(
      (
        select pg_catalog.sum(lot.remaining_points::pg_catalog.int8)
        from public.point_lots as lot
        where lot.wallet_id = wallet.id
          and lot.owner_user_id = v_owner_user_id
          and lot.shadow_only is true
          and (lot.expires_at is null or lot.expires_at > v_now)
      ),
      0::pg_catalog.int8
    ),
    coalesce(
      (
        select pg_catalog.sum(reservation.points::pg_catalog.int8)
        from public.point_reservations as reservation
        where reservation.wallet_id = wallet.id
          and reservation.owner_user_id = v_owner_user_id
          and reservation.status = 'RESERVED'
          and reservation.shadow_only is true
      ),
      0::pg_catalog.int8
    )
  into v_available_points, v_reserved_points
  from public.point_wallets as wallet
  where wallet.owner_user_id = v_owner_user_id
    and wallet.status = 'ACTIVE'
    and wallet.shadow_only is true;

  if not found then
    return pg_catalog.jsonb_build_object(
      'status', 'NOT_READY',
      'unit', 'POINTS',
      'serverTime', v_server_time,
      'contractVersion', '1.0.0-shadow.1'
    );
  end if;

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
    'serverTime', v_server_time,
    'contractVersion', '1.0.0-shadow.1',
    'availablePoints', v_available_points,
    'reservedPoints', v_reserved_points
  );
end
$careslink_v1_points_wallet_read$;

alter function public.get_v1_points_wallet()
  owner to postgres;

-- PostgreSQL grants new functions to PUBLIC by default. Remove every Data API
-- path first, then expose only this current-session read to authenticated.
revoke all on function public.get_v1_points_wallet()
  from public, anon, authenticated, service_role, authenticator;
grant execute on function public.get_v1_points_wallet()
  to authenticated;

comment on function public.get_v1_points_wallet() is
  'Returns the current active Provider Points wallet totals without exposing identifiers or mutating data.';

commit;
