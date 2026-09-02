import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260902012628_add_v1_authenticated_current_session_status_rpc.sql",
  ),
  "utf8",
);

const predecessorMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260811134719_harden_v1_note_facts_schema_and_active_sessions.sql",
  ),
  "utf8",
);

const sqlAssertions = readFileSync(
  join(
    process.cwd(),
    "supabase/tests/v1_authenticated_current_session_status_assertions.sql",
  ),
  "utf8",
);

function currentSessionResolverSection(): string {
  const start = migration.indexOf(
    "create function public.resolve_v1_current_session_status()",
  );
  const end = migration.indexOf(
    "alter function public.resolve_v1_current_session_status()",
    start,
  );
  if (start < 0 || end < 0) {
    throw new Error("Current-session resolver section is missing");
  }
  return migration.slice(start, end);
}

function predecessorSessionHelperSource(): string {
  const match = predecessorMigration.match(
    /create or replace function public\.v1_shadow_session_is_active\([\s\S]*?as \$\$\n([\s\S]*?)\n\$\$;/,
  );
  if (!match) throw new Error("Predecessor session helper is missing");
  return match[1].trim();
}

function guardedSessionHelperSource(): string {
  const match = migration.match(
    /\$careslink_v1_expected_session_helper\$([\s\S]*?)\$careslink_v1_expected_session_helper\$/,
  );
  if (!match) throw new Error("Guarded session helper source is missing");
  return match[1];
}

function assertedSessionHelperSource(): string {
  const match = sqlAssertions.match(
    /\$careslink_v1_expected_session_helper\$([\s\S]*?)\$careslink_v1_expected_session_helper\$/,
  );
  if (!match) throw new Error("Asserted session helper source is missing");
  return match[1];
}

describe("authenticated current-session RPC migration contract", () => {
  it("is one additive, transactional identity with a guarded predecessor", () => {
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(migration).toContain(
      "overload.proname = 'resolve_v1_current_session_status'",
    );
    expect(migration).toContain(
      "'public.v1_shadow_session_is_active(uuid,uuid,timestamp with time zone)'",
    );
    expect(migration).toContain("and not helper.prosecdef");
    expect(migration).toContain(
      "and helper.proowner = 'postgres'::pg_catalog.regrole",
    );
    expect(migration).toContain("and helper.prokind = 'f'");
    expect(migration).toContain(
      "and helper.prorettype = 'boolean'::pg_catalog.regtype",
    );
    expect(migration).toContain("where language_record.lanname = 'sql'");
    expect(migration).toContain("and helper.provolatile = 's'");
    expect(migration).toContain("and not helper.proretset");
    expect(migration).toContain("and not helper.proleakproof");
    expect(migration).toContain("pg_catalog.cardinality(helper.proconfig) = 1");
    expect(migration).toContain("from pg_catalog.aclexplode(");
    expect(migration).toContain("helper_acl.grantee = helper.proowner");
    expect(migration).toContain("helper_acl.grantor = helper.proowner");
    expect(migration).toContain("helper_acl.privilege_type = 'EXECUTE'");
    expect(migration).toContain("and not helper_acl.is_grantable");
    expect(migration).toContain(
      "api_role.role_name, 'postgres', 'MEMBER'",
    );
    expect(migration).toContain(
      "'service_role', 'authenticated', 'MEMBER'",
    );
    expect(migration).toContain(
      "pg_catalog.btrim(helper.prosrc, E' \\n\\r\\t') =\n        v_expected_helper_source",
    );
    expect(migration).toContain(
      "active_user.raw_app_meta_data->>'role' = 'provider'",
    );
    expect(guardedSessionHelperSource()).toBe(
      predecessorSessionHelperSource(),
    );
    expect(assertedSessionHelperSource()).toBe(
      predecessorSessionHelperSource(),
    );
    expect(migration).toContain("V1_CURRENT_SESSION_STATUS_HELPER_UNSAFE");
    expect(migration).toContain(
      "create function public.resolve_v1_current_session_status()",
    );
    expect(migration).not.toContain(
      "create or replace function public.resolve_v1_current_session_status()",
    );
    expect(
      migration.match(/resolve_v1_current_session_status\(\)/g)?.length,
    ).toBe(5);
    expect(migration).not.toMatch(
      /resolve_v1_shadow_session_status\s*\(\s*\)/i,
    );
  });

  it("derives the owner and exact canonical session only from request auth", () => {
    const resolver = currentSessionResolverSection();
    expect(resolver).toContain("returns text");
    expect(resolver).toContain("language plpgsql");
    expect(resolver).toContain("volatile");
    expect(resolver).toContain("security definer");
    expect(resolver).toContain("set search_path = ''");
    expect(resolver.match(/auth\.jwt\(\)/g)).toHaveLength(1);
    expect(resolver.match(/auth\.uid\(\)/g)).toHaveLength(1);
    expect(resolver).toContain(
      "pg_catalog.jsonb_typeof(v_claims) is distinct from 'object'",
    );
    expect(resolver).toContain(
      "v_claims->>'role' is distinct from 'authenticated'",
    );
    expect(resolver).toContain(
      "v_claims->'is_anonymous'\n      is distinct from 'false'::pg_catalog.jsonb",
    );
    expect(resolver).toContain(
      "pg_catalog.jsonb_typeof(v_claims->'sub') is distinct from 'string'",
    );
    expect(resolver).toContain(
      "pg_catalog.jsonb_typeof(v_claims->'session_id')",
    );
    expect(resolver).toContain("[1-8][0-9a-f]{3}-[89ab]");
    expect(resolver).toContain("v_session_claim := v_claims->>'session_id'");
    expect(resolver).toContain(
      "v_session_id := v_session_claim::pg_catalog.uuid",
    );
    expect(resolver).toContain("when invalid_text_representation then");
    expect(resolver).toContain(
      "v_session_id::pg_catalog.text is distinct from v_session_claim",
    );
    expect(resolver).toContain(
      "v_owner_user_id::pg_catalog.text\n      is distinct from v_claims->>'sub'",
    );
    expect(resolver).toContain("public.v1_shadow_session_is_active(");
    expect(resolver).toContain("pg_catalog.clock_timestamp()");
    expect(resolver.match(/return 'ACTIVE'/g)).toHaveLength(1);
    expect(resolver.match(/return 'REVOKED'/g)).toHaveLength(5);
    expect(resolver).not.toContain("from auth.sessions");
    expect(resolver).not.toContain("from auth.users");
    expect(resolver).not.toContain("raw_user_meta_data");
    expect(resolver).not.toMatch(/p_(?:user|owner|session)_id/i);
  });

  it("pins the owner and grants only authenticated EXECUTE", () => {
    const revoke = migration.indexOf(
      "revoke all on function public.resolve_v1_current_session_status()",
    );
    const grant = migration.indexOf(
      "grant execute on function public.resolve_v1_current_session_status()",
    );
    expect(migration).toContain(
      "alter function public.resolve_v1_current_session_status()\n  owner to postgres",
    );
    expect(revoke).toBeGreaterThan(0);
    expect(grant).toBeGreaterThan(revoke);
    expect(migration).toMatch(
      /revoke all on function public\.resolve_v1_current_session_status\(\)\s+from public, anon, authenticated, service_role, authenticator;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.resolve_v1_current_session_status\(\)\s+to authenticated;/i,
    );
    expect(migration.match(/grant execute on function/g)).toHaveLength(1);
    expect(migration).not.toMatch(
      /grant execute on function public\.resolve_v1_current_session_status\(\)[^;]+to (?:public|anon|service_role|authenticator)/i,
    );
  });

  it("ships executable rollback-only catalog, ACL, role and claim matrices", () => {
    expect(sqlAssertions).toMatch(/^begin;[\s\S]*rollback;\s*$/i);
    expect(sqlAssertions).not.toMatch(/\bcommit\s*;/i);
    for (const evidence of [
      "Current-session RPC catalog contract failed",
      "Current-session RPC ACL contract failed",
      "PUBLIC unexpectedly has current-session RPC EXECUTE",
      "Anon unexpectedly executed current-session RPC",
      "Service role unexpectedly executed current-session RPC",
      "Authenticator unexpectedly executed current-session RPC",
      "Authenticated active Provider session did not resolve ACTIVE",
      "Missing JWT claims did not resolve REVOKED",
      "Malformed JWT JSON did not resolve REVOKED",
      "Malformed session UUID did not resolve REVOKED",
      "Malformed owner UUID did not resolve REVOKED",
      "Non-string owner UUID did not resolve REVOKED",
      "Non-canonical owner UUID did not resolve REVOKED",
      "Missing anonymous claim did not resolve REVOKED",
      "Non-boolean anonymous claim did not resolve REVOKED",
      "Non-canonical session UUID did not resolve REVOKED",
      "Cross-owner session did not resolve REVOKED",
      "Expired session did not resolve REVOKED",
      "Missing trusted Provider role unexpectedly resolved ACTIVE",
      "User metadata role unexpectedly authorized current session",
      "Anonymous Provider unexpectedly resolved ACTIVE",
      "Banned Provider unexpectedly resolved ACTIVE",
      "Deleted Provider unexpectedly resolved ACTIVE",
      "Unconfirmed Provider unexpectedly resolved ACTIVE",
    ]) {
      expect(sqlAssertions).toContain(evidence);
    }
    for (const role of [
      "anon",
      "authenticated",
      "service_role",
      "authenticator",
    ]) {
      expect(sqlAssertions).toContain(`set local role ${role};`);
    }
    expect(sqlAssertions).toContain("when insufficient_privilege then");
    expect(sqlAssertions).toContain("information_schema.routine_privileges");
    expect(sqlAssertions).toContain("pg_catalog.aclexplode(");
    expect(sqlAssertions).toContain("pg_catalog.has_function_privilege(");
    expect(sqlAssertions).toContain(
      "helper_acl.grantee = helper.proowner",
    );
    expect(sqlAssertions).toContain(
      "helper_acl.grantor = helper.proowner",
    );
    expect(sqlAssertions).toContain(
      "pg_catalog.pg_get_userbyid(v_rpc_owner)",
    );
    expect(sqlAssertions).toContain(
      "pg_catalog.btrim(v_helper_source, E' \\n\\r\\t')\n      is distinct from v_expected_helper_source",
    );
    expect(sqlAssertions).toContain(
      "helper.prorettype = 'boolean'::pg_catalog.regtype",
    );
    expect(sqlAssertions).toContain("where language_record.lanname = 'sql'");
    expect(sqlAssertions).toContain("delete from auth.sessions");
    expect(sqlAssertions).toContain("delete from auth.users");
  });
});
