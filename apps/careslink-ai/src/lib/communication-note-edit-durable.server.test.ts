import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createCommunicationNoteDurableEditWriter, COMMUNICATION_NOTE_EDIT_RPC,
  type CommunicationNoteEditEnv } from "./communication-note-edit-durable.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import { handleCommunicationNoteEdit } from "./communication-note-edit.server";
vi.mock("server-only", () => ({}));

const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC="11111111-1111-4111-8111-111111111111", BASE="22222222-2222-4222-8222-222222222222";
const KEY="33333333-3333-4333-8333-333333333333", REV="44444444-4444-4444-8444-444444444444";
const command={baseRevisionId:BASE,englishDraft:"Synthetic edited wording.",reviewVersions:{"zh-Hans":"合成修改。","zh-Hant":"合成修改。"},wordingConfirmed:true} as const;
const ack={status:"SAVED",canonicalId:DOC,baseRevisionId:BASE,revisionId:REV,revisionNumber:2,mutationId:KEY,
  saveState:"SERVER_ACKNOWLEDGED",selfReviewStatus:"REQUIRED",draftNotice:"Draft – review required"} as const;
const env: CommunicationNoteEditEnv={CARESLINK_COMMUNICATION_NOTE_EDIT_ENABLED:"true",CARESLINK_V1_PRODUCT_API_ENABLED:"true",
  CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED:"true",CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED:"true",
  CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:"syntheticpreviewref",SUPABASE_URL:"https://syntheticpreviewref.supabase.co",VERCEL_ENV:"preview"};
const request=(headers: Record<string,string>={})=>new Request(`https://example.test/api/ai-documents/communication-note/documents/${DOC}/revisions`,{
  method:"POST",headers:{origin:"https://example.test","sec-fetch-site":"same-origin","content-type":"application/json","idempotency-key":KEY,...headers},
  body:JSON.stringify(command)});
const input=(r=request())=>({request:r,canonicalId:DOC,mutationId:KEY,command,baseRevisionNumber:1});
function fixture(overrides: CommunicationNoteEditEnv={}) {
  const rpc=vi.fn(async (name: string,args?:Readonly<Record<string,unknown>>):Promise<{data:unknown;error:null|{code:string;message:string}}>=>{
    void args;return {data:name===COMMUNICATION_NOTE_EDIT_RPC?ack:"ACTIVE",error:null};
  });
  const auth={getClaims:vi.fn(async()=>({data:{claims:{sub:OWNER,session_id:SESSION}},error:null})),
    getUser:vi.fn(async()=>({data:{user:{id:OWNER}},error:null}))};
  const factory=vi.fn(async()=>({auth,rpc}));
  return {rpc,auth,factory,write:createCommunicationNoteDurableEditWriter({env:{...env,...overrides},createCookieClient:factory})};
}
describe("uninstalled durable wording edit writer",()=>{
  it.each<CommunicationNoteEditEnv>([
    {CARESLINK_COMMUNICATION_NOTE_EDIT_ENABLED:undefined},{CARESLINK_COMMUNICATION_NOTE_EDIT_ENABLED:"false"},
    {CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED:undefined},{CARESLINK_V1_PRODUCT_API_ENABLED:"false"},
    {CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED:"false"},{VERCEL_ENV:"production"},{VERCEL_ENV:undefined},
    {CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:"differentpreview"},
    {SUPABASE_URL:`https://${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`,CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:CARESLINK_PRODUCTION_SUPABASE_REF},
  ])("rejects inactive/Production/mismatched targets before Auth: %j",async override=>{
    const f=fixture(override);expect(await f.write(input())).toEqual({status:"UNAVAILABLE"});expect(f.factory).not.toHaveBeenCalled();
  });
  it("does not borrow self-review or read-only authority",async()=>{
    const f=fixture({CARESLINK_COMMUNICATION_NOTE_EDIT_ENABLED:undefined,CARESLINK_V1_PRODUCT_API_DOCUMENT_DETAIL_ENABLED:"true"});
    expect(await f.write(input())).toEqual({status:"UNAVAILABLE"});expect(f.factory).not.toHaveBeenCalled();
  });
  it("uses one verified Cookie client and the narrow RPC, not generic append",async()=>{
    const f=fixture();expect(await f.write(input())).toEqual(ack);expect(f.factory).toHaveBeenCalledTimes(1);
    expect(f.auth.getClaims).toHaveBeenCalledWith();expect(f.auth.getUser).toHaveBeenCalledWith();
    expect(f.rpc.mock.calls).toEqual([["resolve_v1_current_session_status"],
      [COMMUNICATION_NOTE_EDIT_RPC,{p_document_id:DOC,p_mutation_id:KEY,p_command:command}]]);
  });
  it("rejects bearer and body privilege injection before client creation",async()=>{
    const f=fixture();expect(await f.write(input(request({authorization:"Bearer synthetic"})))).toEqual({status:"AUTH_REQUIRED"});
    expect(await f.write({...input(),command:{...command,ownerUserId:OWNER} as never})).toEqual({status:"INVALID_REQUEST"});
    expect(await f.write({...input(),mutationId:"bad"})).toEqual({status:"INVALID_REQUEST"});
    expect(f.factory).not.toHaveBeenCalled();
  });
  it.each([0,-1,NaN,Infinity,1.5,2147483647])("rejects invalid base number %s",async baseRevisionNumber=>{
    const f=fixture();expect(await f.write({...input(),baseRevisionNumber})).toEqual({status:"INVALID_REQUEST"});expect(f.factory).not.toHaveBeenCalled();
  });
  it.each(["REVOKED","UNAVAILABLE"])("does not write when current session is %s",async status=>{
    const f=fixture();f.rpc.mockResolvedValue({data:status,error:null});
    expect(await f.write(input())).toEqual({status:status==="REVOKED"?"AUTH_REQUIRED":"UNAVAILABLE"});expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects verified-user mismatch",async()=>{
    const f=fixture();f.auth.getUser.mockResolvedValue({data:{user:{id:REV}},error:null});
    expect(await f.write(input())).toEqual({status:"AUTH_REQUIRED"});expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["englishDraft","zh-Hans","zh-Hant"])("scans %s before RPC persistence",async field=>{
    const f=fixture(), c={...command,reviewVersions:{...command.reviewVersions}};
    const changed=field==="englishDraft"?{...c,englishDraft:"test@example.invalid"}:{...c,reviewVersions:{...c.reviewVersions,[field]:"test@example.invalid"}};
    expect(await f.write({...input(),command:changed})).toEqual({status:"PRIVACY_REVIEW_REQUIRED"});expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["AUTH_REQUIRED","NOT_FOUND","STALE_REVISION","INVALID_REQUEST","PRIVACY_REVIEW_REQUIRED","UNAVAILABLE"])("returns only fixed status %s",async message=>{
    const f=fixture();f.rpc.mockImplementation(async name=>name===COMMUNICATION_NOTE_EDIT_RPC?{data:ack,error:{code:"P0001",message}}:{data:"ACTIVE",error:null});
    expect(await f.write(input())).toEqual({status:message});
  });
  it.each([
    {data:ack,error:{code:"55P03",message:"private SQL text"}},{data:ack,error:{code:"OTHER",message:"AUTH_REQUIRED"}},
    {data:{...ack,canonicalId:REV},error:null},{data:{...ack,baseRevisionId:REV},error:null},
    {data:{...ack,revisionId:BASE},error:null},{data:{...ack,revisionNumber:3},error:null},
    {data:{...ack,mutationId:BASE},error:null},{data:{...ack,selfReviewStatus:"CONFIRMED"},error:null},
    {data:{...ack,privateText:"hidden"},error:null},
  ])("rejects unbound or unsafe acknowledgements without retry",async result=>{
    const f=fixture();f.rpc.mockImplementation(async name=>name===COMMUNICATION_NOTE_EDIT_RPC?result:{data:"ACTIVE",error:null});
    expect(await f.write(input())).toEqual({status:"UNAVAILABLE"});expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it("treats post-commit abort and transport failure as uncertain",async()=>{
    const f=fixture(),controller=new AbortController();
    f.rpc.mockImplementation(async name=>{if(name===COMMUNICATION_NOTE_EDIT_RPC){controller.abort();return {data:ack,error:null};}return {data:"ACTIVE",error:null};});
    expect(await f.write(input(new Request(request(),{signal:controller.signal})))).toEqual({status:"UNAVAILABLE"});
    const g=fixture();g.rpc.mockImplementation(async name=>{if(name===COMMUNICATION_NOTE_EDIT_RPC) throw new Error("private transport failure");return {data:"ACTIVE",error:null};});
    expect(await g.write(input())).toEqual({status:"UNAVAILABLE"});expect(g.rpc).toHaveBeenCalledTimes(2);
  });
  it("keeps the formal HTTP route unbound and the body unread",async()=>{
    const r=request();const response=await handleCommunicationNoteEdit(r,DOC);
    expect(response.status).toBe(503);expect(await response.json()).toEqual({status:"UNAVAILABLE"});expect(r.bodyUsed).toBe(false);
  });
  it("keeps writer/candidate outside formal activation and the approved manifest",()=>{
    const route=readFileSync("src/app/api/ai-documents/communication-note/documents/[documentId]/revisions/route.ts","utf8");
    expect(route).not.toContain("DurableEdit");expect(route).not.toContain("edit-durable");
    const file="20260907132707_add_communication_note_wording_edit_shadow.sql";
    expect(readdirSync("supabase/migrations")).not.toContain(file);
    const sql=readFileSync(`supabase/migration-candidates/${file}`,"utf8");
    expect(sql).toContain("create function careslink_communication_edit.save_wording");
    expect(sql).toContain("revoke all on function public.save_communication_note_wording");
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*?to\s+authenticated/i);
  });
});
