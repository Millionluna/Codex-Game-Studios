import { types as nodeTypes } from "node:util";

export const POINTS_PREVIEW_IDENTITY_POLICY = Object.freeze({
  version: "2026-09-06.points-preview-identity.1",
  evidenceStage: "points_preview_identity",
  failureCode: "POINTS_PREVIEW_IDENTITY_FAILED",
  supabaseCliVersion: "2.115.0",
});

// Authoritative app metadata, never user-editable user_metadata. This is the
// synthetic fixture contract, not a change to application authorization.
export const POINTS_PREVIEW_PROVIDER_APP_METADATA = Object.freeze({
  role: "provider",
  careslink_role: "provider",
});

export const POINTS_PREVIEW_IDENTITY_DATABASE_FIELDS = Object.freeze([
  "identity_matches", "aud_valid", "auth_role_valid", "confirmation_valid",
  "not_deleted", "not_banned", "not_anonymous", "provider_role_valid",
  "legacy_role_valid",
]);

// One database-clock sample for all time predicates. This is SELECT-only and
// exact-owner parameterized. Run only via an attested disposable branch adapter.
// It proves user eligibility, NOT a live session; the real login/session RPC
// remains an independent, mandatory test after this fixture gate.
export const POINTS_PREVIEW_IDENTITY_PROOF_SQL = `with verification_time as materialized (
  select pg_catalog.clock_timestamp() as checked_at
)
select
  active_user.id = $1::uuid as identity_matches,
  active_user.aud = 'authenticated' as aud_valid,
  active_user.role = 'authenticated' as auth_role_valid,
  active_user.email_confirmed_at is not null
    and active_user.email_confirmed_at <= verification_time.checked_at as confirmation_valid,
  active_user.deleted_at is null as not_deleted,
  (active_user.banned_until is null
    or active_user.banned_until <= verification_time.checked_at) as not_banned,
  active_user.is_anonymous is false as not_anonymous,
  pg_catalog.jsonb_typeof(active_user.raw_app_meta_data) = 'object'
    and active_user.raw_app_meta_data->>'role' = 'provider' as provider_role_valid,
  pg_catalog.jsonb_typeof(active_user.raw_app_meta_data) = 'object'
    and active_user.raw_app_meta_data->>'careslink_role' = 'provider' as legacy_role_valid
from auth.users as active_user
cross join verification_time
where active_user.id = $1::uuid`;

export function isPointsPreviewUserId(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

// Do not invoke accessors/proxies while extracting or reporting diagnostics.
function record(value) {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((d) => !Object.hasOwn(d, "value"))) return null;
  return value;
}

function own(value, key) {
  const object = record(value);
  return object && Object.hasOwn(object, key) ? object[key] : undefined;
}

function timestampPresent(value) {
  // Validate representation only; NEVER compare an Auth timestamp to Date.now.
  return typeof value === "string" && value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

/** Returns only fixed keys/booleans; no raw response, identity or cause escapes. */
export function diagnosePointsPreviewIdentity({
  expectedUserId, authResponse, databaseResult,
}) {
  const user = own(authResponse, "body");
  const metadata = own(user, "app_metadata");
  const rows = own(databaseResult, "rows");
  const unique = own(databaseResult, "rowCount") === 1 &&
    Array.isArray(rows) && !nodeTypes.isProxy(rows) && rows.length === 1 &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(rows, "0") ?? {}, "value");
  const row = unique ? record(rows[0]) : null;
  const rowShape = row !== null && Object.keys(row).length ===
    POINTS_PREVIEW_IDENTITY_DATABASE_FIELDS.length &&
    POINTS_PREVIEW_IDENTITY_DATABASE_FIELDS.every((key) => Object.hasOwn(row, key));
  const fields = {
    expected_identity_valid: isPointsPreviewUserId(expectedUserId),
    response_http_success: [200, 201].includes(own(authResponse, "status")),
    response_identity_matches: isPointsPreviewUserId(expectedUserId) &&
      own(user, "id") === expectedUserId,
    response_aud_valid: own(user, "aud") === "authenticated",
    response_auth_role_valid: own(user, "role") === "authenticated",
    response_confirmation_present: timestampPresent(own(user, "email_confirmed_at")),
    response_not_anonymous: own(user, "is_anonymous") === false,
    response_provider_role_valid: own(metadata, "role") === "provider",
    response_legacy_role_valid: own(metadata, "careslink_role") === "provider",
    database_row_unique: unique,
    database_row_shape_valid: rowShape,
  };
  for (const key of POINTS_PREVIEW_IDENTITY_DATABASE_FIELDS) {
    fields[`database_${key}`] = rowShape && own(row, key) === true;
  }
  return Object.freeze({
    stage: POINTS_PREVIEW_IDENTITY_POLICY.evidenceStage,
    policy: POINTS_PREVIEW_IDENTITY_POLICY.version,
    ok: Object.values(fields).every((value) => value === true),
    fields: Object.freeze(fields),
  });
}

export class PointsPreviewIdentityError extends Error {
  constructor(checkpoint, diagnostics) {
    super(POINTS_PREVIEW_IDENTITY_POLICY.failureCode);
    this.name = "PointsPreviewIdentityError";
    this.code = POINTS_PREVIEW_IDENTITY_POLICY.failureCode;
    this.checkpoint = ["arguments", "cli_version", "branch_before_query",
      "database_query", "database_scope", "branch_after_query", "identity"]
      .includes(checkpoint) ? checkpoint : "arguments";
    // Reconstruct from the fixed diagnostic allowlist, never attach caller data.
    if (checkpoint === "identity" && diagnostics) {
      const template = diagnosePointsPreviewIdentity({});
      this.diagnostics = Object.freeze({
        stage: template.stage, policy: template.policy, ok: false,
        fields: Object.freeze(Object.fromEntries(Object.keys(template.fields)
          .map((key) => [key, own(own(diagnostics, "fields"), key) === true]))),
      });
    }
  }
}
