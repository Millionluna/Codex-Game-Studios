import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260813233003_portal_referral_workflow_foundation.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const assertions = readFileSync(
  join(
    process.cwd(),
    "supabase/tests/portal_referral_workflow_foundation_assertions.sql",
  ),
  "utf8",
);

describe("Portal referral workflow migration contract", () => {
  it("is a fresh additive draft that cannot activate itself", () => {
    expect(migration).toContain("default-off and unapplied");
    expect(migration).toContain(
      "values ('referral_workflow_v1', false, true)",
    );
    expect(migration).toContain(
      "enabled boolean not null default false check (enabled = false)",
    );
    expect(migration).not.toMatch(/if not exists|on conflict/i);
    expect(migration).not.toMatch(/enabled\s*=\s*true/i);
  });

  it("defines every foundation table with RLS", () => {
    for (const table of [
      "portal_workflow_flags",
      "portal_organizations",
      "portal_organization_memberships",
      "portal_providers",
      "portal_referrals",
      "portal_referral_matches",
      "portal_referral_followups",
      "portal_referral_document_links",
      "portal_referral_exports",
      "portal_mutation_receipts",
      "portal_audit_events",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    expect(migration).toContain(
      "create table careslink_portal_private.portal_referral_contacts",
    );
    expect(migration).toContain(
      "alter table careslink_portal_private.portal_referral_contacts enable row level security",
    );
  });

  it("keeps contact data private and blocks common contact patterns in summaries", () => {
    const contacts = tableBlock(
      "careslink_portal_private.portal_referral_contacts",
    );
    expect(contacts).toContain("contact_name text");
    expect(contacts).toContain("contact_phone text");
    expect(contacts).toContain("contact_email text");

    const referral = tableBlock("public.portal_referrals");
    expect(referral).not.toMatch(/contact_(?:name|phone|email)/);
    expect(referral).toContain(
      "summary !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'",
    );
    expect(referral).toContain(
      "summary !~* '(^|[^0-9])([+]?61|0)[ ()-]*[2-478]([ ()-]*[0-9]){8}([^0-9]|$)'",
    );
    expect(referral).toContain(
      "summary !~* '(^|[^[:alpha:]])(phone|mobile|email|contact)",
    );
    for (const region of ["VIC_MELBOURNE", "VIC_GEELONG", "VIC_REGIONAL"]) {
      expect(referral).toContain(`'${region}'`);
    }
    for (const serviceType of [
      "SUPPORT_COORDINATION",
      "DAILY_LIVING_SUPPORT",
      "COMMUNITY_PARTICIPATION",
    ]) {
      expect(referral).toContain(`'${serviceType}'`);
    }
    expect(referral).not.toContain("^[A-Z][A-Z0-9_]");

    const documentLinks = tableBlock("public.portal_referral_document_links");
    expect(documentLinks).toContain(
      "references public.ai_documents(id, owner_user_id)",
    );
    expect(documentLinks).not.toMatch(/content|english_draft|facts_summary/i);
    const exports = tableBlock("public.portal_referral_exports");
    expect(exports).toContain("references public.export_jobs(id, owner_user_id)");
    expect(exports).not.toMatch(/artifact|download_url|file_bytes/i);
  });

  it("stores replay receipts as explicit metadata-only references", () => {
    const receipt = tableBlock("public.portal_mutation_receipts");
    expect(receipt).toContain("mutation_id_hash text not null");
    expect(receipt).toContain("mutation_id_hash ~ '^[a-f0-9]{64}$'");
    expect(receipt).toContain("unique (actor_user_id, mutation_id_hash)");
    expect(receipt).not.toMatch(/\bmutation_id\s+text/);
    expect(receipt).not.toMatch(/\bcorrelation_id\s+text/);
    for (const column of [
      "response_referral_id uuid",
      "response_match_id uuid",
      "response_status text",
      "response_row_version bigint",
      "response_updated_at timestamptz",
    ]) {
      expect(receipt).toContain(column);
    }
    expect(receipt).toContain(
      "foreign key (response_match_id, response_referral_id)",
    );
    expect(receipt).not.toMatch(
      /response_envelope|jsonb|contact|phone|email|token|draft|content/i,
    );

    const policy = policyBlock("portal_receipts_actor_select");
    expect(policy).toContain("actor_user_id = auth.uid()");
    expect(policy).toContain(
      "careslink_portal_private.can_read_referral(response_referral_id)",
    );
  });

  it("derives membership, admin and provider identity from active typed organizations", () => {
    const eligibility = functionBlock(
      "careslink_portal_private.current_session_is_eligible()",
    );
    expect(eligibility).toContain("v_user_id uuid := auth.uid()");
    expect(eligibility).toContain("auth.jwt()->>'session_id'");
    expect(eligibility).toContain("from auth.sessions as active_session");
    expect(eligibility).toContain("join auth.users as active_user");
    expect(eligibility).toContain("active_session.not_after");
    expect(eligibility).toContain("active_user.deleted_at is null");
    expect(eligibility).toContain("active_user.email_confirmed_at is not null");
    expect(eligibility).toContain("active_user.aud = 'authenticated'");
    expect(eligibility).toContain("active_user.role = 'authenticated'");
    expect(eligibility).not.toMatch(/raw_user_meta_data|user_metadata/i);

    const membership = functionBlock(
      "careslink_portal_private.has_active_membership(\n  p_organization_id uuid,\n  p_roles text[]\n)",
    );
    expect(membership).toContain("join public.portal_organizations");
    expect(membership).toContain("membership.user_id = auth.uid()");
    expect(membership).toContain("membership.status = 'ACTIVE'");
    expect(membership).toContain("organization.status = 'ACTIVE'");
    for (const [role, organizationType] of [
      ["platform_admin", "PLATFORM"],
      ["partner_operator", "REFERRAL_SOURCE"],
      ["referral_source", "REFERRAL_SOURCE"],
      ["provider_member", "PROVIDER"],
    ]) {
      expect(membership).toContain(`membership.role = '${role}'`);
      expect(membership).toContain(
        `organization.organization_type = '${organizationType}'`,
      );
    }
    expect(membership).toMatch(
      /membership\.role = 'partner_operator'\s+and organization\.organization_type = 'REFERRAL_SOURCE'/,
    );

    const admin = functionBlock(
      "careslink_portal_private.is_platform_admin()",
    );
    expect(admin).toContain("membership.role = 'platform_admin'");
    expect(admin).toContain("organization.organization_type = 'PLATFORM'");
    expect(admin).toContain("organization.status = 'ACTIVE'");

    const provider = functionBlock(
      "careslink_portal_private.current_provider_id()",
    );
    expect(provider).toContain("when count(*) = 1");
    expect(provider).toContain("organization.organization_type = 'PROVIDER'");
    expect(provider).toContain("organization.status = 'ACTIVE'");
    expect(provider).toContain("provider.review_status = 'APPROVED'");

    const membershipPolicy = policyBlock("portal_memberships_owner_select");
    expect(membershipPolicy).toContain("current_session_is_eligible()");
    expect(membershipPolicy).toContain("array[role]::text[]");
    const providerPolicy = policyBlock("portal_providers_owner_select");
    expect(providerPolicy).toContain("id =");
    expect(providerPolicy).toContain("current_provider_id()");
  });

  it("splits provider match, assigned workflow and audit visibility", () => {
    const referral = functionBlock(
      "careslink_portal_private.can_read_referral(\n  p_referral_id uuid\n)",
    );
    expect(referral).toContain("match.status = 'ACCEPTED'");
    expect(referral).not.toContain("match.status = 'OFFERED'");
    expect(referral).not.toContain("'DECLINED'");

    const match = functionBlock(
      "careslink_portal_private.can_read_match(\n  p_referral_id uuid\n)",
    );
    expect(match).toContain("array['partner_operator']::text[]");
    expect(match).not.toContain("'referral_source'");
    expect(match).not.toContain("current_provider_id");
    expect(match).not.toMatch(/p_provider_id|p_match_status|provider_id|status/);

    const assigned = functionBlock(
      "careslink_portal_private.can_read_assigned_workflow(\n  p_referral_id uuid\n)",
    );
    expect(assigned).toContain("accepted_match.provider_id");
    expect(assigned).toContain("accepted_match.status = 'ACCEPTED'");
    expect(assigned).toContain("referral.assigned_provider_id =");

    const contact = functionBlock(
      "careslink_portal_private.can_read_contact(\n  p_referral_id uuid\n)",
    );
    expect(contact).toContain("can_read_assigned_workflow(p_referral_id)");

    expect(policyBlock("portal_matches_visible_select")).toContain(
      "can_read_match(referral_id)",
    );
    for (const policy of [
      "portal_followups_visible_select",
      "portal_document_links_visible_select",
      "portal_exports_visible_select",
    ]) {
      expect(policyBlock(policy)).toContain(
        "can_read_assigned_workflow(referral_id)",
      );
    }

    const audit = functionBlock(
      "careslink_portal_private.can_read_audit(\n  p_referral_id uuid\n)",
    );
    expect(audit).toContain("array['partner_operator']::text[]");
    expect(audit).not.toContain("'referral_source'");
    expect(audit).not.toContain("current_provider_id");
    expect(policyBlock("portal_audit_visible_select")).toContain(
      "can_read_audit(referral_id)",
    );
    expect(migration).toContain("an offered-provider summary RPC");
    expect(migration).not.toMatch(
      /create or replace function [^(]*offered[^\n]*summary/i,
    );
  });

  it("constrains outcomes, audit transitions and audit metadata", () => {
    const matches = tableBlock("public.portal_referral_matches");
    expect(matches).not.toMatch(/\b(?:reasons|gaps|response_reason_code)\b/);

    const followups = tableBlock("public.portal_referral_followups");
    for (const outcome of [
      "CONTACT_CONFIRMED",
      "INFORMATION_REQUESTED",
      "FOLLOW_UP_SCHEDULED",
      "SERVICE_COMMENCED",
      "NO_RESPONSE",
    ]) {
      expect(followups).toContain(`'${outcome}'`);
    }
    expect(followups).not.toContain(
      "char_length(btrim(outcome_code)) between 1 and 100",
    );
    expect(followups).not.toContain("restricted_note");

    const audit = tableBlock("public.portal_audit_events");
    expect(audit).toContain("mutation_id_hash text not null");
    expect(audit).toContain("mutation_id_hash ~ '^[a-f0-9]{64}$'");
    expect(audit).toContain("correlation_id_hash text");
    expect(audit).toContain("correlation_id_hash ~ '^[a-f0-9]{64}$'");
    expect(audit).not.toMatch(/\bmutation_id\s+text/);
    expect(audit).not.toMatch(/\bcorrelation_id\s+text/);
    for (const mutationKind of [
      "CREATE_REFERRAL",
      "TRIAGE_REFERRAL",
      "OFFER_REFERRAL",
      "RESPOND_TO_OFFER",
      "RECORD_FOLLOW_UP",
      "LINK_DOCUMENT",
      "RECORD_EXPORT",
      "COMPLETE_REFERRAL",
    ]) {
      expect(audit).toContain(`'${mutationKind}'`);
    }
    expect(audit).toContain("metadata - array[");
    expect(audit).toContain("pg_column_size(metadata) <= 2048");
    expect(audit).toContain("jsonb_typeof(metadata->'decision') = 'string'");
    expect(audit).toContain("metadata->>'decision' in ('ACCEPT', 'DECLINE')");
    expect(audit).not.toMatch(
      /['"](?:contact|contactPhone|phone|email|accessToken|token|draft|content)['"]/i,
    );
  });

  it("adds support indexes for every non-leading foreign-key lookup", () => {
    for (const index of [
      "portal_referrals_source_user_idx",
      "portal_matches_offered_by_idx",
      "portal_matches_responded_by_idx",
      "portal_followups_actor_user_idx",
      "portal_document_links_document_owner_idx",
      "portal_document_links_owner_user_idx",
      "portal_document_links_created_by_idx",
      "portal_exports_job_owner_idx",
      "portal_exports_owner_user_idx",
      "portal_exports_created_by_idx",
      "portal_receipts_response_referral_idx",
      "portal_receipts_response_match_idx",
    ]) {
      expect(migration).toContain(`create index ${index}`);
    }
  });

  it("prevents multiple offered or accepted providers", () => {
    expect(migration).toMatch(
      /create unique index portal_matches_one_offered_idx[\s\S]+?where status = 'OFFERED'/,
    );
    expect(migration).toMatch(
      /create unique index portal_matches_one_accepted_idx[\s\S]+?where status = 'ACCEPTED'/,
    );
  });

  it("makes follow-up, receipt and audit rows append-only", () => {
    expect(migration.match(/before update or delete/g)).toHaveLength(3);
    for (const trigger of [
      "portal_followups_append_only",
      "portal_receipts_append_only",
      "portal_audit_append_only",
    ]) {
      expect(migration).toContain(`create trigger ${trigger}`);
    }
    expect(migration).toContain("message = 'APPEND_ONLY_RESOURCE'");
    expect(tableBlock("public.portal_audit_events")).toContain(
      "references public.portal_referrals(id) on delete restrict",
    );
    expect(tableBlock("public.portal_referral_followups")).toContain(
      "references public.portal_referrals(id) on delete restrict",
    );
    expect(tableBlock("public.portal_mutation_receipts")).toContain(
      "actor_user_id uuid not null references auth.users(id) on delete restrict",
    );
  });

  it("withholds every table grant and every state-changing RPC", () => {
    expect(migration).toMatch(
      /revoke all on table[\s\S]+?portal_audit_events[\s\S]+?from public, anon, authenticated, service_role/,
    );
    expect(migration).toContain(
      "revoke all on table careslink_portal_private.portal_referral_contacts",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:all|select|insert|update|delete)\s+on\s+(?:table\s+)?/i,
    );
    expect(migration).not.toMatch(
      /create or replace function (?:public|careslink_portal_private)\.(?:create|triage|offer|respond|record|link|complete)_portal/i,
    );
    expect(migration).not.toMatch(/grant execute[\s\S]+?to service_role/i);
    expect(migration).toContain("authenticated table SELECT grants");
    expect(migration).toContain("state-changing SECURITY DEFINER RPCs");
  });

  it("uses empty-search-path SECURITY DEFINER helpers with narrow EXECUTE ACLs", () => {
    const signatures = [
      "careslink_portal_private.current_session_is_eligible()",
      "careslink_portal_private.has_active_membership(\n  p_organization_id uuid,\n  p_roles text[]\n)",
      "careslink_portal_private.is_platform_admin()",
      "careslink_portal_private.current_provider_id()",
      "careslink_portal_private.can_read_referral(\n  p_referral_id uuid\n)",
      "careslink_portal_private.can_read_match(\n  p_referral_id uuid\n)",
      "careslink_portal_private.can_read_assigned_workflow(\n  p_referral_id uuid\n)",
      "careslink_portal_private.can_read_audit(\n  p_referral_id uuid\n)",
      "careslink_portal_private.can_read_contact(\n  p_referral_id uuid\n)",
    ];
    for (const signature of signatures) {
      const helper = functionBlock(signature);
      expect(helper).toContain("security definer");
      expect(helper).toContain("set search_path = ''");
    }

    const grantStart = migration.indexOf("grant execute on function");
    const grantEnd = migration.indexOf("to authenticated;", grantStart);
    const grant = migration.slice(
      grantStart,
      grantEnd + "to authenticated;".length,
    );
    for (const functionName of [
      "current_session_is_eligible()",
      "has_active_membership(uuid, text[])",
      "current_provider_id()",
      "can_read_referral(uuid)",
      "can_read_match(uuid)",
      "can_read_assigned_workflow(uuid)",
      "can_read_audit(uuid)",
      "can_read_contact(uuid)",
    ]) {
      expect(grant).toContain(functionName);
    }
    expect(grant).not.toContain("deny_append_only_mutation()");
    expect(grant).not.toMatch(/insert|update|delete/i);
  });

  it("ships rollback-only ACL, lifecycle, A/B, decline and redaction assertions", () => {
    expect(assertions).toMatch(/^-- Manual rollback-only assertions/);
    expect(assertions).toContain("has not been run against a DB");
    expect(assertions).toContain("begin;");
    expect(assertions.trimEnd()).toMatch(/rollback;$/);
    for (const marker of [
      "private schema ACL is unsafe",
      "unsafe SECURITY DEFINER/search_path",
      "foreign-key support index is missing",
      "Source A referral isolation failed",
      "Source B owner isolation failed",
      "Partner operator referral-tenant isolation failed",
      "Provider A raw-match isolation failed",
      "Provider B candidate/role-type isolation failed",
      "Multiple-provider membership fail-closed check failed",
      "Declined provider retained workflow visibility",
      "Exact accepted-match contact guard failed",
      "Suspended provider organization retained visibility",
      "Suspended provider review retained visibility",
      "Suspended provider membership retained visibility",
      "Suspended source organization retained visibility",
      "Suspended PLATFORM admin retained visibility",
      "Mutation receipt redaction failed",
      "Portal free-text or raw transport metadata leaked",
      "Referral region allowlist failed",
      "Referral service allowlist failed",
      "PHONE_0400000000",
      "Authenticated direct write unexpectedly succeeded",
      "Revoked Source A session retained portal visibility",
      "Temporary read grants exist only inside this rollback transaction",
    ]) {
      expect(assertions).toContain(marker);
    }
  });
});

function tableBlock(qualifiedName: string) {
  const marker = `create table ${qualifiedName} (`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n);", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

function functionBlock(signature: string) {
  const marker = `create or replace function ${signature}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 4);
}

function policyBlock(policyName: string) {
  const marker = `create policy ${policyName}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(";\n", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 1);
}
