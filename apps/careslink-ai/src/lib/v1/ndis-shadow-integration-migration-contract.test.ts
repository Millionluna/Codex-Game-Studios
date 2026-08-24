import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260809150000_create_ndis_shadow_preview_integration.sql",
  ),
  "utf8",
);

const correctiveMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260810072017_harden_ndis_shadow_projection_and_tombstone.sql",
  ),
  "utf8",
);

const identityRepairMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260810072952_fail_close_legacy_ndis_shadow_identity.sql",
  ),
  "utf8",
);

const terminalStateRepairMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260810073519_preserve_purged_ndis_shadow_terminal_state.sql",
  ),
  "utf8",
);

const deleteCleanupAuditMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260810073929_reconcile_pending_ndis_delete_cleanup.sql",
  ),
  "utf8",
);

const generationTombstoneMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260810080048_harden_ndis_shadow_tombstone_generations.sql",
  ),
  "utf8",
);

const noteFactsAndSessionMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260811134719_harden_v1_note_facts_schema_and_active_sessions.sql",
  ),
  "utf8",
);

const sqlAssertions = readFileSync(
  join(
    process.cwd(),
    "supabase/tests/v1_ndis_shadow_integration_assertions.sql",
  ),
  "utf8",
);

describe("NDIS canonical shadow integration migration", () => {
  it("applies atomically and locks the current source before reading it", () => {
    expect(migration).toMatch(/\bbegin;[\s\S]*\bcommit;\s*$/i);

    const projection = sectionBetween(
      "create or replace function public.project_ndis_legacy_shadow",
      "create or replace function public.compare_ndis_legacy_shadow",
    );
    const lockIndex = projection.indexOf("perform pg_advisory_xact_lock");
    const sourceSelectIndex = projection.indexOf("select * into v_source");
    const sourceValidationIndex = projection.indexOf("if v_source.status");
    const sourceSelect = projection.slice(
      sourceSelectIndex,
      projection.indexOf("if not found", sourceSelectIndex),
    );

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(sourceSelectIndex);
    expect(sourceSelectIndex).toBeLessThan(sourceValidationIndex);
    expect(sourceSelect).toContain("for update");
  });

  it("is additive and leaves legacy credits and Points disconnected", () => {
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|point_wallets|point_lots|point_quotes|point_reservations|point_ledger_entries)\b/i,
    );
    expect(migration).not.toMatch(/\b300\b/);
    expect(migration).not.toMatch(/backfill\s+public\.generated_material_drafts/i);
  });

  it("stores only metadata in outbox and comparison tables", () => {
    const outbox = sectionBetween(
      "create table if not exists public.ndis_shadow_write_outbox",
      "create index if not exists ndis_shadow_outbox_status_updated_idx",
    );
    const comparisons = sectionBetween(
      "create table if not exists public.ndis_shadow_read_comparisons",
      "create index if not exists ndis_shadow_comparison_owner_created_idx",
    );

    for (const section of [outbox, comparisons]) {
      expect(section).not.toMatch(/content\s+jsonb|prompt|transcript|participant_facts/i);
      expect(section).toContain("correlation_id");
      expect(section).toContain("shadow_only");
    }
  });

  it("binds links, outbox and comparisons to the same legacy owner", () => {
    expect(migration).toContain(
      "add constraint generated_material_drafts_id_user_id_key",
    );
    expect(
      migration.match(
        /foreign key \(source_draft_id, owner_user_id\)[\s\S]*?references public\.generated_material_drafts\(id, user_id\)/g,
      ),
    ).toHaveLength(3);
    expect(migration).toContain(
      "foreign key (current_revision_id, document_id, owner_user_id)",
    );
    expect(migration).toContain("legacy_source_draft_id text");
    expect(migration).toContain("legacy_source_owner_user_id uuid");
    expect(migration).toContain("tombstone_correlation_id uuid");
    expect(migration).toContain("ai_documents_legacy_source_pair_check");
    expect(migration).toContain(
      "ai_documents_legacy_source_generation_key",
    );
    expect(migration).not.toContain("ai_documents_legacy_source_key");
    expect(migration).toMatch(
      /unique \(\s*legacy_source_owner_user_id,\s*legacy_source_draft_id,\s*created_at\s*\)/,
    );
    expect(migration).toContain("p_source_draft_id,\n        p_owner_user_id,\n        'ndis'");
  });

  it("makes all writes service-role RPC-only", () => {
    for (const table of [
      "ndis_shadow_document_links",
      "ndis_shadow_write_outbox",
      "ndis_shadow_read_comparisons",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(
        `revoke all on public.${table} from public, anon, authenticated, service_role`,
      );
      expect(migration).toContain(`grant select on public.${table} to service_role`);
    }

    for (const fn of [
      "project_ndis_legacy_shadow",
      "compare_ndis_legacy_shadow",
      "tombstone_deleted_ndis_shadow",
      "audit_ndis_shadow_reconciliation",
    ]) {
      expect(migration).toContain(`create or replace function public.${fn}`);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+?to service_role`, "i"),
      );
      expect(migration).not.toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+?to authenticated`, "i"),
      );
    }
  });

  it("serializes one source and makes replay, stale and failure explicit", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'status', 'REPLAYED'");
    expect(migration).toContain("'status', 'UNCHANGED'");
    expect(migration).toContain("failure_code = 'STALE_REVISION'");
    expect(migration).toContain("failure_code = 'STALE_SOURCE_VERSION'");
    expect(migration).toContain("failure_code = 'SHADOW_WRITE_FAILED'");
    expect(migration).toContain("'failureCode', 'HISTORICAL_REPLAY'");
    expect(migration).toContain(
      "v_outbox.revision_id = v_link.current_revision_id",
    );
    expect(migration).toContain("v_link.source_status = p_source_status");
    expect(migration).toContain(
      "v_link.source_updated_at = p_source_updated_at",
    );
    expect(migration).toContain(
      "unique (owner_user_id, idempotency_key)",
    );
  });

  it("replays comparison evidence by correlation and rejects conflicting reuse", () => {
    const comparison = sectionBetween(
      "create or replace function public.compare_ndis_legacy_shadow",
      "create or replace function public.tombstone_deleted_ndis_shadow",
    );

    expect(comparison).toContain("v_existing public.ndis_shadow_read_comparisons%rowtype");
    expect(comparison).toContain("for update");
    expect(comparison).toContain("return jsonb_build_object(\n      'status', v_existing.result");
    expect(comparison).toContain("NDIS shadow comparison correlation conflict");
    expect(comparison).not.toContain(
      "on conflict (owner_user_id, correlation_id) do nothing",
    );
  });

  it("hides deleted legacy shadows from owner reads and retains a service audit tombstone", () => {
    expect(migration).toContain(
      "drop policy if exists ai_documents_owner_select on public.ai_documents",
    );
    expect(migration).toContain(
      "source.created_at = ai_documents.created_at",
    );
    expect(migration).toContain(
      "schema_version <> 'legacy.generated_material_drafts.ndis_case_note.v1'",
    );
    expect(migration).toContain(
      "lifecycle_status not in ('TOMBSTONED', 'PURGED')",
    );
    expect(migration).toContain(
      "from public.ai_documents as document",
    );
    expect(migration).toContain(
      "create or replace function public.tombstone_deleted_ndis_shadow",
    );
    expect(migration).toContain(
      "lifecycle_status = 'TOMBSTONED'",
    );
    expect(migration).toContain(
      "message = 'NDIS shadow source still exists'",
    );
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.(?:ai_documents|ai_document_revisions|document_checkpoints)/i,
    );
  });

  it("keeps legacy review status separate from canonical lifecycle and self-review", () => {
    const projection = sectionBetween(
      "create or replace function public.project_ndis_legacy_shadow",
      "create or replace function public.compare_ndis_legacy_shadow",
    );

    expect(projection).toContain("'IN_PROGRESS'");
    expect(projection).not.toMatch(/self_review_events|facts_confirmed|COMPLETED'/);
    expect(projection).toContain("source_status");
  });

  it("adds only the reviewed integration hot-path indexes", () => {
    expect(migration).toContain("ndis_shadow_links_owner_updated_idx");
    expect(migration).toContain("ndis_shadow_outbox_status_updated_idx");
    expect(migration).toContain("ndis_shadow_outbox_owner_source_idx");
    expect(migration).toContain("ndis_shadow_comparison_owner_created_idx");
    expect(migration.match(/create index if not exists/g)).toHaveLength(4);
  });

  it("ships an additive forward fix for branches that recorded the earlier migration", () => {
    expect(correctiveMigration).toMatch(/\bbegin;[\s\S]*\bcommit;\s*$/i);
    expect(correctiveMigration).toContain(
      "add column if not exists legacy_source_draft_id text",
    );
    expect(correctiveMigration).toContain(
      "add column if not exists legacy_source_owner_user_id uuid",
    );
    expect(correctiveMigration).toContain("when duplicate_object then null");
    expect(correctiveMigration).toContain(
      "create or replace function public.project_ndis_legacy_shadow",
    );
    expect(correctiveMigration).toContain(
      "create or replace function public.compare_ndis_legacy_shadow",
    );
    expect(correctiveMigration).toContain(
      "grant execute on function public.project_ndis_legacy_shadow",
    );
    expect(correctiveMigration).toContain(
      "grant execute on function public.compare_ndis_legacy_shadow",
    );
    expect(correctiveMigration).toContain(
      "create or replace function public.tombstone_deleted_ndis_shadow",
    );
    expect(correctiveMigration).toContain(
      "grant execute on function public.tombstone_deleted_ndis_shadow",
    );
    expect(correctiveMigration).toContain(
      "drop policy if exists ai_documents_owner_select on public.ai_documents",
    );
    expect(correctiveMigration).toContain(
      "source.created_at = ai_documents.created_at",
    );
    expect(correctiveMigration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|point_)/i,
    );

    const projection = sectionBetweenIn(
      correctiveMigration,
      "create or replace function public.project_ndis_legacy_shadow",
      "create or replace function public.compare_ndis_legacy_shadow",
    );
    const lockIndex = projection.indexOf("perform pg_advisory_xact_lock");
    const sourceSelectIndex = projection.indexOf("select * into v_source");
    const sourceSelect = projection.slice(
      sourceSelectIndex,
      projection.indexOf("if not found", sourceSelectIndex),
    );

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(sourceSelectIndex);
    expect(sourceSelect).toContain("for update");
    expect(projection).toContain(
      "v_outbox.revision_id = v_link.current_revision_id",
    );
    expect(projection).toContain("'failureCode', 'HISTORICAL_REPLAY'");
    expect(projection).toContain("failure_code = 'STALE_SOURCE_VERSION'");

    const comparison = sectionBetweenIn(
      correctiveMigration,
      "create or replace function public.compare_ndis_legacy_shadow",
      "create or replace function public.tombstone_deleted_ndis_shadow",
    );
    expect(comparison).toContain("v_existing public.ndis_shadow_read_comparisons%rowtype");
    expect(comparison).toContain("NDIS shadow comparison correlation conflict");
    expect(comparison).not.toContain(
      "on conflict (owner_user_id, correlation_id) do nothing",
    );
  });

  it("backfills pre-identity projections and fails closed for unidentifiable legacy rows", () => {
    expect(identityRepairMigration).toMatch(/\bbegin;[\s\S]*\bcommit;\s*$/i);
    expect(identityRepairMigration).toContain(
      "update public.ai_documents as document\nset legacy_source_draft_id = link.source_draft_id",
    );
    expect(identityRepairMigration).toContain(
      "from public.ndis_shadow_document_links as link",
    );
    expect(identityRepairMigration).toContain(
      "set lifecycle_status = 'TOMBSTONED'",
    );
    expect(identityRepairMigration).toContain(
      "and not exists (\n    select 1\n    from public.generated_material_drafts as source",
    );
    expect(identityRepairMigration).toContain(
      "drop constraint if exists ai_documents_legacy_source_pair_check",
    );
    expect(identityRepairMigration).toContain(
      "schema_version <> 'legacy.generated_material_drafts.ndis_case_note.v1'",
    );
    expect(identityRepairMigration).toContain(
      "lifecycle_status not in ('TOMBSTONED', 'PURGED')",
    );
    expect(identityRepairMigration).toContain(
      "source.created_at = ai_documents.created_at",
    );
    expect(identityRepairMigration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|point_)/i,
    );
  });

  it("repairs historical PURGED rows without reopening them", () => {
    expect(terminalStateRepairMigration).toMatch(
      /\bbegin;[\s\S]*\bcommit;\s*$/i,
    );
    expect(terminalStateRepairMigration).toContain(
      "set lifecycle_status = 'PURGED'",
    );
    expect(terminalStateRepairMigration).toContain(
      "document.purged_at is not null",
    );
    expect(terminalStateRepairMigration).toContain(
      "document.lifecycle_status <> 'PURGED'",
    );
    expect(terminalStateRepairMigration).not.toContain(
      "set lifecycle_status = 'TOMBSTONED'",
    );
    expect(terminalStateRepairMigration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|point_)/i,
    );
  });

  it("reconciles failed delete cleanup after ephemeral metadata cascades", () => {
    const audit = sectionBetween(
      "create or replace function public.audit_ndis_shadow_reconciliation",
      "revoke all on function public.project_ndis_legacy_shadow",
    );

    for (const source of [audit, deleteCleanupAuditMigration]) {
      expect(source).toContain("SOURCE_DELETE_CLEANUP_PENDING");
      expect(source).toContain(
        "document.lifecycle_status not in ('TOMBSTONED', 'PURGED')",
      );
      expect(source).toContain(
        "document.legacy_source_owner_user_id = document.owner_user_id",
      );
      expect(source).toContain(
        "and not exists (\n        select 1\n        from public.generated_material_drafts source",
      );
    }

    expect(deleteCleanupAuditMigration).toMatch(
      /\bbegin;[\s\S]*\bcommit;\s*$/i,
    );
    expect(deleteCleanupAuditMigration).toContain(
      "grant execute on function public.audit_ndis_shadow_reconciliation",
    );
    expect(deleteCleanupAuditMigration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|point_)/i,
    );
  });

  it("ships a forward-only generation tombstone contract for recorded branches", () => {
    expect(generationTombstoneMigration).toMatch(
      /\bbegin;[\s\S]*\bcommit;\s*$/i,
    );
    expect(generationTombstoneMigration).toContain(
      "add column if not exists tombstone_correlation_id uuid",
    );
    expect(generationTombstoneMigration).toContain(
      "drop constraint if exists ai_documents_legacy_source_key",
    );
    expect(generationTombstoneMigration).toContain(
      "add constraint ai_documents_legacy_source_generation_key",
    );
    expect(generationTombstoneMigration).toMatch(
      /unique \(\s*legacy_source_owner_user_id,\s*legacy_source_draft_id,\s*created_at\s*\)/,
    );
    expect(generationTombstoneMigration).toContain(
      "to_regprocedure(\n    'public.tombstone_deleted_ndis_shadow(uuid,text,uuid)'",
    );

    const revokeOldIndex = generationTombstoneMigration.indexOf(
      "execute 'revoke all on function public.tombstone_deleted_ndis_shadow(uuid, text, uuid)",
    );
    const dropOldIndex = generationTombstoneMigration.indexOf(
      "drop function if exists public.tombstone_deleted_ndis_shadow(\n  uuid, text, uuid",
    );
    const createNewIndex = generationTombstoneMigration.indexOf(
      "create or replace function public.tombstone_deleted_ndis_shadow",
    );

    expect(revokeOldIndex).toBeGreaterThanOrEqual(0);
    expect(revokeOldIndex).toBeLessThan(dropOldIndex);
    expect(dropOldIndex).toBeLessThan(createNewIndex);

    const tombstone = sectionBetweenIn(
      generationTombstoneMigration,
      "create or replace function public.tombstone_deleted_ndis_shadow",
      "revoke all on function public.tombstone_deleted_ndis_shadow",
    );
    const documentSelectIndex = tombstone.indexOf("select * into v_document");
    const replayIndex = tombstone.indexOf(
      "if v_document.lifecycle_status = 'TOMBSTONED'",
    );
    const firstWriteIndex = tombstone.indexOf("v_now := now()");
    const sourceGuardIndex = tombstone.indexOf("if exists (", replayIndex);
    const sourceGuard = tombstone.slice(
      sourceGuardIndex,
      tombstone.indexOf(") then", sourceGuardIndex),
    );

    expect(tombstone).toContain("p_source_created_at timestamptz");
    expect(tombstone).toContain("p_correlation_id uuid");
    expect(tombstone).toContain("and created_at = p_source_created_at");
    expect(tombstone).toContain("for update");
    expect(documentSelectIndex).toBeGreaterThanOrEqual(0);
    expect(replayIndex).toBeGreaterThan(documentSelectIndex);
    expect(replayIndex).toBeLessThan(firstWriteIndex);
    expect(sourceGuardIndex).toBeGreaterThan(replayIndex);
    expect(sourceGuard).toContain("id = p_source_draft_id");
    expect(sourceGuard).toContain("user_id = p_owner_user_id");
    expect(sourceGuard).toContain("created_at = p_source_created_at");
    expect(tombstone).toContain(
      "tombstone_correlation_id = p_correlation_id",
    );
    expect(tombstone).toContain(
      "and lifecycle_status not in ('TOMBSTONED', 'PURGED')",
    );
    expect(tombstone).toContain("'tombstonedCount', 0");

    expect(generationTombstoneMigration).toContain(
      "revoke all on function public.tombstone_deleted_ndis_shadow(\n  uuid, text, timestamptz, uuid\n) from public, anon, authenticated",
    );
    expect(generationTombstoneMigration).toContain(
      "grant execute on function public.tombstone_deleted_ndis_shadow(\n  uuid, text, timestamptz, uuid\n) to service_role",
    );
    expect(generationTombstoneMigration).not.toMatch(
      /grant execute on function public\.tombstone_deleted_ndis_shadow\(\s*uuid,\s*text,\s*uuid\s*\)/i,
    );

    const freshTombstone = sectionBetween(
      "create or replace function public.tombstone_deleted_ndis_shadow",
      "create or replace function public.audit_ndis_shadow_reconciliation",
    );
    expect(tombstone.trim()).toBe(freshTombstone.trim());
    expect(generationTombstoneMigration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|point_)/i,
    );
  });

  it("tolerates the PostgreSQL 17 duplicate-table signal for the recorded generation key", () => {
    expect(migration).toContain(
      "add constraint ai_documents_legacy_source_generation_key",
    );
    expect(generationTombstoneMigration).toContain(
      "add constraint ai_documents_legacy_source_generation_key",
    );
    expect(generationTombstoneMigration).toContain(
      "when duplicate_object or duplicate_table then null",
    );
    expect(generationTombstoneMigration).toContain(
      "constraint_record.conkey = v_expected_columns",
    );
    expect(generationTombstoneMigration).toContain(
      "to_jsonb(backing_index)->>'indnullsnotdistinct'",
    );
    expect(generationTombstoneMigration).toContain("backing_index.indisunique");
    expect(generationTombstoneMigration).toContain("backing_index.indisvalid");
    expect(generationTombstoneMigration).toContain("backing_index.indisready");
    expect(generationTombstoneMigration).toContain("backing_index.indimmediate");
    expect(generationTombstoneMigration).toContain(
      "to_jsonb(constraint_record)->>'conenforced'",
    );
    expect(generationTombstoneMigration).toContain(
      "backing_index.indexprs is null",
    );
    expect(generationTombstoneMigration).toContain(
      "backing_index.indpred is null",
    );
    expect(generationTombstoneMigration).toContain(
      "message = 'LEGACY_SOURCE_GENERATION_CONSTRAINT_INVALID'",
    );
    for (const exactAssertion of [
      "constraint_record.conkey = v_expected_columns",
      "backing_index.indisunique",
      "backing_index.indisvalid",
      "backing_index.indisready",
      "backing_index.indimmediate",
      "to_jsonb(constraint_record)->>'conenforced'",
      "to_jsonb(backing_index)->>'indnullsnotdistinct'",
      "backing_index.indexprs is null",
      "backing_index.indpred is null",
    ]) {
      expect(sqlAssertions).toContain(exactAssertion);
    }
  });

  it("keeps the legacy NDIS projection outside the frozen Product V1 Note validator", () => {
    const revisionTrigger = sectionBetweenIn(
      noteFactsAndSessionMigration,
      "create or replace function public.enforce_v1_shadow_revision_privacy_review",
      "$$;",
    );
    const legacyBypass = revisionTrigger.indexOf(
      "v_document.schema_version <> '2026-08-09.v1-shadow'",
    );
    const bypassReturn = revisionTrigger.indexOf("return new;", legacyBypass);
    const noteValidator = revisionTrigger.indexOf(
      "perform public.assert_v1_shadow_note_facts(",
    );
    expect(legacyBypass).toBeGreaterThanOrEqual(0);
    expect(bypassReturn).toBeGreaterThan(legacyBypass);
    expect(noteValidator).toBeGreaterThan(bypassReturn);
    expect(sqlAssertions).toContain(
      "Legacy NDIS revision bypass moved behind Note validator",
    );
    expect(sqlAssertions).toContain("through 20260811134719 are applied");
  });

  it("expects Mobile ACL hardening to deny direct authenticated document reads", () => {
    expect(sqlAssertions).toMatch(/^--[\s\S]*\nbegin;/i);
    expect(sqlAssertions).toMatch(/rollback;\s*$/i);
    expect(sqlAssertions).toContain(
      "Pending delete cleanup direct authenticated read unexpectedly succeeded",
    );
    expect(sqlAssertions).toContain(
      "ai_documents direct authenticated read unexpectedly succeeded",
    );
    expect(sqlAssertions).toContain(
      "ai_document_revisions direct authenticated read unexpectedly succeeded",
    );
    expect(sqlAssertions).toContain(
      "document_checkpoints direct authenticated read unexpectedly succeeded",
    );
    expect(sqlAssertions.match(/when sqlstate '42501' then null;/g)).toHaveLength(
      4,
    );
    expect(sqlAssertions).not.toContain(
      "legacy source generation RLS isolation failed",
    );
  });
});

function sectionBetween(start: string, end: string) {
  return sectionBetweenIn(migration, start, end);
}

function sectionBetweenIn(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}
