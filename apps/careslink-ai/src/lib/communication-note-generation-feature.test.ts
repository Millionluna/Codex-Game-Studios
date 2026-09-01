import { describe, expect, it } from "vitest";

import {
  CARESLINK_COMMUNICATION_NOTE_GENERATION_API_FEATURE_FLAG,
  CARESLINK_COMMUNICATION_NOTE_GENERATION_API_READY,
  isCommunicationNoteGenerationApiConfigured,
  isCommunicationNoteGenerationApiEnabled,
} from "./communication-note-generation-feature";

describe("Communication Note generation API feature boundary", () => {
  it("uses an independent server-only configuration name", () => {
    expect(CARESLINK_COMMUNICATION_NOTE_GENERATION_API_FEATURE_FLAG).toBe(
      "CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED",
    );
    expect(isCommunicationNoteGenerationApiConfigured({})).toBe(false);
    expect(
      isCommunicationNoteGenerationApiConfigured({
        CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED: "TRUE",
      }),
    ).toBe(false);
    expect(
      isCommunicationNoteGenerationApiConfigured({
        CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED: "true",
      }),
    ).toBe(true);
  });

  it("keeps the compile-time runtime latch closed even when configured", () => {
    expect(CARESLINK_COMMUNICATION_NOTE_GENERATION_API_READY).toBe(false);
    expect(
      isCommunicationNoteGenerationApiEnabled({
        CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED: "true",
      }),
    ).toBe(false);
  });
});
