import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  NoteWorkerRpcConcurrencyHarnessError,
  assertClaimRaceEnvelope,
  assertDeniedEnvelope,
  assertDistinctBackendPids,
  assertNoteWorkerRpcConcurrencySqlPolicy,
  assertPlaintextConnection,
  assertVerifiedTlsConnection,
  observeClientConnectionErrors,
  parseNoteWorkerRpcConcurrencyArguments,
} from "./note-worker-rpc-concurrency.mjs";

const SETUP_URL = new URL(
  "./note-worker-rpc-concurrency-setup.sql",
  import.meta.url,
);
const CLEANUP_URL = new URL(
  "./note-worker-rpc-concurrency-cleanup.sql",
  import.meta.url,
);
const POOLER_QUIESCE_URL = new URL(
  "./note-worker-rpc-concurrency-pooler-quiesce.sql",
  import.meta.url,
);
const POOLER_DRAIN_URL = new URL(
  "./note-worker-rpc-concurrency-pooler-drain.sql",
  import.meta.url,
);
const HARNESS_URL = new URL(
  "./note-worker-rpc-concurrency.mjs",
  import.meta.url,
);

function expectHarnessCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(NoteWorkerRpcConcurrencyHarnessError);
    expect(error).toMatchObject({ code, message: code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

function validClaim() {
  return {
    status: "CLAIMED",
    claim: {
      job: { status: "RUNNING" },
      attempt: {
        attemptId: "11111111-1111-4111-8111-111111111111",
        ordinal: 1,
        status: "RUNNING",
      },
      leaseToken: "test-only-secret-not-evidence",
    },
  };
}

function validDenied(reason) {
  return {
    status: "DENIED_SETTLED",
    reason,
    transactionStatus: "COMMITTED",
    atomic: true,
    jobStatus: "FAILED",
    attemptStatus: "FAILED",
    payloadState: "REVOKED",
    payloadDisposition: "REVOKED_PURGE_ENQUEUED",
  };
}

describe("Note worker RPC concurrency harness policy", () => {
  it("keeps the hosted CLI contract and adds one explicit PG16-only local shape", () => {
    expect(
      parseNoteWorkerRpcConcurrencyArguments([
        "--expected-branch-ref=abcdefghijklmnopqrst",
        "--expected-pg-major=17",
      ]),
    ).toEqual({
      targetMode: "preview",
      expectedBranchRef: "abcdefghijklmnopqrst",
      expectedPgMajor: 17,
    });
    expect(
      parseNoteWorkerRpcConcurrencyArguments([
        "--target-mode=local-pg16",
        "--expected-pg-major=16",
      ]),
    ).toEqual({
      targetMode: "local-pg16",
      expectedBranchRef: null,
      expectedPgMajor: 16,
    });

    for (const invalid of [
      ["--target-mode=local-pg16", "--expected-pg-major=17"],
      ["--target-mode=preview", "--expected-pg-major=16"],
      [
        "--target-mode=local-pg16",
        "--expected-pg-major=16",
        "--expected-branch-ref=abcdefghijklmnopqrst",
      ],
      ["--target-mode=local-pg16"],
    ]) {
      expectHarnessCode(
        () => parseNoteWorkerRpcConcurrencyArguments(invalid),
        "NOTE_WORKER_RPC_CONCURRENCY_ARGUMENT_INVALID",
      );
    }
  });

  it("locks Management-plane setup and cleanup around the fixed helper boundary", async () => {
    const [setupSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);

    expect(assertNoteWorkerRpcConcurrencySqlPolicy(setupSql, cleanupSql)).toEqual(
      {
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
      },
    );
    expect(setupSql).not.toMatch(/\btruncate\b/i);
    expect(cleanupSql).not.toMatch(/\btruncate\b/i);
    expect(setupSql).not.toMatch(
      /\bpg_catalog\.(?:boolean|bigint|integer)\b/i,
    );
    expect(setupSql.match(/\breturns\s+pg_catalog\.bool\b/gi)).toHaveLength(4);
    expect(setupSql).toContain("'maxQueueAgeMs', 1800000");
    expect(setupSql).toMatch(
      /values\s*\(\s*'worker\.concurrency\.20260823\.v1'[\s\S]{0,300}?\b1800000\b/i,
    );
    expect(setupSql).toContain(
      "careslink_v1_generation_concurrency_test_support",
    );
    expect(cleanupSql).toContain(
      "careslink_v1_generation_concurrency_test_support",
    );
  });

  it("rejects cleanup SQL that loses its postcheck or adds TRUNCATE", async () => {
    const [setupSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);

    expectHarnessCode(
      () =>
        assertNoteWorkerRpcConcurrencySqlPolicy(
          setupSql,
          cleanupSql.replace(
            "CONCURRENCY_CLEANUP_POSTCHECK_FAILED",
            "POSTCHECK_REMOVED",
          ),
        ),
      "NOTE_WORKER_RPC_CONCURRENCY_SQL_POLICY_INVALID",
    );
    expectHarnessCode(
      () =>
        assertNoteWorkerRpcConcurrencySqlPolicy(
          setupSql,
          cleanupSql.replace("begin;", "begin;\ntruncate auth.users;"),
        ),
      "NOTE_WORKER_RPC_CONCURRENCY_SQL_POLICY_INVALID",
    );
    expectHarnessCode(
      () =>
        assertNoteWorkerRpcConcurrencySqlPolicy(
          setupSql.replace(
            "fixture_catalog",
            "fixture_catalog_removed",
          ),
          cleanupSql,
        ),
      "NOTE_WORKER_RPC_CONCURRENCY_SQL_POLICY_INVALID",
    );
  });

  it("locks the committed NOLOGIN then exact idle Supavisor drain sequence", async () => {
    const [quiesceSql, drainSql, cleanupSql] = await Promise.all([
      readFile(POOLER_QUIESCE_URL, "utf8"),
      readFile(POOLER_DRAIN_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);

    expect(quiesceSql).toContain(
      "alter role careslink_v1_generation_concurrency_runner nologin;",
    );
    expect(quiesceSql).toContain(
      "CONCURRENCY_POOLER_QUIESCE_POSTCHECK_FAILED",
    );
    expect(quiesceSql).toContain("activity.application_name <> 'Supavisor'");
    expect(quiesceSql).toContain("activity.state <> 'idle'");
    expect(drainSql).toContain("role_record.rolcanlogin is false");
    expect(drainSql).toContain("pg_catalog.pg_terminate_backend");
    expect(drainSql).toContain("activity.application_name = 'Supavisor'");
    expect(drainSql).toContain("activity.state = 'idle'");
    expect(drainSql).toContain("CONCURRENCY_POOLER_DRAIN_POSTCHECK_FAILED");
    expect(cleanupSql).toContain("role_record.rolcanlogin is false");
    for (const sql of [quiesceSql, drainSql]) {
      expect(sql).not.toMatch(/\btruncate\b/i);
      expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into|from)?\s*(?:auth|public|careslink_v1_generation)\./i);
    }
  });

  it("rejects weakened helper runtime, volatility and executor CREATE posture", async () => {
    const [setupSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);
    const withoutRaceApplication = setupSql.replaceAll(
      "careslink-worker-rpc-race-a",
      "unauthorized-test-client",
    );
    const withoutStateVolatility = setupSql.replace(
      /(fixture_state_claim\s*\(\s*\)[\s\S]{0,500}?)\bvolatile\b/i,
      "$1stable",
    );
    const withoutExecutorCreateRevoke = setupSql.replace(
      /\brevoke\s+(?:usage\s*,\s*)?create(?:\s*,\s*usage)?\s+on\s+schema\s+careslink_v1_generation_concurrency_test_support\s+from\s+careslink_v1_generation_executor\b/i,
      "revoke usage on schema careslink_v1_generation_concurrency_test_support from careslink_v1_generation_executor",
    );

    expect(withoutRaceApplication).not.toBe(setupSql);
    expect(withoutStateVolatility).not.toBe(setupSql);
    expect(withoutExecutorCreateRevoke).not.toBe(setupSql);
    for (const weakenedSetup of [
      withoutRaceApplication,
      withoutStateVolatility,
      withoutExecutorCreateRevoke,
    ]) {
      expectHarnessCode(
        () =>
          assertNoteWorkerRpcConcurrencySqlPolicy(
            weakenedSetup,
            cleanupSql,
          ),
        "NOTE_WORKER_RPC_CONCURRENCY_SQL_POLICY_INVALID",
      );
    }
  });

  it("requires two distinct positive backend PIDs", () => {
    expect(assertDistinctBackendPids(101, 202)).toEqual({
      left: 101,
      right: 202,
    });
    expectHarnessCode(
      () => assertDistinctBackendPids(101, 101),
      "NOTE_WORKER_RPC_CONCURRENCY_BACKEND_IDENTITY_FAILED",
    );
    expectHarnessCode(
      () => assertDistinctBackendPids("not-a-pid", 202),
      "NOTE_WORKER_RPC_CONCURRENCY_BACKEND_IDENTITY_FAILED",
    );
  });

  it("requires a TLS socket with successful certificate authorization", () => {
    expect(
      assertVerifiedTlsConnection({
        connection: {
          stream: {
            encrypted: true,
            authorized: true,
            authorizationError: null,
          },
        },
      }),
    ).toEqual({ encrypted: true, authorized: true });
    for (const stream of [
      { encrypted: false, authorized: true, authorizationError: null },
      { encrypted: true, authorized: false, authorizationError: "DENIED" },
    ]) {
      expectHarnessCode(
        () => assertVerifiedTlsConnection({ connection: { stream } }),
        "NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED",
      );
    }
  });

  it("checks plaintext separately from the SQL-verified loopback boundary", () => {
    expect(
      assertPlaintextConnection({
        connection: { stream: { encrypted: undefined } },
      }),
    ).toEqual({ encrypted: false });
    for (const client of [
      null,
      { connection: {} },
      { connection: { stream: { encrypted: true } } },
    ]) {
      expectHarnessCode(
        () => assertPlaintextConnection(client),
        "NOTE_WORKER_RPC_CONCURRENCY_PREFLIGHT_FAILED",
      );
    }
  });

  it("converts asynchronous client errors to a fixed code without retaining details", () => {
    const client = new EventEmitter();
    const observer = observeClientConnectionErrors(client);
    const sentinel = "driver-and-server-detail-must-not-escape";

    expect(() => client.emit("error", new Error(sentinel))).not.toThrow();
    expectHarnessCode(
      () => observer.assertNone(),
      "NOTE_WORKER_RPC_CONCURRENCY_CONNECTION_FAILED",
    );
    expect(JSON.stringify(observer)).not.toContain(sentinel);
  });

  it("accepts only CLAIMED-versus-IDLE arbitration without payload leakage", () => {
    expect(
      assertClaimRaceEnvelope(validClaim(), { status: "IDLE", claim: null }),
    ).toMatchObject({ attempt: { ordinal: 1 }, leaseToken: expect.any(String) });

    expectHarnessCode(
      () =>
        assertClaimRaceEnvelope(validClaim(), {
          status: "CLAIMED",
          claim: validClaim().claim,
        }),
      "NOTE_WORKER_RPC_CONCURRENCY_CLAIM_FAILED",
    );
    expectHarnessCode(
      () =>
        assertClaimRaceEnvelope(
          {
            ...validClaim(),
            claim: { ...validClaim().claim, vaultLocator: "forbidden" },
          },
          { status: "IDLE", claim: null },
        ),
      "NOTE_WORKER_RPC_CONCURRENCY_CLAIM_FAILED",
    );
  });

  it("locks the two fail-closed authority envelopes", () => {
    expect(() =>
      assertDeniedEnvelope(
        validDenied("SESSION_REVOKED"),
        "SESSION_REVOKED",
        "NOTE_WORKER_RPC_CONCURRENCY_SESSION_RACE_FAILED",
      ),
    ).not.toThrow();
    expect(() =>
      assertDeniedEnvelope(
        validDenied("PRIVACY_REVIEW_STALE"),
        "PRIVACY_REVIEW_STALE",
        "NOTE_WORKER_RPC_CONCURRENCY_PRIVACY_RACE_FAILED",
      ),
    ).not.toThrow();
    expectHarnessCode(
      () =>
        assertDeniedEnvelope(
          { ...validDenied("SESSION_REVOKED"), vaultGrant: "forbidden" },
          "SESSION_REVOKED",
          "NOTE_WORKER_RPC_CONCURRENCY_SESSION_RACE_FAILED",
        ),
      "NOTE_WORKER_RPC_CONCURRENCY_SESSION_RACE_FAILED",
    );
  });

  it("loads pg only after the offline and target gates and creates two least-privilege clients", async () => {
    const source = await readFile(HARNESS_URL, "utf8");
    const offlineGate = source.lastIndexOf(
      "assertNoteWorkerRpcConcurrencyPolicyRegression();",
    );
    const targetGate = source.lastIndexOf("parsePreviewDatabaseTarget(");
    const localTargetGate = source.lastIndexOf(
      "parseLocalPg16LoopbackDatabaseTarget(",
    );
    const driverLoad = source.lastIndexOf('import("pg")');

    expect(offlineGate).toBeGreaterThan(0);
    expect(targetGate).toBeGreaterThan(offlineGate);
    expect(localTargetGate).toBeGreaterThan(offlineGate);
    expect(driverLoad).toBeGreaterThan(targetGate);
    expect(driverLoad).toBeGreaterThan(localTargetGate);
    expect(source.match(/new Client\(/g)).toHaveLength(2);
    expect(source.match(/observeClientConnectionErrors\(client[AB]\)/g)).toHaveLength(
      2,
    );
    expect(source).toContain('process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"');
    expect(source).toContain("/^PG[A-Z0-9_]*$/.test(key)");
    expect(source.match(/rejectUnauthorized: true/g)).toHaveLength(1);
    expect(source).toContain("stream?.encrypted !== true");
    expect(source).toContain("stream?.authorized !== true");
    expect(source).toContain("stream?.authorizationError != null");
    expect(source).toContain('options: "-c row_security=on"');
    expect(source).toContain('sslnegotiation: "postgres"');
    expect(source).toContain(
      "select set_config('application_name', $1, false)",
    );
    expect(source).toContain(
      'identityA.application_name === "careslink-worker-rpc-race-a"',
    );
    expect(source).toContain(
      'identityB.application_name === "careslink-worker-rpc-race-b"',
    );
    expect(source).not.toMatch(/\bfrom\s+pg_roles\s+as\s+current_role\b/i);
    expect(source).toContain("identity.replication_role === \"origin\"");
    expect(source).toContain("identity.row_security === \"on\"");
    expect(source).toContain("identity.rolbypassrls === false");
    expect(source).toContain("identity.rolconnlimit === 2");
    expect(source).toContain("identity.owner_membership === false");
    expect(source).toContain("identity.executor_membership === false");
    expect(source).toContain("identity.sensitive_table_privileges_absent === true");
    expect(source).not.toContain("OWNER_ROLE");
    expect(source).not.toContain("EXECUTOR_ROLE");
    expect(source).not.toContain(
      'options: "-c session_replication_role=origin',
    );
    expect(source).not.toContain("connectionString:");
    expect(source).toContain(
      '"CARESLINK_V1_WORKER_RPC_PREVIEW_DATABASE_URL"',
    );
    expect(source).toContain(
      '"CARESLINK_V1_WORKER_RPC_LOCAL_PG16_DATABASE_URL"',
    );
    expect(source).toContain('password: async () => ""');
    expect(source).toContain("ssl: false");
    expect(source).toContain('identity.server_address === "127.0.0.1"');
    expect(source).toContain('identity.client_address === "127.0.0.1"');
    expect(source).toContain('identity.listen_addresses === "127.0.0.1"');
    expect(source).not.toMatch(/process\.env\.(DATABASE_URL|DIRECT_URL|POSTGRES_URL)/);
    expect(source).not.toMatch(/process\.env\.(PGHOST|PGPASSWORD|SUPABASE_DB_PASSWORD)/);
  });

  it("calls only fixed helpers for fixture mutation and inspection while preserving real RPC races", async () => {
    const source = await readFile(HARNESS_URL, "utf8");
    for (const helper of [
      "fixture_catalog",
      "activate_session_fixture",
      "activate_privacy_fixture",
      "delete_session_fixture",
      "revoke_privacy_fixture",
      "fixture_state_claim",
      "fixture_state_session",
      "fixture_state_privacy",
    ]) {
      expect(source).toContain(
        `careslink_v1_generation_concurrency_test_support.${helper}()`,
      );
    }
    for (const rpc of [
      "claim_v1_shadow_note_generation_job",
      "authorize_v1_shadow_note_generation_payload_attempt",
      "consume_v1_shadow_note_generation_payload_grant",
    ]) {
      expect(source).toContain(`careslink_v1_generation.${rpc}(`);
    }

    expect(source).toContain("pg_blocking_pids");
    expect(source).toMatch(
      /authorizationOutcomePromise\s*=\s*authorize\([\s\S]{0,300}\)\.then\(/,
    );
    expect(source).toMatch(
      /revocationOutcomePromise\s*=\s*requireTestHelperSuccess\([\s\S]{0,300}\)\.then\(/,
    );
    expect(source).not.toMatch(/\bset\s+(?:local\s+)?role\b/i);
    expect(source).not.toMatch(/\balter\s+table\b/i);
    expect(source).not.toMatch(/\bdelete\s+from\s+auth\./i);
    expect(source).not.toMatch(/\bupdate\s+public\.privacy_reviews\b/i);
    expect(source).not.toMatch(/\bfrom\s+careslink_v1_generation\.(?:jobs|attempts|payloads|payload_grants|provider_evidence|payload_purge_outbox)\b/i);
    expect(source).not.toMatch(/\.query\(setupSql\)/);
    expect(source).not.toMatch(/\.query\(cleanupSql\)/);
    expect(source).toContain("fixtureCleanupRequired: true");
    expect(source).not.toContain("fixtureCleanupComplete");
  });

  it("uses only fixed failure evidence", () => {
    const secret = "postgresql://postgres:never-print-me@example.invalid";
    const error = new NoteWorkerRpcConcurrencyHarnessError(secret);
    expect(error.code).toBe("NOTE_WORKER_RPC_CONCURRENCY_INTERNAL_FAILED");
    expect(error.message).not.toContain(secret);
    expect(String(error)).not.toContain(secret);
  });
});
