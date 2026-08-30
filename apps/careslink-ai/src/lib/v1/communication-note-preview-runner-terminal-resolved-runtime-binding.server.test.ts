import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RESOLVED_RUNNER_TERMINAL_RUNTIME_PORT,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RESOLVED_RUNTIME_DATABASE_TARGET,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_CALLER_CREDENTIAL_RESOLVER,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_CUSTODY_RESOLVER,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BASE_IDENTITY_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BEGIN_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_TIMEOUT_SQL,
  createCaresLinkV1CommunicationNotePreviewReleaseReportDigest,
  createCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort,
  createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort,
  createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  createTestOnlyCaresLinkV1CommunicationNotePreviewExclusiveSessionLease,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver,
} from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
} from "./communication-note-preview-runner-terminal-postgres.server";
import {
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest,
} from "./communication-note-preview-runner-terminal-trust-composition.server";
import {
  createM1ghFailedRunnerTerminalEnvelope,
  createM1ghRunnerTerminalTrustFixture,
  M1GH_TEST_NOW,
} from "./communication-note-preview-runner-terminal-trust-test-fixtures";

vi.mock("server-only", () => ({}));

const NOW = M1GH_TEST_NOW;
let opaqueReferenceSequence = 10;
let runtimeRoleSequence = 0;

describe("Communication Note M1l resolved runner-terminal runtime binding", () => {
  it("resolves custody before a short caller lease and persists with one exact inherited caller capability", async () => {
    const harness = createHarness();

    await expect(harness.port.persist(harness.envelope)).resolves.toEqual(
      harness.databaseResult,
    );
    expect(harness.custodyResolve).toHaveBeenCalledOnce();
    expect(harness.callerAcquire).toHaveBeenCalledOnce();
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.query.mock.calls.map(([sql]) => sql)).toEqual([
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BEGIN_SQL,
      ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_TIMEOUT_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BASE_IDENTITY_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
    ]);
    expect(
      harness.query.mock.calls.some(([sql]) =>
        /\bset\s+(?:local\s+)?role\b/i.test(sql),
      ),
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BASE_IDENTITY_SQL,
    ).toContain("runtime_inbound_membership_count");
    for (const identitySql of [
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BASE_IDENTITY_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL,
    ]) {
      expect(identitySql).toMatch(
        /\.member = pg_catalog\.to_regrole\('postgres'\)/,
      );
      expect(identitySql).toContain("grantor_role.rolsuper");
      expect(identitySql).toMatch(
        /\.grantor <>\s+(?:runtime_)?inbound_membership\.member/,
      );
      expect(identitySql).toContain(".admin_option");
      expect(identitySql).toMatch(
        /not (?:runtime_)?inbound_membership\.inherit_option/,
      );
      expect(identitySql).toMatch(
        /not (?:runtime_)?inbound_membership\.set_option/,
      );
      expect(identitySql).toContain(
        "with candidate_relation as materialized",
      );
      expect(identitySql).toContain(
        "with candidate_sequence as materialized",
      );
      expect(identitySql).toContain("has_any_column_privilege");
    }
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL,
    ).toContain("privilege_record.grantor = executor_role.oid");
    expect(harness.query).toHaveBeenCalledWith(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
      [
        harness.envelope.statement,
        harness.envelope.signature,
        "e".repeat(64),
      ],
      expect.objectContaining({ signal: expect.anything() }),
    );

    const trustRequest = harness.custodyResolve.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(trustRequest).toMatchObject({
      purpose: "RUNNER_TERMINAL_PERSISTENCE",
      observedAt: NOW,
      rawCredentialMaterialPresent: false,
      privateKeyMaterialPresent: false,
    });
    expect(trustRequest.databaseTargetDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(trustRequest).not.toHaveProperty("trustedSigningKey");
    expect(trustRequest).not.toHaveProperty("custodySnapshot");
    const callerRequest = harness.callerAcquire.mock.calls[0][0];
    expect(callerRequest).toMatchObject({
      purpose: "RUNNER_TERMINAL_PERSISTENCE",
      callerRole: "careslink_v1_preview_runner_terminal_caller",
      executorRole: "careslink_v1_preview_runner_terminal_executor",
      rpcNames: [
        "persist_verified_communication_note_preview_runner_terminal",
      ],
      identityHmac: "e".repeat(64),
      credentialReferenceSha256: "5".repeat(64),
      targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
      rawCredentialMaterialPresent: false,
    });
    expect(Object.keys(harness.port).sort()).toEqual([
      "callerRole",
      "persist",
      "purpose",
      "status",
    ]);
    expect(Object.isFrozen(harness.port)).toBe(true);
  });

  it("keeps the M1l inherited-caller policy and every approved resolver/port fail-closed", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY,
    ).toMatchObject({
      status:
        "SOURCE_CONTRACT_WITH_UNAPPLIED_INHERITED_CALLER_BINDING_NOT_APPROVED",
      ready: false,
      transactionIsolation: "READ COMMITTED",
      roleScope: "INHERITED_CALLER_PRIVILEGES_WITHOUT_SET_ROLE",
      runtimeCurrentUserRemainsSessionUser: true,
      runtimeLoginRevokedBeforeUse: true,
      callerMembershipAdmin: false,
      callerMembershipInherit: true,
      callerMembershipSet: false,
      runtimeInboundCreatorMembershipSource:
        "POSTGRESQL_CREATEROLE_AUTOMATIC_CREATOR_EDGE",
      runtimeInboundCreatorMembershipCount: 1,
      runtimeInboundCreatorMembershipMember: "postgres",
      runtimeInboundCreatorMembershipGrantorSuperuser: true,
      runtimeInboundCreatorMembershipGrantorDistinctFromMember: true,
      runtimeInboundCreatorMembershipAdmin: true,
      runtimeInboundCreatorMembershipInherit: false,
      runtimeInboundCreatorMembershipSet: false,
      runtimeInboundCreatorMembershipImmediatelyUsable: false,
      callerOwnedPersistentObjectsAllowed: false,
      resolverSettlementTimeoutMs: 5_000,
      databaseSettlementTimeoutMs: 12_000,
      cleanupSettlementTimeoutMs: 5_000,
      abortSignalRequired: true,
      executorPostureAttestationRequired: true,
      leaseSessionRuntimeAndQuerySingleUseRequired: true,
      strictReleaseBindingRequired: true,
      acquisitionDigestTombstoneRequired: true,
      automaticRetry: false,
      policyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
    });
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_CUSTODY_RESOLVER,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_CALLER_CREDENTIAL_RESOLVER,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RESOLVED_RUNTIME_DATABASE_TARGET,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RESOLVED_RUNNER_TERMINAL_RUNTIME_PORT,
    ).toBeUndefined();
    const fixture = createM1ghRunnerTerminalTrustFixture();
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort({
        capability: "M1L_APPROVED_RESOLVED_RUNTIME_BINDING",
        verifiedAuthorization: fixture.verifiedAuthorization,
        clock: { now: () => NOW },
      }),
    ).toThrowError(fixedFailure());
  });

  it("rejects Production-shaped, default or stale database targets before resolver use", async () => {
    for (const databaseTarget of [
      createDatabaseTarget({ defaultBranch: true }),
      createDatabaseTarget({
        targetProjectRefHmac: "7".repeat(64),
      }),
      createDatabaseTarget({ projectStatus: "PAUSED" }),
    ]) {
      expect(() => createHarness({ databaseTarget })).toThrowError(
        fixedFailure(),
      );
    }

    const stale = createHarness({
      databaseTarget: createDatabaseTarget({
        observedAt: shiftTimestamp(NOW, -5 * 60_000 - 1),
      }),
    });
    await expect(stale.port.persist(stale.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(stale.custodyResolve).not.toHaveBeenCalled();
    expect(stale.callerAcquire).not.toHaveBeenCalled();
  });

  it("rejects expired owner authorization before invoking custody", async () => {
    const authorizationExpiry = shiftTimestamp(NOW, 20 * 60_000);
    const harness = createHarness({
      databaseTarget: createDatabaseTarget({
        observedAt: shiftTimestamp(authorizationExpiry, -30_000),
        expiresAt: shiftTimestamp(authorizationExpiry, 4 * 60_000),
      }),
      clockValues: [authorizationExpiry],
    });
    await expect(harness.port.persist(harness.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(harness.custodyResolve).not.toHaveBeenCalled();
    expect(harness.callerAcquire).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(harness.query).not.toHaveBeenCalled();
  });

  it("never acquires a database credential when trust resolution is stale, mismatched or proxied", async () => {
    for (const mutate of [
      (resolution: Record<string, unknown>) => ({
        ...resolution,
        requestDigest: "0".repeat(64),
      }),
      (resolution: Record<string, unknown>) => ({
        ...resolution,
        expiresAt: NOW,
      }),
      (resolution: Record<string, unknown>) => ({
        ...resolution,
        authenticatedDeliveryEvidenceSha256:
          resolution.completeRevocationEvidenceSha256,
      }),
    ]) {
      const harness = createHarness({ mutateTrustResolution: mutate });
      await expect(harness.port.persist(harness.envelope)).rejects.toEqual(
        fixedFailure(),
      );
      expect(harness.callerAcquire).not.toHaveBeenCalled();
      expect(harness.query).not.toHaveBeenCalled();
    }

    const trap = vi.fn((_target: object, key: PropertyKey) => {
      if (key === "then") return undefined;
      throw new Error("registry secret");
    });
    const harness = createHarness({
      trustResolution: new Proxy({}, { get: trap }),
    });
    await expect(harness.port.persist(harness.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(trap).toHaveBeenCalled();
    expect(trap.mock.calls.every(([, key]) => key === "then")).toBe(true);
    expect(harness.callerAcquire).not.toHaveBeenCalled();
  });

  it("rejects a mismatched or expanded caller lease before any query and still releases it", async () => {
    const release = vi.fn();
    const mismatch = createHarness({
      release,
      mutateLease: (lease) => ({
        ...lease,
        credentialReferenceSha256: "4".repeat(64),
      }),
    });
    await expect(mismatch.port.persist(mismatch.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(mismatch.query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();

    const expandedRelease = vi.fn();
    const expanded = createHarness({
      release: expandedRelease,
      mutateLease: (lease) => ({ ...lease, password: "must-not-enter" }),
    });
    await expect(expanded.port.persist(expanded.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(expanded.query).not.toHaveBeenCalled();
    expect(expandedRelease).toHaveBeenCalledOnce();
  });

  it("rolls back, proves the runtime identity never switches and releases on inherited-caller drift", async () => {
    for (const options of [
      { baseOverrides: { rolcanlogin: true } },
      { baseOverrides: { rolinherit: false } },
      { baseOverrides: { caller_set: true } },
      { baseOverrides: { caller_inherited: false } },
      { baseOverrides: { caller_membership_inherit: false } },
      { baseOverrides: { caller_membership_set: true } },
      { baseOverrides: { direct_membership_count: 2 } },
      { baseOverrides: { runtime_inbound_membership_count: 2 } },
      { baseOverrides: { runtime_inbound_membership_posture: false } },
      { baseOverrides: { base_exact_rpc_executable: false } },
      { baseOverrides: { base_generation_table_privilege_count: 1 } },
      { baseOverrides: { base_generation_sequence_privilege_count: 1 } },
      { baseOverrides: { authenticator_can_set_runtime: true } },
      {
        callerOverrides: {
          current_user: "careslink_v1_preview_runner_terminal_caller",
        },
      },
      { callerOverrides: { runtime_rolinherit: false } },
      { callerOverrides: { caller_set: true } },
      { callerOverrides: { caller_inherited: false } },
      { callerOverrides: { caller_membership_admin: true } },
      { callerOverrides: { caller_membership_inherit: false } },
      { callerOverrides: { caller_membership_set: true } },
      { callerOverrides: { direct_membership_count: 2 } },
      { callerOverrides: { runtime_inbound_membership_count: 2 } },
      { callerOverrides: { runtime_inbound_membership_posture: false } },
      { callerOverrides: { generation_executable_function_count: 2 } },
      { callerOverrides: { caller_outbound_membership_count: 1 } },
      { callerOverrides: { generation_schema_usage: false } },
      { callerOverrides: { exact_rpc_metadata_valid: false } },
      { callerOverrides: { exact_rpc_acl_valid: false } },
      { callerOverrides: { executor_rolcanlogin: true } },
      { callerOverrides: { executor_rolsuper: true } },
      { callerOverrides: { executor_rolinherit: true } },
      { callerOverrides: { executor_rolcreaterole: true } },
      { callerOverrides: { executor_rolcreatedb: true } },
      { callerOverrides: { executor_rolreplication: true } },
      { callerOverrides: { executor_rolbypassrls: true } },
      { callerOverrides: { executor_outbound_membership_count: 1 } },
      { callerOverrides: { executor_inbound_active_membership_count: 1 } },
      { callerOverrides: { service_role_exact_rpc_executable: true } },
      { callerOverrides: { generation_table_privilege_count: 1 } },
      { callerOverrides: { generation_sequence_privilege_count: 1 } },
      { callerOverrides: { authenticated_set: true } },
      { callerOverrides: { authenticated_can_set_runtime: true } },
      { callerOverrides: { backend_pid: 4243 } },
      { callerOverrides: { transaction_id: "9002" } },
      { callerOverrides: { executor_set: true } },
    ]) {
      const harness = createHarness(options);
      await expect(harness.port.persist(harness.envelope)).rejects.toEqual(
        fixedFailure(),
      );
      const sql = harness.query.mock.calls.map(([statement]) => statement);
      expect(sql).toContain(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
      );
      expect(sql.at(-1)).toBe(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
      );
      expect(sql).not.toContain(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL,
      );
      expect(harness.release).toHaveBeenCalledOnce();
    }
  });

  it("re-attests executor posture after the RPC and rolls back concurrent drift", async () => {
    const harness = createHarness({
      postCallerOverrides: { executor_rolsuper: true },
    });
    await expect(harness.port.persist(harness.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    const statements = harness.query.mock.calls.map(([sql]) => sql);
    expect(
      statements.filter(
        (sql) =>
          sql ===
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
      ),
    ).toHaveLength(1);
    expect(statements).toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
    );
    expect(statements).not.toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL,
    );
    expect(statements.at(-1)).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
    );
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it("preserves only fixed domain errors and performs no automatic retry", async () => {
    const harness = createHarness({
      rpcFailure: Object.assign(new Error("database-secret"), {
        code: "P0001",
        message: "RUNNER_TERMINAL_CONFLICT",
      }),
    });
    const operation = harness.port.persist(harness.envelope);
    await expect(operation).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      message:
        "The resolved runner terminal was already recorded with different evidence",
    });
    await expect(operation).rejects.not.toThrow(/secret/i);
    expect(
      harness.query.mock.calls.filter(
        ([sql]) =>
          sql ===
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
      ),
    ).toHaveLength(1);
    expect(harness.query.mock.calls.map(([sql]) => sql)).toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
    );
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it("fails closed when rollback, reset or release cannot prove cleanup", async () => {
    for (const options of [
      { resetFailure: new Error("reset-secret") },
      { releaseFailure: new Error("release-secret") },
      { release: vi.fn(async () => undefined) },
      {
        rpcFailure: new Error("rpc-secret"),
        rollbackFailure: new Error("rollback-secret"),
      },
    ]) {
      const harness = createHarness(options);
      const operation = harness.port.persist(harness.envelope);
      await expect(operation).rejects.toEqual(fixedFailure());
      await expect(operation).rejects.not.toThrow(/secret/i);
      expect(harness.release).toHaveBeenCalledOnce();
    }
  });

  it("requests idempotent cleanup by acquisition digest when acquire loses its response", async () => {
    const harness = createHarness({
      acquireFailure: new Error("acquire-response-lost"),
    });
    await expect(harness.port.persist(harness.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.release.mock.calls[0][0]).toMatchObject({
      acquisitionRequestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      leaseReferenceSha256: null,
      sessionBindingSha256: null,
      runtimeRole: null,
      rawCredentialMaterialPresent: false,
    });
  });

  it("rejects partial cleanup bindings, mixed dispositions and missing tombstone proof", async () => {
    const partial = createHarness({
      mutateLease: (lease) => ({ ...lease, runtimeRole: "malformed" }),
    });
    await expect(partial.port.persist(partial.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(partial.query).not.toHaveBeenCalled();
    expect(partial.release.mock.calls[0][0]).toMatchObject({
      bindingState: "INVALID",
      leaseReferenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sessionBindingSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      runtimeRole: null,
    });

    const mixed = createHarness({
      release: vi.fn(async (request: unknown) =>
        createReleaseReport(request, {
          reportedCredentialDisposition: "NOT_ISSUED",
        }),
      ),
    });
    await expect(mixed.port.persist(mixed.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(mixed.query.mock.calls.map(([sql]) => sql)).toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL,
    );

    const missingTombstone = createHarness({
      release: vi.fn(async (request: unknown) =>
        createReleaseReport(request, {
          acquisitionRequestTombstoned: false,
        }),
      ),
    });
    await expect(
      missingTombstone.port.persist(missingTombstone.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(missingTombstone.query.mock.calls.map(([sql]) => sql)).toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL,
    );
  });

  it("accepts tombstoned NONE cleanup after an issued acquire response is lost", async () => {
    const issuedAcquisitions = new Set<string>();
    const acquire = vi.fn(async (request: unknown) => {
      const digest = String(
        (request as Record<string, unknown>).requestDigest,
      );
      issuedAcquisitions.add(digest);
      throw Object.assign(new Error("acquire-response-lost"), {
        code: "FORBIDDEN",
      });
    });
    const responseLost = createHarness({
      acquire,
      release: vi.fn(async (request: unknown) => {
        const digest = String(
          (request as Record<string, unknown>).acquisitionRequestDigest,
        );
        issuedAcquisitions.delete(digest);
        return createReleaseReport(request, {
          reportedSessionDisposition: "DESTROYED",
          reportedCredentialDisposition: "REVOKED",
        });
      }),
    });
    await expect(
      responseLost.port.persist(responseLost.envelope),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "The resolved runner terminal operation is not authorized",
    });
    expect(responseLost.query).not.toHaveBeenCalled();
    expect(issuedAcquisitions.size).toBe(0);
    expect(responseLost.release.mock.calls[0][0]).toMatchObject({
      bindingState: "NONE",
      leaseReferenceSha256: null,
      sessionBindingSha256: null,
      runtimeRole: null,
    });
  });

  it("models a resolver tombstone that rejects acquire work resuming after cleanup", async () => {
    vi.useFakeTimers();
    try {
      const tombstonedAcquisitions = new Set<string>();
      const issuedAcquisitions = new Set<string>();
      let resumeAcquire!: () => void;
      let reportLateAcquireSettled!: () => void;
      const acquireResumed = new Promise<void>((resolve) => {
        resumeAcquire = resolve;
      });
      const lateAcquireSettled = new Promise<void>((resolve) => {
        reportLateAcquireSettled = resolve;
      });
      let acquisitionRequest!: Record<string, unknown>;
      const acquire = vi.fn(async (request: unknown) => {
        acquisitionRequest = request as Record<string, unknown>;
        const digest = String(acquisitionRequest.requestDigest);
        try {
          await acquireResumed;
          if (tombstonedAcquisitions.has(digest)) {
            throw new Error("acquisition-tombstoned");
          }
          issuedAcquisitions.add(digest);
          return Object.freeze({ unexpectedLateLease: true });
        } finally {
          reportLateAcquireSettled();
        }
      });
      const release = vi.fn(async (request: unknown) => {
        const digest = String(
          (request as Record<string, unknown>).acquisitionRequestDigest,
        );
        tombstonedAcquisitions.add(digest);
        issuedAcquisitions.delete(digest);
        return createReleaseReport(request);
      });
      const harness = createHarness({ acquire, release });
      const operation = harness.port.persist(harness.envelope);
      const rejection = expect(operation).rejects.toEqual(fixedFailure());

      await vi.advanceTimersByTimeAsync(5_000);
      await rejection;
      resumeAcquire();
      await lateAcquireSettled;

      expect(harness.callerAcquire).toHaveBeenCalledOnce();
      expect(harness.release).toHaveBeenCalledOnce();
      expect(harness.release.mock.calls[0][0]).toMatchObject({
        bindingState: "NONE",
        acquisitionRequestDigest: acquisitionRequest.requestDigest,
      });
      expect(
        tombstonedAcquisitions.has(
          String(acquisitionRequest.requestDigest),
        ),
      ).toBe(true);
      expect(issuedAcquisitions.size).toBe(0);
      expect(harness.query).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("rechecks time after each resolver and before database use", async () => {
    const clockRollback = createHarness({
      clockValues: [NOW, shiftTimestamp(NOW, -1)],
    });
    await expect(
      clockRollback.port.persist(clockRollback.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(clockRollback.callerAcquire).not.toHaveBeenCalled();

    const trustExpired = createHarness({
      clockValues: [NOW, shiftTimestamp(NOW, 4 * 60_000)],
    });
    await expect(
      trustExpired.port.persist(trustExpired.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(trustExpired.callerAcquire).not.toHaveBeenCalled();

    const leaseExpired = createHarness({
      clockValues: [NOW, NOW, shiftTimestamp(NOW, 3 * 60_000)],
    });
    await expect(
      leaseExpired.port.persist(leaseExpired.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(leaseExpired.query).not.toHaveBeenCalled();
    expect(leaseExpired.release).toHaveBeenCalledOnce();

    const insufficientWindow = createHarness({
      clockValues: [NOW, NOW, NOW, shiftTimestamp(NOW, 2 * 60_000 + 45_000)],
    });
    await expect(
      insufficientWindow.port.persist(insufficientWindow.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(insufficientWindow.query).not.toHaveBeenCalled();
    expect(insufficientWindow.release).toHaveBeenCalledOnce();
  });

  it("treats BEGIN and COMMIT response loss as uncertain and always attempts rollback", async () => {
    const beginLost = createHarness({ beginFailure: new Error("begin-lost") });
    await expect(beginLost.port.persist(beginLost.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(beginLost.query.mock.calls.map(([sql]) => sql)).toEqual([
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BEGIN_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
    ]);
    expect(beginLost.release).toHaveBeenCalledOnce();

    const commitLost = createHarness({
      commitFailure: new Error("commit-lost"),
    });
    await expect(commitLost.port.persist(commitLost.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    const statements = commitLost.query.mock.calls.map(([sql]) => sql);
    expect(statements).toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
    );
    expect(statements.at(-1)).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
    );
    expect(commitLost.release).toHaveBeenCalledOnce();
  });

  it("bounds custody, acquire and revoke settlement with independent abort signals", async () => {
    vi.useFakeTimers();
    try {
      for (const stage of ["custody", "acquire", "release"] as const) {
        const harness = createHarness({ neverSettleResolver: stage });
        const operation = harness.port.persist(harness.envelope);
        const rejection = expect(operation).rejects.toEqual(fixedFailure());
        await vi.advanceTimersByTimeAsync(5_000);
        await rejection;

        const call =
          stage === "custody"
            ? harness.custodyResolve.mock.calls[0]
            : stage === "acquire"
              ? harness.callerAcquire.mock.calls[0]
              : harness.release.mock.calls[0];
        expect(call?.[1]?.signal.aborted).toBe(true);
        if (stage === "custody") {
          expect(harness.callerAcquire).not.toHaveBeenCalled();
          expect(harness.release).not.toHaveBeenCalled();
        } else {
          expect(harness.release).toHaveBeenCalledOnce();
        }
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("bounds database ambiguity and continues rollback, reset and revoke", async () => {
    vi.useFakeTimers();
    try {
      for (const sql of [
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BEGIN_SQL,
        ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_TIMEOUT_SQL,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BASE_IDENTITY_SQL,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL,
      ]) {
        const harness = createHarness({ queryNeverSettlesAt: sql });
        const operation = harness.port.persist(harness.envelope);
        const rejection = expect(operation).rejects.toEqual(fixedFailure());
        await vi.advanceTimersByTimeAsync(12_000);
        await rejection;

        const matchingCalls = harness.query.mock.calls.filter(
          ([statement]) => statement === sql,
        );
        expect(matchingCalls).toHaveLength(1);
        expect(matchingCalls[0]?.[2]?.signal.aborted).toBe(true);
        const statements = harness.query.mock.calls.map(([statement]) =>
          statement,
        );
        expect(statements).toContain(
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
        );
        expect(statements.at(-1)).toBe(
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
        );
        expect(harness.release).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("bounds rollback and reset independently without skipping later cleanup", async () => {
    vi.useFakeTimers();
    try {
      for (const cleanupSql of [
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
      ]) {
        const harness = createHarness({
          beginFailure: new Error("begin-response-lost"),
          queryNeverSettlesAt: cleanupSql,
        });
        const operation = harness.port.persist(harness.envelope);
        const rejection = expect(operation).rejects.toEqual(fixedFailure());
        await vi.advanceTimersByTimeAsync(5_000);
        await rejection;

        const cleanupCall = harness.query.mock.calls.find(
          ([statement]) => statement === cleanupSql,
        );
        expect(cleanupCall?.[2]?.signal.aborted).toBe(true);
        expect(harness.query.mock.calls.map(([statement]) => statement)).toContain(
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
        );
        expect(harness.release).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("requires a normalized rows-only query adapter and consumes each lease once", async () => {
    const rawPgResult = createHarness({ rawBeginResult: true });
    await expect(rawPgResult.port.persist(rawPgResult.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(rawPgResult.query.mock.calls.map(([sql]) => sql)).toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
    );

    const replay = createHarness();
    await expect(replay.port.persist(replay.envelope)).resolves.toEqual(
      replay.databaseResult,
    );
    const queryCount = replay.query.mock.calls.length;
    await expect(replay.port.persist(replay.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(replay.query).toHaveBeenCalledTimes(queryCount);
    expect(replay.release).toHaveBeenCalledTimes(2);
  });

  it("atomically rejects cross-port lease, session, runtime and query reuse", async () => {
    const leaseReferenceSha256 = nextOpaqueReference();
    const firstLease = createHarness({ leaseReferenceSha256 });
    await expect(firstLease.port.persist(firstLease.envelope)).resolves.toEqual(
      firstLease.databaseResult,
    );
    const repeatedLease = createHarness({ leaseReferenceSha256 });
    await expect(
      repeatedLease.port.persist(repeatedLease.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(repeatedLease.query).not.toHaveBeenCalled();

    const sessionBindingSha256 = nextOpaqueReference();
    const firstSession = createHarness({ sessionBindingSha256 });
    await expect(
      firstSession.port.persist(firstSession.envelope),
    ).resolves.toEqual(firstSession.databaseResult);
    const repeatedSession = createHarness({ sessionBindingSha256 });
    await expect(
      repeatedSession.port.persist(repeatedSession.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(repeatedSession.query).not.toHaveBeenCalled();

    const runtimeRole = nextRuntimeRole();
    const firstRuntime = createHarness({ runtimeRole });
    await expect(
      firstRuntime.port.persist(firstRuntime.envelope),
    ).resolves.toEqual(firstRuntime.databaseResult);
    const repeatedRuntime = createHarness({ runtimeRole });
    await expect(
      repeatedRuntime.port.persist(repeatedRuntime.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(repeatedRuntime.query).not.toHaveBeenCalled();

    const firstQuery = createHarness();
    await expect(firstQuery.port.persist(firstQuery.envelope)).resolves.toEqual(
      firstQuery.databaseResult,
    );
    const queryCallCount = firstQuery.query.mock.calls.length;
    const repeatedQuery = createHarness({ query: firstQuery.query });
    await expect(
      repeatedQuery.port.persist(repeatedQuery.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(firstQuery.query).toHaveBeenCalledTimes(queryCallCount);

    const concurrentReference = nextOpaqueReference();
    const concurrentA = createHarness({
      leaseReferenceSha256: concurrentReference,
    });
    const concurrentB = createHarness({
      leaseReferenceSha256: concurrentReference,
    });
    const outcomes = await Promise.allSettled([
      concurrentA.port.persist(concurrentA.envelope),
      concurrentB.port.persist(concurrentB.envelope),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(
      concurrentA.query.mock.calls.length + concurrentB.query.mock.calls.length,
    ).toBe(11);
  });

  it("quarantines invalid factory leases before concurrent cleanup can race shared identities", async () => {
    const leaseReferenceSha256 = nextOpaqueReference();
    const sessionBindingSha256 = nextOpaqueReference();
    const runtimeRole = nextRuntimeRole();
    let reportReleaseStarted!: () => void;
    let allowRelease!: () => void;
    const releaseStarted = new Promise<void>((resolve) => {
      reportReleaseStarted = resolve;
    });
    const releaseAllowed = new Promise<void>((resolve) => {
      allowRelease = resolve;
    });
    const invalidRelease = vi.fn(async (request: unknown) => {
      reportReleaseStarted();
      await releaseAllowed;
      return createReleaseReport(request);
    });
    const invalid = createHarness({
      leaseReferenceSha256,
      sessionBindingSha256,
      runtimeRole,
      leaseDescriptorOverrides: {
        credentialReferenceSha256: "4".repeat(64),
      },
      release: invalidRelease,
    });
    const invalidOperation = invalid.port.persist(invalid.envelope);
    const invalidRejection = expect(invalidOperation).rejects.toEqual(
      fixedFailure(),
    );
    await releaseStarted;

    const corrected = createHarness({
      leaseReferenceSha256,
      sessionBindingSha256,
      runtimeRole,
      query: invalid.query,
    });
    await expect(
      corrected.port.persist(corrected.envelope),
    ).rejects.toEqual(fixedFailure());
    expect(invalid.query).not.toHaveBeenCalled();
    expect(corrected.release).toHaveBeenCalledOnce();

    allowRelease();
    await invalidRejection;
    expect(invalidRelease).toHaveBeenCalledOnce();
  });

  it("rejects expanded factories and accessor-backed leases without reading credential material", async () => {
    const fixture = createM1ghRunnerTerminalTrustFixture();
    const publicGetter = vi.fn(() => {
      throw new Error("must-not-read");
    });
    const opaquePublicInput = Object.defineProperty({}, "capability", {
      enumerable: true,
      get: publicGetter,
    });
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort(
        opaquePublicInput,
      ),
    ).toThrowError(fixedFailure());
    expect(publicGetter).not.toHaveBeenCalled();

    expect(() =>
      createCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort({
        capability: "M1L_SOURCE_ONLY_RESOLVED_RUNTIME_BINDING",
        verifiedAuthorization: fixture.verifiedAuthorization,
        databaseTarget: createDatabaseTarget(),
        custodyResolver: { resolve: vi.fn() },
        callerCredentialResolver: { acquire: vi.fn() },
        clock: { now: () => NOW },
        connectionString: "postgres://forbidden",
      }),
    ).toThrowError(fixedFailure());

    const getter = vi.fn(() => {
      throw new Error("password-secret");
    });
    const lease = {
      ...createLease({ requestDigest: "0".repeat(64) }),
    };
    Object.defineProperty(lease, "query", {
      enumerable: true,
      get: getter,
    });
    const harness = createHarness({ lease });
    await expect(harness.port.persist(harness.envelope)).rejects.toEqual(
      fixedFailure(),
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("has no environment, SDK, network or product-runtime importer", () => {
    const sourcePath = new URL(
      "./communication-note-preview-runner-terminal-resolved-runtime-binding.server.ts",
      import.meta.url,
    );
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toMatch(
      /process\.env|fetch\s*\(|from\s+["'](?:openai|@supabase\/|node:(?:http|https|net|tls))[^"']*["']|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_|postgres:\/\//,
    );

    const sourceRoot = join(dirname(fileURLToPath(sourcePath)), "..", "..");
    const productSources = [
      ...readSourceFiles(join(sourceRoot, "app")),
      ...readSourceFiles(join(sourceRoot, "components")),
    ];
    for (const file of productSources) {
      expect(readFileSync(file, "utf8")).not.toContain(
        "communication-note-preview-runner-terminal-resolved-runtime-binding.server",
      );
    }
  });
});

type HarnessOptions = Readonly<{
  databaseTarget?: unknown;
  trustResolution?: unknown;
  mutateTrustResolution?: (
    resolution: Record<string, unknown>,
  ) => unknown;
  lease?: unknown;
  mutateLease?: (lease: Record<string, unknown>) => unknown;
  leaseDescriptorOverrides?: Record<string, unknown>;
  acquire?: ReturnType<typeof vi.fn>;
  release?: ReturnType<typeof vi.fn>;
  query?: ReturnType<typeof vi.fn>;
  runtimeRole?: string;
  leaseReferenceSha256?: string;
  sessionBindingSha256?: string;
  baseOverrides?: Record<string, unknown>;
  callerOverrides?: Record<string, unknown>;
  postCallerOverrides?: Record<string, unknown>;
  rpcFailure?: unknown;
  rollbackFailure?: unknown;
  beginFailure?: unknown;
  commitFailure?: unknown;
  rawBeginResult?: boolean;
  resetFailure?: unknown;
  releaseFailure?: unknown;
  acquireFailure?: unknown;
  neverSettleResolver?: "custody" | "acquire" | "release";
  queryNeverSettlesAt?: string;
  clockValues?: readonly string[];
}>;

function createHarness(options: HarnessOptions = {}) {
  const fixture = createM1ghRunnerTerminalTrustFixture();
  const runtimeRole = options.runtimeRole ?? nextRuntimeRole();
  const envelope = createM1ghFailedRunnerTerminalEnvelope(fixture);
  const databaseResult = Object.freeze({
    created: true,
    runnerTerminalRecorded: true as const,
    continuationEligible: false,
    runnerTerminalDigest:
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest(
        envelope.statement,
      ),
    state: "FAILED" as const,
    recordedAt: NOW,
    status: "RUNNER_TERMINAL_RECORDED" as const,
  });
  const release =
    options.release ??
    vi.fn(async (request: unknown, _context?: { signal: AbortSignal }) => {
      void _context;
      if (options.neverSettleResolver === "release") {
        return new Promise<never>(() => {});
      }
      if (options.releaseFailure) throw options.releaseFailure;
      return createReleaseReport(request);
    });
  let callerIdentityReadCount = 0;
  const query = options.query ?? vi.fn(async (
    sql: string,
    _values?: readonly unknown[],
    _context?: { signal: AbortSignal },
  ) => {
    void _values;
    void _context;
    if (options.queryNeverSettlesAt === sql) {
      return new Promise<never>(() => {});
    }
    if (
      sql ===
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BEGIN_SQL
    ) {
      if (options.beginFailure) throw options.beginFailure;
      if (options.rawBeginResult) {
        return {
          command: "BEGIN",
          rowCount: null,
          oid: null,
          fields: [],
          rows: [],
        };
      }
    }
    if (
      sql ===
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BASE_IDENTITY_SQL
    ) {
      return {
        rows: [{ ...baseIdentityRow(runtimeRole), ...options.baseOverrides }],
      };
    }
    if (
      sql ===
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL
    ) {
      const overrides =
        callerIdentityReadCount === 0
          ? options.callerOverrides
          : (options.postCallerOverrides ?? options.callerOverrides);
      callerIdentityReadCount += 1;
      return {
        rows: [{ ...callerIdentityRow(runtimeRole), ...overrides }],
      };
    }
    if (
      sql === CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL
    ) {
      if (options.rpcFailure) throw options.rpcFailure;
      return { rows: [{ data: databaseResult }] };
    }
    if (
      sql ===
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL &&
      options.commitFailure
    ) {
      throw options.commitFailure;
    }
    if (
      sql ===
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL &&
      options.rollbackFailure
    ) {
      throw options.rollbackFailure;
    }
    if (
      sql ===
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL
    ) {
      if (options.resetFailure) throw options.resetFailure;
      return {
        rows: [{
          current_user: runtimeRole,
          session_user: runtimeRole,
          backend_pid: 4242,
          database_now: NOW,
        }],
      };
    }
    return { rows: [] };
  });
  const custodyResolve = vi.fn(async (
    request: unknown,
    _context?: { signal: AbortSignal },
  ) => {
    void _context;
    if (options.neverSettleResolver === "custody") {
      return new Promise<never>(() => {});
    }
    if (options.trustResolution !== undefined) return options.trustResolution;
    const requestRecord = request as Record<string, unknown>;
    const resolution: Record<string, unknown> = {
      status: "RESOLVED_CUSTODY_NOT_APPROVED",
      requestDigest: requestRecord.requestDigest,
      observedAt: NOW,
      expiresAt: shiftTimestamp(NOW, 4 * 60_000),
      authenticatedDeliveryEvidenceSha256: "6".repeat(64),
      completeRevocationEvidenceSha256: "7".repeat(64),
      registryCandidate: {
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_REGISTRY",
        ...fixture.registryCore,
        registrySnapshotSha256:
          createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest(
            fixture.registryCore,
          ),
      },
      custodySnapshot: fixture.custodySnapshot,
      rawCredentialMaterialPresent: false,
      privateKeyMaterialPresent: false,
    };
    return options.mutateTrustResolution
      ? options.mutateTrustResolution(resolution)
      : resolution;
  });
  const leaseReferenceSha256 =
    options.leaseReferenceSha256 ?? nextOpaqueReference();
  const sessionBindingSha256 =
    options.sessionBindingSha256 ?? nextOpaqueReference();
  const callerAcquire = options.acquire ?? vi.fn(async (
    request: unknown,
    _context?: { signal: AbortSignal },
  ) => {
    void _context;
    if (options.neverSettleResolver === "acquire") {
      return new Promise<never>(() => {});
    }
    if (options.acquireFailure) throw options.acquireFailure;
    if (options.lease !== undefined) return options.lease;
    const requestRecord = request as Record<string, unknown>;
    const lease = createLease({
      requestDigest: String(requestRecord.requestDigest),
      databaseTargetDigest: String(requestRecord.databaseTargetDigest),
      identityHmac: String(requestRecord.identityHmac),
      credentialReferenceSha256: String(
        requestRecord.credentialReferenceSha256,
      ),
      authorizationExpiresAt: String(
        requestRecord.authorizationExpiresAt,
      ),
      leaseReferenceSha256,
      sessionBindingSha256,
      runtimeRole,
      query,
      descriptorOverrides: options.leaseDescriptorOverrides,
    });
    return options.mutateLease ? options.mutateLease(lease) : lease;
  });
  const databaseTarget =
    createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget(
      options.databaseTarget ?? createDatabaseTarget(),
    );
  const custodyResolver =
    createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver({
      capability: "TEST_ONLY_RUNNER_TERMINAL_CUSTODY_RESOLVER",
      resolve: custodyResolve,
    });
  const callerCredentialResolver =
    createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver({
      capability:
        "TEST_ONLY_RUNNER_TERMINAL_CALLER_CREDENTIAL_RESOLVER",
      acquire: callerAcquire,
      revoke: release,
    });
  const clockValues = [...(options.clockValues ?? [NOW])];
  let clockIndex = 0;
  const clock = Object.freeze({
    now: () => {
      const value =
        clockValues[Math.min(clockIndex, clockValues.length - 1)] ?? NOW;
      clockIndex += 1;
      return value;
    },
  });
  const port =
    createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort({
      capability: "TEST_ONLY_M1L_RESOLVED_RUNTIME_BINDING",
      verifiedAuthorization: fixture.verifiedAuthorization,
      databaseTarget,
      custodyResolver,
      callerCredentialResolver,
      clock,
    });
  return {
    port,
    fixture,
    envelope,
    databaseResult,
    custodyResolve,
    callerAcquire,
    query,
    release,
    runtimeRole,
  };
}

function createLease(
  options: Readonly<{
    requestDigest: string;
    databaseTargetDigest?: string;
    identityHmac?: string;
    credentialReferenceSha256?: string;
    authorizationExpiresAt?: string;
    leaseReferenceSha256?: string;
    sessionBindingSha256?: string;
    runtimeRole?: string;
    query?: ReturnType<typeof vi.fn>;
    descriptorOverrides?: Record<string, unknown>;
  }>,
) {
  const descriptor = {
    status: "TEST_ONLY_EXCLUSIVE_SESSION_LEASE_NOT_APPROVED",
    requestDigest: options.requestDigest,
    purpose: "RUNNER_TERMINAL_PERSISTENCE",
    callerRole: "careslink_v1_preview_runner_terminal_caller",
    executorRole: "careslink_v1_preview_runner_terminal_executor",
    rpcNames: [
      "persist_verified_communication_note_preview_runner_terminal",
    ],
    identityHmac: options.identityHmac ?? "e".repeat(64),
    credentialReferenceSha256:
      options.credentialReferenceSha256 ?? "5".repeat(64),
    leaseReferenceSha256:
      options.leaseReferenceSha256 ?? nextOpaqueReference(),
    sessionBindingSha256:
      options.sessionBindingSha256 ?? nextOpaqueReference(),
    runtimeRole: options.runtimeRole ?? nextRuntimeRole(),
    requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE",
    queryResultMode: "NORMALIZED_ROWS_ONLY",
    reuseAllowed: false,
    concurrentUseAllowed: false,
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
    databaseTargetDigest:
      options.databaseTargetDigest ?? "3".repeat(64),
    targetProjectRefHmac: "4".repeat(64),
    productionProjectRefHmac: "7".repeat(64),
    controlPlaneEvidenceSha256: "9".repeat(64),
    databaseName: "postgres",
    postgresMajor: 17,
    authorizationExpiresAt:
      options.authorizationExpiresAt ?? shiftTimestamp(NOW, 20 * 60_000),
    projectStatus: "ACTIVE_HEALTHY",
    tlsMode: "VERIFY_FULL_PINNED_CA",
    tlsRootCertificateSha256: "8".repeat(64),
    issuedAt: shiftTimestamp(NOW, -60_000),
    expiresAt: shiftTimestamp(NOW, 3 * 60_000),
    revokeBy: shiftTimestamp(NOW, 3 * 60_000),
    defaultBranch: false,
    persistent: false,
    withData: false,
    productionExcluded: true,
    rawCredentialMaterialPresent: false,
    ...options.descriptorOverrides,
  };
  return createTestOnlyCaresLinkV1CommunicationNotePreviewExclusiveSessionLease({
    capability: "TEST_ONLY_EXCLUSIVE_SESSION_LEASE",
    descriptor,
    query: options.query ?? vi.fn(),
  });
}

function createDatabaseTarget(
  overrides: Record<string, unknown> = {},
) {
  return {
    status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
    targetProjectRefHmac: "4".repeat(64),
    productionProjectRefHmac: "7".repeat(64),
    controlPlaneEvidenceSha256: "9".repeat(64),
    databaseName: "postgres",
    postgresMajor: 17,
    projectStatus: "ACTIVE_HEALTHY",
    tlsMode: "VERIFY_FULL_PINNED_CA",
    tlsRootCertificateSha256: "8".repeat(64),
    observedAt: shiftTimestamp(NOW, -30_000),
    expiresAt: shiftTimestamp(NOW, 5 * 60_000),
    defaultBranch: false,
    persistent: false,
    withData: false,
    productionExcluded: true,
    rawCredentialMaterialPresent: false,
    ...overrides,
  };
}

function baseIdentityRow(runtimeRole: string) {
  return {
    current_user: runtimeRole,
    session_user: runtimeRole,
    backend_pid: 4242,
    transaction_id: "9001",
    database_now: NOW,
    database_name: "postgres",
    postgres_major: 17,
    transaction_isolation: "read committed",
    rolcanlogin: false,
    rolsuper: false,
    rolinherit: true,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolbypassrls: false,
    rolconnlimit: 1,
    role_valid_until: shiftTimestamp(NOW, 3 * 60_000),
    caller_member: true,
    caller_set: false,
    caller_inherited: true,
    direct_membership_count: 1,
    runtime_inbound_membership_count: 1,
    runtime_inbound_membership_posture: true,
    caller_membership_admin: false,
    caller_membership_inherit: true,
    caller_membership_set: false,
    base_exact_rpc_executable: true,
    base_generation_schema_usage: true,
    base_generation_schema_create: false,
    base_generation_executable_function_count: 1,
    base_generation_table_privilege_count: 0,
    base_generation_sequence_privilege_count: 0,
    executor_set: false,
    authenticator_set: false,
    anon_set: false,
    authenticated_set: false,
    service_role_set: false,
    authenticator_can_set_runtime: false,
    anon_can_set_runtime: false,
    authenticated_can_set_runtime: false,
    service_role_can_set_runtime: false,
  };
}

function callerIdentityRow(runtimeRole: string) {
  return {
    current_user: runtimeRole,
    session_user: runtimeRole,
    backend_pid: 4242,
    transaction_id: "9001",
    database_now: NOW,
    database_name: "postgres",
    postgres_major: 17,
    transaction_isolation: "read committed",
    runtime_rolcanlogin: false,
    runtime_rolsuper: false,
    runtime_rolinherit: true,
    runtime_rolcreaterole: false,
    runtime_rolcreatedb: false,
    runtime_rolreplication: false,
    runtime_rolbypassrls: false,
    runtime_rolconnlimit: 1,
    runtime_role_valid_until: shiftTimestamp(NOW, 3 * 60_000),
    caller_rolcanlogin: false,
    caller_rolsuper: false,
    caller_rolinherit: false,
    caller_rolcreaterole: false,
    caller_rolcreatedb: false,
    caller_rolreplication: false,
    caller_rolbypassrls: false,
    caller_member: true,
    caller_set: false,
    caller_inherited: true,
    direct_membership_count: 1,
    runtime_inbound_membership_count: 1,
    runtime_inbound_membership_posture: true,
    caller_membership_admin: false,
    caller_membership_inherit: true,
    caller_membership_set: false,
    executor_rolcanlogin: false,
    executor_rolsuper: false,
    executor_rolinherit: false,
    executor_rolcreaterole: false,
    executor_rolcreatedb: false,
    executor_rolreplication: false,
    executor_rolbypassrls: false,
    executor_outbound_membership_count: 0,
    executor_inbound_active_membership_count: 0,
    caller_outbound_membership_count: 0,
    non_runtime_inbound_active_membership_count: 0,
    exact_rpc_executable: true,
    generation_schema_usage: true,
    generation_schema_create: false,
    exact_rpc_metadata_valid: true,
    exact_rpc_acl_valid: true,
    authenticator_exact_rpc_executable: false,
    anon_exact_rpc_executable: false,
    authenticated_exact_rpc_executable: false,
    service_role_exact_rpc_executable: false,
    generation_executable_function_count: 1,
    generation_table_privilege_count: 0,
    generation_sequence_privilege_count: 0,
    executor_set: false,
    authenticator_set: false,
    anon_set: false,
    authenticated_set: false,
    service_role_set: false,
    authenticator_can_set_runtime: false,
    anon_can_set_runtime: false,
    authenticated_can_set_runtime: false,
    service_role_can_set_runtime: false,
  };
}

function createReleaseReport(
  request: unknown,
  overrides: Record<string, unknown> = {},
) {
  const record = request as Record<string, unknown>;
  const core = {
    status: "TEST_ONLY_RELEASE_REPORTED_NOT_APPROVED",
    requestDigest: record.requestDigest,
    acquisitionRequestDigest: record.acquisitionRequestDigest,
    leaseReferenceSha256: record.leaseReferenceSha256,
    sessionBindingSha256: record.sessionBindingSha256,
    runtimeRole: record.runtimeRole,
    reportedAt: NOW,
    reportedSessionDisposition:
      record.leaseReferenceSha256 === null ? "NOT_ACQUIRED" : "DESTROYED",
    reportedCredentialDisposition:
      record.leaseReferenceSha256 === null ? "NOT_ISSUED" : "REVOKED",
    acquisitionRequestTombstoned: true,
    futureIssuanceBlocked: true,
    reusable: false,
    rawCredentialMaterialPresent: false,
    ...overrides,
  };
  return {
    ...core,
    receiptDigest:
      createCaresLinkV1CommunicationNotePreviewReleaseReportDigest(core),
  };
}

function shiftTimestamp(value: string, milliseconds: number) {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

function nextOpaqueReference() {
  opaqueReferenceSequence += 1;
  return opaqueReferenceSequence.toString(16).padStart(64, "0");
}

function nextRuntimeRole() {
  runtimeRoleSequence += 1;
  return `careslink_v1_preview_runner_terminal_runtime_${runtimeRoleSequence
    .toString(16)
    .padStart(16, "0")}`;
}

function fixedFailure() {
  return expect.objectContaining({
    code: "PRODUCT_API_DISABLED",
    message:
      "Communication Note resolved runner terminal runtime binding is unavailable",
  });
}

function readSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return readSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
