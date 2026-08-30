import "server-only";

import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
  createCaresLinkV1CommunicationNotePreviewSigningMessage,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization,
  type CaresLinkV1CommunicationNotePreviewAuthorizationStatement,
  type CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
} from "./communication-note-preview-execution-authority.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
} from "./communication-note-preview-key-custody.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust,
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry,
} from "./communication-note-preview-runner-terminal-trust-composition.server";

export const M1GH_TEST_NOW = "2026-08-28T02:00:00.000Z";

export function createM1ghRunnerTerminalTrustFixture(
  options: Readonly<{ now?: string }> = {},
) {
  const now = requireTimestamp(options.now ?? M1GH_TEST_NOW);
  const ownerSigner = createSigner("OWNER_AUTHORIZATION", now);
  const receiptSigner = createSigner("CARESLINK_DISPATCH_RECEIPT", now);
  const runnerTerminalSigner = createRunnerTerminalSigner(now);
  const authorizationStatement = createAuthorizationStatement(
    ownerSigner.trustedKey,
    now,
  );
  const authorizationSignature = signStatement(
    authorizationStatement,
    ownerSigner.privateKey,
  );
  const verifiedAuthorization =
    verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
      { statement: authorizationStatement, signature: authorizationSignature },
      {
        trustedKeySnapshot: ownerSigner.trustedKey,
        now,
        expected: {
          ownerSubjectHmac: authorizationStatement.ownerSubjectHmac,
          tenantScopeHmac: authorizationStatement.tenantScopeHmac,
          runIdHash: authorizationStatement.runIdHash,
        },
      },
    );
  const custodySnapshot = {
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED",
    authorizationBinding: {
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      runIdHash: authorizationStatement.runIdHash,
      openAiProjectIdHmac:
        authorizationStatement.environmentEvidence.openAiProjectIdHmac,
      temporaryCredentialReferenceSha256:
        authorizationStatement.environmentEvidence
          .temporaryCredentialReferenceSha256,
    },
    ownerTrustRegistry: {
      source: "EXTERNAL_TRUST_REGISTRY_SNAPSHOT",
      registrySnapshotSha256: hex("a"),
      registryReferenceSha256: hex("e"),
      observedAt: shiftTimestamp(now, -5_000),
      trustedSigningKey: ownerSigner.trustedKey,
      privateKeyMaterialPresent: false,
    },
    receiptSigner: {
      trustedSigningKey: receiptSigner.trustedKey,
      keyIdHash: sha256(receiptSigner.trustedKey.keyId),
      publicKeySha256: receiptSigner.trustedKey.publicKeySha256,
      custodyReferenceSha256: hex("f"),
      privateKeyMaterialPresent: false,
      nonExportable: true,
      exportAllowed: false,
      signingScope: "CARESLINK_PREVIEW_RECEIPT_DOMAIN_ONLY",
      genericSigning: "PROHIBITED",
    },
    runnerTerminalSigner: {
      trustedSigningKey: runnerTerminalSigner.trustedKey,
      keyIdHash: sha256(runnerTerminalSigner.trustedKey.keyId),
      publicKeySha256: runnerTerminalSigner.trustedKey.publicKeySha256,
      custodyReferenceSha256: hex("3"),
      privateKeyMaterialPresent: false,
      nonExportable: true,
      exportAllowed: false,
      signingScope: "CARESLINK_PREVIEW_RUNNER_TERMINAL_DOMAIN_ONLY",
      genericSigning: "PROHIBITED",
    },
    providerCredential: {
      credentialType: "PROJECT_SERVICE_ACCOUNT_API_KEY",
      projectIdHmac:
        authorizationStatement.environmentEvidence.openAiProjectIdHmac,
      serviceAccountIdHmac: hex("d"),
      apiKeyIdHmac: hex("e"),
      credentialReferenceSha256:
        authorizationStatement.environmentEvidence
          .temporaryCredentialReferenceSha256,
      scopesEvidenceSha256: hex("f"),
      issuedAt: shiftTimestamp(now, -2 * 60_000),
      expiresAt: shiftTimestamp(now, 20 * 60_000),
      revokeBy: shiftTimestamp(now, 20 * 60_000),
      administrationAllowed: false,
      automaticRenewal: false,
      maximumCalls: 6,
      rawCredentialMaterialPresent: false,
      exportAllowed: false,
    },
    hmacDomains: {
      callerIdentity: {
        algorithm: "HMAC-SHA256",
        purpose: "CARESLINK_PREVIEW_CALLER_IDENTITY",
        version:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION,
        keyReferenceSha256: hex("1"),
        rawHmacKeyMaterialPresent: false,
        exportAllowed: false,
      },
      providerCorrelation: {
        algorithm: "HMAC-SHA256",
        purpose: "OPENAI_PREVIEW_PROVIDER_CORRELATION",
        version:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
        keyReferenceSha256: hex("2"),
        rawHmacKeyMaterialPresent: false,
        exportAllowed: false,
      },
    },
    callers: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.map(
      (mapping, index) => ({
        ...mapping,
        identityHmac: hex(["a", "b", "c", "d", "e"][index] ?? "a"),
        credentialReferenceSha256: hex(
          ["6", "7", "8", "9", "5"][index] ?? "6",
        ),
        databaseLogin: false,
        executorMembershipEnabled: false,
        rawCredentialMaterialPresent: false,
        exportAllowed: false,
      }),
    ),
  };
  const registryCore = {
    source: "EXTERNAL_RUNNER_TERMINAL_TRUST_REGISTRY_SNAPSHOT" as const,
    custodyPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    terminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    registryReferenceSha256: sha256("runner-terminal-registry-reference"),
    signerCustodyReferenceSha256:
      custodySnapshot.runnerTerminalSigner.custodyReferenceSha256,
    observedAt: shiftTimestamp(now, -5_000),
    trustedSigningKey: runnerTerminalSigner.trustedKey,
    privateKeyMaterialPresent: false as const,
  };
  const trustRegistry =
    createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry(
      {
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_REGISTRY",
        ...registryCore,
        registrySnapshotSha256:
          createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest(
            registryCore,
          ),
      },
      { now },
    );
  const trustComposition =
    composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust({
      capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_COMPOSITION",
      trustRegistry,
      custodySnapshot,
      verifiedAuthorization,
      now,
    });
  return {
    ownerSigner,
    receiptSigner,
    runnerTerminalSigner,
    now,
    authorizationStatement,
    authorizationSignature,
    verifiedAuthorization,
    custodySnapshot,
    registryCore,
    trustRegistry,
    trustComposition,
  };
}

export function createM1ghFailedRunnerTerminalEnvelope(
  fixture: ReturnType<typeof createM1ghRunnerTerminalTrustFixture>,
  options: Readonly<{
    claimId?: string;
    reservationId?: string;
    receiptDigest?: string;
    slotIndex?: number;
    fixtureId?: string;
    runOrdinal?: number;
    observedAt?: string;
    failureReason?:
      | "CANCELLED"
      | "PROVIDER_EVIDENCE_INVALID"
      | "GOLDEN_EVALUATION_FAILED"
      | "HUMAN_REVIEW_FAILED"
      | "REPORT_INVALID";
  }> = {},
) {
  const trustedKey = fixture.runnerTerminalSigner.trustedKey;
  const statement = {
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    authorizationDigest: fixture.verifiedAuthorization.authorizationDigest,
    calculatedCostUpperBoundMicroUsd: null,
    candidateDigest: null,
    claimId: options.claimId ?? "11111111-1111-4111-8111-111111111111",
    criticalChecks: null,
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
    failureReason: options.failureReason ?? ("CANCELLED" as const),
    fixtureDigest: null,
    fixtureId: options.fixtureId ?? "communication-m1g-h-1",
    humanReviews: null,
    noRetry: true as const,
    observedAt: options.observedAt ?? shiftTimestamp(fixture.now, -1_000),
    preflightInputTokens: null,
    providerRequestIdHash: null,
    receiptDigest: options.receiptDigest ?? sha256("m1g-h-receipt"),
    receiptProviderCorrelation: null,
    receiptSignatureSha256: null,
    requestBodySha256: null,
    requestBodyUtf8ByteLength: null,
    reservationId:
      options.reservationId ?? "22222222-2222-4222-8222-222222222222",
    runIdHash: fixture.authorizationStatement.runIdHash,
    runOrdinal: options.runOrdinal ?? 1,
    runnerPolicyDigest:
      "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4",
    semanticCanonicalRequestSha256: null,
    signerKeyIdHash: sha256(trustedKey.keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
    signingPurpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
    slotIndex: options.slotIndex ?? 1,
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
    statement,
    signature: sign(
      null,
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage(
        statement,
      ),
      fixture.runnerTerminalSigner.privateKey,
    ).toString("base64url"),
  };
}

export function createM1giAcceptedRunnerTerminalEnvelope(
  fixture: ReturnType<typeof createM1ghRunnerTerminalTrustFixture>,
  options: Readonly<{
    claimId?: string;
    reservationId?: string;
    receiptDigest?: string;
    slotIndex?: number;
    fixtureId?: string;
    runOrdinal?: number;
    observedAt?: string;
    candidateDigest?: string;
    totalTokensReconciliation?: "REPORTED" | "CALCULATED";
    requestBodySha256?: string;
    requestBodyUtf8ByteLength?: number;
    semanticCanonicalRequestSha256?: string;
    receiptSignatureSha256?: string;
    receiptUsage?: Readonly<{
      source: "PROVIDER";
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cachedInputTokens: number;
      reasoningTokens: number;
    }>;
    calculatedCostUpperBoundMicroUsd?: number;
  }> = {},
) {
  const failed = createM1ghFailedRunnerTerminalEnvelope(fixture, options);
  const statement = {
    ...failed.statement,
    state: "ACCEPTED" as const,
    failureReason: null,
    requestBodySha256: options.requestBodySha256 ??
      "98d37d028c742a2e05d079a38e0d6b27fb1fe91a71d397a4bdc9ed607af45213",
    requestBodyUtf8ByteLength: options.requestBodyUtf8ByteLength ?? 2522,
    semanticCanonicalRequestSha256:
      options.semanticCanonicalRequestSha256 ??
        "f404c8f239c20b49a40836a371e928dd6241e95dca598ae8661193443c7c6a68",
    receiptSignatureSha256:
      options.receiptSignatureSha256 ?? sha256("C".repeat(86)),
    fixtureDigest: sha256("m1g-i-accepted-fixture"),
    preflightInputTokens: 128,
    providerRequestIdHash: sha256("m1g-i-provider-request-id"),
    candidateDigest:
      options.candidateDigest ?? sha256("m1g-i-accepted-candidate"),
    usage: {
      source: options.receiptUsage?.source ?? ("PROVIDER" as const),
      inputTokens: options.receiptUsage?.inputTokens ?? 120,
      outputTokens: options.receiptUsage?.outputTokens ?? 80,
      totalTokens: options.receiptUsage?.totalTokens ?? 200,
      totalTokensReconciliation:
        options.totalTokensReconciliation ?? ("REPORTED" as const),
      cachedInputTokens: options.receiptUsage?.cachedInputTokens ?? 20,
      cachedInputTokensReconciliation: "REPORTED" as const,
      reasoningTokens: options.receiptUsage?.reasoningTokens ?? 10,
      reasoningTokensReconciliation: "REPORTED" as const,
    },
    calculatedCostUpperBoundMicroUsd:
      options.calculatedCostUpperBoundMicroUsd ?? 481,
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
  };
  return {
    statement,
    signature: sign(
      null,
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage(
        statement,
      ),
      fixture.runnerTerminalSigner.privateKey,
    ).toString("base64url"),
  };
}

function createAuthorizationStatement(
  trustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  now: string,
): CaresLinkV1CommunicationNotePreviewAuthorizationStatement {
  return {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
    authorizationId: "10000000-0000-4000-8000-000000000001",
    authorizationNonceHash: hex("1"),
    ownerSubjectHmac: hex("2"),
    tenantScopeHmac: hex("3"),
    runIdHash: hex("4"),
    signerKeyIdHash: sha256(trustedKey.keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
    issuedAt: shiftTimestamp(now, -60_000),
    notBefore: shiftTimestamp(now, -30_000),
    expiresAt: shiftTimestamp(now, 14 * 60_000),
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
      temporaryCredentialReferenceSha256: hex("0"),
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

function createSigner(
  purpose: "OWNER_AUTHORIZATION" | "CARESLINK_DISPATCH_RECEIPT",
  now: string,
) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const core = {
    keyId:
      purpose === "OWNER_AUTHORIZATION"
        ? "owner-preview-m1g-h"
        : "receipt-preview-m1g-h",
    publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
    publicKeySha256: createHash("sha256").update(publicKeyDer).digest("hex"),
    status: "ACTIVE",
    notBefore: shiftTimestamp(now, -60 * 60_000),
    expiresAt: shiftTimestamp(now, 60 * 60_000),
  } as const;
  const trustedKey =
    purpose === "OWNER_AUTHORIZATION"
      ? {
          ...core,
          purpose,
          allowedDomain:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
          ownerSubjectHmac: hex("2"),
          tenantScopeHmac: hex("3"),
        }
      : {
          ...core,
          purpose,
          allowedDomain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
          ownerSubjectHmac: null,
          tenantScopeHmac: null,
        };
  return {
    privateKey,
    trustedKey:
      trustedKey satisfies CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  };
}

function createRunnerTerminalSigner(now: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey,
    trustedKey: {
      keyId: "runner-terminal-preview-m1g-h",
      publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
      publicKeySha256: createHash("sha256").update(publicKeyDer).digest("hex"),
      status: "ACTIVE" as const,
      notBefore: shiftTimestamp(now, -60 * 60_000),
      expiresAt: shiftTimestamp(now, 60 * 60_000),
      purpose:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
      allowedDomain:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
    },
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

function requireTimestamp(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError("M1GH_TEST_TIMESTAMP_INVALID");
  }
  return value;
}

function shiftTimestamp(value: string, milliseconds: number) {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}
