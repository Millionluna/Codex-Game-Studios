import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createTaskPreviewControlCustodyFactory as createFactory, COMMUNICATION_NOTE_TASK_PREVIEW_CUSTODY_READY,
  type TaskPreviewCustodyBinding, type TaskPreviewCustodyProvider } from "./communication-note-task-preview-custody.server";
import type { TaskPreviewControlCustody } from "./communication-note-task-preview-control.server";
import { stringifyCaresLinkV1CanonicalJson } from "./v1/canonical-json";
const REF = "abcdefghijklmnopqrst", BRANCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PARENT = "adocsnwnslxhxcjgbyee";
const BASE = Date.parse("2026-09-10T10:00:00.000Z"), ERROR = "Task Preview custody unavailable", PURPOSE = "TASK_LIST_ISSUER_CONTROL_ONLY";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const digest = (value: unknown) => sha(stringifyCaresLinkV1CanonicalJson(value));
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
const controllers: AbortController[] = [];
const ctx = () => { const c = new AbortController(); controllers.push(c); return { controller: c, context: { signal: c.signal } }; };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(BASE); vi.spyOn(performance, "now").mockImplementation(() => Date.now() - BASE); });
afterEach(async () => { controllers.splice(0).forEach(c => c.abort()); await vi.advanceTimersByTimeAsync(2100);
  expect(vi.getTimerCount()).toBe(0); vi.restoreAllMocks(); vi.useRealTimers(); });
function binding(): TaskPreviewCustodyBinding { return { projectRef: REF, branchId: BRANCH, caSha256: "a".repeat(64),
  sourceRevisionSha256: "b".repeat(64), sourceManifestSha256: "c".repeat(64), workloadIdentitySha256: "d".repeat(64),
  credentialPolicySha256: "e".repeat(64), oauthAppReferenceSha256: "f".repeat(64), oauthGrantReferenceSha256: "0".repeat(64) }; }
function target() {
  const core = { projectRef: REF, branchId: BRANCH, purpose: PURPOSE, caSha256: "a".repeat(64), observedAt: iso(0), expiresAt: iso(2000) };
  return { ...core, controlPlaneEvidenceSha256: sha(JSON.stringify({ ...core, parentProjectRef: PARENT,
    defaultBranch: false, persistent: false, withData: false, status: "ACTIVE_HEALTHY" })) };
}
function fixture() {
  const verifyWorkload = vi.fn<TaskPreviewCustodyProvider["verifyWorkload"]>(async request => ({ status: "VERIFIED_TASK_CONTROL_WORKLOAD",
    requestSha256: digest(request), workloadEvidenceSha256: "1".repeat(64), verifiedAt: iso(0), expiresAt: iso(60000) }));
  const token = (request: unknown) => ({ requestSha256: digest(request), credentialClass: "SUPABASE_OAUTH_ACCESS_TOKEN",
    oauthScope: "environment:read", secret: "SYNTHETIC_OAUTH_NOT_A_REAL_TOKEN", expiresAt: iso(60000) });
  const database = (request: unknown) => ({ requestSha256: digest(request), credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD",
    sourceExpiresAt: null, sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET", secret: "SYNTHETIC_DATABASE_NOT_REAL", deliveryExpiresAt: iso(60000) });
  const consumeOAuth = vi.fn<TaskPreviewCustodyProvider["consumeOAuth"]>(async (request, _context, use) => use(token(request)));
  const consumeDatabase = vi.fn<TaskPreviewCustodyProvider["consumeDatabase"]>(async (request, _context, use) => use(database(request)));
  const input = { binding: binding(), provider: { verifyWorkload, consumeOAuth, consumeDatabase } }, create = createFactory(input);
  return { input, create, verifyWorkload, consumeOAuth, consumeDatabase, token, database };
}
async function verified() { const f = fixture(), c = ctx(); return { ...f, ...c, custody: await f.create(c.context) }; }
async function tokened() { const h = await verified(); await h.custody.consumeAccessToken(h.context, async () => {}); return h; }
const useDb = (c: TaskPreviewControlCustody, context: { signal: AbortSignal }, consumer = vi.fn(async () => {})) =>
  c.consumeDatabaseCredential(target() as Parameters<TaskPreviewControlCustody["consumeDatabaseCredential"]>[0], context, consumer);

it("constructs inertly with every readiness gate closed", () => {
  const h = fixture(); expect(COMMUNICATION_NOTE_TASK_PREVIEW_CUSTODY_READY).toBe(false);
  expect(h.verifyWorkload).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("binds one fresh operation to task workload/source/policy before handing off either secret", async () => {
  const h = await verified(), order: string[] = [];
  const request = h.verifyWorkload.mock.calls[0][0];
  expect(request).toMatchObject({ ...h.input.binding, version: "task-preview-control-custody.v1", purpose: PURPOSE,
    action: "VERIFY_TASK_CONTROL_WORKLOAD", applicationName: "careslink-task-preview-control-only",
    environment: "EPHEMERAL_NO_DATA_PREVIEW", postgresMajor: 17, connectionMode: "DIRECT", nonce: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(Object.isFrozen(request)).toBe(true); expect(h.consumeOAuth).not.toHaveBeenCalled(); expect(h.consumeDatabase).not.toHaveBeenCalled();
  const tokenUse = vi.fn(async (value: { accessToken: string }) => { expect(value.accessToken).toBe("SYNTHETIC_OAUTH_NOT_A_REAL_TOKEN"); order.push("token"); });
  await h.custody.consumeAccessToken(h.context, tokenUse);
  expect(h.consumeOAuth.mock.calls[0][0]).toMatchObject({ action: "CONSUME_TASK_CONTROL_OAUTH", oauthScope: "environment:read",
    method: "GET", path: `/v1/projects/${PARENT}/branches`, workloadEvidenceSha256: "1".repeat(64) });
  const dbUse = vi.fn(async (value: { password: string }) => { expect(value.password).toBe("SYNTHETIC_DATABASE_NOT_REAL"); order.push("database"); });
  await h.custody.consumeDatabaseCredential(target() as never, h.context, dbUse);
  expect(h.consumeDatabase.mock.calls[0][0]).toMatchObject({ action: "CONSUME_TASK_CONTROL_DATABASE_PASSWORD", user: "postgres",
    target: target(), credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD", sourceExpiresAt: null,
    sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET", maximumDeliveryLifetimeMs: 60000 });
  expect(order).toEqual(["token", "database"]); expect(tokenUse.mock.calls[0][0].accessToken).toBe(""); expect(dbUse.mock.calls[0][0].password).toBe("");
  expect(h.consumeDatabase.mock.calls[0][1].signal.aborted).toBe(true); expect(h.context.signal.aborted).toBe(false); expect(vi.getTimerCount()).toBe(0);
  await expect(useDb(h.custody, h.context)).rejects.toThrow(ERROR);
});
it.each(["projectRef", "branchId", "caSha256", "sourceRevisionSha256", "sourceManifestSha256", "workloadIdentitySha256",
  "credentialPolicySha256", "oauthAppReferenceSha256", "oauthGrantReferenceSha256"])("rejects malformed %s before provider IO", key => {
  const h = fixture(); expect(() => createFactory({ ...h.input, binding: { ...h.input.binding, [key]: "bad" } })).toThrow(ERROR);
  expect(h.verifyWorkload).not.toHaveBeenCalled();
});
it.each([PARENT, REF + "\n"])("rejects Production/non-exact project target %s", projectRef => {
  const h = fixture(); expect(() => createFactory({ ...h.input, binding: { ...h.input.binding, projectRef } })).toThrow(ERROR);
});
it.each(["root getter", "binding getter", "proxy", "provider getter", "extra", "shared function"])("rejects unusual configuration %s without executing accessors", fault => {
  const h = fixture(), getter = vi.fn(); let input: unknown = h.input;
  if (fault === "root getter") Object.defineProperty(input, "provider", { get: getter });
  if (fault === "binding getter") Object.defineProperty(h.input.binding, "projectRef", { get: getter });
  if (fault === "provider getter") Object.defineProperty(h.input.provider, "verifyWorkload", { get: getter });
  if (fault === "proxy") input = new Proxy(h.input, { ownKeys: getter });
  if (fault === "extra") input = { ...h.input, password: "PRIVATE" };
  if (fault === "shared function") input = { ...h.input, provider: { ...h.input.provider, consumeDatabase: h.consumeOAuth } };
  expect(() => createFactory(input as never)).toThrow(ERROR); expect(getter).not.toHaveBeenCalled();
});
it("snapshots all binding fields and callback references", async () => {
  const h = fixture(), c = ctx(); (h.input.binding as { projectRef: string }).projectRef = PARENT;
  h.input.provider.verifyWorkload = vi.fn(async () => { throw new Error("MUTATED"); });
  const custody = await h.create(c.context); await custody.consumeAccessToken(c.context, async () => {});
  expect(h.verifyWorkload.mock.calls[0][0].projectRef).toBe(REF); expect(h.input.provider.verifyWorkload).not.toHaveBeenCalled();
});
it.each(["pre-abort", "missing", "getter", "proxy", "fake signal"])("rejects invalid context %s before verification", async fault => {
  const h = fixture(), c = ctx(), getter = vi.fn(); let context: unknown = c.context;
  if (fault === "pre-abort") c.controller.abort();
  if (fault === "missing") context = {};
  if (fault === "getter") context = Object.defineProperty({}, "signal", { get: getter, enumerable: true });
  if (fault === "proxy") context = new Proxy(c.context, { ownKeys: getter });
  if (fault === "fake signal") context = { signal: Object.create(AbortSignal.prototype) };
  await expect(h.create(context as never)).rejects.toThrow(ERROR); expect(h.verifyWorkload).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled();
});
it.each([{ status: "VERIFIED_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST_NOT_APPROVED" }, { requestSha256: "0".repeat(64) },
  { workloadEvidenceSha256: "invalid" }, { verifiedAt: "invalid" }, { verifiedAt: new Date(BASE - 1001).toISOString() },
  { verifiedAt: new Date(BASE + 1).toISOString() }, { expiresAt: new Date(BASE + 1999).toISOString() },
  { expiresAt: new Date(BASE + 60001).toISOString() }, { rawIdentityToken: "PRIVATE" }])("rejects mismatched or stale identity proof %j", async change => {
  const h = fixture(), c = ctx(), original = h.verifyWorkload.getMockImplementation()!;
  h.verifyWorkload.mockImplementation(async (request, context) => ({ ...(await original(request, context) as object), ...change }));
  await expect(h.create(c.context)).rejects.toThrow(ERROR); expect(h.consumeOAuth).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("uses a different nonce for each operation and rejects old proof replay", async () => {
  const h = fixture(), a = ctx(), b = ctx(); const proof = await h.verifyWorkload({}, a.context);
  await h.create(a.context); const first = h.verifyWorkload.mock.calls.at(-1)![0];
  h.verifyWorkload.mockResolvedValue(proof); await expect(h.create(b.context)).rejects.toThrow(ERROR);
  expect(h.verifyWorkload.mock.calls.at(-1)![0].nonce).not.toBe(first.nonce);
});
it("bounds an unresponsive verifier and rejects later credential access", async () => {
  const h = fixture(), c = ctx(); h.verifyWorkload.mockReturnValue(new Promise(() => {}));
  const pending = expect(h.create(c.context)).rejects.toThrow(ERROR); await vi.advanceTimersByTimeAsync(2000); await pending;
  expect(h.consumeOAuth).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("measures attestation lifetime from its verification time, not the earlier request start", async () => {
  const h = fixture(), c = ctx(), original = h.verifyWorkload.getMockImplementation()!;
  h.verifyWorkload.mockImplementation(async (request, context) => {
    await new Promise(resolve => setTimeout(resolve, 250)); return original(request, context);
  });
  const pending = h.create(c.context); await vi.advanceTimersByTimeAsync(250);
  const custody = await pending; await custody.consumeAccessToken(c.context, async () => {});
  expect(h.consumeOAuth).toHaveBeenCalledOnce();
});
it.each(["OAuth", "database"])("bounds an unresponsive %s handoff and refuses its later callback", async stage => {
  const h = stage === "OAuth" ? await verified() : await tokened(), use = vi.fn(async () => {});
  let callback: ((value: unknown) => Promise<void>) | undefined;
  const stalled: TaskPreviewCustodyProvider["consumeOAuth"] = async (_request, _context, consume) => {
    callback = consume; await new Promise(() => {});
  };
  if (stage === "OAuth") h.consumeOAuth.mockImplementation(stalled); else h.consumeDatabase.mockImplementation(stalled);
  const pending = expect(stage === "OAuth" ? h.custody.consumeAccessToken(h.context, use) : useDb(h.custody, h.context, use)).rejects.toThrow(ERROR);
  await vi.advanceTimersByTimeAsync(2000); await pending;
  await expect(callback!({ secret: "LATE_SECRET" })).rejects.toThrow(); expect(use).not.toHaveBeenCalled();
});
it("closes both attempts when concurrent callers try to consume the same OAuth capability", async () => {
  const h = await verified(); h.consumeOAuth.mockImplementation(async () => new Promise(() => {}));
  const first = expect(h.custody.consumeAccessToken(h.context, async () => {})).rejects.toThrow(ERROR);
  await expect(h.custody.consumeAccessToken(h.context, async () => {})).rejects.toThrow(ERROR); await first;
  expect(h.consumeOAuth).toHaveBeenCalledOnce(); expect(h.consumeDatabase).not.toHaveBeenCalled();
});
it("rejects nonfinite monotonic health even before its timer has fired", async () => {
  const h = await verified(); vi.mocked(performance.now).mockReturnValue(NaN);
  await expect(h.custody.consumeAccessToken(h.context, async () => {})).rejects.toThrow(ERROR); expect(h.consumeOAuth).not.toHaveBeenCalled();
});
it("does not allow password access before OAuth and branch validation", async () => {
  const h = await verified(); await expect(useDb(h.custody, h.context)).rejects.toThrow(ERROR); expect(h.consumeDatabase).not.toHaveBeenCalled();
  await expect(h.custody.consumeAccessToken(h.context, async () => {})).rejects.toThrow(ERROR);
});
it.each(["OAuth", "database"])("rejects a foreign operation signal for %s", async stage => {
  const h = stage === "OAuth" ? await verified() : await tokened(), foreign = ctx();
  await expect(stage === "OAuth" ? h.custody.consumeAccessToken(foreign.context, async () => {}) : useDb(h.custody, foreign.context)).rejects.toThrow(ERROR);
  expect(h.consumeDatabase).not.toHaveBeenCalled();
});
it.each(["never", "twice", "failed", "throw-after", "late", "unawaited"])("rejects an invalid OAuth provider handoff: %s", async fault => {
  const h = await verified(), use = vi.fn(async () => {}); let late: ((v: unknown) => Promise<void>) | undefined;
  h.consumeOAuth.mockImplementation(async (request, _context, consume) => {
    if (fault === "never") return;
    if (fault === "failed") throw new Error("PRIVATE_ERROR");
    if (fault === "late") { late = consume; return; }
    if (fault === "unawaited") { void consume(h.token(request)); return; }
    await consume(h.token(request)); if (fault === "twice") await consume(h.token(request));
    throw new Error("PRIVATE_ERROR");
  });
  if (fault === "unawaited") use.mockImplementation(() => new Promise(() => {}));
  await expect(h.custody.consumeAccessToken(h.context, use)).rejects.toThrow(ERROR);
  if (late) { await expect(late(h.token({}))).rejects.toThrow(); expect(use).not.toHaveBeenCalled(); }
  await expect(useDb(h.custody, h.context)).rejects.toThrow(ERROR); expect(h.consumeDatabase).not.toHaveBeenCalled();
});
it.each([{ oauthScope: "all" }, { credentialClass: "PERSONAL_ACCESS_TOKEN" }, { requestSha256: "0".repeat(64) },
  { secret: "short" }, { secret: "invalid\n".repeat(5) }, { expiresAt: new Date(BASE + 2000).toISOString() }, { refreshToken: "PRIVATE" }])(
  "rejects bad OAuth metadata without handing it to HTTP: %j", async change => {
    const h = await verified(), use = vi.fn(async () => {});
    h.consumeOAuth.mockImplementation(async (request, _context, consume) => consume({ ...h.token(request), ...change }));
    await expect(h.custody.consumeAccessToken(h.context, use)).rejects.toThrow(ERROR); expect(use).not.toHaveBeenCalled();
  });
it.each([{ projectRef: PARENT }, { branchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, { purpose: "JOB_STATUS_ISSUER_CONTROL_ONLY" },
  { caSha256: "0".repeat(64) }, { controlPlaneEvidenceSha256: "0".repeat(64) }, { observedAt: new Date(BASE + 1).toISOString() },
  { expiresAt: new Date(BASE + 2001).toISOString() }, { password: "PRIVATE" }])("rejects a changed branch target before password custody %j", async change => {
  const h = await tokened(); await expect(h.custody.consumeDatabaseCredential({ ...target(), ...change } as never, h.context, async () => {})).rejects.toThrow(ERROR);
  expect(h.consumeDatabase).not.toHaveBeenCalled();
});
it.each([{ credentialClass: "EPHEMERAL_LOGIN" }, { sourceExpiresAt: new Date(BASE + 60000).toISOString() }, { sourceRevocation: "DELIVERY_EXPIRY" },
  { requestSha256: "0".repeat(64) }, { secret: "short" }, { secret: "x".repeat(257) }, { secret: "x".repeat(30) + "\n" },
  { deliveryExpiresAt: new Date(BASE + 1999).toISOString() }, { deliveryExpiresAt: new Date(BASE + 60001).toISOString() }, { extra: "PRIVATE" }])(
  "rejects bad password metadata before connecting %j", async change => {
    const h = await tokened(), use = vi.fn(async () => {});
    h.consumeDatabase.mockImplementation(async (request, _context, consume) => consume({ ...h.database(request), ...change }));
    await expect(useDb(h.custody, h.context, use)).rejects.toThrow(ERROR); expect(use).not.toHaveBeenCalled();
  });
it.each(["never", "twice", "throw-after"])("rejects invalid database callback completion: %s", async fault => {
  const h = await tokened(); h.consumeDatabase.mockImplementation(async (request, _context, consume) => {
    if (fault === "never") return; await consume(h.database(request));
    if (fault === "twice") await consume(h.database(request)); else throw new Error("PRIVATE_ERROR");
  });
  await expect(useDb(h.custody, h.context)).rejects.toThrow(ERROR); await expect(useDb(h.custody, h.context)).rejects.toThrow(ERROR);
});
it.each(["expiry", "forward-clock", "backward-clock", "abort"])("closes a previously verified custody session after %s", async fault => {
  const h = await verified();
  if (fault === "expiry") await vi.advanceTimersByTimeAsync(2000);
  if (fault === "forward-clock") { vi.mocked(performance.now).mockReturnValue(0); vi.setSystemTime(BASE + 1001); }
  if (fault === "backward-clock") vi.setSystemTime(BASE - 1);
  if (fault === "abort") h.controller.abort();
  await expect(h.custody.consumeAccessToken(h.context, async () => {})).rejects.toThrow(ERROR); expect(h.consumeOAuth).not.toHaveBeenCalled();
});
it("allows an independently verified cleanup operation after the old request aborts", async () => {
  const h = await verified(); h.controller.abort(); const next = ctx(), custody = await h.create(next.context);
  await custody.consumeAccessToken(next.context, async () => {}); await useDb(custody, next.context);
  expect(h.verifyWorkload).toHaveBeenCalledTimes(2); expect(h.consumeDatabase).toHaveBeenCalledOnce(); expect(next.context.signal.aborted).toBe(false);
});
it("remains uninstalled, server-only and independent of shared credentials or GCP factory activation", () => {
  const name = "communication-note-task-preview-custody", walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") && !p.endsWith(`${name}.server.ts`))
    .filter(p => readFileSync(p, "utf8").includes(name))).toEqual(["src/lib/communication-note-task-preview-gcp.server.ts"]);
  const source = readFileSync(`src/lib/${name}.server.ts`, "utf8"); expect(source).toMatch(/^import "server-only";/);
  expect(source).not.toMatch(/process\.env|fetch\s*\(|console\.|createJobStatus|createGcp|secret-manager|refreshToken/);
  expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toMatch(/HOSTED_WORKSPACE_READ_BINDING\s*=\s*undefined/);
  expect(readFileSync("scripts/check-m1r-client-bundle.mjs", "utf8")).toContain(ERROR);
});
