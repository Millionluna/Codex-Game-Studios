import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ guard: vi.fn(), open: vi.fn(), execute: vi.fn(), ipc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./communication-note-self-review.fixture", () => ({ assertReviewDatabaseFixture: h.guard }));
vi.mock("./communication-note-task-credential.fixture", () => ({ requestTaskCredential: h.ipc }));
vi.mock("../../src/lib/communication-note-workspace-task-postgres.server", () => ({ createTestOnlyCommunicationNoteTaskUnixReadPort: h.open }));
import { createWorkspaceTaskReadPort } from "./communication-note-workspace-task-connection.fixture";
const principal = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", transport: "COOKIE" as const };
const role = "careslink_v1_job_list_runtime_0123456789abcdef", password = "p".repeat(43), capability = "c".repeat(43);
const root = "/private/tmp/cl-job-browser-abc123";
const context = () => ({ signal: new AbortController().signal });
const parameters = [principal.userId, principal.sessionId, null, null, 20, "1.0.0-shadow.1", "2026-08-09.v1-shadow"];
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY", "OWNER_TASK_LIST");
  vi.stubEnv("CARESLINK_LOCAL_TASK_BROKER_CAPABILITY", capability); h.guard.mockReturnValue(root);
  h.open.mockReturnValue({ projectRef: "abcdefghijklmnopqrst", purpose: "COMMUNICATION_NOTE_JOB_LIST_READ",
    callerRole: "careslink_v1_generation_job_list_caller", execute: h.execute }); h.execute.mockResolvedValue({ rows: [] });
  h.ipc.mockImplementation(async (_root, _capability, operation, body) => operation === "issue"
    ? { leaseId: body.requestId, credential: { role, password, deliveryExpiresAt: new Date(Date.now() + 60000).toISOString() } }
    : { leaseId: body.leaseId, revoked: true });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("owned workspace single-delivery task credential", () => {
  it("opens lazily with issued credentials and does not release data until a matching revoke receipt", async () => {
    const port = createWorkspaceTaskReadPort(principal); expect(h.ipc).not.toHaveBeenCalled();
    expect(Object.keys(port).sort()).toEqual(["callerRole", "execute", "projectRef", "purpose"]);
    expect(JSON.stringify(port)).not.toMatch(/cccccccc|pppppppp/);
    const ctx = context(); await expect(port.execute(parameters, ctx)).resolves.toEqual({ rows: [] });
    expect(h.ipc.mock.calls.map(c => c[2])).toEqual(["issue", "revoke"]);
    const id = h.ipc.mock.calls[0][3].requestId;
    expect(h.ipc).toHaveBeenNthCalledWith(1, root, capability, "issue", { requestId: id, principal, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ" });
    expect(h.ipc).toHaveBeenNthCalledWith(2, root, capability, "revoke", { leaseId: id });
    expect(h.open).toHaveBeenCalledWith({ projectRef: "abcdefghijklmnopqrst", principal, socket: root + "/pg/socket", port: 15437,
      credential: { role, password: "", deliveryExpiresAt: expect.any(String) } });
    expect(h.execute).toHaveBeenCalledWith(parameters, { signal: expect.any(AbortSignal) });
    expect(h.execute.mock.calls[0][1].signal).not.toBe(ctx.signal);
    expect(h.execute.mock.invocationCallOrder[0]).toBeLessThan(h.ipc.mock.invocationCallOrder[1]);
  });
  it.each([
    ["CARESLINK_LOCAL_TASK_ENTRY", undefined], ["CARESLINK_LOCAL_TASK_ENTRY", "FIXED_SINGLE_ADMISSION"],
    ["CARESLINK_LOCAL_TASK_BROKER_CAPABILITY", undefined], ["CARESLINK_LOCAL_TASK_BROKER_CAPABILITY", "short"],
    ["CARESLINK_LOCAL_TASK_BROKER_CAPABILITY", "c".repeat(42) + "\n"],
  ])("fails closed for invalid %s=%s", (name, value) => {
    vi.stubEnv(name!, value); expect(() => createWorkspaceTaskReadPort(principal)).toThrow(); expect(h.ipc).not.toHaveBeenCalled();
  });
  it("rejects concurrent reuse of one port, while separate reads get different IDs", async () => {
    const port = createWorkspaceTaskReadPort(principal);
    const first = port.execute(parameters, context());
    await expect(port.execute(parameters, context())).rejects.toThrow(); await first;
    await createWorkspaceTaskReadPort(principal).execute(parameters, context());
    const ids = h.ipc.mock.calls.filter(c => c[2] === "issue").map(c => c[3].requestId);
    expect(new Set(ids).size).toBe(2);
  });
  it("requires the owned guard both at construction and execution", async () => {
    h.guard.mockImplementationOnce(() => { throw new Error("OWNED_ONLY"); });
    expect(() => createWorkspaceTaskReadPort(principal)).toThrow();
    const port = createWorkspaceTaskReadPort(principal); h.guard.mockImplementationOnce(() => { throw new Error("OWNED_ONLY"); });
    await expect(port.execute(parameters, context())).rejects.toThrow(); expect(h.ipc).not.toHaveBeenCalled();
  });
  it("does not issue when already aborted", async () => {
    await expect(createWorkspaceTaskReadPort(principal).execute(parameters, { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(h.ipc).not.toHaveBeenCalled();
  });
  it("revokes by known ID after an ambiguous issue response", async () => {
    h.ipc.mockRejectedValueOnce(new Error("lost response"));
    await expect(createWorkspaceTaskReadPort(principal).execute(parameters, context())).rejects.toThrow();
    expect(h.ipc.mock.calls.map(c => c[2])).toEqual(["issue", "revoke"]); expect(h.open).not.toHaveBeenCalled();
  });
  it.each(["wrong-id", "false", "extra-field", "lost-response"])("withholds valid read data on %s revocation", async mode => {
    const base = h.ipc.getMockImplementation()!;
    h.ipc.mockImplementation(async (...args) => {
      if (args[2] === "issue") return base(...args);
      if (mode === "lost-response") throw new Error("private diagnostic");
      return { leaseId: mode === "wrong-id" ? "f".repeat(32) : args[3].leaseId, revoked: mode !== "false", ...(mode === "extra-field" ? { password } : {}) };
    });
    await expect(createWorkspaceTaskReadPort(principal).execute(parameters, context())).rejects.toThrow("Task list credential lifecycle unavailable");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"returned":false'));
  });
  it("revokes after source construction failure", async () => {
    h.open.mockImplementation(() => { throw new Error("source denied"); });
    await expect(createWorkspaceTaskReadPort(principal).execute(parameters, context())).rejects.toThrow();
    expect(h.ipc).toHaveBeenCalledTimes(2);
  });
  it("releases SESSION_REVOKED only after revocation and sanitizes logs", async () => {
    h.execute.mockRejectedValue(Object.assign(new Error("SESSION_REVOKED"), { code: "P0001" }));
    await expect(createWorkspaceTaskReadPort(principal).execute(parameters, context())).rejects.toMatchObject({ code: "P0001" });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"revoked":true'));
    expect(vi.mocked(console.log).mock.calls.flat().join(" ")).not.toMatch(/pppp|aaaa|012345|SESSION_REVOKED/);
  });
  it("still revokes if the browser aborts during the physical read", async () => {
    const controller = new AbortController(); h.execute.mockImplementation(async () => { controller.abort(); return { rows: [] }; });
    await expect(createWorkspaceTaskReadPort(principal).execute(parameters, { signal: controller.signal })).rejects.toThrow();
    expect(h.ipc).toHaveBeenCalledTimes(2); expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"aborted":true'));
  });
  it("keeps operator and lifetime database secrets outside the Next copy", () => {
    const runner = readFileSync(new URL("./communication-note-recovery.mjs", import.meta.url), "utf8");
    expect(runner).toContain('emit("src/lib/__task-credential-fixture.ts"');
    expect(runner).not.toMatch(/emit\([^\n]+task-credential\.database/);
    expect(readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8")).toContain("outputFileTracingRoot: __dirname");
    const db = readFileSync(new URL("./communication-note-self-review.database.mjs", import.meta.url), "utf8");
    expect(db).not.toMatch(/CARESLINK_LOCAL_TASK_READ_ROLE|CARESLINK_LOCAL_TASK_READ_PASSWORD/);
    expect(readFileSync(new URL("./communication-note-admission.fixture.ts", import.meta.url), "utf8")).not.toMatch(/JOB_LIST_SQL|job_list_caller/);
    expect(readFileSync(new URL("../../src/lib/communication-note-workspace-runtime.server.ts", import.meta.url), "utf8"))
      .toContain("undefined as CommunicationNoteWorkspaceRuntime");
  });
});
