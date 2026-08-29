import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES as ERRORS,
  COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_POLICY as POLICY,
  CommunicationNotePreviewSchemaRollbackAssertionError,
  assertCommunicationNotePreviewAssertionTls,
  connectCommunicationNotePreviewAssertionAdmin,
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
    fileCount: 18,
    manifestSha256: POLICY.manifestSha256,
    scripts: Object.freeze(Array.from({ length: 18 }, (_, index) =>
      Object.freeze({
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

function createAssertionCleanupReconnectSuccessClient() {
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

    async connect() {}

    async end() {}

    async query(query) {
      const sql = typeof query === "string" ? query : query.text;
      const normalized = sql.trim().toLowerCase();
      if (this.damaged) {
        throw Object.assign(new Error("fixed damaged admin"), {
          code: "ECONNRESET",
        });
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

describe("Communication Note Preview schema rollback assertion runner", () => {
  it("pins the exact 18-file rollback manifest", async () => {
    const bundle = await loadCommunicationNotePreviewRollbackAssertions();
    expect(bundle).toMatchObject({
      fileCount: 18,
      manifestSha256:
        "163ddd40e68f8c2accc8904c4b7165c6630ba8fdad58b54a674d4f27908273f1",
    });
    expect(bundle.scripts).toHaveLength(18);
    expect(
      bundle.scripts.filter((script) => script.migrationEntryRole),
    ).toHaveLength(1);
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
      version: "2026-08-29.preview-schema-rollback-assertions.1",
      fileCount: 18,
      manifestSha256:
        "163ddd40e68f8c2accc8904c4b7165c6630ba8fdad58b54a674d4f27908273f1",
      applicationName: "careslink-preview-schema-rollback-assertions",
      transportRolePrefix: "careslink_m1gh_assert_transport_",
      actorRolePrefix: "careslink_m1gh_assert_actor_",
    });
    expect(source).toContain("supabase branches get ... -o json");
    expect(source).not.toContain("--output-format");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("console.error");
    expect(source).not.toMatch(/writeFile|appendFile|createWriteStream/);
    expect(source).toContain("fileCount: 18");
    expect(source).toContain("manifestSha256: ASSERTION_MANIFEST_SHA256");
    expect(source).toContain("passedCount: 18");
    expect(JSON.stringify(POLICY)).not.toContain(SECRET);
    expect(
      new CommunicationNotePreviewSchemaRollbackAssertionError(
        "unsafe-driver-detail",
      ).message,
    ).toBe(ERRORS.internalFailed);
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
      fileCount: 18,
      manifestSha256: POLICY.manifestSha256,
      passedCount: 18,
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
    ).toHaveLength(10);
  });

  it("returns only the fixed cleanup code when the one reconnect cannot clean up", async () => {
    const fake = createAssertionCommitLossClient({ reconnectFails: true });
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
      code: ERRORS.roleCleanupFailed,
      message: ERRORS.roleCleanupFailed,
    });
    expect(fake.instances).toHaveLength(2);
    expect(fake.state.transportPresent).toBe(true);
    expect(fake.state.actorPresent).toBe(true);
  });
});
