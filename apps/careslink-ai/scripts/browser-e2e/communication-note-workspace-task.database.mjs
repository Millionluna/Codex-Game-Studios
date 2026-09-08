/** Parent/stdin-only probes, in its freshly created synthetic PG16. This file
 * and its operator client are never copied into the Next application. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CALLER = "careslink_v1_generation_job_list_caller";
export async function installWorkspaceTaskBrowserController(owner, open, root) {
  assert.match(root, /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/);
  assert.deepEqual((await owner.query(`select current_setting('data_directory') as data,
    current_setting('cluster_name') as cluster,inet_server_addr() is null as unix_only`)).rows,
  [{ data: root + "/pg/data", cluster: "careslink-review-browser-pg16", unix_only: true }]);
  assert.equal((await owner.query("select pg_has_role('cl_admission_browser_runtime',$1,'MEMBER') as member", [CALLER])).rows[0].member, false);
  let seeded = false, blocker, monitor, expiry, poll, checking = false, pollingWork = Promise.resolve();
  const observed = new Map();
  const report = (stage, extra = {}) => console.log(JSON.stringify({ stage, ...extra }));
  const status = async () => {
    const state = (await owner.query(`select
      (select count(*)::int from pg_stat_activity where usename ~ $1) as runtime_sessions,
      (select count(*)::int from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.usename ~ $1) as runtime_locks,
      (select count(*)::int from pg_roles where rolname ~ $1) as runtime_roles,
      (select count(*)::int from careslink_v1_generation.jobs where owner_user_id=$2 and note_type='communication') as task_rows`, ["^careslink_v1_job_list_runtime_[a-f0-9]{16}$", OWNER])).rows[0];
    report("workspace-task-observation", { ...state, seeded, lockHeld: !!blocker }); return state;
  };
  const unlock = async () => {
    clearInterval(poll); clearTimeout(expiry); await pollingWork;
    if (blocker) { const owned = blocker; blocker = undefined; await owned.query("rollback").catch(() => {}); await owned.end(); }
    if (monitor) { await monitor.end(); monitor = undefined; }
    report("workspace-task-lock-released");
  };
  return Object.freeze({ status,
    async seed() {
      assert.equal(seeded, false, "LOCAL_TASK_SEED_SINGLE_USE");
      const base = (await owner.query("select to_jsonb(j) as j from careslink_v1_generation.jobs j where owner_user_id=$1 and status='FAILED'", [OWNER])).rows;
      assert.equal(base.length, 1, "LOCAL_FIXED_SETTLEMENT_REQUIRED");
      assert.equal((await owner.query("select count(*)::int n from careslink_v1_generation.jobs")).rows[0].n, 3);
      const job = base[0].j;
      const payload = (await owner.query("select to_jsonb(p) as p from careslink_v1_generation.payloads p where id=$1", [job.payload_id])).rows[0].p;
      const ledger = JSON.stringify((await owner.query("select * from public.point_ledger_entries order by id")).rows);
      await owner.query("begin");
      try {
        for (let i = 0; i < 22; i++) {
          const id = randomUUID(), payloadId = randomUUID();
          await owner.query("insert into careslink_v1_generation.jobs select (jsonb_populate_record(null::careslink_v1_generation.jobs,$1::jsonb)).*",
            [JSON.stringify({ ...job, id, payload_id: payloadId, communication_note_point_admission_id: null, idempotency_hash: randomBytes(32).toString("hex") })]);
          await owner.query("insert into careslink_v1_generation.payloads select (jsonb_populate_record(null::careslink_v1_generation.payloads,$1::jsonb)).*",
            [JSON.stringify({ ...payload, id: payloadId, job_id: id })]);
        }
        await owner.query("set constraints all immediate"); await owner.query("commit");
      } catch (error) { await owner.query("rollback"); throw error; }
      assert.equal(JSON.stringify((await owner.query("select * from public.point_ledger_entries order by id")).rows), ledger);
      seeded = true; report("workspace-task-seeded", { rows: 25, catalogOnlyClones: 22, additionalCharges: 0, modelCalled: false });
      await status();
    },
    async lock() {
      assert.equal(!!blocker, false, "LOCAL_TASK_LOCK_ALREADY_HELD");
      blocker = await open(); monitor = await open(); observed.clear();
      await blocker.query("begin"); await blocker.query("set local idle_in_transaction_session_timeout=60000");
      await blocker.query("lock table careslink_v1_generation.jobs in access exclusive mode");
      const check = async () => {
        if (checking || !blocker || !monitor) return;
        checking = true;
        try {
          const rows = (await monitor.query("select pid,backend_start::text as start,wait_event_type from pg_stat_activity where usename ~ $1 and application_name like 'cl-task-read-%'", ["^careslink_v1_job_list_runtime_[a-f0-9]{16}$"])).rows;
          for (const row of rows) if (row.wait_event_type === "Lock" && !observed.has(row.pid)) {
            observed.set(row.pid, { start: row.start, at: performance.now(), gone: false }); report("workspace-task-read-lock-seen");
          }
          for (const [pid, entry] of observed) if (!entry.gone && !rows.some(row => row.pid === pid && row.start === entry.start)) {
            entry.gone = true;
            const locks = (await monitor.query("select count(*)::int n from pg_locks where pid=$1", [pid])).rows[0].n;
            report("workspace-task-read-lock-gone", { elapsedMs: Math.round(performance.now() - entry.at), locks, blockerStillHeld: !!blocker });
          }
        } catch { report("workspace-task-monitor-unavailable"); }
        finally { checking = false; }
      };
      poll = setInterval(() => { if (!checking) pollingWork = check(); }, 20);
      expiry = setTimeout(() => { void unlock().catch(() => report("workspace-task-unlock-failed")); }, 45000);
      report("workspace-task-lock-held", { automaticReleaseMs: 45000 });
    }, unlock,
    async stop() {
      await unlock();
    },
  });
}
