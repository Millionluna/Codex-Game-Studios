import {
  createDecipheriv,
  createHash,
  createHmac,
} from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { CommunicationNoteGenerationPayloadStager } from "../communication-note-generation-submitter-composition.server";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_STAGER_TEST_CAPABILITY,
  CARESLINK_V1_NOTE_GENERATION_ENCRYPTION_PROFILE_VERSION,
  CARESLINK_V1_NOTE_GENERATION_FORMAL_ENCRYPTED_PAYLOAD_STAGER,
  createCaresLinkV1NoteGenerationEncryptedPayloadStager,
  createTestOnlyCaresLinkV1NoteGenerationEncryptedPayloadStager,
  type CaresLinkV1NoteGenerationDataKeyWrapPort,
  type CaresLinkV1NoteGenerationEncryptedPayloadPolicy,
  type CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject,
  type CaresLinkV1NoteGenerationEncryptedPayloadStageInput,
  type CaresLinkV1NoteGenerationPrivateObjectStorePort,
} from "./note-generation-encrypted-payload-stager.server";
import { scanCaresLinkV1CleanedFacts } from "./privacy-review-scanner.server";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_OWNER_ID = "22222222-2222-4222-8222-222222222222";
const PRIVACY_REVIEW_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-09-03T02:00:00.000Z";
const PRIVACY_PROOF_EXPIRES_AT = "2026-09-03T02:30:00.000Z";
const EXPECTED_PAYLOAD_EXPIRES_AT = "2026-09-03T02:10:00.000Z";
const KMS_KEY_VERSION_RESOURCE =
  "projects/careslink-m1u-security/locations/australia-southeast1/keyRings/careslink-preview/cryptoKeys/payload-envelope/cryptoKeyVersions/7";
const NEXT_KMS_KEY_VERSION_RESOURCE =
  "projects/careslink-m1u-security/locations/australia-southeast1/keyRings/careslink-preview/cryptoKeys/payload-envelope/cryptoKeyVersions/8";
const IDEMPOTENCY_HASH = sha256("communication-note-idempotency-0001");

const CLEANED_FACTS = Object.freeze({
  occurred_at: "2026-09-03T12:00:00+10:00",
  contact_channel: "Phone",
  parties_by_role: ["Participant", "Support coordinator"],
  observable_facts: "The participant requested a schedule update.",
  action_taken: "The coordinator confirmed the next contact window.",
  stated_outcome: "The participant acknowledged the update.",
  follow_up: "Confirm the schedule at the next contact.",
});

describe("Communication Note encrypted payload stager", () => {
  it("keeps the formal singleton absent while exposing only an injected core", () => {
    expect(
      CARESLINK_V1_NOTE_GENERATION_FORMAL_ENCRYPTED_PAYLOAD_STAGER,
    ).toBeUndefined();

    const harness = createHarness();
    const productCompatibleStager: CommunicationNoteGenerationPayloadStager =
      createStager(harness);
    expect(productCompatibleStager).toMatchObject({
      stageCanonicalFacts: expect.any(Function),
      abortUnaccepted: expect.any(Function),
    });
    expect(() =>
      createTestOnlyCaresLinkV1NoteGenerationEncryptedPayloadStager({
        capability: "not-authorized",
        policy: policy(),
        clock: harness.clock,
        kmsWrapPort: harness.kmsWrapPort,
        privateObjectStorePort: harness.privateObjectStorePort,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "GENERATION_FAILED",
        message: "Encrypted payload staging is unavailable",
      }),
    );
    expect(
      createTestOnlyCaresLinkV1NoteGenerationEncryptedPayloadStager({
        capability:
          CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_STAGER_TEST_CAPABILITY,
        policy: policy(),
        clock: harness.clock,
        kmsWrapPort: harness.kmsWrapPort,
        privateObjectStorePort: harness.privateObjectStorePort,
      }),
    ).toMatchObject({
      stageCanonicalFacts: expect.any(Function),
      abortUnaccepted: expect.any(Function),
    });

    const source = readFileSync(
      new URL(
        "./note-generation-encrypted-payload-stager.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /process\.env|@google-cloud|fetch\s*\(|openai|provider\.generate|setInterval|setTimeout|cron/i,
    );
  });

  it("encrypts canonical facts with a fresh 32-byte DEK, 12-byte IV, 16-byte tag and canonical AAD", async () => {
    const harness = createHarness();
    const input = stageInput();
    const receipt = await createStager(harness).stageCanonicalFacts(input);
    const stored = onlyStoredObject(harness);

    expect(Object.keys(receipt).sort()).toEqual([
      "backupDispositionVersion",
      "encryptionProfileVersion",
      "jobId",
      "kmsKeyVersionResourceHash",
      "payloadExpiresAt",
      "payloadHandleHash",
      "payloadId",
      "payloadPolicySnapshotHash",
      "payloadPolicyVersion",
    ]);
    expect(receipt).toMatchObject({
      payloadExpiresAt: EXPECTED_PAYLOAD_EXPIRES_AT,
      payloadPolicyVersion: "payload-policy.2026-09-03.v1",
      encryptionProfileVersion:
        CARESLINK_V1_NOTE_GENERATION_ENCRYPTION_PROFILE_VERSION,
      kmsKeyVersionResourceHash: sha256(KMS_KEY_VERSION_RESOURCE),
      backupDispositionVersion: "no-soft-delete.2026-09-03.v1",
    });
    expect(receipt.payloadPolicySnapshotHash).toBe(
      canonicalSha256({
        policyVersion: "payload-policy.2026-09-03.v1",
        encryptionProfileVersion:
          CARESLINK_V1_NOTE_GENERATION_ENCRYPTION_PROFILE_VERSION,
        backupDispositionVersion: "no-soft-delete.2026-09-03.v1",
      }),
    );
    expect(receipt.payloadHandleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(receipt)).toBe(true);

    expect(harness.dataEncryptionKeys).toHaveLength(1);
    expect(harness.dataEncryptionKeys[0]).toHaveLength(32);
    expect(new Set(harness.liveKeyReferences[0])).toEqual(new Set([0]));
    expect(Buffer.from(stored.ivBase64url, "base64url")).toHaveLength(12);
    expect(
      Buffer.from(stored.authenticationTagBase64url, "base64url"),
    ).toHaveLength(16);
    expect(harness.wrappingAad[0].toString("base64url")).toBe(
      stored.aadCanonicalBase64url,
    );

    const aad = Buffer.from(stored.aadCanonicalBase64url, "base64url");
    const ciphertext = Buffer.from(stored.ciphertextBase64url, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      harness.dataEncryptionKeys[0],
      Buffer.from(stored.ivBase64url, "base64url"),
      { authTagLength: 16 },
    );
    decipher.setAAD(aad, { plaintextLength: ciphertext.byteLength });
    decipher.setAuthTag(
      Buffer.from(stored.authenticationTagBase64url, "base64url"),
    );
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    expect(JSON.parse(plaintext.toString("utf8"))).toEqual({
      formatVersion: "careslink.communication-note.cleaned-facts.v1",
      noteType: "communication",
      sourceLocale: "en",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      cleanedFacts: CLEANED_FACTS,
    });
    const aadValue = JSON.parse(aad.toString("utf8"));
    expect(aadValue).toMatchObject({
      ownerUserIdHash: sha256(OWNER_ID),
      jobId: receipt.jobId,
      payloadId: receipt.payloadId,
      noteType: "communication",
      sourceLocale: "en",
      cleanedFactsHash: input.cleanedFactsHash,
      requestHash: input.requestHash,
      payloadPolicySnapshotHash: receipt.payloadPolicySnapshotHash,
      kmsKeyVersionResourceHash: receipt.kmsKeyVersionResourceHash,
      payloadExpiresAt: receipt.payloadExpiresAt,
    });
  });

  it("uses a distinct DEK, IV and ciphertext for every new private object", async () => {
    const harness = createHarness();
    const stager = createStager(harness);

    await stager.stageCanonicalFacts(stageInput());
    await stager.stageCanonicalFacts(
      stageInput({
        ownerUserId: SECOND_OWNER_ID,
        idempotencyHash: sha256("communication-note-idempotency-0002"),
      }),
    );

    const stored = [...harness.objects.values()];
    expect(stored).toHaveLength(2);
    expect(harness.dataEncryptionKeys).toHaveLength(2);
    expect(harness.dataEncryptionKeys[0]).not.toEqual(
      harness.dataEncryptionKeys[1],
    );
    expect(stored[0].ivBase64url).not.toBe(stored[1].ivBase64url);
    expect(stored[0].ciphertextBase64url).not.toBe(
      stored[1].ciphertextBase64url,
    );
  });

  it("replays the winning object and fails closed on a changed request in the same owner namespace", async () => {
    const harness = createHarness();
    const stager = createStager(harness);
    const input = stageInput();

    const [first, concurrent] = await Promise.all([
      stager.stageCanonicalFacts(input),
      stager.stageCanonicalFacts(structuredClone(input)),
    ]);
    expect(concurrent).toEqual(first);
    expect(harness.objects).toHaveLength(1);
    const wrapCountAfterRace = harness.wrapDataEncryptionKey.mock.calls.length;
    const createCountAfterRace = harness.createIfAbsent.mock.calls.length;

    await expect(stager.stageCanonicalFacts(input)).resolves.toEqual(first);
    expect(harness.wrapDataEncryptionKey).toHaveBeenCalledTimes(
      wrapCountAfterRace,
    );
    expect(harness.createIfAbsent).toHaveBeenCalledTimes(
      createCountAfterRace,
    );

    const changedFacts = {
      ...CLEANED_FACTS,
      observable_facts: "The participant requested a different update.",
    };
    await expect(
      stager.stageCanonicalFacts(
        stageInput({ cleanedFacts: changedFacts }),
      ),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      message: "Encrypted payload idempotency binding conflicts",
    });
    expect(harness.objects).toHaveLength(1);
  });

  it("returns the original receipt across policy rotation and applies the new policy only to a fresh namespace", async () => {
    const harness = createHarness();
    const original = await createStager(harness).stageCanonicalFacts(
      stageInput(),
    );
    const wrapCount = harness.wrapDataEncryptionKey.mock.calls.length;
    const rotated = createStager(harness, {
      payloadPolicyVersion: "payload-policy.2026-09-03.v2",
      kmsKeyVersionResource: NEXT_KMS_KEY_VERSION_RESOURCE,
      backupDispositionVersion: "no-soft-delete.2026-09-03.v2",
      retentionSeconds: 300,
    });

    await expect(rotated.stageCanonicalFacts(stageInput())).resolves.toEqual(
      original,
    );
    expect(harness.wrapDataEncryptionKey).toHaveBeenCalledTimes(wrapCount);

    const fresh = await rotated.stageCanonicalFacts(
      stageInput({
        idempotencyHash: sha256("communication-note-idempotency-rotated"),
      }),
    );
    expect(fresh).toMatchObject({
      payloadPolicyVersion: "payload-policy.2026-09-03.v2",
      kmsKeyVersionResourceHash: sha256(NEXT_KMS_KEY_VERSION_RESOURCE),
      backupDispositionVersion: "no-soft-delete.2026-09-03.v2",
      payloadExpiresAt: "2026-09-03T02:05:00.000Z",
    });
    expect(fresh.payloadPolicySnapshotHash).not.toBe(
      original.payloadPolicySnapshotHash,
    );
  });

  it.each([
    ["AAD", (object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject) => ({
      ...object,
      aadCanonicalBase64url: flipBase64url(object.aadCanonicalBase64url),
    })],
    ["IV", (object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject) => ({
      ...object,
      ivBase64url: flipBase64url(object.ivBase64url),
    })],
    ["ciphertext", (object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject) => ({
      ...object,
      ciphertextBase64url: flipBase64url(object.ciphertextBase64url),
    })],
    ["authentication tag", (object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject) => ({
      ...object,
      authenticationTagBase64url: flipBase64url(
        object.authenticationTagBase64url,
      ),
    })],
    ["wrapped DEK", (object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject) => ({
      ...object,
      wrappedDataEncryptionKeyBase64url: flipBase64url(
        object.wrappedDataEncryptionKeyBase64url,
      ),
    })],
    ["KMS key version", (object: CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject) => ({
      ...object,
      kmsKeyVersionResource: NEXT_KMS_KEY_VERSION_RESOURCE,
    })],
  ])("rejects a tampered %s without replacing the object", async (_label, mutate) => {
    const harness = createHarness();
    const stager = createStager(harness);
    await stager.stageCanonicalFacts(stageInput());
    const [locator, object] = onlyStoredEntry(harness);
    harness.objects.set(
      locator,
      mutate(object) as CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject,
    );

    await expect(stager.stageCanonicalFacts(stageInput())).rejects.toMatchObject({
      code: "GENERATION_FAILED",
      message: "Encrypted payload staging is unavailable",
    });
    expect(harness.createIfAbsent).toHaveBeenCalledTimes(1);
  });

  it.each(["latest", "primary", "0", "01"])(
    "rejects the non-numeric or non-canonical KMS key-version segment %s before invoking a port",
    (version) => {
      const harness = createHarness();
      expect(() =>
        createStager(harness, {
          kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE.replace(/7$/, version),
        }),
      ).toThrowError(
        expect.objectContaining({
          code: "GENERATION_FAILED",
          message: "Encrypted payload staging is unavailable",
        }),
      );
      expect(harness.read).not.toHaveBeenCalled();
      expect(harness.wrapDataEncryptionKey).not.toHaveBeenCalled();
    },
  );

  it("rejects a wrap response from a different key version and a pass-through DEK", async () => {
    const mismatched = createHarness();
    mismatched.wrapDataEncryptionKey.mockResolvedValueOnce({
      kmsKeyVersionResource: NEXT_KMS_KEY_VERSION_RESOURCE,
      wrappedDataEncryptionKey: Buffer.alloc(64, 1),
    });
    await expect(
      createStager(mismatched).stageCanonicalFacts(stageInput()),
    ).rejects.toMatchObject({
      code: "GENERATION_FAILED",
      message: "Encrypted payload staging is unavailable",
    });
    expect(mismatched.objects).toHaveLength(0);

    const passThrough = createHarness();
    passThrough.wrapDataEncryptionKey.mockImplementationOnce(async (input) => ({
      kmsKeyVersionResource: input.kmsKeyVersionResource,
      wrappedDataEncryptionKey: Buffer.from(input.plaintextDataEncryptionKey),
    }));
    await expect(
      createStager(passThrough).stageCanonicalFacts(stageInput()),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    expect(passThrough.objects).toHaveLength(0);
  });

  it("uses the same 128-character policy identifier boundary as admission", () => {
    const harness = createHarness();
    expect(() =>
      createStager(harness, {
        payloadPolicyVersion: `p${"a".repeat(127)}`,
      }),
    ).not.toThrow();
    expect(() =>
      createStager(harness, {
        payloadPolicyVersion: `p${"a".repeat(128)}`,
      }),
    ).toThrowError(expect.objectContaining({ code: "GENERATION_FAILED" }));
  });

  it("revalidates the facts hash and byte limit before any storage or key operation", async () => {
    const harness = createHarness();
    const stager = createStager(harness, {
      maximumCleanedFactsCanonicalBytes: 1024,
    });

    await expect(
      stager.stageCanonicalFacts(
        stageInput({ cleanedFactsHash: "f".repeat(64) }),
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });
    const oversizedFacts = {
      ...CLEANED_FACTS,
      observable_facts: "x".repeat(2_000),
    };
    await expect(
      stager.stageCanonicalFacts(stageInput({ cleanedFacts: oversizedFacts })),
    ).rejects.toMatchObject({ code: "PRIVACY_REVIEW_STALE" });

    const getter = vi.fn(() => "must-not-be-read");
    const hostileFacts = { ...CLEANED_FACTS };
    Object.defineProperty(hostileFacts, "observable_facts", {
      enumerable: true,
      get: getter,
    });
    const hostileInput = {
      ...stageInput(),
      cleanedFacts: hostileFacts,
    };
    await expect(
      stager.stageCanonicalFacts(hostileInput),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Encrypted payload staging input is invalid",
    });
    expect(getter).not.toHaveBeenCalled();
    expect(harness.read).not.toHaveBeenCalled();
    expect(harness.wrapDataEncryptionKey).not.toHaveBeenCalled();
  });

  it("performs an exact-binding idempotent delete and never treats a bare missing object as success", async () => {
    const harness = createHarness();
    const stager = createStager(harness);
    const input = stageInput();
    const staged = await stager.stageCanonicalFacts(input);

    await expect(
      stager.abortUnaccepted({
        ownerUserId: OWNER_ID,
        idempotencyHash: IDEMPOTENCY_HASH,
        requestHash: "a".repeat(64),
        staged,
        reason: "PAYLOAD_NOT_ACCEPTED",
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    expect(harness.objects).toHaveLength(1);

    const abort = {
      ownerUserId: OWNER_ID,
      idempotencyHash: IDEMPOTENCY_HASH,
      requestHash: input.requestHash,
      staged,
      reason: "PAYLOAD_NOT_ACCEPTED" as const,
    };
    await expect(stager.abortUnaccepted(abort)).resolves.toBeUndefined();
    expect(harness.objects).toHaveLength(0);
    expect(harness.tombstones).toHaveLength(1);
    await expect(stager.abortUnaccepted(abort)).resolves.toBeUndefined();
    await expect(stager.stageCanonicalFacts(input)).rejects.toMatchObject({
      code: "GENERATION_FAILED",
    });

    await expect(
      stager.abortUnaccepted({
        ...abort,
        idempotencyHash: sha256("never-created-idempotency"),
      }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
  });

  it("keeps facts, raw identities, KMS resources, physical locators and provider failures out of receipts and errors", async () => {
    const harness = createHarness();
    const input = stageInput();
    const receipt = await createStager(harness).stageCanonicalFacts(input);
    const serializedReceipt = JSON.stringify(receipt);
    const serializedPrivateObject = JSON.stringify(onlyStoredObject(harness));
    const forbidden = [
      OWNER_ID,
      PRIVACY_REVIEW_ID,
      IDEMPOTENCY_HASH,
      KMS_KEY_VERSION_RESOURCE,
      ...Object.values(CLEANED_FACTS).flat(),
    ];
    for (const value of forbidden) {
      expect(serializedReceipt).not.toContain(String(value));
      for (const locator of harness.physicalLocators) {
        expect(locator).not.toContain(String(value));
      }
    }
    for (const value of [
      OWNER_ID,
      PRIVACY_REVIEW_ID,
      ...Object.values(CLEANED_FACTS).flat(),
    ]) {
      expect(serializedPrivateObject).not.toContain(String(value));
    }

    const secretFailure =
      "private-store-failure:The participant requested a schedule update.";
    harness.read.mockRejectedValueOnce(new Error(secretFailure));
    const error = await createStager(harness)
      .stageCanonicalFacts(
        stageInput({
          idempotencyHash: sha256("communication-note-idempotency-error"),
        }),
      )
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "GENERATION_FAILED",
      message: "Encrypted payload staging is unavailable",
    });
    expect(JSON.stringify(error)).not.toContain(secretFailure);
    expect(String(error)).not.toContain(secretFailure);
  });
});

type Namespace = Readonly<{
  ownerUserIdHash: string;
  idempotencyHash: string;
}>;

function createHarness() {
  const objects = new Map<
    string,
    CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject
  >();
  const tombstones = new Map<string, string>();
  const physicalLocators: string[] = [];
  const dataEncryptionKeys: Buffer[] = [];
  const liveKeyReferences: Uint8Array[] = [];
  const wrappingAad: Buffer[] = [];
  const locator = (namespace: Namespace) => {
    const value = `private/communication-note/${createHmac("sha256", "test-only-locator-secret")
      .update(stringifyCaresLinkV1CanonicalJson(namespace))
      .digest("hex")}`;
    physicalLocators.push(value);
    return value;
  };

  const wrapDataEncryptionKey = vi.fn<
    CaresLinkV1NoteGenerationDataKeyWrapPort["wrapDataEncryptionKey"]
  >(async (input) => {
    const dataKey = Buffer.from(input.plaintextDataEncryptionKey);
    dataEncryptionKeys.push(dataKey);
    liveKeyReferences.push(input.plaintextDataEncryptionKey);
    wrappingAad.push(Buffer.from(input.additionalAuthenticatedData));
    return {
      kmsKeyVersionResource: input.kmsKeyVersionResource,
      wrappedDataEncryptionKey: createHash("sha512")
        .update("test-only-wrapped-dek")
        .update(dataKey)
        .update(input.additionalAuthenticatedData)
        .digest(),
    };
  });
  const read = vi.fn<CaresLinkV1NoteGenerationPrivateObjectStorePort["read"]>(
    async (namespace) => {
      const key = locator(namespace);
      if (tombstones.has(key)) return { status: "TOMBSTONED" };
      const object = objects.get(key);
      return object
        ? { status: "FOUND", object: structuredClone(object) }
        : { status: "NOT_FOUND" };
    },
  );
  const createIfAbsent = vi.fn<
    CaresLinkV1NoteGenerationPrivateObjectStorePort["createIfAbsent"]
  >(async ({ namespace, object }) => {
    const key = locator(namespace);
    if (tombstones.has(key)) return { status: "TOMBSTONED" };
    const existing = objects.get(key);
    if (existing) {
      return { status: "EXISTS", object: structuredClone(existing) };
    }
    objects.set(key, structuredClone(object));
    return { status: "CREATED" };
  });
  const deleteIfBindingMatches = vi.fn<
    CaresLinkV1NoteGenerationPrivateObjectStorePort["deleteIfBindingMatches"]
  >(async ({ namespace, deleteBindingHash }) => {
    const key = locator(namespace);
    const tombstone = tombstones.get(key);
    if (tombstone) {
      return {
        status:
          tombstone === deleteBindingHash
            ? "ALREADY_DELETED"
            : "BINDING_MISMATCH",
      };
    }
    const existing = objects.get(key);
    if (!existing) return { status: "NOT_FOUND" };
    if (existing.deleteBindingHash !== deleteBindingHash) {
      return { status: "BINDING_MISMATCH" };
    }
    objects.delete(key);
    tombstones.set(key, deleteBindingHash);
    return { status: "DELETED" };
  });
  const kmsWrapPort = Object.freeze({ wrapDataEncryptionKey });
  const privateObjectStorePort = Object.freeze({
    read,
    createIfAbsent,
    deleteIfBindingMatches,
  });
  const clock = vi.fn(() => NOW);
  return {
    objects,
    tombstones,
    physicalLocators,
    dataEncryptionKeys,
    liveKeyReferences,
    wrappingAad,
    wrapDataEncryptionKey,
    read,
    createIfAbsent,
    deleteIfBindingMatches,
    kmsWrapPort,
    privateObjectStorePort,
    clock,
  };
}

function createStager(
  harness: ReturnType<typeof createHarness>,
  overrides: Partial<CaresLinkV1NoteGenerationEncryptedPayloadPolicy> = {},
) {
  return createCaresLinkV1NoteGenerationEncryptedPayloadStager({
    policy: policy(overrides),
    clock: harness.clock,
    kmsWrapPort: harness.kmsWrapPort,
    privateObjectStorePort: harness.privateObjectStorePort,
  });
}

function policy(
  overrides: Partial<CaresLinkV1NoteGenerationEncryptedPayloadPolicy> = {},
): CaresLinkV1NoteGenerationEncryptedPayloadPolicy {
  return {
    payloadPolicyVersion: "payload-policy.2026-09-03.v1",
    encryptionProfileVersion:
      CARESLINK_V1_NOTE_GENERATION_ENCRYPTION_PROFILE_VERSION,
    kmsKeyVersionResource: KMS_KEY_VERSION_RESOURCE,
    backupDispositionVersion: "no-soft-delete.2026-09-03.v1",
    retentionSeconds: 600,
    maximumCleanedFactsCanonicalBytes: 64 * 1024,
    ...overrides,
  };
}

function stageInput(
  overrides: Partial<CaresLinkV1NoteGenerationEncryptedPayloadStageInput> = {},
): CaresLinkV1NoteGenerationEncryptedPayloadStageInput {
  const cleanedFacts = overrides.cleanedFacts ?? CLEANED_FACTS;
  const scan = scanCaresLinkV1CleanedFacts(
    cleanedFacts as typeof CLEANED_FACTS,
  );
  const privacyReviewId = overrides.privacyReviewId ?? PRIVACY_REVIEW_ID;
  const sourceLocale = overrides.sourceLocale ?? "en";
  return {
    ownerUserId: OWNER_ID,
    noteType: "communication",
    sourceLocale,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    privacyReviewId,
    privacyProofExpiresAt: PRIVACY_PROOF_EXPIRES_AT,
    cleanedFacts,
    cleanedFactsHash: scan.cleanedFactsHash,
    idempotencyHash: IDEMPOTENCY_HASH,
    requestHash: canonicalSha256({
      noteType: "communication",
      sourceLocale,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      privacyReviewId,
      cleanedFacts,
    }),
    ...overrides,
  };
}

function onlyStoredObject(harness: ReturnType<typeof createHarness>) {
  expect(harness.objects).toHaveLength(1);
  return [...harness.objects.values()][0];
}

function onlyStoredEntry(harness: ReturnType<typeof createHarness>) {
  expect(harness.objects).toHaveLength(1);
  return [...harness.objects.entries()][0];
}

function flipBase64url(value: string) {
  return `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
}

function canonicalSha256(value: unknown) {
  return sha256(stringifyCaresLinkV1CanonicalJson(value));
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
