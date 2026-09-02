import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_URL_ENV,
  COMMUNICATION_NOTE_POINTS_ADMISSION_MARKER,
  COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES,
  COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
  CommunicationNotePointsAdmissionConcurrencyPolicyError,
  assertCommunicationNotePointsAdmissionBlockerRows,
  assertCommunicationNotePointsAdmissionDistinctBackends,
  assertCommunicationNotePointsAdmissionPreflight,
  assertCommunicationNotePointsAdmissionSqlPolicy,
  readCommunicationNotePointsAdmissionEnvironment,
  validateCommunicationNotePointsAdmissionDatabaseUrl,
} from "./communication-note-points-admission-concurrency-policy.mjs";
import {
  COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES,
  COMMUNICATION_NOTE_POINTS_ADMISSION_TEST_ONLY,
  CommunicationNotePointsAdmissionConcurrencyHarnessError,
  assertCommunicationNotePointsAdmissionCommittedState,
  assertCommunicationNotePointsAdmissionEnvelope,
  assertCommunicationNotePointsAdmissionTerminalQuarantine,
  assertCommunicationNotePointsAdmissionZeroState,
  denyCommunicationNotePointsAdmissionPasswordAuthentication,
  runCommunicationNotePointsAdmissionConcurrencyHarness,
} from "./communication-note-points-admission-concurrency.mjs";

const SOCKET_DIRECTORY =
  "/private/tmp/careslink-communication-admission-pg16.ABC123/socket";
const DATABASE_URL =
  `postgresql://${COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE}` +
  `@localhost:55432/postgres?host=${encodeURIComponent(SOCKET_DIRECTORY)}`;
const SETUP_URL = new URL(
  "./communication-note-points-admission-concurrency-setup.sql",
  import.meta.url,
);
const CLEANUP_URL = new URL(
  "./communication-note-points-admission-concurrency-cleanup.sql",
  import.meta.url,
);
const HARNESS_URL = new URL(
  "./communication-note-points-admission-concurrency.mjs",
  import.meta.url,
);

function expectPolicyCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(
      CommunicationNotePointsAdmissionConcurrencyPolicyError,
    );
    expect(error).toMatchObject({ code, message: code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

function admission(created, jobId) {
  return {
    created,
    payloadAccepted: true,
    pointsReserved: true,
    job: {
      attemptCount: 0,
      createdAt: "2026-09-02T01:02:03.004Z",
      failureCode: null,
      finishedAt: null,
      jobId,
      noteType: "communication",
      result: null,
      serviceCode: "note.communication.generate",
      startedAt: null,
      status: "QUEUED",
      updatedAt: "2026-09-02T01:02:03.004Z",
    },
  };
}

function state(scenario, jobId = null) {
  const committed = jobId !== null;
  const identity = {
    "da150000-0000-4000-8000-000000000001": {
      payloadId: "da160000-0000-4000-8000-000000000001",
      idempotencyHash: "b".repeat(64),
    },
    "da250000-0000-4000-8000-000000000001": {
      payloadId: "da260000-0000-4000-8000-000000000001",
      idempotencyHash: "d".repeat(64),
    },
  }[jobId];
  return {
    case: scenario,
    jobCount: committed ? 1 : 0,
    payloadCount: committed ? 1 : 0,
    quoteCount: committed ? 1 : 0,
    reservationCount: committed ? 1 : 0,
    allocationCount: committed ? 1 : 0,
    allocationPoints: committed ? 20 : 0,
    bindingCount: committed ? 1 : 0,
    reserveLedgerCount: committed ? 1 : 0,
    reserveDelta: committed ? -20 : 0,
    grantLedgerCount: 1,
    lotRemaining: committed ? 10 : 30,
    jobIds: committed ? [jobId] : [],
    payloadIds: committed ? [identity.payloadId] : [],
    quoteIdempotencyKeys: committed
      ? [`communication-admission:${identity.idempotencyHash}`]
      : [],
    reservationIdempotencyKeys: committed
      ? [`communication-admission:${identity.idempotencyHash}`]
      : [],
    allQueuedAndBound: true,
  };
}

function databaseError(message) {
  return Object.assign(new Error(message), { code: "P0001" });
}

class FakeClient {
  static nextPid = 100;
  static byScenario = new Map();
  static pending = new Map();
  static admissionCalls = [];
  static helperCalls = [];
  static transactionCommands = [];
  static rollbackCount = 0;
  static endCount = 0;
  static hardDestroyCount = 0;

  static reset() {
    FakeClient.nextPid = 100;
    FakeClient.byScenario = new Map();
    FakeClient.pending = new Map();
    FakeClient.admissionCalls = [];
    FakeClient.helperCalls = [];
    FakeClient.transactionCommands = [];
    FakeClient.rollbackCount = 0;
    FakeClient.endCount = 0;
    FakeClient.hardDestroyCount = 0;
  }

  constructor(options) {
    this.options = options;
    this.pid = FakeClient.nextPid++;
    const match = /^careslink-communication-admission-race-(.+)-(a|b|observer)$/.exec(
      options.application_name,
    );
    this.scenario = match?.[1];
    this.label = match?.[2];
    const scenarioConnections = FakeClient.byScenario.get(this.scenario) ?? {};
    scenarioConnections[this.label] = this;
    FakeClient.byScenario.set(this.scenario, scenarioConnections);
    this.sameKeyFreshReturned = false;
    this.errorListener = null;
    this.connection = {
      stream: {
        destroyed: false,
        destroy() {
          this.destroyed = true;
          FakeClient.hardDestroyCount += 1;
        },
      },
    };
  }

  on(event, listener) {
    if (event === "error") this.errorListener = listener;
  }

  async connect() {}

  async end() {
    FakeClient.endCount += 1;
  }

  query(text, values = []) {
    if (text.includes("as server_addr")) {
      return Promise.resolve({
        rows: [
          {
            server_addr: null,
            server_port: "55432",
            database_name: "postgres",
            session_user_name: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
            current_user_name: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
            server_version_num: "160015",
            backend_pid: this.pid,
            ssl_in_use: false,
            concurrency_marker: COMMUNICATION_NOTE_POINTS_ADMISSION_MARKER,
          },
        ],
      });
    }
    if (/^rollback$/i.test(text)) {
      FakeClient.transactionCommands.push({
        scenario: this.scenario,
        label: this.label,
        command: "rollback",
      });
      FakeClient.rollbackCount += 1;
      return Promise.resolve({ rows: [] });
    }
    if (/^begin$/i.test(text)) {
      FakeClient.transactionCommands.push({
        scenario: this.scenario,
        label: this.label,
        command: "begin",
      });
      return Promise.resolve({ rows: [] });
    }
    if (/^set\s/i.test(text)) {
      return Promise.resolve({ rows: [] });
    }
    if (/^commit$/i.test(text)) {
      FakeClient.transactionCommands.push({
        scenario: this.scenario,
        label: this.label,
        command: "commit",
      });
      const pending = FakeClient.pending.get(this.scenario);
      if (pending) {
        FakeClient.pending.delete(this.scenario);
        if (this.scenario === "same-key") {
          pending.resolve({
            rows: [
              {
                admission: admission(
                  false,
                  "da150000-0000-4000-8000-000000000001",
                ),
              },
            ],
          });
        } else if (this.scenario === "different-key") {
          pending.reject(databaseError("POINTS_INSUFFICIENT"));
        } else if (this.scenario === "expiry-session") {
          pending.reject(databaseError("SESSION_REVOKED"));
        } else {
          pending.reject(databaseError("PRIVACY_REVIEW_STALE"));
        }
      }
      return Promise.resolve({ rows: [] });
    }
    if (text.includes("pg_catalog.pg_blocking_pids")) {
      const connections = FakeClient.byScenario.get(this.scenario);
      const pending = FakeClient.pending.get(this.scenario);
      return Promise.resolve({
        rows: pending
          ? [
              {
                waiting_pid: connections.b.pid,
                blocker_pid: connections.a.pid,
                locktype: "advisory",
                granted: false,
              },
            ]
          : [],
      });
    }
    if (text.includes(".arm_expiry(")) {
      FakeClient.helperCalls.push({
        helper: "arm-expiry",
        scenario: this.scenario,
        label: this.label,
      });
      const expectedCode =
        this.scenario === "expiry-session"
          ? "SESSION_REVOKED"
          : "PRIVACY_REVIEW_STALE";
      return Promise.resolve({
        rows: [
          {
            expiry: {
              case: this.scenario,
              boundaryExpiresAt: "2026-09-02T01:02:07.000Z",
              payloadExpiresAt: "2026-09-02T01:12:03.000Z",
              expectedCode,
            },
          },
        ],
      });
    }
    if (text.includes(".hold_points_lock(")) {
      FakeClient.helperCalls.push({
        helper: "hold-points-lock",
        scenario: this.scenario,
        label: this.label,
      });
      return Promise.resolve({ rows: [{ held: true }] });
    }
    if (text.includes(".fixture_state(")) {
      FakeClient.helperCalls.push({
        helper: "fixture-state",
        scenario: this.scenario,
        label: this.label,
      });
      const jobs = {
        "same-key": "da150000-0000-4000-8000-000000000001",
        "different-key": "da250000-0000-4000-8000-000000000001",
      };
      return Promise.resolve({
        rows: [{ state: state(this.scenario, jobs[this.scenario] ?? null) }],
      });
    }
    if (text.includes(".assert_generic_terminal_quarantine(")) {
      FakeClient.helperCalls.push({
        helper: "terminal-quarantine",
        scenario: this.scenario,
        label: this.label,
      });
      return Promise.resolve({
        rows: [
          {
            terminal_quarantine: {
              commitDenied: true,
              releaseDenied: true,
              reservationStatus: "RESERVED",
              terminalLedgerCount: 0,
              reserveLedgerCount: 1,
              lotRemaining: 10,
            },
          },
        ],
      });
    }
    if (text.includes("as admission")) {
      FakeClient.admissionCalls.push({
        scenario: this.scenario,
        label: this.label,
        values,
      });
      if (this.scenario === "same-key" && this.label === "a") {
        if (!this.sameKeyFreshReturned) {
          this.sameKeyFreshReturned = true;
          return Promise.resolve({
            rows: [
              {
                admission: admission(
                  true,
                  "da150000-0000-4000-8000-000000000001",
                ),
              },
            ],
          });
        }
        return Promise.resolve({
          rows: [
            {
              admission: admission(
                false,
                "da150000-0000-4000-8000-000000000001",
              ),
            },
          ],
        });
      }
      if (this.scenario === "different-key" && this.label === "a") {
        return Promise.resolve({
          rows: [
            {
              admission: admission(
                true,
                "da250000-0000-4000-8000-000000000001",
              ),
            },
          ],
        });
      }
      return new Promise((resolve, reject) => {
        FakeClient.pending.set(this.scenario, { resolve, reject });
      });
    }
    throw new Error(`Unexpected fake SQL: ${text.slice(0, 80)}`);
  }
}

class BarrierFailureClient {
  static nextPid = 500;
  static clients = new Map();
  static pendingAdmission = null;
  static events = [];
  static admissionFinishedAfterRelease = false;
  static contenderBRolledBackAfterAdmission = false;
  static committedAdmissionCount = 0;
  static endCount = 0;
  static hardDestroyCount = 0;

  static reset() {
    BarrierFailureClient.nextPid = 500;
    BarrierFailureClient.clients = new Map();
    BarrierFailureClient.pendingAdmission = null;
    BarrierFailureClient.events = [];
    BarrierFailureClient.admissionFinishedAfterRelease = false;
    BarrierFailureClient.contenderBRolledBackAfterAdmission = false;
    BarrierFailureClient.committedAdmissionCount = 0;
    BarrierFailureClient.endCount = 0;
    BarrierFailureClient.hardDestroyCount = 0;
  }

  constructor(options) {
    this.options = options;
    this.pid = BarrierFailureClient.nextPid++;
    this.label = options.application_name.split("-").at(-1);
    this.transactionOpen = false;
    this.stagedAdmission = false;
    this.errorListener = null;
    BarrierFailureClient.clients.set(this.label, this);
    this.connection = {
      stream: {
        destroyed: false,
        destroy() {
          this.destroyed = true;
          BarrierFailureClient.hardDestroyCount += 1;
        },
      },
    };
  }

  on(event, listener) {
    if (event === "error") this.errorListener = listener;
  }

  async connect() {}

  async end() {
    BarrierFailureClient.endCount += 1;
  }

  query(text) {
    if (text.includes("as server_addr")) {
      return Promise.resolve({
        rows: [
          {
            server_addr: null,
            server_port: "55432",
            database_name: "postgres",
            session_user_name: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
            current_user_name: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
            server_version_num: "160015",
            backend_pid: this.pid,
            ssl_in_use: false,
            concurrency_marker: COMMUNICATION_NOTE_POINTS_ADMISSION_MARKER,
          },
        ],
      });
    }
    if (/^set\s/i.test(text)) return Promise.resolve({ rows: [] });
    if (/^begin$/i.test(text)) {
      this.transactionOpen = true;
      BarrierFailureClient.events.push(`${this.label}:begin`);
      return Promise.resolve({ rows: [] });
    }
    if (text.includes("as admission")) {
      if (this.label === "a") {
        this.stagedAdmission = true;
        BarrierFailureClient.events.push("a:admission-staged");
        return Promise.resolve({
          rows: [
            {
              admission: admission(
                true,
                "da150000-0000-4000-8000-000000000001",
              ),
            },
          ],
        });
      }
      if (this.label === "b") {
        BarrierFailureClient.events.push("b:admission-waiting");
        return new Promise((resolve) => {
          let resolveSettled;
          const settled = new Promise((settledResolve) => {
            resolveSettled = settledResolve;
          });
          BarrierFailureClient.pendingAdmission = {
            settled,
            release: () => {
              this.stagedAdmission = true;
              BarrierFailureClient.admissionFinishedAfterRelease = true;
              BarrierFailureClient.events.push("b:admission-finished");
              resolve({
                rows: [
                  {
                    admission: admission(
                      true,
                      "da150000-0000-4000-8000-000000000001",
                    ),
                  },
                ],
              });
              resolveSettled();
            },
          };
        });
      }
    }
    if (text.includes("pg_catalog.pg_blocking_pids")) {
      if (BarrierFailureClient.pendingAdmission === null) {
        throw new Error("BARRIER_TEST_PENDING_ADMISSION_MISSING");
      }
      BarrierFailureClient.events.push("observer:barrier-failed");
      return Promise.reject(new Error("BARRIER_TEST_FAILURE"));
    }
    if (/^rollback$/i.test(text)) {
      return (async () => {
        if (this.label === "a") {
          this.stagedAdmission = false;
          this.transactionOpen = false;
          BarrierFailureClient.events.push("a:rollback-release");
          BarrierFailureClient.pendingAdmission?.release();
        } else if (this.label === "b") {
          await BarrierFailureClient.pendingAdmission?.settled;
          this.stagedAdmission = false;
          this.transactionOpen = false;
          BarrierFailureClient.contenderBRolledBackAfterAdmission =
            BarrierFailureClient.admissionFinishedAfterRelease;
          BarrierFailureClient.events.push("b:rollback");
        } else {
          BarrierFailureClient.events.push("observer:rollback");
        }
        return { rows: [] };
      })();
    }
    if (/^commit$/i.test(text)) {
      BarrierFailureClient.committedAdmissionCount += Number(
        this.stagedAdmission,
      );
      this.stagedAdmission = false;
      this.transactionOpen = false;
      BarrierFailureClient.events.push(`${this.label}:commit`);
      return Promise.resolve({ rows: [] });
    }
    throw new Error(`Unexpected barrier-failure SQL: ${text.slice(0, 80)}`);
  }
}

describe("Communication Note Points admission local PG16 policy", () => {
  it("accepts only one canonical passwordless high-port Unix-socket target", () => {
    expect(validateCommunicationNotePointsAdmissionDatabaseUrl(DATABASE_URL))
      .toEqual({
        ok: true,
        policyVersion: COMMUNICATION_NOTE_POINTS_ADMISSION_MARKER,
        transport: "unix-domain-socket",
        socketDirectory: SOCKET_DIRECTORY,
        port: 55432,
        database: "postgres",
        databaseRole: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
        postgresMajor: 16,
        sslMode: "disabled",
        passwordMaterial: "absent",
        hostedTarget: false,
      });

    for (const [unsafeUrl, code] of [
      [
        DATABASE_URL.replace("@localhost", ":secret@localhost"),
        COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES
          .credentialsDenied,
      ],
      [
        DATABASE_URL.replace(":55432", ":5432"),
        COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.portDenied,
      ],
      [
        DATABASE_URL.replace("localhost", "127.0.0.1"),
        COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.targetDenied,
      ],
      [
        DATABASE_URL.replace("?host=", "?sslmode=disable&host="),
        COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.queryDenied,
      ],
      [
        DATABASE_URL.replace(
          encodeURIComponent(SOCKET_DIRECTORY),
          encodeURIComponent("/tmp/not-owned/socket"),
        ),
        COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.queryDenied,
      ],
    ]) {
      expectPolicyCode(
        () => validateCommunicationNotePointsAdmissionDatabaseUrl(unsafeUrl),
        code,
      );
    }
  });

  it("rejects ambient libpq and hosted database environment variables", () => {
    expect(
      readCommunicationNotePointsAdmissionEnvironment({
        [COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_URL_ENV]: DATABASE_URL,
      }),
    ).toMatchObject({ databaseUrl: DATABASE_URL });
    for (const name of [
      "PGHOST",
      "PGHOSTADDR",
      "PGOPTIONS",
      "PGPASSFILE",
      "PGPASSWORD",
      "DATABASE_URL",
      "DIRECT_URL",
      "POSTGRES_URL",
      "SUPABASE_POOLER_URL",
    ]) {
      expectPolicyCode(
        () =>
          readCommunicationNotePointsAdmissionEnvironment({
            [COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_URL_ENV]:
              DATABASE_URL,
            [name]: "forbidden",
          }),
        COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES
          .environmentDenied,
      );
    }
  });

  it("uses current_setting(port) metadata while requiring a Unix backend", async () => {
    const harnessSource = await readFile(HARNESS_URL, "utf8");
    expect(harnessSource).toContain(
      "pg_catalog.current_setting('port') as server_port",
    );
    expect(harnessSource).toContain(
      "pg_catalog.host(pg_catalog.inet_server_addr()) as server_addr",
    );
    expect(harnessSource).not.toContain(
      "pg_catalog.inet_server_port() as server_port",
    );
    const target = validateCommunicationNotePointsAdmissionDatabaseUrl(
      DATABASE_URL,
    );
    expect(
      assertCommunicationNotePointsAdmissionPreflight(
        {
          server_addr: null,
          server_port: "55432",
          database_name: "postgres",
          session_user_name: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
          current_user_name: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
          server_version_num: "160015",
          backend_pid: 101,
          ssl_in_use: false,
          concurrency_marker: COMMUNICATION_NOTE_POINTS_ADMISSION_MARKER,
        },
        target,
      ),
    ).toMatchObject({
      backendPid: 101,
      port: 55432,
      transport: "unix-domain-socket",
    });
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionPreflight(
          {
            server_addr: "127.0.0.1",
            server_port: "55432",
            database_name: "postgres",
            session_user_name: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
            current_user_name: COMMUNICATION_NOTE_POINTS_ADMISSION_RUNNER_ROLE,
            server_version_num: "160015",
            backend_pid: 101,
            ssl_in_use: false,
            concurrency_marker: COMMUNICATION_NOTE_POINTS_ADMISSION_MARKER,
          },
          target,
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.preflightFailed,
    );
  });

  it("requires distinct PIDs and one exact ungranted advisory blocker", () => {
    expect(
      assertCommunicationNotePointsAdmissionDistinctBackends(101, 202, 303),
    ).toEqual([101, 202, 303]);
    expect(
      assertCommunicationNotePointsAdmissionBlockerRows(
        [
          {
            waiting_pid: 202,
            blocker_pid: 101,
            locktype: "advisory",
            granted: false,
          },
        ],
        202,
        101,
      ),
    ).toEqual({
      waitingPid: 202,
      blockerPid: 101,
      locktype: "advisory",
      granted: false,
    });
    expectPolicyCode(
      () => assertCommunicationNotePointsAdmissionDistinctBackends(101, 101),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES
        .backendIdentityFailed,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionBlockerRows([], 202, 101),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.blockerFailed,
    );
  });

  it("locks setup and cleanup to exact, least-privilege synthetic fixtures", async () => {
    const [setupSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);
    expect(
      assertCommunicationNotePointsAdmissionSqlPolicy(setupSql, cleanupSql),
    ).toEqual({
      ok: true,
      localPg16Only: true,
      passwordlessSocketOnly: true,
      explicitBootstrapSuperuser: true,
      migrationActorRemainsNonSuperuser: true,
      transactionalSetupAndCleanup: true,
      exactRunnerRpcGrant: true,
      directTableGrantsDenied: true,
      exactImmutableTriggerCleanup: true,
      exactJobMarkerTriggerCleanup: true,
      scopedSyntheticJobUnbind: true,
      exactJobPayloadConstraintRestored: true,
      syntheticOnlyCleanup: true,
      truncateDenied: true,
    });
    expect(setupSql).toContain("@example.invalid");
    expect(setupSql).toContain("assert_generic_terminal_quarantine");
    expect(setupSql).toContain("public.commit_shadow_points");
    expect(setupSql).toContain("public.release_shadow_points");
    expect(setupSql).toContain(
      "set careslink.communication_admission_concurrency_bootstrap_role from current",
    );
    expect(setupSql).toMatch(/\bpassword null\s+connection limit 3\b/i);
    expect(setupSql).toMatch(
      /insert into communication_admission_policy_values\s*\(\s*note_type,\s*service_code,\s*provider_digest\s*\)/i,
    );
    const truncateStatement =
      /\btruncate\s+(?:table\s+)?(?:only\s+)?[a-z_"]/i;
    expect(setupSql).not.toMatch(truncateStatement);
    expect(cleanupSql).not.toMatch(truncateStatement);
    expect(setupSql).not.toMatch(/\b(?:supabase\.co|pooler\.supabase\.com)\b/i);
    expect(cleanupSql).not.toMatch(/\b(?:supabase\.co|pooler\.supabase\.com)\b/i);
    expect(setupSql).not.toMatch(/\bpostgres(?:ql)?:\/\//i);
    expect(cleanupSql).not.toMatch(/\bpostgres(?:ql)?:\/\//i);
    expect(cleanupSql).toMatch(
      /update careslink_v1_generation\.jobs\s+set communication_note_point_admission_id = null\s+where owner_user_id in \(/i,
    );
    expect(cleanupSql).toMatch(
      /drop constraint jobs_payload_owner_fk;[\s\S]*add constraint jobs_payload_owner_fk/i,
    );

    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql.replace("nobypassrls", "bypassrls"),
          cleanupSql,
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql,
          cleanupSql.replace(
            "on delete restrict\n  deferrable initially deferred;",
            "on delete cascade\n  deferrable initially deferred;",
          ),
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql,
          cleanupSql.replace(
            "where owner_user_id in (\n  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,",
            "where true or owner_user_id in (\n  'da100000-0000-4000-8000-000000000001'::pg_catalog.uuid,",
          ),
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql.replace(
            "migration_actor.rolsuper is false",
            "migration_actor.rolsuper is true",
          ),
          cleanupSql,
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql.replace(
            "set careslink.communication_admission_concurrency_bootstrap_role from current",
            "set careslink.communication_admission_concurrency_bootstrap_role to '__wrong__'",
          ),
          cleanupSql,
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql.replace("password null", "password 'forbidden'"),
          cleanupSql,
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql,
          cleanupSql.replace("begin;", "begin;\ntruncate auth.users;"),
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql,
          cleanupSql.replace(
            "delete from auth.users as synthetic_user\nwhere (synthetic_user.id, synthetic_user.email) in (",
            "delete from auth.users;\nselect 1\nwhere true;\n-- (",
          ),
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsAdmissionSqlPolicy(
          setupSql.replace(
            "-- TEST_ONLY setup",
            "-- forbidden.example.supabase.co\n-- TEST_ONLY setup",
          ),
          cleanupSql,
        ),
      COMMUNICATION_NOTE_POINTS_ADMISSION_POLICY_ERROR_CODES.sqlPolicyInvalid,
    );
  });
});

describe("Communication Note Points admission concurrency harness", () => {
  it("strictly validates admission envelopes and exact aggregate state", () => {
    const jobId = "da150000-0000-4000-8000-000000000001";
    expect(
      assertCommunicationNotePointsAdmissionEnvelope(
        admission(true, jobId),
        { created: true, jobId },
      ),
    ).toMatchObject({ created: true, pointsReserved: true });
    expect(
      assertCommunicationNotePointsAdmissionEnvelope(
        admission(false, jobId),
        { created: false, jobId },
      ),
    ).toMatchObject({
      created: false,
      payloadAccepted: true,
      pointsReserved: true,
    });
    expect(
      assertCommunicationNotePointsAdmissionCommittedState(
        state("same-key", jobId),
        jobId,
      ),
    ).toMatchObject({ reserveDelta: -20, lotRemaining: 10 });
    expect(
      assertCommunicationNotePointsAdmissionZeroState(
        state("expiry-session"),
        "expiry-session",
      ),
    ).toMatchObject({ reserveLedgerCount: 0, lotRemaining: 30 });
    expect(
      assertCommunicationNotePointsAdmissionTerminalQuarantine({
        commitDenied: true,
        releaseDenied: true,
        reservationStatus: "RESERVED",
        terminalLedgerCount: 0,
        reserveLedgerCount: 1,
        lotRemaining: 10,
      }),
    ).toMatchObject({ commitDenied: true, releaseDenied: true });

    expect(() =>
      assertCommunicationNotePointsAdmissionEnvelope(
        { ...admission(true, jobId), rawPayload: "forbidden" },
        { created: true, jobId },
      ),
    ).toThrow(CommunicationNotePointsAdmissionConcurrencyHarnessError);
    expect(() =>
      assertCommunicationNotePointsAdmissionEnvelope(
        { ...admission(false, jobId), payloadAccepted: false },
        { created: false, jobId },
      ),
    ).toThrow(CommunicationNotePointsAdmissionConcurrencyHarnessError);
    expect(() =>
      assertCommunicationNotePointsAdmissionCommittedState(
        { ...state("same-key", jobId), reserveLedgerCount: 2 },
        jobId,
      ),
    ).toThrow(CommunicationNotePointsAdmissionConcurrencyHarnessError);
  });

  it("never accepts a password callback path", () => {
    expect(() => denyCommunicationNotePointsAdmissionPasswordAuthentication())
      .toThrowError(
        "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CONNECTION_FAILED",
      );
  });

  it("hard-destroys a client whose graceful close exceeds its deadline", async () => {
    const stream = {
      destroyed: false,
      destroy: vi.fn(function destroy() {
        this.destroyed = true;
      }),
    };
    const client = {
      connection: { stream },
      query: vi.fn(async () => ({ rows: [] })),
      end: vi.fn(() => new Promise(() => undefined)),
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const closing =
        COMMUNICATION_NOTE_POINTS_ADMISSION_TEST_ONLY.closeConnections(
          [{ client, assertHealthy() {} }],
          null,
        );
      const denied = expect(closing).rejects.toThrowError(
        "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CLOSE_FAILED",
      );
      await vi.waitFor(() => expect(client.end).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(
        COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.connectionMs + 1,
      );
      await denied;
      expect(client.query).toHaveBeenCalledWith("rollback", []);
      expect(stream.destroy).toHaveBeenCalledTimes(1);
      expect(stream.destroyed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("clears the close deadline after a graceful rollback and close", async () => {
    const stream = {
      destroyed: false,
      destroy: vi.fn(function destroy() {
        this.destroyed = true;
      }),
    };
    const client = {
      connection: { stream },
      query: vi.fn(async () => ({ rows: [] })),
      end: vi.fn(async () => undefined),
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await expect(
        COMMUNICATION_NOTE_POINTS_ADMISSION_TEST_ONLY.closeConnections(
          [{ client, assertHealthy() {} }],
          null,
        ),
      ).resolves.toBeUndefined();
      expect(client.query).toHaveBeenCalledWith("rollback", []);
      expect(client.end).toHaveBeenCalledTimes(1);
      expect(stream.destroy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("hard-destroys a client whose rollback exceeds its deadline", async () => {
    const stream = {
      destroyed: false,
      destroy: vi.fn(function destroy() {
        this.destroyed = true;
      }),
    };
    const client = {
      connection: { stream },
      query: vi.fn(() => new Promise(() => undefined)),
      end: vi.fn(async () => undefined),
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const closing =
        COMMUNICATION_NOTE_POINTS_ADMISSION_TEST_ONLY.closeConnections(
          [{ client, assertHealthy() {} }],
          null,
        );
      const denied = expect(closing).rejects.toThrowError(
        "COMMUNICATION_NOTE_POINTS_ADMISSION_CONCURRENCY_CLOSE_FAILED",
      );
      await vi.waitFor(() => expect(client.query).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(
        COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES.rollbackMs + 1,
      );
      await denied;
      expect(client.query).toHaveBeenCalledWith("rollback", []);
      expect(client.end).not.toHaveBeenCalled();
      expect(stream.destroy).toHaveBeenCalledTimes(1);
      expect(stream.destroyed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("runs the full two-client matrix with fake clients and observed barriers", async () => {
    FakeClient.reset();
    const clock = () => Date.parse("2026-09-02T01:02:03.000Z");
    const result = await runCommunicationNotePointsAdmissionConcurrencyHarness({
      env: {
        [COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_URL_ENV]: DATABASE_URL,
      },
      Client: FakeClient,
      sleep: async () => {},
      clock,
    });

    expect(result).toMatchObject({
      ok: true,
      postgresMajor: 16,
      transport: "unix-domain-socket",
      passwordMaterial: "absent",
      scenarios: {
        sameKey: {
          createdCount: 1,
          replayCount: 2,
          pointsReserved: 20,
          backendPids: { contenderA: 100, contenderB: 101, observer: 102 },
          barrier: { locktype: "advisory", granted: false },
          terminalQuarantine: {
            commitDenied: true,
            releaseDenied: true,
            reservationStatus: "RESERVED",
            terminalLedgerCount: 0,
          },
        },
        differentKey: {
          committedCount: 1,
          insufficientCount: 1,
          backendPids: { contenderA: 103, contenderB: 104, observer: 105 },
          barrier: { locktype: "advisory", granted: false },
        },
        expiry: [
          {
            scenario: "expiry-session",
            backendPids: { contenderA: 106, contenderB: 107, observer: 108 },
            expectedCode: "SESSION_REVOKED",
            rolledBack: true,
          },
          {
            scenario: "expiry-privacy",
            backendPids: { contenderA: 109, contenderB: 110, observer: 111 },
            expectedCode: "PRIVACY_REVIEW_STALE",
            rolledBack: true,
          },
          {
            scenario: "expiry-payload",
            backendPids: { contenderA: 112, contenderB: 113, observer: 114 },
            expectedCode: "PRIVACY_REVIEW_STALE",
            rolledBack: true,
          },
        ],
      },
    });
    expect(FakeClient.admissionCalls).toHaveLength(8);
    expect(
      FakeClient.transactionCommands.filter(({ command }) => command === "begin"),
    ).toEqual([
      { command: "begin", scenario: "same-key", label: "a" },
      { command: "begin", scenario: "same-key", label: "b" },
      { command: "begin", scenario: "different-key", label: "a" },
      { command: "begin", scenario: "different-key", label: "b" },
      { command: "begin", scenario: "expiry-session", label: "a" },
      { command: "begin", scenario: "expiry-session", label: "b" },
      { command: "begin", scenario: "expiry-privacy", label: "a" },
      { command: "begin", scenario: "expiry-privacy", label: "b" },
      { command: "begin", scenario: "expiry-payload", label: "a" },
      { command: "begin", scenario: "expiry-payload", label: "b" },
    ]);
    expect(
      FakeClient.transactionCommands.filter(({ command }) => command === "commit"),
    ).toEqual([
      { command: "commit", scenario: "same-key", label: "a" },
      { command: "commit", scenario: "same-key", label: "b" },
      { command: "commit", scenario: "different-key", label: "a" },
      { command: "commit", scenario: "expiry-session", label: "a" },
      { command: "commit", scenario: "expiry-privacy", label: "a" },
      { command: "commit", scenario: "expiry-payload", label: "a" },
    ]);
    expect(
      FakeClient.admissionCalls.every((call) => call.values.length === 14),
    ).toBe(true);
    expect(
      FakeClient.admissionCalls.every(
        (call) =>
          call.values[2] === "BEARER" &&
          call.values[6] === "en" &&
          call.values[7] === "1.0.0-shadow.1" &&
          call.values[8] === "2026-08-09.v1-shadow",
      ),
    ).toBe(true);
    expect(FakeClient.rollbackCount).toBe(15);
    expect(FakeClient.endCount).toBe(15);
    expect(FakeClient.hardDestroyCount).toBe(0);
    const openedClients = [...FakeClient.byScenario.values()].flatMap(
      (connections) => Object.values(connections),
    );
    expect(openedClients).toHaveLength(15);
    expect(
      openedClients.every(
        (client) =>
          client.options.connectionTimeoutMillis === 5_000 &&
          client.options.query_timeout === 30_000 &&
          client.options.ssl === false &&
          client.options.password ===
            denyCommunicationNotePointsAdmissionPasswordAuthentication,
      ),
    ).toBe(true);
    expect(FakeClient.helperCalls).toEqual([
      { helper: "terminal-quarantine", scenario: "same-key", label: "observer" },
      { helper: "fixture-state", scenario: "same-key", label: "observer" },
      { helper: "fixture-state", scenario: "different-key", label: "observer" },
      { helper: "arm-expiry", scenario: "expiry-session", label: "observer" },
      { helper: "hold-points-lock", scenario: "expiry-session", label: "a" },
      { helper: "fixture-state", scenario: "expiry-session", label: "observer" },
      { helper: "arm-expiry", scenario: "expiry-privacy", label: "observer" },
      { helper: "hold-points-lock", scenario: "expiry-privacy", label: "a" },
      { helper: "fixture-state", scenario: "expiry-privacy", label: "observer" },
      { helper: "arm-expiry", scenario: "expiry-payload", label: "observer" },
      { helper: "hold-points-lock", scenario: "expiry-payload", label: "a" },
      { helper: "fixture-state", scenario: "expiry-payload", label: "observer" },
    ]);
    expect(COMMUNICATION_NOTE_POINTS_ADMISSION_DEADLINES).toMatchObject({
      connectionMs: 5_000,
      queryMs: 30_000,
      statementMs: 25_000,
      idleTransactionMs: 30_000,
      rollbackMs: 5_000,
    });
  });

  it("rolls back a waiter that finishes after a barrier failure releases the blocker", async () => {
    BarrierFailureClient.reset();
    vi.useFakeTimers();
    try {
      await expect(
        runCommunicationNotePointsAdmissionConcurrencyHarness({
          env: {
            [COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_URL_ENV]: DATABASE_URL,
          },
          Client: BarrierFailureClient,
          sleep: async () => {},
          clock: () => Date.parse("2026-09-02T01:02:03.000Z"),
        }),
      ).rejects.toThrow("BARRIER_TEST_FAILURE");

      expect(BarrierFailureClient.admissionFinishedAfterRelease).toBe(true);
      expect(BarrierFailureClient.contenderBRolledBackAfterAdmission).toBe(true);
      expect(BarrierFailureClient.committedAdmissionCount).toBe(0);
      expect(
        [...BarrierFailureClient.clients.values()].every(
          (client) => !client.transactionOpen && !client.stagedAdmission,
        ),
      ).toBe(true);
      expect(
        BarrierFailureClient.events.indexOf("b:admission-finished"),
      ).toBeLessThan(BarrierFailureClient.events.indexOf("b:rollback"));
      expect(BarrierFailureClient.events).not.toContain("b:commit");
      expect(BarrierFailureClient.endCount).toBe(3);
      expect(BarrierFailureClient.hardDestroyCount).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
