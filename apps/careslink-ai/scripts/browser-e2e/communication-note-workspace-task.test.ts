import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({id:vi.fn(),read:vi.fn(),list:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./communication-note-admission.fixture",()=>({getLocalWorkspaceTaskId:mocks.id,readAdmissionTask:mocks.read}));
vi.mock("./communication-note-saved-drafts.fixture",()=>({listSettledDrafts:mocks.list}));
import { readWorkspaceTask } from "./communication-note-workspace-task.fixture";
const JOB="11111111-1111-4111-8111-111111111111",OTHER="22222222-2222-4222-8222-222222222222",TIME="2026-09-08T01:00:00.000Z";
const job={jobId:JOB,status:"QUEUED",noteType:"communication",serviceCode:"note.communication.generate",attemptCount:0,createdAt:TIME,updatedAt:TIME};
const document={canonicalId:OTHER,revisionNumber:1,sourceLocale:"en",updatedAt:TIME};
const request=()=>new Request("http://127.0.0.1:3395/api/ai-documents/communication-note/documents",{
  headers:{host:"127.0.0.1:3395","sec-fetch-site":"same-origin",cookie:"cl_browser_fixture=owner"},
});
beforeEach(()=>{
  vi.resetAllMocks();mocks.id.mockReturnValue(JOB);
  mocks.list.mockImplementation(async()=>Response.json({status:"AVAILABLE",documents:[document]}));
  mocks.read.mockImplementation(async()=>Response.json({status:"AVAILABLE",job}));
});
describe("single owned task workspace bridge",()=>{
  it("returns only task/list metadata using the fresh authenticated exact reader",async()=>{
    const response=await readWorkspaceTask(request());
    expect(await response.json()).toEqual({status:"AVAILABLE",documents:[document],task:{jobId:JOB,status:"QUEUED",createdAt:TIME,updatedAt:TIME}});
    expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    const [readRequest,id]=mocks.read.mock.calls[0];expect(id).toBe(JOB);
    expect(readRequest.url).toBe("http://127.0.0.1:3395/api/ai-documents/communication-note/jobs/"+JOB);
    expect(readRequest.method).toBe("GET");expect(readRequest.headers.get("cookie")).toBe("cl_browser_fixture=owner");expect(readRequest.body).toBeNull();
    expect(mocks.list.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[0]);
  });
  it("is genuinely empty before admission, without issuing a write",async()=>{
    mocks.read.mockResolvedValue(Response.json({status:"NOT_FOUND"},{status:404}));
    expect(await(await readWorkspaceTask(request())).json()).toEqual({status:"AVAILABLE",documents:[document],task:null});
  });
  it.each([[401,"AUTH_REQUIRED"],[503,"UNAVAILABLE"]] as const)("list %s denies the task lookup",async(status,value)=>{
    mocks.list.mockResolvedValue(Response.json({status:value},{status}));const response=await readWorkspaceTask(request());
    expect(response.status).toBe(status);expect(await response.json()).toEqual({status:value});expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([[401,"AUTH_REQUIRED",401],[403,"FORBIDDEN",503],[503,"UNAVAILABLE",503]] as const)("task %s clears saved metadata too",async(status,value,expected)=>{
    mocks.read.mockResolvedValue(Response.json({status:value},{status}));const response=await readWorkspaceTask(request());
    expect(response.status).toBe(expected);expect(await response.json()).toEqual({status:expected===401?"AUTH_REQUIRED":"UNAVAILABLE"});
  });
  it.each([{...job,jobId:OTHER},{...job,cleanedFacts:"private"},{...job,status:"SUCCEEDED"}])("rejects wrong binding or invalid job %#",async job=>{
    mocks.read.mockResolvedValue(Response.json({status:"AVAILABLE",job}));
    expect(await(await readWorkspaceTask(request())).json()).toEqual({status:"UNAVAILABLE"});
  });
  it("refuses missing opt-in and hides internal errors",async()=>{
    mocks.id.mockReturnValue(undefined);expect((await readWorkspaceTask(request())).status).toBe(503);expect(mocks.list).not.toHaveBeenCalled();
    mocks.id.mockImplementation(()=>{throw new Error("private");});expect(await(await readWorkspaceTask(request())).json()).toEqual({status:"UNAVAILABLE"});
  });
  it("needs no recovery key or browser storage on a later request",async()=>{
    expect((await readWorkspaceTask(request())).status).toBe(200);expect((await readWorkspaceTask(request())).status).toBe(200);
    expect(mocks.read.mock.calls.map(([r,id])=>[r.url,id])).toEqual(Array(2).fill(["http://127.0.0.1:3395/api/ai-documents/communication-note/jobs/"+JOB,JOB]));
  });
  it("is opt-in copied wiring, without new SQL authority or formal route binding",()=>{
    const runner=readFileSync(new URL("./communication-note-recovery.mjs",import.meta.url),"utf8");
    expect(runner).toContain('if (workspaceTask) await emit');expect(runner).toContain('--workspace-task-check');
    expect(runner).toContain('Do not retry for this scenario. Use Back to AI Documents');
    const fixture=readFileSync(new URL("./communication-note-workspace-task.fixture.ts",import.meta.url),"utf8");
    expect(fixture).not.toMatch(/PASSWORD|new Client|query\(|enqueue\(|globalThis|writeFile|localStorage/);
    expect(readFileSync(new URL("../../src/app/ai-documents/page.tsx",import.meta.url),"utf8")).not.toContain("CommunicationNoteSavedDrafts");
  });
});
