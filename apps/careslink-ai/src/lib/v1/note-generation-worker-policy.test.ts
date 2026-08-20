import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES,
  CARESLINK_V1_NOTE_GENERATION_WORKER_POLICY_CATALOG,
  CARESLINK_V1_NOTE_GENERATION_WORKER_POLICY_READY,
  createCaresLinkV1NoteGenerationWorkerPolicyDigest,
  createTestOnlyCaresLinkV1NoteGenerationWorkerPolicyCatalog,
  parseCaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationWorkerPolicyDefinition,
} from "./note-generation-worker-policy";

vi.mock("server-only", () => ({}));

describe("CaresLink V1 Note generation worker policy", () => {
  it("keeps the runtime policy default-off with an empty current catalog", () => {
    expect(CARESLINK_V1_NOTE_GENERATION_WORKER_POLICY_READY).toBe(false);
    expect(CARESLINK_V1_NOTE_GENERATION_WORKER_POLICY_CATALOG).toEqual([]);
    expect(
      Object.isFrozen(CARESLINK_V1_NOTE_GENERATION_WORKER_POLICY_CATALOG),
    ).toBe(true);
  });

  it("parses a complete approved policy and freezes every nested value", () => {
    const policy = parseCaresLinkV1NoteGenerationWorkerPolicy(signedPolicy());

    expect(policy).toMatchObject({
      version: "worker-policy.preview.old",
      status: "APPROVED",
      maxAttempts: 3,
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.retryDelayMsAfterAttempt)).toBe(true);
    expect(Object.isFrozen(policy.retryableOutcomes)).toBe(true);
    expect(Object.isFrozen(policy.jitter)).toBe(true);
    expect(Reflect.set(policy, "leaseDurationMs", 1)).toBe(false);
    expect(Reflect.set(policy.retryDelayMsAfterAttempt, "0", 1)).toBe(false);
  });

  it("uses canonical field ordering and binds approval lifecycle into the digest", () => {
    const approved = policyDefinition();
    const reversed = Object.fromEntries(
      Object.entries(approved).reverse(),
    ) as CaresLinkV1NoteGenerationWorkerPolicyDefinition;
    const draft = { ...approved, status: "DRAFT" as const };

    expect(
      createCaresLinkV1NoteGenerationWorkerPolicyDigest(reversed),
    ).toBe(createCaresLinkV1NoteGenerationWorkerPolicyDigest(approved));
    expect(createCaresLinkV1NoteGenerationWorkerPolicyDigest(draft)).not.toBe(
      createCaresLinkV1NoteGenerationWorkerPolicyDigest(approved),
    );
  });

  it("rejects a missing policy field and any unreviewed extra field", () => {
    const missing = { ...signedPolicy() } as Record<string, unknown>;
    delete missing.leaseDurationMs;
    const extra = { ...signedPolicy(), fallbackLeaseDurationMs: 60_000 };

    expectContractCode(
      () => parseCaresLinkV1NoteGenerationWorkerPolicy(missing),
      "VALIDATION_ERROR",
    );
    expectContractCode(
      () => parseCaresLinkV1NoteGenerationWorkerPolicy(extra),
      "VALIDATION_ERROR",
    );
  });

  it("rejects a digest copied from different operational content", () => {
    const policy = signedPolicy();
    expectContractCode(
      () =>
        parseCaresLinkV1NoteGenerationWorkerPolicy({
          ...policy,
          maxQueueAgeMs: policy.maxQueueAgeMs + 1,
        }),
      "VALIDATION_ERROR",
    );
  });

  it.each([
    "maxQueueAgeMs",
    "minimumPayloadRemainingAtClaimMs",
    "leaseDurationMs",
    "heartbeatIntervalMs",
    "heartbeatSafetyMarginMs",
    "attemptDeadlineMs",
    "providerDeadlineMs",
    "commitSafetyMarginMs",
    "maxAttempts",
    "recoveryBatchLimit",
  ] as const)("requires a positive safe integer for %s", (field) => {
    for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expectContractCode(
        () =>
          parseCaresLinkV1NoteGenerationWorkerPolicy({
            ...signedPolicy(),
            [field]: invalid,
          }),
        "VALIDATION_ERROR",
      );
    }
  });

  it.each([
    {
      label: "heartbeat reaches the lease boundary",
      override: { heartbeatIntervalMs: 8_000 },
    },
    {
      label: "lease exceeds the hard attempt deadline",
      override: { leaseDurationMs: 30_001 },
    },
    {
      label: "provider work consumes the commit safety margin",
      override: { providerDeadlineMs: 20_001 },
    },
    {
      label: "payload lifetime is shorter than the attempt deadline",
      override: { minimumPayloadRemainingAtClaimMs: 29_999 },
    },
  ])("rejects when $label", ({ override }) => {
    expectContractCode(
      () =>
        parseCaresLinkV1NoteGenerationWorkerPolicy({
          ...signedPolicy(),
          ...override,
        }),
      "VALIDATION_ERROR",
    );
  });

  it("accepts explicitly reviewed equality at the provider and payload bounds", () => {
    expect(() =>
      parseCaresLinkV1NoteGenerationWorkerPolicy(signedPolicy()),
    ).not.toThrow();
  });

  it("requires an exact positive retry-delay vector", () => {
    for (const retryDelayMsAfterAttempt of [
      [1_000],
      [1_000, 2_000, 3_000],
      [1_000, 0],
      [1_000, -1],
      [1_000, 1.5],
    ]) {
      expectContractCode(
        () =>
          parseCaresLinkV1NoteGenerationWorkerPolicy({
            ...signedPolicy(),
            retryDelayMsAfterAttempt,
          }),
        "VALIDATION_ERROR",
      );
    }
  });

  it("accepts only unique, allowlisted retry outcomes", () => {
    expect(CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES).toEqual([
      "LEASE_EXPIRED",
      "PROVIDER_TIMEOUT",
      "PROVIDER_TRANSIENT",
    ]);
    for (const retryableOutcomes of [
      ["LEASE_EXPIRED", "LEASE_EXPIRED"],
      ["PROVIDER_PERMANENT"],
      ["SESSION_REVOKED"],
    ]) {
      expectContractCode(
        () =>
          parseCaresLinkV1NoteGenerationWorkerPolicy({
            ...signedPolicy(),
            retryableOutcomes,
          }),
        "VALIDATION_ERROR",
      );
    }
  });

  it("requires retry capability and retry budget to agree", () => {
    expect(() =>
      parseCaresLinkV1NoteGenerationWorkerPolicy(
        signedPolicy({
          maxAttempts: 1,
          retryDelayMsAfterAttempt: [],
          retryableOutcomes: [],
        }),
      ),
    ).not.toThrow();

    expectContractCode(
      () =>
        parseCaresLinkV1NoteGenerationWorkerPolicy({
          ...signedPolicy(),
          maxAttempts: 1,
          retryDelayMsAfterAttempt: [],
        }),
      "VALIDATION_ERROR",
    );
    expectContractCode(
      () =>
        parseCaresLinkV1NoteGenerationWorkerPolicy({
          ...signedPolicy(),
          retryableOutcomes: [],
        }),
      "VALIDATION_ERROR",
    );
  });

  it("requires an explicit and exact jitter mode", () => {
    expect(() =>
      parseCaresLinkV1NoteGenerationWorkerPolicy(
        signedPolicy({ jitter: { mode: "APPROVED_BOUNDED", maxMs: 500 } }),
      ),
    ).not.toThrow();

    for (const jitter of [
      { mode: "NONE", maxMs: 1 },
      { mode: "APPROVED_BOUNDED" },
      { mode: "APPROVED_BOUNDED", maxMs: 0 },
      { mode: "IMPLICIT" },
    ]) {
      expectContractCode(
        () =>
          parseCaresLinkV1NoteGenerationWorkerPolicy({
            ...signedPolicy(),
            jitter,
          }),
        "VALIDATION_ERROR",
      );
    }
  });

  it("stores drafts for review but never resolves them as runtime policy", () => {
    const draft = signedPolicy({ status: "DRAFT" });
    const catalog = testCatalog([draft]);

    expect(catalog.get(draft.version)).toMatchObject({ status: "DRAFT" });
    expectContractCode(
      () => catalog.requireApproved(draft.version),
      "GENERATION_FAILED",
    );
  });

  it("replays an identical catalog entry without duplicating its version", () => {
    const policy = signedPolicy();
    const catalog = testCatalog([policy, structuredClone(policy)]);

    expect(catalog.policies).toHaveLength(1);
    expect(catalog.get(policy.version)).toBe(catalog.policies[0]);
    expect(catalog.requireApproved(policy.version)).toBe(catalog.policies[0]);
  });

  it("rejects a version replay with changed content or lifecycle state", () => {
    const original = signedPolicy();
    const changed = signedPolicy({ maxQueueAgeMs: 61_000 });
    const draft = signedPolicy({ status: "DRAFT" });

    expectContractCode(
      () => testCatalog([original, changed]),
      "IDEMPOTENCY_CONFLICT",
    );
    expectContractCode(
      () => testCatalog([original, draft]),
      "IDEMPOTENCY_CONFLICT",
    );
  });

  it("keeps old and new immutable policy versions side by side", () => {
    const oldPolicy = signedPolicy();
    const newPolicy = signedPolicy({
      version: "worker-policy.preview.new",
      maxQueueAgeMs: 61_000,
    });
    const catalog = testCatalog([oldPolicy, newPolicy]);

    expect(catalog.policies.map(({ version }) => version)).toEqual([
      oldPolicy.version,
      newPolicy.version,
    ]);
    expect(catalog.requireApproved(oldPolicy.version).digest).toBe(
      oldPolicy.digest,
    );
    expect(catalog.requireApproved(newPolicy.version).digest).toBe(
      newPolicy.digest,
    );
    expect(catalog.requireApproved(oldPolicy.version)).not.toBe(
      catalog.requireApproved(newPolicy.version),
    );
  });

  it("requires the explicit TEST_ONLY catalog capability and exact fields", () => {
    for (const input of [
      { policies: [] },
      { capability: "RUNTIME", policies: [] },
      { capability: "TEST_ONLY", policies: [], enabled: true },
    ]) {
      expectContractCode(
        () =>
          createTestOnlyCaresLinkV1NoteGenerationWorkerPolicyCatalog(
            input as never,
          ),
        "VALIDATION_ERROR",
      );
    }
  });
});

function policyDefinition(
  override: Partial<CaresLinkV1NoteGenerationWorkerPolicyDefinition> = {},
): CaresLinkV1NoteGenerationWorkerPolicyDefinition {
  return {
    version: "worker-policy.preview.old",
    status: "APPROVED",
    maxQueueAgeMs: 60_000,
    minimumPayloadRemainingAtClaimMs: 30_000,
    leaseDurationMs: 10_000,
    heartbeatIntervalMs: 3_000,
    heartbeatSafetyMarginMs: 2_000,
    attemptDeadlineMs: 30_000,
    providerDeadlineMs: 20_000,
    commitSafetyMarginMs: 10_000,
    maxAttempts: 3,
    retryDelayMsAfterAttempt: [1_000, 2_000],
    retryableOutcomes: [...CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES],
    recoveryBatchLimit: 20,
    jitter: { mode: "NONE" },
    ...override,
  };
}

function signedPolicy(
  override: Partial<CaresLinkV1NoteGenerationWorkerPolicyDefinition> = {},
): CaresLinkV1NoteGenerationWorkerPolicy {
  const definition = policyDefinition(override);
  return {
    ...definition,
    digest:
      createCaresLinkV1NoteGenerationWorkerPolicyDigest(definition),
  };
}

function testCatalog(policies: readonly unknown[]) {
  return createTestOnlyCaresLinkV1NoteGenerationWorkerPolicyCatalog({
    capability: "TEST_ONLY",
    policies,
  });
}

function expectContractCode(operation: () => unknown, code: string) {
  let captured: unknown;
  try {
    operation();
  } catch (error) {
    captured = error;
  }
  expect(captured).toMatchObject({ code });
}
