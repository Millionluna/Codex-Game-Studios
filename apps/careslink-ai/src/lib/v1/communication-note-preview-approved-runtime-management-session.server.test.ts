import { createHash } from "node:crypto";
import { readFileSync as readTextFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import type { CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession } from "./communication-note-preview-approved-runtime-broker.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_MANAGEMENT_SESSION_FACTORY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_CREDENTIAL_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_POSTURE_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_VERSION,
  createCaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementSessionFactory,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementSessionFactory,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
} from "./communication-note-preview-approved-runtime-management-session.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";

vi.mock("server-only", () => ({}));

const PROJECT_REF = "abcdefghijklmnopqrst";
const DESCRIPTOR_SHA256 = "d".repeat(64);
const CA = Buffer.from(
  "-----BEGIN CERTIFICATE-----\nM1M-TEST-ROOT\n-----END CERTIFICATE-----\n",
  "utf8",
);
const CA_SHA256 = createHash("sha256").update(CA).digest("hex");
const PASSWORD = "management-password-M1m-only";

type ClientPlan = Readonly<{
  encrypted?: boolean;
  authorized?: boolean;
  authorizationError?: unknown;
  postureRow?: Readonly<Record<string, unknown>>;
  connectPromise?: PromiseLike<unknown>;
  queryPromise?: PromiseLike<unknown>;
  endPromise?: PromiseLike<unknown>;
  constructorError?: unknown;
  missingDestroy?: boolean;
}>;

type TestSession = CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession;

function context(signal = new AbortController().signal) {
  return { signal } as const;
}

function profile(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: "postgres",
    projectRef: PROJECT_REF,
    connectionMode: "DIRECT",
    sslRootCertificate: Uint8Array.from(CA),
    sslRootCertificateSha256: CA_SHA256,
    targetDescriptorSha256: DESCRIPTOR_SHA256,
    expiresAt: new Date(Date.now() + 2 * 60 * 1_000).toISOString(),
    ...overrides,
  };
}

function postureRow(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    current_user: "postgres",
    session_user: "postgres",
    database_name: "postgres",
    postgres_major: 17,
    application_name:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME,
    row_security: "on",
    ...overrides,
  };
}

function credential(
  request: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const now = Date.now();
  return {
    targetDescriptorSha256: request.targetDescriptorSha256,
    tlsRootCertificateSha256: request.tlsRootCertificateSha256,
    user: request.user,
    applicationName: request.applicationName,
    credentialClass: request.credentialClass,
    sourceExpiresAt: request.sourceExpiresAt,
    sourceRevocation: request.sourceRevocation,
    password: PASSWORD,
    deliveryIssuedAt: new Date(now - 1_000).toISOString(),
    deliveryExpiresAt: new Date(now + 30_000).toISOString(),
    deliveryOneUse: true,
    rawDsnPresent: false,
    ...overrides,
  };
}

function createHarness(options: {
  connectionProfile?: Record<string, unknown>;
  clientPlan?: ClientPlan;
  consume?: (
    request: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
    callContext: Readonly<{ signal: AbortSignal }>,
    consumer: (credentialValue: unknown) => PromiseLike<void>,
  ) => PromiseLike<unknown>;
} = {}) {
  const plan = options.clientPlan ?? {};
  const configs: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig[] =
    [];
  const clients: MockClient[] = [];
  const requests: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest[] =
    [];
  let callbackCalls = 0;

  class MockClient {
    password: unknown;
    connectionParameters: { password: unknown };
    connection: {
      stream: {
        encrypted: boolean;
        authorized: boolean;
        authorizationError: unknown;
        destroy: ReturnType<typeof vi.fn>;
      };
    };
    readonly connect = vi.fn(async () => {
      if (plan.connectPromise) await plan.connectPromise;
    });
    readonly query = vi.fn(
      async (sql: string, _values?: readonly unknown[]) => {
        void _values;
        if (
          sql ===
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_POSTURE_SQL
        ) {
          return {
            command: "SELECT",
            rowCount: 1,
            rows: [plan.postureRow ?? postureRow()],
          };
        }
        if (plan.queryPromise) return await plan.queryPromise;
        return {
          command: "SELECT",
          rowCount: 1,
          fields: [{ name: "data" }],
          rows: [{ data: "normalized" }],
        };
      },
    );
    readonly end = vi.fn(async () => {
      if (plan.endPromise) await plan.endPromise;
    });
    readonly on = vi.fn(
      (_event: "error", _listener: (error: unknown) => void) => {
        void _event;
        void _listener;
        return this;
      },
    );

    constructor(
      config: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig,
    ) {
      if (plan.constructorError !== undefined) {
        throw plan.constructorError;
      }
      configs.push(config);
      this.password = config.password;
      this.connectionParameters = { password: config.password };
      this.connection = {
        stream: {
          encrypted: plan.encrypted ?? true,
          authorized: plan.authorized ?? true,
          authorizationError: plan.authorizationError,
          destroy: plan.missingDestroy
            ? (undefined as unknown as ReturnType<typeof vi.fn>)
            : vi.fn(),
        },
      };
      clients.push(this);
    }
  }

  const consume = vi.fn(
    options.consume ??
      (async (request, _callContext, consumer) => {
        requests.push(request);
        callbackCalls += 1;
        await consumer(credential(request));
      }),
  );
  const factory =
    createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementSessionFactory(
      {
        capability:
          "TEST_ONLY_M1M_APPROVED_RUNTIME_MANAGEMENT_SESSION",
        connectionProfile: options.connectionProfile ?? profile(),
        credentialTransport: { consume },
        Client: MockClient,
      },
    );

  return {
    factory,
    consume,
    configs,
    clients,
    requests,
    get callbackCalls() {
      return callbackCalls;
    },
  };
}

async function openSession(
  factory: Readonly<{
    open: (callContext: Readonly<{ signal: AbortSignal }>) => PromiseLike<unknown>;
  }>,
  callContext = context(),
) {
  return (await factory.open(callContext)) as TestSession;
}

function expectDisabled(error: unknown, forbidden?: string) {
  expect(error).toMatchObject({
    code: "PRODUCT_API_DISABLED",
    message:
      "Communication Note approved runtime management session is unavailable",
  });
  if (forbidden) {
    expect(String(error)).not.toContain(forbidden);
    expect(JSON.stringify(error)).not.toContain(forbidden);
  }
}

describe("Communication Note approved runtime management session", () => {
  it("keeps runtime approval and the formal factory closed", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_MANAGEMENT_SESSION_FACTORY,
    ).toBeUndefined();
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementSessionFactory(
        {},
      ),
    ).toThrowError(
      expect.objectContaining({ code: "PRODUCT_API_DISABLED" }),
    );
  });

  it("self-checks an immutable canonical source-off policy", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_VERSION,
    ).toBe(
      "management-session.communication.openai.synthetic-preview.2026-08-31.m1m.v2",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
    ).toBe(
      "2dc462675834a2741941e5b11a0f277cfbc6d08c6a0b4edc04346aa97dd59ce3",
    );
    const { policyDigest, ...policyCore } =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY;
    expect(policyDigest).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
    );
    expect(
      createHash("sha256")
        .update(stringifyCaresLinkV1CanonicalJson(policyCore), "utf8")
        .digest("hex"),
    ).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY,
    ).toMatchObject({
      version:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_VERSION,
      status: "SOURCE_ADAPTER_NOT_ACTIVATED",
      ready: false,
      approvedFactoryAvailable: false,
      sourceOnly: true,
      driverShape: "ONE_FRESH_EXCLUSIVE_PG_CLIENT_PER_OPEN",
      database: "postgres",
      postgresMajor: 17,
      allowedProfileConnectionModes: ["DIRECT", "SESSION_POOLER"],
      tlsMode: "VERIFY_FULL_PINNED_CA",
      rejectUnauthorized: true,
      credentialTransport: "ONE_USE_DELIVERY_CALLBACK",
      credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
      sourceCredentialSingleUse: false,
      sourceExpiresAt: null,
      sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
      deliveryEnvelopeSingleUse: true,
      maximumDeliveryAgeMs: 30_000,
      maximumDeliveryLifetimeMs: 60_000,
      retryCount: 0,
      concurrentQueryAllowed: false,
      cancellationMode: "EXACT_CLIENT_HARD_CLOSE",
      hardClosePrimitive: "TLS_STREAM_DESTROY_THEN_CLIENT_END",
      passwordReferencesClearedAfterConnect: true,
    });
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY
        .connectionProfileFields,
    ).toEqual([
      "host",
      "port",
      "database",
      "projectRef",
      "connectionMode",
      "sslRootCertificate",
      "sslRootCertificateSha256",
      "targetDescriptorSha256",
      "expiresAt",
    ]);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY
        .credentialBindingFields,
    ).toEqual([
      "targetDescriptorSha256",
      "tlsRootCertificateSha256",
      "user",
      "applicationName",
      "credentialClass",
      "sourceExpiresAt",
      "sourceRevocation",
    ]);
    expect(
      Object.isFrozen(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY,
      ),
    ).toBe(true);
    expect(
      Object.isFrozen(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY
          .connectionProfileFields,
      ),
    ).toBe(true);
  });

  it("opens a direct pinned-CA postgres management session and normalizes pg results", async () => {
    const harness = createHarness();
    const session = await openSession(harness.factory);

    expect(harness.consume).toHaveBeenCalledTimes(1);
    expect(harness.callbackCalls).toBe(1);
    expect(harness.requests).toEqual([
      {
        purpose:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_CREDENTIAL_PURPOSE,
        targetDescriptorSha256: DESCRIPTOR_SHA256,
        tlsRootCertificateSha256: CA_SHA256,
        user: "postgres",
        applicationName:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME,
        credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
        sourceExpiresAt: null,
        sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
        deliveryExpiresNoLaterThan: expect.any(String),
        maximumDeliveryLifetimeMs: 60_000,
      },
    ]);
    expect(Object.isFrozen(harness.requests[0])).toBe(true);
    expect(harness.configs[0]).toMatchObject({
      host: `db.${PROJECT_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: undefined,
      application_name:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME,
      options: "-c row_security=on",
      sslnegotiation: "postgres",
      ssl: { rejectUnauthorized: true },
    });
    expect(Buffer.compare(harness.configs[0].ssl.ca, CA)).toBe(0);
    expect(harness.clients[0].password).toBeNull();
    expect(harness.clients[0].connectionParameters.password).toBeNull();
    expect(Object.keys(session).sort()).toEqual(["end", "query"]);
    expect(JSON.stringify(session)).not.toContain(PASSWORD);

    const result = (await session.query(
      "select careslink_v1_runtime_broker.inspect($1)",
      [DESCRIPTOR_SHA256],
      context(),
    )) as Readonly<{ rows: readonly unknown[] }>;
    expect(result).toEqual({ rows: [{ data: "normalized" }] });
    expect(Object.keys(result)).toEqual(["rows"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);

    await session.end();
    await session.end();
    expect(harness.clients[0].end).toHaveBeenCalledTimes(1);
  });

  it("uses distinct one-use deliveries for the same static branch-admin source password", async () => {
    const harness = createHarness();
    const first = await openSession(harness.factory);
    await first.end();
    const second = await openSession(harness.factory);
    await second.end();

    expect(harness.consume).toHaveBeenCalledTimes(2);
    expect(harness.callbackCalls).toBe(2);
    expect(harness.clients).toHaveLength(2);
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[0]).not.toBe(harness.requests[1]);
    expect(harness.requests[0].credentialClass).toBe(
      "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
    );
    expect(harness.requests[1].sourceRevocation).toBe(
      "BRANCH_DELETE_OR_PASSWORD_RESET",
    );
  });

  it("derives the Supavisor session-pooler management user without changing posture", async () => {
    const harness = createHarness({
      connectionProfile: profile({
        host: "aws-0-ap-southeast-2.pooler.supabase.com",
        connectionMode: "SESSION_POOLER",
      }),
    });
    const session = await openSession(harness.factory);

    expect(harness.requests[0].user).toBe(`postgres.${PROJECT_REF}`);
    expect(harness.configs[0].user).toBe(`postgres.${PROJECT_REF}`);
    expect(harness.clients[0].query).toHaveBeenNthCalledWith(
      1,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_POSTURE_SQL,
    );
    await session.end();
  });

  it("makes each delivery callback one-use and closes the client on replay", async () => {
    const harness = createHarness({
      consume: async (request, _callContext, consumer) => {
        await consumer(credential(request));
        await consumer(credential(request));
      },
    });

    await expect(openSession(harness.factory)).rejects.toSatisfy(
      (error: unknown) => {
        expectDisabled(error);
        return true;
      },
    );
    expect(harness.clients[0].connection.stream.destroy).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.clients[0].end).toHaveBeenCalledTimes(1);
  });

  it("rejects a fire-and-forget credential replay even when the transport ignores its denial", async () => {
    const harness = createHarness({
      consume: async (request, _callContext, consumer) => {
        await consumer(credential(request));
        void Promise.resolve(consumer(credential(request))).catch(
          () => undefined,
        );
      },
    });

    await expect(openSession(harness.factory)).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.clients[0].connection.stream.destroy).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.clients[0].end).toHaveBeenCalledTimes(1);
  });

  it("rejects a transport that returns without consuming and denies its late callback", async () => {
    let lateRequest:
      | CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest
      | undefined;
    let lateConsumer:
      | ((credentialValue: unknown) => PromiseLike<void>)
      | undefined;
    const harness = createHarness({
      consume: async (request, _callContext, consumer) => {
        lateRequest = request;
        lateConsumer = consumer;
      },
    });

    await expect(openSession(harness.factory)).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.clients).toHaveLength(0);
    expect(lateRequest).toBeDefined();
    expect(lateConsumer).toBeDefined();
    await expect(
      Promise.resolve(lateConsumer?.(credential(lateRequest!))),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(harness.clients).toHaveLength(0);
  });

  it("cannot create a client from a callback delivered after transport timeout", async () => {
    let lateRequest:
      | CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest
      | undefined;
    let lateConsumer:
      | ((credentialValue: unknown) => PromiseLike<void>)
      | undefined;
    const neverReturns = new Promise<never>(() => undefined);
    const harness = createHarness({
      consume: (request, _callContext, consumer) => {
        lateRequest = request;
        lateConsumer = consumer;
        return neverReturns;
      },
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const opening = openSession(harness.factory);
      const denied = expect(opening).rejects.toMatchObject({
        code: "PRODUCT_API_DISABLED",
      });
      await vi.advanceTimersByTimeAsync(5_001);
      await denied;
      expect(harness.clients).toHaveLength(0);
      await expect(
        Promise.resolve(lateConsumer?.(credential(lateRequest!))),
      ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
      expect(harness.clients).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["non-one-use delivery claim", () => ({ deliveryOneUse: false })],
    ["raw DSN claim", () => ({ rawDsnPresent: true })],
    [
      "different credential class",
      () => ({ credentialClass: "EPHEMERAL_DATABASE_PASSWORD" }),
    ],
    [
      "invented source expiry",
      () => ({ sourceExpiresAt: new Date(Date.now() + 60_000).toISOString() }),
    ],
    [
      "different source revocation",
      () => ({ sourceRevocation: "DELIVERY_EXPIRY" }),
    ],
    [
      "legacy ambiguous lifetime fields",
      () => ({
        issuedAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        oneUse: true,
      }),
    ],
    [
      "stale delivery issuance",
      () => ({
        deliveryIssuedAt: new Date(Date.now() - 30_001).toISOString(),
      }),
    ],
    [
      "overlong delivery lifetime",
      () => ({
        deliveryIssuedAt: new Date(Date.now() - 1_000).toISOString(),
        deliveryExpiresAt: new Date(Date.now() + 60_001).toISOString(),
      }),
    ],
    [
      "delivery beyond target",
      () => ({
        deliveryExpiresAt: new Date(Date.now() + 3 * 60_000).toISOString(),
      }),
    ],
    ["DSN in password slot", () => ({ password: "postgresql://secret" })],
  ])("rejects %s before client creation", async (_label, makeMismatch) => {
    const harness = createHarness({
      consume: async (request, _callContext, consumer) => {
        await consumer(credential(request, makeMismatch()));
      },
    });

    await expect(openSession(harness.factory)).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.clients).toHaveLength(0);
  });

  it.each([
    ["target descriptor", { targetDescriptorSha256: "e".repeat(64) }],
    ["pinned CA", { tlsRootCertificateSha256: "e".repeat(64) }],
    ["derived user", { user: "postgres.wrongprojectref000" }],
    ["application name", { applicationName: "unapproved-management" }],
  ])("rejects %s credential binding mismatch before client creation", async (_label, mismatch) => {
    const harness = createHarness({
      consume: async (request, _callContext, consumer) => {
        await consumer(credential(request, mismatch));
      },
    });

    await expect(openSession(harness.factory)).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.clients).toHaveLength(0);
  });

  it.each([
    ["unverified TLS", { authorized: false }],
    ["TLS authorization error", { authorizationError: "bad certificate" }],
    ["missing exact-stream destroy", { missingDestroy: true }],
    ["wrong database role", { postureRow: postureRow({ current_user: "authenticator" }) }],
    ["wrong session role", { postureRow: postureRow({ session_user: "authenticator" }) }],
    ["wrong database", { postureRow: postureRow({ database_name: "template1" }) }],
    ["wrong PG major", { postureRow: postureRow({ postgres_major: 16 }) }],
    ["wrong app name", { postureRow: postureRow({ application_name: "other" }) }],
    ["row security disabled", { postureRow: postureRow({ row_security: "off" }) }],
  ])("denies %s and destroys the exact client", async (_label, clientPlan) => {
    const harness = createHarness({ clientPlan });

    await expect(openSession(harness.factory)).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    if (typeof harness.clients[0].connection.stream.destroy === "function") {
      expect(
        harness.clients[0].connection.stream.destroy,
      ).toHaveBeenCalledTimes(1);
    }
    expect(harness.clients[0].end).toHaveBeenCalledTimes(1);
  });

  it("hard-closes the exact client when open is aborted", async () => {
    let releaseConnect: (() => void) | undefined;
    const connectPromise = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const controller = new AbortController();
    const harness = createHarness({ clientPlan: { connectPromise } });
    const opening = openSession(harness.factory, context(controller.signal));
    await vi.waitFor(() => expect(harness.clients).toHaveLength(1));

    controller.abort();
    await expect(opening).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.clients[0].connection.stream.destroy).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.clients[0].end).toHaveBeenCalledTimes(1);
    releaseConnect?.();
  });

  it("enforces query single-flight and hard-closes on query Abort", async () => {
    let releaseQuery: (() => void) | undefined;
    const queryPromise = new Promise<unknown>((resolve) => {
      releaseQuery = () => resolve({ rows: [{ data: "late" }] });
    });
    const harness = createHarness({ clientPlan: { queryPromise } });
    const session = await openSession(harness.factory);
    const controller = new AbortController();
    const first = Promise.resolve(
      session.query("select first", [], context(controller.signal)),
    );
    await vi.waitFor(() =>
      expect(harness.clients[0].query).toHaveBeenCalledTimes(2),
    );

    await expect(
      Promise.resolve(session.query("select second", [], context())),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    controller.abort();
    await expect(first).rejects.toMatchObject({
      code: "PRODUCT_API_DISABLED",
    });
    expect(harness.clients[0].connection.stream.destroy).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.clients[0].end).toHaveBeenCalledTimes(1);
    await session.end();
    expect(harness.clients[0].end).toHaveBeenCalledTimes(1);
    releaseQuery?.();
  });

  it("hard-destroys the exact socket when client.end does not settle", async () => {
    const neverEnding = new Promise<never>(() => undefined);
    const harness = createHarness({
      clientPlan: { endPromise: neverEnding },
    });
    const session = await openSession(harness.factory);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const ending = Promise.resolve(session.end());
      const denied = expect(ending).rejects.toMatchObject({
        code: "PRODUCT_API_DISABLED",
      });
      await vi.advanceTimersByTimeAsync(1_001);
      await denied;
      expect(
        harness.clients[0].connection.stream.destroy,
      ).toHaveBeenCalledTimes(1);
      expect(harness.clients[0].end).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects Production, stale, overlong and unpinned target profiles", () => {
    const production = profile({
      projectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
      host: `db.${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`,
    });
    const expired = profile({
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
    const overlong = profile({
      expiresAt: new Date(Date.now() + 5 * 60 * 1_000 + 10_000).toISOString(),
    });
    const wrongCa = profile({ sslRootCertificateSha256: "e".repeat(64) });

    for (const connectionProfile of [
      production,
      expired,
      overlong,
      wrongCa,
    ]) {
      expect(() =>
        createHarness({ connectionProfile }),
      ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    }
  });

  it("maps secret-bearing driver failures to a fixed, non-logging error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const harness = createHarness({
      clientPlan: {
        constructorError: new Error(`driver rejected ${PASSWORD}`),
      },
    });

    try {
      await openSession(harness.factory);
      throw new Error("EXPECTED_DENIAL");
    } catch (error) {
      expectDisabled(error, PASSWORD);
    }
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it("contains no environment, DSN, network, Production activation or logging path", () => {
    const source = readTextFileSync(
      new URL(
        "./communication-note-preview-approved-runtime-management-session.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("connectionString");
    expect(source).not.toContain("postgresql://");
    expect(source).not.toContain("console.");
    expect(source).not.toMatch(
      /APPROVED_RUNTIME_MANAGEMENT_SESSION_READY\s*=\s*true/,
    );
  });
});
