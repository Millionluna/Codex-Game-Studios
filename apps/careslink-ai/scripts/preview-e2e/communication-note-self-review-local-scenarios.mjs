import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { BOOTSTRAP } from "./communication-note-job-status-local-scenarios.mjs";

const MIGRATIONS = [
  "20260809120000_create_v1_shadow_foundation.sql",
  "20260810131648_add_v1_mobile_sync_shadow.sql",
  "20260810135000_harden_shadow_points_grant_identity.sql",
  "20260811102502_add_v1_privacy_review_confirmation.sql",
  "20260811134719_harden_v1_note_facts_schema_and_active_sessions.sql",
  "20260820135834_add_v1_note_generation_durable_shadow.sql",
  "20260821071044_add_v1_note_generation_worker_rpc_shadow.sql",
  "20260902012628_add_v1_authenticated_current_session_status_rpc.sql",
  "../migration-candidates/20260907114955_add_communication_note_self_review_shadow.sql",
];
const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", FOREIGN="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc", FOREIGN_SESSION="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC="11111111-1111-4111-8111-111111111111", REV="22222222-2222-4222-8222-222222222222";
const REV2="33333333-3333-4333-8333-333333333333", DOC2="44444444-4444-4444-8444-444444444444";
const REV3="55555555-5555-4555-8555-555555555555", KEY="66666666-6666-4666-8666-666666666666";
const KEY2="77777777-7777-4777-8777-777777777777";
const PROOF="88888888-8888-4888-8888-888888888888";
const CONTENT=JSON.stringify({
  englishDraft:"Synthetic review test only.",reviewVersions:{"zh-Hans":"合成测试。","zh-Hant":"合成測試。"},
  factsSummary:{occurred_at:"2026-09-07T10:15:30+10:00",contact_channel:"Phone",parties_by_role:["Support worker"],
    observable_facts:"Synthetic call occurred.",action_taken:"Synthetic information was recorded.",stated_outcome:"No further information supplied."},
  missingFacts:[],neutralWordingChecks:[],followUpPrompts:[],disclaimer:"Draft – review required",
});
const RPC="public.confirm_communication_note_self_review(uuid,uuid,uuid,boolean,boolean,boolean)";
const SQL="select public.confirm_communication_note_self_review($1,$2,$3,$4,$5,$6) as data";
const args=(doc=DOC,rev=REV,key=KEY)=>[doc,rev,key,true,true,true];
const claims=(extra={})=>({sub:OWNER,session_id:SESSION,role:"authenticated",is_anonymous:false,exp:Math.floor(Date.now()/1000)+3600,...extra});
async function auth(client, value=claims()) {
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(value)]);
}
const call=async (client,parameters=args())=>(await client.query(SQL,parameters)).rows[0].data;
const denies=(client,message,parameters=args())=>assert.rejects(call(client,parameters),e=>{
  if(e.code!=="P0001" || e.message!==message){
    process.stderr.write(JSON.stringify({expectedStatus:message,actualCode:e.code,
      diagnostic: /^[A-Z_]+$|^permission denied for (schema|table|function) [a-z_]+$/.test(e.message) ? e.message : "UNEXPECTED"})+"\n");
  }
  return e.code==="P0001"&&e.message===message;
});
const expected=(doc=DOC,rev=REV,key=KEY)=>({status:"CONFIRMED",canonicalId:doc,revisionId:rev,mutationId:key,
  saveState:"SERVER_ACKNOWLEDGED",draftNotice:"Draft – review required"});

export async function verifySelfReviewScenarios(owner, actor, peer, passed, onScenario) {
  const scenario=async(name,run)=>{onScenario(name);await run();passed.push(name);};
  await scenario("non-superuser-real-migrations",async()=>{
    await owner.query(BOOTSTRAP);
    await actor.query("set role postgres");
    assert.equal((await actor.query("select rolsuper from pg_roles where rolname=current_user")).rows[0].rolsuper,false);
    for(const name of MIGRATIONS){
      onScenario("migration:"+name);
      await actor.query("begin");
      await actor.query(await readFile(new URL("../../supabase/migrations/"+name,import.meta.url),"utf8"));
      await actor.query("commit");
      if(name==="20260820135834_add_v1_note_generation_durable_shadow.sql") {
        await owner.query("grant usage on schema careslink_v1_generation to postgres");
      }
    }
    await actor.query("reset role");
    await owner.query("revoke usage on schema careslink_v1_generation from postgres");
  });
  await scenario("default-off-and-least-privilege-acls",async()=>{
    assert.deepEqual((await owner.query("select enabled,shadow_only from public.communication_note_self_review_flags")).rows,[{enabled:false,shadow_only:true}]);
    assert.deepEqual((await owner.query(`select r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,
      r.rolcreaterole,r.rolcreatedb,p.prosecdef,p.proconfig from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=$1::regprocedure`,[RPC])).rows,
    [{rolcanlogin:false,rolinherit:false,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,prosecdef:true,proconfig:['search_path=""']}]);
    for(const role of ["anon","authenticated","service_role","authenticator"]){
      assert.equal((await owner.query("select has_function_privilege($1,$2,'EXECUTE') as ok",[role,RPC])).rows[0].ok,role==="authenticated");
      assert.equal((await owner.query("select pg_has_role($1,'careslink_communication_review_executor','MEMBER') as ok",[role])).rows[0].ok,false);
      assert.equal((await owner.query("select has_table_privilege($1,'public.self_review_events','INSERT,UPDATE,DELETE,TRUNCATE') as ok",[role])).rows[0].ok,false);
    }
    const executor="careslink_communication_review_executor";
    for(const table of ["auth.users","auth.sessions","public.point_ledger_entries"]){
      assert.equal((await owner.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as ok",[executor,table])).rows[0].ok,false);
    }
    assert.equal((await owner.query("select has_table_privilege($1,'public.self_review_events','UPDATE,DELETE,TRUNCATE') as ok",[executor])).rows[0].ok,false);
    assert.equal((await owner.query("select has_schema_privilege($1,'public','CREATE') as ok",[executor])).rows[0].ok,false);
    assert.equal((await owner.query("select has_function_privilege($1,'careslink_v1_generation.fresh_session_is_active(uuid,uuid,timestamptz)','EXECUTE') as ok",[executor])).rows[0].ok,true);
    assert.equal((await owner.query("select count(*)::int as n from pg_auth_members where roleid=$1::regrole and (inherit_option or set_option)",[executor])).rows[0].n,0);
  });
  // All FK/CHECK/RLS constraints stay on. These are synthetic saved draft rows,
  // not generated care data or hosted Auth sessions.
  onScenario("seed-synthetic-saved-drafts");
  await owner.query(`insert into auth.users(instance_id,id,aud,role,email_confirmed_at,raw_app_meta_data)
    values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',clock_timestamp()-interval '1 minute','{"role":"provider"}'),
    ('00000000-0000-0000-0000-000000000000',$2,'authenticated','authenticated',clock_timestamp()-interval '1 minute','{"role":"provider"}')`,[OWNER,FOREIGN]);
  await owner.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4)",[SESSION,OWNER,FOREIGN_SESSION,FOREIGN]);
  await owner.query(`insert into public.privacy_reviews(id,owner_user_id,note_type,cleaned_facts_hash,schema_version,
    confirmed_at,expires_at,contract_version,scanner_policy_version,review_revision,mutation_id,request_fingerprint,
    deidentification_confirmed,authority_to_process_confirmed,shadow_only)
    values($1::uuid,$2,'communication',public.v1_shadow_content_sha256($3::jsonb->'factsSummary'),'2026-08-09.v1-shadow',
      now(),now()+interval '30 minutes','1.0.0-shadow.1','2026-08-11.preview.1',1,($1::uuid)::text,repeat('a',64),true,true,true)`,[PROOF,OWNER,CONTENT]);
  for(const [doc,rev] of [[DOC,REV],[DOC2,REV3]]){
    await owner.query(`insert into public.ai_documents(id,owner_user_id,note_type,source_locale,schema_version,contract_version)
      values($1,$2,'communication','en','2026-08-09.v1-shadow','1.0.0-shadow.1')`,[doc,OWNER]);
    await owner.query(`insert into public.ai_document_revisions(id,document_id,owner_user_id,revision_number,content,content_hash,mutation_id,schema_version,contract_version,privacy_review_id)
      values($1::uuid,$2,$3,1,$4::jsonb,public.v1_shadow_content_sha256($4::jsonb),($1::uuid)::text,'2026-08-09.v1-shadow','1.0.0-shadow.1',$5)`,[rev,doc,OWNER,CONTENT,PROOF]);
    await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=1 where id=$1",[doc,rev]);
  }
  await auth(actor); await auth(peer);
  const count=async()=>(await owner.query("select count(*)::int as n from public.self_review_events")).rows[0].n;
  await scenario("independent-database-gates",async()=>{
    await denies(actor,"UNAVAILABLE");
    await owner.query("update public.communication_note_self_review_flags set enabled=true");
    await denies(actor,"UNAVAILABLE");
    assert.equal(await count(),0);
    await owner.query("update public.v1_mobile_sync_shadow_flags set enabled=true");
  });
  await scenario("exact-confirmations-and-owner-type-lifecycle-boundaries",async()=>{
    for(const index of [3,4,5]) for(const value of [false,null]){
      const parameters=args(); parameters[index]=value; await denies(actor,"INVALID_REQUEST",parameters);
    }
    await auth(actor,claims({sub:FOREIGN,session_id:FOREIGN_SESSION})); await denies(actor,"NOT_FOUND");
    await auth(actor);
    await denies(actor,"NOT_FOUND",args(REV3));
    await denies(actor,"STALE_REVISION",args(DOC,REV2));
    for(const change of ["note_type='handover'","lifecycle_status='COMPLETED'","lifecycle_status='TOMBSTONED',tombstoned_at=clock_timestamp()"]){
      await owner.query("update public.ai_documents set "+change+" where id=$1",[DOC]);
      await denies(actor,"NOT_FOUND");
      await owner.query("update public.ai_documents set note_type='communication',lifecycle_status='IN_PROGRESS',tombstoned_at=null where id=$1",[DOC]);
    }
    assert.equal(await count(),0);
  });
  await scenario("commit-and-independent-connection-readback",async()=>{
    assert.equal((await peer.query("select public.get_v1_shadow_document($1) as d",[DOC])).rows[0].d.selfReviewStatus,"REQUIRED");
    assert.deepEqual(await call(actor),expected());
    assert.equal(await count(),1);
    const d=(await peer.query("select public.get_v1_shadow_document($1) as d",[DOC])).rows[0].d;
    assert.equal(d.selfReviewStatus,"CONFIRMED"); assert.equal(d.document.lifecycleStatus,"IN_PROGRESS");
    const event=(await owner.query("select facts_confirmed,wording_confirmed,missing_facts_reviewed from public.self_review_events")).rows;
    assert.deepEqual(event,[{facts_confirmed:true,wording_confirmed:true,missing_facts_reviewed:true}]);
  });
  await scenario("concurrent-replay-one-event-and-key-reuse-denial",async()=>{
    assert.deepEqual(await Promise.all([call(actor),call(peer)]),[expected(),expected()]);
    await denies(actor,"INVALID_REQUEST",args(DOC2,REV3));
    assert.equal(await count(),1);
  });
  await scenario("replay-rechecks-revocation-role-expiry-and-current-revision",async()=>{
    for(const change of [{exp:0},{is_anonymous:true},{role:"service_role"},{session_id:FOREIGN_SESSION},{session_id:"bad"},{sub:"bad"}]){
      await auth(actor,claims(change)); await denies(actor,"AUTH_REQUIRED");
    }
    await auth(actor);
    await owner.query("delete from auth.sessions where id=$1",[SESSION]); await denies(actor,"AUTH_REQUIRED");
    await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);
    await owner.query("update auth.users set raw_app_meta_data='{}',raw_user_meta_data='{\"role\":\"provider\"}' where id=$1",[OWNER]);
    await denies(actor,"AUTH_REQUIRED");
    await owner.query("update auth.users set raw_app_meta_data='{\"role\":\"provider\"}' where id=$1",[OWNER]);
    await owner.query(`insert into public.ai_document_revisions(id,document_id,owner_user_id,revision_number,base_revision_id,content,content_hash,mutation_id,schema_version,contract_version,privacy_review_id)
      values($1::uuid,$2,$3,2,$4,$5::jsonb,public.v1_shadow_content_sha256($5::jsonb),($1::uuid)::text,'2026-08-09.v1-shadow','1.0.0-shadow.1',$6)`,[REV2,DOC,OWNER,REV,CONTENT,PROOF]);
    await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=2 where id=$1",[DOC,REV2]);
    await denies(actor,"STALE_REVISION");
    assert.equal((await peer.query("select public.get_v1_shadow_document($1) as d",[DOC])).rows[0].d.selfReviewStatus,"REQUIRED");
    assert.equal(await count(),1);
  });
  await scenario("transaction-rollback-leaves-no-receipt",async()=>{
    await actor.query("begin");
    assert.deepEqual(await call(actor,args(DOC,REV2,KEY2)),expected(DOC,REV2,KEY2));
    await actor.query("rollback"); assert.equal(await count(),1);
  });
  const blocked=async(client)=>{
    for(let attempt=0;attempt<60;attempt++){
      const rows=(await owner.query("select cardinality(pg_blocking_pids($1))>0 as blocked",[client.processID])).rows;
      if(rows[0].blocked) return;
      await delay(10);
    }
    throw new Error("EXPECTED_DATABASE_LOCK_NOT_OBSERVED");
  };
  await scenario("edit-lock-winner-rejects-stale-confirmation",async()=>{
    await owner.query("begin");
    await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=1 where id=$1",[DOC,REV]);
    const result=denies(actor,"STALE_REVISION",args(DOC,REV2,KEY2));
    await blocked(actor); await owner.query("commit"); await result;
    assert.equal(await count(),1);
  });
  await scenario("session-expiry-during-document-lock-wait-is-rechecked",async()=>{
    await owner.query("update auth.sessions set not_after=clock_timestamp()+interval '700 milliseconds' where id=$1",[SESSION]);
    await owner.query("begin");
    await owner.query("select id from public.ai_documents where id=$1 for update",[DOC]);
    const result=denies(actor,"AUTH_REQUIRED",args(DOC,REV,KEY2));
    await blocked(actor); await delay(760); await owner.query("commit"); await result;
    await owner.query("update auth.sessions set not_after=null where id=$1",[SESSION]);
    assert.equal(await count(),1);
  });
  await scenario("confirmed-transaction-holds-edit-and-revocation-locks",async()=>{
    await actor.query("begin"); await call(actor,args(DOC,REV,KEY2));
    await assert.rejects(owner.query("delete from auth.sessions where id=$1",[SESSION]),e=>e.code==="55P03");
    await assert.rejects(owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=2 where id=$1",[DOC,REV2]),e=>e.code==="55P03");
    await actor.query("commit"); assert.equal(await count(),2);
  });
  await scenario("concurrent-first-submission-and-cross-document-key-collision",async()=>{
    const key="99999999-9999-4999-8999-999999999999";
    await actor.query("begin"); await call(actor,args(DOC,REV,key));
    const repeated=call(peer,args(DOC,REV,key));
    await blocked(peer); await actor.query("commit");
    assert.deepEqual(await repeated,expected(DOC,REV,key));
    assert.equal(await count(),3);
    const crossKey="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await owner.query("begin");
    await owner.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[OWNER+":"+crossKey]);
    const competing=Promise.allSettled([call(actor,args(DOC,REV,crossKey)),call(peer,args(DOC2,REV3,crossKey))]);
    await blocked(actor); await blocked(peer); await owner.query("commit");
    const result=await competing;
    assert.equal(result.filter(r=>r.status==="fulfilled").length,1);
    const rejected=result.find(r=>r.status==="rejected");
    assert.equal(rejected.reason.code,"P0001");assert.equal(rejected.reason.message,"INVALID_REQUEST");
    assert.equal(await count(),4);
  });
  await scenario("jwt-expiry-and-session-revocation-lock-winners",async()=>{
    await auth(actor,claims({exp:Date.now()/1000+0.7}));
    await owner.query("begin");
    await owner.query("select id from public.ai_documents where id=$1 for update",[DOC]);
    const expired=denies(actor,"AUTH_REQUIRED");
    await blocked(actor); await delay(760); await owner.query("commit");await expired;
    await auth(actor);
    await owner.query("begin"); await owner.query("delete from auth.sessions where id=$1",[SESSION]);
    const revoked=denies(actor,"AUTH_REQUIRED");
    await blocked(actor); await owner.query("commit"); await revoked;
    await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);
    assert.equal(await count(),4);
  });
  await scenario("no-points-jobs-or-document-completion-side-effects",async()=>{
    for(const table of ["public.point_ledger_entries","public.generation_jobs","careslink_v1_generation.jobs"]){
      assert.equal((await owner.query("select count(*)::int as n from "+table)).rows[0].n,0);
    }
    assert.equal((await owner.query("select lifecycle_status from public.ai_documents where id=$1",[DOC])).rows[0].lifecycle_status,"IN_PROGRESS");
  });
}
