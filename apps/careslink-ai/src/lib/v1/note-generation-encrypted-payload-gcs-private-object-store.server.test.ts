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
  type CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest,
  type CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer,
  type CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest,
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

afterEach(() => {
  vi.useRealTimers();
});

describe("Communication Note encrypted payload GCS private object store", () => {
  it("performs no authority, network or timer work on cold import", async () => {
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      const coldModule = await import(
        "./note-generation-encrypted-payload-gcs-private-object-store.server"
      );
      expect(
        coldModule.CARESLINK_V1_NOTE_GENERATION_GCS_PRIVATE_OBJECT_STORE_READY,
      ).toBe(false);
      expect(
        coldModule.CARESLINK_V1_NOTE_GENERATION_FORMAL_GCS_PRIVATE_OBJECT_STORE,
      ).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(timeoutSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      timeoutSpy.mockRestore();
    }
  });

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
      authorizedOperationDelivery:
        "SYNCHRONOUS_CALLBACK_DIRECT_RETURN_ONE_LOGICAL_OPERATION",
      rawCredentialDtoReturned: false,
      rawAuthorizationHeaderAccepted: false,
      authorizedSessionRequestCapabilityOnly: true,
      perAdapterAuthorizedSessionIdentityReplayRejected: true,
      perAdapterAuthorizedRequestFunctionIdentityReplayRejected: true,
      callbackResultOpaque: true,
      callbackPromiseAssimilationAllowed: false,
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
    expect(source).not.toMatch(
      /\baccessToken\b|authorization\s*:|Bearer\s+\$\{|\bcredentialPort\b|\bhttpsTransport\b|\bgetAccessToken\b|\bcredentialReferenceHash\b/,
    );
  });

  it("conditionally creates only the derived allowlisted object through one tokenless authorized session", async () => {
    const harness = createHarness();
    const adapter = harness.adapter();
    const object = privateObject();

    await expect(
      adapter.createIfAbsent({ namespace: namespace(), object }),
    ).resolves.toEqual({ status: "CREATED" });

    expect(harness.authorityRequests).toHaveLength(1);
    expect(harness.authorityRequests[0]).toMatchObject({
      purpose: "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_OPERATION",
      projectId: PROJECT_ID,
      bucketLocation: LOCATION,
      runtimePrincipal: RUNTIME_PRINCIPAL,
      audience: "https://storage.googleapis.com/",
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
      bucket: BUCKET,
      requiredPermissionSetHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      operationTimeoutMs: 30_000,
      requestTimeoutMs: 5_000,
    });
    expect(Object.getOwnPropertyNames(harness.authorityRequests[0])).toEqual([
      "purpose",
      "projectId",
      "bucketLocation",
      "runtimePrincipal",
      "audience",
      "scope",
      "bucket",
      "requiredPermissionSetHash",
      "operationTimeoutMs",
      "requestTimeoutMs",
      "signal",
    ]);
    expect(
      Object.values(
        Object.getOwnPropertyDescriptors(harness.authorityRequests[0]),
      ).every(
        (descriptor) => descriptor.enumerable && "value" in descriptor,
      ),
    ).toBe(true);
    expect(Object.isFrozen(harness.authorityRequests[0])).toBe(true);
    expect(harness.authorityRequests[0].signal).toBeInstanceOf(AbortSignal);
    expect(harness.authorityRequests[0].signal).not.toBe(
      harness.controller.signal,
    );
    expect(JSON.stringify(harness.authorityRequests[0])).not.toMatch(
      /token|authorization|bearer|credentialReference/i,
    );
    expect(harness.sessions).toHaveLength(1);
    expect(Object.keys(harness.sessions[0])).toEqual(["request"]);
    expect(Object.isFrozen(harness.sessions[0])).toBe(true);
    const upload = harness.requests[0];
    expect(upload.method).toBe("POST");
    expect(upload.url).toBe(
      `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart&ifGenerationMatch=0&fields=${encodeURIComponent(
        "bucket,name,generation,metageneration,size,crc32c,contentType,cacheControl,metadata,temporaryHold,eventBasedHold",
      )}`,
    );
    expect(upload.accept).toBe("application/json");
    expect(Object.hasOwn(upload, "headers")).toBe(false);
    expect(upload.contentType).toBe(
      'multipart/related; boundary="===============careslink_m2a_gcs_private_object=="',
    );
    expect(upload.contentLength).toBe(String(upload.body.byteLength));
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
      `https://storage.googleapis.com/download/storage/v1/b/${BUCKET}/o/${encodeURIComponent(EXPECTED_OBJECT_NAME)}?alt=media&generation=1&ifGenerationMatch=1&ifMetagenerationMatch=1`,
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
    expect(harness.authorityRequests).toHaveLength(1);
    expect(harness.requests).toHaveLength(3);
    expect(new Set(harness.requestSessionIds).size).toBe(1);

    harness.requests.length = 0;
    harness.requestSessionIds.length = 0;
    harness.loseNextSuccessfulUploadResponse = true;

    await expect(
      adapter.deleteIfBindingMatches({
        namespace: namespace(),
        deleteBindingHash: DELETE_BINDING_HASH,
      }),
    ).resolves.toEqual({ status: "ALREADY_DELETED" });
    expect(harness.authorityRequests).toHaveLength(2);
    expect(harness.requests).toHaveLength(5);
    expect(new Set(harness.requestSessionIds).size).toBe(1);
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

  it("fails closed on locator, canonical-body, size, authority and DTO drift without leaking payloads", async () => {
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
    failureHarness.authorityFailure = new Error(
      `${secret}:provider-secret:${EXPECTED_OBJECT_NAME}`,
    );
    const error = await failureHarness.adapter().read(namespace()).catch(
      (caught: unknown) => caught,
    );
    expect(error).toEqual(safeError());
    expect(JSON.stringify(error)).not.toMatch(
      /participant plaintext|provider-secret|communication-note\/v1|careslink-m2a-private/,
    );
    expect(failureHarness.requests).toHaveLength(0);

    const transportFailure = createHarness();
    transportFailure.throwEveryRequest = new Error(
      `${secret}:provider-secret:${privateObject().ciphertextBase64url}`,
    );
    const transportError = await transportFailure
      .adapter()
      .createIfAbsent({ namespace: namespace(), object: privateObject() })
      .catch((caught: unknown) => caught);
    expect(transportError).toEqual(safeError());
    expect(JSON.stringify(transportError)).not.toMatch(
      /participant plaintext|provider-secret|c2VhbGVkLXBheWxvYWQ/,
    );
    expect(transportFailure.requests[0]?.method).toBe("POST");
    expect(
      transportFailure.rawRequestBodies[0]?.every((byte) => byte === 0),
    ).toBe(true);
  });

  it.each([
    "NONE",
    "TWICE",
    "UNAWAITED",
    "THEN_BEFORE_RETURN",
    "PROMISE_RESOLVE_BEFORE_RETURN",
    "ASYNC_AWAIT",
    "ASYNC_RETURN",
    "REJECTED_WRAPPER_WITH_POISONED_CATCH",
    "DIFFERENT_THENABLE",
    "DIFFERENT_PROXY",
    "THROW_AFTER_CALLBACK",
  ] as const)(
    "fails before GCS I/O when the authority handshake is %s",
    async (authorityMode) => {
      const harness = createHarness();
      harness.authorityMode = authorityMode;
      await expect(harness.adapter().read(namespace())).rejects.toEqual(
        safeError(),
      );
      expect(harness.requests).toHaveLength(0);
      expect(harness.thenableGetterReads).toBe(0);
      expect(harness.thenableCalls).toBe(0);
      expect(harness.proxyTrapCount).toBe(0);
    },
  );

  it.each([
    "UNFROZEN",
    "EXTRA_KEY",
    "NONFUNCTION",
    "ACCESSOR",
    "PROXY",
    "SAME_AS_AUTHORITY",
  ] as const)(
    "rejects an invalid %s authorized session before GCS I/O",
    async (sessionMode) => {
      const harness = createHarness();
      harness.sessionMode = sessionMode;
      await expect(harness.adapter().read(namespace())).rejects.toEqual(
        safeError(),
      );
      expect(harness.requests).toHaveLength(0);
      expect(harness.authorityRequests).toHaveLength(1);
      expect(harness.sessionAccessorReads).toBe(0);
      expect(harness.proxyTrapCount).toBe(0);
    },
  );

  it("makes competing, completed and late authority callbacks inert", async () => {
    const competing = createHarness();
    competing.authorityMode = "RETAIN_AFTER_RETURN";
    const pending = competing.adapter().read(namespace());
    await Promise.resolve();
    expect(competing.retainedOperations).toHaveLength(1);
    const competingAdoption = Promise.resolve(competing.retainedOperations[0]);
    await expect(pending).rejects.toEqual(safeError());
    await expect(competingAdoption).resolves.toBeUndefined();
    expect(competing.requests).toHaveLength(0);

    const completed = createHarness();
    completed.authorityMode = "RETAIN_AFTER_RETURN";
    await expect(completed.adapter().read(namespace())).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(completed.requests).toHaveLength(1);
    await expect(
      Promise.resolve(completed.retainedOperations[0]),
    ).resolves.toBeUndefined();
    expect(completed.requests).toHaveLength(1);
    await expect(
      Promise.resolve(
        completed.retainedConsumers[0]?.(completed.sessions[0]),
      ),
    ).resolves.toBeUndefined();
    expect(completed.requests).toHaveLength(1);

    const late = createHarness();
    late.authorityMode = "LATE_AFTER_RETURN";
    await expect(late.adapter().read(namespace())).rejects.toEqual(safeError());
    expect(late.deferredConsumers).toHaveLength(1);
    await expect(
      Promise.resolve(late.deferredConsumers[0]?.(late.sessions[0])),
    ).resolves.toBeUndefined();
    expect(late.requests).toHaveLength(0);
  });

  it("uses one isolated authority session per complete logical operation", async () => {
    const harness = createHarness();
    const adapter = harness.adapter();
    await adapter.createIfAbsent({
      namespace: namespace(),
      object: privateObject(),
    });
    harness.requests.length = 0;
    harness.requestSessionIds.length = 0;
    const authorityCount = harness.authorityRequests.length;

    await expect(adapter.read(namespace())).resolves.toMatchObject({
      status: "FOUND",
    });
    expect(harness.authorityRequests).toHaveLength(authorityCount + 1);
    expect(harness.requests).toHaveLength(2);
    expect(new Set(harness.requestSessionIds).size).toBe(1);
    expect(harness.lastAuthoritySignal?.aborted).toBe(true);
    expect(harness.requests.every((request) => request.signal.aborted)).toBe(
      true,
    );

    harness.requests.length = 0;
    harness.requestSessionIds.length = 0;
    await Promise.all([adapter.read(namespace()), adapter.read(namespace())]);
    expect(harness.requests).toHaveLength(4);
    const concurrentSessionIds = new Set(harness.requestSessionIds);
    expect(concurrentSessionIds.size).toBe(2);
    for (const sessionId of concurrentSessionIds) {
      expect(
        harness.requestSessionIds.filter((value) => value === sessionId),
      ).toHaveLength(2);
    }
  });

  it("rejects sequential and concurrent session or request-function identity replay", async () => {
    for (const replayKind of ["SESSION", "REQUEST"] as const) {
      const sequential = createHarness();
      if (replayKind === "SESSION") sequential.reuseFirstSession = true;
      else sequential.reuseFirstRequestFunction = true;
      const adapter = sequential.adapter();
      await expect(adapter.read(namespace())).resolves.toEqual({
        status: "NOT_FOUND",
      });
      await expect(adapter.read(namespace())).rejects.toEqual(safeError());
      expect(sequential.requests).toHaveLength(1);

      const concurrent = createHarness();
      if (replayKind === "SESSION") concurrent.reuseFirstSession = true;
      else concurrent.reuseFirstRequestFunction = true;
      const concurrentAdapter = concurrent.adapter();
      const results = await Promise.allSettled([
        concurrentAdapter.read(namespace()),
        concurrentAdapter.read(namespace()),
      ]);
      expect(results.filter((result) => result.status === "fulfilled"))
        .toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected"))
        .toHaveLength(1);
      expect(concurrent.requests).toHaveLength(1);

      const failed = createHarness();
      if (replayKind === "SESSION") failed.reuseFirstSession = true;
      else failed.reuseFirstRequestFunction = true;
      failed.throwEveryRequest = new Error("transport failure");
      const failedAdapter = failed.adapter();
      await expect(failedAdapter.read(namespace())).rejects.toEqual(safeError());
      expect(failed.requests).toHaveLength(1);
      failed.throwEveryRequest = undefined;
      await expect(failedAdapter.read(namespace())).rejects.toEqual(safeError());
      expect(failed.requests).toHaveLength(1);
    }
  });

  it("enforces one 30-second deadline across a multi-request recovery chain", async () => {
    const harness = createHarness();
    const adapter = harness.adapter();
    await adapter.createIfAbsent({
      namespace: namespace(),
      object: privateObject(),
    });
    harness.resetAuthorityReplayBaseline();
    harness.requests.length = 0;
    harness.requestSessionIds.length = 0;
    harness.rawRequestBodies.length = 0;
    harness.rawResponseBodies.length = 0;
    harness.reuseFirstSession = true;
    harness.loseNextSuccessfulUploadResponse = true;
    harness.staleNextMediaResponses = 1;
    harness.delayEveryRequestMs = 4_900;

    vi.useFakeTimers();
    const operation = adapter.deleteIfBindingMatches({
      namespace: namespace(),
      deleteBindingHash: DELETE_BINDING_HASH,
    });
    const rejection = expect(operation).rejects.toEqual(safeError());
    await vi.advanceTimersByTimeAsync(29_999);
    expect(harness.requests).toHaveLength(7);
    expect(harness.lastAuthoritySignal?.aborted).toBe(false);

    const timedAuthoritySignal = harness.lastAuthoritySignal;
    const timedRequestSignal = harness.lastLiveTransportSignal;
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(timedAuthoritySignal?.aborted).toBe(true);
    expect(timedRequestSignal?.aborted).toBe(true);
    expect(
      harness.rawRequestBodies.every((body) =>
        body.every((byte) => byte === 0),
      ),
    ).toBe(true);

    const requestCount = harness.requests.length;
    harness.delayEveryRequestMs = 0;
    await expect(adapter.read(namespace())).rejects.toEqual(safeError());
    expect(harness.requests).toHaveLength(requestCount);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates root abort before authority access and during a non-empty upload", async () => {
    const beforeAuthority = createHarness();
    beforeAuthority.controller.abort("secret abort reason");
    await expect(beforeAuthority.adapter().read(namespace())).rejects.toEqual(
      safeError(),
    );
    expect(beforeAuthority.authorityRequests).toHaveLength(0);

    const duringUpload = createHarness();
    duringUpload.hangNextRequest = true;
    const pending = duringUpload.adapter().createIfAbsent({
      namespace: namespace(),
      object: privateObject(),
    });
    await vi.waitFor(() => {
      expect(duringUpload.rawRequestBodies).toHaveLength(1);
    });
    expect(duringUpload.rawRequestBodies[0]?.some((byte) => byte !== 0)).toBe(
      true,
    );
    duringUpload.controller.abort("secret abort reason");
    await expect(pending).rejects.toEqual(safeError());
    expect(
      duringUpload.rawRequestBodies[0]?.every((byte) => byte === 0),
    ).toBe(true);
    expect(duringUpload.lastLiveTransportSignal?.aborted).toBe(true);
  });

  it("enforces HTTPS deadlines and clears late request and response bytes", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.hangNextRequest = true;
    const operation = harness.adapter().createIfAbsent({
      namespace: namespace(),
      object: privateObject(),
    });
    const rejection = expect(operation).rejects.toEqual(safeError());
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.rawRequestBodies[0]?.some((byte) => byte !== 0)).toBe(true);
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
    const lateOperation = lateHarness.adapter().createIfAbsent({
      namespace: namespace(),
      object: privateObject(),
    });
    const lateRejection = expect(lateOperation).rejects.toEqual(safeError());
    await vi.advanceTimersByTimeAsync(0);
    expect(lateHarness.rawRequestBodies[0]?.some((byte) => byte !== 0)).toBe(
      true,
    );
    await vi.advanceTimersByTimeAsync(5_001);
    await lateRejection;
    expect(lateHarness.lateResponseBody).toBeDefined();
    expect(lateHarness.lateResponseBody?.some((byte) => byte !== 0)).toBe(true);
    lateHarness.resolveLateResponse?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(lateHarness.lateResponseBody?.every((byte) => byte === 0)).toBe(true);

    const lateRejectionHarness = createHarness();
    lateRejectionHarness.returnNextResponseAfterTimeout = true;
    lateRejectionHarness.rejectLateResponse = true;
    const lateRejectedOperation = lateRejectionHarness
      .adapter()
      .createIfAbsent({
        namespace: namespace(),
        object: privateObject(),
      });
    const expectedLateRejection = expect(
      lateRejectedOperation,
    ).rejects.toEqual(safeError());
    await vi.advanceTimersByTimeAsync(5_001);
    await expectedLateRejection;
    lateRejectionHarness.resolveLateResponse?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
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

type RequestSnapshot = Omit<
  CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest,
  "body"
> & { body: Uint8Array };

type AuthorityMode =
  | "ONCE"
  | "NONE"
  | "TWICE"
  | "UNAWAITED"
  | "THEN_BEFORE_RETURN"
  | "PROMISE_RESOLVE_BEFORE_RETURN"
  | "ASYNC_AWAIT"
  | "ASYNC_RETURN"
  | "REJECTED_WRAPPER_WITH_POISONED_CATCH"
  | "DIFFERENT_THENABLE"
  | "DIFFERENT_PROXY"
  | "THROW_AFTER_CALLBACK"
  | "RETAIN_AFTER_RETURN"
  | "LATE_AFTER_RETURN";

type SessionMode =
  | "VALID"
  | "UNFROZEN"
  | "EXTRA_KEY"
  | "NONFUNCTION"
  | "ACCESSOR"
  | "PROXY"
  | "SAME_AS_AUTHORITY";

type AuthorizedSession = Readonly<{
  request(
    input: CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest,
  ): PromiseLike<unknown>;
}>;

type HarnessOptionsOverrides = Readonly<{
  policy?: Readonly<Record<string, unknown>>;
  posture?: Readonly<Record<string, unknown>>;
}>;

function createHarness() {
  const controller = new AbortController();
  const requests: RequestSnapshot[] = [];
  const requestSessionIds: number[] = [];
  const rawRequestBodies: Uint8Array[] = [];
  const rawResponseBodies: Uint8Array[] = [];
  const authorityRequests: CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest[] = [];
  const sessions: AuthorizedSession[] = [];
  const deferredConsumers: CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer[] = [];
  const retainedConsumers: CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer[] = [];
  const retainedOperations: ReturnType<CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer>[] = [];
  const objects = new Map<string, StoredObject>();
  let nextGeneration = 1;
  let nextSessionId = 1;
  let firstSession: AuthorizedSession | undefined;
  let firstRequestFunction: AuthorizedSession["request"] | undefined;

  const harness = {
    controller,
    requests,
    requestSessionIds,
    rawRequestBodies,
    rawResponseBodies,
    authorityRequests,
    sessions,
    deferredConsumers,
    retainedConsumers,
    retainedOperations,
    objects,
    authorityMode: "ONCE" as AuthorityMode,
    sessionMode: "VALID" as SessionMode,
    authorityFailure: undefined as Error | undefined,
    thenableGetterReads: 0,
    thenableCalls: 0,
    sessionAccessorReads: 0,
    proxyTrapCount: 0,
    reuseFirstSession: false,
    reuseFirstRequestFunction: false,
    loseNextSuccessfulUploadResponse: false,
    staleNextMediaResponses: 0,
    delayEveryRequestMs: 0,
    hangNextRequest: false,
    returnNextResponseAfterTimeout: false,
    rejectLateResponse: false,
    lateResponseBody: undefined as Uint8Array | undefined,
    resolveLateResponse: undefined as (() => void) | undefined,
    throwEveryRequest: undefined as Error | undefined,
    lastAuthoritySignal: undefined as AbortSignal | undefined,
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
        authorizedOperationPort,
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
    resetAuthorityReplayBaseline() {
      firstSession = undefined;
      firstRequestFunction = undefined;
    },
  };

  const executeAuthorizedRequest = vi.fn(async (
    request: CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest,
    sessionId: number,
  ) => {
      rawRequestBodies.push(request.body);
      harness.lastLiveTransportSignal = request.signal;
      requests.push({ ...request, body: Uint8Array.from(request.body) });
      requestSessionIds.push(sessionId);
      if (harness.delayEveryRequestMs > 0) {
        await waitForRequestDelay(
          harness.delayEveryRequestMs,
          request.signal,
        );
      }
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
        return new Promise((resolve, reject) => {
          harness.resolveLateResponse = () => {
            if (harness.rejectLateResponse) {
              reject(new Error("late transport rejection"));
              return;
            }
            resolve(
              Object.freeze({
                status: 500,
                contentType: "application/json",
                responseUrl: request.url,
                redirected: false as const,
                body,
              }),
            );
          };
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
        if (harness.staleNextMediaResponses > 0) {
          harness.staleNextMediaResponses -= 1;
          return trackResponse(response(request.url, 412, {}));
        }
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
    });

  const consumeAuthorizedOperation = (
    input: CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest,
    consumer: CaresLinkV1NoteGenerationGcsAuthorizedOperationConsumer,
  ) => {
      authorityRequests.push(input);
      harness.lastAuthoritySignal = input.signal;
      if (harness.authorityFailure) throw harness.authorityFailure;

      const sessionId = nextSessionId;
      nextSessionId += 1;
      const freshRequest = (
          request: CaresLinkV1NoteGenerationGcsAuthorizedHttpsRequest,
        ) => executeAuthorizedRequest(request, sessionId);
      const request =
        harness.reuseFirstRequestFunction && firstRequestFunction
          ? firstRequestFunction
          : freshRequest;
      if (firstRequestFunction === undefined) firstRequestFunction = request;
      const freshSession = Object.freeze({ request });
      const reusableSession =
        harness.reuseFirstSession && firstSession
          ? firstSession
          : freshSession;
      if (firstSession === undefined) firstSession = reusableSession;
      let session: unknown = reusableSession;
      if (harness.sessionMode === "UNFROZEN") {
        session = { request };
      } else if (harness.sessionMode === "EXTRA_KEY") {
        session = Object.freeze({ request, extra: true });
      } else if (harness.sessionMode === "NONFUNCTION") {
        session = Object.freeze({ request: "not-callable" });
      } else if (harness.sessionMode === "ACCESSOR") {
        const accessorSession = Object.defineProperty({}, "request", {
          enumerable: true,
          get() {
            harness.sessionAccessorReads += 1;
            return request;
          },
        });
        session = Object.freeze(accessorSession);
      } else if (harness.sessionMode === "PROXY") {
        session = new Proxy(freshSession, {
          get(target, property, receiver) {
            harness.proxyTrapCount += 1;
            return Reflect.get(target, property, receiver);
          },
          getPrototypeOf(target) {
            harness.proxyTrapCount += 1;
            return Reflect.getPrototypeOf(target);
          },
          ownKeys(target) {
            harness.proxyTrapCount += 1;
            return Reflect.ownKeys(target);
          },
        });
      } else if (harness.sessionMode === "SAME_AS_AUTHORITY") {
        session = Object.freeze({ request: consumeAuthorizedOperation });
      }
      if (harness.sessionMode === "VALID") sessions.push(reusableSession);

      if (harness.authorityMode === "NONE") return Promise.resolve();
      if (harness.authorityMode === "UNAWAITED") {
        void consumer(session);
        return Promise.resolve();
      }
      if (harness.authorityMode === "LATE_AFTER_RETURN") {
        deferredConsumers.push(consumer);
        return new Promise<never>(() => undefined);
      }

      const operation = consumer(session);
      if (harness.authorityMode === "THEN_BEFORE_RETURN") {
        void operation.then(
          () => undefined,
          () => undefined,
        );
        return operation;
      }
      if (harness.authorityMode === "PROMISE_RESOLVE_BEFORE_RETURN") {
        const assimilation = Promise.resolve(operation);
        void assimilation.catch(() => undefined);
        return operation;
      }
      if (harness.authorityMode === "ASYNC_AWAIT") {
        return (async () => {
          await operation;
        })();
      }
      if (harness.authorityMode === "ASYNC_RETURN") {
        return (async () => operation)();
      }
      if (
        harness.authorityMode ===
        "REJECTED_WRAPPER_WITH_POISONED_CATCH"
      ) {
        const rejected = Promise.reject(
          new Error("REJECTED_AUTHORITY_WRAPPER_TEST_ONLY"),
        );
        Object.defineProperty(rejected, "catch", {
          configurable: false,
          enumerable: false,
          get() {
            throw new Error("POISONED_CATCH_TEST_ONLY");
          },
        });
        return rejected;
      }
      if (harness.authorityMode === "DIFFERENT_THENABLE") {
        return Object.freeze(
          Object.defineProperty({}, "then", {
            enumerable: true,
            get() {
              harness.thenableGetterReads += 1;
              return () => {
                harness.thenableCalls += 1;
              };
            },
          }),
        );
      }
      if (harness.authorityMode === "DIFFERENT_PROXY") {
        return new Proxy(Object.freeze({ then: () => undefined }), {
          get(target, property, receiver) {
            harness.proxyTrapCount += 1;
            return Reflect.get(target, property, receiver);
          },
          getPrototypeOf(target) {
            harness.proxyTrapCount += 1;
            return Reflect.getPrototypeOf(target);
          },
        });
      }
      if (harness.authorityMode === "THROW_AFTER_CALLBACK") {
        throw new Error("AUTHORITY_THROW_AFTER_CALLBACK_TEST_ONLY");
      }
      if (harness.authorityMode === "RETAIN_AFTER_RETURN") {
        retainedConsumers.push(consumer);
        retainedOperations.push(operation);
      }
      if (harness.authorityMode === "TWICE") {
        void consumer(session);
      }
      return operation;
    };
  const authorizedOperationPort = Object.freeze({
    consumeAuthorizedOperation,
  });

  function trackResponse<T extends Readonly<{ body: Uint8Array }>>(value: T) {
    rawResponseBodies.push(value.body);
    return value;
  }

  return harness;
}

function waitForRequestDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new Error("request delay observed abort"));
    const timer = setTimeout(() => finish(), milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
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
  contentType?: string;
  body: Uint8Array;
}>) {
  const boundary = request.contentType?.match(
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
