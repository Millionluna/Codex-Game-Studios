import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_HOSTED_LIVE_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_MANAGEMENT_APPLICATION_NAME,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_RUNTIME_APPLICATION_NAME,
  assertCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedSqlPolicy,
  drainTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedBackends,
  runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveGate,
  runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedPostcheck,
  runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedQuiesce,
} from "./communication-note-preview-runner-terminal-hosted-live.server";
import {
  createM1ghFailedRunnerTerminalEnvelope,
  createM1ghRunnerTerminalTrustFixture,
} from "./communication-note-preview-runner-terminal-trust-test-fixtures";

vi.mock("server-only", () => ({}));

const ENABLE_ENV = "CARESLINK_V1_M1GH_HOSTED_LIVE_ENABLED";
const CONFIG_FD_ENV = "CARESLINK_V1_M1GH_HOSTED_LIVE_CONFIG_FD";
const HOSTED_CONFIG_FD = 3;
const HOSTED_CONFIG_MAXIMUM_BYTES = 65_536;
const PRODUCTION_PROJECT_REF = "adocsnwnslxhxcjgbyee";
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;

const setupSql = readFileSync(
  new URL(
    "../../../scripts/preview-e2e/communication-note-preview-runner-terminal-valid-chain-setup.sql",
    import.meta.url,
  ),
  "utf8",
);
const quiesceSql = readFileSync(
  new URL(
    "../../../scripts/preview-e2e/communication-note-preview-runner-terminal-identity-quiesce.sql",
    import.meta.url,
  ),
  "utf8",
);
const postcheckSql = readFileSync(
  new URL(
    "../../../scripts/preview-e2e/communication-note-preview-runner-terminal-valid-chain-postcheck.sql",
    import.meta.url,
  ),
  "utf8",
);

type PgQueryResult = Readonly<{
  rowCount: number | null;
  rows: readonly unknown[];
}>;

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

type PgClientConstructor = new (options: Readonly<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  application_name: string;
  connectionTimeoutMillis: number;
  query_timeout: number;
  statement_timeout: number;
  options: string;
  ssl: Readonly<{ ca: string; rejectUnauthorized: true }>;
}>) => PgClient;

class HostedLiveTestError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "HostedLiveTestError";
  }
}

type HostedEnvironment = Readonly<{
  enabled?: string;
  databaseHost?: unknown;
  databasePort?: unknown;
  databaseName?: unknown;
  adminDatabaseUser?: unknown;
  adminDatabasePassword?: unknown;
  runtimeDatabaseUser?: unknown;
  runtimeDatabasePassword?: unknown;
  expectedBranchRef?: unknown;
  expectedPostgresMajor?: unknown;
  runtimeRole?: unknown;
  sslRootCertPath?: unknown;
  expectedSslRootCertSha256?: unknown;
}>;

const hostedEnvironment = readHostedPipeConfig();

describe("Communication Note signed runner-terminal disposable Hosted live gate", () => {
  it("stays default-off and locks the independent setup/postcheck SQL", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_HOSTED_LIVE_READY,
    ).toBe(false);
    expect(
      assertCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedSqlPolicy(
        setupSql,
        postcheckSql,
      ),
    ).toEqual({
      ok: true,
      syntheticOnly: true,
      terminalWriteReservedForRuntime: true,
      exactPreDeleteCountsLocked: true,
      appendOnlyProofLocked: true,
      temporaryLoginOnlyCleanup: true,
    });
  });

  it("builds a DB-clock-bound signed FAILED fixture without enabling ACCEPTED", () => {
    const now = new Date().toISOString();
    const fixture = createM1ghRunnerTerminalTrustFixture({ now });
    const envelope = createM1ghFailedRunnerTerminalEnvelope(fixture, {
      observedAt: now,
      failureReason: "CANCELLED",
    });
    expect(envelope.statement).toMatchObject({
      state: "FAILED",
      failureReason: "CANCELLED",
      usage: null,
      criticalChecks: null,
      humanReviews: null,
      observedAt: now,
    });
    expect(envelope.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });

  it("uses split connection fields so URI parameters cannot override the pinned CA", () => {
    const source = readFileSync(new URL(import.meta.url), "utf8");
    expect(source.includes(["connection", "String"].join(""))).toBe(false);
    expect(source.includes(["ssl", "mode"].join(""))).toBe(false);
    expect(source).toContain("rejectUnauthorized: true");
    expect(source).toContain("password: config.runtimeDatabasePassword");
  });

  if (hostedEnvironment.enabled === "1") {
    it(
      "persists, replays and conflicts through a real temporary Preview LOGIN",
      { timeout: 60_000 },
      async () => {
        await runHostedLiveTest();
      },
    );
  }
});

async function runHostedLiveTest() {
  const config = requireHostedConfig(hostedEnvironment);
  const Client = loadPgClient();
  const admin = new Client({
    host: config.databaseHost,
    port: config.databasePort,
    database: config.databaseName,
    user: config.adminDatabaseUser,
    password: config.adminDatabasePassword,
    application_name:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_MANAGEMENT_APPLICATION_NAME,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 9_000,
    options: "-c row_security=on",
    ssl: Object.freeze({
      ca: config.sslRootCertificate,
      rejectUnauthorized: true as const,
    }),
  });
  const runtimeConnectionOptions = Object.freeze({
    host: config.databaseHost,
    port: config.databasePort,
    database: config.databaseName,
    user: config.runtimeDatabaseUser,
    password: config.runtimeDatabasePassword,
    application_name:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_RUNTIME_APPLICATION_NAME,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 9_000,
    options: "-c row_security=on",
    ssl: Object.freeze({
      ca: config.sslRootCertificate,
      rejectUnauthorized: true as const,
    }),
  });
  const runtime = new Client(runtimeConnectionOptions);
  const adminQueryPort = createPgQueryPort(admin);
  const runtimeQueryPort = createPgQueryPort(runtime);
  let adminConnected = false;
  let runtimeConnected = false;
  let backgroundError = false;
  admin.on("error", () => {
    backgroundError = true;
  });
  runtime.on("error", () => {
    backgroundError = true;
  });
  try {
    await connect(admin);
    adminConnected = true;
    await connect(runtime);
    runtimeConnected = true;
    const evidence =
      await runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveGate(
        {
          adminQueryPort,
          runtimeQueryPort,
          runtimeRole: config.runtimeRole,
          expectedPostgresMajor: config.expectedPostgresMajor,
          setupSql,
        },
      );
    expect(evidence).toMatchObject({
      ok: true,
      terminalState: "FAILED",
      failureReason: "CANCELLED",
      firstCreated: true,
      exactReplayCreated: false,
      validConflictRejected: true,
      conflictCode: "IDEMPOTENCY_CONFLICT",
      sourceTrustCompositionVerified: true,
      actualRuntimeLoginQueryVerified: true,
      finalExpectedLedgerCounts: [1, 0, 1, 1, 1, 1],
      acceptedPathBlockedByUsageContractMismatch: true,
    });
    await runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedQuiesce(
      {
        adminQueryPort,
        runtimeRole: config.runtimeRole,
        quiesceSql,
      },
    );
    await expectNewLoginDenied(Client, runtimeConnectionOptions);
    await close(runtime);
    runtimeConnected = false;
    await drainTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedBackends(
      {
        adminQueryPort,
        runtimeRole: config.runtimeRole,
      },
    );
    const postcheck =
      await runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedPostcheck(
        {
          adminQueryPort,
          runtimeRole: config.runtimeRole,
          expectedPostgresMajor: config.expectedPostgresMajor,
          postcheckSql,
        },
      );
    expect(postcheck).toEqual({
      ok: true,
      temporaryRuntimeLoginDropped: true,
      durableLedgerCounts: [1, 0, 1, 1, 1, 1],
      appendOnlyTriggerEnabled: true,
      ledgerCleanupBoundary: "DISPOSABLE_PREVIEW_BRANCH_DELETION",
    });
    if (backgroundError) {
      throw new HostedLiveTestError(
        "RUNNER_TERMINAL_HOSTED_LIVE_BACKGROUND_CLIENT_ERROR",
      );
    }
  } catch (error) {
    if (error instanceof HostedLiveTestError) throw error;
    throw new HostedLiveTestError("RUNNER_TERMINAL_HOSTED_LIVE_TEST_FAILED");
  } finally {
    if (runtimeConnected) await closeQuietly(runtime);
    if (adminConnected) await closeQuietly(admin);
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
  if (process.env[CONFIG_FD_ENV] !== String(HOSTED_CONFIG_FD)) {
    throw new HostedLiveTestError(
      "RUNNER_TERMINAL_HOSTED_LIVE_CONFIG_PIPE_INVALID",
    );
  }
  let raw: string;
  let parsed: unknown;
  try {
    raw = readFileSync(HOSTED_CONFIG_FD, "utf8");
    if (
      raw.length === 0 ||
      Buffer.byteLength(raw, "utf8") > HOSTED_CONFIG_MAXIMUM_BYTES
    ) {
      throw new TypeError("HOSTED_CONFIG_SIZE_INVALID");
    }
    parsed = JSON.parse(raw);
  } catch {
    throw new HostedLiveTestError(
      "RUNNER_TERMINAL_HOSTED_LIVE_CONFIG_PIPE_INVALID",
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype ||
    Object.keys(parsed).sort().join("\n") !== [
      "adminDatabasePassword",
      "adminDatabaseUser",
      "databaseHost",
      "databaseName",
      "databasePort",
      "expectedBranchRef",
      "expectedPostgresMajor",
      "expectedSslRootCertSha256",
      "runtimeDatabasePassword",
      "runtimeDatabaseUser",
      "runtimeRole",
      "sslRootCertPath",
    ].sort().join("\n")
  ) {
    throw new HostedLiveTestError(
      "RUNNER_TERMINAL_HOSTED_LIVE_CONFIG_PIPE_INVALID",
    );
  }
  return Object.freeze({
    enabled: "1",
    ...(parsed as Omit<HostedEnvironment, "enabled">),
  });
}

function requireHostedConfig(value: HostedEnvironment) {
  const expectedBranchRef = requireText(value.expectedBranchRef);
  const runtimeRole = requireText(value.runtimeRole);
  const expectedPostgresMajor = Number(value.expectedPostgresMajor);
  const databaseHost = requireText(value.databaseHost).toLowerCase();
  const databasePort = Number(value.databasePort);
  const databaseName = requireText(value.databaseName);
  const adminDatabaseUser = requireText(value.adminDatabaseUser);
  const adminDatabasePassword = requireText(value.adminDatabasePassword);
  const runtimeDatabaseUser = requireText(value.runtimeDatabaseUser);
  const runtimeDatabasePassword = requireText(value.runtimeDatabasePassword);
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
  if (
    !PROJECT_REF_PATTERN.test(expectedBranchRef) ||
    expectedBranchRef === PRODUCTION_PROJECT_REF ||
    !RUNTIME_ROLE_PATTERN.test(runtimeRole) ||
    (expectedPostgresMajor !== 16 && expectedPostgresMajor !== 17) ||
    (!direct && !sessionPooler) ||
    databasePort !== 5432 ||
    databaseName !== "postgres" ||
    adminDatabaseUser !== expectedAdminUser ||
    runtimeDatabaseUser !== expectedRuntimeUser ||
    adminDatabasePassword.length < 16 ||
    runtimeDatabasePassword.length < 16 ||
    adminDatabasePassword === runtimeDatabasePassword ||
    CONTROL_CHARACTER_PATTERN.test(adminDatabasePassword) ||
    CONTROL_CHARACTER_PATTERN.test(runtimeDatabasePassword) ||
    !sslRootCertPath.startsWith("/") ||
    !/^[a-f0-9]{64}$/.test(expectedSslRootCertSha256)
  ) {
    throw new HostedLiveTestError(
      "RUNNER_TERMINAL_HOSTED_LIVE_CONFIG_INVALID",
    );
  }
  let certificate: Buffer;
  try {
    certificate = readFileSync(sslRootCertPath);
  } catch {
    throw new HostedLiveTestError("RUNNER_TERMINAL_HOSTED_LIVE_TLS_INVALID");
  }
  if (
    certificate.length === 0 ||
    certificate.length > 64 * 1_024 ||
    createHash("sha256").update(certificate).digest("hex") !==
      expectedSslRootCertSha256
  ) {
    throw new HostedLiveTestError("RUNNER_TERMINAL_HOSTED_LIVE_TLS_INVALID");
  }
  return Object.freeze({
    databaseHost,
    databasePort,
    databaseName,
    adminDatabaseUser,
    adminDatabasePassword,
    runtimeDatabaseUser,
    runtimeDatabasePassword,
    expectedPostgresMajor: expectedPostgresMajor as 16 | 17,
    runtimeRole,
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
    throw new HostedLiveTestError("RUNNER_TERMINAL_HOSTED_LIVE_DRIVER_INVALID");
  }
}

async function connect(client: PgClient) {
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
    throw new HostedLiveTestError(
      "RUNNER_TERMINAL_HOSTED_LIVE_CONNECTION_FAILED",
    );
  }
}

async function expectNewLoginDenied(
  Client: PgClientConstructor,
  options: ConstructorParameters<PgClientConstructor>[0],
) {
  const probe = new Client(options);
  let connected = false;
  try {
    await probe.connect();
    connected = true;
  } catch (error) {
    if (safeErrorCode(error).startsWith("28")) return;
    throw new HostedLiveTestError(
      "RUNNER_TERMINAL_HOSTED_LIVE_NEW_LOGIN_DENIAL_FAILED",
    );
  } finally {
    if (connected) await closeQuietly(probe);
  }
  throw new HostedLiveTestError(
    "RUNNER_TERMINAL_HOSTED_LIVE_NEW_LOGIN_DENIAL_FAILED",
  );
}

async function close(client: PgClient) {
  try {
    await client.end();
  } catch {
    throw new HostedLiveTestError("RUNNER_TERMINAL_HOSTED_LIVE_CLOSE_FAILED");
  }
}

async function closeQuietly(client: PgClient) {
  try {
    await client.end();
  } catch {
    // Disposable Preview deletion remains the final cleanup boundary.
  }
}

function safeErrorCode(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(value, "code");
  return descriptor &&
    "value" in descriptor &&
    typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function requireText(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new HostedLiveTestError("RUNNER_TERMINAL_HOSTED_LIVE_CONFIG_INVALID");
  }
  return value;
}
