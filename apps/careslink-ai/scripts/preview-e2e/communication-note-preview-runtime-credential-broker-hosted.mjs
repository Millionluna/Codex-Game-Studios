import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY as IDENTITY_POLICY,
  assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression,
  extractCommunicationNoteDisposablePreviewResetDatabaseTarget,
  parseCommunicationNotePreviewRunnerTerminalIdentityArguments,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";
import {
  assertVerifiedPreviewTlsConnection,
} from "./communication-note-preview-runner-terminal-identity.mjs";
import {
  CommunicationNotePreviewHostedChildChannelError,
  createCommunicationNotePreviewHostedChildEnvironment,
  parseCommunicationNotePreviewHostedChildStatus,
  runCommunicationNotePreviewHostedChild,
} from "./communication-note-preview-hosted-child-channel.mjs";

const ENABLE_ENV = "CARESLINK_V1_M1L_HOSTED_LIVE_ENABLED";
const CONFIG_FD_ENV = "CARESLINK_V1_M1L_HOSTED_LIVE_CONFIG_FD";
const STATUS_FD_ENV = "CARESLINK_V1_M1L_HOSTED_LIVE_STATUS_FD";
const CONFIG_FD = 3;
const STATUS_FD = 4;
const CHILD_TIMEOUT_MS = 120_000;
const CHILD_KILL_GRACE_MS = 2_000;
const CHILD_CONFIG_MAXIMUM_BYTES = 65_536;
const CHILD_STATUS_MAXIMUM_BYTES = 512;
const HOSTED_CHILD_SUCCESS = "RUNTIME_BROKER_HOSTED_LIVE_PASSED";
const MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-management";
const RUNTIME_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-runtime";
const ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SCRAM_PATTERN =
  /^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/]{22}==[$][A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const DIRECT_UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

const CHILD_FAILURE_CODES = new Set([
  "RUNTIME_BROKER_HOSTED_LIVE_ACQUIRE_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_ACTIVE_POSTURE_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_ADMIN_CONNECTION_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_API_ACL_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_BACKGROUND_CLIENT_ERROR",
  "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CATALOG_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CONFIG_INVALID",
  "RUNTIME_BROKER_HOSTED_LIVE_CONFIG_PIPE_INVALID",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CLEANUP_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_CREATE_DENIED",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_FINALIZE_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_OWNER_ATTESTATION_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_OWNER_CREATE_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RESIDUE_ATTESTATION_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RESIDUE_CONNECTION_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RUNTIME_CLOSE_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_TOMBSTONE_ROLLBACK_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_DRIVER_INVALID",
  "RUNTIME_BROKER_HOSTED_LIVE_FINALIZE_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_INSPECT_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_LEDGER_POSTCHECK_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_NEW_LOGIN_DENIAL_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_POSTGRES_MAJOR_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_PREPARE_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_CONNECTION_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_IDENTITY_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_RUNTIME_POSTURE_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_SIGNED_TERMINAL_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_TEST_FAILED",
  "RUNTIME_BROKER_HOSTED_LIVE_TLS_INVALID",
  "RUNTIME_BROKER_HOSTED_LIVE_TOMBSTONE_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_CATALOG_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_CONFLICT_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_FIRST_PERSIST_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_REPLAY_FAILED",
  "RUNNER_TERMINAL_HOSTED_LIVE_REPLAY_PERSIST_FAILED",
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
  "RUNTIME_BROKER_HOSTED_ARGUMENT_INVALID",
  "RUNTIME_BROKER_HOSTED_CA_INVALID",
  "RUNTIME_BROKER_HOSTED_CHILD_FAILED",
  "RUNTIME_BROKER_HOSTED_CHILD_PIPE_FAILED",
  "RUNTIME_BROKER_HOSTED_CLEANUP_FAILED",
  "RUNTIME_BROKER_HOSTED_CONNECTION_FAILED",
  "RUNTIME_BROKER_HOSTED_DRIVER_INVALID",
  "RUNTIME_BROKER_HOSTED_INTERNAL_FAILED",
  "RUNTIME_BROKER_HOSTED_POSTCHECK_FAILED",
  "RUNTIME_BROKER_HOSTED_PREFLIGHT_FAILED",
  "RUNTIME_BROKER_HOSTED_STDIN_INVALID",
  ...CHILD_FAILURE_CODES,
]);

const TOMBSTONE_SQL = `select careslink_v1_runtime_broker.tombstone(
  $1::pg_catalog.text
) as result`;
const FINALIZE_SQL = `select careslink_v1_runtime_broker.finalize(
  $1::pg_catalog.text
) as result`;
const INSPECT_SQL = `select careslink_v1_runtime_broker.inspect(
  $1::pg_catalog.text
) as result`;

export class CommunicationNotePreviewRuntimeBrokerHostedError extends Error {
  constructor(code) {
    const fixedCode = FIXED_ERRORS.has(code)
      ? code
      : "RUNTIME_BROKER_HOSTED_INTERNAL_FAILED";
    super(fixedCode);
    this.name = "CommunicationNotePreviewRuntimeBrokerHostedError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePreviewRuntimeBrokerHostedError(code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeOwnErrorCode(error) {
  if (!error || typeof error !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor && "value" in descriptor &&
      typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function createScramMaterial() {
  const passwordBytes = randomBytes(32);
  const salt = randomBytes(16);
  const password = passwordBytes.toString("base64url");
  const saltedPassword = pbkdf2Sync(password, salt, 4_096, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key", "utf8")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key", "utf8")
    .digest();
  const verifier =
    `SCRAM-SHA-256$4096:${salt.toString("base64")}$` +
    `${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
  passwordBytes.fill(0);
  salt.fill(0);
  saltedPassword.fill(0);
  clientKey.fill(0);
  storedKey.fill(0);
  serverKey.fill(0);
  return {
    password,
    verifier,
    verifierSha256: sha256(verifier),
  };
}

export function createCommunicationNotePreviewRuntimeBrokerHostedMaterial() {
  const acquisitionDigest = sha256(randomBytes(32));
  const runtimeRole =
    "careslink_v1_preview_runner_terminal_runtime_" +
    acquisitionDigest.slice(0, 16);
  const material = createScramMaterial();
  const value = {
    acquisitionDigest,
    credentialVerifierSha256: material.verifierSha256,
    leaseReferenceSha256: sha256(randomBytes(32)),
    runtimePassword: material.password,
    runtimeRole,
    scramVerifier: material.verifier,
    sessionBindingSha256: sha256(randomBytes(32)),
  };
  if (
    !ROLE_PATTERN.test(value.runtimeRole) ||
    !SCRAM_PATTERN.test(value.scramVerifier) ||
    new Set([
      value.acquisitionDigest,
      value.credentialVerifierSha256,
      value.leaseReferenceSha256,
      value.sessionBindingSha256,
    ]).size !== 4
  ) {
    fail("RUNTIME_BROKER_HOSTED_INTERNAL_FAILED");
  }
  return value;
}

function isValidHostedMaterial(material) {
  const digests = [
    material?.acquisitionDigest,
    material?.credentialVerifierSha256,
    material?.leaseReferenceSha256,
    material?.sessionBindingSha256,
  ];
  return Boolean(
    material &&
    typeof material === "object" &&
    digests.every((digest) => SHA256_PATTERN.test(digest ?? "")) &&
    new Set(digests).size === digests.length &&
    material.runtimeRole ===
      "careslink_v1_preview_runner_terminal_runtime_" +
        material.acquisitionDigest.slice(0, 16) &&
    ROLE_PATTERN.test(material.runtimeRole) &&
    typeof material.runtimePassword === "string" &&
    material.runtimePassword.length >= 32 &&
    !CONTROL_CHARACTER_PATTERN.test(material.runtimePassword) &&
    SCRAM_PATTERN.test(material.scramVerifier ?? "") &&
    sha256(material.scramVerifier ?? "") ===
      material.credentialVerifierSha256,
  );
}

export function createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
  candidate,
  expectedBranchRef,
  expectedPostgresMajor,
  sslRootCertPath,
  expectedSslRootCertSha256,
  material,
  crossDatabaseMaterial,
}) {
  const direct = candidate?.mode === "direct" &&
    candidate.host === `db.${expectedBranchRef}.supabase.co` &&
    candidate.user === "postgres";
  const sessionPooler = candidate?.mode === "session_pooler" &&
    typeof candidate.host === "string" &&
    SESSION_POOLER_HOST_PATTERN.test(candidate.host) &&
    candidate.user === `postgres.${expectedBranchRef}`;
  const digests = [
    material?.acquisitionDigest,
    material?.credentialVerifierSha256,
    material?.leaseReferenceSha256,
    material?.sessionBindingSha256,
    crossDatabaseMaterial?.acquisitionDigest,
    crossDatabaseMaterial?.credentialVerifierSha256,
    crossDatabaseMaterial?.leaseReferenceSha256,
    crossDatabaseMaterial?.sessionBindingSha256,
  ];
  if (
    (!direct && !sessionPooler) ||
    candidate.port !== 5432 ||
    candidate.database !== "postgres" ||
    typeof candidate.password !== "string" ||
    candidate.password.length < 16 ||
    CONTROL_CHARACTER_PATTERN.test(candidate.password) ||
    !/^[a-z0-9]{20}$/.test(expectedBranchRef) ||
    expectedBranchRef === IDENTITY_POLICY.productionProjectRef ||
    expectedPostgresMajor !== 17 ||
    typeof sslRootCertPath !== "string" ||
    !sslRootCertPath.startsWith("/") ||
    !SHA256_PATTERN.test(expectedSslRootCertSha256) ||
    !isValidHostedMaterial(material) ||
    !isValidHostedMaterial(crossDatabaseMaterial) ||
    new Set(digests).size !== digests.length ||
    material.runtimePassword === candidate.password ||
    crossDatabaseMaterial.runtimePassword === candidate.password ||
    material.runtimePassword === crossDatabaseMaterial.runtimePassword
  ) {
    fail("RUNTIME_BROKER_HOSTED_ARGUMENT_INVALID");
  }
  const runtimeDatabaseUser = sessionPooler
    ? `${material.runtimeRole}.${expectedBranchRef}`
    : material.runtimeRole;
  const crossDatabaseRuntimeDatabaseUser = sessionPooler
    ? `${crossDatabaseMaterial.runtimeRole}.${expectedBranchRef}`
    : crossDatabaseMaterial.runtimeRole;
  const databaseTargetDigest = sha256(JSON.stringify({
    branchRef: expectedBranchRef,
    database: candidate.database,
    host: candidate.host,
    port: candidate.port,
  }));
  if (digests.includes(databaseTargetDigest)) {
    fail("RUNTIME_BROKER_HOSTED_INTERNAL_FAILED");
  }
  return Object.freeze({
    acquisitionDigest: material.acquisitionDigest,
    adminDatabasePassword: candidate.password,
    adminDatabaseUser: candidate.user,
    credentialVerifierSha256: material.credentialVerifierSha256,
    crossDatabaseAcquisitionDigest:
      crossDatabaseMaterial.acquisitionDigest,
    crossDatabaseCredentialVerifierSha256:
      crossDatabaseMaterial.credentialVerifierSha256,
    crossDatabaseLeaseReferenceSha256:
      crossDatabaseMaterial.leaseReferenceSha256,
    crossDatabaseRuntimeDatabasePassword:
      crossDatabaseMaterial.runtimePassword,
    crossDatabaseRuntimeDatabaseUser,
    crossDatabaseRuntimeRole: crossDatabaseMaterial.runtimeRole,
    crossDatabaseScramVerifier: crossDatabaseMaterial.scramVerifier,
    crossDatabaseSessionBindingSha256:
      crossDatabaseMaterial.sessionBindingSha256,
    databaseHost: candidate.host,
    databaseName: candidate.database,
    databasePort: candidate.port,
    databaseTargetDigest,
    expectedBranchRef,
    expectedPostgresMajor,
    expectedSslRootCertSha256,
    leaseReferenceSha256: material.leaseReferenceSha256,
    runtimeApplicationName: RUNTIME_APPLICATION_NAME,
    runtimeDatabasePassword: material.runtimePassword,
    runtimeDatabaseUser,
    runtimeRole: material.runtimeRole,
    scramVerifier: material.scramVerifier,
    sessionBindingSha256: material.sessionBindingSha256,
    sslRootCertPath,
  });
}

export function createCommunicationNotePreviewRuntimeBrokerHostedChildEnvironment(
  baseEnvironment,
) {
  if (!baseEnvironment || typeof baseEnvironment !== "object") {
    fail("RUNTIME_BROKER_HOSTED_ARGUMENT_INVALID");
  }
  return createCommunicationNotePreviewHostedChildEnvironment({
    baseEnvironment,
    enableEnvironmentKey: ENABLE_ENV,
    inputPipeBindings: Object.freeze([
      Object.freeze({ environmentKey: CONFIG_FD_ENV, fd: CONFIG_FD }),
    ]),
    statusPipeBinding: Object.freeze({
      environmentKey: STATUS_FD_ENV,
      fd: STATUS_FD,
    }),
  });
}

export function parseCommunicationNotePreviewRuntimeBrokerHostedChildStatus(
  value,
) {
  return parseCommunicationNotePreviewHostedChildStatus({
    value,
    successStatus: HOSTED_CHILD_SUCCESS,
    failureStatuses: CHILD_FAILURE_CODES,
    fallbackStatus: "RUNTIME_BROKER_HOSTED_CHILD_FAILED",
    maximumBytes: CHILD_STATUS_MAXIMUM_BYTES,
  });
}

export function createCommunicationNotePreviewRuntimeBrokerHostedEvidence() {
  return Object.freeze({
    ok: true,
    gate: "communication-note-runtime-credential-broker-hosted-pg17",
    postgresMajor: 17,
    terminalState: "ACCEPTED",
    exactReplayCreated: false,
    validConflictRejected: true,
    runtimeIdentity: "DIRECT_LOGIN_INHERITED_CALLER_WITHOUT_SET",
    bindLoginFence: "NOLOGIN",
    crossDatabaseOwnerResidueProof: true,
    acquisitionCount: 2,
    revokedIssuedCount: 2,
    finalLedgerCounts: Object.freeze([1, 0, 1, 1, 1, 1]),
    runtimeRoleCount: 0,
    runtimeSessionCount: 0,
    runtimeMembershipCount: 0,
    apiPrivilegeCount: 0,
    credentialVerifierResidueCount: 0,
    temporaryDatabaseCount: 0,
    credentialTransport: "anonymous_fd_pipe_process_memory_only",
    rawCredentialMaterialPresent: false,
  });
}

function createDatabaseConnectionConfig(
  candidate,
  certificate,
  user,
  password,
  applicationName,
) {
  return Object.freeze({
    host: candidate.host,
    port: candidate.port,
    database: candidate.database,
    user,
    password,
    application_name: applicationName,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 9_000,
    options: "-c row_security=on",
    client_encoding: "UTF8",
    sslnegotiation: "postgres",
    ssl: Object.freeze({ ca: certificate, rejectUnauthorized: true }),
  });
}

async function closeQuietly(client) {
  try {
    await client?.end();
  } catch {
    // Disposable Preview deletion remains the final cleanup boundary.
  }
}

async function connectPreferredAdmin(Client, candidates, certificate) {
  let direct = new Client(createDatabaseConnectionConfig(
    candidates.direct,
    certificate,
    candidates.direct.user,
    candidates.direct.password,
    MANAGEMENT_APPLICATION_NAME,
  ));
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
      backgroundState: directBackground,
    });
  } catch (error) {
    await closeQuietly(direct);
    direct = undefined;
    if (!DIRECT_UNREACHABLE_CODES.has(safeOwnErrorCode(error))) {
      fail("RUNTIME_BROKER_HOSTED_CONNECTION_FAILED");
    }
  }
  const session = new Client(createDatabaseConnectionConfig(
    candidates.sessionPooler,
    certificate,
    candidates.sessionPooler.user,
    candidates.sessionPooler.password,
    MANAGEMENT_APPLICATION_NAME,
  ));
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
      backgroundState: sessionBackground,
    });
  } catch {
    await closeQuietly(session);
    fail("RUNTIME_BROKER_HOSTED_CONNECTION_FAILED");
  }
}

async function runHostedChild(pipeConfig, baseEnvironment = process.env) {
  const require = createRequire(import.meta.url);
  let vitestCli;
  try {
    vitestCli = join(
      dirname(require.resolve("vitest/package.json")),
      "vitest.mjs",
    );
  } catch {
    fail("RUNTIME_BROKER_HOSTED_DRIVER_INVALID");
  }
  const appDirectory = fileURLToPath(new URL("../../", import.meta.url));
  const liveTest = fileURLToPath(new URL(
    "../../src/lib/v1/communication-note-preview-runtime-credential-broker-hosted.live.test.ts",
    import.meta.url,
  ));
  try {
    // The shared channel owns this exact legacy shape:
    // stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"]
    await runCommunicationNotePreviewHostedChild({
      executable: process.execPath,
      args: Object.freeze([
        vitestCli,
        "run",
        liveTest,
        "--pool=threads",
        "--maxWorkers=1",
        "--reporter=dot",
      ]),
      cwd: appDirectory,
      environment:
        createCommunicationNotePreviewRuntimeBrokerHostedChildEnvironment(
          baseEnvironment,
        ),
      inputPipes: Object.freeze([
        Object.freeze({
          fd: CONFIG_FD,
          payload: JSON.stringify(pipeConfig),
          maximumBytes: CHILD_CONFIG_MAXIMUM_BYTES,
        }),
      ]),
      statusFd: STATUS_FD,
      successStatus: HOSTED_CHILD_SUCCESS,
      failureStatuses: CHILD_FAILURE_CODES,
      fallbackStatus: "RUNTIME_BROKER_HOSTED_CHILD_FAILED",
      pipeFailureStatus: "RUNTIME_BROKER_HOSTED_CHILD_PIPE_FAILED",
      timeoutMs: CHILD_TIMEOUT_MS,
      killGraceMs: CHILD_KILL_GRACE_MS,
      maximumStatusBytes: CHILD_STATUS_MAXIMUM_BYTES,
    });
  } catch (error) {
    if (
      error instanceof CommunicationNotePreviewHostedChildChannelError
    ) {
      if (error.code === "HOSTED_CHILD_CHANNEL_PIPE_FAILED") {
        fail("RUNTIME_BROKER_HOSTED_CHILD_PIPE_FAILED");
      }
      if (CHILD_FAILURE_CODES.has(error.childStatus)) {
        fail(error.childStatus);
      }
    }
    fail("RUNTIME_BROKER_HOSTED_CHILD_FAILED");
  }
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > IDENTITY_POLICY.maximumStdinBytes) {
      fail("RUNTIME_BROKER_HOSTED_STDIN_INVALID");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

async function verifyPreflight(admin) {
  try {
    const result = await admin.query(`select
      current_user = 'postgres' and session_user = 'postgres' as identity_ok,
      pg_catalog.current_database() = 'postgres' as database_ok,
      pg_catalog.current_setting('application_name') = $1::pg_catalog.text
        as application_ok,
      pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
        10000 = 17 as postgres_ok,
      pg_catalog.to_regnamespace('careslink_v1_runtime_broker') is not null
        as broker_installed`, [MANAGEMENT_APPLICATION_NAME]);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      !row ||
      [
        "identity_ok",
        "database_ok",
        "application_ok",
        "postgres_ok",
        "broker_installed",
      ].some((key) => row[key] !== true)
    ) {
      fail("RUNTIME_BROKER_HOSTED_PREFLIGHT_FAILED");
    }
  } catch (error) {
    if (error instanceof CommunicationNotePreviewRuntimeBrokerHostedError) {
      throw error;
    }
    fail("RUNTIME_BROKER_HOSTED_PREFLIGHT_FAILED");
  }
}

async function cleanupAcquisition(admin, acquisitionDigest) {
  try {
    await admin.query(TOMBSTONE_SQL, [acquisitionDigest]);
    await admin.query(FINALIZE_SQL, [acquisitionDigest]);
    const inspected = await admin.query(INSPECT_SQL, [acquisitionDigest]);
    const value = inspected.rows[0]?.result;
    if (
      inspected.rowCount !== 1 ||
      value?.status !== "REVOKED_ATTESTED" ||
      value?.roleCount !== 0 ||
      value?.sessionCount !== 0 ||
      value?.membershipCount !== 0 ||
      value?.credentialVerifierResidueCount !== 0
    ) {
      fail("RUNTIME_BROKER_HOSTED_CLEANUP_FAILED");
    }
  } catch (error) {
    if (error instanceof CommunicationNotePreviewRuntimeBrokerHostedError) {
      throw error;
    }
    fail("RUNTIME_BROKER_HOSTED_CLEANUP_FAILED");
  }
}

async function verifyPostcondition(admin, acquisitions) {
  try {
    const result = await admin.query(`select
      (
        select pg_catalog.count(*) = 2
          and pg_catalog.count(*) filter (
            where acquisition.acquisition_digest = any($1::pg_catalog.text[])
          ) = 2
          and pg_catalog.count(*) filter (
            where acquisition.state = 'REVOKED'
              and acquisition.issued_at is not null
              and acquisition.tombstoned_at is not null
              and acquisition.future_issuance_blocked
              and acquisition.revoked_at is not null
              and acquisition.reported_session_disposition = 'DESTROYED'
              and acquisition.reported_credential_disposition = 'REVOKED'
              and not acquisition.reusable
              and not acquisition.raw_credential_material_present
          ) = 2
        from careslink_v1_runtime_broker.acquisitions as acquisition
      ) as acquisitions_revoked,
      not exists (
        select 1 from pg_catalog.pg_roles as role_record
        where role_record.rolname ~
          '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as runtimes_absent,
      not exists (
        select 1 from pg_catalog.pg_stat_activity as activity
        where activity.usename ~
          '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as sessions_absent,
      not exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as member_role
          on member_role.oid = membership.member
        where member_role.rolname ~
          '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as memberships_absent,
      (
        select pg_catalog.count(*)
        from pg_catalog.unnest(array[
          'anon', 'authenticated', 'service_role', 'authenticator'
        ]::pg_catalog.text[]) as api(role_name)
        where pg_catalog.has_schema_privilege(
            api.role_name, 'careslink_v1_runtime_broker', 'USAGE'
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
          or pg_catalog.has_table_privilege(
            api.role_name,
            'careslink_v1_runtime_broker.acquisitions',
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
      )::pg_catalog.int4 as api_privilege_count,
      pg_catalog.jsonb_build_array(
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
      ) as ledger_counts,
      (
        select pg_catalog.count(*) = 40
        from supabase_migrations.schema_migrations
      ) as migration_count_ok,
      not exists (
        select 1 from pg_catalog.pg_database
        where datname = 'careslink_v1_m1l_runtime_residue'
      ) as temporary_database_absent,
      pg_catalog.to_regnamespace(
        'careslink_test_only_runtime_broker'
      ) is null as test_broker_absent`, [
      acquisitions.map((acquisition) => acquisition.acquisitionDigest),
    ]);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      !row ||
      [
        "acquisitions_revoked",
        "runtimes_absent",
        "sessions_absent",
        "memberships_absent",
        "migration_count_ok",
        "temporary_database_absent",
        "test_broker_absent",
      ].some((key) => row[key] !== true) ||
      Number(row.api_privilege_count) !== 0 ||
      JSON.stringify(row.ledger_counts) !== "[1,0,1,1,1,1]"
    ) {
      fail("RUNTIME_BROKER_HOSTED_POSTCHECK_FAILED");
    }
  } catch (error) {
    if (error instanceof CommunicationNotePreviewRuntimeBrokerHostedError) {
      throw error;
    }
    fail("RUNTIME_BROKER_HOSTED_POSTCHECK_FAILED");
  }
}

export const COMMUNICATION_NOTE_PREVIEW_RUNTIME_BROKER_HOSTED_TEST_ONLY =
  Object.freeze({ runHostedChild });

async function main() {
  assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression();
  const args = parseCommunicationNotePreviewRunnerTerminalIdentityArguments(
    process.argv.slice(2),
  );
  if (
    args.expectedPostgresMajor !== 17 ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    typeof process.env.NODE_OPTIONS === "string" ||
    typeof process.env.NODE_PATH === "string" ||
    Object.entries(process.env).some(
      ([key, value]) => /^PG[A-Z0-9_]*$/.test(key) && value,
    )
  ) {
    fail("RUNTIME_BROKER_HOSTED_ARGUMENT_INVALID");
  }
  let branchJson = await readBoundedStdin();
  const target = extractCommunicationNoteDisposablePreviewResetDatabaseTarget(
    branchJson,
    { expectedBranchRef: args.expectedBranchRef },
  );
  branchJson = undefined;
  const [{ Client }, certificateBuffer] = await Promise.all([
    import("pg"),
    readFile(args.sslRootCertPath),
  ]);
  if (typeof Client !== "function") {
    fail("RUNTIME_BROKER_HOSTED_DRIVER_INVALID");
  }
  if (
    certificateBuffer.length === 0 ||
    certificateBuffer.length > IDENTITY_POLICY.maximumCaBytes ||
    createHash("sha256").update(certificateBuffer).digest("hex") !==
      args.expectedSslRootCertSha256
  ) {
    fail("RUNTIME_BROKER_HOSTED_CA_INVALID");
  }
  const certificate = certificateBuffer.toString("utf8");
  if (
    !certificate.includes("-----BEGIN CERTIFICATE-----") ||
    !certificate.includes("-----END CERTIFICATE-----")
  ) {
    fail("RUNTIME_BROKER_HOSTED_CA_INVALID");
  }

  const candidates = target.takeAdminConnectionCandidates();
  const connected = await connectPreferredAdmin(Client, candidates, certificate);
  let admin = connected.client;
  let adminConnected = true;
  let material = createCommunicationNotePreviewRuntimeBrokerHostedMaterial();
  let crossDatabaseMaterial =
    createCommunicationNotePreviewRuntimeBrokerHostedMaterial();
  let pipeConfig = createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
    candidate: connected.candidate,
    expectedBranchRef: args.expectedBranchRef,
    expectedPostgresMajor: args.expectedPostgresMajor,
    sslRootCertPath: args.sslRootCertPath,
    expectedSslRootCertSha256: args.expectedSslRootCertSha256,
    material,
    crossDatabaseMaterial,
  });
  const acquisitions = Object.freeze([
    Object.freeze({
      acquisitionDigest: material.acquisitionDigest,
      runtimeRole: material.runtimeRole,
    }),
    Object.freeze({
      acquisitionDigest: crossDatabaseMaterial.acquisitionDigest,
      runtimeRole: crossDatabaseMaterial.runtimeRole,
    }),
  ]);
  let childStarted = false;
  let primaryFailure;
  let cleanupFailure;
  try {
    await verifyPreflight(admin);
    childStarted = true;
    await runHostedChild(pipeConfig);
    pipeConfig = undefined;
    material.runtimePassword = undefined;
    material.scramVerifier = undefined;
    material = undefined;
    crossDatabaseMaterial.runtimePassword = undefined;
    crossDatabaseMaterial.scramVerifier = undefined;
    crossDatabaseMaterial = undefined;
    if (connected.backgroundState.failed) {
      fail("RUNTIME_BROKER_HOSTED_CONNECTION_FAILED");
    }
    await verifyPostcondition(admin, acquisitions);
  } catch (error) {
    primaryFailure = error;
  } finally {
    pipeConfig = undefined;
    if (material) {
      material.runtimePassword = undefined;
      material.scramVerifier = undefined;
      material = undefined;
    }
    if (crossDatabaseMaterial) {
      crossDatabaseMaterial.runtimePassword = undefined;
      crossDatabaseMaterial.scramVerifier = undefined;
      crossDatabaseMaterial = undefined;
    }
    if (primaryFailure && childStarted) {
      try {
        for (const acquisition of acquisitions) {
          await cleanupAcquisition(admin, acquisition.acquisitionDigest);
        }
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
          for (const acquisition of acquisitions) {
            await cleanupAcquisition(admin, acquisition.acquisitionDigest);
          }
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
  process.stdout.write(`${JSON.stringify(
    createCommunicationNotePreviewRuntimeBrokerHostedEvidence(),
  )}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code = error instanceof CommunicationNotePreviewRuntimeBrokerHostedError
      ? error.code
      : "RUNTIME_BROKER_HOSTED_INTERNAL_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
