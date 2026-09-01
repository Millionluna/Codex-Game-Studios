import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMMUNICATION_NOTE_GENERATION_API_PATH,
  type CommunicationNoteGenerationAdmission,
  type CommunicationNoteGenerationFreshJob,
  type CommunicationNoteGenerationJob,
} from "./communication-note-generation-contract";
import {
  COMMUNICATION_NOTE_GENERATION_API_MAX_REQUEST_BYTES,
  COMMUNICATION_NOTE_GENERATION_SUBMITTER,
  createTestOnlyCommunicationNoteGenerationHandler,
  handleCommunicationNoteGenerationRequest,
  type CommunicationNoteGenerationSubmitter,
} from "./communication-note-generation-route.server";
import { stringifyCaresLinkV1CanonicalJson } from "./v1/canonical-json";
import { CaresLinkV1ContractError } from "./v1/shared-contracts";

vi.mock("server-only", () => ({}));

const CORRELATION_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_TIME = "2026-09-01T04:30:00.000Z";

const cleanedFacts = {
  occurred_at: "2026-09-01T14:30:00+10:00",
  contact_channel: "phone",
  parties_by_role: ["support worker", "family representative"],
  observable_facts: "The family representative requested a progress update.",
  action_taken: "The support worker provided the agreed factual update.",
  stated_outcome: "The family representative acknowledged the update.",
  follow_up: "The support worker will provide the next scheduled update.",
};

const validBody = {
  sourceLocale: "en",
  cleanedFacts,
  privacyReview: {
    reviewedNoIdentifiers: true,
    processingAuthorityConfirmed: true,
  },
};

const queuedJob: CommunicationNoteGenerationFreshJob = {
  jobId: JOB_ID,
  status: "QUEUED",
  noteType: "communication",
  serviceCode: "note.communication.generate",
  attemptCount: 0,
  createdAt: SERVER_TIME,
  updatedAt: SERVER_TIME,
};

const queuedAdmission: CommunicationNoteGenerationAdmission = {
  created: true,
  job: queuedJob,
};

const succeededJob: CommunicationNoteGenerationJob = {
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

describe("Communication Note generation server route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the formal runtime absent and fails before reading any request state", async () => {
    expect(COMMUNICATION_NOTE_GENERATION_API_MAX_REQUEST_BYTES).toBe(96 * 1024);
    vi.stubEnv("CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED", "true");
    expect(COMMUNICATION_NOTE_GENERATION_SUBMITTER).toBeUndefined();
    const request = new Proxy({} as Request, {
      get() {
        throw new Error("request must remain opaque");
      },
    });

    const response = await handleCommunicationNoteGenerationRequest(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PRODUCT_API_DISABLED" },
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("checks the runtime gate before auth, body and submission", async () => {
    const resolveAccount = vi.fn();
    const submit = vi.fn();
    const handler = testHandler({
      runtimeEnabled: false,
      resolveAccount,
      submit,
    });
    const request = new Proxy({} as Request, {
      get() {
        throw new Error("request must remain opaque");
      },
    });

    const response = await handler(request);

    expect(response.status).toBe(503);
    expect(resolveAccount).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires a submission port before auth or body access", async () => {
    const resolveAccount = vi.fn();
    const handler = createTestOnlyCommunicationNoteGenerationHandler({
      capability: "TEST_ONLY_M1X_COMMUNICATION_NOTE_GENERATION_ROUTE",
      runtimeEnabled: true,
      resolveAccount,
      createCorrelationId: () => CORRELATION_ID,
    });
    const request = new Proxy({} as Request, {
      get() {
        throw new Error("request must remain opaque");
      },
    });

    const response = await handler(request);

    expect(response.status).toBe(503);
    expect(resolveAccount).not.toHaveBeenCalled();
  });

  it("authenticates and enforces the provider role before reading the request", async () => {
    const submit = vi.fn();
    const signedOut = testHandler({
      resolveAccount: vi.fn().mockResolvedValue(undefined),
      submit,
    });
    const admin = testHandler({
      resolveAccount: vi.fn().mockResolvedValue({
        id: PROVIDER_ID,
        role: "admin",
      }),
      submit,
    });
    const request = new Proxy({} as Request, {
      get() {
        throw new Error("request must remain opaque");
      },
    });

    const signedOutResponse = await signedOut(request);
    const adminResponse = await admin(request);

    expect(signedOutResponse.status).toBe(401);
    expect(await signedOutResponse.json()).toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });
    expect(adminResponse.status).toBe(403);
    expect(await adminResponse.json()).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("fails closed when authenticated account identity is malformed", async () => {
    const submit = vi.fn();
    const handler = testHandler({
      resolveAccount: vi.fn().mockResolvedValue({
        id: "demo-provider",
        role: "provider",
      }),
      submit,
    });

    const response = await handler(validRequest());

    expect(response.status).toBe(503);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "non-JSON media type",
      request: () =>
        validRequest(validBody, { "content-type": "text/plain" }),
      status: 400,
      code: "VALIDATION_ERROR",
    },
    {
      name: "missing same-origin header",
      request: () => validRequest(validBody, { origin: "" }),
      status: 403,
      code: "FORBIDDEN",
    },
    {
      name: "cross-origin request",
      request: () =>
        validRequest(validBody, { origin: "https://attacker.example" }),
      status: 403,
      code: "FORBIDDEN",
    },
    {
      name: "insecure same-origin transport",
      request: () =>
        validRequest(
          validBody,
          { origin: "http://careslink.example.test" },
          undefined,
          `http://careslink.example.test${COMMUNICATION_NOTE_GENERATION_API_PATH}`,
        ),
      status: 403,
      code: "FORBIDDEN",
    },
    {
      name: "cross-site fetch metadata",
      request: () =>
        validRequest(validBody, { "sec-fetch-site": "cross-site" }),
      status: 403,
      code: "FORBIDDEN",
    },
    {
      name: "Bearer credential ambiguity",
      request: () => validRequest(validBody, { authorization: "Bearer token" }),
      status: 403,
      code: "FORBIDDEN",
    },
    {
      name: "missing idempotency key",
      request: () => validRequest(validBody, { "idempotency-key": "" }),
      status: 400,
      code: "VALIDATION_ERROR",
    },
  ])("rejects $name before submission", async ({ request, status, code }) => {
    const submit = vi.fn();
    const response = await testHandler({ submit })(request());

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON, unknown keys and client-owned identity fields", async () => {
    const submit = vi.fn();
    const handler = testHandler({ submit });
    const invalidJson = validRequest(undefined, {}, "{");
    const unknownKey = validRequest({ ...validBody, noteType: "communication" });
    const clientIdentity = validRequest({
      ...validBody,
      privacyReview: {
        ...validBody.privacyReview,
        accessToken: "do-not-accept",
      },
    });
    const cleanedFactsJson = JSON.stringify(cleanedFacts);
    const privacyReviewJson = JSON.stringify(validBody.privacyReview);
    const duplicatePrivacyReview = validRequest(
      undefined,
      {},
      `{"sourceLocale":"en","cleanedFacts":${cleanedFactsJson},"privacyReview":${privacyReviewJson},"privacyReview":${privacyReviewJson}}`,
    );
    const duplicateCleanedFacts = validRequest(
      undefined,
      {},
      `{"sourceLocale":"en","cleanedFacts":${cleanedFactsJson},"cleanedFacts":${cleanedFactsJson},"privacyReview":${privacyReviewJson}}`,
    );
    const nestedDuplicateConfirmation = validRequest(
      undefined,
      {},
      `{"sourceLocale":"en","cleanedFacts":${cleanedFactsJson},"privacyReview":{"reviewedNoIdentifiers":true,"reviewedNoIdentifiers":true,"processingAuthorityConfirmed":true}}`,
    );
    const escapedEquivalentDuplicate = validRequest(
      undefined,
      {},
      `{"sourceLocale":"en","cleanedFacts":${cleanedFactsJson},"privacyReview":${privacyReviewJson},"privacyRev\\u0069ew":${privacyReviewJson}}`,
    );

    for (const request of [
      invalidJson,
      unknownKey,
      clientIdentity,
      duplicatePrivacyReview,
      duplicateCleanedFacts,
      nestedDuplicateConfirmation,
      escapedEquivalentDuplicate,
    ]) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels an oversized streamed body without trusting Content-Length", async () => {
    const submit = vi.fn();
    const onCancel = vi.fn();
    const chunk = new Uint8Array(24 * 1024).fill(0x20);
    const response = await testHandler({ submit })(
      streamedRequest(Array.from({ length: 5 }, () => chunk), onCancel),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires both literal privacy confirmations", async () => {
    const submit = vi.fn();
    const response = await testHandler({ submit })(
      validRequest({
        ...validBody,
        privacyReview: {
          reviewedNoIdentifiers: true,
          processingAuthorityConfirmed: false,
        },
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "PRIVACY_REVIEW_REQUIRED" },
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("revalidates the exact Communication Note schema on the server", async () => {
    const submit = vi.fn();
    const response = await testHandler({ submit })(
      validRequest({
        ...validBody,
        cleanedFacts: { ...cleanedFacts, parties_by_role: [] },
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "MINIMUM_FACTS_REQUIRED" },
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["browser scanner", "Name: Jane Smith attended the call."],
    ["server scanner", "The public reference is https://example.test/case/1."],
  ])("blocks a client privacy-preflight bypass with the %s", async (_name, value) => {
    const submit = vi.fn();
    const response = await testHandler({ submit })(
      validRequest({
        ...validBody,
        cleanedFacts: { ...cleanedFacts, observable_facts: value },
      }),
    );

    expect(response.status).toBe(422);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("PRIVACY_REVIEW_REQUIRED");
    expect(serialized).not.toContain(value);
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits server-owned identity and canonical facts, then returns a new owner-safe admission", async () => {
    const submit = vi.fn().mockResolvedValue(queuedAdmission);
    const response = await testHandler({ submit })(validRequest());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(response.headers.get("x-correlation-id")).toBe(CORRELATION_ID);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toEqual(queuedAdmission);
    expect(submit).toHaveBeenCalledOnce();
    const command = submit.mock.calls[0][0];
    expect(command).toMatchObject({
      providerUserId: PROVIDER_ID,
      noteType: "communication",
      serviceCode: "note.communication.generate",
      sourceLocale: "en",
      privacyReview: {
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: true,
      },
      idempotencyKey: "communication-note-request-0001",
      correlationId: CORRELATION_ID,
    });
    expect(command.cleanedFacts).toEqual(cleanedFacts);
    expect(command.cleanedFacts).not.toBe(cleanedFacts);
    expect(command.cleanedFactsHash).toBe(
      createHash("sha256")
        .update(stringifyCaresLinkV1CanonicalJson(cleanedFacts))
        .digest("hex"),
    );
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(cleanedFacts.observable_facts);
    expect(serialized).not.toContain(command.cleanedFactsHash);
    expect(serialized).not.toContain(PROVIDER_ID);
  });

  it("returns the current owner-safe durable job for an exact idempotent replay", async () => {
    const replayAdmission: CommunicationNoteGenerationAdmission = {
      created: false,
      job: succeededJob,
    };
    const submit = vi.fn().mockResolvedValue(replayAdmission);

    const response = await testHandler({ submit })(validRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(replayAdmission);
  });

  it("rejects a zero-attempt failure the durable owner adapter cannot emit", async () => {
    const failedJob = {
      ...queuedJob,
      status: "FAILED",
      finishedAt: "2026-09-01T04:30:01.000Z",
      updatedAt: "2026-09-01T04:30:01.000Z",
      failureCode: "PRIVACY_REVIEW_STALE",
    };
    const admission = {
      created: false,
      job: failedJob,
    };

    const response = await testHandler({
      submit: vi.fn().mockResolvedValue(admission),
    })(validRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PRODUCT_API_DISABLED" },
    });
  });

  it.each([
    {
      name: "a newly created non-queued job",
      admission: { created: true, job: succeededJob },
    },
    {
      name: "a newly created requeued job",
      admission: {
        created: true,
        job: {
          ...queuedJob,
          attemptCount: 1,
          startedAt: "2026-09-01T04:30:01.000Z",
          updatedAt: "2026-09-01T04:30:02.000Z",
        },
      },
    },
    {
      name: "a newly created queue with a later update",
      admission: {
        created: true,
        job: { ...queuedJob, updatedAt: "2026-09-01T04:30:01.000Z" },
      },
    },
    {
      name: "updated time before creation",
      admission: {
        created: false,
        job: { ...queuedJob, updatedAt: "2026-09-01T04:29:59.000Z" },
      },
    },
    {
      name: "success without a result",
      admission: {
        created: false,
        job: { ...succeededJob, result: undefined },
      },
    },
    {
      name: "start time before creation",
      admission: {
        created: false,
        job: {
          ...succeededJob,
          startedAt: "2026-09-01T04:29:59.000Z",
        },
      },
    },
    {
      name: "finish time before start",
      admission: {
        created: false,
        job: {
          ...succeededJob,
          finishedAt: "2026-09-01T04:30:00.500Z",
        },
      },
    },
    {
      name: "finish time after update",
      admission: {
        created: false,
        job: {
          ...succeededJob,
          finishedAt: "2026-09-01T04:30:03.000Z",
        },
      },
    },
    {
      name: "success carrying a failure",
      admission: {
        created: false,
        job: { ...succeededJob, failureCode: "GENERATION_FAILED" },
      },
    },
    {
      name: "queued work carrying a result",
      admission: {
        created: false,
        job: { ...queuedJob, result: succeededJob.result },
      },
    },
  ])("fails closed on $name", async ({ admission }) => {
    const response = await testHandler({
      submit: vi.fn().mockResolvedValue(admission),
    })(validRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PRODUCT_API_DISABLED" },
    });
  });

  it("fails closed without reflecting submitter errors or unsafe result fields", async () => {
    const secret = "provider-secret-response-body";
    const throwingSubmitter = vi.fn().mockRejectedValue(new Error(secret));
    const unsafeSubmitter = vi.fn().mockResolvedValue({
      created: true,
      job: {
        ...queuedJob,
        cleanedFacts,
      },
    });

    for (const submit of [throwingSubmitter, unsafeSubmitter]) {
      const response = await testHandler({ submit })(validRequest());
      const serialized = JSON.stringify(await response.json());
      expect(response.status).toBe(503);
      expect(serialized).toContain("PRODUCT_API_DISABLED");
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(cleanedFacts.observable_facts);
    }
  });

  it.each([
    ["SESSION_REVOKED", 401],
    ["IDEMPOTENCY_CONFLICT", 409],
    ["POINTS_INSUFFICIENT", 409],
    ["RATE_LIMITED", 429],
    ["GENERATION_FAILED", 502],
    ["PRODUCT_API_DISABLED", 503],
  ] as const)("maps %s to a fixed safe HTTP response", async (code, status) => {
    const secret = `secret-${code}`;
    const submit = vi
      .fn()
      .mockRejectedValue(new CaresLinkV1ContractError(code, secret));

    const response = await testHandler({ submit })(validRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(status);
    expect(serialized).toContain(code);
    expect(serialized).not.toContain(secret);
  });

  it("fails closed on an unregistered runtime error code", async () => {
    const error = new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "secret-unregistered-error",
    );
    Object.defineProperty(error, "code", { value: "UNREGISTERED_ERROR" });

    const response = await testHandler({
      submit: vi.fn().mockRejectedValue(error),
    })(validRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toContain("PRODUCT_API_DISABLED");
    expect(serialized).not.toContain("UNREGISTERED_ERROR");
    expect(serialized).not.toContain("secret-unregistered-error");
  });

  it("keeps provider, cloud, Points and durable adapters out of the route module", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/communication-note-generation-route.server.ts"),
      "utf8",
    );
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(
      /openai-communication-note-provider|communication-note-preview-product-runtime|note-generation-owner-repository|getGuidedAiRateLimiter|account-credit-store|@vercel\/oidc|google-auth-library/,
    );
    expect(source).toContain(
      "COMMUNICATION_NOTE_GENERATION_SUBMITTER = undefined",
    );
  });
});

function testHandler({
  runtimeEnabled = true,
  resolveAccount = vi.fn().mockResolvedValue({
    id: PROVIDER_ID,
    role: "provider",
  }),
  submit = vi.fn().mockResolvedValue(queuedAdmission),
}: {
  runtimeEnabled?: boolean;
  resolveAccount?: () => Promise<
    { id: string; role: "provider" | "admin" } | undefined
  >;
  submit?: CommunicationNoteGenerationSubmitter["submit"];
} = {}) {
  const submitter: CommunicationNoteGenerationSubmitter = { submit };
  return createTestOnlyCommunicationNoteGenerationHandler({
    capability: "TEST_ONLY_M1X_COMMUNICATION_NOTE_GENERATION_ROUTE",
    runtimeEnabled,
    submitter,
    resolveAccount,
    createCorrelationId: () => CORRELATION_ID,
  });
}

function validRequest(
  body: unknown = validBody,
  headerOverrides: Record<string, string> = {},
  serializedBody = JSON.stringify(body),
  requestUrl = `https://careslink.example.test${COMMUNICATION_NOTE_GENERATION_API_PATH}`,
) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: "https://careslink.example.test",
    "sec-fetch-site": "same-origin",
    "idempotency-key": "communication-note-request-0001",
  });
  for (const [name, value] of Object.entries(headerOverrides)) {
    if (value) headers.set(name, value);
    else headers.delete(name);
  }
  return new Request(requestUrl, {
    method: "POST",
    headers,
    body: serializedBody,
  });
}

function streamedRequest(chunks: Uint8Array[], onCancel: () => void) {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    type: "bytes",
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) controller.enqueue(chunk.slice());
      else controller.close();
    },
    cancel() {
      onCancel();
    },
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://careslink.example.test",
      "sec-fetch-site": "same-origin",
      "idempotency-key": "communication-note-request-0001",
    },
    body,
    duplex: "half",
  };
  return new Request(
    `https://careslink.example.test${COMMUNICATION_NOTE_GENERATION_API_PATH}`,
    init,
  );
}
