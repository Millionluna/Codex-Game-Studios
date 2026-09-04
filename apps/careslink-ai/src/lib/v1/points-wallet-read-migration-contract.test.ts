import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260904054437_add_v1_points_wallet_read.sql",
  ),
  "utf8",
);

function walletFunctionSection() {
  const start = migration.indexOf(
    "create function public.get_v1_points_wallet()",
  );
  const end = migration.indexOf(
    "alter function public.get_v1_points_wallet()",
    start,
  );
  if (start < 0 || end < 0) {
    throw new Error("Points wallet read function is missing");
  }
  return migration.slice(start, end);
}

function balanceStatement(section: string) {
  const start = section.indexOf("  select\n    coalesce(");
  const end = section.indexOf("\n\n  if not found then", start);
  if (start < 0 || end < 0) {
    throw new Error("Points wallet balance statement is missing");
  }
  return section.slice(start, end);
}

describe("V1 Points wallet read migration contract", () => {
  it("is additive, transactional and fail-closed on predecessor drift", () => {
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(migration).toContain(
      "'public.resolve_v1_current_session_status()'",
    );
    for (const relation of [
      "point_wallets",
      "point_lots",
      "point_reservations",
    ]) {
      expect(migration).toContain(`'public.${relation}'`);
    }
    for (const policy of [
      "point_wallets_owner_select",
      "point_lots_owner_select",
      "point_reservations_owner_select",
    ]) {
      expect(migration).toContain(`policy.polname = '${policy}'`);
    }
    expect(
      migration.match(/0::pg_catalog\.oid = any\(policy\.polroles\)/g),
    ).toHaveLength(3);
    expect(
      migration.match(
        /pg_catalog\.pg_has_role\(\s*'authenticated', inherited_role\.oid, 'MEMBER'\s*\)/g,
      ),
    ).toHaveLength(3);
    expect(migration).toContain("V1_POINTS_WALLET_READ_IDENTITY_EXISTS");
    expect(migration).toContain(
      "V1_POINTS_WALLET_READ_INDEX_IDENTITY_EXISTS",
    );
    expect(migration).toContain("V1_POINTS_WALLET_READ_FLAG_IDENTITY_EXISTS");
    expect(migration).toContain(
      "V1_POINTS_WALLET_READ_FLAG_POLICY_IDENTITY_EXISTS",
    );
    expect(migration).toContain("V1_POINTS_WALLET_READ_PREDECESSOR_UNSAFE");
    expect(migration).toContain("overload.proname = 'get_v1_points_wallet'");
    expect(migration).not.toContain(
      "create or replace function public.get_v1_points_wallet",
    );
  });

  it("creates one hard-shadow database capability that remains disabled", () => {
    expect(migration).toMatch(
      /create table public\.v1_points_wallet_read_flags\s*\([\s\S]*feature_key pg_catalog\.text primary key[\s\S]*check \(feature_key = 'points_wallet_read_v1'\)[\s\S]*enabled pg_catalog\.bool not null default false[\s\S]*preview_only pg_catalog\.bool not null default true check \(preview_only\)[\s\S]*shadow_only pg_catalog\.bool not null default true check \(shadow_only\)[\s\S]*\);/i,
    );
    expect(migration).toContain(
      "alter table public.v1_points_wallet_read_flags enable row level security",
    );
    expect(migration).toMatch(
      /revoke all on public\.v1_points_wallet_read_flags\s+from public, anon, authenticated, service_role, authenticator;/i,
    );
    expect(migration).toContain(
      "grant select on public.v1_points_wallet_read_flags to authenticated",
    );
    expect(migration).toMatch(
      /create policy v1_points_wallet_read_flags_authenticated_select[\s\S]*for select\s+to authenticated[\s\S]*feature_key = 'points_wallet_read_v1'[\s\S]*preview_only is true[\s\S]*shadow_only is true/i,
    );
    expect(migration).toMatch(
      /insert into public\.v1_points_wallet_read_flags[\s\S]*values \(\s*'points_wallet_read_v1',\s*false,\s*true,\s*true\s*\);/i,
    );
  });

  it("uses the zero-argument current-session invoker boundary", () => {
    const section = walletFunctionSection();

    expect(section).toContain("returns pg_catalog.jsonb");
    expect(section).toContain("security invoker");
    expect(section).not.toContain("security definer");
    expect(section).toContain("set search_path = ''");
    expect(section).toContain("v_owner_user_id pg_catalog.uuid := auth.uid()");
    expect(section).toContain("public.resolve_v1_current_session_status()");
    expect(section).toContain("message = 'SESSION_REVOKED'");
    expect(section).not.toMatch(/p_(?:user|owner|session)_id/i);
    expect(section).not.toContain("auth.users");
    expect(section).not.toContain("auth.sessions");
    expect(section).not.toContain("raw_user_meta_data");
    expect(section).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("returns only the shared wallet contract and database time", () => {
    const section = walletFunctionSection();

    expect(section).toContain("pg_catalog.clock_timestamp()");
    expect(section).toContain("v_now at time zone 'UTC'");
    expect(section).toContain("'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'");
    expect(section.match(/'contractVersion', '1\.0\.0-shadow\.1'/g)).toHaveLength(
      2,
    );
    expect(section.match(/'serverTime', v_server_time/g)).toHaveLength(2);
    expect(section).toContain("'status', 'NOT_READY'");
    expect(section).toContain("'status', 'AVAILABLE'");
    expect(section).toContain("'unit', 'POINTS'");
    expect(section).toContain("'availablePoints', v_available_points");
    expect(section).toContain("'reservedPoints', v_reserved_points");

    for (const prohibitedKey of [
      "ownerUserId",
      "sessionId",
      "walletId",
      "lotId",
      "quoteId",
      "reservationId",
      "idempotencyKey",
      "ledgerId",
      "email",
    ]) {
      expect(section).not.toContain(`'${prohibitedKey}'`);
    }
  });

  it("uses one statement snapshot for conservative owner-only totals", () => {
    const section = walletFunctionSection();
    const statement = balanceStatement(section);

    expect(statement.match(/\binto\b/gi)).toHaveLength(1);
    expect(statement).toContain(
      "into v_available_points, v_reserved_points",
    );
    expect(statement).toContain("from public.point_wallets as wallet");
    expect(statement).toContain("wallet.owner_user_id = v_owner_user_id");
    expect(statement).toContain("wallet.status = 'ACTIVE'");
    expect(statement).toContain("wallet.shadow_only is true");
    expect(statement).toContain("from public.point_lots as lot");
    expect(statement).toContain("lot.owner_user_id = v_owner_user_id");
    expect(statement).toContain("lot.shadow_only is true");
    expect(statement).toContain(
      "lot.expires_at is null or lot.expires_at > v_now",
    );
    expect(statement).toContain(
      "from public.point_reservations as reservation",
    );
    expect(statement).toContain(
      "reservation.owner_user_id = v_owner_user_id",
    );
    expect(statement).toContain("reservation.status = 'RESERVED'");
    expect(statement).toContain("reservation.shadow_only is true");
    expect(statement).not.toMatch(/reservation\.expires_at\s*(?:>|>=|is)/i);
    expect(statement).toContain(
      "pg_catalog.sum(lot.remaining_points::pg_catalog.int8)",
    );
    expect(statement).toContain(
      "pg_catalog.sum(reservation.points::pg_catalog.int8)",
    );
    expect(section).toContain("v_available_points > 9007199254740991");
    expect(section).toContain("v_reserved_points > 9007199254740991");
  });

  it("fails closed at the database capability before reading wallet state", () => {
    const section = walletFunctionSection();
    const capabilityRead = section.indexOf(
      "from public.v1_points_wallet_read_flags as flag",
    );
    const walletRead = section.indexOf("from public.point_wallets as wallet");

    expect(capabilityRead).toBeGreaterThan(-1);
    expect(walletRead).toBeGreaterThan(capabilityRead);
    expect(section).toContain("flag.feature_key = 'points_wallet_read_v1'");
    expect(section).toContain("flag.enabled is true");
    expect(section).toContain("flag.preview_only is true");
    expect(section).toContain("flag.shadow_only is true");
    expect(section).toContain("if not coalesce(v_capability_enabled, false)");
    expect(section).toContain("message = 'PRODUCT_API_DISABLED'");
  });

  it("adds the exact partial index and only seeds the capability row", () => {
    expect(migration).toMatch(
      /create index point_reservations_wallet_reserved_shadow_idx\s+on public\.point_reservations\(wallet_id, owner_user_id\)\s+where status = 'RESERVED' and shadow_only is true;/i,
    );

    const section = walletFunctionSection();
    expect(section).not.toMatch(/\b(?:insert|update|delete|merge|truncate)\b/i);
    expect(section).not.toContain("point_quotes");
    expect(section).not.toContain("point_reservation_allocations");
    expect(section).not.toContain("point_ledger_entries");
    expect(section).not.toContain("account_entitlements");
    expect(section).not.toContain("credit_ledger");
    expect(
      migration.match(/^[ \t]*insert\s+into\s+public\.[a-z0-9_]+/gim),
    ).toEqual(["insert into public.v1_points_wallet_read_flags"]);
    expect(
      migration.match(/^[ \t]*create\s+table\s+public\.[a-z0-9_]+/gim),
    ).toEqual(["create table public.v1_points_wallet_read_flags"]);
    expect(migration).not.toMatch(
      /^\s*(?:update\s+|delete\s+from|merge\s+into|truncate\s+)/im,
    );
    expect(migration).not.toMatch(
      /^\s*insert\s+into\s+public\.(?:point_|account_entitlements|credit_ledger)/im,
    );
    expect(migration).not.toMatch(
      /^\s*(?:alter|drop)\s+table\s+public\.(?:point_|account_entitlements|credit_ledger)/im,
    );
  });

  it("revokes default execution and grants only authenticated", () => {
    const revokeIndex = migration.indexOf(
      "revoke all on function public.get_v1_points_wallet()",
    );
    const grantIndex = migration.indexOf(
      "grant execute on function public.get_v1_points_wallet()",
    );

    expect(migration).toContain(
      "alter function public.get_v1_points_wallet()\n  owner to postgres",
    );
    expect(migration).toMatch(
      /revoke all on function public\.get_v1_points_wallet\(\)\s+from public, anon, authenticated, service_role, authenticator;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_v1_points_wallet\(\)\s+to authenticated;/i,
    );
    expect(migration.match(/grant execute on function/g)).toHaveLength(1);
    expect(revokeIndex).toBeGreaterThan(-1);
    expect(grantIndex).toBeGreaterThan(revokeIndex);
  });
});
