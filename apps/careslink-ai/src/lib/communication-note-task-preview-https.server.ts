import "server-only";
import { constants, createHash, createPrivateKey, X509Certificate } from "node:crypto";
import { createServer, type Server } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import { TLSSocket } from "node:tls";
import { types } from "node:util";
import { createTaskPreviewAuthenticatedEndpoint, type TaskPreviewTransportOptions } from "./communication-note-task-preview-transport.server";
import { parseTaskPreviewCallerIdentity, taskPreviewWireRecord as record, TASK_PREVIEW_TRANSPORT_PATHS as PATHS } from "./communication-note-task-preview-protocol.server";
import type { createCommunicationNoteTaskPreviewService } from "./communication-note-task-preview-service.server";

export const COMMUNICATION_NOTE_TASK_PREVIEW_HTTPS_READY = false as const;
export const TASK_PREVIEW_HTTPS_CONNECTION_LIMIT = 16;
export const TASK_PREVIEW_HTTPS_HANDSHAKE_MS = 1000;
export const TASK_PREVIEW_HTTPS_REQUEST_MS = 7000;
export const TASK_PREVIEW_HTTPS_SOCKET_MS = 7500;
export const TASK_PREVIEW_HTTPS_LIFECYCLE_MS = 35000;
type Service = ReturnType<typeof createCommunicationNoteTaskPreviewService>;
type Outcome = Awaited<Service["finished"]>;
type State = ReturnType<Service["health"]>["state"];
export type TaskPreviewHttpsOptions = Readonly<{
  transport: Omit<TaskPreviewTransportOptions, "service"> & { service: Service };
  tls: Readonly<{ cert: Buffer; key: Buffer; certSha256: string; spkiSha256: string }>;
  listen: Readonly<{ host: string; port: number }>;
}>;
const fail = () => new Error("Task Preview HTTPS unavailable");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const claimed = new WeakSet<object>();

/** Uninstalled dedicated-host assembly. Construction validates/copies explicit
 * bindings without listening, starting the service or owning the process.
 * The existing dedicated-process owner can own this lifecycle. Recovery must
 * complete before listen; finished joins listener closure and service drain.
 * Bindings and certificate possession do NOT prove host/key provenance. No
 * environment discovery, certificate issuance, public health/instance route,
 * product install or external supervisor is provided. Loopback ephemeral ports
 * support local TLS tests; other private IPv4 listeners require port 443.
 *
 * TLS keys are supplied by the separately trusted owner. Owned PEM copies are
 * cleared after TLS setup/stop; native TLS state and immutable copies cannot be
 * erased by this module. Failed delivery before flush stops/drains the service;
 * a response lost after flush still needs caller revoke and independent recovery.
 */
export function createTaskPreviewHttpsService(input: TaskPreviewHttpsOptions) {
  let tls: ReturnType<typeof snapshotTls> | undefined;
  try {
    const o = record(input, ["transport", "tls", "listen"]);
    const t = record(o.transport, ["projectRef", "origin", "issuer", "subject", "keyId", "publicKeyPem", "service"]);
    const identity = parseTaskPreviewCallerIdentity(Object.fromEntries(["origin", "issuer", "subject", "keyId", "publicKeyPem"].map(k => [k, t[k]])));
    const url = new URL(identity.origin), listen = snapshotListen(o.listen);
    if (url.port || !url.hostname.includes(".") || url.hostname.endsWith(".") || /[^a-z0-9.-]/.test(url.hostname) || /^[0-9.]+$/.test(url.hostname)) throw fail();
    tls = snapshotTls(o.tls, url.hostname, identity.publicKeyPem);
    const s = record(t.service, ["custody", "finished", "start", "stop", "health"]);
    const c = record(s.custody, ["issue", "revoke"]);
    for (const fn of [s.start, s.stop, s.health, c.issue, c.revoke]) if (typeof fn !== "function" || types.isProxy(fn)) throw fail();
    if (types.isProxy(s.finished) || !(s.finished instanceof Promise) || claimed.has(t.service as object)) throw fail();
    const service = Object.freeze({ start: s.start, stop: s.stop, health: s.health, finished: s.finished,
      custody: Object.freeze({ issue: c.issue, revoke: c.revoke }) }) as Service;
    if (service.health().state !== "NEW") throw fail();
    const endpoint = createTaskPreviewAuthenticatedEndpoint({ projectRef: t.projectRef as string, ...identity, service });
    claimed.add(t.service as object);
    return assemble(service, endpoint, identity.origin, url.hostname, listen, tls);
  } catch { tls?.key.fill(0); throw fail(); }
}

function assemble(service: Service, endpoint: ReturnType<typeof createTaskPreviewAuthenticatedEndpoint>, origin: string,
  hostname: string, listen: { host: string; port: number }, tls: ReturnType<typeof snapshotTls>) {
  let state: State = "NEW", fault = false, confirmed = false, server: Server | undefined;
  let stopping: Promise<Outcome> | undefined;
  const lifetime = new AbortController(), sockets = new Set<Duplex>(), requests = new Set<AbortController>();
  let complete!: (value: Outcome) => void;
  const finished = new Promise<Outcome>(resolve => { complete = resolve; });
  const stop = (failed = false): Promise<Outcome> => {
    fault ||= failed;
    if (stopping) return stopping;
    state = "STOPPING"; lifetime.abort(); endpoint.close(); tls.key.fill(0);
    for (const c of requests) c.abort();
    const closed = new Promise<void>(resolve => {
      if (!server) { resolve(); return; }
      server.close(() => resolve());
      // Includes incomplete handshakes and rejected upgrades, not only HTTP.
      for (const socket of sockets) socket.destroy();
    });
    let drain: Promise<Outcome>;
    try { drain = service.stop(); } catch { drain = Promise.reject(fail()); }
    stopping = (async () => {
      try {
        const [, outcome] = await bounded(Promise.all([closed, drain]), TASK_PREVIEW_HTTPS_LIFECYCLE_MS);
        confirmed = outcome.cleanupConfirmed;
        fault ||= outcome.state !== "STOPPED" || !confirmed;
      } catch { fault = true; confirmed = false; }
      state = fault ? "FAILED" : "STOPPED";
      const outcome = Object.freeze({ state, cleanupConfirmed: confirmed }) as Outcome;
      complete(outcome); return outcome;
    })();
    return stopping;
  };
  void service.finished.then(outcome => stop(outcome.state !== "STOPPED" || !outcome.cleanupConfirmed), () => stop(true));
  const used = new WeakSet<Socket>();
  const serve = (req: IncomingMessage, res: ServerResponse) => {
    const controller = new AbortController(); requests.add(controller);
    const abort = () => controller.abort();
    req.on("error", abort); req.once("aborted", abort); res.on("error", abort); res.once("close", abort);
    const started = performance.now();
    const timer = setTimeout(abort, TASK_PREVIEW_HTTPS_REQUEST_MS);
    const check = () => {
      if (controller.signal.aborted || lifetime.signal.aborted || state !== "READY" || !["READY", "SWEEPING"].includes(service.health().state) ||
          performance.now() - started >= TASK_PREVIEW_HTTPS_REQUEST_MS ||
          Date.now() < Date.parse(tls.certificate.validFrom) || Date.now() >= Date.parse(tls.certificate.validTo)) throw fail();
    };
    let successful = false, sent = false, body: Buffer | undefined, responseBytes: Buffer | undefined;
    void (async () => {
      try {
        check();
        if (used.has(req.socket)) throw fail(); used.add(req.socket);
        const headers = validateRequest(req, hostname);
        body = await readBody(req, controller.signal, Number(headers.get("content-length"))); check();
        const bytes = new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength);
        const response = await endpoint.handle(new Request(origin + req.url, { method: "POST", headers, body: bytes, signal: controller.signal }));
        successful = response.status === 200; check();
        responseBytes = Buffer.from(await response.arrayBuffer()); check();
        if (![200, 503].includes(response.status) || responseBytes.length > 8192) throw fail();
        await writeResponse(res, response.status, responseBytes, controller.signal); sent = true;
      } catch {
        // A successful assertion response lost before flush is ambiguous. The
        // service drain has its own lifetime and handles every outstanding lease.
        if (successful && !sent) void stop(true);
        res.destroy(); req.destroy();
      } finally {
        clearTimeout(timer); controller.abort(); requests.delete(controller);
        body?.fill(0); responseBytes?.fill(0);
        req.removeListener("aborted", abort); res.removeListener("close", abort);
      }
    })();
  };
  return Object.freeze({ custody: service.custody, instanceId: endpoint.instanceId, finished,
    health() { const source = service.health(); return Object.freeze({ state: state === "READY" ? source.state : state,
      reason: source.reason, cleanupConfirmed: confirmed }); },
    address() { const address = server?.address(); return state === "READY" && address && typeof address !== "string" ?
      Object.freeze({ host: address.address, port: address.port }) : undefined; },
    async start() {
      if (state !== "NEW") throw fail(); state = "STARTING";
      try {
        await bounded(service.start(), TASK_PREVIEW_HTTPS_LIFECYCLE_MS, lifetime.signal);
        if (lifetime.signal.aborted || service.health().state !== "READY") throw fail();
        server = createServer({ cert: tls.cert, key: tls.key, minVersion: "TLSv1.2", maxVersion: "TLSv1.3",
          secureOptions: constants.SSL_OP_NO_TICKET, ALPNProtocols: ["http/1.1"],
          handshakeTimeout: TASK_PREVIEW_HTTPS_HANDSHAKE_MS, maxHeaderSize: 8192,
          headersTimeout: 1000, requestTimeout: TASK_PREVIEW_HTTPS_REQUEST_MS, connectionsCheckingInterval: 250,
          SNICallback(name, callback) { callback(name === hostname ? null : fail()); },
        }, serve);
        tls.key.fill(0);
        server.maxConnections = TASK_PREVIEW_HTTPS_CONNECTION_LIMIT; server.maxRequestsPerSocket = 1;
        server.maxHeadersCount = 0; // Reject raw header count ourselves; never silently truncate headers.
        server.on("error", () => { void stop(true); });
        server.on("connection", socket => {
          if (lifetime.signal.aborted) { socket.destroy(); return; }
          sockets.add(socket);
          const timer = setTimeout(() => socket.destroy(), TASK_PREVIEW_HTTPS_SOCKET_MS);
          socket.on("error", () => {});
          socket.once("close", () => { clearTimeout(timer); sockets.delete(socket); });
        });
        server.on("secureConnection", socket => {
          if (lifetime.signal.aborted || socket.servername !== hostname || socket.alpnProtocol !== "http/1.1" || socket.isSessionReused() ||
              Date.now() < Date.parse(tls.certificate.validFrom) || Date.now() >= Date.parse(tls.certificate.validTo)) socket.destroy();
        });
        server.on("clientError", (_error, socket) => socket.destroy());
        server.on("tlsClientError", (_error, socket) => socket.destroy());
        for (const event of ["upgrade", "connect", "checkContinue", "checkExpectation", "dropRequest"] as const)
          server.on(event, (req: IncomingMessage) => req.socket.destroy());
        await bounded(new Promise<void>((resolve, reject) => {
          server!.once("error", reject);
          server!.listen({ ...listen, signal: lifetime.signal }, () => { server!.removeListener("error", reject); resolve(); });
        }), TASK_PREVIEW_HTTPS_LIFECYCLE_MS, lifetime.signal);
        if (lifetime.signal.aborted || service.health().state !== "READY") throw fail(); state = "READY";
      } catch { await stop(true); throw fail(); }
      finally { tls.key.fill(0); }
    },
    stop: () => stop(),
  });
}

function snapshotListen(value: unknown) {
  const o = record(value, ["host", "port"]), host = o.host;
  if (typeof host !== "string" || isIP(host) !== 4 || typeof o.port !== "number" || !Number.isInteger(o.port)) throw fail();
  const parts = host.split(".").map(Number), loopback = host === "127.0.0.1";
  const privateIp = parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  if (loopback ? o.port < 0 || o.port > 65535 : !privateIp || o.port !== 443) throw fail();
  return Object.freeze({ host, port: o.port });
}
function snapshotTls(value: unknown, hostname: string, signingPublicKey: string) {
  const o = record(value, ["cert", "key", "certSha256", "spkiSha256"]);
  for (const v of [o.cert, o.key]) if (types.isProxy(v) || !Buffer.isBuffer(v) || !v.length || v.length > 65536) throw fail();
  const cert = Buffer.from(o.cert as Buffer), key = Buffer.from(o.key as Buffer);
  try {
    const certificate = new X509Certificate(cert), privateKey = createPrivateKey(key);
    if (sha(cert) !== o.certSha256 || certificate.ca || certificate.checkHost(hostname, { wildcards: false, subject: "never" }) !== hostname ||
        certificate.toString().replace(/\s/g, "") !== cert.toString().replace(/\s/g, "") ||
        privateKey.export({ format: "pem", type: "pkcs8" }).toString().replace(/\s/g, "") !== key.toString().replace(/\s/g, "") ||
        privateKey.asymmetricKeyType !== "rsa" || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
        !certificate.checkPrivateKey(privateKey) || sha(certificate.publicKey.export({ format: "der", type: "spki" })) !== o.spkiSha256 ||
        certificate.publicKey.export({ format: "pem", type: "spki" }).toString() === signingPublicKey ||
        Date.now() < Date.parse(certificate.validFrom) || Date.now() >= Date.parse(certificate.validTo)) throw fail();
    return { cert, key, certificate };
  } catch { key.fill(0); throw fail(); }
}
function validateRequest(req: IncomingMessage, hostname: string) {
  const socket = req.socket as TLSSocket;
  if (!(socket instanceof TLSSocket) || !socket.encrypted || socket.servername !== hostname || socket.alpnProtocol !== "http/1.1" ||
      !["TLSv1.2", "TLSv1.3"].includes(socket.getProtocol() ?? "") || req.httpVersion !== "1.1" || req.method !== "POST" ||
      ![PATHS.issue, PATHS.revoke].includes(req.url as typeof PATHS.issue) || req.rawHeaders.length > 32) throw fail();
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase(), value = req.rawHeaders[i + 1];
    if (headers.has(name) || !["host", "content-length", "content-type", "accept", "cache-control", "connection"].includes(name)) throw fail();
    headers.set(name, value);
  }
  if (headers.get("host") !== hostname || headers.get("content-type") !== "application/jwt" || headers.get("accept") !== "application/json" ||
      !/^[1-9][0-9]{0,4}$/.test(headers.get("content-length") ?? "") || Number(headers.get("content-length")) > 16384 ||
      (headers.has("connection") && headers.get("connection") !== "close") ||
      (headers.has("cache-control") && headers.get("cache-control") !== "no-store")) throw fail();
  return headers;
}
async function readBody(req: IncomingMessage, signal: AbortSignal, length: number) {
  const chunks: Buffer[] = []; let size = 0;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const abort = () => { cleanup(); reject(fail()); req.destroy(); };
      const data = (chunk: Buffer) => {
        size += chunk.length;
        if (size > length || size > 16384) { abort(); return; }
        chunks.push(Buffer.from(chunk));
      };
      const end = () => { cleanup(); if (size === length && req.complete) resolve(Buffer.concat(chunks)); else reject(fail()); };
      const cleanup = () => { signal.removeEventListener("abort", abort); req.removeListener("data", data); req.removeListener("end", end);
        req.removeListener("error", abort); req.removeListener("aborted", abort); };
      signal.addEventListener("abort", abort, { once: true }); req.on("data", data); req.once("end", end); req.once("error", abort); req.once("aborted", abort);
      if (signal.aborted) abort();
    });
  } finally { chunks.forEach(c => c.fill(0)); }
}
async function writeResponse(res: ServerResponse, status: number, bytes: Buffer, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const abort = () => { cleanup(); reject(fail()); res.destroy(); };
    const done = () => { cleanup(); resolve(); };
    const cleanup = () => { signal.removeEventListener("abort", abort); res.removeListener("finish", done); res.removeListener("close", abort); res.removeListener("error", abort); };
    signal.addEventListener("abort", abort, { once: true }); res.once("finish", done); res.once("close", abort); res.once("error", abort);
    if (signal.aborted) { abort(); return; }
    try {
      res.sendDate = false;
      res.writeHead(status, { "content-type": "application/json", "content-length": bytes.length, "cache-control": "no-store", pragma: "no-cache",
        "x-content-type-options": "nosniff", connection: "close" }); res.end(bytes);
    } catch { abort(); }
  });
}
async function bounded<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined, abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => { abort = () => reject(fail()); timer = setTimeout(abort, ms); });
  signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
  try { return await Promise.race([work, cancelled]); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
