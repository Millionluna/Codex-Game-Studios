import {
  NoteWorkerRpcConcurrencyPolicyError,
  assertNoteWorkerRpcConcurrencyPolicyRegression,
  parsePreviewDatabaseTarget,
} from "./note-worker-rpc-concurrency-policy.mjs";
import {
  assertLocalPg16LoopbackPolicyRegression,
  parseLocalPg16LoopbackDatabaseTarget,
} from "./note-worker-rpc-concurrency-local-pg16-policy.mjs";

const DATABASE_URL_ENV = "CARESLINK_V1_WORKER_RPC_PREVIEW_DATABASE_URL";
const LOCAL_PG16_DATABASE_URL_ENV =
  "CARESLINK_V1_WORKER_RPC_LOCAL_PG16_DATABASE_URL";
const LOCAL_PG16_TARGET_MODE = "local-pg16";
const PREVIEW_TARGET_MODE = "preview";
const RUNNER_ROLE = "careslink_v1_generation_concurrency_runner";
const TEST_SUPPORT_SCHEMA =
  "careslink_v1_generation_concurrency_test_support";
const WORKER_POLICY_VERSION = "worker.concurrency.20260823.v1";
const CONTRACT_VERSION = "1.0.0-shadow.1";
const SCHEMA_VERSION = "2026-08-09.v1-shadow";

const FIXTURES = Object.freeze({
  claim: Object.freeze({
    ownerId: "c9100000-0000-4000-8000-000000000001",
    sessionId: "c9110000-0000-4000-8000-000000000001",
    privacyId: "c9120000-0000-4000-8000-000000000001",
    jobId: "c9130000-0000-4000-8000-000000000001",
    payloadId: "c9140000-0000-4000-8000-000000000001",
  }),
  session: Object.freeze({
    ownerId: "c9100000-0000-4000-8000-000000000002",
    sessionId: "c9110000-0000-4000-8000-000000000002",
    privacyId: "c9120000-0000-4000-8000-000000000002",
    jobId: "c9130000-0000-4000-8000-000000000002",
    payloadId: "c9140000-0000-4000-8000-000000000002",
  }),
  privacy: Object.freeze({
    ownerId: "c9100000-0000-4000-8000-000000000003",
    sessionId: "c9110000-0000-4000-8000-000000000003",
    privacyId: "c9120000-0000-4000-8000-000000000003",
    jobId: "c9130000-0000-4000-8000-000000000003",
    payloadId: "c9140000-0000-4000-8000-000000000003",
  }),
});

const TEST_HELPER_NAMES = Object.freeze([
  "fixture_catalog",
  "activate_session_fixture",
  "activate_privacy_fixture",
  "delete_session_fixture",
  "revoke_privacy_fixture",
  "fixture_state_claim",
  "fixture_state_session",
  "fixture_state_privacy",
]);

const WORKER_RPC_NAMES = Object.freeze([
  "claim_v1_shadow_note_generation_job",
  "authorize_v1_shadow_note_generation_payload_attempt",
  "consume_v1_shadow_note_generation_payload_grant",
]);

const ERROR_CODES = new Set([
  "NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID",
  "NOTE_WORKER_RPC_CONCURRENCY_ENV_MISSING",
  "NOTE_WORKER_RPC_CONCURRENCY_ENV_CONFLICT",
  "NOTE_WORKER_RPC_CONCURRENCY_TLS_ENV_DENIED",
  "NOTE_WORKER_RPC_CONCURRENCY_PG_ENV_DENIED",
  "NOTE_WORKER_RPC_CONCURRENCY_DRIVER_INVALID",
  "NOTE_WORKER_RPC_CONCURRENCY_SQL_POLICY_INVALID",
  "NOTE_WORKER_RPC_CONCURRENCY_CONNECTION_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_SETUP_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_CATALOG_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_BACKEND_IDENTITY_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_CLAIM_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_SESSION_RACE_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_PRIVACY_RACE_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_LOCK_NOT_OBSERVED",
  "NOTE_WORKER_RPC_CONCURRENCY_STATE_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_CLEANUP_FAILED",
  "NOTE_WORKER_RPC_CONCURRENCY_INTERNAL_FAILED",
]);

export class NoteWorkerRpcConcurrencyHarnessError extends Error {
  constructor(code) {
    const fixedCode = ERROR_CODES.has(code)
      ? code
      : "NOTE_WORKER_RPC_CONCURRENCY_INTERNAL_FAILED";
    super(fixedCode);
    this.name = "NoteWorkerRpcConcurrencyHarnessError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new NoteWorkerRpcConcurrencyHarnessError(code);
}

function assert(condition, code) {
  if (!condition) {
    fail(code);
  }
}

export function parseNoteWorkerRpcConcurrencyArguments(argv) {
  if (!Array.isArray(argv)) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
  }

  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  if (normalizedArgv.length !== 2) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
  }

  const values = new Map();
  for (const argument of normalizedArgv) {
    if (typeof argument !== "string" || !argument.startsWith("--")) {
      fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
    }
    const separator = argument.indexOf("=");
    if (separator < 3) {
      fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
    }
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (values.has(key) || value.length === 0) {
      fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
    }
    values.set(key, value);
  }

  if (values.size !== 2 || !values.has("expected-pg-major")) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
  }

  const expectedPgMajorText = values.get("expected-pg-major");
  if (values.has("target-mode")) {
    if (
      values.get("target-mode") !== LOCAL_PG16_TARGET_MODE ||
      expectedPgMajorText !== "16"
    ) {
      fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
    }
    return Object.freeze({
      targetMode: LOCAL_PG16_TARGET_MODE,
      expectedBranchRef: null,
      expectedPgMajor: 16,
    });
  }

  if (!values.has("expected-branch-ref")) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
  }

  const expectedBranchRef = values.get("expected-branch-ref");
  if (!/^[a-z0-9]{20}$/.test(expectedBranchRef)) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
  }
  if (!/^(16|17)$/.test(expectedPgMajorText)) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID");
  }

  return Object.freeze({
    targetMode: PREVIEW_TARGET_MODE,
    expectedBranchRef,
    expectedPgMajor: Number(expectedPgMajorText),
  });
}

export function assertNoteWorkerRpcConcurrencySqlPolicy(setupSql, cleanupSql) {
  if (typeof setupSql !== "string" || typeof cleanupSql !== "string") {
    fail("NOTE_WORKER_RPC_CONCURRENCY_SQL_POLICY_INVALID");
  }

  const escapedSupportSchema = TEST_SUPPORT_SCHEMA.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const escapedRunnerRole = RUNNER_ROLE.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const setupMarkers = [
    "CONCURRENCY_SETUP_MANAGEMENT_ROLE_UNSAFE",
    "CONCURRENCY_SETUP_RUNNER_POSTURE_UNSAFE",
    "CONCURRENCY_SETUP_RUNNER_PRIVILEGE_UNSAFE",
    "CONCURRENCY_SETUP_PRIVATE_SCHEMA_DRIFT",
    "CONCURRENCY_SETUP_RPC_SET_DRIFT",
    "CONCURRENCY_SETUP_DATABASE_NOT_EMPTY",
    "CONCURRENCY_SETUP_HELPER_DEFINITION_UNSAFE",
    "CONCURRENCY_SETUP_HELPER_ACL_UNSAFE",
    "CONCURRENCY_SETUP_RPC_POSTURE_UNSAFE",
    "CONCURRENCY_SETUP_RPC_ACL_UNSAFE",
    "CONCURRENCY_SETUP_SCHEMA_ACL_UNSAFE",
    "CONCURRENCY_SETUP_ROLE_MEMBERSHIP_RESTORE_FAILED",
  ];
  const cleanupMarkers = [
    "CONCURRENCY_CLEANUP_MANAGEMENT_ROLE_UNSAFE",
    "CONCURRENCY_CLEANUP_ACTIVE_RUNNER_SESSION",
    "CONCURRENCY_CLEANUP_MANIFEST_MISMATCH",
    "CONCURRENCY_CLEANUP_PRIVATE_ZERO_FAILED",
    "CONCURRENCY_CLEANUP_ROLE_MEMBERSHIP_RESTORE_FAILED",
    "CONCURRENCY_CLEANUP_POSTCHECK_FAILED",
  ];
  const helperDefinitionsLocked = TEST_HELPER_NAMES.every((helper) =>
    new RegExp(
      `\\bcreate(?:\\s+or\\s+replace)?\\s+function\\s+${escapedSupportSchema}\\s*\\.\\s*${helper}\\s*\\(\\s*\\)`,
      "i",
    ).test(setupSql),
  );
  const runnerExecuteGrantStatements = [
    ...setupSql.matchAll(
      new RegExp(
        `\\bgrant\\s+execute\\s+on\\s+function\\b[^;]*\\bto\\s+${escapedRunnerRole}\\b[^;]*;`,
        "gi",
      ),
    ),
  ].map((match) => match[0]);
  const helperExecuteGrantsLocked = TEST_HELPER_NAMES.every((helper) =>
    runnerExecuteGrantStatements.some((statement) =>
      new RegExp(
        `${escapedSupportSchema}\\s*\\.\\s*${helper}\\s*\\(\\s*\\)`,
        "i",
      ).test(statement),
    ),
  );
  const rpcExecuteGrantsLocked = WORKER_RPC_NAMES.every((rpc) =>
    runnerExecuteGrantStatements.some((statement) =>
      new RegExp(
        `careslink_v1_generation\\s*\\.\\s*${rpc}\\s*\\([^;]*\\)`,
        "i",
      ).test(statement),
    ),
  );
  const helperDropStatements = [
    ...cleanupSql.matchAll(/\bdrop\s+function\b[^;]*;/gi),
  ].map((match) => match[0]);
  const helperDropsLocked = TEST_HELPER_NAMES.every((helper) =>
    helperDropStatements.some((statement) =>
      new RegExp(
        `${escapedSupportSchema}\\s*\\.\\s*${helper}\\s*\\(\\s*\\)`,
        "i",
      ).test(statement),
    ),
  );
  const helperDefinitionSegments = new Map(
    TEST_HELPER_NAMES.map((helper) => {
      const definition = new RegExp(
        `\\bcreate(?:\\s+or\\s+replace)?\\s+function\\s+${escapedSupportSchema}\\s*\\.\\s*${helper}\\s*\\(\\s*\\)`,
        "i",
      ).exec(setupSql);
      if (!definition) {
        return [helper, ""];
      }
      const end = setupSql.indexOf("$$;", definition.index);
      return [
        helper,
        end < 0
          ? ""
          : setupSql.slice(definition.index, end + "$$;".length),
      ];
    }),
  );
  const helperRuntimeGuardsLocked = [...helperDefinitionSegments.values()].every(
    (segment) =>
      /\bsession_user\b/i.test(segment) &&
      segment.includes(RUNNER_ROLE) &&
      /current_setting\s*\(\s*'application_name'/i.test(segment) &&
      segment.includes("careslink-worker-rpc-race-a") &&
      segment.includes("careslink-worker-rpc-race-b"),
  );
  const stateHelperVolatilityLocked = [
    "fixture_state_claim",
    "fixture_state_session",
    "fixture_state_privacy",
  ].every((helper) =>
    /\bvolatile\b/i.test(helperDefinitionSegments.get(helper) ?? ""),
  );
  const executorCreateGrants = [
    ...setupSql.matchAll(
      new RegExp(
        `\\bgrant\\s+(?:usage\\s*,\\s*)?create(?:\\s*,\\s*usage)?\\s+on\\s+schema\\s+${escapedSupportSchema}\\s+to\\s+careslink_v1_generation_executor\\b`,
        "gi",
      ),
    ),
  ];
  const executorCreateRevokes = [
    ...setupSql.matchAll(
      new RegExp(
        `\\brevoke\\s+(?:usage\\s*,\\s*)?create(?:\\s*,\\s*usage)?\\s+on\\s+schema\\s+${escapedSupportSchema}\\s+from\\s+careslink_v1_generation_executor\\b`,
        "gi",
      ),
    ),
  ];
  const executorSchemaCreateRevoked =
    executorCreateGrants.length > 0 &&
    executorCreateRevokes.length > 0 &&
    executorCreateRevokes.at(-1).index > executorCreateGrants.at(-1).index;
  const runnerTableGrant = new RegExp(
    `\\bgrant\\b[^;]*\\bon\\s+(?:table\\s+)?(?:auth|public|careslink_v1_generation)\\s*\\.[^;]*\\bto\\s+${escapedRunnerRole}\\b`,
    "i",
  );
  const runnerMembershipGrant = new RegExp(
    `\\bgrant\\s+(?:careslink_v1_generation_owner|careslink_v1_generation_executor)\\s+to\\s+${escapedRunnerRole}\\b`,
    "i",
  );
  if (
    setupSql.length < 1_000 ||
    cleanupSql.length < 1_000 ||
    !/^\s*--[\s\S]*?\bbegin\s*;/i.test(setupSql) ||
    !/\bcommit\s*;\s*$/i.test(setupSql) ||
    !/^\s*--[\s\S]*?\bbegin\s*;/i.test(cleanupSql) ||
    !/\bcommit\s*;\s*$/i.test(cleanupSql) ||
    /\btruncate\b/i.test(setupSql) ||
    /\btruncate\b/i.test(cleanupSql) ||
    /\bpg_catalog\.(?:boolean|bigint|integer)\b/i.test(setupSql) ||
    setupMarkers.some((marker) => !setupSql.includes(marker)) ||
    cleanupMarkers.some((marker) => !cleanupSql.includes(marker)) ||
    !helperDefinitionsLocked ||
    !helperExecuteGrantsLocked ||
    !rpcExecuteGrantsLocked ||
    !helperDropsLocked ||
    !helperRuntimeGuardsLocked ||
    !stateHelperVolatilityLocked ||
    !executorSchemaCreateRevoked ||
    runnerTableGrant.test(setupSql) ||
    runnerMembershipGrant.test(setupSql) ||
    !new RegExp(
      `\\bdrop\\s+schema\\s+${escapedSupportSchema}\\s*;`,
      "i",
    ).test(cleanupSql) ||
    !new RegExp(`\\bdrop\\s+role\\s+${escapedRunnerRole}\\s*;`, "i").test(
      cleanupSql,
    )
  ) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_SQL_POLICY_INVALID");
  }

  for (const fixture of Object.values(FIXTURES)) {
    for (const id of Object.values(fixture)) {
      if (!setupSql.includes(id) || !cleanupSql.includes(id)) {
        fail("NOTE_WORKER_RPC_CONCURRENCY_SQL_POLICY_INVALID");
      }
    }
  }

  return Object.freeze({
    ok: true,
    adminSetupTransactionLocked: true,
    adminCleanupTransactionLocked: true,
    truncateDenied: true,
    exactFixtureManifestLocked: true,
    fixedHelperBoundaryLocked: true,
    leastPrivilegeRunnerLocked: true,
    helperRuntimeGuardsLocked: true,
    stateHelperVolatilityLocked: true,
    executorSchemaCreateRevoked: true,
  });
}

export function assertDistinctBackendPids(leftPid, rightPid) {
  const left = Number(leftPid);
  const right = Number(rightPid);
  if (
    !Number.isSafeInteger(left) ||
    left <= 0 ||
    !Number.isSafeInteger(right) ||
    right <= 0 ||
    left === right
  ) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_BACKEND_IDENTITY_FAILED");
  }
  return Object.freeze({ left, right });
}

export function assertVerifiedTlsConnection(client) {
  const stream = client?.connection?.stream;
  if (
    stream?.encrypted !== true ||
    stream?.authorized !== true ||
    stream?.authorizationError != null
  ) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED");
  }
  return Object.freeze({ encrypted: true, authorized: true });
}

export function assertPlaintextConnection(client) {
  const stream = client?.connection?.stream;
  if (!stream || stream.encrypted === true) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED");
  }
  return Object.freeze({ encrypted: false });
}

export function observeClientConnectionErrors(client) {
  if (!client || typeof client.on !== "function") {
    fail("NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED");
  }

  let failureObserved = false;
  client.on("error", () => {
    failureObserved = true;
  });

  return Object.freeze({
    assertNone() {
      assert(
        !failureObserved,
        "NOTE_WORKER_RPC_CONCURRENCY_CONNECTION_FAILED",
      );
    },
  });
}

export function assertClaimRaceEnvelope(first, second) {
  const firstClaim = first?.claim;
  const serialized = JSON.stringify(first ?? {}).toLowerCase();
  if (
    first?.status !== "CLAIMED" ||
    !firstClaim ||
    firstClaim.job?.status !== "RUNNING" ||
    firstClaim.attempt?.status !== "RUNNING" ||
    firstClaim.attempt?.ordinal !== 1 ||
    typeof firstClaim.leaseToken !== "string" ||
    firstClaim.leaseToken.length === 0 ||
    second?.status !== "IDLE" ||
    second?.claim !== null ||
    /(payloadhandle|vault|locator|canonicalcontent|englishdraft)/.test(serialized)
  ) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_CLAIM_FAILED");
  }
  return firstClaim;
}

export function assertDeniedEnvelope(value, reason, code) {
  if (
    value?.status !== "DENIED_SETTLED" ||
    value?.reason !== reason ||
    value?.transactionStatus !== "COMMITTED" ||
    value?.atomic !== true ||
    value?.jobStatus !== "FAILED" ||
    value?.attemptStatus !== "FAILED" ||
    value?.payloadState !== "REVOKED" ||
    value?.payloadDisposition !== "REVOKED_PURGE_ENQUEUED" ||
    JSON.stringify(value).toLowerCase().match(
      /(vault|locator|payloadhandle|canonicalcontent|englishdraft)/,
    )
  ) {
    fail(code);
  }
}

function expectSingleJson(result, code) {
  if (!result || result.rowCount !== 1 || result.rows.length !== 1) {
    fail(code);
  }
  return result.rows[0].result;
}

async function beginRpcTransaction(client) {
  await client.query("begin isolation level read committed");
  await client.query("set local statement_timeout = '8s'");
  await client.query("set local lock_timeout = '2s'");
  await client.query("set local idle_in_transaction_session_timeout = '10s'");
}

async function rollbackQuietly(client) {
  try {
    await client.query("rollback");
  } catch {
    // A failed Preview is deleted exactly; do not surface driver text.
  }
}

const TEST_HELPER_SQL = Object.freeze({
  fixtureCatalog:
    "select careslink_v1_generation_concurrency_test_support.fixture_catalog() as result",
  activateSessionFixture:
    "select careslink_v1_generation_concurrency_test_support.activate_session_fixture() as result",
  activatePrivacyFixture:
    "select careslink_v1_generation_concurrency_test_support.activate_privacy_fixture() as result",
  deleteSessionFixture:
    "select careslink_v1_generation_concurrency_test_support.delete_session_fixture() as result",
  revokePrivacyFixture:
    "select careslink_v1_generation_concurrency_test_support.revoke_privacy_fixture() as result",
  fixtureStateClaim:
    "select careslink_v1_generation_concurrency_test_support.fixture_state_claim() as result",
  fixtureStateSession:
    "select careslink_v1_generation_concurrency_test_support.fixture_state_session() as result",
  fixtureStatePrivacy:
    "select careslink_v1_generation_concurrency_test_support.fixture_state_privacy() as result",
});

async function invokeTestHelper(client, helper, code) {
  const text = TEST_HELPER_SQL[helper];
  assert(typeof text === "string", code);
  return expectSingleJson(await client.query(text), code);
}

async function requireTestHelperSuccess(client, helper, code) {
  const result = await invokeTestHelper(client, helper, code);
  assert(
    result === true || result === "OK" || result?.ok === true,
    code,
  );
}

async function claim(client, catalog) {
  const result = await client.query({
    text: `
      select careslink_v1_generation.claim_v1_shadow_note_generation_job(
        $1::text, $2::text, $3::text, $4::text, $5::text, $6::text
      ) as result
    `,
    values: [
      catalog.registrationDigest,
      WORKER_POLICY_VERSION,
      catalog.workerPolicyDigest,
      catalog.workerIdentityHash,
      CONTRACT_VERSION,
      SCHEMA_VERSION,
    ],
  });
  return expectSingleJson(result, "NOTE_WORKER_RPC_CONCURRENCY_CLAIM_FAILED");
}

async function authorize(client, fixture, claimed, catalog) {
  const result = await client.query({
    text: `
      select
        careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
          $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text
        ) as result
    `,
    values: [
      fixture.jobId,
      fixture.payloadId,
      claimed.attempt.attemptId,
      claimed.leaseToken,
      catalog.registrationDigest,
    ],
  });
  return expectSingleJson(
    result,
    "NOTE_WORKER_RPC_CONCURRENCY_STATE_FAILED",
  );
}

async function consume(client, fixture, claimed, catalog, grantId) {
  const result = await client.query({
    text: `
      select
        careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
          $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::uuid
        ) as result
    `,
    values: [
      fixture.jobId,
      fixture.payloadId,
      claimed.attempt.attemptId,
      claimed.leaseToken,
      catalog.registrationDigest,
      grantId,
    ],
  });
  return expectSingleJson(
    result,
    "NOTE_WORKER_RPC_CONCURRENCY_STATE_FAILED",
  );
}

async function waitForObservedBlocker(
  observerClient,
  blockedPid,
  blockerPid,
  timeoutMs = 1_000,
) {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await observerClient.query({
      text: "select $1::integer = any(pg_blocking_pids($2::integer)) as observed",
      values: [blockerPid, blockedPid],
    });
    if (result.rows[0]?.observed === true) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  fail("NOTE_WORKER_RPC_CONCURRENCY_LOCK_NOT_OBSERVED");
}

async function inspectScenarioState(client, scenario) {
  const helper = {
    claim: "fixtureStateClaim",
    session: "fixtureStateSession",
    privacy: "fixtureStatePrivacy",
  }[scenario];
  return invokeTestHelper(
    client,
    helper,
    "NOTE_WORKER_RPC_CONCURRENCY_STATE_FAILED",
  );
}

function assertClaimState(state) {
  assert(
    state.job_status === "RUNNING" &&
      state.attempt_count === 1 &&
      state.job_failure_reason === null &&
      state.payload_state === "AVAILABLE" &&
      state.revoke_reason === null &&
      state.attempt_count_rows === 1 &&
      state.running_attempts === 1 &&
      state.failed_attempts === 0 &&
      state.failed_attempts_with_job_reason === 0 &&
      state.grant_count === 0 &&
      state.consumed_or_released_grants === 0 &&
      state.evidence_count === 0 &&
      state.outbox_count === 0 &&
      state.failed_pending_outbox_count === 0 &&
      state.canonicalRows === 0,
    "NOTE_WORKER_RPC_CONCURRENCY_STATE_FAILED",
  );
}

function assertDeniedState(state, reason, expectedGrantCount) {
  assert(
    state.job_status === "FAILED" &&
      state.attempt_count === 1 &&
      state.job_failure_reason === reason &&
      state.payload_state === "REVOKED" &&
      state.revoke_reason === "FAILED" &&
      state.attempt_count_rows === 1 &&
      state.running_attempts === 0 &&
      state.failed_attempts === 1 &&
      state.failed_attempts_with_job_reason === 1 &&
      state.grant_count === expectedGrantCount &&
      state.revoked_grants === expectedGrantCount &&
      state.consumed_or_released_grants === 0 &&
      state.evidence_count === 0 &&
      state.outbox_count === 1 &&
      state.failed_pending_outbox_count === 1 &&
      state.canonicalRows === 0,
    "NOTE_WORKER_RPC_CONCURRENCY_STATE_FAILED",
  );
}

async function loadCatalog(client) {
  const catalog = await invokeTestHelper(
    client,
    "fixtureCatalog",
    "NOTE_WORKER_RPC_CONCURRENCY_CATALOG_FAILED",
  );
  assert(
    catalog &&
      /^[a-f0-9]{64}$/.test(catalog.registrationDigest) &&
      /^[a-f0-9]{64}$/.test(catalog.workerIdentityHash) &&
      /^[a-f0-9]{64}$/.test(catalog.workerPolicyDigest),
    "NOTE_WORKER_RPC_CONCURRENCY_CATALOG_FAILED",
  );
  return Object.freeze({
    registrationDigest: catalog.registrationDigest,
    workerIdentityHash: catalog.workerIdentityHash,
    workerPolicyDigest: catalog.workerPolicyDigest,
  });
}

async function runClaimRace(clientA, clientB, catalog) {
  await beginRpcTransaction(clientA);
  let clientATransactionOpen = true;
  try {
    const first = await claim(clientA, catalog);
    await beginRpcTransaction(clientB);
    let clientBTransactionOpen = true;
    try {
      const startedAt = Date.now();
      const second = await claim(clientB, catalog);
      const elapsedMs = Date.now() - startedAt;
      const claimed = assertClaimRaceEnvelope(first, second);
      assert(
        elapsedMs < 1_500,
        "NOTE_WORKER_RPC_CONCURRENCY_CLAIM_FAILED",
      );
      await clientB.query("commit");
      clientBTransactionOpen = false;
      await clientA.query("commit");
      clientATransactionOpen = false;

      const state = await inspectScenarioState(clientA, "claim");
      assertClaimState(state);
      return Object.freeze({ claimed, skipLockedObserved: true });
    } finally {
      if (clientBTransactionOpen) {
        await rollbackQuietly(clientB);
      }
    }
  } finally {
    if (clientATransactionOpen) {
      await rollbackQuietly(clientA);
    }
  }
}

async function runSessionRevocationRace(clientA, clientB, catalog, pids) {
  await requireTestHelperSuccess(
    clientA,
    "activateSessionFixture",
    "NOTE_WORKER_RPC_CONCURRENCY_SESSION_RACE_FAILED",
  );
  await clientA.query("begin");
  let clientATransactionOpen = true;
  try {
    await requireTestHelperSuccess(
      clientA,
      "deleteSessionFixture",
      "NOTE_WORKER_RPC_CONCURRENCY_SESSION_RACE_FAILED",
    );

    await beginRpcTransaction(clientB);
    let clientBTransactionOpen = true;
    try {
      const claimEnvelope = await claim(clientB, catalog);
      const claimed = assertClaimRaceEnvelope(claimEnvelope, {
        status: "IDLE",
        claim: null,
      });
      const authorizationOutcomePromise = authorize(
        clientB,
        FIXTURES.session,
        claimed,
        catalog,
      ).then(
        (value) => ({ ok: true, value }),
        () => ({ ok: false }),
      );
      await waitForObservedBlocker(clientA, pids.right, pids.left);
      await clientA.query("commit");
      clientATransactionOpen = false;

      const authorizationOutcome = await authorizationOutcomePromise;
      assert(
        authorizationOutcome.ok,
        "NOTE_WORKER_RPC_CONCURRENCY_SESSION_RACE_FAILED",
      );
      const denied = authorizationOutcome.value;
      assertDeniedEnvelope(
        denied,
        "SESSION_REVOKED",
        "NOTE_WORKER_RPC_CONCURRENCY_SESSION_RACE_FAILED",
      );
      await clientB.query("commit");
      clientBTransactionOpen = false;

      const state = await inspectScenarioState(clientA, "session");
      assertDeniedState(state, "SESSION_REVOKED", 0);
      return Object.freeze({ blockerObserved: true, denied: true });
    } finally {
      if (clientBTransactionOpen) {
        await rollbackQuietly(clientB);
      }
    }
  } finally {
    if (clientATransactionOpen) {
      await rollbackQuietly(clientA);
    }
  }
}

async function runPrivacyRevocationRace(clientA, clientB, catalog, pids) {
  await requireTestHelperSuccess(
    clientA,
    "activatePrivacyFixture",
    "NOTE_WORKER_RPC_CONCURRENCY_PRIVACY_RACE_FAILED",
  );
  await beginRpcTransaction(clientB);
  let clientBTransactionOpen = true;
  try {
    const claimEnvelope = await claim(clientB, catalog);
    const claimed = assertClaimRaceEnvelope(claimEnvelope, {
      status: "IDLE",
      claim: null,
    });
    const authorized = await authorize(
      clientB,
      FIXTURES.privacy,
      claimed,
      catalog,
    );
    assert(
      authorized?.status === "AUTHORIZED" &&
        typeof authorized.grantId === "string" &&
        /^[0-9a-f-]{36}$/.test(authorized.grantId),
      "NOTE_WORKER_RPC_CONCURRENCY_PRIVACY_RACE_FAILED",
    );

    await clientA.query("begin");
    let clientATransactionOpen = true;
    try {
      const revocationOutcomePromise = requireTestHelperSuccess(
        clientA,
        "revokePrivacyFixture",
        "NOTE_WORKER_RPC_CONCURRENCY_PRIVACY_RACE_FAILED",
      ).then(
        (value) => ({ ok: true, value }),
        () => ({ ok: false }),
      );
      await waitForObservedBlocker(clientB, pids.left, pids.right);
      await clientB.query("commit");
      clientBTransactionOpen = false;

      const revocationOutcome = await revocationOutcomePromise;
      assert(
        revocationOutcome.ok,
        "NOTE_WORKER_RPC_CONCURRENCY_PRIVACY_RACE_FAILED",
      );
      await clientA.query("commit");
      clientATransactionOpen = false;

      await beginRpcTransaction(clientB);
      clientBTransactionOpen = true;
      const denied = await consume(
        clientB,
        FIXTURES.privacy,
        claimed,
        catalog,
        authorized.grantId,
      );
      assertDeniedEnvelope(
        denied,
        "PRIVACY_REVIEW_STALE",
        "NOTE_WORKER_RPC_CONCURRENCY_PRIVACY_RACE_FAILED",
      );
      await clientB.query("commit");
      clientBTransactionOpen = false;

      const state = await inspectScenarioState(clientA, "privacy");
      assertDeniedState(state, "PRIVACY_REVIEW_STALE", 1);
      return Object.freeze({ blockerObserved: true, denied: true });
    } finally {
      if (clientATransactionOpen) {
        await rollbackQuietly(clientA);
      }
    }
  } finally {
    if (clientBTransactionOpen) {
      await rollbackQuietly(clientB);
    }
  }
}

async function configureAndInspectConnection(client, applicationName) {
  assert(
    applicationName === "careslink-worker-rpc-race-a" ||
      applicationName === "careslink-worker-rpc-race-b",
    "NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED",
  );
  await client.query("select set_config('application_name', $1, false)", [
    applicationName,
  ]);
  await client.query("set statement_timeout = '8s'");
  await client.query("set lock_timeout = '2s'");
  await client.query("set idle_in_transaction_session_timeout = '10s'");
  const result = await client.query(`
    with required_functions(signature) as (
      values
        ('${TEST_SUPPORT_SCHEMA}.fixture_catalog()'),
        ('${TEST_SUPPORT_SCHEMA}.activate_session_fixture()'),
        ('${TEST_SUPPORT_SCHEMA}.activate_privacy_fixture()'),
        ('${TEST_SUPPORT_SCHEMA}.delete_session_fixture()'),
        ('${TEST_SUPPORT_SCHEMA}.revoke_privacy_fixture()'),
        ('${TEST_SUPPORT_SCHEMA}.fixture_state_claim()'),
        ('${TEST_SUPPORT_SCHEMA}.fixture_state_session()'),
        ('${TEST_SUPPORT_SCHEMA}.fixture_state_privacy()'),
        ('careslink_v1_generation.claim_v1_shadow_note_generation_job(text,text,text,text,text,text)'),
        ('careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)'),
        ('careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(uuid,uuid,uuid,text,text,uuid)')
    ),
    resolved_functions as (
      select to_regprocedure(signature) as function_oid
      from required_functions
    )
    select
      pg_backend_pid()::integer as backend_pid,
      current_setting('server_version_num')::integer as server_version_num,
      current_user,
      session_user,
      current_database() as database_name,
      host(inet_server_addr()) as server_address,
      host(inet_client_addr()) as client_address,
      inet_server_port()::integer as server_port,
      current_setting('listen_addresses') as listen_addresses,
      current_setting('session_replication_role') as replication_role,
      current_setting('row_security') as row_security,
      current_setting('client_encoding') as client_encoding,
      current_setting('application_name') as application_name,
      role_record.rolsuper,
      role_record.rolcreatedb,
      role_record.rolcreaterole,
      role_record.rolinherit,
      role_record.rolreplication,
      role_record.rolbypassrls,
      role_record.rolcanlogin,
      role_record.rolconnlimit,
      pg_has_role(
        current_user,
        'careslink_v1_generation_owner',
        'MEMBER'
      ) as owner_membership,
      pg_has_role(
        current_user,
        'careslink_v1_generation_executor',
        'MEMBER'
      ) as executor_membership,
      has_schema_privilege(
        current_user,
        '${TEST_SUPPORT_SCHEMA}',
        'USAGE'
      ) as test_support_schema_usage,
      has_schema_privilege(
        current_user,
        'careslink_v1_generation',
        'USAGE'
      ) as generation_schema_usage,
      (
        select
          count(*) = 11
          and bool_and(
            function_oid is not null
            and coalesce(
              has_function_privilege(
                current_user,
                function_oid,
                'EXECUTE'
              ),
              false
            )
          )
        from resolved_functions
      ) as required_functions_executable,
      not exists (
        select 1
        from pg_class as sensitive_relation
        join pg_namespace as sensitive_schema
          on sensitive_schema.oid = sensitive_relation.relnamespace
        where sensitive_relation.relkind in ('r', 'p')
          and (
            sensitive_schema.nspname in ('auth', 'careslink_v1_generation')
            or (
              sensitive_schema.nspname = 'public'
              and sensitive_relation.relname in (
                'privacy_reviews',
                'ai_documents',
                'ai_document_revisions',
                'ai_document_sync_changes',
                'ai_document_mutation_receipts'
              )
            )
          )
          and (
            has_table_privilege(
              current_user,
              sensitive_relation.oid,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
            )
            or has_any_column_privilege(
              current_user,
              sensitive_relation.oid,
              'SELECT,INSERT,UPDATE,REFERENCES'
            )
          )
      ) as sensitive_table_privileges_absent,
      exists (
        select 1
        from pg_stat_ssl as ssl_state
        where ssl_state.pid = pg_backend_pid()
          and ssl_state.ssl is true
      ) as ssl_active,
      current_setting('transaction_read_only') as transaction_read_only
    from pg_roles as role_record
    where role_record.rolname = current_user
  `);
  assert(
    result.rowCount === 1,
    "NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED",
  );
  return result.rows[0];
}

async function runLiveHarness({
  Client,
  connectionConfig,
  descriptor,
  expectedPgMajor,
  setupSha256,
  cleanupSha256,
}) {
  const localLoopback =
    descriptor.connectionMode === "local_pg16_loopback";
  const clientA = new Client({
    ...connectionConfig,
    application_name: "careslink-worker-rpc-race-a",
    connectionTimeoutMillis: 10_000,
    query_timeout: 9_000,
  });
  const clientAErrors = observeClientConnectionErrors(clientA);
  const clientB = new Client({
    ...connectionConfig,
    application_name: "careslink-worker-rpc-race-b",
    connectionTimeoutMillis: 10_000,
    query_timeout: 9_000,
  });
  const clientBErrors = observeClientConnectionErrors(clientB);

  let connectedA = false;
  let connectedB = false;
  try {
    try {
      await clientA.connect();
      connectedA = true;
      await clientB.connect();
      connectedB = true;
    } catch {
      fail("NOTE_WORKER_RPC_CONCURRENCY_CONNECTION_FAILED");
    }

    if (localLoopback) {
      assertPlaintextConnection(clientA);
      assertPlaintextConnection(clientB);
    } else {
      assertVerifiedTlsConnection(clientA);
      assertVerifiedTlsConnection(clientB);
    }

    const [identityA, identityB] = await Promise.all([
      configureAndInspectConnection(clientA, "careslink-worker-rpc-race-a"),
      configureAndInspectConnection(clientB, "careslink-worker-rpc-race-b"),
    ]);
    const pids = assertDistinctBackendPids(
      identityA.backend_pid,
      identityB.backend_pid,
    );
    assert(
      identityA.application_name === "careslink-worker-rpc-race-a" &&
        identityB.application_name === "careslink-worker-rpc-race-b",
      "NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED",
    );
    for (const identity of [identityA, identityB]) {
      const transportPostureValid = localLoopback
        ? expectedPgMajor === 16 &&
          descriptor.hostname === "127.0.0.1" &&
          descriptor.port !== 5432 &&
          identity.server_address === "127.0.0.1" &&
          identity.client_address === "127.0.0.1" &&
          identity.server_port === descriptor.port &&
          identity.listen_addresses === "127.0.0.1" &&
          identity.ssl_active === false
        : descriptor.connectionMode === "session_pooler" ||
          identity.ssl_active === true;
      assert(
        Math.trunc(identity.server_version_num / 10_000) === expectedPgMajor &&
          identity.current_user === RUNNER_ROLE &&
          identity.session_user === RUNNER_ROLE &&
          descriptor.databaseRole === RUNNER_ROLE &&
          identity.database_name === descriptor.database &&
          identity.replication_role === "origin" &&
          identity.row_security === "on" &&
          identity.client_encoding === "UTF8" &&
          identity.rolsuper === false &&
          identity.rolcreatedb === false &&
          identity.rolcreaterole === false &&
          identity.rolinherit === false &&
          identity.rolreplication === false &&
          identity.rolbypassrls === false &&
          identity.rolcanlogin === true &&
          identity.rolconnlimit === 2 &&
          identity.owner_membership === false &&
          identity.executor_membership === false &&
          identity.test_support_schema_usage === true &&
          identity.generation_schema_usage === true &&
          identity.required_functions_executable === true &&
          identity.sensitive_table_privileges_absent === true &&
          transportPostureValid &&
          identity.transaction_read_only === "off",
        "NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED",
      );
    }

    const catalog = await loadCatalog(clientA);
    const claimResult = await runClaimRace(clientA, clientB, catalog);
    const sessionResult = await runSessionRevocationRace(
      clientA,
      clientB,
      catalog,
      pids,
    );
    const privacyResult = await runPrivacyRevocationRace(
      clientA,
      clientB,
      catalog,
      pids,
    );

    return Object.freeze({
      ok: true,
      policyVersion: descriptor.policyVersion,
      target: descriptor,
      postgresMajor: expectedPgMajor,
      distinctBackendPids: true,
      sslActive: !localLoopback,
      clientTlsVerified: !localLoopback,
      loopbackVerified: localLoopback,
      credentialMaterialLoaded: !localLoopback,
      setupSha256,
      cleanupSha256,
      scenarios: Object.freeze({
        skipLocked: claimResult.skipLockedObserved,
        sessionRevocationFirst: sessionResult.blockerObserved,
        privacyAuthorizationFirst: privacyResult.blockerObserved,
      }),
      fixtureCleanupRequired: true,
    });
  } finally {
    if (connectedB) {
      await clientB.end().catch(() => undefined);
    }
    if (connectedA) {
      await clientA.end().catch(() => undefined);
    }
    clientAErrors.assertNone();
    clientBErrors.assertNone();
  }
}

async function main() {
  assertNoteWorkerRpcConcurrencyPolicyRegression();
  assertLocalPg16LoopbackPolicyRegression();

  const args = parseNoteWorkerRpcConcurrencyArguments(process.argv.slice(2));
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    fail("NOTE_WORKER_RPC_CONCURRENCY_TLS_ENV_DENIED");
  }
  if (
    Object.entries(process.env).some(
      ([key, value]) => /^PG[A-Z0-9_]*$/.test(key) && value,
    )
  ) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_PG_ENV_DENIED");
  }
  const previewDatabaseUrl = process.env[DATABASE_URL_ENV];
  const localPg16DatabaseUrl = process.env[LOCAL_PG16_DATABASE_URL_ENV];
  const previewUrlPresent =
    typeof previewDatabaseUrl === "string" && previewDatabaseUrl.length > 0;
  const localUrlPresent =
    typeof localPg16DatabaseUrl === "string" &&
    localPg16DatabaseUrl.length > 0;
  if (previewUrlPresent && localUrlPresent) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ENV_CONFLICT");
  }

  const localLoopback = args.targetMode === LOCAL_PG16_TARGET_MODE;
  if (
    (localLoopback && !localUrlPresent) ||
    (!localLoopback && !previewUrlPresent)
  ) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ENV_MISSING");
  }
  if (
    (localLoopback && previewUrlPresent) ||
    (!localLoopback && localUrlPresent)
  ) {
    fail("NOTE_WORKER_RPC_CONCURRENCY_ENV_CONFLICT");
  }

  const databaseUrl = localLoopback
    ? localPg16DatabaseUrl
    : previewDatabaseUrl;
  const descriptor = localLoopback
    ? parseLocalPg16LoopbackDatabaseTarget(databaseUrl)
    : parsePreviewDatabaseTarget(databaseUrl, args.expectedBranchRef);

  const [{ readFile }, { createHash }, pgModule] = await Promise.all([
    import("node:fs/promises"),
    import("node:crypto"),
    import("pg"),
  ]);
  const Client = pgModule.Client ?? pgModule.default?.Client;
  if (typeof Client !== "function") {
    fail("NOTE_WORKER_RPC_CONCURRENCY_DRIVER_INVALID");
  }

  const setupUrl = new URL(
    "./note-worker-rpc-concurrency-setup.sql",
    import.meta.url,
  );
  const cleanupUrl = new URL(
    "./note-worker-rpc-concurrency-cleanup.sql",
    import.meta.url,
  );
  const parsedDatabaseUrl = new URL(databaseUrl);
  const [setupSql, cleanupSql] = await Promise.all([
    readFile(setupUrl, "utf8"),
    readFile(cleanupUrl, "utf8"),
  ]);
  assertNoteWorkerRpcConcurrencySqlPolicy(setupSql, cleanupSql);

  let sslRootCertificate;
  if (!localLoopback) {
    const sslRootCertificatePath =
      parsedDatabaseUrl.searchParams.get("sslrootcert");
    sslRootCertificate = await readFile(sslRootCertificatePath, "utf8");
  }

  let username;
  let password;
  try {
    username = decodeURIComponent(parsedDatabaseUrl.username);
    password = decodeURIComponent(parsedDatabaseUrl.password);
  } catch {
    fail("NOTE_WORKER_RPC_CONCURRENCY_CONNECTION_FAILED");
  }
  const connectionConfig = localLoopback
    ? Object.freeze({
        host: descriptor.hostname,
        port: descriptor.port,
        database: descriptor.database,
        user: descriptor.databaseRole,
        password: async () => "",
        options: "-c row_security=on",
        client_encoding: "UTF8",
        ssl: false,
      })
    : Object.freeze({
        host: parsedDatabaseUrl.hostname,
        port: Number(parsedDatabaseUrl.port),
        database: "postgres",
        user: username,
        password,
        options: "-c row_security=on",
        sslnegotiation: "postgres",
        client_encoding: "UTF8",
        ssl: Object.freeze({
          ca: sslRootCertificate,
          rejectUnauthorized: true,
        }),
      });

  const setupSha256 = createHash("sha256").update(setupSql).digest("hex");
  const cleanupSha256 = createHash("sha256").update(cleanupSql).digest("hex");
  const evidence = await runLiveHarness({
    Client,
    connectionConfig,
    descriptor,
    expectedPgMajor: args.expectedPgMajor,
    setupSha256,
    cleanupSha256,
  });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code =
      error instanceof NoteWorkerRpcConcurrencyHarnessError ||
      error instanceof NoteWorkerRpcConcurrencyPolicyError
        ? error.code
        : "NOTE_WORKER_RPC_CONCURRENCY_INTERNAL_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
