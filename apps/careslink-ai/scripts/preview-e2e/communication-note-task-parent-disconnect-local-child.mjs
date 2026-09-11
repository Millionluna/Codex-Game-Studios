/** TEST ONLY: the live launcher owns a service's native IPC and separate pipes.
 * fd 4 is evidence/control only. Missing ChildProcess close stays missing; no
 * Node accounting patch, fabricated event or successor capability is provided. */
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
const fail = () => process.exit(1), deadline = setTimeout(fail, 12000);
let nonce, sequence = 0;

if (process.argv[2] === "launcher") {
  let child, control, retired = false, triggered = false, released = false, input = "", ipcSequence = 0, controlSequence = 0;
  const stream = () => ({ end: false, close: false, bytes: 0 });
  const observed = { disconnect: false, exit: false, code: null, signal: null, closeCount: 0, closeCode: null, closeSignal: null,
    stdout: stream(), stderr: stream(), control: stream(), controlInvalid: false };
  const send = (type, fields = {}, callback = () => {}) => {
    if (process.connected) process.send({ type, nonce, pid: process.pid, servicePid: child?.pid, seq: ++sequence, ...fields }, callback);
  };
  const invalid = () => { observed.controlInvalid = true; send("evidence-error", { source: "control" }); };
  const identify = (raw, seq) => {
    assert.ok(raw && typeof raw === "object" && !Array.isArray(raw));
    assert.equal(raw.nonce, nonce); assert.equal(raw.pid, child.pid); assert.equal(raw.seq, seq + 1);
    assert.equal(typeof raw.type, "string");
  };
  const attachStream = (name, pipe) => {
    pipe.on("error", fail);
    pipe.on("end", () => { observed[name].end = true; send("stream-end", { stream: name }); });
    pipe.on("close", () => { observed[name].close = true; send("stream-close", { stream: name }); });
    if (name !== "control") pipe.on("data", b => {
      observed[name].bytes += b.length; if (observed[name].bytes > 8192) fail();
    });
  };
  process.once("disconnect", () => { if (child && !observed.exit) child.kill("SIGTERM"); fail(); });
  process.on("message", raw => {
    try {
      assert.ok(raw && typeof raw === "object" && !Array.isArray(raw));
      if (!child) {
        assert.deepEqual(Object.keys(raw).sort(), ["cert", "key", "mode", "nonce", "publicKeyPem", "type"]);
        assert.equal(raw.type, "init"); assert.match(raw.nonce, /^[a-f0-9]{32}$/); nonce = raw.nonce;
        assert.ok(Buffer.isBuffer(raw.key));
        child = fork(process.argv[1], ["service"], { env, execArgv: [], serialization: "advanced",
          stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"] });
        child.on("error", fail);
        child.on("disconnect", () => { retired = true; observed.disconnect = true; send("native-disconnect"); });
        child.on("exit", (code, signal) => { observed.exit = true; observed.code = code; observed.signal = signal; send("native-exit", { code, signal }); });
        child.on("close", (code, signal) => {
          observed.closeCount++; observed.closeCode = code; observed.closeSignal = signal; send("native-close", { code, signal });
        });
        child.on("message", message => {
          try {
            identify(message, ipcSequence); ipcSequence = message.seq;
            if (message.type === "protocol-call") {
              if (retired) send("protocol-dropped", { id: message.id });
              else send("protocol-call", { id: message.id, op: message.op, data: message.data });
            } else send("service-ipc", { message });
          } catch { fail(); }
        });
        attachStream("stdout", child.stdout); attachStream("stderr", child.stderr);
        control = child.stdio[4]; attachStream("control", control); control.setEncoding("utf8");
        control.on("end", () => control.end());
        control.on("data", chunk => {
          input += chunk;
          if (input.length > 8192) { invalid(); input = ""; return; }
          while (input.includes("\n")) {
            const i = input.indexOf("\n"), line = input.slice(0, i); input = input.slice(i + 1);
            try {
              const message = JSON.parse(line); identify(message, controlSequence); controlSequence = message.seq;
              if (message.type === "exit-released") released = true;
              send("service-control", { message });
            } catch { invalid(); }
          }
        });
        control.on("end", () => { if (input) invalid(); });
        send("spawned", { node: process.version, platform: process.platform, arch: process.arch });
        child.send(raw, error => { raw.key.fill(0); if (error) fail(); }); return;
      }
      assert.equal(raw.nonce, nonce);
      if (raw.type === "protocol-reply") {
        assert.deepEqual(Object.keys(raw).sort(), ["failed", "id", "nonce", "type", "value"]);
        if (retired || !child.connected) { send("protocol-dropped", { id: raw.id }); return; }
        child.send(raw, error => { if (error && !retired) fail(); }); return;
      }
      if (raw.type === "control") {
        assert.deepEqual(Object.keys(raw).sort(), ["action", "challenge", "nonce", "type"]);
        assert.ok(["begin", "ping", "inspect", "release-exit"].includes(raw.action));
        control.write(JSON.stringify({ type: raw.action, nonce, challenge: raw.challenge }) + "\n"); return;
      }
      assert.deepEqual(Object.keys(raw).sort(), ["challenge", "nonce", "type"]);
      assert.match(raw.challenge, /^[a-f0-9]{32}$/);
      if (raw.type === "ping-launcher") { send("launcher-alive", { challenge: raw.challenge }); return; }
      if (raw.type === "snapshot") { send("snapshot", { challenge: raw.challenge, observed }); return; }
      if (raw.type === "ping-service") { child.send({ type: "ping", nonce, challenge: raw.challenge }); return; }
      if (["disconnect-parent", "disconnect-child"].includes(raw.type)) {
        assert.equal(triggered, false); assert.ok(child.connected); triggered = true; retired = true;
        send("trigger", { side: raw.type, challenge: raw.challenge });
        if (raw.type === "disconnect-parent") child.disconnect();
        else child.send({ type: "drop-ipc", nonce });
        return;
      }
      assert.equal(raw.type, "exit-launcher");
      assert.ok(released && observed.exit && observed.stdout.close && observed.stderr.close && observed.control.close);
      clearTimeout(deadline);
      send("launcher-released", { challenge: raw.challenge }, error => process.exit(error ? 1 : 0));
    } catch { fail(); }
  });
} else {
  const control = new Socket({ fd: 4, readable: true, writable: true }), replies = new Map();
  let input = "", initialized = false, controlSequence = 0, rpcSequence = 0, checkpoint = false, host, https, mode, outcome;
  const send = (type, fields = {}) => {
    if (process.connected) process.send({ type, nonce, pid: process.pid, seq: ++sequence, ...fields }, error => {
      if (error && process.connected) fail();
    });
  };
  const emit = (type, fields = {}) => control.write(JSON.stringify({ type, nonce, pid: process.pid, seq: ++controlSequence, ...fields }) + "\n");
  control.on("error", fail); control.on("end", fail); control.setEncoding("utf8");
  process.once("disconnect", () => {
    for (const pending of replies.values()) pending.reject(new Error("LOCAL_PROTOCOL_LOST"));
    replies.clear(); emit("ipc-lost");
  });
  function call(op, data) {
    if (!process.connected) return Promise.reject(new Error("LOCAL_PROTOCOL_LOST"));
    return new Promise((resolve, reject) => {
      const id = ++rpcSequence; replies.set(id, { resolve, reject });
      const safe = { ...data }; delete safe.verifier; send("protocol-call", { id, op, data: safe });
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
        assert.deepEqual(Object.keys(raw).sort(), ["challenge", "nonce", "type"]);
        assert.equal(raw.nonce, nonce); assert.match(raw.challenge, /^[a-f0-9]{32}$/);
        if (raw.type === "ping") emit("alive-control", { challenge: raw.challenge });
        else if (raw.type === "inspect") {
          assert.ok(host && https); emit("inspection", { challenge: raw.challenge, health: host.health(), address: https.address() ?? null,
            listening: process.getActiveResourcesInfo().includes("TCPServerWrap") });
        } else if (raw.type === "begin") {
          assert.ok(initialized && !host);
          host = ownTaskPreviewServiceProcess(https, "TASK_PREVIEW_DEDICATED_NODE_PROCESS");
          void host.finished.then(value => { outcome = value; emit("owner-finished", value); });
          void host.ready.then(() => emit("ready", { address: https.address(), instanceId: https.instanceId }), () => emit("startup-failed"));
        } else {
          assert.equal(raw.type, "release-exit"); assert.ok(outcome);
          clearTimeout(deadline); emit("exit-released", { challenge: raw.challenge });
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
        if (raw.type === "ping") { send("alive", { parentPid: process.ppid, challenge: raw.challenge }); return; }
        if (raw.type === "drop-ipc") { assert.ok(host); process.disconnect(); return; }
        assert.equal(raw.type, "protocol-reply");
        const pending = replies.get(raw.id); assert.ok(pending); replies.delete(raw.id);
        if (raw.failed) pending.reject(new Error("LOCAL_PROTOCOL_FAILED")); else pending.resolve(raw.value);
        return;
      }
      assert.deepEqual(Object.keys(raw).sort(), ["cert", "key", "mode", "nonce", "publicKeyPem", "type"]);
      assert.equal(raw.type, "init"); assert.match(raw.nonce, /^[a-f0-9]{32}$/);
      assert.ok(["NORMAL", "ISSUE_COMMITTED", "FENCE_COMMITTED", "CORRUPT_CONTROL"].includes(raw.mode));
      assert.ok(Buffer.isBuffer(raw.cert) && Buffer.isBuffer(raw.key)); nonce = raw.nonce; mode = raw.mode; initialized = true;
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
      send("constructed", { parentPid: process.ppid, address: https.address() ?? null });
    } catch { fail(); }
  });
}
