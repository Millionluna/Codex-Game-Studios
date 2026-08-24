import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260810131648_add_v1_mobile_sync_shadow.sql",
  ),
  "utf8",
);

const sqlAssertions = readFileSync(
  join(process.cwd(), "supabase/tests/v1_mobile_sync_shadow_assertions.sql"),
  "utf8",
);

const pointsMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260810135000_harden_shadow_points_grant_identity.sql",
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

const writeRpcNames = [
  "create_v1_shadow_document",
  "append_v1_shadow_document_revision",
  "save_v1_shadow_document_checkpoint",
  "tombstone_v1_shadow_document",
] as const;

const authenticatedReadRpcNames = [
  "list_v1_shadow_documents",
  "get_v1_shadow_document",
  "pull_v1_shadow_document_changes",
] as const;

const productRpcNames = [
  ...writeRpcNames,
  ...authenticatedReadRpcNames,
] as const;

describe("V1 Mobile/Web sync shadow migration contract", () => {
  it("is an unapplied, transactional shadow with activation disabled", () => {
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(migration).toContain("performs no activation");
    expect(migration).toContain("values ('mobile_sync_v1', false, true)");
    expect(migration).toContain(
      "where feature_key = 'mobile_sync_v1' and enabled and shadow_only",
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|generated_material_drafts)\b/i,
    );
  });

  it("adds a cursor change feed and replay receipts bound to one owner", () => {
    for (const table of [
      "v1_mobile_sync_shadow_flags",
      "ai_document_sync_changes",
      "ai_document_mutation_receipts",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).not.toContain(
        `create table if not exists public.${table}`,
      );
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }

    expect(migration).toContain(
      "change_kind in ('DOCUMENT_UPSERTED', 'DOCUMENT_TOMBSTONED')",
    );
    expect(migration).toContain("unique (owner_user_id, last_mutation_id)");
    expect(migration).toContain("unique (owner_user_id, mutation_id)");
    expect(migration).toContain(
      "foreign key (revision_id, document_id, owner_user_id)",
    );
    expect(migration).toContain(
      "foreign key (change_id, owner_user_id)",
    );
    expect(migration).not.toMatch(
      /insert into public\.v1_mobile_sync_shadow_flags[\s\S]+?on conflict[\s\S]+?do nothing/i,
    );
  });

  it("keeps direct tables closed and withholds write RPCs pending DB vectors", () => {
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete|truncate)[^;]+to\s+(?:anon|authenticated)/i,
    );
    expect(migration).toContain(
      "using ((select auth.uid()) = owner_user_id)",
    );

    for (const rpc of productRpcNames) {
      const section = functionSection(rpc);
      expect(section).toContain("security definer");
      expect(section).toContain("set search_path = ''");
      expect(section).toContain("v_owner uuid := auth.uid()");
      expect(section).toContain("if v_owner is null");
      expect(section).toContain("auth.jwt()->>'session_id'");
      expect(section).toContain("from auth.sessions");
      expect(section).toContain("message = 'SESSION_REVOKED'");

      const signature = migration.slice(
        migration.indexOf(`create or replace function public.${rpc}`),
        migration.indexOf(")\nreturns", migration.indexOf(`create or replace function public.${rpc}`)),
      );
      expect(signature).not.toMatch(/owner|user_id/i);
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public\\.${rpc}[\\s\\S]+?from public, anon, authenticated, service_role`,
          "i",
        ),
      );
      if ((authenticatedReadRpcNames as readonly string[]).includes(rpc)) {
        expect(migration).toMatch(
          new RegExp(
            `grant execute on function public\\.${rpc}[^;]+to authenticated`,
            "i",
          ),
        );
      } else {
        expect(migration).not.toMatch(
          new RegExp(
            `grant execute on function public\\.${rpc}[^;]+to authenticated`,
            "i",
          ),
        );
      }
    }
    expect(migration).not.toMatch(
      /grant select on public\.(?:ai_document_sync_changes|ai_document_mutation_receipts) to authenticated/i,
    );
    for (const table of [
      "ai_documents",
      "ai_document_revisions",
      "document_checkpoints",
      "self_review_events",
    ]) {
      expect(migration).toContain(
        `revoke select on public.${table} from authenticated`,
      );
    }
    expect(migration).toContain("canonical hash");
    expect(migration).toContain("complete frozen NoteContent");
    expect(migration).toContain("privacy-proof binding");
  });

  it("keeps session status resolution service-role-only and strictly typed", () => {
    const resolver = functionSection("resolve_v1_shadow_session_status");
    expect(resolver).toContain("p_user_id uuid");
    expect(resolver).toContain("p_session_id uuid");
    expect(resolver).toContain("returns text");
    expect(resolver).toContain(
      "coalesce(auth.jwt()->>'role', '') <> 'service_role'",
    );
    expect(resolver).toContain("message = 'FORBIDDEN'");
    expect(resolver).toContain("from auth.sessions");
    expect(resolver).toContain("return 'ACTIVE'");
    expect(resolver).toContain("return 'REVOKED'");
    expect(migration).toMatch(
      /revoke all on function public\.resolve_v1_shadow_session_status\(uuid, uuid\)[\s\S]+?from public, anon, authenticated, service_role/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.resolve_v1_shadow_session_status\(uuid, uuid\)[^;]+to service_role/i,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.resolve_v1_shadow_session_status\(uuid, uuid\)[^;]+to (?:anon|authenticated)/i,
    );
  });

  it("verifies content hashes from one explicit TypeScript/Postgres canonical JSON", () => {
    expect(migration).toContain(
      "create or replace function public.v1_shadow_canonical_json(p_value jsonb)",
    );
    expect(migration).toContain(
      "',' order by convert_to(entry.key, 'UTF8')",
    );
    expect(migration).toContain(
      "create or replace function public.v1_shadow_content_sha256(p_content jsonb)",
    );
    expect(migration).toContain("extensions.digest(");
    expect(migration).toContain(
      "trim_scale((p_value #>> '{}')::numeric)::text",
    );
    expect(migration.match(
      /p_content_hash is distinct from public\.v1_shadow_content_sha256\(p_content\)/g,
    )).toHaveLength(2);

    const fixture = {
      "é": true,
      z: 1e21,
      a: [1.23, 1e-7, -0, "line\nfeed"],
    };
    expect(stringifyCaresLinkV1CanonicalJson(fixture)).toBe(
      '{"a":[1.23,0.0000001,0,"line\\nfeed"],"z":1000000000000000000000,"é":true}',
    );
    expect(
      createHash("sha256")
        .update(stringifyCaresLinkV1CanonicalJson({ body: "first" }))
        .digest("hex"),
    ).toBe("e95f5694994356d47a08f5e9279896acab61bde95a46bcf289d9ca3517c3c20f");
    expect(sqlAssertions).not.toMatch(/repeat\('[a-f]',\s*64\)/i);
    expect(sqlAssertions).toContain("Cross-runtime canonical JSON vector failed");
    expect(sqlAssertions).toContain("Canonical content SHA-256 vector failed");
  });

  it("creates the document and first revision before issuing the real ACK", () => {
    const create = functionSection("create_v1_shadow_document");
    const documentIndex = create.indexOf("insert into public.ai_documents");
    const revisionIndex = create.indexOf("insert into public.ai_document_revisions");
    const currentRevisionIndex = create.indexOf("update public.ai_documents");
    const changeIndex = create.indexOf("insert into public.ai_document_sync_changes");
    const ackIndex = create.indexOf(
      "'saveState', 'SERVER_ACKNOWLEDGED'",
    );
    const receiptIndex = create.indexOf(
      "insert into public.ai_document_mutation_receipts",
    );

    expect(documentIndex).toBeGreaterThanOrEqual(0);
    expect(revisionIndex).toBeGreaterThan(documentIndex);
    expect(currentRevisionIndex).toBeGreaterThan(revisionIndex);
    expect(changeIndex).toBeGreaterThan(currentRevisionIndex);
    expect(ackIndex).toBeGreaterThan(changeIndex);
    expect(receiptIndex).toBeGreaterThan(ackIndex);
    expect(create).toContain("revision_number, base_revision_id");
    expect(create).toContain("v_document.id, v_owner, 1, null");
    expect(migration.match(/message = 'PRIVACY_REVIEW_REQUIRED'/g)).toHaveLength(
      2,
    );
    expect(functionSection("create_v1_shadow_document")).toContain(
      "if p_privacy_review_id is null",
    );
    expect(functionSection("append_v1_shadow_document_revision")).toContain(
      "if p_privacy_review_id is null",
    );
  });

  it("checks append privacy proof before document existence", () => {
    const append = functionSection("append_v1_shadow_document_revision");
    const privacyPreconditionIndex = append.indexOf(
      "if p_privacy_review_id is null",
    );
    const documentLookupIndex = append.indexOf("select * into v_document");

    expect(privacyPreconditionIndex).toBeGreaterThanOrEqual(0);
    expect(documentLookupIndex).toBeGreaterThan(privacyPreconditionIndex);
  });

  it("returns transport-shaped DTOs only after durable mutation state exists", () => {
    for (const rpc of writeRpcNames) {
      const section = functionSection(rpc);
      const changeIndex = section.indexOf(
        "insert into public.ai_document_sync_changes",
      );
      const ackIndex = section.indexOf("v_ack := jsonb_build_object(");
      const receiptIndex = section.indexOf(
        "insert into public.ai_document_mutation_receipts",
      );
      expect(changeIndex).toBeGreaterThanOrEqual(0);
      expect(ackIndex).toBeGreaterThan(changeIndex);
      expect(receiptIndex).toBeGreaterThan(ackIndex);
      expect(section).toContain("'saveState', 'SERVER_ACKNOWLEDGED'");
      expect(section).toContain("'lastMutationId', p_mutation_id");
      expect(section).toContain("'serverTime', v_server_time");
    }

    for (const rpc of [
      "create_v1_shadow_document",
      "append_v1_shadow_document_revision",
    ]) {
      const section = functionSection(rpc);
      expect(section).toContain("'document', jsonb_build_object(");
      expect(section).toContain("'revision', jsonb_build_object(");
      expect(section).toContain("'currentRevisionId', v_document.current_revision_id");
      expect(section).toContain("'contentHash', v_revision.content_hash");
    }

    const checkpoint = functionSection("save_v1_shadow_document_checkpoint");
    expect(checkpoint).toContain("'checkpoint', jsonb_build_object(");
    expect(checkpoint).toContain("'syncStatus', v_checkpoint.sync_status");
    expect(checkpoint).toContain(
      "'completedFieldCodes', to_jsonb(v_checkpoint.completed_field_codes)",
    );

    const tombstone = functionSection("tombstone_v1_shadow_document");
    expect(tombstone).toContain("'document', jsonb_build_object(");
    expect(tombstone).toContain("'deletedAt', v_document.tombstoned_at");
  });

  it("serves complete owner-scoped list/get DTOs over UUID cursor payloads", () => {
    const list = functionSection("list_v1_shadow_documents");
    expect(list).toContain("p_after_document_id uuid default null");
    expect(list).toContain("document.owner_user_id = v_owner");
    expect(list).toContain("document.id > p_after_document_id");
    expect(list).toContain("order by document.id");
    expect(list).toContain("limit p_limit + 1");
    expect(list).toContain("'documents', v_documents");
    expect(list).toContain("v_next::text");
    expect(list).toContain("'hasMore', v_has_more");
    expect(migration).toContain(
      "wraps it as document.v1:<uuid> and rejects unwrapped client input",
    );

    const get = functionSection("get_v1_shadow_document");
    expect(get).toContain("owner_user_id = v_owner");
    expect(get).toContain("'document', jsonb_build_object(");
    expect(get).toContain("'revisions', v_revisions");
    expect(get).toContain("'checkpoint', v_checkpoint");
    expect(get).toContain("'selfReviewStatus', v_self_review_status");
    expect(get).toContain("order by revision.revision_number");
    expect(get).toContain("order by review.created_at desc, review.id desc");

    for (const rpc of ["list_v1_shadow_documents", "get_v1_shadow_document"]) {
      const section = functionSection(rpc);
      expect(section).toContain("auth.jwt()->>'session_id'");
      expect(section).toContain("from auth.sessions");
      expect(section).toContain("message = 'SESSION_REVOKED'");
      expect(section).toContain("message = 'PRODUCT_API_DISABLED'");
    }
  });

  it("keeps every Product RPC inside the frozen V1 version boundary", () => {
    const list = functionSection("list_v1_shadow_documents");
    const get = functionSection("get_v1_shadow_document");

    for (const section of [list, get]) {
      expect(section).toContain("contract_version = '1.0.0-shadow.1'");
      expect(section).toContain("schema_version = '2026-08-09.v1-shadow'");
    }

    const visibleDocumentIndex = get.indexOf("select * into v_document");
    const revisionReadIndex = get.indexOf("from public.ai_document_revisions");
    const checkpointReadIndex = get.indexOf("from public.document_checkpoints");
    expect(visibleDocumentIndex).toBeGreaterThanOrEqual(0);
    expect(revisionReadIndex).toBeGreaterThan(visibleDocumentIndex);
    expect(checkpointReadIndex).toBeGreaterThan(visibleDocumentIndex);

    for (const rpc of [
      "append_v1_shadow_document_revision",
      "save_v1_shadow_document_checkpoint",
      "tombstone_v1_shadow_document",
    ]) {
      const section = functionSection(rpc);
      const documentReadIndex = section.indexOf("select * into v_document");
      const notFoundIndex = section.indexOf("message = 'NOT_FOUND'", documentReadIndex);
      expect(documentReadIndex).toBeGreaterThanOrEqual(0);
      expect(section.indexOf(
        "contract_version = '1.0.0-shadow.1'",
        documentReadIndex,
      )).toBeGreaterThan(documentReadIndex);
      expect(section.indexOf(
        "schema_version = '2026-08-09.v1-shadow'",
        documentReadIndex,
      )).toBeGreaterThan(documentReadIndex);
      expect(notFoundIndex).toBeGreaterThan(documentReadIndex);
    }

    const pull = functionSection("pull_v1_shadow_document_changes");
    expect(pull.match(
      /document\.contract_version = '1\.0\.0-shadow\.1'/g,
    )).toHaveLength(3);
    expect(pull.match(
      /document\.schema_version = '2026-08-09\.v1-shadow'/g,
    )).toHaveLength(3);
    expect(migration).not.toContain(
      "from public.generated_material_drafts as source",
    );
  });

  it("rejects document and change cursors outside the active owner boundary", () => {
    const list = functionSection("list_v1_shadow_documents");
    expect(list).toContain("p_after_document_id is not null and not exists");
    expect(list).toContain("cursor_document.id = p_after_document_id");
    expect(list).toContain("cursor_document.owner_user_id = v_owner");
    expect(list).toContain(
      "cursor_document.contract_version = '1.0.0-shadow.1'",
    );
    expect(list).toContain(
      "cursor_document.schema_version = '2026-08-09.v1-shadow'",
    );
    expect(list).toContain("message = 'VALIDATION_ERROR'");

    const pull = functionSection("pull_v1_shadow_document_changes");
    expect(pull).toContain("p_after_change_id > 0 and not exists");
    expect(pull).toContain("cursor_change.change_id = p_after_change_id");
    expect(pull).toContain("cursor_change.owner_user_id = v_owner");
    expect(pull).toContain(
      "cursor_document.contract_version = '1.0.0-shadow.1'",
    );
    expect(pull).toContain(
      "cursor_document.schema_version = '2026-08-09.v1-shadow'",
    );
    expect(pull).toContain("message = 'VALIDATION_ERROR'");
  });

  it("makes replay and stale base outcomes explicit", () => {
    for (const rpc of [
      "create_v1_shadow_document",
      "append_v1_shadow_document_revision",
      "save_v1_shadow_document_checkpoint",
      "tombstone_v1_shadow_document",
    ]) {
      const section = functionSection(rpc);
      expect(section).toContain("pg_advisory_xact_lock");
      expect(section).toContain("ai_document_mutation_receipts");
      expect(section).toContain("IDEMPOTENCY_CONFLICT");
      expect(section).toContain("return v_receipt.acknowledgement");
    }

    for (const rpc of [
      "append_v1_shadow_document_revision",
      "save_v1_shadow_document_checkpoint",
      "tombstone_v1_shadow_document",
    ]) {
      const section = functionSection(rpc);
      expect(section).toContain(
        "current_revision_id is distinct from p_base_revision_id",
      );
      expect(section).toContain("message = 'STALE_REVISION'");
      expect(section).toContain("detail = jsonb_build_object(");
      expect(section).toContain("'canonicalId', p_document_id");
      expect(section).toContain(
        "'currentRevisionId', v_document.current_revision_id",
      );
      expect(section).toContain(
        "'currentRevisionNumber', v_document.current_revision_number",
      );
    }
    expect(migration.match(/detail = jsonb_build_object\(/g)).toHaveLength(3);
    expect(migration).toContain("p_content_hash !~ '^[a-f0-9]{64}$'");
    expect(migration).toContain(
      "p_contract_version is distinct from '1.0.0-shadow.1'",
    );
    expect(migration).toContain(
      "add column if not exists base_revision_id uuid",
    );
    expect(functionSection("tombstone_v1_shadow_document")).toContain(
      "message = 'INVALID_STATE_TRANSITION'",
    );
  });

  it("aligns checkpoint normalization and change feed revision semantics", () => {
    const checkpoint = functionSection("save_v1_shadow_document_checkpoint");
    expect(checkpoint).toContain(
      "p_current_step !~ '^[a-z][a-z0-9_.-]{0,63}$'",
    );
    expect(checkpoint).toContain("cardinality(p_completed_field_codes) > 256");
    expect(checkpoint).toContain(
      "distinct field_code collate \"C\"\n      order by field_code collate \"C\"",
    );
    expect(checkpoint).toContain(
      "'completedFieldCodes', to_jsonb(p_completed_field_codes)",
    );
    expect(checkpoint).toContain(
      "'completedFieldCodes', to_jsonb(v_checkpoint.completed_field_codes)",
    );
    expect(checkpoint).toContain(
      "'DOCUMENT_UPSERTED', p_document_id, v_document.current_revision_id",
    );
    expect(functionSection("tombstone_v1_shadow_document")).toContain(
      "p_reason_code !~ '^[a-z][a-z0-9_.-]{0,63}$'",
    );
  });

  it("returns owner-scoped cursor pages including tombstones", () => {
    const pull = functionSection("pull_v1_shadow_document_changes");
    expect(pull).toContain("sync_change.owner_user_id = v_owner");
    expect(pull).toContain("sync_change.change_id > p_after_change_id");
    expect(pull).toContain("limit p_limit");
    expect(pull).toContain("'changes', v_changes");
    expect(pull).toContain("'nextCursor', v_next::text");
    expect(pull).toContain("'hasMore', v_has_more");
    expect(pull).toContain("'deletedAt', deleted_at");
    expect(pull).toContain("'kind', change_kind");
    expect(pull).toContain("'lastMutationId', last_mutation_id");
    expect(pull).toContain("'serverTime', server_time");
    expect(pull).toContain("'canonicalId', document_id");
    expect(pull).toContain("'privacyReviewId', privacy_review_id");
    expect(pull).toContain("'mutationId', mutation_id");
    expect(migration).toContain("HTTP adapter must\n-- encode/decode it as an opaque cursor");
  });

  it("isolates Points GRANT hardening in a later unapplied migration", () => {
    expect(migration).not.toContain("point_ledger_grant_source_reference_idx");
    expect(migration).not.toContain("grant_shadow_point_lot");
    expect(pointsMigration).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(pointsMigration).toContain("This is not a cutover");
    expect(pointsMigration).toContain("POINTS_GRANT_IDENTITY_PREFLIGHT_REQUIRED");
    expect(pointsMigration).toContain("add column if not exists source text");
    expect(pointsMigration).toContain(
      "point_ledger_grant_source_reference_idx",
    );
    expect(pointsMigration).toContain(
      "owner_user_id, event, source, source_reference",
    );
    expect(pointsMigration).toContain(
      "source, source_reference, created_at, shadow_only",
    );
    expect(pointsMigration).toContain(
      "coalesce(auth.jwt()->>'role', '') <> 'service_role'",
    );
    expect(pointsMigration).not.toContain("auth.role()");
    expect(pointsMigration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger)\b/i,
    );
  });

  it("ships rollback-only SQL assertions for grants, owners and cursor flow", () => {
    expect(sqlAssertions).toMatch(/^--[\s\S]*\nbegin;/i);
    expect(sqlAssertions).toMatch(/rollback;\s*$/i);
    expect(sqlAssertions).toContain("Cross-owner append unexpectedly succeeded");
    expect(sqlAssertions).toContain("IDEMPOTENCY_CONFLICT");
    expect(sqlAssertions).toContain("STALE_REVISION");
    expect(sqlAssertions).toContain("Stale append conflict detail contract failed");
    expect(sqlAssertions).toContain("Stale checkpoint conflict detail contract failed");
    expect(sqlAssertions).toContain("Stale tombstone conflict detail contract failed");
    expect(sqlAssertions).toContain("Cursor tombstone propagation failed");
    expect(sqlAssertions).toContain("Direct authenticated write unexpectedly succeeded");
    expect(sqlAssertions).toContain("Direct authenticated SELECT unexpectedly succeeded");
    expect(sqlAssertions).toContain("Authenticated write RPC unexpectedly executable");
    expect(sqlAssertions).toContain("Content hash mismatch unexpectedly succeeded");
    expect(sqlAssertions).toContain(
      "Create without privacy review unexpectedly succeeded",
    );
    expect(sqlAssertions).toContain(
      "Append without privacy review unexpectedly succeeded",
    );
    expect(sqlAssertions.match(/PRIVACY_REVIEW_REQUIRED/g)).toHaveLength(3);
    expect(sqlAssertions).toContain("Second tombstone mutation unexpectedly succeeded");
    expect(sqlAssertions).toContain("Checkpoint change feed regressed to activeRevisionId");
    expect(sqlAssertions).toContain("PRODUCT_API_DISABLED");
    expect(sqlAssertions).toContain("Revoked session unexpectedly served data");
    expect(sqlAssertions).toContain("Document list UUID cursor contract failed");
    expect(sqlAssertions).toContain("Get document full DTO contract failed");
    expect(sqlAssertions).toContain("Cross-owner get unexpectedly succeeded");
    expect(sqlAssertions).toContain("Owner B list leaked another owner document");
    expect(sqlAssertions).toContain("Non-service JWT unexpectedly resolved session status");
    expect(sqlAssertions).toContain("Active session did not resolve ACTIVE");
    expect(sqlAssertions).toContain("Deleted session did not resolve REVOKED");
    expect(sqlAssertions).toContain("Authenticated unexpectedly executed session resolver");
    expect(sqlAssertions).toContain(
      "Fail-closed legacy document leaked into document list",
    );
    expect(sqlAssertions).toContain(
      "Fail-closed legacy document unexpectedly served by get",
    );
    expect(sqlAssertions).toContain(
      "Legacy document change leaked into frozen Product V1 sync",
    );
    expect(sqlAssertions).toContain(
      "Legacy append unexpectedly entered frozen Product V1",
    );
    expect(sqlAssertions).toContain(
      "Legacy checkpoint unexpectedly entered frozen Product V1",
    );
    expect(sqlAssertions).toContain(
      "Legacy tombstone unexpectedly entered frozen Product V1",
    );
    expect(sqlAssertions).toContain(
      "Owner B unexpectedly accepted owner A document cursor",
    );
    expect(sqlAssertions).toContain(
      "Owner B unexpectedly accepted owner A change cursor",
    );
    expect(sqlAssertions).toContain(
      "Checkpoint reordered payload replay unexpectedly succeeded",
    );
    expect(sqlAssertions).toContain(
      "Checkpoint duplicate-difference replay unexpectedly succeeded",
    );
    expect(sqlAssertions).toContain("v1-mobile-deleted-source");
    expect(sqlAssertions).toContain("v1-mobile-replacement-generation");
  });

  it("applies the final exact-catalog and eligible-provider boundary to every public RPC", () => {
    expect(noteFactsAndSessionMigration).toContain(
      "The Supabase migration runner owns the transaction",
    );
    expect(noteFactsAndSessionMigration).not.toMatch(/^\s*begin;/i);
    expect(noteFactsAndSessionMigration).not.toMatch(/\bcommit;\s*$/i);
    expect(noteFactsAndSessionMigration).toContain(
      "message = 'CARESLINK_V1_INTERNAL_SCHEMA_PREFLIGHT_REQUIRED'",
    );
    expect(noteFactsAndSessionMigration).toContain(
      "message = 'CARESLINK_V1_INTERNAL_FINAL_STATE_INVALID'",
    );
    expect(noteFactsAndSessionMigration).toContain(
      "(select count(*) from pg_proc where pronamespace = v_schema) <> 11",
    );
    expect(noteFactsAndSessionMigration).toContain("aclexplode(");
    expect(noteFactsAndSessionMigration).toContain(
      "from pg_auth_members as membership",
    );
    expect(noteFactsAndSessionMigration).toContain(
      "from pg_depend as dependency",
    );
    expect(noteFactsAndSessionMigration).toContain(
      "coalesce(to_jsonb(implementation)->>'prokind', 'f') = 'f'",
    );
    expect(sqlAssertions).toContain(
      "Private Product V1 implementation schema contract is invalid",
    );
    const sessionHelper = functionSectionIn(
      noteFactsAndSessionMigration,
      "v1_shadow_session_is_active",
    );
    expect(sessionHelper).toContain("active_session.user_id = p_owner_user_id");
    expect(sessionHelper).toContain("active_session.not_after is null");
    expect(sessionHelper).toContain("active_session.not_after > p_at");
    expect(sessionHelper).toContain("join auth.users as active_user");
    expect(sessionHelper).toContain(
      "active_user.raw_app_meta_data->>'role' = 'provider'",
    );
    expect(sessionHelper).toContain(
      "active_user.is_anonymous is false",
    );
    expect(sessionHelper).toContain(
      "jsonb_typeof(active_user.raw_app_meta_data) = 'object'",
    );
    expect(sessionHelper).toContain("active_user.deleted_at is null");
    expect(sessionHelper).toContain("active_user.banned_until <= p_at");
    expect(sessionHelper).toContain("active_user.email_confirmed_at <= p_at");
    expect(sessionHelper).not.toContain("raw_user_meta_data");
    expect(sessionHelper).not.toContain("user_metadata");
    expect(sessionHelper).toContain("security invoker");
    expect(sessionHelper).toContain("set search_path = ''");

    for (const rpc of [
      "resolve_v1_shadow_session_status",
      ...productRpcNames,
      "confirm_v1_shadow_privacy_review",
    ]) {
      const wrapper = lastFunctionSectionIn(noteFactsAndSessionMigration, rpc);
      expect(wrapper).toContain("security definer");
      expect(wrapper).toContain("set search_path = ''");
      expect(wrapper).toContain("public.v1_shadow_session_is_active(");
    }

    for (const rpc of writeRpcNames) {
      expect(noteFactsAndSessionMigration).not.toMatch(
        new RegExp(
          `grant execute on function public\\.${rpc}[^;]+to (?:anon|authenticated|service_role)`,
          "i",
        ),
      );
    }
    expect(noteFactsAndSessionMigration).toMatch(
      /grant execute on function public\.list_v1_shadow_documents\(uuid, integer\)\s+to authenticated/i,
    );
    expect(noteFactsAndSessionMigration).toMatch(
      /grant execute on function public\.resolve_v1_shadow_session_status\(uuid, uuid\)\s+to service_role/i,
    );
    expect(sqlAssertions).toContain(
      "A Product V1 RPC has an unsafe public overload",
    );
    expect(sqlAssertions).toContain(
      "A private pre-hardening RPC body has API-role EXECUTE",
    );
    expect(sqlAssertions).toContain(
      "Authenticated unexpectedly executed Note facts validator",
    );
    expect(sqlAssertions).toContain(
      "Authenticated unexpectedly executed finding path validator",
    );
    expect(sqlAssertions).toContain(
      "Authenticated unexpectedly executed active-session helper",
    );
    expect(sqlAssertions).toContain(
      "Expired existing session did not resolve REVOKED",
    );
    for (const evidence of [
      "User metadata role unexpectedly authorized a provider session",
      "Missing trusted provider role unexpectedly resolved ACTIVE",
      "Admin role unexpectedly resolved ACTIVE",
      "Anonymous provider unexpectedly resolved ACTIVE",
      "Banned provider unexpectedly resolved ACTIVE",
      "Deleted provider unexpectedly resolved ACTIVE",
      "Unconfirmed provider unexpectedly resolved ACTIVE",
      "Future-confirmed provider unexpectedly resolved ACTIVE",
      "Wrong Auth audience unexpectedly resolved ACTIVE",
      "Wrong Auth database role unexpectedly resolved ACTIVE",
      "Ban expiring at the decision time remained active",
      "Eligible provider did not recover ACTIVE after role-state restoration",
    ]) {
      expect(sqlAssertions).toContain(evidence);
    }
    for (const evidence of [
      "Expired session unexpectedly listed documents",
      "Expired session unexpectedly read a document",
      "Expired session unexpectedly created a document",
      "Expired session unexpectedly appended a revision",
      "Expired session unexpectedly saved a checkpoint",
      "Expired session unexpectedly tombstoned a document",
      "Expired session unexpectedly pulled changes",
      "Expired-session rejection caused a side effect",
    ]) {
      expect(sqlAssertions).toContain(evidence);
    }
  });

  it("adds owner-scoped Note type to every upsert and tombstone change", () => {
    const pull = lastFunctionSectionIn(
      noteFactsAndSessionMigration,
      "pull_v1_shadow_document_changes",
    );
    const delegate = pull.indexOf(
      "pull_v1_shadow_document_changes_before_active_session",
    );
    const projection = pull.indexOf(
      "jsonb_build_object('noteType', document.note_type)",
    );
    expect(delegate).toBeGreaterThanOrEqual(0);
    expect(projection).toBeGreaterThan(delegate);
    expect(pull).toContain("document.owner_user_id = v_owner");
    expect(pull).toContain("document.contract_version = '1.0.0-shadow.1'");
    expect(pull).toContain("document.schema_version = '2026-08-09.v1-shadow'");
    expect(pull).toContain("order by change.ordinality");
    expect(pull).toContain("jsonb_set(v_result, '{changes}', v_changes, true)");
    expect(sqlAssertions).toContain(
      "Cursor first page omitted the owner-scoped Note type",
    );
    expect(sqlAssertions).toContain(
      "Cursor tombstone propagation failed or omitted Note type",
    );
    expect(sqlAssertions).toContain(
      "Cursor later page omitted the owner-scoped Note type",
    );
  });
});

function functionSection(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

function functionSectionIn(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

function lastFunctionSectionIn(source: string, name: string) {
  const start = source.lastIndexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}
