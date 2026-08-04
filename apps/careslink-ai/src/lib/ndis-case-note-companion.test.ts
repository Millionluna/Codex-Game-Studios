import { describe, expect, it } from "vitest";
import {
  NDIS_CASE_NOTE_DISCLAIMER,
  getNdisCaseNoteMaterialCopyText,
  parseNdisCaseNoteMaterial,
  validateNdisCaseNoteCompanionInput,
  validateNdisCaseNotePrivacyAttestation,
} from "./ndis-case-note-companion";

const validInput = {
  supportDateTime: "2026-07-23T10:30",
  supportType: "Community participation",
  setting: "Local community setting",
  supportDelivered:
    "The worker supported the participant to plan a short shopping trip.",
  observableFacts:
    "The participant selected two items and asked to return home after 25 minutes.",
  actionTaken:
    "The worker confirmed the request and supported the participant to return home.",
  followUp: "Share the participant's stated preference at the next team handover.",
};

const validMaterial = {
  englishCaseNoteDraft:
    "The participant attended a local community setting with support from the worker.",
  chineseReviewVersion: "参与者在工作人员支持下前往了本地社区场景。",
  missingFacts: ["Confirm the support start and finish time."],
  neutralWordingChecks: ["Confirm that all statements describe observable facts."],
  followUpPrompts: ["Record whether the planned handover occurred."],
  disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
};

describe("NDIS case note companion boundaries", () => {
  it("accepts structured, de-identified support facts", () => {
    expect(validateNdisCaseNoteCompanionInput(validInput)).toEqual({
      ok: true,
      input: validInput,
    });
  });

  it("requires a support date and approximate time on the server", () => {
    const result = validateNdisCaseNoteCompanionInput({
      ...validInput,
      supportDateTime: "",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toContainEqual(
      expect.objectContaining({
        field: "supportDateTime",
        code: "required",
      }),
    );
  });

  it("requires both privacy attestations without treating authority as consent", () => {
    expect(
      validateNdisCaseNotePrivacyAttestation({
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: false,
      }),
    ).toBe(false);
    expect(
      validateNdisCaseNotePrivacyAttestation({
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: true,
      }),
    ).toBe(true);
  });

  it.each([
    [
      "email",
      "The worker emailed person@example.com after the visit.",
      "email",
    ],
    [
      "Australian mobile",
      "Call 0412 345 678 after the visit.",
      "phone",
    ],
    [
      "Australian landline",
      "Call (02) 9123 4567 after the visit.",
      "phone",
    ],
    [
      "NDIS number",
      "NDIS participant number: 123456789",
      "ndis_number",
    ],
    [
      "short NDIS label",
      "NDIS: 123456789",
      "ndis_number",
    ],
    [
      "NDIS hash label",
      "NDIS #123456789",
      "ndis_number",
    ],
    [
      "NDIS participant label",
      "NDIS participant 123456789",
      "ndis_number",
    ],
    [
      "Australian mobile with country trunk prefix",
      "Call +61 (0)4 1234 5678 after the visit.",
      "phone",
    ],
    [
      "date of birth",
      "DOB: 11/02/1990",
      "date_of_birth",
    ],
    ["English name", "Participant: Jane Smith", "name"],
    ["Chinese name", "姓名：王小明", "name"],
    ["unlabelled family name", "她女儿王美玲打电话。", "name"],
    ["worker name and title", "小张护工陪同参与者。", "name"],
    ["Chinese honorific", "李阿姨提出返回。", "name"],
    ["mixed Chinese and English name", "王美玲 Alice Chen 到场。", "name"],
    ["Chinese NDIS number", "她的NDIS号码是123456789。", "ndis_number"],
    ["exact address", "12 George Street Sydney", "address"],
    ["subjective wording", "The participant was difficult.", "subjective_language"],
    ["clinical wording", "The participant was diagnosed with anxiety.", "clinical_language"],
    ["risk conclusion", "The participant was at high risk.", "risk_statement"],
    ["goal conclusion", "The participant's goal was achieved.", "goal_achievement"],
    ["quality judgement", "The worker was qualified.", "quality_assessment"],
    ["indirect clue", "School: Northside College", "indirect_identifier"],
    ["specific place", "Support occurred at Chatswood Chase.", "indirect_identifier"],
  ])("blocks an obvious %s before generation", (_label, value, code) => {
    const result = validateNdisCaseNoteCompanionInput({
      ...validInput,
      observableFacts: value,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "observableFacts",
          code,
        }),
      ]),
    );
  });

  it("parses a structured material and replaces the disclaimer with the controlled boundary", () => {
    const parsed = parseNdisCaseNoteMaterial(
      JSON.stringify({
        ...validMaterial,
        disclaimer: "Draft wording for user review only.",
      }),
    );

    expect(parsed.disclaimer).toBe(NDIS_CASE_NOTE_DISCLAIMER);
    expect(getNdisCaseNoteMaterialCopyText(parsed)).toContain(
      "Missing facts to review",
    );
    expect(getNdisCaseNoteMaterialCopyText(parsed)).toContain(
      "not a second formal record",
    );
  });

  it.each([
    "This record is approved.",
    "The wording is compliant.",
    "The outcome is guaranteed.",
    "This meets requirements.",
    "The participant was diagnosed with anxiety.",
    "The participant was at high risk.",
    "The participant's goal was achieved.",
    "This was a successful care outcome.",
    "The worker was qualified.",
    "这份记录合规。",
    "参与者的目标已经达成。",
  ])("rejects prohibited output wording: %s", (englishCaseNoteDraft) => {
    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({ ...validMaterial, englishCaseNoteDraft }),
      ),
    ).toThrow("wording boundary");
  });

  it("rejects an obvious identifier returned by the model", () => {
    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: "Contact participant@example.com after the visit.",
        }),
      ),
    ).toThrow("obvious identifier");
  });

  it("rejects a Chinese identifier returned by the model", () => {
    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          chineseReviewVersion: "参与者：王小明在社区场景接受支持。",
        }),
      ),
    ).toThrow("obvious identifier");
  });

  it("accepts matching bilingual numeric facts and rejects a mismatch", () => {
    const matching = {
      ...validMaterial,
      englishCaseNoteDraft:
        "The participant selected 2 items and asked to return after 25 minutes.",
      chineseReviewVersion: "参与者选择了 2 件物品，并在 25 分钟后提出返回。",
    };

    expect(parseNdisCaseNoteMaterial(JSON.stringify(matching))).toMatchObject(
      matching,
    );
    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...matching,
          chineseReviewVersion: "参与者选择了 2 件物品，并在 20 分钟后提出返回。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");
  });

  it.each([
    [
      "English month name and Chinese numeric month",
      "Support was delivered on 4 August 2026.",
      "支持于2026年8月4日提供。",
    ],
    [
      "month-first English date",
      "Support was delivered on August 4, 2026.",
      "支持于2026年8月4日提供。",
    ],
    [
      "numeric Australian date",
      "Support was delivered on 04/08/2026.",
      "支持于2026-08-04提供。",
    ],
    [
      "English and Chinese time",
      "The activity started at 2:30 pm and continued for 25 minutes.",
      "活动于下午2:30开始，持续25分钟。",
    ],
    [
      "morning boundary",
      "The activity started at 10:30 am.",
      "活动于上午10:30开始。",
    ],
    [
      "afternoon boundary",
      "The activity started at 1:30 pm.",
      "活动于下午1:30开始。",
    ],
    [
      "noon boundary",
      "The activity started at 12:15 pm.",
      "活动于中午12:15开始。",
    ],
    [
      "midnight boundary",
      "The activity started at 12:05 am.",
      "活动于凌晨12:05开始。",
    ],
    [
      "evening boundary",
      "The activity started at 8:30 pm.",
      "活动于晚上8:30开始。",
    ],
    [
      "evening midnight boundary",
      "The activity started at 12:05 am.",
      "活动于晚上12:05开始。",
    ],
  ])("accepts date-aware bilingual parity for %s", (_label, english, chinese) => {
    expect(
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: english,
          chineseReviewVersion: chinese,
        }),
      ),
    ).toMatchObject({
      englishCaseNoteDraft: english,
      chineseReviewVersion: chinese,
    });
  });

  it("preserves non-date numeric facts after date canonicalization", () => {
    const material = {
      ...validMaterial,
      englishCaseNoteDraft:
        "On 4 August 2026, the participant selected 3 items and waited 25 minutes.",
      chineseReviewVersion:
        "2026年8月4日，参与者选择了3件物品，并等待了25分钟。",
    };

    expect(parseNdisCaseNoteMaterial(JSON.stringify(material))).toMatchObject(
      material,
    );
    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...material,
          chineseReviewVersion:
            "2026年8月4日，参与者选择了2件物品，并等待了25分钟。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");
  });

  it("rejects a real date or time difference", () => {
    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft:
            "Support was delivered on 4 August 2026 at 2:30 pm.",
          chineseReviewVersion: "支持于2026年8月5日下午2:30提供。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");

    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft:
            "Support was delivered on 4 August 2026 at 2:30 pm.",
          chineseReviewVersion: "支持于2026年8月4日下午3:30提供。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");

    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: "The activity started at 12:05 pm.",
          chineseReviewVersion: "活动于晚上12:05开始。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");

    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: "The activity started at 1:30 am.",
          chineseReviewVersion: "活动于晚上1:30开始。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");
  });

  it("does not canonicalize slash or ISO-shaped numbers without date semantics", () => {
    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: "The measured ratio was 04/08/2026.",
          chineseReviewVersion: "测得的比率为2026-08-04。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");

    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: "The reference code was 2026-08-04.",
          chineseReviewVersion: "参考代码为04/08/2026。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");
  });

  it("does not turn an invalid noon hour into an evening time", () => {
    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: "The activity started at 10:30 am.",
          chineseReviewVersion: "活动于中午10:30开始。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");

    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: "The activity started at 10:30 pm.",
          chineseReviewVersion: "活动于中午10:30开始。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");

    expect(() =>
      parseNdisCaseNoteMaterial(
        JSON.stringify({
          ...validMaterial,
          englishCaseNoteDraft: "The activity started at 12:30 am.",
          chineseReviewVersion: "活动于中午12:30开始。",
        }),
      ),
    ).toThrow("bilingual drafts did not preserve core numeric facts");
  });

  it("reads legacy saved drafts only when explicitly allowed", () => {
    const legacy = {
      caseNoteDraft: "Legacy neutral draft wording.",
      missingFacts: [],
      neutralWordingChecks: [],
      followUpPrompts: [],
      disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
    };

    expect(() => parseNdisCaseNoteMaterial(JSON.stringify(legacy))).toThrow();
    expect(
      parseNdisCaseNoteMaterial(JSON.stringify(legacy), { allowLegacy: true })
        .englishCaseNoteDraft,
    ).toBe(legacy.caseNoteDraft);
  });
});
