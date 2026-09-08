import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({read:vi.fn(),file:vi.fn(),realpath:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("node:fs/promises",()=>({readFile:state.file,realpath:state.realpath,writeFile:vi.fn()}));
vi.mock("./communication-note-admission.fixture",()=>({assertAdmissionFixture:()=>"/private/tmp/cl-job-browser-abc123"}));
vi.mock("./communication-note-self-review.fixture",()=>({readReviewDatabaseDocument:state.read}));
import { readSettlementDocument, parseSettlementResultBinding } from "./communication-note-settlement.fixture";
import { settlementSql, SETTLEMENT_COMMANDS, SETTLEMENT_RPC_SIGNATURES, installSettlementBrowserController } from "./communication-note-settlement.database.mjs";
const DOC="99999999-9999-4999-8999-999999999999", REV="22222222-2222-4222-8222-222222222222";
const headers={host:"127.0.0.1:3395","sec-fetch-site":"same-origin"};
const get=(query="",changes:Record<string,string>={})=>new Request("http://localhost:3395/api/ai-documents/communication-note/documents/"+DOC+query,{headers:{...headers,...changes}});
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv("CARESLINK_LOCAL_SETTLEMENT_DATABASE","OWNED_UNIX_SOCKET_ONLY");
  state.realpath.mockImplementation(async(path:string)=>path);
  state.file.mockResolvedValue(JSON.stringify({canonicalId:DOC,revisionId:REV}));
  state.read.mockImplementation(async()=>Response.json({status:"AVAILABLE"}));
});
afterEach(()=>vi.unstubAllEnvs());
describe("local-only settlement result bridge",()=>{
  it.each([null,[],{}, {canonicalId:DOC}, {canonicalId:DOC,revisionId:REV,ownerUserId:DOC},
    {canonicalId:"../../private",revisionId:REV},{canonicalId:DOC,revisionId:"invalid"}])("rejects malformed result bindings %j",value=>{
    expect(()=>parseSettlementResultBinding(value)).toThrow();
  });
  it("requires its independent settlement-mode guard",async()=>{
    vi.stubEnv("CARESLINK_LOCAL_SETTLEMENT_DATABASE","");await expect(readSettlementDocument(get(),DOC)).rejects.toThrow();expect(state.file).not.toHaveBeenCalled();
  });
  it.each<Record<string,string>>([{host:"external.invalid"},{"sec-fetch-site":"cross-site"},{authorization:"Bearer synthetic"}])("rejects foreign transport %j",async changes=>{
    expect((await readSettlementDocument(get("",changes),DOC)).status).toBe(404);expect(state.read).not.toHaveBeenCalled();
  });
  it("does not expose the unrelated seed document or mismatched revision",async()=>{
    expect((await readSettlementDocument(get(),REV)).status).toBe(404);
    expect((await readSettlementDocument(get("?revisionId="+DOC),DOC)).status).toBe(404);expect(state.read).not.toHaveBeenCalled();
  });
  it("denies absent or symlinked metadata without reading a document",async()=>{
    state.file.mockRejectedValue({code:"ENOENT"});expect((await readSettlementDocument(get(),DOC)).status).toBe(404);
    state.realpath.mockResolvedValue("/private/tmp/other");expect((await readSettlementDocument(get(),DOC)).status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });
  it("delegates fresh auth and owner checks for the exact actual result",async()=>{
    const request=get("?revisionId="+REV);expect((await readSettlementDocument(request,DOC)).status).toBe(200);
    expect(state.read).toHaveBeenCalledWith(request,DOC);
    state.read.mockResolvedValue(Response.json({status:"AUTH_REQUIRED"},{status:401}));expect((await readSettlementDocument(get(),DOC)).status).toBe(401);
  });
});
describe("stdin-only settlement operator boundary",()=>{
  it.each(["__proto__","constructor","commit_shadow_points","select * from public.point_wallets"])("rejects arbitrary terminal statement %s",kind=>{
    expect(()=>settlementSql(kind)).toThrow();
  });
  it("pins six RPCs and four commands without generic ledger mutation",()=>{
    expect(SETTLEMENT_COMMANDS).toEqual(["settle-failure","settle-cancel","settle-success","settle-replay"]);
    expect(Object.keys(SETTLEMENT_RPC_SIGNATURES)).toHaveLength(6);
    expect(settlementSql("success")).toContain("$11::jsonb");expect(settlementSql("cancel")).toContain("$5::text");
  });
  it("rejects non-owned roots before any setup SQL",async()=>{
    const query=vi.fn();await expect(installSettlementBrowserController({query},vi.fn(),"/private/tmp/arbitrary")).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("does not ship the operator or credentials into the browser fixture",()=>{
    const runner=readFileSync(new URL("./communication-note-recovery.mjs",import.meta.url),"utf8");
    expect(runner).not.toContain("communication-note-settlement.database.mjs");
    const fixture=readFileSync(new URL("./communication-note-settlement.fixture.ts",import.meta.url),"utf8");
    expect(fixture).not.toMatch(/PASSWORD|new Client|settlementSql|settle-success|set local role/);
    const database=readFileSync(new URL("./communication-note-settlement.database.mjs",import.meta.url),"utf8");
    expect(database).not.toMatch(/fetch\(|session_replication_role|disable trigger|SUPABASE|process\.env|commit_shadow_points\(/);
    expect(database).toContain('flag:"wx"');expect(database).toContain('assert.deepEqual(await observe(),before)');
  });
});
