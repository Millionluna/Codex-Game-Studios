/** Parent-only metadata catalog probes on its fresh synthetic Unix PG16.
 * Extra catalog rows are not admissions or AI generations; all are rolled back. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",OTHER_SESSION="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SQL="select careslink_v1_generation.list_v1_communication_note_jobs($1,$2,$3,$4,$5,$6,$7) as data";
export async function verifyCommunicationNoteJobList(owner) {
  const initial=(await owner.query("select count(*)::int n from careslink_v1_generation.jobs")).rows[0].n;
  assert.equal(initial,3);
  const args=[OWNER,SESSION,null,null,20,"1.0.0-shadow.1","2026-08-09.v1-shadow"];
  let passed=0;const check=name=>{passed++;console.log(JSON.stringify({stage:"task-list-scenario",name}));};
  const read=async(values=args)=>{await owner.query("set local role careslink_v1_generation_job_list_caller");
    try {return (await owner.query(SQL,values)).rows[0].data;} finally {await owner.query("reset role");}};
  const denied=async(sql,values,code,message)=>{await owner.query("savepoint denied");
    await assert.rejects(owner.query(sql,values),e=>e.code===code&&(!message||e.message===message));
    await owner.query("rollback to savepoint denied");};
  await owner.query("begin");
  try {
    const base=(await owner.query("select to_jsonb(j) j from careslink_v1_generation.jobs j where status='FAILED'")).rows[0].j;
    const payload=(await owner.query("select to_jsonb(p) p from careslink_v1_generation.payloads p where id=$1",[base.payload_id])).rows[0].p;
    const clone=async(patch={})=>{const id=randomUUID(),payloadId=randomUUID();
      // Synthetic metadata rows are not additional paid admissions.
      const job={...base,id,payload_id:payloadId,communication_note_point_admission_id:null,
        idempotency_hash:randomBytes(32).toString("hex"),...patch};
      await owner.query("insert into careslink_v1_generation.jobs select (jsonb_populate_record(null::careslink_v1_generation.jobs,$1::jsonb)).*",
        [JSON.stringify(job)]);
      await owner.query("insert into careslink_v1_generation.payloads select (jsonb_populate_record(null::careslink_v1_generation.payloads,$1::jsonb)).*",
        [JSON.stringify({...payload,id:payloadId,job_id:id,owner_user_id:job.owner_user_id,note_type:job.note_type,privacy_review_id:job.privacy_review_id})]);return id;};
    for(let i=0;i<22;i++)await clone();
    const handover=(await owner.query("select policy_version,policy_digest from careslink_v1_generation.provider_policies where note_type='handover'")).rows[0];
    await clone({note_type:"handover",service_code:"note.handover.generate",provider_policy_version:handover.policy_version,provider_policy_digest:handover.policy_digest});
    const proof=(await owner.query("select to_jsonb(p) p from public.privacy_reviews p where id=$1",[base.privacy_review_id])).rows[0].p;
    const foreignProof=randomUUID();
    await owner.query("insert into public.privacy_reviews select (jsonb_populate_record(null::public.privacy_reviews,$1::jsonb)).*",
      [JSON.stringify({...proof,id:foreignProof,owner_user_id:OTHER})]);
    const foreign=await clone({owner_user_id:OTHER,initiating_session_id:OTHER_SESSION,privacy_review_id:foreignProof});
    await owner.query("set constraints all immediate");
    const ledger=JSON.stringify((await owner.query("select * from public.point_ledger_entries order by id")).rows);
    const first=await read();assert.equal(first.tasks.length,20);assert.ok(first.nextCursor);
    for(const t of first.tasks)assert.deepEqual(Object.keys(t).sort(),["createdAt","jobId","status","updatedAt"]);
    check("bounded-minimal-metadata-no-payload-or-review-authority");
    const second=await read(args.map((v,i)=>i===2?first.nextCursor.createdAt:i===3?first.nextCursor.jobId:v));
    assert.equal(second.tasks.length,5);assert.equal(second.nextCursor,null);
    const ids=[...first.tasks,...second.tasks].map(t=>t.jobId);assert.equal(new Set(ids).size,25);assert.ok(!ids.includes(foreign));
    const expected=(await owner.query("select id from careslink_v1_generation.jobs where owner_user_id=$1 and note_type='communication' order by created_at desc,id desc",[OWNER])).rows.map(r=>r.id);
    assert.deepEqual(ids,expected);check("stable-keyset-ties-no-duplicate-or-omission");
    const other=await read(args.map((v,i)=>i===0?OTHER:i===1?OTHER_SESSION:v));
    assert.deepEqual(other.tasks.map(t=>t.jobId),[foreign]);check("foreign-owner-only-sees-own-task");
    const foreignCursorPage=await read(args.map((v,i)=>i===0?OTHER:i===1?OTHER_SESSION:i===2?first.nextCursor.createdAt:i===3?first.nextCursor.jobId:v));
    assert.ok(foreignCursorPage.tasks.every(t=>t.jobId===foreign));check("cursor-never-selects-owner");
    const newSession=randomUUID();await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[newSession,OWNER]);
    assert.deepEqual(await read(args.map((v,i)=>i===1?newSession:v)),first);check("same-owner-new-session-can-revisit-prior-jobs");
    await owner.query("set local role careslink_v1_generation_job_list_caller");
    await denied(SQL,args.map((v,i)=>i===1?OTHER_SESSION:v),"P0001","SESSION_REVOKED");
    await denied(SQL,args.map((v,i)=>i===1?randomUUID():v),"P0001","SESSION_REVOKED");check("mismatched-and-revoked-session-denied");
    for(const limit of [0,21,null])await denied(SQL,args.map((v,i)=>i===4?limit:v),"P0001","VALIDATION_ERROR");
    await denied(SQL,args.map((v,i)=>i===2?first.nextCursor.createdAt:v),"P0001","VALIDATION_ERROR");
    await denied(SQL,args.map((v,i)=>i===5?"wrong":v),"P0001","MIN_CLIENT_VERSION");check("invalid-limit-cursor-contract-denied");
    await denied("select id from careslink_v1_generation.jobs",[],"42501");
    await owner.query("reset role");
    for(const role of ["anon","authenticated","service_role","authenticator"])
      assert.equal((await owner.query("select has_function_privilege($1,'careslink_v1_generation.list_v1_communication_note_jobs(uuid,uuid,timestamptz,uuid,integer,text,text)','EXECUTE') ok",[role])).rows[0].ok,false);
    assert.equal((await owner.query("select pg_has_role('cl_admission_browser_runtime','careslink_v1_generation_job_list_executor','MEMBER') ok")).rows[0].ok,false);
    assert.equal((await owner.query("select has_column_privilege('careslink_v1_generation_job_list_executor','careslink_v1_generation.jobs','cleaned_facts_hash','SELECT') ok")).rows[0].ok,false);
    check("no-data-api-table-payload-or-executor-authority");
    await owner.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[newSession]);
    await owner.query("set local role careslink_v1_generation_job_list_caller");
    await denied(SQL,args.map((v,i)=>i===1?newSession:v),"P0001","SESSION_REVOKED");await owner.query("reset role");check("expired-session-denied");
    await owner.query("savepoint provider");await owner.query("update auth.users set raw_app_meta_data='{}' where id=$1",[OWNER]);
    await owner.query("set local role careslink_v1_generation_job_list_caller");await denied(SQL,args,"P0001","SESSION_REVOKED");
    await owner.query("rollback to savepoint provider");check("provider-role-removal-denied");
    await owner.query("set local enable_seqscan=off");
    const plan=JSON.stringify((await owner.query("explain (format json) select id from careslink_v1_generation.jobs where owner_user_id=$1 and note_type='communication' and service_code='note.communication.generate' order by created_at desc,id desc limit 21",[OWNER])).rows);
    assert.match(plan,/jobs_communication_owner_created_id_idx/);check("bounded-owner-keyset-index-plan");
    assert.deepEqual(await read(),first);assert.deepEqual(await read(),first);
    assert.equal(JSON.stringify((await owner.query("select * from public.point_ledger_entries order by id")).rows),ledger);
    check("repeated-reads-never-charge-or-mutate");
  } catch(error) {
    console.log(JSON.stringify({stage:"task-list-probe-failed",code:error.code ?? "UNCLASSIFIED",
      constraint:typeof error.constraint==="string" && /^[a-z0-9_]+$/.test(error.constraint)?error.constraint:"UNAVAILABLE",
      source:String(error.stack).split("\n").find(line=>line.includes("at ")&&line.includes("communication-note-job-list.database.mjs"))?.trim()}));
    throw error;
  } finally {await owner.query("rollback");}
  assert.equal((await owner.query("select count(*)::int n from careslink_v1_generation.jobs")).rows[0].n,initial);
  console.log(JSON.stringify({stage:"task-list-matrix",passed,catalogProbesRolledBack:true,modelCalled:false}));
}
