import { createHash, generateKeyPairSync, sign as signEd25519 } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
} from "./communication-note-preview-key-custody.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POSTGRES_PORT,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort,
} from "./communication-note-preview-runner-terminal-postgres.server";

vi.mock("server-only", () => ({}));

const NOW = "2026-08-29T01:00:00.000Z";
const VERIFIER_IDENTITY_HMAC = sha("runner-terminal-postgres-verifier");

describe("Communication Note runner-terminal Postgres adapter", () => {
  it("uses one fixed SQL statement and injects its verifier identity binding", async () => {
    const verified = createVerifiedFixture();
    const data = Object.freeze({ opaque: "database-envelope" });
    const query = vi.fn(async () => ({ rows: [{ data }] }));
    const port = createPort(query);
    await expect(port.persistVerifiedRunnerTerminal(verified)).resolves.toBe(data);
    expect(query).toHaveBeenCalledWith(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
      [verified.statement, verified.signature, VERIFIER_IDENTITY_HMAC],
    );
    expect(Object.keys(port).sort()).toEqual([
      "callerRole",
      "persistVerifiedRunnerTerminal",
      "purpose",
    ]);
    expect(port.purpose).toBe("RUNNER_TERMINAL_PERSISTENCE");
    expect(port.purpose).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    );
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS[4])
      .toMatchObject({
        purpose: port.purpose,
        callerRole: port.callerRole,
        executorRole: "careslink_v1_preview_runner_terminal_executor",
        rpcNames: [
          "persist_verified_communication_note_preview_runner_terminal",
        ],
      });
    expect(port).not.toHaveProperty("verifierIdentityHmac");
  });

  it("requires the unforgeable identity of a policy-verified terminal", async () => {
    const verified = createVerifiedFixture();
    const query = vi.fn();
    const port = createPort(query);
    const forged = { ...verified };
    await expect(
      (port.persistVerifiedRunnerTerminal as (value: unknown) => PromiseLike<unknown>)(
        forged,
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "42501", message: "secret-denial" }, "FORBIDDEN"],
    [{ code: "P0001", message: "RUNNER_TERMINAL_CONFLICT" }, "IDEMPOTENCY_CONFLICT"],
    [{ code: "P0001", message: "RUNNER_TERMINAL_BINDING_INVALID" }, "INVALID_STATE_TRANSITION"],
    [{ code: "P0001", message: "VALIDATION_ERROR" }, "VALIDATION_ERROR"],
    [{ code: "XX000", message: "database-secret" }, "PRODUCT_API_DISABLED"],
  ] as const)("maps database failures to fixed product errors", async (failure, code) => {
    const verified = createVerifiedFixture();
    const query = vi.fn(async () => {
      throw Object.assign(new Error(failure.message), failure);
    });
    const rejection = createPort(query).persistVerifiedRunnerTerminal(verified);
    await expect(rejection).rejects.toMatchObject({ code });
    await expect(rejection).rejects.not.toThrow(/secret/i);
  });

  it("rejects proxied/accessor-backed row envelopes without invoking traps", async () => {
    const verified = createVerifiedFixture();
    const proxyTrap = vi.fn(() => {
      throw new Error("proxy secret");
    });
    const proxyRows = new Proxy([{ data: {} }], { get: proxyTrap });
    await expect(
      createPort(vi.fn(async () => ({ rows: proxyRows })))
        .persistVerifiedRunnerTerminal(verified),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(proxyTrap).not.toHaveBeenCalled();

    const accessor = Object.defineProperty({}, "data", {
      enumerable: true,
      get: () => {
        throw new Error("accessor secret");
      },
    });
    await expect(
      createPort(vi.fn(async () => ({ rows: [accessor] })))
        .persistVerifiedRunnerTerminal(verified),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("sanitizes thrown proxies and keeps the adapter source-only/default-off", async () => {
    const verified = createVerifiedFixture();
    const thrownProxy = new Proxy({}, {
      get: () => {
        throw new Error("proxy error secret");
      },
    });
    await expect(
      createPort(vi.fn(async () => { throw thrownProxy; }))
        .persistVerifiedRunnerTerminal(verified),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_READY)
      .toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POSTGRES_PORT)
      .toBeUndefined();
    const source = readFileSync(
      new URL(
        "./communication-note-preview-runner-terminal-postgres.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    for (const forbidden of [
      "process.env",
      "fetch(",
      "@supabase/",
      "postgres://",
      "createClient(",
    ]) expect(source).not.toContain(forbidden);
  });

  it("rejects expanded connection/factory inputs", () => {
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
        capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
        callerIdentity: createCallerIdentity(),
        queryPort: { query: vi.fn() },
        connectionString: "postgres://forbidden",
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
        capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
        callerIdentity: {
          ...createCallerIdentity(),
          purpose:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
        },
        queryPort: { query: vi.fn() },
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
        capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
        callerIdentity: {
          ...createCallerIdentity(),
          credentialReferenceSha256: VERIFIER_IDENTITY_HMAC,
        },
        queryPort: { query: vi.fn() },
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });
});

function createPort(query: (...args: never[]) => PromiseLike<unknown>) {
  return createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort({
    capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
    callerIdentity: createCallerIdentity(),
    queryPort: { query },
  });
}

function createCallerIdentity() {
  return {
    purpose: "RUNNER_TERMINAL_PERSISTENCE" as const,
    callerRole: "careslink_v1_preview_runner_terminal_caller" as const,
    executorRole: "careslink_v1_preview_runner_terminal_executor" as const,
    rpcNames: [
      "persist_verified_communication_note_preview_runner_terminal",
    ] as const,
    identityHmac: VERIFIER_IDENTITY_HMAC,
    credentialReferenceSha256: sha("runner-terminal-credential-reference"),
    databaseLogin: false as const,
    executorMembershipEnabled: false as const,
    rawCredentialMaterialPresent: false as const,
    exportAllowed: false as const,
  };
}

function createVerifiedFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const keyId = "runner-terminal-key:postgres-test";
  const trustedKey = {
    keyId,
    publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
    publicKeySha256: createHash("sha256").update(publicKeyDer).digest("hex"),
    status: "ACTIVE" as const,
    notBefore: "2026-08-28T00:00:00.000Z",
    expiresAt: "2026-08-30T00:00:00.000Z",
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
    allowedDomain:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
  };
  const statement = {
    authorityPolicyDigest:
      "7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9",
    authorizationDigest: sha("postgres-authorization"),
    calculatedCostUpperBoundMicroUsd: null,
    candidateDigest: null,
    claimId: "11111111-1111-4111-8111-111111111111",
    criticalChecks: null,
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
    failureReason: "CANCELLED",
    fixtureDigest: null,
    fixtureId: "communication-postgres-1",
    humanReviews: null,
    noRetry: true,
    observedAt: "2026-08-29T00:59:59.000Z",
    preflightInputTokens: null,
    providerRequestIdHash: null,
    receiptDigest: sha("postgres-receipt"),
    receiptProviderCorrelation: null,
    receiptSignatureSha256: null,
    requestBodySha256: null,
    requestBodyUtf8ByteLength: null,
    reservationId: "22222222-2222-4222-8222-222222222222",
    runIdHash: sha("postgres-run-id"),
    runOrdinal: 1,
    runnerPolicyDigest:
      "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4",
    semanticCanonicalRequestSha256: null,
    signerKeyIdHash: sha(keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
    signingPurpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
    slotIndex: 1,
    state: "FAILED",
    terminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    terminalPolicyVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
    usage: null,
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
  };
  const envelope = {
    statement,
    signature: signEd25519(
      null,
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage(
        statement,
      ),
      privateKey,
    ).toString("base64url"),
  };
  return verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal(
    envelope,
    { trustedKeySnapshot: trustedKey, now: NOW },
  );
}

function sha(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
