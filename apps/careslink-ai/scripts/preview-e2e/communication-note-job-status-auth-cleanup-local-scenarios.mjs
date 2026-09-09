import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { cleanupJobStatusPreviewAuth } from "./communication-note-job-status-preview-auth-cleanup.mjs";

// Called only inside the existing owned Unix-socket cluster. Auth API ports are
// explicitly simulated with local SQL; this is not Hosted GoTrue evidence.
export async function verifyAuthCleanupLocalScenarios(admin, passed, onScenario) {
  for (const mode of ["already-revoked", "active-session", "foreign-key-denial"]) {
    const name = "auth-cleanup-local-" + mode;
    onScenario(name);
    const userId = randomUUID();
    const sessionId = randomUUID();
    const email = `cl-job-status-${randomBytes(16).toString("hex")}@example.invalid`;
    const token = "e30." + Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString("base64url") + ".local";
    let signouts = 0;
    let deletions = 0;
    await admin.query("begin");
    try {
      await admin.query(`insert into auth.users(instance_id,id,email,aud,role,email_confirmed_at,raw_app_meta_data)
        values ('00000000-0000-0000-0000-000000000000',$1,$2,'authenticated','authenticated',
          clock_timestamp(),'{"role":"provider"}')`, [userId, email]);
      if (mode === "active-session") await admin.query("insert into auth.sessions(id,user_id) values($1,$2)", [sessionId, userId]);
      if (mode === "foreign-key-denial") {
        // PostgreSQL disallows a temporary table's FK to a non-temporary table.
        // This ordinary fixture table exists only inside the rolled-back transaction.
        await admin.query("create table auth_cleanup_test_dependency(user_id uuid references auth.users(id))");
        await admin.query("insert into auth_cleanup_test_dependency(user_id) values($1)", [userId]);
      }
      const authAdmin = { auth: { admin: {
        async signOut(value, scope) {
          assert.equal(value, token); assert.equal(scope, "local"); signouts++;
          await admin.query("delete from auth.sessions where id=$1 and user_id=$2", [sessionId, userId]);
          return { error: null };
        },
        async deleteUser(id) {
          assert.equal(id, userId); deletions++;
          await admin.query("delete from auth.users where id=$1", [id]);
          return { error: null };
        },
      } } };
      const result = await cleanupJobStatusPreviewAuth({ admin, authAdmin, email, userId, token });
      assert.equal(signouts, mode === "active-session" ? 1 : 0);
      assert.equal(deletions, 1);
      if (mode === "foreign-key-denial") {
        assert.equal(result.ok, false);
        assert.equal(result.stage, "account-delete");
        assert.equal(result.failure, "DATABASE_FOREIGN_KEY");
        assert.equal(result.accountAbsent, false);
      } else {
        assert.equal(result.ok, true);
        assert.equal(result.accountAbsent, true);
        assert.equal(result.sessionsAbsent, true);
        assert.equal((await admin.query("select count(*)::int as n from auth.users where id=$1", [userId])).rows[0].n, 0);
      }
      passed.push(name);
    } finally { await admin.query("rollback"); }
    assert.equal((await admin.query("select count(*)::int as n from auth.users where id=$1", [userId])).rows[0].n, 0);
  }
}
