/** TEST ONLY. Real launcher/IPC/TCP/process owner; simulated service cleanup.
 * fd 3 belongs to the launcher. fd 4 is an inherited, independent test-control
 * channel. Its continued existence is NOT an exit or cleanup acknowledgment. */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createServer, Socket } from "node:net";
import { ownTaskPreviewServiceProcess } from "../../src/lib/communication-note-task-preview-host.server.ts";

assert.equal(process.argv.length, 3);
assert.ok(["launcher", "service"].includes(process.argv[2]));
assert.equal(typeof process.send, "function");
assert.equal(process.env.CARESLINK_TASK_ISSUER_LOCAL_SOCKET, undefined);
const isolatedEnv = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" };
const send = data => { if (process.connected) process.send(data, () => {}); };
const fail = () => { process.exitCode = 1; process.exit(1); };
// Fixture-only escape hatch. Expiry is failure, never proof of graceful cleanup.
const deadline = setTimeout(fail, 12000);

if (process.argv[2] === "launcher") {
  let child, nonce;
  process.once("disconnect", () => { if (child) child.kill("SIGTERM"); fail(); });
  process.on("message", raw => {
    try {
      assert.ok(raw && typeof raw === "object");
      if (!child) {
        assert.deepEqual(Object.keys(raw).sort(), ["mode", "nonce", "type"]);
        assert.equal(raw.type, "init"); assert.match(raw.nonce, /^[a-f0-9]{32}$/);
        assert.ok(["CONFIRMED", "UNCONFIRMED", "CORRUPT_CONTROL"].includes(raw.mode)); nonce = raw.nonce;
        child = fork(process.argv[1], ["service"], { execArgv: [], env: isolatedEnv,
          stdio: ["ignore", "inherit", "inherit", "ipc", 4] });
        child.on("error", fail);
        child.on("message", message => {
          if (message?.nonce !== nonce || message?.pid !== child.pid) return fail();
          send(message);
        });
        child.send(raw); return;
      }
      assert.deepEqual(Object.keys(raw).sort(), ["nonce", "type"]); assert.equal(raw.nonce, nonce);
      if (raw.type === "ping") { child.send(raw); return; }
      assert.equal(raw.type, "exit-parent");
      // Genuine launcher termination, without a prior child.disconnect() call.
      process.exit(0);
    } catch { fail(); }
  });
} else {
  const control = new Socket({ fd: 4, readable: true, writable: true });
  let nonce, mode, initialized = false, state = "NEW", stopWork, releaseDrain, finish;
  const drain = new Promise(resolve => { releaseDrain = resolve; });
  const finished = new Promise(resolve => { finish = resolve; });
  const server = createServer(socket => socket.destroy());
  const emit = (type, extra = {}) => control.write(JSON.stringify({ type, nonce, pid: process.pid, ...extra }) + "\n");
  control.on("error", fail); control.on("end", fail);
  server.on("error", fail);
  let input = "", host;
  control.setEncoding("utf8");
  control.on("data", chunk => {
    try {
      input += chunk; assert.ok(input.length <= 4096);
      while (input.includes("\n")) {
        const index = input.indexOf("\n"), raw = JSON.parse(input.slice(0, index)); input = input.slice(index + 1);
        assert.deepEqual(Object.keys(raw).sort(), ["nonce", "type"]); assert.equal(raw.nonce, nonce);
        if (raw.type === "ping") { emit("alive-control"); }
        else if (raw.type === "release-drain") { assert.equal(state, "DRAINING"); releaseDrain(); }
        else {
          assert.equal(raw.type, "release-exit"); assert.ok(["STOPPED", "FAILED"].includes(state));
          clearTimeout(deadline); control.removeAllListeners("end");
          // Corrupt the real stream after cleanup evidence, before actual EOF.
          if (mode === "CORRUPT_CONTROL") control.write("{invalid-json}\n");
          control.end(() => control.destroy());
        }
      }
    } catch { fail(); }
  });
  process.once("disconnect", () => { if (!initialized) fail(); else emit("ipc-lost"); });
  process.on("message", raw => {
    void (async () => {
      assert.ok(raw && typeof raw === "object");
      if (initialized) {
        assert.deepEqual(Object.keys(raw).sort(), ["nonce", "type"]);
        assert.equal(raw.nonce, nonce); assert.equal(raw.type, "ping");
        send({ type: "alive", nonce, pid: process.pid, parentPid: process.ppid }); return;
      }
      assert.deepEqual(Object.keys(raw).sort(), ["mode", "nonce", "type"]);
      assert.equal(raw.type, "init"); assert.match(raw.nonce, /^[a-f0-9]{32}$/);
      assert.ok(["CONFIRMED", "UNCONFIRMED", "CORRUPT_CONTROL"].includes(raw.mode));
      nonce = raw.nonce; mode = raw.mode; initialized = true;
      const service = {
        health: () => ({ state, cleanupConfirmed: state === "STOPPED" }), finished,
        custody: { issue: async () => { throw new Error("UNUSED"); }, revoke: async () => { throw new Error("UNUSED"); } },
        async start() {
          state = "STARTING";
          await new Promise(resolve => server.listen({ host: "127.0.0.1", port: 0 }, resolve)); state = "READY";
        },
        stop() {
          return stopWork ??= (async () => {
            state = "DRAINING";
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            emit("listener-closed"); await drain;
            const cleanupConfirmed = mode !== "UNCONFIRMED"; state = cleanupConfirmed ? "STOPPED" : "FAILED";
            finish({ state, cleanupConfirmed });
          })();
        },
      };
      host = ownTaskPreviewServiceProcess(service, "TASK_PREVIEW_DEDICATED_NODE_PROCESS");
      void host.finished.then(outcome => emit("owner-finished", { cleanupConfirmed: outcome.cleanupConfirmed, state: outcome.state }));
      await host.ready;
      send({ type: "service-ready", nonce, pid: process.pid, parentPid: process.ppid, port: server.address().port });
    })().catch(fail);
  });
}
