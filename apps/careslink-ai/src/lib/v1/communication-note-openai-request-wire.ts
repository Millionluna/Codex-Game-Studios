import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_WIRE_VERSION =
  "wire.communication.openai.responses.2026-08-27.m1g-a.v1" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_WIRE_SERIALIZATION =
  "JSON_STRINGIFY_UTF8_NO_BOM" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_WIRE_DIGEST_ALGORITHM =
  "SHA-256" as const;

export type CaresLinkV1CommunicationNoteOpenAiRenderedRequestWire<
  Request = unknown,
> = Readonly<{
  request: Request;
  body: string;
  bodyUtf8ByteLength: number;
  bodySha256: string;
  semanticCanonicalSha256: string;
}>;

/**
 * Serializes one JSON request exactly once. Callers must pass `body` unchanged
 * to their transport; the canonical digest remains a separate semantic check.
 */
export function renderCaresLinkV1CommunicationNoteOpenAiRequestWire<
  const Request,
>(
  request: Request,
): CaresLinkV1CommunicationNoteOpenAiRenderedRequestWire<Request> {
  try {
    const body = JSON.stringify(request);
    if (body === undefined) throw new TypeError("request is not JSON");
    const semanticCanonicalJson = stringifyCaresLinkV1CanonicalJson(
      JSON.parse(body),
    );
    return Object.freeze({
      request,
      body,
      bodyUtf8ByteLength: Buffer.byteLength(body, "utf8"),
      bodySha256: sha256(body),
      semanticCanonicalSha256: sha256(semanticCanonicalJson),
    });
  } catch {
    throw invalid("Communication Note request wire body is invalid");
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}
