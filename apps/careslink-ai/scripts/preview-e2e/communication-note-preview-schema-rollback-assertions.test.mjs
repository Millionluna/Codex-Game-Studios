import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES as ERRORS,
  COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_POLICY as POLICY,
  COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_STAGE_CODES as STAGES,
  CommunicationNotePreviewSchemaRollbackAssertionError,
  assertCommunicationNotePreviewAssertionTls,
  classifyCommunicationNotePreviewRollbackAssertionMessage,
  connectCommunicationNotePreviewAssertionAdmin,
  formatCommunicationNotePreviewSchemaRollbackAssertionFailure,
  loadCommunicationNotePreviewRollbackAssertions,
  normalizeCommunicationNotePreviewRollbackAssertionSql,
  readCommunicationNotePreviewPinnedCa,
  runCommunicationNotePreviewSchemaRollbackAssertions,
} from "./communication-note-preview-schema-rollback-assertions.mjs";

const SECRET = "sentinel-password-never-output";
const BRANCH_REF = "abcdefghijklmnopqrst";
const CA = "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n";
const RUNNER_URL = new URL(
  "./communication-note-preview-schema-rollback-assertions.mjs",
  import.meta.url,
);
const PRODUCTION_REF = "adocsnwnslxhxcjgbyee";
const EXPECTED_ASSERTION_STAGE_MAPPING = Object.freeze([
  ["A01", "communication_note_preview_custody_callers_shadow_assertions.sql"],
  ["A02", "communication_note_preview_execution_authority_shadow_assertions.sql"],
  ["A03", "communication_note_preview_runner_terminal_shadow_assertions.sql"],
  ["A04", "v1_note_generation_durable_foundation_assertions.sql"],
  ["A05", "v1_note_generation_owner_runtime_rpc_shadow_assertions.sql"],
  ["A06", "v1_note_generation_registration_retirement_shadow_assertions.sql"],
  ["A07", "v1_note_generation_worker_rpc_shadow_assertions.sql"],
  ["A08", "migration_entry_role_restore_assertions.sql"],
  ["A09", "portal_referral_assignment_runtime_assertions.sql"],
  ["A10", "portal_referral_follow_up_runtime_assertions.sql"],
  ["A11", "portal_referral_intake_runtime_assertions.sql"],
  ["A12", "portal_referral_provider_response_runtime_assertions.sql"],
  ["A13", "portal_referral_source_detail_runtime_assertions.sql"],
  ["A14", "portal_referral_workflow_foundation_assertions.sql"],
  ["A15", "v1_mobile_sync_shadow_assertions.sql"],
  ["A16", "v1_ndis_shadow_integration_assertions.sql"],
  ["A17", "v1_privacy_review_shadow_assertions.sql"],
  ["A18", "v1_shadow_contract_assertions.sql"],
  ["A19", "v1_authenticated_current_session_status_assertions.sql"],
  ["A20", "v1_communication_note_points_preview_assertions.sql"],
]);

function candidates() {
  return Object.freeze({
    direct: Object.freeze({
      mode: "direct",
      host: `db.${BRANCH_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: SECRET,
    }),
    sessionPooler: Object.freeze({
      mode: "session_pooler",
      host: "aws-0-ap-southeast-2.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      user: `postgres.${BRANCH_REF}`,
      password: SECRET,
    }),
  });
}

function disposableEnvelope(overrides = {}) {
  const metadata = {
    ref: BRANCH_REF,
    parent_project_ref: PRODUCTION_REF,
    is_default: false,
    persistent: false,
    with_data: false,
    status: "ACTIVE_HEALTHY",
    ...(overrides.metadata ?? {}),
  };
  const credentials = {
    REF: BRANCH_REF,
    STATUS: "ACTIVE_HEALTHY",
    POSTGRES_URL_NON_POOLING:
      `postgresql://postgres:${SECRET}@db.${BRANCH_REF}.supabase.co:5432/postgres?sslmode=require`,
    POSTGRES_URL:
      `postgresql://postgres.${BRANCH_REF}:${SECRET}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?connect_timeout=10`,
    ...(overrides.credentials ?? {}),
  };
  return JSON.stringify({ metadata, credentials });
}

function runRollbackCli(input) {
  return spawnSync(
    process.execPath,
    [
      fileURLToPath(RUNNER_URL),
      `--expected-branch-ref=${BRANCH_REF}`,
      "--expected-pg-major=17",
      `--ssl-root-cert-path=/private/${SECRET}.pem`,
      `--expected-ssl-root-cert-sha256=${"0".repeat(64)}`,
    ],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "" },
      input,
    },
  );
}

function fakeClientClass(behaviors) {
  const configs = [];
  const instances = [];
  class FakeClient {
    constructor(config) {
      this.config = config;
      this.behavior = behaviors[instances.length] ?? {};
      this.connection = {
        stream: this.behavior.stream ?? {
          encrypted: true,
          authorized: true,
          authorizationError: null,
        },
      };
      this.closed = false;
      configs.push(config);
      instances.push(this);
    }

    async connect() {
      if (this.behavior.connectError) throw this.behavior.connectError;
    }

    async end() {
      this.closed = true;
    }
  }
  return { FakeClient, configs, instances };
}

function rollbackBundleWithMigrationEntryRole() {
  return Object.freeze({
    fileCount: 20,
    manifestSha256: POLICY.manifestSha256,
    scripts: Object.freeze(Array.from({ length: 20 }, (_, index) =>
      Object.freeze({
        stage: STAGES.assertions[index],
        sql: `ASSERTION_SCRIPT_${index}`,
        migrationEntryRole: index === 7,
      }))),
  });
}

function createAssertionCommitLossClient({ reconnectFails = false } = {}) {
  const state = {
    transportPresent: false,
    actorPresent: false,
    transportCanLogin: false,
  };
  const instances = [];
  const reconnectEvents = [];
  class FakeClient {
    constructor(config) {
      this.config = config;
      this.instanceIndex = instances.length;
      this.commitResponseLost = false;
      this.damaged = false;
      this.connection = {
        stream: {
          encrypted: true,
          authorized: true,
          authorizationError: null,
        },
      };
      instances.push(this);
    }

    on() {
      return this;
    }

    async connect() {
      if (this.instanceIndex === 1 && reconnectFails) {
        throw Object.assign(new Error("fixed reconnect failure"), {
          code: "28P01",
        });
      }
    }

    async end() {}

    async query(query) {
      const sql = typeof query === "string" ? query : query.text;
      const normalized = sql.trim().toLowerCase();
      if (this.instanceIndex === 0) {
        if (this.damaged) {
          throw Object.assign(new Error("fixed damaged admin"), {
            code: "ECONNRESET",
          });
        }
        if (this.commitResponseLost && normalized === "rollback") {
          this.commitResponseLost = false;
          this.damaged = true;
          return { rowCount: null, rows: [] };
        }
        if (
          normalized === "commit" &&
          !state.transportPresent &&
          !state.actorPresent
        ) {
          state.transportPresent = true;
          state.actorPresent = true;
          state.transportCanLogin = true;
          this.commitResponseLost = true;
          throw Object.assign(new Error("fixed commit response loss"), {
            code: "ECONNRESET",
          });
        }
      }

      if (this.instanceIndex === 1) {
        if (normalized === "set statement_timeout = '120s'") {
          reconnectEvents.push("statement_timeout");
        } else if (normalized === "set lock_timeout = '3s'") {
          reconnectEvents.push("lock_timeout");
        } else if (
          normalized === "set idle_in_transaction_session_timeout = '135s'"
        ) {
          reconnectEvents.push("idle_in_transaction_session_timeout");
        } else if (sql.includes("database_ok")) {
          reconnectEvents.push("target");
        } else if (sql.includes("transport_present")) {
          reconnectEvents.push("cleanup_presence");
        } else if (
          sql.includes("SCHEMA_ROLLBACK_ASSERTION_ROLE_CLEANUP_FAILED") &&
          sql.includes("drop role %I")
        ) {
          reconnectEvents.push("cleanup");
        }
      }

      if (sql.includes("database_ok")) {
        return {
          rowCount: 1,
          rows: [{
            database_ok: true,
            base_identity_ok: true,
            application_name_ok: true,
            postgres_major_ok: true,
            row_security_ok: true,
            ssl_ok: true,
          }],
        };
      }
      if (sql.includes("authorizations_zero")) {
        return {
          rowCount: 1,
          rows: [{
            authorizations_zero: true,
            revocations_zero: true,
            claims_zero: true,
            reservations_zero: true,
            receipts_zero: true,
            runner_terminals_zero: true,
            point_admissions_zero: true,
          }],
        };
      }
      if (sql.includes("where rolname like")) {
        return { rowCount: 1, rows: [{ absent: true }] };
      }
      if (normalized === "select current_user, session_user") {
        return {
          rowCount: 1,
          rows: [{ current_user: "postgres", session_user: "postgres" }],
        };
      }
      if (sql.includes("as role_oid")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("current_user_ok")) {
        return {
          rowCount: 1,
          rows: [{
            current_user_ok: true,
            session_user_ok: true,
            isolation_ok: true,
          }],
        };
      }
      if (sql.includes("transport_present")) {
        return {
          rowCount: 1,
          rows: [{
            transport_present: state.transportPresent,
            actor_present: state.actorPresent,
          }],
        };
      }
      if (sql.includes("alter role %I nologin")) {
        state.transportCanLogin = false;
      }
      if (sql.includes("select pid, state, application_name")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("as absent") && sql.includes("pg_stat_activity")) {
        return { rowCount: 1, rows: [{ absent: true }] };
      }
      if (
        sql.includes("SCHEMA_ROLLBACK_ASSERTION_ROLE_CLEANUP_FAILED") &&
        sql.includes("drop role %I")
      ) {
        state.transportPresent = false;
        state.actorPresent = false;
      }
      if (sql.includes("careslink_migration_restore_test_owner")) {
        return {
          rowCount: 1,
          rows: [{
            absent: !state.transportPresent && !state.actorPresent,
          }],
        };
      }
      return { rowCount: 1, rows: [{}] };
    }
  }
  return { FakeClient, instances, reconnectEvents, state };
}

function createAssertionCleanupReconnectSuccessClient({
  assertionFailureIndex = null,
  rollbackFailure = false,
  transportConnectionFailure = false,
  transportTimeoutFailure = false,
} = {}) {
  const state = {
    transportPresent: false,
    actorPresent: false,
    transportCanLogin: false,
  };
  const instances = [];
  const reconnectEvents = [];
  let originalAdminPresenceChecks = 0;
  class FakeClient {
    constructor(config) {
      this.config = config;
      this.instanceIndex = instances.length;
      this.isTransport = config.user.startsWith(
        "careslink_m1gh_assert_transport_",
      );
      this.damaged = false;
      this.connection = {
        stream: {
          encrypted: true,
          authorized: true,
          authorizationError: null,
        },
      };
      instances.push(this);
    }

    on() {
      return this;
    }

    async connect() {
      if (transportConnectionFailure && this.isTransport) {
        throw Object.assign(
          new Error(`${SECRET}: transport driver message`),
          {
            code: "28P01",
            branchJson: `{\"password\":\"${SECRET}\"}`,
          },
        );
      }
    }

    async end() {}

    async query(query) {
      const sql = typeof query === "string" ? query : query.text;
      const normalized = sql.trim().toLowerCase();
      if (this.damaged) {
        throw Object.assign(new Error("fixed damaged admin"), {
          code: "ECONNRESET",
        });
      }

      if (
        transportTimeoutFailure &&
        this.isTransport &&
        normalized === "set statement_timeout = '120s'"
      ) {
        throw Object.assign(
          new Error(`${SECRET}: transport timeout driver message`),
          { code: "57014" },
        );
      }

      if (
        assertionFailureIndex !== null &&
        sql === `ASSERTION_SCRIPT_${assertionFailureIndex}`
      ) {
        throw Object.assign(
          new Error(`${SECRET}: assertion driver message`),
          {
            code: "XX000",
            path: "/private/assertion/path-never-output.sql",
            query: sql,
          },
        );
      }
      if (rollbackFailure && normalized === "rollback") {
        throw Object.assign(
          new Error(`${SECRET}: rollback driver message`),
          { code: "08006" },
        );
      }

      if (this.instanceIndex === 2) {
        if (normalized === "set statement_timeout = '120s'") {
          reconnectEvents.push("statement_timeout");
        } else if (normalized === "set lock_timeout = '3s'") {
          reconnectEvents.push("lock_timeout");
        } else if (
          normalized === "set idle_in_transaction_session_timeout = '135s'"
        ) {
          reconnectEvents.push("idle_in_transaction_session_timeout");
        } else if (sql.includes("database_ok")) {
          reconnectEvents.push("target");
        } else if (sql.includes("transport_present")) {
          reconnectEvents.push("cleanup_presence");
        } else if (
          sql.includes("SCHEMA_ROLLBACK_ASSERTION_ROLE_CLEANUP_FAILED") &&
          sql.includes("drop role %I")
        ) {
          reconnectEvents.push("cleanup");
        } else if (sql.startsWith("ASSERTION_SCRIPT_")) {
          reconnectEvents.push("continued_assertion");
        }
      }

      if (sql.includes("database_ok")) {
        return {
          rowCount: 1,
          rows: [{
            database_ok: true,
            base_identity_ok: true,
            application_name_ok: true,
            postgres_major_ok: true,
            row_security_ok: true,
            ssl_ok: true,
          }],
        };
      }
      if (sql.includes("authorizations_zero")) {
        return {
          rowCount: 1,
          rows: [{
            authorizations_zero: true,
            revocations_zero: true,
            claims_zero: true,
            reservations_zero: true,
            receipts_zero: true,
            runner_terminals_zero: true,
            point_admissions_zero: true,
          }],
        };
      }
      if (sql.includes("where rolname like")) {
        return { rowCount: 1, rows: [{ absent: true }] };
      }
      if (normalized === "select current_user, session_user") {
        return {
          rowCount: 1,
          rows: [{ current_user: "postgres", session_user: "postgres" }],
        };
      }
      if (sql.includes("as role_oid")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("current_user_ok")) {
        return {
          rowCount: 1,
          rows: [{
            current_user_ok: true,
            session_user_ok: true,
            isolation_ok: true,
          }],
        };
      }
      if (
        sql.includes("SCHEMA_ROLLBACK_ASSERTION_ROLE_SETUP_FAILED") &&
        sql.includes("create role %I")
      ) {
        state.transportPresent = true;
        state.actorPresent = true;
        state.transportCanLogin = true;
      }
      if (sql.includes("as transport_ok")) {
        return {
          rowCount: 1,
          rows: [{
            transport_ok: true,
            actor_ok: true,
            membership_ok: true,
          }],
        };
      }
      if (sql.includes("transport_present")) {
        if (this.instanceIndex === 0) {
          originalAdminPresenceChecks += 1;
          if (originalAdminPresenceChecks === 2) {
            this.damaged = true;
            throw Object.assign(new Error("fixed cleanup connection loss"), {
              code: "ECONNRESET",
            });
          }
        }
        return {
          rowCount: 1,
          rows: [{
            transport_present: state.transportPresent,
            actor_present: state.actorPresent,
          }],
        };
      }
      if (sql.includes("alter role %I nologin")) {
        state.transportCanLogin = false;
      }
      if (sql.includes("select pid, state, application_name")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("as absent") && sql.includes("pg_stat_activity")) {
        return { rowCount: 1, rows: [{ absent: true }] };
      }
      if (
        sql.includes("SCHEMA_ROLLBACK_ASSERTION_ROLE_CLEANUP_FAILED") &&
        sql.includes("drop role %I")
      ) {
        state.transportPresent = false;
        state.actorPresent = false;
      }
      if (sql.includes("careslink_migration_restore_test_owner")) {
        return {
          rowCount: 1,
          rows: [{
            absent: !state.transportPresent && !state.actorPresent,
          }],
        };
      }
      return { rowCount: 1, rows: [{}] };
    }
  }
  return { FakeClient, instances, reconnectEvents, state };
}

function expectFixedCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(
      CommunicationNotePreviewSchemaRollbackAssertionError,
    );
    expect(error).toMatchObject({ code, message: code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

function runAssertionsWithClient(Client) {
  return runCommunicationNotePreviewSchemaRollbackAssertions({
    Client,
    connectionCandidates: candidates(),
    sslRootCertificate: CA,
    expectedBranchRef: BRANCH_REF,
    expectedPostgresMajor: 17,
    assertionBundle: rollbackBundleWithMigrationEntryRole(),
    roleNonce: "0123456789abcdef",
    rolePassword: "r".repeat(43),
  });
}

async function captureFailure(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected assertion runner failure");
}

describe("Communication Note Preview schema rollback assertion runner", () => {
  it("pins the exact 20-file rollback manifest", async () => {
    const loadedBasenames = [];
    const bundle = await loadCommunicationNotePreviewRollbackAssertions(
      async (url, encoding) => {
        loadedBasenames.push(fileURLToPath(url).split("/").at(-1));
        return readFile(url, encoding);
      },
    );
    expect(bundle).toMatchObject({
      fileCount: 20,
      manifestSha256:
        "fa30cd81f60e36dee05566d913a942bb107639e26762131f4e605c52e772197b",
    });
    expect(bundle.scripts).toHaveLength(20);
    expect(STAGES).toEqual({
      runner: "R00",
      assertions: EXPECTED_ASSERTION_STAGE_MAPPING.map(([stage]) => stage),
    });
    expect(
      bundle.scripts.map((script, index) => [
        script.stage,
        loadedBasenames[index],
      ]),
    ).toEqual(EXPECTED_ASSERTION_STAGE_MAPPING);
    expect(
      bundle.scripts.filter((script) => script.migrationEntryRole),
    ).toHaveLength(1);
    expect(bundle.scripts[2].diagnosticPrefixes.length).toBeGreaterThan(30);
    expect(bundle.scripts[2].diagnosticPrefixes[62]).toBe(
      "receipt evidence drift did not fail binding: ",
    );
    expect(bundle.scripts[2].sql).toContain(
      "st,'{usage,cachedInputTokens}',to_jsonb(21),false",
    );
    expect(bundle.scripts[2].sql).not.toContain(
      "'{usage,inputTokens}',to_jsonb(121)",
    );
    expect(bundle.scripts[19].sql).toContain(
      "'availablePoints', 42",
    );
    expect(bundle.scripts[19].sql).toContain(
      "'reservedPoints', 20",
    );
    expect(bundle.scripts[19].sql).toContain(
      "Points preview RPC mutated protected relations",
    );
    expect(classifyCommunicationNotePreviewRollbackAssertionMessage(
      new Error("M1g-f assertions require PostgreSQL 16+"),
      bundle.scripts[2].diagnosticPrefixes,
    )).toBe("D001");
    expect(classifyCommunicationNotePreviewRollbackAssertionMessage(
      new Error(SECRET),
      bundle.scripts[2].diagnosticPrefixes,
    )).toBe("");
    const keyReusePrefix =
      "authorization signing key reuse was accepted: ";
    expect(classifyCommunicationNotePreviewRollbackAssertionMessage(
      new Error(`${keyReusePrefix}ASSERTION_EXPECTED_REJECTION`),
      bundle.scripts[2].diagnosticPrefixes,
    )).toBe("D055A");
    expect(classifyCommunicationNotePreviewRollbackAssertionMessage(
      new Error(`${keyReusePrefix}VALIDATION_ERROR`),
      bundle.scripts[2].diagnosticPrefixes,
    )).toBe("D055V");
    expect(classifyCommunicationNotePreviewRollbackAssertionMessage(
      new Error(`${keyReusePrefix}permission denied for relation ledger`),
      bundle.scripts[2].diagnosticPrefixes,
    )).toBe("D055P");
    expect(classifyCommunicationNotePreviewRollbackAssertionMessage(
      new Error(`${keyReusePrefix}${SECRET}`),
      bundle.scripts[2].diagnosticPrefixes,
    )).toBe("D055U");
    const overlappingPrefixes = [
      "shared assertion failed",
      "shared assertion failed: ",
    ];
    expect(classifyCommunicationNotePreviewRollbackAssertionMessage(
      new Error(overlappingPrefixes[1]),
      overlappingPrefixes,
    )).toBe("D002");
    expect(classifyCommunicationNotePreviewRollbackAssertionMessage(
      new Error(`${overlappingPrefixes[1]}VALIDATION_ERROR`),
      overlappingPrefixes,
    )).toBe("D002V");
    for (const script of bundle.scripts) {
      expect(script.sql).not.toMatch(/^\s*\\/m);
      const lines = script.sql
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase());
      const begins = lines.filter((line) =>
        /^begin(?:\s+isolation\s+level\s+(?:read\s+committed|repeatable\s+read|serializable))?\s*;$/.test(
          line,
        )
      );
      const rollbacks = lines.filter((line) => /^rollback\s*;$/.test(line));
      expect(begins.length).toBeGreaterThan(0);
      expect(rollbacks).toHaveLength(begins.length);
      expect(lines).not.toContain("commit;");
    }
  });

  it("fails closed on manifest drift without exposing a filename", async () => {
    let first = true;
    const driftingReader = async (...args) => {
      const raw = await readFile(...args);
      if (!first) return raw;
      first = false;
      return `${raw}\n-- drift`;
    };
    await expect(
      loadCommunicationNotePreviewRollbackAssertions(driftingReader),
    ).rejects.toMatchObject({
      stage: "A01",
      code: ERRORS.manifestFailed,
      message: ERRORS.manifestFailed,
    });
  });

  it("strips only ON_ERROR_STOP and requires balanced rollback-only transactions", () => {
    expect(
      normalizeCommunicationNotePreviewRollbackAssertionSql(
        "\\set ON_ERROR_STOP on\nbegin;\nselect 1;\nrollback;\n",
      ),
    ).toBe("\nbegin;\nselect 1;\nrollback;\n");
    for (const sql of [
      "\\i unsafe.sql\nbegin;\nrollback;",
      "begin;\ncommit;",
      "begin;\nselect 1;",
      "rollback;",
    ]) {
      expectFixedCode(
        () => normalizeCommunicationNotePreviewRollbackAssertionSql(sql),
        ERRORS.sqlPolicyFailed,
      );
    }
  });

  it("accepts only the caller-supplied CA with the exact SHA-256 pin", async () => {
    const digest = createHash("sha256").update(CA).digest("hex");
    await expect(
      readCommunicationNotePreviewPinnedCa(
        "/private/path/never-output.pem",
        digest,
        async () => Buffer.from(CA),
      ),
    ).resolves.toBe(CA);
    await expect(
      readCommunicationNotePreviewPinnedCa(
        "/private/path/never-output.pem",
        "0".repeat(64),
        async () => Buffer.from(CA),
      ),
    ).rejects.toMatchObject({
      code: ERRORS.caFailed,
      message: ERRORS.caFailed,
    });
  });

  it("uses direct first and falls back only for a connection-layer reachability error", async () => {
    const direct = fakeClientClass([{}]);
    const directResult = await connectCommunicationNotePreviewAssertionAdmin(
      direct.FakeClient,
      candidates(),
      CA,
    );
    expect(directResult.mode).toBe("direct");
    expect(direct.configs).toHaveLength(1);
    expect(direct.configs[0]).toMatchObject({
      host: `db.${BRANCH_REF}.supabase.co`,
      port: 5432,
      user: "postgres",
      password: SECRET,
      ssl: { ca: CA, rejectUnauthorized: true },
    });

    const unreachable = Object.assign(new Error("unreachable"), {
      code: "ENETUNREACH",
    });
    const fallback = fakeClientClass([
      { connectError: unreachable },
      {},
    ]);
    const fallbackResult =
      await connectCommunicationNotePreviewAssertionAdmin(
        fallback.FakeClient,
        candidates(),
        CA,
      );
    expect(fallbackResult.mode).toBe("session_pooler_fallback");
    expect(fallback.configs).toHaveLength(2);
    expect(fallback.configs[1]).toMatchObject({
      host: "aws-0-ap-southeast-2.pooler.supabase.com",
      port: 5432,
      user: `postgres.${BRANCH_REF}`,
      password: SECRET,
    });

    const authentication = Object.assign(new Error("authentication"), {
      code: "28P01",
    });
    const denied = fakeClientClass([{ connectError: authentication }]);
    await expect(
      connectCommunicationNotePreviewAssertionAdmin(
        denied.FakeClient,
        candidates(),
        CA,
      ),
    ).rejects.toMatchObject({
      code: ERRORS.connectionFailed,
      message: ERRORS.connectionFailed,
    });
    expect(denied.configs).toHaveLength(1);
  });

  it("never converts a TLS verification failure into pooler fallback", async () => {
    const invalidTls = fakeClientClass([
      {
        stream: {
          encrypted: true,
          authorized: false,
          authorizationError: "UNTRUSTED",
        },
      },
    ]);
    await expect(
      connectCommunicationNotePreviewAssertionAdmin(
        invalidTls.FakeClient,
        candidates(),
        CA,
      ),
    ).rejects.toMatchObject({
      code: ERRORS.tlsFailed,
      message: ERRORS.tlsFailed,
    });
    expect(invalidTls.configs).toHaveLength(1);
    expect(invalidTls.instances[0].closed).toBe(true);
    expectFixedCode(
      () =>
        assertCommunicationNotePreviewAssertionTls({
          connection: {
            stream: {
              encrypted: false,
              authorized: true,
              authorizationError: null,
            },
          },
        }),
      ERRORS.tlsFailed,
    );
  });

  it("keeps the CLI contract and successful stdout evidence minimal", async () => {
    const source = await readFile(RUNNER_URL, "utf8");
    expect(POLICY).toEqual({
      version: "2026-09-02.preview-schema-rollback-assertions.8",
      fileCount: 20,
      manifestSha256:
        "fa30cd81f60e36dee05566d913a942bb107639e26762131f4e605c52e772197b",
      applicationName: "careslink-preview-schema-rollback-assertions",
      transportRolePrefix: "careslink_m1gh_assert_transport_",
      actorRolePrefix: "careslink_m1gh_assert_actor_",
    });
    expect(source).toContain("supabase branches get ... -o json |");
    expect(source).toContain(
      "communication-note-preview-disposable-branch-envelope.mjs ... |",
    );
    expect(source).toContain(
      "communication-note-preview-schema-rollback-assertions.mjs ...",
    );
    expect(source).toContain(
      "extractCommunicationNoteDisposablePreviewResetDatabaseTarget",
    );
    expect(source).not.toContain(
      "extractCommunicationNotePreviewBranchDatabaseTarget",
    );
    expect(source).not.toContain("--output-format");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("console.error");
    expect(source).not.toMatch(/writeFile|appendFile|createWriteStream/);
    expect(source).toContain("fileCount: 20");
    expect(source).toContain("manifestSha256: ASSERTION_MANIFEST_SHA256");
    expect(source).toContain("passedCount: 20");
    expect(source).toContain("point_admissions_zero");
    expect(JSON.stringify(POLICY)).not.toContain(SECRET);
    expect(
      new CommunicationNotePreviewSchemaRollbackAssertionError(
        "unsafe-driver-detail",
      ).message,
    ).toBe(ERRORS.internalFailed);
    const poisoned = new CommunicationNotePreviewSchemaRollbackAssertionError(
      ERRORS.assertionFailed,
      "A01",
    );
    poisoned.code = SECRET;
    poisoned.stage = SECRET;
    poisoned.detail = SECRET;
    expect(
      formatCommunicationNotePreviewSchemaRollbackAssertionFailure(poisoned),
    ).toBe(
      `{"stage":"R00","errorType":"${ERRORS.internalFailed}"}`,
    );
    expect(
      formatCommunicationNotePreviewSchemaRollbackAssertionFailure(
        new CommunicationNotePreviewSchemaRollbackAssertionError(
          ERRORS.assertionFailed,
          "A03",
          "D040A",
        ),
      ),
    ).toBe(
      `{"stage":"A03","errorType":"${ERRORS.assertionFailed}","detail":"D040A"}`,
    );
    expect(
      JSON.stringify({
        fileCount: 20,
        manifestSha256: POLICY.manifestSha256,
        passedCount: 20,
      }),
    ).toBe(
      `{"fileCount":20,"manifestSha256":"${POLICY.manifestSha256}","passedCount":20}`,
    );
  });

  it("emits exactly one fixed runner-stage JSON line without input disclosure", () => {
    const cli = spawnSync(
      process.execPath,
      [
        fileURLToPath(RUNNER_URL),
        `--expected-branch-ref=${BRANCH_REF}`,
        "--expected-pg-major=17",
        `--ssl-root-cert-path=/private/${SECRET}.pem`,
        `--expected-ssl-root-cert-sha256=${"0".repeat(64)}`,
      ],
      {
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "" },
        input: JSON.stringify({ branchJson: SECRET }),
      },
    );
    expect(cli.status).toBe(1);
    expect(cli.signal).toBeNull();
    expect(cli.stdout).toBe("");
    expect(cli.stderr).toBe(
      '{"stage":"R00","errorType":"RUNNER_TERMINAL_IDENTITY_BRANCH_JSON_INVALID"}\n',
    );
    expect(cli.stderr.trim().split("\n")).toHaveLength(1);
    for (const forbidden of [
      SECRET,
      "/private/",
      "branchJson",
      "password",
      "SQLSTATE",
    ]) {
      expect(cli.stderr).not.toContain(forbidden);
    }
  });

  it("accepts only the canonical disposable envelope at the CLI boundary", () => {
    const accepted = runRollbackCli(disposableEnvelope());
    expect(accepted.status).toBe(1);
    expect(accepted.signal).toBeNull();
    expect(accepted.stdout).toBe("");
    expect(accepted.stderr).toBe(
      `{"stage":"R00","errorType":"${ERRORS.caFailed}"}\n`,
    );

    const rawCredentials = JSON.stringify(
      JSON.parse(disposableEnvelope()).credentials,
    );
    const denied = [
      [
        rawCredentials,
        "RUNNER_TERMINAL_IDENTITY_BRANCH_JSON_INVALID",
      ],
      [
        disposableEnvelope({ metadata: { ref: PRODUCTION_REF } }),
        "RUNNER_TERMINAL_IDENTITY_PRODUCTION_TARGET_DENIED",
      ],
      [
        disposableEnvelope({ metadata: { persistent: true } }),
        "RUNNER_TERMINAL_IDENTITY_BRANCH_NOT_DISPOSABLE",
      ],
    ];
    for (const [input, errorType] of denied) {
      const result = runRollbackCli(input);
      expect(result.status).toBe(1);
      expect(result.signal).toBeNull();
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        `{"stage":"R00","errorType":"${errorType}"}\n`,
      );
      expect(result.stderr.trim().split("\n")).toHaveLength(1);
      for (const forbidden of [
        SECRET,
        "/private/",
        "postgresql://",
        "password",
        "SQLSTATE",
      ]) {
        expect(result.stderr).not.toContain(forbidden);
      }
    }
  });

  it("binds A08 transport, timeout, and SQL failures to one safe stage", async () => {
    const transport = createAssertionCleanupReconnectSuccessClient({
      transportConnectionFailure: true,
    });
    const transportFailure = await captureFailure(
      runAssertionsWithClient(transport.FakeClient),
    );
    expect(transportFailure).toMatchObject({
      stage: "A08",
      code: ERRORS.roleConnectionFailed,
      message: ERRORS.roleConnectionFailed,
    });

    const timeout = createAssertionCleanupReconnectSuccessClient({
      transportTimeoutFailure: true,
    });
    const timeoutFailure = await captureFailure(
      runAssertionsWithClient(timeout.FakeClient),
    );
    expect(timeoutFailure).toMatchObject({
      stage: "A08",
      code: ERRORS.targetFailed,
      message: ERRORS.targetFailed,
    });

    const assertion = createAssertionCleanupReconnectSuccessClient({
      assertionFailureIndex: 7,
    });
    const assertionFailure = await captureFailure(
      runAssertionsWithClient(assertion.FakeClient),
    );
    expect(assertionFailure).toMatchObject({
      stage: "A08",
      code: ERRORS.assertionFailed,
      message: ERRORS.assertionFailed,
    });

    expect(
      formatCommunicationNotePreviewSchemaRollbackAssertionFailure(
        transportFailure,
      ),
    ).toBe(
      `{"stage":"A08","errorType":"${ERRORS.roleConnectionFailed}"}`,
    );
    expect(
      formatCommunicationNotePreviewSchemaRollbackAssertionFailure(
        timeoutFailure,
      ),
    ).toBe(`{"stage":"A08","errorType":"${ERRORS.targetFailed}"}`);
    const renderedAssertion =
      formatCommunicationNotePreviewSchemaRollbackAssertionFailure(
        assertionFailure,
      );
    expect(renderedAssertion).toBe(
      `{"stage":"A08","errorType":"${ERRORS.assertionFailed}"}`,
    );
    for (const forbidden of [
      SECRET,
      "XX000",
      "28P01",
      "57014",
      "ASSERTION_SCRIPT_7",
      "/private/assertion/",
      "branchJson",
      "driver message",
    ]) {
      expect(renderedAssertion).not.toContain(forbidden);
    }
  });

  it("keeps rollback failure precedence within the fixed assertion stage", async () => {
    const fake = createAssertionCleanupReconnectSuccessClient({
      assertionFailureIndex: 2,
      rollbackFailure: true,
    });
    const failure = await captureFailure(
      runAssertionsWithClient(fake.FakeClient),
    );
    expect(failure).toMatchObject({
      stage: "A03",
      code: ERRORS.rollbackFailed,
      message: ERRORS.rollbackFailed,
    });
    expect(
      formatCommunicationNotePreviewSchemaRollbackAssertionFailure(failure),
    ).toBe(
      `{"stage":"A03","errorType":"${ERRORS.rollbackFailed}"}`,
    );
  });

  it("reconnects once to remove roles committed before the setup response was lost", async () => {
    const fake = createAssertionCommitLossClient();
    await expect(
      runCommunicationNotePreviewSchemaRollbackAssertions({
        Client: fake.FakeClient,
        connectionCandidates: candidates(),
        sslRootCertificate: CA,
        expectedBranchRef: BRANCH_REF,
        expectedPostgresMajor: 17,
        assertionBundle: rollbackBundleWithMigrationEntryRole(),
        roleNonce: "0123456789abcdef",
        rolePassword: "r".repeat(43),
      }),
    ).rejects.toMatchObject({
      stage: "A08",
      code: ERRORS.roleSetupFailed,
      message: ERRORS.roleSetupFailed,
    });
    expect(fake.instances).toHaveLength(2);
    expect(fake.state).toEqual({
      transportPresent: false,
      actorPresent: false,
      transportCanLogin: false,
    });
    expect(fake.reconnectEvents).toEqual([
      "statement_timeout",
      "lock_timeout",
      "idle_in_transaction_session_timeout",
      "target",
      "cleanup_presence",
      "cleanup",
    ]);
  });

  it("reconfigures and revalidates a cleanup reconnect before continuing", async () => {
    const fake = createAssertionCleanupReconnectSuccessClient();
    await expect(
      runCommunicationNotePreviewSchemaRollbackAssertions({
        Client: fake.FakeClient,
        connectionCandidates: candidates(),
        sslRootCertificate: CA,
        expectedBranchRef: BRANCH_REF,
        expectedPostgresMajor: 17,
        assertionBundle: rollbackBundleWithMigrationEntryRole(),
        roleNonce: "0123456789abcdef",
        rolePassword: "r".repeat(43),
      }),
    ).resolves.toEqual({
      fileCount: 20,
      manifestSha256: POLICY.manifestSha256,
      passedCount: 20,
    });
    expect(fake.instances).toHaveLength(3);
    expect(fake.state).toEqual({
      transportPresent: false,
      actorPresent: false,
      transportCanLogin: false,
    });
    expect(fake.reconnectEvents.slice(0, 6)).toEqual([
      "statement_timeout",
      "lock_timeout",
      "idle_in_transaction_session_timeout",
      "target",
      "cleanup_presence",
      "cleanup",
    ]);
    expect(
      fake.reconnectEvents.filter((event) => event === "continued_assertion"),
    ).toHaveLength(12);
  });

  it("returns only the fixed cleanup code when the one reconnect cannot clean up", async () => {
    const fake = createAssertionCommitLossClient({ reconnectFails: true });
    const failure = await captureFailure(
      runCommunicationNotePreviewSchemaRollbackAssertions({
        Client: fake.FakeClient,
        connectionCandidates: candidates(),
        sslRootCertificate: CA,
        expectedBranchRef: BRANCH_REF,
        expectedPostgresMajor: 17,
        assertionBundle: rollbackBundleWithMigrationEntryRole(),
        roleNonce: "0123456789abcdef",
        rolePassword: "r".repeat(43),
      }),
    );
    expect(failure).toMatchObject({
      stage: "A08",
      code: ERRORS.roleCleanupFailed,
      message: ERRORS.roleCleanupFailed,
    });
    expect(
      formatCommunicationNotePreviewSchemaRollbackAssertionFailure(failure),
    ).toBe(
      `{"stage":"A08","errorType":"${ERRORS.roleCleanupFailed}"}`,
    );
    expect(fake.instances).toHaveLength(2);
    expect(fake.state.transportPresent).toBe(true);
    expect(fake.state.actorPresent).toBe(true);
  });
});
