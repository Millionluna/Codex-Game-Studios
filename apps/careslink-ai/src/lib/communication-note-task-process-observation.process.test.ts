import { fork, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { connect, type Socket } from "node:net";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// Test-only orchestration. No production supervisor, Auth, SQL, TLS or lease
// recovery implementation is introduced by this feasibility probe.
type Message = { type: string; [key: string]: unknown };
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type Tracked = { child: ChildProcess; state: { exited: boolean; closed: boolean }; exited: Promise<Exit>;
  closed: Promise<Exit>; stderr: Buffer[]; errors: Error[] };
type Fixture = { parent: Tracked; ipc: ReturnType<typeof mailbox>; stdout: Buffer[]; control: Socket;
  events: ReturnType<typeof mailbox>; transport: Promise<void>; send: (type: string) => boolean;
  nonce: string; pid: number; port: number; watcher: ReturnType<typeof observe>;
  readonly transportClosed: boolean; done: boolean; released: boolean; successorStarted: boolean };
const env = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", NODE_ENV: "test" } as const;
const require = createRequire(import.meta.url);
const observerFile = resolve("scripts/preview-e2e/communication-note-task-process-observer.py");
const processes: Tracked[] = [];
const fixtures: Fixture[] = [];
let root: string, allServicesExited = true;

async function bound<T>(work: Promise<T>, ms = 16000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("PROBE_TIMEOUT_UNVERIFIED")), ms);
    })]);
  } finally { clearTimeout(timer); }
}
function track(child: ChildProcess): Tracked {
  const state = { exited: false, closed: false }, stderr: Buffer[] = [], errors: Error[] = [];
  const exited = new Promise<Exit>(r => child.once("exit", (code, signal) => { state.exited = true; r({ code, signal }); }));
  const closed = new Promise<Exit>(r => child.once("close", (code, signal) => { state.closed = true; r({ code, signal }); }));
  child.on("error", error => errors.push(error));
  child.stderr!.on("data", b => stderr.push(Buffer.from(b)));
  const result = { child, state, exited, closed, stderr, errors }; processes.push(result); return result;
}
function mailbox() {
  const messages: Message[] = [], listeners = new Set<() => void>();
  let error: Error | undefined, ended = false;
  const notify = () => listeners.forEach(f => f());
  return {
    messages,
    get failed() { return error !== undefined; },
    push(raw: unknown) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof (raw as Message).type !== "string") error = new Error("INVALID_PROBE_MESSAGE");
      else messages.push(raw as Message);
      notify();
    },
    fail() { error = new Error("INVALID_PROBE_CHANNEL"); notify(); },
    end() { ended = true; notify(); },
    async wait(type: string, after = 0) {
      let check!: () => void;
      try {
        return await bound(new Promise<Message>((resolve, reject) => {
          check = () => {
            const found = messages.slice(after).find(m => m.type === type);
            if (error) reject(error); else if (found) resolve(found);
            else if (ended) reject(new Error("PROBE_CHANNEL_ENDED: " + type + ": " + JSON.stringify(messages)));
          };
          listeners.add(check); check();
        }));
      } finally { listeners.delete(check); }
    },
  };
}
function lines(stream: Readable) {
  const box = mailbox(); let text = "";
  stream.setEncoding("utf8");
  stream.on("data", chunk => {
    text += chunk;
    if (text.length > 8192) { box.fail(); return; }
    while (text.includes("\n")) {
      const i = text.indexOf("\n");
      try { box.push(JSON.parse(text.slice(0, i))); } catch { box.fail(); }
      text = text.slice(i + 1);
    }
  });
  stream.on("error", () => box.fail());
  stream.on("end", () => { if (text) box.fail(); box.end(); });
  return box;
}
function observe(pid: number, nonce: string, timeoutMs = 15000) {
  const process = track(spawn("/usr/bin/python3", ["-I", "-B", observerFile], { env, stdio: ["pipe", "pipe", "pipe"] }));
  const box = lines(process.child.stdout!);
  process.child.stdin!.on("error", () => box.fail());
  process.child.stdin!.end(JSON.stringify({ pid, nonce, timeoutMs }) + "\n");
  return { process, box };
}
async function fixture(mode = "CONFIRMED", timeoutMs = 15000): Promise<Fixture> {
  const nonce = randomBytes(16).toString("hex");
  const parent = track(fork(join(root, "probe.cjs"), ["launcher"], { execArgv: [], env,
    stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"] }));
  const ipc = mailbox(); parent.child.on("message", raw => ipc.push(raw));
  const stdout: Buffer[] = []; parent.child.stdout!.on("data", b => stdout.push(Buffer.from(b)));
  const control = parent.child.stdio[4] as Socket, events = lines(control);
  control.on("end", () => control.end());
  let transportClosed = false;
  const transport = new Promise<void>(r => control.once("close", () => { transportClosed = true; r(); }));
  const send = (type: string) => control.write(JSON.stringify({ type, nonce }) + "\n");
  parent.child.send({ type: "init", nonce, mode });
  const ready = await ipc.wait("service-ready");
  expect(ready).toMatchObject({ nonce, parentPid: parent.child.pid });
  expect(Number.isSafeInteger(ready.pid)).toBe(true); expect(ready.pid).not.toBe(parent.child.pid);
  const pid = ready.pid as number, port = ready.port as number;
  const watcher = observe(pid, nonce, timeoutMs);
  const f = { parent, ipc, stdout, control, events, transport, send, nonce, pid, port, watcher,
    get transportClosed() { return transportClosed; }, done: false, released: false, successorStarted: false };
  fixtures.push(f);
  expect(await watcher.box.wait("armed")).toMatchObject({ pid, nonce, observerPid: watcher.process.child.pid });
  expect(watcher.process.child.pid).not.toBe(parent.child.pid);
  // Attest the original child after kernel registration and before killing its
  // launcher; a stale/reused PID cannot be accepted just because it was reported.
  parent.child.send({ type: "ping", nonce });
  expect(await ipc.wait("alive")).toMatchObject({ pid, nonce, parentPid: parent.child.pid });
  return f;
}
function successor(f: Fixture) {
  const kernel = f.watcher.box.messages.find(m => m.type === "kernel-exit");
  const outcome = f.events.messages.find(m => m.type === "owner-finished");
  if (f.ipc.failed || f.events.failed || f.watcher.box.failed ||
      f.parent.errors.length || f.watcher.process.errors.length ||
      !f.parent.state.exited || !f.parent.state.closed || !f.transportClosed ||
      !f.watcher.process.state.closed || f.watcher.box.messages.some(m => m.type === "unverified") ||
      kernel?.pid !== f.pid || kernel?.nonce !== f.nonce || kernel?.observerPid !== f.watcher.process.child.pid ||
      f.watcher.process.child.exitCode !== 0 || f.watcher.process.child.signalCode !== null ||
      outcome?.pid !== f.pid || outcome?.nonce !== f.nonce || outcome?.cleanupConfirmed !== true ||
      f.successorStarted) throw new Error("SUCCESSOR_UNVERIFIED");
  f.successorStarted = true;
  return fixture();
}
async function stopParent(f: Fixture, signal?: "SIGKILL") {
  if (signal) expect(f.parent.child.kill(signal)).toBe(true);
  else f.parent.child.send({ type: "exit-parent", nonce: f.nonce });
  const result = await bound(f.parent.exited);
  expect(result).toEqual(signal ? { code: null, signal } : { code: 0, signal: null });
  expect(await f.events.wait("ipc-lost")).toMatchObject({ pid: f.pid, nonce: f.nonce });
  expect(await f.events.wait("listener-closed")).toMatchObject({ pid: f.pid, nonce: f.nonce });
}
async function release(f: Fixture, watcher = f.watcher) {
  if (!f.events.messages.some(m => m.type === "owner-finished")) f.send("release-drain");
  const outcome = await f.events.wait("owner-finished");
  if (!f.released) { f.released = true; f.send("release-exit"); }
  expect(await watcher.box.wait("kernel-exit")).toMatchObject({ pid: f.pid, nonce: f.nonce, observerPid: watcher.process.child.pid });
  expect(await bound(watcher.process.closed)).toEqual({ code: 0, signal: null });
  await bound(Promise.all([f.parent.closed, f.transport])); f.done = true;
  expect(Buffer.concat(f.stdout).length).toBe(0); return outcome;
}
async function cleanup(f: Fixture) {
  if (f.watcher.box.messages.some(m => m.type === "kernel-exit" && m.pid === f.pid && m.nonce === f.nonce)) {
    await bound(Promise.all([f.parent.closed, f.transport, f.watcher.process.closed])); f.done = true; return;
  }
  // Teardown-only evidence never replaces the failed observer in successor().
  const watcher = observe(f.pid, f.nonce);
  expect(await watcher.box.wait("armed")).toMatchObject({ pid: f.pid, nonce: f.nonce, observerPid: watcher.process.child.pid });
  const index = f.events.messages.length; f.send("ping");
  expect(await f.events.wait("alive-control", index)).toMatchObject({ pid: f.pid, nonce: f.nonce });
  if (!f.parent.state.exited) await stopParent(f);
  await release(f, watcher);
}
async function portClosed(port: number) {
  const socket = connect({ host: "127.0.0.1", port });
  try {
    await bound(new Promise<void>((resolve, reject) => {
      socket.once("connect", () => reject(new Error("PROBE_LISTENER_OPEN")));
      socket.once("error", (e: NodeJS.ErrnoException) => e.code === "ECONNREFUSED" ? resolve() : reject(e));
    }));
  } finally { socket.destroy(); }
}

describe.skipIf(process.platform !== "darwin")("independent kernel process observation (cleanup simulated)", { timeout: 25000 }, () => {
  beforeAll(async () => {
    root = mkdtempSync("/private/tmp/cl-task-observe-"); expect(realpathSync(root)).toBe(root);
    await build({ entryPoints: ["scripts/preview-e2e/communication-note-task-process-probe-child.mjs"], outfile: join(root, "probe.cjs"),
      bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "silent", external: ["pg-native"],
      alias: { "server-only": require.resolve("next/dist/compiled/server-only/empty.js") } });
  });
  afterEach(async () => {
    const failures: unknown[] = [];
    for (const f of fixtures.splice(0)) {
      if (f.done) continue;
      try { await cleanup(f); } catch (error) { allServicesExited = false; failures.push(error); }
    }
    for (const p of processes.splice(0)) {
      if (!p.state.exited) p.child.kill("SIGTERM");
      try {
        await bound(p.closed); expect(p.errors).toEqual([]); expect(Buffer.concat(p.stderr).length).toBe(0);
      } catch (error) { failures.push(error); }
    }
    if (failures.length) throw failures[0];
  }, 25000);
  afterAll(() => {
    expect(allServicesExited).toBe(true);
    if (root) { expect(root).toMatch(/^\/private\/tmp\/cl-task-observe-[A-Za-z0-9]{6}$/);
      expect(realpathSync(root)).toBe(root); rmSync(root, { recursive: true }); }
  });
  it.each(["normal", "SIGKILL"] as const)("observes an orphan's actual exit after %s parent death before starting a successor", async mode => {
    const f = await fixture(); expect(() => successor(f)).toThrow("SUCCESSOR_UNVERIFIED");
    await stopParent(f, mode === "SIGKILL" ? "SIGKILL" : undefined); await portClosed(f.port);
    // The service is still alive behind a drain barrier. Neither real launcher
    // exit, IPC EOF nor a refused TCP connection counts as service exit.
    expect(f.watcher.box.messages.some(m => m.type === "kernel-exit")).toBe(false);
    expect(() => successor(f)).toThrow("SUCCESSOR_UNVERIFIED");
    f.send("release-drain"); expect(await f.events.wait("owner-finished")).toMatchObject({ state: "STOPPED", cleanupConfirmed: true });
    expect(f.watcher.box.messages.some(m => m.type === "kernel-exit")).toBe(false);
    expect(() => successor(f)).toThrow("SUCCESSOR_UNVERIFIED");
    f.released = true; f.send("release-exit");
    expect(await f.watcher.box.wait("kernel-exit")).toMatchObject({ pid: f.pid, nonce: f.nonce });
    expect(await bound(f.watcher.process.closed)).toEqual({ code: 0, signal: null });
    await bound(Promise.all([f.parent.closed, f.transport])); f.done = true;
    const next = await successor(f); expect(next.pid).not.toBe(f.pid);
    expect(() => successor(f)).toThrow("SUCCESSOR_UNVERIFIED");
    await stopParent(next); await release(next);
  });
  it("keeps cleanup unconfirmed even after kernel exit and actual descriptor closure", async () => {
    const f = await fixture("UNCONFIRMED"); await stopParent(f, "SIGKILL");
    expect(await release(f)).toMatchObject({ state: "FAILED", cleanupConfirmed: false });
    expect(() => successor(f)).toThrow("SUCCESSOR_UNVERIFIED");
  });
  it("rejects a corrupted completion channel after genuine process exit and cleanup evidence", async () => {
    const f = await fixture("CORRUPT_CONTROL"); await stopParent(f);
    expect(await release(f)).toMatchObject({ state: "STOPPED", cleanupConfirmed: true });
    expect(f.parent.state.closed && f.transportClosed).toBe(true);
    let admitted: Promise<Fixture> | undefined;
    try { expect(() => { admitted = successor(f); }).toThrow("SUCCESSOR_UNVERIFIED"); }
    finally {
      // A broken guard must still join any successor it actually started.
      if (admitted) { const next = await admitted; await stopParent(next); await release(next); }
    }
  });
  it("does not turn an observer timeout into permission to start a successor", async () => {
    const f = await fixture("CONFIRMED", 0);
    expect(await f.watcher.box.wait("unverified")).toMatchObject({ reason: "EXIT_UNCONFIRMED" });
    expect(await bound(f.watcher.process.closed)).toEqual({ code: 2, signal: null });
    await cleanup(f);
    expect(f.parent.state.closed && f.transportClosed).toBe(true);
    expect(f.events.messages.find(m => m.type === "owner-finished")?.cleanupConfirmed).toBe(true);
    expect(() => successor(f)).toThrow("SUCCESSOR_UNVERIFIED");
  });
  it("fails closed when the independently owned observer is actually killed", async () => {
    const f = await fixture(); expect(f.watcher.process.child.kill("SIGKILL")).toBe(true);
    expect(await bound(f.watcher.process.closed)).toEqual({ code: null, signal: "SIGKILL" });
    await cleanup(f);
    expect(f.parent.state.closed && f.transportClosed).toBe(true);
    expect(f.events.messages.find(m => m.type === "owner-finished")?.cleanupConfirmed).toBe(true);
    expect(() => successor(f)).toThrow("SUCCESSOR_UNVERIFIED");
  });
  it("keeps both probe entry points outside the disabled product runtime", () => {
    expect(readFileSync("src/lib/communication-note-workspace-runtime.server.ts", "utf8")).toContain("HOSTED_WORKSPACE_READ_BINDING = undefined");
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
    expect(walk("src").filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.includes(".test.") &&
      /task-process-probe-child|task-process-observer/.test(readFileSync(p, "utf8")))).toEqual([]);
  });
});
