import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  runCommunicationNotePreviewHostedChild,
} from "./communication-note-preview-hosted-child-channel.mjs";

const ENABLE_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_ENABLED";
const CONFIG_FD_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_CONFIG_FD";
const CA_FD_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_CA_FD";
const SECRET_FD_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_SECRET_FD";
const STATUS_FD_ENV = "CARESLINK_V1_M1N_HOSTED_LIVE_STATUS_FD";
const CONFIG_FD = 3;
const CA_FD = 4;
const SECRET_FD = 5;
const STATUS_FD = 6;
const CONFIG_MAXIMUM_BYTES = 16_384;
const SECRET_MAXIMUM_BYTES = 1_067;
const STATUS_MAXIMUM_BYTES = 256;
const CHILD_TIMEOUT_MS = 135_000;
const CHILD_KILL_GRACE_MS = 2_000;
const ADMIN_CLOSE_TIMEOUT_MS = 2_000;
const CONFIG_SCHEMA_VERSION =
  "config.communication-note-approved-runtime-adapters-hosted.2026-08-31.m1n.v1";
const DELIVERY_BINDING_DOMAIN =
  "CARESLINK_V1_M1N_STATIC_BRANCH_ADMIN_DELIVERY_V1";
const SECRET_MAGIC = Buffer.from("CLM1NSEC", "ascii");
const SECRET_VERSION = 1;
const MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-management";
const SUCCESS_STATUS =
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_PASSED";
const FALLBACK_STATUS =
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_INTERNAL_FAILED";
const DIRECT_UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SOURCE_MANIFEST_SCHEMA_VERSION =
  "source-manifest.communication-note-approved-runtime-adapters-hosted.2026-08-31.m1n.v1";
export const COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_MANIFEST_PATH =
  "scripts/preview-e2e/communication-note-preview-approved-runtime-adapters-hosted-source-manifest.json";
const EXPECTED_PG_PACKAGE_VERSION = "8.23.0";

export const COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_FAILURE_STATUSES =
  Object.freeze([
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_CONFIG_INVALID",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_CA_INVALID",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_SECRET_INVALID",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_DRIVER_INVALID",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_TARGET_FAILED",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_SETUP_FAILED",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_COMPOSITION_FAILED",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_PERSIST_FAILED",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_CLEANUP_FAILED",
    "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_POSTCHECK_FAILED",
    FALLBACK_STATUS,
  ]);

const OUTER_FAILURE_CODES = new Set([
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CA_INVALID",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CHILD_FAILED",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CLEANUP_FAILED",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CONNECTION_FAILED",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_DRIVER_INVALID",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_POSTCHECK_FAILED",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_PREFLIGHT_FAILED",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED",
  "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_STDIN_INVALID",
  ...COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_FAILURE_STATUSES,
]);

export class CommunicationNotePreviewApprovedRuntimeAdaptersHostedError extends Error {
  constructor(code) {
    const fixedCode = OUTER_FAILURE_CODES.has(code)
      ? code
      : "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_INTERNAL_FAILED";
    super(fixedCode);
    this.name = "CommunicationNotePreviewApprovedRuntimeAdaptersHostedError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePreviewApprovedRuntimeAdaptersHostedError(code);
}

export function parseCommunicationNotePreviewApprovedRuntimeAdaptersHostedArguments(
  argv,
) {
  if (!Array.isArray(argv)) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  const normalized = argv[0] === "--" ? argv.slice(1) : [...argv];
  const sourceRevisionArguments = normalized.filter((argument) =>
    typeof argument === "string" &&
    argument.startsWith("--expected-source-revision-sha256=")
  );
  if (normalized.length !== 5 || sourceRevisionArguments.length !== 1) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  const expectedSourceRevisionSha256 = sourceRevisionArguments[0].slice(
    "--expected-source-revision-sha256=".length,
  );
  if (!SHA256_PATTERN.test(expectedSourceRevisionSha256)) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  let identityArguments;
  try {
    identityArguments =
      parseCommunicationNotePreviewRunnerTerminalIdentityArguments(
        normalized.filter(
          (argument) => argument !== sourceRevisionArguments[0],
        ),
      );
  } catch {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  if (identityArguments.expectedPostgresMajor !== 17) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  return Object.freeze({
    ...identityArguments,
    expectedSourceRevisionSha256,
  });
}

export async function createCommunicationNotePreviewApprovedRuntimeAdaptersHostedSourceRevision(
  appDirectory,
) {
  const material = await loadSourceRevisionMaterial(appDirectory);
  return material.sourceRevisionSha256;
}

export async function readCommunicationNotePreviewApprovedRuntimeAdaptersHostedSourceManifest(
  appDirectory,
) {
  const material = await loadSourceRevisionMaterial(appDirectory);
  return Object.freeze({
    schemaVersion: SOURCE_MANIFEST_SCHEMA_VERSION,
    paths: material.paths,
    migrationVersions: material.migrationVersions,
  });
}

async function loadSourceRevisionMaterial(appDirectory) {
  if (typeof appDirectory !== "string" || appDirectory.length === 0) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
  }
  try {
    const manifestPath = join(
      appDirectory,
      COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_MANIFEST_PATH,
    );
    if (!(await lstat(manifestPath)).isFile()) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
    }
    const manifestBytes = await readFile(manifestPath);
    const manifestText = new TextDecoder("utf-8", { fatal: true }).decode(
      manifestBytes,
    );
    const manifest = JSON.parse(manifestText);
    const rootKeys = Object.keys(manifest).sort();
    if (
      JSON.stringify(rootKeys) !== JSON.stringify(["paths", "schemaVersion"]) ||
      manifest.schemaVersion !== SOURCE_MANIFEST_SCHEMA_VERSION ||
      !Array.isArray(manifest.paths) ||
      manifest.paths.length === 0 ||
      `${JSON.stringify(manifest, null, 2)}\n` !== manifestText
    ) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
    }
    const paths = [...manifest.paths];
    if (
      paths.some((relativePath) =>
        typeof relativePath !== "string" ||
        relativePath.length === 0 ||
        relativePath.startsWith("/") ||
        relativePath.includes("\\") ||
        CONTROL_CHARACTER_PATTERN.test(relativePath) ||
        relativePath.split("/").some(
          (segment) => segment.length === 0 || segment === "." || segment === "..",
        )
      ) ||
      new Set(paths).size !== paths.length ||
      JSON.stringify(paths) !== JSON.stringify([...paths].sort())
    ) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
    }
    const migrationPaths = paths.filter((relativePath) =>
      /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(relativePath)
    );
    const migrationEntries = (await readdir(
      join(appDirectory, "supabase/migrations"),
      { withFileTypes: true },
    )).filter((entry) => entry.name.endsWith(".sql"));
    if (migrationEntries.some((entry) => !entry.isFile())) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
    }
    const actualMigrationPaths = migrationEntries
      .map((entry) => `supabase/migrations/${entry.name}`)
      .sort();
    if (
      migrationPaths.length !== 41 ||
      JSON.stringify(migrationPaths) !== JSON.stringify(actualMigrationPaths)
    ) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
    }
    const digest = createHash("sha256");
    digest.update(
      COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_MANIFEST_PATH,
      "utf8",
    );
    digest.update("\0", "utf8");
    digest.update(manifestBytes);
    digest.update("\0", "utf8");
    for (const relativePath of paths) {
      const sourcePath = join(appDirectory, relativePath);
      if (!(await lstat(sourcePath)).isFile()) {
        fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
      }
      const contents = await readFile(sourcePath);
      digest.update(relativePath, "utf8");
      digest.update("\0", "utf8");
      digest.update(contents);
      digest.update("\0", "utf8");
    }
    return Object.freeze({
      sourceRevisionSha256: digest.digest("hex"),
      paths: Object.freeze(paths),
      migrationVersions: Object.freeze(migrationPaths.map((relativePath) =>
        relativePath.slice("supabase/migrations/".length, -".sql".length)
          .slice(0, 14)
      )),
    });
  } catch {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
  }
}

export function createCommunicationNotePreviewApprovedRuntimeAdaptersHostedDeliveryBinding(
  config,
) {
  const target = config?.target;
  const endpoint = target?.endpoint;
  const fields = [
    DELIVERY_BINDING_DOMAIN,
    config?.sourceRevisionSha256,
    target?.targetProjectRef,
    target?.controlPlaneEvidenceSha256,
    endpoint?.connectionMode,
    endpoint?.hostname,
    "5432",
    "postgres",
    endpoint?.usernameProjectRefSuffix ?? "-",
    config?.tlsRootCertificateSha256,
    config?.managementUser,
    config?.deliveryIssuedAt,
    config?.deliveryExpiresAt,
  ];
  if (
    fields.some((field) => typeof field !== "string" || field.length === 0)
  ) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  return createHash("sha256").update(fields.join("\n"), "utf8").digest("hex");
}

export function createCommunicationNotePreviewApprovedRuntimeAdaptersHostedSecretEnvelope(
  password,
  bindingSha256,
) {
  if (
    typeof password !== "string" ||
    !SHA256_PATTERN.test(bindingSha256 ?? "") ||
    CONTROL_CHARACTER_PATTERN.test(password) ||
    /^(?:postgres|postgresql):\/\//i.test(password)
  ) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  const passwordBytes = Buffer.from(password, "utf8");
  if (passwordBytes.length < 16 || passwordBytes.length > 1_024) {
    passwordBytes.fill(0);
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  const envelope = Buffer.alloc(
    SECRET_MAGIC.length + 1 + 32 + 2 + passwordBytes.length,
  );
  SECRET_MAGIC.copy(envelope, 0);
  envelope.writeUInt8(SECRET_VERSION, SECRET_MAGIC.length);
  Buffer.from(bindingSha256, "hex").copy(
    envelope,
    SECRET_MAGIC.length + 1,
  );
  envelope.writeUInt16BE(
    passwordBytes.length,
    SECRET_MAGIC.length + 1 + 32,
  );
  passwordBytes.copy(envelope, SECRET_MAGIC.length + 1 + 32 + 2);
  passwordBytes.fill(0);
  return envelope;
}

export function createCommunicationNotePreviewApprovedRuntimeAdaptersHostedPipeMaterial({
  candidate,
  expectedBranchRef,
  tlsRootCertificateSha256,
  sourceRevisionSha256,
  observedAt,
  password,
}) {
  const direct = candidate?.mode === "direct" &&
    candidate.host === `db.${expectedBranchRef}.supabase.co` &&
    candidate.user === "postgres";
  const session = candidate?.mode === "session_pooler" &&
    typeof candidate.host === "string" &&
    candidate.host.endsWith(".pooler.supabase.com") &&
    candidate.user === `postgres.${expectedBranchRef}`;
  if (
    !PROJECT_REF_PATTERN.test(expectedBranchRef ?? "") ||
    expectedBranchRef === IDENTITY_POLICY.productionProjectRef ||
    !SHA256_PATTERN.test(tlsRootCertificateSha256 ?? "") ||
    !SHA256_PATTERN.test(sourceRevisionSha256 ?? "") ||
    (!direct && !session) ||
    candidate.port !== 5432 ||
    candidate.database !== "postgres" ||
    candidate.password !== password
  ) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  const deliveryIssuedAt = requireCanonicalTimestamp(observedAt);
  const deliveryExpiresAt = new Date(
    Date.parse(deliveryIssuedAt) + 60_000,
  ).toISOString();
  const targetExpiresAt = new Date(
    Date.parse(deliveryIssuedAt) + 4 * 60_000,
  ).toISOString();
  const endpoint = Object.freeze({
    connectionMode: direct ? "DIRECT" : "SUPAVISOR_SESSION",
    hostname: candidate.host,
    port: 5432,
    database: "postgres",
    usernameProjectRefSuffix: direct ? null : expectedBranchRef,
  });
  const controlPlaneEvidenceSha256 = createHash("sha256").update(
    JSON.stringify({
      defaultBranch: false,
      parentProjectRef: IDENTITY_POLICY.productionProjectRef,
      persistent: false,
      postgresMajor: 17,
      projectStatus: "ACTIVE_HEALTHY",
      targetProjectRef: expectedBranchRef,
      withData: false,
    }),
    "utf8",
  ).digest("hex");
  const config = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    sourceRevisionSha256,
    target: Object.freeze({
      source: "SUPABASE_CONTROL_PLANE",
      targetProjectRef: expectedBranchRef,
      parentProjectRef: IDENTITY_POLICY.productionProjectRef,
      defaultBranch: false,
      persistent: false,
      withData: false,
      postgresMajor: 17,
      projectStatus: "ACTIVE_HEALTHY",
      observedAt: deliveryIssuedAt,
      expiresAt: targetExpiresAt,
      controlPlaneEvidenceSha256,
      endpoint,
    }),
    tlsRootCertificateSha256,
    managementUser: candidate.user,
    credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
    sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
    deliveryIssuedAt,
    deliveryExpiresAt,
    secretEnvelopeBindingSha256: "",
    rawDsnPresent: false,
  };
  config.secretEnvelopeBindingSha256 =
    createCommunicationNotePreviewApprovedRuntimeAdaptersHostedDeliveryBinding(
      config,
    );
  const frozenConfig = deepFreeze(config);
  const serializedConfig = JSON.stringify(frozenConfig);
  if (Buffer.byteLength(serializedConfig, "utf8") > CONFIG_MAXIMUM_BYTES) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  return Object.freeze({
    config: frozenConfig,
    configPayload: Buffer.from(serializedConfig, "utf8"),
    secretPayload:
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedSecretEnvelope(
        password,
        frozenConfig.secretEnvelopeBindingSha256,
      ),
  });
}

export function createCommunicationNotePreviewApprovedRuntimeAdaptersHostedChildEnvironment(
  baseEnvironment,
) {
  try {
    return createCommunicationNotePreviewHostedChildEnvironment({
      baseEnvironment,
      enableEnvironmentKey: ENABLE_ENV,
      inputPipeBindings: [
        { environmentKey: CONFIG_FD_ENV, fd: CONFIG_FD },
        { environmentKey: CA_FD_ENV, fd: CA_FD },
        { environmentKey: SECRET_FD_ENV, fd: SECRET_FD },
      ],
      statusPipeBinding: { environmentKey: STATUS_FD_ENV, fd: STATUS_FD },
    });
  } catch {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
}

export function resolveCommunicationNotePreviewApprovedRuntimeAdaptersHostedPgDriver() {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve("pg/package.json");
    const packageRoot = dirname(packagePath);
    const packageValue = require(packagePath);
    const entryPath = require.resolve("pg");
    if (
      !packageValue ||
      typeof packageValue !== "object" ||
      packageValue.version !== EXPECTED_PG_PACKAGE_VERSION ||
      (entryPath !== packageRoot && !entryPath.startsWith(`${packageRoot}${sep}`))
    ) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_DRIVER_INVALID");
    }
    return Object.freeze({
      entryUrl: pathToFileURL(entryPath).href,
      version: EXPECTED_PG_PACKAGE_VERSION,
    });
  } catch (error) {
    if (error instanceof CommunicationNotePreviewApprovedRuntimeAdaptersHostedError) {
      throw error;
    }
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_DRIVER_INVALID");
  }
}

export function createCommunicationNotePreviewApprovedRuntimeAdaptersHostedEvidence(
  connectionMode,
) {
  if (connectionMode !== "DIRECT" && connectionMode !== "SUPAVISOR_SESSION") {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  return deepFreeze({
    ok: true,
    gate:
      "COMMUNICATION_NOTE_M1Q_APPROVED_RUNTIME_ADAPTERS_HOSTED_NEGATIVE_PATHS",
    postgresMajor: 17,
    actualPgPackageVersion: EXPECTED_PG_PACKAGE_VERSION,
    actualConnectionMode: connectionMode,
    terminalState: "ACCEPTED",
    scenarioCount: 3,
    negativeTerminalWritesAbsentVerified: true,
    m1mCompositionDriven: true,
    callerProvidedSourceRevisionPinVerified: true,
    sourceManifestValidated: true,
    sourceRevisionTransitiveClosureAttested: false,
    targetControlPlaneObservationValidated: true,
    projectRefBinding: "TEST_ONLY_PROCESS_EPHEMERAL_HMAC_SHA256",
    tlsMode: "CLIENT_PINNED_CA_VERIFY_FULL",
    managementCredentialClass:
      "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
    deliveryTransport: "ANONYMOUS_FD_SINGLE_READ",
    managementDeliveryCrossOpenReplayProtected: true,
    managementDeliveryReplayRegistryScope: "FACTORY",
    deliveryLifetimeMaximumMs: 60_000,
    underlyingCredentialShortLived: false,
    underlyingCredentialExpiryAttested: false,
    rotationTested: false,
    abortPathLiveTested: true,
    timeoutPathLiveTested: true,
    postgresStatementTimeoutSqlstate57014Verified: true,
    postgresStatementTimeoutInTransactionVerified: true,
    postgresStatementTimeoutRollbackAndResetVerified: true,
    highLevelDatabaseSettlementDeadlineTargetedTimerTested: true,
    highLevelDatabaseSettlementDeadlineWallClockTested: false,
    externalCallerAbortLiveTested: false,
    connectionBoundAbortHardCloseLiveTested: true,
    watchdogAbortInFlightTransactionVerified: true,
    processMemoryZeroizationAttested: false,
    runtimeRoleCount: 0,
    runtimeSessionCount: 0,
    runtimeMembershipCount: 0,
    apiPrivilegeCount: 0,
    credentialVerifierHashOnlyCount: 3,
    rawCredentialMaterialInEvidence: false,
    rawCredentialMaterialInDurableLedger: false,
    rawCredentialMaterialInProcessDuringRun: true,
    branchDeletionVerifiedByRunner: false,
    callerMustDeleteBranchAfterRun: true,
    nonSuccessRequiresBranchDeletion: true,
    activationApproved: false,
    ready: false,
  });
}

function createDatabaseConnectionConfig(candidate, certificate, password) {
  return Object.freeze({
    host: candidate.host,
    port: 5432,
    database: "postgres",
    user: candidate.user,
    password,
    application_name: MANAGEMENT_APPLICATION_NAME,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    statement_timeout: 9_000,
    options: "-c row_security=on",
    client_encoding: "UTF8",
    sslnegotiation: "postgres",
    ssl: Object.freeze({ ca: certificate, rejectUnauthorized: true }),
  });
}

function safeOwnErrorCode(error) {
  if (!error || typeof error !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor && "value" in descriptor &&
      typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function hardDestroyClientStream(client) {
  try {
    const stream = client?.connection?.stream;
    if (typeof stream?.destroy !== "function") return false;
    stream.destroy();
    return stream.destroyed === true;
  } catch {
    return false;
  }
}

function assertHardDestroyableVerifiedPreviewTlsConnection(client) {
  assertVerifiedPreviewTlsConnection(client);
  if (typeof client?.connection?.stream?.destroy !== "function") {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CONNECTION_FAILED");
  }
}

async function closeQuietly(client) {
  if (!client) return "GRACEFUL";
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CLOSE_TIMEOUT"),
          ),
        ADMIN_CLOSE_TIMEOUT_MS,
      );
    });
    await Promise.race([
      Promise.resolve().then(() => client.end()),
      timeout,
    ]);
    return "GRACEFUL";
  } catch {
    return hardDestroyClientStream(client)
      ? "HARD_DESTROYED"
      : "UNCONFIRMED";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function closeFinalAdmin(client) {
  if ((await closeQuietly(client)) !== "GRACEFUL") {
    // The caller must continue with the terminal branch-delete recovery.
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CLEANUP_FAILED");
  }
}

async function connectPreferredAdmin(Client, candidates, certificate) {
  let direct = new Client(createDatabaseConnectionConfig(
    candidates.direct,
    certificate,
    candidates.direct.password,
  ));
  direct.on("error", () => {});
  try {
    await direct.connect();
    assertHardDestroyableVerifiedPreviewTlsConnection(direct);
    return Object.freeze({ client: direct, candidate: candidates.direct });
  } catch (error) {
    const directCloseOutcome = await closeQuietly(direct);
    direct = undefined;
    if (
      directCloseOutcome === "UNCONFIRMED" ||
      !DIRECT_UNREACHABLE_CODES.has(safeOwnErrorCode(error))
    ) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CONNECTION_FAILED");
    }
  }
  const session = new Client(createDatabaseConnectionConfig(
    candidates.sessionPooler,
    certificate,
    candidates.sessionPooler.password,
  ));
  session.on("error", () => {});
  try {
    await session.connect();
    assertHardDestroyableVerifiedPreviewTlsConnection(session);
    return Object.freeze({
      client: session,
      candidate: candidates.sessionPooler,
    });
  } catch {
    await closeQuietly(session);
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CONNECTION_FAILED");
  }
}

async function verifyPreflight(admin, expectedMigrationVersions) {
  if (
    !Array.isArray(expectedMigrationVersions) ||
    expectedMigrationVersions.length !== 41 ||
    expectedMigrationVersions.some((version) => !/^\d{14}$/.test(version))
  ) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_PREFLIGHT_FAILED");
  }
  try {
    const result = await admin.query(`select
      current_user = 'postgres' and session_user = 'postgres' as identity_ok,
      pg_catalog.current_database() = 'postgres' as database_ok,
      pg_catalog.current_setting('application_name') = $1::pg_catalog.text
        as application_ok,
      pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
        10000 = 17 as postgres_ok,
      pg_catalog.current_setting('row_security') = 'on' as row_security_ok,
      pg_catalog.to_regnamespace('careslink_v1_runtime_broker') is not null
        as broker_installed,
      (select coalesce(
          pg_catalog.array_agg(
            version::pg_catalog.text order by version::pg_catalog.text
          ),
          '{}'::pg_catalog.text[]
        ) = $2::pg_catalog.text[]
        from supabase_migrations.schema_migrations) as migrations_ok,
      not exists (
        select 1 from careslink_v1_runtime_broker.acquisitions
      ) as broker_empty,
      not exists (
        select 1 from careslink_v1_generation.communication_note_preview_authorizations
        union all select 1 from careslink_v1_generation.communication_note_preview_authorization_revocations
        union all select 1 from careslink_v1_generation.communication_note_preview_claims
        union all select 1 from careslink_v1_generation.communication_note_preview_dispatch_reservations
        union all select 1 from careslink_v1_generation.communication_note_preview_dispatch_receipts
        union all select 1 from careslink_v1_generation.communication_note_preview_runner_terminals
      ) as generation_empty,
      not exists (
        select 1 from pg_catalog.pg_roles
        where rolname ~ '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as runtime_roles_empty`, [
        MANAGEMENT_APPLICATION_NAME,
        expectedMigrationVersions,
      ]);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      !row ||
      [
        "identity_ok",
        "database_ok",
        "application_ok",
        "postgres_ok",
        "row_security_ok",
        "broker_installed",
        "migrations_ok",
        "broker_empty",
        "generation_empty",
        "runtime_roles_empty",
      ].some((key) => row[key] !== true)
    ) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_PREFLIGHT_FAILED");
    }
  } catch (error) {
    if (error instanceof CommunicationNotePreviewApprovedRuntimeAdaptersHostedError) {
      throw error;
    }
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_PREFLIGHT_FAILED");
  }
}

async function listAllAcquisitions(admin) {
  const result = await admin.query(`select acquisition_digest, state
    from careslink_v1_runtime_broker.acquisitions
    order by acquisition_digest`);
  const acquisitions = result.rows.map((row) => Object.freeze({
    digest: row.acquisition_digest,
    state: row.state,
  }));
  if (acquisitions.some(({ digest, state }) =>
    !SHA256_PATTERN.test(digest ?? "") ||
    !["RESERVED", "ISSUED_UNBOUND", "ACTIVE", "TOMBSTONED", "REVOKED"]
      .includes(state)
  )) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CLEANUP_FAILED");
  }
  return acquisitions;
}

async function cleanupAllAcquisitions(admin) {
  try {
    for (const { digest, state } of await listAllAcquisitions(admin)) {
      if (state !== "REVOKED") {
        await admin.query(
          "select careslink_v1_runtime_broker.tombstone($1::pg_catalog.text)",
          [digest],
        );
      }
      await admin.query(
        "select careslink_v1_runtime_broker.finalize($1::pg_catalog.text)",
        [digest],
      );
      const result = await admin.query(
        "select careslink_v1_runtime_broker.inspect($1::pg_catalog.text) as data",
        [digest],
      );
      if (
        result.rowCount !== 1 ||
        result.rows[0]?.data?.status !== "REVOKED_ATTESTED"
      ) {
        fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CLEANUP_FAILED");
      }
    }
  } catch (error) {
    if (error instanceof CommunicationNotePreviewApprovedRuntimeAdaptersHostedError) {
      throw error;
    }
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CLEANUP_FAILED");
  }
}

async function verifyCleanupResidueAbsent(admin) {
  try {
    const result = await admin.query(`select
      not exists (
        select 1 from careslink_v1_runtime_broker.acquisitions
        where state is distinct from 'REVOKED'
          or future_issuance_blocked is not true
          or tombstoned_at is null
          or revoked_at is null
          or reusable is distinct from false
          or raw_credential_material_present is distinct from false
          or not coalesce(
            (
              issued_at is null
              and reported_session_disposition = 'NOT_ACQUIRED'
              and reported_credential_disposition = 'NOT_ISSUED'
            )
            or (
              issued_at is not null
              and reported_session_disposition = 'DESTROYED'
              and reported_credential_disposition = 'REVOKED'
            ),
            false
          )
      ) as acquisitions_revoked,
      not exists (
        select 1 from pg_catalog.pg_roles
        where rolname ~ '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as roles_absent,
      not exists (
        select 1 from pg_catalog.pg_stat_activity
        where usename ~ '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as sessions_absent,
      not exists (
        select 1 from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as member_role on member_role.oid = membership.member
        where member_role.rolname ~ '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as memberships_absent,
      (select pg_catalog.count(*) from pg_catalog.unnest(array[
        'anon','authenticated','service_role','authenticator'
      ]::pg_catalog.text[]) as api(role_name)
      where pg_catalog.has_schema_privilege(
        api.role_name, 'careslink_v1_runtime_broker', 'USAGE'
      ) or exists (
        select 1 from pg_catalog.pg_proc as procedure
        where procedure.pronamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and procedure.prokind in ('f', 'w')
          and pg_catalog.has_function_privilege(
            api.role_name, procedure.oid, 'EXECUTE'
          )
      ) or exists (
        select 1 from pg_catalog.pg_class as relation
        where relation.relnamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and relation.relkind in ('r', 'p', 'v', 'm', 'f')
          and pg_catalog.has_table_privilege(
            api.role_name, relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
      ) or exists (
        select 1 from pg_catalog.pg_class as sequence
        where sequence.relnamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and sequence.relkind = 'S'
          and pg_catalog.has_sequence_privilege(
            api.role_name, sequence.oid, 'USAGE,SELECT,UPDATE'
          )
      ))::pg_catalog.int4 as api_privilege_count,
      not exists (
        select 1 from careslink_v1_runtime_broker.acquisitions
        where (issued_at is null and credential_verifier_sha256 is not null)
          or (
            issued_at is not null
            and not coalesce(
              credential_verifier_sha256 ~ '^[a-f0-9]{64}$', false
            )
          )
      ) as verifier_state_valid`);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      !row ||
      row.acquisitions_revoked !== true ||
      row.roles_absent !== true ||
      row.sessions_absent !== true ||
      row.memberships_absent !== true ||
      Number(row.api_privilege_count) !== 0 ||
      row.verifier_state_valid !== true
    ) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CLEANUP_FAILED");
    }
  } catch (error) {
    if (error instanceof CommunicationNotePreviewApprovedRuntimeAdaptersHostedError) {
      throw error;
    }
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CLEANUP_FAILED");
  }
}

export const COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_TEST_ONLY =
  Object.freeze({
    closeFinalAdmin,
    connectPreferredAdmin,
    cleanupAllAcquisitions,
    verifyCleanupResidueAbsent,
    verifyPostcondition,
    verifyPreflight,
  });

async function verifyPostcondition(admin) {
  try {
    const result = await admin.query(`select
      (select pg_catalog.count(*) = 3
        and pg_catalog.count(*) filter (
          where state = 'REVOKED'
            and future_issuance_blocked
            and reported_session_disposition = 'DESTROYED'
            and reported_credential_disposition = 'REVOKED'
            and not reusable
            and not raw_credential_material_present
            and issued_at is not null
            and tombstoned_at is not null
            and revoked_at is not null
            and credential_verifier_sha256 ~ '^[a-f0-9]{64}$'
        ) = 3
        from careslink_v1_runtime_broker.acquisitions) as acquisition_ok,
      (select pg_catalog.count(*) = 3
        from careslink_v1_runtime_broker.acquisitions as acquisition
        where acquisition.bound_backend_pid is not null
          and acquisition.bound_backend_start is not null
          and not exists (
            select 1 from pg_catalog.pg_stat_activity as activity
            where activity.pid = acquisition.bound_backend_pid
              and activity.backend_start = acquisition.bound_backend_start
          )) as exact_pids_drained,
      not exists (
        select 1 from pg_catalog.pg_roles
        where rolname ~ '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as roles_absent,
      not exists (
        select 1 from pg_catalog.pg_stat_activity
        where usename ~ '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as sessions_absent,
      not exists (
        select 1 from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as member_role on member_role.oid = membership.member
        where member_role.rolname ~ '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
      ) as memberships_absent,
      (select pg_catalog.count(*) from pg_catalog.unnest(array[
        'anon','authenticated','service_role','authenticator'
      ]::pg_catalog.text[]) as api(role_name)
      where pg_catalog.has_schema_privilege(
        api.role_name, 'careslink_v1_runtime_broker', 'USAGE'
      ) or exists (
        select 1 from pg_catalog.pg_proc as procedure
        where procedure.pronamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and procedure.prokind in ('f', 'w')
          and pg_catalog.has_function_privilege(
            api.role_name, procedure.oid, 'EXECUTE'
          )
      ) or exists (
        select 1 from pg_catalog.pg_class as relation
        where relation.relnamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and relation.relkind in ('r', 'p', 'v', 'm', 'f')
          and pg_catalog.has_table_privilege(
            api.role_name, relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
      ) or exists (
        select 1 from pg_catalog.pg_class as sequence
        where sequence.relnamespace =
          'careslink_v1_runtime_broker'::pg_catalog.regnamespace
          and sequence.relkind = 'S'
          and pg_catalog.has_sequence_privilege(
            api.role_name, sequence.oid, 'USAGE,SELECT,UPDATE'
          )
      ))::pg_catalog.int4 as api_privilege_count,
      (select pg_catalog.count(*) from careslink_v1_runtime_broker.acquisitions
        where issued_at is not null
          and credential_verifier_sha256 ~ '^[a-f0-9]{64}$'
      )::pg_catalog.int4 as verifier_hash_only_count,
      pg_catalog.jsonb_build_array(
        (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_authorizations),
        (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_authorization_revocations),
        (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_claims),
        (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_dispatch_reservations),
        (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_dispatch_receipts),
        (select pg_catalog.count(*) from careslink_v1_generation.communication_note_preview_runner_terminals)
      ) as ledger_counts`);
    const row = result.rows[0];
    if (
      result.rowCount !== 1 ||
      !row ||
      row.acquisition_ok !== true ||
      row.exact_pids_drained !== true ||
      row.roles_absent !== true ||
      row.sessions_absent !== true ||
      row.memberships_absent !== true ||
      Number(row.api_privilege_count) !== 0 ||
      Number(row.verifier_hash_only_count) !== 3 ||
      JSON.stringify(row.ledger_counts) !== "[3,0,3,3,3,1]"
    ) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_POSTCHECK_FAILED");
    }
  } catch (error) {
    if (error instanceof CommunicationNotePreviewApprovedRuntimeAdaptersHostedError) {
      throw error;
    }
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_POSTCHECK_FAILED");
  }
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > IDENTITY_POLICY.maximumStdinBytes) {
      fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_STDIN_INVALID");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

async function runHostedChild({
  appDirectory,
  configPayload,
  certificateBuffer,
  secretPayload,
}) {
  const require = createRequire(import.meta.url);
  let vitestCli;
  try {
    vitestCli = join(
      dirname(require.resolve("vitest/package.json")),
      "vitest.mjs",
    );
  } catch {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_DRIVER_INVALID");
  }
  const liveTest = join(
    appDirectory,
    "src/lib/v1/communication-note-preview-approved-runtime-adapters-hosted.live.test.ts",
  );
  try {
    await runCommunicationNotePreviewHostedChild({
      executable: process.execPath,
      args: [
        vitestCli,
        "run",
        liveTest,
        "--pool=threads",
        "--maxWorkers=1",
        "--reporter=dot",
      ],
      cwd: appDirectory,
      environment:
        createCommunicationNotePreviewApprovedRuntimeAdaptersHostedChildEnvironment(
          process.env,
        ),
      inputPipes: [
        { fd: CONFIG_FD, payload: configPayload, maximumBytes: CONFIG_MAXIMUM_BYTES },
        { fd: CA_FD, payload: certificateBuffer, maximumBytes: IDENTITY_POLICY.maximumCaBytes },
        { fd: SECRET_FD, payload: secretPayload, maximumBytes: SECRET_MAXIMUM_BYTES },
      ],
      statusFd: STATUS_FD,
      successStatus: SUCCESS_STATUS,
      failureStatuses:
        COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_FAILURE_STATUSES,
      fallbackStatus: FALLBACK_STATUS,
      pipeFailureStatus: FALLBACK_STATUS,
      timeoutMs: CHILD_TIMEOUT_MS,
      killGraceMs: CHILD_KILL_GRACE_MS,
      maximumStatusBytes: STATUS_MAXIMUM_BYTES,
    });
  } catch (error) {
    if (error instanceof CommunicationNotePreviewHostedChildChannelError) {
      const childStatus = error.childStatus;
      fail(
        COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_FAILURE_STATUSES
            .includes(childStatus)
          ? childStatus
          : "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CHILD_FAILED",
      );
    }
    if (error instanceof CommunicationNotePreviewApprovedRuntimeAdaptersHostedError) {
      throw error;
    }
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CHILD_FAILED");
  }
}

async function main() {
  assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression();
  const args =
    parseCommunicationNotePreviewApprovedRuntimeAdaptersHostedArguments(
      process.argv.slice(2),
    );
  if (
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    typeof process.env.NODE_OPTIONS === "string" ||
    typeof process.env.NODE_PATH === "string" ||
    Object.entries(process.env).some(
      ([key, value]) => /^PG[A-Z0-9_]*$/.test(key) && value,
    )
  ) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  const appDirectory = fileURLToPath(new URL("../../", import.meta.url));
  const sourceMaterial = await loadSourceRevisionMaterial(appDirectory);
  if (
    sourceMaterial.sourceRevisionSha256 !==
    args.expectedSourceRevisionSha256
  ) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_REVISION_FAILED");
  }
  const pgDriver =
    resolveCommunicationNotePreviewApprovedRuntimeAdaptersHostedPgDriver();
  let branchJson = await readBoundedStdin();
  const target = extractCommunicationNoteDisposablePreviewResetDatabaseTarget(
    branchJson,
    { expectedBranchRef: args.expectedBranchRef },
  );
  branchJson = undefined;
  const [pgNamespace, certificateBuffer] = await Promise.all([
    import(pgDriver.entryUrl),
    readFile(args.sslRootCertPath),
  ]);
  const Client = pgNamespace?.Client ?? pgNamespace?.default?.Client;
  if (typeof Client !== "function") {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_DRIVER_INVALID");
  }
  if (
    certificateBuffer.length === 0 ||
    certificateBuffer.length > IDENTITY_POLICY.maximumCaBytes ||
    createHash("sha256").update(certificateBuffer).digest("hex") !==
      args.expectedSslRootCertSha256 ||
    certificateBuffer.includes(Buffer.from("PRIVATE KEY", "ascii")) ||
    !certificateBuffer.includes(Buffer.from("-----BEGIN CERTIFICATE-----", "ascii")) ||
    !certificateBuffer.includes(Buffer.from("-----END CERTIFICATE-----", "ascii"))
  ) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_CA_INVALID");
  }
  const certificate = certificateBuffer.toString("utf8");
  const candidates = target.takeAdminConnectionCandidates();
  const connected = await connectPreferredAdmin(Client, candidates, certificate);
  let primaryFailure;
  let cleanupFailure;
  let pipeMaterial;
  try {
    await verifyPreflight(
      connected.client,
      sourceMaterial.migrationVersions,
    );
    const now = new Date().toISOString();
    pipeMaterial =
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedPipeMaterial({
        candidate: connected.candidate,
        expectedBranchRef: args.expectedBranchRef,
        tlsRootCertificateSha256: args.expectedSslRootCertSha256,
        sourceRevisionSha256: sourceMaterial.sourceRevisionSha256,
        observedAt: now,
        password: connected.candidate.password,
      });
    await runHostedChild({
      appDirectory,
      configPayload: pipeMaterial.configPayload,
      certificateBuffer,
      secretPayload: pipeMaterial.secretPayload,
    });
    await verifyPostcondition(connected.client);
  } catch (error) {
    primaryFailure = error;
  } finally {
    pipeMaterial?.secretPayload?.fill(0);
    try {
      await cleanupAllAcquisitions(connected.client);
      await verifyCleanupResidueAbsent(connected.client);
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      await closeFinalAdmin(connected.client);
    } catch (error) {
      if (!cleanupFailure) cleanupFailure = error;
    }
  }
  if (cleanupFailure) throw cleanupFailure;
  if (primaryFailure) throw primaryFailure;
  const mode = connected.candidate.mode === "direct"
    ? "DIRECT"
    : "SUPAVISOR_SESSION";
  process.stdout.write(`${JSON.stringify(
    createCommunicationNotePreviewApprovedRuntimeAdaptersHostedEvidence(mode),
  )}\n`);
}

function requireCanonicalTimestamp(value) {
  if (typeof value !== "string") {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code =
      error instanceof CommunicationNotePreviewApprovedRuntimeAdaptersHostedError
        ? error.code
        : "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_INTERNAL_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
