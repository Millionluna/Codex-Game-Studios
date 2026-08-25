import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertionsPath =
  "supabase/assertions/v1_note_generation_registration_retirement_shadow_assertions.sql";
const assertions = readFileSync(join(process.cwd(), assertionsPath), "utf8");
const assertionBodyStart = assertions.indexOf("begin;\n");
const assertionBody = assertions.slice(assertionBodyStart);
const workerRpcMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260821071044_add_v1_note_generation_worker_rpc_shadow.sql",
  ),
  "utf8",
);
const migrations = readdirSync(join(process.cwd(), "supabase/migrations"))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

const schemaName = "careslink_v1_generation";
const ownerRole = "careslink_v1_generation_owner";
const workerRole = "careslink_v1_generation_executor";
const ownerApiRole = "careslink_v1_generation_owner_api_executor";
const controlRole =
  "careslink_v1_generation_registration_control_executor";
const retirementTable = "worker_registration_retirements";
const acceptsNewWorkHelper = "_registration_accepts_new_work";
const retirementRpc =
  "retire_v1_shadow_note_generation_worker_registration";
const ownerAdmissionRpc =
  "admit_and_enqueue_v1_shadow_note_generation_job";
const claimRpc = "claim_v1_shadow_note_generation_job";

const unchangedWorkerRpcs = [
  "heartbeat_v1_shadow_note_generation_attempt",
  "fence_v1_shadow_note_generation_attempt",
  "commit_v1_shadow_note_generation_success",
  "settle_v1_shadow_note_generation_failure",
  "resolve_v1_shadow_note_generation_attempt",
  "recover_v1_shadow_note_generation_expired",
  "authorize_v1_shadow_note_generation_payload_attempt",
  "consume_v1_shadow_note_generation_payload_grant",
] as const;

describe("V1 Note worker-registration retirement shadow migration contract", () => {
  it("remains the historical 29th CLI-named additive default-off migration", () => {
    const topLevel = withoutDollarQuotedBodies(migration);
    const normalizedSource = migration.replace(/\s+/g, " ");

    expect(migrationPath).toMatch(
      /^supabase\/migrations\/\d{14}_add_v1_note_generation_worker_registration_retirement_shadow\.sql$/,
    );
    expect(migrations.length).toBeGreaterThanOrEqual(29);
    expect(migrations.at(28)).toBe(migrationPath.split("/").at(-1));
    for (const marker of [
      "Source-only and default-off",
      "status = 'APPROVED' because that value is covered by registration_digest",
      "separate, append-only",
      "operational fact that rejects new admission/claim work",
      "creates no retirement, binding, worker credential, caller grant",
      "Emergency revocation",
      "The migration runner owns the transaction boundary",
    ]) {
      expect(normalizedSource).toContain(marker);
    }

    expect(topLevel).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/im);
    expect(migration).not.toMatch(/^\s*[+-](?=--)/m);
    expect(topLevel).not.toMatch(
      /^\s*(?:insert\s+into|update\s+[a-z0-9_."]+\s+set|delete\s+from|truncate|merge\s+into|copy\s+)\b/im,
    );
    expect(topLevel).not.toMatch(/\bon\s+conflict\b/i);
    expect(migration).not.toMatch(/\benabled\s*=\s*true\b/i);
    expect(migration).not.toMatch(
      /update\s+careslink_v1_generation\.worker_registrations\s+as\s+registration\s+set/i,
    );
    expect(migration).not.toMatch(
      /alter\s+table\s+careslink_v1_generation\.worker_registrations[\s\S]{0,160}\b(?:drop|alter)\s+(?:constraint\s+)?status\b/i,
    );
    expect(migration).not.toMatch(
      /(?:attempts|payload_grants)\s+as\s+[a-z_]+\s+set\s+registration_digest/i,
    );
  });

  it("creates one isolated no-login control executor with temporary SET edges only", () => {
    const normalized = normalizeSql(migration);

    expect(normalized).toContain(
      `create role ${controlRole} with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;`,
    );
    for (const role of [ownerRole, workerRole, ownerApiRole, controlRole]) {
      expect(normalized).toContain(
        `grant ${role} to current_user with admin false, inherit false, set true granted by current_user;`,
      );
      expect(normalized).toContain(
        `revoke ${role} from current_user granted by current_user;`,
      );
    }
    expect(normalized).toContain(
      `grant usage on schema ${schemaName} to ${controlRole};`,
    );
    expect(normalized).toContain(
      `revoke create on schema ${schemaName} from ${controlRole}, ${workerRole}, ${ownerApiRole};`,
    );
    expect(migration).not.toMatch(
      new RegExp(
        `grant\\s+${controlRole}\\s+to\\s+(?:public|anon|authenticated|service_role|${workerRole}|${ownerApiRole})\\b`,
        "i",
      ),
    );
    expect(migration).not.toMatch(
      /grant\s+execute[\s\S]{0,240}\bto\s+(?:public|anon|authenticated|service_role)\b/i,
    );
  });

  it("adds an exact append-only retirement ledger without changing canonical registrations", () => {
    const table = tableBlock(`${schemaName}.${retirementTable}`);
    const normalized = normalizeSql(migration);

    expect(columnNames(table)).toEqual([
      "registration_digest",
      "operation_id",
      "reason_code",
      "retired_binding_versions",
      "retired_at",
      "created_at",
      "shadow_only",
    ]);
    expect(constraintNames(table)).toEqual([
      "worker_registration_retirements_reason_check",
      "worker_registration_retirements_bindings_check",
      "worker_registration_retirements_time_check",
      "worker_registration_retirements_shadow_check",
    ]);
    for (const required of [
      "registration_digest text primary key",
      `references ${schemaName}.worker_registrations( registration_digest ) on update restrict on delete restrict`,
      "operation_id uuid not null unique",
      "reason_code in ('ROTATED', 'DECOMMISSIONED', 'POLICY_SUPERSEDED')",
      "retired_binding_versions text[] not null",
      "cardinality(retired_binding_versions) between 0 and 5",
      "array_position(retired_binding_versions, null) is null",
      "retired_at >= created_at",
      "shadow_only is true",
    ]) {
      expect(normalizeSql(table)).toContain(required);
    }

    expect(normalized).toContain(
      `create index admission_policy_bindings_registration_idx on ${schemaName}.admission_policy_bindings( registration_digest, binding_version );`,
    );
    expect(normalized).toContain(
      `alter table ${schemaName}.${retirementTable} enable row level security;`,
    );
    expect(normalized).toContain(
      `alter table ${schemaName}.${retirementTable} force row level security;`,
    );
    for (const policy of [
      "worker_registration_retirements_generation_executor_select",
      "worker_registration_retirements_owner_api_select",
      "worker_registration_retirements_control_select",
      "worker_registration_retirements_control_insert",
      "worker_registrations_generation_executor_lock",
      "worker_registrations_registration_control_select",
      "worker_registrations_registration_control_lock",
      "admission_policy_bindings_registration_control_select",
      "admission_policy_bindings_registration_control_update",
    ]) {
      expect(migration).toMatch(new RegExp(`create\\s+policy\\s+${policy}\\b`));
    }
    expect(migration).not.toMatch(
      new RegExp(
        `create\\s+policy\\s+[a-z0-9_]+[\\s\\S]{0,180}on\\s+${schemaName}\\.${retirementTable}[\\s\\S]{0,120}for\\s+(?:update|delete)\\b`,
        "i",
      ),
    );
    expect(normalized).toContain(
      `grant select on ${schemaName}.${retirementTable} to ${workerRole}, ${ownerApiRole}, ${controlRole};`,
    );
    expect(normalized).toContain(
      `grant update (registration_digest) on ${schemaName}.worker_registrations to ${workerRole}, ${controlRole};`,
    );
    expect(normalized).toContain(
      `grant update (status, retired_at) on ${schemaName}.admission_policy_bindings to ${controlRole};`,
    );
    expect(normalized).not.toMatch(
      new RegExp(
        `grant\\s+update\\s*\\([^)]*status[^)]*\\)\\s+on\\s+${schemaName}\\.worker_registrations`,
        "i",
      ),
    );
    expect(migration).not.toMatch(
      new RegExp(
        `grant\\s+(?:update|delete|truncate)\\b[\\s\\S]{0,180}\\bon\\s+(?:table\\s+)?${schemaName}\\.${retirementTable}`,
        "i",
      ),
    );
  });

  it("freezes the helper, append-only guards and exact control RPC", () => {
    const helper = normalizeSql(functionBlock(acceptsNewWorkHelper));
    const denyMutation = normalizeSql(
      functionBlock("_deny_worker_registration_retirement_mutation"),
    );
    const bindingGate = normalizeSql(
      functionBlock(
        "_enforce_active_binding_registration_accepts_new_work",
      ),
    );
    const attemptGate = normalizeSql(
      functionBlock(
        "_enforce_running_attempt_registration_accepts_new_work",
      ),
    );
    const retire = normalizeSql(functionBlock(retirementRpc));

    expect(functionIdentityArguments(acceptsNewWorkHelper)).toBe(
      "p_registration_digest text",
    );
    expect(helper).toContain(
      `returns boolean language plpgsql volatile security invoker set search_path = ''`,
    );
    expect(helper).toContain(
      `from ${schemaName}.worker_registrations as registration`,
    );
    expect(helper).toContain("for share;");
    expect(helper).toContain(
      `return not exists ( select 1 from ${schemaName}.${retirementTable} as retirement`,
    );
    expect(helper.indexOf("for share;")).toBeLessThan(
      helper.indexOf(`from ${schemaName}.${retirementTable}`),
    );

    expect(denyMutation).toContain("returns trigger");
    expect(denyMutation).toContain("message = 'IMMUTABLE_RETIREMENT_RECORD'");
    expect(bindingGate).toContain("new.status = 'ACTIVE'");
    expect(bindingGate).toContain(
      `${schemaName}.${acceptsNewWorkHelper}( new.registration_digest )`,
    );
    expect(attemptGate).toContain("new.status = 'RUNNING'");
    expect(attemptGate).toContain("message = 'POLICY_MISMATCH'");

    expect(functionIdentityArguments(retirementRpc)).toBe(
      "p_registration_digest text, p_operation_id uuid, p_reason_code text, p_expected_active_binding_versions text[]",
    );
    expect(retire).toContain(
      `returns jsonb language plpgsql volatile security definer set search_path = ''`,
    );
    for (const marker of [
      "message = 'VALIDATION_ERROR'",
      "message = 'REGISTRATION_NOT_FOUND'",
      "message = 'REGISTRATION_RETIREMENT_CONFLICT'",
      "message = 'ACTIVE_BINDING_CONFLICT'",
      "message = 'INTERNAL_FAILURE'",
      "'created', false",
      "'created', true",
      `insert into ${schemaName}.${retirementTable}`,
    ]) {
      expect(retire).toContain(marker);
    }
    expect(retire).toContain(
      "v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp())",
    );
    expect(retire).toContain(
      "where expected.binding_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'",
    );
    expect(retire).not.toContain(`update ${schemaName}.worker_registrations`);
    const bindingLock = retire.indexOf("perform binding.binding_version");
    const registrationLock = retire.indexOf(
      "perform registration.registration_digest",
    );
    const freshRetirementRead = retire.indexOf("select retirement.*");
    const replayReturn = retire.indexOf("'created', false");
    const bindingUpdate = retire.indexOf(
      `update ${schemaName}.admission_policy_bindings as binding`,
    );
    const retirementInsert = retire.indexOf(
      `insert into ${schemaName}.${retirementTable}`,
    );

    expect(bindingLock).toBeGreaterThanOrEqual(0);
    expect(registrationLock).toBeGreaterThan(bindingLock);
    expect(freshRetirementRead).toBeGreaterThan(registrationLock);
    expect(replayReturn).toBeGreaterThan(freshRetirementRead);
    expect(bindingUpdate).toBeGreaterThan(replayReturn);
    expect(retirementInsert).toBeGreaterThan(bindingUpdate);
  });

  it("installs exact retirement, active-binding and RUNNING-attempt triggers", () => {
    const normalized = normalizeSql(migration);

    expect(normalized).toContain(
      `create trigger worker_registration_retirements_append_only before update or delete on ${schemaName}.${retirementTable} for each row execute function ${schemaName}._deny_worker_registration_retirement_mutation();`,
    );
    expect(normalized).toContain(
      `create trigger admission_policy_bindings_active_registration_gate before insert or update of status, registration_digest on ${schemaName}.admission_policy_bindings for each row execute function ${schemaName}._enforce_active_binding_registration_accepts_new_work();`,
    );
    expect(normalized).toContain(
      `create trigger attempts_running_registration_gate before insert on ${schemaName}.attempts for each row when (new.status = 'RUNNING') execute function ${schemaName}._enforce_running_attempt_registration_accepts_new_work();`,
    );
    expect(migration).toContain(
      "Terminal recovery attempts remain insertable after retirement",
    );
    expect(normalized).not.toContain(
      `before insert or update on ${schemaName}.attempts`,
    );
    expect(normalized).not.toContain("when (new.status = 'FAILED')");
  });

  it("gates only new claim and new owner admission while preserving replay and recovery", () => {
    const claim = normalizeSql(functionBlock(claimRpc));
    const admission = normalizeSql(functionBlock(ownerAdmissionRpc));

    expect(functionBlock(claimRpc)).toMatch(/^create or replace function/m);
    expect(claim).toContain(
      `not ${schemaName}.${acceptsNewWorkHelper}( p_registration_digest )`,
    );
    expect(claim).toContain("message = 'POLICY_MISMATCH'");
    expect(claim.indexOf(acceptsNewWorkHelper)).toBeLessThan(
      claim.indexOf(`select job.*`),
    );
    expect(claim.indexOf(acceptsNewWorkHelper)).toBeLessThan(
      claim.indexOf(`insert into ${schemaName}.attempts`),
    );

    expect(functionBlock(ownerAdmissionRpc)).toMatch(
      /^create or replace function/m,
    );
    expect(admission).toContain(
      `not ${schemaName}.${acceptsNewWorkHelper}( v_binding_registration_digest )`,
    );
    expect(admission).toContain("message = 'PRODUCT_API_DISABLED'");
    const bindingPreLock = admission.indexOf(
      "select binding.registration_digest into v_binding_registration_digest",
    );
    const ownerGate = admission.indexOf(acceptsNewWorkHelper);
    const bindingDetailRead = admission.indexOf(
      "select binding.registration_digest, binding.activated_at",
      ownerGate,
    );

    expect(admission.indexOf("'created', false")).toBeLessThan(
      ownerGate,
    );
    expect(bindingPreLock).toBeGreaterThanOrEqual(0);
    expect(ownerGate).toBeGreaterThan(bindingPreLock);
    expect(bindingDetailRead).toBeGreaterThan(ownerGate);
    expect(admission.slice(bindingPreLock, ownerGate)).not.toContain(
      "binding.registration_digest = v_binding_registration_digest",
    );
    expect(admission.slice(bindingDetailRead)).toContain(
      "binding.registration_digest = v_binding_registration_digest",
    );
    expect(ownerGate).toBeLessThan(
      admission.indexOf(`insert into ${schemaName}.jobs`),
    );

    for (const rpc of unchangedWorkerRpcs) {
      expect(hasFunctionDefinition(rpc)).toBe(false);
    }
    for (const unchanged of [
      "_registration_is_valid",
      "get_v1_shadow_note_generation_job_status",
      "cancel_v1_shadow_note_generation_job",
    ]) {
      expect(hasFunctionDefinition(unchanged)).toBe(false);
    }
    expect(migration).toContain(
      "already-bound attempt drain within its frozen deadlines",
    );

    const historicalRecovery = normalizeSql(
      functionBlock(
        "recover_v1_shadow_note_generation_expired",
        workerRpcMigration,
      ),
    );
    const terminalAttemptInsert = historicalRecovery.match(
      new RegExp(
        `insert into ${schemaName}\\.attempts \\( [\\s\\S]*? \\) values \\( [\\s\\S]*? \\);`,
      ),
    )?.[0];
    expect(terminalAttemptInsert).toContain("'FAILED'");
  });

  it("ships the frozen rollback-only PostgreSQL 16 retirement gate", () => {
    const assertionHeader = assertions.slice(0, assertionBodyStart);
    const normalizedHeader = assertionHeader
      .replace(/^-- ?/gm, "")
      .replace(/\s+/g, " ")
      .trim();

    expect(assertionsPath).toBe(
      "supabase/assertions/v1_note_generation_registration_retirement_shadow_assertions.sql",
    );
    expect(Buffer.byteLength(assertions, "utf8")).toBe(50_987);
    expect(
      createHash("sha256").update(assertions, "utf8").digest("hex"),
    ).toBe("0a58b4b6731e48525af4b9eaf395cb4d20bebc4e77baea5c0207b9e2c92f7cbc");
    for (const marker of [
      "Manual rollback-only assertions for a fresh disposable PostgreSQL 16+",
      "after every repository migration has been applied",
      "BEGIN through ROLLBACK",
      "TEST_ONLY fixtures",
      "Production must never be the SQL target",
      "does not claim to exercise the separate two-connection claim/retirement race",
    ]) {
      expect(normalizedHeader).toContain(marker);
    }

    expect(assertionBodyStart).toBeGreaterThanOrEqual(0);
    expect(assertionBody.startsWith("begin;\n")).toBe(true);
    expect(assertionBody.endsWith("rollback;\n")).toBe(true);
    expect(assertionBody).not.toMatch(/^commit\s*;/im);
    expect(Buffer.byteLength(assertionBody, "utf8")).toBe(50_584);
    expect(
      createHash("sha256").update(assertionBody, "utf8").digest("hex"),
    ).toBe("3c9b1d9cfd0919bdf1213d3272923261cc9399cc88fcdd85e46469c8e026440f");

    for (const marker of [
      "registration-retirement shadow requires PostgreSQL 16 or newer",
      "registration-control executor attributes are unsafe",
      "registration-control executor membership is unsafe",
      "retirement ledger ownership or forced RLS drifted",
      "retirement ledger column shape drifted",
      "retirement ledger constraint posture drifted",
      "registration binding lock index drifted",
      "registration-control schema ACL drifted",
      "registration-control table ACL drifted",
      "registration-control column ACL drifted",
      "registration-control private type privilege leaked",
      "Data API retirement surface leaked to %",
      "runtime executor retirement-ledger ACL drifted",
      "registration-retirement function identity drifted",
      "registration-retirement function posture drifted",
      "retirement function execute ACL drifted: % => %",
      "denied role can execute retirement RPC: %",
      "public registration-retirement wrapper exists",
      "registration-retirement RLS policy set drifted",
      "retirement append-only trigger drifted",
      "ACTIVE binding registration gate drifted",
      "RUNNING-only attempt registration gate drifted",
      "retirement ledger is not empty by default",
      "retirement reason constraint failed open",
      "approved unretired registration rejected new work",
      "unsorted retirement expectation was accepted",
      "inexact ACTIVE binding expectation was accepted",
      "exact retirement durable row set drifted",
      "retirement replay acknowledgement drifted: %",
      "conflicting retirement operation was accepted",
      "retired registration still accepts new work",
      "empty-queue retired claim did not return POLICY_MISMATCH",
      "append-only retirement ledger failed open",
      "retired registration ACTIVE-binding gate failed open",
      "retired registration received a RUNNING attempt",
      "terminal FAILED attempt was not preserved",
    ]) {
      expect(assertionBody).toContain(marker);
    }
  });

  it("keeps every new function private and closes CREATE after installation", () => {
    const normalized = normalizeSql(migration);

    expect(normalized).toContain(
      `grant execute on function ${schemaName}.${acceptsNewWorkHelper}(text) to ${workerRole}, ${ownerApiRole};`,
    );
    expect(normalized).toContain(
      `revoke all on function ${schemaName}.${retirementRpc}( text, uuid, text, text[] ) from public, anon, authenticated, service_role, ${ownerRole}, ${workerRole}, ${ownerApiRole};`,
    );
    expect(normalized).toContain(
      `revoke create on schema ${schemaName} from ${controlRole}, ${workerRole}, ${ownerApiRole};`,
    );
    expect(normalized).toMatch(
      new RegExp(
        `revoke ${controlRole} from current_user granted by current_user; revoke ${ownerApiRole} from current_user granted by current_user; revoke ${workerRole} from current_user granted by current_user; revoke ${ownerRole} from current_user granted by current_user;$`,
      ),
    );
  });
});

function functionStart(name: string, source = migration): number {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.search(
    new RegExp(
      `^\\s*create(?:\\s+or\\s+replace)?\\s+function\\s+${schemaName.replace(".", "\\.")}\\.${escapedName}\\s*\\(`,
      "im",
    ),
  );
}

function hasFunctionDefinition(name: string): boolean {
  return functionStart(name) >= 0;
}

function functionBlock(name: string, source = migration): string {
  const start = functionStart(name, source);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + "\n$$;".length).trimStart();
}

function functionIdentityArguments(name: string): string {
  const block = functionBlock(name);
  const start = block.indexOf("(");
  const end = block.indexOf(")\nreturns", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return block
    .slice(start + 1, end)
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
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

function withoutDollarQuotedBodies(value: string): string {
  return value.replace(/\$\$[\s\S]*?\$\$/g, "$$BODY$$");
}
