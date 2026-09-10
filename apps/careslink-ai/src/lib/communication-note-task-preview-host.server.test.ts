import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { createCommunicationNoteTaskPreviewService } from "./communication-note-task-preview-service.server";
import type { TaskPreviewIssuerBroker } from "./communication-note-task-preview-issuer.server";
vi.mock("server-only", () => ({}));
type Service = ReturnType<typeof createCommunicationNoteTaskPreviewService>;
const REF = "abcdefghijklmnopqrst", CAP = "TASK_PREVIEW_DEDICATED_NODE_PROCESS";
const ERROR = "Task Preview host unavailable";
let hostModule: typeof import("./communication-note-task-preview-host.server"), createService: typeof createCommunicationNoteTaskPreviewService;
let owner: EventEmitter & { platform: string; send?: () => void; connected: boolean; exitCode?: number; exit: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
let main: { isMainThread: boolean };
const hosts: ReturnType<typeof import("./communication-note-task-preview-host.server").ownTaskPreviewServiceProcess>[] = [];
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules(); main = { isMainThread: true };
  owner = Object.assign(new EventEmitter(), { platform: "darwin", connected: true, send: () => {}, exit: vi.fn(),
    disconnect: vi.fn(() => { owner.connected = false; owner.emit("disconnect"); }) });
  vi.doMock("node:process", () => ({ default: owner })); vi.doMock("node:worker_threads", () => main);
  hostModule = await import("./communication-note-task-preview-host.server");
  createService = (await import("./communication-note-task-preview-service.server")).createCommunicationNoteTaskPreviewService;
});
afterEach(async () => {
  const pending = hosts.splice(0).map(h => h.stop()); await vi.advanceTimersByTimeAsync(40001); await Promise.allSettled(pending);
  expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.doUnmock("node:process"); vi.doUnmock("node:worker_threads");
});
function fixture(override?: TaskPreviewIssuerBroker["call"]) {
  const call = vi.fn<TaskPreviewIssuerBroker["call"]>(override ?? (async (op, data) => {
    if (op === "inventory") return { projectRef: REF, epoch: data.epoch, leases: [] };
    return { projectRef: REF, epoch: data.epoch, ready: op === "ready" };
  }));
  const service = createService({ projectRef: REF, broker: { call } });
  const own = () => { const host = hostModule.ownTaskPreviewServiceProcess(service, CAP); hosts.push(host); return host; };
  return { call, service, own };
}
it("imports inertly and composes only explicitly supplied task control custody", async () => {
  const createCustody = vi.fn(), ca = Buffer.from("SYNTHETIC_CA_NOT_HOSTED_PROVENANCE");
  const s = hostModule.createTaskPreviewCustodiedService({ projectRef: REF, branchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ca, caSha256: createHash("sha256").update(ca).digest("hex"), createCustody });
  expect(hostModule.COMMUNICATION_NOTE_TASK_PREVIEW_HOST_READY).toBe(false); expect(s.health().state).toBe("NEW");
  expect(createCustody).not.toHaveBeenCalled(); expect(owner.eventNames()).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  expect(await s.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true });
});
it("rejects unscoped control configuration before credentials or process ownership", () => {
  const createCustody = vi.fn();
  expect(() => hostModule.createTaskPreviewCustodiedService({ projectRef: "adocsnwnslxhxcjgbyee", createCustody } as never)).toThrow();
  expect(createCustody).not.toHaveBeenCalled(); expect(owner.eventNames()).toEqual([]);
});
it("does not declare readiness until the real issuer has recovered", async () => {
  const f = fixture(), h = f.own(); expect(h.health().state).toBe("STARTING"); await h.ready;
  expect(f.call.mock.calls.map(c => c[0])).toEqual(["start", "inventory", "ready"]);
  expect(h.health().state).toBe("READY"); expect(owner.exit).not.toHaveBeenCalled();
  expect(await h.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true }); await h.finished;
  expect(owner.eventNames()).toEqual([]); expect(owner.exitCode).toBe(0); expect(owner.disconnect).toHaveBeenCalledOnce();
});
it.each(["SIGTERM", "SIGINT", "disconnect"])("handles %s with joined independent drain and content-free exit", async signal => {
  const f = fixture(), h = f.own(); await h.ready; f.call.mockClear();
  if (signal === "disconnect") owner.connected = false;
  owner.emit(signal); expect(h.health().state).toBe("STOPPING");
  expect(await h.finished).toEqual({ state: "STOPPED", cleanupConfirmed: true });
  expect(f.call.mock.calls.map(c => c[0])).toEqual(["inventory"]);
  expect(owner.exit).not.toHaveBeenCalled(); expect(owner.exitCode).toBe(0); expect(owner.eventNames()).toEqual([]);
});
it("does not reset the stop deadline for repeated termination signals", async () => {
  const f = fixture(), h = f.own(); await h.ready; owner.emit("SIGTERM"); owner.emit("SIGINT");
  await h.finished; expect(f.call.mock.calls.filter(c => c[0] === "inventory")).toHaveLength(2);
  expect(owner.disconnect).toHaveBeenCalledOnce();
});
it("does not claim success for an unknown startup outcome or expose its error", async () => {
  const f = fixture(async () => { throw new Error("PRIVATE_PROVIDER_ERROR"); }), h = f.own();
  await expect(h.ready).rejects.toThrow(ERROR); expect(await h.finished).toEqual({ state: "FAILED", cleanupConfirmed: false });
  expect(owner.exitCode).toBe(1); expect(owner.exit).not.toHaveBeenCalled(); expect(owner.eventNames()).toEqual([]);
});
it("closes pending startup on termination without ever reporting ready", async () => {
  const f = fixture(async () => new Promise(() => {})), h = f.own(); owner.emit("SIGTERM");
  await expect(h.ready).rejects.toThrow(ERROR); expect(await h.finished).toEqual({ state: "FAILED", cleanupConfirmed: false });
  expect(owner.exitCode).toBe(1); expect(owner.eventNames()).toEqual([]); expect(owner.exit).not.toHaveBeenCalled();
});
it("keeps a prior process failure code when service cleanup succeeds", async () => {
  owner.exitCode = 7; const h = fixture().own(); await h.ready; await h.stop(); await h.finished; expect(owner.exitCode).toBe(7);
});
it("requires a fresh process after a clean terminal lifecycle", async () => {
  const a = fixture(), h = a.own(); await h.ready; await h.stop(); await h.finished;
  const b = fixture(); expect(() => b.own()).toThrow(ERROR); expect(b.call).not.toHaveBeenCalled();
});
it.each(["worker", "windows", "disconnected"])("rejects invalid process ownership: %s", fault => {
  if (fault === "worker") main.isMainThread = false;
  if (fault === "windows") owner.platform = "win32";
  if (fault === "disconnected") owner.connected = false;
  const f = fixture(); expect(() => f.own()).toThrow(ERROR); expect(f.call).not.toHaveBeenCalled(); expect(owner.eventNames()).toEqual([]);
});
it("requires an explicit capability and an unstarted service", async () => {
  const f = fixture(); expect(() => hostModule.ownTaskPreviewServiceProcess(f.service, "wrong" as never)).toThrow(ERROR);
  await f.service.stop(); expect(() => f.own()).toThrow(ERROR); expect(f.call).not.toHaveBeenCalled();
});
it("does not install an IPC hook when no inherited channel exists", async () => {
  delete owner.send; const h = fixture().own(); await h.ready; expect(owner.listenerCount("disconnect")).toBe(0);
  await h.stop(); await h.finished; expect(owner.disconnect).not.toHaveBeenCalled();
});
it("bounds a broken service startup with a failing forced exit, never a clean acknowledgement", async () => {
  // Host guard test only; the actual issuer's own startup is already bounded.
  const never = new Promise<never>(() => {}), s = { health: () => ({ state: "NEW" }), start: () => never,
    stop: () => never, finished: never, custody: {} } as unknown as Service;
  hostModule.ownTaskPreviewServiceProcess(s, CAP); await vi.advanceTimersByTimeAsync(40000);
  expect(owner.exit).toHaveBeenCalledExactlyOnceWith(1); expect(owner.exitCode).toBeUndefined(); owner.removeAllListeners();
});
it("retains independent client/import boundaries without enabling formal workspace IO", () => {
  const name = "communication-note-task-preview-host", walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual([]);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.env|fetch\s*\(|\.listen\s*\(|console\.|createJobStatus|createGcp/);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain(ERROR);
});
