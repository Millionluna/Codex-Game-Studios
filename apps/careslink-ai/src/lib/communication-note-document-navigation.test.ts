import { describe, expect, it, vi } from "vitest";
import { replaceCommunicationNoteLocation } from "./communication-note-document-navigation";

describe("Communication Note private navigation", () => {
  it("replaces the current history entry when opening a private draft", () => {
    const location = { replace: vi.fn() };
    replaceCommunicationNoteLocation(
      "/ai-documents/communication-note/documents/safe?lang=en",
      location,
    );
    expect(location.replace).toHaveBeenCalledExactlyOnceWith(
      "/ai-documents/communication-note/documents/safe?lang=en",
    );
  });
});
