import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES as ERRORS,
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY as POLICY,
  CommunicationNotePreviewRunnerTerminalIdentityPolicyError,
  assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression,
  assertCommunicationNotePreviewRunnerTerminalIdentitySqlPolicy,
  createCommunicationNotePreviewRuntimeRoleName,
  extractCommunicationNotePreviewBranchDatabaseTarget,
  parseCommunicationNotePreviewRunnerTerminalIdentityArguments,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";
import {
  CommunicationNotePreviewRunnerTerminalIdentityHarnessError,
  assertVerifiedPreviewTlsConnection,
  createCommunicationNotePreviewDatabaseConnectionConfig,
  runCommunicationNotePreviewRunnerTerminalIdentityHarness,
} from "./communication-note-preview-runner-terminal-identity.mjs";

const BRANCH_REF = "abcdefghijklmnopqrst";
const SECRET = "sentinel-password-never-output";
const SETUP_URL = new URL(
  "./communication-note-preview-runner-terminal-identity-setup.sql",
  import.meta.url,
);
const QUIESCE_URL = new URL(
  "./communication-note-preview-runner-terminal-identity-quiesce.sql",
  import.meta.url,
);
const CLEANUP_URL = new URL(
  "./communication-note-preview-runner-terminal-identity-cleanup.sql",
  import.meta.url,
);
const HARNESS_URL = new URL(
  "./communication-note-preview-runner-terminal-identity.mjs",
  import.meta.url,
);

function branchJson(overrides = {}) {
  return `${JSON.stringify({
    REF: BRANCH_REF,
    STATUS: "ACTIVE_HEALTHY",
    POSTGRES_URL_NON_POOLING:
      `postgresql://postgres:${SECRET}@db.${BRANCH_REF}.supabase.co:5432/postgres?sslmode=require`,
    POSTGRES_URL:
      `postgresql://postgres.${BRANCH_REF}:${SECRET}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?connect_timeout=10`,
    ...overrides,
  })}\n`;
}

function expectPolicyCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(
      CommunicationNotePreviewRunnerTerminalIdentityPolicyError,
    );
    expect(error).toMatchObject({ code, message: code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

function identityConnectionCandidates() {
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

function createIdentityCommitLossClient({ reconnectFails = false } = {}) {
  const state = { roleExists: false, roleCanLogin: false };
  const instances = [];
  class FakeClient {
    constructor(config) {
      this.config = config;
      this.instanceIndex = instances.length;
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
      if (this.instanceIndex === 0) {
        if (this.damaged) {
          throw Object.assign(new Error("fixed damaged admin"), {
            code: "ECONNRESET",
          });
        }
        if (sql.trim().toLowerCase() === "commit") {
          state.roleExists = true;
          state.roleCanLogin = true;
          this.damaged = true;
          throw Object.assign(new Error("fixed commit response loss"), {
            code: "ECONNRESET",
          });
        }
        return { rowCount: 1, rows: [{}] };
      }

      if (sql.includes("is not null as present")) {
        return {
          rowCount: 1,
          rows: [{ present: state.roleExists }],
        };
      }
      if (sql.includes("RUNNER_TERMINAL_IDENTITY_QUIESCE_MANAGEMENT_UNSAFE")) {
        state.roleCanLogin = false;
      }
      if (sql.includes("RUNNER_TERMINAL_IDENTITY_CLEANUP_MANAGEMENT_UNSAFE")) {
        state.roleExists = false;
      }
      if (sql.includes("select pid, state, application_name")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("as role_absent")) {
        return {
          rowCount: 1,
          rows: [{
            role_absent: !state.roleExists,
            sessions_absent: true,
          }],
        };
      }
      if (sql.includes("as absent")) {
        return { rowCount: 1, rows: [{ absent: true }] };
      }
      return { rowCount: 1, rows: [{}] };
    }
  }
  return { FakeClient, instances, state };
}

function createIdentityQuiesceProofFailureClient() {
  const state = {
    roleExists: false,
    roleCanLogin: false,
    quiesceAttempts: 0,
  };
  const instances = [];
  class FakeClient {
    constructor() {
      this.instanceIndex = instances.length;
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
      if (this.instanceIndex === 1) {
        throw Object.assign(new Error("fixed runtime connection failure"), {
          code: "28P01",
        });
      }
    }

    async end() {}

    async query(query) {
      const sql = typeof query === "string" ? query : query.text;
      if (sql.includes("RUNNER_TERMINAL_IDENTITY_SETUP_MANAGEMENT_UNSAFE")) {
        state.roleExists = true;
        state.roleCanLogin = true;
      }
      if (sql.includes("is not null as present")) {
        return {
          rowCount: 1,
          rows: [{ present: state.roleExists }],
        };
      }
      if (sql.includes("RUNNER_TERMINAL_IDENTITY_QUIESCE_MANAGEMENT_UNSAFE")) {
        state.quiesceAttempts += 1;
        if (state.quiesceAttempts === 1) {
          throw new Error("fixed initial quiesce proof failure");
        }
        state.roleCanLogin = false;
      }
      if (sql.includes("RUNNER_TERMINAL_IDENTITY_CLEANUP_MANAGEMENT_UNSAFE")) {
        state.roleExists = false;
      }
      if (sql.includes("select pid, state, application_name")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("as role_absent")) {
        return {
          rowCount: 1,
          rows: [{
            role_absent: !state.roleExists,
            sessions_absent: true,
          }],
        };
      }
      if (sql.includes("as absent")) {
        return { rowCount: 1, rows: [{ absent: true }] };
      }
      return { rowCount: 1, rows: [{}] };
    }
  }
  return { FakeClient, instances, state };
}

describe("Communication Note Preview runner-terminal identity policy", () => {
  it("accepts only an explicit non-production branch and PostgreSQL major", () => {
    expect(
      parseCommunicationNotePreviewRunnerTerminalIdentityArguments([
        `--expected-branch-ref=${BRANCH_REF}`,
        "--expected-pg-major=16",
        "--ssl-root-cert-path=/tmp/supabase-ca.crt",
        `--expected-ssl-root-cert-sha256=${"a".repeat(64)}`,
      ]),
    ).toEqual({
      expectedBranchRef: BRANCH_REF,
      expectedPostgresMajor: 16,
      sslRootCertPath: "/tmp/supabase-ca.crt",
      expectedSslRootCertSha256: "a".repeat(64),
    });
    expect(
      parseCommunicationNotePreviewRunnerTerminalIdentityArguments([
        "--expected-pg-major=17",
        `--expected-branch-ref=${BRANCH_REF}`,
        "--ssl-root-cert-path=/tmp/supabase-ca.crt",
        `--expected-ssl-root-cert-sha256=${"b".repeat(64)}`,
      ]),
    ).toEqual({
      expectedBranchRef: BRANCH_REF,
      expectedPostgresMajor: 17,
      sslRootCertPath: "/tmp/supabase-ca.crt",
      expectedSslRootCertSha256: "b".repeat(64),
    });
    expectPolicyCode(
      () =>
        parseCommunicationNotePreviewRunnerTerminalIdentityArguments([
          `--expected-branch-ref=${POLICY.productionProjectRef}`,
          "--expected-pg-major=16",
          "--ssl-root-cert-path=/tmp/supabase-ca.crt",
          `--expected-ssl-root-cert-sha256=${"a".repeat(64)}`,
        ]),
      ERRORS.productionDenied,
    );
    expectPolicyCode(
      () =>
        parseCommunicationNotePreviewRunnerTerminalIdentityArguments([
          `--expected-branch-ref=${BRANCH_REF}`,
        ]),
      ERRORS.argumentInvalid,
    );
  });

  it("extracts the CLI stdin URL once without serializing credential material", () => {
    const target = extractCommunicationNotePreviewBranchDatabaseTarget(
      branchJson(),
      { expectedBranchRef: BRANCH_REF },
    );
    expect(target.descriptor).toEqual({
      ok: true,
      policyVersion: POLICY.version,
      connectionMode: "direct_then_session_pooler",
      projectRef: BRANCH_REF,
      databaseRole: "postgres",
      hostname: `db.${BRANCH_REF}.supabase.co`,
      sessionPoolerHostname:
        "aws-0-ap-southeast-2.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      tlsMode: "node-ca-verify-full",
      credentialMaterial: "process_memory_only_single_consumer",
    });
    expect(JSON.stringify(target)).not.toContain(SECRET);
    const candidates = target.takeAdminConnectionCandidates();
    expect(candidates.direct.password).toBe(SECRET);
    expect(candidates.sessionPooler).toMatchObject({
      user: `postgres.${BRANCH_REF}`,
      port: 5432,
      password: SECRET,
    });
    expect(JSON.stringify(target)).not.toContain(SECRET);
    expectPolicyCode(
      () => target.takeAdminConnectionCandidates(),
      ERRORS.credentialMissing,
    );
  });

  it("derives the branch from the non-pooling host when the CLI omits REF", () => {
    const input = JSON.stringify({
      POSTGRES_URL_NON_POOLING:
        `postgresql://postgres:${SECRET}@db.${BRANCH_REF}.supabase.co:5432/postgres`,
      POSTGRES_URL:
        `postgresql://postgres.${BRANCH_REF}:${SECRET}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`,
    });
    expect(
      extractCommunicationNotePreviewBranchDatabaseTarget(input, {
        expectedBranchRef: BRANCH_REF,
      }).descriptor.projectRef,
    ).toBe(BRANCH_REF);
  });

  it("rejects parent Production, mismatched, pooled, weak and expanded targets", () => {
    const production = POLICY.productionProjectRef;
    const cases = [
      [
        branchJson({
          REF: production,
          POSTGRES_URL_NON_POOLING:
            `postgresql://postgres:${SECRET}@db.${production}.supabase.co:5432/postgres`,
        }),
        production,
        ERRORS.productionDenied,
      ],
      [
        branchJson({ REF: "bcdefghijklmnopqrstu" }),
        BRANCH_REF,
        ERRORS.branchMismatch,
      ],
      [
        branchJson({
          POSTGRES_URL_NON_POOLING:
            `postgresql://postgres:${SECRET}@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`,
        }),
        BRANCH_REF,
        ERRORS.branchMismatch,
      ],
      [
        branchJson({
          POSTGRES_URL_NON_POOLING:
            `postgresql://postgres@db.${BRANCH_REF}.supabase.co:5432/postgres`,
        }),
        BRANCH_REF,
        ERRORS.credentialMissing,
      ],
      [
        branchJson({
          POSTGRES_URL_NON_POOLING:
            `postgresql://postgres:${SECRET}@db.${BRANCH_REF}.supabase.co:5432/postgres?sslmode=require&options=-csearch_path%3Dpublic`,
        }),
        BRANCH_REF,
        ERRORS.tlsDenied,
      ],
    ];
    for (const [input, expectedBranchRef, code] of cases) {
      expectPolicyCode(
        () =>
          extractCommunicationNotePreviewBranchDatabaseTarget(input, {
            expectedBranchRef,
          }),
        code,
      );
    }
  });

  it("creates only the fixed 61-byte random runtime-role namespace", () => {
    expect(
      createCommunicationNotePreviewRuntimeRoleName("0123456789abcdef"),
    ).toBe(
      "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef",
    );
    expectPolicyCode(
      () => createCommunicationNotePreviewRuntimeRoleName("../unsafe"),
      ERRORS.roleNonceInvalid,
    );
  });

  it("locks parameterized setup, NOLOGIN quiesce and zero-residue cleanup", async () => {
    const [setupSql, quiesceSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(QUIESCE_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);
    expect(
      assertCommunicationNotePreviewRunnerTerminalIdentitySqlPolicy(
        setupSql,
        quiesceSql,
        cleanupSql,
      ),
    ).toEqual({
      ok: true,
      setupParameterizedByLocalGuc: true,
      randomLoginNoInheritLocked: true,
      setOnlyMembershipLocked: true,
      exactRpcOnlyLocked: true,
      tableAndApiIsolationLocked: true,
      noLedgerWritesLocked: true,
      quiesceBeforeDropLocked: true,
      zeroResiduePostcheckLocked: true,
    });
    expect(setupSql).not.toContain(SECRET);
    expect(setupSql).toContain("pg_catalog.current_setting(");
    expect(setupSql).toContain("with admin false, inherit false, set true");
    expect(setupSql).not.toMatch(
      /grant\s+careslink_v1_preview_runner_terminal_executor\s+to\s+%I/i,
    );
    expect(quiesceSql).toContain("alter role %I nologin");
    expect(cleanupSql.indexOf("revoke careslink_v1_preview_runner_terminal_caller"))
      .toBeLessThan(cleanupSql.indexOf("drop role %I"));

    expectPolicyCode(
      () =>
        assertCommunicationNotePreviewRunnerTerminalIdentitySqlPolicy(
          setupSql.replace("set true", "set false"),
          quiesceSql,
          cleanupSql,
        ),
      ERRORS.sqlPolicyInvalid,
    );
  });

  it("keeps stdout evidence and fixed stderr failures credential-free", async () => {
    const source = await readFile(HARNESS_URL, "utf8");
    expect(source).toContain("supabase branches get -o json");
    expect(source).toContain("supabase branches get --output-format json");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("console.error");
    expect(source).not.toMatch(/writeFile|appendFile|createWriteStream/);
    expect(source).toContain('temporaryRuntimeRole: "random_name_redacted"');
    expect(source).toContain(
      'probeKind: "INVALID_ENVELOPE_NO_WRITE_PROBE"',
    );
    expect(source).toContain("runtimePassword = undefined");
    expect(assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression())
      .toEqual({
        ok: true,
        policyVersion: POLICY.version,
        productionProjectDenied: true,
        stdinCredentialRedacted: true,
        runtimeRoleLength: 61,
      });
  });

  it("requires a verified TLS stream for both database identities", () => {
    expect(
      assertVerifiedPreviewTlsConnection({
        connection: {
          stream: {
            encrypted: true,
            authorized: true,
            authorizationError: null,
          },
        },
      }),
    ).toEqual({ encrypted: true, authorized: true });
    for (const stream of [
      { encrypted: false, authorized: true, authorizationError: null },
      { encrypted: true, authorized: false, authorizationError: "DENIED" },
    ]) {
      expect(() =>
        assertVerifiedPreviewTlsConnection({ connection: { stream } }),
      ).toThrowError(
        expect.objectContaining({
          code: "RUNNER_TERMINAL_IDENTITY_TLS_FAILED",
        }),
      );
    }
    expect(
      new CommunicationNotePreviewRunnerTerminalIdentityHarnessError(
        "unsafe-detail",
      ).message,
    ).toBe("RUNNER_TERMINAL_IDENTITY_INTERNAL_FAILED");
  });

  it("never reuses the branch admin password for the temporary runtime login", () => {
    const candidate = Object.freeze({
      mode: "direct",
      host: `db.${BRANCH_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: "branch-admin-password-sentinel",
    });
    const certificate = "test-only-ca-certificate";
    const admin = createCommunicationNotePreviewDatabaseConnectionConfig(
      candidate,
      certificate,
      candidate.user,
      candidate.password,
    );
    const runtime = createCommunicationNotePreviewDatabaseConnectionConfig(
      candidate,
      certificate,
      "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef",
      "ephemeral-runtime-password-sentinel",
    );

    expect(admin.password).toBe("branch-admin-password-sentinel");
    expect(runtime.password).toBe("ephemeral-runtime-password-sentinel");
    expect(runtime.password).not.toBe(admin.password);
    expect(runtime.user).not.toBe(admin.user);
  });

  it("reconnects once to remove a role committed before the setup response was lost", async () => {
    const [setupSql, quiesceSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(QUIESCE_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);
    const fake = createIdentityCommitLossClient();
    await expect(
      runCommunicationNotePreviewRunnerTerminalIdentityHarness({
        Client: fake.FakeClient,
        connectionCandidates: identityConnectionCandidates(),
        sslRootCertificate: "test-only-ca-certificate",
        expectedBranchRef: BRANCH_REF,
        expectedPostgresMajor: 17,
        runtimeRole:
          "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef",
        runtimePassword: "r".repeat(43),
        expiresAt: "2026-08-29T01:00:00.000Z",
        setupSql,
        quiesceSql,
        cleanupSql,
      }),
    ).rejects.toMatchObject({
      code: "RUNNER_TERMINAL_IDENTITY_SETUP_FAILED",
    });
    expect(fake.instances).toHaveLength(2);
    expect(fake.state).toEqual({ roleExists: false, roleCanLogin: false });
  });

  it("retains an initial quiesce proof failure after definitive cleanup succeeds", async () => {
    const [setupSql, quiesceSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(QUIESCE_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);
    const fake = createIdentityQuiesceProofFailureClient();
    await expect(
      runCommunicationNotePreviewRunnerTerminalIdentityHarness({
        Client: fake.FakeClient,
        connectionCandidates: identityConnectionCandidates(),
        sslRootCertificate: "test-only-ca-certificate",
        expectedBranchRef: BRANCH_REF,
        expectedPostgresMajor: 17,
        runtimeRole:
          "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef",
        runtimePassword: "r".repeat(43),
        expiresAt: "2026-08-29T01:00:00.000Z",
        setupSql,
        quiesceSql,
        cleanupSql,
      }),
    ).rejects.toMatchObject({
      code: "RUNNER_TERMINAL_IDENTITY_QUIESCE_FAILED",
      message: "RUNNER_TERMINAL_IDENTITY_QUIESCE_FAILED",
    });
    expect(fake.instances).toHaveLength(2);
    expect(fake.state).toEqual({
      roleExists: false,
      roleCanLogin: false,
      quiesceAttempts: 2,
    });
  });

  it("returns only the fixed cleanup code when the one reconnect cannot clean up", async () => {
    const [setupSql, quiesceSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(QUIESCE_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);
    const fake = createIdentityCommitLossClient({ reconnectFails: true });
    await expect(
      runCommunicationNotePreviewRunnerTerminalIdentityHarness({
        Client: fake.FakeClient,
        connectionCandidates: identityConnectionCandidates(),
        sslRootCertificate: "test-only-ca-certificate",
        expectedBranchRef: BRANCH_REF,
        expectedPostgresMajor: 17,
        runtimeRole:
          "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef",
        runtimePassword: "r".repeat(43),
        expiresAt: "2026-08-29T01:00:00.000Z",
        setupSql,
        quiesceSql,
        cleanupSql,
      }),
    ).rejects.toMatchObject({
      code: "RUNNER_TERMINAL_IDENTITY_CLEANUP_FAILED",
      message: "RUNNER_TERMINAL_IDENTITY_CLEANUP_FAILED",
    });
    expect(fake.instances).toHaveLength(2);
    expect(fake.state.roleExists).toBe(true);
  });
});
