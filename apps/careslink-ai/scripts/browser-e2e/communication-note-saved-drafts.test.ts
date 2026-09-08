import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const state=vi.hoisted(()=>({binding:vi.fn(),list:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./communication-note-admission.fixture",()=>({assertAdmissionFixture:()=>"/private/tmp/cl-job-browser-abc123"}));
vi.mock("./communication-note-settlement.fixture",()=>({readSettlementResultBinding:state.binding}));
vi.mock("./communication-note-self-review.fixture",()=>({readReviewDatabaseList:state.list}));
import { listSettledDrafts } from "./communication-note-saved-drafts.fixture";
import { CaresLinkV1ContractError } from "../../src/lib/v1/shared-contracts";
const DOC="11111111-1111-4111-8111-111111111111",REV="22222222-2222-4222-8222-222222222222";
const base="/api/ai-documents/communication-note/documents";
const document={canonicalId:DOC,noteType:"communication",sourceLocale:"en",lifecycleStatus:"COMPLETED",currentRevisionId:REV,currentRevisionNumber:2,updatedAt:"2026-09-08T01:00:00Z",deletedAt:null};
function request(headers:Record<string,string>={},method="GET",suffix="") {return new Request("http://127.0.0.1:3395"+base+suffix,{method,headers:{host:"127.0.0.1:3395","sec-fetch-site":"same-origin",...headers}});}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubEnv("CARESLINK_LOCAL_SETTLED_LIST","EXACT_SETTLED_DOCUMENT_ONLY");
  vi.stubEnv("CARESLINK_LOCAL_SETTLED_EDIT","EXACT_SETTLED_DOCUMENT_ONLY");
  vi.stubEnv("CARESLINK_LOCAL_SETTLEMENT_DATABASE","OWNED_UNIX_SOCKET_ONLY");
  state.binding.mockResolvedValue({canonicalId:DOC,revisionId:REV});
  state.list.mockResolvedValue({documents:[document],hasMore:false,nextCursor:null});
});
afterEach(()=>vi.unstubAllEnvs());
describe("exact settled document list bridge",()=>{
  it.each(["CARESLINK_LOCAL_SETTLED_LIST","CARESLINK_LOCAL_SETTLED_EDIT","CARESLINK_LOCAL_SETTLEMENT_DATABASE"])("requires %s",async key=>{
    vi.stubEnv(key,"");await expect(listSettledDrafts(request())).rejects.toThrow();expect(state.list).not.toHaveBeenCalled();
  });
  it.each([{host:"remote.invalid"},{"sec-fetch-site":"cross-site"},{authorization:"Bearer fixed"},{origin:"http://other.invalid"}] as Record<string,string>[])("rejects transport %#",async headers=>{
    expect((await listSettledDrafts(request(headers))).status).toBe(503);expect(state.list).not.toHaveBeenCalled();
  });
  it.each(["?documentId="+DOC,"?cursor="+DOC,"/extra"])("rejects selector %s",async suffix=>{
    expect((await listSettledDrafts(request({},"GET",suffix))).status).toBe(503);expect(state.list).not.toHaveBeenCalled();
  });
  it("has no write entry",async()=>{expect((await listSettledDrafts(request({},"POST"))).status).toBe(503);expect(state.list).not.toHaveBeenCalled();});
  it("projects only minimal metadata for the actual result",async()=>{
    state.list.mockResolvedValue({documents:[{...document,canonicalId:REV},{...document,englishDraft:"never returned"}],hasMore:false,nextCursor:null});
    const response=await listSettledDrafts(request());expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({status:"AVAILABLE",documents:[{canonicalId:DOC,revisionNumber:2,sourceLocale:"en",updatedAt:document.updatedAt}]});
    expect(state.list.mock.invocationCallOrder[0]).toBeLessThan(state.binding.mock.invocationCallOrder[0]);
  });
  it("is empty before a result is saved",async()=>{state.binding.mockRejectedValue(Object.assign(new Error(),{code:"ENOENT"}));expect(await(await listSettledDrafts(request())).json()).toEqual({status:"AVAILABLE",documents:[]});});
  it("does not treat invalid result binding as an empty success",async()=>{state.binding.mockRejectedValue(new Error("private"));expect(await(await listSettledDrafts(request())).json()).toEqual({status:"UNAVAILABLE"});});
  it.each([{canonicalId:REV},{noteType:"incident"},{deletedAt:"2026-09-08T00:00:00Z"},{lifecycleStatus:"TOMBSTONED"},{lifecycleStatus:"PURGED"},{currentRevisionId:null}])("excludes inaccessible/unready metadata %#",async patch=>{
    state.list.mockResolvedValue({documents:[{...document,...patch}],hasMore:false,nextCursor:null});expect(await(await listSettledDrafts(request())).json()).toEqual({status:"AVAILABLE",documents:[]});
  });
  it("fails closed instead of silently truncating",async()=>{state.list.mockResolvedValue({documents:[document],hasMore:true,nextCursor:DOC});expect((await listSettledDrafts(request())).status).toBe(503);});
  it.each(["AUTH_REQUIRED","SESSION_REVOKED"] as const)("denies %s without binding lookup",async code=>{
    state.list.mockRejectedValue(new CaresLinkV1ContractError(code,"private"));const response=await listSettledDrafts(request());expect(response.status).toBe(401);expect(await response.json()).toEqual({status:"AUTH_REQUIRED"});expect(state.binding).not.toHaveBeenCalled();
  });
  it("does not leak backend errors",async()=>{state.list.mockRejectedValue(new Error("secret"));expect(await(await listSettledDrafts(request())).json()).toEqual({status:"UNAVAILABLE"});});
  it("is wired only by the new disposable mode",()=>{
    const runner=readFileSync(new URL("./communication-note-recovery.mjs",import.meta.url),"utf8");
    expect(runner).toContain('if (settledList) {');expect(runner).toContain('--settlement-list-check');
    const source=readFileSync(new URL("../../src/app/ai-documents/page.tsx",import.meta.url),"utf8");expect(source).not.toContain("CommunicationNoteSavedDrafts");
    const fixture=readFileSync(new URL("./communication-note-saved-drafts.fixture.ts",import.meta.url),"utf8");expect(fixture).not.toMatch(/PASSWORD|globalThis|new Client|getDocument\(/);
  });
});
