import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { SignJWT, type JWTPayload, type JWTHeaderParameters } from "jose";
import type { ClientConfig } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ request: vi.fn(), pg: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:https", () => ({ request: network.request }));
vi.mock("pg", () => ({ Client: class { constructor(config: ClientConfig) { return network.pg(config); } } }));
import { createTaskPreviewGcpCustodyFactory as createFactory, TASK_PREVIEW_GCP_RESOURCES as R,
  COMMUNICATION_NOTE_TASK_PREVIEW_GCP_READY, TASK_PREVIEW_GCP_CREDENTIAL_POLICY_SHA256,
  taskPreviewGcpIdentitySha256, taskPreviewGcpManifestData, type TaskPreviewOidcIdentity } from "./communication-note-task-preview-gcp.server";
import type { TaskPreviewCustodyBinding } from "./communication-note-task-preview-custody.server";
import type { TaskPreviewControlCustody } from "./communication-note-task-preview-control.server";
import { TASK_PREVIEW_CONTROL_IDENTITY_SQL } from "./communication-note-task-preview-control.server";
import { createTaskPreviewCustodiedService } from "./communication-note-task-preview-host.server";

// Only the HTTPS wire is simulated. JOSE verifies real locally signed RSA JWTs;
// the independent KMS double verifies an actual HMAC over the exact request.
// No host, cloud resource, IAM permission, Preview or secret is provisioned.
const crc32c = createRequire(import.meta.url)("fast-crc32c") as { calculate(value: Uint8Array): number };
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const foreignKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const weakKey = generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey;
const ecKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey;
const HMAC_KEY = Buffer.alloc(32, 42), BASE = Date.parse("2026-09-10T10:00:00.000Z");
const REF = "abcdefghijklmnopqrst", BRANCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PARENT = "adocsnwnslxhxcjgbyee";
const PURPOSE = "TASK_LIST_ISSUER_CONTROL_ONLY", ERROR = "Task Preview custody unavailable", CONFIG_ERROR = "Task Preview GCP custody unavailable";
const STS_TOKEN = "SYNTHETIC_STS_ACCESS_TOKEN_NEVER_REAL", IAM_TOKEN = "SYNTHETIC_IAM_ACCESS_TOKEN_NEVER_REAL";
const OAUTH = "SYNTHETIC_OAUTH_ACCESS_TOKEN_NEVER_REAL", PASSWORD = "SYNTHETIC_DATABASE_PASSWORD_NEVER_REAL";
const STS = "https://sts.googleapis.com/v1/token";
const IAM = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${R.serviceAccount}:generateAccessToken`;
const KMS = `https://cloudkms.googleapis.com/v1/${R.manifestKey}:macVerify`;
const secretUrl = (name: string) => `https://secretmanager.australia-southeast1.rep.googleapis.com/v1/${name}:access`;
const OAUTH_URL = secretUrl(R.oauthSecret), DB_URL = secretUrl(R.databaseSecret), SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
type Context = { signal: AbortSignal };
type Request = { url: string; options: { signal: AbortSignal; headers: Record<string, string>; [key: string]: unknown };
  body?: string; destroyed: boolean; responseDestroyed: boolean };
type Reply = { body?: unknown; bytes?: Buffer; status?: number; contentType?: string; hang?: boolean; event?: "error" | "aborted"; requestError?: boolean };
const controllers: AbortController[] = [];
const context = () => { const controller = new AbortController(); controllers.push(controller); return { controller, context: { signal: controller.signal } }; };
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }); vi.setSystemTime(BASE);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - BASE); network.request.mockReset(); network.pg.mockReset(); });
afterEach(async () => { controllers.splice(0).forEach(c => c.abort()); await vi.advanceTimersByTimeAsync(2100);
  expect(vi.getTimerCount()).toBe(0); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
function identity(): TaskPreviewOidcIdentity { return { issuer: "https://oidc.example.invalid/", audience: `https:${R.wifProvider}`,
  subject: "task-preview:approved-local-test", keyId: "synthetic-rsa-key-1", publicKeyPem: keys.publicKey.export({ format: "pem", type: "spki" }) as string }; }
function binding(): TaskPreviewCustodyBinding { return { projectRef: REF, branchId: BRANCH, caSha256: "a".repeat(64),
  sourceRevisionSha256: "b".repeat(64), sourceManifestSha256: "c".repeat(64), workloadIdentitySha256: taskPreviewGcpIdentitySha256(identity()),
  credentialPolicySha256: TASK_PREVIEW_GCP_CREDENTIAL_POLICY_SHA256, oauthAppReferenceSha256: "f".repeat(64), oauthGrantReferenceSha256: "0".repeat(64) }; }
function sign(claims: JWTPayload = {}, header: JWTHeaderParameters = { alg: "RS256", kid: identity().keyId }, key = keys.privateKey) {
  const i = identity(), seconds = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: i.issuer, aud: i.audience, sub: i.subject, iat: seconds - 1, nbf: seconds - 1,
    exp: seconds + 300, jti: "synthetic_unique_token_0001", ...claims }).setProtectedHeader(header).sign(key);
}
function target() {
  const core = { projectRef: REF, branchId: BRANCH, purpose: PURPOSE, caSha256: "a".repeat(64), observedAt: iso(0), expiresAt: iso(2000) };
  return { ...core, controlPlaneEvidenceSha256: sha(JSON.stringify({ ...core, parentProjectRef: PARENT,
    defaultBranch: false, persistent: false, withData: false, status: "ACTIVE_HEALTHY" })) };
}
function secretResponse(name: string, value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value)); return { name, payload: { data: bytes.toString("base64"), dataCrc32c: String(crc32c.calculate(bytes)) } };
}
function fixture(caSha256 = "a".repeat(64)) {
  const b = { ...binding(), caSha256 }, i = identity(), mac = createHmac("sha256", HMAC_KEY).update(taskPreviewGcpManifestData(b)).digest();
  const oauth = { purpose: PURPOSE, projectRef: REF, branchId: BRANCH, oauthScope: "environment:read",
    oauthAppReferenceSha256: b.oauthAppReferenceSha256, oauthGrantReferenceSha256: b.oauthGrantReferenceSha256, accessToken: OAUTH, expiresAt: iso(60000) };
  const database = { purpose: PURPOSE, projectRef: REF, branchId: BRANCH, caSha256: b.caSha256, password: PASSWORD };
  const sts = { access_token: STS_TOKEN, issued_token_type: "urn:ietf:params:oauth:token-type:access_token", token_type: "Bearer", expires_in: 600 };
  const iam = { accessToken: IAM_TOKEN, expireTime: iso(600000) };
  const calls: Request[] = [], responses: Record<string, (request: Request) => Reply> = {
    [STS]: () => ({ body: sts }), [IAM]: () => ({ body: iam }),
    [KMS]: request => {
      const body = JSON.parse(request.body!), data = Buffer.from(body.data, "base64"), suppliedMac = Buffer.from(body.mac, "base64");
      return { body: { name: R.manifestKey, success: createHmac("sha256", HMAC_KEY).update(data).digest().equals(suppliedMac),
        verifiedDataCrc32c: body.dataCrc32c === String(crc32c.calculate(data)), verifiedMacCrc32c: body.macCrc32c === String(crc32c.calculate(suppliedMac)),
        verifiedSuccessIntegrity: true, protectionLevel: "SOFTWARE" } };
    },
    [OAUTH_URL]: () => ({ body: secretResponse(R.oauthSecret, oauth) }), [DB_URL]: () => ({ body: secretResponse(R.databaseSecret, database) }),
  };
  network.request.mockImplementation((url: string, options: Request["options"], onResponse: (response: EventEmitter) => void) => {
    const request: Request = { url, options, destroyed: false, responseDestroyed: false }; calls.push(request);
    const client = new EventEmitter() as EventEmitter & { end(body?: string): void; destroy(): void };
    const abort = () => client.emit("error", new Error("SYNTHETIC_PRIVATE_ABORT"));
    client.destroy = () => { request.destroyed = true; options.signal.removeEventListener("abort", abort); };
    client.end = body => { request.body = body; queueMicrotask(() => {
      if (request.destroyed) return;
      const reply = responses[url]?.(request); if (!reply) { client.emit("error", new Error("UNEXPECTED_ENDPOINT")); return; }
      if (reply.requestError) { client.emit("error", new Error("SYNTHETIC_PRIVATE_TRANSPORT_ERROR")); return; }
      if (reply.hang) return;
      const response = Object.assign(new EventEmitter(), { statusCode: reply.status ?? 200,
        headers: { "content-type": reply.contentType ?? "application/json" }, destroy: () => { request.responseDestroyed = true; } });
      onResponse(response); if (request.destroyed || request.responseDestroyed) return;
      const bytes = reply.bytes ?? Buffer.from(JSON.stringify(reply.body));
      // Exercise multiple chunks, not only a preassembled JSON response.
      response.emit("data", bytes.subarray(0, 7)); response.emit("data", bytes.subarray(7));
      if (request.destroyed || request.responseDestroyed) return;
      if (reply.event) response.emit(reply.event, new Error("SYNTHETIC_PRIVATE_STREAM_ERROR")); else response.emit("end");
    }); };
    options.signal.addEventListener("abort", abort, { once: true }); return client;
  });
  const consume = vi.fn(async (_context: Context, consumer: (token: string) => Promise<void>) => consumer(await sign()));
  const input = { binding: b, identity: i, manifestMac: mac, consumeWorkloadToken: consume };
  return { input, create: createFactory(input), calls, responses, consume, oauth, database, sts, iam };
}
async function verified() { const h = fixture(), c = context(); return { ...h, ...c, custody: await h.create(c.context) }; }
async function tokened() { const h = await verified(); await h.custody.consumeAccessToken(h.context, async () => {}); return h; }
const useDb = (custody: TaskPreviewControlCustody, ctx: Context,
  consumer: Parameters<TaskPreviewControlCustody["consumeDatabaseCredential"]>[2] = async () => {}) =>
  custody.consumeDatabaseCredential(target() as never, ctx, consumer);

it("constructs inertly with no resource creation, credential discovery or readiness activation", () => {
  const h = fixture(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_GCP_READY).toBe(false); expect(Object.isFrozen(R)).toBe(true);
  expect(h.calls).toEqual([]); expect(h.consume).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("verifies real RSA then WIF, IAM and independently authenticated source before task-only secret handoffs", async () => {
  const h = await verified(); expect(h.calls.map(c => c.url)).toEqual([STS, IAM, KMS]);
  const token = vi.fn(async (value: { accessToken: string }) => expect(value.accessToken).toBe(OAUTH));
  const database = vi.fn(async (value: { password: string }) => expect(value.password).toBe(PASSWORD));
  await h.custody.consumeAccessToken(h.context, token); await useDb(h.custody, h.context, database);
  expect(h.calls.map(c => c.url)).toEqual([STS, IAM, KMS, OAUTH_URL, DB_URL]); expect(h.consume).toHaveBeenCalledOnce();
  const form = new URLSearchParams(h.calls[0].body);
  expect(Object.fromEntries(form)).toEqual({ audience: R.wifProvider, grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token", scope: SCOPE, subject_token: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt" });
  expect(h.calls[0].options.headers).not.toHaveProperty("authorization"); expect(h.calls[0].options.headers["content-type"]).toBe("application/x-www-form-urlencoded");
  expect(h.calls[1].options.headers.authorization).toBe(`Bearer ${STS_TOKEN}`); expect(JSON.parse(h.calls[1].body!)).toEqual({ scope: [SCOPE], lifetime: "600s" });
  expect(h.calls.slice(2).every(c => c.options.headers.authorization === `Bearer ${IAM_TOKEN}`)).toBe(true);
  expect(h.calls.every(c => c.destroyed && c.options.agent === false && c.options.rejectUnauthorized === true && c.options.minVersion === "TLSv1.2")).toBe(true);
  expect(h.calls.slice(3).every(c => c.options.method === "GET" && c.body === undefined)).toBe(true);
  const manifest = Buffer.from(JSON.parse(h.calls[2].body!).data, "base64"); expect(manifest).toEqual(taskPreviewGcpManifestData(h.input.binding));
  expect(JSON.parse(manifest.toString())).toEqual({ domain: "careslink.task-control.source-manifest.v1", binding: h.input.binding, resources: R });
  expect(token.mock.calls[0][0].accessToken).toBe(""); expect(database.mock.calls[0][0].password).toBe("");
  expect(database.mock.calls[0][0]).toMatchObject({ credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD", sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET", deliveryExpiresAt: iso(60000) });
  expect(h.context.signal.aborted).toBe(false); expect(h.consume.mock.calls[0][0].signal.aborted).toBe(true);
  expect(JSON.stringify(h.custody)).toBe("{}"); expect(vi.getTimerCount()).toBe(0);
});
it.each([
  ["unsigned", async () => `${Buffer.from('{"alg":"none"}').toString("base64url")}.e30.`],
  ["bad signature", () => sign({}, undefined, foreignKeys.privateKey)],
  ["wrong algorithm", () => sign({}, { alg: "PS256", kid: identity().keyId })],
  ["wrong key id", () => sign({}, { alg: "RS256", kid: "other-key" })],
  ["remote JWK URL", () => sign({}, { alg: "RS256", kid: identity().keyId, jku: "https://evil.invalid/jwks" })],
  ["wrong type", () => sign({}, { alg: "RS256", kid: identity().keyId, typ: "at+jwt" })],
  ["wrong issuer", () => sign({ iss: "https://evil.invalid/" })],
  ["wrong audience", () => sign({ aud: "https://shared-runtime.invalid/" })],
  ["audience array", () => sign({ aud: [identity().audience] })],
  ["wrong subject", () => sign({ sub: "shared-runtime" })],
  ["old token", () => sign({ iat: BASE / 1000 - 301 })],
  ["future issued", () => sign({ iat: BASE / 1000 + 1 })],
  ["future nbf", () => sign({ nbf: BASE / 1000 + 1 })],
  ["expired", () => sign({ exp: BASE / 1000 - 1 })],
  ["expires during operation", () => sign({ exp: BASE / 1000 + 1 })],
  ["long lifetime", () => sign({ exp: BASE / 1000 + 3601 })],
  ["fractional iat", () => sign({ iat: BASE / 1000 - 0.5 })],
  ["fractional exp", () => sign({ exp: BASE / 1000 + 300.5 })],
  ["missing nbf", () => sign({ nbf: undefined })],
  ["missing expiry", () => sign({ exp: undefined })],
  ["missing token id", () => sign({ jti: undefined })],
  ["short token id", () => sign({ jti: "short" })],
  ["control character token id", () => sign({ jti: "synthetic_token_0001\n" })],
  ["oversized token", async () => "a".repeat(16385)],
] as const)("rejects %s before any Google HTTP or secret access", async (_name, token) => {
  const h = fixture(), c = context(); h.consume.mockImplementation(async (_ctx, consumer) => consumer(await token()));
  await expect(h.create(c.context)).rejects.toThrow(ERROR); expect(h.calls).toEqual([]);
});
it.each(["iss", "aud", "sub", "iat"])("requires signed claim %s", async key => {
  const h = fixture(), c = context(); h.consume.mockImplementation(async (_ctx, consumer) => consumer(await sign({ [key]: undefined })));
  await expect(h.create(c.context)).rejects.toThrow(ERROR); expect(h.calls).toEqual([]);
});
it("accepts a pinned JWT with explicit JWT type and no secret returned in the factory result", async () => {
  const h = fixture(), c = context(); h.consume.mockImplementation(async (_ctx, consumer) => consumer(await sign({}, { alg: "RS256", kid: identity().keyId, typ: "JWT" })));
  expect(Object.keys(await h.create(c.context))).toEqual(["consumeAccessToken", "consumeDatabaseCredential"]);
});
it.each(["missing", "double", "throw-after", "late", "unawaited"])("requires exactly one awaited workload token delivery: %s", async fault => {
  const h = fixture(), c = context(); let late: ((token: string) => Promise<void>) | undefined;
  h.consume.mockImplementation(async (_ctx, consumer) => {
    if (fault === "missing") return; if (fault === "late") { late = consumer; return; }
    const token = await sign(); if (fault === "unawaited") { void consumer(token); return; }
    await consumer(token); if (fault === "double") await consumer(token); else throw new Error("PRIVATE_TOKEN_SOURCE_ERROR");
  });
  await expect(h.create(c.context)).rejects.toThrow(ERROR);
  if (late) await expect(late(await sign())).rejects.toThrow();
  expect(h.calls.some(c => [KMS, OAUTH_URL, DB_URL].includes(c.url))).toBe(false);
});
it.each([
  ["issuer", "http://oidc.example.invalid/"], ["issuer", "https://user:password@oidc.example.invalid/"],
  ["issuer", "https://oidc.example.invalid/?key=private"], ["issuer", "https://oidc.example.invalid/#key"],
  ["issuer", " https://oidc.example.invalid/"], ["issuer", 7], ["audience", R.wifProvider], ["subject", "has space"],
  ["keyId", "key\n"], ["publicKeyPem", weakKey.export({ format: "pem", type: "spki" })],
  ["publicKeyPem", ecKey.export({ format: "pem", type: "spki" })],
  ["publicKeyPem", keys.privateKey.export({ format: "pem", type: "pkcs8" })],
  ["publicKeyPem", keys.publicKey.export({ format: "pem", type: "spki" }) + "TRAILING_DATA"],
] as const)("rejects invalid pinned identity field %s (%#) without IO", (key, value) => {
  const h = fixture(); expect(() => createFactory({ ...h.input, identity: { ...h.input.identity, [key]: value } } as never)).toThrow(CONFIG_ERROR);
  expect(h.calls).toEqual([]); expect(h.consume).not.toHaveBeenCalled();
});
it.each(["workloadIdentitySha256", "credentialPolicySha256"])("refuses a mismatched %s source binding", key => {
  const h = fixture(); expect(() => createFactory({ ...h.input, binding: { ...h.input.binding, [key]: "9".repeat(64) } })).toThrow(CONFIG_ERROR);
});
it.each(["root getter", "identity getter", "proxy", "function proxy", "mac proxy", "mac short", "extra"])("rejects abnormal configuration %s without invoking accessors", fault => {
  const h = fixture(), getter = vi.fn(); let input: unknown = h.input;
  if (fault === "root getter") Object.defineProperty(input, "identity", { get: getter });
  if (fault === "identity getter") Object.defineProperty(h.input.identity, "issuer", { get: getter });
  if (fault === "proxy") input = new Proxy(h.input, { ownKeys: getter });
  if (fault === "function proxy") input = { ...h.input, consumeWorkloadToken: new Proxy(h.consume, { apply: getter }) };
  if (fault === "mac proxy") input = { ...h.input, manifestMac: new Proxy(h.input.manifestMac, { get: getter }) };
  if (fault === "mac short") input = { ...h.input, manifestMac: new Uint8Array(31) };
  if (fault === "extra") input = { ...h.input, credentials: "PRIVATE" };
  expect(() => createFactory(input as never)).toThrow(CONFIG_ERROR); expect(getter).not.toHaveBeenCalled(); expect(h.calls).toEqual([]);
});
it("copies source configuration and MAC so caller mutation cannot retarget a factory", async () => {
  const h = fixture(), c = context(); h.input.manifestMac.fill(0);
  (h.input.identity as { issuer: string }).issuer = "https://evil.invalid/";
  (h.input.binding as { sourceRevisionSha256: string }).sourceRevisionSha256 = "9".repeat(64);
  h.input.consumeWorkloadToken = vi.fn(async () => { throw new Error("PRIVATE_MUTATION"); });
  const custody = await h.create(c.context); await custody.consumeAccessToken(c.context, async () => {}); await useDb(custody, c.context);
  expect(h.input.consumeWorkloadToken).not.toHaveBeenCalled(); expect(h.consume).toHaveBeenCalledOnce();
});
it.each(["bad MAC", "source revision", "source manifest", "CA", "grant"])("rejects a manifest with %s not signed by the independent test signer", async fault => {
  const h = fixture(), c = context(), b = { ...h.input.binding };
  if (fault === "bad MAC") h.input.manifestMac.fill(0);
  else b[{ "source revision": "sourceRevisionSha256", "source manifest": "sourceManifestSha256", CA: "caSha256", grant: "oauthGrantReferenceSha256" }[fault]! as keyof typeof b] = "9".repeat(64);
  const factory = createFactory({ ...h.input, binding: b }); await expect(factory(c.context)).rejects.toThrow(ERROR);
  expect(h.calls.map(c => c.url)).toEqual([STS, IAM, KMS]);
});
it.each([{ name: "wrong-key" }, { success: false }, { verifiedDataCrc32c: false }, { verifiedMacCrc32c: false },
  { verifiedSuccessIntegrity: false }, { protectionLevel: "HSM" }, { untrustedExtra: "PRIVATE" }])("requires exact KMS verification and integrity %j", async change => {
  const h = fixture(), c = context(), original = h.responses[KMS]; h.responses[KMS] = req => ({ body: { ...original(req).body as object, ...change } });
  await expect(h.create(c.context)).rejects.toThrow(ERROR); expect(h.calls.map(c => c.url)).toEqual([STS, IAM, KMS]);
});
it.each([{ token_type: "MAC" }, { issued_token_type: "id_token" }, { expires_in: 1 }, { expires_in: 3601 }, { expires_in: "600" },
  { access_token: "short" }, { access_token: "bad\n".repeat(20) }, { unexpected: "PRIVATE" }])("rejects invalid STS exchange %j without impersonating", async change => {
  const h = fixture(), c = context(); Object.assign(h.sts, change); await expect(h.create(c.context)).rejects.toThrow(ERROR);
  expect(h.calls.map(c => c.url)).toEqual([STS]);
});
it.each([{ accessToken: "short" }, { expireTime: new Date(BASE + 1999).toISOString() }, { expireTime: new Date(BASE + 600001).toISOString() },
  { expireTime: "2026-02-30T10:00:00.000Z" }, { expireTime: "not-a-time" }, { scope: "extra" }])("rejects invalid impersonation %j before KMS/secrets", async change => {
  const h = fixture(), c = context(); Object.assign(h.iam, change); await expect(h.create(c.context)).rejects.toThrow(ERROR);
  expect(h.calls.map(c => c.url)).toEqual([STS, IAM]);
});
it.each(["2026-09-10T10:09:59Z", "2026-09-10T10:09:59.123456Z", "2026-09-10T10:09:59.123456789Z"])("supports Google timestamp precision %s", async expireTime => {
  const h = fixture(), c = context(); h.iam.expireTime = expireTime; await h.create(c.context); expect(h.calls.map(c => c.url)).toEqual([STS, IAM, KMS]);
});
it.each([{ purpose: "JOB_STATUS_ISSUER_CONTROL_ONLY" }, { projectRef: PARENT }, { branchId: "other" }, { oauthScope: "all" },
  { oauthAppReferenceSha256: "9".repeat(64) }, { oauthGrantReferenceSha256: "9".repeat(64) }, { accessToken: "short" },
  { expiresAt: new Date(BASE + 2000).toISOString() }, { refreshToken: "PRIVATE" }])("refuses unbound OAuth secret %j before token handoff", async change => {
  const h = await verified(), consumer = vi.fn(async () => {}); Object.assign(h.oauth, change);
  await expect(h.custody.consumeAccessToken(h.context, consumer)).rejects.toThrow(ERROR); expect(consumer).not.toHaveBeenCalled();
  expect(h.calls.some(c => c.url === DB_URL)).toBe(false);
});
it.each([{ purpose: "JOB_STATUS_ISSUER_CONTROL_ONLY" }, { projectRef: PARENT }, { branchId: "other" }, { caSha256: "9".repeat(64) },
  { password: "short" }, { password: "x".repeat(257) }, { password: "invalid\n".repeat(4) }, { expiresAt: "not-ephemeral" }])("refuses unbound database secret %j before password handoff", async change => {
  const h = await tokened(), consumer = vi.fn(async () => {}); Object.assign(h.database, change);
  await expect(useDb(h.custody, h.context, consumer)).rejects.toThrow(ERROR); expect(consumer).not.toHaveBeenCalled();
});
it.each(["wrong name", "wrong CRC", "bad base64", "oversized payload", "non-JSON", "invalid UTF-8", "extra payload field"])("rejects malformed Secret Manager payload: %s", async fault => {
  const h = await verified(), consumer = vi.fn(async () => {}), reply = secretResponse(R.oauthSecret, h.oauth);
  if (fault === "wrong name") reply.name = R.oauthSecret.replace("/1", "/latest");
  if (fault === "wrong CRC") reply.payload.dataCrc32c = "1";
  if (fault === "bad base64") reply.payload.data = "_not_base64_";
  if (fault === "oversized payload") reply.payload.data = Buffer.alloc(8193, 65).toString("base64");
  if (fault === "extra payload field") Object.assign(reply.payload, { secret: "PRIVATE" });
  if (["non-JSON", "invalid UTF-8"].includes(fault)) { const data = fault === "non-JSON" ? Buffer.from("private non JSON") : Buffer.from([0xff]);
    reply.payload = { data: data.toString("base64"), dataCrc32c: String(crc32c.calculate(data)) }; }
  h.responses[OAUTH_URL] = () => ({ body: reply }); await expect(h.custody.consumeAccessToken(h.context, consumer)).rejects.toThrow(ERROR);
  expect(consumer).not.toHaveBeenCalled(); expect(h.calls.some(c => c.url === DB_URL)).toBe(false);
});
it.each(["redirect", "forbidden", "HTML", "oversized", "invalid JSON", "invalid UTF-8", "stream error", "aborted", "request error"])("fails closed on %s without retry, redirect or leaked response text", async fault => {
  const h = await verified(), consumer = vi.fn(async () => {});
  const reply: Reply = { body: secretResponse(R.oauthSecret, h.oauth) };
  if (fault === "redirect") reply.status = 302; if (fault === "forbidden") reply.status = 403;
  if (fault === "HTML") reply.contentType = "text/html";
  if (fault === "oversized") reply.bytes = Buffer.alloc(32769, 65);
  if (fault === "invalid JSON") reply.bytes = Buffer.from("PRIVATE_RESPONSE_ERROR");
  if (fault === "invalid UTF-8") reply.bytes = Buffer.from([0xff]);
  if (fault === "stream error") reply.event = "error"; if (fault === "aborted") reply.event = "aborted";
  if (fault === "request error") reply.requestError = true;
  h.responses[OAUTH_URL] = () => reply;
  const error = await h.custody.consumeAccessToken(h.context, consumer).catch(e => e);
  expect(error).toBeInstanceOf(Error); expect(error.message).toBe(ERROR); expect(String(error.stack)).not.toMatch(/PRIVATE_RESPONSE|SYNTHETIC_PRIVATE|SYNTHETIC_OAUTH/);
  expect(consumer).not.toHaveBeenCalled(); expect(h.calls.filter(c => c.url === OAUTH_URL)).toHaveLength(1); expect(h.calls.every(c => c.destroyed)).toBe(true);
});
it("rejects a pre-aborted operation before requesting even a workload token", async () => {
  const h = fixture(), c = context(); c.controller.abort(); await expect(h.create(c.context)).rejects.toThrow(ERROR);
  expect(h.consume).not.toHaveBeenCalled(); expect(h.calls).toEqual([]);
});
it("bounds a token source that never returns and rejects its late callback before HTTP", async () => {
  const h = fixture(), c = context(); let late: ((token: string) => Promise<void>) | undefined;
  h.consume.mockImplementation(async (_ctx, consumer) => { late = consumer; await new Promise(() => {}); });
  const pending = expect(h.create(c.context)).rejects.toThrow(ERROR); await vi.advanceTimersByTimeAsync(2000); await pending;
  await expect(late!(await sign())).rejects.toThrow(); expect(h.calls).toEqual([]);
});
it.each(["timeout", "abort"])("destroys the owned stalled HTTPS request on %s", async fault => {
  const h = await verified(); h.responses[OAUTH_URL] = () => ({ hang: true }); const consumer = vi.fn(async () => {});
  const pending = expect(h.custody.consumeAccessToken(h.context, consumer)).rejects.toThrow(ERROR);
  await Promise.resolve(); if (fault === "timeout") await vi.advanceTimersByTimeAsync(2000); else h.controller.abort();
  await pending; expect(h.calls.at(-1)!.url).toBe(OAUTH_URL); expect(h.calls.every(c => c.destroyed)).toBe(true); expect(consumer).not.toHaveBeenCalled();
});
it("requires a fresh validated branch observation before any database secret read", async () => {
  const h = await tokened(); await expect(h.custody.consumeDatabaseCredential({ ...target(), projectRef: PARENT } as never, h.context, async () => {})).rejects.toThrow(ERROR);
  expect(h.calls.some(c => c.url === DB_URL)).toBe(false);
});
it("prevents password reads before OAuth and rejects reusing a closed operation", async () => {
  const h = await verified(); await expect(useDb(h.custody, h.context)).rejects.toThrow(ERROR);
  await expect(h.custody.consumeAccessToken(h.context, async () => {})).rejects.toThrow(ERROR); expect(h.calls).toHaveLength(3);
});
it.each(["OAuth", "database"])("clears a %s handoff after consumer failure and prevents reuse", async stage => {
  const h = stage === "OAuth" ? await verified() : await tokened(), consumer = vi.fn(async () => { throw new Error("PRIVATE_CONSUMER_ERROR"); });
  const pending = stage === "OAuth" ? h.custody.consumeAccessToken(h.context, consumer) : useDb(h.custody, h.context, consumer);
  await expect(pending).rejects.toThrow(ERROR); const delivered = (consumer.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];
  expect(delivered[stage === "OAuth" ? "accessToken" : "password"]).toBe("");
  await expect(useDb(h.custody, h.context)).rejects.toThrow(ERROR); expect(h.calls.filter(c => c.url === DB_URL)).toHaveLength(stage === "OAuth" ? 0 : 1);
});
it("does not reuse Google credentials; a new cleanup context independently re-verifies after old abort", async () => {
  const h = await verified(); h.controller.abort(); const next = context(), custody = await h.create(next.context);
  await custody.consumeAccessToken(next.context, async () => {}); await useDb(custody, next.context);
  expect(h.consume).toHaveBeenCalledTimes(2); expect(h.calls.map(c => c.url)).toEqual([STS, IAM, KMS, STS, IAM, KMS, OAUTH_URL, DB_URL]);
  expect(next.context.signal.aborted).toBe(false); expect(h.calls.every(c => c.destroyed)).toBe(true);
});
it("does not connect a second invocation's lifetime to the first invocation", async () => {
  const h = await verified(), next = context(), custody = await h.create(next.context); h.controller.abort();
  await custody.consumeAccessToken(next.context, async () => {}); await useDb(custody, next.context);
  await expect(h.custody.consumeAccessToken(h.context, async () => {})).rejects.toThrow(ERROR); expect(h.calls.filter(c => c.url === OAUTH_URL)).toHaveLength(1);
});
it.each([false, true])("composes concrete crypto/provider, policy, connector, issuer and service with offline external IO (abort=%s)", async abortIssue => {
  const ca = Buffer.from("SYNTHETIC_CA_NEVER_REAL"), h = fixture(sha(ca)), parent = context(), operations: string[] = [];
  const branchUrl = `https://api.supabase.com/v1/projects/${PARENT}/branches`, fetchMock = vi.fn(async () => {
    const reply = new Response(JSON.stringify([{ id: BRANCH, project_ref: REF, parent_project_ref: PARENT,
      is_default: false, persistent: false, with_data: false, status: "FUNCTIONS_DEPLOYED", preview_project_status: "ACTIVE_HEALTHY", deletion_scheduled_at: null }]),
    { headers: { "content-type": "application/json" } }); Object.defineProperty(reply, "url", { value: branchUrl }); return reply;
  });
  vi.stubGlobal("fetch", fetchMock);
  let lease: Record<string, unknown> | undefined; const closes: Array<ReturnType<typeof vi.fn>> = [];
  network.pg.mockImplementation((config: ClientConfig) => {
    expect(config.password).toBe(PASSWORD); expect(config.application_name).toBe("careslink-task-preview-control-only");
    const connection = Object.assign(new EventEmitter(), { stream: { encrypted: true, authorized: true, destroy: vi.fn() } });
    const end = vi.fn(async () => {}); closes.push(end);
    return Object.assign(new EventEmitter(), { connection, connectionParameters: { password: config.password }, password: config.password,
      connect: async () => { connection.emit("readyForQuery", { status: "I" }); }, end,
      query: async (sql: string, args: string[]) => {
        connection.emit("readyForQuery", { status: "I" });
        if (sql === TASK_PREVIEW_CONTROL_IDENTITY_SQL) return { rows: [{ login: "postgres", current: "postgres", database: "postgres", major: 17,
          prepared: 0, operator: true, isolation: "read committed", readOnly: "off", searchPath: "" }] };
        const [op, payload] = args, data = JSON.parse(payload); operations.push(op); let reply;
        if (op === "start" || op === "ready") reply = { projectRef: REF, epoch: data.epoch, ready: op === "ready" };
        else if (op === "inventory") reply = { projectRef: REF, epoch: data.epoch,
          leases: lease && lease.state !== "REVOKED" ? [{ scope: lease.scope, state: lease.state, expiresAt: lease.expiresAt }] : [] };
        else {
          if (op === "issue") lease = { scope: data.scope, state: "ISSUED", role: data.role, expiresAt: data.expiresAt, roleCount: 1, sessionCount: 0, membershipCount: 2 };
          if (op === "fence") lease = { ...lease, state: "FENCED" };
          if (op === "finalize") lease = { ...lease, state: "REVOKED", roleCount: 0, sessionCount: 0, membershipCount: 0 };
          reply = lease;
        }
        if (op === "issue" && abortIssue) parent.controller.abort(); return { rows: [{ data: reply }] };
      } });
  });
  const service = createTaskPreviewCustodiedService({ projectRef: REF, branchId: BRANCH, ca, caSha256: sha(ca), createCustody: h.create });
  try {
    await service.start();
    const scope = { requestId: "f".repeat(32), projectRef: REF, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ" as const,
      callerRole: "careslink_v1_generation_job_list_caller" as const,
      principal: { userId: BRANCH, sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" as const } };
    if (abortIssue) {
      await expect(service.custody.issue(scope, parent.context)).rejects.toThrow("Task Preview service unavailable");
      expect(await service.finished).toEqual({ state: "FAILED", cleanupConfirmed: true });
    } else {
      const issued = await service.custody.issue(scope, parent.context); expect(issued.credential.password).not.toBe(PASSWORD);
      expect(await service.stop()).toEqual({ state: "STOPPED", cleanupConfirmed: true });
    }
    expect(lease?.state).toBe("REVOKED"); expect(operations).toHaveLength(7); expect(h.consume).toHaveBeenCalledTimes(7);
    expect(fetchMock).toHaveBeenCalledTimes(7); expect(h.calls.map(c => c.url)).toEqual(Array.from({ length: 7 }, () => [STS, IAM, KMS, OAUTH_URL, DB_URL]).flat());
    expect(closes).toHaveLength(7); closes.forEach(close => expect(close).toHaveBeenCalledOnce());
    expect(h.calls.every(c => c.destroyed)).toBe(true);
  } finally { await service.stop(); }
});
it("remains uninstalled, server-only, task-specific and absent from public runtime/credential discovery", () => {
  const name = "communication-note-task-preview-gcp", walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual([]);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.env|process\.argv|fetch\s*\(|console\.|macSign\s*\(|\.createSecret|GoogleAuth|createJobStatus/);
  expect(source).not.toMatch(/versions\/latest|["'].*\/macSign["']/); expect(source).toContain("COMMUNICATION_NOTE_TASK_PREVIEW_GCP_READY = false");
  expect(Object.values(R).every(v => v.includes("task-preview-control") || v.includes("task-control"))).toBe(true);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain(CONFIG_ERROR);
});
