import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260902063211_add_v1_communication_note_points_admission.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");

const deniedRuntimeRoles = [
  "public",
  "anon",
  "authenticated",
  "service_role",
  "authenticator",
] as const;

describe("Communication Note atomic Points admission migration contract", () => {
  it("is transactional, source-only and incapable of activating generation", () => {
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/);
    expect(migration).toContain(
      "Atomic Communication Note durable admission + 20-Point reservation",
    );
    expect(migration).toContain("source-only and default-off");
    expect(migration).toContain("route or worker activation");
    expect(migration).not.toMatch(/\benabled\s*=\s*true\b/i);
    expect(migration).not.toMatch(/\b(?:fetch|https?|provider_api_call)\b/i);
    expect(migration).not.toMatch(
      /grant execute on function\s+careslink_v1_generation\.admit_and_reserve[\s\S]{0,500}\bto\s+(?:anon|authenticated|service_role|authenticator)\b/i,
    );
  });

  it("uses one purpose-only NOLOGIN role and removes every migration-added SET edge", () => {
    expect(migration).toMatch(
      /create role careslink_v1_generation_points_admission_executor\s+with nologin nosuperuser nocreatedb nocreaterole noinherit\s+noreplication nobypassrls;/,
    );
    for (const role of [
      "careslink_v1_generation_owner",
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner_api_executor",
      "careslink_v1_generation_points_admission_executor",
    ]) {
      expect(migration).toContain(
        `grant ${role} to current_user\n  with admin false, inherit false, set true\n  granted by current_user;`,
      );
      expect(migration).toContain(
        `revoke ${role}\n  from current_user granted by current_user;`,
      );
    }
    expect(migration).not.toMatch(/\breset role\b/i);
    expect(migration).toContain(
      "pg_catalog.current_setting('careslink.migration_entry_role')",
    );
  });

  it("creates a forced-RLS immutable one-to-one binding with owner-safe FKs", () => {
    const table = section(
      "create table careslink_v1_generation.communication_note_point_admissions",
      "create index communication_note_point_admissions_owner_created_idx",
    );
    expect(table).toContain("unique (job_id)");
    expect(table).toContain("unique (quote_id)");
    expect(table).toContain("unique (reservation_id)");
    expect(table).toContain("unique (id, job_id, owner_user_id)");
    expect(table).toContain(
      "foreign key (job_id, owner_user_id)\n    references careslink_v1_generation.jobs(id, owner_user_id)",
    );
    expect(table).toContain(
      "foreign key (quote_id, owner_user_id)\n    references public.point_quotes(id, owner_user_id)",
    );
    expect(table).toContain(
      "foreign key (reservation_id, owner_user_id)\n    references public.point_reservations(id, owner_user_id)",
    );
    expect(migration).toContain(
      "communication_note_point_admissions\n  force row level security;",
    );
    expect(migration).toContain(
      "communication_note_point_admissions_immutable",
    );
    expect(migration).toContain("message = 'IMMUTABLE_BINDING'");
    expect(migration).toContain("deferrable initially deferred");
  });

  it("reserves exactly 20 Points using server time and deterministic owner locks", () => {
    const helper = functionSection(
      "careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(",
      "$careslink_v1_reserve_and_bind_communication_points$",
    );
    expect(helper).toContain("p_expect_new pg_catalog.bool");
    expect(helper).not.toMatch(/p_(?:now|quote|reservation|binding)_/i);
    expect(helper).toContain("pg_catalog.clock_timestamp()");
    expect(helper).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(helper).toContain("'note.communication.generate'");
    expect(helper).toContain("'2026-08-09.v1-shadow'");
    expect(helper).toContain("v_rate.points is distinct from 20");
    expect(helper).toContain("v_outstanding pg_catalog.int4 := 20");
    expect(helper).toMatch(
      /order by\s+\(lot\.expires_at is null\),\s+lot\.expires_at,\s+\(lot\.source = 'TOP_UP'\),\s+lot\.granted_at,\s+lot\.id\s+for update/,
    );
    expect(helper).toContain("v_outstanding <> 0");
    expect(helper).toContain("message = 'POINTS_INSUFFICIENT'");
    expect(helper).toContain("message = 'POINT_QUOTE_EXPIRED'");
    expect(helper).toContain("'RESERVE'");
    expect(helper).not.toMatch(/\b(?:COMMIT|RELEASE|REFUND)\b/);
  });

  it("replay proves the same live reservation without writing a second debit", () => {
    const helper = functionSection(
      "careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(",
      "$careslink_v1_reserve_and_bind_communication_points$",
    );
    const replayStart = helper.indexOf("if found then");
    const freshStart = helper.indexOf("if not p_expect_new", replayStart);
    const replay = helper.slice(replayStart, freshStart);
    expect(replayStart).toBeGreaterThan(-1);
    expect(freshStart).toBeGreaterThan(replayStart);
    expect(replay).toContain("v_replay_allocation_points");
    expect(replay).toContain("v_replay_reserve_ledger_count");
    expect(replay).toContain("reservation_status is distinct from 'RESERVED'");
    expect(replay).toContain("quote_expires_at <= v_now");
    expect(replay).toContain("fresh_session_is_active");
    expect(replay).toContain("fresh_privacy_proof_expires_at");
    expect(replay).toContain("'created', false");
    expect(replay).not.toMatch(/\binsert\s+into\b|\bupdate\s+public\./i);
  });

  it("coordinates durable admission and reservation with one exact private envelope", () => {
    const coordinator = functionSection(
      "careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(",
      "$careslink_v1_admit_and_reserve_communication_note$",
    );
    expect(coordinator.match(/p_[a-z_]+ pg_catalog\./g)).toHaveLength(14);
    expect(coordinator).toContain(
      "careslink_v1_generation.admit_and_enqueue_v1_shadow_note_generation_job(",
    );
    expect(coordinator).toContain("'communication'");
    expect(coordinator).toContain(
      "careslink_v1_generation._reserve_and_bind_v1_shadow_communication_note_points(",
    );
    expect(coordinator).toContain("v_points ?&");
    expect(coordinator).toContain("'pointsReserved', true");
    for (const privateKey of [
      "bindingId",
      "quoteId",
      "reservationId",
      "ownerUserId",
      "sessionId",
    ]) {
      expect(coordinator.slice(coordinator.indexOf("return pg_catalog"))).not.toContain(
        `'${privateKey}'`,
      );
    }
  });

  it("quarantines paid jobs before and during worker claim and direct attempts", () => {
    const claim = functionSection(
      "careslink_v1_generation.claim_v1_shadow_note_generation_job(",
      "$careslink_v1_claim_unpaid_generation_job$",
    );
    expect(
      claim.match(/job\.communication_note_point_admission_id is null/g),
    ).toHaveLength(2);
    expect(claim).toContain("for update of job skip locked");
    expect(migration).toContain(
      "attempts_communication_note_paid_admission_gate",
    );
    expect(migration).toContain(
      "before update of status, communication_note_point_admission_id",
    );
    expect(migration).toContain(
      "new.status is distinct from old.status",
    );
    expect(migration).toContain(
      "perform careslink_v1_generation._set_owner(new.owner_user_id);",
    );
    expect(migration).not.toMatch(
      /attempts_communication_note_paid_admission_gate[\s\S]{0,180}\bwhen\s*\(/i,
    );
    expect(migration).toContain("message = 'PRODUCT_API_DISABLED'");
  });

  it("quarantines bound reservations from legacy Points terminal RPCs", () => {
    const guard = functionSection(
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()",
      "$careslink_v1_guard_communication_paid_reservation$",
    );
    expect(guard).toContain(
      "from careslink_v1_generation.communication_note_point_admissions",
    );
    expect(guard).toContain("v_owner_user_id := old.owner_user_id");
    expect(guard).toContain("v_reservation_id := old.id");
    expect(guard).not.toContain("new.owner_user_id");
    expect(guard).not.toContain("new.id");
    expect(guard).toContain("v_previous_owner_setting");
    expect(guard).toContain(
      "coalesce(v_previous_owner_setting, '')",
    );
    expect(guard).toContain("binding.reservation_id = v_reservation_id");
    expect(guard).toContain("binding.owner_user_id = v_owner_user_id");
    expect(guard).toContain("message = 'PRODUCT_API_DISABLED'");
    expect(migration).toMatch(
      /create trigger point_reservations_communication_note_paid_admission_gate\s+before update or delete\s+on public\.point_reservations\s+for each row execute function\s+careslink_v1_generation\._guard_v1_shadow_communication_note_paid_reservation\(\);/,
    );
    expect(migration).toContain(
      "grant trigger on table public.point_reservations\n  to careslink_v1_generation_points_admission_executor;",
    );
    expect(migration).toContain(
      "revoke trigger on table public.point_reservations\n  from careslink_v1_generation_points_admission_executor;",
    );
    expect(migration).not.toMatch(
      /create or replace function public\.(?:commit_shadow_points|release_shadow_points)/,
    );
  });

  it("keeps paid jobs out of every queued and running recovery mutation", () => {
    const recovery = functionSection(
      "careslink_v1_generation.recover_v1_shadow_note_generation_expired(",
      "$careslink_v1_recover_unpaid_generation_jobs$",
    );
    expect(
      recovery.match(/job\.communication_note_point_admission_id is null/g),
    ).toHaveLength(7);
    expect(recovery).toMatch(
      /where job\.status = 'QUEUED'\s+and job\.communication_note_point_admission_id is null/,
    );
    expect(recovery).toMatch(
      /where job\.status = 'RUNNING'\s+and job\.communication_note_point_admission_id is null/,
    );
    expect(recovery).toMatch(
      /where job\.id = v_job\.id\s+and job\.status = 'QUEUED'\s+and job\.communication_note_point_admission_id is null/,
    );
    expect(recovery.match(/and job\.status = 'RUNNING'\s+and job\.communication_note_point_admission_id is null/g)).toHaveLength(2);
  });

  it("leaves no direct runtime access to the binding or private coordinator", () => {
    for (const role of deniedRuntimeRoles) {
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function\\s+careslink_v1_generation\\.admit_and_reserve[\\s\\S]{0,900}\\b${role}\\b`,
        ),
      );
    }
    expect(migration).toMatch(
      /revoke all on table\s+careslink_v1_generation\.communication_note_point_admissions\s+from public, anon, authenticated, service_role, authenticator,[\s\S]+careslink_v1_generation_owner_api_executor;/,
    );
    expect(migration).toContain(
      "revoke create on schema careslink_v1_generation",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)[\s\S]{0,180}\bto\s+(?:anon|authenticated|service_role|authenticator)\b/i,
    );
  });
});

function section(startMarker: string, endMarker: string) {
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Missing section: ${startMarker}`);
  return migration.slice(start, end);
}

function functionSection(signature: string, dollarTag: string) {
  const start = migration.indexOf(`create function\n  ${signature}`);
  const replaceStart = migration.indexOf(
    `create or replace function\n  ${signature}`,
  );
  const resolvedStart = start >= 0 ? start : replaceStart;
  const firstTag = migration.indexOf(dollarTag, resolvedStart);
  const end = migration.indexOf(dollarTag, firstTag + dollarTag.length);
  if (resolvedStart < 0 || firstTag < 0 || end < 0) {
    throw new Error(`Missing function: ${signature}`);
  }
  return migration.slice(resolvedStart, end + dollarTag.length);
}
