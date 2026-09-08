/** TEST ONLY. Installed only after the parent attests its fresh, owned PG16.
 * No existing target input, runtime table grants, worker, KMS or model call. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MIGRATIONS = [
  "20260823213144_harden_v1_note_generation_registration_retention.sql",
  "20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql",
  "20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql",
  "20260827142156_add_communication_note_preview_execution_authority_shadow.sql",
  "20260828034704_add_communication_note_preview_custody_callers_shadow.sql",
  "20260828235426_harden_communication_note_preview_reservation_runner_terminal_shadow.sql",
  "20260829011323_add_communication_note_preview_signed_terminal_caller_shadow.sql",
  "20260902052755_add_v1_communication_note_points_preview.sql",
  "20260902063211_add_v1_communication_note_points_admission.sql",
  "20260902121601_add_v1_communication_note_points_terminal_settlement.sql",
  "20260903041819_bind_v1_communication_note_encrypted_payload_admission.sql",
  "20260906233034_add_v1_communication_note_job_status_reader.sql",
  "../migration-candidates/20260908092143_add_v1_communication_note_job_list_reader.sql",
];

export async function installAdmissionBrowserDatabase(owner, actor, root, password, settlement = false) {
  assert.equal(typeof settlement, "boolean");
  assert.match(root, /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/u);
  assert.match(password, /^[a-f0-9]{64}$/u);
  assert.deepEqual((await owner.query(`select current_setting('data_directory') as data,
    current_setting('unix_socket_directories') as socket,current_setting('listen_addresses') as listeners,
    current_setting('cluster_name') as cluster,inet_server_addr() is null as unix_only`)).rows,
  [{ data: root + "/pg/data", socket: root + "/pg/socket", listeners: "", cluster: "careslink-review-browser-pg16", unix_only: true }]);
  assert.equal((await owner.query("select count(*)::int as n from careslink_v1_generation.jobs")).rows[0].n, 0);
  assert.equal((await owner.query("select count(*)::int as n from public.point_wallets")).rows[0].n, 0);
  await owner.query("grant usage on schema careslink_v1_generation to postgres");
  try {
    await actor.query("set role postgres");
    assert.equal((await actor.query("select rolsuper from pg_roles where rolname=current_user")).rows[0].rolsuper, false);
    for (const name of MIGRATIONS) {
      console.log(JSON.stringify({ stage: "admission-local-migration", name }));
      await actor.query("begin");
      await actor.query(await readFile(new URL("../../supabase/migrations/" + name, import.meta.url), "utf8"));
      await actor.query("commit");
    }
  } finally {
    await actor.query("rollback"); await actor.query("reset role");
    await owner.query("revoke usage on schema careslink_v1_generation from postgres");
  }

  // Fixed synthetic policy receipts, NOT encryption/provider attestation.
  // No worker is started or given credentials. All row constraints remain on.
  const worker = { kind: "careslink.v1.note-generation-worker-policy", version: "worker.local-browser.v1", status: "APPROVED",
    maxQueueAgeMs: 1800000, minimumPayloadRemainingAtClaimMs: settlement ? 10000 : 1000, leaseDurationMs: settlement ? 5000 : 500,
    heartbeatIntervalMs: 100, heartbeatSafetyMarginMs: 50, attemptDeadlineMs: settlement ? 10000 : 1000,
    providerDeadlineMs: 600, commitSafetyMarginMs: 100, maxAttempts: 1, retryDelayMsAfterAttempt: [],
    retryableOutcomes: [], recoveryBatchLimit: 10, jitter: { mode: "NONE" } };
  const payload = { policyVersion: "payload.local-browser.v1", encryptionProfileVersion: "encryption.synthetic-no-kms.v1",
    backupDispositionVersion: "backup.disposable-local.v1" };
  const hash = async value => (await owner.query("select public.v1_shadow_content_sha256($1::jsonb) as hash", [JSON.stringify(value)])).rows[0].hash;
  const workerDigest = await hash(worker), payloadDigest = await hash(payload), identity = "a".repeat(64);
  const providers = [];
  for (const noteType of ["communication", "handover", "progress", "ndis", "incident_factual"]) {
    const policy = { noteType, serviceCode: `note.${noteType}.generate`, contractVersion: "1.0.0-shadow.1",
      schemaVersion: "2026-08-09.v1-shadow", rateCatalogVersion: "2026-08-09.v1-shadow",
      providerId: "provider.synthetic-no-call", modelId: "model.synthetic-no-call", modelRevision: null,
      modelRevisionAvailability: "PROVIDER_NOT_EXPOSED", policyVersion: "provider.local-browser.v1",
      promptTemplateVersion: "prompt.synthetic.v1", goldenSetVersion: "golden.synthetic.v1", parserVersion: "parser.synthetic.v1", timeoutMs: 600 };
    providers.push({ ...policy, policyDigest: await hash(policy) });
  }
  const registration = { kind: "careslink.v1.note-generation-registered-worker", registrationVersion: "registration.local-browser.v1",
    status: "APPROVED", contractVersion: "1.0.0-shadow.1", schemaVersion: "2026-08-09.v1-shadow",
    workerIdentityVersion: "worker-identity.synthetic.v1", workerIdentityHash: identity,
    workerPolicyVersion: worker.version, workerPolicyDigest: workerDigest,
    payloadPolicyVersion: payload.policyVersion, payloadPolicySnapshotHash: payloadDigest,
    providerPolicies: providers.map(({ noteType, policyVersion, policyDigest }) => ({ noteType, policyVersion, policyDigest })) };
  const registrationDigest = await hash(registration);
  await owner.query("begin");
  await owner.query(`insert into careslink_v1_generation.worker_policies(version,status,max_queue_age_ms,
    minimum_payload_remaining_at_claim_ms,lease_duration_ms,heartbeat_interval_ms,heartbeat_safety_margin_ms,
    attempt_deadline_ms,provider_deadline_ms,commit_safety_margin_ms,max_attempts,retry_delay_ms_after_attempt,
    retryable_outcomes,recovery_batch_limit,jitter_mode,jitter_max_ms,policy_digest,shadow_only)
    values($1,'APPROVED',1800000,$5,$3,100,50,$4,600,100,1,'{}','{}',10,'NONE',null,$2,true)`, [worker.version, workerDigest, worker.leaseDurationMs, worker.attemptDeadlineMs, worker.minimumPayloadRemainingAtClaimMs]);
  await owner.query(`insert into careslink_v1_generation.payload_policies(policy_version,status,encryption_profile_version,
    backup_disposition_version,policy_digest,kms_key_version_resource_hash,shadow_only) values($1,'APPROVED',$2,$3,$4,$5,true)`,
  [payload.policyVersion, payload.encryptionProfileVersion, payload.backupDispositionVersion, payloadDigest, "b".repeat(64)]);
  for (const p of providers) await owner.query(`insert into careslink_v1_generation.provider_policies(note_type,policy_version,status,
    service_code,contract_version,schema_version,rate_catalog_version,provider_id,model_id,model_revision,
    model_revision_availability,prompt_template_version,golden_set_version,parser_version,timeout_ms,policy_digest,shadow_only)
    values($1,$2,'APPROVED',$3,$4,$5,$6,$7,$8,null,$9,$10,$11,$12,600,$13,true)`,
  [p.noteType,p.policyVersion,p.serviceCode,p.contractVersion,p.schemaVersion,p.rateCatalogVersion,p.providerId,p.modelId,
    p.modelRevisionAvailability,p.promptTemplateVersion,p.goldenSetVersion,p.parserVersion,p.policyDigest]);
  await owner.query(`insert into careslink_v1_generation.worker_registrations(registration_digest,registration_version,status,
    contract_version,schema_version,worker_identity_version,worker_identity_hash,worker_policy_version,worker_policy_digest,
    payload_policy_version,payload_policy_snapshot_hash,shadow_only) values($1,$2,'APPROVED',$3,$4,$5,$6,$7,$8,$9,$10,true)`,
  [registrationDigest,registration.registrationVersion,registration.contractVersion,registration.schemaVersion,
    registration.workerIdentityVersion,identity,worker.version,workerDigest,payload.policyVersion,payloadDigest]);
  for (const p of providers) await owner.query(`insert into careslink_v1_generation.worker_registration_provider_policies
    (registration_digest,note_type,policy_version,policy_digest,shadow_only) values($1,$2,$3,$4,true)`,
  [registrationDigest,p.noteType,p.policyVersion,p.policyDigest]);
  await owner.query(`insert into careslink_v1_generation.admission_policy_bindings(binding_version,note_type,registration_digest,
    status,activated_at,created_at,shadow_only) values('binding.local-browser.v1','communication',$1,'ACTIVE',
    date_trunc('milliseconds',now()),date_trunc('milliseconds',now()),true)`, [registrationDigest]);
  // The known default-off constraint is relaxed ONLY in this attested fresh DB.
  await owner.query("alter table careslink_v1_generation.settings drop constraint settings_enabled_check");
  await owner.query("update careslink_v1_generation.settings set enabled=true where capability='note_generation_v1' and shadow_only=true");
  await owner.query(`insert into public.point_wallets(id,owner_user_id,status,shadow_only)
    values('ab000000-0000-4000-8000-000000000001',$1,'ACTIVE',true)`, [OWNER]);
  await owner.query(`insert into public.point_lots(id,wallet_id,owner_user_id,source,source_reference,original_points,remaining_points,granted_at,shadow_only)
    values('ab000000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000001',$1,'ADJUSTMENT','local-browser-synthetic',30,30,now(),true)`, [OWNER]);
  await owner.query(`insert into public.point_ledger_entries(wallet_id,owner_user_id,event,points,delta,lot_id,source,source_reference,created_at,shadow_only)
    select wallet_id,owner_user_id,'GRANT',original_points,original_points,id,source,source_reference,granted_at,true
    from public.point_lots where owner_user_id=$1`, [OWNER]);
  await owner.query("update public.privacy_reviews set confirmed_at=now(),expires_at=now()+interval '30 minutes' where owner_user_id=$1", [OWNER]);
  await owner.query(`create role cl_admission_browser_runtime login noinherit nosuperuser nocreatedb nocreaterole
    noreplication nobypassrls password '${password}' connection limit 4`);
  await owner.query(`grant careslink_v1_generation_points_admission_caller,careslink_v1_generation_job_status_caller,careslink_v1_generation_job_list_caller
    to cl_admission_browser_runtime with admin false,inherit false,set true`);
  await owner.query("commit");
  // Do not give admission credentials authenticated, table or worker authority.
  for (const table of ["auth.users","auth.sessions","public.point_wallets","public.point_lots","public.point_ledger_entries","careslink_v1_generation.jobs","careslink_v1_generation.payloads"])
    assert.equal((await owner.query("select has_table_privilege('cl_admission_browser_runtime',$1,'SELECT,INSERT,UPDATE,DELETE') as ok", [table])).rows[0].ok, false);
  assert.equal((await owner.query("select pg_has_role('cl_admission_browser_runtime','authenticated','MEMBER') as ok")).rows[0].ok, false);
  console.log(JSON.stringify({ stage: "admission-database-ready", migrations: MIGRATIONS.length, availablePoints: 30,
    reservedPoints: 0, workerStarted: false, kmsVerified: false, modelCalled: false }));
}

export async function verifyAdmissionBrowserDatabase(owner, runtime, workspaceTaskId) {
  if (workspaceTaskId !== undefined) assert.match(workspaceTaskId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const sql = `select careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job(
    $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::text,$9::text,$10::text,
    $11::text,$12::text,$13::text,$14::timestamptz,$15::text,$16::text,$17::text,$18::text,$19::text) as data`;
  const proof = (await owner.query("select cleaned_facts_hash from public.privacy_reviews where id='88888888-8888-4888-8888-888888888888'")).rows[0];
  const policy = (await owner.query("select * from careslink_v1_generation.payload_policies where policy_version='payload.local-browser.v1'")).rows[0];
  const values = [OWNER,"cccccccc-cccc-4ccc-8ccc-cccccccccccc","COOKIE",workspaceTaskId ?? randomUUID(),randomUUID(),
    "88888888-8888-4888-8888-888888888888","en","1.0.0-shadow.1","2026-08-09.v1-shadow",proof.cleaned_facts_hash,
    "c".repeat(64),"d".repeat(64),"e".repeat(64),new Date(Date.now()+20*60*1000).toISOString(),
    policy.policy_version,policy.policy_digest,policy.encryption_profile_version,policy.kms_key_version_resource_hash,policy.backup_disposition_version];
  let passed = 0;
  const check = name => { passed++; console.log(JSON.stringify({ stage: "admission-local-scenario", name })); };
  const denied = async (statement, parameters, code, message) => {
    await runtime.query("savepoint denied");
    await assert.rejects(runtime.query(statement,parameters), e=>e.code===code&&(!message||e.message===message));
    await runtime.query("rollback to savepoint denied");
  };
  await runtime.query("begin");
  try {
    const readSql = "select careslink_v1_generation.get_v1_communication_note_job_status($1,$2,$3,$4,$5) as data";
    const readValues = [OWNER,values[1],values[3],values[7],values[8]];
    if (workspaceTaskId) {
      await runtime.query("set local role careslink_v1_generation_job_status_caller");
      await denied(readSql,readValues,"P0001","NOT_FOUND");
      check("workspace-preallocated-id-is-empty-before-admission");
    }
    await runtime.query("set local role careslink_v1_generation_points_admission_caller");
    await denied("select * from public.point_wallets",[],"42501");
    await denied("set local role careslink_v1_generation_executor",[],"42501"); check("runtime-no-table-or-worker-authority");
    const first = (await runtime.query(sql,values)).rows[0].data;
    assert.equal(first.created,true); assert.equal(first.pointsReserved,true); assert.equal(first.job.status,"QUEUED");
    check("atomic-queued-job-and-reservation");
    const replay = (await runtime.query(sql,values.map((v,i)=>i===3||i===4?randomUUID():v))).rows[0].data;
    assert.equal(replay.created,false);assert.deepEqual(replay.job,first.job);assert.equal(replay.pointsReserved,true);
    check("same-key-new-candidate-replays-original-job");
    await denied(sql,values.map((v,i)=>i===11?"f".repeat(64):v),"P0001","IDEMPOTENCY_CONFLICT");check("same-key-changed-request-rejected");
    await denied(sql,values.map((v,i)=>i===3||i===4?randomUUID():i===10?"f".repeat(64):v),"P0001","POINTS_INSUFFICIENT");
    check("second-key-insufficient-points-rolls-back");
    await denied(sql,values.map((v,i)=>i===1?"dddddddd-dddd-4ddd-8ddd-dddddddddddd":v),"P0001","SESSION_REVOKED");
    check("replay-rechecks-owner-session");
    await runtime.query("set local role careslink_v1_generation_job_status_caller");
    const read = (await runtime.query("select careslink_v1_generation.get_v1_communication_note_job_status($1,$2,$3,$4,$5) as data",
      [OWNER,values[1],values[3],values[7],values[8]])).rows[0].data.job;
    assert.deepEqual(read,first.job); check("purpose-reader-returns-real-queued-job");
    if (workspaceTaskId) {
      await denied(readSql,readValues.map((v,i)=>i===0?"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":i===1?"dddddddd-dddd-4ddd-8ddd-dddddddddddd":v),"P0001","NOT_FOUND");
      check("workspace-foreign-owner-cannot-read-preallocated-task");
      await denied(readSql,readValues.map((v,i)=>i===1?randomUUID():v),"P0001","SESSION_REVOKED");
      check("workspace-revoked-session-cannot-read-preallocated-task");
      for (let i=0;i<3;i++) assert.deepEqual((await runtime.query(readSql,readValues)).rows[0].data.job,first.job);
      check("workspace-repeated-reads-return-original-queued-task");
    }
  } finally { await runtime.query("rollback"); }
  assert.equal((await owner.query("select count(*)::int as n from careslink_v1_generation.jobs")).rows[0].n,0);
  assert.equal((await owner.query("select count(*)::int as n from public.point_reservations")).rows[0].n,0);
  assert.equal((await owner.query("select sum(remaining_points)::int as n from public.point_lots")).rows[0].n,30);
  check("scenario-rollback-restores-fresh-browser-balance");
  console.log(JSON.stringify({ stage:"admission-local-matrix",passed }));
}
