import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const app = fileURLToPath(new URL("../../", import.meta.url));
const port = 3395, host = "127.0.0.1";
const prefix = "/private/tmp/cl-job-browser-";
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--built")) throw new Error("Use no argument or --built for this local fixture");
const built = args[0] === "--built";
let root, child, stopped = false;
const sourceHashes = new Map();
const copy = async (source, target) => {
  await mkdir(join(root, target, ".."), { recursive: true });
  await cp(join(app, source), join(root, target), { recursive: true,
    filter: path => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) });
};
const emit = async (path, source) => { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), source); };
const tracked = ["src/lib/supabase-server.ts", "src/app/ai-documents/communication-note/jobs/[jobId]/page.tsx",
  "src/app/api/ai-documents/communication-note/jobs/[jobId]/route.ts", "src/app/api/ai-documents/communication-note/documents/[documentId]/route.ts",
  "src/app/api/ai-documents/communication-note/documents/[documentId]/self-review/route.ts"];

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
async function stopAndExit() {
  try { await cleanup(); process.exit(0); } catch { process.exit(1); }
}
process.once("SIGTERM", () => { void stopAndExit(); });
process.once("SIGINT", () => { void stopAndExit(); });
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
  const tsconfig = JSON.parse(await readFile(join(root, "tsconfig.json"), "utf8"));
  // Type-check every fixture route and all of its transitive imports, not
  // unrelated copied components whose app routes intentionally do not exist.
  tsconfig.include = ["next-env.d.ts", "src/app/**/*.ts", "src/app/**/*.tsx", "src/instrumentation.ts", ".next/types/**/*.ts"];
  await emit("tsconfig.json", JSON.stringify(tsconfig));
  await copy("public/careslink-ai-logo-reverse.svg", "public/careslink-ai-logo-reverse.svg");
  if (built) {
    await copy("scripts/browser-e2e/communication-note-network-observer.js", "public/fixture-network-observer.js");
    const layout = await readFile(join(root, "src/app/layout.tsx"), "utf8");
    await emit("src/app/layout.tsx", layout.replace("</body>", '<script src="/fixture-network-observer.js" defer /></body>'));
    await emit("src/app/fixture-control/observation/route.ts", `export { observeFixtureNetwork as GET } from "@/lib/__browser-fixture";\n`);
  }
  await emit("src/lib/__browser-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-recovery.fixture.ts"), "utf8"))
    .replaceAll('"../../src/lib/', '"./'));
  await symlink(join(app, "node_modules"), join(root, "node_modules"), "dir");
  await emit("package.json", JSON.stringify({ name: "careslink-local-browser-fixture", private: true,
    dependencies: (JSON.parse(await readFile(join(app, "package.json"), "utf8"))).dependencies }));
  await emit("src/lib/supabase-server.ts", `// TEST ONLY, no real Supabase client or credentials.
import { createFixtureAuthClient } from "./__browser-fixture";
export async function createCareslinkServerSupabaseClient(options?: unknown) {
  void options; return createFixtureAuthClient();
}
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
  await emit("src/app/api/ai-documents/communication-note/documents/[documentId]/self-review/route.ts", `import { confirmFixtureReview } from "@/lib/__browser-fixture";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return confirmFixtureReview(request, (await context.params).documentId);
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
  const env = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, NODE_ENV: built ? "production" : "development",
    NEXT_TELEMETRY_DISABLED: "1", CARESLINK_LOCAL_BROWSER_FIXTURE: "SYNTHETIC_LOOPBACK_ONLY" };
  const launch = (arguments_) => {
    child = spawn(process.execPath, [join(app, "node_modules/next/dist/bin/next"), ...arguments_],
      { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => process.stdout.write(data));
    child.stderr.on("data", data => process.stderr.write(data));
    return new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  };
  if (built && await launch(["build", "--webpack"]) !== 0) throw new Error("Local fixture build failed");
  if (stopped) process.exit(0);
  const completion = launch([...(built ? ["start"] : ["dev", "--webpack"]), "--hostname", host, "--port", String(port)]);
  console.log(JSON.stringify({ stage: "browser-fixture-start", root, url: `http://${host}:${port}`, built,
    syntheticOnly: true, hostedVerified: false }));
  await completion;
  await cleanup();
} catch { await cleanup(); throw new Error("Local browser fixture failed"); }
