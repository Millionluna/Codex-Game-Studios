import type { PublicProviderProfileDraft } from "./public-provider-profile-generator";
import {
  getOpenAiResponseOutputText,
  type OpenAiResponsesOutputPayload,
} from "./openai-responses-output";

export type HandoverChecklistDraftInput = PublicProviderProfileDraft;

export type HandoverChecklistMaterial = {
  checklistTitle: string;
  consentCheck: string;
  clientContext: string;
  supportNeed: string;
  handoverDetails: string;
  nextStep: string;
  disclaimer: string;
};

export type GeneratedHandoverChecklistDraft = {
  material: HandoverChecklistMaterial;
  inputTokenCount: number;
  outputTokenCount: number;
};

type GenerateHandoverChecklistDraftInput = {
  draft: HandoverChecklistDraftInput;
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
const DEFAULT_HANDOVER_CHECKLIST_MODEL = "gpt-5.4-mini";
const HANDOVER_CHECKLIST_KEYS = [
  "checklistTitle",
  "consentCheck",
  "clientContext",
  "supportNeed",
  "handoverDetails",
  "nextStep",
  "disclaimer",
] as const;

export async function generateHandoverChecklistDraft({
  draft,
  apiKey,
  model,
  fetchImpl = fetch,
}: GenerateHandoverChecklistDraftInput): Promise<GeneratedHandoverChecklistDraft> {
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
      buildHandoverChecklistResponsesRequest(
        draft,
        model.trim() || DEFAULT_HANDOVER_CHECKLIST_MODEL,
      ),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI handover checklist generation failed${
        response.status ? ` (${response.status})` : ""
      }`,
    );
  }

  const payload = (await response.json()) as OpenAiResponsesPayload;

  return {
    material: parseHandoverChecklistMaterial(getOpenAiResponseOutputText(payload)),
    inputTokenCount: getTokenCount(payload.usage?.input_tokens),
    outputTokenCount: getTokenCount(payload.usage?.output_tokens),
  };
}

function buildHandoverChecklistResponsesRequest(
  draft: HandoverChecklistDraftInput,
  model: string,
) {
  return {
    model,
    max_output_tokens: 900,
    text: {
      format: {
        type: "json_schema",
        name: "careslink_handover_checklist",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: HANDOVER_CHECKLIST_KEYS,
          properties: {
            checklistTitle: { type: "string" },
            consentCheck: { type: "string" },
            clientContext: { type: "string" },
            supportNeed: { type: "string" },
            handoverDetails: { type: "string" },
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
          "You draft referral handover checklist material for CaresLink AI. This is general business profile and operational support only. Do not claim that CaresLink has approved, verified, certified, endorsed, clinically assessed, compliance assessed, or guaranteed the provider, service quality, outcomes, or referral acceptance.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Create a short reviewable referral handover checklist from this provider profile.",
          style:
            "Plain, professional, and suitable for Australian aged care and NDIS provider networking.",
          constraints: [
            "Use only the self-submitted provider information below.",
            "Keep the checklist operational: consent, context, support need, handover details, and next step.",
            "Do not give clinical, legal, compliance, financial, or service-quality advice.",
            "Do not imply CaresLink assessed clinical suitability, urgency, service quality, compliance, or outcomes.",
            "The disclaimer must say the information is self-submitted and not clinical advice or a CaresLink endorsement.",
          ],
          providerDraft: draft,
        }),
      },
    ],
  };
}

function parseHandoverChecklistMaterial(
  outputText: unknown,
): HandoverChecklistMaterial {
  if (typeof outputText !== "string") {
    throw new Error("Unable to parse handover checklist draft");
  }

  try {
    const parsed = JSON.parse(outputText) as Record<string, unknown>;
    const material = {} as HandoverChecklistMaterial;

    HANDOVER_CHECKLIST_KEYS.forEach((key) => {
      const value = parsed[key];

      if (typeof value !== "string" || !value.trim()) {
        throw new Error("Invalid handover checklist field");
      }

      material[key] = value.trim();
    });

    return material;
  } catch {
    throw new Error("Unable to parse handover checklist draft");
  }
}

function getTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
