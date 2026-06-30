import { describe, expect, it, vi } from "vitest";
import {
  generateShareCardDraft,
  type ShareCardDraftInput,
} from "./openai-share-card";

const draft: ShareCardDraftInput = {
  id: "sample-harbour",
  profile: {
    name: "Harbour Community Support",
    entityType: "organisation",
    referralDirection: "both",
    serviceAreas: ["Inner West Sydney", "Canterbury-Bankstown"],
    languages: ["English", "Mandarin"],
    intakeMethod: "Phone warm handover and secure web form",
    responseTime: "Usually within the week",
    capacityStatus: "Limited weekday intake places available",
    bestFit: ["Older adults who need community navigation"],
    handoverRequirements: ["Client goals", "Consent confirmation"],
    summary:
      "Neighbourhood aged care navigation and social support for older adults.",
  },
  shareCard: {
    title: "Harbour Community Support",
    channel: "Provider profile preview",
    summary: "A structured provider profile draft.",
    cta: "Save this draft to continue in CaresLink AI",
  },
  boundary:
    "Self-submitted provider information. Not a CaresLink endorsement, certification, quality assessment, clinical assessment, compliance assessment, or referral outcome guarantee.",
};

describe("OpenAI share card generation", () => {
  it("calls the Responses API with structured output and returns a parsed share-card draft", async () => {
    const fetchImpl = vi.fn<
      (
        input: string,
        init: RequestInit,
      ) => Promise<{
        ok: boolean;
        json: () => Promise<Record<string, unknown>>;
      }>
    >(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          headline: "Harbour Community Support",
          subheadline: "Referral-ready community support profile",
          serviceArea: "Inner West Sydney; Canterbury-Bankstown",
          languages: "English; Mandarin",
          referralFit: "Older adults who need community navigation",
          intakePath: "Phone warm handover and secure web form",
          disclaimer:
            "Based on self-submitted information. Not a provider endorsement.",
        }),
        usage: {
          input_tokens: 120,
          output_tokens: 80,
        },
      }),
    }));

    const result = await generateShareCardDraft({
      draft,
      apiKey: "test-openai-key",
      model: "gpt-5.4-mini",
      fetchImpl,
    });

    expect(result.material).toEqual({
      headline: "Harbour Community Support",
      subheadline: "Referral-ready community support profile",
      serviceArea: "Inner West Sydney; Canterbury-Bankstown",
      languages: "English; Mandarin",
      referralFit: "Older adults who need community navigation",
      intakePath: "Phone warm handover and secure web form",
      disclaimer:
        "Based on self-submitted information. Not a provider endorsement.",
    });
    expect(result.inputTokenCount).toBe(120);
    expect(result.outputTokenCount).toBe(80);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-openai-key",
          "Content-Type": "application/json",
        }),
      }),
    );
    const requestBody = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body ?? "{}"),
    );

    expect(requestBody).toMatchObject({
      model: "gpt-5.4-mini",
      max_output_tokens: 700,
      text: {
        format: {
          type: "json_schema",
          name: "careslink_share_card",
          strict: true,
        },
      },
    });
    expect(JSON.stringify(requestBody)).toContain(
      "general business profile and operational support only",
    );
    expect(JSON.stringify(requestBody)).not.toContain("test-openai-key");
  });

  it("requires an OpenAI API key before calling the Responses API", async () => {
    const fetchImpl = vi.fn();

    await expect(
      generateShareCardDraft({
        draft,
        apiKey: "",
        model: "gpt-5.4-mini",
        fetchImpl,
      }),
    ).rejects.toThrow("OpenAI API key is not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects malformed model output instead of returning unsafe free text", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: "not json",
        usage: {},
      }),
    }));

    await expect(
      generateShareCardDraft({
        draft,
        apiKey: "test-openai-key",
        model: "gpt-5.4-mini",
        fetchImpl,
      }),
    ).rejects.toThrow("Unable to parse share card draft");
  });
});
