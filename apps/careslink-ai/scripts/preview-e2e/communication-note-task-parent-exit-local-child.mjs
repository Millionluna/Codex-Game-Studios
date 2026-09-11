/** TEST ONLY: actual Workspace TLS service behind a disposable IPC launcher.
 * The controller retains a simulated ledger. fd 4 carries lifecycle evidence
 * and barriers only; it NEVER replaces the broker IPC lost with the launcher. */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { Socket } from "node:net";
import { createCommunicationNoteTaskPreviewService } from "../../src/lib/communication-note-task-preview-service.server.ts";
import { createTaskPreviewHttpsService } from "../../src/lib/communication-note-task-preview-https.server.ts";
import { ownTaskPreviewServiceProcess } from "../../src/lib/communication-note-task-preview-host.server.ts";

assert.equal(process.argv.length, 3);
assert.ok(["launcher", "service"].includes(process.argv[2]));
assert.equal(typeof process.send, "function");
assert.equal(process.env.CARESLINK_TASK_ISSUER_LOCAL_SOCKET, undefined);
const env = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" };
let nonce;
const send = value => { if (process.connected) process.send({ ...value, nonce, pid: process.pid }, () => {}); };
const fail = () => process.exit(1);
// Forced expiry is failure. A valid exit release must cancel this deadline and
// emit exit-released; kernel exit alone never turns fixture expiry into success.
const deadline = setTimeout(fail, 12000);

if (process.argv[2] === "launcher") {
  let child;
  process.once("disconnect", () => { if (child) child.kill("SIGTERM"); fail(); });
  process.on("message", raw => {
    try {
      assert.ok(raw && typeof raw === "object" && !Array.isArray(raw));
      if (!child) {
        assert.equal(raw.type, "init"); assert.match(raw.nonce, /^[a-f0-9]{32}$/); nonce = raw.nonce;
        child = fork(process.argv[1], ["service"], { env, execArgv: [], serialization: "advanced",
          stdio: ["ignore", "inherit", "inherit", "ipc", 4] });
        child.on("error", fail);
        child.on("message", message => {
          if (message?.nonce !== nonce || message?.pid !== child.pid) return fail();
          if (process.connected) process.send(message, () => {});
        });
        send({ type: "spawned", servicePid: child.pid });
        child.send(raw, () => raw.key.fill(0)); return;
      }
      assert.equal(raw.nonce, nonce);
      if (raw.type === "exit-parent") {
        assert.deepEqual(Object.keys(raw).sort(), ["nonce", "type"]); process.exit(0);
      }
      assert.ok(["ping", "protocol-reply"].includes(raw.type));
      if (!child.connected) return fail();
      child.send(raw, error => { if (error) fail(); });
    } catch { fail(); }
  });
} else {
  const control = new Socket({ fd: 4, readable: true, writable: true });
  const replies = new Map();
  let input = "", initialized = false, sequence = 0, checkpoint = false, host, https, mode, outcome;
  const emit = (type, fields = {}) => control.write(JSON.stringify({ type, nonce, pid: process.pid, ...fields }) + "\n");
  control.on("error", fail); control.on("end", fail); control.setEncoding("utf8");
  process.once("disconnect", () => {
    for (const pending of replies.values()) pending.reject(new Error("LOCAL_PROTOCOL_LOST"));
    replies.clear(); emit("ipc-lost");
  });
  function call(op, data) {
    if (!process.connected) return Promise.reject(new Error("LOCAL_PROTOCOL_LOST"));
    return new Promise((resolve, reject) => {
      const id = ++sequence; replies.set(id, { resolve, reject });
      const safe = { ...data }; delete safe.verifier;
      send({ type: "protocol-call", id, op, data: safe });
    });
  }
  function untilAbort(signal) {
    return new Promise((_, reject) => {
      const abort = () => reject(new Error("LOCAL_CHECKPOINT_ABORTED"));
      signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    });
  }
  control.on("data", chunk => {
    try {
      input += chunk; assert.ok(input.length <= 4096);
      while (input.includes("\n")) {
        const i = input.indexOf("\n"), raw = JSON.parse(input.slice(0, i)); input = input.slice(i + 1);
        assert.deepEqual(Object.keys(raw).sort(), ["nonce", "type"]); assert.equal(raw.nonce, nonce);
        if (raw.type === "ping") emit("alive-control");
        else if (raw.type === "inspect") {
          assert.ok(host && https);
          emit("inspection", { health: host.health(), address: https.address() ?? null,
            listening: process.getActiveResourcesInfo().includes("TCPServerWrap") });
        } else if (raw.type === "begin") {
          assert.ok(initialized && !host);
          host = ownTaskPreviewServiceProcess(https, "TASK_PREVIEW_DEDICATED_NODE_PROCESS");
          void host.finished.then(value => { outcome = value; emit("owner-finished", value); });
          void host.ready.then(() => emit("ready", { address: https.address(), instanceId: https.instanceId }),
            () => emit("startup-failed"));
        } else if (raw.type === "stop") { assert.ok(host); void host.stop(); }
        else {
          assert.equal(raw.type, "release-exit"); assert.ok(outcome);
          clearTimeout(deadline); emit("exit-released");
          if (mode === "CORRUPT_CONTROL") control.write("{invalid-json}\n");
          control.removeAllListeners("end"); control.end(() => control.destroy());
        }
      }
    } catch { fail(); }
  });
  process.on("message", raw => {
    try {
      assert.ok(raw && typeof raw === "object" && !Array.isArray(raw));
      if (initialized) {
        assert.equal(raw.nonce, nonce);
        if (raw.type === "ping") { send({ type: "alive", parentPid: process.ppid }); return; }
        assert.equal(raw.type, "protocol-reply");
        const pending = replies.get(raw.id); assert.ok(pending); replies.delete(raw.id);
        if (raw.failed) pending.reject(new Error("LOCAL_PROTOCOL_FAILED")); else pending.resolve(raw.value);
        return;
      }
      assert.deepEqual(Object.keys(raw).sort(), ["cert", "key", "mode", "nonce", "publicKeyPem", "type"]);
      assert.equal(raw.type, "init"); assert.match(raw.nonce, /^[a-f0-9]{32}$/);
      assert.ok(["NORMAL", "ISSUE_COMMITTED", "FENCE_COMMITTED", "CORRUPT_CONTROL"].includes(raw.mode));
      assert.ok(Buffer.isBuffer(raw.cert) && Buffer.isBuffer(raw.key));
      nonce = raw.nonce; mode = raw.mode; initialized = true;
      const service = createCommunicationNoteTaskPreviewService({ projectRef: "abcdefghijklmnopqrst", broker: { async call(op, data, ctx) {
        const result = await call(op, data);
        if (!checkpoint && ((op === "issue" && mode === "ISSUE_COMMITTED") || (op === "fence" && mode === "FENCE_COMMITTED"))) {
          checkpoint = true; emit("checkpoint", { operation: op }); await untilAbort(ctx.signal);
        }
        return result;
      } } });
      const sha = bytes => createHash("sha256").update(bytes).digest("hex");
      try {
        https = createTaskPreviewHttpsService({ transport: { projectRef: "abcdefghijklmnopqrst", origin: "https://task-preview.invalid",
          issuer: "https://task-backend.invalid/", subject: "task-workspace-backend", keyId: "task-key-v1", publicKeyPem: raw.publicKeyPem, service },
        tls: { cert: raw.cert, key: raw.key, certSha256: sha(raw.cert),
          spkiSha256: sha(new X509Certificate(raw.cert).publicKey.export({ format: "der", type: "spki" })) },
        listen: { host: "127.0.0.1", port: 0 } });
      } finally { raw.key.fill(0); }
      send({ type: "constructed", parentPid: process.ppid, address: https.address() ?? null });
    } catch { fail(); }
  });
}
