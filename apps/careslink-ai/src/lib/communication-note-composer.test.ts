import { describe, expect, it } from "vitest";

import {
  COMMUNICATION_NOTE_COMPOSER_FIELDS,
  COMMUNICATION_NOTE_COMPOSER_LOCALES,
  buildCommunicationNoteSubmission,
  createEmptyCommunicationNoteComposerDraft,
  getCommunicationNoteComposerCopy,
  parseCommunicationNoteComposerLocale,
  reviewCommunicationNoteDraft,
  scanCommunicationNoteDraft,
  type CommunicationNoteComposerDraft,
} from "./communication-note-composer";
import { CARESLINK_V1_NOTE_CATALOG } from "./v1/shared-contracts";

const VALID_DRAFT: CommunicationNoteComposerDraft = {
  occurred_at: "2026-09-01T14:30:00+10:00",
  contact_channel: "Phone",
  parties_by_role: ["Support worker", "Family representative"],
  observable_facts: "The caller requested a copy of the schedule.",
  action_taken: "The support worker confirmed the request was recorded.",
  stated_outcome: "The family representative stated no further action was needed.",
  follow_up: "The support worker will send the de-identified schedule summary.",
};

describe("Communication Note client-safe composer", () => {
  it("keeps all seven fields aligned with the shared Communication Note contract", () => {
    const communication = CARESLINK_V1_NOTE_CATALOG.find(
      ({ code }) => code === "communication",
    );

    expect(COMMUNICATION_NOTE_COMPOSER_FIELDS).toEqual(
      communication?.fields.map(({ code }) => code),
    );
    expect(Object.keys(createEmptyCommunicationNoteComposerDraft())).toEqual(
      COMMUNICATION_NOTE_COMPOSER_FIELDS,
    );
  });

  it("has complete independent copy for all three exact locales", () => {
    expect(COMMUNICATION_NOTE_COMPOSER_LOCALES).toEqual([
      "en",
      "zh-Hans",
      "zh-Hant",
    ]);

    for (const locale of COMMUNICATION_NOTE_COMPOSER_LOCALES) {
      expect(parseCommunicationNoteComposerLocale(locale)).toBe(locale);
      const copy = getCommunicationNoteComposerCopy(locale);
      expect(copy.title).not.toHaveLength(0);
      expect(copy.description).not.toHaveLength(0);
      expect(Object.keys(copy.fieldLabels)).toEqual(
        COMMUNICATION_NOTE_COMPOSER_FIELDS,
      );
      expect(Object.values(copy.fieldLabels).every(Boolean)).toBe(true);
      expect(Object.keys(copy.fieldPlaceholders)).toEqual(
        COMMUNICATION_NOTE_COMPOSER_FIELDS,
      );
      expect(Object.values(copy.fieldPlaceholders).every(Boolean)).toBe(true);
      expect(Object.values(copy.confirmationLabels).every(Boolean)).toBe(true);
    }

    expect(getCommunicationNoteComposerCopy("zh-Hant")).not.toBe(
      getCommunicationNoteComposerCopy("zh-Hans"),
    );
    expect(getCommunicationNoteComposerCopy("zh-Hant").title).toBe("溝通記錄");
    expect(() => parseCommunicationNoteComposerLocale("zh")).toThrow(
      "Unsupported Communication Note locale",
    );
    expect(() => getCommunicationNoteComposerCopy("ZH-hans")).toThrow(
      "Unsupported Communication Note locale",
    );
    expect(() => getCommunicationNoteComposerCopy(undefined)).toThrow(
      "Unsupported Communication Note locale",
    );
  });

  it("reports every missing required field and omits cleaned facts", () => {
    const review = reviewCommunicationNoteDraft(
      createEmptyCommunicationNoteComposerDraft(),
      "en",
    );

    expect(review.missingRequiredFields).toEqual([
      "occurred_at",
      "contact_channel",
      "parties_by_role",
      "observable_facts",
      "action_taken",
    ]);
    expect(review.validationIssues).toEqual(
      review.missingRequiredFields.map((field) => ({
        field,
        code: "required",
      })),
    );
    expect(review.cleanedFacts).toBeUndefined();
  });

  it("requires an RFC3339 date-time with timezone", () => {
    const review = reviewCommunicationNoteDraft(
      { ...VALID_DRAFT, occurred_at: "2026-09-01 14:30" },
      "en",
    );

    expect(review.validationIssues).toEqual([
      { field: "occurred_at", code: "invalid_date_time" },
    ]);
    expect(review.cleanedFacts).toBeUndefined();
  });

  it.each([
    ["email", "worker@example.test"],
    ["phone", "0412 345 678"],
    ["ndis_number", "NDIS number: 123456789"],
    ["name_label", "Name: Jane Smith"],
    ["address_label", "Address: 12 Smith Street Melbourne VIC 3000"],
    ["dob_label", "DOB: 01/02/1980"],
  ] as const)("finds and replaces an obvious %s without returning its excerpt", (kind, identifier) => {
    const draft = {
      ...VALID_DRAFT,
      observable_facts: `The caller provided ${identifier}.`,
    };
    const findings = scanCommunicationNoteDraft(draft);
    const finding = findings.find((candidate) => candidate.kind === kind);
    const review = reviewCommunicationNoteDraft(draft, "en");

    expect(finding).toMatchObject({
      kind,
      field: "observable_facts",
      fieldPath: "/observable_facts",
    });
    expect(finding?.endOffset).toBeGreaterThan(finding?.startOffset ?? 0);
    expect(Object.keys(finding ?? {})).toEqual([
      "kind",
      "field",
      "fieldPath",
      "startOffset",
      "endOffset",
      "replacement",
    ]);
    expect(JSON.stringify(finding)).not.toContain(identifier);
    expect(review.sanitisedDraft.observable_facts).not.toContain(identifier);
    expect(JSON.stringify(review)).not.toContain(identifier);
    expect(review.cleanedFacts?.observable_facts).not.toContain(identifier);
  });

  it("scans and sanitises every string-list item deterministically", () => {
    const draft = {
      ...VALID_DRAFT,
      parties_by_role: ["Name: Jane Smith", "Support worker 0412 345 678"],
    };
    const first = reviewCommunicationNoteDraft(draft, "zh-Hant");
    const second = reviewCommunicationNoteDraft(draft, "zh-Hant");

    expect(first).toEqual(second);
    expect(first.findings.map(({ fieldPath }) => fieldPath)).toEqual([
      "/parties_by_role/0",
      "/parties_by_role/1",
    ]);
    expect(first.sanitisedDraft.parties_by_role).toEqual([
      "[person by role]",
      "Support worker [phone removed]",
    ]);
  });

  it("does not build a submission until both confirmations are true", () => {
    const review = reviewCommunicationNoteDraft(VALID_DRAFT, "en");

    expect(review.cleanedFacts).toBeDefined();
    expect(
      buildCommunicationNoteSubmission(review, {
        reviewedNoIdentifiers: false,
        processingAuthorityConfirmed: true,
      }),
    ).toBeUndefined();
    expect(
      buildCommunicationNoteSubmission(review, {
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: false,
      }),
    ).toBeUndefined();

    expect(
      buildCommunicationNoteSubmission(review, {
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: true,
      }),
    ).toEqual({
      sourceLocale: "en",
      cleanedFacts: VALID_DRAFT,
      privacyReview: {
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: true,
      },
    });
  });

  it("serialises only sanitised cleaned facts and literal confirmations", () => {
    const identifiers = [
      "person@example.test",
      "0412 345 678",
      "NDIS number: 123456789",
      "Name: Jane Smith",
      "Address: 12 Smith Street Melbourne VIC 3000",
      "DOB: 01/02/1980",
    ];
    const review = reviewCommunicationNoteDraft(
      {
        ...VALID_DRAFT,
        observable_facts: identifiers.join("; "),
      },
      "zh-Hans",
    );
    const submission = buildCommunicationNoteSubmission(review, {
      reviewedNoIdentifiers: true,
      processingAuthorityConfirmed: true,
    });
    const serialised = JSON.stringify(submission);

    expect(submission).toBeDefined();
    for (const identifier of identifiers) {
      expect(serialised).not.toContain(identifier);
    }
    expect(serialised).not.toContain("findings");
    expect(serialised).not.toContain("sanitisedDraft");
    expect(serialised).not.toContain("startOffset");
    expect(serialised).toContain("reviewedNoIdentifiers");
    expect(serialised).toContain("processingAuthorityConfirmed");
  });
});
