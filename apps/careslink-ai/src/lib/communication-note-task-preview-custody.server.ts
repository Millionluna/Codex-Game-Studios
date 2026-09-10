import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import { taskListRecord } from "./communication-note-task-list";
import { TASK_PREVIEW_CONTROL_APPLICATION, type TaskPreviewControlCustody } from "./communication-note-task-preview-control.server";
import { consumeJobStatusCustodyValue as consumeValue } from "./v1/communication-note-job-status-custody-consumer.server";
import { stringifyCaresLinkV1CanonicalJson } from "./v1/canonical-json";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PARENT } from "./v1/ndis-shadow-guard";

export const COMMUNICATION_NOTE_TASK_PREVIEW_CUSTODY_READY = false as const;
const PURPOSE = "TASK_LIST_ISSUER_CONTROL_ONLY", VERSION = "task-preview-control-custody.v1", LIFETIME_MS = 2000;
const unavailable = () => new Error("Task Preview custody unavailable");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (value: unknown) => sha(stringifyCaresLinkV1CanonicalJson(value));
const isHash = (v: unknown): v is string => typeof v === "string" && v.length === 64 && /^[a-f0-9]{64}$/.test(v);
type Context = Readonly<{ signal: AbortSignal }>;
type Request = Readonly<Record<string, unknown>>;
export type TaskPreviewCustodyBinding = Readonly<{
  projectRef: string; branchId: string; caSha256: string; sourceRevisionSha256: string;
  sourceManifestSha256: string; workloadIdentitySha256: string; credentialPolicySha256: string;
  oauthAppReferenceSha256: string; oauthGrantReferenceSha256: string;
}>;
/** TRUSTED provider boundary, NOT a verification algorithm. The concrete adapter
 * must authenticate the CURRENT workload and independently attest the source,
 * pinned task-only credential policy and CA provenance before returning VERIFIED.
 * Echoing a request hash is not authentication. No concrete cloud adapter or
 * provider credential is installed by this source-only policy implementation.
 */
export type TaskPreviewCustodyProvider = Readonly<{
  verifyWorkload(request: Request, context: Context): Promise<unknown>;
  consumeOAuth(request: Request, context: Context, use: (delivery: unknown) => Promise<void>): Promise<void>;
  consumeDatabase(request: Request, context: Context, use: (delivery: unknown) => Promise<void>): Promise<void>;
}>;
const BINDING_KEYS = ["projectRef", "branchId", "caSha256", "sourceRevisionSha256", "sourceManifestSha256",
  "workloadIdentitySha256", "credentialPolicySha256", "oauthAppReferenceSha256", "oauthGrantReferenceSha256"] as const;

/** One verified operation, one OAuth handoff, then one branch-bound database
 * handoff. No environment discovery, shared M1u/job-status provider, refresh
 * token, secret cache, retry, listener or resource creation. Request hashes bind
 * replies to fresh nonces; they are correlation, not signatures or credentials.
 * The connector independently proves the branch and bounds its physical socket.
 * Clearing owned handoff fields cannot erase immutable strings/provider copies.
 */
export function createTaskPreviewControlCustodyFactory(input: Readonly<{
  binding: TaskPreviewCustodyBinding; provider: TaskPreviewCustodyProvider;
}>): (context: Context) => Promise<TaskPreviewControlCustody> {
  const options = record(input, ["binding", "provider"]), binding = Object.freeze(record(options.binding, BINDING_KEYS));
  if (typeof binding.projectRef !== "string" || binding.projectRef.length !== 20 || !/^[a-z0-9]{20}$/.test(binding.projectRef) || binding.projectRef === PARENT ||
      typeof binding.branchId !== "string" || binding.branchId.length !== 36 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(binding.branchId) ||
      !BINDING_KEYS.slice(2).every(key => isHash(binding[key]))) throw unavailable();
  const ports = record(options.provider, ["verifyWorkload", "consumeOAuth", "consumeDatabase"]);
  for (const port of Object.values(ports)) callable(port);
  if (new Set(Object.values(ports)).size !== 3) throw unavailable();
  const provider = Object.freeze(ports) as TaskPreviewCustodyProvider;
  return async original => {
    const parent = signalOf(original); if (parent.aborted) throw unavailable();
    const controller = new AbortController(), context = Object.freeze({ signal: controller.signal });
    const started = Date.now(), monotonic = performance.now();
    let state: "VERIFYING" | "VERIFIED" | "OAUTH" | "ATTEST_BRANCH" | "DATABASE" | "CLOSED" = "VERIFYING";
    const close = () => { state = "CLOSED"; clearTimeout(timer); parent.removeEventListener("abort", close); controller.abort(); };
    const timer = setTimeout(close, LIFETIME_MS); parent.addEventListener("abort", close, { once: true });
    if (parent.aborted) close();
    const check = (callContext?: Context) => {
      if (state === "CLOSED" || parent.aborted || context.signal.aborted ||
          (callContext && signalOf(callContext) !== parent)) throw unavailable();
      const elapsed = performance.now() - monotonic, wall = Date.now() - started;
      if (!Number.isFinite(elapsed) || !Number.isFinite(wall) || elapsed < 0 || elapsed >= LIFETIME_MS ||
          wall < 0 || wall >= LIFETIME_MS || Math.abs(elapsed - wall) > 1000) throw unavailable();
    };
    const common = Object.freeze({ version: VERSION, purpose: PURPOSE, applicationName: TASK_PREVIEW_CONTROL_APPLICATION,
      environment: "EPHEMERAL_NO_DATA_PREVIEW", postgresMajor: 17, connectionMode: "DIRECT", ...binding,
      nonce: randomBytes(32).toString("hex") });
    const verifyRequest = Object.freeze({ ...common, action: "VERIFY_TASK_CONTROL_WORKLOAD" });
    try {
      check();
      const proof = record(await wait(provider.verifyWorkload(verifyRequest, context), context.signal),
        ["status", "requestSha256", "workloadEvidenceSha256", "verifiedAt", "expiresAt"]);
      check();
      if (proof.status !== "VERIFIED_TASK_CONTROL_WORKLOAD" || proof.requestSha256 !== digest(verifyRequest) ||
          !isHash(proof.workloadEvidenceSha256) || timestamp(proof.verifiedAt) < started - 1000 ||
          timestamp(proof.verifiedAt) > Date.now() || timestamp(proof.expiresAt) < started + LIFETIME_MS ||
          timestamp(proof.expiresAt) > timestamp(proof.verifiedAt) + 60000) throw unavailable();
      state = "VERIFIED";
      const attested = Object.freeze({ ...common, workloadEvidenceSha256: proof.workloadEvidenceSha256 });
      return Object.freeze({
        async consumeAccessToken(callContext, consumer) {
          try {
            check(callContext); callable(consumer); if (state !== "VERIFIED") throw unavailable(); state = "OAUTH";
            const request = Object.freeze({ ...attested, action: "CONSUME_TASK_CONTROL_OAUTH", oauthScope: "environment:read",
              managementApiOrigin: "https://api.supabase.com", method: "GET", path: `/v1/projects/${PARENT}/branches` });
            await consumeValue<unknown, void>({ signal: context.signal,
              consume: use => provider.consumeOAuth(request, context, use), use: async raw => {
                check(); const value = record(raw, ["requestSha256", "credentialClass", "oauthScope", "secret", "expiresAt"]);
                if (value.requestSha256 !== digest(request) || value.credentialClass !== "SUPABASE_OAUTH_ACCESS_TOKEN" ||
                    value.oauthScope !== "environment:read" || typeof value.secret !== "string" ||
                    !/^[A-Za-z0-9_.+\/=:-]{20,4096}$/.test(value.secret) || timestamp(value.expiresAt) <= started + LIFETIME_MS)
                  throw unavailable();
                const delivered = { accessToken: value.secret, scope: "environment:read" as const, expiresAt: value.expiresAt as string };
                try { await consumer(delivered); check(); }
                finally { value.secret = ""; delivered.accessToken = ""; }
              } });
            check(); state = "ATTEST_BRANCH";
          } catch { close(); throw unavailable(); }
        },
        async consumeDatabaseCredential(rawTarget, callContext, consumer) {
          try {
            check(callContext); callable(consumer); if (state !== "ATTEST_BRANCH") throw unavailable(); state = "DATABASE";
            const target = record(rawTarget, ["projectRef", "branchId", "purpose", "caSha256", "observedAt", "expiresAt", "controlPlaneEvidenceSha256"]);
            if (target.projectRef !== binding.projectRef || target.branchId !== binding.branchId || target.purpose !== PURPOSE ||
                target.caSha256 !== binding.caSha256 || timestamp(target.observedAt) > Date.now() ||
                Date.now() - timestamp(target.observedAt) >= LIFETIME_MS || timestamp(target.expiresAt) <= Date.now() ||
                timestamp(target.expiresAt) !== timestamp(target.observedAt) + LIFETIME_MS) throw unavailable();
            const core = { projectRef: target.projectRef, branchId: target.branchId, purpose: PURPOSE, caSha256: target.caSha256,
              observedAt: target.observedAt, expiresAt: target.expiresAt };
            if (target.controlPlaneEvidenceSha256 !== sha(JSON.stringify({ ...core, parentProjectRef: PARENT,
              defaultBranch: false, persistent: false, withData: false, status: "ACTIVE_HEALTHY" }))) throw unavailable();
            const request = Object.freeze({ ...attested, action: "CONSUME_TASK_CONTROL_DATABASE_PASSWORD", user: "postgres",
              target: Object.freeze(target), credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD", sourceExpiresAt: null,
              sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET", maximumDeliveryLifetimeMs: 60000 });
            await consumeValue<unknown, void>({ signal: context.signal,
              consume: use => provider.consumeDatabase(request, context, use), use: async raw => {
                check(); const value = record(raw, ["requestSha256", "credentialClass", "sourceExpiresAt", "sourceRevocation", "secret", "deliveryExpiresAt"]);
                if (value.requestSha256 !== digest(request) || value.credentialClass !== request.credentialClass ||
                    value.sourceExpiresAt !== null || value.sourceRevocation !== request.sourceRevocation ||
                    typeof value.secret !== "string" || value.secret.length < 16 || value.secret.length > 256 || /[\u0000-\u001f\u007f]/.test(value.secret) ||
                    timestamp(value.deliveryExpiresAt) < Date.now() + LIFETIME_MS || timestamp(value.deliveryExpiresAt) > Date.now() + 60000)
                  throw unavailable();
                const delivered = { projectRef: binding.projectRef as string, branchId: binding.branchId as string, purpose: PURPOSE as typeof PURPOSE,
                  controlPlaneEvidenceSha256: target.controlPlaneEvidenceSha256 as string, password: value.secret,
                  deliveryExpiresAt: value.deliveryExpiresAt as string, credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" as const,
                  sourceExpiresAt: null, sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" as const };
                try { await consumer(delivered); check(); }
                finally { value.secret = ""; delivered.password = ""; }
              } });
            check(); close();
          } catch { close(); throw unavailable(); }
        },
      } satisfies TaskPreviewControlCustody);
    } catch { close(); throw unavailable(); }
  };
}
function record(value: unknown, keys: readonly string[]) {
  try { if (types.isProxy(value)) throw unavailable(); return taskListRecord(value, keys); } catch { throw unavailable(); }
}
function callable(value: unknown) { if (types.isProxy(value) || typeof value !== "function") throw unavailable(); }
function signalOf(value: unknown): AbortSignal {
  try {
    const s = record(value, ["signal"]).signal;
    if (types.isProxy(s) || !(s instanceof AbortSignal)) throw unavailable();
    // Native brand check also sanitizes an aborted signal's arbitrary reason.
    AbortSignal.prototype.throwIfAborted.call(s); return s;
  } catch { throw unavailable(); }
}
function timestamp(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw unavailable();
  return Date.parse(value);
}
async function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel = () => {};
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    cancel = () => reject(unavailable()); signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel();
  })]); } finally { signal.removeEventListener("abort", cancel); }
}
