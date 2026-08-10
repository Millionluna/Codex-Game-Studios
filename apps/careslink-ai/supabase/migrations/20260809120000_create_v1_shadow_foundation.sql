begin;

-- CaresLink Product Baseline V1.0 shadow foundation.
-- This migration is additive and intentionally performs no legacy backfill,
-- entitlement cutover, welcome grant, route change, or production activation.

create table if not exists public.service_rate_versions (
  version text primary key,
  status text not null default 'SHADOW'
    check (status in ('SHADOW', 'ACTIVE', 'RETIRED')),
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  constraint service_rate_versions_effective_range_check
    check (effective_until is null or effective_until > effective_from)
);

create table if not exists public.service_rates (
  catalog_version text not null
    references public.service_rate_versions(version) on delete restrict,
  service_code text not null
    check (service_code ~ '^[a-z][a-z0-9_.]{2,95}$'),
  unit text not null check (unit in ('request', 'minute')),
  points integer check (points is null or points >= 0),
  minimum_points integer check (minimum_points is null or minimum_points >= 0),
  maximum_points integer check (maximum_points is null or maximum_points >= 0),
  status text not null default 'SHADOW'
    check (status in ('SHADOW', 'ACTIVE', 'RETIRED')),
  created_at timestamptz not null default now(),
  primary key (catalog_version, service_code),
  constraint service_rates_shape_check check (
    (
      points is not null
      and minimum_points is null
      and maximum_points is null
    )
    or (
      points is null
      and minimum_points is not null
      and maximum_points is not null
      and maximum_points >= minimum_points
    )
  )
);

insert into public.service_rate_versions (
  version,
  status,
  effective_from
)
values (
  '2026-08-09.v1-shadow',
  'SHADOW',
  '2026-08-09T00:00:00.000Z'::timestamptz
)
on conflict (version) do nothing;

insert into public.service_rates (
  catalog_version,
  service_code,
  unit,
  points,
  minimum_points,
  maximum_points,
  status
)
values
  ('2026-08-09.v1-shadow', 'note.communication.generate', 'request', 20, null, null, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'note.handover.generate', 'request', 25, null, null, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'note.progress.generate', 'request', 35, null, null, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'note.ndis.generate', 'request', 50, null, null, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'note.incident_factual.generate', 'request', 60, null, null, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'transcription.device', 'request', 0, null, null, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'transcription.cloud', 'minute', 10, null, null, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'content.explain', 'request', 10, null, null, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'note.regenerate.full', 'request', null, 20, 40, 'SHADOW'),
  ('2026-08-09.v1-shadow', 'note.rewrite.section', 'request', 10, null, null, 'SHADOW')
on conflict (catalog_version, service_code) do nothing;

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  note_type text not null check (
    note_type in (
      'communication',
      'handover',
      'progress',
      'ndis',
      'incident_factual'
    )
  ),
  source_locale text not null check (source_locale in ('en', 'zh-Hans', 'zh-Hant')),
  lifecycle_status text not null default 'IN_PROGRESS' check (
    lifecycle_status in ('IN_PROGRESS', 'COMPLETED', 'TOMBSTONED', 'PURGED')
  ),
  current_revision_id uuid,
  current_revision_number integer not null default 0
    check (current_revision_number >= 0),
  schema_version text not null,
  contract_version text not null,
  shadow_only boolean not null default true check (shadow_only),
  tombstoned_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_user_id),
  constraint ai_documents_lifecycle_time_check check (
    (lifecycle_status not in ('TOMBSTONED', 'PURGED') or tombstoned_at is not null)
    and (lifecycle_status <> 'PURGED' or purged_at is not null)
  )
);

create index if not exists ai_documents_owner_updated_idx
  on public.ai_documents(owner_user_id, updated_at desc);
create index if not exists ai_documents_owner_type_idx
  on public.ai_documents(owner_user_id, note_type, updated_at desc);

create table if not exists public.privacy_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  note_type text not null check (
    note_type in (
      'communication',
      'handover',
      'progress',
      'ndis',
      'incident_factual'
    )
  ),
  cleaned_facts_hash text not null check (cleaned_facts_hash ~ '^[a-f0-9]{64}$'),
  schema_version text not null,
  status text not null default 'CONFIRMED'
    check (status in ('CONFIRMED', 'EXPIRED', 'REVOKED')),
  finding_decisions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(finding_decisions) = 'array'),
  confirmed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, owner_user_id),
  constraint privacy_reviews_expiry_check check (expires_at > confirmed_at)
);

create index if not exists privacy_reviews_owner_created_idx
  on public.privacy_reviews(owner_user_id, created_at desc);

create table if not exists public.ai_document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  base_revision_id uuid,
  privacy_review_id uuid,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  mutation_id text not null check (mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  schema_version text not null,
  contract_version text not null,
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (base_revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  foreign key (privacy_review_id, owner_user_id)
    references public.privacy_reviews(id, owner_user_id) on delete restrict,
  unique (document_id, revision_number),
  unique (owner_user_id, mutation_id),
  unique (id, document_id, owner_user_id)
);

create index if not exists ai_document_revisions_document_number_idx
  on public.ai_document_revisions(document_id, revision_number desc);
create index if not exists ai_document_revisions_owner_created_idx
  on public.ai_document_revisions(owner_user_id, created_at desc);

alter table public.ai_documents
  add constraint ai_documents_current_revision_fk
  foreign key (current_revision_id, id, owner_user_id)
  references public.ai_document_revisions(id, document_id, owner_user_id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.document_checkpoints (
  document_id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  current_step text not null check (current_step ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  completed_field_codes text[] not null default '{}',
  active_revision_id uuid,
  privacy_review_id uuid,
  generation_job_id uuid,
  sync_status text not null check (
    sync_status in (
      'LOCAL_SAVED',
      'SYNCING',
      'SERVER_ACKNOWLEDGED',
      'PENDING_SYNC',
      'NEEDS_ATTENTION'
    )
  ),
  mutation_id text not null check (mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  updated_at timestamptz not null default now(),
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (active_revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  foreign key (privacy_review_id, owner_user_id)
    references public.privacy_reviews(id, owner_user_id) on delete restrict,
  unique (owner_user_id, mutation_id)
);

create table if not exists public.self_review_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  revision_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('CONFIRMED', 'INVALIDATED')),
  facts_confirmed boolean,
  wording_confirmed boolean,
  missing_facts_reviewed boolean,
  invalidation_reason text,
  mutation_id text not null check (mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  created_at timestamptz not null default now(),
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete cascade,
  unique (owner_user_id, mutation_id),
  constraint self_review_events_shape_check check (
    (
      event = 'CONFIRMED'
      and facts_confirmed is true
      and wording_confirmed is true
      and missing_facts_reviewed is true
      and invalidation_reason is null
    )
    or (
      event = 'INVALIDATED'
      and invalidation_reason is not null
    )
  )
);

create index if not exists self_review_events_document_created_idx
  on public.self_review_events(document_id, created_at desc);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  base_revision_id uuid,
  service_code text not null,
  quote_id uuid,
  reservation_id uuid,
  idempotency_key text not null
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  result_revision_id uuid,
  failure_code text,
  schema_version text not null,
  prompt_version text,
  model text,
  parser_version text,
  policy_version text,
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (base_revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  foreign key (result_revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  unique (id, document_id, owner_user_id),
  unique (owner_user_id, service_code, idempotency_key)
);

alter table public.document_checkpoints
  add constraint document_checkpoints_generation_job_fk
  foreign key (generation_job_id, document_id, owner_user_id)
  references public.generation_jobs(id, document_id, owner_user_id)
  on delete restrict;

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  revision_id uuid not null,
  format text not null check (format in ('DOCX', 'PDF', 'TXT', 'COPY')),
  status text not null default 'REQUESTED' check (
    status in (
      'REQUESTED',
      'RENDERING',
      'ARTIFACT_READY',
      'DOWNLOADED',
      'SHARED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'PURGED'
    )
  ),
  template_version text not null,
  export_profile text not null default 'RECORD_COPY',
  idempotency_key text not null
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  artifact_ref_hash text check (artifact_ref_hash is null or artifact_ref_hash ~ '^[a-f0-9]{64}$'),
  artifact_expires_at timestamptz,
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete cascade,
  foreign key (revision_id, document_id, owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  unique (id, owner_user_id),
  unique (owner_user_id, format, idempotency_key)
);

create table if not exists public.export_events (
  id uuid primary key default gen_random_uuid(),
  export_job_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (
    status in (
      'REQUESTED',
      'RENDERING',
      'ARTIFACT_READY',
      'DOWNLOADED',
      'SHARED',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'PURGED'
    )
  ),
  reason_code text,
  created_at timestamptz not null default now(),
  foreign key (export_job_id, owner_user_id)
    references public.export_jobs(id, owner_user_id) on delete cascade
);

create index if not exists export_events_job_created_idx
  on public.export_events(export_job_id, created_at);

create table if not exists public.point_wallets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id),
  unique (id, owner_user_id)
);

create table if not exists public.point_lots (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (
    source in ('WELCOME', 'SUBSCRIPTION', 'TOP_UP', 'LEGACY_MIGRATION', 'ADJUSTMENT')
  ),
  source_reference text not null
    check (source_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  original_points integer not null check (original_points > 0),
  remaining_points integer not null check (
    remaining_points >= 0 and remaining_points <= original_points
  ),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  shadow_only boolean not null default true check (shadow_only),
  created_at timestamptz not null default now(),
  foreign key (wallet_id, owner_user_id)
    references public.point_wallets(id, owner_user_id) on delete cascade,
  unique (owner_user_id, source, source_reference),
  unique (id, wallet_id, owner_user_id),
  constraint point_lots_expiry_check
    check (expires_at is null or expires_at > granted_at)
);

create index if not exists point_lots_wallet_expiry_idx
  on public.point_lots(wallet_id, expires_at, granted_at);

create table if not exists public.point_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  service_code text not null,
  catalog_version text not null,
  points integer not null check (points >= 0),
  quantity integer not null default 1 check (quantity > 0),
  idempotency_key text not null
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  shadow_only boolean not null default true check (shadow_only),
  foreign key (catalog_version, service_code)
    references public.service_rates(catalog_version, service_code) on delete restrict,
  unique (id, owner_user_id),
  unique (owner_user_id, service_code, idempotency_key),
  constraint point_quotes_expiry_check check (expires_at > created_at)
);

create table if not exists public.point_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid not null,
  service_code text not null,
  catalog_version text not null,
  points integer not null check (points > 0),
  idempotency_key text not null
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  status text not null default 'RESERVED'
    check (status in ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED')),
  result_ref text,
  reason_code text,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  terminal_at timestamptz,
  shadow_only boolean not null default true check (shadow_only),
  foreign key (wallet_id, owner_user_id)
    references public.point_wallets(id, owner_user_id) on delete cascade,
  foreign key (quote_id, owner_user_id)
    references public.point_quotes(id, owner_user_id) on delete restrict,
  foreign key (catalog_version, service_code)
    references public.service_rates(catalog_version, service_code) on delete restrict,
  unique (owner_user_id, service_code, idempotency_key),
  unique (id, owner_user_id),
  constraint point_reservations_expiry_check check (expires_at > reserved_at),
  constraint point_reservations_terminal_check check (
    (status = 'RESERVED' and terminal_at is null and result_ref is null)
    or (status = 'COMMITTED' and terminal_at is not null and result_ref is not null)
    or (status in ('RELEASED', 'EXPIRED') and terminal_at is not null and reason_code is not null)
  )
);

alter table public.generation_jobs
  add constraint generation_jobs_quote_fk
  foreign key (quote_id, owner_user_id)
  references public.point_quotes(id, owner_user_id)
  on delete restrict;

alter table public.generation_jobs
  add constraint generation_jobs_reservation_fk
  foreign key (reservation_id, owner_user_id)
  references public.point_reservations(id, owner_user_id)
  on delete restrict;

create table if not exists public.point_reservation_allocations (
  reservation_id uuid not null,
  lot_id uuid not null,
  wallet_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null check (points > 0),
  created_at timestamptz not null default now(),
  primary key (reservation_id, lot_id),
  foreign key (reservation_id, owner_user_id)
    references public.point_reservations(id, owner_user_id) on delete cascade,
  foreign key (lot_id, wallet_id, owner_user_id)
    references public.point_lots(id, wallet_id, owner_user_id) on delete restrict
);

create table if not exists public.point_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (
    event in ('GRANT', 'RESERVE', 'COMMIT', 'RELEASE', 'EXPIRE', 'REVOKE', 'ADJUSTMENT')
  ),
  points integer not null check (points > 0),
  delta integer not null,
  lot_id uuid,
  reservation_id uuid,
  service_code text,
  catalog_version text,
  idempotency_key text,
  source_reference text,
  result_ref text,
  reason_code text,
  created_at timestamptz not null default now(),
  shadow_only boolean not null default true check (shadow_only),
  foreign key (wallet_id, owner_user_id)
    references public.point_wallets(id, owner_user_id) on delete cascade,
  foreign key (lot_id, wallet_id, owner_user_id)
    references public.point_lots(id, wallet_id, owner_user_id) on delete restrict,
  foreign key (reservation_id, owner_user_id)
    references public.point_reservations(id, owner_user_id) on delete restrict,
  constraint point_ledger_entries_shape_check check (
    (event = 'GRANT' and delta = points and lot_id is not null and reservation_id is null)
    or (event = 'RESERVE' and delta = -points and reservation_id is not null)
    or (event = 'COMMIT' and delta = 0 and reservation_id is not null and result_ref is not null)
    or (event in ('RELEASE', 'EXPIRE') and delta = points and reservation_id is not null and reason_code is not null)
    or (event in ('REVOKE', 'ADJUSTMENT') and reason_code is not null)
  )
);

create unique index if not exists point_ledger_grant_reference_idx
  on public.point_ledger_entries(owner_user_id, event, source_reference)
  where event = 'GRANT';
create unique index if not exists point_ledger_reserve_idx
  on public.point_ledger_entries(reservation_id)
  where event = 'RESERVE';
create unique index if not exists point_ledger_terminal_idx
  on public.point_ledger_entries(reservation_id)
  where event in ('COMMIT', 'RELEASE', 'EXPIRE');
create index if not exists point_ledger_owner_created_idx
  on public.point_ledger_entries(owner_user_id, created_at desc);

create table if not exists public.legacy_document_migration_batches (
  id uuid primary key default gen_random_uuid(),
  source_table text not null check (source_table = 'generated_material_drafts'),
  code_sha text not null check (code_sha ~ '^[a-f0-9]{40}$'),
  adapter_version text not null,
  source_row_count integer not null check (source_row_count >= 0),
  source_id_set_hash text not null check (source_id_set_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'PLANNED'
    check (status in ('PLANNED', 'RUNNING', 'RECONCILED', 'ROLLED_BACK', 'FAILED')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.legacy_document_migration_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null
    references public.legacy_document_migration_batches(id) on delete restrict,
  source_table text not null check (source_table = 'generated_material_drafts'),
  source_id text not null,
  source_owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_feature text not null check (source_feature = 'ndis_case_note'),
  source_content_hash text not null check (source_content_hash ~ '^[a-f0-9]{64}$'),
  target_document_id uuid,
  target_revision_id uuid,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROJECTED', 'MIGRATED', 'FAILED', 'ROLLED_BACK')),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (target_document_id, source_owner_user_id)
    references public.ai_documents(id, owner_user_id) on delete restrict,
  foreign key (target_revision_id, target_document_id, source_owner_user_id)
    references public.ai_document_revisions(id, document_id, owner_user_id)
    on delete restrict,
  unique (source_table, source_id),
  unique (batch_id, source_table, source_id),
  constraint legacy_document_migration_target_shape_check check (
    target_revision_id is null or target_document_id is not null
  )
);

-- RLS is enabled before any application integration. Authenticated users have
-- owner-only read access and no direct write access. Shadow writes remain
-- service-role RPC-only until a separately approved cutover migration.

alter table public.service_rate_versions enable row level security;
alter table public.service_rates enable row level security;
alter table public.ai_documents enable row level security;
alter table public.privacy_reviews enable row level security;
alter table public.ai_document_revisions enable row level security;
alter table public.document_checkpoints enable row level security;
alter table public.self_review_events enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.export_jobs enable row level security;
alter table public.export_events enable row level security;
alter table public.point_wallets enable row level security;
alter table public.point_lots enable row level security;
alter table public.point_quotes enable row level security;
alter table public.point_reservations enable row level security;
alter table public.point_reservation_allocations enable row level security;
alter table public.point_ledger_entries enable row level security;
alter table public.legacy_document_migration_batches enable row level security;
alter table public.legacy_document_migration_items enable row level security;

revoke all on public.service_rate_versions from public, anon, authenticated, service_role;
revoke all on public.service_rates from public, anon, authenticated, service_role;
revoke all on public.ai_documents from public, anon, authenticated, service_role;
revoke all on public.privacy_reviews from public, anon, authenticated, service_role;
revoke all on public.ai_document_revisions from public, anon, authenticated, service_role;
revoke all on public.document_checkpoints from public, anon, authenticated, service_role;
revoke all on public.self_review_events from public, anon, authenticated, service_role;
revoke all on public.generation_jobs from public, anon, authenticated, service_role;
revoke all on public.export_jobs from public, anon, authenticated, service_role;
revoke all on public.export_events from public, anon, authenticated, service_role;
revoke all on public.point_wallets from public, anon, authenticated, service_role;
revoke all on public.point_lots from public, anon, authenticated, service_role;
revoke all on public.point_quotes from public, anon, authenticated, service_role;
revoke all on public.point_reservations from public, anon, authenticated, service_role;
revoke all on public.point_reservation_allocations from public, anon, authenticated, service_role;
revoke all on public.point_ledger_entries from public, anon, authenticated, service_role;
revoke all on public.legacy_document_migration_batches from public, anon, authenticated, service_role;
revoke all on public.legacy_document_migration_items from public, anon, authenticated, service_role;

grant select on public.ai_documents to authenticated, service_role;
grant select on public.privacy_reviews to authenticated, service_role;
grant select on public.ai_document_revisions to authenticated, service_role;
grant select on public.document_checkpoints to authenticated, service_role;
grant select on public.self_review_events to authenticated, service_role;
grant select on public.generation_jobs to authenticated, service_role;
grant select on public.export_jobs to authenticated, service_role;
grant select on public.export_events to authenticated, service_role;
grant select on public.point_wallets to authenticated, service_role;
grant select on public.point_lots to authenticated, service_role;
grant select on public.point_quotes to authenticated, service_role;
grant select on public.point_reservations to authenticated, service_role;
grant select on public.point_reservation_allocations to authenticated, service_role;
grant select on public.point_ledger_entries to authenticated, service_role;
grant select on public.service_rate_versions to service_role;
grant select on public.service_rates to service_role;
grant select on public.legacy_document_migration_batches to service_role;
grant select on public.legacy_document_migration_items to service_role;

create policy ai_documents_owner_select on public.ai_documents
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy privacy_reviews_owner_select on public.privacy_reviews
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy ai_document_revisions_owner_select on public.ai_document_revisions
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy document_checkpoints_owner_select on public.document_checkpoints
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy self_review_events_owner_select on public.self_review_events
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy generation_jobs_owner_select on public.generation_jobs
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy export_jobs_owner_select on public.export_jobs
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy export_events_owner_select on public.export_events
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy point_wallets_owner_select on public.point_wallets
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy point_lots_owner_select on public.point_lots
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy point_quotes_owner_select on public.point_quotes
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy point_reservations_owner_select on public.point_reservations
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy point_reservation_allocations_owner_select
  on public.point_reservation_allocations
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);
create policy point_ledger_entries_owner_select on public.point_ledger_entries
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);

-- Shadow Points RPCs. These functions are inert until the migration is
-- separately approved/applied and an off-by-default server feature flag is
-- enabled. They never read or modify account_entitlements or credit_ledger.

create or replace function public.grant_shadow_point_lot(
  p_user_id uuid,
  p_source text,
  p_source_reference text,
  p_points integer,
  p_expires_at timestamptz default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.point_wallets%rowtype;
  v_lot public.point_lots%rowtype;
begin
  if p_user_id is null
    or p_source not in ('WELCOME', 'SUBSCRIPTION', 'TOP_UP', 'LEGACY_MIGRATION', 'ADJUSTMENT')
    or p_source_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or p_points <= 0
    or (p_expires_at is not null and p_expires_at <= p_now)
  then
    raise exception 'Invalid shadow point grant arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.point_wallets (owner_user_id, shadow_only, created_at, updated_at)
  values (p_user_id, true, p_now, p_now)
  on conflict (owner_user_id) do nothing;

  select * into v_wallet
  from public.point_wallets
  where owner_user_id = p_user_id
  for update;

  select * into v_lot
  from public.point_lots
  where owner_user_id = p_user_id
    and source = p_source
    and source_reference = p_source_reference
  for update;

  if v_lot.id is not null then
    if v_lot.original_points <> p_points
      or v_lot.expires_at is distinct from p_expires_at
    then
      raise exception 'Shadow point grant idempotency conflict';
    end if;
    return to_jsonb(v_lot);
  end if;

  insert into public.point_lots (
    wallet_id,
    owner_user_id,
    source,
    source_reference,
    original_points,
    remaining_points,
    granted_at,
    expires_at,
    shadow_only,
    created_at
  ) values (
    v_wallet.id,
    p_user_id,
    p_source,
    p_source_reference,
    p_points,
    p_points,
    p_now,
    p_expires_at,
    true,
    p_now
  )
  returning * into v_lot;

  insert into public.point_ledger_entries (
    wallet_id,
    owner_user_id,
    event,
    points,
    delta,
    lot_id,
    source_reference,
    created_at,
    shadow_only
  ) values (
    v_wallet.id,
    p_user_id,
    'GRANT',
    p_points,
    p_points,
    v_lot.id,
    p_source_reference,
    p_now,
    true
  );

  return to_jsonb(v_lot);
end;
$$;

create or replace function public.create_shadow_point_quote(
  p_user_id uuid,
  p_service_code text,
  p_idempotency_key text,
  p_quantity integer default 1,
  p_points_override integer default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate public.service_rates%rowtype;
  v_quote public.point_quotes%rowtype;
  v_points integer;
begin
  if p_user_id is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
    or p_quantity <= 0
  then
    raise exception 'Invalid shadow point quote arguments';
  end if;

  select rate.* into v_rate
  from public.service_rates as rate
  join public.service_rate_versions as version
    on version.version = rate.catalog_version
  where rate.catalog_version = '2026-08-09.v1-shadow'
    and rate.service_code = p_service_code
    and rate.status = 'SHADOW'
    and version.status = 'SHADOW';

  if v_rate.service_code is null then
    raise exception 'Unknown shadow service rate';
  end if;

  if v_rate.points is not null then
    if p_points_override is not null and p_points_override <> v_rate.points then
      raise exception 'Fixed shadow rate override is not allowed';
    end if;
    v_points := v_rate.points * p_quantity;
  else
    if p_points_override is null
      or p_points_override < v_rate.minimum_points
      or p_points_override > v_rate.maximum_points
    then
      raise exception 'Invalid variable shadow rate quote';
    end if;
    v_points := p_points_override * p_quantity;
  end if;

  insert into public.point_quotes (
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
    p_user_id,
    p_service_code,
    v_rate.catalog_version,
    v_points,
    p_quantity,
    p_idempotency_key,
    p_now,
    p_now + interval '10 minutes',
    true
  )
  on conflict (owner_user_id, service_code, idempotency_key) do nothing;

  select * into v_quote
  from public.point_quotes
  where owner_user_id = p_user_id
    and service_code = p_service_code
    and idempotency_key = p_idempotency_key;

  if v_quote.points <> v_points or v_quote.quantity <> p_quantity then
    raise exception 'Shadow point quote idempotency conflict';
  end if;

  return to_jsonb(v_quote);
end;
$$;

create or replace function public.reserve_shadow_points(
  p_user_id uuid,
  p_quote_id uuid,
  p_idempotency_key text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.point_quotes%rowtype;
  v_wallet public.point_wallets%rowtype;
  v_reservation public.point_reservations%rowtype;
  v_lot public.point_lots%rowtype;
  v_available integer;
  v_outstanding integer;
  v_take integer;
begin
  if p_user_id is null
    or p_quote_id is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
  then
    raise exception 'Invalid shadow point reserve arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into v_quote
  from public.point_quotes
  where id = p_quote_id and owner_user_id = p_user_id
  for update;

  if v_quote.id is null then
    raise exception 'Shadow point quote not found';
  end if;
  if v_quote.expires_at <= p_now then
    raise exception 'POINT_QUOTE_EXPIRED';
  end if;
  if v_quote.points <= 0 then
    raise exception 'Zero-point services do not require a reservation';
  end if;

  select * into v_reservation
  from public.point_reservations
  where owner_user_id = p_user_id
    and service_code = v_quote.service_code
    and idempotency_key = p_idempotency_key
  for update;

  if v_reservation.id is not null then
    if v_reservation.quote_id <> p_quote_id then
      raise exception 'Shadow point reservation idempotency conflict';
    end if;
    return to_jsonb(v_reservation);
  end if;

  select * into v_wallet
  from public.point_wallets
  where owner_user_id = p_user_id and status = 'ACTIVE'
  for update;

  if v_wallet.id is null then
    raise exception 'POINTS_INSUFFICIENT';
  end if;

  select coalesce(sum(remaining_points), 0)::integer into v_available
  from public.point_lots
  where wallet_id = v_wallet.id
    and remaining_points > 0
    and (expires_at is null or expires_at > p_now);

  if v_available < v_quote.points then
    raise exception 'POINTS_INSUFFICIENT';
  end if;

  insert into public.point_reservations (
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
    v_wallet.id,
    p_user_id,
    v_quote.id,
    v_quote.service_code,
    v_quote.catalog_version,
    v_quote.points,
    p_idempotency_key,
    'RESERVED',
    p_now,
    least(v_quote.expires_at, p_now + interval '10 minutes'),
    true
  )
  returning * into v_reservation;

  v_outstanding := v_quote.points;
  for v_lot in
    select *
    from public.point_lots
    where wallet_id = v_wallet.id
      and remaining_points > 0
      and (expires_at is null or expires_at > p_now)
    order by
      (expires_at is null),
      expires_at,
      (source = 'TOP_UP'),
      granted_at,
      id
    for update
  loop
    exit when v_outstanding = 0;
    v_take := least(v_lot.remaining_points, v_outstanding);

    update public.point_lots
      set remaining_points = remaining_points - v_take
      where id = v_lot.id;

    insert into public.point_reservation_allocations (
      reservation_id,
      lot_id,
      wallet_id,
      owner_user_id,
      points,
      created_at
    ) values (
      v_reservation.id,
      v_lot.id,
      v_wallet.id,
      p_user_id,
      v_take,
      p_now
    );

    v_outstanding := v_outstanding - v_take;
  end loop;

  if v_outstanding <> 0 then
    raise exception 'Shadow point allocation invariant failed';
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
    p_user_id,
    'RESERVE',
    v_quote.points,
    -v_quote.points,
    v_reservation.id,
    v_quote.service_code,
    v_quote.catalog_version,
    p_idempotency_key,
    p_now,
    true
  );

  return to_jsonb(v_reservation);
end;
$$;

create or replace function public.commit_shadow_points(
  p_user_id uuid,
  p_reservation_id uuid,
  p_result_ref text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.point_reservations%rowtype;
begin
  if p_user_id is null
    or p_reservation_id is null
    or p_result_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  then
    raise exception 'Invalid shadow point commit arguments';
  end if;

  select * into v_reservation
  from public.point_reservations
  where id = p_reservation_id and owner_user_id = p_user_id
  for update;

  if v_reservation.id is null then
    raise exception 'Shadow point reservation not found';
  end if;
  if v_reservation.status = 'COMMITTED' then
    if v_reservation.result_ref <> p_result_ref then
      raise exception 'Shadow point commit idempotency conflict';
    end if;
    return to_jsonb(v_reservation);
  end if;
  if v_reservation.status <> 'RESERVED' or v_reservation.expires_at <= p_now then
    raise exception 'Invalid shadow point commit transition';
  end if;

  update public.point_reservations
    set status = 'COMMITTED', result_ref = p_result_ref, terminal_at = p_now
    where id = v_reservation.id
    returning * into v_reservation;

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
    result_ref,
    created_at,
    shadow_only
  ) values (
    v_reservation.wallet_id,
    p_user_id,
    'COMMIT',
    v_reservation.points,
    0,
    v_reservation.id,
    v_reservation.service_code,
    v_reservation.catalog_version,
    v_reservation.idempotency_key,
    p_result_ref,
    p_now,
    true
  );

  return to_jsonb(v_reservation);
end;
$$;

create or replace function public.release_shadow_points(
  p_user_id uuid,
  p_reservation_id uuid,
  p_reason_code text,
  p_event text default 'RELEASE',
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.point_reservations%rowtype;
  v_allocation public.point_reservation_allocations%rowtype;
  v_terminal_status text;
begin
  if p_user_id is null
    or p_reservation_id is null
    or p_reason_code !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or p_event not in ('RELEASE', 'EXPIRE')
  then
    raise exception 'Invalid shadow point release arguments';
  end if;

  v_terminal_status := case when p_event = 'EXPIRE' then 'EXPIRED' else 'RELEASED' end;

  select * into v_reservation
  from public.point_reservations
  where id = p_reservation_id and owner_user_id = p_user_id
  for update;

  if v_reservation.id is null then
    raise exception 'Shadow point reservation not found';
  end if;
  if v_reservation.status in ('RELEASED', 'EXPIRED') then
    if v_reservation.status <> v_terminal_status
      or v_reservation.reason_code <> p_reason_code
    then
      raise exception 'Shadow point release idempotency conflict';
    end if;
    return to_jsonb(v_reservation);
  end if;
  if v_reservation.status <> 'RESERVED' then
    raise exception 'Committed shadow points cannot be released';
  end if;

  for v_allocation in
    select *
    from public.point_reservation_allocations
    where reservation_id = v_reservation.id
    for update
  loop
    update public.point_lots
      set remaining_points = remaining_points + v_allocation.points
      where id = v_allocation.lot_id
        and owner_user_id = p_user_id
        and remaining_points + v_allocation.points <= original_points;

    if not found then
      raise exception 'Shadow point release invariant failed';
    end if;
  end loop;

  update public.point_reservations
    set status = v_terminal_status,
        reason_code = p_reason_code,
        terminal_at = p_now
    where id = v_reservation.id
    returning * into v_reservation;

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
    reason_code,
    created_at,
    shadow_only
  ) values (
    v_reservation.wallet_id,
    p_user_id,
    p_event,
    v_reservation.points,
    v_reservation.points,
    v_reservation.id,
    v_reservation.service_code,
    v_reservation.catalog_version,
    v_reservation.idempotency_key,
    p_reason_code,
    p_now,
    true
  );

  return to_jsonb(v_reservation);
end;
$$;

revoke all on function public.grant_shadow_point_lot(
  uuid, text, text, integer, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.create_shadow_point_quote(
  uuid, text, text, integer, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.reserve_shadow_points(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.commit_shadow_points(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.release_shadow_points(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.grant_shadow_point_lot(
  uuid, text, text, integer, timestamptz, timestamptz
) to service_role;
grant execute on function public.create_shadow_point_quote(
  uuid, text, text, integer, integer, timestamptz
) to service_role;
grant execute on function public.reserve_shadow_points(
  uuid, uuid, text, timestamptz
) to service_role;
grant execute on function public.commit_shadow_points(
  uuid, uuid, text, timestamptz
) to service_role;
grant execute on function public.release_shadow_points(
  uuid, uuid, text, text, timestamptz
) to service_role;

commit;
