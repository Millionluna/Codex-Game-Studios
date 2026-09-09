/** TEST ONLY. Post-settlement integration matrix using the actual unprivileged
 * browser runtime. Fixed synthetic identity; no HTTP or model/file operation. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";

export async function verifySettledReviewScenarios(owner, actor, root, terminal, verifyEdits=false, verifyList=false) {
  assert.equal(typeof verifyEdits,"boolean");
  assert.equal(typeof verifyList,"boolean");assert.ok(!verifyList || verifyEdits);
  assert.match(root,/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/u);
  assert.equal(await realpath(root),root);
  const {canonicalId:doc,revisionId:rev}=JSON.parse(await readFile(root+"/settlement-result.json","utf8"));
  const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  assert.deepEqual((await actor.query("select current_user as role,inet_server_addr() is null as unix_only")).rows,
    [{role:"cl_review_browser_runtime",unix_only:true}]);
  const before=await terminal.observe();
  const sql={read:"select public.get_v1_shadow_document($1) as data",
    documents:"select public.list_v1_shadow_documents($1,$2) as data",
    edit:"select public.save_communication_note_wording($1,$2,$3::jsonb) as data",
    review:"select public.confirm_communication_note_self_review($1,$2,$3,true,true,true) as data",
    list:"select public.list_communication_note_export_reports($1,$2) as data",
    report:"select public.record_communication_note_export_report($1,$2,$3::jsonb) as data"};
  const call=async(kind,values,foreign=false)=>{
    await actor.query("begin");await actor.query("set local role authenticated");
    try {
      await actor.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({
        sub:foreign?"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":OWNER,
        session_id:foreign?"dddddddd-dddd-4ddd-8ddd-dddddddddddd":SESSION,
        role:"authenticated",is_anonymous:false,exp:Math.floor(Date.now()/1000)+3600})]);
      const result=(await actor.query(sql[kind],values)).rows[0].data;await actor.query("commit");return result;
    } catch(error){await actor.query("rollback");throw error;}
  };
  const denied=(promise,message)=>assert.rejects(promise,e=>e.code==="P0001"&&e.message===message);
  let passed=0;
  const scenario=async(name,run)=>{await run();passed++;console.log(JSON.stringify({stage:"settled-review-scenario",name}));};
  const key=randomUUID(),attempt=randomUUID();
  const report={revisionId:rev,format:"TXT",outcome:"DOWNLOAD_INITIATED",startedAt:"2026-09-08T01:00:00.000Z"};
  const reviewArgs=[doc,rev,key], reportArgs=[doc,attempt,JSON.stringify(report)];
  let initial,receipt;
  await scenario("new-result-unreviewed-and-empty-durable-history",async()=>{
    initial=await call("read",[doc]);assert.equal(initial.selfReviewStatus,"REQUIRED");
    assert.equal(initial.document.currentRevisionId,rev);
    assert.deepEqual(await call("list",[doc,rev]),{status:"AVAILABLE",canonicalId:doc,revisionId:rev,storage:"DURABLE",entries:[],hasMore:false});
  });
  await scenario("unreviewed-export-report-denied",()=>denied(call("report",reportArgs),"REVIEW_REQUIRED"));
  await scenario("exact-review-replay-one-confirmation",async()=>{
    const first=await call("review",reviewArgs);assert.equal(first.status,"CONFIRMED");
    assert.deepEqual(await call("review",reviewArgs),first);
    assert.equal((await call("read",[doc])).selfReviewStatus,"CONFIRMED");
    assert.equal((await owner.query("select count(*)::int as n from public.self_review_events where document_id=$1",[doc])).rows[0].n,1);
  });
  await scenario("exact-report-replay-and-independent-durable-read",async()=>{
    receipt=await call("report",reportArgs);assert.equal(receipt.status,"RECORDED");assert.equal(receipt.storage,"DURABLE");
    assert.deepEqual(await call("report",reportArgs),receipt);
    const list=await call("list",[doc,rev]);assert.deepEqual(list.entries,[receipt.entry]);
    assert.doesNotMatch(JSON.stringify(list),/englishDraft|factsSummary|ownerUserId|No AI model/);
  });
  await scenario("changed-report-replay-rejected",()=>denied(call("report",[doc,attempt,JSON.stringify({...report,format:"PDF"})]),"INVALID_REQUEST"));
  await scenario("foreign-owner-cannot-read-review-or-report",async()=>{
    for(const [kind,values] of [["read",[doc]],["review",reviewArgs],["list",[doc,rev]],["report",reportArgs]])
      await denied(call(kind,values,true),"NOT_FOUND");
  });
  await scenario("revocation-rechecked-even-on-replay",async()=>{
    await owner.query("delete from auth.sessions where id=$1 and user_id=$2",[SESSION,OWNER]);
    try {
      for(const [kind,values] of [["read",[doc]],["review",reviewArgs],["list",[doc,rev]],["report",reportArgs]])
        await denied(call(kind,values),kind==="read"?"SESSION_REVOKED":"AUTH_REQUIRED");
    } finally {await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);}
  });
  await scenario("history-switch-fails-closed-and-restores-same-record",async()=>{
    await owner.query("update careslink_communication_history.flags set enabled=false");
    try {await denied(call("list",[doc,rev]),"UNAVAILABLE");await denied(call("report",reportArgs),"UNAVAILABLE");}
    finally {await owner.query("update careslink_communication_history.flags set enabled=true");}
    assert.deepEqual((await call("list",[doc,rev])).entries,[receipt.entry]);
  });
  await scenario("no-extra-points-job-revision-or-content-mutation",async()=>{
    assert.deepEqual(await terminal.observe(),before);
    assert.deepEqual((await call("read",[doc])).revisions,initial.revisions);
    assert.equal((await owner.query("select count(*)::int as n from careslink_communication_history.reports where document_id=$1",[doc])).rows[0].n,1);
  });
  console.log(JSON.stringify({stage:"settled-review-matrix",passed,reviewEvents:1,historyReports:1,pointsUnchanged:true,actualFileExport:false}));
  if(!verifyEdits) return;
  const editStart=passed, editKey=randomUUID(), newReviewKey=randomUUID(), newReportKey=randomUUID();
  const original=initial.revisions.find(r=>r.revisionId===rev);
  const command={baseRevisionId:rev,englishDraft:"Synthetic wording edit, version two. No AI model was called.",
    reviewVersions:{"zh-Hans":"合成措辞修改，第二版。","zh-Hant":"合成措辭修改，第二版。"},wordingConfirmed:true};
  const editArgs=[doc,editKey,JSON.stringify(command)];
  let ack,newRev,newReport;
  await scenario("edit:settled-draft-saves-one-new-revision",async()=>{
    ack=await call("edit",editArgs);newRev=ack.revisionId;
    assert.equal(ack.status,"SAVED");assert.equal(ack.revisionNumber,2);assert.equal(ack.baseRevisionId,rev);
    assert.equal(ack.selfReviewStatus,"REQUIRED");assert.notEqual(newRev,rev);
  });
  await scenario("edit:exact-replay-and-stale-base-denial",async()=>{
    assert.deepEqual(await call("edit",editArgs),ack);
    await denied(call("edit",[doc,editKey,JSON.stringify({...command,englishDraft:"Changed replay"})]),"INVALID_REQUEST");
    await denied(call("edit",[doc,randomUUID(),JSON.stringify(command)]),"STALE_REVISION");
  });
  await scenario("edit:new-review-required-original-facts-and-history-preserved",async()=>{
    const d=await call("read",[doc]),selected=d.revisions.find(r=>r.revisionId===newRev);
    assert.equal(d.document.currentRevisionId,newRev);assert.equal(d.selfReviewStatus,"REQUIRED");assert.equal(d.revisions.length,2);
    assert.deepEqual(d.revisions.find(r=>r.revisionId===rev),original);
    assert.deepEqual(selected.content,{...original.content,englishDraft:command.englishDraft,reviewVersions:command.reviewVersions});
    assert.equal(selected.privacyReviewId,original.privacyReviewId);
    assert.deepEqual((await call("list",[doc,rev])).entries,[receipt.entry]);
    assert.deepEqual((await call("list",[doc,newRev])).entries,[]);
  });
  await scenario("edit:old-review-and-export-replays-cannot-authorize-new-version",async()=>{
    await denied(call("review",reviewArgs),"STALE_REVISION");
    await denied(call("report",reportArgs),"STALE_REVISION");
    await denied(call("report",[doc,newReportKey,JSON.stringify({...report,revisionId:newRev})]),"REVIEW_REQUIRED");
  });
  await scenario("edit:fresh-review-and-report-record-once",async()=>{
    const args=[doc,newRev,newReviewKey],first=await call("review",args);
    assert.equal(first.status,"CONFIRMED");assert.deepEqual(await call("review",args),first);
    const next=[doc,newReportKey,JSON.stringify({...report,revisionId:newRev})];
    newReport=await call("report",next);assert.equal(newReport.status,"RECORDED");assert.deepEqual(await call("report",next),newReport);
  });
  await scenario("edit:both-version-histories-stay-separated",async()=>{
    assert.deepEqual((await call("list",[doc,rev])).entries,[receipt.entry]);
    assert.deepEqual((await call("list",[doc,newRev])).entries,[newReport.entry]);
    assert.equal(newReport.entry.revisionNumber,2);
    await denied(call("list",[doc,"22222222-2222-4222-8222-222222222222"]),"NOT_FOUND");
  });
  await scenario("edit:foreign-and-revoked-replays-denied",async()=>{
    await denied(call("edit",editArgs,true),"NOT_FOUND");
    await owner.query("delete from auth.sessions where id=$1 and user_id=$2",[SESSION,OWNER]);
    try {await denied(call("edit",editArgs),"AUTH_REQUIRED");}
    finally {await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);}
  });
  await scenario("edit:terminal-replay-keeps-original-generation-anchor",async()=>{
    await terminal.run("settle-replay");
    assert.deepEqual((await owner.query("select result_document_id,result_revision_id from careslink_v1_generation.jobs where status='SUCCEEDED' and owner_user_id=$1",[OWNER])).rows,
      [{result_document_id:doc,result_revision_id:rev}]);
  });
  await scenario("edit:no-additional-points-jobs-documents-or-extra-versions",async()=>{
    assert.deepEqual(await terminal.observe(),{...before,revisions:before.revisions+1});
    assert.equal((await call("read",[doc])).selfReviewStatus,"CONFIRMED");
    assert.deepEqual((await owner.query(`select
      (select count(*)::int from public.self_review_events where document_id=$1) reviews,
      (select count(*)::int from careslink_communication_history.reports where document_id=$1) reports`,[doc])).rows,[{reviews:2,reports:2}]);
  });
  console.log(JSON.stringify({stage:"settled-edit-matrix",passed:passed-editStart,revisions:2,reviewEvents:2,historyReports:2,pointsUnchanged:true}));
  if(!verifyList) return;
  const listStart=passed, listBefore=await terminal.observe();
  await scenario("list:actual-new-draft-points-to-edited-current-version",async()=>{
    const page=await call("documents",[null,100]);assert.equal(page.hasMore,false);assert.equal(page.nextCursor,null);
    const matching=page.documents.filter(d=>d.canonicalId===doc);assert.equal(matching.length,1);
    assert.equal(matching[0].currentRevisionId,newRev);assert.equal(matching[0].currentRevisionNumber,2);
    assert.equal(matching[0].noteType,"communication");assert.equal(matching[0].deletedAt,null);
  });
  await scenario("list:metadata-has-no-wording-facts-or-review-approval",async()=>{
    const page=await call("documents",[null,100]);
    for(const d of page.documents) assert.deepEqual(Object.keys(d).sort(),["canonicalId","noteType","sourceLocale","lifecycleStatus","currentRevisionId","currentRevisionNumber","contractVersion","schemaVersion","createdAt","updatedAt","deletedAt"].sort());
    assert.ok(!JSON.stringify(page).includes(command.englishDraft));
  });
  await scenario("list:foreign-owner-cannot-discover-new-draft",async()=>{
    const page=await call("documents",[null,100],true);
    assert.ok(page.documents.every(d=>d.canonicalId!==doc && d.canonicalId!=="11111111-1111-4111-8111-111111111111"));
  });
  await scenario("list:revoked-session-cannot-read-metadata",async()=>{
    await owner.query("delete from auth.sessions where id=$1 and user_id=$2",[SESSION,OWNER]);
    try {await denied(call("documents",[null,100]),"SESSION_REVOKED");}
    finally {await owner.query("insert into auth.sessions(id,user_id) values($1,$2)",[SESSION,OWNER]);}
  });
  await scenario("list:repeated-revisit-does-not-write-or-settle",async()=>{
    const first=await call("documents",[null,100]);assert.deepEqual(await call("documents",[null,100]),first);
    assert.deepEqual(await terminal.observe(),listBefore);
    assert.equal((await call("read",[doc])).document.currentRevisionId,newRev);
    assert.deepEqual((await call("list",[doc,rev])).entries,[receipt.entry]);
    assert.deepEqual((await call("list",[doc,newRev])).entries,[newReport.entry]);
  });
  console.log(JSON.stringify({stage:"settled-list-matrix",passed:passed-listStart,metadataOnly:true,pointsUnchanged:true}));
}
