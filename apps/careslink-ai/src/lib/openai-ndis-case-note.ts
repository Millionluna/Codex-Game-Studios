import {
  NDIS_CASE_NOTE_DISCLAIMER,
  parseNdisCaseNoteMaterial,
  type NdisCaseNoteCompanionInput,
  type NdisCaseNoteMaterial,
} from "./ndis-case-note-companion";
import {
  getOpenAiResponseOutputText,
  type OpenAiResponsesOutputPayload,
} from "./openai-responses-output";

export type GeneratedNdisCaseNoteDraft = {
  material: NdisCaseNoteMaterial;
  inputTokenCount: number;
  outputTokenCount: number;
};

type GenerateNdisCaseNoteDraftInput = {
  input: NdisCaseNoteCompanionInput;
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
const DEFAULT_MODEL = "gpt-5.4-mini";
const OUTPUT_KEYS = [
  "englishCaseNoteDraft",
  "chineseReviewVersion",
  "missingFacts",
  "neutralWordingChecks",
  "followUpPrompts",
  "disclaimer",
] as const;

export async function generateNdisCaseNoteDraft({
  input,
  apiKey,
  model,
  fetchImpl = fetch,
}: GenerateNdisCaseNoteDraftInput): Promise<GeneratedNdisCaseNoteDraft> {
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
      buildNdisCaseNoteResponsesRequest(
        input,
        model.trim() || DEFAULT_MODEL,
      ),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI NDIS case note generation failed${
        response.status ? ` (${response.status})` : ""
      }`,
    );
  }

  const payload = (await response.json()) as OpenAiResponsesPayload;

  return {
    material: parseNdisCaseNoteMaterial(
      getOpenAiResponseOutputText(payload),
    ),
    inputTokenCount: getTokenCount(payload.usage?.input_tokens),
    outputTokenCount: getTokenCount(payload.usage?.output_tokens),
  };
}

export function buildNdisCaseNoteResponsesRequest(
  input: NdisCaseNoteCompanionInput,
  model: string,
) {
  return {
    model,
    store: false,
    max_output_tokens: 1400,
    text: {
      format: {
        type: "json_schema",
        name: "careslink_ndis_case_note_draft",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: OUTPUT_KEYS,
          properties: {
            englishCaseNoteDraft: { type: "string" },
            chineseReviewVersion: { type: "string" },
            missingFacts: {
              type: "array",
              maxItems: 8,
              items: { type: "string" },
            },
            neutralWordingChecks: {
              type: "array",
              maxItems: 8,
              items: { type: "string" },
            },
            followUpPrompts: {
              type: "array",
              maxItems: 8,
              items: { type: "string" },
            },
            disclaimer: { type: "string" },
          },
        },
      },
    },
    input: [
      {
        role: "system",
        content: [
          "You draft neutral NDIS case-note wording from de-identified, user-entered facts.",
          "Use only the supplied facts. Never invent events, observations, diagnoses, risks, care outcomes, goal achievement, participant intent, or worker qualifications.",
          "Do not make clinical, legal, compliance, care, regulatory, or professional decisions.",
          "Do not use the words approved, compliant, verified, guaranteed, certified, endorsed, or the phrase meets requirements.",
          "Describe observable actions and responses without interpretation. Use participant or person, never infer a name.",
          "Return an English case-note draft and a Simplified Chinese review version that contain exactly the same facts.",
          "The Chinese version is only a factual review aid, not a second formal record. Do not add, omit, strengthen, soften, diagnose, interpret, or conclude anything in either language.",
          "Preserve dates, times, counts, durations, and other numeric facts with the same Arabic numerals in both language versions.",
          "The result is a user-reviewed draft, not a completed record.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "Create concise English case-note draft wording, a fact-matched Simplified Chinese review version, and a factual review checklist.",
          style:
            "Plain Australian English plus natural Simplified Chinese, chronological where possible, neutral, specific, and easy for a support worker to review.",
          constraints: [
            "Do not add facts that are absent from the structured input.",
            "englishCaseNoteDraft and chineseReviewVersion must preserve the same core facts, dates, times, counts, durations, actions, responses, and follow-up status.",
            "Use the same Arabic numerals in both versions and do not translate numeric facts into Chinese numerals.",
            "chineseReviewVersion is only for factual checking and must not describe itself as a formal or completed record.",
            "Put absent information in missingFacts or followUpPrompts instead of guessing.",
            "neutralWordingChecks must identify phrases the user should review for objectivity.",
            `Use this disclaimer exactly: ${NDIS_CASE_NOTE_DISCLAIMER}`,
          ],
          deidentifiedSupportDetails: input,
        }),
      },
    ],
  };
}

function getTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
