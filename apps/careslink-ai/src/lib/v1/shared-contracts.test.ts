import { describe, expect, it } from "vitest";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES,
  CARESLINK_V1_ERROR_CODES,
  CARESLINK_V1_EXPORT_STATUSES,
  CARESLINK_V1_GENERATION_STATUSES,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_CATALOG,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CARESLINK_V1_SELF_REVIEW_STATUSES,
  CARESLINK_V1_SHADOW_RATE_CATALOG,
  CARESLINK_V1_SYNC_STATUSES,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  canTransitionDocumentLifecycle,
  canTransitionExportStatus,
  canTransitionGenerationStatus,
  getCaresLinkV1NoteType,
  isCaresLinkV1Locale,
  validateCaresLinkV1CleanedFacts,
  validateCaresLinkV1CleanedFactsForAnyNoteType,
  type CaresLinkV1ErrorCode,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";
import {
  CARESLINK_V1_VALID_CLEANED_FACTS,
  createValidCaresLinkV1CleanedFacts,
} from "./cleaned-facts-test-fixtures";
import { isCaresLinkV1ShadowEnabled } from "./shadow-config";

describe("CaresLink V1 shared contracts", () => {
  it("publishes an explicit shadow contract and three non-fallback locales", () => {
    expect(CARESLINK_V1_CONTRACT_VERSION).toBe("1.0.0-shadow.1");
    expect(CARESLINK_V1_LOCALES).toEqual(["en", "zh-Hans", "zh-Hant"]);
    expect(isCaresLinkV1Locale("zh-Hant")).toBe(true);
    expect(isCaresLinkV1Locale("zh-TW")).toBe(false);
    expect(isCaresLinkV1Locale("zh-Hans")).toBe(true);
  });

  it("defines exactly five versioned Note types with identifier-free fields", () => {
    expect(CARESLINK_V1_NOTE_CATALOG.map((note) => note.code)).toEqual([
      "communication",
      "handover",
      "progress",
      "ndis",
      "incident_factual",
    ]);
    expect(
      CARESLINK_V1_NOTE_CATALOG.every(
        (note) =>
          note.fields.some((field) => field.required) &&
          note.fields.every(
            (field) => field.containsParticipantIdentifier === false,
          ),
      ),
    ).toBe(true);
    expect(getCaresLinkV1NoteType("incident_factual").prohibitedDecisions).toContain(
      "reportability decision",
    );
  });

  it.each(CARESLINK_V1_NOTE_TYPE_CODES)(
    "accepts and projects the closed %s cleaned-facts schema",
    (noteType) => {
      const facts = createValidCaresLinkV1CleanedFacts(noteType);
      expect(validateCaresLinkV1CleanedFacts(noteType, facts)).toEqual(facts);
    },
  );

  it.each(CARESLINK_V1_NOTE_TYPE_CODES)(
    "rejects missing, extra and wrong-type fields for %s",
    (noteType) => {
      const definition = CARESLINK_V1_NOTE_CATALOG.find(
        (candidate) => candidate.code === noteType,
      )!;
      const firstRequired = definition.fields.find((field) => field.required)!;
      const missing = createValidCaresLinkV1CleanedFacts(noteType) as Record<
        string,
        unknown
      >;
      delete missing[firstRequired.code];
      expectContractCode(
        () => validateCaresLinkV1CleanedFacts(noteType, missing),
        "MINIMUM_FACTS_REQUIRED",
      );

      const extra = {
        ...createValidCaresLinkV1CleanedFacts(noteType),
        unexpected_field: "not allowed",
      };
      expectContractCode(
        () => validateCaresLinkV1CleanedFacts(noteType, extra),
        "VALIDATION_ERROR",
      );

      const wrongType = createValidCaresLinkV1CleanedFacts(
        noteType,
      ) as Record<string, unknown>;
      wrongType[firstRequired.code] = 42;
      expectContractCode(
        () => validateCaresLinkV1CleanedFacts(noteType, wrongType),
        "VALIDATION_ERROR",
      );
    },
  );

  it.each([
    ["communication", "handover"],
    ["handover", "communication"],
    ["progress", "incident_factual"],
    ["ndis", "communication"],
    ["incident_factual", "ndis"],
  ] as const)(
    "rejects %s cleaned facts copied from the %s schema",
    (noteType, otherNoteType) => {
      expectContractCode(
        () =>
          validateCaresLinkV1CleanedFacts(
            noteType,
            createValidCaresLinkV1CleanedFacts(otherNoteType),
          ),
        "VALIDATION_ERROR",
      );
    },
  );

  it.each(CARESLINK_V1_NOTE_TYPE_CODES)(
    "requires already-trimmed strings and RFC3339-with-timezone dates for %s",
    (noteType) => {
      const definition = CARESLINK_V1_NOTE_CATALOG.find(
        (candidate) => candidate.code === noteType,
      )!;
      const textField = definition.fields.find(
        (field) =>
          field.required &&
          (field.kind === "short_text" || field.kind === "long_text"),
      )!;
      const paddedText = createValidCaresLinkV1CleanedFacts(
        noteType,
      ) as Record<string, unknown>;
      paddedText[textField.code] = ` ${paddedText[textField.code] as string}`;
      expectContractCode(
        () => validateCaresLinkV1CleanedFacts(noteType, paddedText),
        "VALIDATION_ERROR",
      );

      const paddedDate = createValidCaresLinkV1CleanedFacts(
        noteType,
      ) as Record<string, unknown>;
      paddedDate.occurred_at = "2026-08-11T10:15:30+10:00 ";
      expectContractCode(
        () => validateCaresLinkV1CleanedFacts(noteType, paddedDate),
        "VALIDATION_ERROR",
      );

      for (const invalidDate of [
        "2026-08-11T10:15:30",
        "2026-02-30T10:15:30Z",
        "2026-08-11T24:00:00Z",
        "2026-08-11T10:60:00Z",
        "2026-08-11T10:15:60Z",
        "2026-08-11T10:15:30+24:00",
      ]) {
        const invalid = createValidCaresLinkV1CleanedFacts(
          noteType,
        ) as Record<string, unknown>;
        invalid.occurred_at = invalidDate;
        expectContractCode(
          () => validateCaresLinkV1CleanedFacts(noteType, invalid),
          "VALIDATION_ERROR",
        );
      }
    },
  );

  it("requires a non-empty, already-trimmed string_list", () => {
    for (const partiesByRole of [[], [" "], ["Support worker "]]) {
      const facts = createValidCaresLinkV1CleanedFacts("communication");
      facts.parties_by_role = partiesByRole;
      expectContractCode(
        () => validateCaresLinkV1CleanedFacts("communication", facts),
        partiesByRole.length === 0 || partiesByRole[0] === " "
          ? "MINIMUM_FACTS_REQUIRED"
          : "VALIDATION_ERROR",
      );
    }
  });

  it("treats an optional field present with undefined as an invalid value", () => {
    const facts = createValidCaresLinkV1CleanedFacts("ndis");
    Reflect.set(facts, "follow_up", undefined);
    expectContractCode(
      () => validateCaresLinkV1CleanedFacts("ndis", facts),
      "VALIDATION_ERROR",
    );
  });

  it("never echoes an unknown PII-bearing field key or its value", () => {
    const unknownKey = "Jane Smith";
    const unknownValue = "worker@example.test";
    let error: unknown;
    try {
      validateCaresLinkV1CleanedFacts("ndis", {
        ...CARESLINK_V1_VALID_CLEANED_FACTS.ndis,
        [unknownKey]: unknownValue,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CaresLinkV1ContractError);
    expect((error as CaresLinkV1ContractError).code).toBe("VALIDATION_ERROR");
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain(unknownKey);
    expect(serialized).not.toContain("Jane");
    expect(serialized).not.toContain(unknownValue);
    expect((error as Error).message).toBe(
      "cleanedFacts contains an unsupported field",
    );
  });

  it("preserves minimum-facts semantics at a Note-type-independent read boundary", () => {
    const missing = createValidCaresLinkV1CleanedFacts("handover");
    delete (missing as Partial<typeof missing>).current_status;
    expectContractCode(
      () => validateCaresLinkV1CleanedFactsForAnyNoteType(missing),
      "MINIMUM_FACTS_REQUIRED",
    );

    expectContractCode(
      () =>
        validateCaresLinkV1CleanedFactsForAnyNoteType({
          ...createValidCaresLinkV1CleanedFacts("handover"),
          "Jane Smith": "worker@example.test",
        }),
      "VALIDATION_ERROR",
    );
  });

  it("maps an unsupported Note type to validation", () => {
    expectContractCode(
      () =>
        validateCaresLinkV1CleanedFacts(
          "future_note" as CaresLinkV1NoteTypeCode,
          CARESLINK_V1_VALID_CLEANED_FACTS.ndis,
        ),
      "VALIDATION_ERROR",
    );
  });

  it("matches the approved shadow rate catalog without activating it", () => {
    expect(CARESLINK_V1_RATE_CATALOG_VERSION).toBe(
      "2026-08-09.v1-shadow",
    );
    expect(
      Object.fromEntries(
        CARESLINK_V1_SHADOW_RATE_CATALOG.map((rate) => [
          rate.serviceCode,
          rate.points,
        ]),
      ),
    ).toMatchObject({
      "note.communication.generate": 20,
      "note.handover.generate": 25,
      "note.progress.generate": 35,
      "note.ndis.generate": 50,
      "note.incident_factual.generate": 60,
      "transcription.device": 0,
      "transcription.cloud": 10,
      "content.explain": 10,
      "note.rewrite.section": 10,
    });
    expect(
      CARESLINK_V1_SHADOW_RATE_CATALOG.find(
        (rate) => rate.serviceCode === "note.regenerate.full",
      ),
    ).toMatchObject({
      points: null,
      minimumPoints: 20,
      maximumPoints: 40,
      status: "SHADOW",
    });
    expect(CARESLINK_V1_SHADOW_RATE_CATALOG.every((rate) => rate.status === "SHADOW")).toBe(
      true,
    );
  });

  it("keeps lifecycle, self-review, sync and export status orthogonal", () => {
    expect(CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES).toEqual([
      "IN_PROGRESS",
      "COMPLETED",
      "TOMBSTONED",
      "PURGED",
    ]);
    expect(CARESLINK_V1_SELF_REVIEW_STATUSES).toEqual([
      "REQUIRED",
      "CONFIRMED",
    ]);
    expect(CARESLINK_V1_SYNC_STATUSES).not.toEqual(
      expect.arrayContaining(["COMPLETED", "EXPORTED"]),
    );
    expect(CARESLINK_V1_EXPORT_STATUSES).toContain("ARTIFACT_READY");
    expect(CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES).not.toEqual(
      expect.arrayContaining(["CONFIRMED", "EXPORTED"]),
    );
  });

  it("allows only the approved lifecycle transitions", () => {
    expect(canTransitionDocumentLifecycle("IN_PROGRESS", "COMPLETED")).toBe(
      true,
    );
    expect(canTransitionDocumentLifecycle("COMPLETED", "IN_PROGRESS")).toBe(
      true,
    );
    expect(canTransitionDocumentLifecycle("TOMBSTONED", "PURGED")).toBe(
      true,
    );
    expect(canTransitionDocumentLifecycle("PURGED", "IN_PROGRESS")).toBe(
      false,
    );
  });

  it("makes generation and export terminal states non-reversible", () => {
    expect(CARESLINK_V1_GENERATION_STATUSES).toContain("CANCELLED");
    expect(canTransitionGenerationStatus("QUEUED", "RUNNING")).toBe(true);
    expect(canTransitionGenerationStatus("RUNNING", "SUCCEEDED")).toBe(true);
    expect(canTransitionGenerationStatus("SUCCEEDED", "RUNNING")).toBe(false);
    expect(canTransitionExportStatus("REQUESTED", "RENDERING")).toBe(true);
    expect(canTransitionExportStatus("ARTIFACT_READY", "DOWNLOADED")).toBe(
      true,
    );
    expect(canTransitionExportStatus("PURGED", "ARTIFACT_READY")).toBe(false);
  });

  it("publishes the approved unified error vocabulary", () => {
    expect(CARESLINK_V1_ERROR_CODES).toEqual(
      expect.arrayContaining([
        "AUTH_REQUIRED",
        "PRIVACY_REVIEW_STALE",
        "POINTS_INSUFFICIENT",
        "POINT_QUOTE_EXPIRED",
        "STALE_REVISION",
        "GENERATION_FAILED",
        "EXPORT_EXPIRED",
        "MIN_CLIENT_VERSION",
      ]),
    );
  });

  it("freezes the temporary Preview privacy policy and 30-minute proof TTL", () => {
    expect(CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION).toBe(
      "2026-08-11.preview.1",
    );
    expect(CARESLINK_V1_PRIVACY_REVIEW_TTL_SECONDS).toBe(30 * 60);
  });

  it("accepts only bounded transport-safe idempotency keys", () => {
    expect(assertCaresLinkV1IdempotencyKey("note.generate:request-0001")).toBe(
      "note.generate:request-0001",
    );
    expect(() => assertCaresLinkV1IdempotencyKey("short")).toThrow(
      CaresLinkV1ContractError,
    );
    expect(() =>
      assertCaresLinkV1IdempotencyKey("contains private note text 中文"),
    ).toThrow(CaresLinkV1ContractError);
  });

  it("keeps the V1 runtime path off unless the exact server flag is true", () => {
    expect(isCaresLinkV1ShadowEnabled({})).toBe(false);
    expect(
      isCaresLinkV1ShadowEnabled({ CARESLINK_V1_SHADOW_ENABLED: "TRUE" }),
    ).toBe(false);
    expect(
      isCaresLinkV1ShadowEnabled({ CARESLINK_V1_SHADOW_ENABLED: "true" }),
    ).toBe(true);
  });
});

function expectContractCode(
  action: () => unknown,
  expectedCode: CaresLinkV1ErrorCode,
) {
  let error: unknown;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(CaresLinkV1ContractError);
  expect((error as CaresLinkV1ContractError).code).toBe(expectedCode);
}
