import "server-only";
import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { request as httpsRequest, type RequestOptions } from "node:https";
import type { IncomingMessage } from "node:http";
import { performance } from "node:perf_hooks";
import { checkServerIdentity, type ConnectionOptions, type PeerCertificate, type TLSSocket } from "node:tls";
import { types } from "node:util";
import { createTaskPreviewAssertionVerifier, parseTaskPreviewCallerIdentity, parseTaskPreviewWireDelivery, parseTaskPreviewWireScope,
  sameTaskPreviewScope, taskPreviewProject, taskPreviewWireRecord as record, TASK_PREVIEW_TRANSPORT_PATHS,
  type TaskPreviewAction, type TaskPreviewCallerIdentity, type TaskPreviewCommand } from "./communication-note-task-preview-protocol.server";
import { consumeJobStatusCustodyValue as consumeValue } from "./v1/communication-note-job-status-custody-consumer.server";
import type { CommunicationNoteTaskLeaseCustody as Custody, CommunicationNoteTaskLeaseScope as Scope,
  CommunicationNoteTaskLeaseDelivery as Delivery, CommunicationNoteTaskLeaseRevocation as Revocation } from "./communication-note-workspace-task-lease.server";

export const COMMUNICATION_NOTE_TASK_PREVIEW_CLIENT_READY = false as const;
export const TASK_PREVIEW_CLIENT_DEADLINE_MS = 7500;
type Context = Readonly<{ signal: AbortSignal }>;
export type TaskPreviewClientOptions = Readonly<{
  projectRef: string; principal: Scope["principal"]; identity: TaskPreviewCallerIdentity; instanceId: string;
  serviceCa: Buffer; serviceCaSha256: string; serviceSpkiSha256: string;
  consumeAssertion(command: TaskPreviewCommand, context: Context, use: (assertion: string) => Promise<void>): Promise<void>;
}>;
const fail = () => new Error("Task Preview client unavailable");
const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const digest = (v: unknown): v is string => typeof v === "string" && v.length === 64 && /^[a-f0-9]{64}$/.test(v);

/** Uninstalled, one-lease backend client. An independently trusted backend
 * provides the verified Cookie principal, signer/key provenance, service CA,
 * leaf-SPKI pin and current instance binding. No key minting/discovery, listener,
 * cloud call on construction, issuer/control import, user-token fallback, env
 * credential lookup, generic fetch, redirect, connection pool or retry exists.
 *
 * An assertion is delivered once and verified against the EXACT command before
 * any HTTP request. Its bytes are sent only after authenticated pinned TLS.
 * Normal usage is the existing one-use task-lease read port: its finally phase
 * must call revoke even after ambiguous issue failure. Revoke aborts pending
 * issue, uses its own supplied cleanup signal and is possible before issue.
 * One instance allows at most one issue and one revoke; construct per read.
 * Revoke failure is never a physical-cleanup acknowledgment. The service owner
 * retains independent maintenance/recovery responsibility after process loss.
 */
export function createTaskPreviewHttpCustody(input: TaskPreviewClientOptions): Custody {
  const o = record(input, ["projectRef", "principal", "identity", "instanceId", "serviceCa", "serviceCaSha256", "serviceSpkiSha256", "consumeAssertion"]);
  const projectRef = taskPreviewProject(o.projectRef), identity = parseTaskPreviewCallerIdentity(o.identity), url = new URL(identity.origin);
  // Fixed DNS hostname and standard TLS port. No per-request destination input.
  if (url.port || !url.hostname.includes(".") || url.hostname.endsWith(".") || /[^a-z0-9.-]/.test(url.hostname) || /^[0-9.]+$/.test(url.hostname) ||
      !digest(o.instanceId) || !digest(o.serviceCaSha256) || !digest(o.serviceSpkiSha256) ||
      types.isProxy(o.serviceCa) || !Buffer.isBuffer(o.serviceCa) || !o.serviceCa.length || o.serviceCa.length > 65536 ||
      types.isProxy(o.consumeAssertion) || typeof o.consumeAssertion !== "function") throw fail();
  const ca = Buffer.from(o.serviceCa), instanceId = o.instanceId, pin = o.serviceSpkiSha256;
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(ca);
    // PEM line wrapping is not semantic; still accept exactly one certificate,
    // no appended private key/bundle, and pin the original supplied bytes.
    if (sha(ca) !== o.serviceCaSha256 || !certificate.ca || certificate.toString().replace(/\s/g, "") !== ca.toString().replace(/\s/g, "")) throw fail();
  } catch { throw fail(); }
  const principal = parseTaskPreviewWireScope({ requestId: "0".repeat(32), projectRef, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ",
    callerRole: "careslink_v1_generation_job_list_caller", principal: o.principal }, projectRef).principal;
  const consume = o.consumeAssertion as TaskPreviewClientOptions["consumeAssertion"], verify = createTaskPreviewAssertionVerifier(identity);
  let bound: Scope | undefined, issued = false, revoked = false, issueController: AbortController | undefined;
  const select = (raw: Scope, context: Context) => {
    const s = parseTaskPreviewWireScope(raw, projectRef), signal = parentSignal(context);
    if (signal.aborted || s.principal.userId !== principal.userId || s.principal.sessionId !== principal.sessionId || (bound && !sameTaskPreviewScope(bound, s))) throw fail();
    return { scope: s, signal };
  };
  const invoke = async (action: TaskPreviewAction, scope: Scope, parent: AbortSignal): Promise<Delivery | Revocation> => {
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, parent]);
    const timer = setTimeout(() => controller.abort(), TASK_PREVIEW_CLIENT_DEADLINE_MS);
    const wall = Date.now(), mono = performance.now();
    const check = () => {
      const elapsed = performance.now() - mono;
      if (signal.aborted || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= TASK_PREVIEW_CLIENT_DEADLINE_MS ||
          Math.abs(Date.now() - wall - elapsed) > 1000 || Date.now() < Date.parse(certificate.validFrom) || Date.now() >= Date.parse(certificate.validTo)) throw fail();
    };
    const seconds = Math.floor(wall / 1000);
    const command: TaskPreviewCommand = Object.freeze({ iss: identity.issuer, aud: identity.origin, sub: identity.subject,
      iat: seconds, nbf: seconds, exp: seconds + 30, jti: randomBytes(16).toString("hex"), instanceId,
      method: "POST", path: TASK_PREVIEW_TRANSPORT_PATHS[action], scope });
    let result: Delivery | Revocation | undefined;
    try {
      check();
      result = await consumeValue<string, Delivery | Revocation>({ signal,
        consume: use => consume(command, { signal }, use),
        use: async token => {
          check(); const verified = await verify(token, action, projectRef, instanceId); check();
          if (JSON.stringify(verified) !== JSON.stringify(command)) throw fail();
          const raw = await post(identity.origin + command.path, token, ca, pin, signal, check); check();
          return parseTaskPreviewWireDelivery(raw, scope, action);
        },
        dispose: async value => { if ("credential" in value) (value.credential as { password: string }).password = ""; },
      });
      check(); return result;
    } catch {
      if (result && "credential" in result) (result.credential as { password: string }).password = "";
      throw fail();
    }
    finally { clearTimeout(timer); controller.abort(); }
  };
  return Object.freeze({
    async issue(raw, context) {
      let owned: AbortController | undefined;
      try {
        const { scope, signal } = select(raw, context);
        if (issued || revoked) throw fail(); issued = true; bound = scope; owned = new AbortController(); issueController = owned;
        return await invoke("issue", scope, AbortSignal.any([signal, owned.signal])) as Delivery;
      } catch { throw fail(); }
      finally { owned?.abort(); }
    },
    async revoke(raw, context) {
      try {
        const { scope, signal } = select(raw, context);
        if (revoked) throw fail(); revoked = true; bound ??= scope; issueController?.abort();
        return await invoke("revoke", scope, signal) as Revocation;
      } catch { throw fail(); }
    },
  });
}
function parentSignal(context: Context): AbortSignal {
  const s = record(context, ["signal"]).signal;
  if (types.isProxy(s) || !(s instanceof AbortSignal)) throw fail();
  try { Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!.call(s); } catch { throw fail(); }
  return s;
}

/** A single owned Node HTTPS request; payload stays local until secureConnect.
 * Agent:false bypasses the global agent, proxy configuration and pooled TLS
 * sessions. Recheck the same socket and pin when accepting the response.
 */
async function post(url: string, token: string, ca: Buffer, pin: string, signal: AbortSignal, check: () => void): Promise<unknown> {
  check();
  return new Promise((resolve, reject) => {
    const host = new URL(url).hostname, body = Buffer.from(token), chunks: Buffer[] = [];
    let client: ReturnType<typeof httpsRequest> | undefined, response: IncomingMessage | undefined, socket: TLSSocket | undefined;
    let done = false, sent = false, size = 0;
    const finish = (value?: unknown, error = false) => {
      if (done) return; done = true; signal.removeEventListener("abort", abort);
      client?.destroy(); response?.destroy(); body.fill(0); chunks.forEach(c => c.fill(0)); chunks.length = 0;
      if (error || signal.aborted) reject(fail()); else resolve(value);
    };
    const abort = () => finish(undefined, true);
    const identity = (hostname: string, cert: PeerCertificate) => {
      try {
        if (hostname !== host || checkServerIdentity(host, cert) || !Buffer.isBuffer(cert.pubkey) || sha(cert.pubkey) !== pin) return fail();
        return undefined;
      } catch { return fail(); }
    };
    const secure = (candidate: TLSSocket) => {
      check();
      if (!candidate || candidate !== socket || candidate.encrypted !== true || candidate.authorized !== true || candidate.isSessionReused() ||
          !["TLSv1.2", "TLSv1.3"].includes(candidate.getProtocol() ?? "") || candidate.alpnProtocol !== "http/1.1" ||
          identity(host, candidate.getPeerCertificate())) throw fail();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      check();
      const options: RequestOptions & Pick<ConnectionOptions, "ALPNProtocols"> = { method: "POST", agent: false, ca: Buffer.from(ca), servername: host,
        rejectUnauthorized: true, minVersion: "TLSv1.2", ALPNProtocols: ["http/1.1"], checkServerIdentity: identity,
        maxHeaderSize: 8192, signal, headers: { "content-type": "application/jwt", accept: "application/json",
          "content-length": String(body.byteLength), "cache-control": "no-store", connection: "close" } };
      client = httpsRequest(url, options, incoming => {
        incoming.on("error", abort); incoming.once("aborted", abort); incoming.once("close", () => { if (!done) abort(); });
        if (done || response || !sent) { incoming.destroy(); abort(); return; }
        response = incoming;
        try {
          secure(incoming.socket as TLSSocket);
          const h = incoming.headers, length = h["content-length"];
          if (incoming.statusCode !== 200 || h["content-type"] !== "application/json" || h["cache-control"] !== "no-store" ||
              h["content-encoding"] !== undefined || h.location !== undefined || h["set-cookie"] !== undefined ||
              (length !== undefined && (typeof length !== "string" || !/^[1-9][0-9]{0,4}$/.test(length) || Number(length) > 8192))) throw fail();
          incoming.on("data", (chunk: unknown) => {
            if (done) return;
            try {
              check(); if (!types.isUint8Array(chunk)) throw fail(); size += (chunk as Uint8Array).byteLength;
              if (size > 8192) throw fail(); chunks.push(Buffer.from(chunk as Uint8Array));
            } catch { abort(); }
          });
          incoming.once("end", () => {
            if (done) return;
            try {
              secure(incoming.socket as TLSSocket);
              if (!incoming.complete || (length !== undefined && Number(length) !== size)) throw fail();
              const bytes = Buffer.concat(chunks);
              try {
                const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes), value = JSON.parse(text);
                if (JSON.stringify(value) !== text) throw fail(); // rejects duplicate keys/ambiguous JSON
                finish(value);
              } finally { bytes.fill(0); }
            } catch { abort(); }
          });
        } catch { abort(); }
      });
      for (const event of ["error", "timeout", "abort", "information", "upgrade", "connect"]) client.on(event, abort);
      client.once("socket", raw => {
        socket = raw as TLSSocket;
        socket.once("secureConnect", () => {
          if (done || sent) return;
          try { secure(socket!); sent = true; client!.end(body); } catch { abort(); }
        });
      });
      if (signal.aborted) abort();
    } catch { abort(); }
  });
}
