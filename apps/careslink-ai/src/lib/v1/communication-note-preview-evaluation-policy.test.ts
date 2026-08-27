import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION,
  CARESLINK_V1_COMMUNICATION_NOTE_CRITICAL_EVALUATION_CHECKS,
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_ENDPOINT_PROFILE,
  CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_RESPONSES_URL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVAL_REQUIREMENTS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY,
  createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest,
  resolveCaresLinkV1CommunicationNoteOpenAiResponsesUrl,
  validateCaresLinkV1CommunicationNotePreviewEvaluationPlan,
} from "./communication-note-preview-evaluation-policy";
import {
  CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_EVALUATION_MODEL_ID,
  createCaresLinkV1CommunicationNoteProviderPolicyCandidate,
} from "./communication-note-provider-policy";
import { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES } from "./communication-note-golden";

vi.mock("server-only", () => ({}));

type MutablePlan = {
  evaluationPlanDigest: string;
  model: { id: string };
  request: {
    endpointProfile: string;
    endpointUrl: string;
    reasoningEffort: string;
    requestTemplateDigest: string;
  };
  dataHandling: {
    requiredRetentionControl: string;
    regionalProcessing: string;
    projectRegionVerification: string;
    structuredOutputSchemaResidency: string;
    retentionControlVerification?: string;
  };
  budget: {
    maxCalls: number;
    maxCostMicroUsd: number;
    enforcement: string;
  };
  acceptance: {
    fixtureIds: string[];
    goldenFixtureSetDigest: string;
    manifestDigest: string;
    criticalChecks: string[];
    everyCriticalCheckMustPassForEveryCandidate: boolean;
    executionReportBinding: string;
  };
  unexpected?: boolean;
};

type MutablePlanCore = Omit<MutablePlan, "evaluationPlanDigest">;

describe("Communication Note M1f Preview evaluation policy", () => {
  it("pins the reviewed fixture-set digest", () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST).toBe(
      "432cfda8c51e76ec517a4c4d39769c3c3a67d7a273ebe3b1662d3e4826449e17",
    );
  });

  it("pins the reviewed evaluation-plan digest", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN.evaluationPlanDigest,
    ).toBe(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST,
    ).toBe(
      "b89b03ba248bb4c615470a82c7c4ca6220cc009839f9d9c7dd6aaf772fee9dcd",
    );
  });

  it("freezes one content-addressed synthetic-only evaluation plan without authorizing a call", () => {
    const plan = CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN;
    const providerPolicy =
      createCaresLinkV1CommunicationNoteProviderPolicyCandidate();

    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY).toBe(
      false,
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION,
    ).toBeUndefined();
    expect(plan).toMatchObject({
      status: "FROZEN_AWAITING_EXPLICIT_PAID_PREVIEW_APPROVAL",
      capability: "DISPOSABLE_SYNTHETIC_DEIDENTIFIED_PREVIEW_ONLY",
      providerPolicyDigest: providerPolicy.policyDigest,
      providerId: "openai.responses",
      model: {
        id: CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_EVALUATION_MODEL_ID,
        revision: null,
        revisionAvailability: "PROVIDER_NOT_EXPOSED",
        selectionBasis: "IMMUTABLE_MODEL_ID_SNAPSHOT",
        fallbackModel: null,
      },
      request: {
        endpointProfile:
          CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_ENDPOINT_PROFILE,
        endpointUrl:
          CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_RESPONSES_URL,
        api: "RESPONSES_V1",
        serviceTier: "default",
        reasoningEffort: "none",
        store: false,
        background: false,
        toolsEnabled: false,
        automaticRetry: false,
        maxOutputTokens: 2_400,
        requestTemplateVersion:
          "request.communication.openai.responses.2026-08-27.v1",
        requestTemplateDigest:
          "5809bb94ebb96586f5ddb0e48782fa9d961e446a1a5694ac0e18d483f024979d",
      },
      dataHandling: {
        dataset: "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY",
        realCareDataAllowed: false,
        projectRegion: "AUSTRALIA",
        projectRegionVerification: "NOT_ATTESTED",
        regionalStorage: "SUPPORTED",
        regionalProcessing: "NOT_SUPPORTED",
        structuredOutputSchemaResidency: "NOT_COVERED_SYSTEM_DATA",
        structuredOutputSchemaCustomerDataAllowed: false,
        requiredRetentionControl: "ZERO_DATA_RETENTION",
        retentionControlVerification: "NOT_ATTESTED",
        modifiedRetentionAmendmentVerification: "NOT_ATTESTED",
        outOfRegionProcessingAcknowledgement: "REQUIRED",
      },
    });
    expect(plan.evaluationPlanDigest).toMatch(/^[a-f0-9]{64}$/);
    expectDeepFrozen(plan);
  });

  it("binds the fixed model, AU storage endpoint, dated prices and bounded cost", () => {
    const plan = CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN;

    expect(plan.model.id).toBe("gpt-5.4-mini-2026-03-17");
    expect(plan.budget).toEqual({
      currency: "USD",
      pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1",
      maxCalls: 6,
      maxInputTokensPerCall: 10_000,
      inputTokenPreflight: "REQUIRED",
      maxOutputTokensPerCall: 2_400,
      maxCostMicroUsd: 250_000,
      maxProjectedCostMicroUsdPerCall: 20_130,
      maxProjectedCostMicroUsd: 120_780,
      reservationCachedInputTokens: 0,
      baseInputMicroUsdPerMillionTokens: 750_000,
      baseCachedInputMicroUsdPerMillionTokens: 75_000,
      baseOutputMicroUsdPerMillionTokens: 4_500_000,
      regionalResidencyUpliftBasisPoints: 1_000,
      pricingReviewedOn: "2026-08-27",
      calculation: "BIGINT_CEILING_MICRO_USD",
      enforcement: "SOURCE_RUNNER_CONTRACT_IMPLEMENTED_NOT_APPROVED",
    });
    expect(
      resolveCaresLinkV1CommunicationNoteOpenAiResponsesUrl(
        plan.request.endpointProfile,
      ),
    ).toBe(CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_RESPONSES_URL);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_RESPONSES_URL).toBe(
      "https://au.api.openai.com/v1/responses",
    );
  });

  it("requires the complete frozen fixture set and every critical check for every run", () => {
    const acceptance =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN.acceptance;
    const fixtureIds = CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.map(
      ({ id }) => id,
    );

    expect(acceptance.fixtureIds).toEqual(fixtureIds);
    expect(acceptance.goldenFixtureSetDigest).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST,
    );
    expect(acceptance.goldenFixtureSetDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(acceptance.manifestDigest).toBe(
      "aab4e65bec64ea2c3dc7da91f3544e91aee3163dc7cab9187765c1eff9581be9",
    );
    expect(new Set(acceptance.fixtureIds).size).toBe(fixtureIds.length);
    expect(acceptance.runsPerFixture).toBe(2);
    expect(acceptance.requiredCandidateCount).toBe(
      fixtureIds.length * acceptance.runsPerFixture,
    );
    expect(acceptance.requiredLanguageDraftReviewCount).toBe(
      acceptance.requiredCandidateCount * 3,
    );
    expect(acceptance.everyCriticalCheckMustPassForEveryCandidate).toBe(true);
    expect(acceptance.criticalChecks).toEqual(
      CARESLINK_V1_COMMUNICATION_NOTE_CRITICAL_EVALUATION_CHECKS,
    );
    expect(acceptance.criticalChecks).toContain(
      "HUMAN_SEMANTIC_GROUNDEDNESS",
    );
    expect(acceptance.contentFreeEvidenceOnly).toBe(true);
    expect(acceptance.executionReportBinding).toBe(
      "SOURCE_RUNNER_CONTRACT_IMPLEMENTED_NOT_APPROVED",
    );
  });

  it("keeps every external approval and teardown requirement explicit", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN
        .approvalRequirements,
    ).toEqual(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVAL_REQUIREMENTS);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVAL_REQUIREMENTS).toEqual(
      [
        "OWNER_PAID_PREVIEW_APPROVAL",
        "OPENAI_PROJECT_ZDR_ATTESTATION",
        "OPENAI_AU_PROJECT_DATA_RESIDENCY_ATTESTATION",
        "OPENAI_AU_STORAGE_ONLY_PROCESSING_LIMIT_ACKNOWLEDGEMENT",
        "OPENAI_MODIFIED_RETENTION_AMENDMENT_ATTESTATION",
        "TEMPORARY_KEY_AND_TEARDOWN_PLAN",
        "PRICING_RECONFIRMATION",
        "APPROVED_RUNNER_BUDGET_AND_REPORT_BINDING",
      ],
    );
  });

  it("accepts an exact clone and rejects stale, missing, extra or nested-tampered plans", () => {
    const exactClone = clone(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
    );
    expect(
      validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(exactClone),
    ).toBe(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN);

    const cases = [
      mutate((value) => {
        value.evaluationPlanDigest = "0".repeat(64);
      }),
      mutate((value) => {
        value.model.id = "gpt-5.4-mini";
      }),
      mutate((value) => {
        value.request.endpointProfile = "OPENAI_GLOBAL_RESPONSES_V1";
      }),
      mutate((value) => {
        value.request.endpointUrl =
          "https://api.openai.com/v1/responses";
      }),
      mutate((value) => {
        value.request.reasoningEffort = "low";
      }),
      mutate((value) => {
        value.request.requestTemplateDigest = "0".repeat(64);
      }),
      mutate((value) => {
        value.dataHandling.requiredRetentionControl =
          "ORGANIZATION_DEFAULT";
      }),
      mutate((value) => {
        value.dataHandling.regionalProcessing = "SUPPORTED";
      }),
      mutate((value) => {
        value.dataHandling.projectRegionVerification = "ATTESTED";
      }),
      mutate((value) => {
        value.dataHandling.structuredOutputSchemaResidency = "COVERED";
      }),
      mutate((value) => {
        value.budget.maxCalls = 7;
      }),
      mutate((value) => {
        value.budget.maxCostMicroUsd = 250_001;
      }),
      mutate((value) => {
        value.acceptance.fixtureIds.pop();
      }),
      mutate((value) => {
        value.acceptance.goldenFixtureSetDigest = "0".repeat(64);
      }),
      mutate((value) => {
        value.acceptance.manifestDigest = "0".repeat(64);
      }),
      mutate((value) => {
        value.acceptance.criticalChecks.pop();
      }),
      mutate((value) => {
        delete value.dataHandling.retentionControlVerification;
      }),
      mutate((value) => {
        value.unexpected = true;
      }),
    ];

    for (const value of cases) {
      expect(() =>
        validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(value),
      ).toThrow("Communication Note evaluation plan does not match M1f");
    }
  });

  it("uses canonical plan hashing and changes the digest for every governed boundary", () => {
    const plan = clone(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
    );
    const { evaluationPlanDigest, ...core } = plan;

    expect(
      createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest(core),
    ).toBe(evaluationPlanDigest);
    expect(
      createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest(
        reverseObjectKeys(core),
      ),
    ).toBe(evaluationPlanDigest);

    for (const changed of [
      mutateCore(core, (value) => {
        value.model.id = "gpt-5.4-mini";
      }),
      mutateCore(core, (value) => {
        value.request.endpointProfile = "OPENAI_GLOBAL_RESPONSES_V1";
      }),
      mutateCore(core, (value) => {
        value.request.endpointUrl =
          "https://api.openai.com/v1/responses";
      }),
      mutateCore(core, (value) => {
        value.request.requestTemplateDigest = "0".repeat(64);
      }),
      mutateCore(core, (value) => {
        value.dataHandling.requiredRetentionControl =
          "MODIFIED_ABUSE_MONITORING";
      }),
      mutateCore(core, (value) => {
        value.budget.maxCostMicroUsd = 1;
      }),
      mutateCore(core, (value) => {
        value.acceptance.everyCriticalCheckMustPassForEveryCandidate = false;
      }),
      mutateCore(core, (value) => {
        value.acceptance.goldenFixtureSetDigest = "0".repeat(64);
      }),
      mutateCore(core, (value) => {
        value.acceptance.manifestDigest = "0".repeat(64);
      }),
    ]) {
      expect(
        createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest(changed),
      ).not.toBe(evaluationPlanDigest);
    }
  });

  it("binds fixture content and rejects a tampered plan even when its digest is recomputed", () => {
    const fixtures = clone(
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES,
    ) as unknown as Array<{
      id: string;
      cleanedFacts: { observable_facts: string };
    }>;
    fixtures[0].cleanedFacts.observable_facts =
      "Same fixture ID with changed synthetic facts.";
    expect(fixtures[0].id).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES[0].id,
    );
    expect(
      createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest(fixtures),
    ).not.toBe(CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST);

    const tampered = mutate((value) => {
      value.model.id = "gpt-5.4-mini";
    });
    const { evaluationPlanDigest: _oldDigest, ...tamperedCore } = tampered;
    expect(_oldDigest).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN_DIGEST,
    );
    tampered.evaluationPlanDigest =
      createCaresLinkV1CommunicationNotePreviewEvaluationPlanDigest(
        tamperedCore,
      );
    expect(() =>
      validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(tampered),
    ).toThrow("Communication Note evaluation plan does not match M1f");
  });

  it.each([
    "https://api.openai.com/v1/responses",
    "https://eu.api.openai.com/v1/responses",
    "http://au.api.openai.com/v1/responses",
    "https://user@au.api.openai.com/v1/responses",
    "https://au.api.openai.com:8443/v1/responses",
    "https://au.api.openai.com/v1/responses?region=au",
    "https://au.api.openai.com/v1/responses#fragment",
    "OPENAI_GLOBAL_RESPONSES_V1",
    "",
    null,
  ])("rejects arbitrary endpoint input %s", (value) => {
    expect(() =>
      resolveCaresLinkV1CommunicationNoteOpenAiResponsesUrl(value),
    ).toThrow("Communication Note OpenAI endpoint profile is unavailable");
  });
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mutate(update: (value: MutablePlan) => void): MutablePlan {
  const value = clone(
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_PLAN,
  ) as unknown as MutablePlan;
  update(value);
  return value;
}

function mutateCore(
  value: unknown,
  update: (draft: MutablePlanCore) => void,
): MutablePlanCore {
  const draft = clone(value) as MutablePlanCore;
  update(draft);
  return draft;
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, child]) => [key, reverseObjectKeys(child)]),
  );
}

function expectDeepFrozen(value: unknown): void {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}
