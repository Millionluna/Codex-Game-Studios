import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DATABASE_URL_ENV,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA,
  CommunicationNotePointsTerminalSettlementConcurrencyPolicyError,
  assertCommunicationNotePointsTerminalSettlementBlockerRows,
  assertCommunicationNotePointsTerminalSettlementDistinctBackends,
  assertCommunicationNotePointsTerminalSettlementPreflight,
  assertCommunicationNotePointsTerminalSettlementSqlPolicy,
  readCommunicationNotePointsTerminalSettlementEnvironment,
  validateCommunicationNotePointsTerminalSettlementDatabaseUrl,
} from "./communication-note-points-terminal-settlement-concurrency-policy.mjs";
import {
  COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY,
  loadPinnedCommunicationNotePreviewMigrations,
} from "./communication-note-preview-transactional-migrations-policy.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIRECTORY = dirname(SCRIPT_PATH);
const APP_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const SETUP_PATH = join(
  SCRIPT_DIRECTORY,
  "communication-note-points-terminal-settlement-concurrency-setup.sql",
);
const CLEANUP_PATH = join(
  SCRIPT_DIRECTORY,
  "communication-note-points-terminal-settlement-concurrency-cleanup.sql",
);
const TEMP_ROOT_PREFIX = "/private/tmp/careslink-points-terminal-pg16.";
const TEMP_ROOT_PATTERN =
  /^\/private\/tmp\/careslink-points-terminal-pg16\.[A-Za-z0-9]{6,}$/;
const OWNER_MARKER_FILE = ".careslink-points-terminal-owner";
const OWNER_MARKER_PREFIX =
  "careslink-points-terminal-owner:2026-09-02.local-pg16.communication-terminal.1:";
const BOOTSTRAP_ROLE = "careslink_points_terminal_pg16_owner";
const MIGRATION_ROLE = "postgres";
const CLUSTER_NAME = "careslink-points-terminal-pg16";
const MANAGEMENT_APPLICATION_NAME =
  "careslink-communication-terminal-management";
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const SETUP_SQL_SHA256 =
  "009e5ae77a71aced2df0a28667fcd2b185b5bbce6a164d66a84449ababfa15ee";
const CLEANUP_SQL_SHA256 =
  "276461b165a37ab131bbf9bab64e001f9eaf00e75302536137dd5bc9ef25da7d";
const SOURCE_REVISION_SHA256 =
  "581734bdbca2af8a7687c86b9e85ba7d3fe787c433f54a840db93075431b3f5f";

const REQUIRED_PG16_BINARIES = Object.freeze([
  "initdb",
  "pg_isready",
  "postgres",
  "psql",
]);

const KNOWN_PG16_BIN_DIRECTORIES = Object.freeze([
  "/opt/homebrew/opt/postgresql@16/bin",
  "/usr/local/opt/postgresql@16/bin",
  "/usr/lib/postgresql/16/bin",
  "/usr/pgsql-16/bin",
]);

// Retained historical dependency chain for the terminal-settlement evidence.
// Newer repository migrations may follow it in the globally pinned manifest,
// but they must not silently expand the evidence exercised by this harness.
const REQUIRED_MIGRATIONS = Object.freeze([
  "20260809120000_create_v1_shadow_foundation.sql",
  "20260810131648_add_v1_mobile_sync_shadow.sql",
  "20260810135000_harden_shadow_points_grant_identity.sql",
  "20260811102502_add_v1_privacy_review_confirmation.sql",
  "20260811134719_harden_v1_note_facts_schema_and_active_sessions.sql",
  "20260820135834_add_v1_note_generation_durable_shadow.sql",
  "20260821071044_add_v1_note_generation_worker_rpc_shadow.sql",
  "20260823213144_harden_v1_note_generation_registration_retention.sql",
  "20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql",
  "20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql",
  "20260827142156_add_communication_note_preview_execution_authority_shadow.sql",
  "20260828034704_add_communication_note_preview_custody_callers_shadow.sql",
  "20260828235426_harden_communication_note_preview_reservation_runner_terminal_shadow.sql",
  "20260829011323_add_communication_note_preview_signed_terminal_caller_shadow.sql",
  "20260829041316_align_communication_note_preview_terminal_accepted_usage.sql",
  "20260830065750_add_communication_note_preview_runtime_credential_broker.sql",
  "20260902012628_add_v1_authenticated_current_session_status_rpc.sql",
  "20260902052755_add_v1_communication_note_points_preview.sql",
  "20260902063211_add_v1_communication_note_points_admission.sql",
  "20260902121601_add_v1_communication_note_points_terminal_settlement.sql",
  "20260903041819_bind_v1_communication_note_encrypted_payload_admission.sql",
]);

export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES =
  Object.freeze({
    connectionMs: 5_000,
    queryMs: 30_000,
    statementMs: 25_000,
    lockObservationMs: 3_000,
    lockPollMs: 20,
    rollbackMs: 5_000,
    totalMs: 240_000,
    binaryPreflightMs: 5_000,
    initdbMs: 20_000,
    startMs: 20_000,
    migrationMs: 30_000,
    setupMs: 30_000,
    liveHarnessMs: 90_000,
    quiesceMs: 8_000,
    cleanupMs: 30_000,
    stopMs: 10_000,
    exactDeleteMs: 5_000,
  });

export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS =
  Object.freeze([
    "terminal-failure",
    "retry-success-replay",
    "queued-expiry-recovery",
    "short-grant-denial",
    "authority-bounds-cancel",
    "timing-boundaries",
  ]);

const TERMINAL_CLOCK_FIXTURE = Object.freeze({
  ownerId: "da100000-0000-4000-8000-000000000001",
  sessionId: "db351000-0000-4000-8000-000000000001",
  privacyId: "db352000-0000-4000-8000-000000000001",
  jobId: "db350000-0000-4000-8000-000000000001",
  payloadId: "db360000-0000-4000-8000-000000000001",
});

const TERMINAL_DENIED_CLOCK_FIXTURE = Object.freeze({
  ownerId: "da100000-0000-4000-8000-000000000001",
  sessionId: "dd351000-0000-4000-8000-000000000001",
  privacyId: "dd352000-0000-4000-8000-000000000001",
  jobId: "dd350000-0000-4000-8000-000000000001",
  payloadId: "dd360000-0000-4000-8000-000000000001",
});

const TERMINAL_SUCCESS_CLOCK_FIXTURE = Object.freeze({
  ownerId: "da100000-0000-4000-8000-000000000001",
  sessionId: "dc351000-0000-4000-8000-000000000001",
  privacyId: "dc352000-0000-4000-8000-000000000001",
  jobId: "dc350000-0000-4000-8000-000000000001",
  payloadId: "dc360000-0000-4000-8000-000000000001",
});

export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_TEST_ONLY =
  Object.freeze({
    marker: COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
    postgresMajor: 16,
    target: "fresh-passwordless-private-unix-socket",
    production: false,
    hosted: false,
    realCareData: false,
    modelCalls: false,
    bootstrapRole: BOOTSTRAP_ROLE,
    migrationRole: MIGRATION_ROLE,
    migrationEvidenceScope: "HISTORICAL_21_MIGRATION_DEPENDENCY_CHAIN",
    migrationFiles: REQUIRED_MIGRATIONS,
    setupSqlSha256: SETUP_SQL_SHA256,
    cleanupSqlSha256: CLEANUP_SQL_SHA256,
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    calculateSourceRevisionSha256,
  });

const FIXED_ERROR_CODES = new Set([
  ...Object.values(
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES,
  ),
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_QUERY_TIMEOUT",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_STATE_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_FAILURE_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RETRY_REPLAY_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SHORT_GRANT_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TIMING_BOUNDARIES_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CLOSE_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_INTERNAL_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_ABORTED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_ARGUMENT_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_BINARY_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_FILE_POLICY_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_INITDB_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_START_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_BOOTSTRAP_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_MIGRATION_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_SETUP_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_TIMEOUT",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_QUIESCE_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_CLEANUP_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_POSTCHECK_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_STOP_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DELETE_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_TOTAL_TIMEOUT",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_TEARDOWN_FAILED",
  "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_INTERNAL_FAILED",
]);

export class CommunicationNotePointsTerminalSettlementConcurrencyError extends Error {
  constructor(code, stage = "harness", evidence = null) {
    const fixedCode = FIXED_ERROR_CODES.has(code)
      ? code
      : "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_INTERNAL_FAILED";
    super(fixedCode);
    this.name = "CommunicationNotePointsTerminalSettlementConcurrencyError";
    this.code = fixedCode;
    this.stage = typeof stage === "string" ? stage : "internal";
    this.evidence = evidence;
  }
}

function fail(code, stage = "harness") {
  throw new CommunicationNotePointsTerminalSettlementConcurrencyError(
    code,
    stage,
  );
}

function assert(condition, code, stage = "harness") {
  if (!condition) fail(code, stage);
}

function isFixedCode(value) {
  return typeof value === "string" && FIXED_ERROR_CODES.has(value);
}

function normalizeFailure(error, fallbackCode, fallbackStage) {
  if (error instanceof CommunicationNotePointsTerminalSettlementConcurrencyError) {
    return Object.freeze({ code: error.code, stage: error.stage });
  }
  if (
    error instanceof
      CommunicationNotePointsTerminalSettlementConcurrencyPolicyError
  ) {
    return Object.freeze({ code: error.code, stage: fallbackStage });
  }
  if (isFixedCode(error?.safeCode)) {
    return Object.freeze({ code: error.safeCode, stage: fallbackStage });
  }
  return Object.freeze({ code: fallbackCode, stage: fallbackStage });
}

export function mergeCommunicationNotePointsTerminalSettlementLifecycleFailure(
  primaryFailure,
  teardownFailures,
) {
  const primary =
    primaryFailure &&
    isFixedCode(primaryFailure.code) &&
    typeof primaryFailure.stage === "string"
      ? Object.freeze({
          code: primaryFailure.code,
          stage: primaryFailure.stage,
        })
      : null;
  const teardown = Array.isArray(teardownFailures)
    ? teardownFailures
        .filter(
          (entry) =>
            entry &&
            isFixedCode(entry.code) &&
            typeof entry.stage === "string",
        )
        .map((entry) =>
          Object.freeze({ code: entry.code, stage: entry.stage }),
        )
    : [];
  return Object.freeze({
    ok: false,
    code:
      primary?.code ??
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_TEARDOWN_FAILED",
    stage: primary?.stage ?? "teardown",
    teardownErrors: Object.freeze(teardown),
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function calculateSourceRevisionSha256(source) {
  if (typeof source !== "string") return null;
  const declaration =
    /^const SOURCE_REVISION_SHA256 =\n  "[a-f0-9]{64}";$/gm;
  const matches = [...source.matchAll(declaration)];
  if (matches.length !== 1) return null;
  return sha256(
    source.replace(
      declaration,
      'const SOURCE_REVISION_SHA256 =\n  "<normalized-source-revision>";',
    ),
  );
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function withDeadline(operation, milliseconds, code, stage = "harness") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new CommunicationNotePointsTerminalSettlementConcurrencyError(
            code,
            stage,
          ),
        ),
      milliseconds,
    );
    timer.unref?.();
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function assertNotAborted(signal, stage) {
  if (signal?.aborted) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_ABORTED",
      stage,
    );
  }
}

function remainingTimeout(deadline, maximumMs, stage) {
  const remainingMs = Math.floor(deadline - performance.now());
  if (remainingMs <= 0) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_TOTAL_TIMEOUT",
      stage,
    );
  }
  return Math.max(1, Math.floor(Math.min(maximumMs, remainingMs)));
}

async function measureStage(timings, stage, operation) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const elapsed = Math.max(0, Math.round(performance.now() - startedAt));
    timings[stage] = (timings[stage] ?? 0) + elapsed;
  }
}

function fixedCommandEnvironment(pgBinDirectory) {
  return Object.freeze({
    LANG: "C",
    LC_ALL: "C",
    PATH: `${pgBinDirectory}:/usr/bin:/bin`,
    TZ: "UTC",
  });
}

function fixedLiveEnvironment(databaseUrl) {
  return Object.freeze({
    [COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DATABASE_URL_ENV]:
      databaseUrl,
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
  });
}

async function runCommand(
  command,
  args,
  { cwd = APP_ROOT, env, timeoutMs, signal, stage },
) {
  assertNotAborted(signal, stage);
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      env,
      killSignal: "SIGKILL",
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      signal,
      timeout: timeoutMs,
      windowsHide: true,
    });
    assertNotAborted(signal, stage);
    return Object.freeze({
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    });
  } catch (error) {
    if (signal?.aborted) {
      fail(
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_ABORTED",
        stage,
      );
    }
    if (error && typeof error === "object") error.lifecycleStage = stage;
    throw error;
  }
}

function parseLifecycleArguments(argv) {
  if (!Array.isArray(argv)) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_ARGUMENT_FAILED",
      "arguments",
    );
  }
  let pgBinDir;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--pg-bin-dir") {
      pgBinDir = argv[index + 1];
      index += 1;
    } else if (value?.startsWith("--pg-bin-dir=")) {
      pgBinDir = value.slice("--pg-bin-dir=".length);
    } else {
      fail(
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_ARGUMENT_FAILED",
        "arguments",
      );
    }
  }
  if (
    pgBinDir !== undefined &&
    (typeof pgBinDir !== "string" ||
      !pgBinDir.startsWith("/") ||
      pgBinDir !== pgBinDir.trim() ||
      /[\u0000-\u001f\u007f]/.test(pgBinDir))
  ) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_ARGUMENT_FAILED",
      "arguments",
    );
  }
  return Object.freeze({ pgBinDir });
}

async function resolvePg16Binaries(requestedDirectory, deadline, signal) {
  const candidates = requestedDirectory
    ? [requestedDirectory]
    : KNOWN_PG16_BIN_DIRECTORIES;
  for (const candidate of candidates) {
    try {
      assertNotAborted(signal, "binary-preflight");
      const canonicalDirectory = await realpath(candidate);
      if (!(await stat(canonicalDirectory)).isDirectory()) continue;
      const binaries = {};
      for (const name of REQUIRED_PG16_BINARIES) {
        const binary = await realpath(join(canonicalDirectory, name));
        const binaryState = await stat(binary);
        if (!binaryState.isFile() || dirname(binary) !== canonicalDirectory) {
          throw new Error("binary-policy");
        }
        await access(binary, fsConstants.X_OK);
        binaries[name] = binary;
      }
      const version = await runCommand(binaries.postgres, ["--version"], {
        env: fixedCommandEnvironment(canonicalDirectory),
        timeoutMs: remainingTimeout(
          deadline,
          COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES
            .binaryPreflightMs,
          "binary-preflight",
        ),
        signal,
        stage: "binary-preflight",
      });
      const match = /^postgres \(PostgreSQL\) (16(?:\.\d+)?(?:\s.*)?)\s*$/.exec(
        version.stdout,
      );
      if (!match) throw new Error("postgres-major");
      return Object.freeze({
        binDirectory: canonicalDirectory,
        binaries: Object.freeze(binaries),
        version: match[1],
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (requestedDirectory) break;
    }
  }
  fail(
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_BINARY_FAILED",
    "binary-preflight",
  );
}

function validateTempRoot(value) {
  if (typeof value !== "string" || !TEMP_ROOT_PATTERN.test(value)) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DELETE_FAILED",
      "temp-root-policy",
    );
  }
  return value;
}

function createPortCandidates() {
  const values = new Set();
  while (values.size < 8) {
    const port = randomInt(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY.minimumPort,
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY.maximumPort + 1,
    );
    if (port !== COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY.deniedPort) {
      values.add(port);
    }
  }
  return Object.freeze([...values]);
}

function createPostgresInstance(binary, args, env, logDescriptor) {
  const child = spawn(binary, args, {
    cwd: APP_ROOT,
    detached: false,
    env,
    stdio: ["ignore", logDescriptor, logDescriptor],
    windowsHide: true,
  });
  let exited = false;
  let exitRecord = null;
  let settleExit;
  const exitPromise = new Promise((resolveExit) => {
    settleExit = resolveExit;
  });
  const settle = (record) => {
    if (exited) return;
    exited = true;
    exitRecord = Object.freeze(record);
    settleExit(exitRecord);
  };
  child.once("error", () => settle({ code: null, signal: "SPAWN_ERROR" }));
  child.once("exit", (code, childSignal) =>
    settle({ code, signal: childSignal }),
  );
  return Object.freeze({
    child,
    exitPromise,
    get exited() {
      return exited;
    },
    get exitRecord() {
      return exitRecord;
    },
  });
}

function waitForPostgresExit(instance, timeoutMs) {
  if (instance.exited) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveExit(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    instance.exitPromise.then(() => finish(true), () => finish(false));
  });
}

async function stopPostgresInstance(instance, timeoutMs) {
  if (!instance || instance.exited) {
    return Object.freeze({ stopped: true, forced: false });
  }
  instance.child.kill("SIGINT");
  if (await waitForPostgresExit(instance, timeoutMs)) {
    return Object.freeze({ stopped: true, forced: false });
  }
  instance.child.kill("SIGKILL");
  if (!(await waitForPostgresExit(instance, 2_000))) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_STOP_FAILED",
      "postgres-stop",
    );
  }
  return Object.freeze({ stopped: true, forced: true });
}

function psqlConnectionArguments(lifecycle, username = MIGRATION_ROLE) {
  return [
    "-X",
    "--no-password",
    `--host=${lifecycle.socketDirectory}`,
    `--port=${lifecycle.port}`,
    `--username=${username}`,
    "--dbname=postgres",
    "--set=ON_ERROR_STOP=1",
  ];
}

async function runPsqlFile(
  lifecycle,
  sqlPath,
  stage,
  maximumTimeoutMs,
  { username = MIGRATION_ROLE, singleTransaction = false, variables = [], teardown = false } = {},
) {
  const deadline = teardown ? lifecycle.teardownDeadline : lifecycle.deadline;
  const signal = teardown ? undefined : lifecycle.signal;
  const args = [
    ...psqlConnectionArguments(lifecycle, username),
    ...variables.map(([name, value]) => `--set=${name}=${value}`),
  ];
  if (singleTransaction) args.push("--single-transaction");
  args.push(`--file=${sqlPath}`);
  return runCommand(lifecycle.pg.binaries.psql, args, {
    env: lifecycle.commandEnv,
    timeoutMs: remainingTimeout(deadline, maximumTimeoutMs, stage),
    signal,
    stage,
  });
}

async function runPsqlQuery(
  lifecycle,
  query,
  stage,
  maximumTimeoutMs,
  { username = MIGRATION_ROLE, teardown = false } = {},
) {
  const deadline = teardown ? lifecycle.teardownDeadline : lifecycle.deadline;
  const signal = teardown ? undefined : lifecycle.signal;
  return runCommand(
    lifecycle.pg.binaries.psql,
    [
      ...psqlConnectionArguments(lifecycle, username),
      "--tuples-only",
      "--no-align",
      `--command=${query}`,
    ],
    {
      env: lifecycle.commandEnv,
      timeoutMs: remainingTimeout(deadline, maximumTimeoutMs, stage),
      signal,
      stage,
    },
  );
}

const BOOTSTRAP_SQL = String.raw`
begin;

do $careslink_points_terminal_bootstrap$
declare
  v_ssl pg_catalog.bool;
begin
  select ssl into v_ssl
  from pg_catalog.pg_stat_ssl
  where pid = pg_catalog.pg_backend_pid();

  if current_user <> 'careslink_points_terminal_pg16_owner'
    or session_user <> 'careslink_points_terminal_pg16_owner'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4
      not between 160000 and 169999
    or pg_catalog.inet_server_addr() is not null
    or pg_catalog.inet_server_port() is not null
    or pg_catalog.current_setting('port')::pg_catalog.int4 not between 49152 and 65535
    or pg_catalog.current_setting('listen_addresses') <> ''
    or pg_catalog.current_setting('unix_socket_directories') !~
      '^/private/tmp/careslink-points-terminal-pg16[.][A-Za-z0-9]{6,}/socket$'
    or pg_catalog.current_setting('unix_socket_permissions') <> '0700'
    or pg_catalog.current_setting('ssl') <> 'off'
    or coalesce(v_ssl, false)
    or pg_catalog.current_setting('cluster_name') <>
      'careslink-points-terminal-pg16'
    or pg_catalog.current_setting(
      'careslink.cn_points_terminal.marker',
      true
    ) is distinct from '2026-09-02.local-pg16.communication-terminal.1'
    or pg_catalog.current_setting('is_superuser') <> 'on'
    or pg_catalog.to_regrole('postgres') is not null
    or pg_catalog.to_regrole('anon') is not null
    or pg_catalog.to_regrole('authenticated') is not null
    or pg_catalog.to_regrole('service_role') is not null
    or pg_catalog.to_regrole('authenticator') is not null
    or pg_catalog.to_regnamespace('auth') is not null
    or pg_catalog.to_regnamespace('extensions') is not null
  then
    raise exception 'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_BOOTSTRAP_UNSAFE';
  end if;
end
$careslink_points_terminal_bootstrap$;

create role postgres
  login inherit nosuperuser createdb createrole noreplication bypassrls
  password null;
alter database postgres owner to postgres;
grant pg_read_all_stats, pg_signal_backend to postgres;

set role postgres;

create role anon
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role authenticated
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;
create role service_role
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication bypassrls;
create role authenticator
  nologin noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls;

create schema auth authorization postgres;
create schema extensions authorization postgres;
revoke all on schema auth, extensions
from public, anon, authenticated, service_role, authenticator;
grant usage on schema auth to anon, authenticated, service_role;

create extension pgcrypto with schema extensions;

create table auth.users (
  instance_id pg_catalog.uuid not null,
  id pg_catalog.uuid primary key,
  aud pg_catalog.text,
  role pg_catalog.text,
  email pg_catalog.text,
  encrypted_password pg_catalog.text,
  email_confirmed_at pg_catalog.timestamptz,
  raw_app_meta_data pg_catalog.jsonb,
  raw_user_meta_data pg_catalog.jsonb,
  is_anonymous pg_catalog.bool not null default false,
  banned_until pg_catalog.timestamptz,
  deleted_at pg_catalog.timestamptz,
  created_at pg_catalog.timestamptz not null default pg_catalog.now(),
  updated_at pg_catalog.timestamptz not null default pg_catalog.now()
);

create table auth.sessions (
  id pg_catalog.uuid primary key,
  user_id pg_catalog.uuid not null references auth.users(id) on delete cascade,
  created_at pg_catalog.timestamptz not null default pg_catalog.now(),
  updated_at pg_catalog.timestamptz not null default pg_catalog.now(),
  not_after pg_catalog.timestamptz
);

revoke all on auth.users, auth.sessions
from public, anon, authenticated, service_role, authenticator;

create function auth.jwt()
returns pg_catalog.jsonb
language sql
stable
security invoker
set search_path = ''
as $careslink_points_terminal_bootstrap$
  select coalesce(
    nullif(
      pg_catalog.current_setting('request.jwt.claims', true),
      ''
    )::pg_catalog.jsonb,
    '{}'::pg_catalog.jsonb
  )
$careslink_points_terminal_bootstrap$;

create function auth.uid()
returns pg_catalog.uuid
language sql
stable
security invoker
set search_path = ''
as $careslink_points_terminal_bootstrap$
  select nullif(auth.jwt()->>'sub', '')::pg_catalog.uuid
$careslink_points_terminal_bootstrap$;

grant execute on function auth.jwt(), auth.uid()
to anon, authenticated, service_role;

reset role;
commit;
`;

function startupPreflightQuery(lifecycle) {
  return `
select case when
  current_user = '${BOOTSTRAP_ROLE}'
  and session_user = '${BOOTSTRAP_ROLE}'
  and pg_catalog.current_database() = 'postgres'
  and pg_catalog.current_setting('server_version_num')::pg_catalog.int4
    between 160000 and 169999
  and pg_catalog.inet_server_addr() is null
  and pg_catalog.inet_server_port() is null
  and pg_catalog.current_setting('port')::pg_catalog.int4 = ${lifecycle.port}
  and pg_catalog.current_setting('listen_addresses') = ''
  and pg_catalog.current_setting('unix_socket_directories') =
    '${lifecycle.socketDirectory}'
  and pg_catalog.current_setting('unix_socket_permissions') = '0700'
  and pg_catalog.current_setting('ssl') = 'off'
  and pg_catalog.current_setting('cluster_name') = '${CLUSTER_NAME}'
  and pg_catalog.current_setting('data_directory') =
    '${lifecycle.dataDirectory}'
  and pg_catalog.current_setting(
    'careslink.cn_points_terminal.marker',
    true
  ) = '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER}'
then 'ok' else 'unsafe' end;
`;
}

async function startPostgres(lifecycle, logDescriptor) {
  const stageDeadline =
    performance.now() +
    remainingTimeout(
      lifecycle.deadline,
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.startMs,
      "postgres-start",
    );
  for (const port of createPortCandidates()) {
    assertNotAborted(lifecycle.signal, "postgres-start");
    if (performance.now() >= stageDeadline) break;
    lifecycle.port = port;
    const instance = createPostgresInstance(
      lifecycle.pg.binaries.postgres,
      [
        "-D",
        lifecycle.dataDirectory,
        "-h",
        "",
        "-p",
        String(port),
        "-c",
        "ssl=off",
        "-c",
        `unix_socket_directories=${lifecycle.socketDirectory}`,
        "-c",
        "unix_socket_permissions=0700",
        "-c",
        `cluster_name=${CLUSTER_NAME}`,
        "-c",
        "timezone=UTC",
        "-c",
        "DateStyle=ISO,YMD",
        "-c",
        "max_connections=16",
        "-c",
        "log_connections=off",
        "-c",
        "log_disconnections=off",
        "-c",
        "log_statement=none",
        "-c",
        "log_min_error_statement=panic",
        "-c",
        "log_lock_waits=on",
        "-c",
        "deadlock_timeout=200ms",
        "-c",
        `application_name=${MANAGEMENT_APPLICATION_NAME}`,
        "-c",
        `careslink.cn_points_terminal.marker=${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER}`,
      ],
      lifecycle.commandEnv,
      logDescriptor,
    );
    lifecycle.postgresInstance = instance;
    const candidateDeadline = Math.min(
      stageDeadline,
      performance.now() + 5_000,
    );
    let accepted = false;
    while (!instance.exited && performance.now() < candidateDeadline) {
      try {
        await runCommand(
          lifecycle.pg.binaries.pg_isready,
          [
            `--host=${lifecycle.socketDirectory}`,
            `--port=${port}`,
            `--username=${BOOTSTRAP_ROLE}`,
            "--dbname=postgres",
            "--timeout=1",
            "--quiet",
          ],
          {
            env: lifecycle.commandEnv,
            timeoutMs: Math.max(
              1,
              Math.floor(
                Math.min(1_500, candidateDeadline - performance.now()),
              ),
            ),
            signal: lifecycle.signal,
            stage: "postgres-start",
          },
        );
        const preflight = await runPsqlQuery(
          lifecycle,
          startupPreflightQuery(lifecycle),
          "postgres-start",
          Math.max(1, candidateDeadline - performance.now()),
          { username: BOOTSTRAP_ROLE },
        );
        accepted = preflight.stdout.trim() === "ok";
        if (accepted) break;
      } catch (error) {
        if (lifecycle.signal?.aborted) throw error;
      }
      await delay(75);
    }
    if (accepted && !instance.exited) return Object.freeze({ port });
    await stopPostgresInstance(instance, 1_000);
    lifecycle.postgresInstance = null;
    lifecycle.port = null;
  }
  fail(
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_START_FAILED",
    "postgres-start",
  );
}

async function assertRegularCanonicalFile(path) {
  const state = await lstat(path);
  if (!state.isFile() || state.isSymbolicLink()) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_FILE_POLICY_FAILED",
      "file-policy",
    );
  }
  const canonical = await realpath(path);
  if (canonical !== path || dirname(canonical) !== SCRIPT_DIRECTORY) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_FILE_POLICY_FAILED",
      "file-policy",
    );
  }
}

async function readAndValidateFiles() {
  await Promise.all([
    assertRegularCanonicalFile(SCRIPT_PATH),
    assertRegularCanonicalFile(SETUP_PATH),
    assertRegularCanonicalFile(CLEANUP_PATH),
  ]);
  const [setupSql, cleanupSql, source, pinned] = await Promise.all([
    readFile(SETUP_PATH, "utf8"),
    readFile(CLEANUP_PATH, "utf8"),
    readFile(SCRIPT_PATH, "utf8"),
    loadPinnedCommunicationNotePreviewMigrations(),
  ]);
  const sqlPolicy =
    assertCommunicationNotePointsTerminalSettlementSqlPolicy(
      setupSql,
      cleanupSql,
    );
  const setupSha256 = sha256(setupSql);
  const cleanupSha256 = sha256(cleanupSql);
  const sourceRevisionSha256 = calculateSourceRevisionSha256(source);
  if (
    setupSha256 !== SETUP_SQL_SHA256 ||
    cleanupSha256 !== CLEANUP_SQL_SHA256 ||
    sourceRevisionSha256 !== SOURCE_REVISION_SHA256 ||
    !source.includes(
      "runCommunicationNotePointsTerminalSettlementConcurrencyHarness",
    ) ||
    !source.includes(
      "runCommunicationNotePointsTerminalSettlementLocalPg16",
    ) ||
    /(?:supabase[.]co|pooler[.]supabase[.]com|rds[.]amazonaws[.]com)/i.test(
      `${setupSql}\n${cleanupSql}`,
    )
  ) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_FILE_POLICY_FAILED",
      "file-policy",
    );
  }

  const byName = new Map(
    pinned.migrations.map((migration, index) => [
      migration.basename,
      Object.freeze({ ...migration, manifestIndex: index }),
    ]),
  );
  const migrations = REQUIRED_MIGRATIONS.map((basename) => byName.get(basename));
  if (
    pinned.migrations.length !==
      COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY.migrationCount ||
    migrations.some((migration) => !migration) ||
    migrations.some(
      (migration, index) =>
        index > 0 &&
        migration.manifestIndex <= migrations[index - 1].manifestIndex,
    ) ||
    migrations.at(-1)?.basename !== REQUIRED_MIGRATIONS.at(-1)
  ) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_FILE_POLICY_FAILED",
      "migration-manifest",
    );
  }
  const migrationManifestSha256 = sha256(
    migrations
      .map((migration) => `${migration.basename}:${migration.sha256}\n`)
      .join(""),
  );
  return Object.freeze({
    cleanupSha256,
    migrationManifestSha256,
    migrations: Object.freeze(migrations),
    pinnedManifestSha256: pinned.manifestSha256,
    setupSha256,
    sourceSha256: sha256(source),
    sourceRevisionSha256,
    sqlPolicy,
  });
}

async function writeExactPrivateFile(path, source) {
  await writeFile(path, source, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const state = await lstat(path);
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    (state.mode & 0o077) !== 0 ||
    sha256(await readFile(path)) !== sha256(source)
  ) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_FILE_POLICY_FAILED",
      "private-file",
    );
  }
}

function quiesceQuery(lifecycle) {
  return `
do $careslink_points_terminal_quiesce$
begin
  if current_user <> '${BOOTSTRAP_ROLE}'
    or session_user <> '${BOOTSTRAP_ROLE}'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4
      not between 160000 and 169999
    or pg_catalog.inet_server_addr() is not null
    or pg_catalog.inet_server_port() is not null
    or pg_catalog.current_setting('port')::pg_catalog.int4 <> ${lifecycle.port}
    or pg_catalog.current_setting('listen_addresses') <> ''
    or pg_catalog.current_setting('unix_socket_directories') <>
      '${lifecycle.socketDirectory}'
    or pg_catalog.current_setting('unix_socket_permissions') <> '0700'
    or pg_catalog.current_setting(
      'careslink.cn_points_terminal.marker',
      true
    ) is distinct from '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER}'
    or pg_catalog.to_regrole(
      '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}'
    ) is null
    or not exists (
      select 1
      from pg_catalog.pg_roles as runner
      where runner.rolname =
        '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}'
        and runner.rolcanlogin
        and not runner.rolinherit
        and not runner.rolsuper
        and not runner.rolcreatedb
        and not runner.rolcreaterole
        and not runner.rolreplication
        and not runner.rolbypassrls
    )
  then
    raise exception 'COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_QUIESCE_UNSAFE';
  end if;
  alter role ${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}
    nologin;
end
$careslink_points_terminal_quiesce$;
`;
}

const RUNNER_SESSION_COUNT_QUERY = `
select pg_catalog.count(*)::pg_catalog.int4
from pg_catalog.pg_stat_activity as activity
where activity.usename =
    '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}'
  and activity.backend_type = 'client backend';
`;

const RUNNER_SESSION_SAFETY_QUERY = `
select case when not exists (
  select 1
  from pg_catalog.pg_stat_activity as activity
  where activity.usename =
      '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}'
    and (
      activity.backend_type <> 'client backend'
      or activity.datname <> 'postgres'
      or activity.client_addr is not null
      or activity.application_name !~
        '^careslink-cn-terminal-(terminal-failure|retry-success-replay|queued-expiry-recovery|short-grant-denial|authority-bounds-cancel|timing-boundaries)-(a|b|observer)$'
    )
) then 'safe' else 'unsafe' end;
`;

const TERMINATE_RUNNER_SESSIONS_QUERY = `
select pg_catalog.count(*)::pg_catalog.int4
from (
  select pg_catalog.pg_terminate_backend(activity.pid, 5000) as terminated
  from pg_catalog.pg_stat_activity as activity
  where activity.usename =
      '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}'
    and activity.backend_type = 'client backend'
    and activity.datname = 'postgres'
    and activity.client_addr is null
    and activity.application_name ~
      '^careslink-cn-terminal-(terminal-failure|retry-success-replay|queued-expiry-recovery|short-grant-denial|authority-bounds-cancel|timing-boundaries)-(a|b|observer)$'
) as terminated_runner
where terminated_runner.terminated;
`;

async function quiesceRunner(lifecycle) {
  await runPsqlQuery(
    lifecycle,
    quiesceQuery(lifecycle),
    "runner-quiesce",
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.quiesceMs,
    { username: BOOTSTRAP_ROLE, teardown: true },
  );
  const waitDeadline = Math.min(
    lifecycle.teardownDeadline,
    performance.now() + 2_000,
  );
  do {
    const count = await runPsqlQuery(
      lifecycle,
      RUNNER_SESSION_COUNT_QUERY,
      "runner-quiesce",
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.quiesceMs,
      { username: BOOTSTRAP_ROLE, teardown: true },
    );
    if (Number(count.stdout.trim()) === 0) {
      return Object.freeze({ noLogin: true, sessionsClosed: true });
    }
    await delay(50);
  } while (performance.now() < waitDeadline);

  const safety = await runPsqlQuery(
    lifecycle,
    RUNNER_SESSION_SAFETY_QUERY,
    "runner-quiesce",
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.quiesceMs,
    { username: BOOTSTRAP_ROLE, teardown: true },
  );
  if (safety.stdout.trim() !== "safe") {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_QUIESCE_FAILED",
      "runner-quiesce",
    );
  }
  await runPsqlQuery(
    lifecycle,
    TERMINATE_RUNNER_SESSIONS_QUERY,
    "runner-quiesce",
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.quiesceMs,
    { username: BOOTSTRAP_ROLE, teardown: true },
  );
  const finalCount = await runPsqlQuery(
    lifecycle,
    RUNNER_SESSION_COUNT_QUERY,
    "runner-quiesce",
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.quiesceMs,
    { username: BOOTSTRAP_ROLE, teardown: true },
  );
  if (Number(finalCount.stdout.trim()) !== 0) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_QUIESCE_FAILED",
      "runner-quiesce",
    );
  }
  return Object.freeze({ noLogin: true, sessionsClosed: true });
}

const POSTCHECK_QUERY = `
select case when
  pg_catalog.to_regrole(
    '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}'
  ) is null
  and pg_catalog.to_regnamespace(
    '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA}'
  ) is null
  and not exists (
    select 1 from auth.users
    where id in (
      'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da200000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da310000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da320000-0000-4000-8000-000000000001'::pg_catalog.uuid,
      'da330000-0000-4000-8000-000000000001'::pg_catalog.uuid
    )
  )
  and not exists (select 1 from careslink_v1_generation.jobs)
  and not exists (select 1 from careslink_v1_generation.payloads)
  and not exists (
    select 1
    from careslink_v1_generation.communication_note_point_admissions
  )
  and not exists (
    select 1
    from careslink_v1_generation.communication_note_point_settlements
  )
  and not exists (select 1 from public.point_wallets)
  and not exists (select 1 from public.point_lots)
  and not exists (select 1 from public.point_quotes)
  and not exists (select 1 from public.point_reservations)
  and not exists (select 1 from public.point_reservation_allocations)
  and not exists (select 1 from public.point_ledger_entries)
  and (
    select pg_catalog.count(*) = 4
      and pg_catalog.bool_and(
        helper.proowner = pg_catalog.to_regrole(
          'careslink_v1_generation_executor'
        )
        and helper.prosecdef is true
        and pg_catalog.cardinality(helper.proconfig) = 1
        and helper.proconfig[1] in ('search_path=', 'search_path=""')
      )
    from pg_catalog.pg_proc as helper
    where helper.oid = any(array[
      'careslink_v1_generation._new_communication_note_point_settlement_uuid()'::pg_catalog.regprocedure,
      'careslink_v1_generation._communication_note_point_settlement_sha256_text(pg_catalog.text)'::pg_catalog.regprocedure,
      'careslink_v1_generation._communication_note_point_settlement_content_sha256(pg_catalog.jsonb)'::pg_catalog.regprocedure,
      'careslink_v1_generation._communication_note_job_has_point_admission(pg_catalog.uuid,pg_catalog.uuid)'::pg_catalog.regprocedure
    ])
  )
  and (
    select pg_catalog.count(*) = 8
      and pg_catalog.count(*) filter (
        where helper_acl.grantee = pg_catalog.to_regrole(
          'careslink_v1_generation_executor'
        )
      ) = 4
      and pg_catalog.count(*) filter (
        where helper_acl.grantee = pg_catalog.to_regrole(
          'careslink_v1_generation_points_settlement_executor'
        )
      ) = 4
      and pg_catalog.bool_and(
        helper_acl.grantor = pg_catalog.to_regrole(
          'careslink_v1_generation_executor'
        )
        and helper_acl.privilege_type = 'EXECUTE'
        and helper_acl.is_grantable is false
      )
    from pg_catalog.pg_proc as helper
    cross join lateral pg_catalog.aclexplode(helper.proacl) as helper_acl
    where helper.oid = any(array[
      'careslink_v1_generation._new_communication_note_point_settlement_uuid()'::pg_catalog.regprocedure,
      'careslink_v1_generation._communication_note_point_settlement_sha256_text(pg_catalog.text)'::pg_catalog.regprocedure,
      'careslink_v1_generation._communication_note_point_settlement_content_sha256(pg_catalog.jsonb)'::pg_catalog.regprocedure,
      'careslink_v1_generation._communication_note_job_has_point_admission(pg_catalog.uuid,pg_catalog.uuid)'::pg_catalog.regprocedure
    ])
  )
  and exists (
    select 1
    from pg_catalog.pg_proc as denied_helper
    where denied_helper.oid =
        'careslink_v1_generation._settle_denied_authority(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,pg_catalog.timestamptz)'::pg_catalog.regprocedure
      and denied_helper.proowner = pg_catalog.to_regrole(
        'careslink_v1_generation_executor'
      )
      and denied_helper.prosecdef is false
      and denied_helper.provolatile = 'v'
      and pg_catalog.cardinality(denied_helper.proconfig) = 1
      and denied_helper.proconfig[1] in ('search_path=', 'search_path=""')
  )
  and not exists (
    select 1
    from pg_catalog.unnest(array[
      'public', 'anon', 'authenticated', 'service_role', 'authenticator',
      'careslink_v1_generation_owner',
      'careslink_v1_generation_owner_api_executor',
      'careslink_v1_generation_points_admission_executor',
      'careslink_v1_generation_points_settlement_executor'
    ]::pg_catalog.text[]) as denied_role(role_name)
    where pg_catalog.has_function_privilege(
      denied_role.role_name,
      'careslink_v1_generation._settle_denied_authority(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,pg_catalog.timestamptz)',
      'EXECUTE'
    )
  )
  and not exists (
    select 1
    from pg_catalog.pg_namespace as namespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        namespace.nspacl,
        pg_catalog.acldefault('n', namespace.nspowner)
      )
    ) as namespace_acl
    where namespace.nspname = 'careslink_v1_generation'
      and namespace_acl.privilege_type = 'CREATE'
      and namespace_acl.grantee <> namespace.nspowner
  )
  and not pg_catalog.has_schema_privilege(
    'careslink_v1_generation_executor',
    'careslink_v1_generation',
    'CREATE'
  )
  and not pg_catalog.has_schema_privilege(
    'careslink_v1_generation_owner_api_executor',
    'careslink_v1_generation',
    'CREATE'
  )
  and not pg_catalog.has_schema_privilege(
    'careslink_v1_generation_registration_control_executor',
    'careslink_v1_generation',
    'CREATE'
  )
  and not pg_catalog.has_schema_privilege(
    'careslink_v1_generation_points_admission_executor',
    'careslink_v1_generation',
    'CREATE'
  )
  and not pg_catalog.has_schema_privilege(
    'careslink_v1_generation_points_settlement_executor',
    'careslink_v1_generation',
    'CREATE'
  )
  and not pg_catalog.has_schema_privilege(
    'careslink_v1_generation_points_settlement_executor',
    'extensions',
    'USAGE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) as procedure_acl
    where namespace.nspname in ('extensions', 'public')
      and procedure_acl.grantee = pg_catalog.to_regrole(
        'careslink_v1_generation_points_settlement_executor'
      )
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.proowner = pg_catalog.to_regrole(
        'careslink_v1_generation_points_settlement_executor'
      )
      and procedure.prokind in ('f', 'p')
      and (
        pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(procedure.oid), 'extensions.'
        ) > 0
        or pg_catalog.strpos(procedure.prosrc, 'extensions.') > 0
        or pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(procedure.oid),
          'careslink_v1_generation._sha256_text('
        ) > 0
        or pg_catalog.strpos(
          procedure.prosrc, 'careslink_v1_generation._sha256_text('
        ) > 0
        or pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(procedure.oid),
          'public.v1_shadow_content_sha256('
        ) > 0
        or pg_catalog.strpos(
          procedure.prosrc, 'public.v1_shadow_content_sha256('
        ) > 0
      )
  )
then 'ok' else 'failed' end;
`;

async function exactDeleteTempRoot(lifecycle) {
  const tempRoot = validateTempRoot(lifecycle.tempRoot);
  const rootState = await lstat(tempRoot);
  if (!rootState.isDirectory() || rootState.isSymbolicLink()) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DELETE_FAILED",
      "exact-temp-delete",
    );
  }
  if ((await realpath(tempRoot)) !== tempRoot) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DELETE_FAILED",
      "exact-temp-delete",
    );
  }
  const marker = await readFile(join(tempRoot, OWNER_MARKER_FILE), "utf8");
  if (
    marker !== lifecycle.ownerMarker ||
    !marker.startsWith(OWNER_MARKER_PREFIX) ||
    !/^[a-f0-9]{64}$/.test(marker.slice(OWNER_MARKER_PREFIX.length))
  ) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DELETE_FAILED",
      "exact-temp-delete",
    );
  }
  await withDeadline(
    rm(tempRoot, { recursive: true, force: false, maxRetries: 2 }),
    remainingTimeout(
      lifecycle.teardownDeadline,
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.exactDeleteMs,
      "exact-temp-delete",
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DELETE_FAILED",
    "exact-temp-delete",
  );
  try {
    await lstat(tempRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ removed: true });
    throw error;
  }
  fail(
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DELETE_FAILED",
    "exact-temp-delete",
  );
}

function parseLiveHarnessResult(stdout) {
  const valueText = stdout.trim();
  if (
    valueText.length === 0 ||
    valueText.length > 65_536 ||
    valueText.includes("\n")
  ) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_FAILED",
      "live-harness",
    );
  }
  let value;
  try {
    value = JSON.parse(valueText);
  } catch {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_FAILED",
      "live-harness",
    );
  }
  if (
    value?.ok !== true ||
    value?.gate !==
      "communication-note-points-terminal-settlement-concurrency" ||
    value?.marker !==
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER ||
    Number(value?.postgresMajor) !== 16 ||
    value?.target !== "passwordless-private-unix-socket" ||
    Number(value?.scenariosPassed) !==
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS.length ||
    !Array.isArray(value?.scenarios) ||
    value.scenarios.length !==
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS.length ||
    value.scenarios.some(
      (scenario, index) =>
        scenario !==
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS[index],
    )
  ) {
    fail(
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_FAILED",
      "live-harness",
    );
  }
  return Object.freeze({
    ...value,
    scenarios: Object.freeze([...value.scenarios]),
  });
}

function liveFailureFromError(error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  const lastLine = stderr.split(/\r?\n/).filter(Boolean).at(-1);
  if (isFixedCode(lastLine)) {
    const safe = new Error(lastLine);
    safe.safeCode = lastLine;
    safe.lifecycleStage = "live-harness";
    return safe;
  }
  return error;
}

async function performTeardown(lifecycle, timings) {
  const failures = [];
  const state = {
    runnerQuiesced: false,
    sqlCleanup: false,
    postcheck: false,
    postgresStopped: false,
    forcedStop: false,
    tempRootRemoved: false,
  };
  lifecycle.teardownDeadline =
    performance.now() +
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.quiesceMs +
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.cleanupMs +
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.stopMs +
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.exactDeleteMs;

  if (
    lifecycle.setupApplied &&
    lifecycle.postgresInstance &&
    !lifecycle.postgresInstance.exited
  ) {
    try {
      await measureStage(timings, "runner-quiesce", () =>
        quiesceRunner(lifecycle),
      );
      state.runnerQuiesced = true;
    } catch (error) {
      failures.push(
        normalizeFailure(
          error,
          "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_QUIESCE_FAILED",
          "runner-quiesce",
        ),
      );
    }

    if (state.runnerQuiesced) {
      try {
        await measureStage(timings, "sql-cleanup", () =>
          runPsqlFile(
            lifecycle,
            CLEANUP_PATH,
            "sql-cleanup",
            COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.cleanupMs,
            {
              username: BOOTSTRAP_ROLE,
              variables: [["careslink_bootstrap_role", BOOTSTRAP_ROLE]],
              teardown: true,
            },
          ),
        );
        state.sqlCleanup = true;
      } catch (error) {
        failures.push(
          normalizeFailure(
            error,
            "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_CLEANUP_FAILED",
            "sql-cleanup",
          ),
        );
      }
    }

    if (state.sqlCleanup) {
      try {
        await measureStage(timings, "terminal-postcheck", async () => {
          const result = await runPsqlQuery(
            lifecycle,
            POSTCHECK_QUERY,
            "terminal-postcheck",
            COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.cleanupMs,
            { username: BOOTSTRAP_ROLE, teardown: true },
          );
          if (result.stdout.trim() !== "ok") {
            fail(
              "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_POSTCHECK_FAILED",
              "terminal-postcheck",
            );
          }
        });
        state.postcheck = true;
      } catch (error) {
        failures.push(
          normalizeFailure(
            error,
            "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_POSTCHECK_FAILED",
            "terminal-postcheck",
          ),
        );
      }
    }
  } else if (lifecycle.setupApplied) {
    failures.push(
      Object.freeze({
        code: "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_QUIESCE_FAILED",
        stage: "runner-quiesce",
      }),
    );
  }

  if (lifecycle.postgresInstance) {
    try {
      const stopped = await measureStage(timings, "postgres-stop", () =>
        stopPostgresInstance(
          lifecycle.postgresInstance,
          COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.stopMs,
        ),
      );
      state.postgresStopped = stopped.stopped;
      state.forcedStop = stopped.forced;
    } catch (error) {
      failures.push(
        normalizeFailure(
          error,
          "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_STOP_FAILED",
          "postgres-stop",
        ),
      );
    }
  } else {
    state.postgresStopped = true;
  }

  if (lifecycle.logHandle) {
    await lifecycle.logHandle.close().catch(() => undefined);
    lifecycle.logHandle = null;
  }

  if (lifecycle.tempRoot && state.postgresStopped) {
    try {
      await measureStage(timings, "exact-temp-delete", () =>
        exactDeleteTempRoot(lifecycle),
      );
      state.tempRootRemoved = true;
    } catch (error) {
      failures.push(
        normalizeFailure(
          error,
          "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DELETE_FAILED",
          "exact-temp-delete",
        ),
      );
    }
  }
  return Object.freeze({
    failures: Object.freeze(failures),
    state: Object.freeze(state),
  });
}

export async function runCommunicationNotePointsTerminalSettlementLocalPg16({
  argv = [],
  signal,
} = {}) {
  const args = parseLifecycleArguments(argv);
  const timings = {};
  const deadline =
    performance.now() +
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.totalMs;
  const lifecycle = {
    commandEnv: null,
    dataDirectory: null,
    deadline,
    logHandle: null,
    ownerMarker: null,
    pg: null,
    port: null,
    postgresInstance: null,
    setupApplied: false,
    signal,
    socketDirectory: null,
    teardownDeadline: null,
    tempRoot: null,
  };
  let files;
  let liveResult;
  let primaryFailure = null;
  try {
    files = await measureStage(timings, "file-policy", readAndValidateFiles);
    lifecycle.pg = await measureStage(timings, "binary-preflight", () =>
      resolvePg16Binaries(args.pgBinDir, deadline, signal),
    );
    lifecycle.commandEnv = fixedCommandEnvironment(lifecycle.pg.binDirectory);
    lifecycle.tempRoot = validateTempRoot(await mkdtemp(TEMP_ROOT_PREFIX));
    await chmod(lifecycle.tempRoot, 0o700);
    lifecycle.ownerMarker =
      OWNER_MARKER_PREFIX + randomBytes(32).toString("hex");
    const markerHandle = await open(
      join(lifecycle.tempRoot, OWNER_MARKER_FILE),
      "wx",
      0o600,
    );
    await markerHandle.writeFile(lifecycle.ownerMarker, "utf8");
    await markerHandle.close();
    lifecycle.dataDirectory = join(lifecycle.tempRoot, "data");
    lifecycle.socketDirectory = join(lifecycle.tempRoot, "socket");
    await mkdir(lifecycle.socketDirectory, { mode: 0o700 });
    await chmod(lifecycle.socketDirectory, 0o700);
    lifecycle.logHandle = await open(
      join(lifecycle.tempRoot, "postgres.log"),
      "a",
      0o600,
    );

    await measureStage(timings, "initdb", () =>
      runCommand(
        lifecycle.pg.binaries.initdb,
        [
          `--pgdata=${lifecycle.dataDirectory}`,
          `--username=${BOOTSTRAP_ROLE}`,
          "--encoding=UTF8",
          "--locale=C",
          "--auth-local=trust",
          "--auth-host=reject",
          "--data-checksums",
          "--no-sync",
        ],
        {
          env: lifecycle.commandEnv,
          timeoutMs: remainingTimeout(
            deadline,
            COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.initdbMs,
            "initdb",
          ),
          signal,
          stage: "initdb",
        },
      ),
    );
    await measureStage(timings, "postgres-start", () =>
      startPostgres(lifecycle, lifecycle.logHandle.fd),
    );

    const bootstrapPath = join(lifecycle.tempRoot, "bootstrap.sql");
    await writeExactPrivateFile(bootstrapPath, BOOTSTRAP_SQL);
    await measureStage(timings, "bootstrap", () =>
      runPsqlFile(
        lifecycle,
        bootstrapPath,
        "bootstrap",
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.setupMs,
        { username: BOOTSTRAP_ROLE },
      ),
    );

    for (let index = 0; index < files.migrations.length; index += 1) {
      const migration = files.migrations[index];
      const migrationPath = join(
        lifecycle.tempRoot,
        `migration-${String(index + 1).padStart(2, "0")}.sql`,
      );
      await writeExactPrivateFile(migrationPath, migration.executionSql);
      await measureStage(timings, "migrations", () =>
        runPsqlFile(
          lifecycle,
          migrationPath,
          `migration-${String(index + 1).padStart(2, "0")}`,
          COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.migrationMs,
          { username: MIGRATION_ROLE, singleTransaction: true },
        ),
      );
      if (
        migration.basename ===
        "20260820135834_add_v1_note_generation_durable_shadow.sql"
      ) {
        await runPsqlQuery(
          lifecycle,
          "grant usage on schema careslink_v1_generation to postgres;",
          "migration-role-bridge",
          COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.migrationMs,
          { username: BOOTSTRAP_ROLE },
        );
      }
    }

    await runPsqlQuery(
      lifecycle,
      "revoke usage on schema careslink_v1_generation from postgres;",
      "migration-role-bridge",
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.migrationMs,
      { username: BOOTSTRAP_ROLE },
    );
    const bridgeRevoke = await runPsqlQuery(
      lifecycle,
      `select case when not pg_catalog.has_schema_privilege(
         'postgres', 'careslink_v1_generation', 'USAGE'
       ) then 'ok' else 'failed' end;`,
      "migration-role-bridge",
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.migrationMs,
      { username: BOOTSTRAP_ROLE },
    );
    if (bridgeRevoke.stdout.trim() !== "ok") {
      fail(
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_MIGRATION_FAILED",
        "migration-role-bridge",
      );
    }

    await measureStage(timings, "setup", () =>
      runPsqlFile(
        lifecycle,
        SETUP_PATH,
        "setup",
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.setupMs,
        {
          username: BOOTSTRAP_ROLE,
          variables: [["careslink_bootstrap_role", BOOTSTRAP_ROLE]],
        },
      ),
    );
    lifecycle.setupApplied = true;

    const databaseUrl =
      `postgresql://${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}` +
      `@localhost:${lifecycle.port}/postgres?host=` +
      encodeURIComponent(lifecycle.socketDirectory);
    validateCommunicationNotePointsTerminalSettlementDatabaseUrl(databaseUrl);
    liveResult = await measureStage(timings, "live-harness", async () => {
      try {
        const result = await runCommand(process.execPath, [SCRIPT_PATH, "--live"], {
          env: fixedLiveEnvironment(databaseUrl),
          timeoutMs: remainingTimeout(
            deadline,
            COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.liveHarnessMs,
            "live-harness",
          ),
          signal,
          stage: "live-harness",
        });
        return parseLiveHarnessResult(result.stdout);
      } catch (error) {
        if (error?.killed || error?.signal === "SIGKILL") {
          fail(
            "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_TIMEOUT",
            "live-harness",
          );
        }
        throw liveFailureFromError(error);
      }
    });
  } catch (error) {
    const stage = error?.stage ?? error?.lifecycleStage ?? "lifecycle";
    let fallback =
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_INTERNAL_FAILED";
    if (stage === "initdb") {
      fallback =
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_INITDB_FAILED";
    } else if (stage === "bootstrap") {
      fallback =
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_BOOTSTRAP_FAILED";
    } else if (
      stage.startsWith("migration-") ||
      stage === "migration-role-bridge"
    ) {
      fallback =
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_MIGRATION_FAILED";
    } else if (stage === "setup") {
      fallback =
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_SETUP_FAILED";
    } else if (stage === "live-harness") {
      fallback =
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_FAILED";
    } else if (stage === "file-policy" || stage === "migration-manifest") {
      fallback =
        "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_FILE_POLICY_FAILED";
    }
    primaryFailure = normalizeFailure(error, fallback, stage);
  }

  const teardown = await performTeardown(lifecycle, timings);
  if (primaryFailure || teardown.failures.length > 0) {
    const failure =
      mergeCommunicationNotePointsTerminalSettlementLifecycleFailure(
        primaryFailure,
        teardown.failures,
      );
    const evidence = Object.freeze({
      ...failure,
      postgresMajor: 16,
      portSelected: Number.isSafeInteger(lifecycle.port),
      timingsMs: Object.freeze({ ...timings }),
      cleanup: teardown.state,
    });
    throw new CommunicationNotePointsTerminalSettlementConcurrencyError(
      failure.code,
      failure.stage,
      evidence,
    );
  }

  return Object.freeze({
    ok: true,
    gate: "communication-note-points-terminal-settlement-local-pg16",
    marker: COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
    postgresVersion: lifecycle.pg.version,
    postgresMajor: 16,
    target: "fresh-passwordless-private-unix-socket",
    migrationCount: files.migrations.length,
    migrationManifestSha256: files.migrationManifestSha256,
    pinnedManifestSha256: files.pinnedManifestSha256,
    supportSqlSha256: Object.freeze({
      setup: files.setupSha256,
      cleanup: files.cleanupSha256,
    }),
    sourceSha256: files.sourceSha256,
    sourceRevisionSha256: files.sourceRevisionSha256,
    live: liveResult,
    timingsMs: Object.freeze({ ...timings }),
    cleanup: teardown.state,
  });
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected) {
  return (
    isPlainObject(value) &&
    Object.keys(value).sort().join("\u0000") ===
      [...expected].sort().join("\u0000")
  );
}

function validUuid(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}

function validHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validIsoMilliseconds(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertNoPrivatePointsIdentifiers(value, code) {
  const serialized = JSON.stringify(value);
  assert(
    typeof serialized === "string" &&
      !/"(?:reservationId|quoteId|admissionId|settlementId|ledgerEntryId|lotId|pointsAdmission|pointsSettlement)"/.test(
        serialized,
      ),
    code,
  );
}

function expectSingleJson(result, code) {
  assert(
    result &&
      Array.isArray(result.rows) &&
      result.rows.length === 1 &&
      Object.prototype.hasOwnProperty.call(result.rows[0], "result") &&
      result.rows[0].result !== null &&
      typeof result.rows[0].result === "object",
    code,
  );
  return result.rows[0].result;
}

function expectSingleValue(result, code) {
  assert(
    result &&
      Array.isArray(result.rows) &&
      result.rows.length === 1 &&
      Object.prototype.hasOwnProperty.call(result.rows[0], "result") &&
      result.rows[0].result !== null &&
      result.rows[0].result !== undefined,
    code,
  );
  return result.rows[0].result;
}

export function denyCommunicationNotePointsTerminalSettlementPasswordAuthentication() {
  fail(
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
    "connection",
  );
}

const CLIENT_CONNECTION_STATES = new WeakMap();

function installClientErrorSink(client) {
  assert(
    client && typeof client.on === "function",
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
    "connection",
  );
  const state = { asynchronousError: false };
  client.on("error", () => {
    state.asynchronousError = true;
  });
  CLIENT_CONNECTION_STATES.set(client, state);
}

function assertClientHealthy(client) {
  assert(
    CLIENT_CONNECTION_STATES.get(client)?.asynchronousError === false,
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
    "connection",
  );
}

function hardDestroyClientStream(client) {
  try {
    const stream = client?.connection?.stream;
    if (typeof stream?.destroy !== "function") return false;
    stream.destroy();
    return stream.destroyed === true;
  } catch {
    return false;
  }
}

async function closeClient(client) {
  if (!client) return;
  try {
    await withDeadline(
      Promise.resolve().then(() => client.end()),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.connectionMs,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CLOSE_FAILED",
      "connection-close",
    );
  } catch (error) {
    hardDestroyClientStream(client);
    throw error;
  }
}

async function closeClients(clients, primaryError) {
  const failures = [];
  for (const client of [...clients].reverse()) {
    if (!primaryError) {
      try {
        assertClientHealthy(client);
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      await closeClient(client);
    } catch (error) {
      failures.push(error);
    }
  }
  if (!primaryError && failures.length > 0) throw failures[0];
}

async function rollbackClient(client) {
  try {
    await withDeadline(
      Promise.resolve().then(() => client.query("rollback", [])),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.rollbackMs,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CLOSE_FAILED",
      "rollback",
    );
  } catch {
    hardDestroyClientStream(client);
  }
}

async function query(client, text, values = []) {
  assertClientHealthy(client);
  const result = await withDeadline(
    Promise.resolve().then(() => client.query({ text, values })),
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.queryMs,
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_QUERY_TIMEOUT",
    "query",
  );
  assertClientHealthy(client);
  return result;
}

function capture(operation) {
  return Promise.resolve(operation).then(
    (value) => Object.freeze({ ok: true, value }),
    (error) => Object.freeze({ ok: false, error }),
  );
}

function assertDatabaseError(outcome, expectedMessage, code) {
  assert(
    outcome?.ok === false &&
      outcome.error?.code === "P0001" &&
      outcome.error?.message === expectedMessage,
    code,
  );
}

function applicationName(scenario, label) {
  assert(
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS.includes(
      scenario,
    ) && ["a", "b", "observer"].includes(label),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
    "connection",
  );
  return `careslink-cn-terminal-${scenario}-${label}`;
}

const PREFLIGHT_SQL = `
select
  pg_catalog.inet_server_addr()::pg_catalog.text as server_addr,
  pg_catalog.current_setting('port')::pg_catalog.int4 as server_port,
  pg_catalog.current_database()::pg_catalog.text as database_name,
  session_user::pg_catalog.text as session_user_name,
  current_user::pg_catalog.text as current_user_name,
  pg_catalog.current_setting('server_version_num')::pg_catalog.int4
    as server_version_num,
  pg_catalog.pg_backend_pid()::pg_catalog.int4 as backend_pid,
  coalesce((
    select ssl from pg_catalog.pg_stat_ssl
    where pid = pg_catalog.pg_backend_pid()
  ), false) as ssl_in_use,
  pg_catalog.current_setting(
    'careslink.cn_points_terminal.marker',
    true
  )::pg_catalog.text as concurrency_marker
`;

async function openScenarioConnection(
  Client,
  databaseUrl,
  target,
  scenario,
  label,
) {
  const client = new Client({
    application_name: applicationName(scenario, label),
    connectionString: databaseUrl,
    connectionTimeoutMillis:
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.connectionMs,
    keepAlive: false,
    password:
      denyCommunicationNotePointsTerminalSettlementPasswordAuthentication,
    query_timeout:
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.queryMs,
    ssl: false,
    statement_timeout:
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.statementMs,
  });
  installClientErrorSink(client);
  try {
    await withDeadline(
      Promise.resolve().then(() => client.connect()),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.connectionMs,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
      "connection",
    );
    assert(
      typeof client?.connection?.stream?.destroy === "function",
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
      "connection",
    );
    await query(
      client,
      `set statement_timeout = '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.statementMs}ms'`,
    );
    await query(
      client,
      `set idle_in_transaction_session_timeout = '${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.statementMs}ms'`,
    );
    const preflightResult = await query(client, PREFLIGHT_SQL);
    assert(
      preflightResult.rows.length === 1,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
      "connection",
    );
    const preflight =
      assertCommunicationNotePointsTerminalSettlementPreflight(
        preflightResult.rows[0],
        target,
      );
    return Object.freeze({ client, label, pid: preflight.backendPid });
  } catch (error) {
    hardDestroyClientStream(client);
    throw error;
  }
}

async function openScenario(Client, databaseUrl, target, scenario, labels) {
  const opened = [];
  try {
    for (const label of labels) {
      opened.push(
        await openScenarioConnection(
          Client,
          databaseUrl,
          target,
          scenario,
          label,
        ),
      );
    }
    assertCommunicationNotePointsTerminalSettlementDistinctBackends(
      ...opened.map((entry) => entry.pid),
    );
    return Object.freeze(
      Object.fromEntries(opened.map((entry) => [entry.label, entry])),
    );
  } catch (error) {
    await closeClients(
      opened.map((entry) => entry.client),
      error,
    );
    throw error;
  }
}

async function support(client, functionName, casts = [], values = []) {
  assert(
    /^[a-z][a-z0-9_]*$/.test(functionName) && casts.length === values.length,
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_INTERNAL_FAILED",
  );
  const parameters = casts
    .map((cast, index) => `$${index + 1}::pg_catalog.${cast}`)
    .join(", ");
  return expectSingleValue(
    await query(
      client,
      `select ${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA}.${functionName}(${parameters}) as result`,
      values,
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function fixtureCatalog(client) {
  return support(client, "fixture_catalog");
}

async function admitCase(client, scenario, remainingMs) {
  return support(
    client,
    "admit_case",
    ["text", "int4"],
    [scenario, remainingMs],
  );
}

async function fixtureState(client, scenario) {
  return support(client, "fixture_state", ["text"], [scenario]);
}

async function claim(client, catalog) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.claim_v1_shadow_note_generation_job(
        $1::pg_catalog.text, $2::pg_catalog.text, $3::pg_catalog.text,
        $4::pg_catalog.text, $5::pg_catalog.text, $6::pg_catalog.text
      ) as result`,
      [
        catalog.registrationDigest,
        catalog.workerPolicyVersion,
        catalog.workerPolicyDigest,
        catalog.workerIdentityHash,
        catalog.contractVersion,
        catalog.schemaVersion,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function heartbeat(client, fixture, claimed, catalog) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
        $1::pg_catalog.uuid, $2::pg_catalog.uuid, $3::pg_catalog.text,
        $4::pg_catalog.text, $5::pg_catalog.text, $6::pg_catalog.text
      ) as result`,
      [
        fixture.jobId,
        claimed.attempt.attemptId,
        claimed.leaseToken,
        catalog.registrationDigest,
        catalog.workerPolicyVersion,
        catalog.workerPolicyDigest,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function authorize(client, fixture, claimed, catalog) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
        $1::pg_catalog.uuid, $2::pg_catalog.uuid, $3::pg_catalog.uuid,
        $4::pg_catalog.text, $5::pg_catalog.text
      ) as result`,
      [
        fixture.jobId,
        fixture.payloadId,
        claimed.attempt.attemptId,
        claimed.leaseToken,
        catalog.registrationDigest,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function consume(client, fixture, claimed, authorized, catalog) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
        $1::pg_catalog.uuid, $2::pg_catalog.uuid, $3::pg_catalog.uuid,
        $4::pg_catalog.text, $5::pg_catalog.text, $6::pg_catalog.uuid
      ) as result`,
      [
        fixture.jobId,
        fixture.payloadId,
        claimed.attempt.attemptId,
        claimed.leaseToken,
        catalog.registrationDigest,
        authorized.grantId,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function fence(client, fixture, claimed, catalog) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
        $1::pg_catalog.uuid, $2::pg_catalog.uuid, $3::pg_catalog.text,
        $4::pg_catalog.text, $5::pg_catalog.text, $6::pg_catalog.text
      ) as result`,
      [
        fixture.jobId,
        claimed.attempt.attemptId,
        claimed.leaseToken,
        catalog.registrationDigest,
        catalog.workerPolicyVersion,
        catalog.workerPolicyDigest,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function settleFailure(client, fixture, claimed, catalog, reason) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.settle_v1_shadow_note_generation_failure(
        $1::pg_catalog.uuid, $2::pg_catalog.uuid, $3::pg_catalog.text,
        $4::pg_catalog.text, $5::pg_catalog.text, $6::pg_catalog.text,
        $7::pg_catalog.text, $8::pg_catalog.jsonb
      ) as result`,
      [
        fixture.jobId,
        claimed.attempt.attemptId,
        claimed.leaseToken,
        catalog.registrationDigest,
        catalog.workerPolicyVersion,
        catalog.workerPolicyDigest,
        reason,
        null,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function resolveAttempt(
  client,
  fixture,
  claimed,
  catalog,
  contentHash,
  evidenceHash,
) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
        $1::pg_catalog.uuid, $2::pg_catalog.uuid, $3::pg_catalog.text,
        $4::pg_catalog.text, $5::pg_catalog.text, $6::pg_catalog.text
      ) as result`,
      [
        fixture.jobId,
        claimed.attempt.attemptId,
        claimed.leaseToken,
        catalog.registrationDigest,
        contentHash,
        evidenceHash,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function recover(
  client,
  catalog,
  registrationDigest = catalog.registrationDigest,
) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.recover_v1_shadow_note_generation_expired(
        $1::pg_catalog.text, $2::pg_catalog.text, $3::pg_catalog.text,
        $4::pg_catalog.text, $5::pg_catalog.text, $6::pg_catalog.text
      ) as result`,
      [
        registrationDigest,
        catalog.workerPolicyVersion,
        catalog.workerPolicyDigest,
        catalog.workerIdentityHash,
        catalog.contractVersion,
        catalog.schemaVersion,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

async function cancelJob(client, fixture, catalog) {
  return expectSingleJson(
    await query(
      client,
      `select careslink_v1_generation.cancel_v1_shadow_note_generation_job(
        $1::pg_catalog.uuid, $2::pg_catalog.uuid, $3::pg_catalog.uuid,
        $4::pg_catalog.text, $5::pg_catalog.text
      ) as result`,
      [
        fixture.ownerId,
        fixture.sessionId,
        fixture.jobId,
        catalog.contractVersion,
        catalog.schemaVersion,
      ],
    ),
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED",
  );
}

function assertFixtureCatalog(value) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED";
  assert(
    exactKeys(value, [
      "contractVersion",
      "schemaVersion",
      "workerPolicyVersion",
      "workerPolicyDigest",
      "workerIdentityHash",
      "registrationDigest",
      "secondaryRegistrationDigest",
      "providerDeadlineMs",
      "minimumPayloadRemainingAtClaimMs",
      "cases",
    ]) &&
      value.contractVersion === "1.0.0-shadow.1" &&
      value.schemaVersion === "2026-08-09.v1-shadow" &&
      typeof value.workerPolicyVersion === "string" &&
      validHash(value.workerPolicyDigest) &&
      validHash(value.workerIdentityHash) &&
      validHash(value.registrationDigest) &&
      validHash(value.secondaryRegistrationDigest) &&
      value.secondaryRegistrationDigest !== value.registrationDigest &&
      Number.isSafeInteger(value.providerDeadlineMs) &&
      value.providerDeadlineMs > 0 &&
      Number.isSafeInteger(value.minimumPayloadRemainingAtClaimMs) &&
      value.minimumPayloadRemainingAtClaimMs > value.providerDeadlineMs &&
      exactKeys(
        value.cases,
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS,
      ),
    code,
  );
  for (const scenario of COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS) {
    const fixture = value.cases[scenario];
    assert(
      exactKeys(fixture, [
        "ownerId",
        "sessionId",
        "privacyId",
        "jobId",
        "payloadId",
      ]) &&
        Object.values(fixture).every(validUuid),
      code,
    );
  }
  return value;
}

function assertAdmission(value, fixture) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED";
  assert(
    exactKeys(value, ["created", "payloadAccepted", "pointsReserved", "job"]) &&
      value.created === true &&
      value.payloadAccepted === true &&
      value.pointsReserved === true &&
      exactKeys(value.job, [
        "attemptCount",
        "createdAt",
        "failureCode",
        "finishedAt",
        "jobId",
        "noteType",
        "result",
        "serviceCode",
        "startedAt",
        "status",
        "updatedAt",
      ]) &&
      value.job.jobId === fixture.jobId &&
      value.job.noteType === "communication" &&
      value.job.serviceCode === "note.communication.generate" &&
      value.job.status === "QUEUED" &&
      value.job.attemptCount === 0 &&
      validIsoMilliseconds(value.job.createdAt) &&
      value.job.updatedAt === value.job.createdAt &&
      value.job.startedAt === null &&
      value.job.finishedAt === null &&
      value.job.failureCode === null &&
      value.job.result === null,
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  return value;
}

function assertClaim(value, fixture, ordinal) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED";
  assert(
    exactKeys(value, ["status", "claim"]) &&
      value.status === "CLAIMED" &&
      isPlainObject(value.claim) &&
      isPlainObject(value.claim.job) &&
      isPlainObject(value.claim.attempt) &&
      value.claim.job.jobId === fixture.jobId &&
      value.claim.job.payloadId === fixture.payloadId &&
      value.claim.job.status === "RUNNING" &&
      value.claim.attempt.ordinal === ordinal &&
      value.claim.attempt.status === "RUNNING" &&
      validUuid(value.claim.attempt.attemptId) &&
      validHash(value.claim.attempt.leaseTokenHash) &&
      typeof value.claim.leaseToken === "string" &&
      value.claim.leaseToken.length >= 32,
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  return Object.freeze({
    attempt: value.claim.attempt,
    job: value.claim.job,
    leaseToken: value.claim.leaseToken,
  });
}

const FIXTURE_STATE_KEYS = Object.freeze([
  "case",
  "jobId",
  "jobStatus",
  "attemptCount",
  "jobFailureReason",
  "jobFinishedAt",
  "resultDocumentId",
  "resultRevisionId",
  "resultContentHash",
  "documentCurrentRevisionId",
  "documentCurrentRevisionNumber",
  "documentLifecycleStatus",
  "attempts",
  "reservationStatus",
  "reservationExpiresAt",
  "reservationTerminalAt",
  "settlementCount",
  "settlementJobStatus",
  "settlementReservationStatus",
  "settlementAttemptId",
  "settlementAttemptNumber",
  "settlementReason",
  "settlementSettledAt",
  "settlementPoints",
  "settlementAllocationPoints",
  "settlementRestoredPoints",
  "settlementResultRef",
  "reserveLedgerCount",
  "terminalLedgerCount",
  "terminalLedgerEvent",
  "terminalLedgerCreatedAt",
  "lotRemaining",
  "grantCount",
  "issuedGrantCount",
  "consumedGrantCount",
  "revokedGrantCount",
  "authorityBoundsValid",
  "payloadState",
  "payloadRevokeReason",
  "payloadRevokedAt",
  "outboxCount",
  "outboxRequestedAt",
  "documentCount",
  "revisionCount",
  "syncChangeCount",
  "mutationReceiptCount",
  "providerEvidenceCount",
]);

function assertFixtureStateShape(state, scenario, fixture) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_STATE_FAILED";
  assert(
    exactKeys(state, FIXTURE_STATE_KEYS) &&
      state.case === scenario &&
      state.jobId === fixture.jobId &&
      validIsoMilliseconds(state.reservationExpiresAt) &&
      Array.isArray(state.attempts) &&
      state.reserveLedgerCount === 1 &&
      state.authorityBoundsValid === true,
    code,
  );
  return state;
}

function assertReleasedState(
  state,
  {
    scenario,
    fixture,
    jobStatus,
    jobFailureReason,
    attemptStatus,
    attemptFailureReason,
    settlementReason,
    grantCount,
    revokedGrantCount,
  },
) {
  assertFixtureStateShape(state, scenario, fixture);
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_STATE_FAILED";
  assert(
    state.jobStatus === jobStatus &&
      state.attemptCount === 1 &&
      state.jobFailureReason === jobFailureReason &&
      state.resultDocumentId === null &&
      state.resultRevisionId === null &&
      state.resultContentHash === null &&
      state.documentCurrentRevisionId === null &&
      state.documentCurrentRevisionNumber === null &&
      state.documentLifecycleStatus === null &&
      state.attempts.length === 1 &&
      state.attempts[0].attemptNumber === 1 &&
      state.attempts[0].status === attemptStatus &&
      state.attempts[0].failureReason === attemptFailureReason &&
      validUuid(state.attempts[0].terminalTransactionId) &&
      state.reservationStatus === "RELEASED" &&
      state.settlementCount === 1 &&
      state.settlementJobStatus === jobStatus &&
      state.settlementReservationStatus === "RELEASED" &&
      validUuid(state.settlementAttemptId) &&
      state.settlementAttemptNumber === 1 &&
      state.settlementReason === settlementReason &&
      state.settlementPoints === 20 &&
      state.settlementAllocationPoints === 20 &&
      state.settlementRestoredPoints === 20 &&
      state.settlementResultRef === null &&
      state.terminalLedgerCount === 1 &&
      state.terminalLedgerEvent === "RELEASE" &&
      state.lotRemaining === 30 &&
      state.grantCount === grantCount &&
      state.issuedGrantCount === 0 &&
      state.consumedGrantCount === 0 &&
      state.revokedGrantCount === revokedGrantCount &&
      state.payloadState === "REVOKED" &&
      state.payloadRevokeReason ===
        (jobStatus === "CANCELLED" ? "CANCELLED" : "FAILED") &&
      state.outboxCount === 1 &&
      state.documentCount === 0 &&
      state.revisionCount === 0 &&
      state.syncChangeCount === 0 &&
      state.mutationReceiptCount === 0 &&
      state.providerEvidenceCount === 0,
    code,
  );
  return state;
}

async function waitForBlocker(
  observerClient,
  waiterPid,
  blockerPid,
  sleep,
  { strictAdvisory = false } = {},
) {
  const deadline =
    Date.now() +
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.lockObservationMs;
  do {
    const result = await query(
      observerClient,
      `select
        $1::pg_catalog.int4 as waiting_pid,
        $2::pg_catalog.int4 as blocker_pid,
        'advisory'::pg_catalog.text as locktype,
        false as granted
       where $2::pg_catalog.int4 = any(
         pg_catalog.pg_blocking_pids($1::pg_catalog.int4)
       )`,
      [waiterPid, blockerPid],
    );
    if (result.rows.length === 1) {
      if (strictAdvisory) {
        return assertCommunicationNotePointsTerminalSettlementBlockerRows(
          result.rows,
          waiterPid,
          blockerPid,
        );
      }
      return Object.freeze({
        blockerPid,
        observed: true,
        waiterPid,
      });
    }
    await sleep(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.lockPollMs,
    );
  } while (Date.now() < deadline);
  fail(
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
      .blockerFailed,
    "lock-observation",
  );
}

async function waitUntilRemaining(
  expiresAt,
  targetRemainingMs,
  sleep,
  clock,
  code,
) {
  assert(
    validIsoMilliseconds(expiresAt) &&
      Number.isSafeInteger(targetRemainingMs) &&
      targetRemainingMs > 0,
    code,
  );
  const sleepMs = Math.max(
    0,
    Math.ceil(Date.parse(expiresAt) - clock() - targetRemainingMs),
  );
  if (sleepMs > 0) await sleep(sleepMs);
  const remainingMs = Date.parse(expiresAt) - clock();
  assert(
    remainingMs > 0 && remainingMs <= targetRemainingMs + 100,
    code,
  );
  return remainingMs;
}

async function waitUntilExpired(expiresAt, sleep, clock, code) {
  assert(validIsoMilliseconds(expiresAt), code);
  const sleepMs = Math.max(0, Math.ceil(Date.parse(expiresAt) - clock() + 25));
  if (sleepMs > 0) await sleep(sleepMs);
  assert(Date.parse(expiresAt) <= clock(), code);
}

function assertFailureAcknowledgement(value, reason, disposition) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED";
  assert(
    exactKeys(value, [
      "transaction",
      "settlement",
      "jobTransition",
      "attemptTerminal",
      "payloadMetadata",
      "purgeOutboxAcknowledgment",
    ]) &&
      value.transaction?.status === "COMMITTED" &&
      value.transaction?.atomic === true &&
      validUuid(value.transaction?.transactionId) &&
      value.settlement?.disposition === disposition &&
      value.settlement?.reason === reason &&
      value.attemptTerminal?.status === "FAILED",
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  assert(
    !/"(?:canonicalContent|providerEvidence|englishDraft|vault|locator)"\s*:/i.test(
      JSON.stringify(value),
    ),
    code,
  );
  return value;
}

function assertDeniedSettlement(
  value,
  code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SHORT_GRANT_FAILED",
) {
  assert(
    exactKeys(value, [
      "status",
      "transactionId",
      "transactionStatus",
      "atomic",
      "committedAt",
      "registrationDigest",
      "reason",
      "jobReferenceHash",
      "attemptReferenceHash",
      "payloadReferenceHash",
      "jobStatus",
      "attemptStatus",
      "payloadState",
      "payloadDisposition",
      "purgeEventReferenceHash",
    ]) &&
      value.status === "DENIED_SETTLED" &&
      validUuid(value.transactionId) &&
      value.transactionStatus === "COMMITTED" &&
      value.atomic === true &&
      validIsoMilliseconds(value.committedAt) &&
      validHash(value.registrationDigest) &&
      value.reason === "PAYLOAD_UNAVAILABLE" &&
      validHash(value.jobReferenceHash) &&
      validHash(value.attemptReferenceHash) &&
      validHash(value.payloadReferenceHash) &&
      value.jobStatus === "FAILED" &&
      value.attemptStatus === "FAILED" &&
      value.payloadState === "REVOKED" &&
      value.payloadDisposition === "REVOKED_PURGE_ENQUEUED" &&
      validHash(value.purgeEventReferenceHash),
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  return value;
}

function assertSettlementWorkerPolicyBoundary(value) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_FAILURE_FAILED";
  assert(
    exactKeys(value, [
      "selectOnly",
      "forcedRls",
      "approvedOnly",
      "noRuntimeMembership",
      "settlementSchemaCreateDenied",
      "generationExecutorSchemaCreateDenied",
      "ownerApiExecutorSchemaCreateDenied",
    ]) &&
      value.selectOnly === true &&
      value.forcedRls === true &&
      value.approvedOnly === true &&
      value.noRuntimeMembership === true &&
      value.settlementSchemaCreateDenied === true &&
      value.generationExecutorSchemaCreateDenied === true &&
      value.ownerApiExecutorSchemaCreateDenied === true,
    code,
  );
  return value;
}

function assertUnmarkedPaidOuterReplayDenied(value) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_FAILURE_FAILED";
  assert(
    exactKeys(value, [
      "denied",
      "jobUnchanged",
      "pointsUnchanged",
      "admissionCount",
      "settlementCount",
    ]) &&
      value.denied === true &&
      value.jobUnchanged === true &&
      value.pointsUnchanged === true &&
      value.admissionCount === 0 &&
      value.settlementCount === 0,
    code,
  );
  return value;
}

async function runTerminalFailureScenario(
  Client,
  databaseUrl,
  target,
) {
  const scenario = "terminal-failure";
  const connections = await openScenario(
    Client,
    databaseUrl,
    target,
    scenario,
    ["a", "observer"],
  );
  let primaryError = null;
  try {
    const catalog = assertFixtureCatalog(
      await fixtureCatalog(connections.observer.client),
    );
    const fixture = catalog.cases[scenario];
    const settlementWorkerPolicyBoundary =
      assertSettlementWorkerPolicyBoundary(
        await support(
          connections.observer.client,
          "assert_settlement_worker_policy_boundary",
        ),
      );
    const unmarkedPaidOuterRunningReplay =
      assertUnmarkedPaidOuterReplayDenied(
        await support(
          connections.observer.client,
          "assert_unmarked_paid_outer_running_replay_denied",
        ),
      );
    const unmarkedPaidOuterTerminalReplay =
      assertUnmarkedPaidOuterReplayDenied(
        await support(
          connections.observer.client,
          "assert_unmarked_paid_outer_terminal_replay_denied",
        ),
      );
    assertAdmission(
      await admitCase(connections.a.client, scenario, 120_000),
      fixture,
    );
    const quarantine = await support(
      connections.observer.client,
      "assert_generic_terminal_quarantine",
    );
    assert(
      exactKeys(quarantine, [
        "commitDenied",
        "releaseDenied",
        "reservationStatus",
        "terminalLedgerCount",
        "reserveLedgerCount",
        "lotRemaining",
      ]) &&
        quarantine.commitDenied === true &&
        quarantine.releaseDenied === true &&
        quarantine.reservationStatus === "RESERVED" &&
        quarantine.terminalLedgerCount === 0 &&
        quarantine.reserveLedgerCount === 1 &&
        quarantine.lotRemaining === 10,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_FAILURE_FAILED",
    );
    const claimed = assertClaim(
      await claim(connections.a.client, catalog),
      fixture,
      1,
    );
    const acknowledgement = assertFailureAcknowledgement(
      await settleFailure(
        connections.a.client,
        fixture,
        claimed,
        catalog,
        "PROVIDER_PERMANENT",
      ),
      "PROVIDER_PERMANENT",
      "FAILED",
    );
    const replay = await settleFailure(
      connections.observer.client,
      fixture,
      claimed,
      catalog,
      "PROVIDER_PERMANENT",
    );
    const resolved = await resolveAttempt(
      connections.observer.client,
      fixture,
      claimed,
      catalog,
      null,
      null,
    );
    assert(
      sameJson(replay, acknowledgement) &&
        exactKeys(resolved, ["status", "atomicSettlement"]) &&
        resolved.status === "FAILED" &&
        sameJson(resolved.atomicSettlement, acknowledgement),
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_FAILURE_FAILED",
    );
    const state = assertReleasedState(
      await fixtureState(connections.observer.client, scenario),
      {
        scenario,
        fixture,
        jobStatus: "FAILED",
        jobFailureReason: "PROVIDER_PERMANENT",
        attemptStatus: "FAILED",
        attemptFailureReason: "PROVIDER_PERMANENT",
        settlementReason: "PROVIDER_PERMANENT",
        grantCount: 0,
        revokedGrantCount: 0,
      },
    );
    const terminalJobMutation = await support(
      connections.observer.client,
      "assert_terminal_job_mutation_denied",
      ["uuid"],
      [fixture.jobId],
    );
    assert(
      exactKeys(terminalJobMutation, [
        "denied",
        "jobUnchanged",
        "settlementIntact",
      ]) &&
        terminalJobMutation.denied === true &&
        terminalJobMutation.jobUnchanged === true &&
        terminalJobMutation.settlementIntact === true,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TERMINAL_FAILURE_FAILED",
    );
    return Object.freeze({
      scenario,
      genericCommitDenied: quarantine.commitDenied,
      genericReleaseDenied: quarantine.releaseDenied,
      settlementWorkerPolicyBoundary,
      unmarkedPaidOuterReplaysDenied:
        unmarkedPaidOuterRunningReplay.denied &&
        unmarkedPaidOuterTerminalReplay.denied,
      responseLossReplay: true,
      terminalJobImmutable: terminalJobMutation.denied,
      settlementCount: state.settlementCount,
      pointsReleased: state.settlementPoints,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeClients(
      Object.values(connections).map((entry) => entry.client),
      primaryError,
    );
  }
}

function assertAuthorized(value, claimed, catalog) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED";
  assert(
    exactKeys(value, [
      "status",
      "grantId",
      "expiresAt",
      "jobReferenceHash",
      "attemptReferenceHash",
      "payloadReferenceHash",
      "registrationDigest",
    ]) &&
      value.status === "AUTHORIZED" &&
      validUuid(value.grantId) &&
      validIsoMilliseconds(value.expiresAt) &&
      validHash(value.jobReferenceHash) &&
      validHash(value.attemptReferenceHash) &&
      validHash(value.payloadReferenceHash) &&
      value.registrationDigest === catalog.registrationDigest &&
      value.attemptReferenceHash === sha256(claimed.attempt.attemptId),
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  return value;
}

function assertFence(value, catalog) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED";
  assert(
    exactKeys(value, [
      "status",
      "fenceId",
      "fenceDigest",
      "expiresAt",
      "jobReferenceHash",
      "attemptReferenceHash",
      "registrationDigest",
    ]) &&
      value.status === "FENCED" &&
      validUuid(value.fenceId) &&
      validHash(value.fenceDigest) &&
      validIsoMilliseconds(value.expiresAt) &&
      validHash(value.jobReferenceHash) &&
      validHash(value.attemptReferenceHash) &&
      value.registrationDigest === catalog.registrationDigest,
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  return value;
}

function assertSuccessAcknowledgement(value) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVELOPE_FAILED";
  assert(
    exactKeys(value, [
      "transaction",
      "canonical",
      "syncReceipt",
      "mutationReceipt",
      "jobTerminal",
      "attemptTerminal",
      "payloadMetadata",
      "purgeOutboxAcknowledgment",
    ]) &&
      value.transaction?.status === "COMMITTED" &&
      value.transaction?.atomic === true &&
      validUuid(value.transaction?.transactionId) &&
      value.jobTerminal?.status === "SUCCEEDED" &&
      value.attemptTerminal?.status === "SUCCEEDED" &&
      validHash(value.attemptTerminal?.contentHash) &&
      validHash(value.attemptTerminal?.providerEvidenceHash) &&
      value.payloadMetadata?.state === "REVOKED" &&
      value.purgeOutboxAcknowledgment?.status === "ENQUEUED",
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  assert(
    !/"(?:canonicalContent|providerEvidence|englishDraft|vault|locator)"\s*:/i.test(
      JSON.stringify(value),
    ),
    code,
  );
  return value;
}

function assertCommittedSuccessState(state, scenario, fixture, first, second) {
  assertFixtureStateShape(state, scenario, fixture);
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_STATE_FAILED";
  assert(
    state.jobStatus === "SUCCEEDED" &&
      state.attemptCount === 2 &&
      state.jobFailureReason === null &&
      validUuid(state.resultDocumentId) &&
      validUuid(state.resultRevisionId) &&
      validHash(state.resultContentHash) &&
      state.documentCurrentRevisionId !== state.resultRevisionId &&
      state.documentCurrentRevisionNumber === 2 &&
      state.documentLifecycleStatus === "TOMBSTONED" &&
      state.attempts.length === 2 &&
      state.attempts[0].attemptId === first.attempt.attemptId &&
      state.attempts[0].attemptNumber === 1 &&
      state.attempts[0].status === "FAILED" &&
      state.attempts[0].failureReason === "PROVIDER_TIMEOUT" &&
      state.attempts[0].baseDelayMs === 1 &&
      state.attempts[0].jitterMs === 0 &&
      state.attempts[0].retryDelayMs === 1 &&
      state.attempts[1].attemptId === second.attempt.attemptId &&
      state.attempts[1].attemptNumber === 2 &&
      state.attempts[1].status === "SUCCEEDED" &&
      state.attempts[1].failureReason === null &&
      state.reservationStatus === "COMMITTED" &&
      state.settlementCount === 1 &&
      state.settlementJobStatus === "SUCCEEDED" &&
      state.settlementReservationStatus === "COMMITTED" &&
      state.settlementAttemptId === second.attempt.attemptId &&
      state.settlementAttemptNumber === 2 &&
      state.settlementReason === null &&
      state.settlementPoints === 20 &&
      state.settlementAllocationPoints === 20 &&
      state.settlementRestoredPoints === 0 &&
      typeof state.settlementResultRef === "string" &&
      state.settlementResultRef.startsWith("note-generation:") &&
      state.terminalLedgerCount === 1 &&
      state.terminalLedgerEvent === "COMMIT" &&
      state.lotRemaining === 10 &&
      state.grantCount === 1 &&
      state.issuedGrantCount === 0 &&
      state.consumedGrantCount === 1 &&
      state.revokedGrantCount === 0 &&
      state.payloadState === "REVOKED" &&
      state.payloadRevokeReason === "SUCCEEDED" &&
      state.outboxCount === 1 &&
      state.documentCount === 1 &&
      state.revisionCount === 2 &&
      state.syncChangeCount >= 3 &&
      state.mutationReceiptCount >= 3 &&
      state.providerEvidenceCount === 1,
    code,
  );
  return state;
}

async function runRetrySuccessReplayScenario(
  Client,
  databaseUrl,
  target,
  sleep,
) {
  const scenario = "retry-success-replay";
  const connections = await openScenario(
    Client,
    databaseUrl,
    target,
    scenario,
    ["a", "observer"],
  );
  let primaryError = null;
  try {
    const catalog = assertFixtureCatalog(
      await fixtureCatalog(connections.observer.client),
    );
    const fixture = catalog.cases[scenario];
    assertAdmission(
      await admitCase(connections.a.client, scenario, 120_000),
      fixture,
    );
    const first = assertClaim(
      await claim(connections.a.client, catalog),
      fixture,
      1,
    );
    const retry = assertFailureAcknowledgement(
      await settleFailure(
        connections.a.client,
        fixture,
        first,
        catalog,
        "PROVIDER_TIMEOUT",
      ),
      "PROVIDER_TIMEOUT",
      "RETRY_SCHEDULED",
    );
    assert(
      retry.settlement.payloadDisposition === "RETAINED_FOR_RETRY" &&
        retry.settlement.baseDelayMs === 1 &&
        retry.settlement.jitterMs === 0 &&
        retry.settlement.retryDelayMs === 1 &&
        retry.jobTransition.status === "QUEUED" &&
        retry.payloadMetadata.state === "AVAILABLE" &&
        retry.purgeOutboxAcknowledgment === null,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RETRY_REPLAY_FAILED",
    );
    await sleep(5);
    const second = assertClaim(
      await claim(connections.observer.client, catalog),
      fixture,
      2,
    );
    const authorized = assertAuthorized(
      await authorize(connections.a.client, fixture, second, catalog),
      second,
      catalog,
    );
    const consumed = await support(
      connections.a.client,
      "consume_grant_test_only",
      ["uuid", "uuid"],
      [fixture.jobId, authorized.grantId],
    );
    assert(
      exactKeys(consumed, ["status", "grantId", "consumedAt"]) &&
        consumed.status === "CONSUMED" &&
        consumed.grantId === authorized.grantId &&
        validIsoMilliseconds(consumed.consumedAt),
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RETRY_REPLAY_FAILED",
    );
    const fenced = assertFence(
      await fence(connections.a.client, fixture, second, catalog),
      catalog,
    );
    const success = assertSuccessAcknowledgement(
      await support(
        connections.a.client,
        "commit_success_test_only",
        ["uuid", "uuid", "text", "uuid", "text"],
        [
          fixture.jobId,
          second.attempt.attemptId,
          second.leaseToken,
          fenced.fenceId,
          fenced.fenceDigest,
        ],
      ),
    );
    const contentHash = success.attemptTerminal.contentHash;
    const evidenceHash = success.attemptTerminal.providerEvidenceHash;
    const advance = await support(
      connections.a.client,
      "advance_success_document_test_only",
      ["uuid"],
      [fixture.jobId],
    );
    assert(
      exactKeys(advance, [
        "append",
        "tombstone",
        "revisionNumber",
        "lifecycleStatus",
      ]) &&
        advance.revisionNumber === 2 &&
        advance.lifecycleStatus === "TOMBSTONED",
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RETRY_REPLAY_FAILED",
    );
    const retryReplay = await settleFailure(
      connections.observer.client,
      fixture,
      first,
      catalog,
      "PROVIDER_TIMEOUT",
    );
    const retryResolved = await resolveAttempt(
      connections.observer.client,
      fixture,
      first,
      catalog,
      null,
      null,
    );
    const successReplay = await support(
      connections.observer.client,
      "commit_success_test_only",
      ["uuid", "uuid", "text", "uuid", "text"],
      [
        fixture.jobId,
        second.attempt.attemptId,
        second.leaseToken,
        fenced.fenceId,
        fenced.fenceDigest,
      ],
    );
    const successResolved = await resolveAttempt(
      connections.observer.client,
      fixture,
      second,
      catalog,
      contentHash,
      evidenceHash,
    );
    assert(
      sameJson(retryReplay, retry) &&
        exactKeys(retryResolved, ["status", "atomicSettlement"]) &&
        retryResolved.status === "RETRY_SCHEDULED" &&
        sameJson(retryResolved.atomicSettlement, retry) &&
        sameJson(successReplay, success) &&
        exactKeys(successResolved, ["status", "atomicSuccess"]) &&
        successResolved.status === "SUCCEEDED" &&
        sameJson(successResolved.atomicSuccess, success),
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RETRY_REPLAY_FAILED",
    );
    const state = assertCommittedSuccessState(
      await fixtureState(connections.observer.client, scenario),
      scenario,
      fixture,
      first,
      second,
    );
    return Object.freeze({
      scenario,
      attemptCount: state.attemptCount,
      historicalRetryReplay: true,
      successReplayAfterDocumentAdvance: true,
      pointsCommitted: state.settlementPoints,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeClients(
      Object.values(connections).map((entry) => entry.client),
      primaryError,
    );
  }
}

function assertRecoveryEnvelope(value) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED";
  assert(
    exactKeys(value, ["recovered", "requeued", "failed"]) &&
      Number.isSafeInteger(value.recovered) &&
      Number.isSafeInteger(value.requeued) &&
      Number.isSafeInteger(value.failed) &&
      value.recovered >= 0 &&
      value.recovered === value.requeued + value.failed,
    code,
  );
  return value;
}

function assertUnpaidAdmission(value, fixture) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED";
  assert(
    exactKeys(value, ["created", "payloadAccepted", "job"]) &&
      value.created === true &&
      value.payloadAccepted === true &&
      exactKeys(value.job, [
        "attemptCount",
        "createdAt",
        "failureCode",
        "finishedAt",
        "jobId",
        "noteType",
        "result",
        "serviceCode",
        "startedAt",
        "status",
        "updatedAt",
      ]) &&
      value.job.jobId === fixture.jobId &&
      value.job.noteType === "communication" &&
      value.job.serviceCode === "note.communication.generate" &&
      value.job.status === "QUEUED" &&
      value.job.attemptCount === 0 &&
      validIsoMilliseconds(value.job.createdAt) &&
      value.job.updatedAt === value.job.createdAt &&
      value.job.startedAt === null &&
      value.job.finishedAt === null &&
      value.job.failureCode === null &&
      value.job.result === null,
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  return value;
}

function assertPreparedRecoveryFixtures(value) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED";
  assert(
    exactKeys(value, ["paidRunning", "unpaid"]) &&
      exactKeys(value.paidRunning, [
        "ownerId",
        "jobId",
        "payloadId",
        "admission",
      ]) &&
      exactKeys(value.unpaid, [
        "ownerId",
        "jobId",
        "payloadId",
        "admission",
      ]) &&
      [
        value.paidRunning.ownerId,
        value.paidRunning.jobId,
        value.paidRunning.payloadId,
        value.unpaid.ownerId,
        value.unpaid.jobId,
        value.unpaid.payloadId,
      ].every(validUuid) &&
      value.paidRunning.jobId !== value.unpaid.jobId &&
      value.paidRunning.payloadId !== value.unpaid.payloadId,
    code,
  );
  assertAdmission(value.paidRunning.admission, value.paidRunning);
  assertUnpaidAdmission(value.unpaid.admission, value.unpaid);
  return value;
}

function assertRecoveryFairnessState(value, prepared, paidQueuedFixture) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED";
  assert(
    exactKeys(value, [
      "primaryTurn",
      "secondaryTurn",
      "paidRunning",
      "paidQueued",
      "unpaid",
    ]) &&
      exactKeys(value.primaryTurn, ["paidFirst", "runningFirst"]) &&
      value.primaryTurn.paidFirst === false &&
      value.primaryTurn.runningFirst === true &&
      exactKeys(value.secondaryTurn, ["paidFirst", "runningFirst"]) &&
      value.secondaryTurn.paidFirst === true &&
      value.secondaryTurn.runningFirst === true &&
      exactKeys(value.paidRunning, [
        "jobId",
        "jobStatus",
        "attemptCount",
        "attemptStatus",
        "attemptLeaseExpiresAt",
        "reservationStatus",
        "reservationExpiresAt",
        "settlementCount",
      ]) &&
      value.paidRunning.jobId === prepared.paidRunning.jobId &&
      value.paidRunning.jobStatus === "FAILED" &&
      value.paidRunning.attemptCount === 1 &&
      value.paidRunning.attemptStatus === "LEASE_EXPIRED" &&
      validIsoMilliseconds(value.paidRunning.attemptLeaseExpiresAt) &&
      value.paidRunning.reservationStatus === "RELEASED" &&
      validIsoMilliseconds(value.paidRunning.reservationExpiresAt) &&
      value.paidRunning.settlementCount === 1 &&
      exactKeys(value.paidQueued, [
        "jobId",
        "jobStatus",
        "attemptCount",
        "settlementCount",
        "settlementAttemptNumber",
      ]) &&
      value.paidQueued.jobId === paidQueuedFixture.jobId &&
      value.paidQueued.jobStatus === "FAILED" &&
      value.paidQueued.attemptCount === 1 &&
      value.paidQueued.settlementCount === 1 &&
      value.paidQueued.settlementAttemptNumber === 1 &&
      exactKeys(value.unpaid, [
        "jobId",
        "jobStatus",
        "attemptCount",
        "admissionCount",
        "settlementCount",
      ]) &&
      value.unpaid.jobId === prepared.unpaid.jobId &&
      value.unpaid.jobStatus === "FAILED" &&
      value.unpaid.attemptCount === 1 &&
      value.unpaid.admissionCount === 0 &&
      value.unpaid.settlementCount === 0,
    code,
  );
  return value;
}

function assertFirstPaidRecoveryState(value, prepared, paidQueuedFixture) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED";
  assert(
    exactKeys(value, [
      "primaryTurn",
      "secondaryTurn",
      "paidRunning",
      "paidQueued",
      "unpaid",
    ]) &&
      sameJson(value.primaryTurn, {
        paidFirst: false,
        runningFirst: false,
      }) &&
      sameJson(value.secondaryTurn, {
        paidFirst: false,
        runningFirst: false,
      }) &&
      value.paidRunning?.jobId === prepared.paidRunning.jobId &&
      value.paidRunning?.jobStatus === "FAILED" &&
      value.paidRunning?.attemptCount === 1 &&
      value.paidRunning?.attemptStatus === "LEASE_EXPIRED" &&
      value.paidRunning?.reservationStatus === "RELEASED" &&
      value.paidRunning?.settlementCount === 1 &&
      value.paidQueued?.jobId === paidQueuedFixture.jobId &&
      value.paidQueued?.jobStatus === "QUEUED" &&
      value.paidQueued?.attemptCount === 0 &&
      value.paidQueued?.settlementCount === 0 &&
      value.paidQueued?.settlementAttemptNumber === null &&
      value.unpaid?.jobId === prepared.unpaid.jobId &&
      value.unpaid?.jobStatus === "QUEUED" &&
      value.unpaid?.attemptCount === 0 &&
      value.unpaid?.admissionCount === 0 &&
      value.unpaid?.settlementCount === 0,
    code,
  );
  return value;
}

async function runQueuedExpiryRecoveryScenario(
  Client,
  databaseUrl,
  target,
  sleep,
  clock,
) {
  const scenario = "queued-expiry-recovery";
  const connections = await openScenario(
    Client,
    databaseUrl,
    target,
    scenario,
    ["a", "b", "observer"],
  );
  let primaryError = null;
  let blockerTransaction = false;
  try {
    const catalog = assertFixtureCatalog(
      await fixtureCatalog(connections.observer.client),
    );
    const fixture = catalog.cases[scenario];
    const firstSecondaryEmpty = assertRecoveryEnvelope(
      await recover(
        connections.observer.client,
        catalog,
        catalog.secondaryRegistrationDigest,
      ),
    );
    assert(
      firstSecondaryEmpty.recovered === 0 &&
        firstSecondaryEmpty.requeued === 0 &&
        firstSecondaryEmpty.failed === 0,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED",
    );
    const prepared = assertPreparedRecoveryFixtures(
      await support(
        connections.observer.client,
        "prepare_recovery_fixtures",
        ["int4", "int4"],
        [5_800, 6_500],
      ),
    );
    assertClaim(
      await claim(connections.a.client, catalog),
      prepared.paidRunning,
      1,
    );
    assertAdmission(
      await admitCase(connections.a.client, scenario, 6_500),
      fixture,
    );
    const queuedState = assertFixtureStateShape(
      await fixtureState(connections.observer.client, scenario),
      scenario,
      fixture,
    );
    await waitUntilRemaining(
      queuedState.reservationExpiresAt,
      catalog.minimumPayloadRemainingAtClaimMs - 200,
      sleep,
      clock,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED",
    );
    const firstPaid = assertRecoveryEnvelope(
      await recover(connections.b.client, catalog),
    );
    assert(
      firstPaid.recovered === 1 &&
        firstPaid.requeued === 0 &&
        firstPaid.failed === 1,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED",
    );
    assertFirstPaidRecoveryState(
      await support(
        connections.observer.client,
        "recovery_fairness_state",
      ),
      prepared,
      fixture,
    );
    await query(connections.a.client, "begin");
    blockerTransaction = true;
    const held = await support(
      connections.a.client,
      "hold_paid_recovery_lock",
    );
    assert(
      held === true,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED",
    );
    const recoveryA = capture(recover(connections.b.client, catalog));
    const recoveryB = capture(recover(connections.observer.client, catalog));
    const barrierA = await waitForBlocker(
      connections.a.client,
      connections.b.pid,
      connections.a.pid,
      sleep,
      { strictAdvisory: true },
    );
    const barrierB = await waitForBlocker(
      connections.a.client,
      connections.observer.pid,
      connections.a.pid,
      sleep,
      { strictAdvisory: true },
    );
    await query(connections.a.client, "commit");
    blockerTransaction = false;
    const [firstOutcome, secondOutcome] = await Promise.all([
      recoveryA,
      recoveryB,
    ]);
    assert(
      firstOutcome.ok === true && secondOutcome.ok === true,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED",
    );
    const first = assertRecoveryEnvelope(firstOutcome.value);
    const second = assertRecoveryEnvelope(secondOutcome.value);
    assert(
      first.recovered + second.recovered === 2 &&
        first.requeued + second.requeued === 0 &&
        first.failed + second.failed === 2,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED",
    );
    const secondSecondaryEmpty = assertRecoveryEnvelope(
      await recover(
        connections.observer.client,
        catalog,
        catalog.secondaryRegistrationDigest,
      ),
    );
    assert(
      secondSecondaryEmpty.recovered === 0 &&
        secondSecondaryEmpty.requeued === 0 &&
        secondSecondaryEmpty.failed === 0,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_RECOVERY_RACE_FAILED",
    );
    const fairness = assertRecoveryFairnessState(
      await support(
        connections.observer.client,
        "recovery_fairness_state",
      ),
      prepared,
      fixture,
    );
    const state = assertReleasedState(
      await fixtureState(connections.observer.client, scenario),
      {
        scenario,
        fixture,
        jobStatus: "FAILED",
        jobFailureReason: "PAYLOAD_UNAVAILABLE",
        attemptStatus: "FAILED",
        attemptFailureReason: "PAYLOAD_UNAVAILABLE",
        settlementReason: "PAYLOAD_UNAVAILABLE",
        grantCount: 0,
        revokedGrantCount: 0,
      },
    );
    return Object.freeze({
      scenario,
      blockersObserved:
        barrierA.granted === false && barrierB.granted === false,
      crossRegistrationTurnIsolation: true,
      paidAndUnpaidRecoveredConcurrently:
        first.recovered + second.recovered,
      paidRunningRecoveredFirst: firstPaid.recovered,
      mainPaidQueuedRecovered: fairness.paidQueued.settlementCount,
      primaryTurn: fairness.primaryTurn,
      secondaryTurn: fairness.secondaryTurn,
      settlementCount: state.settlementCount,
      pointsReleased: state.settlementPoints,
    });
  } catch (error) {
    primaryError = error;
    if (blockerTransaction) await rollbackClient(connections.a.client);
    throw error;
  } finally {
    await closeClients(
      Object.values(connections).map((entry) => entry.client),
      primaryError,
    );
  }
}

async function runShortGrantDenialScenario(
  Client,
  databaseUrl,
  target,
  sleep,
  clock,
) {
  const scenario = "short-grant-denial";
  const connections = await openScenario(
    Client,
    databaseUrl,
    target,
    scenario,
    ["a", "b", "observer"],
  );
  let primaryError = null;
  let blockerTransaction = false;
  try {
    const catalog = assertFixtureCatalog(
      await fixtureCatalog(connections.observer.client),
    );
    const fixture = catalog.cases[scenario];
    assertAdmission(
      await admitCase(connections.a.client, scenario, 120_000),
      fixture,
    );
    const claimed = assertClaim(
      await claim(connections.b.client, catalog),
      fixture,
      1,
    );
    const running = assertFixtureStateShape(
      await fixtureState(connections.observer.client, scenario),
      scenario,
      fixture,
    );
    await query(connections.a.client, "begin");
    blockerTransaction = true;
    const held = await support(
      connections.a.client,
      "hold_job_lock",
      ["text"],
      [scenario],
    );
    assert(
      held === true,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SHORT_GRANT_FAILED",
    );
    const pending = capture(
      authorize(connections.b.client, fixture, claimed, catalog),
    );
    const barrier = await waitForBlocker(
      connections.observer.client,
      connections.b.pid,
      connections.a.pid,
      sleep,
    );
    const remaining = await waitUntilRemaining(
      running.attempts[0].leaseExpiresAt,
      catalog.providerDeadlineMs - 150,
      sleep,
      clock,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SHORT_GRANT_FAILED",
    );
    await query(connections.a.client, "commit");
    blockerTransaction = false;
    const outcome = await pending;
    assert(
      outcome.ok === true,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SHORT_GRANT_FAILED",
    );
    const denial = assertDeniedSettlement(outcome.value);
    const state = assertReleasedState(
      await fixtureState(connections.observer.client, scenario),
      {
        scenario,
        fixture,
        jobStatus: "FAILED",
        jobFailureReason: "PAYLOAD_UNAVAILABLE",
        attemptStatus: "FAILED",
        attemptFailureReason: "PAYLOAD_UNAVAILABLE",
        settlementReason: "PAYLOAD_UNAVAILABLE",
        grantCount: 1,
        revokedGrantCount: 1,
      },
    );
    return Object.freeze({
      scenario,
      blockerObserved: barrier.observed,
      remainingBeforeAuthorizationMs: remaining,
      denialStatus: denial.status,
      settlementCount: state.settlementCount,
      pointsReleased: state.settlementPoints,
    });
  } catch (error) {
    primaryError = error;
    if (blockerTransaction) await rollbackClient(connections.a.client);
    throw error;
  } finally {
    await closeClients(
      Object.values(connections).map((entry) => entry.client),
      primaryError,
    );
  }
}

function assertIdleClaim(value, code) {
  assert(
    exactKeys(value, ["status", "claim"]) &&
      value.status === "IDLE" &&
      value.claim === null,
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  return value;
}

function assertQueueAgeBlockedState(state, scenario, fixture) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TIMING_BOUNDARIES_FAILED";
  assertFixtureStateShape(state, scenario, fixture);
  assert(
    state.jobStatus === "QUEUED" &&
      state.attemptCount === 0 &&
      state.jobFailureReason === null &&
      state.attempts.length === 0 &&
      state.reservationStatus === "RESERVED" &&
      state.settlementCount === 0 &&
      state.settlementJobStatus === null &&
      state.settlementReservationStatus === null &&
      state.settlementAttemptId === null &&
      state.settlementAttemptNumber === null &&
      state.settlementReason === null &&
      state.settlementPoints === null &&
      state.settlementAllocationPoints === null &&
      state.settlementRestoredPoints === null &&
      state.settlementResultRef === null &&
      state.terminalLedgerCount === 0 &&
      state.terminalLedgerEvent === null &&
      state.lotRemaining === 10 &&
      state.grantCount === 0 &&
      state.payloadState === "AVAILABLE" &&
      state.payloadRevokeReason === null &&
      state.outboxCount === 0 &&
      state.documentCount === 0 &&
      state.revisionCount === 0 &&
      state.syncChangeCount === 0 &&
      state.mutationReceiptCount === 0 &&
      state.providerEvidenceCount === 0,
    code,
  );
  return state;
}

function assertSuccessBoundaryZeroWriteState(state, fixture) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TIMING_BOUNDARIES_FAILED";
  assertFixtureStateShape(state, "success-clock", fixture);
  assert(
    state.jobStatus === "RUNNING" &&
      state.attemptCount === 1 &&
      state.jobFailureReason === null &&
      state.resultDocumentId === null &&
      state.resultRevisionId === null &&
      state.resultContentHash === null &&
      state.documentCurrentRevisionId === null &&
      state.documentCurrentRevisionNumber === null &&
      state.documentLifecycleStatus === null &&
      state.attempts.length === 1 &&
      state.attempts[0].attemptNumber === 1 &&
      state.attempts[0].status === "RUNNING" &&
      state.attempts[0].failureReason === null &&
      state.attempts[0].terminalTransactionId === null &&
      state.attempts[0].finishedAt === null &&
      state.reservationStatus === "RESERVED" &&
      state.settlementCount === 0 &&
      state.settlementJobStatus === null &&
      state.settlementReservationStatus === null &&
      state.settlementAttemptId === null &&
      state.settlementAttemptNumber === null &&
      state.settlementReason === null &&
      state.settlementPoints === null &&
      state.settlementAllocationPoints === null &&
      state.settlementRestoredPoints === null &&
      state.settlementResultRef === null &&
      state.terminalLedgerCount === 0 &&
      state.terminalLedgerEvent === null &&
      state.lotRemaining === 10 &&
      state.grantCount === 1 &&
      state.issuedGrantCount === 0 &&
      state.consumedGrantCount === 1 &&
      state.revokedGrantCount === 0 &&
      state.payloadState === "AVAILABLE" &&
      state.payloadRevokeReason === null &&
      state.outboxCount === 0 &&
      state.documentCount === 0 &&
      state.revisionCount === 0 &&
      state.syncChangeCount === 0 &&
      state.mutationReceiptCount === 0 &&
      state.providerEvidenceCount === 0,
    code,
  );
  return state;
}

async function runTimingBoundariesScenario(
  Client,
  databaseUrl,
  target,
  sleep,
  clock,
) {
  const scenario = "timing-boundaries";
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TIMING_BOUNDARIES_FAILED";
  const connections = await openScenario(
    Client,
    databaseUrl,
    target,
    scenario,
    ["a", "b", "observer"],
  );
  let primaryError = null;
  let payloadBlockerTransaction = false;
  let jobBlockerTransaction = false;
  let terminalTransaction = false;
  let deniedPointsBlockerTransaction = false;
  let deniedTransaction = false;
  let successPayloadBlockerTransaction = false;
  let successTransaction = false;
  try {
    const catalog = assertFixtureCatalog(
      await fixtureCatalog(connections.observer.client),
    );
    const fixture = catalog.cases[scenario];
    assertAdmission(
      await admitCase(connections.a.client, scenario, 120_000),
      fixture,
    );
    const queueExpiresAt = await support(
      connections.observer.client,
      "age_queue_deadline",
      ["text", "int4"],
      [scenario, 750],
    );
    assert(validIsoMilliseconds(queueExpiresAt), code);

    await query(connections.a.client, "begin");
    payloadBlockerTransaction = true;
    assert(
      (await support(
        connections.a.client,
        "hold_payload_lock",
        ["text"],
        [scenario],
      )) === true,
      code,
    );
    const pendingClaim = capture(claim(connections.b.client, catalog));
    const claimBarrier = await waitForBlocker(
      connections.observer.client,
      connections.b.pid,
      connections.a.pid,
      sleep,
    );
    await waitUntilExpired(queueExpiresAt, sleep, clock, code);
    await query(connections.a.client, "commit");
    payloadBlockerTransaction = false;
    const claimOutcome = await pendingClaim;
    assert(claimOutcome.ok === true, code);
    assertIdleClaim(claimOutcome.value, code);
    assertQueueAgeBlockedState(
      await fixtureState(connections.observer.client, scenario),
      scenario,
      fixture,
    );
    const recovered = assertRecoveryEnvelope(
      await recover(connections.observer.client, catalog),
    );
    assert(
      recovered.recovered === 1 &&
        recovered.requeued === 0 &&
        recovered.failed === 1,
      code,
    );
    const queueReleased = assertReleasedState(
      await fixtureState(connections.observer.client, scenario),
      {
        scenario,
        fixture,
        jobStatus: "FAILED",
        jobFailureReason: "PAYLOAD_UNAVAILABLE",
        attemptStatus: "FAILED",
        attemptFailureReason: "PAYLOAD_UNAVAILABLE",
        settlementReason: "PAYLOAD_UNAVAILABLE",
        grantCount: 0,
        revokedGrantCount: 0,
      },
    );

    assertAdmission(
      await admitCase(connections.a.client, "terminal-clock", 120_000),
      TERMINAL_CLOCK_FIXTURE,
    );
    await query(connections.b.client, "begin");
    terminalTransaction = true;
    const transactionClock = await query(
      connections.b.client,
      [
        "select pg_catalog.to_char(",
        "  pg_catalog.date_trunc(",
        "    'milliseconds',",
        "    pg_catalog.transaction_timestamp()",
        "  ) at time zone 'UTC',",
        "  'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'",
        ") as observed_at",
      ].join("\n"),
    );
    const transactionStartedAt = transactionClock.rows[0]?.observed_at;
    assert(validIsoMilliseconds(transactionStartedAt), code);
    const claimed = assertClaim(
      await claim(connections.a.client, catalog),
      TERMINAL_CLOCK_FIXTURE,
      1,
    );
    assertAuthorized(
      await authorize(
        connections.a.client,
        TERMINAL_CLOCK_FIXTURE,
        claimed,
        catalog,
      ),
      claimed,
      catalog,
    );

    await query(connections.observer.client, "begin");
    jobBlockerTransaction = true;
    assert(
      (await support(
        connections.observer.client,
        "hold_job_lock",
        ["text"],
        ["terminal-clock"],
      )) === true,
      code,
    );
    const pendingSettlement = capture(
      settleFailure(
        connections.b.client,
        TERMINAL_CLOCK_FIXTURE,
        claimed,
        catalog,
        "PROVIDER_PERMANENT",
      ),
    );
    const terminalBarrier = await waitForBlocker(
      connections.a.client,
      connections.b.pid,
      connections.observer.pid,
      sleep,
    );
    await sleep(50);
    const releaseClock = await query(
      connections.observer.client,
      [
        "select pg_catalog.to_char(",
        "  pg_catalog.date_trunc(",
        "    'milliseconds',",
        "    pg_catalog.clock_timestamp()",
        "  ) at time zone 'UTC',",
        "  'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'",
        ") as observed_at",
      ].join("\n"),
    );
    const releasedAt = releaseClock.rows[0]?.observed_at;
    assert(validIsoMilliseconds(releasedAt), code);
    await query(connections.observer.client, "commit");
    jobBlockerTransaction = false;
    const settlementOutcome = await pendingSettlement;
    assert(settlementOutcome.ok === true, code);
    assertFailureAcknowledgement(
      settlementOutcome.value,
      "PROVIDER_PERMANENT",
      "FAILED",
    );
    await query(connections.b.client, "commit");
    terminalTransaction = false;

    const terminalState = assertReleasedState(
      await fixtureState(connections.a.client, "terminal-clock"),
      {
        scenario: "terminal-clock",
        fixture: TERMINAL_CLOCK_FIXTURE,
        jobStatus: "FAILED",
        jobFailureReason: "PROVIDER_PERMANENT",
        attemptStatus: "FAILED",
        attemptFailureReason: "PROVIDER_PERMANENT",
        settlementReason: "PROVIDER_PERMANENT",
        grantCount: 1,
        revokedGrantCount: 1,
      },
    );
    const terminalAttempt = terminalState.attempts[0];
    assert(
      validIsoMilliseconds(terminalAttempt.acquiredAt) &&
        validIsoMilliseconds(terminalAttempt.finishedAt) &&
        Date.parse(terminalAttempt.finishedAt) >=
          Date.parse(terminalAttempt.acquiredAt) &&
        Date.parse(terminalAttempt.finishedAt) >= Date.parse(releasedAt) &&
        Date.parse(terminalAttempt.finishedAt) >
          Date.parse(transactionStartedAt),
      code,
    );

    assertAdmission(
      await admitCase(connections.a.client, "denied-clock", 120_000),
      TERMINAL_DENIED_CLOCK_FIXTURE,
    );
    await query(connections.b.client, "begin");
    deniedTransaction = true;
    const deniedTransactionClock = await query(
      connections.b.client,
      [
        "select pg_catalog.to_char(",
        "  pg_catalog.date_trunc(",
        "    'milliseconds',",
        "    pg_catalog.transaction_timestamp()",
        "  ) at time zone 'UTC',",
        "  'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'",
        ") as observed_at",
      ].join("\n"),
    );
    const deniedTransactionStartedAt =
      deniedTransactionClock.rows[0]?.observed_at;
    assert(validIsoMilliseconds(deniedTransactionStartedAt), code);
    await sleep(50);

    const deniedClaim = assertClaim(
      await claim(connections.a.client, catalog),
      TERMINAL_DENIED_CLOCK_FIXTURE,
      1,
    );
    const deniedGrant = assertAuthorized(
      await authorize(
        connections.a.client,
        TERMINAL_DENIED_CLOCK_FIXTURE,
        deniedClaim,
        catalog,
      ),
      deniedClaim,
      catalog,
    );
    const deniedRunningState = assertFixtureStateShape(
      await fixtureState(connections.a.client, "denied-clock"),
      "denied-clock",
      TERMINAL_DENIED_CLOCK_FIXTURE,
    );
    const deniedAcquiredAt = deniedRunningState.attempts[0]?.acquiredAt;
    assert(
      deniedRunningState.jobStatus === "RUNNING" &&
        deniedRunningState.attempts.length === 1 &&
        validIsoMilliseconds(deniedAcquiredAt) &&
        Date.parse(deniedAcquiredAt) >
          Date.parse(deniedTransactionStartedAt),
      code,
    );

    await query(connections.observer.client, "begin");
    deniedPointsBlockerTransaction = true;
    assert(
      (await support(
        connections.observer.client,
        "hold_point_reservation_lock",
        ["text"],
        ["denied-clock"],
      )) === true,
      code,
    );
    const pendingDenied = capture(
      consume(
        connections.b.client,
        TERMINAL_DENIED_CLOCK_FIXTURE,
        deniedClaim,
        deniedGrant,
        catalog,
      ),
    );
    const deniedBarrier = await waitForBlocker(
      connections.a.client,
      connections.b.pid,
      connections.observer.pid,
      sleep,
    );
    await sleep(50);
    const deniedReleaseClock = await query(
      connections.observer.client,
      [
        "select pg_catalog.to_char(",
        "  pg_catalog.date_trunc(",
        "    'milliseconds',",
        "    pg_catalog.clock_timestamp()",
        "  ) at time zone 'UTC',",
        "  'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'",
        ") as observed_at",
      ].join("\n"),
    );
    const deniedReleasedAt = deniedReleaseClock.rows[0]?.observed_at;
    assert(
      validIsoMilliseconds(deniedReleasedAt) &&
        Date.parse(deniedReleasedAt) > Date.parse(deniedAcquiredAt) &&
        Date.parse(deniedReleasedAt) >
          Date.parse(deniedTransactionStartedAt),
      code,
    );
    await query(connections.observer.client, "commit");
    deniedPointsBlockerTransaction = false;
    const deniedOutcome = await pendingDenied;
    assert(deniedOutcome.ok === true, code);
    const denied = assertDeniedSettlement(deniedOutcome.value, code);
    await query(connections.b.client, "commit");
    deniedTransaction = false;

    const deniedState = assertReleasedState(
      await fixtureState(connections.a.client, "denied-clock"),
      {
        scenario: "denied-clock",
        fixture: TERMINAL_DENIED_CLOCK_FIXTURE,
        jobStatus: "FAILED",
        jobFailureReason: "PAYLOAD_UNAVAILABLE",
        attemptStatus: "FAILED",
        attemptFailureReason: "PAYLOAD_UNAVAILABLE",
        settlementReason: "PAYLOAD_UNAVAILABLE",
        grantCount: 1,
        revokedGrantCount: 1,
      },
    );
    const deniedAttempt = deniedState.attempts[0];
    const deniedTerminalTimes = [
      denied.committedAt,
      deniedAttempt.finishedAt,
      deniedState.jobFinishedAt,
      deniedState.reservationTerminalAt,
      deniedState.settlementSettledAt,
      deniedState.terminalLedgerCreatedAt,
      deniedState.payloadRevokedAt,
      deniedState.outboxRequestedAt,
    ];
    assert(
      deniedAttempt.terminalTransactionId === denied.transactionId &&
        deniedTerminalTimes.every(validIsoMilliseconds) &&
        deniedTerminalTimes.every(
          (terminalAt) => terminalAt === deniedAttempt.finishedAt,
        ) &&
        Date.parse(deniedAttempt.finishedAt) >=
          Date.parse(deniedReleasedAt) &&
        Date.parse(deniedAttempt.finishedAt) >
          Date.parse(deniedTransactionStartedAt),
      code,
    );
    const deniedReplay = assertDeniedSettlement(
      await consume(
        connections.b.client,
        TERMINAL_DENIED_CLOCK_FIXTURE,
        deniedClaim,
        deniedGrant,
        catalog,
      ),
      code,
    );
    assert(sameJson(deniedReplay, denied), code);
    const deniedAfterReplay = assertReleasedState(
      await fixtureState(connections.a.client, "denied-clock"),
      {
        scenario: "denied-clock",
        fixture: TERMINAL_DENIED_CLOCK_FIXTURE,
        jobStatus: "FAILED",
        jobFailureReason: "PAYLOAD_UNAVAILABLE",
        attemptStatus: "FAILED",
        attemptFailureReason: "PAYLOAD_UNAVAILABLE",
        settlementReason: "PAYLOAD_UNAVAILABLE",
        grantCount: 1,
        revokedGrantCount: 1,
      },
    );
    assert(sameJson(deniedAfterReplay, deniedState), code);

    assertAdmission(
      await admitCase(connections.a.client, "success-clock", 120_000),
      TERMINAL_SUCCESS_CLOCK_FIXTURE,
    );
    await query(connections.b.client, "begin");
    successTransaction = true;
    const successTransactionClock = await query(
      connections.b.client,
      [
        "select pg_catalog.to_char(",
        "  pg_catalog.date_trunc(",
        "    'milliseconds',",
        "    pg_catalog.transaction_timestamp()",
        "  ) at time zone 'UTC',",
        "  'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'",
        ") as observed_at",
      ].join("\n"),
    );
    const successTransactionStartedAt =
      successTransactionClock.rows[0]?.observed_at;
    assert(validIsoMilliseconds(successTransactionStartedAt), code);
    const successClaim = assertClaim(
      await claim(connections.a.client, catalog),
      TERMINAL_SUCCESS_CLOCK_FIXTURE,
      1,
    );
    const successGrant = assertAuthorized(
      await authorize(
        connections.a.client,
        TERMINAL_SUCCESS_CLOCK_FIXTURE,
        successClaim,
        catalog,
      ),
      successClaim,
      catalog,
    );
    const successConsumed = await support(
      connections.a.client,
      "consume_grant_test_only",
      ["uuid", "uuid"],
      [TERMINAL_SUCCESS_CLOCK_FIXTURE.jobId, successGrant.grantId],
    );
    assert(
      exactKeys(successConsumed, ["status", "grantId", "consumedAt"]) &&
        successConsumed.status === "CONSUMED" &&
        successConsumed.grantId === successGrant.grantId &&
        validIsoMilliseconds(successConsumed.consumedAt),
      code,
    );
    const successFence = assertFence(
      await fence(
        connections.a.client,
        TERMINAL_SUCCESS_CLOCK_FIXTURE,
        successClaim,
        catalog,
      ),
      catalog,
    );
    const successBefore = assertSuccessBoundaryZeroWriteState(
      await fixtureState(connections.a.client, "success-clock"),
      TERMINAL_SUCCESS_CLOCK_FIXTURE,
    );
    const successAttemptBefore = successBefore.attempts[0];
    assert(
      validIsoMilliseconds(successAttemptBefore.leaseExpiresAt) &&
        validIsoMilliseconds(successAttemptBefore.fenceExpiresAt),
      code,
    );
    const successTerminalBoundaryExpiresAt =
      Date.parse(successAttemptBefore.leaseExpiresAt) >=
      Date.parse(successAttemptBefore.fenceExpiresAt)
        ? successAttemptBefore.leaseExpiresAt
        : successAttemptBefore.fenceExpiresAt;

    await query(connections.observer.client, "begin");
    successPayloadBlockerTransaction = true;
    assert(
      (await support(
        connections.observer.client,
        "hold_payload_lock",
        ["text"],
        ["success-clock"],
      )) === true,
      code,
    );
    const pendingSuccess = capture(
      support(
        connections.b.client,
        "commit_success_test_only",
        ["uuid", "uuid", "text", "uuid", "text"],
        [
          TERMINAL_SUCCESS_CLOCK_FIXTURE.jobId,
          successClaim.attempt.attemptId,
          successClaim.leaseToken,
          successFence.fenceId,
          successFence.fenceDigest,
        ],
      ),
    );
    const successBarrier = await waitForBlocker(
      connections.a.client,
      connections.b.pid,
      connections.observer.pid,
      sleep,
    );
    await waitUntilExpired(
      successTerminalBoundaryExpiresAt,
      sleep,
      clock,
      code,
    );
    const successReleaseClock = await query(
      connections.observer.client,
      [
        "select pg_catalog.to_char(",
        "  pg_catalog.date_trunc(",
        "    'milliseconds',",
        "    pg_catalog.clock_timestamp()",
        "  ) at time zone 'UTC',",
        "  'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'",
        ") as observed_at",
      ].join("\n"),
    );
    const successReleasedAt = successReleaseClock.rows[0]?.observed_at;
    assert(
      validIsoMilliseconds(successReleasedAt) &&
        Date.parse(successReleasedAt) >
          Date.parse(successTransactionStartedAt) &&
        Date.parse(successReleasedAt) >=
          Date.parse(successAttemptBefore.leaseExpiresAt) &&
        Date.parse(successReleasedAt) >=
          Date.parse(successAttemptBefore.fenceExpiresAt),
      code,
    );
    await query(connections.observer.client, "commit");
    successPayloadBlockerTransaction = false;
    const successOutcome = await pendingSuccess;
    assertDatabaseError(successOutcome, "LEASE_EXPIRED", code);
    await query(connections.b.client, "rollback");
    successTransaction = false;
    const successZeroWrite = assertSuccessBoundaryZeroWriteState(
      await fixtureState(connections.a.client, "success-clock"),
      TERMINAL_SUCCESS_CLOCK_FIXTURE,
    );
    assert(sameJson(successZeroWrite, successBefore), code);

    return Object.freeze({
      scenario,
      queueAgeBlockerObserved: claimBarrier.observed,
      queueAgeCrossingReturnedIdle: true,
      queueAgeRecoveryCount: recovered.recovered,
      queueAgePointsReleased: queueReleased.settlementPoints,
      terminalBlockerObserved: terminalBarrier.observed,
      terminalClockAfterTransactionStart: true,
      terminalClockAfterBlockerRelease: true,
      terminalGrantRevoked: terminalState.revokedGrantCount === 1,
      terminalPointsReleased: terminalState.settlementPoints,
      deniedAuthorityBlockerObserved: deniedBarrier.observed,
      deniedAuthorityCallerTransactionBeforeClaim: true,
      deniedAuthorityClockAfterBlockerRelease: true,
      deniedAuthorityReplayStable: true,
      deniedAuthoritySettlementCount: deniedState.settlementCount,
      deniedAuthorityPointsReleased: deniedState.settlementPoints,
      deniedAuthorityTerminalWritesUnique:
        deniedState.terminalLedgerCount === 1 &&
        deniedState.outboxCount === 1,
      successBlockerObserved: successBarrier.observed,
      successLeaseExpiredAtDatabaseRelease: true,
      successExpiredFenceRejected: true,
      successStateSnapshotUnchanged: true,
      successTerminalWritesAbsent:
        successZeroWrite.settlementCount === 0 &&
        successZeroWrite.documentCount === 0 &&
        successZeroWrite.providerEvidenceCount === 0 &&
        successZeroWrite.outboxCount === 0,
    });
  } catch (error) {
    primaryError = error;
    if (payloadBlockerTransaction) {
      await rollbackClient(connections.a.client);
    }
    if (jobBlockerTransaction) {
      await rollbackClient(connections.observer.client);
    }
    if (terminalTransaction) {
      await rollbackClient(connections.b.client);
    }
    if (deniedPointsBlockerTransaction) {
      await rollbackClient(connections.observer.client);
    }
    if (deniedTransaction) {
      await rollbackClient(connections.b.client);
    }
    if (successPayloadBlockerTransaction) {
      await rollbackClient(connections.observer.client);
    }
    if (successTransaction) {
      await rollbackClient(connections.b.client);
    }
    throw error;
  } finally {
    await closeClients(
      Object.values(connections).map((entry) => entry.client),
      primaryError,
    );
  }
}

function assertOwnerCancelEnvelope(value, fixture) {
  const code =
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED";
  assert(
    exactKeys(value, ["job"]) &&
      isPlainObject(value.job) &&
      value.job.jobId === fixture.jobId &&
      value.job.status === "CANCELLED" &&
      value.job.attemptCount === 1 &&
      validIsoMilliseconds(value.job.startedAt) &&
      validIsoMilliseconds(value.job.finishedAt) &&
      value.job.failureCode === null &&
      value.job.result === null,
    code,
  );
  assertNoPrivatePointsIdentifiers(value, code);
  return value;
}

async function runAuthorityBoundsCancelScenario(
  Client,
  databaseUrl,
  target,
  sleep,
  clock,
) {
  const scenario = "authority-bounds-cancel";
  const connections = await openScenario(
    Client,
    databaseUrl,
    target,
    scenario,
    ["a", "b", "observer"],
  );
  let primaryError = null;
  let blockerTransaction = false;
  try {
    const catalog = assertFixtureCatalog(
      await fixtureCatalog(connections.observer.client),
    );
    const fixture = catalog.cases[scenario];
    assertAdmission(
      await admitCase(connections.a.client, scenario, 120_000),
      fixture,
    );
    const claimed = assertClaim(
      await claim(connections.b.client, catalog),
      fixture,
      1,
    );
    const incompleteFence = await support(
      connections.observer.client,
      "assert_incomplete_fence_denied",
      ["uuid", "uuid"],
      [fixture.jobId, claimed.attempt.attemptId],
    );
    assert(
      exactKeys(incompleteFence, ["denied", "unchanged"]) &&
        incompleteFence.denied === true &&
        incompleteFence.unchanged === true,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED",
    );
    const authorized = assertAuthorized(
      await authorize(connections.b.client, fixture, claimed, catalog),
      claimed,
      catalog,
    );
    const fenced = assertFence(
      await fence(connections.b.client, fixture, claimed, catalog),
      catalog,
    );
    const bounded = assertFixtureStateShape(
      await fixtureState(connections.observer.client, scenario),
      scenario,
      fixture,
    );
    assert(
      bounded.jobStatus === "RUNNING" &&
        bounded.attemptCount === 1 &&
        bounded.attempts.length === 1 &&
        bounded.attempts[0].status === "RUNNING" &&
        bounded.grantCount === 1 &&
        bounded.issuedGrantCount === 1 &&
        validIsoMilliseconds(bounded.attempts[0].fenceExpiresAt) &&
        Date.parse(authorized.expiresAt) <=
          Date.parse(bounded.reservationExpiresAt) &&
        Date.parse(fenced.expiresAt) <=
          Date.parse(bounded.reservationExpiresAt),
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED",
    );
    await query(connections.a.client, "begin");
    blockerTransaction = true;
    const held = await support(
      connections.a.client,
      "hold_job_lock",
      ["text"],
      [scenario],
    );
    assert(
      held === true,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED",
    );
    const pendingHeartbeat = capture(
      heartbeat(connections.b.client, fixture, claimed, catalog),
    );
    const barrier = await waitForBlocker(
      connections.observer.client,
      connections.b.pid,
      connections.a.pid,
      sleep,
    );
    const pendingFenceReplay = capture(
      fence(connections.observer.client, fixture, claimed, catalog),
    );
    await waitUntilExpired(
      bounded.attempts[0].leaseExpiresAt,
      sleep,
      clock,
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED",
    );
    await query(connections.a.client, "commit");
    blockerTransaction = false;
    const [heartbeatOutcome, fenceReplayOutcome] = await Promise.all([
      pendingHeartbeat,
      pendingFenceReplay,
    ]);
    assertDatabaseError(
      heartbeatOutcome,
      "LEASE_EXPIRED",
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED",
    );
    assertDatabaseError(
      fenceReplayOutcome,
      "LEASE_EXPIRED",
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED",
    );
    const cancelled = assertOwnerCancelEnvelope(
      await cancelJob(connections.observer.client, fixture, catalog),
      fixture,
    );
    const replay = await cancelJob(
      connections.observer.client,
      fixture,
      catalog,
    );
    assert(
      sameJson(replay, cancelled),
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_AUTHORITY_CANCEL_FAILED",
    );
    const state = assertReleasedState(
      await fixtureState(connections.observer.client, scenario),
      {
        scenario,
        fixture,
        jobStatus: "CANCELLED",
        jobFailureReason: "CANCELLED",
        attemptStatus: "CANCELLED",
        attemptFailureReason: "CANCELLED",
        settlementReason: "CANCELLED",
        grantCount: 1,
        revokedGrantCount: 1,
      },
    );
    return Object.freeze({
      scenario,
      blockerObserved: barrier.observed,
      incompleteFenceDenied: incompleteFence.denied,
      staleHeartbeatRejected: true,
      staleFenceReplayRejected: true,
      authorityBoundsValid: state.authorityBoundsValid,
      cancelReplay: true,
      pointsReleased: state.settlementPoints,
    });
  } catch (error) {
    primaryError = error;
    if (blockerTransaction) await rollbackClient(connections.a.client);
    throw error;
  } finally {
    await closeClients(
      Object.values(connections).map((entry) => entry.client),
      primaryError,
    );
  }
}

export async function runCommunicationNotePointsTerminalSettlementConcurrencyHarness({
  Client,
  env = process.env,
  sleep = delay,
  clock = () => Date.now(),
} = {}) {
  const { databaseUrl, target } =
    readCommunicationNotePointsTerminalSettlementEnvironment(env);
  let Driver = Client;
  if (Driver === undefined) {
    const pgModule = await import("pg");
    Driver = pgModule.Client ?? pgModule.default?.Client;
  }
  assert(
    typeof Driver === "function",
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
    "connection",
  );
  assert(
    typeof sleep === "function" && typeof clock === "function",
    "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_INTERNAL_FAILED",
  );

  const terminalFailure = await runTerminalFailureScenario(
    Driver,
    databaseUrl,
    target,
  );
  const retrySuccessReplay = await runRetrySuccessReplayScenario(
    Driver,
    databaseUrl,
    target,
    sleep,
  );
  const queuedExpiryRecovery = await runQueuedExpiryRecoveryScenario(
    Driver,
    databaseUrl,
    target,
    sleep,
    clock,
  );
  const shortGrantDenial = await runShortGrantDenialScenario(
    Driver,
    databaseUrl,
    target,
    sleep,
    clock,
  );
  const authorityBoundsCancel = await runAuthorityBoundsCancelScenario(
    Driver,
    databaseUrl,
    target,
    sleep,
    clock,
  );
  const timingBoundaries = await runTimingBoundariesScenario(
    Driver,
    databaseUrl,
    target,
    sleep,
    clock,
  );

  return Object.freeze({
    ok: true,
    gate: "communication-note-points-terminal-settlement-concurrency",
    marker: COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
    postgresMajor: target.postgresMajor,
    target: "passwordless-private-unix-socket",
    scenariosPassed:
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS.length,
    scenarios: COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS,
    evidence: Object.freeze({
      terminalFailure,
      retrySuccessReplay,
      queuedExpiryRecovery,
      shortGrantDenial,
      authorityBoundsCancel,
      timingBoundaries,
    }),
  });
}

async function liveMain() {
  const result =
    await runCommunicationNotePointsTerminalSettlementConcurrencyHarness();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function lifecycleMain(argv) {
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const result =
      await runCommunicationNotePointsTerminalSettlementLocalPg16({
        argv,
        signal: abortController.signal,
      });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const liveMode =
    process.argv.length === 3 && process.argv[2] === "--live";
  const operation = liveMode
    ? liveMain()
    : lifecycleMain(process.argv.slice(2));
  operation.catch((error) => {
    if (liveMode) {
      const code = isFixedCode(error?.code)
        ? error.code
        : "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_INTERNAL_FAILED";
      process.stderr.write(`${code}\n`);
    } else {
      const evidence =
        error instanceof
          CommunicationNotePointsTerminalSettlementConcurrencyError &&
        error.evidence
          ? error.evidence
          : mergeCommunicationNotePointsTerminalSettlementLifecycleFailure(
              normalizeFailure(
                error,
                "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_INTERNAL_FAILED",
                "internal",
              ),
              [],
            );
      process.stderr.write(`${JSON.stringify(evidence)}\n`);
    }
    process.exitCode = 1;
  });
}
