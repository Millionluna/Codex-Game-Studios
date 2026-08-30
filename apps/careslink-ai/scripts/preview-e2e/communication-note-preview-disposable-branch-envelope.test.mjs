import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_ERROR_CODES as ERRORS,
  COMMUNICATION_NOTE_PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_POLICY as POLICY,
  assertCommunicationNotePreviewDisposableBranchEnvelopeEnvironment,
  createCommunicationNotePreviewDisposableBranchEnvelope,
  parseCommunicationNotePreviewDisposableBranchEnvelopeArguments,
} from "./communication-note-preview-disposable-branch-envelope.mjs";
import {
  extractCommunicationNoteDisposablePreviewResetDatabaseTarget,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";

const BRANCH_REF = "abcdefghijklmnopqrst";
const SECRET = "sentinel-envelope-password-never-log";
const RUNNER_URL = new URL(
  "./communication-note-preview-disposable-branch-envelope.mjs",
  import.meta.url,
);
const REQUIRED_ARGUMENTS = Object.freeze([
  `--ref=${BRANCH_REF}`,
  `--parent-project-ref=${POLICY.productionProjectRef}`,
  "--status=ACTIVE_HEALTHY",
  "--is-default=false",
  "--persistent=false",
  "--with-data=false",
]);

function credentials(overrides = {}) {
  return {
    REF: BRANCH_REF,
    STATUS: "ACTIVE_HEALTHY",
    POSTGRES_URL_NON_POOLING:
      `postgresql://postgres:${SECRET}@db.${BRANCH_REF}.supabase.co:5432/postgres?sslmode=require`,
    POSTGRES_URL:
      `postgresql://postgres.${BRANCH_REF}:${SECRET}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?connect_timeout=10`,
    ...overrides,
  };
}

function cliCredentialsWithoutBranchMetadata(overrides = {}) {
  const canonicalCredentials = credentials();
  return {
    POSTGRES_URL_NON_POOLING:
      canonicalCredentials.POSTGRES_URL_NON_POOLING,
    POSTGRES_URL: canonicalCredentials.POSTGRES_URL,
    DB_URL: `postgresql://postgres:${SECRET}@db.${BRANCH_REF}.supabase.co:5432/postgres`,
    JWT_SECRET: "sentinel-cli-secret-not-forwarded",
    SERVICE_ROLE_KEY: "sentinel-service-role-key-not-forwarded",
    message: "Branch credentials retrieved successfully.",
    ...overrides,
  };
}

function sanitizedEnvironment(overrides = {}) {
  return {
    PATH: process.env.PATH,
    LANG: process.env.LANG,
    ...overrides,
  };
}

function runCli({ args = REQUIRED_ARGUMENTS, input, env = {} }) {
  return spawnSync(process.execPath, [RUNNER_URL.pathname, ...args], {
    input,
    encoding: "utf8",
    env: sanitizedEnvironment(env),
    timeout: 5_000,
  });
}

describe("Communication Note disposable Preview branch envelope", () => {
  it("parses only the exact six non-secret metadata arguments", () => {
    expect(
      parseCommunicationNotePreviewDisposableBranchEnvelopeArguments(
        REQUIRED_ARGUMENTS,
      ),
    ).toEqual({
      ref: BRANCH_REF,
      parentProjectRef: POLICY.productionProjectRef,
      status: "ACTIVE_HEALTHY",
      isDefault: false,
      persistent: false,
      withData: false,
    });
    for (const denied of [
      REQUIRED_ARGUMENTS.slice(0, -1),
      [...REQUIRED_ARGUMENTS, "--extra=false"],
      REQUIRED_ARGUMENTS.with(0, `--ref=${POLICY.productionProjectRef}`),
      REQUIRED_ARGUMENTS.with(1, `--parent-project-ref=${BRANCH_REF}`),
      REQUIRED_ARGUMENTS.with(2, "--status=ACTIVE"),
      REQUIRED_ARGUMENTS.with(3, "--is-default=true"),
      REQUIRED_ARGUMENTS.with(4, "--persistent=true"),
      REQUIRED_ARGUMENTS.with(5, "--with-data=true"),
    ]) {
      expect(() =>
        parseCommunicationNotePreviewDisposableBranchEnvelopeArguments(denied),
      ).toThrow();
    }
  });

  it("cross-binds metadata and credentials into one exact envelope", () => {
    const metadata =
      parseCommunicationNotePreviewDisposableBranchEnvelopeArguments(
        REQUIRED_ARGUMENTS,
      );
    const envelope = createCommunicationNotePreviewDisposableBranchEnvelope(
      JSON.stringify({ data: credentials(), ignored: "control-plane-noise" }),
      metadata,
    );
    expect(Object.keys(envelope)).toEqual(["metadata", "credentials"]);
    expect(envelope.metadata).toEqual({
      ref: BRANCH_REF,
      parent_project_ref: POLICY.productionProjectRef,
      is_default: false,
      persistent: false,
      with_data: false,
      status: "ACTIVE_HEALTHY",
    });
    expect(envelope.credentials).toEqual(credentials());
    const downstreamTarget =
      extractCommunicationNoteDisposablePreviewResetDatabaseTarget(
        JSON.stringify(envelope),
        { expectedBranchRef: BRANCH_REF },
      );
    expect(downstreamTarget.descriptor).toMatchObject({
      projectRef: BRANCH_REF,
      controlPlaneMetadata:
        "DATALESS_NONDEFAULT_NONPERSISTENT_PREVIEW_CROSS_BOUND",
      credentialMaterial: "process_memory_only_single_consumer",
    });
  });

  it("accepts the CLI 2.115 credential shape without ref or status aliases", () => {
    const metadata =
      parseCommunicationNotePreviewDisposableBranchEnvelopeArguments(
        REQUIRED_ARGUMENTS,
      );
    const input = cliCredentialsWithoutBranchMetadata();
    const envelope = createCommunicationNotePreviewDisposableBranchEnvelope(
      JSON.stringify(input),
      metadata,
    );

    expect(envelope.credentials).toEqual(credentials());
    expect(JSON.stringify(envelope)).not.toContain(input.JWT_SECRET);
    expect(JSON.stringify(envelope)).not.toContain(input.SERVICE_ROLE_KEY);
    expect(JSON.stringify(envelope)).not.toContain(input.message);
  });

  it("emits only the canonical envelope on stdout", () => {
    const input = cliCredentialsWithoutBranchMetadata();
    const result = runCli({ input: `${JSON.stringify(input)}\n` });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout);
    expect(Object.keys(output)).toEqual(["metadata", "credentials"]);
    expect(Object.keys(output.metadata)).toEqual([
      "ref",
      "parent_project_ref",
      "is_default",
      "persistent",
      "with_data",
      "status",
    ]);
    expect(Object.keys(output.credentials)).toEqual([
      "REF",
      "STATUS",
      "POSTGRES_URL_NON_POOLING",
      "POSTGRES_URL",
    ]);
    expect(output.credentials).toEqual(credentials());
    expect(result.stdout).not.toContain(input.JWT_SECRET);
    expect(result.stdout).not.toContain(input.SERVICE_ROLE_KEY);
    expect(result.stdout).not.toContain(input.message);
  });

  it("rejects credential ref, status, DSN and Production mismatches", () => {
    for (const input of [
      credentials({ REF: "bcdefghijklmnopqrstu" }),
      credentials({ STATUS: "ACTIVE" }),
      credentials({ ref: "bcdefghijklmnopqrstu" }),
      credentials({ status: "ACTIVE" }),
      credentials({
        POSTGRES_URL_NON_POOLING:
          `postgresql://postgres:${SECRET}@db.${POLICY.productionProjectRef}.supabase.co:5432/postgres?sslmode=require`,
      }),
      credentials({
        POSTGRES_URL:
          `postgresql://postgres.${BRANCH_REF}:different-password@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`,
      }),
    ]) {
      const result = runCli({ input: JSON.stringify(input) });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toMatch(
        /^PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_[A-Z_]+$/,
      );
      expect(result.stderr).not.toContain(SECRET);
    }
  });

  it("rejects bounded-input violations without echoing input", () => {
    for (const input of [
      "not-json-with-sentinel",
      JSON.stringify({ ...credentials(), extra: "x".repeat(70_000) }),
    ]) {
      const result = runCli({ input });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toMatch(
        /^PREVIEW_DISPOSABLE_BRANCH_ENVELOPE_[A-Z_]+$/,
      );
      expect(result.stderr).not.toContain("sentinel");
    }
  });

  it("rejects PostgreSQL and Node injection environment variables", () => {
    for (const environment of [
      { PGHOST: "forbidden" },
      { PGPASSWORD: SECRET },
      { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
      { NODE_OPTIONS: "--no-warnings" },
      { NODE_PATH: "/tmp/forbidden" },
    ]) {
      expect(() =>
        assertCommunicationNotePreviewDisposableBranchEnvelopeEnvironment(
          environment,
        ),
      ).toThrowError(ERRORS.environmentDenied);
    }
    expect(() =>
      assertCommunicationNotePreviewDisposableBranchEnvelopeEnvironment({
        PATH: "/usr/bin",
      }),
    ).not.toThrow();
  });

  it("keeps failures content-free even when stdin contains secrets", () => {
    const result = runCli({
      args: REQUIRED_ARGUMENTS.with(2, "--status=ACTIVE"),
      input: JSON.stringify(credentials()),
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${ERRORS.argumentInvalid}\n`);
    expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
  });
});
