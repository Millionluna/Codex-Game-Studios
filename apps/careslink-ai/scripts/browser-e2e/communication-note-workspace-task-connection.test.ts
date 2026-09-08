import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ guard: vi.fn(), open: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./communication-note-self-review.fixture", () => ({ assertReviewDatabaseFixture: h.guard }));
vi.mock("../../src/lib/communication-note-workspace-task-postgres.server", () => ({ createTestOnlyCommunicationNoteTaskUnixReadPort: h.open }));
import { createWorkspaceTaskReadPort } from "./communication-note-workspace-task-connection.fixture";
const principal = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", transport: "COOKIE" as const };
const role = "careslink_v1_job_list_runtime_0123456789abcdef", password = "p".repeat(43);
const root = "/private/tmp/cl-job-browser-abc123";
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY", "OWNER_TASK_LIST");
  vi.stubEnv("CARESLINK_LOCAL_TASK_READ_ROLE", role); vi.stubEnv("CARESLINK_LOCAL_TASK_READ_PASSWORD", password);
  h.guard.mockReturnValue(root);
  h.open.mockReturnValue({ projectRef: "abcdefghijklmnopqrst", purpose: "COMMUNICATION_NOTE_JOB_LIST_READ",
    callerRole: "careslink_v1_generation_job_list_caller", execute: h.execute });
  h.execute.mockResolvedValue({ rows: [{ data: { tasks: [], nextCursor: null } }] });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("owned workspace dedicated task delivery", () => {
  it("uses the actual source opener contract, never the admission/status connection", async () => {
    const port = createWorkspaceTaskReadPort(principal);
    expect(h.open).toHaveBeenCalledWith({ projectRef: "abcdefghijklmnopqrst", principal, socket: root + "/pg/socket", port: 15437,
      credential: { role, password, deliveryExpiresAt: expect.any(String) } });
    const expiry = Date.parse(h.open.mock.calls[0][0].credential.deliveryExpiresAt);
    expect(expiry - Date.now()).toBeGreaterThan(59000); expect(expiry - Date.now()).toBeLessThanOrEqual(60000);
    expect(Object.keys(port).sort()).toEqual(["callerRole", "execute", "projectRef", "purpose"]);
    expect(JSON.stringify(port)).not.toContain(password);
    const parameters = [principal.userId, principal.sessionId, null, null, 20, "1.0.0-shadow.1", "2026-08-09.v1-shadow"];
    const context = { signal: new AbortController().signal };
    await port.execute(parameters, context); expect(h.execute).toHaveBeenCalledWith(parameters, context);
    expect(h.execute.mock.calls[0][1].signal).toBe(context.signal);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"returned":true'));
  });
  it.each([
    ["CARESLINK_LOCAL_TASK_ENTRY", undefined], ["CARESLINK_LOCAL_TASK_ENTRY", "FIXED_SINGLE_ADMISSION"],
    ["CARESLINK_LOCAL_TASK_READ_ROLE", undefined], ["CARESLINK_LOCAL_TASK_READ_ROLE", "cl_admission_browser_runtime"],
    ["CARESLINK_LOCAL_TASK_READ_ROLE", "postgres"], ["CARESLINK_LOCAL_TASK_READ_ROLE", "careslink_v1_job_status_runtime_0123456789abcdef"],
    ["CARESLINK_LOCAL_TASK_READ_PASSWORD", undefined], ["CARESLINK_LOCAL_TASK_READ_PASSWORD", "short"],
    ["CARESLINK_LOCAL_TASK_READ_PASSWORD", "p".repeat(42) + "\n"],
  ])("fails before constructing a connection for invalid %s=%s", (name, value) => {
    vi.stubEnv(name!, value); expect(() => createWorkspaceTaskReadPort(principal)).toThrow("Local task connection unavailable"); expect(h.open).not.toHaveBeenCalled();
  });
  it("requires the owned path/environment guard at construction and execution", async () => {
    h.guard.mockImplementationOnce(() => { throw new Error("OWNED_ONLY"); });
    expect(() => createWorkspaceTaskReadPort(principal)).toThrow("OWNED_ONLY"); expect(h.open).not.toHaveBeenCalled();
    const port = createWorkspaceTaskReadPort(principal); h.guard.mockImplementationOnce(() => { throw new Error("OWNED_ONLY"); });
    await expect(port.execute([], { signal: new AbortController().signal })).rejects.toThrow("OWNED_ONLY"); expect(h.execute).not.toHaveBeenCalled();
  });
  it("leaves cancellation/cleanup with the source port and only logs safe outcome flags", async () => {
    const controller = new AbortController(); controller.abort();
    h.execute.mockRejectedValue(new Error("private credential diagnostic"));
    await expect(createWorkspaceTaskReadPort(principal).execute([], { signal: controller.signal })).rejects.toThrow();
    expect(console.log).toHaveBeenCalledWith(JSON.stringify({ fixture: "workspace-task-physical-read", returned: false,
      aborted: true, connectionOwner: "DEDICATED_LIST_PORT", modelCalled: false }));
    expect(vi.mocked(console.log).mock.calls.flat().join(" ")).not.toMatch(/private|pppp|aaaa|012345/);
  });
  it("keeps all credential and operator wiring inside the owned copy", () => {
    const runner = readFileSync(new URL("./communication-note-recovery.mjs", import.meta.url), "utf8");
    expect(runner).toContain('emit("src/lib/__workspace-task-connection-fixture.ts"');
    expect(runner).toContain('"src/lib/communication-note-workspace-task-postgres.server.ts"');
    const admission = readFileSync(new URL("./communication-note-admission.fixture.ts", import.meta.url), "utf8");
    expect(admission).not.toMatch(/JOB_LIST_SQL|job_list_caller/);
    const db = readFileSync(new URL("./communication-note-admission.database.mjs", import.meta.url), "utf8");
    expect(db).not.toMatch(/grant[^;]+job_list_caller/);
    expect(readFileSync(new URL("../../src/lib/communication-note-workspace-runtime.server.ts", import.meta.url), "utf8"))
      .toContain("undefined as CommunicationNoteWorkspaceRuntime");
  });
});
