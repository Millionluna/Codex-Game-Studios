import "server-only";

import {
  createCaresLinkV1NoteProviderPolicySnapshot,
  type CaresLinkV1NoteProviderPolicySnapshot,
} from "./note-generation-provider-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CaresLinkV1ContractError,
} from "./shared-contracts";
import type { CaresLinkV1NoteProviderCandidate } from "./note-generation-output";

export const CARESLINK_V1_OPENAI_RESPONSES_PROVIDER_ID =
  "openai.responses" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PROMPT_TEMPLATE_VERSION =
  "prompt.communication.2026-08-27.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION =
  "golden.communication.2026-08-27.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PARSER_VERSION =
  "parser.communication.responses-json.2026-08-27.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PROVIDER_POLICY_VERSION =
  "policy.communication.openai.preview-evaluation.v1" as const;

/**
 * A real adapter exists, but no model policy, worker registration, route or
 * deployment imports it. This latch must stay false until those gates close.
 */
export const CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_PROVIDER_READY =
  false as const;

export const CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_ACTIVATION_BLOCKERS =
  Object.freeze([
    "MODEL_POLICY_NOT_APPROVED",
    "OPENAI_DATA_HANDLING_ZDR_REGION_NOT_APPROVED",
    "SEMANTIC_GROUNDEDNESS_NOT_APPROVED",
    "PAYLOAD_VAULT_NOT_CONFIGURED",
    "WORKER_REGISTRATION_EMPTY",
    "SERVED_ROUTE_DISABLED",
    "POINTS_NOT_BOUND",
    "PRODUCTION_ACTIVATION_NOT_AUTHORIZED",
  ] as const);

type CandidateInput = Readonly<{
  capability: "DRAFT_PREVIEW_EVALUATION_ONLY";
  modelId: string;
  modelRevision: null;
  modelRevisionAvailability: "PROVIDER_NOT_EXPOSED";
  timeoutMs: number;
}>;

/**
 * Builds a digest-bound evaluation candidate without selecting a current
 * model. The caller must supply the model explicitly; there is no fallback.
 */
export function createCaresLinkV1CommunicationNoteProviderPolicyCandidate(
  input: CandidateInput,
): CaresLinkV1NoteProviderPolicySnapshot {
  if (input.capability !== "DRAFT_PREVIEW_EVALUATION_ONLY") {
    throw invalid("Communication Note provider policy is unavailable");
  }
  if (
    input.modelRevision !== null ||
    input.modelRevisionAvailability !== "PROVIDER_NOT_EXPOSED"
  ) {
    throw invalid("Communication Note provider model revision is unavailable");
  }
  return createCaresLinkV1NoteProviderPolicySnapshot({
    noteType: "communication",
    serviceCode: "note.communication.generate",
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    rateCatalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    providerId: CARESLINK_V1_OPENAI_RESPONSES_PROVIDER_ID,
    modelId: input.modelId,
    modelRevision: input.modelRevision,
    modelRevisionAvailability: input.modelRevisionAvailability,
    policyVersion: CARESLINK_V1_COMMUNICATION_NOTE_PROVIDER_POLICY_VERSION,
    promptTemplateVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PROMPT_TEMPLATE_VERSION,
    goldenSetVersion: CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION,
    parserVersion: CARESLINK_V1_COMMUNICATION_NOTE_PARSER_VERSION,
    timeoutMs: input.timeoutMs,
  });
}

export function assertCaresLinkV1CommunicationNoteProviderPolicy(
  value: CaresLinkV1NoteProviderPolicySnapshot,
) {
  if (
    value.noteType !== "communication" ||
    value.serviceCode !== "note.communication.generate" ||
    value.providerId !== CARESLINK_V1_OPENAI_RESPONSES_PROVIDER_ID ||
    value.modelRevision !== null ||
    value.modelRevisionAvailability !== "PROVIDER_NOT_EXPOSED" ||
    value.policyVersion !==
      CARESLINK_V1_COMMUNICATION_NOTE_PROVIDER_POLICY_VERSION ||
    value.promptTemplateVersion !==
      CARESLINK_V1_COMMUNICATION_NOTE_PROMPT_TEMPLATE_VERSION ||
    value.goldenSetVersion !==
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_SET_VERSION ||
    value.parserVersion !== CARESLINK_V1_COMMUNICATION_NOTE_PARSER_VERSION
  ) {
    throw invalid("Communication Note provider policy does not match the adapter");
  }
}

/** Rejects decision language that is unsafe unless explicitly attributed. */
export function assertCaresLinkV1CommunicationNoteNoInferredDecisionLanguage(
  candidate: CaresLinkV1NoteProviderCandidate,
) {
  const text = [
    candidate.englishDraft,
    ...Object.values(candidate.reviewVersions),
    ...candidate.missingFacts,
    ...candidate.neutralWordingChecks,
    ...candidate.followUpPrompts,
  ].join("\n");
  const unsafe = [
    /\b(?:caller|representative|participant|client|person)\s+(?:agreed|consented|committed|accepted|decided|promised)\b/i,
    /\b(?:agreement|consent|commitment|decision)\s+(?:was|is)\s+(?:given|confirmed|made|accepted)\b/i,
    /(?:来电者|來電者|代表|参与者|參與者|客户|客戶).{0,8}(?:同意|承诺|承諾|决定|決定|接受)/u,
  ];
  if (unsafe.some((pattern) => pattern.test(text))) {
    throw invalid("Communication Note contains inferred decision language");
  }
}

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}
