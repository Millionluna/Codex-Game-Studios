import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { verifySelfReviewScenarios } from "../preview-e2e/communication-note-self-review-local-scenarios.mjs";

const exec = promisify(execFile), childEnv = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const REVIEW_DOC = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222", REV2 = "33333333-3333-4333-8333-333333333333";
const RUNTIME = "cl_review_browser_runtime", CLUSTER = "careslink-review-browser-pg16", PORT = 15437;
async function bounded(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("LOCAL_TIMEOUT")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

/** No existing URL/role/database inputs. The parent owns the one mkdtemp root
 * and removes it only after stop() proves this child exited. */
export function createReviewBrowserDatabase(root) {
  assert.match(root, /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/u);
  const base = join(root, "pg"), data = join(base, "data"), socket = join(base, "socket");
  let server, exited, owner, bootstrapMayBeRunning = false, closing = false;
  const clients = [], password = randomBytes(32).toString("hex");
  const open = async (user = "review_test_bootstrap", secret = "") => {
    const client = new pg.Client({ host: socket, port: PORT, user, password: secret, database: "postgres", ssl: false,
      connectionTimeoutMillis: 500, query_timeout: 7000,
      options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000" });
    client.on("error", () => {});
    try { await client.connect(); clients.push(client); return client; }
    catch (error) { await client.end(); throw error; }
  };
  return {
    env: { CARESLINK_LOCAL_REVIEW_DATABASE: "OWNED_UNIX_SOCKET_ONLY", CARESLINK_LOCAL_REVIEW_PASSWORD: password },
    async start() {
      assert.equal(await realpath(root), root);
      let bin;
      for (const path of ["/opt/homebrew/opt/postgresql@16/bin", "/usr/local/opt/postgresql@16/bin", "/usr/lib/postgresql/16/bin"]) {
        try { if (/\(PostgreSQL\) 16\./.test((await exec(join(path, "postgres"), ["--version"], { env: childEnv })).stdout)) { bin = path; break; } }
        catch { /* Fixed local installations only. */ }
      }
      assert.ok(bin, "LOCAL_PG16_NOT_FOUND");
      await mkdir(base, { mode: 0o700 }); await mkdir(socket, { mode: 0o700 });
      bootstrapMayBeRunning = true;
      try {
        await exec(join(bin, "initdb"), ["-D", data, "--auth=trust", "--username=review_test_bootstrap", "--no-locale", "--encoding=UTF8"],
          { env: childEnv, timeout: 20000, maxBuffer: 128 * 1024 });
        bootstrapMayBeRunning = false;
      } catch (error) { bootstrapMayBeRunning = error.killed === true || Boolean(error.signal); throw error; }
      assert.equal(closing, false);
      await writeFile(join(data, "pg_hba.conf"), "local all review_test_bootstrap trust\nlocal all postgres trust\nlocal all all scram-sha-256\n", { mode: 0o600 });
      server = spawn(join(bin, "postgres"), ["-D", data, "-h", "", "-k", socket, "-p", String(PORT),
        "-c", "unix_socket_permissions=0700", "-c", `cluster_name=${CLUSTER}`], { env: childEnv, stdio: "ignore" });
      exited = new Promise(resolve => { server.once("exit", resolve); server.once("error", resolve); });
      for (let i = 0; i < 40; i++) { try { owner = await open(); break; } catch { await delay(100); } }
      assert.ok(owner); assert.equal(closing, false);
      assert.deepEqual((await owner.query(`select current_setting('data_directory') as data,
        current_setting('unix_socket_directories') as socket,current_setting('listen_addresses') as listeners,
        current_setting('cluster_name') as cluster,inet_server_addr() is null as unix_only`)).rows,
      [{ data, socket, listeners: "", cluster: CLUSTER, unix_only: true }]);
      const passed = [];
      await verifySelfReviewScenarios(owner, await open(), await open(), passed, () => {});
      assert.equal(passed.length, 14);
      // Reset only this just-created synthetic fixture after the full matrix.
      // The application LOGIN never receives this operator's privileges.
      await owner.query("delete from public.self_review_events");
      await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=1 where id=$1", [REVIEW_DOC, REV]);
      await owner.query("delete from public.ai_document_revisions where id=$1 and document_id=$2", [REV2, REVIEW_DOC]);
      await owner.query(`create role ${RUNTIME} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}'`);
      await owner.query(`grant authenticated to ${RUNTIME} with admin false, inherit false, set true`);
      const runtime = await open(RUNTIME, password);
      assert.deepEqual((await runtime.query("select current_user as role,inet_server_addr() is null as unix_only")).rows,
        [{ role: RUNTIME, unix_only: true }]);
      await assert.rejects(runtime.query("select * from public.self_review_events"), e => e.code === "42501");
      await runtime.query("begin"); await runtime.query("set local role authenticated");
      await runtime.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: OWNER, session_id: SESSION, role: "authenticated", is_anonymous: false })]);
      const initial = (await runtime.query("select public.get_v1_shadow_document($1) as data", [REVIEW_DOC])).rows[0].data;
      assert.equal(initial.selfReviewStatus, "REQUIRED"); assert.equal(initial.revisions.length, 1);
      assert.equal(initial.document.currentRevisionId, initial.revisions[0].revisionId);
      await runtime.query("commit");
      await runtime.end();
      console.log(JSON.stringify({ stage: "review-database-ready", postgresMajor: 16, matrixPassed: passed.length,
        unixOnly: true, runtimePrivileged: false, authSynthetic: true, hostedVerified: false }));
    },
    async command(command) {
      assert.ok(owner); assert.equal(closing, false);
      if (command === "advance") {
        await owner.query("begin");
        await owner.query(`insert into public.ai_document_revisions(id,document_id,owner_user_id,revision_number,base_revision_id,
          privacy_review_id,content,content_hash,mutation_id,schema_version,contract_version)
          select $1::uuid,document_id,owner_user_id,2,id,privacy_review_id,content,content_hash,($1::uuid)::text,schema_version,contract_version
          from public.ai_document_revisions where id=$2 and document_id=$3 on conflict(id) do nothing`, [REV2, REV, REVIEW_DOC]);
        await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=2 where id=$1", [REVIEW_DOC, REV2]);
        await owner.query("commit");
      } else if (command === "revoke") {
        await owner.query("delete from auth.sessions where id=$1 and user_id=$2", [SESSION, OWNER]);
      } else if (command === "restore") {
        await owner.query("insert into auth.sessions(id,user_id) values($1,$2) on conflict(id) do nothing", [SESSION, OWNER]);
      } else if (command !== "status") throw new Error("FIXED_LOCAL_COMMAND_ONLY");
      const state = (await owner.query(`select
        (select count(*)::int from public.self_review_events) as review_events,
        (select current_revision_number from public.ai_documents where id=$1) as revision,
        exists(select 1 from auth.sessions where id=$2) as session_active,
        (select count(*)::int from public.point_ledger_entries) as points_entries,
        (select count(*)::int from careslink_v1_generation.jobs) as generation_jobs`, [REVIEW_DOC, SESSION])).rows[0];
      console.log(JSON.stringify({ stage: "review-database-observation", command, ...state }));
    },
    async stop() {
      closing = true;
      await Promise.allSettled(clients.map(c => bounded(c.end(), 7000)));
      if (server?.pid) {
        server.kill("SIGINT");
        try { await bounded(exited, 10000); } catch { server.kill("SIGQUIT"); await bounded(exited, 5000); }
        assert.ok(server.exitCode !== null || server.signalCode !== null);
      } else assert.equal(bootstrapMayBeRunning, false);
      console.log(JSON.stringify({ stage: "review-database-stopped", stopped: true }));
    },
  };
}
