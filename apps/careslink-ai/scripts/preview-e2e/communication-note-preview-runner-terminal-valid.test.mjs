import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createCommunicationNotePreviewRunnerTerminalHostedChildEnvironment,
  createCommunicationNotePreviewRunnerTerminalHostedPipeConfig,
} from "./communication-note-preview-runner-terminal-valid.mjs";

const BRANCH_REF = "abcdefghijklmnopqrst";
const RUNTIME_ROLE =
  "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef";
const ADMIN_PASSWORD = "admin-password-sentinel-000000000001";
const RUNTIME_PASSWORD = "runtime-password-sentinel-0000000002";
const COMMON = Object.freeze({
  expectedBranchRef: BRANCH_REF,
  expectedPostgresMajor: 17,
  runtimeRole: RUNTIME_ROLE,
  runtimePassword: RUNTIME_PASSWORD,
  sslRootCertPath: "/tmp/supabase-root-ca.crt",
  expectedSslRootCertSha256: "a".repeat(64),
});

describe("Communication Note valid signed terminal one-shot runner policy", () => {
  it("builds split direct connection fields with isolated runtime credentials", () => {
    const config = createCommunicationNotePreviewRunnerTerminalHostedPipeConfig({
      ...COMMON,
      candidate: Object.freeze({
        mode: "direct",
        host: `db.${BRANCH_REF}.supabase.co`,
        port: 5432,
        database: "postgres",
        user: "postgres",
        password: ADMIN_PASSWORD,
      }),
    });

    expect(config).toMatchObject({
      databaseHost: `db.${BRANCH_REF}.supabase.co`,
      databasePort: 5432,
      databaseName: "postgres",
      adminDatabaseUser: "postgres",
      adminDatabasePassword: ADMIN_PASSWORD,
      runtimeDatabaseUser: RUNTIME_ROLE,
      runtimeDatabasePassword: RUNTIME_PASSWORD,
    });
    expect(Object.keys(config)).not.toContain("connectionString");
    expect(JSON.stringify(config)).not.toContain("sslmode");
  });

  it("derives only the exact session-pooler runtime user", () => {
    const config = createCommunicationNotePreviewRunnerTerminalHostedPipeConfig({
      ...COMMON,
      candidate: Object.freeze({
        mode: "session_pooler",
        host: "aws-0-ap-southeast-2.pooler.supabase.com",
        port: 5432,
        database: "postgres",
        user: `postgres.${BRANCH_REF}`,
        password: ADMIN_PASSWORD,
      }),
    });

    expect(config.runtimeDatabaseUser).toBe(`${RUNTIME_ROLE}.${BRANCH_REF}`);
    expect(config.runtimeDatabasePassword).toBe(RUNTIME_PASSWORD);
  });

  it("rejects Production and a reused management password", () => {
    const candidate = Object.freeze({
      mode: "direct",
      host: `db.${BRANCH_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: ADMIN_PASSWORD,
    });
    expect(() =>
      createCommunicationNotePreviewRunnerTerminalHostedPipeConfig({
        ...COMMON,
        candidate,
        expectedBranchRef: "adocsnwnslxhxcjgbyee",
      }),
    ).toThrowError("RUNNER_TERMINAL_VALID_ARGUMENT_INVALID");
    expect(() =>
      createCommunicationNotePreviewRunnerTerminalHostedPipeConfig({
        ...COMMON,
        candidate,
        runtimePassword: ADMIN_PASSWORD,
      }),
    ).toThrowError("RUNNER_TERMINAL_VALID_ARGUMENT_INVALID");
  });

  it("passes no credential through the child environment", () => {
    const environment =
      createCommunicationNotePreviewRunnerTerminalHostedChildEnvironment({
        PATH: "/usr/bin",
        PGHOST: "forbidden",
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        NODE_OPTIONS: "--import=/tmp/forbidden.mjs",
        NODE_PATH: "/tmp/forbidden",
        DATABASE_URL: `postgresql://postgres:${ADMIN_PASSWORD}@forbidden`,
        SUPABASE_DB_PASSWORD: ADMIN_PASSWORD,
        CARESLINK_V1_M1GH_HOSTED_ADMIN_DATABASE_PASSWORD: ADMIN_PASSWORD,
      });

    expect(environment).toEqual({
      PATH: "/usr/bin",
      CARESLINK_V1_M1GH_HOSTED_LIVE_ENABLED: "1",
      CARESLINK_V1_M1GH_HOSTED_LIVE_CONFIG_FD: "3",
    });
    expect(JSON.stringify(environment)).not.toContain(ADMIN_PASSWORD);
    expect(JSON.stringify(environment)).not.toContain(RUNTIME_PASSWORD);
  });

  it("pins the anonymous pipe and failure cleanup in source", () => {
    const runnerSource = readFileSync(new URL(
      "./communication-note-preview-runner-terminal-valid.mjs",
      import.meta.url,
    ), "utf8");
    const liveSource = readFileSync(new URL(
      "../../src/lib/v1/communication-note-preview-runner-terminal-hosted.live.test.ts",
      import.meta.url,
    ), "utf8");
    const quiesceSource = readFileSync(new URL(
      "./communication-note-preview-runner-terminal-identity-quiesce.sql",
      import.meta.url,
    ), "utf8");

    expect(runnerSource).toContain(
      'stdio: ["ignore", "ignore", "ignore", "pipe"]',
    );
    expect(runnerSource).toContain("CHILD_TIMEOUT_MS");
    expect(runnerSource).toContain('configPipe.on("error"');
    expect(quiesceSource).toContain("alter role %I nologin");
    expect(runnerSource).toContain("RUNNER_TERMINAL_VALID_FAILURE_CLEANUP_RESIDUE");
    expect(liveSource).toContain('readFileSync(HOSTED_CONFIG_FD, "utf8")');
    expect(liveSource.includes(["connection", "String"].join(""))).toBe(false);
    expect(liveSource.includes(["ssl", "mode"].join(""))).toBe(false);
  });
});
