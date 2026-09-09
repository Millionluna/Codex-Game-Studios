/** TEST ONLY. Parent/stdin-only terminal driver. Never copied into Next.
 * Real SQL claim/fence/terminal settlement; synthetic payload consumption and
 * provider evidence. No background worker, vault, KMS, provider or network call. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { realpath, writeFile } from "node:fs/promises";

const OWNER="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RUNTIME="cl_settlement_browser_runtime";
export const SETTLEMENT_COMMANDS=Object.freeze(["settle-failure","settle-cancel","settle-success","settle-replay"]);
export const SETTLEMENT_RPC_SIGNATURES=Object.freeze({
  claim:"claim_v1_shadow_note_generation_job(text,text,text,text,text,text)",
  authorize:"authorize_v1_shadow_note_generation_payload_attempt(uuid,uuid,uuid,text,text)",
  fence:"fence_v1_shadow_note_generation_attempt(uuid,uuid,text,text,text,text)",
  success:"commit_v1_shadow_note_generation_success(uuid,uuid,text,text,text,text,uuid,text,jsonb,text,jsonb)",
  failure:"settle_v1_shadow_note_generation_failure(uuid,uuid,text,text,text,text,text,jsonb)",
  cancel:"cancel_v1_shadow_note_generation_job(uuid,uuid,uuid,text,text)",
});
export function settlementSql(kind) {
  assert.ok(Object.hasOwn(SETTLEMENT_RPC_SIGNATURES,kind),"FIXED_TERMINAL_RPC_ONLY");
  const [name,signature]=SETTLEMENT_RPC_SIGNATURES[kind].split("(");
  return `select careslink_v1_generation.${name}(${signature.slice(0,-1).split(",").map((type,index)=>`$${index+1}::${type}`).join(",")}) as data`;
}
export async function installSettlementBrowserController(owner, open, root) {
  assert.match(root,/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/u);
  assert.equal(await realpath(root),root);
  assert.deepEqual((await owner.query(`select current_setting('data_directory') as data,
    current_setting('unix_socket_directories') as socket,current_setting('listen_addresses') as listeners,
    current_setting('cluster_name') as cluster,inet_server_addr() is null as unix_only`)).rows,
  [{data:root+"/pg/data",socket:root+"/pg/socket",listeners:"",cluster:"careslink-review-browser-pg16",unix_only:true}]);
  assert.equal((await owner.query("select count(*)::int as n from careslink_v1_generation.jobs")).rows[0].n,0);
  const password=randomBytes(32).toString("hex");
  await owner.query(`create role ${RUNTIME} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}' connection limit 2`);
  await owner.query(`grant usage on schema careslink_v1_generation to ${RUNTIME}`);
  for(const signature of Object.values(SETTLEMENT_RPC_SIGNATURES))
    await owner.query(`grant execute on function careslink_v1_generation.${signature} to ${RUNTIME}`);
  const grants=(await owner.query(`select p.proname from pg_proc p where p.pronamespace='careslink_v1_generation'::regnamespace
    and has_function_privilege($1,p.oid,'EXECUTE') order by p.proname`,[RUNTIME])).rows.map(r=>r.proname);
  assert.deepEqual(grants,Object.values(SETTLEMENT_RPC_SIGNATURES).map(s=>s.split("(")[0]).sort());
  assert.equal((await owner.query("select count(*)::int as n from pg_auth_members where member=$1::regrole",[RUNTIME])).rows[0].n,0);
  for(const table of ["auth.users","public.point_wallets","public.point_reservations","public.point_ledger_entries",
    "careslink_v1_generation.jobs","careslink_v1_generation.payload_grants","careslink_v1_generation.communication_note_point_settlements"])
    assert.equal((await owner.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as ok",[RUNTIME,table])).rows[0].ok,false);
  const registration=(await owner.query("select * from careslink_v1_generation.worker_registrations where registration_version='registration.local-browser.v1'")).rows[0];
  const provider=(await owner.query("select * from careslink_v1_generation.provider_policies where note_type='communication' and policy_version='provider.local-browser.v1'")).rows[0];
  assert.ok(registration && provider);
  const binding=[registration.registration_digest,registration.worker_policy_version,registration.worker_policy_digest];
  const hash=async value=>(await owner.query("select public.v1_shadow_content_sha256($1::jsonb) as hash",[JSON.stringify(value)])).rows[0].hash;
  const content=(await owner.query("select content from public.ai_document_revisions where id='22222222-2222-4222-8222-222222222222'")).rows[0].content;
  // Fixed authored synthetic wording, not an AI response or professional record.
  content.englishDraft="Synthetic terminal success test. No AI model was called.";
  content.disclaimer="User-reviewed draft wording based only on the details entered. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice. General documentation support only.";
  const { factsSummary: _facts, disclaimer: _notice, ...candidate }=content;
  void _facts; void _notice;
  const contentHash=await hash(content),candidateDigest=await hash(candidate);
  let last, busy=false;
  const observe=async()=>{
    const state=(await owner.query(`select
      (select sum(remaining_points)::int from public.point_lots where owner_user_id=$1) as available,
      (select coalesce(sum(points),0)::int from public.point_reservations where owner_user_id=$1 and status='RESERVED') as reserved,
      (select count(*)::int from public.point_ledger_entries where owner_user_id=$1 and event='RESERVE') as reserves,
      (select count(*)::int from public.point_ledger_entries where owner_user_id=$1 and event='COMMIT') as commits,
      (select count(*)::int from public.point_ledger_entries where owner_user_id=$1 and event='RELEASE') as releases,
      (select count(*)::int from careslink_v1_generation.communication_note_point_settlements where owner_user_id=$1) as settlements,
      (select count(*)::int from careslink_v1_generation.jobs where owner_user_id=$1) as jobs,
      (select count(*)::int from public.ai_documents where owner_user_id=$1) as documents,
      (select count(*)::int from public.ai_document_revisions where owner_user_id=$1) as revisions`,[OWNER])).rows[0];
    return state;
  };
  async function run(command) {
    assert.ok(SETTLEMENT_COMMANDS.includes(command),"FIXED_TERMINAL_COMMAND_ONLY");
    assert.equal(busy,false,"TERMINAL_COMMAND_ALREADY_RUNNING"); busy=true;
    let client;
    try {
      const before=await observe();
      client=await open(RUNTIME,password);
      assert.deepEqual((await client.query("select current_user as role,inet_server_addr() is null as unix_only")).rows,[{role:RUNTIME,unix_only:true}]);
      const call=async(kind,values)=>(await client.query(settlementSql(kind),values)).rows[0].data;
      if(command==="settle-replay") {
        assert.ok(last,"NO_TERMINAL_REQUEST_TO_REPLAY");
        assert.deepEqual(await call(last.kind,last.values),last.response);
        assert.deepEqual(await observe(),before);
        console.log(JSON.stringify({stage:"local-terminal-replay",status:last.status,unchanged:true}));
        return;
      }
      const queued=(await owner.query(`select id,payload_id from careslink_v1_generation.jobs
        where owner_user_id=$1 and initiating_session_id=$2 and note_type='communication' and status='QUEUED' order by created_at`,[OWNER,SESSION])).rows;
      assert.equal(queued.length,1,"EXACTLY_ONE_QUEUED_SYNTHETIC_JOB_REQUIRED");
      const job=queued[0];
      const kind=command==="settle-cancel"?"cancel":command==="settle-failure"?"failure":"success";
      let values;
      if(kind==="cancel") values=[OWNER,SESSION,job.id,registration.contract_version,registration.schema_version];
      else {
        const claimed=await call("claim",[...binding,registration.worker_identity_hash,registration.contract_version,registration.schema_version]);
        assert.equal(claimed.status,"CLAIMED","TERMINAL_CLAIM_NOT_ACQUIRED");assert.equal(claimed.claim.job.jobId,job.id);
        const claim=claimed.claim, attempt=claim.attempt.attemptId;
        if(kind==="failure") values=[job.id,attempt,claim.leaseToken,...binding,"PROVIDER_PERMANENT",null];
        else {
          const authorized=await call("authorize",[job.id,job.payload_id,attempt,claim.leaseToken,binding[0]]);
          assert.equal(authorized.status,"AUTHORIZED","TERMINAL_PAYLOAD_NOT_AUTHORIZED");
          // Explicit synthetic substitute for the still-unbound real vault
          // consumption port. Operator-only, exact owner/job/grant/attempt;
          // no constraints, RLS or terminal consistency triggers are disabled.
          const consumed=await owner.query(`update careslink_v1_generation.payload_grants set status='CONSUMED',consumed_at=date_trunc('milliseconds',clock_timestamp()),vault_grant_hash=$6
            where id=$1 and job_id=$2 and payload_id=$3 and attempt_id=$4 and owner_user_id=$5
              and status='ISSUED' and expires_at>clock_timestamp() returning id`,[authorized.grantId,job.id,job.payload_id,attempt,OWNER,await hash({syntheticOnly:true,grantId:authorized.grantId})]);
          assert.equal(consumed.rowCount,1,"SYNTHETIC_GRANT_NOT_CONSUMED");
          const acquired=(await owner.query("select acquired_at from careslink_v1_generation.attempts where id=$1 and job_id=$2 and owner_user_id=$3",[attempt,job.id,OWNER])).rows[0].acquired_at;
          const evidence={policyDigest:provider.policy_digest,providerId:provider.provider_id,modelId:provider.model_id,
            modelRevision:provider.model_revision,modelRevisionAvailability:provider.model_revision_availability,
            policyVersion:provider.policy_version,promptTemplateVersion:provider.prompt_template_version,
            goldenSetVersion:provider.golden_set_version,parserVersion:provider.parser_version,serviceCode:provider.service_code,
            rateCatalogVersion:provider.rate_catalog_version,timeoutMs:Number(provider.timeout_ms),workerPolicyDigest:binding[2],
            deadlineAt:new Date(acquired.getTime()+Number(provider.timeout_ms)).toISOString(),startedAt:acquired.toISOString(),finishedAt:acquired.toISOString(),
            durationMs:0,finishReason:"COMPLETED",providerRequestIdHash:null,usage:{status:"UNAVAILABLE",source:"UNAVAILABLE"},
            cost:{status:"UNAVAILABLE",source:"UNAVAILABLE"},candidateDigest};
          const fenced=await call("fence",[job.id,attempt,claim.leaseToken,...binding]);assert.equal(fenced.status,"FENCED");
          values=[job.id,attempt,claim.leaseToken,...binding,fenced.fenceId,fenced.fenceDigest,JSON.stringify(content),contentHash,JSON.stringify(evidence)];
        }
      }
      const response=await call(kind,values);
      const status=kind==="success"?"SUCCEEDED":kind==="failure"?"FAILED":"CANCELLED";
      const saved=(await owner.query("select status,result_document_id,result_revision_id from careslink_v1_generation.jobs where id=$1 and owner_user_id=$2",[job.id,OWNER])).rows[0];
      assert.equal(saved.status,status);
      const after=await observe();
      assert.deepEqual(after,{...before,available:before.available+(kind==="success"?0:20),reserved:before.reserved-20,
        commits:before.commits+(kind==="success"?1:0),releases:before.releases+(kind==="success"?0:1),settlements:before.settlements+1,
        documents:before.documents+(kind==="success"?1:0),revisions:before.revisions+(kind==="success"?1:0)});
      last={kind,values,response,status}; // Replay material stays only in parent memory.
      if(kind==="success") await writeFile(root+"/settlement-result.json",JSON.stringify({canonicalId:saved.result_document_id,revisionId:saved.result_revision_id}),{mode:0o600,flag:"wx"});
      console.log(JSON.stringify({stage:"local-terminal-settlement",status,...after,providerEvidenceSynthetic:true,modelCalled:false}));
    } finally { if(client) await client.end(); busy=false; }
  }
  return Object.freeze({run,observe});
}

/** Only the non-browser check mode calls this. Each new synthetic admission
 * uses the actual bound RPC; all changes are erased with its owned database. */
export async function verifySettlementBrowserController(owner, admissionRuntime, controller) {
  const proof=(await owner.query("select cleaned_facts_hash from public.privacy_reviews where id='88888888-8888-4888-8888-888888888888'")).rows[0];
  const policy=(await owner.query("select * from careslink_v1_generation.payload_policies where policy_version='payload.local-browser.v1'")).rows[0];
  let passed=0;
  for(const command of ["settle-failure","settle-cancel","settle-success"]) {
    await admissionRuntime.query("begin");await admissionRuntime.query("set local role careslink_v1_generation_points_admission_caller");
    try {
      const receipt=(await admissionRuntime.query(`select careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(
        $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::text,
        $14::timestamptz,$15::text,$16::text,$17::text,$18::text,$19::text) as data`,
      [OWNER,SESSION,"COOKIE",randomUUID(),randomUUID(),"88888888-8888-4888-8888-888888888888","en","1.0.0-shadow.1","2026-08-09.v1-shadow",
        proof.cleaned_facts_hash,randomBytes(32).toString("hex"),"d".repeat(64),"e".repeat(64),new Date(Date.now()+20*60000).toISOString(),
        policy.policy_version,policy.policy_digest,policy.encryption_profile_version,policy.kms_key_version_resource_hash,policy.backup_disposition_version])).rows[0].data;
      assert.equal(receipt.created,true);await admissionRuntime.query("commit");
    } catch(error) {await admissionRuntime.query("rollback");throw error;}
    await controller.run(command);passed++;
    await controller.run("settle-replay");passed++;
    const before=await controller.observe();
    await assert.rejects(controller.run(command),e=>e.code==="ERR_ASSERTION" && e.message.includes("EXACTLY_ONE_QUEUED_SYNTHETIC_JOB_REQUIRED"));
    assert.deepEqual(await controller.observe(),before);passed++;
  }
  assert.deepEqual(await controller.observe(),{available:10,reserved:0,reserves:3,commits:1,releases:2,settlements:3,jobs:3,documents:3,revisions:3});
  console.log(JSON.stringify({stage:"local-terminal-matrix",passed,allTerminalReplaysUnchanged:true}));
}
