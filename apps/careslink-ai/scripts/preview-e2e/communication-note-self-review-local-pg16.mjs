import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import pg from "pg";

import { verifySelfReviewScenarios as verifyScenarios } from "./communication-note-self-review-local-scenarios.mjs";
import { verifyWordingEditScenarios } from "./communication-note-edit-local-scenarios.mjs";

// This fixture cannot accept an existing database, URL, role or filesystem target.
// It tests PostgreSQL lock semantics, not hosted Supabase ownership/ACLs or TLS.
const edit = process.argv.length === 3 && process.argv[2] === "--edit";
const TEMP_PREFIX = edit ? "/private/tmp/cl-wording-edit-" : "/private/tmp/cl-self-review-";
const CLUSTER_NAME = edit ? "careslink-wording-edit-local-pg16" : "careslink-self-review-local-pg16";
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
  let advisors;
  let scenario;
  const interrupt = () => { interrupted = true; server?.kill("SIGINT"); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    assert.ok(process.argv.length === 2 || edit);
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
        "-D", data, "--auth=trust", "--username=review_test_bootstrap", "--no-locale", "--encoding=UTF8",
      ], { env: childEnv, timeout: 20000, maxBuffer: 128 * 1024 });
      bootstrapMayBeRunning = false;
    } catch (error) {
      // A killed initdb might leave a bootstrap child. Retain its directory
      // unless initialization exited normally; never infer child exit from a timeout.
      bootstrapMayBeRunning = error.killed === true || Boolean(error.signal);
      throw error;
    }
    assert.equal(interrupted, false);
    stage = "start-private-cluster";
    server = spawn(join(bin, "postgres"), [
      "-D", data, "-h", "", "-k", socket, "-p", String(PORT),
      "-c", "unix_socket_permissions=0700", "-c", `cluster_name=${CLUSTER_NAME}`,
    ], { env: childEnv, stdio: "ignore" });
    exited = new Promise((resolve) => {
      server.once("exit", resolve);
      server.once("error", resolve);
    });
    const connect = async () => {
      const client = new pg.Client({
        host: socket, port: PORT, user: "review_test_bootstrap", database: "postgres", password: "",
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
    stage = "self-review-regressions";
    await verifyScenarios(owner, await connect(), await connect(), scenarios,
      (name) => { scenario = name; });
    if (edit) {
      stage = "wording-edit-regressions";
      await verifyWordingEditScenarios(owner, await connect(), await connect(), scenarios,
        (name) => { scenario = name; });
      stage = "local-security-advisors";
      // Fixed local target only. No --linked, project ref or external URL.
      try {
        const url = `postgresql://review_test_bootstrap@localhost:${PORT}/postgres?host=${encodeURIComponent(socket)}`;
        const result = await execFileAsync("/opt/homebrew/bin/supabase", ["db", "advisors", "--db-url", url,
          "--type", "security", "--fail-on", "none", "--output-format", "json"],
        { env: childEnv, timeout: 30000, maxBuffer: 512 * 1024 });
        try { advisors = { attempted: true, available: true, result: JSON.parse(result.stdout) }; }
        catch { advisors = { attempted: true, available: false, code: "NON_JSON_OUTPUT", diagnostic: result.stdout.slice(0,1200) }; }
      } catch (error) {
        advisors = { attempted: true, available: false, code: error.code ?? error.name,
          // CLI diagnostics concern only this owned synthetic cluster.
          diagnostic: String(error.stderr ?? "").slice(0,600) };
      }
    }
    assert.equal(interrupted, false);
  } catch (error) {
    failure = true;
    // Fixed synthetic fixture only. Never include SQL, params or backend details.
    process.stderr.write(JSON.stringify({ failureCode: error.code ?? error.name, failedScenario: scenario,
      diagnostic: /^permission denied for (schema|table|function|sequence) [a-z0-9_]+$|^[A-Z_]+$/.test(error.message ?? "") ? error.message : "UNEXPECTED" }) + "\n");
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
        assert.match(root, /^\/private\/tmp\/cl-(?:self-review|wording-edit)-[a-zA-Z0-9]{6}$/u);
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
    stage: ok ? edit ? "local-wording-edit-verification" : "local-self-review-verification" : stage,
    ok, postgresMajor: 16, syntheticOnly: true, hostedVerified: false,
    scenarios, ...(ok ? {} : { failedScenario: scenario }),
    ...(advisors ? { advisors } : {}),
    cleanup: { stopped, removed },
    ...(root && removed ? { removedLocalDirectory: root } : {}),
    ...(root && !removed ? { retainedLocalDirectory: root } : {}),
  })}\n`);
  process.exitCode = ok ? 0 : 1;
}

await main();
