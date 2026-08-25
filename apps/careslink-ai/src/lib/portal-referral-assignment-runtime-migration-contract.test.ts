import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260825120908_add_portal_referral_assignment_runtime.sql";
const assertionPath =
  "supabase/tests/portal_referral_assignment_runtime_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(join(process.cwd(), assertionPath), "utf8");

const publicRoutines = [
  "public.portal_referral_assignment_authorize()",
  "public.portal_referral_assignment_queue(",
  "public.portal_referral_assignment_detail(",
  "public.portal_referral_assignment_triage(",
  "public.portal_referral_assignment_candidates(",
  "public.portal_referral_assignment_offer(",
] as const;

describe("Portal referral Assignment M1a runtime migration contract", () => {
  it("adds one independently default-off Preview-only capability without activation or table grants", () => {
    expect(migration).toMatch(
      /insert into public\.portal_workflow_flags \([\s\S]*?capability,[\s\S]*?enabled,[\s\S]*?preview_only[\s\S]*?\) values \('referral_assignment_v1', false, true\);/,
    );

    const deploymentStatements = withoutFunctionBodiesAndComments(migration);
    expect(
      deploymentStatements.match(/insert into public\.portal_workflow_flags/g),
    ).toHaveLength(1);
    expect(deploymentStatements).not.toMatch(/enabled\s*=\s*true/i);
    expect(deploymentStatements).not.toMatch(
      /\bgrant\b[^;]*\bon\s+table\b/i,
    );
    expect(migration).toContain(
      "create index portal_referrals_assignment_queue_idx",
    );
    expect(migration).toContain(
      "create index portal_providers_assignment_eligible_idx",
    );
  });

  it("exposes exactly six authenticated-only hardened RPCs", () => {
    for (const routine of publicRoutines) {
      const block = functionBlock(routine);
      expect(block).toContain("returns jsonb");
      expect(block).toContain("language plpgsql");
      expect(block).toContain("volatile");
      expect(block).toContain("security definer");
      expect(block).toContain("set search_path = ''");
      expect(block).toContain(
        "careslink_portal_private.portal_referral_assignment_assert_enabled()",
      );
    }

    expect(
      migration.match(/create function public\.portal_referral_assignment_/g),
    ).toHaveLength(6);
    expect(migration).not.toMatch(
      /^set role|^reset role|alter function[\s\S]*owner/mi,
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toMatch(
      /grant execute on function[\s\S]*portal_referral_assignment_authorize\(\)[\s\S]*portal_referral_assignment_queue\(integer, timestamptz, uuid\)[\s\S]*portal_referral_assignment_detail\(uuid\)[\s\S]*portal_referral_assignment_triage\(uuid, bigint, text, text, text\)[\s\S]*portal_referral_assignment_candidates\(uuid, integer\)[\s\S]*portal_referral_assignment_offer\([\s\S]*uuid, uuid, bigint, text, text, text[\s\S]*\)\s*to authenticated;/,
    );
    expect(migration).not.toMatch(/\bto\s+(?:public|anon|service_role)\s*;/i);
  });

  it("keeps every RPC behind the same master-before-Assignment row-lock gate", () => {
    const gate = functionBlock(
      "careslink_portal_private.portal_referral_assignment_assert_enabled()",
    );
    const master = gate.indexOf("flag.capability = 'referral_workflow_v1'");
    const assignment = gate.indexOf(
      "flag.capability = 'referral_assignment_v1'",
    );
    expect(master).toBeGreaterThanOrEqual(0);
    expect(assignment).toBeGreaterThan(master);
    expect(countOccurrences(gate, "for share of flag")).toBe(2);
    expect(
      countOccurrences(gate, "message = 'PORTAL_CAPABILITY_DISABLED'"),
    ).toBe(2);

    for (const routine of publicRoutines) {
      const block = functionBlock(routine);
      const operationGate = block.indexOf(
        "portal_referral_assignment_assert_enabled()",
      );
      const context = block.indexOf(
        "portal_referral_assignment_context()",
      );
      expect(operationGate).toBeGreaterThanOrEqual(0);
      expect(context).toBeGreaterThan(operationGate);
    }
  });

  it("derives a fresh exact-one platform-admin or source-operator context", () => {
    const session = functionBlock(
      "careslink_portal_private.portal_referral_assignment_assert_session(",
    );
    for (const predicate of [
      "auth.uid() is distinct from p_user_id",
      "auth.jwt()->>'session_id'",
      "from auth.sessions as active_session",
      "join auth.users as active_user",
      "v_session_found := found",
      "v_now := pg_catalog.clock_timestamp()",
      "v_not_after is not null and v_not_after <= v_now",
      "v_deleted_at is not null",
      "v_banned_until is not null and v_banned_until > v_now",
      "v_email_confirmed_at is null",
      "v_aud is distinct from 'authenticated'",
      "v_role is distinct from 'authenticated'",
      "coalesce(v_is_anonymous, false) is true",
      "for share of active_session, active_user",
    ]) {
      expect(session).toContain(predicate);
    }
    expect(session).not.toContain(
      "v_now timestamptz := pg_catalog.clock_timestamp()",
    );
    const authRowLock = session.indexOf(
      "for share of active_session, active_user",
    );
    const authRowsCaptured = session.indexOf(
      "v_session_found := found",
      authRowLock,
    );
    const freshAuthClock = session.indexOf(
      "v_now := pg_catalog.clock_timestamp()",
      authRowsCaptured,
    );
    const authTimeDecision = session.indexOf(
      "v_not_after is not null and v_not_after <= v_now",
      freshAuthClock,
    );
    expect(authRowsCaptured).toBeGreaterThan(authRowLock);
    expect(freshAuthClock).toBeGreaterThan(authRowsCaptured);
    expect(authTimeDecision).toBeGreaterThan(freshAuthClock);

    const context = functionBlock(
      "careslink_portal_private.portal_referral_assignment_context()",
    );
    expect(context).toContain(
      "lock table public.portal_organizations in share mode",
    );
    expect(context).toContain(
      "lock table public.portal_organization_memberships in share mode",
    );
    expect(context).toContain("membership.role = 'platform_admin'");
    expect(context).toContain("organization.organization_type = 'PLATFORM'");
    expect(context).toContain("membership.role = 'partner_operator'");
    expect(context).toContain(
      "organization.organization_type = 'REFERRAL_SOURCE'",
    );
    expect(context).toContain("if v_membership_count <> 1 then");
    expect(context).toContain("for share of organization, membership");
    expect(
      countOccurrences(
        context,
        "portal_referral_assignment_assert_session(",
      ),
    ).toBe(3);
    const membershipTableLock = context.indexOf(
      "lock table public.portal_organization_memberships in share mode",
    );
    const postTableLockSession = context.indexOf(
      "portal_referral_assignment_assert_session(",
      membershipTableLock,
    );
    const membershipDerivation = context.indexOf("select\n    count(*)");
    expect(postTableLockSession).toBeGreaterThan(membershipTableLock);
    expect(membershipDerivation).toBeGreaterThan(postTableLockSession);
    expect(context).not.toMatch(/p_(?:user|actor|organization|role)/i);
  });

  it("shares one exact provider-eligibility query between candidates and offer", () => {
    const eligible = functionBlock(
      "careslink_portal_private.portal_referral_assignment_eligible_providers(",
    );
    for (const predicate of [
      "p_limit integer",
      "p_limit is null or p_limit < 1 or p_limit > 50",
      "provider.review_status = 'APPROVED'",
      "provider.capacity_status in ('AVAILABLE', 'LIMITED')",
      "p_region = any(provider.regions)",
      "p_service_type = any(provider.service_types)",
      "organization.organization_type = 'PROVIDER'",
      "organization.status = 'ACTIVE'",
      "membership.role = 'provider_member'",
      "membership.status = 'ACTIVE'",
      "btrim(organization.display_name)",
      "limit p_limit",
      "for share of provider, organization",
    ]) {
      expect(eligible).toContain(predicate);
    }

    const candidates = functionBlock(
      "public.portal_referral_assignment_candidates(",
    );
    const offer = functionBlock("public.portal_referral_assignment_offer(");
    expect(candidates).toContain(
      "portal_referral_assignment_eligible_providers(",
    );
    expect(offer).toContain(
      "portal_referral_assignment_eligible_providers(",
    );
    expect(candidates).toContain(
      "v_referral.service_type,\n      null,\n      p_limit",
    );
    expect(candidates).not.toContain("limit p_limit");
    expect(offer).toContain(
      "v_referral.service_type,\n    p_provider_id,\n    1",
    );
    expect(eligible.indexOf("limit p_limit")).toBeLessThan(
      eligible.indexOf("for share of provider, organization"),
    );
    expect(candidates).toContain("p_limit > 50");
    expect(candidates).not.toMatch(/\b(?:insert|update|delete)\b/i);
    const candidateReferralLock = candidates.indexOf("for share of referral");
    const candidateReferralFound = candidates.indexOf(
      "v_referral_found := found",
      candidateReferralLock,
    );
    const candidatePostReferralSession = candidates.indexOf(
      "portal_referral_assignment_assert_session(",
      candidateReferralFound,
    );
    const candidateNotFound = candidates.indexOf(
      "if not v_referral_found then",
    );
    const candidateProviderLookup = candidates.indexOf(
      "portal_referral_assignment_eligible_providers(",
    );
    const candidatePostProviderSession = candidates.lastIndexOf(
      "portal_referral_assignment_assert_session(",
    );
    const candidateReturn = candidates.indexOf(
      "return jsonb_build_object('items', v_items)",
    );
    expect(candidateReferralFound).toBeGreaterThan(candidateReferralLock);
    expect(candidatePostReferralSession).toBeGreaterThan(candidateReferralFound);
    expect(candidateNotFound).toBeGreaterThan(candidatePostReferralSession);
    expect(candidatePostProviderSession).toBeGreaterThan(candidateProviderLookup);
    expect(candidateReturn).toBeGreaterThan(candidatePostProviderSession);
  });

  it("keeps queue and detail DTOs bounded, tenant-scoped and state-exact", () => {
    const queue = functionBlock("public.portal_referral_assignment_queue(");
    expect(queue).toContain("p_limit > 100");
    expect(queue).toContain("btrim(source_organization.display_name)");
    expect(queue).toContain(
      "((p_before_updated_at is null) <> (p_before_id is null))",
    );
    expect(queue).toContain(
      "referral.current_status in ('SUBMITTED', 'TRIAGED', 'OFFERED')",
    );
    expect(queue).toContain(
      "(referral.updated_at, referral.id)\n          < (p_before_updated_at, p_before_id)",
    );
    for (const key of [
      "referral_id",
      "source_organization_id",
      "source_organization_name",
      "region",
      "service_type",
      "current_status",
      "row_version",
      "updated_at",
    ]) {
      expect(queue).toContain(`'${key}'`);
    }

    const detail = functionBlock("public.portal_referral_assignment_detail(");
    for (const key of [
      "referral_id",
      "source_organization_id",
      "source_organization_name",
      "summary",
      "region",
      "service_type",
      "current_status",
      "row_version",
      "contact",
      "active_offer",
      "created_at",
      "updated_at",
      "name",
      "phone",
      "email",
      "match_id",
      "provider_id",
      "provider_display_name",
      "match_status",
      "offered_at",
    ]) {
      expect(detail).toContain(`'${key}'`);
    }
    expect(detail).toContain("match.status = 'OFFERED'");
    expect(detail).toContain("btrim(source_organization.display_name)");
    expect(detail).toContain("btrim(provider_organization.display_name)");
    expect(detail).toContain("v_current_status = 'OFFERED'");
    expect(detail).toContain(
      "v_current_status in ('SUBMITTED', 'TRIAGED')",
    );
    expect(detail).toContain("message = 'PORTAL_NOT_FOUND'");
    expect(detail).not.toMatch(/\b(?:insert|update|delete)\b/i);
  });

  it("serializes triage and offer, recomputes memory-contract hashes and persists exact receipts", () => {
    for (const [routine, mutationKind] of [
      ["public.portal_referral_assignment_triage(", "TRIAGE_REFERRAL"],
      ["public.portal_referral_assignment_offer(", "OFFER_REFERRAL"],
    ] as const) {
      const block = functionBlock(routine);
      expect(block).toContain("pg_advisory_xact_lock");
      expect(block).toContain(
        "hashtextextended(v_user_id::text || ':' || p_mutation_id_hash, 0)",
      );
      expect(block).toContain("'organizationId', v_organization_id::text");
      expect(block).toContain("'role', v_actor_role");
      expect(block).toContain("'providerId', null");
      expect(block).toContain(`'kind', '${mutationKind}'`);
      expect(block).toContain(
        "public.v1_shadow_content_sha256(v_canonical_payload)",
      );
      expect(block).toContain("p_payload_hash is distinct from v_payload_hash");
      expect(block).toContain(
        "p_expected_version >= 9223372036854775807",
      );
      expect(block).toContain("message = 'PORTAL_IDEMPOTENCY_CONFLICT'");
      expect(block).toContain("for update of referral");
      expect(block).toContain(
        "portal_referral_assignment_assert_session(\n    v_user_id,\n    v_session_id",
      );
      expect(block).toContain("insert into public.portal_audit_events");
      expect(block).toContain("insert into public.portal_mutation_receipts");
      expect(block).toContain(
        "v_now := date_trunc('milliseconds', pg_catalog.clock_timestamp())",
      );
    }

    const triage = functionBlock("public.portal_referral_assignment_triage(");
    expect(triage).toContain("v_referral.current_status <> 'SUBMITTED'");
    expect(triage).toContain("v_receipt.response_status <> 'TRIAGED'");
    expect(triage).toContain(
      "v_receipt.response_row_version <> p_expected_version + 1",
    );
    expect(triage).toContain("current_status = 'TRIAGED'");
    expect(triage).toContain("row_version = v_referral.row_version + 1");
    expect(triage).toContain("'{}'::jsonb");

    const offer = functionBlock("public.portal_referral_assignment_offer(");
    expect(offer).toContain("v_referral.current_status <> 'TRIAGED'");
    expect(offer).toContain("v_receipt.response_status <> 'OFFERED'");
    expect(offer).toContain(
      "v_receipt.response_row_version <> p_expected_version + 1",
    );
    expect(offer).toContain("order by match.id\n  for update of match");
    expect(offer).toContain("v_match.status <> 'CANDIDATE'");
    expect(offer).toContain("set status = 'OFFERED'");
    expect(offer).toContain("assigned_provider_id = null");
    expect(offer).toContain("'matchId', v_match_id::text");
    expect(offer).toContain("'providerId', v_provider_id::text");

    const referralLock = offer.indexOf("for update of referral");
    const referralFound = offer.indexOf(
      "v_referral_found := found",
      referralLock,
    );
    const postReferralSession = offer.indexOf(
      "portal_referral_assignment_assert_session(",
      referralFound,
    );
    const referralNotFound = offer.indexOf("if not v_referral_found then");
    const staleBranch = offer.indexOf(
      "v_referral.row_version <> p_expected_version",
    );
    const matchLock = offer.indexOf("for update of match");
    const postMatchSession = offer.indexOf(
      "portal_referral_assignment_assert_session(",
      matchLock,
    );
    const activeOfferBranch = offer.indexOf("if exists (", matchLock);
    const targetMatchLookup = offer.indexOf("select match.*", matchLock);
    const providerLookup = offer.indexOf(
      "portal_referral_assignment_eligible_providers(",
    );
    const providerFound = offer.indexOf(
      "v_provider_found := found",
      providerLookup,
    );
    const finalSession = offer.indexOf(
      "portal_referral_assignment_assert_session(",
      providerFound,
    );
    const providerNotFound = offer.indexOf("if not v_provider_found then");
    const targetMatchState = offer.indexOf(
      "v_match_exists and v_match.status <> 'CANDIDATE'",
    );
    const firstWrite = offer.indexOf(
      "update public.portal_referral_matches",
    );
    expect(referralFound).toBeGreaterThan(referralLock);
    expect(postReferralSession).toBeGreaterThan(referralFound);
    expect(referralNotFound).toBeGreaterThan(postReferralSession);
    expect(staleBranch).toBeGreaterThan(postReferralSession);
    expect(matchLock).toBeGreaterThan(referralLock);
    expect(postMatchSession).toBeGreaterThan(matchLock);
    expect(activeOfferBranch).toBeGreaterThan(postMatchSession);
    expect(targetMatchLookup).toBeGreaterThan(postMatchSession);
    expect(providerLookup).toBeGreaterThan(matchLock);
    expect(providerFound).toBeGreaterThan(providerLookup);
    expect(finalSession).toBeGreaterThan(providerLookup);
    expect(providerNotFound).toBeGreaterThan(finalSession);
    expect(targetMatchState).toBeGreaterThan(providerNotFound);
    expect(firstWrite).toBeGreaterThan(finalSession);
  });

  it("keeps private helpers outside API EXECUTE and the SQL proof rollback-only", () => {
    expect(
      migration.match(
        /create function\ncareslink_portal_private\.portal_referral_assignment_/g,
      ),
    ).toHaveLength(4);
    expect(migration).toMatch(
      /revoke all on function[\s\S]*portal_referral_assignment_assert_enabled\(\)[\s\S]*portal_referral_assignment_assert_session\(uuid, uuid\)[\s\S]*portal_referral_assignment_context\(\)[\s\S]*portal_referral_assignment_eligible_providers\([\s\S]*text, text, uuid, integer[\s\S]*from public, anon, authenticated, service_role;/,
    );

    expect(firstSqlToken(assertions)).toBe("begin");
    expect(lastSqlToken(assertions)).toBe("rollback");
    expect(assertions).toContain("careslink.assertion_entry_role");
    expect(assertions).not.toContain("session_user");
    expect(assertions).not.toMatch(/^reset role;$/gm);
    expect(assertions).toContain("single-connection");
    for (const marker of [
      "master=false operation=true Assignment authorize succeeded",
      "master+assignment opened Intake authorize",
      "master+assignment opened source-detail authorize",
      "Ambiguous Assignment membership succeeded",
      "Expired session opened Assignment authorize",
      "authenticated direct Assignment SELECT succeeded",
      "Partner Assignment queue tenant/DTO drifted",
      "Operator A read Source B Assignment detail",
      "Assignment triage replay drifted",
      "Assignment stale triage succeeded",
      "Assignment candidate read wrote a match row",
      "Portal Assignment unbounded provider helper overload exists",
      "Assignment bounded provider helper drifted",
      "UNKNOWN provider received Assignment offer",
      "Ineligible DECLINED provider association was observable",
      "Ineligible EXPIRED provider association was observable",
      "Eligible DECLINED provider match was promoted",
      "Uniform provider NOT_FOUND zero-write snapshot drifted",
      "Assignment offer replay changed after eligibility loss",
      "Assignment CANDIDATE promotion snapshot drifted",
      "Assignment replay accepted corrupt receipt status",
      "Assignment offer accepted overflowing expected version",
      "Portal Assignment zero-fixture posture drifted",
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
