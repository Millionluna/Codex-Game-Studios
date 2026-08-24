import "server-only";

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("The request body exceeded the configured byte limit");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedRequestText(
  request: Request,
  maxBytes: number,
) {
  if (!request.body) {
    throw new TypeError("The request body is not readable");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      byteLength += chunk.value.byteLength;
      if (byteLength > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the size error even if the stream cannot be cancelled cleanly.
        }
        throw new RequestBodyTooLargeError();
      }

      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}
