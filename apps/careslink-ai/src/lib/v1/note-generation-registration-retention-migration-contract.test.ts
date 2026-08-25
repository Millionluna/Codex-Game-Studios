import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260823213144_harden_v1_note_generation_registration_retention.sql";
const assertionsPath =
  "supabase/assertions/v1_note_generation_worker_rpc_shadow_assertions.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(join(process.cwd(), assertionsPath), "utf8");

const schemaName = "careslink_v1_generation";
const ownerRole = "careslink_v1_generation_owner";
const entryRoleRestore = `select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);`;

describe("V1 Note worker-registration retention migration contract", () => {
  it("is an additive CLI-named source-only hardening migration", () => {
    expect(migrationPath).toMatch(
      /^supabase\/migrations\/\d{14}_harden_v1_note_generation_registration_retention\.sql$/,
    );
    expect(migration).toContain("Additive, source-only and default-off");
    expect(migration).toContain("creates no catalog row, lifecycle API, caller grant");
    expect(migration).toContain("does not touch Production");
    expect(migration).toContain(
      "The migration runner owns the transaction boundary",
    );
    expect(migration).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/im);
    expect(migration).not.toMatch(/\bif\s+not\s+exists\b|\bon\s+conflict\b/i);
    expect(migration).not.toMatch(
      /\bcreate\s+(?:table|function|policy|view|trigger)\b/i,
    );
    expect(migration).not.toMatch(
      /^\s*(?:insert\s+into|update\s+[a-z0-9_."]+\s+set|delete\s+from)\b/im,
    );
    expect(migration).not.toMatch(/\benabled\s*=\s*true\b/i);
  });

  it("uses only a temporary owner SET edge and creates no caller privilege", () => {
    const normalized = normalizeSql(migration);
    expect(migration.match(/^\s*grant\b/gim)).toHaveLength(1);
    expect(normalized).toContain(
      `grant ${ownerRole} to current_user with admin false, inherit false, set true granted by current_user;`,
    );
    expect(normalized).toMatch(
      new RegExp(
        `revoke ${ownerRole} from current_user granted by current_user;$`,
      ),
    );
    expect(migration).not.toMatch(
      /\bgrant\s+(?:all|usage|create|select|insert|update|delete|truncate|references|trigger|execute)\b/i,
    );
    expect(migration).not.toMatch(
      /\b(?:public|anon|authenticated|service_role|careslink_v1_generation_executor)\b[\s\S]*\bgrant\b/i,
    );

    const ownerStart = migration.indexOf(`set role ${ownerRole};`);
    const ownerEnd = migration.indexOf(entryRoleRestore, ownerStart);
    expect(ownerStart).toBeGreaterThanOrEqual(0);
    expect(ownerEnd).toBeGreaterThan(ownerStart);
    expect(migration.indexOf("create index attempts_registration_digest_idx")).toBeGreaterThan(
      ownerStart,
    );
    expect(migration.indexOf("validate constraint attempts_registration_catalog_fk")).toBeLessThan(
      ownerEnd,
    );
  });

  it("retains every historical attempt registration through one exact RESTRICT FK and child index", () => {
    const normalized = normalizeSql(migration);
    const indexDdl =
      `create index attempts_registration_digest_idx on ${schemaName}.attempts(registration_digest);`;
    const addConstraintDdl =
      `alter table ${schemaName}.attempts add constraint attempts_registration_catalog_fk foreign key (registration_digest) references ${schemaName}.worker_registrations( registration_digest ) on update restrict on delete restrict not valid;`;
    const validateDdl =
      `alter table ${schemaName}.attempts validate constraint attempts_registration_catalog_fk;`;

    expect(normalized).toContain(indexDdl);
    expect(normalized).toContain(addConstraintDdl);
    expect(normalized).toContain(validateDdl);
    expect(migration.match(/^create index\b/gm)).toHaveLength(1);
    expect(migration.match(/\badd constraint\b/g)).toHaveLength(1);
    expect(migration).not.toMatch(
      /attempts_registration_catalog_fk[\s\S]*?on\s+(?:update|delete)\s+(?:cascade|set\s+null|set\s+default|no\s+action)/i,
    );

    const indexStart = normalized.indexOf(indexDdl);
    const constraintStart = normalized.indexOf(addConstraintDdl);
    const validateStart = normalized.indexOf(validateDdl);
    expect(indexStart).toBeGreaterThanOrEqual(0);
    expect(constraintStart).toBeGreaterThan(indexStart);
    expect(validateStart).toBeGreaterThan(constraintStart);
  });

  it("locks exact catalog posture and live rollback enforcement", () => {
    for (const marker of [
      "constraint_metadata.confupdtype = 'r'",
      "constraint_metadata.confdeltype = 'r'",
      "index_relation.relname = 'attempts_registration_digest_idx'",
      "index_metadata.indisvalid is true",
      "index_metadata.indisready is true",
      "index_metadata.indisunique is false",
      "index_metadata.indexprs is null",
      "index_metadata.indpred is null",
      "registration retention catalog posture drifted",
      "registration retention proof fixture drifted",
      "unregistered historical attempt digest was accepted",
      "referenced worker registration delete was not restricted by attempt history",
      "registration retention rollback changed historical rows",
    ]) {
      expect(assertions).toContain(marker);
    }
    expect(assertions).toContain(
      "get stacked diagnostics v_constraint_name = constraint_name",
    );
    expect(assertions.match(/v_constraint_name = 'attempts_registration_catalog_fk'/g)).toHaveLength(
      2,
    );
  });
});

function normalizeSql(value: string): string {
  return value.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
}
