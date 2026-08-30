import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";

const captured = vi.hoisted(() => ({
  sessionFactory: undefined as
    | Readonly<{
        open: (request: unknown, context: unknown) => PromiseLike<unknown>;
      }>
    | undefined,
  durableOptions: undefined as Record<string, unknown> | undefined,
  targetAccesses: [] as Array<{ tlsRootCertificate: Uint8Array }>,
  mutateTargetAccess: undefined as
    | ((value: Record<string, unknown>) => Record<string, unknown>)
    | undefined,
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "./communication-note-preview-approved-runtime-target.server",
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import("./communication-note-preview-approved-runtime-target.server")
    >();
    return {
      ...original,
      readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
        access: unknown,
        capability: unknown,
        descriptor: unknown,
      ) {
        const resolved =
          original.readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
            access,
            capability,
            descriptor,
          );
        const value = captured.mutateTargetAccess
          ? captured.mutateTargetAccess(
              resolved as unknown as Record<string, unknown>,
            )
          : resolved;
        captured.targetAccesses.push(
          value as unknown as { tlsRootCertificate: Uint8Array },
        );
        return value;
      },
    };
  },
);
vi.mock(
  "./communication-note-preview-durable-caller-credential-resolver.server",
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import("./communication-note-preview-durable-caller-credential-resolver.server")
    >();
    return {
      ...original,
      createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver(
        value: unknown,
      ) {
        captured.durableOptions = value as Record<string, unknown>;
        captured.sessionFactory = (value as Record<string, unknown>)
          .sessionFactory as typeof captured.sessionFactory;
        return original.createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver(
          value,
        );
      },
    };
  },
);

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_ADAPTER_BUNDLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_VERSION,
  createCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters,
} from "./communication-note-preview-approved-runtime-adapters.server";
import {
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver,
} from "./communication-note-preview-approved-runtime-target.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_POSTURE_SQL,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig,
} from "./communication-note-preview-approved-runtime-management-session.server";
import {
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig,
} from "./communication-note-preview-approved-runtime-postgres-session.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
  type CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
} from "./communication-note-preview-durable-caller-credential-resolver.server";
import {
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver,
  type CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
} from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";
import { createM1ghRunnerTerminalTrustFixture } from "./communication-note-preview-runner-terminal-trust-test-fixtures";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";

const NOW = "2026-08-31T12:00:00.000Z";
const TARGET_REF = "abcdefghijklmnopqrst";
const CA_BYTES = new TextEncoder().encode(
  "-----BEGIN CERTIFICATE-----\nMIIB-test-only-approved-runtime\n-----END CERTIFICATE-----\n",
);
const CA_SHA256 = sha256(CA_BYTES);
const TARGET_HMAC = "1".repeat(64);
const PRODUCTION_HMAC = "2".repeat(64);
const CONTROL_PLANE_EVIDENCE = "4".repeat(64);
const RUNTIME_PASSWORD = "S".repeat(43);
const MANAGEMENT_PASSWORD = "M".repeat(32);

describe("Communication Note M1m approved runtime adapters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    captured.sessionFactory = undefined;
    captured.durableOptions = undefined;
    captured.targetAccesses.length = 0;
    captured.mutateTargetAccess = undefined;
    FakeClient.constructed = 0;
    FakeClient.ended = 0;
    FakeClient.connectFailure = undefined;
    FakeClient.lastConfig = undefined;
    FakeClient.passwordObservedAtConstruction = undefined;
    FakeManagementClient.constructed = 0;
    FakeManagementClient.ended = 0;
    FakeManagementClient.lastConfig = undefined;
    FakeManagementClient.passwordObservedAtConstruction = undefined;
    FakeManagementClient.brokerResult = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is source-only, default-off and keeps the formal factory fail closed", async () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_ADAPTER_BUNDLE,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_VERSION,
    ).toBe(
      "adapters.communication.openai.synthetic-preview.2026-08-31.m1m.v1",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY_DIGEST,
    ).toBe(
      "f8ee0df473161d6acb3c6e601a96014c97c2e460e1d6004f5d7c1d8c56583abc",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY,
    ).toMatchObject({
      ready: false,
      sameSealedTargetRequired: true,
      managementCredentialTransport: "ONE_USE_CALLBACK_ONLY",
      managementConnectionProfileDerivedFromSealedTarget: true,
      managementSessionPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
      rawCredentialMaterialPresent: false,
      activationApproved: false,
      policyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY_DIGEST,
    });
    await expect(
      createCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
        {},
        context(),
      ),
    ).rejects.toMatchObject(fixedFailure());
  });

  it("wires one genuine sealed target through broker, pg, durable resolver and M1l binding", async () => {
    const harness = createFactoryHarness();
    const bundle = await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
      harness.options,
      context(),
    );

    expect(bundle).toMatchObject({
      status: "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTER_BUNDLE_NOT_ACTIVATED",
      databaseTarget: expectedDatabaseTarget(),
      runtimePort: {
        status: "TEST_ONLY_SOURCE_CONTRACT_NOT_APPROVED",
        purpose: "RUNNER_TERMINAL_PERSISTENCE",
        callerRole: "careslink_v1_preview_runner_terminal_caller",
      },
    });
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.keys(bundle)).toEqual([
      "status",
      "databaseTarget",
      "runtimePort",
    ]);
    expect(bundle).not.toHaveProperty("brokerPort");
    expect(bundle).not.toHaveProperty("auditPort");
    expect(bundle).not.toHaveProperty("callerCredentialResolver");
    expect(bundle).not.toHaveProperty("targetCapability");
    expect(JSON.stringify(bundle)).not.toContain(TARGET_REF);
    expect(JSON.stringify(bundle)).not.toContain("pooler.supabase.com");
    expect(JSON.stringify(bundle)).not.toContain("CERTIFICATE");
    expect(captured.sessionFactory).toEqual({
      open: expect.any(Function),
    });
    expect(captured.durableOptions).toMatchObject({
      capability: "TEST_ONLY_M1L_DURABLE_CALLER_CREDENTIAL_RESOLVER",
      brokerPort: {
        acquire: expect.any(Function),
        bind: expect.any(Function),
        tombstone: expect.any(Function),
        finalize: expect.any(Function),
      },
      auditPort: { inspect: expect.any(Function) },
      sessionFactory: { open: expect.any(Function) },
    });
    expect(captured.targetAccesses).toHaveLength(1);
    expect([...captured.targetAccesses[0].tlsRootCertificate])
      .toEqual(new Array(CA_BYTES.length).fill(0));
  });

  it("derives the concrete management session from the same sealed target", async () => {
    const harness = createFactoryHarness();
    const bundle = await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
      harness.options,
      context(),
    );
    FakeManagementClient.brokerResult = brokerAcquireReceipt(
      bundle.databaseTarget,
    );

    await expect(
      requireBrokerPort().acquire(
        brokerAcquireRequest(bundle.databaseTarget),
        context(),
      ),
    ).resolves.toMatchObject({
      status: "ISSUED_UNBOUND",
      acquisitionRequestDigest: "a".repeat(64),
      rawCredentialMaterialPresent: false,
    });
    const credentialRequest = harness.managementConsume.mock.calls[0]?.[0];
    expect(credentialRequest).toMatchObject({
      targetDescriptorSha256: canonicalSha256(bundle.databaseTarget),
      tlsRootCertificateSha256: CA_SHA256,
      user: "postgres",
      applicationName:
        "careslink-preview-runtime-credential-broker-management",
      credentialExpiresNoLaterThan: bundle.databaseTarget.expiresAt,
      maximumCredentialLifetimeMs: 60_000,
    });
    expect(FakeManagementClient.constructed).toBe(1);
    expect(FakeManagementClient.passwordObservedAtConstruction).toBe(
      MANAGEMENT_PASSWORD,
    );
    expect(FakeManagementClient.lastConfig).toMatchObject({
      host: `db.${TARGET_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: undefined,
      application_name:
        "careslink-preview-runtime-credential-broker-management",
      ssl: { rejectUnauthorized: true },
    });
    expect(FakeManagementClient.lastConfig?.ssl.ca).toEqual(
      Buffer.from(CA_BYTES),
    );
    expect(FakeManagementClient.ended).toBe(1);
    expect(captured.targetAccesses).toHaveLength(2);
    for (const access of captured.targetAccesses) {
      expect(access.tlsRootCertificate.every((byte) => byte === 0)).toBe(
        true,
      );
    }
  });

  it("opens pg only after exact target binding and clears every reader CA copy", async () => {
    const bundle = await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
      createFactoryHarness().options,
      context(),
    );
    const session = await requireSessionFactory().open(
      openRequest(bundle.databaseTarget),
      context(),
    ) as { destroy: () => PromiseLike<void> };

    expect(FakeClient.constructed).toBe(1);
    expect(FakeClient.passwordObservedAtConstruction).toBe(
      RUNTIME_PASSWORD,
    );
    expect(FakeClient.lastConfig).toMatchObject({
      host: `db.${TARGET_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: expect.stringMatching(
        /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/,
      ),
      password: undefined,
      application_name:
        "careslink-preview-runtime-credential-broker-runtime",
      ssl: { rejectUnauthorized: true },
    });
    expect(FakeClient.lastConfig?.ssl.ca).toEqual(Buffer.from(CA_BYTES));
    expect(captured.targetAccesses).toHaveLength(2);
    for (const access of captured.targetAccesses) {
      expect([...access.tlsRootCertificate]).toEqual(
        new Array(CA_BYTES.length).fill(0),
      );
    }
    await session.destroy();
    expect(FakeClient.ended).toBe(1);
  });

  it.each([
    ["database target digest", { databaseTargetDigest: "6".repeat(64) }],
    ["target HMAC", { targetProjectRefHmac: "6".repeat(64) }],
    ["Production HMAC", { productionProjectRefHmac: "6".repeat(64) }],
    ["control-plane evidence", { controlPlaneEvidenceSha256: "6".repeat(64) }],
    ["CA pin", { tlsRootCertificateSha256: "6".repeat(64) }],
    ["database", { databaseName: "template1" }],
    ["PG/session mode", { requiredConnectionMode: "TRANSACTION_POOLER" }],
    ["target class", { targetClass: "PRODUCTION" }],
    ["expiry", { expiresAt: "2026-08-31T12:04:00.001Z" }],
  ])("rejects cross-mixed %s before constructing a Client", async (_name, mutation) => {
    const bundle = await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
      createFactoryHarness().options,
      context(),
    );
    await expect(
      requireSessionFactory().open(
        { ...openRequest(bundle.databaseTarget), ...mutation },
        context(),
      ),
    ).rejects.toMatchObject(fixedFailure());
    expect(FakeClient.constructed).toBe(0);
  });

  it("rejects A-management credential plus B-runtime target binding", async () => {
    const harness = createFactoryHarness({
      managementCredentialMutation: {
        targetDescriptorSha256: "f".repeat(64),
      },
    });
    const bundle = await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
      harness.options,
      context(),
    );
    FakeManagementClient.brokerResult = brokerAcquireReceipt(
      bundle.databaseTarget,
    );
    await expect(
      requireBrokerPort().acquire(
        brokerAcquireRequest(bundle.databaseTarget),
        context(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(harness.managementConsume).toHaveBeenCalledOnce();
    expect(FakeManagementClient.constructed).toBe(0);
    expect(FakeClient.constructed).toBe(0);
  });

  it("rejects endpoint or CA cross-mix returned after exact-symbol access", async () => {
    const bundle = await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
      createFactoryHarness().options,
      context(),
    );
    captured.mutateTargetAccess = (value) => ({
      ...value,
      endpoint: {
        ...(value.endpoint as Record<string, unknown>),
        hostname: "db.zyxwvutsrqponmlkjihg.supabase.co",
      },
    });
    await expect(
      requireSessionFactory().open(openRequest(bundle.databaseTarget), context()),
    ).rejects.toMatchObject(fixedFailure());
    expect(FakeClient.constructed).toBe(0);

    captured.mutateTargetAccess = (value) => ({
      ...value,
      tlsRootCertificate: new TextEncoder().encode("cross-mixed-ca"),
    });
    await expect(
      requireSessionFactory().open(openRequest(bundle.databaseTarget), context()),
    ).rejects.toMatchObject(fixedFailure());
    expect(FakeClient.constructed).toBe(0);
  });

  it("folds password-bearing transport errors without logging or exposing internals", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bundle = await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
        createFactoryHarness().options,
        context(),
      );
      FakeClient.connectFailure = new Error(
        `driver exposed ${RUNTIME_PASSWORD}`,
      );
      const error = await Promise.resolve(
        requireSessionFactory().open(
          openRequest(bundle.databaseTarget),
          context(),
        ),
      )
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject(fixedFailure());
      expect(String(error)).not.toContain(RUNTIME_PASSWORD);
      expect(errorLog).not.toHaveBeenCalled();
      expect(warningLog).not.toHaveBeenCalled();
      expect(JSON.stringify(bundle)).not.toContain(RUNTIME_PASSWORD);
      expect(captured.targetAccesses.at(-1)?.tlsRootCertificate.every(
        (byte) => byte === 0,
      )).toBe(true);
    } finally {
      errorLog.mockRestore();
      warningLog.mockRestore();
    }
  });

  it("rejects expanded options, proxies and aborted calls", async () => {
    const harness = createFactoryHarness();
    await expect(
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
        { ...harness.options, extra: true },
        context(),
      ),
    ).rejects.toMatchObject(fixedFailure());
    await expect(
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
        {
          ...harness.options,
          managementCredentialTransport: new Proxy(
            harness.options.managementCredentialTransport,
            {},
          ),
        },
        context(),
      ),
    ).rejects.toMatchObject(fixedFailure());
    const controller = new AbortController();
    controller.abort();
    await expect(
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
        harness.options,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject(fixedFailure());
  });
});

class FakeClient {
  static constructed = 0;
  static ended = 0;
  static connectFailure: Error | undefined;
  static lastConfig:
    | CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig
    | undefined;
  static passwordObservedAtConstruction: string | undefined;

  processID = 4242;
  password: unknown;
  connectionParameters: { password: unknown };
  connection = {
    stream: {
      encrypted: true,
      authorized: true,
      authorizationError: null,
      destroy: vi.fn(),
    },
  };

  constructor(
    config: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig,
  ) {
    FakeClient.constructed += 1;
    FakeClient.lastConfig = config;
    FakeClient.passwordObservedAtConstruction = config.password;
    this.password = config.password;
    this.connectionParameters = { password: config.password };
  }

  async connect() {
    if (FakeClient.connectFailure) throw FakeClient.connectFailure;
  }

  async query(sql: string) {
    if (sql === "select pg_catalog.pg_backend_pid() as backend_pid") {
      return { rows: [{ backend_pid: 4242 }] };
    }
    return { rows: [] };
  }

  async end() {
    FakeClient.ended += 1;
  }

  on(_event: "error", _listener: (error: unknown) => void) {
    void _event;
    void _listener;
    return this;
  }
}

class FakeManagementClient {
  static constructed = 0;
  static ended = 0;
  static lastConfig:
    | CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig
    | undefined;
  static passwordObservedAtConstruction: string | undefined;
  static brokerResult: unknown;

  password: unknown;
  connectionParameters: { password: unknown };
  connection = {
    stream: {
      encrypted: true,
      authorized: true,
      authorizationError: null,
      destroy: vi.fn(),
    },
  };

  constructor(
    config: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig,
  ) {
    FakeManagementClient.constructed += 1;
    FakeManagementClient.lastConfig = config;
    FakeManagementClient.passwordObservedAtConstruction = config.password;
    this.password = config.password;
    this.connectionParameters = { password: config.password };
  }

  async connect() {}

  async query(sql: string) {
    if (
      sql ===
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_POSTURE_SQL
    ) {
      return {
        rows: [{
          current_user: "postgres",
          session_user: "postgres",
          database_name: "postgres",
          postgres_major: 17,
          application_name:
            "careslink-preview-runtime-credential-broker-management",
          row_security: "on",
        }],
      };
    }
    return FakeManagementClient.brokerResult;
  }

  async end() {
    FakeManagementClient.ended += 1;
  }

  on(_event: "error", _listener: (error: unknown) => void) {
    void _event;
    void _listener;
    return this;
  }
}

function createFactoryHarness(options: {
  managementCredentialMutation?: Record<string, unknown>;
} = {}) {
  const fixture = createM1ghRunnerTerminalTrustFixture({ now: NOW });
  const targetResolver = createTargetResolver();
  const custodyResolver =
    createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver({
      capability: "TEST_ONLY_RUNNER_TERMINAL_CUSTODY_RESOLVER",
      resolve: vi.fn(),
    });
  const managementConsume = vi.fn(async (
    request: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
    _context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    consumer: (credential: unknown) => PromiseLike<void>,
  ) => {
    void _context;
    await consumer({
      targetDescriptorSha256: request.targetDescriptorSha256,
      tlsRootCertificateSha256: request.tlsRootCertificateSha256,
      user: request.user,
      applicationName: request.applicationName,
      password: MANAGEMENT_PASSWORD,
      issuedAt: NOW,
      expiresAt: "2026-08-31T12:00:30.000Z",
      oneUse: true,
      rawDsnPresent: false,
      ...options.managementCredentialMutation,
    });
  });
  let entropyByte = 10;
  const factoryOptions = {
    capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTERS",
    targetResolver,
    targetRequest: {
      targetProjectRef: TARGET_REF,
      tlsRootCertificateSha256: CA_SHA256,
    },
    verifiedAuthorization: fixture.verifiedAuthorization,
    custodyResolver,
    managementCredentialTransport: { consume: managementConsume },
    ManagementClient: FakeManagementClient,
    Client: FakeClient,
    clock: { now: () => NOW },
    entropy: {
      bytes(length: number) {
        entropyByte += 1;
        return new Uint8Array(length).fill(entropyByte);
      },
    },
  };
  return { options: factoryOptions, managementConsume };
}

function createTargetResolver() {
  return createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver({
    capability: "TEST_ONLY_APPROVED_RUNTIME_TARGET_RESOLVER",
    controlPlaneObservationPort: {
      async observe() {
        return {
          source: "SUPABASE_CONTROL_PLANE",
          targetProjectRef: TARGET_REF,
          parentProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
          defaultBranch: false,
          persistent: false,
          withData: false,
          postgresMajor: 17,
          projectStatus: "ACTIVE_HEALTHY",
          observedAt: "2026-08-31T11:58:00.000Z",
          expiresAt: "2026-08-31T12:04:00.000Z",
          controlPlaneEvidenceSha256: CONTROL_PLANE_EVIDENCE,
          tlsRootCertificateSha256: CA_SHA256,
          endpoint: {
            connectionMode: "DIRECT",
            hostname: `db.${TARGET_REF}.supabase.co`,
            port: 5432,
            database: "postgres",
            usernameProjectRefSuffix: null,
          },
          rawCredentialMaterialPresent: false,
        };
      },
    },
    projectRefHmacPort: {
      async hmac({ projectRef }: { projectRef: string }) {
        return {
          projectRefHmac:
            projectRef === CARESLINK_PRODUCTION_SUPABASE_REF
              ? PRODUCTION_HMAC
              : TARGET_HMAC,
          keyReferenceSha256: "3".repeat(64),
          rawKeyMaterialPresent: false,
        };
      },
    },
    pinnedCaLoader: {
      async load() {
        return {
          tlsRootCertificate: CA_BYTES,
          rawCredentialMaterialPresent: false,
        };
      },
    },
    clock: { now: () => NOW },
  });
}

function expectedDatabaseTarget() {
  return {
    status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
    targetProjectRefHmac: TARGET_HMAC,
    productionProjectRefHmac: PRODUCTION_HMAC,
    controlPlaneEvidenceSha256: CONTROL_PLANE_EVIDENCE,
    databaseName: "postgres",
    postgresMajor: 17,
    projectStatus: "ACTIVE_HEALTHY",
    tlsMode: "VERIFY_FULL_PINNED_CA",
    tlsRootCertificateSha256: CA_SHA256,
    observedAt: "2026-08-31T11:58:00.000Z",
    expiresAt: "2026-08-31T12:04:00.000Z",
    defaultBranch: false,
    persistent: false,
    withData: false,
    productionExcluded: true,
    rawCredentialMaterialPresent: false,
  } as const;
}

function openRequest(
  databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
) {
  const acquisitionRequestDigest = "a".repeat(64);
  return {
    acquisitionRequestDigest,
    runtimeRole:
      `careslink_v1_preview_runner_terminal_runtime_${acquisitionRequestDigest.slice(0, 16)}`,
    password: RUNTIME_PASSWORD,
    databaseName: "postgres",
    requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE",
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
    databaseTargetDigest: canonicalSha256(databaseTarget),
    targetProjectRefHmac: databaseTarget.targetProjectRefHmac,
    productionProjectRefHmac: databaseTarget.productionProjectRefHmac,
    controlPlaneEvidenceSha256:
      databaseTarget.controlPlaneEvidenceSha256,
    tlsMode: "VERIFY_FULL_PINNED_CA",
    tlsRootCertificateSha256:
      databaseTarget.tlsRootCertificateSha256,
    expiresAt: "2026-08-31T12:01:00.000Z",
  };
}

function requireSessionFactory() {
  if (!captured.sessionFactory) throw new Error("session factory expected");
  return captured.sessionFactory;
}

function requireBrokerPort() {
  const brokerPort = captured.durableOptions?.brokerPort;
  if (!brokerPort || typeof brokerPort !== "object") {
    throw new Error("broker port expected");
  }
  return brokerPort as Readonly<{
    acquire: (
      request: unknown,
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
  }>;
}

function brokerAcquireRequest(
  databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
) {
  const acquisitionRequestDigest = "a".repeat(64);
  const verifier =
    `SCRAM-SHA-256$4096:${"A".repeat(22)}==` +
    `$${"B".repeat(43)}=:${"C".repeat(43)}=`;
  return {
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
    acquisitionRequestDigest,
    authorizationDigest: "b".repeat(64),
    runIdHash: "c".repeat(64),
    databaseTargetDigest: canonicalSha256(databaseTarget),
    callerIdentityHmac: "e".repeat(64),
    purpose: "RUNNER_TERMINAL_PERSISTENCE",
    callerRole: "careslink_v1_preview_runner_terminal_caller",
    runtimeRole:
      `careslink_v1_preview_runner_terminal_runtime_${acquisitionRequestDigest.slice(0, 16)}`,
    leaseReferenceSha256: "f".repeat(64),
    sessionBindingSha256: "6".repeat(64),
    credentialVerifierSha256: sha256(
      new TextEncoder().encode(verifier),
    ),
    credentialVerifier: verifier,
    requestedExpiresAt: "2026-08-31T12:01:00.000Z",
    rawCredentialMaterialPresent: false,
  };
}

function brokerAcquireReceipt(
  databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
) {
  const request = brokerAcquireRequest(databaseTarget);
  return {
    rows: [{
      data: {
        status: "ISSUED_UNBOUND",
        acquisitionRequestDigest: request.acquisitionRequestDigest,
        runtimeRole: request.runtimeRole,
        leaseReferenceSha256: request.leaseReferenceSha256,
        sessionBindingSha256: request.sessionBindingSha256,
        credentialVerifierSha256: request.credentialVerifierSha256,
        issuedAt: NOW,
        expiresAt: "2026-08-31T12:01:00.000Z",
        rawCredentialMaterialPresent: false,
      },
    }],
  };
}

function context() {
  return { signal: new AbortController().signal };
}

function fixedFailure() {
  return {
    code: "PRODUCT_API_DISABLED",
    message: "Communication Note preview approved runtime adapters are unavailable",
  };
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}
