import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260825110251_add_portal_referral_source_detail_runtime.sql";
const assertionPath =
  "supabase/tests/portal_referral_source_detail_runtime_assertions.sql";
const intakeAssertionPath =
  "supabase/tests/portal_referral_intake_runtime_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(join(process.cwd(), assertionPath), "utf8");
const intakeAssertions = readFileSync(
  join(process.cwd(), intakeAssertionPath),
  "utf8",
);

describe("Portal referral source-detail runtime migration contract", () => {
  it("adds two independent default-off Preview-only operation capabilities", () => {
    expect(migration).toMatch(
      /insert into public\.portal_workflow_flags \([\s\S]*?capability,[\s\S]*?enabled,[\s\S]*?preview_only[\s\S]*?\) values\s*\(\s*'referral_intake_v1',\s*false,\s*true\s*\),\s*\(\s*'referral_source_detail_v1',\s*false,\s*true\s*\);/,
    );

    const deploymentStatements = withoutFunctionBodiesAndComments(migration);
    expect(
      deploymentStatements.match(
        /insert into public\.portal_workflow_flags/g,
      ),
    ).toHaveLength(1);
    expect(deploymentStatements).not.toMatch(/\b(?:update|delete)\b/i);
    expect(deploymentStatements).not.toMatch(/enabled\s*=\s*true/i);
    expect(deploymentStatements).not.toMatch(/\bgrant\b[^;]*\bon\s+table\b/i);
  });

  it("re-gates Intake and creates two authenticated-only Detail RPCs", () => {
    const intakeGate = functionBlock(
      "careslink_portal_private.portal_referral_intake_assert_enabled()",
    );
    const authorize = functionBlock(
      "public.portal_referral_source_detail_authorize()",
    );
    const detail = functionBlock("public.portal_referral_source_detail(");
    expect(intakeGate).toContain("returns void");
    expect(intakeGate).toContain("security definer");
    expect(intakeGate).toContain("set search_path = ''");
    expect(authorize).toContain("returns jsonb");
    expect(authorize).toContain("language plpgsql");
    expect(authorize).toContain("volatile");
    expect(authorize).toContain("security definer");
    expect(authorize).toContain("set search_path = ''");
    expect(detail).toContain("p_referral_id uuid");
    expect(detail).toContain("returns jsonb");
    expect(detail).toContain("language plpgsql");
    expect(detail).toContain("volatile");
    expect(detail).toContain("security definer");
    expect(detail).toContain("set search_path = ''");
    expect(migration.match(/create function public\.portal_referral_/g)).toHaveLength(
      2,
    );
    expect(migration).not.toMatch(/^set role|^reset role|alter function[\s\S]*owner/mi);
    expect(migration).toContain(
      "revoke all on function\n  careslink_portal_private.portal_referral_intake_assert_enabled()",
    );
    expect(migration).toContain(
      "public.portal_referral_source_detail_authorize(),\n  public.portal_referral_source_detail(uuid)",
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toMatch(
      /grant execute on function[\s\S]*public\.portal_referral_source_detail_authorize\(\),[\s\S]*public\.portal_referral_source_detail\(uuid\)\s+to authenticated;/,
    );
    expect(migration).not.toMatch(/\bto\s+(?:public|anon|service_role)\s*;/i);
  });

  it("keeps master-before-operation locks isolated for Intake and Detail", () => {
    const intakeGate = functionBlock(
      "careslink_portal_private.portal_referral_intake_assert_enabled()",
    );
    const intakeMaster = intakeGate.indexOf(
      "flag.capability = 'referral_workflow_v1'",
    );
    const intakeOperation = intakeGate.indexOf(
      "flag.capability = 'referral_intake_v1'",
    );
    expect(intakeMaster).toBeGreaterThanOrEqual(0);
    expect(intakeOperation).toBeGreaterThan(intakeMaster);
    expect(countOccurrences(intakeGate, "for share of flag")).toBe(2);
    expect(
      countOccurrences(intakeGate, "message = 'PORTAL_CAPABILITY_DISABLED'"),
    ).toBe(2);

    const authorize = functionBlock(
      "public.portal_referral_source_detail_authorize()",
    );
    const authorizeMaster = authorize.indexOf(
      "flag.capability = 'referral_workflow_v1'",
    );
    const authorizeOperation = authorize.indexOf(
      "flag.capability = 'referral_source_detail_v1'",
    );
    const authorizeContext = authorize.indexOf(
      "careslink_portal_private.portal_referral_intake_context()",
    );
    expect(authorizeMaster).toBeGreaterThanOrEqual(0);
    expect(authorizeOperation).toBeGreaterThan(authorizeMaster);
    expect(authorizeContext).toBeGreaterThan(authorizeOperation);
    expect(countOccurrences(authorize, "for share of flag")).toBe(2);
    expect(
      countOccurrences(authorize, "message = 'PORTAL_CAPABILITY_DISABLED'"),
    ).toBe(2);

    const detail = functionBlock("public.portal_referral_source_detail(");
    const masterGate = detail.indexOf(
      "flag.capability = 'referral_workflow_v1'",
    );
    const operationGate = detail.indexOf(
      "flag.capability = 'referral_source_detail_v1'",
    );
    const context = detail.indexOf(
      "careslink_portal_private.portal_referral_intake_context()",
    );
    const protectedRead = detail.indexOf("from public.portal_referrals as referral");

    expect(masterGate).toBeGreaterThanOrEqual(0);
    expect(operationGate).toBeGreaterThan(masterGate);
    expect(context).toBeGreaterThan(operationGate);
    expect(protectedRead).toBeGreaterThan(context);
    expect(countOccurrences(detail, "for share of flag")).toBe(2);
    expect(countOccurrences(detail, "message = 'PORTAL_CAPABILITY_DISABLED'")).toBe(
      2,
    );
    expect(detail).toContain("context.user_id, context.organization_id");
    expect(detail).toContain(
      "referral.source_organization_id = v_organization_id",
    );
    expect(detail).not.toMatch(/p_(?:user|actor|organization|role|session)/i);
    expect(detail).not.toContain("for key share");
    expect(intakeGate).not.toContain("for key share");
    expect(authorize).not.toContain("for key share");
  });

  it("returns exact authorization and detail DTOs while hiding tenant existence", () => {
    const authorize = functionBlock(
      "public.portal_referral_source_detail_authorize()",
    );
    for (const key of [
      "authorized",
      "user_id",
      "organization_id",
      "organization_type",
      "organization_status",
      "membership_role",
      "membership_status",
    ]) {
      expect(authorize).toContain(`'${key}'`);
    }
    expect(authorize).toContain("'REFERRAL_SOURCE'");
    expect(authorize).toContain("'referral_source'");

    const detail = functionBlock("public.portal_referral_source_detail(");
    for (const key of [
      "referral_id",
      "summary",
      "region",
      "service_type",
      "current_status",
      "row_version",
      "contact",
      "created_at",
      "updated_at",
      "name",
      "phone",
      "email",
    ]) {
      expect(detail).toContain(`'${key}'`);
    }
    for (const forbiddenKey of [
      "source_organization_id",
      "source_user_id",
      "assigned_provider_id",
      "canonical_document_id",
      "export_job_id",
    ]) {
      expect(detail).not.toContain(`'${forbiddenKey}'`);
    }
    expect(detail).toContain(
      "join careslink_portal_private.portal_referral_contacts as contact",
    );
    expect(detail).toContain("where referral.id = p_referral_id");
    expect(detail).toContain("message = 'PORTAL_NOT_FOUND'");
    expect(detail).not.toMatch(/\b(?:insert|update|delete)\b/i);
  });

  it("keeps the rollback suite transactional, owner-pinned and self-cleaning", () => {
    expect(firstSqlToken(assertions)).toBe("begin");
    expect(lastSqlToken(assertions)).toBe("rollback");
    for (const marker of [
      "'careslink.assertion_entry_role'",
      "routine.proowner = v_entry_actor",
      "careslink_portal_private.portal_referral_intake_assert_enabled()",
      "public.portal_referral_source_detail_authorize()",
      "public.portal_referral_source_detail(uuid)",
      "PORTAL_CAPABILITY_DISABLED",
      "PORTAL_SESSION_REVOKED",
      "PORTAL_FORBIDDEN",
      "PORTAL_NOT_FOUND",
      "Source A read Source B detail",
      "Source B read Source A detail",
      "expired session read source detail",
      "revoked session read source detail",
      "revoked membership read source detail",
      "master+detail opened legacy Intake authorize",
      "master+detail opened legacy Intake list",
      "master+detail opened legacy Intake create",
      "intake-only source-detail authorize unexpectedly succeeded",
      "intake-only source detail unexpectedly succeeded",
      "authenticated direct referral SELECT unexpectedly succeeded",
      "authenticated direct referral INSERT unexpectedly succeeded",
      "Portal source-detail zero-fixture posture drifted",
    ]) {
      expect(assertions).toContain(marker);
    }
    expect(assertions).not.toContain("session_user");
    expect(assertions).not.toMatch(/^reset role;$/gm);
    expect(countOccurrences(assertions, "set local role authenticated;")).toBe(8);
    expect(
      countOccurrences(
        assertions,
        "pg_catalog.current_setting('careslink.assertion_entry_role')",
      ),
    ).toBeGreaterThanOrEqual(8);
    expect(assertions).toContain(
      "update public.portal_workflow_flags\nset enabled = true",
    );
    expect(assertions).toContain(
      "update public.portal_workflow_flags\nset enabled = false",
    );
    expect(assertions).toContain(
      "delete from careslink_portal_private.portal_referral_contacts",
    );
    expect(assertions).toContain("delete from public.portal_referrals");
    expect(assertions).toContain("delete from auth.users");
  });

  it("updates the legacy Intake suite to use a nested master-plus-Intake window", () => {
    const masterEnable = intakeAssertions.indexOf(
      flagUpdate("referral_workflow_v1", true),
    );
    const intakeEnable = intakeAssertions.indexOf(
      flagUpdate("referral_intake_v1", true),
    );
    const intakeDisable = intakeAssertions.indexOf(
      flagUpdate("referral_intake_v1", false),
    );
    const masterDisable = intakeAssertions.indexOf(
      flagUpdate("referral_workflow_v1", false),
    );

    expect(masterEnable).toBeGreaterThanOrEqual(0);
    expect(intakeEnable).toBeGreaterThan(masterEnable);
    expect(intakeDisable).toBeGreaterThan(intakeEnable);
    expect(masterDisable).toBeGreaterThan(intakeDisable);
    expect(intakeAssertions).toContain(
      "where capability = 'referral_intake_v1') is distinct from false",
    );
    expect(intakeAssertions).toContain(
      "where capability = 'referral_intake_v1') is distinct from true",
    );
  });
});

function functionBlock(name: string) {
  const start = [
    `create function ${name}`,
    `create or replace function ${name}`,
    `create or replace function\n${name}`,
  ]
    .map((marker) => migration.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  if (start < 0) throw new Error(`Missing function ${name}`);
  const end = migration.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated function ${name}`);
  return migration.slice(start, end + 4);
}

function withoutFunctionBodiesAndComments(sql: string) {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, "$$")
    .replace(/--[^\n]*/g, "");
}

function firstSqlToken(sql: string) {
  return withoutFunctionBodiesAndComments(sql)
    .trim()
    .match(/^[a-z]+/i)?.[0]
    ?.toLowerCase();
}

function lastSqlToken(sql: string) {
  return withoutFunctionBodiesAndComments(sql)
    .trim()
    .match(/([a-z]+)\s*;\s*$/i)?.[1]
    ?.toLowerCase();
}

function countOccurrences(value: string, needle: string) {
  return value.split(needle).length - 1;
}

function flagUpdate(capability: string, enabled: boolean) {
  return `update public.portal_workflow_flags
set enabled = ${enabled}, updated_at = now()
where capability = '${capability}';`;
}
