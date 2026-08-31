import "server-only";

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import type {
  CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
  CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory,
} from "./communication-note-preview-durable-caller-credential-resolver.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";
import { CaresLinkV1ContractError } from "./shared-contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RUNTIME_PASSWORD_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAXIMUM_CA_BYTES = 64 * 1_024;
const MAXIMUM_LEASE_LIFETIME_MS = 90_000;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_VERSION =
  "postgres-session.communication.openai.synthetic-preview.2026-08-31.m1m.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_READY =
  false as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-runtime" as const;

const APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_CORE = deepFreeze({
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
  maximumCredentialRemainingMs: MAXIMUM_LEASE_LIFETIME_MS,
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
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_DIGEST =
  "75d7aae46d34a6de369b68e57d448f6aa0a8267d14b4ed097081bd306c131f09" as const;

if (
  canonicalSha256(APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY =
  deepFreeze({
    ...APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_DIGEST,
  });

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresConnectionProfile =
  Readonly<{
    host: string;
    port: 5432;
    database: "postgres";
    runtimeRole: `careslink_v1_preview_runner_terminal_runtime_${string}`;
    projectRef: string;
    connectionMode: "DIRECT" | "SESSION_POOLER";
    sslRootCertificate: Uint8Array;
    sslRootCertificateSha256: string;
    expiresAt: string;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig = {
  host: string;
  port: 5432;
  database: "postgres";
  user: string;
  password: string | undefined;
  application_name: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_APPLICATION_NAME;
  connectionTimeoutMillis: 5_000;
  statement_timeout: 5_000;
  lock_timeout: 1_000;
  idle_in_transaction_session_timeout: 5_000;
  options: string;
  client_encoding: "UTF8";
  sslnegotiation: "postgres";
  ssl: Readonly<{
    ca: Buffer;
    rejectUnauthorized: true;
  }>;
};

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult =
  Readonly<{
    rows: readonly unknown[];
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClient = {
  processID: number | null;
  password: unknown;
  connectionParameters: { password: unknown };
  connection?: {
    stream?: {
      encrypted?: boolean;
      authorized?: boolean;
      authorizationError?: unknown;
      destroy?: () => unknown;
    };
  };
  connect(): PromiseLike<unknown>;
  query(
    sql: string,
    values?: readonly unknown[],
  ): PromiseLike<CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresQueryResult>;
  end(): PromiseLike<unknown>;
  on(event: "error", listener: (error: unknown) => void): unknown;
};

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor =
  new (
    config: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig,
  ) => CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClient;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionOpenRequest =
  Readonly<{
    connectionProfile: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresConnectionProfile;
    password: string;
  }>;

type ValidatedPostgresConnectionProfile =
  CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresConnectionProfile &
    Readonly<{
      validatedAtWallClockMilliseconds: number;
      validatedAtMonotonicMilliseconds: number;
    }>;

type ValidatedPostgresSessionOpenRequest = Readonly<{
  connectionProfile: ValidatedPostgresConnectionProfile;
  password: string;
}>;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_POSTGRES_SESSION_FACTORY =
  undefined as
    | CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory
    | undefined;

export function createCaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionFactory(
  _value: unknown,
): never {
  void _value;
  throw unavailable();
}

/**
 * Source-only adapter for one owned pg.Client per opened session. It performs no
 * environment lookup and accepts neither a DSN nor a pool. The caller must
 * independently validate and supply the target profile and one-use password.
 */
export function createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionFactory(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory {
  const options = exactDataRecord(value, ["capability", "Client"]);
  if (
    options.capability !==
      "TEST_ONLY_M1M_APPROVED_RUNTIME_POSTGRES_SESSION" ||
    typeof options.Client !== "function" ||
    nodeTypes.isProxy(options.Client)
  ) {
    throw unavailable();
  }
  const Client =
    options.Client as CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor;

  return Object.freeze({
    async open(rawRequest: unknown, rawContext: unknown) {
      let request: ReturnType<typeof validateOpenRequest> | undefined =
        validateOpenRequest(rawRequest);
      rawRequest = undefined;
      const context = validateContext(rawContext);
      requireNotAborted(context.signal);
      requireActiveLease(request.connectionProfile);

      const connectionProfile = request.connectionProfile;
      let password: string | undefined = request.password;
      request = undefined;
      let clientConfig:
        | CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig
        | undefined = createClientConfig(connectionProfile, password);
      let client:
        | CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClient
        | undefined;
      let closePromise: Promise<void> | undefined;
      let activeQuery: Promise<Readonly<{ rows: readonly unknown[] }>> | undefined;
      let state: "OPENING" | "ACTIVE" | "CLOSING" | "DESTROYED" = "OPENING";
      let transportFailed = false;

      const clearSecrets = () => {
        password = undefined;
        if (clientConfig) clientConfig.password = undefined;
        clientConfig = undefined;
        if (!client) return;
        try {
          client.password = null;
        } catch {
          // Failure is checked below and mapped to the fixed public error.
        }
        try {
          client.connectionParameters.password = null;
        } catch {
          // Failure is checked below and mapped to the fixed public error.
        }
      };

      const passwordsCleared = () =>
        password === undefined &&
        clientConfig === undefined &&
        client !== undefined &&
        client.password == null &&
        client.connectionParameters.password == null;

      const closeExactClient = () => {
        if (closePromise) return closePromise;
        state = "CLOSING";
        const querySettlement = activeQuery
          ? activeQuery.then(
              () => undefined,
              () => undefined,
            )
          : Promise.resolve();
        let streamDestroyFailed = false;
        try {
          client?.connection?.stream?.destroy?.();
        } catch {
          streamDestroyFailed = true;
        }
        const ending = Promise.resolve()
          .then(() => client?.end())
          .then(() => undefined);
        closePromise = Promise.all([ending, querySettlement]).then(
          () => {
            state = "DESTROYED";
            clearSecrets();
            if (streamDestroyFailed) throw unavailable();
          },
          () => {
            state = "DESTROYED";
            clearSecrets();
            throw unavailable();
          },
        );
        return closePromise;
      };

      const abortListener = () => {
        void closeExactClient().catch(() => undefined);
      };

      try {
        client = new Client(clientConfig);
        if (
          !client ||
          typeof client.connect !== "function" ||
          typeof client.query !== "function" ||
          typeof client.end !== "function" ||
          typeof client.on !== "function" ||
          !client.connectionParameters ||
          typeof client.connectionParameters !== "object"
        ) {
          throw unavailable();
        }
        client.on("error", () => {
          transportFailed = true;
          void closeExactClient().catch(() => undefined);
        });
        context.signal.addEventListener("abort", abortListener, { once: true });
        await client.connect();
        requireNotAborted(context.signal);
        requireVerifiedTls(client);
        clearSecrets();
        if (!passwordsCleared()) throw unavailable();
        requireActiveLease(connectionProfile);

        const pidResult = normalizeQueryResult(
          await client.query(
            "select pg_catalog.pg_backend_pid() as backend_pid",
          ),
        );
        const backendPid = readBackendPid(pidResult, client.processID);
        requireNotAborted(context.signal);
        requireActiveLease(connectionProfile);
        if (transportFailed) throw unavailable();
        state = "ACTIVE";

        const session = Object.freeze({
          backendPid,
          async query(
            sql: string,
            values: readonly unknown[] | undefined,
            callContext: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
          ) {
            const queryContext = validateContext(callContext);
            if (
              state !== "ACTIVE" ||
              transportFailed ||
              activeQuery !== undefined ||
              typeof sql !== "string" ||
              sql.length === 0 ||
              sql.length > 1_000_000 ||
              sql.includes("\u0000") ||
              (values !== undefined &&
                (!Array.isArray(values) || nodeTypes.isProxy(values)))
            ) {
              throw unavailable();
            }
            requireNotAborted(queryContext.signal);
            requireActiveLease(connectionProfile);
            const operation = Promise.resolve()
              .then(() => client?.query(sql, values))
              .then(normalizeQueryResult);
            activeQuery = operation;
            try {
              const result = await operation;
              requireNotAborted(queryContext.signal);
              requireActiveLease(connectionProfile);
              if (transportFailed || state !== "ACTIVE") {
                throw unavailable();
              }
              return result;
            } catch {
              throw unavailable();
            } finally {
              if (activeQuery === operation) activeQuery = undefined;
            }
          },
          async cancelInFlight() {
            if (state === "DESTROYED") return;
            await closeExactClient();
          },
          async destroy() {
            await closeExactClient();
          },
        });
        return session;
      } catch {
        clearSecrets();
        if (client) {
          await closeExactClient().catch(() => undefined);
        }
        throw unavailable();
      } finally {
        context.signal.removeEventListener("abort", abortListener);
      }
    },
  });
}

function validateOpenRequest(
  value: unknown,
): ValidatedPostgresSessionOpenRequest {
  const object = exactDataRecord(value, ["connectionProfile", "password"]);
  if (
    typeof object.password !== "string" ||
    !RUNTIME_PASSWORD_PATTERN.test(object.password)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    connectionProfile: validateConnectionProfile(object.connectionProfile),
    password: object.password,
  });
}

function validateConnectionProfile(
  value: unknown,
): ValidatedPostgresConnectionProfile {
  const object = exactDataRecord(value, [
    "host",
    "port",
    "database",
    "runtimeRole",
    "projectRef",
    "connectionMode",
    "sslRootCertificate",
    "sslRootCertificateSha256",
    "expiresAt",
  ]);
  const host = requireText(object.host).toLowerCase();
  const runtimeRole = requireText(object.runtimeRole);
  const projectRef = requireText(object.projectRef);
  const connectionMode = object.connectionMode;
  if (
    host !== object.host ||
    object.port !== 5432 ||
    object.database !== "postgres" ||
    !RUNTIME_ROLE_PATTERN.test(runtimeRole) ||
    !PROJECT_REF_PATTERN.test(projectRef) ||
    projectRef === CARESLINK_PRODUCTION_SUPABASE_REF ||
    (connectionMode !== "DIRECT" && connectionMode !== "SESSION_POOLER") ||
    (connectionMode === "DIRECT" &&
      host !== `db.${projectRef}.supabase.co`) ||
    (connectionMode === "SESSION_POOLER" &&
      !SESSION_POOLER_HOST_PATTERN.test(host)) ||
    !SHA256_PATTERN.test(String(object.sslRootCertificateSha256)) ||
    !(object.sslRootCertificate instanceof Uint8Array) ||
    nodeTypes.isProxy(object.sslRootCertificate) ||
    object.sslRootCertificate.byteLength === 0 ||
    object.sslRootCertificate.byteLength > MAXIMUM_CA_BYTES
  ) {
    throw unavailable();
  }
  const certificate = Buffer.from(object.sslRootCertificate);
  if (
    createHash("sha256").update(certificate).digest("hex") !==
    object.sslRootCertificateSha256
  ) {
    certificate.fill(0);
    throw unavailable();
  }
  const expiresAt = normalizedTimestamp(object.expiresAt);
  const validatedAtWallClockMilliseconds = Date.now();
  const validatedAtMonotonicMilliseconds = performance.now();
  return Object.freeze({
    host,
    port: 5432 as const,
    database: "postgres" as const,
    runtimeRole:
      runtimeRole as `careslink_v1_preview_runner_terminal_runtime_${string}`,
    projectRef,
    connectionMode,
    sslRootCertificate: certificate,
    sslRootCertificateSha256: object.sslRootCertificateSha256 as string,
    expiresAt,
    validatedAtWallClockMilliseconds,
    validatedAtMonotonicMilliseconds,
  });
}

function createClientConfig(
  profile: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresConnectionProfile,
  password: string,
): CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConfig {
  return {
    host: profile.host,
    port: 5432,
    database: "postgres",
    user: profile.connectionMode === "SESSION_POOLER"
      ? `${profile.runtimeRole}.${profile.projectRef}`
      : profile.runtimeRole,
    password,
    application_name:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_APPLICATION_NAME,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    lock_timeout: 1_000,
    idle_in_transaction_session_timeout: 5_000,
    options: "-c row_security=on",
    client_encoding: "UTF8",
    sslnegotiation: "postgres",
    ssl: Object.freeze({
      ca: Buffer.from(profile.sslRootCertificate),
      rejectUnauthorized: true as const,
    }),
  };
}

function requireVerifiedTls(
  client: CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClient,
) {
  const stream = client.connection?.stream;
  if (
    stream?.encrypted !== true ||
    stream.authorized !== true ||
    stream.authorizationError != null ||
    typeof stream.destroy !== "function" ||
    nodeTypes.isProxy(stream.destroy)
  ) {
    throw unavailable();
  }
}

function readBackendPid(
  result: Readonly<{ rows: readonly unknown[] }>,
  driverProcessId: number | null,
) {
  if (
    result.rows.length !== 1 ||
    !Number.isSafeInteger(driverProcessId) ||
    (driverProcessId as number) <= 0
  ) {
    throw unavailable();
  }
  const row = result.rows[0];
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    nodeTypes.isProxy(row)
  ) {
    throw unavailable();
  }
  const backendPid = (row as Record<string, unknown>).backend_pid;
  if (
    !Number.isSafeInteger(backendPid) ||
    (backendPid as number) <= 0 ||
    backendPid !== driverProcessId
  ) {
    throw unavailable();
  }
  return backendPid as number;
}

function normalizeQueryResult(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  const rows = (value as Record<string, unknown>).rows;
  if (!Array.isArray(rows) || nodeTypes.isProxy(rows)) throw unavailable();
  return Object.freeze({ rows: Object.freeze([...rows]) });
}

function validateContext(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext {
  const object = exactDataRecord(value, ["signal"]);
  if (!(object.signal instanceof AbortSignal)) throw unavailable();
  return Object.freeze({ signal: object.signal });
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

function requireActiveLease(profile: ValidatedPostgresConnectionProfile) {
  const monotonicElapsed = Math.max(
    0,
    performance.now() - profile.validatedAtMonotonicMilliseconds,
  );
  const now = Math.max(
    Date.now(),
    profile.validatedAtWallClockMilliseconds + monotonicElapsed,
  );
  const expiresAtMilliseconds = Date.parse(profile.expiresAt);
  if (
    expiresAtMilliseconds <= now ||
    expiresAtMilliseconds > now + MAXIMUM_LEASE_LIFETIME_MS
  ) {
    throw unavailable();
  }
}

function normalizedTimestamp(value: unknown) {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    throw unavailable();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw unavailable();
  }
  return value;
}

function requireText(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const actualKeys = Object.getOwnPropertyNames(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw unavailable();
  }
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of actualKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note approved runtime Postgres session is unavailable",
  );
}
