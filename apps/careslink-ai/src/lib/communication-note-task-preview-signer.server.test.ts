import { constants, generateKeyPairSync, randomBytes, sign as signBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { decodeProtectedHeader } from "jose";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createTaskPreviewAssertionProvider as createSigner, COMMUNICATION_NOTE_TASK_PREVIEW_SIGNER_READY,
  type TaskPreviewSignerOptions } from "./communication-note-task-preview-signer.server";
import { createTaskPreviewAssertionVerifier, parseTaskPreviewUnsignedCommand, TASK_PREVIEW_TRANSPORT_PATHS as PATHS,
  TASK_PREVIEW_TRANSPORT_JWT_TYPE as TYPE, type TaskPreviewCommand } from "./communication-note-task-preview-protocol.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PROD } from "./v1/ndis-shadow-guard";

const REF = "abcdefghijklmnopqrst", ORIGIN = "https://task-preview.invalid", INSTANCE = "1".repeat(64);
const BASE = Date.parse("2026-09-11T12:00:00.000Z"), ERROR = "Task Preview signer unavailable";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }), foreign = generateKeyPairSync("rsa", { modulusLength: 2048 });
const identity = { origin: ORIGIN, issuer: "https://task-backend.invalid/", subject: "task-workspace-backend", keyId: "task-key-v1",
  publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString() };
const principal = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", transport: "COOKIE" as const };
const nonce = () => randomBytes(16).toString("hex");
function command(action: keyof typeof PATHS = "issue", requestId = "a".repeat(32)): TaskPreviewCommand {
  const now = Math.floor(Date.now() / 1000);
  return { iss: identity.issuer, aud: ORIGIN, sub: identity.subject, iat: now, nbf: now, exp: now + 30, jti: nonce(),
    instanceId: INSTANCE, method: "POST", path: PATHS[action], scope: { requestId, projectRef: REF,
      purpose: "COMMUNICATION_NOTE_JOB_LIST_READ", callerRole: "careslink_v1_generation_job_list_caller", principal: { ...principal } } };
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const controllers: AbortController[] = [];
function context() { const controller = new AbortController(); controllers.push(controller); return { controller, signal: controller.signal }; }
function fixture() {
  const consume = vi.fn<TaskPreviewSignerOptions["consumeSignature"]>(async (input, ctx, deliver) => {
    expect(ctx.signal.aborted).toBe(false);
    const signature = signBytes("RSA-SHA256", input.signingInput, keys.privateKey);
    try { await deliver(signature); } finally { signature.fill(0); }
  });
  const options: TaskPreviewSignerOptions = { projectRef: REF, principal: { ...principal }, identity: { ...identity }, instanceId: INSTANCE, consumeSignature: consume };
  const signer = createSigner(options), ctx = context(), used: string[] = [];
  const accept = vi.fn(async (token: string) => { used.push(token); });
  const run = (c = command(), signal = ctx.signal) => signer.consumeAssertion(c, { signal }, accept);
  return { options, signer, consume, ctx, used, use: accept, run };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }); vi.setSystemTime(BASE);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - BASE);
});
afterEach(async () => {
  controllers.splice(0).forEach(c => c.abort()); await vi.advanceTimersByTimeAsync(20000);
  expect(vi.getTimerCount()).toBe(0); vi.restoreAllMocks(); vi.useRealTimers();
});

it("constructs inertly, exposes only assertion consumption and remains uninstalled", () => {
  const h = fixture(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_SIGNER_READY).toBe(false);
  expect(Object.keys(h.signer)).toEqual(["consumeAssertion"]); expect(h.consume).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it.each([
  ["production", { projectRef: PROD }], ["wrong project", { projectRef: "short" }],
  ["bad instance", { instanceId: "1".repeat(64) + "\n" }], ["invalid signer", { consumeSignature: "secret" }],
  ["extra field", { privateKey: "forbidden" }], ["bearer", { principal: { ...principal, transport: "BEARER" } }],
  ["no session", { principal: { ...principal, sessionId: undefined } }],
  ["http identity", { identity: { ...identity, origin: "http://task-preview.invalid" } }],
  ["private key", { identity: { ...identity, publicKeyPem: keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString() } }],
])("rejects invalid trusted configuration without invoking signing: %s", (_name, change) => {
  const h = fixture(); expect(() => createSigner({ ...h.options, ...change } as TaskPreviewSignerOptions)).toThrow(); expect(h.consume).not.toHaveBeenCalled();
});
it("rejects proxy/accessor configuration without invoking getters or dependencies", () => {
  const h = fixture(), getter = vi.fn(() => h.consume);
  for (const options of [new Proxy(h.options, {}), { ...h.options, identity: new Proxy(identity, {}) },
    { ...h.options, consumeSignature: new Proxy(h.consume, {}) }, Object.defineProperty({ ...h.options }, "consumeSignature", { get: getter })]) {
    expect(() => createSigner(options)).toThrow();
  }
  expect(getter).not.toHaveBeenCalled(); expect(h.consume).not.toHaveBeenCalled();
});
it("signs exact canonical commands, verifies real RSA signatures and clears owned input", async () => {
  const h = fixture(), issue = command(), revoke = command("revoke"), verify = createTaskPreviewAssertionVerifier(identity);
  await h.run(issue); await h.run(revoke, context().signal);
  expect(h.use).toHaveBeenCalledTimes(2); expect(h.consume).toHaveBeenCalledTimes(2);
  expect(await verify(h.used[0], "issue", REF, INSTANCE)).toEqual(issue); expect(await verify(h.used[1], "revoke", REF, INSTANCE)).toEqual(revoke);
  expect(decodeProtectedHeader(h.used[0])).toEqual({ alg: "RS256", typ: TYPE, kid: identity.keyId });
  expect(h.consume.mock.calls.every(([input, ctx]) => input.algorithm === "RS256" && input.keyId === identity.keyId &&
    input.signingInput.every(b => b === 0) && ctx.signal.aborted)).toBe(true);
  await expect(h.run(command())).rejects.toThrow(ERROR); await expect(h.run(command("revoke"))).rejects.toThrow(ERROR);
});
it("waits for the full signing dependency to complete before releasing an assertion", async () => {
  const h = fixture(); let complete = false;
  h.consume.mockImplementation(async (input, _ctx, deliver) => {
    await deliver(signBytes("RSA-SHA256", input.signingInput, keys.privateKey));
    expect(h.use).not.toHaveBeenCalled(); complete = true;
  });
  h.use.mockImplementation(async () => { expect(complete).toBe(true); }); await h.run(); expect(h.use).toHaveBeenCalledOnce();
});
it.each([2049, 4096])("supports the pinned RSA modulus size without truncating signature bytes: %s", async modulusLength => {
  const h = fixture(), pair = generateKeyPairSync("rsa", { modulusLength });
  const pinned = { ...identity, publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
  const provider = createSigner({ ...h.options, identity: pinned, consumeSignature: async (input, _ctx, deliver) => {
    const signature = signBytes("RSA-SHA256", input.signingInput, pair.privateKey);
    expect(signature.length).toBe(Math.ceil(pair.publicKey.asymmetricKeyDetails!.modulusLength! / 8));
    try { await deliver(signature); } finally { signature.fill(0); }
  } });
  const c = command(); await provider.consumeAssertion(c, { signal: h.ctx.signal }, h.use);
  expect(await createTaskPreviewAssertionVerifier(pinned)(h.used[0], "issue", REF, INSTANCE)).toEqual(c);
});
it.each([
  ["issuer", { iss: "https://foreign.invalid/" }], ["audience", { aud: "https://foreign.invalid" }], ["array audience", { aud: [ORIGIN] }],
  ["subject", { sub: "attacker" }], ["instance", { instanceId: "2".repeat(64) }], ["method", { method: "GET" }],
  ["path", { path: "/admin" }], ["short nonce", { jti: "bad" }], ["nonce newline", { jti: "1".repeat(32) + "\n" }],
  ["future", { iat: BASE / 1000 + 1, nbf: BASE / 1000 + 1 }], ["old", { iat: BASE / 1000 - 11, nbf: BASE / 1000 - 11 }],
  ["expired", { exp: BASE / 1000 - 1 }], ["long lifetime", { exp: BASE / 1000 + 31 }], ["changed lifetime", { exp: BASE / 1000 + 29 }],
  ["divergent nbf", { nbf: BASE / 1000 - 1 }], ["missing nbf", { nbf: undefined }], ["fractional time", { exp: BASE / 1000 + 29.5 }],
  ["extra claim", { role: "admin" }], ["key override", { keyId: "other" }],
])("rejects unauthorized commands before signing: %s", async (_name, change) => {
  const h = fixture(); await expect(h.run({ ...command(), ...change } as TaskPreviewCommand)).rejects.toThrow(ERROR); expect(h.consume).not.toHaveBeenCalled();
});
it.each([
  ["target", { projectRef: PROD }], ["request", { requestId: "invalid" }], ["purpose", { purpose: "WRONG" }],
  ["caller role", { callerRole: "postgres" }], ["user", { principal: { ...principal, userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }],
  ["session", { principal: { ...principal, sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } }],
  ["user metadata", { principal: { ...principal, user_metadata: { admin: true } } }], ["bearer", { principal: { ...principal, transport: "BEARER" } }],
])("rejects scope substitutions before signing: %s", async (_name, change) => {
  const h = fixture(), c = command(); await expect(h.run({ ...c, scope: { ...c.scope, ...change } } as TaskPreviewCommand)).rejects.toThrow(ERROR);
  expect(h.consume).not.toHaveBeenCalled();
});
it("rejects command getters/proxies, fake/pre-aborted signals and invalid consumers before signing", async () => {
  const h = fixture(), c = command(), getter = vi.fn(() => c.scope), stopped = context(); stopped.controller.abort();
  for (const raw of [new Proxy(c, {}), Object.defineProperty({ ...c }, "scope", { get: getter }), { ...c, scope: new Proxy(c.scope, {}) }]) {
    await expect(h.run(raw)).rejects.toThrow(ERROR);
  }
  for (const signal of [stopped.signal, Object.create(AbortSignal.prototype), new Proxy(h.ctx.signal, {})]) await expect(h.run(c, signal)).rejects.toThrow(ERROR);
  await expect(h.signer.consumeAssertion(c, { signal: h.ctx.signal }, "invalid" as never)).rejects.toThrow(ERROR);
  expect(getter).not.toHaveBeenCalled(); expect(h.consume).not.toHaveBeenCalled();
});
it("allows one revoke before unknown issue and never signs an issue afterward", async () => {
  const h = fixture(); await h.run(command("revoke")); await expect(h.run()).rejects.toThrow(ERROR); expect(h.consume).toHaveBeenCalledOnce();
});
it("rejects nonce reuse and wrong cleanup scope without consuming the valid cleanup opportunity", async () => {
  const h = fixture(), c = command(); await h.run(c);
  await expect(h.run({ ...command("revoke"), jti: c.jti })).rejects.toThrow(ERROR);
  await expect(h.run(command("revoke", "b".repeat(32)))).rejects.toThrow(ERROR);
  await h.run(command("revoke")); expect(h.consume).toHaveBeenCalledTimes(2);
});
it("snapshots identity/principal and copies a command before asynchronous signing", async () => {
  const h = fixture(), c = command(), entered = deferred<void>(), gate = deferred<void>(), expected = structuredClone(c);
  const sign = h.consume.getMockImplementation()!;
  h.consume.mockImplementation(async (...args) => { entered.resolve(); await gate.promise; await sign(...args); });
  const pending = h.run(c); await entered.promise;
  (h.options.identity as { origin: string }).origin = "https://foreign.invalid";
  (h.options.principal as { userId: string }).userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  (c.scope as { requestId: string }).requestId = "b".repeat(32); (c as { jti: string }).jti = nonce();
  gate.resolve(); await pending;
  expect(await createTaskPreviewAssertionVerifier(identity)(h.used[0], "issue", REF, INSTANCE)).toEqual(expected);
});
it("duplicate/wrong-scope calls do not abort the admitted signing operation", async () => {
  const h = fixture(), entered = deferred<void>(), gate = deferred<void>(), original = h.consume.getMockImplementation()!, c = command();
  h.consume.mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; expect(args[1].signal.aborted).toBe(false); await original(...args); });
  const pending = h.run(c); await entered.promise;
  await expect(h.run(c)).rejects.toThrow(ERROR); await expect(h.run(command("issue", "b".repeat(32)))).rejects.toThrow(ERROR);
  gate.resolve(); await pending; expect(h.consume).toHaveBeenCalledOnce();
});
it.each(["empty", "short", "long", "string", "foreign", "tampered", "pss", "mutated input"])("rejects invalid signature delivery: %s", async mode => {
  const h = fixture();
  h.consume.mockImplementation(async (input, _ctx, deliver) => {
    if (mode === "mutated input") input.signingInput.fill(0);
    let signature: unknown = signBytes("RSA-SHA256", input.signingInput, mode === "foreign" ? foreign.privateKey : keys.privateKey);
    if (mode === "empty") signature = Buffer.alloc(0);
    if (mode === "short") signature = Buffer.alloc(255);
    if (mode === "long") signature = Buffer.alloc(513);
    if (mode === "string") signature = (signature as Buffer).toString("base64url");
    if (mode === "tampered") (signature as Buffer)[0] ^= 1;
    if (mode === "pss") signature = signBytes("sha256", input.signingInput, { key: keys.privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 });
    await deliver(signature as Uint8Array);
  });
  await expect(h.run()).rejects.toThrow(ERROR); expect(h.use).not.toHaveBeenCalled();
  expect(h.consume.mock.calls[0][0].signingInput.every(b => b === 0)).toBe(true);
});
it.each(["absent", "duplicate", "unawaited", "throw after delivery"])("withholds assertions on a broken signature handoff: %s", async mode => {
  const h = fixture(); let pending: Promise<void> | undefined;
  h.consume.mockImplementation(async (input, _ctx, deliver) => {
    if (mode === "absent") return;
    const signature = signBytes("RSA-SHA256", input.signingInput, keys.privateKey);
    pending = deliver(signature);
    if (mode === "unawaited") return;
    await pending;
    if (mode === "duplicate") await deliver(signature);
    if (mode === "throw after delivery") throw new Error("PRIVATE_SIGNING_FAILURE");
  });
  await expect(h.run()).rejects.toThrow(ERROR);
  if (mode === "unawaited") await expect(pending).rejects.toThrow();
  expect(h.use).not.toHaveBeenCalled();
});
it("rejects a signature callback delivered after the dependency already returned", async () => {
  const h = fixture(); let late!: () => Promise<void>;
  h.consume.mockImplementation(async (input, _ctx, deliver) => { const signature = signBytes("RSA-SHA256", input.signingInput, keys.privateKey); late = () => deliver(signature); });
  await expect(h.run()).rejects.toThrow(ERROR); await expect(late()).rejects.toThrow(); expect(h.use).not.toHaveBeenCalled();
});
it("bounds a stuck signer at two seconds and suppresses its late result", async () => {
  const h = fixture(), entered = deferred<void>(), gate = deferred<void>(); let late!: () => Promise<void>;
  h.consume.mockImplementation(async (input, _ctx, deliver) => {
    const signature = signBytes("RSA-SHA256", input.signingInput, keys.privateKey); late = () => deliver(signature); entered.resolve(); await gate.promise; throw new Error("LATE_FAILURE");
  });
  const pending = expect(h.run()).rejects.toThrow(ERROR); await entered.promise; await vi.advanceTimersByTimeAsync(2000); await pending;
  await expect(late()).rejects.toThrow(); gate.resolve(); await Promise.resolve(); expect(h.use).not.toHaveBeenCalled();
  expect(h.consume.mock.calls[0][1].signal.aborted).toBe(true);
});
it("checks elapsed signing time even when the timeout callback has not run", async () => {
  const h = fixture(); h.consume.mockImplementation(async (input, _ctx, deliver) => {
    await deliver(signBytes("RSA-SHA256", input.signingInput, keys.privateKey)); vi.setSystemTime(BASE + 2000);
  });
  await expect(h.run()).rejects.toThrow(ERROR); expect(h.use).not.toHaveBeenCalled();
});
it("retains exact-scope cleanup authority after page cancellation", async () => {
  const h = fixture(), entered = deferred<void>();
  h.consume.mockImplementationOnce(async () => { entered.resolve(); await new Promise(() => {}); });
  const pending = expect(h.run()).rejects.toThrow(ERROR); await entered.promise; h.ctx.controller.abort(); await pending;
  await h.run(command("revoke"), context().signal); expect(h.use).toHaveBeenCalledOnce();
  expect(h.consume.mock.calls[0][1].signal).not.toBe(h.consume.mock.calls[1][1].signal);
});
it("revoke cancels pending issue signing without inheriting its cancellation", async () => {
  const h = fixture(), entered = deferred<void>(); h.consume.mockImplementationOnce(async () => { entered.resolve(); await new Promise(() => {}); });
  const pending = expect(h.run()).rejects.toThrow(ERROR); await entered.promise; await h.run(command("revoke"), context().signal); await pending;
  expect(h.consume.mock.calls[0][1].signal.aborted).toBe(true); expect(h.use).toHaveBeenCalledOnce();
});
it("never retries failed issue or cleanup signing", async () => {
  const h = fixture(); h.consume.mockRejectedValue(new Error("PRIVATE_SIGNING_FAILURE"));
  await expect(h.run()).rejects.toThrow(ERROR); await expect(h.run()).rejects.toThrow(ERROR);
  await expect(h.run(command("revoke"))).rejects.toThrow(ERROR); await expect(h.run(command("revoke"))).rejects.toThrow(ERROR);
  expect(h.consume).toHaveBeenCalledTimes(2);
});
it("bounds an uncooperative assertion consumer and observes late failures", async () => {
  const h = fixture(), entered = deferred<void>(), gate = deferred<void>();
  h.use.mockImplementation(async () => { entered.resolve(); await gate.promise; throw new Error("PRIVATE_CONSUMER_FAILURE"); });
  const pending = expect(h.run()).rejects.toThrow(ERROR); await entered.promise; await vi.advanceTimersByTimeAsync(7500); await pending;
  gate.resolve(); await Promise.resolve(); expect(h.use).toHaveBeenCalledOnce();
});
it.each([-2000, 2000])("withholds assertions after a wall/monotonic clock jump: %s", async jump => {
  const h = fixture(); h.consume.mockImplementation(async (input, _ctx, deliver) => {
    await deliver(signBytes("RSA-SHA256", input.signingInput, keys.privateKey)); vi.mocked(performance.now).mockReturnValue(0); vi.setSystemTime(BASE + jump);
  });
  await expect(h.run()).rejects.toThrow(ERROR); expect(h.use).not.toHaveBeenCalled();
});
it("propagates consumer rejection generically and still permits exact-scope cleanup", async () => {
  const h = fixture(); h.use.mockRejectedValueOnce(new Error("PRIVATE_CONSUMER_FAILURE"));
  await expect(h.run()).rejects.toThrow(ERROR); await h.run(command("revoke"), context().signal); expect(h.use).toHaveBeenCalledTimes(2);
});
it("rechecks freshness after the assertion consumer has completed", async () => {
  const h = fixture(); h.use.mockImplementation(async () => { vi.mocked(performance.now).mockReturnValue(0); vi.setSystemTime(BASE + 2000); });
  await expect(h.run()).rejects.toThrow(ERROR); expect(h.use).toHaveBeenCalledOnce();
});
it("unsigned command parsing is not a substitute for cryptographic verification", async () => {
  const c = command(); expect(parseTaskPreviewUnsignedCommand(c, identity, REF, INSTANCE)).toEqual(c);
  const fake = Buffer.from(JSON.stringify({ alg: "RS256", typ: TYPE, kid: identity.keyId })).toString("base64url") + "." +
    Buffer.from(JSON.stringify(c)).toString("base64url") + "." + Buffer.alloc(256).toString("base64url");
  await expect(createTaskPreviewAssertionVerifier(identity)(fake, "issue", REF, INSTANCE)).rejects.toThrow();
});
it("keeps signer source server-only, free of private keys/IO/control imports, and uninstalled", () => {
  const name = "communication-note-task-preview-signer", walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual([]);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.env|fetch\s*\(|createPrivateKey|generateKeyPair|SignJWT|BEGIN PRIVATE KEY|console\.|from ["'](?:pg|node:(?:https?|fs)|@google-cloud\/)/);
  expect(source).not.toMatch(/from .*task-preview-(?:client|issuer|control|host|service|gcp|custody|transport)\.server/);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain(ERROR);
});
