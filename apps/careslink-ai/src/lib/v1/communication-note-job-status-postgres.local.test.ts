import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createJobStatusSqlBroker, createJobStatusPostgresCredentialResolver,
  createTestOnlyJobStatusUnixRuntimeOpener, type JobStatusIssuerBroker } from "./communication-note-job-status-postgres.server";
import { createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget as target,
  createCaresLinkV1CommunicationNoteJobStatusPurposeCallerAdapter as adapter } from "./communication-note-job-status-purpose-caller.server";
import { createCommunicationNoteJobRecoveryComposition } from "../communication-note-job-recovery-composition.server";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";

vi.mock("server-only", () => ({}));
const socket = process.env.CARESLINK_JOB_STATUS_LOCAL_SOCKET;
const USER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", OTHER_SESSION="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const hash = (v: unknown) => createHash("sha256").update(stringifyCaresLinkV1CanonicalJson(v)).digest("hex");
const request = () => new Request(`https://app.example.invalid/api/ai-documents/communication-note/jobs/${JOB}`);
let admin: Client;
const clients: Client[] = [];
async function connect(user: "postgres" | "status_test_bootstrap" = "postgres") {
  const client = new Client({ host:socket,port:15437,user,password:"",database:"postgres",ssl:false,
    connectionTimeoutMillis:1000,query_timeout:6000,options:"-c statement_timeout=5000 -c lock_timeout=1500",
    application_name:"job-status-issuer-local-test" });
  client.on("error",()=>{}); clients.push(client); await client.connect(); return client;
}
function setup(override?: (broker: JobStatusIssuerBroker) => JobStatusIssuerBroker) {
  // Adapter metadata is a synthetic PG17/TLS contract fixture; the explicitly
  // TestOnly opener independently attests real LOCAL PG16/Unix. Never Hosted proof.
  const databaseTarget = target({ status:"VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",deploymentEnvironment:"PREVIEW",
    targetClass:"DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",targetProjectRefHmac:hash("preview"),productionProjectRefHmac:hash("parent"),
    controlPlaneEvidenceSha256:hash("control"),databaseName:"postgres",postgresMajor:17,projectStatus:"ACTIVE_HEALTHY",
    connectionMode:"DIRECT",port:5432,tlsMode:"VERIFY_FULL_PINNED_CA",tlsRootCertificateSha256:hash("test-CA"),
    observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+240000).toISOString(),
    defaultBranch:false,persistent:false,withData:false,productionExcluded:true,rawCredentialMaterialPresent:false });
  const actualBroker = createJobStatusSqlBroker(async()=>connect());
  const broker = override ? override(actualBroker) : actualBroker;
  const resolver = createJobStatusPostgresCredentialResolver({ target:databaseTarget,broker,
    openRuntime:createTestOnlyJobStatusUnixRuntimeOpener({socket:socket!,port:15437}) });
  const clock={now:()=>new Date().toISOString()};
  const a=adapter({databaseTarget,credentialResolver:resolver,clock});
  const read=(userId=USER,sessionId=SESSION,signal=new AbortController().signal) =>
    a.createRepository({principal:{userId,sessionId,transport:"COOKIE"},signal}).get({jobId:JOB});
  return {read,resolver,broker,actualBroker,databaseTarget,clock};
}
async function noResidue() {
  expect((await admin.query("select count(*)::int as n from pg_roles where rolname like 'careslink_v1_job_status_runtime_%'")).rows[0].n).toBe(0);
  expect((await admin.query("select count(*)::int as n from pg_stat_activity where usename like 'careslink_v1_job_status_runtime_%'")).rows[0].n).toBe(0);
  expect((await admin.query("select count(*)::int as n from careslink_job_status_issuer.acquisitions where state<>'REVOKED'")).rows[0].n).toBe(0);
}

describe.skipIf(!socket)("actual PostgreSQL job status issuer and source composition (LOCAL only)",()=>{
  beforeAll(async()=>{
    expect(socket).toMatch(/^\/private\/tmp\/cl-job-status-[a-zA-Z0-9]{6}\/socket$/);
    let stage="CONNECT";
    try {
      admin=await connect();
      stage="SCHEMA";
      const bootstrap=await connect("status_test_bootstrap");
      try { await bootstrap.query(await readFile("scripts/preview-e2e/communication-note-job-status-issuer-local.sql","utf8")); }
      finally { await bootstrap.end(); }
      stage="SESSION";
      await admin.query("update auth.sessions set not_after=null where id=$1",[SESSION]);
    } catch(error) {
      const e=error as {code?:string;position?:string;message?:string};
      const code=/^[0-9A-Z]{5}$/.test(e.code??"")?e.code:"UNKNOWN";
      const position=/^\d+$/.test(e.position??"")?e.position:"UNKNOWN";
      const deniedSetting=e.message?.match(/^permission denied to examine "([a-z_]+)"$/)?.[1];
      const knownSetting=deniedSetting && ["unix_socket_directories","unix_socket_permissions","cluster_name","listen_addresses"].includes(deniedSetting)
        ? deniedSetting.toUpperCase():"NONE";
      const deniedDatabase=e.message==="permission denied for database postgres"?"DATABASE":"NONE";
      throw new Error(`LOCAL_ISSUER_SETUP_${stage}_${code}_AT_${position}_SETTING_${knownSetting}_${deniedDatabase}`);
    }
  });
  afterAll(async()=>{ await Promise.allSettled(clients.map(c=>c.end())); });
  it("uses real source resolver/adapter/repository with a separately authenticated single-use backend",async()=>{
    const h=setup(); const result=await h.read(); expect(result.status).toBe("CANCELLED");
    const evidence=(await admin.query("select state,backend_pid,binding is not null as bound,fence_xid is not null as fenced from careslink_job_status_issuer.acquisitions")).rows;
    expect(evidence).toHaveLength(1); expect(evidence[0]).toMatchObject({state:"REVOKED",bound:true,fenced:true});
    await noResidue();
  });
  it("rejects a different owner using actual SQL/RLS and still removes the role",async()=>{
    await expect(setup().read(OTHER,OTHER_SESSION)).rejects.toMatchObject({code:"NOT_FOUND"}); await noResidue();
  });
  it("rejects a mismatched current session using actual SQL",async()=>{
    await expect(setup().read(USER,OTHER_SESSION)).rejects.toMatchObject({code:"SESSION_REVOKED"}); await noResidue();
  });
  it("forbids replay after committed revocation from a fresh broker connection",async()=>{
    let captured: Record<string,unknown>={};
    const h=setup(b=>({async call(op,data,ctx){if(op==="acquire") captured={...data};return b.call(op,data,ctx);}}));
    await h.read();
    await expect(h.actualBroker.call("acquire",captured,{signal:new AbortController().signal})).rejects.toMatchObject({message:"ISSUER_REPLAY_DENIED"});
    // Fixture captured a verifier solely for replay; clear its retained reference.
    captured={}; await noResidue();
  });
  it("atomically blocks acquire arriving after a no-lease cancellation fence",async()=>{
    let first=true;
    const h=setup(b=>({async call(op,data,ctx){
      if(op==="acquire" && first){ first=false; await b.call("fence",{digest:data.digest,targetDigest:data.targetDigest},ctx);
        await b.call("finalize",{digest:data.digest,targetDigest:data.targetDigest},ctx); }
      return b.call(op,data,ctx);
    }}));
    await expect(h.read()).rejects.toThrow(); await noResidue();
  });
  it("never returns a successful read if authoritative cleanup reports failure",async()=>{
    const h=setup(b=>({async call(op,data,ctx){const result=await b.call(op,data,ctx);
      if(op==="finalize") return {...result,sessionCount:1}; return result;}}));
    await expect(h.read()).rejects.toThrow(); await noResidue();
  });
  it("composes real physical query/issuer with the actual Cookie principal and HTTP handler",async()=>{
    const h=setup(); const REF="abcdefghijklmnopqrst",KEY="sb_publishable_1234567890abcdef";
    const handle=createCommunicationNoteJobRecoveryComposition({env:{
      CARESLINK_V1_PRODUCT_API_ENABLED:"true",CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_ENABLED:"true",
      CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_SUPABASE_REF:REF,
      CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_VERCEL_PROJECT_ID:"prj_1234567890abcdef",
      VERCEL:"1",VERCEL_ENV:"preview",VERCEL_TARGET_ENV:"preview",VERCEL_PROJECT_ID:"prj_1234567890abcdef",
      SUPABASE_URL:`https://${REF}.supabase.co`,NEXT_PUBLIC_SUPABASE_URL:`https://${REF}.supabase.co`,
      SUPABASE_PUBLISHABLE_KEY:KEY,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:KEY},
      async resolveDatabase(){return {projectRef:REF,databaseTarget:h.databaseTarget,credentialResolver:h.resolver,clock:h.clock};},
      // Auth-only fixtures: this gate proves physical SQL, not browser/GoTrue.
      async createCookieAuthClient(){return {auth:{
        getClaims:async()=>({data:{claims:{sub:USER,session_id:SESSION}},error:null}),
        getUser:async()=>({data:{user:{id:USER}},error:null})},rpc:async()=>({data:"ACTIVE",error:null})};},
    })!;
    const result=await handle(request(),JOB);
    expect(result.status).toBe(200); expect(await result.json()).toMatchObject({status:"AVAILABLE",job:{jobId:JOB}});
    await noResidue();
  });
  it("requires fence commit before finalizing, even on the same database connection",async()=>{
    const digest=hash("same-transaction"),targetDigest=hash("target");
    const peer=await connect();
    await peer.query("begin");
    await peer.query("select careslink_job_status_issuer.call('fence',$1::jsonb)",[JSON.stringify({digest,targetDigest})]);
    await expect(peer.query("select careslink_job_status_issuer.call('finalize',$1::jsonb)",[JSON.stringify({digest,targetDigest})]))
      .rejects.toMatchObject({message:"ISSUER_COMMITTED_FENCE_REQUIRED"});
    await peer.query("rollback"); await peer.end(); await noResidue();
  });
  it("exposes neither broker functions nor tables to public/API/read runtime roles",async()=>{
    for(const role of ["anon","authenticated","service_role","authenticator","careslink_v1_generation_job_status_caller"]){
      expect((await admin.query("select has_function_privilege($1,'careslink_job_status_issuer.call(text,jsonb)','execute') as ok",[role])).rows[0].ok).toBe(false);
      expect((await admin.query("select has_table_privilege($1,'careslink_job_status_issuer.acquisitions','select,insert,update,delete') as ok",[role])).rows[0].ok).toBe(false);
    }
    expect((await admin.query("select column_name from information_schema.columns where table_schema='careslink_job_status_issuer'")).rows.map(r=>r.column_name).join(","))
      .not.toMatch(/password|verifier|secret/);
  });
});
