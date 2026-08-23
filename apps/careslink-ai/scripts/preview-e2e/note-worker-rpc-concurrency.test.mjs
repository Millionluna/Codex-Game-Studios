import { describe, expect, it } from "vitest";
import {
  NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES,
  NOTE_WORKER_RPC_CONCURRENCY_POLICY,
  NoteWorkerRpcConcurrencyPolicyError,
  assertConcurrencyPolicyRegression,
  assertNoteWorkerRpcConcurrencyPolicyRegression,
  parsePreviewDatabaseTarget,
  validateNoteWorkerRpcConcurrencyDatabaseUrl,
} from "./note-worker-rpc-concurrency-policy.mjs";

const PREVIEW_REF = "abcdefghijklmnopqrst";
const OTHER_PREVIEW_REF = "zyxwvutsrqponmlkjihg";
const PRODUCTION_REF = "adocsnwnslxhxcjgbyee";
const RUNNER_ROLE = "careslink_v1_generation_concurrency_runner";
const SECRET = "do-not-leak-this-password";
const TLS_QUERY =
  "sslmode=verify-full&sslrootcert=%2Fetc%2Fssl%2Fcerts%2Fca-certificates.crt";

function directUrl({
  ref = PREVIEW_REF,
  port = "5432",
  database = "postgres",
  query = TLS_QUERY,
  username = RUNNER_ROLE,
  password = SECRET,
} = {}) {
  return `postgresql://${username}:${password}@db.${ref}.supabase.co:${port}/${database}?${query}`;
}

function poolerUrl({
  ref = PREVIEW_REF,
  port = "5432",
  database = "postgres",
  query = TLS_QUERY,
  username = `${RUNNER_ROLE}.${ref}`,
  password = SECRET,
  hostname = "aws-0-ap-southeast-2.pooler.supabase.com",
} = {}) {
  return `postgres://${username}:${password}@${hostname}:${port}/${database}?${query}`;
}

function expectPolicyCode(operation, code) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(NoteWorkerRpcConcurrencyPolicyError);
    expect(error).toMatchObject({
      name: "NoteWorkerRpcConcurrencyPolicyError",
      message: code,
      code,
    });
    return error;
  }
  throw new Error(`Expected ${code}`);
}

describe("Note worker RPC two-session connection policy", () => {
  it("accepts only a direct Supabase 5432 target and returns redacted evidence", () => {
    const descriptor = validateNoteWorkerRpcConcurrencyDatabaseUrl(
      directUrl(),
      { expectedProjectRef: PREVIEW_REF },
    );

    expect(descriptor).toEqual({
      ok: true,
      policyVersion: "2026-08-23.preview.1",
      connectionMode: "direct",
      projectRef: PREVIEW_REF,
      databaseRole: RUNNER_ROLE,
      hostname: `db.${PREVIEW_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      sslMode: "verify-full",
      sslRootCertificate: "absolute_path_verified",
    });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(JSON.stringify(descriptor)).not.toContain(SECRET);
    expect(JSON.stringify(descriptor)).not.toContain("sslrootcert");
  });

  it("accepts a Supavisor session-mode 5432 target bound by postgres.<ref>", () => {
    expect(
      validateNoteWorkerRpcConcurrencyDatabaseUrl(poolerUrl(), {
        expectedProjectRef: PREVIEW_REF,
      }),
    ).toMatchObject({
      connectionMode: "session_pooler",
      projectRef: PREVIEW_REF,
      databaseRole: RUNNER_ROLE,
      hostname: "aws-0-ap-southeast-2.pooler.supabase.com",
      port: 5432,
    });
  });

  it("accepts only the fixed disposable concurrency login", () => {
    expect(
      validateNoteWorkerRpcConcurrencyDatabaseUrl(
        directUrl(),
        { expectedProjectRef: PREVIEW_REF },
      ),
    ).toMatchObject({ databaseRole: RUNNER_ROLE, connectionMode: "direct" });
    expect(
      validateNoteWorkerRpcConcurrencyDatabaseUrl(
        poolerUrl(),
        { expectedProjectRef: PREVIEW_REF },
      ),
    ).toMatchObject({
      databaseRole: RUNNER_ROLE,
      connectionMode: "session_pooler",
    });
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(
          directUrl({ username: "postgres" }),
          { expectedProjectRef: PREVIEW_REF },
        ),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.credentialsDenied,
    );
  });

  it("requires the exact Management-plane ref at the live-harness boundary", () => {
    expect(parsePreviewDatabaseTarget(directUrl(), PREVIEW_REF)).toMatchObject({
      projectRef: PREVIEW_REF,
      connectionMode: "direct",
    });
    expectPolicyCode(
      () => parsePreviewDatabaseTarget(directUrl(), OTHER_PREVIEW_REF),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.targetMismatch,
    );
    expectPolicyCode(
      () => parsePreviewDatabaseTarget(directUrl()),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.invalidInput,
    );
  });

  it.each([
    directUrl({ ref: PRODUCTION_REF }),
    poolerUrl({ ref: PRODUCTION_REF }),
  ])("hard-rejects the Production project ref", (value) => {
    expectPolicyCode(
      () => validateNoteWorkerRpcConcurrencyDatabaseUrl(value),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.productionTargetDenied,
    );
  });

  it.each([
    directUrl({ port: "6543" }),
    poolerUrl({ port: "6543" }),
    directUrl({ port: "6432" }),
    directUrl().replace(":5432/postgres", "/postgres"),
  ])("rejects transaction pooling, other ports and an implicit port", (value) => {
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(value, {
          expectedProjectRef: PREVIEW_REF,
        }),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.portDenied,
    );
  });

  it.each([
    directUrl({ query: "sslmode=require&sslrootcert=%2Fetc%2Fssl%2Fca.crt" }),
    directUrl({ query: "sslrootcert=%2Fetc%2Fssl%2Fca.crt" }),
    directUrl({ query: "sslmode=verify-full" }),
    directUrl({ query: "sslmode=verify-full&sslrootcert=relative%2Fca.crt" }),
    directUrl({ query: "sslmode=verify-full&sslrootcert=%2Fetc%2F..%2Fca.crt" }),
  ])("requires verify-full and a canonical absolute sslrootcert", (value) => {
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(value, {
          expectedProjectRef: PREVIEW_REF,
        }),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.tlsDenied,
    );
  });

  it.each([
    directUrl({ database: "template1" }),
    directUrl({ database: "postgres/extra" }),
    directUrl({ database: "post%67res" }),
  ])("rejects a non-canonical or wrong database name", (value) => {
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(value, {
          expectedProjectRef: PREVIEW_REF,
        }),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.databaseNameDenied,
    );
  });

  it.each([
    `${directUrl()}&options=-csearch_path%3Dpublic`,
    `${directUrl()}&sslmode=verify-full`,
    `${directUrl()}&dbname=postgres`,
    `${directUrl()}&`,
    `${directUrl()}#override`,
    directUrl({
      query:
        "%73slmode=verify-full&sslrootcert=%2Fetc%2Fssl%2Fca.crt",
    }),
    directUrl({
      query:
        "sslmode=verify-full&sslrootcert=%2Fetc%2Fssl%2Fca.crt%26options%3D-crole%3Dpostgres",
    }),
  ])("rejects duplicate, unknown, fragment and encoded query injection", (value) => {
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(value, {
          expectedProjectRef: PREVIEW_REF,
        }),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied,
    );
  });

  it("rejects unsupported hosts, wrong pooler usernames and target drift", () => {
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(
          poolerUrl({ hostname: "localhost" }),
          { expectedProjectRef: PREVIEW_REF },
        ),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.targetDenied,
    );
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(
          poolerUrl({ hostname: "a.b.pooler.supabase.com" }),
          { expectedProjectRef: PREVIEW_REF },
        ),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.targetDenied,
    );
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(
          poolerUrl({ username: "postgres" }),
          { expectedProjectRef: PREVIEW_REF },
        ),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.credentialsDenied,
    );
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(directUrl(), {
          expectedProjectRef: OTHER_PREVIEW_REF,
        }),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.targetMismatch,
    );
  });

  it("never includes a supplied secret or connection URL in failure evidence", () => {
    const value = `${directUrl()}&options=${SECRET}`;
    const error = expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(value, {
          expectedProjectRef: PREVIEW_REF,
        }),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.queryDenied,
    );

    for (const evidence of [
      error.message,
      error.stack,
      String(error),
      JSON.stringify(error),
    ]) {
      expect(evidence).not.toContain(SECRET);
      expect(evidence).not.toContain("postgresql://");
    }
    expect(Object.keys(error)).toEqual(["name", "code"]);

    const constructed = new NoteWorkerRpcConcurrencyPolicyError(SECRET);
    expect(constructed.code).toBe(
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.invalidInput,
    );
    expect(String(constructed)).not.toContain(SECRET);
  });

  it("exposes a pure offline startup regression gate", () => {
    const expected = {
      ok: true,
      policyVersion: "2026-08-23.preview.1",
      requiredPort: 5432,
      requiredDatabase: "postgres",
      requiredSslMode: "verify-full",
      allowedConnectionModes: ["direct", "session_pooler"],
    };
    expect(assertNoteWorkerRpcConcurrencyPolicyRegression()).toEqual(expected);
    expect(assertConcurrencyPolicyRegression()).toEqual(expected);
    expect(Object.isFrozen(NOTE_WORKER_RPC_CONCURRENCY_POLICY)).toBe(true);
    expect(
      Object.isFrozen(
        NOTE_WORKER_RPC_CONCURRENCY_POLICY.allowedConnectionModes,
      ),
    ).toBe(true);
  });

  it("uses fixed codes for malformed URLs, schemes, credentials and options", () => {
    expectPolicyCode(
      () => validateNoteWorkerRpcConcurrencyDatabaseUrl(" not-a-url "),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.urlInvalid,
    );
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(
          directUrl().replace("postgresql:", "https:"),
        ),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.schemeDenied,
    );
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(
          directUrl({ password: "" }),
        ),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.credentialsDenied,
    );
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(directUrl(), {
          expectedProjectRef: "invalid",
        }),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.invalidInput,
    );
    expectPolicyCode(
      () =>
        validateNoteWorkerRpcConcurrencyDatabaseUrl(directUrl(), {
          expectedProjectRef: PRODUCTION_REF,
        }),
      NOTE_WORKER_RPC_CONCURRENCY_ERROR_CODES.productionTargetDenied,
    );
  });
});
