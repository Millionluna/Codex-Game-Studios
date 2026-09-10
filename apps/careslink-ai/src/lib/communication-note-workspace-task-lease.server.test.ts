import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommunicationNoteTaskLeaseReadPort, COMMUNICATION_NOTE_TASK_LEASE_READY,
  COMMUNICATION_NOTE_TASK_LEASE_ISSUE_TIMEOUT_MS, COMMUNICATION_NOTE_TASK_LEASE_READ_TIMEOUT_MS,
  COMMUNICATION_NOTE_TASK_LEASE_REVOKE_TIMEOUT_MS,
  type CommunicationNoteTaskLeaseScope, type CommunicationNoteTaskLeaseOptions } from "./communication-note-workspace-task-lease.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
vi.mock("server-only", () => ({}));
const REF = "abcdefghijklmnopqrst", PURPOSE = "COMMUNICATION_NOTE_JOB_LIST_READ", CALLER = "careslink_v1_generation_job_list_caller";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ERROR = "Task list credential lifecycle unavailable";
const principal = () => ({ userId: USER, sessionId: SESSION, transport: "COOKIE" as const });
const parameters = () => [USER, SESSION, null, null, 20, "1.0.0-shadow.1", "2026-08-09.v1-shadow"];
const credential = () => ({ role: "careslink_v1_job_list_runtime_0123456789abcdef", password: "p".repeat(43),
  deliveryExpiresAt: new Date(Date.now() + 60000).toISOString() });
const delivery = (scope: CommunicationNoteTaskLeaseScope) => ({ ...scope, credential: credential() });
const receipt = (scope: CommunicationNoteTaskLeaseScope) => ({ ...scope, status: "REVOKED" as const });
const result = { rows: [{ data: { tasks: [], nextCursor: null } }] };
const issue = vi.fn<(scope: CommunicationNoteTaskLeaseScope, context: { signal: AbortSignal }) => Promise<ReturnType<typeof delivery>>>();
const revoke = vi.fn<(scope: CommunicationNoteTaskLeaseScope, context: { signal: AbortSignal }) => Promise<ReturnType<typeof receipt>>>();
const execute = vi.fn<(values: readonly unknown[], context: { signal: AbortSignal }) => Promise<unknown>>();
const source = () => ({ projectRef: REF, purpose: PURPOSE, callerRole: CALLER, execute });
const open = vi.fn<(input: Parameters<CommunicationNoteTaskLeaseOptions["open"]>[0]) => ReturnType<typeof source>>();
const input = () => ({ enabled: true, projectRef: REF, principal: principal(), custody: { issue, revoke }, open });
const create = (value: unknown = input()) => createCommunicationNoteTaskLeaseReadPort(value as CommunicationNoteTaskLeaseOptions)!;
const read = (signal = new AbortController().signal) => create().execute(parameters(), { signal });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function until(test: () => boolean) { for (let i = 0; i < 100; i++) { if (test()) return; await Promise.resolve(); } throw new Error("TEST_NOT_READY"); }
beforeEach(() => {
  vi.resetAllMocks();
  issue.mockImplementation(async scope => delivery(scope)); revoke.mockImplementation(async scope => receipt(scope));
  execute.mockResolvedValue(result); open.mockImplementation(() => source());
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("default-off task credential lifecycle", () => {
  it("does no work until explicitly bound and executed; exposes no credential", async () => {
    expect(COMMUNICATION_NOTE_TASK_LEASE_READY).toBe(false);
    for (const enabled of [false, undefined, "true", 1, null]) expect(create({ ...input(), enabled })).toBeUndefined();
    const disabled = { ...input() }; delete (disabled as { enabled?: boolean }).enabled;
    Object.defineProperty(disabled, "custody", { get() { throw new Error("NEVER_READ"); } });
    expect(create(disabled)).toBeUndefined();
    vi.stubEnv("CARESLINK_TASK_LEASE_ENABLED", "true"); expect(create(disabled)).toBeUndefined();
    const port = create(); expect(Object.isFrozen(port)).toBe(true);
    expect(Object.keys(port).sort()).toEqual(["callerRole", "execute", "projectRef", "purpose"]);
    expect(JSON.stringify(port)).not.toMatch(/password|aaaa|cccc|pppp/); expect(issue).not.toHaveBeenCalled();
    await expect(port.execute(parameters(), { signal: new AbortController().signal })).resolves.toBe(result);
    expect(issue).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
    const scope = issue.mock.calls[0][0]; expect(scope.requestId).toMatch(/^[a-f0-9]{32}$/);
    expect(Object.isFrozen(scope)).toBe(true); expect(Object.isFrozen(scope.principal)).toBe(true);
    expect(revoke.mock.calls[0][0]).toBe(scope);
    expect(open.mock.calls[0][0].credential.password).toBe("");
  });
  it.each(["production", "ref", "ref-newline", "user", "session-newline", "transport", "extra", "getter", "proxy", "custody-extra", "open-proxy"])(
    "rejects malformed binding %s before any I/O", kind => {
      let value: unknown = input(); const v = value as ReturnType<typeof input>;
      if (kind === "production") v.projectRef = CARESLINK_PRODUCTION_SUPABASE_REF;
      if (kind === "ref") v.projectRef = "untrusted.invalid";
      if (kind === "ref-newline") v.projectRef += "\n";
      if (kind === "user") v.principal.userId = "invalid";
      if (kind === "session-newline") v.principal.sessionId += "\n";
      if (kind === "transport") Object.assign(v.principal, { transport: "BEARER" });
      if (kind === "extra") Object.assign(v, { host: "other.invalid" });
      if (kind === "getter") Object.defineProperty(v, "enabled", { get() { throw new Error("NEVER_READ"); } });
      if (kind === "proxy") value = new Proxy(v, { getPrototypeOf() { throw new Error("NEVER_READ"); } });
      if (kind === "custody-extra") Object.assign(v.custody, { admin: true });
      if (kind === "open-proxy") v.open = new Proxy(open, {});
      expect(() => create(value)).toThrow(ERROR); expect(issue).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    });
  it.each([0, 1, 2, 3, 4, 5, 6, "extra", "getter", "proxy"])("rejects query tampering %s and consumes the port", async kind => {
    const values = parameters(); let raw: readonly unknown[] = values;
    if (typeof kind === "number") values[kind] = "tampered";
    if (kind === "extra") values.push("extra");
    if (kind === "getter") Object.defineProperty(values, "0", { get() { throw new Error("NEVER_READ"); } });
    if (kind === "proxy") raw = new Proxy(values, {});
    const port = create(); await expect(port.execute(raw, { signal: new AbortController().signal })).rejects.toThrow(ERROR);
    await expect(port.execute(parameters(), { signal: new AbortController().signal })).rejects.toThrow(ERROR);
    expect(issue).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
  });
  it.each(["aborted", "fake-signal", "proxy", "getter", "extra"])("rejects context %s before issue", async kind => {
    const context: { signal: unknown } = { signal: kind === "aborted" ? AbortSignal.abort() : new AbortController().signal };
    if (kind === "fake-signal") context.signal = { aborted: false };
    if (kind === "proxy") context.signal = new Proxy(context.signal as AbortSignal, { getPrototypeOf() { throw new Error("NEVER_READ"); } });
    if (kind === "getter") Object.defineProperty(context, "signal", { get() { throw new Error("NEVER_READ"); } });
    if (kind === "extra") Object.assign(context, { ownerId: USER });
    await expect(create().execute(parameters(), context as { signal: AbortSignal })).rejects.toThrow(ERROR);
    expect(issue).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
  });
  it("captures identity, parameters and dependency functions, and rejects concurrent reuse", async () => {
    const v = input(), values = parameters(), port = create(v);
    v.principal.userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; v.custody.issue = vi.fn();
    const pending = port.execute(values, { signal: new AbortController().signal }); values[0] = "tampered";
    await expect(port.execute(parameters(), { signal: new AbortController().signal })).rejects.toThrow(ERROR); await pending;
    expect(issue.mock.calls[0][0].principal).toEqual(principal());
    expect(execute.mock.calls[0][0]).toEqual(parameters()); expect(Object.isFrozen(execute.mock.calls[0][0])).toBe(true);
    await read(); expect(issue.mock.calls[0][0].requestId).not.toBe(issue.mock.calls[1][0].requestId);
  });
  for (const stage of ["issue", "revoke"] as const) {
    it.each(["requestId", "projectRef", "purpose", "callerRole", "userId", "sessionId", "transport", "extra"])(
      stage + " rejects mismatched %s", async field => {
        const corrupt = (scope: CommunicationNoteTaskLeaseScope) => {
          const value = stage === "issue" ? delivery(scope) : receipt(scope);
          if (["userId", "sessionId", "transport"].includes(field)) Object.assign(value, { principal: { ...scope.principal, [field]: "wrong" } });
          else Object.assign(value, { [field]: "wrong" }); return value;
        };
        if (stage === "issue") issue.mockImplementation(async scope => corrupt(scope) as ReturnType<typeof delivery>);
        else revoke.mockImplementation(async scope => corrupt(scope) as ReturnType<typeof receipt>);
        await expect(read()).rejects.toThrow(ERROR); expect(revoke).toHaveBeenCalledOnce();
        if (stage === "issue") expect(open).not.toHaveBeenCalled(); else expect(execute).toHaveBeenCalledOnce();
      });
  }
  it.each(["role", "role-newline", "password", "password-newline", "expired", "too-long", "expiry-object", "getter", "proxy", "extra"])(
    "rejects credential %s without opening a connection but still revokes", async kind => {
      const forbidden = vi.fn(() => { throw new Error("NEVER_INVOKE"); });
      issue.mockImplementation(async scope => {
        const d = delivery(scope), c = d.credential;
        if (kind === "role") c.role = "postgres"; if (kind === "role-newline") c.role += "\n";
        if (kind === "password") c.password = "short"; if (kind === "password-newline") c.password += "\n";
        if (kind === "expired") c.deliveryExpiresAt = new Date(Date.now() - 1).toISOString();
        if (kind === "too-long") c.deliveryExpiresAt = new Date(Date.now() + 91000).toISOString();
        if (kind === "expiry-object") Object.assign(c, { deliveryExpiresAt: { toString: forbidden } });
        if (kind === "getter") Object.defineProperty(c, "password", { get: forbidden });
        if (kind === "proxy") d.credential = new Proxy(c, { getPrototypeOf: forbidden });
        if (kind === "extra") Object.assign(c, { host: "untrusted.invalid" }); return d;
      });
      await expect(read()).rejects.toThrow(ERROR); expect(open).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledOnce();
      expect(forbidden).not.toHaveBeenCalled();
    });
  it.each([undefined, null, false, 0, new Error("PRIVATE_SECRET")])("revokes and fails closed for falsy/private source rejection %s", async error => {
    execute.mockRejectedValue(error); await expect(read()).rejects.toThrow(ERROR);
    expect(revoke).toHaveBeenCalledOnce(); expect(open.mock.calls[0][0].credential.password).toBe("");
  });
  it.each(["sync", "async", "undefined"])("fences ambiguous %s issue failure by the known scope", async kind => {
    if (kind === "sync") issue.mockImplementation(() => { throw new Error("PRIVATE_SECRET"); });
    else issue.mockRejectedValue(kind === "undefined" ? undefined : new Error("PRIVATE_SECRET"));
    await expect(read()).rejects.toThrow(ERROR); expect(revoke.mock.calls[0][0]).toBe(issue.mock.calls[0][0]); expect(open).not.toHaveBeenCalled();
  });
  it.each(["throws", "projectRef", "purpose", "callerRole", "execute", "extra"])("revokes after malformed/failed source %s", async kind => {
    open.mockImplementation(() => {
      if (kind === "throws") throw new Error("PRIVATE_SECRET");
      return Object.assign(source(), { [kind]: "wrong" });
    });
    await expect(read()).rejects.toThrow(ERROR); expect(execute).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledOnce();
  });
  it("withholds metadata and erases its password reference while awaiting the revoke receipt", async () => {
    const pendingReceipt = deferred<ReturnType<typeof receipt>>(); revoke.mockReturnValue(pendingReceipt.promise);
    let returned = false; const pending = read().then(v => { returned = true; return v; });
    await until(() => revoke.mock.calls.length === 1); expect(returned).toBe(false);
    expect(open.mock.calls[0][0].credential.password).toBe("");
    pendingReceipt.resolve(receipt(revoke.mock.calls[0][0])); await expect(pending).resolves.toBe(result);
  });
  it.each(["false", "throw", "undefined"])("never releases data on %s cleanup", async kind => {
    if (kind === "false") revoke.mockImplementation(async scope => ({ ...scope, status: "PENDING" as "REVOKED" }));
    else revoke.mockRejectedValue(kind === "undefined" ? undefined : new Error("PRIVATE_SECRET"));
    await expect(read()).rejects.toThrow(ERROR);
  });
  it("preserves only source SESSION_REVOKED, after successful cleanup", async () => {
    const auth = Object.assign(new Error("SESSION_REVOKED"), { code: "P0001" });
    execute.mockRejectedValue(auth); await expect(read()).rejects.toMatchObject({ message: "SESSION_REVOKED", code: "P0001" });
    revoke.mockRejectedValue(new Error("PRIVATE_SECRET")); await expect(read()).rejects.toThrow(ERROR);
    revoke.mockImplementation(async scope => receipt(scope)); issue.mockRejectedValue(auth); await expect(read()).rejects.toThrow(ERROR);
  });
  it.each(["issue", "read", "revoke"])("browser cancellation during %s keeps independent cleanup alive", async stage => {
    const controller = new AbortController();
    if (stage === "issue") issue.mockImplementation(async scope => { controller.abort(); return delivery(scope); });
    if (stage === "read") execute.mockImplementation(async () => { controller.abort(); return result; });
    if (stage === "revoke") revoke.mockImplementation(async scope => { controller.abort(); return receipt(scope); });
    await expect(read(controller.signal)).rejects.toThrow(ERROR);
    expect(revoke).toHaveBeenCalledOnce(); expect(revoke.mock.calls[0][1].signal.aborted).toBe(false);
    expect(revoke.mock.calls[0][1].signal).not.toBe(controller.signal);
    if (stage === "issue") expect(open).not.toHaveBeenCalled();
    if (stage === "read") expect(execute.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it.each(["issue", "read", "revoke"])("bounds uncooperative %s and ignores late fulfillment", async stage => {
    vi.useFakeTimers(); const late = deferred<never>();
    if (stage === "issue") issue.mockReturnValue(late.promise);
    if (stage === "read") execute.mockReturnValue(late.promise);
    if (stage === "revoke") revoke.mockReturnValue(late.promise);
    const pending = read(), denied = expect(pending).rejects.toThrow(ERROR);
    const target = stage === "issue" ? issue : stage === "read" ? execute : revoke;
    await until(() => target.mock.calls.length === 1);
    const duration = stage === "issue" ? COMMUNICATION_NOTE_TASK_LEASE_ISSUE_TIMEOUT_MS :
      stage === "read" ? COMMUNICATION_NOTE_TASK_LEASE_READ_TIMEOUT_MS : COMMUNICATION_NOTE_TASK_LEASE_REVOKE_TIMEOUT_MS;
    await vi.advanceTimersByTimeAsync(duration); await denied;
    expect(target.mock.calls[0][1].signal.aborted).toBe(true);
    expect(revoke).toHaveBeenCalledOnce();
    late.resolve((stage === "issue" ? delivery(issue.mock.calls[0][0]) : stage === "revoke" ? receipt(revoke.mock.calls[0][0]) : result) as never);
    await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(0);
    if (stage === "issue") expect(open).not.toHaveBeenCalled();
  });
  it("observes late issuer rejection after cancellation without unhandled rejection", async () => {
    const late = deferred<ReturnType<typeof delivery>>(), controller = new AbortController(); issue.mockReturnValue(late.promise);
    const pending = read(controller.signal), denied = expect(pending).rejects.toThrow(ERROR);
    await until(() => issue.mock.calls.length === 1); controller.abort(); await denied;
    late.reject(new Error("LATE_PRIVATE_SECRET")); await Promise.resolve();
    expect(open).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledOnce();
  });
  it.each(["wall-expiry", "wall-rollback", "monotonic"])("withholds data on %s during cleanup", async kind => {
    vi.useFakeTimers(); const start = Date.now();
    const clock = vi.spyOn(performance, "now").mockReturnValue(100);
    revoke.mockImplementation(async scope => {
      if (kind === "wall-expiry") vi.setSystemTime(start + 60001);
      if (kind === "wall-rollback") vi.setSystemTime(start - 1);
      if (kind === "monotonic") clock.mockReturnValue(60101);
      return receipt(scope);
    });
    await expect(read()).rejects.toThrow(ERROR); expect(execute).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
  });
  it("has no ambient credentials, issuer implementation or formal runtime installation", () => {
    const code = readFileSync(new URL("./communication-note-workspace-task-lease.server.ts", import.meta.url), "utf8");
    expect(code).not.toMatch(/process\.env|console\.|fetch\(|from ["']pg["']|create role|grant |secret-manager|@google-cloud/);
    const runtime = readFileSync(new URL("./communication-note-workspace-runtime.server.ts", import.meta.url), "utf8");
    expect(runtime).toContain("HOSTED_WORKSPACE_READ_BINDING = undefined as CommunicationNoteWorkspacePreviewBinding");
    expect(runtime).not.toContain("createCommunicationNoteTaskLeaseReadPort");
  });
});
