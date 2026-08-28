import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { describe, expect, it, vi } from "vitest";

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
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_KEY_CUSTODY_SNAPSHOT,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_IDENTITIES_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
} from "./communication-note-preview-key-custody.server";

vi.mock("server-only", () => ({}));

const NOW = "2026-08-28T02:00:00.000Z";

describe("Communication Note M1g-c key custody contract", () => {
  it("stays source-only and literal-pins the M1g-b, five-RPC and three-executor boundary", () => {
    expect([
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_IDENTITIES_READY,
    ]).toEqual([false, false]);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_KEY_CUSTODY_SNAPSHOT,
    ).toBeUndefined();
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION).toBe(
      "custody.communication.openai.synthetic-preview.2026-08-28.m1g-c.v1",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    ).toBe(
      "1f7a3c586155fb4246e40207136cc1e521daedf6f2d01d1f89f7beebfad66438",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY
        .authorityPolicyDigest,
    ).toBe(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST);
    expect(
      Object.values(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES,
      ),
    ).toHaveLength(5);
    expect(
      Object.values(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES),
    ).toHaveLength(3);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS).toHaveLength(
      4,
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.flatMap(
        (mapping) => mapping.rpcNames,
      ),
    ).toEqual(
      Object.values(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES,
      ),
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY.database,
    ).toMatchObject({
      callerLogin: false,
      executorMembershipEnabled: false,
      dataApiAccess: false,
    });
    expect(
      Object.isFrozen(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY,
      ),
    ).toBe(true);
  });

  it("validates one candidate custody object against a supplied verified authorization", () => {
    const fixture = createFixture();
    const result = validate(fixture);

    expect(result.authorizationBinding).toEqual({
      authorizationDigest: fixture.verifiedAuthorization.authorizationDigest,
      runIdHash: fixture.verifiedAuthorization.statement.runIdHash,
      openAiProjectIdHmac:
        fixture.verifiedAuthorization.statement.environmentEvidence
          .openAiProjectIdHmac,
      temporaryCredentialReferenceSha256:
        fixture.verifiedAuthorization.statement.environmentEvidence
          .temporaryCredentialReferenceSha256,
    });
    expect(result.receiptSigner).toMatchObject({
      privateKeyMaterialPresent: false,
      nonExportable: true,
      exportAllowed: false,
      signingScope: "CARESLINK_PREVIEW_RECEIPT_DOMAIN_ONLY",
      genericSigning: "PROHIBITED",
    });
    expect(result.providerCredential).toMatchObject({
      credentialType: "PROJECT_SERVICE_ACCOUNT_API_KEY",
      administrationAllowed: false,
      automaticRenewal: false,
      maximumCalls: 6,
      rawCredentialMaterialPresent: false,
      exportAllowed: false,
    });
    expect(result.callers.map((caller) => caller.callerRole)).toEqual(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.map(
        (mapping) => mapping.callerRole,
      ),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.callers)).toBe(true);
    expect(Object.isFrozen(result.receiptSigner.trustedSigningKey)).toBe(true);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      '"apiKey":',
      '"privateKey":',
      '"requestBody":',
      '"prompt":',
      '"cleanedFacts":',
      '"observable_facts":',
      '"outputText":',
      "Bearer ",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps registry input at candidate-shape status without claiming provenance or freshness", () => {
    const fixture = createFixture();
    const oldCandidate =
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        {
          ...fixture.snapshot,
          ownerTrustRegistry: {
            ...fixture.snapshot.ownerTrustRegistry,
            observedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        { now: NOW, verifiedAuthorization: fixture.verifiedAuthorization },
      );
    expect(oldCandidate.ownerTrustRegistry.observedAt).toBe(
      "2026-01-01T00:00:00.000Z",
    );

    const shapeOnlyDigest =
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        {
          ...fixture.snapshot,
          ownerTrustRegistry: {
            ...fixture.snapshot.ownerTrustRegistry,
            registrySnapshotSha256: hex("3"),
          },
        },
        { now: NOW, verifiedAuthorization: fixture.verifiedAuthorization },
      );
    expect(shapeOnlyDigest.ownerTrustRegistry.registrySnapshotSha256).toBe(
      hex("3"),
    );

    for (const ownerTrustRegistry of [
      {
        ...fixture.snapshot.ownerTrustRegistry,
        observedAt: "2026-08-28T02:00:00.001Z",
      },
      {
        ...fixture.snapshot.ownerTrustRegistry,
        source: "SELF_ASSERTED_KEY",
      },
      {
        ...fixture.snapshot.ownerTrustRegistry,
        privateKeyMaterialPresent: true,
      },
    ]) {
      expectFixedFailure(() =>
        validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
          { ...fixture.snapshot, ownerTrustRegistry },
          { now: NOW, verifiedAuthorization: fixture.verifiedAuthorization },
        ),
      );
    }
  });

  it("requires exact authorization, project and temporary credential bindings", () => {
    const fixture = createFixture();
    for (const snapshot of [
      {
        ...fixture.snapshot,
        authorizationBinding: {
          ...fixture.snapshot.authorizationBinding,
          authorizationDigest: hex("0"),
        },
      },
      {
        ...fixture.snapshot,
        authorizationBinding: {
          ...fixture.snapshot.authorizationBinding,
          runIdHash: hex("0"),
        },
      },
      {
        ...fixture.snapshot,
        providerCredential: {
          ...fixture.snapshot.providerCredential,
          projectIdHmac: hex("0"),
        },
      },
      {
        ...fixture.snapshot,
        providerCredential: {
          ...fixture.snapshot.providerCredential,
          credentialReferenceSha256: hex("4"),
        },
      },
    ]) {
      expectFixedFailure(() =>
        validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
          snapshot,
          {
            now: NOW,
            verifiedAuthorization: fixture.verifiedAuthorization,
          },
        ),
      );
    }
  });

  it("reuses the M1g-b owner and receipt public-key purpose, fingerprint and lifetime checks", () => {
    const fixture = createFixture();
    const { publicKey: rsaPublicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2_048,
    });
    const rsaSpki = rsaPublicKey.export({ format: "der", type: "spki" });
    for (const snapshot of [
      {
        ...fixture.snapshot,
        ownerTrustRegistry: {
          ...fixture.snapshot.ownerTrustRegistry,
          trustedSigningKey: fixture.receiptSigner.trustedKey,
        },
      },
      {
        ...fixture.snapshot,
        receiptSigner: {
          ...fixture.snapshot.receiptSigner,
          trustedSigningKey: {
            ...fixture.snapshot.receiptSigner.trustedSigningKey,
            publicKeySha256: hex("0"),
          },
        },
      },
      {
        ...fixture.snapshot,
        receiptSigner: {
          ...fixture.snapshot.receiptSigner,
          trustedSigningKey: {
            ...fixture.snapshot.receiptSigner.trustedSigningKey,
            expiresAt: "2026-08-28T02:00:00.000Z",
          },
        },
      },
      {
        ...fixture.snapshot,
        receiptSigner: {
          ...fixture.snapshot.receiptSigner,
          trustedSigningKey: {
            ...fixture.snapshot.receiptSigner.trustedSigningKey,
            publicKeySpkiDerBase64: rsaSpki.toString("base64"),
            publicKeySha256:
              createHash("sha256").update(rsaSpki).digest("hex"),
          },
        },
      },
    ]) {
      expectFixedFailure(() =>
        validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
          snapshot,
          {
            now: NOW,
            verifiedAuthorization: fixture.verifiedAuthorization,
          },
        ),
      );
    }
  });

  it("prohibits raw/exportable/admin/renewable/generic authority and scope drift", () => {
    const fixture = createFixture();
    for (const snapshot of [
      {
        ...fixture.snapshot,
        receiptSigner: {
          ...fixture.snapshot.receiptSigner,
          genericSigning: "ALLOWED",
        },
      },
      {
        ...fixture.snapshot,
        receiptSigner: {
          ...fixture.snapshot.receiptSigner,
          privateKeyMaterialPresent: true,
        },
      },
      {
        ...fixture.snapshot,
        providerCredential: {
          ...fixture.snapshot.providerCredential,
          administrationAllowed: true,
        },
      },
      {
        ...fixture.snapshot,
        providerCredential: {
          ...fixture.snapshot.providerCredential,
          automaticRenewal: true,
        },
      },
      {
        ...fixture.snapshot,
        providerCredential: {
          ...fixture.snapshot.providerCredential,
          maximumCalls: 7,
        },
      },
      {
        ...fixture.snapshot,
        callers: fixture.snapshot.callers.map((caller, index) =>
          index === 0
            ? { ...caller, executorMembershipEnabled: true }
            : caller,
        ),
      },
    ]) {
      expectFixedFailure(() =>
        validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
          snapshot,
          {
            now: NOW,
            verifiedAuthorization: fixture.verifiedAuthorization,
          },
        ),
      );
    }
  });

  it("requires four ordered exact caller mappings and pairwise-distinct identities and references", () => {
    const fixture = createFixture();
    const duplicateIdentity = fixture.snapshot.callers.map((caller, index) =>
      index === 1
        ? {
            ...caller,
            identityHmac: fixture.snapshot.callers[0].identityHmac,
          }
        : caller,
    );
    const duplicateReference = fixture.snapshot.callers.map((caller, index) =>
      index === 3
        ? {
            ...caller,
            credentialReferenceSha256:
              fixture.snapshot.callers[2].credentialReferenceSha256,
          }
        : caller,
    );
    for (const callers of [
      [...fixture.snapshot.callers].reverse(),
      duplicateIdentity,
      duplicateReference,
      fixture.snapshot.callers.slice(0, 3),
    ]) {
      expectFixedFailure(() =>
        validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
          { ...fixture.snapshot, callers },
          {
            now: NOW,
            verifiedAuthorization: fixture.verifiedAuthorization,
          },
        ),
      );
    }
  });

  it("enforces independent caller-identity and provider-correlation HMAC domains", () => {
    const fixture = createFixture();
    expect(
      fixture.snapshot.hmacDomains.callerIdentity.version,
    ).not.toBe(fixture.snapshot.hmacDomains.providerCorrelation.version);
    expect(
      fixture.snapshot.hmacDomains.callerIdentity.purpose,
    ).not.toBe(fixture.snapshot.hmacDomains.providerCorrelation.purpose);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION).not.toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
    );

    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        {
          ...fixture.snapshot,
          hmacDomains: {
            ...fixture.snapshot.hmacDomains,
            providerCorrelation: {
              ...fixture.snapshot.hmacDomains.providerCorrelation,
              keyReferenceSha256:
                fixture.snapshot.hmacDomains.callerIdentity.keyReferenceSha256,
            },
          },
        },
        {
          now: NOW,
          verifiedAuthorization: fixture.verifiedAuthorization,
        },
      ),
    );

    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        {
          ...fixture.snapshot,
          receiptSigner: {
            ...fixture.snapshot.receiptSigner,
            custodyReferenceSha256:
              fixture.snapshot.providerCredential.credentialReferenceSha256,
          },
        },
        {
          now: NOW,
          verifiedAuthorization: fixture.verifiedAuthorization,
        },
      ),
    );
  });

  it("rejects accessors, proxies and extra credential material with one non-leaking error", () => {
    const fixture = createFixture();
    const getter = vi.fn(() => 6);
    const accessor = structuredClone(fixture.snapshot);
    Object.defineProperty(accessor.providerCredential, "maximumCalls", {
      enumerable: true,
      get: getter,
    });
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        accessor,
        {
          now: NOW,
          verifiedAuthorization: fixture.verifiedAuthorization,
        },
      ),
    );
    expect(getter).not.toHaveBeenCalled();

    const trapped = new Proxy(fixture.snapshot, {
      getOwnPropertyDescriptor() {
        throw new Error("do-not-leak-proxy-value");
      },
    });
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        trapped,
        {
          now: NOW,
          verifiedAuthorization: fixture.verifiedAuthorization,
        },
      ),
    );

    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        {
          ...fixture.snapshot,
          providerCredential: {
            ...fixture.snapshot.providerCredential,
            apiKey: "forbidden-raw-value",
          },
        },
        {
          now: NOW,
          verifiedAuthorization: fixture.verifiedAuthorization,
        },
      ),
    );
  });
});

function validate(fixture: ReturnType<typeof createFixture>) {
  return validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
    fixture.snapshot,
    {
      now: NOW,
      verifiedAuthorization: fixture.verifiedAuthorization,
    },
  );
}

function createFixture() {
  const ownerSigner = createSigner("OWNER_AUTHORIZATION");
  const receiptSigner = createSigner("CARESLINK_DISPATCH_RECEIPT");
  const statement = createAuthorizationStatement(ownerSigner.trustedKey);
  const signature = signStatement(statement, ownerSigner.privateKey);
  const verifiedAuthorization =
    verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
      { statement, signature },
      {
        trustedKeySnapshot: ownerSigner.trustedKey,
        now: NOW,
        expected: {
          ownerSubjectHmac: statement.ownerSubjectHmac,
          tenantScopeHmac: statement.tenantScopeHmac,
          runIdHash: statement.runIdHash,
        },
      },
    );
  const snapshot = {
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED",
    authorizationBinding: {
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      runIdHash: statement.runIdHash,
      openAiProjectIdHmac: statement.environmentEvidence.openAiProjectIdHmac,
      temporaryCredentialReferenceSha256:
        statement.environmentEvidence.temporaryCredentialReferenceSha256,
    },
    ownerTrustRegistry: {
      source: "EXTERNAL_TRUST_REGISTRY_SNAPSHOT",
      registrySnapshotSha256: hex("a"),
      registryReferenceSha256: hex("e"),
      observedAt: "2026-08-28T01:59:55.000Z",
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
    providerCredential: {
      credentialType: "PROJECT_SERVICE_ACCOUNT_API_KEY",
      projectIdHmac: statement.environmentEvidence.openAiProjectIdHmac,
      serviceAccountIdHmac: hex("d"),
      apiKeyIdHmac: hex("e"),
      credentialReferenceSha256:
        statement.environmentEvidence.temporaryCredentialReferenceSha256,
      scopesEvidenceSha256: hex("f"),
      issuedAt: "2026-08-28T01:58:00.000Z",
      expiresAt: "2026-08-28T02:20:00.000Z",
      revokeBy: "2026-08-28T02:20:00.000Z",
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
        identityHmac: hex(["a", "b", "c", "d"][index]),
        credentialReferenceSha256: hex(String(index + 6)),
        databaseLogin: false,
        executorMembershipEnabled: false,
        rawCredentialMaterialPresent: false,
        exportAllowed: false,
      }),
    ),
  };
  return { ownerSigner, receiptSigner, verifiedAuthorization, snapshot };
}

function createAuthorizationStatement(
  trustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
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
) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const core = {
    keyId:
      purpose === "OWNER_AUTHORIZATION"
        ? "owner-preview-2026-08"
        : "receipt-preview-2026-08",
    publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
    publicKeySha256: createHash("sha256").update(publicKeyDer).digest("hex"),
    status: "ACTIVE",
    notBefore: "2026-08-28T01:00:00.000Z",
    expiresAt: "2026-08-28T03:00:00.000Z",
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

function signStatement(statement: unknown, privateKey: KeyObject) {
  return sign(
    null,
    createCaresLinkV1CommunicationNotePreviewSigningMessage(statement),
    privateKey,
  ).toString("base64url");
}

function expectFixedFailure(callback: () => unknown) {
  expect(callback).toThrowError(
    expect.objectContaining({
      code: "PRODUCT_API_DISABLED",
      message: "Communication Note preview key custody is unavailable",
    }),
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hex(character: string) {
  return character.repeat(64);
}
