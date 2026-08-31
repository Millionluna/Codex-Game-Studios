import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_PREVIEW_RUNTIME_BROKER_HOSTED_TEST_ONLY,
  createCommunicationNotePreviewRuntimeBrokerHostedChildEnvironment,
  createCommunicationNotePreviewRuntimeBrokerHostedEvidence,
  createCommunicationNotePreviewRuntimeBrokerHostedMaterial,
  createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig,
  parseCommunicationNotePreviewRuntimeBrokerHostedChildStatus,
} from "./communication-note-preview-runtime-credential-broker-hosted.mjs";

const BRANCH_REF = "abcdefghijklmnopqrst";
const ADMIN_PASSWORD = "admin-password-sentinel-000000000001";
const SCRAM_VERIFIER =
  "SCRAM-SHA-256$4096:MTIzNDU2Nzg5MDEyMzQ1Ng==$sJ6u1IyfrYqT63VY2khClzaN87dvJ3apQ3E4I4O2oWQ=:GwVFvsYcPy1fka8DIJT3j1k8Vn9iA6Zc4c3z4fQdZfI=";
const CROSS_SCRAM_VERIFIER =
  "SCRAM-SHA-256$4096:QUJDREVGR0hJSktMTU5PUA==$sJ6u1IyfrYqT63VY2khClzaN87dvJ3apQ3E4I4O2oWQ=:GwVFvsYcPy1fka8DIJT3j1k8Vn9iA6Zc4c3z4fQdZfI=";
const MATERIAL = Object.freeze({
  acquisitionDigest: "1".repeat(64),
  credentialVerifierSha256:
    createHash("sha256").update(SCRAM_VERIFIER).digest("hex"),
  leaseReferenceSha256: "2".repeat(64),
  runtimePassword: "runtime-password-sentinel-000000000002",
  runtimeRole:
    "careslink_v1_preview_runner_terminal_runtime_1111111111111111",
  scramVerifier: SCRAM_VERIFIER,
  sessionBindingSha256: "3".repeat(64),
});
const CROSS_DATABASE_MATERIAL = Object.freeze({
  acquisitionDigest: "4".repeat(64),
  credentialVerifierSha256:
    createHash("sha256").update(CROSS_SCRAM_VERIFIER).digest("hex"),
  leaseReferenceSha256: "5".repeat(64),
  runtimePassword: "runtime-password-sentinel-000000000003",
  runtimeRole:
    "careslink_v1_preview_runner_terminal_runtime_4444444444444444",
  scramVerifier: CROSS_SCRAM_VERIFIER,
  sessionBindingSha256: "6".repeat(64),
});
const COMMON = Object.freeze({
  expectedBranchRef: BRANCH_REF,
  expectedPostgresMajor: 17,
  sslRootCertPath: "/tmp/supabase-root-ca.crt",
  expectedSslRootCertSha256: "a".repeat(64),
  material: MATERIAL,
  crossDatabaseMaterial: CROSS_DATABASE_MATERIAL,
});

function directCandidate() {
  return Object.freeze({
    mode: "direct",
    host: `db.${BRANCH_REF}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: ADMIN_PASSWORD,
  });
}

describe("Communication Note M1l Hosted runtime broker runner policy", () => {
  it("creates locally consistent SCRAM material without exposing it in evidence", () => {
    const material = createCommunicationNotePreviewRuntimeBrokerHostedMaterial();
    expect(material.acquisitionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(material.runtimeRole).toBe(
      "careslink_v1_preview_runner_terminal_runtime_" +
        material.acquisitionDigest.slice(0, 16),
    );
    expect(material.runtimePassword).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(material.scramVerifier).toMatch(/^SCRAM-SHA-256[$]4096:/);
    expect(
      createHash("sha256").update(material.scramVerifier).digest("hex"),
    ).toBe(material.credentialVerifierSha256);
    expect(JSON.stringify(createCommunicationNotePreviewRuntimeBrokerHostedEvidence()))
      .not.toContain(material.runtimePassword);
    expect(JSON.stringify(createCommunicationNotePreviewRuntimeBrokerHostedEvidence()))
      .not.toContain(material.scramVerifier);
  });

  it("builds exact split direct fields and formal broker material", () => {
    const config = createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
      ...COMMON,
      candidate: directCandidate(),
    });
    expect(config).toMatchObject({
      acquisitionDigest: MATERIAL.acquisitionDigest,
      adminDatabasePassword: ADMIN_PASSWORD,
      adminDatabaseUser: "postgres",
      databaseHost: `db.${BRANCH_REF}.supabase.co`,
      databaseName: "postgres",
      databasePort: 5432,
      expectedPostgresMajor: 17,
      runtimeApplicationName:
        "careslink-preview-runtime-credential-broker-runtime",
      crossDatabaseAcquisitionDigest:
        CROSS_DATABASE_MATERIAL.acquisitionDigest,
      crossDatabaseRuntimeDatabaseUser:
        CROSS_DATABASE_MATERIAL.runtimeRole,
      runtimeDatabaseUser: MATERIAL.runtimeRole,
      runtimeRole: MATERIAL.runtimeRole,
      scramVerifier: MATERIAL.scramVerifier,
    });
    expect(config.databaseTargetDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(config)).not.toContain("connectionString");
    expect(JSON.stringify(config)).not.toContain("sslmode");
  });

  it("derives only the exact Session Pooler runtime username", () => {
    const config = createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
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
    expect(config.runtimeDatabaseUser).toBe(
      `${MATERIAL.runtimeRole}.${BRANCH_REF}`,
    );
    expect(config.crossDatabaseRuntimeDatabaseUser).toBe(
      `${CROSS_DATABASE_MATERIAL.runtimeRole}.${BRANCH_REF}`,
    );
  });

  it("rejects Production, PG16 and inconsistent verifier material", () => {
    expect(() =>
      createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
        ...COMMON,
        candidate: directCandidate(),
        expectedBranchRef: "adocsnwnslxhxcjgbyee",
      }),
    ).toThrowError("RUNTIME_BROKER_HOSTED_ARGUMENT_INVALID");
    expect(() =>
      createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
        ...COMMON,
        candidate: directCandidate(),
        expectedPostgresMajor: 16,
      }),
    ).toThrowError("RUNTIME_BROKER_HOSTED_ARGUMENT_INVALID");
    expect(() =>
      createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
        ...COMMON,
        candidate: directCandidate(),
        material: { ...MATERIAL, credentialVerifierSha256: "f".repeat(64) },
      }),
    ).toThrowError("RUNTIME_BROKER_HOSTED_ARGUMENT_INVALID");
  });

  it("passes credentials only through the anonymous config pipe", () => {
    const environment =
      createCommunicationNotePreviewRuntimeBrokerHostedChildEnvironment({
        PATH: "/usr/bin",
        PGHOST: "forbidden",
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        NODE_OPTIONS: "--import=/tmp/forbidden.mjs",
        NODE_PATH: "/tmp/forbidden",
        DATABASE_URL: `postgresql://postgres:${ADMIN_PASSWORD}@forbidden`,
        SUPABASE_DB_PASSWORD: ADMIN_PASSWORD,
      });
    expect(environment).toEqual({
      PATH: "/usr/bin",
      CARESLINK_V1_M1L_HOSTED_LIVE_ENABLED: "1",
      CARESLINK_V1_M1L_HOSTED_LIVE_CONFIG_FD: "3",
      CARESLINK_V1_M1L_HOSTED_LIVE_STATUS_FD: "4",
    });
    expect(JSON.stringify(environment)).not.toContain(ADMIN_PASSWORD);
    expect(JSON.stringify(environment)).not.toContain(MATERIAL.runtimePassword);
  });

  it("locks content-free success evidence", () => {
    const evidence = createCommunicationNotePreviewRuntimeBrokerHostedEvidence();
    expect(evidence).toEqual({
      ok: true,
      gate: "communication-note-runtime-credential-broker-hosted-pg17",
      postgresMajor: 17,
      terminalState: "ACCEPTED",
      exactReplayCreated: false,
      validConflictRejected: true,
      runtimeIdentity: "DIRECT_LOGIN_INHERITED_CALLER_WITHOUT_SET",
      bindLoginFence: "NOLOGIN",
      crossDatabaseOwnerResidueProof: true,
      acquisitionCount: 2,
      revokedIssuedCount: 2,
      finalLedgerCounts: [1, 0, 1, 1, 1, 1],
      runtimeRoleCount: 0,
      runtimeSessionCount: 0,
      runtimeMembershipCount: 0,
      apiPrivilegeCount: 0,
      credentialVerifierResidueCount: 0,
      temporaryDatabaseCount: 0,
      credentialTransport: "anonymous_fd_pipe_process_memory_only",
      rawCredentialMaterialPresent: false,
    });
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it("accepts one exact bounded fixed child status", () => {
    const diagnostic = [
      ADMIN_PASSWORD,
      "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED",
      MATERIAL.runtimePassword,
    ].join("\n");
    const extracted =
      parseCommunicationNotePreviewRuntimeBrokerHostedChildStatus(diagnostic);
    expect(extracted).toBe("RUNTIME_BROKER_HOSTED_CHILD_FAILED");
    expect(extracted).not.toContain(ADMIN_PASSWORD);
    expect(extracted).not.toContain(MATERIAL.runtimePassword);
    expect(
      parseCommunicationNotePreviewRuntimeBrokerHostedChildStatus(
        "RUNTIME_BROKER_HOSTED_LIVE_PASSED\n",
      ),
    ).toBe("RUNTIME_BROKER_HOSTED_LIVE_PASSED");
    expect(
      parseCommunicationNotePreviewRuntimeBrokerHostedChildStatus(
        "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED\n",
      ),
    ).toBe("RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED");
    for (const code of [
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_OWNER_ATTESTATION_FAILED",
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_OWNER_CREATE_FAILED",
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RESIDUE_ATTESTATION_FAILED",
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RESIDUE_CONNECTION_FAILED",
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_RUNTIME_CLOSE_FAILED",
      "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_TOMBSTONE_ROLLBACK_FAILED",
    ]) {
      expect(
        parseCommunicationNotePreviewRuntimeBrokerHostedChildStatus(`${code}\n`),
      ).toBe(code);
    }
    expect(
      parseCommunicationNotePreviewRuntimeBrokerHostedChildStatus(
        "RUNTIME_BROKER_HOSTED_LIVE_CROSS_DATABASE_PROOF_FAILED\n",
      ),
    ).toBe("RUNTIME_BROKER_HOSTED_CHILD_FAILED");
    expect(
      parseCommunicationNotePreviewRuntimeBrokerHostedChildStatus(
        "RUNTIME_BROKER_HOSTED_LIVE_BIND_FAILED",
      ),
    ).toBe("RUNTIME_BROKER_HOSTED_CHILD_FAILED");
  });

  it("locks the exact PG16/PG17 large-object ACL catalog proof", () => {
    const source = readFileSync(new URL(
      "../../src/lib/v1/communication-note-preview-runtime-credential-broker-hosted.live.test.ts",
      import.meta.url,
    ), "utf8");
    const occurrences = (value) => source.split(value).length - 1;

    expect(source).not.toContain(
      ["has_largeobject", "privilege"].join("_"),
    );
    expect(source).toContain("metadata.lomacl is not null");
    expect(source).toContain("pg_catalog.cardinality(metadata.lomacl) = 2");
    expect(source).toContain("pg_catalog.count(*) = 4");
    expect(source).toContain("pg_catalog.aclexplode(");
    expect(source).toContain("'L'::pg_catalog.\"char\"");
    expect(occurrences("acl.grantee = metadata.lomowner")).toBe(2);
    expect(
      occurrences("acl.grantee = pg_catalog.to_regrole('postgres')"),
    ).toBe(2);
    expect(occurrences("acl.grantor = metadata.lomowner")).toBe(4);
    expect(occurrences("acl.privilege_type = 'SELECT'")).toBe(2);
    expect(occurrences("acl.privilege_type = 'UPDATE'")).toBe(2);
    expect(occurrences("and not acl.is_grantable")).toBe(4);
    expect(source).toContain("and dependency.dbid = (");
    expect(source).toContain(
      "'pg_catalog.pg_largeobject'::pg_catalog.regclass",
    );
    expect(source).toContain("and dependency.objid = metadata.oid");
    expect(source).toContain("and dependency.objsubid = 0");
    expect(source).toContain("as exact_total_owner_dependency");
  });

  it("starts the dedicated default-off Vitest child", () => {
    const require = createRequire(import.meta.url);
    const vitestCli = join(
      dirname(require.resolve("vitest/package.json")),
      "vitest.mjs",
    );
    const appDirectory = fileURLToPath(new URL("../../", import.meta.url));
    const liveTest = fileURLToPath(new URL(
      "../../src/lib/v1/communication-note-preview-runtime-credential-broker-hosted.live.test.ts",
      import.meta.url,
    ));
    const environment = Object.fromEntries(
      ["PATH", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ"]
        .flatMap((key) => typeof process.env[key] === "string"
          ? [[key, process.env[key]]]
          : []),
    );
    const result = spawnSync(
      process.execPath,
      [
        vitestCli,
        "run",
        liveTest,
        "--pool=threads",
        "--maxWorkers=1",
        "--reporter=dot",
      ],
      {
        cwd: appDirectory,
        env: environment,
        encoding: "utf8",
        timeout: 10_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr).toBe(0);
  });

  it(
    "routes the enabled Vitest child past default-off into a bounded failure",
    { timeout: 15_000 },
    async () => {
      const require = createRequire(import.meta.url);
      const vitestCli = join(
        dirname(require.resolve("vitest/package.json")),
        "vitest.mjs",
      );
      const appDirectory = fileURLToPath(new URL("../../", import.meta.url));
      const liveTest = fileURLToPath(new URL(
        "../../src/lib/v1/communication-note-preview-runtime-credential-broker-hosted.live.test.ts",
        import.meta.url,
      ));
      const baseEnvironment = Object.fromEntries(
        ["PATH", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ"]
          .flatMap((key) => typeof process.env[key] === "string"
            ? [[key, process.env[key]]]
            : []),
      );
      const pipeConfig = createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
        ...COMMON,
        candidate: directCandidate(),
        sslRootCertPath: "/dev/null",
      });
      const child = spawn(
        process.execPath,
        [
          vitestCli,
          "run",
          liveTest,
          "--pool=threads",
          "--maxWorkers=1",
          "--reporter=dot",
        ],
        {
          cwd: appDirectory,
          env: createCommunicationNotePreviewRuntimeBrokerHostedChildEnvironment(
            baseEnvironment,
          ),
          shell: false,
          stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
        },
      );
      const configPipe = child.stdio[3];
      const statusPipe = child.stdio[4];
      expect(configPipe).toBeDefined();
      expect(statusPipe).toBeDefined();
      let stdout = "";
      let stderr = "";
      let childStatus = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      statusPipe.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      statusPipe.on("data", (chunk) => {
        childStatus += chunk;
      });
      const exit = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      configPipe.end(JSON.stringify(pipeConfig));
      const result = await exit;
      const diagnostic = `${stdout}\n${stderr}`;
      expect(result).toEqual({ code: 1, signal: null });
      expect(childStatus).toBe("RUNTIME_BROKER_HOSTED_LIVE_TLS_INVALID\n");
      expect(diagnostic).toContain("RUNTIME_BROKER_HOSTED_LIVE_TLS_INVALID");
      expect(diagnostic).not.toContain(
        "stays default-off with anonymous pipe-only credential delivery",
      );
      expect(diagnostic).not.toContain(ADMIN_PASSWORD);
      expect(diagnostic).not.toContain(MATERIAL.runtimePassword);
      expect(diagnostic).not.toContain(CROSS_DATABASE_MATERIAL.runtimePassword);
    },
  );

  it(
    "exercises the shared M1l FD3/FD4 wrapper on a bounded child failure",
    { timeout: 15_000 },
    async () => {
      const baseEnvironment = Object.fromEntries(
        ["PATH", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ"]
          .flatMap((key) => typeof process.env[key] === "string"
            ? [[key, process.env[key]]]
            : []),
      );
      const pipeConfig =
        createCommunicationNotePreviewRuntimeBrokerHostedPipeConfig({
          ...COMMON,
          candidate: directCandidate(),
          sslRootCertPath: "/dev/null",
        });
      await expect(
        COMMUNICATION_NOTE_PREVIEW_RUNTIME_BROKER_HOSTED_TEST_ONLY
          .runHostedChild(pipeConfig, baseEnvironment),
      ).rejects.toThrowError("RUNTIME_BROKER_HOSTED_LIVE_TLS_INVALID");
    },
  );

  it("pins strict envelope, anonymous pipes and cleanup in source", () => {
    const runnerSource = readFileSync(new URL(
      "./communication-note-preview-runtime-credential-broker-hosted.mjs",
      import.meta.url,
    ), "utf8");
    expect(runnerSource).toContain(
      "extractCommunicationNoteDisposablePreviewResetDatabaseTarget",
    );
    expect(runnerSource).toContain("runCommunicationNotePreviewHostedChild");
    expect(runnerSource).toContain("cleanupAcquisition");
    expect(runnerSource).toContain("CHILD_STATUS_MAXIMUM_BYTES");
    expect(runnerSource).toContain("typeof process.env.NODE_OPTIONS");
    expect(runnerSource).toContain("typeof process.env.NODE_PATH");
    expect(runnerSource).not.toContain("--minWorkers");
  });
});
