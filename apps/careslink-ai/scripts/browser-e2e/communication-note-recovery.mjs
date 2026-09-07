import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const app = fileURLToPath(new URL("../../", import.meta.url));
const port = 3395, host = "127.0.0.1";
const prefix = "/private/tmp/cl-job-browser-";
let root, child, stopped = false;
const sourceHashes = new Map();
const copy = async (source, target) => {
  await mkdir(join(root, target, ".."), { recursive: true });
  await cp(join(app, source), join(root, target), { recursive: true,
    filter: path => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) });
};
const emit = async (path, source) => { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), source); };
const tracked = ["src/lib/supabase-server.ts", "src/app/ai-documents/communication-note/jobs/[jobId]/page.tsx",
  "src/app/api/ai-documents/communication-note/jobs/[jobId]/route.ts", "src/app/api/ai-documents/communication-note/documents/[documentId]/route.ts"];

async function cleanup() {
  if (stopped) return; stopped = true;
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL"); await new Promise(resolve => child.once("exit", resolve));
    }
  }
  for (const [path, contents] of sourceHashes) {
    if ((await readFile(join(app, path), "utf8")) !== contents) throw new Error("Source isolation verification failed");
  }
  if (root && /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/.test(root) && await realpath(root) === root) {
    await rm(root, { recursive: true }); // Only this run's owned copy, after child exit.
    console.log(JSON.stringify({ stage: "browser-fixture-cleanup", stopped: true, removed: true, sourceUnchanged: true }));
  }
}
try {
  // Fail on an occupied port; never reuse or terminate another local service.
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(port, host, resolve); });
  await new Promise(resolve => probe.close(resolve));
  for (const path of tracked) sourceHashes.set(path, await readFile(join(app, path), "utf8"));
  root = await mkdtemp(prefix);
  await copy("src/lib", "src/lib"); await copy("src/components", "src/components");
  await copy("src/app/ai-documents/communication-note/jobs", "src/app/ai-documents/communication-note/jobs");
  await copy("src/app/ai-documents/communication-note/documents", "src/app/ai-documents/communication-note/documents");
  for (const path of ["src/app/globals.css", "src/app/layout.tsx", "next.config.ts", "tsconfig.json", "postcss.config.mjs"]) await copy(path, path);
  await copy("public/careslink-ai-logo-reverse.svg", "public/careslink-ai-logo-reverse.svg");
  await emit("src/lib/__browser-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-recovery.fixture.ts"), "utf8"))
    .replaceAll('"../../src/lib/', '"./'));
  await symlink(join(app, "node_modules"), join(root, "node_modules"), "dir");
  await emit("package.json", JSON.stringify({ name: "careslink-local-browser-fixture", private: true,
    dependencies: (JSON.parse(await readFile(join(app, "package.json"), "utf8"))).dependencies }));
  await emit("src/lib/supabase-server.ts", `// TEST ONLY, no real Supabase client or credentials.
export { createFixtureAuthClient as createCareslinkServerSupabaseClient } from "./__browser-fixture";
export { getSupabasePublicAuthConfig } from "./supabase-public-auth-config";
export type CareslinkServerSupabaseClient = Awaited<ReturnType<typeof import("./__browser-fixture").createFixtureAuthClient>>;
`);
  await emit("src/components/safe-vercel-analytics.tsx", "export function SafeVercelAnalytics() { return null; }\n");
  for (const [segment, param, handler] of [["jobs", "jobId", "readFixtureJob"], ["documents", "documentId", "readFixtureDocument"]]) {
    await emit(`src/app/api/ai-documents/communication-note/${segment}/[${param}]/route.ts`, `import { ${handler} } from "@/lib/__browser-fixture";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ ${param}: string }> }) {
  return ${handler}(request, (await context.params).${param});
}
`);
  }
  await emit("src/app/page.tsx", `import { JOB, MODES } from "@/lib/__browser-fixture";
export default function FixtureControls() { return <main style={{padding:32}}>
<h1>Local synthetic recovery test</h1><p>No real login, database, AI or Points. Controls exist only in this temporary copy.</p>
<nav>{MODES.map(mode => <p key={mode}><a href={"/fixture-control/set?mode="+mode}>{mode}</a></p>)}</nav>
<a href={"/ai-documents/communication-note/jobs/"+JOB+"?lang=en"}>Open current job</a></main>; }
`);
  await emit("src/app/fixture-control/set/route.ts", `import { NextResponse } from "next/server";
import { JOB, MODES } from "@/lib/__browser-fixture";
export async function GET(request: Request) {
  const url = new URL(request.url), mode = url.searchParams.get("mode");
  if (request.headers.get("host") !== "127.0.0.1:3395" || !MODES.some(m => m === mode)) return new Response(null,{status:400});
  const result = NextResponse.redirect(new URL("/ai-documents/communication-note/jobs/"+JOB+"?lang=en","http://127.0.0.1:3395"));
  result.cookies.set("cl_browser_fixture", mode!, { httpOnly:true, sameSite:"strict", path:"/" });
  return result;
}
`);
  await emit("src/app/auth/login/page.tsx", `export default function LoginFixture() { return <main style={{padding:32}}>
<h1>Sign-in required</h1><p>Local synthetic login boundary. No real credentials are accepted.</p><a href="/">Test controls</a></main>; }
`);
  // Deny every outward fetch in this copy. Local browser requests still hit
  // Next normally; data reads use only the explicit synthetic server ports.
  await emit("src/instrumentation.ts", `export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") globalThis.fetch = async () => { throw new Error("Browser fixture denies outbound fetch"); };
}
`);
  const env = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1", CARESLINK_LOCAL_BROWSER_FIXTURE: "SYNTHETIC_LOOPBACK_ONLY" };
  child = spawn(process.execPath, [join(app, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", host, "--port", String(port)],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", data => process.stdout.write(data));
  child.stderr.on("data", data => process.stderr.write(data));
  console.log(JSON.stringify({ stage: "browser-fixture-start", root, url: `http://${host}:${port}`, syntheticOnly: true, hostedVerified: false }));
  process.once("SIGTERM", () => { void cleanup().then(() => process.exit(0)).catch(() => process.exit(1)); });
  process.once("SIGINT", () => { void cleanup().then(() => process.exit(0)).catch(() => process.exit(1)); });
  await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  await cleanup();
} catch { await cleanup(); throw new Error("Local browser fixture failed"); }
