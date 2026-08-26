import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  PORTAL_RESPONSE_CONCURRENCY_DATABASE_URL_ENV,
  PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES,
  PORTAL_RESPONSE_CONCURRENCY_MARKER,
  PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
  PortalResponseConcurrencyPolicyError,
  assertPortalResponseConcurrencyDistinctBackends,
  assertPortalResponseConcurrencyPolicyRegression,
  assertPortalResponseConcurrencyPreflight,
  assertPortalResponseConcurrencySqlPolicy,
  readPortalResponseConcurrencyEnvironment,
  validatePortalResponseConcurrencyDatabaseUrl,
} from "./portal-referral-provider-response-concurrency-local-pg16-policy.mjs";
import {
  PortalResponseConcurrencyHarnessError,
  assertSingleEffectState,
  assertZeroEffectState,
  denyPortalResponseConcurrencyPasswordAuthentication,
} from "./portal-referral-provider-response-concurrency.mjs";

const SETUP_URL = new URL(
  "./portal-referral-provider-response-concurrency-setup.sql",
  import.meta.url,
);
const CLEANUP_URL = new URL(
  "./portal-referral-provider-response-concurrency-cleanup.sql",
  import.meta.url,
);

function validUrl() {
  return (
    "postgresql://" +
    PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE +
    "@127.0.0.1:55432/postgres"
  );
}

function expectPolicyCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(PortalResponseConcurrencyPolicyError);
    expect(error).toMatchObject({ code, message: code });
    return;
  }
  throw new Error("Expected " + code);
}

describe("Portal Provider Response concurrency local PG16 policy", () => {
  it("accepts only the canonical passwordless IPv4 high-port target", () => {
    expect(validatePortalResponseConcurrencyDatabaseUrl(validUrl())).toEqual({
      ok: true,
      policyVersion: PORTAL_RESPONSE_CONCURRENCY_MARKER,
      hostname: "127.0.0.1",
      port: 55432,
      database: "postgres",
      databaseRole: PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
      postgresMajor: 16,
      sslMode: "disabled",
      passwordMaterial: "absent",
      hostedTarget: false,
    });
    expect(assertPortalResponseConcurrencyPolicyRegression()).toMatchObject({
      ok: true,
      expectedPostgresMajor: 16,
      requiredHost: "127.0.0.1",
    });
  });

  it.each([
    [
      validUrl().replace("127.0.0.1", "db.example.supabase.co"),
      "targetDenied",
    ],
    [validUrl().replace("127.0.0.1", "localhost"), "targetDenied"],
    [validUrl().replace(":55432/", ":5432/"), "portDenied"],
    [
      validUrl().replace(
        PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE + "@",
        PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE + ":forbidden@",
      ),
      "credentialsDenied",
    ],
    [validUrl() + "?sslmode=disable", "queryDenied"],
    [validUrl() + "#fragment", "queryDenied"],
    [validUrl().replace("/postgres", "/template1"), "databaseDenied"],
    [validUrl().replace("postgresql://", "postgres://"), "targetDenied"],
  ])("rejects unsafe URL %s", (url, errorKey) => {
    expectPolicyCode(
      () => validatePortalResponseConcurrencyDatabaseUrl(url),
      PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES[errorKey],
    );
  });

  it("rejects generic database environment fallbacks", () => {
    expect(
      readPortalResponseConcurrencyEnvironment({
        [PORTAL_RESPONSE_CONCURRENCY_DATABASE_URL_ENV]: validUrl(),
      }),
    ).toMatchObject({
      databaseUrl: validUrl(),
      target: { hostedTarget: false, postgresMajor: 16 },
    });

    for (const name of [
      "DATABASE_URL",
      "PGHOST",
      "PGPASSWORD",
      "PGOPTIONS",
      "PGPASSFILE",
      "PGPASS_NO_DEESCAPE",
    ]) {
      expectPolicyCode(
        () =>
          readPortalResponseConcurrencyEnvironment({
            [PORTAL_RESPONSE_CONCURRENCY_DATABASE_URL_ENV]: validUrl(),
            [name]: "",
          }),
        PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.environmentDenied,
      );
    }
  });

  it("blocks pgpass and any password-authentication challenge", () => {
    expect(() =>
      denyPortalResponseConcurrencyPasswordAuthentication(),
    ).toThrowError(
      expect.objectContaining({
        name: "PortalResponseConcurrencyHarnessError",
        code: "PORTAL_RESPONSE_CONCURRENCY_PASSWORD_AUTH_DENIED",
      }),
    );
    try {
      denyPortalResponseConcurrencyPasswordAuthentication();
    } catch (error) {
      expect(error).toBeInstanceOf(PortalResponseConcurrencyHarnessError);
      return;
    }
    throw new Error("Expected password authentication to be denied");
  });

  it("pins SQL setup and exact cleanup to the local boundary", async () => {
    const [setupSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);
    expect(
      assertPortalResponseConcurrencySqlPolicy(setupSql, cleanupSql),
    ).toEqual({
      ok: true,
      localPg16BoundaryLocked: true,
      passwordlessRunnerLocked: true,
      fixedHelperBoundaryLocked: true,
      exactCleanupLocked: true,
      truncateDenied: true,
      hostedTargetDenied: true,
    });
    expect(setupSql).not.toMatch(/\btruncate\b/i);
    expect(cleanupSql).not.toMatch(/\btruncate\b/i);

    for (const weakened of [
      {
        setup: setupSql + "\ndelete from public.portal_referrals;\n",
        cleanup: cleanupSql,
      },
      {
        setup: setupSql,
        cleanup:
          cleanupSql +
          "\nupdate public.portal_workflow_flags set enabled = true;\n",
      },
      {
        setup: setupSql,
        cleanup:
          cleanupSql + "\ndelete from auth.users where true;\n",
      },
    ]) {
      expectPolicyCode(
        () =>
          assertPortalResponseConcurrencySqlPolicy(
            weakened.setup,
            weakened.cleanup,
          ),
        PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.sqlPolicyFailed,
      );
    }
  });

  it("requires the exact PG16 loopback backend identity", () => {
    expect(
      assertPortalResponseConcurrencyPreflight(
        {
          server_addr: "127.0.0.1",
          server_port: 55432,
          database_name: "postgres",
          session_user_name: PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
          current_user_name: PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
          server_version_num: "160015",
          backend_pid: 101,
          ssl_in_use: false,
          bootstrap_marker: PORTAL_RESPONSE_CONCURRENCY_MARKER,
        },
        { port: 55432 },
      ),
    ).toEqual({
      ok: true,
      backendPid: 101,
      serverVersionNum: 160015,
      port: 55432,
      sslInUse: false,
      marker: PORTAL_RESPONSE_CONCURRENCY_MARKER,
    });
    expectPolicyCode(
      () =>
        assertPortalResponseConcurrencyPreflight(
          {
            server_addr: "127.0.0.1",
            server_port: 55432,
            database_name: "postgres",
            session_user_name: PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
            current_user_name: PORTAL_RESPONSE_CONCURRENCY_RUNNER_ROLE,
            server_version_num: "170006",
            backend_pid: 101,
            ssl_in_use: false,
            bootstrap_marker: PORTAL_RESPONSE_CONCURRENCY_MARKER,
          },
          { port: 55432 },
        ),
      PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.preflightFailed,
    );
  });

  it("requires distinct live backend identities", () => {
    expect(assertPortalResponseConcurrencyDistinctBackends(101, 202)).toEqual(
      [101, 202],
    );
    expectPolicyCode(
      () => assertPortalResponseConcurrencyDistinctBackends(101, 101),
      PORTAL_RESPONSE_CONCURRENCY_ERROR_CODES.backendIdentityFailed,
    );
  });

  it("pins single-effect and zero-effect postconditions", () => {
    expect(
      assertSingleEffectState(
        {
          referral_status: "ACCEPTED",
          referral_version: 4,
          assigned_provider_id:
            "d3100000-0000-4000-8000-000000000001",
          match_a_status: "ACCEPTED",
          audit_count: 1,
          receipt_count: 1,
          response_audit_count: 1,
          offer_audit_count: 0,
        },
        "ACCEPTED",
      ),
    ).toEqual({ ok: true, status: "ACCEPTED", effects: 1 });
    expect(
      assertSingleEffectState(
        {
          referral_status: "TRIAGED",
          referral_version: 4,
          assigned_provider_id: null,
          match_a_status: "DECLINED",
          audit_count: 1,
          receipt_count: 1,
          response_audit_count: 1,
          offer_audit_count: 0,
        },
        "TRIAGED",
      ),
    ).toEqual({ ok: true, status: "TRIAGED", effects: 1 });
    expect(
      assertZeroEffectState({
        referral_status: "OFFERED",
        referral_version: 3,
        match_a_status: "OFFERED",
        audit_count: 0,
        receipt_count: 0,
      }),
    ).toEqual({ ok: true, effects: 0 });
  });

  it("rejects winner/state mismatches even when effect counts are one", () => {
    const accepted = {
      referral_status: "ACCEPTED",
      referral_version: 4,
      assigned_provider_id:
        "d3100000-0000-4000-8000-000000000001",
      match_a_status: "ACCEPTED",
      audit_count: 1,
      receipt_count: 1,
      response_audit_count: 1,
      offer_audit_count: 0,
    };
    for (const drifted of [
      { ...accepted, assigned_provider_id: null },
      { ...accepted, match_a_status: "DECLINED" },
      {
        ...accepted,
        referral_status: "TRIAGED",
        assigned_provider_id:
          "d3100000-0000-4000-8000-000000000001",
        match_a_status: "DECLINED",
      },
    ]) {
      expect(() =>
        assertSingleEffectState(
          drifted,
          drifted.referral_status,
        ),
      ).toThrowError("PORTAL_RESPONSE_CONCURRENCY_REPLAY_FAILED");
    }
  });
});
