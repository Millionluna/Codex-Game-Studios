import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260902052755_add_v1_communication_note_points_preview.sql",
  ),
  "utf8",
);

function previewFunctionSection() {
  const start = migration.indexOf(
    "create function public.get_v1_communication_note_points_preview()",
  );
  const end = migration.indexOf(
    "alter function public.get_v1_communication_note_points_preview()",
    start,
  );
  if (start < 0 || end < 0) {
    throw new Error("Communication Note Points preview function is missing");
  }
  return migration.slice(start, end);
}

describe("Communication Note Points preview migration contract", () => {
  it("is additive, transactional and guarded by the current-session predecessor", () => {
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(migration).toContain(
      "'public.resolve_v1_current_session_status()'",
    );
    expect(migration).toContain(
      "V1_COMMUNICATION_NOTE_POINTS_PREVIEW_PREDECESSOR_UNSAFE",
    );
    expect(migration).toContain(
      "overload.proname = 'get_v1_communication_note_points_preview'",
    );
    expect(migration).toContain(
      "pg_catalog.to_regclass('public.point_wallets')",
    );
    expect(migration).toContain(
      "pg_catalog.to_regclass('public.point_reservations')",
    );
    expect(migration).not.toContain(
      "create or replace function public.get_v1_communication_note_points_preview",
    );
  });

  it("derives identity from the zero-argument authenticated session and returns metadata only", () => {
    const section = previewFunctionSection();

    expect(section).toContain("returns pg_catalog.jsonb");
    expect(section).toContain("security definer");
    expect(section).toContain("set search_path = ''");
    expect(section).toContain("v_owner_user_id pg_catalog.uuid := auth.uid()");
    expect(section).toContain("public.resolve_v1_current_session_status()");
    expect(section).toContain("message = 'SESSION_REVOKED'");
    expect(section).not.toMatch(/p_(?:user|owner|session)_id/i);
    expect(section).not.toContain("auth.users");
    expect(section).not.toContain("auth.sessions");
    expect(section).not.toContain("raw_user_meta_data");
    expect(section).not.toContain("SUPABASE_SERVICE_ROLE_KEY");

    for (const metadataKey of [
      "status",
      "unit",
      "serviceCode",
      "catalogVersion",
      "generationCostPoints",
      "availablePoints",
      "reservedPoints",
      "canAfford",
    ]) {
      expect(section).toContain(`'${metadataKey}'`);
    }
    for (const prohibitedKey of [
      "ownerUserId",
      "sessionId",
      "walletId",
      "lotId",
      "quoteId",
      "reservationId",
      "idempotencyKey",
      "ledgerId",
    ]) {
      expect(section).not.toContain(`'${prohibitedKey}'`);
    }
  });

  it("pins the approved Communication Note rate and computes a conservative wallet view", () => {
    const section = previewFunctionSection();

    expect(section).toContain(
      "rate.catalog_version = '2026-08-09.v1-shadow'",
    );
    expect(section).toContain(
      "rate.service_code = 'note.communication.generate'",
    );
    expect(section).toContain("and rate.unit = 'request'");
    expect(section).toContain("and rate.points = 20");
    expect(section).toContain("and rate.minimum_points is null");
    expect(section).toContain("and rate.maximum_points is null");
    expect(section).toContain("and rate.status = 'SHADOW'");
    expect(section).toContain("and version.status = 'SHADOW'");
    expect(section).toContain("wallet.owner_user_id = v_owner_user_id");
    expect(section).toContain("wallet.status = 'ACTIVE'");
    expect(section).toContain("wallet.shadow_only is true");
    expect(section).toContain("lot.owner_user_id = v_owner_user_id");
    expect(section).toContain("lot.shadow_only is true");
    expect(section).toContain("reservation.owner_user_id = v_owner_user_id");
    expect(section).toContain("reservation.status = 'RESERVED'");
    expect(section).toContain("reservation.shadow_only is true");
    expect(section).toContain("lot.expires_at > v_now");
    expect(section).not.toMatch(/reservation\.expires_at\s*(?:>|>=|is)/i);
    expect(section).toContain(
      "pg_catalog.sum(lot.remaining_points::pg_catalog.int8)",
    );
    expect(section).toContain(
      "pg_catalog.sum(reservation.points::pg_catalog.int8)",
    );
    expect(section).toContain(
      "into v_available_points, v_reserved_points",
    );
    expect(section).toContain("v_available_points > 9007199254740991");
    expect(section).toContain("v_reserved_points > 9007199254740991");
    expect(section).toContain("'status', 'NOT_READY'");
    expect(section).toContain("'status', 'AVAILABLE'");
    expect(section).toContain("'availablePoints', v_available_points");
    expect(section).toContain("'reservedPoints', v_reserved_points");
    expect(section).toContain(
      "'canAfford', v_available_points >= v_generation_cost_points",
    );
  });

  it("creates no quote, reservation, grant, Point mutation or legacy Credit access", () => {
    const section = previewFunctionSection();

    expect(section).not.toMatch(/\b(?:insert|update|delete|merge)\b/i);
    expect(section).not.toContain("point_quotes");
    expect(section).not.toContain("point_reservation_allocations");
    expect(section).not.toContain("point_ledger_entries");
    expect(section).not.toContain("grant_shadow_point_lot");
    expect(section).not.toContain("create_shadow_point_quote");
    expect(section).not.toContain("reserve_shadow_points");
    expect(section).not.toContain("account_entitlements");
    expect(section).not.toContain("credit_ledger");
    expect(migration).not.toMatch(/\b(?:insert\s+into|update|delete\s+from|merge\s+into)\b/i);
    expect(migration).not.toMatch(/\bgrant\b[\s\S]{0,80}\bon\s+(?:table|sequence)\b/i);
  });

  it("revokes default execution and grants only authenticated", () => {
    const revokeIndex = migration.indexOf(
      "revoke all on function public.get_v1_communication_note_points_preview()",
    );
    const grantIndex = migration.indexOf(
      "grant execute on function public.get_v1_communication_note_points_preview()",
    );

    expect(migration).toContain(
      "alter function public.get_v1_communication_note_points_preview()\n  owner to postgres",
    );
    expect(migration).toMatch(
      /revoke all on function public\.get_v1_communication_note_points_preview\(\)\s+from public, anon, authenticated, service_role, authenticator;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_v1_communication_note_points_preview\(\)\s+to authenticated;/i,
    );
    expect(migration.match(/grant execute on function/g)).toHaveLength(1);
    expect(revokeIndex).toBeGreaterThan(-1);
    expect(grantIndex).toBeGreaterThan(revokeIndex);
  });
});
