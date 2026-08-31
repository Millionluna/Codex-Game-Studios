import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import type {
  CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession,
  CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory,
} from "./communication-note-preview-approved-runtime-broker.server";
import type { CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext } from "./communication-note-preview-durable-caller-credential-resolver.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";
import { CaresLinkV1ContractError } from "./shared-contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAXIMUM_CA_BYTES = 64 * 1_024;
const MAXIMUM_TARGET_LIFETIME_MS = 5 * 60 * 1_000;
const MAXIMUM_DELIVERY_LIFETIME_MS = 60 * 1_000;
const MAXIMUM_DELIVERY_AGE_MS = 30 * 1_000;
const DELIVERY_NONCE_BYTES = 32;
const MAXIMUM_TRACKED_DELIVERY_NONCES = 256;
const OPEN_OPERATION_TIMEOUT_MS = 5_000;
const QUERY_OPERATION_TIMEOUT_MS = 5_000;
const CLOSE_OPERATION_TIMEOUT_MS = 1_000;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_VERSION =
  "management-session.communication.openai.synthetic-preview.2026-08-31.m1m.v3" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_READY =
  false as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runtime-credential-broker-management" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_CREDENTIAL_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANAGEMENT_SESSION" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_POSTURE_SQL =
  `select
  current_user as current_user,
  session_user as session_user,
  pg_catalog.current_database() as database_name,
  (pg_catalog.current_setting('server_version_num')::pg_catalog.int4 / 10000) as postgres_major,
  pg_catalog.current_setting('application_name') as application_name,
  pg_catalog.current_setting('row_security') as row_security` as const;

const APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_VERSION,
  status: "SOURCE_ADAPTER_NOT_ACTIVATED",
  ready: false,
  approvedFactoryAvailable: false,
  sourceOnly: true,
  driverShape: "ONE_FRESH_EXCLUSIVE_PG_CLIENT_PER_OPEN",
  poolAllowed: false,
  dsnAllowed: false,
  connectionProfileFields: [
    "host",
    "port",
    "database",
    "projectRef",
    "connectionMode",
    "sslRootCertificate",
    "sslRootCertificateSha256",
    "targetDescriptorSha256",
    "expiresAt",
  ],
  targetBinding: "DESCRIPTOR_SHA256_AND_PINNED_CA_SHA256",
  productionTargetAllowed: false,
  maximumTargetRemainingMs: MAXIMUM_TARGET_LIFETIME_MS,
  database: "postgres",
  postgresMajor: 17,
  port: 5432,
  allowedProfileConnectionModes: ["DIRECT", "SESSION_POOLER"],
  tlsMode: "VERIFY_FULL_PINNED_CA",
  rejectUnauthorized: true,
  sslNegotiation: "postgres",
  postureSqlSha256: createHash("sha256")
    .update(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_POSTURE_SQL,
      "utf8",
    )
    .digest("hex"),
  requiredCurrentUser: "postgres",
  requiredSessionUser: "postgres",
  requiredDatabase: "postgres",
  requiredPostgresMajor: 17,
  requiredApplicationName:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME,
  requiredRowSecurity: "on",
  credentialTransport: "FACTORY_NONCE_BOUND_ONE_USE_DELIVERY_CALLBACK",
  credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
  sourceCredentialSingleUse: false,
  sourceExpiresAt: null,
  sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET",
  deliveryEnvelopeSingleUse: true,
  deliveryNonceSource: "FACTORY_CRYPTO_RANDOM_256_BIT",
  deliveryNonceFormat: "LOWERCASE_HEX_64",
  deliveryReplayRegistryScope: "FACTORY",
  deliveryReplayRegistryStoredFields: [
    "deliveryNonceSha256",
    "expiresAtMonotonicMilliseconds",
  ],
  deliveryReplayRegistryRawNonceRetained: false,
  deliveryReplayRegistryMaximumEntries: MAXIMUM_TRACKED_DELIVERY_NONCES,
  deliveryReplayRegistryCleanup: "PRUNE_EXPIRED_BEFORE_ATOMIC_RESERVE",
  crossOpenDeliveryReplayProtection: true,
  credentialBindingFields: [
    "targetDescriptorSha256",
    "tlsRootCertificateSha256",
    "user",
    "applicationName",
    "credentialClass",
    "sourceExpiresAt",
    "sourceRevocation",
    "deliveryNonce",
  ],
  maximumDeliveryAgeMs: MAXIMUM_DELIVERY_AGE_MS,
  maximumDeliveryLifetimeMs: MAXIMUM_DELIVERY_LIFETIME_MS,
  credentialReturned: false,
  rawDsnAllowed: false,
  connectionTimeoutMs: 5_000,
  statementTimeoutMs: 5_000,
  lockTimeoutMs: 1_000,
  idleInTransactionSessionTimeoutMs: 5_000,
  openOperationTimeoutMs: OPEN_OPERATION_TIMEOUT_MS,
  queryOperationTimeoutMs: QUERY_OPERATION_TIMEOUT_MS,
  closeOperationTimeoutMs: CLOSE_OPERATION_TIMEOUT_MS,
  retryCount: 0,
  concurrentQueryAllowed: false,
  cancellationMode: "EXACT_CLIENT_HARD_CLOSE",
  hardClosePrimitive: "TLS_STREAM_DESTROY_THEN_CLIENT_END",
  reusableAfterCancellation: false,
  passwordReferencesClearedAfterConnect: true,
  resultShape: "EXACT_FROZEN_ROWS_ONLY",
  deadlineClock: "MONOTONIC_WITH_WALL_CLOCK_FRESHNESS_FLOOR",
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST =
  "b52fae0bc088dc2d2ba6cfd298fc3da56426044c89d5fd4223295f1ca0acbaed" as const;

if (
  canonicalSha256(APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY =
  deepFreeze({
    ...APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
  });

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementConnectionProfile =
  Readonly<{
    host: string;
    port: 5432;
    database: "postgres";
    projectRef: string;
    connectionMode: "DIRECT" | "SESSION_POOLER";
    sslRootCertificate: Uint8Array;
    sslRootCertificateSha256: string;
    targetDescriptorSha256: string;
    expiresAt: string;
  }>;

type ValidatedManagementConnectionProfile =
  CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementConnectionProfile &
    Readonly<{
      validatedAtWallClockMilliseconds: number;
      validatedAtMonotonicMilliseconds: number;
    }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest =
  Readonly<{
    purpose: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_CREDENTIAL_PURPOSE;
    targetDescriptorSha256: string;
    tlsRootCertificateSha256: string;
    user: string;
    applicationName: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME;
    credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD";
    sourceExpiresAt: null;
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET";
    deliveryNonce: string;
    deliveryExpiresNoLaterThan: string;
    maximumDeliveryLifetimeMs: typeof MAXIMUM_DELIVERY_LIFETIME_MS;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialTransport =
  Readonly<{
    consume: (
      request: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
      consumer: (credential: unknown) => PromiseLike<void>,
    ) => PromiseLike<void>;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig = {
  host: string;
  port: 5432;
  database: "postgres";
  user: string;
  password: string | undefined;
  application_name: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME;
  connectionTimeoutMillis: 5_000;
  statement_timeout: 5_000;
  lock_timeout: 1_000;
  idle_in_transaction_session_timeout: 5_000;
  options: "-c row_security=on";
  client_encoding: "UTF8";
  sslnegotiation: "postgres";
  ssl: Readonly<{
    ca: Buffer;
    rejectUnauthorized: true;
  }>;
};

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClient = {
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
  ): PromiseLike<unknown>;
  end(): PromiseLike<unknown>;
  on(event: "error", listener: (error: unknown) => void): unknown;
};

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConstructor =
  new (
    config: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig,
  ) => CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClient;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_MANAGEMENT_SESSION_FACTORY =
  undefined as
    | CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory
    | undefined;

/** Runtime approval remains unavailable even when this source adapter exists. */
export function createCaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementSessionFactory(
  _value: unknown,
): never {
  void _value;
  throw unavailable();
}

/**
 * Creates a source-only management connection boundary. It discovers neither
 * endpoints nor credentials: both arrive through already scoped, injected
 * ports. The static branch-admin password may remain reusable at its source,
 * while each delivery is bound to one factory-generated nonce. The factory
 * retains only a bounded SHA-256/monotonic-expiry registry for replay denial.
 */
export function createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementSessionFactory(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory {
  try {
    const options = exactDataRecord(value, [
      "capability",
      "connectionProfile",
      "credentialTransport",
      "Client",
    ]);
    if (
      options.capability !==
        "TEST_ONLY_M1M_APPROVED_RUNTIME_MANAGEMENT_SESSION" ||
      typeof options.Client !== "function" ||
      nodeTypes.isProxy(options.Client)
    ) {
      throw unavailable();
    }
    const connectionProfile = validateConnectionProfile(
      options.connectionProfile,
    );
    const credentialTransport = validateCredentialTransport(
      options.credentialTransport,
    );
    const Client =
      options.Client as CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConstructor;
    const deliveryReplayRegistry = createDeliveryReplayRegistry();

    return Object.freeze({
      open(context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext) {
        return openManagementSession(
          connectionProfile,
          credentialTransport,
          Client,
          deliveryReplayRegistry,
          context,
        );
      },
    });
  } catch {
    throw unavailable();
  }
}

async function openManagementSession(
  profile: ValidatedManagementConnectionProfile,
  credentialTransport: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialTransport,
  Client: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConstructor,
  deliveryReplayRegistry: DeliveryReplayRegistry,
  contextValue: unknown,
): Promise<CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession> {
  const context = validateContext(contextValue);
  const user = deriveManagementUser(profile);
  const request = Object.freeze({
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_CREDENTIAL_PURPOSE,
    targetDescriptorSha256: profile.targetDescriptorSha256,
    tlsRootCertificateSha256: profile.sslRootCertificateSha256,
    user,
    applicationName:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME,
    credentialClass:
      "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" as const,
    sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" as const,
    deliveryNonce: createDeliveryNonce(),
    deliveryExpiresNoLaterThan: profile.expiresAt,
    maximumDeliveryLifetimeMs: MAXIMUM_DELIVERY_LIFETIME_MS,
  });
  const deadline = performance.now() + OPEN_OPERATION_TIMEOUT_MS;
  let client:
    | CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClient
    | undefined;
  let clientConfig:
    | CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig
    | undefined;
  let password: string | undefined;
  let session:
    | CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession
    | undefined;
  let callbackPromise: Promise<void> | undefined;
  let callbackCount = 0;
  let callbackAccepting = true;
  let state: "OPENING" | "ACTIVE" | "QUERYING" | "CLOSING" | "CLOSED" =
    "OPENING";
  let activeQuery: Promise<Readonly<{ rows: readonly unknown[] }>> | undefined;
  let closePromise: Promise<void> | undefined;
  let streamDestroyed = false;
  let transportFailed = false;

  const clearPasswordReferences = () => {
    password = undefined;
    if (clientConfig) clientConfig.password = undefined;
    clientConfig = undefined;
    if (!client) return;
    try {
      client.password = null;
    } catch {
      // The post-condition below turns any non-clearable client into denial.
    }
    try {
      client.connectionParameters.password = null;
    } catch {
      // The post-condition below turns any non-clearable client into denial.
    }
  };

  const passwordReferencesCleared = () =>
    password === undefined &&
    clientConfig === undefined &&
    client !== undefined &&
    client.password == null &&
    client.connectionParameters.password == null;

  const destroyExactStream = () => {
    if (!client || streamDestroyed) return;
    streamDestroyed = true;
    try {
      client.connection?.stream?.destroy?.();
    } catch {
      // Destruction is best effort; client.end remains the owned close path.
    }
  };

  const closeExactClient = (hard: boolean) => {
    if (hard) destroyExactStream();
    if (closePromise) return closePromise;
    state = "CLOSING";
    context.signal.removeEventListener("abort", abortListener);
    clearPasswordReferences();
    const operation = client
      ? Promise.resolve().then(() => client?.end())
      : Promise.resolve();
    closePromise = settleWithin(operation, CLOSE_OPERATION_TIMEOUT_MS).then(
      () => {
        state = "CLOSED";
        clearPasswordReferences();
      },
      () => {
        destroyExactStream();
        state = "CLOSED";
        clearPasswordReferences();
        throw unavailable();
      },
    );
    return closePromise;
  };

  const interrupt = () => {
    void closeExactClient(true).catch(() => undefined);
  };

  const isOpening = () => state === "OPENING";
  const isActive = () => state === "ACTIVE";

  const abortListener = () => {
    interrupt();
  };

  try {
    requireFreshTarget(profile);
    requireNotAborted(context.signal);
    context.signal.addEventListener("abort", abortListener, { once: true });
    requireNotAborted(context.signal);

    const consumer = (credentialValue: unknown): Promise<void> => {
      if (!callbackAccepting || callbackCount !== 0 || !isOpening()) {
        transportFailed = true;
        interrupt();
        const denied = Promise.reject(unavailable());
        void denied.catch(() => undefined);
        return denied;
      }
      callbackCount += 1;
      callbackPromise = (async () => {
        let rawCredential: unknown = credentialValue;
        let validatedCredential:
          | ReturnType<typeof validateCredential>
          | undefined;
        validatedCredential = validateCredential(
          rawCredential,
          request,
          profile,
        );
        rawCredential = undefined;
        deliveryReplayRegistry.reserve(
          validatedCredential.deliveryNonceSha256,
          validatedCredential.expiresAtMonotonicMilliseconds,
        );
        password = validatedCredential.password;
        validatedCredential = undefined;
        requireFreshTarget(profile);
        requireNotAborted(context.signal);

        clientConfig = createClientConfig(profile, user, password);
        client = new Client(clientConfig);
        if (!isOpening()) {
          destroyExactStream();
          clearPasswordReferences();
          await settleWithin(
            Promise.resolve().then(() => client?.end()),
            CLOSE_OPERATION_TIMEOUT_MS,
          ).catch(() => undefined);
          throw unavailable();
        }
        if (!isCompatibleClient(client)) throw unavailable();
        client.on("error", () => {
          transportFailed = true;
          interrupt();
        });
        if (!isOpening()) throw unavailable();

        await runBounded(
          () => client?.connect(),
          context.signal,
          remainingMilliseconds(deadline),
          interrupt,
        );
        clearPasswordReferences();
        if (!passwordReferencesCleared()) throw unavailable();
        requireVerifiedTls(client);
        requireFreshTarget(profile);
        if (transportFailed || state !== "OPENING") throw unavailable();

        const posture = normalizeQueryResult(
          await runBounded(
            () =>
              client?.query(
                CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_POSTURE_SQL,
              ),
            context.signal,
            remainingMilliseconds(deadline),
            interrupt,
          ),
        );
        validateManagementPosture(posture);
        requireFreshTarget(profile);
        requireNotAborted(context.signal);
        if (transportFailed || state !== "OPENING") throw unavailable();
        state = "ACTIVE";

        session = Object.freeze({
          async query(
            sql: string,
            values: readonly unknown[],
            queryContextValue: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
          ) {
            const queryContext = validateContext(queryContextValue);
            if (
              state !== "ACTIVE" ||
              activeQuery !== undefined ||
              transportFailed ||
              typeof sql !== "string" ||
              sql.length === 0 ||
              sql.length > 1_000_000 ||
              sql.includes("\u0000") ||
              !Array.isArray(values) ||
              nodeTypes.isProxy(values)
            ) {
              throw unavailable();
            }
            requireFreshTarget(profile);
            requireNotAborted(queryContext.signal);
            state = "QUERYING";
            const operation = runBounded(
              () => client?.query(sql, values),
              queryContext.signal,
              QUERY_OPERATION_TIMEOUT_MS,
              interrupt,
            ).then(normalizeQueryResult);
            activeQuery = operation;
            try {
              const result = await operation;
              requireNotAborted(queryContext.signal);
              if (transportFailed || state !== "QUERYING") {
                throw unavailable();
              }
              state = "ACTIVE";
              return result;
            } catch {
              if (state === "QUERYING") state = "ACTIVE";
              throw unavailable();
            } finally {
              if (activeQuery === operation) activeQuery = undefined;
            }
          },
          async end() {
            await closeExactClient(state === "QUERYING");
          },
        });
      })();
      void callbackPromise.catch(() => undefined);
      return callbackPromise.then(() => undefined);
    };

    const transportResult = await runBounded(
      () => credentialTransport.consume(request, context, consumer),
      context.signal,
      remainingMilliseconds(deadline),
      interrupt,
    );
    callbackAccepting = false;
    if (callbackPromise) {
      await runBounded(
        () => callbackPromise,
        context.signal,
        remainingMilliseconds(deadline),
        interrupt,
      );
    }
    if (
      transportResult !== undefined ||
      callbackCount !== 1 ||
      !session ||
      !isActive() ||
      transportFailed ||
      !passwordReferencesCleared()
    ) {
      throw unavailable();
    }
    return session;
  } catch {
    callbackAccepting = false;
    clearPasswordReferences();
    interrupt();
    if (callbackPromise) {
      await settleWithin(callbackPromise, CLOSE_OPERATION_TIMEOUT_MS).catch(
        () => undefined,
      );
    }
    await closeExactClient(true).catch(() => undefined);
    throw unavailable();
  }
}

function validateConnectionProfile(
  value: unknown,
): ValidatedManagementConnectionProfile {
  const object = exactDataRecord(value, [
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
  const host = requireText(object.host).toLowerCase();
  const projectRef = requireProjectRef(object.projectRef);
  const connectionMode = object.connectionMode;
  if (
    host !== object.host ||
    object.port !== 5432 ||
    object.database !== "postgres" ||
    projectRef === CARESLINK_PRODUCTION_SUPABASE_REF ||
    (connectionMode !== "DIRECT" && connectionMode !== "SESSION_POOLER") ||
    (connectionMode === "DIRECT" &&
      host !== `db.${projectRef}.supabase.co`) ||
    (connectionMode === "SESSION_POOLER" &&
      !SESSION_POOLER_HOST_PATTERN.test(host)) ||
    !(object.sslRootCertificate instanceof Uint8Array) ||
    nodeTypes.isProxy(object.sslRootCertificate) ||
    object.sslRootCertificate.byteLength === 0 ||
    object.sslRootCertificate.byteLength > MAXIMUM_CA_BYTES
  ) {
    throw unavailable();
  }
  const sslRootCertificate = Uint8Array.from(object.sslRootCertificate);
  const sslRootCertificateSha256 = requireSha256(
    object.sslRootCertificateSha256,
  );
  if (bytesSha256(sslRootCertificate) !== sslRootCertificateSha256) {
    throw unavailable();
  }
  const expiresAt = requireTimestamp(object.expiresAt);
  const validatedAtWallClockMilliseconds = Date.now();
  const validatedAtMonotonicMilliseconds = performance.now();
  requireFreshTargetAt(expiresAt, validatedAtWallClockMilliseconds);
  return Object.freeze({
    host,
    port: 5432 as const,
    database: "postgres" as const,
    projectRef,
    connectionMode,
    sslRootCertificate,
    sslRootCertificateSha256,
    targetDescriptorSha256: requireSha256(object.targetDescriptorSha256),
    expiresAt,
    validatedAtWallClockMilliseconds,
    validatedAtMonotonicMilliseconds,
  });
}

function validateCredentialTransport(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialTransport {
  const object = exactDataRecord(value, ["consume"]);
  if (
    typeof object.consume !== "function" ||
    nodeTypes.isProxy(object.consume)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    consume:
      object.consume as CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialTransport["consume"],
  });
}

function validateCredential(
  value: unknown,
  expected: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementCredentialRequest,
  profile: ValidatedManagementConnectionProfile,
) {
  const object = exactDataRecord(value, [
    "targetDescriptorSha256",
    "tlsRootCertificateSha256",
    "user",
    "applicationName",
    "credentialClass",
    "sourceExpiresAt",
    "sourceRevocation",
    "deliveryNonce",
    "password",
    "deliveryIssuedAt",
    "deliveryExpiresAt",
    "deliveryOneUse",
    "rawDsnPresent",
  ]);
  if (
    object.targetDescriptorSha256 !== expected.targetDescriptorSha256 ||
    object.tlsRootCertificateSha256 !==
      expected.tlsRootCertificateSha256 ||
    object.user !== expected.user ||
    object.applicationName !== expected.applicationName ||
    object.credentialClass !== expected.credentialClass ||
    object.sourceExpiresAt !== expected.sourceExpiresAt ||
    object.sourceRevocation !== expected.sourceRevocation ||
    object.deliveryNonce !== expected.deliveryNonce ||
    object.deliveryOneUse !== true ||
    object.rawDsnPresent !== false ||
    typeof object.password !== "string" ||
    object.password.length < 16 ||
    object.password.length > 1_024 ||
    object.password.includes("\u0000") ||
    /^postgres(?:ql)?:\/\//i.test(object.password)
  ) {
    throw unavailable();
  }
  const deliveryIssuedAt = Date.parse(
    requireTimestamp(object.deliveryIssuedAt),
  );
  const deliveryExpiresAt = Date.parse(
    requireTimestamp(object.deliveryExpiresAt),
  );
  const now = trustedWallClockMilliseconds(profile);
  const monotonicNow = performance.now();
  if (
    deliveryIssuedAt > now ||
    now - deliveryIssuedAt > MAXIMUM_DELIVERY_AGE_MS ||
    deliveryExpiresAt <= now ||
    deliveryExpiresAt > Date.parse(profile.expiresAt) ||
    deliveryExpiresAt <= deliveryIssuedAt ||
    deliveryExpiresAt - deliveryIssuedAt > MAXIMUM_DELIVERY_LIFETIME_MS ||
    !Number.isFinite(monotonicNow)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    password: object.password,
    deliveryNonceSha256: bytesSha256(
      Buffer.from(requireSha256(object.deliveryNonce), "utf8"),
    ),
    expiresAtMonotonicMilliseconds:
      monotonicNow + (deliveryExpiresAt - now),
  });
}

type DeliveryReplayRegistry = Readonly<{
  reserve: (
    deliveryNonceSha256: string,
    expiresAtMonotonicMilliseconds: number,
  ) => void;
}>;

function createDeliveryReplayRegistry(): DeliveryReplayRegistry {
  const consumed = new Map<string, number>();
  return Object.freeze({
    reserve(
      deliveryNonceSha256: string,
      expiresAtMonotonicMilliseconds: number,
    ) {
      const now = performance.now();
      if (
        !SHA256_PATTERN.test(deliveryNonceSha256) ||
        !Number.isFinite(now) ||
        !Number.isFinite(expiresAtMonotonicMilliseconds) ||
        expiresAtMonotonicMilliseconds <= now ||
        expiresAtMonotonicMilliseconds > now + MAXIMUM_DELIVERY_LIFETIME_MS
      ) {
        throw unavailable();
      }
      for (const [digest, expiresAt] of consumed) {
        if (expiresAt <= now) consumed.delete(digest);
      }
      if (
        consumed.has(deliveryNonceSha256) ||
        consumed.size >= MAXIMUM_TRACKED_DELIVERY_NONCES
      ) {
        throw unavailable();
      }
      consumed.set(deliveryNonceSha256, expiresAtMonotonicMilliseconds);
    },
  });
}

function createDeliveryNonce() {
  let bytes: Buffer | undefined;
  try {
    bytes = randomBytes(DELIVERY_NONCE_BYTES);
    const nonce = bytes.toString("hex");
    if (!SHA256_PATTERN.test(nonce)) throw unavailable();
    return nonce;
  } catch {
    throw unavailable();
  } finally {
    bytes?.fill(0);
  }
}

function createClientConfig(
  profile: ValidatedManagementConnectionProfile,
  user: string,
  password: string,
): CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConfig {
  return {
    host: profile.host,
    port: 5432,
    database: "postgres",
    user,
    password,
    application_name:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME,
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

function deriveManagementUser(
  profile: ValidatedManagementConnectionProfile,
) {
  return profile.connectionMode === "SESSION_POOLER"
    ? `postgres.${profile.projectRef}`
    : "postgres";
}

function isCompatibleClient(
  value: unknown,
): value is CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClient {
  return Boolean(
    value &&
      typeof value === "object" &&
      !nodeTypes.isProxy(value) &&
      typeof (value as Record<string, unknown>).connect === "function" &&
      typeof (value as Record<string, unknown>).query === "function" &&
      typeof (value as Record<string, unknown>).end === "function" &&
      typeof (value as Record<string, unknown>).on === "function" &&
      (value as Record<string, unknown>).connectionParameters &&
      typeof (value as Record<string, unknown>).connectionParameters ===
        "object",
  );
}

function requireVerifiedTls(
  client: CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClient,
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

function validateManagementPosture(
  result: Readonly<{ rows: readonly unknown[] }>,
) {
  if (result.rows.length !== 1) throw unavailable();
  const row = exactDataRecord(result.rows[0], [
    "current_user",
    "session_user",
    "database_name",
    "postgres_major",
    "application_name",
    "row_security",
  ]);
  if (
    row.current_user !== "postgres" ||
    row.session_user !== "postgres" ||
    row.database_name !== "postgres" ||
    row.postgres_major !== 17 ||
    row.application_name !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_APPLICATION_NAME ||
    row.row_security !== "on"
  ) {
    throw unavailable();
  }
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
  if (
    !(object.signal instanceof AbortSignal) ||
    nodeTypes.isProxy(object.signal)
  ) {
    throw unavailable();
  }
  return Object.freeze({ signal: object.signal });
}

async function runBounded<T>(
  operation: () => PromiseLike<T> | T | undefined,
  signal: AbortSignal,
  timeoutMilliseconds: number,
  interrupt: () => void,
): Promise<T> {
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
    interrupt();
    throw unavailable();
  }
  requireNotAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    const deny = () => {
      interrupt();
      reject(unavailable());
    };
    abortListener = deny;
    signal.addEventListener("abort", deny, { once: true });
    timer = setTimeout(deny, timeoutMilliseconds);
  });
  try {
    requireNotAborted(signal);
    return await Promise.race([
      Promise.resolve().then(operation) as Promise<T>,
      interrupted,
    ]);
  } catch {
    throw unavailable();
  } finally {
    if (timer) clearTimeout(timer);
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

async function settleWithin(
  operation: PromiseLike<unknown>,
  timeoutMilliseconds: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(unavailable()), timeoutMilliseconds);
  });
  try {
    await Promise.race([Promise.resolve(operation), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function remainingMilliseconds(deadline: number) {
  return Math.max(0, deadline - performance.now());
}

function trustedWallClockMilliseconds(profile: ValidatedManagementConnectionProfile) {
  const monotonicElapsed = Math.max(
    0,
    performance.now() - profile.validatedAtMonotonicMilliseconds,
  );
  return Math.max(
    Date.now(),
    profile.validatedAtWallClockMilliseconds + monotonicElapsed,
  );
}

function requireFreshTarget(profile: ValidatedManagementConnectionProfile) {
  requireFreshTargetAt(
    profile.expiresAt,
    trustedWallClockMilliseconds(profile),
  );
}

function requireFreshTargetAt(expiresAt: string, now: number) {
  const expiresAtMilliseconds = Date.parse(expiresAt);
  if (
    expiresAtMilliseconds <= now ||
    expiresAtMilliseconds > now + MAXIMUM_TARGET_LIFETIME_MS
  ) {
    throw unavailable();
  }
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

function requireProjectRef(value: unknown) {
  if (typeof value !== "string" || !PROJECT_REF_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown) {
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

function bytesSha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
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
  if (prototype !== Object.prototype && prototype !== null) {
    throw unavailable();
  }
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

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note approved runtime management session is unavailable",
  );
}
