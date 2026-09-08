/** TEST ONLY. Parent-owned Unix broker; NEVER copy this operator into Next.
 * One delivery / request id, two PG connections / read, 60s absolute lifetime.
 * Tombstones persist in this disposable DB, not a Hosted credential store. */
import assert from "node:assert/strict";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, lstat, realpath, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

const CALLER = "careslink_v1_generation_job_list_caller";
const PURPOSE = "COMMUNICATION_NOTE_JOB_LIST_READ";
const TABLE = "cl_local_task_credential.receipts";
const ID = /^[a-f0-9]{32}$/;
const ROLE = /^careslink_v1_job_list_runtime_[a-f0-9]{16}$/;
const IDENTITIES = new Map([
  ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
  ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
]);
function exact(value, keys) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function identity(value) {
  exact(value, ["userId", "sessionId", "transport"]);
  assert.equal(value.transport, "COOKIE");
  assert.equal(IDENTITIES.has(value.userId), true);
  assert.equal(IDENTITIES.get(value.userId), value.sessionId);
}

export async function assertTaskCredentialRoot(root) {
  assert.match(root, /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/);
  assert.equal(await realpath(root), root);
  const dir = await lstat(root);
  assert.equal(dir.isDirectory() && dir.uid === process.getuid() && (dir.mode & 0o077) === 0, true);
}
export async function attestTaskCredentialDatabase(owner, root) {
  assert.deepEqual((await owner.query(`select current_setting('data_directory') as data,
    current_setting('cluster_name') as cluster, current_setting('listen_addresses') as listeners,
    current_setting('server_version_num')::int/10000 as major, current_database() as db,
    session_user::text as login, inet_server_addr() is null as unix_only`)).rows,
  [{ data: root + "/pg/data", cluster: "careslink-review-browser-pg16", listeners: "", major: 16,
    db: "postgres", login: "review_test_bootstrap", unix_only: true }]);
}

export async function installTaskCredentialBroker(root, open, capability, options = {}) {
  await assertTaskCredentialRoot(root);
  assert.equal(typeof capability === "string" && capability.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(capability), true);
  assert.ok(Object.keys(options).every(k => ["listen", "checkpoint"].includes(k)));
  const owner = await open();
  let server;
  let stopped = false, poisoned = false, queue = Promise.resolve(), pending = 0;
  const deadlines = new Map(), sockets = new Set();
  const serial = fn => { const work = queue.then(fn); queue = work.catch(() => {}); return work; };
  const report = (stage, extra = {}) => console.log(JSON.stringify({ stage, ...extra, modelCalled: false }));
  try {
  await attestTaskCredentialDatabase(owner, root);
  // One operator for this owned cluster. Disconnect/crash releases the fence.
  assert.equal((await owner.query("select pg_try_advisory_lock(7149032) as held")).rows[0].held, true, "LOCAL_ISSUER_ALREADY_RUNNING");
  await owner.query("set log_statement='none'; set log_min_error_statement='panic'; set log_duration=off; set log_min_duration_statement=-1");
  // No SECURITY DEFINER or product migration. Nothing is granted this schema.
  if (!(await owner.query("select to_regnamespace('cl_local_task_credential') as schema")).rows[0].schema) {
  await owner.query(`begin; create schema cl_local_task_credential;
    revoke all on schema cl_local_task_credential from public;
    create table ${TABLE}(id text primary key, role_name text unique not null, role_oid oid not null,
      purpose text not null check(purpose='${PURPOSE}'), owner_id uuid not null, session_id uuid not null,
      expires_at timestamptz not null, state text not null check(state in ('ISSUED','REVOKING','REVOKED')),
      revoked_at timestamptz, reason text check(reason in ('COMPLETE','EXPIRED','STOP','RESTART')));
    alter table ${TABLE} enable row level security;
    revoke all on table ${TABLE} from public;
    comment on schema cl_local_task_credential is 'CARESLINK_LOCAL_TASK_CREDENTIAL_V2'; commit`);
  }
  // Refuse incompatible/tampered durable state rather than silently upgrading.
  assert.deepEqual((await owner.query(`select n.nspowner=current_user::regrole as owner,
    obj_description(n.oid,'pg_namespace') as version, c.relowner=current_user::regrole as table_owner,
    c.relrowsecurity as rls, c.relkind::text as kind,
    not exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) where grantee<>n.nspowner) as schema_private,
    not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) where grantee<>c.relowner) as table_private
    from pg_namespace n join pg_class c on c.relnamespace=n.oid
    where n.nspname='cl_local_task_credential' and c.relname='receipts'`)).rows,
  [{ owner: true, version: "CARESLINK_LOCAL_TASK_CREDENTIAL_V2", table_owner: true, rls: true, kind: "r", schema_private: true, table_private: true }]);

  async function revoke(id, reason) {
    assert.match(id, ID);
    const row = (await owner.query(`select * from ${TABLE} where id=$1`, [id])).rows[0];
    assert.ok(row, "LOCAL_LEASE_UNKNOWN");
    if (row.state === "REVOKED") return { leaseId: id, revoked: true };
    assert.match(row.role_name, ROLE);
    assert.equal(row.role_name.length, "careslink_v1_job_list_runtime_".length + 16);
    assert.equal(row.purpose, PURPOSE);
    identity({ userId: row.owner_id, sessionId: row.session_id, transport: "COOKIE" });
    // Commit the login barrier BEFORE termination. Membership alone does not
    // stop an already SET ROLE session; expiry alone does not close sessions.
    const role = (await owner.query("select oid from pg_roles where rolname=$1", [row.role_name])).rows[0];
    assert.equal(role?.oid, row.role_oid, "LOCAL_LEASE_ROLE_CHANGED");
    await owner.query("begin");
    try {
      await owner.query(`alter role ${row.role_name} nologin password null`);
      await owner.query(`revoke ${CALLER} from ${row.role_name}`);
      await owner.query(`update ${TABLE} set state='REVOKING',reason=$2 where id=$1`, [id, reason]);
      await owner.query("commit");
    } catch (error) { await owner.query("rollback").catch(() => {}); throw error; }
    await options.checkpoint?.("REVOKE_BARRIER_COMMITTED");
    const killed = (await owner.query(`select pg_terminate_backend(pid,1000) as ok from pg_stat_activity
      where usesysid=$1 and usename=$2 and datname=current_database() and pid<>pg_backend_pid()`, [row.role_oid, row.role_name])).rows;
    assert.ok(killed.every(r => r.ok === true));
    assert.equal((await owner.query("select count(*)::int n from pg_stat_activity where usesysid=$1", [row.role_oid])).rows[0].n, 0);
    await owner.query("begin");
    try {
      await owner.query(`drop role ${row.role_name}`);
      await options.checkpoint?.("REVOKE_DROP_PENDING");
      await owner.query(`update ${TABLE} set state='REVOKED',revoked_at=clock_timestamp() where id=$1`, [id]);
      await owner.query("commit");
    } catch (error) { await owner.query("rollback").catch(() => {}); throw error; }
    assert.equal((await owner.query("select count(*)::int n from pg_roles where oid=$1 or rolname=$2", [row.role_oid, row.role_name])).rows[0].n, 0);
    clearTimeout(deadlines.get(id)?.timer); deadlines.delete(id);
    report("task-credential-revoked", { reason, sessions: 0, roleRemoved: true, tombstone: true });
    return { leaseId: id, revoked: true };
  }
  function expire(id) {
    void serial(() => revoke(id, "EXPIRED")).catch(() => {
      poisoned = true; report("task-credential-cleanup-unconfirmed");
    });
  }
  async function issue(body) {
    exact(body, ["requestId", "principal", "purpose"]); assert.match(body.requestId, ID);
    assert.equal(body.purpose, PURPOSE); identity(body.principal);
    assert.equal(stopped || poisoned, false, "LOCAL_ISSUER_UNAVAILABLE");
    assert.ok(deadlines.size < 4, "LOCAL_LEASE_CAPACITY");
    // Unknown/duplicate IDs never replay a secret, even after revocation.
    const inventory = (await owner.query(`select count(*)::int total,
      count(*) filter(where id=$1)::int duplicate from ${TABLE}`, [body.requestId])).rows[0];
    assert.equal(inventory.duplicate, 0, "LOCAL_DELIVERY_SINGLE_USE"); assert.ok(inventory.total < 512);
    const role = "careslink_v1_job_list_runtime_" + randomBytes(8).toString("hex");
    let password = randomBytes(32).toString("base64url");
    const start = Date.now(), monotonic = performance.now(), expires = new Date(start + 60000).toISOString();
    await owner.query("begin");
    try {
      const args = [body.principal.userId, body.principal.sessionId];
      assert.equal((await owner.query("select careslink_v1_generation.fresh_session_is_active($1,$2,clock_timestamp()) as active", args)).rows[0].active, true);
      await owner.query(`create role ${role} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
        connection limit 2 password '${password}' valid until '${expires}'`);
      await owner.query(`grant ${CALLER} to ${role} with admin false, inherit false, set true`);
      // Recheck after auth row locks / DDL. No stale issuance after a long wait.
      assert.equal((await owner.query("select careslink_v1_generation.fresh_session_is_active($1,$2,clock_timestamp()) as active", args)).rows[0].active, true);
      assert.ok(Date.now() >= start && Date.now() < start + 10000 && performance.now() - monotonic < 10000);
      await owner.query(`insert into ${TABLE}(id,role_name,role_oid,purpose,owner_id,session_id,expires_at,state)
        values($1,$2::text,$2::text::regrole::oid,$3,$4,$5,$6,'ISSUED')`, [body.requestId, role, PURPOSE, ...args, expires]);
      await owner.query("commit");
    } catch (error) { await owner.query("rollback").catch(() => {}); password = ""; throw error; }
    await options.checkpoint?.("ISSUE_COMMITTED");
    // Timer survives a lost delivery or client disappearance; never refreshed.
    const timer = setTimeout(() => expire(body.requestId), Math.max(0, 60000 - (performance.now() - monotonic)));
    deadlines.set(body.requestId, { timer });
    const result = { leaseId: body.requestId, credential: { role, password, deliveryExpiresAt: expires } };
    password = ""; report("task-credential-issued", { singleDelivery: true, lifetimeSeconds: 60 }); return result;
  }

  // Reconcile ALL unfinished deliveries before opening IPC. Never redeliver a
  // password from a prior worker, even if its original expiry has not elapsed.
  const abandoned = (await owner.query(`select id from ${TABLE} where state<>'REVOKED' order by id limit 5`)).rows;
  assert.ok(abandoned.length <= 4, "LOCAL_RECOVERY_INVENTORY_UNBOUNDED");
  for (const row of abandoned) await revoke(row.id, "RESTART");
  server = createServer({ requestTimeout: 3000, headersTimeout: 2000, maxHeaderSize: 1024 }, (req, res) => {
    const supplied = Buffer.from(req.headers.authorization ?? ""), expected = Buffer.from("Bearer " + capability);
    const deny = () => { res.writeHead(503, { "Connection": "close", "Cache-Control": "no-store" }); res.end('{"unavailable":true}'); };
    if (stopped || req.method !== "POST" || !["/issue", "/revoke"].includes(req.url) || supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected) || req.headers["content-type"] !== "application/json" || pending >= 8) { deny(); return; }
    pending++; let bytes = 0, body = "", complete = false;
    const timeout = setTimeout(() => req.destroy(), 3000);
    req.on("data", chunk => { bytes += chunk.length; if (bytes > 1024) req.destroy(); else body += chunk.toString("utf8"); });
    req.on("error", () => {});
    req.once("close", () => { clearTimeout(timeout); if (!complete) pending--; });
    req.once("end", () => {
      complete = true; clearTimeout(timeout);
      void serial(async () => {
        const parsed = JSON.parse(body); body = "";
        if (req.url === "/issue") return issue(parsed);
        exact(parsed, ["leaseId"]); assert.match(parsed.leaseId, ID);
        try { return await revoke(parsed.leaseId, "COMPLETE"); }
        catch (error) {
          // Unknown IDs are harmless; uncertainty about an owned live lease
          // closes future issuance until this fixture is stopped.
          if (deadlines.has(parsed.leaseId)) poisoned = true;
          throw error;
        }
      }).then(result => {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "Connection": "close" });
        res.end(JSON.stringify(result)); if (result.credential) result.credential.password = "";
      }, error => {
        report("task-credential-request-denied", { code: /^[A-Z0-9_]{1,30}$/.test(error?.code ?? "") ? error.code : "UNAVAILABLE" });
        deny();
      }).finally(() => { pending--; });
    });
  });
  server.maxConnections = 8;
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {}); });
  const socketPath = root + "/task-credential.sock";
  if (options.listen !== false) {
  // Only after owning the DB fence may a crash-left socket be removed.
  try {
    const stale = await lstat(socketPath);
    assert.ok(stale.isSocket() && stale.uid === process.getuid() && (stale.mode & 0o777) === 0o600, "LOCAL_SOCKET_NOT_OWNED");
    await unlink(socketPath);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  await chmod(socketPath, 0o600);
  }
  report("task-credential-broker-ready", { unixOnly: true, operatorInNext: false });
  return Object.freeze({
    // In-process owned-test hooks only; never accepted over the HTTP socket.
    suppressExpiryTimersForTest() { for (const entry of deadlines.values()) clearTimeout(entry.timer); },
    async status() { await queue; return (await owner.query(`select state,count(*)::int count from ${TABLE} group by state order by state`)).rows; },
    async stop() {
      stopped = true; const closed = server.listening ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
      for (const socket of sockets) socket.destroy(); await closed;
      try {
        await serial(async () => {
          // Durable rows, not merely memory, enumerate this issuer's exact roles.
          const active = (await owner.query(`select id from ${TABLE} where state<>'REVOKED' order by id`)).rows;
          for (const row of active) await revoke(row.id, "STOP");
        });
      } finally {
        for (const entry of deadlines.values()) clearTimeout(entry.timer);
        deadlines.clear(); await owner.end();
      }
      report("task-credential-broker-stopped", { activeLeases: 0 });
    },
  });
  } catch (error) {
    for (const entry of deadlines.values()) clearTimeout(entry.timer);
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await owner.query("rollback").catch(() => {}); await owner.end();
    throw error;
  }
}
