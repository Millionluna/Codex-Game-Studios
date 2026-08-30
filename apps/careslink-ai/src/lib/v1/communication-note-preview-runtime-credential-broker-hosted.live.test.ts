import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_HOSTED_LIVE_READY,
  prepareTestOnlyCaresLinkV1CommunicationNotePreviewRuntimeBrokerHostedLiveGate,
  runTestOnlyCaresLinkV1CommunicationNotePreviewPreparedRuntimeBrokerHostedLiveGate,
} from "./communication-note-preview-runner-terminal-hosted-live.server";

vi.mock("server-only", () => ({}));

const ENABLE_ENV = "CARESLINK_V1_M1L_HOSTED_LIVE_ENABLED";
const CONFIG_FD_ENV = "CARESLINK_V1_M1L_HOSTED_LIVE_CONFIG_FD";
const STATUS_FD_ENV = "CARESLINK_V1_M1L_HOSTED_LIVE_STATUS_FD";
const CONFIG_FD = 3;
const STATUS_FD = 4;
const CONFIG_MAXIMUM_BYTES = 65_536;
const SUCCESS_STATUS = "RUNTIME_BROKER_HOSTED_LIVE_PASSED";
const CROSS_DATABASE_OWNER_CREATE_FAILED =
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_OWNER_CREATE_FAILED";
const CROSS_DATABASE_OWNER_ATTESTATION_FAILED =
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_OWNER_ATTESTATION_FAILED";
const CROSS_DATABASE_RESIDUE_CONNECTION_FAILED =
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RESIDUE_CONNECTION_FAILED";
const CROSS_DATABASE_RESIDUE_ATTESTATION_FAILED =
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RESIDUE_ATTESTATION_FAILED";
const CROSS_DATABASE_TOMBSTONE_ROLLBACK_FAILED =
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_TOMBSTONE_ROLLBACK_FAILED";
const CROSS_DATABASE_RUNTIME_CLOSE_FAILED =
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RUNTIME_CLOSE_FAILED";
const MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-management";
const RUNTIME_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-runtime";
const CROSS_DATABASE_NAME = "careslink_v1_m1l_runtime_residue";
const PRODUCTION_PROJECT_REF = "adocsnwnslxhxcjgbyee";
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SCRAM_PATTERN =
  /^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]{22}==[$][A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/;
const FORBIDDEN_CREDENTIAL_ENVIRONMENT_KEYS = Object.freeze([
  "DATABASE_URL",
  "PGDATABASE",
  "PGHOST",
  "PGPASSWORD",
  "PGPORT",
  "PGUSER",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_PASSWORD",
]);
const API_ROLES = Object.freeze([
  "anon",
  "authenticated",
  "service_role",
  "authenticator",
  "careslink_v1_preview_runner_terminal_caller",
]);

const setupSql = readFileSync(
  new URL(
    "../../../scripts/preview-e2e/communication-note-preview-runner-terminal-valid-chain-setup.sql",
    import.meta.url,
  ),
  "utf8",
);

const MANAGEMENT_POSTURE_SQL = `select
  current_user,
  session_user,
  pg_catalog.current_database() as database_name,
  pg_catalog.current_setting('application_name') as application_name,
  pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
    10000 as postgres_major,
  role_record.rolcreatedb as can_create_database,
  role_record.rolcreaterole as can_create_role,
  role_record.rolbypassrls as bypass_rls,
  not role_record.rolsuper as not_superuser,
  pg_catalog.to_char(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
      at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as database_now
from pg_catalog.pg_roles as role_record
where role_record.rolname = current_user`;

const ACQUIRE_SQL = `select careslink_v1_runtime_broker.acquire(
  $1::pg_catalog.text,
  $2::pg_catalog.text,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text,
  $7::pg_catalog.text,
  $8::pg_catalog.text,
  $9::pg_catalog.text,
  $10::pg_catalog.text,
  $11::pg_catalog.timestamptz
) as data`;
const BIND_SQL = `select careslink_v1_runtime_broker.bind(
  $1::pg_catalog.text,
  $2::pg_catalog.int4
) as data`;
const TOMBSTONE_SQL = `select careslink_v1_runtime_broker.tombstone(
  $1::pg_catalog.text
) as data`;
const FINALIZE_SQL = `select careslink_v1_runtime_broker.finalize(
  $1::pg_catalog.text
) as data`;
const INSPECT_SQL = `select careslink_v1_runtime_broker.inspect(
  $1::pg_catalog.text
) as data`;
const TERMINAL_FENCE_PROBE_SQL =
  `select careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
  $1::pg_catalog.jsonb,
  $2::pg_catalog.text,
  $3::pg_catalog.text
) as data`;

type PgQueryResult = Readonly<{
  rowCount: number | null;
  rows: readonly unknown[];
}>;

function resultWithRow(row: Readonly<Record<string, unknown>>): PgQueryResult {
  return Object.freeze({
    rowCount: 1,
    rows: Object.freeze([Object.freeze({ ...row })]),
  });
}

type PgClient = Readonly<{
  connect(): Promise<void>;
  end(): Promise<void>;
  on(event: "error", listener: () => void): PgClient;
  query(sql: string, values?: readonly unknown[]): Promise<PgQueryResult>;
  connection?: Readonly<{
    stream?: Readonly<{
      encrypted?: boolean;
      authorized?: boolean;
      authorizationError?: unknown;
    }>;
  }>;
}>;

type PgClientOptions = Readonly<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  application_name: string;
  connectionTimeoutMillis: number;
  query_timeout: number;
  statement_timeout?: number;
  options: string;
  client_encoding: "UTF8";
  sslnegotiation: "postgres";
  ssl: Readonly<{ ca: string; rejectUnauthorized: true }>;
}>;

type PgClientConstructor = new (options: PgClientOptions) => PgClient;

type HostedEnvironment = Readonly<{
  enabled?: string;
  acquisitionDigest?: unknown;
  databaseHost?: unknown;
  databasePort?: unknown;
  databaseName?: unknown;
  adminDatabaseUser?: unknown;
  adminDatabasePassword?: unknown;
  credentialVerifierSha256?: unknown;
  crossDatabaseAcquisitionDigest?: unknown;
  crossDatabaseCredentialVerifierSha256?: unknown;
  crossDatabaseLeaseReferenceSha256?: unknown;
  crossDatabaseRuntimeDatabasePassword?: unknown;
  crossDatabaseRuntimeDatabaseUser?: unknown;
  crossDatabaseRuntimeRole?: unknown;
  crossDatabaseScramVerifier?: unknown;
  crossDatabaseSessionBindingSha256?: unknown;
  databaseTargetDigest?: unknown;
  expectedBranchRef?: unknown;
  expectedPostgresMajor?: unknown;
  leaseReferenceSha256?: unknown;
  runtimeApplicationName?: unknown;
  runtimeDatabasePassword?: unknown;
  runtimeDatabaseUser?: unknown;
  runtimeRole?: unknown;
  scramVerifier?: unknown;
  sessionBindingSha256?: unknown;
  sslRootCertPath?: unknown;
  expectedSslRootCertSha256?: unknown;
}>;

class HostedBrokerLiveError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "HostedBrokerLiveError";
  }
}

const hostedEnvironment = readHostedPipeConfig();

describe("Communication Note M1l disposable Hosted runtime broker gate", () => {
  if (hostedEnvironment.enabled !== "1") {
    it("stays default-off with anonymous pipe-only credential delivery", () => {
      expect(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_HOSTED_LIVE_READY,
      ).toBe(false);
      expect(hostedEnvironment.enabled).not.toBe("1");
      const source = readFileSync(new URL(import.meta.url), "utf8");
      expect(source).not.toContain(["connection", "String"].join(""));
      expect(source).not.toContain(["ssl", "mode"].join(""));
      expect(source).not.toContain(["console", "."].join(""));
      expect(source).toContain("rejectUnauthorized: true");
      expect(source).toContain("readFileSync(CONFIG_FD");
      expect(source).toContain("writeFileSync(STATUS_FD");
    });
  }

  it("locks the cross-database failure instead of permitting a downgrade", () => {
    const source = readFileSync(new URL(import.meta.url), "utf8");
    expect(source).toContain("can_create_database !== true");
    expect(source).toContain("dependencyFailureCode !== \"2BP01\"");
    expect(source).toContain("dependencyFailureRoutine !== \"DropRole\"");
    expect(source).toContain("directUnlinkFailureCode !== \"42501\"");
    expect(source).toContain(
      "directUnlinkFailureRoutine !== \"be_lo_unlink\"",
    );
    expect(source).toContain("granted by current_user");
    expect(source).toContain("set local role");
    expect(source).toContain("createCrossDatabaseResidueAsOwner");
    expect(source).toContain("pg_catalog.aclexplode(");
    expect(source).toContain("pg_catalog.acldefault(");
    expect(source).not.toContain(
      ["has_largeobject", "privilege"].join("_"),
    );
    expect(source).not.toContain(
      ["drainCrossDatabase", "PoolerBackend"].join(""),
    );
    expect(source).toContain("CROSS_DATABASE_CLEANUP_FAILED");
    expect(source).toContain("drop database");
  });

  it("binds and fences the cross runtime before delegated owner creation", () => {
    const source = readFileSync(new URL(import.meta.url), "utf8");
    const hostedFlowStart = source.lastIndexOf(
      "async function runHostedBrokerLiveTest",
    );
    const crossFlowStart = source.indexOf(
      "const crossMaterial = Object.freeze",
      hostedFlowStart,
    );
    const crossFlowEnd = source.indexOf(
      "async function acquireRuntime",
      crossFlowStart,
    );
    expect(hostedFlowStart).toBeGreaterThan(-1);
    expect(crossFlowStart).toBeGreaterThan(hostedFlowStart);
    expect(crossFlowEnd).toBeGreaterThan(crossFlowStart);
    const crossFlow = source.slice(crossFlowStart, crossFlowEnd);
    const bindIndex = crossFlow.indexOf("await bindRuntime(");
    const loginDenialIndex = crossFlow.indexOf("await expectNewLoginDenied(");
    const ownerCreateIndex = crossFlow.indexOf(
      "await createCrossDatabaseResidueAsOwner(",
    );
    const tombstoneIndex = crossFlow.indexOf("await tombstoneRuntime(");

    expect(bindIndex).toBeGreaterThan(-1);
    expect(loginDenialIndex).toBeGreaterThan(bindIndex);
    expect(ownerCreateIndex).toBeGreaterThan(loginDenialIndex);
    expect(tombstoneIndex).toBeGreaterThan(ownerCreateIndex);
  });

  it("maps an unexpected error to its fixed current phase", () => {
    const phaseCode =
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED";
    expect(mapUnexpectedLiveFailure(new Error("sensitive"), phaseCode))
      .toMatchObject({ name: "HostedBrokerLiveError", message: phaseCode });

    const fixed = live("RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED");
    expect(mapUnexpectedLiveFailure(fixed, phaseCode)).toBe(fixed);
  });

  it("keeps the management timeout but leaves broker runtime GUCs role-owned", () => {
    const config = Object.freeze({
      databaseHost: "db.abcdefghijklmnopqrst.supabase.co",
      databasePort: 5432,
      sslRootCertificate: "test-root-certificate",
    }) as ReturnType<typeof requireHostedConfig>;
    const connection = Object.freeze({
      applicationName: RUNTIME_APPLICATION_NAME,
      database: "postgres",
      user:
        "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef",
      password: "test-only-runtime-password",
    });

    const management = createManagementClientOptions(config, connection);
    const runtime = createRuntimeClientOptions(config, connection);

    expect(management.statement_timeout).toBe(9_000);
    expect(Object.hasOwn(runtime, "statement_timeout")).toBe(false);
    expect(runtime.query_timeout).toBe(10_000);
    expect(runtime.options).toBe("-c row_security=on");
  });

  it("creates cross-database residue through a bounded owner transaction", async () => {
    const runtimeRole =
      "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef";
    const membershipExpectations: unknown[][] = [];
    const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      if (sql.includes("exact_membership_count")) {
        membershipExpectations.push([...values]);
        return resultWithRow({
          exact_management_identity: true,
          exact_membership_count: true,
          exact_bootstrap_membership: true,
          exact_delegated_membership: true,
          exact_outbound_membership_count: true,
          exact_caller_membership: true,
          exact_set_capability: true,
        });
      }
      if (sql.includes("exact_bound_runtime_posture")) {
        return resultWithRow({
          exact_current_user: true,
          exact_session_user: true,
          exact_database: true,
          exact_application_name: true,
          database_create_denied: true,
          exact_bound_runtime_posture: true,
        });
      }
      if (sql.includes("lo_create")) {
        return resultWithRow({ large_object_oid: 16_384 });
      }
      if (sql.includes("runtime_owned")) {
        return resultWithRow({
          runtime_owned: true,
          exact_large_object_acl: true,
          exact_owner_dependency: true,
          exact_total_owner_dependency: true,
        });
      }
      return Object.freeze({ rowCount: null, rows: Object.freeze([]) });
    });
    const client = Object.freeze({ query }) as unknown as PgClient;

    await expect(
      createCrossDatabaseResidueAsOwner(client, runtimeRole),
    ).resolves.toBe(16_384);
    expect(membershipExpectations.map((values) => values.slice(1))).toEqual([
      [1, 0, false],
      [2, 1, true],
      [1, 0, false],
      [1, 0, false],
    ]);
    const statements = query.mock.calls.map(([sql]) => sql);
    let previousIndex = -1;
    for (const expected of [
      "begin",
      "granted by current_user",
      "set local role",
      "exact_bound_runtime_posture",
      "lo_create",
      "grant all privileges on large object",
      "reset role",
      "runtime_owned",
      "revoke",
      "commit",
      "runtime_owned",
    ]) {
      const index = statements.findIndex(
        (statement, candidateIndex) =>
          candidateIndex > previousIndex && statement.includes(expected),
      );
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });

  it("rolls back an owner-creation failure and proves membership restoration", async () => {
    const runtimeRole =
      "careslink_v1_preview_runner_terminal_runtime_fedcba9876543210";
    let membershipProbeCount = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("exact_membership_count")) {
        membershipProbeCount += 1;
        return resultWithRow({
          exact_management_identity: true,
          exact_membership_count: true,
          exact_bootstrap_membership: true,
          exact_delegated_membership: true,
          exact_outbound_membership_count: true,
          exact_caller_membership: true,
          exact_set_capability: true,
        });
      }
      if (sql.includes("exact_bound_runtime_posture")) {
        return resultWithRow({
          exact_current_user: true,
          exact_session_user: true,
          exact_database: true,
          exact_application_name: true,
          database_create_denied: true,
          exact_bound_runtime_posture: true,
        });
      }
      if (sql.includes("lo_create")) throw new Error("sensitive");
      return Object.freeze({ rowCount: null, rows: Object.freeze([]) });
    });
    const client = Object.freeze({ query }) as unknown as PgClient;

    await expect(
      createCrossDatabaseResidueAsOwner(client, runtimeRole),
    ).rejects.toMatchObject({
      name: "HostedBrokerLiveError",
      message: CROSS_DATABASE_OWNER_CREATE_FAILED,
    });
    expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
    expect(query.mock.calls.map(([sql]) => sql)).not.toContain("commit");
    expect(membershipProbeCount).toBe(3);
  });

  it("keeps owner attestation failure distinct and rolls it back", async () => {
    const runtimeRole =
      "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("exact_membership_count")) {
        return resultWithRow({
          exact_management_identity: true,
          exact_membership_count: true,
          exact_bootstrap_membership: true,
          exact_delegated_membership: true,
          exact_outbound_membership_count: true,
          exact_caller_membership: true,
          exact_set_capability: true,
        });
      }
      if (sql.includes("exact_bound_runtime_posture")) {
        return resultWithRow({
          exact_current_user: true,
          exact_session_user: true,
          exact_database: true,
          exact_application_name: true,
          database_create_denied: true,
          exact_bound_runtime_posture: true,
        });
      }
      if (sql.includes("lo_create")) {
        return resultWithRow({ large_object_oid: 16_385 });
      }
      if (sql.includes("runtime_owned")) {
        return resultWithRow({
          runtime_owned: false,
          exact_large_object_acl: true,
          exact_owner_dependency: true,
          exact_total_owner_dependency: true,
        });
      }
      return Object.freeze({ rowCount: null, rows: Object.freeze([]) });
    });
    const client = Object.freeze({ query }) as unknown as PgClient;

    await expect(
      createCrossDatabaseResidueAsOwner(client, runtimeRole),
    ).rejects.toMatchObject({
      name: "HostedBrokerLiveError",
      message: CROSS_DATABASE_OWNER_ATTESTATION_FAILED,
    });
    expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
  });

  it("unlinks as the exact owner and restores the bootstrap membership", async () => {
    const runtimeRole =
      "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef";
    const membershipExpectations: unknown[][] = [];
    let unlinkAttempt = 0;
    const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      if (sql.includes("exact_membership_count")) {
        membershipExpectations.push([...values]);
        return resultWithRow({
          exact_membership_count: true,
          exact_bootstrap_membership: true,
          exact_delegated_membership: true,
          exact_outbound_membership_count: true,
          exact_caller_membership: true,
          exact_set_capability: true,
          exact_management_identity: true,
        });
      }
      if (sql.includes("owner_dependency_absent")) {
        return resultWithRow({
          object_absent: true,
          owner_dependency_absent: true,
        });
      }
      if (sql.includes("lo_unlink")) {
        unlinkAttempt += 1;
        if (unlinkAttempt === 1) {
          throw Object.assign(new Error("not owner"), {
            code: "42501",
            routine: "be_lo_unlink",
          });
        }
        return resultWithRow({ removed: 1 });
      }
      if (sql.includes("exact_current_user")) {
        return resultWithRow({
          exact_current_user: true,
          exact_session_user: true,
          exact_owner: true,
        });
      }
      return Object.freeze({ rowCount: null, rows: Object.freeze([]) });
    });
    const client = Object.freeze({ query }) as unknown as PgClient;

    await expect(
      unlinkCrossDatabaseResidueAsOwner(client, 16_384, runtimeRole),
    ).resolves.toBeUndefined();
    expect(membershipExpectations.map((values) => values.slice(1))).toEqual([
      [1, 0, false],
      [2, 1, true],
      [1, 0, false],
      [1, 0, false],
    ]);
    const statements = query.mock.calls.map(([sql]) => sql);
    let previousIndex = -1;
    for (const expected of [
      "begin",
      "savepoint careslink_m1l_direct_unlink_denial",
      "lo_unlink",
      "rollback to savepoint careslink_m1l_direct_unlink_denial",
      "release savepoint careslink_m1l_direct_unlink_denial",
      "granted by current_user",
      "set local role",
      "lo_unlink",
      "reset role",
      "revoke",
      "commit",
    ]) {
      const index = statements.findIndex(
        (statement, candidateIndex) =>
          candidateIndex > previousIndex && statement.includes(expected),
      );
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    const commitIndex = statements.indexOf("commit");
    const absenceProofIndexes = statements.flatMap((statement, index) =>
      statement.includes("owner_dependency_absent") ? [index] : []
    );
    expect(absenceProofIndexes).toHaveLength(2);
    expect(absenceProofIndexes[0]).toBeLessThan(commitIndex);
    expect(absenceProofIndexes[1]).toBeGreaterThan(commitIndex);
  });

  it("rolls back and fixes an unexpected direct-unlink diagnostic", async () => {
    const runtimeRole =
      "careslink_v1_preview_runner_terminal_runtime_fedcba9876543210";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("exact_membership_count")) {
        return resultWithRow({
          exact_membership_count: true,
          exact_bootstrap_membership: true,
          exact_delegated_membership: true,
          exact_outbound_membership_count: true,
          exact_caller_membership: true,
          exact_set_capability: true,
          exact_management_identity: true,
        });
      }
      if (sql.includes("lo_unlink")) {
        throw Object.assign(new Error("unclassified"), {
          code: "42501",
          routine: "unexpected",
        });
      }
      return Object.freeze({ rowCount: null, rows: Object.freeze([]) });
    });
    const client = Object.freeze({ query }) as unknown as PgClient;

    await expect(
      unlinkCrossDatabaseResidueAsOwner(client, 16_385, runtimeRole),
    ).rejects.toMatchObject({
      name: "HostedBrokerLiveError",
      message:
        "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED",
    });
    expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
    expect(query.mock.calls.some(([sql]) => sql.includes("grant "))).toBe(
      false,
    );
  });

  it("restores the savepoint when a direct unlink unexpectedly succeeds", async () => {
    const runtimeRole =
      "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("exact_membership_count")) {
        return resultWithRow({
          exact_management_identity: true,
          exact_membership_count: true,
          exact_bootstrap_membership: true,
          exact_delegated_membership: true,
          exact_outbound_membership_count: true,
          exact_caller_membership: true,
          exact_set_capability: true,
        });
      }
      if (sql.includes("lo_unlink")) {
        return resultWithRow({ removed: 1 });
      }
      return Object.freeze({ rowCount: null, rows: Object.freeze([]) });
    });
    const client = Object.freeze({ query }) as unknown as PgClient;

    await expect(
      unlinkCrossDatabaseResidueAsOwner(client, 16_386, runtimeRole),
    ).rejects.toMatchObject({
      name: "HostedBrokerLiveError",
      message:
        "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED",
    });
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements).toContain(
      "rollback to savepoint careslink_m1l_direct_unlink_denial",
    );
    expect(statements).toContain("rollback");
    expect(statements.some((sql) => sql.includes("grant "))).toBe(false);
  });

  if (hostedEnvironment.enabled === "1") {
    it(
      "runs signed ACCEPTED and cross-database ownership residue on PG17",
      { timeout: 90_000 },
      async () => {
        try {
          await runHostedBrokerLiveTest();
          writeHostedChildStatus(SUCCESS_STATUS);
        } catch (error) {
          writeHostedChildStatus(safeLiveErrorCode(error));
          throw error;
        }
      },
    );
  }
});

async function runHostedBrokerLiveTest() {
  const config = requireHostedConfig(hostedEnvironment);
  const Client = loadPgClient();
  const adminOptions = createManagementClientOptions(config, {
    applicationName: MANAGEMENT_APPLICATION_NAME,
    database: "postgres",
    user: config.adminDatabaseUser,
    password: config.adminDatabasePassword,
  });
  const admin = new Client(adminOptions);
  admin.on("error", () => {});
  let adminConnected = false;
  let runtime: PgClient | null = null;
  let remoteAdmin: PgClient | null = null;
  let databaseCreated = false;
  const acquiredDigests = new Set<string>();
  let largeObjectOid = 0;
  let phaseFailureCode =
    "RUNTIME_BROKER_HOSTED_LIVE_ADMIN_CONNECTION_FAILED";

  try {
    await connect(admin, "RUNTIME_BROKER_HOSTED_LIVE_ADMIN_CONNECTION_FAILED");
    adminConnected = true;
    const adminQueryPort = createPgQueryPort(admin);
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_ACTIVE_POSTURE_FAILED";
    const management = requireSingleRow(
      await admin.query(MANAGEMENT_POSTURE_SQL),
      "RUNTIME_BROKER_HOSTED_LIVE_ACTIVE_POSTURE_FAILED",
    );
    if (
      management.current_user !== "postgres" ||
      management.session_user !== "postgres" ||
      management.database_name !== "postgres" ||
      management.application_name !== MANAGEMENT_APPLICATION_NAME ||
      Number(management.postgres_major) !== 17 ||
      management.can_create_role !== true ||
      management.bypass_rls !== true ||
      management.not_superuser !== true ||
      !isTimestamp(management.database_now)
    ) {
      throw live("RUNTIME_BROKER_HOSTED_LIVE_ACTIVE_POSTURE_FAILED");
    }
    if (management.can_create_database !== true) {
      throw live("RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CREATE_DENIED");
    }
    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_PREPARE_FAILED";
    const prepared =
      await prepareTestOnlyCaresLinkV1CommunicationNotePreviewRuntimeBrokerHostedLiveGate(
        {
          adminQueryPort,
          expectedPostgresMajor: 17,
          setupSql,
        },
      );
    const primaryMaterial = Object.freeze({
      acquisitionDigest: config.acquisitionDigest,
      credentialVerifierSha256: config.credentialVerifierSha256,
      leaseReferenceSha256: config.leaseReferenceSha256,
      runtimeDatabasePassword: config.runtimeDatabasePassword,
      runtimeDatabaseUser: config.runtimeDatabaseUser,
      runtimeRole: config.runtimeRole,
      scramVerifier: config.scramVerifier,
      sessionBindingSha256: config.sessionBindingSha256,
    });
    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_ACQUIRE_FAILED";
    await acquireRuntime(
      admin,
      prepared.brokerBinding,
      config.databaseTargetDigest,
      primaryMaterial,
      addSeconds(String(management.database_now), 75),
    );
    acquiredDigests.add(primaryMaterial.acquisitionDigest);
    const primaryRuntimeBase = Object.freeze({
      applicationName: RUNTIME_APPLICATION_NAME,
      user: primaryMaterial.runtimeDatabaseUser,
      password: primaryMaterial.runtimeDatabasePassword,
    });
    runtime = new Client(createRuntimeClientOptions(config, {
      ...primaryRuntimeBase,
      database: "postgres",
    }));
    runtime.on("error", () => {});
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_CONNECTION_FAILED";
    await connect(
      runtime,
      "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_CONNECTION_FAILED",
    );
    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED";
    const backend = requireSingleRow(
      await runtime.query(
        "select pg_catalog.pg_backend_pid()::pg_catalog.int4 as backend_pid",
      ),
      "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED",
    );
    const backendPid = Number(backend.backend_pid);
    if (!Number.isSafeInteger(backendPid) || backendPid <= 0) {
      throw live("RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED");
    }
    await bindRuntime(
      admin,
      primaryMaterial.acquisitionDigest,
      primaryMaterial.runtimeRole,
      backendPid,
    );

    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_SIGNED_TERMINAL_FAILED";
    const evidence =
      await runTestOnlyCaresLinkV1CommunicationNotePreviewPreparedRuntimeBrokerHostedLiveGate(
        {
          prepared: prepared.prepared,
          runtimeQueryPort: createPgQueryPort(runtime),
          runtimeRole: primaryMaterial.runtimeRole,
        },
      );
    if (
      evidence.ok !== true ||
      evidence.terminalState !== "ACCEPTED" ||
      evidence.firstCreated !== true ||
      evidence.exactReplayCreated !== false ||
      evidence.validConflictRejected !== true ||
      evidence.conflictCode !== "IDEMPOTENCY_CONFLICT" ||
      evidence.finalExpectedLedgerCounts.join(",") !== "1,0,1,1,1,1"
    ) {
      throw live("RUNTIME_BROKER_HOSTED_LIVE_SIGNED_TERMINAL_FAILED");
    }
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_NEW_LOGIN_DENIAL_FAILED";
    await expectNewLoginDenied(
      Client,
      createRuntimeClientOptions(config, {
        ...primaryRuntimeBase,
        database: "postgres",
      }),
    );
    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_TOMBSTONE_FAILED";
    await tombstoneRuntime(admin, primaryMaterial.acquisitionDigest);
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_POSTURE_FAILED";
    await expectTombstonedRuntimeFence(runtime, prepared.brokerBinding);
    await close(
      runtime,
      "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_POSTURE_FAILED",
    );
    runtime = null;
    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_FINALIZE_FAILED";
    await finalizeAndInspect(admin, primaryMaterial.acquisitionDigest);

    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CREATE_DENIED";
    await requireCrossDatabaseAbsent(admin);
    try {
      await admin.query(
        `create database ${CROSS_DATABASE_NAME} with template template0`,
      );
    } catch {
      throw live("RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CREATE_DENIED");
    }
    databaseCreated = true;
    await requireCrossDatabaseCreated(admin);
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_POSTGRES_MAJOR_FAILED";
    const crossClock = requireSingleRow(
      await admin.query(MANAGEMENT_POSTURE_SQL),
      "RUNTIME_BROKER_HOSTED_LIVE_POSTGRES_MAJOR_FAILED",
    );
    if (!isTimestamp(crossClock.database_now)) {
      throw live("RUNTIME_BROKER_HOSTED_LIVE_POSTGRES_MAJOR_FAILED");
    }
    const crossMaterial = Object.freeze({
      acquisitionDigest: config.crossDatabaseAcquisitionDigest,
      credentialVerifierSha256:
        config.crossDatabaseCredentialVerifierSha256,
      leaseReferenceSha256: config.crossDatabaseLeaseReferenceSha256,
      runtimeDatabasePassword:
        config.crossDatabaseRuntimeDatabasePassword,
      runtimeDatabaseUser: config.crossDatabaseRuntimeDatabaseUser,
      runtimeRole: config.crossDatabaseRuntimeRole,
      scramVerifier: config.crossDatabaseScramVerifier,
      sessionBindingSha256: config.crossDatabaseSessionBindingSha256,
    });
    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_ACQUIRE_FAILED";
    await acquireRuntime(
      admin,
      prepared.brokerBinding,
      config.databaseTargetDigest,
      crossMaterial,
      addSeconds(String(crossClock.database_now), 75),
    );
    acquiredDigests.add(crossMaterial.acquisitionDigest);
    const crossRuntimeBase = Object.freeze({
      applicationName: RUNTIME_APPLICATION_NAME,
      user: crossMaterial.runtimeDatabaseUser,
      password: crossMaterial.runtimeDatabasePassword,
    });
    runtime = new Client(createRuntimeClientOptions(config, {
      ...crossRuntimeBase,
      database: "postgres",
    }));
    runtime.on("error", () => {});
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_CONNECTION_FAILED";
    await connect(
      runtime,
      "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_CONNECTION_FAILED",
    );
    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED";
    const crossBackend = requireSingleRow(
      await runtime.query(
        "select pg_catalog.pg_backend_pid()::pg_catalog.int4 as backend_pid",
      ),
      "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED",
    );
    const crossBackendPid = Number(crossBackend.backend_pid);
    if (!Number.isSafeInteger(crossBackendPid) || crossBackendPid <= 0) {
      throw live("RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED");
    }
    await bindRuntime(
      admin,
      crossMaterial.acquisitionDigest,
      crossMaterial.runtimeRole,
      crossBackendPid,
    );
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_NEW_LOGIN_DENIAL_FAILED";
    await expectNewLoginDenied(
      Client,
      createRuntimeClientOptions(config, {
        ...crossRuntimeBase,
        database: "postgres",
      }),
    );
    remoteAdmin = new Client(createManagementClientOptions(config, {
      applicationName: MANAGEMENT_APPLICATION_NAME,
      database: CROSS_DATABASE_NAME,
      user: config.adminDatabaseUser,
      password: config.adminDatabasePassword,
    }));
    remoteAdmin.on("error", () => {});
    phaseFailureCode = CROSS_DATABASE_RESIDUE_CONNECTION_FAILED;
    await connect(remoteAdmin, CROSS_DATABASE_RESIDUE_CONNECTION_FAILED);
    phaseFailureCode = CROSS_DATABASE_OWNER_CREATE_FAILED;
    largeObjectOid = await createCrossDatabaseResidueAsOwner(
      remoteAdmin,
      crossMaterial.runtimeRole,
    );
    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_TOMBSTONE_FAILED";
    await tombstoneRuntime(admin, crossMaterial.acquisitionDigest);
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_POSTURE_FAILED";
    await expectTombstonedRuntimeFence(runtime, prepared.brokerBinding);
    await close(
      runtime,
      CROSS_DATABASE_RUNTIME_CLOSE_FAILED,
    );
    runtime = null;

    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_FINALIZE_FAILED";
    let dependencyFailureCode = "";
    let dependencyFailureRoutine = "";
    try {
      await admin.query(FINALIZE_SQL, [crossMaterial.acquisitionDigest]);
    } catch (error) {
      dependencyFailureCode = safeErrorProperty(error, "code");
      dependencyFailureRoutine = safeErrorProperty(error, "routine");
    }
    if (
      dependencyFailureCode !== "2BP01" ||
      dependencyFailureRoutine !== "DropRole"
    ) {
      throw live(
        "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_FINALIZE_FAILED",
      );
    }
    phaseFailureCode = CROSS_DATABASE_TOMBSTONE_ROLLBACK_FAILED;
    await requireTombstonedResidue(
      admin,
      crossMaterial.acquisitionDigest,
      crossMaterial.runtimeRole,
    );

    phaseFailureCode = CROSS_DATABASE_RESIDUE_ATTESTATION_FAILED;
    await requireCrossDatabaseResidue(
      remoteAdmin,
      largeObjectOid,
      crossMaterial.runtimeRole,
      CROSS_DATABASE_RESIDUE_ATTESTATION_FAILED,
    );
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED";
    await unlinkCrossDatabaseResidueAsOwner(
      remoteAdmin,
      largeObjectOid,
      crossMaterial.runtimeRole,
    );
    await requireCrossDatabaseResidueAbsent(
      remoteAdmin,
      largeObjectOid,
      crossMaterial.runtimeRole,
    );
    largeObjectOid = 0;
    await close(
      remoteAdmin,
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED",
    );
    remoteAdmin = null;

    phaseFailureCode = "RUNTIME_BROKER_HOSTED_LIVE_FINALIZE_FAILED";
    await finalizeAndInspect(admin, crossMaterial.acquisitionDigest);
    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_LEDGER_POSTCHECK_FAILED";
    await requireFinalPosture(admin, [
      primaryMaterial.runtimeRole,
      crossMaterial.runtimeRole,
    ]);

    phaseFailureCode =
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED";
    await admin.query(`drop database ${CROSS_DATABASE_NAME} with (force)`);
    databaseCreated = false;
    await requireCrossDatabaseAbsent(
      admin,
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED",
    );
  } catch (error) {
    throw mapUnexpectedLiveFailure(error, phaseFailureCode);
  } finally {
    await closeQuietly(runtime);
    await closeQuietly(remoteAdmin);
    if (adminConnected) {
      for (const digest of acquiredDigests) {
        await bestEffortBrokerCleanup(admin, digest);
      }
    }
    if (adminConnected && databaseCreated) {
      await bestEffortCrossDatabaseCleanup(
        Client,
        config,
        admin,
        largeObjectOid,
      );
    }
    if (adminConnected) {
      for (const digest of acquiredDigests) {
        await bestEffortBrokerCleanup(admin, digest);
      }
    }
    if (adminConnected) await closeQuietly(admin);
  }
}

type HostedRuntimeMaterial = Readonly<{
  acquisitionDigest: string;
  credentialVerifierSha256: string;
  leaseReferenceSha256: string;
  runtimeDatabasePassword: string;
  runtimeDatabaseUser: string;
  runtimeRole: string;
  scramVerifier: string;
  sessionBindingSha256: string;
}>;

async function acquireRuntime(
  admin: PgClient,
  binding: Readonly<{
    authorizationDigest: string;
    runIdHash: string;
    callerIdentityHmac: string;
  }>,
  databaseTargetDigest: string,
  material: HostedRuntimeMaterial,
  expiresAt: string,
) {
  const receipt = requireDataReceipt(
    await admin.query(ACQUIRE_SQL, [
      material.acquisitionDigest,
      binding.authorizationDigest,
      binding.runIdHash,
      databaseTargetDigest,
      binding.callerIdentityHmac,
      material.runtimeRole,
      material.leaseReferenceSha256,
      material.sessionBindingSha256,
      material.scramVerifier,
      material.credentialVerifierSha256,
      expiresAt,
    ]),
    "RUNTIME_BROKER_HOSTED_LIVE_ACQUIRE_FAILED",
  );
  if (
    receipt.status !== "ISSUED_UNBOUND" ||
    receipt.runtimeRole !== material.runtimeRole ||
    receipt.credentialVerifierSha256 !==
      material.credentialVerifierSha256 ||
    receipt.leaseReferenceSha256 !== material.leaseReferenceSha256 ||
    receipt.sessionBindingSha256 !== material.sessionBindingSha256 ||
    receipt.expiresAt !== expiresAt ||
    receipt.rawCredentialMaterialPresent !== false ||
    receipt.acquisitionRequestDigest !== material.acquisitionDigest
  ) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_ACQUIRE_FAILED");
  }
}

async function bindRuntime(
  admin: PgClient,
  acquisitionDigest: string,
  runtimeRole: string,
  backendPid: number,
) {
  const receipt = requireDataReceipt(
    await admin.query(BIND_SQL, [acquisitionDigest, backendPid]),
    "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED",
  );
  if (
    receipt.status !== "ACTIVE" ||
    receipt.runtimeRole !== runtimeRole ||
    receipt.backendPid !== backendPid ||
    receipt.acquisitionRequestDigest !== acquisitionDigest ||
    receipt.rawCredentialMaterialPresent !== false
  ) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED");
  }
}

async function tombstoneRuntime(admin: PgClient, acquisitionDigest: string) {
  const receipt = requireDataReceipt(
    await admin.query(TOMBSTONE_SQL, [acquisitionDigest]),
    "RUNTIME_BROKER_HOSTED_LIVE_TOMBSTONE_FAILED",
  );
  if (
    receipt.status !== "TOMBSTONED" ||
    receipt.futureIssuanceBlocked !== true ||
    receipt.rawCredentialMaterialPresent !== false ||
    receipt.everIssued !== true
  ) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_TOMBSTONE_FAILED");
  }
}

async function finalizeAndInspect(
  admin: PgClient,
  acquisitionDigest: string,
) {
  const finalized = requireDataReceipt(
    await admin.query(FINALIZE_SQL, [acquisitionDigest]),
    "RUNTIME_BROKER_HOSTED_LIVE_FINALIZE_FAILED",
  );
  requireZeroResidueReceipt(
    finalized,
    "REVOKED",
    "RUNTIME_BROKER_HOSTED_LIVE_FINALIZE_FAILED",
  );
  const inspected = requireDataReceipt(
    await admin.query(INSPECT_SQL, [acquisitionDigest]),
    "RUNTIME_BROKER_HOSTED_LIVE_INSPECT_FAILED",
  );
  requireZeroResidueReceipt(
    inspected,
    "REVOKED_ATTESTED",
    "RUNTIME_BROKER_HOSTED_LIVE_INSPECT_FAILED",
  );
  if (Number(inspected.credentialVerifierResidueCount) !== 0) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_INSPECT_FAILED");
  }
}

function createClientOptions(
  config: ReturnType<typeof requireHostedConfig>,
  value: Readonly<{
    applicationName: string;
    database: string;
    user: string;
    password: string;
  }>,
): PgClientOptions {
  return Object.freeze({
    host: config.databaseHost,
    port: config.databasePort,
    database: value.database,
    user: value.user,
    password: value.password,
    application_name: value.applicationName,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    options: "-c row_security=on",
    client_encoding: "UTF8",
    sslnegotiation: "postgres",
    ssl: Object.freeze({
      ca: config.sslRootCertificate,
      rejectUnauthorized: true as const,
    }),
  });
}

function createManagementClientOptions(
  config: ReturnType<typeof requireHostedConfig>,
  value: Parameters<typeof createClientOptions>[1],
): PgClientOptions {
  return Object.freeze({
    ...createClientOptions(config, value),
    statement_timeout: 9_000,
  });
}

function createRuntimeClientOptions(
  config: ReturnType<typeof requireHostedConfig>,
  value: Parameters<typeof createClientOptions>[1],
): PgClientOptions {
  return createClientOptions(config, value);
}

async function createCrossDatabaseResidueAsOwner(
  admin: PgClient,
  runtimeRole: string,
) {
  if (!RUNTIME_ROLE_PATTERN.test(runtimeRole)) {
    throw live(CROSS_DATABASE_OWNER_CREATE_FAILED);
  }
  await requireRuntimeManagementMembership(
    admin,
    runtimeRole,
    false,
    CROSS_DATABASE_OWNER_CREATE_FAILED,
  );
  let oid = 0;
  let transactionActive = false;
  try {
    await admin.query("begin");
    transactionActive = true;
    await admin.query(
      `grant ${runtimeRole} to postgres
        with admin false, inherit false, set true
        granted by current_user`,
    );
    await requireRuntimeManagementMembership(
      admin,
      runtimeRole,
      true,
      CROSS_DATABASE_OWNER_CREATE_FAILED,
    );
    await admin.query(`set local role ${runtimeRole}`);
    const identity = requireSingleRow(
      await admin.query(`select
        current_user = $1 as exact_current_user,
        session_user = 'postgres' as exact_session_user,
        pg_catalog.current_database() = $2 as exact_database,
        pg_catalog.current_setting('application_name') = $3
          as exact_application_name,
        not pg_catalog.has_database_privilege(
          current_user, pg_catalog.current_database(), 'CREATE'
        ) as database_create_denied,
        (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_roles as role_record
          where role_record.oid = pg_catalog.to_regrole(current_user)
            and role_record.rolname = $1
            and not role_record.rolcanlogin
            and not role_record.rolsuper
            and not role_record.rolcreatedb
            and not role_record.rolcreaterole
            and role_record.rolinherit
            and not role_record.rolreplication
            and not role_record.rolbypassrls
            and role_record.rolconnlimit = 1
        ) as exact_bound_runtime_posture`, [
        runtimeRole,
        CROSS_DATABASE_NAME,
        MANAGEMENT_APPLICATION_NAME,
      ]),
      CROSS_DATABASE_OWNER_CREATE_FAILED,
    );
    if (
      identity.exact_current_user !== true ||
      identity.exact_session_user !== true ||
      identity.exact_database !== true ||
      identity.exact_application_name !== true ||
      identity.database_create_denied !== true ||
      identity.exact_bound_runtime_posture !== true
    ) {
      throw live(CROSS_DATABASE_OWNER_CREATE_FAILED);
    }
    const created = requireSingleRow(
      await admin.query(
        "select pg_catalog.lo_create(0)::pg_catalog.oid as large_object_oid",
      ),
      CROSS_DATABASE_OWNER_CREATE_FAILED,
    );
    oid = Number(created.large_object_oid);
    if (!Number.isSafeInteger(oid) || oid <= 0) {
      throw live(CROSS_DATABASE_OWNER_CREATE_FAILED);
    }
    await admin.query(
      `grant all privileges on large object ${oid} to postgres`,
    );
    await admin.query("reset role");
    await requireCrossDatabaseResidue(
      admin,
      oid,
      runtimeRole,
      CROSS_DATABASE_OWNER_ATTESTATION_FAILED,
    );
    await admin.query(
      `revoke ${runtimeRole} from postgres granted by current_user`,
    );
    await requireRuntimeManagementMembership(
      admin,
      runtimeRole,
      false,
      CROSS_DATABASE_OWNER_CREATE_FAILED,
    );
    await admin.query("commit");
    transactionActive = false;
  } catch (error) {
    if (transactionActive) {
      try {
        await admin.query("rollback");
        transactionActive = false;
      } catch {
        throw live(CROSS_DATABASE_OWNER_CREATE_FAILED);
      }
    }
    try {
      await requireRuntimeManagementMembership(
        admin,
        runtimeRole,
        false,
        CROSS_DATABASE_OWNER_CREATE_FAILED,
      );
    } catch {
      throw live(CROSS_DATABASE_OWNER_CREATE_FAILED);
    }
    if (error instanceof HostedBrokerLiveError) throw error;
    throw live(CROSS_DATABASE_OWNER_CREATE_FAILED);
  }
  await requireRuntimeManagementMembership(
    admin,
    runtimeRole,
    false,
    CROSS_DATABASE_OWNER_CREATE_FAILED,
  );
  await requireCrossDatabaseResidue(
    admin,
    oid,
    runtimeRole,
    CROSS_DATABASE_OWNER_ATTESTATION_FAILED,
  );
  return oid;
}

async function requireTombstonedResidue(
  admin: PgClient,
  acquisitionDigest: string,
  runtimeRole: string,
) {
  const code = CROSS_DATABASE_TOMBSTONE_ROLLBACK_FAILED;
  const row = await requireSingleQueryRow(
    admin,
    `select
      acquisition.state = 'TOMBSTONED'
        and acquisition.tombstoned_at is not null
        and acquisition.future_issuance_blocked
        and acquisition.revoked_at is null as ledger_tombstoned,
      role_record.oid = acquisition.runtime_role_oid
        and role_record.rolname = acquisition.runtime_role
        and not role_record.rolcanlogin as role_nologin,
      (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_auth_members as membership
        where membership.member = acquisition.runtime_role_oid
          and membership.roleid = pg_catalog.to_regrole(
            'careslink_v1_preview_runner_terminal_caller'
          )
          and not membership.admin_option
          and membership.inherit_option
          and not membership.set_option
      ) as caller_membership_preserved,
      (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_auth_members as membership
        where membership.member = acquisition.runtime_role_oid
      ) as single_caller_membership
    from careslink_v1_runtime_broker.acquisitions as acquisition
    join pg_catalog.pg_roles as role_record
      on role_record.oid = acquisition.runtime_role_oid
        and role_record.rolname = acquisition.runtime_role
    where acquisition.acquisition_digest = $1
      and acquisition.runtime_role = $2`,
    [acquisitionDigest, runtimeRole],
    code,
  );
  if (
    row.ledger_tombstoned !== true ||
    row.role_nologin !== true ||
    row.caller_membership_preserved !== true ||
    row.single_caller_membership !== true
  ) {
    throw live(code);
  }
}

async function requireCrossDatabaseResidue(
  admin: PgClient,
  oid: number,
  runtimeRole: string,
  code = CROSS_DATABASE_RESIDUE_ATTESTATION_FAILED,
) {
  const row = await requireSingleQueryRow(
    admin,
    `select
      metadata.lomowner = pg_catalog.to_regrole($2) as runtime_owned,
      metadata.lomacl is not null
      and pg_catalog.cardinality(metadata.lomacl) = 2
      and (
        select
          pg_catalog.count(*) = 4
          and pg_catalog.count(*) filter (
            where acl.grantee = metadata.lomowner
              and acl.grantor = metadata.lomowner
              and acl.privilege_type = 'SELECT'
              and not acl.is_grantable
          ) = 1
          and pg_catalog.count(*) filter (
            where acl.grantee = metadata.lomowner
              and acl.grantor = metadata.lomowner
              and acl.privilege_type = 'UPDATE'
              and not acl.is_grantable
          ) = 1
          and pg_catalog.count(*) filter (
            where acl.grantee = pg_catalog.to_regrole('postgres')
              and acl.grantor = metadata.lomowner
              and acl.privilege_type = 'SELECT'
              and not acl.is_grantable
          ) = 1
          and pg_catalog.count(*) filter (
            where acl.grantee = pg_catalog.to_regrole('postgres')
              and acl.grantor = metadata.lomowner
              and acl.privilege_type = 'UPDATE'
              and not acl.is_grantable
          ) = 1
        from pg_catalog.aclexplode(
          coalesce(
            metadata.lomacl,
            pg_catalog.acldefault(
              'L'::pg_catalog."char",
              metadata.lomowner
            )
          )
        ) as acl
      ) as exact_large_object_acl,
      (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = pg_catalog.to_regrole($2)
          and dependency.deptype = 'o'
          and dependency.dbid = (
            select database_record.oid
            from pg_catalog.pg_database as database_record
            where database_record.datname = pg_catalog.current_database()
          )
          and dependency.classid =
            'pg_catalog.pg_largeobject'::pg_catalog.regclass
          and dependency.objid = metadata.oid
          and dependency.objsubid = 0
      ) as exact_owner_dependency,
      (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = pg_catalog.to_regrole($2)
          and dependency.deptype = 'o'
      ) as exact_total_owner_dependency
    from pg_catalog.pg_largeobject_metadata as metadata
    where metadata.oid = $1::pg_catalog.oid`,
    [oid, runtimeRole],
    code,
  );
  if (
    row.runtime_owned !== true ||
    row.exact_large_object_acl !== true ||
    row.exact_owner_dependency !== true ||
    row.exact_total_owner_dependency !== true
  ) {
    throw live(code);
  }
}

async function unlinkCrossDatabaseResidueAsOwner(
  admin: PgClient,
  oid: number,
  runtimeRole: string,
) {
  const code =
    "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED";
  if (
    !Number.isSafeInteger(oid) ||
    oid <= 0 ||
    !RUNTIME_ROLE_PATTERN.test(runtimeRole)
  ) {
    throw live(code);
  }

  await requireRuntimeManagementMembership(admin, runtimeRole, false);
  let transactionActive = false;
  try {
    await admin.query("begin");
    transactionActive = true;
    await admin.query("savepoint careslink_m1l_direct_unlink_denial");

    let directUnlinkFailureCode = "";
    let directUnlinkFailureRoutine = "";
    try {
      await admin.query(
        "select pg_catalog.lo_unlink($1::pg_catalog.oid) as removed",
        [oid],
      );
    } catch (error) {
      directUnlinkFailureCode = safeErrorProperty(error, "code");
      directUnlinkFailureRoutine = safeErrorProperty(error, "routine");
    }
    await admin.query("rollback to savepoint careslink_m1l_direct_unlink_denial");
    await admin.query("release savepoint careslink_m1l_direct_unlink_denial");
    if (
      directUnlinkFailureCode !== "42501" ||
      directUnlinkFailureRoutine !== "be_lo_unlink"
    ) {
      throw live(code);
    }

    await admin.query(
      `grant ${runtimeRole} to postgres
        with admin false, inherit false, set true
        granted by current_user`,
    );
    await requireRuntimeManagementMembership(admin, runtimeRole, true);
    await admin.query(`set local role ${runtimeRole}`);
    const delegatedOwner = requireSingleRow(
      await admin.query(`select
        current_user = $2 as exact_current_user,
        session_user = 'postgres' as exact_session_user,
        metadata.lomowner = pg_catalog.to_regrole($2) as exact_owner
      from pg_catalog.pg_largeobject_metadata as metadata
      where metadata.oid = $1::pg_catalog.oid`, [oid, runtimeRole]),
      code,
    );
    if (
      delegatedOwner.exact_current_user !== true ||
      delegatedOwner.exact_session_user !== true ||
      delegatedOwner.exact_owner !== true
    ) {
      throw live(code);
    }
    const removed = requireSingleRow(
      await admin.query(
        "select pg_catalog.lo_unlink($1::pg_catalog.oid) as removed",
        [oid],
      ),
      code,
    );
    if (Number(removed.removed) !== 1) throw live(code);

    await admin.query("reset role");
    await admin.query(
      `revoke ${runtimeRole} from postgres granted by current_user`,
    );
    await requireRuntimeManagementMembership(admin, runtimeRole, false);
    await requireCrossDatabaseResidueAbsent(admin, oid, runtimeRole);
    await admin.query("commit");
    transactionActive = false;
  } catch (error) {
    if (transactionActive) {
      try {
        await admin.query("rollback");
      } catch {
        // The disposable Preview deletion remains the ultimate boundary.
      }
    }
    if (error instanceof HostedBrokerLiveError) throw error;
    throw live(code);
  }
  await requireRuntimeManagementMembership(admin, runtimeRole, false);
  await requireCrossDatabaseResidueAbsent(admin, oid, runtimeRole);
}

async function requireRuntimeManagementMembership(
  admin: PgClient,
  runtimeRole: string,
  delegatedSetEnabled: boolean,
  code = "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED",
) {
  const expectedMembershipCount = delegatedSetEnabled ? 2 : 1;
  const expectedDelegatedCount = delegatedSetEnabled ? 1 : 0;
  const row = await requireSingleQueryRow(
    admin,
    `select
      (
        select pg_catalog.count(*)
        from pg_catalog.pg_auth_members as membership
        where membership.roleid = pg_catalog.to_regrole($1)
      ) = $2::pg_catalog.int8 as exact_membership_count,
      (
        select pg_catalog.count(*)
        from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as grantor_role
          on grantor_role.oid = membership.grantor
        where membership.roleid = pg_catalog.to_regrole($1)
          and membership.member = pg_catalog.to_regrole('postgres')
          and grantor_role.rolsuper
          and membership.grantor <> membership.member
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
      ) = 1 as exact_bootstrap_membership,
      (
        select pg_catalog.count(*)
        from pg_catalog.pg_auth_members as membership
        where membership.roleid = pg_catalog.to_regrole($1)
          and membership.member = pg_catalog.to_regrole('postgres')
          and membership.grantor = membership.member
          and not membership.admin_option
          and not membership.inherit_option
          and membership.set_option
      ) = $3::pg_catalog.int8 as exact_delegated_membership,
      (
        select pg_catalog.count(*)
        from pg_catalog.pg_auth_members as membership
        where membership.member = pg_catalog.to_regrole($1)
      ) = 1 as exact_outbound_membership_count,
      (
        select pg_catalog.count(*)
        from pg_catalog.pg_auth_members as membership
        where membership.member = pg_catalog.to_regrole($1)
          and membership.roleid = pg_catalog.to_regrole(
            'careslink_v1_preview_runner_terminal_caller'
          )
          and not membership.admin_option
          and membership.inherit_option
          and not membership.set_option
      ) = 1 as exact_caller_membership,
      pg_catalog.pg_has_role('postgres', $1, 'SET') = $4::pg_catalog.bool
        as exact_set_capability,
      current_user = 'postgres' and session_user = 'postgres'
        as exact_management_identity`,
    [
      runtimeRole,
      expectedMembershipCount,
      expectedDelegatedCount,
      delegatedSetEnabled,
    ],
    code,
  );
  if (
    row.exact_membership_count !== true ||
    row.exact_bootstrap_membership !== true ||
    row.exact_delegated_membership !== true ||
    row.exact_outbound_membership_count !== true ||
    row.exact_caller_membership !== true ||
    row.exact_set_capability !== true ||
    row.exact_management_identity !== true
  ) {
    throw live(code);
  }
}

async function requireCrossDatabaseResidueAbsent(
  admin: PgClient,
  oid: number,
  runtimeRole: string,
) {
  const row = requireSingleRow(
    await admin.query(`select
      not exists (
        select 1
        from pg_catalog.pg_largeobject_metadata as metadata
        where metadata.oid = $1::pg_catalog.oid
      ) as object_absent,
      not exists (
        select 1
        from pg_catalog.pg_shdepend as dependency
        where dependency.refclassid =
            'pg_catalog.pg_authid'::pg_catalog.regclass
          and dependency.refobjid = pg_catalog.to_regrole($2)
          and dependency.deptype = 'o'
      ) as owner_dependency_absent`, [oid, runtimeRole]),
    "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED",
  );
  if (row.object_absent !== true || row.owner_dependency_absent !== true) {
    throw live(
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED",
    );
  }
}

async function requireFinalPosture(
  admin: PgClient,
  runtimeRoles: readonly [string, string],
) {
  const row = requireSingleRow(
    await admin.query(`select
      array[
        (select pg_catalog.count(*) from
          careslink_v1_generation.communication_note_preview_authorizations),
        (select pg_catalog.count(*) from
          careslink_v1_generation.communication_note_preview_authorization_revocations),
        (select pg_catalog.count(*) from
          careslink_v1_generation.communication_note_preview_claims),
        (select pg_catalog.count(*) from
          careslink_v1_generation.communication_note_preview_dispatch_reservations),
        (select pg_catalog.count(*) from
          careslink_v1_generation.communication_note_preview_dispatch_receipts),
        (select pg_catalog.count(*) from
          careslink_v1_generation.communication_note_preview_runner_terminals)
      ]::pg_catalog.int8[] as ledger_counts,
      (select pg_catalog.count(*)
        from careslink_v1_runtime_broker.acquisitions as acquisition
        where acquisition.runtime_role = any($2::pg_catalog.text[]))::pg_catalog.int4
        as broker_acquisition_count,
      (select pg_catalog.count(*)
        from careslink_v1_runtime_broker.acquisitions as acquisition
        where acquisition.runtime_role = any($2::pg_catalog.text[])
          and acquisition.state = 'REVOKED'
          and acquisition.revoked_at is not null
          and acquisition.future_issuance_blocked)::pg_catalog.int4
        as broker_revoked_count,
      (select pg_catalog.count(*) from pg_catalog.pg_roles
        where rolname = any($2::pg_catalog.text[]))::pg_catalog.int4
        as runtime_role_count,
      (select pg_catalog.count(*) from pg_catalog.pg_stat_activity
        where usename = any($2::pg_catalog.text[]))::pg_catalog.int4
        as runtime_session_count,
      (select pg_catalog.count(*) from pg_catalog.pg_auth_members
        where member in (
            select acquisition.runtime_role_oid
            from careslink_v1_runtime_broker.acquisitions as acquisition
            where acquisition.runtime_role = any($2::pg_catalog.text[])
          )
          or roleid in (
            select acquisition.runtime_role_oid
            from careslink_v1_runtime_broker.acquisitions as acquisition
            where acquisition.runtime_role = any($2::pg_catalog.text[])
          ))::pg_catalog.int4
        as runtime_membership_count,
      broker_table.relrowsecurity as broker_rls,
      broker_table.relforcerowsecurity as broker_force_rls,
      (
        select pg_catalog.count(*)
        from pg_catalog.unnest($1::pg_catalog.text[]) as api(role_name)
        where pg_catalog.has_schema_privilege(
          api.role_name, 'careslink_v1_runtime_broker', 'USAGE'
        )
          or pg_catalog.has_table_privilege(
            api.role_name,
            'careslink_v1_runtime_broker.acquisitions',
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
          or exists (
            select 1
            from pg_catalog.pg_proc as procedure
            where procedure.pronamespace =
                'careslink_v1_runtime_broker'::pg_catalog.regnamespace
              and procedure.prokind in ('f', 'w')
              and pg_catalog.has_function_privilege(
                api.role_name, procedure.oid, 'EXECUTE'
              )
          )
      )::pg_catalog.int4 as api_privilege_count
    from pg_catalog.pg_class as broker_table
    where broker_table.oid =
      'careslink_v1_runtime_broker.acquisitions'::pg_catalog.regclass`, [
      API_ROLES,
      runtimeRoles,
    ]),
    "RUNTIME_BROKER_HOSTED_LIVE_LEDGER_POSTCHECK_FAILED",
  );
  const counts = Array.isArray(row.ledger_counts)
    ? row.ledger_counts.map(Number)
    : [];
  if (
    counts.join(",") !== "1,0,1,1,1,1" ||
    Number(row.broker_acquisition_count) !== 2 ||
    Number(row.broker_revoked_count) !== 2 ||
    Number(row.runtime_role_count) !== 0 ||
    Number(row.runtime_session_count) !== 0 ||
    Number(row.runtime_membership_count) !== 0 ||
    row.broker_rls !== true ||
    row.broker_force_rls !== true ||
    Number(row.api_privilege_count) !== 0
  ) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_LEDGER_POSTCHECK_FAILED");
  }
}

async function requireCrossDatabaseAbsent(
  admin: PgClient,
  code = "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CREATE_DENIED",
) {
  const row = requireSingleRow(
    await admin.query(`select not exists (
      select 1 from pg_catalog.pg_database where datname = $1
    ) as database_absent`, [CROSS_DATABASE_NAME]),
    code,
  );
  if (row.database_absent !== true) {
    throw live(code);
  }
}

async function requireCrossDatabaseCreated(admin: PgClient) {
  const row = requireSingleRow(
    await admin.query(`select pg_catalog.count(*) = 1 as exact_database
      from pg_catalog.pg_database as database_record
      join pg_catalog.pg_roles as owner_role
        on owner_role.oid = database_record.datdba
      where database_record.datname = $1
        and owner_role.rolname = 'postgres'
        and database_record.datallowconn
        and not database_record.datistemplate`, [CROSS_DATABASE_NAME]),
    "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CREATE_DENIED",
  );
  if (row.exact_database !== true) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CREATE_DENIED");
  }
}

async function expectTombstonedRuntimeFence(
  runtime: PgClient,
  binding: Readonly<{
    authorizationDigest: string;
    runIdHash: string;
    callerIdentityHmac: string;
  }>,
) {
  try {
    await runtime.query(TERMINAL_FENCE_PROBE_SQL, [
      Object.freeze({
        authorizationDigest: binding.authorizationDigest,
        runIdHash: binding.runIdHash,
      }),
      "m1l-hosted-tombstone-fence-probe",
      binding.callerIdentityHmac,
    ]);
  } catch (error) {
    if (
      safeErrorProperty(error, "code") === "P0001" &&
      safeErrorProperty(error, "message") ===
        "RUNTIME_CREDENTIAL_NOT_ACTIVE"
    ) {
      return;
    }
  }
  throw live("RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_POSTURE_FAILED");
}

async function expectNewLoginDenied(
  Client: PgClientConstructor,
  options: PgClientOptions,
) {
  const probe = new Client(options);
  probe.on("error", () => {});
  let connected = false;
  try {
    await probe.connect();
    connected = true;
  } catch (error) {
    if (safeErrorProperty(error, "code").startsWith("28")) return;
    throw live("RUNTIME_BROKER_HOSTED_LIVE_NEW_LOGIN_DENIAL_FAILED");
  } finally {
    if (connected) await closeQuietly(probe);
  }
  throw live("RUNTIME_BROKER_HOSTED_LIVE_NEW_LOGIN_DENIAL_FAILED");
}

function requireZeroResidueReceipt(
  receipt: Readonly<Record<string, unknown>>,
  status: string,
  code: string,
) {
  if (
    receipt.status !== status ||
    receipt.futureIssuanceBlocked !== true ||
    receipt.rawCredentialMaterialPresent !== false ||
    receipt.everIssued !== true ||
    Number(receipt.roleCount) !== 0 ||
    Number(receipt.sessionCount) !== 0 ||
    Number(receipt.membershipCount) !== 0
  ) {
    throw live(code);
  }
}

async function bestEffortBrokerCleanup(
  admin: PgClient,
  acquisitionDigest: string,
) {
  try {
    await admin.query(TOMBSTONE_SQL, [acquisitionDigest]);
  } catch {
    // The ledger may already be TOMBSTONED or REVOKED.
  }
  try {
    await admin.query(FINALIZE_SQL, [acquisitionDigest]);
  } catch {
    // Cross-database residue is removed by the following cleanup stage.
  }
}

async function bestEffortCrossDatabaseCleanup(
  Client: PgClientConstructor,
  config: ReturnType<typeof requireHostedConfig>,
  admin: PgClient,
  largeObjectOid: number,
) {
  if (largeObjectOid > 0) {
    const remote = new Client(createManagementClientOptions(config, {
      applicationName: MANAGEMENT_APPLICATION_NAME,
      database: CROSS_DATABASE_NAME,
      user: config.adminDatabaseUser,
      password: config.adminDatabasePassword,
    }));
    remote.on("error", () => {});
    try {
      await remote.connect();
      await remote.query(
        "select pg_catalog.lo_unlink($1::pg_catalog.oid)",
        [largeObjectOid],
      );
    } catch {
      // The disposable Preview branch remains the ultimate cleanup boundary.
    } finally {
      await closeQuietly(remote);
    }
  }
  try {
    await admin.query(`drop database ${CROSS_DATABASE_NAME} with (force)`);
  } catch {
    // The caller deletes the disposable Preview even on a fixed gate failure.
  }
}

function createPgQueryPort(client: PgClient) {
  return Object.freeze({
    async query(sql: string, values?: readonly unknown[]) {
      const result = await client.query(sql, values);
      return Object.freeze({
        rowCount: result.rowCount,
        rows: result.rows,
      });
    },
  });
}

function readHostedPipeConfig(): HostedEnvironment {
  const enabled = process.env[ENABLE_ENV];
  if (enabled !== "1") return Object.freeze({ enabled });
  if (
    process.env[CONFIG_FD_ENV] !== String(CONFIG_FD) ||
    process.env[STATUS_FD_ENV] !== String(STATUS_FD) ||
    FORBIDDEN_CREDENTIAL_ENVIRONMENT_KEYS.some(
      (key) => process.env[key] !== undefined,
    )
  ) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_CONFIG_PIPE_INVALID");
  }
  let parsed: unknown;
  try {
    const raw = readFileSync(CONFIG_FD, "utf8");
    if (
      raw.length === 0 ||
      Buffer.byteLength(raw, "utf8") > CONFIG_MAXIMUM_BYTES
    ) {
      throw new TypeError("CONFIG_SIZE_INVALID");
    }
    parsed = JSON.parse(raw);
  } catch {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_CONFIG_PIPE_INVALID");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype ||
    Object.keys(parsed).sort().join("\n") !== [
      "acquisitionDigest",
      "adminDatabasePassword",
      "adminDatabaseUser",
      "credentialVerifierSha256",
      "crossDatabaseAcquisitionDigest",
      "crossDatabaseCredentialVerifierSha256",
      "crossDatabaseLeaseReferenceSha256",
      "crossDatabaseRuntimeDatabasePassword",
      "crossDatabaseRuntimeDatabaseUser",
      "crossDatabaseRuntimeRole",
      "crossDatabaseScramVerifier",
      "crossDatabaseSessionBindingSha256",
      "databaseHost",
      "databaseName",
      "databasePort",
      "databaseTargetDigest",
      "expectedBranchRef",
      "expectedPostgresMajor",
      "expectedSslRootCertSha256",
      "leaseReferenceSha256",
      "runtimeApplicationName",
      "runtimeDatabasePassword",
      "runtimeDatabaseUser",
      "runtimeRole",
      "scramVerifier",
      "sessionBindingSha256",
      "sslRootCertPath",
    ].sort().join("\n")
  ) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_CONFIG_PIPE_INVALID");
  }
  return Object.freeze({
    enabled: "1",
    ...(parsed as Omit<HostedEnvironment, "enabled">),
  });
}

function requireHostedConfig(value: HostedEnvironment) {
  const acquisitionDigest = requireText(value.acquisitionDigest);
  const expectedBranchRef = requireText(value.expectedBranchRef);
  const databaseHost = requireText(value.databaseHost).toLowerCase();
  const databasePort = Number(value.databasePort);
  const databaseName = requireText(value.databaseName);
  const adminDatabaseUser = requireText(value.adminDatabaseUser);
  const adminDatabasePassword = requireText(value.adminDatabasePassword);
  const credentialVerifierSha256 = requireText(
    value.credentialVerifierSha256,
  );
  const crossDatabaseAcquisitionDigest = requireText(
    value.crossDatabaseAcquisitionDigest,
  );
  const crossDatabaseCredentialVerifierSha256 = requireText(
    value.crossDatabaseCredentialVerifierSha256,
  );
  const crossDatabaseLeaseReferenceSha256 = requireText(
    value.crossDatabaseLeaseReferenceSha256,
  );
  const crossDatabaseRuntimeDatabasePassword = requireText(
    value.crossDatabaseRuntimeDatabasePassword,
  );
  const crossDatabaseRuntimeDatabaseUser = requireText(
    value.crossDatabaseRuntimeDatabaseUser,
  );
  const crossDatabaseRuntimeRole = requireText(
    value.crossDatabaseRuntimeRole,
  );
  const crossDatabaseScramVerifier = requireText(
    value.crossDatabaseScramVerifier,
  );
  const crossDatabaseSessionBindingSha256 = requireText(
    value.crossDatabaseSessionBindingSha256,
  );
  const databaseTargetDigest = requireText(value.databaseTargetDigest);
  const expectedPostgresMajor = Number(value.expectedPostgresMajor);
  const leaseReferenceSha256 = requireText(value.leaseReferenceSha256);
  const runtimeApplicationName = requireText(value.runtimeApplicationName);
  const runtimeDatabasePassword = requireText(value.runtimeDatabasePassword);
  const runtimeDatabaseUser = requireText(value.runtimeDatabaseUser);
  const runtimeRole = requireText(value.runtimeRole);
  const scramVerifier = requireText(value.scramVerifier);
  const sessionBindingSha256 = requireText(value.sessionBindingSha256);
  const sslRootCertPath = requireText(value.sslRootCertPath);
  const expectedSslRootCertSha256 = requireText(
    value.expectedSslRootCertSha256,
  );
  const direct = databaseHost === `db.${expectedBranchRef}.supabase.co`;
  const sessionPooler = SESSION_POOLER_HOST_PATTERN.test(databaseHost);
  const expectedAdminUser = sessionPooler
    ? `postgres.${expectedBranchRef}`
    : "postgres";
  const expectedRuntimeUser = sessionPooler
    ? `${runtimeRole}.${expectedBranchRef}`
    : runtimeRole;
  const expectedCrossDatabaseRuntimeUser = sessionPooler
    ? `${crossDatabaseRuntimeRole}.${expectedBranchRef}`
    : crossDatabaseRuntimeRole;
  const identityDigests = [
    acquisitionDigest,
    credentialVerifierSha256,
    leaseReferenceSha256,
    sessionBindingSha256,
    crossDatabaseAcquisitionDigest,
    crossDatabaseCredentialVerifierSha256,
    crossDatabaseLeaseReferenceSha256,
    crossDatabaseSessionBindingSha256,
    databaseTargetDigest,
  ];
  if (
    !PROJECT_REF_PATTERN.test(expectedBranchRef) ||
    expectedBranchRef === PRODUCTION_PROJECT_REF ||
    (!direct && !sessionPooler) ||
    databasePort !== 5432 ||
    databaseName !== "postgres" ||
    adminDatabaseUser !== expectedAdminUser ||
    adminDatabasePassword.length < 16 ||
    CONTROL_CHARACTER_PATTERN.test(adminDatabasePassword) ||
    runtimeApplicationName !== RUNTIME_APPLICATION_NAME ||
    runtimeRole !==
      `careslink_v1_preview_runner_terminal_runtime_${acquisitionDigest.slice(0, 16)}` ||
    crossDatabaseRuntimeRole !==
      `careslink_v1_preview_runner_terminal_runtime_${crossDatabaseAcquisitionDigest.slice(0, 16)}` ||
    !RUNTIME_ROLE_PATTERN.test(runtimeRole) ||
    !RUNTIME_ROLE_PATTERN.test(crossDatabaseRuntimeRole) ||
    runtimeRole === crossDatabaseRuntimeRole ||
    runtimeDatabaseUser !== expectedRuntimeUser ||
    crossDatabaseRuntimeDatabaseUser !==
      expectedCrossDatabaseRuntimeUser ||
    runtimeDatabasePassword.length < 16 ||
    crossDatabaseRuntimeDatabasePassword.length < 16 ||
    CONTROL_CHARACTER_PATTERN.test(runtimeDatabasePassword) ||
    CONTROL_CHARACTER_PATTERN.test(crossDatabaseRuntimeDatabasePassword) ||
    new Set([
      adminDatabasePassword,
      runtimeDatabasePassword,
      crossDatabaseRuntimeDatabasePassword,
    ]).size !== 3 ||
    !SCRAM_PATTERN.test(scramVerifier) ||
    !SCRAM_PATTERN.test(crossDatabaseScramVerifier) ||
    sha256(scramVerifier) !== credentialVerifierSha256 ||
    sha256(crossDatabaseScramVerifier) !==
      crossDatabaseCredentialVerifierSha256 ||
    identityDigests.some((digest) => !SHA256_PATTERN.test(digest)) ||
    new Set(identityDigests).size !== identityDigests.length ||
    expectedPostgresMajor !== 17 ||
    !sslRootCertPath.startsWith("/") ||
    !SHA256_PATTERN.test(expectedSslRootCertSha256)
  ) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_CONFIG_INVALID");
  }
  let certificate: Buffer;
  try {
    certificate = readFileSync(sslRootCertPath);
  } catch {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_TLS_INVALID");
  }
  if (
    certificate.length === 0 ||
    certificate.length > 64 * 1_024 ||
    sha256(certificate) !== expectedSslRootCertSha256
  ) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_TLS_INVALID");
  }
  return Object.freeze({
    acquisitionDigest,
    databaseHost,
    databasePort,
    adminDatabaseUser,
    adminDatabasePassword,
    credentialVerifierSha256,
    crossDatabaseAcquisitionDigest,
    crossDatabaseCredentialVerifierSha256,
    crossDatabaseLeaseReferenceSha256,
    crossDatabaseRuntimeDatabasePassword,
    crossDatabaseRuntimeDatabaseUser,
    crossDatabaseRuntimeRole,
    crossDatabaseScramVerifier,
    crossDatabaseSessionBindingSha256,
    databaseTargetDigest,
    expectedBranchRef,
    leaseReferenceSha256,
    runtimeDatabasePassword,
    runtimeDatabaseUser,
    runtimeRole,
    scramVerifier,
    sessionPooler,
    sessionBindingSha256,
    sslRootCertificate: certificate.toString("utf8"),
  });
}

function loadPgClient(): PgClientConstructor {
  try {
    const require = createRequire(import.meta.url);
    const pgPackage = require("pg") as { Client?: PgClientConstructor };
    if (typeof pgPackage.Client !== "function") {
      throw new TypeError("PG_CLIENT_MISSING");
    }
    return pgPackage.Client;
  } catch {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_DRIVER_INVALID");
  }
}

async function connect(client: PgClient, code: string) {
  try {
    await client.connect();
    const stream = client.connection?.stream;
    if (
      stream?.encrypted !== true ||
      stream.authorized !== true ||
      stream.authorizationError != null
    ) {
      throw new TypeError("TLS_NOT_VERIFIED");
    }
  } catch {
    throw live(code);
  }
}

async function close(client: PgClient, code: string) {
  try {
    await client.end();
  } catch {
    throw live(code);
  }
}

async function closeQuietly(client: PgClient | null) {
  if (!client) return;
  try {
    await client.end();
  } catch {
    // The broker or disposable Preview deletion can terminate this session.
  }
}

async function requireSingleQueryRow(
  client: PgClient,
  sql: string,
  values: readonly unknown[],
  code: string,
) {
  try {
    return requireSingleRow(await client.query(sql, values), code);
  } catch (error) {
    if (error instanceof HostedBrokerLiveError) throw error;
    throw live(code);
  }
}

function requireSingleRow(result: PgQueryResult, code: string) {
  if (result.rows.length !== 1) throw live(code);
  const row = result.rows[0];
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    Object.getPrototypeOf(row) !== Object.prototype
  ) {
    throw live(code);
  }
  return row as Readonly<Record<string, unknown>>;
}

function requireDataReceipt(result: PgQueryResult, code: string) {
  const row = requireSingleRow(result, code);
  const data = row.data;
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.getPrototypeOf(data) !== Object.prototype
  ) {
    throw live(code);
  }
  return data as Readonly<Record<string, unknown>>;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function addSeconds(value: string, seconds: number) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_POSTGRES_MAJOR_FAILED");
  }
  return new Date(milliseconds + seconds * 1_000).toISOString();
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function safeErrorProperty(value: unknown, property: string) {
  if (!value || typeof value !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(value, property);
  return descriptor &&
    "value" in descriptor &&
    typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function safeLiveErrorCode(value: unknown) {
  return value instanceof HostedBrokerLiveError &&
      /^RUNTIME_BROKER_HOSTED_LIVE_[A-Z_]+$/.test(value.message)
    ? value.message
    : "RUNTIME_BROKER_HOSTED_LIVE_TEST_FAILED";
}

function mapUnexpectedLiveFailure(value: unknown, phaseCode: string) {
  if (value instanceof HostedBrokerLiveError) return value;
  return /^RUNTIME_BROKER_HOSTED_LIVE_[A-Z_]+$/.test(phaseCode)
    ? live(phaseCode)
    : live("RUNTIME_BROKER_HOSTED_LIVE_TEST_FAILED");
}

function writeHostedChildStatus(value: string) {
  const code = value === SUCCESS_STATUS ||
      /^RUNTIME_BROKER_HOSTED_LIVE_[A-Z_]+$/.test(value)
    ? value
    : "RUNTIME_BROKER_HOSTED_LIVE_TEST_FAILED";
  writeFileSync(STATUS_FD, `${code}\n`, { encoding: "utf8" });
}

function requireText(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw live("RUNTIME_BROKER_HOSTED_LIVE_CONFIG_INVALID");
  }
  return value;
}

function live(code: string) {
  return new HostedBrokerLiveError(code);
}
