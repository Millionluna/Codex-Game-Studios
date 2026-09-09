import { describe, expect, it, vi } from "vitest";

import type { CommunicationNoteGenerationJob } from "./communication-note-generation-contract";
import {
  COMMUNICATION_NOTE_GENERATION_FORMAL_JOB_RECOVERY_READER,
  COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_READER_READY,
  COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_TEST_CAPABILITY,
  createTestOnlyCommunicationNoteGenerationJobRecoveryHandler,
  createTestOnlyCommunicationNoteGenerationJobRecoveryReader,
  handleCommunicationNoteGenerationJobRecoveryRequest,
  type CommunicationNoteGenerationJobRecoveryRepositoryFactory,
} from "./communication-note-generation-job-recovery.server";
import type {
  CommunicationNoteGenerationPrincipalResolution,
  CommunicationNoteGenerationPrincipalResolver,
} from "./communication-note-generation-principal.server";
import { CaresLinkV1ContractError } from "./v1/shared-contracts";

vi.mock("server-only", () => ({}));

const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PROVIDER_ID = "55555555-5555-4555-8555-555555555555";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_JOB_ID = "44444444-4444-4444-8444-444444444444";
const SERVER_TIME = "2026-09-07T01:00:00.000Z";

const queuedJob: CommunicationNoteGenerationJob = Object.freeze({
  jobId: JOB_ID,
  noteType: "communication",
  serviceCode: "note.communication.generate",
  status: "QUEUED",
  attemptCount: 0,
  createdAt: SERVER_TIME,
  updatedAt: SERVER_TIME,
});

function request(query = "") {
  return new Request(
    `https://example.test/api/ai-documents/communication-note/jobs/${JOB_ID}${query}`,
  );
}

function authenticated(
  userId = PROVIDER_ID,
  sessionId = SESSION_ID,
): CommunicationNoteGenerationPrincipalResolution {
  return {
    ok: true,
    principal: { userId, sessionId, transport: "COOKIE" },
  };
}

function principalFailure(
  reason: "auth_required" | "forbidden_transport" | "session_revoked" | "unavailable",
  status: 401 | 403 | 503,
): CommunicationNoteGenerationPrincipalResolution {
  return { ok: false, reason, status };
}

function testHandler(input: Readonly<{
  resolvePrincipal?: CommunicationNoteGenerationPrincipalResolver;
  createRepository?: CommunicationNoteGenerationJobRecoveryRepositoryFactory;
}> = {}) {
  return createTestOnlyCommunicationNoteGenerationJobRecoveryHandler({
    capability: COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_TEST_CAPABILITY,
    resolvePrincipal:
      input.resolvePrincipal ?? vi.fn().mockResolvedValue(authenticated()),
    createRepository:
      input.createRepository ??
      vi.fn<CommunicationNoteGenerationJobRecoveryRepositoryFactory>(() => ({
        get: vi.fn().mockResolvedValue(queuedJob),
      })),
  });
}

function expectHardened(response: Response) {
  expect(response.headers.get("cache-control")).toBe(
    "private, no-store, max-age=0",
  );
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
}

describe("Communication Note generation job recovery server boundary", () => {
  it("keeps the formal reader absent and returns a fixed 503 before request access", async () => {
    expect(COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_READER_READY).toBe(false);
    expect(
      COMMUNICATION_NOTE_GENERATION_FORMAL_JOB_RECOVERY_READER,
    ).toBeUndefined();
    const opaqueRequest = new Proxy({} as Request, {
      get() {
        throw new Error("request must remain opaque");
      },
    });

    const response = await handleCommunicationNoteGenerationJobRecoveryRequest(
      opaqueRequest,
      "not-a-job-id",
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expectHardened(response);
  });

  it("requires the exact TEST_ONLY factory surface", () => {
    const valid = {
      capability: COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_TEST_CAPABILITY,
      resolvePrincipal: vi.fn(),
      createRepository: vi.fn(),
    };
    expect(() =>
      createTestOnlyCommunicationNoteGenerationJobRecoveryReader({
        ...valid,
        extra: "unsafe",
      } as never),
    ).toThrow(/unavailable/i);
    expect(() =>
      createTestOnlyCommunicationNoteGenerationJobRecoveryReader({
        ...valid,
        capability: "PRODUCTION",
      } as never),
    ).toThrow(/unavailable/i);
  });

  it.each([
    ["auth_required", 401, "AUTH_REQUIRED", 401],
    ["session_revoked", 401, "AUTH_REQUIRED", 401],
    ["forbidden_transport", 403, "FORBIDDEN", 403],
    ["unavailable", 503, "UNAVAILABLE", 503],
  ] as const)(
    "maps the %s principal result before URL or repository access",
    async (reason, principalStatus, resultStatus, responseStatus) => {
      const createRepository = vi.fn();
      const resolvePrincipal = vi
        .fn()
        .mockResolvedValue(principalFailure(reason, principalStatus));
      const handler = testHandler({ resolvePrincipal, createRepository });
      const opaqueRequest = new Proxy({} as Request, {
        get() {
          throw new Error("URL and headers must remain opaque");
        },
      });

      const response = await handler(opaqueRequest, "not-a-job-id");

      expect(resolvePrincipal).toHaveBeenCalledOnce();
      expect(resolvePrincipal.mock.calls[0][0]).toBe(opaqueRequest);
      expect(createRepository).not.toHaveBeenCalled();
      expect(response.status).toBe(responseStatus);
      expect(await response.json()).toEqual({ status: resultStatus });
      expectHardened(response);
    },
  );

  it("uses the principal resolver's Authorization rejection as a stable 403", async () => {
    const createRepository = vi.fn();
    const resolvePrincipal = vi.fn(
      async (incoming: Request): Promise<CommunicationNoteGenerationPrincipalResolution> =>
        incoming.headers.has("authorization")
          ? principalFailure("forbidden_transport", 403)
          : authenticated(),
    );
    const incoming = request();
    incoming.headers.set("authorization", "Bearer private-token");

    const response = await testHandler({
      resolvePrincipal,
      createRepository,
    })(incoming, JOB_ID);

    const body = await response.text();
    expect(response.status).toBe(403);
    expect(JSON.parse(body)).toEqual({ status: "FORBIDDEN" });
    expect(body).not.toContain("private-token");
    expect(createRepository).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid UUID", request(), "not-a-job-id"],
    ["extra query", request("?ownerUserId=private"), JOB_ID],
    ["empty query value", request("?jobId="), JOB_ID],
    ["fragment", request("#private"), JOB_ID],
  ])("returns the same 404 for %s after authentication", async (_name, incoming, jobId) => {
    const resolvePrincipal = vi.fn().mockResolvedValue(authenticated());
    const createRepository = vi.fn();

    const response = await testHandler({
      resolvePrincipal,
      createRepository,
    })(incoming, jobId);

    expect(resolvePrincipal).toHaveBeenCalledOnce();
    expect(createRepository).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "NOT_FOUND" });
    expectHardened(response);
  });

  it("normalizes and binds the authenticated principal and exact job id", async () => {
    const get = vi.fn(async (_input: Readonly<{ jobId: string }>) => {
      void _input;
      return queuedJob;
    });
    const createRepository = vi.fn(
      (
        _input: Parameters<
          CommunicationNoteGenerationJobRecoveryRepositoryFactory
        >[0],
      ) => {
        void _input;
        return { get };
      },
    );
    const incoming = request();
    const handler = testHandler({
      resolvePrincipal: vi
        .fn()
        .mockResolvedValue(
          authenticated(PROVIDER_ID.toUpperCase(), SESSION_ID.toUpperCase()),
        ),
      createRepository,
    });

    const response = await handler(incoming, JOB_ID.toUpperCase());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "AVAILABLE", job: queuedJob });
    expect(createRepository).toHaveBeenCalledOnce();
    const repositoryInput = createRepository.mock.calls[0][0];
    expect(Object.keys(repositoryInput).sort()).toEqual(["principal", "signal"]);
    expect(Object.isFrozen(repositoryInput)).toBe(true);
    expect(repositoryInput.signal).toBe(incoming.signal);
    expect(repositoryInput.principal).toEqual({
      userId: PROVIDER_ID,
      sessionId: SESSION_ID,
      transport: "COOKIE",
    });
    expect(Object.isFrozen(repositoryInput.principal)).toBe(true);
    expect(get).toHaveBeenCalledOnce();
    const readInput = get.mock.calls[0][0];
    expect(readInput).toEqual({ jobId: JOB_ID });
    expect(Object.isFrozen(readInput)).toBe(true);
    expectHardened(response);
  });

  it("returns a canonical job DTO when the owner repository uses uppercase UUID text", async () => {
    const response = await testHandler({
      createRepository: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          ...queuedJob,
          jobId: JOB_ID.toUpperCase(),
        }),
      })),
    })(request(), JOB_ID);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "AVAILABLE",
      job: queuedJob,
    });
  });

  it("keeps an adapter-normalized wrong-owner lookup indistinguishable from an unknown job", async () => {
    async function read(
      storedOwnerUserId: string,
      storedJobId: string | undefined,
    ) {
      const response = await testHandler({
        createRepository: vi.fn(({ principal }) => ({
          get: vi.fn(async ({ jobId }) => {
            if (
              storedJobId !== jobId ||
              storedOwnerUserId !== principal.userId
            ) {
              throw new CaresLinkV1ContractError(
                "NOT_FOUND",
                "The requested generation job was not found",
              );
            }
            return queuedJob;
          }),
        })),
      })(request(), JOB_ID);
      return {
        status: response.status,
        body: await response.json(),
      };
    }

    const wrongOwner = await read(OTHER_PROVIDER_ID, JOB_ID);
    const unknownJob = await read(PROVIDER_ID, undefined);

    expect(wrongOwner).toEqual({ status: 404, body: { status: "NOT_FOUND" } });
    expect(unknownJob).toEqual(wrongOwner);
  });

  it.each([
    [new CaresLinkV1ContractError("NOT_FOUND", "private owner detail"), 404, "NOT_FOUND"],
    [new CaresLinkV1ContractError("AUTH_REQUIRED", "private auth detail"), 401, "AUTH_REQUIRED"],
    [new CaresLinkV1ContractError("SESSION_REVOKED", "private session detail"), 401, "AUTH_REQUIRED"],
    [new CaresLinkV1ContractError("FORBIDDEN", "private role detail"), 503, "UNAVAILABLE"],
    [new Error("private database credentials and care facts"), 503, "UNAVAILABLE"],
  ] as const)(
    "redacts repository failure %s",
    async (error, responseStatus, resultStatus) => {
      const get = vi.fn().mockRejectedValue(error);
      const response = await testHandler({
        createRepository: vi.fn(() => ({ get })),
      })(request(), JOB_ID);
      const body = await response.text();

      expect(response.status).toBe(responseStatus);
      expect(JSON.parse(body)).toEqual({ status: resultStatus });
      expect(body).not.toContain("private");
      expect(body).not.toContain("credentials");
      expect(body).not.toContain("facts");
      expectHardened(response);
    },
  );

  it("hides an owner-visible job for another Note type behind the same 404", async () => {
    const get = vi.fn().mockResolvedValue({
      ...queuedJob,
      noteType: "handover",
      serviceCode: "note.handover.generate",
    });
    const response = await testHandler({
      createRepository: vi.fn(() => ({ get })),
    })(request(), JOB_ID);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "NOT_FOUND" });
  });

  it.each([
    ["mismatched job binding", { ...queuedJob, jobId: OTHER_JOB_ID }],
    ["extra owner identity", { ...queuedJob, ownerUserId: PROVIDER_ID }],
    ["invalid status transition", { ...queuedJob, status: "SUCCEEDED" }],
  ])("turns %s into a redacted 503", async (_name, rawJob) => {
    const response = await testHandler({
      createRepository: vi.fn(() => ({
        get: vi.fn().mockResolvedValue(rawJob),
      })),
    })(request(), JOB_ID);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: "UNAVAILABLE" });
    expect(body).not.toContain(PROVIDER_ID);
  });

  it("rejects a repository carrying write or generic owner capabilities", async () => {
    const get = vi.fn().mockResolvedValue(queuedJob);
    const enqueue = vi.fn();
    const cancel = vi.fn();
    const createRepository = vi.fn(() => ({ get, enqueue, cancel }));

    const response = await testHandler({
      createRepository: createRepository as never,
    })(request(), JOB_ID);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expect(get).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each([
    { ok: true, principal: { userId: PROVIDER_ID, sessionId: SESSION_ID, transport: "COOKIE" }, extra: "unsafe" },
    { ok: true, principal: { userId: "invalid", sessionId: SESSION_ID, transport: "COOKIE" } },
    { ok: false, reason: "session_revoked", status: 503 },
    { ok: false, reason: "unknown", status: 401 },
  ])("fails closed for malformed principal resolution %#", async (resolution) => {
    const createRepository = vi.fn();
    const response = await testHandler({
      resolvePrincipal: vi.fn().mockResolvedValue(resolution),
      createRepository,
    })(request(), JOB_ID);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it("does not invoke a repository for an already aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const incoming = new Request(request(), { signal: controller.signal });
    const createRepository = vi.fn();

    const response = await testHandler({ createRepository })(incoming, JOB_ID);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expect(createRepository).not.toHaveBeenCalled();
  });
});
