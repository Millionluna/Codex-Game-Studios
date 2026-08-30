import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql";
const retirementMigrationPath =
  "supabase/migrations/20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql";
const assertionsPath =
  "supabase/assertions/v1_note_generation_owner_runtime_rpc_shadow_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const retirementMigration = readFileSync(
  join(process.cwd(), retirementMigrationPath),
  "utf8",
);
const assertions = readFileSync(join(process.cwd(), assertionsPath), "utf8");
const assertionHeader = assertions.slice(
  0,
  assertions.indexOf("\\set ON_ERROR_STOP on"),
);
const assertionBodyStart = assertions.indexOf("begin;\n");
const assertionBody = assertions.slice(assertionBodyStart);
const migrations = readdirSync(join(process.cwd(), "supabase/migrations"))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

const schemaName = "careslink_v1_generation";
const ownerRole = "careslink_v1_generation_owner";
const workerExecutorRole = "careslink_v1_generation_executor";
const ownerExecutorRole = "careslink_v1_generation_owner_api_executor";
const registrationControlRole =
  "careslink_v1_generation_registration_control_executor";
const ownerGuc = "careslink.v1_generation_owner_user_id";
const entryRoleRestore = `select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);`;

const rpcIdentities = {
  admit_and_enqueue_v1_shadow_note_generation_job:
    "p_owner_user_id uuid, p_session_id uuid, p_admission_transport text, p_job_id uuid, p_payload_id uuid, p_privacy_review_id uuid, p_note_type text, p_source_locale text, p_contract_version text, p_schema_version text, p_cleaned_facts_hash text, p_idempotency_hash text, p_request_hash text, p_payload_handle_hash text, p_payload_expires_at timestamptz",
  get_v1_shadow_note_generation_job_status:
    "p_owner_user_id uuid, p_session_id uuid, p_job_id uuid, p_contract_version text, p_schema_version text",
  cancel_v1_shadow_note_generation_job:
    "p_owner_user_id uuid, p_session_id uuid, p_job_id uuid, p_contract_version text, p_schema_version text",
} as const;

const rpcSignatures = {
  admit_and_enqueue_v1_shadow_note_generation_job:
    "uuid, uuid, text, uuid, uuid, uuid, text, text, text, text, text, text, text, text, timestamptz",
  get_v1_shadow_note_generation_job_status:
    "uuid, uuid, uuid, text, text",
  cancel_v1_shadow_note_generation_job: "uuid, uuid, uuid, text, text",
} as const;

const responseHelperSignatures = {
  _owner_api_assert_contract: "text, text",
  _owner_api_job_view: "uuid, uuid",
} as const;

const rpcNames = Object.keys(rpcIdentities) as Array<
  keyof typeof rpcIdentities
>;

const catalogTables = [
  "admission_policy_bindings",
  "payload_policies",
  "provider_policies",
  "settings",
  "worker_policies",
  "worker_registration_provider_policies",
  "worker_registrations",
] as const;

const ownerTables = [
  "attempts",
  "jobs",
  "payload_grants",
  "payload_purge_outbox",
  "payloads",
] as const;

const privateTableNames = [
  "admission_policy_bindings",
  "attempts",
  "jobs",
  "payload_grants",
  "payload_policies",
  "payload_purge_outbox",
  "payloads",
  "provider_evidence",
  "provider_policies",
  "settings",
  "worker_policies",
  "worker_registration_provider_policies",
  "worker_registrations",
] as const;

describe("V1 Note owner runtime RPC shadow migration contract", () => {
  it("remains the historical 28th migration before later additive migrations", () => {
    const topLevel = withoutDollarQuotedBodies(migration);

    expect(migrationPath).toMatch(
      /^supabase\/migrations\/\d{14}_add_v1_note_generation_owner_runtime_rpc_shadow\.sql$/,
    );
    expect(migrations.length).toBeGreaterThanOrEqual(29);
    expect(migrations.at(27)).toBe(migrationPath.split("/").at(-1));
    expect(migrations.at(28)).toBe(
      retirementMigrationPath.split("/").at(-1),
    );
    expect(Buffer.byteLength(migration, "utf8")).toBe(53_195);
    expect(
      createHash("sha256").update(migration, "utf8").digest("hex"),
    ).toBe("64626d770fc4f0effb3c8f14ef6d0afdf71250ef2491373ac15cdce52cbf0661");
    expect(migration).toContain("Source-only and default-off");
    expect(migration).toContain("adds no active admission binding");
    expect(migration).toContain("every API role remains denied");
    expect(migration).toContain(
      "The migration runner owns the transaction boundary",
    );
    expect(topLevel).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/im);
    expect(topLevel).not.toMatch(
      /\bif\s+not\s+exists\b|\bon\s+conflict\b/i,
    );
    expect(topLevel).not.toMatch(
      /^\s*(?:insert\s+into|update\s+[a-z0-9_."]+\s+set|delete\s+from|truncate|merge\s+into|copy\s+)\b/im,
    );
    expect(topLevel).not.toMatch(/^\s*do\b/im);
    expect(topLevel).not.toMatch(
      /^\s*drop\s+(?:table|schema|role|function|policy|index)\b/im,
    );
    expect(topLevel).not.toMatch(
      new RegExp(
        `^\\s*(?:alter|drop)\\s+table\\s+${schemaName}\\.settings\\b`,
        "im",
      ),
    );
    expect(topLevel).not.toContain("settings_enabled_check");
  });

  it("adds one empty admission catalog and one inert executor role", () => {
    expect(
      [...migration.matchAll(/^\s*create role\s+([a-z0-9_]+)/gim)].map(
        (match) => match[1],
      ),
    ).toEqual([ownerExecutorRole]);
    expect(normalizeSql(migration)).toContain(
      `create role ${ownerExecutorRole} with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;`,
    );
    expect(migration).not.toMatch(
      new RegExp(`^\\s*alter\\s+role\\s+${ownerExecutorRole}\\b`, "im"),
    );
    expect(
      [...migration.matchAll(/^\s*create table\s+([a-z0-9_.]+)/gim)].map(
        (match) => match[1],
      ),
    ).toEqual([`${schemaName}.admission_policy_bindings`]);
    const tableStart = migration.search(
      new RegExp(
        `^\\s*create table\\s+${schemaName}\\.admission_policy_bindings\\s*\\(`,
        "im",
      ),
    );
    const tableOwnerStart = migration.lastIndexOf(
      `set role ${ownerRole};`,
      tableStart,
    );
    const tableOwnerEnd = migration.indexOf(entryRoleRestore, tableStart);
    expect(tableOwnerStart).toBeGreaterThanOrEqual(0);
    expect(tableStart).toBeGreaterThan(tableOwnerStart);
    expect(tableOwnerEnd).toBeGreaterThan(tableStart);
    expect(migration).not.toMatch(
      new RegExp(
        `^\\s*alter table\\s+${schemaName}\\.admission_policy_bindings\\s+owner\\s+to\\b`,
        "im",
      ),
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+careslink_v1_generation\.admission_policy_bindings/i,
    );

    const binding = tableBlock(
      `${schemaName}.admission_policy_bindings`,
    );
    expect(columnNames(binding)).toEqual([
      "binding_version",
      "note_type",
      "registration_digest",
      "status",
      "activated_at",
      "retired_at",
      "created_at",
      "shadow_only",
    ]);
    expect(constraintNames(binding)).toEqual([
      "admission_policy_bindings_version_check",
      "admission_policy_bindings_note_type_check",
      "admission_policy_bindings_status_check",
      "admission_policy_bindings_lifecycle_check",
      "admission_policy_bindings_time_check",
      "admission_policy_bindings_shadow_check",
    ]);
    const normalizedBinding = normalizeSql(binding);
    for (const required of [
      "binding_version text primary key",
      `registration_digest text not null references ${schemaName}.worker_registrations( registration_digest ) on delete restrict`,
      "created_at timestamptz not null default transaction_timestamp()",
      "shadow_only boolean not null default true",
      "unique (note_type, binding_version)",
      "status in ('DRAFT', 'ACTIVE', 'RETIRED')",
      "note_type in ( 'communication', 'handover', 'progress', 'ndis', 'incident_factual' )",
      "status = 'DRAFT' and activated_at is null and retired_at is null",
      "status = 'ACTIVE' and activated_at is not null and retired_at is null",
      "status = 'RETIRED' and activated_at is not null and retired_at is not null and retired_at >= activated_at",
      "activated_at is null or activated_at >= created_at",
      "shadow_only is true",
    ]) {
      expect(normalizedBinding).toContain(required);
    }
    expect(normalizeSql(migration)).toContain(
      `create unique index admission_policy_bindings_one_active_note_idx on ${schemaName}.admission_policy_bindings(note_type) where status = 'ACTIVE';`,
    );
  });

  it("uses temporary SET-only migration edges and closes the new executor defaults", () => {
    const normalized = normalizeSql(migration);
    for (const role of [ownerRole, workerExecutorRole, ownerExecutorRole]) {
      expect(normalized).toContain(
        `grant ${role} to current_user with admin false, inherit false, set true granted by current_user;`,
      );
      expect(normalized).toContain(
        `revoke ${role} from current_user granted by current_user;`,
      );
    }

    const defaultsStart = normalized.indexOf(`set role ${ownerExecutorRole};`);
    const defaultsEnd = normalized.indexOf(
      normalizeSql(entryRoleRestore),
      defaultsStart,
    );
    expect(defaultsStart).toBeGreaterThanOrEqual(0);
    expect(defaultsEnd).toBeGreaterThan(defaultsStart);
    const defaults = normalized.slice(defaultsStart, defaultsEnd);
    expect(defaults.match(/alter default privileges\b/g)).toHaveLength(8);
    expect(normalized.match(/alter default privileges\b/g)).toHaveLength(8);
    expect(normalized).not.toMatch(/alter default privileges\b[^;]*\bgrant\b/);
    for (const kind of ["tables", "sequences", "functions", "types"]) {
      expect(defaults).toContain(
        `alter default privileges revoke all on ${kind} from public, anon, authenticated, service_role, ${ownerRole}, ${workerExecutorRole};`,
      );
      expect(defaults).toContain(
        `alter default privileges in schema ${schemaName} revoke all on ${kind} from public, anon, authenticated, service_role, ${ownerRole}, ${workerExecutorRole};`,
      );
    }
  });

  it("forces RLS and separates catalog visibility from owner-scoped GUC policies", () => {
    const normalized = normalizeSql(migration);
    expect(normalized).toContain(
      `alter table ${schemaName}.admission_policy_bindings enable row level security;`,
    );
    expect(normalized).toContain(
      `alter table ${schemaName}.admission_policy_bindings force row level security;`,
    );

    const policyBlocks = [
      ...migration.matchAll(
        /^\s*create policy\s+[a-z0-9_]+[\s\S]+?;/gim,
      ),
    ].map((match) => normalizeSql(match[0]));
    const expectedPolicies = [
      ["settings_owner_api_select", "settings", "select", "catalog"],
      [
        "admission_policy_bindings_owner_api_select",
        "admission_policy_bindings",
        "select",
        "catalog",
      ],
      [
        "worker_policies_owner_api_select",
        "worker_policies",
        "select",
        "catalog",
      ],
      [
        "provider_policies_owner_api_select",
        "provider_policies",
        "select",
        "catalog",
      ],
      [
        "payload_policies_owner_api_select",
        "payload_policies",
        "select",
        "catalog",
      ],
      [
        "worker_registrations_owner_api_select",
        "worker_registrations",
        "select",
        "catalog",
      ],
      [
        "registration_provider_owner_api_select",
        "worker_registration_provider_policies",
        "select",
        "catalog",
      ],
      ["settings_owner_api_lock", "settings", "update", "lock"],
      [
        "admission_policy_bindings_owner_api_lock",
        "admission_policy_bindings",
        "update",
        "lock",
      ],
      [
        "worker_policies_owner_api_lock",
        "worker_policies",
        "update",
        "lock",
      ],
      [
        "provider_policies_owner_api_lock",
        "provider_policies",
        "update",
        "lock",
      ],
      [
        "payload_policies_owner_api_lock",
        "payload_policies",
        "update",
        "lock",
      ],
      [
        "worker_registrations_owner_api_lock",
        "worker_registrations",
        "update",
        "lock",
      ],
      [
        "registration_provider_owner_api_lock",
        "worker_registration_provider_policies",
        "update",
        "lock",
      ],
      ["jobs_owner_api_select", "jobs", "select", "owner"],
      ["jobs_owner_api_insert", "jobs", "insert", "owner"],
      ["jobs_owner_api_update", "jobs", "update", "owner"],
      ["attempts_owner_api_select", "attempts", "select", "owner"],
      ["attempts_owner_api_update", "attempts", "update", "owner"],
      ["payloads_owner_api_select", "payloads", "select", "owner"],
      ["payloads_owner_api_insert", "payloads", "insert", "owner"],
      ["payloads_owner_api_update", "payloads", "update", "owner"],
      [
        "payload_grants_owner_api_select",
        "payload_grants",
        "select",
        "owner",
      ],
      [
        "payload_grants_owner_api_update",
        "payload_grants",
        "update",
        "owner",
      ],
      [
        "purge_outbox_owner_api_select",
        "payload_purge_outbox",
        "select",
        "owner",
      ],
      [
        "purge_outbox_owner_api_insert",
        "payload_purge_outbox",
        "insert",
        "owner",
      ],
      [
        "purge_outbox_owner_api_lock",
        "payload_purge_outbox",
        "update",
        "owner_lock",
      ],
    ] as const;
    expect(policyBlocks).toHaveLength(expectedPolicies.length);

    expectedPolicies.forEach(([name, table, command, scope], index) => {
      const policy = policyBlocks[index];
      expect(policy).toMatch(
        new RegExp(
          `^create policy ${name} on ${schemaName}\\.${table} for ${command} to ${ownerExecutorRole} (?:using|with check) \\(`,
        ),
      );
      expect(policy).not.toMatch(
        /\bto\s+(?:public|anon|authenticated|service_role|careslink_v1_generation_executor)\b/i,
      );
      if (scope === "catalog") {
        expect(catalogTables).toContain(table);
        expect(policy).toContain("using (true)");
        expect(policy).not.toContain(ownerGuc);
        return;
      }
      if (scope === "lock") {
        expect(catalogTables).toContain(table);
        expect(policy).toContain("using (true)");
        expect(policy).toContain("with check (false)");
        expect(policy).not.toContain(ownerGuc);
        return;
      }
      if (scope === "owner_lock") {
        expect(ownerTables).toContain(table);
        expect(policy).toContain("owner_user_id");
        expect(policy.split(ownerGuc)).toHaveLength(2);
        expect(policy).toContain("using (");
        expect(policy).toContain("with check (false)");
        return;
      }

      expect(ownerTables).toContain(table);
      expect(policy).toContain("owner_user_id");
      expect(policy.split(ownerGuc)).toHaveLength(
        command === "update" ? 3 : 2,
      );
      if (command === "update") {
        expect(policy).toContain("using (");
        expect(policy).toContain("with check (");
      } else if (command === "insert") {
        expect(policy).not.toContain("using (");
        expect(policy).toContain("with check (");
      } else {
        expect(policy).toContain("using (");
        expect(policy).not.toContain("with check (");
      }
    });
  });

  it("grants only the reviewed table columns and invoker helper chain", () => {
    const grantStatements = statementMatches(
      migration,
      /^\s*grant\b/gim,
    ).map(normalizeSql);
    expect(grantStatements).toEqual([
      `grant ${ownerRole} to current_user with admin false, inherit false, set true granted by current_user;`,
      `grant ${workerExecutorRole} to current_user with admin false, inherit false, set true granted by current_user;`,
      `grant ${ownerExecutorRole} to current_user with admin false, inherit false, set true granted by current_user;`,
      `grant usage on schema ${schemaName} to ${ownerExecutorRole};`,
      `grant select on ${schemaName}.settings, ${schemaName}.admission_policy_bindings, ${schemaName}.worker_policies, ${schemaName}.provider_policies, ${schemaName}.payload_policies, ${schemaName}.worker_registrations, ${schemaName}.worker_registration_provider_policies, ${schemaName}.jobs, ${schemaName}.attempts, ${schemaName}.payloads, ${schemaName}.payload_grants, ${schemaName}.payload_purge_outbox to ${ownerExecutorRole};`,
      `grant update (capability) on ${schemaName}.settings to ${ownerExecutorRole};`,
      `grant update (binding_version) on ${schemaName}.admission_policy_bindings to ${ownerExecutorRole};`,
      `grant update (version) on ${schemaName}.worker_policies to ${ownerExecutorRole};`,
      `grant update (note_type) on ${schemaName}.provider_policies to ${ownerExecutorRole};`,
      `grant update (policy_version) on ${schemaName}.payload_policies to ${ownerExecutorRole};`,
      `grant update (registration_digest) on ${schemaName}.worker_registrations to ${ownerExecutorRole};`,
      `grant update (registration_digest) on ${schemaName}.worker_registration_provider_policies to ${ownerExecutorRole};`,
      `grant insert ( id, owner_user_id, initiating_session_id, admission_transport, payload_id, note_type, source_locale, service_code, rate_catalog_version, contract_version, schema_version, privacy_review_id, privacy_scanner_policy_version, privacy_review_revision, cleaned_facts_hash, idempotency_hash, request_hash, worker_policy_version, worker_policy_digest, provider_policy_version, provider_policy_digest, payload_policy_version, payload_policy_snapshot_hash, status, attempt_count, next_eligible_at, created_at, updated_at, shadow_only ) on ${schemaName}.jobs to ${ownerExecutorRole};`,
      `grant update ( status, next_eligible_at, failure_reason, updated_at, finished_at ) on ${schemaName}.jobs to ${ownerExecutorRole};`,
      `grant update ( status, failure_reason, finished_at, terminal_transaction_id ) on ${schemaName}.attempts to ${ownerExecutorRole};`,
      `grant insert ( id, job_id, owner_user_id, note_type, source_locale, contract_version, schema_version, privacy_review_id, privacy_proof_expires_at, cleaned_facts_hash, request_hash, policy_version, encryption_profile_version, backup_disposition_version, policy_snapshot_hash, payload_handle_hash, state, expires_at, available_at, purge_attempt_count, created_at, updated_at, shadow_only ) on ${schemaName}.payloads to ${ownerExecutorRole};`,
      `grant update ( state, revoked_at, revoke_reason, purge_requested_at, updated_at ) on ${schemaName}.payloads to ${ownerExecutorRole};`,
      `grant update (status, revoked_at) on ${schemaName}.payload_grants to ${ownerExecutorRole};`,
      `grant insert ( id, transaction_id, payload_id, job_id, owner_user_id, reason, event_reference_hash, status, requested_at, attempt_count, created_at, shadow_only ) on ${schemaName}.payload_purge_outbox to ${ownerExecutorRole};`,
      `grant update (id) on ${schemaName}.payload_purge_outbox to ${ownerExecutorRole};`,
      `grant create on schema ${schemaName} to ${ownerExecutorRole};`,
      `grant usage on schema public, extensions to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}._server_time(timestamptz) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}._sha256_text(text) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}._set_owner(uuid) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}._worker_policy_is_valid( text, text ) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}._provider_policy_is_valid( text, text, text ) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}._registration_is_valid( text, text, text, text, text, text ) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}._payload_snapshot_is_valid( text, text, text, text ) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}._enqueue_payload_purge( uuid, uuid, uuid, uuid, text, timestamptz ) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}.fresh_session_is_active( uuid, uuid, timestamptz ) to ${ownerExecutorRole};`,
      `grant execute on function ${schemaName}.fresh_privacy_proof_expires_at( uuid, uuid, text, text, text, text, timestamptz ) to ${ownerExecutorRole};`,
      `grant execute on function public.v1_shadow_canonical_json(jsonb) to ${ownerExecutorRole};`,
      `grant execute on function public.v1_shadow_content_sha256(jsonb) to ${ownerExecutorRole};`,
      `grant execute on function extensions.gen_random_uuid() to ${ownerExecutorRole};`,
      `grant execute on function extensions.digest(bytea, text) to ${ownerExecutorRole};`,
    ]);
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete|truncate|references|trigger)\b[^;]*\bon\s+(?:table\s+)?auth\./i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete|truncate|references|trigger)\b[^;]*\bon\s+(?:table\s+)?public\./i,
    );

    for (const helper of [
      `${schemaName}._server_time(timestamptz)`,
      `${schemaName}._sha256_text(text)`,
      `${schemaName}._set_owner(uuid)`,
      `${schemaName}._worker_policy_is_valid( text, text )`,
      `${schemaName}._provider_policy_is_valid( text, text, text )`,
      `${schemaName}._registration_is_valid( text, text, text, text, text, text )`,
      `${schemaName}._payload_snapshot_is_valid( text, text, text, text )`,
      `${schemaName}._enqueue_payload_purge( uuid, uuid, uuid, uuid, text, timestamptz )`,
      `${schemaName}.fresh_session_is_active( uuid, uuid, timestamptz )`,
      `${schemaName}.fresh_privacy_proof_expires_at( uuid, uuid, text, text, text, text, timestamptz )`,
      "public.v1_shadow_canonical_json(jsonb)",
      "public.v1_shadow_content_sha256(jsonb)",
      "extensions.gen_random_uuid()",
      "extensions.digest(bytea, text)",
    ]) {
      expect(normalizeSql(migration)).toContain(
        `grant execute on function ${helper} to ${ownerExecutorRole};`,
      );
    }
    expect(normalizeSql(migration)).toContain(
      `grant usage on schema ${schemaName} to ${ownerExecutorRole};`,
    );
    expect(normalizeSql(migration)).toContain(
      `grant usage on schema public, extensions to ${ownerExecutorRole};`,
    );
    expect(normalizeSql(migration)).not.toMatch(
      /grant create on schema (?:public|extensions)\b/,
    );
    expect(normalizeSql(migration)).not.toMatch(
      new RegExp(
        `grant execute on function ${schemaName}\\.(?:claim|heartbeat|fence|commit|settle|resolve|recover|authorize|consume)_[a-z0-9_]*(?:\\([^;]*\\))? to ${ownerExecutorRole}`,
      ),
    );
  });

  it("creates exactly three private owner RPC identities with fixed constants", () => {
    const createdFunctions = [
      ...migration.matchAll(
        /^\s*create(?:\s+or\s+replace)?\s+function\s+([a-z0-9_.]+)\s*\(/gim,
      ),
    ].map((match) => match[1].toLowerCase());
    const expectedFunctions = [
      `${schemaName}._owner_api_assert_contract`,
      `${schemaName}._owner_api_job_view`,
      ...rpcNames.map((name) => `${schemaName}.${name}`),
    ];
    expect(createdFunctions).toEqual(expectedFunctions);

    const unqualifiedFunctions = createdFunctions.map(
      (name) => name.split(".").at(-1)!,
    );
    const securityDefinerFunctions = unqualifiedFunctions.filter((name) =>
      /security\s+definer/i.test(functionBlock(name)),
    );
    expect(securityDefinerFunctions).toEqual(rpcNames);

    const functionRoleStart = migration.lastIndexOf(
      `set role ${ownerExecutorRole};`,
      functionStart("_owner_api_assert_contract"),
    );
    const functionRoleEnd = migration.indexOf(
      entryRoleRestore,
      functionRoleStart,
    );
    expect(functionRoleStart).toBeGreaterThanOrEqual(0);
    expect(functionRoleEnd).toBeGreaterThan(functionRoleStart);
    for (const name of unqualifiedFunctions) {
      const start = functionStart(name);
      expect(start).toBeGreaterThan(functionRoleStart);
      expect(start).toBeLessThan(functionRoleEnd);
    }

    for (const name of Object.keys(responseHelperSignatures)) {
      const block = functionBlock(name);
      expect(block).toMatch(/security\s+invoker/i);
      expect(block).toMatch(/set\s+search_path\s*=\s*''/i);
    }

    const contractGuard = functionBlock("_owner_api_assert_contract");
    expect(normalizeIdentityArguments(contractGuard)).toBe(
      "p_contract_version text, p_schema_version text",
    );
    expect(
      normalizeIdentityArguments(functionBlock("_owner_api_job_view")),
    ).toBe("p_job_id uuid, p_owner_user_id uuid");
    expect(normalizeSql(contractGuard)).toContain(
      "if p_contract_version is distinct from '1.0.0-shadow.1' or p_schema_version is distinct from '2026-08-09.v1-shadow' then",
    );
    expect(migration.match(/'1\.0\.0-shadow\.1'/g)).toHaveLength(1);
    expect(migration.match(/'2026-08-09\.v1-shadow'/g)).toHaveLength(1);

    for (const name of rpcNames) {
      const block = functionBlock(name);
      expect(normalizeIdentityArguments(block)).toBe(rpcIdentities[name]);
      expect(block).toMatch(/returns\s+jsonb/i);
      expect(block).toMatch(/language\s+plpgsql/i);
      expect(block).toMatch(/volatile/i);
      expect(block).toMatch(/security\s+definer/i);
      expect(block).toMatch(/set\s+search_path\s*=\s*''/i);
      expect(block).toContain(`${schemaName}._owner_api_assert_contract(`);
      expect(block).toContain(`${schemaName}._set_owner(`);
      expect(block).toContain(`${schemaName}.fresh_session_is_active(`);
    }

    const rpcProofCounts = {
      admit_and_enqueue_v1_shadow_note_generation_job: {
        clock: 9,
        session: 9,
        privacy: 3,
      },
      get_v1_shadow_note_generation_job_status: {
        clock: 2,
        session: 2,
        privacy: 0,
      },
      cancel_v1_shadow_note_generation_job: {
        clock: 4,
        session: 4,
        privacy: 0,
      },
    } as const;
    for (const name of rpcNames) {
      const block = normalizeSql(functionBlock(name));
      expect(
        occurrenceCount(
          block,
          "date_trunc('milliseconds', pg_catalog.clock_timestamp())",
        ),
      ).toBe(rpcProofCounts[name].clock);
      expect(
        occurrenceCount(
          block,
          `${schemaName}.fresh_session_is_active(`,
        ),
      ).toBe(rpcProofCounts[name].session);
      expect(
        occurrenceCount(
          block,
          `${schemaName}.fresh_privacy_proof_expires_at(`,
        ),
      ).toBe(rpcProofCounts[name].privacy);
      expect(block).not.toContain(`${schemaName}._server_now(`);
    }

    expect(migration).not.toMatch(
      /^create function\s+public\.(?:admit_and_enqueue|get|cancel)_v1_shadow_note_generation/mi,
    );
  });

  it("gates only admission on enabled while status and cancellation stay available", () => {
    const enqueue = functionBlock(
      "admit_and_enqueue_v1_shadow_note_generation_job",
    );
    const status = functionBlock("get_v1_shadow_note_generation_job_status");
    const cancel = functionBlock("cancel_v1_shadow_note_generation_job");
    const normalizedEnqueue = normalizeSql(enqueue);
    const normalizedStatus = normalizeSql(status);
    const normalizedCancel = normalizeSql(cancel);
    const clockExpression =
      "date_trunc('milliseconds', pg_catalog.clock_timestamp())";

    const settingsGate = normalizedEnqueue.indexOf(
      `perform setting.capability from ${schemaName}.settings as setting where setting.capability = 'note_generation_v1' and setting.enabled is true and setting.shadow_only is true for share;`,
    );
    const bindingSelect = normalizedEnqueue.indexOf(
      "select binding.registration_digest, binding.activated_at,",
    );
    const bindingGate = normalizedEnqueue.indexOf(
      `from ${schemaName}.admission_policy_bindings as binding`,
      bindingSelect,
    );
    const bindingLock = normalizedEnqueue.indexOf(
      "for share of binding, registration, worker_policy, payload_policy, provider_binding, provider_policy;",
      bindingGate,
    );
    const bindingPostLockClock = normalizedEnqueue.indexOf(
      clockExpression,
      bindingLock,
    );
    const bindingActivationGuard = normalizedEnqueue.indexOf(
      "if v_binding.activated_at > v_now then",
      bindingPostLockClock,
    );
    const firstJobInsert = normalizedEnqueue.indexOf(
      `insert into ${schemaName}.jobs`,
    );
    const firstPayloadInsert = normalizedEnqueue.indexOf(
      `insert into ${schemaName}.payloads`,
      firstJobInsert,
    );
    const finalInsertProof = normalizedEnqueue.indexOf(
      clockExpression,
      firstPayloadInsert,
    );
    const finalReturn = normalizedEnqueue.indexOf(
      "return jsonb_build_object(",
      finalInsertProof,
    );
    expect(settingsGate).toBeGreaterThanOrEqual(0);
    expect(bindingSelect).toBeGreaterThan(settingsGate);
    expect(bindingGate).toBeGreaterThan(bindingSelect);
    expect(bindingLock).toBeGreaterThan(bindingGate);
    expect(bindingPostLockClock).toBeGreaterThan(bindingLock);
    expect(bindingActivationGuard).toBeGreaterThan(bindingPostLockClock);
    expect(firstJobInsert).toBeGreaterThan(bindingActivationGuard);
    expect(firstPayloadInsert).toBeGreaterThan(firstJobInsert);
    expect(finalInsertProof).toBeGreaterThan(firstPayloadInsert);
    expect(finalReturn).toBeGreaterThan(finalInsertProof);
    expect(
      normalizedEnqueue.slice(settingsGate, bindingSelect),
    ).toContain(
      `if not found then raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';`,
    );

    const bindingSection = normalizedEnqueue.slice(bindingGate, firstJobInsert);
    for (const required of [
      "binding.note_type = p_note_type",
      "binding.status = 'ACTIVE'",
      "binding.retired_at is null",
      "binding.shadow_only is true",
      "registration.status = 'APPROVED'",
      "worker_policy.status = 'APPROVED'",
      "payload_policy.status = 'APPROVED'",
      "provider_policy.status = 'APPROVED'",
      `if not found then raise exception using errcode = 'P0001', message = 'PRODUCT_API_DISABLED';`,
    ]) {
      expect(bindingSection).toContain(required);
    }
    expect(bindingSection).toContain("v_binding.activated_at > v_now");
    expect(bindingSection).not.toContain("binding.activated_at <= v_now");

    const replayStart = normalizedEnqueue.indexOf(
      "if v_existing_job_found then",
    );
    const replaySection = normalizedEnqueue.slice(replayStart, settingsGate);
    expect(replayStart).toBeGreaterThanOrEqual(0);
    expect(
      occurrenceCount(
        replaySection,
        `${schemaName}.fresh_session_is_active(`,
      ),
    ).toBe(1);
    expect(replaySection).not.toContain(
      `${schemaName}.fresh_privacy_proof_expires_at(`,
    );

    const finalInsertProofSection = normalizedEnqueue.slice(
      finalInsertProof,
      finalReturn,
    );
    expect(
      occurrenceCount(finalInsertProofSection, clockExpression),
    ).toBe(1);
    expect(
      occurrenceCount(
        finalInsertProofSection,
        `${schemaName}.fresh_session_is_active(`,
      ),
    ).toBe(1);
    expect(
      occurrenceCount(
        finalInsertProofSection,
        `${schemaName}.fresh_privacy_proof_expires_at(`,
      ),
    ).toBe(1);
    expect(finalInsertProofSection).toContain("PRIVACY_REVIEW_STALE");
    expect(normalizedEnqueue).toContain(
      "p_job_id is distinct from v_existing_job.id",
    );
    expect(normalizedEnqueue).toContain("p_idempotency_hash");
    expect(normalizedEnqueue).toContain("p_request_hash");

    for (const normalizedBlock of [normalizedStatus, normalizedCancel]) {
      for (const table of catalogTables) {
        expect(normalizedBlock).not.toContain(`${schemaName}.${table}`);
      }
      for (const helper of [
        "_assert_capability",
        "_worker_policy_is_valid",
        "_provider_policy_is_valid",
        "_registration_is_valid",
        "_payload_snapshot_is_valid",
      ]) {
        expect(normalizedBlock).not.toContain(`${schemaName}.${helper}(`);
      }
      expect(normalizedBlock).not.toContain("PRODUCT_API_DISABLED");
    }

    const allRunningLock = normalizedCancel.indexOf("perform attempt.id");
    const runningCount = normalizedCancel.indexOf(
      "select count(*) into v_running_attempt_count",
      allRunningLock,
    );
    const runningCardinalityGuard = normalizedCancel.indexOf(
      "if v_running_attempt_count <> 1 then",
      runningCount,
    );
    const attemptNumberGuard = normalizedCancel.indexOf(
      "if v_attempt.attempt_number is distinct from v_job.attempt_count then",
      runningCardinalityGuard,
    );
    const queuedCardinalityGuard = normalizedCancel.indexOf(
      "elsif v_running_attempt_count <> 0 then",
      attemptNumberGuard,
    );
    const payloadLock = normalizedCancel.indexOf(
      "select payload.*",
      queuedCardinalityGuard,
    );
    expect(allRunningLock).toBeGreaterThanOrEqual(0);
    expect(runningCount).toBeGreaterThan(allRunningLock);
    expect(runningCardinalityGuard).toBeGreaterThan(runningCount);
    expect(attemptNumberGuard).toBeGreaterThan(runningCardinalityGuard);
    expect(queuedCardinalityGuard).toBeGreaterThan(attemptNumberGuard);
    expect(payloadLock).toBeGreaterThan(queuedCardinalityGuard);
    expect(normalizedCancel).toContain(
      `${schemaName}._enqueue_payload_purge(`,
    );
    expect(normalizedCancel).toContain("'CANCELLED'");
  });

  it("extends the effective owner surface only for graceful retirement admission gating", () => {
    const normalizedRetirement = normalizeSql(retirementMigration);
    const effectiveEnqueue = normalizeSql(
      functionBlock(
        "admit_and_enqueue_v1_shadow_note_generation_job",
        retirementMigration,
      ),
    );
    const helper = `${schemaName}._registration_accepts_new_work`;
    const ledger = `${schemaName}.worker_registration_retirements`;

    expect(migrations.at(28)).toBe(
      retirementMigrationPath.split("/").at(-1),
    );
    expect(effectiveEnqueue).toMatch(
      /^create or replace function careslink_v1_generation\.admit_and_enqueue_v1_shadow_note_generation_job\b/,
    );
    expect(
      occurrenceCount(
        effectiveEnqueue,
        "date_trunc('milliseconds', pg_catalog.clock_timestamp())",
      ),
    ).toBe(10);
    expect(
      occurrenceCount(
        effectiveEnqueue,
        `${schemaName}.fresh_session_is_active(`,
      ),
    ).toBe(10);
    expect(
      occurrenceCount(
        effectiveEnqueue,
        `${schemaName}.fresh_privacy_proof_expires_at(`,
      ),
    ).toBe(3);
    expect(occurrenceCount(effectiveEnqueue, `${helper}(`)).toBe(1);

    const replayReceipt = effectiveEnqueue.indexOf("'created', false");
    const bindingPreLock = effectiveEnqueue.indexOf(
      "select binding.registration_digest into v_binding_registration_digest",
    );
    const retirementGate = effectiveEnqueue.indexOf(
      `if not ${helper}( v_binding_registration_digest ) then`,
    );
    const bindingDetailRead = effectiveEnqueue.indexOf(
      "select binding.registration_digest, binding.activated_at",
      retirementGate,
    );
    const firstJobInsert = effectiveEnqueue.indexOf(
      `insert into ${schemaName}.jobs`,
    );
    expect(replayReceipt).toBeGreaterThanOrEqual(0);
    expect(bindingPreLock).toBeGreaterThan(replayReceipt);
    expect(
      effectiveEnqueue.slice(bindingPreLock, retirementGate),
    ).toContain("for share of binding;");
    expect(retirementGate).toBeGreaterThan(bindingPreLock);
    expect(bindingDetailRead).toBeGreaterThan(retirementGate);
    expect(
      effectiveEnqueue.slice(bindingDetailRead, firstJobInsert),
    ).toContain(
      "binding.registration_digest = v_binding_registration_digest",
    );
    expect(firstJobInsert).toBeGreaterThan(bindingDetailRead);
    expect(effectiveEnqueue.slice(retirementGate, bindingDetailRead)).toContain(
      "message = 'PRODUCT_API_DISABLED'",
    );

    expect(normalizedRetirement).toContain(
      `create policy worker_registration_retirements_owner_api_select on ${ledger} for select to ${ownerExecutorRole} using (true);`,
    );
    expect(normalizedRetirement).toContain(
      `grant select on ${ledger} to ${workerExecutorRole}, ${ownerExecutorRole}, ${registrationControlRole};`,
    );
    expect(normalizedRetirement).toContain(
      `grant execute on function ${helper}(text) to ${workerExecutorRole}, ${ownerExecutorRole};`,
    );
    expect(normalizedRetirement).not.toMatch(
      new RegExp(
        `grant (?:insert|update|delete|truncate)[^;]*on (?:table )?${ledger.replace(".", "\\.")}[^;]*to [^;]*\\b${ownerExecutorRole}\\b`,
      ),
    );
  });

  it("leaves no caller grant, CREATE privilege or temporary membership edge", () => {
    const normalized = normalizeSql(migration);
    const schemaCreateAcl = statementMatches(
      migration,
      /^\s*(?:grant|revoke)\s+create\s+on\s+schema\s+careslink_v1_generation\b/gim,
    ).map(normalizeSql);
    expect(schemaCreateAcl).toEqual([
      `grant create on schema ${schemaName} to ${ownerExecutorRole};`,
      `revoke create on schema ${schemaName} from ${ownerExecutorRole};`,
    ]);
    const grantCreateIndex = migration.indexOf(
      `grant create on schema ${schemaName}`,
    );
    const revokeCreateIndex = migration.indexOf(
      `revoke create on schema ${schemaName}`,
    );
    expect(grantCreateIndex).toBeGreaterThanOrEqual(0);
    expect(grantCreateIndex).toBeLessThan(
      functionStart("_owner_api_assert_contract"),
    );
    expect(revokeCreateIndex).toBeGreaterThan(
      functionStart("cancel_v1_shadow_note_generation_job"),
    );

    for (const name of rpcNames) {
      expect(normalized).toContain(
        `revoke all on function ${schemaName}.${name}( ${rpcSignatures[name]} ) from public, anon, authenticated, service_role, ${ownerRole}, ${workerExecutorRole};`,
      );
      expect(normalized).not.toMatch(
        new RegExp(
          `grant execute on function ${schemaName}\\.${name}\\([^;]+\\) to (?:public|anon|authenticated|service_role)`,
        ),
      );
    }
    for (const [name, signature] of Object.entries(responseHelperSignatures)) {
      expect(normalized).toContain(
        `revoke all on function ${schemaName}.${name}(${signature}) from public, anon, authenticated, service_role, ${ownerRole}, ${workerExecutorRole};`,
      );
    }
    expect(normalized).toContain(
      `revoke create on schema ${schemaName} from ${ownerExecutorRole};`,
    );
    expect(normalized).toContain(
      `revoke all on table ${schemaName}.admission_policy_bindings from public, anon, authenticated, service_role, ${workerExecutorRole};`,
    );
    expect(normalized).toContain(
      `revoke all on type ${privateTableNames
        .map((table) => `${schemaName}.${table}`)
        .join(", ")} from public, anon, authenticated, service_role, ${workerExecutorRole}, ${ownerExecutorRole};`,
    );
    for (const objectKind of ["tables", "sequences"]) {
      expect(normalized).toContain(
        `revoke all on all ${objectKind} in schema ${schemaName} from public, anon, authenticated, service_role;`,
      );
    }
    expect(normalized).toContain(
      `revoke ${ownerExecutorRole} from current_user granted by current_user;`,
    );
    expect(normalized).toMatch(
      new RegExp(
        `revoke ${ownerExecutorRole} from current_user granted by current_user; revoke ${workerExecutorRole} from current_user granted by current_user; revoke ${ownerRole} from current_user granted by current_user;$`,
      ),
    );
  });

  it("ships the current rollback-only PostgreSQL owner runtime gate", () => {
    const normalizedHeader = assertionHeader
      .replace(/^-- ?/gm, "")
      .replace(/\s+/g, " ")
      .trim();

    expect(assertionsPath).toBe(
      "supabase/assertions/v1_note_generation_owner_runtime_rpc_shadow_assertions.sql",
    );
    expect(Buffer.byteLength(assertions, "utf8")).toBe(105_549);
    expect(
      createHash("sha256").update(assertions, "utf8").digest("hex"),
    ).toBe("b699e5967fd487656dc34c398b61c464396b26d40d48fc1bfbe8c53f3c423a3b");
    for (const marker of [
      "Manual rollback-only assertions for a fresh disposable PostgreSQL 16+ database",
      "after every repository migration has been applied",
      "BEGIN through ROLLBACK",
      "TEST_ONLY fixtures",
      "Production must never be the SQL target",
      "official Supabase CLI 2.115.0",
      "30/30 migrations",
      "11/11 rollback suites",
      "hosted-role-restore-r5-20260825",
      "deletion and exact id/ref absence were confirmed",
    ]) {
      expect(normalizedHeader).toContain(marker);
    }

    expect(assertionBodyStart).toBeGreaterThanOrEqual(0);
    expect(assertionBody.startsWith("begin;\n")).toBe(true);
    expect(assertionBody.endsWith("rollback;\n")).toBe(true);
    expect(assertionBody).not.toMatch(/^commit\s*;/im);
    expect(Buffer.byteLength(assertionBody, "utf8")).toBe(104_506);
    expect(
      createHash("sha256").update(assertionBody, "utf8").digest("hex"),
    ).toBe("53eb0f2c5265617f00ea37ab946ac9c9746589fddca39236279ba93bb2907b16");

    for (const marker of [
      "owner runtime RPC shadow requires PostgreSQL 16 or newer",
      "owner API executor attributes are unsafe",
      "owner API executor has an unsafe role membership",
      "owner runtime RPC private table scope drifted",
      "owner runtime RPC private RLS or ownership is unsafe",
      "Data API table or column privilege leaked",
      "Data API type privilege leaked",
      "owner API executor direct schema ACL drifted",
      "owner API executor global default ACL leaked",
      "owner runtime RPC identity set drifted",
      "owner runtime RPC signature drifted",
      "owner runtime RPC definer posture drifted",
      "owner runtime RPC execute grantees drifted",
      "owner RPC wall-clock/session/privacy proof-point set drifted",
      "owner RPC post-lock wall-clock source ordering drifted",
      "owner API executor direct helper/RPC ACL drifted",
      "owner API executor table ACL drifted",
      "owner API executor column DML ACL drifted",
      "owner API RLS policy shape drifted",
      "owner runtime RPC migration is not default-off and empty",
      "enabled-but-unbound owner admission did not fail closed",
      "catalog row-lock grant permitted direct no-op UPDATE",
      "exact owner admission replay drifted",
      "owner-scoped idempotency lane rejected owner B",
      "owner admission/status rejection matrix drifted",
      "expired-TTL exact owner replay lost its identity receipt",
      "owner A observed owner B admission rows",
      "corrupt pre-existing purge outbox was accepted by cancel",
      "QUEUED plus RUNNING-attempt corruption was not rejected atomically",
      "queued cancel was not exercised while admission disabled",
      "queued owner cancellation or replay drifted",
      "RUNNING status/cancel was not exercised while disabled",
      "owner RUNNING status envelope drifted or leaked",
      "RUNNING owner cancellation terminal set drifted",
      "owner API executor direct sensitive read was accepted",
      "owner assertion did not restore hard-off/binding/RLS",
      "assertion-only owner access cleanup failed",
    ]) {
      expect(assertionBody).toContain(marker);
    }
    const normalizedAssertionBody = normalizeSql(assertionBody);
    for (const successorTable of [
      "communication_note_preview_authorization_revocations",
      "communication_note_preview_authorizations",
      "communication_note_preview_claims",
      "communication_note_preview_dispatch_receipts",
      "communication_note_preview_dispatch_reservations",
      "communication_note_preview_runner_terminals",
    ]) {
      expect(normalizedAssertionBody).toContain(successorTable);
    }
    for (const schema of [schemaName, "extensions", "public"]) {
      expect(normalizedAssertionBody).toContain(`('${schema}', 'USAGE')`);
    }
    expect(normalizedAssertionBody).toContain(
      "has_schema_privilege(v_owner_api, v_schema, 'CREATE')",
    );
    for (const schema of ["extensions", "public"]) {
      expect(normalizedAssertionBody).toContain(
        `has_schema_privilege(v_owner_api, '${schema}', 'CREATE')`,
      );
    }
    for (const [rpc, count] of [
      ["enqueue", 10],
      ["status", 2],
      ["cancel", 4],
    ] as const) {
      expect(normalizedAssertionBody).toContain(
        `v_${rpc}_clock_count <> ${count}`,
      );
    }
    expect(normalizedAssertionBody).toContain(
      ") / length('fresh_privacy_proof_expires_at(') <> 3",
    );
    expect(normalizedAssertionBody).toContain(
      "('extensions.digest(bytea,text)'::regprocedure::oid)",
    );
    expect(normalizedAssertionBody).toContain(
      "('careslink_v1_generation._registration_accepts_new_work(text)'::regprocedure::oid)",
    );
    expect(normalizedAssertionBody).toContain(
      "('worker_registration_retirements', 'SELECT')",
    );
    expect(normalizedAssertionBody).toContain(
      "('worker_registration_retirements', 'worker_registration_retirements_owner_api_select', 'r')",
    );
    expect(assertionBody).toContain("inserts have cleared those waits");
    for (const name of rpcNames) {
      expect(assertionBody).toContain(`${schemaName}.${name}(`);
    }
  });
});

function statementMatches(value: string, pattern: RegExp): string[] {
  const starts = [...value.matchAll(pattern)].map((match) => match.index);
  return starts.map((start) => {
    const end = value.indexOf(";", start);
    return value.slice(start, end + 1);
  });
}

function functionStart(name: string, source = migration): number {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(
    `^\\s*create(?:\\s+or\\s+replace)?\\s+function\\s+${schemaName.replace(".", "\\.")}\\.${escapedName}\\s*\\(`,
    "im",
  );
  return source.search(marker);
}

function functionBlock(name: string, source = migration): string {
  const start = functionStart(name, source);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + "\n$$;".length);
}

function normalizeIdentityArguments(block: string): string {
  const start = block.indexOf("(");
  const end = block.indexOf(")\nreturns", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return block.slice(start + 1, end).replace(/\s+/g, " ").trim();
}

function tableBlock(qualifiedName: string): string {
  const marker = `create table ${qualifiedName} (`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = start + marker.length;
  let depth = 1;
  for (let index = bodyStart; index < migration.length; index += 1) {
    if (migration[index] === "(") depth += 1;
    if (migration[index] === ")") depth -= 1;
    if (depth === 0) return migration.slice(bodyStart, index);
  }
  throw new Error(`Unterminated table block: ${qualifiedName}`);
}

function columnNames(block: string): string[] {
  return topLevelCommaParts(block)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length > 0 &&
        !/^(?:constraint|primary\s+key|unique|foreign\s+key|check)\b/i.test(
          part,
        ),
    )
    .map((part) => part.match(/^([a-z][a-z0-9_]*)\s+/i)?.[1])
    .filter((name): name is string => Boolean(name));
}

function constraintNames(block: string): string[] {
  return [...block.matchAll(/\bconstraint\s+([a-z][a-z0-9_]*)\b/gi)].map(
    (match) => match[1],
  );
}

function topLevelCommaParts(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" && value[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function normalizeSql(value: string): string {
  return value.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
}

function occurrenceCount(value: string, marker: string): number {
  return value.split(marker).length - 1;
}

function withoutDollarQuotedBodies(value: string): string {
  return value.replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$");
}
