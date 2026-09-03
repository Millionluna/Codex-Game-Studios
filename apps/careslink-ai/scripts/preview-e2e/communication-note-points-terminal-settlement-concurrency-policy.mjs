const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SOCKET_DIRECTORY_PATTERN =
  /^\/private\/tmp\/careslink-points-terminal-pg16\.[A-Za-z0-9]{6,}\/socket$/;

export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DATABASE_URL_ENV =
  "CARESLINK_V1_COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_DATABASE_URL";
export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE =
  "careslink_v1_cn_points_terminal_runner";
export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA =
  "careslink_v1_cn_points_terminal_support";
export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER =
  "2026-09-02.local-pg16.communication-terminal.1";

export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY = Object.freeze({
  version: COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
  requiredScheme: "postgresql:",
  connectionUriHost: "localhost",
  requiredDatabase: "postgres",
  requiredRole: COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
  expectedPostgresMajor: 16,
  deniedPort: 5432,
  minimumPort: 49_152,
  maximumPort: 65_535,
  maximumUrlLength: 768,
  deniedEnvironmentNames: Object.freeze([
    "DATABASE_URL",
    "DIRECT_URL",
    "PGDATABASE",
    "PGAPPNAME",
    "PGHOST",
    "PGHOSTADDR",
    "PGOPTIONS",
    "PGPASSFILE",
    "PGPASS_NO_DEESCAPE",
    "PGPASSWORD",
    "PGPORT",
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGSSLMODE",
    "PGUSER",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "SUPABASE_DB_URL",
    "SUPABASE_DATABASE_URL",
    "SUPABASE_POOLER_URL",
  ]),
});

export const COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES =
  Object.freeze({
    invalidInput:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_POLICY_INVALID",
    urlMissing:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_DATABASE_URL_MISSING",
    urlInvalid:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_DATABASE_URL_INVALID",
    targetDenied:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_TARGET_DENIED",
    roleDenied:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ROLE_DENIED",
    credentialsDenied:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CREDENTIALS_DENIED",
    databaseDenied:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_DATABASE_DENIED",
    portDenied:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_PORT_DENIED",
    queryDenied:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_QUERY_DENIED",
    environmentDenied:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_ENVIRONMENT_DENIED",
    preflightFailed:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_PREFLIGHT_FAILED",
    backendIdentityFailed:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_BACKEND_IDENTITY_FAILED",
    blockerFailed:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_LOCK_NOT_OBSERVED",
    sqlPolicyInvalid:
      "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SQL_POLICY_INVALID",
  });

const POLICY_ERROR_CODE_SET = new Set(
  Object.values(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES),
);

export class CommunicationNotePointsTerminalSettlementConcurrencyPolicyError extends Error {
  constructor(code) {
    const fixedCode = POLICY_ERROR_CODE_SET.has(code)
      ? code
      : COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.invalidInput;
    super(fixedCode);
    this.name = "CommunicationNotePointsTerminalSettlementConcurrencyPolicyError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePointsTerminalSettlementConcurrencyPolicyError(code);
}

function parseUrl(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY.maximumUrlLength ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.urlInvalid);
  }

  try {
    return new URL(value);
  } catch {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.urlInvalid);
  }
}

/**
 * Accepts one exact passwordless Unix-socket URL for an isolated local PG16
 * cluster. `localhost` is only the URI authority; the sole query parameter is
 * the validated private socket directory used by node-postgres.
 */
export function validateCommunicationNotePointsTerminalSettlementDatabaseUrl(value) {
  const policy = COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY;
  const url = parseUrl(value);

  if (
    url.protocol !== policy.requiredScheme ||
    url.hostname !== policy.connectionUriHost
  ) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.targetDenied);
  }
  if (url.username !== policy.requiredRole) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.roleDenied);
  }
  if (url.password.length !== 0) {
    fail(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.credentialsDenied,
    );
  }
  if (url.pathname !== `/${policy.requiredDatabase}`) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.databaseDenied);
  }
  if (value.includes("#")) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.queryDenied);
  }

  const parameters = [...url.searchParams.entries()];
  const socketDirectory = url.searchParams.get("host");
  if (
    parameters.length !== 1 ||
    parameters[0]?.[0] !== "host" ||
    typeof socketDirectory !== "string" ||
    !SOCKET_DIRECTORY_PATTERN.test(socketDirectory) ||
    socketDirectory.includes("..") ||
    CONTROL_CHARACTER_PATTERN.test(socketDirectory)
  ) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.queryDenied);
  }

  const port = Number(url.port);
  if (
    !Number.isSafeInteger(port) ||
    port < policy.minimumPort ||
    port > policy.maximumPort ||
    port === policy.deniedPort
  ) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.portDenied);
  }

  const canonical =
    `${policy.requiredScheme}//${policy.requiredRole}@` +
    `${policy.connectionUriHost}:${port}/${policy.requiredDatabase}` +
    `?host=${encodeURIComponent(socketDirectory)}`;
  if (value !== canonical) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.urlInvalid);
  }

  return Object.freeze({
    ok: true,
    policyVersion: policy.version,
    transport: "unix-domain-socket",
    socketDirectory,
    port,
    database: policy.requiredDatabase,
    databaseRole: policy.requiredRole,
    postgresMajor: policy.expectedPostgresMajor,
    sslMode: "disabled",
    passwordMaterial: "absent",
    hostedTarget: false,
  });
}

export function readCommunicationNotePointsTerminalSettlementEnvironment(env) {
  if (env === null || typeof env !== "object") {
    fail(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.environmentDenied,
    );
  }

  for (const name of COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY
    .deniedEnvironmentNames) {
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      fail(
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.environmentDenied,
      );
    }
  }

  const databaseUrl =
    env[COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DATABASE_URL_ENV];
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.urlMissing);
  }

  return Object.freeze({
    databaseUrl,
    target: validateCommunicationNotePointsTerminalSettlementDatabaseUrl(databaseUrl),
  });
}

export function assertCommunicationNotePointsTerminalSettlementPreflight(row, target) {
  const policy = COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY;
  if (
    row === null ||
    typeof row !== "object" ||
    target === null ||
    typeof target !== "object" ||
    row.server_addr !== null ||
    Number(row.server_port) !== target.port ||
    row.database_name !== policy.requiredDatabase ||
    row.session_user_name !== policy.requiredRole ||
    row.current_user_name !== policy.requiredRole ||
    Number(row.server_version_num) < 160_000 ||
    Number(row.server_version_num) >= 170_000 ||
    !Number.isSafeInteger(Number(row.backend_pid)) ||
    Number(row.backend_pid) <= 0 ||
    row.ssl_in_use !== false ||
    row.concurrency_marker !== policy.version
  ) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.preflightFailed);
  }

  return Object.freeze({
    ok: true,
    backendPid: Number(row.backend_pid),
    serverVersionNum: Number(row.server_version_num),
    port: Number(row.server_port),
    socketDirectory: target.socketDirectory,
    transport: "unix-domain-socket",
    sslInUse: false,
    marker: row.concurrency_marker,
  });
}

export function assertCommunicationNotePointsTerminalSettlementDistinctBackends(...pids) {
  if (
    pids.length < 2 ||
    pids.some(
      (pid) => !Number.isSafeInteger(Number(pid)) || Number(pid) <= 0,
    ) ||
    new Set(pids.map(Number)).size !== pids.length
  ) {
    fail(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .backendIdentityFailed,
    );
  }
  return Object.freeze(pids.map(Number));
}

export function assertCommunicationNotePointsTerminalSettlementBlockerRows(
  rows,
  waiterPid,
  blockerPid,
) {
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    Number(rows[0]?.waiting_pid) !== Number(waiterPid) ||
    Number(rows[0]?.blocker_pid) !== Number(blockerPid) ||
    rows[0]?.locktype !== "advisory" ||
    rows[0]?.granted !== false ||
    !Number.isSafeInteger(Number(waiterPid)) ||
    !Number.isSafeInteger(Number(blockerPid)) ||
    Number(waiterPid) <= 0 ||
    Number(blockerPid) <= 0 ||
    Number(waiterPid) === Number(blockerPid)
  ) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.blockerFailed);
  }

  return Object.freeze({
    waitingPid: Number(waiterPid),
    blockerPid: Number(blockerPid),
    locktype: "advisory",
    granted: false,
  });
}

export function assertCommunicationNotePointsTerminalSettlementSqlPolicy(
  setupSql,
  cleanupSql,
) {
  if (typeof setupSql !== "string" || typeof cleanupSql !== "string") {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.sqlPolicyInvalid);
  }

  const requiredSetup = [
    "COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SETUP_UNSAFE",
    "COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_SCHEMA_DRIFT",
    "COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_DATABASE_NOT_EMPTY",
    "careslink_v1_cn_points_terminal_runner",
    "careslink_v1_cn_points_terminal_support",
    "admit_and_reserve_v1_shadow_communication_note_generation_job",
    "admit_and_reserve_v1_bound_communication_note_generation_job",
    "careslink.cn_points_terminal.kms_key_version_resource_hash",
    "pg_advisory_xact_lock",
    "secondaryRegistrationDigest",
    "registration.communication-terminal-concurrency.20260902.v2",
    "prepare_recovery_fixtures",
    "recovery_fairness_state",
    "assert_settlement_worker_policy_boundary",
    "runningFirst",
    "communication_note_point_settlements_consistency_trigger",
    "set constraints",
    "immediate",
    "assert_generic_terminal_quarantine",
    "assert_terminal_job_mutation_denied",
    "assert_unmarked_paid_outer_running_replay_denied",
    "assert_unmarked_paid_outer_terminal_replay_denied",
    "public.commit_shadow_points",
    "public.release_shadow_points",
    "careslink_bootstrap_role",
    "careslink.cn_points_terminal.bootstrap_role",
    "bootstrap_actor",
    "migration_actor",
    "password null",
    "@example.invalid",
  ];
  const requiredCleanup = [
    "COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CLEANUP_UNSAFE",
    "COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CLEANUP_ACTIVE_RUNNER",
    "COMMUNICATION_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CLEANUP_POSTCHECK_FAILED",
    "careslink_bootstrap_role",
    "careslink.cn_points_terminal.bootstrap_role",
    "bootstrap_actor",
    "migration_actor",
    "da100000-0000-4000-8000-000000000001",
    "da200000-0000-4000-8000-000000000001",
    "da310000-0000-4000-8000-000000000001",
    "da320000-0000-4000-8000-000000000001",
    "da330000-0000-4000-8000-000000000001",
    "binding.communication-terminal-concurrency.20260902.v1",
    "registration.communication-terminal-concurrency.20260902.v1",
    "registration.communication-terminal-concurrency.20260902.v2",
    "provider.communication-terminal-concurrency.20260902.v1",
    "payload.communication-terminal-concurrency.20260902.v1",
    "worker.communication-terminal-concurrency.20260902.v1",
    "disable trigger jobs_communication_note_point_terminal_coordinator",
    "enable trigger jobs_communication_note_point_terminal_coordinator",
    "jobs_paid_communication_payload_policy_binding",
    "payloads_paid_communication_policy_binding",
    "disable trigger communication_note_point_settlements_immutable",
    "enable trigger communication_note_point_settlements_immutable",
    "disable trigger communication_note_point_admissions_immutable",
    "enable trigger communication_note_point_admissions_immutable",
    "drop constraint jobs_payload_owner_fk",
    "add constraint jobs_payload_owner_fk",
    "grant select on table",
    "no force row level security",
    "communication_note_paid_recovery_turns",
    "to careslink_v1_generation_owner",
    "grant update (registration_digest) on table",
    "revoke update (registration_digest) on table",
    "revoke select on table",
    "force row level security",
    "from careslink_v1_generation_owner",
    "drop role careslink_v1_cn_points_terminal_runner",
  ];
  const unsafeMutation =
    /\btruncate\s+(?:table\s+)?(?:only\s+)?[a-z_"]/i;
  const hostedMarker =
    /\b(?:supabase\.co|pooler\.supabase\.com|neon\.tech|render\.com|railway\.app|cloudsql|rds\.amazonaws\.com)\b/i;
  const connectionUri = /\bpostgres(?:ql)?:\/\//i;
  const cleanupDeletes = cleanupSql.match(/\bdelete\s+from[\s\S]*?;/gi) ?? [];
  const broadTriggerToggle = /\b(?:disable|enable)\s+trigger\s+(?:all|user)\b/i;
  const immutableDisableCount =
    cleanupSql.match(
      /\bdisable\s+trigger\s+communication_note_point_admissions_immutable\b/gi,
    )?.length ?? 0;
  const immutableEnableCount =
    cleanupSql.match(
      /\benable\s+trigger\s+communication_note_point_admissions_immutable\b/gi,
    )?.length ?? 0;
  const settlementImmutableDisableCount =
    cleanupSql.match(
      /\bdisable\s+trigger\s+communication_note_point_settlements_immutable\b/gi,
    )?.length ?? 0;
  const settlementImmutableEnableCount =
    cleanupSql.match(
      /\benable\s+trigger\s+communication_note_point_settlements_immutable\b/gi,
    )?.length ?? 0;
  const markerGuardDisableCount =
    cleanupSql.match(
      /\bdisable\s+trigger\s+jobs_communication_note_point_terminal_coordinator\b/gi,
    )?.length ?? 0;
  const markerGuardEnableCount =
    cleanupSql.match(
      /\benable\s+trigger\s+jobs_communication_note_point_terminal_coordinator\b/gi,
    )?.length ?? 0;
  const syntheticJobUnbinds =
    cleanupSql.match(
      /\bupdate\s+careslink_v1_generation\.jobs\b[\s\S]*?;/gi,
    ) ?? [];
  const exactSyntheticUnbindOrder =
    /disable\s+trigger\s+jobs_communication_note_point_terminal_coordinator\s*;[\s\S]*?update\s+careslink_v1_generation\.jobs\s+set\s+communication_note_point_admission_id\s*=\s*null\s+where\s+owner_user_id\s+in\s*\([\s\S]*?\)\s+and\s+communication_note_point_admission_id\s+is\s+not\s+null\s*;[\s\S]*?enable\s+trigger\s+jobs_communication_note_point_terminal_coordinator\s*;[\s\S]*?disable\s+trigger\s+communication_note_point_admissions_immutable\s*;/i;
  const exactJobPayloadConstraintCycle =
    /drop\s+constraint\s+jobs_payload_owner_fk\s*;[\s\S]*?delete\s+from\s+careslink_v1_generation\.payloads\b[\s\S]*?;[\s\S]*?delete\s+from\s+careslink_v1_generation\.jobs\b[\s\S]*?;[\s\S]*?add\s+constraint\s+jobs_payload_owner_fk\s+foreign\s+key\s*\(payload_id,\s*id,\s*owner_user_id\)\s+references\s+careslink_v1_generation\.payloads\(id,\s*job_id,\s*owner_user_id\)\s+on\s+delete\s+restrict\s+deferrable\s+initially\s+deferred\s*;/i;
  const exactRecoveryTurnFkAclCycle =
    /delete\s+from\s+careslink_v1_generation\.communication_note_paid_recovery_turns\b[\s\S]*?;[\s\S]*?alter\s+table\s+careslink_v1_generation\.communication_note_paid_recovery_turns\s+no\s+force\s+row\s+level\s+security\s*;[\s\S]*?grant\s+select\s+on\s+table\s+careslink_v1_generation\.communication_note_paid_recovery_turns\s+to\s+careslink_v1_generation_owner\s*;[\s\S]*?grant\s+update\s*\(registration_digest\)\s+on\s+table\s+careslink_v1_generation\.communication_note_paid_recovery_turns\s+to\s+careslink_v1_generation_owner\s*;[\s\S]*?delete\s+from\s+careslink_v1_generation\.worker_registrations\b[\s\S]*?;[\s\S]*?revoke\s+update\s*\(registration_digest\)\s+on\s+table\s+careslink_v1_generation\.communication_note_paid_recovery_turns\s+from\s+careslink_v1_generation_owner\s*;[\s\S]*?revoke\s+select\s+on\s+table\s+careslink_v1_generation\.communication_note_paid_recovery_turns\s+from\s+careslink_v1_generation_owner\s*;[\s\S]*?alter\s+table\s+careslink_v1_generation\.communication_note_paid_recovery_turns\s+force\s+row\s+level\s+security\s*;/i;
  const jobPayloadConstraintDropCount =
    cleanupSql.match(/\bdrop\s+constraint\s+jobs_payload_owner_fk\b/gi)
      ?.length ?? 0;
  const jobPayloadConstraintAddCount =
    cleanupSql.match(/\badd\s+constraint\s+jobs_payload_owner_fk\b/gi)
      ?.length ?? 0;
  const bootstrapRoleParameter =
    /\\if\s+:\{\?careslink_bootstrap_role\}[\s\S]{0,220}?pg_catalog\.set_config\(\s*'careslink\.cn_points_terminal\.bootstrap_role',\s*:'careslink_bootstrap_role',\s*true\s*\)/i;
  const bootstrapSuperuserPosture =
    /from pg_catalog\.pg_authid as bootstrap_actor[\s\S]{0,420}?bootstrap_actor\.rolname = v_bootstrap_role[\s\S]{0,220}?bootstrap_actor\.rolcanlogin is true[\s\S]{0,220}?bootstrap_actor\.rolsuper is true[\s\S]{0,220}?bootstrap_actor\.rolpassword is null/i;
  const migrationActorPosture =
    /from pg_catalog\.pg_authid as migration_actor[\s\S]{0,500}?migration_actor\.rolname = 'postgres'[\s\S]{0,220}?migration_actor\.rolcanlogin is true[\s\S]{0,220}?migration_actor\.rolsuper is false[\s\S]{0,220}?migration_actor\.rolinherit is true[\s\S]{0,220}?migration_actor\.rolcreatedb is true[\s\S]{0,220}?migration_actor\.rolcreaterole is true[\s\S]{0,220}?migration_actor\.rolreplication is false[\s\S]{0,220}?migration_actor\.rolbypassrls is true[\s\S]{0,220}?migration_actor\.rolpassword is null/i;
  const capturedBootstrapIdentity =
    /create function[\s\S]{0,180}?\._assert_runner\(\)[\s\S]{0,240}?security definer[\s\S]{0,120}?set search_path = ''[\s\S]{0,180}?set careslink\.cn_points_terminal\.bootstrap_role from current/i;
  const customGucNames = [setupSql, cleanupSql].flatMap((sql) =>
    [...sql.matchAll(/\bcareslink\.[a-z0-9_.-]+\b/gi)].map(
      (match) => match[0],
    ),
  );

  if (
    setupSql.length < 8_000 ||
    cleanupSql.length < 2_000 ||
    Buffer.byteLength(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
      "utf8",
    ) > 63 ||
    Buffer.byteLength(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA,
      "utf8",
    ) > 63 ||
    COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE ===
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA ||
    customGucNames.some((name) => Buffer.byteLength(name, "utf8") > 63) ||
    !/^\s*--[\s\S]*?\\set\s+ON_ERROR_STOP\s+on[\s\S]*?\bbegin\s*;/i.test(
      setupSql,
    ) ||
    !/\bcommit\s*;\s*$/i.test(setupSql) ||
    !/^\s*--[\s\S]*?\\set\s+ON_ERROR_STOP\s+on[\s\S]*?\bbegin\s*;/i.test(
      cleanupSql,
    ) ||
    !/\bcommit\s*;\s*$/i.test(cleanupSql) ||
    unsafeMutation.test(setupSql) ||
    unsafeMutation.test(cleanupSql) ||
    hostedMarker.test(setupSql) ||
    hostedMarker.test(cleanupSql) ||
    connectionUri.test(setupSql) ||
    connectionUri.test(cleanupSql) ||
    cleanupDeletes.length !== 27 ||
    cleanupDeletes.some((statement) => !/\bwhere\b/i.test(statement)) ||
    broadTriggerToggle.test(cleanupSql) ||
    immutableDisableCount !== 1 ||
    immutableEnableCount !== 1 ||
    settlementImmutableDisableCount !== 1 ||
    settlementImmutableEnableCount !== 1 ||
    markerGuardDisableCount !== 1 ||
    markerGuardEnableCount !== 1 ||
    syntheticJobUnbinds.length !== 1 ||
    !exactSyntheticUnbindOrder.test(cleanupSql) ||
    jobPayloadConstraintDropCount !== 1 ||
    jobPayloadConstraintAddCount !== 1 ||
    !exactJobPayloadConstraintCycle.test(cleanupSql) ||
    !exactRecoveryTurnFkAclCycle.test(cleanupSql) ||
    !bootstrapRoleParameter.test(setupSql) ||
    !bootstrapRoleParameter.test(cleanupSql) ||
    !bootstrapSuperuserPosture.test(setupSql) ||
    !bootstrapSuperuserPosture.test(cleanupSql) ||
    !migrationActorPosture.test(setupSql) ||
    !migrationActorPosture.test(cleanupSql) ||
    !capturedBootstrapIdentity.test(setupSql) ||
    !setupSql.includes("^careslink-cn-terminal-") ||
    requiredSetup.some((marker) => !setupSql.includes(marker)) ||
    requiredCleanup.some((marker) => !cleanupSql.includes(marker)) ||
    !/create role careslink_v1_cn_points_terminal_runner\s+[\s\S]{0,240}?login[\s\S]{0,240}?noinherit[\s\S]{0,240}?nobypassrls/i.test(
      setupSql,
    ) ||
    !/create role careslink_v1_cn_points_terminal_runner\s+[\s\S]{0,320}?password null[\s\S]{0,80}?connection limit 3/i.test(
      setupSql,
    ) ||
    !/grant execute on function[\s\S]{0,220}?careslink_v1_cn_points_terminal_support\.fixture_catalog\(\)[\s\S]{0,220}?admit_case\(pg_catalog\.text, pg_catalog\.int4\)/i.test(
      setupSql,
    ) ||
    /grant\s+(?:all|select|insert|update|delete)[\s\S]{0,160}?to careslink_v1_cn_points_terminal_runner/i.test(
      setupSql,
    ) ||
    !/revoke execute on function\s+careslink_v1_generation\.admit_and_reserve_v1_shadow_communication_note_generation_job\s*\(/i.test(
      cleanupSql,
    )
  ) {
    fail(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES.sqlPolicyInvalid);
  }

  return Object.freeze({
    ok: true,
    localPg16Only: true,
    passwordlessSocketOnly: true,
    explicitBootstrapSuperuser: true,
    migrationActorRemainsNonSuperuser: true,
    transactionalSetupAndCleanup: true,
    exactRunnerRpcGrant: true,
    directTableGrantsDenied: true,
    exactImmutableTriggerCleanup: true,
    exactJobMarkerTriggerCleanup: true,
    scopedSyntheticJobUnbind: true,
    exactJobPayloadConstraintRestored: true,
    syntheticOnlyCleanup: true,
    truncateDenied: true,
  });
}
