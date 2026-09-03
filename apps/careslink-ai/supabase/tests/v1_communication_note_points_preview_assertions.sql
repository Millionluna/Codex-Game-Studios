begin;

-- Rollback-only catalog, authorization and balance-semantics assertions for
-- the read-only Communication Note Points preview. Run only after repository
-- migrations through 20260902052755 on an isolated no-care-data database.
select pg_catalog.set_config(
  'careslink.assertion_entry_role', current_user, true
);

do $careslink_v1_points_preview_catalog$
declare
  v_rpc pg_catalog.oid := pg_catalog.to_regprocedure(
    'public.get_v1_communication_note_points_preview()'
  );
  v_owner pg_catalog.oid;
  v_definition pg_catalog.text;
begin
  select routine.proowner,
    pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid))
  into v_owner, v_definition
  from pg_catalog.pg_proc as routine
  where routine.oid = v_rpc
    and routine.pronamespace = 'public'::pg_catalog.regnamespace
    and routine.proname = 'get_v1_communication_note_points_preview'
    and pg_catalog.pg_get_function_identity_arguments(routine.oid) = ''
    and pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
    and routine.prokind = 'f'
    and routine.prosecdef
    and routine.provolatile = 'v'
    and not routine.proleakproof
    and not routine.proisstrict
    and not routine.proretset
    and pg_catalog.cardinality(routine.proconfig) = 1
    and routine.proconfig[1] in ('search_path=', 'search_path=""')
    and pg_catalog.pg_get_userbyid(routine.proowner) = 'postgres'
    and (
      select language_record.lanname
      from pg_catalog.pg_language as language_record
      where language_record.oid = routine.prolang
    ) = 'plpgsql';

  if v_rpc is null
    or v_owner is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as overload
      where overload.pronamespace = 'public'::pg_catalog.regnamespace
        and overload.proname = 'get_v1_communication_note_points_preview'
    ) <> 1
  then
    raise exception 'Points preview RPC catalog contract failed';
  end if;

  if v_definition !~ 'auth[.]uid[(][)]'
    or v_definition !~ 'public[.]resolve_v1_current_session_status[(][)]'
    or v_definition !~ 'owner_user_id = v_owner_user_id'
    or v_definition !~ 'wallet[.]status = ''active'''
    or v_definition !~ 'wallet[.]shadow_only is true'
    or v_definition !~ 'lot[.]shadow_only is true'
    or v_definition !~ 'reservation[.]status = ''reserved'''
    or v_definition !~ 'reservation[.]shadow_only is true'
    or v_definition !~ '''2026-08-09[.]v1-shadow'''
    or v_definition !~ '''note[.]communication[.]generate'''
    or v_definition !~ 'rate[.]points = 20'
    or v_definition ~ '\m(insert|update|delete|merge|truncate)\M'
    or v_definition ~ 'account_entitlements'
    or v_definition ~ 'credit_ledger'
  then
    raise exception 'Points preview RPC source boundary failed';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.aclexplode(
      coalesce(
        (select routine.proacl
         from pg_catalog.pg_proc as routine
         where routine.oid = v_rpc),
        pg_catalog.acldefault('f', v_owner)
      )
    ) as function_acl
  ) <> 2
    or not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          (select routine.proacl
           from pg_catalog.pg_proc as routine
           where routine.oid = v_rpc),
          pg_catalog.acldefault('f', v_owner)
        )
      ) as function_acl
      where function_acl.grantee = v_owner
        and function_acl.grantor = v_owner
        and function_acl.privilege_type = 'EXECUTE'
        and not function_acl.is_grantable
    )
    or not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          (select routine.proacl
           from pg_catalog.pg_proc as routine
           where routine.oid = v_rpc),
          pg_catalog.acldefault('f', v_owner)
        )
      ) as function_acl
      where function_acl.grantee = 'authenticated'::pg_catalog.regrole
        and function_acl.grantor = v_owner
        and function_acl.privilege_type = 'EXECUTE'
        and not function_acl.is_grantable
    )
    or exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          (select routine.proacl
           from pg_catalog.pg_proc as routine
           where routine.oid = v_rpc),
          pg_catalog.acldefault('f', v_owner)
        )
      ) as function_acl
      where function_acl.grantee not in (
        v_owner, 'authenticated'::pg_catalog.regrole
      )
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', v_rpc, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticator', v_rpc, 'EXECUTE')
  then
    raise exception 'Points preview RPC ACL contract failed';
  end if;
end
$careslink_v1_points_preview_catalog$;

-- Fixed synthetic Auth fixtures only; no care or generated-note data.
delete from auth.sessions
where id in (
  '93110000-0000-4000-8000-000000000001',
  '93110000-0000-4000-8000-000000000099',
  '93210000-0000-4000-8000-000000000002',
  '93310000-0000-4000-8000-000000000003'
);
delete from auth.users
where id in (
  '93100000-0000-4000-8000-000000000001',
  '93200000-0000-4000-8000-000000000002',
  '93300000-0000-4000-8000-000000000003'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_anonymous, created_at, updated_at
) values
  (
    '93100000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'points-preview-a@example.invalid', 'test-only-no-login',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    '93200000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'points-preview-b@example.invalid', 'test-only-no-login',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    '93300000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'points-preview-no-wallet@example.invalid', 'test-only-no-login',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );

insert into auth.sessions (
  id, user_id, created_at, updated_at, not_after
) values
  (
    '93110000-0000-4000-8000-000000000001',
    '93100000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    '93110000-0000-4000-8000-000000000099',
    '93100000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() - interval '1 second'
  ),
  (
    '93210000-0000-4000-8000-000000000002',
    '93200000-0000-4000-8000-000000000002',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    '93310000-0000-4000-8000-000000000003',
    '93300000-0000-4000-8000-000000000003',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  );

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"93100000-0000-4000-8000-000000000001","session_id":"93110000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);

set local role anon;
do $careslink_v1_points_preview_anon$
begin
  begin
    perform public.get_v1_communication_note_points_preview();
    raise exception 'Anon unexpectedly executed Points preview RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_points_preview_anon$;
reset role;

set local role service_role;
do $careslink_v1_points_preview_service_role$
begin
  begin
    perform public.get_v1_communication_note_points_preview();
    raise exception 'Service role unexpectedly executed Points preview RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_points_preview_service_role$;
reset role;

set local role authenticator;
do $careslink_v1_points_preview_authenticator$
begin
  begin
    perform public.get_v1_communication_note_points_preview();
    raise exception 'Authenticator unexpectedly executed Points preview RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_points_preview_authenticator$;
reset role;

-- A valid Provider without a wallet receives only pinned server-owned rate
-- metadata. This proves NOT_READY is distinct from an authorization failure.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"93300000-0000-4000-8000-000000000003","session_id":"93310000-0000-4000-8000-000000000003","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_preview_not_ready$
declare
  v_result pg_catalog.jsonb;
begin
  v_result := public.get_v1_communication_note_points_preview();
  if v_result is distinct from pg_catalog.jsonb_build_object(
    'status', 'NOT_READY',
    'unit', 'POINTS',
    'serviceCode', 'note.communication.generate',
    'catalogVersion', '2026-08-09.v1-shadow',
    'generationCostPoints', 20
  ) then
    raise exception 'Walletless Provider Points preview was not exact NOT_READY';
  end if;
end
$careslink_v1_points_preview_not_ready$;
reset role;

-- Build valid Points ledger history through the existing shadow RPCs. The
-- first A reservation is deliberately still RESERVED after expires_at; the
-- second reaches RELEASED. The active lot therefore has 42 remaining Points.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
do $careslink_v1_points_preview_fixtures$
declare
  v_now pg_catalog.timestamptz := pg_catalog.date_trunc(
    'seconds', pg_catalog.clock_timestamp()
  );
  v_quote pg_catalog.jsonb;
  v_reservation pg_catalog.jsonb;
begin
  perform public.grant_shadow_point_lot(
    '93100000-0000-4000-8000-000000000001',
    'WELCOME', 'TEST_POINTS_PREVIEW_ACTIVE_A', 62, null,
    v_now - interval '3 hours'
  );
  perform public.grant_shadow_point_lot(
    '93100000-0000-4000-8000-000000000001',
    'ADJUSTMENT', 'TEST_POINTS_PREVIEW_EXPIRED_A', 99,
    v_now - interval '1 day', v_now - interval '2 days'
  );

  v_quote := public.create_shadow_point_quote(
    '93100000-0000-4000-8000-000000000001',
    'note.communication.generate',
    'TEST_POINTS_PREVIEW_QUOTE_A_RESERVED', 1, null,
    v_now - interval '2 hours'
  );
  perform public.reserve_shadow_points(
    '93100000-0000-4000-8000-000000000001',
    (v_quote->>'id')::pg_catalog.uuid,
    'TEST_POINTS_PREVIEW_RESERVE_A_EXPIRED',
    v_now - interval '119 minutes'
  );

  v_quote := public.create_shadow_point_quote(
    '93100000-0000-4000-8000-000000000001',
    'content.explain',
    'TEST_POINTS_PREVIEW_QUOTE_A_RELEASED', 1, null, v_now
  );
  v_reservation := public.reserve_shadow_points(
    '93100000-0000-4000-8000-000000000001',
    (v_quote->>'id')::pg_catalog.uuid,
    'TEST_POINTS_PREVIEW_RESERVE_A_RELEASED', v_now
  );
  perform public.release_shadow_points(
    '93100000-0000-4000-8000-000000000001',
    (v_reservation->>'id')::pg_catalog.uuid,
    'TEST_PREVIEW_RELEASE', 'RELEASE', v_now + interval '1 second'
  );

  perform public.grant_shadow_point_lot(
    '93200000-0000-4000-8000-000000000002',
    'WELCOME', 'TEST_POINTS_PREVIEW_ACTIVE_B', 7, null, v_now
  );
end
$careslink_v1_points_preview_fixtures$;

create temporary table points_preview_relation_snapshot (
  relation_name pg_catalog.text primary key,
  row_count pg_catalog.int8 not null,
  rows_json pg_catalog.jsonb not null
) on commit drop;

insert into points_preview_relation_snapshot (
  relation_name, row_count, rows_json
)
select 'point_wallets', pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(wallet) order by wallet.id),
    '[]'::pg_catalog.jsonb
  )
from public.point_wallets as wallet
union all
select 'point_lots', pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(lot) order by lot.id),
    '[]'::pg_catalog.jsonb
  )
from public.point_lots as lot
union all
select 'point_quotes', pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(quote) order by quote.id),
    '[]'::pg_catalog.jsonb
  )
from public.point_quotes as quote
union all
select 'point_reservations', pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(reservation) order by reservation.id
    ),
    '[]'::pg_catalog.jsonb
  )
from public.point_reservations as reservation
union all
select 'point_reservation_allocations', pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(allocation)
      order by allocation.reservation_id, allocation.lot_id
    ),
    '[]'::pg_catalog.jsonb
  )
from public.point_reservation_allocations as allocation
union all
select 'point_ledger_entries', pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ledger) order by ledger.id),
    '[]'::pg_catalog.jsonb
  )
from public.point_ledger_entries as ledger
union all
select 'account_entitlements', pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(entitlement) order by entitlement.id
    ),
    '[]'::pg_catalog.jsonb
  )
from public.account_entitlements as entitlement
union all
select 'credit_ledger', pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(legacy_ledger) order by legacy_ledger.id
    ),
    '[]'::pg_catalog.jsonb
  )
from public.credit_ledger as legacy_ledger;

-- A sees only A: unexpired remaining lots = 42, while the elapsed-but-still-
-- RESERVED Communication Note reservation remains reserved at 20.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"93100000-0000-4000-8000-000000000001","session_id":"93110000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_preview_owner_a$
declare
  v_result pg_catalog.jsonb;
begin
  v_result := public.get_v1_communication_note_points_preview();
  if v_result is distinct from pg_catalog.jsonb_build_object(
    'status', 'AVAILABLE',
    'unit', 'POINTS',
    'serviceCode', 'note.communication.generate',
    'catalogVersion', '2026-08-09.v1-shadow',
    'generationCostPoints', 20,
    'availablePoints', 42,
    'reservedPoints', 20,
    'canAfford', true
  ) then
    raise exception 'Owner A Points preview balance semantics drifted';
  end if;
end
$careslink_v1_points_preview_owner_a$;
reset role;

-- B has an independent wallet. A's lots and reservations must not bleed into
-- the result even though the SECURITY DEFINER owner can read both rows.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"93200000-0000-4000-8000-000000000002","session_id":"93210000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_preview_owner_b$
declare
  v_result pg_catalog.jsonb;
begin
  v_result := public.get_v1_communication_note_points_preview();
  if v_result is distinct from pg_catalog.jsonb_build_object(
    'status', 'AVAILABLE',
    'unit', 'POINTS',
    'serviceCode', 'note.communication.generate',
    'catalogVersion', '2026-08-09.v1-shadow',
    'generationCostPoints', 20,
    'availablePoints', 7,
    'reservedPoints', 0,
    'canAfford', false
  ) then
    raise exception 'Owner B Points preview isolation drifted';
  end if;
end
$careslink_v1_points_preview_owner_b$;
reset role;

-- The same owner with an expired Auth session must fail closed, even though a
-- valid wallet exists and the authenticated database role has EXECUTE.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"93100000-0000-4000-8000-000000000001","session_id":"93110000-0000-4000-8000-000000000099","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_preview_revoked_session$
declare
  v_rejected pg_catalog.bool := false;
begin
  begin
    perform public.get_v1_communication_note_points_preview();
  exception
    when sqlstate 'P0001' then
      if sqlerrm is distinct from 'SESSION_REVOKED' then
        raise;
      end if;
      v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'Expired session unexpectedly received Points preview';
  end if;
end
$careslink_v1_points_preview_revoked_session$;
reset role;

-- Prove every public Points/legacy-credit row is byte-for-byte unchanged by
-- the read-only RPC calls above. Only pg_temp snapshot rows were inserted.
do $careslink_v1_points_preview_no_dml$
declare
  v_changed_relations pg_catalog.text;
begin
  with current_state (relation_name, row_count, rows_json) as (
    select 'point_wallets', pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(wallet) order by wallet.id),
        '[]'::pg_catalog.jsonb
      )
    from public.point_wallets as wallet
    union all
    select 'point_lots', pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(lot) order by lot.id),
        '[]'::pg_catalog.jsonb
      )
    from public.point_lots as lot
    union all
    select 'point_quotes', pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(quote) order by quote.id),
        '[]'::pg_catalog.jsonb
      )
    from public.point_quotes as quote
    union all
    select 'point_reservations', pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(reservation) order by reservation.id
        ),
        '[]'::pg_catalog.jsonb
      )
    from public.point_reservations as reservation
    union all
    select 'point_reservation_allocations', pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(allocation)
          order by allocation.reservation_id, allocation.lot_id
        ),
        '[]'::pg_catalog.jsonb
      )
    from public.point_reservation_allocations as allocation
    union all
    select 'point_ledger_entries', pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ledger) order by ledger.id),
        '[]'::pg_catalog.jsonb
      )
    from public.point_ledger_entries as ledger
    union all
    select 'account_entitlements', pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(entitlement) order by entitlement.id
        ),
        '[]'::pg_catalog.jsonb
      )
    from public.account_entitlements as entitlement
    union all
    select 'credit_ledger', pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(legacy_ledger) order by legacy_ledger.id
        ),
        '[]'::pg_catalog.jsonb
      )
    from public.credit_ledger as legacy_ledger
  )
  select pg_catalog.string_agg(
    snapshot.relation_name, ',' order by snapshot.relation_name
  )
  into v_changed_relations
  from points_preview_relation_snapshot as snapshot
  join current_state as current_relation
    using (relation_name)
  where snapshot.row_count is distinct from current_relation.row_count
    or snapshot.rows_json is distinct from current_relation.rows_json;

  if v_changed_relations is not null then
    raise exception 'Points preview RPC mutated protected relations';
  end if;
end
$careslink_v1_points_preview_no_dml$;

rollback;
