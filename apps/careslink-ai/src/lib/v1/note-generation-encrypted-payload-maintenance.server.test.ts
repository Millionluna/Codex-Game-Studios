import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_MAINTENANCE_MAX_BATCH_SIZE,
  CARESLINK_V1_NOTE_GENERATION_FORMAL_ENCRYPTED_PAYLOAD_MAINTENANCE,
  createCaresLinkV1EncryptedPayloadMaintenanceCandidateBindingHash,
  createCaresLinkV1NoteGenerationEncryptedPayloadMaintenance,
  type CaresLinkV1EncryptedPayloadAdmissionLookupPort,
  type CaresLinkV1EncryptedPayloadExactDeletePort,
  type CaresLinkV1EncryptedPayloadMaintenanceCandidate,
  type CaresLinkV1EncryptedPayloadMaintenanceCandidateBinding,
  type CaresLinkV1EncryptedPayloadMaintenanceCandidatePort,
  type CaresLinkV1EncryptedPayloadMaintenanceSettlement,
} from "./note-generation-encrypted-payload-maintenance.server";

vi.mock("server-only", () => ({}));

const NOW = "2026-09-03T02:00:00.000Z";
const BEFORE_NOW = "2026-09-03T01:59:59.999Z";
const AFTER_NOW = "2026-09-03T02:10:00.000Z";
const SENSITIVE_FACT = "The participant requested a private schedule update.";

describe("Communication Note encrypted payload maintenance", () => {
  it("keeps the formal singleton absent and has no scheduler, environment, cloud or model wiring", () => {
    expect(
      CARESLINK_V1_NOTE_GENERATION_FORMAL_ENCRYPTED_PAYLOAD_MAINTENANCE,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_NOTE_GENERATION_ENCRYPTED_PAYLOAD_MAINTENANCE_MAX_BATCH_SIZE,
    ).toBe(100);
    const harness = createHarness([]);
    expect(createMaintenance(harness)).toMatchObject({
      reconcileStaged: expect.any(Function),
      sweepExpired: expect.any(Function),
    });

    const source = readFileSync(
      new URL(
        "./note-generation-encrypted-payload-maintenance.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /process\.env|@google-cloud|fetch\s*\(|openai|provider\.generate|setInterval|setTimeout|cron/i,
    );
  });

  it("retains an exact ACCEPTED admission without calling delete", async () => {
    const accepted = candidate(1);
    const harness = createHarness([accepted], {
      [accepted.candidateReferenceHash]: "ACCEPTED",
    });

    await expect(
      createMaintenance(harness).reconcileStaged(10, NOW),
    ).resolves.toEqual(summary({ claimedCount: 1, retainedCount: 1 }));
    expect(harness.lookupExact).toHaveBeenCalledOnce();
    expect(harness.deleteIfBindingMatches).not.toHaveBeenCalled();
    expect(harness.settlements).toEqual([
      expect.objectContaining({
        candidateReferenceHash: accepted.candidateReferenceHash,
        disposition: "RETAINED",
        reason: "ADMISSION_ACCEPTED",
        nextEligibleAt: null,
      }),
    ]);
  });

  it("deletes a definitively REJECTED admission under the exact binding", async () => {
    const rejected = candidate(2);
    const harness = createHarness([rejected], {
      [rejected.candidateReferenceHash]: "REJECTED",
    });

    await expect(
      createMaintenance(harness).reconcileStaged(10, NOW),
    ).resolves.toEqual(summary({ claimedCount: 1, deletedCount: 1 }));
    expect(harness.deleteIfBindingMatches).toHaveBeenCalledExactlyOnceWith({
      namespace: {
        ownerUserIdHash: rejected.ownerUserIdHash,
        idempotencyHash: rejected.idempotencyHash,
      },
      deleteBindingHash: rejected.deleteBindingHash,
    });
    expect(harness.objects).toHaveLength(0);
    expect(harness.tombstones).toHaveLength(1);
    expect(harness.settlements.at(-1)).toMatchObject({
      disposition: "DELETED",
      reason: "ADMISSION_REJECTED",
    });
  });

  it("defers MISSING and AMBIGUOUS admissions before expiry, then deletes at expiry equality", async () => {
    const missing = candidate(3, { payloadExpiresAt: AFTER_NOW });
    const ambiguous = candidate(4, { payloadExpiresAt: AFTER_NOW });
    const early = createHarness([missing, ambiguous], {
      [missing.candidateReferenceHash]: "MISSING",
      [ambiguous.candidateReferenceHash]: "AMBIGUOUS",
    });

    await expect(
      createMaintenance(early).reconcileStaged(10, NOW),
    ).resolves.toEqual(summary({ claimedCount: 2, deferredCount: 2 }));
    expect(early.deleteIfBindingMatches).not.toHaveBeenCalled();
    expect(early.settlements).toEqual([
      expect.objectContaining({
        disposition: "DEFERRED",
        reason: "ADMISSION_UNCERTAIN_BEFORE_EXPIRY",
        nextEligibleAt: AFTER_NOW,
      }),
      expect.objectContaining({
        disposition: "DEFERRED",
        reason: "ADMISSION_UNCERTAIN_BEFORE_EXPIRY",
        nextEligibleAt: AFTER_NOW,
      }),
    ]);

    const missingAtEquality = candidate(5, { payloadExpiresAt: NOW });
    const ambiguousAtEquality = candidate(6, { payloadExpiresAt: NOW });
    const equality = createHarness(
      [missingAtEquality, ambiguousAtEquality],
      {
        [missingAtEquality.candidateReferenceHash]: "MISSING",
        [ambiguousAtEquality.candidateReferenceHash]: "AMBIGUOUS",
      },
    );
    await expect(
      createMaintenance(equality).reconcileStaged(10, NOW),
    ).resolves.toEqual(summary({ claimedCount: 2, deletedCount: 2 }));
    expect(equality.deleteIfBindingMatches).toHaveBeenCalledTimes(2);
    expect(equality.settlements.map(({ reason }) => reason)).toEqual([
      "ADMISSION_UNCERTAIN_EXPIRED",
      "ADMISSION_UNCERTAIN_EXPIRED",
    ]);
  });

  it("quarantines candidate, admission and delete binding mismatches without a broad delete", async () => {
    const malformedBinding = candidate(7, {
      candidateBindingHash: "f".repeat(64),
    });
    const admissionMismatch = candidate(8);
    const deleteMismatch = candidate(9);
    const harness = createHarness(
      [malformedBinding, admissionMismatch, deleteMismatch],
      {
        [admissionMismatch.candidateReferenceHash]: "BINDING_MISMATCH",
        [deleteMismatch.candidateReferenceHash]: "REJECTED",
      },
    );
    harness.objects.set(namespaceKey(deleteMismatch), "e".repeat(64));

    await expect(
      createMaintenance(harness).reconcileStaged(10, NOW),
    ).resolves.toEqual(summary({ claimedCount: 3, quarantinedCount: 3 }));
    expect(harness.lookupExact).toHaveBeenCalledTimes(2);
    expect(harness.deleteIfBindingMatches).toHaveBeenCalledTimes(1);
    expect(harness.objects.has(namespaceKey(deleteMismatch))).toBe(true);
    expect(harness.settlements.map(({ reason }) => reason)).toEqual([
      "CANDIDATE_BINDING_MISMATCH",
      "ADMISSION_BINDING_MISMATCH",
      "DELETE_BINDING_MISMATCH",
    ]);
  });

  it("sweeps only candidates at or before expiry and never consults admission", async () => {
    const expired = candidate(10, { payloadExpiresAt: BEFORE_NOW });
    const equality = candidate(11, { payloadExpiresAt: NOW });
    const future = candidate(12, { payloadExpiresAt: AFTER_NOW });
    const harness = createHarness([expired, equality, future]);

    await expect(
      createMaintenance(harness).sweepExpired(10, NOW),
    ).resolves.toEqual(summary({ claimedCount: 2, deletedCount: 2 }));
    expect(harness.lookupExact).not.toHaveBeenCalled();
    expect(harness.deleteIfBindingMatches).toHaveBeenCalledTimes(2);
    expect(harness.objects.has(namespaceKey(future))).toBe(true);
    expect(harness.pendingReferences()).toContain(future.candidateReferenceHash);
    expect(harness.settlements.map(({ reason }) => reason)).toEqual([
      "RETENTION_EXPIRED",
      "RETENTION_EXPIRED",
    ]);
  });

  it("quarantines a bare NOT_FOUND instead of treating it as durable deletion evidence", async () => {
    const missingObject = candidate(13, { payloadExpiresAt: NOW });
    const harness = createHarness([missingObject]);
    harness.objects.delete(namespaceKey(missingObject));

    await expect(
      createMaintenance(harness).sweepExpired(10, NOW),
    ).resolves.toEqual(summary({ claimedCount: 1, quarantinedCount: 1 }));
    expect(harness.tombstones).toHaveLength(0);
    expect(harness.settlements.at(-1)).toMatchObject({
      disposition: "QUARANTINED",
      reason: "OBJECT_NOT_FOUND",
    });
  });

  it("replays safely when delete committed but its response was lost", async () => {
    const rejected = candidate(14);
    const harness = createHarness([rejected], {
      [rejected.candidateReferenceHash]: "REJECTED",
    });
    harness.failNextDeleteAfterCommit();
    const maintenance = createMaintenance(harness);

    await expect(maintenance.reconcileStaged(1, NOW)).resolves.toEqual(
      summary({ claimedCount: 1, retryRequiredCount: 1 }),
    );
    expect(harness.objects).toHaveLength(0);
    expect(harness.tombstones).toHaveLength(1);
    expect(harness.settlements.at(-1)).toMatchObject({
      disposition: "RETRY_REQUIRED",
      reason: "DELETE_RESULT_UNKNOWN",
    });

    await expect(maintenance.reconcileStaged(1, NOW)).resolves.toEqual(
      summary({ claimedCount: 1, deletedCount: 1 }),
    );
    expect(harness.deleteIfBindingMatches).toHaveBeenCalledTimes(2);
    expect(harness.settlements.at(-1)).toMatchObject({
      disposition: "DELETED",
      reason: "ADMISSION_REJECTED",
    });
  });

  it("uses claim leases to keep concurrent batches disjoint and enforces the caller limit", async () => {
    const candidates = Array.from({ length: 5 }, (_, index) =>
      candidate(20 + index),
    );
    const statuses = Object.fromEntries(
      candidates.map(({ candidateReferenceHash }) => [
        candidateReferenceHash,
        "REJECTED" as const,
      ]),
    );
    const harness = createHarness(candidates, statuses);
    const maintenance = createMaintenance(harness);

    const [first, second] = await Promise.all([
      maintenance.reconcileStaged(2, NOW),
      maintenance.reconcileStaged(2, NOW),
    ]);
    expect(first).toEqual(summary({ claimedCount: 2, deletedCount: 2 }));
    expect(second).toEqual(summary({ claimedCount: 2, deletedCount: 2 }));
    expect(new Set(harness.deletedReferences)).toHaveLength(4);
    expect(harness.pendingReferences()).toHaveLength(1);

    await expect(maintenance.reconcileStaged(2, NOW)).resolves.toEqual(
      summary({ claimedCount: 1, deletedCount: 1 }),
    );
    expect(new Set(harness.deletedReferences)).toHaveLength(5);
    expect(harness.pendingReferences()).toHaveLength(0);
    await expect(maintenance.reconcileStaged(101, NOW)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Encrypted payload maintenance input is invalid",
    });
  });

  it("returns only count DTOs and sanitizes candidate/admission port failures", async () => {
    const retry = candidate(30);
    const harness = createHarness([retry]);
    harness.lookupExact.mockRejectedValueOnce(
      new Error(`database failure:${SENSITIVE_FACT}`),
    );

    const result = await createMaintenance(harness).reconcileStaged(1, NOW);
    expect(Object.keys(result).sort()).toEqual([
      "claimedCount",
      "deferredCount",
      "deletedCount",
      "quarantinedCount",
      "retainedCount",
      "retryRequiredCount",
    ]);
    expect(result).toEqual(
      summary({ claimedCount: 1, retryRequiredCount: 1 }),
    );
    expect(JSON.stringify(result)).not.toContain(SENSITIVE_FACT);
    expect(JSON.stringify(harness.claimedCandidates)).not.toMatch(
      /cleanedFacts|ciphertext|wrappedDataEncryptionKey|locator/i,
    );

    const failedClaim = createHarness([]);
    failedClaim.claimStaged.mockRejectedValueOnce(
      new Error(`claim failure:${SENSITIVE_FACT}`),
    );
    const error = await createMaintenance(failedClaim)
      .reconcileStaged(1, NOW)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "GENERATION_FAILED",
      message: "Encrypted payload maintenance is unavailable",
    });
    expect(String(error)).not.toContain(SENSITIVE_FACT);
    expect(JSON.stringify(error)).not.toContain(SENSITIVE_FACT);
  });
});

type AdmissionStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "MISSING"
  | "AMBIGUOUS"
  | "BINDING_MISMATCH";

type CandidateState = {
  candidate: CaresLinkV1EncryptedPayloadMaintenanceCandidate;
  state: "PENDING" | "SETTLED";
  locked: boolean;
  nextEligibleAt: string;
};

function createHarness(
  candidates: readonly CaresLinkV1EncryptedPayloadMaintenanceCandidate[],
  admissionStatuses: Readonly<Record<string, AdmissionStatus>> = {},
) {
  const states = new Map<string, CandidateState>(
    candidates.map((value) => [
      value.candidateReferenceHash,
      {
        candidate: structuredClone(value),
        state: "PENDING",
        locked: false,
        nextEligibleAt: "1970-01-01T00:00:00.000Z",
      },
    ]),
  );
  const objects = new Map<string, string>(
    candidates.map((value) => [namespaceKey(value), value.deleteBindingHash]),
  );
  const tombstones = new Map<string, string>();
  const settlements: CaresLinkV1EncryptedPayloadMaintenanceSettlement[] = [];
  const claimedCandidates: CaresLinkV1EncryptedPayloadMaintenanceCandidate[] = [];
  const deletedReferences: string[] = [];
  let claimSequence = 0;
  let throwAfterDelete = false;

  const claim = (
    mode: "STAGED" | "EXPIRED",
    limit: number,
    now: string,
  ) => {
    const selected = [...states.values()]
      .filter(
        ({ candidate: value, state, locked, nextEligibleAt }) =>
          state === "PENDING" &&
          !locked &&
          Date.parse(nextEligibleAt) <= Date.parse(now) &&
          (mode === "STAGED" ||
            Date.parse(value.payloadExpiresAt) <= Date.parse(now)),
      )
      .slice(0, limit);
    const claimed = selected.map((record) => {
      record.locked = true;
      claimSequence += 1;
      record.candidate = {
        ...record.candidate,
        claimToken: sha256(`maintenance-claim-${claimSequence}`),
      };
      const copy = structuredClone(record.candidate);
      claimedCandidates.push(copy);
      return copy;
    });
    return { candidates: claimed };
  };

  const claimStaged = vi.fn<
    CaresLinkV1EncryptedPayloadMaintenanceCandidatePort["claimStaged"]
  >(async ({ limit, now }) => claim("STAGED", limit, now));
  const claimExpired = vi.fn<
    CaresLinkV1EncryptedPayloadMaintenanceCandidatePort["claimExpired"]
  >(async ({ limit, now }) => claim("EXPIRED", limit, now));
  const settle = vi.fn<
    CaresLinkV1EncryptedPayloadMaintenanceCandidatePort["settle"]
  >(async (input) => {
    settlements.push(structuredClone(input));
    const record = states.get(input.candidateReferenceHash);
    if (
      !record ||
      !record.locked ||
      record.candidate.claimToken !== input.claimToken ||
      record.candidate.candidateBindingHash !== input.candidateBindingHash
    ) {
      return { status: "BINDING_MISMATCH" };
    }
    record.locked = false;
    if (input.disposition === "RETRY_REQUIRED") {
      record.nextEligibleAt = input.now;
    } else if (input.disposition === "DEFERRED") {
      record.nextEligibleAt = input.nextEligibleAt ?? input.now;
    } else {
      record.state = "SETTLED";
    }
    return {
      status: "SETTLED",
      candidateBindingHash: input.candidateBindingHash,
      disposition: input.disposition,
    };
  });

  const lookupExact = vi.fn<
    CaresLinkV1EncryptedPayloadAdmissionLookupPort["lookupExact"]
  >(async (input) => {
    const status = admissionStatuses[input.candidateReferenceHash] ?? "MISSING";
    return status === "ACCEPTED" || status === "REJECTED"
      ? { status, candidateBindingHash: input.candidateBindingHash }
      : { status };
  });

  const deleteIfBindingMatches = vi.fn<
    CaresLinkV1EncryptedPayloadExactDeletePort["deleteIfBindingMatches"]
  >(async ({ namespace, deleteBindingHash }) => {
    const key = namespaceKey(namespace);
    const tombstone = tombstones.get(key);
    if (tombstone) {
      if (tombstone !== deleteBindingHash) return { status: "BINDING_MISMATCH" };
      return { status: "ALREADY_DELETED" };
    }
    const storedBinding = objects.get(key);
    if (!storedBinding) return { status: "NOT_FOUND" };
    if (storedBinding !== deleteBindingHash) {
      return { status: "BINDING_MISMATCH" };
    }
    objects.delete(key);
    tombstones.set(key, deleteBindingHash);
    const deleted = [...states.values()].find(
      ({ candidate: value }) => namespaceKey(value) === key,
    );
    if (deleted) deletedReferences.push(deleted.candidate.candidateReferenceHash);
    if (throwAfterDelete) {
      throwAfterDelete = false;
      throw new Error(`lost delete response:${SENSITIVE_FACT}`);
    }
    return { status: "DELETED" };
  });

  const candidatePort = Object.freeze({ claimStaged, claimExpired, settle });
  const admissionLookupPort = Object.freeze({ lookupExact });
  const exactDeletePort = Object.freeze({ deleteIfBindingMatches });
  return {
    states,
    objects,
    tombstones,
    settlements,
    claimedCandidates,
    deletedReferences,
    claimStaged,
    claimExpired,
    settle,
    lookupExact,
    deleteIfBindingMatches,
    candidatePort,
    admissionLookupPort,
    exactDeletePort,
    failNextDeleteAfterCommit() {
      throwAfterDelete = true;
    },
    pendingReferences() {
      return [...states.values()]
        .filter(({ state }) => state === "PENDING")
        .map(({ candidate: value }) => value.candidateReferenceHash);
    },
  };
}

function createMaintenance(harness: ReturnType<typeof createHarness>) {
  return createCaresLinkV1NoteGenerationEncryptedPayloadMaintenance({
    candidatePort: harness.candidatePort,
    admissionLookupPort: harness.admissionLookupPort,
    exactDeletePort: harness.exactDeletePort,
  });
}

function candidate(
  index: number,
  overrides: Partial<CaresLinkV1EncryptedPayloadMaintenanceCandidate> = {},
): CaresLinkV1EncryptedPayloadMaintenanceCandidate {
  const base = {
    candidateReferenceHash: sha256(`candidate-${index}`),
    ownerUserIdHash: sha256(`owner-${index}`),
    idempotencyHash: sha256(`idempotency-${index}`),
    jobId: uuid(4, index),
    payloadId: uuid(5, index),
    requestHash: sha256(`request-${index}`),
    payloadHandleHash: sha256(`handle-${index}`),
    payloadExpiresAt: AFTER_NOW,
    payloadPolicyVersion: "payload-policy.2026-09-03.v1",
    payloadPolicySnapshotHash: sha256("payload-policy-snapshot"),
    encryptionProfileVersion: "aes-256-gcm-envelope.2026-09-03.v1",
    kmsKeyVersionResourceHash: sha256("kms-key-version-7"),
    backupDispositionVersion: "no-soft-delete.2026-09-03.v1",
    deleteBindingHash: sha256(`delete-binding-${index}`),
    claimToken: sha256(`unclaimed-${index}`),
    candidateBindingHash: "",
  } satisfies CaresLinkV1EncryptedPayloadMaintenanceCandidate;
  const merged = { ...base, ...overrides };
  const binding = candidateBinding(merged);
  return Object.freeze({
    ...merged,
    candidateBindingHash:
      overrides.candidateBindingHash ??
      createCaresLinkV1EncryptedPayloadMaintenanceCandidateBindingHash(binding),
  });
}

function candidateBinding(
  value: CaresLinkV1EncryptedPayloadMaintenanceCandidate,
): CaresLinkV1EncryptedPayloadMaintenanceCandidateBinding {
  return {
    candidateReferenceHash: value.candidateReferenceHash,
    ownerUserIdHash: value.ownerUserIdHash,
    idempotencyHash: value.idempotencyHash,
    jobId: value.jobId,
    payloadId: value.payloadId,
    requestHash: value.requestHash,
    payloadHandleHash: value.payloadHandleHash,
    payloadExpiresAt: value.payloadExpiresAt,
    payloadPolicyVersion: value.payloadPolicyVersion,
    payloadPolicySnapshotHash: value.payloadPolicySnapshotHash,
    encryptionProfileVersion: value.encryptionProfileVersion,
    kmsKeyVersionResourceHash: value.kmsKeyVersionResourceHash,
    backupDispositionVersion: value.backupDispositionVersion,
    deleteBindingHash: value.deleteBindingHash,
  };
}

function namespaceKey(value: Readonly<{
  ownerUserIdHash: string;
  idempotencyHash: string;
}>) {
  return `${value.ownerUserIdHash}:${value.idempotencyHash}`;
}

function uuid(prefix: number, value: number) {
  return `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function summary(
  overrides: Partial<{
    claimedCount: number;
    retainedCount: number;
    deferredCount: number;
    deletedCount: number;
    quarantinedCount: number;
    retryRequiredCount: number;
  }> = {},
) {
  return {
    claimedCount: 0,
    retainedCount: 0,
    deferredCount: 0,
    deletedCount: 0,
    quarantinedCount: 0,
    retryRequiredCount: 0,
    ...overrides,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
