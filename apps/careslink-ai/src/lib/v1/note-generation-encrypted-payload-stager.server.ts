import "server-only";

import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_CLEANED_FACTS_MAX_CANONICAL_BYTES,
  CARESLINK_V1_CLEANED_FACTS_MAX_DEPTH,
  CARESLINK_V1_CLEANED_FACTS_MAX_NODES,
  scanCaresLinkV1CleanedFacts,
} from "./privacy-review-scanner.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CaresLinkV1ContractError,
  isCaresLinkV1Locale,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1CleanedFactsFor,
  type CaresLinkV1Locale,
} from "./shared-contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN =
  /^projects\/(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[1-9][0-9]{5,20})\/locations\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/keyRings\/[A-Za-z0-9_-]{1,63}\/cryptoKeys\/[A-Za-z0-9_-]{1,63}\/cryptoKeyVersions\/[1-9][0-9]{0,18}$/;

const DATA_ENCRYPTION_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_AUTH_TAG_BYTES = 16;
const MAXIMUM_WRAPPED_DATA_ENCRYPTION_KEY_BYTES = 64 * 1024;
const MAXIMUM_CANONICAL_ENVELOPE_OVERHEAD_BYTES = 4 * 1024;

const PRIVATE_OBJECT_FORMAT_VERSION =
  "careslink.communication-note.encrypted-payload.v1" as const;
const AAD_FORMAT_VERSION =
  "careslink.communication-note.encrypted-payload.aad.v1" as const;
const PLAINTEXT_FORMAT_VERSION =
  "careslink.communication-note.cleaned-facts.v1" as const;
const REQUEST_BINDING_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_ENCRYPTED_PAYLOAD_REQUEST" as const;
const PAYLOAD_HANDLE_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_ENCRYPTED_PAYLOAD_HANDLE" as const;
const DELETE_BINDING_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_ENCRYPTED_PAYLOAD_DELETE" as const;

export const CARESLINK_V1_NOTE_GENERATION_ENCRYPTION_PROFILE_VERSION =
  "aes-256-gcm-envelope.2026-09-03.v1" as const;

export const CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_STAGER_TEST_CAPABILITY =
  "TEST_ONLY_CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_STAGER" as const;

export type CaresLinkV1NoteGenerationEncryptedPayloadPolicy = Readonly<{
  payloadPolicyVersion: string;
  encryptionProfileVersion: typeof CARESLINK_V1_NOTE_GENERATION_ENCRYPTION_PROFILE_VERSION;
  kmsKeyVersionResource: string;
  backupDispositionVersion: string;
  /** Explicit source policy. This module supplies no retention default. */
  retentionSeconds: number;
  /** Applies to the canonical cleaned-facts JSON before envelope framing. */
  maximumCleanedFactsCanonicalBytes: number;
}>;

export type CaresLinkV1NoteGenerationEncryptedPayloadReceipt = Readonly<{
  jobId: string;
  payloadId: string;
  payloadHandleHash: string;
  payloadExpiresAt: string;
  payloadPolicyVersion: string;
  payloadPolicySnapshotHash: string;
  encryptionProfileVersion: string;
  kmsKeyVersionResourceHash: string;
  backupDispositionVersion: string;
}>;

export type CaresLinkV1NoteGenerationEncryptedPayloadStageInput = Readonly<{
  ownerUserId: string;
  noteType: "communication";
  sourceLocale: CaresLinkV1Locale;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  privacyReviewId: string;
  privacyProofExpiresAt: string;
  cleanedFacts: unknown;
  cleanedFactsHash: string;
  idempotencyHash: string;
  requestHash: string;
}>;

export type CaresLinkV1NoteGenerationEncryptedPayloadAbortInput = Readonly<{
  ownerUserId: string;
  /** Required because the receipt deliberately contains no private locator. */
  idempotencyHash: string;
  requestHash: string;
  staged: CaresLinkV1NoteGenerationEncryptedPayloadReceipt;
  reason: "PAYLOAD_NOT_ACCEPTED";
}>;

export type CaresLinkV1NoteGenerationEncryptedPayloadStager = Readonly<{
  stageCanonicalFacts(
    input: CaresLinkV1NoteGenerationEncryptedPayloadStageInput,
  ): Promise<CaresLinkV1NoteGenerationEncryptedPayloadReceipt>;
  abortUnaccepted(
    input: CaresLinkV1NoteGenerationEncryptedPayloadAbortInput,
  ): Promise<void>;
}>;

export type CaresLinkV1NoteGenerationDataKeyWrapPort = Readonly<{
  /**
   * The implementation must wrap with the exact numeric key-version resource,
   * bind wrapping to `additionalAuthenticatedData`, and neither retain nor
   * mutate `plaintextDataEncryptionKey`.
   */
  wrapDataEncryptionKey(input: Readonly<{
    kmsKeyVersionResource: string;
    plaintextDataEncryptionKey: Uint8Array;
    additionalAuthenticatedData: Uint8Array;
  }>): Promise<unknown>;
}>;

type PrivateObjectNamespace = Readonly<{
  /** Digest only. A physical bucket/object locator remains adapter-private. */
  ownerUserIdHash: string;
  idempotencyHash: string;
}>;

export type CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject = Readonly<{
  formatVersion: typeof PRIVATE_OBJECT_FORMAT_VERSION;
  createdAt: string;
  requestBindingHash: string;
  retentionSeconds: number;
  maximumCleanedFactsCanonicalBytes: number;
  receipt: CaresLinkV1NoteGenerationEncryptedPayloadReceipt;
  kmsKeyVersionResource: string;
  aadCanonicalBase64url: string;
  aadSha256: string;
  ivBase64url: string;
  ciphertextBase64url: string;
  authenticationTagBase64url: string;
  wrappedDataEncryptionKeyBase64url: string;
  sealedPayloadSha256: string;
  deleteBindingHash: string;
}>;

export type CaresLinkV1NoteGenerationPrivateObjectStorePort = Readonly<{
  /** The adapter derives and keeps the physical locator private. */
  read(input: PrivateObjectNamespace): Promise<unknown>;
  /** Atomic create-only write in the owner + idempotency namespace. */
  createIfAbsent(input: Readonly<{
    namespace: PrivateObjectNamespace;
    object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject;
  }>): Promise<unknown>;
  /**
   * Atomic exact-binding delete. `ALREADY_DELETED` is valid only when a durable
   * tombstone proves the same deleteBindingHash; a bare backend 404 is not.
   */
  deleteIfBindingMatches(input: Readonly<{
    namespace: PrivateObjectNamespace;
    deleteBindingHash: string;
  }>): Promise<unknown>;
}>;

export type CaresLinkV1NoteGenerationEncryptedPayloadStagerOptions =
  Readonly<{
    policy: CaresLinkV1NoteGenerationEncryptedPayloadPolicy;
    clock: () => string;
    kmsWrapPort: CaresLinkV1NoteGenerationDataKeyWrapPort;
    privateObjectStorePort: CaresLinkV1NoteGenerationPrivateObjectStorePort;
  }>;

export type TestOnlyCaresLinkV1NoteGenerationEncryptedPayloadStagerOptions =
  CaresLinkV1NoteGenerationEncryptedPayloadStagerOptions &
    Readonly<{
      capability: typeof CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_STAGER_TEST_CAPABILITY;
    }>;

/** No default or product runtime can reach this source-only core. */
export const CARESLINK_V1_NOTE_GENERATION_FORMAL_ENCRYPTED_PAYLOAD_STAGER =
  undefined as CaresLinkV1NoteGenerationEncryptedPayloadStager | undefined;

/**
 * Provider-neutral production-safe core. Callers must explicitly inject every
 * policy, time, key-wrap and private-storage dependency. Nothing instantiates
 * it by default and the formal product singleton above remains absent.
 */
export function createCaresLinkV1NoteGenerationEncryptedPayloadStager(
  value: unknown,
): CaresLinkV1NoteGenerationEncryptedPayloadStager {
  const options = parseOptions(value);
  return createStager(options);
}

/**
 * Source-test composition only. It performs local envelope encryption and
 * calls injected ports; it discovers no provider, credential, bucket or key.
 */
export function createTestOnlyCaresLinkV1NoteGenerationEncryptedPayloadStager(
  value: unknown,
): CaresLinkV1NoteGenerationEncryptedPayloadStager {
  let testOnly: Readonly<Record<string, unknown>>;
  try {
    testOnly = exactDataRecord(value, [
      "capability",
      "policy",
      "clock",
      "kmsWrapPort",
      "privateObjectStorePort",
    ]);
    if (
      testOnly.capability !==
      CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_STAGER_TEST_CAPABILITY
    ) {
      throw unavailable();
    }
  } catch {
    throw unavailable();
  }
  return createCaresLinkV1NoteGenerationEncryptedPayloadStager({
    policy: testOnly.policy,
    clock: testOnly.clock,
    kmsWrapPort: testOnly.kmsWrapPort,
    privateObjectStorePort: testOnly.privateObjectStorePort,
  });
}

function createStager(
  options: ParsedOptions,
): CaresLinkV1NoteGenerationEncryptedPayloadStager {
  return Object.freeze({
    async stageCanonicalFacts(inputValue) {
      try {
        const prepared = prepareStageInput(
          inputValue,
          options.policy.maximumCleanedFactsCanonicalBytes,
        );
        const now = parseTimestamp(options.clock());
        if (Date.parse(prepared.privacyProofExpiresAt) <= Date.parse(now)) {
          throw validation();
        }
        const namespace = createNamespace(prepared);
        const existing = await readPrivateObject(
          options.privateObjectStorePort,
          namespace,
        );
        if (existing.status === "TOMBSTONED") throw unavailable();
        if (existing.status === "FOUND") {
          return parseStoredObject(existing.object, prepared, namespace, now);
        }

        const candidate = await createCandidate(
          prepared,
          namespace,
          now,
          options.policy,
          options.kmsWrapPort,
        );
        const outcome = await createPrivateObject(
          options.privateObjectStorePort,
          namespace,
          candidate.object,
        );
        if (outcome.status === "CREATED") return candidate.receipt;
        if (outcome.status === "TOMBSTONED") throw unavailable();
        return parseStoredObject(outcome.object, prepared, namespace, now);
      } catch (error) {
        if (error instanceof SafeStagerError) throw error;
        throw unavailable();
      }
    },

    async abortUnaccepted(inputValue) {
      try {
        const input = exactDataRecord(inputValue, [
          "ownerUserId",
          "idempotencyHash",
          "requestHash",
          "staged",
          "reason",
        ]);
        const ownerUserId = requireUuid(input.ownerUserId);
        const idempotencyHash = requireSha256(input.idempotencyHash);
        const requestHash = requireSha256(input.requestHash);
        if (input.reason !== "PAYLOAD_NOT_ACCEPTED") throw validation();
        const staged = parseReceipt(input.staged);
        const namespace = Object.freeze({
          ownerUserIdHash: sha256(ownerUserId),
          idempotencyHash,
        });
        const deleteBindingHash = createDeleteBindingHash(
          namespace,
          requestHash,
          staged,
        );
        const outcome = await deletePrivateObject(
          options.privateObjectStorePort,
          namespace,
          deleteBindingHash,
        );
        if (
          outcome !== "DELETED" &&
          outcome !== "ALREADY_DELETED"
        ) {
          throw unavailable();
        }
      } catch (error) {
        if (error instanceof SafeStagerError) throw error;
        throw unavailable();
      }
    },
  });
}

type ParsedOptions = Readonly<{
  policy: CaresLinkV1NoteGenerationEncryptedPayloadPolicy;
  clock: () => string;
  kmsWrapPort: CaresLinkV1NoteGenerationDataKeyWrapPort;
  privateObjectStorePort: CaresLinkV1NoteGenerationPrivateObjectStorePort;
}>;

type PreparedStageInput = Readonly<{
  ownerUserId: string;
  ownerUserIdHash: string;
  noteType: "communication";
  sourceLocale: CaresLinkV1Locale;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  privacyReviewId: string;
  privacyReviewIdHash: string;
  privacyProofExpiresAt: string;
  cleanedFacts: CaresLinkV1CleanedFactsFor<"communication">;
  cleanedFactsHash: string;
  idempotencyHash: string;
  requestHash: string;
  requestBindingHash: string;
}>;

function parseOptions(value: unknown): ParsedOptions {
  try {
    const options = exactDataRecord(value, [
      "policy",
      "clock",
      "kmsWrapPort",
      "privateObjectStorePort",
    ]);
    const policyValue = exactDataRecord(options.policy, [
      "payloadPolicyVersion",
      "encryptionProfileVersion",
      "kmsKeyVersionResource",
      "backupDispositionVersion",
      "retentionSeconds",
      "maximumCleanedFactsCanonicalBytes",
    ]);
    const policy = Object.freeze({
      payloadPolicyVersion: requireVersion(policyValue.payloadPolicyVersion),
      encryptionProfileVersion: requireEncryptionProfile(
        policyValue.encryptionProfileVersion,
      ),
      kmsKeyVersionResource: requireNumericKmsKeyVersionResource(
        policyValue.kmsKeyVersionResource,
      ),
      backupDispositionVersion: requireVersion(
        policyValue.backupDispositionVersion,
      ),
      retentionSeconds: requirePositiveSafeInteger(
        policyValue.retentionSeconds,
      ),
      maximumCleanedFactsCanonicalBytes: requireMaximumFactsBytes(
        policyValue.maximumCleanedFactsCanonicalBytes,
      ),
    });
    const clock = requireCallable<() => string>(options.clock);
    const kmsWrapPort = requireFrozenPort<
      CaresLinkV1NoteGenerationDataKeyWrapPort
    >(options.kmsWrapPort, ["wrapDataEncryptionKey"]);
    const privateObjectStorePort = requireFrozenPort<
      CaresLinkV1NoteGenerationPrivateObjectStorePort
    >(options.privateObjectStorePort, [
      "read",
      "createIfAbsent",
      "deleteIfBindingMatches",
    ]);
    return Object.freeze({
      policy,
      clock,
      kmsWrapPort,
      privateObjectStorePort,
    });
  } catch {
    throw unavailable();
  }
}

function prepareStageInput(
  value: unknown,
  maximumCleanedFactsCanonicalBytes: number,
): PreparedStageInput {
  try {
    const input = exactDataRecord(value, [
      "ownerUserId",
      "noteType",
      "sourceLocale",
      "contractVersion",
      "schemaVersion",
      "privacyReviewId",
      "privacyProofExpiresAt",
      "cleanedFacts",
      "cleanedFactsHash",
      "idempotencyHash",
      "requestHash",
    ]);
    const ownerUserId = requireUuid(input.ownerUserId);
    const privacyReviewId = requireUuid(input.privacyReviewId);
    const privacyProofExpiresAt = parseTimestamp(input.privacyProofExpiresAt);
    const cleanedFactsHash = requireSha256(input.cleanedFactsHash);
    const idempotencyHash = requireSha256(input.idempotencyHash);
    const requestHash = requireSha256(input.requestHash);
    if (
      input.noteType !== "communication" ||
      !isCaresLinkV1Locale(input.sourceLocale) ||
      input.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
      input.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION
    ) {
      throw validation();
    }

    const factsSnapshot = snapshotPlainJson(input.cleanedFacts);
    const cleanedFacts = validateCaresLinkV1CleanedFacts(
      "communication",
      factsSnapshot,
    );
    const scan = scanCaresLinkV1CleanedFacts(cleanedFacts);
    const canonicalFacts = stringifyCaresLinkV1CanonicalJson(cleanedFacts);
    if (
      scan.findings.length !== 0 ||
      scan.cleanedFactsHash !== cleanedFactsHash ||
      Buffer.byteLength(canonicalFacts, "utf8") >
        maximumCleanedFactsCanonicalBytes
    ) {
      throw stalePrivacyReview();
    }
    const expectedRequestHash = canonicalSha256({
      noteType: "communication",
      sourceLocale: input.sourceLocale,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      privacyReviewId,
      cleanedFacts,
    });
    if (requestHash !== expectedRequestHash) throw validation();

    const ownerUserIdHash = sha256(ownerUserId);
    const privacyReviewIdHash = sha256(privacyReviewId);
    const requestBindingHash = canonicalSha256({
      purpose: REQUEST_BINDING_PURPOSE,
      ownerUserIdHash,
      noteType: "communication",
      sourceLocale: input.sourceLocale,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      privacyReviewIdHash,
      privacyProofExpiresAt,
      cleanedFactsHash,
      idempotencyHash,
      requestHash,
    });
    return Object.freeze({
      ownerUserId,
      ownerUserIdHash,
      noteType: "communication" as const,
      sourceLocale: input.sourceLocale,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      privacyReviewId,
      privacyReviewIdHash,
      privacyProofExpiresAt,
      cleanedFacts: deepFreeze(clonePlainJson(cleanedFacts)),
      cleanedFactsHash,
      idempotencyHash,
      requestHash,
      requestBindingHash,
    });
  } catch (error) {
    if (error instanceof SafeStagerError) throw error;
    throw validation();
  }
}

function createNamespace(
  input: PreparedStageInput,
): PrivateObjectNamespace {
  return Object.freeze({
    ownerUserIdHash: input.ownerUserIdHash,
    idempotencyHash: input.idempotencyHash,
  });
}

async function createCandidate(
  input: PreparedStageInput,
  namespace: PrivateObjectNamespace,
  createdAt: string,
  policy: CaresLinkV1NoteGenerationEncryptedPayloadPolicy,
  kmsWrapPort: CaresLinkV1NoteGenerationDataKeyWrapPort,
): Promise<Readonly<{
  receipt: CaresLinkV1NoteGenerationEncryptedPayloadReceipt;
  object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject;
}>> {
  const expiresAt = calculateExpiry(
    createdAt,
    input.privacyProofExpiresAt,
    policy.retentionSeconds,
  );
  const jobId = randomUUID();
  const payloadId = randomUUID();
  const kmsKeyVersionResourceHash = sha256(policy.kmsKeyVersionResource);
  const payloadPolicySnapshotHash = createPolicySnapshotHash(
    policy.payloadPolicyVersion,
    policy.encryptionProfileVersion,
    policy.backupDispositionVersion,
  );
  const aadCanonical = stringifyCaresLinkV1CanonicalJson({
    aadFormatVersion: AAD_FORMAT_VERSION,
    algorithm: "AES-256-GCM",
    dataEncryptionKeyBytes: DATA_ENCRYPTION_KEY_BYTES,
    ivBytes: AES_GCM_IV_BYTES,
    authenticationTagBytes: AES_GCM_AUTH_TAG_BYTES,
    ownerUserIdHash: input.ownerUserIdHash,
    jobId,
    payloadId,
    noteType: input.noteType,
    sourceLocale: input.sourceLocale,
    contractVersion: input.contractVersion,
    schemaVersion: input.schemaVersion,
    privacyReviewIdHash: input.privacyReviewIdHash,
    privacyProofExpiresAt: input.privacyProofExpiresAt,
    cleanedFactsHash: input.cleanedFactsHash,
    idempotencyHash: input.idempotencyHash,
    requestHash: input.requestHash,
    requestBindingHash: input.requestBindingHash,
    createdAt,
    payloadExpiresAt: expiresAt,
    payloadPolicyVersion: policy.payloadPolicyVersion,
    payloadPolicySnapshotHash,
    encryptionProfileVersion: policy.encryptionProfileVersion,
    kmsKeyVersionResourceHash,
    backupDispositionVersion: policy.backupDispositionVersion,
    retentionSeconds: policy.retentionSeconds,
    maximumCleanedFactsCanonicalBytes:
      policy.maximumCleanedFactsCanonicalBytes,
  });
  const aad = Buffer.from(aadCanonical, "utf8");
  const plaintext = Buffer.from(
    stringifyCaresLinkV1CanonicalJson({
      formatVersion: PLAINTEXT_FORMAT_VERSION,
      noteType: input.noteType,
      sourceLocale: input.sourceLocale,
      contractVersion: input.contractVersion,
      schemaVersion: input.schemaVersion,
      cleanedFacts: input.cleanedFacts,
    }),
    "utf8",
  );
  if (
    plaintext.byteLength >
    policy.maximumCleanedFactsCanonicalBytes +
      MAXIMUM_CANONICAL_ENVELOPE_OVERHEAD_BYTES
  ) {
    plaintext.fill(0);
    throw validation();
  }

  const dataEncryptionKey = randomBytes(DATA_ENCRYPTION_KEY_BYTES);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const keyForWrap = Buffer.from(dataEncryptionKey);
  try {
    const cipher = createCipheriv(
      "aes-256-gcm",
      dataEncryptionKey,
      iv,
      { authTagLength: AES_GCM_AUTH_TAG_BYTES },
    );
    cipher.setAAD(aad, { plaintextLength: plaintext.byteLength });
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const authenticationTag = cipher.getAuthTag();
    if (authenticationTag.byteLength !== AES_GCM_AUTH_TAG_BYTES) {
      throw unavailable();
    }

    const wrappedResult = await callWrapPort(kmsWrapPort, {
      kmsKeyVersionResource: policy.kmsKeyVersionResource,
      plaintextDataEncryptionKey: keyForWrap,
      additionalAuthenticatedData: Buffer.from(aad),
    });
    const wrappedDataEncryptionKey = wrappedResult.wrappedDataEncryptionKey;
    if (
      wrappedDataEncryptionKey.indexOf(dataEncryptionKey) !== -1
    ) {
      wrappedDataEncryptionKey.fill(0);
      throw unavailable();
    }

    const aadCanonicalBase64url = aad.toString("base64url");
    const ivBase64url = iv.toString("base64url");
    const ciphertextBase64url = ciphertext.toString("base64url");
    const authenticationTagBase64url =
      authenticationTag.toString("base64url");
    const wrappedDataEncryptionKeyBase64url =
      wrappedDataEncryptionKey.toString("base64url");
    const aadSha256 = sha256(aad);
    const sealedPayloadSha256 = createSealedPayloadHash({
      aadSha256,
      ivBase64url,
      ciphertextBase64url,
      authenticationTagBase64url,
      wrappedDataEncryptionKeyBase64url,
      kmsKeyVersionResourceHash,
    });
    wrappedDataEncryptionKey.fill(0);
    const payloadHandleHash = canonicalSha256({
      purpose: PAYLOAD_HANDLE_PURPOSE,
      ownerUserIdHash: namespace.ownerUserIdHash,
      idempotencyHash: namespace.idempotencyHash,
      jobId,
      payloadId,
      requestBindingHash: input.requestBindingHash,
      sealedPayloadSha256,
    });
    const receipt = freezeReceipt({
      jobId,
      payloadId,
      payloadHandleHash,
      payloadExpiresAt: expiresAt,
      payloadPolicyVersion: policy.payloadPolicyVersion,
      payloadPolicySnapshotHash,
      encryptionProfileVersion: policy.encryptionProfileVersion,
      kmsKeyVersionResourceHash,
      backupDispositionVersion: policy.backupDispositionVersion,
    });
    const deleteBindingHash = createDeleteBindingHash(
      namespace,
      input.requestHash,
      receipt,
    );
    const object = deepFreeze({
      formatVersion: PRIVATE_OBJECT_FORMAT_VERSION,
      createdAt,
      requestBindingHash: input.requestBindingHash,
      retentionSeconds: policy.retentionSeconds,
      maximumCleanedFactsCanonicalBytes:
        policy.maximumCleanedFactsCanonicalBytes,
      receipt,
      kmsKeyVersionResource: policy.kmsKeyVersionResource,
      aadCanonicalBase64url,
      aadSha256,
      ivBase64url,
      ciphertextBase64url,
      authenticationTagBase64url,
      wrappedDataEncryptionKeyBase64url,
      sealedPayloadSha256,
      deleteBindingHash,
    } satisfies CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject);
    return Object.freeze({ receipt, object });
  } finally {
    plaintext.fill(0);
    dataEncryptionKey.fill(0);
    keyForWrap.fill(0);
    iv.fill(0);
    aad.fill(0);
  }
}

function parseStoredObject(
  value: unknown,
  input: PreparedStageInput,
  namespace: PrivateObjectNamespace,
  now: string,
): CaresLinkV1NoteGenerationEncryptedPayloadReceipt {
  const object = exactDataRecord(value, [
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
  if (object.formatVersion !== PRIVATE_OBJECT_FORMAT_VERSION) {
    throw unavailable();
  }
  const requestBindingHash = requireSha256(object.requestBindingHash);
  if (requestBindingHash !== input.requestBindingHash) throw conflict();
  const createdAt = parseTimestamp(object.createdAt);
  const retentionSeconds = requirePositiveSafeInteger(object.retentionSeconds);
  const maximumCleanedFactsCanonicalBytes = requireMaximumFactsBytes(
    object.maximumCleanedFactsCanonicalBytes,
  );
  const receipt = parseReceipt(object.receipt);
  const kmsKeyVersionResource = requireNumericKmsKeyVersionResource(
    object.kmsKeyVersionResource,
  );
  const aadCanonicalBase64url = requireCanonicalBase64url(
    object.aadCanonicalBase64url,
    1,
    16 * 1024,
  );
  const aadSha256 = requireSha256(object.aadSha256);
  const ivBase64url = requireCanonicalBase64url(
    object.ivBase64url,
    AES_GCM_IV_BYTES,
    AES_GCM_IV_BYTES,
  );
  const ciphertextBase64url = requireCanonicalBase64url(
    object.ciphertextBase64url,
    1,
    maximumCleanedFactsCanonicalBytes +
      MAXIMUM_CANONICAL_ENVELOPE_OVERHEAD_BYTES,
  );
  const authenticationTagBase64url = requireCanonicalBase64url(
    object.authenticationTagBase64url,
    AES_GCM_AUTH_TAG_BYTES,
    AES_GCM_AUTH_TAG_BYTES,
  );
  const wrappedDataEncryptionKeyBase64url = requireCanonicalBase64url(
    object.wrappedDataEncryptionKeyBase64url,
    DATA_ENCRYPTION_KEY_BYTES,
    MAXIMUM_WRAPPED_DATA_ENCRYPTION_KEY_BYTES,
  );
  const sealedPayloadSha256 = requireSha256(object.sealedPayloadSha256);
  const deleteBindingHash = requireSha256(object.deleteBindingHash);
  const kmsKeyVersionResourceHash = sha256(kmsKeyVersionResource);
  if (
    receipt.kmsKeyVersionResourceHash !== kmsKeyVersionResourceHash ||
    receipt.encryptionProfileVersion !==
      CARESLINK_V1_NOTE_GENERATION_ENCRYPTION_PROFILE_VERSION ||
    receipt.payloadPolicySnapshotHash !==
      createPolicySnapshotHash(
        receipt.payloadPolicyVersion,
        receipt.encryptionProfileVersion,
        receipt.backupDispositionVersion,
      ) ||
    receipt.payloadExpiresAt > input.privacyProofExpiresAt ||
    Date.parse(receipt.payloadExpiresAt) <= Date.parse(createdAt) ||
    Date.parse(receipt.payloadExpiresAt) <= Date.parse(now) ||
    Date.parse(createdAt) > Date.parse(now)
  ) {
    throw unavailable();
  }
  const expectedAadCanonical = stringifyCaresLinkV1CanonicalJson({
    aadFormatVersion: AAD_FORMAT_VERSION,
    algorithm: "AES-256-GCM",
    dataEncryptionKeyBytes: DATA_ENCRYPTION_KEY_BYTES,
    ivBytes: AES_GCM_IV_BYTES,
    authenticationTagBytes: AES_GCM_AUTH_TAG_BYTES,
    ownerUserIdHash: input.ownerUserIdHash,
    jobId: receipt.jobId,
    payloadId: receipt.payloadId,
    noteType: input.noteType,
    sourceLocale: input.sourceLocale,
    contractVersion: input.contractVersion,
    schemaVersion: input.schemaVersion,
    privacyReviewIdHash: input.privacyReviewIdHash,
    privacyProofExpiresAt: input.privacyProofExpiresAt,
    cleanedFactsHash: input.cleanedFactsHash,
    idempotencyHash: input.idempotencyHash,
    requestHash: input.requestHash,
    requestBindingHash,
    createdAt,
    payloadExpiresAt: receipt.payloadExpiresAt,
    payloadPolicyVersion: receipt.payloadPolicyVersion,
    payloadPolicySnapshotHash: receipt.payloadPolicySnapshotHash,
    encryptionProfileVersion: receipt.encryptionProfileVersion,
    kmsKeyVersionResourceHash,
    backupDispositionVersion: receipt.backupDispositionVersion,
    retentionSeconds,
    maximumCleanedFactsCanonicalBytes,
  });
  const actualAad = Buffer.from(aadCanonicalBase64url, "base64url");
  if (
    actualAad.toString("utf8") !== expectedAadCanonical ||
    sha256(actualAad) !== aadSha256 ||
    sealedPayloadSha256 !==
      createSealedPayloadHash({
        aadSha256,
        ivBase64url,
        ciphertextBase64url,
        authenticationTagBase64url,
        wrappedDataEncryptionKeyBase64url,
        kmsKeyVersionResourceHash,
      }) ||
    receipt.payloadHandleHash !==
      canonicalSha256({
        purpose: PAYLOAD_HANDLE_PURPOSE,
        ownerUserIdHash: namespace.ownerUserIdHash,
        idempotencyHash: namespace.idempotencyHash,
        jobId: receipt.jobId,
        payloadId: receipt.payloadId,
        requestBindingHash,
        sealedPayloadSha256,
      }) ||
    deleteBindingHash !==
      createDeleteBindingHash(namespace, input.requestHash, receipt)
  ) {
    actualAad.fill(0);
    throw unavailable();
  }
  actualAad.fill(0);
  return receipt;
}

function createPolicySnapshotHash(
  payloadPolicyVersion: string,
  encryptionProfileVersion: string,
  backupDispositionVersion: string,
) {
  return canonicalSha256({
    policyVersion: payloadPolicyVersion,
    encryptionProfileVersion,
    backupDispositionVersion,
  });
}

function createSealedPayloadHash(value: Readonly<{
  aadSha256: string;
  ivBase64url: string;
  ciphertextBase64url: string;
  authenticationTagBase64url: string;
  wrappedDataEncryptionKeyBase64url: string;
  kmsKeyVersionResourceHash: string;
}>) {
  return canonicalSha256(value);
}

function createDeleteBindingHash(
  namespace: PrivateObjectNamespace,
  requestHash: string,
  receipt: CaresLinkV1NoteGenerationEncryptedPayloadReceipt,
) {
  return canonicalSha256({
    purpose: DELETE_BINDING_PURPOSE,
    ownerUserIdHash: namespace.ownerUserIdHash,
    idempotencyHash: namespace.idempotencyHash,
    requestHash,
    receipt,
  });
}

function calculateExpiry(
  now: string,
  privacyProofExpiresAt: string,
  retentionSeconds: number,
) {
  const nowMs = Date.parse(now);
  const retentionMs = retentionSeconds * 1_000;
  if (!Number.isSafeInteger(retentionMs)) throw validation();
  const expiresMs = Math.min(
    nowMs + retentionMs,
    Date.parse(privacyProofExpiresAt),
  );
  if (!Number.isSafeInteger(expiresMs) || expiresMs <= nowMs) {
    throw validation();
  }
  return new Date(expiresMs).toISOString();
}

async function callWrapPort(
  port: CaresLinkV1NoteGenerationDataKeyWrapPort,
  input: Readonly<{
    kmsKeyVersionResource: string;
    plaintextDataEncryptionKey: Uint8Array;
    additionalAuthenticatedData: Uint8Array;
  }>,
) {
  let result: unknown;
  try {
    result = await port.wrapDataEncryptionKey(Object.freeze(input));
  } catch {
    throw unavailable();
  }
  const record = exactDataRecord(result, [
    "kmsKeyVersionResource",
    "wrappedDataEncryptionKey",
  ]);
  if (record.kmsKeyVersionResource !== input.kmsKeyVersionResource) {
    throw unavailable();
  }
  return Object.freeze({
    wrappedDataEncryptionKey: copyBytes(
      record.wrappedDataEncryptionKey,
      DATA_ENCRYPTION_KEY_BYTES,
      MAXIMUM_WRAPPED_DATA_ENCRYPTION_KEY_BYTES,
    ),
  });
}

async function readPrivateObject(
  port: CaresLinkV1NoteGenerationPrivateObjectStorePort,
  namespace: PrivateObjectNamespace,
): Promise<
  | Readonly<{ status: "NOT_FOUND" }>
  | Readonly<{ status: "TOMBSTONED" }>
  | Readonly<{ status: "FOUND"; object: unknown }>
> {
  let value: unknown;
  try {
    value = await port.read(namespace);
  } catch {
    throw unavailable();
  }
  const result = exactDataRecordWithVariant(value, "status", {
    NOT_FOUND: [],
    TOMBSTONED: [],
    FOUND: ["object"],
  });
  if (result.status === "FOUND") {
    return Object.freeze({ status: "FOUND" as const, object: result.object });
  }
  return Object.freeze({ status: result.status });
}

async function createPrivateObject(
  port: CaresLinkV1NoteGenerationPrivateObjectStorePort,
  namespace: PrivateObjectNamespace,
  object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject,
): Promise<
  | Readonly<{ status: "CREATED" }>
  | Readonly<{ status: "TOMBSTONED" }>
  | Readonly<{ status: "EXISTS"; object: unknown }>
> {
  let value: unknown;
  try {
    value = await port.createIfAbsent(
      Object.freeze({ namespace, object }),
    );
  } catch {
    throw unavailable();
  }
  const result = exactDataRecordWithVariant(value, "status", {
    CREATED: [],
    TOMBSTONED: [],
    EXISTS: ["object"],
  });
  if (result.status === "EXISTS") {
    return Object.freeze({ status: "EXISTS" as const, object: result.object });
  }
  return Object.freeze({ status: result.status });
}

async function deletePrivateObject(
  port: CaresLinkV1NoteGenerationPrivateObjectStorePort,
  namespace: PrivateObjectNamespace,
  deleteBindingHash: string,
) {
  let value: unknown;
  try {
    value = await port.deleteIfBindingMatches(
      Object.freeze({ namespace, deleteBindingHash }),
    );
  } catch {
    throw unavailable();
  }
  const result = exactDataRecord(value, ["status"]);
  if (
    result.status !== "DELETED" &&
    result.status !== "ALREADY_DELETED" &&
    result.status !== "NOT_FOUND" &&
    result.status !== "BINDING_MISMATCH"
  ) {
    throw unavailable();
  }
  return result.status;
}

function parseReceipt(
  value: unknown,
): CaresLinkV1NoteGenerationEncryptedPayloadReceipt {
  const receipt = exactDataRecord(value, [
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
  return freezeReceipt({
    jobId: requireUuid(receipt.jobId),
    payloadId: requireUuid(receipt.payloadId),
    payloadHandleHash: requireSha256(receipt.payloadHandleHash),
    payloadExpiresAt: parseTimestamp(receipt.payloadExpiresAt),
    payloadPolicyVersion: requireVersion(receipt.payloadPolicyVersion),
    payloadPolicySnapshotHash: requireSha256(
      receipt.payloadPolicySnapshotHash,
    ),
    encryptionProfileVersion: requireEncryptionProfile(
      receipt.encryptionProfileVersion,
    ),
    kmsKeyVersionResourceHash: requireSha256(
      receipt.kmsKeyVersionResourceHash,
    ),
    backupDispositionVersion: requireVersion(
      receipt.backupDispositionVersion,
    ),
  });
}

function freezeReceipt(
  receipt: CaresLinkV1NoteGenerationEncryptedPayloadReceipt,
) {
  return Object.freeze({ ...receipt });
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
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
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
  ) {
    throw unavailable();
  }
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw unavailable();
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function exactDataRecordWithVariant<
  const Variants extends Readonly<Record<string, readonly string[]>>,
>(
  value: unknown,
  discriminant: string,
  variants: Variants,
): Readonly<Record<string, unknown>> & {
  status: keyof Variants & string;
} {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const statusDescriptor = descriptors[discriminant];
  if (!statusDescriptor || !("value" in statusDescriptor)) {
    throw unavailable();
  }
  const status = statusDescriptor.value;
  if (typeof status !== "string" || !Object.hasOwn(variants, status)) {
    throw unavailable();
  }
  return exactDataRecord(value, [discriminant, ...variants[status]]) as
    Readonly<Record<string, unknown>> & {
      status: keyof Variants & string;
    };
}

function snapshotPlainJson(value: unknown): unknown {
  return snapshotPlainJsonNode(
    value,
    { seen: new Set<object>(), nodes: 0 },
    0,
  );
}

function snapshotPlainJsonNode(
  value: unknown,
  state: { seen: Set<object>; nodes: number },
  depth: number,
): unknown {
  state.nodes += 1;
  if (
    state.nodes > CARESLINK_V1_CLEANED_FACTS_MAX_NODES ||
    depth > CARESLINK_V1_CLEANED_FACTS_MAX_DEPTH
  ) {
    throw validation();
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.includes("\u0000") || hasUnpairedSurrogate(value)) {
      throw validation();
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw validation();
    return value;
  }
  if (
    typeof value !== "object" ||
    nodeTypes.isProxy(value) ||
    state.seen.has(value)
  ) {
    throw validation();
  }
  state.seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw validation();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const expectedKeys = [
      ...Array.from({ length: value.length }, (_, index) => String(index)),
      "length",
    ];
    if (
      keys.some((key) => typeof key !== "string") ||
      keys.length !== expectedKeys.length ||
      expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
    ) {
      throw validation();
    }
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw validation();
      }
      return snapshotPlainJsonNode(descriptor.value, state, depth + 1);
    });
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw validation();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length > CARESLINK_V1_CLEANED_FACTS_MAX_NODES ||
    keys.some((key) => typeof key !== "string")
  ) {
    throw validation();
  }
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys as string[]) {
    if (key.includes("\u0000") || hasUnpairedSurrogate(key)) {
      throw validation();
    }
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw validation();
    }
    Object.defineProperty(snapshot, key, {
      value: snapshotPlainJsonNode(descriptor.value, state, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return snapshot;
}

function clonePlainJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((child) => clonePlainJson(child)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        clonePlainJson(child),
      ]),
    ) as T;
  }
  return value;
}

function hasUnpairedSurrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function requireFrozenPort<T>(value: unknown, methods: readonly string[]): T {
  const record = exactDataRecord(value, methods);
  if (!Object.isFrozen(value)) throw unavailable();
  for (const method of methods) requireCallable(record[method]);
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

function requireUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw validation();
  }
  return value.toLowerCase();
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw validation();
  }
  return value;
}

function requireVersion(value: unknown) {
  if (
    typeof value !== "string" ||
    !VERSION_PATTERN.test(value) ||
    /(?:https?:\/\/|bearer|authorization)/i.test(value)
  ) {
    throw validation();
  }
  return value;
}

function requireEncryptionProfile(value: unknown) {
  if (value !== CARESLINK_V1_NOTE_GENERATION_ENCRYPTION_PROFILE_VERSION) {
    throw validation();
  }
  return value;
}

function requireNumericKmsKeyVersionResource(value: unknown) {
  if (
    typeof value !== "string" ||
    !NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN.test(value)
  ) {
    throw validation();
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    !Number.isSafeInteger(value * 1_000)
  ) {
    throw validation();
  }
  return value;
}

function requireMaximumFactsBytes(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > CARESLINK_V1_CLEANED_FACTS_MAX_CANONICAL_BYTES
  ) {
    throw validation();
  }
  return value;
}

function parseTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw validation();
  }
  return value;
}

function requireCanonicalBase64url(
  value: unknown,
  minimumBytes: number,
  maximumBytes: number,
) {
  if (typeof value !== "string" || !BASE64URL_PATTERN.test(value)) {
    throw unavailable();
  }
  const bytes = Buffer.from(value, "base64url");
  if (
    bytes.byteLength < minimumBytes ||
    bytes.byteLength > maximumBytes ||
    bytes.toString("base64url") !== value
  ) {
    bytes.fill(0);
    throw unavailable();
  }
  bytes.fill(0);
  return value;
}

function copyBytes(value: unknown, minimumBytes: number, maximumBytes: number) {
  if (!(value instanceof Uint8Array) || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  const bytes = Buffer.from(value);
  if (
    bytes.byteLength < minimumBytes ||
    bytes.byteLength > maximumBytes
  ) {
    bytes.fill(0);
    throw unavailable();
  }
  return bytes;
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value: unknown) {
  return sha256(stringifyCaresLinkV1CanonicalJson(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

class SafeStagerError extends CaresLinkV1ContractError {}

function validation() {
  return new SafeStagerError(
    "VALIDATION_ERROR",
    "Encrypted payload staging input is invalid",
  );
}

function stalePrivacyReview() {
  return new SafeStagerError(
    "PRIVACY_REVIEW_STALE",
    "Encrypted payload facts do not match the reviewed facts",
  );
}

function conflict() {
  return new SafeStagerError(
    "IDEMPOTENCY_CONFLICT",
    "Encrypted payload idempotency binding conflicts",
  );
}

function unavailable() {
  return new SafeStagerError(
    "GENERATION_FAILED",
    "Encrypted payload staging is unavailable",
  );
}
