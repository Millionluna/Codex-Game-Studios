const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const RUNNER_ROLE = "careslink_v1_generation_owner_ab_runner";
const LOOPBACK_HOST = "127.0.0.1";

export const NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_DATABASE_URL_ENV =
  "CARESLINK_V1_WORKER_OWNER_AB_LOCAL_PG16_DATABASE_URL";

export const NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES = Object.freeze({
  invalid: "NOTE_WORKER_RPC_OWNER_AB_DATABASE_URL_INVALID",
  schemeDenied: "NOTE_WORKER_RPC_OWNER_AB_DATABASE_SCHEME_DENIED",
  targetDenied: "NOTE_WORKER_RPC_OWNER_AB_DATABASE_TARGET_DENIED",
  roleDenied: "NOTE_WORKER_RPC_OWNER_AB_DATABASE_ROLE_DENIED",
  credentialsDenied: "NOTE_WORKER_RPC_OWNER_AB_DATABASE_CREDENTIALS_DENIED",
  databaseDenied: "NOTE_WORKER_RPC_OWNER_AB_DATABASE_NAME_DENIED",
  portDenied: "NOTE_WORKER_RPC_OWNER_AB_DATABASE_PORT_DENIED",
  queryDenied: "NOTE_WORKER_RPC_OWNER_AB_DATABASE_QUERY_DENIED",
  regressionFailed: "NOTE_WORKER_RPC_OWNER_AB_LOCAL_POLICY_REGRESSION_FAILED",
});

export const NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_POLICY = Object.freeze({
  version: "2026-08-24.local-pg16.1",
  expectedPostgresMajor: 16,
  requiredScheme: "postgresql:",
  requiredHost: LOOPBACK_HOST,
  requiredDatabase: "postgres",
  requiredDatabaseRole: RUNNER_ROLE,
  requiredApplicationName: "careslink-worker-rpc-owner-ab",
  requiredManagementApplicationName:
    "careslink-worker-rpc-owner-ab-management",
  requiredBootstrapMarkerName: "careslink.owner_ab.local_bootstrap",
  requiredBootstrapMarkerValue: "2026-08-24.local-pg16.1",
  requiredClusterName: "careslink-owner-ab-pg16",
  requiredPort: 55_432,
  maximumUrlLength: 512,
});

const FIXED_ERROR_CODES = new Set(
  Object.values(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES),
);

export class NoteWorkerRpcOwnerAbLocalPg16PolicyError extends Error {
  constructor(code) {
    const fixedCode = FIXED_ERROR_CODES.has(code)
      ? code
      : NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.invalid;
    super(fixedCode);
    this.name = "NoteWorkerRpcOwnerAbLocalPg16PolicyError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new NoteWorkerRpcOwnerAbLocalPg16PolicyError(code);
}

function parseUrl(value) {
  const policy = NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_POLICY;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > policy.maximumUrlLength ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.invalid);
  }

  try {
    return new URL(value);
  } catch {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.invalid);
  }
}

/**
 * Parses only a credential-free connection to a disposable local PostgreSQL
 * 16 cluster. HBA trust is an outer bootstrap responsibility; this boundary
 * never accepts hosted targets, passwords, URL options or the default port.
 */
export function validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(value) {
  const policy = NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_POLICY;
  const url = parseUrl(value);

  if (url.protocol !== policy.requiredScheme) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.schemeDenied);
  }
  if (url.hostname !== policy.requiredHost) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.targetDenied);
  }
  if (url.username !== policy.requiredDatabaseRole) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.roleDenied);
  }
  if (url.password.length !== 0) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.credentialsDenied);
  }
  if (url.pathname !== `/${policy.requiredDatabase}`) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.databaseDenied);
  }
  if (value.includes("?") || value.includes("#")) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.queryDenied);
  }

  const port = Number(url.port);
  if (
    !Number.isSafeInteger(port) ||
    port !== policy.requiredPort
  ) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.portDenied);
  }

  const canonicalUrl =
    `${policy.requiredScheme}//${policy.requiredDatabaseRole}@` +
    `${policy.requiredHost}:${port}/${policy.requiredDatabase}`;
  if (value !== canonicalUrl) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.invalid);
  }

  return Object.freeze({
    ok: true,
    policyVersion: policy.version,
    connectionMode: "local_pg16_loopback",
    databaseRole: policy.requiredDatabaseRole,
    hostname: policy.requiredHost,
    port,
    database: policy.requiredDatabase,
    postgresMajor: policy.expectedPostgresMajor,
    applicationName: policy.requiredApplicationName,
    managementApplicationName: policy.requiredManagementApplicationName,
    bootstrapMarkerName: policy.requiredBootstrapMarkerName,
    bootstrapMarkerValue: policy.requiredBootstrapMarkerValue,
    clusterName: policy.requiredClusterName,
    sslMode: "disabled",
    passwordMaterial: "absent",
  });
}

export const parseNoteWorkerRpcOwnerAbLocalPg16DatabaseTarget =
  validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl;

function capturePolicyError(operation) {
  try {
    operation();
  } catch (error) {
    if (error instanceof NoteWorkerRpcOwnerAbLocalPg16PolicyError) {
      return error;
    }
  }
  return null;
}

/** Pure offline regression gate run before loading a PostgreSQL driver. */
export function assertNoteWorkerRpcOwnerAbLocalPg16PolicyRegression() {
  const policy = NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_POLICY;
  const valid = validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(
    `postgresql://${RUNNER_ROLE}@${LOOPBACK_HOST}:55432/postgres`,
  );
  const hosted = capturePolicyError(() =>
    validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(
      `postgresql://${RUNNER_ROLE}@db.example.supabase.co:55432/postgres`,
    ),
  );
  const localhost = capturePolicyError(() =>
    validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(
      `postgresql://${RUNNER_ROLE}@localhost:55432/postgres`,
    ),
  );
  const defaultPort = capturePolicyError(() =>
    validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(
      `postgresql://${RUNNER_ROLE}@${LOOPBACK_HOST}:5432/postgres`,
    ),
  );
  const password = capturePolicyError(() =>
    validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(
      `postgresql://${RUNNER_ROLE}:forbidden@${LOOPBACK_HOST}:55432/postgres`,
    ),
  );
  const query = capturePolicyError(() =>
    validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(
      `postgresql://${RUNNER_ROLE}@${LOOPBACK_HOST}:55432/postgres?sslmode=disable`,
    ),
  );
  const wrongRole = capturePolicyError(() =>
    validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(
      `postgresql://postgres@${LOOPBACK_HOST}:55432/postgres`,
    ),
  );

  if (
    valid.postgresMajor !== 16 ||
    valid.applicationName !== policy.requiredApplicationName ||
    hosted?.code !== NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.targetDenied ||
    localhost?.code !== NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.targetDenied ||
    defaultPort?.code !== NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.portDenied ||
    password?.code !== NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.credentialsDenied ||
    query?.code !== NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.queryDenied ||
    wrongRole?.code !== NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.roleDenied
  ) {
    fail(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES.regressionFailed);
  }

  return Object.freeze({
    ok: true,
    policyVersion: policy.version,
    envName: NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_DATABASE_URL_ENV,
    expectedPostgresMajor: policy.expectedPostgresMajor,
    requiredHost: policy.requiredHost,
    requiredDatabaseRole: policy.requiredDatabaseRole,
    applicationName: policy.requiredApplicationName,
    managementApplicationName: policy.requiredManagementApplicationName,
    bootstrapMarkerName: policy.requiredBootstrapMarkerName,
    bootstrapMarkerValue: policy.requiredBootstrapMarkerValue,
    clusterName: policy.requiredClusterName,
    sslMode: "disabled",
    passwordMaterial: "absent",
  });
}
