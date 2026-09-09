import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  POINTS_PREVIEW_IDENTITY_DATABASE_FIELDS as DB_FIELDS,
  POINTS_PREVIEW_IDENTITY_POLICY as POLICY,
  POINTS_PREVIEW_IDENTITY_PROOF_SQL as SQL,
  POINTS_PREVIEW_PROVIDER_APP_METADATA as METADATA,
  PointsPreviewIdentityError,
  diagnosePointsPreviewIdentity as diagnose,
} from "./points-preview-identity-policy.mjs";

const ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "sentinel-identity-private-data-never-log";
const user = () => ({ id: ID, aud: "authenticated", role: "authenticated",
  email_confirmed_at: "2026-09-06T12:00:00.123456Z", is_anonymous: false,
  app_metadata: { ...METADATA }, email: SECRET, access_token: SECRET });
const databaseResult = () => ({ rowCount: 1,
  rows: [Object.fromEntries(DB_FIELDS.map((key) => [key, true]))] });
const options = () => ({ expectedUserId: ID,
  authResponse: { status: 200, body: user() }, databaseResult: databaseResult() });

describe("Points Preview identity diagnostics (offline only)", () => {
  it.each([200, 201])("accepts HTTP %i plus exact database boolean proof", (status) => {
    const input = options(); input.authResponse.status = status;
    const result = diagnose(input);
    expect(result.ok).toBe(true);
    expect(Object.values(result.fields).every((value) => value === true)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.fields)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(ID);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("uses authoritative metadata, never user_metadata as a fallback", () => {
    expect(METADATA).toEqual({ role: "provider", careslink_role: "provider" });
    expect(Object.isFrozen(METADATA)).toBe(true);
    const input = options(); input.authResponse.body.app_metadata = {};
    input.authResponse.body.user_metadata = METADATA;
    expect(diagnose(input).fields.response_provider_role_valid).toBe(false);
  });

  it.each([
    ["id", SECRET, "response_identity_matches"],
    ["aud", "anon", "response_aud_valid"],
    ["role", "provider", "response_auth_role_valid"],
    ["is_anonymous", true, "response_not_anonymous"],
    ["is_anonymous", undefined, "response_not_anonymous"],
    ["is_anonymous", "false", "response_not_anonymous"],
    ["email_confirmed_at", null, "response_confirmation_present"],
    ["email_confirmed_at", 1788696000000, "response_confirmation_present"],
    ["email_confirmed_at", "2026-09-06", "response_confirmation_present"],
    ["email_confirmed_at", "2026-99-99T25:99:99Z", "response_confirmation_present"],
    ["email_confirmed_at", SECRET, "response_confirmation_present"],
  ])("identifies invalid %s without recording its value", (field, value, failedKey) => {
    const input = options(); input.authResponse.body[field] = value;
    const result = diagnose(input);
    expect(result.ok).toBe(false);
    expect(result.fields[failedKey]).toBe(false);
    expect(result.fields.database_provider_role_valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it.each([undefined, null, {}, { careslink_role: "provider" },
    { role: "provider" }, { role: "admin", careslink_role: "provider" }])(
    "rejects incomplete or wrong fixture app metadata", (metadata) => {
      const input = options(); input.authResponse.body.app_metadata = metadata;
      expect(diagnose(input).ok).toBe(false);
    },
  );

  it.each([400, 401, 403, 500, "200", undefined])("rejects non-success HTTP status %s", (status) => {
    const input = options(); input.authResponse.status = status;
    expect(diagnose(input).fields.response_http_success).toBe(false);
  });

  it("does not reject a cloud timestamp ahead of the local clock", () => {
    const input = options(); input.authResponse.body.email_confirmed_at = "2099-01-01T00:00:00Z";
    const spy = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("LOCAL_CLOCK_FORBIDDEN"); });
    try { expect(diagnose(input).ok).toBe(true); } finally { spy.mockRestore(); }
    input.databaseResult.rows[0].confirmation_valid = false;
    expect(diagnose(input).ok).toBe(false);
  });

  it.each(DB_FIELDS)("requires strict database true for %s", (field) => {
    for (const value of [false, null, undefined, 1, "true"]) {
      const input = options(); input.databaseResult.rows[0][field] = value;
      const result = diagnose(input);
      expect(result.ok).toBe(false);
      expect(result.fields[`database_${field}`]).toBe(false);
    }
  });

  it.each([undefined, null, { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [] }, { rowCount: "1", rows: databaseResult().rows },
    { rowCount: 2, rows: [...databaseResult().rows, ...databaseResult().rows] },
    { rowCount: 1, rows: [null] }, { rowCount: 1, rows: [{ eligible: true }] },
    { rowCount: 1, rows: [{ ...databaseResult().rows[0], secret: SECRET }] },
  ])("fails closed on missing, ambiguous or unexpected proof shapes", (result) => {
    const input = options(); input.databaseResult = result;
    const report = diagnose(input);
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it.each([undefined, null, "", "not-a-uuid", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    "00000000-0000-0000-0000-000000000000"])("rejects invalid expected identity", (id) => {
    const input = options(); input.expectedUserId = id;
    expect(diagnose(input).ok).toBe(false);
  });

  it("ignores inherited authority and never invokes getters or proxies", () => {
    const getter = vi.fn(() => { throw new Error(SECRET); });
    for (const body of [Object.create(user()),
      Object.defineProperty(user(), "role", { get: getter }),
      new Proxy(user(), { get: getter, ownKeys: getter })]) {
      const input = options(); input.authResponse.body = body;
      expect(diagnose(input).ok).toBe(false);
    }
    const input = options();
    Object.defineProperty(input.databaseResult.rows, "0", { get: getter });
    expect(diagnose(input).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it("sanitizes errors to fixed keys/boolean diagnostics without causes", () => {
    const malicious = { fields: { ...diagnose(options()).fields, secret: SECRET } };
    const error = new PointsPreviewIdentityError("identity", malicious);
    expect(error.code).toBe(POLICY.failureCode);
    expect(error.cause).toBeUndefined();
    expect(error.diagnostics.ok).toBe(false);
    expect(`${error.stack}${JSON.stringify(error)}`).not.toContain(SECRET);
    expect(new PointsPreviewIdentityError(SECRET).checkpoint).toBe("arguments");
  });

  it("pins SELECT-only SQL, one DB time sample and the formal provider predicates", async () => {
    expect(SQL.match(/clock_timestamp\(\)/g)).toHaveLength(1);
    expect(SQL).toContain("as materialized");
    expect(SQL).toContain("where active_user.id = $1::uuid");
    expect(SQL).not.toMatch(/\b(insert|update|delete|grant|alter|create|truncate)\b/i);
    expect(SQL).not.toContain("raw_user_meta_data");
    const formal = await readFile(new URL("../../supabase/migrations/20260902012628_add_v1_authenticated_current_session_status_rpc.sql", import.meta.url), "utf8");
    for (const predicate of ["active_user.aud = 'authenticated'", "active_user.role = 'authenticated'",
      "active_user.email_confirmed_at is not null", "active_user.deleted_at is null",
      "active_user.banned_until is null", "active_user.is_anonymous is false",
      "active_user.raw_app_meta_data->>'role' = 'provider'"]) {
      expect(SQL).toContain(predicate); expect(formal).toContain(predicate);
    }
  });
});
