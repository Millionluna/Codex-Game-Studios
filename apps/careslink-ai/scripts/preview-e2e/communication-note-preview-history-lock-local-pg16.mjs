import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import pg from "pg";

import {
  acquireCommunicationNotePreviewMigrationHistoryLock as lockHistory,
  createSafeTransactionalMigrationFailureEvidence as safeEvidence,
  initializeMissingPreviewMigrationHistory as initializeHistory,
} from "./communication-note-preview-transactional-migrations.mjs";

// This fixture cannot accept an existing database, URL, role or filesystem target.
// It tests PostgreSQL lock semantics, not hosted Supabase ownership/ACLs or TLS.
const TEMP_PREFIX = "/private/tmp/cl-history-lock-";
const CLUSTER_NAME = "careslink-history-lock-local-pg16";
const PORT = 15437; // Private per-run Unix socket only; no TCP listener.
const TABLE = "supabase_migrations.schema_migrations";
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

async function expectLockFailure(client, suffix) {
  await assert.rejects(lockHistory(client), (error) => {
    assert.deepEqual(safeEvidence(error), {
      stage: "M00",
      errorType: "TRANSACTIONAL_MIGRATION_TRANSACTION_FAILED",
      checkpoint: `migration_history_lock_${suffix}`,
    });
    return true;
  });
}

async function verifyScenarios(owner, actor, peer, passed, onScenario) {
  const scenario = async (name, test) => {
    onScenario(name);
    try {
      await test();
      passed.push(name);
    } finally {
      // Roll back both successful and failed attempts before the next case.
      await Promise.all([owner, actor, peer].map((client) => client.query("rollback")));
    }
  };

  await owner.query(`create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    alter default privileges grant all on tables to anon, authenticated, service_role;
    alter default privileges grant usage on schemas to anon, authenticated, service_role`);

  const assertHistoryAbsent = async () => {
    const { rows } = await peer.query(`select
      pg_catalog.to_regnamespace('supabase_migrations') is null as absent`);
    assert.deepEqual(rows, [{ absent: true }]);
  };
  await scenario("bootstrap-empty-history-with-private-acls-and-rollback", async () => {
    await owner.query("begin");
    assert.equal(await initializeHistory(owner), true);
    await lockHistory(owner);
    const columns = await owner.query(`select attname,
      pg_catalog.format_type(atttypid, atttypmod) as type, attnotnull
      from pg_catalog.pg_attribute where attrelid = '${TABLE}'::regclass
        and attnum > 0 and not attisdropped order by attnum`);
    assert.deepEqual(columns.rows, [
      { attname: "version", type: "text", attnotnull: true },
      { attname: "statements", type: "text[]", attnotnull: false },
      { attname: "name", type: "text", attnotnull: false },
    ]);
    const rows = await owner.query(`select * from ${TABLE}`);
    assert.equal(rows.rowCount, 0);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const access = await owner.query(`select
        pg_catalog.has_schema_privilege($1, 'supabase_migrations', 'USAGE') as schema_access,
        pg_catalog.has_table_privilege($1, '${TABLE}', 'SELECT') as table_access`, [role]);
      assert.deepEqual(access.rows, [{ schema_access: false, table_access: false }]);
    }
    // The uncommitted namespace is invisible to a different session.
    await assertHistoryAbsent();
  });
  await assertHistoryAbsent();

  await scenario("bootstrap-removes-history-on-later-transaction-error", async () => {
    await owner.query("begin");
    assert.equal(await initializeHistory(owner), true);
    await lockHistory(owner);
    await owner.query(`insert into ${TABLE}(version, name, statements)
      values ('synthetic-rollback', 'rollback', array['select 1'])`);
    await assert.rejects(owner.query("select 1 / 0"), { code: "22012" });
  });
  await assertHistoryAbsent();

  await scenario("partial-existing-schema-is-not-repaired", async () => {
    await owner.query("begin; create schema supabase_migrations");
    assert.equal(await initializeHistory(owner), false);
    await expectLockFailure(owner, "relation_missing");
  });
  await assertHistoryAbsent();

  await scenario("bootstrap-race-does-not-adopt-competing-schema", async () => {
    await owner.query("begin");
    await assert.rejects(initializeHistory({
      async query(sql) {
        const result = await owner.query(sql);
        if (sql.includes("as migration_history_schema_missing")) {
          await peer.query("create schema supabase_migrations");
        }
        return result;
      },
    }), (error) => {
      assert.deepEqual(safeEvidence(error), {
        stage: "M00", errorType: "TRANSACTIONAL_MIGRATION_TRANSACTION_FAILED",
        checkpoint: "create_migration_history_schema",
      });
      return true;
    });
  });
  const competitor = await peer.query(`select
    pg_catalog.to_regnamespace('supabase_migrations') is not null as preserved,
    pg_catalog.to_regclass('${TABLE}') is null as no_table`);
  assert.deepEqual(competitor.rows, [{ preserved: true, no_table: true }]);
  await peer.query("drop schema supabase_migrations"); // Exact empty synthetic race fixture.

  await scenario("bootstrap-commits-history-atomically", async () => {
    await owner.query("begin");
    assert.equal(await initializeHistory(owner), true);
    await lockHistory(owner);
    await owner.query(`insert into ${TABLE}(version) values ('synthetic-baseline')`);
    await owner.query("commit");
    const { rows } = await peer.query(`select version, name, statements from ${TABLE}`);
    assert.deepEqual(rows, [{ version: "synthetic-baseline", name: null, statements: null }]);
  });
  await scenario("existing-history-is-left-unchanged", async () => {
    await owner.query("begin");
    assert.equal(await initializeHistory(owner), false);
    await lockHistory(owner);
    const { rows } = await owner.query(`select version, name, statements from ${TABLE}`);
    assert.deepEqual(rows, [{ version: "synthetic-baseline", name: null, statements: null }]);
  });

  await owner.query(`create role history_lock_actor nologin nosuperuser nocreatedb nocreaterole noinherit;
    grant usage on schema supabase_migrations to history_lock_actor`);
  await actor.query("set role history_lock_actor");

  await scenario("owner-exact-lock-mode", async () => {
    await owner.query("begin");
    await lockHistory(owner);
    const { rows } = await owner.query(`select mode from pg_catalog.pg_locks
      where pid = pg_catalog.pg_backend_pid() and granted
        and relation = '${TABLE}'::regclass`);
    assert.deepEqual(rows, [{ mode: "ShareRowExclusiveLock" }]);
  });

  for (const privilege of ["select", "insert", "select, insert", "update", "delete", "truncate"]) {
    await scenario(`privilege-${privilege.replaceAll(", ", "-")}`, async () => {
      await owner.query(`revoke all privileges on ${TABLE} from history_lock_actor;
        grant ${privilege} on ${TABLE} to history_lock_actor`);
      await actor.query("begin");
      if (["update", "delete", "truncate"].includes(privilege)) {
        await lockHistory(actor);
      } else {
        await expectLockFailure(actor, "permission_denied");
      }
    });
  }

  await scenario("schema-usage-required", async () => {
    await owner.query("revoke usage on schema supabase_migrations from history_lock_actor");
    await actor.query("begin");
    await expectLockFailure(actor, "permission_denied");
  });
  await owner.query("grant usage on schema supabase_migrations to history_lock_actor");

  await scenario("missing-history-relation", async () => {
    await owner.query(`begin; alter table ${TABLE} rename to local_hidden_history`);
    await expectLockFailure(owner, "relation_missing");
  });
  await scenario("missing-history-schema", async () => {
    await owner.query("begin; alter schema supabase_migrations rename to local_hidden_schema");
    await expectLockFailure(owner, "schema_missing");
  });
  await scenario("read-only-allows-lock-but-not-mutation", async () => {
    await owner.query("begin read only");
    await lockHistory(owner);
    await assert.rejects(owner.query(`delete from ${TABLE}`), { code: "25006" });
  });
  await scenario("explicit-transaction-required", async () => {
    await expectLockFailure(owner, "transaction_required");
  });
  await scenario("aborted-transaction", async () => {
    await owner.query("begin");
    await assert.rejects(owner.query("select 1 / 0"), { code: "22012" });
    await expectLockFailure(owner, "transaction_aborted");
  });

  await scenario("writer-blocks-history-lock", async () => {
    await owner.query(`begin; lock table ${TABLE} in row exclusive mode`);
    await peer.query("begin; set local lock_timeout = '100ms'; set local statement_timeout = '3s'");
    await expectLockFailure(peer, "not_available");
  });
  await scenario("statement-timeout-is-query-canceled", async () => {
    await owner.query(`begin; lock table ${TABLE} in row exclusive mode`);
    await peer.query("begin; set local lock_timeout = '3s'; set local statement_timeout = '100ms'");
    await expectLockFailure(peer, "query_canceled");
  });
  await scenario("deadlock-distinguished-from-timeout", async () => {
    for (const client of [owner, peer]) {
      await client.query(`begin;
        set local deadlock_timeout = '100ms';
        set local lock_timeout = '3s';
        lock table ${TABLE} in row exclusive mode`);
    }
    const results = await Promise.allSettled([lockHistory(owner), lockHistory(peer)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const failures = results.filter((result) => result.status === "rejected");
    assert.equal(failures.length, 1);
    assert.deepEqual(safeEvidence(failures[0].reason), {
      stage: "M00", errorType: "TRANSACTIONAL_MIGRATION_TRANSACTION_FAILED",
      checkpoint: "migration_history_lock_deadlock",
    });
  });
  await scenario("history-lock-allows-readers-blocks-writers", async () => {
    await owner.query("begin");
    await lockHistory(owner);
    const { rows } = await peer.query(`select version from ${TABLE}`);
    assert.deepEqual(rows, [{ version: "synthetic-baseline" }]);
    await peer.query("begin; set local lock_timeout = '100ms'");
    await assert.rejects(peer.query(`insert into ${TABLE}(version) values ('blocked-writer')`), {
      code: "55P03",
    });
    await peer.query("rollback");
    await owner.query("rollback");
    await peer.query(`begin; insert into ${TABLE}(version) values ('writer-after-release')`);
  });
  await scenario("rollback-releases-lock-and-preserves-fixture", async () => {
    const { rows } = await peer.query(`select version from ${TABLE}`);
    assert.deepEqual(rows, [{ version: "synthetic-baseline" }]);
    const locks = await peer.query(`select count(*)::int as count from pg_catalog.pg_locks
      where relation = '${TABLE}'::regclass and mode = 'ShareRowExclusiveLock'`);
    assert.equal(locks.rows[0].count, 0);
  });
  return passed;
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
        "-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8",
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
        host: socket, port: PORT, user: "postgres", database: "postgres", password: "",
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
    stage = "lock-regressions";
    await verifyScenarios(owner, await connect(), await connect(), scenarios,
      (name) => { scenario = name; });
    assert.equal(interrupted, false);
  } catch {
    failure = true;
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
        assert.match(root, /^\/private\/tmp\/cl-history-lock-[a-zA-Z0-9]{6}$/u);
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
    stage: ok ? "local-history-lock-verification" : stage,
    ok, postgresMajor: 16, syntheticOnly: true, hostedVerified: false,
    scenarios, ...(ok ? {} : { failedScenario: scenario }),
    cleanup: { stopped, removed },
    ...(root && !removed ? { retainedLocalDirectory: root } : {}),
  })}\n`);
  process.exitCode = ok ? 0 : 1;
}

await main();
