import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_OWNER_SIGNING_KEY,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RECEIPT_SIGNING_KEY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTION_AUTHORITY_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_ATTESTATION_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION,
  createCaresLinkV1CommunicationNotePreviewSigningMessage,
  createCaresLinkV1CommunicationNotePreviewStatementDigest,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt,
  type CaresLinkV1CommunicationNotePreviewAuthorizationStatement,
  type CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement,
  type CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
} from "./communication-note-preview-execution-authority.server";

vi.mock("server-only", () => ({}));

const NOW = "2026-08-28T02:00:00.000Z";
const AUTHORIZATION_ID = "10000000-0000-4000-8000-000000000001";
const CLAIM_ID = "20000000-0000-4000-8000-000000000001";
const RESERVATION_ID = "30000000-0000-4000-8000-000000000001";

describe("Communication Note M1g-b execution authority", () => {
  it("remains source-only with no approved trust key or paid execution latch", () => {
    expect([
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTION_AUTHORITY_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_ATTESTATION_READY,
    ]).toEqual([false, false]);
    expect([
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_OWNER_SIGNING_KEY,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RECEIPT_SIGNING_KEY,
    ]).toEqual([undefined, undefined]);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY.status)
      .toBe("SOURCE_CONTRACT_ONLY_NO_APPROVED_KEYS_OR_EXECUTION_PATH");
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST)
      .toBe(
        "7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9",
      );
    expect(Object.isFrozen(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY,
    )).toBe(true);
  });

  it("verifies one exact external-owner Ed25519 authorization against an external key snapshot", () => {
    const signer = createOwnerSigner("owner-preview-2026-08");
    const statement = createAuthorizationStatement(signer.trustedKey);
    const signature = signStatement(statement, signer.privateKey);
    const result =
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        { statement, signature },
        authorizationVerificationOptions(signer.trustedKey),
      );

    expect(result).toEqual({
      statement,
      authorizationDigest:
        createCaresLinkV1CommunicationNotePreviewStatementDigest(statement),
      signature,
      signatureSha256: sha256(signature),
      authenticity: "EXTERNAL_OWNER_ED25519_VERIFIED",
      verifiedAt: NOW,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.statement.slots)).toBe(true);
  });

  it("rejects statement drift even when an attacker recomputes the plain SHA-256", () => {
    const signer = createOwnerSigner("owner-preview-2026-08");
    const statement = createAuthorizationStatement(signer.trustedKey);
    const signature = signStatement(statement, signer.privateKey);
    const tampered = {
      ...statement,
      budget: { ...statement.budget, maximumCostMicroUsd: 250_001 },
    };

    expect(
      createCaresLinkV1CommunicationNotePreviewStatementDigest(tampered),
    ).not.toBe(
      createCaresLinkV1CommunicationNotePreviewStatementDigest(statement),
    );
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        { statement: tampered, signature },
        authorizationVerificationOptions(signer.trustedKey),
      ),
    ).toThrow(/budget/i);

    const sourceTamper = {
      ...statement,
      sourceBindings: {
        ...statement.sourceBindings,
        runnerPolicyDigest: hex("f"),
      },
    };
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        { statement: sourceTamper, signature },
        authorizationVerificationOptions(signer.trustedKey),
      ),
    ).toThrow(/source binding/i);

    const nonCanonicalUuid = {
      ...statement,
      authorizationId: "A0000000-0000-4000-8000-000000000001",
    };
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        {
          statement: nonCanonicalUuid,
          signature: signStatement(nonCanonicalUuid, signer.privateKey),
        },
        authorizationVerificationOptions(signer.trustedKey),
      ),
    ).toThrow(/authorization identifier/i);
  });

  it("rejects reordered slots, a seventh slot and a body-pin drift", () => {
    const signer = createOwnerSigner("owner-preview-2026-08");
    const statement = createAuthorizationStatement(signer.trustedKey);
    for (const slots of [
      [statement.slots[1], statement.slots[0], ...statement.slots.slice(2)],
      [...statement.slots, statement.slots[0]],
      statement.slots.map((slot, index) =>
        index === 0 ? { ...slot, requestBodySha256: hex("e") } : slot),
    ]) {
      expect(() =>
        verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
          {
            statement: { ...statement, slots },
            signature: signStatement(
              { ...statement, slots },
              signer.privateKey,
            ),
          },
          authorizationVerificationOptions(signer.trustedKey),
        ),
      ).toThrow(/slots/i);
    }
  });

  it("rejects envelope-provided key substitution, inactive keys and unsafe time windows", () => {
    const signer = createOwnerSigner("owner-preview-2026-08");
    const attacker = createOwnerSigner("attacker-preview-2026-08");
    const statement = createAuthorizationStatement(signer.trustedKey);
    const signature = signStatement(statement, signer.privateKey);

    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        { statement, signature, publicKey: attacker.trustedKey },
        authorizationVerificationOptions(signer.trustedKey),
      ),
    ).toThrow(/envelope/i);
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        { statement, signature },
        authorizationVerificationOptions(attacker.trustedKey),
      ),
    ).toThrow(/signing key/i);
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        { statement, signature },
        {
          trustedKeySnapshot: {
            ...signer.trustedKey,
            expiresAt: "2026-08-28T01:59:59.999Z",
          },
          now: NOW,
          expected: authorizationExpectedBinding(statement),
        },
      ),
    ).toThrow(/not active/i);
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        { statement, signature },
        {
          trustedKeySnapshot: {
            ...signer.trustedKey,
            ownerSubjectHmac: true,
          } as unknown as CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
          now: NOW,
          expected: authorizationExpectedBinding(statement),
        },
      ),
    ).toThrow(/key scope/i);

    const tooLong = {
      ...statement,
      expiresAt: "2026-08-28T02:20:00.000Z",
    };
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        {
          statement: tooLong,
          signature: signStatement(tooLong, signer.privateKey),
        },
        authorizationVerificationOptions(signer.trustedKey),
      ),
    ).toThrow(/time window/i);
  });

  it("separates owner and receipt key purposes and binds owner, tenant and run scope", () => {
    const ownerSigner = createOwnerSigner("owner-preview-2026-08");
    const receiptSigner = createReceiptSigner("receipt-preview-2026-08");
    const authorization = createAuthorizationStatement(ownerSigner.trustedKey);
    const receipt = createReceiptStatement(receiptSigner.trustedKey);

    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        {
          statement: authorization,
          signature: signStatement(authorization, ownerSigner.privateKey),
        },
        {
          ...authorizationVerificationOptions(ownerSigner.trustedKey),
          expected: {
            ...authorizationExpectedBinding(authorization),
            tenantScopeHmac: hex("e"),
          },
        },
      ),
    ).toThrow(/trusted execution scope/i);
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
        {
          statement: {
            ...authorization,
            signerKeyIdHash: sha256(receiptSigner.trustedKey.keyId),
            signerPublicKeySha256: receiptSigner.trustedKey.publicKeySha256,
          },
          signature: signStatement(
            {
              ...authorization,
              signerKeyIdHash: sha256(receiptSigner.trustedKey.keyId),
              signerPublicKeySha256: receiptSigner.trustedKey.publicKeySha256,
            },
            receiptSigner.privateKey,
          ),
        },
        {
          trustedKeySnapshot: receiptSigner.trustedKey,
          now: NOW,
          expected: authorizationExpectedBinding(authorization),
        },
      ),
    ).toThrow(/trusted signing key/i);
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        {
          statement: {
            ...receipt,
            signerKeyIdHash: sha256(ownerSigner.trustedKey.keyId),
            signerPublicKeySha256: ownerSigner.trustedKey.publicKeySha256,
          },
          signature: signStatement(
            {
              ...receipt,
              signerKeyIdHash: sha256(ownerSigner.trustedKey.keyId),
              signerPublicKeySha256: ownerSigner.trustedKey.publicKeySha256,
            },
            ownerSigner.privateKey,
          ),
        },
        {
          trustedKeySnapshot: ownerSigner.trustedKey,
          now: NOW,
          expected: expectedReceiptBinding(receipt),
        },
      ),
    ).toThrow(/trusted signing key/i);
  });

  it("verifies a separately signed completed dispatch observation with three distinct correlation bindings", () => {
    const receiptSigner = createReceiptSigner("receipt-preview-2026-08");
    const statement = createReceiptStatement(receiptSigner.trustedKey);
    const signature = signStatement(statement, receiptSigner.privateKey);
    const result =
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        { statement, signature },
        {
          trustedKeySnapshot: receiptSigner.trustedKey,
          now: NOW,
          expected: expectedReceiptBinding(statement),
        },
      );

    expect(result.authenticity).toBe(
      "CARESLINK_ED25519_DISPATCH_OBSERVATION_VERIFIED",
    );
    expect(result.providerAttestation).toBe("ABSENT");
    expect(result.statement.transport.openAiRequestIdHmac).toBe(hex("a"));
    expect(result.statement.transport.openAiResponseIdHmac).toBe(hex("b"));
    expect(result.statement.clientRequestIdHmac).toBe(hex("c"));
    expect(new Set([
      result.statement.transport.openAiRequestIdHmac,
      result.statement.transport.openAiResponseIdHmac,
      result.statement.clientRequestIdHmac,
    ]).size).toBe(3);
    expect(result.statement.notProofOf).toEqual([
      "EXACT_PROVIDER_RECEIPT",
      "BILLING",
      "MODEL_EXECUTION",
      "EXACTLY_ONCE",
    ]);
  });

  it("rejects receipt drift despite a recomputed integrity digest and enforces reservation binding", () => {
    const signer = createReceiptSigner("receipt-preview-2026-08");
    const statement = createReceiptStatement(signer.trustedKey);
    const signature = signStatement(statement, signer.privateKey);
    const tampered = { ...statement, slotIndex: 1 };
    expect(
      createCaresLinkV1CommunicationNotePreviewStatementDigest(tampered),
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        { statement: tampered, signature },
        {
          trustedKeySnapshot: signer.trustedKey,
          now: NOW,
          expected: expectedReceiptBinding(statement),
        },
      ),
    ).toThrow(/slot/i);

    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        { statement, signature },
        {
          trustedKeySnapshot: signer.trustedKey,
          now: NOW,
          expected: {
            ...expectedReceiptBinding(statement),
            reservationId: "30000000-0000-4000-8000-000000000002",
          },
        },
      ),
    ).toThrow(/durable reservation/i);

    const secondSlot = withReceiptSlot(statement, 1);
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        {
          statement: secondSlot,
          signature: signStatement(secondSlot, signer.privateKey),
        },
        {
          trustedKeySnapshot: signer.trustedKey,
          now: NOW,
          expected: expectedReceiptBinding(statement),
        },
      ),
    ).toThrow(/durable reservation/i);
  });

  it("enforces terminal outcome shapes and permanently no-retry receipt semantics", () => {
    const signer = createReceiptSigner("receipt-preview-2026-08");
    const completed = createReceiptStatement(signer.trustedKey);
    const cases: unknown[] = [
      {
        ...completed,
        outcome: "TRANSPORT_AMBIGUOUS",
        usage: null,
        calculatedCostUpperBoundMicroUsd: null,
        transport: {
          httpStatus: 200,
          openAiRequestIdHmac: hex("a"),
          openAiResponseIdHmac: null,
        },
      },
      {
        ...completed,
        outcome: "LOCAL_PRE_DISPATCH_ABORTED",
        usage: null,
        calculatedCostUpperBoundMicroUsd: 0,
        transport: {
          httpStatus: null,
          openAiRequestIdHmac: null,
          openAiResponseIdHmac: null,
        },
      },
      {
        ...completed,
        outcome: "PROVIDER_HTTP_ERROR",
        usage: null,
        calculatedCostUpperBoundMicroUsd: null,
        transport: {
          httpStatus: 429,
          openAiRequestIdHmac: hex("a"),
          openAiResponseIdHmac: null,
        },
      },
    ];
    for (const statement of cases) {
      expect(() =>
        verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
          { statement, signature: signStatement(statement, signer.privateKey) },
          {
            trustedKeySnapshot: signer.trustedKey,
            now: NOW,
            expected: expectedReceiptBinding(
              statement as CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement,
            ),
          },
        ),
      ).not.toThrow();
    }

    const duplicateCorrelation = {
      ...completed,
      outcome: "TRANSPORT_AMBIGUOUS",
      usage: null,
      calculatedCostUpperBoundMicroUsd: null,
      transport: {
        httpStatus: 200,
        openAiRequestIdHmac: completed.clientRequestIdHmac,
        openAiResponseIdHmac: null,
      },
    };
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        {
          statement: duplicateCorrelation,
          signature: signStatement(duplicateCorrelation, signer.privateKey),
        },
        {
          trustedKeySnapshot: signer.trustedKey,
          now: NOW,
          expected: expectedReceiptBinding(completed),
        },
      ),
    ).toThrow(/transport/i);

    const wrongCost = {
      ...completed,
      calculatedCostUpperBoundMicroUsd: 480,
    };
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        {
          statement: wrongCost,
          signature: signStatement(wrongCost, signer.privateKey),
        },
        {
          trustedKeySnapshot: signer.trustedKey,
          now: NOW,
          expected: expectedReceiptBinding(completed),
        },
      ),
    ).toThrow(/cost/i);
  });

  it("keeps signed statements content-free and excludes raw provider correlation IDs", () => {
    const signer = createReceiptSigner("receipt-preview-2026-08");
    const receipt = createReceiptStatement(signer.trustedKey);
    const serialized = JSON.stringify(receipt).toLowerCase();
    for (const forbidden of [
      "cleanedfacts",
      "observable_facts",
      "prompt",
      '"requestbody":',
      "authorization:",
      "bearer ",
      "api key",
      "x-request-id",
      "response.id",
      "resp_",
      "req_",
      "candidate",
      "outputtext",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const contentBearingReceipt = {
      ...receipt,
      outputText: "synthetic content must still be rejected",
    };
    expect(() =>
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewDispatchReceipt(
        {
          statement: contentBearingReceipt,
          signature: signStatement(contentBearingReceipt, signer.privateKey),
        },
        {
          trustedKeySnapshot: signer.trustedKey,
          now: NOW,
          expected: expectedReceiptBinding(receipt),
        },
      ),
    ).toThrow(/receipt statement/i);
  });
});

function createAuthorizationStatement(
  trustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
): CaresLinkV1CommunicationNotePreviewAuthorizationStatement {
  return {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
    authorizationId: AUTHORIZATION_ID,
    authorizationNonceHash: hex("1"),
    ownerSubjectHmac: hex("2"),
    tenantScopeHmac: hex("3"),
    runIdHash: hex("4"),
    signerKeyIdHash: sha256(trustedKey.keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
    issuedAt: "2026-08-28T01:59:00.000Z",
    notBefore: "2026-08-28T01:59:30.000Z",
    expiresAt: "2026-08-28T02:14:00.000Z",
    sourceBindings:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
    environmentEvidence: {
      openAiProjectIdHmac: hex("5"),
      australiaProjectConfigurationSha256: hex("6"),
      zeroDataRetentionConfigurationSha256: hex("7"),
      modifiedRetentionAmendmentSha256: hex("8"),
      ownerProcessingAcknowledgementSha256: hex("9"),
      pricingAndModelAvailabilitySha256: hex("a"),
      providerSpendLimitSha256: hex("b"),
      temporaryCredentialReferenceSha256: hex("c"),
    },
    budget: {
      currency: "USD",
      maximumCalls: 6,
      maximumAttemptsPerSlot: 1,
      automaticRetry: false,
      fallbackModel: null,
      maximumInputTokensPerCall: 10_000,
      maximumOutputTokensPerCall: 2_400,
      maximumProjectedCostMicroUsdPerCall: 20_130,
      projectedCostMicroUsd: 120_780,
      maximumCostMicroUsd: 250_000,
      pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1",
      costNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE",
    },
    input: {
      classification: "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY",
      realCareDataAllowed: false,
    },
    slots: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  };
}

function createReceiptStatement(
  trustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
): CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement {
  const slot = CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS[0];
  return {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION,
    authorizationDigest: hex("d"),
    claimId: CLAIM_ID,
    runIdHash: hex("4"),
    reservationId: RESERVATION_ID,
    slotIndex: slot.slotIndex,
    fixtureId: slot.fixtureId,
    runOrdinal: slot.runOrdinal,
    requestBodySha256: slot.requestBodySha256,
    requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
    semanticCanonicalRequestSha256:
      slot.semanticCanonicalRequestSha256,
    clientRequestIdHmac: hex("c"),
    outcome: "COMPLETED",
    transport: {
      httpStatus: 200,
      openAiRequestIdHmac: hex("a"),
      openAiResponseIdHmac: hex("b"),
    },
    usage: {
      source: "PROVIDER",
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      cachedInputTokens: 20,
      reasoningTokens: 0,
    },
    calculatedCostUpperBoundMicroUsd: 481,
    observedAt: "2026-08-28T02:00:00.000Z",
    noRetry: true,
    authenticity: "CARESLINK_SIGNED_INTERNAL_OBSERVATION",
    providerAttestation: "ABSENT",
    transportScope: "APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION",
    notProofOf: [
      "EXACT_PROVIDER_RECEIPT",
      "BILLING",
      "MODEL_EXECUTION",
      "EXACTLY_ONCE",
    ],
    signerKeyIdHash: sha256(trustedKey.keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
  };
}

function expectedReceiptBinding(
  statement: CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement,
) {
  return {
    authorizationDigest: statement.authorizationDigest,
    claimId: statement.claimId,
    runIdHash: statement.runIdHash,
    reservationId: statement.reservationId,
    slotIndex: statement.slotIndex,
    fixtureId: statement.fixtureId,
    runOrdinal: statement.runOrdinal,
    requestBodySha256: statement.requestBodySha256,
    requestBodyUtf8ByteLength: statement.requestBodyUtf8ByteLength,
    semanticCanonicalRequestSha256:
      statement.semanticCanonicalRequestSha256,
    clientRequestIdHmac: statement.clientRequestIdHmac,
    reservedAt: "2026-08-28T01:59:59.000Z",
  };
}

function authorizationExpectedBinding(
  statement: CaresLinkV1CommunicationNotePreviewAuthorizationStatement,
) {
  return {
    ownerSubjectHmac: statement.ownerSubjectHmac,
    tenantScopeHmac: statement.tenantScopeHmac,
    runIdHash: statement.runIdHash,
  };
}

function authorizationVerificationOptions(
  trustedKey: Extract<
    CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
    { purpose: "OWNER_AUTHORIZATION" }
  >,
) {
  return {
    trustedKeySnapshot: trustedKey,
    now: NOW,
    expected: {
      ownerSubjectHmac: trustedKey.ownerSubjectHmac,
      tenantScopeHmac: trustedKey.tenantScopeHmac,
      runIdHash: hex("4"),
    },
  };
}

function createOwnerSigner(keyId: string) {
  const material = createSigningMaterial();
  return {
    privateKey: material.privateKey,
    trustedKey: {
      ...material.trustedKeyCore,
      keyId,
      purpose: "OWNER_AUTHORIZATION",
      allowedDomain:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
      ownerSubjectHmac: hex("2"),
      tenantScopeHmac: hex("3"),
    } as const satisfies CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  };
}

function createReceiptSigner(keyId: string) {
  const material = createSigningMaterial();
  return {
    privateKey: material.privateKey,
    trustedKey: {
      ...material.trustedKeyCore,
      keyId,
      purpose: "CARESLINK_DISPATCH_RECEIPT",
      allowedDomain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
      ownerSubjectHmac: null,
      tenantScopeHmac: null,
    } as const satisfies CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  };
}

function createSigningMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey,
    trustedKeyCore: {
    publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
    publicKeySha256: createHash("sha256").update(publicKeyDer).digest("hex"),
    status: "ACTIVE",
    notBefore: "2026-08-28T01:00:00.000Z",
    expiresAt: "2026-08-28T03:00:00.000Z",
    } as const,
  };
}

function withReceiptSlot(
  statement: CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement,
  slotIndex: number,
) {
  const slot = CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS[slotIndex];
  if (!slot) throw new Error("test slot is missing");
  return {
    ...statement,
    slotIndex: slot.slotIndex,
    fixtureId: slot.fixtureId,
    runOrdinal: slot.runOrdinal,
    requestBodySha256: slot.requestBodySha256,
    requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
    semanticCanonicalRequestSha256: slot.semanticCanonicalRequestSha256,
  };
}

function signStatement(statement: unknown, privateKey: KeyObject) {
  return sign(
    null,
    createCaresLinkV1CommunicationNotePreviewSigningMessage(statement),
    privateKey,
  ).toString("base64url");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hex(character: string) {
  return character.repeat(64);
}
