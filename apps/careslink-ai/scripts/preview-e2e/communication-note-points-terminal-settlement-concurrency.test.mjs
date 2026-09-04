import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DATABASE_URL_ENV,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA,
  CommunicationNotePointsTerminalSettlementConcurrencyPolicyError,
  assertCommunicationNotePointsTerminalSettlementBlockerRows,
  assertCommunicationNotePointsTerminalSettlementDistinctBackends,
  assertCommunicationNotePointsTerminalSettlementPreflight,
  assertCommunicationNotePointsTerminalSettlementSqlPolicy,
  readCommunicationNotePointsTerminalSettlementEnvironment,
  validateCommunicationNotePointsTerminalSettlementDatabaseUrl,
} from "./communication-note-points-terminal-settlement-concurrency-policy.mjs";
import {
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS,
  COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_TEST_ONLY,
  CommunicationNotePointsTerminalSettlementConcurrencyError,
  denyCommunicationNotePointsTerminalSettlementPasswordAuthentication,
  mergeCommunicationNotePointsTerminalSettlementLifecycleFailure,
  runCommunicationNotePointsTerminalSettlementLocalPg16,
} from "./communication-note-points-terminal-settlement-concurrency.mjs";

const SOCKET_DIRECTORY =
  "/private/tmp/careslink-points-terminal-pg16.ABC123/socket";
const DATABASE_URL =
  `postgresql://${COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE}` +
  `@localhost:55432/postgres?host=${encodeURIComponent(SOCKET_DIRECTORY)}`;
const SETUP_SQL = readFileSync(
  new URL(
    "./communication-note-points-terminal-settlement-concurrency-setup.sql",
    import.meta.url,
  ),
  "utf8",
);
const CLEANUP_SQL = readFileSync(
  new URL(
    "./communication-note-points-terminal-settlement-concurrency-cleanup.sql",
    import.meta.url,
  ),
  "utf8",
);
const HARNESS_SOURCE = readFileSync(
  new URL(
    "./communication-note-points-terminal-settlement-concurrency.mjs",
    import.meta.url,
  ),
  "utf8",
);

function expectPolicyCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(
      CommunicationNotePointsTerminalSettlementConcurrencyPolicyError,
    );
    expect(error).toMatchObject({ code, message: code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("Communication Note Points terminal settlement local policy", () => {
  it("accepts only the canonical passwordless private Unix-socket URL", () => {
    expect(
      validateCommunicationNotePointsTerminalSettlementDatabaseUrl(
        DATABASE_URL,
      ),
    ).toEqual({
      ok: true,
      policyVersion: COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
      transport: "unix-domain-socket",
      socketDirectory: SOCKET_DIRECTORY,
      port: 55432,
      database: "postgres",
      databaseRole:
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
      postgresMajor: 16,
      sslMode: "disabled",
      passwordMaterial: "absent",
      hostedTarget: false,
    });
  });

  it.each([
    [
      DATABASE_URL.replace("localhost", "127.0.0.1"),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .targetDenied,
    ],
    [
      DATABASE_URL.replace("55432", "5432"),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .portDenied,
    ],
    [
      DATABASE_URL.replace(
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
        "postgres",
      ),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .roleDenied,
    ],
    [
      DATABASE_URL.replace("@localhost", ":secret@localhost"),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .credentialsDenied,
    ],
    [
      `${DATABASE_URL}&sslmode=disable`,
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .queryDenied,
    ],
    [
      DATABASE_URL.replace("/postgres?", "/template1?"),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .databaseDenied,
    ],
  ])("rejects non-canonical database target %#", (value, code) => {
    expectPolicyCode(
      () =>
        validateCommunicationNotePointsTerminalSettlementDatabaseUrl(value),
      code,
    );
  });

  it("rejects ambient PostgreSQL and hosted credential variables", () => {
    expectPolicyCode(
      () =>
        readCommunicationNotePointsTerminalSettlementEnvironment({
          [COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DATABASE_URL_ENV]:
            DATABASE_URL,
          DATABASE_URL: "postgresql://hosted.invalid/postgres",
        }),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .environmentDenied,
    );
    expect(
      readCommunicationNotePointsTerminalSettlementEnvironment({
        [COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DATABASE_URL_ENV]:
          DATABASE_URL,
      }),
    ).toMatchObject({ databaseUrl: DATABASE_URL });
  });

  it("pins the exact local PG16 backend identity", () => {
    const target =
      validateCommunicationNotePointsTerminalSettlementDatabaseUrl(
        DATABASE_URL,
      );
    expect(
      assertCommunicationNotePointsTerminalSettlementPreflight(
        {
          server_addr: null,
          server_port: "55432",
          database_name: "postgres",
          session_user_name:
            COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
          current_user_name:
            COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
          server_version_num: "160015",
          backend_pid: "101",
          ssl_in_use: false,
          concurrency_marker:
            COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
        },
        target,
      ),
    ).toMatchObject({
      backendPid: 101,
      transport: "unix-domain-socket",
      sslInUse: false,
    });
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsTerminalSettlementPreflight(
          {
            server_addr: "127.0.0.1",
            server_port: "55432",
          },
          target,
        ),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .preflightFailed,
    );
  });

  it("requires distinct backends and one exact advisory blocker", () => {
    expect(
      assertCommunicationNotePointsTerminalSettlementDistinctBackends(
        101,
        102,
        103,
      ),
    ).toEqual([101, 102, 103]);
    expect(
      assertCommunicationNotePointsTerminalSettlementBlockerRows(
        [
          {
            waiting_pid: "102",
            blocker_pid: "101",
            locktype: "advisory",
            granted: false,
          },
        ],
        102,
        101,
      ),
    ).toMatchObject({ waitingPid: 102, blockerPid: 101 });
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsTerminalSettlementDistinctBackends(
          101,
          101,
        ),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .backendIdentityFailed,
    );
  });

  it("accepts the exact transactional setup and cleanup", () => {
    expect(
      assertCommunicationNotePointsTerminalSettlementSqlPolicy(
        SETUP_SQL,
        CLEANUP_SQL,
      ),
    ).toMatchObject({
      ok: true,
      localPg16Only: true,
      transactionalSetupAndCleanup: true,
      syntheticOnlyCleanup: true,
      truncateDenied: true,
    });
  });

  it.each([
    [
      SETUP_SQL.replaceAll("prepare_recovery_fixtures", "removed_helper"),
      CLEANUP_SQL,
    ],
    [
      SETUP_SQL,
      CLEANUP_SQL.replaceAll(".20260902.v2", ".removed.v2"),
    ],
    [`${SETUP_SQL}\ntruncate table public.point_lots;`, CLEANUP_SQL],
    [`${SETUP_SQL}\n-- db.example.supabase.co`, CLEANUP_SQL],
    [SETUP_SQL, CLEANUP_SQL.replace("where owner_user_id in", "")],
    [
      SETUP_SQL.replaceAll(
        "careslink.cn_points_terminal.marker",
        "careslink.communication_note_points_terminal_settlement_concurrency_marker",
      ),
      CLEANUP_SQL,
    ],
  ])("rejects SQL policy drift %#", (setupSql, cleanupSql) => {
    expectPolicyCode(
      () =>
        assertCommunicationNotePointsTerminalSettlementSqlPolicy(
          setupSql,
          cleanupSql,
        ),
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_POLICY_ERROR_CODES
        .sqlPolicyInvalid,
    );
  });
});

describe("Communication Note Points terminal settlement launcher contract", () => {
  it("pins setup, cleanup, and the normalized launcher source revision", () => {
    const testOnly =
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_TEST_ONLY;
    const digest = (value) =>
      createHash("sha256").update(value).digest("hex");
    const isSha256 = (value) => /^[a-f0-9]{64}$/.test(value);

    expect(isSha256(testOnly.setupSqlSha256)).toBe(true);
    expect(isSha256(testOnly.cleanupSqlSha256)).toBe(true);
    expect(isSha256(testOnly.sourceRevisionSha256)).toBe(true);
    expect(digest(SETUP_SQL)).toBe(testOnly.setupSqlSha256);
    expect(digest(CLEANUP_SQL)).toBe(testOnly.cleanupSqlSha256);
    expect(testOnly.calculateSourceRevisionSha256(HARNESS_SOURCE)).toBe(
      testOnly.sourceRevisionSha256,
    );

    const mutatedSource = HARNESS_SOURCE.replace(
      "const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;",
      "const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1023;",
    );
    expect(mutatedSource).not.toBe(HARNESS_SOURCE);
    expect(testOnly.calculateSourceRevisionSha256(mutatedSource)).not.toBe(
      testOnly.sourceRevisionSha256,
    );

    const sourcePinDeclaration = HARNESS_SOURCE.match(
      /^const SOURCE_REVISION_SHA256 =\n  "[a-f0-9]{64}";$/m,
    )?.[0];
    expect(sourcePinDeclaration).toBeDefined();
    expect(
      testOnly.calculateSourceRevisionSha256(
        HARNESS_SOURCE.replace(sourcePinDeclaration, ""),
      ),
    ).toBeNull();
    expect(
      testOnly.calculateSourceRevisionSha256(
        `${HARNESS_SOURCE}\n${sourcePinDeclaration}\n`,
      ),
    ).toBeNull();
  });

  it("remains explicitly synthetic, local, PG16, and model-call-free", () => {
    expect(
      Buffer.byteLength(
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE,
        "utf8",
      ),
    ).toBeLessThanOrEqual(63);
    expect(
      Buffer.byteLength(
        COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA,
        "utf8",
      ),
    ).toBeLessThanOrEqual(63);
    expect(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_RUNNER_ROLE).not.toBe(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SUPPORT_SCHEMA,
    );
    for (const sql of [SETUP_SQL, CLEANUP_SQL]) {
      for (const match of sql.matchAll(/\bcareslink\.[a-z0-9_.-]+\b/gi)) {
        expect(Buffer.byteLength(match[0], "utf8")).toBeLessThanOrEqual(63);
      }
    }
    expect(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_TEST_ONLY).toMatchObject(
      {
        marker: COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_MARKER,
        postgresMajor: 16,
        production: false,
        hosted: false,
        realCareData: false,
        modelCalls: false,
        migrationEvidenceScope:
          "HISTORICAL_21_MIGRATION_DEPENDENCY_CHAIN",
      },
    );
    expect(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_TEST_ONLY.migrationFiles,
    ).toHaveLength(21);
    expect(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_TEST_ONLY.migrationFiles.at(
        -1,
      ),
    ).toBe(
      "20260903041819_bind_v1_communication_note_encrypted_payload_admission.sql",
    );
    expect(COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS).toEqual([
      "terminal-failure",
      "retry-success-replay",
      "queued-expiry-recovery",
      "short-grant-denial",
      "authority-bounds-cancel",
      "timing-boundaries",
    ]);
    const applicationNames =
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_SCENARIOS.flatMap(
        (scenario) =>
          ["a", "b", "observer"].map(
            (label) => `careslink-cn-terminal-${scenario}-${label}`,
          ),
      );
    expect(new Set(applicationNames).size).toBe(applicationNames.length);
    for (const applicationName of applicationNames) {
      expect(Buffer.byteLength(applicationName, "utf8")).toBeLessThanOrEqual(
        63,
      );
      expect(HARNESS_SOURCE).toContain("careslink-cn-terminal-");
    }
    expect(
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_DEADLINES.totalMs,
    ).toBeLessThanOrEqual(240_000);
  });

  it("keeps the retained 21-migration evidence ordered inside the newer pinned superset", () => {
    const migrationFiles =
      COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_TEST_ONLY.migrationFiles;

    expect(migrationFiles).toHaveLength(21);
    expect(migrationFiles).not.toContain(
      "20260904054437_add_v1_points_wallet_read.sql",
    );
    expect(HARNESS_SOURCE).toContain(
      "migration.manifestIndex <= migrations[index - 1].manifestIndex",
    );
    expect(HARNESS_SOURCE).toContain(
      "COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY.migrationCount",
    );
    expect(HARNESS_SOURCE).not.toContain("pinned.migrations.length !== 45");
    expect(HARNESS_SOURCE).not.toContain(
      "migrations.at(-1)?.manifestIndex !== pinned.migrations.length - 1",
    );
  });

  it("wires every terminal, replay, fairness, and boundary helper", () => {
    for (const marker of [
      "assert_generic_terminal_quarantine",
      "assert_terminal_job_mutation_denied",
      "assert_unmarked_paid_outer_running_replay_denied",
      "assert_unmarked_paid_outer_terminal_replay_denied",
      "assert_settlement_worker_policy_boundary",
      "prepare_recovery_fixtures",
      "recovery_fairness_state",
      "secondaryRegistrationDigest",
      "commit_success_test_only",
      "advance_success_document_test_only",
      "hold_paid_recovery_lock",
      "age_queue_deadline",
      "hold_payload_lock",
      "denied-clock",
      "hold_point_reservation_lock",
      "consume_v1_shadow_note_generation_payload_grant",
      "deniedAuthorityCallerTransactionBeforeClaim",
      "deniedAuthorityClockAfterBlockerRelease",
      "deniedAuthorityReplayStable",
      "deniedAuthorityTerminalWritesUnique",
      "success-clock",
      "successLeaseExpiredAtDatabaseRelease",
      "successExpiredFenceRejected",
      "successStateSnapshotUnchanged",
      "successTerminalWritesAbsent",
      "assert_incomplete_fence_denied",
    ]) {
      expect(HARNESS_SOURCE).toContain(marker);
    }
    expect(HARNESS_SOURCE).not.toMatch(
      /(?:supabase[.]co|pooler[.]supabase[.]com|rds[.]amazonaws[.]com)/i,
    );
  });

  it("never supplies password material to node-postgres", () => {
    expect(() =>
      denyCommunicationNotePointsTerminalSettlementPasswordAuthentication(),
    ).toThrowError(
      expect.objectContaining({
        code: "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_CONCURRENCY_CONNECTION_FAILED",
        stage: "connection",
      }),
    );
  });

  it("preserves the primary failure and fixed teardown failures", () => {
    expect(
      mergeCommunicationNotePointsTerminalSettlementLifecycleFailure(
        {
          code: "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_FAILED",
          stage: "live-harness",
        },
        [
          {
            code: "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_CLEANUP_FAILED",
            stage: "sql-cleanup",
          },
        ],
      ),
    ).toEqual({
      ok: false,
      code: "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_LIVE_FAILED",
      stage: "live-harness",
      teardownErrors: [
        {
          code: "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_CLEANUP_FAILED",
          stage: "sql-cleanup",
        },
      ],
    });
  });

  it("rejects malformed launcher arguments before any PG16 work", async () => {
    await expect(
      runCommunicationNotePointsTerminalSettlementLocalPg16({
        argv: ["--unknown"],
      }),
    ).rejects.toBeInstanceOf(
      CommunicationNotePointsTerminalSettlementConcurrencyError,
    );
    await expect(
      runCommunicationNotePointsTerminalSettlementLocalPg16({
        argv: ["--pg-bin-dir", "relative/bin"],
      }),
    ).rejects.toMatchObject({
      code: "COMMUNICATION_NOTE_POINTS_TERMINAL_SETTLEMENT_LOCAL_PG16_ARGUMENT_FAILED",
      stage: "arguments",
    });
  });
});
