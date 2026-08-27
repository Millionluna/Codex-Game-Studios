import { describe, expect, it, vi } from "vitest";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES,
  CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION,
  evaluateCaresLinkV1CommunicationNoteGoldenCandidate,
} from "./communication-note-golden";
import { CARESLINK_V1_NOTE_DRAFT_DISCLAIMER } from "./note-generation-output";
import { validateCaresLinkV1CleanedFacts } from "./shared-contracts";

vi.mock("server-only", () => ({}));

describe("Communication Note golden and refusal contract", () => {
  it("freezes three synthetic locale/mixed-input vectors", () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION).toBe(
      "golden.communication.2026-08-27.v1",
    );
    expect(CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES).toHaveLength(3);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.map(
        ({ sourceLocale }) => sourceLocale,
      ),
    ).toEqual(["en", "zh-Hans", "zh-Hant"]);
    for (const fixture of CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES) {
      expect(
        validateCaresLinkV1CleanedFacts("communication", fixture.cleanedFacts),
      ).toEqual(fixture.cleanedFacts);
      expect(JSON.stringify(fixture)).not.toMatch(
        /@|\b04\d{8}\b|medicare|ndis\s*(?:number|no\.?)/i,
      );
    }
  });

  it("passes fact-bound multilingual candidates and emits no note text in evidence", () => {
    for (const fixture of CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES) {
      const evaluation = evaluateCaresLinkV1CommunicationNoteGoldenCandidate(
        fixture,
        fixture.passingCandidate,
      );
      expect(evaluation).toEqual({
        fixtureId: fixture.id,
        passed: true,
        checks: {
          schema: true,
          requiredFactMarkers: true,
          numericParity: true,
          safety: true,
        },
      });
      expect(JSON.stringify(evaluation)).not.toContain(
        fixture.passingCandidate.englishDraft,
      );
    }
  });

  it("rejects dropped numbers, inferred decisions, identifiers and extra output keys", () => {
    const fixture = CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES[0];
    const failures = [
      {
        ...fixture.passingCandidate,
        englishDraft: fixture.passingCandidate.englishDraft.replace("10", ""),
      },
      {
        ...fixture.passingCandidate,
        englishDraft: "This records an inferred decision.",
      },
      ...[
        "The representative agreed.",
        "The representative consented.",
        "The representative committed to the change.",
        "The representative accepted the arrangement.",
        "The representative decided to proceed.",
        "The representative promised to complete it.",
      ].map((englishDraft) => ({
        ...fixture.passingCandidate,
        englishDraft,
      })),
      {
        ...fixture.passingCandidate,
        followUpPrompts: ["Call 0412 345 678."],
      },
      { ...fixture.passingCandidate, approval: "approved" },
    ];

    for (const candidate of failures) {
      expect(() =>
        evaluateCaresLinkV1CommunicationNoteGoldenCandidate(
          fixture,
          candidate,
        ),
      ).toThrow();
    }
  });

  it("keeps the server-owned Draft boundary on every passing canonical output", () => {
    for (const fixture of CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES) {
      const evaluation = evaluateCaresLinkV1CommunicationNoteGoldenCandidate(
        fixture,
        fixture.passingCandidate,
      );
      expect(evaluation.passed).toBe(true);
      expect(fixture.expectedDisclaimer).toBe(
        CARESLINK_V1_NOTE_DRAFT_DISCLAIMER,
      );
    }
  });
});
