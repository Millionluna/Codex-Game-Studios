import { describe, expect, it, vi } from "vitest";
import {
  buildNdisCaseNoteResponsesRequest,
  generateNdisCaseNoteDraft,
} from "./openai-ndis-case-note";
import { NDIS_CASE_NOTE_DISCLAIMER } from "./ndis-case-note-companion";

const input = {
  supportDateTime: "2026-07-23T10:30",
  supportType: "Community participation",
  setting: "Community setting",
  supportDelivered: "The worker supported a planned shopping trip.",
  observableFacts: "The participant selected two items.",
  actionTaken: "The worker supported the participant to return home.",
  followUp: "Review at the next handover.",
};

const material = {
  englishCaseNoteDraft:
    "The participant attended a community setting with support from the worker.",
  chineseReviewVersion: "参与者在工作人员支持下前往了社区场景。",
  missingFacts: ["Confirm the finish time."],
  neutralWordingChecks: ["Keep statements observable."],
  followUpPrompts: ["Confirm whether the handover occurred."],
  disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
};

describe("OpenAI NDIS case note adapter", () => {
  it("uses strict structured output and a bounded response budget", () => {
    const request = buildNdisCaseNoteResponsesRequest(input, "gpt-test");

    expect(request.model).toBe("gpt-test");
    expect(request.store).toBe(false);
    expect(request.max_output_tokens).toBe(1400);
    expect(request.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "careslink_ndis_case_note_draft",
    });
    expect(JSON.stringify(request.input)).toContain(
      "Never invent events",
    );
    expect(JSON.stringify(request.input)).toContain(
      NDIS_CASE_NOTE_DISCLAIMER,
    );
    expect(request.text.format.schema.required).toEqual(
      expect.arrayContaining([
        "englishCaseNoteDraft",
        "chineseReviewVersion",
      ]),
    );
    expect(JSON.stringify(request.input)).toContain(
      "exactly the same facts",
    );
    expect(JSON.stringify(request.input)).toContain(
      "not a second formal record",
    );
  });

  it("returns the controlled material and token counts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify(material),
        usage: { input_tokens: 160, output_tokens: 110 },
      }),
    });

    const generated = await generateNdisCaseNoteDraft({
      input,
      apiKey: "test-key",
      model: "gpt-test",
      fetchImpl,
    });

    expect(generated).toEqual({
      material,
      inputTokenCount: 160,
      outputTokenCount: 110,
    });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain("deidentifiedSupportDetails");
  });

  it("rejects a model response that crosses the prohibited wording boundary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          ...material,
          englishCaseNoteDraft: "This record is verified.",
        }),
      }),
    });

    await expect(
      generateNdisCaseNoteDraft({
        input,
        apiKey: "test-key",
        model: "gpt-test",
        fetchImpl,
      }),
    ).rejects.toThrow("wording boundary");
  });
});
