import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  COMMUNICATION_NOTE_GENERATION_API_PATH,
  type CommunicationNoteGenerationAdmission,
  type CommunicationNoteGenerationRequest,
} from "./communication-note-generation-contract";
import type { CommunicationNoteComposerSubmission } from "./communication-note-composer";

describe("Communication Note generation browser contract", () => {
  it("freezes the Web-internal endpoint and composer request shape", () => {
    expect(COMMUNICATION_NOTE_GENERATION_API_PATH).toBe(
      "/api/ai-documents/communication-note/generate",
    );
    expectTypeOf<
      CommunicationNoteGenerationRequest
    >().toEqualTypeOf<CommunicationNoteComposerSubmission>();
  });

  it("keeps its transport DTO importable without server-only runtime modules", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/communication-note-generation-contract.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /server-only|node:|\.server|note-generation-durable|note-generation-job/,
    );
    expectTypeOf<
      CommunicationNoteGenerationAdmission["created"]
    >().toEqualTypeOf<boolean>();
  });
});
