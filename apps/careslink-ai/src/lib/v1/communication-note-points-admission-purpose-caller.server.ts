import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME,
  createCaresLinkV1CommunicationNotePointsAdmissionRepository,
  type CaresLinkV1CommunicationNotePointsAdmissionRepository,
} from "./note-generation-owner-repository.server";
import { CaresLinkV1ContractError } from "./shared-contracts";
import type { CaresLinkV1AuthenticatedPrincipal } from "./transport-contract";

const MAXIMUM_TARGET_LIFETIME_MS = 5 * 60 * 1_000;
const MAXIMUM_CREDENTIAL_LIFETIME_MS = 90 * 1_000;
const RESOLVER_SETTLEMENT_TIMEOUT_MS = 5 * 1_000;
const DATABASE_SETTLEMENT_TIMEOUT_MS = 12 * 1_000;
const SESSION_DESTROY_SETTLEMENT_TIMEOUT_MS = 5 * 1_000;
const CREDENTIAL_REVOCATION_SETTLEMENT_TIMEOUT_MS = 5 * 1_000;
const CLEANUP_SCHEDULING_MARGIN_MS = 3 * 1_000;
const MINIMUM_CREDENTIAL_REMAINING_MS =
  DATABASE_SETTLEMENT_TIMEOUT_MS +
  SESSION_DESTROY_SETTLEMENT_TIMEOUT_MS +
  CREDENTIAL_REVOCATION_SETTLEMENT_TIMEOUT_MS +
  CLEANUP_SCHEDULING_MARGIN_MS;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_points_admission_runtime_[a-f0-9]{16}$/;
const SESSION_DESCRIPTOR_KEYS = [
  "status",
  "requestDigest",
  "deploymentEnvironment",
  "targetClass",
  "purpose",
  "callerRole",
  "effectiveRole",
  "runtimeRole",
  "rpcNames",
  "rpcParameterCount",
  "databaseTargetDigest",
  "targetProjectRefHmac",
  "productionProjectRefHmac",
  "controlPlaneEvidenceSha256",
  "databaseName",
  "postgresMajor",
  "projectStatus",
  "connectionMode",
  "port",
  "tlsMode",
  "tlsRootCertificateSha256",
  "requiredConnectionMode",
  "transactionMode",
  "transactionPoolerUsed",
  "preparedStatementsUsed",
  "roleActivationMode",
  "callerMembershipAdmin",
  "callerMembershipInherit",
  "callerMembershipSet",
  "executorMembershipPresent",
  "serviceRoleFallback",
  "leaseReferenceSha256",
  "sessionBindingSha256",
  "issuedAt",
  "expiresAt",
  "revokeBy",
  "reuseAllowed",
  "concurrentUseAllowed",
  "rawCredentialMaterialPresent",
] as const;

const DATABASE_TARGETS = new WeakSet<object>();
const CREDENTIAL_RESOLVERS = new WeakSet<object>();
const SESSION_LEASES = new WeakMap<
  object,
  {
    readonly query: PurposeSessionQuery;
    readonly destroy: PurposeSessionDestroy;
    state: "ISSUED" | "CONSUMED" | "RELEASED";
  }
>();
const CONSUMED_QUERY_FUNCTIONS = new WeakSet<PurposeSessionQuery>();

export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_VERSION =
  "binding.communication.openai.synthetic-preview.2026-09-03.m2a.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_READY =
  false as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE =
  "COMMUNICATION_NOTE_POLICY_BOUND_POINTS_ADMISSION" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE =
  "careslink_v1_generation_points_admission_caller" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_POSTGRES_SQL =
  `select careslink_v1_generation.${CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME}(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.uuid,
  $5::pg_catalog.uuid,
  $6::pg_catalog.uuid,
  $7::pg_catalog.text,
  $8::pg_catalog.text,
  $9::pg_catalog.text,
  $10::pg_catalog.text,
  $11::pg_catalog.text,
  $12::pg_catalog.text,
  $13::pg_catalog.text,
  $14::pg_catalog.timestamptz,
  $15::pg_catalog.text,
  $16::pg_catalog.text,
  $17::pg_catalog.text,
  $18::pg_catalog.text,
  $19::pg_catalog.text
) as data` as const;

const POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_VERSION,
  status: "SOURCE_ADAPTER_NOT_ACTIVATED",
  ready: false,
  deploymentEnvironment: "PREVIEW",
  targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
  purpose:
    CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
  callerRole: CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
  rpcNames: [CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME],
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
  maximumTargetLifetimeMs: MAXIMUM_TARGET_LIFETIME_MS,
  maximumCredentialLifetimeMs: MAXIMUM_CREDENTIAL_LIFETIME_MS,
  minimumCredentialRemainingMs: MINIMUM_CREDENTIAL_REMAINING_MS,
  resolverSettlementTimeoutMs: RESOLVER_SETTLEMENT_TIMEOUT_MS,
  databaseSettlementTimeoutMs: DATABASE_SETTLEMENT_TIMEOUT_MS,
  sessionDestroySettlementTimeoutMs: SESSION_DESTROY_SETTLEMENT_TIMEOUT_MS,
  credentialRevocationSettlementTimeoutMs:
    CREDENTIAL_REVOCATION_SETTLEMENT_TIMEOUT_MS,
  cleanupSchedulingMarginMs: CLEANUP_SCHEDULING_MARGIN_MS,
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
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY_DIGEST =
  "64364864ff7c256766651e6df4d2ab3bfefcecad185e67a1a88be2a76eb0f085" as const;

if (
  canonicalSha256(POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY =
  deepFreeze({
    ...POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY_DIGEST,
  });

type BoundedCallContext = Readonly<{ signal: AbortSignal }>;

type PurposeSessionQuery = (
  sql: string,
  values: readonly unknown[],
  context: BoundedCallContext,
) => PromiseLike<unknown>;

type PurposeSessionDestroy = (
  context: BoundedCallContext,
) => PromiseLike<unknown>;

export type CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver =
  Readonly<{
    acquire(
      request: unknown,
      context: BoundedCallContext,
    ): PromiseLike<unknown>;
    revoke(
      request: unknown,
      context: BoundedCallContext,
    ): PromiseLike<unknown>;
  }>;

export type CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget =
  Readonly<{
    status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED";
    deploymentEnvironment: "PREVIEW";
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW";
    targetProjectRefHmac: string;
    productionProjectRefHmac: string;
    controlPlaneEvidenceSha256: string;
    databaseName: "postgres";
    postgresMajor: 17;
    projectStatus: "ACTIVE_HEALTHY";
    connectionMode: "DIRECT" | "SESSION_POOLER";
    port: 5432;
    tlsMode: "VERIFY_FULL_PINNED_CA";
    tlsRootCertificateSha256: string;
    observedAt: string;
    expiresAt: string;
    defaultBranch: false;
    persistent: false;
    withData: false;
    productionExcluded: true;
    rawCredentialMaterialPresent: false;
  }>;

export type CaresLinkV1CommunicationNotePointsAdmissionPurposeCallerAdapter =
  Readonly<{
    status: "SOURCE_ADAPTER_NOT_ACTIVATED";
    purpose: typeof CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE;
    callerRole: typeof CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE;
    createRepository(input: {
      principal: CaresLinkV1AuthenticatedPrincipal;
      signal: AbortSignal;
    }): CaresLinkV1CommunicationNotePointsAdmissionRepository;
  }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_ADAPTER =
  undefined as
    | CaresLinkV1CommunicationNotePointsAdmissionPurposeCallerAdapter
    | undefined;

/**
 * Brands a secret-free, independently validated Preview target. This performs
 * no control-plane lookup; formal composition must inject fresh evidence.
 */
export function createCaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget(
  value: unknown,
): CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget {
  const target = validateDatabaseTarget(value);
  DATABASE_TARGETS.add(target);
  return target;
}

/**
 * Captures an injected purpose credential resolver. The runner-terminal
 * resolver is deliberately incompatible and cannot satisfy this brand.
 */
export function createCaresLinkV1CommunicationNotePointsAdmissionCredentialResolver(
  value: unknown,
): CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver {
  const object = exactDataRecord(value, ["capability", "acquire", "revoke"]);
  if (
    object.capability !== "INJECTED_POINTS_ADMISSION_CREDENTIAL_RESOLVER" ||
    typeof object.acquire !== "function" ||
    nodeTypes.isProxy(object.acquire) ||
    typeof object.revoke !== "function" ||
    nodeTypes.isProxy(object.revoke)
  ) {
    throw unavailable();
  }
  const resolver = Object.freeze({
    acquire:
      object.acquire as CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver["acquire"],
    revoke:
      object.revoke as CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver["revoke"],
  });
  CREDENTIAL_RESOLVERS.add(resolver);
  return resolver;
}

/**
 * Keeps query/destroy capabilities out of the public lease descriptor. The
 * complete descriptor is checked before branding, so passwords, DSNs and
 * every other unreviewed field are rejected before anything is returned.
 */
export function createCaresLinkV1CommunicationNotePointsAdmissionPurposeSessionLease(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const object = exactDataRecord(value, [
    "capability",
    "descriptor",
    "destroy",
    "query",
  ]);
  if (
    object.capability !== "INJECTED_POINTS_ADMISSION_EXCLUSIVE_SESSION" ||
    typeof object.query !== "function" ||
    nodeTypes.isProxy(object.query) ||
    typeof object.destroy !== "function" ||
    nodeTypes.isProxy(object.destroy)
  ) {
    throw unavailable();
  }
  const lease = validateSessionLeaseDescriptorShape(object.descriptor);
  SESSION_LEASES.set(lease, {
    query: object.query as PurposeSessionQuery,
    destroy: object.destroy as PurposeSessionDestroy,
    state: "ISSUED",
  });
  return lease;
}

/**
 * Production-safe injected core. It performs no environment lookup and opens
 * no connection itself. Each repository accepts exactly one enqueue call and
 * obtains exactly one short-lived, purpose-bound physical session for it.
 */
export function createCaresLinkV1CommunicationNotePointsAdmissionPurposeCallerAdapter(
  value: unknown,
): CaresLinkV1CommunicationNotePointsAdmissionPurposeCallerAdapter {
  const options = exactDataRecord(value, [
    "clock",
    "credentialResolver",
    "databaseTarget",
  ]);
  const databaseTarget = requireDatabaseTarget(options.databaseTarget);
  const credentialResolver = requireCredentialResolver(
    options.credentialResolver,
  );
  const clock = validateClock(options.clock);

  return Object.freeze({
    status: "SOURCE_ADAPTER_NOT_ACTIVATED" as const,
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
    createRepository(rawInput: unknown) {
      const input = exactDataRecord(rawInput, ["principal", "signal"]);
      if (
        !(input.signal instanceof AbortSignal) ||
        nodeTypes.isProxy(input.signal) ||
        input.signal.aborted
      ) {
        throw unavailable();
      }
      const signal = input.signal;
      let consumed = false;
      const repository =
        createCaresLinkV1CommunicationNotePointsAdmissionRepository({
          principal: input.principal as CaresLinkV1AuthenticatedPrincipal,
          async query(sql, values) {
            if (consumed) throw unavailable();
            consumed = true;
            validateRepositoryCall(sql, values);
            return executeOneAdmission({
              clock,
              credentialResolver,
              databaseTarget,
              signal,
              sql,
              values,
            });
          },
        });
      return repository;
    },
  });
}

async function executeOneAdmission(input: Readonly<{
  clock: Readonly<{ now(): string }>;
  credentialResolver: CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver;
  databaseTarget: CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget;
  signal: AbortSignal;
  sql: string;
  values: readonly unknown[];
}>) {
  requireNotAborted(input.signal);
  const requestNow = readClock(input.clock);
  validateDatabaseTargetFreshness(input.databaseTarget, requestNow);
  const acquisitionRequest = createAcquisitionRequest(
    input.databaseTarget,
    requestNow,
  );
  let rawLease: unknown;
  let result: unknown;
  let primaryFailure: unknown;
  let databaseQueryFailed = false;
  let cleanupFailed = false;

  try {
    rawLease = await awaitBoundedSettlement(
      RESOLVER_SETTLEMENT_TIMEOUT_MS,
      input.signal,
      (context) =>
        input.credentialResolver.acquire(acquisitionRequest, context),
    );
    const leaseNow = readClock(input.clock);
    validateDatabaseTargetFreshness(input.databaseTarget, leaseNow);
    const lease = validateAndConsumeLease(
      rawLease,
      acquisitionRequest,
      input.databaseTarget,
      leaseNow,
    );
    let rawResult: unknown;
    try {
      rawResult = await awaitBoundedSettlement(
        DATABASE_SETTLEMENT_TIMEOUT_MS,
        input.signal,
        (context) => lease.query(input.sql, input.values, context),
      );
    } catch (error) {
      databaseQueryFailed = true;
      throw error;
    }
    validateOperationFreshness(
      lease.expiresAt,
      input.databaseTarget,
      readClock(input.clock),
    );
    result = normalizeRowsOnly(rawResult);
  } catch (error) {
    primaryFailure = error;
  } finally {
    const binding = extractCleanupBinding(rawLease);
    const sessionRecord = getSessionRecord(rawLease);
    if (sessionRecord && sessionRecord.state !== "RELEASED") {
      try {
        const rawDestroyReceipt = await awaitBoundedCleanup(
          SESSION_DESTROY_SETTLEMENT_TIMEOUT_MS,
          (context) => sessionRecord.destroy(context),
        );
        if (binding.bindingState === "COMPLETE") {
          validateDestroyReceipt(
            rawDestroyReceipt,
            binding,
            readClock(input.clock),
          );
        }
        sessionRecord.state = "RELEASED";
      } catch {
        cleanupFailed = true;
      }
    }
    try {
      const revocationRequest = createRevocationRequest(
        acquisitionRequest,
        binding,
      );
      const rawRevocationReceipt = await awaitBoundedCleanup(
        CREDENTIAL_REVOCATION_SETTLEMENT_TIMEOUT_MS,
        (context) =>
          input.credentialResolver.revoke(revocationRequest, context),
      );
      validateRevocationReceipt(
        rawRevocationReceipt,
        revocationRequest,
        readClock(input.clock),
      );
    } catch {
      cleanupFailed = true;
    }
  }

  if (cleanupFailed || primaryFailure !== undefined || result === undefined) {
    if (
      !cleanupFailed &&
      databaseQueryFailed &&
      primaryFailure !== undefined
    ) {
      throw primaryFailure;
    }
    throw unavailable();
  }
  return result;
}

function createAcquisitionRequest(
  target: CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget,
  observedAt: string,
) {
  const requestedExpiresAt = new Date(
    Math.min(
      Date.parse(observedAt) + MAXIMUM_CREDENTIAL_LIFETIME_MS,
      Date.parse(target.expiresAt),
    ),
  ).toISOString();
  const core = deepFreeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY_DIGEST,
    deploymentEnvironment: "PREVIEW" as const,
    targetClass: target.targetClass,
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
    rpcNames: Object.freeze([
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME,
    ] as const),
    rpcParameterCount: 19 as const,
    databaseTargetDigest: canonicalSha256(target),
    targetProjectRefHmac: target.targetProjectRefHmac,
    productionProjectRefHmac: target.productionProjectRefHmac,
    controlPlaneEvidenceSha256: target.controlPlaneEvidenceSha256,
    databaseName: target.databaseName,
    postgresMajor: target.postgresMajor,
    projectStatus: target.projectStatus,
    connectionMode: target.connectionMode,
    port: target.port,
    tlsMode: target.tlsMode,
    tlsRootCertificateSha256: target.tlsRootCertificateSha256,
    roleActivationMode: "SET_ROLE_TO_NOINHERIT_PURPOSE_CALLER" as const,
    callerMembershipAdmin: false as const,
    callerMembershipInherit: false as const,
    callerMembershipSet: true as const,
    executorMembershipAllowed: false as const,
    transactionPoolerAllowed: false as const,
    serviceRoleFallbackAllowed: false as const,
    observedAt,
    requestedExpiresAt,
    rawCredentialMaterialPresent: false as const,
  });
  return deepFreeze({ ...core, requestDigest: canonicalSha256(core) });
}

function validateSessionLeaseDescriptorShape(value: unknown) {
  const object = exactDataRecord(value, SESSION_DESCRIPTOR_KEYS);
  const rpcNames = exactDataArray(object.rpcNames, 1);
  const issuedAt = normalizedTimestamp(object.issuedAt);
  const expiresAt = normalizedTimestamp(object.expiresAt);
  const revokeBy = normalizedTimestamp(object.revokeBy);
  const requestDigest = requireSha256(object.requestDigest);
  const databaseTargetDigest = requireSha256(object.databaseTargetDigest);
  const targetProjectRefHmac = requireSha256(object.targetProjectRefHmac);
  const productionProjectRefHmac = requireSha256(
    object.productionProjectRefHmac,
  );
  const controlPlaneEvidenceSha256 = requireSha256(
    object.controlPlaneEvidenceSha256,
  );
  const tlsRootCertificateSha256 = requireSha256(
    object.tlsRootCertificateSha256,
  );
  const leaseReferenceSha256 = requireSha256(object.leaseReferenceSha256);
  const sessionBindingSha256 = requireSha256(object.sessionBindingSha256);
  if (
    object.status !== "ACTIVE_SINGLE_USE_PURPOSE_SESSION_NOT_APPROVED" ||
    object.deploymentEnvironment !== "PREVIEW" ||
    object.targetClass !== "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" ||
    object.purpose !==
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE ||
    object.callerRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE ||
    object.effectiveRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE ||
    typeof object.runtimeRole !== "string" ||
    !RUNTIME_ROLE_PATTERN.test(object.runtimeRole) ||
    rpcNames[0] !== CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME ||
    object.rpcParameterCount !== 19 ||
    object.databaseName !== "postgres" ||
    object.postgresMajor !== 17 ||
    object.projectStatus !== "ACTIVE_HEALTHY" ||
    (object.connectionMode !== "DIRECT" &&
      object.connectionMode !== "SESSION_POOLER") ||
    object.port !== 5432 ||
    object.tlsMode !== "VERIFY_FULL_PINNED_CA" ||
    object.requiredConnectionMode !== "ONE_PHYSICAL_SESSION_SINGLE_USE" ||
    object.transactionMode !== "ONE_ATOMIC_STATEMENT" ||
    object.transactionPoolerUsed !== false ||
    object.preparedStatementsUsed !== false ||
    object.roleActivationMode !== "SET_ROLE_TO_NOINHERIT_PURPOSE_CALLER" ||
    object.callerMembershipAdmin !== false ||
    object.callerMembershipInherit !== false ||
    object.callerMembershipSet !== true ||
    object.executorMembershipPresent !== false ||
    object.serviceRoleFallback !== false ||
    Date.parse(expiresAt) <= Date.parse(issuedAt) ||
    Date.parse(expiresAt) - Date.parse(issuedAt) >
      MAXIMUM_CREDENTIAL_LIFETIME_MS ||
    revokeBy !== expiresAt ||
    object.reuseAllowed !== false ||
    object.concurrentUseAllowed !== false ||
    object.rawCredentialMaterialPresent !== false ||
    new Set([
      requestDigest,
      databaseTargetDigest,
      targetProjectRefHmac,
      productionProjectRefHmac,
      controlPlaneEvidenceSha256,
      tlsRootCertificateSha256,
      leaseReferenceSha256,
      sessionBindingSha256,
    ]).size !== 8
  ) {
    throw unavailable();
  }
  return deepFreeze({
    status: "ACTIVE_SINGLE_USE_PURPOSE_SESSION_NOT_APPROVED" as const,
    requestDigest,
    deploymentEnvironment: "PREVIEW" as const,
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" as const,
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
    effectiveRole:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_CALLER_ROLE,
    runtimeRole: object.runtimeRole,
    rpcNames: Object.freeze([
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_RPC_NAME,
    ] as const),
    rpcParameterCount: 19 as const,
    databaseTargetDigest,
    targetProjectRefHmac,
    productionProjectRefHmac,
    controlPlaneEvidenceSha256,
    databaseName: "postgres" as const,
    postgresMajor: 17 as const,
    projectStatus: "ACTIVE_HEALTHY" as const,
    connectionMode: object.connectionMode as "DIRECT" | "SESSION_POOLER",
    port: 5432 as const,
    tlsMode: "VERIFY_FULL_PINNED_CA" as const,
    tlsRootCertificateSha256,
    requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE" as const,
    transactionMode: "ONE_ATOMIC_STATEMENT" as const,
    transactionPoolerUsed: false as const,
    preparedStatementsUsed: false as const,
    roleActivationMode: "SET_ROLE_TO_NOINHERIT_PURPOSE_CALLER" as const,
    callerMembershipAdmin: false as const,
    callerMembershipInherit: false as const,
    callerMembershipSet: true as const,
    executorMembershipPresent: false as const,
    serviceRoleFallback: false as const,
    leaseReferenceSha256,
    sessionBindingSha256,
    issuedAt,
    expiresAt,
    revokeBy,
    reuseAllowed: false as const,
    concurrentUseAllowed: false as const,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateAndConsumeLease(
  value: unknown,
  request: ReturnType<typeof createAcquisitionRequest>,
  target: CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget,
  now: string,
) {
  const sessionRecord = getSessionRecord(value);
  if (!sessionRecord || sessionRecord.state !== "ISSUED") throw unavailable();
  const binding = extractCleanupBinding(value);
  if (binding.bindingState !== "COMPLETE") throw unavailable();
  if (CONSUMED_QUERY_FUNCTIONS.has(sessionRecord.query)) {
    throw unavailable();
  }
  CONSUMED_QUERY_FUNCTIONS.add(sessionRecord.query);
  sessionRecord.state = "CONSUMED";

  const object = exactDataRecord(value, SESSION_DESCRIPTOR_KEYS);
  const rpcNames = exactDataArray(object.rpcNames, 1);
  const issuedAt = normalizedTimestamp(object.issuedAt);
  const expiresAt = normalizedTimestamp(object.expiresAt);
  const revokeBy = normalizedTimestamp(object.revokeBy);
  const nowMs = Date.parse(now);
  if (
    object.status !== "ACTIVE_SINGLE_USE_PURPOSE_SESSION_NOT_APPROVED" ||
    object.requestDigest !== request.requestDigest ||
    object.deploymentEnvironment !== request.deploymentEnvironment ||
    object.targetClass !== request.targetClass ||
    object.purpose !== request.purpose ||
    object.callerRole !== request.callerRole ||
    object.effectiveRole !== request.callerRole ||
    object.runtimeRole !== binding.runtimeRole ||
    rpcNames[0] !== request.rpcNames[0] ||
    object.rpcParameterCount !== 19 ||
    object.databaseTargetDigest !== request.databaseTargetDigest ||
    object.targetProjectRefHmac !== request.targetProjectRefHmac ||
    object.productionProjectRefHmac !== request.productionProjectRefHmac ||
    object.controlPlaneEvidenceSha256 !== request.controlPlaneEvidenceSha256 ||
    object.databaseName !== request.databaseName ||
    object.postgresMajor !== request.postgresMajor ||
    object.projectStatus !== request.projectStatus ||
    object.connectionMode !== request.connectionMode ||
    object.port !== request.port ||
    object.tlsMode !== request.tlsMode ||
    object.tlsRootCertificateSha256 !== request.tlsRootCertificateSha256 ||
    object.requiredConnectionMode !== "ONE_PHYSICAL_SESSION_SINGLE_USE" ||
    object.transactionMode !== "ONE_ATOMIC_STATEMENT" ||
    object.transactionPoolerUsed !== false ||
    object.preparedStatementsUsed !== false ||
    object.roleActivationMode !== request.roleActivationMode ||
    object.callerMembershipAdmin !== false ||
    object.callerMembershipInherit !== false ||
    object.callerMembershipSet !== true ||
    object.executorMembershipPresent !== false ||
    object.serviceRoleFallback !== false ||
    object.leaseReferenceSha256 !== binding.leaseReferenceSha256 ||
    object.sessionBindingSha256 !== binding.sessionBindingSha256 ||
    Date.parse(issuedAt) < Date.parse(request.observedAt) ||
    Date.parse(issuedAt) > nowMs ||
    Date.parse(expiresAt) <= nowMs ||
    Date.parse(expiresAt) - nowMs < MINIMUM_CREDENTIAL_REMAINING_MS ||
    Date.parse(expiresAt) - Date.parse(issuedAt) >
      MAXIMUM_CREDENTIAL_LIFETIME_MS ||
    Date.parse(expiresAt) > Date.parse(request.requestedExpiresAt) ||
    Date.parse(expiresAt) > Date.parse(target.expiresAt) ||
    revokeBy !== expiresAt ||
    object.reuseAllowed !== false ||
    object.concurrentUseAllowed !== false ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  requireSha256(object.databaseTargetDigest);
  requireSha256(object.targetProjectRefHmac);
  requireSha256(object.productionProjectRefHmac);
  requireSha256(object.controlPlaneEvidenceSha256);
  requireSha256(object.tlsRootCertificateSha256);
  if (
    new Set([
      request.requestDigest,
      request.databaseTargetDigest,
      request.targetProjectRefHmac,
      request.productionProjectRefHmac,
      request.controlPlaneEvidenceSha256,
      request.tlsRootCertificateSha256,
      binding.leaseReferenceSha256,
      binding.sessionBindingSha256,
    ]).size !== 8
  ) {
    throw unavailable();
  }
  return Object.freeze({
    expiresAt,
    query: sessionRecord.query,
  });
}

function createRevocationRequest(
  request: ReturnType<typeof createAcquisitionRequest>,
  binding: ReturnType<typeof extractCleanupBinding>,
) {
  const core = deepFreeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_PURPOSE_CALLER_POLICY_DIGEST,
    purpose: request.purpose,
    callerRole: request.callerRole,
    acquisitionRequestDigest: request.requestDigest,
    databaseTargetDigest: request.databaseTargetDigest,
    bindingState: binding.bindingState,
    leaseReferenceSha256: binding.leaseReferenceSha256,
    sessionBindingSha256: binding.sessionBindingSha256,
    runtimeRole: binding.runtimeRole,
    rawCredentialMaterialPresent: false as const,
  });
  return deepFreeze({ ...core, requestDigest: canonicalSha256(core) });
}

function validateDestroyReceipt(
  value: unknown,
  binding: CompleteCleanupBinding,
  now: string,
) {
  const object = exactDataRecord(value, [
    "status",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "runtimeRole",
    "reportedAt",
    "sessionTerminated",
    "activeStatementCount",
    "inFlightStatementDisposition",
    "reusable",
    "rawCredentialMaterialPresent",
    "receiptDigest",
  ]);
  const reportedAt = normalizedTimestamp(object.reportedAt);
  const core = deepFreeze({
    status: object.status,
    leaseReferenceSha256: object.leaseReferenceSha256,
    sessionBindingSha256: object.sessionBindingSha256,
    runtimeRole: object.runtimeRole,
    reportedAt,
    sessionTerminated: object.sessionTerminated,
    activeStatementCount: object.activeStatementCount,
    inFlightStatementDisposition: object.inFlightStatementDisposition,
    reusable: object.reusable,
    rawCredentialMaterialPresent: object.rawCredentialMaterialPresent,
  });
  if (
    object.status !== "DESTROYED_NOT_APPROVED" ||
    object.leaseReferenceSha256 !== binding.leaseReferenceSha256 ||
    object.sessionBindingSha256 !== binding.sessionBindingSha256 ||
    object.runtimeRole !== binding.runtimeRole ||
    Date.parse(reportedAt) > Date.parse(now) ||
    Date.parse(now) - Date.parse(reportedAt) > MAXIMUM_TARGET_LIFETIME_MS ||
    object.sessionTerminated !== true ||
    object.activeStatementCount !== 0 ||
    object.inFlightStatementDisposition !== "SETTLED_OR_CANCELLED" ||
    object.reusable !== false ||
    object.rawCredentialMaterialPresent !== false ||
    object.receiptDigest !== canonicalSha256(core)
  ) {
    throw unavailable();
  }
}

function validateRevocationReceipt(
  value: unknown,
  request: ReturnType<typeof createRevocationRequest>,
  now: string,
) {
  const object = exactDataRecord(value, [
    "status",
    "requestDigest",
    "acquisitionRequestDigest",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "runtimeRole",
    "reportedAt",
    "credentialDisposition",
    "acquisitionRequestTombstoned",
    "futureIssuanceBlocked",
    "lateIssuanceBlockedAtomically",
    "activeSessionCount",
    "allIssuedSessionsTerminated",
    "inFlightStatementsSettled",
    "reusable",
    "rawCredentialMaterialPresent",
    "receiptDigest",
  ]);
  const reportedAt = normalizedTimestamp(object.reportedAt);
  const core = deepFreeze({
    status: object.status,
    requestDigest: object.requestDigest,
    acquisitionRequestDigest: object.acquisitionRequestDigest,
    leaseReferenceSha256: object.leaseReferenceSha256,
    sessionBindingSha256: object.sessionBindingSha256,
    runtimeRole: object.runtimeRole,
    reportedAt,
    credentialDisposition: object.credentialDisposition,
    acquisitionRequestTombstoned: object.acquisitionRequestTombstoned,
    futureIssuanceBlocked: object.futureIssuanceBlocked,
    lateIssuanceBlockedAtomically: object.lateIssuanceBlockedAtomically,
    activeSessionCount: object.activeSessionCount,
    allIssuedSessionsTerminated: object.allIssuedSessionsTerminated,
    inFlightStatementsSettled: object.inFlightStatementsSettled,
    reusable: object.reusable,
    rawCredentialMaterialPresent: object.rawCredentialMaterialPresent,
  });
  const validDisposition =
    object.credentialDisposition === "REVOKED" ||
    (request.bindingState === "NONE" &&
      object.credentialDisposition === "NOT_ISSUED");
  if (
    object.status !== "REVOKED_AND_TOMBSTONED_NOT_APPROVED" ||
    object.requestDigest !== request.requestDigest ||
    object.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    object.leaseReferenceSha256 !== request.leaseReferenceSha256 ||
    object.sessionBindingSha256 !== request.sessionBindingSha256 ||
    object.runtimeRole !== request.runtimeRole ||
    Date.parse(reportedAt) > Date.parse(now) ||
    Date.parse(now) - Date.parse(reportedAt) > MAXIMUM_TARGET_LIFETIME_MS ||
    !validDisposition ||
    object.acquisitionRequestTombstoned !== true ||
    object.futureIssuanceBlocked !== true ||
    object.lateIssuanceBlockedAtomically !== true ||
    object.activeSessionCount !== 0 ||
    object.allIssuedSessionsTerminated !== true ||
    object.inFlightStatementsSettled !== true ||
    object.reusable !== false ||
    object.rawCredentialMaterialPresent !== false ||
    object.receiptDigest !== canonicalSha256(core)
  ) {
    throw unavailable();
  }
}

function validateDatabaseTarget(value: unknown) {
  const object = exactDataRecord(value, [
    "status",
    "deploymentEnvironment",
    "targetClass",
    "targetProjectRefHmac",
    "productionProjectRefHmac",
    "controlPlaneEvidenceSha256",
    "databaseName",
    "postgresMajor",
    "projectStatus",
    "connectionMode",
    "port",
    "tlsMode",
    "tlsRootCertificateSha256",
    "observedAt",
    "expiresAt",
    "defaultBranch",
    "persistent",
    "withData",
    "productionExcluded",
    "rawCredentialMaterialPresent",
  ]);
  if (
    object.status !== "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED" ||
    object.deploymentEnvironment !== "PREVIEW" ||
    object.targetClass !== "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" ||
    object.databaseName !== "postgres" ||
    object.postgresMajor !== 17 ||
    object.projectStatus !== "ACTIVE_HEALTHY" ||
    (object.connectionMode !== "DIRECT" &&
      object.connectionMode !== "SESSION_POOLER") ||
    object.port !== 5432 ||
    object.tlsMode !== "VERIFY_FULL_PINNED_CA" ||
    object.defaultBranch !== false ||
    object.persistent !== false ||
    object.withData !== false ||
    object.productionExcluded !== true ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const targetProjectRefHmac = requireSha256(object.targetProjectRefHmac);
  const productionProjectRefHmac = requireSha256(
    object.productionProjectRefHmac,
  );
  const controlPlaneEvidenceSha256 = requireSha256(
    object.controlPlaneEvidenceSha256,
  );
  const tlsRootCertificateSha256 = requireSha256(
    object.tlsRootCertificateSha256,
  );
  if (
    new Set([
      targetProjectRefHmac,
      productionProjectRefHmac,
      controlPlaneEvidenceSha256,
      tlsRootCertificateSha256,
    ]).size !== 4
  ) {
    throw unavailable();
  }
  return deepFreeze({
    status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED" as const,
    deploymentEnvironment: "PREVIEW" as const,
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" as const,
    targetProjectRefHmac,
    productionProjectRefHmac,
    controlPlaneEvidenceSha256,
    databaseName: "postgres" as const,
    postgresMajor: 17 as const,
    projectStatus: "ACTIVE_HEALTHY" as const,
    connectionMode: object.connectionMode as "DIRECT" | "SESSION_POOLER",
    port: 5432 as const,
    tlsMode: "VERIFY_FULL_PINNED_CA" as const,
    tlsRootCertificateSha256,
    observedAt: normalizedTimestamp(object.observedAt),
    expiresAt: normalizedTimestamp(object.expiresAt),
    defaultBranch: false as const,
    persistent: false as const,
    withData: false as const,
    productionExcluded: true as const,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateDatabaseTargetFreshness(
  target: CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget,
  now: string,
) {
  const observedAt = Date.parse(target.observedAt);
  const expiresAt = Date.parse(target.expiresAt);
  const nowMs = Date.parse(now);
  if (
    observedAt > nowMs ||
    nowMs - observedAt > MAXIMUM_TARGET_LIFETIME_MS ||
    expiresAt <= nowMs ||
    expiresAt - nowMs > MAXIMUM_TARGET_LIFETIME_MS ||
    expiresAt - nowMs < MINIMUM_CREDENTIAL_REMAINING_MS
  ) {
    throw unavailable();
  }
}

function validateOperationFreshness(
  expiresAt: string,
  target: CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget,
  now: string,
) {
  validateDatabaseTargetFreshness(target, now);
  if (Date.parse(expiresAt) <= Date.parse(now)) throw unavailable();
}

function validateRepositoryCall(sql: string, values: readonly unknown[]) {
  if (
    sql !== CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_POSTGRES_SQL ||
    !Array.isArray(values) ||
    nodeTypes.isProxy(values) ||
    values.length !== 19
  ) {
    throw unavailable();
  }
  for (let index = 0; index < values.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
  }
}

type CompleteCleanupBinding = Readonly<{
  bindingState: "COMPLETE";
  leaseReferenceSha256: string;
  sessionBindingSha256: string;
  runtimeRole: string;
}>;

function extractCleanupBinding(value: unknown):
  | CompleteCleanupBinding
  | Readonly<{
      bindingState: "NONE" | "INVALID";
      leaseReferenceSha256: string | null;
      sessionBindingSha256: string | null;
      runtimeRole: string | null;
    }> {
  const empty = Object.freeze({
    bindingState: "NONE" as const,
    leaseReferenceSha256: null,
    sessionBindingSha256: null,
    runtimeRole: null,
  });
  if (value === undefined || value === null) return empty;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    return Object.freeze({ ...empty, bindingState: "INVALID" as const });
  }
  const leaseReferenceSha256 = optionalSha256DataProperty(
    value,
    "leaseReferenceSha256",
  );
  const sessionBindingSha256 = optionalSha256DataProperty(
    value,
    "sessionBindingSha256",
  );
  const runtimeRole = optionalRuntimeRoleDataProperty(value, "runtimeRole");
  if (
    leaseReferenceSha256 !== null &&
    sessionBindingSha256 !== null &&
    runtimeRole !== null
  ) {
    return Object.freeze({
      bindingState: "COMPLETE" as const,
      leaseReferenceSha256,
      sessionBindingSha256,
      runtimeRole,
    });
  }
  return Object.freeze({
    bindingState: "INVALID" as const,
    leaseReferenceSha256,
    sessionBindingSha256,
    runtimeRole,
  });
}

function optionalSha256DataProperty(value: object, key: string) {
  const property = ownDataProperty(value, key);
  return typeof property === "string" && SHA256_PATTERN.test(property)
    ? property
    : null;
}

function optionalRuntimeRoleDataProperty(value: object, key: string) {
  const property = ownDataProperty(value, key);
  return typeof property === "string" && RUNTIME_ROLE_PATTERN.test(property)
    ? property
    : null;
}

function getSessionRecord(value: unknown) {
  return value && typeof value === "object"
    ? SESSION_LEASES.get(value)
    : undefined;
}

function requireDatabaseTarget(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !DATABASE_TARGETS.has(value)
  ) {
    throw unavailable();
  }
  return value as CaresLinkV1CommunicationNotePointsAdmissionPreviewDatabaseTarget;
}

function requireCredentialResolver(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !CREDENTIAL_RESOLVERS.has(value)
  ) {
    throw unavailable();
  }
  return value as CaresLinkV1CommunicationNotePointsAdmissionCredentialResolver;
}

function validateClock(value: unknown) {
  const object = exactDataRecord(value, ["now"]);
  if (typeof object.now !== "function" || nodeTypes.isProxy(object.now)) {
    throw unavailable();
  }
  const sourceNow = object.now as () => string;
  let lastObserved = Number.NEGATIVE_INFINITY;
  return Object.freeze({
    now() {
      const timestamp = normalizedTimestamp(sourceNow());
      const current = Date.parse(timestamp);
      if (current < lastObserved) throw unavailable();
      lastObserved = current;
      return timestamp;
    },
  });
}

function readClock(clock: Readonly<{ now(): string }>) {
  try {
    return normalizedTimestamp(clock.now());
  } catch {
    throw unavailable();
  }
}

async function awaitBoundedSettlement<T>(
  timeoutMs: number,
  outerSignal: AbortSignal,
  invoke: (context: BoundedCallContext) => PromiseLike<T>,
): Promise<T> {
  requireNotAborted(outerSignal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  outerSignal.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(unavailable());
    }, timeoutMs);
  });
  const externallyAborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(unavailable()),
      { once: true },
    );
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() =>
        invoke(Object.freeze({ signal: controller.signal })),
      ),
      timeout,
      externallyAborted,
    ]);
  } finally {
    outerSignal.removeEventListener("abort", abort);
    if (timer !== undefined) clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
  }
}

async function awaitBoundedCleanup<T>(
  timeoutMs: number,
  invoke: (context: BoundedCallContext) => PromiseLike<T>,
) {
  const signal = new AbortController().signal;
  return awaitBoundedSettlement(timeoutMs, signal, invoke);
}

function normalizeRowsOnly(value: unknown) {
  const object = exactDataRecord(value, ["rows"]);
  if (!Array.isArray(object.rows) || nodeTypes.isProxy(object.rows)) {
    throw unavailable();
  }
  return Object.freeze({ rows: Object.freeze([...object.rows]) });
}

function exactDataArray(value: unknown, length: number) {
  if (!Array.isArray(value) || nodeTypes.isProxy(value) || value.length !== length) {
    throw unavailable();
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
  }
  return value as readonly unknown[];
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
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw unavailable();
  }
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function ownDataProperty(value: object, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function normalizedTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw unavailable();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw unavailable();
  }
  return value;
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
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
    "Communication Note Points admission purpose caller is unavailable",
  );
}
