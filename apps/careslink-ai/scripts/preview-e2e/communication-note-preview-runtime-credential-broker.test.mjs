import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SETUP_PATH =
  "scripts/preview-e2e/communication-note-preview-runtime-credential-broker-setup.sql";
const CLEANUP_PATH =
  "scripts/preview-e2e/communication-note-preview-runtime-credential-broker-cleanup.sql";
const POSTCHECK_PATH =
  "scripts/preview-e2e/communication-note-preview-runtime-credential-broker-postcheck.sql";
const LOCAL_PG16_PATH =
  "scripts/preview-e2e/communication-note-preview-runtime-credential-broker-local-pg16.mjs";
const FORMAL_MIGRATION_PATH =
  "supabase/migrations/20260830065750_add_communication_note_preview_runtime_credential_broker.sql";

const setup = readFileSync(join(ROOT, SETUP_PATH), "utf8");
const cleanup = readFileSync(join(ROOT, CLEANUP_PATH), "utf8");
const postcheck = readFileSync(join(ROOT, POSTCHECK_PATH), "utf8");
const localPg16 = readFileSync(join(ROOT, LOCAL_PG16_PATH), "utf8");
const formalMigration = readFileSync(join(ROOT, FORMAL_MIGRATION_PATH), "utf8");
const setupCode = normalizeSql(setup);
const cleanupCode = normalizeSql(cleanup);
const postcheckCode = normalizeSql(postcheck);

const API_ROLES = [
  "public",
  "anon",
  "authenticated",
  "service_role",
  "authenticator",
];

describe("Communication Note TEST_ONLY runtime credential broker SQL", () => {
  it("remains a historical isolated harness beside the formal 40th migration", () => {
    const migrationNames = readdirSync(join(ROOT, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(migrationNames).toHaveLength(41);
    expect(migrationNames.every((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)))
      .toBe(true);
    expect(migrationNames.at(-2)).toBe(
      "20260830065750_add_communication_note_preview_runtime_credential_broker.sql",
    );
    expect(migrationNames.at(-1)).toBe(
      "20260902012628_add_v1_authenticated_current_session_status_rpc.sql",
    );
    expect(migrationNames).not.toContain(
      SETUP_PATH.split("/").at(-1),
    );
    expect(migrationNames).not.toContain(
      CLEANUP_PATH.split("/").at(-1),
    );
    expect(migrationNames).not.toContain(
      POSTCHECK_PATH.split("/").at(-1),
    );
    for (const source of [setup, cleanup, postcheck]) {
      expect(source).toContain("TEST_ONLY");
    }
    expect(setup).toContain("not a Supabase\n-- migration");
    expect(setup).toContain("not a product credential service");
    expect(formalMigration).toContain(
      "Communication Note Preview durable runtime-credential broker and terminal fence",
    );
    expect(formalMigration).toContain(
      "create schema careslink_v1_runtime_broker authorization postgres",
    );
    expect(formalMigration).not.toContain(
      "create schema careslink_test_only_runtime_broker",
    );
  });

  it("permits only the monotonic reserved-to-revoked state graph", () => {
    const table = sqlBetween(
      setupCode,
      "create table careslink_test_only_runtime_broker.acquisitions",
      "alter table careslink_test_only_runtime_broker.acquisitions enable row level security",
    );
    const transition = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker._guard_transition()",
    );

    for (const state of [
      "reserved",
      "issued_unbound",
      "active",
      "tombstoned",
      "revoked",
    ]) {
      expect(table).toContain(`state = '${state}'`);
    }
    for (const edge of [
      "old.state = 'reserved' and new.state = 'issued_unbound'",
      "old.state = 'issued_unbound' and new.state = 'active'",
      "old.state in ('reserved', 'issued_unbound', 'active') and new.state = 'tombstoned'",
      "old.state = 'tombstoned' and new.state = 'revoked'",
    ]) {
      expect(transition).toContain(edge);
    }
    expect(transition).toContain("old.revoked_at is not null and new is distinct from old");
    expect(transition).toContain("test_only_runtime_broker_transition_denied");
    expect(transition).not.toMatch(
      /old\.state\s*=\s*'(?:tombstoned|revoked)'\s+and\s+new\.state\s*=\s*'(?:reserved|issued_unbound|active)'/,
    );
    expect(setupCode).toContain(
      "before update or delete on careslink_test_only_runtime_broker.acquisitions",
    );
    expect(setupCode).toContain(
      "before truncate on careslink_test_only_runtime_broker.acquisitions",
    );
    expect(setupCode).toContain("test_only_runtime_broker_delete_denied");
    expect(setupCode).toContain("test_only_runtime_broker_truncate_denied");
  });

  it("serializes acquire, bind, tombstone and finalize on one digest fence", () => {
    for (const functionName of ["acquire", "bind", "tombstone", "finalize"]) {
      const body = functionBody(
        setupCode,
        `careslink_test_only_runtime_broker.${functionName}(`,
      );
      expect(body).toMatch(
        /pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(p_acquisition_digest,\s*836492741\)\s*\)/,
      );
      expect(body).toContain("for update");
    }

    const acquire = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker.acquire(",
    );
    expect(acquire).toContain("state in ('tombstoned', 'revoked')");
    expect(acquire).toContain("v_existing.future_issuance_blocked");
    expect(acquire).toContain("test_only_runtime_broker_acquire_tombstoned");
    expect(acquire).toContain("already_issued_requires_revoke");
    expect(acquire).toContain("test_only_runtime_broker_acquire_conflict");
    expect(acquire).not.toMatch(
      /return pg_catalog\.jsonb_build_object\(\s*raise exception/,
    );
    expect(acquire.indexOf("test_only_runtime_broker_acquire_tombstoned"))
      .toBeLessThan(acquire.indexOf("insert into careslink_test_only_runtime_broker.acquisitions"));

    const tombstone = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker.tombstone(",
    );
    expect(tombstone).toContain("tombstone_transaction_id");
    expect(tombstone).toContain("future_issuance_blocked");
    expect(tombstone).toContain("'tombstoned'");
    expect(tombstone).toContain("alter role %i with nologin valid until %l");
    expect(tombstone).toContain("role_record.oid = v_acquisition.runtime_role_oid");
    expect(tombstone).toContain("role_record.rolname = v_acquisition.runtime_role");
    expect(tombstone.indexOf("pg_advisory_xact_lock"))
      .toBeLessThan(tombstone.indexOf("v_now := pg_catalog.date_trunc"));
    expect(tombstone.indexOf("alter role %i with nologin"))
      .toBeLessThan(tombstone.indexOf("set state = 'tombstoned'"));
  });

  it("commits the tombstone before a separate finalize transaction", () => {
    expect(cleanupCode).toMatch(
      /^\\set on_error_stop on begin; do \$careslink_test_only_runtime_broker_cleanup_guard\$[\s\S]*select careslink_test_only_runtime_broker\.tombstone\([\s\S]*\) as durable_tombstone; commit; begin; select careslink_test_only_runtime_broker\.finalize\([\s\S]*\) as release_receipt; commit;$/,
    );
    expect(countMatches(cleanup, /^begin;$/gm)).toBe(2);
    expect(countMatches(cleanup, /^commit;$/gm)).toBe(2);
    expect(cleanupCode.indexOf("as durable_tombstone")).toBeLessThan(
      cleanupCode.indexOf("commit; begin;"),
    );
    expect(cleanupCode.indexOf("commit; begin;")).toBeLessThan(
      cleanupCode.indexOf("as release_receipt"),
    );

    const finalize = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker.finalize(",
    );
    expect(finalize).toContain(
      "v_acquisition.tombstone_transaction_id = pg_catalog.pg_current_xact_id()::pg_catalog.text",
    );
    expect(finalize).toContain(
      "test_only_runtime_broker_tombstone_not_durable",
    );
    expect(finalize).not.toContain("alter role %i with nologin");
    expect(finalize).toContain("test_only_runtime_broker_login_fence_missing");
  });

  it("never stores or returns a raw password, verifier, DSN or URL", () => {
    const table = sqlBetween(
      setupCode,
      "create table careslink_test_only_runtime_broker.acquisitions",
      "alter table careslink_test_only_runtime_broker.acquisitions enable row level security",
    );
    const inspect = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker.inspect(",
    );
    const credentialColumn =
      /\b(?:password|runtime_password|scram_verifier|credential_verifier|dsn|connection_string|database_url)\s+pg_catalog\./;

    expect(table).not.toMatch(credentialColumn);
    expect(table).toContain("credential_verifier_sha256 pg_catalog.text unique");
    expect(table).toContain(
      "raw_credential_material_present pg_catalog.bool not null default false",
    );
    expect(inspect).not.toMatch(/'scramverifier'|'credentialverifier'|'password'|'dsn'|'connectionstring'|'databaseurl'/);
    expect(setupCode).toContain(
      "'credentialverifiersha256', p_credential_verifier_sha256",
    );
    expect(setupCode).not.toMatch(
      /current_setting\([^)]*(?:password|scram|dsn|connection|database_url)/,
    );
    expect(setupCode).not.toMatch(
      /set_config\([^)]*(?:password|scram|dsn|connection|database_url)/,
    );
    expect(postcheckCode).toContain("test_only_runtime_broker_raw_credential_column");
    for (const forbiddenColumn of [
      "'password'",
      "'runtime_password'",
      "'scram_verifier'",
      "'dsn'",
      "'connection_string'",
      "'database_url'",
    ]) {
      expect(postcheckCode).toContain(forbiddenColumn);
    }
  });

  it("uses the SCRAM verifier only for the intended runtime role DDL", () => {
    const acquire = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker.acquire(",
    );
    expect(acquire).toMatch(
      /execute pg_catalog\.format\( 'create role %i with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 1 password %l valid until %l', p_runtime_role, p_scram_verifier, v_expires_at_text \);/,
    );
    expect(acquire).toContain("p_scram_verifier := null");
    expect(acquire.indexOf("password %l valid until %l")).toBeLessThan(
      acquire.indexOf("p_scram_verifier := null"),
    );
    expect(acquire).toContain(
      "credential_verifier_sha256 = p_credential_verifier_sha256",
    );
    expect(countMatches(acquire, /'sessionbindingsha256'/g)).toBe(1);
    expect(countMatches(acquire, /set search_path = ''/g)).toBe(1);
    expect(acquire).not.toMatch(/\bcredential_verifier\s*=\s*p_scram_verifier\b/);
  });

  it("denies every API role all schema, relation, sequence and function capability", () => {
    for (const role of API_ROLES) {
      expect(setupCode).toMatch(
        new RegExp(
          `revoke all on schema careslink_test_only_runtime_broker from[\\s\\S]{0,100}\\b${role}\\b`,
        ),
      );
      expect(setupCode).not.toMatch(
        new RegExp(`grant[^;]+(?:to|, )\\s*${role}\\b`),
      );
      if (role === "public") {
        expect(postcheckCode).toContain(
          "public_acl.grantee = 0::pg_catalog.oid",
        );
      } else {
        expect(postcheckCode).toContain(`'${role}'`);
      }
    }
    for (const objectClass of ["functions", "tables", "sequences"]) {
      expect(setupCode).toMatch(
        new RegExp(
          `revoke all on all ${objectClass} in schema careslink_test_only_runtime_broker from public, anon, authenticated, service_role, authenticator`,
        ),
      );
    }
    expect(setupCode).toContain("security invoker");
    expect(countMatches(setupCode, /create function careslink_test_only_runtime_broker\./g))
      .toBe(countMatches(setupCode, /security invoker/g));
    expect(countMatches(setupCode, /create function careslink_test_only_runtime_broker\./g))
      .toBe(countMatches(setupCode, /set search_path = ''/g));
    expect(postcheckCode).toContain("procedure.prosecdef");
    expect(postcheckCode).toContain("has_schema_privilege");
    expect(postcheckCode).toContain("has_table_privilege");
    expect(postcheckCode).toContain("has_any_column_privilege");
    expect(postcheckCode).toContain("has_sequence_privilege");
    expect(postcheckCode).toContain("has_function_privilege");
    expect(postcheckCode).toContain("pg_catalog.aclexplode");
    for (const publicObjectType of ["n", "r", "s", "f"]) {
      expect(postcheckCode).toMatch(
        new RegExp(
          `pg_catalog\\.acldefault\\(\\s*'${publicObjectType}'::pg_catalog\\.\"char\"`,
        ),
      );
    }
    expect(postcheckCode).toContain("test_only_runtime_broker_api_membership_leak");
  });

  it("commits NOLOGIN in tombstone, then verifies, terminates, revokes and drops", () => {
    const tombstone = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker.tombstone(",
    );
    const finalize = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker.finalize(",
    );
    const noLogin = tombstone.indexOf("alter role %i with nologin");
    const fenceProof = finalize.indexOf("v_role_can_login");
    const terminate = finalize.indexOf("pg_terminate_backend");
    const revoke = finalize.indexOf(
      "revoke careslink_v1_preview_runner_terminal_caller from %i",
    );
    const drop = finalize.indexOf("drop role %i");

    expect(noLogin).toBeGreaterThan(-1);
    expect(fenceProof).toBeGreaterThan(-1);
    expect(terminate).toBeGreaterThan(fenceProof);
    expect(revoke).toBeGreaterThan(terminate);
    expect(drop).toBeGreaterThan(revoke);
    expect(finalize).toContain("test_only_runtime_broker_terminate_failed");
    expect(finalize).toContain("test_only_runtime_broker_session_remains");
    expect(finalize).toContain("test_only_runtime_broker_membership_drift");
    expect(finalize).toContain("test_only_runtime_broker_zero_residue_failed");
    expect(finalize).toContain("role_record.oid = v_acquisition.runtime_role_oid");
    expect(finalize).toContain("role_record.rolname = v_acquisition.runtime_role");
    expect(finalize).toContain("'destroyed'");
    expect(finalize).toContain("'revoked'");
    expect(finalize).toContain("'not_acquired'");
    expect(finalize).toContain("'not_issued'");
  });

  it("reattests an ACTIVE bind replay against PID, start, role and application", () => {
    const bind = functionBody(
      setupCode,
      "careslink_test_only_runtime_broker.bind(",
    );
    const activityProof = bind.indexOf("select activity.backend_start");
    const replay = bind.indexOf("if v_acquisition.state = 'active'");

    expect(activityProof).toBeGreaterThan(-1);
    expect(replay).toBeGreaterThan(activityProof);
    expect(bind).toContain("activity.pid = p_backend_pid");
    expect(bind).toContain("activity.usesysid = v_acquisition.runtime_role_oid");
    expect(bind).toContain(
      "activity.application_name = 'careslink-preview-runtime-credential-broker-runtime'",
    );
    expect(bind).toContain("activity.state = 'idle'");
    expect(bind).toContain("role_record.rolcanlogin");
    expect(bind).toContain("role_record.rolvaliduntil = v_acquisition.expires_at");
    expect(bind).toContain(
      "v_acquisition.bound_backend_start = v_backend_start",
    );
  });

  it("models wrong binding and late reconnect rejection after durable tombstone", () => {
    expect(localPg16).toContain("normal-bind-replay");
    expect(localPg16).toContain(
      "TEST_ONLY_RUNTIME_BROKER_BIND_SESSION_INVALID",
    );
    expect(localPg16).toContain(
      "careslink-preview-runtime-credential-broker-runtime-wrong",
    );
    expect(localPg16).toContain("response-loss-durable-tombstone");
    expect(localPg16).toContain("response-loss-login-fence");
    expect(localPg16).toContain("not role_record.rolcanlogin");
    expect(localPg16).toContain("from pg_catalog.pg_locks as lock_record");
    expect(localPg16).toContain("not lock_record.granted");
    expect(localPg16).toContain("late-acquire-fence");
    expect(localPg16).toContain('"database-connect"');
    expect(localPg16).not.toMatch(/PGPASSWORD|PGPASSFILE|runtime_password/i);
  });

  it("independently proves the retained tombstone and zero runtime residue", () => {
    expect(postcheckCode.startsWith("\\set on_error_stop on begin;")).toBe(true);
    expect(postcheckCode.endsWith("rollback;")).toBe(true);
    for (const marker of [
      "test_only_runtime_broker_ledger_posture_invalid",
      "test_only_runtime_broker_tombstone_invalid",
      "test_only_runtime_broker_runtime_residue",
      "test_only_runtime_broker_login_role_remains",
      "test_only_runtime_broker_function_posture_invalid",
      "test_only_runtime_broker_inspect_fence_failed",
    ]) {
      expect(postcheckCode).toContain(marker);
    }
    expect(postcheckCode).toContain("v_acquisition.state <> 'revoked'");
    expect(postcheckCode).toContain("not v_acquisition.future_issuance_blocked");
    expect(postcheckCode).toContain(
      "role_record.oid = v_acquisition.runtime_role_oid",
    );
    expect(postcheckCode).toContain(
      "role_record.rolname = v_acquisition.runtime_role",
    );
    expect(postcheckCode).toContain("from pg_catalog.pg_auth_members as membership");
    expect(postcheckCode).toContain("from pg_catalog.pg_stat_activity as activity");
    expect(postcheckCode).toContain(
      "^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$",
    );
    expect(postcheckCode).toContain(
      "careslink_test_only_runtime_broker.inspect(v_acquisition_digest)",
    );
    expect(postcheckCode).toContain("->> 'futureissuanceblocked'");
  });
});

function normalizeSql(source) {
  return source
    .replace(/--[^\n]*(?:\n|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sqlBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function functionBody(source, signatureStart) {
  const start = source.indexOf(`create function ${signatureStart}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("$test_only_runtime_broker$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
