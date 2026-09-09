import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mode: "owner", rpc: vi.fn(), query: vi.fn(), connect: vi.fn(), end: vi.fn(), options: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ realpath: async (path: string) => path }));
vi.mock("pg", () => ({ Client: class {
  constructor(options: unknown) { state.options(options); }
  on() {} connect=state.connect; end=state.end; query=state.query;
} }));
vi.mock("./communication-note-self-review.fixture", async original => ({
  ...await original<typeof import("./communication-note-self-review.fixture")>(),
  createReviewDatabaseAuthClient: async () => {
    const id=state.mode==="foreign"?"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    return {auth:{getClaims:async()=>({data:{claims:state.mode==="anonymous"?null:{sub:id,session_id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      role:"authenticated",is_anonymous:false,exp:Date.now()/1000+3600}},error:null}),
    getUser:async()=>({data:{user:{id,app_metadata:{role:"provider"}}},error:null})},rpc:state.rpc};
  },
}));
import { ADMISSION_FACTS, assertAdmissionFixture, submitAdmissionTask, readAdmissionTask, readAdmissionPoints, queryAdmissionFixture, getLocalWorkspaceTaskId } from "./communication-note-admission.fixture";
import { CARESLINK_V1_COMMUNICATION_NOTE_POINTS_ADMISSION_POSTGRES_SQL as ADMIT } from "../../src/lib/v1/communication-note-points-admission-purpose-caller.server";
import { CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL as READ } from "../../src/lib/v1/communication-note-job-status-repository.server";
const JOB="99999999-9999-4999-8999-999999999999", KEY="66666666-6666-4666-8666-666666666666";
const API="http://localhost:3395/api/ai-documents/communication-note";
const headers={host:"127.0.0.1:3395",origin:"http://127.0.0.1:3395","sec-fetch-site":"same-origin","content-type":"application/json","idempotency-key":KEY};
const body=()=>({sourceLocale:"en",cleanedFacts:structuredClone(ADMISSION_FACTS),privacyReview:{reviewedNoIdentifiers:true,processingAuthorityConfirmed:true}});
const post=(value:unknown=body(),change:Record<string,string>={})=>new Request(API+"/generate",{method:"POST",headers:{...headers,...change},body:JSON.stringify(value)});
const job=(id=JOB)=>({jobId:id,noteType:"communication",serviceCode:"note.communication.generate",status:"QUEUED",attemptCount:0,
  createdAt:"2026-09-08T00:00:00.000Z",updatedAt:"2026-09-08T00:00:00.000Z",startedAt:null,finishedAt:null,failureCode:null,result:null});
beforeEach(()=>{
  vi.clearAllMocks(); state.mode="owner";
  delete (globalThis as Record<symbol,unknown>)[Symbol.for("careslink.synthetic.browser.admission.lost-ack")];
  vi.spyOn(process,"cwd").mockReturnValue("/private/tmp/cl-job-browser-abc123"); vi.spyOn(console,"log").mockImplementation(()=>{});
  for(const [k,v] of Object.entries({VERCEL:"",CARESLINK_LOCAL_BROWSER_FIXTURE:"SYNTHETIC_LOOPBACK_ONLY",
    CARESLINK_LOCAL_REVIEW_DATABASE:"OWNED_UNIX_SOCKET_ONLY",CARESLINK_LOCAL_REVIEW_PASSWORD:"a".repeat(64),
    CARESLINK_LOCAL_ADMISSION_DATABASE:"OWNED_UNIX_SOCKET_ONLY",CARESLINK_LOCAL_ADMISSION_PASSWORD:"b".repeat(64)})) vi.stubEnv(k,v);
  state.rpc.mockImplementation(async()=>({data:state.mode==="revoked"?"REVOKED":"ACTIVE",error:null}));
  state.query.mockImplementation(async(sql:string,values:unknown[]=[])=>{
    if(sql.startsWith("select current_user"))return {rows:[{role:"cl_admission_browser_runtime",unix_only:true,cluster:"careslink-review-browser-pg16"}]};
    if(sql===ADMIT)return {rows:[{data:{created:true,payloadAccepted:true,pointsReserved:true,job:job(String(values[3]))}}]};
    if(sql===READ)return {rows:[{data:{job:job()}}]};
    return {rows:[]};
  });
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe("owned local admission bridge",()=>{
  it("binds admission to the server-preallocated task before losing the reply",async()=>{
    vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY","FIXED_SINGLE_ADMISSION");vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY_JOB_ID",JOB);
    expect(getLocalWorkspaceTaskId()).toBe(JOB);expect((await submitAdmissionTask(post())).status).toBe(503);
    expect(state.query.mock.calls.find(([sql])=>sql===ADMIT)![1][3]).toBe(JOB);
  });
  it.each([undefined,"", "javascript:alert(1)","99999999-9999-1999-8999-999999999999"])("rejects invalid local task locator %s",id=>{
    vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY","FIXED_SINGLE_ADMISSION");vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY_JOB_ID",id);expect(getLocalWorkspaceTaskId).toThrow();
  });
  it("rejects an unpaired local task locator",()=>{vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY_JOB_ID",JOB);expect(getLocalWorkspaceTaskId).toThrow();});
  it.each(["CARESLINK_LOCAL_ADMISSION_DATABASE","CARESLINK_LOCAL_ADMISSION_PASSWORD","CARESLINK_LOCAL_REVIEW_DATABASE","CARESLINK_LOCAL_REVIEW_PASSWORD","CARESLINK_LOCAL_BROWSER_FIXTURE"])("requires guard %s",key=>{
    vi.stubEnv(key,"");expect(assertAdmissionFixture).toThrow();expect(state.connect).not.toHaveBeenCalled();
  });
  it("rejects Hosted and ordinary checkout",()=>{
    vi.stubEnv("VERCEL","1");expect(assertAdmissionFixture).toThrow();vi.stubEnv("VERCEL","");
    vi.mocked(process.cwd).mockReturnValue("/private/tmp/careslink-ai-points-ui-v1");expect(assertAdmissionFixture).toThrow();
  });
  it.each<Record<string,string>>([{host:"external.invalid"},{origin:"https://external.invalid"},{"sec-fetch-site":"cross-site"},{authorization:"Bearer synthetic"}])("rejects transport %j",async change=>{
    expect((await submitAdmissionTask(post(body(),change))).status).toBe(403);expect(state.rpc).not.toHaveBeenCalled();expect(state.connect).not.toHaveBeenCalled();
  });
  it.each(["anonymous","revoked","foreign"])("rejects %s before write",async mode=>{
    state.mode=mode;expect((await submitAdmissionTask(post())).status).toBe(mode==="foreign"?404:401);expect(state.connect).not.toHaveBeenCalled();
  });
  it.each([()=>({...body(),sourceLocale:"zh-Hans"}),()=>({...body(),ownerUserId:JOB}),
    ()=>({...body(),cleanedFacts:{...ADMISSION_FACTS,observable_facts:"Changed synthetic facts."}}),
    ()=>({...body(),privacyReview:{reviewedNoIdentifiers:false,processingAuthorityConfirmed:true}})])("rejects nonfixed/unconfirmed input",async value=>{
    expect((await submitAdmissionTask(post(value()))).status).toBeGreaterThanOrEqual(400);expect(state.connect).not.toHaveBeenCalled();
  });
  it("hides first committed acknowledgement and sends the same hashes to SQL on replay",async()=>{
    expect((await submitAdmissionTask(post())).status).toBe(503);
    const first=state.query.mock.calls.find(([sql])=>sql===ADMIT)![1];
    const original=state.query.getMockImplementation()!;
    state.query.mockImplementation(async(sql:string,values:unknown[])=>sql===ADMIT?
      {rows:[{data:{created:false,payloadAccepted:false,pointsReserved:true,job:job(first[3])}}]}:original(sql,values));
    const replay=await submitAdmissionTask(post());expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({job:{jobId:first[3],status:"QUEUED",attemptCount:0}});
    const second=state.query.mock.calls.filter(([sql])=>sql===ADMIT)[1][1];
    expect(second.slice(9,13)).toEqual(first.slice(9,13));expect(second[3]).not.toBe(first[3]);
    expect(JSON.stringify(first)).not.toContain(KEY);expect(JSON.stringify(first)).not.toContain("Synthetic call occurred.");
    expect(state.end).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(KEY);
  });
  it("uses purpose-only SQL and a Unix socket, never an executor or table",async()=>{
    await expect(queryAdmissionFixture("select * from public.point_wallets",[])).rejects.toThrow();
    expect(state.connect).not.toHaveBeenCalled();await submitAdmissionTask(post());
    expect(state.options).toHaveBeenCalledWith(expect.objectContaining({host:"/private/tmp/cl-job-browser-abc123/pg/socket",user:"cl_admission_browser_runtime",ssl:false}));
    expect(state.query).toHaveBeenCalledWith("set local role careslink_v1_generation_points_admission_caller");
  });
  it("maps insufficient Points without inventing success and closes the connection",async()=>{
    const original=state.query.getMockImplementation()!;
    state.query.mockImplementation(async(sql:string,values:unknown[])=>{if(sql===ADMIT)throw {code:"P0001",message:"POINTS_INSUFFICIENT"};return original(sql,values);});
    expect((await submitAdmissionTask(post())).status).toBe(409);expect(state.query).toHaveBeenCalledWith("rollback");expect(state.end).toHaveBeenCalledOnce();
  });
  it("reads a real job envelope without submitting or deriving progress from time",async()=>{
    const response=await readAdmissionTask(new Request(API+"/jobs/"+JOB,{headers}),JOB);
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({job:{status:"QUEUED"}});
    expect(state.query.mock.calls.some(([sql])=>sql===ADMIT)).toBe(false);
  });
  it("parses actual Points RPC, with no fallback demo balance",async()=>{
    state.rpc.mockResolvedValue({data:{status:"AVAILABLE",unit:"POINTS",serviceCode:"note.communication.generate",
      catalogVersion:"2026-08-09.v1-shadow",generationCostPoints:20,availablePoints:10,reservedPoints:20,canAfford:false},error:null});
    expect(await readAdmissionPoints()).toMatchObject({availablePoints:10,reservedPoints:20,canAfford:false});
    expect(state.rpc).toHaveBeenCalledWith("get_v1_communication_note_points_preview");
    state.rpc.mockResolvedValue({data:null,error:{message:"denied"}});expect(await readAdmissionPoints()).toMatchObject({status:"UNAVAILABLE"});
  });
  it("leaves formal routes unbound and blocks all seed-result endpoints",()=>{
    const runner=readFileSync(new URL("./communication-note-recovery.mjs",import.meta.url),"utf8");
    expect(runner).toContain('const admission = args[0] === "--admission"');expect(runner).toContain("Jobs remain queued");
    expect(runner).toContain('for (const suffix of ["", "/self-review", "/revisions", "/export-history"])');
    for(const path of ["src/app/api/ai-documents/communication-note/generate/route.ts","src/app/ai-documents/communication-note/page.tsx"])
      expect(readFileSync(new URL("../../"+path,import.meta.url),"utf8")).not.toContain("admission.fixture");
  });
});
