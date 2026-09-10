/** TEST ONLY: bundled by the opt-in local PG16 fixture. No Hosted connector,
 * HTTP listener, env credential, argv target, arbitrary fault or raw output. */
import assert from "node:assert/strict";
import { Client } from "pg";
import { createCommunicationNoteTaskPreviewService } from "../../src/lib/communication-note-task-preview-service.server.ts";
import { createTaskPreviewSqlBroker } from "../../src/lib/communication-note-task-preview-issuer.server.ts";
import { ownTaskPreviewServiceProcess } from "../../src/lib/communication-note-task-preview-host.server.ts";

assert.equal(process.argv.length, 2); assert.equal(typeof process.send, "function");
const REF = "abcdefghijklmnopqrst";
let initialized = false, host, mode, application, socket, inventories = 0;
let requestId = 0;
const replies = new Map();
const send = message => { if (process.connected) process.send(message, () => {}); };
process.once("disconnect", () => { if (!host) process.exit(1); });
async function open() {
  const c = new Client({ host: socket, port: 15437, database: "postgres", user: "postgres", password: "", ssl: false,
    application_name: application, connectionTimeoutMillis: 500, query_timeout: 2000,
    options: "-c statement_timeout=1500 -c lock_timeout=500 -c idle_in_transaction_session_timeout=2000" });
  c.connectionParameters.replication = false; c.connectionParameters.binary = false;
  c.on("error", () => {});
  try {
    await c.connect();
    assert.deepEqual((await c.query(`select current_setting('cluster_name') cluster,inet_server_addr() is null local,
      current_setting('server_version_num')::int/10000 major,current_user login`)).rows,
    [{ cluster: "careslink-task-issuer-local-pg16", local: true, major: 16, login: "postgres" }]);
    return c;
  } catch { await c.end(); throw new Error("LOCAL_TARGET_UNAVAILABLE"); }
}
process.on("message", raw => {
  void (async () => {
    assert.ok(raw && typeof raw === "object" && !Array.isArray(raw));
    if (raw.type === "protocol-reply") {
      assert.equal(socket, "PROTOCOL_ONLY"); const pending = replies.get(raw.id); assert.ok(pending); replies.delete(raw.id);
      if (raw.failed) pending.reject(new Error("SYNTHETIC_PROTOCOL_FAILURE")); else pending.resolve(raw.value);
      return;
    }
    if (!initialized) {
      assert.deepEqual(Object.keys(raw).sort(), ["application", "mode", "socket", "type"]);
      assert.equal(raw.type, "init");
      assert.ok(raw.socket === "PROTOCOL_ONLY" || /^\/private\/tmp\/cl-task-issuer-[A-Za-z0-9]{6}\/socket$/.test(raw.socket));
      assert.match(raw.application, /^cl-task-host-test-[a-f0-9]{32}$/);
      assert.ok(["NORMAL", "ISSUE_COMMITTED", "FENCE_COMMITTED", "STOP_UNCONFIRMED", "RECOVERY_FAILED"].includes(raw.mode));
      initialized = true; ({ mode, application, socket } = raw);
      // The normal offline suite keeps a protocol ledger in the parent process.
      // It proves actual process loss, NOT SQL execution/durability or TLS.
      const base = socket === "PROTOCOL_ONLY" ? { call(op, data) {
        return new Promise((resolve, reject) => { const id = ++requestId; replies.set(id, { resolve, reject });
          send({ type: "protocol-call", id, op, data }); });
      } } : createTaskPreviewSqlBroker(async () => {
        const c = await open(); return { query: (sql, values) => c.query(sql, [...values]), close: () => c.end() };
      });
      const service = createCommunicationNoteTaskPreviewService({ projectRef: REF, broker: { async call(op, data, ctx) {
        if (mode === "RECOVERY_FAILED" || (op === "inventory" && ++inventories > 1 && mode === "STOP_UNCONFIRMED"))
          throw new Error("SYNTHETIC_UNAVAILABLE");
        const result = await base.call(op, data, ctx);
        if ((op === "issue" && mode === "ISSUE_COMMITTED") || (op === "fence" && mode === "FENCE_COMMITTED")) {
          send({ type: "checkpoint", operation: op });
          await new Promise(() => {}); // fixed post-commit, pre-ack kill point
        }
        return result;
      } } });
      host = ownTaskPreviewServiceProcess(service, "TASK_PREVIEW_DEDICATED_NODE_PROCESS");
      await host.ready; send({ type: "ready" }); return;
    }
    assert.ok(host); assert.deepEqual(Object.keys(raw).sort(), ["scope", "type"]);
    assert.ok(["issue", "revoke"].includes(raw.type));
    const result = await host.custody[raw.type](raw.scope, { signal: new AbortController().signal });
    // A synthetic password is never sent over IPC or written to stdout/files.
    send({ type: "completed", operation: raw.type, requestId: raw.scope.requestId });
    if (raw.type === "issue") result.credential.password = "";
  })().catch(() => { if (!host) process.exit(1); else void host.stop(); });
});
