import { describe, expect, it } from "vitest";
import { COMMUNICATION_NOTE_COMPOSER_FIELDS, createEmptyCommunicationNoteComposerDraft } from "./communication-note-composer";
import { hasCommunicationNoteComposerInput } from "./communication-note-composer-navigation";

describe("composer unsent-input detection", () => {
  it("does not warn on a new form or whitespace-only entries", () => {
    const draft = createEmptyCommunicationNoteComposerDraft();
    expect(hasCommunicationNoteComposerInput(draft)).toBe(false);
    draft.parties_by_role = ["", " \n "]; draft.follow_up = " \n ";
    expect(hasCommunicationNoteComposerInput(draft)).toBe(false);
  });
  it.each(COMMUNICATION_NOTE_COMPOSER_FIELDS)("protects any entered %s, not just valid submissions", field => {
    const draft = createEmptyCommunicationNoteComposerDraft();
    if (field === "parties_by_role") draft[field] = ["", "Synthetic role"];
    else draft[field] = "Synthetic input";
    expect(hasCommunicationNoteComposerInput(draft)).toBe(true);
  });
});
