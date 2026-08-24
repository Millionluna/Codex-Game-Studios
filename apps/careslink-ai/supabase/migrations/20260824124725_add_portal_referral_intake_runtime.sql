begin;

-- Production-unapplied Portal Referral intake runtime.
--
-- This slice remains default-off and Preview-only. It exposes only three
-- authenticated SECURITY DEFINER RPCs, grants no application-role table
-- privilege, and revalidates the database flag, Auth session and membership
-- from database state on every call.

-- Explicitly authorized activation-boundary change: remove only the
-- enabled=false hard lock. The column default and existing row remain false,
-- while the foundation preview_only=true constraint remains intact.
alter table public.portal_workflow_flags
  drop constraint portal_workflow_flags_enabled_check;

alter table public.portal_workflow_flags
  alter column enabled set default false;

-- Exact equality/range/order shape used by the bounded source-tenant list.
create index portal_referrals_source_updated_id_idx
  on public.portal_referrals (
    source_organization_id,
    updated_at desc,
    id desc
  ) include (region, service_type, current_status, row_version);

create function careslink_portal_private.portal_referral_intake_assert_enabled()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Hold the enabled row through this transaction so a concurrent disable
  -- cannot commit midway through an admitted RPC.
  perform 1
  from public.portal_workflow_flags as flag
  where flag.capability = 'referral_workflow_v1'
    and flag.enabled is true
    and flag.preview_only is true
  for share of flag;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_CAPABILITY_DISABLED';
  end if;
end;
$$;

create function public.portal_referral_intake_create(
  p_mutation_id_hash text,
  p_payload_hash text,
  p_summary text,
  p_region text,
  p_service_type text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_correlation_id_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_organization_id uuid;
  v_summary text;
  v_contact_name text;
  v_contact_phone text;
  v_contact_email text;
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.portal_mutation_receipts%rowtype;
  v_referral_id uuid;
  v_now timestamptz := date_trunc(
    'milliseconds', transaction_timestamp()
  );
begin
  perform careslink_portal_private.portal_referral_intake_assert_enabled();

  if p_mutation_id_hash is null
    or p_mutation_id_hash !~ '^[a-f0-9]{64}$'
    or p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_correlation_id_hash is null
    or p_correlation_id_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_VALIDATION_ERROR';
  end if;

  -- Serialize by the authenticated principal and opaque mutation hash. The
  -- unique receipt constraint remains the collision-safe final authority.
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_AUTH_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_mutation_id_hash, 0)
  );

  -- Resolve authorization after any same-key waiter completes, preventing a
  -- replay from relying on stale session or membership state.
  select context.user_id, context.organization_id
  into strict v_user_id, v_organization_id
  from careslink_portal_private.portal_referral_intake_context() as context;

  v_summary := btrim(p_summary);
  v_contact_name := btrim(p_contact_name);
  v_contact_phone := btrim(p_contact_phone);
  v_contact_email := case
    when p_contact_email is null then null
    else btrim(p_contact_email)
  end;

  if p_summary is null
    or char_length(v_summary) not between 1 and 4000
    or p_contact_name is null
    or char_length(v_contact_name) not between 1 and 200
    or p_contact_phone is null
    or char_length(v_contact_phone) not between 1 and 100
    or (
      p_contact_email is not null
      and char_length(v_contact_email) not between 1 and 320
    )
    or p_region is null
    or p_region not in (
      'VIC_MELBOURNE',
      'VIC_GEELONG',
      'VIC_REGIONAL'
    )
    or p_service_type is null
    or p_service_type not in (
      'SUPPORT_COORDINATION',
      'DAILY_LIVING_SUPPORT',
      'COMMUNITY_PARTICIPATION'
    )
    -- The public summary cannot repeat private name/email or contain eight or
    -- more digits, even if punctuation separates those digits.
    or strpos(lower(v_summary), lower(v_contact_name)) > 0
    or (
      v_contact_email is not null
      and strpos(lower(v_summary), lower(v_contact_email)) > 0
    )
    or char_length(regexp_replace(v_summary, '[^0-9]', '', 'g')) >= 8
    or v_summary ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
    or v_summary ~* '(^|[^[:alpha:]])(phone|mobile|email|contact)[[:space:]]*[:：]'
    or v_summary ~ '(电话|手機|手机|邮箱|電郵|电邮)[[:space:]]*[:：]'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_VALIDATION_ERROR';
  end if;

  -- Rebuild the exact memory-contract payload with DB-derived authorization.
  -- The caller hash is transport evidence; only the DB-computed hash is stored.
  v_canonical_payload := jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', v_organization_id::text,
      'role', 'referral_source',
      'providerId', null
    ),
    'kind', 'CREATE_REFERRAL',
    'command', jsonb_build_object(
      'summary', v_summary,
      'region', p_region,
      'serviceType', p_service_type,
      'contact', jsonb_build_object(
        'name', v_contact_name,
        'phone', v_contact_phone,
        'email', v_contact_email
      )
    )
  );
  v_payload_hash := public.v1_shadow_content_sha256(v_canonical_payload);

  if p_payload_hash is distinct from v_payload_hash then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_VALIDATION_ERROR';
  end if;

  select receipt.*
  into v_receipt
  from public.portal_mutation_receipts as receipt
  where receipt.actor_user_id = v_user_id
    and receipt.mutation_id_hash = p_mutation_id_hash;

  if found then
    if v_receipt.mutation_kind <> 'CREATE_REFERRAL'
      or v_receipt.payload_hash <> v_payload_hash
    then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_IDEMPOTENCY_CONFLICT';
    end if;

    if not exists (
      select 1
      from public.portal_referrals as referral
      where referral.id = v_receipt.response_referral_id
        and referral.source_organization_id = v_organization_id
        and referral.source_user_id = v_user_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_FORBIDDEN';
    end if;

    return jsonb_build_object(
      'referral_id', v_receipt.response_referral_id,
      'match_id', null,
      'current_status', v_receipt.response_status,
      'row_version', v_receipt.response_row_version,
      'updated_at', v_receipt.response_updated_at
    );
  end if;

  v_referral_id := extensions.gen_random_uuid();

  insert into public.portal_referrals (
    id, source_organization_id, source_user_id, summary, region,
    service_type, current_status, assigned_provider_id, row_version,
    created_at, updated_at
  ) values (
    v_referral_id, v_organization_id, v_user_id, v_summary, p_region,
    p_service_type, 'SUBMITTED', null, 1, v_now, v_now
  );

  insert into careslink_portal_private.portal_referral_contacts (
    referral_id, contact_name, contact_phone, contact_email,
    created_at, updated_at
  ) values (
    v_referral_id, v_contact_name, v_contact_phone, v_contact_email,
    v_now, v_now
  );

  insert into public.portal_audit_events (
    referral_id, actor_user_id, actor_role, mutation_kind, from_status,
    to_status, mutation_id_hash, correlation_id_hash, metadata, occurred_at
  ) values (
    v_referral_id, v_user_id, 'referral_source', 'CREATE_REFERRAL', null,
    'SUBMITTED', p_mutation_id_hash, p_correlation_id_hash, '{}'::jsonb, v_now
  );

  insert into public.portal_mutation_receipts (
    actor_user_id, mutation_id_hash, mutation_kind, payload_hash,
    response_referral_id, response_match_id, response_status,
    response_row_version, response_updated_at, created_at
  ) values (
    v_user_id, p_mutation_id_hash, 'CREATE_REFERRAL', v_payload_hash,
    v_referral_id, null, 'SUBMITTED', 1, v_now, v_now
  );

  return jsonb_build_object(
    'referral_id', v_referral_id,
    'match_id', null,
    'current_status', 'SUBMITTED',
    'row_version', 1,
    'updated_at', v_now
  );
end;
$$;

create function careslink_portal_private.portal_referral_intake_context()
returns table (
  user_id uuid,
  organization_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_organizations uuid[];
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_AUTH_REQUIRED';
  end if;

  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_SESSION_REVOKED';
  end;

  if v_session_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_SESSION_REVOKED';
  end if;

  -- Online session validation, not a JWT-only ownership decision. Locks keep
  -- session/user revocation from committing before this RPC completes.
  perform 1
  from auth.sessions as active_session
  join auth.users as active_user
    on active_user.id = active_session.user_id
  where active_session.id = v_session_id
    and active_session.user_id = v_user_id
    and (
      active_session.not_after is null
      or active_session.not_after > v_now
    )
    and active_user.deleted_at is null
    and (
      active_user.banned_until is null
      or active_user.banned_until <= v_now
    )
    and active_user.email_confirmed_at is not null
    and active_user.aud = 'authenticated'
    and active_user.role = 'authenticated'
    and coalesce(active_user.is_anonymous, false) = false
  for share of active_session, active_user;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_SESSION_REVOKED';
  end if;

  -- Parent-before-child SHARE locks keep organization/membership status and
  -- the exact-one tenant predicate stable while concurrent intake RPCs remain
  -- mutually compatible. Portal administration writes wait for the short RPC.
  lock table public.portal_organizations in share mode;
  lock table public.portal_organization_memberships in share mode;
  -- V1 intake admits exactly one ACTIVE referral_source membership in an
  -- ACTIVE REFERRAL_SOURCE organization. Zero and ambiguous contexts fail
  -- closed rather than selecting an arbitrary tenant.
  select array_agg(
    membership.organization_id order by membership.organization_id
  )
  into v_organizations
  from public.portal_organization_memberships as membership
  join public.portal_organizations as organization
    on organization.id = membership.organization_id
  where membership.user_id = v_user_id
    and membership.role = 'referral_source'
    and membership.status = 'ACTIVE'
    and organization.organization_type = 'REFERRAL_SOURCE'
    and organization.status = 'ACTIVE';

  if coalesce(cardinality(v_organizations), 0) <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_FORBIDDEN';
  end if;

  v_organization_id := v_organizations[1];

  -- Revalidate and lock the exact authorization rows used by this RPC.
  perform 1
  from public.portal_organization_memberships as membership
  join public.portal_organizations as organization
    on organization.id = membership.organization_id
  where membership.organization_id = v_organization_id
    and membership.user_id = v_user_id
    and membership.role = 'referral_source'
    and membership.status = 'ACTIVE'
    and organization.organization_type = 'REFERRAL_SOURCE'
    and organization.status = 'ACTIVE'
  for share of membership, organization;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_FORBIDDEN';
  end if;

  return query select v_user_id, v_organization_id;
end;
$$;

revoke all on function
  careslink_portal_private.portal_referral_intake_assert_enabled(),
  careslink_portal_private.portal_referral_intake_context()
from public, anon, authenticated, service_role;

create function public.portal_referral_intake_authorize()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_organization_id uuid;
begin
  perform careslink_portal_private.portal_referral_intake_assert_enabled();

  select context.user_id, context.organization_id
  into strict v_user_id, v_organization_id
  from careslink_portal_private.portal_referral_intake_context() as context;

  return jsonb_build_object(
    'authorized', true,
    'user_id', v_user_id,
    'organization_id', v_organization_id,
    'organization_type', 'REFERRAL_SOURCE',
    'organization_status', 'ACTIVE',
    'membership_role', 'referral_source',
    'membership_status', 'ACTIVE'
  );
end;
$$;

create function public.portal_referral_intake_list(
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_organization_id uuid;
  v_items jsonb;
begin
  perform careslink_portal_private.portal_referral_intake_assert_enabled();

  select context.user_id, context.organization_id
  into strict v_user_id, v_organization_id
  from careslink_portal_private.portal_referral_intake_context() as context;

  if p_limit is null
    or p_limit < 1
    or p_limit > 100
    or ((p_before_updated_at is null) <> (p_before_id is null))
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_VALIDATION_ERROR';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'referral_id', item.id,
        'region', item.region,
        'service_type', item.service_type,
        'current_status', item.current_status,
        'row_version', item.row_version,
        'updated_at', item.updated_at
      ) order by item.updated_at desc, item.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      referral.id,
      referral.region,
      referral.service_type,
      referral.current_status,
      referral.row_version,
      referral.updated_at
    from public.portal_referrals as referral
    where referral.source_organization_id = v_organization_id
      and (
        p_before_updated_at is null
        or (referral.updated_at, referral.id)
          < (p_before_updated_at, p_before_id)
      )
    order by referral.updated_at desc, referral.id desc
    limit p_limit
  ) as item;

  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function
  public.portal_referral_intake_authorize(),
  public.portal_referral_intake_list(integer, timestamptz, uuid),
  public.portal_referral_intake_create(
    text, text, text, text, text, text, text, text, text
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.portal_referral_intake_authorize(),
  public.portal_referral_intake_list(integer, timestamptz, uuid),
  public.portal_referral_intake_create(
    text, text, text, text, text, text, text, text, text
  )
to authenticated;

-- Deliberately absent: anon/service_role RPC access, application-role table
-- access, raw mutation/correlation storage, contact/summary response fields,
-- feature activation, backfill or Production data writes.

commit;
