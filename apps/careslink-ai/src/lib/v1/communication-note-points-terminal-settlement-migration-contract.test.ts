import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260902121601_add_v1_communication_note_points_terminal_settlement.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");

const settlementRole =
  "careslink_v1_generation_points_settlement_executor";

describe("Communication Note atomic Points terminal settlement migration contract", () => {
  it("is transactional, source-only, default-off, and does not activate generation", () => {
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/);
    expect(migration).toMatch(
      /Atomic terminal settlement[\s\S]{0,120}Communication Note Points/i,
    );
    expect(migration).toMatch(/source-only/i);
    expect(migration).toMatch(/default-off/i);
    expect(migration).not.toMatch(/\benabled\s*=\s*true\b/i);
    expect(migration).not.toMatch(
      /\b(?:fetch|https?|provider_api_call|model invocation)\b/i,
    );
    expect(migration).not.toMatch(/\b(?:pointsAdmission|pointsSettlement)\b/);
  });

  it("uses a purpose-only NOLOGIN role and removes every migration-added SET edge", () => {
    const purposeRoles = [
      "careslink_v1_generation_owner",
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner_api_executor",
      "careslink_v1_generation_points_admission_executor",
      settlementRole,
    ];
    expect(new Set(purposeRoles).size).toBe(purposeRoles.length);
    for (const role of purposeRoles) {
      expect(Buffer.byteLength(role, "utf8")).toBeLessThanOrEqual(63);
    }
    expect(migration).toMatch(
      /create role careslink_v1_generation_points_settlement_executor\s+with nologin nosuperuser nocreatedb nocreaterole noinherit\s+noreplication nobypassrls;/,
    );
    for (const role of purposeRoles) {
      expect(migration).toContain(
        "grant " +
          role +
          " to current_user\n  with admin false, inherit false, set true\n  granted by current_user;",
      );
      expect(migration).toContain(
        "revoke " + role + "\n  from current_user granted by current_user;",
      );
    }
    expect(migration).not.toMatch(/\breset role\b/i);
    expect(migration).toContain(
      "pg_catalog.current_setting('careslink.migration_entry_role')",
    );
    expect(
      migration.match(
        /grant careslink_v1_generation_points_settlement_executor to [a-z_]+/g,
      ),
    ).toEqual([
      "grant careslink_v1_generation_points_settlement_executor to current_user",
    ]);
    expect(migration).not.toMatch(
      /grant careslink_v1_generation_points_settlement_executor to (?:anon|authenticated|service_role|authenticator|careslink_v1_generation_owner|careslink_v1_generation_executor|careslink_v1_generation_owner_api_executor)/,
    );
  });

  it("creates an immutable forced-RLS one-to-one settlement record", () => {
    const table = section(
      "careslink_v1_generation.communication_note_point_settlements (",
      "create index communication_note_point_settlements",
    );
    expect(table).toContain("unique (job_id)");
    expect(table).toContain("unique (reservation_id)");
    expect(table).toContain("unique (ledger_entry_id)");
    expect(table).toContain("unique (id, job_id, owner_user_id)");
    expect(table).toMatch(
      /foreign key \(job_id, owner_user_id\)[\s\S]{0,200}references careslink_v1_generation\.jobs\(id, owner_user_id\)/,
    );
    expect(table).toMatch(
      /foreign key \(reservation_id, owner_user_id\)[\s\S]{0,200}references public\.point_reservations\(id, owner_user_id\)/,
    );
    expect(table).toMatch(
      /foreign key \(ledger_entry_id\)[\s\S]{0,120}references public\.point_ledger_entries\(id\)/,
    );
    expect(table).toMatch(
      /points = 20[\s\S]{0,120}allocation_points = 20[\s\S]{0,120}restored_points in \(0, 20\)/,
    );
    expect(migration).toContain(
      "communication_note_point_settlements\n  force row level security;",
    );
  });

  it("installs owner-scoped RLS and column-granular Points privileges", () => {
    for (const relation of [
      "communication_note_point_admissions",
      "communication_note_point_settlements",
      "jobs",
      "point_reservations",
      "point_reservation_allocations",
      "point_ledger_entries",
      "point_lots",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          "create policy [a-z0-9_]*points_settlement[a-z0-9_]*\\s+" +
            "on (?:careslink_v1_generation|public)\\." +
            relation +
            "[\\s\\S]{0,800}to " +
            settlementRole +
            "[\\s\\S]{0,800}careslink\\.v1_generation_owner_user_id",
        ),
      );
    }
    expect(migration).toMatch(
      /grant update \(status, result_ref, reason_code, terminal_at\)\s+on table public\.point_reservations\s+to careslink_v1_generation_points_settlement_executor;/,
    );
    expect(migration).toMatch(
      /grant update \(remaining_points\) on table public\.point_lots\s+to careslink_v1_generation_points_settlement_executor;/,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:all|delete|truncate)[\s\S]{0,260}\bto careslink_v1_generation_points_settlement_executor\b/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)[\s\S]{0,240}\bto\s+(?:anon|authenticated|service_role|authenticator)\b/i,
    );

    const recoveryTurns = section(
      "careslink_v1_generation.communication_note_paid_recovery_turns (",
      "alter table careslink_v1_generation.communication_note_paid_recovery_turns\n  enable row level security;",
    );
    expect(recoveryTurns).toContain(
      "registration_digest pg_catalog.text primary key",
    );
    expect(recoveryTurns).toContain("paid_first pg_catalog.bool not null");
    expect(recoveryTurns).toContain("running_first pg_catalog.bool not null");
    expect(recoveryTurns).toMatch(
      /foreign key \(registration_digest\)[\s\S]{0,180}references careslink_v1_generation\.worker_registrations/,
    );
    expect(migration).toContain(
      "communication_note_paid_recovery_turns\n  force row level security;",
    );
    for (const operation of ["select", "insert", "update"]) {
      expect(migration).toMatch(
        new RegExp(
          "create policy communication_note_recovery_turns_executor_" +
            operation +
            "[\\s\\S]{0,180}to careslink_v1_generation_executor",
        ),
      );
    }
    expect(migration).toMatch(
      /grant insert \(\s*registration_digest,\s+paid_first,\s+running_first,\s+created_at,\s+updated_at,\s+shadow_only\s*\)[\s\S]{0,180}communication_note_paid_recovery_turns[\s\S]{0,100}to careslink_v1_generation_executor/,
    );
    expect(migration).toMatch(
      /grant update \(paid_first, running_first, updated_at\)[\s\S]{0,120}communication_note_paid_recovery_turns[\s\S]{0,100}to careslink_v1_generation_executor/,
    );
    expect(migration).toMatch(
      /revoke all on table\s+careslink_v1_generation\.communication_note_paid_recovery_turns[\s\S]{0,400}careslink_v1_generation_points_settlement_executor/,
    );
    expect(migration).toMatch(
      /create policy worker_policies_points_settlement_select\s+on careslink_v1_generation\.worker_policies\s+for select to careslink_v1_generation_points_settlement_executor\s+using \(\s*status = 'APPROVED'\s+and shadow_only is true\s*\);/,
    );
    expect(migration).toMatch(
      /grant select on table[\s\S]{0,500}careslink_v1_generation\.worker_policies[\s\S]{0,100}to careslink_v1_generation_points_settlement_executor;/,
    );
  });

  it("replaces admission quarantine with paid terminal coordination and deferred consistency", () => {
    expect(migration).toContain(
      "drop trigger jobs_communication_note_point_marker_guard",
    );
    expect(migration).toContain(
      "drop trigger attempts_communication_note_paid_admission_gate",
    );
    expect(migration).toMatch(
      /create (?:constraint )?trigger\s+[a-z0-9_]*terminal[a-z0-9_]*[\s\S]{0,500}on careslink_v1_generation\.jobs/,
    );
    expect(migration).toMatch(
      /create trigger jobs_communication_note_point_terminal_coordinator\s+before update\s+on careslink_v1_generation\.jobs/,
    );
    expect(migration).not.toMatch(
      /create trigger jobs_communication_note_point_terminal_coordinator\s+before update of\b/,
    );
    expect(migration).toMatch(
      /create (?:constraint )?trigger\s+[a-z0-9_]*paid[a-z0-9_]*terminal[a-z0-9_]*[\s\S]{0,500}on careslink_v1_generation\.attempts/,
    );
    expect(migration).toMatch(
      /create constraint trigger\s+[a-z0-9_]*settlements[a-z0-9_]*consistency[a-z0-9_]*[\s\S]{0,400}deferrable initially deferred/,
    );
    expect(migration).toMatch(
      /create trigger [a-z0-9_]*settlements[a-z0-9_]*immutable[a-z0-9_]*[\s\S]{0,300}(?:update or delete|delete or update)/,
    );
    expect(migration).toContain(
      "point_reservations_communication_note_paid_admission_gate",
    );
    const triggerAttachment = section(
      "-- Attach the terminal-aware guards after all helper identities exist.",
      "create trigger jobs_communication_note_point_terminal_coordinator",
    );
    const entryRoleReset = triggerAttachment.indexOf(
      "select pg_catalog.set_config(\n  'role',",
    );
    const triggerGrant = triggerAttachment.indexOf(
      "grant trigger on table public.point_reservations\n  to careslink_v1_generation_points_settlement_executor;",
    );
    const settlementRoleSwitch = triggerAttachment.indexOf(
      "set role careslink_v1_generation_points_settlement_executor;",
    );
    const reservationTrigger = triggerAttachment.indexOf(
      "create trigger point_reservations_communication_note_paid_admission_gate",
    );
    expect(entryRoleReset).toBeGreaterThan(-1);
    expect(triggerGrant).toBeGreaterThan(entryRoleReset);
    expect(settlementRoleSwitch).toBeGreaterThan(triggerGrant);
    expect(reservationTrigger).toBeGreaterThan(settlementRoleSwitch);
    const coordinator = functionSection(
      "careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal()",
    );
    expect(coordinator).toMatch(
      /new\.status is not distinct from old\.status[\s\S]{0,180}old\.status in \('SUCCEEDED', 'FAILED', 'CANCELLED'\)[\s\S]{0,180}new is distinct from old[\s\S]{0,180}message = 'IMMUTABLE_TERMINAL'/,
    );
  });

  it("defines exact settlement and aggregate assertion helpers", () => {
    const settlement = functionSection(
      "careslink_v1_generation._settle_v1_shadow_communication_note_points(",
    );
    expect(settlement).toMatch(
      /p_job_id pg_catalog\.uuid,[\s\S]{0,120}p_target_status pg_catalog\.text,[\s\S]{0,120}p_target_attempt_count pg_catalog\.int4,[\s\S]{0,180}p_result_document_id pg_catalog\.uuid,[\s\S]{0,180}p_result_revision_id pg_catalog\.uuid,[\s\S]{0,180}p_result_content_hash pg_catalog\.text,[\s\S]{0,180}p_reason_code pg_catalog\.text/,
    );
    expect(settlement).toMatch(
      /from careslink_v1_generation\.jobs as job[\s\S]{0,180}for update;/,
    );
    expect(settlement).toContain(
      "careslink_v1_generation.communication_note_point_admissions",
    );
    expect(settlement).toContain("public.point_reservations");
    expect(settlement).toContain(
      "pg_catalog.date_trunc(\n    'milliseconds',\n    pg_catalog.clock_timestamp()\n  )",
    );
    expect(settlement).not.toMatch(/p_(?:now|at|terminal_at)\b/);
    expect(settlement).toContain(
      "_new_communication_note_point_settlement_uuid()",
    );
    expect(settlement).not.toContain("extensions.gen_random_uuid()");
    expect(settlement).toContain("'COMMIT'");
    expect(settlement).toContain("'RELEASE'");
    expect(settlement).toContain("message = 'INTERNAL_FAILURE'");
    expect(settlement).toMatch(
      /order by[\s\S]{0,240}(?:allocation\.lot_id|lot\.id)[\s\S]{0,100}for update/,
    );

    const assertion = functionSection(
      "careslink_v1_generation._assert_v1_shadow_communication_note_point_state(",
    );
    for (const marker of [
      "communication_note_point_admissions",
      "communication_note_point_settlements",
      "point_reservations",
      "point_reservation_allocations",
      "point_ledger_entries",
      "'RESERVED'",
      "'COMMITTED'",
      "'RELEASED'",
      "'COMMIT'",
      "'RELEASE'",
    ]) {
      expect(assertion).toContain(marker);
    }
  });

  it("keeps every new cross-role helper SECURITY DEFINER with an empty search path", () => {
    for (const helper of [
      "careslink_v1_generation._settle_v1_shadow_communication_note_points(",
      "careslink_v1_generation._assert_v1_shadow_communication_note_point_state(",
      "careslink_v1_generation._enforce_v1_shadow_communication_note_point_settlement()",
      "careslink_v1_generation._deny_v1_shadow_communication_note_point_settlement_mutation()",
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()",
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt()",
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_payload_grant()",
      "careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal()",
      "careslink_v1_generation._communication_note_paid_reservation_expires_at(",
      "careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(",
      "careslink_v1_generation._new_communication_note_point_settlement_uuid()",
      "careslink_v1_generation._communication_note_point_settlement_sha256_text(",
      "careslink_v1_generation._communication_note_point_settlement_content_sha256(",
      "careslink_v1_generation._communication_note_job_has_point_admission(",
    ]) {
      const sql = functionSection(helper);
      const bodyStart = sql.search(/\bas\s+\$[a-z0-9_]*\$/i);
      expect(bodyStart).toBeGreaterThan(-1);
      const header = sql.slice(0, bodyStart);
      expect(header).toContain("security definer");
      expect(header).toContain("set search_path = ''");
    }

    const uuidHelper = functionSection(
      "careslink_v1_generation._new_communication_note_point_settlement_uuid()",
    );
    const textHashHelper = functionSection(
      "careslink_v1_generation._communication_note_point_settlement_sha256_text(",
    );
    const contentHashHelper = functionSection(
      "careslink_v1_generation._communication_note_point_settlement_content_sha256(",
    );
    expect(uuidHelper).toContain("select extensions.gen_random_uuid()");
    expect(textHashHelper).toContain(
      "select careslink_v1_generation._sha256_text(p_value)",
    );
    expect(contentHashHelper).toContain(
      "select public.v1_shadow_content_sha256(p_value)",
    );
    const firstNarrowHelper = migration.indexOf("create function", migration.indexOf(
      "_new_communication_note_point_settlement_uuid()",
    ) - 40);
    const helperOwnerSwitch = migration.lastIndexOf(
      "set role careslink_v1_generation_executor;",
      firstNarrowHelper,
    );
    const helperOwnerReset = migration.indexOf(
      "select pg_catalog.set_config(\n  'role',",
      firstNarrowHelper,
    );
    expect(helperOwnerSwitch).toBeGreaterThan(-1);
    expect(helperOwnerSwitch).toBeLessThan(firstNarrowHelper);
    expect(helperOwnerReset).toBeGreaterThan(firstNarrowHelper);
    const helperOwnerBlock = migration.slice(
      helperOwnerSwitch,
      helperOwnerReset,
    );
    for (const narrowHelper of [
      "_new_communication_note_point_settlement_uuid()",
      "_communication_note_point_settlement_sha256_text(\n    pg_catalog.text\n  )",
      "_communication_note_point_settlement_content_sha256(\n    pg_catalog.jsonb\n  )",
    ]) {
      expect(helperOwnerBlock).toContain(narrowHelper);
    }
    expect(helperOwnerBlock).toMatch(
      /grant execute on function[\s\S]{0,600}_new_communication_note_point_settlement_uuid\(\)[\s\S]{0,600}_communication_note_point_settlement_sha256_text\([\s\S]{0,200}_communication_note_point_settlement_content_sha256\([\s\S]{0,300}to careslink_v1_generation_points_settlement_executor;/,
    );
    const schemaCreateGrantOwner = migration.indexOf(
      "set role careslink_v1_generation_owner;\n" +
        "grant create on schema careslink_v1_generation\n",
    );
    const schemaCreateGrant = migration.indexOf(
      "grant create on schema careslink_v1_generation\n",
      schemaCreateGrantOwner,
    );
    const schemaCreateGrantEnd = migration.indexOf(";", schemaCreateGrant);
    const schemaCreateRevokeOwner = migration.indexOf(
      "set role careslink_v1_generation_owner;\n" +
        "revoke create on schema careslink_v1_generation\n",
      helperOwnerReset,
    );
    const schemaCreateRevoke = migration.indexOf(
      "revoke create on schema careslink_v1_generation\n",
      schemaCreateRevokeOwner,
    );
    const schemaCreateRevokeEnd = migration.indexOf(";", schemaCreateRevoke);
    expect(schemaCreateGrantOwner).toBeGreaterThan(-1);
    expect(schemaCreateGrant).toBeGreaterThan(schemaCreateGrantOwner);
    expect(schemaCreateGrant).toBeLessThan(helperOwnerSwitch);
    expect(schemaCreateRevokeOwner).toBeGreaterThan(helperOwnerReset);
    expect(schemaCreateRevoke).toBeGreaterThan(schemaCreateRevokeOwner);
    expect(schemaCreateGrantEnd).toBeGreaterThan(schemaCreateGrant);
    expect(schemaCreateRevokeEnd).toBeGreaterThan(schemaCreateRevoke);
    const schemaCreateGrantSql = migration.slice(
      schemaCreateGrant,
      schemaCreateGrantEnd + 1,
    );
    const schemaCreateRevokeSql = migration.slice(
      schemaCreateRevoke,
      schemaCreateRevokeEnd + 1,
    );
    for (const transientCreator of [
      "careslink_v1_generation_points_settlement_executor",
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner_api_executor",
    ]) {
      expect(schemaCreateGrantSql).toContain(transientCreator);
      expect(schemaCreateRevokeSql).toContain(transientCreator);
    }
    expect(
      migration.match(/grant create on schema careslink_v1_generation\b/g),
    ).toHaveLength(1);
    expect(
      migration.match(/revoke create on schema careslink_v1_generation\b/g),
    ).toHaveLength(1);
    expect(
      migration.indexOf(
        "grant create on schema careslink_v1_generation",
        schemaCreateRevokeEnd,
      ),
    ).toBe(-1);
    expect(migration).not.toMatch(
      /grant usage on schema[^;]*\bextensions\b[^;]*to careslink_v1_generation_points_settlement_executor;/,
    );
    expect(migration).not.toMatch(
      /grant execute on function\s+(?:extensions\.gen_random_uuid\(\)|public\.v1_shadow_content_sha256\(pg_catalog\.jsonb\)|careslink_v1_generation\._sha256_text\(pg_catalog\.text\))\s+to careslink_v1_generation_points_settlement_executor;/,
    );
  });

  it("keeps unpaid attempt and payload-grant triggers outside settlement RLS", () => {
    const markerHelper = functionSection(
      "careslink_v1_generation._communication_note_job_has_point_admission(",
    );
    expect(markerHelper).toMatch(
      /p_job_id pg_catalog\.uuid,[\s\S]{0,100}p_owner_user_id pg_catalog\.uuid[\s\S]{0,100}returns pg_catalog\.bool/,
    );
    expect(markerHelper).toContain("security definer");
    expect(markerHelper).toContain("set search_path = ''");
    expect(markerHelper).toMatch(
      /select job\.communication_note_point_admission_id[\s\S]{0,180}from careslink_v1_generation\.jobs as job[\s\S]{0,180}job\.id = p_job_id[\s\S]{0,180}job\.owner_user_id = p_owner_user_id/,
    );
    expect(markerHelper).toMatch(
      /if not found then[\s\S]{0,180}message = 'INTERNAL_FAILURE'/,
    );
    expect(markerHelper).toContain(
      "return v_point_admission_id is not null;",
    );
    const helperStart = migration.indexOf(
      "create function\n  careslink_v1_generation._communication_note_job_has_point_admission(",
    );
    const helperOwnerSwitch = migration.lastIndexOf(
      "set role careslink_v1_generation_executor;",
      helperStart,
    );
    const helperOwnerReset = migration.indexOf(
      "select pg_catalog.set_config(\n  'role',",
      helperStart,
    );
    expect(helperStart).toBeGreaterThan(-1);
    expect(helperOwnerSwitch).toBeGreaterThan(-1);
    expect(helperOwnerSwitch).toBeLessThan(helperStart);
    expect(helperOwnerReset).toBeGreaterThan(helperStart);
    const helperOwnerBlock = migration.slice(
      helperOwnerSwitch,
      helperOwnerReset,
    );
    expect(helperOwnerBlock).toMatch(
      /grant execute on function[\s\S]{0,1600}_communication_note_job_has_point_admission\([\s\S]{0,160}to careslink_v1_generation_points_settlement_executor;/,
    );
    expect(migration).toMatch(
      /revoke all on function[\s\S]{0,1600}_communication_note_job_has_point_admission\([\s\S]{0,600}from public, anon, authenticated, service_role, authenticator,[\s\S]{0,300}careslink_v1_generation_owner_api_executor/,
    );
    expect(migration).not.toMatch(
      /grant execute on function[\s\S]{0,240}_communication_note_job_has_point_admission\([\s\S]{0,160}to (?:public|anon|authenticated|service_role|authenticator);/,
    );

    for (const guardName of [
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt()",
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_payload_grant()",
    ]) {
      const guard = functionSection(guardName);
      const setOwner = guard.indexOf(
        "careslink_v1_generation._set_owner(new.owner_user_id)",
      );
      const markerProbe = guard.indexOf(
        "careslink_v1_generation._communication_note_job_has_point_admission(",
        setOwner,
      );
      const settlementJobRead = guard.indexOf(
        "from careslink_v1_generation.jobs as job",
        markerProbe,
      );
      expect(setOwner).toBeGreaterThan(-1);
      expect(markerProbe).toBeGreaterThan(setOwner);
      expect(settlementJobRead).toBeGreaterThan(markerProbe);
      expect(guard.slice(setOwner, settlementJobRead)).toMatch(
        /if not[\s\S]{0,240}then[\s\S]{0,120}return new;/,
      );
    }
  });

  it("commits success to one deterministic result and releases exact allocation provenance", () => {
    const settlement = functionSection(
      "careslink_v1_generation._settle_v1_shadow_communication_note_points(",
    );
    expect(settlement).toContain(
      "v_terminal_reservation_status := 'COMMITTED'",
    );
    expect(settlement).toMatch(
      /set constraints\s+careslink_v1_generation\.communication_note_point_settlements_consistency_trigger\s+deferred;/,
    );
    expect(settlement).toContain("v_terminal_event := 'COMMIT'");
    expect(settlement).toContain("v_result_ref := 'note-generation:' ||");
    for (const resultComponent of [
      "v_job.id::pg_catalog.text",
      "v_attempt_id::pg_catalog.text",
      "p_result_document_id::pg_catalog.text",
      "p_result_revision_id::pg_catalog.text",
      "p_result_content_hash",
      "v_transaction_id::pg_catalog.text",
    ]) {
      expect(settlement).toContain(resultComponent);
    }
    for (const creationTimeDocumentProjection of [
      "document.current_revision_id = p_result_revision_id",
      "document.current_revision_number = 1",
      "document.lifecycle_status = 'IN_PROGRESS'",
      "document.updated_at = v_settled_at",
    ]) {
      expect(settlement).toContain(creationTimeDocumentProjection);
      expect(
        functionSection(
          "careslink_v1_generation._assert_v1_shadow_communication_note_point_state(",
        ),
      ).not.toContain(creationTimeDocumentProjection);
      expect(migration.split(creationTimeDocumentProjection)).toHaveLength(2);
    }
    expect(settlement).toContain(
      "v_terminal_reservation_status := 'RELEASED'",
    );
    expect(settlement).toContain("v_terminal_event := 'RELEASE'");
    expect(settlement).toMatch(
      /from public\.point_reservation_allocations as allocation[\s\S]{0,500}order by allocation\.lot_id[\s\S]{0,120}for update of lot/,
    );
    expect(settlement).toMatch(
      /set remaining_points = lot\.remaining_points \+ v_allocation\.points[\s\S]{0,300}lot\.remaining_points \+ v_allocation\.points <= lot\.original_points/,
    );
    expect(settlement).toMatch(
      /insert into public\.point_ledger_entries[\s\S]{0,1200}case when v_terminal_event = 'COMMIT' then 0 else 20 end/,
    );
    expect(settlement).toMatch(
      /update public\.point_reservations[\s\S]{0,500}and reservation\.status = 'RESERVED'/,
    );
    const postLockClock = settlement.indexOf(
      "v_now := pg_catalog.date_trunc(",
    );
    const workerPolicyRead = settlement.indexOf(
      "from careslink_v1_generation.worker_policies as policy",
    );
    const successAuthority = settlement.indexOf(
      "if p_target_status = 'SUCCEEDED' then",
      postLockClock,
    );
    const successAuthorityEnd = settlement.indexOf(
      "if not exists (",
      successAuthority,
    );
    const successAuthorityGate = settlement.slice(
      successAuthority,
      successAuthorityEnd,
    );
    expect(postLockClock).toBeGreaterThan(-1);
    expect(workerPolicyRead).toBeGreaterThan(
      settlement.indexOf("from public.point_reservations as reservation"),
    );
    expect(workerPolicyRead).toBeLessThan(postLockClock);
    expect(settlement.slice(workerPolicyRead, postLockClock)).toContain(
      "policy.status = 'APPROVED'",
    );
    expect(settlement.slice(workerPolicyRead, postLockClock)).toContain(
      "policy.shadow_only is true",
    );
    expect(successAuthority).toBeGreaterThan(postLockClock);
    for (const liveAuthorityProof of [
      "v_reservation.expires_at <\n        v_now + v_policy.commit_safety_margin_ms",
      "v_attempt.lease_expires_at is null",
      "v_attempt.lease_expires_at <\n        v_now + v_policy.commit_safety_margin_ms",
      "v_attempt.fence_id is null",
      "v_attempt.fence_digest is null",
      "v_attempt.fence_expires_at is null",
      "v_attempt.fence_expires_at <\n        v_now + v_policy.commit_safety_margin_ms",
      "message = 'LEASE_EXPIRED'",
    ]) {
      expect(successAuthorityGate).toContain(liveAuthorityProof);
    }
  });

  it("reads settlement wall time only after the job, owner, reservation, and allocation evidence", () => {
    const settlement = functionSection(
      "careslink_v1_generation._settle_v1_shadow_communication_note_points(",
    );
    const clock = settlement.indexOf("pg_catalog.clock_timestamp()");
    expect(clock).toBeGreaterThan(
      settlement.indexOf("from careslink_v1_generation.jobs as job"),
    );
    expect(clock).toBeGreaterThan(
      settlement.indexOf("pg_catalog.pg_advisory_xact_lock("),
    );
    expect(clock).toBeGreaterThan(
      settlement.indexOf("from public.point_reservations as reservation"),
    );
    expect(clock).toBeGreaterThan(
      settlement.indexOf(
        "from public.point_reservation_allocations as allocation",
      ),
    );
    expect(settlement.slice(0, clock)).not.toContain("clock_timestamp()");
  });

  it("asserts exact Points state on success, failure, and owner response-loss replay without changing their JSON", () => {
    for (const wrapper of [
      {
        name: "careslink_v1_generation._success_envelope(",
        predecessor: "_success_envelope_without_point_assertion(",
      },
      {
        name: "careslink_v1_generation._failure_envelope(",
        predecessor: "_failure_envelope_without_point_assertion(",
      },
      {
        name: "careslink_v1_generation._owner_api_job_view(",
        predecessor: "_owner_api_job_view_without_point_assertion(",
      },
    ]) {
      const sql = functionSection(wrapper.name);
      expect(sql).toContain(wrapper.predecessor);
      expect(sql).toContain(
        "_assert_v1_shadow_communication_note_point_state(",
      );
      expect(sql).toContain("return v_result;");
      expect(sql).not.toMatch(/'pointsAdmission'|'pointsSettlement'/);
      const predecessor = sql.indexOf(wrapper.predecessor);
      const paidMarker = sql.indexOf(
        "communication_note_point_admission_id",
        predecessor,
      );
      const paidAssertion = sql.indexOf(
        "_assert_v1_shadow_communication_note_point_state(",
        paidMarker,
      );
      expect(predecessor).toBeGreaterThan(-1);
      expect(paidMarker).toBeGreaterThan(predecessor);
      expect(paidAssertion).toBeGreaterThan(paidMarker);
      expect(sql.slice(paidMarker, paidAssertion)).toMatch(/is not null[\s\S]*then/);
      expect(sql.indexOf("return v_result;", paidAssertion)).toBeGreaterThan(
        paidAssertion,
      );
    }

    const admission = functionSection(
      "careslink_v1_generation.admit_and_reserve_v1_shadow_communication_note_generation_job(",
    );
    const paidBinding = admission.indexOf(
      "_reserve_and_bind_v1_shadow_communication_note_points(",
    );
    const boundAssertion = admission.indexOf(
      "_assert_v1_shadow_communication_note_point_state(",
      paidBinding,
    );
    expect(paidBinding).toBeGreaterThan(-1);
    expect(boundAssertion).toBeGreaterThan(paidBinding);
    expect(admission.slice(paidBinding, boundAssertion)).toContain(
      "if v_points is null",
    );
    const persistedMarkerRead = admission.indexOf(
      "select job.communication_note_point_admission_id",
      paidBinding,
    );
    const persistedMarkerGate = admission.indexOf(
      "v_point_admission_id is null",
      persistedMarkerRead,
    );
    expect(persistedMarkerRead).toBeGreaterThan(paidBinding);
    expect(persistedMarkerRead).toBeLessThan(boundAssertion);
    expect(
      admission.slice(persistedMarkerRead, persistedMarkerGate),
    ).toMatch(
      /from careslink_v1_generation\.jobs as job[\s\S]*job\.id = v_job_id[\s\S]*job\.owner_user_id = p_owner_user_id/,
    );
    expect(persistedMarkerGate).toBeGreaterThan(persistedMarkerRead);
    expect(persistedMarkerGate).toBeLessThan(boundAssertion);
    expect(
      admission.slice(persistedMarkerGate, boundAssertion),
    ).toContain("message = 'IDENTITY_LINK_CONFLICT'");

    const assertion = functionSection(
      "careslink_v1_generation._assert_v1_shadow_communication_note_point_state(",
    );
    expect(assertion).toMatch(
      /v_job\.status in \('QUEUED', 'RUNNING'\)[\s\S]{0,800}v_settlement_count is distinct from 0[\s\S]{0,300}v_terminal_ledger_count is distinct from 0/,
    );
    expect(assertion).toMatch(
      /v_job\.status not in \('SUCCEEDED', 'FAILED', 'CANCELLED'\)[\s\S]{0,500}v_settlement_count is distinct from 1[\s\S]{0,300}v_terminal_ledger_count is distinct from 1/,
    );
    for (const exactLink of [
      "v_settlement.admission_id is distinct from v_binding.id",
      "v_settlement.reservation_id is distinct from v_reservation.id",
      "v_settlement.job_status is distinct from v_job.status",
      "v_settlement.ledger_entry_id is distinct from v_terminal_ledger.id",
      "v_settlement.points is distinct from 20",
      "v_settlement.allocation_points is distinct from 20",
      "v_settlement.settled_at is distinct from v_job.finished_at",
    ]) {
      expect(assertion).toContain(exactLink);
    }

    const failureEnvelope = functionSection(
      "careslink_v1_generation._failure_envelope(",
    );
    expect(failureEnvelope.indexOf("_failure_envelope_without_point_assertion("))
      .toBeLessThan(
        failureEnvelope.indexOf(
          "_assert_v1_shadow_communication_note_point_state(",
        ),
      );
    expect(assertion).toMatch(
      /if p_attempt_id is not null then[\s\S]{0,500}attempt\.id = p_attempt_id[\s\S]{0,300}attempt\.job_id = v_job\.id[\s\S]{0,300}attempt\.owner_user_id = v_job\.owner_user_id/,
    );
    const suppliedAttemptStart = assertion.indexOf(
      "if p_attempt_id is not null then",
    );
    const jobStateStart = assertion.indexOf(
      "if v_job.status in ('QUEUED', 'RUNNING') then",
      suppliedAttemptStart,
    );
    const suppliedAttempt = assertion.slice(
      suppliedAttemptStart,
      jobStateStart,
    );
    for (const requiredHistoricalRetryProof of [
      "v_attempt.terminal_transaction_id is not null",
      "v_attempt.finished_at is not null",
      "v_attempt.settlement_base_delay_ms is not null",
      "v_attempt.settlement_jitter_ms is not null",
      "v_attempt.settlement_retry_delay_ms is not null",
      "'LEASE_EXPIRED'",
      "'PROVIDER_TIMEOUT'",
      "'PROVIDER_TRANSIENT'",
    ]) {
      expect(suppliedAttempt).toContain(requiredHistoricalRetryProof);
    }
    expect(suppliedAttempt).toMatch(
      /v_supplied_attempt_is_retry :=[\s\S]{0,1200}v_attempt\.status = case v_attempt\.failure_reason[\s\S]{0,100}when 'LEASE_EXPIRED' then 'LEASE_EXPIRED'[\s\S]{0,100}else 'FAILED'/,
    );
    expect(suppliedAttempt).toMatch(
      /v_attempt\.failure_reason in \([\s\S]{0,100}'LEASE_EXPIRED',[\s\S]{0,100}'PROVIDER_TIMEOUT',[\s\S]{0,100}'PROVIDER_TRANSIENT'/,
    );
    expect(assertion).toMatch(
      /p_attempt_id is not null[\s\S]{0,120}not v_supplied_attempt_is_retry[\s\S]{0,120}v_settlement\.attempt_id is distinct from p_attempt_id/,
    );
    expect(assertion).toMatch(
      /if v_settlement\.attempt_id is not null then[\s\S]{0,500}attempt\.id = v_settlement\.attempt_id[\s\S]{0,300}attempt\.job_id = v_job\.id/,
    );
  });

  it("unquarantines claim only for a live RESERVED twenty-Point binding", () => {
    const claim = functionSection(
      "careslink_v1_generation.claim_v1_shadow_note_generation_job(",
    );
    const eligibility = functionSection(
      "careslink_v1_generation._communication_note_paid_reservation_expires_at(",
    );
    const lock = functionSection(
      "careslink_v1_generation._lock_v1_shadow_communication_note_point_reservation(",
    );
    expect(claim).not.toContain(
      "job.communication_note_point_admission_id is null",
    );
    expect(claim).toContain(
      "_communication_note_paid_reservation_expires_at(",
    );
    expect(claim).toContain(
      "_lock_v1_shadow_communication_note_point_reservation(",
    );
    expect(claim).toMatch(
      /_communication_note_paid_reservation_expires_at\([\s\S]{0,180}\) - v_now >=[\s\S]{0,180}minimum_payload_remaining_at_claim_ms/,
    );
    expect(claim).toContain("for update of job skip locked");
    expect(claim).toMatch(
      /v_now := pg_catalog\.date_trunc\([\s\S]{0,160}pg_catalog\.clock_timestamp\(\)[\s\S]{0,500}if v_payload\.id is null/,
    );
    expect(claim).toMatch(
      /or \(\s*v_job\.communication_note_point_admission_id is not null\s*and \(\s*v_reservation_expires_at is null\s*or v_reservation_expires_at - v_now <[\s\S]{0,180}minimum_payload_remaining_at_claim_ms/,
    );
    expect(claim).toMatch(
      /else\s*v_reservation_expires_at := 'infinity'::pg_catalog\.timestamptz;\s*end if;[\s\S]{0,900}v_job\.communication_note_point_admission_id is not null[\s\S]{0,180}v_reservation_expires_at - v_now/,
    );
    expect(claim).toMatch(
      /v_lease_expires_at := least\([\s\S]{0,500}v_reservation_expires_at/,
    );
    for (const helper of [eligibility, lock]) {
      expect(helper).toContain(
        "careslink_v1_generation.communication_note_point_admissions",
      );
      expect(helper).toContain("public.point_reservations");
      expect(helper).toContain("reservation.status = 'RESERVED'");
      expect(helper).toContain("reservation.points = 20");
    }
    expect(eligibility).toContain(
      "reservation.service_code = 'note.communication.generate'",
    );
    expect(eligibility).toContain(
      "reservation.catalog_version = '2026-08-09.v1-shadow'",
    );
    expect(lock).toContain("for update of reservation");
    expect(claim).not.toMatch(/'pointsAdmission'|'pointsSettlement'/);
  });

  it("rechecks queue age and samples direct terminal writes after worker row locks", () => {
    const claim = functionSection(
      "careslink_v1_generation.claim_v1_shadow_note_generation_job(",
    );
    const finalClaimClock = claim.lastIndexOf(
      "v_now := pg_catalog.date_trunc(",
    );
    const queueAgeRecheck = claim.indexOf(
      "v_job.created_at +\n" +
        "      v_policy.max_queue_age_ms * interval '1 millisecond' <= v_now",
      finalClaimClock,
    );
    const idleAfterCrossing = claim.indexOf(
      "return pg_catalog.jsonb_build_object('status', 'IDLE', 'claim', null);",
      queueAgeRecheck,
    );
    const attemptInsert = claim.indexOf(
      "insert into careslink_v1_generation.attempts",
    );
    expect(claim).toContain(
      "v_policy.max_queue_age_ms * interval '1 millisecond' > v_now",
    );
    expect(finalClaimClock).toBeGreaterThan(
      claim.indexOf(
        "_lock_v1_shadow_communication_note_point_reservation(",
      ),
    );
    expect(queueAgeRecheck).toBeGreaterThan(finalClaimClock);
    expect(idleAfterCrossing).toBeGreaterThan(queueAgeRecheck);
    expect(attemptInsert).toBeGreaterThan(idleAfterCrossing);

    for (const terminal of [
      {
        name: "careslink_v1_generation.commit_v1_shadow_note_generation_success(",
        replay:
          "if v_job.status = 'SUCCEEDED' and v_attempt.status = 'SUCCEEDED' then",
      },
      {
        name: "careslink_v1_generation.settle_v1_shadow_note_generation_failure(",
        replay: "if v_attempt.status <> 'RUNNING' then",
      },
    ]) {
      const body = functionSection(terminal.name);
      const jobLock = body.indexOf(
        "from careslink_v1_generation.jobs as job",
      );
      const attemptLock = body.indexOf(
        "from careslink_v1_generation.attempts as attempt",
      );
      const replay = body.indexOf(terminal.replay);
      const payloadLock = body.indexOf(
        "from careslink_v1_generation.payloads as payload",
        replay,
      );
      const persistedClock = body.indexOf(
        "v_now := pg_catalog.date_trunc(",
        payloadLock,
      );
      const firstUuid = body.indexOf(
        "v_transaction_id := extensions.gen_random_uuid()",
      );
      expect(body).toMatch(/^create or replace function/);
      expect(body).toContain("volatile");
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(body).toContain("v_observed_at timestamptz;");
      expect(body).toContain("v_now timestamptz;");
      expect(body).not.toContain("_server_now()");
      expect(body.match(/\bv_now :=/g)).toHaveLength(1);
      expect(jobLock).toBeGreaterThan(0);
      expect(attemptLock).toBeGreaterThan(jobLock);
      expect(replay).toBeGreaterThan(attemptLock);
      expect(payloadLock).toBeGreaterThan(replay);
      expect(persistedClock).toBeGreaterThan(payloadLock);
      expect(firstUuid).toBeGreaterThan(persistedClock);
    }

    const success = functionSection(
      "careslink_v1_generation.commit_v1_shadow_note_generation_success(",
    );
    const successPayloadLock = success.indexOf(
      "from careslink_v1_generation.payloads as payload",
    );
    const successFinalClock = success.indexOf(
      "v_now := pg_catalog.date_trunc(",
      successPayloadLock,
    );
    const successFinalSessionCheck = success.indexOf(
      "if not careslink_v1_generation.fresh_session_is_active(",
      successFinalClock,
    );
    const successFirstUuid = success.indexOf(
      "v_transaction_id := extensions.gen_random_uuid()",
    );
    expect(successFinalSessionCheck).toBeGreaterThan(successFinalClock);
    expect(successFirstUuid).toBeGreaterThan(successFinalSessionCheck);

    for (const terminalName of [
      "commit_v1_shadow_note_generation_success",
      "settle_v1_shadow_note_generation_failure",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          "revoke all on function[\\s\\S]{0,1800}" +
            "careslink_v1_generation\\." +
            terminalName +
            "\\([\\s\\S]{0,1200}from public, anon, authenticated, " +
            "service_role, authenticator,[\\s\\S]{0,400}" +
            "careslink_v1_generation_points_settlement_executor",
        ),
      );
    }
  });

  it("settles denied authority from one fresh clock after its complete active lock set", () => {
    expect(migration).toContain(
      "careslink_v1_generation._settle_denied_authority(uuid,uuid,uuid,text,text,timestamp with time zone)'\n" +
        "    ) is null",
    );
    const denied = functionSection(
      "careslink_v1_generation._settle_denied_authority(",
    );
    const jobLock = denied.indexOf(
      "from careslink_v1_generation.jobs as job",
    );
    const attemptLock = denied.indexOf(
      "from careslink_v1_generation.attempts as attempt",
    );
    const replay = denied.indexOf(
      "if v_job.status = 'FAILED' and v_attempt.status = 'FAILED' then",
    );
    const activeGate = denied.indexOf(
      "if v_job.status <> 'RUNNING' or v_attempt.status <> 'RUNNING' then",
    );
    const payloadLock = denied.indexOf(
      "from careslink_v1_generation.payloads as payload",
      activeGate,
    );
    const grantLock = denied.indexOf(
      "from careslink_v1_generation.payload_grants as grant_record",
      payloadLock,
    );
    const reservationLock = denied.indexOf(
      "_lock_v1_shadow_communication_note_point_reservation(",
      grantLock,
    );
    const outboxLock = denied.indexOf(
      "from careslink_v1_generation.payload_purge_outbox as outbox",
      reservationLock,
    );
    const finalClock = denied.indexOf(
      "v_now := pg_catalog.date_trunc(",
      outboxLock,
    );
    const firstUuid = denied.indexOf(
      "v_transaction_id := extensions.gen_random_uuid()",
    );

    expect(denied).toMatch(/^create or replace function/);
    expect(denied).toContain("returns jsonb");
    expect(denied).toContain("volatile");
    expect(denied).toContain("security invoker");
    expect(denied).toContain("set search_path = ''");
    expect(denied.match(/\bv_now :=/g)).toHaveLength(1);
    expect(jobLock).toBeGreaterThan(0);
    expect(attemptLock).toBeGreaterThan(jobLock);
    expect(replay).toBeGreaterThan(attemptLock);
    expect(activeGate).toBeGreaterThan(replay);
    const replayBlock = denied.slice(replay, activeGate);
    expect(replayBlock).not.toContain("clock_timestamp()");
    expect(replayBlock).not.toContain("gen_random_uuid()");
    expect(replayBlock).toContain(
      "_server_time(v_attempt.finished_at)",
    );
    expect(payloadLock).toBeGreaterThan(activeGate);
    expect(grantLock).toBeGreaterThan(payloadLock);
    expect(denied.slice(grantLock, reservationLock)).toMatch(
      /grant_record\.status = 'ISSUED'[\s\S]{0,100}order by grant_record\.id[\s\S]{0,80}for update;/,
    );
    expect(reservationLock).toBeGreaterThan(grantLock);
    expect(outboxLock).toBeGreaterThan(reservationLock);
    expect(denied.slice(outboxLock, finalClock)).toContain(
      "if v_outbox.id is not null then",
    );
    expect(denied.slice(outboxLock, finalClock)).not.toContain("for update;");
    expect(finalClock).toBeGreaterThan(outboxLock);
    expect(firstUuid).toBeGreaterThan(finalClock);

    const activeWrites = denied.slice(finalClock);
    expect(activeWrites).not.toMatch(/\bp_at\b/);
    expect(activeWrites).toContain("finished_at = v_now");
    expect(activeWrites).toContain("updated_at = v_now");
    expect(activeWrites).toMatch(
      /_enqueue_payload_purge\([\s\S]{0,300}'FAILED',[\s\S]{0,80}v_now/,
    );
    expect(activeWrites).toContain("_server_time(v_now)");
    expect(migration).toMatch(
      /revoke all on function[\s\S]{0,1800}_settle_denied_authority\([\s\S]{0,400}from public, anon, authenticated, service_role, authenticator,[\s\S]{0,500}careslink_v1_generation_points_settlement_executor/,
    );
    expect(
      section(
        "set role careslink_v1_generation_executor;\n\ncreate or replace function careslink_v1_generation._settle_denied_authority(",
        "create or replace function careslink_v1_generation.commit_v1_shadow_note_generation_success(",
      ),
    ).toContain("security invoker");
  });

  it("bounds paid attempts, fences, and payload grants by the same reservation expiry", () => {
    const attemptGuard = functionSection(
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_attempt()",
    );
    expect(attemptGuard).toContain("reservation.status is distinct from 'RESERVED'");
    expect(attemptGuard).toContain("v_reservation.points is distinct from 20");
    expect(attemptGuard).toMatch(
      /new\.lease_expires_at := least\([\s\S]{0,180}v_reservation\.expires_at/,
    );
    expect(attemptGuard).toMatch(
      /new\.fence_expires_at := least\([\s\S]{0,180}v_reservation\.expires_at/,
    );
    expect(attemptGuard).toContain("pg_catalog.clock_timestamp()");
    expect(attemptGuard).toMatch(
      /if new\.status = 'RUNNING' then[\s\S]{0,500}v_reservation\.expires_at <= v_now[\s\S]{0,180}new\.lease_expires_at is null[\s\S]{0,180}new\.lease_expires_at <= v_now[\s\S]{0,180}message = 'LEASE_EXPIRED'/,
    );
    expect(attemptGuard).toMatch(
      /if tg_op = 'UPDATE' then[\s\S]{0,300}old\.lease_expires_at is null[\s\S]{0,160}old\.lease_expires_at <= v_now[\s\S]{0,300}old\.fence_id is not null[\s\S]{0,160}old\.fence_digest is null[\s\S]{0,160}old\.fence_expires_at is null[\s\S]{0,160}old\.fence_expires_at <= v_now/,
    );
    expect(attemptGuard).toMatch(
      /new\.lease_expires_at := least\([\s\S]{0,180}new\.lease_expires_at,[\s\S]{0,180}v_reservation\.expires_at,[\s\S]{0,240}new\.fence_expires_at/,
    );

    const grantGuard = functionSection(
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_payload_grant()",
    );
    expect(grantGuard).toContain(
      "_lock_v1_shadow_communication_note_point_reservation(",
    );
    expect(grantGuard).toMatch(
      /new\.expires_at := least\([\s\S]{0,100}new\.expires_at,[\s\S]{0,100}v_reservation_expires_at,[\s\S]{0,100}v_attempt\.lease_expires_at/,
    );
    expect(grantGuard).toContain(
      "new.consumed_at >= v_reservation_expires_at",
    );
    expect(grantGuard).toContain("message = 'PAYLOAD_UNAVAILABLE'");
    expect(migration).toMatch(
      /create (?:constraint )?trigger\s+[a-z0-9_]*payload[a-z0-9_]*paid[a-z0-9_]*terminal[a-z0-9_]*[\s\S]{0,500}on careslink_v1_generation\.payload_grants/,
    );

    const authorize = functionSection(
      "careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(",
    );
    const insufficientProviderWindow = authorize.indexOf(
      "v_grant.expires_at - v_now <",
    );
    const deniedSettlement = authorize.indexOf(
      "careslink_v1_generation._settle_denied_authority(",
      insufficientProviderWindow,
    );
    const authorizedEnvelopeRewrite = authorize.indexOf(
      "v_result := pg_catalog.jsonb_set(",
    );
    expect(authorize).toContain(
      "_authorize_v1_shadow_note_generation_payload_attempt_unbounded(",
    );
    expect(authorize).toMatch(
      /v_grant\.expires_at - v_now <[\s\S]{0,180}v_policy\.provider_deadline_ms \+[\s\S]{0,100}v_policy\.commit_safety_margin_ms[\s\S]{0,100}\* interval '1 millisecond'/,
    );
    for (const boundedAuthority of [
      "v_grant.expires_at - v_now <",
      "v_reservation_expires_at - v_now <",
      "v_attempt.lease_expires_at - v_now <",
      "v_attempt.fence_expires_at - v_now <",
    ]) {
      const boundary = authorize.indexOf(boundedAuthority);
      expect(boundary).toBeGreaterThan(-1);
      expect(authorize.slice(boundary, boundary + 300)).toMatch(
        /v_policy\.provider_deadline_ms \+\s+v_policy\.commit_safety_margin_ms/,
      );
    }
    expect(authorize).toMatch(
      /v_attempt\.fence_id is null\s+and \(\s*v_attempt\.fence_digest is not null\s+or v_attempt\.fenced_at is not null\s+or v_attempt\.fence_expires_at is not null/,
    );
    expect(authorize).toMatch(
      /v_attempt\.fence_id is not null\s+and \(\s*v_attempt\.fence_digest is null\s+or v_attempt\.fenced_at is null\s+or v_attempt\.fence_expires_at is null[\s\S]{0,350}v_attempt\.fence_expires_at - v_now </,
    );
    expect(authorize).not.toMatch(
      /or v_attempt\.fence_id is null\s+or v_attempt\.fence_digest is null/,
    );
    expect(authorize.indexOf("_lock_v1_shadow_communication_note_point_reservation("))
      .toBeLessThan(authorize.indexOf("v_now := pg_catalog.date_trunc("));
    expect(insufficientProviderWindow).toBeGreaterThan(-1);
    expect(deniedSettlement).toBeGreaterThan(insufficientProviderWindow);
    expect(authorize.slice(deniedSettlement, authorizedEnvelopeRewrite)).toContain(
      "'PAYLOAD_UNAVAILABLE'",
    );
    expect(authorizedEnvelopeRewrite).toBeGreaterThan(deniedSettlement);

    const fence = functionSection(
      "careslink_v1_generation.fence_v1_shadow_note_generation_attempt(",
    );
    expect(migration).toContain(
      "rename to _fence_v1_shadow_note_generation_attempt_pre_points",
    );
    expect(fence).toContain(
      "_fence_v1_shadow_note_generation_attempt_pre_points(",
    );
    const fencePredecessor = fence.indexOf(
      "_fence_v1_shadow_note_generation_attempt_pre_points(",
    );
    const fenceAttemptLock = fence.indexOf("for update;", fencePredecessor);
    const fenceReservationLock = fence.indexOf(
      "_lock_v1_shadow_communication_note_point_reservation(",
      fenceAttemptLock,
    );
    const fenceClock = fence.indexOf(
      "v_now := pg_catalog.date_trunc(",
      fenceReservationLock,
    );
    expect(fencePredecessor).toBeGreaterThan(-1);
    expect(fenceAttemptLock).toBeGreaterThan(fencePredecessor);
    expect(fenceReservationLock).toBeGreaterThan(fenceAttemptLock);
    expect(fenceClock).toBeGreaterThan(fenceReservationLock);
    for (const freshFenceProof of [
      "v_reservation_expires_at <\n      v_now + v_policy.commit_safety_margin_ms",
      "v_attempt.lease_expires_at <\n      v_now + v_policy.commit_safety_margin_ms",
      "v_attempt.fence_expires_at <\n      v_now + v_policy.commit_safety_margin_ms",
      "message = 'LEASE_EXPIRED'",
      "'fenceId', v_attempt.fence_id",
      "'fenceDigest', v_attempt.fence_digest",
      "_server_time(v_attempt.fence_expires_at)",
    ]) {
      expect(fence.slice(fenceClock)).toContain(freshFenceProof);
    }
  });

  it("retains RESERVED Points for retry and coordinates only actual job terminals", () => {
    const coordinator = functionSection(
      "careslink_v1_generation._coordinate_v1_shadow_communication_note_point_terminal()",
    );
    expect(coordinator).toContain("new.status");
    expect(coordinator).toContain("old.status");
    const retryStart = coordinator.indexOf(
      "old.status = 'RUNNING' and new.status = 'QUEUED'",
    );
    const claimStart = coordinator.indexOf(
      "old.status = 'QUEUED' and new.status = 'RUNNING'",
      retryStart,
    );
    expect(retryStart).toBeGreaterThan(-1);
    expect(claimStart).toBeGreaterThan(retryStart);
    const retry = coordinator.slice(retryStart, claimStart);
    expect(retry).toContain(
      "_assert_v1_shadow_communication_note_point_state(",
    );
    expect(retry).toContain("return new;");
    expect(retry).not.toContain(
      "_settle_v1_shadow_communication_note_points(",
    );
    expect(coordinator).toMatch(
      /new\.status in \('SUCCEEDED', 'FAILED', 'CANCELLED'\)[\s\S]{0,900}_settle_v1_shadow_communication_note_points/,
    );
    expect(coordinator).toMatch(
      /old\.status = 'QUEUED'[\s\S]{0,180}new\.status = 'FAILED'[\s\S]{0,180}new\.attempt_count is distinct from old\.attempt_count \+ 1/,
    );
    expect(coordinator).toMatch(
      /_settle_v1_shadow_communication_note_points\([\s\S]{0,180}old\.id,[\s\S]{0,100}new\.status,[\s\S]{0,100}new\.attempt_count,/,
    );
    const settlement = functionSection(
      "careslink_v1_generation._settle_v1_shadow_communication_note_points(",
    );
    expect(settlement).toMatch(
      /attempt\.attempt_number = p_target_attempt_count[\s\S]{0,180}attempt\.status = case p_target_status/,
    );
    expect(coordinator).not.toMatch(
      /new\.status\s*=\s*'QUEUED'[\s\S]{0,500}_settle_v1_shadow_communication_note_points/,
    );
    expect(coordinator).toContain(
      "new.status in ('SUCCEEDED', 'FAILED', 'CANCELLED')",
    );
    expect(coordinator).toContain(
      "_assert_v1_shadow_communication_note_point_state(",
    );
    expect(migration).not.toMatch(/'pointsAdmission'|'pointsSettlement'/);
  });

  it("recovers expired paid reservations without stranding a retry or changing the summary wire", () => {
    const recovery = functionSection(
      "careslink_v1_generation.recover_v1_shadow_note_generation_expired(",
    );
    const globalRecoveryLock = recovery.indexOf(
      "pg_catalog.hashtextextended(\n" +
        "      'careslink:v1:communication-note:points:paid-recovery',\n" +
        "      0\n" +
        "    )",
    );
    const firstCandidateScan = recovery.indexOf("for v_candidate in");
    expect(globalRecoveryLock).toBeGreaterThan(-1);
    expect(firstCandidateScan).toBeGreaterThan(globalRecoveryLock);
    expect(
      recovery.match(
        /careslink:v1:communication-note:points:paid-recovery/g,
      ),
    ).toHaveLength(1);
    const turnInsert = recovery.indexOf(
      "communication_note_paid_recovery_turns (",
    );
    const turnLock = recovery.indexOf("select turn.paid_first, turn.running_first", turnInsert);
    const turnFlip = recovery.indexOf(
      "set paid_first = not v_paid_turn",
      turnLock,
    );
    expect(turnInsert).toBeGreaterThan(globalRecoveryLock);
    expect(recovery.slice(turnInsert, turnLock)).toContain(
      "on conflict (registration_digest) do nothing",
    );
    expect(turnLock).toBeGreaterThan(turnInsert);
    expect(recovery.slice(turnLock, turnFlip)).toContain(
      "where turn.registration_digest = p_registration_digest",
    );
    expect(recovery.slice(turnLock, turnFlip)).toContain("for update");
    expect(turnFlip).toBeGreaterThan(turnLock);
    expect(recovery.slice(turnFlip, turnFlip + 320)).toContain(
      "and turn.paid_first = v_paid_turn",
    );
    const paidTurnFlip = recovery.indexOf(
      "set running_first = not v_paid_running_first",
      turnFlip,
    );
    expect(paidTurnFlip).toBeGreaterThan(turnFlip);
    expect(recovery.slice(paidTurnFlip, paidTurnFlip + 420)).toContain(
      "and turn.running_first = v_paid_running_first",
    );
    expect(recovery).toMatch(
      /select exists \([\s\S]{0,2400}job\.status = 'QUEUED'[\s\S]{0,1800}\) into v_has_paid_queued;[\s\S]{0,300}select exists \([\s\S]{0,1800}job\.status = 'RUNNING'[\s\S]{0,1800}\) into v_has_paid_running;/,
    );
    expect(recovery).toMatch(
      /if v_has_paid_queued and v_has_paid_running then[\s\S]{0,220}if v_paid_running_first then[\s\S]{0,300}v_running_limit :=[\s\S]{0,180}\(v_policy\.recovery_batch_limit \+ 1\) \/ 2;[\s\S]{0,240}else[\s\S]{0,240}v_queued_limit :=[\s\S]{0,180}\(v_policy\.recovery_batch_limit \+ 1\) \/ 2;/,
    );
    expect(recovery).toMatch(
      /elsif v_has_paid_queued then[\s\S]{0,160}v_queued_limit := v_policy\.recovery_batch_limit;[\s\S]{0,120}v_running_limit := 0;[\s\S]{0,160}elsif v_has_paid_running then[\s\S]{0,120}v_queued_limit := 0;[\s\S]{0,160}v_running_limit := v_policy\.recovery_batch_limit;/,
    );
    expect(recovery).toMatch(
      /if not v_paid_turn then[\s\S]{0,800}_recover_v1_shadow_note_generation_expired_unpaid\([\s\S]{0,1600}if \(v_unpaid->>'recovered'\)::pg_catalog\.int4 > 0 then\s+return v_unpaid;/,
    );
    expect(recovery).toMatch(
      /if v_recovered > 0 then[\s\S]{0,500}return pg_catalog\.jsonb_build_object[\s\S]{0,500}if v_unpaid is null then[\s\S]{0,500}_recover_v1_shadow_note_generation_expired_unpaid\(/,
    );
    expect(recovery).toMatch(
      /v_limit := least\(\s*greatest\(v_policy\.recovery_batch_limit - v_recovered, 0\),\s*v_running_limit \+ greatest\(v_queued_limit - v_recovered, 0\)\s*\)/,
    );
    expect(recovery).toMatch(
      /if v_limit = 0 and v_recovered > 0 then\s+return pg_catalog\.jsonb_build_object/,
    );
    expect(recovery).not.toMatch(
      /if v_limit = 0 then\s+return pg_catalog\.jsonb_build_object/,
    );
    expect(migration).toContain(
      "rename to _recover_v1_shadow_note_generation_expired_unpaid",
    );
    expect(recovery).toContain(
      "_recover_v1_shadow_note_generation_expired_unpaid(",
    );
    expect(recovery).toContain(
      "job.communication_note_point_admission_id is not null",
    );
    expect(
      recovery.match(
        /coalesce\(\s*careslink_v1_generation\._communication_note_paid_reservation_expires_at\([\s\S]{0,180}?\),\s*'-infinity'::pg_catalog\.timestamptz\s*\)\s*<\s*v_now\s*\+\s*v_policy\.minimum_payload_remaining_at_claim_ms\s*\*\s*interval '1 millisecond'/g,
      ),
    ).toHaveLength(2);
    expect(recovery).not.toMatch(
      /'-infinity'::pg_catalog\.timestamptz\s*\)\s*-\s*v_now/,
    );
    expect(recovery).toContain(
      "_lock_v1_shadow_communication_note_point_reservation(",
    );
    expect(recovery).toMatch(
      /set status = 'FAILED',[\s\S]{0,500}failure_reason = 'PAYLOAD_UNAVAILABLE'/,
    );
    expect(recovery).toMatch(
      /insert into careslink_v1_generation\.attempts[\s\S]{0,1000}v_job\.attempt_count \+ 1,[\s\S]{0,180}'FAILED'/,
    );
    expect(recovery).toMatch(
      /update careslink_v1_generation\.jobs as job[\s\S]{0,180}set status = 'FAILED',[\s\S]{0,180}attempt_count = v_job\.attempt_count \+ 1/,
    );
    expect(recovery).toMatch(
      /v_retry_allowed := v_terminal_reason = 'LEASE_EXPIRED'[\s\S]{0,1400}v_reservation_expires_at - v_next_eligible_at >=[\s\S]{0,300}minimum_payload_remaining_at_claim_ms/,
    );
    expect(recovery).toMatch(
      /if v_retry_allowed then[\s\S]{0,1800}set status = 'QUEUED'[\s\S]{0,1800}else[\s\S]{0,2000}set status = 'FAILED'/,
    );
    expect(recovery).toMatch(
      /return pg_catalog\.jsonb_build_object\([\s\S]{0,400}'recovered', v_recovered,[\s\S]{0,180}'requeued', v_requeued,[\s\S]{0,180}'failed', v_failed/,
    );
    expect(recovery).not.toMatch(/'pointsAdmission'|'pointsSettlement'/);
  });

  it("keeps generic Points commit/release denied and closes private ACLs", () => {
    const guard = functionSection(
      "careslink_v1_generation._guard_v1_shadow_communication_note_paid_reservation()",
    );
    expect(guard).toContain(
      "from careslink_v1_generation.communication_note_point_admissions",
    );
    expect(guard).toContain("v_owner_user_id := old.owner_user_id");
    expect(guard).toContain("v_reservation_id := old.id");
    expect(guard).toContain("message = 'PRODUCT_API_DISABLED'");
    expect(migration).not.toMatch(
      /create or replace function public\.(?:commit_shadow_points|release_shadow_points)/,
    );
    for (const helper of [
      "_settle_v1_shadow_communication_note_points",
      "_assert_v1_shadow_communication_note_point_state",
      "_enforce_v1_shadow_communication_note_point_settlement",
      "_deny_v1_shadow_communication_note_point_settlement_mutation",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          "revoke all on function\\s+careslink_v1_generation\\." + helper,
        ),
      );
    }
    for (const predecessor of [
      "_success_envelope_without_point_assertion",
      "_failure_envelope_without_point_assertion",
      "_recover_v1_shadow_note_generation_expired_unpaid",
      "_authorize_v1_shadow_note_generation_payload_attempt_unbounded",
      "_fence_v1_shadow_note_generation_attempt_pre_points",
      "_owner_api_job_view_without_point_assertion",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          "revoke all on function[\\s\\S]{0,1600}" +
            "careslink_v1_generation\\." +
            predecessor +
            "\\([\\s\\S]{0,1600}from public, anon, authenticated, " +
            "service_role, authenticator,[\\s\\S]{0,400}" +
            "careslink_v1_generation_points_settlement_executor",
        ),
      );
    }
    expect(migration).toContain(
      "revoke create on schema careslink_v1_generation",
    );
  });
});

function section(startMarker: string, endMarker: string) {
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error("Missing section: " + startMarker);
  return migration.slice(start, end);
}

function functionSection(functionName: string) {
  const escapedName = functionName.replace(
    /[.*+?^$()|[\]\\]/g,
    "\\$&",
  );
  const match = new RegExp(
    "create(?: or replace)? function\\s+" + escapedName,
  ).exec(migration);
  if (match === null) throw new Error("Missing function: " + functionName);
  const start = match.index;
  const header = migration.slice(start);
  const tagMatch = /\bas\s+(\$[a-z0-9_]*\$)/i.exec(header);
  if (tagMatch === null) throw new Error("Missing body tag: " + functionName);
  const tag = tagMatch[1];
  const bodyStart = start + (tagMatch.index ?? 0) + tagMatch[0].length;
  const end = migration.indexOf(tag + ";", bodyStart);
  if (end < 0) throw new Error("Missing function end: " + functionName);
  return migration.slice(start, end + tag.length + 1);
}
