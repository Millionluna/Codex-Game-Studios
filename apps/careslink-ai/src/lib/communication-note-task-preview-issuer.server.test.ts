import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { COMMUNICATION_NOTE_TASK_PREVIEW_ISSUER_READY, createCommunicationNoteTaskPreviewIssuer as createIssuer,
  createTaskPreviewSqlBroker, TASK_PREVIEW_ISSUER_SQL, type TaskPreviewIssuerBroker,
  type TaskPreviewControlConnection } from "./communication-note-task-preview-issuer.server";
import type { CommunicationNoteTaskLeaseScope } from "./communication-note-workspace-task-lease.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
const REF = "abcdefghijklmnopqrst", MESSAGE = "Task Preview issuer unavailable";
const context = () => ({ signal: new AbortController().signal });
const scope = (): CommunicationNoteTaskLeaseScope => ({ requestId: randomBytes(16).toString("hex"), projectRef: REF,
  purpose: "COMMUNICATION_NOTE_JOB_LIST_READ", callerRole: "careslink_v1_generation_job_list_caller",
  principal: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", transport: "COOKIE" } });
type Data = Readonly<Record<string, unknown>>;
type Lease = { scope: CommunicationNoteTaskLeaseScope; state: string; role: string | null; expiresAt: string | null;
  roleCount: number; sessionCount: number; membershipCount: number };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

// Protocol fake only: it persists across source instances, NOT across processes.
// Real role/transaction/SCRAM/session behavior belongs to the opt-in PG suite.
function fixture() {
  let epoch: unknown, ready = false;
  const leases = new Map<string, Lease>();
  const call = vi.fn<TaskPreviewIssuerBroker["call"]>(async (op, data) => {
    if (op === "start") { epoch = data.epoch; ready = false; return { projectRef: REF, epoch, ready }; }
    if (["inventory", "ready", "issue"].includes(op) && data.epoch !== epoch) throw new Error("STALE");
    if (op === "inventory") return { projectRef: REF, epoch, leases: [...leases.values()].filter(l => l.state !== "REVOKED")
      .map(({ scope: s, state, expiresAt }) => ({ scope: s, state, expiresAt })) };
    if (op === "ready") {
      if ([...leases.values()].some(l => l.state !== "REVOKED")) throw new Error("RECOVER_FIRST");
      ready = true; return { projectRef: REF, epoch, ready };
    }
    const s = data.scope as CommunicationNoteTaskLeaseScope;
    let l = leases.get(s.requestId);
    if (l && JSON.stringify(l.scope) !== JSON.stringify(s)) throw new Error("SCOPE");
    if (op === "issue") {
      if (!ready || l) throw new Error("REPLAY");
      l = { scope: s, state: "ISSUED", role: data.role as string, expiresAt: data.expiresAt as string,
        roleCount: 1, sessionCount: 0, membershipCount: 2 }; leases.set(s.requestId, l);
    } else if (op === "fence") {
      if (!l) { l = { scope: s, state: "REVOKED", role: null, expiresAt: null, roleCount: 0, sessionCount: 0, membershipCount: 0 }; leases.set(s.requestId, l); }
      else if (l.state === "ISSUED") l.state = "FENCED";
    } else if (op === "finalize") {
      if (!l || l.state === "ISSUED") throw new Error("FENCE_FIRST");
      Object.assign(l, { state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 });
    }
    return { ...l };
  });
  const service = (broker: TaskPreviewIssuerBroker = { call }) => createIssuer({ projectRef: REF, broker });
  return { leases, call, service };
}
afterEach(() => vi.useRealTimers());

describe("uninstalled task Preview issuer — offline protocol coverage", () => {
  it("does no IO on construction and requires completed recovery before issuance", async () => {
    const f = fixture(), s = f.service(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_ISSUER_READY).toBe(false);
    expect(f.call).not.toHaveBeenCalled(); await expect(s.custody.issue(scope(), context())).rejects.toThrow(MESSAGE);
    await s.recover(context()); expect(f.call.mock.calls.map(c => c[0])).toEqual(["start", "inventory", "ready"]);
    await s.custody.issue(scope(), context());
  });
  it.each([CARESLINK_PRODUCTION_SUPABASE_REF, "short", REF.toUpperCase(), REF + "\n"])("rejects target %s before IO", projectRef => {
    const f = fixture(); expect(() => createIssuer({ projectRef, broker: { call: f.call } })).toThrow(); expect(f.call).not.toHaveBeenCalled();
  });
  it.each(["requestId", "projectRef", "purpose", "callerRole", "principal"])("rejects malformed %s before issuer IO", async key => {
    const f = fixture(), s = f.service(); await s.recover(context()); f.call.mockClear();
    await expect(s.custody.issue({ ...scope(), [key]: "invalid" } as never, context())).rejects.toThrow(); expect(f.call).not.toHaveBeenCalled();
  });
  it("rejects Proxy and accessor scope input without executing it", async () => {
    const f = fixture(), s = f.service(), getter = vi.fn(); await s.recover(context()); f.call.mockClear();
    const input = scope(); Object.defineProperty(input, "requestId", { get: getter });
    await expect(s.custody.issue(input, context())).rejects.toThrow();
    await expect(s.custody.issue(new Proxy(scope(), {}), context())).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled(); expect(f.call).not.toHaveBeenCalled();
  });
  it("delivers a fresh 60-second secret but sends only its SCRAM verifier to custody SQL", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-09T14:00:00.000Z"));
    const f = fixture(), s = f.service(), input = scope(); await s.recover(context()); const d = await s.custody.issue(input, context());
    expect(d.credential.role).toMatch(/^careslink_v1_job_list_runtime_[a-f0-9]{16}$/); expect(d.credential.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(d.credential.deliveryExpiresAt).toBe("2026-09-09T14:01:00.000Z");
    const sent = f.call.mock.calls.find(c => c[0] === "issue")![1]; expect(JSON.stringify(sent)).not.toContain(d.credential.password);
    const parts = /^SCRAM-SHA-256\$4096:([^$]+)\$([^:]+):(.+)$/.exec(sent.verifier as string)!;
    const salted = pbkdf2Sync(d.credential.password, Buffer.from(parts[1], "base64"), 4096, 32, "sha256");
    expect(createHash("sha256").update(createHmac("sha256", salted).update("Client Key").digest()).digest("base64")).toBe(parts[2]);
    expect(createHmac("sha256", salted).update("Server Key").digest("base64")).toBe(parts[3]);
    const second = await s.custody.issue(scope(), context()); expect(second.credential.role).not.toBe(d.credential.role);
    expect(second.credential.password).not.toBe(d.credential.password);
  });
  it("snapshots the exact ownership scope before asynchronous issuance", async () => {
    const f = fixture(), s = f.service(), input = scope(); await s.recover(context());
    const original = structuredClone(input), pending = s.custody.issue(input, context());
    (input as { requestId: string }).requestId = "f".repeat(32); const d = await pending;
    expect(d.requestId).toBe(original.requestId); expect(d.principal).toEqual(original.principal); expect(Object.isFrozen(d.principal)).toBe(true);
  });
  it("recovers recorded unfinished leases before enabling the next instance and rejects stale issuance", async () => {
    const f = fixture(), a = f.service(), input = scope(); await a.recover(context()); await a.custody.issue(input, context()); f.call.mockClear();
    const b = f.service(); await b.recover(context());
    expect(f.call.mock.calls.map(c => c[0])).toEqual(["start", "inventory", "fence", "finalize", "ready"]);
    expect(f.leases.get(input.requestId)?.state).toBe("REVOKED"); await expect(a.custody.issue(scope(), context())).rejects.toThrow(MESSAGE);
    await b.custody.issue(scope(), context());
  });
  it("fences unknown requests and never reissues a revoked request ID", async () => {
    const f = fixture(), s = f.service(), input = scope(); await s.recover(context());
    expect(await s.custody.revoke(input, context())).toEqual({ ...input, status: "REVOKED" });
    await expect(s.custody.issue(input, context())).rejects.toThrow(MESSAGE); expect(f.leases.get(input.requestId)?.state).toBe("REVOKED");
  });
  it.each(["lost acknowledgement", "wrong owner", "extra secret", "invalid role", "invalid expiry", "cancelled delivery"])(
    "independently revokes uncertain issuance: %s", async fault => {
      const f = fixture(), controller = new AbortController();
      const s = f.service({ async call(op, data, ctx) {
        const result = await f.call(op, data, ctx) as Lease;
        if (op !== "issue") return result;
        if (fault === "lost acknowledgement") throw new Error("private control failure");
        if (fault === "wrong owner") return { ...result, scope: { ...result.scope, requestId: "f".repeat(32) } };
        if (fault === "extra secret") return { ...result, password: "private" };
        if (fault === "invalid role") return { ...result, role: "postgres" };
        if (fault === "invalid expiry") return { ...result, expiresAt: "tomorrow" };
        controller.abort(); return result;
      } });
      await s.recover(context()); const input = scope();
      await expect(s.custody.issue(input, { signal: controller.signal })).rejects.toThrow(MESSAGE);
      expect(f.leases.get(input.requestId)?.state).toBe("REVOKED");
      expect(f.call.mock.calls.slice(-2).map(c => c[0])).toEqual(["fence", "finalize"]);
      await expect(s.custody.issue(scope(), context())).rejects.toThrow(MESSAGE);
    });
  it("uses independent recovery after the simulated control service loses a committed issue", async () => {
    const f = fixture(); let lost = false;
    const s = f.service({ async call(op, data, ctx) { if (lost) throw new Error("offline"); const r = await f.call(op, data, ctx);
      if (op === "issue") { lost = true; throw new Error("ack lost"); } return r; } });
    await s.recover(context()); const input = scope(); await expect(s.custody.issue(input, context())).rejects.toThrow(MESSAGE);
    expect(f.leases.get(input.requestId)?.state).toBe("ISSUED"); await f.service().recover(context());
    expect(f.leases.get(input.requestId)?.state).toBe("REVOKED");
  });
  it.each(["roleCount", "sessionCount", "membershipCount"])("withholds terminal acknowledgement with remaining %s", async field => {
    const f = fixture(), s = f.service({ async call(op, data, ctx) { const r = await f.call(op, data, ctx); return op === "finalize" ? { ...r as Data, [field]: 1 } : r; } });
    await s.recover(context()); const input = scope(); await s.custody.issue(input, context());
    await expect(s.custody.revoke(input, context())).rejects.toThrow(MESSAGE); await expect(s.custody.issue(scope(), context())).rejects.toThrow(MESSAGE);
  });
  it.each(["duplicate", "too many", "bad expiry", "wrong epoch"])("keeps issuance closed for malformed recovery inventory: %s", async fault => {
    const f = fixture(), input = scope(), lease = { scope: input, state: "ISSUED", expiresAt: new Date().toISOString() };
    const s = f.service({ async call(op, data, ctx) {
      const r = await f.call(op, data, ctx); if (op !== "inventory") return r;
      return { ...r as Data, ...(fault === "wrong epoch" ? { epoch: "bad" } : {}), leases: fault === "duplicate" ? [lease, lease] :
        fault === "too many" ? Array.from({ length: 5 }, () => ({ ...lease, scope: scope() })) : fault === "bad expiry" ? [{ ...lease, expiresAt: "bad" }] : [] };
    } });
    await expect(s.recover(context())).rejects.toThrow(MESSAGE); await expect(s.custody.issue(scope(), context())).rejects.toThrow(MESSAGE);
    expect(f.call.mock.calls.map(c => c[0])).not.toContain("ready");
  });
  it("sweeps expired and already fenced leases but leaves a valid active lease alone", async () => {
    const f = fixture(), s = f.service(); await s.recover(context()); const [expired, fenced, active] = [scope(), scope(), scope()];
    for (const input of [expired, fenced, active]) await s.custody.issue(input, context());
    f.leases.get(expired.requestId)!.expiresAt = new Date(Date.now() - 1).toISOString(); f.leases.get(fenced.requestId)!.state = "FENCED";
    await s.sweepExpired(context()); expect(f.leases.get(expired.requestId)?.state).toBe("REVOKED");
    expect(f.leases.get(fenced.requestId)?.state).toBe("REVOKED"); expect(f.leases.get(active.requestId)?.state).toBe("ISSUED");
  });
  it("times out stalled issuance, commits its cancellation tombstone, and ignores late delivery", async () => {
    vi.useFakeTimers(); const f = fixture(), delayed = deferred<unknown>();
    const s = f.service({ call: (op, data, ctx) => op === "issue" ? delayed.promise : f.call(op, data, ctx) });
    await s.recover(context()); const input = scope(), rejected = expect(s.custody.issue(input, context())).rejects.toThrow(MESSAGE);
    await vi.advanceTimersByTimeAsync(3001); await rejected; expect(f.leases.get(input.requestId)?.state).toBe("REVOKED");
    delayed.resolve({ state: "ISSUED", password: "late private" }); await vi.advanceTimersByTimeAsync(1);
    await expect(s.custody.issue(scope(), context())).rejects.toThrow(MESSAGE);
  });
  it("rejects overlapping recovery and pre-aborted requests without issuer calls", async () => {
    const f = fixture(), gate = deferred<unknown>(), s = f.service({ call: () => gate.promise });
    const controller = new AbortController(), first = expect(s.recover({ signal: controller.signal })).rejects.toThrow(MESSAGE);
    await expect(s.recover(context())).rejects.toThrow(MESSAGE); controller.abort(); await first; gate.resolve({});
    const b = f.service(); await b.recover(context()); f.call.mockClear();
    await expect(b.custody.issue(scope(), { signal: controller.signal })).rejects.toThrow(MESSAGE); expect(f.call).not.toHaveBeenCalled();
  });
});

describe("dedicated control SQL broker — offline connection lifecycle", () => {
  function connection() { return { query: vi.fn(async () => ({ rows: [{ data: { result: "ok" } }] })), close: vi.fn(async () => {}) }; }
  it("uses only the fixed parameterized statement and a fresh connection per call", async () => {
    const a = connection(), b = connection(), open = vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(b), broker = createTaskPreviewSqlBroker(open);
    expect(await broker.call("fence", { scope: scope() }, context())).toEqual({ result: "ok" });
    await broker.call("finalize", { marker: "value'notSQL" }, context());
    expect(b.query).toHaveBeenCalledWith(TASK_PREVIEW_ISSUER_SQL, ["finalize", JSON.stringify({ marker: "value'notSQL" })]);
    expect(open).toHaveBeenCalledTimes(2); expect(a.close).toHaveBeenCalledTimes(1); expect(b.close).toHaveBeenCalledTimes(1);
  });
  it("rejects unknown operations before opening a connection", async () => {
    const open = vi.fn(); await expect(createTaskPreviewSqlBroker(open).call("DROP" as never, {}, context())).rejects.toThrow(MESSAGE); expect(open).not.toHaveBeenCalled();
  });
  it.each([[], [{ data: 1 }, { data: 2 }], [{ data: 1, secret: "no" }]].map(rows => ({ rows })))("closes and sanitizes malformed driver rows %j", async ({ rows }) => {
    const c = connection(); c.query.mockResolvedValue({ rows } as never);
    await expect(createTaskPreviewSqlBroker(async () => c).call("start", {}, context())).rejects.toThrow(MESSAGE); expect(c.close).toHaveBeenCalledTimes(1);
  });
  it("closes on query failure without leaking driver errors", async () => {
    const c = connection(); c.query.mockRejectedValue(new Error("secret SQL"));
    await expect(createTaskPreviewSqlBroker(async () => c).call("start", {}, context())).rejects.toThrow(MESSAGE); expect(c.close).toHaveBeenCalledTimes(1);
  });
  it("sanitizes physical close failure and withholds the query result", async () => {
    const c = connection(); c.close.mockRejectedValue(new Error("private connection details"));
    await expect(createTaskPreviewSqlBroker(async () => c).call("start", {}, context())).rejects.toThrow(MESSAGE);
  });
  it("owns and closes a connection that arrives after the opener deadline", async () => {
    vi.useFakeTimers(); const pending = deferred<TaskPreviewControlConnection>(), c = connection();
    const rejected = expect(createTaskPreviewSqlBroker(() => pending.promise).call("start", {}, context())).rejects.toThrow(MESSAGE);
    await vi.advanceTimersByTimeAsync(2001); await rejected; pending.resolve(c); await vi.advanceTimersByTimeAsync(1);
    expect(c.query).not.toHaveBeenCalled(); expect(c.close).toHaveBeenCalledTimes(1);
  });
  it("closes a stalled query on abort and refuses its late result", async () => {
    vi.useFakeTimers(); const pending = deferred<{ rows: unknown[] }>(), c = connection(); c.query.mockImplementation(() => pending.promise as never);
    const rejected = expect(createTaskPreviewSqlBroker(async () => c).call("start", {}, context())).rejects.toThrow(MESSAGE);
    await vi.advanceTimersByTimeAsync(2001); await rejected; expect(c.close).toHaveBeenCalledTimes(1);
    pending.resolve({ rows: [{ data: "late" }] }); await vi.advanceTimersByTimeAsync(1); expect(c.close).toHaveBeenCalledTimes(1);
  });
  it("bounds stalled physical close and withholds success", async () => {
    vi.useFakeTimers(); const c = connection(); c.close.mockImplementation(() => new Promise(() => {}));
    const rejected = expect(createTaskPreviewSqlBroker(async () => c).call("start", {}, context())).rejects.toThrow(MESSAGE);
    await vi.advanceTimersByTimeAsync(1001); await rejected; expect(c.close).toHaveBeenCalledTimes(1);
  });
});

it("quarantines the source/candidate from product installation and automatic migrations", () => {
  const name = "communication-note-task-preview-issuer", candidate = "20260909143031_add_communication_note_task_preview_issuer.sql";
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  const importers = walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name)); expect(importers).toEqual([]);
  expect(readdirSync("supabase/migrations")).not.toContain(candidate);
  const sql = readFileSync(`supabase/migration-candidates/${candidate}`, "utf8");
  expect(sql).toContain(`p<>'${CARESLINK_PRODUCTION_SUPABASE_REF}'`);
  expect(sql).toContain("security invoker set search_path=''"); expect(sql.match(/force row level security/g)).toHaveLength(2);
  expect(sql).toContain("TASK_ISSUER_COMMITTED_FENCE_REQUIRED"); expect(sql).toContain("TASK_ISSUER_ROLE_CHANGED");
  expect(sql).toContain("TASK_ISSUER_UNEXPECTED_ACL"); expect(sql).not.toMatch(/security definer|grant\s+execute/i);
  const runtime = readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8");
  expect(runtime).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain("careslink_task_preview_issuer");
});

it("requires machine-readable local advisor results and fails on every finding", () => {
  const runner = readFileSync("scripts/preview-e2e/communication-note-task-issuer-local-pg16.mjs", "utf8");
  expect(runner).toContain('"--type", "security", "--fail-on", "info", "--output-format", "json"');
  expect(runner).not.toContain('"--output", "json"');
  expect(runner).toContain('throw new Error("LOCAL_ADVISORS_NON_JSON")');
  expect(runner).toContain('throw new Error("LOCAL_ADVISORS_FAILED")');
  expect(runner).toContain('"--bail=1"');
});
