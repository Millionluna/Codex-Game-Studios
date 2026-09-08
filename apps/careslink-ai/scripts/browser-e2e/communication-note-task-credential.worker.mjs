/** Owned-test child only. Private Node IPC, fixed Unix PG16; no CLI secrets. */
import assert from "node:assert/strict";
import { Client } from "pg";
import { installTaskCredentialBroker } from "./communication-note-task-credential.database.mjs";

assert.equal(typeof process.send, "function", "LOCAL_PARENT_IPC_REQUIRED");
let broker, initialized = false, disconnected = false, armed;
const send = message => { if (process.connected) process.send(message, () => {}); };
const shutdown = () => {
  disconnected = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  void Promise.resolve(broker?.stop()).then(() => { clearTimeout(deadline); process.exit(0); },
    () => { clearTimeout(deadline); process.exit(1); });
};
process.on("disconnect", shutdown);
process.on("message", message => {
  void (async () => {
    if (!initialized) {
      assert.deepEqual(Object.keys(message).sort(), ["application", "capability", "root", "type"]);
      assert.equal(message.type, "init"); initialized = true;
      assert.match(message.application, /^cl-task-issuer-[a-f0-9]{32}$/);
      const open = async () => {
        const client = new Client({ host: message.root + "/pg/socket", port: 15437, database: "postgres", ssl: false,
          user: "review_test_bootstrap", password: "", application_name: message.application,
          connectionTimeoutMillis: 1500, query_timeout: 7000,
          options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000" });
        client.on("error", () => process.exit(1));
        try { await client.connect(); return client; } catch (error) { await client.end(); throw error; }
      };
      broker = await installTaskCredentialBroker(message.root, open, message.capability, {
        async checkpoint(point) {
          if (armed !== point) return;
          armed = undefined; send({ type: "checkpoint", point });
          await new Promise(() => {}); // Fixed test interruption boundary only.
        },
      });
      message.capability = "";
      if (disconnected) shutdown(); else send({ type: "ready" });
      return;
    }
    assert.ok(broker); assert.deepEqual(Object.keys(message).sort(), ["type", "value"]);
    if (message.type === "ping") { assert.equal(message.value, null); send({ type: "pong" }); return; }
    assert.equal(message.type, "fault");
    assert.ok(["ISSUE_COMMITTED", "REVOKE_BARRIER_COMMITTED", "REVOKE_DROP_PENDING", "SUPPRESS_EXPIRY"].includes(message.value));
    if (message.value === "SUPPRESS_EXPIRY") broker.suppressExpiryTimersForTest();
    else armed = message.value;
    send({ type: "armed", point: message.value });
  })().catch(() => { send({ type: "failed" }); process.exit(1); });
});
