import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  COMMUNICATION_NOTE_GENERATION_API_PATH,
  COMMUNICATION_NOTE_GENERATION_JOB_API_PATH,
  COMMUNICATION_NOTE_GENERATION_JOB_PAGE_PATH,
  buildCommunicationNoteGenerationJobApiHref,
  buildCommunicationNoteGenerationJobHref,
  type CommunicationNoteGenerationAdmission,
  type CommunicationNoteGenerationJobReadResult,
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

  it("builds canonical job recovery URLs containing only job identity and locale", () => {
    const upperJobId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";

    expect(COMMUNICATION_NOTE_GENERATION_JOB_API_PATH).toBe(
      "/api/ai-documents/communication-note/jobs",
    );
    expect(COMMUNICATION_NOTE_GENERATION_JOB_PAGE_PATH).toBe(
      "/ai-documents/communication-note/jobs",
    );
    expect(buildCommunicationNoteGenerationJobApiHref({ jobId: upperJobId })).toBe(
      "/api/ai-documents/communication-note/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(
      buildCommunicationNoteGenerationJobHref({
        jobId: upperJobId,
        locale: "zh-Hant",
      }),
    ).toBe(
      "/ai-documents/communication-note/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?lang=zh-Hant",
    );
  });

  it("rejects malformed job recovery identifiers and unsupported locales", () => {
    expect(() =>
      buildCommunicationNoteGenerationJobApiHref({ jobId: "private facts" }),
    ).toThrow("Communication Note generation job reference is invalid");
    expect(() =>
      buildCommunicationNoteGenerationJobHref({
        jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        locale: "zh-TW" as "en",
      }),
    ).toThrow("Communication Note generation job reference is invalid");
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
    expectTypeOf<
      CommunicationNoteGenerationJobReadResult["status"]
    >().toEqualTypeOf<
      "AVAILABLE" | "AUTH_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "UNAVAILABLE"
    >();
  });
});
