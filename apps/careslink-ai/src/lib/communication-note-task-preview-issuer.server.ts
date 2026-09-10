import "server-only";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { types } from "node:util";
import { taskListRecord } from "./communication-note-task-list";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import type { CommunicationNoteTaskLeaseCustody, CommunicationNoteTaskLeaseScope } from "./communication-note-workspace-task-lease.server";

export const COMMUNICATION_NOTE_TASK_PREVIEW_ISSUER_READY = false as const;
export const TASK_PREVIEW_ISSUER_SQL = "select careslink_task_preview_issuer.call($1::text,$2::jsonb) as data";
type Context = Readonly<{ signal: AbortSignal }>;
type Operation = "start" | "inventory" | "ready" | "issue" | "fence" | "finalize";
export type TaskPreviewIssuerBroker = Readonly<{
  call(op: Operation, data: Readonly<Record<string, unknown>>, context: Context): PromiseLike<unknown>;
}>;
export type TaskPreviewControlConnection = Readonly<{
  query(sql: string, values: readonly unknown[]): PromiseLike<{ rows: unknown[] }>;
  close(): Promise<void>;
}>;
const fail = () => new Error("Task Preview issuer unavailable");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SCOPE_KEYS = ["requestId", "projectRef", "purpose", "callerRole", "principal"] as const;
const RESULT_KEYS = ["scope", "state", "role", "expiresAt", "roleCount", "sessionCount", "membershipCount"] as const;

/** Dedicated issuer-service adapter, never an application-route dependency.
 * The injected opener must independently verify disposable target, PG17, pinned
 * TLS and fresh control custody, with one new autocommit connection per call.
 * This fixed-statement wrapper does not claim to attest an arbitrary opener.
 */
export function createTaskPreviewSqlBroker(open: (context: Context) => Promise<TaskPreviewControlConnection>): TaskPreviewIssuerBroker {
  callable(open);
  return Object.freeze({ async call(op, data, context) {
    if (!["start", "inventory", "ready", "issue", "fence", "finalize"].includes(op)) throw fail();
    let connection: TaskPreviewControlConnection | undefined, closing: Promise<void> | undefined;
    const close = () => closing ??= connection ? Promise.resolve().then(() => connection!.close()) : Promise.resolve();
    try {
      return await bounded(async signal => {
        const pending = open({ signal });
        // Retain cleanup ownership if an opener ignores cancellation and arrives late.
        void pending.then(c => { connection = c; if (signal.aborted) void close().catch(() => {}); }, () => {});
        connection = await pending;
        if (signal.aborted) throw fail();
        const stop = () => { void close().catch(() => {}); };
        signal.addEventListener("abort", stop, { once: true });
        try {
          const result = await connection.query(TASK_PREVIEW_ISSUER_SQL, [op, JSON.stringify(data)]);
          if (signal.aborted || !Array.isArray(result.rows) || result.rows.length !== 1) throw fail();
          return record(result.rows[0], ["data"]).data;
        } finally { signal.removeEventListener("abort", stop); }
      }, 2000, context.signal);
    } catch { throw fail(); }
    finally { if (connection) { try { await bounded(() => close(), 1000); } catch { throw fail(); } } }
  } });
}

/** Source-only custody service core. Recover performs a durable epoch takeover
 * and revokes all prior unfinished leases BEFORE enabling new issuance. A stale
 * process cannot issue after takeover. revoke is independent of ready/epoch.
 *
 * The external service supervisor MUST invoke recovery after process loss and
 * sweepExpired on a bounded schedule independently of the page/request. There
 * is no in-process-only timer claim and no hosted installation in this module.
 */
export function createCommunicationNoteTaskPreviewIssuer(options: Readonly<{ projectRef: string; broker: TaskPreviewIssuerBroker }>) {
  const fields = record(options, ["projectRef", "broker"]), projectRef = project(fields.projectRef);
  const call = record(fields.broker, ["call"]).call as TaskPreviewIssuerBroker["call"]; callable(call);
  let epoch: string | undefined, ready = false, recovering = false;
  const operate = (op: Operation, data: Readonly<Record<string, unknown>>, signal?: AbortSignal) =>
    bounded(s => call(op, data, { signal: s }), 3000, signal);
  const parseResult = (value: unknown, expected: CommunicationNoteTaskLeaseScope) => {
    const r = record(value, RESULT_KEYS);
    if (!same(scope(r.scope, projectRef), expected) || typeof r.state !== "string" || !["ISSUED", "FENCED", "REVOKED"].includes(r.state) ||
      (r.role !== null && (typeof r.role !== "string" || !/^careslink_v1_job_list_runtime_[a-f0-9]{16}$/.test(r.role))) ||
      (r.expiresAt !== null && !timestamp(r.expiresAt)) ||
      (r.state !== "REVOKED" && (r.role === null || r.expiresAt === null)) ||
      ![r.roleCount, r.sessionCount, r.membershipCount].every(n => Number.isSafeInteger(n) && (n as number) >= 0)) throw fail();
    return r;
  };
  const revoke = async (raw: CommunicationNoteTaskLeaseScope, context: Context) => {
    const expected = scope(raw, projectRef);
    try {
      const fenced = parseResult(await operate("fence", { scope: expected }, context.signal), expected);
      if (!["FENCED", "REVOKED"].includes(String(fenced.state))) throw fail();
      const done = parseResult(await operate("finalize", { scope: expected }, context.signal), expected);
      if (done.state !== "REVOKED" || done.roleCount !== 0 || done.sessionCount !== 0 || done.membershipCount !== 0) throw fail();
      return Object.freeze({ ...expected, status: "REVOKED" as const });
    } catch { ready = false; throw fail(); }
  };
  const inventory = async (ownedEpoch: string, signal?: AbortSignal) => {
    const result = record(await operate("inventory", { projectRef, epoch: ownedEpoch }, signal), ["projectRef", "epoch", "leases"]);
    if (result.projectRef !== projectRef || result.epoch !== ownedEpoch || types.isProxy(result.leases) ||
      !Array.isArray(result.leases) || result.leases.length > 4) throw fail();
    const seen = new Set<string>();
    return result.leases.map(value => {
      const r = record(value, ["scope", "state", "expiresAt"]), parsed = scope(r.scope, projectRef);
      if (seen.has(parsed.requestId) || typeof r.state !== "string" || !["ISSUED", "FENCED"].includes(r.state) ||
        (r.expiresAt !== null && !timestamp(r.expiresAt)) || (r.state === "ISSUED" && r.expiresAt === null)) throw fail();
      seen.add(parsed.requestId); return { scope: parsed, state: r.state, expiresAt: r.expiresAt as string | null };
    });
  };
  const custody: CommunicationNoteTaskLeaseCustody = Object.freeze({
    async issue(raw, context) {
      const expected = scope(raw, projectRef), ownedEpoch = epoch;
      if (!ready || recovering || !ownedEpoch || context.signal.aborted) throw fail();
      const role = "careslink_v1_job_list_runtime_" + randomBytes(8).toString("hex");
      let password = randomBytes(32).toString("base64url"), verifier = scram(password);
      const expiresAt = new Date(Date.now() + 60000).toISOString();
      try {
        const result = parseResult(await operate("issue", { epoch: ownedEpoch, scope: expected, role, verifier, expiresAt }, context.signal), expected);
        if (!ready || epoch !== ownedEpoch || context.signal.aborted || result.state !== "ISSUED" || result.role !== role ||
          result.expiresAt !== expiresAt || Date.parse(expiresAt) < Date.now() + 25000) throw fail();
        return Object.freeze({ ...expected, credential: { role, password, deliveryExpiresAt: expiresAt } });
      } catch {
        ready = false;
        // Includes unknown outcome after COMMIT, malformed response and cancellation.
        // Cleanup is NOT cancelled with the failed issue/request signal.
        try { await revoke(expected, { signal: new AbortController().signal }); } catch { /* supervisor retains durable recovery responsibility */ }
        throw fail();
      } finally { password = ""; verifier = ""; }
    },
    revoke,
  });
  return Object.freeze({ custody,
    async recover(context: Context) {
      if (recovering) throw fail();
      ready = false; recovering = true; epoch = undefined;
      const ownedEpoch = randomBytes(16).toString("hex");
      try {
        await bounded(async signal => {
          const started = record(await operate("start", { projectRef, epoch: ownedEpoch }, signal), ["projectRef", "epoch", "ready"]);
          if (started.projectRef !== projectRef || started.epoch !== ownedEpoch || started.ready !== false) throw fail();
          for (const lease of await inventory(ownedEpoch, signal)) await revoke(lease.scope, { signal });
          const done = record(await operate("ready", { projectRef, epoch: ownedEpoch }, signal), ["projectRef", "epoch", "ready"]);
          if (done.projectRef !== projectRef || done.epoch !== ownedEpoch || done.ready !== true) throw fail();
          epoch = ownedEpoch; ready = true;
        }, 30000, context.signal);
      } catch { ready = false; epoch = undefined; throw fail(); }
      finally { recovering = false; }
    },
    async sweepExpired(context: Context) {
      const ownedEpoch = epoch;
      if (!ready || !ownedEpoch || recovering) throw fail();
      try {
        await bounded(async signal => {
          for (const lease of await inventory(ownedEpoch, signal)) {
            if (lease.state === "FENCED" || lease.expiresAt === null || Date.parse(lease.expiresAt) <= Date.now()) await revoke(lease.scope, { signal });
          }
          if (epoch !== ownedEpoch || !ready) throw fail();
        }, 30000, context.signal);
      } catch { ready = false; throw fail(); }
    },
  });
}

function scram(password: string) {
  const salt = randomBytes(16), salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const client = createHmac("sha256", salted).update("Client Key").digest();
  const stored = createHash("sha256").update(client).digest(), server = createHmac("sha256", salted).update("Server Key").digest();
  try { return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored.toString("base64")}:${server.toString("base64")}`; }
  finally { salted.fill(0); client.fill(0); stored.fill(0); server.fill(0); salt.fill(0); }
}
function record(value: unknown, keys: readonly string[]) { if (types.isProxy(value)) throw fail(); return taskListRecord(value, keys); }
function callable(value: unknown) { if (typeof value !== "function" || types.isProxy(value)) throw fail(); }
function project(value: unknown) {
  if (typeof value !== "string" || value.length !== 20 || !/^[a-z0-9]{20}$/.test(value) || value === CARESLINK_PRODUCTION_SUPABASE_REF) throw fail();
  return value;
}
function scope(value: unknown, ref: string): CommunicationNoteTaskLeaseScope {
  const s = record(value, SCOPE_KEYS), p = record(s.principal, ["userId", "sessionId", "transport"]);
  if (typeof s.requestId !== "string" || s.requestId.length !== 32 || !/^[a-f0-9]{32}$/.test(s.requestId) || s.projectRef !== ref ||
    s.purpose !== "COMMUNICATION_NOTE_JOB_LIST_READ" || s.callerRole !== "careslink_v1_generation_job_list_caller" || p.transport !== "COOKIE" ||
    typeof p.userId !== "string" || p.userId.length !== 36 || !UUID.test(p.userId) ||
    typeof p.sessionId !== "string" || p.sessionId.length !== 36 || !UUID.test(p.sessionId)) throw fail();
  return Object.freeze({ requestId: s.requestId, projectRef: ref, purpose: s.purpose, callerRole: s.callerRole,
    principal: Object.freeze({ userId: p.userId, sessionId: p.sessionId, transport: "COOKIE" }) });
}
function same(a: CommunicationNoteTaskLeaseScope, b: CommunicationNoteTaskLeaseScope) {
  return a.requestId === b.requestId && a.projectRef === b.projectRef && a.purpose === b.purpose && a.callerRole === b.callerRole &&
    a.principal.userId === b.principal.userId && a.principal.sessionId === b.principal.sessionId;
}
function timestamp(v: unknown): v is string {
  return typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
}
async function bounded<T>(run: (signal: AbortSignal) => PromiseLike<T>, ms: number, parent?: AbortSignal): Promise<T> {
  const c = new AbortController(), abort = () => c.abort(); let stop!: () => void;
  const cancelled = new Promise<never>((_, reject) => { stop = () => reject(fail()); });
  c.signal.addEventListener("abort", stop, { once: true }); parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, ms);
  try {
    if (parent?.aborted) abort();
    const work = Promise.resolve().then(() => { if (c.signal.aborted) throw fail(); return run(c.signal); });
    const result = await Promise.race([work, cancelled]); if (c.signal.aborted) throw fail(); return result;
  } finally { clearTimeout(timer); parent?.removeEventListener("abort", abort); c.signal.removeEventListener("abort", stop); c.abort(); }
}
