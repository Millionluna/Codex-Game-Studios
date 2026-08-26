import { createHash } from "node:crypto";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const SETUP_SQL_SHA256 =
  "98a0a1a1148daa3aac290ffb636fc5bd9591f2a2534c742da36908174dbae91d";
const CLEANUP_SQL_SHA256 =
  "98f1ee259ecd64782f879bca3236341fd98c68f4220c7f05ae14c19148dfe3c3";

export const PORTAL_RESPONSE_CONCURRENCY_DATABASE_URL_ENV =
  "CARESLINK_PORTAL_RESPONSE_LOCAL_PG16_DATABASE_URL";

export const PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE =
  "careslink_portal_response_concurrency_runner";

export const PORTAL_RESPONSE_CONCURRENCY_MARKER =
  "2026-08-26.local-pg16.1";

export const PORTAL_RESPONSE_CONCURRENCY_POLICY = Object.freeze({
  version: PORTAL_RESPONSE_CONCURRENCY_MARKER,
  expectedPostgresMajor: 16,
  minimumPort: 49_152,
  maximumPort: 65_535,
  requiredHost: "127.0.0.1",
  requiredDatabase: "postgres",
  requiredRole: PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
  requiredScheme: "postgresql:",
  maximumUrlLength: 512,
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

export const PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES = Object.freeze({
  invalid: "PORTAL_RESPONSE_CONCURRENCY_POLICY_INVALID",
  urlMissing: "PORTAL_RESPONSE_CONCURRENCY_URL_MISSING",
  urlInvalid: "PORTAL_RESPONSE_CONCURRENCY_URL_INVALID",
  targetDenied: "PORTAL_RESPONSE_CONCURRENCY_TARGET_DENIED",
  credentialsDenied: "PORTAL_RESPONSE_CONCURRENCY_CREDENTIALS_DENIED",
  roleDenied: "PORTAL_RESPONSE_CONCURRENCY_ROLE_DENIED",
  databaseDenied: "PORTAL_RESPONSE_CONCURRENCY_DATABASE_DENIED",
  portDenied: "PORTAL_RESPONSE_CONCURRENCY_PORT_DENIED",
  queryDenied: "PORTAL_RESPONSE_CONCURRENCY_QUERY_DENIED",
  environmentDenied: "PORTAL_RESPONSE_CONCURRENCY_ENVIRONMENT_DENIED",
  preflightFailed: "PORTAL_RESPONSE_CONCURRENCY_PREFLIGHT_FAILED",
  backendIdentityFailed:
    "PORTAL_RESPONSE_CONCURRENCY_BACKEND_IDENTITY_FAILED",
  sqlPolicyFailed: "PORTAL_RESPONSE_CONCURRENCY_SQL_POLICY_FAILED",
  regressionFailed: "PORTAL_RESPONSE_CONCURRENCY_REGRESSION_FAILED",
});

const ERROR_CODE_SET = new Set(
  Object.values(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES),
);

export class PortalResponseConcurrencyPolicyError extends Error {
  constructor(code) {
    const fixedCode = ERROR_CODE_SET.has(code)
      ? code
      : PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.invalid;
    super(fixedCode);
    this.name = "PortalResponseConcurrencyPolicyError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new PortalResponseConcurrencyPolicyError(code);
}

function parseUrl(value) {
  const policy = PORTAL_RESPONSE_CONCURRENCY_POLICY;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > policy.maximumUrlLength ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.urlInvalid);
  }

  try {
    return new URL(value);
  } catch {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.urlInvalid);
  }
}

export function validatePortalResponseConcurrencyDatabaseUrl(value) {
  const policy = PORTAL_RESPONSE_CONCURRENCY_POLICY;
  const url = parseUrl(value);

  if (url.protocol !== policy.requiredScheme) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.targetDenied);
  }
  if (url.hostname !== policy.requiredHost) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.targetDenied);
  }
  if (url.username !== policy.requiredRole) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.roleDenied);
  }
  if (url.password.length !== 0) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.credentialsDenied);
  }
  if (url.pathname !== "/" + policy.requiredDatabase) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.databaseDenied);
  }
  if (value.includes("?") || value.includes("#")) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.queryDenied);
  }

  const port = Number(url.port);
  if (
    !Number.isSafeInteger(port) ||
    port < policy.minimumPort ||
    port > policy.maximumPort ||
    port === 5432
  ) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.portDenied);
  }

  const canonical =
    policy.requiredScheme +
    "//" +
    policy.requiredRole +
    "@" +
    policy.requiredHost +
    ":" +
    port +
    "/" +
    policy.requiredDatabase;
  if (value !== canonical) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.urlInvalid);
  }

  return Object.freeze({
    ok: true,
    policyVersion: policy.version,
    hostname: policy.requiredHost,
    port,
    database: policy.requiredDatabase,
    databaseRole: policy.requiredRole,
    postgresMajor: policy.expectedPostgresMajor,
    sslMode: "disabled",
    passwordMaterial: "absent",
    hostedTarget: false,
  });
}

export function readPortalResponseConcurrencyEnvironment(env) {
  if (env === null || typeof env !== "object") {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.environmentDenied);
  }

  for (const name of PORTAL_RESPONSE_CONCURRENCY_POLICY.deniedEnvironmentNames) {
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.environmentDenied);
    }
  }

  const value = env[PORTAL_RESPONSE_CONCURRENCY_DATABASE_URL_ENV];
  if (typeof value !== "string" || value.length === 0) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.urlMissing);
  }

  return Object.freeze({
    databaseUrl: value,
    target: validatePortalResponseConcurrencyDatabaseUrl(value),
  });
}

export function assertPortalResponseConcurrencyPreflight(row, target) {
  const policy = PORTAL_RESPONSE_CONCURRENCY_POLICY;
  if (
    row === null ||
    typeof row !== "object" ||
    target === null ||
    typeof target !== "object" ||
    row.server_addr !== policy.requiredHost ||
    Number(row.server_port) !== target.port ||
    row.database_name !== policy.requiredDatabase ||
    row.session_user_name !== policy.requiredRole ||
    row.current_user_name !== policy.requiredRole ||
    Number(row.server_version_num) < 160_000 ||
    Number(row.server_version_num) >= 170_000 ||
    row.ssl_in_use !== false ||
    row.bootstrap_marker !== policy.version
  ) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.preflightFailed);
  }

  return Object.freeze({
    ok: true,
    backendPid: Number(row.backend_pid),
    serverVersionNum: Number(row.server_version_num),
    port: Number(row.server_port),
    sslInUse: false,
    marker: row.bootstrap_marker,
  });
}

export function assertPortalResponseConcurrencyDistinctBackends(...pids) {
  if (
    pids.length < 2 ||
    pids.some(
      (pid) => !Number.isSafeInteger(Number(pid)) || Number(pid) <= 0,
    ) ||
    new Set(pids.map(Number)).size !== pids.length
  ) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.backendIdentityFailed);
  }
  return Object.freeze(pids.map(Number));
}

export function assertPortalResponseConcurrencySqlPolicy(setupSql, cleanupSql) {
  if (typeof setupSql !== "string" || typeof cleanupSql !== "string") {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.sqlPolicyFailed);
  }

  const requiredSetupFragments = [
    PORTAL_RESPONSE_CONCURRENCY_MARKER,
    PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
    "inet_server_addr()",
    "inet_server_port()",
    "server_version_num",
    "create schema careslink_portal_response_concurrency_test_support",
    "reset_fixture",
    "lock_mutation",
    "lock_referral",
    "lock_response_flag",
    "revoke_session",
    "revoke_provider",
    "disable_response_flag",
    "blocked_count",
    "fixture_state",
    "cleanup_fixture",
  ];
  const requiredCleanupFragments = [
    PORTAL_RESPONSE_CONCURRENCY_MARKER,
    PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
    "drop schema careslink_portal_response_concurrency_test_support",
    "drop role careslink_portal_response_concurrency_runner",
    "PORTAL_RESPONSE_CONCURRENCY_CLEANUP_FAILED",
  ];

  const setupLocked = requiredSetupFragments.every((fragment) =>
    setupSql.toLowerCase().includes(fragment.toLowerCase()),
  );
  const cleanupLocked = requiredCleanupFragments.every((fragment) =>
    cleanupSql.toLowerCase().includes(fragment.toLowerCase()),
  );
  const noBroadDeletes = !/\btruncate\b/i.test(setupSql + "\n" + cleanupSql);
  const noHostedTarget = !/(?:supabase\.co|pooler\.supabase\.com)/i.test(
    setupSql + "\n" + cleanupSql,
  );
  const exactSqlBodiesLocked =
    createHash("sha256").update(setupSql, "utf8").digest("hex") ===
      SETUP_SQL_SHA256 &&
    createHash("sha256").update(cleanupSql, "utf8").digest("hex") ===
      CLEANUP_SQL_SHA256;
  const runnerPostureLocked =
    /\bcreate role careslink_portal_response_concurrency_runner\b[\s\S]{0,300}\blogin\b/i.test(
      setupSql,
    ) &&
    /\bnosuperuser\b/i.test(setupSql) &&
    /\bnocreatedb\b/i.test(setupSql) &&
    /\bnocreaterole\b/i.test(setupSql) &&
    /\bnobypassrls\b/i.test(setupSql);
  const helperAclLocked =
    /\brevoke all on schema careslink_portal_response_concurrency_test_support\s+from public,\s*anon,\s*authenticated,\s*service_role\b/i.test(
      setupSql,
    ) &&
    /\bgrant execute on (?:all )?functions?[\s\S]{0,300}\bto careslink_portal_response_concurrency_runner\b/i.test(
      setupSql,
    );

  if (
    !setupLocked ||
    !cleanupLocked ||
    !noBroadDeletes ||
    !noHostedTarget ||
    !exactSqlBodiesLocked ||
    !runnerPostureLocked ||
    !helperAclLocked
  ) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.sqlPolicyFailed);
  }

  return Object.freeze({
    ok: true,
    localPg16BoundaryLocked: true,
    passwordlessRunnerLocked: true,
    fixedHelperBoundaryLocked: true,
    exactCleanupLocked: true,
    truncateDenied: true,
    hostedTargetDenied: true,
  });
}

function capturePolicyError(operation) {
  try {
    operation();
  } catch (error) {
    if (error instanceof PortalResponseConcurrencyPolicyError) {
      return error;
    }
  }
  return null;
}

export function assertPortalResponseConcurrencyPolicyRegression() {
  const role = PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE;
  const valid = validatePortalResponseConcurrencyDatabaseUrl(
    "postgresql://" + role + "@127.0.0.1:55432/postgres",
  );
  const hosted = capturePolicyError(() =>
    validatePortalResponseConcurrencyDatabaseUrl(
      "postgresql://" + role + "@db.example.supabase.co:55432/postgres",
    ),
  );
  const password = capturePolicyError(() =>
    validatePortalResponseConcurrencyDatabaseUrl(
      "postgresql://" + role + ":forbidden@127.0.0.1:55432/postgres",
    ),
  );
  const defaultPort = capturePolicyError(() =>
    validatePortalResponseConcurrencyDatabaseUrl(
      "postgresql://" + role + "@127.0.0.1:5432/postgres",
    ),
  );

  if (
    valid.hostedTarget !== false ||
    valid.postgresMajor !== 16 ||
    hosted?.code !== PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.targetDenied ||
    password?.code !==
      PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.credentialsDenied ||
    defaultPort?.code !== PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.portDenied
  ) {
    fail(PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.regressionFailed);
  }

  return Object.freeze({
    ok: true,
    policyVersion: PORTAL_RESPONSE_CONCURRENCY_POLICY.version,
    expectedPostgresMajor: 16,
    requiredHost: "127.0.0.1",
    minimumPort: PORTAL_RESPONSE_CONCURRENCY_POLICY.minimumPort,
    sslMode: "disabled",
    passwordMaterial: "absent",
  });
}
