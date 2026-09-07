import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import pg from "pg";
import { verifyJobStatusScenarios as verifyScenarios } from "./communication-note-job-status-local-scenarios.mjs";
import { withPreviewJobStatusLogin } from "./communication-note-job-status-preview-login.mjs";
import { assertJobStatusPreviewAcl } from "./communication-note-job-status-preview.mjs";
import { STATUS_SQL, statusParameters, verifyPreviewSources } from "./communication-note-job-status-preview-policy.mjs";
import { verifyAuthCleanupLocalScenarios } from "./communication-note-job-status-auth-cleanup-local-scenarios.mjs";

// This fixture cannot accept an existing database, URL, role or filesystem target.
// It tests local PostgreSQL migrations, ACLs, session locks and source issuance;
// hosted Supabase, TLS and hosted credential issuance remain separate evidence.
const TEMP_PREFIX = "/private/tmp/cl-job-status-";
const CLUSTER_NAME = "careslink-job-status-local-pg16";
const PORT = 15437; // Private per-run Unix socket only; no TCP listener.
const execFileAsync = promisify(execFile);
const childEnv = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" };

async function findPg16() {
  for (const directory of [
    "/opt/homebrew/opt/postgresql@16/bin",
    "/usr/local/opt/postgresql@16/bin",
    "/usr/lib/postgresql/16/bin",
    "/usr/pgsql-16/bin",
  ]) {
    try {
      const { stdout } = await execFileAsync(join(directory, "postgres"), ["--version"], {
        env: childEnv, timeout: 3000, maxBuffer: 4096,
      });
      if (/\(PostgreSQL\) 16\./u.test(stdout)) return directory;
    } catch { /* Try the next fixed installation path, never a remote fallback. */ }
  }
  throw new Error("LOCAL_PG16_NOT_FOUND");
}

async function bounded(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("LOCAL_TIMEOUT")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  let stage = "local-preflight";
  let root;
  let server;
  let exited;
  let bootstrapMayBeRunning = false;
  let interrupted = false;
  const clients = [];
  let failure = false;
  let stopped = false;
  let removed = false;
  const scenarios = [];
  let sourceIssuerTests = 0;
  let scenario;
  const interrupt = () => { interrupted = true; server?.kill("SIGINT"); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    assert.equal(process.argv.length, 2);
    const bin = await findPg16();
    root = await mkdtemp(TEMP_PREFIX);
    assert.equal(await realpath(root), root);
    const data = join(root, "data");
    const socket = join(root, "socket");
    await mkdir(socket, { mode: 0o700 });
    stage = "initdb";
    bootstrapMayBeRunning = true;
    try {
      await execFileAsync(join(bin, "initdb"), [
        "-D", data, "--auth=trust", "--username=status_test_bootstrap", "--no-locale", "--encoding=UTF8",
      ], { env: childEnv, timeout: 20000, maxBuffer: 128 * 1024 });
      bootstrapMayBeRunning = false;
    } catch (error) {
      // A killed initdb might leave a bootstrap child. Retain its directory
      // unless initialization exited normally; never infer child exit from a timeout.
      bootstrapMayBeRunning = error.killed === true || Boolean(error.signal);
      scenario = String(error.stderr ?? "").split("\n")
        .filter(line => /initdb: error:|FATAL:|could not|Operation not permitted|Permission denied/.test(line))
        .join(" | ").replaceAll(root, "<owned-local-cluster>").slice(0,1200);
      throw error;
    }
    assert.equal(interrupted, false);
    // Owned cluster fixture only: runtime LOGINs must prove real SCRAM password
    // authentication, while the two local bootstrap/operator identities use trust.
    await writeFile(join(data, "pg_hba.conf"),
      "local all status_test_bootstrap trust\nlocal all postgres trust\nlocal all all scram-sha-256\n", { mode: 0o600 });
    stage = "start-private-cluster";
    server = spawn(join(bin, "postgres"), [
      "-D", data, "-h", "", "-k", socket, "-p", String(PORT),
      "-c", "unix_socket_permissions=0700", "-c", `cluster_name=${CLUSTER_NAME}`,
    ], { env: childEnv, stdio: "ignore" });
    exited = new Promise((resolve) => {
      server.once("exit", resolve);
      server.once("error", resolve);
    });
    const connect = async (user = "status_test_bootstrap", password = "") => {
      const client = new pg.Client({
        host: socket, port: PORT, user, database: "postgres", password,
        ssl: false, application_name: CLUSTER_NAME, connectionTimeoutMillis: 400,
        query_timeout: 6000,
        options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000",
      });
      client.on("error", () => { /* Queries fail; cleanup still stops the owned server. */ });
      try {
        await client.connect();
        clients.push(client);
        return client;
      } catch (error) {
        await client.end();
        throw error;
      }
    };
    let owner;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      assert.equal(interrupted, false);
      assert.equal(server.exitCode, null);
      assert.equal(server.signalCode, null);
      try { owner = await connect(); break; } catch { await delay(100); }
    }
    assert.ok(owner);
    stage = "attest-local-target";
    const { rows } = await owner.query(`select
      current_setting('server_version_num')::int / 10000 as major,
      current_setting('data_directory') as data,
      current_setting('unix_socket_directories') as socket,
      current_setting('unix_socket_permissions') as socket_permissions,
      current_setting('listen_addresses') as listeners,
      current_setting('cluster_name') as cluster,
      inet_server_addr() is null as unix_only`);
    assert.deepEqual(rows, [{ major: 16, data, socket, socket_permissions: "0700",
      listeners: "", cluster: CLUSTER_NAME, unix_only: true }]);
    stage = "job-status-regressions";
    await verifyScenarios(owner, await connect(), await connect(), scenarios,
      (name) => { scenario = name; });
    stage = "preview-login-local-rehearsal";
    scenario = "preview-source-and-exact-acl-gate";
    await verifyPreviewSources();
    const migrationActor = await connect("postgres");
    await assertJobStatusPreviewAcl(migrationActor);
    scenarios.push("preview-reader-exact-acl-gate");
    const loginEvents = [];
    scenario = "preview-physical-login-and-revocation";
    await withPreviewJobStatusLogin({ admin: migrationActor, openRuntime: connect,
      record: name => loginEvents.push(name), run: async runtime => {
        await assert.rejects(runtime.query(STATUS_SQL, statusParameters(
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          "ffffffff-ffff-4fff-8fff-ffffffffffff")), { code: "P0001", message: "NOT_FOUND" });
      } });
    assert.deepEqual(loginEvents, ["dedicated-login-and-set-only-membership",
      "credential-disabled-new-login-denied-and-role-removed"]);
    scenarios.push("preview-physical-login-and-revocation");
    const failureEvents = [];
    scenario = "preview-credential-cleanup-after-read-failure";
    await assert.rejects(withPreviewJobStatusLogin({ admin: migrationActor, openRuntime: connect,
      record: name => failureEvents.push(name), run: async () => { throw new Error("INJECTED_READ_FAILURE"); } }),
    { message: "INJECTED_READ_FAILURE" });
    assert.deepEqual(failureEvents, loginEvents);
    scenarios.push("preview-credential-cleanup-after-read-failure");
    scenario = "preview-credential-cleanup-after-connect-failure";
    let connectionCalls = 0;
    const connectFailureEvents = [];
    await assert.rejects(withPreviewJobStatusLogin({ admin: migrationActor,
      openRuntime: async (role, password) => {
        if (++connectionCalls === 1) throw Object.assign(new Error("INJECTED_CONNECT_FAILURE"), { code: "ECONNREFUSED" });
        return connect(role, password);
      }, record: name => connectFailureEvents.push(name), run: async () => { assert.fail("must not run"); } }),
    { message: "INJECTED_CONNECT_FAILURE" });
    assert.deepEqual(connectFailureEvents, ["credential-disabled-new-login-denied-and-role-removed"]);
    scenarios.push(scenario);
    scenario = "preview-network-error-is-not-revocation-proof";
    connectionCalls = 0;
    await assert.rejects(withPreviewJobStatusLogin({ admin: migrationActor,
      openRuntime: async (role, password) => {
        if (++connectionCalls === 2) throw Object.assign(new Error("INJECTED_DENIAL_NETWORK_FAILURE"), { code: "ECONNREFUSED" });
        return connect(role, password);
      }, run: async () => {} }), { message: "JOB_STATUS_PREVIEW_CREDENTIAL_CLEANUP_FAILED" });
    assert.equal((await migrationActor.query("select count(*)::int as n from pg_roles where rolname like 'careslink_v1_job_status_runtime_%'")).rows[0].n, 0);
    scenarios.push(scenario);
    stage = "auth-cleanup-local-rehearsal";
    await verifyAuthCleanupLocalScenarios(migrationActor, scenarios, name => { scenario = name; });
    stage = "source-issuer-physical-connection";
    scenario = "actual-source-issuer-local-pg16";
    let sourceGate;
    try { sourceGate = await execFileAsync(process.execPath, [
      "node_modules/vitest/vitest.mjs", "run", "--reporter=json", "src/lib/v1/communication-note-job-status-postgres.local.test.ts",
    ], { env: { ...childEnv, CARESLINK_JOB_STATUS_LOCAL_SOCKET: socket },
      timeout: 60000, maxBuffer: 128 * 1024 }); }
    catch(error) {
      // Retain only fixed test names and our own fixed issuer error codes.
      const text=(String(error.stdout??"")+String(error.stderr??"")).replace(/\u001b\[[0-9;]*m/g,"");
      let failedNames=[];
      try { failedNames=JSON.parse(String(error.stdout)).testResults.flatMap(file=>
        file.assertionResults.filter(test=>test.status==="failed").map(test=>test.fullName)); } catch { /* Setup/report failure. */ }
      scenario=failedNames.join(" | ").slice(0,1800)+
        ":"+(text.match(/(?:ISSUER|LOCAL_ISSUER)_[A-Z0-9_]+/g)??[]).slice(0,10).join(",");
      throw new Error("LOCAL_SOURCE_GATE_FAILED");
    }
    const sourceReport=JSON.parse(sourceGate.stdout);
    assert.equal(sourceReport.success,true);
    assert.equal(sourceReport.numFailedTests,0);
    assert.equal(sourceReport.numPendingTests,0);
    assert.ok(sourceReport.numTotalTests>=9);
    assert.equal(sourceReport.numPassedTests,sourceReport.numTotalTests);
    sourceIssuerTests=sourceReport.numPassedTests;
    scenarios.push("actual-source-issuer-physical-connection-and-durable-revocation");
    assert.equal(interrupted, false);
  } catch (error) {
    failure = true;
    // Only local fixture error codes; SQL/user data are not printed.
    scenario = `${scenario ?? "setup"}:${error.code ?? error.name}`;
  } finally {
    await Promise.allSettled(clients.map((client) => bounded(client.end(), 7000)));
    try {
      if (server?.pid) {
        server.kill("SIGINT");
        try { await bounded(exited, 10000); } catch {
          server.kill("SIGQUIT");
          await bounded(exited, 5000);
        }
        stopped = server.exitCode !== null || server.signalCode !== null;
      } else {
        stopped = !bootstrapMayBeRunning;
      }
      if (root && stopped) {
        assert.match(root, /^\/private\/tmp\/cl-job-status-[a-zA-Z0-9]{6}$/u);
        assert.equal(await realpath(root), root);
        assert.equal((await lstat(root)).isDirectory(), true);
        await rm(root, { recursive: true }); // Only this run's mkdtemp directory, after exit proof.
        removed = true;
      }
    } catch {
      failure = true;
      stage = "local-cleanup";
    }
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
  const ok = !failure && stopped && removed;
  process.stdout.write(`${JSON.stringify({
    stage: ok ? "local-job-status-verification" : stage,
    ok, postgresMajor: 16, syntheticOnly: true, hostedVerified: false,
    scenarios, sourceIssuerTests, ...(ok ? {} : { failedScenario: scenario }),
    cleanup: { stopped, removed },
    ...(root && !removed ? { retainedLocalDirectory: root } : {}),
  })}\n`);
  process.exitCode = ok ? 0 : 1;
}

await main();
