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
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT_READY,
  createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort,
} from "./communication-note-preview-signed-runner-terminal-runtime-port.server";

vi.mock("server-only", () => ({}));

const NOW = "2026-08-29T01:00:00.000Z";

describe("Communication Note signed runner-terminal runtime port", () => {
  it("verifies first and forwards only a verified terminal to the purpose-scoped database port", async () => {
    const fixture = createFailedFixture();
    const persistVerifiedRunnerTerminal = vi.fn(async (verified) => ({
      created: true,
      runnerTerminalRecorded: true,
      continuationEligible: false,
      runnerTerminalDigest: verified.runnerTerminalDigest,
      state: verified.statement.state,
      recordedAt: NOW,
      status: "RUNNER_TERMINAL_RECORDED",
    }));
    const port = createPort(fixture.trustedKey, persistVerifiedRunnerTerminal);
    const result = await port.persist(fixture.envelope);
    expect(result).toEqual({
      created: true,
      runnerTerminalRecorded: true,
      continuationEligible: false,
      runnerTerminalDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      state: "FAILED",
      recordedAt: NOW,
      status: "RUNNER_TERMINAL_RECORDED",
    });
    expect(Object.keys(result).sort()).toEqual([
      "continuationEligible",
      "created",
      "recordedAt",
      "runnerTerminalDigest",
      "runnerTerminalRecorded",
      "state",
      "status",
    ]);
    expect(persistVerifiedRunnerTerminal).toHaveBeenCalledOnce();
    expect(persistVerifiedRunnerTerminal.mock.calls[0]?.[0]).toMatchObject({
      authenticity: "EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED",
      signature: fixture.envelope.signature,
      verifiedAt: NOW,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("does not reach the database for a tampered signature envelope", async () => {
    const fixture = createFailedFixture();
    const persistVerifiedRunnerTerminal = vi.fn();
    const port = createPort(fixture.trustedKey, persistVerifiedRunnerTerminal);
    const tampered = {
      ...fixture.envelope,
      statement: { ...fixture.envelope.statement, failureReason: "REPORT_INVALID" },
    };
    await expect(port.persist(tampered)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(persistVerifiedRunnerTerminal).not.toHaveBeenCalled();
  });

  it("rejects response drift and a non-purpose-scoped database port", async () => {
    const fixture = createFailedFixture();
    const drifted = vi.fn(async () => ({
      created: true,
      runnerTerminalRecorded: true,
      continuationEligible: true,
      runnerTerminalDigest: sha("wrong"),
      state: "ACCEPTED",
      recordedAt: NOW,
      status: "RUNNER_TERMINAL_RECORDED",
    }));
    await expect(createPort(fixture.trustedKey, drifted).persist(fixture.envelope))
      .rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort({
        capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
        trustedSigningKeySnapshot: fixture.trustedKey,
        databasePort: {
          purpose:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
          callerRole:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
          persistVerifiedRunnerTerminal: vi.fn(),
        },
        clock: { now: () => NOW },
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });

  it("is default-off and rejects expanded factory surfaces", () => {
    const fixture = createFailedFixture();
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT_READY)
      .toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT)
      .toBeUndefined();
    expect(() =>
      createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort({
        capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
        trustedSigningKeySnapshot: fixture.trustedKey,
        databasePort: databasePort(vi.fn()),
        clock: { now: () => NOW },
        url: "postgres://forbidden",
      }),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));

    const source = readFileSync(
      new URL(
        "./communication-note-preview-signed-runner-terminal-runtime-port.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    for (const forbidden of ["process.env", "fetch(", "@supabase/", "postgres://"])
      expect(source).not.toContain(forbidden);
  });

  it("sanitizes injected clock and database failures", async () => {
    const fixture = createFailedFixture();
    const clockFailure = createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort({
      capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
      trustedSigningKeySnapshot: fixture.trustedKey,
      databasePort: databasePort(vi.fn()),
      clock: { now: () => { throw new Error("clock secret"); } },
    });
    const rawDatabaseFailure = createPort(
      fixture.trustedKey,
      vi.fn(async () => { throw new Error("database secret"); }),
    );
    const fixedDatabaseFailure = createPort(
      fixture.trustedKey,
      vi.fn(async () => {
        throw { code: "FORBIDDEN", message: "database authorization secret" };
      }),
    );
    for (const rejection of [
      clockFailure.persist(fixture.envelope),
      rawDatabaseFailure.persist(fixture.envelope),
    ]) {
      await expect(rejection).rejects.toMatchObject({
        code: "PRODUCT_API_DISABLED",
      });
      await expect(rejection).rejects.not.toThrow(/secret/i);
    }
    await expect(fixedDatabaseFailure.persist(fixture.envelope)).rejects
      .toMatchObject({
        code: "FORBIDDEN",
        message: "The runner terminal database operation is not authorized",
      });
  });
});

function createPort(trustedSigningKeySnapshot: unknown, persist: ReturnType<typeof vi.fn>) {
  return createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort({
    capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
    trustedSigningKeySnapshot,
    databasePort: databasePort(persist),
    clock: { now: () => NOW },
  });
}

function databasePort(persistVerifiedRunnerTerminal: ReturnType<typeof vi.fn>) {
  return {
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
    persistVerifiedRunnerTerminal,
  };
}

function createFailedFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const keyId = "runner-terminal-key:runtime-test";
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
    authorizationDigest: sha("runtime-authorization"),
    calculatedCostUpperBoundMicroUsd: null,
    candidateDigest: null,
    claimId: "11111111-1111-4111-8111-111111111111",
    criticalChecks: null,
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
    failureReason: "CANCELLED" as const,
    fixtureDigest: null,
    fixtureId: "communication-runtime-1",
    humanReviews: null,
    noRetry: true as const,
    observedAt: "2026-08-29T00:59:59.000Z",
    preflightInputTokens: null,
    providerRequestIdHash: null,
    receiptDigest: sha("runtime-receipt"),
    receiptProviderCorrelation: null,
    receiptSignatureSha256: null,
    requestBodySha256: null,
    requestBodyUtf8ByteLength: null,
    reservationId: "22222222-2222-4222-8222-222222222222",
    runIdHash: sha("runtime-run-id"),
    runOrdinal: 1,
    runnerPolicyDigest:
      "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4",
    semanticCanonicalRequestSha256: null,
    signerKeyIdHash: sha(keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
    signingPurpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
    slotIndex: 1,
    state: "FAILED" as const,
    terminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    terminalPolicyVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
    usage: null,
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
  };
  return {
    trustedKey,
    envelope: {
      statement,
      signature: signEd25519(
        null,
        createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage(
          statement,
        ),
        privateKey,
      ).toString("base64url"),
    },
  };
}

function sha(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
