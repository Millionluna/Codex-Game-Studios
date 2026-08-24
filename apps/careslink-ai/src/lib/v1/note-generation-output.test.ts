import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { NdisCaseNoteMaterial } from "../ndis-case-note-companion";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";
import {
  CARESLINK_V1_NOTE_DRAFT_DISCLAIMER,
  adaptLegacyNdisMaterialToProviderCandidate,
  buildCaresLinkV1CanonicalNoteContent,
  validateCaresLinkV1NoteProviderCandidate,
  type CaresLinkV1NoteProviderCandidate,
} from "./note-generation-output";
import {
  CARESLINK_V1_NOTE_TYPE_CODES,
  CaresLinkV1ContractError,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

describe("CaresLink V1 Note generation output", () => {
  it("validates and normalizes the exact provider candidate shape", () => {
    expect(
      validateCaresLinkV1NoteProviderCandidate({
        englishDraft: "  Observable draft.  ",
        reviewVersions: {
          "zh-Hans": "  可观察事实。  ",
          "zh-Hant": "  可觀察事實。  ",
        },
        missingFacts: ["  Confirm the finish time.  "],
        neutralWordingChecks: ["  No inferred outcome.  "],
        followUpPrompts: [],
      }),
    ).toEqual({
      englishDraft: "Observable draft.",
      reviewVersions: {
        "zh-Hans": "可观察事实。",
        "zh-Hant": "可觀察事實。",
      },
      missingFacts: ["Confirm the finish time."],
      neutralWordingChecks: ["No inferred outcome."],
      followUpPrompts: [],
    });
  });

  it.each(CARESLINK_V1_NOTE_TYPE_CODES)(
    "builds validated canonical content for %s without trusting provider-owned facts",
    (noteType) => {
      const cleanedFacts = createValidCaresLinkV1CleanedFacts(noteType);
      const result = buildCaresLinkV1CanonicalNoteContent(
        noteType,
        cleanedFacts,
        validCandidate(),
      );

      expect(result.content.factsSummary).toEqual(cleanedFacts);
      expect(result.content.disclaimer).toBe(
        CARESLINK_V1_NOTE_DRAFT_DISCLAIMER,
      );
      expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    },
  );

  it("hashes the exact built content as UTF-8 canonical JSON", () => {
    const candidate: CaresLinkV1NoteProviderCandidate = {
      ...validCandidate(),
      englishDraft: "Participant requested a café break.",
      reviewVersions: { "zh-Hans": "参与者提出在咖啡馆休息。" },
    };
    const first = buildCaresLinkV1CanonicalNoteContent(
      "communication",
      createValidCaresLinkV1CleanedFacts("communication"),
      candidate,
    );
    const expected = createHash("sha256")
      .update(stringifyCaresLinkV1CanonicalJson(first.content), "utf8")
      .digest("hex");

    expect(first.contentHash).toBe(expected);
    expect(
      buildCaresLinkV1CanonicalNoteContent(
        "communication",
        {
          stated_outcome:
            first.content.factsSummary.stated_outcome,
          action_taken: first.content.factsSummary.action_taken,
          observable_facts: first.content.factsSummary.observable_facts,
          parties_by_role: first.content.factsSummary.parties_by_role,
          contact_channel: first.content.factsSummary.contact_channel,
          occurred_at: first.content.factsSummary.occurred_at,
        },
        candidate,
      ).contentHash,
    ).toBe(expected);
  });

  it.each([
    ["missing a required key", without(validCandidate(), "followUpPrompts")],
    ["adds factsSummary", { ...validCandidate(), factsSummary: { secret: "value" } }],
    ["adds a disclaimer", { ...validCandidate(), disclaimer: "provider text" }],
    ["adds another root key", { ...validCandidate(), model: "provider-model" }],
  ])("rejects a provider candidate that %s", (_label, candidate) => {
    expectValidationError(() =>
      validateCaresLinkV1NoteProviderCandidate(candidate),
    );
  });

  it.each(["en", "zh-TW", "zh-CN"])(
    "rejects unsupported provider review locale %s",
    (locale) => {
      expectValidationError(() =>
        validateCaresLinkV1NoteProviderCandidate({
          ...validCandidate(),
          reviewVersions: { [locale]: "Review" },
        }),
      );
    },
  );

  it("enforces the OpenAPI draft and review string bounds", () => {
    for (const candidate of [
      { ...validCandidate(), englishDraft: " " },
      { ...validCandidate(), englishDraft: "x".repeat(100_001) },
      {
        ...validCandidate(),
        reviewVersions: { "zh-Hans": " " },
      },
      {
        ...validCandidate(),
        reviewVersions: { "zh-Hant": "文".repeat(100_001) },
      },
    ]) {
      expectValidationError(() =>
        validateCaresLinkV1NoteProviderCandidate(candidate),
      );
    }

    expect(
      validateCaresLinkV1NoteProviderCandidate({
        ...validCandidate(),
        englishDraft: "x".repeat(100_000),
        reviewVersions: { "zh-Hant": "文".repeat(100_000) },
      }),
    ).toBeDefined();
  });

  it("enforces the OpenAPI list and list-item bounds", () => {
    for (const missingFacts of [
      Array.from({ length: 257 }, () => "fact"),
      [""],
      ["x".repeat(2_001)],
    ]) {
      expectValidationError(() =>
        validateCaresLinkV1NoteProviderCandidate({
          ...validCandidate(),
          missingFacts,
        }),
      );
    }

    expect(
      validateCaresLinkV1NoteProviderCandidate({
        ...validCandidate(),
        missingFacts: Array.from({ length: 256 }, () => "x".repeat(2_000)),
      }).missingFacts,
    ).toHaveLength(256);
  });

  it("rejects cleaned facts that do not match the adjacent Note type", () => {
    expectContractError(
      () =>
        buildCaresLinkV1CanonicalNoteContent(
          "incident_factual",
          createValidCaresLinkV1CleanedFacts("progress"),
          validCandidate(),
        ),
      ["MINIMUM_FACTS_REQUIRED", "VALIDATION_ERROR"],
    );
  });

  it("does not disclose rejected provider text in validation errors", () => {
    const sensitiveText = "Participant-secret-9842";
    let thrown: unknown;
    try {
      validateCaresLinkV1NoteProviderCandidate({
        ...validCandidate(),
        englishDraft: "",
        modelResponse: sensitiveText,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CaresLinkV1ContractError);
    expect((thrown as Error).message).not.toContain(sensitiveText);
  });

  it.each([
    ["communication", "This records an inferred agreement."],
    ["handover", "The provider made an invented responsibility."],
    ["progress", "This is a clinical judgement."],
    ["ndis", "This confirms NDIS compliance."],
    ["incident_factual", "The incident has a legal conclusion."],
  ] as const)(
    "rejects the adjacent prohibited output literal for %s without echoing it",
    (noteType, sensitiveDraft) => {
      let thrown: unknown;
      try {
        buildCaresLinkV1CanonicalNoteContent(
          noteType,
          createValidCaresLinkV1CleanedFacts(noteType),
          { ...validCandidate(), englishDraft: sensitiveDraft },
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(CaresLinkV1ContractError);
      expect((thrown as CaresLinkV1ContractError).code).toBe(
        "GENERATION_FAILED",
      );
      expect((thrown as Error).message).not.toContain(sensitiveDraft);
    },
  );

  it("rejects an identifier returned in any provider-owned output field", () => {
    const unsafeValues: CaresLinkV1NoteProviderCandidate[] = [
      { ...validCandidate(), englishDraft: "Contact Dr Jane Smith." },
      {
        ...validCandidate(),
        reviewVersions: { "zh-Hans": "Contact worker@example.test." },
      },
      { ...validCandidate(), missingFacts: ["Call 0412 345 678."] },
      {
        ...validCandidate(),
        neutralWordingChecks: ["Remove participant ID: ABC-123."],
      },
      {
        ...validCandidate(),
        followUpPrompts: ["Review https://example.test/private."],
      },
    ];

    for (const candidate of unsafeValues) {
      expect(() =>
        buildCaresLinkV1CanonicalNoteContent(
          "communication",
          createValidCaresLinkV1CleanedFacts("communication"),
          candidate,
        ),
      ).toThrow(CaresLinkV1ContractError);
    }
  });

  it("scans the entire contract-sized output instead of only its first window", () => {
    expect(() =>
      buildCaresLinkV1CanonicalNoteContent(
        "communication",
        createValidCaresLinkV1CleanedFacts("communication"),
        {
          ...validCandidate(),
          englishDraft: `${"x".repeat(20_000)} worker@example.test`,
        },
      ),
    ).toThrow(CaresLinkV1ContractError);
  });

  it("projects legacy NDIS material only into the provider candidate boundary", () => {
    const material: NdisCaseNoteMaterial = {
      englishCaseNoteDraft: "The participant requested a seated break.",
      chineseReviewVersion: "参与者提出坐下休息。",
      missingFacts: ["Confirm the finish time."],
      neutralWordingChecks: ["Use observable wording."],
      followUpPrompts: [],
      disclaimer: "Legacy provider-controlled disclaimer must not cross.",
    };

    const candidate = adaptLegacyNdisMaterialToProviderCandidate(material);

    expect(candidate).toEqual({
      englishDraft: material.englishCaseNoteDraft,
      reviewVersions: { "zh-Hans": material.chineseReviewVersion },
      missingFacts: material.missingFacts,
      neutralWordingChecks: material.neutralWordingChecks,
      followUpPrompts: material.followUpPrompts,
    });
    expect(Object.keys(candidate)).toEqual([
      "englishDraft",
      "reviewVersions",
      "missingFacts",
      "neutralWordingChecks",
      "followUpPrompts",
    ]);
    expect(candidate).not.toHaveProperty("disclaimer");
    expect(candidate).not.toHaveProperty("factsSummary");
    expect(candidate).not.toHaveProperty("setting");
  });

  it("re-validates legacy NDIS material instead of trusting its structural type", () => {
    const unsafeMaterial: NdisCaseNoteMaterial = {
      englishCaseNoteDraft: "Dr Jane Smith requested a seated break.",
      chineseReviewVersion: "参与者提出坐下休息。",
      missingFacts: [],
      neutralWordingChecks: [],
      followUpPrompts: [],
      disclaimer: "Caller-controlled disclaimer.",
    };

    let thrown: unknown;
    try {
      adaptLegacyNdisMaterialToProviderCandidate(unsafeMaterial);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CaresLinkV1ContractError);
    expect((thrown as CaresLinkV1ContractError).code).toBe(
      "GENERATION_FAILED",
    );
    expect((thrown as Error).message).not.toContain("Jane Smith");
  });
});

function validCandidate(): CaresLinkV1NoteProviderCandidate {
  return {
    englishDraft: "Support was provided for the planned activity.",
    reviewVersions: { "zh-Hans": "已为计划活动提供支持。" },
    missingFacts: [],
    neutralWordingChecks: ["No inferred outcome."],
    followUpPrompts: [],
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

function expectValidationError(action: () => unknown) {
  expectContractError(action, ["VALIDATION_ERROR"]);
}

function expectContractError(
  action: () => unknown,
  codes: CaresLinkV1ContractError["code"][],
) {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CaresLinkV1ContractError);
  expect(codes).toContain((thrown as CaresLinkV1ContractError).code);
}
