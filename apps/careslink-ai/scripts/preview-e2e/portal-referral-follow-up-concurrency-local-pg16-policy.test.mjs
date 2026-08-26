import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  PORTAL_FOLLOW_UP_CONCURRENCY_DATABASE_URL_ENV,
  PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS,
  PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY,
  PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
  PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES,
  PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE,
  PortalFollowUpConcurrencyPolicyError,
  assertPortalFollowUpConcurrencyDistinctBackends,
  assertPortalFollowUpConcurrencyLocalPg16SqlPolicy,
  assertPortalFollowUpConcurrencyMigrationManifest,
  assertPortalFollowUpConcurrencyPg16Version,
  assertPortalFollowUpConcurrencyPolicyRegression,
  assertPortalFollowUpConcurrencyPreflight,
  assertPortalFollowUpConcurrencyTimeoutPolicy,
  parsePortalFollowUpConcurrencyLocalPg16Arguments,
  readPortalFollowUpConcurrencyEnvironment,
  validatePortalFollowUpConcurrencyDatabaseUrl,
  validatePortalFollowUpConcurrencyTempRoot,
} from "./portal-referral-follow-up-concurrency-local-pg16-policy.mjs";
import {
  PortalFollowUpConcurrencyLocalPg16Error,
  mergePortalFollowUpConcurrencyLifecycleFailure,
} from "./portal-referral-follow-up-concurrency-local-pg16.mjs";

const RUNNER_URL = new URL(
  "./portal-referral-follow-up-concurrency-local-pg16.mjs",
  import.meta.url,
);
const MIGRATION_ROOT = new URL("../../supabase/migrations/", import.meta.url);
const BOOTSTRAP_SQL_URL = new URL(
  "./portal-referral-follow-up-concurrency-local-pg16-bootstrap.sql",
  import.meta.url,
);
const SETUP_SQL_URL = new URL(
  "./portal-referral-follow-up-concurrency-setup.sql",
  import.meta.url,
);
const CLEANUP_SQL_URL = new URL(
  "./portal-referral-follow-up-concurrency-cleanup.sql",
  import.meta.url,
);

function validDatabaseUrl(port = 55_432) {
  return (
    `postgresql://${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}` +
    `@127.0.0.1:${port}/postgres`
  );
}

function expectPolicyCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(PortalFollowUpConcurrencyPolicyError);
    expect(error).toMatchObject({ code, message: code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("Portal Follow-up M1c local PG16 policy", () => {
  it("accepts only its canonical credential-free IPv4 high-port target", () => {
    expect(validatePortalFollowUpConcurrencyDatabaseUrl(validDatabaseUrl()))
      .toEqual({
        ok: true,
        policyVersion: PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
        hostname: "127.0.0.1",
        port: 55_432,
        database: "postgres",
        databaseRole: PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE,
        postgresMajor: 16,
        sslMode: "disabled",
        passwordMaterial: "absent",
        hostedTarget: false,
      });
    expect(assertPortalFollowUpConcurrencyPolicyRegression()).toMatchObject({
      ok: true,
      expectedPostgresMajor: 16,
      requiredHost: "127.0.0.1",
      migrationCount: 8,
    });
  });

  it.each([
    [validDatabaseUrl().replace("127.0.0.1", "localhost"), "targetDenied"],
    [
      validDatabaseUrl().replace(
        "127.0.0.1",
        "db.example.invalid",
      ),
      "targetDenied",
    ],
    [validDatabaseUrl(5_432), "portDenied"],
    [validDatabaseUrl(49_151), "portDenied"],
    [
      validDatabaseUrl().replace(
        `${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}@`,
        `${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE}:forbidden@`,
      ),
      "credentialsDenied",
    ],
    [validDatabaseUrl() + "?sslmode=disable", "queryDenied"],
    [validDatabaseUrl() + "#fragment", "queryDenied"],
    [validDatabaseUrl().replace("/postgres", "/template1"), "databaseDenied"],
    [validDatabaseUrl().replace("postgresql://", "postgres://"), "targetDenied"],
  ])("rejects unsafe database URL %s", (value, errorKey) => {
    expectPolicyCode(
      () => validatePortalFollowUpConcurrencyDatabaseUrl(value),
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES[errorKey],
    );
  });

  it("reads only the dedicated generated live-child environment", () => {
    expect(
      readPortalFollowUpConcurrencyEnvironment({
        [PORTAL_FOLLOW_UP_CONCURRENCY_DATABASE_URL_ENV]: validDatabaseUrl(),
      }),
    ).toMatchObject({
      databaseUrl: validDatabaseUrl(),
      target: { hostedTarget: false, postgresMajor: 16 },
    });

    for (const name of
      PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_POLICY.deniedEnvironmentNames) {
      expectPolicyCode(
        () =>
          readPortalFollowUpConcurrencyEnvironment({
            [PORTAL_FOLLOW_UP_CONCURRENCY_DATABASE_URL_ENV]:
              validDatabaseUrl(),
            [name]: "",
          }),
        PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.environmentDenied,
      );
    }
  });

  it("pins the exact ordered eight-migration minimum chain", async () => {
    const entries = await Promise.all(
      PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS.map(
        async (migration) => ({
          file: migration.file,
          sql: await readFile(new URL(migration.file, MIGRATION_ROOT), "utf8"),
        }),
      ),
    );
    expect(assertPortalFollowUpConcurrencyMigrationManifest(entries))
      .toMatchObject({ ok: true, migrationCount: 8 });

    expectPolicyCode(
      () =>
        assertPortalFollowUpConcurrencyMigrationManifest([
          ...entries.slice(0, 7),
          { ...entries[7], sql: entries[7].sql + "\n-- drift\n" },
        ]),
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.migrationManifestFailed,
    );
    expectPolicyCode(
      () =>
        assertPortalFollowUpConcurrencyMigrationManifest([...entries].reverse()),
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.migrationManifestFailed,
    );
  });

  it("pins all lifecycle SQL bodies and rejects policy drift", async () => {
    const [bootstrapSql, setupSql, cleanupSql] = await Promise.all([
      readFile(BOOTSTRAP_SQL_URL, "utf8"),
      readFile(SETUP_SQL_URL, "utf8"),
      readFile(CLEANUP_SQL_URL, "utf8"),
    ]);
    expect(
      assertPortalFollowUpConcurrencyLocalPg16SqlPolicy(
        bootstrapSql,
        setupSql,
        cleanupSql,
      ),
    ).toMatchObject({
      ok: true,
      bootstrapSha256:
        "701128cf64b7e5f4eb28e64f1ae7a0d95b8deb4e9ca68c6ac338560b99c3145f",
      setupSha256:
        "5cbbceaa939ac537ce9fa99de6854c3c7ac386c4b54235e1a47c3915593a6f1a",
      cleanupSha256:
        "2f42934e46935df897c0a2173096d11f3a63bf9fb1a538f6d284f2125caef30e",
      exactSqlBodiesLocked: true,
      truncateDenied: true,
      hostedTargetDenied: true,
    });

    const mutations = [
      [bootstrapSql + "\n-- drift\n", setupSql, cleanupSql],
      [bootstrapSql, setupSql.replace("lock_mutation", "lock_drift"), cleanupSql],
      [bootstrapSql, setupSql, cleanupSql.replace("commit;", "truncate auth.users;\ncommit;")],
      [bootstrapSql, setupSql + "\n-- db.example.supabase.co\n", cleanupSql],
    ];
    for (const mutation of mutations) {
      expectPolicyCode(
        () => assertPortalFollowUpConcurrencyLocalPg16SqlPolicy(...mutation),
        PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.sqlPolicyFailed,
      );
    }
  });

  it("locks PG16, temp-root, CLI and timeout policy", () => {
    expect(
      assertPortalFollowUpConcurrencyPg16Version(
        "postgres (PostgreSQL) 16.15 (Homebrew)\n",
      ),
    ).toEqual({ ok: true, postgresMajor: 16 });
    expectPolicyCode(
      () =>
        assertPortalFollowUpConcurrencyPg16Version(
          "postgres (PostgreSQL) 17.6\n",
        ),
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.binaryDenied,
    );

    expect(
      validatePortalFollowUpConcurrencyTempRoot(
        "/private/tmp/careslink-portal-follow-up-pg16.aB12cD",
      ),
    ).toBe("/private/tmp/careslink-portal-follow-up-pg16.aB12cD");
    for (const unsafe of [
      "/private/tmp/careslink-portal-follow-up-pg16.",
      "/tmp/careslink-portal-follow-up-pg16.aB12cD",
      "/private/tmp/careslink-portal-follow-up-pg16.../../other",
      "/private/tmp/other.aB12cD",
      "/",
    ]) {
      expectPolicyCode(
        () => validatePortalFollowUpConcurrencyTempRoot(unsafe),
        PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.tempRootDenied,
      );
    }

    expect(parsePortalFollowUpConcurrencyLocalPg16Arguments([])).toEqual({
      pgBinDir: null,
    });
    expect(
      parsePortalFollowUpConcurrencyLocalPg16Arguments([
        "--pg-bin-dir=/opt/homebrew/opt/postgresql@16/bin",
      ]),
    ).toEqual({ pgBinDir: "/opt/homebrew/opt/postgresql@16/bin" });
    for (const unsafeArgs of [
      ["--pg-bin-dir=relative"],
      ["--unknown=/absolute"],
      ["--pg-bin-dir="],
      ["a", "b"],
    ]) {
      expectPolicyCode(
        () => parsePortalFollowUpConcurrencyLocalPg16Arguments(unsafeArgs),
        PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.argumentInvalid,
      );
    }
    expect(assertPortalFollowUpConcurrencyTimeoutPolicy()).toMatchObject({
      ok: true,
      totalMs: 120_000,
      liveHarnessMs: 60_000,
    });
  });

  it("requires exact PG16 backend identity and distinct PIDs", () => {
    expect(
      assertPortalFollowUpConcurrencyPreflight(
        {
          server_addr: "127.0.0.1",
          server_port: 55_432,
          database_name: "postgres",
          session_user_name: PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE,
          current_user_name: PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE,
          server_version_num: "160015",
          backend_pid: 101,
          ssl_in_use: false,
          bootstrap_marker: PORTAL_FOLLOW_UP_CONCURRENCY_MARKER,
        },
        { port: 55_432 },
      ),
    ).toMatchObject({ ok: true, backendPid: 101, serverVersionNum: 160015 });
    expect(assertPortalFollowUpConcurrencyDistinctBackends(101, 202, 303))
      .toEqual([101, 202, 303]);
    expectPolicyCode(
      () => assertPortalFollowUpConcurrencyDistinctBackends(101, 101),
      PORTAL_FOLLOW_UP_CONCURRENCY_POLICY_ERROR_CODES.backendIdentityFailed,
    );
  });

  it("keeps primary and teardown failures without copying arbitrary text", () => {
    expect(
      mergePortalFollowUpConcurrencyLifecycleFailure(
        {
          code: "PORTAL_FOLLOW_UP_CONCURRENCY_SESSION_RACE_FAILED",
          stage: "live-harness",
        },
        [
          {
            code: "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_CLEANUP_FAILED",
            stage: "sql-cleanup",
          },
          { code: "postgresql://secret", stage: "ignored" },
        ],
      ),
    ).toEqual({
      ok: false,
      code: "PORTAL_FOLLOW_UP_CONCURRENCY_SESSION_RACE_FAILED",
      stage: "live-harness",
      teardownErrors: [
        {
          code: "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_CLEANUP_FAILED",
          stage: "sql-cleanup",
        },
      ],
    });
    const error = new PortalFollowUpConcurrencyLocalPg16Error(
      "postgresql://postgres:secret@example.invalid",
      "internal",
    );
    expect(error.code).toBe(
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_INTERNAL_FAILED",
    );
    expect(String(error)).not.toContain("secret");
  });

  it("owns the complete local lifecycle without shell or database fallbacks", async () => {
    const source = await readFile(RUNNER_URL, "utf8");
    for (const required of [
      "mkdtemp(TEMP_ROOT_PREFIX)",
      "createPortCandidates()",
      "randomInt(policy.minimumPort, policy.maximumPort + 1)",
      "--auth-host=trust",
      "portal-referral-follow-up-concurrency-local-pg16-bootstrap.sql",
      "portal-referral-follow-up-concurrency-setup.sql",
      "portal-referral-follow-up-concurrency.mjs",
      "portal-referral-follow-up-concurrency-cleanup.sql",
      "readPortalFollowUpConcurrencyEnvironment",
      "alter role ${PORTAL_FOLLOW_UP_CONCURRENCY_RUNNER_ROLE} nologin",
      "pg_terminate_backend",
      "POSTCHECK_QUERY",
      "stopPostgresInstance",
      "exactDeleteTempRoot",
      "withLifecycleDeadline",
      "PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_TIMEOUTS.exactDeleteMs",
      "mergePortalFollowUpConcurrencyLifecycleFailure",
      "Math.floor(Math.min(maximumMs, remainingMs))",
      "Math.floor(\n                Math.min(1_500, candidateDeadline - performance.now())",
      "--no-password",
      "--set=ON_ERROR_STOP=1",
    ]) {
      expect(source).toContain(required);
    }
    for (const migration of
      PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS) {
      expect(source).toContain("PORTAL_FOLLOW_UP_CONCURRENCY_LOCAL_PG16_MIGRATIONS");
      expect(migration.file).toMatch(/^2026[0-9]{10}_[a-z0-9_]+\.sql$/);
    }
    expect(source).not.toContain("shell: true");
    expect(source).not.toMatch(/pg_catalog\.(?:current_user|session_user)/);
    expect(source).not.toMatch(
      /process\.env\.(?:DATABASE_URL|DIRECT_URL|PGHOST|PGPASSWORD|SUPABASE_DB_URL)/,
    );
    expect(source).not.toMatch(/supabase\.co|pooler\.supabase\.com/i);
    expect(source).not.toMatch(/\brmSync\b|\bexecSync\b/);
  });
});
