import { describe, expect, it, vi } from "vitest";
import { createCommunicationNoteDurableSelfReviewWriter, COMMUNICATION_NOTE_SELF_REVIEW_RPC,
  type CommunicationNoteSelfReviewEnv } from "./communication-note-self-review-durable.server";
import { handleCommunicationNoteSelfReview } from "./communication-note-self-review.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
vi.mock("server-only", () => ({}));

const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC="11111111-1111-4111-8111-111111111111", REV="22222222-2222-4222-8222-222222222222", KEY="33333333-3333-4333-8333-333333333333";
const confirmation={revisionId:REV,factsConfirmed:true,wordingConfirmed:true,missingFactsReviewed:true} as const;
const ack={status:"CONFIRMED",canonicalId:DOC,revisionId:REV,mutationId:KEY,saveState:"SERVER_ACKNOWLEDGED",draftNotice:"Draft – review required"} as const;
const env: CommunicationNoteSelfReviewEnv={
  CARESLINK_COMMUNICATION_NOTE_SELF_REVIEW_ENABLED:"true",CARESLINK_V1_PRODUCT_API_ENABLED:"true",
  CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED:"true",CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:"syntheticpreviewref",
  SUPABASE_URL:"https://syntheticpreviewref.supabase.co",VERCEL_ENV:"preview",
};
const request=(headers: Record<string,string>={})=>new Request(`https://example.test/api/ai-documents/communication-note/documents/${DOC}/self-review`,{
  method:"POST",headers:{origin:"https://example.test","sec-fetch-site":"same-origin","content-type":"application/json","idempotency-key":KEY,...headers},
  body:JSON.stringify(confirmation),
});
const input=(r=request())=>({request:r,canonicalId:DOC,mutationId:KEY,confirmation});
function fixture(overrides: CommunicationNoteSelfReviewEnv={}) {
  const rpc=vi.fn(async (name: string, args?: Readonly<Record<string,unknown>>):Promise<{data:unknown;error:null|{code:string;message:string}}>=> {
    void args;
    return {data:name===COMMUNICATION_NOTE_SELF_REVIEW_RPC ? ack : "ACTIVE",error:null};
  });
  const auth={getClaims:vi.fn(async()=>({data:{claims:{sub:OWNER,session_id:SESSION}},error:null})),
    getUser:vi.fn(async()=>({data:{user:{id:OWNER}},error:null}))};
  const client={auth,rpc};
  const factory=vi.fn(async()=>client);
  const write=createCommunicationNoteDurableSelfReviewWriter({env:{...env,...overrides},createCookieClient:factory});
  return {write,rpc,auth,factory};
}

describe("durable Communication self-review candidate",()=>{
  it.each<CommunicationNoteSelfReviewEnv>([
    {CARESLINK_COMMUNICATION_NOTE_SELF_REVIEW_ENABLED:undefined},
    {CARESLINK_COMMUNICATION_NOTE_SELF_REVIEW_ENABLED:"false"},
    {CARESLINK_V1_PRODUCT_API_ENABLED:"false"},{CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED:"false"},
    {VERCEL_ENV:"production"},{VERCEL_ENV:undefined},{CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:"differentpreview"},
    {SUPABASE_URL:`https://${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`,CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:CARESLINK_PRODUCTION_SUPABASE_REF},
  ])("denies inactive/mismatched/Production gates before client creation: %j",async override=>{
    const f=fixture(override);expect(await f.write(input())).toEqual({status:"UNAVAILABLE"});expect(f.factory).not.toHaveBeenCalled();
  });
  it("does not treat DOCUMENT_DETAIL or DOCUMENT_WRITE as self-review authority",async()=>{
    const f=fixture({CARESLINK_COMMUNICATION_NOTE_SELF_REVIEW_ENABLED:undefined,CARESLINK_V1_PRODUCT_API_DOCUMENT_DETAIL_ENABLED:"true",CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED:"true"});
    expect(await f.write(input())).toEqual({status:"UNAVAILABLE"});expect(f.factory).not.toHaveBeenCalled();
  });
  it("verifies the same Cookie client, then sends only revision and confirmation fields",async()=>{
    const f=fixture();expect(await f.write(input())).toEqual(ack);
    expect(f.factory).toHaveBeenCalledTimes(1);expect(f.auth.getClaims).toHaveBeenCalledWith();expect(f.auth.getUser).toHaveBeenCalledWith();
    expect(f.rpc.mock.calls).toEqual([
      ["resolve_v1_current_session_status"],
      [COMMUNICATION_NOTE_SELF_REVIEW_RPC,{p_document_id:DOC,p_revision_id:REV,p_mutation_id:KEY,
        p_facts_confirmed:true,p_wording_confirmed:true,p_missing_facts_reviewed:true}],
    ]);
  });
  it("integrates with strict HTTP transport without installing a formal route writer",async()=>{
    const f=fixture();const response=await handleCommunicationNoteSelfReview(request(),DOC,{write:f.write});
    expect(response.status).toBe(200);expect(await response.json()).toEqual(ack);
  });
  it("rejects mixed bearer credentials and malformed commands before clients",async()=>{
    const f=fixture();expect(await f.write(input(request({authorization:"Bearer synthetic"})))).toEqual({status:"AUTH_REQUIRED"});
    expect(await f.write({...input(),confirmation:{...confirmation,ownerUserId:OWNER} as never})).toEqual({status:"INVALID_REQUEST"});
    expect(await f.write({...input(),canonicalId:"bad"})).toEqual({status:"INVALID_REQUEST"});expect(f.factory).not.toHaveBeenCalled();
  });
  it.each(["REVOKED","UNAVAILABLE"])("does not mutate an unproven %s session",async status=>{
    const f=fixture();f.rpc.mockResolvedValue({data:status,error:null});
    expect(await f.write(input())).toEqual({status:status==="REVOKED"?"AUTH_REQUIRED":"UNAVAILABLE"});
    expect(f.rpc).toHaveBeenCalledTimes(1);expect(f.auth.getUser).not.toHaveBeenCalled();
  });
  it("rejects a principal switch before mutation",async()=>{
    const f=fixture();f.auth.getUser.mockResolvedValue({data:{user:{id:REV}},error:null});
    expect(await f.write(input())).toEqual({status:"AUTH_REQUIRED"});expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["AUTH_REQUIRED","NOT_FOUND","STALE_REVISION","INVALID_REQUEST","UNAVAILABLE"])("projects only the fixed %s database error",async message=>{
    const f=fixture();f.rpc.mockImplementation(async name=>name===COMMUNICATION_NOTE_SELF_REVIEW_RPC
      ? {data:ack,error:{code:"P0001",message}} : {data:"ACTIVE",error:null});
    expect(await f.write(input())).toEqual({status:message});
  });
  it.each([
    {data:ack,error:{code:"55P03",message:"private lock detail"}},
    {data:ack,error:{code:"OTHER",message:"AUTH_REQUIRED"}},
    {data:{...ack,canonicalId:REV},error:null},{data:{...ack,revisionId:KEY},error:null},
    {data:{...ack,mutationId:REV},error:null},{data:{...ack,details:"private"},error:null},
  ])("fails closed without retry on an unknown or unbound result",async result=>{
    const f=fixture();f.rpc.mockImplementation(async name=>name===COMMUNICATION_NOTE_SELF_REVIEW_RPC ? result : {data:"ACTIVE",error:null});
    expect(await f.write(input())).toEqual({status:"UNAVAILABLE"});expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it("treats a lost ACK or aborted completion as uncertain, never as confirmation",async()=>{
    const f=fixture(),c=new AbortController();
    f.rpc.mockImplementation(async name=>{
      if(name===COMMUNICATION_NOTE_SELF_REVIEW_RPC){c.abort();return {data:ack,error:null};}
      return {data:"ACTIVE",error:null};
    });
    expect(await f.write(input(new Request(request(),{signal:c.signal})))).toEqual({status:"UNAVAILABLE"});
    const g=fixture();g.rpc.mockImplementation(async name=>{
      if(name===COMMUNICATION_NOTE_SELF_REVIEW_RPC) throw new Error("private upstream failure");
      return {data:"ACTIVE",error:null};
    });
    expect(await g.write(input())).toEqual({status:"UNAVAILABLE"});expect(g.rpc).toHaveBeenCalledTimes(2);
  });
});
