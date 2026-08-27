import { describe, expect, it, vi } from "vitest";

import { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES } from "./communication-note-golden";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE,
  CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST,
  assertCaresLinkV1CommunicationNoteOpenAiResponseSchema,
  createCaresLinkV1CommunicationNoteOpenAiRequestTemplateDigest,
  validateCaresLinkV1CommunicationNoteOpenAiRequestTemplate,
} from "./communication-note-openai-request-template";

vi.mock("server-only", () => ({}));

describe("Communication Note OpenAI request template", () => {
  it("literal-pins and deeply freezes the complete static request template", () => {
    const template = CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE;
    expect(CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST).toBe(
      "5809bb94ebb96586f5ddb0e48782fa9d961e446a1a5694ac0e18d483f024979d",
    );
    const { requestTemplateDigest, ...core } = clone(template);
    expect(
      createCaresLinkV1CommunicationNoteOpenAiRequestTemplateDigest(core),
    ).toBe(requestTemplateDigest);
    expectDeepFrozen(template);
  });

  it("fixes the standard service tier, prompt, schema and omitted request fields", () => {
    const template = CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE;
    expect(template).toMatchObject({
      serviceTier: "default",
      truncation: "disabled",
      tools: [],
      toolChoice: "none",
      parallelToolCalls: false,
      text: {
        format: {
          type: "json_schema",
          name: "careslink_v1_communication_note_candidate",
          strict: true,
        },
      },
      systemMessage: { role: "system" },
      userMessage: {
        role: "user",
        noteType: "communication",
        serialization: "JSON_STRINGIFY",
        fieldOrder: ["noteType", "sourceLocale", "cleanedFacts"],
      },
    });
    expect(template.omittedTopLevelFields).toContain("prompt_cache_key");
    expect(template.omittedTopLevelFields).toContain("safety_identifier");
  });

  it("accepts only the reviewed template and rejects prompt/schema/tier drift", () => {
    expect(
      validateCaresLinkV1CommunicationNoteOpenAiRequestTemplate(
        clone(CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE),
      ),
    ).toBe(CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE);

    const cases = [
      mutate((value) => {
        value.serviceTier = "auto";
      }),
      mutate((value) => {
        value.systemMessage.content += " Changed.";
      }),
      mutate((value) => {
        value.text.format.schema.required.pop();
      }),
      mutate((value) => {
        value.omittedTopLevelFields.pop();
      }),
      mutate((value) => {
        value.requestTemplateDigest = "0".repeat(64);
      }),
    ];
    for (const value of cases) {
      expect(() =>
        validateCaresLinkV1CommunicationNoteOpenAiRequestTemplate(value),
      ).toThrow("Communication Note request template does not match M1f");
    }
  });

  it("enforces the literal strict response schema independently of the shared parser", () => {
    const candidate = clone(
      CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES[0].passingCandidate,
    );
    expect(
      assertCaresLinkV1CommunicationNoteOpenAiResponseSchema(candidate),
    ).toBe(candidate);

    expect(() =>
      assertCaresLinkV1CommunicationNoteOpenAiResponseSchema({
        ...candidate,
        neutralWordingChecks: Array(17).fill("reviewed"),
      }),
    ).toThrow(/literal request schema/);
    expect(() =>
      assertCaresLinkV1CommunicationNoteOpenAiResponseSchema({
        ...candidate,
        reviewVersions: { "zh-Hans": candidate.reviewVersions["zh-Hans"] },
      }),
    ).toThrow(/literal request schema/);
  });
});

type MutableTemplate = {
  serviceTier: string;
  systemMessage: { content: string };
  text: { format: { schema: { required: string[] } } };
  omittedTopLevelFields: string[];
  requestTemplateDigest: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mutate(update: (value: MutableTemplate) => void) {
  const value = clone(
    CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE,
  ) as unknown as MutableTemplate;
  update(value);
  return value;
}

function expectDeepFrozen(value: unknown): void {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}
