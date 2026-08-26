import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260826090841_add_portal_referral_follow_up_runtime.sql";
const assertionPath =
  "supabase/tests/portal_referral_follow_up_runtime_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(join(process.cwd(), assertionPath), "utf8");

const publicRoutines = [
  "public.portal_referral_follow_up_authorize()",
  "public.portal_referral_follow_up_detail(",
  "public.portal_referral_follow_up_record(",
] as const;

describe("Portal referral Follow-up M1c runtime migration contract", () => {
  it("is one default-off Preview-only transactional slice with no table/index/policy expansion", () => {
    expect(firstSqlToken(migration)).toBe("begin");
    expect(lastSqlToken(migration)).toBe("commit");
    expect(migration).toMatch(
      /insert into public\.portal_workflow_flags \([\s\S]*?capability,[\s\S]*?enabled,[\s\S]*?preview_only[\s\S]*?\) values \('referral_follow_up_v1', false, true\);/,
    );

    const deploymentStatements = withoutFunctionBodiesAndComments(migration);
    expect(
      deploymentStatements.match(/insert into public\.portal_workflow_flags/g),
    ).toHaveLength(1);
    expect(deploymentStatements).not.toMatch(/enabled\s*=\s*true/i);
    expect(deploymentStatements).not.toMatch(/\bgrant\b[^;]*\bon\s+table\b/i);
    expect(deploymentStatements).not.toMatch(
      /\b(?:create|alter|drop)\s+(?:table|index|policy)\b/i,
    );
  });

  it("exposes exactly authorize, accepted private detail and record as authenticated-only RPCs", () => {
    expect(
      migration.match(/create function public\.portal_referral_follow_up_/g),
    ).toHaveLength(3);
    expect(
      migration.match(
        /create function\ncareslink_portal_private\.portal_referral_follow_up_/g,
      ),
    ).toHaveLength(1);

    for (const routine of publicRoutines) {
      const block = functionBlock(routine);
      for (const posture of [
        "returns jsonb",
        "language plpgsql",
        "volatile",
        "security definer",
        "set search_path = ''",
        "careslink_portal_private.portal_referral_follow_up_assert_enabled()",
        "careslink_portal_private.portal_referral_provider_response_context()",
      ]) {
        expect(block).toContain(posture);
      }
    }

    expect(migration).toMatch(
      /revoke all on function[\s\S]*portal_referral_follow_up_authorize\(\)[\s\S]*portal_referral_follow_up_detail\(uuid\)[\s\S]*portal_referral_follow_up_record\([\s\S]*uuid, bigint, text, text, text, text[\s\S]*\)[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function[\s\S]*portal_referral_follow_up_authorize\(\)[\s\S]*portal_referral_follow_up_detail\(uuid\)[\s\S]*portal_referral_follow_up_record\([\s\S]*uuid, bigint, text, text, text, text[\s\S]*\)[\s\S]*to authenticated;/,
    );
    expect(migration).not.toMatch(/\bto\s+(?:public|anon|service_role)\s*;/i);
    expect(withoutFunctionBodiesAndComments(migration)).not.toMatch(
      /\b(?:alter|set)\s+role\b|\bowner\s+to\b/i,
    );
  });

  it("uses an independent master-before-operation gate and the pinned exact-provider context", () => {
    const gate = functionBlock(
      "careslink_portal_private.portal_referral_follow_up_assert_enabled()",
    );
    const masterGate = gate.indexOf("flag.capability = 'referral_workflow_v1'");
    const operationGate = gate.indexOf("flag.capability = 'referral_follow_up_v1'");
    expect(masterGate).toBeGreaterThanOrEqual(0);
    expect(operationGate).toBeGreaterThan(masterGate);
    expect(countOccurrences(gate, "for share of flag")).toBe(2);
    expect(
      countOccurrences(gate, "message = 'PORTAL_CAPABILITY_DISABLED'"),
    ).toBe(2);
    expect(migration).not.toContain(
      "portal_referral_provider_response_assert_enabled()",
    );

    const authorize = functionBlock(
      "public.portal_referral_follow_up_authorize()",
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
    expect(migration).toMatch(
      /revoke all on function[\s\S]*portal_referral_follow_up_assert_enabled\(\)[\s\S]*from public, anon, authenticated, service_role;/,
    );
  });

  it("serves only the assigned provider's accepted private detail with no history expansion", () => {
    const detail = functionBlock("public.portal_referral_follow_up_detail(");
    for (const predicate of [
      "p_referral_id uuid",
      "p_referral_id is null",
      "message = 'PORTAL_NOT_FOUND'",
      "referral.assigned_provider_id = v_provider_id",
      "v_referral.current_status not in ('ACCEPTED', 'IN_PROGRESS')",
      "match.provider_id = v_provider_id",
      "match.status = 'ACCEPTED'",
      "match.offered_at is not null",
      "match.responded_by is not null",
      "match.responded_at is not null",
      "if v_accepted_match_count <> 1 then",
      "careslink_portal_private.portal_referral_contacts",
      "contact.referral_id = v_referral.id",
      "for share of referral",
      "order by match.id",
      "for share of match",
      "portal_referral_provider_response_assert_session(",
    ]) {
      expect(detail).toContain(predicate);
    }
    for (const key of [
      "referral_id",
      "summary",
      "region",
      "service_type",
      "current_status",
      "row_version",
      "contact",
      "name",
      "phone",
      "email",
      "created_at",
      "updated_at",
    ]) {
      expect(detail).toContain(`'${key}'`);
    }
    expect(detail).not.toMatch(
      /source_organization|source_user|portal_referral_followups|portal_audit_events|portal_mutation_receipts/i,
    );
    expect(detail).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from)\s+(?:public|careslink_portal_private)\./i,
    );
  });

  it("binds record idempotency to actor and a database-built canonical hash before writes", () => {
    const record = functionBlock("public.portal_referral_follow_up_record(");
    for (const predicate of [
      "p_referral_id uuid",
      "p_expected_version bigint",
      "p_outcome_code text",
      "p_mutation_id_hash text",
      "p_payload_hash text",
      "p_correlation_id_hash text",
      "p_expected_version >= 9223372036854775807",
      "p_outcome_code not in (",
      "'CONTACT_CONFIRMED'",
      "'INFORMATION_REQUESTED'",
      "'FOLLOW_UP_SCHEDULED'",
      "'SERVICE_COMMENCED'",
      "'NO_RESPONSE'",
      "!~ '^[a-f0-9]{64}$'",
      "pg_advisory_xact_lock",
      "hashtextextended(v_user_id::text || ':' || p_mutation_id_hash, 0)",
      "'organizationId', v_organization_id::text",
      "'role', 'provider_member'",
      "'providerId', v_provider_id::text",
      "'kind', 'RECORD_FOLLOW_UP'",
      "'referralId', p_referral_id::text",
      "'expectedVersion', p_expected_version",
      "'outcomeCode', p_outcome_code",
      "public.v1_shadow_content_sha256(v_canonical_payload)",
      "p_payload_hash is distinct from v_payload_hash",
      "receipt.actor_user_id = v_user_id",
      "receipt.mutation_id_hash = p_mutation_id_hash",
      "v_receipt.response_match_id is not null",
      "message = 'PORTAL_IDEMPOTENCY_CONFLICT'",
    ]) {
      expect(record).toContain(predicate);
    }
    const advisoryLock = record.indexOf("pg_advisory_xact_lock");
    const context = record.indexOf("portal_referral_provider_response_context()");
    const hashCheck = record.indexOf(
      "p_payload_hash is distinct from v_payload_hash",
    );
    const firstWrite = firstIndexOf(record, [
      "insert into public.portal_referral_followups",
      "update public.portal_referrals",
    ]);
    expect(context).toBeGreaterThan(advisoryLock);
    expect(hashCheck).toBeGreaterThan(context);
    expect(firstWrite).toBeGreaterThan(hashCheck);
  });

  it("locks referral then all matches, rechecks session and atomically records the fixed-code transition", () => {
    const record = functionBlock("public.portal_referral_follow_up_record(");
    const receiptLookup = record.indexOf("select receipt.*");
    const replayStart = record.indexOf("if found then", receiptLookup);
    const replayReturn = record.indexOf(
      "return jsonb_build_object(",
      replayStart,
    );
    const replayEnd = record.indexOf("\n  end if;", replayReturn);
    const freshStart = record.indexOf(
      "-- Discover only provider-owned work",
      replayEnd,
    );
    const firstWrite = record.indexOf(
      "insert into public.portal_referral_followups",
      freshStart,
    );

    expect(receiptLookup).toBeGreaterThanOrEqual(0);
    expect(replayStart).toBeGreaterThan(receiptLookup);
    expect(replayReturn).toBeGreaterThan(replayStart);
    expect(replayEnd).toBeGreaterThan(replayReturn);
    expect(freshStart).toBeGreaterThan(replayEnd);
    expect(firstWrite).toBeGreaterThan(freshStart);

    const replay = record.slice(replayStart, replayEnd);
    const fresh = record.slice(freshStart, firstWrite);
    expect(countOccurrences(record, "for update of referral")).toBe(2);
    expect(countOccurrences(record, "order by match.id")).toBe(2);
    expect(countOccurrences(record, "for update of match")).toBe(2);

    const replayReferralLock = replay.indexOf("for update of referral");
    const replayMatchOrder = replay.indexOf(
      "order by match.id",
      replayReferralLock,
    );
    const replayMatchLock = replay.indexOf(
      "for update of match",
      replayMatchOrder,
    );
    const replaySessionAfterLocks = replay.indexOf(
      "portal_referral_provider_response_assert_session(",
      replayMatchLock,
    );
    const replayAcceptedCount = replay.indexOf(
      "select count(*)",
      replaySessionAfterLocks,
    );
    const replayAssignmentCheck = replay.indexOf(
      "v_referral.assigned_provider_id is distinct from v_provider_id",
      replayAcceptedCount,
    );
    const replayStatusCheck = replay.indexOf(
      "v_referral.current_status not in ('ACCEPTED', 'IN_PROGRESS')",
      replayAssignmentCheck,
    );
    const replayAcceptedCheck = replay.indexOf(
      "v_accepted_match_count <> 1",
      replayStatusCheck,
    );
    const replayAck = replay.indexOf(
      "return jsonb_build_object(",
      replayAcceptedCheck,
    );

    expect(replayReferralLock).toBeGreaterThanOrEqual(0);
    expect(replayMatchOrder).toBeGreaterThan(replayReferralLock);
    expect(replayMatchLock).toBeGreaterThan(replayMatchOrder);
    expect(replaySessionAfterLocks).toBeGreaterThan(replayMatchLock);
    expect(replayAcceptedCount).toBeGreaterThan(replaySessionAfterLocks);
    expect(replayAssignmentCheck).toBeGreaterThan(replayAcceptedCount);
    expect(replayStatusCheck).toBeGreaterThan(replayAssignmentCheck);
    expect(replayAcceptedCheck).toBeGreaterThan(replayStatusCheck);
    expect(replayAck).toBeGreaterThan(replayAcceptedCheck);

    for (const predicate of [
      "referral.id = v_receipt.response_referral_id",
      "match.referral_id = v_referral.id",
      "match.provider_id = v_provider_id",
      "match.status = 'ACCEPTED'",
      "match.offered_at is not null",
      "match.responded_by is not null",
      "match.responded_at is not null",
      "message = 'PORTAL_NOT_FOUND'",
    ]) {
      expect(replay).toContain(predicate);
    }

    const freshReferralLock = fresh.indexOf("for update of referral");
    const freshMatchOrder = fresh.indexOf(
      "order by match.id",
      freshReferralLock,
    );
    const freshMatchLock = fresh.indexOf(
      "for update of match",
      freshMatchOrder,
    );
    const freshSessionAfterLocks = fresh.indexOf(
      "portal_referral_provider_response_assert_session(",
      freshMatchLock,
    );
    const freshAssignmentCheck = fresh.indexOf(
      "v_referral.assigned_provider_id is distinct from v_provider_id",
      freshSessionAfterLocks,
    );
    const freshAcceptedCheck = fresh.indexOf(
      "if v_accepted_match_count <> 1 then",
      freshSessionAfterLocks,
    );
    const freshAcceptedCount = fresh.indexOf(
      "select count(*)",
      freshAssignmentCheck,
    );
    const versionCheck = fresh.indexOf(
      "if v_referral.row_version <> p_expected_version",
      freshAcceptedCheck,
    );
    const stateCheck = fresh.indexOf(
      "v_referral.current_status not in ('ACCEPTED', 'IN_PROGRESS')",
      versionCheck,
    );

    expect(freshReferralLock).toBeGreaterThanOrEqual(0);
    expect(freshMatchOrder).toBeGreaterThan(freshReferralLock);
    expect(freshMatchLock).toBeGreaterThan(freshMatchOrder);
    expect(freshSessionAfterLocks).toBeGreaterThan(freshMatchLock);
    expect(freshAssignmentCheck).toBeGreaterThan(freshSessionAfterLocks);
    expect(freshAcceptedCount).toBeGreaterThan(freshAssignmentCheck);
    expect(freshAcceptedCheck).toBeGreaterThan(freshAcceptedCount);
    expect(versionCheck).toBeGreaterThan(freshAcceptedCheck);
    expect(stateCheck).toBeGreaterThan(versionCheck);
    expect(stateCheck).toBeGreaterThanOrEqual(0);

    for (const predicate of [
      "referral.assigned_provider_id = v_provider_id",
      "if v_accepted_match_count <> 1 then",
      "message = 'PORTAL_STALE_REFERRAL'",
      "message = 'PORTAL_INVALID_STATE_TRANSITION'",
      "actor_user_id",
      "outcome_code",
      "next_due_at",
      "v_user_id",
      "p_outcome_code",
      "null",
      "current_status = 'IN_PROGRESS'",
      "row_version = v_referral.row_version + 1",
      "insert into public.portal_audit_events",
      "'provider_member'",
      "'RECORD_FOLLOW_UP'",
      "jsonb_build_object('outcomeCode', p_outcome_code)",
      "insert into public.portal_mutation_receipts",
      "v_referral.id",
      "null",
      "'IN_PROGRESS'",
      "v_referral.row_version + 1",
    ]) {
      expect(record).toContain(predicate);
    }
  });

  it("ships an executable rollback-only proof for gate, isolation, replay, atomicity and ACL posture", () => {
    expect(firstSqlToken(assertions)).toBe("begin");
    expect(lastSqlToken(assertions)).toBe("rollback");
    expect(assertions).toContain("careslink.assertion_entry_role");
    expect(assertions).toContain("single-connection");
    expect(assertions).not.toContain("session_user");
    expect(assertions).not.toMatch(/^reset role;$/gm);

    for (const marker of [
      "Follow-up flags are not default-off Preview-only",
      "Follow-up gate lock order drifted",
      "Follow-up reused the Provider Response operation gate",
      "Follow-up provider context dependency drifted",
      "Follow-up private detail projection drifted",
      "Follow-up mutation/lock/hash posture drifted",
      "public RPC ACL drifted",
      "private helper ACL drifted",
      "API table grant drifted",
      "Follow-up exposed a foreign accepted referral",
      "Follow-up exposed a non-accepted referral",
      "Follow-up exposed corrupt accepted-match state",
      "Follow-up accepted a stale referral version",
      "Follow-up accepted a forged payload hash",
      "Follow-up replay drifted",
      "Follow-up changed-payload replay succeeded",
      "Follow-up replayed a CLOSED residual binding",
      "Follow-up atomic state drifted",
      "Second competing Follow-up succeeded",
      "Ambiguous provider context was authorized",
      "Expired provider session was authorized",
      "portal_followups_append_only",
      "portal_audit_append_only",
      "portal_receipts_append_only",
      "Follow-up rollback zero-fixture posture drifted",
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

function firstIndexOf(value: string, needles: readonly string[]) {
  const indexes = needles
    .map((needle) => value.indexOf(needle))
    .filter((index) => index >= 0);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}
