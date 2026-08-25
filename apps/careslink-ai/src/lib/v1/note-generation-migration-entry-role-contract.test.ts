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
const assertionCases = [
  {
    name: "durable foundation assertion",
    path: "supabase/assertions/v1_note_generation_durable_foundation_assertions.sql",
    roleSwitches: 1,
    restores: 1,
    rollbackClosesLastRole: false,
    checksBootstrapMembership: true,
    adjacentSwitches: [],
  },
  {
    name: "worker RPC assertion",
    path: "supabase/assertions/v1_note_generation_worker_rpc_shadow_assertions.sql",
    roleSwitches: 12,
    restores: 11,
    rollbackClosesLastRole: false,
    checksBootstrapMembership: false,
    adjacentSwitches: [
      {
        eventIndex: 0,
        roles: [
          "careslink_v1_generation_executor",
          "careslink_v1_generation_owner",
        ],
      },
    ],
  },
  {
    name: "owner runtime assertion",
    path: "supabase/assertions/v1_note_generation_owner_runtime_rpc_shadow_assertions.sql",
    roleSwitches: 22,
    restores: 22,
    rollbackClosesLastRole: false,
    checksBootstrapMembership: true,
    adjacentSwitches: [],
  },
  {
    name: "registration retirement assertion",
    path: "supabase/assertions/v1_note_generation_registration_retirement_shadow_assertions.sql",
    roleSwitches: 7,
    restores: 7,
    rollbackClosesLastRole: false,
    checksBootstrapMembership: true,
    adjacentSwitches: [],
  },
  {
    name: "NDIS integration assertion",
    path: "supabase/tests/v1_ndis_shadow_integration_assertions.sql",
    roleSwitches: 2,
    restores: 2,
    rollbackClosesLastRole: false,
    checksBootstrapMembership: false,
    adjacentSwitches: [],
  },
  {
    name: "privacy review assertion",
    path: "supabase/tests/v1_privacy_review_shadow_assertions.sql",
    roleSwitches: 2,
    restores: 2,
    rollbackClosesLastRole: false,
    checksBootstrapMembership: false,
    adjacentSwitches: [],
  },
  {
    name: "mobile sync assertion",
    path: "supabase/tests/v1_mobile_sync_shadow_assertions.sql",
    roleSwitches: 7,
    restores: 6,
    rollbackClosesLastRole: true,
    checksBootstrapMembership: false,
    adjacentSwitches: [],
  },
  {
    name: "Portal workflow foundation assertion",
    path: "supabase/tests/portal_referral_workflow_foundation_assertions.sql",
    roleSwitches: 16,
    restores: 16,
    rollbackClosesLastRole: false,
    checksBootstrapMembership: false,
    adjacentSwitches: [],
  },
  {
    name: "Portal intake runtime assertion",
    path: "supabase/tests/portal_referral_intake_runtime_assertions.sql",
    roleSwitches: 15,
    restores: 15,
    rollbackClosesLastRole: false,
    checksBootstrapMembership: false,
    adjacentSwitches: [],
  },
] as const;
const assertionsWithRoleWindows = assertionCases.map((assertionCase) => ({
  ...assertionCase,
  source: readFileSync(join(process.cwd(), assertionCase.path), "utf8"),
}));

const capturePattern =
  /^select pg_catalog\.set_config\(\n  'careslink\.migration_entry_role',\n  current_user,\n  true\n\);$/gm;
const restorePattern =
  /^select pg_catalog\.set_config\(\n  'role',\n  pg_catalog\.current_setting\('careslink\.migration_entry_role'\),\n  false\n\);$/gm;
const setRolePattern = /^set role ([a-z0-9_]+);$/gm;
const resetRolePattern = /^reset role;$/gm;
const assertionCapturePattern =
  /^select pg_catalog\.set_config\(\n  'careslink\.assertion_entry_role',\n  current_user,\n  true\n\);$/gm;
const assertionRestorePattern =
  /^select pg_catalog\.set_config\(\n  'role',\n  pg_catalog\.current_setting\('careslink\.assertion_entry_role'\),\n  false\n\);$/gm;
const assertionSetRolePattern = /^set(?: local)? role ([a-z0-9_]+);$/gm;

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
      "pg_catalog.aclexplode(relation.relacl)",
      "privilege.grantee = pg_catalog.to_regrole(",
      "captured entry actor retained the temporary ACL",
      "drop role careslink_migration_restore_test_owner;",
    ]) {
      expect(roleAssertion).toContain(marker);
    }
  });

  it.each(assertionsWithRoleWindows)(
    "$name bounds fixture role transitions with entry restoration or rollback",
    ({
      adjacentSwitches,
      restores,
      roleSwitches: expectedRoleSwitches,
      rollbackClosesLastRole,
      source,
    }) => {
      const captures = matches(source, assertionCapturePattern);
      const roleSwitches = matches(source, assertionSetRolePattern);
      const roleRestores = matches(source, assertionRestorePattern);

      expect(captures).toHaveLength(1);
      expect(roleRestores).toHaveLength(restores);
      expect(roleSwitches).toHaveLength(expectedRoleSwitches);
      expect(captures[0].index).toBeLessThan(roleSwitches[0].index);
      expect(source).not.toMatch(resetRolePattern);
      expect(source).not.toContain("session_user");

      const roleEvents = [
        ...roleSwitches.map((event) => ({ ...event, kind: "switch" as const })),
        ...roleRestores.map((event) => ({ ...event, kind: "restore" as const })),
      ].sort((left, right) => left.index - right.index);
      expect(roleEvents[0].kind).toBe("switch");
      for (const [index, event] of roleEvents.entries()) {
        if (event.kind === "restore") {
          expect(roleEvents[index - 1]?.kind).toBe("switch");
        }
      }
      expect(
        roleEvents.flatMap((event, eventIndex) => {
          const nextEvent = roleEvents[eventIndex + 1];
          return event.kind === "switch" && nextEvent?.kind === "switch"
            ? [
                {
                  eventIndex,
                  roles: [event.groups?.[0], nextEvent.groups?.[0]],
                },
              ]
            : [];
        }),
      ).toEqual(adjacentSwitches);

      const rollback = source.lastIndexOf("rollback;");
      expect(rollback).toBeGreaterThan(roleSwitches.at(-1)?.index ?? -1);
      if (rollbackClosesLastRole) {
        expect(roleEvents.at(-1)?.kind).toBe("switch");
      } else {
        expect(roleEvents.at(-1)?.kind).toBe("restore");
      }
    },
  );

  it.each(
    assertionsWithRoleWindows.filter(
      (assertion) => assertion.checksBootstrapMembership,
    ),
  )(
    "$name checks bootstrap memberships against the entry actor",
    ({ source }) => {
      expect(source).toContain("current_user::regrole");
      expect(source).not.toContain("session_user::regrole");
      expect(source).toContain("v_entry_actor_super");
      expect(source).not.toContain("v_session_super");
    },
  );
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
