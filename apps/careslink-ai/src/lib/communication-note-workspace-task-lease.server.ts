import "server-only";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import { parseCommunicationNoteTaskCursor, taskListRecord } from "./communication-note-task-list";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import { CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION } from "./v1/shared-contracts";
import type { CaresLinkV1AuthenticatedPrincipal } from "./v1/transport-contract";
import type { CommunicationNoteWorkspaceTaskReadPort } from "./communication-note-workspace-durable.server";

const PURPOSE = "COMMUNICATION_NOTE_JOB_LIST_READ" as const;
const CALLER = "careslink_v1_generation_job_list_caller" as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SCOPE_KEYS = ["requestId", "projectRef", "purpose", "callerRole", "principal"] as const;
const fail = () => new Error("Task list credential lifecycle unavailable");
export const COMMUNICATION_NOTE_TASK_LEASE_READY = false as const;
export const COMMUNICATION_NOTE_TASK_LEASE_ISSUE_TIMEOUT_MS = 8000;
export const COMMUNICATION_NOTE_TASK_LEASE_READ_TIMEOUT_MS = 15000;
export const COMMUNICATION_NOTE_TASK_LEASE_REVOKE_TIMEOUT_MS = 8000;

export type CommunicationNoteTaskLeaseScope = Readonly<{
  requestId: string; projectRef: string; purpose: typeof PURPOSE; callerRole: typeof CALLER;
  principal: CaresLinkV1AuthenticatedPrincipal;
}>;
export type CommunicationNoteTaskLeaseCredential = Readonly<{ role: string; password: string; deliveryExpiresAt: string }>;
export type CommunicationNoteTaskLeaseDelivery = CommunicationNoteTaskLeaseScope & Readonly<{ credential: CommunicationNoteTaskLeaseCredential }>;
/** A trusted custody provider must confirm a TERMINAL fence: no future issue
 * for this scope, password disabled, sessions removed and tombstone recorded.
 * Matching this receipt checks binding, not the truth of a provider's claim. */
export type CommunicationNoteTaskLeaseRevocation = CommunicationNoteTaskLeaseScope & Readonly<{ status: "REVOKED" }>;
export type CommunicationNoteTaskLeaseCustody = Readonly<{
  issue(scope: CommunicationNoteTaskLeaseScope, context: Readonly<{ signal: AbortSignal }>): PromiseLike<CommunicationNoteTaskLeaseDelivery>;
  revoke(scope: CommunicationNoteTaskLeaseScope, context: Readonly<{ signal: AbortSignal }>): PromiseLike<CommunicationNoteTaskLeaseRevocation>;
}>;
export type CommunicationNoteTaskLeaseOptions = Readonly<{
  enabled?: boolean;
  projectRef: string;
  principal: CaresLinkV1AuthenticatedPrincipal;
  custody: CommunicationNoteTaskLeaseCustody;
  open(input: Readonly<{ projectRef: string; principal: CaresLinkV1AuthenticatedPrincipal;
    credential: CommunicationNoteTaskLeaseCredential }>): CommunicationNoteWorkspaceTaskReadPort;
}>;

/** Default-off, lazy, one-use server adapter. No env lookup, SQL, network,
 * issuer implementation, operator client, status-purpose reuse or installation
 * in the formal route. open/custody are trusted, separately verified bindings.
 * Caller cancellation never cancels the independent revocation phase. */
export function createCommunicationNoteTaskLeaseReadPort(options: CommunicationNoteTaskLeaseOptions): CommunicationNoteWorkspaceTaskReadPort | undefined {
  if (!options || typeof options !== "object" || types.isProxy(options)) throw fail();
  const enabled = Object.getOwnPropertyDescriptor(options, "enabled");
  if (!enabled) return undefined;
  if (!("value" in enabled)) throw fail();
  if (enabled.value !== true) return undefined;
  const input = record(options, ["enabled", "projectRef", "principal", "custody", "open"]);
  if (typeof input.projectRef !== "string" || input.projectRef.length !== 20 || !/^[a-z0-9]{20}$/.test(input.projectRef) || input.projectRef === CARESLINK_PRODUCTION_SUPABASE_REF) throw fail();
  const projectRef = input.projectRef, principal = identity(input.principal);
  const custody = record(input.custody, ["issue", "revoke"]);
  fn(custody.issue); fn(custody.revoke); fn(input.open);
  const issue = custody.issue as CommunicationNoteTaskLeaseCustody["issue"];
  const revoke = custody.revoke as CommunicationNoteTaskLeaseCustody["revoke"];
  const open = input.open as CommunicationNoteTaskLeaseOptions["open"];
  let used = false;
  return Object.freeze({ projectRef, purpose: PURPOSE, callerRole: CALLER,
    async execute(raw, context) {
      if (used) throw fail(); used = true;
      const values = parameters(raw, principal);
      const parent = record(context, ["signal"]).signal;
      if (types.isProxy(parent) || !(parent instanceof AbortSignal) || parent.aborted) throw fail();
      const scope = Object.freeze({ requestId: randomBytes(16).toString("hex"), projectRef, purpose: PURPOSE, callerRole: CALLER, principal });
      let credential: { role: string; password: string; deliveryExpiresAt: string } | undefined;
      let result: unknown, failed = false, sessionRevoked = false, revoked = false;
      let fresh = () => false;
      try {
        const delivery = record(await phase(signal => issue(scope, { signal }), COMMUNICATION_NOTE_TASK_LEASE_ISSUE_TIMEOUT_MS, parent), [...SCOPE_KEYS, "credential"]);
        binding(delivery, scope);
        const parsed = record(delivery.credential, ["role", "password", "deliveryExpiresAt"]);
        const received = Date.now(), monotonic = performance.now();
        const expires = Date.parse(typeof parsed.deliveryExpiresAt === "string" ? parsed.deliveryExpiresAt : "");
        if (typeof parsed.role !== "string" || !/^careslink_v1_job_list_runtime_[a-f0-9]{16}$/.test(parsed.role) ||
          parsed.role.length !== "careslink_v1_job_list_runtime_".length + 16 ||
          typeof parsed.password !== "string" || parsed.password.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(parsed.password) ||
          typeof parsed.deliveryExpiresAt !== "string" || !Number.isFinite(expires) || new Date(expires).toISOString() !== parsed.deliveryExpiresAt ||
          expires < received + 20000 || expires > received + 90000) throw fail();
        credential = { role: parsed.role, password: parsed.password, deliveryExpiresAt: parsed.deliveryExpiresAt };
        fresh = () => Date.now() >= received && Date.now() < expires && performance.now() - monotonic < expires - received;
        if (parent.aborted || !fresh()) throw fail();
        const port = record(open(Object.freeze({ projectRef, principal, credential })), ["projectRef", "purpose", "callerRole", "execute"]);
        if (port.projectRef !== projectRef || port.purpose !== PURPOSE || port.callerRole !== CALLER) throw fail();
        fn(port.execute);
        try {
          result = await phase(signal => (port.execute as CommunicationNoteWorkspaceTaskReadPort["execute"])(values, { signal }),
            COMMUNICATION_NOTE_TASK_LEASE_READ_TIMEOUT_MS, parent);
        } catch (error) { sessionRevoked = isSessionRevoked(error); throw error; }
      } catch { failed = true; }
      finally {
        if (credential) credential.password = "";
        // Even ambiguous issue failure must be fenced by the known request ID.
        // An uncooperative/late dependency cannot delay the outward result or
        // turn a timed-out read into success. Its supervisor still owns cleanup.
        try {
          const receipt = record(await phase(signal => revoke(scope, { signal }), COMMUNICATION_NOTE_TASK_LEASE_REVOKE_TIMEOUT_MS), [...SCOPE_KEYS, "status"]);
          binding(receipt, scope); revoked = receipt.status === "REVOKED";
        } catch { /* No receipt, no data. Do not log secrets or raw exceptions. */ }
      }
      if (!revoked || parent.aborted || !fresh()) throw fail();
      if (failed) {
        if (sessionRevoked) throw Object.assign(new Error("SESSION_REVOKED"), { code: "P0001" });
        throw fail();
      }
      return result;
    },
  });
}

function binding(value: Record<string, unknown>, scope: CommunicationNoteTaskLeaseScope) {
  const p = identity(value.principal);
  if (value.requestId !== scope.requestId || value.projectRef !== scope.projectRef || value.purpose !== PURPOSE || value.callerRole !== CALLER ||
    p.userId !== scope.principal.userId || p.sessionId !== scope.principal.sessionId) throw fail();
}
function identity(value: unknown): CaresLinkV1AuthenticatedPrincipal {
  const p = record(value, ["userId", "sessionId", "transport"]);
  if (p.transport !== "COOKIE" || typeof p.userId !== "string" || p.userId.length !== 36 || !UUID.test(p.userId) ||
    typeof p.sessionId !== "string" || p.sessionId.length !== 36 || !UUID.test(p.sessionId)) throw fail();
  return Object.freeze({ userId: p.userId, sessionId: p.sessionId, transport: "COOKIE" });
}
function parameters(raw: readonly unknown[], principal: CaresLinkV1AuthenticatedPrincipal) {
  if (types.isProxy(raw) || !Array.isArray(raw) || raw.length !== 7 || Reflect.ownKeys(raw).length !== 8) throw fail();
  const values = Array.from({ length: 7 }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(raw, String(i));
    if (!d?.enumerable || !("value" in d)) throw fail(); return d.value;
  });
  if (values[0] !== principal.userId || values[1] !== principal.sessionId || values[4] !== 20 ||
    values[5] !== CARESLINK_V1_CONTRACT_VERSION || values[6] !== CARESLINK_V1_NOTE_SCHEMA_VERSION) throw fail();
  try { parseCommunicationNoteTaskCursor(values[2] === null && values[3] === null ? null : { createdAt: values[2], jobId: values[3] }); }
  catch { throw fail(); }
  return Object.freeze(values);
}
function record(value: unknown, keys: readonly string[]) {
  if (types.isProxy(value)) throw fail();
  try { return taskListRecord(value, keys); } catch { throw fail(); }
}
function fn(value: unknown) { if (typeof value !== "function" || types.isProxy(value)) throw fail(); }
function isSessionRevoked(error: unknown) {
  return !!error && typeof error === "object" && !types.isProxy(error) &&
    Object.getOwnPropertyDescriptor(error, "code")?.value === "P0001" && Object.getOwnPropertyDescriptor(error, "message")?.value === "SESSION_REVOKED";
}

async function phase<T>(run: (signal: AbortSignal) => PromiseLike<T>, milliseconds: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController(), signal = controller.signal, deadline = performance.now() + milliseconds;
  const abort = () => controller.abort();
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(fail()); });
  signal.addEventListener("abort", rejectAbort!, { once: true });
  parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, milliseconds);
  try {
    if (parent?.aborted) abort();
    const work = Promise.resolve().then(() => { if (signal.aborted) throw fail(); return run(signal); });
    const value = await Promise.race([work, aborted]);
    if (signal.aborted || performance.now() >= deadline) throw fail();
    return value;
  } finally {
    clearTimeout(timer); parent?.removeEventListener("abort", abort); signal.removeEventListener("abort", rejectAbort!);
  }
}
