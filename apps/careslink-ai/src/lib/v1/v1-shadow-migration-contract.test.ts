import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260809120000_create_v1_shadow_foundation.sql",
  ),
  "utf8",
);

describe("V1 shadow foundation migration contract", () => {
  it("is additive and does not rewrite or delete legacy product truth", () => {
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(
      /\b(?:alter\s+table|insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|generated_material_drafts)\b/i,
    );
    expect(migration).not.toContain("from public.generated_material_drafts");
    expect(migration).toContain(
      "This migration is additive and intentionally performs no legacy backfill",
    );
    expect(
      migration.match(
        /shadow_only boolean not null default true check \(shadow_only\)/g,
      ),
    ).toHaveLength(9);
  });

  it("creates the canonical document, revision and orthogonal state resources", () => {
    for (const table of [
      "ai_documents",
      "privacy_reviews",
      "ai_document_revisions",
      "document_checkpoints",
      "self_review_events",
      "generation_jobs",
      "export_jobs",
      "export_events",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }

    const documentTable = sectionBetween(
      "create table if not exists public.ai_documents",
      "create index if not exists ai_documents_owner_updated_idx",
    );
    expect(documentTable).toContain(
      "'IN_PROGRESS', 'COMPLETED', 'TOMBSTONED', 'PURGED'",
    );
    expect(documentTable).not.toMatch(/REVIEWED|EXPORTED|SYNCING/);
    expect(migration).toContain(
      "event text not null check (event in ('CONFIRMED', 'INVALIDATED'))",
    );
    expect(migration).toContain(
      "'LOCAL_SAVED',\n      'SYNCING',\n      'SERVER_ACKNOWLEDGED'",
    );
    expect(migration).toContain("create table if not exists public.export_events");
  });

  it("supports the five Note types and all three explicit locales", () => {
    expect(migration).toContain(
      "'communication',\n      'handover',\n      'progress',\n      'ndis',\n      'incident_factual'",
    );
    expect(migration).toContain(
      "source_locale in ('en', 'zh-Hans', 'zh-Hant')",
    );
    expect(migration).not.toContain("zh-Hant' then 'zh-Hans");
  });

  it("creates a versioned shadow rate catalog with the approved fixed rates", () => {
    expect(migration).toContain("create table if not exists public.service_rate_versions");
    expect(migration).toContain("create table if not exists public.service_rates");
    expect(migration).toContain(
      "('2026-08-09.v1-shadow', 'note.communication.generate', 'request', 20",
    );
    expect(migration).toContain(
      "('2026-08-09.v1-shadow', 'note.ndis.generate', 'request', 50",
    );
    expect(migration).toContain(
      "('2026-08-09.v1-shadow', 'note.incident_factual.generate', 'request', 60",
    );
    expect(migration).toContain(
      "('2026-08-09.v1-shadow', 'transcription.cloud', 'minute', 10",
    );
    expect(migration).not.toMatch(/\b300\b/);
  });

  it("models lots, allocations and an append-only point ledger", () => {
    for (const table of [
      "point_wallets",
      "point_lots",
      "point_quotes",
      "point_reservations",
      "point_reservation_allocations",
      "point_ledger_entries",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
    expect(migration).toContain(
      "event in ('GRANT', 'RESERVE', 'COMMIT', 'RELEASE', 'EXPIRE', 'REVOKE', 'ADJUSTMENT')",
    );
    expect(migration).not.toMatch(/update\s+public\.point_ledger_entries/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.point_ledger_entries/i);
    expect(migration).toContain("point_ledger_terminal_idx");
  });

  it("defines idempotent shadow grant, quote, reserve, commit and release RPCs", () => {
    for (const fn of [
      "grant_shadow_point_lot",
      "create_shadow_point_quote",
      "reserve_shadow_points",
      "commit_shadow_points",
      "release_shadow_points",
    ]) {
      expect(migration).toContain(`create or replace function public.${fn}`);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+?to service_role`, "i"),
      );
      expect(migration).not.toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+?to authenticated`, "i"),
      );
    }
    expect(migration).toContain(
      "unique (owner_user_id, service_code, idempotency_key)",
    );
    expect(migration).toContain("remaining_points = remaining_points + v_allocation.points");
    expect(migration).toContain("Committed shadow points cannot be released");
    expect(migration).toContain("Shadow point release idempotency conflict");
  });

  it("enables RLS and grants only owner SELECT to authenticated users", () => {
    const ownerTables = [
      "ai_documents",
      "privacy_reviews",
      "ai_document_revisions",
      "document_checkpoints",
      "self_review_events",
      "generation_jobs",
      "export_jobs",
      "export_events",
      "point_wallets",
      "point_lots",
      "point_quotes",
      "point_reservations",
      "point_reservation_allocations",
      "point_ledger_entries",
    ];

    for (const table of ownerTables) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toContain(`grant select on public.${table} to authenticated`);
      expect(migration).toContain(`create policy ${table}_owner_select`);
    }

    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]+to\s+authenticated/i,
    );
    expect(migration).toContain("using ((select auth.uid()) = owner_user_id)");
  });

  it("binds every cross-resource shadow reference to the same owner", () => {
    for (const binding of [
      "foreign key (current_revision_id, id, owner_user_id)",
      "foreign key (privacy_review_id, owner_user_id)",
      "foreign key (active_revision_id, document_id, owner_user_id)",
      "foreign key (generation_job_id, document_id, owner_user_id)",
      "foreign key (export_job_id, owner_user_id)",
      "foreign key (quote_id, owner_user_id)",
      "foreign key (reservation_id, owner_user_id)",
      "foreign key (target_document_id, source_owner_user_id)",
      "foreign key (target_revision_id, target_document_id, source_owner_user_id)",
    ]) {
      expect(migration).toContain(binding);
    }

    expect(migration).not.toMatch(
      /(?:current_revision_id|privacy_review_id|export_job_id|quote_id) uuid(?: not null)? references public\./,
    );
  });

  it("keeps legacy migration mapping metadata-only and reversible", () => {
    const itemTable = sectionBetween(
      "create table if not exists public.legacy_document_migration_items",
      "-- RLS is enabled",
    );
    expect(itemTable).toContain("source_content_hash");
    expect(itemTable).toContain("target_document_id");
    expect(itemTable).toContain("target_revision_id");
    expect(itemTable).toContain("'ROLLED_BACK'");
    expect(itemTable).not.toMatch(/content\s+jsonb|prompt|participant_facts|generated_content/i);
    expect(migration).not.toContain(
      "grant select on public.legacy_document_migration_items to authenticated",
    );
  });
});

function sectionBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}
