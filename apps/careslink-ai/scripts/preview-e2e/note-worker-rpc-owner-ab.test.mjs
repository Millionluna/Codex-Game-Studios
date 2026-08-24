import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_DATABASE_URL_ENV,
  NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES,
  NoteWorkerRpcOwnerAbLocalPg16PolicyError,
  assertNoteWorkerRpcOwnerAbLocalPg16PolicyRegression,
  parseNoteWorkerRpcOwnerAbLocalPg16DatabaseTarget,
  validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl,
} from "./note-worker-rpc-owner-ab-local-pg16-policy.mjs";

const SETUP_URL = new URL(
  "./note-worker-rpc-owner-ab-setup.sql",
  import.meta.url,
);
const CLEANUP_URL = new URL(
  "./note-worker-rpc-owner-ab-cleanup.sql",
  import.meta.url,
);
const QUIESCE_URL = new URL(
  "./note-worker-rpc-owner-ab-quiesce.sql",
  import.meta.url,
);
const RUNNER = "careslink_v1_generation_owner_ab_runner";

function expectPolicyCode(value, code) {
  let captured;
  try {
    validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(value);
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(
    NoteWorkerRpcOwnerAbLocalPg16PolicyError,
  );
  expect(captured.code).toBe(code);
}

describe("note worker RPC owner A/B local PostgreSQL 16 gate", () => {
  it("accepts only the canonical passwordless high-port loopback target", () => {
    const url = `postgresql://${RUNNER}@127.0.0.1:55432/postgres`;
    const descriptor =
      validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(url);

    expect(descriptor).toEqual({
      ok: true,
      policyVersion: "2026-08-24.local-pg16.1",
      connectionMode: "local_pg16_loopback",
      databaseRole: RUNNER,
      hostname: "127.0.0.1",
      port: 55432,
      database: "postgres",
      postgresMajor: 16,
      applicationName: "careslink-worker-rpc-owner-ab",
      managementApplicationName:
        "careslink-worker-rpc-owner-ab-management",
      bootstrapMarkerName: "careslink.owner_ab.local_bootstrap",
      bootstrapMarkerValue: "2026-08-24.local-pg16.1",
      clusterName: "careslink-owner-ab-pg16",
      sslMode: "disabled",
      passwordMaterial: "absent",
    });
    expect(parseNoteWorkerRpcOwnerAbLocalPg16DatabaseTarget(url)).toEqual(
      descriptor,
    );
    expect(NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_DATABASE_URL_ENV).toBe(
      "CARESLINK_V1_WORKER_OWNER_AB_LOCAL_PG16_DATABASE_URL",
    );
    expect(assertNoteWorkerRpcOwnerAbLocalPg16PolicyRegression()).toMatchObject(
      {
        ok: true,
        expectedPostgresMajor: 16,
        requiredHost: "127.0.0.1",
        requiredDatabaseRole: RUNNER,
      },
    );
  });

  it("rejects every non-canonical or credential-bearing target", () => {
    const errors = NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_ERROR_CODES;
    expectPolicyCode(
      `postgresql://${RUNNER}@db.example.supabase.co:55432/postgres`,
      errors.targetDenied,
    );
    expectPolicyCode(
      `postgresql://${RUNNER}@localhost:55432/postgres`,
      errors.targetDenied,
    );
    expectPolicyCode(
      "postgresql://careslink_v1_generation_concurrency_runner@127.0.0.1:55432/postgres",
      errors.roleDenied,
    );
    expectPolicyCode(
      `postgresql://${RUNNER}@127.0.0.1:5432/postgres`,
      errors.portDenied,
    );
    expectPolicyCode(
      `postgresql://${RUNNER}@127.0.0.1:55433/postgres`,
      errors.portDenied,
    );
    expectPolicyCode(
      `postgresql://${RUNNER}:forbidden@127.0.0.1:55432/postgres`,
      errors.credentialsDenied,
    );
    expectPolicyCode(
      `postgresql://${RUNNER}@127.0.0.1:55432/postgres?sslmode=disable`,
      errors.queryDenied,
    );
    expectPolicyCode(
      `postgresql://${RUNNER}@127.0.0.1:55432/postgres#fragment`,
      errors.queryDenied,
    );
    expectPolicyCode(
      `postgresql://${RUNNER}@127.0.0.1:55432/template1`,
      errors.databaseDenied,
    );
    expectPolicyCode(
      `postgres://${RUNNER}@127.0.0.1:55432/postgres`,
      errors.schemeDenied,
    );
    expectPolicyCode(
      ` postgresql://${RUNNER}@127.0.0.1:55432/postgres`,
      errors.invalid,
    );
    expectPolicyCode(
      `postgresql://${RUNNER}@127.0.0.1:55432/postgres\n`,
      errors.invalid,
    );
  });

  it("locks the symmetric fixed SQL surface and zero-residue cleanup", async () => {
    const [setupSql, quiesceSql, cleanupSql] = await Promise.all([
      readFile(SETUP_URL, "utf8"),
      readFile(QUIESCE_URL, "utf8"),
      readFile(CLEANUP_URL, "utf8"),
    ]);
    const supportSchema =
      "careslink_v1_generation_owner_ab_test_support";
    const applicationName = "careslink-worker-rpc-owner-ab";
    const helpers = [
      "fixture_catalog",
      "activate_owner_a_fixture",
      "activate_owner_b_fixture",
      "activate_privacy_denied_fixture",
      "consume_owner_a_grant_test_only",
      "consume_owner_b_grant_test_only",
      "revoke_privacy_denied_fixture",
      "fixture_state",
    ];
    const rpcs = [
      "claim_v1_shadow_note_generation_job",
      "heartbeat_v1_shadow_note_generation_attempt",
      "fence_v1_shadow_note_generation_attempt",
      "commit_v1_shadow_note_generation_success",
      "settle_v1_shadow_note_generation_failure",
      "resolve_v1_shadow_note_generation_attempt",
      "recover_v1_shadow_note_generation_expired",
      "authorize_v1_shadow_note_generation_payload_attempt",
      "consume_v1_shadow_note_generation_payload_grant",
    ];

    for (const sql of [setupSql, quiesceSql, cleanupSql]) {
      expect(sql).toMatch(/^--[\s\S]*?\nbegin;/);
      expect(sql.trimEnd()).toMatch(/commit;$/);
      expect(sql).not.toMatch(/^\s*truncate\b/im);
      expect(sql).toContain(RUNNER);
    }
    for (const sql of [setupSql, cleanupSql]) {
      expect(sql).toContain(supportSchema);
      for (const helper of helpers) expect(sql).toContain(helper);
      for (const rpc of rpcs) expect(sql).toContain(rpc);
    }

    expect(setupSql).toContain(applicationName);
    for (const sql of [setupSql, quiesceSql, cleanupSql]) {
      expect(sql).toContain("careslink-worker-rpc-owner-ab-management");
      expect(sql).toContain("careslink.owner_ab.local_bootstrap");
      expect(sql).toContain("2026-08-24.local-pg16.1");
      expect(sql).toContain("careslink-owner-ab-pg16");
      expect(sql).toContain("/private/tmp/careslink-owner-ab-pg16\\.");
      expect(sql).toContain("pg_catalog.inet_server_addr()");
      expect(sql).toContain("pg_catalog.inet_server_port()");
    }
    for (const sql of [setupSql, cleanupSql]) {
      expect(sql).toContain("pg_catalog.aclexplode(");
      expect(sql).toContain("pg_catalog.has_table_privilege(");
    }
    expect(setupSql).toContain("grant execute on function");
    expect(setupSql).toContain(
      "revoke temporary on database postgres from public;",
    );
    expect(setupSql).toContain("grant_record.status = 'ISSUED'");
    expect(setupSql).toContain("set status = 'CONSUMED'");
    expect(setupSql).toContain("TEST_ONLY bridge");
    expect(setupSql).toContain("OWNER_AB_SETUP_POSTCHECK_FAILED");
    expect(setupSql).toContain("from public, anon, authenticated, service_role");

    expect(quiesceSql).toContain("alter role " + RUNNER + " nologin;");
    expect(quiesceSql).toMatch(
      new RegExp(
        `alter role ${RUNNER} nologin;\\s+commit;\\s+begin;`,
      ),
    );
    expect(cleanupSql).toContain("and not role_record.rolcanlogin");
    expect(cleanupSql).not.toContain("alter role " + RUNNER + " nologin;");
    expect(cleanupSql).toContain(
      "grant temporary on database postgres to public;",
    );
    expect(cleanupSql).toContain("drop role " + RUNNER + ";");
    expect(cleanupSql).toContain("drop schema " + supportSchema + ";");
    expect(cleanupSql).toContain("settings_enabled_check check (enabled = false)");
    expect(cleanupSql).toContain("PRIVACY_REVIEW_STALE");
    expect(cleanupSql).toContain("PAYLOAD_UNAVAILABLE");
    expect(cleanupSql).toContain("OWNER_AB_CLEANUP_PRIVATE_ZERO_FAILED");
    expect(cleanupSql).toContain("OWNER_AB_CLEANUP_POSTCHECK_FAILED");
  });
});
