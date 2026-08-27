import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES } from "./communication-note-golden";
import { CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE } from "./communication-note-openai-request-template";
import { CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN } from "./communication-note-preview-evaluation-policy";
import { CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST } from "./communication-note-preview-evaluation-manifest";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST,
  calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd,
  createCaresLinkV1CommunicationNotePreviewEvaluationContractTestRunner,
  createCaresLinkV1CommunicationNotePreviewEvaluationRunner,
  createCaresLinkV1CommunicationNotePreviewRunnerPolicyDigest,
  validateCaresLinkV1CommunicationNotePreviewEvaluationReport,
  validateCaresLinkV1CommunicationNotePreviewRunnerPolicy,
  type CaresLinkV1CommunicationNotePreviewEvaluationReport,
  type CaresLinkV1CommunicationNotePreviewRunnerFailureReason,
} from "./communication-note-preview-evaluation-runner.server";
import { CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_EVALUATION_MODEL_ID } from "./communication-note-provider-policy";
import {
  buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest,
  createCaresLinkV1OpenAiCommunicationNoteContractTestProvider,
  type CaresLinkV1OpenAiCommunicationNoteFetch,
} from "./openai-communication-note-provider.server";

vi.mock("server-only", () => ({}));

const VALID_REVIEWS = Object.freeze([
  Object.freeze({ locale: "en" as const, passed: true as const }),
  Object.freeze({ locale: "zh-Hans" as const, passed: true as const }),
  Object.freeze({ locale: "zh-Hant" as const, passed: true as const }),
]);

type PreviewRequest = ReturnType<
  typeof buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest
>;

describe("Communication Note one-shot preview evaluation runner", () => {
  it("pins the source-only runner and no-retry worker policies", () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_READY).toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY).toMatchObject({
      status: "SOURCE_ONLY_AWAITING_EXPLICIT_PAID_PREVIEW_APPROVAL",
      capability: "SOURCE_CONTRACT_ONLY",
      runnerPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST,
      execution: {
        ordering: "SERIAL_MANIFEST_ORDER",
        maximumCalls: 6,
        automaticRetry: false,
        terminalFailure: true,
        sameRunIdReplay: "RETURN_SAME_TERMINAL_PROMISE",
        differentRunIdReplay: "REJECT",
        approvalStorage: "NOT_IMPLEMENTED",
        providerTransport: "MOCK_INJECTION_ONLY",
        injectedCallbackDeadlineMs: 5_000,
        injectedCallbacksSecurityBoundary:
          "TRUSTED_TEST_CODE_NOT_A_SECURITY_BOUNDARY",
      },
      preflight: {
        inputTokenCounter: "INJECTED_MOCK_ONLY",
        maxInputTokensPerCall: 10_000,
        maxOutputTokensPerCall: 2_400,
        reservationCachedInputTokens: 0,
        projectedCostMicroUsdPerCall: 20_130,
        projectedCostMicroUsd: 120_780,
      },
      budget: {
        currency: "USD",
        maxCostMicroUsd: 250_000,
        pricingNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE",
      },
      report: {
        contentFree: true,
        authenticity: "UNATTESTED_TEST_CONTRACT_ONLY",
        requiredCandidateCount: 6,
        requiredLanguageDraftReviewCount: 18,
        humanReviewMode: "INJECTED_MOCK_CONTRACT_ONLY",
      },
    });
    const { runnerPolicyDigest: _digest, ...core } =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY;
    expect(_digest).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST,
    );
    expect(
      createCaresLinkV1CommunicationNotePreviewRunnerPolicyDigest(core),
    ).toBe(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY_DIGEST);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY).toMatchObject({
      status: "APPROVED",
      maxAttempts: 1,
      retryDelayMsAfterAttempt: [],
      retryableOutcomes: [],
      providerDeadlineMs: 30_000,
      digest: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_WORKER_POLICY_DIGEST,
    });
    expect(
      validateCaresLinkV1CommunicationNotePreviewRunnerPolicy(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY,
      ),
    ).toBe(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY);
    expect(Object.isFrozen(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY)).toBe(
      true,
    );
    expect(
      Object.isFrozen(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY.execution,
      ),
    ).toBe(true);
  });

  it("rejects runner-policy drift and keeps the paid factory unavailable", () => {
    expect(() =>
      validateCaresLinkV1CommunicationNotePreviewRunnerPolicy({
        ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY,
        execution: {
          ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY.execution,
          maximumCalls: 7,
        },
      }),
    ).toThrow(/does not match M1f/);

    expect(() =>
      createCaresLinkV1CommunicationNotePreviewEvaluationRunner({
        capability: "DISPOSABLE_SYNTHETIC_DEIDENTIFIED_PREVIEW_ONLY",
        evaluationPlanSnapshot:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
        runnerPolicySnapshot:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_POLICY,
        clock: { now: () => "2026-08-27T00:00:00.000Z" },
      }),
    ).toThrow("Communication Note preview evaluation runner is unavailable");
  });

  it("preflights all six fixed slots, then runs serially and returns only content-free evidence", async () => {
    const events: string[] = [];
    const harness = createHarness({ events });

    const report = await harness.runner.run(runInput("preview-run-001"));

    expect(harness.fetchImpl).toHaveBeenCalledTimes(6);
    expect(harness.tokenCounter).toHaveBeenCalledTimes(6);
    expect(harness.reviewer).toHaveBeenCalledTimes(6);
    expect(events.slice(0, 6)).toEqual(Array(6).fill("preflight"));
    expect(events.slice(6)).toEqual([
      "provider:1",
      "review:1",
      "provider:2",
      "review:2",
      "provider:3",
      "review:3",
      "provider:4",
      "review:4",
      "provider:5",
      "review:5",
      "provider:6",
      "review:6",
    ]);
    expect(report).toMatchObject({
      status: "PASS",
      callsDispatched: 6,
      candidatesAccepted: 6,
      languageDraftReviewsPassed: 18,
      projectedCostMicroUsd: 120_780,
      calculatedCostUpperBoundMicroUsd: 2_886,
      currency: "USD",
      costNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE",
      authenticity: "UNATTESTED_TEST_CONTRACT_ONLY",
    });
    expect(report.slots.map(({ fixtureId, runOrdinal }) => ({
      fixtureId,
      runOrdinal,
    }))).toEqual(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST.slots);
    expect(report.slots.every((slot) => slot.humanReviews.length === 3)).toBe(
      true,
    );
    expect(report.slots.every((slot) => slot.calculatedCostUpperBoundMicroUsd === 481)).toBe(
      true,
    );
    expect(validateCaresLinkV1CommunicationNotePreviewEvaluationReport(report)).toEqual(
      report,
    );
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.slots)).toBe(true);
    expect(Object.isFrozen(report.slots[0].usage)).toBe(true);
    expect(Object.isFrozen(report.slots[0].humanReviews)).toBe(true);

    expect(harness.requests).toHaveLength(6);
    for (const [index, request] of harness.requests.entries()) {
      const fixture =
        CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES[
          Math.floor(index / 2)
      ];
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.input)).toBe(true);
      expect(Object.isFrozen(request.input[1])).toBe(true);
      expect(request).toMatchObject({
        model: CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_EVALUATION_MODEL_ID,
        service_tier: "default",
        max_output_tokens: 2_400,
        reasoning: { effort: "none" },
      });
      expect(JSON.parse(request.input[1].content)).toEqual({
        noteType: "communication",
        sourceLocale: fixture.sourceLocale,
        cleanedFacts: fixture.cleanedFacts,
      });
      expect(report.slots[index].renderedRequestDigest).toBe(
        canonicalDigest(request),
      );
    }

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("preview-run-001");
    for (let call = 1; call <= 6; call += 1) {
      expect(serialized).not.toContain(`resp_sensitive_preview_${call}`);
    }
    for (const fixture of CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES) {
      for (const sensitive of [
        ...stringLeaves(fixture.cleanedFacts),
        ...stringLeaves(fixture.passingCandidate),
      ]) {
        expect(serialized).not.toContain(sensitive);
      }
    }
    expect(serialized).not.toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE.systemMessage
        .content,
    );
    expect(serialized).not.toContain(
      JSON.stringify(
        CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE.text,
      ),
    );
  });

  it("uses integer ceiling arithmetic for the fixed AU-residency pricing snapshot", () => {
    expect(
      calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
        inputTokens: 120,
        cachedInputTokens: 20,
        outputTokens: 80,
      }),
    ).toBe(481);
    expect(
      calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
        inputTokens: 120,
        cachedInputTokens: 0,
        outputTokens: 80,
      }),
    ).toBe(495);
    expect(
      calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
        inputTokens: 1,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(1);
    expect(
      calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0);
    expect(() =>
      calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
        inputTokens: 1,
        cachedInputTokens: 2,
        outputTokens: 0,
      }),
    ).toThrow(/cached input tokens exceed/);
    expect(() =>
      calculateCaresLinkV1CommunicationNotePreviewCostMicroUsd({
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(/calculated cost is invalid/);
  });

  it("assumes zero cached input conservatively when the provider omits cache details", async () => {
    const harness = createHarness({
      usage: () => ({
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
      }),
    });

    const report = await harness.runner.run(runInput("preview-run-no-cache"));

    expect(report.calculatedCostUpperBoundMicroUsd).toBe(2_970);
    expect(report.slots[0].usage).toMatchObject({
      cachedInputTokens: 0,
      cachedInputTokensReconciliation: "ASSUMED_ZERO",
      reasoningTokens: null,
      reasoningTokensReconciliation: "UNAVAILABLE",
    });
  });

  it("distinguishes calculated totals from explicitly reported zero details", async () => {
    const calculated = await createHarness({
      usage: () => ({
        input_tokens: 120,
        output_tokens: 80,
        input_tokens_details: { cached_tokens: 120 },
      }),
    }).runner.run(runInput("preview-run-calculated-total"));
    expect(calculated.slots[0].usage).toMatchObject({
      totalTokens: 200,
      totalTokensReconciliation: "CALCULATED",
      cachedInputTokens: 120,
      cachedInputTokensReconciliation: "REPORTED",
      reasoningTokens: null,
      reasoningTokensReconciliation: "UNAVAILABLE",
    });
    expect(calculated.slots[0].calculatedCostUpperBoundMicroUsd).toBe(406);

    const explicitZero = await createHarness({
      usage: () => ({
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      }),
    }).runner.run(runInput("preview-run-explicit-zero-details"));
    expect(explicitZero.slots[0].usage).toMatchObject({
      cachedInputTokens: 0,
      cachedInputTokensReconciliation: "REPORTED",
      reasoningTokens: 0,
      reasoningTokensReconciliation: "REPORTED",
    });
  });

  it("accepts the exact per-call and aggregate reservation ceiling", async () => {
    const report = await createHarness({
      tokenCount: () => 10_000,
      usage: () => ({
        input_tokens: 10_000,
        output_tokens: 2_400,
        total_tokens: 12_400,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      }),
    }).runner.run(runInput("preview-run-exact-budget-ceiling"));

    expect(
      report.slots.every(
        ({ calculatedCostUpperBoundMicroUsd }) =>
          calculatedCostUpperBoundMicroUsd === 20_130,
      ),
    ).toBe(true);
    expect(report.calculatedCostUpperBoundMicroUsd).toBe(120_780);
  });

  it("requires every input-token preflight to pass before dispatching a provider call", async () => {
    const harness = createHarness({
      tokenCount: (call) => (call === 4 ? 10_001 : 120),
    });

    await expectFailure(
      harness.runner.run(runInput("preview-run-preflight-fail")),
      "INPUT_TOKEN_PREFLIGHT_FAILED",
    );
    expect(harness.tokenCounter).toHaveBeenCalledTimes(4);
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.reviewer).not.toHaveBeenCalled();
  });

  it("rejects every invalid token-counter result before provider dispatch", async () => {
    const invalidValues = [
      undefined,
      0,
      -1,
      1.5,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
      10_001,
    ];
    for (const [index, value] of invalidValues.entries()) {
      const harness = createHarness({
        tokenCount: () => value as number,
      });
      await expectFailure(
        harness.runner.run(runInput(`preview-run-invalid-token-${index}`)),
        "INPUT_TOKEN_PREFLIGHT_FAILED",
      );
      expect(harness.tokenCounter).toHaveBeenCalledTimes(1);
      expect(harness.fetchImpl).not.toHaveBeenCalled();
    }

    const sensitive = "sensitive-tokenizer-error-with-raw-prompt";
    const throwing = createHarness({
      tokenCount: () => {
        throw new Error(sensitive);
      },
    });
    const error = await captureFailure(
      throwing.runner.run(runInput("preview-run-token-throw")),
    );
    expect(error).toMatchObject({
      reason: "INPUT_TOKEN_PREFLIGHT_FAILED",
      message: "Communication Note preview evaluation failed",
    });
    expect(JSON.stringify(error)).not.toContain(sensitive);
    expect(String(error)).not.toContain(sensitive);
    expect(throwing.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [
      "missing input/output usage",
      () => ({ total_tokens: 200 }),
    ],
    [
      "inconsistent total usage",
      () => ({
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 201,
      }),
    ],
    [
      "cached input above total input",
      () => ({
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
        input_tokens_details: { cached_tokens: 121 },
      }),
    ],
    [
      "reasoning above output",
      () => ({
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
        output_tokens_details: { reasoning_tokens: 81 },
      }),
    ],
    [
      "actual input above preflight",
      () => ({
        input_tokens: 121,
        output_tokens: 80,
        total_tokens: 201,
      }),
    ],
    [
      "output above the fixed ceiling",
      () => ({
        input_tokens: 120,
        output_tokens: 2_401,
        total_tokens: 2_521,
      }),
    ],
    [
      "zero input usage",
      () => ({
        input_tokens: 0,
        output_tokens: 80,
        total_tokens: 80,
      }),
    ],
    [
      "zero output usage",
      () => ({
        input_tokens: 120,
        output_tokens: 0,
        total_tokens: 120,
      }),
    ],
  ])("fails closed without retry for %s", async (_label, usage) => {
    const harness = createHarness({ usage });

    await expectFailure(
      harness.runner.run(
        runInput(`preview-run-usage-${_label}`.replace(/[^A-Za-z0-9._:-]/g, "-")),
      ),
      "PROVIDER_EVIDENCE_INVALID",
    );
    expect(harness.fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.reviewer).not.toHaveBeenCalled();
  });

  it("stops on the first provider failure and never retries or reaches a seventh call", async () => {
    const harness = createHarness({ failAt: 3 });
    const promise = harness.runner.run(runInput("preview-run-provider-fail"));

    await expectFailure(promise, "PROVIDER_FAILED");
    expect(harness.fetchImpl).toHaveBeenCalledTimes(3);
    expect(harness.reviewer).toHaveBeenCalledTimes(2);

    await expectFailure(
      harness.runner.run(runInput("preview-run-provider-fail")),
      "PROVIDER_FAILED",
    );
    expect(harness.fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("stops at a schema-valid golden-marker failure without review or retry", async () => {
    const harness = createHarness({
      candidate: (call, fixture) => {
        if (call !== 3) return fixture.passingCandidate;
        return {
          ...fixture.passingCandidate,
          englishDraft: fixture.passingCandidate.englishDraft.replaceAll(
            "coordinator",
            "staff member",
          ),
          reviewVersions: {
            "zh-Hans": fixture.passingCandidate.reviewVersions[
              "zh-Hans"
            ]?.replaceAll("协调员", "工作人员"),
            "zh-Hant": fixture.passingCandidate.reviewVersions[
              "zh-Hant"
            ]?.replaceAll("協調員", "工作人員"),
          },
        };
      },
    });

    await expectFailure(
      harness.runner.run(runInput("preview-run-golden-fail")),
      "GOLDEN_EVALUATION_FAILED",
    );
    expect(harness.fetchImpl).toHaveBeenCalledTimes(3);
    expect(harness.reviewer).toHaveBeenCalledTimes(2);
  });

  it("cannot report STRICT_SCHEMA when a response exceeds the literal 16-item limit", async () => {
    const harness = createHarness({
      candidate: (_call, fixture) => ({
        ...fixture.passingCandidate,
        neutralWordingChecks: Array(17).fill("reviewed"),
      }),
    });

    await expectFailure(
      harness.runner.run(runInput("preview-run-schema-item-limit")),
      "PROVIDER_FAILED",
    );
    expect(harness.fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.reviewer).not.toHaveBeenCalled();
  });

  it("requires one non-null unique provider request hash per slot", async () => {
    const missing = createHarness({ responseId: () => null });
    await expectFailure(
      missing.runner.run(runInput("preview-run-missing-response-id")),
      "PROVIDER_EVIDENCE_INVALID",
    );
    expect(missing.fetchImpl).toHaveBeenCalledTimes(1);

    const duplicate = createHarness({ responseId: () => "resp_duplicate" });
    await expectFailure(
      duplicate.runner.run(runInput("preview-run-duplicate-response-id")),
      "PROVIDER_EVIDENCE_INVALID",
    );
    expect(duplicate.fetchImpl).toHaveBeenCalledTimes(2);
    expect(duplicate.reviewer).toHaveBeenCalledTimes(1);
  });

  it("returns one promise for concurrent and replayed use of the same run ID", async () => {
    const harness = createHarness();
    const first = harness.runner.run(runInput("preview-run-idempotent"));
    const concurrent = harness.runner.run(runInput("preview-run-idempotent"));

    expect(concurrent).toBe(first);
    const firstReport = await first;
    const replayReport = await harness.runner.run(
      runInput("preview-run-idempotent"),
    );
    expect(replayReport).toBe(firstReport);
    expect(harness.fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("installs the one-shot claim before a trusted callback can reenter run", async () => {
    const runnerRef: {
      current?: ReturnType<
        typeof createCaresLinkV1CommunicationNotePreviewEvaluationContractTestRunner
      >;
    } = {};
    let reentrant:
      | Promise<CaresLinkV1CommunicationNotePreviewEvaluationReport>
      | undefined;
    const harness = createHarness({
      tokenCount: (call) => {
        if (call === 1) {
          const runner = runnerRef.current;
          if (!runner) throw new Error("test runner was not installed");
          reentrant = runner.run(runInput("preview-run-reentrant"));
        }
        return 120;
      },
    });
    runnerRef.current = harness.runner;

    const first = harness.runner.run(runInput("preview-run-reentrant"));
    const report = await first;

    expect(reentrant).toBe(first);
    expect(report.callsDispatched).toBe(6);
    expect(harness.fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("rejects a different run ID once the one-shot runner is claimed", async () => {
    const harness = createHarness();
    const first = harness.runner.run(runInput("preview-run-a"));

    expect(() => harness.runner.run(runInput("preview-run-b"))).toThrow(
      expect.objectContaining({ reason: "RUN_CONFLICT" }),
    );
    await first;
    expect(harness.fetchImpl).toHaveBeenCalledTimes(6);
  });

  it.each([
    ["missing locale", VALID_REVIEWS.slice(0, 2)],
    [
      "duplicate locale",
      [VALID_REVIEWS[0], VALID_REVIEWS[0], VALID_REVIEWS[2]],
    ],
    [
      "failed review",
      [VALID_REVIEWS[0], { locale: "zh-Hans", passed: false }, VALID_REVIEWS[2]],
    ],
  ])("fails terminally for %s", async (_label, reviewResult) => {
    const harness = createHarness({ reviewResult });

    await expectFailure(
      harness.runner.run(runInput(`preview-run-review-${_label}`.replaceAll(" ", "-"))),
      "HUMAN_REVIEW_FAILED",
    );
    expect(harness.fetchImpl).toHaveBeenCalledTimes(1);
    expect(harness.reviewer).toHaveBeenCalledTimes(1);
  });

  it("freezes each candidate before review and rebinds its digest afterward", async () => {
    const mutationResults: boolean[] = [];
    const harness = createHarness({
      review: (_call, input) => {
        const candidate = (input as { candidate: Record<string, unknown> })
          .candidate;
        expect(Object.isFrozen(candidate)).toBe(true);
        expect(Object.isFrozen(candidate.reviewVersions)).toBe(true);
        mutationResults.push(
          Reflect.set(candidate, "englishDraft", "mutated after checks"),
        );
        return VALID_REVIEWS;
      },
    });

    const report = await harness.runner.run(
      runInput("preview-run-frozen-review-candidate"),
    );

    expect(report.status).toBe("PASS");
    expect(mutationResults).toEqual(Array(6).fill(false));
  });

  it("never exposes a trusted reviewer callback's sensitive error text", async () => {
    const sensitive = "sensitive-review-error-with-generated-draft";
    const harness = createHarness({
      review: () => {
        throw new Error(sensitive);
      },
    });

    const error = await captureFailure(
      harness.runner.run(runInput("preview-run-review-error-redaction")),
    );

    expect(error).toMatchObject({ reason: "HUMAN_REVIEW_FAILED" });
    expect(String(error)).not.toContain(sensitive);
    expect(JSON.stringify(error)).not.toContain(sensitive);
  });

  it("rejects forged providers before token counting or execution", () => {
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewEvaluationContractTestRunner({
        capability: "MOCKED_CONTRACT_TEST_ONLY",
        provider: Object.freeze({ generate: vi.fn() }),
        countInputTokens: vi.fn(() => 120),
        reviewCandidate: vi.fn(async () => VALID_REVIEWS),
        clock: { now: () => "2026-08-27T00:00:00.000Z" },
      }),
    ).toThrow("Communication Note provider configuration is unavailable");
  });

  it("rejects a pre-aborted run without any token, provider or reviewer work", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    controller.abort();

    await expectFailure(
      harness.runner.run({
        runId: "preview-run-cancelled",
        signal: controller.signal,
      }),
      "CANCELLED",
    );
    expect(harness.tokenCounter).not.toHaveBeenCalled();
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.reviewer).not.toHaveBeenCalled();
  });

  it("cancels a pending preflight callback and preserves the rejected replay", async () => {
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const harness = createHarness({
      tokenCount: () =>
        new Promise<number>(() => {
          markStarted?.();
        }),
    });
    const controller = new AbortController();
    const promise = harness.runner.run({
      runId: "preview-run-cancel-preflight",
      signal: controller.signal,
    });

    await started;
    controller.abort();

    await expectFailure(promise, "CANCELLED");
    await expectFailure(
      harness.runner.run(runInput("preview-run-cancel-preflight")),
      "CANCELLED",
    );
    expect(harness.tokenCounter).toHaveBeenCalledTimes(1);
    expect(harness.fetchImpl).not.toHaveBeenCalled();
  });

  it("cancels a pending sixth review and ignores its late success", async () => {
    let markStarted: (() => void) | undefined;
    let releaseReview:
      | ((reviews: typeof VALID_REVIEWS) => void)
      | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const harness = createHarness({
      review: (call) =>
        call === 6
          ? new Promise<typeof VALID_REVIEWS>((resolve) => {
              releaseReview = resolve;
              markStarted?.();
            })
          : VALID_REVIEWS,
    });
    const controller = new AbortController();
    const promise = harness.runner.run({
      runId: "preview-run-cancel-sixth-review",
      signal: controller.signal,
    });

    await started;
    controller.abort();

    await expectFailure(promise, "CANCELLED");
    releaseReview?.(VALID_REVIEWS);
    await Promise.resolve();
    await expectFailure(
      harness.runner.run(runInput("preview-run-cancel-sixth-review")),
      "CANCELLED",
    );
    expect(harness.fetchImpl).toHaveBeenCalledTimes(6);
    expect(harness.reviewer).toHaveBeenCalledTimes(6);
  });

  it("times out a trusted test callback without dispatch or retry", async () => {
    vi.useFakeTimers();
    try {
      let markStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const harness = createHarness({
        tokenCount: () =>
          new Promise<number>(() => {
            markStarted?.();
          }),
      });
      const promise = harness.runner.run(
        runInput("preview-run-preflight-timeout"),
      );
      const failure = expectFailure(
        promise,
        "INPUT_TOKEN_PREFLIGHT_FAILED",
      );

      await started;
      await vi.advanceTimersByTimeAsync(5_000);

      await failure;
      await expectFailure(
        harness.runner.run(runInput("preview-run-preflight-timeout")),
        "INPUT_TOKEN_PREFLIGHT_FAILED",
      );
      expect(harness.tokenCounter).toHaveBeenCalledTimes(1);
      expect(harness.fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels an in-flight provider attempt terminally even if the mock transport waits", async () => {
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const fetchImpl = vi.fn<CaresLinkV1OpenAiCommunicationNoteFetch>(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          markStarted?.();
          const signal = init.signal;
          if (!(signal instanceof AbortSignal)) {
            reject(new Error("missing signal"));
            return;
          }
          const rejectCancelled = () => reject(new Error("cancelled"));
          signal.addEventListener("abort", rejectCancelled, { once: true });
          if (signal.aborted) rejectCancelled();
        }),
    );
    const provider =
      createCaresLinkV1OpenAiCommunicationNoteContractTestProvider({
        capability: "MOCKED_CONTRACT_TEST_ONLY",
        evaluationPlanSnapshot:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
        fetchImpl,
        clock: { now: () => "2026-08-27T00:00:00.500Z" },
      });
    const runner =
      createCaresLinkV1CommunicationNotePreviewEvaluationContractTestRunner({
        capability: "MOCKED_CONTRACT_TEST_ONLY",
        provider,
        countInputTokens: () => 120,
        reviewCandidate: async () => VALID_REVIEWS,
        clock: { now: () => "2026-08-27T00:00:00.000Z" },
      });
    const controller = new AbortController();
    const promise = runner.run({
      runId: "preview-run-cancel-in-flight",
      signal: controller.signal,
    });

    await started;
    controller.abort();

    await expectFailure(promise, "CANCELLED");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("enforces the provider deadline when the trusted transport ignores abort", async () => {
    vi.useFakeTimers();
    try {
      let markStarted: (() => void) | undefined;
      let releaseFetch: ((value: Response) => void) | undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const fetchImpl = vi.fn<CaresLinkV1OpenAiCommunicationNoteFetch>(
        async () =>
          new Promise<Response>((resolve) => {
            releaseFetch = resolve;
            markStarted?.();
          }),
      );
      const provider =
        createCaresLinkV1OpenAiCommunicationNoteContractTestProvider({
          capability: "MOCKED_CONTRACT_TEST_ONLY",
          evaluationPlanSnapshot:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
          fetchImpl,
          clock: { now: () => "2026-08-27T00:00:00.500Z" },
        });
      const reviewer = vi.fn(async () => VALID_REVIEWS);
      const runner =
        createCaresLinkV1CommunicationNotePreviewEvaluationContractTestRunner({
          capability: "MOCKED_CONTRACT_TEST_ONLY",
          provider,
          countInputTokens: () => 120,
          reviewCandidate: reviewer,
          clock: { now: () => "2026-08-27T00:00:00.000Z" },
        });
      const promise = runner.run(runInput("preview-run-provider-timeout"));
      const failure = expectFailure(promise, "PROVIDER_FAILED");

      await started;
      await vi.advanceTimersByTimeAsync(30_000);

      await failure;
      releaseFetch?.(
        response(
          completedPayload(
            CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES[0]
              .passingCandidate,
            1,
          ),
        ),
      );
      await Promise.resolve();
      await expectFailure(
        runner.run(runInput("preview-run-provider-timeout")),
        "PROVIDER_FAILED",
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(reviewer).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates the complete report shape, bindings, ordering and digest", async () => {
    const report = await createHarness().runner.run(
      runInput("preview-run-report-validation"),
    );
    const cases = [
      tamperAndResignReport(report, (value) => {
        value.extra = true;
      }),
      tamperReport(report, (value) => {
        value.reportDigest = "0".repeat(64);
      }),
      tamperAndResignReport(report, (value) => {
        const slots = value.slots as Array<Record<string, unknown>>;
        slots.pop();
      }),
      tamperAndResignReport(report, (value) => {
        const slots = value.slots as Array<Record<string, unknown>>;
        slots[1] = structuredClone(slots[0]);
      }),
      tamperAndResignReport(report, (value) => {
        const slots = value.slots as Array<Record<string, unknown>>;
        const usage = slots[0].usage as Record<string, unknown>;
        usage.cachedInputTokens = 121;
      }),
      tamperAndResignReport(report, (value) => {
        value.calculatedCostUpperBoundMicroUsd = 250_001;
      }),
      tamperAndResignReport(report, (value) => {
        const slots = value.slots as Array<Record<string, unknown>>;
        slots[1].providerRequestIdHash = slots[0].providerRequestIdHash;
      }),
    ];

    for (const candidate of cases) {
      expect(() =>
        validateCaresLinkV1CommunicationNotePreviewEvaluationReport(candidate),
      ).toThrow();
    }
  });

  it("labels its self-digest as integrity-only rather than source authentication", async () => {
    const report = await createHarness().runner.run(
      runInput("preview-run-report-authenticity"),
    );
    const opaqueDigestReplacement = tamperAndResignReport(report, (value) => {
      const slots = value.slots as Array<Record<string, unknown>>;
      slots[0].candidateDigest = "1".repeat(64);
      value.runIdHash = "2".repeat(64);
    });

    expect(
      validateCaresLinkV1CommunicationNotePreviewEvaluationReport(
        opaqueDigestReplacement,
      ),
    ).toMatchObject({
      authenticity: "UNATTESTED_TEST_CONTRACT_ONLY",
      runIdHash: "2".repeat(64),
    });
  });

  it("contains no environment lookup, global fetch, HTTPS URL, credential or key path", () => {
    const source = readFileSync(
      new URL(
        "./communication-note-preview-evaluation-runner.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toContain("process.env");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });
});

type HarnessOptions = Readonly<{
  events?: string[];
  failAt?: number;
  tokenCount?: (
    call: number,
    request: PreviewRequest,
  ) => number | Promise<number>;
  usage?: (call: number) => unknown;
  candidate?: (
    call: number,
    fixture: (typeof CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES)[number],
  ) => unknown;
  responseId?: (call: number) => string | null;
  review?: (call: number, input: unknown) => unknown | Promise<unknown>;
  reviewResult?: unknown;
}>;

function createHarness(options: HarnessOptions = {}) {
  let providerCall = 0;
  let tokenCall = 0;
  let reviewCall = 0;
  let runnerClockCall = 0;
  const events = options.events ?? [];
  const requests: PreviewRequest[] = [];
  const fetchImpl = vi.fn<CaresLinkV1OpenAiCommunicationNoteFetch>(
    async () => {
      providerCall += 1;
      events.push(`provider:${providerCall}`);
      if (providerCall > 6) {
        throw new Error("unexpected seventh provider call");
      }
      if (options.failAt === providerCall) {
        return new Response(JSON.stringify({ error: "synthetic" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      const fixture =
        CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES[
          Math.floor((providerCall - 1) / 2)
        ];
      return response(
        completedPayload(
          options.candidate?.(providerCall, fixture) ??
            fixture.passingCandidate,
          providerCall,
          options.usage?.(providerCall),
          options.responseId
            ? options.responseId(providerCall)
            : `resp_sensitive_preview_${providerCall}`,
        ),
      );
    },
  );
  const provider =
    createCaresLinkV1OpenAiCommunicationNoteContractTestProvider({
      capability: "MOCKED_CONTRACT_TEST_ONLY",
      evaluationPlanSnapshot:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
      fetchImpl,
      clock: {
        now: () =>
          new Date(
            Date.parse("2026-08-27T00:00:00.000Z") +
              Math.max(0, providerCall - 1) * 1_000 +
              500,
          ).toISOString(),
      },
    });
  const tokenCounter = vi.fn(async (request: PreviewRequest) => {
    tokenCall += 1;
    events.push("preflight");
    requests.push(request);
    return options.tokenCount
      ? await options.tokenCount(tokenCall, request)
      : 120;
  });
  const reviewer = vi.fn(async (input: unknown) => {
    reviewCall += 1;
    events.push(`review:${reviewCall}`);
    return (options.review
      ? await options.review(reviewCall, input)
      : options.reviewResult ?? VALID_REVIEWS) as typeof VALID_REVIEWS;
  });
  const runner =
    createCaresLinkV1CommunicationNotePreviewEvaluationContractTestRunner({
      capability: "MOCKED_CONTRACT_TEST_ONLY",
      provider,
      countInputTokens: tokenCounter,
      reviewCandidate: reviewer,
      clock: {
        now: () => {
          const milliseconds =
            runnerClockCall === 0
              ? 0
              : runnerClockCall <= 6
                ? (runnerClockCall - 1) * 1_000
                : 6_000;
          runnerClockCall += 1;
          return new Date(
            Date.parse("2026-08-27T00:00:00.000Z") + milliseconds,
          ).toISOString();
        },
      },
    });
  return { runner, fetchImpl, tokenCounter, reviewer, requests };
}

function completedPayload(
  candidate: unknown,
  call: number,
  usage: unknown = {
    input_tokens: 120,
    output_tokens: 80,
    total_tokens: 200,
    input_tokens_details: { cached_tokens: 20 },
    output_tokens_details: { reasoning_tokens: 10 },
  },
  responseId: string | null = `resp_sensitive_preview_${call}`,
) {
  return {
    id: responseId === null ? undefined : responseId,
    object: "response",
    model: CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_EVALUATION_MODEL_ID,
    status: "completed",
    service_tier: "default",
    error: null,
    incomplete_details: null,
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(candidate),
            annotations: [],
          },
        ],
      },
    ],
    usage,
  };
}

function response(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function runInput(runId: string) {
  return { runId, signal: new AbortController().signal };
}

async function expectFailure(
  promise: Promise<unknown>,
  reason: CaresLinkV1CommunicationNotePreviewRunnerFailureReason,
) {
  await expect(promise).rejects.toMatchObject({
    name: "CaresLinkV1CommunicationNotePreviewRunnerError",
    message: "Communication Note preview evaluation failed",
    reason,
  });
}

async function captureFailure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the preview run to fail");
}

function tamperReport(
  report: CaresLinkV1CommunicationNotePreviewEvaluationReport,
  mutate: (value: Record<string, unknown>) => void,
) {
  const clone = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
  mutate(clone);
  return clone;
}

function tamperAndResignReport(
  report: CaresLinkV1CommunicationNotePreviewEvaluationReport,
  mutate: (value: Record<string, unknown>) => void,
) {
  const clone = tamperReport(report, mutate);
  const { reportDigest: _oldDigest, ...core } = clone;
  expect(_oldDigest).toBeTypeOf("string");
  clone.reportDigest = canonicalDigest(core);
  return clone;
}

function canonicalDigest(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return value.length >= 8 ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringLeaves);
}
