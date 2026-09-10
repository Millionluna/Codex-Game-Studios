import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { Client } from "pg";

// Fixed new owned Unix-only cluster. No target/URL/credentials/paths accepted.
const run = promisify(execFile), env = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
const name = "careslink-task-issuer-local-pg16", candidate = "supabase/migration-candidates/20260909143031_add_communication_note_task_preview_issuer.sql";
let root, server, exit, bootstrapMayBeRunning = false, stopped = false, removed = false, stage = "preflight", failed = false, passed = 0, advisors;
const clients = [];
const interrupt = () => server?.kill("SIGINT");
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
async function bound(promise, ms) {
  let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("LOCAL_TIMEOUT")), ms); })]); }
  finally { clearTimeout(timer); }
}
try {
  assert.equal(process.argv.length, 2);
  let bin;
  for (const path of ["/opt/homebrew/opt/postgresql@16/bin", "/usr/local/opt/postgresql@16/bin", "/usr/lib/postgresql/16/bin"]) {
    try { if (/PostgreSQL\) 16\./.test((await run(join(path, "postgres"), ["--version"], { env, timeout: 3000 })).stdout)) { bin = path; break; } } catch { /* fixed paths only */ }
  }
  assert.ok(bin);
  root = await mkdtemp("/private/tmp/cl-task-issuer-"); assert.equal(await realpath(root), root);
  process.stdout.write(JSON.stringify({ stage: "owned-root", root }) + "\n");
  await mkdir(root + "/socket", { mode: 0o700 }); stage = "initdb";
  bootstrapMayBeRunning = true;
  try {
    await run(join(bin, "initdb"), ["-D", root + "/data", "--username=task_test_bootstrap", "--auth=trust", "--no-locale", "--encoding=UTF8"], { env, timeout: 20000 });
    bootstrapMayBeRunning = false;
  } catch (error) {
    bootstrapMayBeRunning = error.killed === true || Boolean(error.signal);
    process.stdout.write(JSON.stringify({ stage: "initdb", diagnostic: String(error.stderr ?? "").split("\n")
      .filter(line => /initdb: error:|FATAL:|Permission denied|Operation not permitted|could not/.test(line))
      .join(" | ").replaceAll(root, "<owned-local-cluster>").slice(0, 900) }) + "\n");
    throw error;
  }
  await writeFile(root + "/data/pg_hba.conf", "local all task_test_bootstrap trust\nlocal all postgres trust\nlocal all all scram-sha-256\n", { mode: 0o600 });
  server = spawn(join(bin, "postgres"), ["-D", root + "/data", "-h", "", "-k", root + "/socket", "-p", "15437",
    "-c", "unix_socket_permissions=0700", "-c", "cluster_name=" + name,
    "-c", "log_statement=none", "-c", "log_min_error_statement=panic"], { env, stdio: "ignore" });
  exit = new Promise(resolve => { server.once("exit", resolve); server.once("error", resolve); });
  const open = async (user = "task_test_bootstrap") => {
    const c = new Client({ host: root + "/socket", port: 15437, database: "postgres", user, password: "", ssl: false,
      connectionTimeoutMillis: 400, query_timeout: 5000, options: "-c statement_timeout=4000 -c lock_timeout=1000" });
    c.on("error", () => {});
    try { await c.connect(); clients.push(c); return c; } catch (e) { await c.end(); throw e; }
  };
  let admin;
  for (let i = 0; i < 40; i++) { try { admin = await open(); break; } catch { await delay(100); } }
  assert.ok(admin); stage = "local-target-guard";
  assert.deepEqual((await admin.query(`select current_setting('data_directory') data,current_setting('cluster_name') cluster,
    current_setting('listen_addresses') listeners,current_setting('server_version_num')::int/10000 major,
    inet_server_addr() is null unix_only,current_setting('unix_socket_permissions') permissions`)).rows,
  [{ data: root + "/data", cluster: name, listeners: "", major: 16, unix_only: true, permissions: "0700" }]);
  stage = "local-control-roles";
  await admin.query(`create role postgres login nosuperuser createrole nocreatedb inherit noreplication bypassrls;
    grant create,connect on database postgres to postgres;
    grant pg_read_all_stats,pg_signal_backend to postgres;
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create role authenticator nologin;
    create role careslink_v1_generation_job_list_caller nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
    grant careslink_v1_generation_job_list_caller to postgres with admin true,inherit false,set false;`);
  const control = await open("postgres"); stage = "candidate"; await control.query(await readFile(candidate, "utf8"));
  stage = "source-and-recovery-tests";
  const result = await run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--bail=1", "--reporter=json", "src/lib/communication-note-task-preview-issuer.local.test.ts"],
    { env: { ...env, CARESLINK_TASK_ISSUER_LOCAL_SOCKET: root + "/socket" }, timeout: 110000, maxBuffer: 256 * 1024 }).catch(error => {
      // Print fixed test names/codes only; never raw SQL, verifier or password.
      try { const report = JSON.parse(error.stdout); process.stdout.write(JSON.stringify({ failedTests: report.testResults.flatMap(f =>
        f.assertionResults.filter(t => t.status === "failed").map(t => t.fullName)) }) + "\n"); } catch { /* keep raw output private */ }
      throw new Error("LOCAL_SOURCE_TEST_FAILED");
    });
  const report = JSON.parse(result.stdout); assert.equal(report.success, true); assert.equal(report.numPendingTests, 0); passed = report.numPassedTests;
  assert.equal(passed, 12); stage = "no-residue";
  assert.equal((await admin.query("select count(*)::int n from careslink_task_preview_issuer.leases where state<>'REVOKED'")).rows[0].n, 0);
  assert.equal((await admin.query("select count(*)::int n from pg_roles where rolname like 'careslink_v1_job_list_runtime_%'")).rows[0].n, 0);
  stage = "local-advisors";
  try {
    // --output only formats legacy status variables; command results require
    // --output-format. Any advisor finding (including INFO) fails this fixture.
    const scan = await run("/opt/homebrew/bin/supabase", ["db", "advisors", "--db-url",
      `postgresql://task_test_bootstrap@localhost:15437/postgres?host=${encodeURIComponent(root + "/socket")}`,
      "--type", "security", "--fail-on", "info", "--output-format", "json"],
      { env, timeout: 20000, maxBuffer: 128 * 1024 });
    try { advisors = JSON.parse(scan.stdout); }
    catch { throw new Error("LOCAL_ADVISORS_NON_JSON"); }
  } catch (error) {
    advisors = { available: false, code: error.killed ? "TIMEOUT" : error.code ?? error.message,
      // This CLI is pinned to the owned synthetic cluster; never print query data.
      diagnostic: String(error.stderr ?? "").replaceAll(root, "<owned-local-cluster>").slice(0, 600) };
    throw new Error("LOCAL_ADVISORS_FAILED");
  }
} catch (error) {
  failed = true;
  process.stdout.write(JSON.stringify({ stage, code: /^[A-Z0-9_]{1,50}$/.test(error.code ?? error.message) ? (error.code ?? error.message) : "LOCAL_FAILURE" }) + "\n");
} finally {
  await Promise.allSettled(clients.map(c => bound(c.end(), 3000)));
  try {
    if (server?.pid) {
      server.kill("SIGINT"); try { await bound(exit, 10000); } catch { server.kill("SIGQUIT"); await bound(exit, 5000); }
      stopped = server.exitCode !== null || server.signalCode !== null;
    } else stopped = !bootstrapMayBeRunning;
    if (root && stopped) {
      assert.match(root, /^\/private\/tmp\/cl-task-issuer-[A-Za-z0-9]{6}$/); assert.equal(await realpath(root), root);
      assert.equal((await lstat(root)).isDirectory(), true); await rm(root, { recursive: true }); removed = true;
    }
  } catch { failed = true; }
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
}
const ok = !failed && stopped && removed;
process.stdout.write(JSON.stringify({ ok, passed, advisors, syntheticOnly: true, hostedVerified: false, cleanup: { stopped, removed },
  ...(root && !removed ? { retainedLocalDirectory: root } : {}) }) + "\n");
process.exitCode = ok ? 0 : 1;
