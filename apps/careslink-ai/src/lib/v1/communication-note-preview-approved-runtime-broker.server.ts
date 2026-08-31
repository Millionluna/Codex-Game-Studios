import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
  type CaresLinkV1CommunicationNotePreviewDurableCredentialAuditPort,
  type CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort,
  type CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
} from "./communication-note-preview-durable-caller-credential-resolver.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
} from "./communication-note-preview-runner-terminal-postgres.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const SCRAM_SHA_256_PATTERN =
  /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONSUMED_MANAGEMENT_SESSIONS = new WeakSet<object>();

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_VERSION =
  "broker-adapter.communication.openai.synthetic-preview.2026-08-31.m1m.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_READY =
  false as const;

const APPROVED_RUNTIME_BROKER_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_VERSION,
  status: "SOURCE_ADAPTER_NOT_ACTIVATED",
  ready: false,
  durableResolverVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
  durableResolverPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
  lifecycleOperations: [
    "ACQUIRE",
    "BIND",
    "TOMBSTONE",
    "FINALIZE",
    "INSPECT",
  ],
  freshSingleUseManagementSessionPerOperation: true,
  tombstoneAndFinalizeShareSession: false,
  independentAuditSessionRequired: true,
  automaticMutationRetry: false,
  responseLossRetryAllowed: false,
  closeFailureAuthoritative: true,
  normalizedRowsOnly: true,
  rawCredentialMaterialPersisted: false,
  targetBinding: "REQUIRED_BY_SEALED_COMPOSITION",
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY_DIGEST =
  "1498ea8e26014afcfc02a6f418f5eec783dd58a7485673d51edb04bef965fb0e" as const;

if (
  canonicalSha256(APPROVED_RUNTIME_BROKER_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY =
  deepFreeze({
    ...APPROVED_RUNTIME_BROKER_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY_DIGEST,
  });

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_BROKER_PORT =
  undefined as
    | CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort
    | undefined;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_BROKER_AUDIT_PORT =
  undefined as
    | CaresLinkV1CommunicationNotePreviewDurableCredentialAuditPort
    | undefined;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_ACQUIRE_SQL =
  `select careslink_v1_runtime_broker.acquire(
  $1::pg_catalog.text,
  $2::pg_catalog.text,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text,
  $7::pg_catalog.text,
  $8::pg_catalog.text,
  $9::pg_catalog.text,
  $10::pg_catalog.text,
  $11::pg_catalog.timestamptz
) as data` as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_BIND_SQL =
  `select careslink_v1_runtime_broker.bind(
  $1::pg_catalog.text,
  $2::pg_catalog.int4
) as data` as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_TOMBSTONE_SQL =
  `select careslink_v1_runtime_broker.tombstone(
  $1::pg_catalog.text
) as data` as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_FINALIZE_SQL =
  `select careslink_v1_runtime_broker.finalize(
  $1::pg_catalog.text
) as data` as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_INSPECT_SQL =
  `select careslink_v1_runtime_broker.inspect(
  $1::pg_catalog.text
) as data` as const;

export type CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession =
  Readonly<{
    query: (
      sql: string,
      values: readonly unknown[],
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
    end: () => PromiseLike<void>;
  }>;

export type CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory =
  Readonly<{
    open: (
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters =
  Readonly<{
    brokerPort: CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort;
    auditPort: CaresLinkV1CommunicationNotePreviewDurableCredentialAuditPort;
  }>;

/** Runtime approval remains unavailable even when the source adapter exists. */
export function createCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters(
  _value: unknown,
): never {
  void _value;
  throw unavailable();
}

/**
 * Builds source-only ports around an injected, already target-bound management
 * session factory. The factory must return a new single-use session for every
 * lifecycle call; this module never discovers an endpoint or credential.
 */
export function createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters {
  const options = exactDataRecord(value, [
    "capability",
    "managementSessionFactory",
  ]);
  if (
    options.capability !==
    "TEST_ONLY_M1M_APPROVED_RUNTIME_BROKER_ADAPTERS"
  ) {
    throw unavailable();
  }
  const factory = validateManagementSessionFactory(
    options.managementSessionFactory,
  );

  const brokerPort = Object.freeze({
    acquire: async (request: unknown, context: unknown) => {
      const callContext = validateCallContext(context);
      const validated = validateAcquireRequest(request);
      return invokeFreshSession(
        factory,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_ACQUIRE_SQL,
        Object.freeze([
          validated.acquisitionRequestDigest,
          validated.authorizationDigest,
          validated.runIdHash,
          validated.databaseTargetDigest,
          validated.callerIdentityHmac,
          validated.runtimeRole,
          validated.leaseReferenceSha256,
          validated.sessionBindingSha256,
          validated.credentialVerifier,
          validated.credentialVerifierSha256,
          validated.requestedExpiresAt,
        ]),
        callContext,
        (result) => validateAcquireReceipt(result, validated),
      );
    },
    bind: async (request: unknown, context: unknown) => {
      const callContext = validateCallContext(context);
      const validated = validateBindRequest(request);
      return invokeFreshSession(
        factory,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_BIND_SQL,
        Object.freeze([
          validated.acquisitionRequestDigest,
          validated.backendPid,
        ]),
        callContext,
        (result) => validateBindReceipt(result, validated),
      );
    },
    tombstone: async (request: unknown, context: unknown) => {
      const callContext = validateCallContext(context);
      const validated = validateReleaseRequest(request);
      return invokeFreshSession(
        factory,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_TOMBSTONE_SQL,
        Object.freeze([validated.acquisitionRequestDigest]),
        callContext,
        (result) => validateTombstoneReceipt(result, validated),
      );
    },
    finalize: async (request: unknown, context: unknown) => {
      const callContext = validateCallContext(context);
      const validated = validateReleaseRequest(request);
      return invokeFreshSession(
        factory,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_FINALIZE_SQL,
        Object.freeze([validated.acquisitionRequestDigest]),
        callContext,
        (result) => validateFinalizeReceipt(result, validated),
      );
    },
  }) satisfies CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort;

  const auditPort = Object.freeze({
    inspect: async (request: unknown, context: unknown) => {
      const callContext = validateCallContext(context);
      const validated = validateReleaseRequest(request);
      return invokeFreshSession(
        factory,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_INSPECT_SQL,
        Object.freeze([validated.acquisitionRequestDigest]),
        callContext,
        (result) => validateInspectReceipt(result, validated),
      );
    },
  }) satisfies CaresLinkV1CommunicationNotePreviewDurableCredentialAuditPort;

  return Object.freeze({ brokerPort, auditPort });
}

async function invokeFreshSession<T>(
  factory: CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory,
  sql: string,
  values: readonly unknown[],
  context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
  parse: (value: unknown) => T,
): Promise<T> {
  let session:
    | CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession
    | undefined;
  let rawResult: unknown;
  let primaryFailed = false;
  let closeFailed = false;
  try {
    requireNotAborted(context);
    const opened = await Promise.resolve().then(() => factory.open(context));
    session = claimFreshManagementSession(opened);
    // Claim ownership before observing a concurrent Abort so every successfully
    // opened management session is closed by the finally block.
    requireNotAborted(context);
    rawResult = await Promise.resolve().then(() =>
      session?.query(sql, values, context),
    );
    requireNotAborted(context);
  } catch {
    primaryFailed = true;
  } finally {
    if (session) {
      try {
        await Promise.resolve().then(() => session?.end());
      } catch {
        closeFailed = true;
      }
    }
  }
  if (primaryFailed || closeFailed) throw unavailable();
  requireNotAborted(context);
  try {
    return parse(rawResult);
  } catch {
    throw unavailable();
  }
}

function validateAcquireRequest(value: unknown) {
  const request = exactDataRecord(value, [
    "version",
    "policyDigest",
    "acquisitionRequestDigest",
    "authorizationDigest",
    "runIdHash",
    "databaseTargetDigest",
    "callerIdentityHmac",
    "purpose",
    "callerRole",
    "runtimeRole",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "credentialVerifierSha256",
    "credentialVerifier",
    "requestedExpiresAt",
    "rawCredentialMaterialPresent",
  ]);
  const acquisitionRequestDigest = requireSha256(
    request.acquisitionRequestDigest,
  );
  const credentialVerifier = requireScramVerifier(
    request.credentialVerifier,
  );
  const credentialVerifierSha256 = requireSha256(
    request.credentialVerifierSha256,
  );
  const runtimeRole = requireRuntimeRole(request.runtimeRole);
  if (
    request.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION ||
    request.policyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST ||
    request.purpose !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE ||
    request.callerRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE ||
    runtimeRole !==
      `careslink_v1_preview_runner_terminal_runtime_${acquisitionRequestDigest.slice(0, 16)}` ||
    sha256(credentialVerifier) !== credentialVerifierSha256 ||
    request.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const authorizationDigest = requireSha256(request.authorizationDigest);
  const runIdHash = requireSha256(request.runIdHash);
  const databaseTargetDigest = requireSha256(request.databaseTargetDigest);
  const callerIdentityHmac = requireSha256(request.callerIdentityHmac);
  const leaseReferenceSha256 = requireSha256(
    request.leaseReferenceSha256,
  );
  const sessionBindingSha256 = requireSha256(
    request.sessionBindingSha256,
  );
  const requestedExpiresAt = requireTimestamp(request.requestedExpiresAt);
  if (
    new Set([
      acquisitionRequestDigest,
      leaseReferenceSha256,
      sessionBindingSha256,
      credentialVerifierSha256,
    ]).size !== 4
  ) {
    throw unavailable();
  }
  return Object.freeze({
    acquisitionRequestDigest,
    authorizationDigest,
    runIdHash,
    databaseTargetDigest,
    callerIdentityHmac,
    runtimeRole,
    leaseReferenceSha256,
    sessionBindingSha256,
    credentialVerifierSha256,
    credentialVerifier,
    requestedExpiresAt,
  });
}

function validateBindRequest(value: unknown) {
  const request = exactDataRecord(value, [
    "version",
    "policyDigest",
    "acquisitionRequestDigest",
    "authorizationDigest",
    "runIdHash",
    "databaseTargetDigest",
    "runtimeRole",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "backendPid",
    "rawCredentialMaterialPresent",
  ]);
  const acquisitionRequestDigest = requireSha256(
    request.acquisitionRequestDigest,
  );
  const runtimeRole = requireRuntimeRole(request.runtimeRole);
  if (
    request.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION ||
    request.policyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST ||
    runtimeRole !==
      `careslink_v1_preview_runner_terminal_runtime_${acquisitionRequestDigest.slice(0, 16)}` ||
    !Number.isSafeInteger(request.backendPid) ||
    (request.backendPid as number) <= 0 ||
    request.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return Object.freeze({
    acquisitionRequestDigest,
    authorizationDigest: requireSha256(request.authorizationDigest),
    runIdHash: requireSha256(request.runIdHash),
    databaseTargetDigest: requireSha256(request.databaseTargetDigest),
    runtimeRole,
    leaseReferenceSha256: requireSha256(request.leaseReferenceSha256),
    sessionBindingSha256: requireSha256(request.sessionBindingSha256),
    backendPid: request.backendPid as number,
  });
}

function validateReleaseRequest(value: unknown) {
  const request = exactDataRecord(value, [
    "version",
    "policyDigest",
    "acquisitionRequestDigest",
    "authorizationDigest",
    "runIdHash",
    "databaseTargetDigest",
    "callerRole",
    "rawCredentialMaterialPresent",
  ]);
  if (
    request.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION ||
    request.policyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST ||
    request.callerRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE ||
    request.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return Object.freeze({
    acquisitionRequestDigest: requireSha256(
      request.acquisitionRequestDigest,
    ),
    authorizationDigest: requireSha256(request.authorizationDigest),
    runIdHash: requireSha256(request.runIdHash),
    databaseTargetDigest: requireSha256(request.databaseTargetDigest),
  });
}

function validateAcquireReceipt(
  value: unknown,
  request: ReturnType<typeof validateAcquireRequest>,
) {
  const receipt = exactDataReceipt(value, [
    "status",
    "acquisitionRequestDigest",
    "runtimeRole",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "credentialVerifierSha256",
    "issuedAt",
    "expiresAt",
    "rawCredentialMaterialPresent",
  ]);
  const issuedAt = requireTimestamp(receipt.issuedAt);
  const expiresAt = requireTimestamp(receipt.expiresAt);
  if (
    receipt.status !== "ISSUED_UNBOUND" ||
    receipt.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    receipt.runtimeRole !== request.runtimeRole ||
    receipt.leaseReferenceSha256 !== request.leaseReferenceSha256 ||
    receipt.sessionBindingSha256 !== request.sessionBindingSha256 ||
    receipt.credentialVerifierSha256 !==
      request.credentialVerifierSha256 ||
    expiresAt !== request.requestedExpiresAt ||
    Date.parse(expiresAt) <= Date.parse(issuedAt) ||
    receipt.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    status: "ISSUED_UNBOUND" as const,
    acquisitionRequestDigest: request.acquisitionRequestDigest,
    runtimeRole: request.runtimeRole,
    leaseReferenceSha256: request.leaseReferenceSha256,
    sessionBindingSha256: request.sessionBindingSha256,
    credentialVerifierSha256: request.credentialVerifierSha256,
    issuedAt,
    expiresAt,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateBindReceipt(
  value: unknown,
  request: ReturnType<typeof validateBindRequest>,
) {
  const receipt = exactDataReceipt(value, [
    "status",
    "acquisitionRequestDigest",
    "runtimeRole",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "backendPid",
    "rawCredentialMaterialPresent",
  ]);
  if (
    receipt.status !== "ACTIVE" ||
    receipt.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    receipt.runtimeRole !== request.runtimeRole ||
    receipt.leaseReferenceSha256 !== request.leaseReferenceSha256 ||
    receipt.sessionBindingSha256 !== request.sessionBindingSha256 ||
    receipt.backendPid !== request.backendPid ||
    receipt.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    status: "ACTIVE" as const,
    acquisitionRequestDigest: request.acquisitionRequestDigest,
    runtimeRole: request.runtimeRole,
    leaseReferenceSha256: request.leaseReferenceSha256,
    sessionBindingSha256: request.sessionBindingSha256,
    backendPid: request.backendPid,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateTombstoneReceipt(
  value: unknown,
  request: ReturnType<typeof validateReleaseRequest>,
) {
  const receipt = exactDataReceipt(value, [
    "status",
    "acquisitionRequestDigest",
    "everIssued",
    "futureIssuanceBlocked",
    "rawCredentialMaterialPresent",
  ]);
  if (
    receipt.status !== "TOMBSTONED" ||
    receipt.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    typeof receipt.everIssued !== "boolean" ||
    receipt.futureIssuanceBlocked !== true ||
    receipt.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    status: "TOMBSTONED" as const,
    acquisitionRequestDigest: request.acquisitionRequestDigest,
    everIssued: receipt.everIssued,
    futureIssuanceBlocked: true as const,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateFinalizeReceipt(
  value: unknown,
  request: ReturnType<typeof validateReleaseRequest>,
) {
  const receipt = exactDataReceipt(value, [
    "status",
    "acquisitionRequestDigest",
    "everIssued",
    "futureIssuanceBlocked",
    "roleCount",
    "sessionCount",
    "membershipCount",
    "rawCredentialMaterialPresent",
  ]);
  if (
    receipt.status !== "REVOKED" ||
    receipt.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    typeof receipt.everIssued !== "boolean" ||
    receipt.futureIssuanceBlocked !== true ||
    receipt.roleCount !== 0 ||
    receipt.sessionCount !== 0 ||
    receipt.membershipCount !== 0 ||
    receipt.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    status: "REVOKED" as const,
    acquisitionRequestDigest: request.acquisitionRequestDigest,
    everIssued: receipt.everIssued,
    futureIssuanceBlocked: true as const,
    roleCount: 0 as const,
    sessionCount: 0 as const,
    membershipCount: 0 as const,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateInspectReceipt(
  value: unknown,
  request: ReturnType<typeof validateReleaseRequest>,
) {
  const receipt = exactDataReceipt(value, [
    "status",
    "acquisitionRequestDigest",
    "everIssued",
    "futureIssuanceBlocked",
    "roleCount",
    "sessionCount",
    "membershipCount",
    "credentialVerifierResidueCount",
    "rawCredentialMaterialPresent",
  ]);
  if (
    receipt.status !== "REVOKED_ATTESTED" ||
    receipt.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    typeof receipt.everIssued !== "boolean" ||
    receipt.futureIssuanceBlocked !== true ||
    receipt.roleCount !== 0 ||
    receipt.sessionCount !== 0 ||
    receipt.membershipCount !== 0 ||
    receipt.credentialVerifierResidueCount !== 0 ||
    receipt.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    status: "REVOKED_ATTESTED" as const,
    acquisitionRequestDigest: request.acquisitionRequestDigest,
    everIssued: receipt.everIssued,
    futureIssuanceBlocked: true as const,
    roleCount: 0 as const,
    sessionCount: 0 as const,
    membershipCount: 0 as const,
    credentialVerifierResidueCount: 0 as const,
    rawCredentialMaterialPresent: false as const,
  });
}

function exactDataReceipt<const Key extends string>(
  value: unknown,
  receiptKeys: readonly Key[],
): Record<Key, unknown> {
  const result = exactDataRecord(value, ["rows"]);
  const rows = exactDataArray(result.rows, 1);
  const row = exactDataRecord(rows[0], ["data"]);
  return exactDataRecord(row.data, receiptKeys);
}

function validateManagementSessionFactory(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory {
  const object = exactDataRecord(value, ["open"]);
  if (typeof object.open !== "function" || nodeTypes.isProxy(object.open)) {
    throw unavailable();
  }
  return Object.freeze({
    open:
      object.open as CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory["open"],
  });
}

function claimFreshManagementSession(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession {
  const object = exactDataRecord(value, ["query", "end"]);
  if (
    typeof object.query !== "function" ||
    nodeTypes.isProxy(object.query) ||
    typeof object.end !== "function" ||
    nodeTypes.isProxy(object.end) ||
    object.query === object.end ||
    CONSUMED_MANAGEMENT_SESSIONS.has(value as object)
  ) {
    throw unavailable();
  }
  CONSUMED_MANAGEMENT_SESSIONS.add(value as object);
  return value as CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSession;
}

function validateCallContext(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext {
  const object = exactDataRecord(value, ["signal"]);
  if (!(object.signal instanceof AbortSignal)) throw unavailable();
  return Object.freeze({ signal: object.signal });
}

function requireNotAborted(
  context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
) {
  if (context.signal.aborted) throw unavailable();
}

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireRuntimeRole(value: unknown): string {
  if (typeof value !== "string" || !RUNTIME_ROLE_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireScramVerifier(value: unknown): string {
  if (typeof value !== "string" || !SCRAM_SHA_256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    throw unavailable();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw unavailable();
  }
  return value;
}

function exactDataRecord<const Key extends string>(
  value: unknown,
  expectedKeys: readonly Key[],
): Record<Key, unknown> {
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
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw unavailable();
  }
  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactDataArray(value: unknown, expectedLength: number) {
  if (
    !Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== expectedLength ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const expectedNames = [
    ...Array.from({ length: expectedLength }, (_, index) => String(index)),
    "length",
  ].sort();
  const names = Object.getOwnPropertyNames(value).sort();
  if (
    names.length !== expectedNames.length ||
    names.some((name, index) => name !== expectedNames[index])
  ) {
    throw unavailable();
  }
  for (let index = 0; index < expectedLength; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
  }
  return value as readonly unknown[];
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
    "Communication Note approved runtime broker adapter is unavailable",
  );
}
