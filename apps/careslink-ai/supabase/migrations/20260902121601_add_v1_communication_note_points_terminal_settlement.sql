begin;

-- Atomic terminal settlement for the source-only Communication Note Points
-- lane. It remains default-off. This migration does not enable the capability,
-- expose a Data API RPC, deploy anything, read care data or call a model.

select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

do $careslink_v1_communication_points_terminal_preflight$
begin
  if pg_catalog.current_setting('server_version_num')::pg_catalog.int4 < 160000
    or pg_catalog.to_regrole('careslink_v1_generation_owner') is null
    or pg_catalog.to_regrole('careslink_v1_generation_executor') is null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_owner_api_executor'
    ) is null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_points_admission_executor'
    ) is null
    or pg_catalog.to_regclass(
      'careslink_v1_generation.communication_note_point_admissions'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.recover_v1_shadow_note_generation_expired(text,text,text,text,text,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._success_envelope(uuid,uuid,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._settle_denied_authority(uuid,uuid,uuid,text,text,timestamp with time zone)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._failure_envelope(uuid,uuid,text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._owner_api_job_view(uuid,uuid)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(uuid,uuid,uuid,boolean)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamptz)'
    ) is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_COMMUNICATION_NOTE_POINTS_TERMINAL_PREDECESSOR_UNSAFE';
  end if;

  if pg_catalog.to_regrole(
      'careslink_v1_generation_points_settlement_executor'
    ) is not null
    or pg_catalog.to_regclass(
      'careslink_v1_generation.communication_note_point_settlements'
    ) is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_COMMUNICATION_NOTE_POINTS_TERMINAL_IDENTITY_EXISTS';
  end if;
end
$careslink_v1_communication_points_terminal_preflight$;

-- A sixth NOLOGIN purpose role isolates terminal Points writes from admission,
-- worker and owner API execution. It receives no runtime member.
create role careslink_v1_generation_points_settlement_executor
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;

grant careslink_v1_generation_points_settlement_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Migration-only SET edges are removed again before COMMIT.
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

grant references on table public.point_reservations,
  public.point_ledger_entries
  to careslink_v1_generation_owner;

set role careslink_v1_generation_owner;

create table
  careslink_v1_generation.communication_note_point_settlements (
    id pg_catalog.uuid primary key,
    transaction_id pg_catalog.uuid not null,
    admission_id pg_catalog.uuid not null,
    job_id pg_catalog.uuid not null,
    owner_user_id pg_catalog.uuid not null,
    reservation_id pg_catalog.uuid not null,
    attempt_id pg_catalog.uuid,
    job_status pg_catalog.text not null,
    reservation_status pg_catalog.text not null,
    result_document_id pg_catalog.uuid,
    result_revision_id pg_catalog.uuid,
    result_content_hash pg_catalog.text,
    result_ref pg_catalog.text,
    reason_code pg_catalog.text,
    ledger_entry_id pg_catalog.uuid not null,
    points pg_catalog.int4 not null,
    allocation_points pg_catalog.int4 not null,
    restored_points pg_catalog.int4 not null,
    settled_at pg_catalog.timestamptz not null,
    created_at pg_catalog.timestamptz not null,
    shadow_only pg_catalog.bool not null default true,
    constraint communication_note_point_settlements_identity_unique
      unique (id, job_id, owner_user_id),
    constraint communication_note_point_settlements_transaction_unique
      unique (transaction_id),
    constraint communication_note_point_settlements_admission_unique
      unique (admission_id),
    constraint communication_note_point_settlements_job_unique
      unique (job_id),
    constraint communication_note_point_settlements_reservation_unique
      unique (reservation_id),
    constraint communication_note_point_settlements_ledger_unique
      unique (ledger_entry_id),
    constraint communication_note_point_settlements_job_owner_unique
      unique (job_id, owner_user_id),
    constraint communication_note_point_settlements_reservation_owner_unique
      unique (reservation_id, owner_user_id),
    constraint communication_note_point_settlements_admission_fk
      foreign key (admission_id, job_id, owner_user_id)
      references
        careslink_v1_generation.communication_note_point_admissions(
          id, job_id, owner_user_id
        )
      on update restrict on delete restrict,
    constraint communication_note_point_settlements_job_fk
      foreign key (job_id, owner_user_id)
      references careslink_v1_generation.jobs(id, owner_user_id)
      on update restrict on delete restrict,
    constraint communication_note_point_settlements_attempt_fk
      foreign key (attempt_id, job_id, owner_user_id)
      references careslink_v1_generation.attempts(id, job_id, owner_user_id)
      on update restrict on delete restrict,
    constraint communication_note_point_settlements_reservation_fk
      foreign key (reservation_id, owner_user_id)
      references public.point_reservations(id, owner_user_id)
      on update restrict on delete restrict,
    constraint communication_note_point_settlements_ledger_fk
      foreign key (ledger_entry_id)
      references public.point_ledger_entries(id)
      on update restrict on delete restrict,
    constraint communication_note_point_settlements_job_status_check
      check (job_status in ('SUCCEEDED', 'FAILED', 'CANCELLED')),
    constraint communication_note_point_settlements_reservation_status_check
      check (reservation_status in ('COMMITTED', 'RELEASED')),
    constraint communication_note_point_settlements_hash_check check (
      result_content_hash is null
      or result_content_hash ~ '^[a-f0-9]{64}$'
    ),
    constraint communication_note_point_settlements_points_check check (
      points = 20
      and allocation_points = 20
      and restored_points in (0, 20)
    ),
    constraint communication_note_point_settlements_shape_check check (
      (
        job_status = 'SUCCEEDED'
        and reservation_status = 'COMMITTED'
        and attempt_id is not null
        and result_document_id is not null
        and result_revision_id is not null
        and result_content_hash is not null
        and result_ref is not null
        and reason_code is null
        and restored_points = 0
      )
      or (
        job_status in ('FAILED', 'CANCELLED')
        and reservation_status = 'RELEASED'
        and (job_status <> 'FAILED' or attempt_id is not null)
        and result_document_id is null
        and result_revision_id is null
        and result_content_hash is null
        and result_ref is null
        and reason_code is not null
        and restored_points = 20
      )
    ),
    constraint communication_note_point_settlements_time_check check (
      created_at = settled_at
    ),
    constraint communication_note_point_settlements_shadow_check
      check (shadow_only is true)
  );

create index communication_note_point_settlements_owner_time_idx
  on careslink_v1_generation.communication_note_point_settlements(
    owner_user_id, settled_at desc, job_id
  );

-- Recovery is globally serialized below. This private per-registration state
-- alternates both the paid/unpaid first lane and the paid queued/running
-- priority so continuously overlapping registrations or backlogs cannot
-- permanently starve one another.
create table careslink_v1_generation.communication_note_paid_recovery_turns (
  registration_digest pg_catalog.text primary key,
  paid_first pg_catalog.bool not null,
  running_first pg_catalog.bool not null,
  created_at pg_catalog.timestamptz not null,
  updated_at pg_catalog.timestamptz not null,
  shadow_only pg_catalog.bool not null default true,
  constraint communication_note_paid_recovery_turns_registration_fk
    foreign key (registration_digest)
    references careslink_v1_generation.worker_registrations(
      registration_digest
    ) on update restrict on delete restrict,
  constraint communication_note_paid_recovery_turns_digest_check check (
    registration_digest ~ '^[a-f0-9]{64}$'
  ),
  constraint communication_note_paid_recovery_turns_time_check check (
    updated_at >= created_at
  ),
  constraint communication_note_paid_recovery_turns_shadow_check
    check (shadow_only is true)
);

alter table careslink_v1_generation.communication_note_paid_recovery_turns
  enable row level security;
alter table careslink_v1_generation.communication_note_paid_recovery_turns
  force row level security;

revoke all on table
  careslink_v1_generation.communication_note_paid_recovery_turns
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;
revoke all on type
  careslink_v1_generation.communication_note_paid_recovery_turns
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;

alter table
  careslink_v1_generation.communication_note_point_settlements
  enable row level security;
alter table
  careslink_v1_generation.communication_note_point_settlements
  force row level security;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

create policy point_reservations_points_settlement_select
  on public.point_reservations
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );
create policy point_reservations_points_settlement_update
  on public.point_reservations
  for update to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  )
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );

create policy point_allocations_points_settlement_select
  on public.point_reservation_allocations
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
  );

create policy point_lots_points_settlement_select
  on public.point_lots
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );
create policy point_lots_points_settlement_update
  on public.point_lots
  for update to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  )
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

create policy point_ledger_points_settlement_select
  on public.point_ledger_entries
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );
create policy point_ledger_points_settlement_insert
  on public.point_ledger_entries
  for insert to careslink_v1_generation_points_settlement_executor
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and service_code = 'note.communication.generate'
    and catalog_version = '2026-08-09.v1-shadow'
    and shadow_only is true
  );

create policy ai_documents_points_settlement_select
  on public.ai_documents
  for select to careslink_v1_generation_points_settlement_executor
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
create policy ai_document_revisions_points_settlement_select
  on public.ai_document_revisions
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );
create policy ai_document_sync_changes_points_settlement_select
  on public.ai_document_sync_changes
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );
create policy ai_document_receipts_points_settlement_select
  on public.ai_document_mutation_receipts
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

grant usage on schema public
  to careslink_v1_generation_points_settlement_executor;
grant select on table public.point_reservations,
  public.point_reservation_allocations,
  public.point_lots,
  public.point_ledger_entries,
  public.ai_documents,
  public.ai_document_revisions,
  public.ai_document_sync_changes,
  public.ai_document_mutation_receipts
  to careslink_v1_generation_points_settlement_executor;
grant update (status, result_ref, reason_code, terminal_at)
  on table public.point_reservations
  to careslink_v1_generation_points_settlement_executor;
grant update (remaining_points) on table public.point_lots
  to careslink_v1_generation_points_settlement_executor;
grant insert (
  id, wallet_id, owner_user_id, event, points, delta, reservation_id,
  service_code, catalog_version, idempotency_key, result_ref,
  reason_code, created_at, shadow_only
) on table public.point_ledger_entries
  to careslink_v1_generation_points_settlement_executor;

set role careslink_v1_generation_owner;
grant create on schema careslink_v1_generation
  to careslink_v1_generation_points_settlement_executor,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_executor;

-- Settlement never depends on extension PUBLIC ACLs. These narrow definer
-- helpers execute only the already-pinned capabilities of the existing
-- generation executor and expose no caller-controlled relation or function
-- identity.
create function
  careslink_v1_generation._new_communication_note_point_settlement_uuid()
returns pg_catalog.uuid
language sql
volatile
security definer
set search_path = ''
as $careslink_v1_new_point_settlement_uuid$
  select extensions.gen_random_uuid()
$careslink_v1_new_point_settlement_uuid$;

create function
  careslink_v1_generation._communication_note_point_settlement_sha256_text(
    p_value pg_catalog.text
  )
returns pg_catalog.text
language sql
immutable
strict
security definer
set search_path = ''
as $careslink_v1_point_settlement_sha256_text$
  select careslink_v1_generation._sha256_text(p_value)
$careslink_v1_point_settlement_sha256_text$;

create function
  careslink_v1_generation._communication_note_point_settlement_content_sha256(
    p_value pg_catalog.jsonb
  )
returns pg_catalog.text
language sql
immutable
strict
security definer
set search_path = ''
as $careslink_v1_point_settlement_content_sha256$
  select public.v1_shadow_content_sha256(p_value)
$careslink_v1_point_settlement_content_sha256$;

-- Global generation triggers must remain byte-compatible for unpaid jobs, but
-- the settlement role deliberately cannot see those rows through FORCE RLS.
-- This purpose-owned helper discloses only the immutable paid-marker bit to
-- that NOLOGIN role so it can skip its paid-only checks without widening RLS.
create function
  careslink_v1_generation._communication_note_job_has_point_admission(
    p_job_id pg_catalog.uuid,
    p_owner_user_id pg_catalog.uuid
  )
returns pg_catalog.bool
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_job_has_point_admission$
declare
  v_point_admission_id pg_catalog.uuid;
begin
  select job.communication_note_point_admission_id
  into v_point_admission_id
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.owner_user_id = p_owner_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  return v_point_admission_id is not null;
end
$careslink_v1_job_has_point_admission$;

revoke all on function
  careslink_v1_generation._new_communication_note_point_settlement_uuid(),
  careslink_v1_generation._communication_note_point_settlement_sha256_text(
    pg_catalog.text
  ),
  careslink_v1_generation._communication_note_point_settlement_content_sha256(
    pg_catalog.jsonb
  ),
  careslink_v1_generation._communication_note_job_has_point_admission(
    pg_catalog.uuid, pg_catalog.uuid
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;
grant execute on function
  careslink_v1_generation._new_communication_note_point_settlement_uuid(),
  careslink_v1_generation._communication_note_point_settlement_sha256_text(
    pg_catalog.text
  ),
  careslink_v1_generation._communication_note_point_settlement_content_sha256(
    pg_catalog.jsonb
  ),
  careslink_v1_generation._communication_note_job_has_point_admission(
    pg_catalog.uuid, pg_catalog.uuid
  ) to careslink_v1_generation_points_settlement_executor;

grant execute on function careslink_v1_generation._set_owner(pg_catalog.uuid)
  to careslink_v1_generation_points_settlement_executor;
grant execute on function
  careslink_v1_generation._server_time(pg_catalog.timestamptz)
  to careslink_v1_generation_points_settlement_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

revoke references on table public.point_reservations,
  public.point_ledger_entries
  from careslink_v1_generation_owner;

set role careslink_v1_generation_owner;

create policy communication_note_admissions_points_settlement_select
  on careslink_v1_generation.communication_note_point_admissions
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

create policy communication_note_settlements_points_settlement_select
  on careslink_v1_generation.communication_note_point_settlements
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );
create policy communication_note_settlements_points_settlement_insert
  on careslink_v1_generation.communication_note_point_settlements
  for insert to careslink_v1_generation_points_settlement_executor
  with check (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

create policy worker_policies_points_settlement_select
  on careslink_v1_generation.worker_policies
  for select to careslink_v1_generation_points_settlement_executor
  using (
    status = 'APPROVED'
    and shadow_only is true
  );

create policy communication_note_recovery_turns_executor_select
  on careslink_v1_generation.communication_note_paid_recovery_turns
  for select to careslink_v1_generation_executor
  using (shadow_only is true);
create policy communication_note_recovery_turns_executor_insert
  on careslink_v1_generation.communication_note_paid_recovery_turns
  for insert to careslink_v1_generation_executor
  with check (
    registration_digest ~ '^[a-f0-9]{64}$'
    and shadow_only is true
  );
create policy communication_note_recovery_turns_executor_update
  on careslink_v1_generation.communication_note_paid_recovery_turns
  for update to careslink_v1_generation_executor
  using (shadow_only is true)
  with check (
    registration_digest ~ '^[a-f0-9]{64}$'
    and shadow_only is true
  );

create policy jobs_points_settlement_select
  on careslink_v1_generation.jobs
  for select to careslink_v1_generation_points_settlement_executor
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
    and communication_note_point_admission_id is not null
    and shadow_only is true
  );
create policy jobs_points_settlement_lock
  on careslink_v1_generation.jobs
  for update to careslink_v1_generation_points_settlement_executor
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
    and communication_note_point_admission_id is not null
    and shadow_only is true
  )
  with check (false);

create policy attempts_points_settlement_select
  on careslink_v1_generation.attempts
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

create policy purge_outbox_points_settlement_select
  on careslink_v1_generation.payload_purge_outbox
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

create policy provider_evidence_points_settlement_select
  on careslink_v1_generation.provider_evidence
  for select to careslink_v1_generation_points_settlement_executor
  using (
    owner_user_id = nullif(
      pg_catalog.current_setting(
        'careslink.v1_generation_owner_user_id', true
      ),
      ''
    )::pg_catalog.uuid
    and shadow_only is true
  );

grant usage on schema careslink_v1_generation
  to careslink_v1_generation_points_settlement_executor;
grant select on table
  careslink_v1_generation.communication_note_point_admissions,
  careslink_v1_generation.communication_note_point_settlements,
  careslink_v1_generation.jobs,
  careslink_v1_generation.attempts,
  careslink_v1_generation.payload_purge_outbox,
  careslink_v1_generation.provider_evidence,
  careslink_v1_generation.worker_policies
  to careslink_v1_generation_points_settlement_executor;
grant select on table
  careslink_v1_generation.communication_note_paid_recovery_turns
  to careslink_v1_generation_executor;
grant insert (
  registration_digest, paid_first, running_first, created_at, updated_at,
  shadow_only
) on table careslink_v1_generation.communication_note_paid_recovery_turns
  to careslink_v1_generation_executor;
grant update (paid_first, running_first, updated_at) on table
  careslink_v1_generation.communication_note_paid_recovery_turns
  to careslink_v1_generation_executor;
grant update (id) on table careslink_v1_generation.jobs
  to careslink_v1_generation_points_settlement_executor;
grant insert (
  id, transaction_id, admission_id, job_id, owner_user_id, reservation_id,
  attempt_id, job_status, reservation_status, result_document_id,
  result_revision_id, result_content_hash, result_ref, reason_code,
  ledger_entry_id, points, allocation_points, restored_points, settled_at,
  created_at, shadow_only
) on table
  careslink_v1_generation.communication_note_point_settlements
  to careslink_v1_generation_points_settlement_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- -------------------------------------------------------------------------
-- Purpose-owned atomic settlement and replay assertion
-- -------------------------------------------------------------------------

set role careslink_v1_generation_points_settlement_executor;

create function
  careslink_v1_generation._settle_v1_shadow_communication_note_points(
    p_job_id pg_catalog.uuid,
    p_target_status pg_catalog.text,
    p_target_attempt_count pg_catalog.int4,
    p_result_document_id pg_catalog.uuid,
    p_result_revision_id pg_catalog.uuid,
    p_result_content_hash pg_catalog.text,
    p_reason_code pg_catalog.text
  )
returns pg_catalog.timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_settle_communication_note_points$
declare
  v_job record;
  v_policy record;
  v_binding record;
  v_reservation record;
  v_attempt record;
  v_outbox record;
  v_allocation record;
  v_existing record;
  v_now pg_catalog.timestamptz;
  v_transaction_id pg_catalog.uuid;
  v_attempt_id pg_catalog.uuid;
  v_settled_at pg_catalog.timestamptz;
  v_result_ref pg_catalog.text;
  v_terminal_event pg_catalog.text;
  v_terminal_reservation_status pg_catalog.text;
  v_settlement_id pg_catalog.uuid;
  v_ledger_entry_id pg_catalog.uuid;
  v_allocation_points pg_catalog.int8;
  v_allocation_count pg_catalog.int8;
  v_reserve_ledger_count pg_catalog.int8;
begin
  if p_job_id is null
    or p_target_status not in ('SUCCEEDED', 'FAILED', 'CANCELLED')
    or p_target_attempt_count is null
    or p_target_attempt_count < 0
    or (
      p_target_status = 'SUCCEEDED'
      and (
        p_result_document_id is null
        or p_result_revision_id is null
        or p_result_content_hash !~ '^[a-f0-9]{64}$'
        or p_reason_code is not null
      )
    )
    or (
      p_target_status in ('FAILED', 'CANCELLED')
      and (
        p_result_document_id is not null
        or p_result_revision_id is not null
        or p_result_content_hash is not null
        or p_reason_code is null
        or p_reason_code !~ '^[A-Z][A-Z0-9_]{0,63}$'
      )
    )
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  -- A caller may have changed this named constraint to IMMEDIATE. Settlement
  -- runs inside a BEFORE trigger, so consistency can only be evaluated after
  -- the outer terminal row update has landed.
  set constraints
    careslink_v1_generation.communication_note_point_settlements_consistency_trigger
    deferred;

  -- The worker/owner coordinator already owns this row lock. Reacquiring it
  -- fixes the helper's standalone lock contract without changing order.
  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
  for update;

  if v_job.id is null
    or v_job.communication_note_point_admission_id is null
    or v_job.note_type is distinct from 'communication'
    or v_job.service_code is distinct from 'note.communication.generate'
    or v_job.rate_catalog_version is distinct from '2026-08-09.v1-shadow'
    or v_job.shadow_only is distinct from true
    or v_job.status not in ('QUEUED', 'RUNNING')
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select binding.*
  into v_binding
  from careslink_v1_generation.communication_note_point_admissions
    as binding
  where binding.id = v_job.communication_note_point_admission_id
    and binding.job_id = v_job.id
    and binding.owner_user_id = v_job.owner_user_id;

  if v_binding.id is null or v_binding.shadow_only is distinct from true then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  -- Every Points mutation for one owner shares the foundation advisory lane.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_job.owner_user_id::pg_catalog.text, 0)
  );

  select reservation.*
  into v_reservation
  from public.point_reservations as reservation
  where reservation.id = v_binding.reservation_id
    and reservation.owner_user_id = v_job.owner_user_id
  for update;

  select
    coalesce(
      pg_catalog.sum(allocation.points::pg_catalog.int8),
      0::pg_catalog.int8
    ),
    pg_catalog.count(*)
  into v_allocation_points, v_allocation_count
  from public.point_reservation_allocations as allocation
  where allocation.reservation_id = v_binding.reservation_id
    and allocation.owner_user_id = v_job.owner_user_id
    and allocation.wallet_id = v_reservation.wallet_id;

  select pg_catalog.count(*)
  into v_reserve_ledger_count
  from public.point_ledger_entries as ledger
  where ledger.reservation_id = v_binding.reservation_id
    and ledger.wallet_id = v_reservation.wallet_id
    and ledger.owner_user_id = v_job.owner_user_id
    and ledger.event = 'RESERVE'
    and ledger.points = 20
    and ledger.delta = -20
    and ledger.service_code = 'note.communication.generate'
    and ledger.catalog_version = '2026-08-09.v1-shadow'
    and ledger.shadow_only is true;

  if v_reservation.id is null
    or v_reservation.quote_id is distinct from v_binding.quote_id
    or v_reservation.status is distinct from 'RESERVED'
    or v_reservation.points is distinct from 20
    or v_reservation.service_code is distinct from
      'note.communication.generate'
    or v_reservation.catalog_version is distinct from
      '2026-08-09.v1-shadow'
    or v_reservation.shadow_only is distinct from true
    or v_allocation_count < 1::pg_catalog.int8
    or v_allocation_points is distinct from 20::pg_catalog.int8
    or v_reserve_ledger_count is distinct from 1::pg_catalog.int8
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if p_target_status = 'CANCELLED' and v_job.status = 'QUEUED' then
    select outbox.*
    into v_outbox
    from careslink_v1_generation.payload_purge_outbox as outbox
    where outbox.job_id = v_job.id
      and outbox.owner_user_id = v_job.owner_user_id
      and outbox.reason = 'CANCELLED';

    if v_outbox.id is null then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    v_transaction_id := v_outbox.transaction_id;
    v_settled_at := v_outbox.requested_at;
    v_attempt_id := null;
  else
    select attempt.*
    into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.job_id = v_job.id
      and attempt.owner_user_id = v_job.owner_user_id
      and attempt.attempt_number = p_target_attempt_count
      and attempt.status = case p_target_status
        when 'SUCCEEDED' then 'SUCCEEDED'
        when 'CANCELLED' then 'CANCELLED'
        when 'FAILED' then case
          when p_reason_code = 'LEASE_EXPIRED' then 'LEASE_EXPIRED'
          else 'FAILED'
        end
      end;

    if v_attempt.id is null
      or v_attempt.terminal_transaction_id is null
      or v_attempt.finished_at is null
      or (
        p_target_status <> 'SUCCEEDED'
        and v_attempt.failure_reason is distinct from p_reason_code
      )
      or (
        p_target_status = 'SUCCEEDED'
        and v_attempt.canonical_content_hash is distinct from
          p_result_content_hash
      )
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    v_transaction_id := v_attempt.terminal_transaction_id;
    v_settled_at := v_attempt.finished_at;
    v_attempt_id := v_attempt.id;
  end if;

  select settlement.*
  into v_existing
  from careslink_v1_generation.communication_note_point_settlements
    as settlement
  where settlement.job_id = v_job.id;

  if v_existing.id is not null then
    if v_existing.transaction_id is distinct from v_transaction_id
      or v_existing.admission_id is distinct from v_binding.id
      or v_existing.reservation_id is distinct from v_binding.reservation_id
      or v_existing.attempt_id is distinct from v_attempt_id
      or v_existing.job_status is distinct from p_target_status
      or v_existing.settled_at is distinct from v_settled_at
      or v_existing.result_document_id is distinct from p_result_document_id
      or v_existing.result_revision_id is distinct from p_result_revision_id
      or v_existing.result_content_hash is distinct from p_result_content_hash
      or v_existing.reason_code is distinct from p_reason_code
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    return v_existing.settled_at;
  end if;

  select policy.*
  into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = v_job.worker_policy_version
    and policy.policy_digest = v_job.worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  if v_policy.version is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  -- Read wall time only after all potentially blocking identity/Points locks.
  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  if p_target_status = 'SUCCEEDED' then
    if v_reservation.expires_at <
        v_now + v_policy.commit_safety_margin_ms *
          interval '1 millisecond'
      or v_attempt.lease_expires_at is null
      or v_attempt.lease_expires_at <
        v_now + v_policy.commit_safety_margin_ms *
          interval '1 millisecond'
      or v_attempt.fence_id is null
      or v_attempt.fence_digest is null
      or v_attempt.fence_expires_at is null
      or v_attempt.fence_expires_at <
        v_now + v_policy.commit_safety_margin_ms *
          interval '1 millisecond'
    then
      raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
    end if;

    if not exists (
        select 1
        from public.ai_documents as document
        join public.ai_document_revisions as revision
          on revision.id = p_result_revision_id
         and revision.document_id = document.id
         and revision.owner_user_id = document.owner_user_id
        join public.ai_document_sync_changes as sync_change
          on sync_change.owner_user_id = document.owner_user_id
         and sync_change.document_id = document.id
         and sync_change.revision_id = revision.id
        join public.ai_document_mutation_receipts as mutation_receipt
          on mutation_receipt.owner_user_id = document.owner_user_id
         and mutation_receipt.document_id = document.id
         and mutation_receipt.revision_id = revision.id
         and mutation_receipt.change_id = sync_change.change_id
        join careslink_v1_generation.provider_evidence as evidence
          on evidence.attempt_id = v_attempt.id
         and evidence.job_id = v_job.id
         and evidence.owner_user_id = v_job.owner_user_id
        join careslink_v1_generation.payload_purge_outbox as outbox
          on outbox.job_id = v_job.id
         and outbox.owner_user_id = v_job.owner_user_id
         and outbox.payload_id = v_job.payload_id
        where document.id = p_result_document_id
          and document.owner_user_id = v_job.owner_user_id
          and document.current_revision_id = p_result_revision_id
          and document.current_revision_number = 1
          and document.note_type = 'communication'
          and document.source_locale = v_job.source_locale
          and document.lifecycle_status = 'IN_PROGRESS'
          and document.schema_version = v_job.schema_version
          and document.contract_version = v_job.contract_version
          and document.shadow_only is true
          and document.created_at = v_settled_at
          and document.updated_at = v_settled_at
          and revision.revision_number = 1
          and revision.base_revision_id is null
          and revision.privacy_review_id = v_job.privacy_review_id
          and revision.content_hash = p_result_content_hash
          and revision.mutation_id = 'note-generation:' ||
            careslink_v1_generation._communication_note_point_settlement_sha256_text(
              v_job.id::pg_catalog.text
            )
          and revision.schema_version = v_job.schema_version
          and revision.contract_version = v_job.contract_version
          and revision.shadow_only is true
          and revision.created_at = v_settled_at
          and sync_change.change_kind = 'DOCUMENT_UPSERTED'
          and sync_change.last_mutation_id = revision.mutation_id
          and sync_change.server_time = v_settled_at
          and sync_change.deleted_at is null
          and sync_change.shadow_only is true
          and mutation_receipt.mutation_id = revision.mutation_id
          and mutation_receipt.mutation_kind = 'CREATE_DOCUMENT'
          and mutation_receipt.request_fingerprint =
            pg_catalog.jsonb_build_object(
              'kind', 'careslink.v1.note-generation-create',
              'jobReferenceHash',
                careslink_v1_generation._communication_note_point_settlement_sha256_text(
                  v_job.id::pg_catalog.text
                ),
              'attemptReferenceHash',
                careslink_v1_generation._communication_note_point_settlement_sha256_text(
                  v_attempt.id::pg_catalog.text
                ),
              'registrationDigest', v_attempt.registration_digest,
              'contentHash', p_result_content_hash,
              'providerEvidenceHash', v_attempt.provider_evidence_hash
            )
          and mutation_receipt.acknowledgement =
            pg_catalog.jsonb_build_object(
              'status', 'SERVER_ACKNOWLEDGED',
              'mutationReferenceHash',
                careslink_v1_generation._communication_note_point_settlement_content_sha256(
                  pg_catalog.jsonb_build_object(
                    'kind', 'careslink.v1.note-generation-mutation',
                    'jobId', v_job.id::pg_catalog.text,
                    'attemptId', v_attempt.id::pg_catalog.text,
                    'registrationDigest', v_attempt.registration_digest
                  )
                ),
              'mutationKind', 'CREATE_DOCUMENT',
              'canonicalId', p_result_document_id,
              'revisionId', p_result_revision_id,
              'contentHash', p_result_content_hash,
              'serverTime',
                careslink_v1_generation._server_time(v_settled_at)
            )
          and mutation_receipt.server_time = v_settled_at
          and mutation_receipt.created_at = v_settled_at
          and mutation_receipt.shadow_only is true
          and evidence.evidence_hash = v_attempt.provider_evidence_hash
          and evidence.created_at = v_settled_at
          and evidence.shadow_only is true
          and outbox.transaction_id = v_transaction_id
          and outbox.reason = 'SUCCEEDED'
          and outbox.requested_at = v_settled_at
          and outbox.shadow_only is true
      ) then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_terminal_event := 'COMMIT';
    v_terminal_reservation_status := 'COMMITTED';
    v_result_ref := 'note-generation:' ||
      careslink_v1_generation._communication_note_point_settlement_sha256_text(
        v_job.id::pg_catalog.text || ':' ||
        v_attempt_id::pg_catalog.text || ':' ||
        p_result_document_id::pg_catalog.text || ':' ||
        p_result_revision_id::pg_catalog.text || ':' ||
        p_result_content_hash || ':' ||
        v_transaction_id::pg_catalog.text
      );
  else
    v_terminal_event := 'RELEASE';
    v_terminal_reservation_status := 'RELEASED';
    v_result_ref := null;

    -- Restore the exact immutable allocation provenance, including a lot that
    -- expired while work was running. Expiry affects new spend, not refund.
    for v_allocation in
      select allocation.*
      from public.point_reservation_allocations as allocation
      join public.point_lots as lot
        on lot.id = allocation.lot_id
       and lot.wallet_id = allocation.wallet_id
       and lot.owner_user_id = allocation.owner_user_id
      where allocation.reservation_id = v_reservation.id
        and allocation.owner_user_id = v_job.owner_user_id
      order by allocation.lot_id
      for update of lot
    loop
      update public.point_lots as lot
      set remaining_points = lot.remaining_points + v_allocation.points
      where lot.id = v_allocation.lot_id
        and lot.wallet_id = v_allocation.wallet_id
        and lot.owner_user_id = v_allocation.owner_user_id
        and lot.remaining_points + v_allocation.points <= lot.original_points;

      if not found then
        raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
      end if;
    end loop;
  end if;

  v_settlement_id :=
    careslink_v1_generation._new_communication_note_point_settlement_uuid();
  v_ledger_entry_id :=
    careslink_v1_generation._new_communication_note_point_settlement_uuid();

  insert into public.point_ledger_entries (
    id, wallet_id, owner_user_id, event, points, delta, reservation_id,
    service_code, catalog_version, idempotency_key, result_ref,
    reason_code, created_at, shadow_only
  ) values (
    v_ledger_entry_id,
    v_reservation.wallet_id,
    v_job.owner_user_id,
    v_terminal_event,
    20,
    case when v_terminal_event = 'COMMIT' then 0 else 20 end,
    v_reservation.id,
    'note.communication.generate',
    '2026-08-09.v1-shadow',
    v_reservation.idempotency_key,
    v_result_ref,
    p_reason_code,
    v_settled_at,
    true
  );

  insert into
    careslink_v1_generation.communication_note_point_settlements (
      id, transaction_id, admission_id, job_id, owner_user_id,
      reservation_id, attempt_id, job_status, reservation_status,
      result_document_id, result_revision_id, result_content_hash,
      result_ref, reason_code, ledger_entry_id, points, allocation_points,
      restored_points, settled_at, created_at, shadow_only
    ) values (
      v_settlement_id,
      v_transaction_id,
      v_binding.id,
      v_job.id,
      v_job.owner_user_id,
      v_reservation.id,
      v_attempt_id,
      p_target_status,
      v_terminal_reservation_status,
      p_result_document_id,
      p_result_revision_id,
      p_result_content_hash,
      v_result_ref,
      p_reason_code,
      v_ledger_entry_id,
      20,
      v_allocation_points::pg_catalog.int4,
      case when v_terminal_event = 'COMMIT' then 0 else 20 end,
      v_settled_at,
      v_settled_at,
      true
    );

  update public.point_reservations as reservation
  set status = v_terminal_reservation_status,
      result_ref = v_result_ref,
      reason_code = p_reason_code,
      terminal_at = v_settled_at
  where reservation.id = v_reservation.id
    and reservation.owner_user_id = v_job.owner_user_id
    and reservation.status = 'RESERVED';

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  return v_settled_at;
exception
  when unique_violation or foreign_key_violation or check_violation then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
end
$careslink_v1_settle_communication_note_points$;

create function
  careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
    p_job_id pg_catalog.uuid,
    p_owner_user_id pg_catalog.uuid,
    p_attempt_id pg_catalog.uuid
  )
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_assert_communication_note_point_state$
declare
  v_job record;
  v_binding record;
  v_reservation record;
  v_settlement record;
  v_terminal_ledger record;
  v_attempt record;
  v_outbox record;
  v_allocation_points pg_catalog.int8;
  v_allocation_count pg_catalog.int8;
  v_allocation_wallet_mismatch_count pg_catalog.int8;
  v_reserve_ledger_count pg_catalog.int8;
  v_terminal_ledger_count pg_catalog.int8;
  v_settlement_count pg_catalog.int8;
  v_supplied_attempt_is_retry pg_catalog.bool := false;
begin
  if p_job_id is null or p_owner_user_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  perform careslink_v1_generation._set_owner(p_owner_user_id);

  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.owner_user_id = p_owner_user_id;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  if v_job.communication_note_point_admission_id is null then
    return;
  end if;
  if v_job.note_type is distinct from 'communication'
    or v_job.service_code is distinct from 'note.communication.generate'
    or v_job.rate_catalog_version is distinct from '2026-08-09.v1-shadow'
    or v_job.shadow_only is distinct from true
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select binding.*
  into v_binding
  from careslink_v1_generation.communication_note_point_admissions
    as binding
  where binding.id = v_job.communication_note_point_admission_id
    and binding.job_id = v_job.id
    and binding.owner_user_id = v_job.owner_user_id;

  select reservation.*
  into v_reservation
  from public.point_reservations as reservation
  where reservation.id = v_binding.reservation_id
    and reservation.owner_user_id = v_job.owner_user_id;

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
  where allocation.reservation_id = v_binding.reservation_id
    and allocation.owner_user_id = v_job.owner_user_id;

  select pg_catalog.count(*)
  into v_reserve_ledger_count
  from public.point_ledger_entries as ledger
  where ledger.reservation_id = v_binding.reservation_id
    and ledger.owner_user_id = v_job.owner_user_id
    and ledger.wallet_id = v_reservation.wallet_id
    and ledger.event = 'RESERVE'
    and ledger.points = 20
    and ledger.delta = -20
    and ledger.service_code = 'note.communication.generate'
    and ledger.catalog_version = '2026-08-09.v1-shadow'
    and ledger.shadow_only is true;

  select pg_catalog.count(*)
  into v_settlement_count
  from careslink_v1_generation.communication_note_point_settlements
    as settlement
  where settlement.job_id = v_job.id
    and settlement.owner_user_id = v_job.owner_user_id;

  select settlement.*
  into v_settlement
  from careslink_v1_generation.communication_note_point_settlements
    as settlement
  where settlement.job_id = v_job.id
    and settlement.owner_user_id = v_job.owner_user_id;

  select pg_catalog.count(*)
  into v_terminal_ledger_count
  from public.point_ledger_entries as ledger
  where ledger.reservation_id = v_binding.reservation_id
    and ledger.owner_user_id = v_job.owner_user_id
    and ledger.event in ('COMMIT', 'RELEASE', 'EXPIRE');

  select ledger.*
  into v_terminal_ledger
  from public.point_ledger_entries as ledger
  where ledger.reservation_id = v_binding.reservation_id
    and ledger.owner_user_id = v_job.owner_user_id
    and ledger.event in ('COMMIT', 'RELEASE', 'EXPIRE');

  if v_binding.id is null
    or v_binding.quote_id is null
    or v_binding.reservation_id is null
    or v_binding.shadow_only is distinct from true
    or v_reservation.id is null
    or v_reservation.quote_id is distinct from v_binding.quote_id
    or v_reservation.points is distinct from 20
    or v_reservation.service_code is distinct from
      'note.communication.generate'
    or v_reservation.catalog_version is distinct from
      '2026-08-09.v1-shadow'
    or v_reservation.shadow_only is distinct from true
    or v_allocation_count < 1::pg_catalog.int8
    or v_allocation_points is distinct from 20::pg_catalog.int8
    or v_allocation_wallet_mismatch_count is distinct from 0::pg_catalog.int8
    or v_reserve_ledger_count is distinct from 1::pg_catalog.int8
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if p_attempt_id is not null then
    select attempt.*
    into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.id = p_attempt_id
      and attempt.job_id = v_job.id
      and attempt.owner_user_id = v_job.owner_user_id;
    if v_attempt.id is null then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    v_supplied_attempt_is_retry :=
      v_attempt.terminal_transaction_id is not null
      and v_attempt.finished_at is not null
      and v_attempt.failure_reason in (
        'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT'
      )
      and v_attempt.settlement_base_delay_ms is not null
      and v_attempt.settlement_jitter_ms is not null
      and v_attempt.settlement_retry_delay_ms is not null
      and v_attempt.status = case v_attempt.failure_reason
        when 'LEASE_EXPIRED' then 'LEASE_EXPIRED'
        else 'FAILED'
      end;
  end if;

  if v_job.status in ('QUEUED', 'RUNNING') then
    if v_reservation.status is distinct from 'RESERVED'
      or v_reservation.result_ref is not null
      or v_reservation.reason_code is not null
      or v_reservation.terminal_at is not null
      or v_settlement_count is distinct from 0::pg_catalog.int8
      or v_terminal_ledger_count is distinct from 0::pg_catalog.int8
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    return;
  end if;

  if v_job.status not in ('SUCCEEDED', 'FAILED', 'CANCELLED')
    or v_settlement_count is distinct from 1::pg_catalog.int8
    or v_terminal_ledger_count is distinct from 1::pg_catalog.int8
    or v_settlement.admission_id is distinct from v_binding.id
    or v_settlement.reservation_id is distinct from v_reservation.id
    or v_settlement.job_status is distinct from v_job.status
    or v_settlement.ledger_entry_id is distinct from v_terminal_ledger.id
    or (
      p_attempt_id is not null
      and not v_supplied_attempt_is_retry
      and v_settlement.attempt_id is distinct from p_attempt_id
    )
    or v_settlement.points is distinct from 20
    or v_settlement.allocation_points is distinct from 20
    or v_settlement.settled_at is distinct from v_job.finished_at
    or v_terminal_ledger.wallet_id is distinct from v_reservation.wallet_id
    or v_terminal_ledger.points is distinct from 20
    or v_terminal_ledger.service_code is distinct from
      'note.communication.generate'
    or v_terminal_ledger.catalog_version is distinct from
      '2026-08-09.v1-shadow'
    or v_terminal_ledger.created_at is distinct from v_settlement.settled_at
    or v_terminal_ledger.shadow_only is distinct from true
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if v_settlement.attempt_id is not null then
    select attempt.*
    into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.id = v_settlement.attempt_id
      and attempt.job_id = v_job.id
      and attempt.owner_user_id = v_job.owner_user_id;

    if v_attempt.id is null
      or v_attempt.terminal_transaction_id is distinct from
        v_settlement.transaction_id
      or v_attempt.finished_at is distinct from v_settlement.settled_at
      or (
        v_job.status = 'SUCCEEDED'
        and (
          v_attempt.status is distinct from 'SUCCEEDED'
          or v_attempt.canonical_content_hash is distinct from
            v_job.result_content_hash
        )
      )
      or (
        v_job.status in ('FAILED', 'CANCELLED')
        and v_attempt.failure_reason is distinct from v_job.failure_reason
      )
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
  elsif v_job.status is distinct from 'CANCELLED' then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select outbox.*
  into v_outbox
  from careslink_v1_generation.payload_purge_outbox as outbox
  where outbox.job_id = v_job.id
    and outbox.owner_user_id = v_job.owner_user_id
    and outbox.payload_id = v_job.payload_id;

  if v_outbox.id is null
    or v_outbox.transaction_id is distinct from v_settlement.transaction_id
    or v_outbox.requested_at is distinct from v_settlement.settled_at
    or v_outbox.reason is distinct from (case v_job.status
      when 'SUCCEEDED' then 'SUCCEEDED'
      when 'FAILED' then 'FAILED'
      when 'CANCELLED' then 'CANCELLED'
    end)
    or v_outbox.shadow_only is distinct from true
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if v_job.status = 'SUCCEEDED' then
    if not exists (
        select 1
        from public.ai_documents as document
        join public.ai_document_revisions as revision
          on revision.id = v_job.result_revision_id
         and revision.document_id = document.id
         and revision.owner_user_id = document.owner_user_id
        join public.ai_document_sync_changes as sync_change
          on sync_change.owner_user_id = document.owner_user_id
         and sync_change.document_id = document.id
         and sync_change.revision_id = revision.id
        join public.ai_document_mutation_receipts as mutation_receipt
          on mutation_receipt.owner_user_id = document.owner_user_id
         and mutation_receipt.document_id = document.id
         and mutation_receipt.revision_id = revision.id
         and mutation_receipt.change_id = sync_change.change_id
        join careslink_v1_generation.provider_evidence as evidence
          on evidence.attempt_id = v_attempt.id
         and evidence.job_id = v_job.id
         and evidence.owner_user_id = v_job.owner_user_id
        where document.id = v_job.result_document_id
          and document.owner_user_id = v_job.owner_user_id
          and document.note_type = 'communication'
          and document.source_locale = v_job.source_locale
          and document.schema_version = v_job.schema_version
          and document.contract_version = v_job.contract_version
          and document.shadow_only is true
          and document.created_at = v_settlement.settled_at
          and revision.revision_number = 1
          and revision.base_revision_id is null
          and revision.privacy_review_id = v_job.privacy_review_id
          and revision.content_hash = v_job.result_content_hash
          and revision.mutation_id = 'note-generation:' ||
            careslink_v1_generation._communication_note_point_settlement_sha256_text(
              v_job.id::pg_catalog.text
            )
          and revision.schema_version = v_job.schema_version
          and revision.contract_version = v_job.contract_version
          and revision.shadow_only is true
          and revision.created_at = v_settlement.settled_at
          and sync_change.change_kind = 'DOCUMENT_UPSERTED'
          and sync_change.last_mutation_id = revision.mutation_id
          and sync_change.server_time = v_settlement.settled_at
          and sync_change.deleted_at is null
          and sync_change.shadow_only is true
          and mutation_receipt.mutation_id = revision.mutation_id
          and mutation_receipt.mutation_kind = 'CREATE_DOCUMENT'
          and mutation_receipt.request_fingerprint =
            pg_catalog.jsonb_build_object(
              'kind', 'careslink.v1.note-generation-create',
              'jobReferenceHash',
                careslink_v1_generation._communication_note_point_settlement_sha256_text(
                  v_job.id::pg_catalog.text
                ),
              'attemptReferenceHash',
                careslink_v1_generation._communication_note_point_settlement_sha256_text(
                  v_attempt.id::pg_catalog.text
                ),
              'registrationDigest', v_attempt.registration_digest,
              'contentHash', v_job.result_content_hash,
              'providerEvidenceHash', v_attempt.provider_evidence_hash
            )
          and mutation_receipt.acknowledgement =
            pg_catalog.jsonb_build_object(
              'status', 'SERVER_ACKNOWLEDGED',
              'mutationReferenceHash',
                careslink_v1_generation._communication_note_point_settlement_content_sha256(
                  pg_catalog.jsonb_build_object(
                    'kind', 'careslink.v1.note-generation-mutation',
                    'jobId', v_job.id::pg_catalog.text,
                    'attemptId', v_attempt.id::pg_catalog.text,
                    'registrationDigest', v_attempt.registration_digest
                  )
                ),
              'mutationKind', 'CREATE_DOCUMENT',
              'canonicalId', v_job.result_document_id,
              'revisionId', v_job.result_revision_id,
              'contentHash', v_job.result_content_hash,
              'serverTime',
                careslink_v1_generation._server_time(
                  v_settlement.settled_at
                )
            )
          and mutation_receipt.server_time = v_settlement.settled_at
          and mutation_receipt.created_at = v_settlement.settled_at
          and mutation_receipt.shadow_only is true
          and evidence.evidence_hash = v_attempt.provider_evidence_hash
          and evidence.created_at = v_settlement.settled_at
          and evidence.shadow_only is true
      )
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    if v_reservation.status is distinct from 'COMMITTED'
      or v_reservation.terminal_at is distinct from v_settlement.settled_at
      or v_reservation.result_ref is distinct from v_settlement.result_ref
      or v_reservation.reason_code is not null
      or v_settlement.reservation_status is distinct from 'COMMITTED'
      or v_settlement.result_document_id is distinct from
        v_job.result_document_id
      or v_settlement.result_revision_id is distinct from
        v_job.result_revision_id
      or v_settlement.result_content_hash is distinct from
        v_job.result_content_hash
      or v_settlement.result_ref is distinct from
        'note-generation:' ||
          careslink_v1_generation._communication_note_point_settlement_sha256_text(
          v_job.id::pg_catalog.text || ':' ||
          v_attempt.id::pg_catalog.text || ':' ||
          v_job.result_document_id::pg_catalog.text || ':' ||
          v_job.result_revision_id::pg_catalog.text || ':' ||
          v_job.result_content_hash || ':' ||
          v_settlement.transaction_id::pg_catalog.text
        )
      or v_settlement.reason_code is not null
      or v_settlement.restored_points is distinct from 0
      or v_terminal_ledger.event is distinct from 'COMMIT'
      or v_terminal_ledger.delta is distinct from 0
      or v_terminal_ledger.result_ref is distinct from v_settlement.result_ref
      or v_terminal_ledger.reason_code is not null
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
  else
    if v_reservation.status is distinct from 'RELEASED'
      or v_reservation.terminal_at is distinct from v_settlement.settled_at
      or v_reservation.result_ref is not null
      or v_reservation.reason_code is distinct from v_job.failure_reason
      or v_settlement.reservation_status is distinct from 'RELEASED'
      or v_settlement.reason_code is distinct from v_job.failure_reason
      or v_settlement.restored_points is distinct from 20
      or v_terminal_ledger.event is distinct from 'RELEASE'
      or v_terminal_ledger.delta is distinct from 20
      or v_terminal_ledger.result_ref is not null
      or v_terminal_ledger.reason_code is distinct from v_job.failure_reason
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
  end if;
end
$careslink_v1_assert_communication_note_point_state$;

create function
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_settlement()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_enforce_communication_note_point_settlement$
begin
  perform careslink_v1_generation._set_owner(new.owner_user_id);
  perform
    careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
      new.job_id,
      new.owner_user_id,
      new.attempt_id
    );
  return new;
end
$careslink_v1_enforce_communication_note_point_settlement$;

create function
  careslink_v1_generation._deny_v1_shadow_communication_note_point_settlement_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_deny_communication_note_point_settlement_mutation$
begin
  raise exception using errcode = 'P0001', message = 'IMMUTABLE_BINDING';
end
$careslink_v1_deny_communication_note_point_settlement_mutation$;

-- Retire the admission-only quarantine functions before reusing their exact
-- identities for terminal-aware guards.
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);
drop trigger point_reservations_communication_note_paid_admission_gate
  on public.point_reservations;
set role careslink_v1_generation_owner;
drop trigger jobs_communication_note_point_marker_guard
  on careslink_v1_generation.jobs;
drop trigger attempts_communication_note_paid_admission_gate
  on careslink_v1_generation.attempts;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);
set role careslink_v1_generation_points_admission_executor;
drop function
  careslink_v1_generation._guard_v1_shadow_communication_note_point_marker();
drop function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt();
drop function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation();
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);
set role careslink_v1_generation_points_settlement_executor;

create function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_guard_paid_reservation_terminal$
declare
  v_owner_user_id pg_catalog.uuid;
  v_reservation_id pg_catalog.uuid;
  v_binding record;
  v_settlement record;
  v_previous_owner_setting pg_catalog.text := pg_catalog.current_setting(
    'careslink.v1_generation_owner_user_id',
    true
  );
begin
  v_owner_user_id := old.owner_user_id;
  v_reservation_id := old.id;
  perform careslink_v1_generation._set_owner(v_owner_user_id);

  select binding.*
  into v_binding
  from careslink_v1_generation.communication_note_point_admissions
    as binding
  where binding.reservation_id = v_reservation_id
    and binding.owner_user_id = v_owner_user_id;

  if v_binding.id is null then
    perform pg_catalog.set_config(
      'careslink.v1_generation_owner_user_id',
      coalesce(v_previous_owner_setting, ''),
      true
    );
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE'
    or old.status is distinct from 'RESERVED'
    or new.id is distinct from old.id
    or new.wallet_id is distinct from old.wallet_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.quote_id is distinct from old.quote_id
    or new.service_code is distinct from old.service_code
    or new.catalog_version is distinct from old.catalog_version
    or new.points is distinct from old.points
    or new.idempotency_key is distinct from old.idempotency_key
    or new.reserved_at is distinct from old.reserved_at
    or new.expires_at is distinct from old.expires_at
    or new.shadow_only is distinct from old.shadow_only
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;

  select settlement.*
  into v_settlement
  from careslink_v1_generation.communication_note_point_settlements
    as settlement
  where settlement.admission_id = v_binding.id
    and settlement.job_id = v_binding.job_id
    and settlement.owner_user_id = v_owner_user_id
    and settlement.reservation_id = v_reservation_id;

  if v_settlement.id is null
    or new.status is distinct from v_settlement.reservation_status
    or new.result_ref is distinct from v_settlement.result_ref
    or new.reason_code is distinct from v_settlement.reason_code
    or new.terminal_at is distinct from v_settlement.settled_at
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';
  end if;

  return new;
end
$careslink_v1_guard_paid_reservation_terminal$;

create function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_guard_paid_attempt_terminal$
declare
  v_job record;
  v_reservation record;
  v_now pg_catalog.timestamptz;
begin
  perform careslink_v1_generation._set_owner(new.owner_user_id);

  if not careslink_v1_generation._communication_note_job_has_point_admission(
    new.job_id,
    new.owner_user_id
  ) then
    return new;
  end if;

  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = new.job_id
    and job.owner_user_id = new.owner_user_id;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  select reservation.*
  into v_reservation
  from careslink_v1_generation.communication_note_point_admissions
    as binding
  join public.point_reservations as reservation
    on reservation.id = binding.reservation_id
   and reservation.owner_user_id = binding.owner_user_id
  where binding.id = v_job.communication_note_point_admission_id
    and binding.job_id = v_job.id
    and binding.owner_user_id = v_job.owner_user_id;

  if v_reservation.id is null
    or v_reservation.status is distinct from 'RESERVED'
    or v_reservation.points is distinct from 20
    or v_reservation.service_code is distinct from
      'note.communication.generate'
    or v_reservation.catalog_version is distinct from
      '2026-08-09.v1-shadow'
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'RUNNING'
      or new.id is distinct from old.id
      or new.job_id is distinct from old.job_id
      or new.owner_user_id is distinct from old.owner_user_id
      or new.attempt_number is distinct from old.attempt_number
      or new.worker_identity_hash is distinct from old.worker_identity_hash
      or new.registration_digest is distinct from old.registration_digest
      or new.lease_token_hash is distinct from old.lease_token_hash
      or new.acquired_at is distinct from old.acquired_at
      or new.created_at is distinct from old.created_at
      or new.shadow_only is distinct from old.shadow_only
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
  elsif new.status not in ('RUNNING', 'FAILED') then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if new.status = 'RUNNING' then
    v_now := pg_catalog.date_trunc(
      'milliseconds',
      pg_catalog.clock_timestamp()
    );
    if v_reservation.expires_at <= v_now
      or new.lease_expires_at is null
      or new.lease_expires_at <= v_now
    then
      raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
    end if;

    -- A heartbeat computes its candidate renewal before reaching this trigger.
    -- Recheck the persisted authority with a fresh post-lock clock so waiting
    -- past the old lease (or an already-issued fence) cannot revive paid work.
    if tg_op = 'UPDATE' then
      if old.lease_expires_at is null
        or old.lease_expires_at <= v_now
        or (
          old.fence_id is not null
          and (
            old.fence_digest is null
            or old.fence_expires_at is null
            or old.fence_expires_at <= v_now
          )
        )
      then
        raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
      end if;
    end if;

    new.lease_expires_at := least(
      new.lease_expires_at,
      v_reservation.expires_at,
      coalesce(
        new.fence_expires_at,
        'infinity'::pg_catalog.timestamptz
      )
    );
    if new.fence_expires_at is not null then
      new.fence_expires_at := least(
        new.fence_expires_at,
        v_reservation.expires_at
      );
    end if;
    if new.lease_expires_at <= v_now
      or new.lease_expires_at <= new.acquired_at
      or new.last_heartbeat_at >= new.lease_expires_at
      or (
        new.fence_id is not null
        and (
          new.fence_digest is null
          or new.fenced_at is null
          or new.fence_expires_at is null
          or new.fence_expires_at <= v_now
          or new.fence_expires_at <= new.fenced_at
        )
      )
      or (
        new.fence_id is null
        and (
          new.fence_digest is not null
          or new.fenced_at is not null
          or new.fence_expires_at is not null
        )
      )
    then
      raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
    end if;
  end if;

  return new;
end
$careslink_v1_guard_paid_attempt_terminal$;

create function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_payload_grant()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_guard_paid_payload_grant_terminal$
declare
  v_job record;
  v_attempt record;
  v_reservation_expires_at pg_catalog.timestamptz;
  v_now pg_catalog.timestamptz;
begin
  perform careslink_v1_generation._set_owner(new.owner_user_id);

  if not careslink_v1_generation._communication_note_job_has_point_admission(
    new.job_id,
    new.owner_user_id
  ) then
    return new;
  end if;

  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = new.job_id
    and job.owner_user_id = new.owner_user_id;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.payload_id is distinct from old.payload_id
    or new.job_id is distinct from old.job_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.attempt_id is distinct from old.attempt_id
    or new.registration_digest is distinct from old.registration_digest
    or new.lease_token_hash is distinct from old.lease_token_hash
    or new.request_hash is distinct from old.request_hash
    or new.authorized_at is distinct from old.authorized_at
    or new.created_at is distinct from old.created_at
    or new.shadow_only is distinct from old.shadow_only
  ) then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if new.status in ('ISSUED', 'CONSUMED') then
    v_reservation_expires_at :=
      careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
        v_job.id,
        v_job.owner_user_id
      );
    v_now := pg_catalog.date_trunc(
      'milliseconds',
      pg_catalog.clock_timestamp()
    );
    if v_reservation_expires_at <= v_now then
      raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
    end if;

    select attempt.*
    into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.id = new.attempt_id
      and attempt.job_id = new.job_id
      and attempt.owner_user_id = new.owner_user_id;
    if v_attempt.id is null or v_attempt.status is distinct from 'RUNNING' then
      raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
    end if;

    new.expires_at := least(
      new.expires_at,
      v_reservation_expires_at,
      v_attempt.lease_expires_at,
      coalesce(v_attempt.fence_expires_at, 'infinity'::pg_catalog.timestamptz)
    );
    if new.expires_at <= new.authorized_at
      or (
        new.status = 'CONSUMED'
        and (
          new.consumed_at is null
          or new.consumed_at >= v_reservation_expires_at
        )
      )
    then
      raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
    end if;
  end if;

  return new;
end
$careslink_v1_guard_paid_payload_grant_terminal$;

create function
  careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_coordinate_communication_note_point_terminal$
declare
  v_reservation record;
  v_now pg_catalog.timestamptz;
  v_settled_at pg_catalog.timestamptz;
begin
  if old.communication_note_point_admission_id is not null
    and new.communication_note_point_admission_id is distinct from
      old.communication_note_point_admission_id
  then
    raise exception using errcode = 'P0001', message = 'IMMUTABLE_BINDING';
  end if;

  if new.communication_note_point_admission_id is not null
    and (
      new.note_type is distinct from 'communication'
      or new.service_code is distinct from 'note.communication.generate'
      or new.rate_catalog_version is distinct from '2026-08-09.v1-shadow'
      or new.shadow_only is distinct from true
    )
  then
    raise exception using errcode = 'P0001', message = 'IDENTITY_LINK_CONFLICT';
  end if;

  -- Initial admission only adds the marker to the already locked QUEUED row.
  if old.communication_note_point_admission_id is null then
    if new.communication_note_point_admission_id is not null
      and (
        old.status is distinct from 'QUEUED'
        or new.status is distinct from 'QUEUED'
      )
    then
      raise exception using
        errcode = 'P0001',
        message = 'IDENTITY_LINK_CONFLICT';
    end if;
    return new;
  end if;

  perform careslink_v1_generation._set_owner(new.owner_user_id);

  if new.status is not distinct from old.status then
    if old.status in ('SUCCEEDED', 'FAILED', 'CANCELLED')
      and new is distinct from old
    then
      raise exception using
        errcode = 'P0001',
        message = 'IMMUTABLE_TERMINAL';
    end if;
    return new;
  end if;

  if old.status = 'RUNNING' and new.status = 'QUEUED' then
    perform
      careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
        old.id,
        old.owner_user_id,
        null
      );

    -- RUNNING -> QUEUED is retry retention: no settlement, no lot restore.
    -- A reservation that expires at this instant is retained only until the
    -- paid recovery lane atomically fails the job and releases its lots; it
    -- can never be claimed again.
    return new;
  end if;

  if old.status = 'QUEUED' and new.status = 'RUNNING' then
    perform
      careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
        old.id,
        old.owner_user_id,
        null
      );

    select reservation.*
    into v_reservation
    from careslink_v1_generation.communication_note_point_admissions
      as binding
    join public.point_reservations as reservation
      on reservation.id = binding.reservation_id
     and reservation.owner_user_id = binding.owner_user_id
    where binding.id = old.communication_note_point_admission_id
      and binding.job_id = old.id
      and binding.owner_user_id = old.owner_user_id;

    v_now := pg_catalog.date_trunc(
      'milliseconds',
      pg_catalog.clock_timestamp()
    );
    if v_reservation.id is null
      or v_reservation.status is distinct from 'RESERVED'
      or v_reservation.expires_at <= v_now
    then
      raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
    end if;
    return new;
  end if;

  if new.status in ('SUCCEEDED', 'FAILED', 'CANCELLED')
    and old.status in ('QUEUED', 'RUNNING')
  then
    if (new.status = 'SUCCEEDED' and old.status <> 'RUNNING')
      or (
        old.status = 'RUNNING'
        and new.attempt_count is distinct from old.attempt_count
      )
      or (
        old.status = 'QUEUED'
        and new.status = 'FAILED'
        and new.attempt_count is distinct from old.attempt_count + 1
      )
      or (
        old.status = 'QUEUED'
        and new.status = 'CANCELLED'
        and new.attempt_count is distinct from old.attempt_count
      )
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    v_settled_at :=
      careslink_v1_generation._settle_v1_shadow_communication_note_points(
        old.id,
        new.status,
        new.attempt_count,
        new.result_document_id,
        new.result_revision_id,
        new.result_content_hash,
        new.failure_reason
      );
    new.finished_at := v_settled_at;
    new.updated_at := v_settled_at;
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'INVALID_STATE_TRANSITION';
end
$careslink_v1_coordinate_communication_note_point_terminal$;

create function
  careslink_v1_generation._communication_note_paid_reservation_expires_at(
    p_job_id pg_catalog.uuid,
    p_owner_user_id pg_catalog.uuid
  )
returns pg_catalog.timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_paid_reservation_expires_at$
declare
  v_previous_owner_setting pg_catalog.text := pg_catalog.current_setting(
    'careslink.v1_generation_owner_user_id',
    true
  );
  v_expires_at pg_catalog.timestamptz;
begin
  if p_job_id is null or p_owner_user_id is null then
    return null;
  end if;
  perform careslink_v1_generation._set_owner(p_owner_user_id);

  select reservation.expires_at
  into v_expires_at
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.communication_note_point_admissions
    as binding
    on binding.id = job.communication_note_point_admission_id
   and binding.job_id = job.id
   and binding.owner_user_id = job.owner_user_id
  join public.point_reservations as reservation
    on reservation.id = binding.reservation_id
   and reservation.owner_user_id = binding.owner_user_id
  where job.id = p_job_id
    and job.owner_user_id = p_owner_user_id
    and job.note_type = 'communication'
    and job.service_code = 'note.communication.generate'
    and job.rate_catalog_version = '2026-08-09.v1-shadow'
    and job.shadow_only is true
    and binding.shadow_only is true
    and reservation.status = 'RESERVED'
    and reservation.points = 20
    and reservation.service_code = 'note.communication.generate'
    and reservation.catalog_version = '2026-08-09.v1-shadow'
    and reservation.shadow_only is true;

  perform pg_catalog.set_config(
    'careslink.v1_generation_owner_user_id',
    coalesce(v_previous_owner_setting, ''),
    true
  );
  return v_expires_at;
end
$careslink_v1_paid_reservation_expires_at$;

create function
  careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
    p_job_id pg_catalog.uuid,
    p_owner_user_id pg_catalog.uuid
  )
returns pg_catalog.timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_lock_paid_reservation$
declare
  v_reservation record;
begin
  if p_job_id is null or p_owner_user_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  perform careslink_v1_generation._set_owner(p_owner_user_id);
  perform
    careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
      p_job_id,
      p_owner_user_id,
      null
    );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_user_id::pg_catalog.text, 0)
  );

  select reservation.*
  into v_reservation
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.communication_note_point_admissions
    as binding
    on binding.id = job.communication_note_point_admission_id
   and binding.job_id = job.id
   and binding.owner_user_id = job.owner_user_id
  join public.point_reservations as reservation
    on reservation.id = binding.reservation_id
   and reservation.owner_user_id = binding.owner_user_id
  where job.id = p_job_id
    and job.owner_user_id = p_owner_user_id
    and reservation.status = 'RESERVED'
    and reservation.points = 20
  for update of reservation;

  if v_reservation.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  return v_reservation.expires_at;
end
$careslink_v1_lock_paid_reservation$;

-- Attach the terminal-aware guards after all helper identities exist.
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);
grant trigger on table public.point_reservations
  to careslink_v1_generation_points_settlement_executor;

set role careslink_v1_generation_points_settlement_executor;
grant execute on function
  careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_payload_grant(),
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_settlement(),
  careslink_v1_generation._deny_v1_shadow_communication_note_point_settlement_mutation()
  to careslink_v1_generation_owner;

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
revoke trigger on table public.point_reservations
  from careslink_v1_generation_points_settlement_executor;

set role careslink_v1_generation_owner;

create trigger jobs_communication_note_point_terminal_coordinator
before update
on careslink_v1_generation.jobs
for each row execute function
  careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal();

create trigger attempts_communication_note_paid_terminal_gate
before insert or update
on careslink_v1_generation.attempts
for each row execute function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt();

create trigger payload_grants_communication_note_paid_terminal_gate
before insert or update
on careslink_v1_generation.payload_grants
for each row execute function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_payload_grant();

create constraint trigger
  communication_note_point_settlements_consistency_trigger
after insert
on careslink_v1_generation.communication_note_point_settlements
deferrable initially deferred
for each row execute function
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_settlement();

create trigger communication_note_point_settlements_immutable
before update or delete
on careslink_v1_generation.communication_note_point_settlements
for each row execute function
  careslink_v1_generation._deny_v1_shadow_communication_note_point_settlement_mutation();

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_points_settlement_executor;
grant execute on function
  careslink_v1_generation._communication_note_paid_reservation_expires_at(
    pg_catalog.uuid, pg_catalog.uuid
  ),
  careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
    pg_catalog.uuid, pg_catalog.uuid
  ),
  careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid
  ) to careslink_v1_generation_executor;
grant execute on function
  careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid
  ) to careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- -------------------------------------------------------------------------
-- Claim: paid work is visible only behind a live exact 20-Point reservation
-- -------------------------------------------------------------------------

set role careslink_v1_generation_executor;

create or replace function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    p_registration_digest pg_catalog.text,
    p_worker_policy_version pg_catalog.text,
    p_worker_policy_digest pg_catalog.text,
    p_worker_identity_hash pg_catalog.text,
    p_contract_version pg_catalog.text,
    p_schema_version pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_claim_generation_job_with_paid_lane$
declare
  v_now pg_catalog.timestamptz;
  v_policy record;
  v_job record;
  v_payload record;
  v_attempt_id pg_catalog.uuid;
  v_lease_token pg_catalog.text;
  v_lease_hash pg_catalog.text;
  v_lease_expires_at pg_catalog.timestamptz;
  v_reservation_expires_at pg_catalog.timestamptz;
  v_attempt_number pg_catalog.int4;
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
    or not careslink_v1_generation._registration_accepts_new_work(
      p_registration_digest
    )
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

  select policy.*
  into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  if v_policy.version is null then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  -- Paid eligibility is inspected by the settlement purpose role against
  -- communication_note_point_admissions + public.point_reservations. The
  -- worker sees no Points identifier and the response wire remains unchanged.
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
    and case
      when job.communication_note_point_admission_id is not null then
        careslink_v1_generation._communication_note_paid_reservation_expires_at(
          job.id,
          job.owner_user_id
        ) - v_now >=
          v_policy.minimum_payload_remaining_at_claim_ms *
            interval '1 millisecond'
      else true
    end
  order by coalesce(job.next_eligible_at, job.created_at), job.created_at,
    job.id
  for update of job skip locked
  limit 1;

  if v_job.id is null then
    return pg_catalog.jsonb_build_object('status', 'IDLE', 'claim', null);
  end if;

  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select payload.*
  into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  if v_job.communication_note_point_admission_id is not null then
    v_reservation_expires_at :=
      careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
        v_job.id,
        v_job.owner_user_id
      );
  else
    v_reservation_expires_at := 'infinity'::pg_catalog.timestamptz;
  end if;

  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  if v_job.created_at +
      v_policy.max_queue_age_ms * interval '1 millisecond' <= v_now
  then
    return pg_catalog.jsonb_build_object('status', 'IDLE', 'claim', null);
  end if;

  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at - v_now <
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
    or v_payload.privacy_proof_expires_at - v_now <
      v_policy.minimum_payload_remaining_at_claim_ms * interval '1 millisecond'
    or (
      v_job.communication_note_point_admission_id is not null
      and (
        v_reservation_expires_at is null
        or v_reservation_expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms *
            interval '1 millisecond'
      )
    )
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
    v_payload.privacy_proof_expires_at,
    v_reservation_expires_at
  );
  if v_lease_expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  insert into careslink_v1_generation.attempts (
    id, job_id, owner_user_id, attempt_number, status,
    worker_identity_hash, registration_digest, lease_token_hash, acquired_at,
    last_heartbeat_at, lease_expires_at, created_at, shadow_only
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
    and job.status = 'QUEUED';

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'CLAIMED',
    'claim', pg_catalog.jsonb_build_object(
      'job', pg_catalog.jsonb_build_object(
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
      'attempt', pg_catalog.jsonb_build_object(
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
$careslink_v1_claim_generation_job_with_paid_lane$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- -------------------------------------------------------------------------
-- Exact response-loss replay assertions with byte-compatible old envelopes
-- -------------------------------------------------------------------------

set role careslink_v1_generation_executor;

alter function careslink_v1_generation._success_envelope(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text
) rename to _success_envelope_without_point_assertion;

create function careslink_v1_generation._success_envelope(
  p_job_id pg_catalog.uuid,
  p_attempt_id pg_catalog.uuid,
  p_registration_digest pg_catalog.text
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $careslink_v1_success_envelope_point_assertion$
declare
  v_job record;
  v_result pg_catalog.jsonb;
begin
  v_result :=
    careslink_v1_generation._success_envelope_without_point_assertion(
      p_job_id,
      p_attempt_id,
      p_registration_digest
    );
  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  if v_job.communication_note_point_admission_id is not null then
    perform
      careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
        p_job_id,
        v_job.owner_user_id,
        p_attempt_id
      );
  end if;
  return v_result;
end
$careslink_v1_success_envelope_point_assertion$;

alter function careslink_v1_generation._failure_envelope(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text
) rename to _failure_envelope_without_point_assertion;

create function careslink_v1_generation._failure_envelope(
  p_job_id pg_catalog.uuid,
  p_attempt_id pg_catalog.uuid,
  p_registration_digest pg_catalog.text
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $careslink_v1_failure_envelope_point_assertion$
declare
  v_job record;
  v_result pg_catalog.jsonb;
begin
  v_result :=
    careslink_v1_generation._failure_envelope_without_point_assertion(
      p_job_id,
      p_attempt_id,
      p_registration_digest
    );
  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  if v_job.communication_note_point_admission_id is not null then
    perform
      careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
        p_job_id,
        v_job.owner_user_id,
        p_attempt_id
      );
  end if;
  return v_result;
end
$careslink_v1_failure_envelope_point_assertion$;

alter function
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ) rename to _recover_v1_shadow_note_generation_expired_unpaid;

create function
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    p_registration_digest pg_catalog.text,
    p_worker_policy_version pg_catalog.text,
    p_worker_policy_digest pg_catalog.text,
    p_worker_identity_hash pg_catalog.text,
    p_contract_version pg_catalog.text,
    p_schema_version pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_recover_generation_with_paid_lane$
declare
  v_unpaid pg_catalog.jsonb;
  v_policy record;
  v_candidate record;
  v_job record;
  v_attempt record;
  v_payload record;
  v_now pg_catalog.timestamptz;
  v_reservation_expires_at pg_catalog.timestamptz;
  v_transaction_id pg_catalog.uuid;
  v_attempt_id pg_catalog.uuid;
  v_lease_hash pg_catalog.text;
  v_terminal_reason pg_catalog.text;
  v_base_delay_ms pg_catalog.int8;
  v_jitter_ms pg_catalog.int8;
  v_retry_delay_ms pg_catalog.int8;
  v_next_eligible_at pg_catalog.timestamptz;
  v_retry_allowed pg_catalog.bool;
  v_recovered pg_catalog.int4 := 0;
  v_requeued pg_catalog.int4 := 0;
  v_failed pg_catalog.int4 := 0;
  v_limit pg_catalog.int4;
  v_queued_limit pg_catalog.int4;
  v_running_limit pg_catalog.int4;
  v_paid_turn pg_catalog.bool;
  v_paid_running_first pg_catalog.bool;
  v_has_paid_queued pg_catalog.bool;
  v_has_paid_running pg_catalog.bool;
begin
  perform careslink_v1_generation._assert_capability();
  if p_registration_digest is null
    or p_registration_digest !~ '^[a-f0-9]{64}$'
    or p_worker_policy_version is null
    or p_worker_policy_digest !~ '^[a-f0-9]{64}$'
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

  select policy.*
  into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;
  if v_policy.version is null then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  -- A recovery transaction may visit several owners and retains each owner's
  -- Points advisory lock until COMMIT. Serialize only this paid recovery entry
  -- so two batches cannot acquire those owner lanes in opposite order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'careslink:v1:communication-note:points:paid-recovery',
      0
    )
  );

  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  insert into
    careslink_v1_generation.communication_note_paid_recovery_turns (
      registration_digest, paid_first, running_first, created_at, updated_at,
      shadow_only
    ) values (
      p_registration_digest, true, true, v_now, v_now, true
    ) on conflict (registration_digest) do nothing;

  select turn.paid_first, turn.running_first
  into v_paid_turn, v_paid_running_first
  from careslink_v1_generation.communication_note_paid_recovery_turns as turn
  where turn.registration_digest = p_registration_digest
    and turn.shadow_only is true
  for update;
  if v_paid_turn is null or v_paid_running_first is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  update careslink_v1_generation.communication_note_paid_recovery_turns as turn
  set paid_first = not v_paid_turn,
      updated_at = v_now
  where turn.registration_digest = p_registration_digest
    and turn.paid_first = v_paid_turn
    and turn.shadow_only is true;
  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  -- Alternate the first lane under the global recovery lock. A zero-result
  -- lane falls through immediately, while a non-zero result consumes this
  -- invocation's exact batch budget and preserves the predecessor envelope.
  if not v_paid_turn then
    v_unpaid :=
      careslink_v1_generation._recover_v1_shadow_note_generation_expired_unpaid(
        p_registration_digest,
        p_worker_policy_version,
        p_worker_policy_digest,
        p_worker_identity_hash,
        p_contract_version,
        p_schema_version
      );
    if v_unpaid is null
      or pg_catalog.jsonb_typeof(v_unpaid) is distinct from 'object'
      or not (v_unpaid ?& array['recovered', 'requeued', 'failed'])
      or v_unpaid - array['recovered', 'requeued', 'failed'] <>
        '{}'::pg_catalog.jsonb
      or pg_catalog.jsonb_typeof(v_unpaid->'recovered') is distinct from
        'number'
      or pg_catalog.jsonb_typeof(v_unpaid->'requeued') is distinct from
        'number'
      or pg_catalog.jsonb_typeof(v_unpaid->'failed') is distinct from
        'number'
      or (v_unpaid->>'recovered')::pg_catalog.int4 < 0
      or (v_unpaid->>'recovered')::pg_catalog.int4 >
        v_policy.recovery_batch_limit
      or (v_unpaid->>'requeued')::pg_catalog.int4 < 0
      or (v_unpaid->>'failed')::pg_catalog.int4 < 0
      or (v_unpaid->>'recovered')::pg_catalog.int4 is distinct from
        (v_unpaid->>'requeued')::pg_catalog.int4 +
          (v_unpaid->>'failed')::pg_catalog.int4
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    if (v_unpaid->>'recovered')::pg_catalog.int4 > 0 then
      return v_unpaid;
    end if;
  end if;

  -- A paid turn alternates which paid sub-lane receives the extra slot. With
  -- a batch of one this becomes strict QUEUED/RUNNING alternation; an empty
  -- sub-lane transfers its capacity to the other one.
  update careslink_v1_generation.communication_note_paid_recovery_turns as turn
  set running_first = not v_paid_running_first,
      updated_at = pg_catalog.date_trunc(
        'milliseconds',
        pg_catalog.clock_timestamp()
      )
  where turn.registration_digest = p_registration_digest
    and turn.running_first = v_paid_running_first
    and turn.shadow_only is true;
  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  select exists (
    select 1
    from careslink_v1_generation.jobs as job
    join careslink_v1_generation.payloads as payload
      on payload.id = job.payload_id
     and payload.job_id = job.id
     and payload.owner_user_id = job.owner_user_id
    where job.status = 'QUEUED'
      and job.communication_note_point_admission_id is not null
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
        coalesce(
          careslink_v1_generation._communication_note_paid_reservation_expires_at(
            job.id,
            job.owner_user_id
          ),
          '-infinity'::pg_catalog.timestamptz
        ) < v_now +
          v_policy.minimum_payload_remaining_at_claim_ms *
            interval '1 millisecond'
        or job.created_at +
          v_policy.max_queue_age_ms * interval '1 millisecond' <= v_now
        or payload.state <> 'AVAILABLE'
        or payload.expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms *
            interval '1 millisecond'
        or payload.privacy_proof_expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms *
            interval '1 millisecond'
      )
  ) into v_has_paid_queued;

  select exists (
    select 1
    from careslink_v1_generation.jobs as job
    join careslink_v1_generation.attempts as attempt
      on attempt.job_id = job.id
     and attempt.owner_user_id = job.owner_user_id
     and attempt.status = 'RUNNING'
    where job.status = 'RUNNING'
      and job.communication_note_point_admission_id is not null
      and job.worker_policy_version = p_worker_policy_version
      and job.worker_policy_digest = p_worker_policy_digest
      and job.contract_version = p_contract_version
      and job.schema_version = p_schema_version
      and attempt.registration_digest = p_registration_digest
      and attempt.worker_identity_hash = p_worker_identity_hash
      and (
        attempt.lease_expires_at <= v_now
        or coalesce(
          careslink_v1_generation._communication_note_paid_reservation_expires_at(
            job.id,
            job.owner_user_id
          ),
          '-infinity'::pg_catalog.timestamptz
        ) <= v_now
      )
  ) into v_has_paid_running;

  if v_has_paid_queued and v_has_paid_running then
    if v_paid_running_first then
      v_running_limit :=
        (v_policy.recovery_batch_limit + 1) / 2;
      v_queued_limit :=
        v_policy.recovery_batch_limit - v_running_limit;
    else
      v_queued_limit :=
        (v_policy.recovery_batch_limit + 1) / 2;
      v_running_limit :=
        v_policy.recovery_batch_limit - v_queued_limit;
    end if;
  elsif v_has_paid_queued then
    v_queued_limit := v_policy.recovery_batch_limit;
    v_running_limit := 0;
  elsif v_has_paid_running then
    v_queued_limit := 0;
    v_running_limit := v_policy.recovery_batch_limit;
  else
    v_queued_limit := 0;
    v_running_limit := 0;
  end if;

  -- Reservation expiry is independent of next_eligible_at. A paid QUEUED job
  -- whose twenty Points can no longer back a new lease is failed and released
  -- in this transaction before it can ever be selected by claim again.
  for v_candidate in
    select job.id
    from careslink_v1_generation.jobs as job
    join careslink_v1_generation.payloads as payload
      on payload.id = job.payload_id
     and payload.job_id = job.id
     and payload.owner_user_id = job.owner_user_id
    where job.status = 'QUEUED'
      and job.communication_note_point_admission_id is not null
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
        coalesce(
          careslink_v1_generation._communication_note_paid_reservation_expires_at(
            job.id,
            job.owner_user_id
          ),
          '-infinity'::pg_catalog.timestamptz
        ) < v_now +
          v_policy.minimum_payload_remaining_at_claim_ms *
            interval '1 millisecond'
        or job.created_at +
          v_policy.max_queue_age_ms * interval '1 millisecond' <= v_now
        or payload.state <> 'AVAILABLE'
        or payload.expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms *
            interval '1 millisecond'
        or payload.privacy_proof_expires_at - v_now <
          v_policy.minimum_payload_remaining_at_claim_ms *
            interval '1 millisecond'
      )
    order by job.created_at, job.id
    for update of job skip locked
    limit v_queued_limit
  loop
    select job.*
    into v_job
    from careslink_v1_generation.jobs as job
    where job.id = v_candidate.id
      and job.status = 'QUEUED'
      and job.communication_note_point_admission_id is not null;
    if v_job.id is null then
      continue;
    end if;

    perform careslink_v1_generation._set_owner(v_job.owner_user_id);
    select payload.*
    into v_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = v_job.payload_id
      and payload.job_id = v_job.id
      and payload.owner_user_id = v_job.owner_user_id
    for update;
    if v_payload.id is null then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_reservation_expires_at :=
      careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
        v_job.id,
        v_job.owner_user_id
      );
    v_now := pg_catalog.date_trunc(
      'milliseconds',
      pg_catalog.clock_timestamp()
    );
    v_transaction_id := extensions.gen_random_uuid();
    v_attempt_id := extensions.gen_random_uuid();
    v_lease_hash := careslink_v1_generation._sha256_text(
      careslink_v1_generation._new_opaque_secret()
    );

    perform careslink_v1_generation._enqueue_payload_purge(
      v_transaction_id,
      v_payload.id,
      v_job.id,
      v_job.owner_user_id,
      'FAILED',
      v_now
    );

    insert into careslink_v1_generation.attempts (
      id, job_id, owner_user_id, attempt_number, status,
      worker_identity_hash, registration_digest, lease_token_hash,
      acquired_at, last_heartbeat_at, lease_expires_at, failure_reason,
      finished_at, created_at, shadow_only, terminal_transaction_id
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
      and job.status = 'QUEUED';
    if not found then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_recovered := v_recovered + 1;
    v_failed := v_failed + 1;
  end loop;

  v_limit := least(
    greatest(v_policy.recovery_batch_limit - v_recovered, 0),
    v_running_limit + greatest(v_queued_limit - v_recovered, 0)
  );
  if v_limit = 0 and v_recovered > 0 then
    return pg_catalog.jsonb_build_object(
      'recovered', v_recovered,
      'requeued', v_requeued,
      'failed', v_failed
    );
  end if;

  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  for v_candidate in
    select job.id
    from careslink_v1_generation.jobs as job
    join careslink_v1_generation.attempts as attempt
      on attempt.job_id = job.id
     and attempt.owner_user_id = job.owner_user_id
     and attempt.status = 'RUNNING'
    where job.status = 'RUNNING'
      and job.communication_note_point_admission_id is not null
      and job.worker_policy_version = p_worker_policy_version
      and job.worker_policy_digest = p_worker_policy_digest
      and job.contract_version = p_contract_version
      and job.schema_version = p_schema_version
      and attempt.registration_digest = p_registration_digest
      and attempt.worker_identity_hash = p_worker_identity_hash
      and (
        attempt.lease_expires_at <= v_now
        or coalesce(
          careslink_v1_generation._communication_note_paid_reservation_expires_at(
            job.id,
            job.owner_user_id
          ),
          '-infinity'::pg_catalog.timestamptz
        ) <= v_now
      )
    order by attempt.lease_expires_at, job.created_at, job.id
    for update of job skip locked
    limit v_limit
  loop
    select job.*
    into v_job
    from careslink_v1_generation.jobs as job
    where job.id = v_candidate.id
      and job.status = 'RUNNING';
    if v_job.id is null then
      continue;
    end if;
    perform careslink_v1_generation._set_owner(v_job.owner_user_id);

    select attempt.*
    into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.job_id = v_job.id
      and attempt.owner_user_id = v_job.owner_user_id
      and attempt.status = 'RUNNING'
    for update;
    select payload.*
    into v_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = v_job.payload_id
      and payload.job_id = v_job.id
      and payload.owner_user_id = v_job.owner_user_id
    for update;
    if v_attempt.id is null or v_payload.id is null then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    v_reservation_expires_at :=
      careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
        v_job.id,
        v_job.owner_user_id
      );
    v_now := pg_catalog.date_trunc(
      'milliseconds',
      pg_catalog.clock_timestamp()
    );
    if v_attempt.lease_expires_at > v_now
      and v_reservation_expires_at > v_now
    then
      continue;
    end if;

    v_terminal_reason := case
      when v_reservation_expires_at <= v_now
        or v_payload.state <> 'AVAILABLE'
        or v_payload.expires_at <= v_now
        or v_payload.privacy_proof_expires_at <= v_now
      then 'PAYLOAD_UNAVAILABLE'
      else 'LEASE_EXPIRED'
    end;
    v_base_delay_ms :=
      v_policy.retry_delay_ms_after_attempt[v_attempt.attempt_number];
    v_jitter_ms := case
      when v_policy.jitter_mode = 'NONE' then 0
      else floor(
        pg_catalog.random()::pg_catalog.numeric *
          (v_policy.jitter_max_ms + 1)
      )::pg_catalog.int8
    end;
    v_retry_delay_ms := v_base_delay_ms + v_jitter_ms;
    v_next_eligible_at :=
      v_now + v_retry_delay_ms * interval '1 millisecond';
    v_retry_allowed := v_terminal_reason = 'LEASE_EXPIRED'
      and 'LEASE_EXPIRED' = any(v_policy.retryable_outcomes)
      and v_attempt.attempt_number < v_policy.max_attempts
      and v_payload.state = 'AVAILABLE'
      and v_payload.expires_at - v_next_eligible_at >=
        v_policy.minimum_payload_remaining_at_claim_ms *
          interval '1 millisecond'
      and v_payload.privacy_proof_expires_at - v_next_eligible_at >=
        v_policy.minimum_payload_remaining_at_claim_ms *
          interval '1 millisecond'
      and v_reservation_expires_at - v_next_eligible_at >=
        v_policy.minimum_payload_remaining_at_claim_ms *
          interval '1 millisecond';
    v_transaction_id := extensions.gen_random_uuid();

    if v_retry_allowed then
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
        and job.status = 'RUNNING';
      if not found then
        raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
      end if;
      v_requeued := v_requeued + 1;
    else
      perform careslink_v1_generation._enqueue_payload_purge(
        v_transaction_id,
        v_payload.id,
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
        and job.status = 'RUNNING';
      if not found then
        raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
      end if;
      v_failed := v_failed + 1;
    end if;
    v_recovered := v_recovered + 1;
  end loop;

  if v_recovered > 0 then
    return pg_catalog.jsonb_build_object(
      'recovered', v_recovered,
      'requeued', v_requeued,
      'failed', v_failed
    );
  end if;

  if v_unpaid is null then
    v_unpaid :=
      careslink_v1_generation._recover_v1_shadow_note_generation_expired_unpaid(
        p_registration_digest,
        p_worker_policy_version,
        p_worker_policy_digest,
        p_worker_identity_hash,
        p_contract_version,
        p_schema_version
      );
  end if;
  if v_unpaid is null
    or pg_catalog.jsonb_typeof(v_unpaid) is distinct from 'object'
    or not (v_unpaid ?& array['recovered', 'requeued', 'failed'])
    or v_unpaid - array['recovered', 'requeued', 'failed'] <>
      '{}'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(v_unpaid->'recovered') is distinct from
      'number'
    or pg_catalog.jsonb_typeof(v_unpaid->'requeued') is distinct from
      'number'
    or pg_catalog.jsonb_typeof(v_unpaid->'failed') is distinct from
      'number'
    or (v_unpaid->>'recovered')::pg_catalog.int4 < 0
    or (v_unpaid->>'recovered')::pg_catalog.int4 >
      v_policy.recovery_batch_limit
    or (v_unpaid->>'requeued')::pg_catalog.int4 < 0
    or (v_unpaid->>'failed')::pg_catalog.int4 < 0
    or (v_unpaid->>'recovered')::pg_catalog.int4 is distinct from
      (v_unpaid->>'requeued')::pg_catalog.int4 +
        (v_unpaid->>'failed')::pg_catalog.int4
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  return v_unpaid;
end
$careslink_v1_recover_generation_with_paid_lane$;

alter function
  careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ) rename to _fence_v1_shadow_note_generation_attempt_pre_points;

create function
  careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    p_job_id pg_catalog.uuid,
    p_attempt_id pg_catalog.uuid,
    p_lease_token pg_catalog.text,
    p_registration_digest pg_catalog.text,
    p_worker_policy_version pg_catalog.text,
    p_worker_policy_digest pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_fence_paid_replay_freshness$
declare
  v_result pg_catalog.jsonb;
  v_job record;
  v_attempt record;
  v_policy record;
  v_reservation_expires_at pg_catalog.timestamptz;
  v_now pg_catalog.timestamptz;
begin
  v_result :=
    careslink_v1_generation._fence_v1_shadow_note_generation_attempt_pre_points(
      p_job_id,
      p_attempt_id,
      p_lease_token,
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest
    );

  select job.*
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;
  if v_job.communication_note_point_admission_id is null then
    return v_result;
  end if;

  perform careslink_v1_generation._set_owner(v_job.owner_user_id);
  select attempt.*
  into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
  for update;
  select policy.*
  into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = v_job.worker_policy_version
    and policy.policy_digest = v_job.worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;
  v_reservation_expires_at :=
    careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
      v_job.id,
      v_job.owner_user_id
    );
  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  if v_attempt.id is null
    or v_policy.version is null
    or v_job.status is distinct from 'RUNNING'
    or v_attempt.status is distinct from 'RUNNING'
    or v_attempt.registration_digest is distinct from p_registration_digest
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or v_attempt.fence_id is null
    or v_attempt.fence_digest is null
    or v_attempt.fenced_at is null
    or v_attempt.fence_expires_at is null
    or v_reservation_expires_at <
      v_now + v_policy.commit_safety_margin_ms * interval '1 millisecond'
    or v_attempt.lease_expires_at <
      v_now + v_policy.commit_safety_margin_ms * interval '1 millisecond'
    or v_attempt.fence_expires_at <
      v_now + v_policy.commit_safety_margin_ms * interval '1 millisecond'
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  if v_result is distinct from pg_catalog.jsonb_build_object(
    'status', 'FENCED',
    'fenceId', v_attempt.fence_id,
    'fenceDigest', v_attempt.fence_digest,
    'expiresAt',
      careslink_v1_generation._server_time(v_attempt.fence_expires_at),
    'jobReferenceHash',
      careslink_v1_generation._sha256_text(p_job_id::pg_catalog.text),
    'attemptReferenceHash',
      careslink_v1_generation._sha256_text(p_attempt_id::pg_catalog.text),
    'registrationDigest', p_registration_digest
  ) then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  return v_result;
end
$careslink_v1_fence_paid_replay_freshness$;

alter function
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.text
  ) rename to _authorize_v1_shadow_note_generation_payload_attempt_unbounded;

create function
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    p_job_id pg_catalog.uuid,
    p_payload_id pg_catalog.uuid,
    p_attempt_id pg_catalog.uuid,
    p_lease_token pg_catalog.text,
    p_registration_digest pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_authorize_paid_grant_expiry$
declare
  v_result pg_catalog.jsonb;
  v_grant record;
  v_job record;
  v_attempt record;
  v_policy record;
  v_reservation_expires_at pg_catalog.timestamptz;
  v_now pg_catalog.timestamptz;
begin
  v_result :=
    careslink_v1_generation._authorize_v1_shadow_note_generation_payload_attempt_unbounded(
      p_job_id,
      p_payload_id,
      p_attempt_id,
      p_lease_token,
      p_registration_digest
    );

  if v_result->>'status' = 'AUTHORIZED' then
    select grant_record.*
    into v_grant
    from careslink_v1_generation.payload_grants as grant_record
    where grant_record.id = (v_result->>'grantId')::pg_catalog.uuid
      and grant_record.payload_id = p_payload_id
      and grant_record.job_id = p_job_id
      and grant_record.attempt_id = p_attempt_id
      and grant_record.registration_digest = p_registration_digest;
    if v_grant.id is null or v_grant.status is distinct from 'ISSUED' then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    select job.*
    into v_job
    from careslink_v1_generation.jobs as job
    where job.id = p_job_id;
    select attempt.*
    into v_attempt
    from careslink_v1_generation.attempts as attempt
    where attempt.id = p_attempt_id
      and attempt.job_id = p_job_id;

    if v_job.id is null or v_attempt.id is null then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    if v_job.communication_note_point_admission_id is not null then
      select policy.*
      into v_policy
      from careslink_v1_generation.worker_policies as policy
      where policy.version = v_job.worker_policy_version
        and policy.policy_digest = v_job.worker_policy_digest
        and policy.status = 'APPROVED'
        and policy.shadow_only is true;
      v_reservation_expires_at :=
        careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
          v_job.id,
          v_job.owner_user_id
        );
      v_now := pg_catalog.date_trunc(
        'milliseconds',
        pg_catalog.clock_timestamp()
      );
      if v_policy.version is null
        or v_attempt.lease_expires_at is null
        or v_grant.expires_at > v_attempt.lease_expires_at
        or v_grant.expires_at > v_reservation_expires_at
        or v_grant.expires_at - v_now <
          (
            v_policy.provider_deadline_ms +
              v_policy.commit_safety_margin_ms
          ) * interval '1 millisecond'
        or v_reservation_expires_at - v_now <
          (
            v_policy.provider_deadline_ms +
              v_policy.commit_safety_margin_ms
          ) * interval '1 millisecond'
        or v_attempt.lease_expires_at - v_now <
          (
            v_policy.provider_deadline_ms +
              v_policy.commit_safety_margin_ms
          ) * interval '1 millisecond'
        or (
          v_attempt.fence_id is null
          and (
            v_attempt.fence_digest is not null
            or v_attempt.fenced_at is not null
            or v_attempt.fence_expires_at is not null
          )
        )
        or (
          v_attempt.fence_id is not null
          and (
            v_attempt.fence_digest is null
            or v_attempt.fenced_at is null
            or v_attempt.fence_expires_at is null
            or v_grant.expires_at > v_attempt.fence_expires_at
            or v_attempt.fence_expires_at - v_now <
              (
                v_policy.provider_deadline_ms +
                  v_policy.commit_safety_margin_ms
              ) * interval '1 millisecond'
          )
        )
      then
        return careslink_v1_generation._settle_denied_authority(
          p_job_id,
          p_attempt_id,
          p_payload_id,
          p_registration_digest,
          'PAYLOAD_UNAVAILABLE',
          v_now
        );
      end if;
    end if;
    v_result := pg_catalog.jsonb_set(
      v_result,
      array['expiresAt'],
      pg_catalog.to_jsonb(
        careslink_v1_generation._server_time(v_grant.expires_at)
      ),
      false
    );
  end if;
  return v_result;
end
$careslink_v1_authorize_paid_grant_expiry$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner_api_executor;

alter function careslink_v1_generation._owner_api_job_view(
  pg_catalog.uuid, pg_catalog.uuid
) rename to _owner_api_job_view_without_point_assertion;

create function careslink_v1_generation._owner_api_job_view(
  p_job_id pg_catalog.uuid,
  p_owner_user_id pg_catalog.uuid
)
returns pg_catalog.jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $careslink_v1_owner_job_view_point_assertion$
declare
  v_result pg_catalog.jsonb;
  v_point_admission_id pg_catalog.uuid;
begin
  v_result :=
    careslink_v1_generation._owner_api_job_view_without_point_assertion(
      p_job_id,
      p_owner_user_id
    );

  -- The marker is immutable once bound. Reading it after the predecessor
  -- envelope gives an owner-scoped linearization point without expanding the
  -- settlement role's RLS visibility to fresh or unpaid jobs.
  select job.communication_note_point_admission_id
  into v_point_admission_id
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.owner_user_id = p_owner_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if v_point_admission_id is not null then
    perform
      careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
        p_job_id,
        p_owner_user_id,
        null
      );
  end if;
  return v_result;
end
$careslink_v1_owner_job_view_point_assertion$;

create or replace function
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
as $careslink_v1_admit_reserve_terminal_replay$
declare
  v_admission pg_catalog.jsonb;
  v_points pg_catalog.jsonb;
  v_created pg_catalog.bool;
  v_job_id pg_catalog.uuid;
  v_job_status pg_catalog.text;
  v_point_admission_id pg_catalog.uuid;
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
    or v_admission #> '{job,noteType}' is distinct from
      '"communication"'::pg_catalog.jsonb
    or v_admission #> '{job,serviceCode}' is distinct from
      '"note.communication.generate"'::pg_catalog.jsonb
    or v_admission #>> '{job,status}' not in (
      'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'
    )
    or pg_catalog.jsonb_typeof(v_admission #> '{job,attemptCount}')
      is distinct from 'number'
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_created := (v_admission->>'created')::pg_catalog.bool;
  v_job_id := (v_admission #>> '{job,jobId}')::pg_catalog.uuid;
  v_job_status := v_admission #>> '{job,status}';

  if v_created and (
    v_admission->'payloadAccepted' is distinct from 'true'::pg_catalog.jsonb
    or v_job_status is distinct from 'QUEUED'
    or v_admission #> '{job,attemptCount}' is distinct from
      '0'::pg_catalog.jsonb
    or v_admission #> '{job,startedAt}' is distinct from
      'null'::pg_catalog.jsonb
    or v_admission #> '{job,finishedAt}' is distinct from
      'null'::pg_catalog.jsonb
    or v_admission #> '{job,failureCode}' is distinct from
      'null'::pg_catalog.jsonb
    or v_admission #> '{job,result}' is distinct from
      'null'::pg_catalog.jsonb
  ) then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if v_created or v_job_status = 'QUEUED' then
    v_points :=
      careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(
        p_owner_user_id,
        p_session_id,
        v_job_id,
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
      or v_points->'created' is distinct from pg_catalog.to_jsonb(v_created)
      or v_points->'points' is distinct from '20'::pg_catalog.jsonb
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
  end if;

  -- The generic predecessor can replay a matching unpaid job after it has
  -- left QUEUED. Never relabel that cross-surface replay as Points-backed.
  select job.communication_note_point_admission_id
  into v_point_admission_id
  from careslink_v1_generation.jobs as job
  where job.id = v_job_id
    and job.owner_user_id = p_owner_user_id;

  if not found or v_point_admission_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'IDENTITY_LINK_CONFLICT';
  end if;

  -- Fresh admission is asserted only after the marker is bound. RUNNING and
  -- terminal exact replays reach the same assertion without creating a quote,
  -- reserving again, writing a ledger row or restoring a lot.
  perform
    careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
      v_job_id,
      p_owner_user_id,
      null
    );

  return pg_catalog.jsonb_build_object(
    'created', v_admission->'created',
    'payloadAccepted', v_admission->'payloadAccepted',
    'pointsReserved', true,
    'job', v_admission->'job'
  );
end
$careslink_v1_admit_reserve_terminal_replay$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- -------------------------------------------------------------------------
-- Fresh post-lock terminal time for the shared five-note worker RPCs
-- -------------------------------------------------------------------------

set role careslink_v1_generation_executor;

create or replace function careslink_v1_generation._settle_denied_authority(
  p_job_id uuid,
  p_attempt_id uuid,
  p_payload_id uuid,
  p_registration_digest text,
  p_reason text,
  p_at timestamptz
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $careslink_v1_settle_denied_fresh_clock$
declare
  v_job record;
  v_attempt record;
  v_payload record;
  v_outbox record;
  v_now timestamptz;
  v_transaction_id uuid;
  v_event_hash text;
begin
  if p_at is null
    or p_reason is null
    or p_reason not in (
      'PAYLOAD_UNAVAILABLE', 'SESSION_REVOKED', 'PRIVACY_REVIEW_STALE'
    )
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
    and job.payload_id = p_payload_id
  for update;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
    and attempt.registration_digest = p_registration_digest
  for update;

  if v_attempt.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  -- A terminal denial replay is validation-only. It returns the one stored
  -- acknowledgement without acquiring active-write locks or observing a new
  -- terminal time.
  if v_job.status = 'FAILED' and v_attempt.status = 'FAILED' then
    if v_job.failure_reason is distinct from p_reason
      or v_attempt.failure_reason is distinct from p_reason
      or v_attempt.terminal_transaction_id is null
      or v_attempt.finished_at is null
      or v_job.finished_at is distinct from v_attempt.finished_at
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    select payload.* into v_payload
    from careslink_v1_generation.payloads as payload
    where payload.id = p_payload_id
      and payload.job_id = p_job_id
      and payload.owner_user_id = v_job.owner_user_id;

    select outbox.* into v_outbox
    from careslink_v1_generation.payload_purge_outbox as outbox
    where outbox.payload_id = p_payload_id
      and outbox.job_id = p_job_id
      and outbox.owner_user_id = v_job.owner_user_id
      and outbox.transaction_id = v_attempt.terminal_transaction_id
      and outbox.reason = 'FAILED';

    if v_payload.id is null
      or v_payload.revoke_reason is distinct from 'FAILED'
      or v_payload.revoked_at is distinct from v_attempt.finished_at
      or v_outbox.id is null
      or v_outbox.requested_at is distinct from v_attempt.finished_at
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    return jsonb_build_object(
      'status', 'DENIED_SETTLED',
      'transactionId', v_attempt.terminal_transaction_id,
      'transactionStatus', 'COMMITTED',
      'atomic', true,
      'committedAt',
        careslink_v1_generation._server_time(v_attempt.finished_at),
      'registrationDigest', p_registration_digest,
      'reason', p_reason,
      'jobReferenceHash',
        careslink_v1_generation._sha256_text(p_job_id::text),
      'attemptReferenceHash',
        careslink_v1_generation._sha256_text(p_attempt_id::text),
      'payloadReferenceHash',
        careslink_v1_generation._sha256_text(p_payload_id::text),
      'jobStatus', 'FAILED',
      'attemptStatus', 'FAILED',
      'payloadState', 'REVOKED',
      'payloadDisposition', 'REVOKED_PURGE_ENQUEUED',
      'purgeEventReferenceHash', v_outbox.event_reference_hash
    );
  end if;

  if v_job.status <> 'RUNNING' or v_attempt.status <> 'RUNNING' then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  -- Keep the worker's established order. The job lock serializes this job;
  -- payload and issued-grant locks close every row that the purge helper can
  -- update. The paid helper adds the shared owner advisory lane and exact
  -- reservation lock before the terminal clock is sampled.
  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = p_payload_id
    and payload.job_id = p_job_id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  if v_payload.id is null then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  perform grant_record.id
  from careslink_v1_generation.payload_grants as grant_record
  where grant_record.payload_id = p_payload_id
    and grant_record.job_id = p_job_id
    and grant_record.owner_user_id = v_job.owner_user_id
    and grant_record.status = 'ISSUED'
  order by grant_record.id
  for update;

  if v_job.communication_note_point_admission_id is not null then
    perform
      careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
        v_job.id,
        v_job.owner_user_id
      );
  end if;

  -- A valid active job cannot already have a purge outbox row, and the job
  -- lock serializes every supported producer. Reject impossible residue now;
  -- the executor deliberately retains no UPDATE privilege on this table.
  select outbox.* into v_outbox
  from careslink_v1_generation.payload_purge_outbox as outbox
  where outbox.payload_id = p_payload_id
    and outbox.job_id = p_job_id
    and outbox.owner_user_id = v_job.owner_user_id;

  if v_outbox.id is not null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  v_transaction_id := extensions.gen_random_uuid();

  update careslink_v1_generation.attempts as attempt
  set status = 'FAILED',
      failure_reason = p_reason,
      provider_evidence_hash = null,
      canonical_content_hash = null,
      terminal_transaction_id = v_transaction_id,
      settlement_base_delay_ms = null,
      settlement_jitter_ms = null,
      settlement_retry_delay_ms = null,
      finished_at = v_now
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
    and attempt.registration_digest = p_registration_digest
    and attempt.status = 'RUNNING';

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  update careslink_v1_generation.jobs as job
  set status = 'FAILED',
      next_eligible_at = null,
      failure_reason = p_reason,
      finished_at = v_now,
      updated_at = v_now
  where job.id = p_job_id
    and job.owner_user_id = v_job.owner_user_id
    and job.status = 'RUNNING';

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_event_hash := careslink_v1_generation._enqueue_payload_purge(
    v_transaction_id,
    p_payload_id,
    p_job_id,
    v_job.owner_user_id,
    'FAILED',
    v_now
  );

  return jsonb_build_object(
    'status', 'DENIED_SETTLED',
    'transactionId', v_transaction_id,
    'transactionStatus', 'COMMITTED',
    'atomic', true,
    'committedAt', careslink_v1_generation._server_time(v_now),
    'registrationDigest', p_registration_digest,
    'reason', p_reason,
    'jobReferenceHash',
      careslink_v1_generation._sha256_text(p_job_id::text),
    'attemptReferenceHash',
      careslink_v1_generation._sha256_text(p_attempt_id::text),
    'payloadReferenceHash',
      careslink_v1_generation._sha256_text(p_payload_id::text),
    'jobStatus', 'FAILED',
    'attemptStatus', 'FAILED',
    'payloadState', 'REVOKED',
    'payloadDisposition', 'REVOKED_PURGE_ENQUEUED',
    'purgeEventReferenceHash', v_event_hash
  );
end;
$careslink_v1_settle_denied_fresh_clock$;

create or replace function careslink_v1_generation.commit_v1_shadow_note_generation_success(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text,
  p_worker_policy_version text,
  p_worker_policy_digest text,
  p_fence_id uuid,
  p_fence_digest text,
  p_canonical_content jsonb,
  p_canonical_content_hash text,
  p_provider_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_observed_at timestamptz;
  v_now timestamptz;
  v_job record;
  v_attempt record;
  v_payload record;
  v_privacy_expires_at timestamptz;
  v_candidate_digest text;
  v_evidence_hash text;
  v_transaction_id uuid;
  v_document_id uuid;
  v_revision_id uuid;
  v_change_id bigint;
  v_receipt_id uuid;
  v_mutation_id text;
  v_mutation_reference_hash text;
  v_event_hash text;
  v_request_fingerprint jsonb;
  v_acknowledgement jsonb;
begin
  perform careslink_v1_generation._assert_capability();

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
  for update;

  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
  for update;

  if v_attempt.id is null
    or v_attempt.registration_digest <> p_registration_digest
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or v_job.worker_policy_version <> p_worker_policy_version
    or v_job.worker_policy_digest <> p_worker_policy_digest
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
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  -- Keep the established job -> attempt -> session -> privacy -> payload lock
  -- order. This provisional observation supports exact replay and the
  -- pre-payload authority checks; active writes use the later post-lock clock.
  v_observed_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  v_candidate_digest := careslink_v1_generation._validate_note_content(
    v_job.note_type,
    v_job.schema_version,
    v_job.cleaned_facts_hash,
    p_canonical_content,
    p_canonical_content_hash
  );
  v_evidence_hash := careslink_v1_generation._validate_provider_evidence(
    v_job.note_type,
    v_job.service_code,
    v_job.rate_catalog_version,
    v_job.worker_policy_version,
    v_job.worker_policy_digest,
    v_job.provider_policy_version,
    v_job.provider_policy_digest,
    v_attempt.acquired_at,
    v_observed_at,
    p_provider_evidence,
    v_candidate_digest
  );

  if p_provider_evidence->>'finishReason' <> 'COMPLETED' then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;

  if v_job.status = 'SUCCEEDED' and v_attempt.status = 'SUCCEEDED' then
    if v_job.result_content_hash is distinct from p_canonical_content_hash
      or v_attempt.canonical_content_hash
        is distinct from p_canonical_content_hash
      or v_attempt.provider_evidence_hash is distinct from v_evidence_hash
      or v_attempt.fence_id is distinct from p_fence_id
      or v_attempt.fence_digest is distinct from p_fence_digest
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    return careslink_v1_generation._success_envelope(
      p_job_id,
      p_attempt_id,
      p_registration_digest
    );
  end if;

  if v_job.status <> 'RUNNING'
    or v_attempt.status <> 'RUNNING'
    or v_attempt.lease_expires_at <= v_observed_at
    or v_attempt.fence_id is distinct from p_fence_id
    or v_attempt.fence_digest is distinct from p_fence_digest
    or v_attempt.fence_expires_at is null
    or v_attempt.fence_expires_at <= v_observed_at
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  if not careslink_v1_generation.fresh_session_is_active(
    v_job.owner_user_id,
    v_job.initiating_session_id,
    v_observed_at
  ) then
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
      v_observed_at
    );
  if v_privacy_expires_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'PRIVACY_REVIEW_STALE';
  end if;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  -- Sample the one persisted terminal time only after every established
  -- pre-write worker row lock has been acquired.
  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  if not careslink_v1_generation.fresh_session_is_active(
    v_job.owner_user_id,
    v_job.initiating_session_id,
    v_now
  ) then
    raise exception using errcode = 'P0001', message = 'SESSION_REVOKED';
  end if;
  v_evidence_hash := careslink_v1_generation._validate_provider_evidence(
    v_job.note_type,
    v_job.service_code,
    v_job.rate_catalog_version,
    v_job.worker_policy_version,
    v_job.worker_policy_digest,
    v_job.provider_policy_version,
    v_job.provider_policy_digest,
    v_attempt.acquired_at,
    v_now,
    p_provider_evidence,
    v_candidate_digest
  );
  if p_provider_evidence->>'finishReason' <> 'COMPLETED' then
    raise exception using
      errcode = 'P0001',
      message = 'PROVIDER_OUTPUT_INVALID';
  end if;
  if v_attempt.lease_expires_at <= v_now
    or v_attempt.fence_expires_at <= v_now
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  if v_payload.id is null
    or v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at <= v_now
    or v_payload.privacy_proof_expires_at is distinct from v_privacy_expires_at
    or v_payload.expires_at > v_privacy_expires_at
    or v_payload.note_type <> v_job.note_type
    or v_payload.source_locale <> v_job.source_locale
    or v_payload.contract_version <> v_job.contract_version
    or v_payload.schema_version <> v_job.schema_version
    or v_payload.privacy_review_id <> v_job.privacy_review_id
    or v_payload.cleaned_facts_hash <> v_job.cleaned_facts_hash
    or v_payload.request_hash <> v_job.request_hash
    or v_payload.policy_version <> v_job.payload_policy_version
    or v_payload.policy_snapshot_hash <> v_job.payload_policy_snapshot_hash
    or not careslink_v1_generation._payload_snapshot_is_valid(
      v_payload.policy_version,
      v_payload.policy_snapshot_hash,
      v_payload.encryption_profile_version,
      v_payload.backup_disposition_version
    )
    or v_attempt.payload_authorized_at is null
    or not exists (
      select 1
      from careslink_v1_generation.payload_grants as grant_record
      where grant_record.payload_id = v_payload.id
        and grant_record.job_id = v_job.id
        and grant_record.owner_user_id = v_job.owner_user_id
        and grant_record.attempt_id = v_attempt.id
        and grant_record.registration_digest = p_registration_digest
        and grant_record.lease_token_hash = v_attempt.lease_token_hash
        and grant_record.request_hash = v_job.request_hash
        and grant_record.status = 'CONSUMED'
        and grant_record.consumed_at is not null
        and grant_record.consumed_at <= v_now
        and grant_record.expires_at > grant_record.consumed_at
    )
  then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  v_transaction_id := extensions.gen_random_uuid();
  v_document_id := extensions.gen_random_uuid();
  v_revision_id := extensions.gen_random_uuid();
  v_receipt_id := extensions.gen_random_uuid();
  v_mutation_id :=
    'note-generation:' || careslink_v1_generation._sha256_text(v_job.id::text);
  v_mutation_reference_hash := public.v1_shadow_content_sha256(
    jsonb_build_object(
      'kind', 'careslink.v1.note-generation-mutation',
      'jobId', v_job.id::text,
      'attemptId', v_attempt.id::text,
      'registrationDigest', p_registration_digest
    )
  );
  v_request_fingerprint := jsonb_build_object(
    'kind', 'careslink.v1.note-generation-create',
    'jobReferenceHash',
      careslink_v1_generation._sha256_text(v_job.id::text),
    'attemptReferenceHash',
      careslink_v1_generation._sha256_text(v_attempt.id::text),
    'registrationDigest', p_registration_digest,
    'contentHash', p_canonical_content_hash,
    'providerEvidenceHash', v_evidence_hash
  );

  insert into public.ai_documents (
    id,
    owner_user_id,
    note_type,
    source_locale,
    lifecycle_status,
    current_revision_id,
    current_revision_number,
    schema_version,
    contract_version,
    shadow_only,
    created_at,
    updated_at
  ) values (
    v_document_id,
    v_job.owner_user_id,
    v_job.note_type,
    v_job.source_locale,
    'IN_PROGRESS',
    null,
    0,
    v_job.schema_version,
    v_job.contract_version,
    true,
    v_now,
    v_now
  );

  insert into public.ai_document_revisions (
    id,
    document_id,
    owner_user_id,
    revision_number,
    base_revision_id,
    privacy_review_id,
    content,
    content_hash,
    mutation_id,
    schema_version,
    contract_version,
    shadow_only,
    created_at
  ) values (
    v_revision_id,
    v_document_id,
    v_job.owner_user_id,
    1,
    null,
    v_job.privacy_review_id,
    p_canonical_content,
    p_canonical_content_hash,
    v_mutation_id,
    v_job.schema_version,
    v_job.contract_version,
    true,
    v_now
  );

  update public.ai_documents as document
  set current_revision_id = v_revision_id,
      current_revision_number = 1,
      updated_at = v_now
  where document.id = v_document_id
    and document.owner_user_id = v_job.owner_user_id;

  insert into public.ai_document_sync_changes (
    owner_user_id,
    change_kind,
    document_id,
    revision_id,
    last_mutation_id,
    server_time,
    deleted_at,
    shadow_only
  ) values (
    v_job.owner_user_id,
    'DOCUMENT_UPSERTED',
    v_document_id,
    v_revision_id,
    v_mutation_id,
    v_now,
    null,
    true
  ) returning change_id into v_change_id;

  v_acknowledgement := jsonb_build_object(
    'status', 'SERVER_ACKNOWLEDGED',
    'mutationReferenceHash', v_mutation_reference_hash,
    'mutationKind', 'CREATE_DOCUMENT',
    'canonicalId', v_document_id,
    'revisionId', v_revision_id,
    'contentHash', p_canonical_content_hash,
    'serverTime', careslink_v1_generation._server_time(v_now)
  );

  insert into public.ai_document_mutation_receipts (
    id,
    owner_user_id,
    mutation_id,
    mutation_kind,
    request_fingerprint,
    document_id,
    revision_id,
    change_id,
    acknowledgement,
    server_time,
    shadow_only,
    created_at
  ) values (
    v_receipt_id,
    v_job.owner_user_id,
    v_mutation_id,
    'CREATE_DOCUMENT',
    v_request_fingerprint,
    v_document_id,
    v_revision_id,
    v_change_id,
    v_acknowledgement,
    v_now,
    true,
    v_now
  );

  insert into careslink_v1_generation.provider_evidence (
    attempt_id,
    job_id,
    owner_user_id,
    evidence_hash,
    evidence,
    created_at,
    shadow_only
  ) values (
    v_attempt.id,
    v_job.id,
    v_job.owner_user_id,
    v_evidence_hash,
    p_provider_evidence,
    v_now,
    true
  );

  v_event_hash := careslink_v1_generation._enqueue_payload_purge(
    v_transaction_id,
    v_job.payload_id,
    v_job.id,
    v_job.owner_user_id,
    'SUCCEEDED',
    v_now
  );

  update careslink_v1_generation.attempts as attempt
  set status = 'SUCCEEDED',
      provider_evidence_hash = v_evidence_hash,
      canonical_content_hash = p_canonical_content_hash,
      failure_reason = null,
      terminal_transaction_id = v_transaction_id,
      settlement_base_delay_ms = null,
      settlement_jitter_ms = null,
      settlement_retry_delay_ms = null,
      finished_at = v_now
  where attempt.id = v_attempt.id
    and attempt.status = 'RUNNING';

  update careslink_v1_generation.jobs as job
  set status = 'SUCCEEDED',
      next_eligible_at = null,
      failure_reason = null,
      result_document_id = v_document_id,
      result_revision_id = v_revision_id,
      result_content_hash = p_canonical_content_hash,
      finished_at = v_now,
      updated_at = v_now
  where job.id = v_job.id
    and job.status = 'RUNNING';

  return careslink_v1_generation._success_envelope(
    p_job_id,
    p_attempt_id,
    p_registration_digest
  );
end;
$$;

create or replace function careslink_v1_generation.settle_v1_shadow_note_generation_failure(
  p_job_id uuid,
  p_attempt_id uuid,
  p_lease_token text,
  p_registration_digest text,
  p_worker_policy_version text,
  p_worker_policy_digest text,
  p_reason text,
  p_provider_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_observed_at timestamptz;
  v_now timestamptz;
  v_job record;
  v_attempt record;
  v_policy record;
  v_payload record;
  v_evidence_hash text;
  v_transaction_id uuid;
  v_retry_allowed boolean;
  v_base_delay_ms bigint;
  v_jitter_ms bigint;
  v_retry_delay_ms bigint;
  v_next_eligible_at timestamptz;
  v_attempt_status text;
  v_job_status text;
  v_purge_reason text;
  v_event_hash text;
begin
  perform careslink_v1_generation._assert_capability();

  if p_reason is null or p_reason not in (
    'LEASE_EXPIRED', 'PROVIDER_TIMEOUT', 'PROVIDER_TRANSIENT',
    'PROVIDER_PERMANENT', 'PROVIDER_OUTPUT_INVALID', 'PAYLOAD_UNAVAILABLE',
    'SESSION_REVOKED', 'PRIVACY_REVIEW_STALE', 'CANCELLED',
    'POLICY_MISMATCH', 'INTERNAL_FAILURE'
  ) then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  select job.* into v_job
  from careslink_v1_generation.jobs as job
  where job.id = p_job_id
  for update;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;
  perform careslink_v1_generation._set_owner(v_job.owner_user_id);

  select attempt.* into v_attempt
  from careslink_v1_generation.attempts as attempt
  where attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.owner_user_id = v_job.owner_user_id
  for update;

  if v_attempt.id is null
    or v_attempt.registration_digest <> p_registration_digest
    or v_attempt.lease_token_hash is distinct from
      careslink_v1_generation._sha256_text(p_lease_token)
    or v_job.worker_policy_version <> p_worker_policy_version
    or v_job.worker_policy_digest <> p_worker_policy_digest
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
    or not careslink_v1_generation._registration_is_valid(
      p_registration_digest,
      p_worker_policy_version,
      p_worker_policy_digest,
      v_attempt.worker_identity_hash,
      v_job.contract_version,
      v_job.schema_version
    )
  then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  -- Exact replay validates against a fresh post-job/attempt-lock observation.
  -- Active settlement refreshes after its payload lock before any write.
  v_observed_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  if p_provider_evidence is not null then
    v_evidence_hash := careslink_v1_generation._validate_provider_evidence(
      v_job.note_type,
      v_job.service_code,
      v_job.rate_catalog_version,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.provider_policy_version,
      v_job.provider_policy_digest,
      v_attempt.acquired_at,
      v_observed_at,
      p_provider_evidence,
      null
    );
  else
    v_evidence_hash := null;
  end if;

  if v_attempt.status <> 'RUNNING' then
    if v_attempt.failure_reason is distinct from p_reason
      or v_attempt.provider_evidence_hash is distinct from v_evidence_hash
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;
    return careslink_v1_generation._failure_envelope(
      p_job_id,
      p_attempt_id,
      p_registration_digest
    );
  end if;

  if v_job.status <> 'RUNNING'
    or (
      v_attempt.lease_expires_at <= v_observed_at
      and p_reason <> 'LEASE_EXPIRED'
    )
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  select policy.* into v_policy
  from careslink_v1_generation.worker_policies as policy
  where policy.version = p_worker_policy_version
    and policy.policy_digest = p_worker_policy_digest
    and policy.status = 'APPROVED'
    and policy.shadow_only is true;

  v_retry_allowed := p_reason = any(v_policy.retryable_outcomes)
    and v_attempt.attempt_number < v_policy.max_attempts;

  select payload.* into v_payload
  from careslink_v1_generation.payloads as payload
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_job.owner_user_id
  for update;

  -- Sample the one persisted terminal time after the active path's final
  -- pre-write worker row lock. Retry and terminal timestamps reuse this value.
  v_now := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  if p_provider_evidence is not null then
    v_evidence_hash := careslink_v1_generation._validate_provider_evidence(
      v_job.note_type,
      v_job.service_code,
      v_job.rate_catalog_version,
      v_job.worker_policy_version,
      v_job.worker_policy_digest,
      v_job.provider_policy_version,
      v_job.provider_policy_digest,
      v_attempt.acquired_at,
      v_now,
      p_provider_evidence,
      null
    );
  else
    v_evidence_hash := null;
  end if;
  if v_job.status <> 'RUNNING'
    or (v_attempt.lease_expires_at <= v_now and p_reason <> 'LEASE_EXPIRED')
  then
    raise exception using errcode = 'P0001', message = 'LEASE_EXPIRED';
  end if;

  if v_payload.id is null then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  if v_retry_allowed and (
    v_payload.state <> 'AVAILABLE'
    or v_payload.expires_at <= v_now
    or v_payload.privacy_proof_expires_at <= v_now
  ) then
    raise exception using errcode = 'P0001', message = 'PAYLOAD_UNAVAILABLE';
  end if;

  v_transaction_id := extensions.gen_random_uuid();

  if p_provider_evidence is not null then
    insert into careslink_v1_generation.provider_evidence (
      attempt_id,
      job_id,
      owner_user_id,
      evidence_hash,
      evidence,
      created_at,
      shadow_only
    ) values (
      v_attempt.id,
      v_job.id,
      v_job.owner_user_id,
      v_evidence_hash,
      p_provider_evidence,
      v_now,
      true
    );
  end if;

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
    v_attempt_status := case
      when p_reason = 'LEASE_EXPIRED' then 'LEASE_EXPIRED'
      else 'FAILED'
    end;

    update careslink_v1_generation.attempts as attempt
    set status = v_attempt_status,
        provider_evidence_hash = v_evidence_hash,
        canonical_content_hash = null,
        failure_reason = p_reason,
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
      and job.status = 'RUNNING';
  else
    v_attempt_status := case
      when p_reason = 'CANCELLED' then 'CANCELLED'
      when p_reason = 'LEASE_EXPIRED' then 'LEASE_EXPIRED'
      else 'FAILED'
    end;
    v_job_status := case
      when p_reason = 'CANCELLED' then 'CANCELLED'
      else 'FAILED'
    end;
    v_purge_reason := v_job_status;
    v_event_hash := careslink_v1_generation._enqueue_payload_purge(
      v_transaction_id,
      v_job.payload_id,
      v_job.id,
      v_job.owner_user_id,
      v_purge_reason,
      v_now
    );

    update careslink_v1_generation.attempts as attempt
    set status = v_attempt_status,
        provider_evidence_hash = v_evidence_hash,
        canonical_content_hash = null,
        failure_reason = p_reason,
        terminal_transaction_id = v_transaction_id,
        settlement_base_delay_ms = null,
        settlement_jitter_ms = null,
        settlement_retry_delay_ms = null,
        finished_at = v_now
    where attempt.id = v_attempt.id
      and attempt.status = 'RUNNING';

    update careslink_v1_generation.jobs as job
    set status = v_job_status,
        next_eligible_at = null,
        failure_reason = p_reason,
        finished_at = v_now,
        updated_at = v_now
    where job.id = v_job.id
      and job.status = 'RUNNING';
  end if;

  return careslink_v1_generation._failure_envelope(
    p_job_id,
    p_attempt_id,
    p_registration_digest
  );
end;
$$;


select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);


-- -------------------------------------------------------------------------
-- Exact ACL closure; purpose ownership is not a caller grant
-- -------------------------------------------------------------------------

set role careslink_v1_generation_owner;
revoke create on schema careslink_v1_generation
  from careslink_v1_generation_points_settlement_executor,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_points_settlement_executor;

revoke all on function
  careslink_v1_generation._settle_v1_shadow_communication_note_points(
    pg_catalog.uuid, pg_catalog.text, pg_catalog.int4, pg_catalog.uuid,
    pg_catalog.uuid, pg_catalog.text, pg_catalog.text
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;
revoke all on function
  careslink_v1_generation._assert_v1_shadow_communication_note_point_state(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner;
revoke all on function
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_settlement()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;
revoke all on function
  careslink_v1_generation._deny_v1_shadow_communication_note_point_settlement_mutation()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;
revoke all on function
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_payload_grant(),
  careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;
revoke all on function
  careslink_v1_generation._communication_note_paid_reservation_expires_at(
    pg_catalog.uuid, pg_catalog.uuid
  ),
  careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(
    pg_catalog.uuid, pg_catalog.uuid
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;

revoke execute on function
  careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt(),
  careslink_v1_generation._guard_v1_shadow_communication_note_paid_payload_grant(),
  careslink_v1_generation._enforce_v1_shadow_communication_note_point_settlement(),
  careslink_v1_generation._deny_v1_shadow_communication_note_point_settlement_mutation()
  from careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;
revoke all on table
  careslink_v1_generation.communication_note_paid_recovery_turns
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;
revoke all on type
  careslink_v1_generation.communication_note_paid_recovery_turns
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;
grant select on table
  careslink_v1_generation.communication_note_paid_recovery_turns
  to careslink_v1_generation_executor;
grant insert (
  registration_digest, paid_first, running_first, created_at, updated_at,
  shadow_only
) on table careslink_v1_generation.communication_note_paid_recovery_turns
  to careslink_v1_generation_executor;
grant update (paid_first, running_first, updated_at) on table
  careslink_v1_generation.communication_note_paid_recovery_turns
  to careslink_v1_generation_executor;
revoke all on table
  careslink_v1_generation.communication_note_point_settlements
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;
revoke all on type
  careslink_v1_generation.communication_note_point_settlements
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_executor;
revoke all on function
  careslink_v1_generation._new_communication_note_point_settlement_uuid(),
  careslink_v1_generation._communication_note_point_settlement_sha256_text(
    pg_catalog.text
  ),
  careslink_v1_generation._communication_note_point_settlement_content_sha256(
    pg_catalog.jsonb
  ),
  careslink_v1_generation._communication_note_job_has_point_admission(
    pg_catalog.uuid, pg_catalog.uuid
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor;
grant execute on function
  careslink_v1_generation._new_communication_note_point_settlement_uuid(),
  careslink_v1_generation._communication_note_point_settlement_sha256_text(
    pg_catalog.text
  ),
  careslink_v1_generation._communication_note_point_settlement_content_sha256(
    pg_catalog.jsonb
  ),
  careslink_v1_generation._communication_note_job_has_point_admission(
    pg_catalog.uuid, pg_catalog.uuid
  ) to careslink_v1_generation_points_settlement_executor;
revoke all on function
  careslink_v1_generation.claim_v1_shadow_note_generation_job(
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation.recover_v1_shadow_note_generation_expired(
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.text
  ),
  careslink_v1_generation.commit_v1_shadow_note_generation_success(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.jsonb, pg_catalog.text, pg_catalog.jsonb
  ),
  careslink_v1_generation.settle_v1_shadow_note_generation_failure(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.jsonb
  ),
  careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation._success_envelope(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text
  ),
  careslink_v1_generation._failure_envelope(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text
  ),
  careslink_v1_generation._settle_denied_authority(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.text, pg_catalog.timestamptz
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;
revoke all on function
  careslink_v1_generation._success_envelope_without_point_assertion(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text
  ),
  careslink_v1_generation._failure_envelope_without_point_assertion(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text
  ),
  careslink_v1_generation._recover_v1_shadow_note_generation_expired_unpaid(
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ),
  careslink_v1_generation._authorize_v1_shadow_note_generation_payload_attempt_unbounded(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text,
    pg_catalog.text
  ),
  careslink_v1_generation._fence_v1_shadow_note_generation_attempt_pre_points(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner_api_executor;
revoke all on function
  careslink_v1_generation._owner_api_job_view(
    pg_catalog.uuid, pg_catalog.uuid
  ),
  careslink_v1_generation._owner_api_job_view_without_point_assertion(
    pg_catalog.uuid, pg_catalog.uuid
  ),
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid,
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.timestamptz
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor;
select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

revoke careslink_v1_generation_points_settlement_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_points_admission_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner_api_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;

commit;
