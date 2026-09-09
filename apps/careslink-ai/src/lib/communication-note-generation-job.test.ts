import { describe, expect, it, vi } from "vitest";

import {
  CommunicationNoteGenerationJobParseError,
  parseCommunicationNoteGenerationJob,
} from "./communication-note-generation-job";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const CREATED_AT = "2026-09-07T01:00:00.000Z";
const STARTED_AT = "2026-09-07T01:00:01.000Z";
const FINISHED_AT = "2026-09-07T01:00:02.000Z";
const UPPER_JOB_ID = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const UPPER_CANONICAL_ID = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
const UPPER_REVISION_ID = "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC";
const base = {
  jobId: JOB_ID,
  noteType: "communication",
  serviceCode: "note.communication.generate",
  createdAt: CREATED_AT,
};
const result = {
  canonicalId: "22222222-2222-4222-8222-222222222222",
  revisionId: "33333333-3333-4333-8333-333333333333",
  contentHash: "a".repeat(64),
  revisionNumber: 1,
  baseRevisionId: null,
  saveState: "SERVER_ACKNOWLEDGED",
};

describe("Communication Note generation owner-job parser", () => {
  it.each([
    {
      ...base,
      status: "QUEUED",
      attemptCount: 0,
      updatedAt: CREATED_AT,
    },
    {
      ...base,
      status: "RUNNING",
      attemptCount: 1,
      updatedAt: STARTED_AT,
      startedAt: STARTED_AT,
    },
    {
      ...base,
      status: "SUCCEEDED",
      attemptCount: 1,
      updatedAt: FINISHED_AT,
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      result,
    },
    {
      ...base,
      status: "FAILED",
      attemptCount: 1,
      updatedAt: FINISHED_AT,
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      failureCode: "GENERATION_FAILED",
    },
    {
      ...base,
      status: "CANCELLED",
      attemptCount: 0,
      updatedAt: FINISHED_AT,
      finishedAt: FINISHED_AT,
    },
  ])("accepts and freezes the strict $status state", (wire) => {
    const parsed = parseCommunicationNoteGenerationJob(wire);

    expect(parsed).toEqual(wire);
    expect(Object.isFrozen(parsed)).toBe(true);
    if (parsed.status === "SUCCEEDED") {
      expect(Object.isFrozen(parsed.result)).toBe(true);
    }
  });

  it("canonicalizes every owner-visible UUID before returning it", () => {
    const parsed = parseCommunicationNoteGenerationJob({
      ...base,
      jobId: UPPER_JOB_ID,
      status: "SUCCEEDED",
      attemptCount: 1,
      updatedAt: FINISHED_AT,
      startedAt: STARTED_AT,
      finishedAt: FINISHED_AT,
      result: {
        ...result,
        canonicalId: UPPER_CANONICAL_ID,
        revisionId: UPPER_REVISION_ID,
      },
    });

    expect(parsed.jobId).toBe(UPPER_JOB_ID.toLowerCase());
    expect(parsed.status).toBe("SUCCEEDED");
    if (parsed.status !== "SUCCEEDED") return;
    expect(parsed.result.canonicalId).toBe(UPPER_CANONICAL_ID.toLowerCase());
    expect(parsed.result.revisionId).toBe(UPPER_REVISION_ID.toLowerCase());
  });

  it.each([
    ["private field", { ...base, status: "QUEUED", attemptCount: 0, updatedAt: CREATED_AT, ownerUserId: "private" }],
    ["wrong note type", { ...base, noteType: "handover", status: "QUEUED", attemptCount: 0, updatedAt: CREATED_AT }],
    ["unknown status", { ...base, status: "WAITING", attemptCount: 0, updatedAt: CREATED_AT }],
    ["running without start", { ...base, status: "RUNNING", attemptCount: 1, updatedAt: STARTED_AT }],
    ["result before success", { ...base, status: "QUEUED", attemptCount: 0, updatedAt: CREATED_AT, result }],
    ["bad time order", { ...base, status: "RUNNING", attemptCount: 1, updatedAt: CREATED_AT, startedAt: STARTED_AT }],
    ["bad result hash", { ...base, status: "SUCCEEDED", attemptCount: 1, updatedAt: FINISHED_AT, startedAt: STARTED_AT, finishedAt: FINISHED_AT, result: { ...result, contentHash: "private" } }],
  ])("fails closed for %s", (_name, wire) => {
    expect(() => parseCommunicationNoteGenerationJob(wire)).toThrow(
      CommunicationNoteGenerationJobParseError,
    );
  });

  it("rejects accessors without invoking them", () => {
    const getter = vi.fn(() => JOB_ID);
    const wire = {
      ...base,
      status: "QUEUED",
      attemptCount: 0,
      updatedAt: CREATED_AT,
    };
    Object.defineProperty(wire, "jobId", { enumerable: true, get: getter });

    expect(() => parseCommunicationNoteGenerationJob(wire)).toThrow(
      CommunicationNoteGenerationJobParseError,
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects nested result accessors without invoking them", () => {
    const getter = vi.fn(() => result.canonicalId);
    const trappedResult = { ...result };
    Object.defineProperty(trappedResult, "canonicalId", {
      enumerable: true,
      get: getter,
    });

    expect(() =>
      parseCommunicationNoteGenerationJob({
        ...base,
        status: "SUCCEEDED",
        attemptCount: 1,
        updatedAt: FINISHED_AT,
        startedAt: STARTED_AT,
        finishedAt: FINISHED_AT,
        result: trappedResult,
      }),
    ).toThrow(CommunicationNoteGenerationJobParseError);
    expect(getter).not.toHaveBeenCalled();
  });

  it("never carries raw trap text into its fixed error", () => {
    const wire = new Proxy({}, {
      ownKeys() {
        throw new Error("private facts from proxy");
      },
    });
    let caught: unknown;
    try {
      parseCommunicationNoteGenerationJob(wire);
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(expect.objectContaining({
      code: "COMMUNICATION_NOTE_GENERATION_JOB_INVALID",
      message: "Communication Note generation job is invalid",
    }));
    expect(JSON.stringify(caught)).not.toContain("private facts");
  });
});
