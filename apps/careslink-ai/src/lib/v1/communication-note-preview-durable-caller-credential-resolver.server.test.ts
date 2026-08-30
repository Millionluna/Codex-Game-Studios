import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_DURABLE_CALLER_CREDENTIAL_RESOLVER,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_READY,
  createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver,
} from "./communication-note-preview-durable-caller-credential-resolver.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
  createCaresLinkV1CommunicationNotePreviewReleaseReportDigest,
} from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";

type CapturedLeaseQuery = (
  sql: string,
  values: readonly unknown[] | undefined,
  context: Readonly<{ signal: AbortSignal }>,
) => PromiseLike<Readonly<{ rows: readonly unknown[] }>>;

const capturedLease = vi.hoisted(() => ({
  query: undefined as CapturedLeaseQuery | undefined,
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "./communication-note-preview-runner-terminal-resolved-runtime-binding.server",
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import("./communication-note-preview-runner-terminal-resolved-runtime-binding.server")
    >();
    return {
      ...original,
      createTestOnlyCaresLinkV1CommunicationNotePreviewExclusiveSessionLease(
        value: unknown,
      ) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          capturedLease.query = (value as { query?: CapturedLeaseQuery }).query;
        }
        return original.createTestOnlyCaresLinkV1CommunicationNotePreviewExclusiveSessionLease(
          value,
        );
      },
    };
  },
);

const NOW = "2030-01-01T00:00:00.000Z";
const LEASE_EXPIRES_AT = "2030-01-01T00:01:30.000Z";
const AUTHORIZATION_EXPIRES_AT = "2030-01-01T00:08:00.000Z";
const BACKEND_PID = 4242;

describe("Communication Note M1k durable caller credential resolver", () => {
  it("acquires, opens and durably binds one exclusive session before exposing a secret-free lease", async () => {
    const harness = createHarness();
    const request = createAcquisitionRequest();

    const lease = await harness.resolver.acquire(request, context());

    expect(harness.order).toEqual(["acquire", "open", "bind"]);
    expect(harness.brokerAcquire).toHaveBeenCalledOnce();
    expect(harness.sessionOpen).toHaveBeenCalledOnce();
    expect(harness.brokerBind).toHaveBeenCalledOnce();
    expect(harness.sessionDestroy).not.toHaveBeenCalled();

    const brokerRequest = dataRecord(harness.brokerAcquire.mock.calls[0][0]);
    const openRequest = dataRecord(harness.sessionOpen.mock.calls[0][0]);
    const bindRequest = dataRecord(harness.brokerBind.mock.calls[0][0]);
    const runtimePassword = requireString(openRequest.password, "password");

    expect(brokerRequest).toMatchObject({
      acquisitionRequestDigest: request.requestDigest,
      callerIdentityHmac: request.identityHmac,
      runtimeRole: expect.stringMatching(
        /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/,
      ),
      leaseReferenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sessionBindingSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      credentialVerifierSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      credentialVerifier: expect.stringMatching(/^SCRAM-SHA-256\$4096:/),
      requestedExpiresAt: LEASE_EXPIRES_AT,
      rawCredentialMaterialPresent: false,
    });
    expect(brokerRequest).not.toHaveProperty("password");
    expect(brokerRequest).not.toHaveProperty("runtimePassword");
    expect(openRequest).toMatchObject({
      acquisitionRequestDigest: request.requestDigest,
      runtimeRole: brokerRequest.runtimeRole,
      password: runtimePassword,
      databaseName: "postgres",
      requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE",
      tlsMode: "VERIFY_FULL_PINNED_CA",
      tlsRootCertificateSha256: request.tlsRootCertificateSha256,
      expiresAt: LEASE_EXPIRES_AT,
    });
    expect(bindRequest).toMatchObject({
      acquisitionRequestDigest: request.requestDigest,
      leaseReferenceSha256: brokerRequest.leaseReferenceSha256,
      sessionBindingSha256: brokerRequest.sessionBindingSha256,
      runtimeRole: brokerRequest.runtimeRole,
      backendPid: BACKEND_PID,
      rawCredentialMaterialPresent: false,
    });

    expect(lease).toMatchObject({
      status: "TEST_ONLY_EXCLUSIVE_SESSION_LEASE_NOT_APPROVED",
      requestDigest: request.requestDigest,
      purpose: "RUNNER_TERMINAL_PERSISTENCE",
      callerRole: "careslink_v1_preview_runner_terminal_caller",
      executorRole: "careslink_v1_preview_runner_terminal_executor",
      rpcNames: [
        "persist_verified_communication_note_preview_runner_terminal",
      ],
      leaseReferenceSha256: brokerRequest.leaseReferenceSha256,
      sessionBindingSha256: brokerRequest.sessionBindingSha256,
      runtimeRole: brokerRequest.runtimeRole,
      requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE",
      queryResultMode: "NORMALIZED_ROWS_ONLY",
      reuseAllowed: false,
      concurrentUseAllowed: false,
      issuedAt: NOW,
      expiresAt: LEASE_EXPIRES_AT,
      revokeBy: LEASE_EXPIRES_AT,
      rawCredentialMaterialPresent: false,
    });
    expect(JSON.stringify(lease)).not.toContain(runtimePassword);
    expect(lease).not.toHaveProperty("runtimePassword");
    expect(lease).not.toHaveProperty("query");
    expect(lease).not.toHaveProperty("destroy");
    expect(lease).not.toHaveProperty("backendPid");
  });

  it("tombstones before destroying the session, then finalizes and independently inspects zero residue", async () => {
    const harness = createHarness();
    const acquisition = createAcquisitionRequest();
    const lease = dataRecord(
      await harness.resolver.acquire(acquisition, context()),
    );
    harness.order.length = 0;

    const release = await harness.resolver.revoke(
      createRevocationRequest(acquisition, lease),
      context(),
    );

    expect(harness.order).toEqual([
      "tombstone",
      "destroy",
      "finalize",
      "inspect",
    ]);
    expect(harness.brokerTombstone).toHaveBeenCalledOnce();
    expect(harness.sessionDestroy).toHaveBeenCalledOnce();
    expect(harness.brokerFinalize).toHaveBeenCalledOnce();
    expect(harness.auditInspect).toHaveBeenCalledOnce();

    const tombstoneRequest = dataRecord(
      harness.brokerTombstone.mock.calls[0][0],
    );
    const finalizeRequest = dataRecord(
      harness.brokerFinalize.mock.calls[0][0],
    );
    const inspectRequest = dataRecord(harness.auditInspect.mock.calls[0][0]);
    expect(tombstoneRequest).toEqual({
      version: expect.any(String),
      policyDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      acquisitionRequestDigest: acquisition.requestDigest,
      authorizationDigest: acquisition.authorizationDigest,
      runIdHash: acquisition.runIdHash,
      databaseTargetDigest: acquisition.databaseTargetDigest,
      callerRole: acquisition.callerRole,
      rawCredentialMaterialPresent: false,
    });
    expect(finalizeRequest).toEqual(tombstoneRequest);
    expect(inspectRequest).toEqual(tombstoneRequest);

    expect(release).toMatchObject({
      status: "TEST_ONLY_RELEASE_REPORTED_NOT_APPROVED",
      acquisitionRequestDigest: acquisition.requestDigest,
      leaseReferenceSha256: lease.leaseReferenceSha256,
      sessionBindingSha256: lease.sessionBindingSha256,
      runtimeRole: lease.runtimeRole,
      reportedSessionDisposition: "DESTROYED",
      reportedCredentialDisposition: "REVOKED",
      acquisitionRequestTombstoned: true,
      futureIssuanceBlocked: true,
      reusable: false,
      rawCredentialMaterialPresent: false,
    });
    expectReleaseDigest(release);
  });

  it("cleans an issued acquisition by digest after its response is lost, without opening or retrying a session", async () => {
    let issuedBrokerRequest: Record<string, unknown> | undefined;
    const acquireFailure = new Error(
      "broker-response-lost runtimePassword=must-not-escape",
    );
    const harness = createHarness({
      brokerAcquire: vi.fn(async (value: unknown) => {
        harness.order.push("acquire");
        issuedBrokerRequest = dataRecord(value);
        throw acquireFailure;
      }),
      auditDisposition: "ISSUED_THEN_DESTROYED",
    });
    const acquisition = createAcquisitionRequest();

    const acquire = harness.resolver.acquire(acquisition, context());
    await expect(acquire).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    await expect(acquire).rejects.not.toThrow(/must-not-escape|runtimePassword/i);
    expect(issuedBrokerRequest).toBeDefined();
    expect(harness.brokerAcquire).toHaveBeenCalledOnce();
    expect(harness.sessionOpen).not.toHaveBeenCalled();

    harness.order.length = 0;
    const release = await harness.resolver.revoke(
      createRevocationRequest(acquisition),
      context(),
    );

    expect(harness.order).toEqual(["tombstone", "finalize", "inspect"]);
    expect(harness.brokerAcquire).toHaveBeenCalledOnce();
    expect(harness.sessionOpen).not.toHaveBeenCalled();
    expect(harness.sessionDestroy).not.toHaveBeenCalled();
    expect(release).toMatchObject({
      acquisitionRequestDigest: acquisition.requestDigest,
      leaseReferenceSha256: null,
      sessionBindingSha256: null,
      runtimeRole: null,
      reportedSessionDisposition: "DESTROYED",
      reportedCredentialDisposition: "REVOKED",
      acquisitionRequestTombstoned: true,
      futureIssuanceBlocked: true,
    });
    expectReleaseDigest(release);
  });

  it("persists a revoke-before-acquire fence and reports that no credential was issued", async () => {
    const harness = createHarness({ auditDisposition: "NOT_ISSUED" });
    const acquisition = createAcquisitionRequest();

    const release = await harness.resolver.revoke(
      createRevocationRequest(acquisition),
      context(),
    );

    expect(harness.order).toEqual(["tombstone", "finalize", "inspect"]);
    expect(harness.brokerAcquire).not.toHaveBeenCalled();
    expect(harness.sessionOpen).not.toHaveBeenCalled();
    expect(release).toMatchObject({
      acquisitionRequestDigest: acquisition.requestDigest,
      reportedSessionDisposition: "NOT_ACQUIRED",
      reportedCredentialDisposition: "NOT_ISSUED",
      acquisitionRequestTombstoned: true,
      futureIssuanceBlocked: true,
    });
    expectReleaseDigest(release);
  });

  it("cleans but rejects a false not-issued receipt when a local session existed", async () => {
    const harness = createHarness({ auditDisposition: "NOT_ISSUED" });
    const acquisition = createAcquisitionRequest();
    const lease = dataRecord(
      await harness.resolver.acquire(acquisition, context()),
    );
    harness.order.length = 0;

    await expect(
      harness.resolver.revoke(
        createRevocationRequest(acquisition, lease),
        context(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(harness.order).toEqual([
      "tombstone",
      "destroy",
      "finalize",
      "inspect",
    ]);
  });

  it("retains a just-opened session until digest-only tombstone-first revoke after bind abort", async () => {
    const abortController = new AbortController();
    const acquisition = createAcquisitionRequest();
    let runtimePassword = "";
    const bindFailure = new Error("unset until invoked");
    const harness = createHarness({
      brokerBind: vi.fn(async () => {
        harness.order.push("bind");
        abortController.abort();
        bindFailure.message = `bind-failed password=${runtimePassword}`;
        throw bindFailure;
      }),
      captureRuntimePassword: (value) => {
        runtimePassword = value;
      },
    });

    const acquire = harness.resolver.acquire(
      acquisition,
      context(abortController.signal),
    );
    await expect(acquire).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    await expect(acquire).rejects.not.toThrow(
      new RegExp(escapeRegExp(runtimePassword)),
    );
    expect(runtimePassword).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(harness.order).toEqual(["acquire", "open", "bind"]);
    expect(harness.sessionDestroy).not.toHaveBeenCalled();
    expect(harness.brokerBind).toHaveBeenCalledOnce();

    const bindContext = dataRecord(harness.brokerBind.mock.calls[0][1]);
    expect(bindContext.signal).toBe(abortController.signal);
    expect(abortController.signal.aborted).toBe(true);

    harness.order.length = 0;
    const release = await harness.resolver.revoke(
      createRevocationRequest(acquisition),
      context(),
    );
    expect(harness.order).toEqual([
      "tombstone",
      "destroy",
      "finalize",
      "inspect",
    ]);
    expect(release).toMatchObject({
      reportedSessionDisposition: "DESTROYED",
      reportedCredentialDisposition: "REVOKED",
      acquisitionRequestTombstoned: true,
      futureIssuanceBlocked: true,
    });
    expectReleaseDigest(release);
  });

  it("continues authoritative finalize and inspect when local destroy never settles", async () => {
    vi.useFakeTimers();
    let rejectDestroy: ((reason?: unknown) => void) | undefined;
    try {
      const pendingDestroy = new Promise<void>((_resolve, reject) => {
        rejectDestroy = reject;
      });
      const harness = createHarness({
        sessionDestroy: () => pendingDestroy,
      });
      const acquisition = createAcquisitionRequest();
      const lease = dataRecord(
        await harness.resolver.acquire(acquisition, context()),
      );
      harness.order.length = 0;

      const releasePromise = harness.resolver.revoke(
        createRevocationRequest(acquisition, lease),
        context(),
      );
      for (
        let attempt = 0;
        attempt < 20 && harness.sessionDestroy.mock.calls.length === 0;
        attempt += 1
      ) {
        await Promise.resolve();
      }
      expect(harness.order).toEqual(["tombstone", "destroy"]);

      await vi.advanceTimersByTimeAsync(10_000);
      const release = await releasePromise;
      expect(harness.order).toEqual([
        "tombstone",
        "destroy",
        "finalize",
        "inspect",
      ]);
      expect(release).toMatchObject({
        reportedSessionDisposition: "DESTROYED",
        reportedCredentialDisposition: "REVOKED",
      });
      expectReleaseDigest(release);

      rejectDestroy?.(new Error("late password=must-not-escape"));
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });

  it("destroys an open result that arrives after digest-only revoke completes", async () => {
    let resolveOpen: ((value: unknown) => void) | undefined;
    const pendingOpen = new Promise<unknown>((resolve) => {
      resolveOpen = resolve;
    });
    const lateSessionDestroy = vi.fn(async () => undefined);
    const abortController = new AbortController();
    const acquisition = createAcquisitionRequest();
    const harness = createHarness({
      sessionOpen: () => pendingOpen,
    });

    const acquire = harness.resolver.acquire(
      acquisition,
      context(abortController.signal),
    );
    for (
      let attempt = 0;
      attempt < 20 && harness.sessionOpen.mock.calls.length === 0;
      attempt += 1
    ) {
      await Promise.resolve();
    }
    expect(harness.order).toEqual(["acquire", "open"]);
    abortController.abort();

    const release = await harness.resolver.revoke(
      createRevocationRequest(acquisition),
      context(),
    );
    expect(harness.order).toEqual([
      "acquire",
      "open",
      "tombstone",
      "finalize",
      "inspect",
    ]);
    expect(release).toMatchObject({
      reportedSessionDisposition: "DESTROYED",
      reportedCredentialDisposition: "REVOKED",
    });

    resolveOpen?.(
      Object.freeze({
        backendPid: BACKEND_PID,
        query: vi.fn(async () => ({ rows: [] })),
        cancelInFlight: vi.fn(async () => undefined),
        destroy: lateSessionDestroy,
      }),
    );
    await expect(acquire).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(lateSessionDestroy).toHaveBeenCalledOnce();
    expect(harness.brokerBind).not.toHaveBeenCalled();
    expect(
      harness.brokerTombstone.mock.invocationCallOrder[0],
    ).toBeLessThan(lateSessionDestroy.mock.invocationCallOrder[0]);
    expect(harness.order).toEqual([
      "acquire",
      "open",
      "tombstone",
      "finalize",
      "inspect",
    ]);
  });

  it("snapshots mutable injected ports and physical-session methods", async () => {
    capturedLease.query = undefined;
    const order: string[] = [];
    const acquisition = createAcquisitionRequest();
    const originalQuery = vi.fn(async () => {
      order.push("query");
      return { rows: [] };
    });
    const replacementQuery = vi.fn(async () => {
      throw new Error("replacement query password=must-not-escape");
    });
    const originalDestroy = vi.fn(async () => {
      order.push("destroy");
    });
    const originalCancel = vi.fn(async () => {
      order.push("cancel");
    });
    const replacementCancel = vi.fn(async () => {
      throw new Error("replacement cancel password=must-not-escape");
    });
    const replacementDestroy = vi.fn(async () => {
      throw new Error("replacement destroy password=must-not-escape");
    });
    const mutableSession: {
      backendPid: number;
      query: CapturedLeaseQuery;
      cancelInFlight: () => Promise<void>;
      destroy: () => Promise<void>;
    } = {
      backendPid: BACKEND_PID,
      query: originalQuery,
      cancelInFlight: originalCancel,
      destroy: originalDestroy,
    };

    type MutablePortCall = (
      request: unknown,
      context: unknown,
    ) => Promise<unknown>;
    const brokerAcquire = vi.fn(async (value: unknown) => {
      order.push("acquire");
      const request = dataRecord(value);
      return {
        status: "ISSUED_UNBOUND",
        acquisitionRequestDigest: request.acquisitionRequestDigest,
        leaseReferenceSha256: request.leaseReferenceSha256,
        sessionBindingSha256: request.sessionBindingSha256,
        runtimeRole: request.runtimeRole,
        credentialVerifierSha256: request.credentialVerifierSha256,
        issuedAt: NOW,
        expiresAt: LEASE_EXPIRES_AT,
        rawCredentialMaterialPresent: false,
      };
    });
    const brokerBind = vi.fn(async (value: unknown) => {
      order.push("bind");
      const request = dataRecord(value);
      return {
        status: "ACTIVE",
        acquisitionRequestDigest: request.acquisitionRequestDigest,
        leaseReferenceSha256: request.leaseReferenceSha256,
        sessionBindingSha256: request.sessionBindingSha256,
        runtimeRole: request.runtimeRole,
        backendPid: request.backendPid,
        rawCredentialMaterialPresent: false,
      };
    });
    const brokerTombstone = vi.fn(async (value: unknown) => {
      order.push("tombstone");
      const request = dataRecord(value);
      return {
        status: "TOMBSTONED",
        acquisitionRequestDigest: request.acquisitionRequestDigest,
        everIssued: true,
        futureIssuanceBlocked: true,
        rawCredentialMaterialPresent: false,
      };
    });
    const brokerFinalize = vi.fn(async (value: unknown) => {
      order.push("finalize");
      const request = dataRecord(value);
      return {
        status: "REVOKED",
        acquisitionRequestDigest: request.acquisitionRequestDigest,
        everIssued: true,
        futureIssuanceBlocked: true,
        roleCount: 0,
        sessionCount: 0,
        membershipCount: 0,
        rawCredentialMaterialPresent: false,
      };
    });
    const auditInspect = vi.fn(async (value: unknown) => {
      order.push("inspect");
      const request = dataRecord(value);
      return {
        status: "REVOKED_ATTESTED",
        acquisitionRequestDigest: request.acquisitionRequestDigest,
        everIssued: true,
        futureIssuanceBlocked: true,
        roleCount: 0,
        sessionCount: 0,
        membershipCount: 0,
        credentialVerifierResidueCount: 0,
        rawCredentialMaterialPresent: false,
      };
    });
    const sessionOpen = vi.fn(async () => {
      order.push("open");
      return mutableSession;
    });
    const brokerPort: {
      acquire: MutablePortCall;
      bind: MutablePortCall;
      tombstone: MutablePortCall;
      finalize: MutablePortCall;
    } = {
      acquire: brokerAcquire,
      bind: brokerBind,
      tombstone: brokerTombstone,
      finalize: brokerFinalize,
    };
    const auditPort: { inspect: MutablePortCall } = {
      inspect: auditInspect,
    };
    const sessionFactory: { open: MutablePortCall } = {
      open: sessionOpen,
    };
    const clock = { now: () => NOW };
    let nextEntropyByte = 1;
    const entropy = {
      bytes(length: number) {
        const bytes = Uint8Array.from(
          { length },
          (_unused, index) => (nextEntropyByte + index) % 256,
        );
        nextEntropyByte += length;
        return bytes;
      },
    };
    const resolver =
      createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver(
        {
          capability: "TEST_ONLY_M1L_DURABLE_CALLER_CREDENTIAL_RESOLVER",
          brokerPort,
          sessionFactory,
          auditPort,
          clock,
          entropy,
        },
      );
    const replacement = vi.fn(async () => {
      throw new Error("replacement port password=must-not-escape");
    });
    brokerPort.acquire = replacement;
    brokerPort.bind = replacement;
    brokerPort.tombstone = replacement;
    brokerPort.finalize = replacement;
    auditPort.inspect = replacement;
    sessionFactory.open = replacement;
    clock.now = () => {
      throw new Error("replacement clock password=must-not-escape");
    };
    entropy.bytes = () => {
      throw new Error("replacement entropy password=must-not-escape");
    };

    const lease = dataRecord(await resolver.acquire(acquisition, context()));
    mutableSession.backendPid = -1;
    mutableSession.query = replacementQuery;
    mutableSession.cancelInFlight = replacementCancel;
    mutableSession.destroy = replacementDestroy;
    const query = capturedLease.query as CapturedLeaseQuery | undefined;
    if (!query) throw new Error("lease query capture missing");
    await expect(query("select 1", undefined, context())).resolves.toEqual({
      rows: [],
    });
    await resolver.revoke(
      createRevocationRequest(acquisition, lease),
      context(),
    );

    expect(order).toEqual([
      "acquire",
      "open",
      "bind",
      "query",
      "tombstone",
      "destroy",
      "finalize",
      "inspect",
    ]);
    expect(replacement).not.toHaveBeenCalled();
    expect(replacementQuery).not.toHaveBeenCalled();
    expect(replacementCancel).not.toHaveBeenCalled();
    expect(replacementDestroy).not.toHaveBeenCalled();
  });

  it("waits for connection-bound cancellation and query settlement before permitting cleanup SQL", async () => {
    capturedLease.query = undefined;
    let settleQuery: ((value: Readonly<{ rows: readonly unknown[] }>) => void) | undefined;
    const sessionQuery = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Readonly<{ rows: readonly unknown[] }>>((resolve) => {
            settleQuery = resolve;
          }),
      )
      .mockResolvedValue({ rows: [] });
    const cancelInFlight = vi.fn(async () => {
      settleQuery?.({ rows: [] });
    });
    const harness = createHarness({
      sessionOpen: async () =>
        Object.freeze({
          backendPid: BACKEND_PID,
          query: sessionQuery,
          cancelInFlight,
          destroy: vi.fn(async () => undefined),
        }),
    });
    await harness.resolver.acquire(createAcquisitionRequest(), context());
    const query = capturedLease.query as CapturedLeaseQuery | undefined;
    if (!query) throw new Error("lease query capture missing");
    const controller = new AbortController();
    const pending = query(
      "select pg_sleep(10)",
      undefined,
      context(controller.signal),
    );
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(cancelInFlight).toHaveBeenCalledOnce();
    await expect(query("rollback", undefined, context())).resolves.toEqual({
      rows: [],
    });
    expect(sessionQuery).toHaveBeenCalledTimes(2);
  });

  it("permanently quarantines a session when cancellation cannot be confirmed", async () => {
    capturedLease.query = undefined;
    const never = new Promise<never>(() => undefined);
    const sessionQuery = vi.fn(() => never);
    const cancelInFlight = vi.fn(() => never);
    const sessionDestroy = vi.fn(async () => undefined);
    const harness = createHarness({
      sessionOpen: async () =>
        Object.freeze({
          backendPid: BACKEND_PID,
          query: sessionQuery,
          cancelInFlight,
          destroy: sessionDestroy,
        }),
    });
    const acquisition = createAcquisitionRequest();
    const lease = dataRecord(
      await harness.resolver.acquire(acquisition, context()),
    );
    const query = capturedLease.query as CapturedLeaseQuery | undefined;
    if (!query) throw new Error("lease query capture missing");
    const controller = new AbortController();
    const pending = query(
      "select pg_sleep(10)",
      undefined,
      context(controller.signal),
    );
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    await expect(query("rollback", undefined, context())).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(sessionQuery).toHaveBeenCalledOnce();
    expect(cancelInFlight).toHaveBeenCalledOnce();

    await harness.resolver.revoke(
      createRevocationRequest(acquisition, lease),
      context(),
    );
    expect(sessionDestroy).toHaveBeenCalledOnce();
    expect(harness.order).toEqual([
      "acquire",
      "open",
      "bind",
      "tombstone",
      "finalize",
      "inspect",
    ]);
  });

  it("is server-only, injected, source-disabled and unavailable to product importers", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY,
    ).toMatchObject({
      ready: false,
      resolvedRuntimeBindingPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
      policyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
    });
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_DURABLE_CALLER_CREDENTIAL_RESOLVER,
    ).toBeUndefined();
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver(
        {
          capability: "LIVE" as "TEST_ONLY_M1L_DURABLE_CALLER_CREDENTIAL_RESOLVER",
          brokerPort: createHarnessPorts().brokerPort,
          sessionFactory: createHarnessPorts().sessionFactory,
          auditPort: createHarnessPorts().auditPort,
          clock: Object.freeze({ now: () => NOW }),
          entropy: createEntropy(),
        },
      ),
    ).toThrowError(fixedFailure());

    const source = readFileSync(
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-durable-caller-credential-resolver.server.ts",
      ),
      "utf8",
    );
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(
      /process\.env|NEXT_PUBLIC_|SUPABASE_SERVICE_ROLE_KEY|console\.|fetch\s*\(|from\s+["'](?:@supabase\/|node:(?:http|https|net|tls))/,
    );
  });
});

type HarnessOptions = Readonly<{
  brokerAcquire?: ReturnType<typeof vi.fn>;
  brokerBind?: ReturnType<typeof vi.fn>;
  auditDisposition?: "NOT_ISSUED" | "ISSUED_THEN_DESTROYED";
  captureRuntimePassword?: (value: string) => void;
  sessionOpen?: () => PromiseLike<unknown>;
  sessionDestroy?: () => PromiseLike<void>;
}>;

function createHarness(options: HarnessOptions = {}) {
  const order: string[] = [];
  const sessionQuery = vi.fn(async () => ({ rows: [] }));
  const sessionDestroy = vi.fn(async () => {
    order.push("destroy");
    await options.sessionDestroy?.();
  });
  const brokerAcquire =
    options.brokerAcquire ??
    vi.fn(async (value: unknown) => {
      order.push("acquire");
      const request = dataRecord(value);
      return {
        status: "ISSUED_UNBOUND",
        acquisitionRequestDigest: request.acquisitionRequestDigest,
        leaseReferenceSha256: request.leaseReferenceSha256,
        sessionBindingSha256: request.sessionBindingSha256,
        runtimeRole: request.runtimeRole,
        credentialVerifierSha256: request.credentialVerifierSha256,
        issuedAt: NOW,
        expiresAt: LEASE_EXPIRES_AT,
        rawCredentialMaterialPresent: false,
      };
    });
  const sessionOpen = vi.fn(async (value: unknown) => {
    order.push("open");
    const request = dataRecord(value);
    options.captureRuntimePassword?.(
      requireString(request.password, "password"),
    );
    if (options.sessionOpen) return options.sessionOpen();
    return Object.freeze({
      backendPid: BACKEND_PID,
      query: sessionQuery,
      cancelInFlight: vi.fn(async () => undefined),
      destroy: sessionDestroy,
    });
  });
  const brokerBind =
    options.brokerBind ??
    vi.fn(async (value: unknown) => {
      order.push("bind");
      const request = dataRecord(value);
      return {
        status: "ACTIVE",
        acquisitionRequestDigest: request.acquisitionRequestDigest,
        leaseReferenceSha256: request.leaseReferenceSha256,
        sessionBindingSha256: request.sessionBindingSha256,
        runtimeRole: request.runtimeRole,
        backendPid: request.backendPid,
        rawCredentialMaterialPresent: false,
      };
    });
  const brokerTombstone = vi.fn(async (value: unknown) => {
    order.push("tombstone");
    const request = dataRecord(value);
    return {
      status: "TOMBSTONED",
      acquisitionRequestDigest: request.acquisitionRequestDigest,
      everIssued: options.auditDisposition !== "NOT_ISSUED",
      futureIssuanceBlocked: true,
      rawCredentialMaterialPresent: false,
    };
  });
  const brokerFinalize = vi.fn(async (value: unknown) => {
    order.push("finalize");
    const request = dataRecord(value);
    return {
      status: "REVOKED",
      acquisitionRequestDigest: request.acquisitionRequestDigest,
      everIssued: options.auditDisposition !== "NOT_ISSUED",
      futureIssuanceBlocked: true,
      roleCount: 0,
      sessionCount: 0,
      membershipCount: 0,
      rawCredentialMaterialPresent: false,
    };
  });
  const auditInspect = vi.fn(async (value: unknown) => {
    order.push("inspect");
    const request = dataRecord(value);
    return {
      status: "REVOKED_ATTESTED",
      acquisitionRequestDigest: request.acquisitionRequestDigest,
      everIssued: options.auditDisposition !== "NOT_ISSUED",
      futureIssuanceBlocked: true,
      roleCount: 0,
      sessionCount: 0,
      membershipCount: 0,
      credentialVerifierResidueCount: 0,
      rawCredentialMaterialPresent: false,
    };
  });
  const ports = createHarnessPorts({
    acquire: brokerAcquire,
    bind: brokerBind,
    tombstone: brokerTombstone,
    finalize: brokerFinalize,
    open: sessionOpen,
    inspect: auditInspect,
  });
  const resolver =
    createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver(
      {
        capability: "TEST_ONLY_M1L_DURABLE_CALLER_CREDENTIAL_RESOLVER",
        brokerPort: ports.brokerPort,
        sessionFactory: ports.sessionFactory,
        auditPort: ports.auditPort,
        clock: Object.freeze({ now: () => NOW }),
        entropy: createEntropy(),
      },
    );
  return {
    resolver,
    order,
    brokerAcquire,
    brokerBind,
    brokerTombstone,
    brokerFinalize,
    sessionOpen,
    sessionQuery,
    sessionDestroy,
    auditInspect,
  };
}

function createHarnessPorts(
  overrides: Readonly<{
    acquire?: ReturnType<typeof vi.fn>;
    bind?: ReturnType<typeof vi.fn>;
    tombstone?: ReturnType<typeof vi.fn>;
    finalize?: ReturnType<typeof vi.fn>;
    open?: ReturnType<typeof vi.fn>;
    inspect?: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return Object.freeze({
    brokerPort: Object.freeze({
      acquire: overrides.acquire ?? vi.fn(),
      bind: overrides.bind ?? vi.fn(),
      tombstone: overrides.tombstone ?? vi.fn(),
      finalize: overrides.finalize ?? vi.fn(),
    }),
    sessionFactory: Object.freeze({
      open: overrides.open ?? vi.fn(),
    }),
    auditPort: Object.freeze({
      inspect: overrides.inspect ?? vi.fn(),
    }),
  });
}

function createAcquisitionRequest() {
  const core = Object.freeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
    purpose: "RUNNER_TERMINAL_PERSISTENCE",
    callerRole: "careslink_v1_preview_runner_terminal_caller",
    executorRole: "careslink_v1_preview_runner_terminal_executor",
    rpcNames: Object.freeze([
      "persist_verified_communication_note_preview_runner_terminal",
    ]),
    authorizationDigest: "1".repeat(64),
    runIdHash: "2".repeat(64),
    authorizationExpiresAt: AUTHORIZATION_EXPIRES_AT,
    registrySnapshotSha256: "3".repeat(64),
    custodyResolutionDigest: "4".repeat(64),
    identityHmac: "5".repeat(64),
    credentialReferenceSha256: "6".repeat(64),
    databaseTargetDigest: "7".repeat(64),
    targetProjectRefHmac: "8".repeat(64),
    productionProjectRefHmac: "9".repeat(64),
    controlPlaneEvidenceSha256: "a".repeat(64),
    databaseName: "postgres",
    postgresMajor: 17,
    projectStatus: "ACTIVE_HEALTHY",
    tlsMode: "VERIFY_FULL_PINNED_CA",
    tlsRootCertificateSha256: "b".repeat(64),
    observedAt: NOW,
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
    rawCredentialMaterialPresent: false,
  });
  return Object.freeze({ ...core, requestDigest: canonicalSha256(core) });
}

function createRevocationRequest(
  acquisition: ReturnType<typeof createAcquisitionRequest>,
  lease?: Record<string, unknown>,
) {
  const hasLease = lease !== undefined;
  const core = Object.freeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
    acquisitionRequestDigest: acquisition.requestDigest,
    authorizationDigest: acquisition.authorizationDigest,
    runIdHash: acquisition.runIdHash,
    databaseTargetDigest: acquisition.databaseTargetDigest,
    callerRole: acquisition.callerRole,
    bindingState: hasLease ? "COMPLETE" : "NONE",
    leaseReferenceSha256: hasLease ? lease.leaseReferenceSha256 : null,
    sessionBindingSha256: hasLease ? lease.sessionBindingSha256 : null,
    runtimeRole: hasLease ? lease.runtimeRole : null,
    rawCredentialMaterialPresent: false,
  });
  return Object.freeze({ ...core, requestDigest: canonicalSha256(core) });
}

function createEntropy() {
  let next = 1;
  return Object.freeze({
    bytes: vi.fn((length: number) => {
      const bytes = Uint8Array.from(
        { length },
        (_unused, index) => (next + index) % 256,
      );
      next += length;
      return bytes;
    }),
  });
}

function context(signal = new AbortController().signal) {
  return Object.freeze({ signal });
}

function expectReleaseDigest(value: unknown) {
  const report = dataRecord(value);
  const { receiptDigest, ...core } = report;
  expect(receiptDigest).toBe(
    createCaresLinkV1CommunicationNotePreviewReleaseReportDigest(core),
  );
}

function dataRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string) {
  expect(value, label).toEqual(expect.any(String));
  return value as string;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value))
    .digest("hex");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fixedFailure() {
  return expect.objectContaining({
    code: "PRODUCT_API_DISABLED",
  });
}
