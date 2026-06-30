type OpenAiResponsesOutputPart = {
  type?: unknown;
  text?: unknown;
};

type OpenAiResponsesOutputItem = {
  content?: unknown;
};

export type OpenAiResponsesOutputPayload = {
  output_text?: unknown;
  output?: unknown;
};

export function getOpenAiResponseOutputText(
  payload: OpenAiResponsesOutputPayload,
) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return undefined;
  }

  for (const item of payload.output as OpenAiResponsesOutputItem[]) {
    if (!item || typeof item !== "object" || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content as OpenAiResponsesOutputPart[]) {
      if (
        part &&
        typeof part === "object" &&
        part.type === "output_text" &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
    }
  }

  return undefined;
}
