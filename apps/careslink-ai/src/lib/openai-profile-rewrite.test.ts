import { describe, expect, it, vi } from "vitest";
import {
  generateProfileRewriteDraft,
  type ProfileRewriteDraftInput,
} from "./openai-profile-rewrite";

const draft: ProfileRewriteDraftInput = {
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

describe("OpenAI profile rewrite generation", () => {
  it("calls the Responses API with structured output and returns a parsed profile rewrite draft", async () => {
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
          professionalEnglishDescription:
            "Harbour Community Support provides community navigation and social support information for review.",
          shortEnglishSummary:
            "Community navigation profile for aged care and NDIS referral conversations.",
          chineseCommunityIntro:
            "Harbour Community Support 提供社区导航和社交支持资料，供转介沟通前审核。",
          referralPartnerSummary:
            "Useful for referral partners who need a concise, self-submitted provider overview.",
          profileImprovementNotes:
            "Add clearer intake timing and current capacity before wider sharing.",
          disclaimer:
            "Draft wording based on self-submitted information. Not a CaresLink endorsement.",
        }),
        usage: {
          input_tokens: 180,
          output_tokens: 120,
        },
      }),
    }));

    const result = await generateProfileRewriteDraft({
      draft,
      apiKey: "test-openai-key",
      model: "gpt-5.4-mini",
      fetchImpl,
    });

    expect(result.material).toEqual({
      professionalEnglishDescription:
        "Harbour Community Support provides community navigation and social support information for review.",
      shortEnglishSummary:
        "Community navigation profile for aged care and NDIS referral conversations.",
      chineseCommunityIntro:
        "Harbour Community Support 提供社区导航和社交支持资料，供转介沟通前审核。",
      referralPartnerSummary:
        "Useful for referral partners who need a concise, self-submitted provider overview.",
      profileImprovementNotes:
        "Add clearer intake timing and current capacity before wider sharing.",
      disclaimer:
        "Draft wording based on self-submitted information. Not a CaresLink endorsement.",
    });
    expect(result.inputTokenCount).toBe(180);
    expect(result.outputTokenCount).toBe(120);
    const requestBody = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body ?? "{}"),
    );

    expect(requestBody).toMatchObject({
      model: "gpt-5.4-mini",
      max_output_tokens: 900,
      text: {
        format: {
          type: "json_schema",
          name: "careslink_profile_rewrite",
          strict: true,
        },
      },
    });
    expect(JSON.stringify(requestBody)).toContain(
      "general business profile and operational support only",
    );
    expect(JSON.stringify(requestBody)).not.toContain("test-openai-key");
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
      generateProfileRewriteDraft({
        draft,
        apiKey: "test-openai-key",
        model: "gpt-5.4-mini",
        fetchImpl,
      }),
    ).rejects.toThrow("Unable to parse profile rewrite draft");
  });
});
