/** TEST ONLY: actual HTTPS/service/process composition with a parent-owned
 * simulated ledger. No database, Hosted target, installed key or supervisor. */
import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { createCommunicationNoteTaskPreviewService } from "../../src/lib/communication-note-task-preview-service.server.ts";
import { createTaskPreviewHttpsService } from "../../src/lib/communication-note-task-preview-https.server.ts";
import { ownTaskPreviewServiceProcess } from "../../src/lib/communication-note-task-preview-host.server.ts";

assert.equal(process.argv.length, 2); assert.equal(typeof process.send, "function");
assert.equal(process.env.CARESLINK_TASK_ISSUER_LOCAL_SOCKET, undefined);
const REF = "abcdefghijklmnopqrst", replies = new Map();
let initialized = false, host, https, sequence = 0, inventories = 0, checkpoint = false;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const send = value => { if (process.connected) process.send(value, () => {}); };
process.once("disconnect", () => {
  for (const pending of replies.values()) pending.reject(new Error("LOCAL_PROTOCOL_LOST"));
  replies.clear(); if (!host) process.exitCode = 1;
});
function call(op, data) {
  if (!process.connected) return Promise.reject(new Error("LOCAL_PROTOCOL_LOST"));
  return new Promise((resolve, reject) => {
    const id = ++sequence; replies.set(id, { resolve, reject });
    // SCRAM verifiers are not needed by the simulated ledger or exposed in IPC.
    const safe = { ...data }; delete safe.verifier;
    process.send({ type: "protocol-call", id, op, data: safe }, error => {
      if (error) { replies.delete(id); reject(new Error("LOCAL_PROTOCOL_LOST")); }
    });
  });
}
function untilAbort(signal) {
  return new Promise((_, reject) => {
    const abort = () => reject(new Error("LOCAL_CHECKPOINT_ABORTED"));
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  });
}
process.on("message", raw => {
  void (async () => {
    assert.ok(raw && typeof raw === "object" && !Array.isArray(raw));
    if (raw.type === "protocol-reply") {
      const pending = replies.get(raw.id); assert.ok(pending); replies.delete(raw.id);
      if (raw.failed) pending.reject(new Error("LOCAL_PROTOCOL_FAILED")); else pending.resolve(raw.value);
      return;
    }
    if (raw.type === "inspect") {
      assert.deepEqual(Object.keys(raw), ["type"]); assert.ok(host && https);
      send({ type: "inspection", health: host.health(), address: https.address() ?? null,
        listening: process.getActiveResourcesInfo().includes("TCPServerWrap") }); return;
    }
    if (raw.type === "drop-ipc") {
      assert.deepEqual(Object.keys(raw), ["type"]); assert.ok(host);
      // Close the real channel from this end. The production owner's native
      // disconnect handler, not an emitted test event, must stop the service.
      process.disconnect(); return;
    }
    assert.equal(initialized, false);
    assert.deepEqual(Object.keys(raw).sort(), ["cert", "key", "mode", "publicKeyPem", "type"]);
    assert.equal(raw.type, "init");
    assert.ok(["NORMAL", "ISSUE_COMMITTED", "FENCE_COMMITTED", "STOP_UNCONFIRMED", "RECOVERY_FAILED", "REVOKE_FAILED"].includes(raw.mode));
    assert.ok(Buffer.isBuffer(raw.cert) && Buffer.isBuffer(raw.key)); initialized = true;
    const service = createCommunicationNoteTaskPreviewService({ projectRef: REF, broker: { async call(op, data, ctx) {
      if (raw.mode === "RECOVERY_FAILED" || (op === "inventory" && ++inventories > 1 && raw.mode === "STOP_UNCONFIRMED") ||
          (op === "fence" && raw.mode === "REVOKE_FAILED")) throw new Error("LOCAL_PROTOCOL_FAILED");
      const result = await call(op, data);
      if (!checkpoint && ((op === "issue" && raw.mode === "ISSUE_COMMITTED") || (op === "fence" && raw.mode === "FENCE_COMMITTED"))) {
        checkpoint = true; send({ type: "checkpoint", operation: op }); await untilAbort(ctx.signal);
      }
      return result;
    } } });
    try {
      https = createTaskPreviewHttpsService({ transport: { projectRef: REF, origin: "https://task-preview.invalid",
        issuer: "https://task-backend.invalid/", subject: "task-workspace-backend", keyId: "task-key-v1", publicKeyPem: raw.publicKeyPem, service },
      tls: { cert: raw.cert, key: raw.key, certSha256: sha(raw.cert),
        spkiSha256: sha(new X509Certificate(raw.cert).publicKey.export({ format: "der", type: "spki" })) },
      listen: { host: "127.0.0.1", port: 0 } });
    } finally { raw.key.fill(0); }
    send({ type: "constructed", address: https.address() ?? null });
    host = ownTaskPreviewServiceProcess(https, "TASK_PREVIEW_DEDICATED_NODE_PROCESS");
    await host.ready;
    send({ type: "ready", instanceId: https.instanceId, address: https.address() });
  })().catch(() => { process.exitCode = 1; if (host) void host.stop(); else if (process.connected) process.disconnect(); });
});
