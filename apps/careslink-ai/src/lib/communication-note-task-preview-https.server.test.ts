import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, X509Certificate } from "node:crypto";
import type { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { ServerResponse } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { connect as tcpConnect, type Socket } from "node:net";
import { join } from "node:path";
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from "node:tls";
import { SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const processMock = vi.hoisted(() => ({ owner: undefined as unknown as EventEmitter & { exitCode?: number } }));
vi.mock("node:process", async () => {
  const { EventEmitter } = await import("node:events");
  processMock.owner = Object.assign(new EventEmitter(), { platform: "darwin", exit: vi.fn(), exitCode: undefined });
  return { default: processMock.owner };
});
import { createTaskPreviewHttpsService as compose, COMMUNICATION_NOTE_TASK_PREVIEW_HTTPS_READY,
  TASK_PREVIEW_HTTPS_CONNECTION_LIMIT as LIMIT, type TaskPreviewHttpsOptions } from "./communication-note-task-preview-https.server";
import { createCommunicationNoteTaskPreviewService as createService } from "./communication-note-task-preview-service.server";
import { ownTaskPreviewServiceProcess } from "./communication-note-task-preview-host.server";
import { TASK_PREVIEW_TRANSPORT_PATHS as PATHS, TASK_PREVIEW_TRANSPORT_JWT_TYPE as TYPE } from "./communication-note-task-preview-protocol.server";
import type { TaskPreviewIssuerBroker } from "./communication-note-task-preview-issuer.server";
import type { CommunicationNoteTaskLeaseScope as Scope } from "./communication-note-workspace-task-lease.server";

const REF = "abcdefghijklmnopqrst", HOST = "task-preview.invalid", ORIGIN = "https://" + HOST;
const ISSUER = "https://task-backend.invalid/", SUBJECT = "task-workspace-backend", KEY_ID = "test-assertion-v1";
const signing = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const instances: ReturnType<typeof compose>[] = [], sockets: Socket[] = [];
let dir: string, ca: Buffer, tls: TaskPreviewHttpsOptions["tls"];
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function bound<T>(work: Promise<T>, ms = 4000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LOCAL_TLS_TEST_TIMEOUT")), ms); })]); }
  finally { clearTimeout(timer); }
}
beforeAll(() => {
  dir = mkdtempSync("/private/tmp/cl-task-https-");
  const keys = () => generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" });
  writeFileSync(join(dir, "ca.key"), keys(), { mode: 0o600 }); writeFileSync(join(dir, "leaf.key"), keys(), { mode: 0o600 });
  writeFileSync(join(dir, "ca.conf"), "[req]\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\n[ca]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,keyCertSign,cRLSign\n");
  writeFileSync(join(dir, "leaf.conf"), "basicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:" + HOST + "\n");
  const openssl = (args: string[]) => execFileSync("/usr/bin/openssl", args, { cwd: dir, stdio: "ignore", timeout: 10000 });
  openssl(["req", "-new", "-x509", "-key", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=Task Local Test CA", "-config", "ca.conf"]);
  openssl(["req", "-new", "-key", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=" + HOST]);
  openssl(["x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-set_serial", "1", "-out", "leaf.pem", "-days", "1", "-extfile", "leaf.conf"]);
  ca = readFileSync(join(dir, "ca.pem")); const cert = readFileSync(join(dir, "leaf.pem"));
  tls = { cert, key: readFileSync(join(dir, "leaf.key")), certSha256: sha(cert), spkiSha256: sha(new X509Certificate(cert).publicKey.export({ type: "spki", format: "der" })) };
});
afterEach(async () => {
  sockets.splice(0).forEach(s => s.destroy());
  await bound(Promise.all(instances.splice(0).map(h => h.stop())), 10000); vi.restoreAllMocks(); vi.useRealTimers();
});
afterAll(() => { tls?.key.fill(0); if (dir) rmSync(dir, { recursive: true }); });
function scope(): Scope { return { requestId: randomBytes(16).toString("hex"), projectRef: REF,
  purpose: "COMMUNICATION_NOTE_JOB_LIST_READ", callerRole: "careslink_v1_generation_job_list_caller",
  principal: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" } }; }
function fixture() {
  type Lease = { scope: Scope; state: string; role: string | null; expiresAt: string | null; roleCount: number; sessionCount: number; membershipCount: number };
  const leases = new Map<string, Lease>(); let epoch: unknown, ready = false;
  const hooks: { before?: (op: string) => Promise<void>; after?: (op: string) => Promise<void> } = {};
  const call = vi.fn<TaskPreviewIssuerBroker["call"]>(async (op, data) => {
    await hooks.before?.(op);
    if (op === "start") { epoch = data.epoch; ready = false; return { projectRef: REF, epoch, ready }; }
    if (["inventory", "ready", "issue"].includes(op) && data.epoch !== epoch) throw new Error("STALE");
    if (op === "inventory") return { projectRef: REF, epoch, leases: [...leases.values()].filter(l => l.state !== "REVOKED")
      .map(({ scope, state, expiresAt }) => ({ scope, state, expiresAt })) };
    if (op === "ready") { ready = true; return { projectRef: REF, epoch, ready }; }
    const s = data.scope as Scope; let l = leases.get(s.requestId);
    if (l && JSON.stringify(l.scope) !== JSON.stringify(s)) throw new Error("SCOPE");
    if (op === "issue") { if (l || !ready) throw new Error("ISSUE"); l = { scope: s, state: "ISSUED", role: data.role as string,
      expiresAt: data.expiresAt as string, roleCount: 1, sessionCount: 0, membershipCount: 2 }; leases.set(s.requestId, l); }
    if (op === "fence") {
      if (!l) { l = { scope: s, state: "REVOKED", role: null, expiresAt: null, roleCount: 0, sessionCount: 0, membershipCount: 0 }; leases.set(s.requestId, l); }
      else if (l.state === "ISSUED") l.state = "FENCED";
    }
    if (op === "finalize") { if (!l || l.state === "ISSUED") throw new Error("FENCE");
      Object.assign(l, { state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 }); }
    await hooks.after?.(op); return { ...l };
  });
  const service = createService({ projectRef: REF, broker: { call } });
  const options: TaskPreviewHttpsOptions = { transport: { projectRef: REF, origin: ORIGIN, issuer: ISSUER, subject: SUBJECT, keyId: KEY_ID,
    publicKeyPem: signing.publicKey.export({ format: "pem", type: "spki" }).toString(), service },
    tls: { ...tls, cert: Buffer.from(tls.cert), key: Buffer.from(tls.key) }, listen: { host: "127.0.0.1", port: 0 } };
  const host = compose(options); instances.push(host);
  return { host, options, service, leases, call, hooks };
}
type Fixture = ReturnType<typeof fixture>;
async function token(h: Fixture, action: keyof typeof PATHS = "issue", s = scope()) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: ISSUER, aud: ORIGIN, sub: SUBJECT, iat: now, nbf: now, exp: now + 30, jti: randomBytes(16).toString("hex"),
    instanceId: h.host.instanceId, method: "POST", path: PATHS[action], scope: s }).setProtectedHeader({ alg: "RS256", typ: TYPE, kid: KEY_ID }).sign(signing.privateKey);
}
function post(h: Fixture, body: string, action: keyof typeof PATHS = "issue") {
  const pending = new Promise<{ status: number; headers: Record<string, unknown>; data: Record<string, unknown>; pin: string }>((resolve, reject) => {
    const options: RequestOptions & Pick<ConnectionOptions, "ALPNProtocols"> = { host: "127.0.0.1", port: h.host.address()!.port, servername: HOST, ca, rejectUnauthorized: true, agent: false,
      ALPNProtocols: ["http/1.1"], method: "POST", path: PATHS[action], headers: { host: HOST, "content-type": "application/jwt", accept: "application/json",
        "content-length": Buffer.byteLength(body), connection: "close" } };
    const req = httpsRequest(options, res => {
      const socket = res.socket as TLSSocket, pin = sha(socket.getPeerCertificate().pubkey!);
      expect(socket.authorized).toBe(true); expect(socket.alpnProtocol).toBe("http/1.1");
      let text = ""; res.on("data", b => { text += b.toString(); }); res.on("error", reject);
      res.once("end", () => { try { resolve({ status: res.statusCode!, headers: res.headers, data: JSON.parse(text), pin }); } catch (e) { reject(e); } });
    }); req.on("socket", s => sockets.push(s)); req.on("error", reject); req.end(body);
  }); return bound(pending);
}
function raw(h: Fixture, wire: string, overrides: ConnectionOptions = {}, end = false) {
  return bound(new Promise<string>((resolve, reject) => {
    const socket = tlsConnect({ host: "127.0.0.1", port: h.host.address()!.port, servername: HOST, ca, rejectUnauthorized: true,
      ALPNProtocols: ["http/1.1"], ...overrides }, () => { if (end) socket.end(wire); else socket.write(wire); });
    sockets.push(socket); let data = "";
    socket.on("data", b => { data += b.toString(); }); socket.on("error", reject); socket.once("close", () => resolve(data));
  }));
}
function wire(body = "invalid.jwt.body", path: string = PATHS.issue, changes: string[] = []) {
  return [`POST ${path} HTTP/1.1`, `Host: ${HOST}`, "Content-Type: application/jwt", "Accept: application/json", `Content-Length: ${Buffer.byteLength(body)}`,
    "Connection: close", ...changes, "", body].join("\r\n");
}
function cleaned(h: Fixture) { for (const l of h.leases.values()) expect(l).toMatchObject({ state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 }); }

it("constructs without listening/recovery and can stop before start", async () => {
  const h = fixture(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_HTTPS_READY).toBe(false);
  expect(h.host.address()).toBeUndefined(); expect(h.host.health().state).toBe("NEW"); expect(h.call).not.toHaveBeenCalled();
  expect(await h.host.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true }); expect(h.call).not.toHaveBeenCalled();
  await expect(h.host.start()).rejects.toThrow();
});
it("performs real CA-verified TLS and signed issue/revoke with the real service/issuer", async () => {
  const h = fixture(), s = scope(); await h.host.start();
  const issued = await post(h, await token(h, "issue", s)); expect(issued.status).toBe(200); expect(issued.pin).toBe(tls.spkiSha256);
  expect(issued.headers).toMatchObject({ "content-type": "application/json", "cache-control": "no-store", connection: "close" });
  expect(issued.headers).not.toHaveProperty("set-cookie"); expect(issued.headers).not.toHaveProperty("date");
  expect(issued.data).toMatchObject(s); expect(h.leases.get(s.requestId)?.state).toBe("ISSUED");
  expect((await post(h, await token(h, "revoke", s), "revoke")).data).toEqual({ ...s, status: "REVOKED" }); cleaned(h);
});
it("snapshots TLS/listen/identity bindings and refuses a second host for the same service", async () => {
  const h = fixture(); expect(() => compose(h.options)).toThrow();
  h.options.tls.cert.fill(0); h.options.tls.key.fill(0); Object.assign(h.options.listen, { host: "0.0.0.0", port: 443 });
  Object.assign(h.options.transport, { origin: "https://other.invalid" });
  await h.host.start(); expect((await post(h, await token(h))).status).toBe(200);
  await h.host.stop(); cleaned(h);
});
it("waits for recovery before exposing its listener", async () => {
  const h = fixture(), entered = deferred<void>(), release = deferred<void>();
  h.hooks.before = async op => { if (op === "inventory") { entered.resolve(); await release.promise; } };
  const starting = h.host.start(); await bound(entered.promise); expect(h.host.address()).toBeUndefined(); expect(h.host.health().state).toBe("STARTING");
  release.resolve(); await starting; expect(h.host.address()!.host).toBe("127.0.0.1");
});
it("never listens after startup failure or cancellation during recovery", async () => {
  const h = fixture(), entered = deferred<void>(); h.hooks.before = async op => { if (op === "inventory") { entered.resolve(); await new Promise(() => {}); } };
  const starting = h.host.start(); const rejected = expect(starting).rejects.toThrow("Task Preview HTTPS unavailable");
  await bound(entered.promise); const stopped = h.host.stop(); await rejected;
  expect((await stopped).state).toBe("FAILED"); expect(h.host.address()).toBeUndefined(); expect(h.call.mock.calls.some(([op]) => op === "issue")).toBe(false);
});
it.each(["bind", "production", "port", "origin-port", "cert", "key", "pin", "ca-cert", "extra", "getter", "proxy"])("rejects invalid fixed configuration: %s", mode => {
  const h = fixture(), options = { ...h.options, transport: { ...h.options.transport,
    service: createService({ projectRef: REF, broker: { call: h.call } }) }, listen: { ...h.options.listen }, tls: { ...h.options.tls } }, trap = vi.fn();
  if (mode === "bind") options.listen.host = "0.0.0.0";
  if (mode === "production") options.transport.projectRef = "adocsnwnslxhxcjgbyee";
  if (mode === "port") Object.assign(options.listen, { host: "10.0.0.1", port: 8000 });
  if (mode === "origin-port") options.transport.origin += ":8000";
  if (mode === "cert") options.tls.cert = Buffer.from("invalid");
  if (mode === "key") options.tls.key = Buffer.from("invalid");
  if (mode === "pin") options.tls.spkiSha256 = "0".repeat(64);
  if (mode === "ca-cert") Object.assign(options.tls, { cert: ca, certSha256: sha(ca) });
  if (mode === "extra") Object.assign(options, { enabled: true });
  if (mode === "getter") Object.defineProperty(options, "tls", { get: trap, enumerable: true });
  expect(() => compose(mode === "proxy" ? new Proxy(options, { ownKeys: trap }) : options)).toThrow(); expect(trap).not.toHaveBeenCalled(); expect(h.call).not.toHaveBeenCalled();
});
it.each([
  ["method", (w: string) => w.replace("POST ", "GET ")], ["path", (w: string) => w.replace(PATHS.issue, PATHS.issue + "?a=1")],
  ["absolute target", (w: string) => w.replace(PATHS.issue, ORIGIN + PATHS.issue)], ["host", (w: string) => w.replace(`Host: ${HOST}`, "Host: other.invalid")],
  ["duplicate host", (w: string) => w.replace("Accept:", `Host: ${HOST}\r\nAccept:`)],
  ["duplicate type", (w: string) => w.replace("Accept:", "Content-Type: application/jwt\r\nAccept:")],
  ["authorization", (w: string) => w.replace("Accept:", "Authorization: Bearer synthetic\r\nAccept:")],
  ["forwarded identity", (w: string) => w.replace("Accept:", "X-Forwarded-Host: task-preview.invalid\r\nAccept:")],
  ["transfer encoding", (w: string) => w.replace("Accept:", "Transfer-Encoding: chunked\r\nAccept:")],
  ["continue", (w: string) => w.replace("Accept:", "Expect: 100-continue\r\nAccept:")],
  ["upgrade", (w: string) => w.replace("Connection: close", "Connection: upgrade\r\nUpgrade: websocket")],
  ["long header", (w: string) => w.replace("Accept:", `X-Fill: ${"a".repeat(8192)}\r\nAccept:`)],
  ["oversized body", (w: string) => w.replace(/Content-Length: \d+/, "Content-Length: 16385")],
  ["duplicate length", (w: string) => w.replace("Content-Length:", "Content-Length: 1\r\nContent-Length:")],
] as const)("rejects raw HTTPS %s before custody", async (_name, change) => {
  const h = fixture(); await h.host.start();
  // A valid assertion makes header/framing rejection observable independently
  // of the endpoint's signature rejection.
  const response = await raw(h, change(wire(await token(h)))); expect(response).not.toContain("200 OK"); expect(h.leases.size).toBe(0);
});
it("does not mistake a partial body or a second pipelined request for a signed command", async () => {
  const h = fixture(); await h.host.start(); const valid = await token(h);
  await raw(h, wire(valid).replace(/Content-Length: \d+/, `Content-Length: ${Buffer.byteLength(valid) + 1}`), {}, true);
  // First request has an invalid assertion; the second is valid and must never
  // reach custody on the already-used connection.
  await raw(h, wire() + wire(valid)); expect(h.leases.size).toBe(0);
});
it.each([{ servername: "other.invalid" }, { servername: "" }, { ALPNProtocols: ["h2"] }, { ALPNProtocols: [] }, { ca: Buffer.from("invalid") }])(
  "rejects an untrusted TLS negotiation: %#", async config => {
    const h = fixture(); await h.host.start();
    const result = await raw(h, wire(await token(h)), config).catch(error => {
      if (error instanceof Error && error.message === "LOCAL_TLS_TEST_TIMEOUT") throw error;
      return "TLS_REJECTED";
    });
    expect(result).not.toContain("200 OK"); expect(h.leases.size).toBe(0);
  });
it("bounds incomplete handshakes and rejects cleartext", async () => {
  const h = fixture(); await h.host.start();
  const attempt = (bytes?: string) => bound(new Promise<void>(resolve => {
    const s = tcpConnect(h.host.address()!.port, "127.0.0.1", () => { if (bytes) s.write(bytes); }); sockets.push(s);
    s.on("error", () => {}); s.once("close", () => resolve());
  }));
  await attempt("GET / HTTP/1.1\r\n\r\n"); await attempt(); expect(h.leases.size).toBe(0);
});
it("caps connections with incomplete requests and joins owned socket shutdown", async () => {
  const h = fixture(); await h.host.start();
  const held = await Promise.all(Array.from({ length: LIMIT }, () => new Promise<Socket>(resolve => {
    const s = tlsConnect({ host: "127.0.0.1", port: h.host.address()!.port, servername: HOST, ca, rejectUnauthorized: true, ALPNProtocols: ["http/1.1"] }, () => {
      // Complete headers keep this request within the longer body deadline.
      s.write(wire().replace(/Content-Length: \d+/, "Content-Length: 100")); resolve(s);
    }); sockets.push(s); s.on("error", () => {});
  })));
  // A valid additional request would succeed if the connection cap were absent.
  const extra = await post(h, await token(h)).then(() => "ADMITTED", error => {
    if (error instanceof Error && error.message === "LOCAL_TLS_TEST_TIMEOUT") throw error;
    return "REJECTED";
  }); expect(extra).toBe("REJECTED"); expect(h.leases.size).toBe(0);
  const closed = Promise.all(held.map(s => new Promise<void>(resolve => { if (s.destroyed) resolve(); else s.once("close", () => resolve()); })));
  expect(await h.host.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true }); await bound(closed); expect(h.host.address()).toBeUndefined();
  const other = fixture(); await other.host.start();
  const handshake = await bound(new Promise<Socket>(resolve => { const s = tcpConnect(other.host.address()!.port, "127.0.0.1", () => resolve(s));
    sockets.push(s); s.on("error", () => {}); }));
  const handshakeClosed = new Promise<void>(resolve => handshake.once("close", () => resolve()));
  expect(await other.host.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true }); await bound(handshakeClosed);
});
it("independently drains a committed issue after the TLS client disconnects", async () => {
  const h = fixture(), entered = deferred<void>(), release = deferred<void>(); await h.host.start();
  h.hooks.after = async op => { if (op === "issue") { entered.resolve(); await release.promise; } };
  const pending = post(h, await token(h)); const rejected = expect(pending).rejects.toThrow();
  await bound(entered.promise);
  const signal = h.call.mock.calls.find(([op]) => op === "issue")![2].signal;
  const cancelled = new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
  sockets.at(-1)!.destroy(); await bound(cancelled); release.resolve(); await rejected;
  expect((await bound(h.host.finished)).state).toBe("FAILED"); cleaned(h); expect(h.host.address()).toBeUndefined();
});
it("drains when a successful credential response cannot flush", async () => {
  const h = fixture(); await h.host.start();
  vi.spyOn(ServerResponse.prototype, "end").mockImplementationOnce(function(this: ServerResponse) { this.destroy(); return this; });
  await expect(post(h, await token(h))).rejects.toThrow();
  expect(await bound(h.host.finished)).toEqual({ state: "FAILED", cleanupConfirmed: true }); expect(h.leases.size).toBe(1); cleaned(h);
});
it("does not claim cleanup after a failed service drain", async () => {
  const h = fixture(); await h.host.start(); await post(h, await token(h));
  h.hooks.before = async op => { if (op === "fence") throw new Error("SYNTHETIC_DRAIN_FAILURE"); };
  expect(await h.host.stop()).toEqual({ state: "FAILED", cleanupConfirmed: false }); expect(h.host.address()).toBeUndefined();
  expect([...h.leases.values()][0].state).toBe("ISSUED");
});
it("stops its listener on autonomous service completion and cannot restart", async () => {
  const h = fixture(), flushed = deferred<void>(), end = ServerResponse.prototype.end;
  vi.spyOn(ServerResponse.prototype, "end").mockImplementationOnce(function(this: ServerResponse, ...args: Parameters<typeof end>) {
    // Client response end can precede server finish. Let the real finish event
    // and its promise continuations complete before requesting autonomous stop.
    this.once("finish", () => setImmediate(() => flushed.resolve()));
    return end.apply(this, args);
  });
  await h.host.start(); expect((await post(h, await token(h))).status).toBe(200);
  await bound(flushed.promise); await h.service.stop();
  expect(await h.host.finished).toEqual({ state: "STOPPED", cleanupConfirmed: true }); cleaned(h); await expect(h.host.start()).rejects.toThrow();
});
it("retains separate scopes and rejects replay through actual concurrent TLS connections", async () => {
  const h = fixture(); await h.host.start(); const a = scope(), b = { ...scope(), principal: { ...scope().principal, userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } };
  const tokens = await Promise.all([token(h, "issue", a), token(h, "issue", b)]);
  expect((await Promise.all(tokens.map(t => post(h, t)))).map(r => r.data.principal)).toEqual([a.principal, b.principal]);
  expect((await post(h, tokens[0])).status).toBe(503); expect(h.leases.size).toBe(2); await h.host.stop(); cleaned(h);
});
it("closes slow headers and incomplete bodies at their absolute deadlines", { timeout: 12000 }, async () => {
  const h = fixture(); await h.host.start();
  expect(await raw(h, "POST " + PATHS.issue + " HTTP/1.1\r\nHost: ")).not.toContain("200 OK");
  const started = Date.now();
  const result = await bound(new Promise<string>((resolve, reject) => {
    const socket = tlsConnect({ host: "127.0.0.1", port: h.host.address()!.port, servername: HOST, ca, ALPNProtocols: ["http/1.1"] },
      () => socket.write(wire().replace(/Content-Length: \d+/, "Content-Length: 100")));
    sockets.push(socket); let data = ""; socket.on("data", b => { data += b; }); socket.on("error", reject); socket.once("close", () => resolve(data));
  }), 9000);
  expect(result).not.toContain("200 OK"); expect(Date.now() - started).toBeLessThan(9000); expect(h.leases.size).toBe(0);
});
it("joins real listener closure and service drain under the existing process owner on SIGTERM", async () => {
  const h = fixture(), owner = ownTaskPreviewServiceProcess(h.host, "TASK_PREVIEW_DEDICATED_NODE_PROCESS");
  await owner.ready; const port = h.host.address()!.port; await post(h, await token(h)); processMock.owner.emit("SIGTERM");
  expect(owner.health().state).toBe("STOPPING"); expect(await owner.finished).toEqual({ state: "STOPPED", cleanupConfirmed: true });
  expect(processMock.owner.exitCode).toBe(0); expect(processMock.owner.eventNames()).toEqual([]); cleaned(h);
  await bound(new Promise<void>((resolve, reject) => { const s = tcpConnect(port, "127.0.0.1", () => { s.destroy(); reject(new Error("LISTENER_REMAINED")); });
    sockets.push(s); s.once("error", () => resolve()); }));
});
it("fails a conflicting bind without closing an unrelated listener", async () => {
  const a = fixture(), b = fixture(); await a.host.start();
  const host = compose({ ...b.options, transport: { ...b.options.transport, service: createService({ projectRef: REF, broker: { call: b.call } }) },
    listen: { host: "127.0.0.1", port: a.host.address()!.port } }); instances.push(host);
  await expect(host.start()).rejects.toThrow("Task Preview HTTPS unavailable");
  expect(await host.finished).toEqual({ state: "FAILED", cleanupConfirmed: true }); expect((await post(a, await token(a))).status).toBe(200);
});
it("does not resolve finished merely because the listener closed while drain is pending", async () => {
  const h = fixture(), entered = deferred<void>(), release = deferred<void>(); await h.host.start(); await post(h, await token(h));
  h.hooks.before = async op => { if (op === "fence") { entered.resolve(); await release.promise; } };
  let done = false; void h.host.finished.then(() => { done = true; }); const stopped = h.host.stop(); await bound(entered.promise);
  expect(h.host.address()).toBeUndefined(); expect(done).toBe(false); release.resolve();
  expect(await stopped).toEqual({ state: "STOPPED", cleanupConfirmed: true }); cleaned(h);
});
it("bounds an uncooperative startup without opening a listener", async () => {
  const h = fixture(), service = createService({ projectRef: REF, broker: { call: h.call } });
  const host = compose({ ...h.options, transport: { ...h.options.transport, service: { ...service, start: () => new Promise(() => {}) } } }); instances.push(host);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const rejected = expect(host.start()).rejects.toThrow("Task Preview HTTPS unavailable"); await vi.advanceTimersByTimeAsync(35000); await rejected;
  expect(await host.finished).toEqual({ state: "FAILED", cleanupConfirmed: true }); expect(host.address()).toBeUndefined(); expect(h.call).not.toHaveBeenCalled();
});
it("bounds an uncooperative drain without turning late cleanup into earlier success", async () => {
  const h = fixture(), service = createService({ projectRef: REF, broker: { call: h.call } });
  const late = deferred<Awaited<typeof service.finished>>();
  const host = compose({ ...h.options, transport: { ...h.options.transport, service: { ...service, stop: () => late.promise } } }); instances.push(host);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await host.start(); const stopped = host.stop(); await vi.advanceTimersByTimeAsync(35000);
  expect(await stopped).toEqual({ state: "FAILED", cleanupConfirmed: false }); expect(host.address()).toBeUndefined();
  late.resolve(await service.stop()); await Promise.resolve(); expect(await host.finished).toEqual({ state: "FAILED", cleanupConfirmed: false });
});
it("keeps the HTTPS host uninstalled and outside client/formal runtime imports", () => {
  const name = "communication-note-task-preview-https", walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual([]);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.(?:env|on)|readFile|writeFile|generateKeyPair|console\.|from .*task-preview-(?:gcp|client|signer)\.server/);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
});
