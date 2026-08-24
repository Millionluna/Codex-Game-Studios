import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260811102502_add_v1_privacy_review_confirmation.sql",
  ),
  "utf8",
);

const sqlAssertions = readFileSync(
  join(process.cwd(), "supabase/tests/v1_privacy_review_shadow_assertions.sql"),
  "utf8",
);

const noteFactsMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260811134719_harden_v1_note_facts_schema_and_active_sessions.sql",
  ),
  "utf8",
);

const CONFIRM_SIGNATURE =
  "uuid, uuid, text, text, text, text, text, integer, jsonb, boolean, boolean, text";

describe("V1 privacy review confirmation migration contract", () => {
  it("is a transactional Preview-only additive gate", () => {
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(migration).toContain("Preview-only privacy-review confirmation");
    expect(migration).toContain("interval '30 minutes'");
    expect(migration).toContain("'2026-08-11.preview.1'");
    expect(migration).toContain("add column request_fingerprint text");
    expect(migration).toContain(
      "request_fingerprint ~ '^[a-f0-9]{64}$'",
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|generated_material_drafts)\b/i,
    );
  });

  it("creates the private implementation schema only from an absent namespace", () => {
    expect(migration).toContain(
      "if to_regnamespace('careslink_v1_internal') is not null then",
    );
    expect(migration).toContain(
      "message = 'CARESLINK_V1_INTERNAL_SCHEMA_PREFLIGHT_REQUIRED'",
    );
    expect(migration).toContain(
      "create schema careslink_v1_internal authorization current_user",
    );
    expect(migration).not.toContain(
      "create schema if not exists careslink_v1_internal",
    );
    expect(migration).toMatch(
      /revoke all on schema careslink_v1_internal\s+from public, anon, authenticated, service_role/i,
    );
    expect(migration).toContain(
      "message = 'CARESLINK_V1_INTERNAL_SCHEMA_INVALID'",
    );
    expect(migration).toContain(
      "message = 'CARESLINK_V1_INTERNAL_FUNCTION_SET_INVALID'",
    );
    expect(migration).toContain(
      "(select count(*) from pg_proc where pronamespace = v_schema) <> 2",
    );
    expect(migration).toContain(
      "implementation.proowner = current_user::regrole",
    );
    expect(migration).toContain(
      "cardinality(implementation.proconfig) = 1",
    );
    expect(migration).toContain(
      "coalesce(to_jsonb(implementation)->>'prokind', 'f') = 'f'",
    );
    expect(migration).toContain(
      "has_schema_privilege(api_role.oid, v_schema, 'USAGE')",
    );
    expect(migration).toContain(
      "has_function_privilege(",
    );
    expect(migration).toContain("aclexplode(");
    expect(migration).toContain("from pg_auth_members as membership");
    expect(migration).toContain("from pg_depend as dependency");
  });

  it("stores only a sanitized finding and confirmation projection", () => {
    for (const table of ["privacy_review_findings", "privacy_confirmations"]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration).toMatch(
        new RegExp(
          `revoke all on public\\.${table}[\\s\\S]+?from public, anon, authenticated, service_role`,
          "i",
        ),
      );
    }

    const findings = sectionBetween(
      "create table public.privacy_review_findings",
      "create table public.privacy_confirmations",
    );
    const confirmations = sectionBetween(
      "create table public.privacy_confirmations",
      "create index privacy_review_findings_review_idx",
    );
    expect(findings).toContain("finding_type text not null");
    expect(findings).toContain("field_code text not null");
    expect(findings).toContain("start_offset bigint not null");
    expect(findings).toContain("end_offset bigint not null");
    expect(findings).toContain("'organisation_identifier'");
    expect(findings).toContain("field_code ~ '^/([^~]|~[01])*");
    expect(findings).not.toContain("source text");
    expect(confirmations).toContain("retention_purpose_confirmed boolean not null");
    expect(confirmations).toContain("privacy_confirmations_retention_purpose_check");
    for (const forbidden of [
      "raw_text",
      "raw_excerpt",
      "matched_text",
      "matched_value",
      "cleaned_facts jsonb",
      "source text",
      "access_token",
      "authorization",
    ]) {
      expect(`${findings}\n${confirmations}`).not.toContain(forbidden);
    }
  });

  it("issues one server-owned proof through a service-role-only RPC", () => {
    const confirm = functionSection("confirm_v1_shadow_privacy_review");
    expect(confirm).toContain("security definer");
    expect(confirm).toContain("set search_path = ''");
    expect(confirm).toContain("auth.jwt()->>'role'");
    expect(confirm).toContain("<> 'service_role'");
    expect(confirm).toContain("from auth.sessions");
    expect(confirm).toContain("message = 'session_revoked'");
    expect(confirm).toContain(
      "where feature_key = 'mobile_sync_v1' and enabled and shadow_only",
    );
    expect(confirm).toContain("pg_advisory_xact_lock");
    expect(confirm).toContain("idempotency_conflict");
    expect(confirm).toContain("v_confirmed_at + interval '30 minutes'");
    expect(confirm).toContain("'confirmed'");
    const locatorOrder = confirm.slice(
      confirm.indexOf("jsonb_agg(item.value order by"),
      confirm.indexOf(") into v_normalized_decisions"),
    );
    expect(locatorOrder).toMatch(
      /order by\s+convert_to\(item\.value->>'fieldcode', 'utf8'\),\s+\(item\.value->>'startoffset'\)::bigint,\s+\(item\.value->>'endoffset'\)::bigint,\s+convert_to\(item\.value->>'findingtype', 'utf8'\)/,
    );
    expect(confirm).toContain("'owneruserid', v_existing.owner_user_id");
    expect(confirm).toContain("'owneruserid', v_review.owner_user_id");
    expect(confirm).not.toContain("'contractversion', v_existing.contract_version");
    expect(confirm).not.toContain("'contractversion', v_review.contract_version");
    expect(confirm).not.toContain("when v_existing.expires_at");
    expect(confirm).not.toMatch(/p_(?:status|confirmed_at|expires_at|ttl|content)\b/);
    expect(migration).toMatch(
      new RegExp(
        `grant execute on function public\\.confirm_v1_shadow_privacy_review\\(\\s*${CONFIRM_SIGNATURE.replaceAll(", ", ",\\s*")}\\s*\\) to service_role`,
        "i",
      ),
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.confirm_v1_shadow_privacy_review[\s\S]+?to (?:anon|authenticated)/i,
    );
  });

  it("binds new create and PATCH mutations before delegating to the durable body", () => {
    const validator = functionSection("assert_v1_shadow_privacy_review");
    expect(validator).toContain("for share");
    expect(validator).toContain("review.owner_user_id = p_owner_user_id");
    expect(validator).toContain("review.note_type = p_note_type");
    expect(validator).toContain(
      "review.cleaned_facts_hash = p_cleaned_facts_hash",
    );
    expect(validator).toContain("review.schema_version = p_schema_version");
    expect(validator).toContain("review.status = 'confirmed'");
    expect(validator).toContain("review.expires_at > p_at");
    expect(validator).toContain("message = 'privacy_review_stale'");

    for (const rpc of [
      "create_v1_shadow_document",
      "append_v1_shadow_document_revision",
    ]) {
      const wrapper = publicFunctionSection(rpc);
      expect(wrapper).toContain("security definer");
      expect(wrapper).toContain("set search_path = ''");
      expect(wrapper).toContain("ai_document_mutation_receipts");
      expect(wrapper).toContain("assert_v1_shadow_privacy_review");
      expect(wrapper.indexOf("assert_v1_shadow_privacy_review")).toBeLessThan(
        wrapper.indexOf(`careslink_v1_internal.${rpc}`),
      );
    }

    expect(migration).toContain(
      "public.v1_shadow_content_sha256(p_content->'factsSummary')",
    );
    expect(migration).toContain(
      "before insert on public.ai_document_revisions",
    );
    expect(migration).toContain(
      "before insert or update on public.document_checkpoints",
    );
  });

  it("keeps every document write withheld and removes direct privacy SELECT", () => {
    expect(migration).toContain(
      "revoke select on public.privacy_reviews from authenticated",
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.(?:create_v1_shadow_document|append_v1_shadow_document_revision|save_v1_shadow_document_checkpoint|tombstone_v1_shadow_document)[\s\S]+?to\s+(?:anon|authenticated|service_role)/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.create_v1_shadow_document\([\s\S]+?from public, anon, authenticated, service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.append_v1_shadow_document_revision\([\s\S]+?from public, anon, authenticated, service_role/i,
    );
  });

  it("ships rollback assertions for issuance, binding, expiry and privileges", () => {
    expect(sqlAssertions).toMatch(/^--[\s\S]*\nbegin;/i);
    expect(sqlAssertions).toMatch(/rollback;\s*$/i);
    expect(sqlAssertions).toContain(
      "'user_deleted', 'privacy.tombstone.no-proof.0001'",
    );
    expect(sqlAssertions).not.toContain(
      "'privacy.tombstone.no-proof.0001', 'user_deleted'",
    );
    for (const evidence of [
      "Privacy confirmation replay changed the proof",
      "Expired privacy confirmation replay changed its stored ACK",
      "Privacy confirmation idempotency conflict was not rejected",
      "Revoked session unexpectedly confirmed a privacy review",
      "Non-retained finding accepted a retention confirmation field",
      "Invalid privacy finding type was accepted",
      "Invalid RFC6901 privacy field pointer was accepted",
      "Cross-owner privacy proof unexpectedly created a document",
      "Expired privacy proof unexpectedly created a document",
      "Wrong Note type privacy proof unexpectedly created a document",
      "Wrong schema privacy proof unexpectedly created a document",
      "Changed facts unexpectedly reused a privacy proof",
      "Rejected privacy proof consumed a sync change identity",
      "Expired privacy proof unexpectedly appended a revision",
      "Rejected revision consumed a sync change identity",
      "Checkpoint accepted a proof from another revision",
      "Tombstone unexpectedly required a privacy proof",
      "Authenticated role directly read privacy metadata",
      "Document write RPC unexpectedly gained EXECUTE",
    ]) {
      expect(sqlAssertions).toContain(evidence);
    }
  });
});

describe("V1 Note facts and active-session additive hardening", () => {
  it("requires the exact private implementation schema before and after hardening", () => {
    expect(noteFactsMigration).toContain(
      "message = 'CARESLINK_V1_INTERNAL_SCHEMA_PREFLIGHT_REQUIRED'",
    );
    expect(noteFactsMigration).toContain(
      "message = 'CARESLINK_V1_INTERNAL_FINAL_STATE_INVALID'",
    );
    expect(noteFactsMigration).toContain(
      "(select count(*) from pg_proc where pronamespace = v_schema) <> 2",
    );
    expect(noteFactsMigration).toContain(
      "(select count(*) from pg_proc where pronamespace = v_schema) <> 11",
    );
    expect(noteFactsMigration).toContain(
      "implementation.proowner = current_user::regrole",
    );
    expect(noteFactsMigration).toContain(
      "cardinality(implementation.proconfig) = 1",
    );
    expect(noteFactsMigration).toContain(
      "coalesce(to_jsonb(implementation)->>'prokind', 'f') = 'f'",
    );
    expect(noteFactsMigration).toContain("aclexplode(");
    expect(noteFactsMigration).toContain("from pg_auth_members as membership");
    expect(noteFactsMigration).toContain("from pg_depend as dependency");
    for (const privateBody of [
      "create_v1_shadow_document",
      "append_v1_shadow_document_revision",
      "resolve_v1_shadow_session_status_before_active_session",
      "list_v1_shadow_documents_before_active_session",
      "get_v1_shadow_document_before_active_session",
      "create_v1_shadow_document_before_note_schema",
      "append_v1_shadow_document_revision_before_note_schema",
      "save_v1_shadow_document_checkpoint_before_active_session",
      "tombstone_v1_shadow_document_before_active_session",
      "pull_v1_shadow_document_changes_before_active_session",
      "confirm_v1_shadow_privacy_review_before_active_session",
    ]) {
      expect(noteFactsMigration).toContain(
        `careslink_v1_internal.${privateBody}`,
      );
    }
  });

  it("delegates the transaction to the migration runner and leaves writes withheld", () => {
    expect(noteFactsMigration).toContain(
      "The Supabase migration runner owns the transaction",
    );
    expect(noteFactsMigration).not.toMatch(/^\s*begin;/i);
    expect(noteFactsMigration).not.toMatch(/\bcommit;\s*$/i);
    expect(noteFactsMigration).toContain("Permanent Preview hardening only");
    expect(noteFactsMigration).not.toMatch(/\bdrop\s+(?:table|column|function)\b/i);
    expect(noteFactsMigration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.(?:account_entitlements|credit_ledger|generated_material_drafts)\b/i,
    );

    for (const rpc of [
      "create_v1_shadow_document",
      "append_v1_shadow_document_revision",
      "save_v1_shadow_document_checkpoint",
      "tombstone_v1_shadow_document",
    ]) {
      expect(noteFactsMigration).toMatch(
        new RegExp(
          `revoke all on function public\\.${rpc}[\\s\\S]+?from public, anon, authenticated, service_role`,
          "i",
        ),
      );
      expect(noteFactsMigration).not.toMatch(
        new RegExp(
          `grant execute on function public\\.${rpc}[^;]+to (?:anon|authenticated|service_role)`,
          "i",
        ),
      );
    }
  });

  it("freezes the exact five Note catalogs without reflecting unknown PII keys", () => {
    const validator = functionSectionIn(
      noteFactsMigration,
      "assert_v1_shadow_note_facts",
    );
    expect(validator).toContain("immutable");
    expect(validator).toContain("security invoker");
    expect(validator).toContain("set search_path = ''");
    for (const noteType of [
      "communication",
      "handover",
      "progress",
      "ndis",
      "incident_factual",
    ]) {
      expect(validator).toContain(`when '${noteType}' then`);
    }
    for (const fieldCode of [
      "occurred_at",
      "contact_channel",
      "parties_by_role",
      "current_status",
      "support_type",
      "provided_goal_context",
      "setting_category",
      "immediate_action",
      "notification_facts",
      "unresolved_items",
    ]) {
      expect(validator).toContain(`'${fieldCode}'`);
    }
    expect(validator).toContain("jsonb_object_keys(p_facts)");
    expect(validator).toContain("message = 'VALIDATION_ERROR'");
    expect(validator).toContain("message = 'MINIMUM_FACTS_REQUIRED'");
    expect(validator).not.toMatch(/message\s*=\s*[^;]*(?:v_field|field_code)/i);
    expect(validator).not.toMatch(/(?:detail|hint)\s*=/i);
    expect(validator).toContain("[Tt]");
    expect(validator).toContain("[Zz]");
    expect(validator).toContain("([01][0-9]|2[0-3])");
    expect(validator).toContain("[0-5][0-9]");
    expect(validator).toContain("pg_catalog.make_date(");
    expect(validator).not.toContain("v_text::timestamptz");
    expect(validator).toMatch(/is distinct from\s+btrim/);
    expect(validator).toMatch(
      /if \(p_facts->>v_field\) is distinct from\s+btrim\([^\n]+\)\s+then/,
    );
    expect(validator).toContain("v_trim_chars constant text := U&'");
    for (const whitespaceCodePoint of [
      "\\0009",
      "\\000A",
      "\\000D",
      "\\00A0",
      "\\2028",
      "\\2029",
      "\\FEFF",
    ]) {
      expect(validator).toContain(whitespaceCodePoint);
    }
    expect(validator).toContain("jsonb_array_length(p_facts->v_field) = 0");
    expect(noteFactsMigration).toMatch(
      /revoke all on function public\.assert_v1_shadow_note_facts\(text, text, jsonb\)\s+from public, anon, authenticated, service_role/i,
    );
  });

  it("allows privacy finding pointers only at canonical catalog leaves", () => {
    const validator = functionSectionIn(
      noteFactsMigration,
      "assert_v1_shadow_privacy_finding_paths",
    );
    expect(validator).toContain("immutable");
    expect(validator).toContain("security invoker");
    expect(validator).toContain("set search_path = ''");
    for (const scalarPath of [
      "/occurred_at",
      "/contact_channel",
      "/current_status",
      "/support_type",
      "/provided_goal_context",
      "/notification_facts",
    ]) {
      expect(validator).toContain(`'${scalarPath}'`);
    }
    expect(validator).toContain(
      "^/parties_by_role/(0|[1-9][0-9]*)$",
    );
    expect(validator).not.toContain("'/parties_by_role'");
    expect(validator).toContain("message = 'VALIDATION_ERROR'");
    expect(validator).not.toMatch(/(?:detail|hint)\s*=/i);
    expect(noteFactsMigration).toMatch(
      /revoke all on function public\.assert_v1_shadow_privacy_finding_paths\(text, jsonb\)\s+from public, anon, authenticated, service_role/i,
    );
    expect(noteFactsMigration).toContain(
      "message = 'PRIVACY_FINDING_PATH_PREFLIGHT_REQUIRED'",
    );
    expect(noteFactsMigration).toContain(
      "join public.privacy_reviews as review",
    );

    const confirm = lastFunctionSectionIn(
      noteFactsMigration,
      "confirm_v1_shadow_privacy_review",
    );
    const activeFlag = confirm.indexOf("v1_mobile_sync_shadow_flags");
    const pathValidation = confirm.indexOf(
      "assert_v1_shadow_privacy_finding_paths",
    );
    const delegate = confirm.indexOf(
      "confirm_v1_shadow_privacy_review_before_active_session",
    );
    expect(activeFlag).toBeGreaterThanOrEqual(0);
    expect(pathValidation).toBeGreaterThan(activeFlag);
    expect(delegate).toBeGreaterThan(pathValidation);
  });

  it("validates only new mutations before the durable bodies and again in the revision trigger", () => {
    for (const rpc of [
      "create_v1_shadow_document",
      "append_v1_shadow_document_revision",
    ]) {
      const wrapper = lastFunctionSectionIn(noteFactsMigration, rpc);
      const receipt = wrapper.indexOf("ai_document_mutation_receipts");
      const validator = wrapper.indexOf("assert_v1_shadow_note_facts");
      const delegate = wrapper.indexOf("careslink_v1_internal.");
      expect(receipt).toBeGreaterThanOrEqual(0);
      expect(validator).toBeGreaterThan(receipt);
      expect(delegate).toBeGreaterThan(validator);
    }

    const trigger = lastFunctionSectionIn(
      noteFactsMigration,
      "enforce_v1_shadow_revision_privacy_review",
    );
    expect(trigger).toContain(
      "v_document.schema_version <> '2026-08-09.v1-shadow'",
    );
    expect(trigger.indexOf("assert_v1_shadow_note_facts")).toBeLessThan(
      trigger.indexOf("assert_v1_shadow_privacy_review"),
    );
  });

  it("requires an active eligible provider principal at every public session boundary", () => {
    const helper = functionSectionIn(
      noteFactsMigration,
      "v1_shadow_session_is_active",
    );
    expect(helper).toContain("security invoker");
    expect(helper).toContain("set search_path = ''");
    expect(helper).toContain("active_session.user_id = p_owner_user_id");
    expect(helper).toContain("active_session.not_after is null");
    expect(helper).toContain("active_session.not_after > p_at");
    expect(helper).toContain("join auth.users as active_user");
    expect(helper).toContain("active_user.raw_app_meta_data->>'role' = 'provider'");
    expect(helper).toContain("active_user.is_anonymous is false");
    expect(helper).toContain(
      "jsonb_typeof(active_user.raw_app_meta_data) = 'object'",
    );
    expect(helper).toContain("active_user.deleted_at is null");
    expect(helper).toContain("active_user.banned_until <= p_at");
    expect(helper).toContain("active_user.email_confirmed_at <= p_at");
    expect(helper).not.toContain("raw_user_meta_data");
    expect(helper).not.toContain("user_metadata");

    for (const rpc of [
      "resolve_v1_shadow_session_status",
      "list_v1_shadow_documents",
      "get_v1_shadow_document",
      "create_v1_shadow_document",
      "append_v1_shadow_document_revision",
      "save_v1_shadow_document_checkpoint",
      "tombstone_v1_shadow_document",
      "pull_v1_shadow_document_changes",
      "confirm_v1_shadow_privacy_review",
    ]) {
      expect(lastFunctionSectionIn(noteFactsMigration, rpc)).toContain(
        "public.v1_shadow_session_is_active(",
      );
    }
    expect(noteFactsMigration).toMatch(
      /revoke all on function public\.v1_shadow_session_is_active\(uuid, uuid, timestamptz\)\s+from public, anon, authenticated, service_role/i,
    );
  });

  it("ships rollback coverage for catalog parity, expiry and zero side effects", () => {
    for (const evidence of [
      "All-blank required Note list unexpectedly passed",
      "ECMAScript-whitespace required Note list unexpectedly passed",
      "Mixed valid/blank Note list unexpectedly passed",
      "Mixed string/non-string Note list unexpectedly passed",
      "Empty optional Note text unexpectedly passed",
      "Leading-tab Note text unexpectedly passed",
      "Leading-NBSP Note text unexpectedly passed",
      "Trailing-newline Note list item unexpectedly passed",
      "PII-shaped privacy finding pointer unexpectedly passed",
      "Unindexed string-list privacy pointer unexpectedly passed",
      "Non-canonical string-list privacy index unexpectedly passed",
      "Cross-Note privacy finding pointer unexpectedly passed",
      "PII-shaped pointer unexpectedly issued a privacy proof",
      "Rejected privacy finding pointer caused a side effect",
      "Unknown PII-shaped Note key unexpectedly passed",
      "Cross-Note facts shape unexpectedly passed",
      "Out-of-range RFC3339 date_time unexpectedly passed",
      "not_after session unexpectedly confirmed a privacy review",
      "Admin role unexpectedly resolved ACTIVE",
      "Anonymous provider unexpectedly resolved ACTIVE",
      "Banned provider unexpectedly resolved ACTIVE",
      "Deleted provider unexpectedly resolved ACTIVE",
      "Direct revision trigger accepted invalid Note facts",
      "Rejected privacy proof changed canonical mutation state",
      "Rejected privacy proof appended a revision side effect",
    ]) {
      expect(sqlAssertions).toContain(evidence);
    }
    expect(sqlAssertions).toContain('"occurred_at":"2026-08-11t00:15:30z"');
    expect(sqlAssertions).toContain(
      '"occurred_at":"2026-08-11T00:15:30.123456789012+23:59"',
    );
    expect(sqlAssertions).not.toMatch(/repeat\('[a-f]',\s*64\)/i);
  });
});

function functionSection(name: string) {
  return sectionBetween(
    `create or replace function public.${name}`,
    "$$;",
  );
}

function publicFunctionSection(name: string) {
  const start = migration.lastIndexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3).toLowerCase();
}

function functionSectionIn(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 3);
}

function lastFunctionSectionIn(source: string, name: string) {
  const start = source.lastIndexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 3);
}

function sectionBetween(startMarker: string, endMarker: string) {
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end).toLowerCase();
}
