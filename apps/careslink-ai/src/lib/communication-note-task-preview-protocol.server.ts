import "server-only";
import { createPublicKey } from "node:crypto";
import { types } from "node:util";
import { jwtVerify } from "jose";
import { taskListRecord } from "./communication-note-task-list";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import type { CommunicationNoteTaskLeaseScope as Scope, CommunicationNoteTaskLeaseDelivery as Delivery,
  CommunicationNoteTaskLeaseRevocation as Revocation } from "./communication-note-workspace-task-lease.server";

/** Shared wire grammar/verification only: no issuer, SQL, custody, signer or IO. */
export const TASK_PREVIEW_TRANSPORT_PATHS = Object.freeze({
  issue: "/internal/task-preview/v1/lease/issue", revoke: "/internal/task-preview/v1/lease/revoke",
});
export const TASK_PREVIEW_TRANSPORT_JWT_TYPE = "careslink-task-lease+jwt";
export type TaskPreviewAction = keyof typeof TASK_PREVIEW_TRANSPORT_PATHS;
export type TaskPreviewCallerIdentity = Readonly<{ origin: string; issuer: string; subject: string; keyId: string; publicKeyPem: string }>;
export type TaskPreviewCommand = Readonly<{ iss: string; aud: string; sub: string; iat: number; nbf: number; exp: number;
  jti: string; instanceId: string; method: "POST"; path: string; scope: Scope }>;
const fail = () => new Error("Task Preview protocol unavailable");
const SCOPE_KEYS = ["requestId", "projectRef", "purpose", "callerRole", "principal"];
const CLAIMS = ["iss", "aud", "sub", "iat", "nbf", "exp", "jti", "instanceId", "method", "path", "scope"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function taskPreviewWireRecord(value: unknown, keys: readonly string[]) {
  if (types.isProxy(value)) throw fail();
  try { return taskListRecord(value, keys); } catch { throw fail(); }
}
export function taskPreviewProject(value: unknown): string {
  if (typeof value !== "string" || value.length !== 20 || !/^[a-z0-9]{20}$/.test(value) || value === CARESLINK_PRODUCTION_SUPABASE_REF) throw fail();
  return value;
}
export function parseTaskPreviewWireScope(value: unknown, ref: string): Scope {
  const s = taskPreviewWireRecord(value, SCOPE_KEYS), p = taskPreviewWireRecord(s.principal, ["userId", "sessionId", "transport"]);
  if (typeof s.requestId !== "string" || s.requestId.length !== 32 || !/^[a-f0-9]{32}$/.test(s.requestId) || s.projectRef !== ref ||
      s.purpose !== "COMMUNICATION_NOTE_JOB_LIST_READ" || s.callerRole !== "careslink_v1_generation_job_list_caller" || p.transport !== "COOKIE" ||
      typeof p.userId !== "string" || p.userId.length !== 36 || !UUID.test(p.userId) ||
      typeof p.sessionId !== "string" || p.sessionId.length !== 36 || !UUID.test(p.sessionId)) throw fail();
  return Object.freeze({ requestId: s.requestId, projectRef: taskPreviewProject(ref), purpose: s.purpose, callerRole: s.callerRole,
    principal: Object.freeze({ userId: p.userId, sessionId: p.sessionId, transport: "COOKIE" }) });
}
export const sameTaskPreviewScope = (a: Scope, b: Scope) => a.requestId === b.requestId && a.projectRef === b.projectRef &&
  a.purpose === b.purpose && a.callerRole === b.callerRole && a.principal.userId === b.principal.userId && a.principal.sessionId === b.principal.sessionId;

export function parseTaskPreviewCallerIdentity(value: unknown): TaskPreviewCallerIdentity {
  const i = taskPreviewWireRecord(value, ["origin", "issuer", "subject", "keyId", "publicKeyPem"]);
  try {
    for (const field of ["origin", "issuer"]) {
      if (typeof i[field] !== "string" || (i[field] as string).length > 2048) throw fail();
      const url = new URL(i[field] as string);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
          (field === "origin" ? url.origin : url.href) !== i[field]) throw fail();
    }
    if (typeof i.subject !== "string" || !i.subject.length || i.subject.length > 512 || /[^\x21-\x7e]/.test(i.subject) ||
        typeof i.keyId !== "string" || !i.keyId.length || i.keyId.length > 128 || /[^A-Za-z0-9_-]/.test(i.keyId) ||
        typeof i.publicKeyPem !== "string" || i.publicKeyPem.length > 8192 || !i.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n")) throw fail();
    const key = createPublicKey(i.publicKeyPem), bits = key.asymmetricKeyDetails?.modulusLength;
    if (key.asymmetricKeyType !== "rsa" || !bits || bits < 2048 || bits > 4096 || key.export({ format: "pem", type: "spki" }) !== i.publicKeyPem) throw fail();
    return Object.freeze(i) as TaskPreviewCallerIdentity;
  } catch { throw fail(); }
}
export function createTaskPreviewAssertionVerifier(input: TaskPreviewCallerIdentity) {
  const i = parseTaskPreviewCallerIdentity(input), key = createPublicKey(i.publicKeyPem);
  return async (token: unknown, action: TaskPreviewAction, projectRef: string, instanceId: string): Promise<TaskPreviewCommand> => {
    try {
      if (typeof token !== "string" || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ||
          token.split(".").some(part => Buffer.from(part, "base64url").toString("base64url") !== part)) throw fail();
      const { payload, protectedHeader } = await jwtVerify(token, key, { algorithms: ["RS256"], issuer: i.issuer, audience: i.origin,
        subject: i.subject, typ: TASK_PREVIEW_TRANSPORT_JWT_TYPE, currentDate: new Date(), clockTolerance: 0, maxTokenAge: 10, requiredClaims: CLAIMS });
      if (Buffer.from(token.split(".")[0], "base64url").toString() !== JSON.stringify(protectedHeader) ||
          Buffer.from(token.split(".")[1], "base64url").toString() !== JSON.stringify(payload)) throw fail();
      const h = taskPreviewWireRecord(protectedHeader, ["alg", "typ", "kid"]), p = taskPreviewWireRecord(payload, CLAIMS);
      if (h.alg !== "RS256" || h.typ !== TASK_PREVIEW_TRANSPORT_JWT_TYPE || h.kid !== i.keyId || p.aud !== i.origin ||
          p.instanceId !== instanceId || p.method !== "POST" || p.path !== TASK_PREVIEW_TRANSPORT_PATHS[action] ||
          !Number.isSafeInteger(p.iat) || !Number.isSafeInteger(p.nbf) || !Number.isSafeInteger(p.exp) || p.nbf !== p.iat ||
          (p.exp as number) - (p.iat as number) > 30 || (p.exp as number) * 1000 < Date.now() + 8000 ||
          typeof p.jti !== "string" || p.jti.length !== 32 || !/^[a-f0-9]{32}$/.test(p.jti)) throw fail();
      return Object.freeze({ iss: i.issuer, aud: i.origin, sub: i.subject, iat: p.iat as number, nbf: p.nbf as number, exp: p.exp as number,
        jti: p.jti, instanceId, method: "POST", path: p.path as string, scope: parseTaskPreviewWireScope(p.scope, projectRef) });
    } catch { throw fail(); }
  };
}

export function parseTaskPreviewWireDelivery(value: unknown, scope: Scope, action: "issue"): Delivery;
export function parseTaskPreviewWireDelivery(value: unknown, scope: Scope, action: "revoke"): Revocation;
export function parseTaskPreviewWireDelivery(value: unknown, scope: Scope, action: TaskPreviewAction): Delivery | Revocation;
export function parseTaskPreviewWireDelivery(value: unknown, scope: Scope, action: TaskPreviewAction): Delivery | Revocation {
  const d = taskPreviewWireRecord(value, [...SCOPE_KEYS, action === "issue" ? "credential" : "status"]);
  const bound = parseTaskPreviewWireScope(Object.fromEntries(SCOPE_KEYS.map(k => [k, d[k]])), scope.projectRef);
  if (!sameTaskPreviewScope(bound, scope)) throw fail();
  if (action === "revoke") { if (d.status !== "REVOKED") throw fail(); return Object.freeze({ ...bound, status: "REVOKED" }); }
  const c = taskPreviewWireRecord(d.credential, ["role", "password", "deliveryExpiresAt"]);
  const expiry = Date.parse(typeof c.deliveryExpiresAt === "string" ? c.deliveryExpiresAt : "");
  if (typeof c.role !== "string" || c.role.length !== "careslink_v1_job_list_runtime_".length + 16 || !/^careslink_v1_job_list_runtime_[a-f0-9]{16}$/.test(c.role) ||
      typeof c.password !== "string" || c.password.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(c.password) ||
      !Number.isFinite(expiry) || new Date(expiry).toISOString() !== c.deliveryExpiresAt || expiry < Date.now() + 20000 || expiry > Date.now() + 90000) throw fail();
  return Object.freeze({ ...bound, credential: { role: c.role, password: c.password, deliveryExpiresAt: c.deliveryExpiresAt as string } });
}
