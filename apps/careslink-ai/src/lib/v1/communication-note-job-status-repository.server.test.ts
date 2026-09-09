import { describe, expect, it, vi } from "vitest";
import {
  createCaresLinkV1CommunicationNoteJobStatusRepository as createRepository,
  CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL as SQL,
} from "./communication-note-job-status-repository.server";
import {
  COMMUNICATION_NOTE_GENERATION_JOB_RECOVERY_TEST_CAPABILITY as capability,
  createTestOnlyCommunicationNoteGenerationJobRecoveryHandler,
} from "../communication-note-generation-job-recovery.server";

vi.mock("server-only", () => ({}));
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const principal = { userId: USER, sessionId: SESSION, transport: "COOKIE" as const };
const queued = { jobId: JOB, noteType: "communication", serviceCode: "note.communication.generate",
  status: "QUEUED", attemptCount: 0, createdAt: "2026-09-07T00:00:00.000Z",
  updatedAt: "2026-09-07T00:00:00.000Z", startedAt: null, finishedAt: null, failureCode: null, result: null };
const rows = (job: unknown = queued) => ({ rows: [{ data: { job } }] });
const unavailable = { code: "PRODUCT_API_DISABLED", message: "Communication Note job status repository is unavailable" };

describe("Communication-only job status repository", () => {
  it("binds a captured Cookie principal and exposes only get", async () => {
    const mutable = { ...principal };
    const query = vi.fn().mockResolvedValue(rows());
    const repository = createRepository({ principal: mutable, query });
    mutable.userId = SESSION;
    expect(Object.keys(repository)).toEqual(["get"]);
    await expect(repository.get({ jobId: JOB.toUpperCase() })).resolves.toEqual({
      jobId: JOB, noteType: "communication", serviceCode: "note.communication.generate",
      status: "QUEUED", attemptCount: 0, createdAt: queued.createdAt, updatedAt: queued.updatedAt,
    });
    expect(query).toHaveBeenCalledWith(SQL, [USER, SESSION, JOB, "1.0.0-shadow.1", "2026-08-09.v1-shadow"]);
  });

  it.each([
    { ...principal, transport: "BEARER" }, { ...principal, role: "provider" },
    { ...principal, userId: "invalid" }, { ...principal, sessionId: null },
  ])("rejects untrusted principal shape before any query", (value) => {
    const query = vi.fn();
    expect(() => createRepository({ principal: value as typeof principal, query })).toThrowError(expect.objectContaining(unavailable));
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { jobId: "invalid" }, { jobId: JOB, ownerUserId: USER }, { jobId: JOB, cancel: true },
  ])("rejects expanded get inputs", async (value) => {
    const query = vi.fn();
    await expect(createRepository({ principal, query }).get(value)).rejects.toMatchObject(unavailable);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { ...queued, jobId: USER }, { ...queued, noteType: "handover" },
    { ...queued, serviceCode: "note.progress.generate" },
    { ...queued, status: "RUNNING" }, { ...queued, ownerUserId: USER },
    { ...queued, result: { content: "private" } }, { ...queued, finishedAt: queued.createdAt },
  ])("rejects wrong binding, expanded or invalid status responses", async (job) => {
    await expect(createRepository({ principal, query: async () => rows(job) }).get({ jobId: JOB }))
      .rejects.toMatchObject(unavailable);
  });

  it("rejects getters without evaluating them", async () => {
    const getter = vi.fn(() => "private");
    const row = Object.defineProperty({}, "data", { enumerable: true, get: getter });
    await expect(createRepository({ principal, query: async () => ({ rows: [row] }) }).get({ jobId: JOB }))
      .rejects.toMatchObject(unavailable);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(["NOT_FOUND", "SESSION_REVOKED", "MIN_CLIENT_VERSION"])("preserves only the fixed %s error", async (message) => {
    await expect(createRepository({ principal, query: async () => {
      throw { code: "P0001", message, detail: "credential-must-not-leak" };
    } }).get({ jobId: JOB })).rejects.toMatchObject({ code: message });
  });

  it.each([
    { code: "42501", message: "private ACL detail" },
    { code: "P0001", message: "POINTS_INSUFFICIENT" },
    { code: "P0001", message: "NOT_FOUND private detail" },
    new Error("postgres://private-password"),
  ])("masks driver details and unrelated business errors", async (error) => {
    await expect(createRepository({ principal, query: async () => { throw error; } }).get({ jobId: JOB }))
      .rejects.toMatchObject(unavailable);
  });

  it("runs the real recovery response boundary over the read repository", async () => {
    const query = vi.fn().mockResolvedValue(rows());
    const handler = createTestOnlyCommunicationNoteGenerationJobRecoveryHandler({
      capability, resolvePrincipal: async () => ({ ok: true, principal }),
      createRepository: ({ principal }) => createRepository({ principal, query }),
    });
    const response = await handler(new Request(`https://local.invalid/api/ai-documents/communication-note/jobs/${JOB}`), JOB);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "AVAILABLE", job: { jobId: JOB } });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
