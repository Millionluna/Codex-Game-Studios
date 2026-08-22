import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260821071044_add_v1_note_generation_worker_rpc_shadow.sql";
const assertionsPath =
  "supabase/assertions/v1_note_generation_worker_rpc_shadow_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(join(process.cwd(), assertionsPath), "utf8");

const schemaName = "careslink_v1_generation";
const ownerRole = "careslink_v1_generation_owner";
const executorRole = "careslink_v1_generation_executor";

const newTableNames = [
  "worker_policies",
  "provider_policies",
  "payload_policies",
  "worker_registrations",
  "worker_registration_provider_policies",
  "payloads",
  "payload_grants",
  "provider_evidence",
  "payload_purge_outbox",
] as const;

const allPrivateTableNames = [
  "attempts",
  "jobs",
  "payload_grants",
  "payload_policies",
  "payload_purge_outbox",
  "payloads",
  "provider_evidence",
  "provider_policies",
  "settings",
  "worker_policies",
  "worker_registration_provider_policies",
  "worker_registrations",
] as const;

const authReaderNames = [
  "fresh_session_is_active",
  "fresh_privacy_proof_expires_at",
] as const;

const executorHelperNames = [
  "_server_now",
  "_server_time",
  "_sha256_text",
  "_new_opaque_secret",
  "_assert_capability",
  "_set_owner",
  "_worker_policy_is_valid",
  "_provider_policy_is_valid",
  "_registration_is_valid",
  "_payload_snapshot_is_valid",
  "_job_registration_binding_is_valid",
  "_bounded_string_array_is_valid",
  "_validate_note_content",
  "_json_nonnegative_safe_integer",
  "_parse_server_time",
  "_provider_usage_is_valid",
  "_provider_cost_is_valid",
  "_validate_provider_evidence",
  "_enqueue_payload_purge",
  "_failure_envelope",
  "_success_envelope",
  "_settle_denied_authority",
] as const;

const rpcIdentities = {
  claim_v1_shadow_note_generation_job:
    "p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text, p_worker_identity_hash text, p_contract_version text, p_schema_version text",
  heartbeat_v1_shadow_note_generation_attempt:
    "p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text",
  fence_v1_shadow_note_generation_attempt:
    "p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text",
  commit_v1_shadow_note_generation_success:
    "p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text, p_fence_id uuid, p_fence_digest text, p_canonical_content jsonb, p_canonical_content_hash text, p_provider_evidence jsonb",
  settle_v1_shadow_note_generation_failure:
    "p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text, p_reason text, p_provider_evidence jsonb",
  resolve_v1_shadow_note_generation_attempt:
    "p_job_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_expected_content_hash text, p_expected_provider_evidence_hash text",
  recover_v1_shadow_note_generation_expired:
    "p_registration_digest text, p_worker_policy_version text, p_worker_policy_digest text, p_worker_identity_hash text, p_contract_version text, p_schema_version text",
  authorize_v1_shadow_note_generation_payload_attempt:
    "p_job_id uuid, p_payload_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text",
  consume_v1_shadow_note_generation_payload_grant:
    "p_job_id uuid, p_payload_id uuid, p_attempt_id uuid, p_lease_token text, p_registration_digest text, p_grant_id uuid",
} as const;

const rpcNames = Object.keys(rpcIdentities) as Array<keyof typeof rpcIdentities>;

describe("V1 Note registered-worker RPC shadow migration contract", () => {
  it("is an additive CLI-named source-only migration that cannot activate itself", () => {
    expect(migrationPath).toMatch(
      /^supabase\/migrations\/\d{14}_add_v1_note_generation_worker_rpc_shadow\.sql$/,
    );
    expect(migration).toContain("Source-only and default-off");
    expect(migration).toContain("does not enable the existing capability");
    expect(migration).toContain("does not enable");
    expect(migration).toContain("apply a migration, or touch\n-- Production");
    expect(migration).toContain("The migration runner owns the transaction boundary");
    expect(migration).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/im);
    expect(migration).not.toMatch(
      /\bcreate\s+(?:table|function|policy|index)\s+if\s+not\s+exists\b|\bon\s+conflict\b/i,
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+careslink_v1_generation\.settings\b/i,
    );
    expect(migration).not.toMatch(/\benabled\s*=\s*true\b/i);
  });

  it("creates exactly nine owner-created private tables and keeps policy catalogs empty", () => {
    expect(
      [...migration.matchAll(/^create table careslink_v1_generation\.([a-z0-9_]+)\s*\(/gm)].map(
        (match) => match[1],
      ),
    ).toEqual(newTableNames);

    const ownerDdlStart = migration.indexOf(`set role ${ownerRole};`);
    const ownerDdlEnd = migration.indexOf("reset role;", ownerDdlStart);
    expect(ownerDdlStart).toBeGreaterThanOrEqual(0);
    expect(ownerDdlEnd).toBeGreaterThan(ownerDdlStart);
    for (const table of newTableNames) {
      const tableStart = migration.indexOf(`create table ${schemaName}.${table}`);
      expect(tableStart).toBeGreaterThan(ownerDdlStart);
      expect(tableStart).toBeLessThan(ownerDdlEnd);
    }

    const catalogDdl = migration.slice(ownerDdlStart, ownerDdlEnd);
    for (const table of [
      "worker_policies",
      "provider_policies",
      "payload_policies",
      "worker_registrations",
      "worker_registration_provider_policies",
    ]) {
      expect(catalogDdl).not.toMatch(
        new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+${schemaName}\\.${table}\\b`, "i"),
      );
    }
    expect(migration).toContain(
      "This migration deliberately persists no worker,\n-- provider or payload-policy row, no worker registration and no payload",
    );
  });

  it("keeps payload, grant, evidence and purge storage metadata-only", () => {
    expect(columnNames(tableBlock("payloads"))).toEqual([
      "id",
      "job_id",
      "owner_user_id",
      "note_type",
      "source_locale",
      "contract_version",
      "schema_version",
      "privacy_review_id",
      "privacy_proof_expires_at",
      "cleaned_facts_hash",
      "request_hash",
      "policy_version",
      "encryption_profile_version",
      "backup_disposition_version",
      "policy_snapshot_hash",
      "payload_handle_hash",
      "state",
      "expires_at",
      "available_at",
      "revoked_at",
      "revoke_reason",
      "purge_requested_at",
      "purged_at",
      "purge_attempt_count",
      "created_at",
      "updated_at",
      "shadow_only",
    ]);
    expect(columnNames(tableBlock("payload_grants"))).toEqual([
      "id",
      "payload_id",
      "job_id",
      "owner_user_id",
      "attempt_id",
      "registration_digest",
      "lease_token_hash",
      "request_hash",
      "status",
      "authorized_at",
      "expires_at",
      "consumed_at",
      "revoked_at",
      "vault_grant_hash",
      "created_at",
      "shadow_only",
    ]);
    expect(columnNames(tableBlock("provider_evidence"))).toEqual([
      "attempt_id",
      "job_id",
      "owner_user_id",
      "evidence_hash",
      "evidence",
      "created_at",
      "shadow_only",
    ]);
    expect(columnNames(tableBlock("payload_purge_outbox"))).toEqual([
      "id",
      "transaction_id",
      "payload_id",
      "job_id",
      "owner_user_id",
      "reason",
      "event_reference_hash",
      "status",
      "requested_at",
      "attempt_count",
      "last_attempt_at",
      "completed_at",
      "created_at",
      "shadow_only",
    ]);

    const forbiddenColumns = [
      "cleaned_facts",
      "facts",
      "canonical_content",
      "provider_output",
      "provider_candidate",
      "transcript",
      "lease_token",
      "vault_locator",
      "payload_locator",
      "payload_handle",
      "vault_grant",
      "access_token",
      "refresh_token",
      "idempotency_key",
      "request_body",
      "response_body",
      "url",
      "error_message",
      "points",
      "point_cost",
    ];
    for (const table of newTableNames) {
      const block = tableBlock(table);
      expect(columnNames(block)).not.toEqual(
        expect.arrayContaining(forbiddenColumns),
      );
      expect(block).not.toMatch(/^\s*[a-z][a-z0-9_]*\s+bytea\b/im);
    }

    const jsonColumns = newTableNames.flatMap((table) =>
      columnDefinitions(tableBlock(table))
        .filter((column) => column.type === "jsonb" || column.type === "json")
        .map((column) => `${table}.${column.name}`),
    );
    expect(jsonColumns).toEqual(["provider_evidence.evidence"]);
    expect(migration).toContain(
      "Content-free provider evidence only. The JSON is structurally validated",
    );
  });

  it("keeps payload-policy identifiers aligned with the TypeScript contract", () => {
    const payloadIdentifier =
      "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
    const legacySlashIdentifier =
      "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$";
    const payloadPolicies = tableBlock("payload_policies");
    const registrations = tableBlock("worker_registrations");
    const payloads = tableBlock("payloads");

    expect(payloadPolicies.split(payloadIdentifier)).toHaveLength(4);
    expect(registrations).toContain(
      `and payload_policy_version ~ '${payloadIdentifier}'`,
    );
    expect(payloads.split(payloadIdentifier)).toHaveLength(4);
    expect(payloadPolicies).not.toContain(legacySlashIdentifier);
    expect(registrations).not.toContain(legacySlashIdentifier);
    expect(payloads).not.toContain(legacySlashIdentifier);
  });

  it("enables and forces RLS with executor-only private policies", () => {
    const normalized = normalizeSql(migration);
    for (const table of newTableNames) {
      expect(normalized).toContain(
        `alter table ${schemaName}.${table} enable row level security;`,
      );
      expect(normalized).toContain(
        `alter table ${schemaName}.${table} force row level security;`,
      );
    }

    const privatePolicyBlocks = [...migration.matchAll(
      /^create policy [a-z0-9_]+[\s\S]+?on careslink_v1_generation\.[a-z0-9_]+[\s\S]+?;/gm,
    )].map((match) => match[0]);
    expect(privatePolicyBlocks).toHaveLength(21);
    for (const policy of privatePolicyBlocks) {
      expect(policy).toContain(`to ${executorRole}`);
      expect(policy).not.toMatch(/\bto\s+(?:public|anon|authenticated|service_role)\b/i);
    }
  });

  it("freezes two auth readers, twenty-two helpers and nine exact RPCs", () => {
    const createdFunctionNames = [
      ...migration.matchAll(/^create function careslink_v1_generation\.([a-z0-9_]+)\(/gm),
    ].map((match) => match[1]);
    expect(createdFunctionNames).toEqual([
      ...authReaderNames,
      ...executorHelperNames,
      ...rpcNames,
    ]);
    expect(authReaderNames).toHaveLength(2);
    expect(executorHelperNames).toHaveLength(22);
    expect(rpcNames).toHaveLength(9);

    for (const [rpc, expectedIdentity] of Object.entries(rpcIdentities)) {
      const block = functionBlock(rpc);
      expect(functionIdentityArguments(rpc)).toBe(expectedIdentity);
      expect(block).toMatch(/\)\s*returns jsonb\s/i);
      expect(block).toContain("volatile");
      expect(block).toContain("security definer");
      expect(block).toContain("set search_path = ''");
      expect(block).toContain(`${schemaName}._assert_capability()`);
      if (rpc !== "resolve_v1_shadow_note_generation_attempt") {
        expect(block).toContain(`${schemaName}._server_now()`);
      }
    }

    const forbiddenRpcParameters =
      /\bp_(?:owner|user|session|now|at|clock|lease_duration|attempt_deadline|retry|backoff|jitter|max_attempt|recovery_batch|provider_deadline|price|points|retention|ttl|vault_locator|payload_handle)\b/i;
    expect(Object.values(rpcIdentities).join(", ")).not.toMatch(
      forbiddenRpcParameters,
    );
  });

  it("creates helpers and RPCs as the executor with closed defaults and search paths", () => {
    const executorSetStatements = [
      ...migration.matchAll(/^set role careslink_v1_generation_executor;$/gm),
    ];
    expect(executorSetStatements).toHaveLength(2);
    expect(migration.match(/^alter default privileges\b/gm)).toHaveLength(8);

    const functionWindowStart = migration.lastIndexOf(`set role ${executorRole};`);
    const functionWindowEnd = migration.indexOf("reset role;", functionWindowStart);
    expect(functionWindowStart).toBeGreaterThanOrEqual(0);
    expect(functionWindowEnd).toBeGreaterThan(functionWindowStart);
    const functionWindow = migration.slice(functionWindowStart, functionWindowEnd);
    expect(functionWindow).toContain(`create function ${schemaName}._server_now()`);
    expect(functionWindow).toContain(
      `create function ${schemaName}.consume_v1_shadow_note_generation_payload_grant(`,
    );

    for (const helper of executorHelperNames) {
      const block = functionBlock(helper);
      expect(block).toContain("security invoker");
      expect(block).toContain("set search_path = ''");
      expect(functionWindow).toContain(`create function ${schemaName}.${helper}(`);
    }
    for (const rpc of rpcNames) {
      expect(functionWindow).toContain(`create function ${schemaName}.${rpc}(`);
    }
    expect(migration).not.toMatch(
      /alter function careslink_v1_generation\.[a-z0-9_]+[\s\S]+?owner to/i,
    );

    for (const reader of authReaderNames) {
      const block = functionBlock(reader);
      expect(block).toContain("security definer");
      expect(block).toContain("set search_path = ''");
      expect(block).not.toContain("raw_user_meta_data");
      expect(block).not.toContain("user_metadata");
    }
    const sessionReader = functionBlock("fresh_session_is_active");
    expect(sessionReader).not.toContain("for key share");
    expect(sessionReader.match(/for share;/g)).toHaveLength(2);
  });

  it("closes every RPC identity and leaves no Data API or default EXECUTE path", () => {
    const normalized = normalizeSql(migration);
    for (const [rpc, identity] of Object.entries(rpcIdentities)) {
      const argumentTypes = identity
        .split(", ")
        .map((argument) => argument.split(" ")[1])
        .join(", ");
      expect(normalized).toContain(
        normalizeSql(`
          revoke all on function ${schemaName}.${rpc}(${argumentTypes})
          from public, anon, authenticated, service_role, ${ownerRole};
        `),
      );
      expect(migration).not.toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+${schemaName}\\.${rpc}\\b`,
          "i",
        ),
      );
      expect(migration).not.toContain(`create function public.${rpc}(`);
    }

    expect(normalized).toContain(
      `revoke create on schema ${schemaName} from ${executorRole};`,
    );
    expect(normalized).toContain(
      `revoke all on all tables in schema ${schemaName} from public, anon, authenticated, service_role;`,
    );
    expect(normalized).toContain(
      `revoke all on all sequences in schema ${schemaName} from public, anon, authenticated, service_role;`,
    );
    expect(normalized).toContain(
      `revoke ${executorRole} from current_user granted by current_user;`,
    );
    expect(normalized).toContain(
      `revoke ${ownerRole} from current_user granted by current_user;`,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:usage|create)\s+on schema careslink_v1_generation\s+to\s+(?:public|anon|authenticated|service_role)/i,
    );
  });

  it("uses database-owned policy and time with deterministic SKIP LOCKED claims", () => {
    const claim = functionBlock("claim_v1_shadow_note_generation_job");
    const selectIndex = claim.indexOf("select job.*");
    const orderIndex = claim.indexOf(
      "order by coalesce(job.next_eligible_at, job.created_at), job.created_at, job.id",
    );
    const skipLockedIndex = claim.indexOf("for update of job skip locked");
    const limitIndex = claim.indexOf("limit 1", skipLockedIndex);
    const attemptInsertIndex = claim.indexOf(
      `insert into ${schemaName}.attempts`,
    );
    const jobUpdateIndex = claim.indexOf(`update ${schemaName}.jobs as job`);

    expect(selectIndex).toBeGreaterThanOrEqual(0);
    expect(orderIndex).toBeGreaterThan(selectIndex);
    expect(skipLockedIndex).toBeGreaterThan(orderIndex);
    expect(limitIndex).toBeGreaterThan(skipLockedIndex);
    expect(attemptInsertIndex).toBeGreaterThan(limitIndex);
    expect(jobUpdateIndex).toBeGreaterThan(attemptInsertIndex);
    expect(migration.match(/for update of job skip locked/g)).toHaveLength(3);

    const recovery = functionBlock("recover_v1_shadow_note_generation_expired");
    expect(recovery.match(/for update of job skip locked/g)).toHaveLength(2);
    expect(recovery).toContain("limit v_policy.recovery_batch_limit");
    expect(recovery).toContain(
      "limit greatest(v_policy.recovery_batch_limit - v_recovered, 0)",
    );
    expect(migration).not.toMatch(/\bclock_timestamp\s*\(/i);
  });

  it("rejects NULL lease tokens in all seven token-bearing RPCs", () => {
    const tokenBearingRpcs = [
      "heartbeat_v1_shadow_note_generation_attempt",
      "fence_v1_shadow_note_generation_attempt",
      "commit_v1_shadow_note_generation_success",
      "settle_v1_shadow_note_generation_failure",
      "resolve_v1_shadow_note_generation_attempt",
      "authorize_v1_shadow_note_generation_payload_attempt",
      "consume_v1_shadow_note_generation_payload_grant",
    ] as const;
    const nullSafeLeaseComparison =
      /v_attempt\.lease_token_hash is distinct from\s+careslink_v1_generation\._sha256_text\(p_lease_token\)/g;
    const nullUnsafeLeaseComparison =
      /v_attempt\.lease_token_hash <>\s+careslink_v1_generation\._sha256_text\(p_lease_token\)/g;

    expect(migration.match(nullSafeLeaseComparison)).toHaveLength(7);
    expect(migration.match(nullUnsafeLeaseComparison) ?? []).toHaveLength(0);
    for (const rpc of tokenBearingRpcs) {
      const block = functionBlock(rpc);
      expect(block).toMatch(
        /v_attempt\.lease_token_hash is distinct from\s+careslink_v1_generation\._sha256_text\(p_lease_token\)/,
      );
      expect(block).not.toMatch(
        /v_attempt\.lease_token_hash <>\s+careslink_v1_generation\._sha256_text\(p_lease_token\)/,
      );
    }

    const matrixStart = assertions.indexOf(
      "-- NULL lease-token matrix begins.",
    );
    const matrixEnd = assertions.indexOf(
      "-- NULL lease-token matrix ends.",
      matrixStart,
    );
    expect(matrixStart).toBeGreaterThanOrEqual(0);
    expect(matrixEnd).toBeGreaterThan(matrixStart);
    const matrix = assertions.slice(matrixStart, matrixEnd);
    for (const rpc of tokenBearingRpcs) {
      expect(matrix).toContain(`${schemaName}.${rpc}(`);
    }
    expect(matrix.match(/NULL lease token did not fail closed/g)).toHaveLength(
      7,
    );
    expect(matrix).toContain("v_rejections <> 7");
    expect(matrix).toContain(
      "NULL lease-token matrix mutated state or row counts",
    );
  });

  it("rejects partial retry delays and unsafe worker-policy catalog shapes", () => {
    const attemptDelayStart = migration.indexOf(
      "constraint attempts_settlement_delay_shape_check check (",
    );
    const attemptDelayEnd = migration.indexOf("\n  );", attemptDelayStart);
    expect(attemptDelayStart).toBeGreaterThanOrEqual(0);
    expect(attemptDelayEnd).toBeGreaterThan(attemptDelayStart);
    const attemptDelayCheck = migration.slice(
      attemptDelayStart,
      attemptDelayEnd,
    );
    for (const column of [
      "settlement_base_delay_ms",
      "settlement_jitter_ms",
      "settlement_retry_delay_ms",
    ]) {
      expect(attemptDelayCheck).toContain(`${column} is not null`);
      expect(assertions).toContain(`NULL ${column} was accepted`);
    }
    expect(assertions).toContain(
      "partial-NULL settlement delay checks mutated state",
    );

    const workerPolicies = tableBlock("worker_policies");
    expect(workerPolicies).toContain("max_attempts between 1 and 1000000");
    expect(workerPolicies).toContain(
      "recovery_batch_limit between 1 and 1000000",
    );
    expect(workerPolicies).toContain("jitter_max_ms is not null");
    expect(normalizeSql(workerPolicies)).toContain(
      "9007199254740991 - jitter_max_ms >= all(retry_delay_ms_after_attempt)",
    );
    for (const column of [
      "retry_delay_ms_after_attempt",
      "retryable_outcomes",
    ]) {
      expect(workerPolicies).toContain(`array_ndims(${column}) = 1`);
      expect(workerPolicies).toContain(`array_lower(${column}, 1) = 1`);
    }
    for (const marker of [
      "APPROVED_BOUNDED NULL jitter_max_ms was accepted",
      "retry base plus bounded jitter exceeded safe integer",
      "recovery batch limit above 1000000 was accepted",
      "zero-lower-bound retry arrays were accepted",
    ]) {
      expect(assertions).toContain(marker);
    }
  });

  it("requires exact worker identity and version bindings at claim and recovery entry", () => {
    for (const rpc of [
      "claim_v1_shadow_note_generation_job",
      "recover_v1_shadow_note_generation_expired",
    ]) {
      const block = functionBlock(rpc);
      expect(block).toContain("p_registration_digest is null");
      expect(block).toContain("p_worker_policy_version is null");
      expect(block).toContain("p_worker_policy_digest is null");
      expect(block).toContain("p_worker_identity_hash is null");
      expect(block).toContain(
        "p_contract_version is distinct from '1.0.0-shadow.1'",
      );
      expect(block).toContain(
        "p_schema_version is distinct from '2026-08-09.v1-shadow'",
      );
    }
    expect(assertions).toContain(
      "claim accepted an incomplete worker identity binding",
    );
    expect(assertions).toContain(
      "recovery accepted an incomplete worker identity binding",
    );
  });

  it("reconstructs immutable historical envelopes after job and payload state advance", () => {
    const failureEnvelope = functionBlock("_failure_envelope");
    for (const delayColumn of [
      "settlement_base_delay_ms",
      "settlement_jitter_ms",
      "settlement_retry_delay_ms",
    ]) {
      expect(failureEnvelope).toContain(
        `v_attempt.${delayColumn} is not null`,
      );
    }
    expect(failureEnvelope).toContain(
      "v_attempt.finished_at\n            + v_attempt.settlement_retry_delay_ms * interval '1 millisecond'",
    );
    expect(failureEnvelope).not.toContain("v_payload.state");
    expect(failureEnvelope).not.toContain("v_outbox.status");
    expect(failureEnvelope).toContain(
      "'state', case when v_is_retry then 'AVAILABLE' else 'REVOKED' end",
    );

    const successEnvelope = functionBlock("_success_envelope");
    expect(successEnvelope).not.toContain("v_payload.state");
    expect(successEnvelope).not.toContain("v_outbox.status");
    expect(successEnvelope).toContain("'state', 'REVOKED'");
    expect(successEnvelope).toContain("'status', 'ENQUEUED'");

    const settle = functionBlock(
      "settle_v1_shadow_note_generation_failure",
    );
    const settleReplayStart = settle.indexOf(
      "if v_attempt.status <> 'RUNNING' then",
    );
    const currentJobGate = settle.indexOf(
      "if v_job.status <> 'RUNNING'",
      settleReplayStart,
    );
    expect(settleReplayStart).toBeGreaterThanOrEqual(0);
    expect(currentJobGate).toBeGreaterThan(settleReplayStart);
    const settleReplay = settle.slice(settleReplayStart, currentJobGate);
    expect(settleReplay).toContain("_failure_envelope(");
    expect(settleReplay).not.toContain("v_job.status");

    const resolve = functionBlock(
      "resolve_v1_shadow_note_generation_attempt",
    );
    const resolveFailureStart = resolve.lastIndexOf(
      "if p_expected_content_hash is not null",
    );
    expect(resolveFailureStart).toBeGreaterThanOrEqual(0);
    const resolveFailure = resolve.slice(resolveFailureStart);
    expect(resolveFailure).toContain(
      "v_attempt.settlement_base_delay_ms is not null",
    );
    expect(resolveFailure).toContain("v_attempt.failure_reason = 'CANCELLED'");
    expect(resolveFailure).not.toContain("v_job.status");

    const denied = functionBlock("_settle_denied_authority");
    const deniedReplayStart = denied.indexOf(
      "if v_job.status = 'FAILED' and v_attempt.status = 'FAILED' then",
    );
    const deniedCurrentGate = denied.indexOf(
      "if v_job.status <> 'RUNNING' or v_attempt.status <> 'RUNNING' then",
      deniedReplayStart,
    );
    expect(deniedReplayStart).toBeGreaterThanOrEqual(0);
    expect(deniedCurrentGate).toBeGreaterThan(deniedReplayStart);
    const deniedReplay = denied.slice(deniedReplayStart, deniedCurrentGate);
    expect(deniedReplay).toContain(
      "v_payload.revoke_reason is distinct from 'FAILED'",
    );
    expect(deniedReplay).toContain(
      "v_payload.revoked_at is distinct from v_attempt.finished_at",
    );
    expect(deniedReplay).toContain(
      "v_outbox.requested_at is distinct from v_attempt.finished_at",
    );
    expect(deniedReplay).not.toContain("v_payload.state");
    expect(deniedReplay).not.toContain("v_outbox.status");
    expect(deniedReplay).toContain("'payloadState', 'REVOKED'");

    for (const marker of [
      "success payload purge fixture was not applied",
      "historical retry first acknowledgement drifted",
      "historical retry next-attempt transition drifted",
      "historical retry resolution drifted after current state advanced",
      "historical retry settlement replay drifted after current state advanced",
    ]) {
      expect(assertions).toContain(marker);
    }
  });

  it("binds success to one consumed grant and keeps payload consumption fail-closed", () => {
    const commit = functionBlock("commit_v1_shadow_note_generation_success");
    expect(commit).toContain("grant_record.status = 'CONSUMED'");
    expect(commit).toContain("grant_record.registration_digest = p_registration_digest");
    expect(commit).toContain("grant_record.lease_token_hash = v_attempt.lease_token_hash");
    expect(commit).toContain("grant_record.request_hash = v_job.request_hash");
    expect(commit).toContain("insert into public.ai_documents");
    expect(commit).toContain("insert into public.ai_document_revisions");
    expect(commit).toContain("insert into public.ai_document_sync_changes");
    expect(commit).toContain("insert into public.ai_document_mutation_receipts");
    expect(commit).not.toMatch(/\b(?:reserve|commit|release)_shadow_points?\b/i);

    const authorize = functionBlock(
      "authorize_v1_shadow_note_generation_payload_attempt",
    );
    expect(authorize).toContain("'status', 'AUTHORIZED'");
    expect(authorize).toContain("'grantId', v_grant_id");
    expect(authorize).not.toContain("vaultGrant");
    expect(authorize).not.toContain("vault_grant_hash");

    const consume = functionBlock(
      "consume_v1_shadow_note_generation_payload_grant",
    );
    expect(migration).toContain(
      "metadata binding check, but deliberately cannot release a vault capability",
    );
    expect(consume).toContain(`${schemaName}.fresh_session_is_active(`);
    expect(consume).toContain(`${schemaName}.fresh_privacy_proof_expires_at(`);
    expect(consume).toContain("v_grant.request_hash <> v_job.request_hash");
    expect(consume).toContain(
      `${schemaName}._settle_denied_authority(\n    p_job_id,\n    p_attempt_id,\n    p_payload_id,\n    p_registration_digest,\n    'PAYLOAD_UNAVAILABLE',\n    v_now`,
    );
    expect(consume).not.toContain("vaultGrant");
    expect(consume).not.toContain("vault_grant_hash");
    expect(consume).not.toContain("payload_handle_hash");

    const rpcProgram = migration.slice(
      migration.indexOf(`create function ${schemaName}.claim_v1_shadow`),
    );
    expect(rpcProgram).not.toContain("vaultGrant");
    expect(rpcProgram).not.toContain("vault_grant_hash");
  });

  it("does not mutate Points, legacy credits or entitlement state", () => {
    const financialTables =
      "account_entitlements|credit_ledger|point_wallets|point_lots|point_quotes|point_reservations|point_reservation_allocations|point_ledger_entries";
    expect(migration).not.toMatch(
      new RegExp(
        `(?:insert\\s+into|update|delete\\s+from)\\s+public\\.(?:${financialTables})\\b`,
        "i",
      ),
    );
    expect(migration).not.toMatch(
      new RegExp(
        `grant\\s+[^;]+on\\s+public\\.(?:${financialTables})\\b`,
        "i",
      ),
    );
    expect(migration).toContain("reserve/commit Points");
  });

  it("proves all twelve private tables before any assertion-only FORCE-RLS relaxation", () => {
    const beginIndex = assertions.indexOf("\nbegin;");
    const ownerGrantIndex = assertions.indexOf(
      `grant ${ownerRole} to current_user`,
      beginIndex,
    );
    const executorGrantIndex = assertions.indexOf(
      `grant ${executorRole} to current_user`,
      beginIndex,
    );
    const catalogProofStart = assertions.indexOf(
      "-- Prove the real migration posture before relaxing FORCE RLS",
    );
    const catalogProofEnd = assertions.indexOf("\nend\n$$;", catalogProofStart);
    const firstOwnerSet = assertions.indexOf(
      `set local role ${ownerRole};`,
      catalogProofEnd,
    );
    const firstNoForce = assertions.indexOf(
      "no force row level security;",
      catalogProofEnd,
    );

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(ownerGrantIndex).toBeGreaterThan(beginIndex);
    expect(executorGrantIndex).toBeGreaterThan(ownerGrantIndex);
    expect(catalogProofStart).toBeGreaterThan(executorGrantIndex);
    expect(catalogProofEnd).toBeGreaterThan(catalogProofStart);
    expect(firstOwnerSet).toBeGreaterThan(catalogProofEnd);
    expect(firstNoForce).toBeGreaterThan(firstOwnerSet);
    expect(assertions.slice(beginIndex, catalogProofEnd)).not.toContain(
      "no force row level security",
    );

    const catalogProof = assertions.slice(catalogProofStart, catalogProofEnd);
    expect(normalizeSql(catalogProof)).toContain(
      normalizeSql(
        `v_actual is distinct from array[ ${allPrivateTableNames
          .map((table) => `'${table}'`)
          .join(", ")} ]::text[]`,
      ),
    );
    expect(catalogProof).toContain("relation.relkind = 'r'");
    expect(catalogProof).toContain("not relation.relrowsecurity");
    expect(catalogProof).toContain("not relation.relforcerowsecurity");
    expect(catalogProof).toContain(
      `relation.relowner <> '${ownerRole}'::regrole`,
    );
    expect(catalogProof).toContain(
      "worker RPC private RLS or ownership posture is unsafe",
    );
  });

  it("uses one rollback-scoped SET edge per private role and revokes both before ROLLBACK", () => {
    const normalized = normalizeSql(assertions);
    for (const role of [ownerRole, executorRole]) {
      expect(
        assertions.match(new RegExp(`^grant ${role} to current_user$`, "gm")),
      ).toHaveLength(1);
      expect(
        assertions.match(new RegExp(`^revoke ${role} from current_user$`, "gm")),
      ).toHaveLength(1);
      expect(normalized).toContain(
        `grant ${role} to current_user with admin false, inherit false, set true granted by current_user;`,
      );
      expect(normalized).toContain(
        `revoke ${role} from current_user granted by current_user;`,
      );
    }

    const executorRevoke = assertions.lastIndexOf(
      `revoke ${executorRole} from current_user`,
    );
    const ownerRevoke = assertions.lastIndexOf(
      `revoke ${ownerRole} from current_user`,
    );
    const rollback = assertions.lastIndexOf("\nrollback;");
    expect(executorRevoke).toBeGreaterThanOrEqual(0);
    expect(ownerRevoke).toBeGreaterThan(executorRevoke);
    expect(rollback).toBeGreaterThan(ownerRevoke);
    expect(normalized).toMatch(
      new RegExp(
        `revoke ${executorRole} from current_user granted by current_user; ` +
          `revoke ${ownerRole} from current_user granted by current_user; rollback;$`,
      ),
    );
  });

  it("uses millisecond-aligned eligibility fixtures for both valid Auth users", () => {
    const authUsersStart = assertions.indexOf("insert into auth.users (");
    const authUsersEnd = assertions.indexOf(
      "\n\ninsert into auth.sessions (",
      authUsersStart,
    );
    expect(authUsersStart).toBeGreaterThanOrEqual(0);
    expect(authUsersEnd).toBeGreaterThan(authUsersStart);
    const authUsers = assertions.slice(authUsersStart, authUsersEnd);

    expect(
      authUsers.match(
        /'test-only-no-login',\s+date_trunc\('milliseconds', transaction_timestamp\(\)\),/g,
      ),
    ).toHaveLength(2);
    expect(authUsers).not.toMatch(
      /'test-only-no-login',\s+transaction_timestamp\(\),/,
    );
  });

  it("precomputes the owner fixture lease digest before entering the restricted owner role", () => {
    const bootstrapReset = assertions.indexOf("reset role;");
    const digestSetting = assertions.indexOf(
      "'careslink.assert.expired_lease_hash'",
      bootstrapReset,
    );
    const fixtureOwnerSet = assertions.indexOf(
      `set local role ${ownerRole};`,
      bootstrapReset,
    );
    const fixtureOwnerReset = assertions.indexOf(
      "reset role;",
      fixtureOwnerSet,
    );

    expect(bootstrapReset).toBeGreaterThanOrEqual(0);
    expect(digestSetting).toBeGreaterThan(bootstrapReset);
    expect(fixtureOwnerSet).toBeGreaterThan(digestSetting);
    expect(fixtureOwnerReset).toBeGreaterThan(fixtureOwnerSet);

    const bootstrapDigest = assertions.slice(bootstrapReset, fixtureOwnerSet);
    expect(bootstrapDigest).toContain(
      "extensions.digest(convert_to('test-only-expired-lease', 'UTF8'), 'sha256')",
    );
    expect(bootstrapDigest).toContain(
      "select set_config(\n  'careslink.assert.expired_lease_hash'",
    );

    const ownerFixtures = assertions.slice(fixtureOwnerSet, fixtureOwnerReset);
    expect(ownerFixtures).toContain(
      "current_setting('careslink.assert.expired_lease_hash')",
    );
    expect(ownerFixtures).not.toContain("extensions.");
    expect(ownerFixtures).not.toContain("public.v1_shadow_content_sha256");

    expect(normalizeSql(migration)).toContain(
      `grant usage on schema public, extensions to ${executorRole};`,
    );
    expect(normalizeSql(migration)).toContain(
      `grant execute on function extensions.digest(bytea, text) to ${executorRole};`,
    );
    expect(normalizeSql(migration)).toContain(
      `grant execute on function public.v1_shadow_content_sha256(jsonb) to ${executorRole};`,
    );
  });

  it("validates the deferred job-payload cycle before restoring FORCE RLS", () => {
    const jobsInsert = assertions.indexOf(
      `insert into ${schemaName}.jobs (`,
    );
    const payloadsInsert = assertions.indexOf(
      `insert into ${schemaName}.payloads (`,
      jobsInsert,
    );
    const attemptsInsert = assertions.indexOf(
      `insert into ${schemaName}.attempts (`,
      payloadsInsert,
    );
    const constraintValidation = assertions.indexOf(
      "set constraints all immediate;",
      payloadsInsert,
    );
    const firstForceRestore = assertions.indexOf(
      `alter table ${schemaName}.settings force row level security;`,
      constraintValidation,
    );

    expect(jobsInsert).toBeGreaterThanOrEqual(0);
    expect(payloadsInsert).toBeGreaterThan(jobsInsert);
    expect(attemptsInsert).toBeGreaterThan(payloadsInsert);
    expect(constraintValidation).toBeGreaterThan(attemptsInsert);
    expect(firstForceRestore).toBeGreaterThan(constraintValidation);
    expect(
      assertions.match(/^set constraints all immediate;$/gim),
    ).toHaveLength(1);
    expect(
      assertions.slice(constraintValidation, firstForceRestore),
    ).not.toMatch(
      /insert\s+into\s+careslink_v1_generation\.(?:jobs|payloads)\b/i,
    );
    expect(assertions).not.toMatch(/^set constraints .+ deferred;$/gim);
    expect(assertions).not.toMatch(/\bdisable\s+trigger\b/i);
    expect(assertions).toContain(
      "Validate\n-- the real foreign keys and drain their pending trigger events",
    );
  });

  it("re-enters only the executor for final hosted hard-off verification", () => {
    const settingsForce = assertions.lastIndexOf(
      `alter table ${schemaName}.settings force row level security;`,
    );
    const ownerReset = assertions.indexOf("reset role;", settingsForce);
    const executorSet = assertions.indexOf(
      `set local role ${executorRole};`,
      ownerReset,
    );
    const verificationStart = assertions.indexOf("do $$", executorSet);
    const verificationFailure = assertions.indexOf(
      "assertion did not restore hard-off/RLS/fault scaffolding",
      verificationStart,
    );
    const verificationEndStart = assertions.indexOf(
      "\nend\n$$;",
      verificationFailure,
    );
    const verificationEnd = verificationEndStart + "\nend\n$$;".length;
    const executorReset = assertions.indexOf("reset role;", verificationEnd);
    const executorRevoke = assertions.indexOf(
      `revoke ${executorRole} from current_user`,
      executorReset,
    );

    expect(settingsForce).toBeGreaterThanOrEqual(0);
    expect(ownerReset).toBeGreaterThan(settingsForce);
    expect(executorSet).toBeGreaterThan(ownerReset);
    expect(verificationStart).toBeGreaterThan(executorSet);
    expect(verificationFailure).toBeGreaterThan(verificationStart);
    expect(verificationEndStart).toBeGreaterThan(verificationFailure);
    expect(executorReset).toBeGreaterThan(verificationEnd);
    expect(assertions.slice(verificationEnd, executorReset).trim()).toBe("");
    expect(executorRevoke).toBeGreaterThan(executorReset);

    const verification = assertions.slice(verificationStart, verificationEnd);
    expect(verification).toContain(`from ${schemaName}.settings`);
    expect(verification).toContain("not relation.relrowsecurity");
    expect(verification).toContain("not relation.relforcerowsecurity");
  });

  it("ships rollback-only catalog, ACL, arbitration and atomicity assertions", () => {
    expect(assertions).toMatch(/^-- Manual rollback-only assertions/);
    expect(assertions).toContain("\\set ON_ERROR_STOP on");
    expect(assertions).toContain("begin;");
    expect(assertions.trimEnd()).toMatch(/rollback;$/);
    expect(assertions).toContain("Production must never be the SQL target");
    expect(assertions).toContain(
      "does not prove two independent database\n-- sessions race safely",
    );
    expect(assertions).toContain("transaction-only TEST_ONLY fixtures");
    expect(assertions).toContain("pg_get_function_identity_arguments");
    expect(assertions).toContain("aclexplode(");
    expect(
      assertions.match(
        /case\s+when acl\.grantee = 0 then 'PUBLIC'::text\s+else grantee\.rolname::text\s+end/g,
      ),
    ).toHaveLength(2);
    expect(assertions).toContain(
      "is distinct from array['careslink_v1_generation_executor']::text[]",
    );
    expect(assertions).not.toMatch(
      /case\s+when acl\.grantee = 0 then 'PUBLIC'\s+else grantee\.rolname\s+end/,
    );
    expect(assertions).toContain("procedure.proconfig is null");
    expect(assertions).toContain("procedure.proconfig[1] is null");
    expect(assertions).not.toMatch(
      /(?:->>|#>>|#>)\s*'[^']+'\s*<>/,
    );
    for (const marker of [
      "worker RPC private table scope drifted",
      "worker RPC private RLS or ownership posture is unsafe",
      "worker RPC setting is not hard-off",
      "worker RPC migration persisted policy or business fixtures",
      "worker RPC private metadata boundary leaked sensitive data",
      "worker RPC identity set drifted",
      "worker RPC owner, return type or definer posture drifted",
      "worker RPC execute privilege leaked",
      "worker RPC execute grantee set drifted",
      "API role can access worker private schema",
      "worker executor schema privilege drifted",
      "worker RPC public wrapper unexpectedly exists",
      "worker RPC signature drifted",
      "serial claim envelope leaked or drifted",
      "serial claim arbitration or active-attempt invariant failed",
      "heartbeat envelope drifted",
      "metadata-only authorization or replay drifted",
      "authorization absolute-deadline binding drifted",
      "TEST_ONLY consumed grant binding failed",
      "fence or fence replay drifted",
      "atomic success envelope drifted or leaked content",
      "canonical success rows are not atomically bound",
      "atomic success replay duplicated or drifted",
      "changed success replay was not rejected atomically",
      "success response-loss resolution drifted",
      "atomic failure envelope drifted or leaked content",
      "failure response-loss replay drifted",
      "failure response-loss resolution drifted",
      "failure path was not terminal, idempotent and content-free",
      "fresh-session denial was not atomic and replayable",
      "fresh-session denial resolution drifted",
      "consume fixture authorization leaked capability data",
      "consume was not fail-closed, atomic and replayable",
      "consume denial response-loss resolution drifted",
      "commit did not require an exact CONSUMED grant",
      "late commit failure did not roll back atomically",
      "fresh-privacy denial was not atomic and replayable",
      "fresh-privacy denial resolution drifted",
      "expired-lease recovery arbitration drifted",
      "recovered-attempt resolution drifted",
      "recovery replay was not empty and idempotent",
      "cross-job attempt binding was accepted",
      "owner B observed owner A canonical rows",
      "owner A canonical success row set drifted",
      "worker RPC changed Points object",
      "assertion did not restore hard-off/RLS/fault scaffolding",
      "APPROVED_BOUNDED NULL jitter_max_ms was accepted",
      "retry base plus bounded jitter exceeded safe integer",
      "recovery batch limit above 1000000 was accepted",
      "zero-lower-bound retry arrays were accepted",
      "NULL lease-token matrix mutated state or row counts",
      "NULL settlement_base_delay_ms was accepted",
      "NULL settlement_jitter_ms was accepted",
      "NULL settlement_retry_delay_ms was accepted",
      "partial-NULL settlement delay checks mutated state",
      "success payload purge fixture was not applied",
      "historical retry first acknowledgement drifted",
      "historical retry next-attempt transition drifted",
      "historical retry resolution drifted after current state advanced",
      "historical retry settlement replay drifted after current state advanced",
    ]) {
      expect(assertions).toContain(marker);
    }
  });
});

function tableBlock(table: string) {
  const marker = `create table ${schemaName}.${table} (`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n);", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

function columnDefinitions(block: string) {
  return block
    .split("\n")
    .slice(1)
    .map((line) => /^  ([a-z][a-z0-9_]*)\s+([a-z][a-z0-9_]*(?:\[\])?)/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .filter(
      (match) =>
        !["constraint", "primary", "unique", "foreign", "check", "exclude"].includes(
          match[1] ?? "",
        ),
    )
    .map((match) => ({ name: match[1], type: match[2] }));
}

function columnNames(block: string) {
  return columnDefinitions(block).map((column) => column.name);
}

function functionBlock(name: string) {
  const marker = `create function ${schemaName}.${name}(`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

function functionIdentityArguments(name: string) {
  const block = functionBlock(name);
  const signatureEnd = block.indexOf(")\nreturns");
  expect(signatureEnd).toBeGreaterThanOrEqual(0);
  const signature = block.slice(block.indexOf("(") + 1, signatureEnd);
  return signature.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function normalizeSql(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}
