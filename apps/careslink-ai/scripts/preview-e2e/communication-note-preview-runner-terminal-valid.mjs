import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY as IDENTITY_POLICY,
  assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression,
  assertCommunicationNotePreviewRunnerTerminalIdentitySqlPolicy,
  createCommunicationNotePreviewRuntimeRoleName,
  extractCommunicationNotePreviewBranchDatabaseTarget,
  parseCommunicationNotePreviewRunnerTerminalIdentityArguments,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";
import {
  assertVerifiedPreviewTlsConnection,
  createCommunicationNotePreviewDatabaseConnectionConfig,
} from "./communication-note-preview-runner-terminal-identity.mjs";

const ENABLE_ENV = "CARESLINK_V1_M1GI_HOSTED_LIVE_ENABLED";
const CONFIG_FD_ENV = "CARESLINK_V1_M1GI_HOSTED_LIVE_CONFIG_FD";
const STATUS_FD_ENV = "CARESLINK_V1_M1GI_HOSTED_LIVE_STATUS_FD";
const CONFIG_FD = 3;
const STATUS_FD = 4;
const CHILD_TIMEOUT_MS = 75_000;
const CHILD_KILL_GRACE_MS = 2_000;
const CHILD_STATUS_MAXIMUM_BYTES = 512;
const HOSTED_CHILD_SUCCESS = "RUNNER_TERMINAL_HOSTED_LIVE_PASSED";
const VALID_RUNTIME_APPLICATION_NAME =
  "careslink-preview-runner-terminal-valid-e2e";
const DIRECT_UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);
const ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;

const HOSTED_CHILD_FIXED_FAILURE_CODES = new Set([
  "RUNNER_TERMINAL_HOSTED_LIVE_BACKGROUND_CLIENT_ERROR",
  "RUNNER_TERMINAL_HOSTED_LIVE_ADMIN_CONNECTION_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_CALLER_IDENTITY_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_CATALOG_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_CLOSE_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_CONFIG_INVALID",
  "RUNNER_TERMINAL_HOSTED_LIVE_CONFIG_PIPE_INVALID",
  "RUNNER_TERMINAL_HOSTED_LIVE_CONFLICT_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_CONNECTION_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_DRAIN_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_DRIVER_INVALID",
  "RUNNER_TERMINAL_HOSTED_LIVE_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_FIRST_PERSIST_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_INPUT_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_MANAGEMENT_APPLICATION_RESTORE_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_MANAGEMENT_TARGET_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_NEW_LOGIN_DENIAL_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_POSTCHECK_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_POSTCHECK_SQL_POLICY_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_POSTGRES_MAJOR_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_QUERY_CONTRACT_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_QUERY_PORT_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_QUERY_RESULT_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_QUIESCE_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_QUIESCE_SQL_POLICY_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_REPLAY_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_REPLAY_PERSIST_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_RUNTIME_CONNECTION_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_RUNTIME_IDENTITY_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_RUNTIME_ROLE_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_SETUP_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_SETUP_SQL_POLICY_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_TEST_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_TLS_INVALID",
  "RUNNER_TERMINAL_IDENTITY_QUIESCE_MANAGEMENT_UNSAFE",
  "RUNNER_TERMINAL_IDENTITY_QUIESCE_POSTCHECK_FAILED",
  "RUNNER_TERMINAL_VALID_EXPECTED_APPEND_ONLY_REJECTION",
  "RUNNER_TERMINAL_VALID_POSTCHECK_APPEND_ONLY_FAILED",
  "RUNNER_TERMINAL_VALID_POSTCHECK_CLEANUP_FAILED",
  "RUNNER_TERMINAL_VALID_POSTCHECK_LEDGER_COUNTS_FAILED",
  "RUNNER_TERMINAL_VALID_POSTCHECK_MANAGEMENT_UNSAFE",
  "RUNNER_TERMINAL_VALID_POSTCHECK_PROBE_BASELINE_DRIFT",
  "RUNNER_TERMINAL_VALID_POSTCHECK_PROBE_CLEANUP_FAILED",
  "RUNNER_TERMINAL_VALID_POSTCHECK_RUNTIME_UNSAFE",
  "RUNNER_TERMINAL_VALID_POSTCHECK_TERMINAL_FAILED",
  "RUNNER_TERMINAL_VALID_POSTCHECK_TRIGGER_DRIFT",
  "RUNNER_TERMINAL_VALID_SETUP_AUTHORIZATION_FAILED",
  "RUNNER_TERMINAL_VALID_SETUP_DISPATCH_FAILED",
  "RUNNER_TERMINAL_VALID_SETUP_FIXTURE_UNSAFE",
  "RUNNER_TERMINAL_VALID_SETUP_LEDGER_NOT_EMPTY",
  "RUNNER_TERMINAL_VALID_SETUP_MANAGEMENT_MEMBERSHIP_DRIFT",
  "RUNNER_TERMINAL_VALID_SETUP_MANAGEMENT_UNSAFE",
  "RUNNER_TERMINAL_VALID_SETUP_POSTCHECK_FAILED",
  "RUNNER_TERMINAL_VALID_SETUP_RECEIPT_FAILED",
  "RUNNER_TERMINAL_VALID_SETUP_RPC_DRIFT",
  "RUNNER_TERMINAL_VALID_SETUP_RUNTIME_UNSAFE",
]);

const FIXED_ERRORS = new Set([
  "RUNNER_TERMINAL_VALID_ARGUMENT_INVALID",
  "RUNNER_TERMINAL_VALID_STDIN_INVALID",
  "RUNNER_TERMINAL_VALID_CA_INVALID",
  "RUNNER_TERMINAL_VALID_DRIVER_INVALID",
  "RUNNER_TERMINAL_VALID_CONNECTION_FAILED",
  "RUNNER_TERMINAL_VALID_SETUP_FAILED",
  "RUNNER_TERMINAL_VALID_CHILD_FAILED",
  "RUNNER_TERMINAL_VALID_CHILD_PIPE_FAILED",
  "RUNNER_TERMINAL_VALID_QUIESCE_FAILED",
  "RUNNER_TERMINAL_VALID_DRAIN_FAILED",
  "RUNNER_TERMINAL_VALID_CLEANUP_FAILED",
  "RUNNER_TERMINAL_VALID_POSTCHECK_FAILED",
  "RUNNER_TERMINAL_VALID_INTERNAL_FAILED",
  ...HOSTED_CHILD_FIXED_FAILURE_CODES,
]);

const FAILURE_CLEANUP_SQL = `
do $careslink_runner_terminal_valid_failure_cleanup$
declare
  v_runtime_name pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_identity.runtime_role', true
  );
  v_runtime pg_catalog.oid := pg_catalog.to_regrole(v_runtime_name);
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runner-terminal-identity-management'
    or v_runtime_name !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  then
    raise exception 'RUNNER_TERMINAL_VALID_FAILURE_CLEANUP_MANAGEMENT_UNSAFE';
  end if;
  if v_runtime is null then
    return;
  end if;
  if exists (
    select 1 from pg_catalog.pg_stat_activity as activity
    where activity.usename = v_runtime_name
      and activity.backend_type = 'client backend'
  ) then
    raise exception 'RUNNER_TERMINAL_VALID_FAILURE_CLEANUP_ACTIVE_SESSION';
  end if;
  if (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runtime
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = 1
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
        and membership.roleid = v_caller
        and not membership.admin_option
        and not membership.inherit_option
        and membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
    ) <> 1
  then
    raise exception 'RUNNER_TERMINAL_VALID_FAILURE_CLEANUP_SURFACE_UNSAFE';
  end if;
  execute pg_catalog.format(
    'revoke careslink_v1_preview_runner_terminal_caller from %I',
    v_runtime_name
  );
  execute pg_catalog.format('drop role %I', v_runtime_name);
  if pg_catalog.to_regrole(v_runtime_name) is not null
    or exists (
      select 1 from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
        or membership.roleid = v_runtime
        or membership.grantor = v_runtime
    )
    or exists (
      select 1 from pg_catalog.pg_stat_activity as activity
      where activity.usename = v_runtime_name
    )
  then
    raise exception 'RUNNER_TERMINAL_VALID_FAILURE_CLEANUP_RESIDUE';
  end if;
end
$careslink_runner_terminal_valid_failure_cleanup$;
`;

class CommunicationNotePreviewRunnerTerminalValidError extends Error {
  constructor(code) {
    const fixedCode = FIXED_ERRORS.has(code)
      ? code
      : "RUNNER_TERMINAL_VALID_INTERNAL_FAILED";
    super(fixedCode);
    this.name = "CommunicationNotePreviewRunnerTerminalValidError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePreviewRunnerTerminalValidError(code);
}

function safeOwnErrorCode(error) {
  if (!error || typeof error !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor && "value" in descriptor &&
      typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

async function closeQuietly(client) {
  try {
    await client?.end();
  } catch {
    // The disposable Preview branch is the final cleanup boundary.
  }
}

async function connectPreferredAdmin(Client, candidates, certificate) {
  let direct = new Client(
    createCommunicationNotePreviewDatabaseConnectionConfig(
      candidates.direct,
      certificate,
      candidates.direct.user,
      candidates.direct.password,
    ),
  );
  const directBackground = { failed: false };
  direct.on("error", () => {
    directBackground.failed = true;
  });
  try {
    await direct.connect();
    assertVerifiedPreviewTlsConnection(direct);
    return Object.freeze({
      client: direct,
      candidate: candidates.direct,
      connectionMode: "direct",
      backgroundState: directBackground,
    });
  } catch (error) {
    await closeQuietly(direct);
    direct = undefined;
    if (!DIRECT_UNREACHABLE_CODES.has(safeOwnErrorCode(error))) {
      fail("RUNNER_TERMINAL_VALID_CONNECTION_FAILED");
    }
  }
  const session = new Client(
    createCommunicationNotePreviewDatabaseConnectionConfig(
      candidates.sessionPooler,
      certificate,
      candidates.sessionPooler.user,
      candidates.sessionPooler.password,
    ),
  );
  const sessionBackground = { failed: false };
  session.on("error", () => {
    sessionBackground.failed = true;
  });
  try {
    await session.connect();
    assertVerifiedPreviewTlsConnection(session);
    return Object.freeze({
      client: session,
      candidate: candidates.sessionPooler,
      connectionMode: "session_pooler_fallback",
      backgroundState: sessionBackground,
    });
  } catch {
    await closeQuietly(session);
    fail("RUNNER_TERMINAL_VALID_CONNECTION_FAILED");
  }
}

async function runScriptTransaction(client, script, settings, failureCode) {
  let open = false;
  try {
    await client.query("begin isolation level read committed");
    open = true;
    await client.query("set local statement_timeout = '8s'");
    await client.query("set local lock_timeout = '2s'");
    await client.query(
      "set local idle_in_transaction_session_timeout = '10s'",
    );
    await client.query("set local password_encryption = 'scram-sha-256'");
    for (const [name, value] of settings) {
      await client.query({
        text: "select pg_catalog.set_config($1::text, $2::text, true)",
        values: [name, value],
      });
    }
    await client.query(script);
    await client.query("commit");
    open = false;
  } catch {
    if (open) {
      try {
        await client.query("rollback");
      } catch {
        // The fixed error is the only externally observable failure.
      }
    }
    fail(failureCode);
  }
}

export function createCommunicationNotePreviewRunnerTerminalHostedPipeConfig({
  candidate,
  expectedBranchRef,
  expectedPostgresMajor,
  runtimeRole,
  runtimePassword,
  sslRootCertPath,
  expectedSslRootCertSha256,
}) {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !["direct", "session_pooler"].includes(candidate.mode) ||
    candidate.port !== 5432 ||
    candidate.database !== "postgres" ||
    typeof candidate.host !== "string" ||
    typeof candidate.user !== "string" ||
    typeof candidate.password !== "string" ||
    candidate.password.length < 16 ||
    !/^[a-z0-9]{20}$/.test(expectedBranchRef) ||
    expectedBranchRef === IDENTITY_POLICY.productionProjectRef ||
    !ROLE_PATTERN.test(runtimeRole) ||
    typeof runtimePassword !== "string" ||
    runtimePassword.length < 16 ||
    runtimePassword === candidate.password ||
    ![16, 17].includes(expectedPostgresMajor) ||
    typeof sslRootCertPath !== "string" ||
    !sslRootCertPath.startsWith("/") ||
    !/^[a-f0-9]{64}$/.test(expectedSslRootCertSha256)
  ) {
    fail("RUNNER_TERMINAL_VALID_ARGUMENT_INVALID");
  }
  const runtimeDatabaseUser = candidate.mode === "session_pooler"
    ? `${runtimeRole}.${expectedBranchRef}`
    : runtimeRole;
  return Object.freeze({
    databaseHost: candidate.host,
    databasePort: candidate.port,
    databaseName: candidate.database,
    adminDatabaseUser: candidate.user,
    adminDatabasePassword: candidate.password,
    runtimeDatabaseUser,
    runtimeDatabasePassword: runtimePassword,
    expectedBranchRef,
    expectedPostgresMajor,
    runtimeRole,
    sslRootCertPath,
    expectedSslRootCertSha256,
  });
}

export function createCommunicationNotePreviewRunnerTerminalHostedChildEnvironment(
  baseEnvironment,
) {
  if (!baseEnvironment || typeof baseEnvironment !== "object") {
    fail("RUNNER_TERMINAL_VALID_ARGUMENT_INVALID");
  }
  const environment = Object.create(null);
  const allowedKeys = new Set([
    "PATH",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "CI",
    "NO_COLOR",
  ]);
  for (const [key, value] of Object.entries(baseEnvironment)) {
    if (typeof value === "string" && allowedKeys.has(key)) {
      environment[key] = value;
    }
  }
  environment[ENABLE_ENV] = "1";
  environment[CONFIG_FD_ENV] = String(CONFIG_FD);
  environment[STATUS_FD_ENV] = String(STATUS_FD);
  return Object.freeze(environment);
}

export function createCommunicationNotePreviewRunnerTerminalValidEvidence() {
  return Object.freeze({
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
    finalLedgerCounts: [1, 0, 1, 1, 1, 1],
    temporaryRuntimeLoginDropped: true,
    credentialTransport: "anonymous_fd_pipe_process_memory_only",
    acceptedNineKeyUsageVerified: true,
    receiptSixFactProjectionVerified: true,
  });
}

export function parseCommunicationNotePreviewRunnerTerminalHostedChildStatus(
  value,
) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > CHILD_STATUS_MAXIMUM_BYTES
  ) {
    return "RUNNER_TERMINAL_VALID_CHILD_FAILED";
  }
  if (!value.endsWith("\n")) {
    return "RUNNER_TERMINAL_VALID_CHILD_FAILED";
  }
  const code = value.slice(0, -1);
  if (code === HOSTED_CHILD_SUCCESS) return code;
  return HOSTED_CHILD_FIXED_FAILURE_CODES.has(code)
    ? code
    : "RUNNER_TERMINAL_VALID_CHILD_FAILED";
}

async function runHostedChild(pipeConfig, baseEnvironment = process.env) {
  const require = createRequire(import.meta.url);
  let vitestCli;
  try {
    const packageJson = require.resolve("vitest/package.json");
    vitestCli = join(dirname(packageJson), "vitest.mjs");
  } catch {
    fail("RUNNER_TERMINAL_VALID_DRIVER_INVALID");
  }
  const appDirectory = fileURLToPath(new URL("../../", import.meta.url));
  const liveTest = fileURLToPath(new URL(
    "../../src/lib/v1/communication-note-preview-runner-terminal-hosted.live.test.ts",
    import.meta.url,
  ));
  const child = spawn(
    process.execPath,
    [
      vitestCli,
      "run",
      liveTest,
      "--pool=threads",
      "--maxWorkers=1",
      "--reporter=dot",
    ],
    {
      cwd: appDirectory,
      env: createCommunicationNotePreviewRunnerTerminalHostedChildEnvironment(
        baseEnvironment,
      ),
      shell: false,
      stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
    },
  );
  const configPipe = child.stdio[CONFIG_FD];
  const statusPipe = child.stdio[STATUS_FD];
  if (
    !configPipe ||
    typeof configPipe.end !== "function" ||
    !statusPipe ||
    typeof statusPipe.on !== "function"
  ) {
    child.kill("SIGTERM");
    fail("RUNNER_TERMINAL_VALID_CHILD_PIPE_FAILED");
  }
  let pipeFailed = false;
  let statusBytes = 0;
  let statusOverflow = false;
  const statusChunks = [];
  configPipe.on("error", () => {
    pipeFailed = true;
  });
  statusPipe.on("error", () => {
    pipeFailed = true;
  });
  statusPipe.on("data", (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    statusBytes += buffer.length;
    if (statusBytes > CHILD_STATUS_MAXIMUM_BYTES) {
      statusOverflow = true;
      statusChunks.length = 0;
      return;
    }
    if (!statusOverflow) statusChunks.push(buffer);
  });
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  let timedOut = false;
  let killTimer;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => child.kill("SIGKILL"), CHILD_KILL_GRACE_MS);
  }, CHILD_TIMEOUT_MS);
  configPipe.end(JSON.stringify(pipeConfig));
  let result;
  try {
    result = await exit;
  } catch {
    clearTimeout(timeout);
    if (killTimer) clearTimeout(killTimer);
    child.kill("SIGKILL");
    fail("RUNNER_TERMINAL_VALID_CHILD_FAILED");
  }
  clearTimeout(timeout);
  if (killTimer) clearTimeout(killTimer);
  if (pipeFailed) fail("RUNNER_TERMINAL_VALID_CHILD_PIPE_FAILED");
  const childStatus = statusOverflow
    ? "RUNNER_TERMINAL_VALID_CHILD_FAILED"
    : parseCommunicationNotePreviewRunnerTerminalHostedChildStatus(
      Buffer.concat(statusChunks, statusBytes).toString("utf8"),
    );
  if (timedOut || result.signal !== null) {
    fail("RUNNER_TERMINAL_VALID_CHILD_FAILED");
  }
  if (result.code !== 0) {
    fail(
      childStatus === HOSTED_CHILD_SUCCESS
        ? "RUNNER_TERMINAL_VALID_CHILD_FAILED"
        : childStatus,
    );
  }
  if (childStatus !== HOSTED_CHILD_SUCCESS) {
    fail("RUNNER_TERMINAL_VALID_CHILD_FAILED");
  }
}

async function drainExactRuntimeBackends(admin, runtimeRole) {
  const result = await admin.query({
    text: `select pid, state, application_name
      from pg_catalog.pg_stat_activity
      where usename = $1::pg_catalog.text
        and backend_type = 'client backend'
        and pid <> pg_catalog.pg_backend_pid()`,
    values: [runtimeRole],
  });
  for (const backend of result.rows) {
    if (
      !Number.isInteger(backend.pid) ||
      backend.state !== "idle" ||
      !["Supavisor", VALID_RUNTIME_APPLICATION_NAME].includes(
        backend.application_name,
      )
    ) {
      fail("RUNNER_TERMINAL_VALID_DRAIN_FAILED");
    }
    const terminated = await admin.query({
      text: "select pg_catalog.pg_terminate_backend($1::pg_catalog.int4) as terminated",
      values: [backend.pid],
    });
    if (terminated.rows[0]?.terminated !== true) {
      fail("RUNNER_TERMINAL_VALID_DRAIN_FAILED");
    }
  }
  const residue = await admin.query({
    text: `select not exists (
      select 1 from pg_catalog.pg_stat_activity
      where usename = $1::pg_catalog.text
        and backend_type = 'client backend'
    ) as absent`,
    values: [runtimeRole],
  });
  if (residue.rows[0]?.absent !== true) {
    fail("RUNNER_TERMINAL_VALID_DRAIN_FAILED");
  }
}

async function verifyHostedPostcondition(admin, runtimeRole) {
  const result = await admin.query({
    text: `select
      pg_catalog.to_regrole($1::pg_catalog.text) is null as runtime_absent,
      (select pg_catalog.count(*) = 1 from careslink_v1_generation.communication_note_preview_authorizations) as authorizations_ok,
      (select pg_catalog.count(*) = 0 from careslink_v1_generation.communication_note_preview_authorization_revocations) as revocations_ok,
      (select pg_catalog.count(*) = 1 from careslink_v1_generation.communication_note_preview_claims) as claims_ok,
      (select pg_catalog.count(*) = 1 from careslink_v1_generation.communication_note_preview_dispatch_reservations) as reservations_ok,
      (select pg_catalog.count(*) = 1 from careslink_v1_generation.communication_note_preview_dispatch_receipts) as receipts_ok,
      (select pg_catalog.count(*) = 1 from careslink_v1_generation.communication_note_preview_runner_terminals) as terminals_ok,
      not exists (
        select 1 from pg_catalog.pg_stat_activity
        where usename = $1::pg_catalog.text
      ) as sessions_absent`,
    values: [runtimeRole],
  });
  const row = result.rows[0];
  if (
    result.rowCount !== 1 ||
    !row ||
    [
      "runtime_absent",
      "authorizations_ok",
      "revocations_ok",
      "claims_ok",
      "reservations_ok",
      "receipts_ok",
      "terminals_ok",
      "sessions_absent",
    ].some((key) => row[key] !== true)
  ) {
    fail("RUNNER_TERMINAL_VALID_POSTCHECK_FAILED");
  }
}

async function cleanupRuntimeRole(admin, runtimeRole, quiesceSql) {
  const settings = [[
    "careslink.runner_terminal_identity.runtime_role",
    runtimeRole,
  ]];
  await runScriptTransaction(
    admin,
    quiesceSql,
    settings,
    "RUNNER_TERMINAL_VALID_QUIESCE_FAILED",
  );
  await drainExactRuntimeBackends(admin, runtimeRole);
  await runScriptTransaction(
    admin,
    FAILURE_CLEANUP_SQL,
    settings,
    "RUNNER_TERMINAL_VALID_CLEANUP_FAILED",
  );
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > IDENTITY_POLICY.maximumStdinBytes) {
      fail("RUNNER_TERMINAL_VALID_STDIN_INVALID");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

async function main() {
  assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression();
  const args = parseCommunicationNotePreviewRunnerTerminalIdentityArguments(
    process.argv.slice(2),
  );
  if (
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    Object.entries(process.env).some(
      ([key, value]) => /^PG[A-Z0-9_]*$/.test(key) && value,
    )
  ) {
    fail("RUNNER_TERMINAL_VALID_ARGUMENT_INVALID");
  }
  let branchJson = await readBoundedStdin();
  const target = extractCommunicationNotePreviewBranchDatabaseTarget(
    branchJson,
    { expectedBranchRef: args.expectedBranchRef },
  );
  branchJson = undefined;

  const [{ Client }, certificateBuffer, setupSql, quiesceSql, cleanupSql] =
    await Promise.all([
      import("pg"),
      readFile(args.sslRootCertPath),
      readFile(new URL(
        "./communication-note-preview-runner-terminal-identity-setup.sql",
        import.meta.url,
      ), "utf8"),
      readFile(new URL(
        "./communication-note-preview-runner-terminal-identity-quiesce.sql",
        import.meta.url,
      ), "utf8"),
      readFile(new URL(
        "./communication-note-preview-runner-terminal-identity-cleanup.sql",
        import.meta.url,
      ), "utf8"),
    ]);
  if (typeof Client !== "function") {
    fail("RUNNER_TERMINAL_VALID_DRIVER_INVALID");
  }
  assertCommunicationNotePreviewRunnerTerminalIdentitySqlPolicy(
    setupSql,
    quiesceSql,
    cleanupSql,
  );
  if (
    certificateBuffer.length === 0 ||
    certificateBuffer.length > IDENTITY_POLICY.maximumCaBytes ||
    createHash("sha256").update(certificateBuffer).digest("hex") !==
      args.expectedSslRootCertSha256
  ) {
    fail("RUNNER_TERMINAL_VALID_CA_INVALID");
  }
  const certificate = certificateBuffer.toString("utf8");
  if (
    !certificate.includes("-----BEGIN CERTIFICATE-----") ||
    !certificate.includes("-----END CERTIFICATE-----")
  ) {
    fail("RUNNER_TERMINAL_VALID_CA_INVALID");
  }

  const candidates = target.takeAdminConnectionCandidates();
  const connected = await connectPreferredAdmin(Client, candidates, certificate);
  let admin = connected.client;
  let adminConnected = true;
  let runtimePassword = randomBytes(
    IDENTITY_POLICY.runtimePasswordBytes,
  ).toString("base64url");
  const runtimeRole = createCommunicationNotePreviewRuntimeRoleName(
    randomBytes(8).toString("hex"),
  );
  const settings = [
    ["careslink.runner_terminal_identity.runtime_role", runtimeRole],
    ["careslink.runner_terminal_identity.runtime_password", runtimePassword],
    [
      "careslink.runner_terminal_identity.runtime_expires_at",
      new Date(Date.now() + IDENTITY_POLICY.runtimeValidityMs).toISOString(),
    ],
    [
      "careslink.runner_terminal_identity.expected_pg_major",
      String(args.expectedPostgresMajor),
    ],
  ];
  let roleCreationAttempted = false;
  let childPassed = false;
  let primaryFailure;
  let cleanupFailure;
  try {
    roleCreationAttempted = true;
    await runScriptTransaction(
      admin,
      setupSql,
      settings,
      "RUNNER_TERMINAL_VALID_SETUP_FAILED",
    );
    const pipeConfig =
      createCommunicationNotePreviewRunnerTerminalHostedPipeConfig({
        candidate: connected.candidate,
        expectedBranchRef: args.expectedBranchRef,
        expectedPostgresMajor: args.expectedPostgresMajor,
        runtimeRole,
        runtimePassword,
        sslRootCertPath: args.sslRootCertPath,
        expectedSslRootCertSha256: args.expectedSslRootCertSha256,
      });
    await runHostedChild(pipeConfig);
    childPassed = true;
    if (connected.backgroundState.failed) {
      fail("RUNNER_TERMINAL_VALID_CONNECTION_FAILED");
    }
    await verifyHostedPostcondition(admin, runtimeRole);
    if (connected.backgroundState.failed) {
      fail("RUNNER_TERMINAL_VALID_CONNECTION_FAILED");
    }
  } catch (error) {
    primaryFailure = error;
  } finally {
    runtimePassword = undefined;
    if (roleCreationAttempted) {
      try {
        await cleanupRuntimeRole(admin, runtimeRole, quiesceSql);
        roleCreationAttempted = false;
      } catch (error) {
        cleanupFailure = error;
        await closeQuietly(admin);
        adminConnected = false;
        try {
          const reconnected = await connectPreferredAdmin(
            Client,
            candidates,
            certificate,
          );
          admin = reconnected.client;
          adminConnected = true;
          await cleanupRuntimeRole(admin, runtimeRole, quiesceSql);
          roleCreationAttempted = false;
          cleanupFailure = undefined;
        } catch (retryError) {
          cleanupFailure = retryError;
        }
      }
    }
    if (adminConnected) await closeQuietly(admin);
  }
  if (cleanupFailure) throw cleanupFailure;
  if (primaryFailure) throw primaryFailure;
  if (!childPassed) fail("RUNNER_TERMINAL_VALID_CHILD_FAILED");
  process.stdout.write(`${JSON.stringify(
    createCommunicationNotePreviewRunnerTerminalValidEvidence(),
  )}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code = error instanceof CommunicationNotePreviewRunnerTerminalValidError
      ? error.code
      : "RUNNER_TERMINAL_VALID_INTERNAL_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
