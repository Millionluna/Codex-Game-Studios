import { describe, expect, it } from "vitest";
import { getOpenAiResponseOutputText } from "./openai-responses-output";

describe("OpenAI Responses output parsing", () => {
  it("reads SDK-style output_text when present", () => {
    expect(
      getOpenAiResponseOutputText({
        output_text: "{\"message\":\"ok\"}",
      }),
    ).toBe("{\"message\":\"ok\"}");
  });

  it("reads raw REST output text content when output_text is absent", () => {
    expect(
      getOpenAiResponseOutputText({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "{\"message\":\"ok\"}",
              },
            ],
          },
        ],
      }),
    ).toBe("{\"message\":\"ok\"}");
  });

  it("returns undefined when no text output exists", () => {
    expect(
      getOpenAiResponseOutputText({
        output: [{ type: "message", content: [] }],
      }),
    ).toBeUndefined();
  });
});
