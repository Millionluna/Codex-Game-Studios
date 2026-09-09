/** TEST ONLY: rollback-only synthetic metadata matrix in the owned PG16.
 * Uses the existing authenticated RPC; no migration, permission or hosted IO. */
import assert from "node:assert/strict";
export async function verifyCommunicationNoteDraftCatalog(owner) {
  const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const FOREIGN="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",FOREIGN_SESSION="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const DOC="11111111-1111-4111-8111-111111111111";
  const id=i=>`70000000-0000-4000-8000-${String(i).padStart(12,"0")}`;
  let passed=0;
  const scenario=async(name,run)=>{await run();passed++;console.log(JSON.stringify({stage:"draft-catalog-scenario",name}));};
  const list=async(after=null,user=OWNER,session=SESSION)=>{
    await owner.query("savepoint catalog_read");
    try {
      await owner.query("set local role authenticated");
      await owner.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:session,role:"authenticated",is_anonymous:false,exp:Math.floor(Date.now()/1000)+3600})]);
      return (await owner.query("select public.list_v1_shadow_documents($1,20) as data",[after])).rows[0].data;
    } finally {await owner.query("rollback to savepoint catalog_read");await owner.query("release savepoint catalog_read");}
  };
  const denied=(promise,code)=>assert.rejects(promise,e=>e.code==="P0001"&&e.message===code);
  await owner.query("begin");
  try {
    const initial=await list();assert.equal(initial.documents.length,2);
    for(let i=1;i<=23;i++) {
      await owner.query(`insert into public.ai_documents(id,owner_user_id,note_type,source_locale,schema_version,contract_version)
        select $1,owner_user_id,note_type,source_locale,schema_version,contract_version from public.ai_documents where id=$2`,[id(i),DOC]);
      await owner.query(`insert into public.ai_document_revisions(id,document_id,owner_user_id,revision_number,content,content_hash,mutation_id,schema_version,contract_version,privacy_review_id)
        select $1,$2,owner_user_id,1,content,content_hash,($1::uuid)::text,schema_version,contract_version,privacy_review_id
        from public.ai_document_revisions where document_id=$3 and revision_number=1`,[id(100+i),id(i),DOC]);
      await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=1 where id=$1",[id(i),id(100+i)]);
    }
    let first,second;
    await scenario("twenty-row-keyset-pages-are-disjoint-and-complete",async()=>{
      first=await list();assert.equal(first.documents.length,20);assert.equal(first.hasMore,true);
      assert.equal(first.nextCursor,first.documents.at(-1).canonicalId);
      second=await list(first.nextCursor);assert.equal(second.documents.length,5);assert.equal(second.hasMore,false);assert.equal(second.nextCursor,null);
      const ids=[...first.documents,...second.documents].map(d=>d.canonicalId);assert.equal(new Set(ids).size,25);assert.deepEqual(ids,[...ids].sort());
    });
    await scenario("minimal-metadata-without-body-or-review-claims",async()=>{
      for(const d of first.documents)assert.deepEqual(Object.keys(d).sort(),["canonicalId","noteType","sourceLocale","lifecycleStatus","currentRevisionId","currentRevisionNumber","contractVersion","schemaVersion","createdAt","updatedAt","deletedAt"].sort());
      assert.doesNotMatch(JSON.stringify(first),/englishDraft|factsSummary|selfReviewStatus|ownerUserId|contentHash/);
    });
    await scenario("foreign-owner-empty-and-cursor-not-authority",async()=>{
      assert.deepEqual(await list(null,FOREIGN,FOREIGN_SESSION),{documents:[],nextCursor:null,hasMore:false});
      await denied(list(first.nextCursor,FOREIGN,FOREIGN_SESSION),"VALIDATION_ERROR");
    });
    await scenario("mismatched-and-revoked-session-denied",async()=>{
      await denied(list(null,OWNER,FOREIGN_SESSION),"SESSION_REVOKED");
      await owner.query("delete from auth.sessions where id=$1",[SESSION]);
      await denied(list(),"SESSION_REVOKED");
      await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);
    });
    await scenario("other-type-and-tombstone-metadata-remain-filterable",async()=>{
      await owner.query("update public.ai_documents set note_type='handover' where id=$1",[id(1)]);
      await owner.query("update public.ai_documents set lifecycle_status='TOMBSTONED',tombstoned_at=clock_timestamp() where id=$1",[id(2)]);
      const page=await list();assert.equal(page.documents.find(d=>d.canonicalId===id(1)).noteType,"handover");
      assert.equal(page.documents.find(d=>d.canonicalId===id(2)).lifecycleStatus,"TOMBSTONED");assert.equal(page.hasMore,true);
    });
    await scenario("current-revision-metadata-updates-without-list-side-effects",async()=>{
      const counts=async()=>(await owner.query("select (select count(*)::int from public.self_review_events) as reviews,(select count(*)::int from public.ai_document_mutation_receipts) as receipts")).rows;
      const before=await counts();
      await owner.query(`insert into public.ai_document_revisions(id,document_id,owner_user_id,revision_number,content,content_hash,mutation_id,schema_version,contract_version,privacy_review_id,base_revision_id)
        select $1,document_id,owner_user_id,2,content,content_hash,($1::uuid)::text,schema_version,contract_version,privacy_review_id,id from public.ai_document_revisions where id=$2`,[id(200),id(103)]);
      await owner.query("update public.ai_documents set current_revision_id=$2,current_revision_number=2 where id=$1",[id(3),id(200)]);
      const d=(await list()).documents.find(d=>d.canonicalId===id(3));assert.equal(d.currentRevisionNumber,2);assert.equal(d.currentRevisionId,id(200));
      assert.deepEqual(await counts(),before);
    });
    await scenario("unknown-cursor-is-not-an-empty-success",()=>denied(list(id(999)),"VALIDATION_ERROR"));
    await scenario("page-read-does-not-grant-authenticated-table-select",async()=>{
      assert.equal((await owner.query("select has_table_privilege('authenticated','public.ai_documents','SELECT') as allowed")).rows[0].allowed,false);
    });
  } finally {await owner.query("rollback");}
  assert.equal((await listAfterRollback()).documents.length,2);
  async function listAfterRollback(){await owner.query("begin");try{return await list();}finally{await owner.query("rollback");}}
  console.log(JSON.stringify({stage:"draft-catalog-matrix",passed,rolledBack:true,hostedVerified:false}));
}
