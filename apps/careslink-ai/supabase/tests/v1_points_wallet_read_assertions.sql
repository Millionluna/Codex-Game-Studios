begin;

-- Rollback-only catalog, authorization and balance assertions for the generic
-- current-session Points wallet read. Run only after repository migrations
-- through 20260904054437 on an isolated database with no care data.
select pg_catalog.set_config(
  'careslink.assertion_entry_role', current_user, true
);

do $careslink_v1_points_wallet_read_catalog$
declare
  v_rpc pg_catalog.oid := pg_catalog.to_regprocedure(
    'public.get_v1_points_wallet()'
  );
  v_owner pg_catalog.oid;
  v_definition pg_catalog.text;
  v_index pg_catalog.oid := pg_catalog.to_regclass(
    'public.point_reservations_wallet_reserved_shadow_idx'
  );
  v_index_definition pg_catalog.text;
  v_index_predicate pg_catalog.text;
  v_flags pg_catalog.oid := pg_catalog.to_regclass(
    'public.v1_points_wallet_read_flags'
  );
  v_policy_target record;
begin
  select
    routine.proowner,
    pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid))
  into v_owner, v_definition
  from pg_catalog.pg_proc as routine
  where routine.oid = v_rpc
    and routine.pronamespace = 'public'::pg_catalog.regnamespace
    and routine.proname = 'get_v1_points_wallet'
    and pg_catalog.pg_get_function_identity_arguments(routine.oid) = ''
    and pg_catalog.pg_get_function_result(routine.oid) = 'jsonb'
    and routine.prokind = 'f'
    and not routine.prosecdef
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
        and overload.proname = 'get_v1_points_wallet'
    ) <> 1
  then
    raise exception 'Points wallet read RPC catalog contract failed';
  end if;

  if v_definition !~ 'auth[.]uid[(][)]'
    or v_definition !~ 'public[.]resolve_v1_current_session_status[(][)]'
    or v_definition !~ 'wallet[.]owner_user_id = v_owner_user_id'
    or v_definition !~ 'wallet[.]status = ''active'''
    or v_definition !~ 'wallet[.]shadow_only is true'
    or v_definition !~ 'lot[.]owner_user_id = v_owner_user_id'
    or v_definition !~ 'lot[.]shadow_only is true'
    or v_definition !~ 'lot[.]expires_at > v_now'
    or v_definition !~ 'reservation[.]owner_user_id = v_owner_user_id'
    or v_definition !~ 'reservation[.]status = ''reserved'''
    or v_definition !~ 'reservation[.]shadow_only is true'
    or v_definition ~ 'reservation[.]expires_at'
    or v_definition !~ '''contractversion'', ''1[.]0[.]0-shadow[.]1'''
    or v_definition !~ '''servertime'', v_server_time'
    or v_definition !~ 'public[.]v1_points_wallet_read_flags'
    or v_definition !~ 'flag[.]feature_key = ''points_wallet_read_v1'''
    or v_definition !~ 'flag[.]enabled is true'
    or v_definition !~ 'flag[.]preview_only is true'
    or v_definition !~ 'flag[.]shadow_only is true'
    or v_definition !~ '''product_api_disabled'''
    or v_definition ~ '\m(insert|update|delete|merge|truncate)\M'
    or v_definition ~ 'account_entitlements'
    or v_definition ~ 'credit_ledger'
    or v_definition ~ '''(owneruserid|sessionid|walletid|lotid|quoteid|reservationid|ledgerid|email)'''
  then
    raise exception 'Points wallet read RPC source boundary failed';
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
        v_owner,
        'authenticated'::pg_catalog.regrole
      )
    )
    or not pg_catalog.has_function_privilege(
      'authenticated', v_rpc, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticator', v_rpc, 'EXECUTE')
  then
    raise exception 'Points wallet read RPC ACL contract failed';
  end if;

  if v_flags is null
    or not exists (
      select 1
      from pg_catalog.pg_class as relation
      where relation.oid = v_flags
        and relation.relkind = 'r'
        and relation.relowner = 'postgres'::pg_catalog.regrole
        and relation.relrowsecurity
    )
    or not pg_catalog.has_table_privilege(
      'authenticated', v_flags, 'SELECT'
    )
    or exists (
      select 1
      from pg_catalog.unnest(
        array['anon', 'service_role', 'authenticator']
      ) as denied_role(role_name)
      cross join pg_catalog.unnest(
        array[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE',
          'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ]
      ) as denied_privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        denied_role.role_name,
        v_flags,
        denied_privilege.privilege_name
      )
    )
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) as table_acl
      where relation.oid = v_flags
        and table_acl.grantee = 0
    )
    or exists (
      select 1
      from pg_catalog.unnest(
        array[
          'INSERT', 'UPDATE', 'DELETE',
          'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ]
      ) as write_privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        'authenticated', v_flags, write_privilege.privilege_name
      )
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_flags
    ) <> 1
    or not exists (
      select 1
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_flags
        and policy.polname =
          'v1_points_wallet_read_flags_authenticated_select'
        and policy.polcmd = 'r'
        and policy.polpermissive
        and policy.polroles = array[
          'authenticated'::pg_catalog.regrole::pg_catalog.oid
        ]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          ),
          '[[:space:]()]',
          '',
          'g'
        ) =
          'feature_key=''points_wallet_read_v1''::textandpreview_onlyistrueandshadow_onlyistrue'
    )
    or (
      select pg_catalog.count(*)
      from public.v1_points_wallet_read_flags as flag
    ) <> 1
    or not exists (
      select 1
      from public.v1_points_wallet_read_flags as flag
      where flag.feature_key = 'points_wallet_read_v1'
        and flag.enabled is false
        and flag.preview_only is true
        and flag.shadow_only is true
    )
  then
    raise exception 'Points wallet database capability contract failed';
  end if;

  -- SECURITY INVOKER is only useful if every predecessor relation retains its
  -- exact single owner policy and authenticated has no direct write privilege.
  for v_policy_target in
    select *
    from (
      values
        (
          'public.point_wallets'::pg_catalog.regclass::pg_catalog.oid,
          'point_wallets_owner_select'::pg_catalog.text
        ),
        (
          'public.point_lots'::pg_catalog.regclass::pg_catalog.oid,
          'point_lots_owner_select'::pg_catalog.text
        ),
        (
          'public.point_reservations'::pg_catalog.regclass::pg_catalog.oid,
          'point_reservations_owner_select'::pg_catalog.text
        )
    ) as expected_policy(relation_oid, policy_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_class as relation
      where relation.oid = v_policy_target.relation_oid
        and relation.relkind in ('r', 'p')
        and relation.relrowsecurity
    )
      or not pg_catalog.has_table_privilege(
        'authenticated', v_policy_target.relation_oid, 'SELECT'
      )
      or pg_catalog.has_table_privilege(
        'authenticated', v_policy_target.relation_oid, 'INSERT'
      )
      or pg_catalog.has_table_privilege(
        'authenticated', v_policy_target.relation_oid, 'UPDATE'
      )
      or pg_catalog.has_table_privilege(
        'authenticated', v_policy_target.relation_oid, 'DELETE'
      )
      or pg_catalog.has_table_privilege(
        'authenticated', v_policy_target.relation_oid, 'TRUNCATE'
      )
      or pg_catalog.has_table_privilege(
        'authenticated', v_policy_target.relation_oid, 'REFERENCES'
      )
      or pg_catalog.has_table_privilege(
        'authenticated', v_policy_target.relation_oid, 'TRIGGER'
      )
      or (
        select pg_catalog.count(*)
        from pg_catalog.pg_policy as policy
        where policy.polrelid = v_policy_target.relation_oid
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
        where policy.polrelid = v_policy_target.relation_oid
          and policy.polname = v_policy_target.policy_name
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
    then
      raise exception
        'Points wallet predecessor RLS contract failed for %',
        v_policy_target.policy_name;
    end if;
  end loop;

  select
    pg_catalog.lower(pg_catalog.pg_get_indexdef(index_record.indexrelid)),
    pg_catalog.lower(
      pg_catalog.pg_get_expr(
        index_record.indpred,
        index_record.indrelid
      )
    )
  into v_index_definition, v_index_predicate
  from pg_catalog.pg_index as index_record
  where index_record.indexrelid = v_index
    and index_record.indrelid = 'public.point_reservations'::pg_catalog.regclass
    and index_record.indisvalid
    and index_record.indisready
    and not index_record.indisunique
    and index_record.indpred is not null;

  if v_index is null
    or v_index_definition !~ '[(]wallet_id, owner_user_id[)]'
    or v_index_predicate !~ 'status = ''reserved''::text'
    or v_index_predicate !~ 'shadow_only is true'
    or v_index_predicate ~ 'expires_at'
  then
    raise exception 'Points wallet reserved partial index contract failed';
  end if;
end
$careslink_v1_points_wallet_read_catalog$;

-- Fixed synthetic Auth fixtures only; no care or generated-note data.
delete from auth.sessions
where id in (
  '94110000-0000-4000-8000-000000000001',
  '94110000-0000-4000-8000-000000000099',
  '94210000-0000-4000-8000-000000000002',
  '94310000-0000-4000-8000-000000000003'
);
delete from auth.users
where id in (
  '94100000-0000-4000-8000-000000000001',
  '94200000-0000-4000-8000-000000000002',
  '94300000-0000-4000-8000-000000000003'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_anonymous,
  created_at,
  updated_at
) values
  (
    '94100000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'points-wallet-a@example.invalid',
    'test-only-no-login',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb,
    false,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  ),
  (
    '94200000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'points-wallet-b@example.invalid',
    'test-only-no-login',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb,
    false,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  ),
  (
    '94300000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'points-wallet-none@example.invalid',
    'test-only-no-login',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb,
    false,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

insert into auth.sessions (
  id,
  user_id,
  created_at,
  updated_at,
  not_after
) values
  (
    '94110000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),
    null
  ),
  (
    '94110000-0000-4000-8000-000000000099',
    '94100000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() - interval '1 second'
  ),
  (
    '94210000-0000-4000-8000-000000000002',
    '94200000-0000-4000-8000-000000000002',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),
    null
  ),
  (
    '94310000-0000-4000-8000-000000000003',
    '94300000-0000-4000-8000-000000000003',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),
    null
  );

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94100000-0000-4000-8000-000000000001","session_id":"94110000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);

set local role anon;
do $careslink_v1_points_wallet_read_anon$
begin
  begin
    perform public.get_v1_points_wallet();
    raise exception 'Anon unexpectedly executed Points wallet read RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_points_wallet_read_anon$;
reset role;

set local role service_role;
do $careslink_v1_points_wallet_read_service_role$
begin
  begin
    perform public.get_v1_points_wallet();
    raise exception 'Service role unexpectedly executed Points wallet read RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_points_wallet_read_service_role$;
reset role;

set local role authenticator;
do $careslink_v1_points_wallet_read_authenticator$
begin
  begin
    perform public.get_v1_points_wallet();
    raise exception 'Authenticator unexpectedly executed Points wallet read RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_points_wallet_read_authenticator$;
reset role;

-- A valid session cannot bypass the database-owned default-off capability,
-- even by calling the Supabase RPC directly instead of the Next route.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94300000-0000-4000-8000-000000000003","session_id":"94310000-0000-4000-8000-000000000003","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_wallet_read_flag_off$
declare
  v_rejected pg_catalog.bool := false;
begin
  begin
    perform public.get_v1_points_wallet();
  exception
    when sqlstate 'P0001' then
      if sqlerrm is distinct from 'PRODUCT_API_DISABLED' then
        raise;
      end if;
      v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'Default-off Points wallet RPC unexpectedly executed';
  end if;
end
$careslink_v1_points_wallet_read_flag_off$;
reset role;

-- TEST_ONLY: the migration actor enables the single Preview/shadow capability
-- inside this outer rollback transaction. API roles have no write privilege.
do $careslink_v1_points_wallet_read_enable$
declare
  v_updated pg_catalog.int8;
begin
  if current_user is distinct from pg_catalog.current_setting(
    'careslink.assertion_entry_role'
  ) then
    raise exception 'Points wallet capability actor drifted';
  end if;

  update public.v1_points_wallet_read_flags as flag
  set enabled = true
  where flag.feature_key = 'points_wallet_read_v1'
    and flag.enabled is false
    and flag.preview_only is true
    and flag.shadow_only is true;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'Points wallet capability was not enabled exactly once';
  end if;
end
$careslink_v1_points_wallet_read_enable$;

-- A valid Provider without a wallet receives a bounded, identifier-free DTO.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94300000-0000-4000-8000-000000000003","session_id":"94310000-0000-4000-8000-000000000003","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_wallet_read_not_ready$
declare
  v_result pg_catalog.jsonb;
  v_keys pg_catalog.text[];
  v_before pg_catalog.timestamptz := pg_catalog.clock_timestamp();
  v_after pg_catalog.timestamptz;
begin
  v_result := public.get_v1_points_wallet();
  v_after := pg_catalog.clock_timestamp();

  select pg_catalog.array_agg(result_key.key order by result_key.key)
  into v_keys
  from pg_catalog.jsonb_object_keys(v_result) as result_key(key);

  if v_keys is distinct from array[
      'contractVersion', 'serverTime', 'status', 'unit'
    ]::pg_catalog.text[]
    or v_result->>'status' is distinct from 'NOT_READY'
    or v_result->>'unit' is distinct from 'POINTS'
    or v_result->>'contractVersion' is distinct from '1.0.0-shadow.1'
    or v_result->>'serverTime'
      !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or (v_result->>'serverTime')::pg_catalog.timestamptz
      < pg_catalog.date_trunc('seconds', v_before)
    or (v_result->>'serverTime')::pg_catalog.timestamptz > v_after
    or v_result::pg_catalog.text ~
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  then
    raise exception 'Walletless Provider Points response was not exact and safe';
  end if;
end
$careslink_v1_points_wallet_read_not_ready$;
reset role;

-- Create only synthetic Points state through the existing server-only RPCs.
-- The first reservation is deliberately still RESERVED after expires_at.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
do $careslink_v1_points_wallet_read_fixtures$
declare
  v_now pg_catalog.timestamptz := pg_catalog.date_trunc(
    'seconds',
    pg_catalog.clock_timestamp()
  );
  v_quote pg_catalog.jsonb;
  v_reservation pg_catalog.jsonb;
begin
  perform public.grant_shadow_point_lot(
    '94100000-0000-4000-8000-000000000001',
    'WELCOME',
    'TEST_POINTS_WALLET_ACTIVE_A',
    62,
    null,
    v_now - interval '3 hours'
  );
  perform public.grant_shadow_point_lot(
    '94100000-0000-4000-8000-000000000001',
    'ADJUSTMENT',
    'TEST_POINTS_WALLET_EXPIRED_A',
    99,
    v_now - interval '1 day',
    v_now - interval '2 days'
  );

  v_quote := public.create_shadow_point_quote(
    '94100000-0000-4000-8000-000000000001',
    'note.communication.generate',
    'TEST_POINTS_WALLET_QUOTE_A_RESERVED',
    1,
    null,
    v_now - interval '2 hours'
  );
  perform public.reserve_shadow_points(
    '94100000-0000-4000-8000-000000000001',
    (v_quote->>'id')::pg_catalog.uuid,
    'TEST_POINTS_WALLET_RESERVE_A_EXPIRED',
    v_now - interval '119 minutes'
  );

  v_quote := public.create_shadow_point_quote(
    '94100000-0000-4000-8000-000000000001',
    'content.explain',
    'TEST_POINTS_WALLET_QUOTE_A_RELEASED',
    1,
    null,
    v_now
  );
  v_reservation := public.reserve_shadow_points(
    '94100000-0000-4000-8000-000000000001',
    (v_quote->>'id')::pg_catalog.uuid,
    'TEST_POINTS_WALLET_RESERVE_A_RELEASED',
    v_now
  );
  perform public.release_shadow_points(
    '94100000-0000-4000-8000-000000000001',
    (v_reservation->>'id')::pg_catalog.uuid,
    'TEST_POINTS_WALLET_RELEASE',
    'RELEASE',
    v_now + interval '1 second'
  );

  perform public.grant_shadow_point_lot(
    '94200000-0000-4000-8000-000000000002',
    'WELCOME',
    'TEST_POINTS_WALLET_ACTIVE_B',
    7,
    null,
    v_now
  );
end
$careslink_v1_points_wallet_read_fixtures$;

create temporary table points_wallet_read_relation_snapshot (
  relation_name pg_catalog.text primary key,
  row_count pg_catalog.int8 not null,
  rows_json pg_catalog.jsonb not null
) on commit drop;

insert into points_wallet_read_relation_snapshot (
  relation_name,
  row_count,
  rows_json
)
select
  'point_wallets',
  pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(wallet) order by wallet.id),
    '[]'::pg_catalog.jsonb
  )
from public.point_wallets as wallet
union all
select
  'point_lots',
  pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(lot) order by lot.id),
    '[]'::pg_catalog.jsonb
  )
from public.point_lots as lot
union all
select
  'point_quotes',
  pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(quote) order by quote.id),
    '[]'::pg_catalog.jsonb
  )
from public.point_quotes as quote
union all
select
  'point_reservations',
  pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(reservation) order by reservation.id
    ),
    '[]'::pg_catalog.jsonb
  )
from public.point_reservations as reservation
union all
select
  'point_reservation_allocations',
  pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(allocation)
      order by allocation.reservation_id, allocation.lot_id
    ),
    '[]'::pg_catalog.jsonb
  )
from public.point_reservation_allocations as allocation
union all
select
  'point_ledger_entries',
  pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ledger) order by ledger.id),
    '[]'::pg_catalog.jsonb
  )
from public.point_ledger_entries as ledger
union all
select
  'account_entitlements',
  pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(entitlement) order by entitlement.id
    ),
    '[]'::pg_catalog.jsonb
  )
from public.account_entitlements as entitlement
union all
select
  'credit_ledger',
  pg_catalog.count(*),
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(legacy_ledger) order by legacy_ledger.id
    ),
    '[]'::pg_catalog.jsonb
  )
from public.credit_ledger as legacy_ledger;

-- A sees only A. The expired lot is excluded, but elapsed RESERVED remains 20.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94100000-0000-4000-8000-000000000001","session_id":"94110000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_wallet_read_owner_a$
declare
  v_result pg_catalog.jsonb;
  v_keys pg_catalog.text[];
begin
  v_result := public.get_v1_points_wallet();
  select pg_catalog.array_agg(result_key.key order by result_key.key)
  into v_keys
  from pg_catalog.jsonb_object_keys(v_result) as result_key(key);

  if v_keys is distinct from array[
      'availablePoints',
      'contractVersion',
      'reservedPoints',
      'serverTime',
      'status',
      'unit'
    ]::pg_catalog.text[]
    or v_result->>'status' is distinct from 'AVAILABLE'
    or v_result->>'unit' is distinct from 'POINTS'
    or v_result->>'contractVersion' is distinct from '1.0.0-shadow.1'
    or v_result->>'availablePoints' is distinct from '42'
    or v_result->>'reservedPoints' is distinct from '20'
    or pg_catalog.jsonb_typeof(v_result->'availablePoints')
      is distinct from 'number'
    or pg_catalog.jsonb_typeof(v_result->'reservedPoints')
      is distinct from 'number'
    or v_result->>'serverTime'
      !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or v_result::pg_catalog.text ~
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  then
    raise exception 'Owner A Points wallet balance or response boundary drifted';
  end if;
end
$careslink_v1_points_wallet_read_owner_a$;
reset role;

-- B cannot observe A despite sharing the same invoker function definition.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94200000-0000-4000-8000-000000000002","session_id":"94210000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_wallet_read_owner_b$
declare
  v_result pg_catalog.jsonb;
begin
  v_result := public.get_v1_points_wallet();
  if v_result->>'status' is distinct from 'AVAILABLE'
    or v_result->>'availablePoints' is distinct from '7'
    or v_result->>'reservedPoints' is distinct from '0'
    or v_result::pg_catalog.text ~
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  then
    raise exception 'Owner B Points wallet isolation drifted';
  end if;
end
$careslink_v1_points_wallet_read_owner_b$;
reset role;

-- A stale Auth session cannot use a valid owner UUID to recover wallet data.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"94100000-0000-4000-8000-000000000001","session_id":"94110000-0000-4000-8000-000000000099","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_wallet_read_revoked_session$
declare
  v_rejected pg_catalog.bool := false;
begin
  begin
    perform public.get_v1_points_wallet();
  exception
    when sqlstate 'P0001' then
      if sqlerrm is distinct from 'SESSION_REVOKED' then
        raise;
      end if;
      v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'Expired session unexpectedly received Points wallet data';
  end if;
end
$careslink_v1_points_wallet_read_revoked_session$;
reset role;

-- Even the authenticated database role must fail without an authenticated UID.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","is_anonymous":false}',
  true
);
set local role authenticated;
do $careslink_v1_points_wallet_read_missing_uid$
declare
  v_rejected pg_catalog.bool := false;
begin
  begin
    perform public.get_v1_points_wallet();
  exception
    when sqlstate 'P0001' then
      if sqlerrm is distinct from 'SESSION_REVOKED' then
        raise;
      end if;
      v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'Missing UID unexpectedly received Points wallet data';
  end if;
end
$careslink_v1_points_wallet_read_missing_uid$;
reset role;

-- Restore the exact default-off capability state before the final assertions;
-- the enclosing transaction then rolls every synthetic mutation back.
do $careslink_v1_points_wallet_read_disable$
declare
  v_updated pg_catalog.int8;
begin
  if current_user is distinct from pg_catalog.current_setting(
    'careslink.assertion_entry_role'
  ) then
    raise exception 'Points wallet capability reset actor drifted';
  end if;

  update public.v1_points_wallet_read_flags as flag
  set enabled = false
  where flag.feature_key = 'points_wallet_read_v1'
    and flag.enabled is true
    and flag.preview_only is true
    and flag.shadow_only is true;
  get diagnostics v_updated = row_count;

  if v_updated <> 1
    or (
      select pg_catalog.count(*)
      from public.v1_points_wallet_read_flags as flag
    ) <> 1
    or not exists (
      select 1
      from public.v1_points_wallet_read_flags as flag
      where flag.feature_key = 'points_wallet_read_v1'
        and flag.enabled is false
        and flag.preview_only is true
        and flag.shadow_only is true
    )
  then
    raise exception 'Points wallet capability did not return to default-off';
  end if;
end
$careslink_v1_points_wallet_read_disable$;

-- Every Points and legacy-Credit row must remain byte-for-byte unchanged by
-- all wallet reads and denied attempts above.
do $careslink_v1_points_wallet_read_no_dml$
declare
  v_changed_relations pg_catalog.text;
begin
  with current_state (relation_name, row_count, rows_json) as (
    select
      'point_wallets',
      pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(wallet) order by wallet.id),
        '[]'::pg_catalog.jsonb
      )
    from public.point_wallets as wallet
    union all
    select
      'point_lots',
      pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(lot) order by lot.id),
        '[]'::pg_catalog.jsonb
      )
    from public.point_lots as lot
    union all
    select
      'point_quotes',
      pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(quote) order by quote.id),
        '[]'::pg_catalog.jsonb
      )
    from public.point_quotes as quote
    union all
    select
      'point_reservations',
      pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(reservation) order by reservation.id
        ),
        '[]'::pg_catalog.jsonb
      )
    from public.point_reservations as reservation
    union all
    select
      'point_reservation_allocations',
      pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(allocation)
          order by allocation.reservation_id, allocation.lot_id
        ),
        '[]'::pg_catalog.jsonb
      )
    from public.point_reservation_allocations as allocation
    union all
    select
      'point_ledger_entries',
      pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ledger) order by ledger.id),
        '[]'::pg_catalog.jsonb
      )
    from public.point_ledger_entries as ledger
    union all
    select
      'account_entitlements',
      pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(entitlement) order by entitlement.id
        ),
        '[]'::pg_catalog.jsonb
      )
    from public.account_entitlements as entitlement
    union all
    select
      'credit_ledger',
      pg_catalog.count(*),
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(legacy_ledger) order by legacy_ledger.id
        ),
        '[]'::pg_catalog.jsonb
      )
    from public.credit_ledger as legacy_ledger
  )
  select pg_catalog.string_agg(
    snapshot.relation_name,
    ',' order by snapshot.relation_name
  )
  into v_changed_relations
  from points_wallet_read_relation_snapshot as snapshot
  join current_state as current_relation using (relation_name)
  where snapshot.row_count is distinct from current_relation.row_count
    or snapshot.rows_json is distinct from current_relation.rows_json;

  if v_changed_relations is not null then
    raise exception 'Points wallet read RPC mutated protected relations';
  end if;
end
$careslink_v1_points_wallet_read_no_dml$;

rollback;
