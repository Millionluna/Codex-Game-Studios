import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  type CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  type CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
} from "./communication-note-preview-execution-authority.server";
import {
  validateTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey,
  type CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey,
} from "./communication-note-preview-runner-terminal-policy.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

const MAXIMUM_PLAIN_DATA_ARRAY_LENGTH = 256;
const MAXIMUM_PLAIN_DATA_OBJECT_KEY_COUNT = 256;
const MAXIMUM_PLAIN_DATA_DEPTH = 32;
const MAXIMUM_PLAIN_DATA_NODE_COUNT = 4_096;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION =
  "custody.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_READY =
  false as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_IDENTITIES_READY =
  false as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES =
  deepFreeze({
    persistAuthorization:
      "persist_verified_communication_note_preview_authorization",
    revokeAuthorization:
      "revoke_communication_note_preview_authorization",
    claimAuthorization:
      "claim_communication_note_preview_authorization",
    reserveDispatch:
      "reserve_communication_note_preview_dispatch",
    persistReceipt:
      "persist_verified_communication_note_preview_dispatch_receipt",
    persistRunnerTerminal:
      "persist_verified_communication_note_preview_runner_terminal",
  } as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES =
  deepFreeze({
    authorization: "careslink_v1_preview_authorization_executor",
    dispatch: "careslink_v1_preview_dispatch_executor",
    receipt: "careslink_v1_preview_receipt_executor",
    runnerTerminal: "careslink_v1_preview_runner_terminal_executor",
  } as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS =
  deepFreeze([
    {
      purpose: "AUTHORIZATION_REGISTRATION",
      callerRole:
        "careslink_v1_preview_authorization_registration_caller",
      executorRole:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES.authorization,
      rpcNames: [
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES
          .persistAuthorization,
      ],
    },
    {
      purpose: "AUTHORIZATION_REVOCATION",
      callerRole: "careslink_v1_preview_authorization_revocation_caller",
      executorRole:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES.authorization,
      rpcNames: [
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES
          .revokeAuthorization,
      ],
    },
    {
      purpose: "DISPATCH",
      callerRole: "careslink_v1_preview_dispatch_caller",
      executorRole:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES.dispatch,
      rpcNames: [
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES
          .claimAuthorization,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES
          .reserveDispatch,
      ],
    },
    {
      purpose: "RECEIPT_PERSISTENCE",
      callerRole: "careslink_v1_preview_receipt_caller",
      executorRole:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES.receipt,
      rpcNames: [
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES
          .persistReceipt,
      ],
    },
    {
      purpose: "RUNNER_TERMINAL_PERSISTENCE",
      callerRole: "careslink_v1_preview_runner_terminal_caller",
      executorRole:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES.runnerTerminal,
      rpcNames: [
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES
          .persistRunnerTerminal,
      ],
    },
  ] as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION =
  "hmac.communication-note.preview-caller-identity.2026-08-28.m1g-c.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION =
  "hmac.communication-note.preview-provider-correlation.2026-08-28.m1g-c.v1" as const;

const KEY_CUSTODY_POLICY_CORE = deepFreeze({
  version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
  status: "SOURCE_CONTRACT_ONLY_NO_APPROVED_CUSTODY_OR_CALLER_CREDENTIALS",
  authorityPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  database: {
    schema: "careslink_v1_generation",
    rpcNames:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CUSTODY_RPC_NAMES,
    executorRoles:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTOR_ROLES,
    callerMappings:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
    callerLogin: false,
    executorMembershipEnabled: false,
    dataApiAccess: false,
  },
  ownerTrust: {
    source: "EXTERNAL_TRUST_REGISTRY_SNAPSHOT",
    purpose: "OWNER_AUTHORIZATION",
    privateKeyMaterialPresent: false,
  },
  receiptSigning: {
    purpose: "CARESLINK_DISPATCH_RECEIPT",
    signingScope: "CARESLINK_PREVIEW_RECEIPT_DOMAIN_ONLY",
    privateKeyMaterialPresent: false,
    nonExportable: true,
    exportAllowed: false,
    genericSigning: "PROHIBITED",
  },
  runnerTerminalSigning: {
    purpose: "CARESLINK_RUNNER_TERMINAL",
    signingScope: "CARESLINK_PREVIEW_RUNNER_TERMINAL_DOMAIN_ONLY",
    privateKeyMaterialPresent: false,
    nonExportable: true,
    exportAllowed: false,
    genericSigning: "PROHIBITED",
    signerSeparation: "DISTINCT_FROM_OWNER_AND_RECEIPT_SIGNERS",
  },
  providerCredential: {
    credentialType: "PROJECT_SERVICE_ACCOUNT_API_KEY",
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
      rawHmacKeyMaterialPresent: false,
      exportAllowed: false,
    },
    providerCorrelation: {
      algorithm: "HMAC-SHA256",
      purpose: "OPENAI_PREVIEW_PROVIDER_CORRELATION",
      version:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
      rawHmacKeyMaterialPresent: false,
      exportAllowed: false,
    },
    domainSeparation: "DISTINCT_PURPOSE_VERSION_AND_KEY_REFERENCE_REQUIRED",
  },
} as const);

export type CaresLinkV1CommunicationNotePreviewKeyCustodyPolicy =
  typeof KEY_CUSTODY_POLICY_CORE & Readonly<{ policyDigest: string }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST =
  "f537dc64e3c57a34b6db6d0d1c871c38a70bcb51c4d071e625b026f840a309ca" as const;

if (
  createCanonicalSha256(KEY_CUSTODY_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY =
  deepFreeze({
    ...KEY_CUSTODY_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  }) satisfies CaresLinkV1CommunicationNotePreviewKeyCustodyPolicy;

type OwnerTrustRegistrySnapshot = Readonly<{
  source: "EXTERNAL_TRUST_REGISTRY_SNAPSHOT";
  registrySnapshotSha256: string;
  registryReferenceSha256: string;
  observedAt: string;
  trustedSigningKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey;
  privateKeyMaterialPresent: false;
}>;

type ReceiptSignerCustody = Readonly<{
  trustedSigningKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey;
  keyIdHash: string;
  publicKeySha256: string;
  custodyReferenceSha256: string;
  privateKeyMaterialPresent: false;
  nonExportable: true;
  exportAllowed: false;
  signingScope: "CARESLINK_PREVIEW_RECEIPT_DOMAIN_ONLY";
  genericSigning: "PROHIBITED";
}>;

type RunnerTerminalSignerCustody = Readonly<{
  trustedSigningKey:
    CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey;
  keyIdHash: string;
  publicKeySha256: string;
  custodyReferenceSha256: string;
  privateKeyMaterialPresent: false;
  nonExportable: true;
  exportAllowed: false;
  signingScope: "CARESLINK_PREVIEW_RUNNER_TERMINAL_DOMAIN_ONLY";
  genericSigning: "PROHIBITED";
}>;

type ProjectCredentialCustody = Readonly<{
  credentialType: "PROJECT_SERVICE_ACCOUNT_API_KEY";
  projectIdHmac: string;
  serviceAccountIdHmac: string;
  apiKeyIdHmac: string;
  credentialReferenceSha256: string;
  scopesEvidenceSha256: string;
  issuedAt: string;
  expiresAt: string;
  revokeBy: string;
  administrationAllowed: false;
  automaticRenewal: false;
  maximumCalls: 6;
  rawCredentialMaterialPresent: false;
  exportAllowed: false;
}>;

type HmacDomainCustody = Readonly<{
  algorithm: "HMAC-SHA256";
  purpose:
    | "CARESLINK_PREVIEW_CALLER_IDENTITY"
    | "OPENAI_PREVIEW_PROVIDER_CORRELATION";
  version:
    | typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION
    | typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION;
  keyReferenceSha256: string;
  rawHmacKeyMaterialPresent: false;
  exportAllowed: false;
}>;

type CallerIdentityCustody = Readonly<{
  purpose:
    (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS)[number]["purpose"];
  callerRole:
    (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS)[number]["callerRole"];
  executorRole:
    (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS)[number]["executorRole"];
  rpcNames: readonly string[];
  identityHmac: string;
  credentialReferenceSha256: string;
  databaseLogin: false;
  executorMembershipEnabled: false;
  rawCredentialMaterialPresent: false;
  exportAllowed: false;
}>;

export type CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot =
  Readonly<{
    version:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION;
    policyDigest:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST;
    authorityPolicyDigest:
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST;
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED";
    authorizationBinding: Readonly<{
      authorizationDigest: string;
      runIdHash: string;
      openAiProjectIdHmac: string;
      temporaryCredentialReferenceSha256: string;
    }>;
    ownerTrustRegistry: OwnerTrustRegistrySnapshot;
    receiptSigner: ReceiptSignerCustody;
    runnerTerminalSigner: RunnerTerminalSignerCustody;
    providerCredential: ProjectCredentialCustody;
    hmacDomains: Readonly<{
      callerIdentity: HmacDomainCustody;
      providerCorrelation: HmacDomainCustody;
    }>;
    callers: readonly CallerIdentityCustody[];
  }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_KEY_CUSTODY_SNAPSHOT =
  undefined as
    | CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot
    | undefined;

/**
 * Validates content-free custody evidence for a future disposable Preview.
 * This function accepts no raw credential or private-key material, performs no
 * lookup or signing, and does not make the default-off source contract live.
 */
export function validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
  snapshot: unknown,
  options: Readonly<{
    now: string;
    verifiedAuthorization:
      CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
  }>,
): CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot {
  try {
    assertPlainDataTree(snapshot);
    assertPlainDataTree(options);
    return validateSnapshot(snapshot, options);
  } catch {
    throw unavailable();
  }
}

function validateSnapshot(
  value: unknown,
  options: Readonly<{
    now: string;
    verifiedAuthorization:
      CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
  }>,
): CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot {
  const optionRecord = exactDataRecord(options, [
    "now",
    "verifiedAuthorization",
  ]);
  const now = requireTimestamp(optionRecord.now);
  const verifiedAuthorization = validateVerifiedAuthorization(
    optionRecord.verifiedAuthorization,
  );
  const object = exactDataRecord(value, [
    "version",
    "policyDigest",
    "authorityPolicyDigest",
    "status",
    "authorizationBinding",
    "ownerTrustRegistry",
    "receiptSigner",
    "runnerTerminalSigner",
    "providerCredential",
    "hmacDomains",
    "callers",
  ]);
  if (
    object.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION ||
    object.policyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST ||
    object.authorityPolicyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST ||
    object.status !== "TEST_ONLY_CANDIDATE_NOT_APPROVED"
  ) {
    throw unavailable();
  }

  const ownerTrustRegistry = validateOwnerTrustRegistry(
    object.ownerTrustRegistry,
    now,
  );
  const reverifiedAuthorization =
    verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
      {
        statement: verifiedAuthorization.statement,
        signature: verifiedAuthorization.signature,
      },
      {
        trustedKeySnapshot: ownerTrustRegistry.trustedSigningKey,
        now: new Date(now).toISOString(),
        expected: {
          ownerSubjectHmac:
            verifiedAuthorization.statement.ownerSubjectHmac,
          tenantScopeHmac:
            verifiedAuthorization.statement.tenantScopeHmac,
          runIdHash: verifiedAuthorization.statement.runIdHash,
        },
      },
    );
  if (
    verifiedAuthorization.authorizationDigest !==
      reverifiedAuthorization.authorizationDigest ||
    verifiedAuthorization.signatureSha256 !==
      reverifiedAuthorization.signatureSha256 ||
    verifiedAuthorization.authenticity !==
      reverifiedAuthorization.authenticity
  ) {
    throw unavailable();
  }

  const authorizationBinding = validateAuthorizationBinding(
    object.authorizationBinding,
    verifiedAuthorization,
  );
  const receiptSigner = validateReceiptSigner(object.receiptSigner, now);
  if (
    Date.parse(receiptSigner.trustedSigningKey.notBefore) >
      Date.parse(verifiedAuthorization.statement.issuedAt) ||
    Date.parse(receiptSigner.trustedSigningKey.expiresAt) <
      Date.parse(verifiedAuthorization.statement.expiresAt)
  ) {
    throw unavailable();
  }
  const runnerTerminalSigner = validateRunnerTerminalSigner(
    object.runnerTerminalSigner,
    now,
  );
  if (
    Date.parse(runnerTerminalSigner.trustedSigningKey.notBefore) >
      Date.parse(verifiedAuthorization.statement.issuedAt) ||
    Date.parse(runnerTerminalSigner.trustedSigningKey.expiresAt) <
      Date.parse(verifiedAuthorization.statement.expiresAt)
  ) {
    throw unavailable();
  }
  const providerCredential = validateProviderCredential(
    object.providerCredential,
    now,
    verifiedAuthorization,
  );
  const hmacDomains = validateHmacDomains(object.hmacDomains);
  const callers = validateCallers(object.callers);

  const callerBindings = callers.flatMap((caller) => [
    caller.identityHmac,
    caller.credentialReferenceSha256,
  ]);
  const custodyReferences = [
    ownerTrustRegistry.registryReferenceSha256,
    receiptSigner.custodyReferenceSha256,
    runnerTerminalSigner.custodyReferenceSha256,
    providerCredential.credentialReferenceSha256,
    hmacDomains.callerIdentity.keyReferenceSha256,
    hmacDomains.providerCorrelation.keyReferenceSha256,
    ...callers.map((caller) => caller.credentialReferenceSha256),
  ];
  if (
    new Set(callerBindings).size !== callerBindings.length ||
    new Set(custodyReferences).size !== custodyReferences.length ||
    hmacDomains.callerIdentity.keyReferenceSha256 ===
      hmacDomains.providerCorrelation.keyReferenceSha256 ||
    hmacDomains.callerIdentity.purpose ===
      hmacDomains.providerCorrelation.purpose ||
    hmacDomains.callerIdentity.version ===
      hmacDomains.providerCorrelation.version ||
    new Set([
      createTextSha256(ownerTrustRegistry.trustedSigningKey.keyId),
      receiptSigner.keyIdHash,
      runnerTerminalSigner.keyIdHash,
    ]).size !== 3 ||
    new Set([
      ownerTrustRegistry.trustedSigningKey.publicKeySha256,
      receiptSigner.publicKeySha256,
      runnerTerminalSigner.publicKeySha256,
    ]).size !== 3
  ) {
    throw unavailable();
  }

  return deepFreeze({
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED" as const,
    authorizationBinding,
    ownerTrustRegistry,
    receiptSigner,
    runnerTerminalSigner,
    providerCredential,
    hmacDomains,
    callers,
  });
}

function validateVerifiedAuthorization(
  value: unknown,
): CaresLinkV1VerifiedCommunicationNotePreviewAuthorization {
  const object = exactDataRecord(value, [
    "statement",
    "authorizationDigest",
    "signature",
    "signatureSha256",
    "authenticity",
    "verifiedAt",
  ]);
  const statement = exactDataRecord(object.statement, [
    "domain",
    "version",
    "authorizationId",
    "authorizationNonceHash",
    "ownerSubjectHmac",
    "tenantScopeHmac",
    "runIdHash",
    "signerKeyIdHash",
    "signerPublicKeySha256",
    "issuedAt",
    "notBefore",
    "expiresAt",
    "sourceBindings",
    "environmentEvidence",
    "budget",
    "input",
    "slots",
  ]);
  const environmentEvidence = exactDataRecord(statement.environmentEvidence, [
    "openAiProjectIdHmac",
    "australiaProjectConfigurationSha256",
    "zeroDataRetentionConfigurationSha256",
    "modifiedRetentionAmendmentSha256",
    "ownerProcessingAcknowledgementSha256",
    "pricingAndModelAvailabilitySha256",
    "providerSpendLimitSha256",
    "temporaryCredentialReferenceSha256",
  ]);
  if (
    object.authenticity !== "EXTERNAL_OWNER_ED25519_VERIFIED" ||
    typeof object.signature !== "string" ||
    requireSha256(object.authorizationDigest) !==
      createCanonicalSha256(object.statement) ||
    requireSha256(object.signatureSha256) !==
      createTextSha256(object.signature)
  ) {
    throw unavailable();
  }
  requireTimestamp(object.verifiedAt);
  requireSha256(statement.runIdHash);
  requireSha256(environmentEvidence.openAiProjectIdHmac);
  requireSha256(environmentEvidence.temporaryCredentialReferenceSha256);
  return value as CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
}

function validateAuthorizationBinding(
  value: unknown,
  verified: CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
) {
  const object = exactDataRecord(value, [
    "authorizationDigest",
    "runIdHash",
    "openAiProjectIdHmac",
    "temporaryCredentialReferenceSha256",
  ]);
  const evidence = verified.statement.environmentEvidence;
  const result = {
    authorizationDigest: requireSha256(object.authorizationDigest),
    runIdHash: requireSha256(object.runIdHash),
    openAiProjectIdHmac: requireSha256(object.openAiProjectIdHmac),
    temporaryCredentialReferenceSha256: requireSha256(
      object.temporaryCredentialReferenceSha256,
    ),
  };
  if (
    result.authorizationDigest !== verified.authorizationDigest ||
    result.runIdHash !== verified.statement.runIdHash ||
    result.openAiProjectIdHmac !== evidence.openAiProjectIdHmac ||
    result.temporaryCredentialReferenceSha256 !==
      evidence.temporaryCredentialReferenceSha256
  ) {
    throw unavailable();
  }
  return deepFreeze(result);
}

function validateOwnerTrustRegistry(value: unknown, now: number) {
  const object = exactDataRecord(value, [
    "source",
    "registrySnapshotSha256",
    "registryReferenceSha256",
    "observedAt",
    "trustedSigningKey",
    "privateKeyMaterialPresent",
  ]);
  const observedAt = requireTimestamp(object.observedAt);
  if (
    object.source !== "EXTERNAL_TRUST_REGISTRY_SNAPSHOT" ||
    object.privateKeyMaterialPresent !== false ||
    observedAt > now
  ) {
    throw unavailable();
  }
  return deepFreeze({
    source: "EXTERNAL_TRUST_REGISTRY_SNAPSHOT" as const,
    registrySnapshotSha256: requireSha256(object.registrySnapshotSha256),
    registryReferenceSha256: requireSha256(object.registryReferenceSha256),
    observedAt: new Date(observedAt).toISOString(),
    trustedSigningKey:
      validateTestOnlyCaresLinkV1CommunicationNotePreviewTrustedSigningKey(
        object.trustedSigningKey,
        {
          now: new Date(now).toISOString(),
          expectedPurpose: "OWNER_AUTHORIZATION",
        },
      ),
    privateKeyMaterialPresent: false as const,
  });
}

function validateReceiptSigner(value: unknown, now: number) {
  const object = exactDataRecord(value, [
    "trustedSigningKey",
    "keyIdHash",
    "publicKeySha256",
    "custodyReferenceSha256",
    "privateKeyMaterialPresent",
    "nonExportable",
    "exportAllowed",
    "signingScope",
    "genericSigning",
  ]);
  if (
    object.privateKeyMaterialPresent !== false ||
    object.nonExportable !== true ||
    object.exportAllowed !== false ||
    object.signingScope !== "CARESLINK_PREVIEW_RECEIPT_DOMAIN_ONLY" ||
    object.genericSigning !== "PROHIBITED"
  ) {
    throw unavailable();
  }
  const trustedSigningKey =
    validateTestOnlyCaresLinkV1CommunicationNotePreviewTrustedSigningKey(
      object.trustedSigningKey,
      {
        now: new Date(now).toISOString(),
        expectedPurpose: "CARESLINK_DISPATCH_RECEIPT",
      },
    );
  const keyIdHash = requireSha256(object.keyIdHash);
  const publicKeySha256 = requireSha256(object.publicKeySha256);
  if (
    keyIdHash !== createTextSha256(trustedSigningKey.keyId) ||
    publicKeySha256 !== trustedSigningKey.publicKeySha256
  ) {
    throw unavailable();
  }
  return deepFreeze({
    trustedSigningKey,
    keyIdHash,
    publicKeySha256,
    custodyReferenceSha256: requireSha256(object.custodyReferenceSha256),
    privateKeyMaterialPresent: false as const,
    nonExportable: true as const,
    exportAllowed: false as const,
    signingScope: "CARESLINK_PREVIEW_RECEIPT_DOMAIN_ONLY" as const,
    genericSigning: "PROHIBITED" as const,
  });
}

function validateRunnerTerminalSigner(value: unknown, now: number) {
  const object = exactDataRecord(value, [
    "trustedSigningKey",
    "keyIdHash",
    "publicKeySha256",
    "custodyReferenceSha256",
    "privateKeyMaterialPresent",
    "nonExportable",
    "exportAllowed",
    "signingScope",
    "genericSigning",
  ]);
  if (
    object.privateKeyMaterialPresent !== false ||
    object.nonExportable !== true ||
    object.exportAllowed !== false ||
    object.signingScope !==
      "CARESLINK_PREVIEW_RUNNER_TERMINAL_DOMAIN_ONLY" ||
    object.genericSigning !== "PROHIBITED"
  ) {
    throw unavailable();
  }
  const trustedSigningKey =
    validateTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey(
      object.trustedSigningKey,
      { now: new Date(now).toISOString() },
    );
  const keyIdHash = requireSha256(object.keyIdHash);
  const publicKeySha256 = requireSha256(object.publicKeySha256);
  if (
    keyIdHash !== createTextSha256(trustedSigningKey.keyId) ||
    publicKeySha256 !== trustedSigningKey.publicKeySha256
  ) {
    throw unavailable();
  }
  return deepFreeze({
    trustedSigningKey,
    keyIdHash,
    publicKeySha256,
    custodyReferenceSha256: requireSha256(object.custodyReferenceSha256),
    privateKeyMaterialPresent: false as const,
    nonExportable: true as const,
    exportAllowed: false as const,
    signingScope:
      "CARESLINK_PREVIEW_RUNNER_TERMINAL_DOMAIN_ONLY" as const,
    genericSigning: "PROHIBITED" as const,
  });
}

function validateProviderCredential(
  value: unknown,
  now: number,
  verified: CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
) {
  const object = exactDataRecord(value, [
    "credentialType",
    "projectIdHmac",
    "serviceAccountIdHmac",
    "apiKeyIdHmac",
    "credentialReferenceSha256",
    "scopesEvidenceSha256",
    "issuedAt",
    "expiresAt",
    "revokeBy",
    "administrationAllowed",
    "automaticRenewal",
    "maximumCalls",
    "rawCredentialMaterialPresent",
    "exportAllowed",
  ]);
  const issuedAt = requireTimestamp(object.issuedAt);
  const expiresAt = requireTimestamp(object.expiresAt);
  const revokeBy = requireTimestamp(object.revokeBy);
  const projectIdHmac = requireSha256(object.projectIdHmac);
  const serviceAccountIdHmac = requireSha256(object.serviceAccountIdHmac);
  const apiKeyIdHmac = requireSha256(object.apiKeyIdHmac);
  const credentialReferenceSha256 = requireSha256(
    object.credentialReferenceSha256,
  );
  if (
    object.credentialType !== "PROJECT_SERVICE_ACCOUNT_API_KEY" ||
    object.administrationAllowed !== false ||
    object.automaticRenewal !== false ||
    object.maximumCalls !== 6 ||
    object.rawCredentialMaterialPresent !== false ||
    object.exportAllowed !== false ||
    issuedAt > now ||
    now >= expiresAt ||
    revokeBy !== expiresAt ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 30 * 60 * 1_000 ||
    issuedAt > Date.parse(verified.statement.issuedAt) ||
    expiresAt < Date.parse(verified.statement.expiresAt) ||
    projectIdHmac !==
      verified.statement.environmentEvidence.openAiProjectIdHmac ||
    credentialReferenceSha256 !==
      verified.statement.environmentEvidence.temporaryCredentialReferenceSha256 ||
    new Set([projectIdHmac, serviceAccountIdHmac, apiKeyIdHmac]).size !== 3
  ) {
    throw unavailable();
  }
  return deepFreeze({
    credentialType: "PROJECT_SERVICE_ACCOUNT_API_KEY" as const,
    projectIdHmac,
    serviceAccountIdHmac,
    apiKeyIdHmac,
    credentialReferenceSha256,
    scopesEvidenceSha256: requireSha256(object.scopesEvidenceSha256),
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    revokeBy: new Date(revokeBy).toISOString(),
    administrationAllowed: false as const,
    automaticRenewal: false as const,
    maximumCalls: 6 as const,
    rawCredentialMaterialPresent: false as const,
    exportAllowed: false as const,
  });
}

function validateHmacDomains(value: unknown) {
  const object = exactDataRecord(value, [
    "callerIdentity",
    "providerCorrelation",
  ]);
  return deepFreeze({
    callerIdentity: validateHmacDomain(
      object.callerIdentity,
      "CARESLINK_PREVIEW_CALLER_IDENTITY",
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION,
    ),
    providerCorrelation: validateHmacDomain(
      object.providerCorrelation,
      "OPENAI_PREVIEW_PROVIDER_CORRELATION",
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
    ),
  });
}

function validateHmacDomain(
  value: unknown,
  purpose: HmacDomainCustody["purpose"],
  version: HmacDomainCustody["version"],
) {
  const object = exactDataRecord(value, [
    "algorithm",
    "purpose",
    "version",
    "keyReferenceSha256",
    "rawHmacKeyMaterialPresent",
    "exportAllowed",
  ]);
  if (
    object.algorithm !== "HMAC-SHA256" ||
    object.purpose !== purpose ||
    object.version !== version ||
    object.rawHmacKeyMaterialPresent !== false ||
    object.exportAllowed !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    algorithm: "HMAC-SHA256" as const,
    purpose,
    version,
    keyReferenceSha256: requireSha256(object.keyReferenceSha256),
    rawHmacKeyMaterialPresent: false as const,
    exportAllowed: false as const,
  });
}

function validateCallers(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.length
  ) {
    throw unavailable();
  }
  return deepFreeze(
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.map(
      (mapping, index) => validateCaller(value[index], mapping),
    ),
  );
}

function validateCaller(
  value: unknown,
  mapping:
    (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS)[number],
) {
  const object = exactDataRecord(value, [
    "purpose",
    "callerRole",
    "executorRole",
    "rpcNames",
    "identityHmac",
    "credentialReferenceSha256",
    "databaseLogin",
    "executorMembershipEnabled",
    "rawCredentialMaterialPresent",
    "exportAllowed",
  ]);
  if (
    object.purpose !== mapping.purpose ||
    object.callerRole !== mapping.callerRole ||
    object.executorRole !== mapping.executorRole ||
    !canonicalEqual(object.rpcNames, mapping.rpcNames) ||
    object.databaseLogin !== false ||
    object.executorMembershipEnabled !== false ||
    object.rawCredentialMaterialPresent !== false ||
    object.exportAllowed !== false
  ) {
    throw unavailable();
  }
  return deepFreeze({
    purpose: mapping.purpose,
    callerRole: mapping.callerRole,
    executorRole: mapping.executorRole,
    rpcNames: mapping.rpcNames,
    identityHmac: requireSha256(object.identityHmac),
    credentialReferenceSha256: requireSha256(
      object.credentialReferenceSha256,
    ),
    databaseLogin: false as const,
    executorMembershipEnabled: false as const,
    rawCredentialMaterialPresent: false as const,
    exportAllowed: false as const,
  });
}

function exactDataRecord<const Key extends string>(
  value: unknown,
  expectedKeys: readonly Key[],
): Record<Key, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw unavailable();
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const names = Object.getOwnPropertyNames(value).sort();
  const wanted = [...expectedKeys].sort();
  if (
    names.length !== wanted.length ||
    names.some((name, index) => name !== wanted[index])
  ) {
    throw unavailable();
  }
  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function assertPlainDataTree(value: unknown): void {
  assertPlainDataNode(
    value,
    { seen: new Set<object>(), nodeCount: 0 },
    0,
  );
}

function assertPlainDataNode(
  value: unknown,
  state: { seen: Set<object>; nodeCount: number },
  depth: number,
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (
    !value ||
    typeof value !== "object" ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  state.nodeCount += 1;
  if (
    depth > MAXIMUM_PLAIN_DATA_DEPTH ||
    state.nodeCount > MAXIMUM_PLAIN_DATA_NODE_COUNT ||
    state.seen.has(value)
  ) {
    throw unavailable();
  }
  state.seen.add(value);
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > MAXIMUM_PLAIN_DATA_ARRAY_LENGTH ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      throw unavailable();
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expectedNames = [
      ...Array.from({ length: value.length }, (_, index) => String(index)),
      "length",
    ].sort();
    const names = Object.keys(descriptors).sort();
    if (
      names.length !== expectedNames.length ||
      names.some((name, index) => name !== expectedNames[index])
    ) {
      throw unavailable();
    }
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined ||
        (name === "length"
          ? descriptor.value !== value.length || descriptor.enumerable
          : !descriptor.enumerable)
      ) {
        throw unavailable();
      }
      assertPlainDataNode(descriptor.value, state, depth + 1);
    }
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length > MAXIMUM_PLAIN_DATA_OBJECT_KEY_COUNT) {
    throw unavailable();
  }
  for (const descriptor of Object.values(descriptors)) {
    if (
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw unavailable();
    }
    assertPlainDataNode(descriptor.value, state, depth + 1);
  }
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw unavailable();
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw unavailable();
  }
  return timestamp;
}

function canonicalEqual(left: unknown, right: unknown) {
  try {
    return (
      stringifyCaresLinkV1CanonicalJson(left) ===
      stringifyCaresLinkV1CanonicalJson(right)
    );
  } catch {
    return false;
  }
}

function createCanonicalSha256(value: unknown) {
  return createTextSha256(stringifyCaresLinkV1CanonicalJson(value));
}

function createTextSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note preview key custody is unavailable",
  );
}
