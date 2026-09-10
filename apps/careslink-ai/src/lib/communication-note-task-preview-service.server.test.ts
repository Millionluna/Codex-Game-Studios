import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCommunicationNoteTaskPreviewService as createService, COMMUNICATION_NOTE_TASK_PREVIEW_SERVICE_READY,
  TASK_PREVIEW_SERVICE_SWEEP_MS, TASK_PREVIEW_SERVICE_FRESH_MS } from "./communication-note-task-preview-service.server";
import { createCommunicationNoteTaskPreviewIssuer as createIssuer, createTaskPreviewSqlBroker,
  TASK_PREVIEW_ISSUER_SQL, type TaskPreviewIssuerBroker } from "./communication-note-task-preview-issuer.server";
import type { CommunicationNoteTaskLeaseScope } from "./communication-note-workspace-task-lease.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";

const REF = "abcdefghijklmnopqrst", ERROR = "Task Preview service unavailable", BASE = Date.parse("2026-09-10T05:00:00.000Z");
const context = () => ({ signal: new AbortController().signal });
const scope = (): CommunicationNoteTaskLeaseScope => ({ requestId: randomBytes(16).toString("hex"), projectRef: REF,
  purpose: "COMMUNICATION_NOTE_JOB_LIST_READ", callerRole: "careslink_v1_generation_job_list_caller",
  principal: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
type Lease = { scope: CommunicationNoteTaskLeaseScope; state: string; role: string | null; expiresAt: string | null;
  roleCount: number; sessionCount: number; membershipCount: number };
const services: ReturnType<typeof createService>[] = [];
let skew = 0;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(BASE); skew = 0;
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - BASE + skew);
});
afterEach(async () => {
  const stopped = services.splice(0).map(s => s.stop());
  await vi.advanceTimersByTimeAsync(40000); await Promise.all(stopped);
  expect(vi.getTimerCount()).toBe(0); vi.restoreAllMocks(); vi.useRealTimers();
});
function jumpClock(delta: number) { skew -= delta; vi.setSystemTime(Date.now() + delta); }

// Durable-protocol simulation shared by successive source instances; NOT a real
// SQL engine, process-loss test, TLS connection or installed external watchdog.
function fixture() {
  let epoch: unknown, ready = false;
  const leases = new Map<string, Lease>();
  const call = vi.fn<TaskPreviewIssuerBroker["call"]>(async (op, data) => {
    if (op === "start") { epoch = data.epoch; ready = false; return { projectRef: REF, epoch, ready }; }
    if (["inventory", "ready", "issue"].includes(op) && data.epoch !== epoch) throw new Error("STALE_EPOCH");
    if (op === "inventory") return { projectRef: REF, epoch, leases: [...leases.values()].filter(l => l.state !== "REVOKED")
      .map(({ scope: s, state, expiresAt }) => ({ scope: s, state, expiresAt })) };
    if (op === "ready") {
      if ([...leases.values()].some(l => l.state !== "REVOKED")) throw new Error("RECOVER_FIRST");
      ready = true; return { projectRef: REF, epoch, ready };
    }
    const s = data.scope as CommunicationNoteTaskLeaseScope;
    let lease = leases.get(s.requestId);
    if (lease && JSON.stringify(lease.scope) !== JSON.stringify(s)) throw new Error("WRONG_SCOPE");
    if (op === "issue") {
      if (!ready || lease) throw new Error("NO_ISSUE");
      lease = { scope: s, state: "ISSUED", role: data.role as string, expiresAt: data.expiresAt as string,
        roleCount: 1, sessionCount: 0, membershipCount: 2 }; leases.set(s.requestId, lease);
    }
    if (op === "fence") {
      if (!lease) { lease = { scope: s, state: "REVOKED", role: null, expiresAt: null, roleCount: 0, sessionCount: 0, membershipCount: 0 }; leases.set(s.requestId, lease); }
      else if (lease.state === "ISSUED") lease.state = "FENCED";
    }
    if (op === "finalize") {
      if (!lease || lease.state === "ISSUED") throw new Error("COMMITTED_FENCE_REQUIRED");
      Object.assign(lease, { state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 });
    }
    return { ...lease };
  });
  const service = (broker: TaskPreviewIssuerBroker = { call }) => {
    const result = createService({ projectRef: REF, broker }); services.push(result); return result;
  };
  return { leases, call, service, operations: () => call.mock.calls.map(c => c[0]) };
}

describe("dedicated task Preview service — local lifecycle composition", () => {
  it("is inert, default-off, and rejects all requests before explicit start", async () => {
    const f = fixture(), s = f.service(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_SERVICE_READY).toBe(false);
    expect(s.health()).toEqual({ state: "NEW", reason: undefined, cleanupConfirmed: false });
    await expect(s.custody.issue(scope(), context())).rejects.toThrow(ERROR);
    await expect(s.custody.revoke(scope(), context())).rejects.toThrow(ERROR);
    expect(f.call).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([CARESLINK_PRODUCTION_SUPABASE_REF, "wrong", REF + "\n"])("rejects non-Preview target %s without IO", projectRef => {
    const f = fixture(); expect(() => createService({ projectRef, broker: { call: f.call } })).toThrow(); expect(f.call).not.toHaveBeenCalled();
  });
  it("stops a never-started instance without IO and never restarts that instance", async () => {
    const f = fixture(), s = f.service(); expect(await s.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true });
    expect(await s.finished).toEqual(await s.stop()); await expect(s.start()).rejects.toThrow(ERROR); expect(f.call).not.toHaveBeenCalled();
  });
  it("recovers every prior unfinished lease before admitting new requests", async () => {
    const f = fixture(), previous = createIssuer({ projectRef: REF, broker: { call: f.call } }), old = scope();
    await previous.recover(context()); await previous.custody.issue(old, context()); f.call.mockClear();
    const s = f.service(); await s.start(); expect(s.health().state).toBe("READY");
    expect(f.operations()).toEqual(["start", "inventory", "fence", "finalize", "ready"]);
    expect(f.leases.get(old.requestId)?.state).toBe("REVOKED"); await s.custody.issue(scope(), context());
    await expect(s.start()).rejects.toThrow(ERROR);
  });
  it("withholds admission during startup and rejects overlapping starts", async () => {
    const f = fixture(), gate = deferred<void>();
    const s = f.service({ async call(op, data, ctx) { if (op === "start") await gate.promise; return f.call(op, data, ctx); } });
    const started = s.start(); await expect(s.start()).rejects.toThrow(ERROR);
    await expect(s.custody.issue(scope(), context())).rejects.toThrow(ERROR);
    gate.resolve(); await started; expect(s.health().state).toBe("READY");
  });
  it("sweeps automatically without a page request and physically finalizes expired leases in protocol order", async () => {
    const f = fixture(), s = f.service(), input = scope(); await s.start(); await s.custody.issue(input, context());
    await vi.advanceTimersByTimeAsync(55000); expect(f.leases.get(input.requestId)?.state).toBe("ISSUED");
    await vi.advanceTimersByTimeAsync(5000); expect(f.leases.get(input.requestId)).toMatchObject({ state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 });
    expect(f.operations().slice(-3)).toEqual(["inventory", "fence", "finalize"]); expect(s.health().state).toBe("READY");
  });
  it("sweeps a fenced, unexpired lease on the next tick", async () => {
    const f = fixture(), s = f.service(), input = scope(); await s.start(); await s.custody.issue(input, context());
    f.leases.get(input.requestId)!.state = "FENCED";
    await vi.advanceTimersByTimeAsync(TASK_PREVIEW_SERVICE_SWEEP_MS); expect(f.leases.get(input.requestId)?.state).toBe("REVOKED");
  });
  it("ignores a completed page's later abort and retains independent maintenance ownership", async () => {
    const f = fixture(), s = f.service(), request = new AbortController(), input = scope(); await s.start();
    await s.custody.issue(input, { signal: request.signal }); request.abort();
    await vi.advanceTimersByTimeAsync(60000); expect(f.leases.get(input.requestId)?.state).toBe("REVOKED"); expect(s.health().state).toBe("READY");
  });
  it("serializes sweeps and closes new issue admission during maintenance", async () => {
    const f = fixture(), gate = deferred<void>(); let delay = false;
    const s = f.service({ async call(op, data, ctx) { if (op === "inventory" && delay) await gate.promise; return f.call(op, data, ctx); } });
    await s.start(); delay = true; f.call.mockClear(); await vi.advanceTimersByTimeAsync(5000);
    expect(s.health().state).toBe("SWEEPING"); await expect(s.custody.issue(scope(), context())).rejects.toThrow(ERROR);
    await vi.advanceTimersByTimeAsync(2000); expect(f.call).not.toHaveBeenCalled();
    delay = false; gate.resolve(); await vi.advanceTimersByTimeAsync(1); expect(s.health().state).toBe("READY");
    expect(f.operations()).toEqual(["inventory"]);
  });
  it("still permits explicit revoke during a sweep", async () => {
    const f = fixture(), gate = deferred<void>(); let delay = false;
    const s = f.service({ async call(op, data, ctx) { if (op === "inventory" && delay) await gate.promise; return f.call(op, data, ctx); } });
    await s.start(); const input = scope(); await s.custody.issue(input, context()); delay = true;
    await vi.advanceTimersByTimeAsync(5000); await s.custody.revoke(input, context());
    expect(f.leases.get(input.requestId)?.state).toBe("REVOKED"); delay = false; gate.resolve(); await vi.advanceTimersByTimeAsync(1);
  });
  it("joins requests then drains even unexpired leases on stop, without another takeover or ready call", async () => {
    const f = fixture(), s = f.service(), input = scope(); await s.start(); await s.custody.issue(input, context()); f.call.mockClear();
    const stopped = s.stop(); await expect(s.custody.issue(scope(), context())).rejects.toThrow(ERROR);
    expect(await stopped).toEqual({ state: "STOPPED", cleanupConfirmed: true });
    expect(f.operations()).toEqual(["inventory", "fence", "finalize"]); expect(await s.stop()).toEqual(await s.finished);
    expect(vi.getTimerCount()).toBe(0); expect(f.leases.get(input.requestId)?.state).toBe("REVOKED");
  });
  it("aborts a pending committed issue, withholds delivery and joins independent cleanup before stopping", async () => {
    const f = fixture(), gate = deferred<void>(); let committed = false;
    const s = f.service({ async call(op, data, ctx) { const result = await f.call(op, data, ctx);
      if (op === "issue") { committed = true; await gate.promise; } return result; } });
    await s.start(); const input = scope(), rejected = expect(s.custody.issue(input, context())).rejects.toThrow(ERROR);
    await vi.advanceTimersByTimeAsync(1); expect(committed).toBe(true); const stopped = s.stop();
    await rejected; expect(await stopped).toEqual({ state: "STOPPED", cleanupConfirmed: true });
    expect(f.leases.get(input.requestId)?.state).toBe("REVOKED"); gate.resolve(); await vi.advanceTimersByTimeAsync(1);
    expect(s.health().state).toBe("STOPPED");
  });
  it("keeps failed issuance terminal even when its independent cleanup succeeds", async () => {
    const f = fixture(), s = f.service({ async call(op, data, ctx) { const result = await f.call(op, data, ctx);
      if (op === "issue") throw new Error("SECRET_ACK_LOST"); return result; } });
    await s.start(); const input = scope(); await expect(s.custody.issue(input, context())).rejects.toThrow(ERROR);
    expect(await s.finished).toEqual({ state: "FAILED", cleanupConfirmed: true }); expect(s.health().reason).toBe("CUSTODY_FAILED");
    expect(f.leases.get(input.requestId)?.state).toBe("REVOKED"); await expect(s.start()).rejects.toThrow(ERROR);
  });
  it.each(["start", "inventory", "ready"])("bounds failed startup at %s without claiming cleanup or self-restarting", async fault => {
    const f = fixture(), brokerCall = vi.fn<TaskPreviewIssuerBroker["call"]>((op, data, ctx) => op === fault ? new Promise(() => {}) : f.call(op, data, ctx));
    const s = f.service({ call: brokerCall }), rejected = expect(s.start()).rejects.toThrow(ERROR);
    await vi.advanceTimersByTimeAsync(3001); await rejected;
    expect(await s.finished).toEqual({ state: "FAILED", cleanupConfirmed: false });
    const calls = brokerCall.mock.calls.length; await vi.advanceTimersByTimeAsync(120000); expect(brokerCall).toHaveBeenCalledTimes(calls);
  });
  it("stops during startup without accepting a late readiness acknowledgement", async () => {
    const f = fixture(), gate = deferred<unknown>(), s = f.service({ call: () => gate.promise });
    const rejected = expect(s.start()).rejects.toThrow(ERROR); const stopped = s.stop(); await rejected;
    expect(await stopped).toEqual({ state: "FAILED", cleanupConfirmed: false }); gate.resolve({ ready: true });
    await vi.advanceTimersByTimeAsync(1); expect(s.health().state).toBe("FAILED"); expect(vi.getTimerCount()).toBe(0);
  });
  it("fails closed on a stalled sweep, drains with a fresh signal and never schedules a retry loop", async () => {
    const f = fixture(); let blocked = false, stalledSignal: AbortSignal | undefined;
    const s = f.service({ call(op, data, ctx) {
      if (op === "inventory" && blocked) { blocked = false; stalledSignal = ctx.signal; return new Promise(() => {}); }
      return f.call(op, data, ctx);
    } });
    await s.start(); const input = scope(); await s.custody.issue(input, context()); blocked = true;
    await vi.advanceTimersByTimeAsync(8001); expect(await s.finished).toEqual({ state: "FAILED", cleanupConfirmed: true });
    expect(stalledSignal?.aborted).toBe(true); expect(s.health().reason).toBe("SWEEP_FAILED");
    expect(f.leases.get(input.requestId)?.state).toBe("REVOKED"); expect(f.call.mock.calls.at(-1)![2].signal).not.toBe(stalledSignal);
  });
  it.each(["roleCount", "sessionCount", "membershipCount"])("does not claim a clean stop with residual %s", async field => {
    const f = fixture(), s = f.service({ async call(op, data, ctx) { const result = await f.call(op, data, ctx);
      return op === "finalize" ? { ...result as object, [field]: 1 } : result; } });
    await s.start(); await s.custody.issue(scope(), context()); expect(await s.stop()).toEqual({ state: "FAILED", cleanupConfirmed: false });
  });
  it("leaves unknown cleanup durable for a fresh service to recover before issuance", async () => {
    const f = fixture(); let offline = false;
    const a = f.service({ call(op, data, ctx) { if (offline) throw new Error("SECRET_DATABASE_DOWN"); return f.call(op, data, ctx); } });
    await a.start(); const input = scope(); await a.custody.issue(input, context()); offline = true;
    await vi.advanceTimersByTimeAsync(5000); expect(await a.finished).toEqual({ state: "FAILED", cleanupConfirmed: false });
    expect(f.leases.get(input.requestId)?.state).toBe("ISSUED"); const b = f.service(); await b.start();
    expect(f.leases.get(input.requestId)?.state).toBe("REVOKED"); expect(b.health().state).toBe("READY");
  });
  it("does not let a stale service stop take over or revoke the successor's active lease", async () => {
    const f = fixture(), a = f.service(); await a.start(); const b = f.service(); await b.start();
    const input = scope(); await b.custody.issue(input, context()); f.call.mockClear();
    expect(await a.stop()).toEqual({ state: "FAILED", cleanupConfirmed: false }); expect(f.operations()).toEqual(["inventory"]);
    expect(f.leases.get(input.requestId)?.state).toBe("ISSUED"); expect(b.health().state).toBe("READY");
  });
  it.each([-2000, 2000])("fails closed on a wall-clock jump of %s ms", async delta => {
    const f = fixture(), s = f.service(), input = scope(); await s.start(); await s.custody.issue(input, context()); jumpClock(delta);
    await expect(s.custody.issue(scope(), context())).rejects.toThrow(ERROR);
    expect(await s.finished).toEqual({ state: "FAILED", cleanupConfirmed: true }); expect(s.health().reason).toBe("HEALTH_EXPIRED");
    expect(f.leases.get(input.requestId)?.state).toBe("REVOKED");
  });
  it.each(["health", "issue", "tick"])("rejects stale health even before delayed timer processing via %s", async entry => {
    const f = fixture(), s = f.service(); await s.start();
    // Simulate a suspended event loop: wall and monotonic advance, callbacks do not.
    vi.setSystemTime(Date.now() + TASK_PREVIEW_SERVICE_FRESH_MS);
    if (entry === "health") expect(s.health().state).toBe("STOPPING");
    if (entry === "issue") await expect(s.custody.issue(scope(), context())).rejects.toThrow(ERROR);
    if (entry === "tick") await vi.advanceTimersByTimeAsync(5000);
    expect(await s.finished).toEqual({ state: "FAILED", cleanupConfirmed: true }); expect(s.health().reason).toBe("HEALTH_EXPIRED");
  });
  it.each(["requestId", "projectRef", "purpose", "callerRole", "principal"])("rejects invalid request %s without shutting down the service", async field => {
    const f = fixture(), s = f.service(); await s.start(); f.call.mockClear();
    await expect(s.custody.issue({ ...scope(), [field]: "invalid" } as never, context())).rejects.toThrow(ERROR);
    expect(s.health().state).toBe("READY"); expect(f.call).not.toHaveBeenCalled();
  });
  it("rejects accessor/Proxy requests without invoking traps or affecting healthy service", async () => {
    const f = fixture(), s = f.service(), getter = vi.fn(); await s.start(); f.call.mockClear();
    const raw = scope(); Object.defineProperty(raw, "principal", { get: getter });
    await expect(s.custody.issue(raw, context())).rejects.toThrow(ERROR);
    await expect(s.custody.revoke(new Proxy(scope(), {}), context())).rejects.toThrow(ERROR);
    expect(getter).not.toHaveBeenCalled(); expect(f.call).not.toHaveBeenCalled(); expect(s.health().state).toBe("READY");
  });
  it("bounds concurrent issue admission without failing the running service", async () => {
    const f = fixture(), gate = deferred<void>();
    const s = f.service({ async call(op, data, ctx) { if (op === "issue") await gate.promise; return f.call(op, data, ctx); } });
    await s.start(); const work = Array.from({ length: 4 }, () => s.custody.issue(scope(), context()));
    await expect(s.custody.issue(scope(), context())).rejects.toThrow(ERROR); gate.resolve(); await Promise.all(work);
    expect(s.health().state).toBe("READY"); expect(f.operations().filter(op => op === "issue")).toHaveLength(4);
  });
  it("rejects pre-aborted requests without cancelling the maintenance lifecycle", async () => {
    const f = fixture(), s = f.service(); await s.start(); const aborted = new AbortController(); aborted.abort(); f.call.mockClear();
    await expect(s.custody.issue(scope(), { signal: aborted.signal })).rejects.toThrow(ERROR);
    await expect(s.custody.revoke(scope(), { signal: aborted.signal })).rejects.toThrow(ERROR);
    expect(f.call).not.toHaveBeenCalled(); expect(s.health().state).toBe("READY");
  });
  it("composes service + real SQL broker, with a fresh fixed-statement offline connection per operation", async () => {
    const f = fixture(), close = vi.fn(async () => {}), query = vi.fn(async (sql: string, values: readonly unknown[]) => {
      expect(sql).toBe(TASK_PREVIEW_ISSUER_SQL);
      const op = values[0] as Parameters<TaskPreviewIssuerBroker["call"]>[0], payload = JSON.parse(values[1] as string);
      return { rows: [{ data: await f.call(op, payload, context()) }] };
    });
    const open = vi.fn(async () => ({ query, close })), s = f.service(createTaskPreviewSqlBroker(open));
    await s.start(); await s.custody.issue(scope(), context()); await vi.advanceTimersByTimeAsync(60000); await s.stop();
    expect(open.mock.calls.length).toBe(query.mock.calls.length); expect(close).toHaveBeenCalledTimes(query.mock.calls.length);
    expect(f.operations()).toContain("finalize"); expect(s.health().cleanupConfirmed).toBe(true);
  });
});

it("keeps the lifecycle source server-only, uninstalled and free of credentials, listeners and process hooks", () => {
  const name = "communication-note-task-preview-service", walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual([]);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.(?:env|on|exit)|fetch\s*\(|from ["']pg["']|console\.|setInterval\s*\(|\.unref\s*\(/);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain(ERROR);
});
