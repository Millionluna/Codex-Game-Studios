import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobStatusPreviewIssuerService, JOB_STATUS_PREVIEW_ISSUER_READY, type JobStatusPreviewCustody } from "./communication-note-job-status-preview-issuer.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PARENT } from "./ndis-shadow-guard";

const ports=vi.hoisted(()=>({control:vi.fn(),runtime:vi.fn(),resolver:vi.fn(),broker:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./communication-note-job-status-postgres.server",()=>({
  createJobStatusPgControlOpener:ports.control, createJobStatusPgRuntimeOpener:ports.runtime,
  createJobStatusPostgresCredentialResolver:ports.resolver, createJobStatusSqlBroker:ports.broker,
}));
const REF="abcdefghijklmnopqrst", URL=`https://api.supabase.com/v1/projects/${PARENT}/branches`;
const CA=Buffer.from("SYNTHETIC_PINNED_CA"), HMAC=Buffer.alloc(32,17);
const context=()=>({signal:new AbortController().signal});
const branch=()=>({ id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", project_ref:REF, parent_project_ref:PARENT,
  is_default:false,persistent:false,with_data:false,status:"FUNCTIONS_DEPLOYED",
  preview_project_status:"ACTIVE_HEALTHY",deletion_scheduled_at:null });
let fetchMock:ReturnType<typeof vi.fn>;
function response(data:unknown,status=200,url=URL){
  const r=new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
  Object.defineProperty(r,"url",{value:url}); return r;
}
function setup(){
  const loadAccessToken=vi.fn(async()=>({accessToken:"SYNTHETIC_OAUTH_TOKEN_NOT_REAL",scope:"environment:read" as const,expiresAt:new Date(Date.now()+60000).toISOString()}));
  const loadDatabaseCredential=vi.fn(async()=>{});
  const loadCa=vi.fn(async()=>CA);
  const custody:JobStatusPreviewCustody={
    consumeAccessToken:async(_ctx,consumer)=>consumer(await loadAccessToken()),
    loadCa,
    hmacProjectRef:async ref=>createHmac("sha256",HMAC).update(`careslink:job-status:project-ref:v1:${ref}`).digest("hex"),
    consumeDatabaseCredential:loadDatabaseCredential,
  };
  const createCustody=vi.fn(async()=>custody);
  const input={projectRef:REF,expectedCaSha256:createHash("sha256").update(CA).digest("hex"),createCustody};
  return {input,loadAccessToken,loadDatabaseCredential,loadCa,createCustody,service:createJobStatusPreviewIssuerService(input)};
}
beforeEach(()=>{
  vi.clearAllMocks(); ports.control.mockReturnValue(()=>{});ports.runtime.mockReturnValue(()=>{});
  ports.resolver.mockReturnValue(Object.freeze({}));ports.broker.mockReturnValue(Object.freeze({}));
  fetchMock=vi.fn(async()=>response([branch()]));vi.stubGlobal("fetch",fetchMock);
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe("dedicated Preview issuer target binding (synthetic HTTPS/custody ports)",()=>{
  it("authenticates one read-only branch observation before constructing same-target control/runtime ports",async()=>{
    const h=setup();const result=await h.service.resolve(context());
    expect(JOB_STATUS_PREVIEW_ISSUER_READY).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock).toHaveBeenCalledWith(URL,expect.objectContaining({
      method:"GET",redirect:"error",cache:"no-store",credentials:"omit",
      headers:{authorization:"Bearer SYNTHETIC_OAUTH_TOKEN_NOT_REAL",accept:"application/json"}}));
    expect(result.databaseTarget.targetProjectRefHmac).toBe(createHmac("sha256",HMAC).update(`careslink:job-status:project-ref:v1:${REF}`).digest("hex"));
    expect(ports.control.mock.calls[0][0]).toMatchObject({projectRef:REF,ca:CA});
    expect(ports.runtime.mock.calls[0][0]).toMatchObject({projectRef:REF,ca:CA,target:result.databaseTarget});
    expect(h.loadDatabaseCredential).not.toHaveBeenCalled();
    await ports.control.mock.calls[0][0].consumeCredential(context(),async()=>{});
    expect(h.loadDatabaseCredential).toHaveBeenCalledWith({projectRef:REF,purpose:"JOB_STATUS_ISSUER_CONTROL_ONLY",databaseTarget:result.databaseTarget},expect.anything(),expect.any(Function));
    expect(h.createCustody).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC_|password|accessToken|CERTIFICATE/);
  });
  it.each([
    ["parent",{parent_project_ref:REF}], ["default",{is_default:true}], ["persistent",{persistent:true}],
    ["copied data",{with_data:true}], ["unhealthy",{preview_project_status:"INACTIVE"}],
    ["missing health",{preview_project_status:undefined}], ["not ready",{status:"CREATING_PROJECT"}],
    ["scheduled deletion",{deletion_scheduled_at:"2026-09-07T12:00:00Z"}], ["invalid id",{id:"../foreign"}],
  ])("denies %s without consulting database custody",async(_name,change)=>{
    const h=setup();fetchMock.mockResolvedValue(response([{...branch(),...change}]));
    await expect(h.service.resolve(context())).rejects.toThrow("Job status Preview issuer unavailable");
    expect(ports.control).not.toHaveBeenCalled();expect(h.loadDatabaseCredential).not.toHaveBeenCalled();
  });
  it.each([[],[branch(),branch()],{branches:[branch()]}])("denies missing, duplicated or wrapped rows",async rows=>{
    const h=setup();fetchMock.mockResolvedValue(response(rows));await expect(h.service.resolve(context())).rejects.toThrow();
    expect(ports.control).not.toHaveBeenCalled();
  });
  it.each([401,403,500])("does not retry a %s response or expose provider errors",async status=>{
    const h=setup();fetchMock.mockResolvedValue(response({message:"PRIVATE_ERROR"},status));
    await expect(h.service.resolve(context())).rejects.toThrow("Job status Preview issuer unavailable");expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects a different response origin even after a 200",async()=>{
    const h=setup();fetchMock.mockResolvedValue(response([branch()],200,"https://example.invalid"));
    await expect(h.service.resolve(context())).rejects.toThrow();expect(ports.control).not.toHaveBeenCalled();
  });
  it("bounds response bytes before target construction",async()=>{
    const h=setup();fetchMock.mockResolvedValue(response([{...branch(),ignored:"x".repeat(131073)}]));
    await expect(h.service.resolve(context())).rejects.toThrow();expect(ports.control).not.toHaveBeenCalled();
  });
  it("keeps already aborted requests free of token/HTTP/DB operations",async()=>{
    const h=setup();await expect(h.service.resolve({signal:AbortSignal.abort()})).rejects.toThrow();
    expect(h.loadAccessToken).not.toHaveBeenCalled();expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels an uncooperative pending token loader",async()=>{
    const h=setup(), c=new AbortController();h.loadAccessToken.mockReturnValue(new Promise(()=>{}));
    const pending=h.service.resolve({signal:c.signal});c.abort();await expect(pending).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refreshes target evidence independently per request",async()=>{
    const h=setup();await h.service.resolve(context());fetchMock.mockResolvedValue(response([{...branch(),persistent:true}]));
    await expect(h.service.resolve(context())).rejects.toThrow();expect(fetchMock).toHaveBeenCalledTimes(2);expect(ports.control).toHaveBeenCalledTimes(1);
  });
  it.each(["production","invalid ca hash"])("rejects %s configuration before IO",kind=>{
    const h=setup();const input={...h.input};
    if(kind==="production")input.projectRef=PARENT;
    if(kind==="invalid ca hash")input.expectedCaSha256="invalid";
    expect(()=>createJobStatusPreviewIssuerService(input)).toThrow();expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a custody CA that does not match the deployment pin",async()=>{
    const h=setup();h.loadCa.mockResolvedValue(Buffer.from("WRONG_CA"));
    await expect(h.service.resolve(context())).rejects.toThrow();expect(ports.control).not.toHaveBeenCalled();
  });
  it("opens a fresh custody scope for cleanup after the original request aborts",async()=>{
    const h=setup(),original=new AbortController();await h.service.resolve({signal:original.signal});original.abort();
    const cleanup=context();await ports.control.mock.calls[0][0].consumeCredential(cleanup,async()=>{});
    expect(h.createCustody).toHaveBeenLastCalledWith(cleanup);
    expect(h.loadDatabaseCredential).toHaveBeenCalledTimes(1);
  });
  it("rejects expired token before HTTP",async()=>{
    const h=setup();h.loadAccessToken.mockResolvedValue({accessToken:"SYNTHETIC_OAUTH_TOKEN_NOT_REAL",scope:"environment:read",expiresAt:new Date().toISOString()});
    await expect(h.service.resolve(context())).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();
  });
});
