import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CommunicationNoteGenerationJobClientResponseError,
  loadCommunicationNoteGenerationJob,
  type CommunicationNoteGenerationJobFetcher,
} from "./communication-note-generation-job-client";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const UPPER_JOB_ID = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const CREATED_AT = "2026-09-07T01:00:00.000Z";
const queuedJob = {
  jobId: JOB_ID,
  status: "QUEUED",
  noteType: "communication",
  serviceCode: "note.communication.generate",
  attemptCount: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

describe("Communication Note generation job browser client", () => {
  it("performs one credentialed same-origin no-store GET with no request body or idempotency key", async () => {
    const signal = new AbortController().signal;
    const fetcher = responseFetcher(200, {
      status: "AVAILABLE",
      job: queuedJob,
    });

    const result = await loadCommunicationNoteGenerationJob({
      jobId: JOB_ID,
      signal,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `/api/ai-documents/communication-note/jobs/${JOB_ID}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal,
      },
    );
    const init = fetcher.mock.calls[0]?.[1] as unknown as RequestInit;
    expect(init.body).toBeUndefined();
    expect(JSON.stringify(init.headers)).not.toMatch(/idempotency/i);
    expect(result).toEqual({ status: "AVAILABLE", job: queuedJob });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    [401, "AUTH_REQUIRED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [503, "UNAVAILABLE"],
  ] as const)("accepts the exact %i/%s content-free state", async (status, state) => {
    await expect(loadWith(status, { status: state })).resolves.toEqual({
      status: state,
    });
  });

  it("returns a canonical job id after exact binding to the canonical request", async () => {
    const canonicalJobId = UPPER_JOB_ID.toLowerCase();
    const result = await loadCommunicationNoteGenerationJob({
      jobId: UPPER_JOB_ID,
      signal: new AbortController().signal,
      fetcher: responseFetcher(200, {
        status: "AVAILABLE",
        job: { ...queuedJob, jobId: UPPER_JOB_ID },
      }),
    });

    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    expect(result.job.jobId).toBe(canonicalJobId);
  });

  it.each([
    [200, { status: "AVAILABLE", job: { ...queuedJob, jobId: OTHER_JOB_ID } }, "different job"],
    [200, { status: "AVAILABLE", job: { ...queuedJob, privateFacts: "secret" } }, "private field"],
    [200, { status: "AVAILABLE", job: queuedJob, debug: "secret" }, "extra envelope key"],
    [404, { status: "UNAVAILABLE" }, "wrong HTTP/state pairing"],
    [200, { status: "AUTH_REQUIRED" }, "success HTTP with error state"],
    [500, { status: "UNAVAILABLE" }, "unregistered HTTP status"],
    [503, { status: "SESSION_REVOKED" }, "unregistered outer state"],
  ] as const)("rejects %s", async (status, payload, caseName) => {
    await expect(loadWith(status, payload), caseName).rejects.toBeInstanceOf(
      CommunicationNoteGenerationJobClientResponseError,
    );
  });

  it("rejects malformed JSON with a fixed content-free error", async () => {
    const fetcher: CommunicationNoteGenerationJobFetcher = vi.fn(async () => ({
      status: 503,
      json: vi.fn().mockRejectedValue(new Error("private database response")),
    }));

    await expect(
      loadCommunicationNoteGenerationJob({
        jobId: JOB_ID,
        signal: new AbortController().signal,
        fetcher,
      }),
    ).rejects.toEqual(expect.objectContaining({
      code: "COMMUNICATION_NOTE_GENERATION_JOB_RESPONSE_INVALID",
      message: "Communication Note generation job response is invalid",
    }));
  });

  it("rejects an invalid job reference before fetch", async () => {
    const fetcher = vi.fn();
    await expect(
      loadCommunicationNoteGenerationJob({
        jobId: "private facts",
        signal: new AbortController().signal,
        fetcher,
      }),
    ).rejects.toThrow("Communication Note generation job reference is invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves transport and Abort error identity", async () => {
    const transportError = new DOMException("aborted", "AbortError");
    const fetcher = vi.fn().mockRejectedValue(transportError);

    await expect(
      loadCommunicationNoteGenerationJob({
        jobId: JOB_ID,
        signal: new AbortController().signal,
        fetcher,
      }),
    ).rejects.toBe(transportError);
  });

  it("contains no browser persistence or mutation transport API", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/communication-note-generation-job-client.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /localStorage|sessionStorage|indexedDB|sendBeacon|document\.cookie|Idempotency-Key|method:\s*["']POST["']|\bbody\s*:/,
    );
  });
});

async function loadWith(status: number, payload: unknown) {
  return loadCommunicationNoteGenerationJob({
    jobId: JOB_ID,
    signal: new AbortController().signal,
    fetcher: responseFetcher(status, payload),
  });
}

function responseFetcher(status: number, payload: unknown) {
  return vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return {
        status,
        json: async () => payload,
      };
    },
  ) satisfies CommunicationNoteGenerationJobFetcher;
}
