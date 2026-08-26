import { pathToFileURL } from "node:url";
import {
  assertPortalResponseConcurrencyDistinctBackends,
  assertPortalResponseConcurrencyPolicyRegression,
  assertPortalResponseConcurrencyPreflight,
  readPortalResponseConcurrencyEnvironment,
} from "./portal-referral-provider-response-concurrency-local-pg16-policy.mjs";

const SUPPORT =
  "careslink_portal_response_concurrency_test_support";

const PROVIDER_USER_ID = "a3100000-0000-4000-8000-000000000001";
const PROVIDER_SESSION_ID = "b3100000-0000-4000-8000-000000000001";
const OPERATOR_USER_ID = "a3200000-0000-4000-8000-000000000002";
const OPERATOR_SESSION_ID = "b3200000-0000-4000-8000-000000000002";
const PROVIDER_A_ID = "d3100000-0000-4000-8000-000000000001";

const HASHES = Object.freeze({
  replay: "1".repeat(64),
  replayCorrelation: "2".repeat(64),
  competitionAccept: "3".repeat(64),
  competitionDecline: "4".repeat(64),
  session: "5".repeat(64),
  provider: "6".repeat(64),
  flag: "7".repeat(64),
  orderingResponse: "8".repeat(64),
  orderingOffer: "9".repeat(64),
  correlation: "a".repeat(64),
});

const HARNESS_ERRORS = new Set([
  "PORTAL_RESPONSE_CONCURRENCY_CONNECTION_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_PASSWORD_AUTH_DENIED",
  "PORTAL_RESPONSE_CONCURRENCY_PREFLIGHT_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_FIXTURE_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_LOCK_NOT_OBSERVED",
  "PORTAL_RESPONSE_CONCURRENCY_REPLAY_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_COMPETITION_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_SESSION_RACE_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_PROVIDER_RACE_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_FLAG_RACE_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_OFFER_RESPONSE_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_CLEANUP_FAILED",
  "PORTAL_RESPONSE_CONCURRENCY_INTERNAL_FAILED",
]);

export class PortalResponseConcurrencyHarnessError extends Error {
  constructor(code) {
    const fixed = HARNESS_ERRORS.has(code)
      ? code
      : "PORTAL_RESPONSE_CONCURRENCY_INTERNAL_FAILED";
    super(fixed);
    this.name = "PortalResponseConcurrencyHarnessError";
    this.code = fixed;
  }
}

function fail(code) {
  throw new PortalResponseConcurrencyHarnessError(code);
}

function assert(condition, code) {
  if (!condition) {
    fail(code);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function exactJsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function denyPortalResponseConcurrencyPasswordAuthentication() {
  fail("PORTAL_RESPONSE_CONCURRENCY_PASSWORD_AUTH_DENIED");
}

function claims(userId, sessionId) {
  return JSON.stringify({
    role: "authenticated",
    sub: userId,
    session_id: sessionId,
  });
}

async function configureJwt(client, userId, sessionId) {
  await client.query(
    "select pg_catalog.set_config('request.jwt.claims', $1, false)",
    [claims(userId, sessionId)],
  );
}

async function connectClient(Client, databaseUrl, target, applicationName) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: applicationName,
    ssl: false,
    password: denyPortalResponseConcurrencyPasswordAuthentication,
  });
  let asynchronousError = false;
  client.on("error", () => {
    asynchronousError = true;
  });

  try {
    await client.connect();
    const result = await client.query(
      "select " +
        "pg_catalog.host(pg_catalog.inet_server_addr()) as server_addr, " +
        "pg_catalog.inet_server_port() as server_port, " +
        "pg_catalog.current_database() as database_name, " +
        "session_user as session_user_name, " +
        "current_user as current_user_name, " +
        "pg_catalog.current_setting('server_version_num') as server_version_num, " +
        "pg_catalog.pg_backend_pid() as backend_pid, " +
        "coalesce((select ssl from pg_catalog.pg_stat_ssl " +
        "where pid = pg_catalog.pg_backend_pid()), false) as ssl_in_use, " +
        "pg_catalog.current_setting(" +
        "'careslink.portal_response_concurrency_marker', true" +
        ") as bootstrap_marker",
    );
    const preflight = assertPortalResponseConcurrencyPreflight(
      result.rows[0],
      target,
    );
    await client.query("set statement_timeout = '8s'");
    await client.query("set lock_timeout = '7s'");
    await client.query("set idle_in_transaction_session_timeout = '10s'");
    return {
      client,
      pid: preflight.backendPid,
      assertHealthy() {
        if (asynchronousError) {
          fail("PORTAL_RESPONSE_CONCURRENCY_CONNECTION_FAILED");
        }
      },
    };
  } catch {
    try {
      await client.end();
    } catch {
      // The fixed connection error below is the only outward detail.
    }
    fail("PORTAL_RESPONSE_CONCURRENCY_PREFLIGHT_FAILED");
  }
}

async function closeConnections(connections) {
  for (const connection of connections) {
    try {
      await connection.client.query("rollback");
    } catch {
      // An autocommit or already-closed connection needs no rollback.
    }
    try {
      await connection.client.end();
    } catch {
      fail("PORTAL_RESPONSE_CONCURRENCY_CONNECTION_FAILED");
    }
    connection.assertHealthy();
  }
}

async function openScenario(
  Client,
  databaseUrl,
  target,
  scenario,
  labels,
) {
  const connections = await Promise.all(
    labels.map((label) =>
      connectClient(
        Client,
        databaseUrl,
        target,
        "careslink-portal-response-race-" + scenario + "-" + label,
      ),
    ),
  );
  assertPortalResponseConcurrencyDistinctBackends(
    ...connections.map((connection) => connection.pid),
  );
  return Object.fromEntries(
    labels.map((label, index) => [label, connections[index]]),
  );
}

async function resetFixture(connection, caseName) {
  const result = await connection.client.query(
    "select " + SUPPORT + ".reset_fixture($1) as fixture",
    [caseName],
  );
  const fixture = result.rows[0]?.fixture;
  assert(
    fixture?.case === caseName &&
      fixture?.response_accept_hash?.length === 64 &&
      fixture?.response_decline_hash?.length === 64 &&
      fixture?.assignment_offer_hash?.length === 64,
    "PORTAL_RESPONSE_CONCURRENCY_FIXTURE_FAILED",
  );
  return fixture;
}

async function fixtureState(connection) {
  const result = await connection.client.query(
    "select " + SUPPORT + ".fixture_state() as state",
  );
  return result.rows[0]?.state;
}

async function waitForBlocked(observer, backendPids, expectedCount) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await observer.client.query(
      "select " + SUPPORT + ".blocked_count($1::integer[]) as count",
      [backendPids],
    );
    if (Number(result.rows[0]?.count) === expectedCount) {
      return;
    }
    await delay(25);
  }
  fail("PORTAL_RESPONSE_CONCURRENCY_LOCK_NOT_OBSERVED");
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

function responseQuery(
  client,
  fixture,
  decision,
  mutationHash,
  payloadHash,
  correlationHash,
) {
  return client.query(
    "select public.portal_referral_provider_response_respond(" +
      "$1::uuid, 3::bigint, $2::text, $3::text, $4::text, $5::text" +
      ") as response",
    [
      fixture.match_a_id,
      decision,
      mutationHash,
      payloadHash,
      correlationHash,
    ],
  );
}

function offerQuery(client, fixture) {
  return client.query(
    "select public.portal_referral_assignment_offer(" +
      "$1::uuid, $2::uuid, 4::bigint, $3::text, $4::text, $5::text" +
      ") as response",
    [
      fixture.referral_id,
      fixture.provider_b_id,
      HASHES.orderingOffer,
      fixture.assignment_offer_hash,
      HASHES.correlation,
    ],
  );
}

export function assertSingleEffectState(state, expectedStatus) {
  const expectedMatchStatus =
    expectedStatus === "ACCEPTED"
      ? "ACCEPTED"
      : expectedStatus === "TRIAGED"
        ? "DECLINED"
        : null;
  const expectedAssignedProvider =
    expectedStatus === "ACCEPTED" ? PROVIDER_A_ID : null;
  const ok =
    expectedMatchStatus !== null &&
    state?.referral_status === expectedStatus &&
    Number(state?.referral_version) === 4 &&
    state?.assigned_provider_id === expectedAssignedProvider &&
    state?.match_a_status === expectedMatchStatus &&
    Number(state?.audit_count) === 1 &&
    Number(state?.receipt_count) === 1 &&
    Number(state?.response_audit_count) === 1 &&
    Number(state?.offer_audit_count) === 0;
  if (!ok) {
    fail("PORTAL_RESPONSE_CONCURRENCY_REPLAY_FAILED");
  }
  return Object.freeze({ ok: true, status: expectedStatus, effects: 1 });
}

export function assertZeroEffectState(state) {
  const ok =
    state?.referral_status === "OFFERED" &&
    Number(state?.referral_version) === 3 &&
    state?.match_a_status === "OFFERED" &&
    Number(state?.audit_count) === 0 &&
    Number(state?.receipt_count) === 0;
  if (!ok) {
    fail("PORTAL_RESPONSE_CONCURRENCY_INTERNAL_FAILED");
  }
  return Object.freeze({ ok: true, effects: 0 });
}

async function runReplayRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    "replay",
    ["a", "b", "control", "observer"],
  );
  const connections = Object.values(scenario);
  try {
    const fixture = await resetFixture(scenario.control, "replay");
    await configureJwt(
      scenario.a.client,
      PROVIDER_USER_ID,
      PROVIDER_SESSION_ID,
    );
    await configureJwt(
      scenario.b.client,
      PROVIDER_USER_ID,
      PROVIDER_SESSION_ID,
    );

    await scenario.a.client.query("begin");
    await scenario.a.client.query(
      "select " + SUPPORT + ".lock_mutation($1)",
      [HASHES.replay],
    );

    const replayPromise = responseQuery(
      scenario.b.client,
      fixture,
      "ACCEPT",
      HASHES.replay,
      fixture.response_accept_hash,
      HASHES.replayCorrelation,
    );
    await waitForBlocked(scenario.observer, [scenario.b.pid], 1);

    const first = await responseQuery(
      scenario.a.client,
      fixture,
      "ACCEPT",
      HASHES.replay,
      fixture.response_accept_hash,
      HASHES.replayCorrelation,
    );
    await scenario.a.client.query("commit");
    const replay = await replayPromise;

    assert(
      exactJsonEqual(first.rows[0]?.response, replay.rows[0]?.response),
      "PORTAL_RESPONSE_CONCURRENCY_REPLAY_FAILED",
    );
    assertSingleEffectState(await fixtureState(scenario.control), "ACCEPTED");
  } finally {
    await closeConnections(connections);
  }
}

async function runCompetitionRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    "competition",
    ["a", "b", "control", "observer"],
  );
  const connections = Object.values(scenario);
  try {
    const fixture = await resetFixture(scenario.control, "competition");
    await configureJwt(
      scenario.a.client,
      PROVIDER_USER_ID,
      PROVIDER_SESSION_ID,
    );
    await configureJwt(
      scenario.b.client,
      PROVIDER_USER_ID,
      PROVIDER_SESSION_ID,
    );
    await scenario.control.client.query("begin");
    await scenario.control.client.query(
      "select " + SUPPORT + ".lock_referral()",
    );

    const acceptPromise = captureDatabaseOperation(
      responseQuery(
        scenario.a.client,
        fixture,
        "ACCEPT",
        HASHES.competitionAccept,
        fixture.response_accept_hash,
        HASHES.correlation,
      ),
    );
    const declinePromise = captureDatabaseOperation(
      responseQuery(
        scenario.b.client,
        fixture,
        "DECLINE",
        HASHES.competitionDecline,
        fixture.response_decline_hash,
        HASHES.correlation,
      ),
    );
    await waitForBlocked(
      scenario.observer,
      [scenario.a.pid, scenario.b.pid],
      2,
    );
    await scenario.control.client.query("commit");

    const outcomes = await Promise.all([acceptPromise, declinePromise]);
    const successes = outcomes.filter((outcome) => outcome.ok);
    const failures = outcomes.filter((outcome) => !outcome.ok);
    const winnerIndex = outcomes.findIndex((outcome) => outcome.ok);
    const winnerDecision = winnerIndex === 0 ? "ACCEPT" : "DECLINE";
    const expectedWinnerStatus =
      winnerDecision === "ACCEPT" ? "ACCEPTED" : "TRIAGED";
    assert(
      successes.length === 1 &&
        failures.length === 1 &&
        winnerIndex >= 0 &&
        successes[0].value?.rows[0]?.response?.current_status ===
          expectedWinnerStatus &&
        Number(successes[0].value?.rows[0]?.response?.row_version) === 4 &&
        failures[0].sqlState === "P0001" &&
        [
          "PORTAL_INVALID_STATE_TRANSITION",
          "PORTAL_STALE_REFERRAL",
        ].includes(failures[0].reason),
      "PORTAL_RESPONSE_CONCURRENCY_COMPETITION_FAILED",
    );

    const state = await fixtureState(scenario.control);
    try {
      assertSingleEffectState(state, expectedWinnerStatus);
    } catch {
      fail("PORTAL_RESPONSE_CONCURRENCY_COMPETITION_FAILED");
    }
  } finally {
    await closeConnections(connections);
  }
}

async function runRevocationRace(
  Client,
  databaseUrl,
  target,
  scenarioName,
  mutationHash,
  helperName,
  expectedReason,
  failureCode,
) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    scenarioName,
    ["a", "control", "observer"],
  );
  const connections = Object.values(scenario);
  try {
    const fixture = await resetFixture(scenario.control, scenarioName);
    await configureJwt(
      scenario.a.client,
      PROVIDER_USER_ID,
      PROVIDER_SESSION_ID,
    );
    await scenario.control.client.query("begin");
    await scenario.control.client.query(
      "select " + SUPPORT + ".lock_mutation($1)",
      [mutationHash],
    );
    const responsePromise = captureDatabaseOperation(
      responseQuery(
        scenario.a.client,
        fixture,
        "ACCEPT",
        mutationHash,
        fixture.response_accept_hash,
        HASHES.correlation,
      ),
    );
    await waitForBlocked(scenario.observer, [scenario.a.pid], 1);
    await scenario.observer.client.query(
      "select " + SUPPORT + "." + helperName + "()",
    );
    await scenario.control.client.query("commit");
    const outcome = await responsePromise;
    assert(
      !outcome.ok &&
        outcome.sqlState === "P0001" &&
        outcome.reason === expectedReason,
      failureCode,
    );
    try {
      assertZeroEffectState(await fixtureState(scenario.observer));
    } catch {
      fail(failureCode);
    }
  } finally {
    await closeConnections(connections);
  }
}

async function runFlagRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    "flag",
    ["a", "control", "observer"],
  );
  const connections = Object.values(scenario);
  try {
    const fixture = await resetFixture(scenario.control, "flag");
    await configureJwt(
      scenario.a.client,
      PROVIDER_USER_ID,
      PROVIDER_SESSION_ID,
    );
    await scenario.control.client.query("begin");
    await scenario.control.client.query(
      "select " + SUPPORT + ".lock_response_flag()",
    );
    const responsePromise = captureDatabaseOperation(
      responseQuery(
        scenario.a.client,
        fixture,
        "ACCEPT",
        HASHES.flag,
        fixture.response_accept_hash,
        HASHES.correlation,
      ),
    );
    await waitForBlocked(scenario.observer, [scenario.a.pid], 1);
    await scenario.control.client.query(
      "select " + SUPPORT + ".disable_response_flag()",
    );
    await scenario.control.client.query("commit");
    const outcome = await responsePromise;
    assert(
      !outcome.ok &&
        outcome.sqlState === "P0001" &&
        outcome.reason === "PORTAL_CAPABILITY_DISABLED",
      "PORTAL_RESPONSE_CONCURRENCY_FLAG_RACE_FAILED",
    );
    try {
      assertZeroEffectState(await fixtureState(scenario.observer));
    } catch {
      fail("PORTAL_RESPONSE_CONCURRENCY_FLAG_RACE_FAILED");
    }
  } finally {
    await closeConnections(connections);
  }
}

async function runOfferResponseOrderingRace(Client, databaseUrl, target) {
  const scenario = await openScenario(
    Client,
    databaseUrl,
    target,
    "offer-response",
    ["a", "b", "observer"],
  );
  const connections = Object.values(scenario);
  try {
    const fixture = await resetFixture(scenario.observer, "offer-response");
    await configureJwt(
      scenario.a.client,
      PROVIDER_USER_ID,
      PROVIDER_SESSION_ID,
    );
    await configureJwt(
      scenario.b.client,
      OPERATOR_USER_ID,
      OPERATOR_SESSION_ID,
    );
    await scenario.a.client.query("begin");
    await scenario.a.client.query(
      "select " + SUPPORT + ".lock_referral()",
    );
    const offerPromise = offerQuery(scenario.b.client, fixture);
    await waitForBlocked(scenario.observer, [scenario.b.pid], 1);

    const declined = await responseQuery(
      scenario.a.client,
      fixture,
      "DECLINE",
      HASHES.orderingResponse,
      fixture.response_decline_hash,
      HASHES.correlation,
    );
    assert(
      declined.rows[0]?.response?.current_status === "TRIAGED",
      "PORTAL_RESPONSE_CONCURRENCY_OFFER_RESPONSE_FAILED",
    );
    await scenario.a.client.query("commit");
    const offered = await offerPromise;
    assert(
      offered.rows[0]?.response?.current_status === "OFFERED" &&
        Number(offered.rows[0]?.response?.row_version) === 5,
      "PORTAL_RESPONSE_CONCURRENCY_OFFER_RESPONSE_FAILED",
    );

    const state = await fixtureState(scenario.observer);
    assert(
      state?.referral_status === "OFFERED" &&
        Number(state?.referral_version) === 5 &&
        state?.match_a_status === "DECLINED" &&
        state?.match_b_status === "OFFERED" &&
        Number(state?.audit_count) === 2 &&
        Number(state?.receipt_count) === 2 &&
        Number(state?.response_audit_count) === 1 &&
        Number(state?.offer_audit_count) === 1,
      "PORTAL_RESPONSE_CONCURRENCY_OFFER_RESPONSE_FAILED",
    );
  } finally {
    await closeConnections(connections);
  }
}

async function cleanupFixture(Client, databaseUrl, target) {
  const connection = await connectClient(
    Client,
    databaseUrl,
    target,
    "careslink-portal-response-race-replay-control",
  );
  try {
    await connection.client.query(
      "select " + SUPPORT + ".cleanup_fixture()",
    );
    const state = await fixtureState(connection);
    assert(
      state?.referral_status === null &&
        Number(state?.audit_count) === 0 &&
        Number(state?.receipt_count) === 0,
      "PORTAL_RESPONSE_CONCURRENCY_CLEANUP_FAILED",
    );
  } finally {
    await closeConnections([connection]);
  }
}

export async function runPortalResponseConcurrencyHarness(env = process.env) {
  assertPortalResponseConcurrencyPolicyRegression();
  const { databaseUrl, target } =
    readPortalResponseConcurrencyEnvironment(env);
  const pgModule = await import("pg");
  const Client = pgModule.Client ?? pgModule.default?.Client;
  assert(
    typeof Client === "function",
    "PORTAL_RESPONSE_CONCURRENCY_CONNECTION_FAILED",
  );

  const completed = [];
  try {
    await runReplayRace(Client, databaseUrl, target);
    completed.push("same-key-replay");
    await runCompetitionRace(Client, databaseUrl, target);
    completed.push("different-key-accept-decline");
    await runRevocationRace(
      Client,
      databaseUrl,
      target,
      "session",
      HASHES.session,
      "revoke_session",
      "PORTAL_SESSION_REVOKED",
      "PORTAL_RESPONSE_CONCURRENCY_SESSION_RACE_FAILED",
    );
    completed.push("session-revocation-wait");
    await runRevocationRace(
      Client,
      databaseUrl,
      target,
      "provider",
      HASHES.provider,
      "revoke_provider",
      "PORTAL_FORBIDDEN",
      "PORTAL_RESPONSE_CONCURRENCY_PROVIDER_RACE_FAILED",
    );
    completed.push("provider-revocation-wait");
    await runFlagRace(Client, databaseUrl, target);
    completed.push("flag-disable-wait");
    await runOfferResponseOrderingRace(Client, databaseUrl, target);
    completed.push("m1b-decline-then-m1a-offer");
  } finally {
    await cleanupFixture(Client, databaseUrl, target);
  }

  return Object.freeze({
    ok: true,
    gate: "portal-provider-response-concurrency",
    postgresMajor: 16,
    target: "passwordless-ipv4-loopback",
    scenariosPassed: completed.length,
    scenarios: Object.freeze(completed),
    cleanup: "fixture-zero",
  });
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runPortalResponseConcurrencyHarness()
    .then((result) => {
      process.stdout.write(JSON.stringify(result) + "\n");
    })
    .catch((error) => {
      const code =
        error instanceof PortalResponseConcurrencyHarnessError ||
        typeof error?.code === "string"
          ? error.code
          : "PORTAL_RESPONSE_CONCURRENCY_INTERNAL_FAILED";
      process.stderr.write(String(code) + "\n");
      process.exitCode = 1;
    });
}
