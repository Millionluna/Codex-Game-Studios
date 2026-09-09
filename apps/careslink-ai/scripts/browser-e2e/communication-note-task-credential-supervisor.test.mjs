import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { taskCredentialWatchDeadline, TASK_CREDENTIAL_MAX_RESTARTS, installTaskCredentialSupervisor } from "./communication-note-task-credential.supervisor.mjs";
import { assertTaskCredentialRoot, attestTaskCredentialDatabase } from "./communication-note-task-credential.database.mjs";
const fs = vi.hoisted(() => ({ realpath: vi.fn(async p => p), lstat: vi.fn(async () => ({ isDirectory: () => true, uid: process.getuid(), mode: 0o40700 })) }));
vi.mock("node:fs/promises", () => ({ ...fs, chmod: vi.fn(), unlink: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); });
const root = "/private/tmp/cl-job-browser-abc123";
describe("owned credential supervision policy", () => {
  it.each([-1000, 0, 10000, 60000, 900000])("caps remaining expiry %s without extension", remaining => {
    expect(taskCredentialWatchDeadline(new Date(100000 + remaining), 100000, 50)).toBe(50 + Math.min(60000, Math.max(0, remaining)));
  });
  it.each(["invalid", undefined, Infinity])("rejects malformed expiry %s", value => {
    expect(() => taskCredentialWatchDeadline(value, 1000, 0)).toThrow();
  });
  it.each(["/private/tmp", "/tmp/cl-job-browser-abc123", "/", root + "/pg", root + "7"])("rejects a non-owned root %s before any connection", async path => {
    const open = vi.fn(); await expect(installTaskCredentialSupervisor(path, open, "x".repeat(43))).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
  it("rejects symlinked, foreign-owned or public directories", async () => {
    fs.realpath.mockResolvedValueOnce("/private/tmp/other"); await expect(assertTaskCredentialRoot(root)).rejects.toThrow();
    fs.lstat.mockResolvedValueOnce({ isDirectory: () => true, uid: process.getuid() + 1, mode: 0o40700 });
    await expect(assertTaskCredentialRoot(root)).rejects.toThrow();
    fs.lstat.mockResolvedValueOnce({ isDirectory: () => true, uid: process.getuid(), mode: 0o40755 });
    await expect(assertTaskCredentialRoot(root)).rejects.toThrow();
  });
  it.each(["data", "cluster", "listeners", "major", "db", "login", "unix_only"])("rejects database attestation %s", async field => {
    const row = { data: root + "/pg/data", cluster: "careslink-review-browser-pg16", listeners: "", major: 16, db: "postgres", login: "review_test_bootstrap", unix_only: true };
    row[field] = "wrong"; await expect(attestTaskCredentialDatabase({ query: async () => ({ rows: [row] }) }, root)).rejects.toThrow();
  });
  it.each(["short", "x".repeat(43) + "\n", "", undefined])("rejects invalid capability before opening the DB", async capability => {
    const open = vi.fn(); await expect(installTaskCredentialSupervisor(root, open, capability)).rejects.toThrow(); expect(open).not.toHaveBeenCalled();
  });
  it("keeps supervision bounded, operator-only and absent from Next's copied source", () => {
    expect(TASK_CREDENTIAL_MAX_RESTARTS).toBe(6);
    const code = readFileSync(new URL("./communication-note-task-credential.supervisor.mjs", import.meta.url), "utf8");
    expect(code).toContain('current.child.kill("SIGKILL")'); expect(code).toContain("await bounded(current.closed");
    expect(code).toContain("where application_name=$1"); expect(code).toContain("restarts < TASK_CREDENTIAL_MAX_RESTARTS");
    expect(code).not.toMatch(/\.\.\.process\.env|process\.kill\(|execSync|spawnSync|\.supabase\.co|SUPABASE_SERVICE_ROLE/);
    const runner = readFileSync(new URL("./communication-note-recovery.mjs", import.meta.url), "utf8");
    expect(runner).not.toMatch(/emit\([^\n]+(?:credential\.worker|credential\.supervisor|credential\.database)/);
    const worker = readFileSync(new URL("./communication-note-task-credential.worker.mjs", import.meta.url), "utf8");
    expect(worker).toContain('port: 15437'); expect(worker).toContain('process.on("disconnect", shutdown)');
    expect(worker).not.toMatch(/process\.argv|process\.env|console\.error|console\.log/);
  });
});
