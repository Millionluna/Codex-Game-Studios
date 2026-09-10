import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkServerIdentity } from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientConfig } from "pg";
import { createTaskPreviewPgControlOpener, COMMUNICATION_NOTE_TASK_PREVIEW_CONTROL_READY,
  TASK_PREVIEW_CONTROL_APPLICATION, TASK_PREVIEW_CONTROL_IDENTITY_SQL,
  type TaskPreviewControlCustody, type TaskPreviewControlCredential } from "./communication-note-task-preview-control.server";
import { createTaskPreviewSqlBroker, TASK_PREVIEW_ISSUER_SQL,
  createCommunicationNoteTaskPreviewIssuer } from "./communication-note-task-preview-issuer.server";
import { createCommunicationNoteTaskPreviewService } from "./communication-note-task-preview-service.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PARENT } from "./v1/ndis-shadow-guard";

const driver = vi.hoisted(() => ({ construct: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Client: class { constructor(config: ClientConfig) { return driver.construct(config); } } }));
const REF = "abcdefghijklmnopqrst", BRANCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", CA = Buffer.from("SYNTHETIC_CA_NOT_REAL");
const SHA = createHash("sha256").update(CA).digest("hex"), MESSAGE = "Task Preview control unavailable";
const URL = `https://api.supabase.com/v1/projects/${PARENT}/branches`, PURPOSE = "TASK_LIST_ISSUER_CONTROL_ONLY";
const PASSWORD = "SYNTHETIC_CONTROL_PASSWORD_NOT_REAL", TOKEN = "SYNTHETIC_OAUTH_TOKEN_NOT_REAL";
const ctx = () => ({ signal: new AbortController().signal });
const token = () => ({ accessToken: TOKEN, scope: "environment:read" as const, expiresAt: new Date(Date.now() + 60000).toISOString() });
const branch = () => ({ id: BRANCH, project_ref: REF, parent_project_ref: PARENT, is_default: false, persistent: false,
  with_data: false, status: "FUNCTIONS_DEPLOYED", preview_project_status: "ACTIVE_HEALTHY", deletion_scheduled_at: null });
const identity = () => ({ login: "postgres", current: "postgres", database: "postgres", major: 17, prepared: 0,
  operator: true, isolation: "read committed", readOnly: "off", searchPath: "" });
const values = (operation = "start") => [operation, JSON.stringify({ projectRef: REF, epoch: "e".repeat(32), scope: { projectRef: REF } })];
function response(rows: unknown = [branch()], options: { status?: number; url?: string; headers?: Record<string, string> } = {}) {
  const result = new Response(JSON.stringify(rows), { status: options.status ?? 200,
    headers: { "content-type": "application/json", ...options.headers } });
  Object.defineProperty(result, "url", { value: options.url ?? URL }); return result;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
function client(config: ClientConfig) {
  const connection = Object.assign(new EventEmitter(), { stream: { encrypted: true, authorized: true, destroy: vi.fn() } });
  return Object.assign(new EventEmitter(), { connection, password: config.password,
    connectionParameters: { password: config.password, replication: "ambient", binary: "ambient" },
    connect: vi.fn(async () => { connection.emit("readyForQuery", { status: "I" }); }),
    end: vi.fn(async () => {}),
    query: vi.fn< (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> >(async (sql, params) => {
      connection.emit("readyForQuery", { status: "I" });
      return { rows: sql === TASK_PREVIEW_CONTROL_IDENTITY_SQL ? [identity()] : [{ data: { operation: params?.[0] } }] };
    }),
  });
}
function setup() {
  const clients: ReturnType<typeof client>[] = [];
  driver.construct.mockImplementation((config: ClientConfig) => { const c = client(config); clients.push(c); return c; });
  const access = vi.fn<TaskPreviewControlCustody["consumeAccessToken"]>(async (_context, consume) => { await consume(token()); });
  const database = vi.fn<TaskPreviewControlCustody["consumeDatabaseCredential"]>(async (target, _context, consume) => {
    await consume({ projectRef: target.projectRef, branchId: target.branchId, purpose: target.purpose,
      controlPlaneEvidenceSha256: target.controlPlaneEvidenceSha256, password: PASSWORD,
      deliveryExpiresAt: new Date(Date.now() + 60000).toISOString(), credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
      sourceExpiresAt: null, sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" });
  });
  const custody = { consumeAccessToken: access, consumeDatabaseCredential: database };
  const createCustody = vi.fn<(context: { signal: AbortSignal }) => Promise<TaskPreviewControlCustody>>(async () => custody);
  const input = { projectRef: REF, branchId: BRANCH, ca: Buffer.from(CA), caSha256: SHA, createCustody };
  const open = createTaskPreviewPgControlOpener(input);
  return { input, open, clients, custody, createCustody, access, database };
}
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockImplementation(async () => response()); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("dedicated task Preview control — offline transport and custody", () => {
  it("constructs without IO and keeps the formal runtime uninstalled", () => {
    setup(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_CONTROL_READY).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled(); expect(driver.construct).not.toHaveBeenCalled();
  });
  it("attests the exact branch before custody, opens fixed pinned TLS and consumes one autocommit operation", async () => {
    const h = setup(), port = await h.open(ctx()), c = h.clients[0], config = driver.construct.mock.calls[0][0];
    expect(fetchMock).toHaveBeenCalledWith(URL, expect.objectContaining({ method: "GET", redirect: "error", cache: "no-store", credentials: "omit",
      headers: { authorization: `Bearer ${TOKEN}`, accept: "application/json" } }));
    expect(h.database.mock.invocationCallOrder[0]).toBeGreaterThan(fetchMock.mock.invocationCallOrder[0]);
    expect(h.database.mock.calls[0][0]).toMatchObject({ projectRef: REF, branchId: BRANCH, purpose: PURPOSE, caSha256: SHA });
    expect(config).toMatchObject({ host: `db.${REF}.supabase.co`, port: 5432, database: "postgres", user: "postgres",
      application_name: TASK_PREVIEW_CONTROL_APPLICATION, sslnegotiation: "postgres", enableChannelBinding: true,
      ssl: { ca: CA, rejectUnauthorized: true, servername: `db.${REF}.supabase.co`, minVersion: "TLSv1.2", checkServerIdentity } });
    expect(config.options).toContain("default_transaction_isolation=read\\ committed");
    expect(config).not.toHaveProperty("connectionString");
    expect(c.connectionParameters).toEqual({ password: undefined, replication: false, binary: false });
    expect(c.password).toBeUndefined(); expect(config.password).toBeUndefined();
    expect(await port.query(TASK_PREVIEW_ISSUER_SQL, values())).toEqual({ rows: [{ data: { operation: "start" } }] });
    expect(c.query.mock.calls.map(call => call[0])).toEqual([TASK_PREVIEW_CONTROL_IDENTITY_SQL, TASK_PREVIEW_ISSUER_SQL]);
    expect(c.end).toHaveBeenCalledTimes(1); expect(c.connection.stream.destroy).toHaveBeenCalled();
    await port.close(); await port.close(); expect(c.end).toHaveBeenCalledTimes(1);
  });
  it("uses a fresh branch check, custody and connection for all six broker operations", async () => {
    const h = setup(), broker = createTaskPreviewSqlBroker(h.open);
    for (const op of ["start", "inventory", "ready", "issue", "fence", "finalize"] as const) {
      expect(await broker.call(op, { projectRef: REF, scope: { projectRef: REF } }, ctx())).toEqual({ operation: op });
    }
    expect(fetchMock).toHaveBeenCalledTimes(6); expect(h.createCustody).toHaveBeenCalledTimes(6);
    expect(h.database).toHaveBeenCalledTimes(6); expect(h.clients).toHaveLength(6);
    for (const c of h.clients) expect(c.end).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("composes the real issuer/broker/connector with protocol-only SQL responses (abort=%s)", async abortIssue => {
    const h = setup(), parent = new AbortController(), operations: string[] = [];
    // Only the external HTTP/custody/pg interfaces are fake. This models replies,
    // NOT real role creation, transaction commits or hosted recovery supervision.
    let lease: Record<string, unknown> | undefined;
    driver.construct.mockImplementation(config => {
      const c = client(config), original = c.query.getMockImplementation()!; h.clients.push(c);
      c.query.mockImplementation(async (sql, args) => {
        if (sql === TASK_PREVIEW_CONTROL_IDENTITY_SQL) return original(sql, args);
        const [op, payload] = args as string[], data = JSON.parse(payload); operations.push(op);
        let reply;
        if (op === "start" || op === "ready") reply = { projectRef: REF, epoch: data.epoch, ready: op === "ready" };
        else if (op === "inventory") reply = { projectRef: REF, epoch: data.epoch, leases: [] };
        else {
          if (op === "issue") lease = { scope: data.scope, state: "ISSUED", role: data.role, expiresAt: data.expiresAt,
            roleCount: 1, sessionCount: 0, membershipCount: 2 };
          if (op === "fence") lease = { ...lease, state: "FENCED" };
          if (op === "finalize") lease = { ...lease, state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 };
          reply = lease;
        }
        c.connection.emit("readyForQuery", { status: "I" });
        if (op === "issue" && abortIssue) parent.abort();
        return { rows: [{ data: reply }] };
      }); return c;
    });
    const service = createCommunicationNoteTaskPreviewIssuer({ projectRef: REF, broker: createTaskPreviewSqlBroker(h.open) });
    await service.recover(ctx());
    const scope = { requestId: "f".repeat(32), projectRef: REF, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ" as const,
      callerRole: "careslink_v1_generation_job_list_caller" as const,
      principal: { userId: BRANCH, sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" as const } };
    if (abortIssue) await expect(service.custody.issue(scope, { signal: parent.signal })).rejects.toThrow("Task Preview issuer unavailable");
    else {
      const delivered = await service.custody.issue(scope, { signal: parent.signal });
      expect(delivered.credential.password).not.toBe(PASSWORD); expect(delivered.credential.role).toMatch(/^careslink_v1_job_list_runtime_/);
      expect(await service.custody.revoke(scope, ctx())).toEqual({ ...scope, status: "REVOKED" });
    }
    expect(operations).toEqual(["start", "inventory", "ready", "issue", "fence", "finalize"]);
    expect(lease?.state).toBe("REVOKED"); expect(h.clients).toHaveLength(6);
    for (const c of h.clients) expect(c.end).toHaveBeenCalledTimes(1);
  });
  it("copies CA and snapshots callbacks without discovering ambient connections", async () => {
    const h = setup(); h.input.ca.fill(0); h.input.createCustody = vi.fn(() => { throw new Error("MUTATED"); });
    for (const name of ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE", "PGOPTIONS", "PGSSLNEGOTIATION", "PGREPLICATION", "PGBINARY", "DATABASE_URL"])
      vi.stubEnv(name, "FOREIGN_AMBIENT_SECRET");
    const port = await h.open(ctx());
    expect(driver.construct.mock.calls[0][0].ssl.ca).toEqual(CA); expect(h.input.createCustody).not.toHaveBeenCalled();
    expect(JSON.stringify(driver.construct.mock.calls[0][0])).not.toContain("FOREIGN_AMBIENT_SECRET"); await port.close();
  });
  it.each([false, true])("composes service/issuer/broker/control with offline IO and confirmed shutdown (abort=%s)", async abortIssue => {
    const h = setup(), parent = new AbortController(), operations: string[] = [];
    let lease: Record<string, unknown> | undefined;
    driver.construct.mockImplementation(config => {
      const c = client(config), original = c.query.getMockImplementation()!; h.clients.push(c);
      c.query.mockImplementation(async (sql, args) => {
        if (sql === TASK_PREVIEW_CONTROL_IDENTITY_SQL) return original(sql, args);
        const [op, payload] = args as string[], data = JSON.parse(payload); operations.push(op);
        let reply;
        if (op === "start" || op === "ready") reply = { projectRef: REF, epoch: data.epoch, ready: op === "ready" };
        else if (op === "inventory") reply = { projectRef: REF, epoch: data.epoch,
          leases: lease && lease.state !== "REVOKED" ? [{ scope: lease.scope, state: lease.state, expiresAt: lease.expiresAt }] : [] };
        else {
          if (op === "issue") lease = { scope: data.scope, state: "ISSUED", role: data.role, expiresAt: data.expiresAt,
            roleCount: 1, sessionCount: 0, membershipCount: 2 };
          if (op === "fence") lease = { ...lease, state: "FENCED" };
          if (op === "finalize") lease = { ...lease, state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 };
          reply = lease;
        }
        c.connection.emit("readyForQuery", { status: "I" });
        if (op === "issue" && abortIssue) parent.abort();
        return { rows: [{ data: reply }] };
      }); return c;
    });
    const service = createCommunicationNoteTaskPreviewService({ projectRef: REF, broker: createTaskPreviewSqlBroker(h.open) });
    try {
      await service.start();
      const input = { requestId: "f".repeat(32), projectRef: REF, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ" as const,
        callerRole: "careslink_v1_generation_job_list_caller" as const,
        principal: { userId: BRANCH, sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" as const } };
      if (abortIssue) {
        await expect(service.custody.issue(input, { signal: parent.signal })).rejects.toThrow("Task Preview service unavailable");
        expect(await service.finished).toEqual({ state: "FAILED", cleanupConfirmed: true });
      } else {
        await service.custody.issue(input, { signal: parent.signal });
        expect(await service.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true });
      }
      expect(lease?.state).toBe("REVOKED"); expect(operations.filter(op => op === "start")).toHaveLength(1);
      expect(operations).toHaveLength(7); expect(h.clients).toHaveLength(7);
      for (const c of h.clients) expect(c.end).toHaveBeenCalledTimes(1);
    } finally { await service.stop(); }
  });
  it("pins real pg 8.23.0 startup parameters offline, with connect/query/end replaced before use", async () => {
    const h = setup(), { Client: PgClient } = await vi.importActual<typeof import("pg")>("pg");
    for (const name of ["PGREPLICATION", "PGBINARY", "PGOPTIONS", "PGSSLMODE", "PGSSLNEGOTIATION", "PGAPPNAME"])
      vi.stubEnv(name, "FOREIGN_AMBIENT_SECRET");
    let startup: (() => Record<string, unknown>) | undefined;
    driver.construct.mockImplementation(config => {
      // The real constructor creates an unconnected Socket. Every IO method is
      // replaced here BEFORE the production opener can use the instance.
      const c = new PgClient(config), internals = c as unknown as { getStartupConf(): Record<string, unknown>; connection: EventEmitter & { stream: object } };
      Object.assign(internals.connection.stream, { encrypted: true, authorized: true }); // TLS flags are mocked, not a handshake.
      startup = () => internals.getStartupConf();
      c.connect = vi.fn(async () => { internals.connection.emit("readyForQuery", { status: "I" }); return c; }) as typeof c.connect;
      c.query = vi.fn(async () => { internals.connection.emit("readyForQuery", { status: "I" }); return { rows: [identity()] }; }) as unknown as typeof c.query;
      c.end = vi.fn(async () => {}); return c;
    });
    const port = await h.open(ctx()), data = startup!();
    expect(data).toMatchObject({ user: "postgres", database: "postgres", application_name: TASK_PREVIEW_CONTROL_APPLICATION });
    expect(data).not.toHaveProperty("replication"); expect(JSON.stringify(data)).not.toContain("FOREIGN_AMBIENT_SECRET"); await port.close();
  });
  it.each([
    { projectRef: PARENT }, { projectRef: REF + "\n" }, { branchId: "foreign" }, { ca: Buffer.alloc(0) },
    { ca: Buffer.alloc(65537) }, { caSha256: "0".repeat(64) }, { caSha256: SHA + "\n" },
    { createCustody: null }, { connectionString: "postgres://foreign" }, { open: () => {} },
  ])("rejects malformed or widened installation %j", change => {
    const h = setup(); expect(() => createTaskPreviewPgControlOpener({ ...h.input, ...change } as never)).toThrow(MESSAGE);
    expect(h.createCustody).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects Proxy/accessor installation without executing it", () => {
    const h = setup(), getter = vi.fn(); Object.defineProperty(h.input, "projectRef", { get: getter });
    expect(() => createTaskPreviewPgControlOpener(h.input)).toThrow(MESSAGE);
    expect(() => createTaskPreviewPgControlOpener(new Proxy(h.input, {}))).toThrow(MESSAGE); expect(getter).not.toHaveBeenCalled();
  });
  it.each([
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, { parent_project_ref: REF }, { is_default: true }, { persistent: true },
    { with_data: true }, { preview_project_status: "INACTIVE" }, { preview_project_status: undefined },
    { status: "CREATING_PROJECT" }, { deletion_scheduled_at: "2026-09-10T00:00:00Z" },
  ])("rejects changed branch posture %j before database custody", async change => {
    const h = setup(); fetchMock.mockResolvedValue(response([{ ...branch(), ...change }]));
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(h.database).not.toHaveBeenCalled(); expect(driver.construct).not.toHaveBeenCalled();
  });
  it.each([[], [branch(), branch()], { branches: [branch()] }, Array.from({ length: 1001 }, () => ({}))])("rejects ambiguous or unbounded branch inventories", async rows => {
    const h = setup(); fetchMock.mockResolvedValue(response(rows)); await expect(h.open(ctx())).rejects.toThrow(MESSAGE);
    expect(h.database).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500])("does not retry HTTP %s or consult database custody", async status => {
    const h = setup(); fetchMock.mockResolvedValue(response({ privateError: PASSWORD }, { status }));
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(fetchMock).toHaveBeenCalledTimes(1); expect(h.database).not.toHaveBeenCalled();
  });
  it.each(["origin", "redirect", "content type", "content length", "stream bytes", "JSON"])("rejects invalid HTTP %s", async fault => {
    const h = setup(); let r = response();
    if (fault === "origin") r = response(undefined, { url: "https://foreign.invalid" });
    if (fault === "redirect") Object.defineProperty(r, "redirected", { value: true });
    if (fault === "content type") r = response(undefined, { headers: { "content-type": "text/html" } });
    if (fault === "content length") r = response(undefined, { headers: { "content-length": "131073" } });
    if (fault === "stream bytes") r = response([{ ...branch(), ignored: "x".repeat(131073) }]);
    if (fault === "JSON") { r = new Response("not-json", { headers: { "content-type": "application/json" } }); Object.defineProperty(r, "url", { value: URL }); }
    fetchMock.mockResolvedValue(r); await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(h.database).not.toHaveBeenCalled();
  });
  it("revalidates the target for independent cleanup, not the old page's signal", async () => {
    const h = setup(), first = new AbortController(), port = await h.open({ signal: first.signal }); first.abort(); await port.close();
    const next = await h.open(ctx());
    expect(h.createCustody).toHaveBeenCalledTimes(2); expect(h.createCustody.mock.calls[1][0].signal.aborted).toBe(false);
    await next.query(TASK_PREVIEW_ISSUER_SQL, values("fence")); await next.close();
    fetchMock.mockResolvedValue(response([{ ...branch(), with_data: true }]));
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(h.database).toHaveBeenCalledTimes(2);
  });
  it.each(["wrong scope", "expired", "extra secret", "accessor"])("rejects malformed OAuth delivery: %s", async fault => {
    const h = setup(), raw = token(), getter = vi.fn();
    if (fault === "wrong scope") raw.scope = "all" as never;
    if (fault === "expired") raw.expiresAt = new Date().toISOString();
    if (fault === "extra secret") Object.assign(raw, { password: PASSWORD });
    if (fault === "accessor") Object.defineProperty(raw, "accessToken", { get: getter });
    h.access.mockImplementation(async (_context, use) => { await use(raw); });
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(fetchMock).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled();
  });
  it.each([
    { projectRef: PARENT }, { branchId: "foreign" }, { purpose: "JOB_STATUS_ISSUER_CONTROL_ONLY" }, { controlPlaneEvidenceSha256: "0".repeat(64) },
    { password: "short" }, { password: PASSWORD + "\n" }, { credentialClass: "EPHEMERAL_LOGIN" }, { sourceExpiresAt: "tomorrow" },
    { sourceRevocation: "DELIVERY_EXPIRY" }, { deliveryExpiresAt: "invalid" },
  ])("rejects incorrect control credential %j before connecting", async change => {
    const h = setup(), original = h.database.getMockImplementation()!;
    h.database.mockImplementation((target, context, use) => original(target, context, secret => use({ ...secret, ...change } as TaskPreviewControlCredential)));
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(driver.construct).not.toHaveBeenCalled();
  });
  it.each([0, 60001])("rejects expired/overlong %s ms credential delivery", async ms => {
    vi.useFakeTimers(); const h = setup(), original = h.database.getMockImplementation()!;
    h.database.mockImplementation((target, context, use) => original(target, context, secret => use({ ...secret, deliveryExpiresAt: new Date(Date.now() + ms).toISOString() })));
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(driver.construct).not.toHaveBeenCalled();
  });
  it.each(["never", "twice", "after failure"])("does not escape invalid database custody: %s", async mode => {
    const h = setup(), original = h.database.getMockImplementation()!;
    h.database.mockImplementation(async (target, context, use) => {
      if (mode === "never") return;
      await original(target, context, use);
      if (mode === "twice") await original(target, context, use);
      throw new Error(PASSWORD);
    });
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); for (const c of h.clients) expect(c.end).toHaveBeenCalledTimes(1);
  });
});

describe("physical control guard and cleanup — mocked pg 8.23.0", () => {
  function alter(h: ReturnType<typeof setup>, change: (c: ReturnType<typeof client>) => void) {
    driver.construct.mockImplementation(config => { const c = client(config); change(c); h.clients.push(c); return c; });
  }
  it.each(["encrypted", "authorized"] as const)("requires TLS %s before SQL", async field => {
    const h = setup(); alter(h, c => { c.connection.stream[field] = false; });
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(h.clients[0].query).not.toHaveBeenCalled(); expect(h.clients[0].end).toHaveBeenCalledTimes(1);
  });
  it.each([
    { login: "service_role" }, { current: "other" }, { database: "other" }, { major: 16 }, { prepared: 1 },
    { operator: false }, { isolation: "repeatable read" }, { readOnly: "on" }, { searchPath: "public" },
  ])("rejects unexpected control identity %j", async change => {
    const h = setup(); alter(h, c => { c.query.mockResolvedValue({ rows: [{ ...identity(), ...change }] }); });
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(h.clients[0].end).toHaveBeenCalledTimes(1);
  });
  it.each(["T", "E", "missing"])("rejects non-idle protocol status %s", async status => {
    const h = setup(); alter(h, c => { c.connect.mockImplementation(async () => { if (status !== "missing") c.connection.emit("readyForQuery", { status }); }); });
    await expect(h.open(ctx())).rejects.toThrow(MESSAGE); expect(h.clients[0].query).not.toHaveBeenCalled();
  });
  it.each(["SQL", "operation", "size", "target", "JSON"])("closes on non-allowlisted request %s", async fault => {
    const h = setup(), port = await h.open(ctx()), args = values(); let sql = TASK_PREVIEW_ISSUER_SQL;
    if (fault === "SQL") sql = "select 1";
    if (fault === "operation") args[0] = "acquire";
    if (fault === "size") args[1] = "x".repeat(8193);
    if (fault === "target") args[1] = JSON.stringify({ projectRef: PARENT });
    if (fault === "JSON") args[1] = "null";
    await expect(port.query(sql, args)).rejects.toThrow(MESSAGE); expect(h.clients[0].query).toHaveBeenCalledTimes(1); await port.close();
  });
  it("denies connection reuse after the first operation", async () => {
    const h = setup(), port = await h.open(ctx()); await port.query(TASK_PREVIEW_ISSUER_SQL, values());
    await expect(port.query(TASK_PREVIEW_ISSUER_SQL, values())).rejects.toThrow(MESSAGE);
    expect(h.clients[0].query).toHaveBeenCalledTimes(2); await port.close();
  });
  it("rejects accessor and Proxy parameters without invoking them", async () => {
    const h = setup(), getter = vi.fn(), args = values(); Object.defineProperty(args, 0, { get: getter });
    const a = await h.open(ctx()); await expect(a.query(TASK_PREVIEW_ISSUER_SQL, args)).rejects.toThrow(MESSAGE); await a.close();
    const b = await h.open(ctx()); await expect(b.query(TASK_PREVIEW_ISSUER_SQL, new Proxy(values(), {}))).rejects.toThrow(MESSAGE); await b.close();
    expect(getter).not.toHaveBeenCalled(); for (const c of h.clients) expect(c.query).toHaveBeenCalledTimes(1);
  });
  it("withholds results when the driver reports a non-autocommit completion", async () => {
    const h = setup(), port = await h.open(ctx()), c = h.clients[0];
    c.query.mockImplementation(async () => { c.connection.emit("readyForQuery", { status: "T" }); return { rows: [{ data: "uncommitted" }] }; });
    await expect(port.query(TASK_PREVIEW_ISSUER_SQL, values())).rejects.toThrow(MESSAGE); await port.close(); expect(c.end).toHaveBeenCalledTimes(1);
  });
  it("denies concurrent queries and withholds the in-flight result", async () => {
    const h = setup(), port = await h.open(ctx()), pending = deferred<{ rows: Record<string, unknown>[] }>();
    h.clients[0].query.mockReturnValue(pending.promise);
    const first = expect(port.query(TASK_PREVIEW_ISSUER_SQL, values())).rejects.toThrow(MESSAGE);
    await expect(port.query(TASK_PREVIEW_ISSUER_SQL, values())).rejects.toThrow(MESSAGE);
    pending.resolve({ rows: [{ data: "late" }] }); await first; await port.close();
  });
  it.each(["connect", "identity", "query", "close"])("sanitizes %s failure and erases client secret references", async stage => {
    const h = setup();
    alter(h, c => {
      if (stage === "connect") c.connect.mockRejectedValue(new Error(PASSWORD));
      if (stage === "identity") c.query.mockRejectedValue(new Error(PASSWORD));
      if (stage === "close") c.end.mockRejectedValue(new Error(PASSWORD));
    });
    if (["connect", "identity"].includes(stage)) await expect(h.open(ctx())).rejects.toThrow(MESSAGE);
    else { const port = await h.open(ctx()); if (stage === "query") h.clients[0].query.mockRejectedValue(new Error(PASSWORD));
      await expect(port.query(TASK_PREVIEW_ISSUER_SQL, values())).rejects.toThrow(MESSAGE); await port.close().catch(() => {}); }
    expect(h.clients[0].password).toBeUndefined(); expect(h.clients[0].connectionParameters.password).toBeUndefined();
    expect(h.clients[0].end).toHaveBeenCalledTimes(1);
  });
  it.each(["custody", "token", "HTTP", "body", "credential", "connect", "identity", "query"])("bounds stalled %s and owns late cleanup", async stage => {
    vi.useFakeTimers(); const h = setup();
    const never = new Promise<never>(() => {});
    if (stage === "custody") h.createCustody.mockReturnValue(never);
    if (stage === "token") h.access.mockReturnValue(never);
    if (stage === "HTTP") fetchMock.mockReturnValue(never);
    if (stage === "body") { const r = new Response(new ReadableStream({ pull: () => never }), { headers: { "content-type": "application/json" } });
      Object.defineProperty(r, "url", { value: URL }); fetchMock.mockResolvedValue(r); }
    if (stage === "credential") h.database.mockReturnValue(never);
    if (stage === "connect") alter(h, c => { c.connect.mockReturnValue(never); });
    if (stage === "identity") alter(h, c => { c.query.mockReturnValue(never); });
    let port;
    if (stage === "query") { port = await h.open(ctx()); h.clients[0].query.mockReturnValue(never); }
    const rejected = expect(port ? port.query(TASK_PREVIEW_ISSUER_SQL, values()) : h.open(ctx())).rejects.toThrow(MESSAGE);
    await vi.advanceTimersByTimeAsync(2001); await rejected;
    for (const c of h.clients) { expect(c.connection.stream.destroy).toHaveBeenCalled(); expect(c.end).toHaveBeenCalledTimes(1); }
    await port?.close();
  });
  it("bounds stalled close and never acknowledges the successful SQL result", async () => {
    vi.useFakeTimers(); const h = setup(), port = await h.open(ctx()); h.clients[0].end.mockReturnValue(new Promise(() => {}));
    const rejected = expect(port.query(TASK_PREVIEW_ISSUER_SQL, values())).rejects.toThrow(MESSAGE);
    await vi.advanceTimersByTimeAsync(501); await rejected; await port.close().catch(() => {});
  });
  it("rejects pre-aborted calls without any custody/HTTP/DB access", async () => {
    const h = setup(); await expect(h.open({ signal: AbortSignal.abort() })).rejects.toThrow(MESSAGE);
    expect(h.createCustody).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled(); expect(driver.construct).not.toHaveBeenCalled();
  });
  it("destroys a late replacement stream after connect ignores cancellation", async () => {
    const h = setup(), pending = deferred<void>(), c = new AbortController();
    alter(h, socket => { socket.connect.mockReturnValue(pending.promise); });
    const rejected = expect(h.open({ signal: c.signal })).rejects.toThrow(MESSAGE);
    await vi.waitFor(() => expect(h.clients).toHaveLength(1)); c.abort(); await rejected;
    const replacement = { encrypted: true, authorized: true, destroy: vi.fn() }; h.clients[0].connection.stream = replacement;
    pending.resolve(); await vi.waitFor(() => expect(replacement.destroy).toHaveBeenCalled());
    expect(h.clients[0].query).not.toHaveBeenCalled(); expect(h.clients[0].end).toHaveBeenCalledTimes(1);
  });
  it("rejects clock rollback and abort while physical close is pending", async () => {
    vi.useFakeTimers(); const h = setup(), parent = new AbortController(), port = await h.open({ signal: parent.signal });
    const closing = deferred<void>(); h.clients[0].end.mockReturnValue(closing.promise);
    const rejected = expect(port.query(TASK_PREVIEW_ISSUER_SQL, values())).rejects.toThrow(MESSAGE);
    await vi.advanceTimersByTimeAsync(1); parent.abort(); closing.resolve(); await rejected; await port.close();
    fetchMock.mockResolvedValue(response()); const second = await h.open(ctx()); vi.setSystemTime(Date.now() - 1000);
    await expect(second.query(TASK_PREVIEW_ISSUER_SQL, values())).rejects.toThrow(MESSAGE); await second.close();
  });
});

it("keeps the dedicated control adapter out of all product imports and client bundles", () => {
  const name = "communication-note-task-preview-control", walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual([]);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain(PURPOSE);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8");
  expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.env|connectionString\s*:|new\s+Pool\s*\(|JOB_STATUS_ISSUER_CONTROL_ONLY|console\./);
});
