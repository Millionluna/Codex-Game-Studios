begin;

-- Rollback-only catalog and execution matrix. Run only after repository
-- migrations through 20260902012628 on an isolated no-care-data database.
select pg_catalog.set_config(
  'careslink.assertion_entry_role', current_user, true
);

do $careslink_v1_current_session_catalog$
declare
  v_rpc pg_catalog.oid := pg_catalog.to_regprocedure(
    'public.resolve_v1_current_session_status()'
  );
  v_helper pg_catalog.oid := pg_catalog.to_regprocedure(
    'public.v1_shadow_session_is_active(uuid,uuid,timestamp with time zone)'
  );
  v_rpc_owner pg_catalog.oid;
  v_definition pg_catalog.text;
  v_helper_source pg_catalog.text;
  v_expected_helper_source pg_catalog.text :=
    $careslink_v1_expected_session_helper$select coalesce(
    p_owner_user_id is not null
    and p_session_id is not null
    and p_at is not null
    and exists (
      select 1
      from auth.sessions as active_session
      join auth.users as active_user
        on active_user.id = active_session.user_id
      where active_session.id = p_session_id
        and active_session.user_id = p_owner_user_id
        and (
          active_session.not_after is null
          or active_session.not_after > p_at
        )
        and active_user.aud = 'authenticated'
        and active_user.role = 'authenticated'
        -- Native/phone Auth remains unserved in this first Product API batch;
        -- only a confirmed email provider principal is eligible.
        and active_user.email_confirmed_at is not null
        and active_user.email_confirmed_at <= p_at
        and active_user.deleted_at is null
        and (
          active_user.banned_until is null
          or active_user.banned_until <= p_at
        )
        and active_user.is_anonymous is false
        and jsonb_typeof(active_user.raw_app_meta_data) = 'object'
        and active_user.raw_app_meta_data->>'role' = 'provider'
    ),
    false
  )$careslink_v1_expected_session_helper$;
begin
  if v_rpc is null or v_helper is null then
    raise exception 'Current-session RPC catalog contract failed';
  end if;

  select routine.proowner, pg_catalog.pg_get_functiondef(routine.oid)
  into v_rpc_owner, v_definition
  from pg_catalog.pg_proc as routine
  where routine.oid = v_rpc
    and routine.pronamespace = 'public'::pg_catalog.regnamespace
    and routine.proname = 'resolve_v1_current_session_status'
    and pg_catalog.pg_get_function_identity_arguments(routine.oid) = ''
    and pg_catalog.pg_get_function_result(routine.oid) = 'text'
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

  if v_rpc_owner is null or (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as overload
    where overload.pronamespace = 'public'::pg_catalog.regnamespace
      and overload.proname = 'resolve_v1_current_session_status'
  ) <> 1 then
    raise exception 'Current-session RPC catalog contract failed';
  end if;

  select helper.prosrc
  into v_helper_source
  from pg_catalog.pg_proc as helper
  where helper.oid = v_helper
    and helper.proowner = v_rpc_owner
    and helper.prokind = 'f'
    and helper.prorettype = 'boolean'::pg_catalog.regtype
    and helper.prolang = (
      select language_record.oid
      from pg_catalog.pg_language as language_record
      where language_record.lanname = 'sql'
    )
    and not helper.prosecdef
    and helper.provolatile = 's'
    and not helper.proretset
    and not helper.proleakproof
    and pg_catalog.cardinality(helper.proconfig) = 1
    and helper.proconfig[1] in ('search_path=', 'search_path=""')
    and (
      select pg_catalog.count(*)
      from pg_catalog.aclexplode(
        coalesce(
          helper.proacl,
          pg_catalog.acldefault('f', helper.proowner)
        )
      ) as helper_acl
    ) = 1
    and exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          helper.proacl,
          pg_catalog.acldefault('f', helper.proowner)
        )
      ) as helper_acl
      where helper_acl.grantee = helper.proowner
        and helper_acl.grantor = helper.proowner
        and helper_acl.privilege_type = 'EXECUTE'
        and not helper_acl.is_grantable
    );

  if v_helper_source is null
    or pg_catalog.btrim(v_helper_source, E' \n\r\t')
      is distinct from v_expected_helper_source
    or v_definition not like '%v_claims := auth.jwt()%'
    or v_definition not like '%v_owner_user_id := auth.uid()%'
    or v_definition not like '%v_claims->''session_id''%'
    or v_definition not like '%public.v1_shadow_session_is_active(%'
    or v_definition not like '%pg_catalog.clock_timestamp()%'
    or v_definition like '%from auth.sessions%'
    or v_definition like '%from auth.users%'
    or v_definition like '%raw_user_meta_data%'
  then
    raise exception 'Current-session RPC catalog contract failed';
  end if;

  if exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(
        (select routine.proacl from pg_catalog.pg_proc as routine
         where routine.oid = v_rpc),
        pg_catalog.acldefault('f', v_rpc_owner)
      )
    ) as function_acl
    where function_acl.grantee = 0
  ) then
    raise exception 'PUBLIC unexpectedly has current-session RPC EXECUTE';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.aclexplode(
      coalesce(
        (select routine.proacl from pg_catalog.pg_proc as routine
         where routine.oid = v_rpc),
        pg_catalog.acldefault('f', v_rpc_owner)
      )
    ) as function_acl
    where function_acl.grantee = 'authenticated'::pg_catalog.regrole
      and function_acl.grantor = v_rpc_owner
      and function_acl.privilege_type = 'EXECUTE'
      and not function_acl.is_grantable
  ) <> 1 or exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(
        (select routine.proacl from pg_catalog.pg_proc as routine
         where routine.oid = v_rpc),
        pg_catalog.acldefault('f', v_rpc_owner)
      )
    ) as function_acl
    where function_acl.grantee not in (
      v_rpc_owner, 'authenticated'::pg_catalog.regrole
    )
  ) then
    raise exception 'Current-session RPC ACL contract failed';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated', v_rpc, 'EXECUTE'
  ) or pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticator', v_rpc, 'EXECUTE')
    or exists (
      select 1
      from information_schema.routine_privileges as privilege
      where privilege.specific_schema = 'public'
        and privilege.routine_name = 'resolve_v1_current_session_status'
        and privilege.grantee in (
          'PUBLIC', 'anon', 'service_role', 'authenticator'
        )
    )
    or not exists (
      select 1
      from information_schema.routine_privileges as privilege
      where privilege.specific_schema = 'public'
        and privilege.routine_name = 'resolve_v1_current_session_status'
        and privilege.grantee = 'authenticated'
        and privilege.privilege_type = 'EXECUTE'
        and privilege.is_grantable = 'NO'
    )
  then
    raise exception 'Current-session RPC ACL contract failed';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(
      array['anon', 'authenticated', 'service_role', 'authenticator']
    ) as api_role(role_name)
    where pg_catalog.has_function_privilege(
      api_role.role_name, v_helper, 'EXECUTE'
    )
  ) or pg_catalog.pg_has_role(
    'service_role', 'authenticated', 'MEMBER'
  ) or exists (
    select 1
    from pg_catalog.unnest(
      array['anon', 'authenticated', 'service_role', 'authenticator']
    ) as api_role(role_name)
    where pg_catalog.pg_has_role(
      api_role.role_name,
      pg_catalog.pg_get_userbyid(v_rpc_owner),
      'MEMBER'
    )
  ) then
    raise exception 'Current-session RPC ACL contract failed';
  end if;
end
$careslink_v1_current_session_catalog$;

-- Fixed synthetic Auth fixtures only; no care or generated-note data.
delete from auth.sessions
where id in (
  '91100000-0000-4000-8000-000000000001',
  '91100000-0000-4000-8000-000000000099',
  '92200000-0000-4000-8000-000000000002',
  '92200000-0000-4000-8000-000000000003'
);
delete from auth.users
where id in (
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_anonymous, created_at, updated_at
) values
  (
    '91000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'v1-current-session-a@example.invalid', 'test-only-no-login',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'v1-current-session-b@example.invalid', 'test-only-no-login',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"],"role":"provider"}'::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb, false,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );

insert into auth.sessions (
  id, user_id, created_at, updated_at, not_after
) values
  (
    '91100000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    '91100000-0000-4000-8000-000000000099',
    '91000000-0000-4000-8000-000000000001',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() - interval '1 second'
  ),
  (
    '92200000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  ),
  (
    '92200000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000002',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), null
  );

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);

set local role anon;
do $careslink_v1_current_session_anon$
begin
  begin
    perform public.resolve_v1_current_session_status();
    raise exception 'Anon unexpectedly executed current-session RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_current_session_anon$;
reset role;

set local role service_role;
do $careslink_v1_current_session_service$
begin
  begin
    perform public.resolve_v1_current_session_status();
    raise exception 'Service role unexpectedly executed current-session RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_current_session_service$;
reset role;

set local role authenticator;
do $careslink_v1_current_session_authenticator$
begin
  begin
    perform public.resolve_v1_current_session_status();
    raise exception 'Authenticator unexpectedly executed current-session RPC';
  exception
    when insufficient_privilege then null;
  end;
end
$careslink_v1_current_session_authenticator$;
reset role;

set local role authenticated;
do $careslink_v1_current_session_claim_matrix$
begin
  if public.resolve_v1_current_session_status() <> 'ACTIVE' then
    raise exception 'Authenticated active Provider session did not resolve ACTIVE';
  end if;

  perform pg_catalog.set_config('request.jwt.claims', '{}', true);
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Missing JWT claims did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config('request.jwt.claims', '{', true);
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Malformed JWT JSON did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"service_role","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Wrong JWT role did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"not-a-uuid","session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Malformed owner UUID did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":910,"session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Non-string owner UUID did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000000040008000000000000001","session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Non-canonical owner UUID did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001"}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Missing anonymous claim did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":"false"}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Non-boolean anonymous claim did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"not-a-uuid","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Malformed session UUID did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":911,"is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Non-string session UUID did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000000040008000000000000001","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Non-canonical session UUID did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":true}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Anonymous JWT claim did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"92000000-0000-4000-8000-000000000002","session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Cross-owner session did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000099","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Expired session did not resolve REVOKED';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91900000-0000-4000-8000-000000000999","is_anonymous":false}',
    true
  );
  if public.resolve_v1_current_session_status() <> 'REVOKED' then
    raise exception 'Missing session did not resolve REVOKED';
  end if;
end
$careslink_v1_current_session_claim_matrix$;
reset role;

delete from auth.sessions
where id = '92200000-0000-4000-8000-000000000003';
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"92000000-0000-4000-8000-000000000002","session_id":"92200000-0000-4000-8000-000000000003","is_anonymous":false}',
  true
);
do $careslink_v1_current_session_deleted_session$
begin
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Deleted session did not resolve REVOKED';
end if;
end
$careslink_v1_current_session_deleted_session$;

-- The owner-only calls below isolate the trusted Auth-user predicate while
-- retaining a valid authenticated request JWT. ACL behavior was proved above.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"91100000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);

do $careslink_v1_current_session_user_matrix$
begin
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'role',
    raw_user_meta_data = '{"role":"provider"}'::pg_catalog.jsonb
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'User metadata role unexpectedly authorized current session';
end if;

update auth.users
set raw_user_meta_data = '{}'::pg_catalog.jsonb
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Missing trusted Provider role unexpectedly resolved ACTIVE';
end if;

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::pg_catalog.jsonb
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Wrong trusted Provider role unexpectedly resolved ACTIVE';
end if;

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"provider"}'::pg_catalog.jsonb,
    is_anonymous = true
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Anonymous Provider unexpectedly resolved ACTIVE';
end if;

update auth.users
set is_anonymous = false,
    banned_until = pg_catalog.clock_timestamp() + interval '1 hour'
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Banned Provider unexpectedly resolved ACTIVE';
end if;

update auth.users
set banned_until = null,
    deleted_at = pg_catalog.clock_timestamp()
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Deleted Provider unexpectedly resolved ACTIVE';
end if;

update auth.users
set deleted_at = null,
    email_confirmed_at = null
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Unconfirmed Provider unexpectedly resolved ACTIVE';
end if;

update auth.users
set email_confirmed_at = pg_catalog.clock_timestamp(),
    aud = 'unexpected'
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Wrong Auth audience unexpectedly resolved ACTIVE';
end if;

update auth.users
set aud = 'authenticated',
    role = 'unexpected'
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'REVOKED' then
  raise exception 'Wrong Auth database role unexpectedly resolved ACTIVE';
end if;

update auth.users
set role = 'authenticated'
where id = '91000000-0000-4000-8000-000000000001';
if public.resolve_v1_current_session_status() <> 'ACTIVE' then
  raise exception 'Eligible Provider did not recover ACTIVE';
end if;
end
$careslink_v1_current_session_user_matrix$;

rollback;
