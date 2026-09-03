import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const MIGRATION_ROOT = new URL("../../supabase/migrations/", import.meta.url);
const MIGRATION_NAME_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const NON_TRANSACTIONAL_SQL_PATTERN = /^(?:create\s+(?:unique\s+)?index\s+concurrently|drop\s+index\s+concurrently|vacuum\b|refresh\s+materialized\s+view\s+concurrently|create\s+database\b|drop\s+database\b|reindex\b[\s\S]*\bconcurrently\b)/i;

export const COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY =
  Object.freeze({
    version: "2026-09-03.preview-transactional-migrations.13",
    productionProjectRef: "adocsnwnslxhxcjgbyee",
    expectedCliVersion: "2.115.0",
    manifestSha256:
      "e7ca8a902904651070fc22adfa553c951c0703d9fa57337c268d4f8e77a661a3",
    migrationCount: 45,
    disposablePreviewBaselineMigrationCount: 19,
    disposablePreviewBaselineHistorySha256:
      "b742d12dee926ccfe76158cf524e503bcdc576a08e928a7147741faf4a314424",
    disposablePreviewBaselinePublicCatalogObjectCount: 555,
    disposablePreviewBaselinePublicCatalogSha256:
      "1bced92adab2e275fb835d3a7dc322e22e1c043fa88617844a0e32f8993e6d95",
    disposablePreviewBaselinePublicSchemaMemberCount: 31,
    disposablePreviewBaselinePublicSchemaMembersSha256:
      "598ff6f82aa455d8029751f5a1c64d48160d83caac421870c0ca584546540703",
    disposablePreviewBaselineSchemaLessDependencyCount: 147,
    disposablePreviewBaselineSchemaLessDependenciesSha256:
      "d6d48f734f5fcb78e1a8c9c029be5873acb3aa0878479254ec4d87022a0a6e12",
    disposablePreviewBaselineSchemaLessDependencyClasses: Object.freeze([
      Object.freeze({
        catalog: "pg_attrdef",
        type: "default value",
        dependencyType: "a",
        count: 42,
      }),
      Object.freeze({
        catalog: "pg_policy",
        type: "policy",
        dependencyType: "a",
        count: 5,
      }),
      Object.freeze({
        catalog: "pg_policy",
        type: "policy",
        dependencyType: "n",
        count: 4,
      }),
      Object.freeze({
        catalog: "pg_trigger",
        type: "trigger",
        dependencyType: "i",
        count: 96,
      }),
    ]),
    disposablePreviewBaselinePublicationCount: 1,
    disposablePreviewBaselinePublicationsSha256:
      "cba9c7256c4aa490d44f55977b041b204e697e39cadc1a3fc753852f46c5574e",
    disposablePreviewBaselinePublicationNamespaceCount: 0,
    disposablePreviewBaselinePublicationNamespacesSha256:
      "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    disposablePreviewBaselineEventTriggerCount: 6,
    disposablePreviewBaselineEventTriggersSha256:
      "6d1837c925aa9d98075698941042ea8239650024f102544b658041cec6cc638b",
    disposablePreviewBaselinePublicDefaultAclCount: 6,
    disposablePreviewBaselinePublicDefaultAclsSha256:
      "9b4256d913b80613e5365cded432f0c58922b596d6d4463479165865c330ecff",
    disposablePreviewBaselinePublicAcl:
      "{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner}",
    disposablePreviewBaselinePublicNonApplicationAclSha256:
      "912fbdd4eb6dbccb6af6e5772f4b8e9273ea2e731112de6344eeaa564ca97f34",
    disposablePreviewBaselinePublicComment: "standard public schema",
    disposablePreviewBaselineSchemas: Object.freeze([
      "auth",
      "extensions",
      "graphql",
      "graphql_public",
      "net",
      "pgbouncer",
      "public",
      "realtime",
      "storage",
      "supabase_functions",
      "supabase_migrations",
      "vault",
    ]),
    disposablePreviewBaselinePublicTables: Object.freeze([
      "access_codes",
      "access_requests",
      "account_entitlements",
      "ai_usage_events",
      "change_pack_events",
      "change_pack_reviews",
      "credit_ledger",
      "generated_material_drafts",
      "generated_material_events",
      "ndis_case_note_companion_claims",
      "outreach_records",
      "pilot_cohort_members",
      "provider_drafts",
      "public_conversion_events",
      "template_companion_events",
      "template_companion_quota_usage",
    ]),
    disposablePreviewBaselinePublicRoutines: Object.freeze([
      "public.account_credit_snapshot(pg_catalog.uuid)",
      "public.claim_ndis_case_note_companion_output(pg_catalog.text,pg_catalog.uuid)",
      "public.commit_account_credit(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.text,integer,integer)",
      "public.consume_template_companion_quota(pg_catalog.text,pg_catalog.text,pg_catalog.date,integer)",
      "public.get_account_credit_summary(pg_catalog.uuid)",
      "public.release_account_credit(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text)",
      "public.release_expired_account_credit_reservations(pg_catalog.uuid,timestamp with time zone)",
      "public.release_template_companion_quota(pg_catalog.text,pg_catalog.text,pg_catalog.date)",
      "public.reserve_account_credit(pg_catalog.uuid,pg_catalog.text,pg_catalog.text,pg_catalog.text)",
    ]),
    preservedSystemSchemas: Object.freeze([
      "auth",
      "extensions",
      "graphql",
      "graphql_public",
      "net",
      "pgbouncer",
      "realtime",
      "storage",
      "supabase_functions",
      "supabase_migrations",
      "vault",
    ]),
    rebuiltApplicationSchemas: Object.freeze([
      "public",
      "careslink_portal_private",
      "careslink_v1_generation",
      "careslink_v1_internal",
      "careslink_v1_runtime_broker",
    ]),
    applicationRoles: Object.freeze([
      "careslink_v1_generation_executor",
      "careslink_v1_generation_owner",
      "careslink_v1_generation_owner_api_executor",
      "careslink_v1_generation_points_admission_executor",
      "careslink_v1_generation_points_settlement_executor",
      "careslink_v1_generation_registration_control_executor",
      "careslink_v1_preview_authorization_executor",
      "careslink_v1_preview_authorization_registration_caller",
      "careslink_v1_preview_authorization_revocation_caller",
      "careslink_v1_preview_dispatch_caller",
      "careslink_v1_preview_dispatch_executor",
      "careslink_v1_preview_receipt_caller",
      "careslink_v1_preview_receipt_executor",
      "careslink_v1_preview_runner_terminal_caller",
      "careslink_v1_preview_runner_terminal_executor",
    ]),
    protectedApplicationAclGrants: Object.freeze([
      "function|extensions.digest(bytea, text)|careslink_v1_generation_executor|EXECUTE|plain|postgres",
      "function|extensions.digest(bytea, text)|careslink_v1_generation_owner_api_executor|EXECUTE|plain|postgres",
      "function|extensions.digest(bytea, text)|careslink_v1_preview_authorization_executor|EXECUTE|plain|postgres",
      "function|extensions.digest(bytea, text)|careslink_v1_preview_dispatch_executor|EXECUTE|plain|postgres",
      "function|extensions.digest(bytea, text)|careslink_v1_preview_receipt_executor|EXECUTE|plain|postgres",
      "function|extensions.digest(bytea, text)|careslink_v1_preview_runner_terminal_executor|EXECUTE|plain|postgres",
      "function|extensions.gen_random_bytes(integer)|careslink_v1_generation_executor|EXECUTE|plain|postgres",
      "function|extensions.gen_random_bytes(integer)|careslink_v1_preview_dispatch_executor|EXECUTE|plain|postgres",
      "function|extensions.gen_random_uuid()|careslink_v1_generation_executor|EXECUTE|plain|postgres",
      "function|extensions.gen_random_uuid()|careslink_v1_generation_owner_api_executor|EXECUTE|plain|postgres",
      "function|extensions.gen_random_uuid()|careslink_v1_generation_points_admission_executor|EXECUTE|plain|postgres",
      "schema|extensions|careslink_v1_generation_executor|USAGE|plain|postgres",
      "schema|extensions|careslink_v1_generation_owner_api_executor|USAGE|plain|postgres",
      "schema|extensions|careslink_v1_generation_points_admission_executor|USAGE|plain|postgres",
      "schema|extensions|careslink_v1_preview_authorization_executor|USAGE|plain|postgres",
      "schema|extensions|careslink_v1_preview_dispatch_executor|USAGE|plain|postgres",
      "schema|extensions|careslink_v1_preview_receipt_executor|USAGE|plain|postgres",
      "schema|extensions|careslink_v1_preview_runner_terminal_executor|USAGE|plain|postgres",
      "schema|public|careslink_v1_generation_executor|USAGE|plain|pg_database_owner",
      "schema|public|careslink_v1_generation_owner_api_executor|USAGE|plain|pg_database_owner",
      "schema|public|careslink_v1_generation_points_admission_executor|USAGE|plain|pg_database_owner",
      "schema|public|careslink_v1_generation_points_settlement_executor|USAGE|plain|pg_database_owner",
      "schema|public|careslink_v1_preview_authorization_executor|USAGE|plain|pg_database_owner",
      "schema|public|careslink_v1_preview_dispatch_executor|USAGE|plain|pg_database_owner",
      "schema|public|careslink_v1_preview_receipt_executor|USAGE|plain|pg_database_owner",
      "schema|public|careslink_v1_preview_runner_terminal_executor|USAGE|plain|pg_database_owner",
    ]),
    applicationName: "careslink-preview-transactional-migrations",
    maximumMigrationBytes: 8 * 1_024 * 1_024,
    maximumStdinBytes: 65_536,
  });

export const COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_MANIFEST =
  Object.freeze([
    ["20260625125102_create_provider_drafts.sql", "c46c3c5befd7973145ce0f2c290dce68e3ef48916c3f85ab6b5f4239331557c8"],
    ["20260626032304_create_generated_material_drafts.sql", "2efb52a60e7b09beddd109a680e972389660b83a4c3a85762aed2e4b77eddaeb"],
    ["20260626090100_create_generated_material_events.sql", "7f82062c5fd6f6f000fcbc49aced4c9198abd9b0e1650a263a58db0ba524d694"],
    ["20260626122012_create_access_control_tables.sql", "ed574fd520cd76beec3cbaf989084276c31ad6cc3e4bac47551b0de2a68c8ab3"],
    ["20260629122000_create_outreach_records.sql", "ed69e72c93f4c63812d4878116319f740c59586c525522afd82e41b1ea373413"],
    ["20260723113000_create_ndis_case_note_companion.sql", "4017b9a31713dfcd5cb3191f9df87be42329c5eb32d1b107fd991a169a4ff5e7"],
    ["20260804143000_add_generated_material_owner_read_delete_policies.sql", "6d4d2ec04fead6292f28be7725af0ceec858bf431aa148553f1cb90842d90b26"],
    ["20260804190000_create_account_credit_entitlements.sql", "c8e43797b3fb636c65bede08a5164feca32d78f652063a63d5efc104f34f667d"],
    ["20260804193000_tighten_account_credit_table_privileges.sql", "2412ce860dba4e230e08947d5a57950cb0e7cf834783f9d806498b98ab1c4bd0"],
    ["20260804194500_fix_new_entitlement_effective_time.sql", "4b3604cd949e0397ae3b9db468501bc518d6d544f80468018028f2f5f34d2a47"],
    ["20260804203500_add_companion_pilot_attribution_events.sql", "4bf941e89a0500c0abc0151307b422073a91cf89df5671c23297b331460f05d8"],
    ["20260804223000_create_ndis_case_note_pilot_cohort.sql", "9cc35b09539ca392dc052884cd5eb32748534b3aa886365b90c9acb0114d65b4"],
    ["20260809120000_create_v1_shadow_foundation.sql", "c46282f095a7bb8052a91a0cc4118b74c187c00b7d1eaf25cdee67540d2a2c37"],
    ["20260809150000_create_ndis_shadow_preview_integration.sql", "4ee60e17fb7339cc005e114c2310ea38a25abc4c9d0a5c40615526af749a0428"],
    ["20260810072017_harden_ndis_shadow_projection_and_tombstone.sql", "a71848a1b339e2a5b22698a8522ad0d591c2161ecbd40ee0437218c82e86b249"],
    ["20260810072952_fail_close_legacy_ndis_shadow_identity.sql", "12f2f9cd8f0133aa5af6038bf091a38bf0adfbfb1d4f31e9157e8821745378fc"],
    ["20260810073519_preserve_purged_ndis_shadow_terminal_state.sql", "9fc8c57cfb397273aa76de0681b0336b37709e80012c31e9cd02c20f77a941cb"],
    ["20260810073929_reconcile_pending_ndis_delete_cleanup.sql", "e0fed530624fcecc53a23909ebe7db0617ef3dee795627a22d3d5f07434fdb68"],
    ["20260810080048_harden_ndis_shadow_tombstone_generations.sql", "e5de05dbd540db61877d70849f6e04a6748ad98229203f72810593e8b04444d4"],
    ["20260810131648_add_v1_mobile_sync_shadow.sql", "c3cc86e7798857708d733faa29ea3d0c3d213592c0391db6d60991d46368d5ef"],
    ["20260810135000_harden_shadow_points_grant_identity.sql", "348de3d98e06bd6a91e4281d4822b2b7b4e293d6a750fd3a84bc41129e46532e"],
    ["20260811102502_add_v1_privacy_review_confirmation.sql", "7f884c314073d95ddc02ba1276f322c77c55964b43374ae6dc6d217ab536cad8"],
    ["20260811134719_harden_v1_note_facts_schema_and_active_sessions.sql", "ade77343d4ab82d6679887db00485c4ea55c4a38e7429cb2ac833bd0b89c1815"],
    ["20260813233003_portal_referral_workflow_foundation.sql", "133b657281b11046696f3e3073b9507b0df748afa51c9610a81b6ec9bed1c068"],
    ["20260820135834_add_v1_note_generation_durable_shadow.sql", "14aacc292ac916b18c2780dc54c89553059b2fa84fbec07e6c720cb780d14f10"],
    ["20260821071044_add_v1_note_generation_worker_rpc_shadow.sql", "93c377bc486d983f98198a1693e52cc8ba9a8a59234f1e2853a05f80025eb7be"],
    ["20260823213144_harden_v1_note_generation_registration_retention.sql", "7316ad7b575f2365c9a8dbe93839d8ed5368ef4f65e21c84b14d001437981970"],
    ["20260824092037_add_v1_note_generation_owner_runtime_rpc_shadow.sql", "64626d770fc4f0effb3c8f14ef6d0afdf71250ef2491373ac15cdce52cbf0661"],
    ["20260824110537_add_v1_note_generation_worker_registration_retirement_shadow.sql", "16ed97464591ac5c13d00a84c3e9b258c093f6eac44d183ae0d4856dd099979e"],
    ["20260824124725_add_portal_referral_intake_runtime.sql", "5a98154b254050b3140f5f185d52e3ff7e070da05fbdfa99dbdd60665b382e1c"],
    ["20260825110251_add_portal_referral_source_detail_runtime.sql", "8e58ad2d7fcf68400925604b459dc972be7f7ef8608b1b496d5217a99ec0dc4e"],
    ["20260825120908_add_portal_referral_assignment_runtime.sql", "1478122a147dddaffcdfb07aa6dfc29b0162ba27342480984bb6fb96152e3416"],
    ["20260825153340_add_portal_referral_provider_response_runtime.sql", "256f713df793d4cbae5b6c63119f2acb26460f73bf963ffde3f72f465384e0a6"],
    ["20260826090841_add_portal_referral_follow_up_runtime.sql", "cb904d048827ff16603b19a1116f33529cba134471fe1555cfd0ea858d6fb99e"],
    ["20260827142156_add_communication_note_preview_execution_authority_shadow.sql", "94f83498ea04053e7238a95bb9be0bb8a38ad0a76fa0e751390419800da51f7f"],
    ["20260828034704_add_communication_note_preview_custody_callers_shadow.sql", "e6b77e76406d8db1d68ad6e8da0d9d2dd88521c713047c0415aa60d29243d432"],
    ["20260828235426_harden_communication_note_preview_reservation_runner_terminal_shadow.sql", "09e69476de4b5b1b925a281f2943ef541e289aab6bef60ad92aace14d0c6d432"],
    ["20260829011323_add_communication_note_preview_signed_terminal_caller_shadow.sql", "4c13bf50d7866a4b948475b598bb1c103fb625e59824be98c4e272c659da283f"],
    ["20260829041316_align_communication_note_preview_terminal_accepted_usage.sql", "3d2cc53df3cf17ea21a4f93aaf673f8e911fcc9a35b5309cf7c633c6802e448e"],
    ["20260830065750_add_communication_note_preview_runtime_credential_broker.sql", "64dcb8c57f2c73d3fbd5adc99e3261f8e2e0ddd8e8efcf5cca52c12ca34ba5aa"],
    ["20260902012628_add_v1_authenticated_current_session_status_rpc.sql", "cc2dcb0cb31f73bb87b53a0f69a1e0d21fdeb744fb63af3ecfec56009166b0cb"],
    ["20260902052755_add_v1_communication_note_points_preview.sql", "5615844b3e5786b5d6256bafb08e0e8707fe83d28d4239cf01d7cf584beb1c08"],
    ["20260902063211_add_v1_communication_note_points_admission.sql", "7029f48142dac3f2afa5e930930791c2cdbe6e82db283d4616656caae13746ec"],
    ["20260902121601_add_v1_communication_note_points_terminal_settlement.sql", "6e5148f3e080ab767f586c27c86490ac1c05b80deed864f48783c331bbf41afd"],
    ["20260903041819_bind_v1_communication_note_encrypted_payload_admission.sql", "f264ca0b7569c72273613e451b9742269d36fce290dcc0991f874d7426164f3f"],
  ].map(([basename, sha256]) => Object.freeze({ basename, sha256 })));

const OUTER_TRANSACTION_MIGRATIONS = new Set([
  "20260804143000_add_generated_material_owner_read_delete_policies.sql",
  "20260809120000_create_v1_shadow_foundation.sql",
  "20260809150000_create_ndis_shadow_preview_integration.sql",
  "20260810072017_harden_ndis_shadow_projection_and_tombstone.sql",
  "20260810072952_fail_close_legacy_ndis_shadow_identity.sql",
  "20260810073519_preserve_purged_ndis_shadow_terminal_state.sql",
  "20260810073929_reconcile_pending_ndis_delete_cleanup.sql",
  "20260810080048_harden_ndis_shadow_tombstone_generations.sql",
  "20260810131648_add_v1_mobile_sync_shadow.sql",
  "20260810135000_harden_shadow_points_grant_identity.sql",
  "20260811102502_add_v1_privacy_review_confirmation.sql",
  "20260824124725_add_portal_referral_intake_runtime.sql",
  "20260825110251_add_portal_referral_source_detail_runtime.sql",
  "20260825120908_add_portal_referral_assignment_runtime.sql",
  "20260825153340_add_portal_referral_provider_response_runtime.sql",
  "20260826090841_add_portal_referral_follow_up_runtime.sql",
  "20260828235426_harden_communication_note_preview_reservation_runner_terminal_shadow.sql",
  "20260829011323_add_communication_note_preview_signed_terminal_caller_shadow.sql",
  "20260829041316_align_communication_note_preview_terminal_accepted_usage.sql",
  "20260830065750_add_communication_note_preview_runtime_credential_broker.sql",
  "20260902012628_add_v1_authenticated_current_session_status_rpc.sql",
  "20260902052755_add_v1_communication_note_points_preview.sql",
  "20260902063211_add_v1_communication_note_points_admission.sql",
  "20260902121601_add_v1_communication_note_points_terminal_settlement.sql",
  "20260903041819_bind_v1_communication_note_encrypted_payload_admission.sql",
]);

const FIXED_ERROR_CODES = new Set([
  "TRANSACTIONAL_MIGRATION_MANIFEST_INVALID",
  "TRANSACTIONAL_MIGRATION_FILE_INVALID",
  "TRANSACTIONAL_MIGRATION_SQL_INVALID",
  "TRANSACTIONAL_MIGRATION_HISTORY_INVALID",
]);

export class CommunicationNotePreviewTransactionalMigrationPolicyError extends Error {
  constructor(code) {
    const fixed = FIXED_ERROR_CODES.has(code)
      ? code
      : "TRANSACTIONAL_MIGRATION_SQL_INVALID";
    super(fixed);
    this.name = "CommunicationNotePreviewTransactionalMigrationPolicyError";
    this.code = fixed;
  }
}

function fail(code) {
  throw new CommunicationNotePreviewTransactionalMigrationPolicyError(code);
}

export async function loadPinnedCommunicationNotePreviewMigrations() {
  const expectedBasenames = COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_MANIFEST
    .map((entry) => entry.basename);
  const actualBasenames = (await readdir(MIGRATION_ROOT))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (
    actualBasenames.length !== expectedBasenames.length ||
    actualBasenames.some((name, index) => name !== expectedBasenames[index])
  ) {
    fail("TRANSACTIONAL_MIGRATION_MANIFEST_INVALID");
  }
  const migrations = [];
  for (const entry of COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_MANIFEST) {
    const sourceBuffer = await readFile(new URL(entry.basename, MIGRATION_ROOT));
    if (
      sourceBuffer.length === 0 ||
      sourceBuffer.length >
        COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY
          .maximumMigrationBytes ||
      sha256(sourceBuffer) !== entry.sha256
    ) {
      fail("TRANSACTIONAL_MIGRATION_FILE_INVALID");
    }
    const match = MIGRATION_NAME_PATTERN.exec(entry.basename);
    if (!match) fail("TRANSACTIONAL_MIGRATION_FILE_INVALID");
    const source = sourceBuffer.toString("utf8");
    const statements = splitSupabaseCliMigrationStatements(source);
    const executionStatements = prepareExecutionStatements(
      entry.basename,
      statements,
      source,
    );
    migrations.push(Object.freeze({
      basename: entry.basename,
      sha256: entry.sha256,
      version: match[1],
      name: match[2],
      statements: Object.freeze(statements),
      executionSql: `${executionStatements.join(";\n")};`,
      outerTransactionRemoved: OUTER_TRANSACTION_MIGRATIONS.has(
        entry.basename,
      ),
    }));
  }
  const manifestSha256 = sha256(
    migrations.map((migration) =>
      `${migration.basename}:${migration.sha256}\n`
    ).join(""),
  );
  if (
    migrations.length !==
      COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY
        .migrationCount ||
    manifestSha256 !==
      COMMUNICATION_NOTE_PREVIEW_TRANSACTIONAL_MIGRATION_POLICY.manifestSha256
  ) {
    fail("TRANSACTIONAL_MIGRATION_MANIFEST_INVALID");
  }
  return Object.freeze({
    migrations: Object.freeze(migrations),
    manifestSha256,
    outerTransactionCount: migrations.filter(
      (migration) => migration.outerTransactionRemoved,
    ).length,
  });
}

export function splitSupabaseCliMigrationStatements(source) {
  if (typeof source !== "string" || source.length === 0) {
    fail("TRANSACTIONAL_MIGRATION_SQL_INVALID");
  }

  // Supabase CLI 2.115.0 delegates migration parsing to parser.SplitAndTrim.
  // This finite-state traversal is kept in parity with that implementation so
  // the pinned statements recorded in schema_migrations match CLI semantics.
  const statements = [];
  let state = new ReadySqlState();
  let accumulator = "";
  for (const rune of Array.from(source)) {
    accumulator += rune;
    const next = state.next(rune, accumulator);
    if (next === null) {
      const statement = trimSupabaseCliStatement(accumulator);
      if (statement.length > 0) statements.push(statement);
      accumulator = "";
      state = new ReadySqlState();
    } else {
      state = next;
    }
  }
  if (accumulator.length > 0) {
    const statement = trimSupabaseCliStatement(accumulator);
    if (statement.length > 0) statements.push(statement);
  }
  if (statements.length === 0) fail("TRANSACTIONAL_MIGRATION_SQL_INVALID");
  return statements;
}

const BEGIN_ATOMIC = "ATOMIC";
const END_ATOMIC = "END";

class ReadySqlState {
  next(rune, data) {
    switch (rune) {
      case "$":
        return new TagSqlState(data.length - rune.length);
      case "'":
      case '"':
        return new QuoteSqlState(rune);
      case "-":
        return new CommentSqlState();
      case "/":
        return new BlockSqlState();
      case "\\":
        return new EscapeSqlState();
      case ";":
        return null;
      case "(":
        return new AtomicSqlState(new ReadySqlState(), ")");
      case "c":
      case "C":
        if (isBeginAtomic(data)) {
          return new AtomicSqlState(new ReadySqlState(), END_ATOMIC);
        }
        return this;
      default:
        return this;
    }
  }
}

class CommentSqlState {
  next(rune, data) {
    if (rune === "-") return new DollarSqlState("\n");
    return new ReadySqlState().next(rune, data);
  }
}

class BlockSqlState {
  constructor() {
    this.depth = 0;
  }

  next(rune, data) {
    const window = data.slice(-2);
    if (window === "/*") {
      this.depth += 1;
      return this;
    }
    if (this.depth === 0) return new ReadySqlState().next(rune, data);
    if (window === "*/") {
      this.depth -= 1;
      if (this.depth === 0) return new ReadySqlState();
    }
    return this;
  }
}

class QuoteSqlState {
  constructor(delimiter) {
    this.delimiter = delimiter;
    this.escape = false;
  }

  next(rune, data) {
    if (this.escape) {
      if (rune === this.delimiter) {
        this.escape = false;
        return this;
      }
      return new ReadySqlState().next(rune, data);
    }
    if (rune === this.delimiter) this.escape = true;
    return this;
  }
}

class DollarSqlState {
  constructor(delimiter) {
    this.delimiter = delimiter;
  }

  next(_rune, data) {
    if (data.slice(-this.delimiter.length) === this.delimiter) {
      return new ReadySqlState();
    }
    return this;
  }
}

class TagSqlState {
  constructor(offset) {
    this.offset = offset;
  }

  next(rune, data) {
    if (rune === "$") return new DollarSqlState(data.slice(this.offset));
    if (/[\p{L}\p{Nd}_]/u.test(rune)) return this;
    return new ReadySqlState().next(rune, data);
  }
}

class EscapeSqlState {
  next() {
    return new ReadySqlState();
  }
}

class AtomicSqlState {
  constructor(previous, delimiter) {
    this.previous = previous;
    this.delimiter = delimiter;
  }

  next(rune, data) {
    const current = this.previous.next(rune, data);
    if (current !== null) this.previous = current;
    if (this.previous instanceof ReadySqlState) {
      const window = data.slice(-this.delimiter.length);
      if (window.toUpperCase() === this.delimiter.toUpperCase()) {
        return new ReadySqlState();
      }
    }
    return this;
  }
}

function isBeginAtomic(data) {
  let offset = data.length - BEGIN_ATOMIC.length;
  if (
    offset < 0 ||
    data.slice(offset).toUpperCase() !== BEGIN_ATOMIC
  ) {
    return false;
  }
  if (offset > 0 && isSqlIdentifierRune(data[offset - 1])) return false;
  const prefix = data.slice(0, offset).replace(/\s+$/u, "");
  offset = prefix.length - "BEGIN".length;
  if (
    offset < 0 ||
    prefix.slice(offset).toUpperCase() !== "BEGIN"
  ) {
    return false;
  }
  if (offset === 0) return true;
  return !isSqlIdentifierRune(prefix[offset - 1]);
}

function isSqlIdentifierRune(rune) {
  return /[\p{L}\p{Nd}_$]/u.test(rune);
}

function trimSupabaseCliStatement(statement) {
  return statement.replace(/;+$/u, "").trim();
}

export function validateCommunicationNotePreviewMigrationHistory(
  rows,
  migrations,
) {
  if (!Array.isArray(rows) || !Array.isArray(migrations)) {
    fail("TRANSACTIONAL_MIGRATION_HISTORY_INVALID");
  }
  if (rows.length > migrations.length) {
    fail("TRANSACTIONAL_MIGRATION_HISTORY_INVALID");
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const migration = migrations[index];
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      String(row.version ?? "") !== migration.version ||
      row.name !== migration.name ||
      !sameStringArray(row.statements, migration.statements)
    ) {
      fail("TRANSACTIONAL_MIGRATION_HISTORY_INVALID");
    }
  }
  return Object.freeze({
    appliedCount: rows.length,
    pending: Object.freeze(migrations.slice(rows.length)),
  });
}

function sameStringArray(value, expected) {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) =>
      typeof item === "string" && item === expected[index]
    );
}

function prepareExecutionStatements(basename, statements, source) {
  if (
    source.charCodeAt(0) === 0xfeff ||
    source.split(/\r?\n/u, 1)[0] === "-- pg-delta: transaction=false" ||
    statements.some((statement) =>
      NON_TRANSACTIONAL_SQL_PATTERN.test(statementCommand(statement))
    )
  ) {
    fail("TRANSACTIONAL_MIGRATION_SQL_INVALID");
  }
  const first = statementCommand(statements[0]);
  const last = statementCommand(statements.at(-1));
  const wrapped = /^(?:begin|begin\s+transaction)$/u.test(first) &&
    /^(?:commit|commit\s+transaction)$/u.test(last);
  const expectedWrapped = OUTER_TRANSACTION_MIGRATIONS.has(basename);
  if (wrapped !== expectedWrapped) {
    fail("TRANSACTIONAL_MIGRATION_SQL_INVALID");
  }
  const execution = wrapped ? statements.slice(1, -1) : [...statements];
  if (
    execution.length === 0 ||
    execution.some(isTransactionControlStatement)
  ) {
    fail("TRANSACTIONAL_MIGRATION_SQL_INVALID");
  }
  return execution;
}

export function isTransactionControlStatement(statement) {
  return /^(?:begin\b|start\s+transaction\b|commit\b|end\b|rollback\b|abort\b|savepoint\b|release(?:\s+savepoint)?\b|prepare\s+transaction\b|set\s+transaction\b)/u.test(
    statementCommand(statement),
  );
}

function statementCommand(statement) {
  const value = stripLeadingSqlTrivia(String(statement));
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function stripLeadingSqlTrivia(value) {
  let index = 0;
  while (index < value.length) {
    while (index < value.length && /\s/u.test(value[index])) index += 1;
    if (value.startsWith("--", index)) {
      const newline = value.indexOf("\n", index + 2);
      if (newline < 0) return "";
      index = newline + 1;
      continue;
    }
    if (!value.startsWith("/*", index)) break;
    let depth = 1;
    index += 2;
    while (index < value.length && depth > 0) {
      if (value.startsWith("/*", index)) {
        depth += 1;
        index += 2;
      } else if (value.startsWith("*/", index)) {
        depth -= 1;
        index += 2;
      } else {
        index += 1;
      }
    }
    if (depth !== 0) fail("TRANSACTIONAL_MIGRATION_SQL_INVALID");
  }
  return value.slice(index);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
