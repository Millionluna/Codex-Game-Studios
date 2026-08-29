import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES as IDENTITY_ERRORS,
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY as IDENTITY_POLICY,
  CommunicationNotePreviewRunnerTerminalIdentityPolicyError,
  extractCommunicationNotePreviewBranchDatabaseTarget,
  parseCommunicationNotePreviewRunnerTerminalIdentityArguments,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";

const ASSERTION_MANIFEST_SHA256 =
  "36c0f94448d4a53a19f94540f5d6685c3678ad29019e42b6b0b7b97fdc41d833";
const ASSERTION_APPLICATION_NAME =
  "careslink-preview-schema-rollback-assertions";
const ASSERTION_TRANSPORT_ROLE_PREFIX =
  "careslink_m1gh_assert_transport_";
const ASSERTION_ACTOR_ROLE_PREFIX = "careslink_m1gh_assert_actor_";
const ASSERTION_NONCE_PATTERN = /^[a-f0-9]{16}$/;
const MAXIMUM_ASSERTION_BYTES = 2 * 1_024 * 1_024;
const RUNNER_FAILURE_STAGE = "R00";
const ASSERTION_STAGE_CODES = Object.freeze([
  "A01",
  "A02",
  "A03",
  "A04",
  "A05",
  "A06",
  "A07",
  "A08",
  "A09",
  "A10",
  "A11",
  "A12",
  "A13",
  "A14",
  "A15",
  "A16",
  "A17",
  "A18",
]);
const DIRECT_UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);
const CLIENT_BACKGROUND_STATES = new WeakMap();

const ASSERTION_MANIFEST = Object.freeze([
  Object.freeze({
    stage: "A01",
    path: "supabase/assertions/communication_note_preview_custody_callers_shadow_assertions.sql",
    sha256: "7fa7fa9d4c9667005b36c1f72c95aaf2418131d05037b5ea347f83e0bfcf16d2",
  }),
  Object.freeze({
    stage: "A02",
    path: "supabase/assertions/communication_note_preview_execution_authority_shadow_assertions.sql",
    sha256: "9b1e0088e7e39b81e248815e8ce6e939f29220830feda2d177ffd230892b39db",
  }),
  Object.freeze({
    stage: "A03",
    path: "supabase/assertions/communication_note_preview_runner_terminal_shadow_assertions.sql",
    sha256: "5324e0cdd9b97e8804385950c59c89b1b80e4c4215fd24b0ecf9e85c97a4c9bd",
  }),
  Object.freeze({
    stage: "A04",
    path: "supabase/assertions/v1_note_generation_durable_foundation_assertions.sql",
    sha256: "b0c6b177ef012998fb6959e1499e360f668809ff61ad3d54d2731af7c8c9290e",
  }),
  Object.freeze({
    stage: "A05",
    path: "supabase/assertions/v1_note_generation_owner_runtime_rpc_shadow_assertions.sql",
    sha256: "b699e5967fd487656dc34c398b61c464396b26d40d48fc1bfbe8c53f3c423a3b",
  }),
  Object.freeze({
    stage: "A06",
    path: "supabase/assertions/v1_note_generation_registration_retirement_shadow_assertions.sql",
    sha256: "301da01ebbca2f4165579113c559c7a2e624919d703cb4c9b43b8bf2232ceb13",
  }),
  Object.freeze({
    stage: "A07",
    path: "supabase/assertions/v1_note_generation_worker_rpc_shadow_assertions.sql",
    sha256: "cbba8ad819cad206a4f94340e37ff1b593ee7944d01e5b7496fc13a9cc3748b0",
  }),
  Object.freeze({
    stage: "A08",
    path: "supabase/tests/migration_entry_role_restore_assertions.sql",
    sha256: "6c1b4baa3dfc2e93932bf68deca470d0fe18f2c60213ddb78a78db7b178e5fd1",
    migrationEntryRole: true,
  }),
  Object.freeze({
    stage: "A09",
    path: "supabase/tests/portal_referral_assignment_runtime_assertions.sql",
    sha256: "569c6f50899df1754be1cc4971328b3dfae4a766871941b83b4603bc867bcd9c",
  }),
  Object.freeze({
    stage: "A10",
    path: "supabase/tests/portal_referral_follow_up_runtime_assertions.sql",
    sha256: "c68a71dd018d9e417a51e252dc6fb10a5c3e2a2687297705cee0da334bd7588e",
  }),
  Object.freeze({
    stage: "A11",
    path: "supabase/tests/portal_referral_intake_runtime_assertions.sql",
    sha256: "0f991ec9962842d98f034e065b108a3914e19cc6ce4398673ee80b2b3513812b",
  }),
  Object.freeze({
    stage: "A12",
    path: "supabase/tests/portal_referral_provider_response_runtime_assertions.sql",
    sha256: "b939a5f0e3e3536b4b245f48acc5d801b1ad64361ff89a2560e08065bc571f0c",
  }),
  Object.freeze({
    stage: "A13",
    path: "supabase/tests/portal_referral_source_detail_runtime_assertions.sql",
    sha256: "2dc91eb69814a778d82a392d41c2d4aadc84a102b8df870a24db4bb41842dd98",
  }),
  Object.freeze({
    stage: "A14",
    path: "supabase/tests/portal_referral_workflow_foundation_assertions.sql",
    sha256: "de4d4807981071bd70a18714c93bb90f2fea0cd5c29c814c22365598e1a1eabd",
  }),
  Object.freeze({
    stage: "A15",
    path: "supabase/tests/v1_mobile_sync_shadow_assertions.sql",
    sha256: "a543edac38264d812a8949d756bebbc7fb0d7efac1cdd5d8c91cbc3d674ab577",
  }),
  Object.freeze({
    stage: "A16",
    path: "supabase/tests/v1_ndis_shadow_integration_assertions.sql",
    sha256: "e620fdb066692bbfa3b998b7686cfc60cd307886b77d68a545b853975e7d3f14",
  }),
  Object.freeze({
    stage: "A17",
    path: "supabase/tests/v1_privacy_review_shadow_assertions.sql",
    sha256: "84711b01bcd72a7a11a2bc573f8cbd63aecfc2986ca273dc24bb894754cd5bd3",
  }),
  Object.freeze({
    stage: "A18",
    path: "supabase/tests/v1_shadow_contract_assertions.sql",
    sha256: "93dd91eac00a6a24c1fa1c7c4ec3bf03fb2508ab8c7bf8bab9f4c17a04f5b9cf",
  }),
]);

export const COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_STAGE_CODES =
  Object.freeze({
    runner: RUNNER_FAILURE_STAGE,
    assertions: ASSERTION_STAGE_CODES,
  });

export const COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_POLICY =
  Object.freeze({
    version: "2026-08-29.preview-schema-rollback-assertions.2",
    fileCount: ASSERTION_MANIFEST.length,
    manifestSha256: ASSERTION_MANIFEST_SHA256,
    applicationName: ASSERTION_APPLICATION_NAME,
    transportRolePrefix: ASSERTION_TRANSPORT_ROLE_PREFIX,
    actorRolePrefix: ASSERTION_ACTOR_ROLE_PREFIX,
  });

export const COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES =
  Object.freeze({
    driverInvalid: "SCHEMA_ROLLBACK_ASSERTION_DRIVER_INVALID",
    connectionFailed: "SCHEMA_ROLLBACK_ASSERTION_CONNECTION_FAILED",
    tlsFailed: "SCHEMA_ROLLBACK_ASSERTION_TLS_FAILED",
    targetFailed: "SCHEMA_ROLLBACK_ASSERTION_TARGET_FAILED",
    caFailed: "SCHEMA_ROLLBACK_ASSERTION_CA_FAILED",
    manifestFailed: "SCHEMA_ROLLBACK_ASSERTION_MANIFEST_FAILED",
    sqlPolicyFailed: "SCHEMA_ROLLBACK_ASSERTION_SQL_POLICY_FAILED",
    precheckFailed: "SCHEMA_ROLLBACK_ASSERTION_PRECHECK_FAILED",
    assertionFailed: "SCHEMA_ROLLBACK_ASSERTION_FAILED",
    rollbackFailed: "SCHEMA_ROLLBACK_ASSERTION_ROLLBACK_FAILED",
    roleSetupFailed: "SCHEMA_ROLLBACK_ASSERTION_ROLE_SETUP_FAILED",
    roleConnectionFailed: "SCHEMA_ROLLBACK_ASSERTION_ROLE_CONNECTION_FAILED",
    roleCleanupFailed: "SCHEMA_ROLLBACK_ASSERTION_ROLE_CLEANUP_FAILED",
    postcheckFailed: "SCHEMA_ROLLBACK_ASSERTION_POSTCHECK_FAILED",
    internalFailed: "SCHEMA_ROLLBACK_ASSERTION_INTERNAL_FAILED",
  });

const FIXED_ERROR_CODES = new Set(
  Object.values(
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES,
  ),
);
const FIXED_IDENTITY_ERROR_CODES = new Set(Object.values(IDENTITY_ERRORS));
const FIXED_FAILURE_STAGES = new Set([
  RUNNER_FAILURE_STAGE,
  ...ASSERTION_STAGE_CODES,
]);

export class CommunicationNotePreviewSchemaRollbackAssertionError extends Error {
  constructor(code, stage = RUNNER_FAILURE_STAGE) {
    const fixedCode = FIXED_ERROR_CODES.has(code)
      ? code
      : COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
          .internalFailed;
    const fixedStage = FIXED_FAILURE_STAGES.has(stage)
      ? stage
      : RUNNER_FAILURE_STAGE;
    super(fixedCode);
    this.name = "CommunicationNotePreviewSchemaRollbackAssertionError";
    this.code = fixedCode;
    this.stage = fixedStage;
  }
}

function fail(code, stage) {
  throw new CommunicationNotePreviewSchemaRollbackAssertionError(code, stage);
}

function assert(condition, code, stage) {
  if (!condition) fail(code, stage);
}

function errorAtAssertionStage(error, stage) {
  const errorCode = safeOwnErrorCode(error);
  return new CommunicationNotePreviewSchemaRollbackAssertionError(
    error instanceof CommunicationNotePreviewSchemaRollbackAssertionError &&
        FIXED_ERROR_CODES.has(errorCode)
      ? errorCode
      : COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
          .internalFailed,
    stage,
  );
}

export function formatCommunicationNotePreviewSchemaRollbackAssertionFailure(
  error,
) {
  let stage = RUNNER_FAILURE_STAGE;
  let errorType =
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
      .internalFailed;
  if (error instanceof CommunicationNotePreviewSchemaRollbackAssertionError) {
    const errorStage = safeOwnErrorStage(error);
    const errorCode = safeOwnErrorCode(error);
    stage = FIXED_FAILURE_STAGES.has(errorStage)
      ? errorStage
      : RUNNER_FAILURE_STAGE;
    errorType = FIXED_ERROR_CODES.has(errorCode)
      ? errorCode
      : COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
          .internalFailed;
  } else if (
    error instanceof CommunicationNotePreviewRunnerTerminalIdentityPolicyError
  ) {
    const errorCode = safeOwnErrorCode(error);
    if (FIXED_IDENTITY_ERROR_CODES.has(errorCode)) errorType = errorCode;
  }
  return JSON.stringify({ stage, errorType });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function basename(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function safeOwnErrorCode(error) {
  if (!error || typeof error !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor && "value" in descriptor &&
      typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function safeOwnErrorStage(error) {
  if (!error || typeof error !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(error, "stage");
  return descriptor && "value" in descriptor &&
      typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

async function closeQuietly(client) {
  try {
    await client?.end();
  } catch {
    // A fixed cleanup error, never a driver message, is the only output.
  }
}

export function normalizeCommunicationNotePreviewRollbackAssertionSql(raw) {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    Buffer.byteLength(raw, "utf8") > MAXIMUM_ASSERTION_BYTES
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .sqlPolicyFailed,
    );
  }
  const metaCommands = raw.match(/^\s*\\[^\r\n]*$/gm) ?? [];
  if (
    metaCommands.some(
      (line) => !/^\s*\\set\s+ON_ERROR_STOP\s+on\s*$/.test(line),
    )
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .sqlPolicyFailed,
    );
  }
  const sql = raw.replace(
    /^\s*\\set\s+ON_ERROR_STOP\s+on\s*\r?$/gm,
    "",
  );
  if (/^\s*\\/m.test(sql)) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .sqlPolicyFailed,
    );
  }
  const lines = sql.split(/\r?\n/).map((line) => line.trim().toLowerCase());
  const begins = lines.filter((line) =>
    /^begin(?:\s+isolation\s+level\s+(?:read\s+committed|repeatable\s+read|serializable))?\s*;$/.test(
      line,
    )
  ).length;
  const rollbacks = lines.filter((line) => /^rollback\s*;$/.test(line)).length;
  const commits = lines.filter((line) => /^commit\s*;$/.test(line)).length;
  if (begins < 1 || begins !== rollbacks || commits !== 0) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .sqlPolicyFailed,
    );
  }
  return sql;
}

export async function loadCommunicationNotePreviewRollbackAssertions(
  fileReader = readFile,
) {
  if (typeof fileReader !== "function") {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .manifestFailed,
    );
  }
  const scripts = [];
  const manifestLines = [];
  for (const [index, entry] of ASSERTION_MANIFEST.entries()) {
    if (entry.stage !== ASSERTION_STAGE_CODES[index]) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
          .manifestFailed,
      );
    }
    let raw;
    try {
      raw = await fileReader(
        new URL(`../../${entry.path}`, import.meta.url),
        "utf8",
      );
    } catch {
      fail(
        COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
          .manifestFailed,
        entry.stage,
      );
    }
    if (typeof raw !== "string" || sha256(raw) !== entry.sha256) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
          .manifestFailed,
        entry.stage,
      );
    }
    manifestLines.push(`${basename(entry.path)}\t${entry.sha256}\n`);
    let sql;
    try {
      sql = normalizeCommunicationNotePreviewRollbackAssertionSql(raw);
    } catch (error) {
      throw errorAtAssertionStage(error, entry.stage);
    }
    scripts.push(Object.freeze({
      stage: entry.stage,
      sql,
      migrationEntryRole: entry.migrationEntryRole === true,
    }));
  }
  if (
    scripts.length !== 18 ||
    sha256(manifestLines.join("")) !== ASSERTION_MANIFEST_SHA256 ||
    scripts.filter((script) => script.migrationEntryRole).length !== 1
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .manifestFailed,
    );
  }
  return Object.freeze({
    scripts: Object.freeze(scripts),
    fileCount: scripts.length,
    manifestSha256: ASSERTION_MANIFEST_SHA256,
  });
}

export async function readCommunicationNotePreviewPinnedCa(
  sslRootCertPath,
  expectedSha256,
  fileReader = readFile,
) {
  let buffer;
  let text;
  try {
    const certificate = await fileReader(sslRootCertPath);
    buffer = Buffer.isBuffer(certificate)
      ? certificate
      : Buffer.from(certificate);
    text = buffer.toString("utf8");
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .caFailed,
    );
  }
  if (
    buffer.length === 0 ||
    buffer.length > IDENTITY_POLICY.maximumCaBytes ||
    sha256(buffer) !== expectedSha256 ||
    !text.includes("-----BEGIN CERTIFICATE-----") ||
    !text.includes("-----END CERTIFICATE-----")
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .caFailed,
    );
  }
  return text;
}

function createConnectionConfig(candidate, sslRootCertificate, overrides = {}) {
  return Object.freeze({
    host: candidate.host,
    port: candidate.port,
    database: candidate.database,
    user: overrides.user ?? candidate.user,
    password: overrides.password ?? candidate.password,
    application_name: ASSERTION_APPLICATION_NAME,
    connectionTimeoutMillis: 10_000,
    query_timeout: 120_000,
    options: "-c row_security=on",
    client_encoding: "UTF8",
    sslnegotiation: "postgres",
    ssl: Object.freeze({
      ca: sslRootCertificate,
      rejectUnauthorized: true,
    }),
  });
}

export function assertCommunicationNotePreviewAssertionTls(client) {
  const stream = client?.connection?.stream;
  if (
    stream?.encrypted !== true ||
    stream?.authorized !== true ||
    stream?.authorizationError != null
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .tlsFailed,
    );
  }
  return Object.freeze({ encrypted: true, authorized: true });
}

async function connectOne(Client, config, connectionFailureCode) {
  const client = new Client(config);
  const backgroundState = { failed: false };
  if (typeof client?.on === "function") {
    client.on("error", () => {
      backgroundState.failed = true;
    });
  }
  CLIENT_BACKGROUND_STATES.set(client, backgroundState);
  try {
    await client.connect();
  } catch (error) {
    await closeQuietly(client);
    if (connectionFailureCode) fail(connectionFailureCode);
    throw error;
  }
  try {
    assertCommunicationNotePreviewAssertionTls(client);
  } catch (error) {
    await closeQuietly(client);
    throw error;
  }
  return client;
}

function assertBackgroundConnectionHealthy(client) {
  if (CLIENT_BACKGROUND_STATES.get(client)?.failed === true) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .connectionFailed,
    );
  }
}

export async function connectCommunicationNotePreviewAssertionAdmin(
  Client,
  candidates,
  sslRootCertificate,
) {
  if (typeof Client !== "function") {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .driverInvalid,
    );
  }
  let direct;
  try {
    direct = await connectOne(
      Client,
      createConnectionConfig(candidates.direct, sslRootCertificate),
    );
    return Object.freeze({
      client: direct,
      candidate: candidates.direct,
      mode: "direct",
    });
  } catch (error) {
    if (error instanceof CommunicationNotePreviewSchemaRollbackAssertionError) {
      throw error;
    }
    if (!DIRECT_UNREACHABLE_CODES.has(safeOwnErrorCode(error))) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
          .connectionFailed,
      );
    }
  }
  const session = await connectOne(
    Client,
    createConnectionConfig(candidates.sessionPooler, sslRootCertificate),
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
      .connectionFailed,
  );
  return Object.freeze({
    client: session,
    candidate: candidates.sessionPooler,
    mode: "session_pooler_fallback",
  });
}

async function rollbackAfterFailure(client) {
  try {
    await client.query("rollback");
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .rollbackFailed,
    );
  }
}

async function configureAssertionSession(client) {
  try {
    await client.query("set statement_timeout = '120s'");
    await client.query("set lock_timeout = '3s'");
    await client.query("set idle_in_transaction_session_timeout = '135s'");
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .targetFailed,
    );
  }
}

async function assertTarget(client, expectedPostgresMajor) {
  let result;
  try {
    result = await client.query({
      text: `
        select
          current_database() = 'postgres' as database_ok,
          current_user = 'postgres' and session_user = 'postgres'
            as base_identity_ok,
          current_setting('application_name') = $2::text
            as application_name_ok,
          current_setting('server_version_num')::integer / 10000 = $1::integer
            as postgres_major_ok,
          current_setting('row_security') = 'on' as row_security_ok,
          exists (
            select 1 from pg_catalog.pg_stat_ssl as ssl_state
            where ssl_state.pid = pg_catalog.pg_backend_pid()
              and ssl_state.ssl
          ) as ssl_ok
      `,
      values: [expectedPostgresMajor, ASSERTION_APPLICATION_NAME],
    });
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .targetFailed,
    );
  }
  const row = result.rows[0];
  assert(
    result.rowCount === 1 &&
      row?.database_ok === true &&
      row.base_identity_ok === true &&
      row.application_name_ok === true &&
      row.postgres_major_ok === true &&
      row.row_security_ok === true &&
      row.ssl_ok === true,
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
      .targetFailed,
  );
}

const LEDGER_ZERO_SQL = `
  select
    (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_authorizations) = 0
      as authorizations_zero,
    (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_authorization_revocations) = 0
      as revocations_zero,
    (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_claims) = 0
      as claims_zero,
    (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_dispatch_reservations) = 0
      as reservations_zero,
    (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_dispatch_receipts) = 0
      as receipts_zero,
    (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_runner_terminals) = 0
      as runner_terminals_zero
`;

async function assertLedgersZero(client, code) {
  let result;
  try {
    result = await client.query(LEDGER_ZERO_SQL);
  } catch {
    fail(code);
  }
  const row = result.rows[0];
  assert(
    result.rowCount === 1 &&
      row?.authorizations_zero === true &&
      row.revocations_zero === true &&
      row.claims_zero === true &&
      row.reservations_zero === true &&
      row.receipts_zero === true &&
      row.runner_terminals_zero === true,
    code,
  );
}

async function readMembershipSnapshot(client) {
  let result;
  try {
    result = await client.query(`
      select
        membership.roleid::text as role_oid,
        membership.member::text as member_oid,
        membership.grantor::text as grantor_oid,
        membership.admin_option,
        membership.inherit_option,
        membership.set_option
      from pg_catalog.pg_auth_members as membership
      where membership.member = current_user::pg_catalog.regrole
      order by membership.roleid, membership.grantor
    `);
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .postcheckFailed,
    );
  }
  return JSON.stringify(result.rows);
}

async function runRollbackAssertion(client, sql, identity) {
  try {
    await client.query(sql);
  } catch {
    await rollbackAfterFailure(client);
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .assertionFailed,
    );
  }
  let result;
  try {
    result = await client.query({
      text: `
        select
          current_user = $1::text as current_user_ok,
          session_user = $2::text as session_user_ok,
          current_setting('transaction_isolation') = 'read committed'
            as isolation_ok
      `,
      values: [identity.currentUser, identity.sessionUser],
    });
  } catch {
    await rollbackAfterFailure(client);
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .rollbackFailed,
    );
  }
  const row = result.rows[0];
  assert(
    result.rowCount === 1 &&
      row?.current_user_ok === true &&
      row.session_user_ok === true &&
      row.isolation_ok === true,
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
      .rollbackFailed,
  );
}

function assertionRoleNames(nonce) {
  if (!ASSERTION_NONCE_PATTERN.test(nonce)) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .internalFailed,
    );
  }
  const transportRole = `${ASSERTION_TRANSPORT_ROLE_PREFIX}${nonce}`;
  const actorRole = `${ASSERTION_ACTOR_ROLE_PREFIX}${nonce}`;
  if (transportRole.length > 63 || actorRole.length > 63) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .internalFailed,
    );
  }
  return Object.freeze({ transportRole, actorRole });
}

const ROLE_SETUP_SQL = `
do $setup$
declare
  v_transport text := pg_catalog.current_setting(
    'careslink.assertion_runner.transport_role'
  );
  v_actor text := pg_catalog.current_setting(
    'careslink.assertion_runner.actor_role'
  );
  v_password text := pg_catalog.current_setting(
    'careslink.assertion_runner.transport_password'
  );
  v_expires_at text := pg_catalog.current_setting(
    'careslink.assertion_runner.transport_expires_at'
  );
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-schema-rollback-assertions'
    or pg_catalog.current_setting('password_encryption') <> 'scram-sha-256'
    or v_transport !~ '^careslink_m1gh_assert_transport_[a-f0-9]{16}$'
    or v_actor !~ '^careslink_m1gh_assert_actor_[a-f0-9]{16}$'
    or pg_catalog.length(v_password) < 32
    or pg_catalog.to_regrole(v_transport) is not null
    or pg_catalog.to_regrole(v_actor) is not null
  then
    raise exception 'SCHEMA_ROLLBACK_ASSERTION_ROLE_SETUP_FAILED';
  end if;
  execute pg_catalog.format(
    'create role %I with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 1 password %L valid until %L',
    v_transport, v_password, v_expires_at
  );
  execute pg_catalog.format(
    'create role %I with nologin nosuperuser nocreatedb createrole noinherit noreplication nobypassrls connection limit -1',
    v_actor
  );
  execute pg_catalog.format(
    'grant %I to %I with admin false, inherit false, set true granted by %I',
    v_actor, v_transport, current_user
  );
end
$setup$;
`;

async function createAssertionRoles(admin, roles, password, expiresAt) {
  let transactionOpen = false;
  try {
    await admin.query("begin isolation level read committed");
    transactionOpen = true;
    await admin.query("set local password_encryption = 'scram-sha-256'");
    for (const [name, value] of [
      ["careslink.assertion_runner.transport_role", roles.transportRole],
      ["careslink.assertion_runner.actor_role", roles.actorRole],
      ["careslink.assertion_runner.transport_password", password],
      ["careslink.assertion_runner.transport_expires_at", expiresAt],
    ]) {
      await admin.query({
        text: "select pg_catalog.set_config($1::text, $2::text, true)",
        values: [name, value],
      });
    }
    await admin.query(ROLE_SETUP_SQL);
    await admin.query("commit");
    transactionOpen = false;
  } catch {
    if (transactionOpen) await rollbackAfterFailure(admin);
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleSetupFailed,
    );
  }
  let result;
  try {
    result = await admin.query({
      text: `
        select
          transport.rolcanlogin and not transport.rolsuper
            and not transport.rolcreatedb and not transport.rolcreaterole
            and not transport.rolinherit and not transport.rolreplication
            and not transport.rolbypassrls and transport.rolconnlimit = 1
              as transport_ok,
          not actor.rolcanlogin and not actor.rolsuper
            and not actor.rolcreatedb and actor.rolcreaterole
            and not actor.rolinherit and not actor.rolreplication
            and not actor.rolbypassrls as actor_ok,
          membership.roleid = actor.oid
            and membership.member = transport.oid
            and not membership.admin_option
            and not membership.inherit_option
            and membership.set_option as membership_ok
        from pg_catalog.pg_roles as transport
        join pg_catalog.pg_roles as actor on actor.rolname = $2::text
        join pg_catalog.pg_auth_members as membership
          on membership.roleid = actor.oid
          and membership.member = transport.oid
        where transport.rolname = $1::text
      `,
      values: [roles.transportRole, roles.actorRole],
    });
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleSetupFailed,
    );
  }
  const row = result.rows[0];
  assert(
    result.rowCount === 1 &&
      row?.transport_ok === true &&
      row.actor_ok === true &&
      row.membership_ok === true,
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
      .roleSetupFailed,
  );
}

async function connectAssertionTransport(
  Client,
  candidate,
  sslRootCertificate,
  expectedBranchRef,
  roles,
  password,
) {
  const user = candidate.mode === "session_pooler"
    ? `${roles.transportRole}.${expectedBranchRef}`
    : roles.transportRole;
  try {
    return await connectOne(
      Client,
      createConnectionConfig(candidate, sslRootCertificate, {
        user,
        password,
      }),
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleConnectionFailed,
    );
  } catch (error) {
    if (error instanceof CommunicationNotePreviewSchemaRollbackAssertionError) {
      throw error;
    }
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleConnectionFailed,
    );
  }
}

async function quiesceAssertionTransport(admin, transportRole) {
  try {
    await admin.query({
      text: "select pg_catalog.set_config('careslink.assertion_runner.transport_role', $1::text, false)",
      values: [transportRole],
    });
    await admin.query(`do $quiesce$
      begin
        if current_user <> 'postgres'
          or session_user <> 'postgres'
          or pg_catalog.current_database() <> 'postgres'
          or pg_catalog.current_setting('application_name') <>
            'careslink-preview-schema-rollback-assertions'
          or pg_catalog.current_setting(
            'careslink.assertion_runner.transport_role'
          ) !~ '^careslink_m1gh_assert_transport_[a-f0-9]{16}$'
        then
          raise exception 'SCHEMA_ROLLBACK_ASSERTION_ROLE_CLEANUP_FAILED';
        end if;
        execute pg_catalog.format(
          'alter role %I nologin',
          pg_catalog.current_setting(
            'careslink.assertion_runner.transport_role'
          )
        );
      end
      $quiesce$`);
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleCleanupFailed,
    );
  }
}

async function assertionRolePresence(admin, roles) {
  try {
    const result = await admin.query({
      text: `select
        pg_catalog.to_regrole($1::text) is not null as transport_present,
        pg_catalog.to_regrole($2::text) is not null as actor_present`,
      values: [roles.transportRole, roles.actorRole],
    });
    return Object.freeze({
      transport: result.rows[0]?.transport_present === true,
      actor: result.rows[0]?.actor_present === true,
    });
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleCleanupFailed,
    );
  }
}

async function drainAssertionTransport(admin, transportRole) {
  let result;
  try {
    result = await admin.query({
      text: `
        select pid, state, application_name
        from pg_catalog.pg_stat_activity
        where usename = $1::text
          and backend_type = 'client backend'
          and pid <> pg_catalog.pg_backend_pid()
      `,
      values: [transportRole],
    });
    for (const backend of result.rows) {
      if (
        backend.state !== "idle" ||
        (backend.application_name !== "Supavisor" &&
          backend.application_name !== ASSERTION_APPLICATION_NAME)
      ) {
        fail(
          COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
            .roleCleanupFailed,
        );
      }
      const terminated = await admin.query({
        text: "select pg_catalog.pg_terminate_backend($1::integer) as terminated",
        values: [backend.pid],
      });
      assert(
        terminated.rows[0]?.terminated === true,
        COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
          .roleCleanupFailed,
      );
    }
  } catch (error) {
    if (error instanceof CommunicationNotePreviewSchemaRollbackAssertionError) {
      throw error;
    }
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleCleanupFailed,
    );
  }
}

const ROLE_CLEANUP_SQL = `
do $cleanup$
declare
  v_transport text := pg_catalog.current_setting(
    'careslink.assertion_runner.transport_role'
  );
  v_actor text := pg_catalog.current_setting(
    'careslink.assertion_runner.actor_role'
  );
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-schema-rollback-assertions'
    or v_transport !~ '^careslink_m1gh_assert_transport_[a-f0-9]{16}$'
    or v_actor !~ '^careslink_m1gh_assert_actor_[a-f0-9]{16}$'
  then
    raise exception 'SCHEMA_ROLLBACK_ASSERTION_ROLE_CLEANUP_FAILED';
  end if;
  if pg_catalog.to_regrole(v_transport) is not null
    and pg_catalog.to_regrole(v_actor) is not null
  then
    execute pg_catalog.format(
      'revoke %I from %I granted by %I',
      v_actor, v_transport, current_user
    );
  end if;
  if pg_catalog.to_regrole(v_transport) is not null then
    execute pg_catalog.format('drop role %I', v_transport);
  end if;
  if pg_catalog.to_regrole(v_actor) is not null then
    execute pg_catalog.format('drop role %I', v_actor);
  end if;
end
$cleanup$;
`;

async function dropAssertionRoles(admin, roles) {
  let transactionOpen = false;
  try {
    await admin.query("reset role");
    await admin.query("begin isolation level read committed");
    transactionOpen = true;
    for (const [name, value] of [
      ["careslink.assertion_runner.transport_role", roles.transportRole],
      ["careslink.assertion_runner.actor_role", roles.actorRole],
    ]) {
      await admin.query({
        text: "select pg_catalog.set_config($1::text, $2::text, true)",
        values: [name, value],
      });
    }
    await admin.query(ROLE_CLEANUP_SQL);
    await admin.query("commit");
    transactionOpen = false;
  } catch {
    if (transactionOpen) {
      try {
        await admin.query("rollback");
      } catch {
        // The fixed cleanup failure below remains the only output.
      }
    }
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleCleanupFailed,
    );
  }
  let residue;
  try {
    residue = await admin.query({
      text: `select
        pg_catalog.to_regrole($1::text) is null
          and pg_catalog.to_regrole($2::text) is null
          and pg_catalog.to_regrole('careslink_migration_restore_test_owner') is null
          and not exists (
            select 1 from pg_catalog.pg_stat_activity
            where usename in ($1::text, $2::text)
              and backend_type = 'client backend'
          ) as absent`,
      values: [roles.transportRole, roles.actorRole],
    });
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .roleCleanupFailed,
    );
  }
  assert(
    residue.rows[0]?.absent === true,
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
      .roleCleanupFailed,
  );
}

async function cleanupAssertionRolesWithAdmin(admin, roles) {
  const presence = await assertionRolePresence(admin, roles);
  if (presence.transport) {
    await quiesceAssertionTransport(admin, roles.transportRole);
    await drainAssertionTransport(admin, roles.transportRole);
  }
  await dropAssertionRoles(admin, roles);
}

async function runMigrationEntryRoleAssertion({
  Client,
  admin,
  connectionCandidates,
  candidate,
  sslRootCertificate,
  expectedBranchRef,
  expectedPostgresMajor,
  sql,
  nonce,
  password,
}) {
  const roles = assertionRoleNames(nonce);
  let transport;
  let roleSetupAttempted = false;
  let primaryFailure;
  let cleanupAdmin = admin;
  let reconnectedAdmin;
  let cleanupFailure;
  try {
    roleSetupAttempted = true;
    await createAssertionRoles(
      admin,
      roles,
      password,
      new Date(Date.now() + IDENTITY_POLICY.runtimeValidityMs).toISOString(),
    );
    transport = await connectAssertionTransport(
      Client,
      candidate,
      sslRootCertificate,
      expectedBranchRef,
      roles,
      password,
    );
    await configureAssertionSession(transport);
    await transport.query(`set role "${roles.actorRole}"`);
    await runRollbackAssertion(transport, sql, {
      currentUser: roles.actorRole,
      sessionUser: roles.transportRole,
    });
    await transport.query("reset role");
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (roleSetupAttempted) {
      try {
        const presence = await assertionRolePresence(admin, roles);
        if (presence.transport) {
          await quiesceAssertionTransport(admin, roles.transportRole);
        }
      } catch {
        // The definitive cleanup below retries this exact transition.
      }
    }
    if (transport) {
      try {
        await transport.query("rollback");
        await transport.query("reset role");
      } catch {
        // Closing the session rolls back any remaining transaction.
      }
      await closeQuietly(transport);
      transport = undefined;
    }
    if (roleSetupAttempted) {
      try {
        await cleanupAssertionRolesWithAdmin(cleanupAdmin, roles);
      } catch {
        await closeQuietly(cleanupAdmin);
        try {
          const reconnected =
            await connectCommunicationNotePreviewAssertionAdmin(
              Client,
              connectionCandidates,
              sslRootCertificate,
            );
          reconnectedAdmin = reconnected.client;
          cleanupAdmin = reconnectedAdmin;
          await configureAssertionSession(cleanupAdmin);
          await assertTarget(cleanupAdmin, expectedPostgresMajor);
          await cleanupAssertionRolesWithAdmin(cleanupAdmin, roles);
        } catch {
          cleanupFailure = new CommunicationNotePreviewSchemaRollbackAssertionError(
            COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
              .roleCleanupFailed,
          );
        }
      }
    }
  }
  if (cleanupFailure) {
    await closeQuietly(reconnectedAdmin);
    throw cleanupFailure;
  }
  if (primaryFailure) {
    await closeQuietly(reconnectedAdmin);
    throw primaryFailure;
  }
  return reconnectedAdmin ?? admin;
}

async function assertNoTemporaryRoleResidue(client) {
  let result;
  try {
    result = await client.query({
      text: `select not exists (
        select 1 from pg_catalog.pg_roles
        where rolname like $1::text
          or rolname like $2::text
          or rolname like $3::text
          or rolname = 'careslink_migration_restore_test_owner'
      ) as absent`,
      values: [
        `${ASSERTION_TRANSPORT_ROLE_PREFIX}%`,
        `${ASSERTION_ACTOR_ROLE_PREFIX}%`,
        `${IDENTITY_POLICY.runtimeRolePrefix}%`,
      ],
    });
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .postcheckFailed,
    );
  }
  assert(
    result.rows[0]?.absent === true,
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
      .postcheckFailed,
  );
}

export async function runCommunicationNotePreviewSchemaRollbackAssertions({
  Client,
  connectionCandidates,
  sslRootCertificate,
  expectedBranchRef,
  expectedPostgresMajor,
  assertionBundle,
  roleNonce,
  rolePassword,
}) {
  if (
    typeof Client !== "function" ||
    typeof sslRootCertificate !== "string" ||
    sslRootCertificate.length === 0 ||
    !/^[a-z0-9]{20}$/.test(expectedBranchRef ?? "") ||
    expectedBranchRef === IDENTITY_POLICY.productionProjectRef ||
    !new Set([16, 17]).has(expectedPostgresMajor) ||
    !ASSERTION_NONCE_PATTERN.test(roleNonce ?? "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(rolePassword ?? "") ||
    !assertionBundle ||
    assertionBundle.fileCount !== 18 ||
    assertionBundle.manifestSha256 !== ASSERTION_MANIFEST_SHA256 ||
    !Array.isArray(assertionBundle.scripts) ||
    assertionBundle.scripts.length !== 18 ||
    assertionBundle.scripts.some(
      (script, index) => script?.stage !== ASSERTION_STAGE_CODES[index],
    )
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .driverInvalid,
    );
  }
  let admin;
  let passedCount = 0;
  try {
    const connected = await connectCommunicationNotePreviewAssertionAdmin(
      Client,
      connectionCandidates,
      sslRootCertificate,
    );
    admin = connected.client;
    await configureAssertionSession(admin);
    await assertTarget(admin, expectedPostgresMajor);
    await assertLedgersZero(
      admin,
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .precheckFailed,
    );
    await assertNoTemporaryRoleResidue(admin);
    const baseIdentity = await admin.query(
      "select current_user, session_user",
    );
    const currentUser = baseIdentity.rows[0]?.current_user;
    const sessionUser = baseIdentity.rows[0]?.session_user;
    assert(
      baseIdentity.rowCount === 1 &&
        typeof currentUser === "string" &&
        currentUser === sessionUser,
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .targetFailed,
    );
    const membershipBefore = await readMembershipSnapshot(admin);

    for (const script of assertionBundle.scripts) {
      try {
        if (script.migrationEntryRole) {
          admin = await runMigrationEntryRoleAssertion({
            Client,
            admin,
            connectionCandidates,
            candidate: connected.candidate,
            sslRootCertificate,
            expectedBranchRef,
            expectedPostgresMajor,
            sql: script.sql,
            nonce: roleNonce,
            password: rolePassword,
          });
        } else {
          await runRollbackAssertion(admin, script.sql, {
            currentUser,
            sessionUser,
          });
        }
      } catch (error) {
        throw errorAtAssertionStage(error, script.stage);
      }
      passedCount += 1;
    }

    await assertLedgersZero(
      admin,
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .postcheckFailed,
    );
    await assertNoTemporaryRoleResidue(admin);
    const membershipAfter = await readMembershipSnapshot(admin);
    assert(
      membershipAfter === membershipBefore,
      COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
        .postcheckFailed,
    );
    assertBackgroundConnectionHealthy(admin);
  } finally {
    await closeQuietly(admin);
  }
  assert(
    passedCount === 18,
    COMMUNICATION_NOTE_PREVIEW_SCHEMA_ROLLBACK_ASSERTION_ERROR_CODES
      .postcheckFailed,
  );
  return Object.freeze({
    fileCount: 18,
    manifestSha256: ASSERTION_MANIFEST_SHA256,
    passedCount: 18,
  });
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > IDENTITY_POLICY.maximumStdinBytes) {
      throw new CommunicationNotePreviewRunnerTerminalIdentityPolicyError(
        IDENTITY_ERRORS.stdinInvalid,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

async function main() {
  // Private pipe contract: `supabase branches get ... -o json | node ...`.
  const args = parseCommunicationNotePreviewRunnerTerminalIdentityArguments(
    process.argv.slice(2),
  );
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new CommunicationNotePreviewRunnerTerminalIdentityPolicyError(
      IDENTITY_ERRORS.tlsDenied,
    );
  }
  if (
    Object.entries(process.env).some(
      ([key, value]) => /^PG[A-Z0-9_]*$/.test(key) && value,
    )
  ) {
    throw new CommunicationNotePreviewRunnerTerminalIdentityPolicyError(
      IDENTITY_ERRORS.databaseTargetDenied,
    );
  }
  const branchJson = await readBoundedStdin();
  const target = extractCommunicationNotePreviewBranchDatabaseTarget(
    branchJson,
    { expectedBranchRef: args.expectedBranchRef },
  );
  const sslRootCertificate = await readCommunicationNotePreviewPinnedCa(
    args.sslRootCertPath,
    args.expectedSslRootCertSha256,
  );
  const assertionBundle =
    await loadCommunicationNotePreviewRollbackAssertions();
  const pgModule = await import("pg");
  const Client = pgModule.Client ?? pgModule.default?.Client;
  let rolePassword = randomBytes(
    IDENTITY_POLICY.runtimePasswordBytes,
  ).toString("base64url");
  try {
    const evidence =
      await runCommunicationNotePreviewSchemaRollbackAssertions({
        Client,
        connectionCandidates: target.takeAdminConnectionCandidates(),
        sslRootCertificate,
        expectedBranchRef: args.expectedBranchRef,
        expectedPostgresMajor: args.expectedPostgresMajor,
        assertionBundle,
        roleNonce: randomBytes(8).toString("hex"),
        rolePassword,
      });
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    rolePassword = undefined;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `${formatCommunicationNotePreviewSchemaRollbackAssertionFailure(error)}\n`,
    );
    process.exitCode = 1;
  });
}
