import "server-only";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import { taskListRecord } from "./communication-note-task-list";
import { createCommunicationNoteTaskPreviewIssuer, parseTaskPreviewIssuerScope, type TaskPreviewIssuerBroker } from "./communication-note-task-preview-issuer.server";
import type { CommunicationNoteTaskLeaseCustody } from "./communication-note-workspace-task-lease.server";

export const COMMUNICATION_NOTE_TASK_PREVIEW_SERVICE_READY = false as const;
export const TASK_PREVIEW_SERVICE_SWEEP_MS = 5000;
export const TASK_PREVIEW_SERVICE_FRESH_MS = 15000;
const unavailable = () => new Error("Task Preview service unavailable");
type State = "NEW" | "STARTING" | "READY" | "SWEEPING" | "STOPPING" | "STOPPED" | "FAILED";
type Reason = "STOP_REQUESTED" | "RECOVERY_FAILED" | "SWEEP_FAILED" | "CUSTODY_FAILED" | "HEALTH_EXPIRED";
type Outcome = Readonly<{ state: "STOPPED" | "FAILED"; cleanupConfirmed: boolean }>;

/** Uninstalled, dedicated Node service lifecycle; NEVER a page/route singleton.
 * Construction is inert. Only the explicit service owner calls start/stop and
 * observes finished/health. Request signals cannot cancel recovery or sweeps.
 * A real host must independently detect process loss/stalls and start a fresh
 * instance (durable recovery before accepting requests). These local timers do
 * not survive process death and do not constitute that external watchdog.
 * No HTTP/IPC listener, auth policy, ambient credential or auto-restart is added.
 */
export function createCommunicationNoteTaskPreviewService(options: Readonly<{
  projectRef: string; broker: TaskPreviewIssuerBroker;
}>) {
  const issuer = createCommunicationNoteTaskPreviewIssuer(options);
  const projectRef = options.projectRef;
  let state: State = "NEW", reason: Reason | undefined, cleanupConfirmed = false;
  let tick: ReturnType<typeof setTimeout> | undefined, watchdog: ReturnType<typeof setTimeout> | undefined;
  let maintenance: Promise<void> | undefined, stopping: Promise<Outcome> | undefined;
  let started = false, recovered = false, lastCheck = 0, wallStart = 0, monotonicStart = 0;
  const lifetime = new AbortController(), pending = new Set<Promise<unknown>>();
  let complete!: (outcome: Outcome) => void;
  const finished = new Promise<Outcome>(resolve => { complete = resolve; });
  const fresh = () => {
    const now = performance.now(), wall = Date.now();
    return Number.isFinite(now) && now >= monotonicStart && now - lastCheck < TASK_PREVIEW_SERVICE_FRESH_MS &&
      Math.abs((wall - wallStart) - (now - monotonicStart)) <= 1000;
  };
  const clearTimers = () => { clearTimeout(tick); clearTimeout(watchdog); tick = undefined; watchdog = undefined; };
  const finish = async (failed: boolean, why: Reason): Promise<Outcome> => {
    if (stopping) return stopping;
    reason = why; state = "STOPPING"; clearTimers(); lifetime.abort();
    // Yield before joining promises: a failing request may itself initiate stop.
    stopping = Promise.resolve().then(async () => {
      await maintenance?.catch(() => {});
      await Promise.allSettled([...pending]);
      if (!started) cleanupConfirmed = true; // No IO or epoch ever acquired.
      else if (recovered) {
        try { await issuer.drain({ signal: new AbortController().signal }); cleanupConfirmed = true; }
        catch { cleanupConfirmed = false; }
      }
      state = failed || !cleanupConfirmed ? "FAILED" : "STOPPED";
      const outcome = Object.freeze({ state, cleanupConfirmed }); complete(outcome); return outcome;
    });
    return stopping;
  };
  const failClosed = (why: Reason) => { void finish(true, why); };
  const checkpoint = () => {
    lastCheck = performance.now(); clearTimeout(watchdog);
    watchdog = setTimeout(() => failClosed("HEALTH_EXPIRED"), TASK_PREVIEW_SERVICE_FRESH_MS);
  };
  const schedule = () => {
    tick = setTimeout(() => {
      if (state !== "READY") return;
      if (!fresh()) { failClosed("HEALTH_EXPIRED"); return; }
      state = "SWEEPING";
      maintenance = issuer.sweepExpired({ signal: lifetime.signal });
      void maintenance.then(() => {
        if (state !== "SWEEPING") return;
        if (!fresh()) { failClosed("HEALTH_EXPIRED"); return; }
        checkpoint(); state = "READY"; schedule();
      }, () => { if (state === "SWEEPING") failClosed("SWEEP_FAILED"); });
    }, TASK_PREVIEW_SERVICE_SWEEP_MS);
  };
  const track = <T>(work: Promise<T>) => {
    pending.add(work);
    void work.then(() => pending.delete(work), () => pending.delete(work));
    return work;
  };
  const requestSignal = (context: Readonly<{ signal: AbortSignal }>) => {
    try {
      if (types.isProxy(context)) throw unavailable();
      const signal = taskListRecord(context, ["signal"]).signal;
      if (types.isProxy(signal) || !(signal instanceof AbortSignal)) throw unavailable();
      return signal;
    } catch { throw unavailable(); }
  };
  const custody: CommunicationNoteTaskLeaseCustody = Object.freeze({
    async issue(raw, context) {
      const signal = requestSignal(context);
      let scope;
      try { scope = parseTaskPreviewIssuerScope(raw, projectRef); } catch { throw unavailable(); }
      if (signal.aborted || state !== "READY") throw unavailable();
      if (!fresh()) { failClosed("HEALTH_EXPIRED"); throw unavailable(); }
      // Bound local outstanding work to the durable issuer's four-lease limit.
      if (pending.size >= 4) throw unavailable();
      return track((async () => {
        try {
          const result = await issuer.custody.issue(scope, { signal: AbortSignal.any([signal, lifetime.signal]) });
          if (lifetime.signal.aborted || signal.aborted || !fresh()) throw unavailable();
          return result;
        } catch { failClosed("CUSTODY_FAILED"); throw unavailable(); }
      })());
    },
    async revoke(raw, context) {
      const signal = requestSignal(context);
      let scope;
      try { scope = parseTaskPreviewIssuerScope(raw, projectRef); } catch { throw unavailable(); }
      // Admission closes before drain; drain owns any request rejected here.
      if (signal.aborted || !["READY", "SWEEPING"].includes(state) || pending.size >= 8) throw unavailable();
      return track((async () => {
        try { return await issuer.custody.revoke(scope, { signal }); }
        catch { failClosed("CUSTODY_FAILED"); throw unavailable(); }
      })());
    },
  });
  return Object.freeze({ custody, finished,
    async start() {
      if (state !== "NEW") throw unavailable();
      started = true; state = "STARTING";
      wallStart = Date.now(); monotonicStart = performance.now();
      maintenance = issuer.recover({ signal: lifetime.signal });
      try {
        await maintenance; recovered = true;
        if (lifetime.signal.aborted || state !== "STARTING") throw unavailable();
        // Startup can take 30 seconds; the readiness age begins after recovery.
        lastCheck = performance.now();
        if (!fresh()) throw unavailable();
        checkpoint(); state = "READY"; schedule();
      } catch { if (!stopping) failClosed("RECOVERY_FAILED"); throw unavailable(); }
    },
    health() {
      if (["READY", "SWEEPING"].includes(state) && !fresh()) failClosed("HEALTH_EXPIRED");
      return Object.freeze({ state, reason, cleanupConfirmed });
    },
    stop: () => finish(false, "STOP_REQUESTED"),
  });
}
