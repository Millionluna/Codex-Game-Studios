import "server-only";

import {
  assertCaresLinkV1CommunicationNoteNoInferredDecisionLanguage,
  assertCaresLinkV1CommunicationNoteProviderPolicy,
} from "./communication-note-provider-policy";
import { assertCaresLinkV1CommunicationNoteCriticalFactParity } from "./communication-note-fact-parity";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE,
  assertCaresLinkV1CommunicationNoteOpenAiResponseSchema,
} from "./communication-note-openai-request-template";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY,
  resolveCaresLinkV1CommunicationNoteOpenAiResponsesUrl,
  validateCaresLinkV1CommunicationNotePreviewEvaluationPlan,
  type CaresLinkV1CommunicationNotePreviewEvaluationPlan,
} from "./communication-note-preview-evaluation-policy";
import {
  buildCaresLinkV1CanonicalNoteContent,
  validateCaresLinkV1NoteProviderCandidate,
  type CaresLinkV1NoteProviderCandidate,
} from "./note-generation-output";
import {
  CaresLinkV1NoteProviderExecutionError,
  createCaresLinkV1NoteProviderAttemptEvidence,
  validateCaresLinkV1NoteProviderPolicySnapshot,
  validateCaresLinkV1NoteProviderWorkerPolicyBinding,
  type CaresLinkV1NoteProviderExecutionReason,
  type CaresLinkV1NoteProviderPolicySnapshot,
  type CaresLinkV1NoteProviderPort,
} from "./note-generation-provider-policy";
import { parseCaresLinkV1NoteGenerationWorkerPolicy } from "./note-generation-worker-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  isCaresLinkV1Locale,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1CleanedFactsFor,
  type CaresLinkV1Locale,
} from "./shared-contracts";

type FetchResponse = Pick<Response, "ok" | "status" | "headers" | "body">;

export type CaresLinkV1OpenAiCommunicationNoteFetch = (
  input: string,
  init: RequestInit,
) => Promise<FetchResponse>;

type ProviderClock = Readonly<{ now(): string }>;

type PreviewProviderOptions = Readonly<{
  capability: "DISPOSABLE_PREVIEW_EVALUATION_ONLY";
  evaluationPlanSnapshot: CaresLinkV1CommunicationNotePreviewEvaluationPlan;
  clock: ProviderClock;
}>;

type ContractTestProviderOptions = Readonly<{
  capability: "MOCKED_CONTRACT_TEST_ONLY";
  evaluationPlanSnapshot: CaresLinkV1CommunicationNotePreviewEvaluationPlan;
  fetchImpl: CaresLinkV1OpenAiCommunicationNoteFetch;
  clock: ProviderClock;
}>;

const CONTRACT_TEST_RESPONSES_URL =
  "careslink-contract-test://openai-responses" as const;
const CONTRACT_TEST_AUTHORIZATION =
  "Bearer careslink-contract-test-not-a-secret" as const;
const contractTestProviders = new WeakSet<object>();

export class CaresLinkV1OpenAiCommunicationNoteProviderError extends CaresLinkV1NoteProviderExecutionError {
  constructor(reason: CaresLinkV1NoteProviderExecutionReason) {
    super(reason);
    this.name = "CaresLinkV1OpenAiCommunicationNoteProviderError";
    this.message = "Communication Note provider execution failed";
  }
}

/**
 * Builds a provider request from validated cleaned facts. Worker identity,
 * correlation, payload locators, privacy proof and policy digests are absent.
 */
export function buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest(input: Readonly<{
  policySnapshot: CaresLinkV1NoteProviderPolicySnapshot;
  evaluationPlanSnapshot: CaresLinkV1CommunicationNotePreviewEvaluationPlan;
  sourceLocale: CaresLinkV1Locale;
  cleanedFacts: unknown;
}>) {
  const policy = validateCommunicationPolicy(input.policySnapshot);
  const evaluationPlan = validateEvaluationPlanBinding(
    input.evaluationPlanSnapshot,
    policy,
  );
  if (!isCaresLinkV1Locale(input.sourceLocale)) throw policyMismatch();
  const cleanedFacts = validateCaresLinkV1CleanedFacts(
    "communication",
    input.cleanedFacts,
  );
  const template = CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE;

  return {
    model: policy.modelId,
    store: evaluationPlan.request.store,
    background: evaluationPlan.request.background,
    service_tier: template.serviceTier,
    truncation: template.truncation,
    tools: template.tools,
    tool_choice: template.toolChoice,
    parallel_tool_calls: template.parallelToolCalls,
    max_output_tokens: evaluationPlan.request.maxOutputTokens,
    reasoning: {
      effort: evaluationPlan.request.reasoningEffort,
    },
    text: template.text,
    input: [
      template.systemMessage,
      {
        role: template.userMessage.role,
        content: JSON.stringify({
          noteType: template.userMessage.noteType,
          sourceLocale: input.sourceLocale,
          cleanedFacts,
        }),
      },
    ],
  };
}

/**
 * Paid Preview construction stays fail-closed until a separate project/ZDR,
 * owner-budget and runner/report execution attestation exists. The frozen M1f
 * candidate is not an execution token.
 */
export function createCaresLinkV1OpenAiCommunicationNotePreviewProvider(
  options: PreviewProviderOptions,
): CaresLinkV1NoteProviderPort {
  assertProviderOptionKeys(options, [
    "capability",
    "evaluationPlanSnapshot",
    "clock",
  ]);
  if (options.capability !== "DISPOSABLE_PREVIEW_EVALUATION_ONLY") {
    throw unavailable();
  }
  if (!options.clock || typeof options.clock.now !== "function") {
    throw unavailable();
  }
  const evaluationPlan =
    validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(
      options.evaluationPlanSnapshot,
    );
  const responsesUrl = resolveCaresLinkV1CommunicationNoteOpenAiResponsesUrl(
    evaluationPlan.request.endpointProfile,
  );
  if (responsesUrl !== evaluationPlan.request.endpointUrl) {
    throw unavailable();
  }
  if (
    !Boolean(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY) ||
    CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION === undefined
  ) {
    throw unavailable();
  }
  throw unavailable();
}

/**
 * Supplies a non-HTTPS test identifier to an explicitly trusted test callback.
 * The callback is arbitrary code, not a network or credential security boundary;
 * runtime isolation and the absent paid factory are the enforcement boundary.
 */
export function createCaresLinkV1OpenAiCommunicationNoteContractTestProvider(
  options: ContractTestProviderOptions,
): CaresLinkV1NoteProviderPort {
  assertProviderOptionKeys(options, [
    "capability",
    "evaluationPlanSnapshot",
    "fetchImpl",
    "clock",
  ]);
  if (options.capability !== "MOCKED_CONTRACT_TEST_ONLY") throw unavailable();
  if (!options.clock || typeof options.clock.now !== "function") {
    throw unavailable();
  }
  if (typeof options.fetchImpl !== "function") throw unavailable();
  const evaluationPlan =
    validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(
      options.evaluationPlanSnapshot,
    );
  return createInjectedContractTestProvider({
    evaluationPlan,
    fetchImpl: options.fetchImpl,
    clock: options.clock,
  });
}

function createInjectedContractTestProvider(input: Readonly<{
  evaluationPlan: CaresLinkV1CommunicationNotePreviewEvaluationPlan;
  fetchImpl: CaresLinkV1OpenAiCommunicationNoteFetch;
  clock: ProviderClock;
}>): CaresLinkV1NoteProviderPort {
  const { evaluationPlan, fetchImpl, clock } = input;

  const provider: CaresLinkV1NoteProviderPort = Object.freeze({
    async generate(input) {
      let validated: ReturnType<typeof validateProviderInput>;
      try {
        validated = validateProviderInput(input);
      } catch {
        throw policyMismatch();
      }
      if (validated.signal.aborted) throw providerError("CANCELLED");

      const request = buildCaresLinkV1OpenAiCommunicationNoteResponsesRequest({
        policySnapshot: validated.policy,
        evaluationPlanSnapshot: evaluationPlan,
        sourceLocale: validated.sourceLocale,
        cleanedFacts: validated.cleanedFacts,
      });

      let response: FetchResponse;
      try {
        response = await fetchImpl(CONTRACT_TEST_RESPONSES_URL, {
          method: "POST",
          headers: {
            Authorization: CONTRACT_TEST_AUTHORIZATION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: validated.signal,
          redirect: "error",
        });
      } catch {
        throw providerError(
          validated.signal.aborted ? "CANCELLED" : "PROVIDER_TRANSIENT",
        );
      }

      if (!response.ok) {
        throw providerError(
          isTransientHttpStatus(response.status)
            ? "PROVIDER_TRANSIENT"
            : "PROVIDER_PERMANENT",
        );
      }

      let payload: unknown;
      try {
        payload = await readBoundedJson(response);
      } catch {
        throw providerError("PROVIDER_OUTPUT_INVALID");
      }

      const object = requireObject(payload);
      assertCompletedResponse(object, validated.policy);

      let candidate: CaresLinkV1NoteProviderCandidate;
      try {
        const outputText = extractSingleCompletedOutputText(object);
        candidate = validateCaresLinkV1NoteProviderCandidate(
          JSON.parse(outputText),
        );
        assertCaresLinkV1CommunicationNoteOpenAiResponseSchema(candidate);
        assertCaresLinkV1CommunicationNoteNoInferredDecisionLanguage(candidate);
        assertCaresLinkV1CommunicationNoteCriticalFactParity(
          validated.cleanedFacts,
          candidate,
        );
        buildCaresLinkV1CanonicalNoteContent(
          "communication",
          validated.cleanedFacts,
          candidate,
        );
      } catch {
        throw providerError("PROVIDER_OUTPUT_INVALID");
      }

      return {
        candidate,
        evidence: createAttemptEvidence({
          object,
          candidate,
          finishReason: "COMPLETED",
          policy: validated.policy,
          workerPolicyBinding: validated.workerPolicyBinding,
          workerPolicy: validated.workerPolicy,
          clock,
        }),
      };
    },
  });
  contractTestProviders.add(provider);
  return provider;
}

export function requireCaresLinkV1OpenAiCommunicationNoteContractTestProvider(
  value: unknown,
): CaresLinkV1NoteProviderPort {
  if (
    !value ||
    typeof value !== "object" ||
    !contractTestProviders.has(value as object)
  ) {
    throw unavailable();
  }
  return value as CaresLinkV1NoteProviderPort;
}

function validateProviderInput(
  input: Parameters<CaresLinkV1NoteProviderPort["generate"]>[0],
) {
  const policy = validateCommunicationPolicy(input.policySnapshot);
  const workerPolicy = parseCaresLinkV1NoteGenerationWorkerPolicy(
    input.workerPolicy,
  );
  const workerPolicyBinding =
    validateCaresLinkV1NoteProviderWorkerPolicyBinding(
      input.workerPolicyBinding,
      policy,
      workerPolicy,
    );
  if (
    input.noteType !== "communication" ||
    input.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
    input.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION ||
    !isCaresLinkV1Locale(input.sourceLocale) ||
    !(input.signal instanceof AbortSignal)
  ) {
    throw policyMismatch();
  }
  return Object.freeze({
    policy,
    workerPolicy,
    workerPolicyBinding,
    sourceLocale: input.sourceLocale,
    cleanedFacts: validateCaresLinkV1CleanedFacts(
      "communication",
      input.cleanedFacts,
    ) as CaresLinkV1CleanedFactsFor<"communication">,
    signal: input.signal,
  });
}

function validateCommunicationPolicy(value: unknown) {
  const policy = validateCaresLinkV1NoteProviderPolicySnapshot(value);
  assertCaresLinkV1CommunicationNoteProviderPolicy(policy);
  return policy;
}

function validateEvaluationPlanBinding(
  value: unknown,
  policy: CaresLinkV1NoteProviderPolicySnapshot,
) {
  const evaluationPlan =
    validateCaresLinkV1CommunicationNotePreviewEvaluationPlan(value);
  if (
    evaluationPlan.providerPolicyDigest !== policy.policyDigest ||
    evaluationPlan.providerId !== policy.providerId ||
    evaluationPlan.model.id !== policy.modelId ||
    evaluationPlan.model.revision !== policy.modelRevision ||
    evaluationPlan.model.revisionAvailability !==
      policy.modelRevisionAvailability ||
    evaluationPlan.request.serviceTier !==
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE.serviceTier ||
    evaluationPlan.request.requestTemplateVersion !==
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE.version ||
    evaluationPlan.request.requestTemplateDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE
        .requestTemplateDigest ||
    evaluationPlan.acceptance.goldenSetVersion !== policy.goldenSetVersion ||
    evaluationPlan.acceptance.promptTemplateVersion !==
      policy.promptTemplateVersion
  ) {
    throw policyMismatch();
  }
  return evaluationPlan;
}

function assertCompletedResponse(
  object: Record<string, unknown>,
  policy: CaresLinkV1NoteProviderPolicySnapshot,
) {
  if (object.object !== "response" || object.model !== policy.modelId) {
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
  if (object.status === "cancelled" || object.status === "failed") {
    throw providerError("PROVIDER_TRANSIENT");
  }
  if (object.status === "incomplete") {
    const details = requireNullableObject(object.incomplete_details);
    if (
      details?.reason === "max_output_tokens" ||
      details?.reason === "content_filter"
    ) {
      throw providerError("PROVIDER_OUTPUT_INVALID");
    }
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
  if (
    object.status !== "completed" ||
    object.service_tier !==
      CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE.serviceTier ||
    (object.error !== null && object.error !== undefined) ||
    (object.incomplete_details !== null &&
      object.incomplete_details !== undefined)
  ) {
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
  if (isPureRefusal(object)) {
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
}

function createAttemptEvidence(input: Readonly<{
  object: Record<string, unknown>;
  candidate: unknown;
  finishReason: "COMPLETED";
  policy: CaresLinkV1NoteProviderPolicySnapshot;
  workerPolicyBinding: Parameters<
    typeof createCaresLinkV1NoteProviderAttemptEvidence
  >[0]["workerPolicyBinding"];
  workerPolicy: Parameters<
    typeof createCaresLinkV1NoteProviderAttemptEvidence
  >[0]["workerPolicy"];
  clock: ProviderClock;
}>) {
  let providerRequestId: string | undefined;
  if (input.object.id !== undefined) {
    if (
      typeof input.object.id !== "string" ||
      !input.object.id ||
      input.object.id !== input.object.id.trim() ||
      input.object.id.length > 512
    ) {
      throw providerError("PROVIDER_OUTPUT_INVALID");
    }
    providerRequestId = input.object.id;
  }
  try {
    return createCaresLinkV1NoteProviderAttemptEvidence({
      policySnapshot: input.policy,
      workerPolicyBinding: input.workerPolicyBinding,
      workerPolicy: input.workerPolicy,
      candidate: input.candidate,
      finishedAt: input.clock.now(),
      finishReason: input.finishReason,
      ...(providerRequestId ? { providerRequestId } : {}),
      usage: providerUsage(input.object.usage),
      cost: { status: "UNAVAILABLE", source: "UNAVAILABLE" },
    });
  } catch (error) {
    if (error instanceof CaresLinkV1OpenAiCommunicationNoteProviderError) {
      throw error;
    }
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
}

function extractSingleCompletedOutputText(object: Record<string, unknown>) {
  if (!Array.isArray(object.output)) throw providerError("PROVIDER_OUTPUT_INVALID");
  const messages = object.output.filter(
    (item) => requireObject(item).type === "message",
  );
  const unsupported = object.output.filter((item) => {
    const type = requireObject(item).type;
    return type !== "message" && type !== "reasoning";
  });
  if (messages.length !== 1 || unsupported.length !== 0) {
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
  const message = requireObject(messages[0]);
  if (
    message.role !== "assistant" ||
    message.status !== "completed" ||
    !Array.isArray(message.content) ||
    message.content.length !== 1
  ) {
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
  const part = requireObject(message.content[0]);
  if (part.type !== "output_text" || typeof part.text !== "string" || !part.text) {
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
  return part.text;
}

function isPureRefusal(object: Record<string, unknown>) {
  if (!Array.isArray(object.output) || object.output.length !== 1) return false;
  const message = requireObject(object.output[0]);
  if (
    message.type !== "message" ||
    message.role !== "assistant" ||
    message.status !== "completed" ||
    !Array.isArray(message.content) ||
    message.content.length !== 1
  ) {
    return false;
  }
  const part = requireObject(message.content[0]);
  return part.type === "refusal" && typeof part.refusal === "string";
}

function providerUsage(value: unknown) {
  if (!isPlainObject(value)) {
    return { status: "UNAVAILABLE", source: "UNAVAILABLE" } as const;
  }
  const mapping = [
    ["inputTokens", value.input_tokens],
    ["outputTokens", value.output_tokens],
    ["totalTokens", value.total_tokens],
    [
      "cachedInputTokens",
      isPlainObject(value.input_tokens_details)
        ? value.input_tokens_details.cached_tokens
        : undefined,
    ],
    [
      "reasoningTokens",
      isPlainObject(value.output_tokens_details)
        ? value.output_tokens_details.reasoning_tokens
        : undefined,
    ],
  ] as const;
  const counts: Record<string, number> = {};
  for (const [key, count] of mapping) {
    if (Number.isSafeInteger(count) && (count as number) >= 0) {
      counts[key] = count as number;
    } else if (count !== undefined) {
      return { status: "UNAVAILABLE", source: "UNAVAILABLE" } as const;
    }
  }
  if (Object.keys(counts).length === 0) {
    return { status: "UNAVAILABLE", source: "UNAVAILABLE" } as const;
  }
  if (
    counts.totalTokens !== undefined &&
    counts.inputTokens !== undefined &&
    counts.outputTokens !== undefined &&
    counts.totalTokens !== counts.inputTokens + counts.outputTokens
  ) {
    return { status: "UNAVAILABLE", source: "UNAVAILABLE" } as const;
  }
  if (
    (counts.cachedInputTokens !== undefined &&
      (counts.inputTokens === undefined ||
        counts.cachedInputTokens > counts.inputTokens)) ||
    (counts.reasoningTokens !== undefined &&
      (counts.outputTokens === undefined ||
        counts.reasoningTokens > counts.outputTokens))
  ) {
    return { status: "UNAVAILABLE", source: "UNAVAILABLE" } as const;
  }
  return {
    status: "REPORTED",
    source: "PROVIDER",
    ...counts,
  } as const;
}

function isTransientHttpStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function readBoundedJson(response: FetchResponse) {
  const contentType = response.headers.get("content-type");
  if (!contentType || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    throw providerError("PROVIDER_OUTPUT_INVALID");
  }
  if (!response.body) throw providerError("PROVIDER_OUTPUT_INVALID");

  const maximumBytes = 512 * 1024;
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        throw providerError("PROVIDER_OUTPUT_INVALID");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  if (!text) throw providerError("PROVIDER_OUTPUT_INVALID");
  return JSON.parse(text) as unknown;
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) throw providerError("PROVIDER_OUTPUT_INVALID");
  return value;
}

function requireNullableObject(value: unknown) {
  if (value === null || value === undefined) return null;
  return requireObject(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertProviderOptionKeys(value: unknown, expected: readonly string[]) {
  if (!isPlainObject(value)) throw unavailable();
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw unavailable();
  }
}

function providerError(reason: CaresLinkV1NoteProviderExecutionReason) {
  return new CaresLinkV1OpenAiCommunicationNoteProviderError(reason);
}

function policyMismatch() {
  return providerError("POLICY_MISMATCH");
}

function unavailable() {
  return new Error("Communication Note provider configuration is unavailable");
}
