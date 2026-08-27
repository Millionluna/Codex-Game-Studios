import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
} from "./communication-note-preview-execution-authority.server";

vi.mock("server-only", () => ({}));

const migrationPath =
  "supabase/migrations/20260827142156_add_communication_note_preview_execution_authority_shadow.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const normalizedMigration = normalizeSql(migration);

const schemaName = "careslink_v1_generation";
const ledgerNames = [
  "communication_note_preview_authorizations",
  "communication_note_preview_authorization_revocations",
  "communication_note_preview_claims",
  "communication_note_preview_dispatch_reservations",
  "communication_note_preview_dispatch_receipts",
] as const;
const executorRoles = [
  "careslink_v1_preview_authorization_executor",
  "careslink_v1_preview_dispatch_executor",
  "careslink_v1_preview_receipt_executor",
] as const;

const rpcRoles = {
  persist_verified_communication_note_preview_authorization:
    "careslink_v1_preview_authorization_executor",
  revoke_communication_note_preview_authorization:
    "careslink_v1_preview_authorization_executor",
  claim_communication_note_preview_authorization:
    "careslink_v1_preview_dispatch_executor",
  reserve_communication_note_preview_dispatch:
    "careslink_v1_preview_dispatch_executor",
  persist_verified_communication_note_preview_dispatch_receipt:
    "careslink_v1_preview_receipt_executor",
} as const;

describe("Communication Note M1g-b execution authority migration contract", () => {
  it("creates exactly five private append-only FORCE RLS ledgers", () => {
    expect(
      [
        ...migration.matchAll(
          /^\s*create table careslink_v1_generation\.([a-z0-9_]+)\s*\(/gim,
        ),
      ].map((match) => match[1]),
    ).toEqual(ledgerNames);

    for (const ledger of ledgerNames) {
      expect(normalizedMigration).toContain(
        `alter table ${schemaName}.${ledger} enable row level security;`,
      );
      expect(normalizedMigration).toContain(
        `alter table ${schemaName}.${ledger} force row level security;`,
      );
      expect(normalizedMigration).toMatch(
        new RegExp(
          `create trigger [a-z0-9_]+ before update or delete on ${schemaName}\\.${ledger} for each row execute function`,
        ),
      );
      expect(migration).not.toMatch(
        new RegExp(
          `create\\s+policy\\s+[a-z0-9_]+[\\s\\S]{0,180}on\\s+${schemaName}\\.${ledger}[\\s\\S]{0,120}for\\s+delete\\b`,
          "i",
        ),
      );
      expect(migration).not.toMatch(
        new RegExp(
          `grant\\s+(?:update\\s+on|delete|truncate)\\b[\\s\\S]{0,180}on\\s+(?:table\\s+)?${schemaName}\\.${ledger}\\b`,
          "i",
        ),
      );
    }

    const lockOnlyPolicies = [
      "communication_note_preview_authorizations_registration_lock",
      "communication_note_preview_authorizations_dispatch_lock",
      "communication_note_preview_authorizations_receipt_lock",
      "communication_note_preview_claims_dispatch_lock",
      "communication_note_preview_claims_receipt_lock",
      "communication_note_preview_reservations_receipt_lock",
    ];
    for (const policy of lockOnlyPolicies) {
      const start = normalizedMigration.indexOf(`create policy ${policy}`);
      expect(start, `${policy} is missing`).toBeGreaterThanOrEqual(0);
      expect(normalizedMigration.slice(start, start + 360)).toContain(
        "for update",
      );
      expect(normalizedMigration.slice(start, start + 360)).toContain(
        "with check (false)",
      );
    }
  });

  it("creates only three inert least-privilege execution roles", () => {
    expect(
      [...migration.matchAll(/^\s*create role\s+([a-z0-9_]+)/gim)].map(
        (match) => match[1],
      ),
    ).toEqual(executorRoles);

    for (const role of executorRoles) {
      expect(normalizedMigration).toContain(
        `create role ${role} with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;`,
      );
      expect(migration).not.toMatch(
        new RegExp(
          `grant\\s+${role}\\s+to\\s+(?:public|anon|authenticated|service_role)\\b`,
          "i",
        ),
      );
    }
  });

  it("isolates every privileged RPC from API and service roles", () => {
    for (const [rpc, role] of Object.entries(rpcRoles)) {
      const body = normalizeSql(functionBlock(rpc));
      const revoke = normalizeSql(
        statementStartingAt(
          `revoke all on function ${schemaName}.${rpc}(`,
        ),
      );
      const grant = normalizeSql(
        statementStartingAt(
          `grant execute on function ${schemaName}.${rpc}(`,
        ),
      );

      expect(body).toMatch(
        /security definer set search_path = (?:''|'pg_catalog')/,
      );
      expect(revoke).toContain(
        "from public, anon, authenticated, service_role",
      );
      expect(grant).toMatch(new RegExp(`to ${role};$`));
      expect(grant).not.toMatch(
        /\bto (?:public|anon|authenticated|service_role)\b/,
      );
    }
  });

  it("requires READ COMMITTED for every authority RPC", () => {
    for (const rpc of Object.keys(rpcRoles)) {
      const body = normalizeSql(functionBlock(rpc));
      expect(body).toContain("current_setting('transaction_isolation')");
      expect(body).toContain("is distinct from 'read committed'");
      expect(body).toContain("'unsupported_transaction_isolation'");
    }
  });

  it("claims authorization atomically with a fresh post-lock clock and fail-closed replay", () => {
    const claims = normalizeSql(
      tableBlock(`${schemaName}.communication_note_preview_claims`),
    );
    const claim = normalizeSql(
      functionBlock("claim_communication_note_preview_authorization"),
    );

    expect(claims).toMatch(/authorization_digest text not null unique\b/);
    expect(claims).toMatch(/run_id_hash text not null unique\b/);
    expect(claims).toContain("claim_token_sha256 text not null unique");
    expect(claims).not.toMatch(/\bclaim_token\s+text\b/);

    const parentLock = claim.indexOf(
      `from ${schemaName}.communication_note_preview_authorizations as preview_authorization`,
    );
    const lockEnd = claim.indexOf("for update;", parentLock);
    const freshClock = claim.indexOf(
      "date_trunc('milliseconds', pg_catalog.clock_timestamp())",
      lockEnd,
    );
    const claimInsert = claim.indexOf(
      `insert into ${schemaName}.communication_note_preview_claims`,
      freshClock,
    );

    expect(parentLock).toBeGreaterThanOrEqual(0);
    expect(lockEnd).toBeGreaterThan(parentLock);
    expect(freshClock).toBeGreaterThan(lockEnd);
    expect(claimInsert).toBeGreaterThan(freshClock);
    expect(claim).toContain("'created', false");
    expect(claim).toContain("'executionauthorized', false");
    expect(claim).toContain("'claimtoken', null");
    expect(claim).toContain("'created', true");
    expect(claim).toContain("'executionauthorized', true");
    expect(claim).not.toMatch(/transaction_timestamp\(\)|statement_timestamp\(\)/);
  });

  it("reserves each dispatch atomically and never reissues dispatch authority", () => {
    const reservations = normalizeSql(
      tableBlock(
        `${schemaName}.communication_note_preview_dispatch_reservations`,
      ),
    );
    const reserve = normalizeSql(
      functionBlock("reserve_communication_note_preview_dispatch"),
    );

    expect(reservations).toMatch(/unique \(claim_id, slot_index\)/);
    expect(reservations).toContain("client_request_id_hmac text not null unique");

    const claimLock = reserve.indexOf(
      `from ${schemaName}.communication_note_preview_claims as claim`,
    );
    const lockEnd = reserve.indexOf("for update;", claimLock);
    const freshClock = reserve.indexOf(
      "date_trunc('milliseconds', pg_catalog.clock_timestamp())",
      lockEnd,
    );
    const reservationInsert = reserve.indexOf(
      `insert into ${schemaName}.communication_note_preview_dispatch_reservations`,
      freshClock,
    );

    expect(claimLock).toBeGreaterThanOrEqual(0);
    expect(lockEnd).toBeGreaterThan(claimLock);
    expect(freshClock).toBeGreaterThan(lockEnd);
    expect(reservationInsert).toBeGreaterThan(freshClock);
    expect(reserve).toContain("'created', false");
    expect(reserve).toContain("'dispatchauthorized', false");
    expect(reserve).toContain("'created', true");
    expect(reserve).toContain("'dispatchauthorized', true");
    expect(reserve).not.toMatch(/transaction_timestamp\(\)|statement_timestamp\(\)/);
  });

  it("persists only a CaresLink observation with no provider attestation", () => {
    const receipt = normalizeSql(
      functionBlock(
        "persist_verified_communication_note_preview_dispatch_receipt",
      ),
    );

    expect(receipt).toContain("providerattestation");
    expect(receipt).toContain("'absent'");
    expect(receipt).toContain("careslink_signed_internal_observation");
    expect(receipt).toContain("exact_provider_receipt");
    expect(receipt).not.toMatch(
      /providerattestation[^;]{0,120}(?:present|verified|signed)/,
    );
    expect(receipt).toContain("is distinct from pg_catalog.ceil");
    for (const fixedRate of ["750000", "75000", "4500000", "11000"]) {
      expect(receipt).toContain(fixedRate);
    }
    expect(normalizedMigration).toContain(
      "communication_note_preview_dispatch_receipts_transport_check check (((",
    );
    expect(normalizedMigration).toContain(") is true),");
  });

  it("keeps post-claim revocation effective for future reservations", () => {
    const revoke = normalizeSql(
      functionBlock("revoke_communication_note_preview_authorization"),
    );
    const reserve = normalizeSql(
      functionBlock("reserve_communication_note_preview_dispatch"),
    );

    expect(revoke).not.toContain("authorization_already_claimed");
    expect(reserve).toContain("authorization_revocations");
    expect(reserve).toContain("'authorization_revoked'");
  });

  it("pins the SQL policy, source bindings, budget and six slots to the TypeScript contract", () => {
    const sourceBindings = normalizeSql(
      functionBlock("_communication_note_preview_expected_source_bindings"),
    );
    const budget = normalizeSql(
      functionBlock("_communication_note_preview_expected_budget"),
    );
    const slots = normalizeSql(
      functionBlock("_communication_note_preview_expected_slots"),
    );

    expect(migration).toContain(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    );
    for (const value of Object.values(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
    )) {
      expect(sourceBindings).toContain(`'${value.toLowerCase()}'`);
    }

    const expectedBudget =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY.budget;
    for (const [key, value] of Object.entries(expectedBudget)) {
      const sqlKey = key.toLowerCase();
      const sqlValue = value === null
        ? "null"
        : typeof value === "string"
          ? `'${value.toLowerCase()}'`
          : String(value);
      expect(budget).toContain(`'${sqlKey}', ${sqlValue}`);
    }

    for (const slot of CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS) {
      for (const [key, value] of Object.entries(slot)) {
        const sqlValue = typeof value === "string"
          ? `'${value.toLowerCase()}'`
          : String(value);
        expect(slots).toContain(`'${key.toLowerCase()}', ${sqlValue}`);
      }
    }
  });
});

function normalizeSql(source: string) {
  return source.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function tableBlock(qualifiedName: string) {
  const marker = `create table ${qualifiedName} (`;
  const start = migration.toLowerCase().indexOf(marker);
  expect(start, `${qualifiedName} table is missing`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n);", start);
  expect(end, `${qualifiedName} table is unterminated`).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

function functionBlock(name: string) {
  const marker = `create function ${schemaName}.${name}(`;
  const start = migration.toLowerCase().indexOf(marker);
  expect(start, `${name} function is missing`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end, `${name} function is unterminated`).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

function statementStartingAt(marker: string) {
  const start = migration.toLowerCase().indexOf(marker);
  expect(start, `${marker} statement is missing`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(";", start);
  expect(end, `${marker} statement is unterminated`).toBeGreaterThan(start);
  return migration.slice(start, end + 1);
}
