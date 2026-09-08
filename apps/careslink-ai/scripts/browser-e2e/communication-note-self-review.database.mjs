import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { verifySelfReviewScenarios } from "../preview-e2e/communication-note-self-review-local-scenarios.mjs";
import { verifyWordingEditScenarios } from "../preview-e2e/communication-note-edit-local-scenarios.mjs";
import { verifyExportHistoryScenarios } from "../preview-e2e/communication-note-export-history-local-scenarios.mjs";
import { installAdmissionBrowserDatabase, verifyAdmissionBrowserDatabase } from "./communication-note-admission.database.mjs";
import { installSettlementBrowserController, verifySettlementBrowserController } from "./communication-note-settlement.database.mjs";
import { verifySettledReviewScenarios } from "./communication-note-settled-review.database.mjs";

const exec = promisify(execFile), childEnv = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const REVIEW_DOC = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222", REV2 = "33333333-3333-4333-8333-333333333333";
const RUNTIME = "cl_review_browser_runtime", CLUSTER = "careslink-review-browser-pg16", PORT = 15437;
const HISTORY_RPCS = "public.record_communication_note_export_report(uuid,uuid,jsonb),public.list_communication_note_export_reports(uuid,uuid),careslink_communication_history.access_reports(uuid,uuid,uuid,jsonb)";
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
export function createReviewBrowserDatabase(root, mode = "REVIEW") {
  assert.match(root, /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/u);
  assert.ok(["REVIEW", "EDIT", "HISTORY", "ADMISSION", "SETTLEMENT", "SETTLEMENT_REVIEW", "SETTLEMENT_EDIT", "SETTLEMENT_LIST", "WORKSPACE_TASK"].includes(mode));
  const workspaceTaskId = mode === "WORKSPACE_TASK" ? randomUUID() : undefined;
  const settledList = mode === "SETTLEMENT_LIST" || mode === "WORKSPACE_TASK";
  const settledEdit = mode === "SETTLEMENT_EDIT" || settledList, settledReview = mode === "SETTLEMENT_REVIEW" || settledEdit;
  const settlement = mode === "SETTLEMENT" || settledReview, admission = mode === "ADMISSION" || settlement, admissionPassword = randomBytes(32).toString("hex");
  const history = mode === "HISTORY" || settledReview, edit = mode === "EDIT" || mode === "HISTORY" || settledEdit;
  const base = join(root, "pg"), data = join(base, "data"), socket = join(base, "socket");
  let server, exited, owner, bootstrapMayBeRunning = false, closing = false;
  let terminalController;
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
    env: { CARESLINK_LOCAL_REVIEW_DATABASE: "OWNED_UNIX_SOCKET_ONLY", CARESLINK_LOCAL_REVIEW_PASSWORD: password,
      ...(admission ? { CARESLINK_LOCAL_ADMISSION_DATABASE: "OWNED_UNIX_SOCKET_ONLY", CARESLINK_LOCAL_ADMISSION_PASSWORD: admissionPassword } : {}),
      ...(settlement ? { CARESLINK_LOCAL_SETTLEMENT_DATABASE: "OWNED_UNIX_SOCKET_ONLY" } : {}),
      ...(settledReview ? { CARESLINK_LOCAL_SETTLED_REVIEW: "EXACT_SETTLED_RESULT_ONLY" } : {}),
      ...(settledEdit ? { CARESLINK_LOCAL_SETTLED_EDIT: "EXACT_SETTLED_DOCUMENT_ONLY" } : {}),
      ...(settledList ? { CARESLINK_LOCAL_SETTLED_LIST: "EXACT_SETTLED_DOCUMENT_ONLY" } : {}),
      ...(workspaceTaskId ? { CARESLINK_LOCAL_TASK_ENTRY: "FIXED_SINGLE_ADMISSION", CARESLINK_LOCAL_TASK_ENTRY_JOB_ID: workspaceTaskId } : {}),
      ...(edit ? { CARESLINK_LOCAL_EDIT_DATABASE: "OWNED_UNIX_SOCKET_ONLY" } : {}),
      ...(history ? { CARESLINK_LOCAL_HISTORY_DATABASE: "OWNED_UNIX_SOCKET_ONLY" } : {}) },
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
      const checkpoint = name => console.log(JSON.stringify({ stage: "review-database-scenario", name }));
      await verifySelfReviewScenarios(owner, await open(), await open(), passed, checkpoint);
      assert.equal(passed.length, 14);
      if (history) {
        await verifyExportHistoryScenarios(owner, await open(), await open(), passed, checkpoint);
        assert.equal(passed.length, 35);
        await owner.query("delete from careslink_communication_history.reports");
      }
      if (edit) {
        await verifyWordingEditScenarios(owner, await open(), await open(), passed, checkpoint);
        assert.equal(passed.length, history ? 54 : 33);
      }
      // Reset only this just-created synthetic fixture after the full matrix.
      // The application LOGIN never receives this operator's privileges.
      checkpoint("browser:reset-synthetic-state");
      await owner.query("delete from public.self_review_events");
      if (edit) {
        await owner.query("delete from public.ai_document_mutation_receipts");
        await owner.query("delete from public.ai_document_sync_changes");
        // Reset both synthetic documents before deleting newer revisions in
        // reverse order; keep all FK/CHECK/RLS constraints enabled.
        await owner.query(`update public.ai_documents d set current_revision_id=r.id,current_revision_number=1
          from public.ai_document_revisions r where r.document_id=d.id and r.revision_number=1`);
        const newer = (await owner.query("select id from public.ai_document_revisions where revision_number>1 order by revision_number desc")).rows;
        for (const row of newer) await owner.query("delete from public.ai_document_revisions where id=$1", [row.id]);
        await owner.query("update public.privacy_reviews set confirmed_at=statement_timestamp(),expires_at=statement_timestamp()+interval '30 minutes'");
        await owner.query("grant usage on schema careslink_communication_edit to authenticated");
        await owner.query("grant execute on function public.save_communication_note_wording(uuid,uuid,jsonb),careslink_communication_edit.save_wording(uuid,uuid,jsonb) to authenticated");
        await owner.query("update public.communication_note_edit_flags set enabled=true");
      }
      await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=1 where id=$1", [REVIEW_DOC, REV]);
      await owner.query("delete from public.ai_document_revisions where id=$1 and document_id=$2", [REV2, REVIEW_DOC]);
      if (admission) {
        await installAdmissionBrowserDatabase(owner, await open(), root, admissionPassword, settlement);
        const admissionRuntime = await open("cl_admission_browser_runtime", admissionPassword);
        await verifyAdmissionBrowserDatabase(owner, admissionRuntime, workspaceTaskId);
        await admissionRuntime.end();
        if (settlement) terminalController = await installSettlementBrowserController(owner, open, root);
      }
      if (history) {
        // Only this owned, disposable database receives the opt-in capability.
        checkpoint("browser:install-temporary-history-capability");
        await owner.query("grant usage on schema careslink_communication_history to authenticated");
        await owner.query(`grant execute on function ${HISTORY_RPCS} to authenticated`);
        await owner.query("update careslink_communication_history.flags set enabled=true");
      }
      await owner.query(`create role ${RUNTIME} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}'`);
      await owner.query(`grant authenticated to ${RUNTIME} with admin false, inherit false, set true`);
      const runtime = await open(RUNTIME, password);
      checkpoint("browser:attest-runtime-and-readback");
      assert.deepEqual((await runtime.query("select current_user as role,inet_server_addr() is null as unix_only")).rows,
        [{ role: RUNTIME, unix_only: true }]);
      await assert.rejects(runtime.query("select * from public.self_review_events"), e => e.code === "42501");
      if (history) await assert.rejects(runtime.query("select * from careslink_communication_history.reports"), e => e.code === "42501");
      await runtime.query("begin"); await runtime.query("set local role authenticated");
      await runtime.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: OWNER, session_id: SESSION,
        role: "authenticated", is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 })]);
      const initial = (await runtime.query("select public.get_v1_shadow_document($1) as data", [REVIEW_DOC])).rows[0].data;
      assert.equal(initial.selfReviewStatus, "REQUIRED"); assert.equal(initial.revisions.length, 1);
      assert.equal(initial.document.currentRevisionId, initial.revisions[0].revisionId);
      if (history) {
        const list = (await runtime.query("select public.list_communication_note_export_reports($1,$2) as data", [REVIEW_DOC, REV])).rows[0].data;
        assert.equal(list.storage, "DURABLE"); assert.deepEqual(list.entries, []);
      }
      await runtime.query("commit");
      await runtime.end();
      console.log(JSON.stringify({ stage: "review-database-ready", postgresMajor: 16, matrixPassed: passed.length,
        unixOnly: true, runtimePrivileged: false, authSynthetic: true, hostedVerified: false, edit, history }));
    },
    async verifySettlement() {
      assert.ok(settlement && terminalController); assert.equal(closing, false);
      const runtime = await open("cl_admission_browser_runtime", admissionPassword);
      try {
        await verifySettlementBrowserController(owner, runtime, terminalController);
        if (settledReview) {
          const actor = await open(RUNTIME, password);
          try { await verifySettledReviewScenarios(owner, actor, root, terminalController, settledEdit, settledList); }
          finally { await actor.end(); }
        }
      }
      finally { await runtime.end(); }
    },
    async command(command) {
      assert.ok(owner); assert.equal(closing, false);
      if (settlement && command.startsWith("settle-")) {
        assert.ok(terminalController); await terminalController.run(command);
      } else if (admission && command === "advance") throw new Error("FIXED_LOCAL_COMMAND_ONLY");
      else if (command === "advance" && edit) {
        // Simulate a second editor through the real narrow RPC, not a direct
        // document-pointer UPDATE. The stdin operator never accepts user SQL.
        await owner.query("begin");await owner.query("set local role authenticated");
        await owner.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: OWNER,session_id: SESSION,
          role: "authenticated",is_anonymous: false,exp: Math.floor(Date.now()/1000)+3600 })]);
        const current = (await owner.query("select public.get_v1_shadow_document($1) as d", [REVIEW_DOC])).rows[0].d;
        const base = current.revisions.find(r => r.revisionId === current.document.currentRevisionId);
        assert.ok(base);
        const update = { baseRevisionId: base.revisionId, englishDraft: base.content.englishDraft + " Synthetic concurrent update.",
          reviewVersions: { "zh-Hans": base.content.reviewVersions["zh-Hans"] + " 合成并发修改。", "zh-Hant": base.content.reviewVersions["zh-Hant"] + " 合成並行修改。" }, wordingConfirmed: true };
        await owner.query("select public.save_communication_note_wording($1,$2,$3::jsonb)", [REVIEW_DOC,randomUUID(),JSON.stringify(update)]);
        await owner.query("commit");
      } else if (command === "advance") {
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
      } else if (history && (command === "history-off" || command === "history-on")) {
        await owner.query("update careslink_communication_history.flags set enabled=$1", [command === "history-on"]);
      } else if (command !== "status") throw new Error("FIXED_LOCAL_COMMAND_ONLY");
      const state = (await owner.query(`select
        (select count(*)::int from public.self_review_events) as review_events,
        (select count(*)::int from public.ai_document_mutation_receipts) as edit_receipts,
        (select count(*)::int from public.ai_document_sync_changes) as sync_changes,
        (select current_revision_number from public.ai_documents where id=$1) as revision,
        exists(select 1 from auth.sessions where id=$2) as session_active,
        (select count(*)::int from public.point_ledger_entries) as points_entries,
        (select count(*)::int from careslink_v1_generation.jobs) as generation_jobs`, [REVIEW_DOC, SESSION])).rows[0];
      const reports = history ? (await owner.query(`select revision_number,format,outcome,count(*)::int as count
        from careslink_communication_history.reports group by revision_number,format,outcome order by revision_number,format,outcome`)).rows : undefined;
      console.log(JSON.stringify({ stage: "review-database-observation", command, ...state, reports }));
      if (admission) console.log(JSON.stringify({ stage: "admission-database-observation", ...(await owner.query(`select
        (select coalesce(sum(remaining_points),0)::int from public.point_lots) as available_points,
        (select coalesce(sum(points),0)::int from public.point_reservations where status='RESERVED') as reserved_points,
        (select count(*)::int from public.point_ledger_entries where event='RESERVE') as reserve_events,
        (select count(*)::int from public.point_ledger_entries where event in ('COMMIT','RELEASE')) as terminal_events,
        (select count(*)::int from careslink_v1_generation.jobs where status='QUEUED' and attempt_count=0) as queued_jobs,
        (select count(*)::int from careslink_v1_generation.communication_note_point_admissions) as admissions`)).rows[0] }));
    },
    async stop() {
      closing = true;
      if (history && owner) {
        await owner.query("rollback").catch(() => {});
        await owner.query(`revoke execute on function ${HISTORY_RPCS} from authenticated`).catch(() => {});
        await owner.query("revoke usage on schema careslink_communication_history from authenticated").catch(() => {});
      }
      if (edit && owner) {
        // Best effort only; shutdown still runs if initialization failed. The
        // whole owned database is removed after process-exit proof regardless.
        await owner.query("rollback").catch(() => {});
        await owner.query("revoke execute on function public.save_communication_note_wording(uuid,uuid,jsonb),careslink_communication_edit.save_wording(uuid,uuid,jsonb) from authenticated").catch(() => {});
        await owner.query("revoke usage on schema careslink_communication_edit from authenticated").catch(() => {});
      }
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
