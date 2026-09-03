import { pathToFileURL } from "node:url";
import {
  COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES,
  COMMUNICATION_NOTE_POINTS_ADMISSION_SUPPORT_SCHEMA,
  CommunicationNotePointsAdmissionConcurrencyPolicyError,
  assertCommunicationNotePointsAdmissionBlockerRows,
  assertCommunicationNotePointsAdmissionDistinctBackends,
  assertCommunicationNotePointsAdmissionPreflight,
  readCommunicationNotePointsAdmissionEnvironment,
} from "./communication-note-points-admission-concurrency-policy.mjs";

const SUPPORT = COMMUNICATION_NOTE_POINTS_ADMISSION_SUPPORT_SCHEMA;
const CONTRACT_VERSION = "1.0.0-shadow.1";
const SCHEMA_VERSION = "2026-08-09.v1-shadow";

export const COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES = Object.freeze({
  connectionMs: 5_000,
  queryMs: 30_000,
  statementMs: 25_000,
  lockObservationMs: 3_000,
  lockPollMs: 20,
  idleTransactionMs: 30_000,
  expirySafetyMs: 150,
  rollbackMs: 5_000,
});

export const COMMUNICATION_NOTE_POINTS_ADMISSION_SCENARIOS = Object.freeze([
  "same-key",
  "different-key",
  "expiry-session",
  "expiry-privacy",
  "expiry-payload",
]);

const FIXTURES = Object.freeze({
  "same-key": Object.freeze({
    ownerId: "da100000-0000-4000-8000-000000000001",
    sessionId: "da110000-0000-4000-8000-000000000001",
    privacyId: "da120000-0000-4000-8000-000000000001",
    factHash: "1".repeat(64),
    jobs: Object.freeze([
      Object.freeze({
        jobId: "da150000-0000-4000-8000-000000000001",
        payloadId: "da160000-0000-4000-8000-000000000001",
        idempotencyHash: "b".repeat(64),
        requestHash: "2".repeat(64),
        payloadHandleHash: "c".repeat(64),
      }),
    ]),
  }),
  "different-key": Object.freeze({
    ownerId: "da200000-0000-4000-8000-000000000001",
    sessionId: "da210000-0000-4000-8000-000000000001",
    privacyId: "da220000-0000-4000-8000-000000000001",
    factHash: "3".repeat(64),
    jobs: Object.freeze([
      Object.freeze({
        jobId: "da250000-0000-4000-8000-000000000001",
        payloadId: "da260000-0000-4000-8000-000000000001",
        idempotencyHash: "d".repeat(64),
        requestHash: "4".repeat(64),
        payloadHandleHash: "e".repeat(64),
      }),
      Object.freeze({
        jobId: "da250000-0000-4000-8000-000000000002",
        payloadId: "da260000-0000-4000-8000-000000000002",
        idempotencyHash: "e".repeat(64),
        requestHash: "f".repeat(64),
        payloadHandleHash: "0".repeat(64),
      }),
    ]),
  }),
  "expiry-session": Object.freeze({
    ownerId: "da310000-0000-4000-8000-000000000001",
    sessionId: "da311000-0000-4000-8000-000000000001",
    privacyId: "da312000-0000-4000-8000-000000000001",
    factHash: "5".repeat(64),
    expectedCode: "SESSION_REVOKED",
    jobs: Object.freeze([
      Object.freeze({
        jobId: "da315000-0000-4000-8000-000000000001",
        payloadId: "da316000-0000-4000-8000-000000000001",
        idempotencyHash: "5".repeat(64),
        requestHash: "6".repeat(64),
        payloadHandleHash: "7".repeat(64),
      }),
    ]),
  }),
  "expiry-privacy": Object.freeze({
    ownerId: "da320000-0000-4000-8000-000000000001",
    sessionId: "da321000-0000-4000-8000-000000000001",
    privacyId: "da322000-0000-4000-8000-000000000001",
    factHash: "7".repeat(64),
    expectedCode: "PRIVACY_REVIEW_STALE",
    jobs: Object.freeze([
      Object.freeze({
        jobId: "da325000-0000-4000-8000-000000000001",
        payloadId: "da326000-0000-4000-8000-000000000001",
        idempotencyHash: "8".repeat(64),
        requestHash: "8".repeat(64),
        payloadHandleHash: "9".repeat(64),
      }),
    ]),
  }),
  "expiry-payload": Object.freeze({
    ownerId: "da330000-0000-4000-8000-000000000001",
    sessionId: "da331000-0000-4000-8000-000000000001",
    privacyId: "da332000-0000-4000-8000-000000000001",
    factHash: "9".repeat(64),
    expectedCode: "PRIVACY_REVIEW_STALE",
    jobs: Object.freeze([
      Object.freeze({
        jobId: "da335000-0000-4000-8000-000000000001",
        payloadId: "da336000-0000-4000-8000-000000000001",
        idempotencyHash: "a".repeat(64),
        requestHash: "a".repeat(64),
        payloadHandleHash: "b".repeat(64),
      }),
    ]),
  }),
});

export const COMMUNICATION_NOTE_POINTS_ADMISSION_SQL = `
select
  careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(
    $1::pg_catalog.uuid,
    $2::pg_catalog.uuid,
    $3::pg_catalog.text,
    $4::pg_catalog.uuid,
    $5::pg_catalog.uuid,
    $6::pg_catalog.uuid,
    $7::pg_catalog.text,
    $8::pg_catalog.text,
    $9::pg_catalog.text,
    $10::pg_catalog.text,
    $11::pg_catalog.text,
    $12::pg_catalog.text,
    $13::pg_catalog.text,
    $14::pg_catalog.timestamptz
  ) as admission
`;

const HARNESS_ERROR_CODES = new Set([
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CONNECTION_FAILED",
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_QUERY_TIMEOUT",
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_ENVELOPE_FAILED",
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_REPLAY_FAILED",
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_POINTS_RACE_FAILED",
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_EXPIRY_RACE_FAILED",
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_STATE_FAILED",
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CLOSE_FAILED",
  "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_INTERNAL_FAILED",
  ...Object.values(COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES),
]);

export class CommunicationNotePointsAdmissionConcurrencyHarnessError extends Error {
  constructor(code) {
    const fixedCode = HARNESS_ERROR_CODES.has(code)
      ? code
      : "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_INTERNAL_FAILED";
    super(fixedCode);
    this.name = "CommunicationNotePointsAdmissionConcurrencyHarnessError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePointsAdmissionConcurrencyHarnessError(code);
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withDeadline(operation, milliseconds, code) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new CommunicationNotePointsAdmissionConcurrencyHarnessError(code)),
        milliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
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

function assertHardDestroyableClient(client) {
  assert(
    typeof client?.connection?.stream?.destroy === "function",
    "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CONNECTION_FAILED",
  );
}

async function closeClientWithHardDeadline(client) {
  try {
    await withDeadline(
      Promise.resolve().then(() => client.end()),
      COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.connectionMs,
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CLOSE_FAILED",
    );
  } catch (error) {
    hardDestroyClientStream(client);
    throw error;
  }
}

async function rollbackClientWithHardDeadline(client) {
  try {
    await withDeadline(
      Promise.resolve().then(() => client.query("rollback", [])),
      COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.rollbackMs,
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CLOSE_FAILED",
    );
  } catch (error) {
    hardDestroyClientStream(client);
    throw error;
  }
}

export function denyCommunicationNotePointsAdmissionPasswordAuthentication() {
  fail("COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CONNECTION_FAILED");
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected) {
  return (
    isPlainObject(value) &&
    Object.keys(value).sort().join("\u0000") ===
      [...expected].sort().join("\u0000")
  );
}

function validIsoMilliseconds(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function assertCommunicationNotePointsAdmissionEnvelope(
  value,
  expected,
) {
  const code =
    "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_ENVELOPE_FAILED";
  const jobKeys = [
    "attemptCount",
    "createdAt",
    "failureCode",
    "finishedAt",
    "jobId",
    "noteType",
    "result",
    "serviceCode",
    "startedAt",
    "status",
    "updatedAt",
  ];
  assert(
    exactKeys(value, ["created", "payloadAccepted", "pointsReserved", "job"]) &&
      value.created === expected.created &&
      value.payloadAccepted === true &&
      value.pointsReserved === true &&
      exactKeys(value.job, jobKeys) &&
      value.job.jobId === expected.jobId &&
      value.job.noteType === "communication" &&
      value.job.serviceCode === "note.communication.generate" &&
      value.job.status === "QUEUED" &&
      value.job.attemptCount === 0 &&
      validIsoMilliseconds(value.job.createdAt) &&
      value.job.updatedAt === value.job.createdAt &&
      value.job.startedAt === null &&
      value.job.finishedAt === null &&
      value.job.failureCode === null &&
      value.job.result === null,
    code,
  );
  return value;
}

export function assertCommunicationNotePointsAdmissionCommittedState(
  state,
  expectedJobId,
) {
  const code = "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_STATE_FAILED";
  const expectedJob = FIXTURES[state?.case]?.jobs.find(
    (job) => job.jobId === expectedJobId,
  );
  assert(
    exactKeys(state, [
      "case",
      "jobCount",
      "payloadCount",
      "quoteCount",
      "reservationCount",
      "allocationCount",
      "allocationPoints",
      "bindingCount",
      "reserveLedgerCount",
      "reserveDelta",
      "grantLedgerCount",
      "lotRemaining",
      "jobIds",
      "payloadIds",
      "quoteIdempotencyKeys",
      "reservationIdempotencyKeys",
      "allQueuedAndBound",
    ]) &&
      expectedJob !== undefined &&
      state.jobCount === 1 &&
      state.payloadCount === 1 &&
      state.quoteCount === 1 &&
      state.reservationCount === 1 &&
      state.allocationCount === 1 &&
      state.allocationPoints === 20 &&
      state.bindingCount === 1 &&
      state.reserveLedgerCount === 1 &&
      state.reserveDelta === -20 &&
      state.grantLedgerCount === 1 &&
      state.lotRemaining === 10 &&
      Array.isArray(state.jobIds) &&
      state.jobIds.length === 1 &&
      state.jobIds[0] === expectedJobId &&
      Array.isArray(state.payloadIds) &&
      state.payloadIds.length === 1 &&
      state.payloadIds[0] === expectedJob.payloadId &&
      Array.isArray(state.quoteIdempotencyKeys) &&
      state.quoteIdempotencyKeys.length === 1 &&
      state.quoteIdempotencyKeys[0] ===
        `communication-admission:${expectedJob.idempotencyHash}` &&
      Array.isArray(state.reservationIdempotencyKeys) &&
      state.reservationIdempotencyKeys.length === 1 &&
      state.reservationIdempotencyKeys[0] ===
        `communication-admission:${expectedJob.idempotencyHash}` &&
      state.allQueuedAndBound === true,
    code,
  );
  return state;
}

export function assertCommunicationNotePointsAdmissionZeroState(
  state,
  expectedCase,
) {
  const code = "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_STATE_FAILED";
  assert(
    exactKeys(state, [
      "case",
      "jobCount",
      "payloadCount",
      "quoteCount",
      "reservationCount",
      "allocationCount",
      "allocationPoints",
      "bindingCount",
      "reserveLedgerCount",
      "reserveDelta",
      "grantLedgerCount",
      "lotRemaining",
      "jobIds",
      "payloadIds",
      "quoteIdempotencyKeys",
      "reservationIdempotencyKeys",
      "allQueuedAndBound",
    ]) &&
      state.case === expectedCase &&
      state.jobCount === 0 &&
      state.payloadCount === 0 &&
      state.quoteCount === 0 &&
      state.reservationCount === 0 &&
      state.allocationCount === 0 &&
      state.allocationPoints === 0 &&
      state.bindingCount === 0 &&
      state.reserveLedgerCount === 0 &&
      state.reserveDelta === 0 &&
      state.grantLedgerCount === 1 &&
      state.lotRemaining === 30 &&
      Array.isArray(state.jobIds) &&
      state.jobIds.length === 0 &&
      Array.isArray(state.payloadIds) &&
      state.payloadIds.length === 0 &&
      Array.isArray(state.quoteIdempotencyKeys) &&
      state.quoteIdempotencyKeys.length === 0 &&
      Array.isArray(state.reservationIdempotencyKeys) &&
      state.reservationIdempotencyKeys.length === 0 &&
      state.allQueuedAndBound === true,
    code,
  );
  return state;
}

export function assertCommunicationNotePointsAdmissionTerminalQuarantine(
  value,
) {
  const code = "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_STATE_FAILED";
  assert(
    exactKeys(value, [
      "commitDenied",
      "releaseDenied",
      "reservationStatus",
      "terminalLedgerCount",
      "reserveLedgerCount",
      "lotRemaining",
    ]) &&
      value.commitDenied === true &&
      value.releaseDenied === true &&
      value.reservationStatus === "RESERVED" &&
      value.terminalLedgerCount === 0 &&
      value.reserveLedgerCount === 1 &&
      value.lotRemaining === 10,
    code,
  );
  return value;
}

function assertDatabaseError(outcome, expectedMessage, harnessCode) {
  assert(
    outcome?.ok === false &&
      outcome.error?.code === "P0001" &&
      outcome.error?.message === expectedMessage,
    harnessCode,
  );
}

function capture(operation) {
  return operation.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
}

async function query(client, text, values = []) {
  return withDeadline(
    client.query(text, values),
    COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.queryMs,
    "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_QUERY_TIMEOUT",
  );
}

async function connectClient(Client, databaseUrl, target, applicationName) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: applicationName,
    connectionTimeoutMillis:
      COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.connectionMs,
    query_timeout: COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.queryMs,
    ssl: false,
    password: denyCommunicationNotePointsAdmissionPasswordAuthentication,
  });
  let asynchronousError = false;
  client.on("error", () => {
    asynchronousError = true;
  });

  try {
    await withDeadline(
      client.connect(),
      COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.connectionMs,
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CONNECTION_FAILED",
    );
    const preflightResult = await query(
      client,
      `select
        pg_catalog.host(pg_catalog.inet_server_addr()) as server_addr,
        pg_catalog.current_setting('port') as server_port,
        pg_catalog.current_database() as database_name,
        session_user as session_user_name,
        current_user as current_user_name,
        pg_catalog.current_setting('server_version_num') as server_version_num,
        pg_catalog.pg_backend_pid() as backend_pid,
        coalesce((
          select ssl
          from pg_catalog.pg_stat_ssl
          where pid = pg_catalog.pg_backend_pid()
        ), false) as ssl_in_use,
        pg_catalog.current_setting(
          'careslink.communication_note_points_admission_concurrency_marker',
          true
        ) as concurrency_marker`,
    );
    const preflight = assertCommunicationNotePointsAdmissionPreflight(
      preflightResult.rows[0],
      target,
    );
    assertHardDestroyableClient(client);
    await query(
      client,
      `set statement_timeout = '${COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.statementMs}ms'`,
    );
    await query(
      client,
      `set idle_in_transaction_session_timeout = '${COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.idleTransactionMs}ms'`,
    );
    return {
      client,
      pid: preflight.backendPid,
      label: applicationName.split("-").at(-1),
      assertHealthy() {
        if (asynchronousError) {
          fail(
            "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CONNECTION_FAILED",
          );
        }
      },
    };
  } catch (error) {
    try {
      await closeClientWithHardDeadline(client);
    } catch {
      // A fixed code is the only outward detail.
    }
    if (
      error instanceof CommunicationNotePointsAdmissionConcurrencyHarnessError ||
      error instanceof CommunicationNotePointsAdmissionConcurrencyPolicyError
    ) {
      throw error;
    }
    fail("COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_PREFLIGHT_FAILED");
  }
}

async function closeConnections(connections, primaryError) {
  const rollbackResults = await Promise.allSettled(
    connections.map((connection) =>
      rollbackClientWithHardDeadline(connection.client),
    ),
  );
  const closeResults = await Promise.allSettled(
    connections.map((connection, index) => {
      const rollbackResult = rollbackResults[index];
      return rollbackResult?.status === "fulfilled"
        ? closeClientWithHardDeadline(connection.client)
        : Promise.reject(rollbackResult?.reason);
    }),
  );
  let closeFailed =
    rollbackResults.some((result) => result.status === "rejected") ||
    closeResults.some((result) => result.status === "rejected");
  for (const connection of connections) {
    try {
      connection.assertHealthy();
    } catch {
      closeFailed = true;
    }
  }
  if (closeFailed && primaryError === null) {
    fail("COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CLOSE_FAILED");
  }
}

export const COMMUNICATION_NOTE_POINTS_ADMISSION_TEST_ONLY = Object.freeze({
  closeConnections,
  hardDestroyClientStream,
});

async function openScenario(Client, databaseUrl, target, scenario) {
  const labels = ["a", "b", "observer"];
  const attempts = await Promise.allSettled(
    labels.map((label) =>
      connectClient(
        Client,
        databaseUrl,
        target,
        `careslink-communication-admission-race-${scenario}-${label}`,
      ),
    ),
  );
  const connections = attempts
    .filter((attempt) => attempt.status === "fulfilled")
    .map((attempt) => attempt.value);
  if (connections.length !== labels.length) {
    await closeConnections(connections, new Error("connection"));
    fail("COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CONNECTION_FAILED");
  }
  assertCommunicationNotePointsAdmissionDistinctBackends(
    ...connections.map((connection) => connection.pid),
  );
  return Object.fromEntries(
    labels.map((label, index) => [label, connections[index]]),
  );
}

function backendPids(connections) {
  return Object.freeze({
    contenderA: connections.a.pid,
    contenderB: connections.b.pid,
    observer: connections.observer.pid,
  });
}

function admissionValues(fixture, job, payloadExpiresAt) {
  return [
    fixture.ownerId,
    fixture.sessionId,
    "BEARER",
    job.jobId,
    job.payloadId,
    fixture.privacyId,
    "en",
    CONTRACT_VERSION,
    SCHEMA_VERSION,
    fixture.factHash,
    job.idempotencyHash,
    job.requestHash,
    job.payloadHandleHash,
    payloadExpiresAt,
  ];
}

async function admit(connection, fixture, job, payloadExpiresAt) {
  const result = await query(
    connection.client,
    COMMUNICATION_NOTE_POINTS_ADMISSION_SQL,
    admissionValues(fixture, job, payloadExpiresAt),
  );
  assert(
    Array.isArray(result.rows) && result.rows.length === 1,
    "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_ENVELOPE_FAILED",
  );
  return result.rows[0]?.admission;
}

async function fixtureState(connection, scenario) {
  const result = await query(
    connection.client,
    `select ${SUPPORT}.fixture_state($1::pg_catalog.text) as state`,
    [scenario],
  );
  assert(
    Array.isArray(result.rows) && result.rows.length === 1,
    "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_STATE_FAILED",
  );
  return result.rows[0]?.state;
}

async function waitForAdvisoryBarrier(
  observer,
  waiterPid,
  blockerPid,
  sleep,
) {
  const deadline =
    Date.now() +
    COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.lockObservationMs;
  while (Date.now() < deadline) {
    const result = await query(
      observer.client,
      `select
        waiting.pid as waiting_pid,
        blocker.blocker_pid,
        waiting.locktype,
        waiting.granted
      from pg_catalog.pg_locks as waiting
      cross join lateral pg_catalog.unnest(
        pg_catalog.pg_blocking_pids(waiting.pid)
      ) as blocker(blocker_pid)
      where waiting.pid = $1::pg_catalog.int4
        and blocker.blocker_pid = $2::pg_catalog.int4
        and waiting.locktype = 'advisory'
        and waiting.granted is false`,
      [waiterPid, blockerPid],
    );
    try {
      return assertCommunicationNotePointsAdmissionBlockerRows(
        result.rows,
        waiterPid,
        blockerPid,
      );
    } catch (error) {
      if (
        !(error instanceof CommunicationNotePointsAdmissionConcurrencyPolicyError) ||
        error.code !==
          COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.blockerFailed
      ) {
        throw error;
      }
    }
    await sleep(COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.lockPollMs);
  }
  fail(COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.blockerFailed);
}

async function runSameKeyScenario(Client, databaseUrl, target, sleep, clock) {
  const scenario = "same-key";
  const fixture = FIXTURES[scenario];
  const connections = await openScenario(Client, databaseUrl, target, scenario);
  let primaryError = null;
  try {
    const payloadExpiresAt = new Date(clock() + 10 * 60_000).toISOString();
    await query(connections.a.client, "begin");
    await query(connections.b.client, "begin");
    const fresh = assertCommunicationNotePointsAdmissionEnvelope(
      await admit(connections.a, fixture, fixture.jobs[0], payloadExpiresAt),
      { created: true, jobId: fixture.jobs[0].jobId },
    );

    const waiting = capture(
      admit(connections.b, fixture, fixture.jobs[0], payloadExpiresAt),
    );
    const barrier = await waitForAdvisoryBarrier(
      connections.observer,
      connections.b.pid,
      connections.a.pid,
      sleep,
    );
    await query(connections.a.client, "commit");
    const replayOutcome = await waiting;
    assert(
      replayOutcome.ok,
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_REPLAY_FAILED",
    );
    const replay = assertCommunicationNotePointsAdmissionEnvelope(
      replayOutcome.value,
      { created: false, jobId: fixture.jobs[0].jobId },
    );
    assert(
      JSON.stringify(replay) ===
        JSON.stringify({ ...fresh, created: false }),
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_REPLAY_FAILED",
    );
    await query(connections.b.client, "commit");

    // Simulate a lost first response by issuing the exact request again only
    // after the first transaction is known committed.
    const responseLossReplay = assertCommunicationNotePointsAdmissionEnvelope(
      await admit(connections.a, fixture, fixture.jobs[0], payloadExpiresAt),
      { created: false, jobId: fixture.jobs[0].jobId },
    );
    assert(
      JSON.stringify(responseLossReplay) === JSON.stringify(replay),
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_REPLAY_FAILED",
    );
    const terminalResult = await query(
      connections.observer.client,
      `select ${SUPPORT}.assert_generic_terminal_quarantine()
        as terminal_quarantine`,
    );
    const terminalQuarantine =
      assertCommunicationNotePointsAdmissionTerminalQuarantine(
        terminalResult.rows[0]?.terminal_quarantine,
      );
    const state = assertCommunicationNotePointsAdmissionCommittedState(
      await fixtureState(connections.observer, scenario),
      fixture.jobs[0].jobId,
    );
    return Object.freeze({
      scenario,
      backendPids: backendPids(connections),
      barrier,
      createdCount: 1,
      replayCount: 2,
      pointsReserved: 20,
      terminalQuarantine,
      state,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeConnections(Object.values(connections), primaryError);
  }
}

async function runDifferentKeyScenario(Client, databaseUrl, target, sleep, clock) {
  const scenario = "different-key";
  const fixture = FIXTURES[scenario];
  const connections = await openScenario(Client, databaseUrl, target, scenario);
  let primaryError = null;
  try {
    const payloadExpiresAt = new Date(clock() + 10 * 60_000).toISOString();
    await query(connections.a.client, "begin");
    await query(connections.b.client, "begin");
    assertCommunicationNotePointsAdmissionEnvelope(
      await admit(connections.a, fixture, fixture.jobs[0], payloadExpiresAt),
      { created: true, jobId: fixture.jobs[0].jobId },
    );

    const waiting = capture(
      admit(connections.b, fixture, fixture.jobs[1], payloadExpiresAt),
    );
    const barrier = await waitForAdvisoryBarrier(
      connections.observer,
      connections.b.pid,
      connections.a.pid,
      sleep,
    );
    await query(connections.a.client, "commit");
    const loser = await waiting;
    assertDatabaseError(
      loser,
      "POINTS_INSUFFICIENT",
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_POINTS_RACE_FAILED",
    );
    const state = assertCommunicationNotePointsAdmissionCommittedState(
      await fixtureState(connections.observer, scenario),
      fixture.jobs[0].jobId,
    );
    assert(
      !state.jobIds.includes(fixture.jobs[1].jobId),
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_POINTS_RACE_FAILED",
    );
    return Object.freeze({
      scenario,
      backendPids: backendPids(connections),
      barrier,
      committedCount: 1,
      insufficientCount: 1,
      rolledBackJobId: fixture.jobs[1].jobId,
      state,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeConnections(Object.values(connections), primaryError);
  }
}

function assertExpiryArm(value, scenario, expectedCode) {
  const code =
    "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_EXPIRY_RACE_FAILED";
  assert(
    exactKeys(value, [
      "case",
      "boundaryExpiresAt",
      "payloadExpiresAt",
      "expectedCode",
    ]) &&
      value.case === scenario &&
      value.expectedCode === expectedCode &&
      validIsoMilliseconds(value.boundaryExpiresAt) &&
      validIsoMilliseconds(value.payloadExpiresAt),
    code,
  );
  return value;
}

async function runExpiryScenario(
  Client,
  databaseUrl,
  target,
  scenario,
  sleep,
  clock,
) {
  const fixture = FIXTURES[scenario];
  const connections = await openScenario(Client, databaseUrl, target, scenario);
  let primaryError = null;
  try {
    const armResult = await query(
      connections.observer.client,
      `select ${SUPPORT}.arm_expiry(
        $1::pg_catalog.text,
        $2::pg_catalog.int4
      ) as expiry`,
      [scenario, 8_000],
    );
    const expiry = assertExpiryArm(
      armResult.rows[0]?.expiry,
      scenario,
      fixture.expectedCode,
    );

    await query(connections.a.client, "begin");
    await query(connections.b.client, "begin");
    const lockResult = await query(
      connections.a.client,
      `select ${SUPPORT}.hold_points_lock($1::pg_catalog.text) as held`,
      [scenario],
    );
    assert(
      lockResult.rows[0]?.held === true,
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_EXPIRY_RACE_FAILED",
    );

    const waiting = capture(
      admit(
        connections.b,
        fixture,
        fixture.jobs[0],
        expiry.payloadExpiresAt,
      ),
    );
    const barrier = await waitForAdvisoryBarrier(
      connections.observer,
      connections.b.pid,
      connections.a.pid,
      sleep,
    );
    const remaining =
      Date.parse(expiry.boundaryExpiresAt) -
      clock() +
      COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.expirySafetyMs;
    if (remaining > 0) await sleep(remaining);
    await query(connections.a.client, "commit");
    const expired = await waiting;
    assertDatabaseError(
      expired,
      fixture.expectedCode,
      "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_EXPIRY_RACE_FAILED",
    );
    const state = assertCommunicationNotePointsAdmissionZeroState(
      await fixtureState(connections.observer, scenario),
      scenario,
    );
    return Object.freeze({
      scenario,
      backendPids: backendPids(connections),
      barrier,
      expectedCode: fixture.expectedCode,
      rolledBack: true,
      state,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeConnections(Object.values(connections), primaryError);
  }
}

export async function runCommunicationNotePointsAdmissionConcurrencyHarness({
  env = process.env,
  Client,
  sleep = delay,
  clock = () => Date.now(),
} = {}) {
  const { databaseUrl, target } =
    readCommunicationNotePointsAdmissionEnvironment(env);
  let Driver = Client;
  if (Driver === undefined) {
    const pgModule = await import("pg");
    Driver = pgModule.Client ?? pgModule.default?.Client;
  }
  assert(
    typeof Driver === "function",
    "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CONNECTION_FAILED",
  );

  const sameKey = await runSameKeyScenario(
    Driver,
    databaseUrl,
    target,
    sleep,
    clock,
  );
  const differentKey = await runDifferentKeyScenario(
    Driver,
    databaseUrl,
    target,
    sleep,
    clock,
  );
  const expiry = [];
  for (const scenario of [
    "expiry-session",
    "expiry-privacy",
    "expiry-payload",
  ]) {
    expiry.push(
      await runExpiryScenario(
        Driver,
        databaseUrl,
        target,
        scenario,
        sleep,
        clock,
      ),
    );
  }

  return Object.freeze({
    ok: true,
    policyVersion: target.policyVersion,
    postgresMajor: target.postgresMajor,
    transport: target.transport,
    passwordMaterial: target.passwordMaterial,
    scenarios: Object.freeze({ sameKey, differentKey, expiry }),
  });
}

async function main() {
  try {
    const result = await runCommunicationNotePointsAdmissionConcurrencyHarness();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = HARNESS_ERROR_CODES.has(error?.code)
      ? error.code
      : "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_INTERNAL_FAILED";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 1;
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
