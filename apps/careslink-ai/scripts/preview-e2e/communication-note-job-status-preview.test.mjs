import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL } from "../../src/lib/v1/communication-note-job-status-repository.server";
import {
  JOB_STATUS_PREVIEW_BATCH, PROBE_LIMITS, STATUS_SQL, parsePreviewArguments,
  parsePreviewInput, statusParameters, verifyPreviewSources,
} from "./communication-note-job-status-preview-policy.mjs";

vi.mock("server-only", () => ({}));

const REF = "abcdefghijklmnopqrst";
const NOW = Date.parse("2026-09-07T01:00:00.000Z");
const exec = promisify(execFile);
const args = () => ["--execute-authorized-preview", `--expected-branch-ref=${REF}`,
  "--expected-pg-major=17", "--ssl-root-cert-path=/private/tmp/job-status-test-ca.pem",
  `--expected-ssl-root-cert-sha256=${"a".repeat(64)}`];
const input = () => ({
  scope: JOB_STATUS_PREVIEW_BATCH, observedAt: new Date(NOW).toISOString(),
  auth: { publishableKey: "sb_publishable_SYNTHETIC_NOT_A_CREDENTIAL", secretKey: "sb_secret_SYNTHETIC_NOT_A_CREDENTIAL" },
  branch: {
    metadata: { ref: REF, parent_project_ref: "adocsnwnslxhxcjgbyee", is_default: false,
      persistent: false, with_data: false, status: "ACTIVE_HEALTHY" },
    credentials: { REF, STATUS: "ACTIVE_HEALTHY",
      POSTGRES_URL_NON_POOLING: `postgresql://postgres:synthetic-password@db.${REF}.supabase.co:5432/postgres`,
      POSTGRES_URL: `postgresql://postgres.${REF}:synthetic-password@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres` },
  },
});

describe("fixed Communication Note read-only Preview batch", () => {
  it("defaults to offline checking and rejects accidental target/activation flags", () => {
    expect(parsePreviewArguments([])).toEqual({ mode: "CHECK_ONLY" });
    expect(parsePreviewArguments(["--check"])).toEqual({ mode: "CHECK_ONLY" });
    for (const invalid of [["--execute"], ["--database-url=postgres://secret"],
      ["--check", "--execute-authorized-preview"], args().map(a => a.replace("major=17", "major=16")),
      args().concat("--production"), args().slice(0, -1)]) {
      expect(() => parsePreviewArguments(invalid)).toThrow();
    }
  });
  it("checks the exact source hashes and all 47 migration hashes without opening a database", async () => {
    const result = await verifyPreviewSources();
    expect(result.migrations).toHaveLength(47);
    expect(Object.keys(result.sourcePins)).toHaveLength(4);
    const { stdout, stderr } = await exec(process.execPath,
      ["scripts/preview-e2e/communication-note-job-status-preview.mjs", "--check"], { timeout: 15000 });
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, mode: "CHECK_ONLY", hostedExecuted: false, migrationCount: 47 });
  });
  it("binds memory-only credentials to a fresh dataless nondefault child and permits one consumer", () => {
    const parsed = parsePreviewInput(JSON.stringify(input()), parsePreviewArguments(args()), NOW);
    expect(JSON.stringify(parsed)).not.toMatch(/synthetic-password|sb_secret|POSTGRES_URL|auth/);
    const secrets = parsed.takeSecrets();
    expect(secrets.candidates.direct.host).toBe(`db.${REF}.supabase.co`);
    expect(secrets.candidates.sessionPooler.port).toBe(5432);
    expect(() => parsed.takeSecrets()).toThrow();
  });
  it.each([
    ["production", v => { v.branch.metadata.ref = "adocsnwnslxhxcjgbyee"; }],
    ["default", v => { v.branch.metadata.is_default = true; }],
    ["data copy", v => { v.branch.metadata.with_data = true; }],
    ["persistent", v => { v.branch.metadata.persistent = true; }],
    ["parent mismatch", v => { v.branch.metadata.parent_project_ref = REF; }],
    ["credential mismatch", v => { v.branch.credentials.REF = "xxxxxxxxxxxxxxxxxxxx"; }],
    ["unhealthy", v => { v.branch.metadata.status = "COMING_UP"; }],
    ["stale metadata", v => { v.observedAt = new Date(NOW - 60001).toISOString(); }],
    ["future metadata", v => { v.observedAt = new Date(NOW + 1).toISOString(); }],
    ["wrong scope", v => { v.scope = "OTHER_PURPOSE"; }],
    ["extra instruction", v => { v.executeSql = "drop table anything"; }],
    ["extra auth field", v => { v.auth.apiUrl = "https://attacker.invalid"; }],
    ["empty key", v => { v.auth.secretKey = ""; }],
    ["credential newline", v => { v.auth.secretKey += "\n"; }],
    ["input too large", v => { v.auth.secretKey = "x".repeat(70000); }],
  ])("rejects %s before any external action", (_name, mutate) => {
    const value = input(); mutate(value);
    expect(() => parsePreviewInput(JSON.stringify(value), parsePreviewArguments(args()), NOW)).toThrow();
  });
  it("pins only the source five-parameter read and reports the remaining evidence gaps", async () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL).toBe(STATUS_SQL);
    expect(statusParameters("owner", "session", "job")).toEqual([
      "owner", "session", "job", "1.0.0-shadow.1", "2026-08-09.v1-shadow",
    ]);
    expect(PROBE_LIMITS).toMatchObject({ createPreview: false, applyMigrations: false,
      deletePreview: false, insertJobs: false, insertPayloads: false, mutatePoints: false,
      invokeModel: false, installRuntimeAdapter: false });
    const runner = await readFile(new URL("./communication-note-job-status-preview.mjs", import.meta.url), "utf8");
    expect(runner).toContain("previewDeleted: false");
    expect(runner).toContain("sourceAdapterTransportVerified: false");
    expect(runner).toContain("populatedJobAndOwnerRlsVerified: false");
    expect(runner).toContain("browserCookieCompositionVerified: false");
    expect(runner).not.toMatch(/session_replication_role|console\.|process\.env|insert into|delete from|create_branch|drop schema/i);
  });
  it("invalid CLI input produces only a fixed safe failure envelope", async () => {
    const result = await exec(process.execPath, ["scripts/preview-e2e/communication-note-job-status-preview.mjs",
      "--database-url=postgresql://DO_NOT_PRINT_SECRET@localhost/postgres"], { timeout: 15000 }).catch(error => error);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("DO_NOT_PRINT_SECRET");
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, stage: "input-or-source-preflight", hostedExecuted: false });
  });
});
