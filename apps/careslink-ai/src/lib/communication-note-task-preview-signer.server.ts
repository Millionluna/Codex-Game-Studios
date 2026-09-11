import "server-only";
import { createPublicKey } from "node:crypto";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import { createTaskPreviewAssertionVerifier, parseTaskPreviewCallerIdentity, parseTaskPreviewUnsignedCommand, parseTaskPreviewWireScope,
  sameTaskPreviewScope, taskPreviewProject, taskPreviewWireRecord as record, TASK_PREVIEW_TRANSPORT_PATHS, TASK_PREVIEW_TRANSPORT_JWT_TYPE,
  type TaskPreviewCallerIdentity, type TaskPreviewCommand } from "./communication-note-task-preview-protocol.server";
import { consumeJobStatusCustodyValue as consumeValue } from "./v1/communication-note-job-status-custody-consumer.server";
import type { CommunicationNoteTaskLeaseScope as Scope } from "./communication-note-workspace-task-lease.server";

export const COMMUNICATION_NOTE_TASK_PREVIEW_SIGNER_READY = false as const;
export const TASK_PREVIEW_SIGNATURE_DEADLINE_MS = 2000;
export const TASK_PREVIEW_SIGNER_DEADLINE_MS = 7500;
type Context = Readonly<{ signal: AbortSignal }>;
export type TaskPreviewSignatureInput = Readonly<{ algorithm: "RS256"; keyId: string; signingInput: Buffer }>;
export type TaskPreviewSignerOptions = Readonly<{
  projectRef: string; principal: Scope["principal"]; identity: TaskPreviewCallerIdentity; instanceId: string;
  consumeSignature(input: TaskPreviewSignatureInput, context: Context, use: (signature: Uint8Array) => Promise<void>): Promise<void>;
}>;
const fail = () => new Error("Task Preview signer unavailable");

/** Inert backend adapter, constructed once per lease AFTER independently
 * verified Cookie authentication. A principal-shaped object is NOT proof of
 * authentication. The backend owner must establish that provenance, the exact
 * service/instance binding and dedicated signing-key custody before installing.
 *
 * No private key, key discovery, SDK, network call, env lookup or product binding
 * lives here. The injected dependency signs only the owned JWS signing input
 * with RSASSA-PKCS1-v1_5 / SHA-256 and the explicitly pinned key. Raw signature
 * bytes are verified locally before any token reaches the consumer; the
 * dependency must complete exactly one awaited handoff first. No arbitrary
 * payload/digest signing API or assertion return/cache is exposed.
 *
 * One issue attempt and one exact-scope revoke attempt, including revoke before
 * unknown issue. Cleanup authority survives cancellation of the issue/page;
 * this adapter does not itself revoke a lease or guarantee physical cleanup.
 * Already-started consumer IO and process loss still require caller finally-
 * revoke and independent service recovery. Clearing owned buffers/references
 * cannot erase immutable JS strings or copies retained by trusted dependencies.
 */
export function createTaskPreviewAssertionProvider(input: TaskPreviewSignerOptions) {
  const o = record(input, ["projectRef", "principal", "identity", "instanceId", "consumeSignature"]);
  const projectRef = taskPreviewProject(o.projectRef), identity = parseTaskPreviewCallerIdentity(o.identity);
  if (typeof o.instanceId !== "string" || o.instanceId.length !== 64 || !/^[a-f0-9]{64}$/.test(o.instanceId) ||
      types.isProxy(o.consumeSignature) || typeof o.consumeSignature !== "function") throw fail();
  const instanceId = o.instanceId, consume = o.consumeSignature as TaskPreviewSignerOptions["consumeSignature"];
  const principal = parseTaskPreviewWireScope({ requestId: "0".repeat(32), projectRef, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ",
    callerRole: "careslink_v1_generation_job_list_caller", principal: o.principal }, projectRef).principal;
  const verify = createTaskPreviewAssertionVerifier(identity);
  const signatureBytes = Math.ceil(createPublicKey(identity.publicKeyPem).asymmetricKeyDetails!.modulusLength! / 8);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: TASK_PREVIEW_TRANSPORT_JWT_TYPE, kid: identity.keyId })).toString("base64url");
  let bound: Scope | undefined, issued = false, revoked = false, issueController: AbortController | undefined;
  const nonces = new Set<string>(); // at most two admitted operations, no unbounded replay cache

  return Object.freeze({
    async consumeAssertion(raw: TaskPreviewCommand, context: Context, accept: (assertion: string) => Promise<void>): Promise<void> {
      let owned: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
      let prepared: { token: string } | undefined;
      try {
        const command = parseTaskPreviewUnsignedCommand(raw, identity, projectRef, instanceId), parent = parentSignal(context);
        const action = command.path === TASK_PREVIEW_TRANSPORT_PATHS.issue ? "issue" : "revoke";
        if (parent.aborted || types.isProxy(accept) || typeof accept !== "function" || command.exp - command.iat !== 30 ||
            command.scope.principal.userId !== principal.userId || command.scope.principal.sessionId !== principal.sessionId ||
            (bound && !sameTaskPreviewScope(bound, command.scope)) || nonces.has(command.jti) ||
            (action === "issue" ? issued || revoked : revoked)) throw fail();
        // Consume the operation before any await; invalid calls cannot cancel
        // an admitted issue or consume its valid cleanup opportunity.
        bound ??= command.scope; nonces.add(command.jti); owned = new AbortController();
        if (action === "issue") { issued = true; issueController = owned; }
        else { revoked = true; issueController?.abort(); }
        const signal = AbortSignal.any([parent, owned.signal]);
        timer = setTimeout(() => owned!.abort(), TASK_PREVIEW_SIGNER_DEADLINE_MS);
        const wall = Date.now(), mono = performance.now();
        const check = () => {
          const elapsed = performance.now() - mono;
          if (signal.aborted || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= TASK_PREVIEW_SIGNER_DEADLINE_MS ||
              Math.abs(Date.now() - wall - elapsed) > 1000 || Date.now() >= command.exp * 1000) throw fail();
        };
        check();
        const encoded = header + "." + Buffer.from(JSON.stringify(command)).toString("base64url");
        const signingInput = Buffer.from(encoded), signing = new AbortController();
        const signSignal = AbortSignal.any([signal, signing.signal]);
        const signDeadline = performance.now() + TASK_PREVIEW_SIGNATURE_DEADLINE_MS;
        const checkSignature = () => { check(); if (signSignal.aborted || performance.now() >= signDeadline) throw fail(); };
        const signTimer = setTimeout(() => signing.abort(), TASK_PREVIEW_SIGNATURE_DEADLINE_MS);
        try {
          prepared = await consumeValue<Uint8Array, { token: string }>({ signal: signSignal,
            consume: deliver => consume(Object.freeze({ algorithm: "RS256", keyId: identity.keyId, signingInput }), { signal: signSignal }, deliver),
            use: async rawSignature => {
              checkSignature();
              if (types.isProxy(rawSignature) || !types.isUint8Array(rawSignature) || rawSignature.byteLength !== signatureBytes) throw fail();
              const signature = Buffer.from(rawSignature);
              try {
                const token = encoded + "." + signature.toString("base64url");
                const verified = await verify(token, action, projectRef, instanceId); checkSignature();
                if (JSON.stringify(verified) !== JSON.stringify(command)) throw fail();
                return { token };
              } finally { signature.fill(0); }
            },
            dispose: async value => { value.token = ""; },
          });
          checkSignature();
        } finally { clearTimeout(signTimer); signing.abort(); signingInput.fill(0); }
        // No consumer IO until the signing dependency has fully completed.
        check();
        await verify(prepared.token, action, projectRef, instanceId); check();
        await boundedUse(prepared.token, accept, signal, check); check();
      } catch { throw fail(); }
      finally { if (prepared) prepared.token = ""; clearTimeout(timer); owned?.abort(); }
    },
  });
}
function parentSignal(context: Context): AbortSignal {
  const signal = record(context, ["signal"]).signal;
  if (types.isProxy(signal) || !(signal instanceof AbortSignal)) throw fail();
  try { Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!.call(signal); } catch { throw fail(); }
  return signal;
}
async function boundedUse(token: string, accept: (token: string) => Promise<void>, signal: AbortSignal, check: () => void) {
  let stop!: () => void;
  const aborted = new Promise<never>((_, reject) => { stop = () => reject(fail()); });
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  try { await Promise.race([Promise.resolve().then(() => { check(); return accept(token); }), aborted]); }
  finally { signal.removeEventListener("abort", stop); }
}
