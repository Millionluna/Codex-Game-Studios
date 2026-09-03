begin;

-- Atomic Communication Note durable admission + 20-Point reservation.
--
-- This successor remains source-only and default-off. It does not enable the
-- generation capability, expose a Data API RPC, grant or backfill Points,
-- call a model, let the existing worker claim a paid job, or let an existing
-- owner cancellation path strand a reservation. A later terminal batch must
-- atomically couple claim/success/failure/cancel to the reservation before any
-- route or worker activation.

select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

do $careslink_v1_communication_points_admission_preflight$
declare
  v_owner_api pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_generation_owner_api_executor'
  );
begin
  if pg_catalog.current_setting('server_version_num')::pg_catalog.int4 < 160000
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_COMMUNICATION_NOTE_POINTS_ADMISSION_REQUIRES_PG16';
  end if;

  if v_owner_api is null
    or pg_catalog.to_regrole('careslink_v1_generation_owner') is null
    or pg_catalog.to_regrole('careslink_v1_generation_executor') is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,timestamptz)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.recover_v1_shadow_note_generation_expired(text,text,text,text,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.commit_shadow_points(uuid,uuid,text,timestamptz)'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.release_shadow_points(uuid,uuid,text,text,timestamptz)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._set_owner(uuid)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.fresh_privacy_proof_expires_at(uuid,uuid,text,text,text,text,timestamptz)'
    ) is null
    or pg_catalog.to_regclass('careslink_v1_generation.jobs') is null
    or pg_catalog.to_regclass('careslink_v1_generation.payloads') is null
    or pg_catalog.to_regclass('public.service_rate_versions') is null
    or pg_catalog.to_regclass('public.service_rates') is null
    or pg_catalog.to_regclass('public.point_wallets') is null
    or pg_catalog.to_regclass('public.point_lots') is null
    or pg_catalog.to_regclass('public.point_quotes') is null
    or pg_catalog.to_regclass('public.point_reservations') is null
    or pg_catalog.to_regclass('public.point_reservation_allocations') is null
    or pg_catalog.to_regclass('public.point_ledger_entries') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PREDECESSOR_UNSAFE';
  end if;

  if pg_catalog.to_regrole(
      'careslink_v1_generation_points_admission_executor'
    ) is not null
    or pg_catalog.to_regclass(
      'careslink_v1_generation.communication_note_point_admissions'
    ) is not null
    or exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid =
          'careslink_v1_generation.jobs'::pg_catalog.regclass
        and attribute.attname = 'communication_note_point_admission_id'
        and attribute.attnum > 0
        and not attribute.attisdropped
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.pronamespace =
          'careslink_v1_generation'::pg_catalog.regnamespace
        and procedure.proname in (
          '_reserve_and_bind_v1_shadow_communication_note_points',
          '_enforce_v1_shadow_communication_note_point_binding',
          '_deny_v1_shadow_communication_note_point_binding_mutation',
          '_guard_v1_shadow_communication_note_paid_attempt',
          '_guard_v1_shadow_communication_note_point_marker',
          '_guard_v1_shadow_communication_note_paid_reservation',
          'admit_and_reserve_v1_shadow_communication_note_generation_job'
        )
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_COMMUNICATION_NOTE_POINTS_ADMISSION_IDENTITY_EXISTS';
  end if;

end
$careslink_v1_communication_points_admission_preflight$;

create role careslink_v1_generation_points_admission_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;

grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_owner_api_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_points_admission_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Never backfill, adopt or retroactively charge a historical durable job.
-- The entry actor deliberately has no table privilege, so perform this
-- migration-only read through the existing private worker executor and then
-- immediately restore the entry role.
set role careslink_v1_generation_executor;
do $careslink_v1_communication_points_empty_lane$
begin
  if exists (
    select 1
    from careslink_v1_generation.jobs as job
    where job.note_type = 'communication'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'V1_COMMUNICATION_NOTE_POINTS_ADMISSION_REQUIRES_EMPTY_LANE';
  end if;
end
$careslink_v1_communication_points_empty_lane$;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- Close the new definer's defaults before it owns any helper.
set role careslink_v1_generation_points_admission_executor;

alter default privileges
  revoke all on tables from public, anon, authenticated, service_role,
    authenticator, careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges
  revoke all on sequences from public, anon, authenticated, service_role,
    authenticator, careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges
  revoke all on functions from public, anon, authenticated, service_role,
    authenticator, careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges
  revoke all on types from public, anon, authenticated, service_role,
    authenticator, careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

alter default privileges in schema careslink_v1_generation
  revoke all on tables from public, anon, authenticated, service_role,
    authenticator, careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on sequences from public, anon, authenticated, service_role,
    authenticator, careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on functions from public, anon, authenticated, service_role,
    authenticator, careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
alter default privileges in schema careslink_v1_generation
  revoke all on types from public, anon, authenticated, service_role,
    authenticator, careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

grant references on table public.point_quotes,
  public.point_reservations
  to careslink_v1_generation_owner;

set role careslink_v1_generation_owner;

alter table careslink_v1_generation.jobs
  add column communication_note_point_admission_id pg_catalog.uuid;

create table careslink_v1_generation.communication_note_point_admissions (
  id pg_catalog.uuid primary key,
  job_id pg_catalog.uuid not null,
  owner_user_id pg_catalog.uuid not null,
  quote_id pg_catalog.uuid not null,
  reservation_id pg_catalog.uuid not null,
  created_at pg_catalog.timestamptz not null
    default pg_catalog.transaction_timestamp(),
  shadow_only pg_catalog.bool not null default true,
  constraint communication_note_point_admissions_job_unique
    unique (job_id),
  constraint communication_note_point_admissions_quote_unique
    unique (quote_id),
  constraint communication_note_point_admissions_reservation_unique
    unique (reservation_id),
  constraint communication_note_point_admissions_identity_unique
    unique (id, job_id, owner_user_id),
  constraint communication_note_point_admissions_job_owner_unique
    unique (job_id, owner_user_id),
  constraint communication_note_point_admissions_quote_owner_unique
    unique (quote_id, owner_user_id),
  constraint communication_note_point_admissions_reservation_owner_unique
    unique (reservation_id, owner_user_id),
  constraint communication_note_point_admissions_job_owner_fk
    foreign key (job_id, owner_user_id)
    references careslink_v1_generation.jobs(id, owner_user_id)
    on update restrict on delete restrict,
  constraint communication_note_point_admissions_quote_owner_fk
    foreign key (quote_id, owner_user_id)
    references public.point_quotes(id, owner_user_id)
    on update restrict on delete restrict,
  constraint communication_note_point_admissions_reservation_owner_fk
    foreign key (reservation_id, owner_user_id)
    references public.point_reservations(id, owner_user_id)
    on update restrict on delete restrict,
  constraint communication_note_point_admissions_shadow_check
    check (shadow_only is true)
);

alter table careslink_v1_generation.jobs
  add constraint jobs_communication_note_point_admission_unique
    unique (id, owner_user_id, communication_note_point_admission_id),
  add constraint jobs_communication_note_point_admission_fk
    foreign key (
      communication_note_point_admission_id,
      id,
      owner_user_id
    ) references
      careslink_v1_generation.communication_note_point_admissions(
        id,
        job_id,
        owner_user_id
      )
    on update restrict on delete restrict
    deferrable initially deferred;

create index communication_note_point_admissions_owner_created_idx
  on careslink_v1_generation.communication_note_point_admissions(
    owner_user_id,
    created_at desc,
    job_id
  );

create index jobs_communication_note_point_admission_fk_idx
  on careslink_v1_generation.jobs(
    communication_note_point_admission_id,
    id,
    owner_user_id
  )
  where communication_note_point_admission_id is not null;

alter table
  careslink_v1_generation.communication_note_point_admissions
  enable row level security;
alter table
  careslink_v1_generation.communication_note_point_admissions
  force row level security;

create policy communication_note_point_admissions_executor_select
  on careslink_v1_generation.communication_note_point_admissions
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );
create policy communication_note_point_admissions_executor_insert
  on careslink_v1_generation.communication_note_point_admissions
  for insert to careslink_v1_generation_points_admission_executor
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

create policy jobs_points_admission_executor_select
  on careslink_v1_generation.jobs
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and note_type = 'communication'
    and service_code = 'note.communication.generate'
    and rate_catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );
create policy jobs_points_admission_executor_update
  on careslink_v1_generation.jobs
  for update to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and note_type = 'communication'
    and service_code = 'note.communication.generate'
    and rate_catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  )
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and note_type = 'communication'
    and service_code = 'note.communication.generate'
    and rate_catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );
create policy payloads_points_admission_executor_select
  on careslink_v1_generation.payloads
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and note_type = 'communication'
    and shadow_only is true
  );

grant usage on schema careslink_v1_generation
  to careslink_v1_generation_points_admission_executor;
grant select on table careslink_v1_generation.jobs,
  careslink_v1_generation.payloads,
  careslink_v1_generation.communication_note_point_admissions
  to careslink_v1_generation_points_admission_executor;
grant update (communication_note_point_admission_id)
  on table careslink_v1_generation.jobs
  to careslink_v1_generation_points_admission_executor;
grant insert (
  id, job_id, owner_user_id, quote_id, reservation_id, created_at,
  shadow_only
) on table
  careslink_v1_generation.communication_note_point_admissions
  to careslink_v1_generation_points_admission_executor;

grant create on schema careslink_v1_generation
  to careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

revoke references on table public.point_quotes,
  public.point_reservations
  from careslink_v1_generation_owner;

-- Purpose-scoped public-table RLS. The NOLOGIN executor can only see the owner
-- installed by the reviewed private admission chain.
create policy service_rate_versions_points_admission_select
  on public.service_rate_versions
  for select to careslink_v1_generation_points_admission_executor
  using (version = '2026-08-09.v1-shadow' and status = 'SHADOW');
create policy service_rate_versions_points_admission_lock
  on public.service_rate_versions
  for update to careslink_v1_generation_points_admission_executor
  using (version = '2026-08-09.v1-shadow' and status = 'SHADOW')
  with check (false);
create policy service_rates_points_admission_select
  on public.service_rates
  for select to careslink_v1_generation_points_admission_executor
  using (
    catalog_version = '2026-08-09.v1-shadow'
    and service_code = 'note.communication.generate'
    and status = 'SHADOW'
  );
create policy service_rates_points_admission_lock
  on public.service_rates
  for update to careslink_v1_generation_points_admission_executor
  using (
    catalog_version = '2026-08-09.v1-shadow'
    and service_code = 'note.communication.generate'
    and status = 'SHADOW'
  )
  with check (false);

create policy point_wallets_points_admission_select
  on public.point_wallets
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );
create policy point_wallets_points_admission_lock
  on public.point_wallets
  for update to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  )
  with check (false);

create policy point_lots_points_admission_select
  on public.point_lots
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );
create policy point_lots_points_admission_update
  on public.point_lots
  for update to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  )
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

create policy point_quotes_points_admission_select
  on public.point_quotes
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );
create policy point_quotes_points_admission_insert
  on public.point_quotes
  for insert to careslink_v1_generation_points_admission_executor
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );

create policy point_reservations_points_admission_select
  on public.point_reservations
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );
create policy point_reservations_points_admission_insert
  on public.point_reservations
  for insert to careslink_v1_generation_points_admission_executor
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );

create policy point_allocations_points_admission_select
  on public.point_reservation_allocations
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
  );
create policy point_allocations_points_admission_insert
  on public.point_reservation_allocations
  for insert to careslink_v1_generation_points_admission_executor
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
  );

create policy point_ledger_points_admission_select
  on public.point_ledger_entries
  for select to careslink_v1_generation_points_admission_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );
create policy point_ledger_points_admission_insert
  on public.point_ledger_entries
  for insert to careslink_v1_generation_points_admission_executor
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting('careslink.v1_generation_owner_user_id', true),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );

grant usage on schema public, extensions
  to careslink_v1_generation_points_admission_executor;
grant select on table public.service_rate_versions,
  public.service_rates,
  public.point_wallets,
  public.point_lots,
  public.point_quotes,
  public.point_reservations,
  public.point_reservation_allocations,
  public.point_ledger_entries
  to careslink_v1_generation_points_admission_executor;
grant update (version) on table public.service_rate_versions
  to careslink_v1_generation_points_admission_executor;
grant update (catalog_version) on table public.service_rates
  to careslink_v1_generation_points_admission_executor;
grant update (id) on table public.point_wallets
  to careslink_v1_generation_points_admission_executor;
grant update (remaining_points) on table public.point_lots
  to careslink_v1_generation_points_admission_executor;
grant insert (
  id, owner_user_id, service_code, catalog_version, points, quantity,
  idempotency_key, created_at, expires_at, shadow_only
) on table public.point_quotes
  to careslink_v1_generation_points_admission_executor;
grant insert (
  id, wallet_id, owner_user_id, quote_id, service_code, catalog_version,
  points, idempotency_key, status, reserved_at, expires_at, shadow_only
) on table public.point_reservations
  to careslink_v1_generation_points_admission_executor;
grant insert (
  reservation_id, lot_id, wallet_id, owner_user_id, points, created_at
) on table public.point_reservation_allocations
  to careslink_v1_generation_points_admission_executor;
grant insert (
  wallet_id, owner_user_id, event, points, delta, reservation_id,
  service_code, catalog_version, idempotency_key, created_at, shadow_only
) on table public.point_ledger_entries
  to careslink_v1_generation_points_admission_executor;
-- Migration-only trigger attachment capability. Revoked immediately after the
-- purpose-owned function attaches its guard below.
grant trigger on table public.point_reservations
  to careslink_v1_generation_points_admission_executor;

set role careslink_v1_generation_executor;
grant execute on function careslink_v1_generation._set_owner(pg_catalog.uuid)
  to careslink_v1_generation_points_admission_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

grant execute on function
  careslink_v1_generation.fresh_session_is_active(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.timestamptz
  ) to careslink_v1_generation_points_admission_executor;
grant execute on function
  careslink_v1_generation.fresh_privacy_proof_expires_at(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.timestamptz
  ) to careslink_v1_generation_points_admission_executor;
grant execute on function extensions.gen_random_uuid()
  to careslink_v1_generation_points_admission_executor;

-- ---------------------------------------------------------------------------
-- Immutable binding guards
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_points_admission_executor;

create function
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_binding()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_enforce_communication_point_binding$
declare
  v_job record;
  v_payload record;
  v_quote record;
  v_reservation record;
  v_idempotency_key pg_catalog.text;
  v_allocation_points pg_catalog.int8;
  v_allocation_count pg_catalog.int8;
  v_allocation_wallet_mismatch_count pg_catalog.int8;
  v_reserve_ledger_count pg_catalog.int8;
begin
  perform careslink_v1_generation._set_owner(new.owner_user_id);

  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = new.job_id
    and job.owner_user_id = new.owner_user_id;

  select payload.*
  into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.job_id = new.job_id
    and payload.owner_user_id = new.owner_user_id;

  select quote.*
  into v_quote
  from public.point_quotes as quote
  where quote.id = new.quote_id
    and quote.owner_user_id = new.owner_user_id;

  select reservation.*
  into v_reservation
  from public.point_reservations as reservation
  where reservation.id = new.reservation_id
    and reservation.owner_user_id = new.owner_user_id;

  v_idempotency_key :=
    'communication-admission:' || v_job.idempotency_hash;

  select
    coalesce(
      pg_catalog.sum(allocation.points::pg_catalog.int8),
      0::pg_catalog.int8
    ),
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where allocation.wallet_id is distinct from v_reservation.wallet_id
    )
  into v_allocation_points, v_allocation_count,
    v_allocation_wallet_mismatch_count
  from public.point_reservation_allocations as allocation
  where allocation.reservation_id = new.reservation_id
    and allocation.owner_user_id = new.owner_user_id;

  select pg_catalog.count(*)
  into v_reserve_ledger_count
  from public.point_ledger_entries as ledger
  where ledger.reservation_id = new.reservation_id
    and ledger.owner_user_id = new.owner_user_id
    and ledger.event = 'RESERVE'
    and ledger.points = 20
    and ledger.delta = -20
    and ledger.service_code = 'note.communication.generate'
    and ledger.catalog_version = '2026-08-09.v1-shadow'
    and ledger.idempotency_key = v_idempotency_key
    and ledger.wallet_id = v_reservation.wallet_id
    and ledger.shadow_only is true;

  if new.shadow_only is distinct from true
    or v_job.id is null
    or v_job.communication_note_point_admission_id is distinct from new.id
    or v_job.status is distinct from 'QUEUED'
    or v_job.note_type is distinct from 'communication'
    or v_job.service_code is distinct from 'note.communication.generate'
    or v_job.rate_catalog_version is distinct from '2026-08-09.v1-shadow'
    or v_job.shadow_only is distinct from true
    or v_payload.id is null
    or v_payload.id is distinct from v_job.payload_id
    or v_payload.state is distinct from 'AVAILABLE'
    or v_payload.note_type is distinct from v_job.note_type
    or v_payload.request_hash is distinct from v_job.request_hash
    or v_payload.cleaned_facts_hash is distinct from v_job.cleaned_facts_hash
    or v_quote.id is null
    or v_quote.service_code is distinct from v_job.service_code
    or v_quote.catalog_version is distinct from v_job.rate_catalog_version
    or v_quote.points is distinct from 20
    or v_quote.quantity is distinct from 1
    or v_quote.idempotency_key is distinct from v_idempotency_key
    or v_quote.created_at is distinct from new.created_at
    or v_quote.expires_at > v_payload.expires_at
    or v_quote.shadow_only is distinct from true
    or v_reservation.id is null
    or v_reservation.wallet_id is null
    or v_reservation.quote_id is distinct from v_quote.id
    or v_reservation.service_code is distinct from v_quote.service_code
    or v_reservation.catalog_version is distinct from v_quote.catalog_version
    or v_reservation.points is distinct from v_quote.points
    or v_reservation.idempotency_key is distinct from v_idempotency_key
    or v_reservation.status is distinct from 'RESERVED'
    or v_reservation.reserved_at is distinct from v_quote.created_at
    or v_reservation.expires_at is distinct from v_quote.expires_at
    or v_reservation.shadow_only is distinct from true
    or v_allocation_count < 1::pg_catalog.int8
    or v_allocation_points is distinct from 20::pg_catalog.int8
    or v_allocation_wallet_mismatch_count is distinct from 0::pg_catalog.int8
    or v_reserve_ledger_count is distinct from 1::pg_catalog.int8
  then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
  end if;

  return new;
end
$careslink_v1_enforce_communication_point_binding$;

create function
  careslink_v1_generation._deny_v1_shadow_communication_note_point_binding_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_deny_communication_point_binding_mutation$
begin
  raise exception using
    errcode = 'P0001',
    message = 'IMMUTABLE_BINDING';
end
$careslink_v1_deny_communication_point_binding_mutation$;

create function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_guard_communication_paid_attempt$
begin
  perform careslink_v1_generation._set_owner(new.owner_user_id);

  if exists (
    select 1
    from careslink_v1_generation.jobs as job
    where job.id = new.job_id
      and job.owner_user_id = new.owner_user_id
      and job.communication_note_point_admission_id is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  return new;
end
$careslink_v1_guard_communication_paid_attempt$;

create function
  careslink_v1_generation._guard_v1_shadow_communication_note_point_marker()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_guard_communication_point_marker$
begin
  if old.communication_note_point_admission_id is not null
    and new.status is distinct from old.status
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  if old.communication_note_point_admission_id is not null
    and new.communication_note_point_admission_id is distinct from
      old.communication_note_point_admission_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'IMMUTABLE_BINDING';
  end if;

  if new.communication_note_point_admission_id is not null
    and (
      new.status is distinct from 'QUEUED'
      or new.note_type is distinct from 'communication'
      or new.service_code is distinct from 'note.communication.generate'
      or new.rate_catalog_version is distinct from '2026-08-09.v1-shadow'
      or new.shadow_only is distinct from true
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
  end if;

  return new;
end
$careslink_v1_guard_communication_point_marker$;

create function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_guard_communication_paid_reservation$
declare
  v_owner_user_id pg_catalog.uuid;
  v_reservation_id pg_catalog.uuid;
  v_previous_owner_setting pg_catalog.text := pg_catalog.current_setting(
    'careslink.v1_generation_owner_user_id',
    true
  );
begin
  -- Both supported operations must resolve the immutable pre-mutation
  -- identity so a privileged simultaneous owner/id/status change cannot hide
  -- the binding from this guard.
  v_owner_user_id := old.owner_user_id;
  v_reservation_id := old.id;

  perform careslink_v1_generation._set_owner(v_owner_user_id);

  if exists (
    select 1
    from careslink_v1_generation.communication_note_point_admissions
      as binding
    where binding.reservation_id = v_reservation_id
      and binding.owner_user_id = v_owner_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  -- An unbound legacy Points transition must not leak an effective private
  -- owner into the caller's surrounding transaction.
  perform pg_catalog.set_config(
    'careslink.v1_generation_owner_user_id',
    coalesce(v_previous_owner_setting, ''),
    true
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$careslink_v1_guard_communication_paid_reservation$;

create trigger point_reservations_communication_note_paid_admission_gate
before update or delete
on public.point_reservations
for each row execute function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation();

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- Existing service_role-only Points terminal RPCs must not strand a paid job.
-- The purpose role attached the guard with a narrow migration-only table
-- privilege; remove that privilege before any further object is created.
revoke trigger on table public.point_reservations
  from careslink_v1_generation_points_admission_executor;

-- ---------------------------------------------------------------------------
-- Purpose-specific no-clock allocator
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_points_admission_executor;

create function
  careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(
    p_owner_user_id pg_catalog.uuid,
    p_session_id pg_catalog.uuid,
    p_job_id pg_catalog.uuid,
    p_expect_new pg_catalog.bool
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_reserve_and_bind_communication_points$
declare
  v_now pg_catalog.timestamptz;
  v_job record;
  v_payload record;
  v_existing_binding record;
  v_rate record;
  v_wallet record;
  v_lot record;
  v_binding_id pg_catalog.uuid;
  v_quote_id pg_catalog.uuid;
  v_reservation_id pg_catalog.uuid;
  v_idempotency_key pg_catalog.text;
  v_expires_at pg_catalog.timestamptz;
  v_privacy_expires_at pg_catalog.timestamptz;
  v_replay_allocation_points pg_catalog.int8;
  v_replay_allocation_count pg_catalog.int8;
  v_replay_allocation_wallet_mismatch_count pg_catalog.int8;
  v_replay_reserve_ledger_count pg_catalog.int8;
  v_outstanding pg_catalog.int4 := 20;
  v_take pg_catalog.int4;
begin
  if p_owner_user_id is null
    or p_session_id is null
    or p_job_id is null
    or p_expect_new is null
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform careslink_v1_generation._set_owner(p_owner_user_id);
  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  if not careslink_v1_generation.fresh_session_is_active(
      p_owner_user_id,
      p_session_id,
      v_now
    )
  then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.owner_user_id = p_owner_user_id
  for update;

  if v_job.id is null
    or v_job.note_type is distinct from 'communication'
    or v_job.service_code is distinct from 'note.communication.generate'
    or v_job.rate_catalog_version is distinct from '2026-08-09.v1-shadow'
    or v_job.status is distinct from 'QUEUED'
    or v_job.shadow_only is distinct from true
  then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
  end if;

  select payload.*
  into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id;

  if v_payload.id is null
    or v_payload.state is distinct from 'AVAILABLE'
    or v_payload.note_type is distinct from v_job.note_type
    or v_payload.source_locale is distinct from v_job.source_locale
    or v_payload.privacy_review_id is distinct from v_job.privacy_review_id
    or v_payload.cleaned_facts_hash is distinct from v_job.cleaned_facts_hash
    or v_payload.request_hash is distinct from v_job.request_hash
    or v_payload.shadow_only is distinct from true
  then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
  end if;

  v_idempotency_key :=
    'communication-admission:' || v_job.idempotency_hash;

  select
    binding.id,
    binding.quote_id,
    binding.reservation_id,
    binding.created_at as binding_created_at,
    binding.shadow_only as binding_shadow_only,
    quote.service_code as quote_service_code,
    quote.catalog_version as quote_catalog_version,
    quote.points as quote_points,
    quote.quantity as quote_quantity,
    quote.idempotency_key as quote_idempotency_key,
    quote.created_at as quote_created_at,
    quote.expires_at as quote_expires_at,
    quote.shadow_only as quote_shadow_only,
    reservation.quote_id as reservation_quote_id,
    reservation.wallet_id as reservation_wallet_id,
    reservation.service_code as reservation_service_code,
    reservation.catalog_version as reservation_catalog_version,
    reservation.points as reservation_points,
    reservation.idempotency_key as reservation_idempotency_key,
    reservation.status as reservation_status,
    reservation.reserved_at as reservation_reserved_at,
    reservation.expires_at as reservation_expires_at,
    reservation.shadow_only as reservation_shadow_only
  into v_existing_binding
  from careslink_v1_generation.communication_note_point_admissions
    as binding
  join public.point_quotes as quote
    on quote.id = binding.quote_id
   and quote.owner_user_id = binding.owner_user_id
  join public.point_reservations as reservation
    on reservation.id = binding.reservation_id
   and reservation.owner_user_id = binding.owner_user_id
  where binding.job_id = v_job.id
    and binding.owner_user_id = v_job.owner_user_id;

  if found then
    select
      coalesce(
        pg_catalog.sum(allocation.points::pg_catalog.int8),
        0::pg_catalog.int8
      ),
      pg_catalog.count(*),
      pg_catalog.count(*) filter (
        where allocation.wallet_id is distinct from
          v_existing_binding.reservation_wallet_id
      )
    into v_replay_allocation_points, v_replay_allocation_count,
      v_replay_allocation_wallet_mismatch_count
    from public.point_reservation_allocations as allocation
    where allocation.reservation_id = v_existing_binding.reservation_id
      and allocation.owner_user_id = p_owner_user_id;

    select pg_catalog.count(*)
    into v_replay_reserve_ledger_count
    from public.point_ledger_entries as ledger
    where ledger.reservation_id = v_existing_binding.reservation_id
      and ledger.wallet_id = v_existing_binding.reservation_wallet_id
      and ledger.owner_user_id = p_owner_user_id
      and ledger.event = 'RESERVE'
      and ledger.points = 20
      and ledger.delta = -20
      and ledger.service_code = 'note.communication.generate'
      and ledger.catalog_version = '2026-08-09.v1-shadow'
      and ledger.idempotency_key = v_idempotency_key
      and ledger.shadow_only is true;

    if p_expect_new
      or v_job.communication_note_point_admission_id is distinct from
        v_existing_binding.id
      or v_existing_binding.binding_created_at is distinct from
        v_existing_binding.quote_created_at
      or v_existing_binding.binding_shadow_only is distinct from true
      or v_existing_binding.quote_service_code is distinct from
        v_job.service_code
      or v_existing_binding.quote_catalog_version is distinct from
        v_job.rate_catalog_version
      or v_existing_binding.quote_points is distinct from 20
      or v_existing_binding.quote_quantity is distinct from 1
      or v_existing_binding.quote_idempotency_key is distinct from
        v_idempotency_key
      or v_existing_binding.quote_expires_at > v_payload.expires_at
      or v_existing_binding.quote_shadow_only is distinct from true
      or v_existing_binding.reservation_quote_id is distinct from
        v_existing_binding.quote_id
      or v_existing_binding.reservation_wallet_id is null
      or v_existing_binding.reservation_service_code is distinct from
        v_job.service_code
      or v_existing_binding.reservation_catalog_version is distinct from
        v_job.rate_catalog_version
      or v_existing_binding.reservation_points is distinct from 20
      or v_existing_binding.reservation_idempotency_key is distinct from
        v_idempotency_key
      or v_existing_binding.reservation_status is distinct from 'RESERVED'
      or v_existing_binding.reservation_reserved_at is distinct from
        v_existing_binding.quote_created_at
      or v_existing_binding.reservation_expires_at is distinct from
        v_existing_binding.quote_expires_at
      or v_existing_binding.reservation_shadow_only is distinct from true
      or v_replay_allocation_count < 1::pg_catalog.int8
      or v_replay_allocation_points is distinct from 20::pg_catalog.int8
      or v_replay_allocation_wallet_mismatch_count is distinct from
        0::pg_catalog.int8
      or v_replay_reserve_ledger_count is distinct from 1::pg_catalog.int8
    then
      raise exception using
        errcode = 'P0001',
        message = 'IDENTITY_LINK_CONFLICT';
    end if;

    v_now := pg_catalog.date_trunc(
      'milliseconds',
      pg_catalog.clock_timestamp()
    );
    if not careslink_v1_generation.fresh_session_is_active(
        p_owner_user_id,
        p_session_id,
        v_now
      )
    then
      raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
    end if;

    v_privacy_expires_at :=
      careslink_v1_generation.fresh_privacy_proof_expires_at(
        v_job.privacy_review_id,
        v_job.owner_user_id,
        v_job.note_type,
        v_job.cleaned_facts_hash,
        v_job.schema_version,
        v_job.contract_version,
        v_now
      );
    if v_privacy_expires_at is null
      or v_payload.expires_at <= v_now
      or v_payload.expires_at > v_privacy_expires_at
    then
      raise exception using
        errcode = 'P0001',
        message = 'PRIVACY_REVIEW_STALE';
    end if;

    if v_existing_binding.quote_expires_at <= v_now
      or v_existing_binding.reservation_expires_at <= v_now
    then
      raise exception using
        errcode = 'P0001',
        message = 'POINT_QUOTE_EXPIRED';
    end if;

    return pg_catalog.jsonb_build_object(
      'created', false,
      'bindingId', v_existing_binding.id,
      'quoteId', v_existing_binding.quote_id,
      'reservationId', v_existing_binding.reservation_id,
      'points', 20
    );
  end if;

  if not p_expect_new
    or v_job.communication_note_point_admission_id is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
  end if;

  -- A caller may already have made this constraint IMMEDIATE in its outer
  -- transaction. Restore the helper's required deferred insert-then-marker
  -- ordering, and restore DEFERRED again after validating this binding so a
  -- second admission in the same transaction remains valid.
  set constraints
    careslink_v1_generation.communication_note_point_admissions_consistency_trigger
    deferred;

  -- Every Points mutation for one owner shares the existing Points advisory
  -- lane. The durable owner/idempotency lane and job/payload locks are already
  -- held by the outer admission function, fixing cross-surface lock order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_user_id::pg_catalog.text, 0)
  );

  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  if not careslink_v1_generation.fresh_session_is_active(
      p_owner_user_id,
      p_session_id,
      v_now
    )
  then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  v_privacy_expires_at :=
    careslink_v1_generation.fresh_privacy_proof_expires_at(
      v_job.privacy_review_id,
      v_job.owner_user_id,
      v_job.note_type,
      v_job.cleaned_facts_hash,
      v_job.schema_version,
      v_job.contract_version,
      v_now
    );
  if v_privacy_expires_at is null
    or v_payload.expires_at <= v_now
    or v_payload.expires_at > v_privacy_expires_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRIVACY_REVIEW_STALE';
  end if;

  select
    rate.catalog_version,
    rate.service_code,
    rate.unit,
    rate.points,
    rate.minimum_points,
    rate.maximum_points,
    rate.status,
    version.status as version_status
  into v_rate
  from public.service_rate_versions as version
  join public.service_rates as rate
    on rate.catalog_version = version.version
  where version.version = '2026-08-09.v1-shadow'
    and version.status = 'SHADOW'
    and rate.service_code = 'note.communication.generate'
    and rate.status = 'SHADOW'
  for share of version, rate;

  if v_rate.service_code is null
    or v_rate.unit is distinct from 'request'
    or v_rate.points is distinct from 20
    or v_rate.minimum_points is not null
    or v_rate.maximum_points is not null
    or v_rate.status is distinct from 'SHADOW'
    or v_rate.version_status is distinct from 'SHADOW'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  if exists (
      select 1
      from public.point_quotes as quote
      where quote.owner_user_id = p_owner_user_id
        and quote.service_code = 'note.communication.generate'
        and quote.idempotency_key = v_idempotency_key
    )
    or exists (
      select 1
      from public.point_reservations as reservation
      where reservation.owner_user_id = p_owner_user_id
        and reservation.service_code = 'note.communication.generate'
        and reservation.idempotency_key = v_idempotency_key
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
  end if;

  v_binding_id := extensions.gen_random_uuid();
  v_quote_id := extensions.gen_random_uuid();
  v_reservation_id := extensions.gen_random_uuid();
  v_expires_at := least(
    v_payload.expires_at,
    v_privacy_expires_at,
    v_now + interval '10 minutes'
  );

  if v_expires_at <= v_now then
    raise exception using
      errcode = 'P0001',
      message = 'PRIVACY_REVIEW_STALE';
  end if;

  insert into public.point_quotes (
    id,
    owner_user_id,
    service_code,
    catalog_version,
    points,
    quantity,
    idempotency_key,
    created_at,
    expires_at,
    shadow_only
  ) values (
    v_quote_id,
    p_owner_user_id,
    'note.communication.generate',
    '2026-08-09.v1-shadow',
    20,
    1,
    v_idempotency_key,
    v_now,
    v_expires_at,
    true
  );

  select wallet.*
  into v_wallet
  from public.point_wallets as wallet
  where wallet.owner_user_id = p_owner_user_id
    and wallet.status = 'ACTIVE'
    and wallet.shadow_only is true
  for update;

  if v_wallet.id is null then
    raise exception using
      errcode = 'P0001',
      message = 'POINTS_INSUFFICIENT';
  end if;

  insert into public.point_reservations (
    id,
    wallet_id,
    owner_user_id,
    quote_id,
    service_code,
    catalog_version,
    points,
    idempotency_key,
    status,
    reserved_at,
    expires_at,
    shadow_only
  ) values (
    v_reservation_id,
    v_wallet.id,
    p_owner_user_id,
    v_quote_id,
    'note.communication.generate',
    '2026-08-09.v1-shadow',
    20,
    v_idempotency_key,
    'RESERVED',
    v_now,
    v_expires_at,
    true
  );

  for v_lot in
    select lot.*
    from public.point_lots as lot
    where lot.wallet_id = v_wallet.id
      and lot.owner_user_id = p_owner_user_id
      and lot.remaining_points > 0
      and (lot.expires_at is null or lot.expires_at > v_now)
      and lot.shadow_only is true
    order by
      (lot.expires_at is null),
      lot.expires_at,
      (lot.source = 'TOP_UP'),
      lot.granted_at,
      lot.id
    for update
  loop
    exit when v_outstanding = 0;
    v_take := least(v_lot.remaining_points, v_outstanding);

    update public.point_lots as lot
    set remaining_points = lot.remaining_points - v_take
    where lot.id = v_lot.id
      and lot.wallet_id = v_wallet.id
      and lot.owner_user_id = p_owner_user_id
      and lot.remaining_points = v_lot.remaining_points;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'INTERNAL_FAILURE';
    end if;

    insert into public.point_reservation_allocations (
      reservation_id,
      lot_id,
      wallet_id,
      owner_user_id,
      points,
      created_at
    ) values (
      v_reservation_id,
      v_lot.id,
      v_wallet.id,
      p_owner_user_id,
      v_take,
      v_now
    );

    v_outstanding := v_outstanding - v_take;
  end loop;

  if v_outstanding <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'POINTS_INSUFFICIENT';
  end if;

  insert into public.point_ledger_entries (
    wallet_id,
    owner_user_id,
    event,
    points,
    delta,
    reservation_id,
    service_code,
    catalog_version,
    idempotency_key,
    created_at,
    shadow_only
  ) values (
    v_wallet.id,
    p_owner_user_id,
    'RESERVE',
    20,
    -20,
    v_reservation_id,
    'note.communication.generate',
    '2026-08-09.v1-shadow',
    v_idempotency_key,
    v_now,
    true
  );

  insert into
    careslink_v1_generation.communication_note_point_admissions (
      id,
      job_id,
      owner_user_id,
      quote_id,
      reservation_id,
      created_at,
      shadow_only
    ) values (
      v_binding_id,
      v_job.id,
      v_job.owner_user_id,
      v_quote_id,
      v_reservation_id,
      v_now,
      true
    );

  update careslink_v1_generation.jobs as job
  set communication_note_point_admission_id = v_binding_id
  where job.id = v_job.id
    and job.owner_user_id = v_job.owner_user_id
    and job.communication_note_point_admission_id is null
    and job.status = 'QUEUED';

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
  end if;

  set constraints
    careslink_v1_generation.communication_note_point_admissions_consistency_trigger
    immediate;
  set constraints
    careslink_v1_generation.communication_note_point_admissions_consistency_trigger
    deferred;

  -- All potentially blocking locks are now held. Re-read wall time and reject
  -- stale session, privacy, quote or lot state inside this same transaction.
  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  if not careslink_v1_generation.fresh_session_is_active(
      p_owner_user_id,
      p_session_id,
      v_now
    )
  then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;

  v_privacy_expires_at :=
    careslink_v1_generation.fresh_privacy_proof_expires_at(
      v_job.privacy_review_id,
      v_job.owner_user_id,
      v_job.note_type,
      v_job.cleaned_facts_hash,
      v_job.schema_version,
      v_job.contract_version,
      v_now
    );
  if v_privacy_expires_at is null
    or v_payload.expires_at <= v_now
    or v_payload.expires_at > v_privacy_expires_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRIVACY_REVIEW_STALE';
  end if;

  if v_expires_at <= v_now then
    raise exception using
      errcode = 'P0001',
      message = 'POINT_QUOTE_EXPIRED';
  end if;

  if exists (
    select 1
    from public.point_reservation_allocations as allocation
    join public.point_lots as lot
      on lot.id = allocation.lot_id
     and lot.wallet_id = allocation.wallet_id
     and lot.owner_user_id = allocation.owner_user_id
    where allocation.reservation_id = v_reservation_id
      and allocation.owner_user_id = p_owner_user_id
      and lot.expires_at is not null
      and lot.expires_at <= v_now
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'POINTS_INSUFFICIENT';
  end if;

  if not exists (
    select 1
    from public.service_rate_versions as version
    join public.service_rates as rate
      on rate.catalog_version = version.version
    where version.version = '2026-08-09.v1-shadow'
      and version.status = 'SHADOW'
      and rate.service_code = 'note.communication.generate'
      and rate.unit = 'request'
      and rate.points = 20
      and rate.minimum_points is null
      and rate.maximum_points is null
      and rate.status = 'SHADOW'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  return pg_catalog.jsonb_build_object(
    'created', true,
    'bindingId', v_binding_id,
    'quoteId', v_quote_id,
    'reservationId', v_reservation_id,
    'points', 20
  );
exception
  when unique_violation or foreign_key_violation or check_violation then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
end
$careslink_v1_reserve_and_bind_communication_points$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Private coordinator: durable admission first, then Points, one transaction
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_owner_api_executor;

create function
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    p_owner_user_id pg_catalog.uuid,
    p_session_id pg_catalog.uuid,
    p_admission_transport pg_catalog.text,
    p_job_id pg_catalog.uuid,
    p_payload_id pg_catalog.uuid,
    p_privacy_review_id pg_catalog.uuid,
    p_source_locale pg_catalog.text,
    p_contract_version pg_catalog.text,
    p_schema_version pg_catalog.text,
    p_cleaned_facts_hash pg_catalog.text,
    p_idempotency_hash pg_catalog.text,
    p_request_hash pg_catalog.text,
    p_payload_handle_hash pg_catalog.text,
    p_payload_expires_at pg_catalog.timestamptz
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_admit_and_reserve_communication_note$
declare
  v_admission pg_catalog.jsonb;
  v_points pg_catalog.jsonb;
  v_created pg_catalog.bool;
  v_persisted_job_id pg_catalog.uuid;
begin
  v_admission :=
    careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
      p_owner_user_id,
      p_session_id,
      p_admission_transport,
      p_job_id,
      p_payload_id,
      p_privacy_review_id,
      'communication',
      p_source_locale,
      p_contract_version,
      p_schema_version,
      p_cleaned_facts_hash,
      p_idempotency_hash,
      p_request_hash,
      p_payload_handle_hash,
      p_payload_expires_at
    );

  if v_admission is null
    or pg_catalog.jsonb_typeof(v_admission) is distinct from 'object'
    or not (v_admission ?& array['created', 'payloadAccepted', 'job'])
    or v_admission - array['created', 'payloadAccepted', 'job'] <>
      '{}'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(v_admission->'created') is distinct from
      'boolean'
    or pg_catalog.jsonb_typeof(v_admission->'payloadAccepted') is distinct from
      'boolean'
    or pg_catalog.jsonb_typeof(v_admission->'job') is distinct from 'object'
    or not (
      (v_admission->'job') ?& array[
        'attemptCount', 'createdAt', 'failureCode', 'finishedAt', 'jobId',
        'noteType', 'result', 'serviceCode', 'startedAt', 'status', 'updatedAt'
      ]
    )
    or (v_admission->'job') - array[
      'attemptCount', 'createdAt', 'failureCode', 'finishedAt', 'jobId',
      'noteType', 'result', 'serviceCode', 'startedAt', 'status', 'updatedAt'
    ] <> '{}'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(v_admission #> '{job,jobId}') is distinct from
      'string'
    or (v_admission #>> '{job,jobId}') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_admission #> '{job,noteType}' is distinct from
      '"communication"'::pg_catalog.jsonb
    or v_admission #> '{job,serviceCode}' is distinct from
      '"note.communication.generate"'::pg_catalog.jsonb
    or v_admission #> '{job,status}' is distinct from
      '"QUEUED"'::pg_catalog.jsonb
    or v_admission #> '{job,attemptCount}' is distinct from
      '0'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(v_admission #> '{job,createdAt}') is distinct
      from 'string'
    or (v_admission #>> '{job,createdAt}') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or v_admission #> '{job,updatedAt}' is distinct from
      v_admission #> '{job,createdAt}'
    or v_admission #> '{job,startedAt}' is distinct from
      'null'::pg_catalog.jsonb
    or v_admission #> '{job,finishedAt}' is distinct from
      'null'::pg_catalog.jsonb
    or v_admission #> '{job,failureCode}' is distinct from
      'null'::pg_catalog.jsonb
    or v_admission #> '{job,result}' is distinct from
      'null'::pg_catalog.jsonb
    or (
      v_admission->'created' = 'true'::pg_catalog.jsonb
      and v_admission->'payloadAccepted' is distinct from
        'true'::pg_catalog.jsonb
    )
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_created := (v_admission->>'created')::pg_catalog.bool;
  v_persisted_job_id :=
    (v_admission #>> '{job,jobId}')::pg_catalog.uuid;

  v_points :=
    careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(
      p_owner_user_id,
      p_session_id,
      v_persisted_job_id,
      v_created
    );

  if v_points is null
    or pg_catalog.jsonb_typeof(v_points) is distinct from 'object'
    or not (
      v_points ?&
        array['created', 'bindingId', 'quoteId', 'reservationId', 'points']
    )
    or v_points -
      array['created', 'bindingId', 'quoteId', 'reservationId', 'points'] <>
      '{}'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(v_points->'created') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(v_points->'bindingId') is distinct from 'string'
    or pg_catalog.jsonb_typeof(v_points->'quoteId') is distinct from 'string'
    or pg_catalog.jsonb_typeof(v_points->'reservationId') is distinct from
      'string'
    or pg_catalog.jsonb_typeof(v_points->'points') is distinct from 'number'
    or (v_points->>'bindingId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (v_points->>'quoteId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (v_points->>'reservationId') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_points->'created' is distinct from pg_catalog.to_jsonb(v_created)
    or v_points->'points' is distinct from '20'::pg_catalog.jsonb
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  return pg_catalog.jsonb_build_object(
    'created', v_admission->'created',
    'payloadAccepted', v_admission->'payloadAccepted',
    'pointsReserved', true,
    'job', v_admission->'job'
  );
end
$careslink_v1_admit_and_reserve_communication_note$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Worker isolation: paid jobs stay queued until terminal Points semantics exist
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_executor;

create or replace function
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    p_registration_digest text,
    p_worker_policy_version text,
    p_worker_policy_digest text,
    p_worker_identity_hash text,
    p_contract_version text,
    p_schema_version text
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_recover_unpaid_generation_jobs$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_policy record;
  v_candidate record;
  v_job record;
  v_attempt record;
  v_payload record;
  v_attempt_id uuid;
  v_lease_hash text;
  v_transaction_id uuid;
  v_retry_allowed boolean;
  v_base_delay_ms bigint;
  v_jitter_ms bigint;
  v_retry_delay_ms bigint;
  v_next_eligible_at timestamptz;
  v_terminal_reason text;
  v_event_hash text;
  v_recovered integer := 0;
  v_requeued integer := 0;
  v_failed integer := 0;
begin
  perform careslink_v1_generation._assert_capability();

  if p_registration_digest is null
    or p_worker_policy_version is null
    or p_worker_policy_digest is null
    or p_worker_identity_hash is null
    or p_worker_identity_hash !~ '^[a-f0-9]{64}$'
    or p_contract_version is distinct from '1.0.0-shadow.1'
    or p_schema_version is distinct from '2026-08-09.v1-shadow'
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      p_worker_identity_hash,
      p_contract_version,
      p_schema_version
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  select policy.* into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  -- Paid jobs are intentionally invisible to both recovery lanes. Their
  -- reservation cannot be terminalized until a later coordinator couples
  -- job, payload, attempt and Points state in one transaction.
  for v_candidate in
    select job.id
    from careslink_v1_generation.jobs as job
    join careslink_v1_generation.payloads as payload
      on payload.id = job.payload_id
     and payload.job_id = job.id
     and payload.owner_user_id = job.owner_user_id
    where job.status = 'QUEUED'
      and job.communication_note_point_admission_id is null
      and job.worker_policy_version = p_worker_policy_version
      and job.worker_policy_digest = p_worker_policy_digest
      and job.contract_version = p_contract_version
      and job.schema_version = p_schema_version
      and careslink_v1_generation._job_registration_binding_is_valid(
        p_registration_digest,
        job.worker_policy_version,
        job.worker_policy_digest,
        job.payload_policy_version,
        job.payload_policy_snapshot_hash,
        job.note_type,
        job.provider_policy_version,
        job.provider_policy_digest
      )
      and (
        job.created_at +
          v_policy.max_queue_age_ms * interval '1 millisecond' <= v_now
        or payload.state <> 'AVAILABLE'
        or payload.expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms
            * interval '1 millisecond'
        or payload.privacy_proof_expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms
            * interval '1 millisecond'
      )
    order by job.created_at, job.id
    for update of job skip locked
    limit v_policy.recovery_batch_limit
  loop
    select job.* into v_job
    from careslink_v1_generation.jobs as job
    where job.id = v_candidate.id
      and job.communication_note_point_admission_id is null;

    if v_job.id is null then
      continue;
    end if;

    perform careslink_v1_generation._set_owner(v_job.owner_user_id);

    select payload.* into v_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = v_job.payload_id
      and payload.job_id = v_job.id
      and payload.owner_user_id = v_job.owner_user_id
    for update;

    if v_payload.id is null then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_transaction_id := extensions.gen_random_uuid();
    v_attempt_id := extensions.gen_random_uuid();
    v_lease_hash := careslink_v1_generation._sha256_text(
      careslink_v1_generation._new_opaque_secret()
    );
    v_event_hash := careslink_v1_generation._enqueue_payload_purge(
      v_transaction_id,
      v_job.payload_id,
      v_job.id,
      v_job.owner_user_id,
      'FAILED',
      v_now
    );

    insert into careslink_v1_generation.attempts (
      id,
      job_id,
      owner_user_id,
      attempt_number,
      status,
      worker_identity_hash,
      registration_digest,
      lease_token_hash,
      acquired_at,
      last_heartbeat_at,
      lease_expires_at,
      failure_reason,
      finished_at,
      created_at,
      shadow_only,
      terminal_transaction_id
    ) values (
      v_attempt_id,
      v_job.id,
      v_job.owner_user_id,
      v_job.attempt_count + 1,
      'FAILED',
      p_worker_identity_hash,
      p_registration_digest,
      v_lease_hash,
      v_now,
      v_now,
      v_now + interval '1 millisecond',
      'PAYLOAD_UNAVAILABLE',
      v_now,
      v_now,
      true,
      v_transaction_id
    );

    update careslink_v1_generation.jobs as job
    set status = 'FAILED',
        attempt_count = v_job.attempt_count + 1,
        next_eligible_at = null,
        failure_reason = 'PAYLOAD_UNAVAILABLE',
        started_at = coalesce(job.started_at, v_now),
        finished_at = v_now,
        updated_at = v_now
    where job.id = v_job.id
      and job.status = 'QUEUED'
      and job.communication_note_point_admission_id is null;

    if not found then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_recovered := v_recovered + 1;
    v_failed := v_failed + 1;
  end loop;

  for v_candidate in
    select job.id
    from careslink_v1_generation.jobs as job
    join careslink_v1_generation.attempts as attempt
      on attempt.job_id = job.id
     and attempt.owner_user_id = job.owner_user_id
     and attempt.status = 'RUNNING'
    where job.status = 'RUNNING'
      and job.communication_note_point_admission_id is null
      and job.worker_policy_version = p_worker_policy_version
      and job.worker_policy_digest = p_worker_policy_digest
      and job.contract_version = p_contract_version
      and job.schema_version = p_schema_version
      and attempt.registration_digest = p_registration_digest
      and attempt.worker_identity_hash = p_worker_identity_hash
      and attempt.lease_expires_at <= v_now
    order by attempt.lease_expires_at, job.created_at, job.id
    for update of job skip locked
    limit greatest(v_policy.recovery_batch_limit - v_recovered, 0)
  loop
    select job.* into v_job
    from careslink_v1_generation.jobs as job
    where job.id = v_candidate.id
      and job.communication_note_point_admission_id is null;

    if v_job.id is null then
      continue;
    end if;

    perform careslink_v1_generation._set_owner(v_job.owner_user_id);

    select attempt.* into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.job_id = v_job.id
      and attempt.owner_user_id = v_job.owner_user_id
      and attempt.status = 'RUNNING'
    for update;

    if v_attempt.id is null
      or v_attempt.registration_digest <> p_registration_digest
      or v_attempt.worker_identity_hash <> p_worker_identity_hash
      or v_attempt.lease_expires_at > v_now
      or not careslink_v1_generation._job_registration_binding_is_valid(
        p_registration_digest,
        v_job.worker_policy_version,
        v_job.worker_policy_digest,
        v_job.payload_policy_version,
        v_job.payload_policy_snapshot_hash,
        v_job.note_type,
        v_job.provider_policy_version,
        v_job.provider_policy_digest
      )
    then
      continue;
    end if;

    select payload.* into v_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = v_job.payload_id
      and payload.job_id = v_job.id
      and payload.owner_user_id = v_job.owner_user_id
    for update;

    v_retry_allowed := 'LEASE_EXPIRED' = any(v_policy.retryable_outcomes)
      and v_attempt.attempt_number < v_policy.max_attempts
      and v_payload.id is not null
      and v_payload.state = 'AVAILABLE'
      and v_payload.expires_at > v_now
      and v_payload.privacy_proof_expires_at > v_now;
    v_terminal_reason := case
      when v_payload.id is null
        or v_payload.state <> 'AVAILABLE'
        or v_payload.expires_at <= v_now
        or v_payload.privacy_proof_expires_at <= v_now
      then 'PAYLOAD_UNAVAILABLE'
      else 'LEASE_EXPIRED'
    end;
    v_transaction_id := extensions.gen_random_uuid();

    if v_retry_allowed then
      v_base_delay_ms :=
        v_policy.retry_delay_ms_after_attempt[v_attempt.attempt_number];
      v_jitter_ms := case
        when v_policy.jitter_mode = 'NONE' then 0
        else floor(
          pg_catalog.random()::numeric * (v_policy.jitter_max_ms + 1)
        )::bigint
      end;
      v_retry_delay_ms := v_base_delay_ms + v_jitter_ms;
      v_next_eligible_at :=
        v_now + v_retry_delay_ms * interval '1 millisecond';

      update careslink_v1_generation.attempts as attempt
      set status = 'LEASE_EXPIRED',
          failure_reason = 'LEASE_EXPIRED',
          terminal_transaction_id = v_transaction_id,
          settlement_base_delay_ms = v_base_delay_ms,
          settlement_jitter_ms = v_jitter_ms,
          settlement_retry_delay_ms = v_retry_delay_ms,
          finished_at = v_now
      where attempt.id = v_attempt.id
        and attempt.status = 'RUNNING';

      update careslink_v1_generation.jobs as job
      set status = 'QUEUED',
          next_eligible_at = v_next_eligible_at,
          failure_reason = null,
          finished_at = null,
          updated_at = v_now
      where job.id = v_job.id
        and job.status = 'RUNNING'
        and job.communication_note_point_admission_id is null;

      if not found then
        raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
      end if;

      v_requeued := v_requeued + 1;
    else
      if v_payload.id is null then
        raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
      end if;

      v_event_hash := careslink_v1_generation._enqueue_payload_purge(
        v_transaction_id,
        v_job.payload_id,
        v_job.id,
        v_job.owner_user_id,
        'FAILED',
        v_now
      );

      update careslink_v1_generation.attempts as attempt
      set status = case
            when v_terminal_reason = 'LEASE_EXPIRED'
              then 'LEASE_EXPIRED'
            else 'FAILED'
          end,
          failure_reason = v_terminal_reason,
          terminal_transaction_id = v_transaction_id,
          settlement_base_delay_ms = null,
          settlement_jitter_ms = null,
          settlement_retry_delay_ms = null,
          finished_at = v_now
      where attempt.id = v_attempt.id
        and attempt.status = 'RUNNING';

      update careslink_v1_generation.jobs as job
      set status = 'FAILED',
          next_eligible_at = null,
          failure_reason = v_terminal_reason,
          finished_at = v_now,
          updated_at = v_now
      where job.id = v_job.id
        and job.status = 'RUNNING'
        and job.communication_note_point_admission_id is null;

      if not found then
        raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
      end if;

      v_failed := v_failed + 1;
    end if;

    v_recovered := v_recovered + 1;
  end loop;

  return jsonb_build_object(
    'recovered', v_recovered,
    'requeued', v_requeued,
    'failed', v_failed
  );
end
$careslink_v1_recover_unpaid_generation_jobs$;

create or replace function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    p_registration_digest text,
    p_worker_policy_version text,
    p_worker_policy_digest text,
    p_worker_identity_hash text,
    p_contract_version text,
    p_schema_version text
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_claim_unpaid_generation_job$
declare
  v_now timestamptz := careslink_v1_generation._server_now();
  v_policy record;
  v_job record;
  v_payload record;
  v_attempt_id uuid;
  v_lease_token text;
  v_lease_hash text;
  v_lease_expires_at timestamptz;
  v_attempt_number integer;
begin
  perform careslink_v1_generation._assert_capability();

  if p_registration_digest is null
    or p_registration_digest !~ '^[a-f0-9]{64}$'
    or p_worker_policy_version is null
    or p_worker_policy_digest is null
    or p_worker_policy_digest !~ '^[a-f0-9]{64}$'
    or p_worker_identity_hash is null
    or p_worker_identity_hash !~ '^[a-f0-9]{64}$'
    or p_contract_version is distinct from '1.0.0-shadow.1'
    or p_schema_version is distinct from '2026-08-09.v1-shadow'
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if not careslink_v1_generation._registration_accepts_new_work(
      p_registration_digest
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      p_worker_identity_hash,
      p_contract_version,
      p_schema_version
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  select policy.* into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
   and payload.job_id = job.id
   and payload.owner_user_id = job.owner_user_id
  join careslink_v1_generation.worker_registration_provider_policies
    as provider_binding
    on provider_binding.registration_digest = p_registration_digest
   and provider_binding.note_type = job.note_type
   and provider_binding.policy_version = job.provider_policy_version
   and provider_binding.policy_digest = job.provider_policy_digest
  join careslink_v1_generation.worker_registrations as registration
    on registration.registration_digest = p_registration_digest
   and registration.worker_policy_version = job.worker_policy_version
   and registration.worker_policy_digest = job.worker_policy_digest
   and registration.payload_policy_version = job.payload_policy_version
   and registration.payload_policy_snapshot_hash =
     job.payload_policy_snapshot_hash
  where job.status = 'QUEUED'
    and job.communication_note_point_admission_id is null
    and (job.next_eligible_at is null or job.next_eligible_at <= v_now)
    and job.worker_policy_version = p_worker_policy_version
    and job.worker_policy_digest = p_worker_policy_digest
    and job.contract_version = p_contract_version
    and job.schema_version = p_schema_version
    and job.attempt_count < v_policy.max_attempts
    and job.created_at +
      v_policy.max_queue_age_ms * interval '1 millisecond' > v_now
    and payload.state = 'AVAILABLE'
    and payload.expires_at > v_now
    and payload.privacy_proof_expires_at > v_now
    and payload.expires_at - v_now >=
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
    and payload.privacy_proof_expires_at - v_now >=
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
    and payload.policy_version = job.payload_policy_version
    and payload.policy_snapshot_hash = job.payload_policy_snapshot_hash
    and payload.cleaned_facts_hash = job.cleaned_facts_hash
    and payload.request_hash = job.request_hash
    and payload.note_type = job.note_type
    and payload.source_locale = job.source_locale
    and payload.privacy_review_id = job.privacy_review_id
    and careslink_v1_generation._payload_snapshot_is_valid(
      payload.policy_version,
      payload.policy_snapshot_hash,
      payload.encryption_profile_version,
      payload.backup_disposition_version
    )
  order by coalesce(job.next_eligible_at, job.created_at), job.created_at, job.id
  for update of job skip locked
  limit 1;

  if v_job.id is null then
    return jsonb_build_object('status', 'IDLE', 'claim', null);
  end if;

  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at - v_now <
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
    or v_payload.privacy_proof_expires_at - v_now <
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  v_attempt_number := v_job.attempt_count + 1;
  v_attempt_id := extensions.gen_random_uuid();
  v_lease_token := careslink_v1_generation._new_opaque_secret();
  v_lease_hash := careslink_v1_generation._sha256_text(v_lease_token);
  v_lease_expires_at := least(
    v_now + v_policy.lease_duration_ms * interval '1 millisecond',
    v_now + v_policy.attempt_deadline_ms * interval '1 millisecond',
    v_payload.expires_at,
    v_payload.privacy_proof_expires_at
  );

  insert into careslink_v1_generation.attempts (
    id,
    job_id,
    owner_user_id,
    attempt_number,
    status,
    worker_identity_hash,
    registration_digest,
    lease_token_hash,
    acquired_at,
    last_heartbeat_at,
    lease_expires_at,
    created_at,
    shadow_only
  ) values (
    v_attempt_id,
    v_job.id,
    v_job.owner_user_id,
    v_attempt_number,
    'RUNNING',
    p_worker_identity_hash,
    p_registration_digest,
    v_lease_hash,
    v_now,
    v_now,
    v_lease_expires_at,
    v_now,
    true
  );

  update careslink_v1_generation.jobs as job
  set status = 'RUNNING',
      attempt_count = v_attempt_number,
      next_eligible_at = null,
      failure_reason = null,
      started_at = coalesce(job.started_at, v_now),
      finished_at = null,
      updated_at = v_now
  where job.id = v_job.id
    and job.status = 'QUEUED'
    and job.communication_note_point_admission_id is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  return jsonb_build_object(
    'status', 'CLAIMED',
    'claim', jsonb_build_object(
      'job', jsonb_build_object(
        'jobId', v_job.id,
        'payloadId', v_job.payload_id,
        'noteType', v_job.note_type,
        'sourceLocale', v_job.source_locale,
        'serviceCode', v_job.service_code,
        'contractVersion', v_job.contract_version,
        'schemaVersion', v_job.schema_version,
        'workerPolicyVersion', v_job.worker_policy_version,
        'workerPolicyDigest', v_job.worker_policy_digest,
        'providerPolicyVersion', v_job.provider_policy_version,
        'providerPolicyDigest', v_job.provider_policy_digest,
        'payloadPolicyVersion', v_job.payload_policy_version,
        'payloadPolicySnapshotHash', v_job.payload_policy_snapshot_hash,
        'cleanedFactsHash', v_job.cleaned_facts_hash,
        'status', 'RUNNING'
      ),
      'attempt', jsonb_build_object(
        'attemptId', v_attempt_id,
        'ordinal', v_attempt_number,
        'status', 'RUNNING',
        'leaseTokenHash', v_lease_hash,
        'workerIdentityHash', p_worker_identity_hash,
        'registrationDigest', p_registration_digest
      ),
      'leaseToken', v_lease_token
    )
  );
end
$careslink_v1_claim_unpaid_generation_job$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- ---------------------------------------------------------------------------
-- Trigger attachment and exact privilege closure
-- ---------------------------------------------------------------------------

set role careslink_v1_generation_points_admission_executor;

revoke all on function
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_binding()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._deny_v1_shadow_communication_note_point_binding_mutation()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._guard_v1_shadow_communication_note_point_marker()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.bool
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor;

grant execute on function
  careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.bool
  ) to careslink_v1_generation_owner_api_executor;

-- Trigger attachment requires EXECUTE only at creation time.
grant execute on function
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_binding(),
  careslink_v1_generation._deny_v1_shadow_communication_note_point_binding_mutation(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt(),
  careslink_v1_generation._guard_v1_shadow_communication_note_point_marker()
  to careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;

create constraint trigger
  communication_note_point_admissions_consistency_trigger
after insert
on careslink_v1_generation.communication_note_point_admissions
deferrable initially deferred
for each row execute function
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_binding();

create trigger communication_note_point_admissions_immutable
before update or delete
on careslink_v1_generation.communication_note_point_admissions
for each row execute function
  careslink_v1_generation._deny_v1_shadow_communication_note_point_binding_mutation();

create trigger jobs_communication_note_point_marker_guard
before update of status, communication_note_point_admission_id,
  note_type, service_code, rate_catalog_version, shadow_only
on careslink_v1_generation.jobs
for each row execute function
  careslink_v1_generation._guard_v1_shadow_communication_note_point_marker();

-- Admission-only gates: a job carrying the new paid marker cannot change
-- status, cross into any pre-existing worker/recovery path, or accept any
-- attempt until terminal commit/release/cancel semantics are added.
create trigger attempts_communication_note_paid_admission_gate
before insert
on careslink_v1_generation.attempts
for each row
execute function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt();

revoke create on schema careslink_v1_generation
  from careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_executor;
revoke all on table
  careslink_v1_generation.communication_note_point_admissions
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
revoke all on type
  careslink_v1_generation.communication_note_point_admissions
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_points_admission_executor;
revoke execute on function
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_binding(),
  careslink_v1_generation._deny_v1_shadow_communication_note_point_binding_mutation(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt(),
  careslink_v1_generation._guard_v1_shadow_communication_note_point_marker(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()
  from careslink_v1_generation_owner;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.text,
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.timestamptz
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_points_admission_executor;

-- Reassert only the newly introduced identities; existing schema ACLs remain
-- untouched by this successor migration. Keep this assertion under the
-- function-owning role so PostgreSQL can enforce it without broadening ACLs.
revoke all on function
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.text,
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.uuid,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.timestamptz
  ) from public, anon, authenticated, service_role, authenticator;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_executor;
revoke all on function
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text,
    pg_catalog.text
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

revoke careslink_v1_generation_points_admission_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner_api_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;

commit;
