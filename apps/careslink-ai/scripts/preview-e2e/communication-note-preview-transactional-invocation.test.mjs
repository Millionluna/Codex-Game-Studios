import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { execFile, spawn } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommunicationNotePreviewTransactionalInvocationError,
  parseCommunicationNotePreviewTransactionalInvocationArguments as parseArguments,
  runCommunicationNotePreviewTransactionalInvocation as runInvocation,
} from "./communication-note-preview-transactional-invocation.mjs";
import {
  COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY as POLICY,
} from "./communication-note-preview-transactional-migrations-policy.mjs";
import {
  extractCommunicationNoteDisposablePreviewResetDatabaseTarget as extractTarget,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";

vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal(), execFile: vi.fn(), spawn: vi.fn(),
}));

const REF = "abcdefghijklmnopqrst";
const OTHER_REF = "bcdefghijklmnopqrstu";
const ID = "11111111-1111-4111-8111-111111111111";
const NAME = "careslink-points-ui-v1-e2e-synthetic";
const SECRET = "sentinel-invocation-password-never-log";
const CA = Buffer.from("synthetic-ca-for-injected-unit-tests-only");
const CA_PATH = "/private/synthetic-ca.crt";
const ARGV = [
  `--expected-branch-id=${ID}`, `--expected-branch-name=${NAME}`,
  `--expected-branch-ref=${REF}`, "--expected-pg-major=17",
  `--ssl-root-cert-path=${CA_PATH}`,
  `--expected-ssl-root-cert-sha256=${createHash("sha256").update(CA).digest("hex")}`,
  `--authorized-disposable-preview-reset=${POLICY.disposablePreviewBaselineHistorySha256}`,
];

function target(overrides = {}) {
  return {
    id: ID, name: NAME, project_ref: REF, parent_project_ref: POLICY.productionProjectRef,
    is_default: false, persistent: false, with_data: false,
    status: "FUNCTIONS_DEPLOYED", preview_project_status: "ACTIVE_HEALTHY",
    created_at: "2026-09-05T00:00:00.000Z", updated_at: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}
function production() {
  return target({ id: "99999999-9999-4999-8999-999999999999", name: "main",
    project_ref: POLICY.productionProjectRef, is_default: true });
}
function branchList(overrides = {}) {
  return JSON.stringify([production(), target(overrides)]);
}

// CLI v2.115.0 branches.format.ts::toStandardEnvs contract. No invented REF or
// STATUS. These are all synthetic values, never a saved hosted CLI response.
function standardEnvs(overrides = {}) {
  return {
    POSTGRES_URL_NON_POOLING: `postgresql://postgres:${SECRET}@db.${REF}.supabase.co:5432/postgres?connect_timeout=10`,
    POSTGRES_URL: `postgresql://postgres.${REF}:${SECRET}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?connect_timeout=10`,
    SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_JWT_SECRET: "sentinel-jwt-not-forwarded",
    SUPABASE_ANON_KEY: "sentinel-anon-not-forwarded",
    SUPABASE_SERVICE_ROLE_KEY: "sentinel-service-not-forwarded",
    SUPABASE_PUBLISHABLE_KEY: "sentinel-publishable-not-forwarded",
    SUPABASE_DEFAULT_KEY: "sentinel-default-not-forwarded",
    ...overrides,
  };
}

function harness({ before = branchList(), after = before, credentials = JSON.stringify(standardEnvs()), failAt } = {}) {
  const events = [];
  const outputs = ["2.115.0\n", before, credentials, after];
  const readCliOutput = vi.fn(async (argv) => {
    events.push(argv.slice());
    if (readCliOutput.mock.calls.length === failAt) throw new Error(SECRET);
    return outputs.shift();
  });
  const runMigrationProcess = vi.fn(async () => { events.push("run"); });
  const options = {
    argv: ARGV, environment: { PATH: "/usr/bin", LANG: "C" },
    readCliOutput, runMigrationProcess,
    readCertificate: vi.fn(async () => CA), loadMigrations: vi.fn(async () => ({})),
  };
  return { options, events, readCliOutput, runMigrationProcess };
}

async function expectFailure(h, checkpoint, options = {}) {
  const result = runInvocation({ ...h.options, ...options });
  await expect(result).rejects.toBeInstanceOf(CommunicationNotePreviewTransactionalInvocationError);
  await expect(result).rejects.toMatchObject({ code: "PREVIEW_TRANSACTIONAL_INVOCATION_FAILED", checkpoint });
  await result.catch((error) => {
    expect(`${error.stack}${JSON.stringify(error)}`).not.toContain(SECRET);
    expect(error.cause).toBeUndefined();
  });
}

beforeEach(() => vi.clearAllMocks());

describe("versioned Preview transactional invocation", () => {
  it("routes the actual CLI shape through the existing converter and downstream target guard", async () => {
    const h = harness();
    const evidence = await runInvocation(h.options);
    expect(evidence).toEqual({ stage: "preview_invocation", ok: true, policy: POLICY.version });
    expect(h.events).toEqual([
      ["--version"],
      ["branches", "list", "--project-ref", POLICY.productionProjectRef, "-o", "json"],
      ["branches", "get", ID, "--project-ref", POLICY.productionProjectRef, "-o", "json"],
      ["branches", "list", "--project-ref", POLICY.productionProjectRef, "-o", "json"],
      "run",
    ]);
    const [argv, input, environment] = h.runMigrationProcess.mock.calls[0];
    expect(argv).toEqual(ARGV.slice(2));
    expect(argv.join(" ")).not.toContain(SECRET);
    expect(environment).toEqual(h.options.environment);
    const envelope = JSON.parse(input);
    expect(envelope.credentials).toEqual({
      REF, STATUS: "ACTIVE_HEALTHY",
      POSTGRES_URL: standardEnvs().POSTGRES_URL,
      POSTGRES_URL_NON_POOLING: standardEnvs().POSTGRES_URL_NON_POOLING,
    });
    for (const [key, value] of Object.entries(standardEnvs())) {
      if (key.startsWith("SUPABASE_")) expect(input).not.toContain(value);
    }
    expect(extractTarget(input, { expectedBranchRef: REF }).descriptor.projectRef).toBe(REF);
    expect(JSON.stringify(evidence)).not.toContain(SECRET);
  });

  it.each(["data", "result"])("accepts the converter's supported %s credential envelope", async (key) => {
    const h = harness({ credentials: JSON.stringify({ [key]: standardEnvs() }) });
    await runInvocation(h.options);
    expect(h.runMigrationProcess).toHaveBeenCalledOnce();
  });

  it("reproduces the r7 manual mapping failure while the fixed route succeeds", async () => {
    const source = standardEnvs();
    expect(source).not.toHaveProperty("REF");
    expect(source).not.toHaveProperty("STATUS");
    const h = harness();
    await runInvocation(h.options);
    const envelope = JSON.parse(h.runMigrationProcess.mock.calls[0][1]);
    envelope.credentials.REF = source.REF;
    envelope.credentials.STATUS = source.STATUS;
    expect(() => extractTarget(JSON.stringify(envelope), { expectedBranchRef: REF }))
      .toThrow("RUNNER_TERMINAL_IDENTITY_BRANCH_JSON_INVALID");
  });

  it.each([
    ["not healthy", { preview_project_status: "COMING_UP" }],
    ["failed pipeline", { status: "MIGRATIONS_FAILED" }],
    ["unfinished pipeline", { status: "RUNNING_MIGRATIONS" }],
    ["copied data", { with_data: true }],
    ["persistent", { persistent: true }],
    ["default", { is_default: true }],
    ["wrong parent", { parent_project_ref: OTHER_REF }],
    ["wrong ref", { project_ref: OTHER_REF }],
    ["wrong id", { id: "22222222-2222-4222-8222-222222222222" }],
    ["wrong name", { name: "other-preview" }],
  ])("rejects %s metadata before retrieving any credentials", async (_name, overrides) => {
    const h = harness({ before: branchList(overrides) });
    await expectFailure(h, "branch_before_credentials");
    expect(h.readCliOutput).toHaveBeenCalledTimes(2);
    expect(h.runMigrationProcess).not.toHaveBeenCalled();
  });

  it.each([
    { preview_project_status: "COMING_UP" }, { status: "FUNCTIONS_FAILED" },
    { with_data: true }, { persistent: true }, { project_ref: OTHER_REF },
    { id: "22222222-2222-4222-8222-222222222222" },
  ])("rechecks metadata after credential retrieval: %j", async (overrides) => {
    const h = harness({ after: branchList(overrides) });
    await expectFailure(h, "branch_after_credentials");
    expect(h.runMigrationProcess).not.toHaveBeenCalled();
  });

  it.each([
    JSON.stringify([production()]),
    JSON.stringify([production(), target(), target({ id: "22222222-2222-4222-8222-222222222222", name: "other", project_ref: OTHER_REF })]),
    JSON.stringify([production(), target(), target()]),
    JSON.stringify({ branches: [production(), target()] }),
    "not-json-" + SECRET,
  ])("rejects ambiguous or malformed branch lists", async (before) => {
    const h = harness({ before });
    await expectFailure(h, "branch_before_credentials");
    expect(h.runMigrationProcess).not.toHaveBeenCalled();
  });

  it.each([
    { REF: OTHER_REF }, { STATUS: "COMING_UP" },
    { POSTGRES_URL_NON_POOLING: `postgresql://postgres:${SECRET}@db.${POLICY.productionProjectRef}.supabase.co:5432/postgres` },
    { POSTGRES_URL: `postgresql://postgres.${OTHER_REF}:${SECRET}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres` },
    { POSTGRES_URL: `postgresql://postgres.${REF}:different@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres` },
    { POSTGRES_URL_NON_POOLING: `postgresql://postgres:${SECRET}@db.${REF}.supabase.co:5432/postgres?sslmode=disable` },
    { POSTGRES_URL_NON_POOLING: "" },
  ])("rejects contradictory or unsafe credentials without running SQL: %j", async (overrides) => {
    const h = harness({ credentials: JSON.stringify(standardEnvs(overrides)) });
    await expectFailure(h, "credential_envelope");
    expect(h.runMigrationProcess).not.toHaveBeenCalled();
  });

  it.each(["not-json-" + SECRET, JSON.stringify({ ...standardEnvs(), extra: "x".repeat(65_536) })])(
    "bounds and sanitizes malformed credential input", async (credentials) => {
      const h = harness({ credentials });
      await expectFailure(h, "credential_envelope");
      expect(h.runMigrationProcess).not.toHaveBeenCalled();
    },
  );

  it.each([
    ARGV.slice(1), [...ARGV, "--extra=true"],
    ARGV.with(0, "--expected-branch-id=invalid"),
    ARGV.with(1, `--expected-branch-id=${ID}`),
    ARGV.with(1, "--expected-branch-name=bad\nname"),
    ARGV.with(2, `--expected-branch-ref=${POLICY.productionProjectRef}`),
    ARGV.with(3, "--expected-pg-major=16"),
    ARGV.with(6, "--authorized-disposable-preview-reset=wrong"),
  ])("rejects invalid invocation arguments before I/O", async (argv) => {
    const h = harness();
    expect(() => parseArguments(argv)).toThrow();
    await expectFailure(h, "arguments", { argv });
    expect(h.readCliOutput).not.toHaveBeenCalled();
  });

  it.each([
    { PGHOST: "forbidden" }, { PGPASSWORD: SECRET }, { NODE_OPTIONS: "--no-warnings" },
    { NODE_PATH: "/private/forbidden" }, { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  ])("rejects injected runtime environment before I/O", async (environment) => {
    const h = harness();
    await expectFailure(h, "environment", { environment });
    expect(h.readCliOutput).not.toHaveBeenCalled();
  });

  it("does not forward ambient API/model/CLI tokens to the migration child", async () => {
    const h = harness();
    const environment = { ...h.options.environment, SUPABASE_ACCESS_TOKEN: "sentinel-cli-token", OPENAI_API_KEY: "sentinel-model-key", SUPABASE_SERVICE_ROLE_KEY: "sentinel-ambient-service" };
    await runInvocation({ ...h.options, environment });
    expect(h.readCliOutput.mock.calls[0][1].SUPABASE_ACCESS_TOKEN).toBe(environment.SUPABASE_ACCESS_TOKEN);
    expect(h.runMigrationProcess.mock.calls[0][2]).toEqual(h.options.environment);
  });

  it.each([[1, "cli_version"], [2, "branch_before_credentials"], [3, "read_credentials"], [4, "branch_after_credentials"]])(
    "stops at CLI boundary %i without retries or leaked errors", async (failAt, checkpoint) => {
      const h = harness({ failAt });
      await expectFailure(h, checkpoint);
      expect(h.readCliOutput).toHaveBeenCalledTimes(failAt);
      expect(h.runMigrationProcess).not.toHaveBeenCalled();
    },
  );

  it("rejects CLI version drift before fetching credentials", async () => {
    const h = harness();
    h.readCliOutput.mockResolvedValueOnce("2.116.0");
    await expectFailure(h, "cli_version");
    expect(h.readCliOutput).toHaveBeenCalledOnce();
  });

  it("rejects a different CA before control-plane calls", async () => {
    const h = harness();
    await expectFailure(h, "certificate", { readCertificate: async () => Buffer.from("different") });
    expect(h.readCliOutput).toHaveBeenCalledOnce();
  });

  it("stops on a migration manifest failure before retrieving credentials", async () => {
    const h = harness();
    await expectFailure(h, "manifest", { loadMigrations: async () => { throw new Error(SECRET); } });
    expect(h.readCliOutput).toHaveBeenCalledOnce();
  });

  it("does not retry a failing migration runner", async () => {
    const h = harness();
    h.runMigrationProcess.mockRejectedValueOnce(new Error(SECRET));
    await expectFailure(h, "runner");
    expect(h.runMigrationProcess).toHaveBeenCalledOnce();
  });

  it("wires the default subprocess path through anonymous stdin, never ad-hoc mapping", async () => {
    const h = harness();
    const outputs = ["2.115.0\n", branchList(), JSON.stringify(standardEnvs()), branchList()];
    execFile.mockImplementation((_file, _args, _options, callback) => {
      queueMicrotask(() => callback(null, outputs.shift(), ""));
    });
    const child = new EventEmitter();
    child.stdin = { on: vi.fn(), end: vi.fn(() => queueMicrotask(() => child.emit("close", 0))) };
    spawn.mockReturnValue(child);
    const options = { ...h.options };
    delete options.readCliOutput;
    delete options.runMigrationProcess;
    await runInvocation(options);
    expect(execFile).toHaveBeenCalledTimes(4);
    expect(execFile.mock.calls.every(([file]) => file === "supabase")).toBe(true);
    expect(spawn).toHaveBeenCalledOnce();
    const [binary, argv, spawnOptions] = spawn.mock.calls[0];
    expect(binary).toBe(process.execPath);
    expect(argv[0]).toMatch(/\/communication-note-preview-transactional-migrations\.mjs$/);
    expect(argv.slice(1)).toEqual(ARGV.slice(2));
    expect(JSON.stringify([argv, spawnOptions])).not.toContain(SECRET);
    expect(spawnOptions.stdio).toEqual(["pipe", "inherit", "inherit"]);
    expect(spawnOptions.timeout).toBe(900_000);
    const input = child.stdin.end.mock.calls[0][0];
    expect(extractTarget(input, { expectedBranchRef: REF }).descriptor.projectRef).toBe(REF);
  });

  it("sanitizes a real CLI subprocess failure and never starts the migration child", async () => {
    const h = harness();
    execFile.mockImplementation((_file, _args, _options, callback) => {
      queueMicrotask(() => callback(Object.assign(new Error(SECRET), { stderr: SECRET }), "", SECRET));
    });
    const options = { ...h.options };
    options.readCliOutput = undefined;
    await expectFailure(h, "cli_version", options);
    expect(execFile).toHaveBeenCalledOnce();
    expect(h.runMigrationProcess).not.toHaveBeenCalled();
  });

  it.each(["close", "error", "interrupt"])("fails closed on native runner %s and removes signal handlers", async (mode) => {
    const h = harness();
    const originalHandlers = process.listeners("SIGTERM");
    const child = new EventEmitter();
    child.kill = vi.fn(() => { queueMicrotask(() => child.emit("close", null)); });
    child.stdin = { on: vi.fn(), end: vi.fn(() => {
      queueMicrotask(() => {
        if (mode === "interrupt") {
          const handler = process.listeners("SIGTERM").find((candidate) => !originalHandlers.includes(candidate));
          handler();
        } else if (mode === "error") child.emit("error", new Error(SECRET));
        else child.emit("close", 1);
      });
    }) };
    spawn.mockReturnValue(child);
    const options = { ...h.options };
    delete options.runMigrationProcess;
    const result = runInvocation(options);
    await expect(result).rejects.toMatchObject({ checkpoint: "runner" });
    await result.catch((error) => expect(error.stack).not.toContain(SECRET));
    expect(process.listeners("SIGTERM")).toEqual(originalHandlers);
    expect(spawn).toHaveBeenCalledOnce();
    if (mode === "interrupt") expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
