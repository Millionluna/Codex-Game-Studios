begin;

-- Production-unapplied, independently gated Referral-source operations.
-- Both operation rows are inert by default and do not enable the existing
-- Portal master capability or either application operation.
insert into public.portal_workflow_flags (
  capability,
  enabled,
  preview_only
) values
  ('referral_intake_v1', false, true),
  ('referral_source_detail_v1', false, true);

-- Close the legacy Intake RPCs over their own operation gate. All three
-- public Intake RPCs already call this helper before validation or writes.
create or replace function
careslink_portal_private.portal_referral_intake_assert_enabled()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Keep the global-before-operation lock order fixed across Portal RPCs.
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
  where flag.capability = 'referral_intake_v1'
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
  careslink_portal_private.portal_referral_intake_assert_enabled()
from public, anon, authenticated, service_role;

create function public.portal_referral_source_detail_authorize()
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
  where flag.capability = 'referral_source_detail_v1'
    and flag.enabled is true
    and flag.preview_only is true
  for share of flag;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_CAPABILITY_DISABLED';
  end if;

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

create function public.portal_referral_source_detail(
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
  v_organization_id uuid;
  v_detail jsonb;
begin
  -- The public RPC is directly reachable through the Data API once EXECUTE is
  -- granted, so both database gates are authoritative and held for the full
  -- transaction. Keep the global-before-operation lock order fixed.
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
  where flag.capability = 'referral_source_detail_v1'
    and flag.enabled is true
    and flag.preview_only is true
  for share of flag;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_CAPABILITY_DISABLED';
  end if;

  -- Reuse the intake context's fresh Auth user/session checks, exact-one
  -- active referral-source membership and post-lock wall-clock revalidation.
  select context.user_id, context.organization_id
  into strict v_user_id, v_organization_id
  from careslink_portal_private.portal_referral_intake_context() as context;

  select jsonb_build_object(
    'referral_id', referral.id,
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
    'created_at', referral.created_at,
    'updated_at', referral.updated_at
  )
  into v_detail
  from public.portal_referrals as referral
  join careslink_portal_private.portal_referral_contacts as contact
    on contact.referral_id = referral.id
  where referral.id = p_referral_id
    and referral.source_organization_id = v_organization_id;

  -- Do not distinguish another tenant's identifier from an absent identifier.
  if v_detail is null then
    raise exception using
      errcode = 'P0001',
      message = 'PORTAL_NOT_FOUND';
  end if;

  return v_detail;
end;
$$;

revoke all on function
  public.portal_referral_source_detail_authorize(),
  public.portal_referral_source_detail(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.portal_referral_source_detail_authorize(),
  public.portal_referral_source_detail(uuid)
to authenticated;

-- Deliberately absent: direct table grants, anon/service-role execution,
-- mutation/audit/receipt writes, business fixtures, activation or backfill.

commit;
