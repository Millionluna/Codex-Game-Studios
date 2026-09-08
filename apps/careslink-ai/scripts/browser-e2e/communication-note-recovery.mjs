import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createReviewBrowserDatabase, REVIEW_DOC } from "./communication-note-self-review.database.mjs";

const app = fileURLToPath(new URL("../../", import.meta.url));
const port = 3395, host = "127.0.0.1";
const prefix = "/private/tmp/cl-job-browser-";
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !["--built", "--database-review", "--edit", "--database-edit", "--database-history", "--flow", "--admission", "--settlement", "--settlement-check", "--settlement-review", "--settlement-review-check", "--settlement-edit", "--settlement-edit-check", "--settlement-list", "--settlement-list-check", "--workspace-task", "--workspace-task-check"].includes(args[0]))) throw new Error("Use a fixed local fixture mode only");
const workspaceTask = args[0] === "--workspace-task" || args[0] === "--workspace-task-check";
const settledList = args[0] === "--settlement-list" || args[0] === "--settlement-list-check" || workspaceTask;
const settledEdit = args[0] === "--settlement-edit" || args[0] === "--settlement-edit-check" || settledList;
const settledReview = args[0] === "--settlement-review" || args[0] === "--settlement-review-check" || settledEdit;
const settlementCheck = args[0] === "--settlement-check" || args[0] === "--settlement-review-check" || args[0] === "--settlement-edit-check" || args[0] === "--settlement-list-check" || args[0] === "--workspace-task-check";
const settlement = args[0] === "--settlement" || settlementCheck || settledReview;
const admission = args[0] === "--admission" || settlement;
const flow = args[0] === "--flow";
const databaseHistory = args[0] === "--database-history" || flow || settledReview;
const databaseEdit = args[0] === "--database-edit" || (databaseHistory && !settledReview) || settledEdit;
const databaseReview = args[0] === "--database-review" || databaseEdit || admission;
const built = args[0] === "--built" || databaseReview || args[0] === "--edit";
const edit = args[0] === "--edit";
let root, child, reviewDatabase, controls, stopped = false;
const sourceHashes = new Map();
const copy = async (source, target) => {
  await mkdir(join(root, target, ".."), { recursive: true });
  await cp(join(app, source), join(root, target), { recursive: true,
    filter: path => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) });
};
const emit = async (path, source) => { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), source); };
const tracked = ["src/lib/supabase-server.ts", "src/app/ai-documents/communication-note/jobs/[jobId]/page.tsx",
  "src/app/ai-documents/communication-note/page.tsx", "src/app/ai-documents/communication-note/communication-note-composer.tsx",
  "src/app/api/ai-documents/communication-note/generate/route.ts", "src/lib/communication-note-generation-feature.ts",
  "src/app/api/ai-documents/communication-note/jobs/[jobId]/route.ts", "src/app/api/ai-documents/communication-note/documents/[documentId]/route.ts",
  "src/app/api/ai-documents/communication-note/documents/[documentId]/self-review/route.ts",
  "src/app/api/ai-documents/communication-note/documents/[documentId]/revisions/route.ts",
  "src/app/api/ai-documents/communication-note/documents/[documentId]/export-history/route.ts"];

async function cleanup() {
  if (stopped) return; stopped = true;
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL"); await new Promise(resolve => child.once("exit", resolve));
    }
  }
  controls?.close();
  await reviewDatabase?.stop(); // Never remove a live database directory.
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
  console.log(JSON.stringify({ stage: "browser-fixture-owned-root", root }));
  if (databaseReview) {
    reviewDatabase = createReviewBrowserDatabase(root, workspaceTask ? "WORKSPACE_TASK" : settledList ? "SETTLEMENT_LIST" : settledEdit ? "SETTLEMENT_EDIT" : settledReview ? "SETTLEMENT_REVIEW" : settlement ? "SETTLEMENT" : admission ? "ADMISSION" : databaseHistory ? "HISTORY" : databaseEdit ? "EDIT" : "REVIEW");
    await reviewDatabase.start();
  }
  if (settlementCheck) { await reviewDatabase.verifySettlement(); await cleanup(); process.exit(0); }
  await copy("src/lib", "src/lib"); await copy("src/components", "src/components");
  await copy("src/app/ai-documents/communication-note/jobs", "src/app/ai-documents/communication-note/jobs");
  await copy("src/app/ai-documents/communication-note/documents", "src/app/ai-documents/communication-note/documents");
  if (flow || admission) await copy("src/app/ai-documents/communication-note/communication-note-composer.tsx", "src/app/ai-documents/communication-note/communication-note-composer.tsx");
  for (const path of ["src/app/globals.css", "src/app/layout.tsx", "next.config.ts", "tsconfig.json", "postcss.config.mjs"]) await copy(path, path);
  const tsconfig = JSON.parse(await readFile(join(root, "tsconfig.json"), "utf8"));
  // Type-check every fixture route and all of its transitive imports, not
  // unrelated copied components whose app routes intentionally do not exist.
  tsconfig.include = ["next-env.d.ts", "src/app/**/*.ts", "src/app/**/*.tsx", "src/instrumentation.ts", ".next/types/**/*.ts"];
  await emit("tsconfig.json", JSON.stringify(tsconfig));
  await copy("public/careslink-ai-logo-reverse.svg", "public/careslink-ai-logo-reverse.svg");
  await copy("public/export-fonts", "public/export-fonts");
  if (built) {
    await copy("scripts/browser-e2e/communication-note-network-observer.js", "public/fixture-network-observer.js");
    const layout = await readFile(join(root, "src/app/layout.tsx"), "utf8");
    await emit("src/app/layout.tsx", layout.replace("</body>", '<script src="/fixture-network-observer.js" defer /></body>'));
    await emit("src/app/fixture-control/observation/route.ts", `export { observeFixtureNetwork as GET } from "@/lib/__browser-fixture";\n`);
  }
  await emit("src/lib/__browser-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-recovery.fixture.ts"), "utf8"))
    .replaceAll('"../../src/lib/', '"./'));
  if (databaseReview) await emit("src/lib/__review-database-fixture.ts",
    (await readFile(join(app, "scripts/browser-e2e/communication-note-self-review.fixture.ts"), "utf8")).replaceAll('"../../src/lib/', '"./'));
  if (flow) await emit("src/lib/__flow-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-flow.fixture.ts"), "utf8"))
    .replaceAll('"../../src/lib/', '"./').replace('"./communication-note-self-review.fixture"', '"./__review-database-fixture"'));
  if (admission) await emit("src/lib/__admission-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-admission.fixture.ts"), "utf8"))
    .replaceAll('"../../src/lib/', '"./').replace('"./communication-note-self-review.fixture"', '"./__review-database-fixture"'));
  if (settlement) await emit("src/lib/__settlement-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-settlement.fixture.ts"), "utf8"))
    .replace('"./communication-note-admission.fixture"', '"./__admission-fixture"').replace('"./communication-note-self-review.fixture"', '"./__review-database-fixture"'));
  if (settledReview) await emit("src/lib/__settled-review-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-settled-review.fixture.ts"), "utf8"))
    .replace('"./communication-note-admission.fixture"', '"./__admission-fixture"').replace('"./communication-note-settlement.fixture"', '"./__settlement-fixture"')
    .replace('"./communication-note-self-review.fixture"', '"./__review-database-fixture"'));
  if (edit) await emit("src/lib/__edit-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-edit.fixture.ts"), "utf8")).replaceAll('"../../src/lib/', '"./'));
  if (settledList) await emit("src/lib/__saved-drafts-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-saved-drafts.fixture.ts"), "utf8"))
    .replaceAll('"../../src/lib/', '"./').replace('"./communication-note-admission.fixture"', '"./__admission-fixture"')
    .replace('"./communication-note-settlement.fixture"', '"./__settlement-fixture"').replace('"./communication-note-self-review.fixture"', '"./__review-database-fixture"'));
  if (workspaceTask) await emit("src/lib/__workspace-task-fixture.ts", (await readFile(join(app, "scripts/browser-e2e/communication-note-workspace-task.fixture.ts"), "utf8"))
    .replaceAll('"../../src/lib/', '"./').replace('"./communication-note-admission.fixture"', '"./__admission-fixture"')
    .replace('"./communication-note-saved-drafts.fixture"', '"./__saved-drafts-fixture"'));
  await symlink(join(app, "node_modules"), join(root, "node_modules"), "dir");
  await emit("package.json", JSON.stringify({ name: "careslink-local-browser-fixture", private: true,
    dependencies: (JSON.parse(await readFile(join(app, "package.json"), "utf8"))).dependencies }));
  await emit("src/lib/supabase-server.ts", `// TEST ONLY, no real Supabase client or credentials.
import { ${databaseReview ? "createReviewDatabaseAuthClient as createFixtureAuthClient" : "createFixtureAuthClient"} } from "./${databaseReview ? "__review-database-fixture" : "__browser-fixture"}";
export async function createCareslinkServerSupabaseClient(options?: unknown) {
  void options; return createFixtureAuthClient();
}
export { getSupabasePublicAuthConfig } from "./supabase-public-auth-config";
export type CareslinkServerSupabaseClient = Awaited<ReturnType<typeof createFixtureAuthClient>>;
`);
  await emit("src/components/safe-vercel-analytics.tsx", "export function SafeVercelAnalytics() { return null; }\n");
  for (const [segment, param, handler] of [["jobs", "jobId", "readFixtureJob"], ["documents", "documentId", "readFixtureDocument"]]) {
    const databaseRead = databaseReview && segment === "documents";
    await emit(`src/app/api/ai-documents/communication-note/${segment}/[${param}]/route.ts`, `import { ${databaseRead ? "readReviewDatabaseDocument as " + handler : handler} } from "@/lib/${databaseRead ? "__review-database-fixture" : "__browser-fixture"}";
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
  if (databaseReview) await emit("src/app/page.tsx", `export default function ReviewDatabaseFixture() { return <main style={{padding:32}}>
<h1>Local database ${databaseHistory ? "export history, edit and review" : databaseEdit ? "edit and review" : "review"} test</h1><p>Real local PostgreSQL storage; synthetic identity and draft only. No Hosted Auth, AI or Points. This disposable database is deleted when the test ends.</p>
<p><a href="/ai-documents/communication-note/documents/${REVIEW_DOC}?lang=zh-Hans">打开简体中文复核页</a></p>
<p><a href="/ai-documents/communication-note/documents/${REVIEW_DOC}?lang=en">Open English review</a></p>
<p><a href="/ai-documents/communication-note/documents/${REVIEW_DOC}?lang=zh-Hant">開啟繁體中文複核頁</a></p>
</main>; }\n`);
  if (edit) {
    await emit("src/app/page.tsx", `export default function EditFixture() { return <main style={{padding:32}}><h1>Local edit test</h1>
<p>Synthetic identity and PROCESS MEMORY ONLY. Not database persistence. No AI, Points or Hosted writes.</p>
<a href="/ai-documents/communication-note/documents/44444444-4444-4444-8444-444444444444?lang=zh-Hans">打开编辑测试草稿</a>
<p><label htmlFor="fixture-export-paste">Paste the copied synthetic record for verification</label></p>
<textarea id="fixture-export-paste" rows={12} style={{width:"100%"}} autoComplete="off" spellCheck={false} />
<p>This local-only field is not submitted or persisted. Paste only the synthetic record just copied in this test.</p>
</main>; }`);
    await emit("src/app/api/ai-documents/communication-note/documents/[documentId]/route.ts", `import { readEditFixtureDocument } from "@/lib/__edit-fixture";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) { return readEditFixtureDocument(request, (await context.params).documentId); }`);
  }
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
  await emit("src/app/api/ai-documents/communication-note/documents/[documentId]/self-review/route.ts", `import { ${edit ? "confirmEditFixtureReview as confirmFixtureReview" : databaseReview ? "confirmReviewDatabaseDocument as confirmFixtureReview" : "confirmFixtureReview"} } from "@/lib/${edit ? "__edit-fixture" : databaseReview ? "__review-database-fixture" : "__browser-fixture"}";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return confirmFixtureReview(request, (await context.params).documentId);
}
`);
  if (edit) await emit("src/app/api/ai-documents/communication-note/documents/[documentId]/revisions/route.ts", `import { saveEditFixtureDocument } from "@/lib/__edit-fixture";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) { return saveEditFixtureDocument(request, (await context.params).documentId); }`);
  if (edit) await emit("src/app/api/ai-documents/communication-note/documents/[documentId]/export-history/route.ts", `import { editFixtureExportHistory } from "@/lib/__edit-fixture";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) { return editFixtureExportHistory(request, (await context.params).documentId); }
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) { return editFixtureExportHistory(request, (await context.params).documentId); }`);
  if (databaseEdit) await emit("src/app/api/ai-documents/communication-note/documents/[documentId]/revisions/route.ts", `import { saveEditDatabaseDocument } from "@/lib/__review-database-fixture";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) { return saveEditDatabaseDocument(request, (await context.params).documentId); }`);
  if (databaseHistory) await emit("src/app/api/ai-documents/communication-note/documents/[documentId]/export-history/route.ts", `import { handleDatabaseExportHistory } from "@/lib/__review-database-fixture";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) { return handleDatabaseExportHistory(request, (await context.params).documentId); }
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) { return handleDatabaseExportHistory(request, (await context.params).documentId); }`);
  if (flow) {
    const layout = await readFile(join(root, "src/app/layout.tsx"), "utf8");
    await emit("src/app/layout.tsx", layout.replace("{children}", `<aside role="note" style={{padding:12,borderBottom:"1px solid #bacbc3"}}>
Local synthetic test / 本地合成演练：No AI or Points charged. Task progress is simulated; the result is pre-seeded, not generated. Review and export history use a disposable local database. <a href="/">Test instructions</a>
</aside>{children}`));
    await emit("src/app/page.tsx", `import { assertFlowFixture, FLOW_FACTS } from "@/lib/__flow-fixture";
export const dynamic = "force-dynamic";
export default function FlowInstructions() { assertFlowFixture(); return <main style={{padding:32}}>
<h1>Communication Note — local full-flow test</h1>
<p>One fixed English synthetic task per run. The displayed 100 Points and 20-Point cost are demonstration values only: nothing is reserved or charged. Never enter real care data.</p>
<p>Enter the exact facts below, leave Follow-up empty, run the privacy check, and confirm both acknowledgements. Task progress is simulated over 16 seconds; the pre-seeded result must match these facts. All test data is deleted on shutdown.</p>
<dl>{Object.entries(FLOW_FACTS).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value)?value.join("; "):value}</dd></div>)}</dl>
<a href="/ai-documents/communication-note?lang=en">Start fixed English flow</a>
</main>; }`);
    await emit("src/app/ai-documents/communication-note/page.tsx", `import { CommunicationNoteComposer } from "./communication-note-composer";
import { assertFlowFixture, FLOW_POINTS } from "@/lib/__flow-fixture";
import { parseCommunicationNoteComposerLocale } from "@/lib/communication-note-composer";
export const dynamic = "force-dynamic";
export default async function FlowComposerPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  assertFlowFixture(); const params=await searchParams; let locale: "en"|"zh-Hans"|"zh-Hant"="en";
  try { locale=parseCommunicationNoteComposerLocale(params.lang); } catch { /* Fixed safe fallback. */ }
  return <CommunicationNoteComposer locale={locale} pointsPreview={FLOW_POINTS} generationAvailable={locale==="en"} />;
}`);
    await emit("src/app/api/ai-documents/communication-note/generate/route.ts", `export { submitFlowTask as POST } from "@/lib/__flow-fixture";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";`);
    await emit("src/app/api/ai-documents/communication-note/jobs/[jobId]/route.ts", `import { readFlowTask } from "@/lib/__flow-fixture";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(request:Request, context:{params:Promise<{jobId:string}>}) {return readFlowTask(request,(await context.params).jobId);}`);
    for (const [suffix, handler, methods] of [["", "readReviewDatabaseDocument", ["GET"]], ["/self-review", "confirmReviewDatabaseDocument", ["POST"]],
      ["/revisions", "saveEditDatabaseDocument", ["POST"]], ["/export-history", "handleDatabaseExportHistory", ["GET", "POST"]]]) {
      await emit(`src/app/api/ai-documents/communication-note/documents/[documentId]${suffix}/route.ts`, `import { flowResultBoundary } from "@/lib/__flow-fixture";
import { ${handler} } from "@/lib/__review-database-fixture";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
${methods.map(method => `export async function ${method}(request:Request,context:{params:Promise<{documentId:string}>}) {
  return flowResultBoundary(request,(await context.params).documentId,${handler});
}`).join("\n")}`);
    }
  }
  if (admission) {
    const layout = await readFile(join(root, "src/app/layout.tsx"), "utf8");
    await emit("src/app/layout.tsx", layout.replace("{children}", `<aside role="note" style={{padding:12,borderBottom:"1px solid #bacbc3"}}>
Local synthetic test / 本地合成测试：Real local queue and Points reservation. No AI, real money, payload vault or KMS. ${settlement ? "Fixed operator-driven synthetic terminal outcomes; not AI-generated content." : "Jobs remain queued; no result is generated."} <a href="/">Test balance and instructions</a>
</aside>{children}`));
    await emit("src/app/page.tsx", `import { assertAdmissionFixture, ADMISSION_FACTS, readAdmissionPoints } from "@/lib/__admission-fixture";
export const dynamic="force-dynamic";
export default async function AdmissionInstructions() { assertAdmissionFixture(); const points=await readAdmissionPoints(); return <main style={{padding:32}}>
<h1>Communication Note — local queue and Points test</h1>
<p>Only fixed synthetic facts. Starts with 30 synthetic Points; admission reserves 20. No welcome grant, purchase or actual charge.</p>
<p>The first successful database admission deliberately returns an unavailable response. ${workspaceTask ? "Do not retry for this scenario. Use Back to AI Documents to recover the task from your paginated workspace, without its request key. After a parent-controlled failure releases Points, create another fixed synthetic task to verify multiple entries." : "Use Retry on the composer: the same key must recover the same queued task without a second reservation."}</p>
<p>${settlement ? "The local operator can settle one queued job with fixed synthetic success, failure or cancellation, then replay it. No terminal authority is exposed over HTTP. Success consumes the reservation; failure/cancellation releases it. A successful result is authored synthetic test content, not AI output." : "Jobs stay queued: no worker, AI, payload encryption or result is exercised."} All local test data is deleted on shutdown.</p>
${settledReview ? `<p>Only the newly settled draft can be self-reviewed and exported. Review and export history use real local PostgreSQL. ${settledEdit ? "Wording edits save a new version that requires a new self-review. The old version keeps its own export history. Editing does not charge Points. Use synthetic wording only." : "Editing stays unavailable."} Export reports describe browser actions, not confirmed file delivery. Review/export do not charge Points.</p>` : ""}
<p role="status">{points.status==="AVAILABLE" ? "Available: "+points.availablePoints+" Points · Reserved: "+points.reservedPoints+" Points" : "Points unavailable"}</p>
<dl>{Object.entries(ADMISSION_FACTS).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{Array.isArray(value)?value.join("; "):value}</dd></div>)}</dl>
<a href="/ai-documents/communication-note?lang=en">Start fixed English admission</a>
${settledList ? '<p><a href="/ai-documents?lang=en">Open saved Communication Notes</a></p>' : ""}</main>; }`);
    await emit("src/app/ai-documents/communication-note/page.tsx", `import { CommunicationNoteComposer } from "./communication-note-composer";
import { assertAdmissionFixture, readAdmissionPoints } from "@/lib/__admission-fixture";
import { parseCommunicationNoteComposerLocale } from "@/lib/communication-note-composer";
export const dynamic="force-dynamic";
export default async function AdmissionComposerPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  assertAdmissionFixture(); const params=await searchParams; let locale:"en"|"zh-Hans"|"zh-Hant"="en";
  try {locale=parseCommunicationNoteComposerLocale(params.lang);} catch {}
  return <CommunicationNoteComposer locale={locale} pointsPreview={await readAdmissionPoints()} generationAvailable={locale==="en"} />;
}`);
    await emit("src/app/api/ai-documents/communication-note/generate/route.ts", `export { submitAdmissionTask as POST } from "@/lib/__admission-fixture";
export const dynamic="force-dynamic"; export const runtime="nodejs";`);
    await emit("src/app/api/ai-documents/communication-note/jobs/[jobId]/route.ts", `import { readAdmissionTask } from "@/lib/__admission-fixture";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{jobId:string}>}) {return readAdmissionTask(request,(await context.params).jobId);}`);
    // This batch has no generated result. Never expose the unrelated seed draft.
    for (const suffix of ["", "/self-review", "/revisions", "/export-history"])
      await emit(`src/app/api/ai-documents/communication-note/documents/[documentId]${suffix}/route.ts`, `import { assertAdmissionFixture } from "@/lib/__admission-fixture";
export const dynamic="force-dynamic";
export async function GET(){assertAdmissionFixture();return Response.json({status:"NOT_FOUND"},{status:404,headers:{"Cache-Control":"private, no-store"}});}
export { GET as POST };`);
    if (settlement) await emit("src/app/api/ai-documents/communication-note/documents/[documentId]/route.ts", `import { readSettlementDocument } from "@/lib/__settlement-fixture";
export const dynamic="force-dynamic"; export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{documentId:string}>}) {return readSettlementDocument(request,(await context.params).documentId);}`);
    if (settledReview) for (const [suffix, methods] of [["", ["GET"]], ["/self-review", ["POST"]], ["/export-history", ["GET", "POST"]], ...(settledEdit ? [["/revisions", ["POST"]]] : [])]) {
      await emit(`src/app/api/ai-documents/communication-note/documents/[documentId]${suffix}/route.ts`, `import { handleSettledReview } from "@/lib/__settled-review-fixture";
export const dynamic="force-dynamic"; export const runtime="nodejs";
${methods.map(method => `export async function ${method}(request:Request,context:{params:Promise<{documentId:string}>}) {return handleSettledReview(request,(await context.params).documentId);}`).join("\n")}`);
    }
  }
  if (settledList) {
    await emit("src/app/ai-documents/page.tsx", `import { CommunicationNoteSavedDrafts } from "@/components/communication-note-saved-drafts";
import { resolveCommunicationNoteDocumentLocale } from "@/lib/communication-note-document-i18n";
export const dynamic="force-dynamic";
export default async function SavedDraftsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {locale,unsupported}=resolveCommunicationNoteDocumentLocale((await searchParams).lang);
  return <CommunicationNoteSavedDrafts locale={locale} includeTask={${workspaceTask ? '"MULTI"' : 'false'}} unsupportedLocale={unsupported} loginHref={"/auth/login?next="+encodeURIComponent("/ai-documents?lang="+locale)} />;
}`);
    await emit("src/app/api/ai-documents/communication-note/documents/route.ts", `export { ${workspaceTask ? 'readWorkspaceTask' : 'listSettledDrafts'} as GET } from "@/lib/${workspaceTask ? '__workspace-task-fixture' : '__saved-drafts-fixture'}";
export const dynamic="force-dynamic"; export const runtime="nodejs";`);
  }
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
    NEXT_TELEMETRY_DISABLED: "1", CARESLINK_LOCAL_BROWSER_FIXTURE: "SYNTHETIC_LOOPBACK_ONLY", ...reviewDatabase?.env,
    ...(flow ? { CARESLINK_LOCAL_FLOW_FIXTURE: "FIXED_SYNTHETIC_ONLY" } : {}),
    ...(edit ? { CARESLINK_LOCAL_EDIT_FIXTURE: "PROCESS_MEMORY_ONLY" } : {}) };
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
    syntheticOnly: true, hostedVerified: false, databaseReview, databaseEdit, databaseHistory, flow, admission, settlement, settledReview, settledEdit, settledList, workspaceTask }));
  if (reviewDatabase) {
    controls = createInterface({ input: process.stdin, crlfDelay: Infinity });
    let queue = Promise.resolve();
    controls.on("line", line => { queue = queue.then(() => reviewDatabase.command(line.trim())).catch(async () => {
      console.error("Fixed local database control failed"); await stopAndExit();
    }); });
    console.log(`Local database controls: status${admission ? "" : " | advance"} | revoke | restore${databaseHistory ? " | history-off | history-on" : ""}${settlement ? " | settle-failure | settle-cancel | settle-success | settle-replay" : ""} (stdin only)`);
  }
  await completion;
  await cleanup();
} catch (error) {
  // Metadata-only diagnostics: never echo SQL, connection strings or payloads.
  console.error(JSON.stringify({ stage: "browser-fixture-failed",
    code: /^[A-Z0-9_]{1,30}$/.test(error?.code ?? "") ? error.code : "UNCLASSIFIED",
    diagnostic: /^[A-Z_]+$|^permission denied for (schema|table|function) [a-z_]+$|^role "[a-z_]+" does not exist$/.test(error?.message ?? "") ? error.message : "UNAVAILABLE",
    source: String(error?.stack ?? "").split("\n").find(line => /at .*communication-note-self-review\.database\.mjs:\d+:\d+\)?$/.test(line))?.trim() }));
  await cleanup(); throw new Error("Local browser fixture failed");
}
