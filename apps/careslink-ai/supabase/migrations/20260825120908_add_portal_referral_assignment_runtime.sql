begin;

-- Production-unapplied Portal Referral Assignment M1a runtime.
-- This operation remains independently default-off and Preview-only. It adds
-- only operator queue/detail, triage, eligible-provider listing and offer; it
-- does not add provider response, assignment acceptance or any table grant.
insert into public.portal_workflow_flags (
  capability,
  enabled,
  preview_only
) values ('referral_assignment_v1', false, true);

-- Global platform-admin queue. Tenant partner-operator queue can reuse the
-- source-first keyset index created by the Intake runtime.
create index portal_referrals_assignment_queue_idx
  on public.portal_referrals (updated_at desc, id desc)
  include (
    source_organization_id,
    region,
    service_type,
    current_status,
    row_version
  )
  where current_status in ('SUBMITTED', 'TRIAGED', 'OFFERED');

-- Bounded candidate reads start from the small approved/capacity-eligible
-- subset and then apply exact region/service arrays and organization/member
-- eligibility inside the shared private query.
create index portal_providers_assignment_eligible_idx
  on public.portal_providers (id)
  include (organization_id, service_types, regions)
  where review_status = 'APPROVED'
    and capacity_status in ('AVAILABLE', 'LIMITED');

create function
careslink_portal_private.portal_referral_assignment_assert_enabled()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Every Assignment RPC takes the global lock before the operation lock. Any
  -- control-plane transaction that changes both rows must use the same order.
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

  perform 1
  from public.portal_workflow_flags as flag
  where flag.capability = 'referral_assignment_v1'
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

create function
careslink_portal_private.portal_referral_assignment_assert_session(
  p_user_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claim_session_id uuid;
  v_session_found boolean;
  v_not_after timestamptz;
  v_deleted_at timestamptz;
  v_banned_until timestamptz;
  v_email_confirmed_at timestamptz;
  v_aud text;
  v_role text;
  v_is_anonymous boolean;
  v_now timestamptz;
begin
  if p_user_id is null
    or p_session_id is null
    or auth.uid() is distinct from p_user_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_SESSION_REVOKED';
  end if;

  begin
    v_claim_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_SESSION_REVOKED';
  end;

  if v_claim_session_id is distinct from p_session_id then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_SESSION_REVOKED';
  end if;

  select
    active_session.not_after,
    active_user.deleted_at,
    active_user.banned_until,
    active_user.email_confirmed_at,
    active_user.aud,
    active_user.role,
    active_user.is_anonymous
  into
    v_not_after,
    v_deleted_at,
    v_banned_until,
    v_email_confirmed_at,
    v_aud,
    v_role,
    v_is_anonymous
  from auth.sessions as active_session
  join auth.users as active_user
    on active_user.id = active_session.user_id
  where active_session.id = p_session_id
    and active_session.user_id = p_user_id
  for share of active_session, active_user;

  v_session_found := found;
  -- Any auth-row lock wait must finish before the time/status decision. The
  -- held rows and this fresh wall clock form one fail-closed session snapshot.
  v_now := pg_catalog.clock_timestamp();

  if not v_session_found
    or (v_not_after is not null and v_not_after <= v_now)
    or v_deleted_at is not null
    or (v_banned_until is not null and v_banned_until > v_now)
    or v_email_confirmed_at is null
    or v_aud is distinct from 'authenticated'
    or v_role is distinct from 'authenticated'
    or coalesce(v_is_anonymous, false) is true
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_SESSION_REVOKED';
  end if;
end;
$$;

create function
careslink_portal_private.portal_referral_assignment_context()
returns table (
  user_id uuid,
  session_id uuid,
  organization_id uuid,
  organization_type text,
  actor_role text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_membership_count bigint;
  v_membership_id uuid;
  v_organization_id uuid;
  v_organization_type text;
  v_actor_role text;
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

  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  -- Keep the same parent-before-child organization lock order as Intake. The
  -- exact-one predicate must remain stable for the complete short RPC.
  lock table public.portal_organizations in share mode;
  lock table public.portal_organization_memberships in share mode;

  -- A table-lock waiter must not derive exact-one membership information with
  -- a session that expired while waiting.
  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  select
    count(*),
    max(membership.id::text)::uuid,
    max(membership.organization_id::text)::uuid,
    min(organization.organization_type),
    min(membership.role)
  into
    v_membership_count,
    v_membership_id,
    v_organization_id,
    v_organization_type,
    v_actor_role
  from public.portal_organization_memberships as membership
  join public.portal_organizations as organization
    on organization.id = membership.organization_id
  where membership.user_id = v_user_id
    and membership.status = 'ACTIVE'
    and organization.status = 'ACTIVE'
    and (
      (
        membership.role = 'platform_admin'
        and organization.organization_type = 'PLATFORM'
      )
      or (
        membership.role = 'partner_operator'
        and organization.organization_type = 'REFERRAL_SOURCE'
      )
    );

  -- Zero, multiple and mixed platform/operator contexts all fail closed.
  if v_membership_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_FORBIDDEN';
  end if;

  perform 1
  from public.portal_organization_memberships as membership
  join public.portal_organizations as organization
    on organization.id = membership.organization_id
  where membership.id = v_membership_id
    and membership.organization_id = v_organization_id
    and membership.user_id = v_user_id
    and membership.role = v_actor_role
    and membership.status = 'ACTIVE'
    and organization.organization_type = v_organization_type
    and organization.status = 'ACTIVE'
    and (
      (
        v_actor_role = 'platform_admin'
        and v_organization_type = 'PLATFORM'
      )
      or (
        v_actor_role = 'partner_operator'
        and v_organization_type = 'REFERRAL_SOURCE'
      )
    )
  for share of organization, membership;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_FORBIDDEN';
  end if;

  -- Refresh after every authorization lock wait.
  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  return query select
    v_user_id,
    v_session_id,
    v_organization_id,
    v_organization_type,
    v_actor_role;
end;
$$;

create function
careslink_portal_private.portal_referral_assignment_eligible_providers(
  p_region text,
  p_service_type text,
  p_provider_id uuid,
  p_limit integer
)
returns table (
  provider_id uuid,
  display_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- The PL/pgSQL table result is materialized before an outer caller can
  -- apply LIMIT, so the bound must live inside this lock-taking query.
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_VALIDATION_ERROR';
  end if;

  return query
  select provider.id, btrim(organization.display_name)
  from public.portal_providers as provider
  join public.portal_organizations as organization
    on organization.id = provider.organization_id
  where (p_provider_id is null or provider.id = p_provider_id)
    and provider.review_status = 'APPROVED'
    and provider.capacity_status in ('AVAILABLE', 'LIMITED')
    and p_region = any(provider.regions)
    and p_service_type = any(provider.service_types)
    and organization.organization_type = 'PROVIDER'
    and organization.status = 'ACTIVE'
    and exists (
      select 1
      from public.portal_organization_memberships as membership
      where membership.organization_id = provider.organization_id
        and membership.role = 'provider_member'
        and membership.status = 'ACTIVE'
  )
  order by provider.id
  limit p_limit
  for share of provider, organization;
end;
$$;

revoke all on function
  careslink_portal_private.portal_referral_assignment_assert_enabled(),
  careslink_portal_private.portal_referral_assignment_assert_session(uuid, uuid),
  careslink_portal_private.portal_referral_assignment_context(),
  careslink_portal_private.portal_referral_assignment_eligible_providers(
    text, text, uuid, integer
  )
from public, anon, authenticated, service_role;

create function public.portal_referral_assignment_authorize()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_organization_id uuid;
  v_organization_type text;
  v_actor_role text;
begin
  perform careslink_portal_private.portal_referral_assignment_assert_enabled();

  select
    context.user_id,
    context.organization_id,
    context.organization_type,
    context.actor_role
  into strict
    v_user_id,
    v_organization_id,
    v_organization_type,
    v_actor_role
  from careslink_portal_private.portal_referral_assignment_context() as context;

  return jsonb_build_object(
    'authorized', true,
    'user_id', v_user_id,
    'organization_id', v_organization_id,
    'organization_type', v_organization_type,
    'organization_status', 'ACTIVE',
    'membership_role', v_actor_role,
    'membership_status', 'ACTIVE'
  );
end;
$$;

create function public.portal_referral_assignment_queue(
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
  v_organization_id uuid;
  v_actor_role text;
  v_items jsonb;
begin
  perform careslink_portal_private.portal_referral_assignment_assert_enabled();

  select context.organization_id, context.actor_role
  into strict v_organization_id, v_actor_role
  from careslink_portal_private.portal_referral_assignment_context() as context;

  if p_limit is null
    or p_limit < 1
    or p_limit > 50
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
        'source_organization_id', item.source_organization_id,
        'source_organization_name', item.source_organization_name,
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
      referral.source_organization_id,
      btrim(source_organization.display_name) as source_organization_name,
      referral.region,
      referral.service_type,
      referral.current_status,
      referral.row_version,
      referral.updated_at
    from public.portal_referrals as referral
    join public.portal_organizations as source_organization
      on source_organization.id = referral.source_organization_id
    where referral.current_status in ('SUBMITTED', 'TRIAGED', 'OFFERED')
      and (
        v_actor_role = 'platform_admin'
        or referral.source_organization_id = v_organization_id
      )
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

create function public.portal_referral_assignment_detail(
  p_referral_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_role text;
  v_current_status text;
  v_active_offer jsonb;
  v_detail jsonb;
begin
  perform careslink_portal_private.portal_referral_assignment_assert_enabled();

  select context.organization_id, context.actor_role
  into strict v_organization_id, v_actor_role
  from careslink_portal_private.portal_referral_assignment_context() as context;

  if p_referral_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  select
    referral.current_status,
    active_offer.value,
    jsonb_build_object(
      'referral_id', referral.id,
      'source_organization_id', referral.source_organization_id,
      'source_organization_name', btrim(source_organization.display_name),
      'summary', referral.summary,
      'region', referral.region,
      'service_type', referral.service_type,
      'current_status', referral.current_status,
      'row_version', referral.row_version,
      'contact', jsonb_build_object(
        'name', contact.contact_name,
        'phone', contact.contact_phone,
        'email', contact.contact_email
      ),
      'active_offer', active_offer.value,
      'created_at', referral.created_at,
      'updated_at', referral.updated_at
    )
  into v_current_status, v_active_offer, v_detail
  from public.portal_referrals as referral
  join public.portal_organizations as source_organization
    on source_organization.id = referral.source_organization_id
  join careslink_portal_private.portal_referral_contacts as contact
    on contact.referral_id = referral.id
  left join lateral (
    select jsonb_build_object(
      'match_id', match.id,
      'provider_id', provider.id,
      'provider_display_name', btrim(provider_organization.display_name),
      'match_status', 'OFFERED',
      'offered_at', match.offered_at
    ) as value
    from public.portal_referral_matches as match
    join public.portal_providers as provider
      on provider.id = match.provider_id
    join public.portal_organizations as provider_organization
      on provider_organization.id = provider.organization_id
    where match.referral_id = referral.id
      and match.status = 'OFFERED'
  ) as active_offer on true
  where referral.id = p_referral_id
    and referral.current_status in ('SUBMITTED', 'TRIAGED', 'OFFERED')
    and (
      v_actor_role = 'platform_admin'
      or referral.source_organization_id = v_organization_id
    );

  if not found then
    -- Another tenant, a later workflow state and an absent identifier share the
    -- same Assignment M1a not-found boundary.
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if (
    v_current_status = 'OFFERED'
    and v_active_offer is null
  ) or (
    v_current_status in ('SUBMITTED', 'TRIAGED')
    and v_active_offer is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  return v_detail;
end;
$$;

create function public.portal_referral_assignment_triage(
  p_referral_id uuid,
  p_expected_version bigint,
  p_mutation_id_hash text,
  p_payload_hash text,
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
  v_session_id uuid;
  v_organization_id uuid;
  v_actor_role text;
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.portal_mutation_receipts%rowtype;
  v_referral public.portal_referrals%rowtype;
  v_referral_found boolean;
  v_now timestamptz;
begin
  perform careslink_portal_private.portal_referral_assignment_assert_enabled();

  if p_referral_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if p_expected_version is null
    or p_expected_version < 1
    or p_expected_version >= 9223372036854775807
    or p_mutation_id_hash is null
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

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_mutation_id_hash, 0)
  );

  select
    context.user_id,
    context.session_id,
    context.organization_id,
    context.actor_role
  into strict
    v_user_id,
    v_session_id,
    v_organization_id,
    v_actor_role
  from careslink_portal_private.portal_referral_assignment_context() as context;

  v_canonical_payload := jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', v_organization_id::text,
      'role', v_actor_role,
      'providerId', null
    ),
    'kind', 'TRIAGE_REFERRAL',
    'command', jsonb_build_object(
      'referralId', p_referral_id::text,
      'expectedVersion', p_expected_version
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
    if v_receipt.mutation_kind <> 'TRIAGE_REFERRAL'
      or v_receipt.payload_hash <> v_payload_hash
      or v_receipt.response_referral_id <> p_referral_id
      or v_receipt.response_match_id is not null
      or v_receipt.response_status <> 'TRIAGED'
      or v_receipt.response_row_version <> p_expected_version + 1
    then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_IDEMPOTENCY_CONFLICT';
    end if;

    if not exists (
      select 1
      from public.portal_referrals as referral
      where referral.id = v_receipt.response_referral_id
        and (
          v_actor_role = 'platform_admin'
          or referral.source_organization_id = v_organization_id
        )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_NOT_FOUND';
    end if;

    perform careslink_portal_private.portal_referral_assignment_assert_session(
      v_user_id,
      v_session_id
    );

    return jsonb_build_object(
      'referral_id', v_receipt.response_referral_id,
      'match_id', null,
      'current_status', v_receipt.response_status,
      'row_version', v_receipt.response_row_version,
      'updated_at', v_receipt.response_updated_at
    );
  end if;

  select referral.*
  into v_referral
  from public.portal_referrals as referral
  where referral.id = p_referral_id
    and (
      v_actor_role = 'platform_admin'
      or referral.source_organization_id = v_organization_id
    )
  for update of referral;

  v_referral_found := found;

  -- Refresh before deriving NOT_FOUND, stale or state information from a row
  -- that may have been unavailable behind a lock wait.
  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  if not v_referral_found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if v_referral.row_version <> p_expected_version then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_STALE_REFERRAL';
  end if;

  if v_referral.current_status <> 'SUBMITTED'
    or v_referral.assigned_provider_id is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());

  update public.portal_referrals
  set current_status = 'TRIAGED',
      assigned_provider_id = null,
      row_version = v_referral.row_version + 1,
      updated_at = v_now
  where id = v_referral.id;

  insert into public.portal_audit_events (
    referral_id,
    actor_user_id,
    actor_role,
    mutation_kind,
    from_status,
    to_status,
    mutation_id_hash,
    correlation_id_hash,
    metadata,
    occurred_at
  ) values (
    v_referral.id,
    v_user_id,
    v_actor_role,
    'TRIAGE_REFERRAL',
    'SUBMITTED',
    'TRIAGED',
    p_mutation_id_hash,
    p_correlation_id_hash,
    '{}'::jsonb,
    v_now
  );

  insert into public.portal_mutation_receipts (
    actor_user_id,
    mutation_id_hash,
    mutation_kind,
    payload_hash,
    response_referral_id,
    response_match_id,
    response_status,
    response_row_version,
    response_updated_at,
    created_at
  ) values (
    v_user_id,
    p_mutation_id_hash,
    'TRIAGE_REFERRAL',
    v_payload_hash,
    v_referral.id,
    null,
    'TRIAGED',
    v_referral.row_version + 1,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'referral_id', v_referral.id,
    'match_id', null,
    'current_status', 'TRIAGED',
    'row_version', v_referral.row_version + 1,
    'updated_at', v_now
  );
end;
$$;

create function public.portal_referral_assignment_candidates(
  p_referral_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_session_id uuid;
  v_organization_id uuid;
  v_actor_role text;
  v_referral public.portal_referrals%rowtype;
  v_referral_found boolean;
  v_items jsonb;
begin
  perform careslink_portal_private.portal_referral_assignment_assert_enabled();

  select
    context.user_id,
    context.session_id,
    context.organization_id,
    context.actor_role
  into strict
    v_user_id,
    v_session_id,
    v_organization_id,
    v_actor_role
  from careslink_portal_private.portal_referral_assignment_context() as context;

  if p_referral_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_VALIDATION_ERROR';
  end if;

  select referral.*
  into v_referral
  from public.portal_referrals as referral
  where referral.id = p_referral_id
    and (
      v_actor_role = 'platform_admin'
      or referral.source_organization_id = v_organization_id
    )
  for share of referral;

  v_referral_found := found;

  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  if not v_referral_found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if v_referral.current_status <> 'TRIAGED'
    or v_referral.assigned_provider_id is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider_id', candidate.provider_id,
        'display_name', candidate.display_name
      ) order by candidate.provider_id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select eligible.provider_id, eligible.display_name
    from careslink_portal_private.portal_referral_assignment_eligible_providers(
      v_referral.region,
      v_referral.service_type,
      null,
      p_limit
    ) as eligible
    order by eligible.provider_id
  ) as candidate;

  -- Provider-row lock waits are also inside the fresh-session boundary.
  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  return jsonb_build_object('items', v_items);
end;
$$;

create function public.portal_referral_assignment_offer(
  p_referral_id uuid,
  p_provider_id uuid,
  p_expected_version bigint,
  p_mutation_id_hash text,
  p_payload_hash text,
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
  v_session_id uuid;
  v_organization_id uuid;
  v_actor_role text;
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.portal_mutation_receipts%rowtype;
  v_referral public.portal_referrals%rowtype;
  v_referral_found boolean;
  v_match public.portal_referral_matches%rowtype;
  v_match_exists boolean;
  v_match_id uuid;
  v_provider_id uuid;
  v_provider_display_name text;
  v_provider_found boolean;
  v_now timestamptz;
begin
  perform careslink_portal_private.portal_referral_assignment_assert_enabled();

  if p_referral_id is null or p_provider_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if p_expected_version is null
    or p_expected_version < 1
    or p_expected_version >= 9223372036854775807
    or p_mutation_id_hash is null
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

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_mutation_id_hash, 0)
  );

  select
    context.user_id,
    context.session_id,
    context.organization_id,
    context.actor_role
  into strict
    v_user_id,
    v_session_id,
    v_organization_id,
    v_actor_role
  from careslink_portal_private.portal_referral_assignment_context() as context;

  v_canonical_payload := jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', v_organization_id::text,
      'role', v_actor_role,
      'providerId', null
    ),
    'kind', 'OFFER_REFERRAL',
    'command', jsonb_build_object(
      'referralId', p_referral_id::text,
      'providerId', p_provider_id::text,
      'expectedVersion', p_expected_version
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
    if v_receipt.mutation_kind <> 'OFFER_REFERRAL'
      or v_receipt.payload_hash <> v_payload_hash
      or v_receipt.response_referral_id <> p_referral_id
      or v_receipt.response_match_id is null
      or v_receipt.response_status <> 'OFFERED'
      or v_receipt.response_row_version <> p_expected_version + 1
    then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_IDEMPOTENCY_CONFLICT';
    end if;

    -- Reauthorize actor/tenant and bind the historical match/provider, but do
    -- not re-evaluate current target eligibility for a completed replay.
    if not exists (
      select 1
      from public.portal_referrals as referral
      join public.portal_referral_matches as match
        on match.id = v_receipt.response_match_id
       and match.referral_id = referral.id
      where referral.id = v_receipt.response_referral_id
        and match.provider_id = p_provider_id
        and (
          v_actor_role = 'platform_admin'
          or referral.source_organization_id = v_organization_id
        )
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_NOT_FOUND';
    end if;

    perform careslink_portal_private.portal_referral_assignment_assert_session(
      v_user_id,
      v_session_id
    );

    return jsonb_build_object(
      'referral_id', v_receipt.response_referral_id,
      'match_id', v_receipt.response_match_id,
      'current_status', v_receipt.response_status,
      'row_version', v_receipt.response_row_version,
      'updated_at', v_receipt.response_updated_at
    );
  end if;

  -- Never enumerate providers before the caller's tenant-scoped referral is
  -- found, locked and validated.
  select referral.*
  into v_referral
  from public.portal_referrals as referral
  where referral.id = p_referral_id
    and (
      v_actor_role = 'platform_admin'
      or referral.source_organization_id = v_organization_id
    )
  for update of referral;

  v_referral_found := found;

  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  if not v_referral_found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if v_referral.row_version <> p_expected_version then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_STALE_REFERRAL';
  end if;

  if v_referral.current_status <> 'TRIAGED'
    or v_referral.assigned_provider_id is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  -- Lock every match for this referral in a deterministic order before
  -- selecting/promoting the exact provider candidate.
  perform 1
  from public.portal_referral_matches as match
  where match.referral_id = v_referral.id
  order by match.id
  for update of match;

  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  if exists (
    select 1
    from public.portal_referral_matches as active_offer
    where active_offer.referral_id = v_referral.id
      and active_offer.status = 'OFFERED'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  select match.*
  into v_match
  from public.portal_referral_matches as match
  where match.referral_id = v_referral.id
    and match.provider_id = p_provider_id;
  v_match_exists := found;

  select eligible.provider_id, eligible.display_name
  into v_provider_id, v_provider_display_name
  from careslink_portal_private.portal_referral_assignment_eligible_providers(
    v_referral.region,
    v_referral.service_type,
    p_provider_id,
    1
  ) as eligible;

  v_provider_found := found;

  -- Eligibility absence is observable only after a post-provider-lock session
  -- refresh. This also keeps historical target-match association hidden for
  -- absent or currently ineligible providers.
  perform careslink_portal_private.portal_referral_assignment_assert_session(
    v_user_id,
    v_session_id
  );

  if not v_provider_found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if v_match_exists and v_match.status <> 'CANDIDATE' then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());

  if v_match_exists then
    v_match_id := v_match.id;
    update public.portal_referral_matches
    set status = 'OFFERED',
        offered_by = v_user_id,
        offered_at = v_now,
        responded_by = null,
        responded_at = null,
        row_version = v_match.row_version + 1,
        updated_at = v_now
    where id = v_match_id;
  else
    v_match_id := extensions.gen_random_uuid();
    insert into public.portal_referral_matches (
      id,
      referral_id,
      provider_id,
      score,
      status,
      offered_by,
      offered_at,
      responded_by,
      responded_at,
      row_version,
      created_at,
      updated_at
    ) values (
      v_match_id,
      v_referral.id,
      v_provider_id,
      null,
      'OFFERED',
      v_user_id,
      v_now,
      null,
      null,
      1,
      v_now,
      v_now
    );
  end if;

  update public.portal_referrals
  set current_status = 'OFFERED',
      assigned_provider_id = null,
      row_version = v_referral.row_version + 1,
      updated_at = v_now
  where id = v_referral.id;

  insert into public.portal_audit_events (
    referral_id,
    actor_user_id,
    actor_role,
    mutation_kind,
    from_status,
    to_status,
    mutation_id_hash,
    correlation_id_hash,
    metadata,
    occurred_at
  ) values (
    v_referral.id,
    v_user_id,
    v_actor_role,
    'OFFER_REFERRAL',
    'TRIAGED',
    'OFFERED',
    p_mutation_id_hash,
    p_correlation_id_hash,
    jsonb_build_object(
      'matchId', v_match_id::text,
      'providerId', v_provider_id::text
    ),
    v_now
  );

  insert into public.portal_mutation_receipts (
    actor_user_id,
    mutation_id_hash,
    mutation_kind,
    payload_hash,
    response_referral_id,
    response_match_id,
    response_status,
    response_row_version,
    response_updated_at,
    created_at
  ) values (
    v_user_id,
    p_mutation_id_hash,
    'OFFER_REFERRAL',
    v_payload_hash,
    v_referral.id,
    v_match_id,
    'OFFERED',
    v_referral.row_version + 1,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'referral_id', v_referral.id,
    'match_id', v_match_id,
    'current_status', 'OFFERED',
    'row_version', v_referral.row_version + 1,
    'updated_at', v_now
  );
end;
$$;

revoke all on function
  public.portal_referral_assignment_authorize(),
  public.portal_referral_assignment_queue(integer, timestamptz, uuid),
  public.portal_referral_assignment_detail(uuid),
  public.portal_referral_assignment_triage(uuid, bigint, text, text, text),
  public.portal_referral_assignment_candidates(uuid, integer),
  public.portal_referral_assignment_offer(
    uuid, uuid, bigint, text, text, text
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.portal_referral_assignment_authorize(),
  public.portal_referral_assignment_queue(integer, timestamptz, uuid),
  public.portal_referral_assignment_detail(uuid),
  public.portal_referral_assignment_triage(uuid, bigint, text, text, text),
  public.portal_referral_assignment_candidates(uuid, integer),
  public.portal_referral_assignment_offer(
    uuid, uuid, bigint, text, text, text
  )
to authenticated;

-- Deliberately absent: table grants, anon/service-role RPC execution, provider
-- response, non-null assigned_provider_id assignment, raw idempotency/correlation values,
-- candidate writes, activation, fixtures, backfill or Production data changes.

commit;
