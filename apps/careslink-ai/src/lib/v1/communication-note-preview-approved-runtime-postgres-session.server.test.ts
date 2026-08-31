import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_POSTGRES_SESSION_FACTORY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_APPLICATION_NAME,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_VERSION,
  createCaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionFactory,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionFactory,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClient,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresConnectionProfile,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult,
} from "./communication-note-preview-approved-runtime-postgres-session.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";

vi.mock("server-only", () => ({}));

const PROJECT_REF = "abcdefghijklmnopqrst";
const RUNTIME_ROLE =
  "careslink_v1_preview_runner_terminal_runtime_0123456789abcdef" as const;
const PASSWORD = "S".repeat(43);
const CA_BYTES = Buffer.from(
  "-----BEGIN CERTIFICATE-----\nM1M TEST ROOT\n-----END CERTIFICATE-----\n",
  "utf8",
);
const CA_SHA256 = createHash("sha256").update(CA_BYTES).digest("hex");

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}>;

type HarnessOptions = Readonly<{
  tlsEncrypted?: boolean;
  tlsAuthorized?: boolean;
  tlsAuthorizationError?: unknown;
  missingDestroy?: boolean;
  driverPid?: number;
  databasePid?: number;
  connectError?: unknown;
  queryError?: unknown;
  endError?: unknown;
  pendingQuery?: Deferred<CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult>;
}>;

type FakeClient = CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClient & {
  readonly config: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig;
  readonly configSnapshot: Readonly<Record<string, unknown>>;
  endCount: number;
};

describe("Communication Note M1m approved runtime Postgres session adapter", () => {
  it("is server-only, source-disabled, injected and contains no Pool/DSN path", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY,
    ).toEqual({
      version:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_VERSION,
      status: "SOURCE_ADAPTER_NOT_ACTIVATED",
      ready: false,
      driverShape: "ONE_EXCLUSIVE_PG_CLIENT",
      poolAllowed: false,
      dsnAllowed: false,
      database: "postgres",
      postgresMajor: 17,
      allowedProfileConnectionModes: ["DIRECT", "SESSION_POOLER"],
      productionTargetAllowed: false,
      tlsMode: "VERIFY_FULL_PINNED_CA",
      rejectUnauthorized: true,
      maximumCredentialRemainingMs: 90_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 5_000,
      lockTimeoutMs: 1_000,
      idleInTransactionSessionTimeoutMs: 5_000,
      applicationName:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_APPLICATION_NAME,
      concurrentQueryAllowed: false,
      cancellationMode: "EXACT_CLIENT_HARD_CLOSE",
      hardClosePrimitive: "TLS_STREAM_DESTROY_THEN_CLIENT_END",
      reusableAfterCancellation: false,
      passwordReferencesClearedAfterConnect: true,
      leaseClock: "MONOTONIC_WITH_WALL_CLOCK_FRESHNESS_FLOOR",
      postQueryFreshnessRequired: true,
      transportFailureResultAllowed: false,
      policyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_DIGEST,
    });
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_DIGEST,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(
      Object.isFrozen(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY,
      ),
    ).toBe(true);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_POSTGRES_SESSION_FACTORY,
    ).toBeUndefined();
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionFactory(
        {},
      ),
    ).toThrowError(disabledError());

    const source = readFileSync(
      new URL(
        "./communication-note-preview-approved-runtime-postgres-session.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(/\bnew\s+Pool\b|from\s+["']pg["']/);
    expect(source).not.toMatch(/process\.env|connectionString|postgres(?:ql)?:\/\//);
    expect(source).toContain("rawRequest = undefined;");
    expect(source).toContain("request = undefined;");
    const returnedSessionClosure = source.slice(
      source.indexOf("const session = Object.freeze"),
      source.indexOf("return session;"),
    );
    expect(returnedSessionClosure).not.toContain("request.");
  });

  it("opens exactly one direct Client with fixed TLS, identity and timeout configuration", async () => {
    const harness = createClientHarness();
    const session = await openSession(harness.Client, directProfile());
    const client = harness.onlyClient();
    const snapshot = client.configSnapshot as {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      application_name: string;
      connectionTimeoutMillis: number;
      statement_timeout: number;
      lock_timeout: number;
      idle_in_transaction_session_timeout: number;
      options: string;
      client_encoding: string;
      sslnegotiation: string;
      ssl: { ca: Buffer; rejectUnauthorized: boolean };
    };

    expect(snapshot).toMatchObject({
      host: `db.${PROJECT_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      user: RUNTIME_ROLE,
      password: PASSWORD,
      application_name:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_APPLICATION_NAME,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
      lock_timeout: 1_000,
      idle_in_transaction_session_timeout: 5_000,
      client_encoding: "UTF8",
      sslnegotiation: "postgres",
    });
    expect(snapshot.options).toBe("-c row_security=on");
    expect(snapshot.options).not.toContain("timeout");
    expect(snapshot.ssl.rejectUnauthorized).toBe(true);
    expect(Buffer.compare(snapshot.ssl.ca, CA_BYTES)).toBe(0);
    expect(client.config.password).toBeUndefined();
    expect(client.password).toBeNull();
    expect(client.connectionParameters.password).toBeNull();
    expect(session.backendPid).toBe(73_001);
    expect(Object.isFrozen(session)).toBe(true);

    const result = await session.query(
      "select $1::pg_catalog.int4 as value",
      [1],
      context(),
    );
    expect(result.rows).toEqual([{ value: 1 }]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    await session.destroy();
  });

  it("derives the exact Session Pooler login without accepting a pool object", async () => {
    const harness = createClientHarness();
    const session = await openSession(
      harness.Client,
      sessionPoolerProfile(),
    );
    expect(harness.onlyClient().configSnapshot).toMatchObject({
      host: "aws-0-ap-southeast-2.pooler.supabase.com",
      user: `${RUNTIME_ROLE}.${PROJECT_REF}`,
      port: 5432,
      database: "postgres",
    });
    await session.destroy();
  });

  it("fails closed before or during open for bad CA, TLS or backend PID posture", async () => {
    const badCaHarness = createClientHarness();
    await expect(
      openSession(badCaHarness.Client, {
        ...directProfile(),
        sslRootCertificateSha256: "0".repeat(64),
      }),
    ).rejects.toEqual(disabledError());
    expect(badCaHarness.clients).toHaveLength(0);

    for (const options of [
      { tlsEncrypted: false },
      { tlsAuthorized: false },
      { tlsAuthorizationError: "CERT_HAS_EXPIRED" },
      { missingDestroy: true },
      { databasePid: 73_002 },
    ] satisfies readonly HarnessOptions[]) {
      const harness = createClientHarness(options);
      await expect(
        openSession(harness.Client, directProfile()),
      ).rejects.toEqual(disabledError());
      expect(harness.onlyClient().endCount).toBe(1);
    }
  });

  it("rejects production and out-of-window targets, then rechecks expiry before every query", async () => {
    const productionHarness = createClientHarness();
    await expect(
      openSession(productionHarness.Client, {
        ...directProfile(),
        host: `db.${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`,
        projectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
      }),
    ).rejects.toEqual(disabledError());
    expect(productionHarness.clients).toHaveLength(0);

    for (const expiresAt of [futureExpiry(-5_000), futureExpiry(120_000)]) {
      const harness = createClientHarness();
      await expect(
        openSession(harness.Client, { ...directProfile(), expiresAt }),
      ).rejects.toEqual(disabledError());
      expect(harness.clients).toHaveLength(0);
    }

    const now = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(now);
      const harness = createClientHarness();
      const session = await openSession(harness.Client, {
        ...directProfile(),
        expiresAt: new Date(now + 60_000).toISOString(),
      });
      vi.setSystemTime(now + 60_001);
      await expect(
        session.query("select 1", undefined, context()),
      ).rejects.toEqual(disabledError());
      await session.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("permits only one in-flight query and releases the lane after settlement", async () => {
    const pending = deferred<CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult>();
    const harness = createClientHarness({ pendingQuery: pending });
    const session = await openSession(harness.Client, directProfile());
    const first = session.query("select pg_sleep(10)", undefined, context());

    await expect(
      session.query("select 2", undefined, context()),
    ).rejects.toEqual(disabledError());
    pending.resolve({ rows: [{ value: 1 }] });
    await expect(first).resolves.toEqual({ rows: [{ value: 1 }] });
    await expect(
      session.query("select 3", undefined, context()),
    ).resolves.toEqual({ rows: [{ value: 1 }] });
    await session.destroy();
  });

  it("does not extend a runtime lease when the wall clock moves backwards", async () => {
    const wallNow = Date.now();
    const performanceNow = vi
      .spyOn(performance, "now")
      .mockReturnValue(1_000);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(wallNow);
      const harness = createClientHarness();
      const session = await openSession(harness.Client, {
        ...directProfile(),
        expiresAt: new Date(wallNow + 60_000).toISOString(),
      });

      vi.setSystemTime(wallNow - 2 * 60_000);
      performanceNow.mockReturnValue(61_001);
      await expect(
        session.query("select 1", undefined, context()),
      ).rejects.toEqual(disabledError());
      await session.destroy();
    } finally {
      performanceNow.mockRestore();
      vi.useRealTimers();
    }
  });

  it("rejects a query result when the runtime lease expires in flight", async () => {
    const wallNow = Date.now();
    const performanceNow = vi
      .spyOn(performance, "now")
      .mockReturnValue(1_000);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(wallNow);
      const pending =
        deferred<CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult>();
      const harness = createClientHarness({ pendingQuery: pending });
      const session = await openSession(harness.Client, {
        ...directProfile(),
        expiresAt: new Date(wallNow + 60_000).toISOString(),
      });
      const query = session.query("select pg_sleep(10)", undefined, context());
      await Promise.resolve();
      await Promise.resolve();

      vi.setSystemTime(wallNow + 60_001);
      performanceNow.mockReturnValue(61_001);
      pending.resolve({ rows: [{ value: 1 }] });
      await expect(query).rejects.toEqual(disabledError());
      await session.destroy();
    } finally {
      performanceNow.mockRestore();
      vi.useRealTimers();
    }
  });

  it("hard-closes the exact original Client on cancel, waits for query settlement and never reuses it", async () => {
    const pending = deferred<CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult>();
    const harness = createClientHarness({ pendingQuery: pending });
    const session = await openSession(harness.Client, directProfile());
    const client = harness.onlyClient();
    const query = session.query("select pg_sleep(10)", undefined, context());
    await Promise.resolve();
    await Promise.resolve();

    await expect(session.cancelInFlight()).resolves.toBeUndefined();
    await expect(query).rejects.toEqual(disabledError());
    expect(harness.clients).toEqual([client]);
    expect(client.endCount).toBe(1);
    expect(client.connection?.stream?.destroy).toHaveBeenCalledTimes(1);
    await expect(
      session.query("select 1", undefined, context()),
    ).rejects.toEqual(disabledError());
    await session.destroy();
    await session.destroy();
    expect(client.endCount).toBe(1);
  });

  it("makes idle destroy idempotent and redacts every injected driver failure", async () => {
    const idleHarness = createClientHarness();
    const idle = await openSession(idleHarness.Client, directProfile());
    await idle.destroy();
    await idle.destroy();
    expect(idleHarness.onlyClient().endCount).toBe(1);

    const sentinel = `${PASSWORD}:postgresql://secret.example/${CA_BYTES.toString("base64")}`;
    const connectHarness = createClientHarness({
      connectError: new Error(sentinel),
    });
    await expect(
      openSession(connectHarness.Client, directProfile()),
    ).rejects.toSatisfy((error: unknown) => isRedactedDisabled(error, sentinel));

    const queryHarness = createClientHarness({
      queryError: new Error(sentinel),
    });
    const querySession = await openSession(
      queryHarness.Client,
      directProfile(),
    );
    await expect(
      querySession.query("select 1", [], context()),
    ).rejects.toSatisfy((error: unknown) => isRedactedDisabled(error, sentinel));
    await querySession.destroy();

    const endHarness = createClientHarness({ endError: new Error(sentinel) });
    const endSession = await openSession(endHarness.Client, directProfile());
    await expect(endSession.destroy()).rejects.toSatisfy((error: unknown) =>
      isRedactedDisabled(error, sentinel),
    );
  });
});

function directProfile(): CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresConnectionProfile {
  return {
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: "postgres",
    runtimeRole: RUNTIME_ROLE,
    projectRef: PROJECT_REF,
    connectionMode: "DIRECT",
    sslRootCertificate: Buffer.from(CA_BYTES),
    sslRootCertificateSha256: CA_SHA256,
    expiresAt: futureExpiry(60_000),
  };
}

function sessionPoolerProfile(): CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresConnectionProfile {
  return {
    ...directProfile(),
    host: "aws-0-ap-southeast-2.pooler.supabase.com",
    connectionMode: "SESSION_POOLER",
  };
}

async function openSession(
  Client: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor,
  connectionProfile: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresConnectionProfile,
) {
  const factory =
    createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionFactory(
      {
        capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_POSTGRES_SESSION",
        Client,
      },
    );
  return factory.open({ connectionProfile, password: PASSWORD }, context()) as Promise<{
    backendPid: number;
    query(
      sql: string,
      values: readonly unknown[] | undefined,
      callContext: Readonly<{ signal: AbortSignal }>,
    ): Promise<Readonly<{ rows: readonly unknown[] }>>;
    cancelInFlight(): Promise<void>;
    destroy(): Promise<void>;
  }>;
}

function context() {
  return Object.freeze({ signal: new AbortController().signal });
}

function futureExpiry(offsetMilliseconds: number) {
  return new Date(Date.now() + offsetMilliseconds).toISOString();
}

function createClientHarness(options: HarnessOptions = {}) {
  const clients: FakeClient[] = [];
  const driverPid = options.driverPid ?? 73_001;
  const databasePid = options.databasePid ?? driverPid;

  class InjectedClient implements CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClient {
    readonly config: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig;
    readonly configSnapshot: Readonly<Record<string, unknown>>;
    processID: number | null = driverPid;
    password: unknown;
    connectionParameters: { password: unknown };
    connection = {
      stream: {
        encrypted: options.tlsEncrypted ?? true,
        authorized: options.tlsAuthorized ?? true,
        authorizationError: options.tlsAuthorizationError ?? null,
        destroy: options.missingDestroy ? undefined : vi.fn(),
      },
    };
    endCount = 0;
    private activePending:
      | Deferred<CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult>
      | undefined;
    private pendingConsumed = false;

    constructor(
      config: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig,
    ) {
      this.config = config;
      this.password = config.password;
      this.connectionParameters = { password: config.password };
      this.configSnapshot = Object.freeze({
        ...config,
        ssl: Object.freeze({
          ...config.ssl,
          ca: Buffer.from(config.ssl.ca),
        }),
      });
      clients.push(this as unknown as FakeClient);
    }

    async connect() {
      if (options.connectError) throw options.connectError;
    }

    async query(
      sql: string,
      values?: readonly unknown[],
    ): Promise<CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult> {
      void values;
      if (sql === "select pg_catalog.pg_backend_pid() as backend_pid") {
        return { rows: [{ backend_pid: databasePid }] };
      }
      if (options.queryError) throw options.queryError;
      if (options.pendingQuery && !this.pendingConsumed) {
        this.pendingConsumed = true;
        this.activePending = options.pendingQuery;
        try {
          return await options.pendingQuery.promise;
        } finally {
          this.activePending = undefined;
        }
      }
      return { rows: [{ value: 1 }] };
    }

    async end() {
      this.endCount += 1;
      this.activePending?.reject(new Error(`${PASSWORD}: active query closed`));
      if (options.endError) throw options.endError;
    }

    on(event: "error", listener: (error: unknown) => void) {
      void event;
      void listener;
      return this;
    }
  }

  return {
    Client:
      InjectedClient as CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor,
    clients,
    onlyClient() {
      expect(clients).toHaveLength(1);
      return clients[0];
    },
  };
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}

function disabledError() {
  return expect.objectContaining({
    name: "CaresLinkV1ContractError",
    code: "PRODUCT_API_DISABLED",
    message:
      "Communication Note approved runtime Postgres session is unavailable",
  });
}

function isRedactedDisabled(error: unknown, sentinel: string) {
  if (!(error instanceof Error)) return false;
  const errorWithCode = error as Error & { code?: unknown };
  const serialized = JSON.stringify({
    name: error.name,
    message: error.message,
    code: errorWithCode.code,
  });
  return (
    errorWithCode.code === "PRODUCT_API_DISABLED" &&
    error.message ===
      "Communication Note approved runtime Postgres session is unavailable" &&
    !serialized.includes(sentinel) &&
    !serialized.includes(PASSWORD) &&
    !serialized.includes("postgresql://")
  );
}
