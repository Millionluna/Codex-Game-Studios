import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createJobStatusPgRuntimeOpener, createJobStatusPostgresCredentialResolver,
  createTestOnlyJobStatusUnixRuntimeOpener, type JobStatusIssuerBroker } from "./communication-note-job-status-postgres.server";
import { createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget as target,
  createCaresLinkV1CommunicationNoteJobStatusPurposeCallerAdapter as adapter } from "./communication-note-job-status-purpose-caller.server";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";

const state=vi.hoisted(()=>({ configs:[] as Record<string,unknown>[], queries:[] as string[],
  current:"", major:17, authorized:true, closes:0, endFails:false }));
vi.mock("server-only",()=>({}));
vi.mock("pg",()=>({Client:class {
  password:unknown; connectionParameters:{password:unknown};
  connection={stream:{encrypted:true,authorized:state.authorized,destroy(){state.closes++;}}};
  constructor(public config:Record<string,unknown>){state.configs.push(config);this.password=config.password;this.connectionParameters={password:config.password};}
  on(){} async connect(){} async end(){if(state.endFails)throw new Error("PRIVATE_CLOSE_FAILURE");}
  async query(sql:string){state.queries.push(sql);
    if(sql.includes("pg_backend_pid"))return {rows:[{pid:123,start:new Date().toISOString(),login:this.config.user,current:this.config.user,
      oid:"456",major:state.major,database:"postgres",cluster:"",unix_only:false}]};
    if(sql.startsWith("set role")){state.current="careslink_v1_generation_job_status_caller";return {rows:[]};}
    if(sql.includes("current_user"))return {rows:[{role:state.current}]};
    return {rows:[{data:{job:{jobId:"33333333-3333-4333-8333-333333333333",noteType:"communication",serviceCode:"note.communication.generate",
      status:"QUEUED",attemptCount:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
      startedAt:null,finishedAt:null,failureCode:null,result:null}}}]};
  }
}}));
const hash=(v:unknown)=>createHash("sha256").update(stringifyCaresLinkV1CanonicalJson(v)).digest("hex");
const ca=Buffer.from("SYNTHETIC_CA_NOT_A_TLS_CERTIFICATE");
const REF="abcdefghijklmnopqrst";
const USER="11111111-1111-4111-8111-111111111111",SESSION="22222222-2222-4222-8222-222222222222",JOB="33333333-3333-4333-8333-333333333333";
beforeEach(()=>{state.configs=[];state.queries=[];state.current="";state.major=17;state.authorized=true;state.closes=0;state.endFails=false;});
function setup(){
  const databaseTarget=target({status:"VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",deploymentEnvironment:"PREVIEW",
    targetClass:"DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",targetProjectRefHmac:hash("target"),productionProjectRefHmac:hash("parent"),
    controlPlaneEvidenceSha256:hash("control"),databaseName:"postgres",postgresMajor:17,projectStatus:"ACTIVE_HEALTHY",connectionMode:"DIRECT",port:5432,
    tlsMode:"VERIFY_FULL_PINNED_CA",tlsRootCertificateSha256:createHash("sha256").update(ca).digest("hex"),
    observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+240000).toISOString(),defaultBranch:false,persistent:false,withData:false,
    productionExcluded:true,rawCredentialMaterialPresent:false});
  let row:Record<string,unknown>={};
  const calls:string[]=[];
  // Unit-only broker facts and pg client. Physical SQL is tested separately.
  const broker:JobStatusIssuerBroker={call:vi.fn(async(op,data)=>{
    calls.push(op);
    if(op==="acquire") row={digest:data.digest,targetDigest:data.targetDigest,state:"ISSUED",role:data.role,lease:data.lease,
      binding:null,oid:"456",issuedAt:new Date().toISOString(),expiresAt:data.expiresAt,roleCount:1,sessionCount:0,membershipCount:1};
    if(op==="bind")row={...row,state:"BOUND",binding:data.binding};
    if(op==="fence")row={digest:data.digest,targetDigest:data.targetDigest,role:null,...row,state:"FENCED"};
    if(op==="finalize")row={...row,state:"REVOKED",roleCount:0,sessionCount:0,membershipCount:0};
    return {...row};
  })};
  const openRuntime=createJobStatusPgRuntimeOpener({projectRef:REF,ca,target:databaseTarget});
  const resolver=createJobStatusPostgresCredentialResolver({target:databaseTarget,broker,openRuntime});
  const a=adapter({databaseTarget,credentialResolver:resolver,clock:{now:()=>new Date().toISOString()}});
  const read=(signal=new AbortController().signal)=>a.createRepository({principal:{userId:USER,sessionId:SESSION,transport:"COOKIE"},signal}).get({jobId:JOB});
  return {databaseTarget,broker,calls,resolver,read,openRuntime};
}
describe("job-status PostgreSQL source boundary",()=>{
  it("executes one fixed query and authoritative cleanup through the actual source modules",async()=>{
    const h=setup();expect((await h.read()).jobId).toBe(JOB);
    expect(h.calls).toEqual(["acquire","bind","fence","finalize","fence","finalize"]);
    expect(state.configs).toHaveLength(1);expect(state.closes).toBe(1);
    expect(state.queries.filter(sql=>sql.includes("get_v1_communication_note_job_status"))).toHaveLength(1);
    expect(state.configs[0]).toMatchObject({host:`db.${REF}.supabase.co`,port:5432,database:"postgres",ssl:{rejectUnauthorized:true},
      connectionTimeoutMillis:3000,statement_timeout:5000,lock_timeout:1000});
    expect(state.configs[0].password).toBeUndefined();
    expect(JSON.stringify(h.resolver)).not.toMatch(/password|verifier|postgres:\/\//);
  });
  it.each(["production","wrong-ca","pooler","data-target"])("denies %s before creating any pg.Client",name=>{
    const h=setup();
    const input={projectRef:REF,ca,target:h.databaseTarget};
    if(name==="production")input.projectRef=CARESLINK_PRODUCTION_SUPABASE_REF;
    if(name==="wrong-ca")input.ca=Buffer.from("BAD");
    if(name==="pooler")input.target={...input.target,connectionMode:"SESSION_POOLER"};
    if(name==="data-target")Object.assign(input.target={...input.target},{withData:true});
    expect(()=>createJobStatusPgRuntimeOpener(input)).toThrow();expect(state.configs).toEqual([]);
  });
  it.each(["tls","version"])("rejects %s mismatch and still revokes issued credentials",async mode=>{
    const h=setup();if(mode==="tls")state.authorized=false;else state.major=16;
    await expect(h.read()).rejects.toThrow();expect(h.calls).toContain("finalize");expect(state.closes).toBe(1);
    expect(state.queries.some(sql=>sql.includes("get_v1_communication_note_job_status"))).toBe(false);
  });
  it("blocks already-cancelled requests without issuing credentials",async()=>{
    const h=setup();expect(()=>h.read(AbortSignal.abort())).toThrow();expect(h.calls).toEqual([]);
  });
  it("does not turn close failure into a successful read or skip broker cleanup",async()=>{
    const h=setup();state.endFails=true;await expect(h.read()).rejects.toThrow();expect(h.calls).toContain("finalize");
  });
  it.each([null,{}, {requestDigest:"a".repeat(64)},new Proxy({}, {})])("rejects malformed acquisition before broker IO",async input=>{
    const h=setup();await expect(h.resolver.acquire(input,{signal:new AbortController().signal})).rejects.toThrow();expect(h.calls).toEqual([]);
  });
  it.each([null,{}, {requestDigest:"a".repeat(64)}])("rejects malformed revocation before broker IO",async input=>{
    const h=setup();await expect(h.resolver.revoke(input,{signal:new AbortController().signal})).rejects.toThrow();expect(h.calls).toEqual([]);
  });
  it.each(["/tmp/remote/socket","/var/run/postgresql","/private/tmp/cl-job-status-abcdef/../socket"])("refuses unsafe local test path %s",socket=>{
    expect(()=>createTestOnlyJobStatusUnixRuntimeOpener({socket,port:15437})).toThrow();
  });
});
