import { types as nodeTypes } from "node:util";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const DIRECT_HOST_PATTERN = /^db\.([a-z0-9]{20})\.supabase\.co$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const RUNTIME_ROLE_NONCE_PATTERN = /^[a-f0-9]{16}$/;
const RUNTIME_ROLE_PREFIX =
  "careslink_v1_preview_runner_terminal_runtime_";
const MAXIMUM_STDIN_BYTES = 65_536;

export const COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY =
  Object.freeze({
    version: "2026-08-29.preview-runner-terminal-identity.2",
    productionProjectRef: "adocsnwnslxhxcjgbyee",
    requiredPort: 5432,
    cliPrimaryPoolerPort: 6543,
    requiredDatabase: "postgres",
    requiredDatabaseRole: "postgres",
    requiredScheme: "postgresql:",
    allowedSchemes: Object.freeze(["postgresql:", "postgres:"]),
    allowedSslModes: Object.freeze(["require", "verify-full"]),
    callerRole: "careslink_v1_preview_runner_terminal_caller",
    executorRole: "careslink_v1_preview_runner_terminal_executor",
    exactRpc:
      "careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)",
    runtimeRolePrefix: RUNTIME_ROLE_PREFIX,
    runtimeRoleLength: RUNTIME_ROLE_PREFIX.length + 16,
    runtimePasswordBytes: 32,
    runtimeValidityMs: 10 * 60 * 1_000,
    runtimeConnectionLimit: 1,
    maximumStdinBytes: MAXIMUM_STDIN_BYTES,
    maximumCaBytes: 64 * 1_024,
    applicationName: "careslink-preview-runner-terminal-identity",
    managementApplicationName:
      "careslink-preview-runner-terminal-identity-management",
  });

export const COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES =
  Object.freeze({
    argumentInvalid: "RUNNER_TERMINAL_IDENTITY_ARGUMENT_INVALID",
    stdinInvalid: "RUNNER_TERMINAL_IDENTITY_STDIN_INVALID",
    branchShapeInvalid: "RUNNER_TERMINAL_IDENTITY_BRANCH_JSON_INVALID",
    branchNotReady: "RUNNER_TERMINAL_IDENTITY_BRANCH_NOT_READY",
    productionDenied: "RUNNER_TERMINAL_IDENTITY_PRODUCTION_TARGET_DENIED",
    branchMismatch: "RUNNER_TERMINAL_IDENTITY_BRANCH_TARGET_MISMATCH",
    branchParentMismatch:
      "RUNNER_TERMINAL_IDENTITY_BRANCH_PARENT_MISMATCH",
    branchNotDisposable:
      "RUNNER_TERMINAL_IDENTITY_BRANCH_NOT_DISPOSABLE",
    databaseUrlInvalid: "RUNNER_TERMINAL_IDENTITY_DATABASE_URL_INVALID",
    databaseTargetDenied: "RUNNER_TERMINAL_IDENTITY_DATABASE_TARGET_DENIED",
    credentialMissing: "RUNNER_TERMINAL_IDENTITY_DATABASE_CREDENTIAL_MISSING",
    tlsDenied: "RUNNER_TERMINAL_IDENTITY_DATABASE_TLS_DENIED",
    roleNonceInvalid: "RUNNER_TERMINAL_IDENTITY_ROLE_NONCE_INVALID",
    sqlPolicyInvalid: "RUNNER_TERMINAL_IDENTITY_SQL_POLICY_INVALID",
    regressionFailed: "RUNNER_TERMINAL_IDENTITY_POLICY_REGRESSION_FAILED",
  });

const FIXED_ERROR_CODES = new Set(
  Object.values(
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES,
  ),
);

export class CommunicationNotePreviewRunnerTerminalIdentityPolicyError extends Error {
  constructor(code) {
    const fixedCode = FIXED_ERROR_CODES.has(code)
      ? code
      : COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
          .regressionFailed;
    super(fixedCode);
    this.name =
      "CommunicationNotePreviewRunnerTerminalIdentityPolicyError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePreviewRunnerTerminalIdentityPolicyError(code);
}

function plainRecord(value, code) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(code);
  }
  return value;
}

function dataString(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor &&
    "value" in descriptor &&
    typeof descriptor.value === "string"
    ? descriptor.value
    : null;
}

function dataBoolean(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor &&
      "value" in descriptor &&
      typeof descriptor.value === "boolean"
    ? descriptor.value
    : null;
}

function ownDataValue(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor)) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  return descriptor.value;
}

function hasExactKeys(object, expected) {
  const keys = Object.keys(object);
  return keys.length === expected.length &&
    expected.every((key) => keys.includes(key));
}

function parseBoundedJsonObject(input) {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    Buffer.byteLength(input, "utf8") > MAXIMUM_STDIN_BYTES ||
    CONTROL_CHARACTER_PATTERN.test(input.replace(/[\n\r\t]/g, ""))
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .stdinInvalid,
    );
  }
  const normalizedInput = input.trim();
  if (normalizedInput.length === 0) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .stdinInvalid,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(normalizedInput);
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  return plainRecord(
    parsed,
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
      .branchShapeInvalid,
  );
}

function firstSingleValue(object, keys) {
  const found = new Set(keys
    .map((key) => dataString(object, key))
    .filter((value) => value !== null && value.length > 0));
  if (found.size !== 1) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  return [...found][0];
}

function optionalSingleValue(object, keys) {
  const found = new Set(keys
    .map((key) => dataString(object, key))
    .filter((value) => value !== null && value.length > 0));
  if (found.size > 1) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  return found.size === 1 ? [...found][0] : null;
}

export function parseCommunicationNotePreviewRunnerTerminalIdentityArguments(
  argv,
) {
  if (!Array.isArray(argv)) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .argumentInvalid,
    );
  }
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  if (normalized.length !== 4) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .argumentInvalid,
    );
  }
  const values = new Map();
  for (const argument of normalized) {
    if (typeof argument !== "string" || !argument.startsWith("--")) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
          .argumentInvalid,
      );
    }
    const separator = argument.indexOf("=");
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (separator < 3 || value.length === 0 || values.has(key)) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
          .argumentInvalid,
      );
    }
    values.set(key, value);
  }
  const expectedBranchRef = values.get("expected-branch-ref");
  const expectedPostgresMajor = values.get("expected-pg-major");
  const sslRootCertPath = values.get("ssl-root-cert-path");
  const expectedSslRootCertSha256 = values.get(
    "expected-ssl-root-cert-sha256",
  );
  if (
    values.size !== 4 ||
    typeof expectedBranchRef !== "string" ||
    !PROJECT_REF_PATTERN.test(expectedBranchRef) ||
    !/^(16|17)$/.test(expectedPostgresMajor ?? "") ||
    typeof sslRootCertPath !== "string" ||
    sslRootCertPath.length < 2 ||
    sslRootCertPath.length > 2_048 ||
    !sslRootCertPath.startsWith("/") ||
    sslRootCertPath.includes("\\") ||
    sslRootCertPath.split("/").some(
      (segment, index) =>
        index > 0 && (segment === "" || segment === "." || segment === ".."),
    ) ||
    CONTROL_CHARACTER_PATTERN.test(sslRootCertPath) ||
    typeof expectedSslRootCertSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(expectedSslRootCertSha256)
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .argumentInvalid,
    );
  }
  if (
    expectedBranchRef ===
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY
      .productionProjectRef
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .productionDenied,
    );
  }
  return Object.freeze({
    expectedBranchRef,
    expectedPostgresMajor: Number(expectedPostgresMajor),
    sslRootCertPath,
    expectedSslRootCertSha256,
  });
}

/**
 * Reads the destructive reset runner's canonical in-memory envelope. The
 * metadata half must be a data-less, non-default, non-persistent child of the
 * source-pinned Production project; the credential half must independently
 * bind the same healthy branch ref and exact database targets.
 */
export function extractCommunicationNoteDisposablePreviewResetDatabaseTarget(
  input,
  options,
) {
  const optionObject = plainRecord(
    options,
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
      .argumentInvalid,
  );
  if (
    !hasExactKeys(optionObject, ["expectedBranchRef"]) ||
    typeof optionObject.expectedBranchRef !== "string" ||
    !PROJECT_REF_PATTERN.test(optionObject.expectedBranchRef)
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .argumentInvalid,
    );
  }
  const expectedBranchRef = optionObject.expectedBranchRef;
  const policy = COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY;
  if (expectedBranchRef === policy.productionProjectRef) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .productionDenied,
    );
  }

  const envelope = parseBoundedJsonObject(input);
  if (!hasExactKeys(envelope, ["metadata", "credentials"])) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  const metadata = plainRecord(
    ownDataValue(envelope, "metadata"),
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
      .branchShapeInvalid,
  );
  const credentials = plainRecord(
    ownDataValue(envelope, "credentials"),
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
      .branchShapeInvalid,
  );
  if (
    !hasExactKeys(metadata, [
      "ref",
      "parent_project_ref",
      "is_default",
      "persistent",
      "with_data",
      "status",
    ]) ||
    !hasExactKeys(credentials, [
      "REF",
      "STATUS",
      "POSTGRES_URL_NON_POOLING",
      "POSTGRES_URL",
    ])
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }

  const metadataRef = dataString(metadata, "ref");
  const parentProjectRef = dataString(metadata, "parent_project_ref");
  const metadataStatus = dataString(metadata, "status");
  const isDefault = dataBoolean(metadata, "is_default");
  const persistent = dataBoolean(metadata, "persistent");
  const withData = dataBoolean(metadata, "with_data");
  const credentialRef = dataString(credentials, "REF");
  const credentialStatus = dataString(credentials, "STATUS");
  if (
    !PROJECT_REF_PATTERN.test(metadataRef ?? "") ||
    !PROJECT_REF_PATTERN.test(parentProjectRef ?? "") ||
    isDefault === null ||
    persistent === null ||
    withData === null ||
    typeof metadataStatus !== "string" ||
    !PROJECT_REF_PATTERN.test(credentialRef ?? "") ||
    typeof credentialStatus !== "string"
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  if (metadataRef === policy.productionProjectRef || isDefault) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .productionDenied,
    );
  }
  if (metadataRef !== expectedBranchRef || credentialRef !== metadataRef) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchMismatch,
    );
  }
  if (parentProjectRef !== policy.productionProjectRef) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchParentMismatch,
    );
  }
  if (persistent || withData) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchNotDisposable,
    );
  }
  if (
    metadataStatus !== "ACTIVE_HEALTHY" ||
    credentialStatus !== "ACTIVE_HEALTHY"
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchNotReady,
    );
  }

  const target = extractCommunicationNotePreviewBranchDatabaseTarget(
    JSON.stringify(credentials),
    { expectedBranchRef },
  );
  return Object.freeze({
    descriptor: Object.freeze({
      ...target.descriptor,
      controlPlaneMetadata:
        "DATALESS_NONDEFAULT_NONPERSISTENT_PREVIEW_CROSS_BOUND",
      parentProjectRefPinned: true,
    }),
    takeAdminConnectionCandidates() {
      return target.takeAdminConnectionCandidates();
    },
  });
}

/**
 * Reads the credential-bearing JSON emitted by
 * `supabase branches get -o json` or its `--output-format json` envelope. The returned enumerable
 * descriptor is credential-free. The connection config is available once,
 * through a closure, so JSON evidence and error serialization cannot expose
 * the password or the original URL.
 */
export function extractCommunicationNotePreviewBranchDatabaseTarget(
  input,
  options,
) {
  const optionObject = plainRecord(
    options,
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
      .argumentInvalid,
  );
  if (
    Object.keys(optionObject).length !== 1 ||
    typeof optionObject.expectedBranchRef !== "string" ||
    !PROJECT_REF_PATTERN.test(optionObject.expectedBranchRef)
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .argumentInvalid,
    );
  }
  const expectedBranchRef = optionObject.expectedBranchRef;
  if (
    expectedBranchRef ===
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY
      .productionProjectRef
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .productionDenied,
    );
  }
  let root = parseBoundedJsonObject(input);
  const envelopeData = Object.getOwnPropertyDescriptor(root, "data");
  const envelopeResult = Object.getOwnPropertyDescriptor(root, "result");
  if (envelopeData && envelopeResult) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  const envelope = envelopeData ?? envelopeResult;
  if (envelope) {
    if (!("value" in envelope)) {
      fail(
        COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
          .branchShapeInvalid,
      );
    }
    root = plainRecord(
      envelope.value,
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  const branchRef = optionalSingleValue(root, [
    "REF",
    "ref",
    "PROJECT_REF",
    "project_ref",
  ]);
  if (branchRef !== null && !PROJECT_REF_PATTERN.test(branchRef)) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchShapeInvalid,
    );
  }
  if (
    branchRef ===
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY
        .productionProjectRef
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .productionDenied,
    );
  }
  if (branchRef !== null && branchRef !== expectedBranchRef) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchMismatch,
    );
  }
  const status = dataString(root, "STATUS") ?? dataString(root, "status");
  if (
    status !== null &&
    !new Set(["ACTIVE_HEALTHY", "ACTIVE", "RUNNING"]).has(status)
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .branchNotReady,
    );
  }
  const databaseUrl = firstSingleValue(root, [
    "POSTGRES_URL_NON_POOLING",
    "postgres_url_non_pooling",
  ]);
  const poolerDatabaseUrl = firstSingleValue(root, [
    "POSTGRES_URL",
    "postgres_url",
  ]);

  let url;
  let poolerUrl;
  try {
    url = new URL(databaseUrl);
    poolerUrl = new URL(poolerDatabaseUrl);
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .databaseUrlInvalid,
    );
  }
  const policy =
    COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY;
  if (
    !policy.allowedSchemes.includes(url.protocol) ||
    url.port !== String(policy.requiredPort) ||
    url.pathname !== `/${policy.requiredDatabase}` ||
    url.username !== policy.requiredDatabaseRole ||
    url.hash.length !== 0
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .databaseTargetDenied,
    );
  }
  const hostMatch = DIRECT_HOST_PATTERN.exec(url.hostname.toLowerCase());
  if (
    !hostMatch ||
    hostMatch[1] === policy.productionProjectRef ||
    hostMatch[1] !== expectedBranchRef
  ) {
    fail(
      hostMatch?.[1] === policy.productionProjectRef
        ? COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
            .productionDenied
        : COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
            .branchMismatch,
    );
  }
  if (url.password.length === 0) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .credentialMissing,
    );
  }
  const queryKeys = [...url.searchParams.keys()];
  if (
    queryKeys.length > 2 ||
    new Set(queryKeys).size !== queryKeys.length ||
    queryKeys.some((key) => !["sslmode", "connect_timeout"].includes(key)) ||
    (url.searchParams.has("sslmode") &&
      !policy.allowedSslModes.includes(url.searchParams.get("sslmode"))) ||
    (url.searchParams.has("connect_timeout") &&
      url.searchParams.get("connect_timeout") !== "10")
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .tlsDenied,
    );
  }

  let password;
  let poolerPassword;
  try {
    password = decodeURIComponent(url.password);
    poolerPassword = decodeURIComponent(poolerUrl.password);
  } catch {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .databaseUrlInvalid,
    );
  }
  if (password.length < 16 || CONTROL_CHARACTER_PATTERN.test(password)) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .credentialMissing,
    );
  }
  const poolerUser = `${policy.requiredDatabaseRole}.${expectedBranchRef}`;
  const poolerQueryKeys = [...poolerUrl.searchParams.keys()];
  if (
    !policy.allowedSchemes.includes(poolerUrl.protocol) ||
    !SESSION_POOLER_HOST_PATTERN.test(poolerUrl.hostname.toLowerCase()) ||
    poolerUrl.port !== String(policy.cliPrimaryPoolerPort) ||
    poolerUrl.pathname !== `/${policy.requiredDatabase}` ||
    poolerUrl.username !== poolerUser ||
    poolerUrl.hash.length !== 0 ||
    poolerPassword !== password ||
    poolerQueryKeys.length > 1 ||
    new Set(poolerQueryKeys).size !== poolerQueryKeys.length ||
    poolerQueryKeys.some((key) => key !== "connect_timeout") ||
    (poolerUrl.searchParams.has("connect_timeout") &&
      poolerUrl.searchParams.get("connect_timeout") !== "10")
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .databaseTargetDenied,
    );
  }
  let available = true;
  const descriptor = Object.freeze({
    ok: true,
    policyVersion: policy.version,
    connectionMode: "direct_then_session_pooler",
    projectRef: expectedBranchRef,
    databaseRole: policy.requiredDatabaseRole,
    hostname: url.hostname.toLowerCase(),
    sessionPoolerHostname: poolerUrl.hostname.toLowerCase(),
    port: policy.requiredPort,
    database: policy.requiredDatabase,
    tlsMode: "node-ca-verify-full",
    credentialMaterial: "process_memory_only_single_consumer",
  });
  return Object.freeze({
    descriptor,
    takeAdminConnectionCandidates() {
      if (!available || typeof password !== "string") {
        fail(
          COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
            .credentialMissing,
        );
      }
      available = false;
      const common = Object.freeze({
        database: descriptor.database,
        password,
      });
      const value = Object.freeze({
        direct: Object.freeze({
          ...common,
          mode: "direct",
          host: descriptor.hostname,
          port: descriptor.port,
          user: descriptor.databaseRole,
        }),
        sessionPooler: Object.freeze({
          ...common,
          mode: "session_pooler",
          host: descriptor.sessionPoolerHostname,
          port: policy.requiredPort,
          user: poolerUser,
        }),
      });
      password = undefined;
      return value;
    },
  });
}

export function createCommunicationNotePreviewRuntimeRoleName(nonceHex) {
  if (
    typeof nonceHex !== "string" ||
    !RUNTIME_ROLE_NONCE_PATTERN.test(nonceHex)
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .roleNonceInvalid,
    );
  }
  const roleName = `${RUNTIME_ROLE_PREFIX}${nonceHex}`;
  if (roleName.length !== 61) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .regressionFailed,
    );
  }
  return roleName;
}

export function assertCommunicationNotePreviewRunnerTerminalIdentitySqlPolicy(
  setupSql,
  quiesceSql,
  cleanupSql,
) {
  if (
    typeof setupSql !== "string" ||
    typeof quiesceSql !== "string" ||
    typeof cleanupSql !== "string"
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .sqlPolicyInvalid,
    );
  }
  const allSql = [setupSql, quiesceSql, cleanupSql];
  const forbidden = /^\s*(?:truncate|insert|update|delete)\b/im;
  const setupMarkers = [
    "RUNNER_TERMINAL_IDENTITY_SETUP_MANAGEMENT_UNSAFE",
    "RUNNER_TERMINAL_IDENTITY_SETUP_CONTRACT_DRIFT",
    "RUNNER_TERMINAL_IDENTITY_SETUP_LEDGER_NOT_EMPTY",
    "RUNNER_TERMINAL_IDENTITY_SETUP_POSTCHECK_FAILED",
    "with admin false, inherit false, set true",
    "connection limit 1",
    "password %L",
  ];
  const quiesceMarkers = [
    "RUNNER_TERMINAL_IDENTITY_QUIESCE_MANAGEMENT_UNSAFE",
    "RUNNER_TERMINAL_IDENTITY_QUIESCE_POSTCHECK_FAILED",
    "alter role %I nologin",
  ];
  const cleanupMarkers = [
    "RUNNER_TERMINAL_IDENTITY_CLEANUP_MANAGEMENT_UNSAFE",
    "RUNNER_TERMINAL_IDENTITY_CLEANUP_ACTIVE_SESSION",
    "RUNNER_TERMINAL_IDENTITY_CLEANUP_SURFACE_UNSAFE",
    "RUNNER_TERMINAL_IDENTITY_CLEANUP_ZERO_RESIDUE_FAILED",
    "revoke careslink_v1_preview_runner_terminal_caller",
    "drop role %I",
  ];
  if (
    allSql.some(
      (sql) =>
        sql.length < 400 ||
        forbidden.test(sql) ||
        /\b(?:raise\s+(?:notice|log|info)|copy\b|dblink\b)/i.test(sql),
    ) ||
    setupMarkers.some((marker) => !setupSql.includes(marker)) ||
    quiesceMarkers.some((marker) => !quiesceSql.includes(marker)) ||
    cleanupMarkers.some((marker) => !cleanupSql.includes(marker)) ||
    !setupSql.includes(policyLiteral("exactRpc")) ||
    !setupSql.includes(policyLiteral("callerRole")) ||
    setupSql.includes(policyLiteral("executorRole") + " to %I") ||
    !cleanupSql.includes(policyLiteral("callerRole"))
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .sqlPolicyInvalid,
    );
  }
  return Object.freeze({
    ok: true,
    setupParameterizedByLocalGuc: true,
    randomLoginNoInheritLocked: true,
    setOnlyMembershipLocked: true,
    exactRpcOnlyLocked: true,
    tableAndApiIsolationLocked: true,
    noLedgerWritesLocked: true,
    quiesceBeforeDropLocked: true,
    zeroResiduePostcheckLocked: true,
  });
}

function policyLiteral(key) {
  return COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY[key];
}

export function assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression() {
  const branchRef = "abcdefghijklmnopqrst";
  const secret = "sentinel-password-never-evidence";
  const input = JSON.stringify({
    REF: branchRef,
    STATUS: "ACTIVE_HEALTHY",
    POSTGRES_URL_NON_POOLING:
      `postgresql://postgres:${secret}@db.${branchRef}.supabase.co:5432/postgres?connect_timeout=10`,
    POSTGRES_URL:
      `postgresql://postgres.${branchRef}:${secret}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?connect_timeout=10`,
  });
  const target = extractCommunicationNotePreviewBranchDatabaseTarget(input, {
    expectedBranchRef: branchRef,
  });
  const serialized = JSON.stringify(target);
  const roleName = createCommunicationNotePreviewRuntimeRoleName(
    "0123456789abcdef",
  );
  let productionDenied = false;
  try {
    parseCommunicationNotePreviewRunnerTerminalIdentityArguments([
      `--expected-branch-ref=${COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY.productionProjectRef}`,
      "--expected-pg-major=16",
      "--ssl-root-cert-path=/tmp/supabase-ca.crt",
      `--expected-ssl-root-cert-sha256=${"a".repeat(64)}`,
    ]);
  } catch (error) {
    productionDenied =
      error instanceof
        CommunicationNotePreviewRunnerTerminalIdentityPolicyError &&
      error.code ===
        COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
          .productionDenied;
  }
  if (
    serialized.includes(secret) ||
    target.descriptor.projectRef !== branchRef ||
    roleName.length !== 61 ||
    !productionDenied
  ) {
    fail(
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES
        .regressionFailed,
    );
  }
  return Object.freeze({
    ok: true,
    policyVersion:
      COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY.version,
    productionProjectDenied: true,
    stdinCredentialRedacted: true,
    runtimeRoleLength: roleName.length,
  });
}
