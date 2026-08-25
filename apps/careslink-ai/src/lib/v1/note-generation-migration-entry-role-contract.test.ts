import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationCases = [
  {
    name: "durable foundation",
    path: "supabase/migrations/20260820135834_add_v1_note_generation_durable_shadow.sql",
    roles: ["careslink_v1_generation_owner"],
  },
  {
    name: "worker RPC",
    path: "supabase/migrations/20260821071044_add_v1_note_generation_worker_rpc_shadow.sql",
    roles: [
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner",
    ],
  },
  {
    name: "registration retention",
    path: "supabase/migrations/20260823213144_harden_v1_note_generation_registration_retention.sql",
    roles: ["careslink_v1_generation_owner"],
  },
  {
    name: "owner runtime",
    path: "supabase/migrations/20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql",
    roles: [
      "careslink_v1_generation_owner_api_executor",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner_api_executor",
      "careslink_v1_generation_owner",
    ],
  },
  {
    name: "registration retirement",
    path: "supabase/migrations/20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql",
    roles: [
      "careslink_v1_generation_registration_control_executor",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_registration_control_executor",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_registration_control_executor",
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner_api_executor",
      "careslink_v1_generation_registration_control_executor",
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner_api_executor",
      "careslink_v1_generation_owner",
    ],
  },
] as const;

const migrations = migrationCases.map((migrationCase) => ({
  ...migrationCase,
  source: readFileSync(join(process.cwd(), migrationCase.path), "utf8"),
}));
const roleAssertionPath =
  "supabase/tests/migration_entry_role_restore_assertions.sql";
const roleAssertion = readFileSync(
  join(process.cwd(), roleAssertionPath),
  "utf8",
);

const capturePattern =
  /^select pg_catalog\.set_config\(\n  'careslink\.migration_entry_role',\n  current_user,\n  true\n\);$/gm;
const restorePattern =
  /^select pg_catalog\.set_config\(\n  'role',\n  pg_catalog\.current_setting\('careslink\.migration_entry_role'\),\n  false\n\);$/gm;
const setRolePattern = /^set role ([a-z0-9_]+);$/gm;
const resetRolePattern = /^reset role;$/gm;

describe("V1 Note migration entry-role restoration contract", () => {
  it.each(migrations)(
    "$name captures its entry actor once without trusting the transport login",
    ({ source }) => {
      const captures = matches(source, capturePattern);
      const roleSwitches = matches(source, setRolePattern);

      expect(captures).toHaveLength(1);
      expect(roleSwitches.length).toBeGreaterThan(0);
      expect(captures[0].index).toBeLessThan(roleSwitches[0].index);
      expect(source).not.toMatch(resetRolePattern);
      expect(source).not.toMatch(/^set role postgres;$/gm);
      expect(source).not.toContain("session_user");
    },
  );

  it.each(migrations)(
    "$name closes every temporary role window with the captured actor",
    ({ roles, source }) => {
      const roleSwitches = matches(source, setRolePattern);
      const restores = matches(source, restorePattern);

      expect(roleSwitches.map((match) => match.groups?.[0])).toEqual(roles);
      expect(restores).toHaveLength(roleSwitches.length);

      for (const [index, roleSwitch] of roleSwitches.entries()) {
        expect(restores[index].index).toBeGreaterThan(roleSwitch.index);
        if (roleSwitches[index + 1]) {
          expect(restores[index].index).toBeLessThan(
            roleSwitches[index + 1].index,
          );
        }
      }

      const firstTemporaryMembershipRevoke = source.search(
        /^revoke careslink_v1_generation_[a-z0-9_]+\s+from current_user(?:\s+granted by current_user)?;$/m,
      );
      expect(firstTemporaryMembershipRevoke).toBeGreaterThan(
        restores.at(-1)?.index ?? -1,
      );
    },
  );

  it.each(migrations)(
    "$name keeps a hosted-like session on the migration entry actor",
    ({ source }) => {
      const transportLogin = "supabase_cli_login";
      const migrationEntryActor = "postgres";
      const events = [
        ...matches(source, setRolePattern).map((match) => ({
          index: match.index,
          role: match.groups?.[0] ?? "",
        })),
        ...matches(source, restorePattern).map((match) => ({
          index: match.index,
          role: migrationEntryActor,
        })),
        ...matches(source, resetRolePattern).map((match) => ({
          index: match.index,
          role: transportLogin,
        })),
      ].sort((left, right) => left.index - right.index);

      let currentRole = migrationEntryActor;
      for (const event of events) {
        currentRole = event.role;
        expect(currentRole).not.toBe(transportLogin);
      }
      expect(currentRole).toBe(migrationEntryActor);
    },
  );

  it("grants #26 auth-reader CREATE only to the captured entry actor", () => {
    const workerMigration = migrations[1].source;
    const normalized = normalizeSql(workerMigration);
    const grantMarker = normalizeSql(`
      do $grant_migration_entry_role$
      begin
        execute pg_catalog.format(
          'grant create on schema careslink_v1_generation to %I',
          pg_catalog.current_setting('careslink.migration_entry_role')
        );
      end;
      $grant_migration_entry_role$;
    `);
    const revokeMarker = normalizeSql(`
      do $revoke_migration_entry_role$
      begin
        execute pg_catalog.format(
          'revoke create on schema careslink_v1_generation from %I',
          pg_catalog.current_setting('careslink.migration_entry_role')
        );
      end;
      $revoke_migration_entry_role$;
    `);
    const grantStart = normalized.indexOf(grantMarker);
    const grantRestore = normalized.indexOf(
      normalizeSql(`
        select pg_catalog.set_config(
          'role',
          pg_catalog.current_setting('careslink.migration_entry_role'),
          false
        );
      `),
      grantStart,
    );
    const firstReader = normalized.indexOf(
      "create function careslink_v1_generation.fresh_session_is_active(",
      grantRestore,
    );
    const secondReader = normalized.indexOf(
      "create function careslink_v1_generation.fresh_privacy_proof_expires_at(",
      firstReader,
    );
    const revokeStart = normalized.indexOf(revokeMarker, secondReader);

    expect(grantStart).toBeGreaterThanOrEqual(0);
    expect(grantRestore).toBeGreaterThan(grantStart);
    expect(firstReader).toBeGreaterThan(grantRestore);
    expect(secondReader).toBeGreaterThan(firstReader);
    expect(revokeStart).toBeGreaterThan(secondReader);
    expect(workerMigration).not.toContain("session_user");
    expect(workerMigration).not.toContain("%s");
  });

  it("keeps the executable hosted-like role proof rollback-only", () => {
    expect(roleAssertion).toContain("\\set ON_ERROR_STOP on");
    expect(roleAssertion).toContain("\nbegin;\n");
    expect(roleAssertion.trimEnd()).toMatch(/rollback;$/);
    expect(roleAssertion).not.toMatch(/^commit;$/gm);

    for (const marker of [
      "test requires session_user <> current_user",
      "migration entry actor must have CREATEROLE",
      "set role careslink_migration_restore_test_owner;",
      "pg_catalog.current_setting('careslink.migration_entry_role')",
      "grant select on table pg_temp.careslink_migration_restore_acl_probe to %I",
      "revoke select on table pg_temp.careslink_migration_restore_acl_probe from %I",
      "captured entry actor retained the temporary ACL",
      "drop role careslink_migration_restore_test_owner;",
    ]) {
      expect(roleAssertion).toContain(marker);
    }
  });
});

function matches(source: string, pattern: RegExp) {
  return [...source.matchAll(new RegExp(pattern.source, pattern.flags))].map(
    (match) => ({
      groups: match.slice(1),
      index: match.index,
    }),
  );
}

function normalizeSql(value: string): string {
  return value.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
}
