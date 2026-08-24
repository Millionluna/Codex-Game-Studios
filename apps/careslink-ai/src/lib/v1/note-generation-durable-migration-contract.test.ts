import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260820135834_add_v1_note_generation_durable_shadow.sql";
const assertionsPath =
  "supabase/assertions/v1_note_generation_durable_foundation_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(join(process.cwd(), assertionsPath), "utf8");
const assertionHeader = assertions
  .slice(0, assertions.indexOf("\\set ON_ERROR_STOP on"))
  .replace(/^-- ?/gm, "")
  .replace(/\s+/g, " ")
  .trim();
const assertionBodyStart = assertions.indexOf("begin;\n");
const assertionBody = assertions.slice(assertionBodyStart);

const schemaName = "careslink_v1_generation";
const tableNames = ["settings", "jobs", "attempts"] as const;

describe("V1 Note durable generation foundation migration contract", () => {
  it("is a CLI-named additive schema-only foundation that cannot activate itself", () => {
    expect(migrationPath).toMatch(
      /^supabase\/migrations\/\d{14}_add_v1_note_generation_durable_shadow\.sql$/,
    );
    expect(migration).toContain(
      "intentionally additive, source-only and default-off",
    );
    expect(migration).toContain(
      "creates no callable function, policy, view, trigger or runtime privilege",
    );
    expect(migration).toContain(
      "later, separately reviewed migration must add the payload-vault metadata",
    );
    expect(migration).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/im);
    expect(migration).not.toMatch(/\bif\s+not\s+exists\b|\bon\s+conflict\b/i);
    expect(migration).not.toMatch(/\bfor\s+update\s+skip\s+locked\b/i);
    expect(migration).not.toMatch(/\bsecurity\s+definer\b/i);
  });

  it("creates exactly two inert roles, one private schema and three tables", () => {
    expect([...migration.matchAll(/\bcreate role\s+([a-z0-9_]+)/g)].map((match) => match[1])).toEqual([
      "careslink_v1_generation_owner",
      "careslink_v1_generation_executor",
    ]);
    expect([...migration.matchAll(/\bcreate schema\s+([a-z0-9_]+)/g)].map((match) => match[1])).toEqual([
      schemaName,
    ]);
    expect(
      [...migration.matchAll(/\bcreate table\s+([a-z0-9_.]+)/g)].map(
        (match) => match[1],
      ),
    ).toEqual(tableNames.map((table) => `${schemaName}.${table}`));

    for (const role of [
      "careslink_v1_generation_owner",
      "careslink_v1_generation_executor",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `create role ${role}\\s+with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;`,
        ),
      );
    }
  });

  it("allows only a temporary non-inheriting SET edge and leaves no object grant", () => {
    expect(migration.match(/^\s*grant\b/gim)).toHaveLength(1);
    expect(normalizeSql(migration)).toContain(
      "grant careslink_v1_generation_owner to current_user with admin false, inherit false, set true granted by current_user;",
    );
    expect(normalizeSql(migration)).toMatch(
      /revoke careslink_v1_generation_owner from current_user granted by current_user;$/,
    );
    expect(migration).toContain("bootstrap-superuser grant on each new role");
    expect(migration).toContain("must be asserted as such rather than misreported as zero memberships");
    expect(migration).not.toMatch(
      /\bgrant\s+(?:all|usage|create|select|insert|update|delete|truncate|references|trigger|execute)\b/i,
    );
    expect(migration).not.toMatch(/\bgrant\s+.+\bto\s+(?:public|anon|authenticated|service_role|careslink_v1_generation_executor)\b/i);
    expect(normalizeSql(migration)).toContain(
      "revoke all on type careslink_v1_generation.settings, careslink_v1_generation.jobs, careslink_v1_generation.attempts from public, anon, authenticated, service_role, careslink_v1_generation_executor;",
    );
  });

  it("keeps the only settings row hard-off and has no operational policy columns", () => {
    const settings = tableBlock(`${schemaName}.settings`);
    expect(columnNames(settings)).toEqual([
      "capability",
      "enabled",
      "shadow_only",
      "created_at",
      "updated_at",
    ]);
    expect(settings).toContain("enabled boolean not null default false");
    expect(settings).toContain("shadow_only boolean not null default true");
    expect(settings).toContain("capability = 'note_generation_v1'");
    expect(settings).toContain("constraint settings_enabled_check check (enabled = false)");
    expect(settings).toContain("constraint settings_shadow_only_check check (shadow_only = true)");
    expect(migration).toMatch(
      /insert into careslink_v1_generation\.settings[\s\S]+?'note_generation_v1',\s*false,\s*true\s*\);/,
    );
    expect(settings).not.toMatch(
      /lease|heartbeat|deadline|attempt_limit|retry|backoff|jitter|provider|model|vault|backend|retention|ttl|purge|kms|region|residency|backup/i,
    );
    expect(migration).not.toMatch(/\benabled\s*=\s*true\b/i);
  });

  it("enables and forces RLS while creating no policy, function, view or trigger", () => {
    for (const table of tableNames) {
      expect(migration).toContain(
        `alter table ${schemaName}.${table} enable row level security;`,
      );
      expect(migration).toContain(
        `alter table ${schemaName}.${table} force row level security;`,
      );
      expect(migration).toContain(
        `alter table ${schemaName}.${table}\n  owner to careslink_v1_generation_owner;`,
      );
    }
    expect(migration).toContain(
      `alter schema ${schemaName}\n  owner to careslink_v1_generation_owner;`,
    );
    expect(migration).not.toMatch(
      /\bcreate\s+(?:or\s+replace\s+)?(?:policy|function|procedure|view|materialized\s+view|trigger)\b/i,
    );
  });

  it("revokes direct/default access through the hosted-safe owner SET window", () => {
    const deniedRoles =
      "public, anon, authenticated, service_role,\\s+careslink_v1_generation_executor";
    const normalizedMigration = normalizeSql(migration);
    const ownerSet = `set role careslink_v1_generation_owner;`;
    const ownerReset = `reset role;`;
    const ownerSetStart = normalizedMigration.indexOf(ownerSet);
    const ownerSetEnd = normalizedMigration.indexOf(ownerReset, ownerSetStart);
    const firstTable = normalizedMigration.indexOf(
      `create table ${schemaName}.settings`,
    );
    const schemaTransfer = normalizedMigration.indexOf(
      `alter schema ${schemaName} owner to careslink_v1_generation_owner;`,
    );
    const lastOwnershipTransfer = normalizedMigration.indexOf(
      `alter table ${schemaName}.attempts owner to careslink_v1_generation_owner;`,
    );
    const finalMembershipRevoke = normalizedMigration.indexOf(
      `revoke careslink_v1_generation_owner from current_user granted by current_user;`,
    );

    expect(
      migration.match(/^set role careslink_v1_generation_owner;$/gm),
    ).toHaveLength(1);
    expect(migration.match(/^reset role;$/gm)).toHaveLength(1);
    expect(migration).not.toMatch(
      /alter default privileges\s+for role\s+careslink_v1_generation_owner/i,
    );
    expect(ownerSetStart).toBeGreaterThan(
      normalizedMigration.indexOf(
        `grant careslink_v1_generation_owner to current_user`,
      ),
    );
    expect(ownerSetEnd).toBeGreaterThan(ownerSetStart);
    expect(firstTable).toBeGreaterThan(ownerSetEnd);
    expect(schemaTransfer).toBeGreaterThan(firstTable);
    expect(lastOwnershipTransfer).toBeGreaterThan(schemaTransfer);
    expect(finalMembershipRevoke).toBeGreaterThan(lastOwnershipTransfer);
    expect(migration.match(/^alter default privileges\b/gm)).toHaveLength(8);
    expect(
      normalizedMigration.slice(schemaTransfer, finalMembershipRevoke),
    ).not.toMatch(/\b(?:alter default privileges|revoke all on)\b/);

    expect(
      migration.match(
        new RegExp(
          `revoke all on schema ${schemaName}\\s+from ${deniedRoles};`,
          "g",
        ),
      ),
    ).toHaveLength(1);
    expect(
      normalizedMigration.indexOf(`revoke all on schema ${schemaName}`),
    ).toBeLessThan(schemaTransfer);

    const ownerDefaults = normalizedMigration
      .slice(ownerSetStart, ownerSetEnd)
      .trim();
    expect(ownerDefaults).toBe(
      normalizeSql(`
        set role careslink_v1_generation_owner;
        alter default privileges revoke all on tables
          from public, anon, authenticated, service_role,
            careslink_v1_generation_executor;
        alter default privileges revoke all on sequences
          from public, anon, authenticated, service_role,
            careslink_v1_generation_executor;
        alter default privileges revoke all on functions
          from public, anon, authenticated, service_role,
            careslink_v1_generation_executor;
        alter default privileges revoke all on types
          from public, anon, authenticated, service_role,
            careslink_v1_generation_executor;
      `),
    );
    for (const objectKind of ["tables", "sequences", "functions", "types"]) {
      expect(migration).toMatch(
        new RegExp(
          `alter default privileges in schema ${schemaName}\\s+revoke all on ${objectKind}\\s+from ${deniedRoles};`,
        ),
      );
    }
    for (const objectKind of ["tables", "sequences", "functions"]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke all on all ${objectKind} in schema ${schemaName}\\s+from ${deniedRoles};`,
        ),
      );
    }
  });

  it("keeps jobs and attempts metadata-only with no sensitive storage columns", () => {
    const jobs = tableBlock(`${schemaName}.jobs`);
    const attempts = tableBlock(`${schemaName}.attempts`);

    expect(columnNames(jobs)).toEqual([
      "id",
      "owner_user_id",
      "initiating_session_id",
      "admission_transport",
      "payload_id",
      "note_type",
      "source_locale",
      "service_code",
      "rate_catalog_version",
      "contract_version",
      "schema_version",
      "privacy_review_id",
      "privacy_scanner_policy_version",
      "privacy_review_revision",
      "cleaned_facts_hash",
      "idempotency_hash",
      "request_hash",
      "worker_policy_version",
      "worker_policy_digest",
      "provider_policy_version",
      "provider_policy_digest",
      "payload_policy_version",
      "payload_policy_snapshot_hash",
      "status",
      "attempt_count",
      "next_eligible_at",
      "failure_reason",
      "result_document_id",
      "result_revision_id",
      "result_content_hash",
      "created_at",
      "updated_at",
      "started_at",
      "finished_at",
      "shadow_only",
    ]);
    expect(columnNames(attempts)).toEqual([
      "id",
      "job_id",
      "owner_user_id",
      "attempt_number",
      "status",
      "worker_identity_hash",
      "registration_digest",
      "lease_token_hash",
      "acquired_at",
      "last_heartbeat_at",
      "lease_expires_at",
      "payload_authorized_at",
      "fence_id",
      "fence_digest",
      "fenced_at",
      "fence_expires_at",
      "provider_evidence_hash",
      "canonical_content_hash",
      "failure_reason",
      "finished_at",
      "created_at",
      "shadow_only",
    ]);

    for (const block of [jobs, attempts]) {
      expect(block).not.toMatch(/\b(?:json|jsonb|bytea)\b/i);
      expect(block).not.toMatch(
        /^\s*(?:cleaned_facts|facts|provider_output|provider_candidate|content|transcript|payload_locator|payload_handle|vault_locator|authorization|access_token|refresh_token|idempotency_key|request_body|response_body|url|error_message)\s+/im,
      );
    }
    expect(jobs).toContain("cleaned_facts_hash text not null");
    expect(jobs).toContain("idempotency_hash text not null");
    expect(attempts).toContain("lease_token_hash text not null");
  });

  it("freezes every named constraint, owner FK and bounded state/hash check", () => {
    expect(constraintNames(tableBlock(`${schemaName}.settings`))).toEqual([
      "settings_capability_check",
      "settings_enabled_check",
      "settings_shadow_only_check",
      "settings_time_check",
    ]);
    expect(constraintNames(tableBlock(`${schemaName}.jobs`))).toEqual([
      "jobs_owner_identity_unique",
      "jobs_payload_unique",
      "jobs_owner_idempotency_unique",
      "jobs_privacy_owner_fk",
      "jobs_result_document_owner_fk",
      "jobs_result_revision_owner_fk",
      "jobs_admission_transport_check",
      "jobs_note_type_check",
      "jobs_source_locale_check",
      "jobs_service_binding_check",
      "jobs_contract_version_check",
      "jobs_schema_version_check",
      "jobs_rate_catalog_version_check",
      "jobs_privacy_policy_version_check",
      "jobs_privacy_review_revision_check",
      "jobs_hashes_check",
      "jobs_version_identifiers_check",
      "jobs_status_check",
      "jobs_attempt_count_check",
      "jobs_failure_reason_check",
      "jobs_terminal_shape_check",
      "jobs_time_check",
      "jobs_shadow_only_check",
    ]);
    expect(constraintNames(tableBlock(`${schemaName}.attempts`))).toEqual([
      "attempts_identity_binding_unique",
      "attempts_job_number_unique",
      "attempts_job_owner_fk",
      "attempts_number_check",
      "attempts_status_check",
      "attempts_hashes_check",
      "attempts_failure_reason_check",
      "attempts_fence_shape_check",
      "attempts_terminal_shape_check",
      "attempts_reason_status_check",
      "attempts_time_check",
      "attempts_shadow_only_check",
    ]);

    const jobs = tableBlock(`${schemaName}.jobs`);
    expect(jobs).toContain(
      "references public.privacy_reviews(id, owner_user_id) on delete restrict",
    );
    expect(jobs).toContain(
      "references public.ai_documents(id, owner_user_id) on delete restrict",
    );
    expect(jobs).toMatch(
      /references public\.ai_document_revisions\(\s*id,\s*document_id,\s*owner_user_id\s*\) on delete restrict/,
    );
    expect(jobs).toContain("status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')");
    expect(jobs.match(/~ '\^\[a-f0-9\]\{64\}\$'/g)).toHaveLength(7);

    const attempts = tableBlock(`${schemaName}.attempts`);
    expect(attempts).toContain(
      "references careslink_v1_generation.jobs(id, owner_user_id)",
    );
    expect(attempts).toContain(
      "status in ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'LEASE_EXPIRED')",
    );
    expect(attempts.match(/~ '\^\[a-f0-9\]\{64\}\$'/g)).toHaveLength(6);
  });

  it("creates only the exact required support indexes", () => {
    expect(
      [...migration.matchAll(/\bcreate (?:unique )?index\s+([a-z0-9_]+)/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      "jobs_claim_order_idx",
      "jobs_owner_created_idx",
      "jobs_initiating_session_idx",
      "jobs_privacy_owner_idx",
      "jobs_result_document_owner_idx",
      "jobs_result_revision_owner_idx",
      "attempts_one_running_per_job_idx",
      "attempts_job_owner_idx",
      "attempts_owner_created_idx",
      "attempts_running_lease_expiry_idx",
    ]);
    for (const definition of [
      "create index jobs_claim_order_idx on careslink_v1_generation.jobs(next_eligible_at, created_at, id) where status = 'QUEUED';",
      "create index jobs_owner_created_idx on careslink_v1_generation.jobs(owner_user_id, created_at desc, id);",
      "create index jobs_initiating_session_idx on careslink_v1_generation.jobs(initiating_session_id);",
      "create index jobs_privacy_owner_idx on careslink_v1_generation.jobs(privacy_review_id, owner_user_id);",
      "create index jobs_result_document_owner_idx on careslink_v1_generation.jobs(result_document_id, owner_user_id) where result_document_id is not null;",
      "create index jobs_result_revision_owner_idx on careslink_v1_generation.jobs(result_revision_id, result_document_id, owner_user_id) where result_revision_id is not null;",
      "create unique index attempts_one_running_per_job_idx on careslink_v1_generation.attempts(job_id) where status = 'RUNNING';",
      "create index attempts_job_owner_idx on careslink_v1_generation.attempts(job_id, owner_user_id);",
      "create index attempts_owner_created_idx on careslink_v1_generation.attempts(owner_user_id, created_at desc, id);",
      "create index attempts_running_lease_expiry_idx on careslink_v1_generation.attempts(lease_expires_at, job_id, id) where status = 'RUNNING';",
    ]) {
      expect(normalizeSql(migration)).toContain(normalizeSql(definition));
    }
    expect(migration).toMatch(
      /create index jobs_claim_order_idx[\s\S]+?where status = 'QUEUED';/,
    );
    expect(migration).toMatch(
      /create unique index attempts_one_running_per_job_idx[\s\S]+?where status = 'RUNNING';/,
    );
    expect(migration).toMatch(
      /create index attempts_running_lease_expiry_idx[\s\S]+?where status = 'RUNNING';/,
    );
  });

  it("ships rollback-only catalog and negative assertions without overstating runtime semantics", () => {
    expect(assertions).toMatch(/^-- Manual rollback-only assertions/);
    expect(assertions).toContain(
      "A 2026-08-21 PostgreSQL 17 r2 run",
    );
    expect(assertions).toContain(
      "information_schema exposed generated NOT NULL constraint names",
    );
    expect(assertions).toContain(
      "The prior exact-schema pg_constraint revision passed as one rollback-only",
    );
    expect(assertions).toContain("deleted PostgreSQL 17 r3 and r4 Previews");
    expect(assertionHeader).toContain(
      "PostgreSQL 17.6 r9 disposable Preview",
    );
    expect(assertionHeader).toContain(
      "14/14 migrations, 7/7 assertions and the independent postcheck all passed",
    );
    expect(assertionHeader).toContain("historical additive-aware revision");
    for (const marker of [
      "c7b70e9f84b9b804779039711b85cc7eda55bd57",
      "a1571c30-a322-4cea-b332-b189804df195",
      "hyczevivoakmflswmwlb",
      "v1-note-worker-rpc-r9",
      "both branch ID and ref absent",
      "Production adocsnwnslxhxcjgbyee was never a SQL target",
      "ae07158b899243cec9dc591b9d7c3f3beb6b85cdc213f9b732d6ed159932cfb8",
      "3bd571e8447cbedd838251339e273877a25decaa582a538f0d7049319504bab0",
      "36467 bytes",
      "minimum transaction-only registration row",
      "attempt-registration retention migration",
      "exact execution source HEAD",
      "4cae6f1a08ce2bcc7e43456c275cf5e743f13fdf",
      "PostgreSQL 17.6 r22",
      "15/15 migration and 7/7 rollback-suite gate",
      "validated retention FK/index",
      "v1-note-worker-rpc-r22",
      "0bc8db56-0e4a-42ec-9595-1f32a3d74a6b",
      "wuzcjcfrkctelcnbbgtg",
      "deletion was confirmed with id/ref absent",
      "2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6",
      "37547 bytes",
    ]) {
      expect(assertionHeader).toContain(marker);
    }
    expect(assertionBodyStart).toBeGreaterThanOrEqual(0);
    expect(Buffer.byteLength(assertionBody, "utf8")).toBe(37_547);
    expect(
      createHash("sha256").update(assertionBody, "utf8").digest("hex"),
    ).toBe("2a2af2e8c7c745b769a731a4892b27f65fcf311321e813c3cc190e54167772a6");
    expect(assertionHeader).toContain(
      "serial rollback proof does not itself prove true two-connection SKIP LOCKED",
    );
    expect(assertionHeader).toContain("session/privacy-revocation races");
    expect(assertionHeader).toContain(
      "Deleted r20 separately closed that PostgreSQL 17.6 subset",
    );
    for (const marker of [
      "On 2026-08-24, from a worktree based on HEAD",
      "93c5c2aa956d20e5f1f704e24e5dd17a478fc2ea",
      "plus this batch's uncommitted concurrency-harness changes",
      "a clean local PostgreSQL 16.15 cluster",
      "server_version_num = 160015",
      "closed the PostgreSQL 16 engine, serial and true-two-session race gates",
      "all 27/27 repository migrations (V1 15/15)",
      "all 7/7 rollback suites",
      "independent postcheck",
      "all 3/3 real two-connection concurrency scenarios passed",
      "loopback-only endpoint used no password and no TLS",
      "Fixed SQL cleanup deleted the local runner, helper",
      "The outer gate then stopped the server and permanently",
      "deleted the exact temporary cluster directory",
      "Production was never touched",
    ]) {
      expect(assertionHeader).toContain(marker);
    }
    expect(assertionHeader).not.toContain("PostgreSQL 16 remains unproved");
    expect(assertions).not.toContain("information_schema.table_constraints");
    expect(
      assertions.match(/^  from pg_constraint as constraint_metadata$/gm),
    ).toHaveLength(3);
    expect(
      assertions.match(/^    and relation\.relkind = 'r'$/gm),
    ).toHaveLength(3);
    expect(assertions).toContain("\\set ON_ERROR_STOP on");
    expect(assertions).toContain(
      "durable generation foundation requires PostgreSQL 16 or newer",
    );
    expect(assertions).toContain("begin;");
    expect(assertions.trimEnd()).toMatch(/rollback;$/);
    for (const marker of [
      "durable generation schema scope drifted",
      "durable generation role attributes are unsafe",
      "unsafe durable generation role membership",
      "durable generation settings are not hard-off and unconfigured",
      "durable generation RLS posture is unsafe",
      "durable generation API or executor privilege leaked",
      "durable generation sensitive column leaked",
      "durable generation constraint scope drifted",
      "durable generation index scope drifted",
      "durable generation additive catalog fixture scope drifted",
      "durable generation additive catalog FORCE cleanup failed",
      "invalid job state unexpectedly succeeded",
      "invalid job hash unexpectedly succeeded",
      "cross-owner privacy binding unexpectedly succeeded",
      "invalid attempt state unexpectedly succeeded",
      "invalid attempt hash unexpectedly succeeded",
      "cross-owner attempt binding unexpectedly succeeded",
      "multiple RUNNING attempts unexpectedly succeeded",
    ]) {
      expect(assertions).toContain(marker);
    }
    expect(assertions).toContain("v_registration_catalog");
    expect(assertions).toContain(
      "insert into careslink_v1_generation.worker_registrations",
    );
    expect(assertions).toContain("registration.test.v1");
    expect(assertions).toContain(
      "executor-ACL surface. It does not prove SKIP LOCKED,",
    );
    expect(assertions).toContain(
      "worker RPCs or atomic canonical persistence.",
    );
    expect(assertions).toContain(
      "with or without later separately\n-- reviewed additive worker migrations",
    );
    expect(assertions).toContain(
      "the worker RPC assertion owns the exact extension table",
    );
    expect(assertions.match(/<@ coalesce\(v_actual, array\[\]::text\[\]\)/g)).toHaveLength(8);
    expect(assertions).toContain(
      "and table_name in ('jobs', 'attempts')",
    );
    expect(assertions).toContain(
      "to_regclass('careslink_v1_generation.worker_policies')",
    );
    expect(assertions).toContain(
      "minimum transaction-local TEST_ONLY",
    );
    expect(assertions).toContain("column_name = 'terminal_transaction_id'");
    expect(assertions).toContain(
      "terminal_transaction_id =\n              'a7000000-0000-4000-8000-000000000001'::uuid",
    );
    expect(assertions).toContain(
      "v_worker_extension_present boolean :=\n    to_regclass('careslink_v1_generation.worker_policies') is not null",
    );
    expect(assertions).toContain("if v_worker_extension_present then");
    expect(assertions).toContain(
      "elsif v_actual is distinct from array['attempts', 'jobs', 'settings']::text[]",
    );
    expect(assertions).toContain(
      "or exists (select 1 from pg_proc where pronamespace = v_schema)",
    );
    expect(assertions).toContain("if not v_worker_extension_present then");

    const apiRoleLoopStart = assertions.indexOf(
      "foreach v_role in array array[",
    );
    const apiRoleLoopEnd = assertions.indexOf(
      "\n  end loop;",
      apiRoleLoopStart,
    );
    expect(apiRoleLoopStart).toBeGreaterThanOrEqual(0);
    expect(apiRoleLoopEnd).toBeGreaterThan(apiRoleLoopStart);
    expect(
      assertions.slice(apiRoleLoopStart, apiRoleLoopEnd),
    ).not.toContain("careslink_v1_generation_executor");
    const defaultAclStart = assertions.indexOf(
      "foreach v_object_kind in array",
      apiRoleLoopEnd,
    );
    const defaultAclEnd = assertions.indexOf(
      "\n  end loop;",
      defaultAclStart,
    );
    expect(defaultAclStart).toBeGreaterThan(apiRoleLoopEnd);
    expect(defaultAclEnd).toBeGreaterThan(defaultAclStart);
    expect(
      assertions.slice(defaultAclStart, defaultAclEnd),
    ).toContain("careslink_v1_generation_executor");
    expect(assertions).toContain(
      "where owner.rolname = 'careslink_v1_generation_owner'\n        and defaults.defaclnamespace <> 0",
    );
    expect(assertions).toContain(
      "transaction-local test scaffolding, not migration or runtime permissions",
    );
    expect(normalizeSql(assertions)).toContain(
      "grant careslink_v1_generation_owner to current_user with admin false, inherit false, set true granted by current_user;",
    );
    expect(assertions).toContain(
      "set local role careslink_v1_generation_owner;",
    );
    expect(
      assertions.match(
        /^alter table careslink_v1_generation\.(?:settings|jobs|attempts) no force row level security;$/gm,
      ),
    ).toHaveLength(3);
    expect(
      assertions.match(
        /^alter table careslink_v1_generation\.(?:settings|jobs|attempts) force row level security;$/gm,
      ),
    ).toHaveLength(3);

    const fixtureSavepoint = assertions.indexOf(
      "savepoint durable_generation_job_attempt_fixtures;",
    );
    const jobFixture = assertions.indexOf(
      "insert into careslink_v1_generation.jobs (",
      fixtureSavepoint,
    );
    const attemptFixture = assertions.indexOf(
      "insert into careslink_v1_generation.attempts (",
      jobFixture,
    );
    const fixtureProofEnd = assertions.indexOf(
      "multiple RUNNING attempts unexpectedly succeeded",
      attemptFixture,
    );
    const fixtureRollback = assertions.indexOf(
      "rollback to savepoint durable_generation_job_attempt_fixtures;",
      fixtureProofEnd,
    );
    const fixtureRelease = assertions.indexOf(
      "release savepoint durable_generation_job_attempt_fixtures;",
      fixtureRollback,
    );
    const firstForceRestore = assertions.indexOf(
      "'alter table careslink_v1_generation.worker_policies ' ||\n      'force row level security'",
      fixtureRelease,
    );
    const jobsForceRestore = assertions.indexOf(
      "alter table careslink_v1_generation.jobs force row level security;",
      fixtureRelease,
    );
    expect(fixtureSavepoint).toBeGreaterThanOrEqual(0);
    expect(jobFixture).toBeGreaterThan(fixtureSavepoint);
    expect(attemptFixture).toBeGreaterThan(jobFixture);
    expect(fixtureProofEnd).toBeGreaterThan(attemptFixture);
    expect(fixtureRollback).toBeGreaterThan(fixtureProofEnd);
    expect(fixtureRelease).toBeGreaterThan(fixtureRollback);
    expect(firstForceRestore).toBeGreaterThan(fixtureRelease);
    expect(jobsForceRestore).toBeGreaterThan(firstForceRestore);
    expect(assertions.slice(jobFixture, fixtureRollback)).not.toMatch(
      /\balter\s+table\b/i,
    );
    expect(assertions).toContain(
      "remove\n-- their pending constraint-trigger events before restoring FORCE RLS",
    );
    expect(assertions).toContain("reset role;");
    expect(normalizeSql(assertions)).toContain(
      "revoke careslink_v1_generation_owner from current_user granted by current_user;",
    );
    expect(assertions.match(/to_jsonb\(membership\)->>'inherit_option'/g)).toHaveLength(2);
    expect(assertions.match(/to_jsonb\(membership\)->>'set_option'/g)).toHaveLength(2);
    expect(assertions).toContain("has_type_privilege(v_role, object_type.oid, 'USAGE')");
    expect(assertions.match(/grantor_role\.rolsuper/g)).toHaveLength(2);
    expect(assertions.match(/v_expected_edges/g)?.length).toBeGreaterThanOrEqual(8);
    expect(assertions).toContain("assertion-only owner access cleanup failed");
    expect(assertions).not.toMatch(/\bfor\s+update\s+skip\s+locked\b/i);
    expect(assertions).not.toMatch(/\bcreate\s+(?:or\s+replace\s+)?function\b/i);
  });
});

function tableBlock(qualifiedName: string) {
  const marker = `create table ${qualifiedName} (`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n);", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

function columnNames(block: string) {
  return block
    .split("\n")
    .slice(1)
    .map((line) => /^  ([a-z][a-z0-9_]*)\s+/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name) && name !== "constraint");
}

function constraintNames(block: string) {
  return [...block.matchAll(/\bconstraint\s+([a-z0-9_]+)/g)].map(
    (match) => match[1],
  );
}

function normalizeSql(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}
