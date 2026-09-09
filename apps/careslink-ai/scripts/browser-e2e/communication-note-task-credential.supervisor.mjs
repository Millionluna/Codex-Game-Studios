/** TEST ONLY. Supervise one owned issuer child, never a Hosted process/DB.
 * The parent remains an operator; this is not an application runtime binding. */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { assertTaskCredentialRoot, attestTaskCredentialDatabase, installTaskCredentialBroker } from "./communication-note-task-credential.database.mjs";

const TABLE = "cl_local_task_credential.receipts";
export const TASK_CREDENTIAL_MAX_RESTARTS = 6;
export function taskCredentialWatchDeadline(expiresAt, wallNow, monotonicNow) {
  const expiry = new Date(expiresAt).getTime();
  assert.ok([expiry, wallNow, monotonicNow].every(Number.isFinite));
  return monotonicNow + Math.min(60000, Math.max(0, expiry - wallNow));
}
async function bounded(work, ms) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("LOCAL_SUPERVISOR_TIMEOUT")), ms); })]); }
  finally { clearTimeout(timer); }
}
export async function installTaskCredentialSupervisor(root, open, capability) {
  await assertTaskCredentialRoot(root);
  assert.ok(typeof capability === "string" && capability.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(capability));
  const monitor = await open();
  let state = "STARTING", stopping = false, generation = 0, restarts = 0, worker, recovery, interval, checking = false, checkpoint, lastReason;
  const deadlines = new Map();
  const report = (stage, extra = {}) => console.log(JSON.stringify({ stage, ...extra, modelCalled: false }));
  async function terminate(current) {
    if (!current) return;
    if (!current.exited) current.child.kill("SIGKILL"); // ChildProcess handle, never a supplied PID.
    await bounded(current.closed, 5000);
    // Socket close does not prove the PG backend finished its last statement.
    const deadline = performance.now() + 8000;
    for (;;) {
      const count = (await monitor.query("select count(*)::int n from pg_stat_activity where application_name=$1 and datname=current_database()",
        [current.application])).rows[0].n;
      if (count === 0) break;
      assert.ok(performance.now() < deadline, "LOCAL_ISSUER_BACKEND_STILL_RUNNING"); await delay(50);
    }
  }
  async function launch() {
    const application = "cl-task-issuer-" + randomBytes(16).toString("hex");
    const child = fork(new URL("./communication-note-task-credential.worker.mjs", import.meta.url), [],
      { execArgv: [], env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    const current = { child, application, exited: false, pong: performance.now(), armed: undefined };
    current.closed = new Promise(resolve => child.once("close", () => { current.exited = true; resolve(); }));
    worker = current; generation++; checkpoint = undefined;
    let ready, rejectReady;
    const started = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
    child.on("error", () => rejectReady(new Error("LOCAL_ISSUER_START_FAILED")));
    child.on("message", message => {
      if (worker !== current || !message || typeof message !== "object") return;
      if (message.type === "ready") ready();
      if (message.type === "pong") current.pong = performance.now();
      if (message.type === "checkpoint") checkpoint = message.point;
      if (message.type === "armed") current.armed = message.point;
      if (message.type === "failed") rejectReady(new Error("LOCAL_ISSUER_START_FAILED"));
    });
    child.once("exit", () => {
      current.exited = true;
      rejectReady(new Error("LOCAL_ISSUER_EXITED"));
      if (worker === current && !stopping && state === "READY") recover("PROCESS_EXIT");
    });
    child.send({ type: "init", root, capability, application }, error => { if (error) rejectReady(new Error("LOCAL_ISSUER_START_FAILED")); });
    await bounded(started, 20000);
    assert.ok(!current.exited && !stopping);
    current.pong = performance.now(); state = "READY"; deadlines.clear();
    report("task-credential-supervisor-ready", { generation, restarts, reconciledBeforeListen: true });
  }
  function recover(reason) {
    if (stopping || state !== "READY" || recovery) return;
    state = "RECOVERING"; lastReason = reason;
    recovery = (async () => {
      await terminate(worker);
      assert.ok(restarts < TASK_CREDENTIAL_MAX_RESTARTS, "LOCAL_RESTART_BUDGET_EXHAUSTED");
      restarts++;
      report("task-credential-supervisor-recovering", { reason, restarts });
      await launch();
    })().catch(async () => {
      state = "FAILED"; await terminate(worker).catch(() => {});
      report("task-credential-supervisor-failed-closed", { cleanupConfirmed: false });
    }).finally(() => { recovery = undefined; });
  }
  async function inspect() {
    if (checking || state !== "READY" || stopping) return; checking = true;
    try {
      if (performance.now() - worker.pong > 2000) { recover("HEARTBEAT_LOST"); return; }
      worker.child.send({ type: "ping", value: null }, () => {});
      const rows = (await monitor.query(`select id,expires_at from ${TABLE} where state<>'REVOKED' order by id limit 5`)).rows;
      assert.ok(rows.length <= 4);
      const present = new Set(rows.map(row => row.id));
      for (const id of deadlines.keys()) if (!present.has(id)) deadlines.delete(id);
      for (const row of rows) {
        if (!deadlines.has(row.id)) deadlines.set(row.id, taskCredentialWatchDeadline(row.expires_at, Date.now(), performance.now()));
        // Independent of the child's timer and capped monotonically.
        if (Date.now() >= new Date(row.expires_at).getTime() + 1000 || performance.now() >= deadlines.get(row.id) + 1000) {
          recover("EXPIRY_OVERDUE"); break;
        }
      }
    } catch { recover("MONITOR_UNAVAILABLE"); }
    finally { checking = false; }
  }
  try {
    await attestTaskCredentialDatabase(monitor, root);
    assert.equal((await monitor.query("select pg_try_advisory_lock(7149033) as held")).rows[0].held, true, "LOCAL_SUPERVISOR_ALREADY_RUNNING");
    await launch();
    interval = setInterval(() => { void inspect(); }, 500);
  } catch (error) { stopping = true; await terminate(worker).catch(() => {}); await monitor.end(); throw error; }
  return Object.freeze({
    async status() { assert.equal(state, "READY"); return (await monitor.query(`select state,count(*)::int count from ${TABLE} group by state order by state`)).rows; },
    health() { return Object.freeze({ state, generation, restarts, checkpoint, lastReason }); },
    async faultForTest(action) {
      assert.equal(state, "READY");
      assert.ok(["KILL", "PAUSE", "ISSUE_COMMITTED", "REVOKE_BARRIER_COMMITTED", "REVOKE_DROP_PENDING", "SUPPRESS_EXPIRY"].includes(action));
      const current = worker;
      if (action === "KILL" || action === "PAUSE") { assert.equal(current.child.kill(action === "KILL" ? "SIGKILL" : "SIGSTOP"), true); return; }
      current.armed = undefined; current.child.send({ type: "fault", value: action }, () => {});
      const until = performance.now() + 2000;
      while (current.armed !== action) { assert.ok(performance.now() < until && worker === current && !current.exited); await delay(10); }
    },
    async stop() {
      if (stopping) return; stopping = true; state = "STOPPING"; clearInterval(interval);
      try {
        await recovery; await terminate(worker);
        // Cleanup-only recovery never opens a listener or issues a new lease.
        const cleanup = await installTaskCredentialBroker(root, open, capability, { listen: false });
        await cleanup.stop();
        state = "STOPPED"; report("task-credential-supervisor-stopped", { activeLeases: 0 });
      } finally { deadlines.clear(); await monitor.end(); }
    },
  });
}
