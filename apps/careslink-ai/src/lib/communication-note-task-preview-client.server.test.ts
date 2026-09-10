import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import type { RequestOptions } from "node:https";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { rootCertificates, type PeerCertificate } from "node:tls";
import { decodeJwt, SignJWT } from "jose";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:https", () => ({ request: network.request }));
import { createTaskPreviewHttpCustody as createClient, COMMUNICATION_NOTE_TASK_PREVIEW_CLIENT_READY,
  type TaskPreviewClientOptions } from "./communication-note-task-preview-client.server";
import { parseTaskPreviewWireScope, TASK_PREVIEW_TRANSPORT_PATHS as PATHS, TASK_PREVIEW_TRANSPORT_JWT_TYPE as TYPE,
  type TaskPreviewCommand } from "./communication-note-task-preview-protocol.server";
import { createTaskPreviewAuthenticatedEndpoint as createEndpoint } from "./communication-note-task-preview-transport.server";
import { createCommunicationNoteTaskPreviewService as createService } from "./communication-note-task-preview-service.server";
import { parseTaskPreviewIssuerScope, type TaskPreviewIssuerBroker } from "./communication-note-task-preview-issuer.server";
import { createCommunicationNoteTaskLeaseReadPort, type CommunicationNoteTaskLeaseScope as Scope } from "./communication-note-workspace-task-lease.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PROD } from "./v1/ndis-shadow-guard";
import { CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION } from "./v1/shared-contracts";

const REF = "abcdefghijklmnopqrst", ORIGIN = "https://task-preview.invalid", HOST = "task-preview.invalid";
const BASE = Date.parse("2026-09-10T12:00:00.000Z"), ERROR = "Task Preview client unavailable";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }), foreign = generateKeyPairSync("rsa", { modulusLength: 2048 });
const tlsKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const ca = Buffer.from(rootCertificates[0]); // public CA only; no credential fixture or live handshake
const pubkey = tlsKey.publicKey.export({ type: "spki", format: "der" });
const id = () => randomBytes(16).toString("hex");
const scope = (): Scope => ({ requestId: id(), projectRef: REF, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ",
  callerRole: "careslink_v1_generation_job_list_caller", principal: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" } });
const delivered = (s: Scope) => ({ ...s, credential: { role: "careslink_v1_job_list_runtime_0123456789abcdef", password: "a".repeat(43),
  deliveryExpiresAt: new Date(Date.now() + 60000).toISOString() } });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const controllers: AbortController[] = [], endpoints: ReturnType<typeof createEndpoint>[] = [], services: ReturnType<typeof createService>[] = [];
function context() { const c = new AbortController(); controllers.push(c); return { controller: c, context: { signal: c.signal } }; }
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }); vi.setSystemTime(BASE);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - BASE); network.request.mockReset(); });
afterEach(async () => {
  controllers.splice(0).forEach(c => c.abort()); endpoints.splice(0).forEach(e => e.close());
  const stops = services.splice(0).map(s => s.stop()); await vi.advanceTimersByTimeAsync(40000); await Promise.all(stops);
  expect(vi.getTimerCount()).toBe(0); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
});
type Wire = { url: string; options: RequestOptions; body?: string; bodyRef?: Buffer; destroyed: boolean; responseDestroyed: boolean; secured: boolean };
type Mode = { status?: number; headers?: Record<string, string | string[]>; body?: unknown; bytes?: Buffer; event?: string;
  hang?: "socket" | "tls" | "body"; certificateHost?: string; pubkey?: Buffer; encrypted?: boolean; authorized?: boolean;
  reused?: boolean; protocol?: string; alpn?: string | false; wrongSocket?: boolean; complete?: boolean; preSecureResponse?: boolean };
function fixture(endpoint?: ReturnType<typeof createEndpoint>) {
  const identity = { origin: ORIGIN, issuer: "https://task-backend.invalid/", subject: "task-workspace-backend", keyId: "task-key-v1",
    publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString() };
  const sign = (command: TaskPreviewCommand, change: Record<string, unknown> = {}, header = { alg: "RS256", typ: TYPE, kid: identity.keyId }, key = keys.privateKey) =>
    new SignJWT({ ...command, ...change }).setProtectedHeader(header).sign(key);
  const consume = vi.fn<TaskPreviewClientOptions["consumeAssertion"]>(async (command, _ctx, use) => use(await sign(command)));
  const input: TaskPreviewClientOptions = { projectRef: REF, principal: scope().principal, identity, instanceId: endpoint?.instanceId ?? "1".repeat(64),
    serviceCa: ca, serviceCaSha256: sha(ca), serviceSpkiSha256: sha(pubkey), consumeAssertion: consume };
  const mode: Mode = {}, calls: Wire[] = [], sent = deferred<void>();
  network.request.mockImplementation((url: string, options: RequestOptions, receive: (r: EventEmitter) => void) => {
    const wire: Wire = { url, options, destroyed: false, responseDestroyed: false, secured: false }; calls.push(wire);
    const request = Object.assign(new EventEmitter(), { destroy: () => { wire.destroyed = true; }, end: (body: Buffer) => {
      expect(wire.secured).toBe(true); wire.body = body.toString(); wire.bodyRef = body; sent.resolve();
      void respond();
    } });
    const certificate = { subjectaltname: `DNS:${mode.certificateHost ?? HOST}`, subject: { CN: HOST }, pubkey: mode.pubkey ?? pubkey } as PeerCertificate;
    const socket = Object.assign(new EventEmitter(), { encrypted: mode.encrypted ?? true, authorized: mode.authorized ?? true,
      alpnProtocol: mode.alpn ?? "http/1.1", isSessionReused: () => mode.reused ?? false, getProtocol: () => mode.protocol ?? "TLSv1.3",
      getPeerCertificate: () => certificate });
    async function respond() {
      try {
        let body: unknown, status = mode.status ?? 200, headers: Record<string, string | string[]> = { "content-type": "application/json", "cache-control": "no-store" };
        if (endpoint && wire.body) {
          const r = await endpoint.handle(new Request(url, { method: "POST", headers: options.headers as Record<string, string>, body: wire.body, signal: options.signal }));
          status = r.status; headers = Object.fromEntries(r.headers); body = await r.json();
        } else if (wire.body) {
          const command = decodeJwt(wire.body) as unknown as TaskPreviewCommand;
          body = url.endsWith(PATHS.issue) ? delivered(command.scope) : { ...command.scope, status: "REVOKED" };
        }
        if (wire.destroyed) return;
        const response = Object.assign(new EventEmitter(), { statusCode: status, headers: { ...headers, ...mode.headers }, complete: mode.complete ?? true,
          socket: mode.wrongSocket ? { ...socket } : socket, destroy: () => { wire.responseDestroyed = true; } });
        receive(response); if (wire.destroyed || wire.responseDestroyed || mode.hang === "body") return;
        const bytes = mode.bytes ?? Buffer.from(JSON.stringify(mode.body ?? body));
        response.emit("data", bytes.subarray(0, 7)); response.emit("data", bytes.subarray(7));
        if (!wire.destroyed && !wire.responseDestroyed) response.emit(mode.event ?? "end");
      } catch { if (!wire.destroyed) request.emit("error", new Error("PRIVATE_WIRE_ERROR")); }
    }
    queueMicrotask(() => {
      if (wire.destroyed || mode.hang === "socket") return;
      if (mode.preSecureResponse) { void respond(); return; }
      request.emit("socket", socket); if (mode.hang === "tls") return;
      const invalid = options.checkServerIdentity!(HOST, certificate);
      if (invalid) { request.emit("error", invalid); return; }
      wire.secured = true; socket.emit("secureConnect");
    });
    return request;
  });
  return { input, client: createClient(input), consume, sign, calls, mode, sent };
}
it("constructs inertly without signer or network IO and keeps the feature disabled", () => {
  const h = fixture(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_CLIENT_READY).toBe(false); expect(h.calls).toEqual([]);
  expect(h.consume).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); expect(Object.keys(h.client)).toEqual(["issue", "revoke"]);
});
it.each([
  ["production", { projectRef: PROD }], ["bad project", { projectRef: "wrong" }], ["instance newline", { instanceId: "1".repeat(64) + "\n" }],
  ["wrong CA hash", { serviceCaSha256: "f".repeat(64) }], ["empty CA", { serviceCa: Buffer.alloc(0) }],
  ["invalid CA", { serviceCa: Buffer.from("not a certificate"), serviceCaSha256: sha(Buffer.from("not a certificate")) }],
  ["oversized CA", { serviceCa: Buffer.alloc(65537) }], ["bad pin", { serviceSpkiSha256: "wrong" }],
  ["invalid signer", { consumeAssertion: "private" }], ["invalid principal", { principal: { ...scope().principal, transport: "BEARER" } }],
  ["extra option", { enabled: true }],
])("rejects unsafe construction: %s", (_name, change) => {
  const h = fixture(); expect(() => createClient({ ...h.input, ...change } as TaskPreviewClientOptions)).toThrow(); expect(h.calls).toHaveLength(0);
});
it.each(["http://task-preview.invalid", ORIGIN + "/", ORIGIN + ":8443", "https://127.0.0.1", "https://localhost", "https://user:secret@task-preview.invalid"])
  ("rejects noncanonical/unapproved service origins: %s", origin => {
    const h = fixture(); expect(() => createClient({ ...h.input, identity: { ...h.input.identity, origin } })).toThrow(); expect(h.calls).toHaveLength(0);
  });
it("issues and revokes one exact scope with fresh assertions and explicit authenticated TLS options", async () => {
  const h = fixture(), s = scope(); expect(await h.client.issue(s, context().context)).toEqual(delivered(s));
  expect(await h.client.revoke(s, context().context)).toEqual({ ...s, status: "REVOKED" });
  expect(h.calls.map(c => c.url)).toEqual([ORIGIN + PATHS.issue, ORIGIN + PATHS.revoke]); expect(h.consume).toHaveBeenCalledTimes(2);
  expect(h.consume.mock.calls[0][0].jti).not.toBe(h.consume.mock.calls[1][0].jti);
  for (const wire of h.calls) {
    expect(wire.options).toMatchObject({ method: "POST", agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2",
      servername: HOST, ca, ALPNProtocols: ["http/1.1"], maxHeaderSize: 8192,
      headers: { "content-type": "application/jwt", accept: "application/json", connection: "close", "cache-control": "no-store" } });
    expect(wire.options.headers).not.toHaveProperty("authorization"); expect(wire.options.headers).not.toHaveProperty("cookie");
    expect(wire.destroyed).toBe(true); expect(wire.responseDestroyed).toBe(true); expect(wire.bodyRef!.every(b => b === 0)).toBe(true);
  }
  expect(Object.isFrozen(h.consume.mock.calls[0][0].scope.principal)).toBe(true);
  await expect(h.client.issue(s, context().context)).rejects.toThrow(ERROR); await expect(h.client.revoke(s, context().context)).rejects.toThrow(ERROR);
});
it("allows cleanup before issue, but never issue after a fence attempt", async () => {
  const h = fixture(), s = scope(); await h.client.revoke(s, context().context); await expect(h.client.issue(s, context().context)).rejects.toThrow(ERROR);
  expect(h.calls).toHaveLength(1);
});
it.each([
  ["target", (s: Scope) => ({ ...s, projectRef: "b".repeat(20) })], ["session", (s: Scope) => ({ ...s, principal: { ...s.principal, sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } })],
  ["user", (s: Scope) => ({ ...s, principal: { ...s.principal, userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } })],
  ["purpose", (s: Scope) => ({ ...s, purpose: "WRONG" })], ["extra", (s: Scope) => ({ ...s, token: "PRIVATE" })],
])("rejects wrong caller scope before signer or HTTP IO: %s", async (_name, make) => {
  const h = fixture(); await expect(h.client.issue(make(scope()) as Scope, context().context)).rejects.toThrow(ERROR); expect(h.consume).not.toHaveBeenCalled();
});
it.each([
  ["changed command nonce", { jti: "f".repeat(32) }], ["changed operation", { path: PATHS.revoke }], ["changed instance", { instanceId: "2".repeat(64) }],
  ["changed audience", { aud: "https://foreign.invalid" }], ["audience array", { aud: [ORIGIN] }], ["changed user scope", { scope: scope() }],
  ["changed expiry", { exp: BASE / 1000 + 29 }], ["extra claim", { admin: true }], ["expired", { exp: BASE / 1000 - 1 }],
])("rejects a signed assertion not equal to its requested command: %s", async (_name, change) => {
  const h = fixture(); h.consume.mockImplementation(async (command, _ctx, use) => use(await h.sign(command, change)));
  await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR); expect(h.calls).toHaveLength(0);
});
it("rejects foreign signatures, wrong key IDs and user-token types locally", async () => {
  for (const mode of ["foreign", "kid", "typ"]) {
    const h = fixture(); h.consume.mockImplementation(async (command, _ctx, use) => use(await h.sign(command, {},
      { alg: "RS256", typ: mode === "typ" ? "JWT" : TYPE, kid: mode === "kid" ? "other" : h.input.identity.keyId }, mode === "foreign" ? foreign.privateKey : keys.privateKey)));
    await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR); expect(h.calls).toHaveLength(0);
  }
});
it("requires exactly one awaited signer handoff and rejects duplicate delivery without a second request", async () => {
  const absent = fixture(); absent.consume.mockResolvedValue(); await expect(absent.client.issue(scope(), context().context)).rejects.toThrow(ERROR); expect(absent.calls).toHaveLength(0);
  const h = fixture(); h.consume.mockImplementation(async (command, _ctx, use) => { const token = await h.sign(command); await use(token); await use(token); });
  await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR); expect(h.calls).toHaveLength(1);
});
it("refuses a signer callback arriving after its provider already completed", async () => {
  const h = fixture(); let late!: (token: string) => Promise<void>, command!: TaskPreviewCommand;
  h.consume.mockImplementation(async (c, _ctx, use) => { command = c; late = use; });
  await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR);
  await expect(late(await h.sign(command))).rejects.toThrow(); expect(h.calls).toHaveLength(0);
});
it("bounds a hanging signer and permits independent cleanup after page abort", async () => {
  const h = fixture(), ctx = context(), entered = deferred<void>(), s = scope(); let late!: () => Promise<void>;
  h.consume.mockImplementationOnce(async (command, _context, deliver) => { late = async () => deliver(await h.sign(command)); entered.resolve(); await new Promise(() => {}); });
  const issue = expect(h.client.issue(s, ctx.context)).rejects.toThrow(ERROR); await entered.promise; ctx.controller.abort(); await issue;
  await expect(late()).rejects.toThrow(); expect(h.calls).toHaveLength(0);
  expect(await h.client.revoke(s, context().context)).toEqual({ ...s, status: "REVOKED" }); expect(h.calls).toHaveLength(1);
});
it("does not cancel the admitted request when a duplicate or wrong-scope issue is rejected", async () => {
  const h = fixture(), entered = deferred<void>(), gate = deferred<void>(), s = scope();
  h.consume.mockImplementationOnce(async (command, ctx, use) => { entered.resolve(); await gate.promise; expect(ctx.signal.aborted).toBe(false); await use(await h.sign(command)); });
  const pending = h.client.issue(s, context().context); await entered.promise;
  await expect(h.client.issue(s, context().context)).rejects.toThrow(ERROR); await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR);
  gate.resolve(); expect(await pending).toEqual(delivered(s)); expect(h.calls).toHaveLength(1);
});
it("does not extend the operation deadline for an uncooperative signer", async () => {
  const h = fixture(), entered = deferred<void>(); h.consume.mockImplementation(async () => { entered.resolve(); await new Promise(() => {}); });
  const pending = expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR); await entered.promise;
  await vi.advanceTimersByTimeAsync(7500); await pending; expect(h.calls).toHaveLength(0);
});
it("rejects an unawaited signer callback and prevents its late HTTP work", async () => {
  const h = fixture(), pendingUse = deferred<Promise<void>>();
  h.consume.mockImplementation(async (command, _ctx, deliver) => { pendingUse.resolve(deliver(await h.sign(command))); });
  await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR);
  await expect(pendingUse.promise).rejects.toThrow(); expect(h.calls).toHaveLength(0);
});
it("withholds delivery if the signer fails after the callback completed, while allowing finally-revoke", async () => {
  const h = fixture(), s = scope(); h.consume.mockImplementationOnce(async (command, _ctx, deliver) => {
    await deliver(await h.sign(command)); throw new Error("PRIVATE_SIGNER_FAILURE");
  });
  await expect(h.client.issue(s, context().context)).rejects.toThrow(ERROR);
  expect(await h.client.revoke(s, context().context)).toEqual({ ...s, status: "REVOKED" }); expect(h.calls).toHaveLength(2);
});
it("refuses a different cleanup scope without consuming the correct cleanup opportunity", async () => {
  const h = fixture(), s = scope(); await h.client.issue(s, context().context);
  await expect(h.client.revoke(scope(), context().context)).rejects.toThrow(ERROR);
  expect(await h.client.revoke(s, context().context)).toEqual({ ...s, status: "REVOKED" }); expect(h.calls).toHaveLength(2);
});
it("snapshots service identity and principal bindings at construction", async () => {
  const h = fixture(); (h.input.identity as { origin: string }).origin = "https://foreign.invalid";
  (h.input as { instanceId: string }).instanceId = "2".repeat(64);
  (h.input.principal as { userId: string }).userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await h.client.issue(scope(), context().context);
  expect(h.calls[0].url).toBe(ORIGIN + PATHS.issue); expect(h.consume.mock.calls[0][0].instanceId).toBe("1".repeat(64));
});
it("revoke aborts pending issue while preserving its independent signer/request signal", async () => {
  const h = fixture(), entered = deferred<void>(), s = scope();
  h.consume.mockImplementationOnce(async () => { entered.resolve(); await new Promise(() => {}); });
  const pending = expect(h.client.issue(s, context().context)).rejects.toThrow(ERROR); await entered.promise;
  expect(await h.client.revoke(s, context().context)).toEqual({ ...s, status: "REVOKED" }); await pending;
  expect(h.consume.mock.calls[0][1].signal.aborted).toBe(true); expect(h.calls).toHaveLength(1);
});
it.each([
  ["certificate hostname", { certificateHost: "foreign.invalid" }], ["leaf key pin", { pubkey: foreign.publicKey.export({ type: "spki", format: "der" }) }],
  ["untrusted chain", { authorized: false }], ["plaintext", { encrypted: false }], ["resumed session", { reused: true }],
  ["old protocol", { protocol: "TLSv1.1" }], ["different ALPN", { alpn: "h2" }],
])("does not transmit assertion bytes on TLS mismatch: %s", async (_name, change) => {
  const h = fixture(); Object.assign(h.mode, change); await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR);
  expect(h.calls).toHaveLength(1); expect(h.calls[0].body).toBeUndefined(); expect(h.calls[0].destroyed).toBe(true);
});
it.each([
  ["redirect", { status: 307 }], ["server failure", { status: 500 }], ["wrong response socket", { wrongSocket: true }],
  ["early response", { preSecureResponse: true }], ["incomplete HTTP", { complete: false }], ["stream error", { event: "error" }],
  ["aborted stream", { event: "aborted" }], ["premature close", { event: "close" }],
  ["wrong content type", { headers: { "content-type": "text/html" } }], ["cacheable response", { headers: { "cache-control": "public" } }],
  ["cookie", { headers: { "set-cookie": "secret=private" } }], ["location", { headers: { location: "https://foreign.invalid" } }],
  ["encoded response", { headers: { "content-encoding": "gzip" } }], ["oversized length", { headers: { "content-length": "8193" } }],
  ["length mismatch", { headers: { "content-length": "1" } }], ["malformed length", { headers: { "content-length": "01" } }],
  ["invalid JSON", { bytes: Buffer.from("PRIVATE_ERROR") }], ["invalid UTF8", { bytes: Buffer.from([0xff, 0xfe]) }],
  ["oversized body", { bytes: Buffer.alloc(8193, 42) }], ["extra fields", { body: { password: "PRIVATE" } }],
])("rejects malformed transport responses without retry: %s", async (_name, change) => {
  const h = fixture(); Object.assign(h.mode, change); await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR);
  expect(h.calls).toHaveLength(1); expect(h.calls[0].destroyed).toBe(true);
});
it.each([
  ["wrong request", (s: Scope) => ({ ...delivered(s), requestId: id() })], ["wrong session", (s: Scope) => ({ ...delivered(s), principal: { ...s.principal, sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } })],
  ["wrong target", (s: Scope) => ({ ...delivered(s), projectRef: PROD })], ["operator credential", (s: Scope) => ({ ...delivered(s), credential: { ...delivered(s).credential, role: "postgres" } })],
  ["expired credential", (s: Scope) => ({ ...delivered(s), credential: { ...delivered(s).credential, deliveryExpiresAt: new Date(BASE).toISOString() } })],
])("rejects unbound or invalid custody receipts: %s", async (_name, make) => {
  const h = fixture(), s = scope(); h.mode.body = make(s); await expect(h.client.issue(s, context().context)).rejects.toThrow(ERROR);
});
it("refuses nonterminal revoke and duplicate-key JSON responses", async () => {
  const h = fixture(), s = scope(); h.mode.body = { ...s, status: "FENCED" }; await expect(h.client.revoke(s, context().context)).rejects.toThrow(ERROR);
  const other = fixture(); other.mode.bytes = Buffer.from(JSON.stringify(delivered(s)).replace('"password":', '"password":"old","password":'));
  await expect(other.client.issue(s, context().context)).rejects.toThrow(ERROR);
});
it.each(["socket", "tls", "body"] as const)("bounds a stalled %s phase and destroys owned IO", async hang => {
  const h = fixture(); h.mode.hang = hang; const pending = expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR);
  // Let native RSA verification finish before advancing the operation clock.
  while (!h.calls.length) await new Promise(resolve => setImmediate(resolve));
  await vi.advanceTimersByTimeAsync(7500); await pending; expect(h.calls[0].destroyed).toBe(true);
});
it("rejects fake/pre-aborted contexts before signer use", async () => {
  const h = fixture(), c = context(); c.controller.abort();
  for (const ctx of [c.context, { signal: Object.create(AbortSignal.prototype) }, { signal: new Proxy(c.controller.signal, {}) }]) {
    await expect(h.client.issue(scope(), ctx)).rejects.toThrow(ERROR);
  }
  expect(h.consume).not.toHaveBeenCalled();
});
it("rechecks clock freshness after the signer has awaited successful HTTP delivery", async () => {
  const h = fixture(); h.consume.mockImplementation(async (command, _ctx, use) => {
    await use(await h.sign(command)); vi.mocked(performance.now).mockReturnValue(0); vi.setSystemTime(BASE + 2000);
  });
  await expect(h.client.issue(scope(), context().context)).rejects.toThrow(ERROR); expect(h.calls).toHaveLength(1);
});
it("shares wire scope grammar with the existing issuer without importing its runtime", () => {
  const s = scope(); expect(parseTaskPreviewWireScope(s, REF)).toEqual(parseTaskPreviewIssuerScope(s, REF));
  for (const change of [{ requestId: "bad" }, { purpose: "wrong" }, { callerRole: "postgres" }, { projectRef: PROD }, { extra: true }]) {
    expect(() => parseTaskPreviewWireScope({ ...s, ...change }, REF)).toThrow(); expect(() => parseTaskPreviewIssuerScope({ ...s, ...change }, REF)).toThrow();
  }
});

function serviceFixture() {
  type Lease = { scope: Scope; state: string; role: string | null; expiresAt: string | null; roleCount: number; sessionCount: number; membershipCount: number };
  const leases = new Map<string, Lease>(); let epoch: unknown;
  const call = vi.fn<TaskPreviewIssuerBroker["call"]>(async (op, data) => {
    if (op === "start") { epoch = data.epoch; return { projectRef: REF, epoch, ready: false }; }
    if (["inventory", "ready", "issue"].includes(op) && data.epoch !== epoch) throw new Error("STALE");
    if (op === "inventory") return { projectRef: REF, epoch, leases: [...leases.values()].filter(l => l.state !== "REVOKED")
      .map(({ scope: s, state, expiresAt }) => ({ scope: s, state, expiresAt })) };
    if (op === "ready") return { projectRef: REF, epoch, ready: true };
    const s = data.scope as Scope; let l = leases.get(s.requestId);
    if (l && JSON.stringify(l.scope) !== JSON.stringify(s)) throw new Error("WRONG_SCOPE");
    if (op === "issue") { if (l) throw new Error("DUPLICATE"); l = { scope: s, state: "ISSUED", role: data.role as string,
      expiresAt: data.expiresAt as string, roleCount: 1, sessionCount: 0, membershipCount: 2 }; leases.set(s.requestId, l); }
    if (op === "fence") {
      if (!l) { l = { scope: s, state: "REVOKED", role: null, expiresAt: null, roleCount: 0, sessionCount: 0, membershipCount: 0 }; leases.set(s.requestId, l); }
      else if (l.state === "ISSUED") l.state = "FENCED";
    }
    if (op === "finalize") { if (!l || l.state === "ISSUED") throw new Error("FENCE_FIRST"); Object.assign(l, { state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 }); }
    return { ...l };
  });
  const service = createService({ projectRef: REF, broker: { call } }); services.push(service);
  const h = fixture(); const endpoint = createEndpoint({ projectRef: REF, ...h.input.identity, service }); endpoints.push(endpoint);
  return { ...fixture(endpoint), service, leases, call };
}
it.each([false, true])("runs the actual client, authenticated entry, service and workspace lease (cancel read=%s)", async cancel => {
  const h = serviceFixture(), ctx = context(), principal = scope().principal; await h.service.start();
  const open = vi.fn((value: { credential: { password: string } }) => ({ projectRef: REF, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ" as const,
    callerRole: "careslink_v1_generation_job_list_caller" as const, execute: async () => {
      expect(value.credential.password).toHaveLength(43); if (cancel) ctx.controller.abort(); return { tasks: [], nextCursor: null };
    } }));
  const port = createCommunicationNoteTaskLeaseReadPort({ enabled: true, projectRef: REF, principal, custody: h.client, open })!;
  const pending = port.execute([principal.userId, principal.sessionId, null, null, 20, CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION], ctx.context);
  if (cancel) await expect(pending).rejects.toThrow(); else expect(await pending).toEqual({ tasks: [], nextCursor: null });
  expect(h.calls.map(c => c.url)).toEqual([ORIGIN + PATHS.issue, ORIGIN + PATHS.revoke]);
  expect(h.call.mock.calls.map(c => c[0])).toEqual(["start", "inventory", "ready", "issue", "fence", "finalize"]);
  expect([...h.leases.values()]).toMatchObject([{ state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 }]);
  expect(open.mock.calls[0][0].credential.password).toBe(""); expect(h.service.health().state).toBe("READY");
});
it("keeps client/protocol free of control-plane imports, private keys and product activation", () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  const files = walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test."));
  const client = "communication-note-task-preview-client";
  expect(files.filter(p => !p.endsWith(`${client}.server.ts`) && readFileSync(p, "utf8").includes(client))).toEqual([]);
  for (const name of [client, "communication-note-task-preview-protocol"]) {
    const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(/from ["']pg["']|from .*task-preview-(?:issuer|control|host|service|gcp|custody|transport)\.server|process\.env|console\.|SignJWT|createPrivateKey|BEGIN PRIVATE KEY|fetch\s*\(/);
  }
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain(ERROR);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
});
