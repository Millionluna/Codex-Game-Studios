import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_CURRENT_NOTE_PROVIDER_POLICIES,
  CARESLINK_V1_CURRENT_NOTE_PROVIDER_POLICY,
  CARESLINK_V1_NOTE_PROVIDER_READY,
  createCaresLinkV1NoteProviderAttemptEvidence,
  createCaresLinkV1NoteProviderCandidateDigest,
  createCaresLinkV1NoteProviderPolicySnapshot,
  createCaresLinkV1NoteProviderWorkerPolicyBinding,
  getCaresLinkV1NoteProviderPointRate,
  validateCaresLinkV1NoteProviderAttemptEvidence,
  validateCaresLinkV1NoteProviderPolicySnapshot,
  validateCaresLinkV1NoteProviderWorkerPolicyBinding,
  type CaresLinkV1NoteProviderPolicyCore,
  type CaresLinkV1NoteProviderPort,
} from "./note-generation-provider-policy";
import {
  CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES,
  createCaresLinkV1NoteGenerationWorkerPolicyDigest,
  type CaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationWorkerPolicyDefinition,
} from "./note-generation-worker-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

const PROVIDER_REQUEST_ID = "provider-request-sensitive-917";
const CANDIDATE = {
  englishDraft: "Observable support facts only.",
  reviewVersions: {
    "zh-Hans": "仅包含可观察的支持事实。",
    "zh-Hant": "僅包含可觀察的支援事實。",
  },
  missingFacts: [],
  neutralWordingChecks: [],
  followUpPrompts: [],
};

const NOTE_POINT_RATES = {
  communication: 20,
  handover: 25,
  progress: 35,
  ndis: 50,
  incident_factual: 60,
} as const;

describe("CaresLink V1 Note provider policy", () => {
  it("is fail-closed with no current provider or model fallback", () => {
    expect(CARESLINK_V1_NOTE_PROVIDER_READY).toBe(false);
    expect(CARESLINK_V1_CURRENT_NOTE_PROVIDER_POLICY).toBeUndefined();
    expect(CARESLINK_V1_CURRENT_NOTE_PROVIDER_POLICIES).toEqual({});
    expect(Object.isFrozen(CARESLINK_V1_CURRENT_NOTE_PROVIDER_POLICIES)).toBe(
      true,
    );
  });

  it.each(CARESLINK_V1_NOTE_TYPE_CODES)(
    "binds %s to its exact service and shadow rate catalog",
    (noteType) => {
      const policy = createPolicy(noteType);
      expect(policy).toMatchObject({
        noteType,
        serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        rateCatalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
        policyVersion: `policy.${noteType}.v1`,
        promptTemplateVersion: `prompt.${noteType}.v1`,
        goldenSetVersion: `golden.${noteType}.v1`,
        parserVersion: "parser.note-candidate.v1",
      });
      expect(policy.policyDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(getCaresLinkV1NoteProviderPointRate(policy).points).toBe(
        NOTE_POINT_RATES[noteType],
      );
    },
  );

  it.each(
    CARESLINK_V1_NOTE_TYPE_CODES.flatMap((noteType) =>
      CARESLINK_V1_LOCALES.map((locale) => [noteType, locale] as const),
    ),
  )("uses one provider port for %s in %s", async (noteType, sourceLocale) => {
    const policy = createPolicy(noteType);
    const generate = vi.fn(async (input) => ({
      candidate: CANDIDATE,
      evidence: createEvidence(input.policySnapshot, CANDIDATE, {
        workerPolicyBinding: input.workerPolicyBinding,
        workerPolicy: input.workerPolicy,
      }),
    }));
    const provider: CaresLinkV1NoteProviderPort = { generate };
    const signal = new AbortController().signal;
    const worker = workerPolicy();
    const timing = createCaresLinkV1NoteProviderWorkerPolicyBinding({
      policySnapshot: policy,
      workerPolicy: worker,
      startedAt: "2026-08-20T00:00:00.000Z",
    });

    const result = await provider.generate({
      workerPrivateCorrelation: "worker-attempt-digest-001",
      noteType,
      sourceLocale,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      cleanedFacts: { occurred_at: "2026-08-20T00:00:00.000Z" },
      workerPolicyBinding: timing,
      workerPolicy: worker,
      signal,
      policySnapshot: policy,
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        noteType,
        sourceLocale,
        policySnapshot: policy,
        signal,
      }),
    );
    expect(result.evidence.policyDigest).toBe(policy.policyDigest);
  });

  it("uses the approved worker policy as the single provider deadline authority", () => {
    const policy = createPolicy("communication");
    const worker = workerPolicy();
    const binding = createCaresLinkV1NoteProviderWorkerPolicyBinding({
      policySnapshot: policy,
      workerPolicy: worker,
      startedAt: "2026-08-20T00:00:00.000Z",
    });

    expect(binding).toEqual({
      providerPolicyDigest: policy.policyDigest,
      workerPolicyDigest: worker.digest,
      providerDeadlineMs: 30_000,
      startedAt: "2026-08-20T00:00:00.000Z",
      deadlineAt: "2026-08-20T00:00:30.000Z",
    });
    expect(
      validateCaresLinkV1NoteProviderWorkerPolicyBinding(
        binding,
        policy,
        worker,
      ),
    ).toEqual(binding);
    expectContractError(() =>
      validateCaresLinkV1NoteProviderWorkerPolicyBinding(
        { ...binding, workerPolicyDigest: "0".repeat(64) },
        policy,
        worker,
      ),
    );
    expectContractError(() =>
      validateCaresLinkV1NoteProviderWorkerPolicyBinding(
        binding,
        policy,
        workerPolicy({ status: "DRAFT" }),
      ),
    );
    expectContractError(() =>
      validateCaresLinkV1NoteProviderWorkerPolicyBinding(
        binding,
        policy,
        workerPolicy({
          minimumPayloadRemainingAtClaimMs: 39_999,
          attemptDeadlineMs: 39_999,
          providerDeadlineMs: 29_999,
        }),
      ),
    );
    expectContractError(() =>
      createCaresLinkV1NoteProviderWorkerPolicyBinding({
        policySnapshot: createCaresLinkV1NoteProviderPolicySnapshot({
          ...policyInput("communication"),
          timeoutMs: 29_999,
        }),
        workerPolicy: worker,
        startedAt: "2026-08-20T00:00:00.000Z",
      }),
    );
    expectContractError(() =>
      createCaresLinkV1NoteProviderWorkerPolicyBinding({
        policySnapshot: policy,
        workerPolicy: workerPolicy({ status: "DRAFT" }),
        startedAt: "2026-08-20T00:00:00.000Z",
      }),
    );
  });

  it("rejects attempt evidence that outlives the approved provider timeout", () => {
    const shortPolicy = createCaresLinkV1NoteProviderPolicySnapshot({
      ...policyInput("communication"),
      timeoutMs: 1_000,
    });
    expectContractError(() => createEvidence(shortPolicy, CANDIDATE));

    const normalPolicy = createPolicy("communication");
    const evidence = createEvidence(normalPolicy, CANDIDATE);
    expectContractError(() =>
      validateCaresLinkV1NoteProviderAttemptEvidence(evidence, {
        policySnapshot: shortPolicy,
        workerPolicyBinding: createWorkerBinding(shortPolicy),
        workerPolicy: createWorkerPolicy(shortPolicy),
        candidate: CANDIDATE,
      }),
    );
  });

  it("uses canonical JSON for a stable policy digest", () => {
    const input = policyInput("communication");
    const reversed = Object.fromEntries(Object.entries(input).reverse());
    const first = createCaresLinkV1NoteProviderPolicySnapshot(input);
    const second = createCaresLinkV1NoteProviderPolicySnapshot(reversed);
    const expected = createHash("sha256")
      .update(stringifyCaresLinkV1CanonicalJson(input), "utf8")
      .digest("hex");

    expect(first.policyDigest).toBe(expected);
    expect(second.policyDigest).toBe(expected);
    expect(
      createCaresLinkV1NoteProviderPolicySnapshot({
        ...input,
        goldenSetVersion: "golden.communication.v2",
      }).policyDigest,
    ).not.toBe(expected);
  });

  it("requires an exact closed policy snapshot with no guessed configuration", () => {
    const valid = policyInput("communication");
    for (const invalid of [
      without(valid, "providerId"),
      without(valid, "modelId"),
      without(valid, "policyVersion"),
      without(valid, "promptTemplateVersion"),
      without(valid, "goldenSetVersion"),
      without(valid, "parserVersion"),
      { ...valid, fallbackModel: "legacy-default" },
      { ...valid, serviceCode: "note.ndis.generate" },
      { ...valid, rateCatalogVersion: "unapproved" },
      { ...valid, timeoutMs: 0 },
    ]) {
      expectContractError(() =>
        createCaresLinkV1NoteProviderPolicySnapshot(invalid),
      );
    }
  });

  it("allows null modelRevision only when the provider exposes no revision", () => {
    expect(
      createCaresLinkV1NoteProviderPolicySnapshot({
        ...policyInput("ndis"),
        modelRevision: null,
        modelRevisionAvailability: "PROVIDER_NOT_EXPOSED",
      }),
    ).toMatchObject({
      modelRevision: null,
      modelRevisionAvailability: "PROVIDER_NOT_EXPOSED",
    });
    expectContractError(() =>
      createCaresLinkV1NoteProviderPolicySnapshot({
        ...policyInput("ndis"),
        modelRevision: null,
        modelRevisionAvailability: "EXACT",
      }),
    );
    expectContractError(() =>
      createCaresLinkV1NoteProviderPolicySnapshot({
        ...policyInput("ndis"),
        modelRevisionAvailability: "PROVIDER_NOT_EXPOSED",
      }),
    );
  });

  it("rejects a changed or malformed policy digest", () => {
    const policy = createPolicy("progress");
    expectContractError(() =>
      validateCaresLinkV1NoteProviderPolicySnapshot({
        ...policy,
        policyDigest: "0".repeat(64),
      }),
    );
    expectContractError(() =>
      validateCaresLinkV1NoteProviderPolicySnapshot({
        ...policy,
        unexpected: true,
      }),
    );
  });

  it("hashes candidate canonical JSON without retaining provider output", () => {
    const sensitiveCandidate = {
      ...CANDIDATE,
      englishDraft: "sensitive-provider-output-418",
    };
    const reordered = Object.fromEntries(
      Object.entries(sensitiveCandidate).reverse(),
    );
    const evidence = createEvidence(
      createPolicy("communication"),
      sensitiveCandidate,
    );

    expect(createCaresLinkV1NoteProviderCandidateDigest(reordered)).toBe(
      evidence.candidateDigest,
    );
    expect(evidence.candidateDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(evidence)).not.toContain(
      "sensitive-provider-output-418",
    );
    expect(evidence).not.toHaveProperty("candidate");
  });

  it("stores only a provider request ID hash and validates the candidate binding", () => {
    const policy = createPolicy("handover");
    const evidence = createEvidence(policy, CANDIDATE);

    expect(evidence.providerRequestIdHash).toBe(
      createHash("sha256").update(PROVIDER_REQUEST_ID, "utf8").digest("hex"),
    );
    expect(JSON.stringify(evidence)).not.toContain(PROVIDER_REQUEST_ID);
    expect(
      validateCaresLinkV1NoteProviderAttemptEvidence(evidence, {
        policySnapshot: policy,
        workerPolicyBinding: createWorkerBinding(policy),
        workerPolicy: createWorkerPolicy(policy),
        candidate: CANDIDATE,
      }),
    ).toEqual(evidence);
    expectContractError(() =>
      validateCaresLinkV1NoteProviderAttemptEvidence(evidence, {
        policySnapshot: policy,
        workerPolicyBinding: createWorkerBinding(policy),
        workerPolicy: createWorkerPolicy(policy),
        candidate: { ...CANDIDATE, englishDraft: "changed" },
      }),
    );
  });

  it("keeps unavailable usage absent rather than inventing zero token counts", () => {
    const evidence = createEvidence(createPolicy("progress"), CANDIDATE, {
      usage: { status: "UNAVAILABLE", source: "UNAVAILABLE" },
    });

    expect(evidence.usage).toEqual({
      status: "UNAVAILABLE",
      source: "UNAVAILABLE",
    });
    expect(evidence.usage).not.toHaveProperty("inputTokens");
    expect(evidence.usage).not.toHaveProperty("outputTokens");
    expect(evidence.usage).not.toHaveProperty("totalTokens");
  });

  it("accepts bounded reported usage without rewriting a reported zero", () => {
    const evidence = createEvidence(createPolicy("ndis"), CANDIDATE, {
      usage: {
        status: "REPORTED",
        source: "PROVIDER",
        inputTokens: 100,
        outputTokens: 0,
        totalTokens: 100,
        cachedInputTokens: 25,
        reasoningTokens: 0,
      },
    });
    expect(evidence.usage).toEqual({
      status: "REPORTED",
      source: "PROVIDER",
      inputTokens: 100,
      outputTokens: 0,
      totalTokens: 100,
      cachedInputTokens: 25,
      reasoningTokens: 0,
    });
  });

  it.each([
    { status: "REPORTED", source: "PROVIDER" },
    { status: "REPORTED", source: "PROVIDER", inputTokens: -1 },
    { status: "REPORTED", source: "PROVIDER", inputTokens: 1.5 },
    { status: "REPORTED", source: "PROVIDER", inputTokens: Number.NaN },
    {
      status: "REPORTED",
      source: "PROVIDER",
      inputTokens: 10,
      outputTokens: 10,
      totalTokens: 19,
    },
    { status: "UNAVAILABLE", source: "UNAVAILABLE", inputTokens: 0 },
    { status: "REPORTED", source: "UNKNOWN", inputTokens: 1 },
  ])("rejects unsafe or inconsistent usage %#", (usage) => {
    expectContractError(() =>
      createEvidence(createPolicy("ndis"), CANDIDATE, { usage }),
    );
  });

  it.each([
    ["REPORTED", "PROVIDER", "USD", "0"],
    ["REPORTED", "GATEWAY", "AUD", "0.000001"],
    ["CALCULATED", "SERVER_PRICING_CATALOG", "USD", "12.345678901234"],
  ] as const)(
    "accepts exact decimal cost %s/%s/%s/%s",
    (status, source, currency, decimalAmount) => {
      expect(
        createEvidence(createPolicy("incident_factual"), CANDIDATE, {
          cost: {
            status,
            source,
            currency,
            decimalAmount,
            pricingVersion: "provider-pricing.v1",
          },
        }).cost,
      ).toEqual({
        status,
        source,
        currency,
        decimalAmount,
        pricingVersion: "provider-pricing.v1",
      });
    },
  );

  it.each([
    { status: "REPORTED", source: "PROVIDER", currency: "usd", decimalAmount: "1", pricingVersion: "p.v1" },
    { status: "REPORTED", source: "PROVIDER", currency: "USD", decimalAmount: "01", pricingVersion: "p.v1" },
    { status: "REPORTED", source: "PROVIDER", currency: "USD", decimalAmount: "0.0", pricingVersion: "p.v1" },
    { status: "REPORTED", source: "PROVIDER", currency: "USD", decimalAmount: "1e-6", pricingVersion: "p.v1" },
    { status: "REPORTED", source: "SERVER_PRICING_CATALOG", currency: "USD", decimalAmount: "1", pricingVersion: "p.v1" },
    { status: "CALCULATED", source: "PROVIDER", currency: "USD", decimalAmount: "1", pricingVersion: "p.v1" },
    { status: "UNAVAILABLE", source: "UNAVAILABLE", decimalAmount: "0" },
  ])("rejects unsafe or ambiguous monetary cost %#", (cost) => {
    expectContractError(() =>
      createEvidence(createPolicy("incident_factual"), CANDIDATE, { cost }),
    );
  });

  it("rejects sensitive, raw or unversioned evidence fields", () => {
    const policy = createPolicy("communication");
    const evidence = createEvidence(policy, CANDIDATE);
    for (const forbidden of [
      { prompt: "secret prompt" },
      { cleanedFacts: { participant: "secret" } },
      { providerOutput: "raw output" },
      { rawError: "provider body" },
      { accessToken: "token" },
      { ownerUserId: "owner" },
      { sessionId: "session" },
      { privacyProof: "proof" },
      { apiKey: "key" },
      { providerRequestId: PROVIDER_REQUEST_ID },
    ]) {
      expectContractError(() =>
        validateCaresLinkV1NoteProviderAttemptEvidence(
          { ...evidence, ...forbidden },
          {
            policySnapshot: policy,
            workerPolicyBinding: createWorkerBinding(policy),
            workerPolicy: createWorkerPolicy(policy),
            candidate: CANDIDATE,
          },
        ),
      );
    }
  });

  it("keeps approved Points independent from model cost evidence", () => {
    const policy = createPolicy("communication");
    const lowCost = createEvidence(policy, CANDIDATE, {
      cost: {
        status: "REPORTED",
        source: "PROVIDER",
        currency: "USD",
        decimalAmount: "0.000001",
        pricingVersion: "pricing.v1",
      },
    });
    const highCost = createEvidence(policy, CANDIDATE, {
      cost: {
        status: "REPORTED",
        source: "PROVIDER",
        currency: "USD",
        decimalAmount: "99.99",
        pricingVersion: "pricing.v1",
      },
    });

    expect(lowCost.cost).not.toEqual(highCost.cost);
    expect(getCaresLinkV1NoteProviderPointRate(policy).points).toBe(20);
  });

  it("does not import the legacy NDIS fallback, network or environment config", () => {
    const source = readFileSync(
      new URL("./note-generation-provider-policy.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /openai-ndis-case-note|DEFAULT_MODEL|\bfetch\s*\(|https?:\/\/|process\.env|console\.|logger\./,
    );
  });

  it("does not write provider metadata or validation failures to logs", () => {
    const spies = [
      vi.spyOn(console, "debug").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    try {
      createEvidence(createPolicy("communication"), CANDIDATE);
      expectContractError(() =>
        createCaresLinkV1NoteProviderPolicySnapshot({
          ...policyInput("communication"),
          apiKey: "must-not-log",
        }),
      );
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

function createPolicy(noteType: CaresLinkV1NoteTypeCode) {
  return createCaresLinkV1NoteProviderPolicySnapshot(policyInput(noteType));
}

function policyInput(
  noteType: CaresLinkV1NoteTypeCode,
): CaresLinkV1NoteProviderPolicyCore {
  return {
    noteType,
    serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    rateCatalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    providerId: "provider.test-only",
    modelId: "model.test-only",
    modelRevision: "revision.test-only",
    modelRevisionAvailability: "EXACT",
    policyVersion: `policy.${noteType}.v1`,
    promptTemplateVersion: `prompt.${noteType}.v1`,
    goldenSetVersion: `golden.${noteType}.v1`,
    parserVersion: "parser.note-candidate.v1",
    timeoutMs: 30_000,
  };
}

function createEvidence(
  policySnapshot: ReturnType<typeof createPolicy>,
  candidate: unknown,
  overrides: Readonly<{
    usage?: unknown;
    cost?: unknown;
    workerPolicyBinding?: ReturnType<
      typeof createCaresLinkV1NoteProviderWorkerPolicyBinding
    >;
    workerPolicy?: CaresLinkV1NoteGenerationWorkerPolicy;
  }> = {},
) {
  const worker = overrides.workerPolicy ?? createWorkerPolicy(policySnapshot);
  return createCaresLinkV1NoteProviderAttemptEvidence({
    policySnapshot,
    workerPolicyBinding:
      overrides.workerPolicyBinding ??
      createWorkerBinding(policySnapshot, worker),
    workerPolicy: worker,
    candidate,
    finishedAt: "2026-08-20T00:00:01.250Z",
    finishReason: "COMPLETED",
    providerRequestId: PROVIDER_REQUEST_ID,
    usage: overrides.usage ?? {
      status: "REPORTED",
      source: "PROVIDER",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
    cost: overrides.cost ?? {
      status: "UNAVAILABLE",
      source: "UNAVAILABLE",
    },
  });
}

function createWorkerBinding(
  policySnapshot: ReturnType<typeof createPolicy>,
  worker = createWorkerPolicy(policySnapshot),
) {
  return createCaresLinkV1NoteProviderWorkerPolicyBinding({
    policySnapshot,
    workerPolicy: worker,
    startedAt: "2026-08-20T00:00:00.000Z",
  });
}

function createWorkerPolicy(policySnapshot: ReturnType<typeof createPolicy>) {
  return workerPolicy({
      minimumPayloadRemainingAtClaimMs: policySnapshot.timeoutMs + 1_000,
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 300,
      heartbeatSafetyMarginMs: 200,
      attemptDeadlineMs: policySnapshot.timeoutMs + 1_000,
      providerDeadlineMs: policySnapshot.timeoutMs,
      commitSafetyMarginMs: 1_000,
  });
}

function workerPolicy(
  overrides: Partial<CaresLinkV1NoteGenerationWorkerPolicyDefinition> = {},
): CaresLinkV1NoteGenerationWorkerPolicy {
  const definition: CaresLinkV1NoteGenerationWorkerPolicyDefinition = {
    version: "worker-policy.test-only.v1",
    status: "APPROVED",
    maxQueueAgeMs: 60_000,
    minimumPayloadRemainingAtClaimMs: 40_000,
    leaseDurationMs: 10_000,
    heartbeatIntervalMs: 3_000,
    heartbeatSafetyMarginMs: 2_000,
    attemptDeadlineMs: 40_000,
    providerDeadlineMs: 30_000,
    commitSafetyMarginMs: 10_000,
    maxAttempts: 3,
    retryDelayMsAfterAttempt: [1_000, 2_000],
    retryableOutcomes: [...CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES],
    recoveryBatchLimit: 20,
    jitter: { mode: "NONE" },
    ...overrides,
  };
  return {
    ...definition,
    digest: createCaresLinkV1NoteGenerationWorkerPolicyDigest(definition),
  };
}

function without<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K,
) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function expectContractError(run: () => unknown) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CaresLinkV1ContractError);
  expect((thrown as CaresLinkV1ContractError).code).toBe("VALIDATION_ERROR");
}
