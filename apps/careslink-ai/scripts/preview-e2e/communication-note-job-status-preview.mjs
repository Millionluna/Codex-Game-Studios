import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { assertVerifiedPreviewTlsConnection } from "./communication-note-preview-runner-terminal-identity.mjs";
import {
  CALLER, EXECUTOR, JOB_STATUS_PREVIEW_BATCH, PROBE_LIMITS, STATUS_SQL,
  parsePreviewArguments, parsePreviewInput, statusParameters, verifyPreviewSources,
} from "./communication-note-job-status-preview-policy.mjs";
import { withPreviewJobStatusLogin } from "./communication-note-job-status-preview-login.mjs";

export async function assertJobStatusPreviewAcl(admin) {
  const name = "get_v1_communication_note_job_status";
  const rows = (await admin.query(`select p.oid, p.prosecdef, p.proconfig, p.prosrc, r.rolname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
    where n.nspname='careslink_v1_generation' and p.proname=$1 and p.pronargs=5`, [name])).rows;
  assert.equal(rows.length, 1);
  const wrapper = rows[0];
  assert.equal(wrapper.prosecdef, true);
  assert.equal(wrapper.rolname, EXECUTOR);
  assert.deepEqual(wrapper.proconfig, ['search_path=""']);
  const migration = await readFile(new URL("../../supabase/migrations/20260906233034_add_v1_communication_note_job_status_reader.sql", import.meta.url), "utf8");
  assert.equal(wrapper.prosrc, migration.split("$reader$")[1]);
  for (const role of [CALLER, EXECUTOR]) {
    assert.deepEqual((await admin.query(`select rolcanlogin, rolinherit, rolsuper, rolcreatedb,
      rolcreaterole, rolreplication, rolbypassrls from pg_roles where rolname=$1`, [role])).rows,
    [{ rolcanlogin: false, rolinherit: false, rolsuper: false, rolcreatedb: false,
      rolcreaterole: false, rolreplication: false, rolbypassrls: false }]);
    const allowed = (await admin.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='careslink_v1_generation' and has_function_privilege($1,p.oid,'EXECUTE') order by p.proname`, [role])).rows;
    assert.deepEqual(allowed, (role === CALLER ? [name] : [name, "get_v1_shadow_note_generation_job_status"]).map(proname => ({ proname })));
    assert.deepEqual((await admin.query(`select has_schema_privilege($1,'careslink_v1_generation','USAGE') as usage,
      has_schema_privilege($1,'careslink_v1_generation','CREATE') as create`, [role])).rows,
    [{ usage: true, create: false }]);
    assert.equal((await admin.query(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','auth','careslink_v1_generation') and c.relkind in ('r','p','v','m','S')
      and has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`, [role])).rows[0].n, 0);
    assert.equal((await admin.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and has_function_privilege($1,p.oid,'EXECUTE')`, [role])).rows[0].n, 0);
    assert.equal((await admin.query("select count(*)::int as n from pg_auth_members where member=(select oid from pg_roles where rolname=$1)", [role])).rows[0].n, 0);
    // PG16/17 creator ADMIN-only edge is not a runtime SET/INHERIT capability.
    assert.equal((await admin.query(`select count(*)::int as n from pg_auth_members m
      join pg_roles member_role on member_role.oid=m.member join pg_roles grantor on grantor.oid=m.grantor
      where m.roleid=(select oid from pg_roles where rolname=$1)
      and not (member_role.rolname=current_user and m.admin_option and not m.inherit_option and not m.set_option and grantor.rolsuper)`, [role])).rows[0].n, 0);
  }
  for (const role of ["anon", "authenticated", "service_role", "authenticator", "careslink_v1_generation_owner_api_executor", "careslink_v1_generation_executor"]) {
    assert.equal((await admin.query("select has_function_privilege($1,$2::oid,'EXECUTE') as allowed", [role, wrapper.oid])).rows[0].allowed, false);
  }
}

async function readPrivateInput(stream) {
  const chunks = [];
  let bytes = 0;
  const timer = setTimeout(() => stream.destroy(new Error("INPUT_TIMEOUT")), 5000);
  try {
    for await (const chunk of stream) {
      bytes += chunk.length;
      assert.ok(bytes <= PROBE_LIMITS.maximumInputBytes);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { clearTimeout(timer); }
}

async function connect(candidate, certificate, user, password) {
  const client = new pg.Client({
    host: candidate.host, port: 5432, database: "postgres", user, password,
    application_name: "careslink-job-status-fixed-preview", connectionTimeoutMillis: 5000,
    query_timeout: 6000, client_encoding: "UTF8",
    options: "-c row_security=on -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000",
    ssl: { ca: certificate, rejectUnauthorized: true },
  });
  client.on("error", () => {}); // Never print driver errors containing credentials/SQL.
  try { await client.connect(); assertVerifiedPreviewTlsConnection(client); return client; }
  catch (error) { await client.end(); throw error; }
}

function authClient(url, key, token) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      fetch: async (input, init) => {
        const target = new URL(typeof input === "string" ? input : input.url ?? input.toString());
        assert.equal(target.origin, url);
        // No redirect can forward an Auth secret to another origin.
        return fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(8000) });
      },
    },
  });
}

export async function runJobStatusPreview(settings, input, sources) {
  const passed = [];
  const record = name => { passed.push(name); };
  let stage = "target-and-tls";
  let admin;
  let authAdmin;
  let token;
  let userId;
  let accountAttempted = false;
  let ok = false;
  let authCleanup = true;
  let databaseClosed = true;
  let credentialCleanup = true;
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  const checkpoint = () => { assert.equal(interrupted, false); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const email = `cl-job-status-${randomBytes(16).toString("hex")}@example.invalid`;
  const password = randomBytes(32).toString("base64url");
  try {
    checkpoint();
    assert.ok(Date.now() < Date.parse(input.descriptor.expiresAt));
    assert.equal((await lstat(settings.sslRootCertPath)).isSymbolicLink(), false);
    assert.equal(await realpath(settings.sslRootCertPath), settings.sslRootCertPath);
    const certificate = await readFile(settings.sslRootCertPath);
    assert.ok(certificate.length > 0 && certificate.length <= 65536);
    assert.equal(createHash("sha256").update(certificate).digest("hex"), settings.expectedSslRootCertSha256);
    const secrets = input.takeSecrets();
    let candidate = secrets.candidates.direct;
    try { admin = await connect(candidate, certificate, candidate.user, candidate.password); }
    catch (error) {
      // Only a genuinely unreachable direct endpoint permits session pooler fallback.
      assert.ok(["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT"].includes(error.code));
      candidate = secrets.candidates.sessionPooler;
      admin = await connect(candidate, certificate, candidate.user, candidate.password);
    }
    stage = "migration-and-empty-auth-preflight";
    checkpoint();
    assert.deepEqual((await admin.query(`select current_user::text as actor, session_user::text as login,
      current_setting('server_version_num')::int / 10000 as major,
      current_database() as database, (select rolsuper from pg_roles where rolname=current_user) as superuser`)).rows,
    [{ actor: "postgres", login: "postgres", major: 17, database: "postgres", superuser: false }]);
    assert.equal((await admin.query("select pg_try_advisory_lock(818103, 90607) as locked")).rows[0].locked, true);
    assert.deepEqual((await admin.query("select version::text as version, name, statements from supabase_migrations.schema_migrations order by version")).rows,
      sources.migrations.map(({ version, name, statements }) => ({ version, name, statements: [...statements] })));
    assert.equal((await admin.query("select count(*)::int as n from auth.users")).rows[0].n, 0);
    assert.equal((await admin.query("select count(*)::int as n from auth.sessions")).rows[0].n, 0);
    assert.equal((await admin.query("select count(*)::int as n from pg_roles where rolname like 'careslink_v1_job_status_runtime_%'")).rows[0].n, 0);
    await assertJobStatusPreviewAcl(admin);
    record("pg17-pinned-history-and-exact-reader-acls");
    assert.ok(Date.now() < Date.parse(input.descriptor.expiresAt));
    const apiUrl = `https://${settings.expectedBranchRef}.supabase.co`;
    authAdmin = authClient(apiUrl, secrets.auth.secretKey);
    const login = authClient(apiUrl, secrets.auth.publishableKey);
    stage = "synthetic-hosted-auth";
    checkpoint();
    accountAttempted = true;
    const created = await authAdmin.auth.admin.createUser({ email, password,
      email_confirm: true, app_metadata: { role: "provider" } });
    assert.equal(created.error, null);
    userId = created.data.user.id;
    checkpoint();
    const signedIn = await login.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null);
    token = signedIn.data.session.access_token;
    checkpoint();
    const authenticated = authClient(apiUrl, secrets.auth.publishableKey, token);
    const verified = await authenticated.auth.getClaims(token);
    assert.equal(verified.error, null);
    const claims = verified.data.claims;
    assert.equal(claims.sub, userId);
    assert.equal(claims.role, "authenticated");
    assert.equal(claims.app_metadata.role, "provider");
    assert.match(claims.session_id, /^[a-f0-9-]{36}$/);
    assert.equal(claims.iss, `${apiUrl}/auth/v1`);
    const current = await authenticated.rpc("resolve_v1_current_session_status");
    assert.equal(current.error, null); assert.equal(current.data, "ACTIVE");
    const verifiedUser = await authenticated.auth.getUser(token);
    assert.equal(verifiedUser.error, null); assert.equal(verifiedUser.data.user.id, userId);
    assert.deepEqual((await admin.query("select id::text, user_id::text from auth.sessions where id=$1", [claims.session_id])).rows,
      [{ id: claims.session_id, user_id: userId }]);
    record("real-auth-claims-current-session-and-user");
    const openRuntime = (role, rolePassword) => connect(candidate, certificate,
      candidate.mode === "direct" ? role : `${role}.${settings.expectedBranchRef}`, rolePassword);
    const missingJob = randomUUID();
    const runRead = async (owner, session, expected) => {
      checkpoint();
      return withPreviewJobStatusLogin({ admin, openRuntime, record,
      run: async runtime => {
        for (const sql of ["select * from careslink_v1_generation.jobs", "select * from public.point_wallets",
          "select careslink_v1_generation.get_v1_shadow_note_generation_job_status(null,null,null,null,null)",
          "select careslink_v1_generation.cancel_v1_shadow_note_generation_job(null,null,null,null,null)"]) {
          checkpoint();
          await assert.rejects(runtime.query(sql), { code: "42501" });
        }
        await assert.rejects(runtime.query(STATUS_SQL, statusParameters(owner, session, missingJob)),
          { code: "P0001", message: expected });
      },
    }); };
    stage = "active-and-mismatched-session-read";
    await runRead(userId, claims.session_id, "NOT_FOUND");
    await runRead(randomUUID(), claims.session_id, "SESSION_REVOKED");
    record("active-missing-job-and-mismatched-owner-denial");
    stage = "actual-session-revocation";
    checkpoint();
    const signedOut = await authAdmin.auth.admin.signOut(token, "local");
    assert.equal(signedOut.error, null);
    assert.equal((await admin.query("select count(*)::int as n from auth.sessions where id=$1", [claims.session_id])).rows[0].n, 0);
    const revoked = await authenticated.rpc("resolve_v1_current_session_status");
    assert.equal(revoked.error, null); assert.equal(revoked.data, "REVOKED");
    await runRead(userId, claims.session_id, "SESSION_REVOKED");
    record("old-jwt-cannot-read-after-hosted-session-revocation");
    checkpoint();
    ok = true;
  } catch (error) {
    if (error?.message === "JOB_STATUS_PREVIEW_CREDENTIAL_CLEANUP_FAILED") credentialCleanup = false;
    // Only fixed stage names are returned; never raw SQL, Auth bodies or tokens.
  }
  finally {
    if (accountAttempted) {
      try {
        // Exact run-owned email also covers a create response lost after server commit.
        const users = (await admin.query("select id::text from auth.users where email=$1", [email])).rows;
        assert.ok(users.length <= 1);
        for (const user of users) {
          if (token) {
            const revoked = await authAdmin.auth.admin.signOut(token, "local");
            // Supabase may return session_not_found on the already-revoked JWT.
            assert.ok(revoked.error === null || ["session_not_found", "user_not_found"].includes(revoked.error.code));
          }
          assert.equal((await admin.query("select count(*)::int as n from auth.sessions where user_id=$1", [user.id])).rows[0].n, 0);
          const removed = await authAdmin.auth.admin.deleteUser(user.id);
          assert.equal(removed.error, null);
        }
        assert.equal((await admin.query("select count(*)::int as n from auth.users where email=$1", [email])).rows[0].n, 0);
      } catch { authCleanup = false; }
    }
    if (admin) {
      try {
        assert.equal((await admin.query("select count(*)::int as n from pg_roles where rolname like 'careslink_v1_job_status_runtime_%'")).rows[0].n, 0);
        await admin.end();
      } catch { databaseClosed = false; try { await admin.end(); } catch {} }
    }
    token = undefined;
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
  return { batch: JOB_STATUS_PREVIEW_BATCH, ok: ok && authCleanup && credentialCleanup && databaseClosed && !interrupted,
    stage, passed, authCleanup, credentialCleanup, databaseClosed, interrupted, previewDeletionRequired: true,
    previewDeleted: false, productRouteActivated: false, sourceAdapterTransportVerified: false,
    populatedJobAndOwnerRlsVerified: false, browserCookieCompositionVerified: false };
}

export async function main(argv = process.argv.slice(2)) {
  let liveStarted = false;
  try {
    const settings = parsePreviewArguments(argv);
    const sources = await verifyPreviewSources();
    if (settings.mode === "CHECK_ONLY") {
      process.stdout.write(JSON.stringify({ batch: JOB_STATUS_PREVIEW_BATCH, ok: true,
        mode: "CHECK_ONLY", migrationCount: sources.migrations.length, hostedExecuted: false, limits: PROBE_LIMITS }) + "\n");
      return;
    }
    const input = parsePreviewInput(await readPrivateInput(process.stdin), settings);
    liveStarted = true;
    const result = await runJobStatusPreview(settings, input, sources);
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    process.stdout.write(JSON.stringify({ batch: JOB_STATUS_PREVIEW_BATCH, ok: false,
      stage: liveStarted ? "unhandled-live-failure" : "input-or-source-preflight",
      hostedExecuted: liveStarted, ...(liveStarted ? { cleanupUnverified: true, previewDeletionRequired: true } : {}) }) + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
