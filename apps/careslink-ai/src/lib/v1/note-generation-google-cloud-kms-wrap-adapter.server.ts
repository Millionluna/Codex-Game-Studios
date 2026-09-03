import "server-only";

import { createRequire } from "node:module";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import type { CaresLinkV1NoteGenerationDataKeyWrapPort } from "./note-generation-encrypted-payload-stager.server";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const KMS_ORIGIN = "https://cloudkms.googleapis.com" as const;
const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform" as const;
const ACCESS_TOKEN_AUDIENCE = `${KMS_ORIGIN}/` as const;
const RUNTIME_SERVICE_ACCOUNT =
  "careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com" as const;
const CREDENTIAL_PURPOSE =
  "CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAP" as const;
const REQUEST_TIMEOUT_MS = 5_000;
const REQUEST_BODY_MAXIMUM_BYTES = 96 * 1_024;
const RESPONSE_BODY_MAXIMUM_BYTES = 64 * 1_024;
const ACCESS_TOKEN_MAXIMUM_BYTES = 16 * 1_024;
const DATA_ENCRYPTION_KEY_BYTES = 32;
const ADDITIONAL_AUTHENTICATED_DATA_MAXIMUM_BYTES = 64 * 1_024;
const RAW_AES_GCM_IV_BYTES = 12;
const RAW_AES_GCM_TAG_BYTES = 16;
const RAW_AES_GCM_CIPHERTEXT_BYTES =
  DATA_ENCRYPTION_KEY_BYTES + RAW_AES_GCM_TAG_BYTES;
const WRAPPED_DATA_ENCRYPTION_KEY_MAXIMUM_BYTES = 64 * 1_024;
const NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN =
  /^projects\/careslink-m1u-security\/locations\/australia-southeast1\/keyRings\/[A-Za-z0-9_-]{1,63}\/cryptoKeys\/[A-Za-z0-9_-]{1,63}\/cryptoKeyVersions\/[1-9][0-9]{0,18}$/;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]{16,16384}={0,2}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ACCESS_TOKEN_MAXIMUM_LIFETIME_MS = (60 * 60 + 60) * 1_000;
const ACCESS_TOKEN_MINIMUM_REMAINING_MS = REQUEST_TIMEOUT_MS;
const KEY_VERSION_POSTURE_MAXIMUM_LIFETIME_MS = 5 * 60 * 1_000;
const KEY_VERSION_POSTURE_MINIMUM_REMAINING_MS = REQUEST_TIMEOUT_MS;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const KEY_VERSION_POSTURE_ATTESTATIONS = new WeakSet<object>();

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAP_ADAPTER_VERSION =
  "google-cloud-kms-wrap.communication-note.2026-09-03.m2a.v1" as const;
export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAPPED_DATA_KEY_FORMAT_VERSION =
  "careslink.note-generation.google-cloud-kms.raw-aes-256-gcm-wrapped-dek.v1" as const;
export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION =
  "google-cloud-kms-key-version-posture.communication-note.2026-09-03.m2a.v1" as const;
export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAP_ADAPTER_READY =
  false as const;

export type CaresLinkV1NoteGenerationGoogleCloudKmsFetchRequest = Readonly<{
  method: "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  redirect: "ERROR";
  automaticRetries: 0;
  timeoutMs: 5_000;
  maximumResponseBytes: number;
  signal: AbortSignal;
}>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsFetchPort = Readonly<{
  /**
   * Executes exactly the supplied request and enforces its byte cap. The
   * adapter independently enforces the absolute timeout and AbortSignal.
   */
  fetch(
    request: CaresLinkV1NoteGenerationGoogleCloudKmsFetchRequest,
  ): PromiseLike<unknown>;
}>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenRequest =
  Readonly<{
    purpose: typeof CREDENTIAL_PURPOSE;
    audience: typeof ACCESS_TOKEN_AUDIENCE;
    scope: typeof CLOUD_PLATFORM_SCOPE;
    expectedPrincipal: typeof RUNTIME_SERVICE_ACCOUNT;
    timeoutMs: 5_000;
    signal: AbortSignal;
  }>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential =
  Readonly<{
    accessToken: string;
    expiresAt: string;
    principal: typeof RUNTIME_SERVICE_ACCOUNT;
  }>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsCredentialPort = Readonly<{
  /**
   * Supplies one short-lived access token only during the awaited callback.
   * The injected custody layer must already have verified the exact Vercel WIF
   * binding and impersonated the pinned runtime service account. Implementations
   * must not persist or expose the callback result.
   */
  consumeAccessToken(
    request: CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenRequest,
    consumer: (
      credential: CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential,
    ) => PromiseLike<void>,
  ): PromiseLike<void>;
}>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation =
  Readonly<{
    attestationVersion: typeof CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION;
    status: "VERIFIED_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_NOT_APPROVED";
    kmsKeyVersionResource: string;
    purpose: "RAW_ENCRYPT_DECRYPT";
    algorithm: "AES_256_GCM";
    protectionLevel: "SOFTWARE";
    state: "ENABLED";
    observedAt: string;
    expiresAt: string;
    controlPlaneEvidenceSha256: string;
    rawKeyMaterialPresent: false;
  }>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapterOptions =
  Readonly<{
    fetchPort: CaresLinkV1NoteGenerationGoogleCloudKmsFetchPort;
    credentialPort: CaresLinkV1NoteGenerationGoogleCloudKmsCredentialPort;
    expectedKmsKeyVersionResource: string;
    keyVersionPostureAttestation: CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation;
    rootAbortSignal: AbortSignal;
  }>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsWrapInput = Readonly<{
  kmsKeyVersionResource: string;
  plaintextDataEncryptionKey: Uint8Array;
  additionalAuthenticatedData: Uint8Array;
}>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsWrappedResult = Readonly<{
  kmsKeyVersionResource: string;
  wrappedDataEncryptionKey: Uint8Array;
}>;

export type CaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapter = Readonly<{
  wrapDataEncryptionKey(
    input: CaresLinkV1NoteGenerationGoogleCloudKmsWrapInput,
  ): Promise<CaresLinkV1NoteGenerationGoogleCloudKmsWrappedResult>;
}>;

/** No provider call is installed by importing this module. */
export const CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_KMS_WRAP_ADAPTER =
  undefined as CaresLinkV1NoteGenerationDataKeyWrapPort | undefined;

/**
 * Validates and brands injected point-in-time control-plane evidence. This
 * source-only constructor does not fetch or independently establish that
 * evidence, and therefore does not activate the formal adapter.
 */
export function createCaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation(
  value: unknown,
): CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation {
  try {
    const attestation = parseKeyVersionPostureAttestation(
      value,
      undefined,
      Date.now(),
      KEY_VERSION_POSTURE_MINIMUM_REMAINING_MS,
      false,
    );
    KEY_VERSION_POSTURE_ATTESTATIONS.add(attestation);
    return attestation;
  } catch {
    throw unavailable();
  }
}

/**
 * Explicit server-only adapter for an exact-version Cloud KMS `rawEncrypt`
 * call. It discovers no credentials, environment or Google client. Ordinary
 * `cryptoKeys.encrypt` is deliberately not used because it may select the
 * current primary version instead of the policy-pinned numeric version.
 */
export function createCaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapter(
  value: unknown,
): CaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapter {
  const options = parseOptions(value);
  return Object.freeze({
    async wrapDataEncryptionKey(inputValue) {
      let input: ParsedWrapInput | undefined;
      let deadline: Deadline | undefined;
      let operation: Promise<WrappedResult> | undefined;
      try {
        validateBrandedKeyVersionPostureAttestation(
          options.keyVersionPostureAttestation,
          options.expectedKmsKeyVersionResource,
          KEY_VERSION_POSTURE_MINIMUM_REMAINING_MS,
        );
        input = parseWrapInput(
          inputValue,
          options.expectedKmsKeyVersionResource,
        );
        deadline = createDeadline(options.rootAbortSignal);
        requireNotAborted(deadline.signal);
        operation = consumeCredentialAndWrap(options, input, deadline.signal);
        void operation.catch(() => undefined);
        const result = await settleBeforeAbort(operation, deadline.signal);
        try {
          validateBrandedKeyVersionPostureAttestation(
            options.keyVersionPostureAttestation,
            options.expectedKmsKeyVersionResource,
            0,
          );
        } catch {
          result.wrappedDataEncryptionKey.fill(0);
          throw unavailable();
        }
        return result;
      } catch {
        throw unavailable();
      } finally {
        deadline?.close();
        input?.plaintextDataEncryptionKey.fill(0);
        input?.additionalAuthenticatedData.fill(0);
      }
    },
  });
}

type FetchRequest = CaresLinkV1NoteGenerationGoogleCloudKmsFetchPort["fetch"];
type ConsumeAccessToken =
  CaresLinkV1NoteGenerationGoogleCloudKmsCredentialPort["consumeAccessToken"];

type ParsedOptions = Readonly<{
  fetchRequest: FetchRequest;
  consumeAccessToken: ConsumeAccessToken;
  expectedKmsKeyVersionResource: string;
  keyVersionPostureAttestation: CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation;
  rootAbortSignal: AbortSignal;
}>;

type ParsedWrapInput = Readonly<{
  kmsKeyVersionResource: string;
  plaintextDataEncryptionKey: Uint8Array;
  additionalAuthenticatedData: Uint8Array;
}>;

type WrappedResult =
  CaresLinkV1NoteGenerationGoogleCloudKmsWrappedResult;

type Deadline = Readonly<{
  signal: AbortSignal;
  close(): void;
}>;

function parseOptions(value: unknown): ParsedOptions {
  try {
    const options = exactDataRecord(value, [
      "fetchPort",
      "credentialPort",
      "expectedKmsKeyVersionResource",
      "keyVersionPostureAttestation",
      "rootAbortSignal",
    ]);
    const fetchCallable = requireFrozenCallable<FetchRequest>(
      options.fetchPort,
      "fetch",
    );
    const consumeAccessTokenCallable =
      requireFrozenCallable<ConsumeAccessToken>(
        options.credentialPort,
        "consumeAccessToken",
      );
    if (
      options.fetchPort === options.credentialPort ||
      (fetchCallable as unknown) === consumeAccessTokenCallable ||
      nodeTypes.isProxy(options.rootAbortSignal) ||
      !(options.rootAbortSignal instanceof AbortSignal) ||
      options.rootAbortSignal.aborted
    ) {
      throw unavailable();
    }
    const expectedKmsKeyVersionResource =
      requireNumericKmsKeyVersionResource(
        options.expectedKmsKeyVersionResource,
      );
    const keyVersionPostureAttestation =
      validateBrandedKeyVersionPostureAttestation(
        options.keyVersionPostureAttestation,
        expectedKmsKeyVersionResource,
        KEY_VERSION_POSTURE_MINIMUM_REMAINING_MS,
      );
    return Object.freeze({
      fetchRequest: fetchCallable.bind(options.fetchPort) as FetchRequest,
      consumeAccessToken: consumeAccessTokenCallable.bind(
        options.credentialPort,
      ) as ConsumeAccessToken,
      expectedKmsKeyVersionResource,
      keyVersionPostureAttestation,
      rootAbortSignal: options.rootAbortSignal,
    });
  } catch {
    throw unavailable();
  }
}

function parseWrapInput(
  value: unknown,
  expectedKmsKeyVersionResource: string,
): ParsedWrapInput {
  const input = exactDataRecord(value, [
    "kmsKeyVersionResource",
    "plaintextDataEncryptionKey",
    "additionalAuthenticatedData",
  ]);
  const kmsKeyVersionResource = requireNumericKmsKeyVersionResource(
    input.kmsKeyVersionResource,
  );
  if (kmsKeyVersionResource !== expectedKmsKeyVersionResource) {
    throw unavailable();
  }
  return Object.freeze({
    kmsKeyVersionResource,
    plaintextDataEncryptionKey: requireExactBytes(
      input.plaintextDataEncryptionKey,
      DATA_ENCRYPTION_KEY_BYTES,
    ),
    additionalAuthenticatedData: requireBytes(
      input.additionalAuthenticatedData,
      ADDITIONAL_AUTHENTICATED_DATA_MAXIMUM_BYTES,
    ),
  });
}

async function consumeCredentialAndWrap(
  options: ParsedOptions,
  input: ParsedWrapInput,
  signal: AbortSignal,
): Promise<WrappedResult> {
  let callbackOpen = true;
  let callbackCount = 0;
  let callbackViolation = false;
  let callbackStarted = false;
  let callbackSettled = false;
  let callbackFailure = false;
  let wrapped: WrappedResult | undefined;
  const consumer = (
    credentialValue: CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential,
  ): PromiseLike<void> => {
    if (!callbackOpen || callbackCount !== 0) {
      callbackViolation = true;
      return Promise.resolve();
    }
    callbackCount += 1;
    let callbackOperation: Promise<void> | undefined;
    return Object.freeze({
      then<TResult1 = void, TResult2 = never>(
        onfulfilled?:
          | ((value: void) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null,
      ): PromiseLike<TResult1 | TResult2> {
        if (callbackOperation === undefined) {
          if (!callbackOpen || callbackStarted) {
            callbackViolation = true;
            callbackOperation = Promise.resolve();
          } else {
            callbackStarted = true;
            callbackOperation = (async () => {
              try {
                requireNotAborted(signal);
                const credential = requireCredential(credentialValue);
                wrapped = await rawEncrypt(
                  options.fetchRequest,
                  input,
                  credential.accessToken,
                  signal,
                );
              } catch {
                callbackFailure = true;
              } finally {
                callbackSettled = true;
              }
            })();
            void callbackOperation.catch(() => undefined);
          }
        }
        return callbackOperation.then(onfulfilled, onrejected);
      },
    });
  };

  try {
    const credentialOperation = Promise.resolve(
      options.consumeAccessToken(
        Object.freeze({
          purpose: CREDENTIAL_PURPOSE,
          audience: ACCESS_TOKEN_AUDIENCE,
          scope: CLOUD_PLATFORM_SCOPE,
          expectedPrincipal: RUNTIME_SERVICE_ACCOUNT,
          timeoutMs: REQUEST_TIMEOUT_MS,
          signal,
        }),
        consumer,
      ),
    );
    void credentialOperation.catch(() => undefined);
    await settleBeforeAbort(credentialOperation, signal);
  } finally {
    callbackOpen = false;
  }
  if (
    callbackViolation ||
    callbackFailure ||
    callbackCount !== 1 ||
    !callbackStarted ||
    !callbackSettled ||
    !wrapped
  ) {
    throw unavailable();
  }
  requireNotAborted(signal);
  return wrapped;
}

async function rawEncrypt(
  fetchRequest: FetchRequest,
  input: ParsedWrapInput,
  accessToken: string,
  signal: AbortSignal,
): Promise<WrappedResult> {
  requireNotAborted(signal);
  const plaintextCrc32c = calculateCrc32c(input.plaintextDataEncryptionKey);
  const additionalAuthenticatedDataCrc32c = calculateCrc32c(
    input.additionalAuthenticatedData,
  );
  const body = encodeJson({
    plaintext: encodeBase64(input.plaintextDataEncryptionKey),
    additionalAuthenticatedData: encodeBase64(
      input.additionalAuthenticatedData,
    ),
    plaintextCrc32c: String(plaintextCrc32c),
    additionalAuthenticatedDataCrc32c: String(
      additionalAuthenticatedDataCrc32c,
    ),
  });
  const url = `${KMS_ORIGIN}/v1/${input.kmsKeyVersionResource}:rawEncrypt`;
  let responseValue: unknown;
  try {
    const fetchOperation = Promise.resolve(
      fetchRequest(
        Object.freeze({
          method: "POST" as const,
          url,
          headers: Object.freeze({
            accept: "application/json",
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          }),
          body,
          redirect: "ERROR" as const,
          automaticRetries: 0 as const,
          timeoutMs: REQUEST_TIMEOUT_MS,
          maximumResponseBytes: RESPONSE_BODY_MAXIMUM_BYTES,
          signal,
        }),
      ),
    );
    void fetchOperation.catch(() => undefined);
    const boundedFetchOperation = settleBeforeAbort(fetchOperation, signal);
    let responseClaimed = false;
    let lateResponseSettled = false;
    let lateResponseScrubbed = false;
    let lateResponseValue: unknown;
    const scrubLateResponse = () => {
      if (
        responseClaimed ||
        !lateResponseSettled ||
        lateResponseScrubbed
      ) {
        return;
      }
      lateResponseScrubbed = true;
      scrubTransportResponseBodyBestEffort(lateResponseValue);
    };
    signal.addEventListener("abort", scrubLateResponse, { once: true });
    const lateResponseCleanup = fetchOperation.then(
      (lateResponse) => {
        lateResponseSettled = true;
        lateResponseValue = lateResponse;
        if (signal.aborted) scrubLateResponse();
      },
      () => undefined,
    );
    void lateResponseCleanup.catch(() => undefined);
    try {
      responseValue = await boundedFetchOperation;
      responseClaimed = true;
    } finally {
      signal.removeEventListener("abort", scrubLateResponse);
    }
  } finally {
    body.fill(0);
  }

  const response = parseJsonResponse(responseValue, url);
  return parseRawEncryptResponse(response, input.kmsKeyVersionResource);
}

function parseJsonResponse(value: unknown, expectedUrl: string) {
  let rawBody: Uint8Array | undefined;
  let body: Uint8Array | undefined;
  try {
    const response = exactDataRecord(value, [
      "status",
      "contentType",
      "responseUrl",
      "redirected",
      "body",
    ]);
    if (
      response.body instanceof Uint8Array &&
      !nodeTypes.isProxy(response.body)
    ) {
      rawBody = response.body;
    }
    if (
      response.status !== 200 ||
      response.responseUrl !== expectedUrl ||
      response.redirected !== false ||
      typeof response.contentType !== "string" ||
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        response.contentType,
      )
    ) {
      throw unavailable();
    }
    body = requireBytes(response.body, RESPONSE_BODY_MAXIMUM_BYTES);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return requirePlainDataRecord(JSON.parse(decoded));
  } catch {
    throw unavailable();
  } finally {
    if (body !== undefined) scrubBytes(body);
    if (rawBody !== undefined) scrubBytes(rawBody);
  }
}

function parseRawEncryptResponse(
  value: unknown,
  expectedKmsKeyVersionResource: string,
): WrappedResult {
  const response = exactDataRecordWithOptional(
    value,
    [
      "ciphertext",
      "initializationVector",
      "tagLength",
      "ciphertextCrc32c",
      "initializationVectorCrc32c",
      "verifiedPlaintextCrc32c",
      "verifiedAdditionalAuthenticatedDataCrc32c",
      "name",
      "protectionLevel",
    ],
    ["verifiedInitializationVectorCrc32c"],
  );
  if (
    response.name !== expectedKmsKeyVersionResource ||
    response.protectionLevel !== "SOFTWARE" ||
    response.tagLength !== RAW_AES_GCM_TAG_BYTES ||
    response.verifiedPlaintextCrc32c !== true ||
    response.verifiedAdditionalAuthenticatedDataCrc32c !== true ||
    (Object.hasOwn(response, "verifiedInitializationVectorCrc32c") &&
      response.verifiedInitializationVectorCrc32c !== false)
  ) {
    throw unavailable();
  }

  const ciphertext = decodeCanonicalBase64(
    response.ciphertext,
    RAW_AES_GCM_CIPHERTEXT_BYTES,
  );
  const initializationVector = decodeCanonicalBase64(
    response.initializationVector,
    RAW_AES_GCM_IV_BYTES,
  );
  try {
    const ciphertextCrc32c = requireMatchingCrc32c(
      response.ciphertextCrc32c,
      ciphertext,
    );
    const initializationVectorCrc32c = requireMatchingCrc32c(
      response.initializationVectorCrc32c,
      initializationVector,
    );
    const wrappedDataEncryptionKey = new TextEncoder().encode(
      stringifyCaresLinkV1CanonicalJson({
        formatVersion:
          CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAPPED_DATA_KEY_FORMAT_VERSION,
        method: "cryptoKeyVersions.rawEncrypt",
        algorithm: "AES_256_GCM",
        kmsKeyVersionResource: expectedKmsKeyVersionResource,
        protectionLevel: "SOFTWARE",
        initializationVectorBase64url: encodeBase64url(initializationVector),
        initializationVectorCrc32c: String(initializationVectorCrc32c),
        tagLengthBytes: RAW_AES_GCM_TAG_BYTES,
        ciphertextBase64url: encodeBase64url(ciphertext),
        ciphertextCrc32c: String(ciphertextCrc32c),
      }),
    );
    if (
      wrappedDataEncryptionKey.byteLength === 0 ||
      wrappedDataEncryptionKey.byteLength >
        WRAPPED_DATA_ENCRYPTION_KEY_MAXIMUM_BYTES
    ) {
      wrappedDataEncryptionKey.fill(0);
      throw unavailable();
    }
    return Object.freeze({
      kmsKeyVersionResource: expectedKmsKeyVersionResource,
      wrappedDataEncryptionKey,
    });
  } finally {
    ciphertext.fill(0);
    initializationVector.fill(0);
  }
}

function createDeadline(rootSignal: AbortSignal): Deadline {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  if (rootSignal.aborted) abort();
  else rootSignal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
  timeout.unref?.();
  let closed = false;
  return Object.freeze({
    signal: controller.signal,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timeout);
      rootSignal.removeEventListener("abort", abort);
      abort();
    },
  });
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

function requireFrozenCallable<T extends (...args: never[]) => unknown>(
  value: unknown,
  method: string,
): T {
  const object = exactDataRecord(value, [method]);
  const callable = object[method];
  if (
    !Object.isFrozen(value) ||
    typeof callable !== "function" ||
    nodeTypes.isProxy(callable)
  ) {
    throw unavailable();
  }
  return callable as T;
}

function requireNumericKmsKeyVersionResource(value: unknown) {
  if (
    typeof value !== "string" ||
    !NUMERIC_KMS_KEY_VERSION_RESOURCE_PATTERN.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function validateBrandedKeyVersionPostureAttestation(
  value: unknown,
  expectedKmsKeyVersionResource: string,
  minimumRemainingMs: number,
) {
  if (
    value === null ||
    typeof value !== "object" ||
    !KEY_VERSION_POSTURE_ATTESTATIONS.has(value)
  ) {
    throw unavailable();
  }
  parseKeyVersionPostureAttestation(
    value,
    expectedKmsKeyVersionResource,
    Date.now(),
    minimumRemainingMs,
    true,
  );
  return value as CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation;
}

function parseKeyVersionPostureAttestation(
  value: unknown,
  expectedKmsKeyVersionResource: string | undefined,
  nowMs: number,
  minimumRemainingMs: number,
  requireFrozen: boolean,
): CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation {
  const object = exactDataRecord(value, [
    "attestationVersion",
    "status",
    "kmsKeyVersionResource",
    "purpose",
    "algorithm",
    "protectionLevel",
    "state",
    "observedAt",
    "expiresAt",
    "controlPlaneEvidenceSha256",
    "rawKeyMaterialPresent",
  ]);
  const kmsKeyVersionResource = requireNumericKmsKeyVersionResource(
    object.kmsKeyVersionResource,
  );
  const observedAt = requireCanonicalTimestamp(object.observedAt);
  const expiresAt = requireCanonicalTimestamp(object.expiresAt);
  const observedAtMs = Date.parse(observedAt);
  const expiresAtMs = Date.parse(expiresAt);
  const controlPlaneEvidenceSha256 = requireSha256(
    object.controlPlaneEvidenceSha256,
  );
  if (
    (requireFrozen && !Object.isFrozen(value)) ||
    object.attestationVersion !==
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION ||
    object.status !==
      "VERIFIED_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_NOT_APPROVED" ||
    (expectedKmsKeyVersionResource !== undefined &&
      kmsKeyVersionResource !== expectedKmsKeyVersionResource) ||
    object.purpose !== "RAW_ENCRYPT_DECRYPT" ||
    object.algorithm !== "AES_256_GCM" ||
    object.protectionLevel !== "SOFTWARE" ||
    object.state !== "ENABLED" ||
    object.rawKeyMaterialPresent !== false ||
    observedAtMs > nowMs ||
    nowMs - observedAtMs > KEY_VERSION_POSTURE_MAXIMUM_LIFETIME_MS ||
    expiresAtMs <= nowMs + minimumRemainingMs ||
    expiresAtMs - observedAtMs > KEY_VERSION_POSTURE_MAXIMUM_LIFETIME_MS
  ) {
    throw unavailable();
  }
  return Object.freeze({
    attestationVersion:
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION,
    status:
      "VERIFIED_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_NOT_APPROVED" as const,
    kmsKeyVersionResource,
    purpose: "RAW_ENCRYPT_DECRYPT" as const,
    algorithm: "AES_256_GCM" as const,
    protectionLevel: "SOFTWARE" as const,
    state: "ENABLED" as const,
    observedAt,
    expiresAt,
    controlPlaneEvidenceSha256,
    rawKeyMaterialPresent: false as const,
  });
}

function requireCanonicalTimestamp(value: unknown) {
  const milliseconds =
    typeof value === "string" && TIMESTAMP_PATTERN.test(value)
      ? Date.parse(value)
      : Number.NaN;
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw unavailable();
  }
  return value as string;
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireAccessToken(value: unknown) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > ACCESS_TOKEN_MAXIMUM_BYTES ||
    !ACCESS_TOKEN_PATTERN.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireCredential(value: unknown) {
  const credential = exactDataRecord(value, [
    "accessToken",
    "expiresAt",
    "principal",
  ]);
  if (credential.principal !== RUNTIME_SERVICE_ACCOUNT) {
    throw unavailable();
  }
  const accessToken = requireAccessToken(credential.accessToken);
  const expiresAt = requireFutureTimestamp(credential.expiresAt);
  return Object.freeze({
    accessToken,
    expiresAt,
    principal: RUNTIME_SERVICE_ACCOUNT,
  });
}

function requireFutureTimestamp(value: unknown) {
  const milliseconds =
    typeof value === "string" && TIMESTAMP_PATTERN.test(value)
      ? Date.parse(value)
      : Number.NaN;
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value ||
    milliseconds <= Date.now() + ACCESS_TOKEN_MINIMUM_REMAINING_MS ||
    milliseconds > Date.now() + ACCESS_TOKEN_MAXIMUM_LIFETIME_MS
  ) {
    throw unavailable();
  }
  return value as string;
}

function calculateCrc32c(value: Uint8Array) {
  const checksum = crc32c.calculate(value);
  if (
    !Number.isInteger(checksum) ||
    checksum < 0 ||
    checksum > 0xffff_ffff
  ) {
    throw unavailable();
  }
  return checksum;
}

function requireMatchingCrc32c(value: unknown, data: Uint8Array) {
  const checksum = requireCanonicalUint32String(value);
  if (checksum !== calculateCrc32c(data)) throw unavailable();
  return checksum;
}

function requireCanonicalUint32String(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,9})$/.test(value)) {
    throw unavailable();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 0xffff_ffff) {
    throw unavailable();
  }
  return parsed;
}

function requireBytes(value: unknown, maximumBytes: number) {
  if (
    nodeTypes.isProxy(value) ||
    !(value instanceof Uint8Array) ||
    value.byteLength === 0 ||
    value.byteLength > maximumBytes
  ) {
    throw unavailable();
  }
  return Uint8Array.from(value);
}

function scrubBytes(value: Uint8Array) {
  try {
    Uint8Array.prototype.fill.call(value, 0);
  } catch {
    throw unavailable();
  }
}

function scrubTransportResponseBodyBestEffort(value: unknown) {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      nodeTypes.isProxy(value)
    ) {
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, "body");
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      nodeTypes.isProxy(descriptor.value) ||
      !(descriptor.value instanceof Uint8Array)
    ) {
      return;
    }
    scrubBytes(descriptor.value);
  } catch {
    // A late provider result has no caller to fail; never surface its content
    // or turn cleanup failure into an unhandled rejection.
  }
}

function requireExactBytes(value: unknown, exactBytes: number) {
  const bytes = requireBytes(value, exactBytes);
  if (bytes.byteLength !== exactBytes) {
    bytes.fill(0);
    throw unavailable();
  }
  return bytes;
}

function encodeJson(value: unknown) {
  const body = new TextEncoder().encode(JSON.stringify(value));
  if (body.byteLength > REQUEST_BODY_MAXIMUM_BYTES) {
    body.fill(0);
    throw unavailable();
  }
  return body;
}

function encodeBase64(value: Uint8Array) {
  const buffer = Buffer.from(value);
  try {
    return buffer.toString("base64");
  } finally {
    buffer.fill(0);
  }
}

function encodeBase64url(value: Uint8Array) {
  const buffer = Buffer.from(value);
  try {
    return buffer.toString("base64url");
  } finally {
    buffer.fill(0);
  }
}

function decodeCanonicalBase64(value: unknown, exactBytes: number) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(exactBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw unavailable();
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.byteLength !== exactBytes ||
    decoded.toString("base64") !== value
  ) {
    decoded.fill(0);
    throw unavailable();
  }
  const bytes = Uint8Array.from(decoded);
  decoded.fill(0);
  return bytes;
}

function exactDataRecordWithOptional(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
) {
  const object = requirePlainDataRecord(value);
  const actualKeys = Object.getOwnPropertyNames(object);
  if (
    requiredKeys.some((key) => !actualKeys.includes(key)) ||
    actualKeys.some(
      (key) => !requiredKeys.includes(key) && !optionalKeys.includes(key),
    )
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
    Object.getPrototypeOf(value) !== Object.prototype ||
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

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

const FIXED_FAILURE = Object.freeze({
  code: "GENERATION_FAILED" as const,
  message: "Google Cloud KMS data-key wrapping is unavailable" as const,
});

function unavailable() {
  return FIXED_FAILURE;
}
