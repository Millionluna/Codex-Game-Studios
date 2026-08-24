import {
  NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES,
  NoteWorkerRpcConcurrencyPolicyError,
} from "./note-worker-rpc-concurrency-policy.mjs";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const RUNNER_ROLE = "careslink_v1_generation_concurrency_runner";

export const NOTE_WORKER_RPC_CONCURRENCY_LOCAL_PG16_POLICY = Object.freeze({
  version: "2026-08-24.local-pg16.1",
  expectedPostgresMajor: 16,
  deniedPort: 5432,
  minimumPort: 49_152,
  maximumPort: 65_535,
  requiredDatabase: "postgres",
  requiredDatabaseRole: RUNNER_ROLE,
  allowedHosts: Object.freeze(["127.0.0.1", "localhost"]),
  allowedSchemes: Object.freeze(["postgres:", "postgresql:"]),
  maximumUrlLength: 512,
});

function fail(code) {
  throw new NoteWorkerRpcConcurrencyPolicyError(code);
}

function parseUrl(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length >
      NOTE_WORKER_RPC_CONCURRENCY_LOCAL_PG16_POLICY.maximumUrlLength ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.urlInvalid);
  }

  try {
    return new URL(value);
  } catch {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.urlInvalid);
  }
}

/**
 * Credential-free, plaintext policy for a disposable local PostgreSQL 16
 * loopback cluster. This validator proves that no password material is
 * accepted; the isolated-cluster bootstrap separately owns the HBA posture.
 * This is intentionally a separate opt-in boundary; it cannot accept a
 * Supabase host, port 5432, password, query option or non-loopback target.
 */
export function validateLocalPg16LoopbackDatabaseUrl(value) {
  const url = parseUrl(value);
  const policy = NOTE_WORKER_RPC_CONCURRENCY_LOCAL_PG16_POLICY;

  if (!policy.allowedSchemes.includes(url.protocol)) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.schemeDenied);
  }
  if (!policy.allowedHosts.includes(url.hostname)) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.targetDenied);
  }
  if (
    url.username !== policy.requiredDatabaseRole ||
    url.password.length !== 0
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.credentialsDenied);
  }
  if (url.pathname !== `/${policy.requiredDatabase}`) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.databaseNameDenied);
  }
  if (value.includes("?") || value.includes("#")) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied);
  }

  const port = Number(url.port);
  if (
    !Number.isSafeInteger(port) ||
    port < policy.minimumPort ||
    port > policy.maximumPort ||
    port === policy.deniedPort
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.portDenied);
  }

  const canonicalUrl =
    `${url.protocol}//${policy.requiredDatabaseRole}@` +
    `${url.hostname}:${port}/${policy.requiredDatabase}`;
  if (value !== canonicalUrl) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.urlInvalid);
  }

  return Object.freeze({
    ok: true,
    policyVersion: policy.version,
    connectionMode: "local_pg16_loopback",
    projectRef: null,
    databaseRole: policy.requiredDatabaseRole,
    hostname: "127.0.0.1",
    port,
    database: policy.requiredDatabase,
    postgresMajor: policy.expectedPostgresMajor,
    sslMode: "disabled",
    passwordMaterial: "absent",
  });
}

export const parseLocalPg16LoopbackDatabaseTarget =
  validateLocalPg16LoopbackDatabaseUrl;

function capturePolicyError(operation) {
  try {
    operation();
  } catch (error) {
    if (error instanceof NoteWorkerRpcConcurrencyPolicyError) {
      return error;
    }
  }
  return null;
}

/** Pure offline regression gate run before loading the PostgreSQL driver. */
export function assertLocalPg16LoopbackPolicyRegression() {
  const policy = NOTE_WORKER_RPC_CONCURRENCY_LOCAL_PG16_POLICY;
  const valid = validateLocalPg16LoopbackDatabaseUrl(
    `postgresql://${RUNNER_ROLE}@127.0.0.1:55432/postgres`,
  );
  const hostedError = capturePolicyError(() =>
    validateLocalPg16LoopbackDatabaseUrl(
      `postgresql://${RUNNER_ROLE}@db.abcdefghijklmnopqrst.supabase.co:55432/postgres`,
    ),
  );
  const defaultPortError = capturePolicyError(() =>
    validateLocalPg16LoopbackDatabaseUrl(
      `postgresql://${RUNNER_ROLE}@127.0.0.1:5432/postgres`,
    ),
  );
  const credentialError = capturePolicyError(() =>
    validateLocalPg16LoopbackDatabaseUrl(
      `postgresql://${RUNNER_ROLE}:forbidden@127.0.0.1:55432/postgres`,
    ),
  );
  const queryError = capturePolicyError(() =>
    validateLocalPg16LoopbackDatabaseUrl(
      `postgresql://${RUNNER_ROLE}@127.0.0.1:55432/postgres?sslmode=disable`,
    ),
  );

  if (
    valid.connectionMode !== "local_pg16_loopback" ||
    valid.postgresMajor !== 16 ||
    hostedError?.code !==
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.targetDenied ||
    defaultPortError?.code !==
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.portDenied ||
    credentialError?.code !==
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.credentialsDenied ||
    queryError?.code !== NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.regressionFailed);
  }

  return Object.freeze({
    ok: true,
    policyVersion: policy.version,
    expectedPostgresMajor: policy.expectedPostgresMajor,
    deniedPort: policy.deniedPort,
    requiredDatabase: policy.requiredDatabase,
    allowedHosts: policy.allowedHosts,
    sslMode: "disabled",
    passwordMaterial: "absent",
  });
}
