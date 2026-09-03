import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260903041819_bind_v1_communication_note_encrypted_payload_admission.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");

const functionName =
  "careslink_v1_generation.admit_and_reserve_v1_bound_communication_note_generation_job";
const legacyFunctionName =
  "careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job";

describe("Communication Note encrypted payload Points admission migration", () => {
  it("is transactional, source-only and does not expose a Data API wrapper", () => {
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/);
    expect(migration).toContain("Source-only, default-off binding");
    expect(migration).not.toMatch(/\benabled\s*=\s*true\b/i);
    expect(migration).not.toMatch(/create\s+(?:or replace\s+)?function\s+public\./i);
    expect(migration).not.toMatch(/\b(?:fetch|https?|provider_api_call)\b/i);
    expect(migration).not.toContain("pg_catalog.coalesce(");
    expect(migration).not.toMatch(
      /grant execute on function[\s\S]{0,900}\bto\s+(?:anon|authenticated|service_role|authenticator)\b/i,
    );
  });

  it("adds an independently hashed KMS receipt with a five-field catalog FK", () => {
    expect(migration).toContain(
      "set role careslink_v1_generation_executor;",
    );
    expect(migration).toContain(
      "V1_POLICY_BOUND_ADMISSION_EXISTING_PAID_ROWS_UNSAFE",
    );
    expect(migration).toMatch(
      /job\.note_type = 'communication'\s+and job\.communication_note_point_admission_id is not null/,
    );
    expect(migration).toContain(
      "revoke careslink_v1_generation_executor\n  from current_user granted by current_user;",
    );
    expect(migration.match(/add column kms_key_version_resource_hash/g)).toHaveLength(
      2,
    );
    expect(migration).toContain("payload_policies_kms_resource_hash_check");
    expect(migration).toContain("payloads_kms_resource_hash_check");
    const foreignKey = section(
      "add constraint payloads_encrypted_policy_binding_fk",
      "-- Policy identity is immutable after admission.",
    );
    for (const field of [
      "policy_version",
      "policy_snapshot_hash",
      "encryption_profile_version",
      "kms_key_version_resource_hash",
      "backup_disposition_version",
    ]) {
      expect(foreignKey).toContain(field);
    }
    expect(foreignKey).toContain("deferrable initially deferred");
    expect(foreignKey).toMatch(
      /backup_disposition_version\s+\) on update restrict on delete restrict\s+deferrable initially deferred\s+;/,
    );
  });

  it("allows only the marked one-time KMS fill and makes policy identity immutable", () => {
    const guard = functionSection(
      "careslink_v1_generation._guard_v1_payload_policy_binding_mutation()",
      "$careslink_v1_guard_payload_policy_binding_mutation$",
    );
    expect(guard).toContain(
      "current_user = 'careslink_v1_generation_owner_api_executor'",
    );
    expect(guard).toContain("old.kms_key_version_resource_hash is null");
    expect(guard).toContain("careslink.v1_policy_admission_kms_payload_id");
    expect(guard).toContain(
      "careslink.v1_policy_admission_kms_resource_hash",
    );
    expect(guard.match(/is not distinct from/g)).toHaveLength(3);
    expect(migration).toContain("create trigger jobs_payload_policy_binding_immutable");
    expect(migration).toContain("create trigger payloads_policy_binding_immutable");
  });

  it("uses one exact 19-argument private coordinator over the legacy 14-argument transaction", () => {
    const coordinator = functionSection(
      `${functionName}(`,
      "$careslink_v1_policy_bound_communication_admission$",
    );
    expect(coordinator.match(/p_[a-z_]+ pg_catalog\./g)).toHaveLength(19);
    expect(coordinator).toContain(`${legacyFunctionName}(`);
    expect(coordinator).toContain("set constraints");
    expect(coordinator).toContain("deferred;");
    expect(coordinator).toContain("immediate;");
    expect(coordinator).toContain(
      "careslink_v1_generation._payload_snapshot_is_valid(",
    );
    expect(coordinator).toContain("for share of policy");
    const beforeLegacyAdmission = coordinator.slice(
      0,
      coordinator.indexOf("v_admission :="),
    );
    expect(beforeLegacyAdmission).not.toContain("admission_policy_bindings");
    expect(beforeLegacyAdmission).toContain(
      "policy.kms_key_version_resource_hash =",
    );
    expect(coordinator).toContain("for update of payload");
    expect(coordinator).toContain("get diagnostics v_updated_count = row_count");
    for (const field of [
      "p_payload_policy_version",
      "p_payload_policy_snapshot_hash",
      "p_encryption_profile_version",
      "p_kms_key_version_resource_hash",
      "p_backup_disposition_version",
    ]) {
      expect(coordinator).toContain(field);
    }
    expect(coordinator).toContain(
      "pg_catalog.jsonb_typeof(v_admission->'payloadAccepted') is distinct from",
    );
  });

  it("makes missing or mismatched KMS evidence a deferred paid-path failure", () => {
    const invariant = functionSection(
      "careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding()",
      "$careslink_v1_enforce_paid_payload_policy_binding$",
    );
    expect(invariant).toContain("communication_note_point_admission_id is null");
    expect(invariant).toContain("v_payload.kms_key_version_resource_hash is null");
    expect(invariant).toContain(
      "v_payload.catalog_kms_key_version_resource_hash",
    );
    expect(migration.match(/create constraint trigger/g)).toHaveLength(2);
    expect(
      migration.match(/deferrable initially deferred/g) ?? [],
    ).toHaveLength(3);
    expect(migration).toContain(
      "grant execute on function\n  careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding()\n  to careslink_v1_generation_owner;",
    );
    expect(migration).toContain(
      "revoke execute on function\n  careslink_v1_generation._enforce_v1_paid_communication_payload_policy_binding()\n  from careslink_v1_generation_owner;",
    );
  });

  it("gives the NOLOGIN caller only schema USAGE and exact coordinator EXECUTE", () => {
    expect(migration).toMatch(
      /create role careslink_v1_generation_points_admission_caller\s+with nologin nosuperuser nocreatedb nocreaterole noinherit\s+noreplication nobypassrls;/,
    );
    expect(migration).toContain(
      "grant usage on schema careslink_v1_generation\n  to careslink_v1_generation_points_admission_caller;",
    );
    expect(migration).toContain(
      ") to careslink_v1_generation_points_admission_caller;",
    );
    expect(migration).toContain(
      `${legacyFunctionName}(`,
    );
    expect(migration).toContain(
      "from careslink_v1_generation_points_admission_caller;",
    );
    expect(migration).toContain("acl.grantee = 0");
    expect(migration).toContain("procedure.oid <> v_allowed_function");
    expect(migration).toContain("membership.roleid = v_caller");
    expect(migration).toMatch(
      /select pg_catalog\.count\(\*\)[\s\S]{0,240}?membership\.member = v_caller[\s\S]{0,100}?membership\.roleid = v_caller[\s\S]{0,40}?\) <> 1/,
    );
    expect(migration).toContain(
      "membership.member = v_entry",
    );
    expect(migration).toContain(
      "grantor_role.rolsuper",
    );
    expect(migration).toContain(
      "and membership.admin_option\n        and not membership.inherit_option\n        and not membership.set_option",
    );
    expect(migration).not.toContain(
      "revoke careslink_v1_generation_points_admission_caller\n  from current_user granted by current_user;",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete|truncate|references|trigger)\b[^;]+\bto careslink_v1_generation_points_admission_caller;/i,
    );
    expect(migration).not.toMatch(
      /grant\s+careslink_v1_[a-z0-9_]+\s+to careslink_v1_generation_points_admission_caller/i,
    );
  });

  it("explicitly denies API, Preview and unrelated generation identities", () => {
    const acl = section(
      `revoke all on function\n  ${functionName}(`,
      `grant execute on function\n  ${functionName}(`,
    );
    for (const role of [
      "public",
      "anon",
      "authenticated",
      "service_role",
      "authenticator",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_executor",
      "careslink_v1_generation_points_admission_executor",
      "careslink_v1_generation_points_settlement_executor",
      "careslink_v1_generation_registration_control_executor",
      "careslink_v1_preview_authorization_registration_caller",
      "careslink_v1_preview_authorization_revocation_caller",
      "careslink_v1_preview_dispatch_caller",
      "careslink_v1_preview_receipt_caller",
      "careslink_v1_preview_runner_terminal_caller",
    ]) {
      expect(acl).toContain(role);
    }
  });
});

function section(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

function functionSection(signature: string, delimiter: string) {
  const start = migration.indexOf(`create function\n  ${signature}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const firstDelimiter = migration.indexOf(delimiter, start);
  const secondDelimiter = migration.indexOf(delimiter, firstDelimiter + delimiter.length);
  expect(firstDelimiter).toBeGreaterThan(start);
  expect(secondDelimiter).toBeGreaterThan(firstDelimiter);
  return migration.slice(start, secondDelimiter + delimiter.length);
}
