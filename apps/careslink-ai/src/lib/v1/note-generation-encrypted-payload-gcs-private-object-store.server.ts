import "server-only";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CaresLinkV1ContractError } from "./shared-contracts";
import type {
  CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject,
  CaresLinkV1NoteGenerationPrivateObjectStorePort,
} from "./note-generation-encrypted-payload-stager.server";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const PROJECT_ID = "careslink-m1u-security" as const;
const BUCKET_LOCATION = "australia-southeast1" as const;
const RUNTIME_PRINCIPAL =
  "careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com" as const;
const BACKUP_DISPOSITION_VERSION =
  "no-soft-delete.2026-09-03.v1" as const;
const GCS_ORIGIN = "https://storage.googleapis.com" as const;
const GCS_SCOPE =
  "https://www.googleapis.com/auth/devstorage.read_write" as const;
const GCS_AUDIENCE = "https://storage.googleapis.com/" as const;
const REQUEST_TIMEOUT_MS = 5_000 as const;
const OPERATION_TIMEOUT_MS = 30_000 as const;
const METADATA_RESPONSE_MAXIMUM_BYTES = 32 * 1_024;
const PRIVATE_OBJECT_MAXIMUM_BYTES = 256 * 1_024;
const TOMBSTONE_MAXIMUM_BYTES = 4 * 1_024;
const MULTIPART_OVERHEAD_MAXIMUM_BYTES = 8 * 1_024;
const BUCKET_POSTURE_MAXIMUM_AGE_MS = 5 * 60 * 1_000;
const BUCKET_POSTURE_MAXIMUM_REMAINING_MS = 5 * 60 * 1_000;
const BUCKET_PROTECTION_SETTINGS_PROPAGATION_MS = 30 * 1_000;
const EMPTY_BODY = new Uint8Array(0);
const MULTIPART_BOUNDARY =
  "===============careslink_m2a_gcs_private_object==" as const;
const OBJECT_FIELDS =
  "bucket,name,generation,metageneration,size,crc32c,contentType,cacheControl,metadata,temporaryHold,eventBasedHold" as const;
const SEALED_OBJECT_KIND = "SEALED_PAYLOAD" as const;
const TOMBSTONE_OBJECT_KIND = "DELETED_TOMBSTONE" as const;
const PRIVATE_OBJECT_FORMAT_VERSION =
  "careslink.communication-note.encrypted-payload.v1" as const;
const TOMBSTONE_FORMAT_VERSION =
  "careslink.communication-note.encrypted-payload.tombstone.v1" as const;
const LOCATOR_BINDING_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_LOCATOR" as const;
const POSTURE_EVIDENCE_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_GCS_BUCKET_POSTURE" as const;
const CREDENTIAL_PERMISSION_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_GCS_CREDENTIAL_PERMISSIONS" as const;
const CREDENTIAL_OPERATION_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_OPERATION" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET_PATTERN =
  /^(?=.{3,63}$)[a-z0-9](?:[a-z0-9._-]*[a-z0-9])$/;
const OBJECT_PREFIX_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]{0,62})(?:\/[a-z0-9](?:[a-z0-9._-]{0,62}))*$/;
const DECIMAL_PATTERN = /^[1-9][0-9]{0,19}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN =
  /^projects\/(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[1-9][0-9]{5,20})\/locations\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/keyRings\/[A-Za-z0-9_-]{1,63}\/cryptoKeys\/[A-Za-z0-9_-]{1,63}\/cryptoKeyVersions\/[1-9][0-9]{0,18}$/;

const REQUIRED_PERMISSIONS = Object.freeze([
  "storage.objects.create",
  "storage.objects.delete",
  "storage.objects.get",
] as const);

export const CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_VERSION =
  "gcs-private-object-store.communication.2026-09-03.m2c.v1" as const;
export const CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_READY =
  false as const;

export const CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_SOURCE_POLICY =
  deepFreeze({
    version: CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_VERSION,
    status: "SOURCE_ADAPTER_NOT_COMPOSED",
    ready: false,
    sourceOnly: true,
    serverOnly: true,
    formalSingletonEnabled: false,
    exactBucketPerInstance: true,
    exactProjectId: PROJECT_ID,
    exactBucketLocation: BUCKET_LOCATION,
    exactRuntimePrincipal: RUNTIME_PRINCIPAL,
    exactBackupDispositionVersion: BACKUP_DISPOSITION_VERSION,
    objectNamesDerivedFromDigestNamespaceOnly: true,
    officialHttpsOrigin: GCS_ORIGIN,
    redirectsAllowed: false,
    automaticRetries: 0,
    authorityHandoffSynchronous: true,
    authorityAcquisitionOutsideAdapter: true,
    authorizedOperationDelivery:
      "SYNCHRONOUS_CALLBACK_DIRECT_RETURN_ONE_LOGICAL_OPERATION",
    rawCredentialDtoReturned: false,
    rawAuthorizationHeaderAccepted: false,
    authorizedSessionRequestCapabilityOnly: true,
    perAdapterAuthorizedSessionIdentityReplayRejected: true,
    perAdapterAuthorizedRequestFunctionIdentityReplayRejected: true,
    callbackResultOpaque: true,
    callbackPromiseAssimilationAllowed: false,
    operationDeadlineMs: OPERATION_TIMEOUT_MS,
    conditionalCreateIfGenerationMatch: "0",
    deleteDisposition: "SAME_OBJECT_CAS_TOMBSTONE",
    deleteGenerationAndMetagenerationRequired: true,
    uniformBucketLevelAccessRequired: true,
    publicAccessPreventionRequired: "enforced",
    softDeleteRetentionSecondsRequired: 0,
    objectVersioningRequired: false,
    retentionPolicyAllowed: false,
    objectHoldsAllowed: false,
    protectionSettingsPropagationMinimumMs:
      BUCKET_PROTECTION_SETTINGS_PROPAGATION_MS,
    historicalNoncurrentObjectVersionsRequiredAbsent: true,
    historicalSoftDeletedObjectVersionsRequiredAbsent: true,
    bucketPostureAttestationRequired: true,
    bucketPostureDeploymentEvidencePresent: false,
    lifecycleDeploymentEvidencePresent: false,
    backupDispositionDeploymentEvidencePresent: false,
    privateObjectMaximumBytes: PRIVATE_OBJECT_MAXIMUM_BYTES,
    cloudResourcesCreated: false,
    liveNetworkEvidencePresent: false,
    deploymentApproved: false,
    activationApproved: false,
  } as const);

export type CaresLinkV1NoteGenerationGcsBucketPostureAttestation = Readonly<{
  projectId: typeof PROJECT_ID;
  bucket: string;
  bucketLocation: typeof BUCKET_LOCATION;
  observedAt: string;
  expiresAt: string;
  uniformBucketLevelAccessEnabled: true;
  publicAccessPrevention: "enforced";
  softDeleteRetentionSeconds: 0;
  objectVersioningEnabled: false;
  protectionSettingsEffectiveAt: string;
  noncurrentObjectVersionsAbsent: true;
  softDeletedObjectVersionsAbsent: true;
  retentionPolicyPresent: false;
  defaultEventBasedHold: false;
  objectRetentionEnabled: false;
  lifecyclePolicyVersion: string;
  lifecycleRulesHash: string;
  backupDispositionVersion: string;
  postureEvidenceHash: string;
}>;

export type CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest =
  Readonly<{
    purpose: typeof CREDENTIAL_OPERATION_PURPOSE;
    projectId: typeof PROJECT_ID;
    bucketLocation: typeof BUCKET_LOCATION;
    runtimePrincipal: typeof RUNTIME_PRINCIPAL;
    audience: typeof GCS_AUDIENCE;
    scope: typeof GCS_SCOPE;
    bucket: string;
    requiredPermissionSetHash: string;
    operationTimeoutMs: typeof OPERATION_TIMEOUT_MS;
    requestTimeoutMs: typeof REQUEST_TIMEOUT_MS;
    signal: AbortSignal;
  }>;

declare const CARESLINK_V1_GCS_AUTHORIZED_OPERATION: unique symbol;

export type CaresLinkV1NoteGenerationGcsAuthorizedOperation =
  PromiseLike<void> &
    Readonly<{
      [CARESLINK_V1_GCS_AUTHORIZED_OPERATION]: true;
    }>;

export type CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest = Readonly<{
  method: "GET" | "POST";
  url: string;
  accept: "application/json";
  contentType?: string;
  contentLength?: string;
  body: Uint8Array;
  redirect: "ERROR";
  automaticRetries: 0;
  timeoutMs: typeof REQUEST_TIMEOUT_MS;
  maximumResponseBytes: number;
  signal: AbortSignal;
}>;

export type CaresLinkV1NoteGenerationGcsAuthorizedHttpsPort = Readonly<{
  request(
    input: CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest,
  ): PromiseLike<unknown>;
}>;

export type CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer = (
  authorizedSession: unknown,
) => CaresLinkV1NoteGenerationGcsAuthorizedOperation;

export type CaresLinkV1NoteGenerationGcsAuthorizedOperationPort = Readonly<{
  /**
   * Calls `consumer` exactly once and synchronously with a tokenless,
   * operation-scoped HTTPS request capability, then directly returns the exact
   * opaque operation produced by that call. The port must not inspect `.then`,
   * await, wrap, assimilate or retain that operation. Credential DTOs and
   * Authorization headers never cross this public boundary. Any credential
   * acquisition occurs privately before this synchronous handoff.
   */
  consumeAuthorizedOperation(
    input: CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest,
    consumer: CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer,
  ): CaresLinkV1NoteGenerationGcsAuthorizedOperation;
}>;

export type CaresLinkV1NoteGenerationGcsPrivateObjectStoreOptions =
  Readonly<{
    policy: Readonly<{
      projectId: typeof PROJECT_ID;
      bucket: string;
      bucketLocation: typeof BUCKET_LOCATION;
      objectPrefix: string;
      lifecyclePolicyVersion: string;
      lifecycleRulesHash: string;
      backupDispositionVersion: string;
    }>;
    bucketPostureAttestation: CaresLinkV1NoteGenerationGcsBucketPostureAttestation;
    clock: () => string;
    authorizedOperationPort: CaresLinkV1NoteGenerationGcsAuthorizedOperationPort;
    signal: AbortSignal;
  }>;

/** Default-off: no runtime composition installs this adapter. */
export const CARESLINK_V1_NOTE_GENERATION_FORMAL_GCS_PRIVATE_OBJECT_STORE =
  undefined as CaresLinkV1NoteGenerationPrivateObjectStorePort | undefined;

/**
 * Production-oriented protocol core with no environment, SDK, network or
 * cloud discovery. A private authority supplies one tokenless request
 * capability per complete logical operation; the formal singleton above
 * remains absent.
 */
export function createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
  value: unknown,
): CaresLinkV1NoteGenerationPrivateObjectStorePort {
  const options = parseOptions(value);

  return Object.freeze({
    async read(input: unknown) {
      try {
        const namespace = parseNamespace(input);
        return await withAuthorizedOperation(options, async (
          authorizedRequest,
          operationOptions,
        ) => {
          const result = await readCurrent(
            operationOptions,
            authorizedRequest,
            namespace,
          );
          if (result.status === "NOT_FOUND") {
            return Object.freeze({ status: "NOT_FOUND" as const });
          }
          if (result.status === "TOMBSTONED") {
            return Object.freeze({ status: "TOMBSTONED" as const });
          }
          return Object.freeze({
            status: "FOUND" as const,
            object: result.object,
          });
        });
      } catch {
        throw unavailable();
      }
    },

    async createIfAbsent(input: unknown) {
      try {
        const request = exactDataRecord(input, ["namespace", "object"]);
        const namespace = parseNamespace(request.namespace);
        const object = parsePrivateObject(
          request.object,
          options.policy.backupDispositionVersion,
        );
        const locator = createLocator(options.policy, namespace);
        const body = encodeCanonicalObject(object, PRIVATE_OBJECT_MAXIMUM_BYTES);
        const bodySha256 = sha256(body);
        const customMetadata = createCustomMetadata({
          kind: SEALED_OBJECT_KIND,
          locatorHash: locator.locatorHash,
          bodySha256,
          deleteBindingHash: object.deleteBindingHash,
          backupDispositionVersion: options.policy.backupDispositionVersion,
        });

        try {
          return await withAuthorizedOperation(options, async (
            authorizedRequest,
            operationOptions,
          ) => {
            try {
              const outcome = await uploadMultipart(
                operationOptions,
                authorizedRequest,
                {
                  locator,
                  body,
                  customMetadata,
                  ifGenerationMatch: "0",
                },
              );
              if (outcome === "PRECONDITION_FAILED") {
                return existingCreateOutcome(
                  await readCurrent(
                    operationOptions,
                    authorizedRequest,
                    namespace,
                  ),
                );
              }
              return Object.freeze({ status: "CREATED" as const });
            } catch {
              return existingCreateOutcome(
                await readCurrent(
                  operationOptions,
                  authorizedRequest,
                  namespace,
                ),
              );
            }
          });
        } finally {
          body.fill(0);
        }
      } catch {
        throw unavailable();
      }
    },

    async deleteIfBindingMatches(input: unknown) {
      try {
        const request = exactDataRecord(input, [
          "namespace",
          "deleteBindingHash",
        ]);
        const namespace = parseNamespace(request.namespace);
        const deleteBindingHash = requireSha256(request.deleteBindingHash);

        return await withAuthorizedOperation(options, async (
          authorizedRequest,
          operationOptions,
        ) => {
          const current = await readCurrent(
            operationOptions,
            authorizedRequest,
            namespace,
          );
          if (current.status === "NOT_FOUND") {
            return Object.freeze({ status: "NOT_FOUND" as const });
          }
          if (current.status === "TOMBSTONED") {
            return Object.freeze({
              status:
                current.deleteBindingHash === deleteBindingHash
                  ? ("ALREADY_DELETED" as const)
                  : ("BINDING_MISMATCH" as const),
            });
          }
          if (current.deleteBindingHash !== deleteBindingHash) {
            return Object.freeze({ status: "BINDING_MISMATCH" as const });
          }

          const deletedAt = readClock(options.clock);
          const tombstone = deepFreeze({
            formatVersion: TOMBSTONE_FORMAT_VERSION,
            deletedAt,
            locatorHash: current.locator.locatorHash,
            deleteBindingHash,
            replacedGenerationHash: sha256(current.generation),
            replacedMetagenerationHash: sha256(current.metageneration),
            backupDispositionVersion:
              options.policy.backupDispositionVersion,
            lifecyclePolicyVersion: options.policy.lifecyclePolicyVersion,
          });
          const body = encodeCanonicalObject(
            tombstone,
            TOMBSTONE_MAXIMUM_BYTES,
          );
          const customMetadata = createCustomMetadata({
            kind: TOMBSTONE_OBJECT_KIND,
            locatorHash: current.locator.locatorHash,
            bodySha256: sha256(body),
            deleteBindingHash,
            backupDispositionVersion:
              options.policy.backupDispositionVersion,
          });

          try {
            try {
              const outcome = await uploadMultipart(
                operationOptions,
                authorizedRequest,
                {
                  locator: current.locator,
                  body,
                  customMetadata,
                  ifGenerationMatch: current.generation,
                  ifMetagenerationMatch: current.metageneration,
                },
              );
              if (outcome === "PRECONDITION_FAILED") {
                return recoveredDeleteOutcome(
                  await readCurrent(
                    operationOptions,
                    authorizedRequest,
                    namespace,
                  ),
                  deleteBindingHash,
                );
              }
              return Object.freeze({ status: "DELETED" as const });
            } catch {
              return recoveredDeleteOutcome(
                await readCurrent(
                  operationOptions,
                  authorizedRequest,
                  namespace,
                ),
                deleteBindingHash,
              );
            }
          } finally {
            body.fill(0);
          }
        });
      } catch {
        throw unavailable();
      }
    },
  });
}

type ParsedPolicy = Readonly<{
  projectId: typeof PROJECT_ID;
  bucket: string;
  bucketLocation: typeof BUCKET_LOCATION;
  objectPrefix: string;
  lifecyclePolicyVersion: string;
  lifecycleRulesHash: string;
  backupDispositionVersion: string;
}>;

type ConsumeAuthorizedOperation =
  CaresLinkV1NoteGenerationGcsAuthorizedOperationPort["consumeAuthorizedOperation"];
type AuthorizedRequest =
  CaresLinkV1NoteGenerationGcsAuthorizedHttpsPort["request"];

type ParsedOptions = Readonly<{
  policy: ParsedPolicy;
  bucketPostureAttestation: CaresLinkV1NoteGenerationGcsBucketPostureAttestation;
  clock: () => string;
  consumeAuthorizedOperation: ConsumeAuthorizedOperation;
  authorizedOperationFunctionIdentity: object;
  signal: AbortSignal;
  requiredPermissionSetHash: string;
  consumedAuthorizedSessions: WeakSet<object>;
  consumedAuthorizedRequestFunctions: WeakSet<object>;
}>;

type Namespace = Readonly<{
  ownerUserIdHash: string;
  idempotencyHash: string;
}>;

type Locator = Readonly<{
  bucket: string;
  objectName: string;
  locatorHash: string;
}>;

type CustomMetadata = Readonly<{
  careslinkObjectKind: typeof SEALED_OBJECT_KIND | typeof TOMBSTONE_OBJECT_KIND;
  careslinkLocatorHash: string;
  careslinkBodySha256: string;
  careslinkDeleteBindingHash: string;
  careslinkBackupDispositionVersion: string;
}>;

type CurrentObject =
  | Readonly<{ status: "NOT_FOUND" }>
  | Readonly<{
      status: "SEALED";
      object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject;
      deleteBindingHash: string;
      generation: string;
      metageneration: string;
      locator: Locator;
    }>
  | Readonly<{
      status: "TOMBSTONED";
      deleteBindingHash: string;
      generation: string;
      metageneration: string;
      locator: Locator;
    }>;

function parseOptions(value: unknown): ParsedOptions {
  try {
    const options = exactDataRecord(value, [
      "policy",
      "bucketPostureAttestation",
      "clock",
      "authorizedOperationPort",
      "signal",
    ]);
    const policyValue = exactDataRecord(options.policy, [
      "projectId",
      "bucket",
      "bucketLocation",
      "objectPrefix",
      "lifecyclePolicyVersion",
      "lifecycleRulesHash",
      "backupDispositionVersion",
    ]);
    if (
      policyValue.projectId !== PROJECT_ID ||
      policyValue.bucketLocation !== BUCKET_LOCATION
    ) {
      throw unavailable();
    }
    const backupDispositionVersion = requireVersion(
      policyValue.backupDispositionVersion,
    );
    if (backupDispositionVersion !== BACKUP_DISPOSITION_VERSION) {
      throw unavailable();
    }
    const policy = Object.freeze({
      projectId: PROJECT_ID,
      bucket: requireBucket(policyValue.bucket),
      bucketLocation: BUCKET_LOCATION,
      objectPrefix: requireObjectPrefix(policyValue.objectPrefix),
      lifecyclePolicyVersion: requireVersion(
        policyValue.lifecyclePolicyVersion,
      ),
      lifecycleRulesHash: requireSha256(policyValue.lifecycleRulesHash),
      backupDispositionVersion,
    });
    const clock = requireCallable<() => string>(options.clock);
    const signal = requireAbortSignal(options.signal);
    const authorizedOperationPort =
      requireFrozenPort<CaresLinkV1NoteGenerationGcsAuthorizedOperationPort>(
        options.authorizedOperationPort,
        ["consumeAuthorizedOperation"],
      );
    const bucketPostureAttestation = parseBucketPostureAttestation(
      options.bucketPostureAttestation,
      policy,
      readClock(clock),
    );
    return Object.freeze({
      policy,
      bucketPostureAttestation,
      clock,
      consumeAuthorizedOperation:
        authorizedOperationPort.consumeAuthorizedOperation.bind(
          authorizedOperationPort,
        ),
      authorizedOperationFunctionIdentity:
        authorizedOperationPort.consumeAuthorizedOperation,
      signal,
      requiredPermissionSetHash: createRequiredPermissionSetHash(
        policy.bucket,
      ),
      consumedAuthorizedSessions: new WeakSet<object>(),
      consumedAuthorizedRequestFunctions: new WeakSet<object>(),
    });
  } catch {
    throw unavailable();
  }
}

async function withAuthorizedOperation<T>(
  options: ParsedOptions,
  operation: (
    authorizedRequest: AuthorizedRequest,
    operationOptions: ParsedOptions,
  ) => Promise<T>,
): Promise<T> {
  return runWithDeadline(
    options.signal,
    OPERATION_TIMEOUT_MS,
    async (operationSignal) => {
      const now = readClock(options.clock);
      parseBucketPostureAttestation(
        options.bucketPostureAttestation,
        options.policy,
        now,
      );
      return consumeAuthorizedOperation(
        options,
        operation,
        operationSignal,
      );
    },
  );
}

async function consumeAuthorizedOperation<T>(
  options: ParsedOptions,
  operation: (
    authorizedRequest: AuthorizedRequest,
    operationOptions: ParsedOptions,
  ) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let callbackOpen = true;
  let callbackArmed = false;
  let callbackCount = 0;
  let callbackViolation = false;
  let thenClaimCount = 0;
  let callbackStarted = false;
  let callbackSettled = false;
  let callbackFailure = false;
  let result: T | undefined;
  let resultPresent = false;
  let issuedOperation:
    | CaresLinkV1NoteGenerationGcsAuthorizedOperation
    | undefined;

  const inertThen = <TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> => {
    const settlement = Promise.resolve().then(onfulfilled, onrejected);
    void settlement.catch(() => undefined);
    return settlement;
  };

  const consumer: CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer = (
    sessionValue: unknown,
  ): CaresLinkV1NoteGenerationGcsAuthorizedOperation => {
    if (!callbackOpen || callbackCount !== 0) {
      callbackViolation = true;
      return Object.freeze({
        then: inertThen,
      }) as CaresLinkV1NoteGenerationGcsAuthorizedOperation;
    }
    callbackCount += 1;
    let callbackOperation: Promise<void> | undefined;
    const authorizedThen = <TResult1 = void, TResult2 = never>(
      onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): PromiseLike<TResult1 | TResult2> => {
      if (
        !callbackOpen ||
        !callbackArmed ||
        callbackViolation ||
        signal.aborted
      ) {
        return inertThen(onfulfilled, onrejected);
      }
      if (callbackOperation === undefined) {
        if (callbackStarted) {
          callbackViolation = true;
          return inertThen(onfulfilled, onrejected);
        }
        callbackStarted = true;
        callbackOperation = (async () => {
          try {
            requireNotAborted(signal);
            const session =
              requireFrozenPort<CaresLinkV1NoteGenerationGcsAuthorizedHttpsPort>(
                sessionValue,
                ["request"],
              );
            const requestFunction = session.request as unknown as object;
            if (
              options.consumedAuthorizedSessions.has(session) ||
              options.consumedAuthorizedRequestFunctions.has(
                requestFunction,
              ) ||
              (session.request as unknown) ===
                options.authorizedOperationFunctionIdentity
            ) {
              throw unavailable();
            }
            options.consumedAuthorizedSessions.add(session);
            options.consumedAuthorizedRequestFunctions.add(
              requestFunction,
            );
            const operationOptions = Object.freeze({
              ...options,
              signal,
            });
            const candidate = await operation(
              session.request.bind(session),
              operationOptions,
            );
            requireNotAborted(signal);
            if (!callbackOpen || callbackViolation) throw unavailable();
            result = candidate;
            resultPresent = true;
          } catch {
            callbackFailure = true;
          } finally {
            callbackSettled = true;
          }
        })();
        void callbackOperation.catch(() => undefined);
      }
      const settlement = callbackOperation.then(onfulfilled, onrejected);
      void settlement.catch(() => undefined);
      return settlement;
    };
    const opaqueOperation = Object.defineProperty({}, "then", {
      configurable: false,
      enumerable: false,
      get() {
        if (!callbackOpen) return inertThen;
        if (!callbackArmed) {
          callbackViolation = true;
          return inertThen;
        }
        thenClaimCount += 1;
        if (thenClaimCount !== 1) {
          callbackViolation = true;
          return inertThen;
        }
        return authorizedThen;
      },
    }) as CaresLinkV1NoteGenerationGcsAuthorizedOperation;
    issuedOperation = Object.freeze(opaqueOperation);
    return issuedOperation;
  };

  let authorityReturn:
    | CaresLinkV1NoteGenerationGcsAuthorizedOperation
    | undefined;
  try {
    authorityReturn = options.consumeAuthorizedOperation(
      Object.freeze({
        purpose: CREDENTIAL_OPERATION_PURPOSE,
        projectId: PROJECT_ID,
        bucketLocation: BUCKET_LOCATION,
        runtimePrincipal: RUNTIME_PRINCIPAL,
        audience: GCS_AUDIENCE,
        scope: GCS_SCOPE,
        bucket: options.policy.bucket,
        requiredPermissionSetHash: options.requiredPermissionSetHash,
        operationTimeoutMs: OPERATION_TIMEOUT_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        signal,
      }),
      consumer,
    );
  } catch {
    callbackOpen = false;
    throw unavailable();
  }
  if (
    issuedOperation === undefined ||
    authorityReturn !== issuedOperation ||
    callbackCount !== 1 ||
    callbackViolation
  ) {
    callbackOpen = false;
    observeRejectedAuthorityReturnBestEffort(
      authorityReturn,
      issuedOperation,
    );
    throw unavailable();
  }

  callbackArmed = true;
  try {
    await settleBeforeAbort(issuedOperation, signal);
  } catch {
    throw unavailable();
  } finally {
    callbackOpen = false;
  }
  if (
    callbackViolation ||
    callbackFailure ||
    callbackCount !== 1 ||
    thenClaimCount !== 1 ||
    !callbackStarted ||
    !callbackSettled ||
    signal.aborted ||
    !resultPresent
  ) {
    throw unavailable();
  }
  return result as T;
}

function parseBucketPostureAttestation(
  value: unknown,
  policy: ParsedPolicy,
  now: string,
): CaresLinkV1NoteGenerationGcsBucketPostureAttestation {
  const attestation = exactDataRecord(value, [
    "projectId",
    "bucket",
    "bucketLocation",
    "observedAt",
    "expiresAt",
    "uniformBucketLevelAccessEnabled",
    "publicAccessPrevention",
    "softDeleteRetentionSeconds",
    "objectVersioningEnabled",
    "protectionSettingsEffectiveAt",
    "noncurrentObjectVersionsAbsent",
    "softDeletedObjectVersionsAbsent",
    "retentionPolicyPresent",
    "defaultEventBasedHold",
    "objectRetentionEnabled",
    "lifecyclePolicyVersion",
    "lifecycleRulesHash",
    "backupDispositionVersion",
    "postureEvidenceHash",
  ]);
  const observedAt = requireTimestamp(attestation.observedAt);
  const expiresAt = requireTimestamp(attestation.expiresAt);
  const protectionSettingsEffectiveAt = requireTimestamp(
    attestation.protectionSettingsEffectiveAt,
  );
  const normalized = Object.freeze({
    projectId: attestation.projectId,
    bucket: requireBucket(attestation.bucket),
    bucketLocation: attestation.bucketLocation,
    observedAt,
    expiresAt,
    uniformBucketLevelAccessEnabled:
      attestation.uniformBucketLevelAccessEnabled,
    publicAccessPrevention: attestation.publicAccessPrevention,
    softDeleteRetentionSeconds: attestation.softDeleteRetentionSeconds,
    objectVersioningEnabled: attestation.objectVersioningEnabled,
    protectionSettingsEffectiveAt,
    noncurrentObjectVersionsAbsent:
      attestation.noncurrentObjectVersionsAbsent,
    softDeletedObjectVersionsAbsent:
      attestation.softDeletedObjectVersionsAbsent,
    retentionPolicyPresent: attestation.retentionPolicyPresent,
    defaultEventBasedHold: attestation.defaultEventBasedHold,
    objectRetentionEnabled: attestation.objectRetentionEnabled,
    lifecyclePolicyVersion: requireVersion(
      attestation.lifecyclePolicyVersion,
    ),
    lifecycleRulesHash: requireSha256(attestation.lifecycleRulesHash),
    backupDispositionVersion: requireVersion(
      attestation.backupDispositionVersion,
    ),
  });
  const nowMs = Date.parse(now);
  const observedAtMs = Date.parse(observedAt);
  const expiresAtMs = Date.parse(expiresAt);
  const protectionSettingsEffectiveAtMs = Date.parse(
    protectionSettingsEffectiveAt,
  );
  if (
    normalized.projectId !== PROJECT_ID ||
    normalized.bucket !== policy.bucket ||
    normalized.bucketLocation !== BUCKET_LOCATION ||
    normalized.uniformBucketLevelAccessEnabled !== true ||
    normalized.publicAccessPrevention !== "enforced" ||
    normalized.softDeleteRetentionSeconds !== 0 ||
    normalized.objectVersioningEnabled !== false ||
    normalized.noncurrentObjectVersionsAbsent !== true ||
    normalized.softDeletedObjectVersionsAbsent !== true ||
    observedAtMs - protectionSettingsEffectiveAtMs <
      BUCKET_PROTECTION_SETTINGS_PROPAGATION_MS ||
    normalized.retentionPolicyPresent !== false ||
    normalized.defaultEventBasedHold !== false ||
    normalized.objectRetentionEnabled !== false ||
    normalized.lifecyclePolicyVersion !== policy.lifecyclePolicyVersion ||
    normalized.lifecycleRulesHash !== policy.lifecycleRulesHash ||
    normalized.backupDispositionVersion !==
      policy.backupDispositionVersion ||
    observedAtMs > nowMs ||
    nowMs - observedAtMs > BUCKET_POSTURE_MAXIMUM_AGE_MS ||
    expiresAtMs - nowMs < OPERATION_TIMEOUT_MS ||
    expiresAtMs > nowMs + BUCKET_POSTURE_MAXIMUM_REMAINING_MS ||
    requireSha256(attestation.postureEvidenceHash) !==
      canonicalSha256({
        purpose: POSTURE_EVIDENCE_PURPOSE,
        ...normalized,
      })
  ) {
    throw unavailable();
  }
  return Object.freeze({
    ...normalized,
    projectId: PROJECT_ID,
    bucketLocation: BUCKET_LOCATION,
    uniformBucketLevelAccessEnabled: true,
    publicAccessPrevention: "enforced",
    softDeleteRetentionSeconds: 0,
    objectVersioningEnabled: false,
    protectionSettingsEffectiveAt,
    noncurrentObjectVersionsAbsent: true,
    softDeletedObjectVersionsAbsent: true,
    retentionPolicyPresent: false,
    defaultEventBasedHold: false,
    objectRetentionEnabled: false,
    postureEvidenceHash: attestation.postureEvidenceHash as string,
  });
}

function parseNamespace(value: unknown): Namespace {
  const namespace = exactDataRecord(value, [
    "ownerUserIdHash",
    "idempotencyHash",
  ]);
  return Object.freeze({
    ownerUserIdHash: requireSha256(namespace.ownerUserIdHash),
    idempotencyHash: requireSha256(namespace.idempotencyHash),
  });
}

function createLocator(policy: ParsedPolicy, namespace: Namespace): Locator {
  const objectName =
    `${policy.objectPrefix}/payloads/${namespace.ownerUserIdHash}/${namespace.idempotencyHash}.json`;
  if (
    objectName.length > 512 ||
    !objectName.startsWith(`${policy.objectPrefix}/payloads/`)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    bucket: policy.bucket,
    objectName,
    locatorHash: canonicalSha256({
      purpose: LOCATOR_BINDING_PURPOSE,
      origin: GCS_ORIGIN,
      bucket: policy.bucket,
      objectName,
    }),
  });
}

async function readCurrent(
  options: ParsedOptions,
  authorizedRequest: AuthorizedRequest,
  namespace: Namespace,
): Promise<CurrentObject> {
  const locator = createLocator(options.policy, namespace);
  const first = await readCurrentOnce(options, authorizedRequest, locator);
  if (first.status !== "STALE") return first;
  const second = await readCurrentOnce(options, authorizedRequest, locator);
  if (second.status === "STALE") throw unavailable();
  return second;
}

async function readCurrentOnce(
  options: ParsedOptions,
  authorizedRequest: AuthorizedRequest,
  locator: Locator,
): Promise<CurrentObject | Readonly<{ status: "STALE" }>> {
  const metadataResponse = await requestHttps(options, authorizedRequest, {
    method: "GET",
    url: metadataUrl(locator),
    body: EMPTY_BODY,
    contentType: undefined,
    maximumResponseBytes: METADATA_RESPONSE_MAXIMUM_BYTES,
  });
  if (metadataResponse.status === 404) {
    return Object.freeze({ status: "NOT_FOUND" as const });
  }
  if (metadataResponse.status !== 200) throw unavailable();
  let metadata: ReturnType<typeof parseObjectMetadataResponse>;
  try {
    metadata = parseObjectMetadataResponse(
      metadataResponse,
      locator,
      options.policy.backupDispositionVersion,
    );
  } finally {
    metadataResponse.body.fill(0);
  }
  const maximumBodyBytes =
    metadata.kind === TOMBSTONE_OBJECT_KIND
      ? TOMBSTONE_MAXIMUM_BYTES
      : PRIVATE_OBJECT_MAXIMUM_BYTES;
  if (metadata.size > maximumBodyBytes) throw unavailable();
  const bodyResponse = await requestHttps(options, authorizedRequest, {
    method: "GET",
    url: mediaUrl(locator, metadata.generation, metadata.metageneration),
    body: EMPTY_BODY,
    contentType: undefined,
    maximumResponseBytes: maximumBodyBytes,
  });
  if (bodyResponse.status === 404 || bodyResponse.status === 412) {
    return Object.freeze({ status: "STALE" as const });
  }
  try {
    if (
      bodyResponse.status !== 200 ||
      !isJsonContentType(bodyResponse.contentType) ||
      bodyResponse.body.byteLength !== metadata.size ||
      crc32cBase64(bodyResponse.body) !== metadata.crc32c ||
      sha256(bodyResponse.body) !== metadata.bodySha256
    ) {
      throw unavailable();
    }
    const body = parseCanonicalJsonRecord(
      bodyResponse.body,
      maximumBodyBytes,
    );
    if (metadata.kind === TOMBSTONE_OBJECT_KIND) {
      const tombstone = parseTombstone(
        body,
        locator,
        metadata.deleteBindingHash,
        options.policy,
      );
      return Object.freeze({
        status: "TOMBSTONED" as const,
        deleteBindingHash: tombstone.deleteBindingHash,
        generation: metadata.generation,
        metageneration: metadata.metageneration,
        locator,
      });
    }
    const object = parsePrivateObject(
      body,
      options.policy.backupDispositionVersion,
    );
    if (object.deleteBindingHash !== metadata.deleteBindingHash) {
      throw unavailable();
    }
    return Object.freeze({
      status: "SEALED" as const,
      object,
      deleteBindingHash: object.deleteBindingHash,
      generation: metadata.generation,
      metageneration: metadata.metageneration,
      locator,
    });
  } finally {
    bodyResponse.body.fill(0);
  }
}

async function uploadMultipart(
  options: ParsedOptions,
  authorizedRequest: AuthorizedRequest,
  input: Readonly<{
    locator: Locator;
    body: Uint8Array;
    customMetadata: CustomMetadata;
    ifGenerationMatch: string;
    ifMetagenerationMatch?: string;
  }>,
): Promise<"UPLOADED" | "PRECONDITION_FAILED"> {
  requireGeneration(input.ifGenerationMatch, true);
  if (input.ifMetagenerationMatch !== undefined) {
    requireGeneration(input.ifMetagenerationMatch, false);
  }
  if (
    (input.ifGenerationMatch === "0") !==
    (input.ifMetagenerationMatch === undefined)
  ) {
    throw unavailable();
  }
  const multipartBody = createMultipartBody(
    input.locator,
    input.body,
    input.customMetadata,
  );
  try {
    const response = await requestHttps(options, authorizedRequest, {
      method: "POST",
      url: uploadUrl(
        input.locator,
        input.ifGenerationMatch,
        input.ifMetagenerationMatch,
      ),
      body: multipartBody,
      contentType: `multipart/related; boundary="${MULTIPART_BOUNDARY}"`,
      maximumResponseBytes: METADATA_RESPONSE_MAXIMUM_BYTES,
    });
    if (response.status === 412) return "PRECONDITION_FAILED";
    if (response.status !== 200) throw unavailable();
    try {
      const metadata = parseObjectMetadataResponse(
        response,
        input.locator,
        options.policy.backupDispositionVersion,
      );
      if (
        metadata.kind !== input.customMetadata.careslinkObjectKind ||
        metadata.bodySha256 !== input.customMetadata.careslinkBodySha256 ||
        metadata.deleteBindingHash !==
          input.customMetadata.careslinkDeleteBindingHash ||
        metadata.crc32c !== crc32cBase64(input.body) ||
        metadata.size !== input.body.byteLength
      ) {
        throw unavailable();
      }
      return "UPLOADED";
    } finally {
      response.body.fill(0);
    }
  } finally {
    multipartBody.fill(0);
  }
}

async function requestHttps(
  options: ParsedOptions,
  authorizedRequest: AuthorizedRequest,
  input: Readonly<{
    method: "GET" | "POST";
    url: string;
    body: Uint8Array;
    contentType: string | undefined;
    maximumResponseBytes: number;
  }>,
) {
  requireNotAborted(options.signal);
  const url = new URL(input.url);
  if (
    url.origin !== GCS_ORIGIN ||
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    input.maximumResponseBytes < 1 ||
    input.maximumResponseBytes > PRIVATE_OBJECT_MAXIMUM_BYTES
  ) {
    throw unavailable();
  }
  const requestBody = Uint8Array.from(input.body);
  const requestController = new AbortController();
  let rejectBoundary: ((error: unknown) => void) | undefined;
  const boundary = new Promise<never>((_resolve, reject) => {
    rejectBoundary = reject;
  });
  const abortForRoot = () => {
    requestController.abort();
    rejectBoundary?.(unavailable());
  };
  options.signal.addEventListener("abort", abortForRoot, { once: true });
  const deadline = setTimeout(() => {
    requestController.abort();
    rejectBoundary?.(unavailable());
  }, REQUEST_TIMEOUT_MS);
  (deadline as NodeJS.Timeout).unref?.();
  const request = Object.freeze({
    method: input.method,
    url: input.url,
    accept: "application/json" as const,
    ...(input.contentType === undefined
      ? {}
      : {
          contentType: input.contentType,
          contentLength: String(input.body.byteLength),
        }),
    body: requestBody,
    redirect: "ERROR" as const,
    automaticRetries: 0 as const,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maximumResponseBytes: input.maximumResponseBytes,
    signal: requestController.signal,
  });
  const transportPromise = Promise.resolve().then(() => {
    requireNotAborted(requestController.signal);
    return authorizedRequest(request);
  });
  let responseValue: unknown;
  try {
    responseValue = await Promise.race([
      transportPromise,
      boundary,
    ]);
  } catch (error) {
    observeAndClearLateTransportResponse(transportPromise);
    throw error;
  } finally {
    clearTimeout(deadline);
    options.signal.removeEventListener("abort", abortForRoot);
    requestController.abort();
    requestBody.fill(0);
  }
  try {
    const response = exactDataRecord(responseValue, [
      "status",
      "contentType",
      "responseUrl",
      "redirected",
      "body",
    ]);
    requireNotAborted(options.signal);
    if (
      !Number.isInteger(response.status) ||
      (response.status as number) < 100 ||
      (response.status as number) > 599 ||
      response.responseUrl !== input.url ||
      response.redirected !== false ||
      typeof response.contentType !== "string" ||
      response.contentType.length > 256
    ) {
      throw unavailable();
    }
    const body = requireBytes(
      response.body,
      input.maximumResponseBytes,
      true,
    );
    if (response.status !== 200) {
      body.fill(0);
      return Object.freeze({
        status: response.status as number,
        contentType: response.contentType,
        body: EMPTY_BODY,
      });
    }
    return Object.freeze({
      status: response.status as number,
      contentType: response.contentType,
      body,
    });
  } finally {
    clearTransportResponseBody(responseValue);
  }
}

function observeAndClearLateTransportResponse(
  transportPromise: Promise<unknown>,
) {
  void transportPromise.then(
    (response) => clearTransportResponseBody(response),
    () => undefined,
  );
}

function clearTransportResponseBody(value: unknown) {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      nodeTypes.isProxy(value)
    ) {
      return;
    }
    const bodyDescriptor = Object.getOwnPropertyDescriptor(value, "body");
    if (
      bodyDescriptor &&
      "value" in bodyDescriptor &&
      bodyDescriptor.value instanceof Uint8Array &&
      !nodeTypes.isProxy(bodyDescriptor.value)
    ) {
      bodyDescriptor.value.fill(0);
    }
  } catch {
    // Cleanup is best-effort and must never replace the fixed public failure.
  }
}

function parseObjectMetadataResponse(
  response: Readonly<{
    status: number;
    contentType: string;
    body: Uint8Array;
  }>,
  locator: Locator,
  backupDispositionVersion: string,
) {
  if (!isJsonContentType(response.contentType)) throw unavailable();
  const value = parseJsonRecord(
    response.body,
    METADATA_RESPONSE_MAXIMUM_BYTES,
  );
  const metadata = allowedDataRecord(
    value,
    [
      "bucket",
      "name",
      "generation",
      "metageneration",
      "size",
      "crc32c",
      "contentType",
      "cacheControl",
      "metadata",
      "temporaryHold",
      "eventBasedHold",
    ],
    [
      "bucket",
      "name",
      "generation",
      "metageneration",
      "size",
      "crc32c",
      "contentType",
      "cacheControl",
      "metadata",
    ],
  );
  if (
    metadata.bucket !== locator.bucket ||
    metadata.name !== locator.objectName ||
    metadata.contentType !== "application/json" ||
    metadata.cacheControl !== "no-store" ||
    metadata.temporaryHold === true ||
    metadata.eventBasedHold === true ||
    (metadata.temporaryHold !== undefined &&
      metadata.temporaryHold !== false) ||
    (metadata.eventBasedHold !== undefined &&
      metadata.eventBasedHold !== false)
  ) {
    throw unavailable();
  }
  const generation = requireGeneration(metadata.generation, false);
  const metageneration = requireGeneration(metadata.metageneration, false);
  const size = requireBoundedDecimalSize(
    metadata.size,
    PRIVATE_OBJECT_MAXIMUM_BYTES,
  );
  const checksum = requireCrc32cBase64(metadata.crc32c);
  const custom = exactDataRecord(metadata.metadata, [
    "careslinkObjectKind",
    "careslinkLocatorHash",
    "careslinkBodySha256",
    "careslinkDeleteBindingHash",
    "careslinkBackupDispositionVersion",
  ]);
  if (
    (custom.careslinkObjectKind !== SEALED_OBJECT_KIND &&
      custom.careslinkObjectKind !== TOMBSTONE_OBJECT_KIND) ||
    requireSha256(custom.careslinkLocatorHash) !== locator.locatorHash ||
    custom.careslinkBackupDispositionVersion !== backupDispositionVersion
  ) {
    throw unavailable();
  }
  return Object.freeze({
    kind: custom.careslinkObjectKind,
    generation,
    metageneration,
    size,
    crc32c: checksum,
    bodySha256: requireSha256(custom.careslinkBodySha256),
    deleteBindingHash: requireSha256(
      custom.careslinkDeleteBindingHash,
    ),
  });
}

function createMultipartBody(
  locator: Locator,
  objectBody: Uint8Array,
  customMetadata: CustomMetadata,
) {
  const metadataText = stringifyCaresLinkV1CanonicalJson({
    name: locator.objectName,
    contentType: "application/json",
    cacheControl: "no-store",
    crc32c: crc32cBase64(objectBody),
    metadata: customMetadata,
  });
  const prefix = new TextEncoder().encode(
    `--${MULTIPART_BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataText}\r\n--${MULTIPART_BOUNDARY}\r\nContent-Type: application/json\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(
    `\r\n--${MULTIPART_BOUNDARY}--\r\n`,
  );
  const total = prefix.byteLength + objectBody.byteLength + suffix.byteLength;
  if (
    total >
      PRIVATE_OBJECT_MAXIMUM_BYTES + MULTIPART_OVERHEAD_MAXIMUM_BYTES
  ) {
    throw unavailable();
  }
  const output = new Uint8Array(total);
  output.set(prefix, 0);
  output.set(objectBody, prefix.byteLength);
  output.set(suffix, prefix.byteLength + objectBody.byteLength);
  return output;
}

function createCustomMetadata(input: Readonly<{
  kind: typeof SEALED_OBJECT_KIND | typeof TOMBSTONE_OBJECT_KIND;
  locatorHash: string;
  bodySha256: string;
  deleteBindingHash: string;
  backupDispositionVersion: string;
}>): CustomMetadata {
  return Object.freeze({
    careslinkObjectKind: input.kind,
    careslinkLocatorHash: requireSha256(input.locatorHash),
    careslinkBodySha256: requireSha256(input.bodySha256),
    careslinkDeleteBindingHash: requireSha256(input.deleteBindingHash),
    careslinkBackupDispositionVersion: requireVersion(
      input.backupDispositionVersion,
    ),
  });
}

function metadataUrl(locator: Locator) {
  return `${GCS_ORIGIN}/storage/v1/b/${encodeURIComponent(locator.bucket)}/o/${encodeURIComponent(locator.objectName)}?projection=noAcl&fields=${encodeURIComponent(OBJECT_FIELDS)}`;
}

function mediaUrl(
  locator: Locator,
  generation: string,
  metageneration: string,
) {
  return `${GCS_ORIGIN}/download/storage/v1/b/${encodeURIComponent(locator.bucket)}/o/${encodeURIComponent(locator.objectName)}?alt=media&generation=${generation}&ifGenerationMatch=${generation}&ifMetagenerationMatch=${metageneration}`;
}

function uploadUrl(
  locator: Locator,
  generation: string,
  metageneration: string | undefined,
) {
  return `${GCS_ORIGIN}/upload/storage/v1/b/${encodeURIComponent(locator.bucket)}/o?uploadType=multipart&ifGenerationMatch=${generation}${
    metageneration === undefined
      ? ""
      : `&ifMetagenerationMatch=${metageneration}`
  }&fields=${encodeURIComponent(OBJECT_FIELDS)}`;
}

function existingCreateOutcome(current: CurrentObject) {
  if (current.status === "NOT_FOUND") throw unavailable();
  if (current.status === "TOMBSTONED") {
    return Object.freeze({ status: "TOMBSTONED" as const });
  }
  return Object.freeze({
    status: "EXISTS" as const,
    object: current.object,
  });
}

function recoveredDeleteOutcome(
  current: CurrentObject,
  deleteBindingHash: string,
) {
  if (current.status === "NOT_FOUND") {
    return Object.freeze({ status: "NOT_FOUND" as const });
  }
  if (current.status === "TOMBSTONED") {
    return Object.freeze({
      status:
        current.deleteBindingHash === deleteBindingHash
          ? ("ALREADY_DELETED" as const)
          : ("BINDING_MISMATCH" as const),
    });
  }
  if (current.deleteBindingHash !== deleteBindingHash) {
    return Object.freeze({ status: "BINDING_MISMATCH" as const });
  }
  throw unavailable();
}

function parseTombstone(
  value: unknown,
  locator: Locator,
  deleteBindingHash: string,
  policy: ParsedPolicy,
) {
  const tombstone = exactDataRecord(value, [
    "formatVersion",
    "deletedAt",
    "locatorHash",
    "deleteBindingHash",
    "replacedGenerationHash",
    "replacedMetagenerationHash",
    "backupDispositionVersion",
    "lifecyclePolicyVersion",
  ]);
  if (
    tombstone.formatVersion !== TOMBSTONE_FORMAT_VERSION ||
    requireSha256(tombstone.locatorHash) !== locator.locatorHash ||
    requireSha256(tombstone.deleteBindingHash) !== deleteBindingHash ||
    tombstone.backupDispositionVersion !==
      policy.backupDispositionVersion ||
    tombstone.lifecyclePolicyVersion !== policy.lifecyclePolicyVersion
  ) {
    throw unavailable();
  }
  requireTimestamp(tombstone.deletedAt);
  requireSha256(tombstone.replacedGenerationHash);
  requireSha256(tombstone.replacedMetagenerationHash);
  return Object.freeze({ deleteBindingHash });
}

function parsePrivateObject(
  value: unknown,
  backupDispositionVersion: string,
): CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject {
  const object = exactDataRecord(snapshotPlainJson(value), [
    "formatVersion",
    "createdAt",
    "requestBindingHash",
    "retentionSeconds",
    "maximumCleanedFactsCanonicalBytes",
    "receipt",
    "kmsKeyVersionResource",
    "aadCanonicalBase64url",
    "aadSha256",
    "ivBase64url",
    "ciphertextBase64url",
    "authenticationTagBase64url",
    "wrappedDataEncryptionKeyBase64url",
    "sealedPayloadSha256",
    "deleteBindingHash",
  ]);
  if (
    object.formatVersion !== PRIVATE_OBJECT_FORMAT_VERSION ||
    !Number.isSafeInteger(object.retentionSeconds) ||
    (object.retentionSeconds as number) <= 0 ||
    !Number.isSafeInteger(object.maximumCleanedFactsCanonicalBytes) ||
    (object.maximumCleanedFactsCanonicalBytes as number) <= 0 ||
    (object.maximumCleanedFactsCanonicalBytes as number) > 64 * 1_024 ||
    typeof object.kmsKeyVersionResource !== "string" ||
    !NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN.test(
      object.kmsKeyVersionResource,
    )
  ) {
    throw unavailable();
  }
  requireTimestamp(object.createdAt);
  requireSha256(object.requestBindingHash);
  requireSha256(object.aadSha256);
  requireSha256(object.sealedPayloadSha256);
  const deleteBindingHash = requireSha256(object.deleteBindingHash);
  requireCanonicalBase64url(object.aadCanonicalBase64url, 1, 16 * 1_024);
  requireCanonicalBase64url(object.ivBase64url, 12, 12);
  requireCanonicalBase64url(
    object.ciphertextBase64url,
    1,
    68 * 1_024,
  );
  requireCanonicalBase64url(object.authenticationTagBase64url, 16, 16);
  requireCanonicalBase64url(
    object.wrappedDataEncryptionKeyBase64url,
    32,
    64 * 1_024,
  );
  const receipt = exactDataRecord(object.receipt, [
    "jobId",
    "payloadId",
    "payloadHandleHash",
    "payloadExpiresAt",
    "payloadPolicyVersion",
    "payloadPolicySnapshotHash",
    "encryptionProfileVersion",
    "kmsKeyVersionResourceHash",
    "backupDispositionVersion",
  ]);
  requireUuid(receipt.jobId);
  requireUuid(receipt.payloadId);
  requireSha256(receipt.payloadHandleHash);
  requireTimestamp(receipt.payloadExpiresAt);
  requireVersion(receipt.payloadPolicyVersion);
  requireSha256(receipt.payloadPolicySnapshotHash);
  requireVersion(receipt.encryptionProfileVersion);
  requireSha256(receipt.kmsKeyVersionResourceHash);
  if (
    requireVersion(receipt.backupDispositionVersion) !==
    backupDispositionVersion
  ) {
    throw unavailable();
  }
  return deepFreeze({
    ...object,
    receipt: { ...receipt },
    deleteBindingHash,
  }) as unknown as CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject;
}

function parseCanonicalJsonRecord(body: Uint8Array, maximumBytes: number) {
  const text = decodeUtf8(body, maximumBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unavailable();
  }
  const snapshot = snapshotPlainJson(parsed);
  if (stringifyCaresLinkV1CanonicalJson(snapshot) !== text) {
    throw unavailable();
  }
  return exactDataRecord(snapshot, Object.keys(snapshot as object));
}

function parseJsonRecord(body: Uint8Array, maximumBytes: number) {
  const text = decodeUtf8(body, maximumBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw unavailable();
  }
  return exactDataRecord(snapshotPlainJson(parsed),
    Object.keys(parsed as object));
}

function encodeCanonicalObject(value: unknown, maximumBytes: number) {
  const snapshot = snapshotPlainJson(value);
  const bytes = new TextEncoder().encode(
    stringifyCaresLinkV1CanonicalJson(snapshot),
  );
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw unavailable();
  }
  return bytes;
}

function snapshotPlainJson(value: unknown) {
  const state = { nodes: 0 };
  return snapshotJsonNode(value, state, 0);
}

function snapshotJsonNode(
  value: unknown,
  state: { nodes: number },
  depth: number,
): unknown {
  state.nodes += 1;
  if (state.nodes > 4_096 || depth > 32) throw unavailable();
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    if (typeof value === "string" && value.length > PRIVATE_OBJECT_MAXIMUM_BYTES) {
      throw unavailable();
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw unavailable();
    return value;
  }
  if (
    typeof value !== "object" ||
    nodeTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  if (Array.isArray(value)) {
    const keys = Object.keys(descriptors);
    if (
      keys.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)) ||
      descriptors.length?.value !== value.length
    ) {
      throw unavailable();
    }
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw unavailable();
      }
      return snapshotJsonNode(descriptor.value, state, depth + 1);
    });
  }
  const output: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
    output[key] = snapshotJsonNode(descriptor.value, state, depth + 1);
  }
  return output;
}

function createRequiredPermissionSetHash(bucket: string) {
  return canonicalSha256({
    purpose: CREDENTIAL_PERMISSION_PURPOSE,
    projectId: PROJECT_ID,
    origin: GCS_ORIGIN,
    bucket,
    runtimePrincipal: RUNTIME_PRINCIPAL,
    permissions: REQUIRED_PERMISSIONS,
  });
}

function requireBucket(value: unknown) {
  if (
    typeof value !== "string" ||
    !BUCKET_PATTERN.test(value) ||
    value.includes("..") ||
    value.startsWith("goog") ||
    value.includes("google")
  ) {
    throw unavailable();
  }
  return value;
}

function requireObjectPrefix(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !OBJECT_PREFIX_PATTERN.test(value) ||
    value.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw unavailable();
  }
  return value;
}

function requireVersion(value: unknown) {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
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

function requireUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown) {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    throw unavailable();
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw unavailable();
  }
  return value;
}

function requireGeneration(value: unknown, allowZero: boolean) {
  if (
    typeof value !== "string" ||
    (allowZero && value === "0"
      ? false
      : !DECIMAL_PATTERN.test(value))
  ) {
    throw unavailable();
  }
  return value;
}

function requireBoundedDecimalSize(value: unknown, maximum: number) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,6})$/.test(value)
  ) {
    throw unavailable();
  }
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 1 || size > maximum) {
    throw unavailable();
  }
  return size;
}

function requireCanonicalBase64url(
  value: unknown,
  minimumBytes: number,
  maximumBytes: number,
) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(maximumBytes / 3) * 4 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw unavailable();
  }
  const decoded = Buffer.from(value, "base64url");
  try {
    if (
      decoded.byteLength < minimumBytes ||
      decoded.byteLength > maximumBytes ||
      decoded.toString("base64url") !== value
    ) {
      throw unavailable();
    }
    return value;
  } finally {
    decoded.fill(0);
  }
}

function crc32cBase64(value: Uint8Array) {
  const output = Buffer.alloc(4);
  try {
    output.writeUInt32BE(crc32c.calculate(value) >>> 0, 0);
    return output.toString("base64");
  } finally {
    output.fill(0);
  }
}

function requireCrc32cBase64(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9+/]{6}==$/.test(value)
  ) {
    throw unavailable();
  }
  const bytes = Buffer.from(value, "base64");
  try {
    if (bytes.byteLength !== 4 || bytes.toString("base64") !== value) {
      throw unavailable();
    }
    return value;
  } finally {
    bytes.fill(0);
  }
}

function readClock(clock: () => string) {
  try {
    return requireTimestamp(clock());
  } catch {
    throw unavailable();
  }
}

function requireBytes(value: unknown, maximum: number, allowEmpty: boolean) {
  if (
    nodeTypes.isProxy(value) ||
    !(value instanceof Uint8Array) ||
    (!allowEmpty && value.byteLength === 0) ||
    value.byteLength > maximum
  ) {
    throw unavailable();
  }
  return Uint8Array.from(value);
}

function decodeUtf8(value: Uint8Array, maximum: number) {
  if (value.byteLength === 0 || value.byteLength > maximum) {
    throw unavailable();
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw unavailable();
  }
}

function isJsonContentType(value: string) {
  return /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value);
}

function requireAbortSignal(value: unknown) {
  if (!(value instanceof AbortSignal) || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  return value;
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

async function settleBeforeAbort<T>(
  operation: PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  requireNotAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, result?: T) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (error !== undefined) reject(error);
      else resolve(result as T);
    };
    const onAbort = () => finish(unavailable());
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (result) => finish(undefined, result),
      () => finish(unavailable()),
    );
    if (signal.aborted) onAbort();
  });
}

function observeRejectedAuthorityReturnBestEffort(
  value: unknown,
  issuedOperation:
    | CaresLinkV1NoteGenerationGcsAuthorizedOperation
    | undefined,
) {
  if (value === issuedOperation) return;
  try {
    if (!nodeTypes.isProxy(value) && nodeTypes.isPromise(value)) {
      observeNativePromiseRejectionBestEffort(value);
    }
  } catch {
    // The authority handshake is already closed. Never inspect a non-native
    // thenable merely to observe its possible rejection.
  }
}

function observeNativePromiseRejectionBestEffort(value: Promise<unknown>) {
  try {
    const settlement = Reflect.apply(Promise.prototype.then, value, [
      undefined,
      () => undefined,
    ]) as Promise<unknown>;
    Reflect.apply(Promise.prototype.then, settlement, [
      undefined,
      () => undefined,
    ]);
  } catch {
    // Invalid authority output remains unavailable. Cleanup is best effort.
  }
}

async function runWithDeadline<T>(
  rootSignal: AbortSignal,
  timeoutMs: number,
  operation: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T> {
  requireNotAborted(rootSignal);
  const controller = new AbortController();
  let rejectBoundary: ((error: unknown) => void) | undefined;
  const boundary = new Promise<never>((_resolve, reject) => {
    rejectBoundary = reject;
  });
  const abortForRoot = () => {
    controller.abort();
    rejectBoundary?.(unavailable());
  };
  rootSignal.addEventListener("abort", abortForRoot, { once: true });
  const deadline = setTimeout(() => {
    controller.abort();
    rejectBoundary?.(unavailable());
  }, timeoutMs);
  (deadline as NodeJS.Timeout).unref?.();
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      boundary,
    ]);
  } finally {
    clearTimeout(deadline);
    rootSignal.removeEventListener("abort", abortForRoot);
    controller.abort();
  }
}

function requireFrozenPort<T>(value: unknown, methods: readonly string[]): T {
  const object = exactDataRecord(value, methods);
  if (!Object.isFrozen(value)) throw unavailable();
  for (const method of methods) requireCallable(object[method]);
  return value as T;
}

function requireCallable<T extends (...args: never[]) => unknown>(
  value: unknown,
): T {
  if (typeof value !== "function" || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  return value as T;
}

function allowedDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
) {
  const object = requirePlainDataRecord(value);
  const keys = Object.getOwnPropertyNames(object);
  if (
    keys.some((key) => !allowedKeys.includes(key)) ||
    requiredKeys.some((key) => !keys.includes(key))
  ) {
    throw unavailable();
  }
  return object;
}

function exactDataRecord(value: unknown, keys: readonly string[]) {
  const object = requirePlainDataRecord(value);
  const actualKeys = Object.getOwnPropertyNames(object);
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !actualKeys.includes(key))
  ) {
    throw unavailable();
  }
  return object;
}

function requirePlainDataRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    throw unavailable();
  }
  return value as Record<string, unknown>;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
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

class SafeGcsPrivateObjectStoreError extends CaresLinkV1ContractError {}

function unavailable() {
  return new SafeGcsPrivateObjectStoreError(
    "GENERATION_FAILED",
    "Encrypted payload private storage is unavailable",
  );
}
