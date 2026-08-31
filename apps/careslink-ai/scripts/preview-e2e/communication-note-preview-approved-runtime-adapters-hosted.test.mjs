import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_FAILURE_STATUSES,
  COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_MANIFEST_PATH,
  COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_TEST_ONLY,
  createCommunicationNotePreviewApprovedRuntimeAdaptersHostedSourceRevision,
  createCommunicationNotePreviewApprovedRuntimeAdaptersHostedChildEnvironment,
  createCommunicationNotePreviewApprovedRuntimeAdaptersHostedDeliveryBinding,
  createCommunicationNotePreviewApprovedRuntimeAdaptersHostedEvidence,
  createCommunicationNotePreviewApprovedRuntimeAdaptersHostedPipeMaterial,
  createCommunicationNotePreviewApprovedRuntimeAdaptersHostedSecretEnvelope,
  parseCommunicationNotePreviewApprovedRuntimeAdaptersHostedArguments,
  readCommunicationNotePreviewApprovedRuntimeAdaptersHostedSourceManifest,
  resolveCommunicationNotePreviewApprovedRuntimeAdaptersHostedPgDriver,
} from "./communication-note-preview-approved-runtime-adapters-hosted.mjs";

const BRANCH_REF = "abcdefghijklmnopqrst";
const CA_SHA256 = "a".repeat(64);
const SOURCE_REVISION_SHA256 = "b".repeat(64);
const PASSWORD = "static-preview-admin-password-sentinel";
const OBSERVED_AT = "2026-08-31T12:00:00.000Z";

function directCandidate() {
  return Object.freeze({
    mode: "direct",
    host: `db.${BRANCH_REF}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: PASSWORD,
  });
}

function commonMaterial(candidate = directCandidate()) {
  return {
    candidate,
    expectedBranchRef: BRANCH_REF,
    tlsRootCertificateSha256: CA_SHA256,
    sourceRevisionSha256: SOURCE_REVISION_SHA256,
    observedAt: OBSERVED_AT,
    password: PASSWORD,
  };
}

describe("Communication Note M1n approved runtime Hosted runner policy", () => {
  it("requires one caller-provided source revision pin", () => {
    expect(
      parseCommunicationNotePreviewApprovedRuntimeAdaptersHostedArguments([
        `--expected-branch-ref=${BRANCH_REF}`,
        `--expected-source-revision-sha256=${SOURCE_REVISION_SHA256}`,
        "--expected-pg-major=17",
        "--ssl-root-cert-path=/tmp/supabase-root-ca.crt",
        `--expected-ssl-root-cert-sha256=${CA_SHA256}`,
      ]),
    ).toEqual({
      expectedBranchRef: BRANCH_REF,
      expectedPostgresMajor: 17,
      sslRootCertPath: "/tmp/supabase-root-ca.crt",
      expectedSslRootCertSha256: CA_SHA256,
      expectedSourceRevisionSha256: SOURCE_REVISION_SHA256,
    });
    expect(() =>
      parseCommunicationNotePreviewApprovedRuntimeAdaptersHostedArguments([
        `--expected-branch-ref=${BRANCH_REF}`,
        "--expected-source-revision-sha256=not-a-sha256",
        "--expected-pg-major=17",
        "--ssl-root-cert-path=/tmp/supabase-root-ca.crt",
        `--expected-ssl-root-cert-sha256=${CA_SHA256}`,
      ])
    ).toThrowError("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  });

  it("builds an exact Direct control-plane observation without embedding the password", () => {
    const material =
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedPipeMaterial(
        commonMaterial(),
      );
    expect(material.config).toMatchObject({
      schemaVersion:
        "config.communication-note-approved-runtime-adapters-hosted.2026-08-31.m1n.v1",
      sourceRevisionSha256: SOURCE_REVISION_SHA256,
      target: {
        source: "SUPABASE_CONTROL_PLANE",
        targetProjectRef: BRANCH_REF,
        parentProjectRef: "adocsnwnslxhxcjgbyee",
        defaultBranch: false,
        persistent: false,
        withData: false,
        postgresMajor: 17,
        projectStatus: "ACTIVE_HEALTHY",
        observedAt: OBSERVED_AT,
        expiresAt: "2026-08-31T12:04:00.000Z",
        endpoint: {
          connectionMode: "DIRECT",
          hostname: `db.${BRANCH_REF}.supabase.co`,
          port: 5432,
          database: "postgres",
          usernameProjectRefSuffix: null,
        },
      },
      tlsRootCertificateSha256: CA_SHA256,
      managementUser: "postgres",
      credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
      sourceExpiresAt: null,
      sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
      deliveryIssuedAt: OBSERVED_AT,
      deliveryExpiresAt: "2026-08-31T12:01:00.000Z",
      rawDsnPresent: false,
    });
    expect(material.config.target.controlPlaneEvidenceSha256).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(material.config.secretEnvelopeBindingSha256).toBe(
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedDeliveryBinding(
        material.config,
      ),
    );
    expect(JSON.stringify(material.config)).not.toContain(PASSWORD);
    expect(material.configPayload.toString("utf8")).not.toContain(PASSWORD);
    expect(Object.isFrozen(material.config)).toBe(true);
  });

  it("builds the exact Session Pooler 5432 endpoint and username suffix", () => {
    const candidate = Object.freeze({
      mode: "session_pooler",
      host: "aws-0-ap-southeast-2.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      user: `postgres.${BRANCH_REF}`,
      password: PASSWORD,
    });
    const material =
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedPipeMaterial(
        commonMaterial(candidate),
      );
    expect(material.config.target.endpoint).toEqual({
      connectionMode: "SUPAVISOR_SESSION",
      hostname: candidate.host,
      port: 5432,
      database: "postgres",
      usernameProjectRefSuffix: BRANCH_REF,
    });
    expect(material.config.managementUser).toBe(`postgres.${BRANCH_REF}`);
  });

  it("frames the static password as one bounded binary delivery", () => {
    const binding = "c".repeat(64);
    const envelope =
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedSecretEnvelope(
        PASSWORD,
        binding,
      );
    expect(envelope.subarray(0, 8).toString("ascii")).toBe("CLM1NSEC");
    expect(envelope.readUInt8(8)).toBe(1);
    expect(envelope.subarray(9, 41).toString("hex")).toBe(binding);
    expect(envelope.readUInt16BE(41)).toBe(Buffer.byteLength(PASSWORD));
    expect(envelope.subarray(43).toString("utf8")).toBe(PASSWORD);
    expect(() =>
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedSecretEnvelope(
        `postgresql://postgres:${PASSWORD}@forbidden`,
        binding,
      )
    ).toThrowError("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  });

  it("keeps credentials and unsafe Node/PG settings out of the child environment", () => {
    const environment =
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedChildEnvironment(
        {
          PATH: "/usr/bin",
          LANG: "en_AU.UTF-8",
          PGPASSWORD: PASSWORD,
          DATABASE_URL: `postgresql://postgres:${PASSWORD}@forbidden`,
          SUPABASE_DB_PASSWORD: PASSWORD,
          SUPABASE_ACCESS_TOKEN: PASSWORD,
          NODE_OPTIONS: "--import=/tmp/forbidden.mjs",
          NODE_PATH: "/tmp/forbidden",
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
          SSL_CERT_FILE: "/tmp/forbidden.crt",
        },
      );
    expect(environment).toEqual({
      PATH: "/usr/bin",
      LANG: "en_AU.UTF-8",
      CARESLINK_V1_M1N_HOSTED_LIVE_ENABLED: "1",
      CARESLINK_V1_M1N_HOSTED_LIVE_CONFIG_FD: "3",
      CARESLINK_V1_M1N_HOSTED_LIVE_CA_FD: "4",
      CARESLINK_V1_M1N_HOSTED_LIVE_SECRET_FD: "5",
      CARESLINK_V1_M1N_HOSTED_LIVE_STATUS_FD: "6",
    });
    expect(JSON.stringify(environment)).not.toContain(PASSWORD);
  });

  it("locks truthful content-free source-only evidence", () => {
    const evidence =
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedEvidence(
        "DIRECT",
      );
    expect(evidence).toMatchObject({
      ok: true,
      postgresMajor: 17,
      actualPgPackageVersion: "8.23.0",
      actualConnectionMode: "DIRECT",
      m1mCompositionDriven: true,
      callerProvidedSourceRevisionPinVerified: true,
      sourceManifestValidated: true,
      sourceRevisionTransitiveClosureAttested: false,
      managementCredentialClass:
        "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
      deliveryTransport: "ANONYMOUS_FD_SINGLE_READ",
      underlyingCredentialShortLived: false,
      underlyingCredentialExpiryAttested: false,
      rotationTested: false,
      abortPathLiveTested: false,
      timeoutPathLiveTested: false,
      processMemoryZeroizationAttested: false,
      rawCredentialMaterialInEvidence: false,
      rawCredentialMaterialInDurableLedger: false,
      rawCredentialMaterialInProcessDuringRun: true,
      credentialVerifierHashOnlyCount: 1,
      branchDeletionVerifiedByRunner: false,
      callerMustDeleteBranchAfterRun: true,
      nonSuccessRequiresBranchDeletion: true,
      activationApproved: false,
      ready: false,
    });
    expect(JSON.stringify(evidence)).not.toContain(BRANCH_REF);
    expect(JSON.stringify(evidence)).not.toContain(PASSWORD);
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it("keeps the fixed child status allowlist content-free", () => {
    expect(
      COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_FAILURE_STATUSES,
    ).toHaveLength(11);
    expect(
      COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_FAILURE_STATUSES
        .every((status) =>
          status.startsWith("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_")
        ),
    ).toBe(true);
    expect(
      createHash("sha256")
        .update(
          COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_FAILURE_STATUSES
            .join("\n"),
        )
        .digest("hex"),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("pins one canonical manifest, all migrations and the actual pg package", async () => {
    const appDirectory = fileURLToPath(new URL("../../", import.meta.url));
    const manifest =
      await readCommunicationNotePreviewApprovedRuntimeAdaptersHostedSourceManifest(
        appDirectory,
      );
    expect(manifest.paths).toEqual([...manifest.paths].sort());
    expect(new Set(manifest.paths).size).toBe(manifest.paths.length);
    expect(manifest.paths).toContain("pnpm-lock.yaml");
    expect(manifest.paths).toContain("tsconfig.json");
    expect(manifest.paths).not.toContain("package-lock.json");
    expect(manifest.migrationVersions).toHaveLength(40);
    expect(manifest.migrationVersions.every((version) => /^\d{14}$/.test(version)))
      .toBe(true);

    const independentDigest = createHash("sha256");
    const manifestBytes = await readFile(join(
      appDirectory,
      COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_MANIFEST_PATH,
    ));
    independentDigest.update(
      COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_SOURCE_MANIFEST_PATH,
      "utf8",
    );
    independentDigest.update("\0", "utf8");
    independentDigest.update(manifestBytes);
    independentDigest.update("\0", "utf8");
    for (const relativePath of manifest.paths) {
      independentDigest.update(relativePath, "utf8");
      independentDigest.update("\0", "utf8");
      independentDigest.update(await readFile(join(appDirectory, relativePath)));
      independentDigest.update("\0", "utf8");
    }
    expect(
      await createCommunicationNotePreviewApprovedRuntimeAdaptersHostedSourceRevision(
        appDirectory,
      ),
    ).toBe(independentDigest.digest("hex"));
    const pgDriver =
      resolveCommunicationNotePreviewApprovedRuntimeAdaptersHostedPgDriver();
    expect(pgDriver).toMatchObject({ version: "8.23.0" });
    const pgNamespace = await import(pgDriver.entryUrl);
    expect(typeof (pgNamespace.Client ?? pgNamespace.default?.Client)).toBe(
      "function",
    );
  });

  it("passes the exact ordered 40-version migration manifest to preflight", async () => {
    const appDirectory = fileURLToPath(new URL("../../", import.meta.url));
    const manifest =
      await readCommunicationNotePreviewApprovedRuntimeAdaptersHostedSourceManifest(
        appDirectory,
      );
    const calls = [];
    await COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_TEST_ONLY
      .verifyPreflight({
        async query(sql, values) {
          calls.push({ sql, values });
          return {
            rowCount: 1,
            rows: [{
              identity_ok: true,
              database_ok: true,
              application_ok: true,
              postgres_ok: true,
              row_security_ok: true,
              broker_installed: true,
              migrations_ok: true,
              broker_empty: true,
              generation_empty: true,
              runtime_roles_empty: true,
            }],
          };
        },
      }, manifest.migrationVersions);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("array_agg");
    expect(calls[0].values[1]).toEqual(manifest.migrationVersions);
  });

  it("finalizes and inspects every acquisition before an independent residue check", async () => {
    const activeDigest = "1".repeat(64);
    const revokedDigest = "2".repeat(64);
    const calls = [];
    const admin = {
      async query(sql, values = []) {
        calls.push({ sql, values });
        if (sql.includes("select acquisition_digest, state")) {
          return {
            rowCount: 2,
            rows: [
              { acquisition_digest: activeDigest, state: "ACTIVE" },
              { acquisition_digest: revokedDigest, state: "REVOKED" },
            ],
          };
        }
        if (sql.includes(".inspect(")) {
          return {
            rowCount: 1,
            rows: [{ data: { status: "REVOKED_ATTESTED" } }],
          };
        }
        if (sql.includes("acquisitions_revoked")) {
          return {
            rowCount: 1,
            rows: [{
              acquisitions_revoked: true,
              roles_absent: true,
              sessions_absent: true,
              memberships_absent: true,
              api_privilege_count: 0,
              verifier_state_valid: true,
            }],
          };
        }
        return { rowCount: 1, rows: [{}] };
      },
    };
    await COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_TEST_ONLY
      .cleanupAllAcquisitions(admin);
    await COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_TEST_ONLY
      .verifyCleanupResidueAbsent(admin);
    expect(calls.filter(({ sql }) => sql.includes(".tombstone(")))
      .toHaveLength(1);
    expect(calls.filter(({ sql }) => sql.includes(".finalize(")))
      .toHaveLength(2);
    expect(calls.filter(({ sql }) => sql.includes(".inspect(")))
      .toHaveLength(2);
    expect(calls.at(-1).sql).toContain("acquisitions_revoked");
    expect(calls.at(-1).sql).toContain("reported_session_disposition = 'NOT_ACQUIRED'");
    expect(calls.at(-1).sql).toContain("reported_session_disposition = 'DESTROYED'");
    expect(calls.at(-1).sql).toContain("verifier_state_valid");
  });

  it("requires one issued and revoked verifier hash-only tombstone on success", async () => {
    const row = {
      acquisition_ok: true,
      roles_absent: true,
      sessions_absent: true,
      memberships_absent: true,
      api_privilege_count: 0,
      verifier_hash_only_count: 1,
      ledger_counts: [1, 0, 1, 1, 1, 1],
    };
    await expect(
      COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_TEST_ONLY
        .verifyPostcondition({
          async query(sql) {
            expect(sql).toContain("credential_verifier_sha256 ~");
            return { rowCount: 1, rows: [row] };
          },
        }),
    ).resolves.toBeUndefined();
    await expect(
      COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_HOSTED_TEST_ONLY
        .verifyPostcondition({
          async query() {
            return {
              rowCount: 1,
              rows: [{ ...row, verifier_hash_only_count: 0 }],
            };
          },
        }),
    ).rejects.toThrowError(
      "M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_POSTCHECK_FAILED",
    );
  });

  it("rejects Production, transaction-pooler and mismatched secret inputs", () => {
    expect(() =>
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedPipeMaterial({
        ...commonMaterial(),
        expectedBranchRef: "adocsnwnslxhxcjgbyee",
      })
    ).toThrowError("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
    expect(() =>
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedPipeMaterial({
        ...commonMaterial({
          ...directCandidate(),
          mode: "session_pooler",
          host: "aws-0-ap-southeast-2.pooler.supabase.com",
          port: 6543,
          user: `postgres.${BRANCH_REF}`,
        }),
      })
    ).toThrowError("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
    expect(() =>
      createCommunicationNotePreviewApprovedRuntimeAdaptersHostedPipeMaterial({
        ...commonMaterial(),
        password: "different-password-sentinel",
      })
    ).toThrowError("M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_ARGUMENT_INVALID");
  });
});
