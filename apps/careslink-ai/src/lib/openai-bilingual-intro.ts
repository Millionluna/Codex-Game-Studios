import type { PublicProviderProfileDraft } from "./public-provider-profile-generator";
import {
  getOpenAiResponseOutputText,
  type OpenAiResponsesOutputPayload,
} from "./openai-responses-output";

export type BilingualIntroDraftInput = PublicProviderProfileDraft;

export type BilingualIntroMaterial = {
  englishIntro: string;
  communityLanguageIntro: string;
  language: string;
  sharingContext: string;
  disclaimer: string;
};

export type GeneratedBilingualIntroDraft = {
  material: BilingualIntroMaterial;
  inputTokenCount: number;
  outputTokenCount: number;
};

type GenerateBilingualIntroDraftInput = {
  draft: BilingualIntroDraftInput;
  apiKey: string;
  model: string;
  fetchImpl?: FetchImplementation;
};

type FetchImplementation = (
  input: string,
  init: RequestInit,
) => Promise<{
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}>;

type OpenAiResponsesPayload = OpenAiResponsesOutputPayload & {
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_BILINGUAL_INTRO_MODEL = "gpt-5.4-mini";
const BILINGUAL_INTRO_KEYS = [
  "englishIntro",
  "communityLanguageIntro",
  "language",
  "sharingContext",
  "disclaimer",
] as const;

export async function generateBilingualIntroDraft({
  draft,
  apiKey,
  model,
  fetchImpl = fetch,
}: GenerateBilingualIntroDraftInput): Promise<GeneratedBilingualIntroDraft> {
  const normalizedApiKey = apiKey.trim();

  if (!normalizedApiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${normalizedApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildBilingualIntroResponsesRequest(
        draft,
        model.trim() || DEFAULT_BILINGUAL_INTRO_MODEL,
      ),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI bilingual intro generation failed${
        response.status ? ` (${response.status})` : ""
      }`,
    );
  }

  const payload = (await response.json()) as OpenAiResponsesPayload;

  return {
    material: parseBilingualIntroMaterial(getOpenAiResponseOutputText(payload)),
    inputTokenCount: getTokenCount(payload.usage?.input_tokens),
    outputTokenCount: getTokenCount(payload.usage?.output_tokens),
  };
}

function buildBilingualIntroResponsesRequest(
  draft: BilingualIntroDraftInput,
  model: string,
) {
  return {
    model,
    max_output_tokens: 800,
    text: {
      format: {
        type: "json_schema",
        name: "careslink_bilingual_intro",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: BILINGUAL_INTRO_KEYS,
          properties: {
            englishIntro: { type: "string" },
            communityLanguageIntro: { type: "string" },
            language: { type: "string" },
            sharingContext: { type: "string" },
            disclaimer: { type: "string" },
          },
        },
      },
    },
    input: [
      {
        role: "system",
        content:
          "You draft bilingual provider introduction copy for CaresLink AI. This is general business profile and operational support only. Do not claim that CaresLink has approved, verified, certified, endorsed, clinically assessed, compliance assessed, or guaranteed the provider, service quality, outcomes, or referral acceptance.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Create a short reviewable bilingual provider introduction from this provider profile.",
          style:
            "Plain, professional, and suitable for Australian aged care and NDIS provider networking.",
          constraints: [
            "Use only the self-submitted provider information below.",
            "Provide one English intro and one community-language intro using a language listed in the provider profile where possible.",
            "Keep both intros concise and suitable for provider review before sharing.",
            "Do not give clinical, legal, compliance, financial, or service-quality advice.",
            "The disclaimer must say the information is self-submitted and not a CaresLink endorsement.",
          ],
          providerDraft: draft,
        }),
      },
    ],
  };
}

function parseBilingualIntroMaterial(outputText: unknown): BilingualIntroMaterial {
  if (typeof outputText !== "string") {
    throw new Error("Unable to parse bilingual intro draft");
  }

  try {
    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    const material = {} as BilingualIntroMaterial;

    BILINGUAL_INTRO_KEYS.forEach((key) => {
      const value = parsed[key];

      if (typeof value !== "string" || !value.trim()) {
        throw new Error("Invalid bilingual intro field");
      }

      material[key] = value.trim();
    });

    return material;
  } catch {
    throw new Error("Unable to parse bilingual intro draft");
  }
}

function getTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
