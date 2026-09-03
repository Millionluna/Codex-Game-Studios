import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_NOTE_GENERATION_FORMAL_GCS_PRIVATE_OBJECT_STORE,
  CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_READY,
  CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_SOURCE_POLICY,
  createCaresLinkV1NoteGenerationGcsPrivateObjectStore,
  type CaresLinkV1NoteGenerationGcsHttpsRequest,
} from "./note-generation-encrypted-payload-gcs-private-object-store.server";
import type { CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject } from "./note-generation-encrypted-payload-stager.server";

vi.mock("server-only", () => ({}));

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PROJECT_ID = "careslink-m1u-security";
const LOCATION = "australia-southeast1";
const RUNTIME_PRINCIPAL =
  "careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com";
const BUCKET = "careslink-m2a-private";
const PREFIX = "communication-note/v1";
const NOW = "2026-09-03T03:00:00.000Z";
const BACKUP_DISPOSITION_VERSION = "no-soft-delete.2026-09-03.v1";
const LIFECYCLE_POLICY_VERSION = "payload-expiry-maintenance.2026-09-03.v1";
const LIFECYCLE_RULES_HASH = sha256("lifecycle-rules-v1");
const OWNER_HASH = sha256("owner-1");
const IDEMPOTENCY_HASH = sha256("idempotency-1");
const DELETE_BINDING_HASH = sha256("delete-binding-1");
const SECOND_DELETE_BINDING_HASH = sha256("delete-binding-2");
const EXPECTED_OBJECT_NAME =
  `${PREFIX}/payloads/${OWNER_HASH}/${IDEMPOTENCY_HASH}.json`;
const ACCESS_TOKEN = "ya29.test-only-access-token-never-log";

afterEach(() => {
  vi.useRealTimers();
});

describe("Communication Note encrypted payload GCS private object store", () => {
  it("is server-only/default-off and rejects any unproved bucket posture", () => {
    expect(CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_READY).toBe(
      false,
    );
    expect(
      CARESLINK_V1_NOTE_GENERATION_FORMAL_GCS_PRIVATE_OBJECT_STORE,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_SOURCE_POLICY,
    ).toMatchObject({
      ready: false,
      sourceOnly: true,
      exactProjectId: PROJECT_ID,
      exactBucketLocation: LOCATION,
      exactRuntimePrincipal: RUNTIME_PRINCIPAL,
      exactBackupDispositionVersion: BACKUP_DISPOSITION_VERSION,
      conditionalCreateIfGenerationMatch: "0",
      deleteDisposition: "SAME_OBJECT_CAS_TOMBSTONE",
      softDeleteRetentionSecondsRequired: 0,
      objectVersioningRequired: false,
      retentionPolicyAllowed: false,
      objectHoldsAllowed: false,
      protectionSettingsPropagationMinimumMs: 30_000,
      historicalNoncurrentObjectVersionsRequiredAbsent: true,
      historicalSoftDeletedObjectVersionsRequiredAbsent: true,
      bucketPostureDeploymentEvidencePresent: false,
      deploymentApproved: false,
      activationApproved: false,
    });

    const harness = createHarness();
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options({
          posture: { softDeleteRetentionSeconds: 604_800 },
        }),
      ),
    ).toThrowError(safeError());
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options({
          posture: { objectVersioningEnabled: true },
        }),
      ),
    ).toThrowError(safeError());
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options({
          posture: {
            protectionSettingsEffectiveAt: "2026-09-03T02:58:45.000Z",
          },
        }),
      ),
    ).toThrowError(safeError());
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options({
          posture: { noncurrentObjectVersionsAbsent: false },
        }),
      ),
    ).toThrowError(safeError());
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options({
          posture: { softDeletedObjectVersionsAbsent: false },
        }),
      ),
    ).toThrowError(safeError());
    const missingHistoryEvidenceOptions = harness.options();
    const incompletePosture = {
      ...missingHistoryEvidenceOptions.bucketPostureAttestation,
    } as Record<string, unknown>;
    delete incompletePosture.softDeletedObjectVersionsAbsent;
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore({
        ...missingHistoryEvidenceOptions,
        bucketPostureAttestation: incompletePosture,
      }),
    ).toThrowError(safeError());
    const driftedObservationOptions = harness.options();
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore({
        ...driftedObservationOptions,
        bucketPostureAttestation: {
          ...driftedObservationOptions.bucketPostureAttestation,
          observedAt: "2026-09-03T02:59:01.000Z",
        },
      }),
    ).toThrowError(safeError());
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options({ policy: { projectId: "other-project" } }),
      ),
    ).toThrowError(safeError());
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options({ policy: { bucketLocation: "us-central1" } }),
      ),
    ).toThrowError(safeError());
    expect(() =>
      createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options({
          policy: {
            backupDispositionVersion: "no-soft-delete.2026-09-03.v2",
          },
        }),
      ),
    ).toThrowError(safeError());

    const source = readFileSync(
      new URL(
        "./note-generation-encrypted-payload-gcs-private-object-store.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(
      /process\.env|@google-cloud\/storage|node:https|\bfetch\s*\(|console\.|createBucket|model\.generate/i,
    );
  });

  it("conditionally creates only the derived allowlisted object with CRC32C and injected credentials", async () => {
    const harness = createHarness();
    const adapter = harness.adapter();
    const object = privateObject();

    await expect(
      adapter.createIfAbsent({ namespace: namespace(), object }),
    ).resolves.toEqual({ status: "CREATED" });

    expect(harness.credentialRequests).toHaveLength(1);
    expect(harness.credentialRequests[0]).toMatchObject({
      purpose: "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_OPERATION",
      projectId: PROJECT_ID,
      runtimePrincipal: RUNTIME_PRINCIPAL,
      audience: "https://storage.googleapis.com/",
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
      bucket: BUCKET,
      requiredPermissionSetHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(harness.credentialRequests[0].signal).toBeInstanceOf(AbortSignal);
    expect(harness.credentialRequests[0].signal).not.toBe(
      harness.controller.signal,
    );
    const upload = harness.requests[0];
    expect(upload.method).toBe("POST");
    expect(upload.url).toBe(
      `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart&ifGenerationMatch=0&fields=${encodeURIComponent(
        "bucket,name,generation,metageneration,size,crc32c,contentType,cacheControl,metadata,temporaryHold,eventBasedHold",
      )}`,
    );
    expect(upload.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(upload.headers["content-type"]).toBe(
      'multipart/related; boundary="===============careslink_m2a_gcs_private_object=="',
    );
    expect(upload.redirect).toBe("ERROR");
    expect(upload.automaticRetries).toBe(0);
    expect(upload.timeoutMs).toBe(5_000);
    expect(upload.signal).not.toBe(harness.controller.signal);
    const multipart = parseMultipart(upload);
    expect(multipart.metadata).toEqual({
      cacheControl: "no-store",
      contentType: "application/json",
      crc32c: crc32cBase64(multipart.objectBody),
      metadata: {
        careslinkBackupDispositionVersion: BACKUP_DISPOSITION_VERSION,
        careslinkBodySha256: sha256(multipart.objectBody),
        careslinkDeleteBindingHash: DELETE_BINDING_HASH,
        careslinkLocatorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        careslinkObjectKind: "SEALED_PAYLOAD",
      },
      name: EXPECTED_OBJECT_NAME,
    });
    expect(JSON.parse(decoder.decode(multipart.objectBody))).toEqual(object);
    expect(Object.keys((await adapter.createIfAbsent({
      namespace: namespace({ idempotencyHash: sha256("another") }),
      object: privateObject({ deleteBindingHash: sha256("another-delete") }),
    })) as object)).toEqual(["status"]);
    expect(
      harness.rawRequestBodies.every((body) =>
        body.every((byte) => byte === 0),
      ),
    ).toBe(true);
    expect(
      harness.rawResponseBodies.every((body) =>
        body.every((byte) => byte === 0),
      ),
    ).toBe(true);
  });

  it("reads only the pinned generation/metageneration and verifies locator, SHA-256 and CRC32C", async () => {
    const harness = createHarness();
    const adapter = harness.adapter();
    const object = privateObject();
    await adapter.createIfAbsent({ namespace: namespace(), object });
    harness.requests.length = 0;

    await expect(adapter.read(namespace())).resolves.toEqual({
      status: "FOUND",
      object,
    });
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[0].url).toContain(
      `/storage/v1/b/${BUCKET}/o/${encodeURIComponent(EXPECTED_OBJECT_NAME)}?projection=noAcl`,
    );
    expect(harness.requests[1].url).toBe(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(EXPECTED_OBJECT_NAME)}?alt=media&generation=1&ifGenerationMatch=1&ifMetagenerationMatch=1`,
    );
    expect(harness.requests.every((request) =>
      new URL(request.url).origin === "https://storage.googleapis.com",
    )).toBe(true);

    harness.liveObject()!.crc32c = crc32cBase64(encoder.encode("tampered"));
    await expect(adapter.read(namespace())).rejects.toEqual(safeError());
  });

  it("replays an existing create and prevents resurrection after same-path CAS tombstoning", async () => {
    const harness = createHarness();
    const adapter = harness.adapter();
    const object = privateObject();
    await adapter.createIfAbsent({ namespace: namespace(), object });

    await expect(
      adapter.createIfAbsent({ namespace: namespace(), object }),
    ).resolves.toEqual({ status: "EXISTS", object });
    const generationBeforeDelete = harness.liveObject()!.generation;
    harness.requests.length = 0;
    await expect(
      adapter.deleteIfBindingMatches({
        namespace: namespace(),
        deleteBindingHash: DELETE_BINDING_HASH,
      }),
    ).resolves.toEqual({ status: "DELETED" });

    const casUpload = harness.requests.find(
      (request) => request.method === "POST",
    );
    expect(casUpload?.url).toContain(
      `ifGenerationMatch=${generationBeforeDelete}&ifMetagenerationMatch=1`,
    );
    expect(harness.liveObject()?.metadata.careslinkObjectKind).toBe(
      "DELETED_TOMBSTONE",
    );
    const tombstoneBody = JSON.parse(
      decoder.decode(harness.liveObject()!.body),
    ) as Record<string, unknown>;
    expect(tombstoneBody).toMatchObject({
      formatVersion:
        "careslink.communication-note.encrypted-payload.tombstone.v1",
      deleteBindingHash: DELETE_BINDING_HASH,
      backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
      lifecyclePolicyVersion: LIFECYCLE_POLICY_VERSION,
    });
    expect(JSON.stringify(tombstoneBody)).not.toContain(
      object.ciphertextBase64url,
    );
    await expect(adapter.read(namespace())).resolves.toEqual({
      status: "TOMBSTONED",
    });
    await expect(
      adapter.createIfAbsent({ namespace: namespace(), object }),
    ).resolves.toEqual({ status: "TOMBSTONED" });
    expect(
      harness.requests.every(
        (request) => (request.method as string) !== "DELETE",
      ),
    )
      .toBe(true);
  });

  it("recovers exact create/delete outcomes after upload response loss", async () => {
    const harness = createHarness();
    const adapter = harness.adapter();
    harness.loseNextSuccessfulUploadResponse = true;
    await expect(
      adapter.createIfAbsent({
        namespace: namespace(),
        object: privateObject(),
      }),
    ).resolves.toEqual({ status: "EXISTS", object: privateObject() });
    harness.loseNextSuccessfulUploadResponse = true;

    await expect(
      adapter.deleteIfBindingMatches({
        namespace: namespace(),
        deleteBindingHash: DELETE_BINDING_HASH,
      }),
    ).resolves.toEqual({ status: "ALREADY_DELETED" });
    await expect(
      adapter.deleteIfBindingMatches({
        namespace: namespace(),
        deleteBindingHash: DELETE_BINDING_HASH,
      }),
    ).resolves.toEqual({ status: "ALREADY_DELETED" });
    await expect(
      adapter.deleteIfBindingMatches({
        namespace: namespace(),
        deleteBindingHash: SECOND_DELETE_BINDING_HASH,
      }),
    ).resolves.toEqual({ status: "BINDING_MISMATCH" });
  });

  it("does not treat a bare 404 as deletion proof and never writes on a binding mismatch", async () => {
    const missingHarness = createHarness();
    await expect(
      missingHarness.adapter().deleteIfBindingMatches({
        namespace: namespace(),
        deleteBindingHash: DELETE_BINDING_HASH,
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    const harness = createHarness();
    const adapter = harness.adapter();
    await adapter.createIfAbsent({
      namespace: namespace(),
      object: privateObject(),
    });
    harness.requests.length = 0;
    await expect(
      adapter.deleteIfBindingMatches({
        namespace: namespace(),
        deleteBindingHash: SECOND_DELETE_BINDING_HASH,
      }),
    ).resolves.toEqual({ status: "BINDING_MISMATCH" });
    expect(harness.requests.filter((request) => request.method === "POST"))
      .toHaveLength(0);
  });

  it("fails closed on locator, canonical-body, size, credential and DTO drift without leaking payloads", async () => {
    const harness = createHarness();
    const adapter = harness.adapter();
    const object = privateObject();
    await adapter.createIfAbsent({ namespace: namespace(), object });

    harness.liveObject()!.metadata.careslinkLocatorHash = sha256(
      "wrong-locator",
    );
    await expect(adapter.read(namespace())).rejects.toEqual(safeError());

    const canonicalHarness = createHarness();
    const canonicalAdapter = canonicalHarness.adapter();
    await canonicalAdapter.createIfAbsent({
      namespace: namespace(),
      object,
    });
    canonicalHarness.appendWhitespaceAndRehash();
    await expect(canonicalAdapter.read(namespace())).rejects.toEqual(
      safeError(),
    );

    const huge = privateObject({
      wrappedDataEncryptionKeyBase64url: Buffer.alloc(
        64 * 1_024 + 1,
        7,
      ).toString("base64url"),
    });
    await expect(
      canonicalAdapter.createIfAbsent({ namespace: namespace(), object: huge }),
    ).rejects.toEqual(safeError());
    await expect(
      (canonicalAdapter.read as (input: unknown) => Promise<unknown>)({
        ...namespace(),
        bucket: "attacker-bucket",
      }),
    ).rejects.toEqual(safeError());

    const secret = "participant plaintext must never escape";
    const failureHarness = createHarness();
    failureHarness.throwEveryRequest = new Error(
      `${secret}:${ACCESS_TOKEN}:${EXPECTED_OBJECT_NAME}`,
    );
    const error = await failureHarness.adapter().read(namespace()).catch(
      (caught: unknown) => caught,
    );
    expect(error).toEqual(safeError());
    expect(JSON.stringify(error)).not.toMatch(
      /participant plaintext|ya29|communication-note\/v1|careslink-m2a-private/,
    );

    const credentialHarness = createHarness();
    credentialHarness.credentialOverrides = {
      runtimePrincipal: "attacker@example.invalid",
    };
    await expect(credentialHarness.adapter().read(namespace())).rejects.toEqual(
      safeError(),
    );
    expect(credentialHarness.requests).toHaveLength(0);

    const shortTokenHarness = createHarness();
    shortTokenHarness.credentialOverrides = {
      expiresAt: "2026-09-03T03:00:10.000Z",
    };
    await expect(shortTokenHarness.adapter().read(namespace())).rejects.toEqual(
      safeError(),
    );
    expect(shortTokenHarness.requests).toHaveLength(0);

    const reusedReferenceHarness = createHarness();
    reusedReferenceHarness.credentialOverrides = {
      credentialReferenceHash: sha256("fixed-single-use-reference"),
    };
    const reusedReferenceAdapter = reusedReferenceHarness.adapter();
    await expect(reusedReferenceAdapter.read(namespace())).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(reusedReferenceAdapter.read(namespace())).rejects.toEqual(
      safeError(),
    );
  });

  it("enforces credential and HTTPS deadlines even when injected ports hang", async () => {
    vi.useFakeTimers();
    const credentialHarness = createHarness();
    credentialHarness.hangNextCredential = true;
    const credentialOperation = credentialHarness.adapter().read(namespace());
    const credentialRejection = expect(credentialOperation).rejects.toEqual(
      safeError(),
    );
    await vi.advanceTimersByTimeAsync(5_001);
    await credentialRejection;
    expect(credentialHarness.lastCredentialSignal?.aborted).toBe(true);
    expect(credentialHarness.requests).toHaveLength(0);

    const harness = createHarness();
    harness.hangNextRequest = true;
    const operation = harness.adapter().read(namespace());
    const rejection = expect(operation).rejects.toEqual(safeError());
    await vi.advanceTimersByTimeAsync(5_001);

    await rejection;
    expect(harness.lastLiveTransportSignal?.aborted).toBe(true);
    expect(
      harness.rawRequestBodies.every((body) =>
        body.every((byte) => byte === 0),
      ),
    ).toBe(true);

    const lateHarness = createHarness();
    lateHarness.returnNextResponseAfterTimeout = true;
    const lateOperation = lateHarness.adapter().read(namespace());
    const lateRejection = expect(lateOperation).rejects.toEqual(safeError());
    await vi.advanceTimersByTimeAsync(5_001);
    await lateRejection;
    expect(lateHarness.lateResponseBody).toBeDefined();
    expect(lateHarness.lateResponseBody?.some((byte) => byte !== 0)).toBe(true);
    lateHarness.resolveLateResponse?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(lateHarness.lateResponseBody?.every((byte) => byte === 0)).toBe(true);
  });
});

type StoredObject = {
  name: string;
  generation: string;
  metageneration: string;
  body: Uint8Array;
  crc32c: string;
  metadata: Record<string, string>;
};

type RequestSnapshot = Omit<CaresLinkV1NoteGenerationGcsHttpsRequest, "body"> & {
  body: Uint8Array;
};

type HarnessOptionsOverrides = Readonly<{
  policy?: Readonly<Record<string, unknown>>;
  posture?: Readonly<Record<string, unknown>>;
}>;

function createHarness() {
  const controller = new AbortController();
  const requests: RequestSnapshot[] = [];
  const rawRequestBodies: Uint8Array[] = [];
  const rawResponseBodies: Uint8Array[] = [];
  const credentialRequests: Array<Record<string, unknown>> = [];
  const objects = new Map<string, StoredObject>();
  let nextGeneration = 1;
  let credentialOrdinal = 0;

  const harness = {
    controller,
    requests,
    rawRequestBodies,
    rawResponseBodies,
    credentialRequests,
    objects,
    loseNextSuccessfulUploadResponse: false,
    hangNextRequest: false,
    returnNextResponseAfterTimeout: false,
    lateResponseBody: undefined as Uint8Array | undefined,
    resolveLateResponse: undefined as (() => void) | undefined,
    throwEveryRequest: undefined as Error | undefined,
    credentialOverrides: undefined as Record<string, unknown> | undefined,
    hangNextCredential: false,
    lastCredentialSignal: undefined as AbortSignal | undefined,
    lastLiveTransportSignal: undefined as AbortSignal | undefined,
    options(overrides: HarnessOptionsOverrides = {}) {
      const policy = {
        projectId: PROJECT_ID,
        bucket: BUCKET,
        bucketLocation: LOCATION,
        objectPrefix: PREFIX,
        lifecyclePolicyVersion: LIFECYCLE_POLICY_VERSION,
        lifecycleRulesHash: LIFECYCLE_RULES_HASH,
        backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
        ...overrides.policy,
      };
      const postureWithoutHash = {
        projectId: PROJECT_ID,
        bucket: BUCKET,
        bucketLocation: LOCATION,
        observedAt: "2026-09-03T02:59:00.000Z",
        expiresAt: "2026-09-03T03:04:00.000Z",
        uniformBucketLevelAccessEnabled: true,
        publicAccessPrevention: "enforced",
        softDeleteRetentionSeconds: 0,
        objectVersioningEnabled: false,
        protectionSettingsEffectiveAt: "2026-09-03T02:58:00.000Z",
        noncurrentObjectVersionsAbsent: true,
        softDeletedObjectVersionsAbsent: true,
        retentionPolicyPresent: false,
        defaultEventBasedHold: false,
        objectRetentionEnabled: false,
        lifecyclePolicyVersion: LIFECYCLE_POLICY_VERSION,
        lifecycleRulesHash: LIFECYCLE_RULES_HASH,
        backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
        ...overrides.posture,
      };
      const bucketPostureAttestation = {
        ...postureWithoutHash,
        postureEvidenceHash: canonicalSha256({
          purpose: "CARESLINK_V1_COMMUNICATION_NOTE_GCS_BUCKET_POSTURE",
          ...postureWithoutHash,
        }),
      };
      return {
        policy,
        bucketPostureAttestation,
        clock: () => NOW,
        credentialPort,
        httpsTransport,
        signal: controller.signal,
      };
    },
    adapter() {
      return createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
        harness.options(),
      );
    },
    liveObject() {
      return objects.get(EXPECTED_OBJECT_NAME);
    },
    appendWhitespaceAndRehash() {
      const stored = harness.liveObject();
      if (!stored) throw new Error("missing fixture object");
      stored.body = encoder.encode(`${decoder.decode(stored.body)} `);
      stored.crc32c = crc32cBase64(stored.body);
      stored.metadata.careslinkBodySha256 = sha256(stored.body);
    },
  };

  const credentialPort = Object.freeze({
    getAccessToken: vi.fn(async (input: unknown) => {
      const signal = (input as { signal: AbortSignal }).signal;
      harness.lastCredentialSignal = signal;
      const request = structuredCloneWithoutSignal(
        input as Record<string, unknown>,
      );
      credentialRequests.push(request);
      if (harness.hangNextCredential) {
        harness.hangNextCredential = false;
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("credential port observed abort")),
            { once: true },
          );
        });
      }
      credentialOrdinal += 1;
      return Object.freeze({
        purpose:
          "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_OPERATION",
        projectId: PROJECT_ID,
        runtimePrincipal: RUNTIME_PRINCIPAL,
        accessToken: ACCESS_TOKEN,
        issuedAt: "2026-09-03T02:59:30.000Z",
        expiresAt: "2026-09-03T03:30:00.000Z",
        bucket: BUCKET,
        requiredPermissionSetHash: (
          input as { requiredPermissionSetHash: string }
        ).requiredPermissionSetHash,
        credentialReferenceHash: sha256(
          `credential-reference-${credentialOrdinal}`,
        ),
        ...harness.credentialOverrides,
      });
    }),
  });

  const httpsTransport = Object.freeze({
    request: vi.fn(async (request: CaresLinkV1NoteGenerationGcsHttpsRequest) => {
      rawRequestBodies.push(request.body);
      harness.lastLiveTransportSignal = request.signal;
      requests.push({ ...request, body: Uint8Array.from(request.body) });
      if (harness.throwEveryRequest) throw harness.throwEveryRequest;
      if (harness.hangNextRequest) {
        harness.hangNextRequest = false;
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener(
            "abort",
            () => reject(new Error("transport observed abort")),
            { once: true },
          );
        });
      }
      if (harness.returnNextResponseAfterTimeout) {
        harness.returnNextResponseAfterTimeout = false;
        const body = encoder.encode("late transport response must be cleared");
        harness.lateResponseBody = body;
        rawResponseBodies.push(body);
        return new Promise((resolve) => {
          harness.resolveLateResponse = () =>
            resolve(
              Object.freeze({
                status: 500,
                contentType: "application/json",
                responseUrl: request.url,
                redirected: false as const,
                body,
              }),
            );
        });
      }
      const url = new URL(request.url);
      if (request.method === "POST") {
        const multipart = parseMultipart(request);
        const metadata = multipart.metadata as {
          name: string;
          contentType: string;
          cacheControl: string;
          crc32c: string;
          metadata: Record<string, string>;
        };
        const current = objects.get(metadata.name);
        const ifGenerationMatch = url.searchParams.get("ifGenerationMatch");
        const ifMetagenerationMatch = url.searchParams.get(
          "ifMetagenerationMatch",
        );
        if (
          (ifGenerationMatch === "0" && current !== undefined) ||
          (ifGenerationMatch !== "0" &&
            (!current ||
              current.generation !== ifGenerationMatch ||
              current.metageneration !== ifMetagenerationMatch))
        ) {
          return trackResponse(response(request.url, 412, {}));
        }
        const stored: StoredObject = {
          name: metadata.name,
          generation: String(nextGeneration),
          metageneration: "1",
          body: Uint8Array.from(multipart.objectBody),
          crc32c: metadata.crc32c,
          metadata: { ...metadata.metadata },
        };
        nextGeneration += 1;
        objects.set(metadata.name, stored);
        if (harness.loseNextSuccessfulUploadResponse) {
          harness.loseNextSuccessfulUploadResponse = false;
          throw new Error("synthetic response loss after CAS commit");
        }
        return trackResponse(metadataResponse(request.url, stored));
      }
      const objectName = objectNameFromUrl(url);
      const current = objects.get(objectName);
      if (!current) return trackResponse(response(request.url, 404, {}));
      if (url.searchParams.get("alt") === "media") {
        if (
          url.searchParams.get("generation") !== current.generation ||
          url.searchParams.get("ifGenerationMatch") !== current.generation ||
          url.searchParams.get("ifMetagenerationMatch") !==
            current.metageneration
        ) {
          return response(request.url, 412, {});
        }
        return trackResponse(Object.freeze({
          status: 200,
          contentType: "application/json",
          responseUrl: request.url,
          redirected: false as const,
          body: Uint8Array.from(current.body),
        }));
      }
      return trackResponse(metadataResponse(request.url, current));
    }),
  });

  function trackResponse<T extends Readonly<{ body: Uint8Array }>>(value: T) {
    rawResponseBodies.push(value.body);
    return value;
  }

  return harness;
}

function metadataResponse(url: string, stored: StoredObject) {
  return response(url, 200, {
    bucket: BUCKET,
    name: stored.name,
    generation: stored.generation,
    metageneration: stored.metageneration,
    size: String(stored.body.byteLength),
    crc32c: stored.crc32c,
    contentType: "application/json",
    cacheControl: "no-store",
    metadata: stored.metadata,
    temporaryHold: false,
    eventBasedHold: false,
  });
}

function response(url: string, status: number, value: unknown) {
  return Object.freeze({
    status,
    contentType: "application/json; charset=utf-8",
    responseUrl: url,
    redirected: false as const,
    body: encoder.encode(JSON.stringify(value)),
  });
}

function objectNameFromUrl(url: URL) {
  const marker = "/o/";
  const index = url.pathname.indexOf(marker);
  if (index < 0) throw new Error("unexpected object URL");
  return decodeURIComponent(url.pathname.slice(index + marker.length));
}

function parseMultipart(request: Readonly<{
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}>) {
  const contentType = request.headers["content-type"];
  const boundary = contentType?.match(
    /^multipart\/related; boundary="([^"]+)"$/,
  )?.[1];
  if (!boundary) throw new Error("missing multipart boundary");
  const parts = decoder.decode(request.body).split(`--${boundary}`);
  if (parts.length !== 4 || parts[0] !== "" || parts[3] !== "--\r\n") {
    throw new Error("invalid multipart body");
  }
  const metadataText = multipartPartBody(parts[1]);
  const objectText = multipartPartBody(parts[2]);
  return {
    metadata: JSON.parse(metadataText) as Record<string, unknown>,
    objectBody: encoder.encode(objectText),
  };
}

function multipartPartBody(part: string) {
  const separator = part.indexOf("\r\n\r\n");
  if (separator < 0 || !part.endsWith("\r\n")) {
    throw new Error("invalid multipart part");
  }
  return part.slice(separator + 4, -2);
}

function privateObject(
  overrides: Partial<CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject> = {},
): CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject {
  return {
    formatVersion: "careslink.communication-note.encrypted-payload.v1",
    createdAt: NOW,
    requestBindingHash: sha256("request-binding"),
    retentionSeconds: 600,
    maximumCleanedFactsCanonicalBytes: 64 * 1_024,
    receipt: {
      jobId: "11111111-1111-4111-8111-111111111111",
      payloadId: "22222222-2222-4222-8222-222222222222",
      payloadHandleHash: sha256("payload-handle"),
      payloadExpiresAt: "2026-09-03T03:10:00.000Z",
      payloadPolicyVersion: "payload-policy.2026-09-03.v1",
      payloadPolicySnapshotHash: sha256("policy-snapshot"),
      encryptionProfileVersion: "aes-256-gcm-envelope.2026-09-03.v1",
      kmsKeyVersionResourceHash: sha256("kms-version"),
      backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
    },
    kmsKeyVersionResource:
      "projects/careslink-m1u-security/locations/australia-southeast1/keyRings/careslink-preview/cryptoKeys/payload-envelope/cryptoKeyVersions/7",
    aadCanonicalBase64url: Buffer.from("canonical-aad").toString("base64url"),
    aadSha256: sha256("canonical-aad"),
    ivBase64url: Buffer.alloc(12, 1).toString("base64url"),
    ciphertextBase64url: Buffer.from("sealed-payload").toString("base64url"),
    authenticationTagBase64url: Buffer.alloc(16, 2).toString("base64url"),
    wrappedDataEncryptionKeyBase64url: Buffer.alloc(32, 3).toString(
      "base64url",
    ),
    sealedPayloadSha256: sha256("sealed-payload"),
    deleteBindingHash: DELETE_BINDING_HASH,
    ...overrides,
  };
}

function namespace(overrides: Partial<{
  ownerUserIdHash: string;
  idempotencyHash: string;
}> = {}) {
  return {
    ownerUserIdHash: OWNER_HASH,
    idempotencyHash: IDEMPOTENCY_HASH,
    ...overrides,
  };
}

function structuredCloneWithoutSignal(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      child instanceof AbortSignal ? child : structuredClone(child),
    ]),
  );
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function crc32cBase64(value: Uint8Array) {
  const output = Buffer.alloc(4);
  output.writeUInt32BE(crc32c.calculate(value) >>> 0, 0);
  return output.toString("base64");
}

function safeError() {
  return expect.objectContaining({
    code: "GENERATION_FAILED",
    message: "Encrypted payload private storage is unavailable",
  });
}
