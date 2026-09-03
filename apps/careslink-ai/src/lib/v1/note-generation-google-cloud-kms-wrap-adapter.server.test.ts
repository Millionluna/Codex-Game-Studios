import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_KMS_WRAP_ADAPTER,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAP_ADAPTER_READY,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAPPED_DATA_KEY_FORMAT_VERSION,
  createCaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation,
  createCaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapter,
  type CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential,
  type CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenRequest,
  type CaresLinkV1NoteGenerationGoogleCloudKmsFetchRequest,
  type CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation,
} from "./note-generation-google-cloud-kms-wrap-adapter.server";
import type { CaresLinkV1NoteGenerationDataKeyWrapPort } from "./note-generation-encrypted-payload-stager.server";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KMS_KEY_VERSION_RESOURCE =
  "projects/careslink-m1u-security/locations/australia-southeast1/keyRings/careslink-preview/cryptoKeys/payload-envelope/cryptoKeyVersions/7";
const NEXT_KMS_KEY_VERSION_RESOURCE = KMS_KEY_VERSION_RESOURCE.replace(
  "/cryptoKeyVersions/7",
  "/cryptoKeyVersions/8",
);
const WRONG_PROJECT_KMS_KEY_VERSION_RESOURCE = KMS_KEY_VERSION_RESOURCE.replace(
  "/careslink-m1u-security/",
  "/other-security-project/",
);
const WRONG_REGION_KMS_KEY_VERSION_RESOURCE = KMS_KEY_VERSION_RESOURCE.replace(
  "/australia-southeast1/",
  "/us-central1/",
);
const RUNTIME_SERVICE_ACCOUNT =
  "careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com";
const ACCESS_TOKEN = "impersonated-access-token-test-only";
const DEK = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const AAD = encoder.encode(
  '{"purpose":"communication-note-test","requestHash":"abc"}',
);
const CIPHERTEXT = Uint8Array.from(
  { length: 48 },
  (_, index) => (index + 101) % 256,
);
const INITIALIZATION_VECTOR = Uint8Array.from(
  { length: 12 },
  (_, index) => index + 201,
);
const FIXED_FAILURE = Object.freeze({
  code: "GENERATION_FAILED",
  message: "Google Cloud KMS data-key wrapping is unavailable",
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Communication Note Google Cloud KMS wrap adapter", () => {
  it("stays server-only and default-off while exposing an injected stager port", () => {
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAP_ADAPTER_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_KMS_WRAP_ADAPTER,
    ).toBeUndefined();
    const harness = createHarness();
    const compatible: CaresLinkV1NoteGenerationDataKeyWrapPort =
      harness.adapter;
    expect(compatible.wrapDataEncryptionKey).toEqual(expect.any(Function));

    const source = readFileSync(
      new URL(
        "./note-generation-google-cloud-kms-wrap-adapter.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).toContain(":rawEncrypt");
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|@google-cloud\/kms|GoogleAuth|GOOGLE_APPLICATION_CREDENTIALS|serviceAccountJson|private_key|console\.|\blogger\b|cryptoKeys\/[^\s]*:encrypt\b/i,
    );

    const controller = new AbortController();
    expect(() =>
      createCaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapter({
        fetchPort: { fetch: vi.fn() },
        credentialPort: Object.freeze({ consumeAccessToken: vi.fn() }),
        expectedKmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
        rootAbortSignal: controller.signal,
      }),
    ).toThrowError(FIXED_FAILURE);
  });

  it("requires a branded, fresh, exact-version AES-256-GCM SOFTWARE ENABLED posture", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T04:00:00.000Z"));
    const attestation = posture();
    expect(attestation).toEqual({
      attestationVersion:
        CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION,
      status: "VERIFIED_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_NOT_APPROVED",
      kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
      purpose: "RAW_ENCRYPT_DECRYPT",
      algorithm: "AES_256_GCM",
      protectionLevel: "SOFTWARE",
      state: "ENABLED",
      observedAt: "2026-09-03T04:00:00.000Z",
      expiresAt: "2026-09-03T04:01:00.000Z",
      controlPlaneEvidenceSha256: "a".repeat(64),
      rawKeyMaterialPresent: false,
    });

    expect(() =>
      createHarness({ postureValue: { ...attestation } }),
    ).toThrowError(FIXED_FAILURE);
    expect(() =>
      createHarness({
        postureValue: posture({
          kmsKeyVersionResource: NEXT_KMS_KEY_VERSION_RESOURCE,
        }),
      }),
    ).toThrowError(FIXED_FAILURE);
    for (const override of [
      { kmsKeyVersionResource: WRONG_PROJECT_KMS_KEY_VERSION_RESOURCE },
      { kmsKeyVersionResource: WRONG_REGION_KMS_KEY_VERSION_RESOURCE },
      { purpose: "ENCRYPT_DECRYPT" },
      { algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION" },
      { protectionLevel: "HSM" },
      { state: "DISABLED" },
      { observedAt: "2026-09-03T04:00:00.001Z" },
      { expiresAt: "2026-09-03T04:06:00.001Z" },
      { controlPlaneEvidenceSha256: "not-a-digest" },
      { rawKeyMaterialPresent: true },
    ]) {
      expect(() => posture(override)).toThrowError(FIXED_FAILURE);
    }

    const expiring = posture({
      expiresAt: "2026-09-03T04:00:06.000Z",
    });
    const harness = createHarness({ postureValue: expiring });
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(
      harness.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.consumeAccessToken).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it("wraps a 32-byte DEK with exact-version rawEncrypt and a canonical self-describing envelope", async () => {
    const originalDek = Uint8Array.from(DEK);
    const originalAad = Uint8Array.from(AAD);
    const harness = createHarness();

    const result = await harness.adapter.wrapDataEncryptionKey(wrapInput());

    expect(DEK).toEqual(originalDek);
    expect(AAD).toEqual(originalAad);
    expect(Object.keys(result).sort()).toEqual([
      "kmsKeyVersionResource",
      "wrappedDataEncryptionKey",
    ]);
    expect(result.kmsKeyVersionResource).toBe(KMS_KEY_VERSION_RESOURCE);
    expect(result.wrappedDataEncryptionKey).toBeInstanceOf(Uint8Array);
    expect(harness.credentialRequests).toHaveLength(1);
    expect(harness.credentialRequests[0]).toMatchObject({
      purpose: "CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAP",
      audience: "https://cloudkms.googleapis.com/",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      expectedPrincipal: RUNTIME_SERVICE_ACCOUNT,
      timeoutMs: 5_000,
    });
    expect(harness.credentialRequests[0]?.signal).toBeInstanceOf(AbortSignal);

    expect(harness.requests).toHaveLength(1);
    const request = harness.requests[0];
    expect(request).toMatchObject({
      method: "POST",
      url: `https://cloudkms.googleapis.com/v1/${KMS_KEY_VERSION_RESOURCE}:rawEncrypt`,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ACCESS_TOKEN}`,
        "content-type": "application/json",
      },
      redirect: "ERROR",
      automaticRetries: 0,
      timeoutMs: 5_000,
      maximumResponseBytes: 64 * 1_024,
    });
    expect(JSON.parse(decoder.decode(request.body))).toEqual({
      plaintext: Buffer.from(DEK).toString("base64"),
      additionalAuthenticatedData: Buffer.from(AAD).toString("base64"),
      plaintextCrc32c: String(crc32c.calculate(DEK)),
      additionalAuthenticatedDataCrc32c: String(crc32c.calculate(AAD)),
    });
    expect(harness.retainedRequestBodies[0]).toEqual(
      new Uint8Array(harness.retainedRequestBodies[0]?.byteLength),
    );
    expect(harness.retainedResponseBodies).toHaveLength(1);
    expect(harness.retainedResponseBodies[0]).toEqual(
      new Uint8Array(harness.retainedResponseBodies[0]?.byteLength),
    );

    const envelopeText = decoder.decode(result.wrappedDataEncryptionKey);
    const envelope = JSON.parse(envelopeText);
    expect(envelope).toEqual({
      formatVersion:
        CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_WRAPPED_DATA_KEY_FORMAT_VERSION,
      method: "cryptoKeyVersions.rawEncrypt",
      algorithm: "AES_256_GCM",
      kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
      protectionLevel: "SOFTWARE",
      initializationVectorBase64url: Buffer.from(
        INITIALIZATION_VECTOR,
      ).toString("base64url"),
      initializationVectorCrc32c: String(
        crc32c.calculate(INITIALIZATION_VECTOR),
      ),
      tagLengthBytes: 16,
      ciphertextBase64url: Buffer.from(CIPHERTEXT).toString("base64url"),
      ciphertextCrc32c: String(crc32c.calculate(CIPHERTEXT)),
    });
    expect(envelopeText).toBe(
      stringifyCaresLinkV1CanonicalJson(envelope),
    );
    expect(envelopeText).not.toContain(ACCESS_TOKEN);
    expect(envelopeText).not.toContain(Buffer.from(DEK).toString("base64"));
  });

  it("rejects aliases, cross-key numeric versions and malformed key material before credential or HTTP access", async () => {
    const harness = createHarness();
    const invalidInputs: unknown[] = [
      wrapInput({
        kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE.replace(
          "/cryptoKeyVersions/7",
          "/cryptoKeyVersions/latest",
        ),
      }),
      wrapInput({ kmsKeyVersionResource: NEXT_KMS_KEY_VERSION_RESOURCE }),
      wrapInput({
        kmsKeyVersionResource: WRONG_PROJECT_KMS_KEY_VERSION_RESOURCE,
      }),
      wrapInput({ kmsKeyVersionResource: WRONG_REGION_KMS_KEY_VERSION_RESOURCE }),
      wrapInput({ plaintextDataEncryptionKey: DEK.slice(0, 31) }),
      wrapInput({ additionalAuthenticatedData: new Uint8Array() }),
      wrapInput({
        additionalAuthenticatedData: new Uint8Array(64 * 1_024 + 1),
      }),
      { ...wrapInput(), unexpected: true },
    ];

    for (const input of invalidInputs) {
      await expect(
        harness.adapter.wrapDataEncryptionKey(input as never),
      ).rejects.toMatchObject(FIXED_FAILURE);
    }
    expect(harness.consumeAccessToken).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it("requires a fresh exact-principal credential and sanitizes custody failures", async () => {
    const sentinel = "RAW_CREDENTIAL_PROVIDER_FAILURE";
    const credentials: unknown[] = [
      { ...credential(), accessToken: "short" },
      { ...credential(), accessToken: `${ACCESS_TOKEN}\nsmuggled` },
      { ...credential(), principal: "other@example.iam.gserviceaccount.com" },
      { ...credential(), expiresAt: new Date(Date.now() - 1_000).toISOString() },
      { ...credential(), expiresAt: new Date(Date.now() + 5_000).toISOString() },
      {
        ...credential(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString(),
      },
    ];
    for (const credentialValue of credentials) {
      const harness = createHarness({ credentialValue });
      await expect(
        harness.adapter.wrapDataEncryptionKey(wrapInput()),
      ).rejects.toMatchObject(FIXED_FAILURE);
      expect(harness.fetch).not.toHaveBeenCalled();
    }

    const throwing = createHarness({ credentialFailure: sentinel });
    let failure: unknown;
    try {
      await throwing.adapter.wrapDataEncryptionKey(wrapInput());
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(FIXED_FAILURE);
    expect(JSON.stringify(failure)).not.toContain(sentinel);
    expect(JSON.stringify(failure)).not.toContain(ACCESS_TOKEN);
  });

  it("requires exactly one awaited credential callback per wrap", async () => {
    const noCallback = createHarness({ callbackMode: "NONE" });
    await expect(
      noCallback.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(noCallback.fetch).not.toHaveBeenCalled();

    const duplicate = createHarness({ callbackMode: "TWICE" });
    await expect(
      duplicate.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(duplicate.fetch).toHaveBeenCalledTimes(1);
  });

  it("never sends HTTP for an unawaited credential callback", async () => {
    const harness = createHarness({ callbackMode: "UNAWAITED" });
    await expect(
      harness.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it("makes a callback arriving after the credential deadline inert and non-rejecting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T04:00:00.000Z"));
    const harness = createHarness({ callbackMode: "LATE_AFTER_TIMEOUT" });
    const pending = expect(
      harness.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;

    expect(harness.deferredConsumers).toHaveLength(1);
    await expect(
      Promise.resolve(harness.deferredConsumers[0]?.(credential())),
    ).resolves.toBeUndefined();
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["wrong resource", { name: NEXT_KMS_KEY_VERSION_RESOURCE }],
    ["wrong protection", { protectionLevel: "HSM" }],
    ["wrong tag length", { tagLength: 15 }],
    ["unverified plaintext CRC", { verifiedPlaintextCrc32c: false }],
    [
      "unverified AAD CRC",
      { verifiedAdditionalAuthenticatedDataCrc32c: false },
    ],
    ["claimed request IV verification", { verifiedInitializationVectorCrc32c: true }],
    ["bad ciphertext CRC", { ciphertextCrc32c: "0" }],
    ["bad IV CRC", { initializationVectorCrc32c: "0" }],
    ["numeric CRC JSON", { ciphertextCrc32c: crc32c.calculate(CIPHERTEXT) }],
    [
      "wrong ciphertext size",
      { ciphertext: Buffer.from(CIPHERTEXT.slice(0, 47)).toString("base64") },
    ],
    [
      "wrong IV size",
      {
        initializationVector: Buffer.from(
          INITIALIZATION_VECTOR.slice(0, 11),
        ).toString("base64"),
      },
    ],
  ])("rejects a %s rawEncrypt response", async (_label, override) => {
    const harness = createHarness({ responseOverride: override });
    await expect(
      harness.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.retainedResponseBodies[0]).toEqual(
      new Uint8Array(harness.retainedResponseBodies[0]?.byteLength),
    );
  });

  it("rejects unknown rawEncrypt fields and malformed HTTP responses", async () => {
    const extraField = createHarness({ responseOverride: { plaintext: "leak" } });
    await expect(
      extraField.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(extraField.retainedResponseBodies[0]).toEqual(
      new Uint8Array(extraField.retainedResponseBodies[0]?.byteLength),
    );

    for (const httpOverride of [
      { status: 500 },
      { contentType: "text/plain" },
      { responseUrl: "https://attacker.invalid/redirect" },
      { redirected: true },
      { body: new Uint8Array(64 * 1_024 + 1) },
      { body: Uint8Array.from([0xff, 0xfe]) },
    ]) {
      const harness = createHarness({ httpOverride });
      await expect(
        harness.adapter.wrapDataEncryptionKey(wrapInput()),
      ).rejects.toMatchObject(FIXED_FAILURE);
      expect(harness.retainedResponseBodies[0]).toEqual(
        new Uint8Array(harness.retainedResponseBodies[0]?.byteLength),
      );
    }
  });

  it("propagates root abort before credential access and enforces one absolute five-second deadline", async () => {
    const beforeAccess = createHarness();
    beforeAccess.controller.abort("secret abort reason");
    await expect(
      beforeAccess.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(beforeAccess.consumeAccessToken).not.toHaveBeenCalled();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T04:00:00.000Z"));
    const hanging = createHarness({ hangFetch: true });
    const pending = expect(
      hanging.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(hanging.retainedRequestBodies[0]?.some((byte) => byte !== 0)).toBe(
      true,
    );
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(hanging.requests[0]?.signal.aborted).toBe(true);
    expect(hanging.retainedRequestBodies[0]).toEqual(
      new Uint8Array(hanging.retainedRequestBodies[0]?.byteLength),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("consumes and clears a transport response that settles after the deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T04:00:00.000Z"));
    const harness = createHarness({ lateFetch: true });
    const pending = expect(
      harness.adapter.wrapDataEncryptionKey(wrapInput()),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(harness.retainedResponseBodies).toHaveLength(0);

    harness.releaseLateFetch();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.retainedResponseBodies).toHaveLength(1);
    expect(harness.retainedResponseBodies[0]).toEqual(
      new Uint8Array(harness.retainedResponseBodies[0]?.byteLength),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

type HarnessOptions = Readonly<{
  credentialValue?: unknown;
  credentialFailure?: string;
  callbackMode?:
    | "ONCE"
    | "NONE"
    | "TWICE"
    | "UNAWAITED"
    | "LATE_AFTER_TIMEOUT";
  postureValue?: unknown;
  responseOverride?: Readonly<Record<string, unknown>>;
  httpOverride?: Readonly<Record<string, unknown>>;
  hangFetch?: boolean;
  lateFetch?: boolean;
}>;

type CredentialConsumer = (
  value: CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential,
) => PromiseLike<void>;

function createHarness(options: HarnessOptions = {}) {
  const controller = new AbortController();
  const requests: CaresLinkV1NoteGenerationGoogleCloudKmsFetchRequest[] = [];
  const retainedRequestBodies: Uint8Array[] = [];
  const retainedResponseBodies: Uint8Array[] = [];
  const credentialRequests: CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenRequest[] = [];
  const deferredConsumers: CredentialConsumer[] = [];
  let releaseLateFetch: (() => void) | undefined;
  const fetch = vi.fn(
    async (request: CaresLinkV1NoteGenerationGoogleCloudKmsFetchRequest) => {
      retainedRequestBodies.push(request.body);
      requests.push({
        ...request,
        headers: { ...request.headers },
        body: Uint8Array.from(request.body),
      });
      if (options.hangFetch) {
        return new Promise<never>(() => undefined);
      }
      if (options.lateFetch) {
        return new Promise<unknown>((resolve) => {
          releaseLateFetch = () => {
            const response = gcpResponse(
              request,
              options.responseOverride,
              options.httpOverride,
            );
            retainResponseBody(response, retainedResponseBodies);
            resolve(response);
          };
        });
      }
      const response = gcpResponse(
        request,
        options.responseOverride,
        options.httpOverride,
      );
      retainResponseBody(response, retainedResponseBodies);
      return response;
    },
  );
  const fetchPort = Object.freeze({ fetch });
  const consumeAccessToken = vi.fn(
    async (
      request: unknown,
      consumer: (
        value: CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential,
      ) => PromiseLike<void>,
    ) => {
      credentialRequests.push(
        request as CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenRequest,
      );
      if (options.credentialFailure) {
        throw new Error(options.credentialFailure);
      }
      if (options.callbackMode === "NONE") return;
      if (options.callbackMode === "UNAWAITED") {
        void consumer(
          (options.credentialValue ?? credential()) as
            CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential,
        );
        return;
      }
      if (options.callbackMode === "LATE_AFTER_TIMEOUT") {
        deferredConsumers.push(consumer);
        return new Promise<never>(() => undefined);
      }
      await consumer(
        (options.credentialValue ?? credential()) as
          CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential,
      );
      if (options.callbackMode === "TWICE") {
        try {
          await consumer(credential());
        } catch {
          // A malicious custody port may suppress the replay error.
        }
      }
    },
  );
  const credentialPort = Object.freeze({ consumeAccessToken });
  const adapter = createCaresLinkV1NoteGenerationGoogleCloudKmsWrapAdapter({
    fetchPort,
    credentialPort,
    expectedKmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
    keyVersionPostureAttestation: options.postureValue ?? posture(),
    rootAbortSignal: controller.signal,
  });
  return {
    adapter,
    controller,
    fetch,
    consumeAccessToken,
    requests,
    retainedRequestBodies,
    retainedResponseBodies,
    credentialRequests,
    deferredConsumers,
    releaseLateFetch() {
      if (releaseLateFetch === undefined) throw new Error("no late response");
      const release = releaseLateFetch;
      releaseLateFetch = undefined;
      release();
    },
  };
}

function retainResponseBody(value: unknown, retained: Uint8Array[]) {
  if (
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "body")
  ) {
    const body = (value as Readonly<{ body: unknown }>).body;
    if (body instanceof Uint8Array) retained.push(body);
  }
}

function posture(
  override: Readonly<Record<string, unknown>> = {},
): CaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation {
  const observedAt = new Date(Date.now()).toISOString();
  return createCaresLinkV1NoteGenerationGoogleCloudKmsKeyVersionPostureAttestation(
    {
      attestationVersion:
        CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_ATTESTATION_VERSION,
      status: "VERIFIED_GOOGLE_CLOUD_KMS_KEY_VERSION_POSTURE_NOT_APPROVED",
      kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
      purpose: "RAW_ENCRYPT_DECRYPT",
      algorithm: "AES_256_GCM",
      protectionLevel: "SOFTWARE",
      state: "ENABLED",
      observedAt,
      expiresAt: new Date(Date.now() + 60 * 1_000).toISOString(),
      controlPlaneEvidenceSha256: "a".repeat(64),
      rawKeyMaterialPresent: false,
      ...override,
    },
  );
}

function credential(): CaresLinkV1NoteGenerationGoogleCloudKmsAccessTokenCredential {
  return Object.freeze({
    accessToken: ACCESS_TOKEN,
    expiresAt: new Date(Date.now() + 30 * 60 * 1_000).toISOString(),
    principal: RUNTIME_SERVICE_ACCOUNT,
  });
}

function wrapInput(
  override: Readonly<Record<string, unknown>> = {},
) {
  return {
    kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
    plaintextDataEncryptionKey: DEK,
    additionalAuthenticatedData: AAD,
    ...override,
  };
}

function gcpResponse(
  request: CaresLinkV1NoteGenerationGoogleCloudKmsFetchRequest,
  responseOverride: Readonly<Record<string, unknown>> = {},
  httpOverride: Readonly<Record<string, unknown>> = {},
) {
  const response = {
    ciphertext: Buffer.from(CIPHERTEXT).toString("base64"),
    initializationVector: Buffer.from(INITIALIZATION_VECTOR).toString("base64"),
    tagLength: 16,
    ciphertextCrc32c: String(crc32c.calculate(CIPHERTEXT)),
    initializationVectorCrc32c: String(crc32c.calculate(INITIALIZATION_VECTOR)),
    verifiedPlaintextCrc32c: true,
    verifiedAdditionalAuthenticatedDataCrc32c: true,
    name: KMS_KEY_VERSION_RESOURCE,
    protectionLevel: "SOFTWARE",
    ...responseOverride,
  };
  return Object.freeze({
    status: 200,
    contentType: "application/json; charset=utf-8",
    responseUrl: request.url,
    redirected: false,
    body: encoder.encode(JSON.stringify(response)),
    ...httpOverride,
  });
}
