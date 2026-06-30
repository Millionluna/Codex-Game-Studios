import type { PublicProviderProfileDraft } from "./public-provider-profile-generator";
import {
  getOpenAiResponseOutputText,
  type OpenAiResponsesOutputPayload,
} from "./openai-responses-output";

export type ProfileRewriteDraftInput = PublicProviderProfileDraft;

export type ProfileRewriteMaterial = {
  professionalEnglishDescription: string;
  shortEnglishSummary: string;
  chineseCommunityIntro: string;
  referralPartnerSummary: string;
  profileImprovementNotes: string;
  disclaimer: string;
};

export type GeneratedProfileRewriteDraft = {
  material: ProfileRewriteMaterial;
  inputTokenCount: number;
  outputTokenCount: number;
};

type GenerateProfileRewriteDraftInput = {
  draft: ProfileRewriteDraftInput;
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
const DEFAULT_PROFILE_REWRITE_MODEL = "gpt-5.4-mini";
const PROFILE_REWRITE_KEYS = [
  "professionalEnglishDescription",
  "shortEnglishSummary",
  "chineseCommunityIntro",
  "referralPartnerSummary",
  "profileImprovementNotes",
  "disclaimer",
] as const;

export async function generateProfileRewriteDraft({
  draft,
  apiKey,
  model,
  fetchImpl = fetch,
}: GenerateProfileRewriteDraftInput): Promise<GeneratedProfileRewriteDraft> {
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
      buildProfileRewriteResponsesRequest(
        draft,
        model.trim() || DEFAULT_PROFILE_REWRITE_MODEL,
      ),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI profile rewrite generation failed${
        response.status ? ` (${response.status})` : ""
      }`,
    );
  }

  const payload = (await response.json()) as OpenAiResponsesPayload;

  return {
    material: parseProfileRewriteMaterial(getOpenAiResponseOutputText(payload)),
    inputTokenCount: getTokenCount(payload.usage?.input_tokens),
    outputTokenCount: getTokenCount(payload.usage?.output_tokens),
  };
}

function buildProfileRewriteResponsesRequest(
  draft: ProfileRewriteDraftInput,
  model: string,
) {
  return {
    model,
    max_output_tokens: 900,
    text: {
      format: {
        type: "json_schema",
        name: "careslink_profile_rewrite",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: PROFILE_REWRITE_KEYS,
          properties: {
            professionalEnglishDescription: { type: "string" },
            shortEnglishSummary: { type: "string" },
            chineseCommunityIntro: { type: "string" },
            referralPartnerSummary: { type: "string" },
            profileImprovementNotes: { type: "string" },
            disclaimer: { type: "string" },
          },
        },
      },
    },
    input: [
      {
        role: "system",
        content:
          "You improve provider profile wording for CaresLink AI. This is general business profile and operational support only. Do not claim that CaresLink has approved, verified, certified, endorsed, clinically assessed, compliance assessed, or guaranteed the provider, service quality, outcomes, or referral acceptance.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Rewrite the provider profile into reviewable referral-ready wording.",
          style:
            "Plain, professional, referral-operations focused, suitable for Australian aged care and NDIS provider networking.",
          constraints: [
            "Use only the self-submitted provider information below.",
            "Keep all output as draft wording for provider review.",
            "The disclaimer must say the wording is self-submitted or draft material and not a CaresLink endorsement.",
            "Profile improvement notes must suggest operational clarity improvements only.",
          ],
          providerDraft: draft,
        }),
      },
    ],
  };
}

function parseProfileRewriteMaterial(outputText: unknown): ProfileRewriteMaterial {
  if (typeof outputText !== "string") {
    throw new Error("Unable to parse profile rewrite draft");
  }

  try {
    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    const material = {} as ProfileRewriteMaterial;

    PROFILE_REWRITE_KEYS.forEach((key) => {
      const value = parsed[key];

      if (typeof value !== "string" || !value.trim()) {
        throw new Error("Invalid profile rewrite field");
      }

      material[key] = value.trim();
    });

    return material;
  } catch {
    throw new Error("Unable to parse profile rewrite draft");
  }
}

function getTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
