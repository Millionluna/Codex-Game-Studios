import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const name="20260907083608_add_communication_note_job_status_issuer.sql";
const sql=readFileSync(`supabase/migration-candidates/${name}`,"utf8");
describe("job-status issuer migration candidate boundary",()=>{
  it("is deliberately excluded from automatic and historical Hosted migrations",()=>{
    expect(existsSync(`supabase/migrations/${name}`)).toBe(false);
    expect(sql).toContain("explicit authorization");
  });
  it("keeps management invoker authority without creating another privileged login",()=>{
    expect(sql).toContain("security invoker set search_path = ''");
    expect(sql).not.toMatch(/security\s+definer/i);
    expect(sql).toContain("force row level security");
    expect(sql).toContain("ISSUER_UNEXPECTED_DEFAULT_ACL");
    expect(sql).toContain("current_user <> 'postgres' or session_user <> 'postgres'");
    expect(sql).not.toMatch(/grant\s+(?:pg_read_all_stats|pg_signal_backend|createrole)/i);
    expect(sql).not.toContain("to_regprocedure(");
  });
  it("requires a separately committed fence and exact operation fields",()=>{
    expect(sql).toContain("ISSUER_COMMITTED_FENCE_REQUIRED");
    expect(sql).toContain("pg_catalog.pg_terminate_backend(backend.pid,1000)");
    expect(sql).toContain("jsonb_object_keys(data)");
    expect(sql).toContain("ISSUER_ROLE_IDENTITY_CHANGED");
    expect(sql).toContain("ISSUER_REPLAY_DENIED");
    expect(sql).toContain("ISSUER_RESIDUE");
  });
});
