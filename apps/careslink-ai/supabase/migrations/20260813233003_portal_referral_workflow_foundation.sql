-- Portal-first referral workflow foundation.
--
-- This migration is intentionally additive, default-off and unapplied. It
-- creates no state-changing RPC and grants no table write privilege. A later,
-- separately reviewed activation migration must add narrow atomic commands
-- only after a disposable Preview clean-apply and transaction assertions.

create schema careslink_portal_private;
revoke all on schema careslink_portal_private
  from public, anon, authenticated, service_role;

create table public.portal_workflow_flags (
  capability text primary key,
  enabled boolean not null default false check (enabled = false),
  preview_only boolean not null default true check (preview_only),
  updated_at timestamptz not null default now()
);

insert into public.portal_workflow_flags (capability, enabled, preview_only)
values ('referral_workflow_v1', false, true);

create table public.portal_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_type text not null check (
    organization_type in ('PLATFORM', 'PARTNER', 'REFERRAL_SOURCE', 'PROVIDER')
  ),
  display_name text not null check (
    char_length(btrim(display_name)) between 1 and 200
  ),
  status text not null default 'ACTIVE' check (
    status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.portal_organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (
    role in (
      'platform_admin',
      'partner_operator',
      'referral_source',
      'provider_member'
    )
  ),
  status text not null default 'PENDING' check (
    status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, role)
);

create index portal_memberships_user_status_idx
  on public.portal_organization_memberships(user_id, status, role);

create table public.portal_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.portal_organizations(id) on delete restrict,
  review_status text not null default 'PENDING' check (
    review_status in ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED')
  ),
  service_types text[] not null default '{}'::text[],
  regions text[] not null default '{}'::text[],
  languages text[] not null default '{}'::text[],
  funding_types text[] not null default '{}'::text[],
  capacity_status text not null default 'UNKNOWN' check (
    capacity_status in ('UNKNOWN', 'AVAILABLE', 'LIMITED', 'UNAVAILABLE')
  ),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_referrals (
  id uuid primary key default gen_random_uuid(),
  source_organization_id uuid not null
    references public.portal_organizations(id) on delete restrict,
  source_user_id uuid not null references auth.users(id) on delete restrict,
  summary text not null check (
    char_length(btrim(summary)) between 1 and 4000
    -- Contact data belongs only in the private contact row. These checks are
    -- deliberately fail-closed for common email, Australian phone and labelled
    -- contact patterns; the future command RPC must also accept only a
    -- server-constructed, redacted summary.
    and summary !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
    and summary !~* '(^|[^0-9])([+]?61|0)[ ()-]*[2-478]([ ()-]*[0-9]){8}([^0-9]|$)'
    and summary !~* '(^|[^[:alpha:]])(phone|mobile|email|contact)[[:space:]]*[:：]'
    and summary !~ '(电话|手機|手机|邮箱|電郵|电邮)[[:space:]]*[:：]'
  ),
  region text not null check (
    region in ('VIC_MELBOURNE', 'VIC_GEELONG', 'VIC_REGIONAL')
  ),
  service_type text not null check (
    service_type in (
      'SUPPORT_COORDINATION',
      'DAILY_LIVING_SUPPORT',
      'COMMUNITY_PARTICIPATION'
    )
  ),
  current_status text not null default 'SUBMITTED' check (
    current_status in (
      'SUBMITTED',
      'TRIAGED',
      'OFFERED',
      'ACCEPTED',
      'IN_PROGRESS',
      'NOTE_LINKED',
      'EXPORTED',
      'COMPLETED',
      'CLOSED'
    )
  ),
  assigned_provider_id uuid
    references public.portal_providers(id) on delete restrict,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index portal_referrals_source_status_idx
  on public.portal_referrals(source_organization_id, current_status, updated_at desc);
create index portal_referrals_provider_status_idx
  on public.portal_referrals(assigned_provider_id, current_status, updated_at desc)
  where assigned_provider_id is not null;
create index portal_referrals_source_user_idx
  on public.portal_referrals(source_user_id);

create table careslink_portal_private.portal_referral_contacts (
  referral_id uuid primary key
    references public.portal_referrals(id) on delete cascade,
  contact_name text not null check (
    char_length(btrim(contact_name)) between 1 and 200
  ),
  contact_phone text not null check (
    char_length(btrim(contact_phone)) between 1 and 100
  ),
  contact_email text check (
    contact_email is null
    or char_length(btrim(contact_email)) between 1 and 320
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_referral_matches (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null
    references public.portal_referrals(id) on delete restrict,
  provider_id uuid not null
    references public.portal_providers(id) on delete restrict,
  score integer check (score is null or score between 0 and 100),
  status text not null default 'CANDIDATE' check (
    status in ('CANDIDATE', 'OFFERED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED')
  ),
  offered_by uuid references auth.users(id) on delete restrict,
  offered_at timestamptz,
  responded_by uuid references auth.users(id) on delete restrict,
  responded_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referral_id, provider_id),
  unique (id, referral_id)
);

create unique index portal_matches_one_offered_idx
  on public.portal_referral_matches(referral_id)
  where status = 'OFFERED';
create unique index portal_matches_one_accepted_idx
  on public.portal_referral_matches(referral_id)
  where status = 'ACCEPTED';
create index portal_matches_provider_status_idx
  on public.portal_referral_matches(provider_id, status, updated_at desc);
create index portal_matches_offered_by_idx
  on public.portal_referral_matches(offered_by)
  where offered_by is not null;
create index portal_matches_responded_by_idx
  on public.portal_referral_matches(responded_by)
  where responded_by is not null;

create table public.portal_referral_followups (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null
    references public.portal_referrals(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  outcome_code text not null check (
    outcome_code in (
      'CONTACT_CONFIRMED',
      'INFORMATION_REQUESTED',
      'FOLLOW_UP_SCHEDULED',
      'SERVICE_COMMENCED',
      'NO_RESPONSE'
    )
  ),
  next_due_at timestamptz,
  created_at timestamptz not null default now()
);

create index portal_followups_referral_created_idx
  on public.portal_referral_followups(referral_id, created_at desc);
create index portal_followups_actor_user_idx
  on public.portal_referral_followups(actor_user_id);

create table public.portal_referral_document_links (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null
    references public.portal_referrals(id) on delete cascade,
  document_id uuid not null,
  document_owner_user_id uuid not null references auth.users(id) on delete restrict,
  link_type text not null default 'PRIMARY_NOTE' check (
    link_type in ('PRIMARY_NOTE', 'FOLLOW_UP_NOTE', 'SUPPORTING_DOCUMENT')
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (document_id, document_owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete restrict,
  unique (referral_id, document_id)
);

create index portal_document_links_document_owner_idx
  on public.portal_referral_document_links(document_id, document_owner_user_id);
create index portal_document_links_owner_user_idx
  on public.portal_referral_document_links(document_owner_user_id);
create index portal_document_links_created_by_idx
  on public.portal_referral_document_links(created_by);

create table public.portal_referral_exports (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null
    references public.portal_referrals(id) on delete cascade,
  export_job_id uuid not null,
  export_owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (export_job_id, export_owner_user_id)
    references public.export_jobs(id, owner_user_id) on delete restrict,
  unique (referral_id, export_job_id)
);

create index portal_exports_job_owner_idx
  on public.portal_referral_exports(export_job_id, export_owner_user_id);
create index portal_exports_owner_user_idx
  on public.portal_referral_exports(export_owner_user_id);
create index portal_exports_created_by_idx
  on public.portal_referral_exports(created_by);

create table public.portal_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  mutation_id_hash text not null check (
    mutation_id_hash ~ '^[a-f0-9]{64}$'
  ),
  mutation_kind text not null check (
    mutation_kind in (
      'CREATE_REFERRAL',
      'TRIAGE_REFERRAL',
      'OFFER_REFERRAL',
      'RESPOND_TO_OFFER',
      'RECORD_FOLLOW_UP',
      'LINK_DOCUMENT',
      'RECORD_EXPORT',
      'COMPLETE_REFERRAL'
    )
  ),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  response_referral_id uuid not null
    references public.portal_referrals(id) on delete restrict,
  response_match_id uuid,
  response_status text not null check (
    response_status in (
      'SUBMITTED',
      'TRIAGED',
      'OFFERED',
      'ACCEPTED',
      'IN_PROGRESS',
      'NOTE_LINKED',
      'EXPORTED',
      'COMPLETED',
      'CLOSED'
    )
  ),
  response_row_version bigint not null check (response_row_version > 0),
  response_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (response_match_id, response_referral_id)
    references public.portal_referral_matches(id, referral_id)
    on delete restrict,
  unique (actor_user_id, mutation_id_hash)
);

create index portal_receipts_response_referral_idx
  on public.portal_mutation_receipts(response_referral_id);
create index portal_receipts_response_match_idx
  on public.portal_mutation_receipts(response_match_id, response_referral_id)
  where response_match_id is not null;

create table public.portal_audit_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null
    references public.portal_referrals(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check (
    actor_role in (
      'platform_admin',
      'partner_operator',
      'referral_source',
      'provider_member'
    )
  ),
  mutation_kind text not null check (
    mutation_kind in (
      'CREATE_REFERRAL',
      'TRIAGE_REFERRAL',
      'OFFER_REFERRAL',
      'RESPOND_TO_OFFER',
      'RECORD_FOLLOW_UP',
      'LINK_DOCUMENT',
      'RECORD_EXPORT',
      'COMPLETE_REFERRAL'
    )
  ),
  from_status text check (
    from_status is null
    or from_status in (
      'SUBMITTED', 'TRIAGED', 'OFFERED', 'ACCEPTED', 'IN_PROGRESS',
      'NOTE_LINKED', 'EXPORTED', 'COMPLETED', 'CLOSED'
    )
  ),
  to_status text not null check (
    to_status in (
      'SUBMITTED', 'TRIAGED', 'OFFERED', 'ACCEPTED', 'IN_PROGRESS',
      'NOTE_LINKED', 'EXPORTED', 'COMPLETED', 'CLOSED'
    )
  ),
  mutation_id_hash text not null check (
    mutation_id_hash ~ '^[a-f0-9]{64}$'
  ),
  correlation_id_hash text check (
    correlation_id_hash is null
    or correlation_id_hash ~ '^[a-f0-9]{64}$'
  ),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 2048
    and metadata - array[
      'matchId',
      'providerId',
      'decision',
      'outcomeCode',
      'canonicalDocumentId',
      'exportJobId'
    ]::text[] = '{}'::jsonb
    and (
      not (metadata ? 'matchId')
      or (
        jsonb_typeof(metadata->'matchId') = 'string'
        and metadata->>'matchId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
    and (
      not (metadata ? 'providerId')
      or (
        jsonb_typeof(metadata->'providerId') = 'string'
        and metadata->>'providerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
    and (
      not (metadata ? 'decision')
      or (
        jsonb_typeof(metadata->'decision') = 'string'
        and metadata->>'decision' in ('ACCEPT', 'DECLINE')
      )
    )
    and (
      not (metadata ? 'outcomeCode')
      or (
        jsonb_typeof(metadata->'outcomeCode') = 'string'
        and metadata->>'outcomeCode' in (
          'CONTACT_CONFIRMED',
          'INFORMATION_REQUESTED',
          'FOLLOW_UP_SCHEDULED',
          'SERVICE_COMMENCED',
          'NO_RESPONSE'
        )
      )
    )
    and (
      not (metadata ? 'canonicalDocumentId')
      or (
        jsonb_typeof(metadata->'canonicalDocumentId') = 'string'
        and metadata->>'canonicalDocumentId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
    and (
      not (metadata ? 'exportJobId')
      or (
        jsonb_typeof(metadata->'exportJobId') = 'string'
        and metadata->>'exportJobId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
  ),
  occurred_at timestamptz not null default now()
);

create index portal_audit_referral_time_idx
  on public.portal_audit_events(referral_id, occurred_at, id);
create unique index portal_audit_mutation_kind_idx
  on public.portal_audit_events(actor_user_id, mutation_id_hash, mutation_kind);

create or replace function careslink_portal_private.current_session_is_eligible()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    return false;
  end if;
  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if v_session_id is null then
    return false;
  end if;
  return exists (
    select 1
    from auth.sessions as active_session
    join auth.users as active_user on active_user.id = active_session.user_id
    where active_session.id = v_session_id
      and active_session.user_id = v_user_id
      and (
        active_session.not_after is null
        or active_session.not_after > statement_timestamp()
      )
      and active_user.deleted_at is null
      and (
        active_user.banned_until is null
        or active_user.banned_until <= statement_timestamp()
      )
      and active_user.email_confirmed_at is not null
      and active_user.aud = 'authenticated'
      and active_user.role = 'authenticated'
      and coalesce(active_user.is_anonymous, false) = false
  );
end;
$$;

create or replace function careslink_portal_private.has_active_membership(
  p_organization_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    careslink_portal_private.current_session_is_eligible()
    and exists (
      select 1
      from public.portal_organization_memberships as membership
      join public.portal_organizations as organization
        on organization.id = membership.organization_id
      where membership.organization_id = p_organization_id
        and membership.user_id = auth.uid()
        and membership.status = 'ACTIVE'
        and membership.role = any(p_roles)
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
          or (
            membership.role = 'referral_source'
            and organization.organization_type = 'REFERRAL_SOURCE'
          )
          or (
            membership.role = 'provider_member'
            and organization.organization_type = 'PROVIDER'
          )
        )
    );
$$;

create or replace function careslink_portal_private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    careslink_portal_private.current_session_is_eligible()
    and exists (
      select 1
      from public.portal_organization_memberships as membership
      join public.portal_organizations as organization
        on organization.id = membership.organization_id
      where membership.user_id = auth.uid()
        and membership.status = 'ACTIVE'
        and membership.role = 'platform_admin'
        and organization.organization_type = 'PLATFORM'
        and organization.status = 'ACTIVE'
    );
$$;

create or replace function careslink_portal_private.current_provider_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when count(*) = 1 then max(provider.id::text)::uuid
    else null
  end
  from public.portal_providers as provider
  join public.portal_organizations as organization
    on organization.id = provider.organization_id
  join public.portal_organization_memberships as membership
    on membership.organization_id = provider.organization_id
  where careslink_portal_private.current_session_is_eligible()
    and membership.user_id = auth.uid()
    and membership.status = 'ACTIVE'
    and membership.role = 'provider_member'
    and organization.organization_type = 'PROVIDER'
    and organization.status = 'ACTIVE'
    and provider.review_status = 'APPROVED';
$$;

create or replace function careslink_portal_private.can_read_referral(
  p_referral_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_referrals as referral
    where referral.id = p_referral_id
      and (
        careslink_portal_private.is_platform_admin()
        or careslink_portal_private.has_active_membership(
          referral.source_organization_id,
          array['partner_operator', 'referral_source']::text[]
        )
        or exists (
          select 1
          from public.portal_referral_matches as match
          where match.referral_id = referral.id
            and match.provider_id =
              careslink_portal_private.current_provider_id()
            and match.status = 'ACCEPTED'
            and referral.assigned_provider_id = match.provider_id
            and referral.current_status in (
              'ACCEPTED',
              'IN_PROGRESS',
              'NOTE_LINKED',
              'EXPORTED',
              'COMPLETED'
            )
        )
      )
  );
$$;

create or replace function careslink_portal_private.can_read_match(
  p_referral_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_referrals as referral
    where referral.id = p_referral_id
      and (
        careslink_portal_private.is_platform_admin()
        or careslink_portal_private.has_active_membership(
          referral.source_organization_id,
          array['partner_operator']::text[]
        )
      )
  );
$$;

create or replace function careslink_portal_private.can_read_assigned_workflow(
  p_referral_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_referrals as referral
    where referral.id = p_referral_id
      and (
        careslink_portal_private.is_platform_admin()
        or careslink_portal_private.has_active_membership(
          referral.source_organization_id,
          array['partner_operator', 'referral_source']::text[]
        )
        or (
          referral.assigned_provider_id =
            careslink_portal_private.current_provider_id()
          and referral.current_status in (
            'ACCEPTED',
            'IN_PROGRESS',
            'NOTE_LINKED',
            'EXPORTED',
            'COMPLETED'
          )
          and exists (
            select 1
            from public.portal_referral_matches as accepted_match
            where accepted_match.referral_id = referral.id
              and accepted_match.provider_id = referral.assigned_provider_id
              and accepted_match.status = 'ACCEPTED'
          )
        )
      )
  );
$$;

create or replace function careslink_portal_private.can_read_audit(
  p_referral_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_referrals as referral
    where referral.id = p_referral_id
      and (
        careslink_portal_private.is_platform_admin()
        or careslink_portal_private.has_active_membership(
          referral.source_organization_id,
          array['partner_operator']::text[]
        )
      )
  );
$$;

create or replace function careslink_portal_private.can_read_contact(
  p_referral_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select careslink_portal_private.can_read_assigned_workflow(p_referral_id);
$$;

create or replace function careslink_portal_private.deny_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'APPEND_ONLY_RESOURCE';
end;
$$;

create trigger portal_followups_append_only
before update or delete on public.portal_referral_followups
for each row execute function careslink_portal_private.deny_append_only_mutation();
create trigger portal_receipts_append_only
before update or delete on public.portal_mutation_receipts
for each row execute function careslink_portal_private.deny_append_only_mutation();
create trigger portal_audit_append_only
before update or delete on public.portal_audit_events
for each row execute function careslink_portal_private.deny_append_only_mutation();

alter table public.portal_workflow_flags enable row level security;
alter table public.portal_organizations enable row level security;
alter table public.portal_organization_memberships enable row level security;
alter table public.portal_providers enable row level security;
alter table public.portal_referrals enable row level security;
alter table careslink_portal_private.portal_referral_contacts enable row level security;
alter table public.portal_referral_matches enable row level security;
alter table public.portal_referral_followups enable row level security;
alter table public.portal_referral_document_links enable row level security;
alter table public.portal_referral_exports enable row level security;
alter table public.portal_mutation_receipts enable row level security;
alter table public.portal_audit_events enable row level security;

create policy portal_organizations_owner_select
on public.portal_organizations for select to authenticated
using (
  careslink_portal_private.is_platform_admin()
  or careslink_portal_private.has_active_membership(
    id,
    array['partner_operator', 'referral_source', 'provider_member']::text[]
  )
);

create policy portal_memberships_owner_select
on public.portal_organization_memberships for select to authenticated
using (
  careslink_portal_private.current_session_is_eligible()
  and (
    careslink_portal_private.is_platform_admin()
    or (
      user_id = auth.uid()
      and careslink_portal_private.has_active_membership(
        organization_id,
        array[role]::text[]
      )
    )
    or careslink_portal_private.has_active_membership(
      organization_id,
      array['partner_operator']::text[]
    )
  )
);

create policy portal_providers_owner_select
on public.portal_providers for select to authenticated
using (
  careslink_portal_private.is_platform_admin()
  or id = careslink_portal_private.current_provider_id()
);

create policy portal_referrals_visible_select
on public.portal_referrals for select to authenticated
using (careslink_portal_private.can_read_referral(id));

create policy portal_contacts_visible_select
on careslink_portal_private.portal_referral_contacts
for select to authenticated
using (careslink_portal_private.can_read_contact(referral_id));

create policy portal_matches_visible_select
on public.portal_referral_matches for select to authenticated
using (careslink_portal_private.can_read_match(referral_id));

create policy portal_followups_visible_select
on public.portal_referral_followups for select to authenticated
using (careslink_portal_private.can_read_assigned_workflow(referral_id));

create policy portal_document_links_visible_select
on public.portal_referral_document_links for select to authenticated
using (careslink_portal_private.can_read_assigned_workflow(referral_id));

create policy portal_exports_visible_select
on public.portal_referral_exports for select to authenticated
using (careslink_portal_private.can_read_assigned_workflow(referral_id));

create policy portal_receipts_actor_select
on public.portal_mutation_receipts for select to authenticated
using (
  careslink_portal_private.current_session_is_eligible()
  and actor_user_id = auth.uid()
  and careslink_portal_private.can_read_referral(response_referral_id)
);

create policy portal_audit_visible_select
on public.portal_audit_events for select to authenticated
using (careslink_portal_private.can_read_audit(referral_id));

revoke all on table
  public.portal_workflow_flags,
  public.portal_organizations,
  public.portal_organization_memberships,
  public.portal_providers,
  public.portal_referrals,
  public.portal_referral_matches,
  public.portal_referral_followups,
  public.portal_referral_document_links,
  public.portal_referral_exports,
  public.portal_mutation_receipts,
  public.portal_audit_events
from public, anon, authenticated, service_role;

revoke all on table careslink_portal_private.portal_referral_contacts
  from public, anon, authenticated, service_role;

revoke all on function
  careslink_portal_private.current_session_is_eligible(),
  careslink_portal_private.has_active_membership(uuid, text[]),
  careslink_portal_private.is_platform_admin(),
  careslink_portal_private.current_provider_id(),
  careslink_portal_private.can_read_referral(uuid),
  careslink_portal_private.can_read_match(uuid),
  careslink_portal_private.can_read_assigned_workflow(uuid),
  careslink_portal_private.can_read_audit(uuid),
  careslink_portal_private.can_read_contact(uuid),
  careslink_portal_private.deny_append_only_mutation()
from public, anon, authenticated, service_role;

grant usage on schema careslink_portal_private to authenticated;
grant execute on function
  careslink_portal_private.current_session_is_eligible(),
  careslink_portal_private.has_active_membership(uuid, text[]),
  careslink_portal_private.is_platform_admin(),
  careslink_portal_private.current_provider_id(),
  careslink_portal_private.can_read_referral(uuid),
  careslink_portal_private.can_read_match(uuid),
  careslink_portal_private.can_read_assigned_workflow(uuid),
  careslink_portal_private.can_read_audit(uuid),
  careslink_portal_private.can_read_contact(uuid)
to authenticated;

-- Deliberately absent:
--   * authenticated table SELECT grants;
--   * authenticated INSERT/UPDATE/DELETE grants;
--   * state-changing SECURITY DEFINER RPCs;
--   * an offered-provider summary RPC (a future separately reviewed RPC may
--     return only structured non-PII catalog codes, never the referral row);
--   * feature activation or Production data migration.
