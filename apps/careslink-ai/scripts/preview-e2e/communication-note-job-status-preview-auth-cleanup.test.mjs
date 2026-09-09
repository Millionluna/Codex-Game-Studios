import assert from "node:assert/strict";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupJobStatusPreviewAuth, JOB_STATUS_AUTH_CLEANUP_STEP_TIMEOUT_MS } from "./communication-note-job-status-preview-auth-cleanup.mjs";
import { createJobStatusPreviewAuthClient } from "./communication-note-job-status-preview.mjs";

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const EMAIL = `cl-job-status-${"a".repeat(32)}@example.invalid`;
const jwt = (sub = USER, session_id = SESSION) => "e30." + Buffer.from(JSON.stringify({ sub, session_id })).toString("base64url") + ".synthetic";
const TOKEN = jwt();
const secretError = Object.assign(new Error("NEVER_PRINT_PRIVATE_AUTH_BODY"), { code: "NEVER_PRINT_PRIVATE_CODE" });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function harness({ active = false, knownUser = true, present = true, failAt, failResult, failError = secretError } = {}) {
  const calls = [];
  let account = present;
  let sessions = active ? [SESSION] : [];
  let countReads = 0;
  const perform = (stage, value) => {
    calls.push(stage);
    if (stage === failAt) {
      if (failResult !== undefined) return failResult;
      throw failError;
    }
    return value();
  };
  const query = vi.fn(async (sql, values) => {
    if (sql.startsWith("select id::text, email from auth.users")) {
      expect(values).toEqual([EMAIL, knownUser ? USER : null]);
      return perform("lookup", () => ({ rows: account ? [{ id: USER, email: EMAIL }] : [] }));
    }
    if (sql.startsWith("select id::text from auth.sessions")) {
      expect(values).toEqual([USER]);
      return perform("inspect", () => ({ rows: sessions.map(id => ({ id })) }));
    }
    if (sql.startsWith("select count(*)::int as n from auth.sessions")) {
      expect(values).toEqual([USER]);
      return perform(++countReads === 1 ? "zero-before" : "zero-after", () => ({ rows: [{ n: sessions.length }] }));
    }
    if (sql.startsWith("select count(*)::int as n from auth.users")) {
      expect(values).toEqual([EMAIL, USER]);
      return perform("absent", () => ({ rows: [{ n: account ? 1 : 0 }] }));
    }
    throw new Error("Unexpected SQL");
  });
  const signOut = vi.fn(async (token, scope) => {
    expect(token).toBe(TOKEN); expect(scope).toBe("local");
    return perform("signout", () => { sessions = []; return { error: null }; });
  });
  const deleteUser = vi.fn(async id => {
    expect(id).toBe(USER);
    return perform("delete", () => { account = false; return { error: null }; });
  });
  return { calls, query, signOut, deleteUser,
    options: { admin: { query }, authAdmin: { auth: { admin: { signOut, deleteUser } } },
      email: EMAIL, userId: knownUser ? USER : undefined, token: TOKEN } };
}

describe("job-status synthetic Auth cleanup", () => {
  it("does not repeat sign-out after fresh SQL proves no session, but rechecks before and after deletion", async () => {
    const h = harness();
    expect(await cleanupJobStatusPreviewAuth(h.options)).toEqual({ ok: true, stage: "complete", failure: null,
      revocation: "already-absent", deletionAcknowledged: true, accountAbsent: true, sessionsAbsent: true });
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.calls).toEqual(["lookup", "inspect", "zero-before", "delete", "absent", "zero-after"]);
  });
  it("signs out one exact active session before deleting its account", async () => {
    const h = harness({ active: true });
    expect(await cleanupJobStatusPreviewAuth(h.options)).toMatchObject({ ok: true, revocation: "performed" });
    expect(h.calls).toEqual(["lookup", "inspect", "signout", "zero-before", "delete", "absent", "zero-after"]);
  });
  it("discovers a lost create acknowledgement only by the exact generated email", async () => {
    const h = harness({ knownUser: false });
    expect(await cleanupJobStatusPreviewAuth(h.options)).toMatchObject({ ok: true });
    expect(h.deleteUser).toHaveBeenCalledWith(USER);
  });
  it("can attest a previously absent known account and checks its sessions independently", async () => {
    const h = harness({ present: false });
    expect(await cleanupJobStatusPreviewAuth(h.options)).toMatchObject({ ok: true, revocation: "account-already-absent", deletionAcknowledged: false });
    expect(h.signOut).not.toHaveBeenCalled(); expect(h.deleteUser).not.toHaveBeenCalled();
    expect(h.calls).toEqual(["lookup", "absent", "zero-before"]);
  });
  it("does not claim cleanup when the create acknowledgement and account ID are both unknown", async () => {
    const h = harness({ present: false, knownUser: false });
    expect(await cleanupJobStatusPreviewAuth(h.options)).toMatchObject({ ok: false, stage: "account-binding", accountAbsent: false });
    expect(h.deleteUser).not.toHaveBeenCalled();
  });
  it.each([
    ["lookup", "account-lookup"], ["inspect", "session-inspection"], ["signout", "session-signout"],
    ["zero-before", "zero-sessions-before-delete"], ["delete", "account-delete"],
    ["absent", "account-absence"], ["zero-after", "zero-sessions-after-delete"],
  ])("reports %s failure without leaking data or starting subsequent steps", async (failAt, stage) => {
    const h = harness({ active: true, failAt });
    const result = await cleanupJobStatusPreviewAuth(h.options);
    expect(result).toMatchObject({ ok: false, stage, failure: "UNEXPECTED_FAILURE" });
    expect(h.calls.at(-1)).toBe(failAt);
    expect(JSON.stringify(result)).not.toMatch(/NEVER_PRINT|11111111|22222222|example.invalid|synthetic/);
    if (["lookup", "inspect", "signout", "zero-before"].includes(failAt)) expect(h.deleteUser).not.toHaveBeenCalled();
    if (failAt === "zero-after") expect(result.sessionsAbsent).toBe(false);
  });
  it.each([
    ["42501", "DATABASE_PERMISSION_DENIED"], ["23503", "DATABASE_FOREIGN_KEY"],
    ["ECONNRESET", "DATABASE_UNAVAILABLE"], ["bad_jwt", "AUTH_BAD_JWT"],
    ["session_not_found", "AUTH_SESSION_OR_USER_ABSENT"], ["session_expired", "AUTH_SESSION_OR_USER_ABSENT"],
    ["not_admin", "AUTH_DENIED"], ["unexpected_failure", "AUTH_UNAVAILABLE"],
  ])("maps only safe fixed error categories for %s", async (code, failure) => {
    const h = harness({ active: true, failAt: "signout", failResult: { error: Object.assign(new Error("PRIVATE"), { code }) } });
    expect(await cleanupJobStatusPreviewAuth(h.options)).toMatchObject({ ok: false, stage: "session-signout", failure });
    expect(h.deleteUser).not.toHaveBeenCalled();
  });
  it.each([
    ["missing token", undefined], ["wrong owner", jwt(OTHER)], ["wrong session", jwt(USER, OTHER)],
    ["invalid JWT", "invalid"], ["oversized JWT", "x".repeat(17000)],
  ])("rejects %s when an active session needs revocation", async (_name, token) => {
    const h = harness({ active: true });
    expect(await cleanupJobStatusPreviewAuth({ ...h.options, token })).toMatchObject({ ok: false, stage: "session-binding" });
    expect(h.signOut).not.toHaveBeenCalled(); expect(h.deleteUser).not.toHaveBeenCalled();
  });
  it.each([
    ["wrong email", { rows: [{ id: USER, email: "unrelated@example.invalid" }] }],
    ["wrong ID", { rows: [{ id: OTHER, email: EMAIL }] }],
    ["multiple accounts", { rows: [{ id: USER, email: EMAIL }, { id: OTHER, email: EMAIL }] }],
  ])("rejects %s without any Auth mutation", async (_name, failResult) => {
    const h = harness({ failAt: "lookup", failResult });
    expect(await cleanupJobStatusPreviewAuth(h.options)).toMatchObject({ ok: false });
    expect(h.signOut).not.toHaveBeenCalled(); expect(h.deleteUser).not.toHaveBeenCalled();
  });
  it.each([
    ["multiple active sessions", "inspect", { rows: [{ id: SESSION }, { id: OTHER }] }, "session-binding"],
    ["session reappeared before delete", "zero-before", { rows: [{ n: 1 }] }, "zero-sessions-before-delete"],
    ["account survived delete", "absent", { rows: [{ n: 1 }] }, "account-absence"],
    ["session survived delete", "zero-after", { rows: [{ n: 1 }] }, "zero-sessions-after-delete"],
    ["malformed delete acknowledgement", "delete", {}, "account-delete"],
  ])("fails closed for %s", async (_name, failAt, failResult, stage) => {
    const h = harness({ failAt, failResult });
    expect(await cleanupJobStatusPreviewAuth(h.options)).toMatchObject({ ok: false, stage });
    if (failAt === "inspect" || failAt === "zero-before") expect(h.deleteUser).not.toHaveBeenCalled();
  });
  it("bounds a hanging delete, then rejects late completion as cleanup proof", async () => {
    vi.useFakeTimers();
    const h = harness();
    let settle;
    h.deleteUser.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
    const pending = cleanupJobStatusPreviewAuth(h.options);
    await vi.advanceTimersByTimeAsync(JOB_STATUS_AUTH_CLEANUP_STEP_TIMEOUT_MS);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, stage: "account-delete", failure: "OPERATION_TIMEOUT" });
    const queries = h.query.mock.calls.length;
    settle({ error: null }); await vi.runAllTimersAsync();
    expect(h.query).toHaveBeenCalledTimes(queries);
    expect(result.ok).toBe(false);
  });
  it("rejects a non-fixture target before SQL", async () => {
    const h = harness();
    expect(await cleanupJobStatusPreviewAuth({ ...h.options, email: "real-user@example.com" })).toMatchObject({ ok: false, stage: "target" });
    expect(h.query).not.toHaveBeenCalled();
  });
});

describe("actual pinned Supabase SDK with synthetic HTTP responses", () => {
  it("reproduces the old repeated-signout failure and removes that dependency when sessions are absent", async () => {
    const h = harness();
    const httpCalls = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init) => {
      const url = new URL(input);
      expect(url.origin).toBe("https://abcdefghijklmnopqrst.supabase.co");
      expect(init.redirect).toBe("error");
      httpCalls.push([init.method, url.pathname, url.search]);
      if (url.pathname === "/auth/v1/logout") return new Response(JSON.stringify({ code: "session_expired", msg: "synthetic revoked session" }),
        { status: 401, headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" } });
      expect(url.pathname).toBe(`/auth/v1/admin/users/${USER}`);
      expect(JSON.parse(init.body)).toEqual({ should_soft_delete: false });
      await h.deleteUser(USER);
      return new Response(JSON.stringify({ id: USER }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const client = createJobStatusPreviewAuthClient("https://abcdefghijklmnopqrst.supabase.co", "synthetic-secret-not-real");
    const oldRepeatedLogout = await client.auth.admin.signOut(TOKEN, "local");
    expect(oldRepeatedLogout.error).toMatchObject({ code: "session_expired", status: 401 });
    expect(() => assert.ok(oldRepeatedLogout.error === null || ["session_not_found", "user_not_found"].includes(oldRepeatedLogout.error.code))).toThrow();
    expect(await cleanupJobStatusPreviewAuth({ ...h.options, authAdmin: client })).toMatchObject({ ok: true, revocation: "already-absent" });
    expect(httpCalls).toEqual([["POST", "/auth/v1/logout", "?scope=local"], ["DELETE", `/auth/v1/admin/users/${USER}`, ""]]);
    // Synthetic reproduction only: r1 did not retain the actual Auth error code.
  });
});
