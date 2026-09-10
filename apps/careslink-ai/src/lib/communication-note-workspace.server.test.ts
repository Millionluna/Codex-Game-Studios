import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { createCommunicationNoteWorkspaceHandler, handleCommunicationNoteWorkspaceRequest, type CommunicationNoteWorkspaceRuntime } from "./communication-note-workspace.server";
import { isCommunicationNoteWorkspaceEnabled } from "./communication-note-workspace-feature.server";
import { COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME } from "./communication-note-workspace-runtime.server";
import { GET } from "../app/api/ai-documents/communication-note/documents/route";
import { CaresLinkV1ContractError } from "./v1/shared-contracts";
import nextConfig from "../../next.config";
const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const identity={userId:OWNER,sessionId:SESSION,transport:"COOKIE" as const};
const tasks={tasks:[],nextCursor:null},documents={documents:[],nextCursor:null,hasMore:false};
const resolve=vi.fn(),create=vi.fn(),listTasks=vi.fn(),listDocuments=vi.fn();
const runtime:CommunicationNoteWorkspaceRuntime={resolvePrincipal:resolve,createReaders:create};
const request=(query="",init:RequestInit={})=>new Request("https://app.example.invalid/api/ai-documents/communication-note/documents"+query,
  {headers:{"sec-fetch-site":"same-origin",cookie:"opaque"},...init});
const run=(r=request())=>createCommunicationNoteWorkspaceHandler({enabled:()=>true,runtime})(r);
beforeEach(()=>{vi.resetAllMocks();resolve.mockResolvedValue({ok:true,principal:identity});create.mockResolvedValue({listTasks,listDocuments});listTasks.mockResolvedValue(tasks);listDocuments.mockResolvedValue(documents);});
afterEach(()=>vi.unstubAllEnvs());
describe("formal default-off workspace gate",()=>{
  it.each([undefined,"","false","TRUE","1"," true "])("stays off for %s",value=>expect(isCommunicationNoteWorkspaceEnabled({CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED:value})).toBe(false));
  it("recognizes only the explicit server-side switch",()=>expect(isCommunicationNoteWorkspaceEnabled({CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED:"true"})).toBe(true));
  it("disabled/unbound handlers do not inspect requests or initialize readers",async()=>{
    const trap=vi.fn(()=>{throw new Error("inspected request");}),r=new Proxy({},{get:trap}) as Request;
    for(const options of [{enabled:()=>false,runtime},{enabled:()=>true}]) {
      const response=await createCommunicationNoteWorkspaceHandler(options)(r);expect(response.status).toBe(503);expect(await response.json()).toEqual({status:"UNAVAILABLE"});
    }
    expect(trap).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
  });
  it.each([undefined,"true"])("the actual app GET stays closed with UI flag %s and no source-installed runtime",async flag=>{
    vi.stubEnv("CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED",flag);expect(COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined();
    for(const handler of [GET,handleCommunicationNoteWorkspaceRequest]) {
      const r=await handler(request("?owner=private"));expect(r.status).toBe(503);expect(await r.json()).toEqual({status:"UNAVAILABLE"});
      expect(r.headers.get("cache-control")).toContain("private, no-store");expect(r.headers.get("vary")).toBe("Cookie, Authorization");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect(resolve).not.toHaveBeenCalled();
  });
  it("adds private/noindex/no-referrer page headers without changing database flags",async()=>{
    const rule=(await nextConfig.headers!()).find(r=>r.source==="/ai-documents");
    expect(rule?.headers).toEqual(expect.arrayContaining([{key:"Cache-Control",value:"private, no-store, max-age=0"},{key:"Referrer-Policy",value:"no-referrer"},{key:"X-Robots-Tag",value:"noindex, nofollow"}]));
    const source=readFileSync(new URL("./communication-note-workspace-runtime.server.ts",import.meta.url),"utf8");
    expect(source).not.toMatch(/process\.env\s*(?:\.|\[)|new Client|service_role|globalThis|__workspace|fixture/);
    expect(source).toContain("HOSTED_WORKSPACE_READ_BINDING = undefined as CommunicationNoteWorkspacePreviewBinding");
    expect(COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME).toBeUndefined();
  });
});
describe("shared workspace HTTP composition",()=>{
  it("binds both metadata readers to the same fresh server principal and fixed page size",async()=>{
    const r=request(),response=await run(r);expect(response.status).toBe(200);
    expect(await response.json()).toEqual({status:"AVAILABLE",documents:[],documentsCursor:null,taskPage:tasks});
    expect(create).toHaveBeenCalledWith({principal:identity,request:expect.any(Request)});
    expect(create.mock.calls[0][0].request.url).toBe(r.url);expect(create.mock.calls[0][0].request.headers.get("cookie")).toBe("opaque");
    expect(create.mock.calls[0][0].request.signal.aborted).toBe(true);expect(r.signal.aborted).toBe(false);
    expect(listTasks).toHaveBeenCalledWith(null);expect(listDocuments).toHaveBeenCalledWith({limit:20});
  });
  it.each<RequestInit>([{method:"POST"},{headers:{"sec-fetch-site":"cross-site"}},{headers:{"sec-fetch-site":"same-origin",authorization:"Bearer opaque"}},
    {headers:{"sec-fetch-site":"same-origin",origin:"https://outside.invalid"}}])("denies transport %# before auth",async init=>{
    expect((await run(request("",init))).status).toBe(503);expect(resolve).not.toHaveBeenCalled();
  });
  it.each(["?owner=private","?limit=100","?before=private","?draftAfter=private","?draftAfter=&draftAfter=private","?type=case_note"])("denies query %s after auth and before data",async query=>{
    expect((await run(request(query))).status).toBe(503);expect(resolve).toHaveBeenCalledOnce();expect(create).not.toHaveBeenCalled();
  });
  it.each(["auth_required","session_revoked"])("auth failure %s clears all output, even for malformed cursors",async reason=>{
    resolve.mockResolvedValue({ok:false,reason,status:401});const r=await run(request("?before=private"));expect(r.status).toBe(401);expect(await r.json()).toEqual({status:"AUTH_REQUIRED"});expect(create).not.toHaveBeenCalled();
  });
  it.each([{...identity,transport:"BEARER"},{...identity,userId:"private"},{...identity,sessionId:"private"},{...identity,ownerId:OWNER}])("rejects invalid principal %#",async principal=>{
    resolve.mockResolvedValue({ok:true,principal});expect((await run()).status).toBe(503);expect(create).not.toHaveBeenCalled();
  });
  it("does not execute principal accessors or proxy traps",async()=>{
    const getter=vi.fn(),value={ok:true,principal:identity};Object.defineProperty(value,"principal",{get:getter,enumerable:true});
    resolve.mockResolvedValue(value);expect((await run()).status).toBe(503);expect(getter).not.toHaveBeenCalled();
    const trap=vi.fn();resolve.mockResolvedValue(new Proxy(identity,{getOwnPropertyDescriptor:trap}));expect((await run()).status).toBe(503);expect(trap).not.toHaveBeenCalled();
  });
  it("rejects readers that include a write or raw SQL capability",async()=>{
    create.mockResolvedValue({listTasks,listDocuments,enqueue:vi.fn()});expect((await run()).status).toBe(503);expect(listDocuments).not.toHaveBeenCalled();
  });
  it.each(["documents","tasks"])("maps %s revocation to a metadata-free auth response",async kind=>{
    (kind==="documents"?listDocuments:listTasks).mockRejectedValue(new CaresLinkV1ContractError("SESSION_REVOKED","private"));
    const r=await run();expect(r.status).toBe(401);expect(await r.json()).toEqual({status:"AUTH_REQUIRED"});
  });
  it("does not return partial drafts when the task read fails",async()=>{
    listTasks.mockRejectedValue(new Error("private"));const r=await run();expect(await r.json()).toEqual({status:"UNAVAILABLE"});expect(r.status).toBe(503);
  });
  it("stops after abort, including an abort between the two metadata reads",async()=>{
    const controller=new AbortController();controller.abort();expect((await run(request("",{signal:controller.signal,headers:{"sec-fetch-site":"same-origin"}}))).status).toBe(503);expect(create).not.toHaveBeenCalled();
    const next=new AbortController();listDocuments.mockImplementation(async()=>{next.abort();return documents;});
    expect((await run(request("",{signal:next.signal,headers:{"sec-fetch-site":"same-origin"}}))).status).toBe(503);expect(listTasks).not.toHaveBeenCalled();
  });
});
