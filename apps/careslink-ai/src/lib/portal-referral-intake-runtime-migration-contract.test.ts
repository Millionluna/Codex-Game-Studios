import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260824124725_add_portal_referral_intake_runtime.sql";
const assertionPath =
  "supabase/tests/portal_referral_intake_runtime_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(join(process.cwd(), assertionPath), "utf8");

describe("Portal referral intake runtime migration contract", () => {
  it("changes only the authorized default-off activation boundary", () => {
    expect(migration).toContain(
      "drop constraint portal_workflow_flags_enabled_check",
    );
    expect(migration).toContain("alter column enabled set default false");
    expect(migration).not.toMatch(/enabled\s*=\s*true/i);

    const deploymentStatements = withoutFunctionBodiesAndComments(migration);
    expect(deploymentStatements).not.toMatch(/\b(?:insert|update|delete)\b/i);
    expect(deploymentStatements).not.toMatch(/\bgrant\b[^;]*\bon\s+table\b/i);
  });

  it("exposes exactly three authenticated-only public definer RPCs", () => {
    for (const name of [
      "public.portal_referral_intake_authorize()",
      "public.portal_referral_intake_list(",
      "public.portal_referral_intake_create(",
    ]) {
      const block = functionBlock(name);
      expect(block).toContain("security definer");
      expect(block).toContain("set search_path = ''");
      expect(block).toContain("volatile");
    }
    expect(migration.match(/create function public\.portal_referral_intake_/g)).toHaveLength(
      3,
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toMatch(
      /grant execute on function[\s\S]*portal_referral_intake_authorize\(\)[\s\S]*portal_referral_intake_list\(integer, timestamptz, uuid\)[\s\S]*portal_referral_intake_create\([\s\S]*\)\s*to authenticated;/,
    );
    expect(migration).not.toMatch(/\bto\s+(?:public|anon|service_role)\s*;/i);
  });

  it("derives and stabilizes authorization from current database state", () => {
    const context = functionBlock(
      "careslink_portal_private.portal_referral_intake_context()",
    );
    expect(context).toContain("v_user_id uuid := auth.uid()");
    expect(context).toContain("auth.jwt()->>'session_id'");
    expect(context).toContain("from auth.sessions as active_session");
    expect(context).toContain("join auth.users as active_user");
    expect(context).toContain(
      "v_now timestamptz := pg_catalog.clock_timestamp()",
    );
    for (const eligibilityPredicate of [
      "from auth.sessions as active_session",
      "active_user.id = active_session.user_id",
      "active_session.id = v_session_id",
      "active_session.user_id = v_user_id",
      "active_session.not_after > v_now",
      "active_user.deleted_at is null",
      "active_user.banned_until <= v_now",
      "active_user.email_confirmed_at is not null",
      "active_user.aud = 'authenticated'",
      "active_user.role = 'authenticated'",
      "coalesce(active_user.is_anonymous, false) = false",
      "for share of active_session, active_user",
    ]) {
      expect(countOccurrences(context, eligibilityPredicate)).toBe(2);
    }
    expect(context).toContain(
      "lock table public.portal_organizations in share mode",
    );
    expect(context).toContain(
      "lock table public.portal_organization_memberships in share mode",
    );
    expect(context).toContain("membership.role = 'referral_source'");
    expect(context).toContain("membership.status = 'ACTIVE'");
    expect(context).toContain("organization.organization_type = 'REFERRAL_SOURCE'");
    expect(context).toContain("organization.status = 'ACTIVE'");
    expect(context).toContain("cardinality(v_organizations), 0) <> 1");
    expect(context).not.toMatch(/p_(?:user|actor|organization|role)/i);
    expect(context).not.toContain("for key share");

    const exactMembershipLock = context.indexOf(
      "for share of membership, organization",
    );
    const refreshedWallClock = context.indexOf(
      "v_now := pg_catalog.clock_timestamp()",
    );
    const finalSessionValidation = context.lastIndexOf(
      "from auth.sessions as active_session",
    );
    const authorizationReturn = context.indexOf(
      "return query select v_user_id, v_organization_id",
    );
    expect(exactMembershipLock).toBeGreaterThan(-1);
    expect(refreshedWallClock).toBeGreaterThan(exactMembershipLock);
    expect(finalSessionValidation).toBeGreaterThan(refreshedWallClock);
    expect(authorizationReturn).toBeGreaterThan(finalSessionValidation);
  });

  it("recomputes the canonical payload and writes one atomic metadata receipt", () => {
    const create = functionBlock("public.portal_referral_intake_create(");
    for (const requiredHash of [
      "p_mutation_id_hash is null",
      "p_payload_hash is null",
      "p_correlation_id_hash is null",
    ]) {
      expect(create).toContain(requiredHash);
    }
    expect(create).toContain("pg_advisory_xact_lock");
    expect(create).toContain(
      "careslink_portal_private.portal_referral_intake_context()",
    );
    expect(create).toContain("'organizationId', v_organization_id::text");
    expect(create).toContain("'role', 'referral_source'");
    expect(create).toContain("'providerId', null");
    expect(create).toContain(
      "public.v1_shadow_content_sha256(v_canonical_payload)",
    );
    expect(create).toContain("p_payload_hash is distinct from v_payload_hash");
    expect(create).toContain("message = 'PORTAL_IDEMPOTENCY_CONFLICT'");
    for (const target of [
      "public.portal_referrals",
      "careslink_portal_private.portal_referral_contacts",
      "public.portal_audit_events",
      "public.portal_mutation_receipts",
    ]) {
      expect(create).toContain(`insert into ${target}`);
    }
    const acknowledgements = [
      ...create.matchAll(/return jsonb_build_object\(([\s\S]*?)\n\s*\);/g),
    ].map((match) => match[1] ?? "");
    expect(acknowledgements).toHaveLength(2);
    for (const acknowledgement of acknowledgements) {
      for (const key of [
        "referral_id",
        "match_id",
        "current_status",
        "row_version",
        "updated_at",
      ]) {
        expect(acknowledgement).toContain(`'${key}'`);
      }
      expect(acknowledgement).not.toMatch(
        /'summary'|'contact'|'contact_(?:name|phone|email)'/,
      );
    }
  });

  it("keeps list readback bounded, source-scoped and metadata-only", () => {
    expect(migration).toContain(
      "create index portal_referrals_source_updated_id_idx",
    );
    expect(migration).toMatch(
      /source_organization_id,\s*updated_at desc,\s*id desc/,
    );
    const list = functionBlock("public.portal_referral_intake_list(");
    expect(list).toContain(
      "referral.source_organization_id = v_organization_id",
    );
    expect(list).toContain("order by referral.updated_at desc, referral.id desc");
    expect(list).toContain("limit p_limit");
    for (const key of [
      "referral_id",
      "region",
      "service_type",
      "current_status",
      "row_version",
      "updated_at",
    ]) {
      expect(list).toContain(`'${key}'`);
    }
    expect(list).not.toMatch(/contact_(?:name|phone|email)|'summary'/i);
  });

  it("keeps the executable SQL suite transactional and covers the security matrix", () => {
    expect(firstSqlToken(assertions)).toBe("begin");
    expect(lastSqlToken(assertions)).toBe("rollback");
    for (const evidence of [
      "PORTAL_CAPABILITY_DISABLED",
      "PORTAL_AUTH_REQUIRED",
      "PORTAL_SESSION_REVOKED",
      "expired session unexpectedly authorized",
      "PORTAL_FORBIDDEN",
      "PORTAL_VALIDATION_ERROR",
      "PORTAL_IDEMPOTENCY_CONFLICT",
      "has_function_privilege",
      "portal_referral_intake_authorize",
      "portal_referral_intake_list",
      "portal_referral_intake_create",
      "portal_referrals",
      "portal_referral_contacts",
      "portal_audit_events",
      "portal_mutation_receipts",
    ]) {
      expect(assertions).toContain(evidence);
    }
  });
});

function functionBlock(name: string) {
  const start = migration.indexOf(`create function ${name}`);
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
