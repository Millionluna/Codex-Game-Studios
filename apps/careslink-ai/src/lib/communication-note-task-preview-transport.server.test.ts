import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { CompactSign, SignJWT } from "jose";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createTaskPreviewAuthenticatedEndpoint as createEndpoint, COMMUNICATION_NOTE_TASK_PREVIEW_TRANSPORT_READY,
  TASK_PREVIEW_TRANSPORT_PATHS as PATHS, TASK_PREVIEW_TRANSPORT_JWT_TYPE as TYPE, TASK_PREVIEW_TRANSPORT_REPLAY_LIMIT as LIMIT,
  type TaskPreviewTransportOptions } from "./communication-note-task-preview-transport.server";
import { createCommunicationNoteTaskPreviewService as createService } from "./communication-note-task-preview-service.server";
import type { TaskPreviewIssuerBroker } from "./communication-note-task-preview-issuer.server";
import { createCommunicationNoteTaskLeaseReadPort, type CommunicationNoteTaskLeaseScope as Scope,
  type CommunicationNoteTaskLeaseCustody as Custody } from "./communication-note-workspace-task-lease.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PROD } from "./v1/ndis-shadow-guard";
import { CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION } from "./v1/shared-contracts";

const REF = "abcdefghijklmnopqrst", ORIGIN = "https://task-preview.invalid", ISSUER = "https://task-backend.invalid/";
const SUBJECT = "task-workspace-backend", KEY_ID = "task-backend-key-v1", BASE = Date.parse("2026-09-10T12:00:00.000Z");
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }), foreign = generateKeyPairSync("rsa", { modulusLength: 2048 });
type Action = keyof typeof PATHS;
type Endpoint = ReturnType<typeof createEndpoint>;
const endpoints: Endpoint[] = [], services: ReturnType<typeof createService>[] = [];
const context = () => ({ signal: new AbortController().signal });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const scope = (): Scope => ({ requestId: randomBytes(16).toString("hex"), projectRef: REF, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ",
  callerRole: "careslink_v1_generation_job_list_caller", principal: { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" } });
const delivered = (s: Scope) => ({ ...s, credential: { role: "careslink_v1_job_list_runtime_0123456789abcdef",
  password: "a".repeat(43), deliveryExpiresAt: new Date(Date.now() + 60000).toISOString() } });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(BASE); vi.spyOn(performance, "now").mockImplementation(() => Date.now() - BASE); });
afterEach(async () => {
  endpoints.splice(0).forEach(e => e.close());
  const stopped = services.splice(0).map(s => s.stop()); await vi.advanceTimersByTimeAsync(40000); await Promise.all(stopped);
  expect(vi.getTimerCount()).toBe(0); vi.restoreAllMocks(); vi.useRealTimers();
});
function fixture(service?: TaskPreviewTransportOptions["service"]) {
  const finished = deferred<{ state: "STOPPED"; cleanupConfirmed: boolean }>();
  const issue = vi.fn<Custody["issue"]>(async s => delivered(s));
  const revoke = vi.fn<Custody["revoke"]>(async s => ({ ...s, status: "REVOKED" }));
  const health = vi.fn(() => ({ state: "READY" as const, reason: undefined, cleanupConfirmed: false }));
  const input: TaskPreviewTransportOptions = { projectRef: REF, origin: ORIGIN, issuer: ISSUER, subject: SUBJECT, keyId: KEY_ID,
    publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), service: service ?? { custody: { issue, revoke }, health, finished: finished.promise } };
  const endpoint = createEndpoint(input); endpoints.push(endpoint);
  return { endpoint, input, issue, revoke, health, finished };
}
function claims(endpoint: Endpoint, action: Action, s = scope()) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: ISSUER, aud: ORIGIN, sub: SUBJECT, iat: now, nbf: now, exp: now + 30, jti: randomBytes(16).toString("hex"),
    instanceId: endpoint.instanceId, method: "POST", path: PATHS[action], scope: s };
}
const header = () => ({ alg: "RS256", typ: TYPE, kid: KEY_ID });
const sign = (payload: Record<string, unknown>, h = header(), key = keys.privateKey) => new SignJWT(payload).setProtectedHeader(h).sign(key);
function request(token: string, action: Action = "issue", init: RequestInit = {}, url = ORIGIN + PATHS[action]) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/jwt", accept: "application/json" }, body: token, ...init });
}
async function denied(response: Response) {
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "TASK_PREVIEW_TRANSPORT_UNAVAILABLE" });
  expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.has("access-control-allow-origin")).toBe(false);
}

it("constructs inertly, creates an owner-only fresh instance binding and refuses duplicate handlers", () => {
  const h = fixture(), other = fixture(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_TRANSPORT_READY).toBe(false);
  expect(h.endpoint.instanceId).toMatch(/^[a-f0-9]{64}$/); expect(h.endpoint.instanceId).not.toBe(other.endpoint.instanceId);
  expect(h.issue).not.toHaveBeenCalled(); expect(h.health).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  expect(() => createEndpoint(h.input)).toThrow();
});
it.each([
  ["production", { projectRef: PROD }], ["wrong project", { projectRef: "wrong" }], ["project newline", { projectRef: REF + "\n" }],
  ["http origin", { origin: "http://task-preview.invalid" }], ["origin path", { origin: ORIGIN + "/" }],
  ["origin credentials", { origin: "https://user:password@task-preview.invalid" }], ["origin query", { origin: ORIGIN + "?a=1" }],
  ["http issuer", { issuer: "http://backend.invalid/" }], ["issuer fragment", { issuer: ISSUER + "#key" }],
  ["subject whitespace", { subject: "browser user" }], ["empty key id", { keyId: "" }],
  ["subject newline", { subject: SUBJECT + "\n" }], ["key id newline", { keyId: KEY_ID + "\n" }],
  ["private key", { publicKeyPem: keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString() }],
  ["noncanonical key", { publicKeyPem: keys.publicKey.export({ format: "pem", type: "spki" }).toString() + "\n" }],
  ["unknown config", { enabled: true }],
])("rejects unsafe construction: %s", (_name, changes) => {
  const h = fixture(); expect(() => createEndpoint({ ...h.input, ...changes } as TaskPreviewTransportOptions)).toThrow(); expect(h.issue).not.toHaveBeenCalled();
});
it("verifies a real RSA signature and passes only its exact Cookie scope to issue/revoke", async () => {
  const h = fixture(), s = scope(), token = await sign(claims(h.endpoint, "issue", s));
  const response = await h.endpoint.handle(request(token)); expect(response.status).toBe(200);
  expect(await response.json()).toEqual(delivered(s)); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(h.issue.mock.calls[0][0]).toEqual(s); expect(Object.isFrozen(h.issue.mock.calls[0][0].principal)).toBe(true);
  const revoked = await h.endpoint.handle(request(await sign(claims(h.endpoint, "revoke", s)), "revoke"));
  expect(await revoked.json()).toEqual({ ...s, status: "REVOKED" }); expect(h.revoke).toHaveBeenCalledOnce();
});
it.each([
  ["issuer", { iss: "https://foreign.invalid/" }], ["audience", { aud: "https://other.invalid" }], ["audience array", { aud: [ORIGIN] }],
  ["subject", { sub: "browser" }], ["instance", { instanceId: "0".repeat(64) }], ["method", { method: "GET" }],
  ["action", { path: PATHS.revoke }], ["expired", { exp: BASE / 1000 - 1 }], ["too little lifetime", { exp: BASE / 1000 + 7 }],
  ["long lifetime", { exp: BASE / 1000 + 31 }], ["future iat", { iat: BASE / 1000 + 1, nbf: BASE / 1000 + 1 }],
  ["old iat", { iat: BASE / 1000 - 11, nbf: BASE / 1000 - 11, exp: BASE / 1000 + 19 }],
  ["fractional iat", { iat: BASE / 1000 - 0.5, nbf: BASE / 1000 - 0.5 }], ["fractional exp", { exp: BASE / 1000 + 29.5 }],
  ["future nbf", { nbf: BASE / 1000 + 1 }], ["divergent nbf", { nbf: BASE / 1000 - 1 }], ["missing iat", { iat: undefined }],
  ["short jti", { jti: "a" }], ["jti newline", { jti: "a".repeat(32) + "\n" }], ["unknown claim", { admin: true }],
  ["wrong target", { scope: { ...scope(), projectRef: "b".repeat(20) } }], ["production scope", { scope: { ...scope(), projectRef: PROD } }],
  ["other purpose", { scope: { ...scope(), purpose: "COMMUNICATION_NOTE_JOB_STATUS_READ" } }],
  ["operator role", { scope: { ...scope(), callerRole: "postgres" } }], ["extra scope", { scope: { ...scope(), password: "private" } }],
  ["invalid request", { scope: { ...scope(), requestId: "bad" } }],
  ["bearer principal", { scope: { ...scope(), principal: { ...scope().principal, transport: "BEARER" } } }],
  ["missing session", { scope: { ...scope(), principal: { ...scope().principal, sessionId: undefined } } }],
  ["user metadata", { scope: { ...scope(), principal: { ...scope().principal, user_metadata: { admin: true } } } }],
])("rejects a correctly signed but unauthorized command: %s", async (_name, changes) => {
  const h = fixture(); await denied(await h.endpoint.handle(request(await sign({ ...claims(h.endpoint, "issue"), ...changes }))));
  expect(h.issue).not.toHaveBeenCalled(); expect(h.revoke).not.toHaveBeenCalled();
});
it.each([
  ["wrong kid", { kid: "shared-key" }], ["wrong typ", { typ: "JWT" }], ["case variant typ", { typ: TYPE.toUpperCase() }],
  ["remote key", { jku: "https://foreign.invalid/jwks" }], ["inline key", { jwk: {} }], ["other algorithm", { alg: "PS256" }],
])("rejects an unsupported signed header: %s", async (_name, change) => {
  const h = fixture(); await denied(await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue"), { ...header(), ...change }))));
  expect(h.issue).not.toHaveBeenCalled();
});
it("rejects foreign signatures, unsigned input, duplicate claims and token tampering", async () => {
  const h = fixture(), p = claims(h.endpoint, "issue"), valid = await sign(p);
  const duplicate = JSON.stringify(p).replace('"method":"POST"', '"method":"GET","method":"POST"');
  const signedDuplicate = await new CompactSign(Buffer.from(duplicate)).setProtectedHeader(header()).sign(keys.privateKey);
  for (const token of [await sign(p, header(), foreign.privateKey), "e30.e30.", signedDuplicate,
    valid.replace(valid.split(".")[1], Buffer.from(JSON.stringify({ ...p, scope: scope() })).toString("base64url")), valid + "\n"]) {
    await denied(await h.endpoint.handle(request(token)));
  }
  expect(h.issue).not.toHaveBeenCalled();
});
it("atomically consumes replay IDs for concurrent duplicates and never caches a credential response", async () => {
  const h = fixture(), token = await sign(claims(h.endpoint, "issue"));
  const results = await Promise.all([h.endpoint.handle(request(token)), h.endpoint.handle(request(token))]);
  expect(results.map(r => r.status).sort()).toEqual([200, 503]); expect(h.issue).toHaveBeenCalledOnce();
  await denied(await h.endpoint.handle(request(token))); expect(h.issue).toHaveBeenCalledOnce();
});
it("binds assertions to one live service instance and closes on owner completion", async () => {
  const h = fixture(), next = fixture(), token = await sign(claims(h.endpoint, "issue"));
  await denied(await next.endpoint.handle(request(token))); h.finished.resolve({ state: "STOPPED", cleanupConfirmed: true });
  await Promise.resolve(); await denied(await h.endpoint.handle(request(token))); expect(h.issue).not.toHaveBeenCalled();
});
it("bounds replay storage without evicting live IDs and reserves revoke capacity", async () => {
  const h = fixture();
  for (let i = 0; i < LIMIT; i++) expect((await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue"))))).status).toBe(200);
  await denied(await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue"))))); expect(h.issue).toHaveBeenCalledTimes(LIMIT);
  expect((await h.endpoint.handle(request(await sign(claims(h.endpoint, "revoke")), "revoke"))).status).toBe(200);
  await vi.advanceTimersByTimeAsync(31000);
  expect((await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue"))))).status).toBe(200);
});
it.each([
  ["query", ORIGIN + PATHS.issue + "?token=secret"], ["trailing slash", ORIGIN + PATHS.issue + "/"],
  ["other origin", "https://foreign.invalid" + PATHS.issue], ["http", "http://task-preview.invalid" + PATHS.issue],
  ["health discovery", ORIGIN + "/health"], ["admin", ORIGIN + "/stop"],
])("rejects unexpected HTTP target: %s", async (_name, url) => {
  const h = fixture(); await denied(await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue")), "issue", {}, url))); expect(h.issue).not.toHaveBeenCalled();
});
it.each([
  ["cookie", { cookie: "session=private" }], ["browser origin", { origin: ORIGIN }], ["bearer fallback", { authorization: "Bearer private" }],
  ["encoding", { "content-encoding": "gzip" }], ["JSON body", { "content-type": "application/json" }],
  ["wildcard accept", { accept: "*/*" }], ["oversized length", { "content-length": "16385" }], ["ambiguous length", { "content-length": "01" }],
])("rejects unexpected HTTP headers: %s", async (_name, changes) => {
  const h = fixture(); await denied(await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue")), "issue",
    { headers: { "content-type": "application/jwt", accept: "application/json", ...changes } }))); expect(h.issue).not.toHaveBeenCalled();
});
it("rejects GET/OPTIONS, empty, consumed, pre-aborted and oversized streaming bodies", async () => {
  const h = fixture(), token = await sign(claims(h.endpoint, "issue")), aborted = new AbortController(); aborted.abort();
  const used = request(token); await used.text();
  for (const r of [request(token, "issue", { method: "GET", body: undefined }), request(token, "issue", { method: "OPTIONS" }),
    request(""), used, request(token, "issue", { signal: aborted.signal }), request("x".repeat(16385))]) await denied(await h.endpoint.handle(r));
  expect(h.issue).not.toHaveBeenCalled();
});
it.each(["NEW", "STARTING", "SWEEPING", "STOPPING", "STOPPED", "FAILED"])("refuses issue during %s", async state => {
  const h = fixture(); h.health.mockReturnValue({ state, cleanupConfirmed: false } as never);
  await denied(await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue"))))); expect(h.issue).not.toHaveBeenCalled();
});
it("permits authenticated revoke during maintenance", async () => {
  const h = fixture(); h.health.mockReturnValue({ state: "SWEEPING", cleanupConfirmed: false } as never);
  expect((await h.endpoint.handle(request(await sign(claims(h.endpoint, "revoke")), "revoke"))).status).toBe(200);
});
it("cancels an incomplete request body at the bounded deadline without custody IO", async () => {
  const h = fixture(), cancelled = vi.fn(), body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("a")); }, cancel: cancelled });
  const result = h.endpoint.handle(request("", "issue", { body, duplex: "half" } as RequestInit));
  await vi.advanceTimersByTimeAsync(7000); await denied(await result); expect(cancelled).toHaveBeenCalledOnce(); expect(h.issue).not.toHaveBeenCalled();
});
it("cancels unread bodies on early rejection and rejects mismatched declared length", async () => {
  const h = fixture(), cancel = vi.fn(), body = new ReadableStream({ cancel });
  await denied(await h.endpoint.handle(request("", "issue", { body, duplex: "half", headers: { "content-type": "application/json" } } as RequestInit)));
  expect(cancel).toHaveBeenCalledOnce();
  const token = await sign(claims(h.endpoint, "issue"));
  await denied(await h.endpoint.handle(request(token, "issue", { headers: { "content-type": "application/jwt", accept: "application/json", "content-length": "1" } })));
  expect(h.issue).not.toHaveBeenCalled();
});
it.each(["not-bytes", new Uint8Array([0xff, 0xfe])])("rejects malformed streamed data: %s", async value => {
  const h = fixture(), body = new ReadableStream({ start(c) { c.enqueue(value); c.close(); } });
  await denied(await h.endpoint.handle(request("", "issue", { body, duplex: "half" } as RequestInit))); expect(h.issue).not.toHaveBeenCalled();
});
it("withholds a timed-out late issue and independently revokes its exact scope", async () => {
  const h = fixture(), started = deferred<void>(), late = deferred<ReturnType<typeof delivered>>(), cleaned = deferred<void>(), s = scope();
  h.issue.mockImplementation(() => { started.resolve(); return late.promise; });
  h.revoke.mockImplementation(async (value, ctx) => { expect(ctx.signal.aborted).toBe(false); cleaned.resolve(); return { ...value, status: "REVOKED" }; });
  const result = h.endpoint.handle(request(await sign(claims(h.endpoint, "issue", s)))); await started.promise;
  await vi.advanceTimersByTimeAsync(7000); await denied(await result); expect(h.issue.mock.calls[0][1].signal.aborted).toBe(true);
  late.resolve(delivered(s)); await cleaned.promise; await vi.advanceTimersByTimeAsync(0); expect(h.revoke.mock.calls[0][0]).toEqual(s);
});
it("keeps timed-out uncooperative issue slots occupied while reserving revoke admission", async () => {
  const h = fixture(), started = deferred<void>(), late = deferred<void>(); let count = 0;
  h.issue.mockImplementation(async s => { if (++count === 4) started.resolve(); await late.promise; return delivered(s); });
  const tokens = await Promise.all(Array.from({ length: 4 }, () => sign(claims(h.endpoint, "issue"))));
  const results = tokens.map(t => h.endpoint.handle(request(t))); await started.promise;
  await vi.advanceTimersByTimeAsync(7000); for (const result of results) await denied(await result);
  await denied(await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue"))))); expect(h.issue).toHaveBeenCalledTimes(4);
  expect((await h.endpoint.handle(request(await sign(claims(h.endpoint, "revoke")), "revoke"))).status).toBe(200);
  late.resolve(); await vi.advanceTimersByTimeAsync(0); expect(h.revoke).toHaveBeenCalledTimes(5);
});
it("page cancellation does not cancel scoped cleanup, and cleanup failure never becomes success", async () => {
  const h = fixture(), started = deferred<void>(), late = deferred<void>(), controller = new AbortController();
  h.issue.mockImplementation(async () => { started.resolve(); await late.promise; throw new Error("PRIVATE_DATABASE_ERROR"); });
  h.revoke.mockRejectedValue(new Error("PRIVATE_CLEANUP_ERROR"));
  const result = h.endpoint.handle(request(await sign(claims(h.endpoint, "issue")), "issue", { signal: controller.signal }));
  await started.promise; controller.abort(); await denied(await result); late.resolve(); await vi.advanceTimersByTimeAsync(0);
  expect(h.revoke).toHaveBeenCalledOnce(); expect(h.revoke.mock.calls[0][1].signal).not.toBe(h.issue.mock.calls[0][1].signal);
});
it.each([
  ["wrong session", (s: Scope) => ({ ...delivered(s), principal: scope().principal, requestId: "b".repeat(32) })],
  ["operator role", (s: Scope) => ({ ...delivered(s), credential: { ...delivered(s).credential, role: "postgres" } })],
  ["bad password", (s: Scope) => ({ ...delivered(s), credential: { ...delivered(s).credential, password: "short" } })],
  ["expired credential", (s: Scope) => ({ ...delivered(s), credential: { ...delivered(s).credential, deliveryExpiresAt: new Date(BASE).toISOString() } })],
  ["extra response secret", (s: Scope) => ({ ...delivered(s), adminPassword: "PRIVATE" })],
])("suppresses and cleans malformed service delivery: %s", async (_name, make) => {
  const h = fixture(); h.issue.mockImplementation(async s => make(s) as never);
  await denied(await h.endpoint.handle(request(await sign(claims(h.endpoint, "issue"))))); expect(h.revoke).toHaveBeenCalledOnce();
});
it("does not accept nonterminal revocation acknowledgments", async () => {
  const h = fixture(); h.revoke.mockImplementation(async s => ({ ...s, status: "FENCED" }) as never);
  await denied(await h.endpoint.handle(request(await sign(claims(h.endpoint, "revoke")), "revoke")));
});
it.each([-2000, 2000])("permanently closes admission on a wall/monotonic clock jump: %s", async jump => {
  const h = fixture(), token = await sign(claims(h.endpoint, "issue")); vi.mocked(performance.now).mockReturnValue(0); vi.setSystemTime(BASE + jump);
  await denied(await h.endpoint.handle(request(token))); vi.setSystemTime(BASE); await denied(await h.endpoint.handle(request(token))); expect(h.issue).not.toHaveBeenCalled();
});

// Actual service/issuer/lease composition, with only the database protocol ledger
// simulated. Not live SQL, TLS, external signing custody or host supervision.
function realService() {
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
  const service = createService({ projectRef: REF, broker: { call } }); services.push(service); return { service, leases, call };
}
it("composes signed issue/read/revoke with the real service and one-use workspace lease", async () => {
  const f = realService(), h = fixture(f.service), principal = scope().principal; await f.service.start();
  async function invoke(action: Action, s: Scope, ctx: { signal: AbortSignal }) {
    const response = await h.endpoint.handle(request(await sign(claims(h.endpoint, action, s)), action, { signal: ctx.signal }));
    if (response.status !== 200) throw new Error("TRANSPORT_DENIED"); return response.json();
  }
  const open = vi.fn((input: { credential: { password: string } }) => ({ projectRef: REF, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ" as const,
    callerRole: "careslink_v1_generation_job_list_caller" as const, execute: async () => { expect(input.credential.password).toHaveLength(43); return { tasks: [], nextCursor: null }; } }));
  const port = createCommunicationNoteTaskLeaseReadPort({ enabled: true, projectRef: REF, principal,
    custody: { issue: (s, c) => invoke("issue", s, c), revoke: (s, c) => invoke("revoke", s, c) }, open })!;
  expect(await port.execute([principal.userId, principal.sessionId, null, null, 20, CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION], context()))
    .toEqual({ tasks: [], nextCursor: null });
  expect(f.call.mock.calls.map(c => c[0])).toEqual(["start", "inventory", "ready", "issue", "fence", "finalize"]);
  expect([...f.leases.values()]).toMatchObject([{ state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 }]);
  expect(open.mock.calls[0][0].credential.password).toBe("");
});
it("keeps simultaneous authenticated scopes separate through real issuer cleanup", async () => {
  const f = realService(), h = fixture(f.service); await f.service.start();
  const scopes = [scope(), { ...scope(), principal: { ...scope().principal, sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }];
  const results = await Promise.all(scopes.map(async s => h.endpoint.handle(request(await sign(claims(h.endpoint, "issue", s))))));
  expect(results.map(r => r.status)).toEqual([200, 200]); expect(f.leases.size).toBe(2);
  for (const s of scopes) expect((await h.endpoint.handle(request(await sign(claims(h.endpoint, "revoke", s)), "revoke"))).status).toBe(200);
  expect([...f.leases.values()].every(l => l.state === "REVOKED")).toBe(true);
});
it("keeps the authenticated entry server-only, uninstalled and absent from product bindings", () => {
  const name = "communication-note-task-preview-transport";
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual([]);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.(?:env|on)|fetch\s*\(|\.listen\s*\(|createServer\s*\(|console\.|SignJWT|createRemoteJWKSet/);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain("Task Preview transport unavailable");
});
