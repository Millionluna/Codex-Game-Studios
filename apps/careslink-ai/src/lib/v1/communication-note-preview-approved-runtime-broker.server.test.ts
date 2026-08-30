import { createHash } from "node:crypto";
import { readFileSync as readTextFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_BROKER_AUDIT_PORT,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_BROKER_PORT,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_ACQUIRE_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_BIND_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_FINALIZE_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_INSPECT_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_TOMBSTONE_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_VERSION,
  createCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters,
} from "./communication-note-preview-approved-runtime-broker.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
} from "./communication-note-preview-durable-caller-credential-resolver.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
} from "./communication-note-preview-runner-terminal-postgres.server";

vi.mock("server-only", () => ({}));

const ACQUISITION_DIGEST = "a".repeat(64);
const AUTHORIZATION_DIGEST = "b".repeat(64);
const RUN_ID_HASH = "c".repeat(64);
const DATABASE_TARGET_DIGEST = "d".repeat(64);
const CALLER_IDENTITY_HMAC = "e".repeat(64);
const LEASE_REFERENCE_SHA256 = "f".repeat(64);
const SESSION_BINDING_SHA256 = "1".repeat(64);
const RUNTIME_ROLE =
  `careslink_v1_preview_runner_terminal_runtime_${ACQUISITION_DIGEST.slice(0, 16)}`;
const SCRAM_VERIFIER =
  `SCRAM-SHA-256$4096:${"A".repeat(22)}==` +
  `$${"B".repeat(43)}=:${"C".repeat(43)}=`;
const CREDENTIAL_VERIFIER_SHA256 = sha256(SCRAM_VERIFIER);
const ISSUED_AT = "2026-08-31T01:00:00.000Z";
const EXPIRES_AT = "2026-08-31T01:01:15.000Z";
const BACKEND_PID = 321;

type SessionPlan = Readonly<{
  queryResult?: unknown;
  queryError?: unknown;
  closeError?: unknown;
}>;

function acquireRequest() {
  return {
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
    acquisitionRequestDigest: ACQUISITION_DIGEST,
    authorizationDigest: AUTHORIZATION_DIGEST,
    runIdHash: RUN_ID_HASH,
    databaseTargetDigest: DATABASE_TARGET_DIGEST,
    callerIdentityHmac: CALLER_IDENTITY_HMAC,
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
    runtimeRole: RUNTIME_ROLE,
    leaseReferenceSha256: LEASE_REFERENCE_SHA256,
    sessionBindingSha256: SESSION_BINDING_SHA256,
    credentialVerifierSha256: CREDENTIAL_VERIFIER_SHA256,
    credentialVerifier: SCRAM_VERIFIER,
    requestedExpiresAt: EXPIRES_AT,
    rawCredentialMaterialPresent: false,
  } as const;
}

function bindRequest() {
  return {
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
    acquisitionRequestDigest: ACQUISITION_DIGEST,
    authorizationDigest: AUTHORIZATION_DIGEST,
    runIdHash: RUN_ID_HASH,
    databaseTargetDigest: DATABASE_TARGET_DIGEST,
    runtimeRole: RUNTIME_ROLE,
    leaseReferenceSha256: LEASE_REFERENCE_SHA256,
    sessionBindingSha256: SESSION_BINDING_SHA256,
    backendPid: BACKEND_PID,
    rawCredentialMaterialPresent: false,
  } as const;
}

function releaseRequest() {
  return {
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
    acquisitionRequestDigest: ACQUISITION_DIGEST,
    authorizationDigest: AUTHORIZATION_DIGEST,
    runIdHash: RUN_ID_HASH,
    databaseTargetDigest: DATABASE_TARGET_DIGEST,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
    rawCredentialMaterialPresent: false,
  } as const;
}

function acquireReceipt() {
  return queryResult({
    status: "ISSUED_UNBOUND",
    acquisitionRequestDigest: ACQUISITION_DIGEST,
    runtimeRole: RUNTIME_ROLE,
    leaseReferenceSha256: LEASE_REFERENCE_SHA256,
    sessionBindingSha256: SESSION_BINDING_SHA256,
    credentialVerifierSha256: CREDENTIAL_VERIFIER_SHA256,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    rawCredentialMaterialPresent: false,
  });
}

function bindReceipt() {
  return queryResult({
    status: "ACTIVE",
    acquisitionRequestDigest: ACQUISITION_DIGEST,
    runtimeRole: RUNTIME_ROLE,
    leaseReferenceSha256: LEASE_REFERENCE_SHA256,
    sessionBindingSha256: SESSION_BINDING_SHA256,
    backendPid: BACKEND_PID,
    rawCredentialMaterialPresent: false,
  });
}

function tombstoneReceipt() {
  return queryResult({
    status: "TOMBSTONED",
    acquisitionRequestDigest: ACQUISITION_DIGEST,
    everIssued: true,
    futureIssuanceBlocked: true,
    rawCredentialMaterialPresent: false,
  });
}

function finalizeReceipt() {
  return queryResult({
    status: "REVOKED",
    acquisitionRequestDigest: ACQUISITION_DIGEST,
    everIssued: true,
    futureIssuanceBlocked: true,
    roleCount: 0,
    sessionCount: 0,
    membershipCount: 0,
    rawCredentialMaterialPresent: false,
  });
}

function inspectReceipt() {
  return queryResult({
    status: "REVOKED_ATTESTED",
    acquisitionRequestDigest: ACQUISITION_DIGEST,
    everIssued: true,
    futureIssuanceBlocked: true,
    roleCount: 0,
    sessionCount: 0,
    membershipCount: 0,
    credentialVerifierResidueCount: 0,
    rawCredentialMaterialPresent: false,
  });
}

function queryResult(data: Readonly<Record<string, unknown>>) {
  return { rows: [{ data }] };
}

function createFactory(plans: readonly SessionPlan[]) {
  const queue = [...plans];
  const sessions: Array<{
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }> = [];
  const open = vi.fn(async () => {
    const plan = queue.shift();
    if (!plan) throw new Error("UNEXPECTED_OPEN");
    const query = vi.fn(async () => {
      if (plan.queryError !== undefined) throw plan.queryError;
      return plan.queryResult;
    });
    const end = vi.fn(async () => {
      if (plan.closeError !== undefined) throw plan.closeError;
    });
    const session = { query, end };
    sessions.push(session);
    return session;
  });
  return { open, sessions };
}

function createAdapters(plans: readonly SessionPlan[]) {
  const factory = createFactory(plans);
  const adapters =
    createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters(
      {
        capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_BROKER_ADAPTERS",
        managementSessionFactory: { open: factory.open },
      },
    );
  return { adapters, factory };
}

function context() {
  return { signal: new AbortController().signal } as const;
}

function expectDisabled(error: unknown, forbidden?: string) {
  expect(error).toMatchObject({
    code: "PRODUCT_API_DISABLED",
    message: "Communication Note approved runtime broker adapter is unavailable",
  });
  if (forbidden) {
    expect(String(error)).not.toContain(forbidden);
    expect(JSON.stringify(error)).not.toContain(forbidden);
  }
}

describe("Communication Note approved runtime broker source adapter", () => {
  it("keeps runtime approval and the formal factory closed", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_BROKER_PORT,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_BROKER_AUDIT_PORT,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY,
    ).toMatchObject({
      version:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_VERSION,
      policyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY_DIGEST,
      ready: false,
      freshSingleUseManagementSessionPerOperation: true,
      automaticMutationRetry: false,
      targetBinding: "REQUIRED_BY_SEALED_COMPOSITION",
    });
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters(
        {},
      ),
    ).toThrowError(
      expect.objectContaining({ code: "PRODUCT_API_DISABLED" }),
    );
  });

  it("uses exact SQL and arguments on five distinct single-use sessions", async () => {
    const { adapters, factory } = createAdapters([
      { queryResult: acquireReceipt() },
      { queryResult: bindReceipt() },
      { queryResult: tombstoneReceipt() },
      { queryResult: finalizeReceipt() },
      { queryResult: inspectReceipt() },
    ]);
    const callContext = context();

    await expect(
      adapters.brokerPort.acquire(acquireRequest(), callContext),
    ).resolves.toMatchObject({ status: "ISSUED_UNBOUND" });
    await expect(
      adapters.brokerPort.bind(bindRequest(), callContext),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(
      adapters.brokerPort.tombstone(releaseRequest(), callContext),
    ).resolves.toMatchObject({ status: "TOMBSTONED" });
    await expect(
      adapters.brokerPort.finalize(releaseRequest(), callContext),
    ).resolves.toMatchObject({ status: "REVOKED" });
    await expect(
      adapters.auditPort.inspect(releaseRequest(), callContext),
    ).resolves.toMatchObject({ status: "REVOKED_ATTESTED" });

    expect(factory.open).toHaveBeenCalledTimes(5);
    expect(new Set(factory.sessions).size).toBe(5);
    expect(adapters.auditPort.inspect).not.toBe(adapters.brokerPort.acquire);
    expect(adapters.auditPort.inspect).not.toBe(adapters.brokerPort.bind);
    expect(adapters.auditPort.inspect).not.toBe(
      adapters.brokerPort.tombstone,
    );
    expect(adapters.auditPort.inspect).not.toBe(adapters.brokerPort.finalize);
    for (const session of factory.sessions) {
      expect(session.query).toHaveBeenCalledTimes(1);
      expect(session.end).toHaveBeenCalledTimes(1);
    }
    expect(factory.sessions[0]?.query).toHaveBeenCalledWith(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_ACQUIRE_SQL,
      [
        ACQUISITION_DIGEST,
        AUTHORIZATION_DIGEST,
        RUN_ID_HASH,
        DATABASE_TARGET_DIGEST,
        CALLER_IDENTITY_HMAC,
        RUNTIME_ROLE,
        LEASE_REFERENCE_SHA256,
        SESSION_BINDING_SHA256,
        SCRAM_VERIFIER,
        CREDENTIAL_VERIFIER_SHA256,
        EXPIRES_AT,
      ],
      expect.objectContaining({ signal: callContext.signal }),
    );
    expect(factory.sessions[1]?.query).toHaveBeenCalledWith(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_BIND_SQL,
      [ACQUISITION_DIGEST, BACKEND_PID],
      expect.objectContaining({ signal: callContext.signal }),
    );
    expect(factory.sessions[2]?.query).toHaveBeenCalledWith(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_TOMBSTONE_SQL,
      [ACQUISITION_DIGEST],
      expect.objectContaining({ signal: callContext.signal }),
    );
    expect(factory.sessions[3]?.query).toHaveBeenCalledWith(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_FINALIZE_SQL,
      [ACQUISITION_DIGEST],
      expect.objectContaining({ signal: callContext.signal }),
    );
    expect(factory.sessions[4]?.query).toHaveBeenCalledWith(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_INSPECT_SQL,
      [ACQUISITION_DIGEST],
      expect.objectContaining({ signal: callContext.signal }),
    );
  });

  it.each([
    ["acquire", acquireRequest()],
    ["bind", bindRequest()],
    ["tombstone", releaseRequest()],
    ["finalize", releaseRequest()],
    ["inspect", releaseRequest()],
  ] as const)("does not retry %s after a database response loss", async (operation, request) => {
    const secret = `postgresql://postgres:never-log-${operation}@example.invalid`;
    const { adapters, factory } = createAdapters([
      { queryError: new Error(secret) },
    ]);
    let error: unknown;
    try {
      if (operation === "inspect") {
        await adapters.auditPort.inspect(request, context());
      } else {
        await adapters.brokerPort[operation](request, context());
      }
    } catch (caught) {
      error = caught;
    }
    expectDisabled(error, secret);
    expect(factory.open).toHaveBeenCalledTimes(1);
    expect(factory.sessions).toHaveLength(1);
    expect(factory.sessions[0]?.query).toHaveBeenCalledTimes(1);
    expect(factory.sessions[0]?.end).toHaveBeenCalledTimes(1);
  });

  it("lets close failure override an otherwise valid receipt", async () => {
    const secret = "close-failed-with-password-never-reflect";
    const { adapters, factory } = createAdapters([
      {
        queryResult: acquireReceipt(),
        closeError: new Error(secret),
      },
    ]);
    let error: unknown;
    try {
      await adapters.brokerPort.acquire(acquireRequest(), context());
    } catch (caught) {
      error = caught;
    }
    expectDisabled(error, secret);
    expect(factory.open).toHaveBeenCalledTimes(1);
    expect(factory.sessions[0]?.query).toHaveBeenCalledTimes(1);
    expect(factory.sessions[0]?.end).toHaveBeenCalledTimes(1);
  });

  it("rejects reused sessions and malformed receipts without another mutation", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(tombstoneReceipt())
      .mockResolvedValueOnce(finalizeReceipt());
    const end = vi.fn(async () => {});
    const reused = { query, end };
    const open = vi.fn(async () => reused);
    const adapters =
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters(
        {
          capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_BROKER_ADAPTERS",
          managementSessionFactory: { open },
        },
      );
    await expect(
      adapters.brokerPort.tombstone(releaseRequest(), context()),
    ).resolves.toMatchObject({ status: "TOMBSTONED" });
    await expect(
      adapters.brokerPort.finalize(releaseRequest(), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(open).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);

    const malformed = createAdapters([
      {
        queryResult: {
          rows: [{ data: { ...inspectReceipt().rows[0].data, extra: true } }],
        },
      },
    ]);
    await expect(
      malformed.adapters.auditPort.inspect(releaseRequest(), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(malformed.factory.sessions[0]?.end).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed or aborted requests before opening a session", async () => {
    const { adapters, factory } = createAdapters([
      { queryResult: acquireReceipt() },
    ]);
    await expect(
      adapters.brokerPort.acquire(
        { ...acquireRequest(), rawCredentialMaterialPresent: true },
        context(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapters.brokerPort.acquire(acquireRequest(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(factory.open).not.toHaveBeenCalled();
  });

  it("closes a session when Abort wins immediately after open", async () => {
    const controller = new AbortController();
    const query = vi.fn(async () => acquireReceipt());
    const end = vi.fn(async () => undefined);
    const open = vi.fn(async () => {
      controller.abort();
      return { query, end };
    });
    const adapters =
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters(
        {
          capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_BROKER_ADAPTERS",
          managementSessionFactory: { open },
        },
      );

    await expect(
      adapters.brokerPort.acquire(acquireRequest(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(open).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledOnce();
  });

  it("rejects when Abort wins during authoritative session close", async () => {
    const controller = new AbortController();
    const query = vi.fn(async () => acquireReceipt());
    const end = vi.fn(async () => {
      controller.abort();
    });
    const open = vi.fn(async () => ({ query, end }));
    const adapters =
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters(
        {
          capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_BROKER_ADAPTERS",
          managementSessionFactory: { open },
        },
      );

    await expect(
      adapters.brokerPort.acquire(acquireRequest(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(query).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
  });

  it("contains no endpoint, environment, logging or retry path", () => {
    const source = readTextFileSync(new URL(
      "./communication-note-preview-approved-runtime-broker.server.ts",
      import.meta.url,
    ), "utf8");
    expect(source).not.toMatch(/process\.env|console\.|postgres(?:ql)?:\/\//);
    expect(source).not.toMatch(/DATABASE_URL|PGPASSWORD|SUPABASE_DB_PASSWORD/);
    expect(source).not.toMatch(/\bpassword\b|\bdsn\b/i);
    expect(source).not.toMatch(/automaticRetry|retry\s*\(/);
  });
});

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
