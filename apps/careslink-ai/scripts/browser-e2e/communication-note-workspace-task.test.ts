import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({guard:vi.fn(),resolve:vi.fn(),query:vi.fn(),list:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./communication-note-admission.fixture",()=>({assertAdmissionFixture:mocks.guard,principal:()=>mocks.resolve,queryAdmissionFixture:mocks.query}));
vi.mock("./communication-note-self-review.fixture",()=>({readReviewDatabaseList:mocks.list}));
import { CaresLinkV1ContractError } from "../../src/lib/v1/shared-contracts";
import { readWorkspaceTask } from "./communication-note-workspace-task.fixture";
const JOB="11111111-1111-4111-8111-111111111111",OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc",TIME="2026-09-08T01:00:00.000000Z";
const task={jobId:JOB,status:"QUEUED",createdAt:TIME,updatedAt:TIME};
const page={tasks:[task],nextCursor:null};
const request=(query="")=>new Request("http://127.0.0.1:3395/api/ai-documents/communication-note/documents"+query,{
  headers:{host:"127.0.0.1:3395","sec-fetch-site":"same-origin",cookie:"cl_browser_fixture=owner"},
});
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY","OWNER_TASK_LIST");vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY_JOB_ID",undefined);
  mocks.resolve.mockResolvedValue({ok:true,principal:{userId:OWNER,sessionId:SESSION,transport:"COOKIE"}});
  mocks.list.mockResolvedValue({documents:[],nextCursor:null,hasMore:false});
  mocks.query.mockResolvedValue({rows:[{data:page}]});
});
afterEach(()=>vi.unstubAllEnvs());
describe("owned multi-task workspace bridge",()=>{
  it("reads only server-bound owner/session metadata without a preallocated job ID",async()=>{
    const response=await readWorkspaceTask(request());expect(await response.json()).toEqual({status:"AVAILABLE",documents:[],documentsCursor:null,taskPage:page});
    expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("list_v1_communication_note_jobs"),[OWNER,SESSION,null,null,20,"1.0.0-shadow.1","2026-08-09.v1-shadow"]);
    expect(mocks.resolve.mock.invocationCallOrder[0]).toBeLessThan(mocks.list.mock.invocationCallOrder[0]);
    expect(mocks.list).toHaveBeenCalledWith(expect.any(Request),{limit:20},{userId:OWNER,sessionId:SESSION,transport:"COOKIE"});
  });
  it("is genuinely empty before admission",async()=>{mocks.query.mockResolvedValue({rows:[{data:{tasks:[],nextCursor:null}}]});
    expect(await(await readWorkspaceTask(request())).json()).toEqual({status:"AVAILABLE",documents:[],documentsCursor:null,taskPage:{tasks:[],nextCursor:null}});});
  it.each([[401,"AUTH_REQUIRED"],[503,"UNAVAILABLE"]] as const)("list %s denies task lookup",async(status,value)=>{
    mocks.list.mockRejectedValue(value==="AUTH_REQUIRED"?new CaresLinkV1ContractError("AUTH_REQUIRED","unavailable"):new Error("private"));expect((await readWorkspaceTask(request())).status).toBe(status);expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([401,403,503])("principal failure %s clears the whole surface",async status=>{
    mocks.resolve.mockResolvedValue({ok:false,status,reason:status===401?"session_revoked":status===403?"forbidden_transport":"unavailable"});
    expect((await readWorkspaceTask(request())).status).toBe(status===401?401:503);expect(mocks.query).not.toHaveBeenCalled();
  });
  it("maps a revocation during the database read to authentication",async()=>{
    mocks.query.mockRejectedValue(Object.assign(new Error("SESSION_REVOKED"),{code:"P0001"}));
    const response=await readWorkspaceTask(request());expect(response.status).toBe(401);expect(await response.json()).toEqual({status:"AUTH_REQUIRED"});
  });
  it.each(["?owner="+OWNER,"?before=bad","?before=&before=bad","?limit=100","?before="+encodeURIComponent(TIME+"~"+JOB)+"&owner="+OWNER])("rejects untrusted query %s without task SQL",async query=>{
    expect((await readWorkspaceTask(request(query))).status).toBe(503);expect(mocks.query).not.toHaveBeenCalled();
  });
  it("accepts only a position cursor and keeps identity server-bound",async()=>{
    mocks.query.mockResolvedValue({rows:[{data:{tasks:[],nextCursor:null}}]});
    expect((await readWorkspaceTask(request("?before="+encodeURIComponent(TIME+"~"+JOB)))).status).toBe(200);
    expect(mocks.query.mock.calls[0][1]).toEqual([OWNER,SESSION,TIME,JOB,20,"1.0.0-shadow.1","2026-08-09.v1-shadow"]);
    expect(mocks.list.mock.calls[0][1]).toEqual({limit:20});expect(mocks.list.mock.calls[0][0].headers.get("cookie")).toBe("cl_browser_fixture=owner");
  });
  it("keeps the two cursors independent and sends no owner or size from the browser",async()=>{
    const cursor="document.v1:"+JOB;
    mocks.query.mockResolvedValue({rows:[{data:{tasks:[],nextCursor:null}}]});
    expect((await readWorkspaceTask(request("?before="+encodeURIComponent(TIME+"~"+JOB)+"&draftAfter="+encodeURIComponent(cursor)))).status).toBe(200);
    expect(mocks.list.mock.calls[0][1]).toEqual({limit:20,cursor});
    expect(mocks.query.mock.calls[0][1].slice(0,5)).toEqual([OWNER,SESSION,TIME,JOB,20]);
  });
  it.each(["?draftAfter=private","?draftAfter=&draftAfter=bad","?noteType=handover"])("rejects draft query %s before either read",async query=>{
    expect((await readWorkspaceTask(request(query))).status).toBe(503);expect(mocks.list).not.toHaveBeenCalled();expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([{host:"external.invalid"},{"sec-fetch-site":"cross-site"},{authorization:"Bearer private"},{origin:"https://external.invalid"}])("rejects foreign transport %#",async headers=>{
    const r=request();for(const [key,value] of Object.entries(headers))r.headers.set(key,value);
    expect((await readWorkspaceTask(r)).status).toBe(503);expect(mocks.resolve).not.toHaveBeenCalled();expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each([{...task,cleanedFacts:"private"},{...task,status:"APPROVED"}])("rejects excessive metadata %#",async task=>{
    mocks.query.mockResolvedValue({rows:[{data:{tasks:[task],nextCursor:null}}]});expect((await readWorkspaceTask(request())).status).toBe(503);
  });
  it("refuses missing opt-in and legacy singleton locator",async()=>{
    vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY",undefined);expect((await readWorkspaceTask(request())).status).toBe(503);
    vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY","OWNER_TASK_LIST");vi.stubEnv("CARESLINK_LOCAL_TASK_ENTRY_JOB_ID",JOB);expect((await readWorkspaceTask(request())).status).toBe(503);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("uses the formal route in an owned copy without installing a hosted runtime or write port",()=>{
    const runner=readFileSync(new URL("./communication-note-recovery.mjs",import.meta.url),"utf8");
    expect(runner).toContain("Do not retry for this scenario. Use Back to AI Documents");
    const fixture=readFileSync(new URL("./communication-note-workspace-task.fixture.ts",import.meta.url),"utf8");
    expect(fixture).not.toMatch(/PASSWORD|new Client|enqueue\(|globalThis|writeFile|localStorage/);
    expect(readFileSync(new URL("../../src/app/ai-documents/page.tsx",import.meta.url),"utf8")).not.toContain("CommunicationNoteSavedDrafts");
    expect(runner).toContain('await copy("src/app/api/ai-documents/communication-note/documents/route.ts"');
    expect(readFileSync(new URL("../../src/lib/communication-note-workspace-runtime.server.ts",import.meta.url),"utf8")).toContain("undefined as CommunicationNoteWorkspaceRuntime");
  });
});
