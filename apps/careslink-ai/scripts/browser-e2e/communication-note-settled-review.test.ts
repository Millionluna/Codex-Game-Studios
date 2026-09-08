import { readFileSync } from "node:fs";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({binding:vi.fn(),read:vi.fn(),review:vi.fn(),history:vi.fn(),edit:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./communication-note-admission.fixture",()=>({assertAdmissionFixture:()=>"/private/tmp/cl-job-browser-abc123"}));
vi.mock("./communication-note-settlement.fixture",()=>({readSettlementResultBinding:state.binding}));
vi.mock("./communication-note-self-review.fixture",()=>({readReviewDatabaseDocument:state.read,confirmReviewDatabaseDocument:state.review,handleDatabaseExportHistory:state.history,saveEditDatabaseDocument:state.edit}));
import {handleSettledReview} from "./communication-note-settled-review.fixture";
const DOC="99999999-9999-4999-8999-999999999999",REV="22222222-2222-4222-8222-222222222222";
const base="/api/ai-documents/communication-note/documents/"+DOC;
const request=(suffix="",method="GET",headers:Record<string,string>={})=>new Request("http://localhost:3395"+base+suffix,{method,
  headers:{host:"127.0.0.1:3395","sec-fetch-site":"same-origin",...(method==="POST"?{origin:"http://127.0.0.1:3395","content-type":"application/json"}:{}),...headers},
  ...(method==="POST"?{body:JSON.stringify({revisionId:REV})}:{})});
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv("CARESLINK_LOCAL_SETTLEMENT_DATABASE","OWNED_UNIX_SOCKET_ONLY");
  vi.stubEnv("CARESLINK_LOCAL_HISTORY_DATABASE","OWNED_UNIX_SOCKET_ONLY");vi.stubEnv("CARESLINK_LOCAL_SETTLED_REVIEW","EXACT_SETTLED_RESULT_ONLY");
  state.binding.mockResolvedValue({canonicalId:DOC,revisionId:REV});
  vi.stubEnv("CARESLINK_LOCAL_SETTLED_EDIT","");vi.stubEnv("CARESLINK_LOCAL_EDIT_DATABASE","");
  for(const fn of [state.read,state.review,state.history,state.edit]) fn.mockImplementation(async()=>Response.json({status:"AVAILABLE"}));
});
afterEach(()=>vi.unstubAllEnvs());
describe("exact settled result review/history bridge",()=>{
  it.each(["CARESLINK_LOCAL_SETTLEMENT_DATABASE","CARESLINK_LOCAL_HISTORY_DATABASE","CARESLINK_LOCAL_SETTLED_REVIEW"])("requires independent mode guard %s",async name=>{
    vi.stubEnv(name,"");await expect(handleSettledReview(request(),DOC)).rejects.toThrow();expect(state.binding).not.toHaveBeenCalled();
  });
  it.each<Record<string,string>>([{host:"external.invalid"},{"sec-fetch-site":"cross-site"},{authorization:"Bearer test"},{origin:"https://external.invalid"}])("denies foreign transport %j",async headers=>{
    expect((await handleSettledReview(request("","GET",headers),DOC)).status).toBe(404);expect(state.binding).not.toHaveBeenCalled();
  });
  it("requires exact POST Origin before reading metadata or body",async()=>{
    const r=request("/self-review","POST");r.headers.delete("origin");
    expect((await handleSettledReview(r,DOC)).status).toBe(404);expect(r.bodyUsed).toBe(false);expect(state.binding).not.toHaveBeenCalled();
  });
  it.each([["/revisions","POST"],["/self-review","GET"],["","POST"],["/export-history","DELETE"],["/settle-success","POST"]])("does not open other actions %s %s",async(suffix,method)=>{
    expect((await handleSettledReview(request(suffix,method),DOC)).status).toBe(404);expect(state.binding).not.toHaveBeenCalled();
  });
  it("denies unrelated seed documents and wrong revisions before SQL",async()=>{
    state.binding.mockResolvedValue({canonicalId:REV,revisionId:REV});expect((await handleSettledReview(request(),DOC)).status).toBe(404);
    state.binding.mockResolvedValue({canonicalId:DOC,revisionId:REV});expect((await handleSettledReview(request("?revisionId="+DOC),DOC)).status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });
  it("fails closed before settlement or when metadata cannot be verified",async()=>{
    state.binding.mockRejectedValue(new Error("No safe binding"));expect((await handleSettledReview(request("/self-review","POST"),DOC)).status).toBe(404);
    expect(state.review).not.toHaveBeenCalled();
  });
  it.each([["","GET","read"],["/self-review","POST","review"],["/export-history?revisionId="+REV,"GET","history"],["/export-history","POST","history"]] as const)("delegates untouched request to existing %s %s handler",async(suffix,method,key)=>{
    const r=request(suffix,method);expect((await handleSettledReview(r,DOC)).status).toBe(200);
    expect(state[key]).toHaveBeenCalledWith(r,DOC);expect(r.bodyUsed).toBe(false);
    state[key].mockResolvedValue(Response.json({status:"AUTH_REQUIRED"},{status:401}));expect((await handleSettledReview(request(suffix,method),DOC)).status).toBe(401);
  });
  it("does not copy the parent checker, terminal secrets, or a memory fallback into Next",()=>{
    const runner=readFileSync(new URL("./communication-note-recovery.mjs",import.meta.url),"utf8");
    expect(runner).not.toContain("communication-note-settled-review.database.mjs");
    expect(runner).toContain('settledReview ? "SETTLEMENT_REVIEW"');
    const fixture=readFileSync(new URL("./communication-note-settled-review.fixture.ts",import.meta.url),"utf8");
    expect(fixture).not.toMatch(/PASSWORD|new Client|settlementSql|globalThis/);
    const database=readFileSync(new URL("./communication-note-self-review.database.mjs",import.meta.url),"utf8");
    expect(database).toContain('edit = mode === "EDIT" || mode === "HISTORY"');
  });
});
describe("settled-document editing opt-in",()=>{
  const enable=()=>{vi.stubEnv("CARESLINK_LOCAL_SETTLED_EDIT","EXACT_SETTLED_DOCUMENT_ONLY");vi.stubEnv("CARESLINK_LOCAL_EDIT_DATABASE","OWNED_UNIX_SOCKET_ONLY");};
  it.each(["CARESLINK_LOCAL_SETTLED_EDIT","CARESLINK_LOCAL_EDIT_DATABASE"])("requires both edit guards, not only %s",async name=>{
    enable();vi.stubEnv(name,"");expect((await handleSettledReview(request("/revisions","POST"),DOC)).status).toBe(404);expect(state.edit).not.toHaveBeenCalled();
    expect((await handleSettledReview(request("?revisionId="+DOC),DOC)).status).toBe(404);expect(state.read).not.toHaveBeenCalled();
  });
  it("passes the original edit body to the existing bounded-parser/auth writer",async()=>{
    enable();const r=request("/revisions","POST");expect((await handleSettledReview(r,DOC)).status).toBe(200);
    expect(state.edit).toHaveBeenCalledWith(r,DOC);expect(r.bodyUsed).toBe(false);
  });
  it.each(["","/export-history"])("uses real revision-membership checks for %s",async suffix=>{
    enable();const r=request(suffix+"?revisionId="+DOC),handler=suffix?state.history:state.read;
    handler.mockResolvedValue(Response.json({status:"NOT_FOUND"},{status:404}));expect((await handleSettledReview(r,DOC)).status).toBe(404);
    expect(handler).toHaveBeenCalledWith(r,DOC);
  });
  it("keeps another document inaccessible even with editing enabled",async()=>{
    enable();state.binding.mockResolvedValue({canonicalId:REV,revisionId:REV});
    expect((await handleSettledReview(request("/revisions","POST"),DOC)).status).toBe(404);expect(state.edit).not.toHaveBeenCalled();
  });
  it.each([401,409])("preserves revoked/stale edit responses %s",async status=>{
    enable();state.edit.mockResolvedValue(new Response(null,{status}));expect((await handleSettledReview(request("/revisions","POST"),DOC)).status).toBe(status);
  });
});
