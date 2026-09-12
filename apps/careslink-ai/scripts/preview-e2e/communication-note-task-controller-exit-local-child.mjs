/** TEST ONLY: T owns R, R owns L, L owns the actual Workspace/TLS service S.
 * Audit sockets carry evidence and fixed barriers, never broker replies.
 * Descendant kernel exit is not an original parent's ChildProcess close. */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { connect } from "node:net";
import { createCommunicationNoteTaskPreviewService } from "../../src/lib/communication-note-task-preview-service.server.ts";
import { createTaskPreviewHttpsService } from "../../src/lib/communication-note-task-preview-https.server.ts";
import { ownTaskPreviewServiceProcess } from "../../src/lib/communication-note-task-preview-host.server.ts";

const role = process.argv[2], roles = ["controller", "launcher", "service"];
assert.equal(process.argv.length, 3); assert.ok(roles.includes(role));
assert.equal(typeof process.send, "function");
assert.equal(process.env.CARESLINK_TASK_ISSUER_LOCAL_SOCKET, undefined);
const env = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" };
const fail = (reason = "FIXTURE_FAILED") => {
  if (role !== "service" || !audit?.writable) process.exit(1);
  const known = typeof reason === "string" ? reason : "FIXTURE_FAILED";
  audit.write(JSON.stringify(packet("fixture-failed", ++auditSequence, { reason: known })) + "\n", () => process.exit(1));
  setTimeout(() => process.exit(1), 100);
}, deadline = setTimeout(() => fail("FIXTURE_DEADLINE"), 12000);
let nonce, ipcSequence = 0, auditSequence = 0, audit, initialized = false, child, childSequence = 0;
let host, https, mode, outcome, checkpoint = false, rpcSequence = 0;
const replies = new Map();
const packet = (type, seq, fields) => ({ type, nonce, role, pid: process.pid, seq, ...fields });
function send(type, fields = {}, rejected = () => fail("IPC_SEND_FAILED")) {
  if (process.connected) process.send(packet(type, ++ipcSequence, fields), error => {
    if (error) rejected();
  });
}
function emit(type, fields = {}) { audit.write(JSON.stringify(packet(type, ++auditSequence, fields)) + "\n"); }
function keys(raw, expected) { assert.deepEqual(Object.keys(raw).sort(), expected.sort()); }
function init(raw) {
  keys(raw, ["type", "nonce", "cert", "key", "publicKeyPem", "mode", "auditPaths"]);
  assert.equal(raw.type, "init"); assert.match(raw.nonce, /^[a-f0-9]{32}$/);
  assert.ok(Buffer.isBuffer(raw.cert) && Buffer.isBuffer(raw.key));
  assert.ok(["NORMAL", "ISSUE_COMMITTED", "FENCE_COMMITTED", "BAD_NONCE", "BAD_SEQUENCE"].includes(raw.mode));
  keys(raw.auditPaths, ["launcher", "service"]);
  for (const path of Object.values(raw.auditPaths)) assert.match(path, /^\/private\/tmp\/cl-task-controller-[A-Za-z0-9]{6}\/\d+-[ls]\.sock$/);
  nonce = raw.nonce; mode = raw.mode; initialized = true;
}
function receiveLines(socket, action) {
  let input = ""; socket.setEncoding("utf8");
  socket.on("data", chunk => {
    try {
      input += chunk; assert.ok(input.length <= 4096);
      while (input.includes("\n")) {
        const i = input.indexOf("\n"), raw = JSON.parse(input.slice(0, i)); input = input.slice(i + 1);
        keys(raw, ["type", "nonce", "challenge"]); assert.equal(raw.nonce, nonce);
        assert.match(raw.challenge, /^[a-f0-9]{32}$/); action(raw);
      }
    } catch { fail(); }
  });
}
function openAudit(path) {
  audit = connect(path); audit.on("error", fail); audit.on("end", fail);
  audit.once("connect", () => emit("hello", { parentPid: process.ppid }));
  receiveLines(audit, raw => {
    if (raw.type === "ping") { emit("alive", { challenge: raw.challenge }); return; }
    assert.equal(role, "service");
    if (raw.type === "begin") {
      assert.ok(https && !host);
      host = ownTaskPreviewServiceProcess(https, "TASK_PREVIEW_DEDICATED_NODE_PROCESS");
      void host.finished.then(value => { outcome = value; emit("owner-finished", value); });
      void host.ready.then(() => emit("ready", { address: https.address(), instanceId: https.instanceId }), () => emit("startup-failed"));
    } else if (raw.type === "inspect") {
      assert.ok(host); emit("inspection", { challenge: raw.challenge, health: host.health(), address: https.address() ?? null,
        listening: process.getActiveResourcesInfo().includes("TCPServerWrap") });
    } else {
      assert.equal(raw.type, "release-exit"); assert.ok(outcome);
      clearTimeout(deadline); emit("exit-released", { challenge: raw.challenge });
      // Faults come from the real bound socket after the valid barrier release.
      if (mode === "BAD_NONCE") audit.write(JSON.stringify(packet("alive", ++auditSequence,
        { nonce: "0".repeat(32), challenge: raw.challenge })) + "\n");
      if (mode === "BAD_SEQUENCE") audit.write(JSON.stringify(packet("alive", auditSequence,
        { challenge: raw.challenge })) + "\n");
      audit.removeAllListeners("end"); audit.end(() => audit.destroy());
    }
  });
}
function launch(raw) {
  const nextRole = role === "controller" ? "launcher" : "service";
  child = fork(process.argv[1], [nextRole], { env, execArgv: [], serialization: "advanced",
    stdio: ["ignore", "pipe", "pipe", "ipc"] });
  child.on("error", fail);
  for (const pipe of [child.stdout, child.stderr]) {
    pipe.on("error", fail); pipe.on("data", fail); // Fixture descendants must not write arbitrary output.
  }
  const event = (type, code, signal) => {
    const fields = { childRole: nextRole, childPid: child.pid, code, signal };
    if (role === "launcher") emit(type, fields); else send(type, fields);
  };
  child.on("exit", (code, signal) => event("child-exit", code, signal));
  child.on("close", (code, signal) => event("child-close", code, signal));
  child.on("message", message => {
    try {
      assert.equal(message.nonce, nonce); assert.equal(message.role, nextRole);
      assert.equal(message.pid, child.pid); assert.equal(message.seq, childSequence + 1); childSequence++;
      // A failed upstream write may precede native disconnect. Leave the
      // owned-child stop policy to that event instead of exiting early here.
      send("forward", { message }, () => {});
    } catch { fail(); }
  });
  send("child-spawned", { childRole: nextRole, childPid: child.pid });
  child.send(raw, error => { raw.key.fill(0); if (error) fail(); });
}
function call(op, data) {
  if (!process.connected) return Promise.reject(new Error("LOCAL_PROTOCOL_LOST"));
  return new Promise((resolve, reject) => {
    const id = ++rpcSequence; replies.set(id, { resolve, reject });
    const safe = { ...data }; delete safe.verifier;
    send("protocol-call", { id, op, data: safe }, () => {
      // connected may still be true while the kernel IPC endpoint is gone.
      // Reject the RPC; the actual service/owner must finish its failed drain.
      const pending = replies.get(id);
      if (pending) { replies.delete(id); pending.reject(new Error("LOCAL_PROTOCOL_LOST")); }
      emit("broker-send-failed", { id });
    });
  });
}
function untilAbort(signal) {
  return new Promise((_, reject) => {
    const abort = () => reject(new Error("LOCAL_CHECKPOINT_ABORTED"));
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  });
}
function construct(raw) {
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
}
process.once("disconnect", () => {
  if (role !== "service") {
    // Existing local launcher policy: signal its owned child, then fail NOW.
    // In particular L does not wait for S's exit or for an audit acknowledgment.
    if (child) child.kill("SIGTERM"); fail();
  }
  for (const pending of replies.values()) pending.reject(new Error("LOCAL_PROTOCOL_LOST"));
  replies.clear(); emit("ipc-lost");
});
process.on("message", raw => {
  try {
    assert.ok(raw && typeof raw === "object" && !Array.isArray(raw));
    if (!initialized) {
      init(raw);
      if (role !== "controller") openAudit(raw.auditPaths[role]);
      if (role === "service") construct(raw); else launch(raw);
      send("constructed", { parentPid: process.ppid, node: process.version, platform: process.platform, arch: process.arch }); return;
    }
    assert.equal(raw.nonce, nonce);
    if (raw.type === "exit-controller") {
      keys(raw, ["type", "nonce", "challenge"]); assert.equal(role, "controller");
      assert.match(raw.challenge, /^[a-f0-9]{32}$/); process.exit(0);
    }
    if (raw.type === "ping") {
      keys(raw, ["type", "nonce", "challenge", "target"]); assert.ok(roles.includes(raw.target));
      assert.match(raw.challenge, /^[a-f0-9]{32}$/);
      if (raw.target === role) { send("alive", { parentPid: process.ppid, challenge: raw.challenge }); return; }
      assert.ok(child?.connected); child.send(raw, error => { if (error) fail(); }); return;
    }
    keys(raw, ["type", "nonce", "id", "value", "failed"]); assert.equal(raw.type, "protocol-reply");
    if (role !== "service") {
      if (child.connected) child.send(raw, error => { if (error && child.connected) fail(); });
      return;
    }
    const pending = replies.get(raw.id); assert.ok(pending); replies.delete(raw.id);
    if (raw.failed) pending.reject(new Error("LOCAL_PROTOCOL_FAILED")); else pending.resolve(raw.value);
  } catch { fail("IPC_MESSAGE_INVALID"); }
});
