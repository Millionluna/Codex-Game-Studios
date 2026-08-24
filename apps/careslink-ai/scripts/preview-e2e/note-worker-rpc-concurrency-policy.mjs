const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const DIRECT_HOST_PATTERN = /^db\.([a-z0-9]{20})\.supabase\.co$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const CONCURRENCY_RUNNER_ROLE =
  "careslink_v1_generation_concurrency_runner";
const ALLOWED_DATABASE_ROLES = Object.freeze([
  CONCURRENCY_RUNNER_ROLE,
]);

export const NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES = Object.freeze({
  invalidInput: "NOTE_WORKER_RPC_CONCURRENCY_POLICY_INVALID",
  urlInvalid: "NOTE_WORKER_RPC_DATABASE_URL_INVALID",
  schemeDenied: "NOTE_WORKER_RPC_DATABASE_SCHEME_DENIED",
  targetDenied: "NOTE_WORKER_RPC_DATABASE_TARGET_DENIED",
  productionTargetDenied: "NOTE_WORKER_RPC_PRODUCTION_TARGET_DENIED",
  targetMismatch: "NOTE_WORKER_RPC_DATABASE_TARGET_MISMATCH",
  portDenied: "NOTE_WORKER_RPC_DATABASE_PORT_DENIED",
  databaseNameDenied: "NOTE_WORKER_RPC_DATABASE_NAME_DENIED",
  credentialsDenied: "NOTE_WORKER_RPC_DATABASE_CREDENTIALS_DENIED",
  queryDenied: "NOTE_WORKER_RPC_DATABASE_QUERY_DENIED",
  tlsDenied: "NOTE_WORKER_RPC_DATABASE_TLS_DENIED",
  regressionFailed: "NOTE_WORKER_RPC_CONCURRENCY_POLICY_REGRESSION_FAILED",
});

export const NOTE_WORKER_RPC_CONCURRENCY_POLICY = Object.freeze({
  version: "2026-08-23.preview.1",
  productionProjectRef: "adocsnwnslxhxcjgbyee",
  requiredPort: 5432,
  requiredDatabase: "postgres",
  requiredSslMode: "verify-full",
  allowedConnectionModes: Object.freeze(["direct", "session_pooler"]),
  allowedDatabaseRoles: ALLOWED_DATABASE_ROLES,
  allowedSchemes: Object.freeze(["postgres:", "postgresql:"]),
  allowedQueryKeys: Object.freeze(["sslmode", "sslrootcert"]),
  maximumUrlLength: 8_192,
});

const FIXED_ERROR_CODES = new Set(
  Object.values(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES),
);

export class NoteWorkerRpcConcurrencyPolicyError extends Error {
  constructor(code) {
    const fixedCode = FIXED_ERROR_CODES.has(code)
      ? code
      : NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.invalidInput;
    super(fixedCode);
    this.name = "NoteWorkerRpcConcurrencyPolicyError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new NoteWorkerRpcConcurrencyPolicyError(code);
}

function expectedProjectRef(options) {
  if (options === undefined) {
    return null;
  }
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.getPrototypeOf(options) !== Object.prototype ||
    Object.keys(options).length !== 1 ||
    !Object.hasOwn(options, "expectedProjectRef") ||
    typeof options.expectedProjectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(options.expectedProjectRef)
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.invalidInput);
  }
  if (
    options.expectedProjectRef ===
    NOTE_WORKER_RPC_CONCURRENCY_POLICY.productionProjectRef
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.productionTargetDenied);
  }
  return options.expectedProjectRef;
}

function parseUrl(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > NOTE_WORKER_RPC_CONCURRENCY_POLICY.maximumUrlLength ||
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

function validateTarget(url) {
  const hostname = url.hostname.toLowerCase();
  const directMatch = DIRECT_HOST_PATTERN.exec(hostname);

  if (directMatch) {
    if (
      !ALLOWED_DATABASE_ROLES.includes(url.username) ||
      url.password.length === 0
    ) {
      fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.credentialsDenied);
    }
    return Object.freeze({
      connectionMode: "direct",
      hostname,
      projectRef: directMatch[1],
      databaseRole: url.username,
    });
  }

  if (!SESSION_POOLER_HOST_PATTERN.test(hostname)) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.targetDenied);
  }

  const poolerUsernameMatch = new RegExp(
    `^(${ALLOWED_DATABASE_ROLES.join("|")})\\.([a-z0-9]{20})$`,
  ).exec(url.username);
  if (!poolerUsernameMatch || url.password.length === 0) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.credentialsDenied);
  }
  return Object.freeze({
    connectionMode: "session_pooler",
    hostname,
    projectRef: poolerUsernameMatch[2],
    databaseRole: poolerUsernameMatch[1],
  });
}

function validateQuery(url) {
  if (url.hash.length > 0) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied);
  }

  const rawParameters =
    url.search.length === 0 ? [] : url.search.slice(1).split("&");
  const rawKeys = rawParameters.map((parameter) =>
    parameter.slice(0, parameter.indexOf("=")),
  );
  if (
    rawParameters.length >
      NOTE_WORKER_RPC_CONCURRENCY_POLICY.allowedQueryKeys.length ||
    rawParameters.some((parameter) => parameter.indexOf("=") < 1) ||
    rawKeys.some(
      (key) =>
        !NOTE_WORKER_RPC_CONCURRENCY_POLICY.allowedQueryKeys.includes(key),
    ) ||
    new Set(rawKeys).size !== rawKeys.length
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied);
  }

  const entries = [...url.searchParams.entries()];
  const allowedKeys = new Set(
    NOTE_WORKER_RPC_CONCURRENCY_POLICY.allowedQueryKeys,
  );
  const seenKeys = new Set();

  for (const [key] of entries) {
    if (!allowedKeys.has(key) || seenKeys.has(key)) {
      fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied);
    }
    seenKeys.add(key);
  }

  if (
    seenKeys.size !== allowedKeys.size ||
    [...allowedKeys].some((key) => !seenKeys.has(key))
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.tlsDenied);
  }

  if (
    url.searchParams.get("sslmode") !==
    NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredSslMode
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.tlsDenied);
  }

  const rootCertificatePath = url.searchParams.get("sslrootcert");
  if (
    typeof rootCertificatePath === "string" &&
    /[&=?;#]/.test(rootCertificatePath)
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied);
  }
  if (
    typeof rootCertificatePath !== "string" ||
    rootCertificatePath.length < 2 ||
    rootCertificatePath.length > 2_048 ||
    !rootCertificatePath.startsWith("/") ||
    rootCertificatePath.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(rootCertificatePath) ||
    rootCertificatePath
      .split("/")
      .some(
        (segment, index) =>
          index > 0 &&
          (segment === "" || segment === "." || segment === ".."),
      )
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.tlsDenied);
  }
}

/**
 * Credential-free validation for the live two-session harness. The returned
 * descriptor deliberately excludes the input URL, password and CA path; it
 * includes only the fixed allow-listed database role. After validation, the
 * live harness decodes only this URL into an explicit client configuration
 * and forces the validated CA plus rejectUnauthorized=true.
 */
export function validateNoteWorkerRpcConcurrencyDatabaseUrl(value, options) {
  const requiredProjectRef = expectedProjectRef(options);
  const url = parseUrl(value);

  if (
    !NOTE_WORKER_RPC_CONCURRENCY_POLICY.allowedSchemes.includes(url.protocol)
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.schemeDenied);
  }
  if (url.port !== String(NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredPort)) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.portDenied);
  }
  if (
    url.pathname !==
    `/${NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredDatabase}`
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.databaseNameDenied);
  }

  const target = validateTarget(url);
  if (
    target.projectRef ===
    NOTE_WORKER_RPC_CONCURRENCY_POLICY.productionProjectRef
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.productionTargetDenied);
  }
  if (requiredProjectRef !== null && target.projectRef !== requiredProjectRef) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.targetMismatch);
  }

  validateQuery(url);

  return Object.freeze({
    ok: true,
    policyVersion: NOTE_WORKER_RPC_CONCURRENCY_POLICY.version,
    connectionMode: target.connectionMode,
    projectRef: target.projectRef,
    databaseRole: target.databaseRole,
    hostname: target.hostname,
    port: NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredPort,
    database: NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredDatabase,
    sslMode: NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredSslMode,
    sslRootCertificate: "absolute_path_verified",
  });
}

/**
 * Live-harness entry point. Unlike the lower-level validator used by offline
 * regression fixtures, this requires the exact Management-plane branch ref.
 */
export function parsePreviewDatabaseTarget(value, expectedRef) {
  return validateNoteWorkerRpcConcurrencyDatabaseUrl(value, {
    expectedProjectRef: expectedRef,
  });
}

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

/**
 * Pure, offline startup gate. A generated live harness must call this before
 * reading credentials, opening files or creating either PostgreSQL session.
 */
export function assertNoteWorkerRpcConcurrencyPolicyRegression() {
  const previewRef = "abcdefghijklmnopqrst";
  const secretSentinel = "regression-secret-sentinel";
  const tlsQuery =
    "sslmode=verify-full&sslrootcert=%2Fetc%2Fssl%2Fcerts%2Fca-certificates.crt";
  const direct = validateNoteWorkerRpcConcurrencyDatabaseUrl(
    `postgresql://${CONCURRENCY_RUNNER_ROLE}:${secretSentinel}@db.${previewRef}.supabase.co:5432/postgres?${tlsQuery}`,
    { expectedProjectRef: previewRef },
  );
  const pooler = validateNoteWorkerRpcConcurrencyDatabaseUrl(
    `postgres://${CONCURRENCY_RUNNER_ROLE}.${previewRef}:${secretSentinel}@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres?${tlsQuery}`,
    { expectedProjectRef: previewRef },
  );

  const productionError = capturePolicyError(() =>
    validateNoteWorkerRpcConcurrencyDatabaseUrl(
      `postgresql://${CONCURRENCY_RUNNER_ROLE}:${secretSentinel}@db.${NOTE_WORKER_RPC_CONCURRENCY_POLICY.productionProjectRef}.supabase.co:5432/postgres?${tlsQuery}`,
    ),
  );
  const transactionPoolerError = capturePolicyError(() =>
    validateNoteWorkerRpcConcurrencyDatabaseUrl(
      `postgres://${CONCURRENCY_RUNNER_ROLE}.${previewRef}:${secretSentinel}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?${tlsQuery}`,
      { expectedProjectRef: previewRef },
    ),
  );
  const injectionError = capturePolicyError(() =>
    validateNoteWorkerRpcConcurrencyDatabaseUrl(
      `postgresql://${CONCURRENCY_RUNNER_ROLE}:${secretSentinel}@db.${previewRef}.supabase.co:5432/postgres?${tlsQuery}&options=-csearch_path%3Dpublic`,
      { expectedProjectRef: previewRef },
    ),
  );

  const observableEvidence = JSON.stringify({
    direct,
    pooler,
    productionError,
    transactionPoolerError,
    injectionError,
  });
  if (
    direct.connectionMode !== "direct" ||
    pooler.connectionMode !== "session_pooler" ||
    productionError?.code !==
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.productionTargetDenied ||
    transactionPoolerError?.code !==
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.portDenied ||
    injectionError?.code !==
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied ||
    observableEvidence.includes(secretSentinel)
  ) {
    fail(NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.regressionFailed);
  }

  return Object.freeze({
    ok: true,
    policyVersion: NOTE_WORKER_RPC_CONCURRENCY_POLICY.version,
    requiredPort: NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredPort,
    requiredDatabase: NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredDatabase,
    requiredSslMode: NOTE_WORKER_RPC_CONCURRENCY_POLICY.requiredSslMode,
    allowedConnectionModes:
      NOTE_WORKER_RPC_CONCURRENCY_POLICY.allowedConnectionModes,
  });
}

export const assertConcurrencyPolicyRegression =
  assertNoteWorkerRpcConcurrencyPolicyRegression;
