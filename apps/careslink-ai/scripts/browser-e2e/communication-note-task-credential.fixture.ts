/** TEST ONLY. Private Unix IPC, not an HTTP route or database operator. */
import "server-only";
import { lstat, realpath } from "node:fs/promises";
import { request } from "node:http";

export async function requestTaskCredential(root: string, capability: string, operation: "issue" | "revoke", body: unknown): Promise<unknown> {
  if (!/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/.test(root) || !/^[A-Za-z0-9_-]{43}$/.test(capability) ||
    !["issue", "revoke"].includes(operation) || await realpath(root) !== root) throw new Error("Local task credential unavailable");
  const socketPath = root + "/task-credential.sock", stat = await lstat(socketPath);
  if (!stat.isSocket() || stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0) throw new Error("Local task credential unavailable");
  const data = JSON.stringify(body);
  if (Buffer.byteLength(data) > 1024) throw new Error("Local task credential unavailable");
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Local task credential unavailable"));
    const req = request({ socketPath, path: "/" + operation, method: "POST", agent: false,
      headers: { Authorization: "Bearer " + capability, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, res => {
      let bytes = 0, text = "";
      res.on("data", chunk => { bytes += chunk.length; if (bytes > 2048) { req.destroy(); fail(); } else text += chunk.toString("utf8"); });
      res.on("error", fail); res.on("aborted", fail);
      res.on("end", () => { try { if (res.statusCode !== 200) throw new Error(); resolve(JSON.parse(text)); } catch { fail(); } finally { text = ""; } });
    });
    // Independent of the browser abort, so issuance uncertainty can be revoked.
    const timer = setTimeout(() => { req.destroy(); fail(); }, 8000);
    req.once("close", () => clearTimeout(timer)); req.on("error", fail); req.end(data);
  });
}
