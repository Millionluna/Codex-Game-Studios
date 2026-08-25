begin;

-- Production-unapplied Portal Referral Provider Response M1b runtime.
-- This independently default-off Preview-only slice exposes only exact-provider
-- authorization, a bounded metadata-only offer inbox and ACCEPT/DECLINE.
insert into public.portal_workflow_flags (
  capability,
  enabled,
  preview_only
) values ('referral_provider_response_v1', false, true);

-- The frozen memory contract orders the provider inbox by match id. Keep the
-- database projection bounded and support that exact provider/id keyset without
-- indexing terminal match states that never appear in the inbox.
create index portal_matches_provider_response_inbox_idx
  on public.portal_referral_matches (provider_id, id)
  include (referral_id, status)
  where status in ('OFFERED', 'ACCEPTED');

create function
careslink_portal_private.portal_referral_provider_response_assert_enabled()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- All Portal RPCs take the global lock before their operation lock.
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
  where flag.capability = 'referral_provider_response_v1'
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
careslink_portal_private.portal_referral_provider_response_assert_session(
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
careslink_portal_private.portal_referral_provider_response_context()
returns table (
  user_id uuid,
  session_id uuid,
  organization_id uuid,
  organization_type text,
  actor_role text,
  provider_id uuid,
  provider_review_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_context_count bigint;
  v_membership_id uuid;
  v_organization_id uuid;
  v_provider_id uuid;
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

  perform
    careslink_portal_private.portal_referral_provider_response_assert_session(
      v_user_id,
      v_session_id
    );

  -- Parent-before-child locks make the exact-one provider binding stable for
  -- the short RPC and keep provider administration outside the admitted work.
  lock table public.portal_organizations in share mode;
  lock table public.portal_organization_memberships in share mode;
  lock table public.portal_providers in share mode;

  perform
    careslink_portal_private.portal_referral_provider_response_assert_session(
      v_user_id,
      v_session_id
    );

  select
    count(*),
    max(membership.id::text)::uuid,
    max(organization.id::text)::uuid,
    max(provider.id::text)::uuid
  into
    v_context_count,
    v_membership_id,
    v_organization_id,
    v_provider_id
  from public.portal_organization_memberships as membership
  join public.portal_organizations as organization
    on organization.id = membership.organization_id
  join public.portal_providers as provider
    on provider.organization_id = organization.id
  where membership.user_id = v_user_id
    and membership.role = 'provider_member'
    and membership.status = 'ACTIVE'
    and organization.organization_type = 'PROVIDER'
    and organization.status = 'ACTIVE'
    and provider.review_status = 'APPROVED';

  if v_context_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_FORBIDDEN';
  end if;

  perform 1
  from public.portal_organization_memberships as membership
  join public.portal_organizations as organization
    on organization.id = membership.organization_id
  join public.portal_providers as provider
    on provider.organization_id = organization.id
  where membership.id = v_membership_id
    and membership.organization_id = v_organization_id
    and membership.user_id = v_user_id
    and membership.role = 'provider_member'
    and membership.status = 'ACTIVE'
    and organization.id = v_organization_id
    and organization.organization_type = 'PROVIDER'
    and organization.status = 'ACTIVE'
    and provider.id = v_provider_id
    and provider.review_status = 'APPROVED'
  for share of organization, membership, provider;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_FORBIDDEN';
  end if;

  perform
    careslink_portal_private.portal_referral_provider_response_assert_session(
      v_user_id,
      v_session_id
    );

  return query select
    v_user_id,
    v_session_id,
    v_organization_id,
    'PROVIDER'::text,
    'provider_member'::text,
    v_provider_id,
    'APPROVED'::text;
end;
$$;

revoke all on function
  careslink_portal_private.portal_referral_provider_response_assert_enabled(),
  careslink_portal_private.portal_referral_provider_response_assert_session(
    uuid, uuid
  ),
  careslink_portal_private.portal_referral_provider_response_context()
from public, anon, authenticated, service_role;

create function public.portal_referral_provider_response_authorize()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_organization_id uuid;
  v_provider_id uuid;
begin
  perform
    careslink_portal_private.portal_referral_provider_response_assert_enabled();

  select
    context.user_id,
    context.organization_id,
    context.provider_id
  into strict
    v_user_id,
    v_organization_id,
    v_provider_id
  from
    careslink_portal_private.portal_referral_provider_response_context()
      as context;

  return jsonb_build_object(
    'authorized', true,
    'user_id', v_user_id,
    'organization_id', v_organization_id,
    'organization_type', 'PROVIDER',
    'organization_status', 'ACTIVE',
    'membership_role', 'provider_member',
    'membership_status', 'ACTIVE',
    'provider_id', v_provider_id,
    'provider_review_status', 'APPROVED'
  );
end;
$$;

create function public.portal_referral_provider_response_offers(
  p_limit integer default 50,
  p_after_match_id uuid default null
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
  v_provider_id uuid;
  v_items jsonb;
begin
  perform
    careslink_portal_private.portal_referral_provider_response_assert_enabled();

  select
    context.user_id,
    context.session_id,
    context.provider_id
  into strict
    v_user_id,
    v_session_id,
    v_provider_id
  from
    careslink_portal_private.portal_referral_provider_response_context()
      as context;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from public.portal_referral_matches as match
    join public.portal_referrals as referral
      on referral.id = match.referral_id
    where match.provider_id = v_provider_id
      and match.status in ('OFFERED', 'ACCEPTED')
      and not (
        (
          match.status = 'OFFERED'
          and match.offered_at is not null
          and match.responded_by is null
          and match.responded_at is null
          and referral.current_status = 'OFFERED'
          and referral.assigned_provider_id is null
        )
        or
        (
          match.status = 'ACCEPTED'
          and match.offered_at is not null
          and match.responded_by is not null
          and match.responded_at is not null
          and referral.current_status in (
            'ACCEPTED',
            'IN_PROGRESS',
            'NOTE_LINKED',
            'EXPORTED',
            'COMPLETED',
            'CLOSED'
          )
          and referral.assigned_provider_id is not distinct from v_provider_id
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'match_id', item.match_id,
        'referral_id', item.referral_id,
        'region', item.region,
        'service_type', item.service_type,
        'match_status', item.match_status,
        'current_status', item.current_status,
        'row_version', item.row_version
      ) order by item.match_id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      match.id as match_id,
      referral.id as referral_id,
      referral.region,
      referral.service_type,
      match.status as match_status,
      referral.current_status,
      referral.row_version
    from public.portal_referral_matches as match
    join public.portal_referrals as referral
      on referral.id = match.referral_id
    where match.provider_id = v_provider_id
      and match.status in ('OFFERED', 'ACCEPTED')
      and (p_after_match_id is null or match.id > p_after_match_id)
      and (
        (
          match.status = 'OFFERED'
          and match.offered_at is not null
          and match.responded_by is null
          and match.responded_at is null
          and referral.current_status = 'OFFERED'
          and referral.assigned_provider_id is null
        )
        or
        (
          match.status = 'ACCEPTED'
          and match.offered_at is not null
          and match.responded_by is not null
          and match.responded_at is not null
          and referral.current_status in (
            'ACCEPTED',
            'IN_PROGRESS',
            'NOTE_LINKED',
            'EXPORTED',
            'COMPLETED',
            'CLOSED'
          )
          and referral.assigned_provider_id is not distinct from v_provider_id
        )
      )
    order by match.id
    limit p_limit
  ) as item;

  perform
    careslink_portal_private.portal_referral_provider_response_assert_session(
      v_user_id,
      v_session_id
    );

  return jsonb_build_object('items', v_items);
end;
$$;

create function public.portal_referral_provider_response_respond(
  p_match_id uuid,
  p_expected_version bigint,
  p_decision text,
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
  v_provider_id uuid;
  v_canonical_payload jsonb;
  v_payload_hash text;
  v_receipt public.portal_mutation_receipts%rowtype;
  v_referral_id uuid;
  v_referral public.portal_referrals%rowtype;
  v_match public.portal_referral_matches%rowtype;
  v_match_found boolean;
  v_target_status text;
  v_now timestamptz;
begin
  perform
    careslink_portal_private.portal_referral_provider_response_assert_enabled();

  if p_match_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if p_expected_version is null
    or p_expected_version < 1
    or p_expected_version >= 9223372036854775807
    or p_decision is null
    or p_decision not in ('ACCEPT', 'DECLINE')
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
    context.provider_id
  into strict
    v_user_id,
    v_session_id,
    v_organization_id,
    v_provider_id
  from
    careslink_portal_private.portal_referral_provider_response_context()
      as context;

  v_canonical_payload := jsonb_build_object(
    'actor', jsonb_build_object(
      'organizationId', v_organization_id::text,
      'role', 'provider_member',
      'providerId', v_provider_id::text
    ),
    'kind', 'RESPOND_TO_OFFER',
    'command', jsonb_build_object(
      'matchId', p_match_id::text,
      'expectedVersion', p_expected_version,
      'decision', p_decision
    )
  );
  v_payload_hash := public.v1_shadow_content_sha256(v_canonical_payload);

  if p_payload_hash is distinct from v_payload_hash then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_VALIDATION_ERROR';
  end if;

  v_target_status := case
    when p_decision = 'ACCEPT' then 'ACCEPTED'
    else 'TRIAGED'
  end;

  select receipt.*
  into v_receipt
  from public.portal_mutation_receipts as receipt
  where receipt.actor_user_id = v_user_id
    and receipt.mutation_id_hash = p_mutation_id_hash;

  if found then
    if v_receipt.mutation_kind <> 'RESPOND_TO_OFFER'
      or v_receipt.payload_hash is distinct from v_payload_hash
      or v_receipt.response_match_id is distinct from p_match_id
      or v_receipt.response_status is distinct from v_target_status
      or v_receipt.response_row_version is distinct from p_expected_version + 1
    then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_IDEMPOTENCY_CONFLICT';
    end if;

    if not exists (
      select 1
      from public.portal_referral_matches as match
      join public.portal_referrals as referral
        on referral.id = match.referral_id
      where match.id = v_receipt.response_match_id
        and match.referral_id = v_receipt.response_referral_id
        and match.provider_id = v_provider_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_NOT_FOUND';
    end if;

    perform
      careslink_portal_private.portal_referral_provider_response_assert_session(
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

  -- Discover only a provider-owned match id without taking a match lock. The
  -- resource lock order below remains referral first, then every match by id,
  -- matching Assignment M1a and preventing response/offer deadlocks.
  select match.referral_id
  into v_referral_id
  from public.portal_referral_matches as match
  where match.id = p_match_id
    and match.provider_id = v_provider_id;

  if not found then
    perform
      careslink_portal_private.portal_referral_provider_response_assert_session(
        v_user_id,
        v_session_id
      );
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  select referral.*
  into v_referral
  from public.portal_referrals as referral
  where referral.id = v_referral_id
  for update of referral;

  if not found then
    perform
      careslink_portal_private.portal_referral_provider_response_assert_session(
        v_user_id,
        v_session_id
      );
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  perform 1
  from public.portal_referral_matches as match
  where match.referral_id = v_referral.id
  order by match.id
  for update of match;

  perform
    careslink_portal_private.portal_referral_provider_response_assert_session(
      v_user_id,
      v_session_id
    );

  select match.*
  into v_match
  from public.portal_referral_matches as match
  where match.id = p_match_id
    and match.referral_id = v_referral.id
    and match.provider_id = v_provider_id;

  v_match_found := found;

  if not v_match_found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if v_match.status <> 'OFFERED'
    or v_match.offered_at is null
    or v_match.responded_by is not null
    or v_match.responded_at is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  if v_referral.row_version <> p_expected_version then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_STALE_REFERRAL';
  end if;

  if v_referral.current_status <> 'OFFERED'
    or v_referral.assigned_provider_id is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());

  update public.portal_referral_matches
  set status = case
        when p_decision = 'ACCEPT' then 'ACCEPTED'
        else 'DECLINED'
      end,
      responded_by = v_user_id,
      responded_at = v_now,
      row_version = v_match.row_version + 1,
      updated_at = v_now
  where id = v_match.id;

  update public.portal_referrals
  set current_status = v_target_status,
      assigned_provider_id = case
        when p_decision = 'ACCEPT' then v_provider_id
        else null
      end,
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
    'provider_member',
    'RESPOND_TO_OFFER',
    'OFFERED',
    v_target_status,
    p_mutation_id_hash,
    p_correlation_id_hash,
    jsonb_build_object(
      'matchId', v_match.id::text,
      'decision', p_decision
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
    'RESPOND_TO_OFFER',
    v_payload_hash,
    v_referral.id,
    v_match.id,
    v_target_status,
    v_referral.row_version + 1,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'referral_id', v_referral.id,
    'match_id', v_match.id,
    'current_status', v_target_status,
    'row_version', v_referral.row_version + 1,
    'updated_at', v_now
  );
end;
$$;

revoke all on function
  public.portal_referral_provider_response_authorize(),
  public.portal_referral_provider_response_offers(integer, uuid),
  public.portal_referral_provider_response_respond(
    uuid, bigint, text, text, text, text
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.portal_referral_provider_response_authorize(),
  public.portal_referral_provider_response_offers(integer, uuid),
  public.portal_referral_provider_response_respond(
    uuid, bigint, text, text, text, text
  )
to authenticated;

-- Deliberately absent: table grants, anon/service-role RPC execution, request-
-- supplied provider/organization/role identity, summary/contact projection,
-- follow-up/audit-list RPCs, activation, fixtures, backfill or Production DML.

commit;
