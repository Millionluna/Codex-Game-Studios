import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommunicationNoteTaskPgReadPort, createTestOnlyCommunicationNoteTaskUnixReadPort,
  COMMUNICATION_NOTE_TASK_POSTGRES_READY, COMMUNICATION_NOTE_TASK_READ_TIMEOUT_MS } from "./communication-note-workspace-task-postgres.server";
import { COMMUNICATION_NOTE_JOB_LIST_SQL } from "./v1/communication-note-job-list-repository.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ clients: [] as FakeClient[],
  query: undefined as undefined | ((client: FakeClient, sql: string, values?: unknown[]) => Promise<unknown>),
  connect: undefined as undefined | ((client: FakeClient) => Promise<void>),
  realpath: vi.fn(async (path: string) => path) }));
vi.mock("node:fs/promises", () => ({ realpath: h.realpath }));
type Config = Record<string, unknown>;
class FakeClient {
  config: Config; password: unknown; connectionParameters: { password: unknown };
  calls: { sql: string; values?: unknown[] }[] = [];
  connection = { stream: { destroy: vi.fn(() => { this.pendingReject?.(new Error("PRIVATE_TRANSPORT_ERROR")); }), encrypted: true, authorized: true } };
  pendingReject?: (reason: unknown) => void;
  end = vi.fn(async () => {});
  on = vi.fn(() => this);
  constructor(config: Config) { this.config = config; this.password = config.password;
    this.connectionParameters = { password: config.password }; h.clients.push(this); }
  async connect() { await h.connect?.(this); }
  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (h.query) { const override = await h.query(this, sql, values); if (override !== undefined) return override; }
    if (sql.includes("as safe")) return { rows: [{ pid: 100 + h.clients.indexOf(this), start: "2026-09-08T00:00:00.123456Z",
      login: this.config.user, current: this.config.user, major: this.config.ssl === false ? 16 : 17,
      database: "postgres", safe: true, unix_only: true, cluster: "careslink-review-browser-pg16" }] };
    if (sql === "select current_user::text as role") return { rows: [{ role: "careslink_v1_generation_job_list_caller" }] };
    if (sql.includes("pg_terminate_backend")) return { rows: [{ terminated: true }] };
    if (sql.includes("as remaining")) return { rows: [{ remaining: 0 }] };
    if (sql === COMMUNICATION_NOTE_JOB_LIST_SQL) return { rows: [{ data: { tasks: [], nextCursor: null } }], command: "SELECT" };
    return { rows: [] };
  }
}
vi.mock("pg", () => ({ Client: class { constructor(config: Config) { return new FakeClient(config); } } }));
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REF = "abcdefghijklmnopqrst", CALLER = "careslink_v1_generation_job_list_caller";
const args = () => [USER, SESSION, null, null, 20, "1.0.0-shadow.1", "2026-08-09.v1-shadow"];
const signal = () => new AbortController().signal;
const input = () => ({ projectRef: REF, principal: { userId: USER, sessionId: SESSION, transport: "COOKIE" as const },
  credential: { role: "careslink_v1_job_list_runtime_0123456789abcdef", password: "p".repeat(43), deliveryExpiresAt: new Date(Date.now() + 60000).toISOString() },
  ca: Buffer.from("synthetic-CA"), caSha256: createHash("sha256").update("synthetic-CA").digest("hex") });
const read = (values = args(), s = signal()) => createCommunicationNoteTaskPgReadPort(input()).execute(values, { signal: s });
const waitFor = async (predicate: () => boolean) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await Promise.resolve(); }
  throw new Error("TEST_PROGRESS_MISSING"); };
const assertClosed = () => { for (const client of h.clients) {
  expect(client.end).toHaveBeenCalledTimes(1); expect(client.connection.stream.destroy).toHaveBeenCalledTimes(1);
  expect(client.password).toBeUndefined(); expect(client.connectionParameters.password).toBeUndefined(); expect(client.config.password).toBeUndefined();
} };

describe("task-list physical connection and independent cleanup", () => {
  beforeEach(() => { h.clients.length = 0; h.query = undefined; h.connect = undefined; h.realpath.mockImplementation(async path => path); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("remains unbound and exposes only the four task purpose port fields", async () => {
    expect(COMMUNICATION_NOTE_TASK_POSTGRES_READY).toBe(false);
    const port = createCommunicationNoteTaskPgReadPort(input());
    expect(Object.keys(port).sort()).toEqual(["callerRole", "execute", "projectRef", "purpose"]);
    expect(h.clients).toHaveLength(0);
    expect(port).toMatchObject({ projectRef: REF, callerRole: CALLER, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ" });
    expect(JSON.stringify(port)).not.toContain("pppp");
    expect(await port.execute(args(), { signal: signal() })).toEqual({ rows: [{ data: { tasks: [], nextCursor: null } }] });
    assertClosed();
  });
  it("uses two fresh direct TLS clients, no ambient credential/host/SSL defaults", async () => {
    vi.stubEnv("PGHOST", "untrusted.invalid"); vi.stubEnv("PGUSER", "postgres"); vi.stubEnv("PGPASSWORD", "ambient-secret");
    vi.stubEnv("PGDATABASE", "untrusted"); vi.stubEnv("PGSSLMODE", "disable");
    await read(); expect(h.clients).toHaveLength(2);
    for (const c of h.clients) expect(c.config).toMatchObject({ host: `db.${REF}.supabase.co`, port: 5432, database: "postgres",
      user: input().credential.role, ssl: { rejectUnauthorized: true, ca: Buffer.from("synthetic-CA") },
      connectionTimeoutMillis: 1500, lock_timeout: 1000, idle_in_transaction_session_timeout: 5000, keepAlive: false });
    expect(h.clients[0].config.application_name).toMatch(/^cl-task-clean-[a-f0-9]{32}$/);
    expect(h.clients[1].config.application_name).toMatch(/^cl-task-read-[a-f0-9]{32}$/);
    expect(h.clients[0].calls.some(c => c.sql.startsWith("set role"))).toBe(false);
    expect(h.clients[1].calls.find(c => c.sql === COMMUNICATION_NOTE_JOB_LIST_SQL)?.values).toEqual(args());
    expect(h.clients.flatMap(c => c.calls).some(c => /begin|create role|grant |insert |update |delete /i.test(c.sql))).toBe(false);
  });
  it("binds cleanup to exact login, nonce, PID AND microsecond backend start", async () => {
    await read(); const cleanup = h.clients[0].calls.filter(c => c.sql.includes("pg_stat_activity") && !c.sql.includes("as safe"));
    expect(cleanup).toHaveLength(2);
    expect(cleanup[0].sql).toContain("pg_terminate_backend(pid,1000)");
    for (const q of cleanup) {
      expect(q.sql).toContain("usename=session_user"); expect(q.sql).toContain("datname=pg_catalog.current_database()");
      expect(q.sql).toContain("pid=$3 and backend_start=$4::timestamptz");
      expect(q.values).toEqual([input().credential.role, h.clients[1].config.application_name, 101, "2026-09-08T00:00:00.123456Z"]);
    }
  });
  it("captures principal, CA and credential before caller mutation", async () => {
    const original = input(), port = createCommunicationNoteTaskPgReadPort(original);
    original.principal.userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    original.credential.role = "postgres"; original.credential.password = "changed"; original.ca.fill(0);
    await port.execute(args(), { signal: signal() });
    expect(h.clients[1].config.user).toBe("careslink_v1_job_list_runtime_0123456789abcdef");
    expect(h.clients[1].config.ssl).toMatchObject({ ca: Buffer.from("synthetic-CA") });
  });
  it.each(["production", "bad-ref", "bad-ca", "bad-hash", "privileged", "status-purpose", "password", "expiry", "long-expiry", "principal", "extra", "getter", "proxy"])("rejects invalid factory %s before I/O", kind => {
    // Keep the +1ms expiry boundary from becoming valid before factory validation.
    vi.useFakeTimers();
    const v = input();
    if (kind === "production") v.projectRef = CARESLINK_PRODUCTION_SUPABASE_REF;
    if (kind === "bad-ref") v.projectRef = "example.invalid";
    if (kind === "bad-ca") v.ca = Buffer.alloc(0);
    if (kind === "bad-hash") v.caSha256 = "0".repeat(64);
    if (kind === "privileged") v.credential.role = "postgres";
    if (kind === "status-purpose") v.credential.role = "careslink_v1_job_status_runtime_0123456789abcdef";
    if (kind === "password") v.credential.password = "short";
    if (kind === "expiry") v.credential.deliveryExpiresAt = new Date(Date.now() - 1).toISOString();
    if (kind === "long-expiry") v.credential.deliveryExpiresAt = new Date(Date.now() + 90001).toISOString();
    if (kind === "principal") v.principal.sessionId = "invalid";
    if (kind === "extra") Object.assign(v, { host: "other.invalid" });
    if (kind === "getter") Object.defineProperty(v.credential, "password", { enumerable: true, get() { throw new Error("NEVER_INVOKE"); } });
    expect(() => createCommunicationNoteTaskPgReadPort(kind === "proxy" ? new Proxy(v, {}) : v)).toThrow("Task list PostgreSQL dependency unavailable");
    expect(h.clients).toHaveLength(0);
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])("rejects fixed query parameter tampering %s with no connection", async kind => {
    const v: unknown[] = args();
    if (kind < 7) v[kind] = "tampered";
    if (kind === 7) v.push("extra");
    if (kind === 8) Object.defineProperty(v, "0", { enumerable: true, get() { throw new Error("NEVER_INVOKE"); } });
    const port = createCommunicationNoteTaskPgReadPort(input());
    await expect(port.execute(kind === 9 ? new Proxy(v, {}) : v, { signal: signal() })).rejects.toThrow("Task list PostgreSQL dependency unavailable");
    await expect(port.execute(args(), { signal: signal() })).rejects.toThrow(); expect(h.clients).toHaveLength(0);
  });
  it("rejects reuse and concurrent execution without additional connections", async () => {
    const port = createCommunicationNoteTaskPgReadPort(input());
    const first = port.execute(args(), { signal: signal() });
    await expect(port.execute(args(), { signal: signal() })).rejects.toThrow(); await first;
    await expect(port.execute(args(), { signal: signal() })).rejects.toThrow(); expect(h.clients).toHaveLength(2);
  });
  it("does no I/O for pre-aborted requests or expired unused delivery", async () => {
    const controller = new AbortController(); controller.abort(); await expect(read(args(), controller.signal)).rejects.toThrow();
    vi.useFakeTimers(); const port = createCommunicationNoteTaskPgReadPort(input()); await vi.advanceTimersByTimeAsync(60001);
    await expect(port.execute(args(), { signal: signal() })).rejects.toThrow(); expect(h.clients).toHaveLength(0);
  });
  it.each(["login", "current", "major", "database", "safe", "pid", "start", "TLS"])("rejects physical attestation %s without issuing read", async kind => {
    h.query = async (client, sql) => { if (!sql.includes("as safe")) return;
      const row: Config = { pid: 100, start: "2026-09-08T00:00:00.123456Z", login: input().credential.role,
        current: input().credential.role, major: 17, database: "postgres", safe: true };
      row[kind] = kind === "safe" ? false : kind === "pid" ? -1 : "wrong";
      if (kind === "TLS") client.connection.stream.authorized = false;
      return { rows: [row] };
    };
    if (kind === "TLS") h.connect = async client => { client.connection.stream.authorized = false; };
    await expect(read()).rejects.toThrow(); expect(h.clients).toHaveLength(1); assertClosed();
    expect(h.clients[0].calls.some(c => c.sql === COMMUNICATION_NOTE_JOB_LIST_SQL)).toBe(false);
  });
  it("refuses to dispatch if SET ROLE readback is wrong", async () => {
    h.query = async (_c, sql) => sql === "select current_user::text as role" ? { rows: [{ role: "postgres" }] } : undefined;
    await expect(read()).rejects.toThrow(); expect(h.clients[1].calls.some(c => c.sql === COMMUNICATION_NOTE_JOB_LIST_SQL)).toBe(false); assertClosed();
  });
  it.each([0, 1])("closes both resources after connection failure at client %s", async index => {
    h.connect = async client => { if (h.clients.indexOf(client) === index) throw new Error("SECRET_CONNECT_FAILURE"); };
    await expect(read()).rejects.toThrow("Task list PostgreSQL dependency unavailable"); assertClosed();
  });
  it("aborts a pending main connection and cleans by nonce even before PID is known", async () => {
    const controller = new AbortController();
    h.connect = async client => { if (h.clients.indexOf(client) === 1) await new Promise<void>((_r, reject) => { client.pendingReject = reject; }); };
    const promise = read(args(), controller.signal); const rejected = expect(promise).rejects.toThrow();
    await waitFor(() => !!h.clients[1]?.pendingReject); controller.abort(); await rejected;
    expect(h.clients[0].calls.find(c => c.sql.includes("pg_terminate_backend"))?.values?.slice(2)).toEqual([null, null]); assertClosed();
    expect(h.clients[1].calls).toHaveLength(0);
  });
  it("does not start a read after observer connect settles after cancellation", async () => {
    let finish: () => void = () => {}; const controller = new AbortController();
    h.connect = async () => new Promise<void>(resolve => { finish = resolve; });
    const promise = read(args(), controller.signal), rejected = expect(promise).rejects.toThrow();
    await waitFor(() => h.clients.length === 1); controller.abort(); finish(); await rejected;
    expect(h.clients).toHaveLength(1); expect(h.clients[0].calls).toHaveLength(0); assertClosed();
  });
  it("cancels a blocked query but waits for independent verified cleanup", async () => {
    let finishCleanup: () => void = () => {}; let cleanupStarted = false;
    const controller = new AbortController();
    h.query = async (client, sql) => {
      if (sql === COMMUNICATION_NOTE_JOB_LIST_SQL) await new Promise((_r, reject) => { client.pendingReject = reject; });
      if (sql.includes("pg_terminate_backend")) { cleanupStarted = true; await new Promise<void>(resolve => { finishCleanup = resolve; }); }
    };
    let settled = false; const promise = Promise.resolve(read(args(), controller.signal)); void promise.catch(() => { settled = true; });
    await waitFor(() => !!h.clients[1]?.pendingReject); controller.abort(); await waitFor(() => cleanupStarted);
    expect(settled).toBe(false); expect(h.clients[0].end).not.toHaveBeenCalled(); finishCleanup();
    await expect(promise).rejects.toThrow(); assertClosed();
  });
  it("enforces the physical read deadline and still verifies cleanup", async () => {
    vi.useFakeTimers(); h.query = async (c, sql) => { if (sql === COMMUNICATION_NOTE_JOB_LIST_SQL)
      await new Promise((_r, reject) => { c.pendingReject = reject; }); };
    const promise = read(), rejected = expect(promise).rejects.toThrow();
    await waitFor(() => !!h.clients[1]?.pendingReject); await vi.advanceTimersByTimeAsync(COMMUNICATION_NOTE_TASK_READ_TIMEOUT_MS); await rejected;
    expect(h.clients[0].calls.some(c => c.sql.includes("as remaining"))).toBe(true); assertClosed(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["terminate-false", "residue", "cleanup-error", "cleanup-timeout"])("withholds successful metadata on %s", async kind => {
    vi.useFakeTimers(); h.query = async (c, sql) => {
      if (sql.includes("pg_terminate_backend")) {
        if (kind === "terminate-false") return { rows: [{ terminated: false }] };
        if (kind === "cleanup-error") throw new Error("PRIVATE_CLEANUP_ERROR");
        if (kind === "cleanup-timeout") await new Promise((_r, reject) => { c.pendingReject = reject; });
      }
      if (sql.includes("as remaining") && kind === "residue") return { rows: [{ remaining: 1 }] };
    };
    const promise = read(), rejected = expect(promise).rejects.toThrow("Task list PostgreSQL dependency unavailable");
    if (kind === "cleanup-timeout") { await waitFor(() => !!h.clients[0]?.pendingReject); await vi.advanceTimersByTimeAsync(4500); }
    await rejected; assertClosed(); expect(vi.getTimerCount()).toBe(0);
  });
  it("only preserves exact SESSION_REVOKED after successful cleanup", async () => {
    h.query = async (_c, sql) => { if (sql === COMMUNICATION_NOTE_JOB_LIST_SQL)
      throw Object.assign(new Error("SESSION_REVOKED"), { code: "P0001", detail: "PRIVATE_DETAIL" }); };
    await expect(read()).rejects.toMatchObject({ message: "SESSION_REVOKED", code: "P0001" }); assertClosed();
    h.query = async (_c, sql) => {
      if (sql === COMMUNICATION_NOTE_JOB_LIST_SQL) throw Object.assign(new Error("SESSION_REVOKED"), { code: "P0001" });
      if (sql.includes("as remaining")) return { rows: [{ remaining: 1 }] };
    };
    await expect(read()).rejects.toThrow("Task list PostgreSQL dependency unavailable");
  });
  it("discards metadata when abort arrives during successful cleanup", async () => {
    const controller = new AbortController(); h.query = async (_c, sql) => { if (sql.includes("as remaining")) controller.abort(); };
    await expect(read(args(), controller.signal)).rejects.toThrow(); assertClosed();
  });
  it("supports only the exact owned local Unix socket and attested PG16 cluster", async () => {
    const { ca: _ca, caSha256: _hash, ...v } = input(); void _ca; void _hash;
    const local = { ...v, socket: "/private/tmp/cl-job-browser-abc123/pg/socket", port: 15437 as const };
    await createTestOnlyCommunicationNoteTaskUnixReadPort(local).execute(args(), { signal: signal() }); assertClosed();
    expect(() => createTestOnlyCommunicationNoteTaskUnixReadPort({ ...local, socket: "/tmp/socket" })).toThrow();
    h.realpath.mockResolvedValue("/private/tmp/symlink-target");
    await expect(createTestOnlyCommunicationNoteTaskUnixReadPort(local).execute(args(), { signal: signal() })).rejects.toThrow();
    expect(h.clients).toHaveLength(2);
  });
});
