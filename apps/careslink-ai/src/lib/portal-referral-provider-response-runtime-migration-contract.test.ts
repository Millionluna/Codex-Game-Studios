import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260825153340_add_portal_referral_provider_response_runtime.sql";
const assertionPath =
  "supabase/tests/portal_referral_provider_response_runtime_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(join(process.cwd(), assertionPath), "utf8");

const publicRoutines = [
  "public.portal_referral_provider_response_authorize()",
  "public.portal_referral_provider_response_offers(",
  "public.portal_referral_provider_response_respond(",
] as const;

describe("Portal referral Provider Response M1b runtime migration contract", () => {
  it("is one default-off Preview-only transactional slice with no table grant", () => {
    expect(firstSqlToken(migration)).toBe("begin");
    expect(lastSqlToken(migration)).toBe("commit");
    expect(migration).toMatch(
      /insert into public\.portal_workflow_flags \([\s\S]*?capability,[\s\S]*?enabled,[\s\S]*?preview_only[\s\S]*?\) values \('referral_provider_response_v1', false, true\);/,
    );

    const deploymentStatements = withoutFunctionBodiesAndComments(migration);
    expect(
      deploymentStatements.match(/insert into public\.portal_workflow_flags/g),
    ).toHaveLength(1);
    expect(deploymentStatements).not.toMatch(/enabled\s*=\s*true/i);
    expect(deploymentStatements).not.toMatch(/\bgrant\b[^;]*\bon\s+table\b/i);
    expect(deploymentStatements).not.toMatch(/\b(?:create|alter|drop)\s+policy\b/i);
    expect(migration).toMatch(
      /create index portal_matches_provider_response_inbox_idx\s+on public\.portal_referral_matches \(\s*provider_id,\s*\(\(status = 'OFFERED'\)\) desc,\s*id\s*\)\s+include \(referral_id, status\)\s+where status in \('OFFERED', 'ACCEPTED'\);/,
    );
  });

  it("exposes exactly authorize, bounded first-page offers and respond as hardened authenticated-only RPCs", () => {
    expect(
      migration.match(
        /create function public\.portal_referral_provider_response_/g,
      ),
    ).toHaveLength(3);
    expect(
      migration.match(
        /create function\ncareslink_portal_private\.portal_referral_provider_response_/g,
      ),
    ).toHaveLength(3);

    for (const routine of publicRoutines) {
      const block = functionBlock(routine);
      for (const posture of [
        "returns jsonb",
        "language plpgsql",
        "volatile",
        "security definer",
        "set search_path = ''",
        "careslink_portal_private.portal_referral_provider_response_assert_enabled()",
      ]) {
        expect(block).toContain(posture);
      }
    }

    expect(migration).toMatch(
      /revoke all on function[\s\S]*portal_referral_provider_response_authorize\(\)[\s\S]*portal_referral_provider_response_offers\(integer, uuid\)[\s\S]*portal_referral_provider_response_respond\([\s\S]*uuid, bigint, text, text, text, text[\s\S]*\)[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function[\s\S]*portal_referral_provider_response_authorize\(\)[\s\S]*portal_referral_provider_response_offers\(integer, uuid\)[\s\S]*portal_referral_provider_response_respond\([\s\S]*uuid, bigint, text, text, text, text[\s\S]*\)[\s\S]*to authenticated;/,
    );
    expect(migration).not.toMatch(/\bto\s+(?:public|anon|service_role)\s*;/i);
    expect(migration).not.toMatch(/returns jsonb\s+returns jsonb/i);
    expect(migration).not.toMatch(
      /message = 'PORTAL_VALIDATION_ERROR';\s+message = 'PORTAL_VALIDATION_ERROR'/,
    );
  });

  it("keeps a master-before-operation gate and a fresh exact-one approved provider context", () => {
    const gate = functionBlock(
      "careslink_portal_private.portal_referral_provider_response_assert_enabled()",
    );
    const masterGate = gate.indexOf("flag.capability = 'referral_workflow_v1'");
    const operationGate = gate.indexOf(
      "flag.capability = 'referral_provider_response_v1'",
    );
    expect(masterGate).toBeGreaterThanOrEqual(0);
    expect(operationGate).toBeGreaterThan(masterGate);
    expect(countOccurrences(gate, "for share of flag")).toBe(2);
    expect(
      countOccurrences(gate, "message = 'PORTAL_CAPABILITY_DISABLED'"),
    ).toBe(2);

    const session = functionBlock(
      "careslink_portal_private.portal_referral_provider_response_assert_session(",
    );
    for (const predicate of [
      "auth.uid() is distinct from p_user_id",
      "auth.jwt()->>'session_id'",
      "from auth.sessions as active_session",
      "join auth.users as active_user",
      "for share of active_session, active_user",
      "v_session_found := found",
      "v_now := pg_catalog.clock_timestamp()",
      "v_not_after is not null and v_not_after <= v_now",
      "v_deleted_at is not null",
      "v_banned_until is not null and v_banned_until > v_now",
      "v_email_confirmed_at is null",
      "v_aud is distinct from 'authenticated'",
      "v_role is distinct from 'authenticated'",
      "coalesce(v_is_anonymous, false) is true",
    ]) {
      expect(session).toContain(predicate);
    }

    const context = functionBlock(
      "careslink_portal_private.portal_referral_provider_response_context()",
    );
    for (const predicate of [
      "membership.role = 'provider_member'",
      "membership.status = 'ACTIVE'",
      "organization.organization_type = 'PROVIDER'",
      "organization.status = 'ACTIVE'",
      "provider.review_status = 'APPROVED'",
      "if v_context_count <> 1 then",
      "for share of organization, membership, provider",
      "'APPROVED'::text",
    ]) {
      expect(context).toContain(predicate);
    }
    expect(context).not.toContain("capacity_status");
    const organizationLock = context.indexOf(
      "lock table public.portal_organizations in share mode",
    );
    const membershipLock = context.indexOf(
      "lock table public.portal_organization_memberships in share mode",
    );
    const providerLock = context.indexOf(
      "lock table public.portal_providers in share mode",
    );
    expect(organizationLock).toBeGreaterThanOrEqual(0);
    expect(membershipLock).toBeGreaterThan(organizationLock);
    expect(providerLock).toBeGreaterThan(membershipLock);
    expect(
      countOccurrences(
        context,
        "portal_referral_provider_response_assert_session(",
      ),
    ).toBe(3);

    const authorize = functionBlock(
      "public.portal_referral_provider_response_authorize()",
    );
    for (const key of [
      "authorized",
      "user_id",
      "organization_id",
      "organization_type",
      "organization_status",
      "membership_role",
      "membership_status",
      "provider_id",
      "provider_review_status",
    ]) {
      expect(authorize).toContain(`'${key}'`);
    }
    expect(authorize).toContain("'provider_review_status', 'APPROVED'");
  });

  it("keeps the provider first-page inbox bounded, prioritized, tenant-scoped and PII-free", () => {
    const offers = functionBlock(
      "public.portal_referral_provider_response_offers(",
    );
    for (const predicate of [
      "p_limit integer default 50",
      "p_after_match_id uuid default null",
      "p_limit is null or p_limit < 1 or p_limit > 50",
      "p_after_match_id is not null",
      "match.provider_id = v_provider_id",
      "match.status in ('OFFERED', 'ACCEPTED')",
      "order by (match.status = 'OFFERED') desc, match.id",
      ") order by item.match_id",
      "limit p_limit",
      "return jsonb_build_object('items', v_items)",
    ]) {
      expect(offers).toContain(predicate);
    }
    for (const key of [
      "match_id",
      "referral_id",
      "region",
      "service_type",
      "match_status",
      "current_status",
      "row_version",
    ]) {
      expect(offers).toContain(`'${key}'`);
    }
    expect(offers).not.toMatch(
      /referral\.summary|contact_|source_organization|display_name|phone|email/i,
    );
    expect(offers).not.toContain("p_before_updated_at");
    expect(offers).not.toContain("match.id > p_after_match_id");
    expect(
      countOccurrences(offers, "message = 'PORTAL_VALIDATION_ERROR'"),
    ).toBe(2);
    expect(offers).toContain("message = 'PORTAL_INVALID_STATE_TRANSITION'");
    expect(countOccurrences(offers, "'CLOSED'")).toBe(2);
    expect(
      countOccurrences(
        offers,
        "referral.assigned_provider_id is not distinct from v_provider_id",
      ),
    ).toBe(2);
    expect(
      countOccurrences(
        offers,
        "match.status = 'ACCEPTED'\n          and match.offered_at is not null",
      ),
    ).toBe(2);
    expect(offers.lastIndexOf("portal_referral_provider_response_assert_session("))
      .toBeLessThan(offers.indexOf("return jsonb_build_object('items', v_items)"));
  });

  it("binds respond idempotency to actor and canonical payload before any state write", () => {
    const respond = functionBlock(
      "public.portal_referral_provider_response_respond(",
    );
    for (const predicate of [
      "p_match_id uuid",
      "p_expected_version bigint",
      "p_decision text",
      "p_mutation_id_hash text",
      "p_payload_hash text",
      "p_correlation_id_hash text",
      "p_expected_version >= 9223372036854775807",
      "p_decision is null",
      "p_decision not in ('ACCEPT', 'DECLINE')",
      "!~ '^[a-f0-9]{64}$'",
      "pg_advisory_xact_lock",
      "hashtextextended(v_user_id::text || ':' || p_mutation_id_hash, 0)",
      "'organizationId', v_organization_id::text",
      "'role', 'provider_member'",
      "'providerId', v_provider_id::text",
      "'kind', 'RESPOND_TO_OFFER'",
      "'matchId', p_match_id::text",
      "'expectedVersion', p_expected_version",
      "'decision', p_decision",
      "public.v1_shadow_content_sha256(v_canonical_payload)",
      "p_payload_hash is distinct from v_payload_hash",
      "receipt.actor_user_id = v_user_id",
      "receipt.mutation_id_hash = p_mutation_id_hash",
      "message = 'PORTAL_IDEMPOTENCY_CONFLICT'",
      "match.provider_id = v_provider_id",
    ]) {
      expect(respond).toContain(predicate);
    }
    const advisoryLock = respond.indexOf("pg_advisory_xact_lock");
    const context = respond.indexOf("portal_referral_provider_response_context()");
    const hashCheck = respond.indexOf(
      "p_payload_hash is distinct from v_payload_hash",
    );
    const firstWrite = Math.min(
      respond.indexOf("update public.portal_referral_matches"),
      respond.indexOf("update public.portal_referrals"),
    );
    expect(context).toBeGreaterThan(advisoryLock);
    expect(hashCheck).toBeGreaterThan(context);
    expect(firstWrite).toBeGreaterThan(hashCheck);
  });

  it("locks referral then every match, preserves state-before-version, and applies exact ACCEPT/DECLINE writes", () => {
    const respond = functionBlock(
      "public.portal_referral_provider_response_respond(",
    );
    const referralLock = respond.indexOf("for update of referral");
    const matchOrder = respond.indexOf("order by match.id", referralLock);
    const matchLock = respond.indexOf("for update of match", matchOrder);
    const sessionAfterLocks = respond.indexOf(
      "portal_referral_provider_response_assert_session(",
      matchLock,
    );
    const matchState = respond.indexOf("if v_match.status <> 'OFFERED'");
    const referralVersion = respond.indexOf(
      "if v_referral.row_version <> p_expected_version",
    );
    const referralState = respond.indexOf(
      "if v_referral.current_status <> 'OFFERED'",
    );
    const firstWrite = respond.indexOf("update public.portal_referral_matches");

    expect(referralLock).toBeGreaterThanOrEqual(0);
    expect(matchOrder).toBeGreaterThan(referralLock);
    expect(matchLock).toBeGreaterThan(matchOrder);
    expect(sessionAfterLocks).toBeGreaterThan(matchLock);
    expect(matchState).toBeGreaterThan(sessionAfterLocks);
    expect(referralVersion).toBeGreaterThan(matchState);
    expect(referralState).toBeGreaterThan(referralVersion);
    expect(firstWrite).toBeGreaterThan(referralState);

    for (const predicate of [
      "when p_decision = 'ACCEPT' then 'ACCEPTED'",
      "else 'DECLINED'",
      "responded_by = v_user_id",
      "row_version = v_match.row_version + 1",
      "current_status = v_target_status",
      "when p_decision = 'ACCEPT' then v_provider_id",
      "row_version = v_referral.row_version + 1",
      "insert into public.portal_audit_events",
      "jsonb_build_object(\n      'matchId', v_match.id::text,\n      'decision', p_decision",
      "insert into public.portal_mutation_receipts",
      "v_referral.row_version + 1",
    ]) {
      expect(respond).toContain(predicate);
    }
    expect(respond).toContain("message = 'PORTAL_INVALID_STATE_TRANSITION'");
    expect(respond).toContain("message = 'PORTAL_STALE_REFERRAL'");
  });

  it("keeps helpers private and the executable SQL proof rollback-only with teardown assertions", () => {
    expect(migration).toMatch(
      /revoke all on function[\s\S]*portal_referral_provider_response_assert_enabled\(\)[\s\S]*portal_referral_provider_response_assert_session\([\s\S]*uuid, uuid[\s\S]*\)[\s\S]*portal_referral_provider_response_context\(\)[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(firstSqlToken(assertions)).toBe("begin");
    expect(lastSqlToken(assertions)).toBe("rollback");
    expect(assertions).toContain("careslink.assertion_entry_role");
    expect(assertions).not.toContain("session_user");
    expect(assertions).not.toMatch(/^reset role;$/gm);
    expect(assertions).toContain("single-connection");

    for (const marker of [
      "Provider Response flags are not default-off Preview-only",
      "Provider Response inbox index posture drifted",
      "Provider Response gate lock order drifted",
      "Provider Response exact-one provider context drifted",
      "Provider Response bounded no-PII inbox drifted",
      "Provider Response mutation/lock/hash posture drifted",
      "public RPC ACL drifted",
      "private helper ACL drifted",
      "API table grant drifted",
      "Provider Response no-PII inbox drifted",
      "Provider Response inbox accepted a non-NULL cursor",
      "Provider Response active offer priority drifted",
      "Provider Response silently hid corrupt accepted assignment",
      "Capacity is an offer-time eligibility input only",
      "'UNAVAILABLE'",
      "v_first->>'referral_id' is distinct from",
      "v_match.responded_at is null",
      "v_receipt.payload_hash is distinct from",
      "v_audit.correlation_id_hash is distinct from",
      "Response fixture closed metadata only",
      "Provider Response Provider B tenant isolation drifted",
      "Provider B responded to Provider A offer",
      "Provider Response accepted a stale referral version",
      "Ambiguous provider context was authorized",
      "Expired provider session was authorized",
      "Provider Response accepted a forged payload hash",
      "Provider Response ACCEPT replay drifted",
      "Provider Response changed-payload replay succeeded",
      "Provider Response ACCEPT atomic state drifted",
      "Provider Response DECLINE atomic state drifted",
      "Second competing Provider Response succeeded",
      "portal_audit_append_only",
      "portal_receipts_append_only",
      "Provider Response rollback zero-fixture posture drifted",
    ]) {
      expect(assertions).toContain(marker);
    }
  });
});

function functionBlock(name: string) {
  const start = [
    `create function ${name}`,
    `create function\n${name}`,
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
