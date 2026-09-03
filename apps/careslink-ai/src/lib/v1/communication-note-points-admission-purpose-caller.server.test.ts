import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_POSTGRES_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_ADAPTER,
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_VERSION,
  createCaresLinkV1CommunicationNotePointsAdmissionCredentialResolver,
  createCaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget,
  createCaresLinkV1CommunicationNotePointsAdmissionPurposeCallerAdapter,
  createCaresLinkV1CommunicationNotePointsAdmissionPurposeSessionLease,
  type CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver,
  type CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget,
} from "./communication-note-points-admission-purpose-caller.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME,
  type CaresLinkV1CommunicationNotePointsAdmissionInput,
} from "./note-generation-owner-repository.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

const NOW = "2026-09-03T06:00:00.000Z";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const PAYLOAD_ID = "44444444-4444-4444-8444-444444444444";
const PRIVACY_REVIEW_ID = "55555555-5555-4555-8555-555555555555";

let harnessSequence = 0;

afterEach(() => {
  vi.useRealTimers();
});

describe("Communication Note Points admission purpose-caller adapter", () => {
  it("is server-only, default-off and pins the least-privilege session policy", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_ADAPTER,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
    ).toBe("COMMUNICATION_NOTE_POLICY_BOUND_POINTS_ADMISSION");
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
    ).toBe("careslink_v1_generation_points_admission_caller");
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY,
    ).toEqual({
      version:
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_VERSION,
      status: "SOURCE_ADAPTER_NOT_ACTIVATED",
      ready: false,
      deploymentEnvironment: "PREVIEW",
      targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
      purpose:
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
      callerRole:
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
      rpcNames: [
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME,
      ],
      rpcParameterCount: 19,
      database: "postgres",
      postgresMajor: 17,
      allowedConnectionModes: ["DIRECT", "SESSION_POOLER"],
      allowedPort: 5432,
      transactionPoolerAllowed: false,
      tlsMode: "VERIFY_FULL_PINNED_CA",
      purposeCallerLoginAllowed: false,
      runtimeLoginReuseAllowed: false,
      roleActivationMode: "SET_ROLE_TO_NOINHERIT_PURPOSE_CALLER",
      callerMembershipAdmin: false,
      callerMembershipInherit: false,
      callerMembershipSet: true,
      executorMembershipAllowed: false,
      serviceRoleFallbackAllowed: false,
      maximumTargetLifetimeMs: 300_000,
      maximumCredentialLifetimeMs: 90_000,
      minimumCredentialRemainingMs: 25_000,
      resolverSettlementTimeoutMs: 5_000,
      databaseSettlementTimeoutMs: 12_000,
      sessionDestroySettlementTimeoutMs: 5_000,
      credentialRevocationSettlementTimeoutMs: 5_000,
      cleanupSchedulingMarginMs: 3_000,
      sessionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE",
      queryMode: "ONE_ATOMIC_STATEMENT",
      queryResultMode: "NORMALIZED_ROWS_ONLY",
      postQueryFreshnessRequired: true,
      derivedAbortControllerClosedAfterEverySettlement: true,
      destroyReceiptRequiresTerminatedSessionAndNoActiveStatement: true,
      acquisitionDigestTombstoneRequired: true,
      revocationReceiptRequiresAtomicLateIssuanceBlock: true,
      revocationReceiptRequiresNoActiveSessionOrInFlightStatement: true,
      automaticRetry: false,
      rawCredentialMaterialPresent: false,
      policyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY_DIGEST,
    });
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY_DIGEST,
    ).toBe(
      "64364864ff7c256766651e6df4d2ab3bfefcecad185e67a1a88be2a76eb0f085",
    );
    expect(
      Object.isFrozen(
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY,
      ),
    ).toBe(true);

    const source = readFileSync(
      new URL(
        "./communication-note-points-admission-purpose-caller.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(
      /process\.env|from\s+["']pg["']|\bnew\s+Pool\b|postgres(?:ql)?:\/\//,
    );
    expect(source).not.toMatch(/console\.|logger\.|password\s*:/i);
    expect(source).toContain("serviceRoleFallbackAllowed: false");
    expect(source).toContain("transactionPoolerAllowed: false");
  });

  it("executes one exact 19-parameter statement, then destroys and revokes", async () => {
    const harness = createHarness();

    await expect(
      harness.adapter
        .createRepository({ principal: principal(), signal: harness.signal })
        .enqueue(admission()),
    ).resolves.toEqual({
      created: true,
      payloadAccepted: true,
      pointsReserved: true,
      job: {
        jobId: JOB_ID,
        status: "QUEUED",
        noteType: "communication",
        serviceCode: "note.communication.generate",
        attemptCount: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    });

    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(harness.revoke).toHaveBeenCalledTimes(1);
    expect(harness.events).toEqual(["acquire", "query", "destroy", "revoke"]);

    const acquisition = harness.acquire.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(acquisition).toMatchObject({
      deploymentEnvironment: "PREVIEW",
      targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
      purpose:
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
      callerRole:
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
      rpcNames: [CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME],
      rpcParameterCount: 19,
      targetProjectRefHmac: harness.target.targetProjectRefHmac,
      productionProjectRefHmac: harness.target.productionProjectRefHmac,
      connectionMode: "DIRECT",
      port: 5432,
      tlsMode: "VERIFY_FULL_PINNED_CA",
      roleActivationMode: "SET_ROLE_TO_NOINHERIT_PURPOSE_CALLER",
      callerMembershipAdmin: false,
      callerMembershipInherit: false,
      callerMembershipSet: true,
      executorMembershipAllowed: false,
      transactionPoolerAllowed: false,
      serviceRoleFallbackAllowed: false,
      rawCredentialMaterialPresent: false,
    });
    expect(acquisition.requestDigest).toBe(canonicalSha256WithoutKey(
      acquisition,
      "requestDigest",
    ));
    expect(Object.isFrozen(acquisition)).toBe(true);

    const [sql, values, queryContext] = harness.query.mock.calls[0];
    expect(sql).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_POSTGRES_SQL,
    );
    expect(values).toHaveLength(19);
    expect(values).toEqual([
      OWNER_ID,
      SESSION_ID,
      "COOKIE",
      JOB_ID,
      PAYLOAD_ID,
      PRIVACY_REVIEW_ID,
      "en",
      CARESLINK_V1_CONTRACT_VERSION,
      CARESLINK_V1_NOTE_SCHEMA_VERSION,
      "a".repeat(64),
      "b".repeat(64),
      "c".repeat(64),
      "d".repeat(64),
      "2026-09-03T06:30:00.000Z",
      "payload.communication.2026-09-03.v1",
      "e".repeat(64),
      "envelope-aes256-gcm.2026-09-03.v1",
      "f".repeat(64),
      "no-backup.2026-09-03.v1",
    ]);
    expect(queryContext.signal).toBeInstanceOf(AbortSignal);
    expect(queryContext.signal.aborted).toBe(true);

    const revocation = harness.revoke.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(revocation).toMatchObject({
      purpose:
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
      callerRole:
        CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
      acquisitionRequestDigest: acquisition.requestDigest,
      bindingState: "COMPLETE",
      leaseReferenceSha256: harness.leaseDescriptor.leaseReferenceSha256,
      sessionBindingSha256: harness.leaseDescriptor.sessionBindingSha256,
      runtimeRole: harness.leaseDescriptor.runtimeRole,
      rawCredentialMaterialPresent: false,
    });
  });

  it("allows each repository to consume only one fresh session", async () => {
    const harness = createHarness();
    const repository = harness.adapter.createRepository({
      principal: principal(),
      signal: harness.signal,
    });

    await expect(repository.enqueue(admission())).resolves.toBeDefined();
    await expect(repository.enqueue(admission())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
      message: "The Note generation owner repository is unavailable",
    });
    expect(harness.acquire).toHaveBeenCalledTimes(1);
    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(harness.revoke).toHaveBeenCalledTimes(1);
  });

  it("rejects unbranded or expanded target, resolver and adapter capabilities", () => {
    const rawTarget = targetInput();
    const resolver = createResolver({});
    const target = createCaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget(
      rawTarget,
    );
    const clock = { now: () => NOW };

    const invalid: unknown[] = [
      { databaseTarget: rawTarget, credentialResolver: resolver, clock },
      {
        databaseTarget: target,
        credentialResolver: { acquire: vi.fn(), revoke: vi.fn() },
        clock,
      },
      {
        databaseTarget: target,
        credentialResolver: resolver,
        clock,
        serviceRoleKey: "must-not-be-accepted",
      },
    ];
    for (const value of invalid) {
      expect(() =>
        createCaresLinkV1CommunicationNotePointsAdmissionPurposeCallerAdapter(
          value,
        ),
      ).toThrowError(disabledError());
    }

    expect(() =>
      createCaresLinkV1CommunicationNotePointsAdmissionCredentialResolver({
        capability: "RUNNER_TERMINAL_CALLER_CREDENTIAL_RESOLVER",
        acquire: vi.fn(),
        revoke: vi.fn(),
      }),
    ).toThrowError(disabledError());
    expect(() =>
      createCaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget({
        ...rawTarget,
        connectionMode: "TRANSACTION_POOLER",
      }),
    ).toThrowError(disabledError());
  });

  it.each([
    ["wrong purpose", { purpose: "RUNNER_TERMINAL_PERSISTENCE" }],
    ["wrong caller", { callerRole: "service_role" }],
    ["wrong project", { targetProjectRefHmac: hash("other-project") }],
    ["transaction pooler", { connectionMode: "TRANSACTION_POOLER", port: 6543 }],
    ["unverified TLS", { tlsMode: "PREFER" }],
    ["transaction pooling", { transactionPoolerUsed: true }],
    ["prepared statement", { preparedStatementsUsed: true }],
    ["executor membership", { executorMembershipPresent: true }],
    ["service-role fallback", { serviceRoleFallback: true }],
    ["reusable session", { reuseAllowed: true }],
    ["extra secret field", { password: "must-not-be-returned" }],
    [
      "long-lived credential",
      { expiresAt: "2026-09-03T06:02:00.000Z", revokeBy: "2026-09-03T06:02:00.000Z" },
    ],
  ])("fails closed for a %s lease", async (_name, mutation) => {
    const harness = createHarness({ leaseMutation: mutation });

    await expect(
      harness.adapter
        .createRepository({ principal: principal(), signal: harness.signal })
        .enqueue(admission()),
    ).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
      message: "The Note generation owner repository is unavailable",
    });
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.revoke).toHaveBeenCalledTimes(1);
  });

  it("rejects stale targets and aborted calls before credential acquisition", async () => {
    const stale = createHarness({
      targetMutation: {
        observedAt: "2026-09-03T05:54:59.999Z",
        expiresAt: "2026-09-03T06:04:59.999Z",
      },
    });
    await expect(
      stale.adapter
        .createRepository({ principal: principal(), signal: stale.signal })
        .enqueue(admission()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(stale.acquire).not.toHaveBeenCalled();
    expect(stale.revoke).not.toHaveBeenCalled();

    const aborted = createHarness();
    aborted.controller.abort();
    expect(() =>
      aborted.adapter.createRepository({
        principal: principal(),
        signal: aborted.signal,
      }),
    ).toThrowError(disabledError());
    const proxiedSignal = new Proxy(new AbortController().signal, {});
    expect(() =>
      aborted.adapter.createRepository({
        principal: principal(),
        signal: proxiedSignal,
      }),
    ).toThrowError(disabledError());
    expect(aborted.acquire).not.toHaveBeenCalled();
    expect(aborted.revoke).not.toHaveBeenCalled();
  });

  it.each([10_000, 24_999])(
    "rejects target and credential leases with only %i ms remaining",
    async (remainingMs) => {
      const expiresAt = timestampAfter(remainingMs);
      const shortTarget = createHarness({
        targetMutation: { expiresAt },
      });
      await expect(
        shortTarget.adapter
          .createRepository({
            principal: principal(),
            signal: shortTarget.signal,
          })
          .enqueue(admission()),
      ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
      expect(shortTarget.acquire).not.toHaveBeenCalled();
      expect(shortTarget.revoke).not.toHaveBeenCalled();

      const shortCredential = createHarness({
        leaseMutation: { expiresAt, revokeBy: expiresAt },
      });
      await expect(
        shortCredential.adapter
          .createRepository({
            principal: principal(),
            signal: shortCredential.signal,
          })
          .enqueue(admission()),
      ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
      expect(shortCredential.acquire).toHaveBeenCalledTimes(1);
      expect(shortCredential.query).not.toHaveBeenCalled();
      expect(shortCredential.destroy).toHaveBeenCalledTimes(1);
      expect(shortCredential.revoke).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts the exact 25-second query, destroy, revoke and scheduling boundary", async () => {
    const expiresAt = timestampAfter(25_000);
    const harness = createHarness({
      targetMutation: { expiresAt },
      leaseMutation: { expiresAt, revokeBy: expiresAt },
    });

    await expect(
      harness.adapter
        .createRepository({ principal: principal(), signal: harness.signal })
        .enqueue(admission()),
    ).resolves.toMatchObject({ created: true, pointsReserved: true });
    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(harness.revoke).toHaveBeenCalledTimes(1);
  });

  it("tombstones a timed-out acquisition and rejects its late completion", async () => {
    vi.useFakeTimers();
    const acquireGate = deferred<void>();
    const harness = createHarness({ acquireGate });
    const pending = harness.adapter
      .createRepository({ principal: principal(), signal: harness.signal })
      .enqueue(admission())
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(0);
    expect(harness.acquire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(harness.revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.acquireSignals[0]?.aborted).toBe(true);
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(harness.revocationReceipts[0]).toMatchObject({
      credentialDisposition: "NOT_ISSUED",
      acquisitionRequestTombstoned: true,
      futureIssuanceBlocked: true,
      lateIssuanceBlockedAtomically: true,
      activeSessionCount: 0,
      allIssuedSessionsTerminated: true,
      inFlightStatementsSettled: true,
    });

    acquireGate.resolve();
    await expect(
      harness.acquire.mock.results[0]?.value as Promise<unknown>,
    ).resolves.toBeDefined();
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(harness.revoke).toHaveBeenCalledTimes(1);
  });

  it("terminates a timed-out query and rejects its late completion", async () => {
    vi.useFakeTimers();
    const queryGate = deferred<void>();
    const harness = createHarness({ queryGate });
    const pending = harness.adapter
      .createRepository({ principal: principal(), signal: harness.signal })
      .enqueue(admission())
      .catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(0);
    expect(harness.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(harness.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.querySignals[0]?.aborted).toBe(true);
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(harness.destroyReceipts[0]).toMatchObject({
      leaseReferenceSha256: harness.leaseDescriptor.leaseReferenceSha256,
      sessionBindingSha256: harness.leaseDescriptor.sessionBindingSha256,
      runtimeRole: harness.leaseDescriptor.runtimeRole,
      sessionTerminated: true,
      activeStatementCount: 0,
      inFlightStatementDisposition: "SETTLED_OR_CANCELLED",
    });
    expect(harness.revocationReceipts[0]).toMatchObject({
      credentialDisposition: "REVOKED",
      lateIssuanceBlockedAtomically: true,
      activeSessionCount: 0,
      allIssuedSessionsTerminated: true,
      inFlightStatementsSettled: true,
    });

    queryGate.resolve();
    await expect(
      harness.query.mock.results[0]?.value as Promise<unknown>,
    ).resolves.toBeDefined();
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(harness.revoke).toHaveBeenCalledTimes(1);
  });

  it("tombstones failed acquisition without exposing resolver secrets", async () => {
    const secret = "postgresql://runtime:secret@db.invalid/postgres";
    const harness = createHarness({ acquireError: new Error(secret) });

    const failure = await harness.adapter
      .createRepository({ principal: principal(), signal: harness.signal })
      .enqueue(admission())
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: "PRODUCT_API_DISABLED",
      message: "The Note generation owner repository is unavailable",
    });
    expect(String(failure)).not.toContain(secret);
    expect(harness.query).not.toHaveBeenCalled();
    expect(harness.destroy).not.toHaveBeenCalled();
    expect(harness.revoke).toHaveBeenCalledTimes(1);
    expect(harness.revoke.mock.calls[0][0]).toMatchObject({
      bindingState: "NONE",
      leaseReferenceSha256: null,
      sessionBindingSha256: null,
      runtimeRole: null,
    });

    const spoofedBusinessError = createHarness({
      acquireError: Object.freeze({
        code: "P0001",
        message: "POINTS_INSUFFICIENT",
      }),
    });
    await expect(
      spoofedBusinessError.adapter
        .createRepository({
          principal: principal(),
          signal: spoofedBusinessError.signal,
        })
        .enqueue(admission()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("destroys and revokes after a query failure and preserves only safe DB codes", async () => {
    const safe = createHarness({
      queryError: Object.freeze({ code: "P0001", message: "POINTS_INSUFFICIENT" }),
    });
    await expect(
      safe.adapter
        .createRepository({ principal: principal(), signal: safe.signal })
        .enqueue(admission()),
    ).rejects.toMatchObject({
      code: "POINTS_INSUFFICIENT",
      message: "The shadow wallet does not have enough points",
    });
    expect(safe.events).toEqual(["acquire", "query", "destroy", "revoke"]);

    const secret = "runtime-password-that-must-not-leak";
    const unsafe = createHarness({ queryError: new Error(secret) });
    const failure = await unsafe.adapter
      .createRepository({ principal: principal(), signal: unsafe.signal })
      .enqueue(admission())
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: "PRODUCT_API_DISABLED",
      message: "The Note generation owner repository is unavailable",
    });
    expect(String(failure)).not.toContain(secret);
    expect(unsafe.events).toEqual(["acquire", "query", "destroy", "revoke"]);
  });

  it("overrides an uncertain success when destroy or revocation proof fails", async () => {
    const destroyFailure = createHarness({
      destroyError: new Error("secret from transport"),
    });
    await expect(
      destroyFailure.adapter
        .createRepository({
          principal: principal(),
          signal: destroyFailure.signal,
        })
        .enqueue(admission()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(destroyFailure.revoke).toHaveBeenCalledTimes(1);

    const badRevocation = createHarness({ invalidRevocationReceipt: true });
    await expect(
      badRevocation.adapter
        .createRepository({
          principal: principal(),
          signal: badRevocation.signal,
        })
        .enqueue(admission()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("does not reuse a returned lease identity or query capability", async () => {
    const harness = createHarness({ retainLease: true });
    const first = harness.adapter.createRepository({
      principal: principal(),
      signal: harness.signal,
    });
    const second = harness.adapter.createRepository({
      principal: principal(),
      signal: harness.signal,
    });

    await expect(first.enqueue(admission())).resolves.toBeDefined();
    await expect(second.enqueue(admission())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.query).toHaveBeenCalledTimes(1);
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(harness.revoke).toHaveBeenCalledTimes(2);
  });
});

type HarnessOptions = Readonly<{
  leaseMutation?: Readonly<Record<string, unknown>>;
  targetMutation?: Readonly<Record<string, unknown>>;
  acquireError?: unknown;
  queryError?: unknown;
  acquireGate?: Deferred<void>;
  queryGate?: Deferred<void>;
  destroyError?: unknown;
  invalidRevocationReceipt?: boolean;
  retainLease?: boolean;
}>;

function createHarness(options: HarnessOptions = {}) {
  harnessSequence += 1;
  const suffix = harnessSequence.toString(16).padStart(16, "0");
  const events: string[] = [];
  const acquireSignals: AbortSignal[] = [];
  const querySignals: AbortSignal[] = [];
  const destroyReceipts: unknown[] = [];
  const revocationReceipts: unknown[] = [];
  const controller = new AbortController();
  const signal = controller.signal;
  const target = createCaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget({
    ...targetInput(),
    ...options.targetMutation,
  });
  let retainedLease: Readonly<Record<string, unknown>> | undefined;
  let leaseDescriptor: Record<string, unknown> = Object.create(null);

  const query = vi.fn(
    async (
      _sql: string,
      _values: readonly unknown[],
      _context: Readonly<{ signal: AbortSignal }>,
    ) => {
      void _sql;
      void _values;
      querySignals.push(_context.signal);
      events.push("query");
      if (options.queryError !== undefined) throw options.queryError;
      if (options.queryGate) await options.queryGate.promise;
      return { rows: [{ data: admissionEnvelope() }] };
    },
  );
  const destroy = vi.fn(
    async (_context: Readonly<{ signal: AbortSignal }>) => {
      void _context;
      events.push("destroy");
      if (options.destroyError !== undefined) throw options.destroyError;
      const receipt = destroyReceipt(leaseDescriptor);
      destroyReceipts.push(receipt);
      return receipt;
    },
  );
  const acquire = vi.fn(async (
    rawRequest: unknown,
    context: Readonly<{ signal: AbortSignal }>,
  ) => {
    events.push("acquire");
    acquireSignals.push(context.signal);
    if (options.acquireError !== undefined) throw options.acquireError;
    if (options.acquireGate) await options.acquireGate.promise;
    if (options.retainLease && retainedLease) return retainedLease;
    const request = rawRequest as Record<string, unknown>;
    leaseDescriptor = {
      status: "ACTIVE_SINGLE_USE_PURPOSE_SESSION_NOT_APPROVED",
      requestDigest: request.requestDigest,
      deploymentEnvironment: request.deploymentEnvironment,
      targetClass: request.targetClass,
      purpose: request.purpose,
      callerRole: request.callerRole,
      effectiveRole: request.callerRole,
      runtimeRole: `careslink_v1_points_admission_runtime_${suffix}`,
      rpcNames: request.rpcNames,
      rpcParameterCount: request.rpcParameterCount,
      databaseTargetDigest: request.databaseTargetDigest,
      targetProjectRefHmac: request.targetProjectRefHmac,
      productionProjectRefHmac: request.productionProjectRefHmac,
      controlPlaneEvidenceSha256: request.controlPlaneEvidenceSha256,
      databaseName: request.databaseName,
      postgresMajor: request.postgresMajor,
      projectStatus: request.projectStatus,
      connectionMode: request.connectionMode,
      port: request.port,
      tlsMode: request.tlsMode,
      tlsRootCertificateSha256: request.tlsRootCertificateSha256,
      requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE",
      transactionMode: "ONE_ATOMIC_STATEMENT",
      transactionPoolerUsed: false,
      preparedStatementsUsed: false,
      roleActivationMode: request.roleActivationMode,
      callerMembershipAdmin: false,
      callerMembershipInherit: false,
      callerMembershipSet: true,
      executorMembershipPresent: false,
      serviceRoleFallback: false,
      leaseReferenceSha256: hash(`lease-${suffix}`),
      sessionBindingSha256: hash(`session-${suffix}`),
      issuedAt: NOW,
      expiresAt: "2026-09-03T06:01:00.000Z",
      revokeBy: "2026-09-03T06:01:00.000Z",
      reuseAllowed: false,
      concurrentUseAllowed: false,
      rawCredentialMaterialPresent: false,
      ...options.leaseMutation,
    };
    retainedLease =
      createCaresLinkV1CommunicationNotePointsAdmissionPurposeSessionLease({
        capability: "INJECTED_POINTS_ADMISSION_EXCLUSIVE_SESSION",
        descriptor: leaseDescriptor,
        query,
        destroy,
      });
    return retainedLease;
  });
  const revoke = vi.fn(async (rawRequest: unknown) => {
    events.push("revoke");
    const request = rawRequest as Record<string, unknown>;
    const receipt = revocationReceipt(request);
    revocationReceipts.push(receipt);
    return options.invalidRevocationReceipt
      ? { ...receipt, futureIssuanceBlocked: false }
      : receipt;
  });
  const credentialResolver = createResolver({ acquire, revoke });
  const adapter =
    createCaresLinkV1CommunicationNotePointsAdmissionPurposeCallerAdapter({
      databaseTarget: target,
      credentialResolver,
      clock: { now: () => NOW },
    });
  return {
    adapter,
    target,
    credentialResolver,
    acquire,
    revoke,
    query,
    destroy,
    acquireSignals,
    querySignals,
    destroyReceipts,
    revocationReceipts,
    events,
    controller,
    signal,
    get leaseDescriptor() {
      return leaseDescriptor;
    },
  };
}

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return Object.freeze({ promise, resolve, reject });
}

function createResolver(
  overrides: Readonly<{
    acquire?: CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver["acquire"];
    revoke?: CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver["revoke"];
  }>,
) {
  return createCaresLinkV1CommunicationNotePointsAdmissionCredentialResolver({
    capability: "INJECTED_POINTS_ADMISSION_CREDENTIAL_RESOLVER",
    acquire: overrides.acquire ?? vi.fn(),
    revoke: overrides.revoke ?? vi.fn(),
  });
}

function targetInput(): CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget {
  return {
    status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",
    deploymentEnvironment: "PREVIEW",
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
    targetProjectRefHmac: hash("preview-project"),
    productionProjectRefHmac: hash("production-project"),
    controlPlaneEvidenceSha256: hash("control-plane"),
    databaseName: "postgres",
    postgresMajor: 17,
    projectStatus: "ACTIVE_HEALTHY",
    connectionMode: "DIRECT",
    port: 5432,
    tlsMode: "VERIFY_FULL_PINNED_CA",
    tlsRootCertificateSha256: hash("tls-root"),
    observedAt: NOW,
    expiresAt: "2026-09-03T06:05:00.000Z",
    defaultBranch: false,
    persistent: false,
    withData: false,
    productionExcluded: true,
    rawCredentialMaterialPresent: false,
  };
}

function principal() {
  return {
    userId: OWNER_ID,
    sessionId: SESSION_ID,
    transport: "COOKIE" as const,
  };
}

function admission(): CaresLinkV1CommunicationNotePointsAdmissionInput {
  return {
    jobId: JOB_ID,
    payloadId: PAYLOAD_ID,
    sourceLocale: "en",
    privacyReviewId: PRIVACY_REVIEW_ID,
    cleanedFactsHash: "a".repeat(64),
    idempotencyHash: "b".repeat(64),
    requestHash: "c".repeat(64),
    payloadHandleHash: "d".repeat(64),
    payloadExpiresAt: "2026-09-03T06:30:00.000Z",
    payloadPolicyVersion: "payload.communication.2026-09-03.v1",
    payloadPolicySnapshotHash: "e".repeat(64),
    encryptionProfileVersion: "envelope-aes256-gcm.2026-09-03.v1",
    kmsKeyVersionResourceHash: "f".repeat(64),
    backupDispositionVersion: "no-backup.2026-09-03.v1",
  };
}

function admissionEnvelope() {
  return {
    created: true,
    payloadAccepted: true,
    pointsReserved: true,
    job: {
      jobId: JOB_ID,
      status: "QUEUED",
      noteType: "communication",
      serviceCode: "note.communication.generate",
      attemptCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      result: null,
    },
  };
}

function destroyReceipt(descriptor: Record<string, unknown>) {
  const core = {
    status: "DESTROYED_NOT_APPROVED",
    leaseReferenceSha256: descriptor.leaseReferenceSha256,
    sessionBindingSha256: descriptor.sessionBindingSha256,
    runtimeRole: descriptor.runtimeRole,
    reportedAt: NOW,
    sessionTerminated: true,
    activeStatementCount: 0,
    inFlightStatementDisposition: "SETTLED_OR_CANCELLED",
    reusable: false,
    rawCredentialMaterialPresent: false,
  };
  return Object.freeze({ ...core, receiptDigest: canonicalSha256(core) });
}

function revocationReceipt(request: Record<string, unknown>) {
  const core = {
    status: "REVOKED_AND_TOMBSTONED_NOT_APPROVED",
    requestDigest: request.requestDigest,
    acquisitionRequestDigest: request.acquisitionRequestDigest,
    leaseReferenceSha256: request.leaseReferenceSha256,
    sessionBindingSha256: request.sessionBindingSha256,
    runtimeRole: request.runtimeRole,
    reportedAt: NOW,
    credentialDisposition:
      request.bindingState === "NONE" ? "NOT_ISSUED" : "REVOKED",
    acquisitionRequestTombstoned: true,
    futureIssuanceBlocked: true,
    lateIssuanceBlockedAtomically: true,
    activeSessionCount: 0,
    allIssuedSessionsTerminated: true,
    inFlightStatementsSettled: true,
    reusable: false,
    rawCredentialMaterialPresent: false,
  };
  return Object.freeze({ ...core, receiptDigest: canonicalSha256(core) });
}

function canonicalSha256WithoutKey(
  value: Record<string, unknown>,
  omittedKey: string,
) {
  const core = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omittedKey),
  );
  return canonicalSha256(core);
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestampAfter(milliseconds: number) {
  return new Date(Date.parse(NOW) + milliseconds).toISOString();
}

function disabledError() {
  return expect.objectContaining({
    code: "PRODUCT_API_DISABLED",
    message: "Communication Note Points admission purpose caller is unavailable",
  });
}
