import assert from "node:assert/strict";

export const JOB_STATUS_AUTH_CLEANUP_STEP_TIMEOUT_MS = 10000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EMAIL = /^cl-job-status-[a-f0-9]{32}@example\.invalid$/;
const own = (value, key) => Object.getOwnPropertyDescriptor(value ?? {}, key)?.value;

function safeFailure(error) {
  // Never return backend messages, arbitrary error codes, identifiers or tokens.
  let code;
  try { code = own(error, "code"); } catch { return "UNEXPECTED_FAILURE"; }
  if (code === "AUTH_CLEANUP_TIMEOUT") return "OPERATION_TIMEOUT";
  if (code === "ERR_ASSERTION") return "ASSERTION_FAILED";
  if (code === "42501") return "DATABASE_PERMISSION_DENIED";
  if (code === "23503") return "DATABASE_FOREIGN_KEY";
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "08006", "57P01"].includes(code)) return "DATABASE_UNAVAILABLE";
  if (["session_not_found", "session_expired", "user_not_found"].includes(code)) return "AUTH_SESSION_OR_USER_ABSENT";
  if (code === "bad_jwt") return "AUTH_BAD_JWT";
  if (["not_admin", "no_authorization"].includes(code)) return "AUTH_DENIED";
  if (["unexpected_failure", "request_timeout", "over_request_rate_limit"].includes(code)) return "AUTH_UNAVAILABLE";
  return "UNEXPECTED_FAILURE";
}

async function bounded(run) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(run), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("Cleanup timeout"), {
        code: "AUTH_CLEANUP_TIMEOUT",
      })), JOB_STATUS_AUTH_CLEANUP_STEP_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}

function requireAuthSuccess(result) {
  assert.ok(result && typeof result === "object" && Object.hasOwn(result, "error"));
  if (result.error !== null) throw result.error;
}

function tokenSession(token, userId) {
  // This decode binds the cleanup request, NOT authentication. Auth still
  // verifies the JWT, and SQL checks that the exact session belongs to this user.
  assert.equal(typeof token, "string");
  assert.ok(token.length <= 16384);
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  assert.ok(parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)));
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.equal(claims.sub, userId);
  assert.match(claims.session_id, UUID);
  return claims.session_id;
}

/** Probe-only cleanup. Reads auth tables; mutations use the existing Auth API.
 * A fresh zero-session check, not a repeated logout response, is the deletion
 * prerequisite. No retry and no blanket acceptance of 401/403/404 errors.
 * Any uncertain operation requires deletion of the enclosing disposable branch.
 */
export async function cleanupJobStatusPreviewAuth({ admin, authAdmin, email, userId, token }) {
  let stage = "target";
  let revocation = "not-attempted";
  let accountAbsent = false;
  let sessionsAbsent = false;
  let deletionAcknowledged = false;
  const evidence = (ok, failure = null) => Object.freeze({
    ok, stage, failure, revocation, accountAbsent, sessionsAbsent, deletionAcknowledged,
  });
  try {
    assert.match(email, EMAIL);
    if (userId !== undefined) assert.match(userId, UUID);
    assert.equal(typeof admin?.query, "function");
    stage = "account-lookup";
    // Include the known ID so an email change cannot make a leftover account disappear.
    const users = (await bounded(() => admin.query(
      "select id::text, email from auth.users where email=$1 or id=$2::uuid", [email, userId ?? null],
    ))).rows;
    assert.ok(Array.isArray(users) && users.length <= 1);
    let targetId = userId;
    if (users.length === 0) {
      stage = "account-binding";
      assert.ok(userId !== undefined); // A lost create with no known ID is not cleanup proof.
    }
    if (users.length === 1) {
      stage = "account-binding";
      assert.match(users[0].id, UUID);
      assert.equal(users[0].email, email);
      if (userId !== undefined) assert.equal(users[0].id, userId);
      targetId = users[0].id;
    }
    const requireNoSessions = async () => {
      sessionsAbsent = false;
      const rows = (await bounded(() => admin.query(
        "select count(*)::int as n from auth.sessions where user_id=$1", [targetId],
      ))).rows;
      assert.deepEqual(rows, [{ n: 0 }]);
      sessionsAbsent = true;
    };
    if (users.length === 1) {
      stage = "session-inspection";
      const sessions = (await bounded(() => admin.query(
        "select id::text from auth.sessions where user_id=$1 order by id", [targetId],
      ))).rows;
      assert.ok(Array.isArray(sessions));
      if (sessions.length === 0) {
        // r1 already proved logout; another call with that revoked JWT can fail.
        revocation = "already-absent";
      } else {
        stage = "session-binding";
        assert.equal(sessions.length, 1);
        assert.equal(sessions[0].id, tokenSession(token, targetId));
        stage = "session-signout";
        requireAuthSuccess(await bounded(() => authAdmin.auth.admin.signOut(token, "local")));
        revocation = "performed";
      }
      stage = "zero-sessions-before-delete";
      await requireNoSessions();
      stage = "account-delete";
      requireAuthSuccess(await bounded(() => authAdmin.auth.admin.deleteUser(targetId)));
      deletionAcknowledged = true;
    } else {
      revocation = "account-already-absent";
    }
    stage = "account-absence";
    const absent = (await bounded(() => admin.query(
      "select count(*)::int as n from auth.users where email=$1 or id=$2::uuid", [email, targetId ?? null],
    ))).rows;
    assert.deepEqual(absent, [{ n: 0 }]);
    accountAbsent = true;
    stage = "zero-sessions-after-delete";
    await requireNoSessions();
    stage = "complete";
    return evidence(true);
  } catch (error) {
    return evidence(false, safeFailure(error));
  }
}
