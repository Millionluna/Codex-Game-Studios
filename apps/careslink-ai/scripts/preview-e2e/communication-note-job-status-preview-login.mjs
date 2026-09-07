import assert from "node:assert/strict";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { CALLER, EXECUTOR } from "./communication-note-job-status-preview-policy.mjs";

function material() {
  const password = randomBytes(32).toString("base64url");
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const key = createHmac("sha256", salted).update("Client Key").digest();
  const stored = createHash("sha256").update(key).digest("base64");
  const server = createHmac("sha256", salted).update("Server Key").digest("base64");
  salted.fill(0); key.fill(0);
  return { password, verifier: `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}` };
}

/** Probe-only physical login; deliberately NOT a production credential issuer.
 * No synthetic destroy receipts or tombstones are handed to the source adapter.
 * Each invocation creates a distinct role, then proves its actual removal.
 */
export async function withPreviewJobStatusLogin({ admin, openRuntime, run, record = () => {} }) {
  const role = "careslink_v1_job_status_runtime_" + randomBytes(8).toString("hex");
  assert.match(role, /^careslink_v1_job_status_runtime_[a-f0-9]{16}$/);
  const secret = material();
  assert.match(secret.verifier, /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  let mayExist = false;
  let runtime;
  let failure;
  let result;
  try {
    await admin.query("begin");
    assert.equal((await admin.query("select count(*)::int as n from pg_roles where rolname=$1", [role])).rows[0].n, 0);
    const until = (await admin.query("select (clock_timestamp()+interval '90 seconds')::text as until")).rows[0].until;
    assert.match(until, /^[0-9 :.+-]+$/);
    await admin.query(`create role ${role} login noinherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls connection limit 1 password '${secret.verifier}' valid until '${until}'`);
    mayExist = true;
    await admin.query(`grant ${CALLER} to ${role} with admin false, inherit false, set true`);
    await admin.query("commit");
    const attributes = (await admin.query(`select rolcanlogin, rolinherit, rolsuper, rolcreatedb,
      rolcreaterole, rolreplication, rolbypassrls, rolconnlimit,
      rolvaliduntil > clock_timestamp() and rolvaliduntil <= clock_timestamp()+interval '90 seconds' as bounded
      from pg_roles where rolname=$1`, [role])).rows;
    assert.deepEqual(attributes, [{ rolcanlogin: true, rolinherit: false, rolsuper: false,
      rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false,
      rolconnlimit: 1, bounded: true }]);
    assert.deepEqual((await admin.query(`select r.rolname, m.admin_option, m.inherit_option, m.set_option
      from pg_auth_members m join pg_roles r on r.oid=m.roleid
      where m.member=(select oid from pg_roles where rolname=$1)`, [role])).rows,
    [{ rolname: CALLER, admin_option: false, inherit_option: false, set_option: true }]);
    runtime = await openRuntime(role, secret.password);
    assert.deepEqual((await runtime.query("select session_user::text as login, current_user::text as current")).rows,
      [{ login: role, current: role }]);
    await runtime.query(`set role ${CALLER}`);
    assert.equal((await runtime.query("select current_user::text as role")).rows[0].role, CALLER);
    await assert.rejects(runtime.query(`set role ${EXECUTOR}`), { code: "42501" });
    record("dedicated-login-and-set-only-membership");
    result = await run(runtime);
  } catch (error) {
    failure = error;
  } finally {
    let cleanupFailure;
    try { await admin.query("rollback"); } catch { cleanupFailure = true; }
    if (mayExist) {
      try {
        const exists = (await admin.query("select count(*)::int as n from pg_roles where rolname=$1", [role])).rows[0].n;
        if (exists === 1) {
          // Disable first; connection limits/expiry alone do not revoke an existing backend.
          await admin.query(`alter role ${role} nologin password null`);
          if (runtime) await runtime.end();
          runtime = undefined;
          let rejected;
          let unexpected;
          try { unexpected = await openRuntime(role, secret.password); }
          catch (error) { rejected = error; }
          if (unexpected) await unexpected.end();
          const denied = rejected && ["28000", "28P01"].includes(rejected.code);
          // Even a failed denial assertion must not skip termination/drop.
          await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity
            where usename=$1 and pid<>pg_backend_pid()`, [role]);
          let remaining = 1;
          for (let i = 0; i < 20 && remaining; i++) {
            remaining = (await admin.query("select count(*)::int as n from pg_stat_activity where usename=$1", [role])).rows[0].n;
            if (remaining) await delay(50);
          }
          assert.equal(remaining, 0);
          await admin.query(`revoke ${CALLER} from ${role}`);
          await admin.query(`drop role ${role}`);
          assert.equal((await admin.query("select count(*)::int as n from pg_roles where rolname=$1", [role])).rows[0].n, 0);
          assert.equal(denied, true);
          record("credential-disabled-new-login-denied-and-role-removed");
        }
      } catch { cleanupFailure = true; }
    }
    if (runtime) { try { await runtime.end(); } catch { cleanupFailure = true; } }
    secret.password = undefined; secret.verifier = undefined;
    if (cleanupFailure) throw new Error("JOB_STATUS_PREVIEW_CREDENTIAL_CLEANUP_FAILED");
  }
  if (failure) throw failure;
  return result;
}
