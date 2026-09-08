import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createCommunicationNoteDurableExportHistory, EXPORT_HISTORY_RECORD_RPC as WRITE,
  EXPORT_HISTORY_LIST_RPC as READ, type ExportHistoryEnv } from "./communication-note-export-history-durable.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import { handleExportHistory } from "./communication-note-export-history.server";
vi.mock("server-only", () => ({}));

const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",SESSION="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC="11111111-1111-4111-8111-111111111111",REV="22222222-2222-4222-8222-222222222222",KEY="33333333-3333-4333-8333-333333333333";
const report={revisionId:REV,format:"TXT",outcome:"DOWNLOAD_INITIATED",startedAt:"2026-09-08T01:00:00.000Z"} as const;
const entry={...report,attemptId:KEY,revisionNumber:1,recordedAt:"2026-09-08T01:00:01.000Z",templateVersion:"communication-record-text.2026-09-08.1",profile:"RECORD_COPY"};
const ack={status:"RECORDED",canonicalId:DOC,storage:"DURABLE",entry};
const list={status:"AVAILABLE",canonicalId:DOC,revisionId:REV,storage:"DURABLE",entries:[entry],hasMore:false};
const env:ExportHistoryEnv={CARESLINK_COMMUNICATION_NOTE_EXPORT_HISTORY_ENABLED:"true",CARESLINK_V1_PRODUCT_API_ENABLED:"true",
  CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED:"true",CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:"syntheticpreviewref",
  SUPABASE_URL:"https://syntheticpreviewref.supabase.co",VERCEL_ENV:"preview"};
const request=(headers:Record<string,string>={})=>new Request(`https://example.test/api/ai-documents/communication-note/documents/${DOC}/export-history`,{
  method:"POST",headers:{origin:"https://example.test","sec-fetch-site":"same-origin","content-type":"application/json","idempotency-key":KEY,...headers},body:JSON.stringify(report)});
const input=(r=request())=>({request:r,canonicalId:DOC,attemptId:KEY,report});
const readInput=(r=request())=>({request:r,canonicalId:DOC,revisionId:REV});
function fixture(overrides:ExportHistoryEnv={}) {
  const rpc=vi.fn(async(name:string,args?:Readonly<Record<string,unknown>>):Promise<{data:unknown;error:null|{code:string;message:string}}>=>{
    void args;return {data:name===WRITE?ack:name===READ?list:"ACTIVE",error:null};
  });
  const auth={getClaims:vi.fn(async()=>({data:{claims:{sub:OWNER,session_id:SESSION}},error:null})),
    getUser:vi.fn(async()=>({data:{user:{id:OWNER}},error:null}))};
  const factory=vi.fn(async()=>({auth,rpc}));
  return {rpc,auth,factory,port:createCommunicationNoteDurableExportHistory({env:{...env,...overrides},createCookieClient:factory})};
}
describe("uninstalled durable export history capability",()=>{
  it.each<ExportHistoryEnv>([
    {CARESLINK_COMMUNICATION_NOTE_EXPORT_HISTORY_ENABLED:undefined},{CARESLINK_COMMUNICATION_NOTE_EXPORT_HISTORY_ENABLED:"false"},
    {CARESLINK_V1_PRODUCT_API_ENABLED:"false"},{CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED:"false"},
    {VERCEL_ENV:"production"},{VERCEL_ENV:undefined},{CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:"differentpreview"},
    {SUPABASE_URL:`https://${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`,CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF:CARESLINK_PRODUCTION_SUPABASE_REF},
  ])("denies disabled/Production/mismatched targets before auth %j",async overrides=>{
    const f=fixture(overrides);expect(await f.port.record(input())).toEqual({status:"UNAVAILABLE"});
    expect(await f.port.list(readInput())).toEqual({status:"UNAVAILABLE"});expect(f.factory).not.toHaveBeenCalled();
  });
  it("cannot borrow document-read or generic-write capability",async()=>{
    const f=fixture({CARESLINK_COMMUNICATION_NOTE_EXPORT_HISTORY_ENABLED:undefined,
      CARESLINK_V1_PRODUCT_API_DOCUMENT_DETAIL_ENABLED:"true",CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED:"true"});
    expect(await f.port.record(input())).toEqual({status:"UNAVAILABLE"});expect(await f.port.list(readInput())).toEqual({status:"UNAVAILABLE"});expect(f.factory).not.toHaveBeenCalled();
  });
  it("uses a single verified Cookie client per operation with no owner/session/body RPC parameters",async()=>{
    const f=fixture();expect(await f.port.record(input())).toEqual(ack);expect(f.factory).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls).toEqual([["resolve_v1_current_session_status"],[WRITE,{p_document_id:DOC,p_attempt_id:KEY,p_report:report}]]);
    f.rpc.mockClear();expect(await f.port.list(readInput())).toEqual(list);expect(f.factory).toHaveBeenCalledTimes(2);
    expect(f.rpc.mock.calls).toEqual([["resolve_v1_current_session_status"],[READ,{p_document_id:DOC,p_revision_id:REV}]]);
    expect(f.auth.getUser).toHaveBeenCalledWith();expect(f.auth.getClaims).toHaveBeenCalledWith();
  });
  it("denies bearer and malformed injected metadata before constructing a client",async()=>{
    const f=fixture(),r=request({authorization:"Bearer synthetic"});
    expect(await f.port.record(input(r))).toEqual({status:"AUTH_REQUIRED"});expect(await f.port.list(readInput(r))).toEqual({status:"AUTH_REQUIRED"});
    expect(await f.port.record({...input(),report:{...report,englishDraft:"private"} as never})).toEqual({status:"INVALID_REQUEST"});
    expect(await f.port.record({...input(),attemptId:"bad"})).toEqual({status:"INVALID_REQUEST"});
    expect(await f.port.list({...readInput(),revisionId:"bad"})).toEqual({status:"INVALID_REQUEST"});expect(f.factory).not.toHaveBeenCalled();
  });
  it.each(["REVOKED","UNAVAILABLE"])("stops both operations when active-session proof is %s",async status=>{
    const f=fixture();f.rpc.mockResolvedValue({data:status,error:null});
    expect(await f.port.record(input())).toEqual({status:status==="REVOKED"?"AUTH_REQUIRED":"UNAVAILABLE"});
    expect(await f.port.list(readInput())).toEqual({status:status==="REVOKED"?"AUTH_REQUIRED":"UNAVAILABLE"});
    expect(f.rpc.mock.calls.every(([name])=>name==="resolve_v1_current_session_status")).toBe(true);
  });
  it("denies a verified-user mismatch",async()=>{
    const f=fixture();f.auth.getUser.mockResolvedValue({data:{user:{id:REV}},error:null});
    expect(await f.port.record(input())).toEqual({status:"AUTH_REQUIRED"});expect(await f.port.list(readInput())).toEqual({status:"AUTH_REQUIRED"});
    expect(f.rpc.mock.calls.every(([name])=>name==="resolve_v1_current_session_status")).toBe(true);
  });
  it.each(["AUTH_REQUIRED","NOT_FOUND","STALE_REVISION","REVIEW_REQUIRED","INVALID_REQUEST","UNAVAILABLE"])("sanitizes fixed SQL status %s",async message=>{
    const f=fixture();f.rpc.mockImplementation(async name=>name===WRITE||name===READ?{data:null,error:{code:"P0001",message}}:{data:"ACTIVE",error:null});
    expect(await f.port.record(input())).toEqual({status:message});expect(await f.port.list(readInput())).toEqual({status:message});
  });
  it.each([
    {...ack,storage:"PROCESS_MEMORY_ONLY"},{...ack,canonicalId:REV},{...ack,privateError:"hidden"},
    {...ack,entry:{...entry,revisionId:DOC}},{...ack,entry:{...entry,attemptId:REV}},
    {...ack,entry:{...entry,format:"PDF"}},{...ack,entry:{...entry,startedAt:"2026-09-08T02:00:00.000Z"}},
    {...ack,entry:{...entry,templateVersion:"future"}},{...ack,entry:{...entry,filename:"private.txt"}},
  ])("rejects unsafe or unbound write receipt %j",async data=>{
    const f=fixture();f.rpc.mockImplementation(async name=>({data:name===WRITE?data:"ACTIVE",error:null}));
    expect(await f.port.record(input())).toEqual({status:"UNAVAILABLE"});expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it.each([
    {...list,storage:"PROCESS_MEMORY_ONLY"},{...list,revisionId:DOC},{...list,canonicalId:REV},
    {...list,entries:[{...entry,body:"private"}]},{...list,entries:[entry,entry]},
    {...list,hasMore:true},{...list,entries:[{...entry,revisionId:DOC}]},
  ])("rejects unsafe or unbound history list %j",async data=>{
    const f=fixture();f.rpc.mockImplementation(async name=>({data:name===READ?data:"ACTIVE",error:null}));
    expect(await f.port.list(readInput())).toEqual({status:"UNAVAILABLE"});expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it.each([{code:"55P03",message:"private lock SQL"},{code:"OTHER",message:"AUTH_REQUIRED"},{code:"P0001",message:"PRIVATE_FAILURE"}])("redacts backend errors without retry %j",async error=>{
    const f=fixture();f.rpc.mockImplementation(async name=>name===READ||name===WRITE?{data:null,error}:{data:"ACTIVE",error:null});
    expect(await f.port.record(input())).toEqual({status:"UNAVAILABLE"});expect(await f.port.list(readInput())).toEqual({status:"UNAVAILABLE"});expect(f.rpc).toHaveBeenCalledTimes(4);
  });
  it("handles absent client, network failure and abort without durable-success claims",async()=>{
    const empty=createCommunicationNoteDurableExportHistory({env,createCookieClient:async()=>undefined});
    expect(await empty.record(input())).toEqual({status:"UNAVAILABLE"});expect(await empty.list(readInput())).toEqual({status:"UNAVAILABLE"});
    for(const mode of ["record","list"] as const){
      const f=fixture();f.rpc.mockImplementation(async name=>{if(name===READ||name===WRITE) throw Error("private network error");return {data:"ACTIVE",error:null};});
      expect(await (mode==="record"?f.port.record(input()):f.port.list(readInput()))).toEqual({status:"UNAVAILABLE"});expect(f.rpc).toHaveBeenCalledTimes(2);
      const g=fixture(),controller=new AbortController(),r=new Request(request(),{signal:controller.signal});
      g.rpc.mockImplementation(async name=>{if(name===WRITE||name===READ){controller.abort();return {data:name===WRITE?ack:list,error:null};}return {data:"ACTIVE",error:null};});
      expect(await (mode==="record"?g.port.record(input(r)):g.port.list(readInput(r)))).toEqual({status:"UNAVAILABLE"});
      g.factory.mockClear();expect(await g.port.record(input(r))).toEqual({status:"UNAVAILABLE"});expect(await g.port.list(readInput(r))).toEqual({status:"UNAVAILABLE"});expect(g.factory).not.toHaveBeenCalled();
    }
  });
  it("keeps formal HTTP handlers hard-off and body unread",async()=>{
    const r=request();const response=await handleExportHistory(r,DOC);expect(response.status).toBe(503);expect(r.bodyUsed).toBe(false);
    const route=readFileSync("src/app/api/ai-documents/communication-note/documents/[documentId]/export-history/route.ts","utf8");
    expect(route).not.toContain("DurableExportHistory");expect(route).not.toContain("history-durable");
  });
  it("keeps candidate outside migration manifest with private definer and zero API grants",()=>{
    const file="20260908014022_add_communication_note_export_history_shadow.sql";
    expect(readdirSync("supabase/migrations")).not.toContain(file);
    const sql=readFileSync(`supabase/migration-candidates/${file}`,"utf8");
    expect(sql).toContain("create function careslink_communication_history.access_reports");
    expect(sql).toContain("security invoker set search_path = ''");
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*?to\s+authenticated/i);
    expect(sql).not.toMatch(/grant\s+.*\bon\s+auth\.(users|sessions)/i);
    const runner=readFileSync("scripts/preview-e2e/communication-note-self-review-local-pg16.mjs","utf8");
    expect(runner).toContain('assert.ok(process.argv.length === 2 || edit || history)');
    expect(runner).toContain('"-D", data, "-h", "", "-k", socket');
    expect(runner).not.toContain("process.env.DATABASE_URL");
  });
});
