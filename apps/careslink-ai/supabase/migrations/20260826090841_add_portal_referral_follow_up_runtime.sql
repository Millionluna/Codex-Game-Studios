begin;

-- Production-unapplied Portal Referral Follow-up M1c runtime.
-- This independently default-off Preview-only slice exposes only an exact
-- approved-provider authorization envelope, accepted private referral detail
-- and fixed-code follow-up recording. Follow-up history remains out of scope.
insert into public.portal_workflow_flags (
  capability,
  enabled,
  preview_only
) values ('referral_follow_up_v1', false, true);

create function
careslink_portal_private.portal_referral_follow_up_assert_enabled()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Preserve the shared global-before-operation flag lock order while keeping
  -- this slice independent from the Provider Response operation flag.
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
  where flag.capability = 'referral_follow_up_v1'
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

revoke all on function
  careslink_portal_private.portal_referral_follow_up_assert_enabled()
from public, anon, authenticated, service_role;

create function public.portal_referral_follow_up_authorize()
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
    careslink_portal_private.portal_referral_follow_up_assert_enabled();

  -- Reuse the M1b exact-one approved provider binding and session posture. Its
  -- operation gate is deliberately not reused, so both slices remain default-
  -- off and independently deployable.
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

create function public.portal_referral_follow_up_detail(
  p_referral_id uuid
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
  v_referral_id uuid;
  v_referral public.portal_referrals%rowtype;
  v_contact careslink_portal_private.portal_referral_contacts%rowtype;
  v_contact_found boolean;
  v_accepted_match_count bigint;
begin
  perform
    careslink_portal_private.portal_referral_follow_up_assert_enabled();

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

  if p_referral_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  -- Discover only an assigned provider-owned id before taking any resource
  -- lock. Foreign and missing referrals deliberately share NOT_FOUND.
  select referral.id
  into v_referral_id
  from public.portal_referrals as referral
  where referral.id = p_referral_id
    and referral.assigned_provider_id = v_provider_id;

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
  for share of referral;

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

  -- Match locks follow the referral lock in stable id order, matching all
  -- workflow mutations. This makes accepted-binding validation a single
  -- coherent snapshot without exposing match identifiers.
  perform 1
  from public.portal_referral_matches as match
  where match.referral_id = v_referral.id
  order by match.id
  for share of match;

  select contact.*
  into v_contact
  from careslink_portal_private.portal_referral_contacts as contact
  where contact.referral_id = v_referral.id
  for share of contact;

  v_contact_found := found;

  perform
    careslink_portal_private.portal_referral_provider_response_assert_session(
      v_user_id,
      v_session_id
    );

  if v_referral.assigned_provider_id is distinct from v_provider_id
    or v_referral.current_status not in ('ACCEPTED', 'IN_PROGRESS')
  then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  select count(*)
  into v_accepted_match_count
  from public.portal_referral_matches as match
  where match.referral_id = v_referral.id
    and match.provider_id = v_provider_id
    and match.status = 'ACCEPTED'
    and match.offered_at is not null
    and match.responded_by is not null
    and match.responded_at is not null;

  if v_accepted_match_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  if not v_contact_found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  return jsonb_build_object(
    'referral_id', v_referral.id,
    'summary', v_referral.summary,
    'region', v_referral.region,
    'service_type', v_referral.service_type,
    'current_status', v_referral.current_status,
    'row_version', v_referral.row_version,
    'contact', jsonb_build_object(
      'name', v_contact.contact_name,
      'phone', v_contact.contact_phone,
      'email', v_contact.contact_email
    ),
    'created_at', v_referral.created_at,
    'updated_at', v_referral.updated_at
  );
end;
$$;

create function public.portal_referral_follow_up_record(
  p_referral_id uuid,
  p_expected_version bigint,
  p_outcome_code text,
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
  v_accepted_match_count bigint;
  v_from_status text;
  v_now timestamptz;
begin
  perform
    careslink_portal_private.portal_referral_follow_up_assert_enabled();

  if p_referral_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  if p_expected_version is null
    or p_expected_version < 1
    or p_expected_version >= 9223372036854775807
    or p_outcome_code is null
    or p_outcome_code not in (
      'CONTACT_CONFIRMED',
      'INFORMATION_REQUESTED',
      'FOLLOW_UP_SCHEDULED',
      'SERVICE_COMMENCED',
      'NO_RESPONSE'
    )
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

  -- Same actor + mutation hash serializes before fresh provider context. The
  -- database, never the request, reconstructs and validates the payload hash.
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
    'kind', 'RECORD_FOLLOW_UP',
    'command', jsonb_build_object(
      'referralId', p_referral_id::text,
      'expectedVersion', p_expected_version,
      'outcomeCode', p_outcome_code
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
    if v_receipt.mutation_kind <> 'RECORD_FOLLOW_UP'
      or v_receipt.payload_hash is distinct from v_payload_hash
      or v_receipt.response_referral_id is distinct from p_referral_id
      or v_receipt.response_match_id is not null
      or v_receipt.response_status is distinct from 'IN_PROGRESS'
      or v_receipt.response_row_version is distinct from p_expected_version + 1
    then
      raise exception using
        errcode = 'P0001',
        message = 'PORTAL_IDEMPOTENCY_CONFLICT';
    end if;

    -- A receipt is an ACK cache, not an authorization cache. Replays must
    -- still resolve to this actor's currently assigned coherent accepted work.
    if not exists (
      select 1
      from public.portal_referrals as referral
      join public.portal_referral_matches as match
        on match.referral_id = referral.id
      where referral.id = v_receipt.response_referral_id
        and referral.assigned_provider_id = v_provider_id
        and match.referral_id = referral.id
        and match.provider_id = v_provider_id
        and match.status = 'ACCEPTED'
        and match.offered_at is not null
        and match.responded_by is not null
        and match.responded_at is not null
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

  -- Discover only provider-owned work without taking a resource lock. The
  -- stable workflow lock order below remains referral first, then every match.
  select referral.id
  into v_referral_id
  from public.portal_referrals as referral
  where referral.id = p_referral_id
    and referral.assigned_provider_id = v_provider_id;

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

  if v_referral.assigned_provider_id is distinct from v_provider_id then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  select count(*)
  into v_accepted_match_count
  from public.portal_referral_matches as match
  where match.referral_id = v_referral.id
    and match.provider_id = v_provider_id
    and match.status = 'ACCEPTED'
    and match.offered_at is not null
    and match.responded_by is not null
    and match.responded_at is not null;

  if v_accepted_match_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  if v_referral.row_version <> p_expected_version then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_STALE_REFERRAL';
  end if;

  if v_referral.current_status not in ('ACCEPTED', 'IN_PROGRESS') then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_INVALID_STATE_TRANSITION';
  end if;

  v_from_status := v_referral.current_status;
  v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp());

  insert into public.portal_referral_followups (
    referral_id,
    actor_user_id,
    outcome_code,
    next_due_at,
    created_at
  ) values (
    v_referral.id,
    v_user_id,
    p_outcome_code,
    null,
    v_now
  );

  update public.portal_referrals
  set current_status = 'IN_PROGRESS',
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
    'RECORD_FOLLOW_UP',
    v_from_status,
    'IN_PROGRESS',
    p_mutation_id_hash,
    p_correlation_id_hash,
    jsonb_build_object('outcomeCode', p_outcome_code),
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
    'RECORD_FOLLOW_UP',
    v_payload_hash,
    v_referral.id,
    null,
    'IN_PROGRESS',
    v_referral.row_version + 1,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'referral_id', v_referral.id,
    'match_id', null,
    'current_status', 'IN_PROGRESS',
    'row_version', v_referral.row_version + 1,
    'updated_at', v_now
  );
end;
$$;

revoke all on function
  public.portal_referral_follow_up_authorize(),
  public.portal_referral_follow_up_detail(uuid),
  public.portal_referral_follow_up_record(
    uuid, bigint, text, text, text, text
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.portal_referral_follow_up_authorize(),
  public.portal_referral_follow_up_detail(uuid),
  public.portal_referral_follow_up_record(
    uuid, bigint, text, text, text, text
  )
to authenticated;

-- Deliberately absent: table grants, anon/service-role RPC execution, request-
-- supplied provider/organization/role identity, free text, next-due input,
-- follow-up/audit history, activation, fixtures, backfill or Production DML.

commit;
