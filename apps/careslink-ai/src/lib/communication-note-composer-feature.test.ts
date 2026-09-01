import { describe, expect, it } from "vitest";
import {
  CARESLINK_COMMUNICATION_NOTE_COMPOSER_FEATURE_FLAG,
  isCommunicationNoteComposerEnabled,
} from "./communication-note-composer-feature";

describe("Communication Note composer feature flag", () => {
  it("is fail-closed and accepts only the exact enabled value", () => {
    expect(CARESLINK_COMMUNICATION_NOTE_COMPOSER_FEATURE_FLAG).toBe(
      "CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED",
    );
    expect(isCommunicationNoteComposerEnabled({})).toBe(false);
    expect(
      isCommunicationNoteComposerEnabled({
        CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED: "TRUE",
      }),
    ).toBe(false);
    expect(
      isCommunicationNoteComposerEnabled({
        CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED: "true",
      }),
    ).toBe(true);
  });
});
