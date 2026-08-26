import { pathToFileURL } from "node:url";
import {
  PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
  assertPortalFollowUpConcurrencyDistinctBackends,
  assertPortalFollowUpConcurrencyPreflight,
  readPortalFollowUpConcurrencyEnvironment,
} from "./portal-referral-follow-up-concurrency-local-pg16-policy.mjs";

const SUPPORT = "careslink_portal_follow_up_concurrency_test_support";

export const PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES = Object.freeze({
  connectionMs: 3_000,
  queryMs: 9_000,
  statementMs: 8_000,
  lockMs: 7_000,
  idleTransactionMs: 10_000,
  blockerPollMs: 25,
  blockerPollRounds: 120,
});

export const PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS = Object.freeze([
  "same-key-replay",
  "same-key-changed-conflict",
  "different-key-stale",
  "same-provider-actors",
  "session-revoke-first",
  "provider-suspend-first",
  "flag-disable-first",
  "ownership-revoke-first-and-replay",
]);

const CASES = Object.freeze({
  replay: "replay",
  sameKeyConflict: "same-key-conflict",
  differentKeyStale: "different-key-stale",
  sameProviderActors: "same-provider-actors",
  session: "session",
  provider: "provider",
  flag: "flag",
  ownership: "ownership-first",
});

const MUTATIONS = Object.freeze({
  replay: "1".repeat(64),
  sameKeyConflict: "2".repeat(64),
  differentKeyA: "3".repeat(64),
  differentKeyB: "4".repeat(64),
  sameProviderActors: "5".repeat(64),
  session: "6".repeat(64),
  provider: "7".repeat(64),
  flag: "8".repeat(64),
  ownershipReceipt: "9".repeat(64),
  ownershipWaiter: "a".repeat(64),
});

const CORRELATIONS = Object.freeze({
  replay: "b".repeat(64),
  conflictContact: "c".repeat(64),
  conflictNoResponse: "d".repeat(64),
  differentKeyA: "e".repeat(64),
  differentKeyB: "f".repeat(64),
  sameProviderActorA: "0".repeat(64),
  sameProviderActorB: "1".repeat(64),
  session: "2".repeat(64),
  provider: "3".repeat(64),
  flag: "4".repeat(64),
  ownershipReceipt: "5".repeat(64),
  ownershipWaiter: "6".repeat(64),
});

const HARNESS_ERRORS = new Set([
  "PORTAL_FOLLOW_UP_CONCURRENCY_CONNECTION_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_PASSWORD_AUTH_DENIED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_PREFLIGHT_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_QUERY_TIMEOUT",
  "PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_LOCK_NOT_OBSERVED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_REPLAY_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_SAME_KEY_CONFLICT_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_DIFFERENT_KEY_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_ACTOR_SCOPE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_SESSION_RACE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_PROVIDER_RACE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_FLAG_RACE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_OWNERSHIP_RACE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_STATE_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_CLEANUP_FAILED",
  "PORTAL_FOLLOW_UP_CONCURRENCY_INTERNAL_FAILED",
]);

export class PortalFollowUpConcurrencyHarnessError extends Error {
  constructor(code) {
    const fixed = HARNESS_ERRORS.has(code)
      ? code
      : "PORTAL_FOLLOW_UP_CONCURRENCY_INTERNAL_FAILED";
    super(fixed);
    this.name = "PortalFollowUpConcurrencyHarnessError";
    this.code = fixed;
  }
}

function fail(code) {
  throw new PortalFollowUpConcurrencyHarnessError(code);
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function exactJsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function number(value) {
  return Number(value);
}

function withDeadline(operation, milliseconds, code) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new PortalFollowUpConcurrencyHarnessError(code)),
      milliseconds,
    );
  });
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}

export function denyPortalFollowUpConcurrencyPasswordAuthentication() {
  fail("PORTAL_FOLLOW_UP_CONCURRENCY_PASSWORD_AUTH_DENIED");
}

function claims(userId, sessionId) {
  return JSON.stringify({
    role: "authenticated",
    sub: userId,
    session_id: sessionId,
  });
}

async function query(client, text, values = []) {
  return withDeadline(
    client.query(text, values),
    PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.queryMs,
    "PORTAL_FOLLOW_UP_CONCURRENCY_QUERY_TIMEOUT",
  );
}

async function configureJwt(client, userId, sessionId) {
  await query(
    client,
    "select pg_catalog.set_config('request.jwt.claims', $1, false)",
    [claims(userId, sessionId)],
  );
}

async function connectClient(Client, databaseUrl, target, applicationName) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: applicationName,
    connectionTimeoutMillis:
      PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.connectionMs,
    query_timeout: PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.queryMs,
    ssl: false,
    password: denyPortalFollowUpConcurrencyPasswordAuthentication,
  });
  let asynchronousError = false;
  client.on("error", () => {
    asynchronousError = true;
  });

  try {
    await withDeadline(
      client.connect(),
      PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.connectionMs,
      "PORTAL_FOLLOW_UP_CONCURRENCY_CONNECTION_FAILED",
    );
    const result = await query(
      client,
      "select " +
        "pg_catalog.host(pg_catalog.inet_server_addr()) as server_addr, " +
        "pg_catalog.current_setting('port') as server_port, " +
        "pg_catalog.current_database() as database_name, " +
        "session_user as session_user_name, " +
        "current_user as current_user_name, " +
        "pg_catalog.current_setting('server_version_num') as server_version_num, " +
        "pg_catalog.pg_backend_pid() as backend_pid, " +
        "coalesce((select ssl from pg_catalog.pg_stat_ssl " +
        "where pid = pg_catalog.pg_backend_pid()), false) as ssl_in_use, " +
        "pg_catalog.current_setting(" +
        "'careslink.portal_follow_up_concurrency_marker', true" +
        ") as bootstrap_marker",
    );
    const preflight = assertPortalFollowUpConcurrencyPreflight(
      result.rows[0],
      target,
    );
    await query(
      client,
      "set statement_timeout = '" +
        PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.statementMs +
        "ms'",
    );
    await query(
      client,
      "set lock_timeout = '" +
        PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.lockMs +
        "ms'",
    );
    await query(
      client,
      "set idle_in_transaction_session_timeout = '" +
        PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.idleTransactionMs +
        "ms'",
    );
    return {
      client,
      label: applicationName.split("-").at(-1),
      pid: preflight.backendPid,
      assertHealthy() {
        if (asynchronousError) {
          fail("PORTAL_FOLLOW_UP_CONCURRENCY_CONNECTION_FAILED");
        }
      },
    };
  } catch (error) {
    try {
      await client.end();
    } catch {
      // The fixed preflight error is the only outward detail.
    }
    if (error instanceof PortalFollowUpConcurrencyHarnessError) throw error;
    fail("PORTAL_FOLLOW_UP_CONCURRENCY_PREFLIGHT_FAILED");
  }
}

async function closeConnections(connections) {
  const ordered = [...connections].sort((left, right) => {
    if (left.label === "control") return -1;
    if (right.label === "control") return 1;
    return 0;
  });
  const rollbacks = await Promise.allSettled(
    ordered.map((connection) =>
      withDeadline(
        connection.client.query("rollback"),
        PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.queryMs,
        "PORTAL_FOLLOW_UP_CONCURRENCY_QUERY_TIMEOUT",
      ),
    ),
  );
  const endings = await Promise.allSettled(
    ordered.map((connection) =>
      withDeadline(
        connection.client.end(),
        PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.connectionMs,
        "PORTAL_FOLLOW_UP_CONCURRENCY_CONNECTION_FAILED",
      ),
    ),
  );
  let failed =
    rollbacks.some((rollback) => rollback.status === "rejected") ||
    endings.some((ending) => ending.status === "rejected");
  for (const connection of ordered) {
    try {
      connection.assertHealthy();
    } catch {
      failed = true;
    }
  }
  return failed;
}

async function closeScenario(connections, primaryError) {
  const failed = await closeConnections(connections);
  if (failed && primaryError === null) {
    fail("PORTAL_FOLLOW_UP_CONCURRENCY_CONNECTION_FAILED");
  }
}

async function openScenario(
  Client,
  databaseUrl,
  target,
  scenario,
  labels,
) {
  const attempts = await Promise.allSettled(
    labels.map((label) =>
      connectClient(
        Client,
        databaseUrl,
        target,
        "careslink-portal-follow-up-race-" + scenario + "-" + label,
      ),
    ),
  );
  const connections = attempts
    .filter((attempt) => attempt.status === "fulfilled")
    .map((attempt) => attempt.value);
  if (connections.length !== labels.length) {
    await closeConnections(connections);
    fail("PORTAL_FOLLOW_UP_CONCURRENCY_CONNECTION_FAILED");
  }
  try {
    assertPortalFollowUpConcurrencyDistinctBackends(
      ...connections.map((connection) => connection.pid),
    );
  } catch {
    await closeConnections(connections);
    fail("PORTAL_FOLLOW_UP_CONCURRENCY_CONNECTION_FAILED");
  }
  return Object.fromEntries(
    labels.map((label, index) => [label, connections[index]]),
  );
}

function validHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function resetFixture(connection, caseName) {
  const result = await query(
    connection.client,
    "select " + SUPPORT + ".reset_fixture($1::text) as fixture",
    [caseName],
  );
  const fixture = result.rows[0]?.fixture;
  assert(
    fixture?.case === caseName &&
      typeof fixture?.referral_id === "string" &&
      typeof fixture?.match_a_id === "string" &&
      typeof fixture?.provider_a_id === "string" &&
      typeof fixture?.actor_a_user_id === "string" &&
      typeof fixture?.actor_a_session_id === "string" &&
      typeof fixture?.actor_b_user_id === "string" &&
      typeof fixture?.actor_b_session_id === "string" &&
      number(fixture?.expected_version) === 4 &&
      validHash(fixture?.contact_confirmed_hash) &&
      validHash(fixture?.information_requested_hash) &&
      validHash(fixture?.service_commenced_hash) &&
      validHash(fixture?.no_response_hash),
    "PORTAL_FOLLOW_UP_CONCURRENCY_FIXTURE_FAILED",
  );
  return fixture;
}

async function fixtureState(connection, caseName) {
  const result = await query(
    connection.client,
    "select " + SUPPORT + ".fixture_state($1::text) as state",
    [caseName],
  );
  return result.rows[0]?.state;
}

export function assertExactBlockerRows(
  rows,
  expectedBlockers,
  allowedPeerPids = [],
) {
  const actual = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [
      number(row.pid),
      {
        waitEventType: row.wait_event_type,
        blockingPids: (
          Array.isArray(row.blocking_pids) ? row.blocking_pids : []
        )
          .map(number)
          .sort((left, right) => left - right),
      },
    ]),
  );
  const expected = new Map(
    Object.entries(expectedBlockers).map(([pid, blockers]) => [
      number(pid),
      [...blockers].map(number).sort((left, right) => left - right),
    ]),
  );
  const allowedBlockers = new Set([
    ...allowedPeerPids.map(number),
    ...[...expected.values()].flat(),
  ]);
  const reachesBlocker = (pid, requiredPid) => {
    const pending = [...(actual.get(pid)?.blockingPids ?? [])];
    const visited = new Set();
    while (pending.length > 0) {
      const blockingPid = pending.shift();
      if (blockingPid === requiredPid) return true;
      if (visited.has(blockingPid)) continue;
      visited.add(blockingPid);
      if (actual.has(blockingPid)) {
        pending.push(...actual.get(blockingPid).blockingPids);
      }
    }
    return false;
  };
  if (
    actual.size !== expected.size ||
    [...expected].some(
      ([pid, blockers]) =>
        !actual.has(pid) ||
        actual.get(pid).waitEventType !== "Lock" ||
        blockers.length === 0 ||
        blockers.some(
          (requiredPid) => !reachesBlocker(pid, requiredPid),
        ) ||
        actual
          .get(pid)
          .blockingPids.some(
            (blockingPid) =>
              blockingPid === pid || !allowedBlockers.has(blockingPid),
          ),
    )
  ) {
    fail("PORTAL_FOLLOW_UP_CONCURRENCY_LOCK_NOT_OBSERVED");
  }
  return Object.freeze(
    [...actual].map(([pid, value]) =>
      Object.freeze({
        pid,
        blockingPids: Object.freeze(value.blockingPids),
      }),
    ),
  );
}

async function blockerRows(observer, backendPids) {
  const result = await query(
    observer.client,
    "select " + SUPPORT + ".blockers($1::integer[]) as blockers",
    [backendPids],
  );
  return result.rows[0]?.blockers;
}

async function waitForExactBlockers(observer, expectedBlockers) {
  const backendPids = Object.keys(expectedBlockers).map(number);
  for (
    let round = 0;
    round < PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.blockerPollRounds;
    round += 1
  ) {
    const rows = await blockerRows(observer, backendPids);
    try {
      return assertExactBlockerRows(rows, expectedBlockers, backendPids);
    } catch (error) {
      if (
        !(error instanceof PortalFollowUpConcurrencyHarnessError) ||
        error.code !== "PORTAL_FOLLOW_UP_CONCURRENCY_LOCK_NOT_OBSERVED"
      ) {
        throw error;
      }
    }
    await delay(PORTAL_FOLLOW_UP_CONCURRENCY_DEADLINES.blockerPollMs);
  }
  fail("PORTAL_FOLLOW_UP_CONCURRENCY_LOCK_NOT_OBSERVED");
}

async function captureDatabaseOperation(operation) {
  try {
    return { ok: true, value: await operation };
  } catch (error) {
    return {
      ok: false,
      sqlState: typeof error?.code === "string" ? error.code : null,
      reason: typeof error?.message === "string" ? error.message : null,
    };
  }
}

function recordQuery(
  client,
  fixture,
  outcome,
  mutationHash,
  payloadHash,
  correlationHash,
) {
  return query(
    client,
    "select public.portal_referral_follow_up_record(" +
      "$1::uuid, $2::bigint, $3::text, $4::text, $5::text, $6::text" +
      ") as response",
    [
      fixture.referral_id,
      fixture.expected_version,
      outcome,
      mutationHash,
      payloadHash,
      correlationHash,
    ],
  );
}

function onlyRow(state, key) {
  const rows = state?.[key];
  if (!Array.isArray(rows) || rows.length !== 1) {
    fail("PORTAL_FOLLOW_UP_CONCURRENCY_STATE_FAILED");
  }
  return rows[0];
}

export function assertSingleEffectState(state, expected) {
  const followup = onlyRow(state, "followups");
  const audit = onlyRow(state, "audits");
  const receipt = onlyRow(state, "receipts");
  const ok =
    state?.referral_status === expected.referralStatus &&
    number(state?.referral_version) === expected.referralVersion &&
    state?.assigned_provider_id === expected.assignedProviderId &&
    state?.match_a_status === expected.matchStatus &&
    number(state?.match_a_version) === expected.matchVersion &&
    state?.match_b_status === expected.matchBStatus &&
    number(state?.match_b_version) === expected.matchBVersion &&
    number(state?.followup_count) === 1 &&
    number(state?.audit_count) === 1 &&
    number(state?.receipt_count) === 1 &&
    followup?.actor_user_id === expected.actorUserId &&
    followup?.outcome_code === expected.outcome &&
    followup?.next_due_at === null &&
    audit?.actor_user_id === expected.actorUserId &&
    audit?.actor_role === "provider_member" &&
    audit?.mutation_kind === "RECORD_FOLLOW_UP" &&
    audit?.from_status === "ACCEPTED" &&
    audit?.to_status === "IN_PROGRESS" &&
    audit?.mutation_id_hash === expected.mutationHash &&
    audit?.correlation_id_hash === expected.correlationHash &&
    audit?.metadata?.outcomeCode === expected.outcome &&
    receipt?.actor_user_id === expected.actorUserId &&
    receipt?.mutation_id_hash === expected.mutationHash &&
    receipt?.mutation_kind === "RECORD_FOLLOW_UP" &&
    receipt?.payload_hash === expected.payloadHash &&
    receipt?.response_referral_id === expected.referralId &&
    receipt?.response_match_id === null &&
    receipt?.response_status === "IN_PROGRESS" &&
    number(receipt?.response_row_version) === expected.responseVersion &&
    followup?.created_at === audit?.occurred_at &&
    audit?.occurred_at === receipt?.response_updated_at &&
    receipt?.response_updated_at === receipt?.created_at;
  if (!ok) fail("PORTAL_FOLLOW_UP_CONCURRENCY_STATE_FAILED");
  return Object.freeze({
    ok: true,
    effects: 1,
    actorUserId: expected.actorUserId,
    mutationHash: expected.mutationHash,
  });
}

export function assertZeroEffectState(state, fixture) {
  const ok =
    state?.referral_status === "ACCEPTED" &&
    number(state?.referral_version) === number(fixture?.expected_version) &&
    state?.assigned_provider_id === fixture?.provider_a_id &&
    state?.match_a_status === "ACCEPTED" &&
    number(state?.match_a_version) === 2 &&
    state?.match_b_status === "CANDIDATE" &&
    number(state?.match_b_version) === 1 &&
    number(state?.followup_count) === 0 &&
    number(state?.audit_count) === 0 &&
    number(state?.receipt_count) === 0 &&
    Array.isArray(state?.followups) &&
    state.followups.length === 0 &&
    Array.isArray(state?.audits) &&
    state.audits.length === 0 &&
    Array.isArray(state?.receipts) &&
    state.receipts.length === 0;
  if (!ok) fail("PORTAL_FOLLOW_UP_CONCURRENCY_STATE_FAILED");
  return Object.freeze({ ok: true, effects: 0 });
}

function successAck(outcome, expectedVersion) {
  return (
    outcome.ok &&
    outcome.value?.rows[0]?.response?.current_status === "IN_PROGRESS" &&
    number(outcome.value?.rows[0]?.response?.row_version) ===
      number(expectedVersion) + 1 &&
    outcome.value?.rows[0]?.response?.match_id === null
  );
}

function expectedSingleEffect(fixture, values) {
  return {
    referralStatus: values.referralStatus ?? "IN_PROGRESS",
    referralVersion:
      values.referralVersion ?? number(fixture.expected_version) + 1,
    assignedProviderId:
      values.assignedProviderId === undefined
        ? fixture.provider_a_id
        : values.assignedProviderId,
    matchStatus: values.matchStatus ?? "ACCEPTED",
    matchVersion: values.matchVersion ?? 2,
    matchBStatus: values.matchBStatus ?? "CANDIDATE",
    matchBVersion: values.matchBVersion ?? 1,
    actorUserId: values.actorUserId,
    mutationHash: values.mutationHash,
    payloadHash: values.payloadHash,
    correlationHash: values.correlationHash,
    outcome: values.outcome,
    referralId: fixture.referral_id,
    responseVersion: number(fixture.expected_version) + 1,
  };
}

async function lockMutation(connection, actorUserId, mutationHash) {
  await query(
    connection.client,
    "select " + SUPPORT + ".lock_mutation($1::uuid, $2::text)",
    [actorUserId, mutationHash],
  );
}

async function lockReferral(connection, caseName) {
  await query(
    connection.client,
    "select " + SUPPORT + ".lock_referral($1::text)",
    [caseName],
  );
}

async function runSameKeyReplayRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    CASES.replay,
    ["a", "b", "control", "observer"],
  );
  const connections = Object.values(scenario);
  let primaryError = null;
  try {
    const fixture = await resetFixture(scenario.control, CASES.replay);
    await Promise.all([
      configureJwt(
        scenario.a.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
      configureJwt(
        scenario.b.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
    ]);
    await query(scenario.control.client, "begin");
    await lockMutation(
      scenario.control,
      fixture.actor_a_user_id,
      MUTATIONS.replay,
    );
    const calls = [scenario.a, scenario.b].map((connection) =>
      captureDatabaseOperation(
        recordQuery(
          connection.client,
          fixture,
          "CONTACT_CONFIRMED",
          MUTATIONS.replay,
          fixture.contact_confirmed_hash,
          CORRELATIONS.replay,
        ),
      ),
    );
    await waitForExactBlockers(scenario.observer, {
      [scenario.a.pid]: [scenario.control.pid],
      [scenario.b.pid]: [scenario.control.pid],
    });
    await query(scenario.control.client, "commit");
    const outcomes = await Promise.all(calls);
    assert(
      outcomes.every((outcome) =>
        successAck(outcome, fixture.expected_version),
      ) &&
        exactJsonEqual(
          outcomes[0].value.rows[0].response,
          outcomes[1].value.rows[0].response,
        ),
      "PORTAL_FOLLOW_UP_CONCURRENCY_REPLAY_FAILED",
    );
    try {
      assertSingleEffectState(
        await fixtureState(scenario.observer, CASES.replay),
        expectedSingleEffect(fixture, {
          actorUserId: fixture.actor_a_user_id,
          mutationHash: MUTATIONS.replay,
          payloadHash: fixture.contact_confirmed_hash,
          correlationHash: CORRELATIONS.replay,
          outcome: "CONTACT_CONFIRMED",
        }),
      );
    } catch {
      fail("PORTAL_FOLLOW_UP_CONCURRENCY_REPLAY_FAILED");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeScenario(connections, primaryError);
  }
}

async function runSameKeyConflictRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    CASES.sameKeyConflict,
    ["a", "b", "control", "observer"],
  );
  const connections = Object.values(scenario);
  let primaryError = null;
  try {
    const fixture = await resetFixture(
      scenario.control,
      CASES.sameKeyConflict,
    );
    await Promise.all([
      configureJwt(
        scenario.a.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
      configureJwt(
        scenario.b.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
    ]);
    await query(scenario.control.client, "begin");
    await lockMutation(
      scenario.control,
      fixture.actor_a_user_id,
      MUTATIONS.sameKeyConflict,
    );
    const specifications = [
      {
        connection: scenario.a,
        outcome: "CONTACT_CONFIRMED",
        payloadHash: fixture.contact_confirmed_hash,
        correlationHash: CORRELATIONS.conflictContact,
      },
      {
        connection: scenario.b,
        outcome: "NO_RESPONSE",
        payloadHash: fixture.no_response_hash,
        correlationHash: CORRELATIONS.conflictNoResponse,
      },
    ];
    const calls = specifications.map((specification) =>
      captureDatabaseOperation(
        recordQuery(
          specification.connection.client,
          fixture,
          specification.outcome,
          MUTATIONS.sameKeyConflict,
          specification.payloadHash,
          specification.correlationHash,
        ),
      ),
    );
    await waitForExactBlockers(scenario.observer, {
      [scenario.a.pid]: [scenario.control.pid],
      [scenario.b.pid]: [scenario.control.pid],
    });
    await query(scenario.control.client, "commit");
    const outcomes = await Promise.all(calls);
    const winnerIndex = outcomes.findIndex((outcome) => outcome.ok);
    const failures = outcomes.filter((outcome) => !outcome.ok);
    assert(
      winnerIndex >= 0 &&
        outcomes.filter((outcome) => outcome.ok).length === 1 &&
        successAck(outcomes[winnerIndex], fixture.expected_version) &&
        failures.length === 1 &&
        failures[0].sqlState === "P0001" &&
        failures[0].reason === "PORTAL_IDEMPOTENCY_CONFLICT",
      "PORTAL_FOLLOW_UP_CONCURRENCY_SAME_KEY_CONFLICT_FAILED",
    );
    const winner = specifications[winnerIndex];
    try {
      assertSingleEffectState(
        await fixtureState(scenario.observer, CASES.sameKeyConflict),
        expectedSingleEffect(fixture, {
          actorUserId: fixture.actor_a_user_id,
          mutationHash: MUTATIONS.sameKeyConflict,
          payloadHash: winner.payloadHash,
          correlationHash: winner.correlationHash,
          outcome: winner.outcome,
        }),
      );
    } catch {
      fail("PORTAL_FOLLOW_UP_CONCURRENCY_SAME_KEY_CONFLICT_FAILED");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeScenario(connections, primaryError);
  }
}

async function runDifferentKeyRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    CASES.differentKeyStale,
    ["a", "b", "control", "observer"],
  );
  const connections = Object.values(scenario);
  let primaryError = null;
  try {
    const fixture = await resetFixture(
      scenario.control,
      CASES.differentKeyStale,
    );
    await Promise.all([
      configureJwt(
        scenario.a.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
      configureJwt(
        scenario.b.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
    ]);
    await query(scenario.control.client, "begin");
    await lockReferral(scenario.control, CASES.differentKeyStale);
    const specifications = [
      {
        connection: scenario.a,
        outcome: "INFORMATION_REQUESTED",
        mutationHash: MUTATIONS.differentKeyA,
        payloadHash: fixture.information_requested_hash,
        correlationHash: CORRELATIONS.differentKeyA,
      },
      {
        connection: scenario.b,
        outcome: "SERVICE_COMMENCED",
        mutationHash: MUTATIONS.differentKeyB,
        payloadHash: fixture.service_commenced_hash,
        correlationHash: CORRELATIONS.differentKeyB,
      },
    ];
    const calls = specifications.map((specification) =>
      captureDatabaseOperation(
        recordQuery(
          specification.connection.client,
          fixture,
          specification.outcome,
          specification.mutationHash,
          specification.payloadHash,
          specification.correlationHash,
        ),
      ),
    );
    await waitForExactBlockers(scenario.observer, {
      [scenario.a.pid]: [scenario.control.pid],
      [scenario.b.pid]: [scenario.control.pid],
    });
    await query(scenario.control.client, "commit");
    const outcomes = await Promise.all(calls);
    const winnerIndex = outcomes.findIndex((outcome) => outcome.ok);
    const failures = outcomes.filter((outcome) => !outcome.ok);
    assert(
      winnerIndex >= 0 &&
        outcomes.filter((outcome) => outcome.ok).length === 1 &&
        successAck(outcomes[winnerIndex], fixture.expected_version) &&
        failures.length === 1 &&
        failures[0].sqlState === "P0001" &&
        failures[0].reason === "PORTAL_STALE_REFERRAL",
      "PORTAL_FOLLOW_UP_CONCURRENCY_DIFFERENT_KEY_FAILED",
    );
    const winner = specifications[winnerIndex];
    try {
      assertSingleEffectState(
        await fixtureState(scenario.observer, CASES.differentKeyStale),
        expectedSingleEffect(fixture, {
          actorUserId: fixture.actor_a_user_id,
          mutationHash: winner.mutationHash,
          payloadHash: winner.payloadHash,
          correlationHash: winner.correlationHash,
          outcome: winner.outcome,
        }),
      );
    } catch {
      fail("PORTAL_FOLLOW_UP_CONCURRENCY_DIFFERENT_KEY_FAILED");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeScenario(connections, primaryError);
  }
}

async function runSameProviderActorRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    CASES.sameProviderActors,
    ["a", "b", "control", "observer"],
  );
  const connections = Object.values(scenario);
  let primaryError = null;
  try {
    const fixture = await resetFixture(
      scenario.control,
      CASES.sameProviderActors,
    );
    await Promise.all([
      configureJwt(
        scenario.a.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
      configureJwt(
        scenario.b.client,
        fixture.actor_b_user_id,
        fixture.actor_b_session_id,
      ),
    ]);
    await query(scenario.control.client, "begin");
    await lockReferral(scenario.control, CASES.sameProviderActors);
    const specifications = [
      {
        connection: scenario.a,
        actorUserId: fixture.actor_a_user_id,
        correlationHash: CORRELATIONS.sameProviderActorA,
      },
      {
        connection: scenario.b,
        actorUserId: fixture.actor_b_user_id,
        correlationHash: CORRELATIONS.sameProviderActorB,
      },
    ];
    const calls = specifications.map((specification) =>
      captureDatabaseOperation(
        recordQuery(
          specification.connection.client,
          fixture,
          "CONTACT_CONFIRMED",
          MUTATIONS.sameProviderActors,
          fixture.contact_confirmed_hash,
          specification.correlationHash,
        ),
      ),
    );
    await waitForExactBlockers(scenario.observer, {
      [scenario.a.pid]: [scenario.control.pid],
      [scenario.b.pid]: [scenario.control.pid],
    });
    await query(scenario.control.client, "commit");
    const outcomes = await Promise.all(calls);
    const winnerIndex = outcomes.findIndex((outcome) => outcome.ok);
    const failures = outcomes.filter((outcome) => !outcome.ok);
    assert(
      winnerIndex >= 0 &&
        outcomes.filter((outcome) => outcome.ok).length === 1 &&
        successAck(outcomes[winnerIndex], fixture.expected_version) &&
        failures.length === 1 &&
        failures[0].sqlState === "P0001" &&
        failures[0].reason === "PORTAL_STALE_REFERRAL",
      "PORTAL_FOLLOW_UP_CONCURRENCY_ACTOR_SCOPE_FAILED",
    );
    const winner = specifications[winnerIndex];
    try {
      assertSingleEffectState(
        await fixtureState(scenario.observer, CASES.sameProviderActors),
        expectedSingleEffect(fixture, {
          actorUserId: winner.actorUserId,
          mutationHash: MUTATIONS.sameProviderActors,
          payloadHash: fixture.contact_confirmed_hash,
          correlationHash: winner.correlationHash,
          outcome: "CONTACT_CONFIRMED",
        }),
      );
    } catch {
      fail("PORTAL_FOLLOW_UP_CONCURRENCY_ACTOR_SCOPE_FAILED");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeScenario(connections, primaryError);
  }
}

async function runRevocationFirstRace(
  Client,
  databaseUrl,
  target,
  caseName,
  mutationHash,
  correlationHash,
  helper,
  expectedReason,
  failureCode,
) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    caseName,
    ["a", "control", "observer"],
  );
  const connections = Object.values(scenario);
  let primaryError = null;
  try {
    const fixture = await resetFixture(scenario.control, caseName);
    await configureJwt(
      scenario.a.client,
      fixture.actor_a_user_id,
      fixture.actor_a_session_id,
    );
    await query(scenario.control.client, "begin");
    await lockMutation(
      scenario.control,
      fixture.actor_a_user_id,
      mutationHash,
    );
    const call = captureDatabaseOperation(
      recordQuery(
        scenario.a.client,
        fixture,
        "CONTACT_CONFIRMED",
        mutationHash,
        fixture.contact_confirmed_hash,
        correlationHash,
      ),
    );
    await waitForExactBlockers(scenario.observer, {
      [scenario.a.pid]: [scenario.control.pid],
    });
    if (helper === "revoke_provider") {
      await query(
        scenario.observer.client,
        "select " + SUPPORT + ".revoke_provider()",
      );
    } else {
      await query(
        scenario.observer.client,
        "select " + SUPPORT + "." + helper + "($1::text)",
        [caseName],
      );
    }
    await query(scenario.control.client, "commit");
    const outcome = await call;
    assert(
      !outcome.ok &&
        outcome.sqlState === "P0001" &&
        outcome.reason === expectedReason,
      failureCode,
    );
    try {
      const state = await fixtureState(scenario.observer, caseName);
      assertZeroEffectState(state, fixture);
      assert(
        (caseName === CASES.session && state?.session_exists === false) ||
          (caseName === CASES.provider &&
            state?.provider_review_status === "SUSPENDED"),
        failureCode,
      );
    } catch {
      fail(failureCode);
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeScenario(connections, primaryError);
  }
}

async function runFlagRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    CASES.flag,
    ["a", "control", "observer"],
  );
  const connections = Object.values(scenario);
  let primaryError = null;
  try {
    const fixture = await resetFixture(scenario.control, CASES.flag);
    await configureJwt(
      scenario.a.client,
      fixture.actor_a_user_id,
      fixture.actor_a_session_id,
    );
    await query(scenario.control.client, "begin");
    await query(
      scenario.control.client,
      "select " + SUPPORT + ".lock_follow_up_flag()",
    );
    const call = captureDatabaseOperation(
      recordQuery(
        scenario.a.client,
        fixture,
        "CONTACT_CONFIRMED",
        MUTATIONS.flag,
        fixture.contact_confirmed_hash,
        CORRELATIONS.flag,
      ),
    );
    await waitForExactBlockers(scenario.observer, {
      [scenario.a.pid]: [scenario.control.pid],
    });
    await query(
      scenario.control.client,
      "select " + SUPPORT + ".disable_follow_up_flag()",
    );
    await query(scenario.control.client, "commit");
    const outcome = await call;
    assert(
      !outcome.ok &&
        outcome.sqlState === "P0001" &&
        outcome.reason === "PORTAL_CAPABILITY_DISABLED",
      "PORTAL_FOLLOW_UP_CONCURRENCY_FLAG_RACE_FAILED",
    );
    try {
      const state = await fixtureState(scenario.observer, CASES.flag);
      assertZeroEffectState(state, fixture);
      assert(
        state?.follow_up_flag_enabled === false,
        "PORTAL_FOLLOW_UP_CONCURRENCY_FLAG_RACE_FAILED",
      );
    } catch {
      fail("PORTAL_FOLLOW_UP_CONCURRENCY_FLAG_RACE_FAILED");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeScenario(connections, primaryError);
  }
}

async function runOwnershipRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    CASES.ownership,
    ["a", "b", "control", "observer"],
  );
  const connections = Object.values(scenario);
  let primaryError = null;
  try {
    const fixture = await resetFixture(scenario.control, CASES.ownership);
    await Promise.all([
      configureJwt(
        scenario.a.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
      configureJwt(
        scenario.b.client,
        fixture.actor_a_user_id,
        fixture.actor_a_session_id,
      ),
    ]);
    const first = await captureDatabaseOperation(
      recordQuery(
        scenario.a.client,
        fixture,
        "CONTACT_CONFIRMED",
        MUTATIONS.ownershipReceipt,
        fixture.contact_confirmed_hash,
        CORRELATIONS.ownershipReceipt,
      ),
    );
    assert(
      successAck(first, fixture.expected_version),
      "PORTAL_FOLLOW_UP_CONCURRENCY_OWNERSHIP_RACE_FAILED",
    );
    assertSingleEffectState(
      await fixtureState(scenario.observer, CASES.ownership),
      expectedSingleEffect(fixture, {
        actorUserId: fixture.actor_a_user_id,
        mutationHash: MUTATIONS.ownershipReceipt,
        payloadHash: fixture.contact_confirmed_hash,
        correlationHash: CORRELATIONS.ownershipReceipt,
        outcome: "CONTACT_CONFIRMED",
      }),
    );

    await query(scenario.control.client, "begin");
    await query(
      scenario.control.client,
      "select " + SUPPORT + ".revoke_ownership($1::text)",
      [CASES.ownership],
    );
    const waiter = captureDatabaseOperation(
      recordQuery(
        scenario.b.client,
        fixture,
        "NO_RESPONSE",
        MUTATIONS.ownershipWaiter,
        fixture.no_response_hash,
        CORRELATIONS.ownershipWaiter,
      ),
    );
    const replay = captureDatabaseOperation(
      recordQuery(
        scenario.a.client,
        fixture,
        "CONTACT_CONFIRMED",
        MUTATIONS.ownershipReceipt,
        fixture.contact_confirmed_hash,
        CORRELATIONS.ownershipReceipt,
      ),
    );
    await waitForExactBlockers(scenario.observer, {
      [scenario.a.pid]: [scenario.control.pid],
      [scenario.b.pid]: [scenario.control.pid],
    });
    await query(scenario.control.client, "commit");
    const [waiterOutcome, replayOutcome] = await Promise.all([waiter, replay]);
    assert(
      !waiterOutcome.ok &&
        waiterOutcome.sqlState === "P0001" &&
        waiterOutcome.reason === "PORTAL_NOT_FOUND" &&
        !replayOutcome.ok &&
        replayOutcome.sqlState === "P0001" &&
        replayOutcome.reason === "PORTAL_NOT_FOUND",
      "PORTAL_FOLLOW_UP_CONCURRENCY_OWNERSHIP_RACE_FAILED",
    );
    try {
      assertSingleEffectState(
        await fixtureState(scenario.observer, CASES.ownership),
        expectedSingleEffect(fixture, {
          referralStatus: "CLOSED",
          referralVersion: number(fixture.expected_version) + 2,
          assignedProviderId: null,
          matchStatus: "WITHDRAWN",
          matchVersion: 3,
          actorUserId: fixture.actor_a_user_id,
          mutationHash: MUTATIONS.ownershipReceipt,
          payloadHash: fixture.contact_confirmed_hash,
          correlationHash: CORRELATIONS.ownershipReceipt,
          outcome: "CONTACT_CONFIRMED",
        }),
      );
    } catch {
      fail("PORTAL_FOLLOW_UP_CONCURRENCY_OWNERSHIP_RACE_FAILED");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeScenario(connections, primaryError);
  }
}

async function cleanupFixture(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    CASES.replay,
    ["control", "observer"],
  );
  let primaryError = null;
  try {
    await query(
      scenario.control.client,
      "select " + SUPPORT + ".cleanup_fixture()",
    );
    for (const caseName of Object.values(CASES)) {
      const state = await fixtureState(scenario.control, caseName);
      assert(
        state?.referral_status === null &&
          number(state?.followup_count) === 0 &&
          number(state?.audit_count) === 0 &&
          number(state?.receipt_count) === 0 &&
          Array.isArray(state?.followups) &&
          state.followups.length === 0 &&
          Array.isArray(state?.audits) &&
          state.audits.length === 0 &&
          Array.isArray(state?.receipts) &&
          state.receipts.length === 0 &&
          state?.session_exists === false &&
          state?.provider_review_status === null &&
          state?.follow_up_flag_enabled === false,
        "PORTAL_FOLLOW_UP_CONCURRENCY_CLEANUP_FAILED",
      );
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await closeScenario(Object.values(scenario), primaryError);
  }
}

export async function runPortalFollowUpConcurrencyHarness(env = process.env) {
  const { databaseUrl, target } =
    readPortalFollowUpConcurrencyEnvironment(env);
  const pgModule = await import("pg");
  const Client = pgModule.Client ?? pgModule.default?.Client;
  assert(
    typeof Client === "function",
    "PORTAL_FOLLOW_UP_CONCURRENCY_CONNECTION_FAILED",
  );

  const completed = [];
  let primaryError = null;
  try {
    await runSameKeyReplayRace(Client, databaseUrl, target);
    completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[0]);
    await runSameKeyConflictRace(Client, databaseUrl, target);
    completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[1]);
    await runDifferentKeyRace(Client, databaseUrl, target);
    completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[2]);
    await runSameProviderActorRace(Client, databaseUrl, target);
    completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[3]);
    await runRevocationFirstRace(
      Client,
      databaseUrl,
      target,
      CASES.session,
      MUTATIONS.session,
      CORRELATIONS.session,
      "revoke_session",
      "PORTAL_SESSION_REVOKED",
      "PORTAL_FOLLOW_UP_CONCURRENCY_SESSION_RACE_FAILED",
    );
    completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[4]);
    await runRevocationFirstRace(
      Client,
      databaseUrl,
      target,
      CASES.provider,
      MUTATIONS.provider,
      CORRELATIONS.provider,
      "revoke_provider",
      "PORTAL_FORBIDDEN",
      "PORTAL_FOLLOW_UP_CONCURRENCY_PROVIDER_RACE_FAILED",
    );
    completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[5]);
    await runFlagRace(Client, databaseUrl, target);
    completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[6]);
    await runOwnershipRace(Client, databaseUrl, target);
    completed.push(PORTAL_FOLLOW_UP_CONCURRENCY_SCENARIOS[7]);
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await cleanupFixture(Client, databaseUrl, target);
  } catch (error) {
    cleanupError = error;
  }

  if (primaryError !== null) throw primaryError;
  if (cleanupError !== null) throw cleanupError;

  return Object.freeze({
    ok: true,
    gate: "portal-referral-follow-up-concurrency",
    postgresMajor: 16,
    target: "passwordless-private-unix-socket",
    marker: PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
    scenariosPassed: completed.length,
    scenarios: Object.freeze(completed),
    cleanup: "aggregate-fixture-zero",
  });
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runPortalFollowUpConcurrencyHarness()
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + "\n");
    })
    .catch((error) => {
      const code =
        error instanceof PortalFollowUpConcurrencyHarnessError ||
        typeof error?.code === "string"
          ? error.code
          : "PORTAL_FOLLOW_UP_CONCURRENCY_INTERNAL_FAILED";
      process.stderr.write(String(code) + "\n");
      process.exitCode = 1;
    });
}
