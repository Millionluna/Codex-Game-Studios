import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260828235426_harden_communication_note_preview_reservation_runner_terminal_shadow.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const normalized = normalizeSql(migration);
const signedMigrationPath =
  "supabase/migrations/20260829011323_add_communication_note_preview_signed_terminal_caller_shadow.sql";
const signedMigration = readFileSync(
  join(process.cwd(), signedMigrationPath),
  "utf8",
);
const signedNormalized = normalizeSql(signedMigration);
const acceptedUsageMigrationPath =
  "supabase/migrations/20260829041316_align_communication_note_preview_terminal_accepted_usage.sql";
const acceptedUsageMigration = readFileSync(
  join(process.cwd(), acceptedUsageMigrationPath),
  "utf8",
);
const acceptedUsageNormalized = normalizeSql(acceptedUsageMigration);
const assertion = normalizeSql(
  readFileSync(
    join(
      process.cwd(),
      "supabase/assertions/communication_note_preview_runner_terminal_shadow_assertions.sql",
    ),
    "utf8",
  ),
);

describe("Communication Note M1g-f runner terminal migration contract", () => {
  it("adds one inert executor and deliberately creates no runtime caller", () => {
    expect(
      [...migration.matchAll(/^\s*create role\s+([a-z0-9_]+)/gim)].map(
        (match) => match[1],
      ),
    ).toEqual(["careslink_v1_preview_runner_terminal_executor"]);
    expect(normalized).toContain(
      "create role careslink_v1_preview_runner_terminal_executor with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;",
    );
    expect(migration).not.toMatch(/runner_terminal_caller/i);
    expect(migration).not.toMatch(/\b(?:login|password)\b[\s\S]{0,80}runner_terminal_executor/i);
  });

  it("refuses implicit backfill unless all five inherited ledgers are empty", () => {
    const gate = block("do $$", "create role");
    for (const ledger of [
      "communication_note_preview_authorizations",
      "communication_note_preview_authorization_revocations",
      "communication_note_preview_claims",
      "communication_note_preview_dispatch_reservations",
      "communication_note_preview_dispatch_receipts",
    ]) {
      expect(gate).toContain(ledger);
    }
    expect(gate).toContain("preview_execution_ledgers_must_be_empty");
    const gateStart = normalized.indexOf("do $$");
    expect(normalized.indexOf("lock table")).toBeLessThan(gateStart);
    expect(normalized.indexOf("in share row exclusive mode")).toBeLessThan(
      gateStart,
    );
    expect(
      normalized.indexOf("set role careslink_v1_preview_dispatch_executor"),
    ).toBeLessThan(gateStart);
  });

  it("creates one private FORCE-RLS append-only terminal ledger", () => {
    const table = block(
      "create table careslink_v1_generation.communication_note_preview_runner_terminals",
      "alter table careslink_v1_generation.communication_note_preview_runner_terminals",
    );
    expect(table).toContain("runner_terminal_digest text primary key");
    expect(table).toContain("reservation_id uuid not null unique");
    expect(table).toContain("receipt_digest text not null unique");
    expect(table).toContain("terminal_state text not null");
    expect(table).toContain("failure_reason text");
    expect(table).toContain(
      "authority_policy_digest = '7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9'",
    );
    expect(table).toContain(
      "runner_policy_digest = 'a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4'",
    );
    expect(table).toContain(
      "terminal_policy_digest = '4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a'",
    );
    expect(table).toContain(
      "terminal_state = 'accepted' and failure_reason is null",
    );
    expect(table).toContain("terminal_state = 'failed'");
    expect(table).toContain("no_retry is true and shadow_only is true");
    expect(normalized).toContain(
      "alter table careslink_v1_generation.communication_note_preview_runner_terminals enable row level security;",
    );
    expect(normalized).toContain(
      "alter table careslink_v1_generation.communication_note_preview_runner_terminals force row level security;",
    );
    expect(normalized).toContain(
      "create trigger communication_note_preview_runner_terminals_append_only before update or delete",
    );
    expect(normalized).toContain(
      "grant execute on function careslink_v1_generation._deny_communication_note_preview_ledger_mutation() to careslink_v1_generation_owner;",
    );
    expect(normalized).toContain(
      "revoke execute on function careslink_v1_generation._deny_communication_note_preview_ledger_mutation() from careslink_v1_generation_owner;",
    );
    expect(normalized).toContain(
      "revoke careslink_v1_preview_receipt_executor from current_user granted by current_user;",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:update|delete|truncate)\s+on\s+(?:table\s+)?careslink_v1_generation\.communication_note_preview_runner_terminals/i,
    );
  });

  it("keeps the terminal RPC isolated from every runtime and API identity", () => {
    const revoke = statement(
      "revoke all on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)",
    );
    const grant = statement(
      "grant execute on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text)",
    );
    for (const role of [
      "public",
      "anon",
      "authenticated",
      "service_role",
      "careslink_v1_preview_authorization_executor",
      "careslink_v1_preview_dispatch_executor",
      "careslink_v1_preview_receipt_executor",
      "careslink_v1_preview_authorization_registration_caller",
      "careslink_v1_preview_authorization_revocation_caller",
      "careslink_v1_preview_dispatch_caller",
      "careslink_v1_preview_receipt_caller",
    ]) {
      expect(revoke).toContain(role);
    }
    expect(grant).toBe(
      "grant execute on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text) to careslink_v1_preview_runner_terminal_executor;",
    );
    expect(normalized).not.toMatch(
      /grant\s+careslink_v1_preview_runner_terminal_executor\s+to\s+(?!current_user)/,
    );
  });

  it("validates a completed receipt and locks every durable parent in order", () => {
    const body = functionBody(
      "persist_verified_communication_note_preview_runner_terminal",
    );
    expect(body).toContain("security definer set search_path = ''");
    expect(body).toContain("current_setting('transaction_isolation')");
    expect(body).toContain("'read committed'");
    const authorization = body.indexOf("communication_note_preview_authorizations a");
    const claim = body.indexOf("communication_note_preview_claims c", authorization);
    const reservation = body.indexOf(
      "communication_note_preview_dispatch_reservations r",
      claim,
    );
    const receipt = body.indexOf(
      "communication_note_preview_dispatch_receipts r",
      reservation,
    );
    expect(authorization).toBeGreaterThanOrEqual(0);
    expect(claim).toBeGreaterThan(authorization);
    expect(reservation).toBeGreaterThan(claim);
    expect(receipt).toBeGreaterThan(reservation);
    expect(body).toContain("v_receipt.outcome <> 'completed'");
    expect(body).toContain("runner_terminal_binding_invalid");
    expect(normalized).toContain(
      "grant usage on schema public, extensions to careslink_v1_preview_runner_terminal_executor;",
    );
    for (const dependency of [
      "public.v1_shadow_canonical_json(jsonb)",
      "public.v1_shadow_content_sha256(jsonb)",
      "extensions.digest(bytea, text)",
    ]) {
      expect(normalized).toContain(dependency);
    }
  });

  it("enforces ACCEPTED/FAILED XOR and exact replay without dispatch authority", () => {
    const body = functionBody(
      "persist_verified_communication_note_preview_runner_terminal",
    );
    expect(body).toContain("when v_state = 'accepted' then");
    expect(body).toContain(
      "p_statement->'failurereason' is not distinct from 'null'::jsonb",
    );
    expect(body).toContain("when v_state = 'failed' then");
    expect(body).toContain("p_statement->'noretry' is distinct from 'true'::jsonb");
    expect(body).toContain("p_statement->'usage' is distinct from v_receipt.usage");
    expect(body).toContain("'strict_schema',true");
    expect(body).toContain("'locale','zh-hant','passed',true");
    expect(body).toContain("unattested_no_shared_identifier");
    expect(body).toContain("v_existing.runner_terminal_digest = v_digest");
    expect(body).toContain(
      "v_existing.statement is not distinct from p_statement",
    );
    expect(body).toContain("'created', false");
    expect(body).toContain("'status', 'already_recorded'");
    expect(body).toContain("runner_terminal_conflict");
    expect(body).not.toContain("dispatchauthorized");
    expect(body).toContain("jsonb_object_keys(p_statement)");
    expect(body).toMatch(
      /'calculatedcostupperboundmicrousd','candidatedigest','claimid',\s*'criticalchecks','domain'/,
    );
    expect(body).toContain(
      "jsonb_typeof(p_statement->required_string.key) is distinct from 'string'",
    );
    expect(body).toContain(") <> 17");
    expect(body).toContain(") <> 20");
  });

  it("returns the same database reservedAt on fresh insert and harmless replay", () => {
    const body = functionBody(
      "reserve_communication_note_preview_dispatch",
    );
    expect((body.match(/'reservedat'/g) ?? [])).toHaveLength(2);
    expect(body).toContain("v_existing.reserved_at at time zone 'utc'");
    expect(body).toContain("v_now at time zone 'utc'");
    expect(body).toContain("'created',false,'dispatchauthorized',false");
    expect(body).toContain("'created',true,'dispatchauthorized',true");
    expect(body).toContain("'status','already_reserved'");
    expect(body).toContain("'status','reserved_before_transport'");
    expect(body).toContain("p_claim_id is null");
    expect(body).toContain("p_claim_id::text ~");
    expect(body).toContain("p_reservation_id is null");
    expect(body).toContain("p_reservation_id::text ~");
    expect(body).toContain("p_slot_index is null");
    expect(body).toContain("p_request_body_utf8_byte_length is null");
  });

  it("requires durable ACCEPTED terminal state before every later slot", () => {
    const body = functionBody(
      "reserve_communication_note_preview_dispatch",
    );
    const authorization = body.indexOf("communication_note_preview_authorizations a");
    const claim = body.indexOf("communication_note_preview_claims c", authorization);
    const priorReservation = body.indexOf(
      "communication_note_preview_dispatch_reservations r",
      claim,
    );
    const priorReceipt = body.indexOf(
      "communication_note_preview_dispatch_receipts r",
      priorReservation,
    );
    const priorTerminal = body.indexOf(
      "communication_note_preview_runner_terminals t",
      priorReceipt,
    );
    expect(claim).toBeGreaterThan(authorization);
    expect(priorReservation).toBeGreaterThan(claim);
    expect(priorReceipt).toBeGreaterThan(priorReservation);
    expect(priorTerminal).toBeGreaterThan(priorReceipt);
    expect(body).toContain("for v_prior_slot in 0..p_slot_index - 1 loop");
    expect(body).toContain("v_prior_receipt.outcome is distinct from 'completed'");
    expect(body).toContain("prior_runner_terminal_pending");
    expect(body).toContain(
      "v_prior_terminal.terminal_state is distinct from 'accepted'",
    );
    expect(body).toContain("run_permanently_consumed");
  });

  it("leaves no seed, capability toggle, network path or API table grant", () => {
    expect(migration).not.toMatch(
      /(?:https?:\/\/|process\.env|service_role\s+to|insert\s+into\s+[^;]*(?:feature|capabilit))/i,
    );
    expect(normalized).toContain(
      "revoke all on all tables in schema careslink_v1_generation from public, anon, authenticated, service_role;",
    );
  });

  it("restores exact reserve ACLs and protects future function defaults", () => {
    expect(normalized).toContain(
      "alter default privileges revoke execute on functions from public, anon, authenticated, service_role;",
    );
    const reserveGrant = statement(
      "grant execute on function careslink_v1_generation.reserve_communication_note_preview_dispatch(",
    );
    expect(reserveGrant).toContain("careslink_v1_preview_dispatch_executor");
    expect(reserveGrant).toContain("careslink_v1_preview_dispatch_caller");
    expect(reserveGrant).not.toContain("receipt_caller");
    const reserveRevoke = statement(
      "revoke all on function careslink_v1_generation.reserve_communication_note_preview_dispatch(",
    );
    for (const role of [
      "public",
      "anon",
      "authenticated",
      "service_role",
      "careslink_v1_preview_authorization_executor",
      "careslink_v1_preview_receipt_executor",
      "careslink_v1_preview_runner_terminal_executor",
      "careslink_v1_preview_authorization_registration_caller",
      "careslink_v1_preview_authorization_revocation_caller",
      "careslink_v1_preview_receipt_caller",
    ]) {
      expect(reserveRevoke).toContain(role);
    }
    expect(normalized).toContain(
      "with check (shadow_only is true and no_retry is true)",
    );
  });

  it("keeps the rollback-only assertion as an executable lifecycle proof", () => {
    expect(assertion).toContain("savepoint m1gf_functional_fixture");
    expect(assertion).toContain("rollback to savepoint m1gf_functional_fixture");
    expect(assertion).toContain("fresh slot0 reserve did not return db reservedat");
    expect(assertion).toContain(
      "reservation.reserved_at at time zone 'utc'",
    );
    expect(assertion).toContain("missing terminal did not block slot1");
    expect(assertion).toContain(
      "string-as-number terminal evidence did not fail validation",
    );
    expect(assertion).toContain(
      "receipt evidence drift did not fail binding",
    );
    expect(assertion).toContain(
      "preflight token underestimate did not fail binding",
    );
    expect(assertion).toContain("failed terminal was overwritable by accepted");
    expect(assertion).toContain("accepted terminal did not unlock slot1");
    expect(assertion).toContain("failed terminal did not permanently block slot1");
    expect(assertion).toContain(
      "set local role careslink_v1_preview_dispatch_executor",
    );
    expect(assertion).toContain(
      "communication_note_preview_runner_terminals",
    );
    expect(assertion.endsWith("rollback;")).toBe(true);
    expect(assertion).not.toMatch(/(?:https?:\/\/|service[_-]?role[_-]?key|password\s*=)/);
  });
});

describe("Communication Note M1g-g signed terminal caller migration contract", () => {
  it("creates exactly one inert purpose-scoped terminal caller", () => {
    expect(
      [...signedMigration.matchAll(/^\s*create role\s+([a-z0-9_]+)/gim)].map(
        (match) => match[1],
      ),
    ).toEqual(["careslink_v1_preview_runner_terminal_caller"]);
    expect(signedNormalized).toContain(
      "create role careslink_v1_preview_runner_terminal_caller with nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;",
    );
    expect(signedMigration).not.toMatch(
      /\b(?:login|password)\b[\s\S]{0,80}runner_terminal_caller/i,
    );
    expect(signedMigration).not.toMatch(
      /grant\s+careslink_v1_preview_runner_terminal_executor\s+to\s+careslink_v1_preview_runner_terminal_caller/i,
    );
  });

  it("serializes and refuses the signed cut-over unless all six ledgers are empty", () => {
    const gateStart = signedNormalized.indexOf("do $$");
    const gateEnd = signedNormalized.indexOf("$$;", gateStart);
    const gate = signedNormalized.slice(gateStart, gateEnd);
    for (const ledger of [
      "communication_note_preview_authorizations",
      "communication_note_preview_authorization_revocations",
      "communication_note_preview_claims",
      "communication_note_preview_dispatch_reservations",
      "communication_note_preview_dispatch_receipts",
      "communication_note_preview_runner_terminals",
    ]) {
      expect(gate).toContain(ledger);
    }
    expect(gate).toContain("preview_execution_ledgers_must_be_empty");
    expect(signedNormalized.indexOf("lock table")).toBeLessThan(gateStart);
    expect(
      signedNormalized.indexOf("in share row exclusive mode"),
    ).toBeLessThan(gateStart);
    expect(
      signedNormalized.indexOf("set role careslink_v1_preview_dispatch_executor"),
    ).toBeLessThan(gateStart);
  });

  it("hardens the terminal ledger with independent signed-envelope evidence", () => {
    const alteration = signedNormalized.slice(
      signedNormalized.indexOf(
        "alter table careslink_v1_generation.communication_note_preview_runner_terminals add column",
      ),
      signedNormalized.indexOf(
        "grant usage on schema careslink_v1_generation",
      ),
    );
    for (const column of [
      "signature_base64url text not null",
      "signature_sha256 text not null unique",
      "signer_key_id_hash text not null",
      "signer_public_key_sha256 text not null",
      "authenticity text not null",
      "verifier_method text not null",
    ]) {
      expect(alteration).toContain(column);
    }
    expect(alteration).toContain(
      "external_runner_terminal_ed25519_verified",
    );
    expect(alteration).toContain(
      "application_ed25519_terminal_trust_registry",
    );
    expect(alteration).toContain(
      "policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2",
    );
    expect(alteration).toContain(
      "d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa",
    );
  });

  it("removes the unsigned overload and installs only the signed three-argument RPC", () => {
    expect(signedNormalized).toContain(
      "drop function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal( jsonb, text );",
    );
    expect(signedNormalized).toContain(
      "create function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal( p_statement jsonb, p_signature_base64url text, p_verifier_identity_hmac text )",
    );
    const grant = signedStatement(
      "grant execute on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(",
    );
    expect(grant).toContain("jsonb, text, text");
    expect(grant).toContain("careslink_v1_preview_runner_terminal_executor");
    expect(grant).toContain("careslink_v1_preview_runner_terminal_caller");
    for (const role of [
      "public",
      "anon",
      "authenticated",
      "service_role",
      "careslink_v1_preview_receipt_executor",
      "careslink_v1_preview_receipt_caller",
      "careslink_v1_preview_dispatch_caller",
    ]) {
      expect(
        signedStatement(
          "revoke all on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(",
        ),
      ).toContain(role);
    }
  });

  it("strictly binds purpose, signature, signer independence and exact replay", () => {
    const body = signedFunctionBody(
      "persist_verified_communication_note_preview_runner_terminal",
    );
    expect(body).toContain("security definer set search_path = ''");
    expect(body).toContain("p_signature_base64url ~");
    expect(body).toContain("'signerkeyidhash'");
    expect(body).toContain("'signerpublickeysha256'");
    expect(body).toContain("'signingpurpose'");
    expect(body).toContain("careslink_runner_terminal");
    expect(body).toContain("runner_terminal_signer_not_independent");
    expect(body).toContain(
      "v_authorization.signer_key_id_hash = v_receipt.signer_key_id_hash",
    );
    expect(body).toContain("v_existing.signature_base64url");
    expect(body).toContain("v_existing.signature_sha256");
    expect(body).toContain(") <> 23");
    expect(body).toContain(") <> 26");
  });

  it("keeps the fifth caller away from ledgers and every earlier RPC", () => {
    expect(signedNormalized).toContain(
      "revoke all on all tables in schema careslink_v1_generation from careslink_v1_preview_runner_terminal_caller;",
    );
    expect(signedNormalized).toContain(
      "revoke all on all sequences in schema careslink_v1_generation from careslink_v1_preview_runner_terminal_caller;",
    );
    for (const rpc of [
      "persist_verified_communication_note_preview_authorization",
      "revoke_communication_note_preview_authorization",
      "claim_communication_note_preview_authorization",
      "reserve_communication_note_preview_dispatch",
      "persist_verified_communication_note_preview_dispatch_receipt",
    ]) {
      expect(signedNormalized).toMatch(
        new RegExp(
          `revoke all on function[\\s\\S]{0,700}${rpc}[\\s\\S]{0,700}from careslink_v1_preview_runner_terminal_caller`,
        ),
      );
    }
    expect(signedNormalized).toContain(
      "revoke careslink_v1_preview_runner_terminal_executor from current_user granted by current_user;",
    );
  });

  it("upgrades the rollback-only lifecycle proof to the signed caller", () => {
    expect(assertion).toContain(
      "set local role careslink_v1_preview_runner_terminal_caller",
    );
    expect(assertion).toContain("malformed terminal signature was accepted");
    expect(assertion).toContain(
      "authorization signing key reuse was accepted",
    );
    expect(assertion).toContain(
      "changed terminal signature replay was accepted",
    );
    expect(assertion).toContain("signed terminal evidence was not stored exactly");
    expect(assertion).toContain(
      "persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)",
    );
    expect(assertion.endsWith("rollback;")).toBe(true);
  });
});

describe("Communication Note M1g-i ACCEPTED usage alignment migration contract", () => {
  it("keeps every temporary DDL capability inside one explicit transaction", () => {
    expect(acceptedUsageNormalized.startsWith("begin;")).toBe(true);
    expect(acceptedUsageNormalized.endsWith("commit;")).toBe(true);
    expect(acceptedUsageNormalized.match(/\bbegin;/g)).toHaveLength(1);
    expect(acceptedUsageNormalized.match(/\bcommit;/g)).toHaveLength(1);
    expect(
      acceptedUsageNormalized.indexOf(
        "grant careslink_v1_generation_owner to current_user",
      ),
    ).toBeGreaterThan(acceptedUsageNormalized.indexOf("begin;"));
    expect(
      acceptedUsageNormalized.indexOf(
        "revoke careslink_v1_generation_owner from current_user",
      ),
    ).toBeLessThan(acceptedUsageNormalized.lastIndexOf("commit;"));
  });

  it("replaces only the signed terminal RPC and restores the exact ACL", () => {
    expect(acceptedUsageNormalized).toContain(
      "create or replace function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal( p_statement jsonb, p_signature_base64url text, p_verifier_identity_hmac text )",
    );
    expect(acceptedUsageMigration).not.toMatch(/^\s*create role\s+/gim);
    expect(acceptedUsageMigration).not.toMatch(/^\s*(?:create|alter|drop) table\s+/gim);
    expect(acceptedUsageNormalized).toContain(
      "grant careslink_v1_preview_runner_terminal_executor to current_user with admin false, inherit false, set true granted by current_user;",
    );
    expect(acceptedUsageNormalized).toContain(
      "grant careslink_v1_generation_owner to current_user with admin false, inherit false, set true granted by current_user;",
    );
    expect(acceptedUsageNormalized).toContain(
      "grant create on schema careslink_v1_generation to careslink_v1_preview_runner_terminal_executor;",
    );
    expect(acceptedUsageNormalized).toContain(
      "revoke create on schema careslink_v1_generation from careslink_v1_preview_runner_terminal_executor;",
    );
    expect(acceptedUsageNormalized).toContain(
      "revoke careslink_v1_preview_runner_terminal_executor from current_user granted by current_user;",
    );
    expect(acceptedUsageNormalized).toContain(
      "revoke careslink_v1_generation_owner from current_user granted by current_user;",
    );
    const grant = acceptedUsageStatement(
      "grant execute on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(",
    );
    expect(grant).toContain("careslink_v1_preview_runner_terminal_executor");
    expect(grant).toContain("careslink_v1_preview_runner_terminal_caller");
    for (const role of [
      "public",
      "anon",
      "authenticated",
      "service_role",
      "careslink_v1_preview_receipt_executor",
      "careslink_v1_preview_receipt_caller",
      "careslink_v1_preview_dispatch_caller",
    ]) {
      expect(
        acceptedUsageStatement(
          "revoke all on function careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(",
        ),
      ).toContain(role);
    }
  });

  it("requires exact nine-key usage and binds a six-fact receipt projection", () => {
    const body = acceptedUsageFunctionBody(
      "persist_verified_communication_note_preview_runner_terminal",
    );
    for (const key of [
      "cachedinputtokens",
      "cachedinputtokensreconciliation",
      "inputtokens",
      "outputtokens",
      "reasoningtokens",
      "reasoningtokensreconciliation",
      "source",
      "totaltokens",
      "totaltokensreconciliation",
    ]) {
      expect(body).toContain(`'${key}'`);
    }
    expect(body).toContain("'reported','calculated'");
    expect(body).toContain("'reported','assumed_zero'");
    expect(body).toContain("'reported','unavailable'");
    expect(body).toContain("<> 'assumed_zero'");
    expect(body).toContain("= 'unavailable'");
    expect(body).toContain(
      "(p_statement->'usage') - array[ 'totaltokensreconciliation', 'cachedinputtokensreconciliation', 'reasoningtokensreconciliation' ]::text[]",
    );
    expect(body).toContain(") is distinct from v_receipt.usage");
    expect(body).not.toContain(
      "p_statement->'usage' is distinct from v_receipt.usage",
    );
    expect(body).toContain("v_receipt.outcome <> 'completed'");
    expect(body).toContain("runner_terminal_binding_invalid");
    expect(body).toContain("v_existing.statement is not distinct from p_statement");
  });

  it("adds no runtime, API, credential, network or activation surface", () => {
    expect(acceptedUsageMigration).not.toMatch(
      /(?:https?:\/\/|process\.env|service_role\s+to|\bpassword\b|\blogin\b)/i,
    );
    expect(acceptedUsageMigration).not.toMatch(
      /grant\s+execute[\s\S]{0,240}\b(?:anon|authenticated|service_role)\b/i,
    );
  });
});

function normalizeSql(value: string) {
  return value.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function functionBody(name: string) {
  const start = normalized.indexOf(
    `create${name === "reserve_communication_note_preview_dispatch" ? " or replace" : ""} function careslink_v1_generation.${name}`,
  );
  expect(start, `${name} is missing`).toBeGreaterThanOrEqual(0);
  const end = normalized.indexOf("$$;", start);
  expect(end, `${name} terminator is missing`).toBeGreaterThan(start);
  return normalized.slice(start, end + 3);
}

function signedFunctionBody(name: string) {
  const start = signedNormalized.indexOf(
    `create function careslink_v1_generation.${name}`,
  );
  expect(start, `${name} is missing from signed migration`).toBeGreaterThanOrEqual(
    0,
  );
  const end = signedNormalized.indexOf("$$;", start);
  expect(end, `${name} terminator is missing from signed migration`).toBeGreaterThan(
    start,
  );
  return signedNormalized.slice(start, end + 3);
}

function acceptedUsageFunctionBody(name: string) {
  const start = acceptedUsageNormalized.indexOf(
    `create or replace function careslink_v1_generation.${name}`,
  );
  expect(
    start,
    `${name} is missing from ACCEPTED usage migration`,
  ).toBeGreaterThanOrEqual(0);
  const end = acceptedUsageNormalized.indexOf("$$;", start);
  expect(
    end,
    `${name} terminator is missing from ACCEPTED usage migration`,
  ).toBeGreaterThan(start);
  return acceptedUsageNormalized.slice(start, end + 3);
}

function statement(prefix: string) {
  const normalizedPrefix = normalizeSql(prefix);
  const start = normalized.lastIndexOf(normalizedPrefix);
  expect(start, `${prefix} is missing`).toBeGreaterThanOrEqual(0);
  const end = normalized.indexOf(";", start);
  return normalized.slice(start, end + 1);
}

function signedStatement(prefix: string) {
  const normalizedPrefix = normalizeSql(prefix);
  const start = signedNormalized.lastIndexOf(normalizedPrefix);
  expect(start, `${prefix} is missing from signed migration`).toBeGreaterThanOrEqual(
    0,
  );
  const end = signedNormalized.indexOf(";", start);
  return signedNormalized.slice(start, end + 1);
}

function acceptedUsageStatement(prefix: string) {
  const normalizedPrefix = normalizeSql(prefix);
  const start = acceptedUsageNormalized.lastIndexOf(normalizedPrefix);
  expect(
    start,
    `${prefix} is missing from ACCEPTED usage migration`,
  ).toBeGreaterThanOrEqual(0);
  const end = acceptedUsageNormalized.indexOf(";", start);
  return acceptedUsageNormalized.slice(start, end + 1);
}

function block(startText: string, endText: string) {
  const start = normalized.indexOf(normalizeSql(startText));
  const end = normalized.indexOf(normalizeSql(endText), start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return normalized.slice(start, end);
}
