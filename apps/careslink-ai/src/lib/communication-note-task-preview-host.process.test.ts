import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createCommunicationNoteTaskPreviewService } from "./communication-note-task-preview-service.server";
import { createTaskPreviewSqlBroker } from "./communication-note-task-preview-issuer.server";

// The fixed runner alone creates/attests this disposable Unix-only cluster.
// No Hosted connection string, credential or target option is accepted.
const socket = process.env.CARESLINK_TASK_ISSUER_LOCAL_SOCKET, REF = "abcdefghijklmnopqrst";
const require = createRequire(import.meta.url), CANARY = "task_host_unrelated_canary";
const scope = () => ({ requestId: randomBytes(16).toString("hex"), projectRef: REF,
  purpose: "COMMUNICATION_NOTE_JOB_LIST_READ", callerRole: "careslink_v1_generation_job_list_caller",
  principal: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" } });
const children: ChildProcess[] = [], clients: Client[] = [];
let root: string, admin: Client, canary: Client, canaryOid: number;
type Scope = ReturnType<typeof scope>;
type Lease = { scope: Scope; state: string; role: string | null; expiresAt: string | null;
  roleCount: number; sessionCount: number; membershipCount: number };
// Simulated durable protocol, outside the killed child, for offline tests only.
// The opt-in fixed runner exercises exactly the same child/service against PG16.
const ledger = new Map<string, Lease>(); let epoch: unknown, ready = false;
function protocol(op: string, data: Record<string, unknown>) {
  if (op === "start") { epoch = data.epoch; ready = false; return { projectRef: REF, epoch, ready }; }
  if (["inventory", "ready", "issue"].includes(op) && data.epoch !== epoch) throw new Error("STALE_EPOCH");
  if (op === "inventory") return { projectRef: REF, epoch, leases: [...ledger.values()].filter(l => l.state !== "REVOKED")
    .map(({ scope: s, state, expiresAt }) => ({ scope: s, state, expiresAt })) };
  if (op === "ready") { if ([...ledger.values()].some(l => l.state !== "REVOKED")) throw new Error("RECOVER_FIRST");
    ready = true; return { projectRef: REF, epoch, ready }; }
  const s = data.scope as Scope; let lease = ledger.get(s.requestId);
  if (lease && JSON.stringify(lease.scope) !== JSON.stringify(s)) throw new Error("WRONG_SCOPE");
  if (op === "issue") {
    if (!ready || lease) throw new Error("NO_ISSUE");
    lease = { scope: s, state: "ISSUED", role: data.role as string, expiresAt: data.expiresAt as string,
      roleCount: 1, sessionCount: 0, membershipCount: 2 }; ledger.set(s.requestId, lease);
  }
  if (op === "fence") {
    if (!lease) { lease = { scope: s, state: "REVOKED", role: null, expiresAt: null, roleCount: 0, sessionCount: 0, membershipCount: 0 }; ledger.set(s.requestId, lease); }
    else if (lease.state === "ISSUED") lease.state = "FENCED";
  }
  if (op === "finalize") { if (!lease || lease.state === "ISSUED") throw new Error("FENCE_REQUIRED");
    Object.assign(lease, { state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 }); }
  return { ...lease };
}
async function bound<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LOCAL_HOST_TIMEOUT")), ms); })]); }
  finally { clearTimeout(timer); }
}
async function open(user = "postgres") {
  expect(socket).toMatch(/^\/private\/tmp\/cl-task-issuer-[A-Za-z0-9]{6}\/socket$/);
  const c = new Client({ host: socket, port: 15437, user, password: "", database: "postgres", ssl: false,
    connectionTimeoutMillis: 500, query_timeout: 2000, application_name: user === "postgres" ? "task-host-parent-test" : CANARY,
    options: "-c statement_timeout=1500 -c lock_timeout=500" });
  c.on("error", () => {}); clients.push(c); await c.connect(); return c;
}
async function recover() {
  const s = createCommunicationNoteTaskPreviewService({ projectRef: REF, broker: createTaskPreviewSqlBroker(async () => {
    const c = await open(); return { query: (sql, values) => c.query(sql, [...values]), close: () => c.end() };
  }) });
  await s.start(); expect(await s.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true });
}
async function start(mode = "NORMAL", expectReady = true) {
  const application = "cl-task-host-test-" + randomBytes(16).toString("hex");
  const child = fork(root + "/child.cjs", [], { env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" },
    execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] }); children.push(child);
  const messages: Record<string, unknown>[] = []; let changed = () => {};
  child.on("message", raw => {
    const value = raw as { type: string; id: number; op: string; data: Record<string, unknown> };
    if (!socket && value.type === "protocol-call") {
      try { const result = protocol(value.op, value.data);
        if (child.connected) child.send({ type: "protocol-reply", id: value.id, value: result }, () => {}); }
      catch { if (child.connected) child.send({ type: "protocol-reply", id: value.id, failed: true }, () => {}); }
    } else { messages.push(raw as Record<string, unknown>); changed(); }
  });
  child.on("error", () => {});
  const closed = new Promise<{ code: number | null; signal: string | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  const wait = (type: string) => bound(new Promise<Record<string, unknown>>(resolve => {
    const check = () => { const index = messages.findIndex(v => v.type === type); if (index >= 0) resolve(messages.splice(index, 1)[0]); };
    changed = check; check();
  }));
  child.send({ type: "init", socket: socket ?? "PROTOCOL_ONLY", application, mode });
  if (expectReady) await wait("ready");
  const terminate = async (signal: NodeJS.Signals = "SIGKILL") => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    const result = await bound(closed);
    if (!socket) return result;
    // kill() success is not exit evidence; await close AND the old PG backends.
    for (let i = 0; i < 40; i++) {
      if ((await admin.query("select count(*)::int n from pg_stat_activity where application_name=$1", [application])).rows[0].n === 0) return result;
      await delay(50);
    }
    throw new Error("LOCAL_OLD_BACKEND_REMAINS");
  };
  return { child, wait, closed, terminate };
}
async function row(s: ReturnType<typeof scope>) {
  if (!socket) return ledger.get(s.requestId)!;
  return (await admin.query("select state,role_name,role_oid from careslink_task_preview_issuer.leases where id=$1", [s.requestId])).rows[0];
}
async function gone(s: ReturnType<typeof scope>) {
  const r = await row(s); expect(r.state).toBe("REVOKED");
  if (!socket) { expect(r).toMatchObject({ roleCount: 0, sessionCount: 0, membershipCount: 0 }); return; }
  expect((await admin.query("select count(*)::int n from pg_roles where oid=$1 or rolname=$2", [r.role_oid, r.role_name])).rows[0].n).toBe(0);
  expect((await admin.query("select count(*)::int n from pg_stat_activity where usesysid=$1", [r.role_oid])).rows[0].n).toBe(0);
  expect((await admin.query("select count(*)::int n from pg_auth_members where roleid=$1 or member=$1", [r.role_oid])).rows[0].n).toBe(0);
  expect((await canary.query("select pg_backend_pid() pid")).rows[0].pid).toBe(canaryOid);
}
describe.skipIf(process.platform === "win32")(socket ? "real service process and actual local PG16 recovery" :
  "real service process with simulated parent protocol (NOT SQL)", { timeout: 15000 }, () => {
  beforeAll(async () => {
    if (socket) {
      admin = await open("task_test_bootstrap");
      expect((await admin.query("select current_setting('cluster_name') cluster,inet_server_addr() is null local")).rows)
        .toEqual([{ cluster: "careslink-task-issuer-local-pg16", local: true }]);
      canary = await open("task_test_bootstrap"); canaryOid = (await canary.query("select pg_backend_pid() pid")).rows[0].pid;
    }
    root = await mkdtemp("/private/tmp/cl-task-host-"); expect(await realpath(root)).toBe(root);
    // Compile the ACTUAL source, not a reimplementation. Only Next's server-only
    // marker is aliased to Next's own empty Node marker for this standalone test.
    await build({ entryPoints: ["scripts/preview-e2e/communication-note-task-host-local-child.mjs"], outfile: root + "/child.cjs",
      bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "silent", external: ["pg-native"],
      alias: { "server-only": require.resolve("next/dist/compiled/server-only/empty.js") } });
  });
  afterAll(async () => {
    let closed = true;
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const end = new Promise(resolve => child.once("close", resolve)); child.kill("SIGKILL");
      try { await bound(end); } catch { closed = false; }
    }
    try { if (admin && closed) await recover(); }
    finally {
      await Promise.allSettled(clients.map(c => c.end()));
      if (root && closed) { expect(root).toMatch(/^\/private\/tmp\/cl-task-host-[A-Za-z0-9]{6}$/); expect(await realpath(root)).toBe(root); await rm(root, { recursive: true }); }
    }
    expect(closed).toBe(true);
  });
  it.each(["SIGTERM", "SIGINT"] as const)("drains unexpired leases before clean %s exit", async signal => {
    const h = await start(), s = scope(); h.child.send({ type: "issue", scope: s }); await h.wait("completed");
    expect((await row(s)).state).toBe("ISSUED"); expect(await h.terminate(signal)).toEqual({ code: 0, signal: null }); await gone(s);
  });
  // Requires the SQL broker to outlive the lost parent channel; the in-parent
  // protocol simulation deliberately cannot claim independent DB cleanup.
  it.skipIf(!socket)("drains on actual parent IPC disconnect without another page request", async () => {
    const h = await start(), s = scope(); h.child.send({ type: "issue", scope: s }); await h.wait("completed");
    h.child.disconnect(); expect(await bound(h.closed)).toEqual({ code: 0, signal: null }); await gone(s);
  });
  it.each(["NORMAL", "ISSUE_COMMITTED", "FENCE_COMMITTED"])("recovers before readiness after real SIGKILL at %s", async mode => {
    const h = await start(mode), s = scope(); h.child.send({ type: "issue", scope: s });
    if (mode === "ISSUE_COMMITTED") await h.wait("checkpoint");
    else { await h.wait("completed"); if (mode === "FENCE_COMMITTED") { h.child.send({ type: "revoke", scope: s }); await h.wait("checkpoint"); } }
    expect(await h.terminate()).toEqual({ code: null, signal: "SIGKILL" });
    expect((await row(s)).state).toBe(mode === "FENCE_COMMITTED" ? "FENCED" : "ISSUED");
    const successor = await start(); await gone(s);
    const next = scope(); successor.child.send({ type: "issue", scope: next }); await successor.wait("completed");
    expect(await successor.terminate("SIGTERM")).toEqual({ code: 0, signal: null }); await gone(next);
  });
  it("reports failed exit for unconfirmed drain; a fresh process recovers its remaining role", async () => {
    const h = await start("STOP_UNCONFIRMED"), s = scope(); h.child.send({ type: "issue", scope: s }); await h.wait("completed");
    expect(await h.terminate("SIGTERM")).toEqual({ code: 1, signal: null }); expect((await row(s)).state).toBe("ISSUED");
    const successor = await start(); await gone(s); expect(await successor.terminate("SIGTERM")).toEqual({ code: 0, signal: null });
  });
  it("fails startup without reporting ready or restarting itself", async () => {
    const h = await start("RECOVERY_FAILED", false); expect(await bound(h.closed)).toEqual({ code: 1, signal: null });
  });
});
