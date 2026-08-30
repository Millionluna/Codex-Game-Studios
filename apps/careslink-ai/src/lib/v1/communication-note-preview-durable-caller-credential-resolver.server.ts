import "server-only";

import {
  createHash,
  createHmac,
  pbkdf2Sync,
} from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
  createCaresLinkV1CommunicationNotePreviewReleaseReportDigest,
  createTestOnlyCaresLinkV1CommunicationNotePreviewExclusiveSessionLease,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver,
  type CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver,
} from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME,
} from "./communication-note-preview-runner-terminal-postgres.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const SCRAM_SHA_256_ITERATIONS = 4_096;
const SCRAM_SALT_BYTES = 16;
const PASSWORD_ENTROPY_BYTES = 32;
const IDENTITY_ENTROPY_BYTES = 32;
const LEASE_LIFETIME_MS = 90_000;
const MINIMUM_LEASE_REMAINING_MS = 45_000;
const SESSION_DESTROY_SETTLEMENT_TIMEOUT_MS = 250;
const SESSION_CANCEL_SETTLEMENT_TIMEOUT_MS = 250;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION =
  "resolver.communication.openai.synthetic-preview.2026-08-30.m1l.v2" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_READY =
  false as const;

const DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
  status: "SOURCE_CONTRACT_WITH_UNAPPLIED_DURABLE_BROKER_NOT_APPROVED",
  ready: false,
  purpose:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  callerRole:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  executorRole:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE,
  rpcNames: [
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME,
  ],
  resolvedRuntimeBindingPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
  scramMechanism: "SCRAM-SHA-256",
  scramIterations: SCRAM_SHA_256_ITERATIONS,
  passwordEntropyBytes: PASSWORD_ENTROPY_BYTES,
  saltBytes: SCRAM_SALT_BYTES,
  identityEntropyBytes: IDENTITY_ENTROPY_BYTES,
  leaseLifetimeMs: LEASE_LIFETIME_MS,
  minimumLeaseRemainingMs: MINIMUM_LEASE_REMAINING_MS,
  acquireReplayAllowed: false,
  automaticRetry: false,
  deterministicRuntimeRoleFromAcquisitionDigest: true,
  durableTombstoneBeforeSessionDestruction: true,
  backendBindingRequiredBeforeLeaseRelease: true,
  independentPostcheckRequiredBeforeReleaseReport: true,
  terminalActiveFenceMigrationPresent: true,
  connectionBoundCancellationRequired: true,
  cancellationSettlementTimeoutMs: SESSION_CANCEL_SETTLEMENT_TIMEOUT_MS,
  rawPasswordPersisted: false,
  passwordVerifierPersistedInLedger: false,
  productionMigrationPresent: true,
  targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST =
  "e53114d9d247ffcdb20ed83b4724fa5b8b09eeab31e4f2fc1a868ade13a2f43e" as const;

if (
  canonicalSha256(DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY =
  deepFreeze({
    ...DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
  });

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_DURABLE_CALLER_CREDENTIAL_RESOLVER =
  undefined as
    | CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver
    | undefined;

export type CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext =
  Readonly<{
    signal: AbortSignal;
  }>;

export type CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort =
  Readonly<{
    acquire: (
      request: unknown,
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
    bind: (
      request: unknown,
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
    tombstone: (
      request: unknown,
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
    finalize: (
      request: unknown,
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
  }>;

export type CaresLinkV1CommunicationNotePreviewDurableCredentialAuditPort =
  Readonly<{
    inspect: (
      request: unknown,
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
  }>;

type NormalizedQueryResult = Readonly<{ rows: readonly unknown[] }>;

export type CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory =
  Readonly<{
    open: (
      request: unknown,
      context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
    ) => PromiseLike<unknown>;
  }>;

type ExclusiveSession = Readonly<{
  backendPid: number;
  query: (
    sql: string,
    values: readonly unknown[] | undefined,
    context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
  ) => PromiseLike<NormalizedQueryResult>;
  cancelInFlight: () => PromiseLike<void>;
  destroy: () => PromiseLike<void>;
}>;

type MonotonicClock = Readonly<{ now: () => string }>;
type EntropySource = Readonly<{ bytes: (length: number) => Uint8Array }>;

type SessionRecord = {
  state:
    | "ACTIVE"
    | "QUERYING"
    | "CANCELLING"
    | "QUARANTINED"
    | "DESTROYING"
    | "DESTROYED";
  session: ExclusiveSession;
  destroyPromise: Promise<void> | undefined;
};

export function createCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver(
  _value: unknown,
): never {
  void _value;
  throw unavailable();
}

export function createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver {
  const options = exactDataRecord(value, [
    "capability",
    "brokerPort",
    "sessionFactory",
    "auditPort",
    "clock",
    "entropy",
  ]);
  if (
    options.capability !==
    "TEST_ONLY_M1L_DURABLE_CALLER_CREDENTIAL_RESOLVER"
  ) {
    throw unavailable();
  }
  const brokerPort = validateBrokerPort(options.brokerPort);
  const sessionFactory = validateSessionFactory(options.sessionFactory);
  const auditPort = validateAuditPort(options.auditPort, brokerPort);
  const clock = validateClock(options.clock);
  const entropy = validateEntropy(options.entropy);
  const sessions = new Map<string, Set<SessionRecord>>();
  const tombstonedAcquisitionRequestDigests = new Set<string>();

  return createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver(
    {
      capability: "TEST_ONLY_RUNNER_TERMINAL_CALLER_CREDENTIAL_RESOLVER",
      async acquire(rawRequest: unknown, context: unknown) {
        const callContext = validateCallContext(context);
        const request = validateAcquisitionRequest(
          rawRequest,
          readClock(clock),
        );
        requireNotAborted(callContext);
        if (tombstonedAcquisitionRequestDigests.has(request.requestDigest)) {
          throw unavailable();
        }

        const runtimeRole =
          `careslink_v1_preview_runner_terminal_runtime_${request.requestDigest.slice(0, 16)}` as const;
        let secretBytes: Buffer | undefined;
        let salt: Buffer | undefined;
        let leaseReference: Buffer | undefined;
        let sessionBinding: Buffer | undefined;
        let password: string | undefined;
        let verifier: string | undefined;
        try {
          secretBytes = readEntropy(entropy, PASSWORD_ENTROPY_BYTES);
          salt = readEntropy(entropy, SCRAM_SALT_BYTES);
          leaseReference = readEntropy(entropy, IDENTITY_ENTROPY_BYTES);
          sessionBinding = readEntropy(entropy, IDENTITY_ENTROPY_BYTES);
          password = secretBytes.toString("base64url");
          verifier = createScramSha256Verifier(password, salt);
          const credentialVerifierSha256 = sha256(verifier);
          const leaseReferenceSha256 = sha256(leaseReference);
          const sessionBindingSha256 = sha256(sessionBinding);
          const requestedExpiresAt = new Date(
            Math.min(
              Date.parse(request.authorizationExpiresAt),
              Date.parse(readClock(clock)) + LEASE_LIFETIME_MS,
            ),
          ).toISOString();
          if (
            Date.parse(requestedExpiresAt) - Date.parse(readClock(clock)) <
            MINIMUM_LEASE_REMAINING_MS
          ) {
            throw unavailable();
          }
          if (
            new Set([
              request.identityHmac,
              request.credentialReferenceSha256,
              leaseReferenceSha256,
              sessionBindingSha256,
              request.targetProjectRefHmac,
              request.productionProjectRefHmac,
              request.tlsRootCertificateSha256,
              request.controlPlaneEvidenceSha256,
            ]).size !== 8
          ) {
            throw unavailable();
          }
          const acquireRequest = deepFreeze({
            version:
              CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
            policyDigest:
              CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
            acquisitionRequestDigest: request.requestDigest,
            authorizationDigest: request.authorizationDigest,
            runIdHash: request.runIdHash,
            databaseTargetDigest: request.databaseTargetDigest,
            callerIdentityHmac: request.identityHmac,
            purpose: request.purpose,
            callerRole: request.callerRole,
            runtimeRole,
            leaseReferenceSha256,
            sessionBindingSha256,
            credentialVerifierSha256,
            credentialVerifier: verifier,
            requestedExpiresAt,
            rawCredentialMaterialPresent: false as const,
          });
          const acquired = validateAcquireResult(
            await invokePort(() => brokerPort.acquire(acquireRequest, callContext)),
            acquireRequest,
            readClock(clock),
          );
          requireNotAborted(callContext);

          const openRequest = deepFreeze({
            acquisitionRequestDigest: request.requestDigest,
            runtimeRole,
            password,
            databaseName: request.databaseName,
            requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE" as const,
            targetClass: request.targetClass,
            databaseTargetDigest: request.databaseTargetDigest,
            targetProjectRefHmac: request.targetProjectRefHmac,
            productionProjectRefHmac: request.productionProjectRefHmac,
            controlPlaneEvidenceSha256:
              request.controlPlaneEvidenceSha256,
            tlsMode: request.tlsMode,
            tlsRootCertificateSha256:
              request.tlsRootCertificateSha256,
            expiresAt: acquired.expiresAt,
          });
          const session = validateExclusiveSession(
            await invokePort(() => sessionFactory.open(openRequest, callContext)),
          );
          const sessionRecord = createSessionRecord(session);
          if (
            tombstonedAcquisitionRequestDigests.has(request.requestDigest)
          ) {
            password = undefined;
            await settleSessionDestruction(sessionRecord);
            throw unavailable();
          }
          registerSession(
            sessions,
            request.requestDigest,
            sessionRecord,
          );
          password = undefined;
          requireNotAborted(callContext);

          const bindRequest = deepFreeze({
            version:
              CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
            policyDigest:
              CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
            acquisitionRequestDigest: request.requestDigest,
            authorizationDigest: request.authorizationDigest,
            runIdHash: request.runIdHash,
            databaseTargetDigest: request.databaseTargetDigest,
            runtimeRole,
            leaseReferenceSha256,
            sessionBindingSha256,
            backendPid: session.backendPid,
            rawCredentialMaterialPresent: false as const,
          });
          validateBindResult(
            await invokePort(() => brokerPort.bind(bindRequest, callContext)),
            bindRequest,
          );
          requireNotAborted(callContext);

          const query = createBoundQuery(sessionRecord);
          const descriptor = deepFreeze({
            status: "TEST_ONLY_EXCLUSIVE_SESSION_LEASE_NOT_APPROVED" as const,
            requestDigest: request.requestDigest,
            purpose: request.purpose,
            callerRole: request.callerRole,
            executorRole: request.executorRole,
            rpcNames: request.rpcNames,
            identityHmac: request.identityHmac,
            credentialReferenceSha256:
              request.credentialReferenceSha256,
            leaseReferenceSha256,
            sessionBindingSha256,
            runtimeRole,
            requiredConnectionMode:
              "ONE_PHYSICAL_SESSION_SINGLE_USE" as const,
            queryResultMode: "NORMALIZED_ROWS_ONLY" as const,
            reuseAllowed: false as const,
            concurrentUseAllowed: false as const,
            targetClass: request.targetClass,
            databaseTargetDigest: request.databaseTargetDigest,
            targetProjectRefHmac: request.targetProjectRefHmac,
            productionProjectRefHmac: request.productionProjectRefHmac,
            controlPlaneEvidenceSha256:
              request.controlPlaneEvidenceSha256,
            databaseName: request.databaseName,
            postgresMajor: request.postgresMajor,
            authorizationExpiresAt: request.authorizationExpiresAt,
            projectStatus: request.projectStatus,
            tlsMode: request.tlsMode,
            tlsRootCertificateSha256:
              request.tlsRootCertificateSha256,
            issuedAt: acquired.issuedAt,
            expiresAt: acquired.expiresAt,
            revokeBy: acquired.expiresAt,
            defaultBranch: false as const,
            persistent: false as const,
            withData: false as const,
            productionExcluded: true as const,
            rawCredentialMaterialPresent: false as const,
          });
          const lease =
            createTestOnlyCaresLinkV1CommunicationNotePreviewExclusiveSessionLease(
              {
                capability: "TEST_ONLY_EXCLUSIVE_SESSION_LEASE",
                descriptor,
                query,
              },
            );
          return lease;
        } catch {
          throw unavailable();
        } finally {
          secretBytes?.fill(0);
          salt?.fill(0);
          leaseReference?.fill(0);
          sessionBinding?.fill(0);
          password = undefined;
          verifier = undefined;
        }
      },
      async revoke(rawRequest: unknown, context: unknown) {
        const callContext = validateCallContext(context);
        const request = validateRevocationRequest(rawRequest);
        requireNotAborted(callContext);
        const brokerRequest = deepFreeze({
          version:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
          policyDigest:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
          acquisitionRequestDigest: request.acquisitionRequestDigest,
          authorizationDigest: request.authorizationDigest,
          runIdHash: request.runIdHash,
          databaseTargetDigest: request.databaseTargetDigest,
          callerRole: request.callerRole,
          rawCredentialMaterialPresent: false as const,
        });
        const tombstone = validateTombstoneResult(
          await invokePort(() => brokerPort.tombstone(brokerRequest, callContext)),
          brokerRequest,
        );

        const acquisitionRequestDigest =
          request.acquisitionRequestDigest as string;
        tombstonedAcquisitionRequestDigests.add(acquisitionRequestDigest);
        const sessionRecords = [
          ...(sessions.get(acquisitionRequestDigest) ?? []),
        ];
        sessions.delete(acquisitionRequestDigest);
        await Promise.all(
          sessionRecords.map((record) =>
            settleSessionDestruction(record),
          ),
        );

        const finalized = validateFinalizeResult(
          await invokePort(() => brokerPort.finalize(brokerRequest, callContext)),
          brokerRequest,
          tombstone.everIssued,
        );
        const inspected = validateInspectResult(
          await invokePort(() => auditPort.inspect(brokerRequest, callContext)),
          brokerRequest,
          finalized.everIssued,
        );
        if (
          (sessionRecords.length > 0 || request.bindingState === "COMPLETE") &&
          !inspected.everIssued
        ) {
          throw unavailable();
        }
        const reportedAt = readClock(clock);
        const issued = inspected.everIssued;
        const core = deepFreeze({
          status: "TEST_ONLY_RELEASE_REPORTED_NOT_APPROVED" as const,
          requestDigest: request.requestDigest,
          acquisitionRequestDigest: request.acquisitionRequestDigest,
          leaseReferenceSha256: request.leaseReferenceSha256,
          sessionBindingSha256: request.sessionBindingSha256,
          runtimeRole: request.runtimeRole,
          reportedAt,
          reportedSessionDisposition: issued
            ? ("DESTROYED" as const)
            : ("NOT_ACQUIRED" as const),
          reportedCredentialDisposition: issued
            ? ("REVOKED" as const)
            : ("NOT_ISSUED" as const),
          acquisitionRequestTombstoned: true as const,
          futureIssuanceBlocked: true as const,
          reusable: false as const,
          rawCredentialMaterialPresent: false as const,
        });
        return deepFreeze({
          ...core,
          receiptDigest:
            createCaresLinkV1CommunicationNotePreviewDurableCredentialReleaseReportDigest(
              core,
            ),
        });
      },
    },
  );
}

export function createCaresLinkV1CommunicationNotePreviewDurableCredentialReleaseReportDigest(
  value: unknown,
) {
  return createCaresLinkV1CommunicationNotePreviewReleaseReportDigest(value);
}

function validateAcquisitionRequest(value: unknown, now: string) {
  const object = exactDataRecord(value, [
    "version",
    "policyDigest",
    "purpose",
    "callerRole",
    "executorRole",
    "rpcNames",
    "authorizationDigest",
    "runIdHash",
    "authorizationExpiresAt",
    "registrySnapshotSha256",
    "custodyResolutionDigest",
    "identityHmac",
    "credentialReferenceSha256",
    "databaseTargetDigest",
    "targetProjectRefHmac",
    "productionProjectRefHmac",
    "controlPlaneEvidenceSha256",
    "databaseName",
    "postgresMajor",
    "projectStatus",
    "tlsMode",
    "tlsRootCertificateSha256",
    "observedAt",
    "targetClass",
    "rawCredentialMaterialPresent",
    "requestDigest",
  ]);
  const rpcNames = exactDataArray(object.rpcNames, 1);
  const authorizationExpiresAt = normalizedTimestamp(
    object.authorizationExpiresAt,
  );
  const observedAt = normalizedTimestamp(object.observedAt);
  const core = deepFreeze({
    version: object.version,
    policyDigest: object.policyDigest,
    purpose: object.purpose,
    callerRole: object.callerRole,
    executorRole: object.executorRole,
    rpcNames: Object.freeze([rpcNames[0]]),
    authorizationDigest: object.authorizationDigest,
    runIdHash: object.runIdHash,
    authorizationExpiresAt,
    registrySnapshotSha256: object.registrySnapshotSha256,
    custodyResolutionDigest: object.custodyResolutionDigest,
    identityHmac: object.identityHmac,
    credentialReferenceSha256: object.credentialReferenceSha256,
    databaseTargetDigest: object.databaseTargetDigest,
    targetProjectRefHmac: object.targetProjectRefHmac,
    productionProjectRefHmac: object.productionProjectRefHmac,
    controlPlaneEvidenceSha256: object.controlPlaneEvidenceSha256,
    databaseName: object.databaseName,
    postgresMajor: object.postgresMajor,
    projectStatus: object.projectStatus,
    tlsMode: object.tlsMode,
    tlsRootCertificateSha256: object.tlsRootCertificateSha256,
    observedAt,
    targetClass: object.targetClass,
    rawCredentialMaterialPresent: object.rawCredentialMaterialPresent,
  });
  if (
    object.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION ||
    object.policyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST ||
    object.purpose !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE ||
    object.callerRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE ||
    object.executorRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE ||
    rpcNames[0] !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME ||
    object.databaseName !== "postgres" ||
    object.postgresMajor !== 17 ||
    object.projectStatus !== "ACTIVE_HEALTHY" ||
    object.tlsMode !== "VERIFY_FULL_PINNED_CA" ||
    object.targetClass !==
      "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" ||
    object.rawCredentialMaterialPresent !== false ||
    !isSha256(object.requestDigest) ||
    object.requestDigest !== canonicalSha256(core) ||
    Date.parse(observedAt) > Date.parse(now) ||
    Date.parse(authorizationExpiresAt) - Date.parse(now) <
      MINIMUM_LEASE_REMAINING_MS
  ) {
    throw unavailable();
  }
  for (const digest of [
    object.authorizationDigest,
    object.runIdHash,
    object.registrySnapshotSha256,
    object.custodyResolutionDigest,
    object.identityHmac,
    object.credentialReferenceSha256,
    object.databaseTargetDigest,
    object.targetProjectRefHmac,
    object.productionProjectRefHmac,
    object.controlPlaneEvidenceSha256,
    object.tlsRootCertificateSha256,
  ]) {
    requireSha256(digest);
  }
  return coreWithDigest(core, object.requestDigest as string);
}

function validateRevocationRequest(value: unknown) {
  const object = exactDataRecord(value, [
    "version",
    "policyDigest",
    "acquisitionRequestDigest",
    "authorizationDigest",
    "runIdHash",
    "databaseTargetDigest",
    "callerRole",
    "bindingState",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "runtimeRole",
    "rawCredentialMaterialPresent",
    "requestDigest",
  ]);
  const core = deepFreeze({
    version: object.version,
    policyDigest: object.policyDigest,
    acquisitionRequestDigest: object.acquisitionRequestDigest,
    authorizationDigest: object.authorizationDigest,
    runIdHash: object.runIdHash,
    databaseTargetDigest: object.databaseTargetDigest,
    callerRole: object.callerRole,
    bindingState: object.bindingState,
    leaseReferenceSha256: object.leaseReferenceSha256,
    sessionBindingSha256: object.sessionBindingSha256,
    runtimeRole: object.runtimeRole,
    rawCredentialMaterialPresent: object.rawCredentialMaterialPresent,
  });
  const optionalLease = optionalSha256(object.leaseReferenceSha256);
  const optionalSession = optionalSha256(object.sessionBindingSha256);
  const optionalRole = optionalRuntimeRole(object.runtimeRole);
  const complete =
    object.bindingState === "COMPLETE" &&
    optionalLease !== null &&
    optionalSession !== null &&
    optionalRole !== null;
  const none =
    object.bindingState === "NONE" &&
    optionalLease === null &&
    optionalSession === null &&
    optionalRole === null;
  const invalid = object.bindingState === "INVALID";
  if (
    object.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION ||
    object.policyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST ||
    object.callerRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE ||
    object.rawCredentialMaterialPresent !== false ||
    !isSha256(object.acquisitionRequestDigest) ||
    !isSha256(object.authorizationDigest) ||
    !isSha256(object.runIdHash) ||
    !isSha256(object.databaseTargetDigest) ||
    (!complete && !none && !invalid) ||
    !isSha256(object.requestDigest) ||
    object.requestDigest !== canonicalSha256(core)
  ) {
    throw unavailable();
  }
  return coreWithDigest(core, object.requestDigest as string);
}

function validateAcquireResult(
  value: unknown,
  request: Record<string, unknown>,
  now: string,
) {
  const object = exactDataRecord(value, [
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
  const issuedAt = normalizedTimestamp(object.issuedAt);
  const expiresAt = normalizedTimestamp(object.expiresAt);
  if (
    object.status !== "ISSUED_UNBOUND" ||
    object.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    object.runtimeRole !== request.runtimeRole ||
    object.leaseReferenceSha256 !== request.leaseReferenceSha256 ||
    object.sessionBindingSha256 !== request.sessionBindingSha256 ||
    object.credentialVerifierSha256 !== request.credentialVerifierSha256 ||
    object.rawCredentialMaterialPresent !== false ||
    Date.parse(issuedAt) > Date.parse(now) ||
    Date.parse(expiresAt) <= Date.parse(issuedAt) ||
    Date.parse(expiresAt) - Date.parse(now) < MINIMUM_LEASE_REMAINING_MS ||
    Date.parse(expiresAt) > Date.parse(request.requestedExpiresAt as string)
  ) {
    throw unavailable();
  }
  return Object.freeze({ issuedAt, expiresAt });
}

function validateBindResult(value: unknown, request: Record<string, unknown>) {
  const object = exactDataRecord(value, [
    "status",
    "acquisitionRequestDigest",
    "runtimeRole",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "backendPid",
    "rawCredentialMaterialPresent",
  ]);
  if (
    object.status !== "ACTIVE" ||
    object.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    object.runtimeRole !== request.runtimeRole ||
    object.leaseReferenceSha256 !== request.leaseReferenceSha256 ||
    object.sessionBindingSha256 !== request.sessionBindingSha256 ||
    object.backendPid !== request.backendPid ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
}

function validateTombstoneResult(
  value: unknown,
  request: Record<string, unknown>,
) {
  const object = exactDataRecord(value, [
    "status",
    "acquisitionRequestDigest",
    "everIssued",
    "futureIssuanceBlocked",
    "rawCredentialMaterialPresent",
  ]);
  if (
    object.status !== "TOMBSTONED" ||
    object.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    typeof object.everIssued !== "boolean" ||
    object.futureIssuanceBlocked !== true ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return Object.freeze({ everIssued: object.everIssued });
}

function validateFinalizeResult(
  value: unknown,
  request: Record<string, unknown>,
  everIssued: boolean,
) {
  const object = exactDataRecord(value, [
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
    object.status !== "REVOKED" ||
    object.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    object.everIssued !== everIssued ||
    object.futureIssuanceBlocked !== true ||
    object.roleCount !== 0 ||
    object.sessionCount !== 0 ||
    object.membershipCount !== 0 ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return Object.freeze({ everIssued });
}

function validateInspectResult(
  value: unknown,
  request: Record<string, unknown>,
  everIssued: boolean,
) {
  const object = exactDataRecord(value, [
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
    object.status !== "REVOKED_ATTESTED" ||
    object.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    object.everIssued !== everIssued ||
    object.futureIssuanceBlocked !== true ||
    object.roleCount !== 0 ||
    object.sessionCount !== 0 ||
    object.membershipCount !== 0 ||
    object.credentialVerifierResidueCount !== 0 ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  return Object.freeze({ everIssued });
}

function validateBrokerPort(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort {
  const object = exactDataRecord(value, [
    "acquire",
    "bind",
    "tombstone",
    "finalize",
  ]);
  for (const key of ["acquire", "bind", "tombstone", "finalize"] as const) {
    if (typeof object[key] !== "function" || nodeTypes.isProxy(object[key])) {
      throw unavailable();
    }
  }
  return Object.freeze({
    acquire:
      object.acquire as CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort["acquire"],
    bind:
      object.bind as CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort["bind"],
    tombstone:
      object.tombstone as CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort["tombstone"],
    finalize:
      object.finalize as CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort["finalize"],
  });
}

function validateAuditPort(
  value: unknown,
  brokerPort: CaresLinkV1CommunicationNotePreviewDurableCredentialBrokerPort,
): CaresLinkV1CommunicationNotePreviewDurableCredentialAuditPort {
  const object = exactDataRecord(value, ["inspect"]);
  if (
    value === brokerPort ||
    typeof object.inspect !== "function" ||
    nodeTypes.isProxy(object.inspect) ||
    object.inspect === brokerPort.acquire ||
    object.inspect === brokerPort.bind ||
    object.inspect === brokerPort.tombstone ||
    object.inspect === brokerPort.finalize
  ) {
    throw unavailable();
  }
  return Object.freeze({
    inspect:
      object.inspect as CaresLinkV1CommunicationNotePreviewDurableCredentialAuditPort["inspect"],
  });
}

function validateSessionFactory(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory {
  const object = exactDataRecord(value, ["open"]);
  if (typeof object.open !== "function" || nodeTypes.isProxy(object.open)) {
    throw unavailable();
  }
  return Object.freeze({
    open:
      object.open as CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory["open"],
  });
}

function validateExclusiveSession(value: unknown): ExclusiveSession {
  const object = exactDataRecord(value, [
    "backendPid",
    "query",
    "cancelInFlight",
    "destroy",
  ]);
  if (
    !Number.isSafeInteger(object.backendPid) ||
    (object.backendPid as number) <= 0 ||
    typeof object.query !== "function" ||
    nodeTypes.isProxy(object.query) ||
    typeof object.cancelInFlight !== "function" ||
    nodeTypes.isProxy(object.cancelInFlight) ||
    typeof object.destroy !== "function" ||
    nodeTypes.isProxy(object.destroy)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    backendPid: object.backendPid as number,
    query: object.query as ExclusiveSession["query"],
    cancelInFlight:
      object.cancelInFlight as ExclusiveSession["cancelInFlight"],
    destroy: object.destroy as ExclusiveSession["destroy"],
  });
}

function registerSession(
  sessions: Map<string, Set<SessionRecord>>,
  acquisitionRequestDigest: string,
  record: SessionRecord,
) {
  const records = sessions.get(acquisitionRequestDigest);
  if (records) {
    records.add(record);
    return;
  }
  sessions.set(acquisitionRequestDigest, new Set([record]));
}

function createSessionRecord(session: ExclusiveSession): SessionRecord {
  return {
    state: "ACTIVE",
    session,
    destroyPromise: undefined,
  };
}

function createBoundQuery(record: SessionRecord) {
  return async (
    sql: string,
    values: readonly unknown[] | undefined,
    context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
  ) => {
    const callContext = validateCallContext(context);
    if (record.state !== "ACTIVE") throw unavailable();
    requireNotAborted(callContext);
    record.state = "QUERYING";
    let abortListener: (() => void) | undefined;
    const aborted = new Promise<Readonly<{ type: "ABORTED" }>>((resolve) => {
      abortListener = () => {
        resolve(Object.freeze({ type: "ABORTED" as const }));
      };
      callContext.signal.addEventListener("abort", abortListener, {
        once: true,
      });
      if (callContext.signal.aborted) abortListener();
    });
    const query = Promise.resolve()
      .then(() => record.session.query(sql, values, callContext))
      .then(
        (value) => Object.freeze({ type: "QUERY_FULFILLED" as const, value }),
        () => Object.freeze({ type: "QUERY_REJECTED" as const }),
      );
    const outcome = await Promise.race([query, aborted]);
    if (abortListener) {
      callContext.signal.removeEventListener("abort", abortListener);
    }
    if (outcome.type === "QUERY_FULFILLED") {
      record.state = "ACTIVE";
      return validateNormalizedQueryResult(outcome.value);
    }
    if (outcome.type === "QUERY_REJECTED") {
      record.state = "ACTIVE";
      throw unavailable();
    }

    record.state = "CANCELLING";
    const cancellation = Promise.resolve()
      .then(() => record.session.cancelInFlight())
      .then(
        () => Object.freeze({ type: "CANCEL_SETTLED" as const }),
        () => Object.freeze({ type: "CANCEL_SETTLED" as const }),
      );
    const settled = Promise.all([query, cancellation]).then(() =>
      Object.freeze({ type: "BARRIER_SETTLED" as const }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Readonly<{ type: "BARRIER_TIMEOUT" }>>(
      (resolveTimeout) => {
        timer = setTimeout(
          () => resolveTimeout(Object.freeze({ type: "BARRIER_TIMEOUT" })),
          SESSION_CANCEL_SETTLEMENT_TIMEOUT_MS,
        );
      },
    );
    const barrier = await Promise.race([settled, timeout]);
    if (timer !== undefined) clearTimeout(timer);
    record.state =
      barrier.type === "BARRIER_SETTLED" ? "ACTIVE" : "QUARANTINED";
    throw unavailable();
  };
}

async function destroySession(record: SessionRecord) {
  if (record.destroyPromise) return record.destroyPromise;
  record.state = "DESTROYING";
  record.destroyPromise = Promise.resolve()
    .then(() => record.session.destroy())
    .then(
      () => {
        record.state = "DESTROYED";
      },
      () => {
        record.state = "DESTROYED";
        throw unavailable();
      },
    );
  return record.destroyPromise;
}

async function settleSessionDestruction(record: SessionRecord) {
  const destruction = destroySession(record).then(
    () => undefined,
    () => undefined,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolveTimeout) => {
    timer = setTimeout(
      resolveTimeout,
      SESSION_DESTROY_SETTLEMENT_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([destruction, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function validateNormalizedQueryResult(value: unknown): NormalizedQueryResult {
  const result = exactDataRecord(value, ["rows"]);
  if (!Array.isArray(result.rows) || nodeTypes.isProxy(result.rows)) {
    throw unavailable();
  }
  return Object.freeze({ rows: Object.freeze([...result.rows]) });
}

function validateCallContext(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext {
  const object = exactDataRecord(value, ["signal"]);
  if (!(object.signal instanceof AbortSignal)) throw unavailable();
  return Object.freeze({ signal: object.signal });
}

function validateClock(value: unknown): MonotonicClock {
  const object = exactDataRecord(value, ["now"]);
  if (typeof object.now !== "function" || nodeTypes.isProxy(object.now)) {
    throw unavailable();
  }
  const source = object.now as () => string;
  let last = Number.NEGATIVE_INFINITY;
  return Object.freeze({
    now() {
      const normalized = normalizedTimestamp(source());
      const current = Date.parse(normalized);
      if (current < last) throw unavailable();
      last = current;
      return normalized;
    },
  });
}

function validateEntropy(value: unknown): EntropySource {
  const object = exactDataRecord(value, ["bytes"]);
  if (typeof object.bytes !== "function" || nodeTypes.isProxy(object.bytes)) {
    throw unavailable();
  }
  return Object.freeze({ bytes: object.bytes as EntropySource["bytes"] });
}

function readEntropy(entropy: EntropySource, length: number) {
  let value: Uint8Array;
  try {
    value = entropy.bytes(length);
  } catch {
    throw unavailable();
  }
  if (!(value instanceof Uint8Array)) {
    throw unavailable();
  }
  if (value.byteLength !== length) {
    try {
      value.fill(0);
    } catch {
      // The fixed rejection remains authoritative.
    }
    throw unavailable();
  }
  const copy = Buffer.from(value);
  try {
    value.fill(0);
  } catch {
    copy.fill(0);
    throw unavailable();
  }
  return copy;
}

function createScramSha256Verifier(password: string, salt: Buffer) {
  const saltedPassword = pbkdf2Sync(
    password,
    salt,
    SCRAM_SHA_256_ITERATIONS,
    32,
    "sha256",
  );
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key", "utf8")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key", "utf8")
    .digest();
  try {
    return `SCRAM-SHA-256$${SCRAM_SHA_256_ITERATIONS}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
  } finally {
    saltedPassword.fill(0);
    clientKey.fill(0);
    storedKey.fill(0);
    serverKey.fill(0);
  }
}

async function invokePort<T>(invoke: () => PromiseLike<T>): Promise<T> {
  try {
    return await Promise.resolve().then(invoke);
  } catch {
    throw unavailable();
  }
}

function requireNotAborted(
  context: CaresLinkV1CommunicationNotePreviewDurableCredentialCallContext,
) {
  if (context.signal.aborted) throw unavailable();
}

function readClock(clock: MonotonicClock) {
  try {
    return clock.now();
  } catch {
    throw unavailable();
  }
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

function optionalSha256(value: unknown) {
  if (value === null) return null;
  return requireSha256(value);
}

function optionalRuntimeRole(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !RUNTIME_ROLE_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function requireSha256(value: unknown) {
  if (!isSha256(value)) throw unavailable();
  return value;
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value: unknown) {
  return sha256(stringifyCaresLinkV1CanonicalJson(value));
}

function coreWithDigest<T extends Readonly<Record<string, unknown>>>(
  core: T,
  requestDigest: string,
) {
  return deepFreeze({ ...core, requestDigest });
}

function exactDataRecord(value: unknown, expectedKeys: readonly string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
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

function exactDataArray(value: unknown, length: number) {
  if (
    !Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    value.length !== length
  ) {
    throw unavailable();
  }
  const expectedNames = [
    ...Array.from({ length }, (_unused, index) => String(index)),
    "length",
  ].sort();
  const names = Object.getOwnPropertyNames(value).sort();
  if (
    names.length !== expectedNames.length ||
    names.some((name, index) => name !== expectedNames[index])
  ) {
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
    "Communication Note durable caller credential resolver is unavailable",
  );
}
