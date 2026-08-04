import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260804223000_create_ndis_case_note_pilot_cohort.sql",
  ),
  "utf8",
);
const report = readFileSync(
  join(process.cwd(), "documentation/pilot-funnel.sql"),
  "utf8",
);

describe("invite-only pilot funnel contract", () => {
  it("keeps cohort membership metadata-only and service-role managed", () => {
    expect(migration).toContain("create table if not exists public.pilot_cohort_members");
    expect(migration).toContain("user_id uuid not null references auth.users(id)");
    expect(migration).toContain("cohort_code = 'ndis_case_note_v01'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "revoke all on table public.pilot_cohort_members from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.pilot_cohort_members to service_role",
    );
    expect(migration).not.toMatch(/\n\s*(?:email|prompt|input|output|generated_content)\s+/i);
  });

  it("runs as pure read-only queries without temporary tables", () => {
    expect(report).toContain("begin transaction read only;");
    expect(report).not.toMatch(/create\s+(?:temporary|temp)\s+table/i);
    expect(report).not.toMatch(/\b(?:insert|update|delete|alter|drop)\b/i);
    expect(report.trimEnd()).toMatch(/rollback;$/);
  });

  it("excludes non-invited providers from every funnel and credit aggregate", () => {
    expect(report.match(/join members on members\.user_id = event\.user_id/g)).toHaveLength(2);
    expect(report.match(/join members on members\.user_id = ledger\.user_id/g)).toHaveLength(3);
    expect(report.match(/member\.cohort_code = 'ndis_case_note_v01'/g)).toHaveLength(5);
    expect(report.match(/greatest\(params\.starts_at, members\.enrolled_at\)/g)).toHaveLength(5);
    expect(
      report.match(/coalesce\(members\.removed_at, 'infinity'::timestamptz\)/g),
    ).toHaveLength(5);
    expect(report).not.toMatch(
      /from public\.(?:template_companion_events|credit_ledger)\s*(?:,|cross join)/,
    );
  });

  it("counts repeat only after a real 72-hour activation", () => {
    expect(report).toContain(
      "select first_seen.user_id, min(events.created_at) as activated_at",
    );
    expect(report).toContain("from activated");
    expect(report).toContain(
      "events.created_at::date > activated.activated_at::date",
    );
    expect(report).toContain(
      "events.created_at <= activated.activated_at + interval '14 days'",
    );
    expect(report).not.toContain("first_generation as");
    expect(report).toContain(
      "repeated_within_14d / nullif(activated_within_72h, 0)",
    );
  });

  it("returns only controlled dimensions and aggregate measures", () => {
    expect(report).toContain("invited_providers");
    expect(report).toContain("activation_percent");
    expect(report).toContain("utility_percent");
    expect(report).toContain("repeat_percent");
    expect(report).toContain("credit_correctness_anomalies");
    expect(report).toMatch(
      /Never return account, visitor, reservation,\s*-- idempotency, result, input, output, participant, or generated-content fields\./,
    );
  });
});
