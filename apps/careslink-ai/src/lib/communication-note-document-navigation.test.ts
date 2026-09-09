import { describe, expect, it, vi } from "vitest";
import { assignCommunicationNoteLocation, replaceCommunicationNoteLocation } from "./communication-note-document-navigation";

describe("Communication Note private navigation", () => {
  it("preserves the previous history entry for an explicitly confirmed departure", () => {
    const location = { assign: vi.fn() };
    assignCommunicationNoteLocation("/plan-and-usage?lang=zh-Hans&communicationLang=zh-Hans", location);
    expect(location.assign).toHaveBeenCalledExactlyOnceWith("/plan-and-usage?lang=zh-Hans&communicationLang=zh-Hans");
  });
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
