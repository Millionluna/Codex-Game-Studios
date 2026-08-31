import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CommunicationNotePreviewHostedChildChannelError,
  createCommunicationNotePreviewHostedChildEnvironment,
  parseCommunicationNotePreviewHostedChildStatus,
  runCommunicationNotePreviewHostedChild,
} from "./communication-note-preview-hosted-child-channel.mjs";

const SUCCESS_STATUS = "HOSTED_CHILD_TEST_PASSED";
const FAILURE_STATUS = "HOSTED_CHILD_TEST_FIXED_FAILURE";
const FALLBACK_STATUS = "HOSTED_CHILD_TEST_FAILED";
const PIPE_FAILURE_STATUS = "HOSTED_CHILD_TEST_PIPE_FAILED";
const MAXIMUM_STATUS_BYTES = 128;

const LEGACY_INPUT_BINDINGS = Object.freeze([
  Object.freeze({
    environmentKey: "CARESLINK_TEST_CONFIG_FD",
    fd: 3,
  }),
]);
const LEGACY_STATUS_BINDING = Object.freeze({
  environmentKey: "CARESLINK_TEST_STATUS_FD",
  fd: 4,
});

describe("Communication Note hosted child channel", () => {
  it("keeps only the allowlisted base environment and numeric FD bindings", () => {
    const environment = createCommunicationNotePreviewHostedChildEnvironment({
      baseEnvironment: {
        PATH: "/usr/bin",
        TMPDIR: "/tmp/channel-test",
        CI: "1",
        DATABASE_URL: "forbidden-secret",
        NODE_OPTIONS: "--import=/tmp/forbidden.mjs",
        SUPABASE_DB_PASSWORD: "forbidden-password",
      },
      enableEnvironmentKey: "CARESLINK_TEST_ENABLED",
      inputPipeBindings: Object.freeze([
        Object.freeze({
          environmentKey: "CARESLINK_TEST_CONFIG_FD",
          fd: 3,
        }),
        Object.freeze({
          environmentKey: "CARESLINK_TEST_CA_FD",
          fd: 4,
        }),
        Object.freeze({
          environmentKey: "CARESLINK_TEST_PASSWORD_FD",
          fd: 5,
        }),
      ]),
      statusPipeBinding: Object.freeze({
        environmentKey: "CARESLINK_TEST_STATUS_FD",
        fd: 6,
      }),
    });

    expect(environment).toEqual({
      PATH: "/usr/bin",
      TMPDIR: "/tmp/channel-test",
      CI: "1",
      CARESLINK_TEST_ENABLED: "1",
      CARESLINK_TEST_CONFIG_FD: "3",
      CARESLINK_TEST_CA_FD: "4",
      CARESLINK_TEST_PASSWORD_FD: "5",
      CARESLINK_TEST_STATUS_FD: "6",
    });
    expect(Object.getPrototypeOf(environment)).toBeNull();
    expect(Object.isFrozen(environment)).toBe(true);
    expect(JSON.stringify(environment)).not.toContain("forbidden-secret");
    expect(JSON.stringify(environment)).not.toContain("forbidden-password");
  });

  it("accepts only one bounded success or allowlisted fixed failure", () => {
    const parse = (value) =>
      parseCommunicationNotePreviewHostedChildStatus({
        value,
        successStatus: SUCCESS_STATUS,
        failureStatuses: new Set([FAILURE_STATUS]),
        fallbackStatus: FALLBACK_STATUS,
        maximumBytes: MAXIMUM_STATUS_BYTES,
      });

    expect(parse(`${SUCCESS_STATUS}\n`)).toBe(SUCCESS_STATUS);
    expect(parse(`${FAILURE_STATUS}\n`)).toBe(FAILURE_STATUS);
    expect(parse("UNRECOGNIZED\n")).toBe(FALLBACK_STATUS);
    expect(parse(SUCCESS_STATUS)).toBe(FALLBACK_STATUS);
    expect(parse(`${SUCCESS_STATUS}\nEXTRA\n`)).toBe(FALLBACK_STATUS);
    expect(parse(`${"X".repeat(MAXIMUM_STATUS_BYTES)}\n`)).toBe(
      FALLBACK_STATUS,
    );
  });

  it("delivers config, CA and password on FD3/4/5 with status only on FD6", async () => {
    const certificate = Buffer.from(
      "-----BEGIN CERTIFICATE-----\nchannel-test\n-----END CERTIFICATE-----\n",
      "utf8",
    );
    const password = Buffer.from(
      "static-password-payload-never-env-or-argv",
      "utf8",
    );
    const config = JSON.stringify({
      caSha256: sha256(certificate),
      passwordSha256: sha256(password),
    });
    const environment = createCommunicationNotePreviewHostedChildEnvironment({
      baseEnvironment: baseEnvironment(),
      enableEnvironmentKey: "CARESLINK_TEST_ENABLED",
      inputPipeBindings: Object.freeze([
        Object.freeze({ environmentKey: "CARESLINK_TEST_CONFIG_FD", fd: 3 }),
        Object.freeze({ environmentKey: "CARESLINK_TEST_CA_FD", fd: 4 }),
        Object.freeze({ environmentKey: "CARESLINK_TEST_PASSWORD_FD", fd: 5 }),
      ]),
      statusPipeBinding: Object.freeze({
        environmentKey: "CARESLINK_TEST_STATUS_FD",
        fd: 6,
      }),
    });
    const childSource = [
      'const { createHash } = require("node:crypto");',
      'const { readFileSync, writeFileSync } = require("node:fs");',
      'const config = JSON.parse(readFileSync(3, "utf8"));',
      "const ca = readFileSync(4);",
      "const password = readFileSync(5);",
      'const sha256 = (value) => createHash("sha256").update(value).digest("hex");',
      "const ok = sha256(ca) === config.caSha256 &&",
      "  sha256(password) === config.passwordSha256;",
      "password.fill(0);",
      `writeFileSync(6, ok ? "${SUCCESS_STATUS}\\n" : "${FAILURE_STATUS}\\n");`,
      "process.exitCode = ok ? 0 : 1;",
    ].join("\n");

    try {
      await expect(
        runCommunicationNotePreviewHostedChild({
          ...baseRunOptions({
            childSource,
            environment,
            statusFd: 6,
          }),
          inputPipes: Object.freeze([
            Object.freeze({ fd: 3, payload: config, maximumBytes: 1_024 }),
            Object.freeze({
              fd: 4,
              payload: certificate,
              maximumBytes: 65_536,
            }),
            Object.freeze({
              fd: 5,
              payload: password,
              maximumBytes: 1_024,
            }),
          ]),
        }),
      ).resolves.toBe(SUCCESS_STATUS);
      expect(JSON.stringify(environment)).not.toContain(password.toString());
      expect(childSource).not.toContain(password.toString());
    } finally {
      password.fill(0);
      certificate.fill(0);
    }
  });

  it("preserves an allowlisted child failure only when the child exits nonzero", async () => {
    const childSource = [
      'const { readFileSync, writeFileSync } = require("node:fs");',
      "readFileSync(3);",
      `writeFileSync(4, "${FAILURE_STATUS}\\n");`,
      "process.exitCode = 1;",
    ].join("\n");

    await expect(
      runCommunicationNotePreviewHostedChild({
        ...baseRunOptions({ childSource }),
        inputPipes: legacyInputPipes(),
      }),
    ).rejects.toMatchObject({
      code: "HOSTED_CHILD_CHANNEL_FAILED",
      childStatus: FAILURE_STATUS,
    });
  });

  it("maps an oversized status to the fixed fallback", async () => {
    const childSource = [
      'const { readFileSync, writeFileSync } = require("node:fs");',
      "readFileSync(3);",
      `writeFileSync(4, "X".repeat(${MAXIMUM_STATUS_BYTES + 1}));`,
      "process.exitCode = 1;",
    ].join("\n");

    await expect(
      runCommunicationNotePreviewHostedChild({
        ...baseRunOptions({ childSource }),
        inputPipes: legacyInputPipes(),
      }),
    ).rejects.toMatchObject({
      code: "HOSTED_CHILD_CHANNEL_FAILED",
      childStatus: FALLBACK_STATUS,
    });
  });

  it("terminates a child that exceeds the fixed timeout", async () => {
    const childSource = [
      'const { readFileSync } = require("node:fs");',
      "readFileSync(3);",
      "setInterval(() => {}, 1_000);",
    ].join("\n");

    await expect(
      runCommunicationNotePreviewHostedChild({
        ...baseRunOptions({ childSource }),
        inputPipes: legacyInputPipes(),
        timeoutMs: 100,
        killGraceMs: 100,
      }),
    ).rejects.toMatchObject({
      code: "HOSTED_CHILD_CHANNEL_FAILED",
      childStatus: FALLBACK_STATUS,
    });
  });

  it("rejects duplicate FDs and oversized input before spawning", async () => {
    expect(() =>
      createCommunicationNotePreviewHostedChildEnvironment({
        baseEnvironment: baseEnvironment(),
        enableEnvironmentKey: "CARESLINK_TEST_ENABLED",
        inputPipeBindings: LEGACY_INPUT_BINDINGS,
        statusPipeBinding: Object.freeze({
          environmentKey: "CARESLINK_TEST_STATUS_FD",
          fd: 3,
        }),
      }),
    ).toThrowError(CommunicationNotePreviewHostedChildChannelError);

    await expect(
      runCommunicationNotePreviewHostedChild({
        ...baseRunOptions({ childSource: "process.exitCode = 0;" }),
        inputPipes: Object.freeze([
          Object.freeze({
            fd: 3,
            payload: Buffer.alloc(5),
            maximumBytes: 4,
          }),
        ]),
      }),
    ).rejects.toMatchObject({
      code: "HOSTED_CHILD_CHANNEL_ARGUMENT_INVALID",
    });
  });
});

function baseRunOptions({
  childSource,
  environment = legacyEnvironment(),
  statusFd = 4,
}) {
  return {
    executable: process.execPath,
    args: Object.freeze([
      "--input-type=commonjs",
      "--eval",
      childSource,
    ]),
    cwd: process.cwd(),
    environment,
    statusFd,
    successStatus: SUCCESS_STATUS,
    failureStatuses: new Set([FAILURE_STATUS]),
    fallbackStatus: FALLBACK_STATUS,
    pipeFailureStatus: PIPE_FAILURE_STATUS,
    timeoutMs: 2_000,
    killGraceMs: 100,
    maximumStatusBytes: MAXIMUM_STATUS_BYTES,
  };
}

function legacyEnvironment() {
  return createCommunicationNotePreviewHostedChildEnvironment({
    baseEnvironment: baseEnvironment(),
    enableEnvironmentKey: "CARESLINK_TEST_ENABLED",
    inputPipeBindings: LEGACY_INPUT_BINDINGS,
    statusPipeBinding: LEGACY_STATUS_BINDING,
  });
}

function legacyInputPipes() {
  return Object.freeze([
    Object.freeze({
      fd: 3,
      payload: "{}",
      maximumBytes: 1_024,
    }),
  ]);
}

function baseEnvironment() {
  return Object.fromEntries(
    ["PATH", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ"]
      .flatMap((key) =>
        typeof process.env[key] === "string"
          ? [[key, process.env[key]]]
          : [],
      ),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
