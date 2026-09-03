import { describe, expect, it } from "vitest";

import {
  CARESLINK_COMMUNICATION_NOTE_GENERATION_API_FEATURE_FLAG,
  CARESLINK_COMMUNICATION_NOTE_GENERATION_API_READY,
  CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_FEATURE_FLAG,
  CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_READY,
  isCommunicationNoteGenerationApiConfigured,
  isCommunicationNoteGenerationApiEnabled,
  isCommunicationNoteGenerationUiEnabled,
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

  it("requires a second independent compile-time and runtime UI gate", () => {
    expect(CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_FEATURE_FLAG).toBe(
      "CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_ENABLED",
    );
    expect(CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_READY).toBe(false);
    expect(
      isCommunicationNoteGenerationUiEnabled({
        CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED: "true",
        CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_ENABLED: "true",
      }),
    ).toBe(false);
  });
});
