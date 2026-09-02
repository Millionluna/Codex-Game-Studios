begin;

-- Least-privilege current-session resolver for request-scoped Cookie/Bearer
-- clients. Identity is never accepted as an argument: both the owner and the
-- exact session come only from the verified request JWT installed by the Data
-- API. The existing two-argument service-role resolver remains unchanged for
-- its historical callers.
do $careslink_v1_current_session_preflight$
declare
  v_helper pg_catalog.oid := pg_catalog.to_regprocedure(
    'public.v1_shadow_session_is_active(uuid,uuid,timestamp with time zone)'
  );
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
  if exists (
    select 1
    from pg_catalog.pg_proc as overload
    where overload.pronamespace = 'public'::pg_catalog.regnamespace
      and overload.proname = 'resolve_v1_current_session_status'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'V1_CURRENT_SESSION_STATUS_IDENTITY_EXISTS';
  end if;

  if v_helper is null or not exists (
    select 1
    from pg_catalog.pg_proc as helper
    where helper.oid = v_helper
      and helper.proowner = 'postgres'::pg_catalog.regrole
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
      and pg_catalog.btrim(helper.prosrc, E' \n\r\t') =
        v_expected_helper_source
      and pg_catalog.has_function_privilege(
        'postgres', helper.oid, 'EXECUTE'
      )
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
      )
  ) or exists (
    select 1
    from pg_catalog.unnest(
      array['anon', 'authenticated', 'service_role', 'authenticator']
    ) as api_role(role_name)
    where pg_catalog.has_function_privilege(
      api_role.role_name, v_helper, 'EXECUTE'
    )
  ) or exists (
    select 1
    from pg_catalog.unnest(
      array['anon', 'authenticated', 'service_role', 'authenticator']
    ) as api_role(role_name)
    where pg_catalog.pg_has_role(
      api_role.role_name, 'postgres', 'MEMBER'
    )
  ) or pg_catalog.pg_has_role(
    'service_role', 'authenticated', 'MEMBER'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'V1_CURRENT_SESSION_STATUS_HELPER_UNSAFE';
  end if;
end
$careslink_v1_current_session_preflight$;

create function public.resolve_v1_current_session_status()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_current_session_status$
declare
  v_claims pg_catalog.jsonb;
  v_owner_user_id pg_catalog.uuid;
  v_session_claim pg_catalog.text;
  v_session_id pg_catalog.uuid;
begin
  begin
    v_claims := auth.jwt();
  exception
    when invalid_text_representation then
      return 'REVOKED';
  end;

  -- EXECUTE is authenticated-only below. Keep the claim check as an
  -- independent fail-closed boundary for owner/direct-database invocations.
  if pg_catalog.jsonb_typeof(v_claims) is distinct from 'object'
    or v_claims->>'role' is distinct from 'authenticated'
    or v_claims->'is_anonymous'
      is distinct from 'false'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(v_claims->'sub') is distinct from 'string'
    or pg_catalog.jsonb_typeof(v_claims->'session_id')
      is distinct from 'string'
    or v_claims->>'sub'
      !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_claims->>'session_id'
      !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return 'REVOKED';
  end if;

  begin
    v_owner_user_id := auth.uid();
    v_session_claim := v_claims->>'session_id';
    v_session_id := v_session_claim::pg_catalog.uuid;
  exception
    when invalid_text_representation then
      return 'REVOKED';
  end;

  -- The Auth UID helper is the user authority. The raw sub comparison only
  -- proves that the claim was canonical; it never becomes a caller input.
  if v_owner_user_id is null
    or v_owner_user_id::pg_catalog.text
      is distinct from v_claims->>'sub'
    or v_session_id::pg_catalog.text is distinct from v_session_claim
  then
    return 'REVOKED';
  end if;

  if public.v1_shadow_session_is_active(
    v_owner_user_id,
    v_session_id,
    pg_catalog.clock_timestamp()
  ) then
    return 'ACTIVE';
  end if;

  return 'REVOKED';
end
$careslink_v1_current_session_status$;

alter function public.resolve_v1_current_session_status()
  owner to postgres;

-- New functions can inherit broad default EXECUTE grants. Revoke every API
-- path first, in the same transaction, and then add back only authenticated.
revoke all on function public.resolve_v1_current_session_status()
  from public, anon, authenticated, service_role, authenticator;
grant execute on function public.resolve_v1_current_session_status()
  to authenticated;

comment on function public.resolve_v1_current_session_status() is
  'Returns ACTIVE only for the authenticated caller exact live Provider session; otherwise REVOKED.';

commit;
