import "server-only";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import { createTaskPreviewAssertionVerifier, parseTaskPreviewCallerIdentity, parseTaskPreviewWireDelivery, taskPreviewProject,
  taskPreviewWireRecord as record, TASK_PREVIEW_TRANSPORT_PATHS } from "./communication-note-task-preview-protocol.server";
import type { createCommunicationNoteTaskPreviewService } from "./communication-note-task-preview-service.server";
import type { CommunicationNoteTaskLeaseScope } from "./communication-note-workspace-task-lease.server";

export const COMMUNICATION_NOTE_TASK_PREVIEW_TRANSPORT_READY = false as const;
export { TASK_PREVIEW_TRANSPORT_PATHS, TASK_PREVIEW_TRANSPORT_JWT_TYPE } from "./communication-note-task-preview-protocol.server";
export const TASK_PREVIEW_TRANSPORT_DEADLINE_MS = 7000;
export const TASK_PREVIEW_TRANSPORT_REPLAY_LIMIT = 256;
type Action = keyof typeof TASK_PREVIEW_TRANSPORT_PATHS;
type Service = Pick<ReturnType<typeof createCommunicationNoteTaskPreviewService>, "custody" | "health" | "finished">;
export type TaskPreviewTransportOptions = Readonly<{
  projectRef: string; origin: string; issuer: string; subject: string; keyId: string; publicKeyPem: string; service: Service;
}>;
const fail = () => new Error("Task Preview transport unavailable");
const HEADERS = { "content-type": "application/json", "cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff" };
const denied = () => new Response('{"error":"TASK_PREVIEW_TRANSPORT_UNAVAILABLE"}', { status: 503, headers: HEADERS });

/** Inert, uninstalled HTTP request handler for a DEDICATED service host, not a
 * Next route. A pinned task-backend key signs each complete command, including
 * the already verified Cookie principal. This is NOT a Supabase user JWT,
 * workload OIDC token, source-manifest signature, or arbitrary identity header.
 * The trusted signer must authenticate users before issue and retain authority
 * for exact-scope revoke after page cancellation/session loss. No signer or key
 * discovery is installed here. Key/source provenance remains an activation gate.
 *
 * The owner privately distributes the fresh instanceId with the authenticated
 * host binding; there is no public discovery/health endpoint. Recreating the
 * handler invalidates old assertions; one live handler per recovered service is
 * required. Local replay state is bounded and NOT a distributed replay store.
 *
 * Request.url being HTTPS is NOT proof of TLS. The approved host must terminate
 * authenticated private TLS, protect responses, bound sockets/headers, and own
 * independent supervision. This module opens no listener. A lost successful
 * response still requires caller finally-revoke plus durable issuer recovery.
 */
export function createTaskPreviewAuthenticatedEndpoint(options: TaskPreviewTransportOptions) {
  const o = record(options, ["projectRef", "origin", "issuer", "subject", "keyId", "publicKeyPem", "service"]);
  const projectRef = taskPreviewProject(o.projectRef), identity = parseTaskPreviewCallerIdentity(Object.fromEntries(
    ["origin", "issuer", "subject", "keyId", "publicKeyPem"].map(k => [k, o[k]])));
  const origin = identity.origin, verify = createTaskPreviewAssertionVerifier(identity);
  // The concrete service is an explicit trusted host dependency, not wire input.
  const service = o.service as Service;
  if (!service || types.isProxy(service) || typeof service.health !== "function" || typeof service.custody?.issue !== "function" ||
      typeof service.custody.revoke !== "function" || !(service.finished instanceof Promise) || claimed.has(service)) throw fail();
  claimed.add(service);
  const instanceId = randomBytes(32).toString("hex"), lifetime = new AbortController();
  const replay = { issue: new Map<string, number>(), revoke: new Map<string, number>() };
  const pending = { issue: 0, revoke: 0 }, wallStart = Date.now(), monotonicStart = performance.now();
  const close = () => { lifetime.abort(); replay.issue.clear(); replay.revoke.clear(); };
  void service.finished.then(close, close);
  const fresh = () => {
    const elapsed = performance.now() - monotonicStart;
    if (!Number.isFinite(elapsed) || elapsed < 0 || Math.abs(Date.now() - wallStart - elapsed) > 1000) close();
    return !lifetime.signal.aborted;
  };
  return Object.freeze({ instanceId, close,
    async handle(request: Request): Promise<Response> {
      let action: Action;
      try {
        if (types.isProxy(request) || !(request instanceof Request) || request.signal.aborted || !fresh() || request.method !== "POST") throw fail();
        action = request.url === origin + TASK_PREVIEW_TRANSPORT_PATHS.issue ? "issue" :
          request.url === origin + TASK_PREVIEW_TRANSPORT_PATHS.revoke ? "revoke" : (() => { throw fail(); })();
        if (request.headers.get("content-type") !== "application/jwt" || request.headers.get("accept") !== "application/json" ||
            ["cookie", "origin", "authorization", "content-encoding"].some(h => request.headers.has(h)) || !request.body || request.bodyUsed) throw fail();
        const length = request.headers.get("content-length");
        if (length !== null && (!/^[1-9][0-9]{0,4}$/.test(length) || Number(length) > 16384)) throw fail();
        const state = service.health().state;
        if (!(action === "issue" ? state === "READY" : ["READY", "SWEEPING"].includes(state)) || pending[action] >= 4) throw fail();
      } catch {
        // An early rejection must also release the unread owned request body.
        try { if (!types.isProxy(request) && request instanceof Request) void request.body?.cancel().catch(() => {}); } catch { /* locked/invalid body */ }
        return denied();
      }
      pending[action]++;
      const controller = new AbortController(), signal = AbortSignal.any([controller.signal, lifetime.signal, request.signal]);
      const deadline = performance.now() + TASK_PREVIEW_TRANSPORT_DEADLINE_MS;
      const timer = setTimeout(() => controller.abort(), TASK_PREVIEW_TRANSPORT_DEADLINE_MS);
      const check = () => { if (signal.aborted || !fresh() || performance.now() >= deadline) throw fail(); };
      let stop!: () => void;
      const cancelled = new Promise<never>((_, reject) => { stop = () => reject(fail()); });
      signal.addEventListener("abort", stop, { once: true });
      const work = (async () => {
        let issued: CommunicationNoteTaskLeaseScope | undefined;
        try {
          check();
          const token = await readToken(request, signal); check();
          const p = await verify(token, action, projectRef, instanceId);
          check();
          const now = Date.now();
          const scope = p.scope;
          const used = replay[action];
          for (const [id, expiry] of used) if (expiry <= now) used.delete(id);
          if (used.has(p.jti) || used.size >= TASK_PREVIEW_TRANSPORT_REPLAY_LIMIT) throw fail();
          // No await between check-and-consume, including concurrent duplicates.
          used.set(p.jti, (p.exp as number) * 1000);
          if (action === "issue") issued = scope;
          const value = await service.custody[action](scope, { signal }); check();
          if (Date.now() >= (p.exp as number) * 1000) throw fail();
          const response = delivery(value, scope, action); check();
          return new Response(response, { status: 200, headers: HEADERS });
        } catch {
          // Even a lost/late/malformed issue acknowledgment has a known scope.
          // The caller's expired/aborted signal NEVER cancels this cleanup.
          if (issued) await cleanup(service, issued);
          throw fail();
        } finally { pending[action]--; }
      })();
      try { return await Promise.race([work, cancelled]); }
      catch { return denied(); }
      finally {
        clearTimeout(timer); signal.removeEventListener("abort", stop); controller.abort();
        // Late work remains observed by the race and occupies its bounded slot
        // until settled. Do not queue unlimited work behind a stuck dependency.
      }
    },
  });
}
const claimed = new WeakSet<object>();

async function readToken(request: Request, signal: AbortSignal) {
  const reader = request.body!.getReader(), chunks: Buffer[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw fail();
      const { done, value } = await reader.read();
      if (signal.aborted) throw fail();
      if (done) break;
      if (!types.isUint8Array(value)) throw fail();
      size += value.byteLength;
      if (size > 16384) throw fail();
      chunks.push(Buffer.from(value));
    }
    const length = request.headers.get("content-length");
    if (length !== null && size !== Number(length)) throw fail();
    const bytes = Buffer.concat(chunks);
    try {
      const token = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
          token.split(".").some(part => Buffer.from(part, "base64url").toString("base64url") !== part)) throw fail();
      return token;
    } finally { bytes.fill(0); }
  } finally { signal.removeEventListener("abort", cancel); cancel(); chunks.forEach(c => c.fill(0)); }
}
function delivery(value: unknown, scope: CommunicationNoteTaskLeaseScope, action: Action): string {
  const parsed = parseTaskPreviewWireDelivery(value, scope, action);
  try { return JSON.stringify(parsed); }
  finally { if ("credential" in parsed) (parsed.credential as { password: string }).password = ""; }
}
async function cleanup(service: Service, scope: CommunicationNoteTaskLeaseScope) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(fail()); }, 8000); });
  try { await Promise.race([Promise.resolve().then(() => service.custody.revoke(scope, { signal: controller.signal })), timeout]); }
  catch { /* The service owner/durable recovery retains cleanup responsibility. */ }
  finally { clearTimeout(timer); controller.abort(); }
}
