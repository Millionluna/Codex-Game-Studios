import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", FOREIGN="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc", FOREIGN_SESSION="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DOC="11111111-1111-4111-8111-111111111111", BASE="22222222-2222-4222-8222-222222222222";
const DOC2="44444444-4444-4444-8444-444444444444", BASE2="55555555-5555-4555-8555-555555555555";
const PROOF="88888888-8888-4888-8888-888888888888", EXECUTOR="careslink_communication_edit_executor";
const RPC="public.save_communication_note_wording(uuid,uuid,jsonb)", CORE="careslink_communication_edit.save_wording(uuid,uuid,jsonb)";
const SQL="select public.save_communication_note_wording($1,$2,$3::jsonb) as data";
const key=n=>`eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12,"0")}`;
const claims=(extra={})=>({sub:OWNER,session_id:SESSION,role:"authenticated",is_anonymous:false,exp:Date.now()/1000+3600,...extra});
const command=(base=BASE,suffix="one")=>({baseRevisionId:base,englishDraft:`Synthetic wording edit ${suffix}.`,
  reviewVersions:{"zh-Hans":`合成文字修改 ${suffix}。`,"zh-Hant":`合成文字修改 ${suffix}。`},wordingConfirmed:true});
async function auth(client, extra={}) {
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims(extra))]);
}
const call=async(client,c=command(),k=key(1),doc=DOC)=>(await client.query(SQL,[doc,k,JSON.stringify(c)])).rows[0].data;
const denied=async(client,message,c=command(),k=key(1),doc=DOC)=>assert.rejects(call(client,c,k,doc),e=>{
  if(e.code!=="P0001"||e.message!==message) process.stderr.write(JSON.stringify({expected:message,code:e.code,
    diagnostic:/^[A-Z_]+$|^permission denied for (schema|table|function|sequence) [a-z_]+$/.test(e.message)?e.message:"UNEXPECTED"})+"\n");
  return e.code==="P0001"&&e.message===message;
});

// Runs after the existing self-review matrix in a newly owned Unix-only PG16.
// It accepts clients from that runner, not database URLs or external credentials.
export async function verifyWordingEditScenarios(owner,actor,peer,passed,onScenario) {
  const scenario=async(name,run)=>{onScenario("edit:"+name);await run();passed.push("edit:"+name);};
  const counts=async()=>(await owner.query(`select
    (select count(*)::int from public.ai_document_revisions) revisions,
    (select count(*)::int from public.ai_document_mutation_receipts) receipts,
    (select count(*)::int from public.ai_document_sync_changes) changes,
    (select count(*)::int from public.self_review_events) reviews`)).rows[0];
  const read=async(client=peer)=>(await client.query("select public.get_v1_shadow_document($1) as d",[DOC])).rows[0].d;
  const blocked=async(client)=>{
    for(let n=0;n<70;n++){
      if((await owner.query("select cardinality(pg_blocking_pids($1))>0 as b",[client.processID])).rows[0].b) return;
      await delay(10);
    }
    throw new Error("EDIT_EXPECTED_LOCK_NOT_OBSERVED");
  };
  await scenario("candidate-applies-as-non-superuser",async()=>{
    // Same temporary migration-entry capability as the dependency runner;
    // the NOLOGIN application executor never becomes this role.
    await owner.query("grant usage on schema careslink_v1_generation to postgres");
    await actor.query("set role postgres");
    assert.equal((await actor.query("select rolsuper from pg_roles where rolname=current_user")).rows[0].rolsuper,false);
    await actor.query("begin");
    try {
      await actor.query(await readFile(new URL("../../supabase/migration-candidates/20260907132707_add_communication_note_wording_edit_shadow.sql",import.meta.url),"utf8"));
    } catch (error) {
      // Fixed DDL only: no draft parameters, credentials or Auth data here.
      process.stderr.write(JSON.stringify({candidateDdlError:String(error.message).slice(0,180),position:error.position})+"\n");
      throw error;
    }
    await actor.query("commit");await actor.query("reset role");
    await owner.query("revoke usage on schema careslink_v1_generation from postgres");
  });
  await scenario("private-definer-no-caller-grants-default-off",async()=>{
    assert.deepEqual((await owner.query("select enabled,shadow_only from public.communication_note_edit_flags")).rows,[{enabled:false,shadow_only:true}]);
    assert.deepEqual((await owner.query(`select r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,
      p.prosecdef,p.proconfig from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=$1::regprocedure`,[CORE])).rows,
    [{rolcanlogin:false,rolinherit:false,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,prosecdef:true,proconfig:['search_path=""']}]);
    assert.equal((await owner.query("select prosecdef from pg_proc where oid=$1::regprocedure",[RPC])).rows[0].prosecdef,false);
    for(const role of ["anon","authenticated","service_role","authenticator"]){
      for(const f of [RPC,CORE,"public.append_v1_shadow_document_revision(uuid,uuid,jsonb,text,text,text,text,uuid)"])
        assert.equal((await owner.query("select has_function_privilege($1,$2,'EXECUTE') as ok",[role,f])).rows[0].ok,false);
      assert.equal((await owner.query("select has_schema_privilege($1,'careslink_communication_edit','USAGE') as ok",[role])).rows[0].ok,false);
      assert.equal((await owner.query("select pg_has_role($1,$2,'MEMBER') as ok",[role,EXECUTOR])).rows[0].ok,false);
    }
    for(const table of ["auth.users","auth.sessions","public.point_ledger_entries","public.self_review_events"])
      assert.equal((await owner.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as ok",[EXECUTOR,table])).rows[0].ok,false);
    assert.equal((await owner.query("select has_column_privilege($1,'public.ai_documents','owner_user_id','UPDATE') as ok",[EXECUTOR])).rows[0].ok,false);
    assert.equal((await owner.query("select has_schema_privilege($1,'careslink_communication_edit','CREATE') as ok",[EXECUTOR])).rows[0].ok,false);
    assert.equal((await owner.query("select count(*)::int as n from pg_auth_members where roleid=$1::regrole and (inherit_option or set_option)",[EXECUTOR])).rows[0].n,0);
    await auth(actor);await assert.rejects(call(actor),e=>e.code==="42501");
    // Temporary, local-only test capability; candidate itself grants nothing.
    await owner.query("grant usage on schema careslink_communication_edit to authenticated");
    await owner.query(`grant execute on function ${RPC}, ${CORE} to authenticated`);
    await auth(peer);
  });
  await scenario("independent-edit-and-sync-gates",async()=>{
    await denied(actor,"UNAVAILABLE");
    await owner.query("update public.communication_note_edit_flags set enabled=true");
    await owner.query("update public.v1_mobile_sync_shadow_flags set enabled=false");
    await denied(actor,"UNAVAILABLE");
    await owner.query("update public.v1_mobile_sync_shadow_flags set enabled=true");
  });
  // The preceding review race deliberately moved the pointer back to revision
  // one. Remove only its unused synthetic revision two before the edit matrix;
  // otherwise a valid next-number INSERT correctly fails its unique constraint.
  await owner.query("delete from public.ai_document_revisions where id=$1 and document_id=$2",["33333333-3333-4333-8333-333333333333",DOC]);
  const initial=await counts(), original=(await read()).revisions.find(r=>r.revisionId===BASE).content;
  await scenario("strict-fields-bounds-privacy-no-source-overrides",async()=>{
    for(const c of [null,[],{}, {...command(),ownerUserId:OWNER},{...command(),factsSummary:{}},
      {...command(),privacyReviewId:PROOF},{...command(),wordingConfirmed:false},{...command(),baseRevisionId:"bad"},
      {...command(),reviewVersions:{"zh-Hans":"a","zh-Hant":"b",en:"c"}},
      {...command(),englishDraft:" "},{...command(),englishDraft:"a".repeat(8001)},
      {...command(),englishDraft:"中".repeat(5334)},{...command(),englishDraft:"😀".repeat(4001)},
      {...command(),englishDraft:"invalid\u0007"}]) await denied(actor,"INVALID_REQUEST",c);
    for(const value of ["test@example.invalid","https://example.invalid","0412 345 678","12 Test Street","Mr Example","ABN 123456789","participant ID ABC123"])
      for(const field of ["englishDraft","zh-Hans","zh-Hant"]){
        const c=command();if(field==="englishDraft") c.englishDraft=value;else c.reviewVersions[field]=value;
        await denied(actor,"PRIVACY_REVIEW_REQUIRED",c);
      }
    await denied(actor,"INVALID_REQUEST",{baseRevisionId:BASE,englishDraft:original.englishDraft,reviewVersions:original.reviewVersions,wordingConfirmed:true});
    assert.deepEqual(await counts(),initial);
  });
  await scenario("owner-type-lifecycle-and-current-provider-auth",async()=>{
    await auth(actor,{sub:FOREIGN,session_id:FOREIGN_SESSION});await denied(actor,"NOT_FOUND");await auth(actor);
    for(const c of [{exp:0},{is_anonymous:true},{role:"service_role"},{session_id:FOREIGN_SESSION},{session_id:"bad"}]){
      await auth(actor,c);await denied(actor,"AUTH_REQUIRED");
    }
    await auth(actor);
    await owner.query("update auth.users set raw_app_meta_data='{}',raw_user_meta_data='{\"role\":\"provider\"}' where id=$1",[OWNER]);
    await denied(actor,"AUTH_REQUIRED");
    await owner.query("update auth.users set raw_app_meta_data='{\"role\":\"provider\"}' where id=$1",[OWNER]);
    for(const change of ["note_type='handover'","lifecycle_status='COMPLETED'","lifecycle_status='TOMBSTONED',tombstoned_at=clock_timestamp()"]){
      await owner.query("update public.ai_documents set "+change+" where id=$1",[DOC]);await denied(actor,"NOT_FOUND");
      await owner.query("update public.ai_documents set note_type='communication',lifecycle_status='IN_PROGRESS',tombstoned_at=null where id=$1",[DOC]);
    }
    assert.deepEqual(await counts(),initial);
  });
  let ack, current;
  await scenario("commit-independent-readback-facts-history-and-review-reset",async()=>{
    assert.equal((await read()).selfReviewStatus,"CONFIRMED");
    ack=await call(actor);current=ack.revisionId;
    assert.deepEqual(ack,{status:"SAVED",canonicalId:DOC,baseRevisionId:BASE,revisionId:current,revisionNumber:2,mutationId:key(1),
      saveState:"SERVER_ACKNOWLEDGED",selfReviewStatus:"REQUIRED",draftNotice:"Draft – review required"});
    const d=await read(), rev=d.revisions.find(r=>r.revisionId===current);
    assert.equal(d.document.currentRevisionId,current);assert.equal(d.document.lifecycleStatus,"IN_PROGRESS");assert.equal(d.selfReviewStatus,"REQUIRED");
    assert.deepEqual(rev.content,{...original,englishDraft:command().englishDraft,reviewVersions:command().reviewVersions});
    assert.equal(rev.privacyReviewId,PROOF);assert.deepEqual(d.revisions.find(r=>r.revisionId===BASE).content,original);
    assert.deepEqual(await counts(),{revisions:initial.revisions+1,receipts:initial.receipts+1,changes:initial.changes+1,reviews:initial.reviews});
  });
  await scenario("exact-replay-and-full-command-key-collision",async()=>{
    assert.deepEqual(await Promise.all([call(actor),call(peer)]),[ack,ack]);
    await denied(actor,"INVALID_REQUEST",command(BASE,"changed"));
    await denied(actor,"INVALID_REQUEST",command(BASE2),key(1),DOC2);
    await denied(actor,"STALE_REVISION",command(),key(2));
  });
  await scenario("same-key-concurrent-first-submit-one-revision",async()=>{
    const c=command(current,"two"),before=await counts();
    await actor.query("begin");const a=await call(actor,c,key(2));
    const replay=call(peer,c,key(2));await blocked(peer);await actor.query("commit");assert.deepEqual(await replay,a);
    current=a.revisionId;
    assert.deepEqual(await counts(),{...before,revisions:before.revisions+1,receipts:before.receipts+1,changes:before.changes+1});
    await denied(actor,"STALE_REVISION");
  });
  await scenario("different-command-concurrent-base-conflict",async()=>{
    const c=command(current,"three"),before=await counts();
    await actor.query("begin");const a=await call(actor,c,key(3));
    const stale=denied(peer,"STALE_REVISION",command(current,"other"),key(4));
    await blocked(peer);await actor.query("commit");await stale;current=a.revisionId;
    assert.equal((await counts()).revisions,before.revisions+1);
  });
  await scenario("rollback-no-ack-change-or-revision",async()=>{
    const before=await counts();await actor.query("begin");await call(actor,command(current,"rollback"),key(4));
    await actor.query("rollback");assert.deepEqual(await counts(),before);assert.equal((await read()).document.currentRevisionId,current);
  });
  await scenario("proof-binding-expiry-and-revocation",async()=>{
    const before=await counts();
    for(const change of ["status='REVOKED'","cleaned_facts_hash=repeat('f',64)","note_type='handover'","confirmed_at=statement_timestamp()-interval '30 minutes 1 millisecond',expires_at=statement_timestamp()-interval '1 millisecond'"]){
      await owner.query("begin");await owner.query("update public.privacy_reviews set "+change+" where id=$1",[PROOF]);await owner.query("commit");
      await denied(actor,"PRIVACY_REVIEW_REQUIRED",command(current),key(4));
      await owner.query("update public.privacy_reviews set status='CONFIRMED',note_type='communication',cleaned_facts_hash=public.v1_shadow_content_sha256($2::jsonb->'factsSummary'),confirmed_at=statement_timestamp(),expires_at=statement_timestamp()+interval '30 minutes' where id=$1",[PROOF,JSON.stringify(original)]);
    }
    assert.deepEqual(await counts(),before);
  });
  await scenario("session-and-jwt-expiry-after-document-lock-waits",async()=>{
    const before=await counts();
    for(const kind of ["session","jwt"]){
      if(kind==="session") await owner.query("update auth.sessions set not_after=clock_timestamp()+interval '700 milliseconds' where id=$1",[SESSION]);
      else await auth(actor,{exp:Date.now()/1000+0.7});
      await owner.query("begin");await owner.query("select id from public.ai_documents where id=$1 for update",[DOC]);
      const deniedSave=denied(actor,"AUTH_REQUIRED",command(current),key(4));await blocked(actor);await delay(760);await owner.query("commit");await deniedSave;
      await owner.query("update auth.sessions set not_after=null where id=$1",[SESSION]);await auth(actor);
    }
    assert.deepEqual(await counts(),before);
  });
  await scenario("privacy-expiry-after-proof-and-key-lock-waits",async()=>{
    const before=await counts();
    for(const kind of ["proof","key"]){
      await owner.query("update public.privacy_reviews set confirmed_at=statement_timestamp()-interval '30 minutes'+interval '700 milliseconds',expires_at=statement_timestamp()+interval '700 milliseconds' where id=$1",[PROOF]);
      await owner.query("begin");
      if(kind==="proof") await owner.query("select id from public.privacy_reviews where id=$1 for update",[PROOF]);
      else await owner.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[OWNER+":"+key(4)]);
      const deniedSave=denied(actor,"PRIVACY_REVIEW_REQUIRED",command(current),key(4));await blocked(actor);await delay(760);await owner.query("commit");await deniedSave;
      await owner.query("update public.privacy_reviews set confirmed_at=statement_timestamp(),expires_at=statement_timestamp()+interval '30 minutes' where id=$1",[PROOF]);
    }
    assert.deepEqual(await counts(),before);
  });
  await scenario("revocation-and-disable-lock-winners",async()=>{
    const before=await counts();
    await owner.query("begin");await owner.query("delete from auth.sessions where id=$1",[SESSION]);
    const revoked=denied(actor,"AUTH_REQUIRED",command(current),key(4));await blocked(actor);await owner.query("commit");await revoked;
    await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);
    await owner.query("begin");await owner.query("update public.communication_note_edit_flags set enabled=false");
    const disabled=denied(actor,"UNAVAILABLE",command(current),key(4));await blocked(actor);await owner.query("commit");await disabled;
    await owner.query("update public.communication_note_edit_flags set enabled=true");
    assert.deepEqual(await counts(),before);
  });
  await scenario("successful-transaction-holds-session-proof-and-document-locks",async()=>{
    await actor.query("begin");const a=await call(actor,command(current,"four"),key(4));
    await assert.rejects(owner.query("delete from auth.sessions where id=$1",[SESSION]),e=>e.code==="55P03");
    await assert.rejects(owner.query("update public.privacy_reviews set status='REVOKED' where id=$1",[PROOF]),e=>e.code==="55P03");
    await assert.rejects(owner.query("update public.ai_documents set updated_at=clock_timestamp() where id=$1",[DOC]),e=>e.code==="55P03");
    await actor.query("commit");current=a.revisionId;
    assert.equal((await read()).document.currentRevisionId,current);
  });
  await scenario("cross-document-concurrent-command-key-collision",async()=>{
    const before=await counts();
    await owner.query("begin");await owner.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[OWNER+":"+key(5)]);
    const results=Promise.allSettled([call(actor,command(current,"five"),key(5)),call(peer,command(BASE2,"five"),key(5),DOC2)]);
    await blocked(actor);await blocked(peer);await owner.query("commit");
    const outcome=await results;assert.equal(outcome.filter(r=>r.status==="fulfilled").length,1);
    const rejected=outcome.find(r=>r.status==="rejected");assert.equal(rejected.reason.code,"P0001");assert.equal(rejected.reason.message,"INVALID_REQUEST");
    const winner=outcome.find(r=>r.status==="fulfilled").value;
    if(winner.canonicalId===DOC) current=winner.revisionId;
    assert.deepEqual(await counts(),{...before,revisions:before.revisions+1,receipts:before.receipts+1,changes:before.changes+1});
  });
  await scenario("privacy-revocation-lock-winner",async()=>{
    const before=await counts();await owner.query("begin");
    await owner.query("update public.privacy_reviews set status='REVOKED' where id=$1",[PROOF]);
    const revoked=denied(actor,"PRIVACY_REVIEW_REQUIRED",command(current,"six"),key(6));
    await blocked(actor);await owner.query("commit");await revoked;
    await owner.query("update public.privacy_reviews set status='CONFIRMED' where id=$1",[PROOF]);assert.deepEqual(await counts(),before);
  });
  await scenario("replay-still-requires-live-session-and-proof",async()=>{
    const latest=(await read()).revisions.find(r=>r.revisionId===current),before=await counts();
    const c={baseRevisionId:latest.baseRevisionId,englishDraft:latest.content.englishDraft,reviewVersions:latest.content.reviewVersions,wordingConfirmed:true};
    await owner.query("update public.privacy_reviews set status='REVOKED' where id=$1",[PROOF]);
    await denied(actor,"PRIVACY_REVIEW_REQUIRED",c,latest.mutationId);
    await owner.query("update public.privacy_reviews set status='CONFIRMED' where id=$1",[PROOF]);
    await owner.query("delete from auth.sessions where id=$1",[SESSION]);await denied(actor,"AUTH_REQUIRED",c,latest.mutationId);
    await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);
    assert.equal((await call(actor,c,latest.mutationId)).revisionId,current);assert.deepEqual(await counts(),before);
  });
  await scenario("no-unrelated-writes-and-remove-local-caller-capability",async()=>{
    for(const table of ["public.point_ledger_entries","public.generation_jobs","careslink_v1_generation.jobs"])
      assert.equal((await owner.query("select count(*)::int as n from "+table)).rows[0].n,0);
    assert.equal((await counts()).reviews,initial.reviews);
    await owner.query(`revoke all on function ${RPC}, ${CORE} from authenticated`);
    await owner.query("revoke usage on schema careslink_communication_edit from authenticated");
    await owner.query("update public.communication_note_edit_flags set enabled=false");
    await assert.rejects(call(actor),e=>e.code==="42501");
  });
}
