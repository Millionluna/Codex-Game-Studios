import { createHash, generateKeyPairSync, sign as signEd25519 } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_SIGNING_KEY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalPersistence,
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage,
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal,
} from "./communication-note-preview-runner-terminal-policy.server";

vi.mock("server-only", () => ({}));

const NOW = "2026-08-29T01:00:00.000Z";

describe("Communication Note M1g-g signed runner terminal policy", () => {
  it("literal-pins the source-only, independent-signature contract", () => {
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
    ).toBe(
      "policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
    ).toBe(
      "runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    ).toBe(
      "d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa",
    );
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY)
      .toMatchObject({
        status: "SOURCE_CONTRACT_ONLY_SIGNED_CALLER_NOT_PROVISIONED",
        capability: "SIGNED_DURABLE_RUNNER_TERMINAL_DATABASE_CONTRACT",
        terminal: {
          attestationTrustRoot: "INDEPENDENT_CARESLINK_ED25519_SIGNED_TERMINAL",
          signatureAlgorithm: "Ed25519",
          signingPurpose: "CARESLINK_RUNNER_TERMINAL",
          allowedDomain: "CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL",
          independentSignaturePersisted: true,
          verifierIdentityHmacIsSignature: false,
        },
        database: {
          callerRole: "careslink_v1_preview_runner_terminal_caller",
          callerShellPresent: true,
          callerExecuteGranted: true,
          runtimeLoginPresent: false,
          runtimeMembershipPresent: false,
          authenticatedRuntimePortReady: false,
          dataApiExecute: false,
        },
      });
    expect(Object.isFrozen(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY,
    )).toBe(true);
  });

  it("keeps readiness and both approvals absent", () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_READY)
      .toBe(false);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POLICY)
      .toBeUndefined();
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_SIGNING_KEY)
      .toBeUndefined();
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalPersistence(),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });

  it("validates only an active, purpose- and domain-scoped Ed25519 key", () => {
    const fixture = createFixture();
    expect(
      validateTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey(
        fixture.trustedKey,
        { now: NOW },
      ),
    ).toEqual(fixture.trustedKey);
    for (const patch of [
      { purpose: "CARESLINK_RECEIPT" },
      { allowedDomain: "OTHER" },
      { publicKeySha256: sha("wrong-fingerprint") },
      { expiresAt: NOW },
      { ownerSubjectHmac: null },
      {
        publicKeySpkiDerBase64: Buffer.alloc(4_096).toString("base64"),
        publicKeySha256: createHash("sha256")
          .update(Buffer.alloc(4_096))
          .digest("hex"),
      },
    ]) {
      expect(() =>
        validateTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey(
          { ...fixture.trustedKey, ...patch },
          { now: NOW },
        ),
      ).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
    }
  });

  it("verifies, freezes and digests an exact 34-key ACCEPTED statement", () => {
    const fixture = createFixture();
    const verified =
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal(
        fixture.envelope,
        { trustedKeySnapshot: fixture.trustedKey, now: NOW },
      );
    expect(Object.keys(verified.statement)).toHaveLength(34);
    expect(verified).toMatchObject({
      statement: fixture.statement,
      runnerTerminalDigest:
        createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest(
          fixture.statement,
        ),
      signature: fixture.envelope.signature,
      authenticity: "EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED",
      verifiedAt: NOW,
    });
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified.statement.usage)).toBe(true);
  });

  it("accepts the exact FAILED null-evidence shape", () => {
    const fixture = createFixture("FAILED");
    expect(
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal(
        fixture.envelope,
        { trustedKeySnapshot: fixture.trustedKey, now: NOW },
      ).statement,
    ).toMatchObject({
      state: "FAILED",
      failureReason: "CANCELLED",
      usage: null,
      criticalChecks: null,
      noRetry: true,
    });
  });

  it("rejects statement drift, signature drift, extra keys and accessors", () => {
    const fixture = createFixture();
    const tampered = structuredClone(fixture.envelope);
    tampered.statement.candidateDigest = sha("tampered-candidate");
    expectInvalid(tampered, fixture.trustedKey);
    expectInvalid(
      {
        ...fixture.envelope,
        signature: `${fixture.envelope.signature.startsWith("A") ? "B" : "A"}${fixture.envelope.signature.slice(1)}`,
      },
      fixture.trustedKey,
    );
    expectInvalid(
      { ...fixture.envelope, extra: true },
      fixture.trustedKey,
    );
    const accessor = Object.defineProperty(
      { signature: fixture.envelope.signature },
      "statement",
      { enumerable: true, get: () => fixture.statement },
    );
    expectInvalid(accessor, fixture.trustedKey);
  });

  it("rejects signer binding, purpose, evidence-nullability and key separation drift", () => {
    const fixture = createFixture();
    for (const patch of [
      { signingPurpose: "CARESLINK_RECEIPT" },
      { signerKeyIdHash: sha("untrusted-key") },
      { failureReason: "CANCELLED" },
      { candidateDigest: null },
      { candidateDigest: fixture.statement.receiptDigest },
    ]) {
      const statement = { ...fixture.statement, ...patch };
      expectInvalid(signEnvelope(statement, fixture.privateKey), fixture.trustedKey);
    }
  });

  it("rejects proxied, accessor-backed, sparse and subclassed review arrays", () => {
    const fixture = createFixture();
    const baseReviews = fixture.statement.humanReviews;
    if (!baseReviews) throw new Error("accepted fixture expected");
    const sparse = [...baseReviews];
    delete sparse[1];
    class ReviewArray extends Array<unknown> {}
    const subclassed = new ReviewArray(...baseReviews);
    const accessor = [...baseReviews];
    Object.defineProperty(accessor, "1", {
      enumerable: true,
      get: () => baseReviews[1],
    });
    for (const humanReviews of [
      new Proxy([...baseReviews], {}),
      sparse,
      subclassed,
      accessor,
    ]) {
      const statement = { ...fixture.statement, humanReviews };
      expectInvalid(signEnvelope(statement, fixture.privateKey), fixture.trustedKey);
    }
  });

  it("pins v2 identifiers and digest into the signed-terminal migration", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260829011323_add_communication_note_preview_signed_terminal_caller_shadow.sql",
      ),
      "utf8",
    );
    for (const pin of [
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
      "EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED",
    ]) {
      expect(migration).toContain(pin);
    }
    expect(migration).not.toContain("__M1GG_TERMINAL_POLICY_DIGEST__");
  });
});

function createFixture(state: "ACCEPTED" | "FAILED" = "ACCEPTED") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const keyId = "runner-terminal-key:test-1";
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
  const common = {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
    signingPurpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
    signerKeyIdHash: sha(keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
    authorityPolicyDigest:
      "7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9",
    runnerPolicyDigest:
      "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4",
    terminalPolicyVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
    terminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    authorizationDigest: sha("authorization"),
    runIdHash: sha("run-id"),
    claimId: "11111111-1111-4111-8111-111111111111",
    reservationId: "22222222-2222-4222-8222-222222222222",
    receiptDigest: sha("receipt"),
    slotIndex: 2,
    fixtureId: "communication-en-1",
    runOrdinal: 1,
    observedAt: "2026-08-29T00:59:59.000Z",
    noRetry: true as const,
  };
  const statement = state === "ACCEPTED"
    ? {
        ...common,
        state: "ACCEPTED" as const,
        failureReason: null,
        requestBodySha256: sha("request-body"),
        requestBodyUtf8ByteLength: 512,
        semanticCanonicalRequestSha256: sha("semantic-request"),
        receiptSignatureSha256: sha("receipt-signature"),
        fixtureDigest: sha("fixture"),
        preflightInputTokens: 128,
        providerRequestIdHash: sha("provider-request-id"),
        candidateDigest: sha("candidate"),
        usage: {
          source: "PROVIDER" as const,
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          totalTokensReconciliation: "REPORTED" as const,
          cachedInputTokens: 0,
          cachedInputTokensReconciliation: "ASSUMED_ZERO" as const,
          reasoningTokens: null,
          reasoningTokensReconciliation: "UNAVAILABLE" as const,
        },
        calculatedCostUpperBoundMicroUsd: 1_234,
        criticalChecks: {
          STRICT_SCHEMA: true as const,
          SHARED_OUTPUT_PRIVACY: true as const,
          DATE_TIME_PARITY: true as const,
          NUMERIC_PARITY: true as const,
          DECISION_LANGUAGE: true as const,
          REFUSAL_ABSENT: true as const,
          HUMAN_SEMANTIC_GROUNDEDNESS: true as const,
        },
        humanReviews: [
          { locale: "en" as const, passed: true as const },
          { locale: "zh-Hans" as const, passed: true as const },
          { locale: "zh-Hant" as const, passed: true as const },
        ],
        receiptProviderCorrelation:
          "UNATTESTED_NO_SHARED_IDENTIFIER" as const,
      }
    : {
        ...common,
        state: "FAILED" as const,
        failureReason: "CANCELLED" as const,
        requestBodySha256: null,
        requestBodyUtf8ByteLength: null,
        semanticCanonicalRequestSha256: null,
        receiptSignatureSha256: null,
        fixtureDigest: null,
        preflightInputTokens: null,
        providerRequestIdHash: null,
        candidateDigest: null,
        usage: null,
        calculatedCostUpperBoundMicroUsd: null,
        criticalChecks: null,
        humanReviews: null,
        receiptProviderCorrelation: null,
      };
  return {
    trustedKey,
    privateKey,
    statement,
    envelope: signEnvelope(statement, privateKey),
  };
}

function signEnvelope(statement: Record<string, unknown>, privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]) {
  return {
    statement,
    signature: signEd25519(
      null,
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage(
        statement,
      ),
      privateKey,
    ).toString("base64url"),
  };
}

function expectInvalid(envelope: unknown, trustedKey: unknown) {
  expect(() =>
    verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal(
      envelope,
      { trustedKeySnapshot: trustedKey, now: NOW },
    ),
  ).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
}

function sha(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
