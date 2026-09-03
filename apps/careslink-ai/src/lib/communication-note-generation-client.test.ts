import { describe, expect, it, vi } from "vitest";

import { COMMUNICATION_NOTE_GENERATION_API_PATH } from "./communication-note-generation-contract";
import {
  CommunicationNoteGenerationClientResponseError,
  submitCommunicationNoteGeneration,
  type CommunicationNoteGenerationFetcher,
} from "./communication-note-generation-client";
import { CaresLinkV1ContractError } from "./v1/shared-contracts";

const IDEMPOTENCY_KEY = "communication-note-request-0001";
const BODY = '{"sourceLocale":"en","cleanedFacts":{"opaque":true}}';
const CORRELATION_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_TIME = "2026-09-01T04:30:00.000Z";

const queuedJob = {
  jobId: JOB_ID,
  status: "QUEUED",
  noteType: "communication",
  serviceCode: "note.communication.generate",
  attemptCount: 0,
  createdAt: SERVER_TIME,
  updatedAt: SERVER_TIME,
};

const succeededJob = {
  ...queuedJob,
  status: "SUCCEEDED",
  attemptCount: 1,
  startedAt: "2026-09-01T04:30:01.000Z",
  finishedAt: "2026-09-01T04:30:02.000Z",
  updatedAt: "2026-09-01T04:30:02.000Z",
  result: {
    canonicalId: "44444444-4444-4444-8444-444444444444",
    revisionId: "55555555-5555-4555-8555-555555555555",
    contentHash: "a".repeat(64),
    revisionNumber: 1,
    baseRevisionId: null,
    saveState: "SERVER_ACKNOWLEDGED",
  },
};

describe("Communication Note generation browser client", () => {
  it("posts caller-owned replay bytes and key to the fixed same-origin endpoint", async () => {
    const signal = new AbortController().signal;
    const fetcher = responseFetcher(202, {
      created: true,
      job: queuedJob,
    });

    const result = await submitCommunicationNoteGeneration({
      body: BODY,
      idempotencyKey: IDEMPOTENCY_KEY,
      signal,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      COMMUNICATION_NOTE_GENERATION_API_PATH,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": IDEMPOTENCY_KEY,
        },
        body: BODY,
        credentials: "same-origin",
        cache: "no-store",
        signal,
      },
    );
    expect(result).toEqual({
      ok: true,
      status: 202,
      admission: { created: true, job: queuedJob },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.admission)).toBe(true);
    expect(result.ok && Object.isFrozen(result.admission.job)).toBe(true);
  });

  it("accepts a strict 200 owner-safe replay and freezes nested results", async () => {
    const result = await submitWith(
      200,
      { created: false, job: succeededJob },
    );

    expect(result).toEqual({
      ok: true,
      status: 200,
      admission: { created: false, job: succeededJob },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.admission.job.status !== "SUCCEEDED") return;
    expect(Object.isFrozen(result.admission.job.result)).toBe(true);
  });

  it.each([
    [202, { created: false, job: queuedJob }, "202 replay"],
    [200, { created: true, job: queuedJob }, "200 fresh admission"],
    [202, { created: true, job: { ...queuedJob, ownerUserId: "private" } }, "private field"],
    [202, { created: true, job: { ...queuedJob, updatedAt: "2026-09-01T04:30:01.000Z" } }, "non-fresh update"],
    [200, { created: false, job: { ...succeededJob, status: "RUNNING" } }, "invalid state"],
    [200, { created: false, job: { ...succeededJob, result: { ...succeededJob.result, contentHash: "not-a-hash" } } }, "invalid result"],
    [200, { created: false, job: { ...succeededJob, finishedAt: "2026-09-01T04:30:03.000Z" } }, "time outside update"],
  ] as const)(
    "rejects an owner response with %s status: %s",
    async (status, payload, caseName) => {
      await expect(submitWith(status, payload), caseName).rejects.toBeInstanceOf(
        CommunicationNoteGenerationClientResponseError,
      );
    },
  );

  it("accepts only the registered status, exact DTO and fixed message for errors", async () => {
    const result = await submitWith(409, {
      error: {
        code: "POINTS_INSUFFICIENT",
        message: "There are not enough Points for this generation request",
        correlationId: CORRELATION_ID,
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: {
        code: "POINTS_INSUFFICIENT",
        message: "There are not enough Points for this generation request",
        correlationId: CORRELATION_ID,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(!result.ok && Object.isFrozen(result.error)).toBe(true);
  });

  it.each([
    [500, errorBody("GENERATION_FAILED", "Communication Note generation failed"), "wrong status"],
    [502, errorBody("UNKNOWN", "Communication Note generation failed"), "unknown code"],
    [502, errorBody("GENERATION_FAILED", "provider secret"), "untrusted message"],
    [502, { ...errorBody("GENERATION_FAILED", "Communication Note generation failed"), debug: "private" }, "extra envelope field"],
    [502, { error: { ...errorBody("GENERATION_FAILED", "Communication Note generation failed").error, details: "private" } }, "extra error field"],
    [502, errorBody("GENERATION_FAILED", "Communication Note generation failed", "unsafe id"), "unsafe correlation"],
  ] as const)(
    "fails closed on a %s response: %s",
    async (status, payload, caseName) => {
      let caught: unknown;
      try {
        await submitWith(status, payload);
      } catch (error) {
        caught = error;
      }

      expect(caught, caseName).toBeInstanceOf(
        CommunicationNoteGenerationClientResponseError,
      );
      expect((caught as Error).message).toBe(
        "Communication Note generation response is invalid",
      );
      expect(JSON.stringify(caught)).not.toContain("provider secret");
      expect(JSON.stringify(caught)).not.toContain("private");
    },
  );

  it("replaces JSON parsing failures with the fixed response error", async () => {
    const fetcher: CommunicationNoteGenerationFetcher = vi.fn(async () => ({
      status: 502,
      json: vi.fn().mockRejectedValue(new Error("private response body")),
    }));

    await expect(
      submitCommunicationNoteGeneration({
        body: BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        signal: new AbortController().signal,
        fetcher,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "COMMUNICATION_NOTE_GENERATION_RESPONSE_INVALID",
        message: "Communication Note generation response is invalid",
      }),
    );
  });

  it("rejects an unsafe idempotency key before calling fetch", async () => {
    const fetcher = vi.fn();
    let caught: unknown;
    try {
      await submitCommunicationNoteGeneration({
        body: BODY,
        idempotencyKey: "short",
        signal: new AbortController().signal,
        fetcher,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CaresLinkV1ContractError);
    expect((caught as CaresLinkV1ContractError).code).toBe("VALIDATION_ERROR");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves transport and Abort errors without replacing their identity", async () => {
    const transportError = new DOMException("aborted", "AbortError");
    const fetcher = vi.fn().mockRejectedValue(transportError);

    await expect(
      submitCommunicationNoteGeneration({
        body: BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        signal: new AbortController().signal,
        fetcher,
      }),
    ).rejects.toBe(transportError);
  });
});

async function submitWith(status: number, payload: unknown) {
  return submitCommunicationNoteGeneration({
    body: BODY,
    idempotencyKey: IDEMPOTENCY_KEY,
    signal: new AbortController().signal,
    fetcher: responseFetcher(status, payload),
  });
}

function responseFetcher(status: number, payload: unknown) {
  return vi.fn(async () => ({
    status,
    json: async () => payload,
  })) satisfies CommunicationNoteGenerationFetcher;
}

function errorBody(
  code: string,
  message: string,
  correlationId = CORRELATION_ID,
) {
  return { error: { code, message, correlationId } };
}
