import { createHash } from "node:crypto";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const TEMP_ROOT_PATTERN =
  /^\/private\/tmp\/careslink-portal-follow-up-pg16\.[a-zA-Z0-9]{6,}$/;
const SOCKET_DIRECTORY_PATTERN =
  /^\/private\/tmp\/careslink-portal-follow-up-pg16\.[a-zA-Z0-9]{6,}\/socket$/;
const BOOTSTRAP_SQL_SHA256 =
  "b4d880a79275062e87e42014b5d1d1a8d9d77deb3dc5d7a25fb15239c1aea252";
const SETUP_SQL_SHA256 =
  "f86e76ccbce57a3ede4aacba2d1b29b5d280fca154a399b2cbb6a12e26d7d533";
const CLEANUP_SQL_SHA256 =
  "2c83c9c1b6f06fd6927036cfd4174dbad5e063bf26171a64cc02f50aca732b42";
const LIVE_HARNESS_SHA256 =
  "5cd432e1da2f6cefef7f8e86d7a557b0d2fe7e5d937d8e45189c0558ffe833f1";
const LIVE_HARNESS_INVOCATION_REQUIREMENTS = Object.freeze([
  Object.freeze(["await runSameKeyReplayRace(", 1]),
  Object.freeze(["await runSameKeyConflictRace(", 1]),
  Object.freeze(["await runDifferentKeyRace(", 1]),
  Object.freeze(["await runSameProviderActorRace(", 1]),
  Object.freeze(["await runRevocationFirstRace(", 2]),
  Object.freeze(["await runFlagRace(", 1]),
  Object.freeze(["await runOwnershipRace(", 1]),
]);

export const PORTAL_FOLLOW_UP_CONCURRENCY_DATABASE_URL_ENV =
  "CARESLINK_PORTAL_FOLLOW_UP_LOCAL_PG16_DATABASE_URL";

export const PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE =
  "careslink_portal_follow_up_concurrency_runner";

export const PORTAL_FOLLOW_UP_CONCURRENCY_SUPPORT_SCHEMA =
  "careslink_portal_follow_up_concurrency_test_support";

export const PORTAL_FOLLOW_UP_CONCURRENCY_MARKER =
  "2026-08-26.local-pg16.m1c.1";

export const PORTAL_FOLLOW_UP_CONCURRENCY_CLUSTER_NAME =
  "careslink-portal-follow-up-m1c-pg16";

export const PORTAL_FOLLOW_UP_CONCURRENCY_MANAGEMENT_APPLICATION_NAME =
  "careslink-portal-follow-up-concurrency-management";

export const PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS =
  Object.freeze([
    Object.freeze({
      file: "20260809120000_create_v1_shadow_foundation.sql",
      sha256:
        "c46282f095a7bb8052a91a0cc4118b74c187c00b7d1eaf25cdee67540d2a2c37",
    }),
    Object.freeze({
      file: "20260810131648_add_v1_mobile_sync_shadow.sql",
      sha256:
        "c3cc86e7798857708d733faa29ea3d0c3d213592c0391db6d60991d46368d5ef",
    }),
    Object.freeze({
      file: "20260813233003_portal_referral_workflow_foundation.sql",
      sha256:
        "133b657281b11046696f3e3073b9507b0df748afa51c9610a81b6ec9bed1c068",
    }),
    Object.freeze({
      file: "20260824124725_add_portal_referral_intake_runtime.sql",
      sha256:
        "5a98154b254050b3140f5f185d52e3ff7e070da05fbdfa99dbdd60665b382e1c",
    }),
    Object.freeze({
      file: "20260825110251_add_portal_referral_source_detail_runtime.sql",
      sha256:
        "8e58ad2d7fcf68400925604b459dc972be7f7ef8608b1b496d5217a99ec0dc4e",
    }),
    Object.freeze({
      file: "20260825120908_add_portal_referral_assignment_runtime.sql",
      sha256:
        "1478122a147dddaffcdfb07aa6dfc29b0162ba27342480984bb6fb96152e3416",
    }),
    Object.freeze({
      file: "20260825153340_add_portal_referral_provider_response_runtime.sql",
      sha256:
        "256f713df793d4cbae5b6c63119f2acb26460f73bf963ffde3f72f465384e0a6",
    }),
    Object.freeze({
      file: "20260826090841_add_portal_referral_follow_up_runtime.sql",
      sha256:
        "cb904d048827ff16603b19a1116f33529cba134471fe1555cfd0ea858d6fb99e",
    }),
  ]);

export const PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS =
  Object.freeze({
    totalMs: 120_000,
    binaryPreflightMs: 5_000,
    initdbMs: 20_000,
    startMs: 20_000,
    sqlFileMs: 20_000,
    liveHarnessMs: 60_000,
    quiesceMs: 8_000,
    cleanupMs: 20_000,
    stopMs: 10_000,
    exactDeleteMs: 5_000,
  });

export const PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY =
  Object.freeze({
    version: PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
    expectedPostgresMajor: 16,
    minimumPort: 49_152,
    maximumPort: 65_535,
    deniedPort: 5_432,
    portCandidateCount: 8,
    connectionUriHost: "localhost",
    requiredDatabase: "postgres",
    requiredRole: PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE,
    requiredScheme: "postgresql:",
    maximumUrlLength: 512,
    tempRootPrefix: "/private/tmp/careslink-portal-follow-up-pg16.",
    clusterName: PORTAL_FOLLOW_UP_CONCURRENCY_CLUSTER_NAME,
    deniedEnvironmentNames: Object.freeze([
      "DATABASE_URL",
      "DIRECT_URL",
      "SUPABASE_DB_URL",
      "PGAPPNAME",
      "PGDATABASE",
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
    ]),
  });

export const PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES =
  Object.freeze({
    invalid: "PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_INVALID",
    argumentInvalid: "PORTAL_FOLLOW_UP_CONCURRENCY_ARGUMENT_INVALID",
    urlMissing: "PORTAL_FOLLOW_UP_CONCURRENCY_URL_MISSING",
    urlInvalid: "PORTAL_FOLLOW_UP_CONCURRENCY_URL_INVALID",
    targetDenied: "PORTAL_FOLLOW_UP_CONCURRENCY_TARGET_DENIED",
    credentialsDenied:
      "PORTAL_FOLLOW_UP_CONCURRENCY_CREDENTIALS_DENIED",
    roleDenied: "PORTAL_FOLLOW_UP_CONCURRENCY_ROLE_DENIED",
    databaseDenied: "PORTAL_FOLLOW_UP_CONCURRENCY_DATABASE_DENIED",
    portDenied: "PORTAL_FOLLOW_UP_CONCURRENCY_PORT_DENIED",
    queryDenied: "PORTAL_FOLLOW_UP_CONCURRENCY_QUERY_DENIED",
    environmentDenied:
      "PORTAL_FOLLOW_UP_CONCURRENCY_ENVIRONMENT_DENIED",
    preflightFailed: "PORTAL_FOLLOW_UP_CONCURRENCY_PREFLIGHT_FAILED",
    backendIdentityFailed:
      "PORTAL_FOLLOW_UP_CONCURRENCY_BACKEND_IDENTITY_FAILED",
    migrationManifestFailed:
      "PORTAL_FOLLOW_UP_CONCURRENCY_MIGRATION_MANIFEST_FAILED",
    sqlPolicyFailed: "PORTAL_FOLLOW_UP_CONCURRENCY_SQL_POLICY_FAILED",
    liveHarnessPolicyFailed:
      "PORTAL_FOLLOW_UP_CONCURRENCY_LIVE_HARNESS_POLICY_FAILED",
    tempRootDenied: "PORTAL_FOLLOW_UP_CONCURRENCY_TEMP_ROOT_DENIED",
    binaryDenied: "PORTAL_FOLLOW_UP_CONCURRENCY_PG16_BINARY_DENIED",
    timeoutPolicyFailed:
      "PORTAL_FOLLOW_UP_CONCURRENCY_TIMEOUT_POLICY_FAILED",
    regressionFailed: "PORTAL_FOLLOW_UP_CONCURRENCY_REGRESSION_FAILED",
  });

export const PORTAL_FOLLOW_UP_CONCURRENCY_ERROR_CODES =
  PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES;

const ERROR_CODE_SET = new Set(
  Object.values(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES),
);

export class PortalFollowUpConcurrencyPolicyError extends Error {
  constructor(code) {
    const fixedCode = ERROR_CODE_SET.has(code)
      ? code
      : PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.invalid;
    super(fixedCode);
    this.name = "PortalFollowUpConcurrencyPolicyError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new PortalFollowUpConcurrencyPolicyError(code);
}

function parseUrl(value) {
  const policy = PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > policy.maximumUrlLength ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.urlInvalid);
  }

  try {
    return new URL(value);
  } catch {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.urlInvalid);
  }
}

export function validatePortalFollowUpConcurrencyDatabaseUrl(value) {
  const policy = PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY;
  const url = parseUrl(value);

  if (
    url.protocol !== policy.requiredScheme ||
    url.hostname !== policy.connectionUriHost
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.targetDenied);
  }
  if (url.username !== policy.requiredRole) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.roleDenied);
  }
  if (url.password.length !== 0) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.credentialsDenied);
  }
  if (url.pathname !== "/" + policy.requiredDatabase) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.databaseDenied);
  }
  if (value.includes("#")) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.queryDenied);
  }

  const socketParameters = [...url.searchParams.entries()];
  const socketDirectory = url.searchParams.get("host");
  if (
    socketParameters.length !== 1 ||
    socketParameters[0]?.[0] !== "host"
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.queryDenied);
  }
  if (
    typeof socketDirectory !== "string" ||
    !SOCKET_DIRECTORY_PATTERN.test(socketDirectory) ||
    socketDirectory.includes("..") ||
    CONTROL_CHARACTER_PATTERN.test(socketDirectory)
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.targetDenied);
  }

  const port = Number(url.port);
  if (
    !Number.isSafeInteger(port) ||
    port < policy.minimumPort ||
    port > policy.maximumPort ||
    port === policy.deniedPort
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.portDenied);
  }

  const canonical =
    policy.requiredScheme +
    "//" +
    policy.requiredRole +
    "@" +
    policy.connectionUriHost +
    ":" +
    port +
    "/" +
    policy.requiredDatabase +
    "?host=" +
    encodeURIComponent(socketDirectory);
  if (value !== canonical) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.urlInvalid);
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

export function readPortalFollowUpConcurrencyEnvironment(env) {
  if (env === null || typeof env !== "object") {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.environmentDenied);
  }

  for (const name of PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY
    .deniedEnvironmentNames) {
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.environmentDenied);
    }
  }

  const databaseUrl = env[PORTAL_FOLLOW_UP_CONCURRENCY_DATABASE_URL_ENV];
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.urlMissing);
  }

  return Object.freeze({
    databaseUrl,
    target: validatePortalFollowUpConcurrencyDatabaseUrl(databaseUrl),
  });
}

export function assertPortalFollowUpConcurrencyPreflight(row, target) {
  const policy = PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY;
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
    row.ssl_in_use !== false ||
    row.bootstrap_marker !== policy.version
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.preflightFailed);
  }

  return Object.freeze({
    ok: true,
    backendPid: Number(row.backend_pid),
    serverVersionNum: Number(row.server_version_num),
    port: Number(row.server_port),
    socketDirectory: target.socketDirectory,
    transport: "unix-domain-socket",
    sslInUse: false,
    marker: row.bootstrap_marker,
  });
}

export function assertPortalFollowUpConcurrencyDistinctBackends(...pids) {
  if (
    pids.length < 2 ||
    pids.some(
      (pid) => !Number.isSafeInteger(Number(pid)) || Number(pid) <= 0,
    ) ||
    new Set(pids.map(Number)).size !== pids.length
  ) {
    fail(
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.backendIdentityFailed,
    );
  }
  return Object.freeze(pids.map(Number));
}

export function assertPortalFollowUpConcurrencyMigrationManifest(entries) {
  if (!Array.isArray(entries)) {
    fail(
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.migrationManifestFailed,
    );
  }

  const expected = PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS;
  const valid =
    entries.length === expected.length &&
    entries.every((entry, index) => {
      const expectedEntry = expected[index];
      return (
        entry !== null &&
        typeof entry === "object" &&
        entry.file === expectedEntry.file &&
        typeof entry.sql === "string" &&
        createHash("sha256").update(entry.sql, "utf8").digest("hex") ===
          expectedEntry.sha256
      );
    });
  if (!valid) {
    fail(
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.migrationManifestFailed,
    );
  }

  return Object.freeze({
    ok: true,
    migrationCount: expected.length,
    files: Object.freeze(expected.map((entry) => entry.file)),
    manifestSha256: createHash("sha256")
      .update(
        expected.map((entry) => `${entry.file}:${entry.sha256}`).join("\n"),
        "utf8",
      )
      .digest("hex"),
  });
}

export function assertPortalFollowUpConcurrencyLocalPg16SqlPolicy(
  bootstrapSql,
  setupSql,
  cleanupSql,
) {
  if (
    typeof bootstrapSql !== "string" ||
    typeof setupSql !== "string" ||
    typeof cleanupSql !== "string"
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.sqlPolicyFailed);
  }

  const bootstrapFragments = [
    PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
    "unix_socket_directories",
    "unix_socket_permissions",
    "listen_addresses",
    "server_version_num",
    "create role anon",
    "create role authenticated",
    "create role service_role",
    "create schema auth",
    "create table auth.users",
    "create table auth.sessions",
    "create function auth.jwt()",
    "create function auth.uid()",
  ];
  const setupFragments = [
    PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
    "unix_socket_directories",
    "unix_socket_permissions",
    "listen_addresses",
    PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE,
    PORTAL_FOLLOW_UP_CONCURRENCY_SUPPORT_SCHEMA,
    "portal_referral_follow_up_record",
    "lock_mutation",
    "lock_referral",
    "lock_session",
    "lock_provider",
    "lock_contact",
    "arm_session_expiry",
    "revoke_session",
    "revoke_provider",
    "lock_follow_up_flag",
    "disable_follow_up_flag",
    "revoke_ownership",
    "blocked_count",
    "blocked_by_count",
    "blockers",
    "fixture_state",
    "cleanup_fixture",
    "reset_fixture",
    "PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_POSTURE_FAILED",
  ];
  const cleanupFragments = [
    PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
    "unix_socket_directories",
    "unix_socket_permissions",
    "listen_addresses",
    PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE,
    PORTAL_FOLLOW_UP_CONCURRENCY_SUPPORT_SCHEMA,
    "PORTAL_FOLLOW_UP_CONCURRENCY_CLEANUP_ACTIVE_RUNNER",
    "PORTAL_FOLLOW_UP_CONCURRENCY_CLEANUP_FAILED",
    "drop schema careslink_portal_follow_up_concurrency_test_support cascade",
    "drop role careslink_portal_follow_up_concurrency_runner",
    "portal_followups_append_only",
    "portal_audit_append_only",
    "portal_receipts_append_only",
  ];
  const combined = `${bootstrapSql}\n${setupSql}\n${cleanupSql}`;
  const hashesMatch =
    createHash("sha256").update(bootstrapSql, "utf8").digest("hex") ===
      BOOTSTRAP_SQL_SHA256 &&
    createHash("sha256").update(setupSql, "utf8").digest("hex") ===
      SETUP_SQL_SHA256 &&
    createHash("sha256").update(cleanupSql, "utf8").digest("hex") ===
      CLEANUP_SQL_SHA256;
  const transactionBoundariesLocked = [bootstrapSql, setupSql, cleanupSql]
    .every(
      (sql) =>
        /\\set\s+ON_ERROR_STOP\s+on/i.test(sql) &&
        /\bbegin\s*;/i.test(sql) &&
        /\bcommit\s*;\s*$/i.test(sql),
    );
  const runnerPostureLocked =
    /\bcreate role careslink_portal_follow_up_concurrency_runner\b[\s\S]{0,300}\blogin\b[\s\S]{0,300}\binherit\b/i.test(
      setupSql,
    ) &&
    /\bnosuperuser\b/i.test(setupSql) &&
    /\bnocreatedb\b/i.test(setupSql) &&
    /\bnocreaterole\b/i.test(setupSql) &&
    /\bnoreplication\b/i.test(setupSql) &&
    /\bnobypassrls\b/i.test(setupSql);
  const fragmentsLocked =
    bootstrapFragments.every((fragment) => bootstrapSql.includes(fragment)) &&
    setupFragments.every((fragment) => setupSql.includes(fragment)) &&
    cleanupFragments.every((fragment) => cleanupSql.includes(fragment));
  if (
    !hashesMatch ||
    !transactionBoundariesLocked ||
    !runnerPostureLocked ||
    !fragmentsLocked ||
    /\btruncate\b/i.test(combined) ||
    /(?:supabase\.co|pooler\.supabase\.com)/i.test(combined)
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.sqlPolicyFailed);
  }

  return Object.freeze({
    ok: true,
    bootstrapSha256: BOOTSTRAP_SQL_SHA256,
    setupSha256: SETUP_SQL_SHA256,
    cleanupSha256: CLEANUP_SQL_SHA256,
    exactSqlBodiesLocked: true,
    transactionBoundariesLocked: true,
    localPg16BoundaryLocked: true,
    passwordlessRunnerLocked: true,
    fixedHelperBoundaryLocked: true,
    exactCleanupLocked: true,
    truncateDenied: true,
    hostedTargetDenied: true,
  });
}

export function assertPortalFollowUpConcurrencyLiveHarnessSource(source) {
  const invocationCountsLocked =
    typeof source === "string" &&
    LIVE_HARNESS_INVOCATION_REQUIREMENTS.every(
      ([fragment, expectedCount]) =>
        source.split(fragment).length - 1 === expectedCount,
    );
  const completionOrderLocked =
    typeof source === "string" &&
    Array.from({ length: 8 }, (_, index) =>
      `completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[${index}]);`,
    ).every((fragment) => source.split(fragment).length - 1 === 1);
  const liveHarnessSha256 =
    typeof source === "string"
      ? createHash("sha256").update(source, "utf8").digest("hex")
      : null;

  if (
    liveHarnessSha256 !== LIVE_HARNESS_SHA256 ||
    !invocationCountsLocked ||
    !completionOrderLocked
  ) {
    fail(
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.liveHarnessPolicyFailed,
    );
  }

  return Object.freeze({
    ok: true,
    liveHarnessSha256,
    exactLiveHarnessBodyLocked: true,
    invocationCountsLocked: true,
    completionOrderLocked: true,
  });
}

export function validatePortalFollowUpConcurrencyTempRoot(value) {
  if (
    typeof value !== "string" ||
    !TEMP_ROOT_PATTERN.test(value) ||
    value.includes("..") ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.tempRootDenied);
  }
  return value;
}

export function assertPortalFollowUpConcurrencyPg16Version(value) {
  if (
    typeof value !== "string" ||
    !/^postgres \(PostgreSQL\) 16(?:\.[0-9]+){0,2}(?: \([a-zA-Z0-9 ._+-]+\))?\s*$/.test(
      value,
    )
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.binaryDenied);
  }
  return Object.freeze({ ok: true, postgresMajor: 16 });
}

export function parsePortalFollowUpConcurrencyLocalPg16Arguments(argv) {
  if (!Array.isArray(argv) || argv.length > 1) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.argumentInvalid);
  }
  if (argv.length === 0) {
    return Object.freeze({ pgBinDir: null });
  }

  const prefix = "--pg-bin-dir=";
  const argument = argv[0];
  const pgBinDir =
    typeof argument === "string" && argument.startsWith(prefix)
      ? argument.slice(prefix.length)
      : "";
  if (
    pgBinDir.length === 0 ||
    !pgBinDir.startsWith("/") ||
    pgBinDir !== pgBinDir.trim() ||
    CONTROL_CHARACTER_PATTERN.test(pgBinDir)
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.argumentInvalid);
  }
  return Object.freeze({ pgBinDir });
}

export function assertPortalFollowUpConcurrencyTimeoutPolicy() {
  const timeouts = PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS;
  const stageValues = Object.entries(timeouts)
    .filter(([name]) => name !== "totalMs")
    .map(([, value]) => value);
  if (
    !Number.isSafeInteger(timeouts.totalMs) ||
    timeouts.totalMs < 60_000 ||
    stageValues.some(
      (value) =>
        !Number.isSafeInteger(value) ||
        value < 1_000 ||
        value >= timeouts.totalMs,
    ) ||
    timeouts.liveHarnessMs <= timeouts.sqlFileMs
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.timeoutPolicyFailed);
  }
  return Object.freeze({ ok: true, ...timeouts });
}

function capturePolicyError(operation) {
  try {
    operation();
  } catch (error) {
    if (error instanceof PortalFollowUpConcurrencyPolicyError) {
      return error;
    }
  }
  return null;
}

export function assertPortalFollowUpConcurrencyPolicyRegression() {
  const policy = PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY;
  const role = PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE;
  const socketDirectory =
    "/private/tmp/careslink-portal-follow-up-pg16.aB12cD/socket";
  const encodedSocketDirectory = encodeURIComponent(socketDirectory);
  const valid = validatePortalFollowUpConcurrencyDatabaseUrl(
    `postgresql://${role}@localhost:55432/postgres?host=${encodedSocketDirectory}`,
  );
  const hosted = capturePolicyError(() =>
    validatePortalFollowUpConcurrencyDatabaseUrl(
      `postgresql://${role}@db.example.invalid:55432/postgres?host=${encodedSocketDirectory}`,
    ),
  );
  const password = capturePolicyError(() =>
    validatePortalFollowUpConcurrencyDatabaseUrl(
      `postgresql://${role}:forbidden@localhost:55432/postgres?host=${encodedSocketDirectory}`,
    ),
  );
  const defaultPort = capturePolicyError(() =>
    validatePortalFollowUpConcurrencyDatabaseUrl(
      `postgresql://${role}@localhost:5432/postgres?host=${encodedSocketDirectory}`,
    ),
  );

  if (
    valid.hostedTarget !== false ||
    valid.postgresMajor !== 16 ||
    hosted?.code !==
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.targetDenied ||
    password?.code !==
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.credentialsDenied ||
    defaultPort?.code !==
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.portDenied
  ) {
    fail(PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.regressionFailed);
  }

  assertPortalFollowUpConcurrencyTimeoutPolicy();
  return Object.freeze({
    ok: true,
    policyVersion: policy.version,
    expectedPostgresMajor: policy.expectedPostgresMajor,
    transport: valid.transport,
    socketDirectory: valid.socketDirectory,
    minimumPort: policy.minimumPort,
    sslMode: "disabled",
    passwordMaterial: "absent",
    migrationCount:
      PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS.length,
  });
}
