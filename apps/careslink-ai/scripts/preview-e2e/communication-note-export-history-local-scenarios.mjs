import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",FOREIGN="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc",FOREIGN_SESSION="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC="11111111-1111-4111-8111-111111111111",REV="22222222-2222-4222-8222-222222222222";
const REV2="33333333-3333-4333-8333-333333333333",DOC2="44444444-4444-4444-8444-444444444444",REV3="55555555-5555-4555-8555-555555555555";
const EXEC="careslink_communication_history_executor",SCHEMA="careslink_communication_history",TABLE=SCHEMA+".reports";
const CORE=SCHEMA+".access_reports(uuid,uuid,uuid,jsonb)",WRITE="public.record_communication_note_export_report(uuid,uuid,jsonb)",READ="public.list_communication_note_export_reports(uuid,uuid)";
const key=n=>`eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12,"0")}`;
const claims=(extra={})=>({sub:OWNER,session_id:SESSION,role:"authenticated",is_anonymous:false,exp:Date.now()/1000+3600,...extra});
const report=(revisionId=REV)=>({revisionId,format:"TXT",outcome:"DOWNLOAD_INITIATED",startedAt:"2026-09-08T01:00:00.000Z"});
async function auth(client,extra={}) {
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims(extra))]);
}
const write=async(client,k=key(1),r=report(),doc=DOC)=>(await client.query(
  "select public.record_communication_note_export_report($1,$2,$3::jsonb) as data",[doc,k,JSON.stringify(r)])).rows[0].data;
const read=async(client,rev=REV,doc=DOC)=>(await client.query(
  "select public.list_communication_note_export_reports($1,$2) as data",[doc,rev])).rows[0].data;
const denied=(promise,message)=>assert.rejects(promise,e=>e.code==="P0001"&&e.message===message);
const entryKeys=["attemptId","format","outcome","profile","recordedAt","revisionId","revisionNumber","startedAt","templateVersion"];

// Called only by the fixed-target runner after its dependency matrix. All
// clients belong to one freshly created, attested Unix-only PG16 cluster.
export async function verifyExportHistoryScenarios(owner,actor,peer,passed,onScenario) {
  const scenario=async(name,run)=>{onScenario("history:"+name);await run();passed.push("history:"+name);};
  const count=async()=>(await owner.query(`select count(*)::int as n from ${TABLE}`)).rows[0].n;
  const counts=async()=>(await owner.query(`select
    (select count(*)::int from public.ai_document_revisions) revisions,
    (select count(*)::int from public.self_review_events) reviews,
    (select count(*)::int from public.ai_document_mutation_receipts) receipts,
    (select count(*)::int from public.ai_document_sync_changes) changes`)).rows[0];
  const blocked=async(client)=>{
    for(let i=0;i<65;i++){
      if((await owner.query("select cardinality(pg_blocking_pids($1))>0 as b",[client.processID])).rows[0].b) return;
      await delay(10);
    }
    throw new Error("HISTORY_EXPECTED_LOCK_NOT_OBSERVED");
  };
  const restoreDoc=()=>owner.query("update public.ai_documents set note_type='communication',lifecycle_status='IN_PROGRESS',tombstoned_at=null,current_revision_id=$2,current_revision_number=1 where id=$1",[DOC,REV]);
  await scenario("non-superuser-candidate-application",async()=>{
    await owner.query("grant usage on schema careslink_v1_generation to postgres");
    await actor.query("set role postgres");
    assert.equal((await actor.query("select rolsuper from pg_roles where rolname=current_user")).rows[0].rolsuper,false);
    await actor.query("begin");
    await actor.query(await readFile(new URL("../../supabase/migration-candidates/20260908014022_add_communication_note_export_history_shadow.sql",import.meta.url),"utf8"));
    await actor.query("commit");await actor.query("reset role");
    await owner.query("revoke usage on schema careslink_v1_generation from postgres");
  });
  await scenario("default-off-private-rls-no-api-capability",async()=>{
    assert.deepEqual((await owner.query(`select enabled,shadow_only from ${SCHEMA}.flags`)).rows,[{enabled:false,shadow_only:true}]);
    assert.deepEqual((await owner.query(`select r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,
      p.prosecdef,p.proconfig from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=$1::regprocedure`,[CORE])).rows,
      [{rolcanlogin:false,rolinherit:false,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,prosecdef:true,proconfig:['search_path=""']}]);
    for(const rpc of [READ,WRITE]) assert.equal((await owner.query("select prosecdef from pg_proc where oid=$1::regprocedure",[rpc])).rows[0].prosecdef,false);
    for(const role of ["anon","authenticated","service_role","authenticator"]){
      for(const rpc of [READ,WRITE,CORE]) assert.equal((await owner.query("select has_function_privilege($1,$2,'EXECUTE') as ok",[role,rpc])).rows[0].ok,false);
      assert.equal((await owner.query("select has_schema_privilege($1,$2,'USAGE') as ok",[role,SCHEMA])).rows[0].ok,false);
      assert.equal((await owner.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as ok",[role,TABLE])).rows[0].ok,false);
      assert.equal((await owner.query("select pg_has_role($1,$2,'MEMBER') as ok",[role,EXEC])).rows[0].ok,false);
    }
    assert.equal((await owner.query("select relrowsecurity from pg_class where oid=$1::regclass",[TABLE])).rows[0].relrowsecurity,true);
    assert.equal((await owner.query("select count(*)::int as n from pg_auth_members where roleid=$1::regrole and (inherit_option or set_option)",[EXEC])).rows[0].n,0);
    await auth(actor);await auth(peer);
    await assert.rejects(write(actor),e=>e.code==="42501");await assert.rejects(read(actor),e=>e.code==="42501");
    // Discarded with this cluster. Candidate and formal route still grant none.
    await owner.query(`grant usage on schema ${SCHEMA} to authenticated`);
    await owner.query(`grant execute on function ${READ},${WRITE},${CORE} to authenticated`);
  });
  await scenario("executor-cannot-read-body-auth-points-or-mutate-documents",async()=>{
    for(const table of ["auth.users","auth.sessions","public.point_ledger_entries","public.export_jobs","public.export_events"])
      assert.equal((await owner.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as ok",[EXEC,table])).rows[0].ok,false);
    for(const column of ["content","content_hash","privacy_review_id"])
      assert.equal((await owner.query("select has_column_privilege($1,'public.ai_document_revisions',$2,'SELECT') as ok",[EXEC,column])).rows[0].ok,false);
    assert.equal((await owner.query("select has_table_privilege($1,$2,'UPDATE,DELETE,TRUNCATE') as ok",[EXEC,TABLE])).rows[0].ok,false);
    assert.equal((await owner.query("select has_schema_privilege($1,$2,'CREATE') as ok",[EXEC,SCHEMA])).rows[0].ok,false);
    await owner.query("begin");await owner.query(`set local role ${EXEC}`);
    await owner.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims())]);
    // UPDATE exists only to allow SHARE row locks; WITH CHECK(false) blocks mutation.
    await assert.rejects(owner.query("update public.ai_documents set current_revision_id=$2 where id=$1",[DOC,REV2]),e=>e.code==="42501");
    await owner.query("rollback");
  });
  await scenario("independent-history-and-sync-switches",async()=>{
    await denied(write(actor),"UNAVAILABLE");await denied(read(actor),"UNAVAILABLE");
    await owner.query(`update ${SCHEMA}.flags set enabled=true`);
    await owner.query("update public.v1_mobile_sync_shadow_flags set enabled=false");
    await denied(write(actor),"UNAVAILABLE");await denied(read(actor),"UNAVAILABLE");
    await owner.query("update public.v1_mobile_sync_shadow_flags set enabled=true");
  });
  // Ensure both fixed documents have a current synthetic review, regardless of
  // which document won the dependency suite's deliberately nondeterministic race.
  await actor.query("select public.confirm_communication_note_self_review($1,$2,$3,true,true,true)",[DOC,REV,key(900)]);
  await actor.query("select public.confirm_communication_note_self_review($1,$2,$3,true,true,true)",[DOC2,REV3,key(901)]);
  const baseline=await counts();
  await scenario("strict-report-no-content-or-privilege-injection",async()=>{
    for(const r of [null,[],{}, {...report(),englishDraft:"synthetic"},{...report(),ownerUserId:OWNER},
      {...report(),templateVersion:"other"},{...report(),format:"HTML"},{...report(),format:{}},
      {...report(),outcome:"DOWNLOADED"},{...report(),outcome:"SHARED"},{...report(),outcome:"COPY_REPORTED"},
      {...report(),format:"COPY"},{...report(),startedAt:"2026-02-30T01:00:00.000Z"},
      {...report(),startedAt:"2026-09-08T24:00:00.000Z"},{...report(),startedAt:"2026-09-08T01:00:00Z"},
      {...report(),startedAt:"2026-09-08T01:00:00.000+00:00"},{...report(),revisionId:"bad"}])
      await denied(write(actor,key(1),r),"INVALID_REQUEST");
    assert.equal(await count(),0);
  });
  let first;
  await scenario("commit-independent-readback-minimal-server-metadata",async()=>{
    assert.deepEqual(await read(peer),{status:"AVAILABLE",canonicalId:DOC,revisionId:REV,storage:"DURABLE",entries:[],hasMore:false});
    first=await write(actor);
    assert.equal(first.status,"RECORDED");assert.equal(first.storage,"DURABLE");
    assert.deepEqual(Object.keys(first.entry).sort(),entryKeys);
    assert.equal(first.entry.templateVersion,"communication-record-text.2026-09-08.1");
    assert.equal(first.entry.revisionNumber,1);assert.equal(first.entry.startedAt,report().startedAt);
    assert.match(first.entry.recordedAt,/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.deepEqual((await read(peer)).entries,[first.entry]);assert.equal(await count(),1);
  });
  await scenario("simultaneous-first-submission-and-altered-replay",async()=>{
    await actor.query("begin");const a=await write(actor,key(2));const competing=write(peer,key(2));
    await blocked(peer);await actor.query("commit");assert.deepEqual(await competing,a);
    assert.deepEqual(await write(actor),first);assert.equal(await count(),2);
    for(const r of [{...report(),format:"PDF"},{...report(),outcome:"FAILED"},{...report(),startedAt:"2026-09-08T02:00:00.000Z"}])
      await denied(write(actor,key(1),r),"INVALID_REQUEST");
    await denied(write(actor,key(1),report(REV3),DOC2),"INVALID_REQUEST");assert.equal(await count(),2);
  });
  await scenario("cross-document-concurrent-key-collision",async()=>{
    const before=await count(), k=key(3);
    await owner.query("begin");await owner.query("select pg_advisory_xact_lock(hashtextextended($1,0))",["communication-history:"+OWNER+":"+k]);
    const racing=Promise.allSettled([write(actor,k),write(peer,k,report(REV3),DOC2)]);
    await blocked(actor);await blocked(peer);await owner.query("commit");
    const results=await racing;assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    const rejected=results.find(r=>r.status==="rejected");assert.equal(rejected.reason.code,"P0001");assert.equal(rejected.reason.message,"INVALID_REQUEST");
    assert.equal(await count(),before+1);
  });
  await scenario("rollback-and-all-browser-outcome-pairs",async()=>{
    const before=await count();await actor.query("begin");await write(actor,key(4));await actor.query("rollback");assert.equal(await count(),before);
    let i=10;
    for(const format of ["COPY","TXT","DOCX","PDF"]) for(const outcome of ["FAILED",format==="COPY"?"COPY_REPORTED":"DOWNLOAD_INITIATED"])
      assert.equal((await write(actor,key(i++),{...report(),format,outcome})).entry.outcome,outcome);
    assert.equal(await count(),before+8);
  });
  await scenario("foreign-owner-type-lifecycle-and-exact-revision",async()=>{
    const before=await count();await auth(actor,{sub:FOREIGN,session_id:FOREIGN_SESSION});
    await denied(write(actor),"NOT_FOUND");await denied(read(actor),"NOT_FOUND");await auth(actor);
    await denied(read(actor,REV3),"NOT_FOUND");await denied(write(actor,key(25),report(REV3)),"NOT_FOUND");
    for(const change of ["note_type='handover'","lifecycle_status='COMPLETED'","lifecycle_status='TOMBSTONED',tombstoned_at=clock_timestamp()"]){
      await owner.query("update public.ai_documents set "+change+" where id=$1",[DOC]);
      await denied(read(actor),"NOT_FOUND");await denied(write(actor),"NOT_FOUND");await restoreDoc();
    }
    assert.equal(await count(),before);
  });
  await scenario("new-version-empty-old-version-readable-replay-stale",async()=>{
    await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=2 where id=$1",[DOC,REV2]);
    assert.deepEqual((await read(actor,REV2)).entries,[]);
    assert.ok((await read(actor)).entries.some(e=>e.attemptId===key(1)));
    await denied(write(actor),"STALE_REVISION");await denied(write(actor,key(26),report(REV2)),"REVIEW_REQUIRED");await restoreDoc();
  });
  const invalidate=()=>owner.query(`insert into public.self_review_events(id,document_id,revision_id,owner_user_id,event,invalidation_reason,mutation_id,created_at)
    values($1,$2,$3,$4,'INVALIDATED','SYNTHETIC_TEST',$5,clock_timestamp()+interval '1 second')`,[key(902),DOC,REV,OWNER,key(902)]);
  const removeInvalidation=()=>owner.query("delete from public.self_review_events where id=$1",[key(902)]);
  await scenario("review-invalidation-rechecks-on-replay",async()=>{
    await invalidate();await denied(write(actor),"REVIEW_REQUIRED");assert.ok((await read(actor)).entries.length>0);await removeInvalidation();
  });
  await scenario("current-session-provider-and-claims-required-every-operation",async()=>{
    for(const extra of [{exp:0},{is_anonymous:true},{role:"service_role"},{session_id:FOREIGN_SESSION},{session_id:"bad"},{sub:"bad"}]){
      await auth(actor,extra);await denied(write(actor),"AUTH_REQUIRED");await denied(read(actor),"AUTH_REQUIRED");
    }
    await auth(actor);
    await owner.query("delete from auth.sessions where id=$1",[SESSION]);
    await denied(write(actor),"AUTH_REQUIRED");await denied(read(actor),"AUTH_REQUIRED");
    await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);
    await owner.query("update auth.users set raw_app_meta_data='{}',raw_user_meta_data='{\"role\":\"provider\"}' where id=$1",[OWNER]);
    await denied(write(actor),"AUTH_REQUIRED");await denied(read(actor),"AUTH_REQUIRED");
    await owner.query("update auth.users set raw_app_meta_data='{\"role\":\"provider\"}' where id=$1",[OWNER]);
  });
  await scenario("latest-20-server-order-independent-of-device-clock",async()=>{
    for(let i=30;i<55;i++) await write(actor,key(i),{...report(),startedAt:"2000-01-01T00:00:00.000Z"});
    const list=await read(peer);assert.equal(list.hasMore,true);assert.equal(list.entries.length,20);
    const expected=(await owner.query(`select attempt_id from ${TABLE} where owner_user_id=$1 and document_id=$2 and revision_id=$3 order by recorded_at desc,attempt_id desc limit 20`,[OWNER,DOC,REV])).rows.map(r=>r.attempt_id);
    assert.deepEqual(list.entries.map(e=>e.attemptId),expected);
    assert.ok(list.entries.every(e=>e.startedAt==="2000-01-01T00:00:00.000Z"));
    const columns=(await owner.query("select column_name from information_schema.columns where table_schema=$1 and table_name='reports'",[SCHEMA])).rows.map(r=>r.column_name);
    assert.deepEqual(columns.sort(),["owner_user_id","attempt_id","document_id","revision_id","revision_number",
      "format","outcome","started_at","recorded_at","template_version","profile","shadow_only"].sort());
  });
  await scenario("readback-index-plan",async()=>{
    await owner.query("begin");await owner.query("set local enable_seqscan=off");
    const plan=await owner.query(`explain (format json) select * from ${TABLE} where owner_user_id=$1 and document_id=$2 and revision_id=$3 order by recorded_at desc,attempt_id desc limit 21`,[OWNER,DOC,REV]);
    assert.match(JSON.stringify(plan.rows),/communication_history_revision_recent_idx/);await owner.query("rollback");
  });
  await scenario("deletion-and-review-lock-winners",async()=>{
    const before=await count();await owner.query("begin");
    await owner.query("update public.ai_documents set lifecycle_status='TOMBSTONED',tombstoned_at=clock_timestamp() where id=$1",[DOC]);
    const a=denied(write(actor,key(60)),"NOT_FOUND"),b=denied(read(peer),"NOT_FOUND");
    await blocked(actor);await blocked(peer);await owner.query("commit");await Promise.all([a,b]);await restoreDoc();
    await owner.query("begin");await owner.query("select id from public.ai_documents where id=$1 for update",[DOC]);await invalidate();
    const reset=denied(write(actor),"REVIEW_REQUIRED");await blocked(actor);await owner.query("commit");await reset;await removeInvalidation();
    assert.equal(await count(),before);
  });
  await scenario("version-change-lock-winner",async()=>{
    await owner.query("begin");await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=2 where id=$1",[DOC,REV2]);
    const stale=denied(write(actor),"STALE_REVISION");await blocked(actor);await owner.query("commit");await stale;await restoreDoc();
  });
  await scenario("jwt-and-session-expiry-during-lock-wait",async()=>{
    for(const operation of [()=>write(actor,key(61)),()=>read(actor)]){
      await auth(actor,{exp:Date.now()/1000+0.7});await owner.query("begin");
      await owner.query("select id from public.ai_documents where id=$1 for update",[DOC]);
      const expired=denied(operation(),"AUTH_REQUIRED");await blocked(actor);await delay(760);await owner.query("commit");await expired;
    }
    await auth(actor);
    await owner.query("update auth.sessions set not_after=clock_timestamp()+interval '700 milliseconds' where id=$1",[SESSION]);
    await owner.query("begin");await owner.query("select id from public.ai_documents where id=$1 for update",[DOC]);
    const expired=denied(read(actor),"AUTH_REQUIRED");await blocked(actor);await delay(760);await owner.query("commit");await expired;
    await owner.query("update auth.sessions set not_after=null where id=$1",[SESSION]);
  });
  await scenario("session-revocation-lock-winner",async()=>{
    await owner.query("begin");await owner.query("delete from auth.sessions where id=$1",[SESSION]);
    const a=denied(write(actor),"AUTH_REQUIRED"),b=denied(read(peer),"AUTH_REQUIRED");
    await blocked(actor);await blocked(peer);await owner.query("commit");await Promise.all([a,b]);
    await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);
  });
  await scenario("read-and-write-retain-lifecycle-session-and-switch-locks",async()=>{
    for(const operation of [()=>write(actor,key(62)),()=>read(actor)]){
      await actor.query("begin");await operation();
      for(const sql of ["delete from auth.sessions where id='"+SESSION+"'",
        "update public.ai_documents set updated_at=clock_timestamp() where id='"+DOC+"'",
        `update ${SCHEMA}.flags set enabled=false`]) await assert.rejects(owner.query(sql),e=>e.code==="55P03");
      await actor.query("commit");
    }
  });
  await scenario("no-unrelated-writes-and-remove-disposable-capability",async()=>{
    assert.deepEqual(await counts(),baseline);
    for(const table of ["public.point_ledger_entries","public.generation_jobs","careslink_v1_generation.jobs","public.export_jobs","public.export_events"])
      assert.equal((await owner.query("select count(*)::int as n from "+table)).rows[0].n,0);
    await owner.query(`revoke all on function ${READ},${WRITE},${CORE} from authenticated`);
    await owner.query(`revoke usage on schema ${SCHEMA} from authenticated`);
    await owner.query(`update ${SCHEMA}.flags set enabled=false`);
    await assert.rejects(write(actor),e=>e.code==="42501");await assert.rejects(read(actor),e=>e.code==="42501");
  });
}
