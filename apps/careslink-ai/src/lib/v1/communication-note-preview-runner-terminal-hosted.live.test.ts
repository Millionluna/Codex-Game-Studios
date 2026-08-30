import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_HOSTED_LIVE_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_MANAGEMENT_APPLICATION_NAME,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_RUNTIME_APPLICATION_NAME,
  assertCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedSqlPolicy,
  drainTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedBackends,
  prepareTestOnlyCaresLinkV1CommunicationNotePreviewRuntimeBrokerHostedLiveGate,
  runTestOnlyCaresLinkV1CommunicationNotePreviewPreparedRuntimeBrokerHostedLiveGate,
  runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveGate,
  runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedPostcheck,
  runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedQuiesce,
} from "./communication-note-preview-runner-terminal-hosted-live.server";
import {
  createM1giAcceptedRunnerTerminalEnvelope,
  createM1ghRunnerTerminalTrustFixture,
} from "./communication-note-preview-runner-terminal-trust-test-fixtures";
import {
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal,
} from "./communication-note-preview-runner-terminal-policy.server";

vi.mock("server-only", () => ({}));

const ENABLE_ENV = "CARESLINK_V1_M1GI_HOSTED_LIVE_ENABLED";
const CONFIG_FD_ENV = "CARESLINK_V1_M1GI_HOSTED_LIVE_CONFIG_FD";
const STATUS_FD_ENV = "CARESLINK_V1_M1GI_HOSTED_LIVE_STATUS_FD";
const HOSTED_CONFIG_FD = 3;
const HOSTED_STATUS_FD = 4;
const HOSTED_CHILD_SUCCESS = "RUNNER_TERMINAL_HOSTED_LIVE_PASSED";
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
      acceptedUsageProjectionLocked: true,
      temporaryLoginOnlyCleanup: true,
    });
  });

  it("builds a DB-clock-bound signed ACCEPTED fixture with exact nine-key usage", () => {
    const now = new Date().toISOString();
    const fixture = createM1ghRunnerTerminalTrustFixture({ now });
    const envelope = createM1giAcceptedRunnerTerminalEnvelope(fixture, {
      observedAt: now,
    });
    expect(envelope.statement).toMatchObject({
      state: "ACCEPTED",
      failureReason: null,
      usage: {
        source: "PROVIDER",
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
        totalTokensReconciliation: "REPORTED",
        cachedInputTokens: 20,
        cachedInputTokensReconciliation: "REPORTED",
        reasoningTokens: 10,
        reasoningTokensReconciliation: "REPORTED",
      },
      observedAt: now,
    });
    expect(Object.keys(envelope.statement.usage)).toHaveLength(9);
    expect(envelope.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });

  it("verifies both signed reconciliation variants while locking their six receipt facts", () => {
    const now = new Date().toISOString();
    const fixture = createM1ghRunnerTerminalTrustFixture({ now });
    const accepted = createM1giAcceptedRunnerTerminalEnvelope(fixture, {
      observedAt: now,
    });
    const conflict = createM1giAcceptedRunnerTerminalEnvelope(fixture, {
      observedAt: now,
      totalTokensReconciliation: "CALCULATED",
    });
    const verify = (envelope: typeof accepted) =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal(
        envelope,
        {
          trustedKeySnapshot: fixture.runnerTerminalSigner.trustedKey,
          now,
        },
      );
    const verifiedAccepted = verify(accepted);
    const verifiedConflict = verify(conflict);
    const acceptedUsage = verifiedAccepted.statement.usage;
    const conflictUsage = verifiedConflict.statement.usage;
    if (
      !acceptedUsage ||
      !conflictUsage ||
      acceptedUsage.reasoningTokens === null ||
      conflictUsage.reasoningTokens === null
    ) {
      throw new Error("accepted usage expected");
    }
    expect(receiptUsageProjection(acceptedUsage)).toEqual(
      receiptUsageProjection(conflictUsage),
    );
    expect(verifiedAccepted.runnerTerminalDigest).not.toBe(
      verifiedConflict.runnerTerminalDigest,
    );
    expect(acceptedUsage.totalTokensReconciliation)
      .toBe("REPORTED");
    expect(conflictUsage.totalTokensReconciliation)
      .toBe("CALCULATED");
  });

  it("uses split connection fields so URI parameters cannot override the pinned CA", () => {
    const source = readFileSync(new URL(import.meta.url), "utf8");
    expect(source.includes(["connection", "String"].join(""))).toBe(false);
    expect(source.includes(["ssl", "mode"].join(""))).toBe(false);
    expect(source).toContain("rejectUnauthorized: true");
    expect(source).toContain("password: config.runtimeDatabasePassword");
  });

  it("preserves an allowlisted SQL assertion stage and folds arbitrary text", async () => {
    const fixed = "RUNNER_TERMINAL_VALID_SETUP_RECEIPT_FAILED";
    const createAdmin = (error: Error) => Object.freeze({
      async query(sql: string) {
        if (sql === setupSql) throw error;
        if (sql.includes("clock_timestamp")) {
          return Object.freeze({
            rowCount: 1,
            rows: Object.freeze([Object.freeze({
              database_now: "2026-08-29T12:00:00.000Z",
              current_user: "postgres",
              session_user: "postgres",
              database_name: "postgres",
              postgres_major: 17,
            })]),
          });
        }
        return Object.freeze({ rowCount: 0, rows: Object.freeze([]) });
      },
    });
    const runtimeQueryPort = Object.freeze({
      async query() {
        return Object.freeze({ rowCount: 0, rows: Object.freeze([]) });
      },
    });
    const invoke = (error: Error) =>
      runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveGate(
        {
          adminQueryPort: createAdmin(error),
          runtimeQueryPort,
          runtimeRole:
            "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef",
          expectedPostgresMajor: 17,
          setupSql,
        },
      );
    await expect(invoke(new Error(fixed))).rejects.toThrowError(fixed);
    await expect(invoke(new Error("untrusted database text"))).rejects
      .toThrowError("RUNNER_TERMINAL_HOSTED_LIVE_SETUP_FAILED");
  });

  it("runs the full signed chain under the branded M1l inherited runtime identity without SET ROLE", async () => {
    const databaseNow = "2026-08-30T08:00:00.000Z";
    const runtimeRole =
      "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef";
    const adminSql: string[] = [];
    let adaptedSetupSql = "";
    let activeBinding:
      | Readonly<{ authorizationDigest: string; runIdHash: string }>
      | undefined;
    const adminQueryPort = Object.freeze({
      async query(sql: string) {
        adminSql.push(sql);
        if (sql.startsWith("-- TEST_ONLY setup body")) {
          adaptedSetupSql = sql;
          return Object.freeze({ rows: Object.freeze([]) });
        }
        if (sql.includes("clock_timestamp") && sql.includes("current_database")) {
          return Object.freeze({
            rows: Object.freeze([Object.freeze({
              database_now: databaseNow,
              current_user: "postgres",
              session_user: "postgres",
              database_name: "postgres",
              postgres_major: 17,
            })]),
          });
        }
        if (sql.includes("authorization_record.authorization_digest")) {
          if (!activeBinding) throw new Error("missing active binding");
          return Object.freeze({
            rows: Object.freeze([Object.freeze({
              database_now: databaseNow,
              authorization_digest: activeBinding.authorizationDigest,
              run_id_hash: activeBinding.runIdHash,
              claim_id: "00000000-0000-4000-8000-000000000001",
              reservation_id: "00000000-0000-4000-8000-000000000002",
              slot_index: 0,
              fixture_id: "communication.en.phone-duration.v1",
              run_ordinal: 1,
              request_body_sha256:
                "98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213",
              request_body_utf8_byte_length: 2522,
              semantic_canonical_request_sha256:
                "f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68",
              receipt_digest: "1".repeat(64),
              receipt_signature_sha256: "2".repeat(64),
              receipt_usage: {
                source: "PROVIDER",
                inputTokens: 120,
                outputTokens: 80,
                totalTokens: 200,
                cachedInputTokens: 20,
                reasoningTokens: 10,
              },
              calculated_cost_upper_bound_micro_usd: 481,
            })]),
          });
        }
        return Object.freeze({ rows: Object.freeze([]) });
      },
    });
    const runtimeSql: string[] = [];
    let acceptedCalls = 0;
    const runtimeQueryPort = Object.freeze({
      async query(sql: string, values?: readonly unknown[]) {
        runtimeSql.push(sql);
        if (sql.includes("'MEMBER'")) {
          return Object.freeze({ rows: Object.freeze([Object.freeze({
            current_user: runtimeRole,
            session_user: runtimeRole,
            statement_timeout: "5s",
            lock_timeout: "1s",
            idle_in_transaction_session_timeout: "5s",
            idle_session_timeout: "5s",
            caller_member: true,
            caller_set: false,
            caller_inherited: true,
          })]) });
        }
        if (sql.includes("has_function_privilege")) {
          return Object.freeze({ rows: Object.freeze([Object.freeze({
            current_user: runtimeRole,
            session_user: runtimeRole,
            exact_rpc_executable: true,
            generation_schema_create: false,
          })]) });
        }
        if (
          sql ===
            "select careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(\n  $1::pg_catalog.jsonb,\n  $2::pg_catalog.text,\n  $3::pg_catalog.text\n) as data"
        ) {
          const statement = values?.[0] as Readonly<{
            state: "ACCEPTED";
            usage: Readonly<{ totalTokensReconciliation: string }>;
          }>;
          if (statement.usage.totalTokensReconciliation === "CALCULATED") {
            throw new Error("RUNNER_TERMINAL_CONFLICT");
          }
          const created = acceptedCalls === 0;
          acceptedCalls += 1;
          return Object.freeze({ rows: Object.freeze([Object.freeze({
            data: Object.freeze({
              created,
              runnerTerminalRecorded: true,
              continuationEligible: true,
              runnerTerminalDigest:
                createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest(
                  statement as never,
                ),
              state: "ACCEPTED",
              recordedAt: databaseNow,
              status: created
                ? "RUNNER_TERMINAL_RECORDED"
                : "ALREADY_RECORDED",
            }),
          })]) });
        }
        throw new Error("unexpected runtime query");
      },
    });
    const prepared =
      await prepareTestOnlyCaresLinkV1CommunicationNotePreviewRuntimeBrokerHostedLiveGate(
        { adminQueryPort, expectedPostgresMajor: 17, setupSql },
      );
    activeBinding = prepared.brokerBinding;
    expect(prepared.brokerBinding).toEqual({
      authorizationDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      runIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      callerIdentityHmac: "e".repeat(64),
    });
    await expect(
      runTestOnlyCaresLinkV1CommunicationNotePreviewPreparedRuntimeBrokerHostedLiveGate(
        {
          prepared: prepared.prepared,
          runtimeQueryPort,
          runtimeRole,
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      terminalState: "ACCEPTED",
      firstCreated: true,
      exactReplayCreated: false,
      validConflictRejected: true,
    });
    expect(adaptedSetupSql).toContain("and not role_record.rolcanlogin");
    expect(adaptedSetupSql).toContain("and role_record.rolinherit");
    expect(adaptedSetupSql).toContain("and membership.inherit_option");
    expect(adaptedSetupSql).toContain("and not membership.set_option");
    expect(runtimeSql.some((sql) => /^\s*set\s+role\b/i.test(sql))).toBe(false);
    expect(adminSql.filter((sql) => sql === setupSql)).toHaveLength(0);
    await expect(
      runTestOnlyCaresLinkV1CommunicationNotePreviewPreparedRuntimeBrokerHostedLiveGate(
        {
          prepared: prepared.prepared,
          runtimeQueryPort,
          runtimeRole,
        },
      ),
    ).rejects.toThrowError(
      "RUNNER_TERMINAL_HOSTED_LIVE_PREPARED_GATE_FAILED",
    );

    const driftPrepared =
      await prepareTestOnlyCaresLinkV1CommunicationNotePreviewRuntimeBrokerHostedLiveGate(
        { adminQueryPort, expectedPostgresMajor: 17, setupSql },
      );
    activeBinding = driftPrepared.brokerBinding;
    const driftRuntimeSql: string[] = [];
    const driftRuntimeQueryPort = Object.freeze({
      async query(sql: string, values?: readonly unknown[]) {
        driftRuntimeSql.push(sql);
        if (sql.includes("'MEMBER'")) {
          return Object.freeze({ rows: Object.freeze([Object.freeze({
            current_user: runtimeRole,
            session_user: runtimeRole,
            statement_timeout: "9s",
            lock_timeout: "1s",
            idle_in_transaction_session_timeout: "5s",
            idle_session_timeout: "5s",
            caller_member: true,
            caller_set: false,
            caller_inherited: true,
          })]) });
        }
        return runtimeQueryPort.query(sql, values);
      },
    });
    await expect(
      runTestOnlyCaresLinkV1CommunicationNotePreviewPreparedRuntimeBrokerHostedLiveGate(
        {
          prepared: driftPrepared.prepared,
          runtimeQueryPort: driftRuntimeQueryPort,
          runtimeRole,
        },
      ),
    ).rejects.toThrowError(
      "RUNNER_TERMINAL_HOSTED_LIVE_BROKER_RUNTIME_SESSION_POSTURE_FAILED",
    );
    expect(
      driftRuntimeSql.includes(
        "select careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(\n  $1::pg_catalog.jsonb,\n  $2::pg_catalog.text,\n  $3::pg_catalog.text\n) as data",
      ),
    ).toBe(false);
  });

  if (hostedEnvironment.enabled === "1") {
    it(
      "persists, replays and conflicts through a real temporary Preview LOGIN",
      { timeout: 60_000 },
      async () => {
        try {
          await runHostedLiveTest();
          writeHostedChildStatus(HOSTED_CHILD_SUCCESS);
        } catch (error) {
          const code = error instanceof HostedLiveTestError
            ? error.message
            : "RUNNER_TERMINAL_HOSTED_LIVE_TEST_FAILED";
          writeHostedChildStatus(code);
          throw error;
        }
      },
    );
  }
});

function receiptUsageProjection(usage: Readonly<{
  source: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number | null;
}>) {
  return {
    source: usage.source,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cachedInputTokens: usage.cachedInputTokens,
    reasoningTokens: usage.reasoningTokens,
  };
}

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
    await connect(
      admin,
      "RUNNER_TERMINAL_HOSTED_LIVE_ADMIN_CONNECTION_FAILED",
    );
    adminConnected = true;
    await connect(
      runtime,
      "RUNNER_TERMINAL_HOSTED_LIVE_RUNTIME_CONNECTION_FAILED",
    );
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
      terminalState: "ACCEPTED",
      failureReason: null,
      continuationEligible: true,
      firstCreated: true,
      exactReplayCreated: false,
      validConflictRejected: true,
      conflictCode: "IDEMPOTENCY_CONFLICT",
      sourceTrustCompositionVerified: true,
      actualRuntimeLoginQueryVerified: true,
      finalExpectedLedgerCounts: [1, 0, 1, 1, 1, 1],
      acceptedNineKeyUsageVerified: true,
      receiptSixFactProjectionVerified: true,
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
    const hostedLiveCode = safeHostedLiveGateErrorCode(error);
    if (hostedLiveCode) throw new HostedLiveTestError(hostedLiveCode);
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
  if (process.env[STATUS_FD_ENV] !== String(HOSTED_STATUS_FD)) {
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

function writeHostedChildStatus(value: string) {
  const code = value === HOSTED_CHILD_SUCCESS ||
      /^RUNNER_TERMINAL_(?:HOSTED_LIVE|IDENTITY|VALID)_[A-Z_]+$/.test(value)
    ? value
    : "RUNNER_TERMINAL_HOSTED_LIVE_TEST_FAILED";
  writeFileSync(HOSTED_STATUS_FD, `${code}\n`, { encoding: "utf8" });
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

async function connect(client: PgClient, failureCode: string) {
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
    throw new HostedLiveTestError(failureCode);
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

function safeHostedLiveGateErrorCode(value: unknown) {
  if (
    !(value instanceof Error) ||
    value.name !== "CaresLinkV1RunnerTerminalHostedLiveError" ||
    !/^RUNNER_TERMINAL_(?:HOSTED_LIVE|IDENTITY|VALID)_[A-Z_]+$/.test(
      value.message,
    )
  ) {
    return "";
  }
  return value.message;
}

function requireText(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new HostedLiveTestError("RUNNER_TERMINAL_HOSTED_LIVE_CONFIG_INVALID");
  }
  return value;
}
