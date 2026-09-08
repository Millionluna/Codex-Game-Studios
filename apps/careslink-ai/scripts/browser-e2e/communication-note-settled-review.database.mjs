/** TEST ONLY. Post-settlement integration matrix using the actual unprivileged
 * browser runtime. Fixed synthetic identity; no HTTP or model/file operation. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";

export async function verifySettledReviewScenarios(owner, actor, root, terminal) {
  assert.match(root,/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/u);
  assert.equal(await realpath(root),root);
  const {canonicalId:doc,revisionId:rev}=JSON.parse(await readFile(root+"/settlement-result.json","utf8"));
  const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  assert.deepEqual((await actor.query("select current_user as role,inet_server_addr() is null as unix_only")).rows,
    [{role:"cl_review_browser_runtime",unix_only:true}]);
  const before=await terminal.observe();
  const sql={read:"select public.get_v1_shadow_document($1) as data",
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
}
