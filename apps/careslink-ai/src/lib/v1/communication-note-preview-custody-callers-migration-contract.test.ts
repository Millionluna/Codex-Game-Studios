import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260828034704_add_communication_note_preview_custody_callers_shadow.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const normalizedMigration = normalizeSql(migration);
const canonicalMigration = canonicalSql(migration);

const schemaName = "careslink_v1_generation";
const callerRoles = [
  "careslink_v1_preview_authorization_registration_caller",
  "careslink_v1_preview_authorization_revocation_caller",
  "careslink_v1_preview_dispatch_caller",
  "careslink_v1_preview_receipt_caller",
] as const;
const executorRoles = [
  "careslink_v1_preview_authorization_executor",
  "careslink_v1_preview_dispatch_executor",
  "careslink_v1_preview_receipt_executor",
] as const;

const rpcBindings = [
  {
    name: "persist_verified_communication_note_preview_authorization",
    arguments: "jsonb, text, text",
    caller: "careslink_v1_preview_authorization_registration_caller",
    executor: "careslink_v1_preview_authorization_executor",
  },
  {
    name: "revoke_communication_note_preview_authorization",
    arguments: "text, uuid, text, text, text",
    caller: "careslink_v1_preview_authorization_revocation_caller",
    executor: "careslink_v1_preview_authorization_executor",
  },
  {
    name: "claim_communication_note_preview_authorization",
    arguments: "text, uuid, text, text, text, text, text",
    caller: "careslink_v1_preview_dispatch_caller",
    executor: "careslink_v1_preview_dispatch_executor",
  },
  {
    name: "reserve_communication_note_preview_dispatch",
    arguments:
      "uuid, text, uuid, integer, text, integer, text, integer, text, text",
    caller: "careslink_v1_preview_dispatch_caller",
    executor: "careslink_v1_preview_dispatch_executor",
  },
  {
    name: "persist_verified_communication_note_preview_dispatch_receipt",
    arguments: "jsonb, text, text, text",
    caller: "careslink_v1_preview_receipt_caller",
    executor: "careslink_v1_preview_receipt_executor",
  },
] as const;

describe("Communication Note M1g-c custody caller migration contract", () => {
  it("creates exactly four inert and purpose-separated caller roles", () => {
    expect(
      [...migration.matchAll(/^\s*create role\s+([a-z0-9_]+)/gim)].map(
        (match) => match[1],
      ),
    ).toEqual(callerRoles);

    for (const role of callerRoles) {
      expect(normalizedMigration).toContain(
        `create role ${role} with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;`,
      );
    }

    expect(normalizedMigration).not.toMatch(
      /\bcreate role\b[^;]*\b(?:login|password|superuser|createdb|createrole|inherit|replication|bypassrls)\b[^;]*;/,
    );
  });

  it("grants only private-schema USAGE and never CREATE or direct data access", () => {
    const schemaGrant = statementStartingAt(
      `grant usage on schema ${schemaName}`,
    );
    for (const role of callerRoles) {
      expect(normalizeSql(schemaGrant)).toContain(role);
    }

    expect(migration.match(/\bgrant\s+usage\s+on\s+schema\b/gi)).toHaveLength(1);
    expect(normalizedMigration).not.toMatch(
      /\bgrant\s+(?:create|select|insert|update|delete|truncate|references|trigger|usage)\s+on\s+(?:table|all tables|sequence|all sequences|type|all types)\b/,
    );
    const schemaCreateRevoke = normalizeSql(
      statementStartingAt(`revoke create on schema ${schemaName}`),
    );
    for (const role of callerRoles) {
      expect(schemaCreateRevoke).toContain(role);
    }
  });

  it("maps the five RPCs to exact 1/1/2/1 caller surfaces", () => {
    expect(
      migration.match(/\bgrant\s+execute\s+on\s+function\b/gi),
    ).toHaveLength(5);
    expect(
      migration.match(/\brevoke\s+all\s+on\s+function\b/gi),
    ).toHaveLength(5);

    for (const binding of rpcBindings) {
      const signature = `${schemaName}.${binding.name}(${binding.arguments})`;
      const revoke = canonicalStatementStartingAt(
        `revoke all on function ${schemaName}.${binding.name}(`,
      );
      const grant = canonicalStatementStartingAt(
          `grant execute on function ${schemaName}.${binding.name}(`,
      );

      expect(revoke).toContain(canonicalSql(`revoke all on function ${signature}`));
      for (const role of callerRoles) {
        expect(revoke).toContain(role);
      }
      expect(grant).toBe(
        canonicalSql(
          `grant execute on function ${signature} to ${binding.caller};`,
        ),
      );

      const grantOffset = canonicalMigration.indexOf(grant);
      const ownerSwitch = canonicalMigration.lastIndexOf(
        canonicalSql(`set role ${binding.executor};`),
        grantOffset,
      );
      const entryReset = canonicalMigration.lastIndexOf(
        canonicalSql(
          "select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);",
        ),
        grantOffset,
      );
      expect(ownerSwitch).toBeGreaterThan(entryReset);
    }

    const grantsByCaller = new Map<string, number>();
    for (const binding of rpcBindings) {
      grantsByCaller.set(
        binding.caller,
        (grantsByCaller.get(binding.caller) ?? 0) + 1,
      );
    }
    expect(Object.fromEntries(grantsByCaller)).toEqual({
      careslink_v1_preview_authorization_registration_caller: 1,
      careslink_v1_preview_authorization_revocation_caller: 1,
      careslink_v1_preview_dispatch_caller: 2,
      careslink_v1_preview_receipt_caller: 1,
    });
  });

  it("adds no explicit usable caller/executor or runtime grant and removes temporary SET edges", () => {
    for (const caller of callerRoles) {
      for (const executor of executorRoles) {
        expect(normalizedMigration).not.toContain(
          `grant ${executor} to ${caller}`,
        );
        expect(normalizedMigration).not.toContain(
          `grant ${caller} to ${executor}`,
        );
      }
      for (const runtimeRole of [
        "anon",
        "authenticated",
        "service_role",
        "authenticator",
      ]) {
        expect(normalizedMigration).not.toContain(
          `grant ${caller} to ${runtimeRole}`,
        );
        expect(normalizedMigration).not.toContain(
          `grant ${runtimeRole} to ${caller}`,
        );
      }
    }

    for (const temporaryRole of [
      "careslink_v1_generation_owner",
      ...executorRoles,
    ]) {
      expect(normalizedMigration).toContain(
        `grant ${temporaryRole} to current_user with admin false, inherit false, set true granted by current_user;`,
      );
      expect(normalizedMigration).toContain(
        `revoke ${temporaryRole} from current_user granted by current_user;`,
      );
    }
  });

  it("remains source-only and creates no custody material or durable fact", () => {
    expect(normalizedMigration).not.toMatch(
      /\bcreate\s+(?:table|view|materialized view|function|procedure|policy|trigger|extension)\b/,
    );
    expect(normalizedMigration).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from|truncate|alter\s+table)\b/,
    );
    expect(normalizedMigration).not.toMatch(
      /\b(?:api_key|secret|credential|private_key|access_token|refresh_token)\b\s*=/,
    );
    expect(normalizedMigration).not.toMatch(
      /\bgrant\s+execute\b[^;]*\bto\s+(?:public|anon|authenticated|service_role|authenticator)\b/,
    );
  });
});

function normalizeSql(source: string) {
  return source.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function canonicalSql(source: string) {
  return normalizeSql(source).replace(/\s*([(),;])\s*/g, "$1");
}

function canonicalStatementStartingAt(marker: string) {
  const canonicalMarker = canonicalSql(marker);
  const start = canonicalMigration.indexOf(canonicalMarker);
  expect(start, `${marker} statement is missing`).toBeGreaterThanOrEqual(0);
  const end = canonicalMigration.indexOf(";", start);
  expect(end, `${marker} statement is unterminated`).toBeGreaterThan(start);
  return canonicalMigration.slice(start, end + 1);
}

function statementStartingAt(marker: string) {
  const start = migration.toLowerCase().indexOf(marker);
  expect(start, `${marker} statement is missing`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(";", start);
  expect(end, `${marker} statement is unterminated`).toBeGreaterThan(start);
  return migration.slice(start, end + 1);
}
