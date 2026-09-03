begin;

-- Source-only, default-off binding between a server-staged encrypted payload
-- receipt and the atomic Communication Note + 20-Point admission lane. This
-- migration creates no LOGIN, credential, Data API RPC, route, deployment,
-- care-data row or model call.

select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

do $careslink_v1_policy_bound_admission_preflight$
begin
  if pg_catalog.current_setting('server_version_num')::pg_catalog.int4 < 160000
    or pg_catalog.to_regrole('careslink_v1_generation_owner') is null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_owner_api_executor'
    ) is null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_points_admission_executor'
    ) is null
    or pg_catalog.to_regrole(
      'careslink_v1_generation_points_settlement_executor'
    ) is null
    or pg_catalog.to_regclass(
      'careslink_v1_generation.payload_policies'
    ) is null
    or pg_catalog.to_regclass('careslink_v1_generation.payloads') is null
    or pg_catalog.to_regclass('careslink_v1_generation.jobs') is null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamp with time zone)'
    ) is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POLICY_BOUND_ADMISSION_PREDECESSOR_UNSAFE';
  end if;

  if pg_catalog.to_regrole(
      'careslink_v1_generation_points_admission_caller'
    ) is not null
    or pg_catalog.to_regprocedure(
      'careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamp with time zone,text,text,text,text,text)'
    ) is not null
    or exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid in (
        'careslink_v1_generation.payload_policies'::pg_catalog.regclass,
        'careslink_v1_generation.payloads'::pg_catalog.regclass
      )
        and attribute.attname = 'kms_key_version_resource_hash'
        and not attribute.attisdropped
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POLICY_BOUND_ADMISSION_IDENTITY_EXISTS';
  end if;
end
$careslink_v1_policy_bound_admission_preflight$;

-- This caller is a credentialless purpose shell for a later direct Postgres
-- server adapter. It is deliberately unrelated to authenticated/Data API and
-- to every synthetic Preview custody identity.
create role careslink_v1_generation_points_admission_caller
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;

-- PostgreSQL 16 SET-only edges are migration-scoped and removed before
-- COMMIT. The caller's unavoidable bootstrap-superuser ADMIN edge is
-- non-inheriting/non-SET and is asserted exactly at the end of the migration.
-- No runtime identity becomes a member of either executor or the caller.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_owner_api_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_generation_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

-- Constraint triggers are not retroactive. Prove under the established
-- cross-owner FORCE-RLS reader that no historical paid Communication row can
-- be left with a NULL KMS receipt when the new columns are added. No digest is
-- guessed or backfilled.
set role careslink_v1_generation_executor;

do $careslink_v1_policy_bound_admission_existing_paid_row_preflight$
begin
  if exists (
    select 1
    from careslink_v1_generation.jobs as job
    where job.note_type = 'communication'
      and job.communication_note_point_admission_id is not null
  )
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POLICY_BOUND_ADMISSION_EXISTING_PAID_ROWS_UNSAFE';
  end if;
end
$careslink_v1_policy_bound_admission_existing_paid_row_preflight$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;

alter table careslink_v1_generation.payload_policies
  add column kms_key_version_resource_hash pg_catalog.text,
  add constraint payload_policies_kms_resource_hash_check check (
    kms_key_version_resource_hash is null
    or kms_key_version_resource_hash ~ '^[a-f0-9]{64}$'
  ),
  add constraint payload_policies_encrypted_binding_unique unique (
    policy_version,
    policy_digest,
    encryption_profile_version,
    kms_key_version_resource_hash,
    backup_disposition_version
  );

alter table careslink_v1_generation.payloads
  add column kms_key_version_resource_hash pg_catalog.text,
  add constraint payloads_kms_resource_hash_check check (
    kms_key_version_resource_hash is null
    or kms_key_version_resource_hash ~ '^[a-f0-9]{64}$'
  ),
  add constraint payloads_encrypted_policy_binding_fk foreign key (
    policy_version,
    policy_snapshot_hash,
    encryption_profile_version,
    kms_key_version_resource_hash,
    backup_disposition_version
  ) references careslink_v1_generation.payload_policies (
    policy_version,
    policy_digest,
    encryption_profile_version,
    kms_key_version_resource_hash,
    backup_disposition_version
  ) on update restrict on delete restrict
    deferrable initially deferred
  ;

-- Policy identity is immutable after admission. The sole exception is the
-- coordinator's one-time NULL -> KMS digest fill, fenced by both its definer
-- identity and transaction-local payload/hash markers.
create function
  careslink_v1_generation._guard_v1_payload_policy_binding_mutation()
returns pg_catalog.trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $careslink_v1_guard_payload_policy_binding_mutation$
begin
  if tg_table_name = 'jobs' then
    if new.payload_policy_version is distinct from old.payload_policy_version
      or new.payload_policy_snapshot_hash is distinct from
        old.payload_policy_snapshot_hash
    then
      raise exception using
        errcode = 'P0001',
        message = 'PRODUCT_API_DISABLED';
    end if;
    return new;
  end if;

  if tg_table_name <> 'payloads'
    or new.policy_version is distinct from old.policy_version
    or new.policy_snapshot_hash is distinct from old.policy_snapshot_hash
    or new.encryption_profile_version is distinct from
      old.encryption_profile_version
    or new.backup_disposition_version is distinct from
      old.backup_disposition_version
    or (
      new.kms_key_version_resource_hash is distinct from
        old.kms_key_version_resource_hash
      and not (
        current_user = 'careslink_v1_generation_owner_api_executor'
        and old.kms_key_version_resource_hash is null
        and new.kms_key_version_resource_hash ~ '^[a-f0-9]{64}$'
        and pg_catalog.current_setting(
          'careslink.v1_policy_admission_kms_payload_id', true
        ) is not distinct from new.id::pg_catalog.text
        and pg_catalog.current_setting(
          'careslink.v1_policy_admission_kms_resource_hash', true
        ) is not distinct from new.kms_key_version_resource_hash
        and pg_catalog.current_setting(
          'careslink.v1_generation_owner_user_id', true
        ) is not distinct from new.owner_user_id::pg_catalog.text
      )
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  return new;
end
$careslink_v1_guard_payload_policy_binding_mutation$;

revoke all on function
  careslink_v1_generation._guard_v1_payload_policy_binding_mutation()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_executor,
    careslink_v1_generation_owner_api_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor,
    careslink_v1_generation_points_admission_caller,
    careslink_v1_preview_authorization_registration_caller,
    careslink_v1_preview_authorization_revocation_caller,
    careslink_v1_preview_dispatch_caller,
    careslink_v1_preview_receipt_caller,
    careslink_v1_preview_runner_terminal_caller;

-- The owner API executor may populate this one receipt digest only while its
-- existing owner-bound FORCE-RLS policy applies. It receives no catalog write.
grant update (kms_key_version_resource_hash)
  on table careslink_v1_generation.payloads
  to careslink_v1_generation_owner_api_executor;

grant usage on schema careslink_v1_generation
  to careslink_v1_generation_points_admission_caller;
revoke create on schema careslink_v1_generation
  from careslink_v1_generation_points_admission_caller;
revoke all on table
  careslink_v1_generation.payload_policies,
  careslink_v1_generation.payloads,
  careslink_v1_generation.jobs
  from careslink_v1_generation_points_admission_caller;

-- CREATE exists only long enough for the established low-privilege owner API
-- executor to own the definer functions.
grant create on schema careslink_v1_generation
  to careslink_v1_generation_owner_api_executor;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner_api_executor;

-- Deferred final-state enforcement lets the reviewed 19-argument coordinator
-- call its 14-argument predecessor, which inserts the payload before the KMS
-- digest is known to that predecessor. A direct predecessor call may create an
-- unpaid five-Note payload, but it cannot COMMIT a paid Communication payload
-- without the exact catalog-bound KMS digest.
create function
  careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding()
returns pg_catalog.trigger
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_enforce_paid_payload_policy_binding$
declare
  v_job_id pg_catalog.uuid;
  v_owner_user_id pg_catalog.uuid;
  v_job record;
  v_payload record;
begin
  if tg_table_name = 'jobs' then
    v_job_id := new.id;
    v_owner_user_id := new.owner_user_id;
  elsif tg_table_name = 'payloads' then
    v_job_id := new.job_id;
    v_owner_user_id := new.owner_user_id;
  else
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  perform careslink_v1_generation._set_owner(v_owner_user_id);

  select
    job.id,
    job.payload_id,
    job.note_type,
    job.payload_policy_version,
    job.payload_policy_snapshot_hash,
    job.communication_note_point_admission_id
  into v_job
  from careslink_v1_generation.jobs as job
  where job.id = v_job_id
    and job.owner_user_id = v_owner_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  if v_job.note_type is distinct from 'communication'
    or v_job.communication_note_point_admission_id is null
  then
    return null;
  end if;

  select
    payload.id,
    payload.policy_version,
    payload.policy_snapshot_hash,
    payload.encryption_profile_version,
    payload.kms_key_version_resource_hash,
    payload.backup_disposition_version,
    policy.status as policy_status,
    policy.shadow_only as policy_shadow_only,
    policy.encryption_profile_version as catalog_encryption_profile_version,
    policy.kms_key_version_resource_hash
      as catalog_kms_key_version_resource_hash,
    policy.backup_disposition_version as catalog_backup_disposition_version
  into v_payload
  from careslink_v1_generation.payloads as payload
  join careslink_v1_generation.payload_policies as policy
    on policy.policy_version = payload.policy_version
    and policy.policy_digest = payload.policy_snapshot_hash
  where payload.id = v_job.payload_id
    and payload.job_id = v_job.id
    and payload.owner_user_id = v_owner_user_id;

  if not found
    or v_payload.policy_version is distinct from
      v_job.payload_policy_version
    or v_payload.policy_snapshot_hash is distinct from
      v_job.payload_policy_snapshot_hash
    or v_payload.policy_status is distinct from 'APPROVED'
    or v_payload.policy_shadow_only is distinct from true
    or v_payload.kms_key_version_resource_hash is null
    or v_payload.encryption_profile_version is distinct from
      v_payload.catalog_encryption_profile_version
    or v_payload.kms_key_version_resource_hash is distinct from
      v_payload.catalog_kms_key_version_resource_hash
    or v_payload.backup_disposition_version is distinct from
      v_payload.catalog_backup_disposition_version
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  return null;
end
$careslink_v1_enforce_paid_payload_policy_binding$;

create function
  careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(
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
    p_payload_expires_at pg_catalog.timestamptz,
    p_payload_policy_version pg_catalog.text,
    p_payload_policy_snapshot_hash pg_catalog.text,
    p_encryption_profile_version pg_catalog.text,
    p_kms_key_version_resource_hash pg_catalog.text,
    p_backup_disposition_version pg_catalog.text
  )
returns pg_catalog.jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $careslink_v1_policy_bound_communication_admission$
declare
  v_admission pg_catalog.jsonb;
  v_created pg_catalog.bool;
  v_job_id pg_catalog.uuid;
  v_final record;
  v_updated_count pg_catalog.int4;
begin
  -- A caller may have issued SET CONSTRAINTS ALL IMMEDIATE before invoking
  -- the RPC. Restore this coordinator's final-state checks before the legacy
  -- insert so the KMS digest can be filled later in this same function call.
  set constraints
    careslink_v1_generation.jobs_paid_communication_payload_policy_binding,
    careslink_v1_generation.payloads_paid_communication_policy_binding
    deferred;

  if p_payload_policy_version is null
    or p_payload_policy_version !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_payload_policy_snapshot_hash is null
    or p_payload_policy_snapshot_hash !~ '^[a-f0-9]{64}$'
    or p_encryption_profile_version is null
    or p_encryption_profile_version !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_kms_key_version_resource_hash is null
    or p_kms_key_version_resource_hash !~ '^[a-f0-9]{64}$'
    or p_backup_disposition_version is null
    or p_backup_disposition_version !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform careslink_v1_generation._set_owner(p_owner_user_id);

  -- Lock the exact approved catalog receipt before admission. The predecessor
  -- chooses and locks the ACTIVE registration only for a fresh job; an exact
  -- idempotent replay remains bound to its historical immutable policy after
  -- a later rotation. Fresh staged-A/active-B drift still rolls the whole job
  -- and Points transaction back in the final persisted-row comparison.
  perform policy.policy_version
  from careslink_v1_generation.payload_policies as policy
  where policy.policy_version = p_payload_policy_version
    and policy.policy_digest = p_payload_policy_snapshot_hash
    and policy.encryption_profile_version = p_encryption_profile_version
    and policy.kms_key_version_resource_hash =
      p_kms_key_version_resource_hash
    and policy.backup_disposition_version = p_backup_disposition_version
    and policy.status = 'APPROVED'
    and policy.shadow_only is true
    and careslink_v1_generation._payload_snapshot_is_valid(
      p_payload_policy_version,
      p_payload_policy_snapshot_hash,
      p_encryption_profile_version,
      p_backup_disposition_version
    )
  for share of policy;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  v_admission :=
    careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
      p_owner_user_id,
      p_session_id,
      p_admission_transport,
      p_job_id,
      p_payload_id,
      p_privacy_review_id,
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
    or not (v_admission ?& array[
      'created', 'payloadAccepted', 'pointsReserved', 'job'
    ])
    or v_admission - array[
      'created', 'payloadAccepted', 'pointsReserved', 'job'
    ] <> '{}'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(v_admission->'created') is distinct from
      'boolean'
    or pg_catalog.jsonb_typeof(v_admission->'payloadAccepted') is distinct from
      'boolean'
    or v_admission->'pointsReserved' is distinct from
      'true'::pg_catalog.jsonb
    or pg_catalog.jsonb_typeof(v_admission->'job') is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_admission #> '{job,jobId}') is distinct from
      'string'
  then
    raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
  end if;

  v_created := (v_admission->>'created')::pg_catalog.bool;
  v_job_id := (v_admission #>> '{job,jobId}')::pg_catalog.uuid;

  if v_created then
    if v_job_id is distinct from p_job_id
      or v_admission->'payloadAccepted' is distinct from
        'true'::pg_catalog.jsonb
    then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    perform pg_catalog.set_config(
      'careslink.v1_policy_admission_kms_payload_id',
      p_payload_id::pg_catalog.text,
      true
    );
    perform pg_catalog.set_config(
      'careslink.v1_policy_admission_kms_resource_hash',
      p_kms_key_version_resource_hash,
      true
    );

    update careslink_v1_generation.payloads as payload
    set kms_key_version_resource_hash = p_kms_key_version_resource_hash
    where payload.id = p_payload_id
      and payload.job_id = v_job_id
      and payload.owner_user_id = p_owner_user_id
      and payload.kms_key_version_resource_hash is null;
    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
      raise exception using errcode = 'P0001', message = 'INTERNAL_FAILURE';
    end if;

    perform pg_catalog.set_config(
      'careslink.v1_policy_admission_kms_payload_id', '', true
    );
    perform pg_catalog.set_config(
      'careslink.v1_policy_admission_kms_resource_hash', '', true
    );
  end if;

  -- Replays never backfill legacy evidence. The already persisted payload
  -- must prove all five fields; otherwise the earlier job and its Points state
  -- remain unchanged because this transaction aborts.
  select
    job.payload_policy_version as job_payload_policy_version,
    job.payload_policy_snapshot_hash as job_payload_policy_snapshot_hash,
    payload.policy_version,
    payload.policy_snapshot_hash,
    payload.encryption_profile_version,
    payload.kms_key_version_resource_hash,
    payload.backup_disposition_version
  into v_final
  from careslink_v1_generation.jobs as job
  join careslink_v1_generation.payloads as payload
    on payload.id = job.payload_id
    and payload.job_id = job.id
    and payload.owner_user_id = job.owner_user_id
  where job.id = v_job_id
    and job.owner_user_id = p_owner_user_id
    and job.note_type = 'communication'
    and job.communication_note_point_admission_id is not null
  for update of payload;

  if not found
    or v_final.job_payload_policy_version is distinct from
      p_payload_policy_version
    or v_final.job_payload_policy_snapshot_hash is distinct from
      p_payload_policy_snapshot_hash
    or v_final.policy_version is distinct from p_payload_policy_version
    or v_final.policy_snapshot_hash is distinct from
      p_payload_policy_snapshot_hash
    or v_final.encryption_profile_version is distinct from
      p_encryption_profile_version
    or v_final.kms_key_version_resource_hash is distinct from
      p_kms_key_version_resource_hash
    or v_final.backup_disposition_version is distinct from
      p_backup_disposition_version
  then
    raise exception using
      errcode = 'P0001',
      message = 'PRODUCT_API_DISABLED';
  end if;

  -- Surface the deferred paid-payload invariant before returning an ACK. The
  -- caller cannot observe a success envelope for a transaction that would
  -- subsequently fail only at COMMIT.
  set constraints
    careslink_v1_generation.jobs_paid_communication_payload_policy_binding,
    careslink_v1_generation.payloads_paid_communication_policy_binding
    immediate;

  return v_admission;
end
$careslink_v1_policy_bound_communication_admission$;

-- Default function EXECUTE is public in PostgreSQL. Close it before granting
-- exactly one direct-query caller. The function owner remains a credentialless
-- executor by definition; no role receives membership in it.
revoke all on function
  careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding()
  from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor,
    careslink_v1_generation_points_admission_caller,
    careslink_v1_preview_authorization_registration_caller,
    careslink_v1_preview_authorization_revocation_caller,
    careslink_v1_preview_dispatch_caller,
    careslink_v1_preview_receipt_caller,
    careslink_v1_preview_runner_terminal_caller;

revoke all on function
  careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid,
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.timestamptz, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text
  ) from public, anon, authenticated, service_role, authenticator,
    careslink_v1_generation_owner,
    careslink_v1_generation_executor,
    careslink_v1_generation_points_admission_executor,
    careslink_v1_generation_points_settlement_executor,
    careslink_v1_generation_registration_control_executor,
    careslink_v1_preview_authorization_executor,
    careslink_v1_preview_dispatch_executor,
    careslink_v1_preview_receipt_executor,
    careslink_v1_preview_runner_terminal_executor,
    careslink_v1_preview_authorization_registration_caller,
    careslink_v1_preview_authorization_revocation_caller,
    careslink_v1_preview_dispatch_caller,
    careslink_v1_preview_receipt_caller,
    careslink_v1_preview_runner_terminal_caller;

grant execute on function
  careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid,
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.timestamptz, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text
  ) to careslink_v1_generation_points_admission_caller;

grant execute on function
  careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding()
  to careslink_v1_generation_owner;

-- The new caller cannot fall back to either the legacy Points coordinator or
-- the generic five-Note owner admission function.
revoke all on function
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid,
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.timestamptz
  ),
  careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid,
    pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
    pg_catalog.text, pg_catalog.text, pg_catalog.timestamptz
  ) from careslink_v1_generation_points_admission_caller;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner;

revoke create on schema careslink_v1_generation
  from careslink_v1_generation_owner_api_executor;

create trigger jobs_payload_policy_binding_immutable
before update of payload_policy_version, payload_policy_snapshot_hash
on careslink_v1_generation.jobs
for each row execute function
  careslink_v1_generation._guard_v1_payload_policy_binding_mutation();

create trigger payloads_policy_binding_immutable
before update of
  policy_version,
  policy_snapshot_hash,
  encryption_profile_version,
  kms_key_version_resource_hash,
  backup_disposition_version
on careslink_v1_generation.payloads
for each row execute function
  careslink_v1_generation._guard_v1_payload_policy_binding_mutation();

create constraint trigger jobs_paid_communication_payload_policy_binding
after insert or update of
  communication_note_point_admission_id,
  payload_id,
  note_type,
  payload_policy_version,
  payload_policy_snapshot_hash,
  owner_user_id
on careslink_v1_generation.jobs
deferrable initially deferred
for each row execute function
  careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding();

create constraint trigger payloads_paid_communication_policy_binding
after insert or update of
  policy_version,
  policy_snapshot_hash,
  encryption_profile_version,
  kms_key_version_resource_hash,
  backup_disposition_version,
  job_id,
  owner_user_id
on careslink_v1_generation.payloads
deferrable initially deferred
for each row execute function
  careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding();

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_generation_owner_api_executor;

revoke execute on function
  careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding()
  from careslink_v1_generation_owner;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

revoke careslink_v1_generation_owner_api_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;
revoke careslink_v1_generation_executor
  from current_user granted by current_user;

-- Fail the migration if the purpose shell gained a row capability, another
-- private function, membership or a role attribute beyond the reviewed
-- USAGE + exact EXECUTE contract.
do $careslink_v1_policy_bound_admission_acl_assertion$
declare
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_generation_points_admission_caller'
  );
  v_entry pg_catalog.oid := pg_catalog.to_regrole(
    pg_catalog.current_setting('careslink.migration_entry_role')
  );
  v_allowed_function pg_catalog.oid := pg_catalog.to_regprocedure(
    'careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamp with time zone,text,text,text,text,text)'
  );
  v_denied_role pg_catalog.text;
begin
  if not pg_catalog.has_schema_privilege(
      v_caller, 'careslink_v1_generation', 'USAGE'
    )
    or pg_catalog.has_schema_privilege(
      v_caller, 'careslink_v1_generation', 'CREATE'
    )
    or not pg_catalog.has_function_privilege(
      v_caller, v_allowed_function, 'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure,
        lateral pg_catalog.aclexplode(
          coalesce(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )
        ) as acl
      where procedure.oid = v_allowed_function
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    or exists (
      select 1
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'careslink_v1_generation'
        and procedure.oid <> v_allowed_function
        and pg_catalog.has_function_privilege(
          v_caller, procedure.oid, 'EXECUTE'
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname in ('careslink_v1_generation', 'public')
        and relation.relkind in ('r', 'p', 'v', 'm')
        and (
          pg_catalog.has_table_privilege(v_caller, relation.oid, 'SELECT')
          or pg_catalog.has_table_privilege(v_caller, relation.oid, 'INSERT')
          or pg_catalog.has_table_privilege(v_caller, relation.oid, 'UPDATE')
          or pg_catalog.has_table_privilege(v_caller, relation.oid, 'DELETE')
          or pg_catalog.has_table_privilege(v_caller, relation.oid, 'TRUNCATE')
          or pg_catalog.has_table_privilege(v_caller, relation.oid, 'REFERENCES')
          or pg_catalog.has_table_privilege(v_caller, relation.oid, 'TRIGGER')
          or pg_catalog.has_any_column_privilege(
            v_caller, relation.oid, 'SELECT'
          )
          or pg_catalog.has_any_column_privilege(
            v_caller, relation.oid, 'INSERT'
          )
          or pg_catalog.has_any_column_privilege(
            v_caller, relation.oid, 'UPDATE'
          )
          or pg_catalog.has_any_column_privilege(
            v_caller, relation.oid, 'REFERENCES'
          )
        )
    )
    or exists (
      select 1
      from pg_catalog.pg_class as sequence
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = sequence.relnamespace
      where namespace.nspname in ('careslink_v1_generation', 'public')
        and sequence.relkind = 'S'
        and (
          pg_catalog.has_sequence_privilege(v_caller, sequence.oid, 'USAGE')
          or pg_catalog.has_sequence_privilege(
            v_caller, sequence.oid, 'SELECT'
          )
          or pg_catalog.has_sequence_privilege(
            v_caller, sequence.oid, 'UPDATE'
          )
        )
    )
    or v_entry is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_caller
        or membership.roleid = v_caller
    ) <> 1
    or not exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as grantor_role
        on grantor_role.oid = membership.grantor
      where membership.roleid = v_caller
        and membership.member = v_entry
        and grantor_role.rolsuper
        and membership.grantor <> membership.member
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
    )
    or exists (
      select 1
      from pg_catalog.pg_roles as role
      where role.oid = v_caller
        and (
          role.rolcanlogin
          or role.rolsuper
          or role.rolcreatedb
          or role.rolcreaterole
          or role.rolinherit
          or role.rolreplication
          or role.rolbypassrls
        )
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'V1_POLICY_BOUND_ADMISSION_CALLER_ACL_UNSAFE';
  end if;

  foreach v_denied_role in array array[
    'anon',
    'authenticated',
    'service_role',
    'authenticator',
    'careslink_v1_generation_owner',
    'careslink_v1_generation_executor',
    'careslink_v1_generation_points_admission_executor',
    'careslink_v1_generation_points_settlement_executor',
    'careslink_v1_generation_registration_control_executor',
    'careslink_v1_preview_authorization_executor',
    'careslink_v1_preview_dispatch_executor',
    'careslink_v1_preview_receipt_executor',
    'careslink_v1_preview_runner_terminal_executor',
    'careslink_v1_preview_authorization_registration_caller',
    'careslink_v1_preview_authorization_revocation_caller',
    'careslink_v1_preview_dispatch_caller',
    'careslink_v1_preview_receipt_caller',
    'careslink_v1_preview_runner_terminal_caller'
  ] loop
    if pg_catalog.has_function_privilege(
      v_denied_role,
      v_allowed_function,
      'EXECUTE'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'V1_POLICY_BOUND_ADMISSION_EXECUTE_UNSAFE';
    end if;
  end loop;
end
$careslink_v1_policy_bound_admission_acl_assertion$;

commit;
