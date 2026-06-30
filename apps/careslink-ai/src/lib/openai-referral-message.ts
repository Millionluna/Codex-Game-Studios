import type { PublicProviderProfileDraft } from "./public-provider-profile-generator";
import {
  getOpenAiResponseOutputText,
  type OpenAiResponsesOutputPayload,
} from "./openai-responses-output";

export type ReferralMessageDraftInput = PublicProviderProfileDraft;

export type ReferralMessageMaterial = {
  subjectLine: string;
  opening: string;
  providerSummary: string;
  referralFit: string;
  handoverRequest: string;
  nextStep: string;
  disclaimer: string;
};

export type GeneratedReferralMessageDraft = {
  material: ReferralMessageMaterial;
  inputTokenCount: number;
  outputTokenCount: number;
};

type GenerateReferralMessageDraftInput = {
  draft: ReferralMessageDraftInput;
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
const DEFAULT_REFERRAL_MESSAGE_MODEL = "gpt-5.4-mini";
const REFERRAL_MESSAGE_KEYS = [
  "subjectLine",
  "opening",
  "providerSummary",
  "referralFit",
  "handoverRequest",
  "nextStep",
  "disclaimer",
] as const;

export async function generateReferralMessageDraft({
  draft,
  apiKey,
  model,
  fetchImpl = fetch,
}: GenerateReferralMessageDraftInput): Promise<GeneratedReferralMessageDraft> {
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
      buildReferralMessageResponsesRequest(
        draft,
        model.trim() || DEFAULT_REFERRAL_MESSAGE_MODEL,
      ),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI referral message generation failed${
        response.status ? ` (${response.status})` : ""
      }`,
    );
  }

  const payload = (await response.json()) as OpenAiResponsesPayload;

  return {
    material: parseReferralMessageMaterial(getOpenAiResponseOutputText(payload)),
    inputTokenCount: getTokenCount(payload.usage?.input_tokens),
    outputTokenCount: getTokenCount(payload.usage?.output_tokens),
  };
}

function buildReferralMessageResponsesRequest(
  draft: ReferralMessageDraftInput,
  model: string,
) {
  return {
    model,
    max_output_tokens: 900,
    text: {
      format: {
        type: "json_schema",
        name: "careslink_referral_message",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: REFERRAL_MESSAGE_KEYS,
          properties: {
            subjectLine: { type: "string" },
            opening: { type: "string" },
            providerSummary: { type: "string" },
            referralFit: { type: "string" },
            handoverRequest: { type: "string" },
            nextStep: { type: "string" },
            disclaimer: { type: "string" },
          },
        },
      },
    },
    input: [
      {
        role: "system",
        content:
          "You draft referral partner messages for CaresLink AI. This is general business profile and operational support only. Do not claim that CaresLink has approved, verified, certified, endorsed, clinically assessed, compliance assessed, or guaranteed the provider, service quality, outcomes, or referral acceptance.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Create a reviewable referral partner message from this provider profile.",
          style:
            "Plain, professional, and suitable for Australian aged care and NDIS provider networking.",
          constraints: [
            "Use only the self-submitted provider information below.",
            "Keep the message suitable for a provider or referral source to review before sending.",
            "Do not give clinical, legal, compliance, financial, or service-quality advice.",
            "The disclaimer must say the information is self-submitted and not a CaresLink endorsement.",
          ],
          providerDraft: draft,
        }),
      },
    ],
  };
}

function parseReferralMessageMaterial(outputText: unknown): ReferralMessageMaterial {
  if (typeof outputText !== "string") {
    throw new Error("Unable to parse referral message draft");
  }

  try {
    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    const material = {} as ReferralMessageMaterial;

    REFERRAL_MESSAGE_KEYS.forEach((key) => {
      const value = parsed[key];

      if (typeof value !== "string" || !value.trim()) {
        throw new Error("Invalid referral message field");
      }

      material[key] = value.trim();
    });

    return material;
  } catch {
    throw new Error("Unable to parse referral message draft");
  }
}

function getTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
