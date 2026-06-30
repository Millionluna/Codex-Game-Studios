import type { PublicProviderProfileDraft } from "./public-provider-profile-generator";
import {
  getOpenAiResponseOutputText,
  type OpenAiResponsesOutputPayload,
} from "./openai-responses-output";

export type ShareCardDraftInput = PublicProviderProfileDraft;

export type ShareCardMaterial = {
  headline: string;
  subheadline: string;
  serviceArea: string;
  languages: string;
  referralFit: string;
  intakePath: string;
  disclaimer: string;
};

export type GeneratedShareCardDraft = {
  material: ShareCardMaterial;
  inputTokenCount: number;
  outputTokenCount: number;
};

type GenerateShareCardDraftInput = {
  draft: ShareCardDraftInput;
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
const DEFAULT_SHARE_CARD_MODEL = "gpt-5.4-mini";
const SHARE_CARD_KEYS = [
  "headline",
  "subheadline",
  "serviceArea",
  "languages",
  "referralFit",
  "intakePath",
  "disclaimer",
] as const;

export async function generateShareCardDraft({
  draft,
  apiKey,
  model,
  fetchImpl = fetch,
}: GenerateShareCardDraftInput): Promise<GeneratedShareCardDraft> {
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
      buildShareCardResponsesRequest(
        draft,
        model.trim() || DEFAULT_SHARE_CARD_MODEL,
      ),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI share card generation failed${
        response.status ? ` (${response.status})` : ""
      }`,
    );
  }

  const payload = (await response.json()) as OpenAiResponsesPayload;

  return {
    material: parseShareCardMaterial(getOpenAiResponseOutputText(payload)),
    inputTokenCount: getTokenCount(payload.usage?.input_tokens),
    outputTokenCount: getTokenCount(payload.usage?.output_tokens),
  };
}

function buildShareCardResponsesRequest(
  draft: ShareCardDraftInput,
  model: string,
) {
  return {
    model,
    max_output_tokens: 700,
    text: {
      format: {
        type: "json_schema",
        name: "careslink_share_card",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: SHARE_CARD_KEYS,
          properties: {
            headline: { type: "string" },
            subheadline: { type: "string" },
            serviceArea: { type: "string" },
            languages: { type: "string" },
            referralFit: { type: "string" },
            intakePath: { type: "string" },
            disclaimer: { type: "string" },
          },
        },
      },
    },
    input: [
      {
        role: "system",
        content:
          "You draft concise provider share-card copy for CaresLink AI. This is general business profile and operational support only. Do not claim that CaresLink has approved, verified, certified, endorsed, clinically assessed, compliance assessed, or guaranteed the provider, service quality, outcomes, or referral acceptance.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Create a short, reviewable share-card draft from this provider profile.",
          style:
            "Plain, referral-operations focused, suitable for Australian aged care and NDIS provider networking.",
          constraints: [
            "Use only the self-submitted provider information below.",
            "Keep each field concise.",
            "The disclaimer must say the information is self-submitted and not a CaresLink endorsement.",
          ],
          providerDraft: draft,
        }),
      },
    ],
  };
}

function parseShareCardMaterial(outputText: unknown): ShareCardMaterial {
  if (typeof outputText !== "string") {
    throw new Error("Unable to parse share card draft");
  }

  try {
    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    const material = {} as ShareCardMaterial;

    SHARE_CARD_KEYS.forEach((key) => {
      const value = parsed[key];

      if (typeof value !== "string" || !value.trim()) {
        throw new Error("Invalid share card field");
      }

      material[key] = value.trim();
    });

    return material;
  } catch {
    throw new Error("Unable to parse share card draft");
  }
}

function getTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
